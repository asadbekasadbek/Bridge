import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, genderOfVoice, localVoices, matchingVoices, normalizeSettings, prepareSpeech } from "../extension/shared/preferences.js";

const inventory = [
  { voiceName: "Милена", lang: "ru-RU", remote: false },
  { voiceName: "Microsoft Pavel Desktop", lang: "ru-RU", remote: false },
  { voiceName: "Unclassified", lang: "ru-RU", remote: false },
  { voiceName: "Cloud male", lang: "ru-RU", gender: "male", remote: true }
];
test("названия системных голосов учитывают оформление, целые слова и явные метаданные", () => {
  for (const [voiceName, gender] of [["Samantha (Enhanced)", "female"], ["Microsoft David Desktop", "male"], ["Павел (Premium)", "male"], ["Milena / Pavel", "female"], ["Davida", ""], ["Unknown (Samantha)", ""]]) {
    assert.equal(genderOfVoice({ voiceName }), gender);
  }
  assert.equal(genderOfVoice({ voiceName: "Samantha", gender: "male" }), "male");
});
test("выбирается конкретный мужской или женский голос, неизвестный тип не угадывается", () => {
  const voices = localVoices(inventory);
  assert.deepEqual(matchingVoices(voices, "ru-RU", "female").map((voice) => voice.voiceName), ["Милена"]);
  assert.deepEqual(matchingVoices(voices, "ru-RU", "male").map((voice) => voice.voiceName), ["Microsoft Pavel Desktop"]);
  assert.equal(matchingVoices(voices, "ru-RU", "any").length, 3);
  const male = prepareSpeech(inventory, { ...DEFAULT_SETTINGS, voiceGender: "male" }, "Привет!");
  assert.equal(male.options.voiceName, "Microsoft Pavel Desktop");
  assert.equal(male.options.pitch, 1);
  assert.equal(male.options.gender, undefined, "Не используется игнорируемый Chrome параметр gender");
  assert.throws(() => prepareSpeech([inventory[0]], { ...DEFAULT_SETTINGS, voiceGender: "male" }, "Привет!"), /недоступен/);
  assert.throws(() => prepareSpeech(inventory, { ...DEFAULT_SETTINGS, voiceGender: "male", voiceName: "Милена" }, "Привет!"), /недоступен/);
});
test("новые поля безопасно мигрируют и сохраняют явное отключение приглушения", () => {
  const migrated = normalizeSettings({ schemaVersion: 3, language: "de-DE", voiceName: "German", rate: 1.2, volume: 0.3 });
  assert.equal(migrated.voiceGender, "any");
  assert.equal(migrated.duckingAmount, 0.6);
  assert.equal(migrated.language, "de-DE");
  assert.equal(migrated.voiceName, "German");
  assert.equal(normalizeSettings({ voiceGender: "bad", duckingEnabled: false, duckingAmount: 5 }).duckingEnabled, false);
  assert.equal(normalizeSettings({ duckingAmount: 5 }).duckingAmount, 1);
  assert.equal(normalizeSettings({ duckingAmount: -1 }).duckingAmount, 0);
});
