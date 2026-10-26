# Атрибуция и лицензии

Этот репозиторий — **производная сборка** (перепаковка и квантизация весов) чужих моделей.
Собственных обученных весов здесь нет. Всё перечисленное ниже распространяется на условиях
**Apache License 2.0** (текст — в файле `LICENSE`).

| Что | Откуда | Автор | Лицензия | Что здесь взято |
|---|---|---|---|---|
| Синтезатор (граф ONNX, fp32) | [NGC404/sgspeech-vosk-tts-ru-0.10-prepared](https://huggingface.co/NGC404/sgspeech-vosk-tts-ru-0.10-prepared) (`model_fp32.onnx`) | sgspeech / NGC404 | Apache-2.0 | `part_a.onnx`, `part_b_fp16.onnx` — разрезанный граф, веса fp32 → fp16 |
| Исходная модель Vosk-TTS ru 0.10 multi (57 голосов) | [alphacep/vosk-tts](https://github.com/alphacep/vosk-tts), `vosk-model-tts-ru-0.10-multi` | Alpha Cephei | Apache-2.0 | `config.json`, словарь произношений → `dictionary.txt.gz` |
| BERT (`ruBert-base`, вход синтезатора) | вложен в `vosk-model-tts-ru-0.10-multi/bert` | SberDevices | Apache-2.0 | `bert_u8.onnx` (квантизация uint8), `vocab.txt` |
| Подход «prepared» (предобработка графа ONNX Runtime) | [eae1212/vosk-tts-ru-0.9-prepared](https://huggingface.co/eae1212/vosk-tts-ru-0.9-prepared) | eae1212 | Apache-2.0 | идея; у sgspeech применена к версии 0.10 |

BERT: Zmitrovich D. et al., *A Family of Pretrained Transformer Language Models for Russian*,
[arXiv:2309.10931](https://arxiv.org/abs/2309.10931).

## Что изменено относительно исходных файлов

- граф синтезатора разрезан на две части; крупные веса сохранены в fp16;
- веса BERT и его таблица эмбеддингов квантизованы в uint8 (динамическая квантизация ONNX Runtime);
- словарь: оставлен лучший по вероятности вариант каждого слова, формат `слово<TAB>фонемы`, gzip.

Подробности — в `README.md`; все шаги воспроизводятся скриптом `scripts/build.py`.
Скрипты в `scripts/` используют пакеты `onnx`, `onnxruntime` (MIT), `vosk-tts` (Apache-2.0).
