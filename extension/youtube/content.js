(() => {
  if (globalThis.bridgeYouTubeMounted) return;
  globalThis.bridgeYouTubeMounted = true;
  const { normalizeCaption, captionDifference, phraseIsReady } = globalThis.BridgeCaptionTools;
  const languageTools = globalThis.BridgeLanguageTools;
  const readYouTubeCaption = globalThis.BridgeCaptionTools.createYouTubeCaptionReader(languageTools);
  const i18n = globalThis.BridgeI18n;
  const platform = globalThis.BridgePlatform || null;
  const platformName = platform?.name || "YouTube";
  const frameToken = crypto.randomUUID();
  const languageNames = new Intl.DisplayNames(["ru"], { type: "language" });
  const audioMixer = globalThis.BridgeAudioMixer.createVideoMixer();
  let player, video, captionLayer, host, button, notice, playerScope;
  let currentPage = "", preferencesLoading = null;
  let menuButton, settingsPanel, sourceSelect, targetSelect, panelStatus, modeHint;
  let voiceGenderSelect, voiceGenderHint, voiceVolume, duckingToggle, duckingRange, audioHint, hideDownloader;
  let voicePackControls;
  let subtitlesToggle, showSubtitles = false, captionDisplayPlayer = null;
  let audioPreferences = { volume: 0.85, duckingEnabled: true, duckingAmount: 0.6 }, voiceGender = "any", voiceInventory = [];
  let estimatedGender = "", detectorStatus = "waiting", voiceChoice = null, voiceModeSaving = false;
  const voiceDetector = globalThis.BridgeVoiceDetector.createVoiceDetector((result) => {
    estimatedGender = result.gender;
    detectorStatus = result.status;
    renderVoiceChoices();
    voicePackControls?.refresh();
  });
  let audioSaveTimer = null, audioSaveRevision = 0, audioSavePending = 0;
  let preferencesReady = false, targetSaving = false, targetGeneration = 0, intentRevision = 0;
  let sourceMetadata = null, detectedFor = "";
  let sourcePreference = "auto";
  let enabled = false, starting = false, port = null, heartbeat = null;
  let previousText = "", pendingText = "", preparedText = "", speaking = false, sequence = 0, pendingMediaAt = 0;
  let captionTimer = null, firstChangeAt = 0, attachTimer = null, speechWatchdog = null;
  let finishEnable = null;
  let startTimeout = null;
  let naturalSpeech = true, phraseTimer = null, pendingSince = 0;
  let captionAttempted = false, languageReady = false, languageController = null;
  let languageRetryTimer = null, languageAttempts = 0;
  let targetLanguage = "", sourceLanguage = "", blockedCaption = "", languageLabel = "";
  let captionDeadline = null, captionSeen = false, captionWaitExpired = false;
  let statusText = `Нажмите «Озвучить субтитры» — Bridge выберет доступную дорожку ${platformName}.`;
  let statusAttention = false;
  let translationAbort = null;
  const captionObserver = new MutationObserver(scheduleCaption);
  function applyDownloaderVisibility(settings = {}) {
    const hidden = settings.hideExternalDownloaders !== false;
    document.documentElement.classList.toggle("bridge-hide-external-downloaders", hidden);
    if (hideDownloader) hideDownloader.checked = hidden;
  }
  applyDownloaderVisibility();

  function applySubtitleVisibility(settings) {
    if (settings) showSubtitles = settings.showSubtitles === true;
    if (subtitlesToggle) subtitlesToggle.checked = showSubtitles;
    if (captionDisplayPlayer !== player) captionDisplayPlayer?.removeAttribute("data-bridge-hide-subtitles");
    captionDisplayPlayer = player;
    // Opacity leaves the timed caption text available; CC stays on for speech.
    player?.toggleAttribute("data-bridge-hide-subtitles", (enabled || starting) && !showSubtitles);
    platform?.showSubtitles(showSubtitles, enabled || starting);
  }

  function isVideoPage() {
    return platform ? true : location.pathname === "/watch" || location.pathname.startsWith("/shorts/");
  }
  function state() {
    return { ok: true, frameToken, platform: platformName, enabled, starting, waitingForTranslation: enabled && !languageReady, targetLanguage, sourceLanguage, sourcePreference, sourceCode: sourcePreference === "auto" ? sourceMetadata?.code || "" : sourcePreference, voiceGender, estimatedGender, detectorStatus, voiceAnalysis: voiceDetector.info(), videoAvailable: Boolean(video?.isConnected && isVideoPage()), status: statusText };
  }
  function displayLanguage(code) {
    if (i18n.locale !== "ru") return i18n.languageName(code);
    const name = languageNames.of(code.split("-")[0]);
    return name[0].toLocaleUpperCase() + name.slice(1);
  }
  function setText(element, text) {
    if (element.textContent !== text) element.textContent = text;
  }
  function renderLanguages() {
    if (!sourceSelect) return;
    const autoOption = sourceSelect.options[0];
    if (autoOption) setText(autoOption, sourceMetadata?.code ? `Авто · ${displayLanguage(sourceMetadata.code)}` : "Автоматически");
    sourceSelect.value = sourcePreference;
    sourceSelect.title = sourcePreference === "auto" ? `Автоматически${sourceMetadata?.code ? `: ${displayLanguage(sourceMetadata.code)}` : ""}` : `Исходный язык выбран вручную: ${displayLanguage(sourcePreference)}`;
    sourceSelect.disabled = !preferencesReady || targetSaving;
    if (targetLanguage) { targetSelect.value = targetLanguage; targetSelect.title = displayLanguage(targetLanguage); }
    targetSelect.disabled = !preferencesReady || targetSaving;
    const sourceCode = sourcePreference === "auto" ? sourceMetadata?.code : sourcePreference;
    const same = sourceCode?.split("-")[0] === targetLanguage.split("-")[0];
    setText(modeHint, targetSaving ? "Сохраняем язык…" : platform
      ? `${platformName}: справа — язык результата. Если готовой дорожки нет, Bridge использует локальный перевод Chrome. При первом запуске Chrome скачивает языковой пакет.` : same
      ? `${displayLanguage(targetLanguage)} → ${displayLanguage(targetLanguage)}: озвучка исходных субтитров без перевода.`
      : sourcePreference === "auto"
        ? "Слева — автоматическое определение или ручной выбор. Справа — язык перевода. Оба выбора сохраняются сразу."
        : "Исходный язык выбран вручную. Нужна дорожка субтитров на этом языке. Вернуться к определению можно через «Автоматически».");
    renderVoiceChoices();
  }
  function refreshSource() {
    const id = platform ? `${location.href}:${video?.currentSrc || ""}` : location.pathname.startsWith("/shorts/") ? location.pathname.split("/")[2] : new URL(location.href).searchParams.get("v");
    if (detectedFor === id && sourceMetadata) return;
    if (detectedFor !== id) { sourceMetadata = null; sourceLanguage = ""; detectedFor = id; }
    sourceMetadata = platform ? platform.source(video) : globalThis.BridgeVideoLanguage.readSource(document, id);
    if (sourceMetadata && sourcePreference === "auto") sourceLanguage = sourceMetadata.label;
    renderLanguages();
  }
  function request(type, payload = {}) {
    return globalThis.BridgeRuntime.request(chrome, type, payload);
  }
  async function loadPreferences() {
    if (preferencesLoading) return preferencesLoading;
    preferencesLoading = readPreferences().finally(() => { preferencesLoading = null; });
    return preferencesLoading;
  }
  async function readPreferences() {
    try {
      const result = await request("bridge:read-preferences");
      i18n.setLocale(result.settings.uiLanguage);
      if (targetSaving) return;
      targetSelect.replaceChildren();
      sourceSelect.replaceChildren(new Option("Автоматически", "auto"));
      for (const language of result.languages) {
        targetSelect.add(new Option(language.name, language.code));
        sourceSelect.add(new Option(language.name, language.code));
      }
      targetLanguage = result.settings.language;
      sourcePreference = result.settings.sourceLanguage || "auto";
      applyAudioSettings(result.settings);
      applyDownloaderVisibility(result.settings);
      applySubtitleVisibility(result.settings);
      voiceGender = result.settings.voiceGender || "any";
      languageLabel = displayLanguage(targetLanguage).toLocaleLowerCase();
      preferencesReady = true;
      renderLanguages();
      render();
      loadVoiceChoices();
    } catch (error) { render(error.message, true); }
  }
  function showPanel(open) {
    if (settingsPanel.hidden === !open) return;
    settingsPanel.hidden = !open;
    menuButton.setAttribute("aria-expanded", String(open));
    host.classList.toggle("bridge-panel-open", open);
    if (open) settingsPanel.style.maxHeight = `${Math.max(160, host.getBoundingClientRect().top - Math.max(0, player.getBoundingClientRect().top) - 24)}px`;
    if (open && host.classList.contains("bridge-shorts")) settingsPanel.style.maxWidth = `${Math.max(180, player.getBoundingClientRect().width - 24)}px`;
    else settingsPanel.style.maxWidth = "";
    if (open) { refreshSource(); if (!preferencesReady) loadPreferences(); else loadVoiceChoices(); }
  }
  function applyAudioSettings(settings) {
    audioPreferences = { volume: settings.volume ?? 0.85, duckingEnabled: settings.duckingEnabled !== false, duckingAmount: settings.duckingAmount ?? 0.6 };
    audioMixer.configure(audioPreferences);
    if (!voiceVolume) return;
    voiceVolume.value = String(Math.round(audioPreferences.volume * 100));
    duckingToggle.checked = audioPreferences.duckingEnabled;
    duckingRange.value = String(Math.round(audioPreferences.duckingAmount * 100));
    duckingRange.disabled = !audioPreferences.duckingEnabled;
    settingsPanel.querySelector("#bridge-voice-volume-value").textContent = `${voiceVolume.value}%`;
    settingsPanel.querySelector("#bridge-ducking-value").textContent = `${duckingRange.value}%`;
    if (audioHint) audioHint.textContent = audioHintText();
  }
  function audioHintText() {
    const detail = !audioPreferences.duckingEnabled ? "Приглушение выключено: оригинал звучит с громкостью плеера."
      : audioPreferences.duckingAmount === 0 ? "При 0% оригинал не приглушается. Увеличьте силу приглушения."
        : `Во время речи оригинал тише на ${Math.round(audioPreferences.duckingAmount * 100)}%. В коротких паузах уровень сохраняется, затем плавно восстанавливается.`;
    return `${detail} Громкость голоса меняется со следующей реплики.`;
  }
  function changeAudio(event) {
    if (!preferencesReady) return;
    if (event?.target === duckingToggle && duckingToggle.checked && Number(duckingRange.value) === 0) duckingRange.value = "60";
    const next = { volume: Number(voiceVolume.value) / 100, duckingEnabled: duckingToggle.checked, duckingAmount: Number(duckingRange.value) / 100 };
    applyAudioSettings(next);
    clearTimeout(audioSaveTimer);
    const revision = ++audioSaveRevision;
    audioHint.textContent = `${audioHintText()} Сохраняем…`;
    audioSaveTimer = setTimeout(() => {
      audioSaveTimer = null;
      audioSavePending += 1;
      request("bridge:audio-settings", { audio: next }).then((result) => {
        if (revision === audioSaveRevision) {
          applyAudioSettings(result.settings);
          audioHint.textContent = `Сохранено. ${audioHintText()}`;
        }
      }).catch((error) => { if (revision === audioSaveRevision) audioHint.textContent = error.message; }).finally(() => { audioSavePending -= 1; });
    }, 150);
  }
  function renderVoiceChoices() {
    if (!voiceGenderSelect) return;
    const counts = { any: 0, female: 0, male: 0 };
    const language = targetLanguage.split(/[-_]/)[0];
    for (const voice of voiceInventory) {
      if (voice.lang.split(/[-_]/)[0] !== language) continue;
      counts.any += 1;
      if (voice.gender === "female" || voice.gender === "male") counts[voice.gender] += 1;
    }
    for (const option of voiceGenderSelect.options) {
      const count = counts[option.value];
      const label = { any: "Авто", female: "Женский", male: "Мужской" }[option.value];
      setText(option, option.value === "any" ? "Авто · по звучанию" : `${label}${count ? ` · ${count}` : " · не установлен"}`);
      option.disabled = count === 0;
    }
    voiceGenderSelect.value = voiceGender;
    voiceGenderSelect.disabled = !preferencesReady || targetSaving || voiceModeSaving;
    const genderName = { female: "женский", male: "мужской" };
    let hint;
    if (voiceGender !== "any") hint = counts[voiceGender] ? `Выбран ${genderName[voiceGender]} голос для текущей и следующих реплик. Выбор сохраняется. Для автоматического переключения выберите «Авто».` : "Для выбранного режима голос не установлен. Выберите подходящий пакет ниже или другой режим.";
    else if (!enabled) hint = "Авто подбирает мужской или женский голос по коротким фрагментам звука. Может ошибаться. Ниже можно установить доступные голоса Bridge.";
    else if (["unavailable", "no-signal"].includes(detectorStatus)) hint = "Пока нет звука для определения тембра. Можно выбрать «Женский» или «Мужской» вручную; иначе звучит доступный голос.";
    else if (detectorStatus === "uncertain") hint = "Звук есть, но тембр пока не распознан. Музыка и несколько голосов могут мешать. Можно выбрать голос вручную.";
    else if (voiceChoice?.fallback) hint = `Определён ${genderName[estimatedGender] || "другой"} тембр, но такого локального голоса нет. Звучит ${voiceChoice.voiceName}.`;
    else hint = estimatedGender ? `Авто: ${genderName[estimatedGender]} тембр. Голос переключается со следующей реплики. Можно исправить выбор вручную.` : "Авто слушает оригинал. Пока тембр не определён, используется доступный голос.";
    setText(voiceGenderHint, hint);
  }
  async function loadVoiceChoices() {
    try { voiceInventory = (await request("bridge:voices")).voices; renderVoiceChoices(); voicePackControls?.refresh(); }
    catch (error) { voiceGenderHint.textContent = error.message; }
  }
  async function chooseVoiceGender() {
    const chosen = voiceGenderSelect.value;
    voiceModeSaving = true;
    renderVoiceChoices();
    try {
      const result = await request("bridge:select-voice-gender", { voiceGender: chosen });
      applyVoiceMode(result.settings.voiceGender);
    } catch (error) { render(error.message, true); }
    finally { voiceModeSaving = false; renderVoiceChoices(); }
  }
  function configureDetector() {
    if (enabled && voiceGender === "any" && video && !video.paused && !video.ended && !video.seeking) voiceDetector.start(video);
    else { voiceDetector.stop(); estimatedGender = ""; detectorStatus = "waiting"; }
  }
  function applyVoiceMode(mode, restart = true) {
    const changed = voiceGender !== mode;
    voiceGender = mode;
    if (changed) voiceChoice = null;
    if (enabled && changed && restart) { quietVideo(); continueVideo(); }
    else if (changed) configureDetector();
    renderVoiceChoices();
  }
  async function chooseLanguage(side) {
    const isSource = side === "source";
    const chosen = isSource ? sourceSelect.value : targetSelect.value;
    const previousTarget = targetLanguage;
    const previousSource = sourcePreference;
    const generation = ++targetGeneration;
    const resume = enabled || starting;
    disable(isSource ? "Меняем исходный язык…" : "Меняем язык озвучки…");
    const revision = intentRevision;
    if (isSource) sourcePreference = chosen;
    else targetLanguage = chosen;
    languageLabel = displayLanguage(targetLanguage).toLocaleLowerCase();
    targetSaving = true;
    renderLanguages();
    render();
    try {
      const result = isSource
        ? await request("bridge:select-source-language", { sourceLanguage: chosen })
        : await request("bridge:select-language", { language: chosen });
      if (generation !== targetGeneration) return;
      targetLanguage = result.settings.language;
      sourcePreference = result.settings.sourceLanguage || "auto";
      languageLabel = displayLanguage(targetLanguage).toLocaleLowerCase();
      render(isSource ? `Исходный язык сохранён: ${sourcePreference === "auto" ? "Автоматически" : displayLanguage(sourcePreference)}.` : `Язык перевода сохранён: ${displayLanguage(targetLanguage)}.`);
      targetSaving = false;
      renderLanguages();
      render();
      if (resume && revision === intentRevision) enable();
    } catch (error) {
      if (generation === targetGeneration) {
        targetLanguage = previousTarget;
        sourcePreference = previousSource;
        languageLabel = displayLanguage(previousTarget).toLocaleLowerCase();
        render(`Язык не сохранён: ${error.message}`, true);
      }
    } finally {
      if (generation === targetGeneration) { targetSaving = false; renderLanguages(); render(); }
    }
  }
  function controlIcon(element, kind) {
    if (element.firstElementChild?.dataset.bridgeIcon === kind) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.dataset.bridgeIcon = kind;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    let shape = kind === "play" ? "M8 5v14l11-7z" : "M7 5h4v14H7zm6 0h4v14h-4z";
    if (kind === "settings") {
      const points = Array.from({ length: 32 }, (_, i) => {
        const angle = (i + 0.5) * Math.PI / 16, radius = i % 4 === 1 || i % 4 === 2 ? 10 : 7.8;
        return `${(12 + Math.cos(angle) * radius).toFixed(2)} ${(12 + Math.sin(angle) * radius).toFixed(2)}`;
      });
      shape = `M${points.join("L")}ZM15.2 12a3.2 3.2 0 1 0-6.4 0a3.2 3.2 0 1 0 6.4 0Z`;
      path.setAttribute("fill-rule", "evenodd");
    }
    path.setAttribute("d", shape);
    svg.append(path); element.replaceChildren(svg);
  }
  function render(text, attention = false) {
    const changed = text !== undefined && text !== statusText;
    if (text !== undefined) { statusText = text; statusAttention = attention; }
    applySubtitleVisibility();
    if (!button) return;
    const shorts = host.classList.contains("bridge-shorts");
    const action = starting ? "Отменить запуск озвучки" : enabled ? "Приостановить озвучку" : "Включить озвучку";
    if (shorts) {
      controlIcon(button, enabled || starting ? "pause" : "play");
      controlIcon(menuButton, "settings");
      menuButton.removeAttribute("title");
    } else {
      setText(button, starting ? "Отменить запуск" : enabled ? "■ Отключить" : "▶ Озвучить субтитры");
      setText(menuButton, "⚙"); menuButton.title = "Настройки перевода Bridge";
    }
    button.removeAttribute("title");
    button.setAttribute("aria-label", action);
    button.disabled = !preferencesReady || targetSaving;
    button.setAttribute("aria-pressed", String(enabled));
    host.dataset.enabled = String(enabled);
    host.classList.toggle("bridge-attention", statusAttention);
    notice.hidden = !statusAttention;
    setText(notice, statusText);
    setText(panelStatus, statusText);
    if (changed && enabled) send({ type: "state" });
  }
  function clearPending() {
    translationAbort?.abort(); translationAbort = null;
    audioMixer.stop();
    clearTimeout(captionTimer);
    clearTimeout(speechWatchdog);
    clearTimeout(phraseTimer);
    captionTimer = null;
    firstChangeAt = 0;
    previousText = "";
    pendingText = "";
    preparedText = "";
    pendingMediaAt = 0;
    speaking = false;
    pendingSince = 0;
  }
  function disable(reason = "Озвучка выключена.", attention = false) {
    intentRevision += 1;
    enabled = false;
    starting = false;
    voiceDetector.stop(); estimatedGender = ""; voiceChoice = null;
    captionObserver.disconnect();
    clearInterval(heartbeat);
    clearTimeout(startTimeout);
    clearTimeout(captionDeadline);
    clearTimeout(languageRetryTimer);
    languageAttempts = 0;
    languageController?.abort();
    platform?.release();
    languageController = null;
    languageReady = false;
    captionAttempted = false;
    heartbeat = null;
    clearPending();
    const previousPort = port;
    port = null;
    if (previousPort) { try { previousPort.disconnect(); } catch { /* Extension reloaded. */ } }
    render(reason, attention);
    renderVoiceChoices();
    if (finishEnable) { finishEnable(state()); finishEnable = null; }
    return state();
  }
  function send(message) {
    if (!port) return false;
    try { port.postMessage(message); return true; }
    catch { disable("Связь с Bridge потеряна. Обновите страницу YouTube.", true); return false; }
  }
  function visibleCaption() {
    if (platform) return normalizeCaption(platform.readCaption());
    const codes = [targetLanguage, sourcePreference === "auto" ? sourceMetadata?.code : sourcePreference].filter(Boolean);
    const caption = readYouTubeCaption(captionLayer, codes);
    if (caption.hasSegments) return caption.text;
    for (const track of Array.from(video?.textTracks || [])) {
      if (track.mode === "showing" && track.activeCues?.length && languageTools.matchesLanguage(track.language, targetLanguage)) {
        const texts = Array.from(track.activeCues, cue => cue.getCueAsHTML ? cue.getCueAsHTML().textContent : cue.text);
        return normalizeCaption(texts.filter(text => !languageTools.isTrackNotice(text, codes)).join(" "));
      }
    }
    return "";
  }
  function speakPending(force = false) {
    if (!enabled || !languageReady || !pendingText || !video || video.paused || video.ended || video.seeking) return;
    const elapsed = pendingSince ? Date.now() - pendingSince : 0;
    if (naturalSpeech && !force && !phraseIsReady(pendingText, elapsed)) {
      clearTimeout(phraseTimer);
      phraseTimer = setTimeout(() => speakPending(true), Math.max(0, 650 - elapsed));
      return;
    }
    clearTimeout(phraseTimer);
    if (speaking) {
      if (platform?.translating) return;
      const key = `${estimatedGender}:${video.playbackRate}:${pendingText}`;
      if (preparedText !== key) { preparedText = key; send({ type: "prepare-caption", text: pendingText, playbackRate: video.playbackRate, estimatedGender }); }
      return;
    }
    const text = pendingText;
    const mediaAt = pendingMediaAt;
    pendingText = "";
    preparedText = "";
    pendingSince = 0;
    speaking = true;
    sequence += 1;
    const deliver = (spoken) => {
      if (!send({ type: "caption", sequence, text: spoken, playbackRate: video.playbackRate, estimatedGender })) return;
      render(`Озвучиваем: ${languageLabel}.`);
      // A broken native engine must not leave the reader permanently busy.
      speechWatchdog = setTimeout(() => {
        if (enabled && speaking) disable("Голос не сообщил о завершении речи. Выберите другой локальный голос в Bridge.", true);
      }, 45000);
    };
    if (!platform?.translating) { deliver(text); return; }
    const controller = new AbortController(); translationAbort = controller;
    render(`Переводим локально: ${languageLabel}…`);
    platform.translateCaption(text, { signal: controller.signal }).then((translated) => {
      if (controller.signal.aborted || translationAbort !== controller || !enabled || !languageReady) return;
      if (video.paused || video.seeking || video.ended || Math.abs(video.currentTime - mediaAt) > 4) { speaking = false; speakPending(); return; }
      deliver(translated);
      platform.prefetchCaption();
    }).catch((error) => {
      if (controller.signal.aborted || translationAbort !== controller) return;
      clearPending(); send({ type: "quiet" });
      render(error.message || "Не удалось перевести субтитры локально. Повторите запуск Bridge.", true);
    }).finally(() => { if (translationAbort === controller) translationAbort = null; });
  }
  function readCaption() {
    captionTimer = null;
    firstChangeAt = 0;
    if (!enabled || !languageReady || !video || video.paused || video.ended || video.seeking) return;
    if (captionLayer) {
      const style = getComputedStyle(captionLayer);
      if (style.display === "none" || style.visibility === "hidden" || captionLayer.getAttribute("aria-hidden") === "true" || !captionLayer.getClientRects().length) {
        clearPending();
        send({ type: "quiet" });
        render("Субтитры сейчас не отображаются. Перезапустите озвучку кнопкой Bridge.", true);
        return;
      }
    }
    const current = visibleCaption();
    if (!enabled || !languageReady) return;
    if (blockedCaption && current === blockedCaption) return;
    blockedCaption = "";
    if (!current) {
      previousText = "";
      if (pendingText) speakPending(!naturalSpeech);
      if (!speaking && !captionWaitExpired) render(`Язык выбран: ${languageLabel}. Ждём следующую реплику ${platformName}.`);
      return;
    }
    captionSeen = true;
    captionWaitExpired = false;
    clearTimeout(captionDeadline);
    const difference = captionDifference(previousText, current);
    previousText = current;
    if (!difference.text) return;
    const append = pendingText && (difference.continuing || (naturalSpeech && !speaking))
      && video.currentTime - pendingMediaAt <= 4 && pendingText.length + difference.text.length < 220;
    pendingText = append ? normalizeCaption(`${pendingText} ${difference.text}`) : difference.text;
    if (!append) { pendingSince = 0; pendingMediaAt = video.currentTime; }
    if (!pendingSince) pendingSince = Date.now();
    speakPending();
  }
  function scheduleCaption() {
    if (!enabled) return;
    const now = Date.now();
    if (!firstChangeAt) firstChangeAt = now;
    clearTimeout(captionTimer);
    captionTimer = setTimeout(readCaption, now - firstChangeAt >= 700 ? 0 : 160);
  }
  function observeCaptions() {
    captionObserver.disconnect();
    if (enabled && captionLayer) captionObserver.observe(captionLayer, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["style", "class", "aria-hidden"] });
  }
  function ensureCaptions() {
    if (!enabled || captionAttempted) return;
    captionAttempted = true;
    languageAttempts += 1;
    languageReady = false;
    const controller = new AbortController();
    languageController = controller;
    const before = visibleCaption();
    render(platform ? `Выбираем дорожку ${platformName}: ${languageLabel}…` : `Определяем дорожку YouTube и выбираем перевод: ${languageLabel}…`);
    refreshSource();
    const selectLanguage = platform ? platform.selectLanguage : languageTools.selectLanguage;
    selectLanguage(player, targetLanguage, { signal: controller.signal, source: sourceMetadata, sourceLanguage: sourcePreference, scope: playerScope, languageCodes: Array.from(targetSelect.options, (option) => option.value), onStatus: (message) => { if (enabled && languageController === controller && !controller.signal.aborted) render(message); } }).then((result) => {
      if (!enabled || languageController !== controller || controller.signal.aborted) return;
      sourceLanguage = result.sourceLabel;
      if (platform && result.sourceCode && sourcePreference === "auto") sourceMetadata = { code: result.sourceCode, label: result.sourceLabel };
      renderLanguages();
      clearPending();
      blockedCaption = result.changed ? before : "";
      languageReady = true;
      captionSeen = false;
      captionWaitExpired = false;
      render(`${result.originalMode ? "Озвучка без перевода" : "Дорожка"}: ${sourceLanguage} → ${languageLabel}. ${video.paused ? "Нажмите Play для озвучки." : "Ждём субтитры."}`);
      startCaptionDeadline();
      scheduleCaption();
    }).catch((error) => {
      if (controller.signal.aborted || languageController !== controller || !enabled) return;
      languageReady = false;
      clearPending();
      send({ type: "quiet" });
      const retry = error.retryable !== false && languageAttempts < 3;
      render(`${error.message}${retry ? " Повторим выбор автоматически." : ""}`, true);
      if (retry) languageRetryTimer = setTimeout(() => {
        if (!enabled || languageController !== controller) return;
        captionAttempted = false;
        ensureCaptions();
      }, languageAttempts * 2000);
    });
  }
  function startCaptionDeadline() {
    clearTimeout(captionDeadline);
    if (!enabled || !languageReady || captionSeen || video?.paused || video?.readyState < 2) return;
    captionDeadline = setTimeout(() => {
      if (!enabled || captionSeen || video?.paused) return;
      captionWaitExpired = true;
      render(`${platformName} не передал текст субтитров. Откройте настройки Bridge в плеере и нажмите «Повторить запуск».`, true);
    }, 18000);
  }
  function quietVideo() {
    if (!enabled) return;
    clearPending();
    voiceDetector.stop(); estimatedGender = ""; detectorStatus = "waiting"; voiceChoice = null;
    clearTimeout(captionDeadline);
    send({ type: "quiet" });
    render(video?.ended ? "Видео закончилось. Можно отключить озвучку." : "Озвучка ждёт продолжения видео.");
  }
  function continueVideo() { if (enabled) { configureDetector(); ensureCaptions(); startCaptionDeadline(); scheduleCaption(); } }
  function speedChanged() { if (enabled) { quietVideo(); continueVideo(); } }
  function trackChanged() { if (enabled) scheduleCaption(); }
  function attachVideo(next) {
    if (video === next) return;
    if (video) {
      for (const event of ["pause", "ended", "seeking"]) video.removeEventListener(event, quietVideo);
      for (const event of ["play", "playing", "seeked"]) video.removeEventListener(event, continueVideo);
      video.removeEventListener("ratechange", speedChanged);
      video.textTracks?.removeEventListener("change", trackChanged);
      for (const track of Array.from(video.textTracks || [])) track.removeEventListener("cuechange", trackChanged);
      video.removeEventListener("loadedmetadata", scheduleAttach);
    }
    if (enabled || starting) disable("Видео изменилось. Включите озвучку для нового видео.");
    video = next;
    audioMixer.attach(video);
    if (!video) return;
    for (const event of ["pause", "ended", "seeking"]) video.addEventListener(event, quietVideo);
    for (const event of ["play", "playing", "seeked"]) video.addEventListener(event, continueVideo);
    video.addEventListener("ratechange", speedChanged);
    if (!platform) {
      video.textTracks?.addEventListener("change", trackChanged);
      for (const track of Array.from(video.textTracks || [])) track.addEventListener("cuechange", trackChanged);
    }
    else video.addEventListener("loadedmetadata", scheduleAttach);
  }
  function enable() {
    if (enabled) return Promise.resolve(state());
    if (starting) return Promise.resolve(state());
    if (!video || !isVideoPage()) { render(`Откройте видео ${platformName} и дождитесь появления плеера.`, true); return Promise.resolve(state()); }
    intentRevision += 1;
    starting = true;
    render("Проверяем локальный голос…");
    return new Promise((resolve) => {
      finishEnable = resolve;
      try {
        const connection = chrome.runtime.connect({ name: "bridge:youtube" });
        port = connection;
        connection.onMessage.addListener((message) => {
          if (port !== connection) return;
          if (message.type === "speech" && message.sequence !== sequence) return;
          if (message.type === "ready") {
            clearTimeout(startTimeout);
            starting = false;
            enabled = true;
            voiceGender = message.voiceGender || voiceGender;
            configureDetector();
            sequence = 0;
            naturalSpeech = message.naturalSpeech !== false;
            targetLanguage = message.language;
            sourcePreference = message.sourceLanguage || "auto";
            if (message.audio) applyAudioSettings(message.audio);
            languageLabel = displayLanguage(targetLanguage).toLocaleLowerCase();
            renderLanguages();
            captionAttempted = false;
            observeCaptions();
            ensureCaptions();
            scheduleCaption();
            if (finishEnable) { finishEnable(state()); finishEnable = null; }
          } else if (message.type === "audio-settings") {
            if (!audioSaveTimer && !audioSavePending) applyAudioSettings(message.audio);
          } else if (message.type === "voice-mode") {
            applyVoiceMode(message.voiceGender);
          } else if (message.type === "voice-choice" && message.sequence === sequence) {
            voiceChoice = message;
            renderVoiceChoices();
          } else if (message.type === "speech" && message.event?.type === "loading") {
            if (!speaking) return;
            render(message.event.message || "Готовим выбранный голос…");
            clearTimeout(speechWatchdog);
            speechWatchdog = setTimeout(() => disable("Синтез речи занимает слишком много времени. Попробуйте системный голос в настройках Bridge.", true), 180000);
          } else if (message.type === "speech" && message.event?.type === "start") {
            audioMixer.speaking(true);
            render(`Озвучиваем: ${languageLabel}.`);
          } else if (message.type === "ended") {
            disable(message.reason, message.error === true);
            if (message.error && /нет локального голоса/.test(message.reason || "")) showPanel(true);
          } else if (message.type === "accepted" && message.skipped && message.sequence === sequence) {
            audioMixer.speaking(false);
            clearTimeout(speechWatchdog);
            speaking = false;
            speakPending();
          } else if (message.type === "speech" && ["end", "interrupted", "cancelled", "stopped"].includes(message.event?.type)) {
            audioMixer.speaking(false);
            clearTimeout(speechWatchdog);
            speaking = false;
            speakPending();
          }
        });
        connection.onDisconnect.addListener(() => {
          const error = chrome.runtime.lastError;
          if (port === connection) disable(error ? "Связь с Bridge потеряна. Обновите страницу YouTube." : "Озвучка отключена. Нажмите кнопку, чтобы включить снова.", Boolean(error));
        });
        heartbeat = setInterval(() => send({ type: "ping" }), 20000);
        startTimeout = setTimeout(() => disable("Голос не ответил. Откройте настройки Bridge и проверьте локальный голос.", true), 8000);
        send({ type: "start", frameToken });
      } catch {
        disable("Обновите страницу YouTube после установки или обновления Bridge.", true);
      }
    });
  }
  function attach() {
    attachTimer = null;
    if (!isVideoPage()) {
      disable("Откройте видео YouTube.");
      attachVideo(null);
      host?.remove();
      return;
    }
    const page = location.pathname + location.search;
    if (currentPage && currentPage !== page && (enabled || starting)) disable("Видео изменилось. Включите озвучку для нового видео.");
    currentPage = page;
    const surface = platform ? platform.findSurface() : globalThis.BridgePlayerTools.findSurface();
    const nextPlayer = surface?.player;
    const nextVideo = surface?.video || null;
    const controls = surface?.controls;
    if (!nextPlayer || !controls || !nextVideo) {
      attachVideo(null);
      captionLayer = null;
      captionObserver.disconnect();
      host?.remove();
      return;
    }
    if (platform && player && player !== nextPlayer && (enabled || starting)) disable("Плеер изменился. Включите озвучку для нового видео.");
    player = nextPlayer;
    playerScope = surface.scope;
    attachVideo(nextVideo);
    platform?.bind(video, player, scheduleCaption, (reason) => disable(reason, true), scheduleAttach);
    const nextLayer = platform ? null : player.querySelector(".ytp-caption-window-container");
    if (nextLayer !== captionLayer) { captionLayer = nextLayer; observeCaptions(); scheduleCaption(); }
    if (!host) {
      host = document.createElement("div");
      host.className = "bridge-youtube-control";
      host.id = "bridge-youtube-control";
      button = document.createElement("button");
      button.type = "button";
      button.className = "bridge-youtube-toggle";
      button.setAttribute("aria-describedby", "bridge-youtube-status");
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (enabled || starting) disable(); else enable();
      });
      notice = document.createElement("div");
      notice.id = "bridge-youtube-status";
      notice.className = "bridge-youtube-notice";
      notice.setAttribute("role", "status");
      notice.setAttribute("aria-live", "polite");
      menuButton = document.createElement("button");
      menuButton.type = "button";
      menuButton.className = "bridge-language-settings";
      menuButton.textContent = "⚙";
      menuButton.title = "Настройки перевода Bridge";
      menuButton.setAttribute("aria-label", "Настройки перевода Bridge");
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-controls", "bridge-language-panel");
      settingsPanel = document.createElement("section");
      settingsPanel.id = "bridge-language-panel";
      settingsPanel.className = "bridge-language-panel";
      settingsPanel.setAttribute("aria-label", "Настройки перевода Bridge");
      settingsPanel.hidden = true;
      const title = document.createElement("div");
      title.className = "bridge-panel-title";
      title.textContent = "Настройки Bridge";
      const languages = document.createElement("div"); languages.className = "bridge-language-pair";
      const sourceGroup = document.createElement("div");
      const sourceLabel = document.createElement("label"); sourceLabel.textContent = platform ? "Исходные субтитры" : "Язык видео"; sourceLabel.htmlFor = "bridge-source-language";
      sourceSelect = document.createElement("select"); sourceSelect.id = "bridge-source-language"; sourceSelect.disabled = true;
      sourceSelect.addEventListener("change", () => chooseLanguage("source"));
      sourceGroup.append(sourceLabel, sourceSelect);
      const arrow = document.createElement("span"); arrow.className = "bridge-language-arrow"; arrow.textContent = "→"; arrow.setAttribute("aria-hidden", "true");
      const targetGroup = document.createElement("div");
      const targetLabel = document.createElement("label"); targetLabel.textContent = platform ? "Озвучить субтитры на" : "Перевести и озвучить на"; targetLabel.htmlFor = "bridge-target-language";
      targetSelect = document.createElement("select"); targetSelect.id = "bridge-target-language"; targetSelect.disabled = true;
      targetSelect.addEventListener("change", () => chooseLanguage("target"));
      targetGroup.append(targetLabel, targetSelect);
      languages.append(sourceGroup, arrow, targetGroup);
      modeHint = document.createElement("p"); modeHint.className = "bridge-mode-hint";
      const voiceGroup = document.createElement("div"); voiceGroup.className = "bridge-mix-section";
      const genderLabel = document.createElement("label"); genderLabel.htmlFor = "bridge-voice-gender"; genderLabel.textContent = "Голос озвучки";
      voiceGenderSelect = document.createElement("select"); voiceGenderSelect.id = "bridge-voice-gender";
      for (const [value, label] of [["any", "Авто"], ["female", "Женский"], ["male", "Мужской"]]) voiceGenderSelect.add(new Option(label, value));
      voiceGenderSelect.addEventListener("change", chooseVoiceGender);
      voiceGenderHint = document.createElement("p"); voiceGenderHint.className = "bridge-mode-hint"; voiceGenderHint.id = "bridge-voice-mode-status";
      voiceGroup.append(genderLabel, voiceGenderSelect, voiceGenderHint);
      const mixGroup = document.createElement("div"); mixGroup.className = "bridge-mix-section";
      function slider(id, label, valueId) {
        const row = document.createElement("div"); row.className = "bridge-slider-label";
        const caption = document.createElement("label"); caption.htmlFor = id; caption.textContent = label;
        const output = document.createElement("output"); output.id = valueId; output.htmlFor = id;
        const input = document.createElement("input"); input.type = "range"; input.min = "0"; input.max = "100"; input.step = "1"; input.id = id;
        input.addEventListener("input", changeAudio);
        row.append(caption, output); mixGroup.append(row, input);
        return input;
      }
      voiceVolume = slider("bridge-voice-volume", "Громкость озвучки", "bridge-voice-volume-value");
      const toggleLabel = document.createElement("label"); toggleLabel.className = "bridge-mix-toggle"; toggleLabel.htmlFor = "bridge-ducking-enabled";
      const toggleText = document.createElement("span"); toggleText.textContent = "Приглушать видео во время озвучки";
      duckingToggle = document.createElement("input"); duckingToggle.type = "checkbox"; duckingToggle.id = "bridge-ducking-enabled"; duckingToggle.setAttribute("role", "switch");
      duckingToggle.addEventListener("change", changeAudio);
      toggleLabel.append(toggleText, duckingToggle); mixGroup.append(toggleLabel);
      duckingRange = slider("bridge-ducking-amount", "Сила приглушения оригинала", "bridge-ducking-value");
      audioHint = document.createElement("p"); audioHint.className = "bridge-mode-hint";
      audioHint.textContent = "0% — оригинал без изменений, 100% — без оригинала на время речи. Настройки сохраняются автоматически.";
      mixGroup.append(audioHint);
      panelStatus = document.createElement("p"); panelStatus.className = "bridge-panel-status"; panelStatus.setAttribute("role", "status");
      const retry = document.createElement("button"); retry.type = "button"; retry.className = "bridge-retry"; retry.textContent = "Повторить запуск";
      retry.addEventListener("click", async () => { disable(); if (!preferencesReady) await loadPreferences(); if (preferencesReady) enable(); });
      const note = document.createElement("p"); note.className = "bridge-mode-hint"; note.textContent = platform ? `${platformName}: нужны доступные субтитры. Готовая дорожка имеет приоритет; иначе перевод выполняется локально средствами Chrome 138+. Первый языковой пакет требует скачивания. Голос работает на компьютере.` : "Перевод — через YouTube. Голос — на вашем компьютере. Нужны доступные субтитры.";
      const subtitlesLabel = document.createElement("label"); subtitlesLabel.className = "bridge-mix-toggle";
      subtitlesToggle = document.createElement("input"); subtitlesToggle.type = "checkbox"; subtitlesToggle.id = "bridge-show-subtitles"; subtitlesToggle.setAttribute("role", "switch");
      const subtitlesText = document.createElement("span"); subtitlesText.textContent = "Показывать субтитры на видео";
      subtitlesLabel.append(subtitlesText, subtitlesToggle);
      subtitlesToggle.addEventListener("change", async () => {
        const value = subtitlesToggle.checked, previous = showSubtitles;
        subtitlesToggle.disabled = true;
        applySubtitleVisibility({ showSubtitles: value });
        try { applySubtitleVisibility((await request("bridge:show-subtitles", { value })).settings); }
        catch (error) { applySubtitleVisibility({ showSubtitles: previous }); render(error.message, true); }
        finally { subtitlesToggle.disabled = false; }
      });
      const subtitlesNote = document.createElement("p"); subtitlesNote.className = "bridge-mode-hint"; subtitlesNote.textContent = "Можно скрыть текст и оставить озвучку. Выбор сохраняется автоматически и действует, пока включён Bridge.";
      const downloaderLabel = document.createElement("label"); downloaderLabel.className = "bridge-mix-toggle";
      hideDownloader = document.createElement("input"); hideDownloader.type = "checkbox"; hideDownloader.id = "bridge-hide-downloader";
      const downloaderText = document.createElement("span"); downloaderText.textContent = "Скрыть стороннюю кнопку скачивания";
      downloaderLabel.append(downloaderText, hideDownloader);
      hideDownloader.addEventListener("change", async () => {
        const value = hideDownloader.checked;
        hideDownloader.disabled = true;
        try { applyDownloaderVisibility((await request("bridge:hide-external-downloaders", { value })).settings); }
        catch (error) { hideDownloader.checked = !value; render(error.message, true); }
        finally { hideDownloader.disabled = false; }
      });
      const downloaderNote = document.createElement("p"); downloaderNote.className = "bridge-mode-hint"; downloaderNote.textContent = "Убирает кнопку All-in-One Downloader, которая открывает другой сайт. Озвучка Bridge не требует скачивания видео.";
      settingsPanel.append(title, languages, modeHint, subtitlesLabel, subtitlesNote, voiceGroup, mixGroup);
      title.after(i18n.createControl(document, "bridge-ui-language", uiLanguage => request("bridge:select-ui-language", { uiLanguage })));
      voicePackControls = globalThis.BridgeVoicePackControls.create({ request, language: () => targetLanguage, source: () => sourcePreference === "auto" ? sourceMetadata?.code || "auto" : sourcePreference,
        provider: () => !platform ? "site" : enabled && languageReady && !platform.translating ? "captions" : "local", nativeVoices: () => voiceInventory,
        translation: platform ? { status: (source,target) => platform.translationStatus(source,target), prepare: (source,target,options) => platform.prepareTranslation(source,target,options), cancel: () => platform.cancelTranslation() } : null,
        async onRemoved() { await loadVoiceChoices(); }, async onUse(packs, language) {
        if (language !== targetLanguage || !packs.length) return;
        const resume = enabled || starting;
        disable("Выбираем установленный голос…");
        const result = await request("bridge:select-pack", { id: packs[0].id });
        applyVoiceMode(result.settings.voiceGender, false); await loadVoiceChoices();
        if (resume) enable();
      } });
      voiceGroup.append(voicePackControls.element);
      if (!platform) settingsPanel.append(downloaderLabel, downloaderNote);
      settingsPanel.append(panelStatus, retry, note);
      applyAudioSettings(audioPreferences);
      applyDownloaderVisibility();
      menuButton.addEventListener("click", () => showPanel(settingsPanel.hidden));
      host.addEventListener("click", (event) => event.stopPropagation());
      host.addEventListener("keydown", (event) => { event.stopPropagation(); if (event.key === "Escape") { showPanel(false); menuButton.focus(); } });
      host.append(button, menuButton, notice, settingsPanel);
      i18n.mount(host);
      renderLanguages();
    }
    host.classList.toggle("bridge-shorts", surface.shorts);
    host.classList.toggle("bridge-platform-control", Boolean(platform));
    render();
    if (host.parentElement !== controls) controls.prepend(host);
    platform?.position(host);
    refreshSource();
    if (!preferencesReady) loadPreferences();
  }
  function scheduleAttach() { if (!attachTimer) attachTimer = setTimeout(attach, 100); }
  const structureObserver = new MutationObserver((mutations) => {
    if (host && !host.isConnected) { scheduleAttach(); return; }
    for (const mutation of mutations) {
      // Our own labels and settings do not change the YouTube player surface.
      if (host?.contains(mutation.target)) continue;
      if (mutation.type === "attributes") { scheduleAttach(); return; }
      for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
        if (node.nodeType === 1 && (node.matches("video,.html5-video-player,.ytp-right-controls,.ytp-caption-window-container,ytd-reel-video-renderer,yt-reel-video-renderer")
          || node.querySelector("video,.html5-video-player,.ytp-right-controls,.ytp-caption-window-container,ytd-reel-video-renderer,yt-reel-video-renderer"))) { scheduleAttach(); return; }
      }
    }
  });
  structureObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "is-active", "active", "src"] });
  document.addEventListener("yt-navigate-start", () => { if (settingsPanel) showPanel(false); disable("Открывается другое видео. Включите озвучку после перехода."); });
  document.addEventListener("yt-navigate-finish", scheduleAttach);
  document.addEventListener("fullscreenchange", scheduleAttach);
  if (platform) {
    window.addEventListener("resize", () => platform.position(host), { passive: true });
    document.addEventListener("scroll", () => { platform.position(host); scheduleAttach(); }, { capture: true, passive: true });
    // A SPA can reuse its video element without emitting YouTube's events.
    let address = location.href;
    const navigationTimer = setInterval(() => {
      if (document.hidden) return;
      if (address !== location.href || !video?.isConnected) { address = location.href; scheduleAttach(); }
    }, 1000);
    window.addEventListener("pagehide", () => clearInterval(navigationTimer), { once: true });
  }
  window.addEventListener("popstate", scheduleAttach);
  window.addEventListener("pagehide", () => disable());
  document.addEventListener("click", (event) => { if (event.isTrusted && settingsPanel && !host.contains(event.target)) showPanel(false); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.bridgeSettings?.newValue) return;
    i18n.setLocale(changes.bridgeSettings.newValue.uiLanguage);
    if (changes.bridgeSettings.oldValue?.resourceMode !== changes.bridgeSettings.newValue.resourceMode) voicePackControls?.refresh();
    applyDownloaderVisibility(changes.bridgeSettings.newValue);
    applySubtitleVisibility(changes.bridgeSettings.newValue);
    if (targetSaving) return;
    if (!audioSaveTimer && !audioSavePending) applyAudioSettings(changes.bridgeSettings.newValue);
    // The background's voice-mode event applies active changes in order with
    // speech. A storage notification alone must not race the current caption.
    if (!enabled) applyVoiceMode(changes.bridgeSettings.newValue.voiceGender || "any", false);
    const language = changes.bridgeSettings.newValue.language;
    if (!Array.from(targetSelect?.options || []).some((option) => option.value === language)) return;
    targetLanguage = language;
    const nextSource = changes.bridgeSettings.newValue.sourceLanguage || "auto";
    if (Array.from(sourceSelect?.options || []).some((option) => option.value === nextSource)) sourcePreference = nextSource;
    languageLabel = displayLanguage(language).toLocaleLowerCase();
    renderLanguages();
  });
  document.addEventListener("click", (event) => {
    if (!enabled || !languageReady || !event.isTrusted || !(event.target instanceof Element)) return;
    const row = event.target.closest('.ytp-menuitem, yt-list-item-view-model[role="menuitemradio"]');
    if ((player?.contains(row) || (host?.classList.contains("bridge-shorts") && row?.closest("yt-sheet-view-model"))) && languageTools.isLanguageChoice(row)
      && !languageTools.isTargetTrack(languageTools.labelOf(row), targetLanguage, { sourceCode: sourcePreference === "auto" ? sourceMetadata?.code : sourcePreference })) {
      disable("Язык субтитров YouTube изменён вручную. Нажмите Bridge для возврата к сохранённому языку перевода.");
    }
  }, true);
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (message?.frameToken && message.frameToken !== frameToken) return false;
    if (!state().videoAvailable) return false;
    if (platform && message?.type === "bridge:youtube-toggle" && message.frameToken !== frameToken) return false;
    if (message?.type === "bridge:youtube-status") { respond(state()); return false; }
    if (message?.type === "bridge:youtube-toggle") {
      if (message.enabled === false) { respond(disable()); return false; }
      enable().then(respond);
      return true;
    }
    return false;
  });
  attach();
})();
