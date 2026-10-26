import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { resourceProfile } from "../extension/shared/resource-profile.js";

test("offscreen сохраняет Worker и модель после остановки и открытия следующего видео", async () => {
  let listener, created = 0, terminated = 0, idleCallback, idleDelay;
  const messages = [];
  const scope = {
    setInterval() {},
    setTimeout(fn,delay){idleCallback=fn;idleDelay=delay;return 0;}, clearTimeout(){}, resourceProfile,
    Worker: class { constructor() { created += 1; } postMessage(message) { messages.push(message); } terminate() { terminated += 1; } },
    chrome: { runtime: { id: "bridge", getURL: (path) => `chrome-extension://bridge/${path}`,
      onMessage: { addListener(fn) { listener = fn; } }, sendMessage() {} } }
  };
  vm.runInNewContext((await readFile(new URL("../extension/speech/offscreen.js", import.meta.url), "utf8")).replace(/^import .*;\n/gm,''), scope);
  const send = (message) => listener({ target: "bridge-voice", ...message }, { id: "bridge" }, () => {});
  send({ type: "warmup" });
  send({ type: "speak", id: "one", text: "Первая.", speaker: 0, rate: 1 });
  send({ type: "stop" });
  send({ type: "warmup" });
  send({ type: "speak", id: "two", text: "Другая.", speaker: 0, rate: 1 });
  assert.equal(created, 1);
  assert.equal(terminated, 0);
  assert.deepEqual(messages.filter((message) => message.type === "speak").map((message) => message.id), ["one", "two"]);
  assert.ok(messages.some((message) => message.type === "cancel"));
  send({type:'stop'});assert.equal(idleDelay,60000);idleCallback();assert.equal(terminated,1);
  send({type:'warmup'});assert.equal(created,2);
  send({type:'configure',resourceMode:'balanced'});assert.equal(idleDelay,180000);
});
