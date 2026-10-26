(() => {
  function responseFromScript(text, videoId) {
    const assignment = /\bytInitialPlayerResponse\s*=\s*(\{)/g;
    for (const match of text.matchAll(assignment)) {
      const start = match.index + match[0].length - 1;
      let depth = 0, quoted = false, escaped = false;
      for (let index = start; index < text.length; index += 1) {
        const char = text[index];
        if (quoted) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') quoted = false;
        } else if (char === '"') quoted = true;
        else if (char === "{") depth += 1;
        else if (char === "}" && --depth === 0) {
          try {
            const data = JSON.parse(text.slice(start, index + 1));
            if (data.videoDetails?.videoId === videoId) return data;
          } catch { /* Only JSON is read; page code is never evaluated. */ }
          break;
        }
      }
    }
    return null;
  }
  function sourceFromResponse(response) {
    const captions = response?.captions?.playerCaptionsTracklistRenderer;
    const tracks = Array.isArray(captions?.captionTracks) ? captions.captionTracks : [];
    const audio = Array.isArray(captions?.audioTracks) ? captions.audioTracks[captions.defaultAudioTrackIndex || 0] : null;
    const indices = Array.isArray(audio?.captionTrackIndices) ? audio.captionTrackIndices : tracks.map((_, index) => index);
    const associated = indices.map((index) => tracks[index]).filter(Boolean);
    const preferred = tracks[audio?.defaultCaptionTrackIndex];
    const source = associated.find((track) => track === preferred && track.kind === "asr")
      || associated.find((track) => track.kind === "asr")
      || tracks[audio?.defaultCaptionTrackIndex] || associated[0];
    if (!source || !/^[a-z]{2,3}(?:-[a-z0-9]+)*$/i.test(source.languageCode || "")) return null;
    return {
      code: source.languageCode,
      label: typeof source.name?.simpleText === "string" ? source.name.simpleText : source.languageCode,
      canTranslate: source.isTranslatable === true,
      translations: Array.isArray(captions.translationLanguages) ? captions.translationLanguages.map((item) => item.languageCode) : []
    };
  }
  function readSource(documentRoot, videoId) {
    for (const script of documentRoot.querySelectorAll("script:not([src])")) {
      if (!script.textContent.includes("ytInitialPlayerResponse")) continue;
      const response = responseFromScript(script.textContent, videoId);
      if (response) return sourceFromResponse(response);
    }
    return null;
  }
  globalThis.BridgeVideoLanguage = { responseFromScript, sourceFromResponse, readSource };
})();
