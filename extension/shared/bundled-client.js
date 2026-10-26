import { installedPackIds } from "./voice-pack-store.js";
import { describePacks } from "./voice-pack-installer.js";
export function createBundledClient(api, onEvent = () => {}) {
  let creating = null;
  let revision = 0;
  const url = api.runtime.getURL("speech/offscreen.html");
  api.runtime.onMessage.addListener((message, sender) => {
    if (message?.type === "bridge:bundled-event" && sender.id === api.runtime.id && sender.url === url) onEvent(message.id, message.event);
    return false;
  });
  function message(payload) {
    return new Promise((resolve, reject) => api.runtime.sendMessage({ target: "bridge-voice", ...payload }, (result) => {
      const error = api.runtime.lastError;
      if (error || !result?.ok) reject(new Error(error?.message || result?.error || "Встроенный голос не ответил."));
      else resolve(result);
    }));
  }
  async function exists() {
    return api.runtime.getContexts
      ? (await api.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] })).length > 0
      : (await globalThis.clients.matchAll()).some(client => client.url === url);
  }
  async function ensure() {
    if (creating) return creating;
    creating = (async () => {
      if (!await exists()) await api.offscreen.createDocument({ url: "speech/offscreen.html", reasons: ["WORKERS"], justification: "Локальный синтез и установка выбранных голосов." });
    })().finally(() => { creating = null; });
    return creating;
  }
  return {
    async warmup(voice, resourceMode) { const current = revision; await ensure(); if (current !== revision) return { cancelled: true }; return message({ type: "warmup", modelId: voice?.modelId, resourceMode }); },
    async packStatus(language) {
      if (await exists()) return message({ target: "bridge-packs", type: "status", language });
      return { ...describePacks(language, await installedPackIds()), status: { busy: false, phase: "idle", ids: [], progress: 0, message: "" } };
    },
    async installPacks(ids) { await ensure(); return message({ target: "bridge-packs", type: "install", ids }); },
    async cancelPacks() { if (await exists()) return message({ target: "bridge-packs", type: "cancel" }); return { ok: true }; },
    async removePack(id) {
      await ensure();
      await message({ type: "drop-pack", modelId: id });
      return message({ target: "bridge-packs", type: "remove", id });
    },
    async configure(resourceMode) { if (await exists()) return message({ type: "configure", resourceMode }); },
    async prepare(voice, text, options) {
      const current = revision;
      await ensure();
      if (current !== revision) return { cancelled: true };
      return message({ type: "prepare", id: "prepare", modelId: voice.modelId, speaker: voice.speaker, text, rate: options.rate, resourceMode: options.resourceMode });
    },
    async speak(id, voice, text, options) { const current = ++revision; await ensure(); if (current !== revision) return { cancelled: true }; return message({ type: "speak", id, modelId: voice.modelId, speaker: voice.speaker, text, volume: options.volume, rate: options.rate, resourceMode: options.resourceMode }); },
    async stop() { revision += 1; if (await exists()) return message({ type: "stop" }).catch(() => {}); }
  };
}
