import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSpeechFixture } from "./speech-fixture.mjs";

const require = createRequire(import.meta.url);
const paths = process.env.BRIDGE_PLAYWRIGHT_ROOT ? [process.env.BRIDGE_PLAYWRIGHT_ROOT] : [process.cwd()];
const { chromium } = require(require.resolve("playwright", { paths }));
const profile = await mkdtemp(join(tmpdir(), "bridge-youtube-test-"));
const fixtureRoot = await mkdtemp(join(tmpdir(), "bridge-youtube-speech-"));
const extensionPath = await createSpeechFixture(fileURLToPath(new URL("../extension/", import.meta.url)), join(fixtureRoot, "extension"));
const output = fileURLToPath(new URL("../test-results/", import.meta.url));
await mkdir(output, { recursive: true });
const fixture = await readFile(new URL("../tests/fixtures/youtube.html", import.meta.url), "utf8");
const wav = Buffer.alloc(44 + 16000 * 30);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
const audioUrl = `data:audio/wav;base64,${wav.toString("base64")}`;

const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true, viewport: { width: 1280, height: 850 },
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, "--no-first-run", "--mute-audio"]
});
try {
  const errors = [];
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  await worker.evaluate(() => {
    globalThis.bridgeRequests = [];
    globalThis.bridgeStops = 0;
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name === "bridge:youtube") globalThis.bridgePageTabId = port.sender.tab.id;
    });
    chrome.tts.getVoices = (callback) => callback([
      { voiceName: "Тестовый локальный голос", lang: "ru-RU", gender: "female", remote: false },
      { voiceName: "Microsoft Pavel Desktop", lang: "ru-RU", remote: false },
      { voiceName: "German test voice", lang: "de-DE", remote: false }
    ]);
    chrome.tts.speak = (text, options, callback) => {
      const plainText = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      globalThis.bridgeRequests.push({ text: plainText, utterance: text, voiceName: options.voiceName, volume: options.volume, rate: options.rate });
      globalThis.bridgeCurrentEvent = options.onEvent;
      callback(); options.onEvent({ type: "start" });
    };
    chrome.tts.stop = () => { globalThis.bridgeStops += 1; };
  });
  await context.route("https://www.youtube.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: fixture }));
  const youtube = await context.newPage();
  await youtube.goto("https://www.youtube.com/watch?v=bridge_test");
  await youtube.locator("#bridge-youtube-control").waitFor();
  await youtube.evaluate(async (source) => {
    const video = document.querySelector("video"); video.src = source; await video.play();
  }, audioUrl);
  const button = youtube.locator(".bridge-youtube-toggle");
  assert.equal(await button.getAttribute("aria-pressed"), "false");
  const notice = youtube.locator("#bridge-youtube-status");
  await button.hover();
  await button.focus();
  assert.equal(await notice.isVisible(), false, "Обычный статус не появляется при наведении или фокусе");
  assert.equal(await notice.evaluate((element) => element.getClientRects().length), 0, "Скрытый статус не занимает места на видео");
  assert.equal(await button.getAttribute("title"), null, "Нет дублирующей системной подсказки со статусом");
  await button.click();
  await youtube.locator('.bridge-youtube-toggle[aria-pressed="true"]').waitFor();
  await youtube.waitForFunction(() => document.documentElement.dataset.captionLanguage === "ru");
  await youtube.waitForFunction(() => document.querySelector("#bridge-youtube-status").textContent.includes("Ждём"));
  assert.equal(await youtube.locator(".ytp-subtitles-button").getAttribute("aria-pressed"), "true");
  const captionOpacity = () => youtube.locator(".ytp-caption-window-container").evaluate((element) => getComputedStyle(element).opacity);
  assert.equal(await captionOpacity(), "0", "Озвучка по умолчанию скрывает текст на картинке");
  assert.equal(await youtube.locator("html").getAttribute("data-caption-clicks"), "1");
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests)).length, 0);

  const refresh = await youtube.evaluate(async () => {
    const host = document.querySelector("#bridge-youtube-control"), button = host.querySelector("button");
    const label = button.firstChild;
    let replacements = 0;
    const observer = new MutationObserver((records) => { replacements += records.filter((record) => record.type === "childList").length; });
    for (const control of [button, host.querySelector(".bridge-language-settings")]) observer.observe(control, { subtree: true, childList: true });
    button.focus();
    for (let i = 0; i < 5; i++) document.dispatchEvent(new Event("yt-navigate-finish"));
    await new Promise((resolve) => setTimeout(resolve, 350));
    observer.disconnect();
    return { replacements, sameLabel: button.firstChild === label, focused: document.activeElement === button };
  });
  assert.deepEqual(refresh, { replacements: 0, sameLabel: true, focused: true }, "Повторное обнаружение того же плеера сохраняет кнопки и фокус управления");

  const caption = async (text, target = youtube) => target.evaluate((value) => {
    const layer = document.querySelector(".ytp-caption-window-container");
    layer.replaceChildren();
    if (value) { const span = document.createElement("span"); span.className = "ytp-caption-segment"; span.textContent = value; layer.append(span); }
  }, text);
  // Poll only the isolated test engine; the extension itself does not poll.
  const waitCount = async (expected) => {
    for (let attempt = 0; attempt < 80; attempt++) {
      if ((await worker.evaluate(() => globalThis.bridgeRequests)).length === expected) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal((await worker.evaluate(() => globalThis.bridgeRequests)).length, expected);
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

  await caption("Ты сможешь прийти к нам"); await settle();
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests)).length, 0, "Пять слов без окончания фразы ещё не запускают речь");
  await caption("Ты сможешь прийти к нам завтра?"); await waitCount(1);
  await button.hover();
  assert.equal(await notice.isVisible(), false, "При нормальной озвучке сообщение не перекрывает видео");
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests))[0].text, "Ты сможешь прийти к нам завтра?", "Продолжение читается одним вопросом с сохранённой интонацией");
  await caption("Ты сможешь прийти к нам завтра?"); await settle();
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests)).length, 1);
  await caption("Ты сможешь прийти к нам завтра? это проверка."); await settle();
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests)).length, 1);
  assert.ok((await worker.evaluate(() => globalThis.bridgePreparations || [])).some((entry) => entry.text === "это проверка."), "Следующая фраза подготавливается до окончания текущей и не воспроизводится раньше времени");
  await worker.evaluate(() => globalThis.bridgeCurrentEvent({ type: "end" })); await waitCount(2);
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests))[1].text, "это проверка.");
  const stopsBeforeVisibility = await worker.evaluate(() => globalThis.bridgeStops);
  await youtube.locator(".bridge-language-settings").click();
  const subtitleToggle = youtube.locator("#bridge-show-subtitles");
  await subtitleToggle.check();
  await youtube.waitForFunction(() => !document.querySelector("#bridge-show-subtitles").disabled);
  assert.equal(await captionOpacity(), "1", "Текст можно показать во время речи");
  await subtitleToggle.uncheck();
  await youtube.waitForFunction(() => !document.querySelector("#bridge-show-subtitles").disabled);
  assert.equal(await captionOpacity(), "0", "Текст можно снова скрыть");
  assert.equal(await button.getAttribute("aria-pressed"), "true");
  assert.equal(await worker.evaluate(() => globalThis.bridgeStops), stopsBeforeVisibility, "Показ текста не останавливает текущую речь");
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests)).length, 2, "Смена отображения не повторяет реплику");
  await youtube.locator(".bridge-language-settings").click();
  await youtube.screenshot({ path: join(output, "youtube-enabled.png"), fullPage: true });

  await button.click();
  await youtube.locator('.bridge-youtube-toggle[aria-pressed="false"]').waitFor();
  assert.equal(await notice.isVisible(), false, "Ручное выключение не считается ошибкой");
  assert.equal(await captionOpacity(), "1", "После отключения Bridge возвращается обычное отображение YouTube");
  const stopsBefore = await worker.evaluate(() => globalThis.bridgeStops);
  await caption("После отключения голос молчит"); await settle();
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests)).length, 2);
  assert.ok(await worker.evaluate(() => globalThis.bridgeStops) >= stopsBefore);

  await button.click(); await waitCount(3);
  assert.equal(await youtube.locator("html").getAttribute("data-caption-clicks"), "1", "Повторное включение Bridge не выключает уже активные субтитры");
  await youtube.evaluate(() => document.querySelector("video").pause());
  await caption("Пауза не должна озвучиваться"); await settle();
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests)).length, 3);
  await youtube.evaluate(() => document.querySelector("video").play()); await waitCount(4);
  await youtube.evaluate(() => {
    document.dispatchEvent(new Event("yt-navigate-start"));
    history.pushState({}, "", "/watch?v=bridge_next");
    document.dispatchEvent(new Event("yt-navigate-finish"));
  });
  await youtube.locator('.bridge-youtube-toggle[aria-pressed="false"]').waitFor();
  await caption("Новое видео не включается само"); await settle();
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests)).length, 4);
  assert.equal(await youtube.locator("#bridge-youtube-control").count(), 1);

  await button.click(); await waitCount(5);
  const popup = await context.newPage();
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.locator("#settings-fields:not([disabled])").waitFor();
  await options.locator("#show-subtitles").check();
  await youtube.waitForFunction(() => getComputedStyle(document.querySelector(".ytp-caption-window-container")).opacity === "1");
  assert.equal(await button.getAttribute("aria-pressed"), "true", "Общие настройки показа не выключают озвучку");
  await options.locator("#show-subtitles").uncheck();
  await youtube.waitForFunction(() => getComputedStyle(document.querySelector(".ytp-caption-window-container")).opacity === "0");
  await options.close();
  const youtubeTabId = await worker.evaluate(() => globalThis.bridgePageTabId);
  assert.ok(Number.isInteger(youtubeTabId));
  await worker.evaluate((id) => new Promise((resolve) => chrome.tabs.update(id, { active: true }, resolve)), youtubeTabId);
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator('#toggle-youtube[aria-pressed="true"]').waitFor();
  await popup.locator("#toggle-youtube").click();
  await youtube.locator('.bridge-youtube-toggle[aria-pressed="false"]').waitFor();
  await popup.locator('#toggle-youtube[aria-pressed="false"]').waitFor();
  await popup.locator("#toggle-youtube").click(); await waitCount(6);
  await youtube.locator('.bridge-youtube-toggle[aria-pressed="true"]').waitFor();
  await popup.getByText("Озвучиваем: русский.").waitFor();
  await popup.setViewportSize({ width: 360, height: 780 });
  await popup.screenshot({ path: join(output, "youtube-popup.png"), fullPage: true });

  await youtube.evaluate(() => { document.querySelector(".ytp-caption-window-container").style.display = "none"; });
  await popup.getByText("Субтитры сейчас не отображаются. Перезапустите озвучку кнопкой Bridge.").waitFor();
  await caption("Скрытые субтитры не должны читаться"); await settle();
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests)).length, 6);
  await youtube.evaluate(() => { document.querySelector(".ytp-caption-window-container").style.display = ""; });
  await waitCount(7);

  await caption("i , *** [Музыка]"); await settle();
  await worker.evaluate(() => globalThis.bridgeCurrentEvent({ type: "end" }));
  await new Promise((resolve) => setTimeout(resolve, 1800));
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests)).length, 7, "Служебные символы не передаются голосу");
  assert.equal(await button.getAttribute("aria-pressed"), "true", "Пропуск символов не выключает сеанс");
  await caption("i **Привет**, мир! [Музыка]"); await waitCount(8);
  const naturalUtterance = (await worker.evaluate(() => globalThis.bridgeRequests))[7];
  assert.equal(naturalUtterance.text, "Привет, мир!");
  assert.ok(!naturalUtterance.utterance.includes("<break"));
  assert.ok(!naturalUtterance.utterance.includes("*"));

  await worker.evaluate(() => globalThis.bridgeCurrentEvent({ type: "error", errorMessage: "Тест: голос перестал работать" }));
  await youtube.locator('.bridge-youtube-toggle[aria-pressed="false"]').waitFor();
  assert.ok((await youtube.locator("#bridge-youtube-status").textContent()).includes("голос перестал работать"));
  assert.equal(await notice.isVisible(), true, "Ошибка голоса остаётся видимой");
  await youtube.evaluate(() => document.dispatchEvent(new Event("yt-navigate-finish")));
  await settle();
  assert.equal(await notice.isVisible(), true, "Повторное обнаружение плеера не стирает ошибку");
  await youtube.locator(".bridge-language-settings").click();
  assert.equal(await notice.isVisible(), false, "Настройки не перекрываются сообщением");
  assert.ok((await youtube.locator(".bridge-panel-status").textContent()).includes("голос перестал работать"));
  await youtube.locator(".bridge-language-settings").click();
  // A different video must configure its language again, without persisting
  // the detected source or voicing an untranslated caption during setup.
  const missing = await context.newPage();
  await missing.goto("https://www.youtube.com/watch?v=missing_translation");
  await missing.locator("#bridge-youtube-control").waitFor();
  await missing.evaluate(async (source) => {
    document.documentElement.dataset.noTranslation = "true";
    const video = document.querySelector("video"); video.src = source; await video.play();
  }, audioUrl);
  await caption("English must not be spoken", missing);
  await missing.locator(".bridge-youtube-toggle").click();
  await missing.locator("#bridge-youtube-status").filter({ hasText: "Не найден пункт «Перевести»" }).waitFor();
  assert.equal(await missing.locator(".bridge-youtube-toggle").getAttribute("aria-pressed"), "true", "Временная ошибка меню не выключает кнопку");
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests)).length, 8);
  const stored = await worker.evaluate(() => new Promise((resolve) => chrome.storage.local.get("bridgeSettings", resolve)));
  assert.equal(stored.bridgeSettings?.language || "ru-RU", "ru-RU");
  // A supplied target-language track works even without Auto-translate.
  await missing.evaluate(() => { document.documentElement.dataset.directRussian = "true"; });
  await missing.waitForFunction(() => document.documentElement.dataset.captionLanguage === "ru");
  await settle();
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests)).length, 8, "Старый английский текст не попадает в русский голос");
  await caption("Готовая русская дорожка работает.", missing); await waitCount(9);
  assert.equal(await missing.locator("#bridge-youtube-status").isVisible(), false, "После восстановления перевода блок ошибки исчезает");
  await missing.locator(".bridge-youtube-toggle").click();
  await missing.close();
  await worker.evaluate(() => new Promise((resolve) => chrome.storage.local.set({ bridgeSettings: { language: "de-DE" } }, resolve)));
  const german = await context.newPage();
  await german.goto("https://www.youtube.com/watch?v=german_translation");
  await german.locator("#bridge-youtube-control").waitFor();
  await german.evaluate(async (source) => { const video = document.querySelector("video"); video.src = source; await video.play(); }, audioUrl);
  await german.locator(".bridge-youtube-toggle").click();
  await german.waitForFunction(() => document.documentElement.dataset.captionLanguage === "de");
  await caption("Guten Tag, dies ist ein Test.", german); await waitCount(10);
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests))[9].voiceName, "German test voice");
  await german.locator(".ytp-settings-button").click();
  await german.getByText("Субтитры", { exact: true }).click();
  await german.locator(".ytp-settings-menu .ytp-menuitem-label").filter({ hasText: /^English$/ }).click();
  await german.locator('.bridge-youtube-toggle[aria-pressed="false"]').waitFor();
  await caption("English must never overwrite the saved destination", german); await settle();
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests)).length, 10);
  const afterSourceChange = await worker.evaluate(() => new Promise((resolve) => chrome.storage.local.get("bridgeSettings", resolve)));
  assert.equal(afterSourceChange.bridgeSettings.language, "de-DE", "Исходный язык не заменяет выбранный немецкий");
  await german.close();
  await worker.evaluate(() => new Promise((resolve) => chrome.storage.local.set({ bridgeSettings: { language: "ru-RU" } }, resolve)));

  const russian = await context.newPage();
  await russian.goto("https://www.youtube.com/watch?v=russian_source");
  await russian.locator(".bridge-language-settings").waitFor();
  await russian.locator(".bridge-language-settings").click();
  await russian.locator('#bridge-target-language:not([disabled])').waitFor();
  assert.equal(await russian.locator("#bridge-source-language").inputValue(), "auto");
  assert.ok((await russian.locator('#bridge-source-language option:checked').textContent()).includes("Русский"));
  assert.ok(await russian.locator("#bridge-target-language option").count() >= 150);
  assert.equal(await russian.locator("#bridge-source-language option").count(), await russian.locator("#bridge-target-language option").count() + 1);
  assert.equal(await russian.locator("#bridge-target-language").inputValue(), "ru-RU");
  assert.ok((await russian.locator(".bridge-mode-hint").first().textContent()).includes("без перевода"));
  await russian.evaluate(async (source) => {
    document.documentElement.dataset.noTranslation = "true";
    const video = document.querySelector("video"); video.src = source; await video.play();
  }, audioUrl);
  await russian.locator(".bridge-youtube-toggle").click();
  await russian.locator(".bridge-panel-status").filter({ hasText: /Озвучка без перевода|Язык выбран/ }).waitFor();
  assert.equal(await russian.locator("html").getAttribute("data-translation-menu-opens"), null);
  await caption("Русское видео озвучивается русским голосом.", russian); await waitCount(11);
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests))[10].voiceName, "Bridge — Денис (локальный)");
  await russian.screenshot({ path: join(output, "youtube-language-panel.png"), fullPage: true });
  // Change the target in the player; the active reader restarts on that target.
  await russian.evaluate(() => { delete document.documentElement.dataset.noTranslation; });
  await russian.locator("#bridge-target-language").selectOption("de-DE");
  await russian.waitForFunction(() => document.documentElement.dataset.captionLanguage === "de");
  await caption("Der gewählte deutsche Text wird gesprochen.", russian); await waitCount(12);
  const fromPlayer = await worker.evaluate(() => new Promise((resolve) => chrome.storage.local.get("bridgeSettings", resolve)));
  assert.equal(fromPlayer.bridgeSettings.language, "de-DE");
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests))[11].voiceName, "German test voice");
  assert.equal(await russian.locator("#bridge-source-language").inputValue(), "auto", "Выбор результата не подменяет автоопределение");
  assert.ok((await russian.locator('#bridge-source-language option:checked').textContent()).includes("Русский"));
  await russian.reload();
  await russian.locator(".bridge-language-settings").click();
  await russian.locator('#bridge-target-language:not([disabled])').waitFor();
  assert.equal(await russian.locator("#bridge-target-language").inputValue(), "de-DE", "Выбор в плеере сохраняется после перезагрузки страницы");
  await russian.close();
  await worker.evaluate(() => new Promise((resolve) => chrome.storage.local.set({ bridgeSettings: { language: "ru-RU" } }, resolve)));
  const legacy = await context.newPage();
  await legacy.goto("https://www.youtube.com/watch?v=legacy_translation");
  await legacy.locator(".bridge-youtube-toggle").click();
  await legacy.waitForFunction(() => document.documentElement.dataset.captionLanguage === "ru");
  await legacy.close();
  const manual = await context.newPage();
  await manual.goto("https://www.youtube.com/watch?v=manual_source");
  await manual.locator(".bridge-language-settings").click();
  await manual.locator('#bridge-source-language:not([disabled])').waitFor();
  await manual.evaluate(async (source) => {
    document.documentElement.dataset.directRussian = "true";
    const video = document.querySelector("video"); video.src = source; await video.play();
  }, audioUrl);
  await manual.locator("#bridge-source-language").selectOption("ru-RU");
  await manual.locator("#bridge-source-language:not([disabled])").waitFor();
  await manual.locator(".bridge-youtube-toggle").click();
  await manual.waitForFunction(() => document.documentElement.dataset.captionLanguage === "ru");
  assert.equal(await manual.locator("html").getAttribute("data-translation-menu-opens"), null, "Выбрана ручная русская дорожка вместо английской автоматической");
  await caption("Ручной исходный язык работает.", manual); await waitCount(13);
  await manual.reload();
  await manual.locator(".bridge-language-settings").click();
  await manual.locator('#bridge-source-language:not([disabled])').waitFor();
  assert.equal(await manual.locator("#bridge-source-language").inputValue(), "ru-RU");
  assert.equal(await manual.locator("#bridge-target-language").inputValue(), "ru-RU");
  await manual.locator("#bridge-source-language").selectOption("fr-FR");
  await manual.locator("#bridge-source-language:not([disabled])").waitFor();
  await manual.locator(".bridge-youtube-toggle").click();
  await manual.locator(".bridge-panel-status").filter({ hasText: "нет исходной дорожки" }).waitFor();
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests)).length, 13, "Недоступный ручной источник не подменяется английским");
  await manual.locator("#bridge-source-language").selectOption("auto");
  await manual.waitForFunction(() => document.documentElement.dataset.captionLanguage === "ru");
  const panelBox = await manual.locator("#bridge-language-panel").boundingBox();
  const playerBox = await manual.locator("#movie_player").boundingBox();
  assert.ok(panelBox.y >= playerBox.y, "Длинная панель настроек помещается в плеер и не обрезается сверху");
  await manual.screenshot({ path: join(output, "youtube-source-auto-manual.png"), fullPage: true });
  await manual.locator("#bridge-language-panel").screenshot({ path: join(output, "youtube-language-panel-closeup.png") });

  // The real <video> volume and Chrome storage are exercised here; only speech
  // generation is mocked. Changing the mix must not terminate the session.
  await manual.evaluate(async (source) => { const video = document.querySelector("video"); video.src = source; video.volume = 0.8; await video.play(); }, audioUrl);
  await manual.locator("#bridge-voice-gender").selectOption("male");
  await manual.waitForFunction(() => document.querySelector("#bridge-youtube-status").textContent.includes("Ждём"));
  await caption("Проверка мужского голоса.", manual); await waitCount(14);
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests))[13].voiceName, "Bridge — Денис (локальный)");
  await manual.waitForFunction(() => Math.abs(document.querySelector("video").volume - 0.32) < 0.001);
  await manual.locator("#bridge-ducking-amount").fill("47");
  await manual.waitForFunction(() => Math.abs(document.querySelector("video").volume - 0.424) < 0.001);
  await manual.locator("#bridge-voice-volume").fill("65");
  await manual.getByText(/^Сохранено\. Во время речи оригинал тише на 47%/).waitFor();
  assert.equal(await manual.locator(".bridge-youtube-toggle").getAttribute("aria-pressed"), "true");
  await caption("Следующая реплика с новой громкостью.", manual); await settle();
  await worker.evaluate(() => globalThis.bridgeCurrentEvent({ type: "end" })); await waitCount(15);
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests))[14].volume, 0.65);
  await manual.evaluate(() => { document.querySelector("video").volume = 0.7; });
  await settle();
  assert.equal(await manual.locator("video").evaluate((video) => video.volume), 0.7);
  await caption("", manual); await settle();
  await manual.locator("#bridge-voice-gender").selectOption("female");
  await manual.waitForFunction(() => document.querySelector("#bridge-youtube-status").textContent.includes("Ждём"));
  await caption("Проверка женского голоса.", manual); await waitCount(16);
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests))[15].voiceName, "Тестовый локальный голос");
  await manual.waitForFunction(() => Math.abs(document.querySelector("video").volume - 0.371) < 0.001);
  await manual.locator("#bridge-ducking-enabled").uncheck();
  await manual.waitForFunction(() => document.querySelector("video").volume === 0.7);
  assert.equal(await manual.locator(".bridge-youtube-toggle").getAttribute("aria-pressed"), "true");
  await manual.locator("#bridge-ducking-enabled").check();
  await manual.waitForFunction(() => Math.abs(document.querySelector("video").volume - 0.371) < 0.001);
  await manual.locator("#bridge-language-panel").screenshot({ path: join(output, "youtube-audio-mixing.png") });
  await caption("", manual);
  await manual.evaluate(() => { document.querySelector("video").playbackRate = 1.5; });
  await settle();
  await caption("Эта реплика следует за скоростью видео.", manual); await waitCount(17);
  assert.equal((await worker.evaluate(() => globalThis.bridgeRequests))[16].rate, 1.5);
  assert.equal(await manual.locator(".bridge-youtube-toggle").getAttribute("aria-pressed"), "true");
  await manual.evaluate(() => document.querySelector("video").pause());
  await manual.waitForFunction(() => document.querySelector("video").volume === 0.7);
  await manual.reload();
  await manual.locator(".bridge-language-settings").click();
  await manual.locator("#bridge-source-language:not([disabled])").waitFor();
  assert.equal(await manual.locator("#bridge-voice-gender").inputValue(), "female");
  assert.equal(await manual.locator("#bridge-voice-volume").inputValue(), "65");
  assert.equal(await manual.locator("#bridge-ducking-amount").inputValue(), "47");
  console.log("Смешивание, восстановление на паузе, локальный мужской/женский голос, сохранение и следование скорости видео 1,5× — OK.");
  await manual.close();
  assert.deepEqual(errors, []);
  console.log("YouTube browser: меню Перевести и Автоперевод, English → Русский, Русский → Русский, выбор языка, восстановление без выключения кнопки, очередь, пауза, SPA, ошибки — OK.");
  console.log("Источник субтитров — локальный тестовый плеер; движок речи подменён, реальный звук не воспроизводился.");

  if (process.env.BRIDGE_LIVE_YOUTUBE === "1") {
    await context.unroute("https://www.youtube.com/**");
    const live = await context.newPage();
    try {
      const liveVideoId = process.env.BRIDGE_LIVE_VIDEO || "eTGkvddOtFc";
      await live.goto(`https://www.youtube.com/watch?v=${encodeURIComponent(liveVideoId)}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await live.locator("#bridge-youtube-control").waitFor({ timeout: 20000 });
      await live.locator("video").first().evaluate((video) => { video.muted = true; video.pause(); });
      await live.screenshot({ path: join(output, "youtube-live.png"), fullPage: false });
      console.log("Кнопка также появилась на настоящей странице YouTube.");
      const beforeLive = (await worker.evaluate(() => globalThis.bridgeRequests)).length;
      await live.locator("video").first().evaluate(async (video) => { video.muted = true; await video.play(); });
      await live.locator("#movie_player").hover();
      await live.locator(".bridge-youtube-toggle").click();
      await live.locator('.ytp-subtitles-button[aria-pressed="true"]').waitFor({ timeout: 8000 });
      console.log("CC на настоящем YouTube включён автоматически кнопкой Bridge.");
      let readLive = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        if ((await worker.evaluate(() => globalThis.bridgeRequests)).length > beforeLive) { readLive = true; break; }
        if (await live.locator(".bridge-youtube-toggle").getAttribute("aria-pressed") === "false") break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      console.log(readLive ? "Настоящие субтитры YouTube переданы тестовому локальному движку речи." : "Чтение настоящих субтитров не подтверждено: сайт не предоставил текст за время проверки.");
      console.log(`Статус настоящего плеера: ${await live.locator("#bridge-youtube-status").textContent()}`);
      console.log("Реальная выбранная дорожка:", await live.evaluate(() => {
        const p = document.querySelector("#movie_player");
        const track = p.getOption?.("captions", "track");
        return track ? { languageCode: track.languageCode, translationLanguage: track.translationLanguage?.languageCode } : null;
      }));
      await live.locator("#movie_player").hover();
      await live.screenshot({ path: join(output, "youtube-live-reading.png"), fullPage: false });
    } catch (error) {
      console.log(`Проверка настоящего YouTube недоступна: ${error.message.split("\n")[0]}`);
    }
  }
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
  await rm(fixtureRoot, { recursive: true, force: true });
}
