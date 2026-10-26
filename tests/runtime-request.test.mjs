import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const scope = { setTimeout, clearTimeout };
vm.runInNewContext(await readFile(new URL("../extension/shared/runtime-request.js", import.meta.url), "utf8"), scope);
const request = scope.BridgeRuntime.request;

test("первое закрытие порта при чтении настроек восстанавливается без перезагрузки страницы", async () => {
  let count = 0;
  const api = { runtime: { sendMessage(message, callback) {
    count += 1;
    this.lastError = count <= 2 ? { message: "The message port closed before a response was received." } : null;
    callback(count <= 2 ? undefined : { ok: true, settings: { language: "ru-RU" } });
    this.lastError = null;
  } } };
  const result = await request(api, "bridge:read-preferences", {}, { wait: async () => {} });
  assert.equal(count, 3);
  assert.equal(result.settings.language, "ru-RU");
});

test("неопределённый ответ первого запуска повторяется, а постоянный обрыв имеет русское сообщение", async () => {
  let count = 0;
  const api = { runtime: { sendMessage(message, callback) { count += 1; callback(); } } };
  await assert.rejects(request(api, "bridge:voices", {}, { wait: async () => {} }), /Повторить запуск/);
  assert.equal(count, 4, "Количество повторов ограничено");
});

test("изменения настроек и явные ошибки обработчика не выполняются повторно", async () => {
  let count = 0;
  const api = { runtime: { sendMessage(message, callback) {
    count += 1; this.lastError = { message: "The message port closed before a response was received." }; callback(); this.lastError = null;
  } } };
  await assert.rejects(request(api, "bridge:select-language", { language: "ru-RU" }, { wait: async () => {} }));
  assert.equal(count, 1);
  api.runtime.sendMessage = (message, callback) => { count += 1; callback({ ok: false, error: "Ошибка хранилища" }); };
  await assert.rejects(request(api, "bridge:read-preferences", {}, { wait: async () => {} }), /Ошибка хранилища/);
  assert.equal(count, 2);
});
