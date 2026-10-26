import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, localVoices, normalizeSettings, prepareSpeech } from "../extension/shared/preferences.js";

const native = { voiceName: "Локальный русский", lang: "ru-RU", remote: false };

test("показ субтитров хранится отдельно от голоса и по умолчанию выключен", () => {
  for (const value of [undefined, null, false, "true", 1]) assert.equal(normalizeSettings({ showSubtitles: value }).showSubtitles, false);
  const saved = normalizeSettings({ showSubtitles: true, language: "de-DE", voiceName: "German", volume: 0.3 });
  assert.equal(saved.showSubtitles, true);
  assert.equal(saved.language, "de-DE");
  assert.equal(saved.voiceName, "German");
  assert.equal(saved.volume, 0.3);
});

test("повреждённые и неизвестные настройки заменяются безопасными значениями", () => {
  for (const value of [null, undefined, [], "broken"]) assert.deepEqual(normalizeSettings(value), DEFAULT_SETTINGS);
  const settings = normalizeSettings({ language: "javascript:bad", rate: NaN, volume: Infinity, voiceName: {}, cloud: true });
  assert.deepEqual(settings, DEFAULT_SETTINGS);
  assert.equal(normalizeSettings({ rate: 100, volume: -1 }).rate, 1.5);
  assert.equal(normalizeSettings({ rate: 100, volume: -1 }).volume, 0);
});

test("переход с тяжёлых голосов сохраняет языки, смешивание и явно выбранный голос ОС", () => {
  const previous = { ...DEFAULT_SETTINGS, schemaVersion: 5, sourceLanguage: "en-US", language: "ru-RU", voiceName: "Bridge — Женский (встроенный)", voiceGender: "female", volume: 0.47, duckingEnabled: false, rate: 1.2 };
  const settings = normalizeSettings(previous);
  assert.deepEqual(settings, { ...previous, schemaVersion: DEFAULT_SETTINGS.schemaVersion, voiceName: "", voiceGender: "any" });
  const native = normalizeSettings({ ...previous, voiceName: "Милена" });
  assert.equal(native.voiceName, "Милена");
  assert.equal(native.voiceGender, "female");
  assert.equal(normalizeSettings({ ...previous, voiceName: "" }).voiceGender, "any");
  assert.equal(normalizeSettings({ ...previous, schemaVersion: 6, voiceName: "" }).voiceGender, "female");
});

test("облачные, неподтверждённые и сторонние голоса никогда не предлагаются", () => {
  const voices = [native, { voiceName: "Cloud", lang: "ru-RU", remote: true }, { voiceName: "Unknown", lang: "ru-RU" }, { voiceName: "Third party", lang: "ru-RU", remote: false, extensionId: "other" }, null];
  assert.deepEqual(localVoices(voices), [{ voiceName: native.voiceName, lang: native.lang }]);
});

test("одинаковое имя у локального и облачного голоса не допускает неоднозначного выбора", () => {
  const voices = [native, { ...native, remote: true, extensionId: "cloud-provider" }];
  assert.deepEqual(localVoices(voices), []);
  assert.throws(() => prepareSpeech(voices, DEFAULT_SETTINGS, "Привет"), /Локальный голос недоступен/);
});

test("исчезнувший выбранный голос и отсутствующий язык не подменяются другим движком", () => {
  assert.throws(() => prepareSpeech([native], { ...DEFAULT_SETTINGS, voiceName: "Удалённый голос" }, "Текст"), /недоступен/);
  assert.throws(() => prepareSpeech([native], { ...DEFAULT_SETTINGS, language: "en-US" }, "Text"), /недоступен/);
});

test("тестовый текст не может передать SSML или ссылку на внешний аудиофайл движку", () => {
  const speech = prepareSpeech([native], DEFAULT_SETTINGS, '<?xml version="1.0"?><speak><audio src="https://example.com/file.mp3"/>Привет!</speak>');
  assert.equal(speech.text, "Привет!");
  assert.equal(speech.options.voiceName, native.voiceName);
  assert.equal(speech.options.lang, "ru-RU");
  assert.equal(speech.options.enqueue, false);
  assert.throws(() => prepareSpeech([native], DEFAULT_SETTINGS, " "), /Введите текст/);
  assert.throws(() => prepareSpeech([native], DEFAULT_SETTINGS, "x".repeat(501)), /500/);
});
