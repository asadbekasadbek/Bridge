import { createPackInstaller } from "../shared/voice-pack-installer.js";
import { deleteVoicePack } from "../shared/voice-pack-store.js";
import { packById } from "../shared/voice-pack-catalogue.js";
const installer = createPackInstaller();
// Keep the extension's service worker informed during a long download even
// when the video tab is closed. No text or audio is sent over the network.
setInterval(() => { if (installer.snapshot().busy) chrome.runtime.sendMessage({ type: "bridge:pack-heartbeat" }, () => { void chrome.runtime.lastError; }); }, 20000);
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.target !== "bridge-packs") return false;
  if (message.type === "install") {
    try { respond({ ok: true, status: installer.start(message.ids) }); }
    catch (error) { respond({ ok: false, error: error.message }); }
    return false;
  }
  if (message.type === "cancel") { respond({ ok: true, status: installer.cancel() }); return false; }
  if (message.type === "remove") {
    if (!packById(message.id) || (installer.snapshot().busy && installer.snapshot().ids.includes(message.id))) { respond({ ok: false, error: "Дождитесь завершения установки этого голоса." }); return false; }
    deleteVoicePack(message.id).then(() => respond({ ok: true })).catch(error => respond({ ok: false, error: error.message }));
    return true;
  }
  if (message.type !== "status") return false;
  installer.catalogue(message.language).then(info => respond({ ok: true, ...info, status: installer.snapshot() })).catch(error => respond({ ok: false, error: error.message }));
  return true;
});
