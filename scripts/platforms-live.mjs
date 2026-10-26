import { createRequire } from "node:module";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSpeechFixture } from "./speech-fixture.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", { paths: [process.env.BRIDGE_PLAYWRIGHT_ROOT || process.cwd()] }));
const profile = await mkdtemp(join(tmpdir(), "bridge-platform-live-")), root = await mkdtemp(join(tmpdir(), "bridge-platform-live-extension-"));
const extensionPath = await createSpeechFixture(fileURLToPath(new URL("../extension/", import.meta.url)), join(root, "extension"));
const output = fileURLToPath(new URL("../test-results/", import.meta.url)); await mkdir(output, { recursive: true });
const context = await chromium.launchPersistentContext(profile, { channel: "chromium", headless: true, viewport: { width: 1280, height: 900 }, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, "--mute-audio"] });
const results = [];
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  await worker.evaluate(() => {
    globalThis.liveSpeech = [];
    chrome.tts.getVoices = (callback) => callback([{ voiceName: "English local test", lang: "en-US", remote: false }]);
    chrome.tts.stop = () => {};
    chrome.tts.speak = (text, options, callback) => { globalThis.liveSpeech.push({ text: text.slice(0, 180), language: options.lang }); callback(); options.onEvent({ type: "start" }); };
  });
  const cases = [["TED", "https://www.ted.com/talks/sir_ken_robinson_do_schools_kill_creativity", "ru-RU"], ["Vimeo", "https://player.vimeo.com/video/76979871", "en-US"], ["VK", "https://vkvideo.ru/video-86586923_456240752", "ru-RU"]];
  for (const [name, url, language] of cases.filter(([name]) => !process.argv[2] || process.argv.slice(2).includes(name))) {
    const page = await context.newPage();
    try {
      await worker.evaluate((language) => new Promise((resolve) => chrome.storage.local.set({ bridgeSettings: { schemaVersion: 6, language, sourceLanguage: "auto", showSubtitles: false } }, () => { globalThis.liveSpeech = []; resolve(); })), language);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      if (name === "Vimeo") {
        const play = page.getByRole("button", { name: /^(?:Play|Воспроизвести)$/ }).first();
        if (await play.isVisible().catch(() => false)) await play.click();
      }
      const media = page.locator("video:not([title='Advertisement'])").first();
      await media.waitFor({ state: "visible", timeout: 45000 });
      await media.evaluate((video) => {
        video.muted = true; video.play().catch(() => {});
      });
      await page.locator(".bridge-youtube-toggle:not([disabled])").click({ timeout: 30000 });
      for (let i = 0; i < 80; i++) { if ((await worker.evaluate(() => globalThis.liveSpeech)).length) break; await new Promise((resolve) => setTimeout(resolve, 250)); }
      const speech = await worker.evaluate(() => globalThis.liveSpeech);
      const mediaState = await page.locator("video").evaluateAll((videos) => ({ media: videos.map((video) => ({ time: video.currentTime, paused: video.paused, seeking: video.seeking, readyState: video.readyState, error: video.error?.message })), tracks: videos.flatMap((video) => [...video.textTracks].filter((track) => ["subtitles", "captions"].includes(track.kind)).map((track) => ({ language: track.language, mode: track.mode, cues: track.cues?.length, firstCue: track.mode !== "disabled" && track.cues?.[0] ? { start: track.cues[0].startTime, end: track.cues[0].endTime } : undefined }))) }));
      const state = { status: await page.locator("#bridge-youtube-status").textContent(), ...mediaState };
      results.push({ name, url: page.url(), speechReceived: speech.length > 0, speech, ...state });
      await page.screenshot({ path: join(output, `platform-${name.toLowerCase()}-live.png`) });
    } catch (error) { results.push({ name, url, speechReceived: false, error: error.message }); }
    finally { await page.close(); }
  }
  for (const result of results) await writeFile(join(output, `platform-${result.name.toLowerCase()}-live.json`), JSON.stringify({ ...result, speechEngineMocked: true, sourcesLive: true }, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await context.close(); await rm(profile, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }); }
