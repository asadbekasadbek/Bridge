---
license: apache-2.0
language:
- ru
library_name: onnx
pipeline_tag: text-to-speech
base_model: vosk-model-tts-ru-0.10-multi
tags:
- text-to-speech
- tts
- vosk
- onnx
- webgpu
- onnxruntime-web
- quantization
---

# vosk-tts-ru-0.10-webgpu-fp16

Русский синтез речи **Vosk-TTS ru 0.10 multi** (57 голосов) для запуска **в браузере** через
ONNX Runtime Web. Загрузка ≈ **285 МБ** вместо ≈ 1 ГБ. Работает и на WASM, и на WebGPU.

Это не новая обученная модель, а упаковка чужих (см. [`NOTICE.md`](NOTICE.md)): синтезатор взят из
[NGC404/sgspeech-vosk-tts-ru-0.10-prepared](https://huggingface.co/NGC404/sgspeech-vosk-tts-ru-0.10-prepared),
остальное — из оригинального `vosk-model-tts-ru-0.10-multi` (Alpha Cephei).

## Файлы

| Файл | Размер | Назначение |
|---|---|---|
| `part_a.onnx` | 0,9 МБ | Часть A синтезатора: эмбеддинги фонем + проекция BERT |
| `part_b_fp16.onnx` | 110 МБ | Часть B синтезатора: веса fp16, вычисления fp32 |
| `bert_u8.onnx` | 157 МБ | BERT (ruBert-base), uint8 |
| `dictionary.txt.gz` | 15 МБ | Словарь произношений (`слово<TAB>фонемы`) |
| `vocab.txt`, `config.json` | 2 МБ | Токены BERT, карта фонем и параметры |
| `scripts/build.py`, `scripts/synth.py` | | Пересборка файлов; проверка на CPU |

## Как запускать

- **BERT и часть A — всегда на WASM.** На WebGPU они считаются неверно (ошибка в Gather: эмбеддинги
  отличаются от CPU, речь получается шумом или с сильными паузами между словами).
- **Часть B (`split`, fp16-веса) можно запускать на WASM или на WebGPU:**

| Часть B на | Скорость | RTF |
|---|---|---|
| WASM (4 потока) | ≈ 1,6× быстрее реального времени | ≈ 0,6 |
| WebGPU | ≈ 4× быстрее реального времени | ≈ 0,25 |

Замеры ориентировочные (Apple Silicon, Chromium, одна фраза ≈ 8 с, после прогрева; на другом
железе будет иначе).

Для многопоточного WASM страница должна быть `crossOriginIsolated`
(`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`).

Токенизация BERT, g2p и сборка входов выполняются вне ONNX и повторяют пакет
[`vosk-tts`](https://github.com/alphacep/vosk-tts). Проверка на CPU:

```bash
pip install vosk-tts onnxruntime numpy
python scripts/synth.py "Привет, мир!" -s 10 -o out.wav
```

Конвейер (`multistream_v1`, L — число фонем с пунктуацией):

1. **BERT** (`bert_u8.onnx`): `input_ids`, `attention_mask`, `token_type_ids` (`int64 [1, n]`); берутся
   эмбеддинги токенов, кроме продолжений слов (`##…`) и знаков `-,.?!;:"`.
2. **Часть A**: `input` `int64 [1, 5, L]`, `bert` `float32 [1, 768, L]` → два тензора
   (`/matcha/encoder/Add_output_0`, `/matcha/encoder/Concat_output_0`).
3. **Часть B**: эти два тензора + `input`, `input_lengths` `[1]`, `scales` `[3]` =
   `[noise_level, 1/speech_rate, duration_noise_level]`, `sid` `[1]`, `bert` → `wav` `float32 [1, T]`,
   22 050 Гц.

## Что сделано

- граф синтезатора разрезан на A и B (A считается на WASM, B на WASM или WebGPU);
- крупные веса синтезатора хранятся в fp16 (224 → 110 МБ), вычисления остаются fp32;
- BERT и его таблица эмбеддингов квантизованы в uint8 (654 → 157 МБ);
- словарь: лучший вариант каждого слова + gzip (101 → 15 МБ).

## Пересборка

Нужны `model_fp32.onnx` из
[NGC404/sgspeech-vosk-tts-ru-0.10-prepared](https://huggingface.co/NGC404/sgspeech-vosk-tts-ru-0.10-prepared)
и распакованный `vosk-model-tts-ru-0.10-multi` (https://alphacephei.com/vosk/models):

```bash
pip install onnx onnxruntime numpy
python scripts/build.py --model model_fp32.onnx --vosk-dir vosk-model-tts-ru-0.10-multi
```

Скрипт собирает все файлы и проверяет на CPU, что `A+B` совпадает с целым графом.

## Лицензия и авторы

Apache-2.0. Исходные модели принадлежат их авторам: Alpha Cephei
(Vosk-TTS), SberDevices (ruBert-base). Подробности — в [`NOTICE.md`](NOTICE.md).
