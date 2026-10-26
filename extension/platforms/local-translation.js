(() => {
  const language = (value) => {
    const code = String(value || "").replaceAll("_", "-").toLowerCase();
    return /^zh-(?:hant|tw|hk)(?:-|$)/.test(code) ? "zh-Hant" : code.split("-")[0];
  };
  const failure = (message) => Object.assign(new Error(message), { retryable: false });
  async function availability(source, target, api = globalThis) {
    if (!source || source === "auto") return "source-needed";
    if (language(source) === language(target)) return "same-language";
    if (!api.Translator) return "unsupported";
    try { return await api.Translator.availability({ sourceLanguage: language(source), targetLanguage: language(target) }); }
    catch { return "unavailable"; }
  }
  const aborted = () => new DOMException("Перевод отменён", "AbortError");
  function cancellable(promise, signal) {
    if (signal?.aborted) {
      Promise.resolve(promise).catch(() => {});
      return Promise.reject(aborted());
    }
    return new Promise((resolve, reject) => {
      const cancel = () => { cleanup(); reject(aborted()); };
      const cleanup = () => signal?.removeEventListener("abort", cancel);
      signal?.addEventListener("abort", cancel, { once: true });
      Promise.resolve(promise).then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
    });
  }
  function createLocalTranslator(api = globalThis) {
    let pair = "", instance = null, loading = null, generation = 0, setupController = null, idleTimer = null, wanted = null;
    const cache = new Map(), pending = new Map();
    function touch() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => { if (loading || pending.size) touch(); else destroy(true); }, 60000);
      idleTimer?.unref?.();
    }
    function destroy(keepPair = false) {
      clearTimeout(idleTimer);
      generation += 1;
      setupController?.abort(); setupController = null;
      instance?.destroy(); instance = loading = null; pair = "";
      cache.clear(); pending.clear();
      if (!keepPair) wanted = null;
    }
    async function prepare(source, target, { signal, onProgress = () => {} } = {}) {
      if (signal?.aborted) throw aborted();
      const sourceLanguage = language(source), targetLanguage = language(target);
      if (!sourceLanguage || !targetLanguage) throw failure("Не удалось определить язык субтитров. Выберите исходный язык слева в Bridge.");
      if (sourceLanguage === targetLanguage) { destroy(); return; }
      if (!api.Translator) throw failure("Для локального перевода нужен Chrome 138 или новее с поддержкой Translator. Обновите Chrome или выберите язык имеющихся субтитров.");
      const key = `${sourceLanguage}:${targetLanguage}`;
      if (pair !== key) { destroy(); pair = key; }
      wanted = { source, target };
      if (instance) { touch(); return; }
      if (!loading) {
        const revision = generation;
        loading = (async () => {
          const options = { sourceLanguage, targetLanguage };
          const availability = await api.Translator.availability(options);
          if (revision !== generation) throw aborted();
          if (availability === "unavailable") throw failure("Chrome не поддерживает локальный перевод для этих языков на этом компьютере. Выберите доступную дорожку или другой язык.");
          onProgress(availability === "available" ? "Готовим локальный перевод…" : "Chrome загружает языковой пакет для локального перевода. Дождитесь завершения; текст остаётся на компьютере.");
          const setup = new AbortController(); setupController = setup;
          const timeout = setTimeout(() => setup.abort(), 180000);
          let translator;
          try {
            const creation = api.Translator.create({ ...options, signal: setup.signal, monitor(monitor) {
              monitor.addEventListener("downloadprogress", (event) => {
                if (revision === generation && !signal?.aborted) onProgress(`Загружаем языковой пакет: ${Math.round(Math.max(0, Math.min(1, event.loaded)) * 100)}%. Текст остаётся на компьютере.`);
              });
            } }).then((value) => {
              if (setup.signal.aborted || revision !== generation) { value.destroy(); throw aborted(); }
              return value;
            });
            translator = await cancellable(creation, setup.signal);
          } catch (error) {
            if (setup.signal.aborted && revision === generation) throw failure("Загрузка переводчика не завершилась за три минуты. Проверьте интернет и нажмите «Повторить запуск» в Bridge.");
            throw error;
          } finally { clearTimeout(timeout); if (setupController === setup) setupController = null; }
          if (revision !== generation) { translator.destroy(); throw aborted(); }
          instance = translator;
          touch();
        })().catch((error) => {
          if (error.name === "NotAllowedError") throw failure("Для загрузки локального переводчика нажмите «Повторить запуск» в шестерёнке Bridge. Если браузер запрещает перевод на этом сайте, он останется недоступным.");
          if (error.name === "NotSupportedError") throw failure("Эта пара языков недоступна локальному переводчику Chrome.");
          if (error.name === "AbortError" || error.retryable === false) throw error;
          throw failure("Chrome не смог подготовить локальный перевод. Проверьте интернет для первой загрузки языкового пакета и нажмите «Повторить запуск».");
        }).finally(() => { if (revision === generation) loading = null; });
      }
      await cancellable(loading, signal);
    }
    async function translate(text, { signal } = {}) {
      if (signal?.aborted) throw aborted();
      if (!instance && wanted) await prepare(wanted.source, wanted.target, { signal });
      if (!instance) throw failure("Локальный переводчик ещё не готов. Нажмите «Повторить запуск» в Bridge.");
      touch();
      text = String(text).trim().slice(0, 500);
      if (!text) return "";
      if (cache.has(text)) return cache.get(text);
      if (!pending.has(text) && pending.size) {
        const revision = generation;
        await cancellable(Promise.allSettled([...pending.values()]), signal);
        if (revision !== generation) throw aborted();
        return translate(text, { signal });
      }
      if (!pending.has(text)) {
        const revision = generation, translator = instance;
        const operation = translator.translate(text).then((result) => {
          if (revision !== generation) throw aborted();
          const value = String(result || "").trim().slice(0, 1500);
          if (!value) throw failure("Chrome вернул пустой перевод. Повторите запуск Bridge.");
          cache.set(text, value);
          if (cache.size > 128) cache.delete(cache.keys().next().value);
          return value;
        }).finally(() => { if (revision === generation) { pending.delete(text); touch(); } });
        pending.set(text, operation);
      }
      return cancellable(pending.get(text), signal);
    }
    return { prepare, translate, destroy, async status(source, target) { return pair === `${language(source)}:${language(target)}` && instance ? "available" : availability(source, target, api); }, get busy() { return pending.size > 0; } };
  }
  async function detectLanguage(text, api = chrome) {
    if (String(text).trim().length < 15 || !api.i18n?.detectLanguage) return "";
    return new Promise((resolve) => api.i18n.detectLanguage(String(text).slice(0, 1000), (result) => {
      if (api.runtime.lastError || !result) { resolve(""); return; }
      const candidate = result.languages?.[0];
      // CLD marks short caption sentences "unreliable" even at 100%.
      // Permit a complete multiword sentence; tiny fragments still need a
      // manual source choice rather than guessing from one or two words.
      const sentence = String(text).length >= 40 && (String(text).match(/\p{L}+/gu) || []).length >= 8 && candidate?.percentage === 100;
      resolve((result.isReliable || sentence) && candidate?.percentage >= 70 && candidate.language !== "und" ? candidate.language : "");
    }));
  }
  globalThis.BridgeLocalTranslation = Object.freeze({ createLocalTranslator, detectLanguage, failure, availability });
})();
