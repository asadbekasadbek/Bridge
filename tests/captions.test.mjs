import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const scope = {};
vm.runInNewContext(await readFile(new URL("../extension/youtube/caption-tools.js", import.meta.url), "utf8"), scope);
const { normalizeCaption, captionDifference, phraseIsReady } = scope.BridgeCaptionTools;

test("прокатка строк автосубтитров не повторяет уже произнесённые слова", () => {
  assert.equal(captionDifference("Привет мир", "Привет мир это проверка").text, "это проверка");
  assert.equal(captionDifference("Привет мир", "мир это проверка").text, "это проверка");
  assert.equal(captionDifference("Привет мир", "Привет мир").text, "");
  assert.equal(captionDifference("Привет мир", "Привет").text, "");
});

test("новая отдельная реплика не теряется, а пустой слой не озвучивается", () => {
  assert.equal(captionDifference("Привет мир", "Следующая фраза").text, "Следующая фраза");
  assert.equal(captionDifference("Привет мир", "").text, "");
  assert.equal(captionDifference("", "Повторная реплика").text, "Повторная реплика");
});

test("текст ограничен одной короткой репликой, HTML и невидимые разделители удаляются", () => {
  assert.equal(normalizeCaption("<c>Привет</c>\n  мир\u200b"), "Привет мир");
  assert.equal(normalizeCaption("a".repeat(10000)).length, 500);
  assert.equal(normalizeCaption(null), "");
});

test("короткие фрагменты ждут фразу, пунктуация сама по себе не запускает речь", () => {
  assert.equal(phraseIsReady("i", 0), false);
  assert.equal(phraseIsReady("Привет мир", 0), false);
  assert.equal(phraseIsReady("Привет мир.", 0), true);
  assert.equal(phraseIsReady("Привет мир", 1400), true);
  assert.equal(phraseIsReady("Привет мир", 649), false);
  assert.equal(phraseIsReady("Привет мир", 650), true);
  assert.equal(phraseIsReady("Это уже полная длинная фраза", 0), false);
  assert.equal(phraseIsReady("Когда мы пришли домой и открыли входную дверь,", 0), true);
  assert.equal(phraseIsReady("Это длинная строка без знаков завершения и она ещё продолжается потому что говорящий не закончил", 0), false);
  assert.equal(phraseIsReady("你明天会来吗？", 0), true);
  assert.equal(phraseIsReady(", ***", 2000), false);
});
