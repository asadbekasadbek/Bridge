(() => {
  function createVoiceDetector(onChange = () => {}) {
    let revision = 0, activeVideo = null, stream = null, context = null, source = null, analyser = null, gain = null, timer = null;
    let lastState = "";
    const tracker = globalThis.BridgePitchTools.createTracker();
    let measurement = null;
    const frame = new Float32Array(4096);
    function report(status, gender = "", hz = 0) {
      const state = `${status}:${gender}`;
      if (state !== lastState) { lastState = state; onChange({ status, gender, hz }); }
    }
    function stop() {
      revision += 1;
      clearInterval(timer); timer = null;
      for (const track of stream?.getTracks() || []) track.stop();
      source?.disconnect(); analyser?.disconnect(); gain?.disconnect();
      context?.close().catch(() => {});
      activeVideo = stream = context = source = analyser = gain = null;
      tracker.reset(); lastState = "";
      measurement = null;
    }
    async function start(video) {
      if (activeVideo === video) return;
      stop();
      activeVideo = video;
      const current = revision;
      report("waiting");
      try {
        if (typeof video?.captureStream !== "function") throw new Error("Unsupported audio capture");
        // Copy the media stream instead of rerouting the <video> output. A
        // failed/CORS-protected capture can never silence the original player.
        stream = video.captureStream();
        for (const track of stream.getVideoTracks()) track.stop();
        context = new AudioContext({ sampleRate: 16000, latencyHint: "playback" });
        analyser = context.createAnalyser(); analyser.fftSize = frame.length;
        gain = context.createGain(); gain.gain.value = 0;
        analyser.connect(gain); gain.connect(context.destination);
        const connect = () => {
          if (current !== revision || source) return;
          for (const track of stream.getVideoTracks()) track.stop();
          if (stream.getAudioTracks().length) { source = context.createMediaStreamSource(stream); source.connect(analyser); }
        };
        stream.addEventListener("addtrack", connect);
        connect();
        await context.resume();
        if (current !== revision) return;
        let voicedAt = performance.now(), signalAt = voicedAt;
        timer = setInterval(() => {
          if (current !== revision || video.paused || video.ended || video.seeking) return;
          analyser.getFloatTimeDomainData(frame);
          const now = performance.now(), pitch = globalThis.BridgePitchTools.estimatePitch(frame, context.sampleRate);
          let energy = 0;
          if (!pitch) for (const sample of frame) energy += sample * sample;
          measurement = { hz: pitch?.hz || 0, confidence: pitch?.confidence || 0, rms: pitch?.rms || Math.sqrt(energy / frame.length), sampleRate: context.sampleRate, mediaTime: video.currentTime };
          const result = tracker.update(pitch, now);
          if (pitch) voicedAt = now;
          if (measurement.rms >= 0.006) signalAt = now;
          report(now - signalAt > 6000 ? "no-signal" : now - voicedAt > 6000 ? "uncertain" : "listening", result.gender, result.hz);
        }, 250);
      } catch {
        if (current === revision) { stop(); report("unavailable"); }
      }
    }
    return { start, stop, info: () => measurement };
  }
  globalThis.BridgeVoiceDetector = Object.freeze({ createVoiceDetector });
})();
