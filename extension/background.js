import { createSpeechController } from "./shared/speech-controller.js";
import { createBundledClient } from "./shared/bundled-client.js";
import { createYouTubeController } from "./shared/youtube-controller.js";
import { isVideoSender } from "./shared/video-sites.js";
import { loadSettings, writeSettings } from "./shared/browser.js";
import { createSettingsStore } from "./shared/settings-store.js";
import { SETTINGS_KEY, LANGUAGES, AUDIO_SETTINGS_KEYS, normalizeSettings, matchingVoices } from "./shared/preferences.js";
import { packById } from "./shared/voice-pack-catalogue.js";

function updateChromeUi(uiLanguage) {
  const title = { ru: "Bridge — настройки голоса", en: "Bridge — voice settings", uz: "Bridge — ovoz sozlamalari" }[uiLanguage] || "Bridge — настройки голоса";
  chrome.action.setTitle({ title }).catch(() => {});
}
loadSettings().then(settings => updateChromeUi(settings.uiLanguage)).catch(() => {});

let youtube;
const voiceClient = createBundledClient(chrome, (id, event) => speech.onBundledEvent(id, event));
const settingsStore = createSettingsStore({ readSettings: loadSettings, writeSettings });
const speech = createSpeechController(chrome, (event) => {
  if (youtube?.onSpeechEvent(event)) return;
  chrome.runtime.sendMessage({ type: "bridge:speech-event", event }, () => {
    // A preview can finish after its popup was closed; no receiver is normal.
    void chrome.runtime.lastError;
  });
}, voiceClient);
youtube = createYouTubeController({
  speech,
  readSettings: loadSettings,
  onStateChange(tabId, frameToken) {
    chrome.runtime.sendMessage({ type: "bridge:youtube-session", tabId, frameToken }, () => { void chrome.runtime.lastError; });
  }
});
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "bridge:youtube" || !isVideoSender(port.sender, chrome.runtime.id)) {
    port.disconnect();
    return;
  }
  youtube.connect(port);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[SETTINGS_KEY]) {
    const before = normalizeSettings(changes[SETTINGS_KEY].oldValue);
    const after = normalizeSettings(changes[SETTINGS_KEY].newValue);
    if (before.uiLanguage !== after.uiLanguage) updateChromeUi(after.uiLanguage);
    const onlyLive = Object.keys(after).every((key) => AUDIO_SETTINGS_KEYS.includes(key) || ["uiLanguage", "hideExternalDownloaders", "showSubtitles", "voiceGender", "voiceName", "resourceMode"].includes(key) || before[key] === after[key]);
    if (onlyLive) {
      youtube.updateAudio(after);
      if (before.voiceGender !== after.voiceGender || before.voiceName !== after.voiceName) youtube.updateVoice(after);
      if (before.resourceMode !== after.resourceMode) { youtube.updateResource(after.resourceMode); voiceClient.configure(after.resourceMode).catch(() => {}); }
    }
    else {
      youtube.end("Язык или настройки голоса изменены. Включите озвучку ещё раз.");
      speech.stop();
    }
  }
});
const allowedPages = new Set([chrome.runtime.getURL("options.html"), chrome.runtime.getURL("popup.html")]);

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message || typeof message.type !== "string") return false;
  const extensionPage = sender.id === chrome.runtime.id && allowedPages.has(sender.url?.split(/[?#]/)[0]);
  const youtubeSettings = isVideoSender(sender, chrome.runtime.id)
    && ["bridge:read-preferences", "bridge:select-ui-language", "bridge:select-language", "bridge:select-source-language", "bridge:voices", "bridge:voice-packs", "bridge:install-voice-packs", "bridge:cancel-voice-install", "bridge:remove-voice-pack", "bridge:select-pack", "bridge:resource-mode", "bridge:audio-settings", "bridge:select-voice-gender", "bridge:hide-external-downloaders", "bridge:show-subtitles"].includes(message.type);
  if (!extensionPage && !youtubeSettings) return false;

  let operation;
  switch (message.type) {
    case "bridge:video-frame": respond({ ok: true, frameToken: youtube.frameFor(message.tabId) }); return false;
    case "bridge:read-preferences": operation = loadSettings().then((settings) => {
      // Opening a page or settings must never load an acoustic graph.
      return { settings, languages: LANGUAGES.map(({ code, name }) => ({ code, name })) };
    }); break;
    case "bridge:save-settings": operation = settingsStore.save(message.settings).then((settings) => ({ settings })); break;
    case "bridge:select-ui-language": operation = settingsStore.selectUiLanguage(message.uiLanguage).then((settings) => ({ settings })); break;
    case "bridge:select-language": operation = settingsStore.selectLanguage(message.language).then((settings) => ({ settings })); break;
    case "bridge:select-source-language": operation = settingsStore.selectSourceLanguage(message.sourceLanguage).then((settings) => ({ settings })); break;
    case "bridge:audio-settings": operation = settingsStore.patchAudio(message.audio).then((settings) => ({ settings })); break;
    case "bridge:hide-external-downloaders": operation = settingsStore.setHideExternalDownloaders(message.value).then((settings) => ({ settings })); break;
    case "bridge:show-subtitles": operation = settingsStore.setShowSubtitles(message.value).then((settings) => ({ settings })); break;
    case "bridge:select-voice-gender": operation = Promise.all([loadSettings(), speech.voices()]).then(([settings, voices]) => {
      if (!matchingVoices(voices, settings.language, message.voiceGender).length) throw new Error("Такой локальный голос для выбранного языка не установлен. Добавьте его в настройках речи ОС и обновите страницу.");
      return settingsStore.selectVoiceGender(message.voiceGender);
    }).then((settings) => ({ settings })); break;
    case "bridge:voices": operation = speech.voices().then((voices) => ({ voices })); break;
    case "bridge:voice-packs": operation = Promise.all([voiceClient.packStatus(message.language), loadSettings()]).then(([info, settings]) => ({ ...info, resourceMode: settings.resourceMode })); break;
    case "bridge:install-voice-packs": operation = voiceClient.installPacks(message.ids); break;
    case "bridge:cancel-voice-install": operation = voiceClient.cancelPacks(); break;
    case "bridge:resource-mode": operation = settingsStore.selectResourceMode(message.resourceMode).then(settings => ({ settings })); break;
    case "bridge:select-pack": operation = Promise.all([speech.voices(), loadSettings()]).then(([voices, settings]) => {
      const pack = packById(message.id), voice = voices.find(voice => voice.modelId === message.id);
      if (!pack || !voice || !matchingVoices([voice], settings.language).length) throw new Error("Установите голос для выбранного языка.");
      youtube.setVoices(voices);
      return settingsStore.selectPackVoice(voice.voiceName, voice.gender);
    }).then(settings => ({ settings })); break;
    case "bridge:remove-voice-pack": operation = (async () => {
      const pack = packById(message.id); if (!pack) throw new Error("Голос не найден.");
      youtube.forgetVoice(pack.voiceName);
      await voiceClient.removePack(pack.id);
      await settingsStore.clearSelectedVoice(pack.voiceName);
      youtube.setVoices(await speech.voices());
      return {};
    })(); break;
    case "bridge:preview": youtube.end("Озвучка видео остановлена для проверки голоса."); operation = speech.preview(message.settings, message.text); break;
    case "bridge:stop": youtube.end(); speech.stop(); respond({ ok: true }); return false;
    default: return false;
  }
  operation.then((result) => respond({ ok: true, ...result }))
    .catch((error) => respond({ ok: false, error: error.message || "Не удалось запустить локальную озвучку." }));
  return true;
});
