# Included third-party components

Bridge uses the following locally packaged components. No runtime CDN or model downloads are used.

- **ONNX Runtime Web 1.30.0**, Microsoft Corporation, MIT. Unmodified `ort.wasm.min.mjs`, `ort-wasm-simd-threaded.mjs`, and `ort-wasm-simd-threaded.wasm` from the npm `onnxruntime-web` distribution. License: `onnxruntime-MIT.txt`. Source: https://github.com/microsoft/onnxruntime
- **vosk-tts-web 1.0.0**, vlapky and contributors, Apache-2.0. `vendor/vosk/g2p.js` and `tokenizer.js` are copied from the npm distribution; `speech/model.js` adapts its inference pipeline to packaged-only assets, one CPU thread and streamed PCM playback. Cache/download/WebGPU paths are removed. License: `vosk-tts-web-APACHE-2.0.txt`. Source: https://www.npmjs.com/package/vosk-tts-web
- **Vosk-TTS ru 0.10 model, browser fp16/uint8 packaging**, vlapky; original models by Alpha Cephei and SberDevices, Apache-2.0. The model files are unmodified. Full upstream attribution and modification history: `../voices/ru/NOTICE.md` and `../voices/ru/README.md`. License: `vosk-model-APACHE-2.0.txt`. Source: https://huggingface.co/vlapky/vosk-tts-ru-0.10-webgpu-fp16

The model contains multiple speaker embeddings; Bridge exposes two voice presets (speaker IDs 1 and 0) as generic female and male voices. Bridge does not train these models or claim ownership of the recordings. Files, exact source revision and SHA-256 checksums are recorded in `../voices/assets.lock.json`.

`speech/russian-text.js`, extension integration and UI are Bridge project code. Voice examples in `examples/` are synthesized locally from the test sentence “Привет! Как ваши дела?”. They are examples, not the audio used to read arbitrary subtitles.
