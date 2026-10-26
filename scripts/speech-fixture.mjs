import { cp, writeFile } from "node:fs/promises";
import { relative, join, sep } from "node:path";

// The broad UI tests replace both speech backends, in a disposable extension
// copy. bundled-browser.mjs separately tests real packaged models and playback.
export async function createSpeechFixture(source, destination) {
  await cp(source, destination, { recursive: true, filter: (path) => !["voices", "vendor"].includes(relative(source, path).split(sep)[0]) });
  await writeFile(join(destination, "shared/bundled-client.js"), `
import { describePacks } from './voice-pack-installer.js';
export function createBundledClient(api, onEvent) {
  return {
    async warmup() {},
    async packStatus(language) { return { ok: true, ...describePacks(language, ['ru_RU-denis-medium','en_US-john-medium','en_US-kristin-medium']), status: { busy: false, phase: 'idle', message: '' } }; },
    async configure() {},
    async prepare(voice, text, options) {
      (globalThis.bridgePreparations ||= []).push({ text, voiceName: voice.voiceName, rate: options.rate });
      return { ok: true };
    },
    async stop() { api.tts.stop(); },
    async speak(id, voice, text, options) {
      return new Promise((resolve, reject) => api.tts.speak(text, {
        ...options, voiceName: voice.voiceName,
        onEvent(event) { onEvent(id, { type: event.type, error: event.errorMessage || "" }); }
      }, () => {
        if (api.runtime.lastError) reject(new Error(api.runtime.lastError.message));
        else resolve({ ok: true });
      }));
    }
  };
}
`);
  await writeFile(join(destination, "shared/voice-pack-store.js"), `
import { packById, asVoice } from './voice-pack-catalogue.js';
const ids=['ru_RU-denis-medium','en_US-john-medium','en_US-kristin-medium'];
export async function installedPackIds(){ return ids; }
export async function installedPackVoices(){ return ids.map(id=>asVoice(packById(id))); }
export async function readVoicePack(){ throw Error('Speech fixture has no model bytes'); }
export async function saveVoicePack(){}
export async function deleteVoicePack(){}
`);
  return destination;
}
