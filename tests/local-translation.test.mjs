import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const scope = { DOMException, AbortController, setTimeout, clearTimeout };
vm.runInNewContext(await readFile(new URL("../extension/platforms/local-translation.js", import.meta.url), "utf8"), scope);
const { createLocalTranslator, detectLanguage } = scope.BridgeLocalTranslation;
function fixture() {
  const calls = [], instances = [];
  const api = { Translator: {
    async availability() { return "downloadable"; },
    async create(options) {
      calls.push(options);
      const instance = { count: 0, destroyed: false, async translate(text) { this.count++; return `Перевод ${text}`; }, destroy() { this.destroyed = true; } };
      instances.push(instance); return instance;
    }
  } };
  return { api, calls, instances, translator: createLocalTranslator(api) };
}
test("языковая пара переиспользуется, повторные фразы не переводятся заново", async () => {
  const f = fixture();
  await f.translator.prepare("en-US", "ru-RU");
  assert.equal(await f.translator.translate("Hello"), "Перевод Hello");
  await f.translator.prepare("en-GB", "ru");
  assert.equal(await f.translator.translate("Hello"), "Перевод Hello");
  assert.equal(f.calls.length, 1); assert.equal(f.instances[0].count, 1);
  await f.translator.prepare("en", "de-DE");
  assert.equal(f.instances[0].destroyed, true);
  await f.translator.translate("Hello");
  assert.equal(f.calls.length, 2); assert.equal(f.instances[1].count, 1);
});
test("одинаковые запросы объединяются, отменённый запрос не запускает следующий перевод", async () => {
  const f = fixture(); await f.translator.prepare("en", "ru");
  let finish;
  f.instances[0].translate = () => { f.instances[0].count++; return new Promise((resolve) => { finish = resolve; }); };
  const first = f.translator.translate("one"), duplicate = f.translator.translate("one");
  const controller = new AbortController();
  const next = f.translator.translate("two", { signal: controller.signal });
  controller.abort(); await assert.rejects(next, { name: "AbortError" });
  finish("Первый"); assert.deepEqual(await Promise.all([first, duplicate]), ["Первый", "Первый"]);
  assert.equal(f.instances[0].count, 1);
});
test("отмена ожидания загрузки не мешает повторно использовать уже загруженный переводчик", async () => {
  const f = fixture(); let finish;
  f.api.Translator.create = () => new Promise((resolve) => { finish = resolve; });
  const controller = new AbortController();
  const prepare = f.translator.prepare("en", "ru", { signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve)); controller.abort();
  await assert.rejects(prepare, { name: "AbortError" });
  finish({ translate: async () => "Привет", destroy() {} });
  await f.translator.prepare("en", "ru"); assert.equal(await f.translator.translate("Hello"), "Привет");
});
test("неподдерживаемый браузер и пара языков дают конечную ошибку без облачного вызова", async () => {
  await assert.rejects(createLocalTranslator({}).prepare("en", "ru"), (error) => error.retryable === false && /Chrome 138/.test(error.message));
  const f = fixture(); f.api.Translator.availability = async () => "unavailable";
  await assert.rejects(f.translator.prepare("en", "ru"), (error) => error.retryable === false);
  assert.equal(f.calls.length, 0);
});
test("смена пары во время загрузки освобождает даже поздно созданный экземпляр", async () => {
  const f = fixture(); let finish;
  const create = f.api.Translator.create;
  f.api.Translator.create = options => options.targetLanguage === "ru" ? new Promise(resolve => { finish = resolve; }) : create(options);
  const first = f.translator.prepare("en", "ru");
  const rejected = assert.rejects(first, { name: "AbortError" });
  await new Promise(resolve => setImmediate(resolve));
  await f.translator.prepare("en", "de"); await rejected;
  const late = { destroyed: false, destroy() { this.destroyed = true; } }; finish(late);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(late.destroyed, true);
});
test("традиционный китайский не объединяется с упрощённым", async () => {
  const f = fixture(); await f.translator.prepare("en", "zh-TW");
  assert.equal(f.calls[0].targetLanguage, "zh-Hant");
  await f.translator.prepare("en", "zh-CN");
  assert.equal(f.calls[1].targetLanguage, "zh");
});
test("освобождение памяти не удаляет языковой пакет: следующий перевод создаёт новый экземпляр", async () => {
  const f=fixture();await f.translator.prepare('en','ru');f.translator.destroy(true);
  assert.equal(f.instances[0].destroyed,true);
  assert.match(await f.translator.translate('Hello'),/Перевод/);assert.equal(f.calls.length,2);
});
test("смена пары во время перевода не возвращает старый результат, кэш ограничен", async () => {
  const f = fixture(); await f.translator.prepare("en", "ru");
  let finish; f.instances[0].translate = () => new Promise((resolve) => { finish = resolve; });
  const old = f.translator.translate("one");
  await f.translator.prepare("en", "de"); finish("Устарело"); await assert.rejects(old, { name: "AbortError" });
  for (let i = 0; i < 130; i++) await f.translator.translate(String(i));
  await f.translator.translate("0"); assert.equal(f.instances[1].count, 131);
});
test("автоопределение использует уверенный результат локального Chrome i18n", async () => {
  const api = { runtime: {}, i18n: { detectLanguage(text, callback) { callback({ isReliable: true, languages: [{ language: "en", percentage: 99 }] }); } } };
  assert.equal(await detectLanguage("At first I tried to reply to everyone individually.", api), "en");
  assert.equal(await detectLanguage("Hi", api), "");
  api.i18n.detectLanguage = (text, callback) => callback({ isReliable: false, languages: [{ language: "en", percentage: 100 }] });
  assert.equal(await detectLanguage("English must not be spoken with a Russian voice.", api), "en");
  assert.equal(await detectLanguage("This is a test.", api), "");
});
test("заранее отменённая подготовка не проверяет и не загружает языковой пакет", async () => {
  const f = fixture(), controller = new AbortController(); controller.abort();
  f.api.Translator.availability = async () => assert.fail("Отменённый запрос не должен начинать работу");
  await assert.rejects(f.translator.prepare("en", "ru", { signal: controller.signal }), { name: "AbortError" });
  assert.equal(f.calls.length, 0);
});
test("ожидающая реплика после смены пары не переводится на новый язык", async () => {
  const f = fixture(); await f.translator.prepare("en", "ru"); let finish;
  f.instances[0].translate = () => new Promise(resolve => { finish = resolve; });
  const old = f.translator.translate("first"), waiting = f.translator.translate("waiting");
  const oldRejected = assert.rejects(old, { name: "AbortError" }), waitingRejected = assert.rejects(waiting, { name: "AbortError" });
  await f.translator.prepare("en", "de"); finish("Устарело"); await Promise.all([oldRejected, waitingRejected]);
  assert.equal(f.instances[1].count, 0);
});
test("совпадающий язык освобождает прежнюю пару и её кэш", async () => {
  const f = fixture(); await f.translator.prepare("en", "ru"); await f.translator.translate("Hello");
  await f.translator.prepare("en", "en"); assert.equal(f.instances[0].destroyed, true);
  await assert.rejects(f.translator.translate("Hello"), /ещё не готов/);
});
