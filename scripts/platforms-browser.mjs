import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSpeechFixture } from "./speech-fixture.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", { paths: [process.env.BRIDGE_PLAYWRIGHT_ROOT || process.cwd()] }));
const profile = await mkdtemp(join(tmpdir(), "bridge-platforms-")), root = await mkdtemp(join(tmpdir(), "bridge-platforms-extension-"));
const extensionPath = await createSpeechFixture(fileURLToPath(new URL("../extension/", import.meta.url)), join(root, "extension"));
const translationFile = join(extensionPath, "platforms/local-translation.js");
await writeFile(translationFile, `globalThis.Translator = undefined;\n${await readFile(translationFile, "utf8")}`);
const output = fileURLToPath(new URL("../test-results/", import.meta.url)); await mkdir(output, { recursive: true });
const wav = Buffer.alloc(44 + 16000 * 90);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
const audio = `data:audio/wav;base64,${wav.toString("base64")}`;
const html = (await readFile(new URL("../tests/fixtures/platform.html", import.meta.url), "utf8")).replace("__BRIDGE_AUDIO__", audio);
const context = await chromium.launchPersistentContext(profile, { channel: "chromium", headless: true, viewport: { width: 1280, height: 900 }, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, "--no-first-run", "--mute-audio"] });
const results = [], errors = [];
try {
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  await worker.evaluate(() => {
    globalThis.platformRequests = []; globalThis.platformPorts = [];
    chrome.runtime.onConnect.addListener((port) => { if (port.name === "bridge:youtube") globalThis.platformPorts.push({ tabId: port.sender.tab.id, frameId: port.sender.frameId }); });
    chrome.tts.getVoices = (callback) => callback([{ voiceName: "Milena", lang: "ru-RU", gender: "female", remote: false }, { voiceName: "German", lang: "de-DE", remote: false }, { voiceName: "English", lang: "en-US", remote: false }]);
    chrome.tts.stop = () => {};
    chrome.tts.speak = (text, options, callback) => { globalThis.platformRequests.push({ text, voiceName: options.voiceName, lang: options.lang }); callback(); options.onEvent({ type: "start" }); globalThis.platformEnd = () => options.onEvent({ type: "end" }); };
  });
  await context.route(/^https:\/\//, (route) => route.fulfill({ contentType: "text/html", body: html }));
  const reset = () => worker.evaluate(() => new Promise((resolve) => chrome.storage.local.set({ bridgeSettings: { schemaVersion: 6, language: "ru-RU", sourceLanguage: "auto", voiceName: "", voiceGender: "any", showSubtitles: false } }, () => { globalThis.platformRequests = []; resolve(); })));
  async function waitSpeech(count = 1) {
    for (let i = 0; i < 100; i++) { if ((await worker.evaluate(() => globalThis.platformRequests)).length >= count) return; await new Promise((resolve) => setTimeout(resolve, 60)); }
    assert.fail("Площадка не передала ожидаемую реплику");
  }
  const cases = [
    ["TED", "https://www.ted.com/talks/bridge", "native"], ["Vimeo", "https://player.vimeo.com/video/bridge", "native"],
    ["Udemy", "https://www.udemy.com/course/bridge/learn/lecture/1", "native"], ["Coursera", "https://www.coursera.org/learn/bridge/lecture/1", "native"],
    ["VK Видео", "https://vkvideo.ru/video-1_1", "native"], ["RUTUBE", "https://rutube.ru/video/bridge/", "native"],
    ["Twitch", "https://www.twitch.tv/bridge", "native"], ["Udemy DOM", "https://www.udemy.com/course/bridge/learn/lecture/2", "dom"],
    ["Twitch DOM", "https://www.twitch.tv/bridge", "dom"], ["RUTUBE DOM", "https://rutube.ru/video/bridge/", "dom"], ["VK Shadow", "https://vkvideo.ru/video-1_2", "shadow"]
  ];
  for (const [name, url, mode] of cases) {
    await reset();
    const page = await context.newPage(); await page.goto(`${url}?mode=${mode}`);
    const button = page.locator(".bridge-youtube-toggle:not([disabled])"); await button.waitFor();
    await button.click(); await waitSpeech();
    assert.ok((await worker.evaluate(() => globalThis.platformRequests))[0].text.includes("Русские субтитры"), `${name}: озвучивается русская дорожка`);
    assert.ok(!(await worker.evaluate(() => globalThis.platformRequests))[0].text.includes("CC"), "Подпись кнопки субтитров не передаётся голосу");
    assert.equal(await button.getAttribute("aria-pressed"), "true");
    await page.locator(".bridge-language-settings").click();
    await page.locator("#bridge-show-subtitles").check();
    await page.waitForFunction(() => !document.querySelector("#bridge-show-subtitles").disabled);
    if (mode !== "dom") assert.equal(await page.evaluate(() => window.fixtureTracks.find((track) => track.language === "ru").mode), "showing");
    else assert.equal(await page.locator(".subtitles").evaluate((element) => getComputedStyle(element).opacity), "1");
    await page.locator("#bridge-show-subtitles").uncheck();
    await page.waitForFunction(() => !document.querySelector("#bridge-show-subtitles").disabled);
    if (mode !== "dom") assert.equal(await page.evaluate(() => window.fixtureTracks.find((track) => track.language === "ru").mode), "hidden");
    else assert.equal(await page.locator(".subtitles").evaluate((element) => getComputedStyle(element).opacity), "0");
    assert.equal(await button.getAttribute("aria-pressed"), "true", "Показ не выключает голос");
    if (name === "TED") {
      await page.locator("#bridge-target-language").selectOption("de-DE"); await waitSpeech(2);
      assert.equal((await worker.evaluate(() => globalThis.platformRequests)).at(-1).voiceName, "German");
      await page.locator(".bridge-language-settings").click();
      await page.screenshot({ path: join(output, "platform-ted-fixture.png") });
      await page.evaluate(() => { const spacer = document.createElement("div"); spacer.style.height = "1600px"; document.body.append(spacer); window.scrollTo(0, 1000); });
      await page.waitForFunction(() => document.querySelector("#bridge-youtube-control").hidden);
      assert.equal(await button.getAttribute("aria-pressed"), "true", "Прокрутка ниже видео не выключает голос");
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator("#bridge-youtube-control").waitFor({ state: "visible" });
      await page.evaluate(() => document.querySelector("video").pause());
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await button.click();
    if (mode !== "dom") assert.ok((await page.evaluate(() => window.fixtureTracks.map((track) => track.mode))).every((value) => value === "disabled"), "Остановка возвращает прежние режимы дорожек");
    if (mode === "shadow") {
      assert.equal(await page.locator("style[data-bridge-caption-style]").count(), 0, "Временный стиль открытого Shadow DOM удаляется");
      if (await page.locator("#bridge-language-panel").isVisible()) await page.locator(".bridge-language-settings").click();
      await page.locator("#fixture-player").evaluate((element) => element.requestFullscreen());
      await page.waitForFunction(() => document.fullscreenElement?.shadowRoot?.querySelector("#fixture-player .bridge-platform-control"));
      await page.locator(".bridge-platform-control").waitFor({ state: "visible" });
      await page.waitForFunction(() => getComputedStyle(document.fullscreenElement.shadowRoot.querySelector(".bridge-platform-control")).position === "fixed");
      assert.equal(await page.locator(".bridge-platform-control").evaluate((element) => getComputedStyle(element).position), "fixed", "В полноэкранном Shadow DOM загружается локальный стиль управления");
      await page.locator(".bridge-language-settings").click();
      assert.equal(await page.locator("#bridge-language-panel").isVisible(), true);
      await page.evaluate(() => document.exitFullscreen());
      await page.waitForFunction(() => document.querySelector("body > .bridge-platform-control"));
      assert.equal(await page.locator("link[data-bridge-control-style]").count(), 0);
    }
    await page.close(); results.push({ platform: name, strategy: mode, passed: true }); console.log(`${name}: выбор языка, локальный голос, скрытый текст и остановка — OK.`);
  }
  await reset();
  const missing = await context.newPage(); await missing.goto("https://www.twitch.tv/bridge?mode=missing");
  await missing.locator(".bridge-youtube-toggle:not([disabled])").click();
  await missing.locator("#bridge-youtube-status").filter({ hasText: "Chrome 138" }).waitFor({ timeout: 15000 });
  assert.equal((await worker.evaluate(() => globalThis.platformRequests)).length, 0, "Английский текст не читается русским голосом");
  await missing.close();
  for (const mode of ["unknown", "dom-unknown"]) {
    await reset();
    const unlabelled = await context.newPage(); await unlabelled.goto(`https://www.twitch.tv/bridge?mode=${mode}`);
    await unlabelled.locator(".bridge-youtube-toggle:not([disabled])").waitFor();
    await unlabelled.locator(".bridge-language-settings").click();
    await unlabelled.locator("#bridge-source-language").selectOption("en-US");
    await unlabelled.waitForFunction(() => !document.querySelector("#bridge-target-language").disabled);
    await unlabelled.locator("#bridge-target-language").selectOption("en-US");
    await unlabelled.waitForFunction(() => !document.querySelector("#bridge-target-language").disabled);
    await unlabelled.locator(".bridge-language-settings").click();
    await unlabelled.locator(".bridge-youtube-toggle").click(); await waitSpeech();
    assert.equal((await worker.evaluate(() => globalThis.platformRequests))[0].lang, "en-US");
    await unlabelled.close();
  }
  await reset();
  const embedded = await context.newPage(); await embedded.goto("https://www.ted.com/talks/embedded?mode=embed");
  const child = embedded.frameLocator('iframe[src*="vimeo"]');
  await child.locator(".bridge-youtube-toggle:not([disabled])").click(); await waitSpeech();
  const tabId = (await worker.evaluate(() => globalThis.platformPorts)).at(-1).tabId;
  assert.ok((await worker.evaluate(() => globalThis.platformPorts)).at(-1).frameId > 0, "Голос доступен в поддерживаемом iframe");
  await child.locator(".bridge-youtube-toggle").click();
  const popup = await context.newPage();
  await worker.evaluate((id) => new Promise((resolve) => chrome.tabs.update(id, { active: true }, resolve)), tabId);
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator("#toggle-youtube:not([disabled])").waitFor();
  const portsBefore = (await worker.evaluate(() => globalThis.platformPorts)).length;
  await popup.locator("#toggle-youtube").click(); await waitSpeech(2);
  await popup.locator('#toggle-youtube[aria-pressed="true"]').waitFor();
  assert.equal((await worker.evaluate(() => globalThis.platformPorts)).length, portsBefore + 1, "Popup запускает один выбранный фрейм, а не оба");
  assert.equal(await embedded.locator(".bridge-youtube-control").count(), 0, "Пустой родитель не создаёт дубликат управления");
  await popup.close(); await embedded.close();
  assert.deepEqual(errors, []);
  await writeFile(join(output, "platforms-browser.json"), JSON.stringify({ cases: results, missingLanguageBlocked: true, iframeAndPopup: true, fixtures: true }, null, 2));
  console.log("Недоступный перевод не имитируется; два iframe и popup не запускают два голоса — OK.");
} finally { await context.close(); await rm(profile, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }); }
