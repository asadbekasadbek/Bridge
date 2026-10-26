import test from "node:test";
import assert from "node:assert/strict";
import { createSpeechController } from "../extension/shared/speech-controller.js";
import { DEFAULT_SETTINGS, prepareSpeech } from "../extension/shared/preferences.js";
import { packById, asVoice } from "../extension/shared/voice-pack-catalogue.js";
const TEST_VOICES = ['ru_RU-denis-medium','en_US-john-medium','en_US-kristin-medium'].map(id=>asVoice(packById(id)));
import { normalizeRussian, numberWords, speechChunks } from "../extension/speech/russian-text.js";
import { createBundledClient } from "../extension/shared/bundled-client.js";

test("после отдельной установки голос доступен без голосов ОС", async () => {
  const requests = [], events = [];
  const api = { runtime: { lastError: null }, tts: { stop() {}, getVoices(callback) { callback([]); }, speak() { assert.fail("Встроенный голос не должен вызывать системный"); } } };
  const engine = { async stop() {}, async speak(id, voice, text, options) { requests.push({ id, voice, text, options }); return {}; } };
  const speech = createSpeechController(api, (event) => events.push(event), engine, async()=>TEST_VOICES);
  assert.equal((await speech.voices()).length, 3);
  await speech.preview({ ...DEFAULT_SETTINGS, voiceGender: "male" }, "**Привет!**");
  assert.equal(requests[0].voice.speaker, 0);
  assert.equal(requests[0].text, "Привет!");
  speech.onBundledEvent(requests[0].id, { type: "start" });
  speech.stop();
  speech.onBundledEvent(requests[0].id, { type: "end" });
  assert.deepEqual(events.map((event) => event.type), ["start", "stopped"]);
  await assert.rejects(speech.preview({ ...DEFAULT_SETTINGS, voiceGender: "female" }, "Привет!"), /недоступен/);
  const english = prepareSpeech([], { ...DEFAULT_SETTINGS, language: "en-US", voiceGender: "female" }, "Hello", TEST_VOICES);
  assert.equal(english.bundled.modelId, "en_US-kristin-medium");
});

test("числа и латиница приводятся к русским фонемам, ё и й не теряются", () => {
  assert.equal(normalizeRussian("Мой ёж!"), "Мой ёж!");
  assert.equal(numberWords("2026"), "две тысячи двадцать шесть");
  assert.equal(normalizeRussian("0,05"), "ноль целых пять сотых");
  assert.equal(normalizeRussian("21,1"), "двадцать одна целая одна десятая");
  assert.ok(!/[a-z0-9]/i.test(normalizeRussian("YouTube: 47%, Chrome 109.")));
  const text = Array(50).fill("Это полная реплика, она читается по частям.").join(" ");
  const chunks = speechChunks(text);
  assert.ok(chunks.every((chunk) => chunk.length <= 160));
  assert.equal(chunks.join(" "), text);
});

test("остановка при создании offscreen отменяет поздний запуск, события от YouTube отвергаются", async () => {
  let created = 0, finish, listener;
  const sent = [], events = [];
  const api = {
    runtime: { id: "bridge", lastError: null, getURL: (path) => `chrome-extension://bridge/${path}`,
      async getContexts() { return []; }, onMessage: { addListener(fn) { listener = fn; } },
      sendMessage(message, callback) { sent.push(message); callback({ ok: true }); }
    },
    offscreen: { createDocument() { created += 1; return new Promise((resolve) => { finish = resolve; }); } }
  };
  const client = createBundledClient(api, (id, event) => events.push({ id, event }));
  const pending = client.speak("request", TEST_VOICES[0], "Привет", { volume: 1, rate: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  await client.stop(); finish();
  assert.deepEqual(await pending, { cancelled: true });
  assert.equal(created, 1);
  assert.ok(!sent.some((message) => message.type === "speak"));
  const message = { type: "bridge:bundled-event", id: "request", event: { type: "start" } };
  listener(message, { id: "bridge", url: "https://www.youtube.com/watch?v=1" });
  assert.equal(events.length, 0);
  listener(message, { id: "bridge", url: "chrome-extension://bridge/speech/offscreen.html" });
  assert.equal(events.length, 1);
});
test("отменённый прогрев не создаёт Worker после позднего открытия offscreen", async () => {
  let finish; const sent = [];
  const api = {
    runtime: { id: "bridge", getURL: path => `chrome-extension://bridge/${path}`, onMessage: { addListener() {} },
      async getContexts() { return []; }, sendMessage(message, callback) { sent.push(message); callback({ ok: true }); }
    }, offscreen: { createDocument: () => new Promise(resolve => { finish = resolve; }) }
  };
  const client = createBundledClient(api), pending = client.warmup(TEST_VOICES[0], "light");
  await new Promise(resolve => setImmediate(resolve)); await client.stop(); finish();
  assert.deepEqual(await pending, { cancelled: true });
  assert.equal(sent.some(message => message.type === "warmup"), false);
});
