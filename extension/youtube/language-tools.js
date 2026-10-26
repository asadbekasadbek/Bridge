(() => {
  const captionTitle = /subtitles|captions|субтитр|untertitel|subt[ií]tulos|sous.titres|sottotitoli|altyaz|subtitr|字幕|자막/i;
  const autoTitle = /auto.?translat|авто.?перевод|automatisch.{0,15}[üu]bersetz|traduc.{0,15}autom|tradu.{0,15}autom|traduction automatique|otomatik.{0,12}çevir|avtomatik.{0,12}tarjima|自動翻訳|自动翻译|자동 번역/i;
  const normalize = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase()
    .replace(/[‘’ʻʼ`´]/g, "'").replace(/\s+/g, " ").trim();
  function isTranslationMenu(label) {
    return autoTitle.test(label) || /^(?:перевести|translate|übersetzen|traducir|traduire|traduci|çevir|tarjima|翻译|翻訳|번역)$/i.test(normalize(label));
  }
  const namesCache = new Map();
  function languageNames(code, locale = document.documentElement.lang || "en") {
    const key = `${locale}:${code}`;
    if (namesCache.has(key)) return namesCache.get(key);
    const base = code.split(/[-_]/)[0];
    const names = new Set([normalize(base), normalize(code)]);
    for (const displayLocale of [locale, base, "en", "ru"]) {
      try {
        const display = new Intl.DisplayNames([displayLocale], { type: "language" });
        names.add(normalize(display.of(base)));
        names.add(normalize(display.of(code)));
      } catch { /* Unsupported interface locale; keep other exact names. */ }
    }
    if (namesCache.size >= 64) namesCache.delete(namesCache.keys().next().value);
    namesCache.set(key, names);
    return names;
  }
  function matchesLanguage(label, code, locale) {
    // A translated track is labelled "English >> Russian". Its destination,
    // never its source, must match the user's saved language.
    const destination = normalize(label).split(/\s*(?:>>|»|→|➜)\s*/).pop();
    const names = languageNames(code, locale);
    return names.has(destination) || names.has(destination.replace(/\s*(?:\([^)]*\)|\[[^\]]*\])/g, "").trim());
  }
  const translated = label => />>|»|→|➜/.test(label || "");
  const generated = /(?:auto[ -]?generated|создан[оы]? автоматически|автоматически создан[оы]?|\[авто\]|\(авто\)|automatisch.{0,12}generiert|generad[oa].{0,12}autom[aá]tic|g[ée]n[ée]r[ée].{0,12}automatique|자동 생성|自動生成|自动生成)/i;
  function isTargetTrack(label, target, { sourceCode = "", locale } = {}) {
    const differentSource = sourceCode && sourceCode.split(/[-_]/)[0] !== target.split(/[-_]/)[0];
    // A Russian ASR track belongs to Russian audio, not to the Korean track
    // the user selected. Translate the selected source instead of silently
    // switching to another audio language's automatic captions.
    if (!matchesLanguage(label, target, locale)) return false;
    if (differentSource && translated(label)) return matchesLanguage(normalize(label).split(/>>|»|→|➜/)[0].trim(), sourceCode, locale);
    return !differentSource || !generated.test(label);
  }
  const generatedPrefix = new RegExp(`^(?:\\(\\s*)?(?:${generated.source})(?:\\s*\\))?(?=\\s|>>|»|→|➜|$)`, "i");
  function isCaptionSettingsHint(text) {
    // Exact YouTube UI strings, not a blacklist of words such as "settings".
    return /^(?:для настройки нажмите на значок(?: настроек)?|click (?:here )?for settings|click (?:the )?(?:gear|settings) icon (?:for settings|to (?:adjust|change) settings))[\s⚙\ufe0f.!]*$/i.test(normalize(text));
  }
  function isTrackNotice(text, codes = [], locale) {
    let rest = normalize(text).replace(/[\u200b-\u200d\ufeff]/g, "");
    const names = [...new Set(codes.filter(Boolean).flatMap(code => [...languageNames(code, locale)]))].sort((a, b) => b.length - a.length);
    let tracks = 0, annotation = false, arrow = false;
    // The source, destination and settings hint may be separate visual lines.
    // Validate the entire block so an ordinary sentence is never stripped by
    // a partial match. Do this before the speech length limit is applied.
    while (rest && tracks < 8) {
      const name = names.find(name => rest.startsWith(name) && /^(?:\s|[([]|>>|»|→|➜|$)/.test(rest.slice(name.length)));
      if (!name) return false;
      rest = rest.slice(name.length).trim(); tracks++;
      const generatedLabel = rest.match(generatedPrefix);
      if (generatedLabel) { annotation = true; rest = rest.slice(generatedLabel[0].length).trim(); }
      if (!rest) return annotation || arrow || tracks > 1;
      if (isCaptionSettingsHint(rest)) return true;
      const separator = rest.match(/^(?:>>|»|→|➜)\s*/);
      if (separator) { arrow = true; rest = rest.slice(separator[0].length).trim(); if (!rest) return false; }
    }
    return false;
  }
  function visible(element) {
    return element && element.getClientRects().length && getComputedStyle(element).display !== "none"
      && getComputedStyle(element).visibility !== "hidden";
  }
  const labelOf = (row) => row?.querySelector(".ytp-menuitem-label, .ytListItemViewModelTitle")?.textContent?.trim() || row?.getAttribute("aria-label") || "";
  const rows = (player) => {
    // YouTube keeps the previous panel in the DOM during its slide animation.
    // Only the last visible panel represents the menu currently being opened.
    const panels = [...player.querySelectorAll(".ytp-settings-menu .ytp-panel")].filter(visible);
    return panels.length ? [...panels[panels.length - 1].querySelectorAll(".ytp-menuitem")].filter(visible) : [];
  };
  const captionRow = (player) => rows(player).find((row) => captionTitle.test(labelOf(row)) && row.getAttribute("role") !== "menuitemradio");
  const radios = (player) => rows(player).filter((row) => row.getAttribute("role") === "menuitemradio");

  async function selectShortsLanguage(player, scope, target, { signal, source, sourceLanguage }) {
    const doc = player.ownerDocument;
    const more = scope.querySelector("ytd-shorts-player-controls #menu-button button, .ytdShortsPlayerControlsMenuButton button");
    if (!more) throw new Error("Не найдено меню субтитров Shorts. Попробуйте другое короткое видео.");
    const check = () => { if (signal.aborted || !player.isConnected) throw new DOMException("Запуск отменён", "AbortError"); };
    const menuRows = () => [...doc.querySelectorAll('yt-sheet-view-model [role="menu"]')].filter(visible).flatMap((menu) => [...menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]')]).filter(visible);
    const captionItem = () => menuRows().find((row) => captionTitle.test(labelOf(row)) && row.getAttribute("role") === "menuitem");
    const options = () => menuRows().filter((row) => row.getAttribute("role") === "menuitemradio");
    const selectedText = (row) => row?.querySelector(".ytListItemViewModelSelectionText")?.textContent?.trim() || "";
    const accepts = label => isTargetTrack(label, target, { sourceCode: sourceLanguage === "auto" ? source?.code : sourceLanguage });
    const waitFor = async (read, message) => {
      const deadline = Date.now() + 4000;
      do { check(); const value = read(); if (value) return value; await new Promise((resolve) => setTimeout(resolve, 80)); } while (Date.now() < deadline);
      throw new Error(message);
    };
    let ownsMenu = false;
    const close = () => {
      if (!ownsMenu) return;
      const selected = options().find((row) => row.getAttribute("aria-checked") === "true");
      if (selected) selected.click();
      else doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true, composed: true }));
      ownsMenu = false;
    };
    signal.addEventListener("abort", close, { once: true });
    try {
      const cc = scope.querySelector("button.ytmClosedCaptioningButtonButton");
      if (cc && cc.getAttribute("aria-pressed") !== "true") cc.click();
      const openRoot = async () => {
        check();
        if (!captionItem()) { more.click(); ownsMenu = true; }
        return waitFor(captionItem, "YouTube не предоставил меню субтитров для этого Shorts.");
      };
      let root = await openRoot();
      const initial = selectedText(root);
      let original = source?.label || initial;
      let changed = false;
      if (sourceLanguage !== "auto") {
        root.click();
        const row = await waitFor(() => options().find((item) => !/>>|»|→|➜/.test(labelOf(item)) && matchesLanguage(labelOf(item), sourceLanguage)), "В этом Shorts нет выбранной исходной дорожки субтитров.");
        original = labelOf(row); changed = row.getAttribute("aria-checked") !== "true";
        row.click(); root = await openRoot();
        await waitFor(() => {
          const label = selectedText(captionItem());
          return !/>>|»|→|➜/.test(label) && matchesLanguage(label, sourceLanguage);
        }, "YouTube не подтвердил исходный язык субтитров Shorts.");
      }
      if (!accepts(selectedText(root))) {
        root.click();
        await waitFor(() => options().length, "YouTube не открыл языки субтитров Shorts.");
        let destination = options().find((row) => accepts(labelOf(row)));
        if (!destination) {
          const auto = options().find((row) => isTranslationMenu(labelOf(row)));
          if (!auto) throw new Error("В этом Shorts нет выбранного языка и автоперевода субтитров. Исходный текст не озвучивается.");
          auto.click();
          destination = await waitFor(() => options().find((row) => matchesLanguage(labelOf(row), target)), "В автопереводе Shorts нет выбранного языка.");
        }
        destination.click(); changed = true;
        root = await openRoot();
      }
      await waitFor(() => accepts(selectedText(captionItem())), "YouTube не подтвердил выбранный язык субтитров Shorts.");
      return { sourceLabel: original || "дорожка Shorts", changed, originalMode: (sourceLanguage === "auto" ? source?.code : sourceLanguage)?.split("-")[0] === target.split("-")[0] };
    } finally { close(); signal.removeEventListener("abort", close); }
  }

  async function selectLanguage(player, target, { signal, source = null, sourceLanguage = "auto", scope = player }) {
    if (scope !== player && scope.querySelector("ytd-shorts-player-controls, .ytdShortsPlayerControlsMenuButton")) {
      return selectShortsLanguage(player, scope, target, { signal, source, sourceLanguage });
    }
    const manualSource = sourceLanguage !== "auto";
    const accepts = label => isTargetTrack(label, target, { sourceCode: manualSource ? sourceLanguage : source?.code });
    let original = manualSource ? "" : source?.label;
    let sourceChanged = false;
    const originalMode = (manualSource ? sourceLanguage : source?.code)?.split("-")[0] === target.split("-")[0];
    const result = (label, changed) => ({ sourceLabel: original || label.split(/>>|»|→|➜/)[0].trim(), changed, originalMode });
    const check = () => { if (signal.aborted || !player.isConnected) throw new DOMException("Запуск отменён", "AbortError"); };
    async function waitFor(read, error, timeout = 3500) {
      const deadline = Date.now() + timeout;
      do {
        check();
        const result = read();
        if (result) return result;
        await new Promise((resolve) => setTimeout(resolve, 100));
      } while (Date.now() < deadline);
      throw new Error(error);
    }
    const cc = await waitFor(() => {
      const button = player.querySelector(".ytp-subtitles-button");
      return button && visible(button) && !button.disabled && button.getAttribute("aria-disabled") !== "true" && button;
    }, "YouTube не предоставил субтитры для этого видео.", 5000);
    check();
    if (cc.getAttribute("aria-pressed") !== "true") cc.click();
    const gear = player.querySelector(".ytp-settings-button");
    if (!gear) throw new Error("Не найдено меню языков YouTube. Обновите страницу видео.");
    const menuVisible = () => visible(player.querySelector(".ytp-settings-menu"));
    let ownsMenu = false;
    const closeMenu = () => {
      if (ownsMenu && menuVisible() && player.isConnected) gear.click();
      ownsMenu = false;
    };
    signal.addEventListener("abort", closeMenu, { once: true });
    try {
      async function openRoot() {
        check();
        if (menuVisible()) gear.click();
        gear.click();
        ownsMenu = true;
        return waitFor(() => captionRow(player), "Не удалось открыть список субтитров YouTube. Проверьте доступность CC и язык интерфейса сайта.");
      }
      let root = await openRoot();
      if (manualSource) {
        // An explicit source selects a real caption track before the target.
        // Changing the label alone would leave YouTube translating another track.
        check(); root.click();
        const nativeSource = await waitFor(() => radios(player).find((row) => {
          const label = labelOf(row);
          return !/>>|»|→|➜/.test(label) && matchesLanguage(label, sourceLanguage);
        }), `У этого видео нет исходной дорожки субтитров на языке «${new Intl.DisplayNames(["ru"], { type: "language" }).of(sourceLanguage.split("-")[0])}». Выберите «Автоматически» или доступную дорожку.`);
        original = labelOf(nativeSource);
        sourceChanged = nativeSource.getAttribute("aria-checked") !== "true";
        if (sourceChanged) { check(); nativeSource.click(); }
        root = await openRoot();
        await waitFor(() => {
          const selected = captionRow(player)?.querySelector(".ytp-menuitem-content")?.textContent || "";
          return !/>>|»|→|➜/.test(selected) && matchesLanguage(selected, sourceLanguage);
        }, "YouTube не подтвердил выбранный исходный язык. Попробуйте «Автоматически».");
        root = captionRow(player);
      }
      const initial = root.querySelector(".ytp-menuitem-content")?.textContent?.trim() || "";
      if (accepts(initial)) return result(initial, sourceChanged);
      check();
      root.click();
      await waitFor(() => radios(player).length, "YouTube не открыл языки субтитров.");
      const direct = radios(player).find((row) => accepts(labelOf(row)));
      let sourceLabel = labelOf(radios(player).find((row) => row.getAttribute("aria-checked") === "true"));
      if (direct) {
        check(); direct.click();
      } else {
        const auto = await waitFor(() => rows(player).find((row) => isTranslationMenu(labelOf(row))),
          "Не найден пункт «Перевести» или «Автоперевод» в меню субтитров YouTube.");
        check(); auto.click();
        const destination = await waitFor(() => radios(player).find((row) => matchesLanguage(labelOf(row), target)),
          "В автопереводе YouTube нет выбранного языка. Язык Bridge сохранён; выберите другое видео или язык.");
        check(); destination.click();
      }
      // Read the resulting selection back from YouTube before accepting text.
      await openRoot();
      await waitFor(() => {
        const current = captionRow(player)?.querySelector(".ytp-menuitem-content")?.textContent;
        return accepts(current);
      }, "YouTube не подтвердил выбранный язык перевода. Исходный текст не озвучивается; язык Bridge сохранён.");
      if (!sourceLabel || /^(off|выкл\.?|отключено)$/i.test(sourceLabel)) sourceLabel = "автоматически по дорожке YouTube";
      return result(sourceLabel, true);
    } finally {
      closeMenu();
      signal.removeEventListener("abort", closeMenu);
    }
  }
  function isLanguageChoice(row) {
    if (row?.matches('yt-list-item-view-model[role="menuitemradio"]')) {
      const title = row.closest("yt-contextual-sheet-layout")?.querySelector('h2, [role="heading"], .ytContextualSheetLayoutHeaderTitle')?.textContent || "";
      return captionTitle.test(title) || isTranslationMenu(title);
    }
    if (!row?.matches('.ytp-menuitem[role="menuitemradio"]')) return false;
    const title = row.closest(".ytp-panel")?.querySelector(".ytp-panel-title")?.textContent || "";
    return captionTitle.test(title) || isTranslationMenu(title);
  }
  globalThis.BridgeLanguageTools = { matchesLanguage, selectLanguage, isLanguageChoice, labelOf, isTranslationMenu, isTargetTrack, isTrackNotice, isCaptionSettingsHint };
})();
