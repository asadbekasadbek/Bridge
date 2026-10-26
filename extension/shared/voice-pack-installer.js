import { VOICE_PACKS } from "./voice-pack-catalogue.js";
import { installedPackIds, saveVoicePack } from "./voice-pack-store.js";
export function describePacks(language, ids = [], catalogue = VOICE_PACKS) {
  const describe = pack => ({ id: pack.id, voiceName: pack.voiceName, lang: pack.lang, gender: pack.gender, quality: pack.quality, license: pack.license, source: pack.source, bytes: pack.model.bytes + pack.config.bytes, installed: ids.includes(pack.id) });
  return {
    packs: catalogue.filter(pack => pack.lang.split("-")[0] === String(language).split("-")[0]).map(describe),
    installed: catalogue.filter(pack => ids.includes(pack.id)).map(describe)
  };
}

export async function verifyPackFile(bytes, file) {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== file.bytes) throw new Error("Файл голоса загружен не полностью. Повторите установку.");
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
  if (digest !== file.sha256) throw new Error("Контрольная сумма голоса не совпала. Файл не установлен.");
}
export function createPackInstaller({ fetchFile = fetch, save = saveVoicePack, installed = installedPackIds, catalogue = VOICE_PACKS, verify = verifyPackFile } = {}) {
  const findPack = id => catalogue.find(pack => pack.id === id);
  let state = { busy: false, phase: "idle", ids: [], progress: 0, message: "" };
  let job = null;
  const snapshot = () => ({ ...state, ids: [...state.ids] });
  async function download(pack, file, offset, total, signal) {
    let error;
    // Both addresses belong to the original pinned repository. A second
    // resolve URL also retries stale CDN redirects; no arbitrary URL is used.
    for (const suffix of ["", "?download=true"]) {
      try {
        const response = await fetchFile(`https://huggingface.co/rhasspy/piper-voices/resolve/${pack.revision}/${file.path}${suffix}`, { credentials: "omit", mode: "cors", signal });
        if (!response.ok) throw new Error(`Источник ответил ${response.status}`);
        signal.throwIfAborted();
        if (!response.body) throw new Error("Источник вернул пустой файл голоса.");
        // The catalogue pins the exact length. Write into one allocation rather
        // than retaining every network chunk plus a second complete model.
        const bytes = new Uint8Array(file.bytes), reader = response.body.getReader();
        let size = 0, complete = false;
        try {
          while (true) {
            signal.throwIfAborted();
            const { done, value } = await reader.read();
            signal.throwIfAborted();
            if (done) { complete = true; break; }
            if (size + value.byteLength > bytes.byteLength) throw new Error("Размер файла голоса не совпал.");
            bytes.set(value, size); size += value.byteLength;
            state.progress = Math.min(99, Math.floor((offset + size) / total * 100));
          }
        } finally {
          if (!complete) await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        if (size !== file.bytes) throw new Error("Файл голоса загружен не полностью. Повторите установку.");
        await verify(bytes.buffer, file);
        signal.throwIfAborted();
        return bytes.buffer;
      } catch (failure) { error = failure; if (signal.aborted) throw failure; }
    }
    throw error;
  }
  return {
    snapshot,
    cancel() { job?.abort(); return snapshot(); },
    start(ids) {
      if (state.busy) return snapshot();
      if (!Array.isArray(ids) || !ids.length || ids.length > 2 || new Set(ids).size !== ids.length || ids.some(id => !findPack(id))) throw new Error("Выберите доступный пакет голоса.");
      state = { busy: true, phase: "download", ids: [...ids], progress: 0, message: "Загружаем выбранные голоса…" };
      const controller = new AbortController(); job = controller;
      const timeout = setTimeout(() => controller.abort(), 300000); timeout.unref?.();
      (async () => {
        const existing = await installed();
        const packs = ids.filter(id => !existing.includes(id)).map(findPack);
        const total = packs.reduce((sum, pack) => sum + pack.model.bytes + pack.config.bytes, 0); let offset = 0;
        for (const pack of packs) {
          state.message = `Устанавливаем ${pack.voiceName.replace("Bridge — ", "").replace(" (локальный)", "")}…`;
          const signal = controller.signal;
          if (signal.aborted) throw new DOMException("Установка отменена", "AbortError");
          const model = await download(pack, pack.model, offset, total, signal); offset += pack.model.bytes;
          const config = await download(pack, pack.config, offset, total, signal); offset += pack.config.bytes;
          // Publish a complete pack atomically. Failed downloads leave existing
          // voices intact and are not shown as installed.
          signal.throwIfAborted();
          await save({ id: pack.id, model, config, installedAt: Date.now() });
        }
        state = { ...state, busy: false, phase: "done", progress: 100, message: "Голоса установлены на компьютере. Можно слушать без интернета." };
      })().catch(error => { state = { ...state, busy: false, phase: controller.signal.aborted ? "cancelled" : "error", message: controller.signal.aborted ? "Установка отменена. Уже установленные голоса сохранены." : `Не удалось установить голос. ${String(error.message || error).slice(0, 250)} Уже установленные голоса сохранены.` }; }).finally(() => { clearTimeout(timeout); if (job === controller) job = null; });
      return snapshot();
    },
    async catalogue(language) {
      const keys = await installed();
      return describePacks(language, keys, catalogue);
    }
  };
}
