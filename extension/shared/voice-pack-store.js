import { packById, asVoice } from "./voice-pack-catalogue.js";
let database;
function open() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("Хранилище голосов недоступно в этом браузере."));
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("bridge-voice-packs", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("packs", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = null; reject(request.error); };
  });
  return database;
}
async function transaction(mode, operation) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("packs", mode), request = operation(tx.objectStore("packs"));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error("Не удалось сохранить голос. Проверьте свободное место."));
  });
}
export const readVoicePack = (id) => transaction("readonly", store => store.get(id));
export const saveVoicePack = (record) => transaction("readwrite", store => store.put(record));
export const deleteVoicePack = (id) => transaction("readwrite", store => store.delete(id));
export async function installedPackIds() {
  if (!globalThis.indexedDB) return [];
  return (await transaction("readonly", store => store.getAllKeys())).filter(id => packById(id));
}
export async function installedPackVoices() {
  return (await installedPackIds()).map(id => asVoice(packById(id)));
}
