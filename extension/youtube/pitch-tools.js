(() => {
  // A small YIN-style difference estimator. No learned weights, FFT dependency
  // or transcript processing. Bounded window/work per sample, silence rejected.
  // Calls are synchronous: reuse bounded scratch space instead of allocating
  // two typed arrays on every audio frame. Only the result leaves this module.
  const samples = new Float32Array(512), difference = new Float32Array(171);
  function estimatePitch(input, sampleRate) {
    const step = Math.max(1, Math.floor(sampleRate / 8000));
    const rate = sampleRate / step, length = Math.min(512, Math.floor(input.length / step));
    const maximum = Math.min(Math.floor(rate / 50), Math.floor(length / 3));
    const minimum = Math.max(2, Math.floor(rate / 420));
    if (length < 160 || maximum <= minimum) return null;
    const start = input.length - length * step;
    let mean = 0, energy = 0;
    for (let i = 0; i < length; i++) {
      let value = 0;
      for (let j = 0; j < step; j++) value += input[start + i * step + j];
      samples[i] = value / step; mean += samples[i];
    }
    mean /= length;
    for (let i = 0; i < length; i++) { samples[i] -= mean; energy += samples[i] ** 2; }
    const rms = Math.sqrt(energy / length);
    if (!Number.isFinite(rms) || rms < 0.006) return null;
    const width = length - maximum;
    let accumulated = 0;
    difference[0] = 1;
    for (let lag = 1; lag <= maximum; lag++) {
      let sum = 0;
      for (let i = 0; i < width; i++) { const delta = samples[i] - samples[i + lag]; sum += delta * delta; }
      accumulated += sum;
      difference[lag] = accumulated ? sum * lag / accumulated : 1;
    }
    for (let lag = minimum; lag < maximum; lag++) {
      if (difference[lag] >= 0.28) continue;
      while (lag + 1 <= maximum && difference[lag + 1] < difference[lag]) lag += 1;
      const left = difference[lag - 1], center = difference[lag], right = lag < maximum ? difference[lag + 1] : undefined;
      const denominator = left - 2 * center + right;
      const offset = Number.isFinite(right) && denominator ? Math.max(-0.5, Math.min(0.5, (left - right) / (2 * denominator))) : 0;
      return { hz: rate / (lag + offset), confidence: 1 - center, rms };
    }
    return null;
  }

  function createTracker() {
    let frames = [], gender = "", lastVoicedAt = 0;
    return {
      reset() { frames = []; gender = ""; lastVoicedAt = 0; },
      update(pitch, now) {
        // A pause must not carry one speaker's classification into the next.
        if (lastVoicedAt && now - lastVoicedAt > 1300) { frames = []; gender = ""; }
        if (!pitch || pitch.confidence < 0.72) return { gender, hz: 0 };
        lastVoicedAt = now;
        frames.push(pitch.hz);
        frames = frames.slice(-3);
        const sorted = frames.slice().sort((a, b) => a - b), hz = sorted[Math.floor(sorted.length / 2)];
        if (frames.length >= 2) {
          if (hz < 165) gender = "male";
          else if (hz > 185) gender = "female";
        }
        return { gender, hz };
      }
    };
  }
  globalThis.BridgePitchTools = Object.freeze({ estimatePitch, createTracker });
})();
