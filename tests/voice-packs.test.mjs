import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createPackInstaller, verifyPackFile } from "../extension/shared/voice-pack-installer.js";
import { VOICE_PACKS } from "../extension/shared/voice-pack-catalogue.js";
import { LANGUAGES } from "../extension/shared/languages.js";
const bytes = new TextEncoder().encode("model bytes");
const file = { path: "en/en_US/test/medium/test.onnx", bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
const pack = { id: "test", lang: "en-US", gender: "female", voiceName: "Test", revision: "a".repeat(40), model: file, config: { ...file, path: "test.json" } };
async function finished(installer) { for (let i=0;i<100;i++) { if (!installer.snapshot().busy) return installer.snapshot(); await new Promise(resolve=>setImmediate(resolve)); } assert.fail("Установка не закончилась"); }
test("каталог включает английские голоса, но не встраивает их в основной пакет", () => {
  assert.deepEqual(VOICE_PACKS.filter(voice=>voice.lang==='en-US').map(voice=>voice.gender).sort(), ['female','male']);
  assert.equal(VOICE_PACKS.some(pack=>pack.bundledPath),false);
  assert.equal(VOICE_PACKS.some(pack=>pack.lang.startsWith('uz')),false);
  for (const pack of VOICE_PACKS) assert.ok(LANGUAGES.some(language=>language.code.split('-')[0]===pack.lang.split('-')[0]), `${pack.id}: язык должен быть доступен для выбора`);
});
test("повреждённые и неполные файлы не устанавливаются", async () => {
  await assert.rejects(verifyPackFile(new ArrayBuffer(1), file), /не полностью/);
  await assert.rejects(verifyPackFile(new Uint8Array(bytes.byteLength).buffer, file), /сумма/);
  await verifyPackFile(bytes.buffer, file);
});
test("второй официальный адрес используется при ошибке первого; установка атомарна", async () => {
  const urls=[], saved=[];
  const installer=createPackInstaller({ catalogue:[pack], installed:async()=>[], save:async record=>saved.push(record), fetchFile:async url=>{ urls.push(url); if(!url.includes('?')) return new Response('',{status:503}); return new Response(bytes); } });
  installer.start(['test']); const result=await finished(installer);
  assert.equal(result.phase,'done'); assert.equal(saved.length,1); assert.equal(urls.length,4);
  assert.ok(urls.every(url=>url.startsWith('https://huggingface.co/rhasspy/piper-voices/resolve/')));
  assert.equal(saved[0].model.byteLength,bytes.byteLength);
});
test("пакет с ошибочной суммой не публикуется, уже установленный голос не скачивается", async () => {
  const saved=[]; let requests=0;
  const installer=createPackInstaller({ catalogue:[pack], installed:async()=>[], save:async record=>saved.push(record), fetchFile:async()=>{requests++;return new Response(new Uint8Array(bytes.byteLength));} });
  installer.start(['test']); assert.equal((await finished(installer)).phase,'error'); assert.equal(saved.length,0);
  const existing=createPackInstaller({ catalogue:[pack], installed:async()=>['test'], save:async()=>assert.fail(), fetchFile:async()=>assert.fail() });
  existing.start(['test']); assert.equal((await finished(existing)).phase,'done'); assert.equal(requests,2);
});
test("произвольный URL, неизвестный id и повторный пакет отклоняются", () => {
  const installer=createPackInstaller({catalogue:[pack]});
  for(const ids of [['https://evil.test/model'],['test','test'],[],['test','test','test']]) assert.throws(()=>installer.start(ids),/доступный/);
});
test("отмена загрузки не оставляет частично установленного голоса", async () => {
  let saved=0;
  const installer=createPackInstaller({catalogue:[pack],installed:async()=>[],save:async()=>{saved++;},fetchFile:(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}))});
  installer.start(['test']); await new Promise(resolve=>setImmediate(resolve)); installer.cancel();
  assert.equal((await finished(installer)).phase,'cancelled'); assert.equal(saved,0);
});
test("отмена во время проверки конфигурации не публикует пакет", async () => {
  let verified, finish, saved = 0;
  const checking = new Promise(resolve => { verified = resolve; });
  const installer = createPackInstaller({
    catalogue: [pack], installed: async () => [], fetchFile: async () => new Response(bytes),
    save: async () => { saved++; },
    verify: async (buffer, file) => {
      await verifyPackFile(buffer, file);
      if (file.path.endsWith(".json")) { verified(); await new Promise(resolve => { finish = resolve; }); }
    }
  });
  installer.start([pack.id]); await checking; installer.cancel(); finish();
  assert.equal((await finished(installer)).phase, "cancelled");
  assert.equal(saved, 0);
});
test("поток слишком большого файла отменяется и освобождается перед повтором", async () => {
  let cancelled = 0, released = 0, saved = 0;
  const installer = createPackInstaller({
    catalogue: [pack], installed: async () => [], save: async () => { saved++; },
    fetchFile: async () => ({ ok: true, body: { getReader: () => ({
      async read() { return { value: new Uint8Array(file.bytes + 1), done: false }; },
      async cancel() { cancelled++; }, releaseLock() { released++; }
    }) } })
  });
  installer.start([pack.id]); assert.equal((await finished(installer)).phase, "error");
  assert.equal(saved, 0); assert.equal(cancelled, 2); assert.equal(released, 2);
});
test("оборванный поток отклоняется до проверки суммы и не дополняется нулями", async () => {
  const installer = createPackInstaller({
    catalogue: [pack], installed: async () => [], fetchFile: async () => new Response(bytes.subarray(0, 2)),
    verify: async () => assert.fail("Неполный файл нельзя проверять как полный"), save: async () => assert.fail()
  });
  installer.start([pack.id]); assert.equal((await finished(installer)).phase, "error");
});
