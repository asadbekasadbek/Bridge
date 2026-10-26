import test from "node:test";
import assert from "node:assert/strict";
import "../extension/shared/ui-language.js";
import { DEFAULT_SETTINGS, normalizeSettings } from "../extension/shared/preferences.js";
import { createSettingsStore } from "../extension/shared/settings-store.js";
const ui = globalThis.BridgeI18n;

test("язык интерфейса нормализуется независимо от исходного языка и голоса", () => {
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, uiLanguage: "uz", sourceLanguage: "ko-KR", language: "ru-RU", voiceName: "Installed voice" });
  assert.equal(settings.uiLanguage, "uz"); assert.equal(settings.sourceLanguage, "ko-KR");
  assert.equal(settings.language, "ru-RU"); assert.equal(settings.voiceName, "Installed voice");
  assert.equal(normalizeSettings({ uiLanguage: "unknown" }).uiLanguage, "ru");
});
test("выбор языка интерфейса не затирает параллельные настройки", async () => {
  let stored = { ...DEFAULT_SETTINGS, sourceLanguage: "ko-KR", voiceName: "Installed voice" };
  const store = createSettingsStore({ readSettings: async () => ({ ...stored }), writeSettings: async value => { stored = value; return value; } });
  await Promise.all([store.selectUiLanguage("en"), store.patchAudio({ volume: 0.62 })]);
  assert.equal(stored.uiLanguage, "en"); assert.equal(stored.language, "ru-RU");
  assert.equal(stored.sourceLanguage, "ko-KR"); assert.equal(stored.voiceName, "Installed voice"); assert.equal(stored.volume, 0.62);
  await assert.rejects(store.selectUiLanguage("unsupported"));
  assert.equal(stored.uiLanguage, "en");
});
test("статические и динамические тексты интерфейса переводятся локально", () => {
  ui.setLocale("en");
  assert.equal(ui.translate("Настройки Bridge"), "Bridge settings");
  assert.equal(ui.translate("Русская реплика из самого видео."), "Русская реплика из самого видео.");
  assert.equal(ui.translate("Женский · 2"), "Female · 2");
  assert.equal(ui.translate("Во время речи оригинал тише на 60%."), "Original audio is lowered by 60% during speech.");
  assert.equal(ui.translate(" ✓ Настройки сохранены на компьютере. "), " ✓ Settings saved on this computer. ");
  assert.equal(ui.translate("Язык: Russian. Установите только нужный голос; остальные не скачиваются."), "Language: Russian. Install only the voice you need; others are not downloaded.");
  ui.setLocale("uz");
  assert.equal(ui.translate("Настройки Bridge"), "Bridge sozlamalari");
  assert.equal(ui.translate("Женский · 2"), "Ayol · 2");
  assert.match(ui.translate("Сохранено. Приглушение выключено: оригинал звучит с громкостью плеера. Громкость голоса меняется со следующей реплики."), /^Saqlandi\./);
  assert.ok(!/[А-Яа-яЁё]/.test(ui.translate("Сохранено. Приглушение выключено: оригинал звучит с громкостью плеера. Громкость голоса меняется со следующей реплики.")));
  ui.setLocale("ru"); assert.equal(ui.translate("Настройки Bridge"), "Настройки Bridge");
});
