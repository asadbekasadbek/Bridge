(() => {
  function normalizeCaption(text) {
    return typeof text === "string" ? text.replace(/<[^>]*>/g, " ").replace(/[\u200b-\u200d\ufeff]/g, "").replace(/\s+/g, " ").trim().slice(0, 500) : "";
  }

  // Automatic YouTube captions often roll the previous line into the next one.
  // Speak only the newly visible words, without retaining the whole transcript.
  function captionDifference(previous, current) {
    const before = normalizeCaption(previous);
    const after = normalizeCaption(current);
    if (!after || before === after || before.startsWith(`${after} `)) return { text: "", continuing: true };
    if (!before) return { text: after, continuing: false };
    if (after.startsWith(`${before} `)) return { text: after.slice(before.length).trim(), continuing: true };
    const oldWords = before.split(" "), newWords = after.split(" ");
    for (let count = Math.min(oldWords.length, newWords.length); count > 0; count--) {
      if (oldWords.slice(-count).join(" ") === newWords.slice(0, count).join(" ")) {
        return { text: newWords.slice(count).join(" "), continuing: true };
      }
    }
    return { text: after, continuing: false };
  }

  function phraseIsReady(text, elapsed = 0) {
    const phrase = normalizeCaption(text);
    const words = phrase.match(/[\p{L}\p{N}]+/gu) || [];
    if (words.length === 0) return false;
    // A word count alone is not a phrase boundary. Wait for punctuation or
    // the latency limit instead of chopping rolling captions after five words.
    const sentenceEnd = /[.!?…。！？]["»”')]*$/.test(phrase);
    const clauseEnd = /[,;:，；：]["»”')]*$/.test(phrase) && (words.length >= 8 || phrase.length >= 80);
    return sentenceEnd || clauseEnd || elapsed >= 650;
  }

  function createYouTubeCaptionReader({ isTrackNotice, isCaptionSettingsHint }) {
    const noticeWindows = new WeakSet();
    return (layer, codes, locale) => {
      const segments = [...(layer?.querySelectorAll(".ytp-caption-segment") || [])];
      const groups = new Map(), visibility = new Map();
      const visible = element => {
        if (!element || element === layer) return true;
        if (visibility.has(element)) return visibility.get(element);
        const style = getComputedStyle(element);
        // Bridge hides subtitles with opacity, while continuing to read them.
        const value = !element.hidden && element.getAttribute("aria-hidden") !== "true"
          && style.display !== "none" && style.visibility !== "hidden" && visible(element.parentElement);
        visibility.set(element, value);
        return value;
      };
      for (const segment of segments) {
        if (!visible(segment)) continue;
        const window = segment.closest(".caption-window") || layer;
        if (!groups.has(window)) groups.set(window, []);
        groups.get(window).push(segment);
      }
      const captions = [];
      for (const [window, parts] of groups) {
        const text = parts.map(part => part.textContent).join(" ");
        // YouTube renders its track/settings notification as caption segments,
        // including an inline SVG gear. Real text cues contain text/ruby only.
        // Exclude that window, not every caption visible at the same time.
        const uiIcon = parts.some(part => part.querySelector("svg, button, [role='button']"));
        if (uiIcon || isTrackNotice(text, codes, locale)) { noticeWindows.add(window); continue; }
        if (noticeWindows.has(window) && isCaptionSettingsHint(text)) continue;
        noticeWindows.delete(window);
        captions.push(text);
      }
      return { hasSegments: segments.length > 0, text: normalizeCaption(captions.join(" ")) };
    };
  }

  globalThis.BridgeCaptionTools = Object.freeze({ normalizeCaption, captionDifference, phraseIsReady, createYouTubeCaptionReader });
})();
