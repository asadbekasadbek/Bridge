import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSpeechFixture } from "./speech-fixture.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", { paths: [process.env.BRIDGE_PLAYWRIGHT_ROOT || process.cwd()] }));
const profile = await mkdtemp(join(tmpdir(), "bridge-shorts-")), root = await mkdtemp(join(tmpdir(), "bridge-shorts-extension-"));
const extensionPath = await createSpeechFixture(fileURLToPath(new URL("../extension/", import.meta.url)), join(root, "extension"));
const output = fileURLToPath(new URL("../test-results/", import.meta.url)); await mkdir(output, { recursive: true });
const shortsFixture = await readFile(new URL("../tests/fixtures/shorts.html", import.meta.url), "utf8");
const watchFixture = await readFile(new URL("../tests/fixtures/youtube.html", import.meta.url), "utf8");
const wav = Buffer.alloc(44 + 16000 * 90);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
const audio = `data:audio/wav;base64,${wav.toString("base64")}`;
const context = await chromium.launchPersistentContext(profile, { channel: "chromium", headless: true, viewport: { width: 1280, height: 850 }, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, "--no-first-run", "--mute-audio"] });
try {
  const errors = [], requests = [];
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  await worker.evaluate(() => {
    globalThis.bridgeShortSpeech = [];
    chrome.tts.getVoices = (callback) => callback([]);
    chrome.tts.stop = () => {};
    chrome.tts.speak = (text, options, callback) => { globalThis.bridgeShortSpeech.push(text); callback(); options.onEvent({ type: "start" }); globalThis.bridgeCurrentEvent = options.onEvent; };
  });
  await context.route("https://www.youtube.com/**", (route) => {
    requests.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: new URL(route.request().url()).pathname.startsWith("/shorts/") ? shortsFixture : watchFixture });
  });
  // First visit the homepage, then navigate without a reload. The sender can
  // still report the original document URL; controls must initialize anyway.
  const home = await context.newPage(); await home.goto("https://www.youtube.com/");
  await home.evaluate(async (url) => { const v=document.querySelector('#movie_player video');v.src=url;await v.play(); }, audio);
  await home.evaluate(() => { history.pushState({}, "", "/watch?v=from_home"); document.dispatchEvent(new Event("yt-navigate-finish")); });
  await home.locator('.bridge-youtube-toggle:not([disabled])').waitFor();
  await home.locator('.bridge-youtube-toggle').click();
  await home.waitForFunction(() => document.documentElement.dataset.captionLanguage === "ru");
  assert.equal(await home.locator('.bridge-youtube-toggle').getAttribute('aria-pressed'), 'true');
  await home.close();
  const page = await context.newPage(); await page.goto("https://www.youtube.com/shorts/shorts_direct");
  await page.locator('#active-short > .bridge-shorts .bridge-youtube-toggle:not([disabled])').waitFor();
  assert.equal(await page.locator('#shorts-player .bridge-youtube-control').count(), 0, "Управление вынесено из нижнего слоя видеоплеера");
  assert.equal(await page.locator('.bridge-youtube-toggle').textContent(), "", "В Shorts кнопка содержит только иконку");
  assert.equal(await page.locator('.bridge-youtube-toggle svg').getAttribute('data-bridge-icon'), "play");
  assert.equal(await page.locator('.bridge-language-settings svg').getAttribute('data-bridge-icon'), "settings");
  assert.equal(await page.locator('.bridge-youtube-toggle').getAttribute('aria-label'), "Включить озвучку");
  const compact = await page.locator('.bridge-shorts').boundingBox(), player = await page.locator('#shorts-player').boundingBox();
  assert.ok(compact.width <= 80 && compact.height === 36, "Две компактные кнопки вместо текста");
  assert.ok(player.y + player.height - compact.y - compact.height <= 18, "Управление опущено к нижнему краю");
  async function assertClickable(target = page) {
    for (const selector of ['.bridge-youtube-toggle', '.bridge-language-settings']) {
      assert.equal(await target.locator(selector).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      }), true, `${selector}: нажатие получает Bridge, а не подпись YouTube`);
    }
  }
  await assertClickable();
  await page.locator('.bridge-language-settings').click();
  assert.equal(await page.locator('#bridge-language-panel').isVisible(), true);
  await page.locator('.bridge-language-settings').click();
  assert.equal(await page.locator('#bridge-language-panel').isVisible(), false);
  await page.locator('.bridge-youtube-toggle').hover();
  assert.equal(await page.locator('#bridge-youtube-status').isVisible(), false, "Статус не перекрывает Shorts даже при наведении");
  assert.equal(await page.locator('.bridge-youtube-toggle').getAttribute('title'), null, "Нет всплывающего текстового статуса");
  assert.equal(await page.locator('#movie_player .bridge-youtube-control').count(), 0, "Скрытый обычный плеер не получает кнопку Shorts");
  assert.equal(await page.locator('#all-in-one-downloader-daniel').isVisible(), false, "Сторонний загрузчик скрыт по умолчанию");
  await page.evaluate(async (url) => { const v=document.querySelector('#shorts-player video');v.src=url;await v.play(); }, audio);
  await page.locator('.bridge-youtube-toggle').click();
  await page.waitForFunction(() => document.documentElement.dataset.captionLanguage === "ru");
  await page.waitForFunction(() => document.querySelector('#bridge-youtube-status').textContent.includes('Ждём'));
  assert.equal(await page.locator('yt-sheet-view-model').isVisible(), false, "Меню YouTube закрывается после проверки дорожки");
  await page.evaluate(() => window.fixtureCaption("Короткое видео озвучивается по-русски."));
  await page.waitForFunction(() => document.querySelector('#bridge-youtube-status').textContent.includes('Озвучиваем'));
  assert.equal(await page.locator('#shorts-player .ytp-caption-window-container').evaluate((element) => getComputedStyle(element).opacity), "0", "В Shorts голос работает со скрытым текстом");
  assert.equal(await page.locator('.bridge-youtube-toggle svg').getAttribute('data-bridge-icon'), "pause");
  assert.equal(await page.locator('#bridge-youtube-status').isVisible(), false);
  await page.screenshot({ path: join(output, "shorts-compact-controls.png"), fullPage: true });
  await page.locator('.bridge-youtube-toggle').click();
  await page.locator('.bridge-youtube-toggle[aria-pressed="false"]').waitFor();
  assert.equal(await page.locator('.bridge-youtube-toggle svg').getAttribute('data-bridge-icon'), "play");
  await page.locator('.bridge-youtube-toggle').click();
  await page.waitForFunction(() => document.querySelector('.bridge-youtube-toggle').getAttribute('aria-pressed') === 'true');
  assert.ok((await worker.evaluate(() => globalThis.bridgeShortSpeech)).some((text) => text.includes('Короткое видео')));
  await page.locator('.bridge-language-settings').click();
  await page.screenshot({ path: join(output, "shorts-controls.png"), fullPage: true });
  await page.locator('#bridge-source-language').selectOption('en-US');
  await page.waitForFunction(() => document.querySelector('.bridge-youtube-toggle').getAttribute('aria-pressed') === 'true' && document.documentElement.dataset.captionLanguage === 'ru');
  await page.waitForFunction(() => !document.querySelector('#bridge-youtube-status').textContent.includes('выбираем перевод'));
  await page.locator('#bridge-hide-downloader').uncheck();
  await page.locator('#all-in-one-downloader-daniel').waitFor({ state: "visible" });
  assert.equal(await page.locator('.bridge-youtube-toggle').getAttribute('aria-pressed'), 'true', "Видимость загрузчика не отключает речь");
  await page.locator('#bridge-hide-downloader').check();
  await page.locator('#all-in-one-downloader-daniel').waitFor({ state: "hidden" });
  await page.evaluate(() => window.fixtureNextShort());
  await page.locator('#next-short > .bridge-shorts .bridge-youtube-toggle[aria-pressed="false"]').waitFor();
  assert.equal(await page.locator('[data-bridge-hide-subtitles]').count(), 0, "При смене Shorts скрытие снимается со старого плеера");
  await assertClickable();
  assert.equal(await page.locator('.bridge-youtube-toggle svg').getAttribute('data-bridge-icon'), "play");
  assert.equal(await page.locator('#bridge-youtube-control').count(), 1, "Кнопка переносится без дубликатов при прокрутке Shorts");
  await page.locator('.bridge-youtube-toggle').click();
  await page.waitForFunction(() => document.documentElement.dataset.captionLanguage === "ru");
  await page.reload();
  await page.locator('.bridge-youtube-toggle:not([disabled])').waitFor();
  assert.equal(await page.locator('#all-in-one-downloader-daniel').isVisible(), false, "Выбор скрытия сохранился после перезагрузки");
  await page.goto("https://www.youtube.com/shorts/shorts_auto");
  await page.locator('.bridge-youtube-toggle:not([disabled])').waitFor();
  await page.evaluate(async (url) => {const v=document.querySelector('#shorts-player video');v.src=url;await v.play();}, audio);
  await page.locator('.bridge-youtube-toggle').click();
  await page.waitForFunction(() => document.documentElement.dataset.captionLanguage === "ru");
  await page.waitForFunction(() => document.querySelector('#bridge-youtube-status').textContent.includes('Ждём'));
  assert.equal(await page.locator('yt-sheet-view-model').isVisible(), false);
  assert.deepEqual(errors, []);
  assert.ok(requests.every((url) => url.startsWith("https://www.youtube.com/")));
  assert.equal(await page.locator('html').getAttribute('data-native-clicks'), null, "Клики не уходят в подпись Shorts");
  if (process.env.BRIDGE_LIVE_SHORTS === '1') {
    await context.unroute('https://www.youtube.com/**');
    const live = await context.newPage();
    await live.goto('https://www.youtube.com/shorts/o5-LZ4bq4uI', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await live.locator('.bridge-shorts .bridge-youtube-toggle:not([disabled])').waitFor({ timeout: 20000 });
    await assertClickable(live);
    await live.locator('.bridge-language-settings').click();
    assert.equal(await live.locator('#bridge-language-panel').isVisible(), true);
    await live.locator('.bridge-language-settings').click();
    await live.locator('.bridge-youtube-toggle').click();
    await live.locator('.bridge-youtube-toggle[aria-pressed="true"]').waitFor();
    await assertClickable(live);
    await live.locator('.bridge-youtube-toggle').click();
    await live.locator('.bridge-youtube-toggle[aria-pressed="false"]').waitFor();
    await live.screenshot({ path: join(output, 'shorts-live-clickable.png'), fullPage: false });
    console.log('Настоящий присланный Shorts: кнопки выше подписи, обе получают клики, настройки открываются, включение/выключение работают — OK.');
  }
  console.log("Первый SPA-переход с главной: настройки и кнопка работают без reload. Shorts: активный плеер, CC, русский напрямую и через автоперевод, озвучка, перенос между роликами. Загрузчик: скрытие по умолчанию, переключение без остановки речи, сохранение — OK.");
} finally { await context.close(); await rm(profile, { recursive: true, force: true }); await rm(root, { recursive: true, force: true }); }
