import test from "node:test";
import assert from "node:assert/strict";
import { LANGUAGES, languageName, normalizeSettings, sampleFor } from "../extension/shared/preferences.js";
import { VOICE_SAMPLES } from "../extension/shared/voice-samples.js";

test("расширенный каталог сохраняет прежние языки и предоставляет новые без повторов", () => {
  assert.ok(LANGUAGES.length >= 150);
  assert.equal(new Set(LANGUAGES.map(({ code }) => code)).size, LANGUAGES.length);
  for (const code of ["ru-RU", "en-US", "uz-UZ", "kk-KZ", "de-DE", "es-ES", "fr-FR", "ja-JP", "ar-SA", "it-IT"]) {
    assert.equal(normalizeSettings({ language: code }).language, code);
  }
  for (const language of LANGUAGES) {
    assert.doesNotThrow(() => new Intl.Locale(language.code));
    assert.ok(language.name && language.sample);
    assert.equal(normalizeSettings({ sourceLanguage: language.code, language: language.code }).sourceLanguage, language.code);
    assert.equal(normalizeSettings({ language: language.code }).language, language.code);
    assert.equal(languageName(language.code), language.name);
    assert.equal(sampleFor(language.code), VOICE_SAMPLES[language.code.split('-')[0]] || language.sample);
  }
  assert.ok(sampleFor("fr-FR").startsWith("Bonjour"));
});

test("старые настройки получают Автоматически, явный исходный язык и язык результата независимы", () => {
  const migrated = normalizeSettings({ schemaVersion: 2, language: "de-DE", voiceName: "German voice" });
  assert.equal(migrated.sourceLanguage, "auto");
  assert.equal(migrated.language, "de-DE");
  assert.equal(migrated.voiceName, "German voice");
  assert.equal(normalizeSettings({ sourceLanguage: "fr-FR", language: "ja-JP" }).sourceLanguage, "fr-FR");
  assert.equal(normalizeSettings({ sourceLanguage: "bad-code", language: "ja-JP" }).language, "ja-JP");
  assert.equal(normalizeSettings({ sourceLanguage: "bad-code" }).sourceLanguage, "auto");
});
