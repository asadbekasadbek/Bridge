# Archived implementations and local test models

## English

This directory keeps historical source code, configuration and licence notices. Large acoustic weights (`*.onnx`) are local data and are excluded from Git. Existing local copies are retained; they are not included in a new clone.

The current extension installs selected voices through Bridge's voice library, using pinned downloads with size/SHA-256 verification. `npm run check`, `npm test`, `npm run package` and `npm run store:kit` do not need archived model weights. Store screenshots are already tracked as images.

Optional `scripts/optimization-browser.mjs` and `scripts/create-store-assets.mjs` use the Denis fixture at `archive/bundled-0.16/voices/ru/denis.onnx` with its adjacent `config.json`. If you need to rerun them after cloning, obtain the `ru_RU-denis-medium` model from the pinned source in `extension/shared/voice-pack-catalogue.js` and verify its size/SHA-256 against that entry before placing it there. Other real-model tests may require additional explicitly selected voices. The old Vosk weights are not needed by the current extension.

Do not force-add model weights to Git. Extension ZIPs and publication materials can be attached to GitHub Releases separately.

## Русский

Здесь сохранены исходники прежних реализаций, конфигурации и уведомления о лицензиях. Большие акустические веса (`*.onnx`) — локальные данные, исключённые из Git. Уже имеющиеся копии сохранены на компьютере; в новый клон они не входят.

Текущее расширение устанавливает выбранные голоса через библиотеку Bridge: источник закреплён, размер и SHA-256 проверяются. Для `npm run check`, `npm test`, `npm run package` и `npm run store:kit` архивные веса не нужны. Изображения для магазина уже сохранены в репозитории.

Необязательные сценарии `scripts/optimization-browser.mjs` и `scripts/create-store-assets.mjs` используют Дениса из `archive/bundled-0.16/voices/ru/denis.onnx` и соседний `config.json`. Для повторного запуска после клонирования скачайте `ru_RU-denis-medium` из закреплённого источника в `extension/shared/voice-pack-catalogue.js`, сверьте размер/SHA-256 с записью каталога и положите модель по этому пути. Другие проверки настоящих моделей могут потребовать дополнительные явно выбранные голоса. Старые веса Vosk текущему расширению не нужны.

Не добавляйте веса в Git принудительно. ZIP расширения и материалы публикации можно отдельно прикрепить к GitHub Releases.
