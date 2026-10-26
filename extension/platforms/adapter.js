(() => {
  const profile = globalThis.BridgePlatforms.fromUrl(location.href);
  if (!profile || profile.id === "youtube") return;
  const { tracksOf, same } = globalThis.BridgeCaptionTracks;
  const { matchesLanguage } = globalThis.BridgeLanguageTools;
  const local = globalThis.BridgeLocalTranslation.createLocalTranslator();
  const visible = (element) => {
    if (!element?.isConnected || !element.getClientRects().length) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  };
  const captionSelector = profile.captions || ".vjs-text-track-display";
  const menuSelector = ['[role="menu"], [role="listbox"], [data-purpose="captions-dropdown-menu"], [data-a-target="player-settings-menu"], .videoplayer_settings_menu, #raichuSettingsPanel', profile.menus].filter(Boolean).join(", ");
  const rowSelector = '[role="menuitemradio"], [role="option"], [role="menuitem"], button, label';
  const checked = (row) => row?.getAttribute("aria-checked") === "true" || row?.getAttribute("aria-selected") === "true" || row?.querySelector("input:checked");
  const label = (element) => element?.getAttribute("data-language") || element?.getAttribute("aria-label") || element?.textContent?.trim() || "";
  let video = null, player = null, domTarget = "", observer = null, notify = () => {}, invalid = () => {}, showing = false;
  let selectedLanguage = "", abortSignal = null, abortListener = null, translating = false;
  let active = false, shadowStyle = null, controlStyle = null, controlHost = null, sizeObserver = null;
  function roots() {
    const result = [document];
    if (profile.shadowHosts) for (const host of document.querySelectorAll(profile.shadowHosts)) if (host.shadowRoot) result.push(host.shadowRoot);
    return result;
  }
  const reader = globalThis.BridgeCaptionTracks.createTrackReader(() => notify(), (reason) => invalid(reason));
  const captionLayers = (root = player) => [...root?.querySelectorAll(captionSelector) || []].filter((layer) => !layer.closest('button, [role="button"], [role="menu"], [role="listbox"], .bridge-youtube-control'));
  function markCaptions() {
    if (!active) return;
    const root = player?.getRootNode();
    if (root?.host && !root.querySelector("style[data-bridge-caption-style]")) {
      shadowStyle = document.createElement("style"); shadowStyle.setAttribute("data-bridge-caption-style", "");
      shadowStyle.textContent = "[data-bridge-hide-subtitles] [data-bridge-caption-layer]{opacity:0!important;pointer-events:none!important}";
      root.append(shadowStyle);
    }
    for (const layer of captionLayers()) layer.setAttribute("data-bridge-caption-layer", "");
  }
  function release() {
    if (abortListener) abortSignal?.removeEventListener("abort", abortListener);
    abortSignal = abortListener = null;
    domTarget = selectedLanguage = "";
    translating = false;
    reader.release();
    shadowStyle?.remove(); shadowStyle = null;
    for (const layer of player?.querySelectorAll("[data-bridge-caption-layer]") || []) layer.removeAttribute("data-bridge-caption-layer");
  }
  function bind(next, root, onCaption, onInvalid, onStructure) {
    if (video === next && player === root) return;
    release(); observer?.disconnect(); sizeObserver?.disconnect();
    video = next; player = root; notify = onCaption; invalid = onInvalid;
    reader.attach(video);
    if (!player) return;
    sizeObserver = new ResizeObserver(() => position(controlHost));
    sizeObserver.observe(video);
    observer = new MutationObserver((records) => {
      if (records.every((record) => (record.target.nodeType === 3 ? record.target.parentElement : record.target).closest?.(".bridge-youtube-control"))) return;
      if (records.some((record) => [...record.addedNodes || [], ...record.removedNodes || []].some((node) => node.nodeType === 1 && (node.matches("video") || node.querySelector("video"))))) onStructure?.();
      markCaptions(); notify();
    });
    observer.observe(player, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["lang", "data-language", "aria-checked", "aria-selected"] });
  }
  function source(next = video) {
    const tracks = tracksOf(next), track = tracks.find((item) => item.mode === "showing") || [...next?.querySelectorAll("track[default]") || []].map((element) => element.track).find((item) => tracks.includes(item)) || (tracks.length === 1 ? tracks[0] : null);
    if (track) return { code: track.language.replaceAll("_", "-"), label: track.label || track.language };
    const layer = captionLayers()[0], code = layer?.getAttribute("lang") || layer?.getAttribute("data-language");
    return /^[a-z]{2,3}(?:[-_][a-z0-9]+)*$/i.test(code || "") ? { code, label: code } : null;
  }
  async function selectLanguage(root, target, { signal, source: metadata, sourceLanguage = "auto", onStatus, languageCodes = [] }) {
    release(); reader.attach(video);
    const check = () => { if (signal.aborted || !video?.isConnected) throw new DOMException("Запуск отменён", "AbortError"); };
    const waitFor = async (read, timeout = 1600) => {
      const deadline = Date.now() + timeout;
      do { check(); const value = read(); if (value) return value; await new Promise((resolve) => setTimeout(resolve, 100)); } while (Date.now() < deadline);
      return null;
    };
    abortSignal = signal; abortListener = release;
    signal.addEventListener("abort", abortListener, { once: true });
    reader.show(showing);
    const result = () => ({ sourceLabel: sourceLanguage !== "auto" ? sourceLanguage : metadata?.label || "субтитры", changed: true, originalMode: same(sourceLanguage === "auto" ? metadata?.code : sourceLanguage, target) });
    const native = () => {
      const tracks = tracksOf(video);
      if (!globalThis.BridgeCaptionTracks.selectTrack(tracks, target) && !(tracks.length === 1 && !tracks[0].language && same(sourceLanguage, target))) return null;
      const track = reader.select(target, sourceLanguage);
      if (track) { selectedLanguage = target; markCaptions(); return result(); }
      return null;
    };
    check();
    let accepted = native();
    if (accepted) return accepted;
    const button = (selector) => [...root.querySelectorAll(selector)].find((element) => visible(element) && !element.closest(".bridge-youtube-control"));
    const menuRoots = [...new Set([root.getRootNode(), document])];
    const menus = () => menuRoots.flatMap((item) => [...item.querySelectorAll(menuSelector)]).filter(visible);
    const rows = () => menus().flatMap((menu) => [...menu.querySelectorAll(rowSelector)]).filter(visible);
    const layerLanguage = () => {
      const layer = captionLayers(root)[0];
      return layer?.getAttribute("lang") || layer?.getAttribute("data-language") || "";
    };
    const acceptDOM = () => {
      const layer = captionLayers(root)[0], code = layerLanguage();
      if (!visible(layer)) return null;
      const manual = !code && sourceLanguage !== "auto" && same(sourceLanguage, target) && layer.textContent.trim();
      if (!same(code, target) && !manual) return null;
      if (sourceLanguage !== "auto" && !same(sourceLanguage, target)) return null;
      domTarget = selectedLanguage = target; markCaptions(); return result();
    };
    async function useLocalTranslation() {
      const tracks = tracksOf(video);
      let code = sourceLanguage === "auto" ? metadata?.code || layerLanguage() : sourceLanguage;
      if (!code) {
        const selected = rows().find(checked);
        if (selected) code = languageCodes.find((candidate) => matchesLanguage(label(selected), candidate));
        if (!code) {
          const offered = languageCodes.filter((candidate) => rows().some((row) => matchesLanguage(label(row), candidate)));
          if (offered.length === 1) code = offered[0];
        }
      }
      const sourceRow = code && rows().find((row) => matchesLanguage(label(row), code));
      if (sourceRow && !checked(sourceRow)) { sourceRow.click(); check(); }
      let track = code ? globalThis.BridgeCaptionTracks.selectTrack(tracks, code) : null;
      if (!track && sourceLanguage === "auto") track = tracks.find((item) => item.mode === "showing") || (tracks.length === 1 ? tracks[0] : null);
      if (track?.language) code = track.language;
      const cues = track?.activeCues?.length ? track.activeCues : track?.cues;
      const text = track ? Array.from({ length: Math.min(3, cues?.length || 0) }, (_, index) => cues[index].text).join(" ") : captionLayers(root).map((layer) => layer.textContent).join(" ");
      if (!code) code = await globalThis.BridgeLocalTranslation.detectLanguage(text);
      check();
      if (!code) throw globalThis.BridgeLocalTranslation.failure("Не удалось определить язык субтитров. Выберите исходный язык слева в Bridge и повторите запуск.");
      if (same(code, target)) {
        if (track && reader.select(code, code)) { selectedLanguage = code; markCaptions(); return result(); }
        domTarget = selectedLanguage = code; markCaptions(); return result();
      }
      await local.prepare(code, target, { signal, onProgress: onStatus });
      check();
      if (track) {
        if (!reader.select(code, code)) throw new Error("Исходная дорожка субтитров исчезла. Повторите запуск Bridge.");
      } else {
        // A cue can disappear while Chrome downloads its language pack. The
        // confirmed source is still valid; the observer will read the next cue.
        const actual = layerLanguage();
        if (actual && !same(actual, code)) throw new Error("Язык исходных субтитров изменился. Повторите запуск Bridge.");
        domTarget = code;
      }
      selectedLanguage = code; translating = true; markCaptions();
      return { sourceCode: code, sourceLabel: new Intl.DisplayNames(["ru"], { type: "language" }).of(code.split(/[-_]/)[0]), changed: false, originalMode: false, localTranslation: true };
    }
    accepted = acceptDOM();
    if (accepted) return accepted;
    // Native track metadata is already sufficient: start while the user's
    // click still authorizes Chrome's first language-pack download.
    if (tracksOf(video).length && globalThis.Translator) return useLocalTranslation();
    const opener = button(profile.cc || "[aria-label='Subtitles']");
    let menuButton = null, ownsMenu = false;
    try {
      if (opener && (opener.getAttribute("aria-pressed") !== "true" || opener.hasAttribute("aria-haspopup"))) {
        opener.click(); menuButton = opener; ownsMenu = true;
      }
      accepted = await waitFor(() => native() || acceptDOM(), 800);
      if (accepted) return accepted;
      if (globalThis.Translator && !rows().some((row) => matchesLanguage(label(row), target))
        && (captionLayers(root).some((layer) => visible(layer) && layer.textContent.trim()) || rows().some((row) => languageCodes.some((code) => matchesLanguage(label(row), code))))) return await useLocalTranslation();
      if (!menus().length) {
        const settings = button(profile.settings || "[data-a-target='player-settings-button'], .videoplayer_btn_settings, [data-purpose='settings-button'], button[aria-label*='Settings'], button[aria-label*='Настройки'], button[aria-label*='настройки']");
        if (settings) { settings.click(); menuButton = settings; ownsMenu = true; await waitFor(() => menus().length); }
      }
      const captionsRow = rows().find((row) => /^(?:субтитры|subtitles|captions|closed captions)(?:\s|$)/i.test(label(row)) && row.getAttribute("role") !== "menuitemradio");
      if (captionsRow) { captionsRow.click(); await waitFor(() => rows().some((row) => matchesLanguage(label(row), target))); }
      const destination = rows().find((row) => matchesLanguage(label(row), target));
      if (destination) {
        destination.click();
        accepted = await waitFor(() => native() || acceptDOM());
        if (accepted) return accepted;
        // A custom renderer may not expose TextTracks or lang attributes. Only
        // a confirmed checked caption-language row can authorize its text.
        if (menuButton && !menus().length) { menuButton.click(); await waitFor(() => rows().length); }
        const proof = rows().find((row) => checked(row) && matchesLanguage(label(row), target));
        if (proof && (sourceLanguage === "auto" || same(sourceLanguage, target))) {
          domTarget = selectedLanguage = target; markCaptions(); return result();
        }
      }
      accepted = await waitFor(native, 2000);
      if (accepted) return accepted;
      return await useLocalTranslation();
    } finally {
      if (ownsMenu) {
        // Udemy also sets aria-expanded for a tooltip on this same button.
        // Only close an actual language menu, or a click would reopen it.
        if (menus().length) {
          menuButton?.click();
          if (menus().length) document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        }
      }
    }
  }
  function findSurface() {
    let best = active && visible(video) ? video : null, largest = 0;
    for (const item of best ? [] : roots().flatMap((root) => [...root.querySelectorAll("video")])) {
      if (!visible(item) || item.closest("#ad-container, .ad-container, .ads-container, [data-ad-player]") || /advertisement|реклама/i.test(item.title)) continue;
      const box = item.getBoundingClientRect();
      const area = Math.max(0, Math.min(innerWidth, box.right) - Math.max(0, box.left)) * Math.max(0, Math.min(innerHeight, box.bottom) - Math.max(0, box.top));
      if (box.width < 160 || box.height < 90 || area <= largest) continue;
      largest = area; best = item;
    }
    if (!best) return null;
    const root = best.closest(profile.players) || best.parentElement;
    let fullscreen = document.fullscreenElement;
    while (fullscreen?.shadowRoot?.fullscreenElement) fullscreen = fullscreen.shadowRoot.fullscreenElement;
    return { video: best, player: root, scope: root, controls: fullscreen && fullscreen.tagName !== "VIDEO" ? fullscreen : document.body, shorts: false };
  }
  function position(host) {
    if (!host || !video?.isConnected) return;
    controlHost = host;
    const root = host.getRootNode();
    if (controlStyle && controlStyle.getRootNode() !== root) { controlStyle.remove(); controlStyle = null; }
    if (root.host && !controlStyle) {
      controlStyle = document.createElement("link"); controlStyle.rel = "stylesheet";
      controlStyle.setAttribute("data-bridge-control-style", "");
      controlStyle.href = chrome.runtime.getURL("youtube/controls.css");
      root.append(controlStyle);
    }
    const box = video.getBoundingClientRect();
    host.hidden = box.bottom <= 0 || box.top >= innerHeight || box.right <= 0 || box.left >= innerWidth;
    host.style.right = `${Math.max(8, innerWidth - box.right + 12)}px`;
    host.style.top = `${Math.max(8, box.top + 8, Math.min(innerHeight - 44, box.bottom - 86))}px`;
    host.style.maxWidth = `${Math.max(140, Math.min(box.width - 24, innerWidth - 24))}px`;
  }
  globalThis.BridgePlatform = Object.freeze({
    ...profile, findSurface, bind, position, source, selectLanguage,
    translationStatus(source, target) { return local.status(source, target); },
    prepareTranslation(source, target, options) { return local.prepare(source, target, options); },
    cancelTranslation() { local.destroy(); },
    release,
    get translating() { return translating; },
    translateCaption(text, options) { return translating ? local.translate(text, options) : Promise.resolve(text); },
    prefetchCaption() {
      if (!translating || local.busy || !reader.selected?.cues || video.paused) return;
      const next = globalThis.BridgeCaptionTracks.nextCue(reader.selected.cues, video.currentTime);
      if (next?.text) local.translate(next.text, { signal: abortSignal }).catch(() => {});
    },
    readCaption() {
      if (reader.selected) return reader.text();
      if (!domTarget || !same(domTarget, selectedLanguage)) return "";
      const layers = captionLayers().filter(visible);
      if (layers.some((layer) => { const code = layer.getAttribute("lang") || layer.getAttribute("data-language"); return code && !same(code, domTarget); })) {
        invalid("Язык субтитров изменён в плеере. Включите Bridge заново для сохранённого языка."); return "";
      }
      return layers.filter((layer) => !layers.some((other) => other !== layer && other.contains(layer))).map((layer) => layer.textContent).join(" ");
    },
    showSubtitles(value, enabled) { active = enabled; showing = value; reader.show(value); if (active) markCaptions(); }
  });
})();
