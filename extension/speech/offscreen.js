import { resourceProfile } from "../shared/resource-profile.js";
let worker = null, context = null, active = null, idleTimer = null, resourceMode = "light";
const sources = new Map();
function idle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (active) { idle(); return; }
    worker?.terminate(); worker = null;
    const old = context; context = null; old?.close().catch(() => {});
  }, resourceProfile(resourceMode).idleMs);
}
function configure(mode) {
  resourceMode = mode === "balanced" ? "balanced" : "light";
  worker?.postMessage({ type: "configure", resourceMode });
  if (worker) idle();
}

function emit(id, type, extra = {}) {
  chrome.runtime.sendMessage({ type: "bridge:bundled-event", id, event: { type, ...extra } }, () => { void chrome.runtime.lastError; });
}
// Messages keep the service worker alive during a slow first synthesis.
setInterval(() => { if (active) emit(active.id, "heartbeat"); }, 20000);
function stop() {
  active = null;
  for (const [source, gain] of sources) {
    source.onended = null;
    try { source.stop(); } catch { /* Already finished. */ }
    source.disconnect(); gain.disconnect();
  }
  sources.clear();
  worker?.postMessage({ type: "cancel" });
  if (worker) idle();
}
function fail(id, error) { if (active?.id === id) { stop(); emit(id, "error", { error: String(error?.message || error).slice(0, 500) }); } }
function finish() {
  if (active?.complete && !active.pending && sources.size === 0) {
    const id = active.id;
    active = null;
    emit(id, "end");
    idle();
  }
}
function ensureWorker() {
  if (worker) return;
  worker = new Worker(chrome.runtime.getURL("speech/worker.js"), { type: "module" });
  worker.postMessage({ type: "configure", resourceMode }); idle();
  worker.onerror = (event) => { worker?.terminate(); worker = null; if (active) fail(active.id, event.message || "Ошибка локального движка."); };
  worker.onmessage = async ({ data }) => {
    idle();
    if (active?.id !== data.id) return;
    const session = active;
    if (data.type === "error") { fail(data.id, data.error); return; }
    if (data.type === "loading") { if (!session.started) emit(data.id, "loading", { message: data.message }); return; }
    if (data.type === "complete") { session.complete = true; finish(); return; }
    if (data.type !== "audio") return;
    session.pending = (session.pending || 0) + 1;
    try {
      context ??= new AudioContext();
      await context.resume();
      if (active !== session) return;
      const samples = new Float32Array(data.audio);
      const buffer = context.createBuffer(1, samples.length, data.sampleRate);
      buffer.copyToChannel(samples, 0);
      const source = context.createBufferSource(), gain = context.createGain();
      gain.gain.value = session.volume;
      source.buffer = buffer; source.connect(gain); gain.connect(context.destination);
      sources.set(source, gain);
      const startAt = Math.max(context.currentTime + 0.02, session.nextAt || 0);
      session.nextAt = startAt + buffer.duration;
      source.onended = () => { sources.delete(source); source.disconnect(); gain.disconnect(); if (active === session) finish(); };
      if (!session.started) { session.started = true; emit(data.id, "start"); }
      source.start(startAt);
    } catch (error) { fail(data.id, error); }
    finally { session.pending -= 1; if (active === session) finish(); }
  };
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.target !== "bridge-voice") return false;
  if (message.type === "configure") { configure(message.resourceMode); respond({ ok: true }); return false; }
  if (message.type === "drop-pack") {
    if (active?.modelId === message.modelId) stop();
    worker?.postMessage({ type: "forget", modelId: message.modelId });
    respond({ ok: true }); return false;
  }
  if (message.type === "stop") { stop(); respond({ ok: true }); return false; }
  if (message.type === "warmup") { configure(message.resourceMode); ensureWorker(); worker.postMessage({ type: "warmup", id: "warmup", modelId: message.modelId }); respond({ ok: true }); return false; }
  if (!["speak", "prepare"].includes(message.type)) return false;
  if (typeof message.id !== "string" || message.id.length > 80 || (message.modelId !== undefined && (typeof message.modelId !== "string" || message.modelId.length > 100)) || message.speaker !== 0 || typeof message.text !== "string" || message.text.length > 500) { respond({ ok: false, error: "Некорректная реплика." }); return false; }
  if (message.type === "speak") {
    stop();
    active = { id: message.id, modelId: message.modelId, volume: Math.max(0, Math.min(1, Number(message.volume) || 0)), started: false, complete: false };
  }
  configure(message.resourceMode);
  ensureWorker();
  worker.postMessage({ type: message.type, id: message.id, text: message.text, modelId: message.modelId, speaker: message.speaker, rate: Math.max(0.5, Math.min(2, Number(message.rate) || 1)) });
  respond({ ok: true });
  return false;
});
