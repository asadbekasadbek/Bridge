import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const scope = {};
const source = await readFile(new URL("../extension/youtube/pitch-tools.js", import.meta.url), "utf8");
vm.runInNewContext(source, scope);
const { estimatePitch, createTracker } = scope.BridgePitchTools;
function wave(hz, rate = 16000) {
  return Float32Array.from({ length: 4096 }, (_, i) => 0.12 * Math.sin(2 * Math.PI * hz * i / rate) + 0.04 * Math.sin(4 * Math.PI * hz * i / rate) + 0.01 * Math.sin(6 * Math.PI * hz * i / rate));
}
test("лёгкое определение находит основной тон с обертонами при разных частотах дискретизации", () => {
  for (const rate of [16000, 44100, 48000]) for (const hz of [80, 100, 130, 160, 200, 240, 310]) {
    const result = estimatePitch(wave(hz, rate), rate);
    assert.ok(result, `${hz} Hz / ${rate}`);
    assert.ok(Math.abs(result.hz - hz) < 4, `${hz} Hz estimated as ${result.hz}`);
    assert.ok(result.confidence >= 0.84);
  }
});
test("тишина, слабый сигнал и непериодический шум не считаются новым говорящим", () => {
  assert.equal(estimatePitch(new Float32Array(4096), 16000), null);
  assert.equal(estimatePitch(wave(120).map((value) => value * 0.001), 16000), null);
  let seed = 123456;
  const noise = Float32Array.from({ length: 4096 }, () => { seed = (seed * 1664525 + 1013904223) >>> 0; return ((seed / 2 ** 32) - 0.5) * 0.2; });
  assert.equal(estimatePitch(noise, 16000), null);
});
test("смена длины кадра и частоты дискретизации не переносит данные предыдущего анализа", () => {
  const retained = estimatePitch(wave(120), 16000), snapshot = { ...retained };
  for (const rate of [48000, 8000, 16000, 44100]) for (const size of [4096, 160, 512]) for (const hz of [50, 150, 240]) {
    const input = wave(hz, rate).slice(-size), fresh = {};
    vm.runInNewContext(source, fresh);
    const expected = fresh.BridgePitchTools.estimatePitch(input, rate);
    const actual = estimatePitch(input, rate);
    assert.deepEqual(actual ? { ...actual } : null, expected ? { ...expected } : null, `${rate} Hz / ${size} samples / ${hz} Hz`);
  }
  assert.deepEqual({ ...retained }, snapshot, "Следующие кадры не меняют ранее возвращённую оценку");
});
test("сглаживание переключает тембр по нескольким кадрам, не дрожит в пограничной области и сбрасывается после паузы", () => {
  const tracker = createTracker(), pitch = (hz) => ({ hz, confidence: 0.95 });
  assert.equal(tracker.update(pitch(120), 100).gender, "");
  assert.equal(tracker.update(pitch(130), 350).gender, "male");
  assert.equal(tracker.update(pitch(240), 600).gender, "male");
  assert.equal(tracker.update(pitch(230), 850).gender, "female");
  tracker.update(pitch(175), 1100);
  assert.equal(tracker.update(pitch(178), 1350).gender, "female");
  assert.equal(tracker.update(null, 3000).gender, "");
  assert.equal(tracker.update(pitch(120), 3250).gender, "");
  tracker.reset();
  assert.equal(tracker.update(pitch(240), 4000).gender, "");
});
