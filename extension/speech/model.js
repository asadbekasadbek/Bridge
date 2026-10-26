import * as ort from "../vendor/ort/ort.wasm.min.mjs";
import { createLocalPhonemizer } from "./phonemizer.js";
import { packById } from "../shared/voice-pack-catalogue.js";
import { readVoicePack } from "../shared/voice-pack-store.js";
let sharedPhonemizer;

// Keep the trained acoustic graph and phonemizer across phrases and videos.
export class VoiceModel {
  async load(progress, id = "ru_RU-denis-medium") {
    ort.env.wasm.wasmPaths = new URL("../vendor/ort/", import.meta.url).href;
    // Short subtitle phrases benefit from low overhead; leave CPU to YouTube.
    this.threads = 1;
    ort.env.wasm.numThreads = this.threads;
    ort.env.wasm.proxy = false;
    const pack = packById(id);
    if (!pack) throw new Error("Неизвестный локальный голос.");
    progress(`Открываем локальный голос ${pack.voiceName.replace("Bridge — ", "")}…`);
    const stored = await readVoicePack(id);
    if (!stored) throw new Error("Голос ещё не установлен. Выберите голос и нажмите «Установить» в Bridge.");
    const { config, model } = stored;
    this.config = JSON.parse(new TextDecoder().decode(config));
    this.language = pack?.lang || "ru-RU";
    sharedPhonemizer ??= createLocalPhonemizer().catch(error => { sharedPhonemizer = null; throw error; });
    this.phonemize = await sharedPhonemizer;
    this.session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  }
  async synth(text, speaker, rate) {
    if (speaker !== 0) throw new Error("Недопустимый номер голоса.");
    const phonemes = await this.phonemize(text, this.config.espeak.voice, this.language.startsWith("ru") ? null : this.config);
    const ids = BigInt64Array.from(phonemes, (id) => BigInt(id));
    const inputs = {
      input: new ort.Tensor("int64", ids, [1, ids.length]),
      input_lengths: new ort.Tensor("int64", BigInt64Array.of(BigInt(ids.length)), [1]),
      scales: new ort.Tensor("float32", Float32Array.of(this.config.inference.noise_scale, this.config.inference.length_scale / rate, this.config.inference.noise_w), [3])
    };
    if (this.session.inputNames.includes("sid")) inputs.sid = new ort.Tensor("int64", BigInt64Array.of(BigInt(speaker)), [1]);
    let result;
    try {
      result = await this.session.run(inputs);
      // CPU tensors own ordinary JS typed arrays. Keep that array rather than
      // allocating a second PCM buffer; dispose only the tensor's reference.
      const samples = result[this.session.outputNames[0]].data;
      return { samples, sampleRate: this.config.audio.sample_rate };
    } finally {
      for (const tensor of Object.values(inputs)) tensor.dispose();
      for (const tensor of Object.values(result || {})) tensor.dispose();
    }
  }
  async release() { await this.session?.release(); this.session = null; }
}
