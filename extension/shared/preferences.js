import { cleanSpeechText, speechMarkup } from "./speech-text.js";
import { LANGUAGES } from "./languages.js";
import { VOICE_SAMPLES } from "./voice-samples.js";
export { LANGUAGES };

const languagesByCode = new Map(LANGUAGES.map((language) => [language.code, language]));
const femaleNames = new Set(["milena", "милена", "katya", "катя", "irina", "ирина", "zira", "hazel", "hortense", "hedda", "elsa", "haruka", "heami", "paulina", "sabina", "helena", "karen", "moira", "kate", "serena", "stephanie", "isha", "sangeeta", "veena", "fiona", "allison", "ava", "samantha", "susan", "zoe", "tessa", "aude", "amelie", "chantal", "audrey", "aurelie", "anna", "petra", "alice", "kyoko", "yuna", "sora", "sinji", "luciana", "joana", "catarina"]);
const maleNames = new Set(["yuri", "yury", "юрий", "pavel", "павел", "david", "mark", "george", "stefan", "cosimo", "ichiro", "pablo", "raul", "tolga", "lee", "daniel", "malcolm", "oliver", "rishi", "evan", "nathan", "tom", "nicolas", "thomas", "markus", "viktor", "yannick", "luca", "otoya", "felipe", "joaquim"]);

export const SETTINGS_KEY = "bridgeSettings";

export const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: 8,
  uiLanguage: "ru",
  resourceMode: "light",
  sourceLanguage: "auto",
  language: "ru-RU",
  voiceName: "",
  voiceGender: "any",
  rate: 1,
  volume: 0.85,
  naturalSpeech: true,
  duckingEnabled: true,
  duckingAmount: 0.6,
  showSubtitles: false,
  hideExternalDownloaders: true
});

function numberInRange(value, fallback, min, max) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value)) : fallback;
}

export function normalizeSettings(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const retiredVoice = ["Bridge — Женский (встроенный)", "Bridge — Мужской (встроенный)"].includes(source.voiceName);
  // Retire removed presets without resetting language, mixing or OS voices.
  const retiredDefault = Number(source.schemaVersion || 0) < 6 && !source.voiceName && source.voiceGender === "female" && typeof source.language === "string" && source.language.startsWith("ru");
  return {
    schemaVersion: 8,
    uiLanguage: ["ru", "en", "uz"].includes(source.uiLanguage) ? source.uiLanguage : "ru",
    resourceMode: source.resourceMode === "balanced" ? "balanced" : "light",
    sourceLanguage: source.sourceLanguage === "auto" || languagesByCode.has(source.sourceLanguage) ? source.sourceLanguage : "auto",
    language: languagesByCode.has(source.language) ? source.language : DEFAULT_SETTINGS.language,
    voiceName: !retiredVoice && typeof source.voiceName === "string" ? source.voiceName.slice(0, 200) : "",
    voiceGender: !retiredVoice && !retiredDefault && ["male", "female"].includes(source.voiceGender) ? source.voiceGender : "any",
    rate: numberInRange(source.rate, DEFAULT_SETTINGS.rate, 0.75, 1.5),
    volume: numberInRange(source.volume, DEFAULT_SETTINGS.volume, 0, 1),
    naturalSpeech: typeof source.naturalSpeech === "boolean" ? source.naturalSpeech : true,
    duckingEnabled: typeof source.duckingEnabled === "boolean" ? source.duckingEnabled : true,
    duckingAmount: numberInRange(source.duckingAmount, DEFAULT_SETTINGS.duckingAmount, 0, 1),
    showSubtitles: source.showSubtitles === true,
    hideExternalDownloaders: source.hideExternalDownloaders !== false
  };
}

export function languageName(code) {
  return languagesByCode.get(code)?.name || code;
}

export function sampleFor(code) {
  return VOICE_SAMPLES[code.split(/[-_]/)[0]] || languagesByCode.get(code)?.sample || LANGUAGES[0].sample;
}

export function sameLanguage(left, right) {
  return typeof left === "string" && typeof right === "string"
    && left.split(/[-_]/)[0].toLowerCase() === right.split(/[-_]/)[0].toLowerCase();
}

export function voiceQuality(name) {
  if (/^Bridge —/.test(name)) return { rank: 4, label: "Локальный голос Bridge" };
  if (/premium|премиум/i.test(name)) return { rank: 3, label: "Премиум" };
  if (/enhanced|улучшен|natural|neural|нейро|естествен/i.test(name)) return { rank: 2, label: "Улучшенный" };
  return { rank: 1, label: "Системный" };
}

// Chrome's gender option is deprecated. Select real voice names instead.
// Known names: Microsoft Narrator's voice table and Nuance Vocalizer's list
// (links in README). Unlisted voices stay unclassified rather than guessed.
export function genderOfVoice(voice) {
  if (["male", "female"].includes(voice.gender)) return voice.gender;
  const name = voice.voiceName.toLocaleLowerCase().replace(/\([^)]*\)/g, " ").replace(/\b(?:microsoft|desktop|mobile|enhanced|premium)\b/g, " ").trim();
  const words = name.match(/[\p{L}]+/gu) || [];
  if (words.some((word) => femaleNames.has(word))) return "female";
  if (words.some((word) => maleNames.has(word))) return "male";
  return "";
}

export function matchingVoices(voices, language, gender = "any") {
  return voices.filter((voice) => sameLanguage(voice.lang, language) && (gender === "any" || genderOfVoice(voice) === gender));
}

export const AUDIO_SETTINGS_KEYS = Object.freeze(["volume", "duckingEnabled", "duckingAmount"]);
export function audioSettings(settings) {
  return Object.fromEntries(AUDIO_SETTINGS_KEYS.map((key) => [key, settings[key]]));
}

// Unknown or extension-provided engines are deliberately excluded, even if
// their name sounds like a native voice. Re-check this inventory before speech.
export function localVoices(inventory) {
  if (!Array.isArray(inventory)) return [];
  const isNative = (voice) => voice && voice.remote === false && !voice.extensionId
    && typeof voice.voiceName === "string" && voice.voiceName.length > 0
    && typeof voice.lang === "string" && voice.lang.length > 0;
  const ambiguousNames = new Set(inventory.filter((voice) => !isNative(voice)).map((voice) => voice?.voiceName));
  const seen = new Set();
  return inventory.filter((voice) => {
    if (!isNative(voice) || ambiguousNames.has(voice.voiceName)) return false;
    const identity = JSON.stringify([voice.voiceName, voice.lang]);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  }).map((voice) => {
    const gender = genderOfVoice(voice);
    return { voiceName: voice.voiceName, lang: voice.lang, ...(gender ? { gender } : {}) };
  })
    .sort((left, right) => voiceQuality(right.voiceName).rank - voiceQuality(left.voiceName).rank);
}

export function prepareSpeech(inventory, settings, inputText, bundledVoices = []) {
  const options = normalizeSettings(settings);
  const voices = matchingVoices([...bundledVoices, ...localVoices(inventory)], options.language, options.voiceGender);
  const voice = options.voiceName ? voices.find((item) => item.voiceName === options.voiceName) : voices[0];
  if (!voice) throw new Error("Локальный голос недоступен. Выберите установленный голос для этого языка и обновите список.");
  if (typeof inputText !== "string") throw new Error("Введите текст для проверки голоса.");
  if (inputText.length > 500) throw new Error("Для проверки используйте не более 500 символов.");
  if (!inputText.trim()) throw new Error("Введите текст для проверки голоса.");
  const text = cleanSpeechText(inputText, options.language);
  return { text, utterance: options.naturalSpeech ? speechMarkup(text) : text, skipped: !text, ...(voice.engine === "bundled" ? { bundled: voice } : {}),
    options: { voiceName: voice.voiceName, lang: voice.lang, rate: options.rate, volume: options.volume, pitch: 1, enqueue: false } };
}
