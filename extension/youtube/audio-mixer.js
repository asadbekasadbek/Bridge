(() => {
  function createVideoMixer({ duration = 160, releaseDuration = duration ? 400 : 0, releaseDelay = 500 } = {}) {
    let video = null, baseVolume = 1, appliedVolume = null, observedVolume = 1, writing = false;
    let active = false, override = false, enabled = true, amount = 0.6;
    let rampTimer = null, releaseTimer = null, rampTarget = null;
    const close = (left, right) => Math.abs(left - right) < 0.00001;
    // Some players round media volume to integer percentages. Their echo of
    // our write is not a new user volume, nor is a mute-only volumechange.
    const ownVolume = value => appliedVolume !== null && Math.abs(value - appliedVolume) <= 0.0051;
    function cancelRamp() { clearTimeout(rampTimer); rampTimer = null; rampTarget = null; }
    function write(value) {
      if (!video) return;
      appliedVolume = Math.max(0, Math.min(1, value));
      writing = true;
      try { video.volume = appliedVolume; }
      finally { writing = false; }
      appliedVolume = observedVolume = video.volume;
    }
    function ramp(target, milliseconds = duration) {
      if (rampTimer !== null && close(rampTarget, target)) return;
      cancelRamp();
      if (!video) return;
      const initial = video.volume, started = Date.now();
      if (milliseconds <= 0 || close(initial, target)) { write(target); return; }
      rampTarget = target;
      function step() {
        const progress = Math.min(1, (Date.now() - started) / milliseconds);
        if (progress > 0) write(initial + (target - initial) * progress);
        if (progress < 1) rampTimer = setTimeout(step, 20);
        else { rampTimer = null; rampTarget = null; }
      }
      step();
    }
    function restore() {
      cancelRamp();
      clearTimeout(releaseTimer);
      releaseTimer = null;
      // Never overwrite a volume adjustment made outside Bridge.
      if (video && ownVolume(video.volume)) write(baseVolume);
      else appliedVolume = null;
      // Keep the last written value until volumechange arrives asynchronously;
      // otherwise our own restoration would look like a manual adjustment.
    }
    function volumeChanged() {
      if (!video) return;
      const value = video.volume;
      if (writing || ownVolume(value)) { observedVolume = value; return; }
      if (close(value, observedVolume)) return;
      cancelRamp();
      clearTimeout(releaseTimer);
      baseVolume = observedVolume = value;
      appliedVolume = null;
      // A native YouTube slider adjustment wins for the current utterance.
      override = active;
    }
    return {
      attach(nextVideo) {
        if (video === nextVideo) return;
        restore();
        video?.removeEventListener("volumechange", volumeChanged);
        video = nextVideo;
        appliedVolume = null;
        active = false; override = false;
        if (video) {
          baseVolume = observedVolume = video.volume;
          video.addEventListener("volumechange", volumeChanged);
        }
      },
      configure(settings = {}) {
        const nextEnabled = typeof settings.duckingEnabled === "boolean" ? settings.duckingEnabled : enabled;
        const nextAmount = typeof settings.duckingAmount === "number" && Number.isFinite(settings.duckingAmount)
          ? Math.max(0, Math.min(1, settings.duckingAmount)) : amount;
        if (nextEnabled === enabled && nextAmount === amount) return;
        enabled = nextEnabled; amount = nextAmount;
        // An explicit change of ducking strength takes effect even after the
        // native volume slider was used. Unrelated settings leave it alone.
        override = false;
        if (!enabled || amount === 0) restore();
        else if (active) ramp(baseVolume * (1 - amount));
      },
      speaking(value) {
        if (!value && !active) return;
        clearTimeout(releaseTimer);
        releaseTimer = null;
        if (value) {
          if (!active) override = false;
          active = true;
          if (video && appliedVolume === null) baseVolume = video.volume;
          if (enabled && amount > 0 && !override) ramp(baseVolume * (1 - amount));
        } else {
          active = false;
          if (!enabled || amount === 0 || override) return;
          // Hold through short phrase gaps; restore more slowly than attack
          // so original audio does not surge between subtitle utterances.
          if (releaseDelay <= 0) ramp(baseVolume, releaseDuration);
          else releaseTimer = setTimeout(() => { releaseTimer = null; if (!override) ramp(baseVolume, releaseDuration); }, releaseDelay);
        }
      },
      stop() { active = false; override = false; restore(); }
    };
  }
  globalThis.BridgeAudioMixer = Object.freeze({ createVideoMixer });
})();
