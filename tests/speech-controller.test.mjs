import test from "node:test";
import assert from "node:assert/strict";
import { createSpeechController } from "../extension/shared/speech-controller.js";
import { DEFAULT_SETTINGS } from "../extension/shared/preferences.js";
import { describeSpeechEvent } from "../extension/shared/speech-status.js";
import { captionRate } from "../extension/shared/speech-timing.js";

const native = { voiceName: "Local Russian", lang: "ru-RU", remote: false };
function mockApi() {
  const state = { calls: [], voices: [native], stopped: 0, pending: null, deferVoices: false };
  const api = { runtime: { lastError: null }, tts: {
    getVoices(callback) { if (state.deferVoices) state.pending = callback; else callback(state.voices); },
    speak(text, options, callback) { state.calls.push({ text, options }); callback(); },
    stop() { state.stopped += 1; }
  } };
  return { state, api };
}

test("перед запуском перечитывается список голосов: пропавший локальный голос не заменяется облачным", async () => {
  const { state, api } = mockApi();
  const controller = createSpeechController(api);
  assert.equal((await controller.voices()).length, 1);
  state.voices = [{ ...native, remote: true }];
  await assert.rejects(controller.preview(DEFAULT_SETTINGS, "Привет"), /недоступен/);
  assert.equal(state.calls.length, 0);
});

test("остановка во время получения голосов отменяет ещё не начавшуюся речь", async () => {
  const { state, api } = mockApi();
  state.deferVoices = true;
  const controller = createSpeechController(api);
  const pending = controller.preview(DEFAULT_SETTINGS, "Привет");
  controller.stop();
  state.pending([native]);
  assert.deepEqual(await pending, { cancelled: true });
  assert.equal(state.calls.length, 0);
});

test("ошибка синтеза после успешного callback доходит до интерфейса", async () => {
  const { state, api } = mockApi();
  const events = [];
  const controller = createSpeechController(api, (event) => events.push(event));
  await controller.preview(DEFAULT_SETTINGS, "Привет");
  state.calls[0].options.onEvent({ type: "error", errorMessage: "Voice unavailable" });
  assert.deepEqual(describeSpeechEvent(events[0]), { text: "Voice unavailable", speaking: false, error: true });
});

test("события старой озвучки после остановки не перезаписывают новое состояние", async () => {
  const { state, api } = mockApi();
  const events = [];
  const controller = createSpeechController(api, (event) => events.push(event));
  await controller.preview(DEFAULT_SETTINGS, "Привет");
  controller.stop();
  state.calls[0].options.onEvent({ type: "start" });
  assert.deepEqual(events, [{ type: "stopped", error: "" }]);
});

test("ошибки Chrome API сообщаются вызывающей странице", async () => {
  const { api } = mockApi();
  api.tts.speak = (text, options, callback) => {
    api.runtime.lastError = { message: "Native speech failed" };
    callback();
    api.runtime.lastError = null;
  };
  await assert.rejects(createSpeechController(api).preview(DEFAULT_SETTINGS, "Привет"), /Native speech failed/);
});

test("символы и i не отправляются системному голосу и не вызывают ложную ошибку", async () => {
  const { state, api } = mockApi();
  const result = await createSpeechController(api).preview(DEFAULT_SETTINGS, "i, ***");
  assert.equal(result.skipped, true);
  assert.equal(state.calls.length, 0);
});

test("скорость следует за видео, настройки и тембр не меняются", async () => {
  const { state, api } = mockApi();
  const controller = createSpeechController(api);
  const settings = { ...DEFAULT_SETTINGS, rate: 1.1 };
  await controller.preview(settings, "Привет!", { playbackRate: 1.5 });
  assert.equal(state.calls[0].options.rate, 1.65);
  assert.equal(state.calls[0].options.pitch, 1);
  assert.equal(settings.rate, 1.1);
  assert.equal(captionRate(1, NaN), 1);
  assert.equal(captionRate(1.5, 4), 2);
  assert.equal(captionRate(0.75, 0.25), 0.5);
});

test("загрузка показывается только при долгом первом запуске, последующие фразы не мигают", async () => {
  const { api } = mockApi();
  const events = [], requests = [];
  const bundled = { async stop() {}, async speak(id) { requests.push(id); return {}; } };
  const controller = createSpeechController(api, (event) => events.push(event), bundled, async()=>[{voiceName:'Bridge — Денис (локальный)',lang:'ru-RU',gender:'male',engine:'bundled',speaker:0,modelId:'ru_RU-denis-medium'}]);
  await controller.preview(DEFAULT_SETTINGS, "Первая реплика.");
  assert.deepEqual(events, []);
  controller.onBundledEvent(requests[0], { type: "loading", message: "Открываем локальный голос Денис…" });
  await new Promise((resolve) => setTimeout(resolve, 950));
  assert.equal(events.filter((event) => event.type === "loading").length, 1);
  controller.onBundledEvent(requests[0], { type: "start" });
  controller.onBundledEvent(requests[0], { type: "end" });
  await controller.preview(DEFAULT_SETTINGS, "Следующая реплика.");
  controller.onBundledEvent(requests[1], { type: "loading", message: "Создаём речь локально…" });
  await new Promise((resolve) => setTimeout(resolve, 950));
  assert.equal(events.filter((event) => event.type === "loading").length, 1);
  controller.stop();
});
test("остановка во время чтения установленных голосов отменяет поздний прогрев", async () => {
  const { api } = mockApi(); let finish, warmed = 0;
  const voice = { voiceName: "Bridge — Денис (локальный)", lang: "ru-RU", gender: "male", engine: "bundled", speaker: 0, modelId: "ru_RU-denis-medium" };
  const controller = createSpeechController(api, () => {}, { async stop() {}, async warmup() { warmed++; } }, () => new Promise(resolve => { finish = resolve; }));
  const pending = controller.warmup(DEFAULT_SETTINGS); controller.stop(); finish([voice]); await pending;
  assert.equal(warmed, 0);
});
test("поздняя ошибка чтения голосов отменённой реплики не прерывает новую", async () => {
  const { api, state } = mockApi(); const callbacks = [];
  api.tts.getVoices = callback => callbacks.push(callback);
  const controller = createSpeechController(api);
  const old = controller.preview(DEFAULT_SETTINGS, "Первая.");
  const next = controller.preview(DEFAULT_SETTINGS, "Новая.");
  callbacks[1]([native]); await next;
  api.runtime.lastError = { message: "Old request failed" }; callbacks[0]([]); api.runtime.lastError = null;
  assert.deepEqual(await old, { cancelled: true }); assert.equal(state.calls.length, 1);
});
