# Bridge — Subtitle Voice & Translation

[![Version](https://img.shields.io/badge/version-0.18.2-3856f6)](https://github.com/asadbekasadbek/Bridge/releases)
[![GitHub release asset downloads](https://img.shields.io/github/downloads/asadbekasadbek/Bridge/total?label=GitHub%20downloads&color=3856f6)](https://github.com/asadbekasadbek/Bridge/releases)

[English](#english) · [Русский](#русский)

## English

Bridge is a Chrome extension that reads available video subtitles aloud and helps you listen to translated captions. Speech runs on your computer with separately installed voice packs or a compatible local system voice.

**Current version: 0.18.2.** English and Russian store metadata and documentation are included. The YouTube notification fix from 0.18.1 is retained: track names, “auto-generated” notices and the settings hint are excluded from subtitle speech.

### Features

- Independent source language, result language and interface language settings.
- English, Russian and Uzbek interface options, saved across browser restarts.
- A catalogue of **53 optional voice packs for 49 languages**. Install only the voice you need; inspect its size, source and terms before downloading.
- Voice preview, speech speed and volume controls, and manual or automatic male/female voice choice where suitable voices are available.
- Smooth original-audio ducking during speech, with restoration on pause or disable.
- Subtitle text can be hidden while speech continues. Pause, seeking and video changes cancel stale speech.
- Memory-saving mode enabled by default: one acoustic model, up to 8 MiB of speech cache, and engine release after 60 seconds of inactivity.

### Installation

The Chrome Web Store publication package is prepared; this repository does not yet provide a published store-install link.

1. Download the repository using **Code → Download ZIP**, or clone it:

   ```sh
   git clone https://github.com/asadbekasadbek/Bridge.git
   cd Bridge
   ```

2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the repository's **`extension`** folder, which contains `manifest.json`.
4. Open Bridge's settings, choose your interface and result languages, and install one voice or select a compatible local system voice.
5. Open a supported video with captions and enable Bridge in the player.

When a ZIP is available in [GitHub Releases](https://github.com/asadbekasadbek/Bridge/releases), you can instead extract that extension ZIP into a permanent folder and load it in the same way. Use `bridge-0.18.2-lite.zip`, not the larger publisher-materials archive.

To update, replace the files in the same folder, click **Reload** for Bridge in `chrome://extensions`, and reload video tabs. Keep the same installation to retain settings and installed voice packs. End users do not need Node.js, a server or an API key.

### Supported players and translation

Supported integrations: **YouTube / Shorts, TED, Vimeo, Udemy, Coursera, VK Video, RUTUBE and Twitch**. A readable subtitle track or supported caption layer is required. Player changes, sign-in requirements, DRM and unavailable captions can limit support.

YouTube provides its own translated captions. Other supported players use a caption track in the target language or Chrome's local Translator API when available. The local Translator API requires Chrome 138+ and a supported browser/device and language pair; the first language-data download needs a network connection and may require a user gesture.

Voice availability and translation availability are separate. The voice catalogue does not guarantee translation support for every listed language. For example, the pinned catalogue has **no Uzbek voice pack**; a compatible local system voice may be used if installed. Bridge does not substitute untranslated source text for a missing translation.

Bridge reads text subtitles; it does not transcribe arbitrary video audio or clone an actor's voice. Automatic male/female selection uses an approximate local pitch estimate and can be affected by music or noise. Voice preview works offline after installation; the source video website and captions normally still need internet access.

### Privacy and voice licences

Subtitle text and synthesized audio are not sent to the developer or a cloud speech service. Settings are stored in `chrome.storage.local`, voice files in the extension's IndexedDB, and phrase/audio caches in limited memory. Optional voice downloads use pinned revisions and size/SHA-256 checks. The download host receives ordinary connection information, including an IP address; video websites perform their own network requests.

All executable JS/WASM is bundled. Permissions are `storage`, `tts` and `offscreen`, with content scripts limited to supported video sites. No microphone permission is required. Chrome manages its own translation files; Bridge cannot delete them through the Translator API.

Voice terms differ; check each [model card](extension/voices/catalogue) before installation. Third-party notices, licences and corresponding sources are in [extension/licenses](extension/licenses). eSpeak NG is GPL-3.0-or-later. The whole distribution should not be described as MIT. The [privacy-policy source](distribution/chrome-web-store/privacy-policy.md) is available for the publisher to host publicly.

### Downloads counter

The badge above automatically reads **downloads of files attached to public GitHub Releases** using [Shields.io](https://shields.io/badges/git-hub-downloads-all-assets-all-releases). It counts release assets, not unique people, repository clones, **Code → Download ZIP**, or Chrome Web Store installations. See [GitHub's release statistics](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases).

Before the first release is published, the badge displays **“no releases found”**. To start counting, publish a release from the repository's Releases page and attach the extension ZIP built below. Chrome installation/user statistics are separate and become available with a published store listing.

### Build and publish

For development, use Node.js 18+:

```sh
npm run check
npm test
npm run package
npm run store:kit
```

Outputs: `dist/bridge-0.18.2-lite.zip` and `dist/bridge-chrome-web-store-0.18.2.zip`. Build outputs are ignored by Git; upload release files separately if you want to distribute them through Releases and count their downloads.

The store kit contains English and Russian titles, short descriptions and full descriptions, five screenshots, icons, promotional images, review instructions and a privacy-policy template. Extract it and open `START_HERE.html`. Select **English** and **Russian** separately in the store dashboard and paste the corresponding text. The package includes `_locales/en` and `_locales/ru` so both listing languages are available. Detailed instructions: [Chrome Web Store publishing guide](distribution/chrome-web-store/publishing-guide-ru.md).

The publisher supplies their account/contact details, hosts the privacy policy at a public HTTPS URL, uploads the extension ZIP and submits it for review. Publication and search ranking are not guaranteed.

Vendor patches are reproducible: `npm install` runs `postinstall`; `npm run vendor:prepare` restores the pinned patches manually, including after replacing the vendor folder. Both the source revision and checksums are checked. If scripts are disabled during installation, run `npm run vendor:prepare` separately.

Browser checks use Playwright/Chromium in isolated profiles. Relevant scripts include `scripts/caption-notice-browser.mjs`, `scripts/ui-language-browser.mjs`, `scripts/youtube-browser.mjs`, `scripts/shorts-browser.mjs` and `scripts/platforms-browser.mjs`. Caption/control fixtures with substituted speech verify behaviour, not every live site's translation server. Real-model/offline checks are described in the linked reports; the 53 voice packs have not all been benchmarked for speech quality or performance.

Technical reports: [caption-notification fix](docs/caption-notice-2026-10-26.md), [interface languages](docs/ui-language-2026-10-26.md), [audio ducking](docs/ducking-2026-10-26.md), [runtime optimisation](docs/optimization-2026-10-26.md).

## Русский

Bridge — расширение Chrome, которое озвучивает доступные субтитры видео и помогает слушать их перевод. Речь создаётся на компьютере: отдельным голосовым пакетом или подходящим локальным голосом системы.

**Текущая версия: 0.18.2.** Подготовлены документация и тексты карточки магазина на английском и русском. Сохранено исправление YouTube из 0.18.1: названия дорожек, «создано автоматически» и подсказка настроек не попадают в озвучку субтитров.

### Возможности

- Независимый выбор исходного языка, языка результата и языка интерфейса.
- Интерфейс на английском, русском и узбекском; выбор сохраняется после перезапуска браузера.
- Каталог **53 голосовых пакетов для 49 языков**. Устанавливается только выбранный голос; до загрузки видны размер, источник и условия.
- Проверка голоса, скорость и громкость речи, ручной или автоматический выбор мужского/женского голоса, если подходящие голоса доступны.
- Плавное приглушение оригинала во время речи и восстановление при паузе или отключении.
- Возможность скрыть текст субтитров, оставив озвучку. Пауза, перемотка и смена видео отменяют устаревшие реплики.
- Экономия памяти включена по умолчанию: одна акустическая модель, кэш речи до 8 МиБ и освобождение движка после 60 секунд простоя.

### Установка

Комплект для Chrome Web Store подготовлен; опубликованной ссылки установки из магазина в этом репозитории пока нет.

1. Скачайте репозиторий через **Code → Download ZIP** или клонируйте:

   ```sh
   git clone https://github.com/asadbekasadbek/Bridge.git
   cd Bridge
   ```

2. Откройте `chrome://extensions` и включите **«Режим разработчика»**.
3. Нажмите **«Загрузить распакованное расширение»** и выберите папку **`extension`** с файлом `manifest.json`.
4. В настройках Bridge выберите язык интерфейса и результата, установите один голос или выберите подходящий локальный голос системы.
5. Откройте поддерживаемое видео с субтитрами и включите Bridge в плеере.

Когда в [GitHub Releases](https://github.com/asadbekasadbek/Bridge/releases) появится ZIP, можно распаковать его в постоянную папку и установить так же. Нужен `bridge-0.18.2-lite.zip`, а не большой архив материалов для издателя.

Для обновления замените файлы в той же папке, нажмите **↻** у Bridge в `chrome://extensions` и обновите вкладки видео. Сохранение прежней установки сохраняет настройки и голосовые пакеты. Пользователям не нужны Node.js, сервер и API-ключ.

### Плееры и перевод

Поддерживаемые интеграции: **YouTube / Shorts, TED, Vimeo, Udemy, Coursera, VK Видео, RUTUBE и Twitch**. Нужна читаемая дорожка субтитров или поддерживаемый слой плеера. Изменения сайтов, ограничения входа, DRM и отсутствие субтитров могут ограничить работу.

На YouTube перевод предоставляет сам сайт. В других поддерживаемых плеерах используется готовая дорожка на нужном языке или локальный Translator Chrome, если доступен. Для локального Translator нужны Chrome 138+, поддерживаемые браузер/устройство и языковая пара; первая загрузка языковых данных требует интернета и может потребовать действия пользователя.

Доступность голоса и перевода проверяется отдельно. Наличие языка в каталоге голосов не гарантирует его поддержку переводчиком. Например, **узбекского голоса в закреплённом каталоге нет**; можно выбрать подходящий локальный голос системы, если он установлен. Отсутствующий перевод не подменяется исходным текстом.

Bridge читает текстовые субтитры: он не распознаёт речь любого видео и не копирует голос актёра. Автоматический выбор мужского/женского голоса использует приблизительную локальную оценку высоты тона; музыка и шум могут мешать. После установки пакета проба голоса работает без сети, но видеосайту и субтитрам обычно нужен интернет.

### Конфиденциальность и лицензии

Текст субтитров и синтезированный звук не передаются разработчику или облачному сервису речи. Настройки хранятся в `chrome.storage.local`, голоса — в IndexedDB расширения, кэши фраз и аудио — в ограниченной памяти. Пакеты скачиваются с закреплённых ревизий и проверяются по размеру/SHA-256. Хост файлов получает обычные сведения соединения, включая IP-адрес; видеосайты выполняют собственные сетевые запросы.

Исполняемые JS/WASM включены в пакет. Разрешения: `storage`, `tts`, `offscreen`; content scripts работают на поддерживаемых видеосайтах. Разрешение на микрофон не требуется. Языковые файлы переводчика хранит Chrome; API не позволяет Bridge удалять их.

Условия голосов различаются: проверяйте [карточку модели](extension/voices/catalogue) до установки. Лицензии, уведомления и соответствующие исходники компонентов находятся в [extension/licenses](extension/licenses). eSpeak NG имеет GPL-3.0-or-later; весь пакет нельзя объявлять MIT. Издателю подготовлен [текст политики конфиденциальности](distribution/chrome-web-store/privacy-policy.md) для размещения по публичной ссылке.

### Счётчик скачиваний

Значок в начале README автоматически показывает **скачивания файлов из публичных GitHub Releases** через [Shields.io](https://shields.io/badges/git-hub-downloads-all-assets-all-releases). Это число скачиваний файлов релизов, а не уникальных людей, клонов репозитория, **Code → Download ZIP** или установок из Chrome Web Store. [Как GitHub считает скачивания релизов](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases).

До первого опубликованного релиза значок показывает **«no releases found»**. Чтобы счётчик заработал, создайте релиз на странице Releases репозитория и прикрепите собранный ZIP расширения. Статистика установок/пользователей Chrome отдельная и появляется у опубликованной карточки магазина.

### Сборка и публикация

Для разработки нужен Node.js 18+:

```sh
npm run check
npm test
npm run package
npm run store:kit
```

Результат: `dist/bridge-0.18.2-lite.zip` и `dist/bridge-chrome-web-store-0.18.2.zip`. Каталог `dist` исключён из Git. Для распространения через Releases и подсчёта скачиваний файлы сборки загружаются в релиз отдельно.

Комплект магазина содержит английские и русские названия, короткие и полные описания, пять скриншотов, иконки, баннеры, инструкцию проверяющему и шаблон политики. Распакуйте комплект и откройте `START_HERE.html`. В кабинете магазина по очереди выберите **English** и **Russian**, вставляя соответствующий текст. В пакете есть `_locales/en` и `_locales/ru`, поэтому карточке доступны оба языка. [Подробная инструкция](distribution/chrome-web-store/publishing-guide-ru.md).

Издатель заполняет свои учётные данные/контакты, размещает политику по публичной HTTPS-ссылке, загружает ZIP расширения и отправляет его на проверку. Одобрение, публикация и место в поиске не гарантируются.

Правки зависимостей воспроизводятся: `npm install` запускает `postinstall`, а `npm run vendor:prepare` восстанавливает закреплённые патчи вручную, в том числе после замены папки vendor. Проверяются исходная ревизия и контрольные суммы. При установке с отключёнными scripts выполните `npm run vendor:prepare` отдельно.

Браузерные проверки используют Playwright/Chromium с временными профилями. Основные сценарии: `scripts/caption-notice-browser.mjs`, `scripts/ui-language-browser.mjs`, `scripts/youtube-browser.mjs`, `scripts/shorts-browser.mjs`, `scripts/platforms-browser.mjs`. Тестовые плееры с подменённым синтезом проверяют поведение, но не сервер перевода каждого сайта. Проверки настоящих моделей/офлайн-работы описаны в отчётах; качество и скорость всех 53 голосов отдельно не измерялись.

Технические отчёты: [исправление подсказок](docs/caption-notice-2026-10-26.md), [язык интерфейса](docs/ui-language-2026-10-26.md), [приглушение оригинала](docs/ducking-2026-10-26.md), [оптимизация движка](docs/optimization-2026-10-26.md).
