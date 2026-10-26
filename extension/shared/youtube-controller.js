import { matchingVoices, audioSettings, genderOfVoice } from "./preferences.js";

export function captionVoice(settings, voices, estimate) {
  const automatic = settings.voiceGender === "any";
  const requested = automatic && ["male", "female"].includes(estimate) ? estimate : settings.voiceGender;
  const all = matchingVoices(voices, settings.language);
  const matches = requested === "any" || requested === undefined ? all : all.filter((voice) => genderOfVoice(voice) === requested);
  const available = matches.length || !automatic ? matches : all;
  const selected = available.find((voice) => voice.voiceName === settings.voiceName) || available[0];
  if (!selected) throw new Error("Для выбранного режима нет локального голоса. Выберите другой режим в Bridge.");
  return { settings: { ...settings, voiceName: selected.voiceName, voiceGender: automatic ? "any" : requested },
    voiceName: selected.voiceName, gender: genderOfVoice(selected),
    fallback: automatic && ["male", "female"].includes(requested) && !matches.length };
}

export function createYouTubeController({ speech, readSettings, onStateChange = () => {} }) {
  let owner = null;
  const post = (port, message) => { try { port.postMessage(message); } catch { /* Closed tab. */ } };

  function end(reason = "Озвучка выключена.", error = false) {
    const previous = owner;
    if (!previous) return;
    owner = null;
    speech.stop();
    post(previous.port, { type: "ended", reason, error });
    onStateChange(previous.tabId, previous.frameToken);
  }

  function connect(port) {
    const tabId = port.sender.tab.id;
    let started = false;
    port.onMessage.addListener((message) => {
      if (!message || typeof message.type !== "string") return;
      if (message.type === "start") {
        if (started) return;
        started = true;
        end("Озвучка включена в другой вкладке.");
        speech.stop();
        const session = { port, tabId, frameToken: typeof message.frameToken === "string" ? message.frameToken.slice(0, 100) : null, settings: null, voices: [], pendingAudio: null, pendingVoice: null, lastSequence: 0 };
        owner = session;
        Promise.all([readSettings(), speech.voices()]).then(([settings, voices]) => {
          if (owner !== session) return;
          const initial = { ...settings, ...session.pendingVoice };
          const available = matchingVoices(voices, initial.language, initial.voiceGender);
          const selected = initial.voiceName ? available.find((voice) => voice.voiceName === initial.voiceName) : available[0];
          if (!selected) throw new Error("Для выбранного языка нет локального голоса. Откройте настройки Bridge.");
          session.voices = voices;
          session.settings = { ...initial, ...session.pendingAudio, voiceName: selected.voiceName };
          speech.warmup?.(session.settings).catch(() => {});
          post(port, { type: "ready", language: settings.language, sourceLanguage: settings.sourceLanguage || "auto", voiceName: selected.voiceName, voiceGender: session.settings.voiceGender, naturalSpeech: settings.naturalSpeech, audio: audioSettings(session.settings) });
          onStateChange(tabId, session.frameToken);
        }).catch((error) => { if (owner === session) end(error.message, true); });
        return;
      }
      if (owner?.port !== port) return;
      if (message.type === "state") { onStateChange(tabId, owner.frameToken); return; }
      if (message.type === "ping") { post(port, { type: "pong" }); return; }
      if (message.type === "quiet") { speech.stop(); return; }
      if (message.type === "stop") { end(); return; }
      if (message.type === "prepare-caption" && owner.settings) {
        if (typeof message.text === "string" && message.text.trim() && message.text.length <= 500) {
          // Preparation has no playback events and cannot interrupt the voice.
          try {
            const choice = captionVoice(owner.settings, owner.voices, message.estimatedGender);
            speech.prepare?.(choice.settings, message.text, { playbackRate: message.playbackRate }).catch(() => {});
          } catch { /* A later caption reports missing voices to the player. */ }
        }
        return;
      }
      if (message.type !== "caption" || !owner.settings) return;
      if (!Number.isSafeInteger(message.sequence) || message.sequence <= owner.lastSequence) return;
      if (typeof message.text !== "string" || !message.text.trim() || message.text.length > 500) return;
      const session = owner;
      session.lastSequence = message.sequence;
      let choice;
      try { choice = captionVoice(session.settings, session.voices, message.estimatedGender); }
      catch (error) { end(error.message, true); return; }
      post(port, { type: "voice-choice", sequence: message.sequence, voiceName: choice.voiceName, gender: choice.gender, fallback: choice.fallback });
      session.activeVoiceName = choice.voiceName;
      speech.preview(choice.settings, message.text, { playbackRate: message.playbackRate }).then((result) => {
        if (owner === session && session.lastSequence === message.sequence && !result.cancelled) {
          post(port, { type: "accepted", sequence: message.sequence, skipped: Boolean(result.skipped) });
        }
      }).catch((error) => { if (owner === session && session.lastSequence === message.sequence) end(error.message, true); });
    });
    port.onDisconnect.addListener(() => {
      if (owner?.port === port) {
        const frameToken = owner.frameToken;
        owner = null;
        speech.stop();
        onStateChange(tabId, frameToken);
      }
    });
  }

  return {
    connect,
    end,
    setVoices(voices) { if (owner) owner.voices = voices; },
    forgetVoice(voiceName) { if (owner && [owner.activeVoiceName, owner.settings?.voiceName].includes(voiceName)) end("Этот голос удалён. Выберите другой голос в Bridge."); },
    updateResource(resourceMode) { if (owner?.settings) owner.settings.resourceMode = resourceMode; },
    frameFor(tabId) { return owner?.tabId === tabId ? owner.frameToken : null; },
    updateAudio(settings) {
      if (!owner) return;
      owner.pendingAudio = audioSettings(settings);
      if (owner.settings) Object.assign(owner.settings, owner.pendingAudio);
      post(owner.port, { type: "audio-settings", audio: audioSettings(settings) });
    },
    updateVoice(settings) {
      if (!owner) return;
      owner.pendingVoice = { voiceGender: settings.voiceGender, voiceName: settings.voiceName };
      if (owner.settings) Object.assign(owner.settings, owner.pendingVoice);
      post(owner.port, { type: "voice-mode", ...owner.pendingVoice });
    },
    onSpeechEvent(event) {
      if (!owner?.settings) return false;
      if (event.type === "error") end(event.error || "Системный голос не смог озвучить субтитры.", true);
      else post(owner.port, { type: "speech", event, sequence: owner.lastSequence });
      return true;
    }
  };
}
