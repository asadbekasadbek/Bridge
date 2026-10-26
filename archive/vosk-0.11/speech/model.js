// Adapted from vosk-tts-web 1.0.0 (Apache-2.0). Only packaged files and a
// CPU/WASM threads are used. No downloads, IndexedDB copy or WebGPU.
import * as ort from "../vendor/ort/ort.wasm.min.mjs";
import { g2pMultistream } from "../vendor/vosk/g2p.js";
import { WordPiece } from "../vendor/vosk/tokenizer.js";
import { wasmThreads } from "./engine.js";

export class VoiceModel {
  async load(progress) {
    ort.env.wasm.wasmPaths = new URL("../vendor/ort/", import.meta.url).href;
    this.threads = wasmThreads(navigator.hardwareConcurrency, globalThis.crossOriginIsolated && typeof SharedArrayBuffer !== "undefined");
    ort.env.wasm.numThreads = this.threads;
    ort.env.wasm.proxy = false;
    const base = new URL("../voices/ru/", import.meta.url);
    const bytes = async (name) => {
      progress(`Читаем голосовой пакет: ${name}…`);
      const result = await fetch(new URL(name, base));
      if (!result.ok) throw new Error(`Файл голоса ${name} недоступен. Распакуйте готовый пакет целиком.`);
      return new Uint8Array(await result.arrayBuffer());
    };
    this.config = JSON.parse(new TextDecoder().decode(await bytes("config.json")));
    this.tok = new WordPiece(new TextDecoder().decode(await bytes("vocab.txt")));
    const compressed = await bytes("dictionary.txt.gz");
    const dict = await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    this.dic = new Map();
    for (let i = 0; i < dict.length;) {
      let end = dict.indexOf("\n", i); if (end < 0) end = dict.length;
      const tab = dict.indexOf("\t", i);
      if (tab > i && tab < end) this.dic.set(dict.slice(i, tab), dict.slice(tab + 1, end));
      i = end + 1;
    }
    const options = { executionProviders: ["wasm"], graphOptimizationLevel: "all" };
    this.bert = await ort.InferenceSession.create(await bytes("bert_u8.onnx"), options);
    this.partA = await ort.InferenceSession.create(await bytes("part_a.onnx"), options);
    this.partB = await ort.InferenceSession.create(await bytes("part_b_fp16.onnx"), options);
  }
  async synth(text, speaker, rate) {
    const toks = this.tok.encode(text.replaceAll("+", ""));
    const n = toks.length;
    const out = await this.bert.run({
      input_ids: new ort.Tensor("int64", BigInt64Array.from(toks, (x) => BigInt(x.id)), [1, n]),
      attention_mask: new ort.Tensor("int64", new BigInt64Array(n).fill(1n), [1, n]),
      token_type_ids: new ort.Tensor("int64", new BigInt64Array(n), [1, n])
    });
    const tensor = out[this.bert.outputNames[0]], dim = tensor.dims.at(-1), bert = [];
    toks.forEach((x, i) => { if (x.t[0] !== "#" && !/^[-,.?!;:"]/.test(x.t)) bert.push(tensor.data.subarray(i * dim, (i + 1) * dim)); });
    const { rows, embs } = g2pMultistream(text, this.dic, this.config.phoneme_id_map, bert);
    const length = rows.length, width = embs[0].length;
    const ids = new BigInt64Array(5 * length), embeddings = new Float32Array(width * length);
    rows.forEach((row, i) => row.forEach((value, col) => { if (!Number.isInteger(value)) throw new Error("Не удалось разобрать символ в субтитрах."); ids[col * length + i] = BigInt(value); }));
    embs.forEach((values, i) => { for (let d = 0; d < width; d++) embeddings[d * length + i] = values[d]; });
    const feeds = {
      input: new ort.Tensor("int64", ids, [1, 5, length]),
      input_lengths: new ort.Tensor("int64", BigInt64Array.of(BigInt(length)), [1]),
      scales: new ort.Tensor("float32", Float32Array.of(0.667, 1 / rate, 0.65), [3]),
      sid: new ort.Tensor("int64", BigInt64Array.of(BigInt(speaker)), [1]),
      bert: new ort.Tensor("float32", embeddings, [1, width, length])
    };
    const first = await this.partA.run({ input: feeds.input, bert: feeds.bert });
    for (const name of this.partA.outputNames) feeds[name] = first[name];
    const result = await this.partB.run(feeds);
    return { samples: Float32Array.from(result[this.partB.outputNames[0]].data), sampleRate: this.config.audio.sample_rate };
  }
}
