(() => {
  const readOnly = new Set(["bridge:read-preferences", "bridge:voices", "bridge:video-frame", "bridge:voice-packs"]);
  const transient = /message (?:port|channel).*closed|receiving end does not exist|could not establish connection|не ответил/i;
  function readableError(message) {
    if (/extension context invalidated/i.test(message)) return "Bridge обновлён. Обновите эту вкладку YouTube один раз.";
    if (transient.test(message)) return "Не удалось связаться с Bridge. Нажмите «Повторить запуск» в настройках плеера.";
    return message;
  }
  async function request(api, type, payload = {}, { delays = [150, 400, 900], wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Bridge не ответил.")), 5000);
          try {
            api.runtime.sendMessage({ type, ...payload }, (result) => {
              clearTimeout(timer);
              const error = api.runtime.lastError;
              if (error) reject(new Error(error.message));
              else if (!result) reject(new Error("Bridge не ответил."));
              else resolve(result);
            });
          } catch (error) { clearTimeout(timer); reject(error); }
        });
        if (!response.ok) throw Object.assign(new Error(response.error || "Bridge не выполнил запрос."), { responseError: true });
        return response;
      } catch (error) {
        if (!error.responseError && readOnly.has(type) && transient.test(error.message) && attempt < delays.length) { await wait(delays[attempt]); continue; }
        throw new Error(readableError(error.message));
      }
    }
  }
  globalThis.BridgeRuntime = Object.freeze({ request });
})();
