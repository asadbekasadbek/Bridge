import test from "node:test";
import assert from "node:assert/strict";
import { createYouTubeController, captionVoice } from "../extension/shared/youtube-controller.js";
import { isVideoSender } from "../extension/shared/video-sites.js";
import { DEFAULT_SETTINGS } from "../extension/shared/preferences.js";

const sender = { id: "extension", frameId: 0, tab: { id: 10 }, url: "https://www.youtube.com/watch?v=test" };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const stockVoices = [{ voiceName: "Denis", lang: "ru-RU", gender: "male" }, { voiceName: "Milena", lang: "ru-RU", gender: "female" }, { voiceName: "Cloud language", lang: "en-US", gender: "female" }];
test("авто выбирает реальный мужской/женский голос для каждой реплики и не меняет сохранённые настройки", () => {
  const settings = { ...DEFAULT_SETTINGS, voiceName: "Denis" };
  assert.equal(captionVoice(settings, stockVoices, "female").voiceName, "Milena");
  assert.equal(captionVoice(settings, stockVoices, "male").voiceName, "Denis");
  assert.equal(captionVoice(settings, stockVoices, "unknown").voiceName, "Denis");
  assert.equal(settings.voiceGender, "any");
  assert.equal(settings.voiceName, "Denis");
  const missing = captionVoice(settings, stockVoices.slice(0, 1), "female");
  assert.equal(missing.voiceName, "Denis");
  assert.equal(missing.fallback, true);
  assert.equal(captionVoice({ ...settings, voiceGender: "male" }, stockVoices, "female").voiceName, "Denis");
  assert.equal(captionVoice({ ...settings, voiceName: "", voiceGender: "female" }, stockVoices, "male").voiceName, "Milena");
});

test("режим меняется в активном сеансе, оценки приходят с каждой репликой и не записываются в настройки", async () => {
  const { controller, speech } = setup();
  const names = [];
  speech.voices = async () => stockVoices;
  speech.preview = async (settings) => { names.push(settings.voiceName); return {}; };
  const client = port(10); controller.connect(client); client.send({ type: "start" }); await tick();
  client.send({ type: "caption", sequence: 1, text: "Первая.", estimatedGender: "female" }); await tick();
  client.send({ type: "caption", sequence: 2, text: "Вторая.", estimatedGender: "male" }); await tick();
  controller.updateVoice({ voiceGender: "female", voiceName: "" });
  client.send({ type: "caption", sequence: 3, text: "Исправлено вручную.", estimatedGender: "male" }); await tick();
  assert.deepEqual(names, ["Milena", "Denis", "Milena"]);
  assert.ok(client.messages.some((message) => message.type === "voice-mode" && message.voiceGender === "female"));
  assert.ok(!client.messages.some((message) => message.type === "ended"));
});

test("ручной выбор во время запуска имеет приоритет над старым режимом из хранилища", async () => {
  const { controller, speech } = setup(async () => ({ ...DEFAULT_SETTINGS, voiceGender: "female" }));
  let finish;
  speech.voices = () => new Promise((resolve) => { finish = resolve; });
  const client = port(10); controller.connect(client); client.send({ type: "start" });
  controller.updateVoice({ voiceGender: "male", voiceName: "" });
  finish(stockVoices.slice(0, 1)); await tick();
  const ready = client.messages.find((message) => message.type === "ready");
  assert.equal(ready.voiceGender, "male");
  assert.equal(ready.voiceName, "Denis");
  assert.ok(!client.messages.some((message) => message.type === "ended"));
});
function port(tabId) {
  const listeners = {};
  return {
    sender: { ...sender, tab: { id: tabId } }, messages: [],
    onMessage: { addListener(fn) { listeners.message = fn; } },
    onDisconnect: { addListener(fn) { listeners.disconnect = fn; } },
    postMessage(message) { this.messages.push(message); },
    send(message) { listeners.message(message); },
    close() { listeners.disconnect(); }
  };
}
function setup(readSettings = async () => DEFAULT_SETTINGS) {
  const calls = [], changes = [];
  const speech = { stop() { calls.push("stop"); }, async voices() { return [{ voiceName: "Russian local", lang: "ru-RU" }]; }, async preview(settings, text) { calls.push(text); return { cancelled: false }; } };
  return { calls, changes, speech, controller: createYouTubeController({ speech, readSettings, onStateChange: (tabId) => changes.push(tabId) }) };
}

test("подготовка следующего субтитра не прерывает речь и доступна только владельцу сеанса", async () => {
  const { controller, speech, calls } = setup();
  const prepared = [];
  speech.prepare = async (settings, text) => { prepared.push(text); };
  const client = port(10); controller.connect(client);
  client.send({ type: "prepare-caption", text: "До запуска" });
  client.send({ type: "start" }); await tick();
  const stops = calls.length;
  client.send({ type: "prepare-caption", text: "Следующая фраза." });
  client.send({ type: "prepare-caption", text: "x".repeat(501) }); await tick();
  assert.deepEqual(prepared, ["Следующая фраза."]);
  assert.equal(calls.length, stops);
  client.close(); client.send({ type: "prepare-caption", text: "После закрытия" });
  assert.equal(prepared.length, 1);
});

test("контент принимается только из основного фрейма разрешённых страниц YouTube", () => {
  assert.equal(isVideoSender(sender, "extension"), true);
  assert.equal(isVideoSender({ ...sender, url: "https://www.youtube.com/" }, "extension"), true, "Исходный URL главной страницы допустим после SPA-перехода к видео");
  for (const override of [{ url: "https://www.youtube.com.evil.example/watch?v=x" }, { url: "http://www.youtube.com/watch?v=x" }, { id: "another" }, { frameId: 1 }, { tab: {} }]) {
    assert.equal(isVideoSender({ ...sender, ...override }, "extension"), false);
  }
});

test("вторая вкладка получает голос, а закрытие прежней вкладки её не останавливает", async () => {
  const { controller, calls } = setup();
  const first = port(10), second = port(11);
  controller.connect(first); controller.connect(second);
  first.send({ type: "start" }); await tick();
  second.send({ type: "start" }); await tick();
  assert.ok(first.messages.some((message) => message.type === "ended" && message.error === false));
  const stops = calls.length;
  first.close();
  assert.equal(calls.length, stops);
  first.send({ type: "caption", sequence: 1, text: "Старая вкладка" });
  second.send({ type: "caption", sequence: 1, text: "Новая вкладка" }); await tick();
  assert.ok(!calls.includes("Старая вкладка"));
  assert.ok(calls.includes("Новая вкладка"));
});

test("popup находит активный фрейм видео, смена владельца и stop очищают маршрут", async () => {
  const { controller } = setup();
  const first = port(10), second = port(10);
  controller.connect(first); controller.connect(second);
  first.send({ type: "start", frameToken: "frame-one" }); await tick();
  assert.equal(controller.frameFor(10), "frame-one");
  assert.equal(controller.frameFor(11), null);
  second.send({ type: "start", frameToken: "frame-two" }); await tick();
  first.close();
  assert.equal(controller.frameFor(10), "frame-two");
  controller.end();
  assert.equal(controller.frameFor(10), null);
});

test("отключение во время загрузки настроек не включает озвучку позднее", async () => {
  let finish;
  const { controller } = setup(() => new Promise((resolve) => { finish = resolve; }));
  const client = port(10); controller.connect(client); client.send({ type: "start" });
  client.close(); finish(DEFAULT_SETTINGS); await tick();
  assert.ok(!client.messages.some((message) => message.type === "ready"));
});

test("без выбранного локального голоса сеанс завершается с понятным сообщением", async () => {
  const { controller } = setup(async () => ({ ...DEFAULT_SETTINGS, voiceName: "Removed" }));
  const client = port(10); controller.connect(client); client.send({ type: "start" }); await tick();
  assert.ok(client.messages.some((message) => message.type === "ended" && message.error === true && message.reason.includes("нет локального голоса")));
});

test("старые номера реплик и сообщения после отключения игнорируются", async () => {
  const { controller, calls } = setup();
  const client = port(10); controller.connect(client); client.send({ type: "start" }); await tick();
  client.send({ type: "caption", sequence: 2, text: "Актуальная реплика" }); await tick();
  client.send({ type: "caption", sequence: 1, text: "Старая реплика" });
  client.send({ type: "stop" });
  client.send({ type: "caption", sequence: 3, text: "После выключения" }); await tick();
  assert.ok(calls.includes("Актуальная реплика"));
  assert.ok(!calls.includes("Старая реплика"));
  assert.ok(!calls.includes("После выключения"));
});
test("поздний отказ старой реплики не выключает следующую в том же сеансе", async () => {
  const { controller, speech } = setup(); let rejectOld;
  speech.preview = async (settings, text) => text === "Старая." ? new Promise((resolve, reject) => { rejectOld = reject; }) : { cancelled: false };
  const client = port(10); controller.connect(client); client.send({ type: "start" }); await tick();
  client.send({ type: "caption", sequence: 1, text: "Старая." });
  client.send({ type: "caption", sequence: 2, text: "Актуальная." }); await tick();
  rejectOld(new Error("Устаревшая ошибка")); await tick();
  assert.ok(client.messages.some(message => message.type === "accepted" && message.sequence === 2));
  assert.equal(client.messages.some(message => message.type === "ended"), false);
});

test("поздняя ошибка системного голоса выключает сеанс, а не зависает с активной кнопкой", async () => {
  const { controller } = setup();
  const client = port(10); controller.connect(client); client.send({ type: "start" }); await tick();
  assert.equal(controller.onSpeechEvent({ type: "error", error: "Voice failed" }), true);
  assert.ok(client.messages.some((message) => message.type === "ended" && message.error === true && message.reason === "Voice failed"));
  assert.equal(controller.onSpeechEvent({ type: "end" }), false);
});

test("изменение смешивания сохраняет сеанс и меняет громкость следующей реплики", async () => {
  const { controller, speech, calls } = setup();
  let lastVolume;
  speech.preview = async (settings) => { lastVolume = settings.volume; return { cancelled: false }; };
  const client = port(10); controller.connect(client); client.send({ type: "start" }); await tick();
  const stops = calls.length;
  controller.updateAudio({ volume: 0.4, duckingEnabled: true, duckingAmount: 0.47 });
  assert.equal(calls.length, stops);
  assert.ok(client.messages.some((message) => message.type === "audio-settings" && message.audio.duckingAmount === 0.47));
  client.send({ type: "caption", sequence: 1, text: "Продолжаем." }); await tick();
  assert.equal(lastVolume, 0.4);
});

test("изменение смешивания во время запуска не затирается поздним списком голосов", async () => {
  const { controller, speech } = setup();
  let finishVoices;
  speech.voices = () => new Promise((resolve) => { finishVoices = resolve; });
  const client = port(10); controller.connect(client); client.send({ type: "start" });
  controller.updateAudio({ volume: 0.2, duckingEnabled: false, duckingAmount: 0.47 });
  finishVoices([{ voiceName: "Russian local", lang: "ru-RU" }]); await tick();
  const ready = client.messages.find((message) => message.type === "ready");
  assert.equal(ready.audio.volume, 0.2);
  assert.equal(ready.audio.duckingEnabled, false);
});
