import { localVoices, prepareSpeech, matchingVoices, normalizeSettings } from "./preferences.js";
import { captionRate } from "./speech-timing.js";
import { installedPackVoices } from "./voice-pack-store.js";

export function createSpeechController(api, onSpeechEvent = () => {}, bundled = null, readInstalled = installedPackVoices) {
  let generation = 0;
  let bundledId = null;
  let loadingTimer = null, loadingMessage = "", bundledReady = false;
  const clearLoading = () => { clearTimeout(loadingTimer); loadingTimer = null; };
  const packedVoices = async () => bundled ? await readInstalled() : [];
  function timedRequest(voices, settings, text, timing, packs) {
    const request = prepareSpeech(voices, settings, text, packs);
    if (timing) request.options.rate = captionRate(request.options.rate, timing.playbackRate);
    return request;
  }

  function inventory() {
    return new Promise((resolve, reject) => {
      api.tts.getVoices((voices) => {
        const error = api.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(Array.isArray(voices) ? voices : []);
      });
    });
  }

  return {
    async warmup(settings) {
      const current = generation;
      const options = normalizeSettings(settings);
      const voice = matchingVoices(await packedVoices(), options.language, options.voiceGender).find((item) => !options.voiceName || item.voiceName === options.voiceName);
      if (current === generation && voice && bundled?.warmup) await bundled.warmup(voice, options.resourceMode);
    },
    async prepare(settings, text, timing) {
      if (!bundled?.prepare) return;
      const current = generation;
      const [voices, packs] = await Promise.all([inventory(), packedVoices()]);
      const request = timedRequest(voices, settings, text, timing, packs);
      if (current === generation && request.bundled && !request.skipped) await bundled.prepare(request.bundled, request.text, { ...request.options, resourceMode: normalizeSettings(settings).resourceMode });
    },
    async voices() {
      return [...await packedVoices(), ...localVoices(await inventory())];
    },
    async preview(settings, text, timing) {
      const requestGeneration = ++generation;
      clearLoading();
      bundledId = null;
      api.tts.stop();
      let request;
      try {
        if (bundled) await bundled.stop();
        if (requestGeneration !== generation) return { cancelled: true };
        const [voices, packs] = await Promise.all([inventory(), packedVoices()]);
        if (requestGeneration !== generation) return { cancelled: true };
        request = timedRequest(voices, settings, text, timing, packs);
      } catch (error) {
        if (requestGeneration !== generation) return { cancelled: true };
        throw error;
      }
      if (requestGeneration !== generation) return { cancelled: true };
      if (request.skipped) return { cancelled: false, skipped: true };
      if (request.bundled) {
        const id = crypto.randomUUID(); bundledId = id;
        loadingMessage = "Подготавливаем речь локально…";
        if (!bundledReady) loadingTimer = setTimeout(() => {
          loadingTimer = null;
          if (bundledId === id) onSpeechEvent({ type: "loading", message: loadingMessage, error: "" });
        }, 900);
        let result;
        try { result = await bundled.speak(id, request.bundled, request.text, { ...request.options, resourceMode: normalizeSettings(settings).resourceMode }); }
        catch (error) {
          if (requestGeneration !== generation) return { cancelled: true };
          if (bundledId === id) { bundledId = null; clearLoading(); }
          throw error;
        }
        if (result.cancelled && bundledId === id) { bundledId = null; clearLoading(); }
        return { cancelled: Boolean(result.cancelled), voiceName: request.options.voiceName };
      }
      await new Promise((resolve, reject) => {
        api.tts.speak(request.utterance, {
          ...request.options,
          onEvent(event) {
            if (requestGeneration !== generation) return;
            if (["start", "end", "error", "interrupted", "cancelled"].includes(event.type)) {
              onSpeechEvent({ type: event.type, error: event.errorMessage || "" });
            }
          }
        }, () => {
          const error = api.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve();
        });
      });
      return { cancelled: false, voiceName: request.options.voiceName };
    },
    stop() {
      generation += 1;
      clearLoading();
      bundledId = null;
      if (bundled) bundled.stop().catch(() => {});
      api.tts.stop();
      onSpeechEvent({ type: "stopped", error: "" });
    },
    onBundledEvent(id, event) {
      if (id !== bundledId || !["loading", "start", "end", "error"].includes(event?.type)) return;
      if (event.type === "loading") { loadingMessage = event.message || loadingMessage; return; }
      clearLoading();
      if (event.type === "start") bundledReady = true;
      if (["end", "error"].includes(event.type)) bundledId = null;
      onSpeechEvent(event);
    }
  };
}
