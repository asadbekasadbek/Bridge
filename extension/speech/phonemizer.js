import { createPiperPhonemize } from "../vendor/piper/phonemize.mjs";

// The upstream eSpeak CLI allocates native state on each callMain. Recreate
// only this small module after a bounded batch; keep both files in RAM and
// keep the expensive ONNX voice untouched. No disk/network reads per phrase.
export async function createLocalPhonemizer({ read = async (name) => {
  const response = await fetch(new URL(`../vendor/piper/${name}`, import.meta.url));
  if (!response.ok) throw new Error(`Не найден локальный файл произношения: ${name}.`);
  return response.arrayBuffer();
}, factory = createPiperPhonemize, batchSize = 8 } = {}) {
  const [binary, data] = await Promise.all([read("phonemize.wasm"), read("phonemize.data")]);
  const wasmBinary = new Uint8Array(binary);
  let module = null, calls = 0, output = null;
  async function reset() {
    module = null;
    module = await factory({ noInitialRun: true, noExitRuntime: true,
      wasmBinary, getPreloadedPackage: () => data,
      print: (line) => { output = JSON.parse(line); }, printErr: () => {} });
    calls = 0;
  }
  await reset();
  return async (text, language = "ru", config = null) => {
    if (calls >= batchSize) await reset();
    calls += 1;
    output = null;
    module.callMain(["-l", language, "--input", JSON.stringify([{ text }]), "--espeak_data", "/espeak-ng-data", ...(config ? ["--allow_missing_phonemes"] : [])]);
    let ids = output?.phoneme_ids;
    if (config && Array.isArray(output?.phonemes)) {
      if (!output.phonemes.length) throw new Error("Произношение для этого языка недоступно.");
      const map = config.phoneme_id_map, pad = map["_"] || [];
      ids = [...map["^"], ...pad];
      for (const phoneme of output.phonemes) for (const value of config.phoneme_map?.[phoneme] || [phoneme]) {
        if (map[value]) ids.push(...map[value], ...pad);
      }
      ids.push(...map["$"]);
      if (ids.some(id => id >= config.num_symbols)) throw new Error("Голос использует неподдерживаемую таблицу произношения.");
    }
    if (!Array.isArray(ids) || !ids.length || !ids.every(Number.isInteger)) throw new Error("Не удалось подготовить произношение субтитров.");
    return ids;
  };
}
