import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const pitch = await readFile(new URL("../extension/youtube/pitch-tools.js", import.meta.url), "utf8");
const source = await readFile(new URL("../extension/youtube/voice-detector.js", import.meta.url), "utf8");
function setup(defer = false) {
  let callback, resume, created = 0, closed = 0, time = 0;
  const events = [], tracks = ["audio", "video"].map((kind) => ({ kind, readyState: "live", stop() { this.readyState = "ended"; } }));
  const scope = { performance: { now: () => time += 250 },
    setInterval(fn) { callback = fn; return 1; }, clearInterval() { callback = null; },
    AudioContext: class {
      constructor() { created += 1; this.sampleRate = 16000; }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createAnalyser() { return { connect() {}, disconnect() {}, getFloatTimeDomainData(frame) { for (let i = 0; i < frame.length; i++) frame[i] = 0.2 * Math.sin(2 * Math.PI * 120 * i / 16000); } }; }
      createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
      resume() { return defer ? new Promise((resolve) => { resume = resolve; }) : Promise.resolve(); }
      close() { closed += 1; return Promise.resolve(); }
    }
  };
  vm.runInNewContext(pitch, scope); vm.runInNewContext(source, scope);
  const video = { paused: false, ended: false, seeking: false, volume: 0.8, muted: false, currentTime: 1,
    captureStream() { return { getTracks: () => tracks, getAudioTracks: () => tracks.filter((t) => t.kind === "audio"), getVideoTracks: () => tracks.filter((t) => t.kind === "video"), addEventListener() {} }; } };
  return { video, tracks, events, detector: scope.BridgeVoiceDetector.createVoiceDetector((result) => events.push(result)),
    sample: () => callback?.(), counts: () => ({ created, closed, running: Boolean(callback) }), resume: () => resume() };
}
test("анализ копирует только аудио, не меняет громкость оригинала и освобождает поток при ручном выборе/остановке", async () => {
  const f = setup();
  await f.detector.start(f.video);
  await f.detector.start(f.video);
  f.sample(); f.sample();
  assert.equal(f.events.at(-1).gender, "male");
  assert.ok(f.detector.info().hz > 115 && f.detector.info().hz < 125);
  assert.equal(f.tracks[1].readyState, "ended", "Ненужная видеодорожка сразу останавливается");
  assert.equal(f.video.volume, 0.8);
  assert.equal(f.video.muted, false);
  f.detector.stop();
  assert.deepEqual(f.counts(), { created: 1, closed: 1, running: false });
  assert.ok(f.tracks.every((track) => track.readyState === "ended"));
  assert.equal(f.detector.info(), null);
});
test("выключение во время запуска AudioContext не оставляет поздний анализ", async () => {
  const f = setup(true);
  const pending = f.detector.start(f.video);
  f.detector.stop(); f.resume(); await pending;
  assert.equal(f.counts().running, false);
  assert.equal(f.counts().closed, 1);
});
test("закрытый доступ к звуку сообщает о недоступности, не трогая исходный звук", async () => {
  const f = setup();
  f.video.captureStream = () => { throw new Error("SecurityError"); };
  await f.detector.start(f.video);
  assert.equal(f.events.at(-1).status, "unavailable");
  assert.equal(f.video.volume, 0.8);
  assert.deepEqual(f.counts(), { created: 0, closed: 0, running: false });
});
