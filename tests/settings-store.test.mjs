import test from "node:test";
import assert from "node:assert/strict";
import { createSettingsStore } from "../extension/shared/settings-store.js";
import { DEFAULT_SETTINGS } from "../extension/shared/preferences.js";

test("показ субтитров сохраняется вместе с параллельной сменой языка и звука", async () => {
  let stored = { ...DEFAULT_SETTINGS, sourceLanguage: "en-US", voiceGender: "female", rate: 1.2 };
  const store = createSettingsStore({ readSettings: async () => ({ ...stored }), writeSettings: async (value) => { stored = value; return value; } });
  await Promise.all([store.setShowSubtitles(true), store.selectLanguage("de-DE"), store.patchAudio({ volume: 0.47 })]);
  assert.equal(stored.showSubtitles, true);
  assert.equal(stored.language, "de-DE");
  assert.equal(stored.sourceLanguage, "en-US");
  assert.equal(stored.voiceGender, "female");
  assert.equal(stored.rate, 1.2);
  assert.equal(stored.volume, 0.47);
  await store.setShowSubtitles(false);
  assert.equal(stored.showSubtitles, false);
  await assert.rejects(store.setShowSubtitles("false"));
});

test("скрытие загрузчика сохраняется независимо от языков и аудио", async () => {
  let stored = { ...DEFAULT_SETTINGS, language: "de-DE", voiceGender: "male" };
  const store = createSettingsStore({ readSettings: async () => ({ ...stored }), writeSettings: async (value) => { stored = value; return value; } });
  await store.setHideExternalDownloaders(false);
  assert.equal(stored.hideExternalDownloaders, false);
  assert.equal(stored.language, "de-DE");
  assert.equal(stored.voiceGender, "male");
  await assert.rejects(store.setHideExternalDownloaders("false"));
});

test("быстрый выбор языков сохраняет последний, не теряя скорость и громкость", async () => {
  let stored = { ...DEFAULT_SETTINGS, voiceName: "Русский голос", rate: 1.3, volume: 0.4 };
  const store = createSettingsStore({ readSettings: async () => ({ ...stored }), writeSettings: async (value) => {
    await new Promise((resolve) => setTimeout(resolve, 5)); stored = value; return value;
  } });
  await Promise.all([store.selectLanguage("en-US"), store.selectLanguage("de-DE"), store.selectLanguage("es-ES")]);
  assert.equal(stored.language, "es-ES");
  assert.equal(stored.voiceName, "");
  assert.equal(stored.rate, 1.3);
  assert.equal(stored.volume, 0.4);
  await assert.rejects(store.selectLanguage("unknown"));
  assert.equal(stored.language, "es-ES", "Недоступный язык не сбрасывает сохранённый выбор");
});

test("ошибка чтения не заменяет настройки значениями по умолчанию и не блокирует очередь", async () => {
  let stored = { ...DEFAULT_SETTINGS, language: "de-DE", voiceName: "German" };
  let fail = true;
  const store = createSettingsStore({ readSettings: async () => { if (fail) throw new Error("Storage failed"); return stored; },
    writeSettings: async (value) => { stored = value; return value; } });
  await assert.rejects(store.selectLanguage("ru-RU"), /Storage failed/);
  assert.equal(stored.language, "de-DE");
  fail = false;
  await store.selectLanguage("de-DE");
  assert.equal(stored.voiceName, "German");
});

test("изменения левого и правого языка не стирают друг друга и настройки голоса", async () => {
  let stored = { ...DEFAULT_SETTINGS, voiceName: "Russian voice", volume: 0.3 };
  const store = createSettingsStore({ readSettings: async () => ({ ...stored }),
    writeSettings: async (value) => { stored = value; return value; } });
  await Promise.all([store.selectSourceLanguage("en-US"), store.selectLanguage("fr-FR")]);
  assert.equal(stored.sourceLanguage, "en-US");
  assert.equal(stored.language, "fr-FR");
  assert.equal(stored.volume, 0.3);
  stored.voiceName = "French voice";
  await store.selectSourceLanguage("auto");
  assert.equal(stored.sourceLanguage, "auto");
  assert.equal(stored.language, "fr-FR");
  assert.equal(stored.voiceName, "French voice");
  await assert.rejects(store.selectSourceLanguage("unsupported"));
  assert.equal(stored.sourceLanguage, "auto");
});

test("смешивание, тип голоса и язык сохраняются независимо, аудиозапись не меняет другие поля", async () => {
  let stored = { ...DEFAULT_SETTINGS, voiceName: "Russian", rate: 1.3 };
  const store = createSettingsStore({ readSettings: async () => ({ ...stored }), writeSettings: async (value) => { stored = value; return value; } });
  await Promise.all([store.patchAudio({ volume: 0.7, duckingAmount: 0.47, language: "bad" }), store.selectVoiceGender("male"), store.selectLanguage("de-DE")]);
  assert.equal(stored.language, "de-DE");
  assert.equal(stored.voiceGender, "male");
  assert.equal(stored.voiceName, "");
  assert.equal(stored.volume, 0.7);
  assert.equal(stored.duckingAmount, 0.47);
  assert.equal(stored.rate, 1.3);
  await assert.rejects(store.selectVoiceGender("bad"));
});
