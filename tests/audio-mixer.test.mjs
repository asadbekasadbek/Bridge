import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const scope = { setTimeout, clearTimeout };
const mixerSource = await readFile(new URL("../extension/youtube/audio-mixer.js", import.meta.url), "utf8");
vm.runInNewContext(mixerSource, scope);
const { createVideoMixer } = scope.BridgeAudioMixer;
function media(volume = 0.8, asynchronous = false) {
  const listeners = new Map();
  return {
    muted: false,
    get volume() { return volume; },
    set volume(value) { volume = value; if (asynchronous) queueMicrotask(() => listeners.get("volumechange")?.()); else listeners.get("volumechange")?.(); },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); }
  };
}
const equalVolume = (video, value) => assert.ok(Math.abs(video.volume - value) < 0.00001, `${video.volume} != ${value}`);

function timedMixer(options = {}) {
  let now = 0, nextId = 0;
  const timers = new Map(), scope = {
    Date: { now: () => now },
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  vm.runInNewContext(mixerSource, scope);
  return { mixer: scope.BridgeAudioMixer.createVideoMixer(options), advance(ms) {
    const until = now + ms;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]); now = next[1].at; next[1].callback();
    }
    now = until;
  } };
}

test("короткая пауза между репликами не поднимает оригинал до полной громкости", () => {
  const video = media(), { mixer, advance } = timedMixer();
  mixer.attach(video); mixer.configure({ duckingAmount: 0.6 }); mixer.speaking(true); advance(200);
  equalVolume(video, 0.32);
  mixer.speaking(false); advance(400); equalVolume(video, 0.32);
  mixer.speaking(true); advance(200); equalVolume(video, 0.32);
  mixer.speaking(false); advance(1100); equalVolume(video, 0.8);
});

test("округление громкости плеером не выключает приглушение на первом шаге", () => {
  let volume = 0.83, listener;
  const video = {
    get volume() { return volume; },
    set volume(value) { volume = Math.round(value * 100) / 100; listener?.(); },
    addEventListener(type, callback) { listener = callback; }, removeEventListener() { listener = null; }
  };
  const { mixer, advance } = timedMixer();
  mixer.attach(video); mixer.configure({ duckingAmount: 0.47 }); mixer.speaking(true); advance(1000);
  equalVolume(video, 0.44);
  mixer.stop(); equalVolume(video, 0.83);
});

test("событие mute при выключенном приглушении не блокирует его включение", () => {
  let listener;
  const video = { volume: 0.8, muted: false, addEventListener(type, callback) { listener = callback; }, removeEventListener() {} };
  const mixer = createVideoMixer({ duration: 0 }); mixer.attach(video);
  mixer.configure({ duckingEnabled: false }); mixer.speaking(true);
  video.muted = true; listener();
  mixer.configure({ duckingEnabled: true, duckingAmount: 0.6 }); equalVolume(video, 0.32);
  assert.equal(video.muted, true); mixer.stop();
});

test("повторное применение тех же настроек не перезапускает плавное приглушение", () => {
  const video = media(), { mixer, advance } = timedMixer();
  mixer.attach(video); mixer.configure({ duckingAmount: 0.6 }); mixer.speaking(true);
  for (let i = 0; i < 25; i++) { advance(10); mixer.configure({ duckingEnabled: true, duckingAmount: 0.6 }); }
  equalVolume(video, 0.32);
  mixer.stop();
});
test("повторный конец реплики не отменяет восстановление громкости", () => {
  const video = media(), { mixer, advance } = timedMixer();
  mixer.attach(video); mixer.speaking(true); advance(200);
  mixer.speaking(false); advance(200); mixer.speaking(false); advance(1000);
  equalVolume(video, 0.8);
});
test("явная смена силы приглушения действует после ручной регулировки плеера", () => {
  const video = media(), mixer = createVideoMixer({ duration: 0 });
  mixer.attach(video); mixer.speaking(true); video.volume = 0.7;
  mixer.configure({ duckingAmount: 0.5 }); equalVolume(video, 0.35);
  mixer.stop(); equalVolume(video, 0.7);
});

test("оригинал приглушается только во время речи и восстанавливается без изменения mute", () => {
  const video = media(), mixer = createVideoMixer({ duration: 0, releaseDelay: 0 });
  mixer.attach(video); mixer.configure({ duckingAmount: 0.6 });
  equalVolume(video, 0.8);
  video.muted = true;
  mixer.speaking(true); equalVolume(video, 0.32);
  mixer.speaking(false); equalVolume(video, 0.8);
  assert.equal(video.muted, true);
  mixer.stop();
});

test("силу можно менять во время речи и отключать без выключения озвучки", () => {
  const video = media(), mixer = createVideoMixer({ duration: 0 });
  mixer.attach(video); mixer.speaking(true);
  mixer.configure({ duckingAmount: 1 }); equalVolume(video, 0);
  mixer.configure({ duckingAmount: 0 }); equalVolume(video, 0.8);
  mixer.configure({ duckingEnabled: false }); equalVolume(video, 0.8);
  mixer.configure({ duckingEnabled: true, duckingAmount: 0.5 }); equalVolume(video, 0.4);
  mixer.stop(); equalVolume(video, 0.8);
});

test("ручное изменение громкости YouTube сохраняется после отключения Bridge", () => {
  const video = media(), mixer = createVideoMixer({ duration: 0, releaseDelay: 0 });
  mixer.attach(video); mixer.speaking(true);
  video.volume = 0.7;
  equalVolume(video, 0.7);
  mixer.speaking(false); equalVolume(video, 0.7);
  mixer.configure({ duckingAmount: 0.5 });
  mixer.speaking(true); equalVolume(video, 0.35);
  mixer.stop(); equalVolume(video, 0.7);
});

test("замена плеера возвращает громкость прежнему и не переносит её на новый", () => {
  const first = media(0.8), next = media(0.3), mixer = createVideoMixer({ duration: 0 });
  mixer.attach(first); mixer.speaking(true);
  mixer.attach(next); equalVolume(first, 0.8); equalVolume(next, 0.3);
  mixer.speaking(true); equalVolume(next, 0.12);
  mixer.attach(null); equalVolume(next, 0.3);
});

test("плавный переход и отложенное восстановление отменяются при новой реплике или stop", async () => {
  const video = media(), mixer = createVideoMixer({ duration: 20, releaseDelay: 15 });
  const wait = () => new Promise((resolve) => setTimeout(resolve, 55));
  mixer.attach(video); mixer.speaking(true); await wait(); equalVolume(video, 0.32);
  mixer.speaking(false); mixer.speaking(true); await wait(); equalVolume(video, 0.32);
  mixer.speaking(false); mixer.stop(); await wait(); equalVolume(video, 0.8);
});

test("асинхронное volumechange после восстановления не принимается за ручную регулировку", async () => {
  const video = media(0.8, true), mixer = createVideoMixer({ duration: 0 });
  mixer.attach(video); mixer.speaking(true); await Promise.resolve();
  mixer.configure({ duckingEnabled: false }); await Promise.resolve();
  mixer.configure({ duckingEnabled: true, duckingAmount: 0.5 }); await Promise.resolve();
  equalVolume(video, 0.4);
  mixer.stop(); await Promise.resolve(); equalVolume(video, 0.8);
});
