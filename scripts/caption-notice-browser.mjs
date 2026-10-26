import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSpeechFixture } from "./speech-fixture.mjs";
import { DEFAULT_SETTINGS } from "../extension/shared/preferences.js";

const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", { paths: [process.env.BRIDGE_PLAYWRIGHT_ROOT || process.cwd()] }));
const directory = await mkdtemp(join(tmpdir(), "bridge-caption-notice-"));
const output = new URL("../test-results/", import.meta.url);
let context;
try {
  const extension = await createSpeechFixture(fileURLToPath(new URL("../extension/", import.meta.url)), join(directory, "extension"));
  context = await chromium.launchPersistentContext(join(directory, "profile"), {
    channel: "chromium", headless: true, viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--no-first-run", "--mute-audio"]
  });
  const errors = [];
  context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  await worker.evaluate(async settings => {
    await chrome.storage.local.set({ bridgeSettings: settings });
    globalThis.noticeSpeech = []; globalThis.noticeHold = false;
    chrome.tts.getVoices = callback => callback([]);
    chrome.tts.stop = () => {};
    chrome.tts.speak = (text, options, callback) => {
      globalThis.noticeSpeech.push(text);
      globalThis.noticeEnd = () => options.onEvent({ type: "end" });
      callback(); options.onEvent({ type: "start" });
      if (!globalThis.noticeHold) setTimeout(globalThis.noticeEnd, 60);
    };
  }, { ...DEFAULT_SETTINGS, sourceLanguage: "ko-KR", language: "ru-RU", voiceName: "Bridge — Денис (локальный)" });
  const fixture = await readFile(new URL("../tests/fixtures/youtube.html", import.meta.url), "utf8");
  await context.route("https://www.youtube.com/**", route => route.fulfill({ contentType: "text/html", body: fixture }));
  const page = await context.newPage(); await page.goto("https://www.youtube.com/watch?v=korean_source");
  const wav = Buffer.alloc(44 + 16000 * 180);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
  await page.locator(".bridge-youtube-toggle:not([disabled])").waitFor();
  await page.evaluate(async src => { const v = document.querySelector("video"); v.src = src; await v.play(); }, `data:audio/wav;base64,${wav.toString("base64")}`);
  await page.locator(".bridge-youtube-toggle").click();
  await page.waitForFunction(() => document.querySelector("#bridge-youtube-status").textContent.includes("Ждём"));
  // YouTube's captions.js creates an ordinary caption-window for its track
  // notification, with separate visual lines and an inline settings SVG.
  const render = windows => page.evaluate(windows => {
    const layer = document.querySelector(".ytp-caption-window-container");
    const next = windows.map(({ id, lines, icon, hidden, top = false }) => {
      const window = layer.querySelector(`#caption-window-${id}`) || document.createElement("div");
      window.id = `caption-window-${id}`;
      window.className = `caption-window ytp-caption-window-${top ? "top" : "bottom"}`;
      window.style.display = hidden ? "none" : "block";
      window.replaceChildren();
      for (const text of lines) {
        const line = document.createElement("span"); line.className = "caption-visual-line"; line.style.display = "block";
        const segment = document.createElement("span"); segment.className = "ytp-caption-segment"; segment.textContent = text;
        line.append(segment); window.append(line);
      }
      if (icon) window.querySelector(".caption-visual-line:last-child .ytp-caption-segment").append(document.createElementNS("http://www.w3.org/2000/svg", "svg"));
      return window;
    });
    layer.replaceChildren(...next);
  }, windows);
  const speech = () => worker.evaluate(() => globalThis.noticeSpeech);
  const quiet = async label => {
    const before = await speech(); await page.waitForTimeout(1000);
    assert.deepEqual(await speech(), before, label);
  };
  const expectSpeech = async text => {
    for (let i = 0; i < 100; i++) { if ((await speech()).includes(text)) return; await page.waitForTimeout(30); }
    assert.fail(`Реплика не произнесена: ${text}; actual: ${JSON.stringify(await speech())}`);
  };
  const full = "Корейский (создано автоматически) >> Русский Для настройки нажмите на значок";
  await render([{ id: "_notice", top: true, lines: [full] }]);
  await quiet("Полная подсказка без SVG не должна озвучиваться");
  await render([{ id: "_notice", top: true, lines: ["Для настройки нажмите на значок"] }]);
  await quiet("Продолжение уже распознанной подсказки не должно озвучиваться");
  await render([{ id: "_notice", top: true, lines: ["韓国語 >> ロシア語", "設定するにはアイコンをクリック"], icon: true }]);
  await quiet("SVG настроек отличает уведомление от реплики независимо от языка сайта");
  const dialogue = "Это настоящая реплика рядом с подсказкой.";
  await render([
    { id: "_notice", top: true, lines: ["Корейский >> Русский", "Для настройки нажмите на значок"], icon: true },
    { id: "1", lines: [dialogue] },
    { id: "preview", lines: ["Скрытый пример не произносится."], hidden: true }
  ]);
  await expectSpeech(dialogue); await page.waitForTimeout(250);
  assert.deepEqual(await speech(), [dialogue], "Уведомление не должно смешиваться с настоящей репликой");
  const instruction = "Нажмите на значок настроек, чтобы продолжить урок.";
  await render([{ id: "_notice", top: true, lines: [instruction] }]);
  await expectSpeech(instruction); // The same window may later contain real top-positioned dialogue.
  const hintDialogue = "Для настройки нажмите на значок";
  await render([{ id: "_notice", top: true, lines: [hintDialogue] }]);
  await expectSpeech(hintDialogue); // Not a global blacklist of tutorial speech.
  await worker.evaluate(() => { globalThis.noticeHold = true; });
  const held = "Реплика перед подготовкой следующей.";
  await render([{ id: "1", lines: [held] }]); await expectSpeech(held);
  await worker.evaluate(() => { globalThis.bridgePreparations = []; });
  await render([{ id: "_notice", top: true, lines: [full], icon: true }]);
  await quiet("Подсказка не должна попасть в очередь во время речи");
  assert.deepEqual(await worker.evaluate(() => globalThis.bridgePreparations), [], "Нельзя заранее синтезировать служебный текст");
  const next = "Настоящая следующая реплика.";
  await render([{ id: "2", lines: [next] }]);
  for (let i = 0; i < 100 && !(await worker.evaluate(() => globalThis.bridgePreparations.length)); i++) await page.waitForTimeout(30);
  assert.deepEqual(await worker.evaluate(() => globalThis.bridgePreparations.map(x => x.text)), [next]);
  await worker.evaluate(() => { globalThis.noticeHold = false; globalThis.noticeEnd(); });
  await expectSpeech(next);
  await page.evaluate(() => document.querySelector("video").pause());
  await render([{ id: "_notice", top: true, lines: [full], icon: true }]);
  await page.evaluate(() => document.querySelector("video").play());
  await quiet("После паузы подсказка также не озвучивается");
  await page.evaluate(() => { document.querySelector("video").currentTime += 5; });
  await quiet("Перемотка не отправляет подсказку в озвучку");
  await render([]);
  await page.evaluate(full => {
    const track = document.querySelector("video").addTextTrack("captions", "Russian", "ru");
    track.addCue(new VTTCue(0, 180, `<c.notice>${full}</c>`)); track.mode = "showing"; globalThis.noticeNativeTrack = track;
  }, full);
  await quiet("Native TextTrack не должен обходить фильтр служебного текста");
  const nativeDialogue = "Настоящая реплика из дорожки субтитров.";
  await page.evaluate(text => {
    const track = globalThis.noticeNativeTrack;
    track.removeCue(track.cues[0]); track.addCue(new VTTCue(0, 180, `<i>${text}</i>`));
    document.querySelector("video").dispatchEvent(new Event("playing"));
  }, nativeDialogue);
  await expectSpeech(nativeDialogue);
  const expected = [dialogue, instruction, hintDialogue, held, next, nativeDialogue];
  assert.deepEqual(await speech(), expected);
  assert.deepEqual(errors, []);
  await mkdir(output, { recursive: true });
  await writeFile(new URL("caption-notice-browser.json", output), JSON.stringify({
    fullNoticeRejected: true, hintContinuationRejected: true, localizedIconNoticeRejected: true,
    adjacentDialoguePreserved: true, hiddenPreviewRejected: true, realTutorialSpeechPreserved: true,
    noNoticePreparation: true, pauseAndSeekProtected: true, nativeFallbackProtected: true,
    spoken: expected, errors
  }, null, 2) + "\n");
  console.log("Caption notice regression: PASS (full notice, UI icon, mixed windows, queue, pause/seek, native cues; 6 real utterances).");
} finally { await context?.close(); await rm(directory, { recursive: true, force: true }); }
