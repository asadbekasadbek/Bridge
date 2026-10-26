import test from "node:test";
import assert from "node:assert/strict";
import { createLocalPhonemizer } from "../extension/speech/phonemizer.js";

test("сброс состояния произношения не перечитывает файлы и ограничивает число вызовов CLI", async () => {
  const reads = [], argumentsSeen = [];
  let instances = 0;
  const data = new ArrayBuffer(8), wasm = new ArrayBuffer(4);
  const phonemize = await createLocalPhonemizer({
    read: async (name) => { reads.push(name); return name.endsWith("data") ? data : wasm; },
    factory: async (options) => {
      instances += 1;
      assert.equal(options.getPreloadedPackage(), data);
      assert.equal(options.wasmBinary.buffer, wasm);
      return { callMain(args) { argumentsSeen.push(args); options.print(JSON.stringify({ phoneme_ids: [1, 2, 3] })); } };
    }
  });
  for (let i = 0; i < 25; i++) assert.deepEqual(await phonemize(`Фраза ${i}.`), [1, 2, 3]);
  assert.equal(instances, 4);
  assert.deepEqual(reads.sort(), ["phonemize.data", "phonemize.wasm"]);
  assert.equal(argumentsSeen.length, 25);
  assert.deepEqual(JSON.parse(argumentsSeen.at(-1)[3]), [{ text: "Фраза 24." }]);
});
test("фонемы преобразуются по таблице выбранной модели, включая маленькие алфавиты", async () => {
  const phonemize=await createLocalPhonemizer({read:async()=>new ArrayBuffer(1),factory:async options=>({callMain(){options.print(JSON.stringify({phonemes:['h','i'],phoneme_ids:[1,99,98,2]}));}})});
  const config={num_symbols:6,phoneme_id_map:{'^':[1],'_':[0],'$':[2],h:[3],i:[4]},phoneme_map:{}};
  assert.deepEqual(await phonemize('Hi','en',config),[1,0,3,0,4,0,2]);
});
