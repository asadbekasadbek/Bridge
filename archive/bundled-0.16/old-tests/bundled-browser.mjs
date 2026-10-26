import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", { paths: [process.env.BRIDGE_PLAYWRIGHT_ROOT || process.cwd()] }));
const extensionPath = fileURLToPath(new URL("../extension/", import.meta.url));
const output = fileURLToPath(new URL("../test-results/", import.meta.url));
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "bridge-bundled-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true, viewport: { width: 1280, height: 950 },
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, "--no-first-run", "--mute-audio"]
});
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  const remoteRequests = [], errors = [];
  context.on("request", (request) => { if (/^https?:/.test(request.url())) remoteRequests.push(request.url()); });
  await context.route(/^https?:/, (route) => route.abort());
  await context.setOffline(true);
  await worker.evaluate(() => { chrome.tts.getVoices = (callback) => callback([]); });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (["error", "warning"].includes(message.type())) console.log("Browser:", message.text().slice(0, 600)); });
  // An inert extension page avoids a second model being prewarmed by options.
  await page.goto(`chrome-extension://${extensionId}/speech/offscreen.html`);

  // Run the actual packaged Worker, models and WASM, with all networking off.
  const records = [];
  await page.exposeFunction("bridgeRecord", (record) => { records.push(record); });
  await page.exposeFunction("bridgeProgress", (message) => console.log(message));
  const stats = await page.evaluate(async () => {
    const engine = new Worker(chrome.runtime.getURL("speech/worker.js"), { type: "module" });
    const results = [];
    try {
      const started = performance.now();
      const warm = await new Promise((resolve, reject) => {
        engine.onerror = (event) => reject(new Error(event.message));
        engine.onmessage = ({ data }) => { if (data.type === "ready") resolve(data); if (data.type === "error") reject(new Error(data.error)); };
        engine.postMessage({ id: "warmup", type: "warmup" });
      });
      results.push({ id: "warmup", totalMs: performance.now() - started, threads: warm.threads, isolated: crossOriginIsolated });
      for (const [id, speaker] of [["denis", 0], ["denis-cache", 0]]) {
        const started = performance.now();
        const chunks = [];
        await new Promise((resolve, reject) => {
          engine.onerror = (event) => reject(new Error(event.message));
          engine.onmessage = async ({ data }) => {
            if (data.type === "loading") await window.bridgeProgress(data.message);
            if (data.type === "error") reject(new Error(data.error));
            if (data.type === "audio") chunks.push({ samples: Array.from(new Float32Array(data.audio)), sampleRate: data.sampleRate, synthesisMs: data.synthesisMs, cached: data.cached });
            if (data.type === "complete") resolve();
          };
          engine.postMessage({ id, text: "Привет! Как ваши дела?", speaker, rate: 1 });
        });
        await window.bridgeRecord({ id, chunks });
        const samples = chunks.flatMap((chunk) => chunk.samples);
        const duration = samples.length / chunks[0].sampleRate;
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        results.push({ id, duration, rms, totalMs: performance.now() - started, synthesisMs: chunks.reduce((sum, chunk) => sum + chunk.synthesisMs, 0), cached: chunks.every((chunk) => chunk.cached) });
      }
      await new Promise((resolve, reject) => {
        engine.onmessage = ({ data }) => { if (data.type === "prepared") resolve(); if (data.type === "error") reject(new Error(data.error)); };
        engine.postMessage({ id: "prepare", type: "prepare", text: "Следующая реплика готова заранее.", speaker: 0, rate: 1 });
      });
      engine.postMessage({ type: "cancel" }); // As when the previous speech ends.
      const preparedAt = performance.now();
      await new Promise((resolve, reject) => {
        let cached = false;
        engine.onmessage = ({ data }) => {
          if (data.type === "audio") cached = data.cached;
          if (data.type === "complete") cached ? resolve() : reject(new Error("Prepared audio was regenerated"));
          if (data.type === "error") reject(new Error(data.error));
        };
        engine.postMessage({ id: "prepared-speech", text: "Следующая реплика готова заранее.", speaker: 0, rate: 1 });
      });
      results.push({ id: "prepared-speech", totalMs: performance.now() - preparedAt, cached: true });
    } finally { engine.terminate(); }
    return results;
  });
  for (const stat of stats.filter((entry) => entry.duration)) { assert.ok(stat.duration > 0.5 && stat.duration < 25); assert.ok(stat.rms > 0.001 && stat.rms < 1); }
  assert.ok(stats.find((entry) => entry.id === "warmup").isolated, "Изоляция разрешает многопоточный WASM");
  assert.equal(stats.find((entry) => entry.id === "denis-cache").cached, true);
  for (const record of records) {
    const samples = record.chunks.flatMap((chunk) => chunk.samples), bytes = Buffer.alloc(44 + samples.length * 2);
    bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8); bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(record.chunks[0].sampleRate, 24); bytes.writeUInt32LE(record.chunks[0].sampleRate * 2, 28);
    bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(bytes.length - 44, 40);
    samples.forEach((value, index) => bytes.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(value * 32767))), 44 + index * 2));
    await writeFile(join(output, `bridge-${record.id}.wav`), bytes);
  }
  console.log("Реальный автономный синтез Дениса:", JSON.stringify(stats));

  const stress = await page.evaluate(async () => {
    const { createLocalPhonemizer } = await import("./phonemizer.js");
    const phonemize = await createLocalPhonemizer();
    const before = performance.now();
    for (let i = 0; i < 1200; i++) {
      const ids = await phonemize(`Проверяем голос и сохранение памяти. Номер ${i}.`);
      if (!ids.length) throw new Error(`Phonemizer stopped at ${i}`);
    }
    return { calls: 1200, totalMs: performance.now() - before };
  });
  console.log("Повторное использование фонемизатора:", JSON.stringify(stress));

  // Exercise the production UI → background → offscreen → playback events.
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.locator("#settings-fields:not([disabled])").waitFor();
  assert.equal(await page.locator("#voice option").count(), 1, "Денис доступен без голосов ОС");
  await page.screenshot({ path: join(output, "bundled-voices-settings.png"), fullPage: true });
  await page.locator("#voice-gender").selectOption("male");
  await page.locator("#volume").fill("0");
  await page.locator("#sample").fill("Это встроенный мужской голос.");
  await page.locator("#preview").click();
  await page.getByText("Проверка завершена. Как вам звучание?").waitFor({ timeout: 180000 });
  assert.equal(await page.locator("#preview-status").evaluate((element) => element.classList.contains("error-text")), false);
  await page.evaluate(() => {
    window.bridgeStatusesAfterFirstSpeech = [];
    new MutationObserver(() => window.bridgeStatusesAfterFirstSpeech.push(document.querySelector("#preview-status").textContent))
      .observe(document.querySelector("#preview-status"), { childList: true, subtree: true, characterData: true });
  });
  await page.locator("#sample").fill("Остановим эту длинную реплику до завершения синтеза. ".repeat(5));
  await page.locator("#preview").click();
  await page.waitForFunction(() => !document.querySelector("#stop").disabled);
  await page.locator("#stop").click();
  await page.getByText("Озвучка остановлена.").waitFor();
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(await page.locator("#preview-status").textContent(), "Озвучка остановлена.");
  await page.locator("#sample").fill("После отмены голос продолжает работать.");
  await page.locator("#preview").click();
  await page.getByText("Проверка завершена. Как вам звучание?").waitFor({ timeout: 180000 });
  assert.equal(await page.evaluate(() => window.bridgeStatusesAfterFirstSpeech.some((text) => text.includes("Открываем локальный голос"))), false, "После отмены модель повторно не читается");
  assert.deepEqual(remoteRequests, []);
  assert.deepEqual(errors, []);
  await writeFile(join(output, "bundled-benchmark.json"), JSON.stringify({ stats, stress, remoteRequests, errors }, null, 2));
  console.log("Локальный Денис: настоящая модель, offscreen, события воспроизведения, без голосов ОС, без интернета — OK.");
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
