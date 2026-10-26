import test from "node:test";
import assert from "node:assert/strict";
import { cleanSpeechText, speechMarkup } from "../extension/shared/speech-text.js";
import { DEFAULT_SETTINGS, normalizeSettings, prepareSpeech, localVoices } from "../extension/shared/preferences.js";

const native = { voiceName: "Local Russian", lang: "ru-RU", remote: false };

test("оформление и пометки звуков не превращаются в произносимые слова", () => {
  assert.equal(cleanSpeechText("<i>Привет</i>, **мир**! [Музыка] ♪"), "Привет, мир!");
  assert.equal(cleanSpeechText("[i] Привет i мир [/i]"), "Привет мир");
  assert.equal(cleanSpeechText("i , *** [Музыка]"), "");
  for (const text of [",", "***", "♫", "<i></i>", "[applause]", "(смех)"]) assert.equal(cleanSpeechText(text), "");
});

test("английское I и смысловые слова внутри реплики сохраняются", () => {
  assert.equal(cleanSpeechText("I think I understand.", "en-US"), "I think I understand.");
  assert.equal(cleanSpeechText("I think I understand.", "ru-RU"), "I think I understand.");
  assert.equal(cleanSpeechText("Он сказал слово запятая."), "Он сказал слово запятая.");
});

test("интонационные знаки, сокращения и числа передаются голосу без искусственных пауз", () => {
  const text = "Ты придёшь? Да, конечно! Это 3,5 метра, т. е. совсем рядом…";
  const markup = speechMarkup(text);
  assert.equal(markup, `<?xml version="1.0"?><speak>${text}</speak>`);
  assert.ok(!markup.includes("<break"));
  const prepared = prepareSpeech([native], DEFAULT_SETTINGS, "**Ты придёшь?** Да, конечно!");
  assert.ok(prepared.utterance.includes("Ты придёшь? Да, конечно!"));
});

test("SSML создаётся только расширением, пользовательские теги и внешнее аудио удаляются", () => {
  const speech = prepareSpeech([native], DEFAULT_SETTINGS, '&lt;audio src="https://example.com/file"/&gt; Привет &amp; мир.');
  assert.equal(speech.text, "Привет & мир.");
  assert.ok(!speech.utterance.includes("<audio"));
  assert.ok(!speech.utterance.includes("https://"));
  assert.ok(speech.utterance.includes("&amp;"));
});

test("фрагменты из одних символов пропускаются, сеанс не считается сломанным", () => {
  const speech = prepareSpeech([native], DEFAULT_SETTINGS, ", *** i");
  assert.equal(speech.skipped, true);
  assert.equal(speech.text, "");
});

test("старые настройки мигрируют с плавным чтением, явный выбор режима сохраняется", () => {
  assert.equal(normalizeSettings({ schemaVersion: 1, language: "en-US", rate: 1.2 }).naturalSpeech, true);
  assert.equal(normalizeSettings({ naturalSpeech: false }).naturalSpeech, false);
});

test("улучшенные локальные голоса получают приоритет, облачный Premium остаётся исключён", () => {
  const voices = localVoices([native, { ...native, voiceName: "Russian Enhanced" }, { ...native, voiceName: "Russian Premium" }, { ...native, voiceName: "Cloud Premium", remote: true }]);
  assert.deepEqual(voices.map((voice) => voice.voiceName), ["Russian Premium", "Russian Enhanced", "Local Russian"]);
});
