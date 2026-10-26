import { SETTINGS_KEY, languageName, sampleFor, matchingVoices } from "./shared/preferences.js";
import { loadSettings, openSettings, sendMessage, activeTab, sendToTab } from "./shared/browser.js";
import { describeSpeechEvent } from "./shared/speech-status.js";
import "./shared/ui-language.js";

const i18n = globalThis.BridgeI18n;
document.querySelector(".popup-intro").after(i18n.createControl(document, "popup-ui-language", uiLanguage => sendMessage("bridge:select-ui-language", { uiLanguage })));
i18n.mount(document.body);

const $ = (id) => document.getElementById(id);
let settings;
let refreshGeneration = 0;
let canPreview = false;
let speechEventSeen = false;
let youtubeTabId = null;
let youtubeFrameToken = null;
let youtubeEnabled = false;
let youtubeGeneration = 0;

function renderYouTube(state) {
  youtubeEnabled = state.enabled || state.starting;
  $("toggle-youtube").textContent = youtubeEnabled ? "Отключить озвучку" : "Озвучить субтитры";
  $("toggle-youtube").setAttribute("aria-pressed", String(youtubeEnabled));
  $("toggle-youtube").disabled = !state.videoAvailable;
  $("youtube-status").textContent = state.status;
}

async function refreshYouTube(targetTabId = null, frameToken = null) {
  const generation = ++youtubeGeneration;
  try {
    const tab = targetTabId === null ? await activeTab() : { id: targetTabId };
    if (!Number.isInteger(tab?.id)) throw new Error("Нет активной вкладки");
    if (!frameToken) frameToken = (await sendMessage("bridge:video-frame", { tabId: tab.id })).frameToken;
    const result = await sendToTab(tab.id, "bridge:youtube-status", frameToken ? { frameToken } : {});
    if (generation !== youtubeGeneration) return;
    youtubeTabId = tab.id;
    youtubeFrameToken = result.frameToken || null;
    renderYouTube(result);
  } catch {
    if (generation !== youtubeGeneration) return;
    youtubeTabId = null;
    youtubeFrameToken = null;
    $("toggle-youtube").disabled = true;
    $("youtube-status").textContent = "Откройте видео на поддерживаемой площадке. После обновления Bridge перезагрузите страницу видео.";
  }
}

$("toggle-youtube").addEventListener("click", async () => {
  if (youtubeTabId === null) return;
  youtubeGeneration += 1;
  $("toggle-youtube").disabled = true;
  try {
    renderYouTube(await sendToTab(youtubeTabId, "bridge:youtube-toggle", { enabled: !youtubeEnabled, ...(youtubeFrameToken ? { frameToken: youtubeFrameToken } : {}) }));
  } catch {
    $("youtube-status").textContent = "Не удалось подключиться. Обновите страницу видео.";
    $("toggle-youtube").disabled = false;
  }
});

function status(text, isError = false) {
  $("popup-status").textContent = text;
  $("popup-status").classList.toggle("error-text", isError);
}

async function refresh() {
  const currentRefresh = ++refreshGeneration;
  try {
    const nextSettings = await loadSettings();
    const { voices } = await sendMessage("bridge:voices");
    if (currentRefresh !== refreshGeneration) return;
    settings = nextSettings;
    i18n.setLocale(settings.uiLanguage);
    const available = matchingVoices(voices, settings.language, settings.voiceGender);
    const selected = settings.voiceName ? available.find((voice) => voice.voiceName === settings.voiceName) : available[0];
    $("summary-language").textContent = i18n.locale === "ru" ? languageName(settings.language) : i18n.languageName(settings.language);
    $("summary-voice").textContent = selected?.voiceName || "Нужен локальный голос";
    $("summary-rate").textContent = `${settings.rate.toLocaleString(i18n.locale)}×`;
    canPreview = Boolean(selected);
    $("quick-preview").disabled = !canPreview;
    status(selected ? "Озвучка локальная. Нужны субтитры на выбранном языке; автоперевод подключён на YouTube." : "Откройте настройки и выберите установленный голос.");
  } catch (error) {
    if (currentRefresh !== refreshGeneration) return;
    canPreview = false;
    $("quick-preview").disabled = true;
    status(error.message, true);
  }
}

$("open-settings").addEventListener("click", () => openSettings().then(() => window.close()).catch((error) => status(error.message, true)));
$("quick-preview").addEventListener("click", async () => {
  if (!settings) return;
  speechEventSeen = false;
  $("quick-preview").disabled = true;
  $("quick-stop").disabled = false;
  try {
    const result = await sendMessage("bridge:preview", { settings, text: sampleFor(settings.language) });
    if (!speechEventSeen) status(result.cancelled ? "Озвучка отменена." : "Команда отправлена локальному голосу.");
  } catch (error) {
    status(error.message, true);
    $("quick-stop").disabled = true;
  } finally {
    $("quick-preview").disabled = !canPreview;
  }
});
chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.type === "bridge:youtube-session") {
    if (message.tabId === youtubeTabId) refreshYouTube(youtubeTabId, message.frameToken || null);
    return;
  }
  if (message?.type !== "bridge:speech-event") return;
  const state = describeSpeechEvent(message.event);
  if (!state) return;
  speechEventSeen = true;
  status(state.text, state.error);
  $("quick-stop").disabled = !state.speaking;
});
$("quick-stop").addEventListener("click", () => {
  sendMessage("bridge:stop").then(() => { $("quick-stop").disabled = true; status("Озвучка остановлена."); }).catch((error) => status(error.message, true));
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[SETTINGS_KEY]) refresh();
});
refresh();
refreshYouTube();
