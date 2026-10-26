import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSpeechFixture } from "./speech-fixture.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", { paths: [process.env.BRIDGE_PLAYWRIGHT_ROOT || process.cwd()] }));
const directory = await mkdtemp(join(tmpdir(), "bridge-ducking-"));
let context;
try {
  const extension = await createSpeechFixture(fileURLToPath(new URL("../extension/", import.meta.url)), join(directory, "extension"));
  context = await chromium.launchPersistentContext(join(directory, "profile"), {
    channel: "chromium", headless: true, viewport: { width: 1280, height: 950 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--no-first-run", "--mute-audio"]
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const errors = [];
  context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
  await worker.evaluate(() => {
    globalThis.duckRequests = 0; globalThis.duckDelay = 0;
    chrome.tts.getVoices = callback => callback([{ voiceName: "Milena", lang: "ru-RU", gender: "female", remote: false }]);
    chrome.tts.stop = () => clearTimeout(globalThis.duckStartTimer);
    chrome.tts.speak = (text, options, callback) => {
      globalThis.duckRequests++;
      globalThis.duckEnd = () => options.onEvent({ type: "end" });
      callback();
      globalThis.duckStartTimer = setTimeout(() => options.onEvent({ type: "start" }), globalThis.duckDelay);
    };
  });
  const html = await readFile(new URL("../tests/fixtures/youtube.html", import.meta.url), "utf8");
  await context.route("https://www.youtube.com/**", route => route.fulfill({ contentType: "text/html", body: html }));
  const page = await context.newPage();
  await page.goto("https://www.youtube.com/watch?v=russian_source");
  await page.locator(".bridge-youtube-toggle:not([disabled])").waitFor();
  const wav = Buffer.alloc(44 + 16000 * 60);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
  await page.evaluate(async source => {
    const video = document.querySelector("video"); video.src = source; video.volume = 0.83;
    window.duckTrace = [];
    // Reproduce players that round their media volume to whole percentages.
    video.addEventListener("volumechange", () => {
      const rounded = Math.round(video.volume * 100) / 100;
      if (Math.abs(rounded - video.volume) > 0.000001) video.volume = rounded;
      window.duckTrace.push({ at: performance.now(), volume: video.volume });
    });
    await video.play();
  }, `data:audio/wav;base64,${wav.toString("base64")}`);
  await page.locator(".bridge-youtube-toggle").click();
  await page.waitForFunction(() => document.querySelector("#bridge-youtube-status").textContent.includes("Ждём"));
  await page.locator(".bridge-language-settings").click();
  const caption = text => page.evaluate(text => {
    const span = document.createElement("span"); span.className = "ytp-caption-segment"; span.textContent = text;
    document.querySelector(".ytp-caption-window-container").replaceChildren(span);
  }, text);
  const waitVolume = volume => page.waitForFunction(volume => Math.abs(document.querySelector("video").volume - volume) < 0.001, volume);
  const requestCount = () => worker.evaluate(() => globalThis.duckRequests);
  await caption("Первая реплика для проверки приглушения."); await waitVolume(0.33);
  await page.locator("#bridge-ducking-amount").fill("47"); await waitVolume(0.44);
  await page.locator("#bridge-ducking-enabled").uncheck(); await waitVolume(0.83);
  await page.getByText(/^Сохранено\. Приглушение выключено/).waitFor();
  await page.locator("#bridge-ducking-enabled").check(); await waitVolume(0.44);

  await page.locator("#bridge-ducking-amount").fill("0"); await waitVolume(0.83);
  await page.getByText(/^Сохранено\. При 0% оригинал не приглушается/).waitFor();
  await page.locator("#bridge-ducking-enabled").uncheck();
  await page.getByText(/^Сохранено\. Приглушение выключено/).waitFor();
  await page.locator("#bridge-ducking-enabled").check(); await waitVolume(0.33);
  assert.equal(await page.locator("#bridge-ducking-amount").inputValue(), "60", "Включение из нулевого уровня должно реально приглушать");
  await page.getByText(/^Сохранено\. Во время речи оригинал тише на 60%/).waitFor();
  assert.equal((await worker.evaluate(() => chrome.storage.local.get("bridgeSettings"))).bridgeSettings.duckingAmount, 0.6);

  // Next phrase is prepared, but its speech engine starts 350ms later. The
  // original must stay ducked throughout this ordinary gap between phrases.
  await caption("Следующая короткая реплика.");
  await page.waitForFunction(() => document.querySelector("#bridge-youtube-status").textContent.includes("Озвучиваем"));
  await worker.evaluate(() => { globalThis.duckDelay = 350; });
  // Wait until the new subtitle reaches the bounded preparation queue.
  await page.waitForTimeout(220);
  await page.evaluate(() => { window.duckTrace = []; });
  const before = await requestCount();
  await worker.evaluate(() => globalThis.duckEnd());
  for (let i = 0; i < 100 && await requestCount() === before; i++) await page.waitForTimeout(20);
  assert.equal(await requestCount(), before + 1);
  await page.waitForTimeout(650);
  const gap = await page.evaluate(() => [document.querySelector("video").volume, ...window.duckTrace.map(entry => entry.volume)]);
  assert.ok(Math.max(...gap) <= 0.34, `Оригинал подскочил между репликами: ${Math.max(...gap)}`);

  await page.evaluate(() => { window.duckTrace = []; });
  await worker.evaluate(() => globalThis.duckEnd()); await waitVolume(0.83);
  const release = await page.evaluate(() => window.duckTrace.map(entry => entry.volume));
  assert.ok(release.length >= 8, "Восстановление должно быть плавным");
  assert.ok(release.every((value, index) => index === 0 || value >= release[index - 1] - 0.001));
  assert.ok(release.every((value, index) => index === 0 || value - release[index - 1] <= 0.1));
  await worker.evaluate(() => { globalThis.duckDelay = 0; });
  await caption("Пауза возвращает оригинальный звук."); await waitVolume(0.33);
  await page.evaluate(() => document.querySelector("video").pause()); await waitVolume(0.83);
  assert.equal(await page.locator(".bridge-youtube-toggle").getAttribute("aria-pressed"), "true");
  assert.deepEqual(errors, []);
  const output = new URL("../test-results/", import.meta.url); await mkdir(output, { recursive: true });
  await page.locator("#bridge-language-panel").screenshot({ path: fileURLToPath(new URL("ducking-fixed.png", output)) });
  const report = { quantizedPlayer: true, restoreOriginalVolume: true, enableFromZero: true, gapPeak: Math.max(...gap), releaseSteps: release.length, pauseRestores: true, errors, speech: "fixture", video: "real HTMLMediaElement, test audio" };
  await writeFile(new URL("ducking-browser.json", output), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await context?.close(); await rm(directory, { recursive: true, force: true });
}
