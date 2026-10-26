(() => {
  const base = (value) => typeof value === "string" ? value.toLowerCase().replaceAll("_", "-").split("-")[0] : "";
  const same = (left, right) => Boolean(base(left) && base(left) === base(right));
  const tracksOf = (video) => Array.from(video?.textTracks || []).filter((track) => ["captions", "subtitles"].includes(track.kind));
  function selectTrack(tracks, language) {
    return tracks.find((track) => track.language.toLowerCase().replaceAll("_", "-") === language.toLowerCase().replaceAll("_", "-"))
      || tracks.find((track) => same(track.language, language));
  }
  function nextCue(cues, time, lookahead = 8) {
    // TextTrack cues are ordered by start time. Avoid copying/scanning an
    // entire movie's transcript for every spoken subtitle.
    if (!cues || !Number.isFinite(time)) return null;
    let left = 0, right = cues.length;
    while (left < right) {
      const middle = (left + right) >>> 1;
      if (cues[middle].startTime <= time) left = middle + 1;
      else right = middle;
    }
    const cue = cues[left];
    return cue && cue.startTime <= time + lookahead ? cue : null;
  }
  function createTrackReader(onChange = () => {}, onInvalid = () => {}) {
    let video = null, selected = null, target = "", manualLanguage = "", showing = false;
    const confirmedLanguage = () => selected?.language || manualLanguage;
    const previous = new Map(), written = new Map(), listeners = new Map();
    function write(track, mode) {
      if (!previous.has(track)) previous.set(track, track.mode);
      written.set(track, mode);
      if (track.mode !== mode) track.mode = mode;
    }
    function bind() {
      const current = tracksOf(video);
      for (const [track, listener] of listeners) if (!current.includes(track)) { track.removeEventListener("cuechange", listener); listeners.delete(track); }
      for (const track of current) if (!listeners.has(track)) { track.addEventListener("cuechange", onChange); listeners.set(track, onChange); }
    }
    function changed() {
      bind();
      if (selected && (!tracksOf(video).includes(selected) || selected.mode === "disabled" || !same(confirmedLanguage(), target))) onInvalid("Дорожка субтитров изменена в плеере. Включите Bridge заново для выбранного языка.");
      onChange();
    }
    function release() {
      const oldVideo = video;
      video = selected = null; target = manualLanguage = "";
      oldVideo?.textTracks?.removeEventListener("change", changed);
      oldVideo?.textTracks?.removeEventListener("addtrack", changed);
      oldVideo?.textTracks?.removeEventListener("removetrack", changed);
      for (const [track, listener] of listeners) track.removeEventListener("cuechange", listener);
      listeners.clear();
      for (const [track, mode] of previous) if (track.mode === written.get(track)) track.mode = mode;
      previous.clear(); written.clear();
    }
    return {
      attach(next) {
        if (video === next) return;
        release(); video = next; bind();
        for (const event of ["change", "addtrack", "removetrack"]) video?.textTracks?.addEventListener(event, changed);
      },
      select(language, sourceLanguage = "auto") {
        const tracks = tracksOf(video);
        // In-band CC1 sometimes has no language metadata. Only an explicit
        // same-language choice can authorize that single unlabelled track.
        const manual = sourceLanguage !== "auto" && same(sourceLanguage, language) && tracks.length === 1 && !base(tracks[0].language) ? tracks[0] : null;
        if (sourceLanguage !== "auto" && !selectTrack(tracks, sourceLanguage) && !manual) throw new Error("У видео нет выбранной исходной дорожки субтитров.");
        const track = selectTrack(tracks, language) || manual;
        if (!track) return null;
        selected = track; target = language; manualLanguage = manual ? sourceLanguage : "";
        for (const item of tracks) write(item, item === track ? showing ? "showing" : "hidden" : "disabled");
        return track;
      },
      show(value) { showing = value; if (selected) write(selected, showing ? "showing" : "hidden"); },
      text() {
        if (!selected || selected.mode === "disabled" || !same(confirmedLanguage(), target)) return "";
        return Array.from(selected.activeCues || [], (cue) => cue.text).join(" ");
      },
      release,
      get selected() { return selected; }
    };
  }
  globalThis.BridgeCaptionTracks = Object.freeze({ base, same, tracksOf, selectTrack, nextCue, createTrackReader });
})();
