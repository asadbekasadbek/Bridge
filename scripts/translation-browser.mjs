import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSpeechFixture } from "./speech-fixture.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", { paths: [process.env.BRIDGE_PLAYWRIGHT_ROOT || process.cwd()] }));
const profile = await mkdtemp(join(tmpdir(), "bridge-translation-")), root = await mkdtemp(join(tmpdir(), "bridge-translation-extension-"));
const extensionPath = await createSpeechFixture(fileURLToPath(new URL("../extension/", import.meta.url)), join(root, "extension"));
const translationFile = join(extensionPath, "platforms/local-translation.js");
await writeFile(translationFile, `
const testMode = new URL(location.href).searchParams.get('translator');
globalThis.Translator = testMode === 'absent' ? undefined : {
  async availability() { return testMode === 'unavailable' ? 'unavailable' : 'downloadable'; },
  async create(options) {
    document.body.dataset.translatorCreates = String(Number(document.body.dataset.translatorCreates || 0) + 1);
    if (testMode === 'blocked') throw new DOMException('activation', 'NotAllowedError');
    options.monitor(new EventTarget());
    if (testMode === 'gap') {
      const cue = document.querySelector('[data-purpose="captions-cue-text"]'), parent = cue.parentElement;
      cue.remove();
      await new Promise(resolve => setTimeout(resolve, 1100));
      document.body.dataset.translationReadyInGap = 'true';
      setTimeout(() => parent.append(cue), 900);
    }
    return { destroy() {}, async translate(text) {
      document.body.dataset.translationInput = text;
      document.body.dataset.translationStarted = 'true';
      if (testMode === 'slow') await new Promise(resolve => setTimeout(resolve, 1200));
      return options.targetLanguage === 'de' ? 'Dies ist eine lokale Übersetzung.' : 'Сначала я пытался ответить каждому человеку отдельно.';
    } };
  }
};
${await readFile(translationFile, "utf8")}`);
const output = fileURLToPath(new URL("../test-results/", import.meta.url)); await mkdir(output, { recursive: true });
const wav = Buffer.alloc(44 + 16000 * 90);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
const html = (await readFile(new URL("../tests/fixtures/platform.html", import.meta.url), "utf8")).replace("__BRIDGE_AUDIO__", `data:audio/wav;base64,${wav.toString("base64")}`);
const context = await chromium.launchPersistentContext(profile, { channel: "chromium", headless: true, viewport: { width: 1280, height: 900 }, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, "--no-first-run", "--mute-audio"] });
const errors = [], results = [];
try {
  context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  await worker.evaluate(() => {
    globalThis.translationSpeech = [];
    chrome.tts.getVoices = callback => callback([{ voiceName: "Milena", lang: "ru-RU", gender: "female", remote: false }, { voiceName: "German", lang: "de-DE", remote: false }]);
    chrome.tts.stop = () => {};
    chrome.tts.speak = (text, options, callback) => { globalThis.translationSpeech.push({ text, lang: options.lang }); callback(); options.onEvent({ type: "start" }); globalThis.endTranslationSpeech = () => options.onEvent({ type: "end" }); };
  });
  await context.route(/^https:\/\//, route => route.fulfill({ contentType: "text/html", body: html }));
  async function open(mode, translator = 'mock') {
    await worker.evaluate(() => new Promise(resolve => chrome.storage.local.set({ bridgeSettings: { schemaVersion: 6, language: "ru-RU", sourceLanguage: "auto", voiceName: "", voiceGender: "any", showSubtitles: false } }, () => { globalThis.translationSpeech = []; resolve(); })));
    const page = await context.newPage(); await page.goto(`https://www.udemy.com/course/bridge/learn/lecture/1?mode=${mode}&translator=${translator}`);
    await page.locator('.bridge-youtube-toggle:not([disabled])').click(); return page;
  }
  async function speech(count = 1) {
    for (let i = 0; i < 120; i++) { if ((await worker.evaluate(() => globalThis.translationSpeech)).length >= count) return; await new Promise(resolve => setTimeout(resolve, 60)); }
    console.log(await context.pages().at(-1).locator('body').innerText()); console.log(await context.pages().at(-1).locator('body').getAttribute('data-translator-creates')); assert.fail('Переведённая фраза не передана голосу');
  }
  for (const mode of ['native-en', 'missing', 'dom-unknown', 'unknown', 'udemy-shaka', 'udemy-gap', 'udemy-late']) {
    const page = await open(mode, mode === 'udemy-gap' ? 'gap' : 'mock');
    if (mode === 'udemy-gap') {
      await page.waitForFunction(() => document.body.dataset.translationReadyInGap === 'true');
      assert.doesNotMatch(await page.locator('#bridge-youtube-status').textContent(), /не передал|Повторим выбор/);
    }
    await speech();
    const spoken = (await worker.evaluate(() => globalThis.translationSpeech))[0];
    assert.match(spoken.text, /Сначала я пытался/); assert.equal(spoken.lang, 'ru-RU');
    assert.equal(await page.locator('.bridge-youtube-toggle').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#bridge-youtube-status').isVisible(), false, 'Успешный перевод не перекрывает видео');
    if (mode.startsWith('udemy-')) {
      assert.equal(await page.locator('body').getAttribute('data-caption-menu-opens'), '1', 'Подсказка aria-expanded не открывает меню повторно');
      assert.equal(await page.locator('[role="group"][aria-label="Субтитры"]').isVisible(), false);
      assert.equal(await page.locator('[data-purpose="captions-cue-text"]').evaluate(el => getComputedStyle(el).opacity), '0', 'Исходный текст скрыт, речь продолжается');
      assert.equal(await page.locator('#bridge-source-language').inputValue(), 'auto');
    }
    if (mode === 'native-en') {
      await page.locator('.bridge-youtube-toggle').click(); await page.locator('.bridge-youtube-toggle').click(); await speech(2);
      assert.equal(await page.locator('body').getAttribute('data-translator-creates'), '1', 'Переводчик не загружается заново');
      await page.locator('.bridge-language-settings').click(); await page.locator('#bridge-target-language').selectOption('de-DE'); await speech(3);
      assert.equal((await worker.evaluate(() => globalThis.translationSpeech)).at(-1).lang, 'de-DE');
      assert.match((await worker.evaluate(() => globalThis.translationSpeech)).at(-1).text, /Dies ist/);
      await page.screenshot({ path: join(output, 'udemy-local-translation-fixture.png') });
      await page.locator('#bridge-target-language').selectOption('en-US'); await speech(4);
      assert.equal(await page.locator('#bridge-voice-gender option[value="female"]').getAttribute('disabled'), null);
      assert.equal(await page.locator('#bridge-voice-gender option[value="male"]').getAttribute('disabled'), null);
      await page.locator('#bridge-voice-gender').selectOption('female'); await speech(5);
      assert.match((await worker.evaluate(() => globalThis.translationSpeech)).at(-1).text, /English/);
    }
    results.push({ mode, translated: true }); console.log(`${mode}: исходные английские субтитры → русский голос — OK`); await page.close();
  }
  const slow = await open('native-en', 'slow');
  await slow.waitForFunction(() => document.body.dataset.translationStarted === 'true');
  await slow.evaluate(() => document.querySelector('video').pause());
  await slow.waitForTimeout(1400); assert.equal((await worker.evaluate(() => globalThis.translationSpeech)).length, 0, 'После паузы старая фраза не звучит');
  await slow.evaluate(() => document.querySelector('video').play()); await speech();
  await slow.close();
  for (const mode of ['absent', 'unavailable', 'blocked']) {
    const page = await open('native-en', mode);
    await page.locator('#bridge-youtube-status').filter({ hasText: /Chrome 138|не поддерживает|Повторить запуск/ }).waitFor({ timeout: 15000 });
    assert.equal((await worker.evaluate(() => globalThis.translationSpeech)).length, 0, 'Оригинал никогда не выдаётся за перевод');
    assert.equal(await page.locator('.bridge-youtube-toggle').getAttribute('aria-pressed'), 'true');
    await page.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(join(output, 'translation-browser.json'), JSON.stringify({ fixtures: true, cases: results, pauseCancellation: true, errorsWithoutFalseSpeech: true }, null, 2));
  console.log('Отмена при паузе, переиспользование модели, смена языка и конечные ошибки — OK.');
} finally { await context.close(); await rm(profile, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }); }
