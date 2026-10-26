import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { cp, copyFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Real WASM/ONNX in a disposable profile. Reuse an archived local model;
// this check neither downloads a voice nor touches the user's installed packs.
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", { paths: [process.env.BRIDGE_PLAYWRIGHT_ROOT || process.cwd()] }));
const directory = await mkdtemp(join(tmpdir(), "bridge-optimization-")), extension = join(directory, "extension");
let context;
try {
  await cp(new URL("../extension/", import.meta.url), extension, { recursive: true });
  await mkdir(join(extension, "benchmark"));
  await copyFile(new URL("../archive/bundled-0.16/voices/ru/denis.onnx", import.meta.url), join(extension, "benchmark/model.onnx"));
  await copyFile(new URL("../archive/bundled-0.16/voices/ru/config.json", import.meta.url), join(extension, "benchmark/config.json"));
  context = await chromium.launchPersistentContext(join(directory, "profile"), {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--no-first-run", "--mute-audio"]
  });
  const service = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const id = new URL(service.url()).host, page = await context.newPage(), errors = [], requests = [];
  page.on("pageerror", error => errors.push(error.message));
  context.on("request", request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.goto(`chrome-extension://${id}/speech/offscreen.html`);
  await context.setOffline(true);
  const pronunciation = await page.evaluate(async () => {
    const { createLocalPhonemizer } = await import("./phonemizer.js");
    const { createPiperPhonemize } = await import("../vendor/piper/phonemize.mjs");
    const originalCompile = WebAssembly.compile, originalInstantiate = WebAssembly.instantiate;
    let compilations = 0, instances = 0, fileReads = 0;
    const times = [], started = performance.now();
    WebAssembly.compile = (...args) => { compilations++; return originalCompile(...args); };
    WebAssembly.instantiate = (...args) => { instances++; return originalInstantiate(...args); };
    try {
      const phonemize = await createLocalPhonemizer({ factory: createPiperPhonemize, read: async name => {
        fileReads++; return (await fetch(`../vendor/piper/${name}`)).arrayBuffer();
      } });
      const initialMs = performance.now() - started;
      let expected;
      for (let i = 0; i < 80; i++) {
        const at = performance.now(), ids = await phonemize("Привет! Как ваши дела?");
        if (expected && ids.join() !== expected) throw new Error("Pronunciation changed after reset");
        expected = ids.join(); times.push(performance.now() - at);
      }
      return { phrases: times.length, compilations, instances, fileReads, initialMs, totalMs: times.reduce((a, b) => a + b, 0), phonemes: expected.split(",").length };
    } finally { WebAssembly.compile = originalCompile; WebAssembly.instantiate = originalInstantiate; }
  });
  assert.equal(pronunciation.compilations, 1); assert.equal(pronunciation.instances, 10); assert.equal(pronunciation.fileReads, 2);
  await page.evaluate(async () => {
    const { createPackInstaller } = await import("../shared/voice-pack-installer.js");
    const installer = createPackInstaller({ fetchFile: url => fetch(`../benchmark/${url.includes(".onnx.json") ? "config.json" : "model.onnx"}`) });
    installer.start(["ru_RU-denis-medium"]);
    const deadline = performance.now() + 60000;
    while (installer.snapshot().busy && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    if (installer.snapshot().phase !== "done") throw new Error(installer.snapshot().message);
  });
  const synthesis = await page.evaluate(async () => {
    const worker = new Worker(chrome.runtime.getURL("speech/worker.js"), { type: "module" });
    try {
      const run = id => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Synthesis timeout")), 120000), result = { id, chunks: 0, samples: 0, cached: true, synthesisMs: 0, peak: 0 };
        worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message)); };
        worker.onmessage = ({ data }) => {
          if (data.id !== id) return;
          if (data.type === "error") { clearTimeout(timer); reject(new Error(data.error)); }
          if (data.type === "audio") {
            const pcm = new Float32Array(data.audio);
            if (!pcm.length || !pcm.every(Number.isFinite)) { clearTimeout(timer); reject(new Error("Invalid PCM")); return; }
            result.chunks++; result.samples += pcm.length; result.cached &&= data.cached; result.synthesisMs += data.synthesisMs;
            for (const sample of pcm) result.peak = Math.max(result.peak, Math.abs(sample));
          }
          if (data.type === "complete") { clearTimeout(timer); resolve(result); }
        };
        worker.postMessage({ type: "speak", id, modelId: "ru_RU-denis-medium", speaker: 0, rate: 1, text: "Привет! Как ваши дела?" });
      });
      const first = await run("first"), cached = await run("cached");
      worker.postMessage({ type: "forget", modelId: "ru_RU-denis-medium" });
      const reloaded = await run("reloaded");
      return { first, cached, reloaded };
    } finally { worker.terminate(); }
  });
  assert.ok(synthesis.first.samples > 1000 && synthesis.first.peak > 0.001);
  assert.equal(synthesis.first.cached, false); assert.equal(synthesis.cached.cached, true);
  assert.equal(synthesis.first.samples, synthesis.cached.samples); assert.equal(synthesis.reloaded.cached, false);
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  await context.close();
  context = await chromium.launchPersistentContext(join(directory, "profile"), {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--no-first-run", "--mute-audio"]
  });
  await context.setOffline(true);
  context.on("request", request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  const restored = await context.newPage();
  restored.on("pageerror", error => errors.push(error.message));
  await restored.goto(`chrome-extension://${id}/speech/offscreen.html`);
  const persistence = await restored.evaluate(async () => {
    const { installedPackIds, deleteVoicePack } = await import("../shared/voice-pack-store.js");
    const { VoiceModel } = await import("./model.js");
    const installed = await installedPackIds(), voice = new VoiceModel();
    await voice.load(() => {}, "ru_RU-denis-medium");
    const audio = await voice.synth("Голос сохранён после перезапуска.", 0, 1);
    await voice.release();
    await deleteVoicePack("ru_RU-denis-medium");
    let missingError = "";
    try { await new VoiceModel().load(() => {}, "ru_RU-denis-medium"); } catch (error) { missingError = error.message; }
    return { installed, samples: audio.samples.length, remaining: await installedPackIds(), missingError };
  });
  assert.deepEqual(persistence.installed, ["ru_RU-denis-medium"]); assert.ok(persistence.samples > 1000);
  assert.deepEqual(persistence.remaining, []); assert.match(persistence.missingError, /ещё не установлен/);
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  const output = new URL("../test-results/optimization-browser.json", import.meta.url);
  await mkdir(new URL("../test-results/", import.meta.url), { recursive: true });
  const report = { browser: context.browser().version(), pronunciation, synthesis, persistence, downloadSource: "local archived bytes, catalogue size and SHA-256 verified", errors, remoteRequests: requests };
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  console.log(`Отчёт: ${fileURLToPath(output)}`);
} finally {
  await context?.close();
  await rm(directory, { recursive: true, force: true });
}
