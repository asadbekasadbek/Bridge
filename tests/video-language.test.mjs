import test from "node:test";
import assert from "node:assert/strict";
await import("../extension/youtube/video-language.js");
const { responseFromScript, sourceFromResponse } = globalThis.BridgeVideoLanguage;

test("при нескольких ASR-дорожках используется указанная исходная дорожка аудио", () => {
  const source = sourceFromResponse({ captions: { playerCaptionsTracklistRenderer: {
    audioTracks: [{ captionTrackIndices: [0, 1], defaultCaptionTrackIndex: 1 }], defaultAudioTrackIndex: 0,
    captionTracks: [{ languageCode: "ru", kind: "asr" }, { languageCode: "ko", kind: "asr", isTranslatable: true }]
  } } });
  assert.equal(source.code, "ko"); assert.equal(source.canTranslate, true);
});

test("язык берётся из автоматической исходной дорожки, а не сохранённого перевода", () => {
  const source = sourceFromResponse({ captions: { playerCaptionsTracklistRenderer: {
    defaultAudioTrackIndex: 0, audioTracks: [{ captionTrackIndices: [0, 1], defaultCaptionTrackIndex: 0 }],
    captionTracks: [
      { languageCode: "ru", name: { simpleText: "Русский" } },
      { languageCode: "en", kind: "asr", name: { simpleText: "Английский (создано автоматически)" }, isTranslatable: true }
    ], translationLanguages: [{ languageCode: "ru" }, { languageCode: "de" }]
  } } });
  assert.equal(source.code, "en");
  assert.equal(source.canTranslate, true);
  assert.deepEqual(source.translations, ["ru", "de"]);
});

test("JSON читается без выполнения кода, фигурные скобки и кавычки в названии безопасны", () => {
  const response = { videoDetails: { videoId: "current", title: 'A } { "quoted" video' } };
  const script = `var ytInitialPlayerResponse = ${JSON.stringify(response)}; throw new Error("must never run");`;
  assert.deepEqual(responseFromScript(script, "current"), response);
  assert.equal(responseFromScript(script, "different_video"), null, "Данные предыдущего ролика после SPA-перехода не принимаются");
  assert.equal(responseFromScript('var ytInitialPlayerResponse = {not: "json"};', "current"), null);
  assert.equal(sourceFromResponse(response), null, "Отсутствие дорожки не означает английский язык");
  assert.equal(sourceFromResponse({ captions: { playerCaptionsTracklistRenderer: { captionTracks: {} } } }), null,
    "Изменение формата данных YouTube не ломает подключение плеера");
});
