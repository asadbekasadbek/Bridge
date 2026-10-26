import { LANGUAGES, normalizeSettings } from "./preferences.js";

// All UI writes go through one worker queue. A language choice survives closing
// its settings tab, and a read/modify/write cannot race another UI write.
export function createSettingsStore({ readSettings, writeSettings }) {
  let queue = Promise.resolve();
  function enqueue(operation) {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  }
  return {
    save: (settings) => enqueue(() => writeSettings(normalizeSettings(settings))),
    selectUiLanguage(uiLanguage) {
      if (!["ru", "en", "uz"].includes(uiLanguage)) return Promise.reject(new Error("Выберите язык интерфейса из списка."));
      return enqueue(async () => writeSettings({ ...await readSettings(), uiLanguage }));
    },
    selectResourceMode(resourceMode) {
      if (!["light", "balanced"].includes(resourceMode)) return Promise.reject(new Error("Выберите режим памяти."));
      return enqueue(async () => writeSettings({ ...await readSettings(), resourceMode }));
    },
    selectPackVoice(voiceName, voiceGender) {
      return enqueue(async () => writeSettings({ ...await readSettings(), voiceName, voiceGender: voiceGender || "any" }));
    },
    clearSelectedVoice(voiceName) {
      return enqueue(async () => { const current = await readSettings(); return current.voiceName === voiceName ? writeSettings({ ...current, voiceName: "" }) : current; });
    },
    setShowSubtitles(value) {
      if (typeof value !== "boolean") return Promise.reject(new Error("Выберите, показывать ли субтитры на видео."));
      return enqueue(async () => writeSettings(normalizeSettings({ ...await readSettings(), showSubtitles: value })));
    },
    setHideExternalDownloaders(value) {
      if (typeof value !== "boolean") return Promise.reject(new Error("Выберите, скрывать ли сторонний загрузчик."));
      return enqueue(async () => writeSettings(normalizeSettings({ ...await readSettings(), hideExternalDownloaders: value })));
    },
    patchAudio(patch) {
      return enqueue(async () => {
        const allowed = Object.fromEntries(Object.entries(patch || {}).filter(([key]) => ["volume", "duckingEnabled", "duckingAmount"].includes(key)));
        return writeSettings(normalizeSettings({ ...await readSettings(), ...allowed }));
      });
    },
    selectVoiceGender(voiceGender) {
      if (!["any", "male", "female"].includes(voiceGender)) return Promise.reject(new Error("Выберите тип голоса из списка."));
      return enqueue(async () => writeSettings({ ...await readSettings(), voiceGender, voiceName: "" }));
    },
    selectSourceLanguage(sourceLanguage) {
      if (sourceLanguage !== "auto" && !LANGUAGES.some((item) => item.code === sourceLanguage)) return Promise.reject(new Error("Выберите исходный язык или «Автоматически»."));
      return enqueue(async () => writeSettings({ ...await readSettings(), sourceLanguage }));
    },
    selectLanguage(language) {
      if (!LANGUAGES.some((item) => item.code === language)) return Promise.reject(new Error("Выберите язык перевода из списка."));
      return enqueue(async () => {
        const current = await readSettings();
        return writeSettings({ ...current, language, voiceName: current.language === language ? current.voiceName : "" });
      });
    }
  };
}
