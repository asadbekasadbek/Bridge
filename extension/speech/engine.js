import { normalizeRussian, speechChunks } from "./russian-text.js";
import { resourceProfile } from "../shared/resource-profile.js";

// One model and one inference at a time. Cancellation discards audio, not the
// trained model. A small RAM-only LRU also serves prepared or repeated phrases.
export function createSynthesisEngine({ loadModel, post, now = () => performance.now(), cacheBytes, resourceMode = "light", languageFor = () => "" }) {
  let revision = 0, running = false;
  let profile = resourceProfile(resourceMode), trim = false;
  let pendingSpeech = null, pendingPreparation = null, pendingWarmup = null, size = 0;
  const cache = new Map(), models = new Map(), forgotten = new Set(), epochs = new Map();
  const modelId = job => job.modelId || "ru_RU-denis-medium";
  const epoch = id => epochs.get(id) || 0;
  const cacheLimit = () => cacheBytes ?? profile.cacheBytes;
  async function releaseModel(id) {
    const value = models.get(id);
    models.delete(id);
    // Cleanup must not poison the inference queue or leave a rejected model
    // promise in the LRU. Idle shutdown also disposes the entire Worker.
    try { await (await value)?.release?.(); } catch { /* Best-effort native cleanup. */ }
  }
  async function model(progress, id = "ru_RU-denis-medium") {
    if (models.has(id)) { const value = models.get(id); models.delete(id); models.set(id, value); return value; }
    // Keep at most a male/female pair. Inferences and model changes are
    // serialized in drain, including warmup; an active graph is never evicted.
    if (models.size >= profile.maxModels) await releaseModel(models.keys().next().value);
    const loading = Promise.resolve().then(() => loadModel(progress, id)).catch(error => { models.delete(id); throw error; });
    models.set(id, loading); return loading;
  }
  function remember(key, audio) {
    if (audio.samples.byteLength > cacheLimit()) return;
    if (cache.has(key)) { size -= cache.get(key).samples.byteLength; cache.delete(key); }
    cache.set(key, audio); size += audio.samples.byteLength;
    while (size > cacheLimit()) { const first = cache.keys().next().value; size -= cache.get(first).samples.byteLength; cache.delete(first); }
  }
  async function drain() {
    if (running) return;
    running = true;
    try {
      while (pendingSpeech || pendingPreparation || pendingWarmup || forgotten.size || trim) {
        for (const id of forgotten) {
          if (models.has(id)) await releaseModel(id);
          for (const [key, audio] of cache) if (JSON.parse(key)[0] === id) { size -= audio.samples.byteLength; cache.delete(key); }
        }
        forgotten.clear();
        if (trim) {
          while (models.size > profile.maxModels) await releaseModel(models.keys().next().value);
          while (size > cacheLimit()) { const key = cache.keys().next().value; size -= cache.get(key).samples.byteLength; cache.delete(key); }
          trim = false;
        }
        if (!pendingSpeech && !pendingPreparation && !pendingWarmup) continue;
        const job = pendingSpeech || pendingPreparation || pendingWarmup;
        if (pendingSpeech === job) pendingSpeech = null; else if (pendingPreparation === job) pendingPreparation = null; else pendingWarmup = null;
        const current = () => job.revision === revision && job.epoch === epoch(modelId(job));
        const progress = (message) => { if (job.type === "speak" && current()) post({ id: job.id, type: "loading", message }); };
        try {
          if (!current()) continue;
          let voice = null, language = languageFor(modelId(job));
          if (job.type === "warmup" || !language) { voice = await model(progress, job.modelId); language = voice.language; }
          if (!current()) continue;
          if (job.type === "warmup") { post({ id: job.id, type: "ready", threads: voice.threads || 1 }); continue; }
          const chunks = speechChunks(!language || language.startsWith("ru") ? normalizeRussian(job.text) : job.text);
          for (const text of job.type === "prepare" ? chunks.slice(0, 1) : chunks) {
            if (!current()) break;
            const key = JSON.stringify([job.modelId || "ru_RU-denis-medium", job.speaker, job.rate, text]);
            let audio = cache.get(key), synthesisMs = 0;
            const cached = Boolean(audio);
            if (cached) { cache.delete(key); cache.set(key, audio); }
            else {
              voice ??= await model(progress, job.modelId);
              if (!current()) break;
              progress("Создаём речь локально…");
              const started = now();
              audio = await voice.synth(text, job.speaker, job.rate);
              synthesisMs = now() - started;
              // A cancelled inference can still be reused after pause/rewind.
              remember(key, audio);
            }
            if (job.type !== "speak" || !current()) continue;
            // Transfer an uncached full buffer directly. Only retained PCM or
            // a view into a larger allocation needs its own transferable copy.
            const samples = cache.has(key) || audio.samples.byteOffset || audio.samples.byteLength !== audio.samples.buffer.byteLength
              ? audio.samples.slice() : audio.samples;
            post({ id: job.id, type: "audio", audio: samples.buffer, sampleRate: audio.sampleRate, synthesisMs, cached }, [samples.buffer]);
          }
          if (job.type === "speak" && current()) post({ id: job.id, type: "complete" });
          if (job.type === "prepare" && current()) post({ id: job.id, type: "prepared" });
        } catch (error) {
          if (["speak", "warmup"].includes(job.type) && current()) post({ id: job.id, type: "error", error: error.message || String(error) });
        }
      }
    } finally { running = false; }
  }
  return {
    handle(data) {
      if (data.type === "configure") { profile = resourceProfile(data.resourceMode); trim = true; return drain(); }
      if (data.type === "forget") {
        const id = data.modelId; epochs.set(id, epoch(id) + 1); forgotten.add(id);
        if (pendingSpeech && modelId(pendingSpeech) === id) pendingSpeech = null;
        if (pendingPreparation && modelId(pendingPreparation) === id) pendingPreparation = null;
        if (pendingWarmup && modelId(pendingWarmup) === id) pendingWarmup = null;
        return drain();
      }
      if (data.type === "cancel") { revision += 1; pendingSpeech = null; pendingPreparation = null; pendingWarmup = null; return; }
      if (data.type === "warmup") {
        pendingWarmup = { ...data, revision, epoch: epoch(modelId(data)) }; return drain();
      }
      const type = data.type || "speak";
      if (!["speak", "prepare"].includes(type)) return;
      if (type === "speak") { revision += 1; pendingSpeech = { ...data, type, revision, epoch: epoch(modelId(data)) }; pendingPreparation = null; }
      else pendingPreparation = { ...data, type, revision, epoch: epoch(modelId(data)) };
      return drain();
    }
  };
}
