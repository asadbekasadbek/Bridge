import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("синтез использует готовый CPU PCM и освобождает тензоры при успехе и ошибке", async () => {
  const source = (await readFile(new URL("../extension/speech/model.js", import.meta.url), "utf8"))
    .replace(/^import .*;\n/gm, "").replaceAll("import.meta.url", JSON.stringify(import.meta.url))
    .replace("export class VoiceModel", "globalThis.VoiceModel = class VoiceModel");
  for (const failed of [false, true]) {
    const tensors = [], pcm = Float32Array.of(0.1, 0.2);
    const scope = { ort: { Tensor: class {
      constructor(type, data) { this.data = data; this.disposed = false; tensors.push(this); }
      dispose() { this.disposed = true; this.data = null; }
    } } };
    vm.runInNewContext(source, scope);
    const voice = new scope.VoiceModel();
    voice.config = { espeak: { voice: "en" }, inference: { noise_scale: 0.5, length_scale: 1, noise_w: 0.6 }, audio: { sample_rate: 22050 } };
    voice.language = "en-US"; voice.phonemize = async () => [1, 2];
    voice.session = { inputNames: ["input", "sid"], outputNames: ["output"], async run() {
      if (failed) throw new Error("Inference failed");
      return { output: new scope.ort.Tensor("float32", pcm) };
    } };
    if (failed) await assert.rejects(voice.synth("Hello", 0, 1), /Inference failed/);
    else { const audio = await voice.synth("Hello", 0, 1); assert.equal(audio.samples, pcm); assert.equal(audio.sampleRate, 22050); }
    assert.ok(tensors.length >= 4); assert.ok(tensors.every(tensor => tensor.disposed));
    assert.equal(pcm.length, 2);
  }
});
