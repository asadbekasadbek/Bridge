import { DEFAULT_SETTINGS, SETTINGS_KEY, normalizeSettings } from "./preferences.js";
import "./runtime-request.js";

function callbackResult(invoke) {
  return new Promise((resolve, reject) => {
    invoke((result) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result);
    });
  });
}

export async function loadSettings() {
  const stored = await callbackResult((callback) => chrome.storage.local.get(SETTINGS_KEY, callback));
  return normalizeSettings(stored?.[SETTINGS_KEY] || DEFAULT_SETTINGS);
}

export async function writeSettings(settings) {
  const normalized = normalizeSettings(settings);
  await callbackResult((callback) => chrome.storage.local.set({ [SETTINGS_KEY]: normalized }, callback));
  return normalized;
}

export async function saveSettings(settings) {
  return (await sendMessage("bridge:save-settings", { settings })).settings;
}

export async function selectTargetLanguage(language) {
  return (await sendMessage("bridge:select-language", { language })).settings;
}

export async function selectSourceLanguage(sourceLanguage) {
  return (await sendMessage("bridge:select-source-language", { sourceLanguage })).settings;
}

export async function sendMessage(type, payload = {}) {
  return globalThis.BridgeRuntime.request(chrome, type, payload);
}

export function openSettings() {
  return callbackResult((callback) => chrome.runtime.openOptionsPage(callback));
}

export function activeTab() {
  return callbackResult((callback) => chrome.tabs.query({ active: true, currentWindow: true }, callback))
    .then((tabs) => tabs[0] || null);
}

export async function sendToTab(tabId, type, payload = {}) {
  // Status is answered only by frames with a player. Mutations include the
  // returned frame token, so a second embedded player cannot start as well.
  const response = await callbackResult((callback) => chrome.tabs.sendMessage(tabId, { type, ...payload }, {}, callback));
  if (!response?.ok) throw new Error(response?.error || "Откройте поддерживаемое видео и обновите страницу.");
  return response;
}
