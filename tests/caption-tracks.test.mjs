import test from "node:test";
import assert from "node:assert/strict";
import "../extension/platforms/caption-tracks.js";

test("поиск следующей реплики не обходит длинную дорожку целиком", () => {
  let reads = 0;
  const cues = new Proxy({ length: 100000 }, { get(target, key) {
    if (key === "length") return target.length;
    reads++;
    const index = Number(key);
    return index < target.length ? { startTime: index * 2, text: String(index) } : undefined;
  } });
  const { nextCue } = globalThis.BridgeCaptionTracks;
  assert.equal(nextCue(cues, 100000).text, "50001");
  assert.ok(reads <= 19, `Чтений: ${reads}`);
  assert.equal(nextCue([], 0), null);
  assert.equal(nextCue([{ startTime: 12 }], 0), null);
  assert.equal(nextCue([{ startTime: 1 }, { startTime: 1 }, { startTime: 2 }], 1).startTime, 2);
  assert.equal(nextCue(cues, NaN), null);
});
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const scope = {};
vm.runInNewContext(await readFile(new URL("../extension/platforms/caption-tracks.js", import.meta.url), "utf8"), scope);
const { createTrackReader, tracksOf, selectTrack } = scope.BridgeCaptionTracks;
function track(language, mode = "disabled", kind = "subtitles") {
  return Object.assign(new EventTarget(), { language, label: language, mode, kind, activeCues: [{ text: `${language} text` }] });
}
function setup() {
  const english = track("en", "showing"), russian = track("ru-RU"), metadata = track("ru", "hidden", "metadata");
  const textTracks = Object.assign(new EventTarget(), { [Symbol.iterator]: function* () { yield english; yield russian; yield metadata; } });
  const changes = [], invalid = [], reader = createTrackReader(() => changes.push(true), (reason) => invalid.push(reason));
  reader.attach({ textTracks });
  return { reader, english, russian, metadata, textTracks, changes, invalid };
}
test("текст берётся только из подтверждённой языковой дорожки, метаданные исключены", () => {
  const f = setup();
  assert.equal(tracksOf({ textTracks: f.textTracks }).length, 2);
  assert.equal(selectTrack(tracksOf({ textTracks: f.textTracks }), "ru"), f.russian);
  assert.equal(f.reader.select("de-DE"), null);
  assert.equal(f.reader.text(), "");
  f.reader.select("ru-RU", "en-US");
  assert.equal(f.russian.mode, "hidden");
  assert.equal(f.english.mode, "disabled");
  assert.equal(f.metadata.mode, "hidden");
  assert.equal(f.reader.text(), "ru-RU text");
  assert.throws(() => f.reader.select("ru", "fr-FR"), /исходной/);
});
test("показ текста не меняет выбранный язык и не требует повторной озвучки; stop восстанавливает прежние режимы", () => {
  const f = setup();
  f.reader.select("ru");
  f.reader.show(true); assert.equal(f.russian.mode, "showing");
  f.reader.show(false); assert.equal(f.russian.mode, "hidden");
  f.russian.dispatchEvent(new Event("cuechange")); assert.equal(f.changes.length, 1);
  f.reader.release();
  assert.equal(f.english.mode, "showing");
  assert.equal(f.russian.mode, "disabled");
  f.russian.dispatchEvent(new Event("cuechange")); assert.equal(f.changes.length, 1);
  assert.equal(f.reader.text(), "");
});
test("смена дорожки в плеере прекращает чтение, stop не стирает ручные изменения пользователя", () => {
  const f = setup();
  f.reader.select("ru");
  f.russian.mode = "disabled"; f.english.mode = "hidden";
  f.textTracks.dispatchEvent(new Event("change"));
  assert.equal(f.invalid.length, 1);
  assert.equal(f.reader.text(), "");
  f.reader.release();
  assert.equal(f.english.mode, "hidden");
});

test("дорожка CC1 без языка разрешается только при явном выборе одного и того же языка, перевод не имитируется", () => {
  const cc = track("", "disabled", "captions"), reader = createTrackReader();
  reader.attach({ textTracks: Object.assign(new EventTarget(), { [Symbol.iterator]: function* () { yield cc; } }) });
  assert.equal(reader.select("ru-RU"), null);
  assert.throws(() => reader.select("ru-RU", "en-US"), /исходной/);
  assert.equal(reader.text(), "");
  assert.equal(reader.select("en-US", "en-US"), cc);
  assert.equal(reader.text(), " text");
});
