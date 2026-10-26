import test from "node:test";
import assert from "node:assert/strict";
import { createSynthesisEngine } from "../extension/speech/engine.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
const job = (id, text = "Привет!", type = "speak", extra = {}) => ({ type, id, text, speaker: 1, rate: 1, ...extra });
function fixture(options = {}) {
  const events = [], syntheses = [];
  let loads = 0;
  const voice = { threads: 4, async synth(text, speaker, rate) { syntheses.push({ text, speaker, rate }); return { samples: Float32Array.of(0.1, 0.2, 0.3), sampleRate: 22050 }; } };
  const engine = createSynthesisEngine({ loadModel: async () => { loads += 1; return voice; }, post: (event, transfer = []) => events.push(structuredClone(event, { transfer })), ...options });
  return { engine, events, syntheses, voice, loads: () => loads };
}

test("прогрев, смена видео и отмена сохраняют одну модель, повторная реплика берётся из PCM-кэша", async () => {
  const f = fixture();
  await f.engine.handle({ type: "warmup", id: "warm" });
  assert.equal(f.events[0].threads, 4);
  await f.engine.handle(job("first"));
  f.engine.handle({ type: "cancel" });
  await f.engine.handle({ type: "warmup", id: "next-video" });
  await f.engine.handle(job("second"));
  assert.equal(f.loads(), 1);
  assert.equal(f.syntheses.length, 1);
  const audio = f.events.filter((event) => event.type === "audio");
  assert.equal(audio[1].cached, true);
  assert.deepEqual(new Float32Array(audio[0].audio), new Float32Array(audio[1].audio), "Передача PCM не отсоединяет сохранённый буфер");
});

test("отмена во время загрузки не включает старую речь и не загружает модель заново", async () => {
  let finish;
  const f = fixture({ loadModel: () => new Promise((resolve) => { finish = resolve; }) });
  const pending = f.engine.handle(job("old"));
  await tick();
  f.engine.handle({ type: "cancel" });
  f.engine.handle(job("new"));
  finish(f.voice);
  await pending;
  assert.deepEqual(f.events.filter((event) => event.type === "audio").map((event) => event.id), ["new"]);
});

test("остановка во время ONNX не даёт позднего аудио, а готовый результат годится для продолжения", async () => {
  const f = fixture();
  let finish;
  f.voice.synth = () => new Promise((resolve) => { finish = resolve; });
  const pending = f.engine.handle(job("old")); await tick();
  f.engine.handle({ type: "cancel" });
  f.engine.handle(job("resume"));
  finish({ samples: Float32Array.of(0.5), sampleRate: 22050 }); await pending;
  const audio = f.events.filter((event) => event.type === "audio");
  assert.deepEqual(audio.map((event) => event.id), ["resume"]);
  assert.equal(audio[0].cached, true);
});

test("подготовка следующей реплики не играет звук; пол, скорость и текст разделяют кэш", async () => {
  const f = fixture();
  await f.engine.handle(job("prepare", "Следующая реплика.", "prepare"));
  assert.deepEqual(f.events.map((event) => event.type), ["prepared"]);
  await f.engine.handle(job("next", "Следующая реплика."));
  assert.equal(f.syntheses.length, 1);
  assert.ok(f.events.find((event) => event.type === "audio").cached);
  await f.engine.handle(job("male", "Следующая реплика.", "speak", { speaker: 0 }));
  await f.engine.handle(job("fast", "Следующая реплика.", "speak", { rate: 1.2 }));
  assert.equal(f.syntheses.length, 3);
});

test("очередь подготовки ограничена последней репликой, актуальная речь имеет приоритет", async () => {
  const f = fixture(); let finish;
  f.voice.synth = (text) => { f.syntheses.push(text); return text === "Первая." ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve({ samples: Float32Array.of(0.1), sampleRate: 22050 }); };
  const pending = f.engine.handle(job("first", "Первая.")); await tick();
  f.engine.handle(job("p1", "Старая подготовка.", "prepare"));
  f.engine.handle(job("p2", "Новая подготовка.", "prepare"));
  f.engine.handle(job("urgent", "Актуальная."));
  finish({ samples: Float32Array.of(0.1), sampleRate: 22050 }); await pending;
  assert.deepEqual(f.syntheses, ["Первая.", "Актуальная."]);
  assert.deepEqual(f.events.filter((event) => event.type === "audio").map((event) => event.id), ["urgent"]);
});

test("кэш имеет предел памяти и вытесняет старые фразы", async () => {
  const f = fixture({ cacheBytes: 12 });
  await f.engine.handle(job("a", "Один."));
  await f.engine.handle(job("b", "Два."));
  await f.engine.handle(job("a2", "Один."));
  assert.equal(f.syntheses.length, 3);
});
test("английский текст не превращается в русский; мужская и женская модели переиспользуются", async () => {
  const loads=[], releases=[], spoken=[];
  const engine=createSynthesisEngine({resourceMode:'balanced',post(){},loadModel:async (progress,id)=>{loads.push(id);return {language:'en-US',async synth(text){spoken.push(text);return {samples:Float32Array.of(.1),sampleRate:22050};},async release(){releases.push(id);}};}});
  for(const modelId of ['male','female','male']) await engine.handle(job(modelId,'Hello, world!','speak',{modelId}));
  assert.deepEqual(loads,['male','female']); assert.deepEqual(spoken,['Hello, world!','Hello, world!']);
  await engine.handle(job('third','Another sentence.','speak',{modelId:'third'})); assert.deepEqual(releases,['female']);
});
test("лёгкий режим хранит один граф, но повторная фраза не перечитывает модель", async () => {
  const loads=[],released=[];
  const engine=createSynthesisEngine({post(){},languageFor:()=> 'en-US',loadModel:async(progress,id)=>{loads.push(id);return {async synth(){return {samples:Float32Array.of(.1),sampleRate:22050};},async release(){released.push(id);}};}});
  for(const modelId of ['male','female','male'])await engine.handle(job(modelId,'Hello!','speak',{modelId}));
  assert.deepEqual(loads,['male','female']);assert.deepEqual(released,['male']);
});
test("удаление модели освобождает её граф и PCM и не даёт поздней реплике прозвучать", async () => {
  const events=[],released=[];let finish;
  const engine=createSynthesisEngine({post:event=>events.push(event),languageFor:()=> 'en-US',loadModel:async(progress,id)=>({async synth(){return new Promise(resolve=>{finish=resolve;});},async release(){released.push(id);}})});
  const pending=engine.handle(job('old','Hello!','speak',{modelId:'voice'}));await tick();
  engine.handle({type:'forget',modelId:'voice'});finish({samples:Float32Array.of(.2),sampleRate:22050});await pending;
  assert.equal(events.some(event=>event.type==='audio'),false);assert.deepEqual(released,['voice']);
});
test("ошибка освобождения графа не останавливает очередь и не возвращает повреждённый граф", async () => {
  for (const action of ["evict", "forget", "configure"]) {
    const events = [], loads = [], releases = [];
    const engine = createSynthesisEngine({
      resourceMode: action === "configure" ? "balanced" : "light", languageFor: () => "en-US", post: event => events.push(event),
      loadModel: async (progress, id) => {
        loads.push(id);
        return {
          async synth() { return { samples: Float32Array.of(0.1), sampleRate: 22050 }; },
          async release() { releases.push(id); throw new Error("Native release failed"); }
        };
      }
    });
    await engine.handle(job("first", "First.", "speak", { modelId: "a" }));
    if (action === "forget") await engine.handle({ type: "forget", modelId: "a" });
    if (action === "configure") {
      await engine.handle(job("second", "Second.", "speak", { modelId: "b" }));
      await engine.handle({ type: "configure", resourceMode: "light" });
    }
    await engine.handle(job("last", "Last.", "speak", { modelId: "c" }));
    assert.ok(events.some(event => event.type === "complete" && event.id === "last"), action);
    assert.equal(releases.filter(id => id === "a").length, 1);
    assert.deepEqual(loads, action === "configure" ? ["a", "b", "c"] : ["a", "c"]);
  }
});
test("PCM сверх лимита передаётся без лишней копии, срез чужого буфера копируется", async () => {
  for (const sliced of [false, true]) {
    const pcm = Float32Array.of(0.1, 0.2, 0.3), samples = sliced ? pcm.subarray(1) : pcm;
    let transferred;
    const engine = createSynthesisEngine({ cacheBytes: 0, languageFor: () => "en-US",
      loadModel: async () => ({ async synth() { return { samples, sampleRate: 22050 }; } }),
      post(event, transfer) { if (event.type === "audio") transferred = transfer[0]; }
    });
    await engine.handle(job("one", "Hello!"));
    assert.equal(transferred === pcm.buffer, !sliced);
    assert.deepEqual([...new Float32Array(transferred)], [...samples]);
  }
});

