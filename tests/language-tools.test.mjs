import test from "node:test";
import assert from "node:assert/strict";
await import("../extension/youtube/language-tools.js");
const { matchesLanguage, isTranslationMenu } = globalThis.BridgeLanguageTools;
const { isTargetTrack, isTrackNotice } = globalThis.BridgeLanguageTools;

test("корейский → русский не подменяется русской ASR-дорожкой другого аудио", () => {
  assert.equal(isTargetTrack("Русский (создано автоматически)", "ru-RU", { sourceCode: "ko-KR", locale: "ru" }), false);
  assert.equal(isTargetTrack("Russian (auto-generated)", "ru-RU", { sourceCode: "ko-KR", locale: "en" }), false);
  assert.equal(isTargetTrack("Корейский (создано автоматически) >> Русский", "ru-RU", { sourceCode: "ko-KR", locale: "ru" }), true);
  assert.equal(isTargetTrack("Английский >> Русский", "ru-RU", { sourceCode: "ko-KR", locale: "ru" }), false);
  assert.equal(isTargetTrack("Русский", "ru-RU", { sourceCode: "ko-KR", locale: "ru" }), true);
  assert.equal(isTargetTrack("Русский (создано автоматически)", "ru-RU", { sourceCode: "ru-RU", locale: "ru" }), true);
});
test("подписи языковой дорожки не принимаются за реплику, обычный текст не отбрасывается", () => {
  const codes = ["ru-RU", "ko-KR", "en-US"];
  for (const label of ["Русский (создано автоматически)", "Русский создан автоматически", "Russian (auto-generated)", "Корейский >> Русский"]) assert.equal(isTrackNotice(label, codes, "ru"), true, label);
  for (const text of ["Этот текст создан автоматически", "Русский язык — это интересно.", "Обычная реплика."]) assert.equal(isTrackNotice(text, codes, "ru"), false, text);
});

test("полная подсказка YouTube с названием дорожки и настройками не является репликой", () => {
  const codes = ["ru-RU", "ko-KR", "en-US"];
  for (const text of [
    "Корейский (создано автоматически) >> Русский Для настройки нажмите на значок",
    "Корейский Русский (создано автоматически) Русский Для настройки нажмите на значок",
    "Русский (создано автоматически) Для настройки нажмите на значок",
    "Корейский → Русский\nДля настройки нажмите на значок ⚙",
    "Корейский Русский Для настройки нажмите на значок",
    "Korean (auto-generated) >> Russian Click for settings",
    "Русский (создано автоматически) Для настройки нажмите на значок " + " ".repeat(600),
  ]) assert.equal(isTrackNotice(text, codes, "ru"), true, text);
  for (const text of [
    "Для настройки нажмите на значок", // May be real dialogue without a track label / UI icon.
    "Нажмите на значок настроек, чтобы продолжить урок.",
    "Русский язык создан автоматически? Нет, это шутка.",
    "Корейский >> Русский — так называется наш урок.",
    "Это видео на русском. Для настройки нажмите на значок.",
  ]) assert.equal(isTrackNotice(text, codes, "ru"), false, text);
});

test("поддерживаются текущее меню YouTube «Перевести» и прежнее «Автоперевод»", () => {
  for (const label of ["Перевести", "Автоперевод", "Translate", "Auto-translate", "  ПЕРЕВЕСТИ  "]) {
    assert.equal(isTranslationMenu(label), true, label);
  }
  assert.equal(isTranslationMenu("Качество"), false);
  assert.equal(isTranslationMenu("Английский >> Русский"), false);
});

test("переведённая дорожка сравнивается по назначению, а не исходному языку", () => {
  assert.equal(matchesLanguage("English >> Russian", "ru-RU", "en"), true);
  assert.equal(matchesLanguage("English >> Russian", "en-US", "en"), false);
  assert.equal(matchesLanguage("Английский → Русский", "ru-RU", "ru"), true);
  assert.equal(matchesLanguage("English (auto-generated)", "en-US", "en"), true);
  assert.equal(matchesLanguage("Английский [авто]", "en-US", "ru"), true);
  assert.equal(matchesLanguage("Английский [авто]", "ru-RU", "ru"), false);
  assert.equal(matchesLanguage("Russian Sign Language", "ru-RU", "en"), false);
  assert.equal(matchesLanguage("Deutsch", "de-DE", "es"), true);
  assert.equal(matchesLanguage("Узбекский", "uz-UZ", "ru"), true);
  assert.equal(matchesLanguage("", "ru-RU", "ru"), false);
});
