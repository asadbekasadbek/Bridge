import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSpeechFixture } from "./speech-fixture.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", { paths: [process.env.BRIDGE_PLAYWRIGHT_ROOT || process.cwd()] }));
const profile = await mkdtemp(join(tmpdir(), "bridge-auto-profile-")), root = await mkdtemp(join(tmpdir(), "bridge-auto-extension-"));
const extensionPath = await createSpeechFixture(fileURLToPath(new URL("../extension/", import.meta.url)), join(root, "extension"));
const output = fileURLToPath(new URL("../test-results/", import.meta.url)); await mkdir(output, { recursive: true });
const fixture = await readFile(new URL("../tests/fixtures/youtube.html", import.meta.url), "utf8");
const rate = 16000, wav = Buffer.alloc(44 + rate * 30 * 2);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < rate * 30; i++) {
  const hz = i / rate < 8 || i / rate >= 20 ? 120 : 240;
  const phase = 2 * Math.PI * hz * i / rate;
  wav.writeInt16LE(Math.round((0.16 * Math.sin(phase) + 0.05 * Math.sin(2 * phase) + 0.02 * Math.sin(3 * phase)) * 32767), 44 + i * 2);
}
const context = await chromium.launchPersistentContext(profile, { channel: "chromium", headless: true, viewport: { width: 1280, height: 950 }, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, "--no-first-run", "--mute-audio"] });
try {
  const errors = [];
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  await worker.evaluate(() => {
    globalThis.autoRequests = [];
    chrome.runtime.onConnect.addListener((port) => { if (port.name === "bridge:youtube") globalThis.autoTab = port.sender.tab.id; });
    chrome.tts.getVoices = (callback) => callback([{ voiceName: "Милена", lang: "ru-RU", gender: "female", remote: false }]);
    chrome.tts.stop = () => {};
    chrome.tts.speak = (text, options, callback) => { globalThis.autoRequests.push({ text, voiceName: options.voiceName }); globalThis.autoEvent = options.onEvent; callback(); options.onEvent({ type: "start" }); };
  });
  await context.route("https://www.youtube.com/**", (route) => route.fulfill({ contentType: "text/html", body: fixture }));
  await context.route("https://www.youtube.com/bridge-tones.wav", (route) => {
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || "");
    if (!range) return route.fulfill({ contentType: "audio/wav", headers: { "Accept-Ranges": "bytes" }, body: wav });
    const start = Number(range[1]), end = Math.min(wav.length - 1, Number(range[2] || wav.length - 1));
    return route.fulfill({ status: 206, contentType: "audio/wav", headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${wav.length}` }, body: wav.subarray(start, end + 1) });
  });
  const page = await context.newPage();
  await page.goto("https://www.youtube.com/watch?v=voice_auto");
  await page.locator(".bridge-youtube-toggle:not([disabled])").waitFor();
  await page.evaluate(async () => { const v = document.querySelector("video"); v.src = "/bridge-tones.wav"; v.muted = false; v.volume = 0.8; await v.play(); });
  await page.locator(".bridge-youtube-toggle").click();
  await page.waitForFunction(() => document.documentElement.dataset.captionLanguage === "ru");
  await page.locator(".bridge-language-settings").click();
  const caption = (text) => page.evaluate((text) => { const layer = document.querySelector(".ytp-caption-window-container"); layer.replaceChildren(); if (text) { const span = document.createElement("span"); span.className = "ytp-caption-segment"; span.textContent = text; layer.append(span); } }, text);
  const state = () => worker.evaluate(() => new Promise((resolve) => chrome.tabs.sendMessage(globalThis.autoTab, { type: "bridge:youtube-status" }, resolve)));
  async function waitGender(gender) {
    for (let i = 0; i < 50; i++) { const result = await state(); if (result?.estimatedGender === gender) return; await new Promise((resolve) => setTimeout(resolve, 100)); }
    throw new Error(`Expected ${gender}: ${JSON.stringify(await state())}`);
  }
  const last = () => worker.evaluate(() => globalThis.autoRequests.at(-1));
  async function waitVoice(voiceName) {
    for (let i = 0; i < 50; i++) { if ((await last())?.voiceName === voiceName) return; await new Promise((resolve) => setTimeout(resolve, 100)); }
    assert.equal((await last())?.voiceName, voiceName);
  }
  await waitGender("male");
  await caption("Мужской тембр выбирает Дениса.");
  await waitVoice("Bridge — Денис (локальный)");
  await caption("");
  await page.evaluate(() => { document.querySelector("video").currentTime = 10; });
  await page.waitForFunction(() => document.querySelector("video").currentTime >= 10);
  await waitGender("female");
  await caption("Женский тембр выбирает Милену.");
  await waitVoice("Милена");
  // Correct the current subtitle without reconnecting or turning Bridge off.
  await page.locator("#bridge-voice-gender").selectOption("male");
  await waitVoice("Bridge — Денис (локальный)");
  assert.equal((await state()).enabled, true);
  assert.equal((await state()).voiceGender, "male");
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.equal((await state()).estimatedGender, "", "Ручной режим прекращает анализ оригинала");
  await page.locator("#bridge-voice-gender").selectOption("female");
  await waitVoice("Милена");
  assert.equal((await state()).enabled, true);
  await caption("");
  await page.locator("#bridge-voice-gender").selectOption("any");
  await waitGender("female");
  await page.evaluate(() => { document.querySelector("video").currentTime = 1; });
  await waitGender("male");
  await caption("Авто снова выбирает голос по звуку.");
  await waitVoice("Bridge — Денис (локальный)");
  await page.screenshot({ path: join(output, "voice-auto-player.png"), fullPage: true });
  await page.locator("#bridge-voice-gender").selectOption("female");
  await waitVoice("Милена");
  await page.reload();
  await page.locator(".bridge-language-settings").click();
  await page.locator("#bridge-voice-gender:not([disabled])").waitFor();
  assert.equal(await page.locator("#bridge-voice-gender").inputValue(), "female");
  // The work per frame is measured separately; this is not total browser CPU.
  const pitchScript = await readFile(new URL("../extension/youtube/pitch-tools.js", import.meta.url), "utf8");
  await page.addScriptTag({ content: pitchScript });
  const benchmark = await page.evaluate(() => {
    const frame = Float32Array.from({ length: 4096 }, (_, i) => 0.2 * Math.sin(2 * Math.PI * 120 * i / 16000));
    const started = performance.now();
    for (let i = 0; i < 1000; i++) window.BridgePitchTools.estimatePitch(frame, 16000);
    return { frames: 1000, msPerFrame: (performance.now() - started) / 1000, intervalMs: 250, sampleRate: 16000 };
  });
  assert.deepEqual(errors, []);
  await writeFile(join(output, "voice-auto-benchmark.json"), JSON.stringify({ benchmark, requests: await worker.evaluate(() => globalThis.autoRequests), errors }, null, 2));
  console.log("Реальный captureStream → Web Audio → определение 120/240 Гц → переключение локальных голосов, ручная коррекция текущей реплики, возврат в Авто и сохранение: OK.");
  console.log("Скорость только анализа одного кадра на текущем Mac:", JSON.stringify(benchmark));
  if (process.env.BRIDGE_LIVE_YOUTUBE === "1") {
    await context.unroute("https://www.youtube.com/**");
    await context.unroute("https://www.youtube.com/bridge-tones.wav");
    await worker.evaluate(async () => {
      const stored = await chrome.storage.local.get("bridgeSettings");
      await chrome.storage.local.set({ bridgeSettings: { ...stored.bridgeSettings, voiceGender: "any", voiceName: "" } });
    });
    try {
      await page.goto("https://www.youtube.com/watch?v=EvUokFcF9Uc&t=136s", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.locator(".bridge-youtube-toggle:not([disabled])").waitFor({ timeout: 15000 });
      await page.locator("video").first().evaluate(async (video) => { video.muted = false; video.volume = 0.8; await video.play(); });
      await page.locator(".bridge-youtube-toggle").click();
      let result;
      for (let i = 0; i < 40; i++) {
        result = await state();
        if (result?.voiceAnalysis?.hz || result?.detectorStatus === "unavailable") break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      console.log("Настоящий YouTube (отдельный профиль, без записи звука):", JSON.stringify(result));
      console.log("Состояние реального видео:", JSON.stringify(await page.locator("video").first().evaluate((video) => ({ time: video.currentTime, paused: video.paused, volume: video.volume, muted: video.muted, rate: video.playbackRate, readyState: video.readyState, sourceOrigin: new URL(video.currentSrc).origin, crossOrigin: video.crossOrigin }))));
      await writeFile(join(output, "voice-auto-live.json"), JSON.stringify({ url: "https://www.youtube.com/watch?v=EvUokFcF9Uc&t=136s", result }, null, 2));
    } catch (error) { console.log("Настоящий YouTube: анализ звука не подтверждён в тестовом профиле:", error.message.split("\n")[0]); }
  }
} finally { await context.close(); await rm(profile, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }); }
