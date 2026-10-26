import { DEFAULT_SETTINGS, LANGUAGES, SETTINGS_KEY, sampleFor, voiceQuality, matchingVoices, genderOfVoice } from "./shared/preferences.js";
import { loadSettings, saveSettings, selectTargetLanguage, selectSourceLanguage, sendMessage } from "./shared/browser.js";
import { describeSpeechEvent } from "./shared/speech-status.js";
import "./shared/voice-pack-controls.js";
import "./platforms/local-translation.js";
import "./shared/ui-language.js";

const i18n = globalThis.BridgeI18n;
document.querySelector(".content").prepend(i18n.createControl(document, "ui-language", uiLanguage => sendMessage("bridge:select-ui-language", { uiLanguage })));
i18n.mount(document.body);
const originalTitle = document.title;
i18n.onChange(() => { document.title = i18n.translate(originalTitle); updateOutputs(); });

const $ = (id) => document.getElementById(id);
let voices = [];
let initialized = false;
let refreshGeneration = 0;
let previewGeneration = 0;
let speechEventSeen = false;
let languageGeneration = 0;
const localTranslator = globalThis.BridgeLocalTranslation.createLocalTranslator();
const packControls = globalThis.BridgeVoicePackControls.create({ request: sendMessage, language: () => $("language").value, source: () => $("source-language").value, nativeVoices: () => voices,
  translation: { status: (source,target) => localTranslator.status(source,target), prepare: (source,target,options) => localTranslator.prepare(source,target,options), cancel: () => localTranslator.destroy() },
  async onRemoved() { await refreshVoices(); }, async onUse(packs, language) {
  if ($("language").value !== language || !packs.length) return;
  const result = await sendMessage("bridge:select-pack", { id: packs[0].id });
  $("voice-gender").value = result.settings.voiceGender; await refreshVoices(); renderVoices(result.settings.voiceName);
  status("save-status", "Голоса Bridge готовы. Язык и режим сохранены.");
} });
$("voice-pack-controls").append(packControls.element);

function status(id, text, isError = false) {
  $(id).textContent = text;
  $(id).classList.toggle("error-text", isError);
}

function readForm() {
  return { uiLanguage: i18n.locale, resourceMode: packControls.mode, showSubtitles: $("show-subtitles").checked, hideExternalDownloaders: $("hide-external-downloaders").checked, sourceLanguage: $("source-language").value, language: $("language").value, voiceName: $("voice").value, voiceGender: $("voice-gender").value, rate: Number($("rate").value), volume: Number($("volume").value) / 100, naturalSpeech: $("natural-speech").checked, duckingEnabled: $("ducking-enabled").checked, duckingAmount: Number($("ducking-amount").value) / 100 };
}

function updateOutputs() {
  $("rate-value").textContent = `${Number($("rate").value).toLocaleString(i18n.locale)}×`;
  $("volume-value").textContent = `${$("volume").value}%`;
  $("ducking-value").textContent = `${$("ducking-amount").value}%`;
  $("ducking-amount").disabled = !$("ducking-enabled").checked;
}

function renderVoices(preferredName = $("voice").value) {
  const available = matchingVoices(voices, $("language").value, $("voice-gender").value);
  const missingSelection = preferredName && !available.some((voice) => voice.voiceName === preferredName);
  $("voice").replaceChildren();
  for (const voice of available) $("voice").add(new Option(`${voice.voiceName} · ${{ female: "Женский", male: "Мужской" }[genderOfVoice(voice)] || "Тип не указан"} · ${voiceQuality(voice.voiceName).label}`, voice.voiceName));
  if (available.length === 0) $("voice").add(new Option("Локальный голос не найден", ""));
  if (missingSelection && available.length > 0) {
    const missingOption = new Option(`Недоступен: ${preferredName}`, preferredName, true, true);
    missingOption.disabled = true;
    $("voice").add(missingOption);
  }
  if (available.some((voice) => voice.voiceName === preferredName)) $("voice").value = preferredName;
  $("voice").disabled = available.length === 0;
  $("preview").disabled = !available.some((voice) => voice.voiceName === $("voice").value);
  $("voice-warning").hidden = available.length > 0;
  $("best-voice").disabled = available.length === 0;
  $("voice-help").textContent = missingSelection && available.length > 0
    ? "Сохранённый голос больше недоступен. Выберите другой локальный голос."
    : available.length === 0 ? "Для этого языка и типа нет доступного голоса. Установите пакет Bridge ниже или выберите доступный режим."
    : voiceQuality($("voice").value).rank === 4 ? "Выбран локальный нейроголос Bridge. Он работает без интернета и использует сохранённую модель."
    : voiceQuality($("voice").value).rank > 1 ? "Выбран улучшенный локальный голос. Послушайте пример и сравните звучание."
    : "Выбран обычный системный голос. Ниже можно установить доступные голоса Bridge или выбрать улучшенный голос ОС.";
  packControls.refresh();
}

function populate(value) {
  i18n.setLocale(value.uiLanguage);
  $("show-subtitles").checked = value.showSubtitles === true;
  $("hide-external-downloaders").checked = value.hideExternalDownloaders !== false;
  $("source-language").value = value.sourceLanguage || "auto";
  $("language").value = value.language;
  $("voice-gender").value = value.voiceGender || "any";
  $("rate").value = String(value.rate);
  $("volume").value = String(Math.round(value.volume * 100));
  $("sample").value = sampleFor(value.language);
  $("natural-speech").checked = value.naturalSpeech;
  $("ducking-enabled").checked = value.duckingEnabled;
  $("ducking-amount").value = String(Math.round(value.duckingAmount * 100));
  renderVoices(value.voiceName);
  updateOutputs();
}

async function refreshVoices() {
  const currentRefresh = ++refreshGeneration;
  $("refresh-voices").disabled = true;
  try {
    const result = await sendMessage("bridge:voices");
    if (currentRefresh !== refreshGeneration) return;
    voices = result.voices;
    renderVoices();
    status("preview-status", "Список локальных голосов обновлён.");
  } catch (error) {
    if (currentRefresh === refreshGeneration) status("preview-status", error.message, true);
  } finally {
    if (currentRefresh === refreshGeneration) $("refresh-voices").disabled = false;
  }
}

async function stopPreview() {
  previewGeneration += 1;
  await sendMessage("bridge:stop");
  $("stop").disabled = true;
  status("preview-status", "Озвучка остановлена.");
}

$("settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!initialized) return;
  $("save").disabled = true;
  $("settings-fields").disabled = true;
  try {
    await saveSettings(readForm());
    status("save-status", "✓ Настройки сохранены на компьютере.");
  } catch (error) {
    status("save-status", `Не удалось сохранить: ${error.message}`, true);
  } finally {
    $("settings-fields").disabled = false;
    $("save").disabled = false;
  }
});

$("settings-form").addEventListener("input", (event) => {
  if (!initialized) return;
  updateOutputs();
  if (event.target.matches("[data-bridge-resource-mode]")) return;
  if (event.target.id === "show-subtitles") {
    sendMessage("bridge:show-subtitles", { value: $("show-subtitles").checked }).then(() => status("save-status", "✓ Показ субтитров сохранён.")).catch((error) => status("save-status", error.message, true));
    return;
  }
  if (event.target.id === "hide-external-downloaders") {
    sendMessage("bridge:hide-external-downloaders", { value: $("hide-external-downloaders").checked }).then(() => status("save-status", "✓ Видимость кнопки скачивания сохранена.")).catch((error) => status("save-status", error.message, true));
    return;
  }
  if (["language", "voice", "voice-gender"].includes(event.target.id)) {
    previewGeneration += 1;
    if (!$("stop").disabled) sendMessage("bridge:stop").catch((error) => status("preview-status", error.message, true));
    $("stop").disabled = true;
  }
  if (event.target.id === "source-language") {
    packControls.refresh();
    const generation = ++languageGeneration;
    status("save-status", "Сохраняем исходный язык…");
    selectSourceLanguage($("source-language").value).then(() => {
      if (generation !== languageGeneration) return;
      status("save-status", "✓ Исходный язык сохранён автоматически.");
    }).catch((error) => {
      if (generation === languageGeneration) status("save-status", `Исходный язык не сохранён: ${error.message}`, true);
    });
    return;
  }
  if (event.target.id === "language") {
    renderVoices("");
    $("sample").value = sampleFor($("language").value);
    const generation = ++languageGeneration;
    status("save-status", "Сохраняем язык перевода…");
    selectTargetLanguage($("language").value).then(() => {
      if (generation !== languageGeneration) return;
      status("save-status", "✓ Язык перевода сохранён автоматически. Остальные изменения сохраните кнопкой ниже.");
    }).catch((error) => {
      if (generation === languageGeneration) status("save-status", `Язык не сохранён: ${error.message}`, true);
    });
    return;
  }
  if (event.target.id === "voice") renderVoices($("voice").value);
  if (event.target.id === "voice-gender") renderVoices("");
  status("save-status", "Есть изменения — сохраните настройки.");
});

$("reset").addEventListener("click", () => {
  populate(DEFAULT_SETTINGS);
  stopPreview().catch((error) => status("preview-status", error.message, true));
  status("save-status", "Исходные значения восстановлены. Нажмите «Сохранить настройки».");
});
$("refresh-voices").addEventListener("click", refreshVoices);
$("best-voice").addEventListener("click", async () => {
  if (!initialized) return;
  $("settings-fields").disabled = true;
  try {
    await stopPreview();
    voices = (await sendMessage("bridge:voices")).voices;
    const best = matchingVoices(voices, $("language").value, $("voice-gender").value)[0];
    if (!best) throw new Error("Для этого языка нет локального голоса. Установите его в настройках речи вашей ОС.");
    const settings = await saveSettings({ ...readForm(), voiceName: best.voiceName, rate: 1, naturalSpeech: true });
    populate(settings);
    status("save-status", `✓ Плавная речь сохранена. Голос: ${best.voiceName}. Скорость: 1×.`);
    await previewSpeech();
  } catch (error) {
    status("save-status", error.message, true);
    renderVoices();
  } finally {
    $("settings-fields").disabled = false;
  }
});
$("stop").addEventListener("click", () => stopPreview().catch((error) => status("preview-status", error.message, true)));
async function previewSpeech() {
  const currentPreview = ++previewGeneration;
  speechEventSeen = false;
  $("preview").disabled = true;
  $("stop").disabled = false;
  status("preview-status", "Запускаем локальный голос…");
  try {
    const result = await sendMessage("bridge:preview", { settings: readForm(), text: $("sample").value });
    if (currentPreview !== previewGeneration) return;
    if (!speechEventSeen) status("preview-status", result.skipped ? "В тексте нет слов для озвучки: знаки оформления пропущены." : result.cancelled ? "Озвучка отменена." : "Команда отправлена голосу. Чтобы прервать, нажмите «Остановить».");
    if (result.skipped) $("stop").disabled = true;
  } catch (error) {
    if (currentPreview === previewGeneration) {
      status("preview-status", error.message, true);
      $("stop").disabled = true;
    }
  } finally {
    if (currentPreview === previewGeneration) renderVoices();
    else $("preview").disabled = !matchingVoices(voices, $("language").value, $("voice-gender").value).some((voice) => voice.voiceName === $("voice").value);
  }
}
$("preview").addEventListener("click", previewSpeech);

chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== chrome.runtime.id || message?.type !== "bridge:speech-event") return;
  const state = describeSpeechEvent(message.event);
  if (!state) return;
  speechEventSeen = true;
  status("preview-status", state.text, state.error);
  $("stop").disabled = !state.speaking;
});

chrome.storage.onChanged.addListener((changes, area) => {
  const change = changes[SETTINGS_KEY];
  const saved = change?.newValue;
  if (!initialized || area !== "local" || !saved || !LANGUAGES.some((language) => language.code === saved.language)) return;
  i18n.setLocale(saved.uiLanguage);
  const targetChanged = saved.language !== $("language").value && (change.oldValue?.language || DEFAULT_SETTINGS.language) !== saved.language;
  const sourceChanged = (saved.sourceLanguage || "auto") !== $("source-language").value
    && (change.oldValue?.sourceLanguage || "auto") !== (saved.sourceLanguage || "auto");
  const voiceChanged = (change.oldValue?.voiceGender || "any") !== saved.voiceGender || change.oldValue?.voiceName !== saved.voiceName;
  const mixChanged = ["volume", "duckingEnabled", "duckingAmount"].some((key) => change.oldValue?.[key] !== saved[key]);
  const interfaceChanged = change.oldValue?.hideExternalDownloaders !== saved.hideExternalDownloaders || change.oldValue?.showSubtitles !== saved.showSubtitles;
  const resourceChanged = change.oldValue?.resourceMode !== saved.resourceMode;
  if (!targetChanged && !sourceChanged && !voiceChanged && !mixChanged && !interfaceChanged && !resourceChanged) return;
  if (resourceChanged) packControls.refresh();
  if (interfaceChanged) { $("hide-external-downloaders").checked = saved.hideExternalDownloaders !== false; $("show-subtitles").checked = saved.showSubtitles === true; }
  if (targetChanged || sourceChanged || voiceChanged) { languageGeneration += 1; previewGeneration += 1; $("stop").disabled = true; }
  $("source-language").value = saved.sourceLanguage || "auto";
  if (targetChanged) {
    $("language").value = saved.language;
    $("sample").value = sampleFor(saved.language);
  }
  if (voiceChanged || targetChanged) { $("voice-gender").value = saved.voiceGender || "any"; renderVoices(saved.voiceName); }
  if (change.oldValue?.volume !== saved.volume) $("volume").value = String(Math.round(saved.volume * 100));
  if (change.oldValue?.duckingEnabled !== saved.duckingEnabled) $("ducking-enabled").checked = saved.duckingEnabled;
  if (change.oldValue?.duckingAmount !== saved.duckingAmount) $("ducking-amount").value = String(Math.round(saved.duckingAmount * 100));
  updateOutputs();
  status("save-status", "Настройки обновлены из плеера или другого окна Bridge и уже сохранены.");
});

async function initialize() {
  try {
    $("source-language").add(new Option("Автоматически", "auto"));
    for (const language of LANGUAGES) {
      $("language").add(new Option(language.name, language.code));
      $("source-language").add(new Option(language.name, language.code));
    }
    const [settings, inventory] = await Promise.all([loadSettings(), sendMessage("bridge:voices")]);
    voices = inventory.voices;
    $("settings-fields").disabled = false;
    $("sample").disabled = false;
    populate(settings);
    initialized = true;
    status("save-status", "Настройки загружены с компьютера.");
    if (chrome.tts.onVoicesChanged) chrome.tts.onVoicesChanged.addListener(refreshVoices);
  } catch (error) {
    $("fatal-error").hidden = false;
    $("fatal-error").textContent = `Не удалось загрузить настройки. ${error.message}`;
    status("save-status", "Проверьте, что расширение включено в Chrome.", true);
  }
}

initialize();
