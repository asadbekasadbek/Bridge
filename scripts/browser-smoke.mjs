import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSpeechFixture } from "./speech-fixture.mjs";

// Optional developer-only smoke test. Playwright is not shipped in the extension.
const require = createRequire(import.meta.url);
const searchPaths = process.env.BRIDGE_PLAYWRIGHT_ROOT ? [process.env.BRIDGE_PLAYWRIGHT_ROOT] : [process.cwd()];
const { chromium } = require(require.resolve("playwright", { paths: searchPaths }));
const profile = await mkdtemp(join(tmpdir(), "bridge-chrome-test-"));
const fixtureRoot = await mkdtemp(join(tmpdir(), "bridge-speech-fixture-"));
const extensionPath = await createSpeechFixture(fileURLToPath(new URL("../extension/", import.meta.url)), join(fixtureRoot, "extension"));
const output = fileURLToPath(new URL("../test-results/", import.meta.url));
await mkdir(output, { recursive: true });

const launchOptions = {
  channel: "chromium",
  headless: true,
  viewport: { width: 1280, height: 950 },
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, "--no-first-run", "--no-default-browser-check", "--mute-audio"]
};
let context = await chromium.launchPersistentContext(profile, launchOptions);
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 20000 });
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  const errors = [];
  const remoteRequests = [];
  context.on("page", (newPage) => newPage.on("pageerror", (error) => errors.push(error.message)));
  page.on("pageerror", (error) => errors.push(error.message));
  context.on("request", (request) => {
    if (/^https?:/.test(request.url()) && request.frame()?.url().startsWith(`chrome-extension://${extensionId}/`)) remoteRequests.push(request.url());
  });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.locator("#settings-fields:not([disabled])").waitFor();
  assert.equal(await page.locator("#fatal-error").isVisible(), false);
  const realVoices = await worker.evaluate(() => new Promise((resolve) => {
    chrome.tts.getVoices((voices) => {
      resolve(voices.map(({ voiceName, lang, remote, extensionId }) => ({ voiceName, lang, remote, extensionId })));
    });
  }));
  console.log(`Реальное расширение загружено. Голосов в тестовой ОС: ${realVoices.length}.`);
  console.log("Доступные локальные русские голоса:", realVoices.filter((voice) => voice.lang.startsWith("ru") && voice.remote === false && !voice.extensionId).map((voice) => voice.voiceName).join(", ") || "нет");
  await page.screenshot({ path: join(output, "settings-native.png"), fullPage: true });
  const nativeRussian = realVoices.find((voice) => voice.remote === false && !voice.extensionId && voice.lang.startsWith("ru"));
  if (nativeRussian) {
    await page.locator("#voice").selectOption(nativeRussian.voiceName);
    await page.locator("#volume").fill("0");
    await page.locator("#sample").fill("Ты придёшь? Да, конечно! Это 3,5 метра.");
    await page.locator("#preview").click();
    await page.waitForFunction(() => {
      const status = document.getElementById("preview-status");
      return status.textContent.includes("Проверка завершена") || status.classList.contains("error-text");
    }, undefined, { timeout: 20000 });
    assert.ok((await page.locator("#preview-status").textContent()).includes("Проверка завершена"));
    console.log("Реальный системный голос завершил синтез тестовой фразы (громкость 0).");
  }

  // Mock only the OS speech engine in this isolated profile. UI, service worker,
  // Chrome messaging and Chrome storage remain real; no sound is played.
  await worker.evaluate(() => {
    globalThis.bridgeFixture = [
      { voiceName: "Тестовый локальный голос", lang: "ru-RU", remote: false },
      { voiceName: "Test local voice", lang: "en-US", remote: false },
      { voiceName: "Cloud must never appear", lang: "ru-RU", remote: true }
    ];
    chrome.tts.getVoices = (callback) => callback(globalThis.bridgeFixture);
    chrome.tts.speak = (text, options, callback) => {
      globalThis.bridgeLastSpeech = { text, voiceName: options.voiceName, rate: options.rate, volume: options.volume };
      globalThis.bridgeSpeechEvent = options.onEvent;
      callback();
      options.onEvent({ type: "start" });
    };
    chrome.tts.stop = () => {};
  });
  await page.reload();
  await page.locator("#settings-fields:not([disabled])").waitFor();
  assert.equal(await page.locator("#natural-speech").isChecked(), true);
  assert.equal(await page.locator("#voice option").count(), 2);
  assert.ok(!(await page.locator("#voice").textContent()).includes("Cloud"));
  await page.locator("#voice").selectOption("Тестовый локальный голос");
  await page.locator("#rate").fill("1.25");
  await page.locator("#volume").fill("63");
  await page.locator("#save").click();
  await page.getByText("✓ Настройки сохранены на компьютере.").waitFor();
  await page.reload();
  await page.locator("#settings-fields:not([disabled])").waitFor();
  assert.equal(await page.locator("#rate").inputValue(), "1.25");
  assert.equal(await page.locator("#volume").inputValue(), "63");

  await page.locator("#preview").click();
  await page.getByText("Сейчас звучит локальный голос.").waitFor();
  const spoken = await worker.evaluate(() => globalThis.bridgeLastSpeech);
  assert.equal(spoken.voiceName, "Тестовый локальный голос");
  assert.equal(spoken.rate, 1.25);
  assert.equal(spoken.volume, 0.63);
  await page.locator("#stop").click();
  await page.getByText("Озвучка остановлена.").waitFor();
  await page.locator("#preview").click();
  await page.getByText("Сейчас звучит локальный голос.").waitFor();
  await worker.evaluate(() => globalThis.bridgeSpeechEvent({ type: "error", errorMessage: "Тест: голос недоступен" }));
  await page.getByText("Тест: голос недоступен").waitFor();
  assert.equal(await page.locator("#stop").isDisabled(), true);

  await page.locator("#language").selectOption("uz-UZ");
  assert.equal(await page.locator("#voice-warning").isVisible(), true);
  assert.equal(await page.locator("#preview").isDisabled(), true);
  await page.screenshot({ path: join(output, "settings-no-voice.png"), fullPage: true });
  await page.locator("#language").selectOption("ru-RU");
  await page.locator("#voice").selectOption("Тестовый локальный голос");
  await page.locator("#save").click();
  await page.getByText("✓ Настройки сохранены на компьютере.").waitFor();
  await page.screenshot({ path: join(output, "settings-desktop.png"), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 360, height: 640 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByText("Тестовый локальный голос", { exact: true }).waitFor();
  await popup.locator("#quick-preview").click();
  await popup.getByText("Сейчас звучит локальный голос.").waitFor();
  await popup.locator("#quick-stop").click();
  await popup.getByText("Озвучка остановлена.").waitFor();
  await popup.screenshot({ path: join(output, "popup.png"), fullPage: true });
  assert.equal(await popup.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);

  await worker.evaluate(() => {
    globalThis.bridgeFixture = [{ voiceName: "Другой локальный голос", lang: "ru-RU", remote: false }];
  });
  await page.locator("#refresh-voices").click();
  await page.getByText("Сохранённый голос больше недоступен. Выберите другой локальный голос.").waitFor();
  assert.equal(await page.locator("#preview").isDisabled(), true);
  await page.locator("#voice").selectOption("Другой локальный голос");
  assert.equal(await page.locator("#preview").isEnabled(), true);

  await page.locator("#rate").fill("0.9");
  await page.locator("#save").click();
  await popup.getByText("0,9×", { exact: true }).waitFor();
  await page.locator("#reset").click();
  assert.equal(await page.locator("#rate").inputValue(), "1");
  const stored = await worker.evaluate(() => new Promise((resolve) => chrome.storage.local.get("bridgeSettings", resolve)));
  assert.equal(stored.bridgeSettings.rate, 0.9, "Сброс до нажатия Сохранить не меняет хранилище");

  // One click must prefer an installed enhanced voice, save the entire speech
  // preset and audition it while retaining the independently selected languages.
  await worker.evaluate(() => {
    globalThis.bridgeFixture.push(
      { voiceName: "Russian Enhanced", lang: "ru-RU", gender: "female", remote: false },
      { voiceName: "Microsoft Pavel Desktop", lang: "ru-RU", remote: false },
      { voiceName: "Cloud Premium", lang: "ru-RU", remote: true }
    );
  });
  await page.locator("#volume").fill("63");
  await page.locator("#source-language").selectOption("en-US");
  await page.locator("#rate").fill("1.4");
  await page.locator("#natural-speech").uncheck();
  await page.locator("#best-voice").click();
  await page.getByText("✓ Плавная речь сохранена. Голос: Bridge — Денис (локальный). Скорость: 1×.").waitFor();
  await page.getByText("Сейчас звучит локальный голос.").waitFor();
  assert.equal(await page.locator("#voice").inputValue(), "Bridge — Денис (локальный)");
  const presetSpeech = await worker.evaluate(() => globalThis.bridgeLastSpeech);
  assert.equal(presetSpeech.voiceName, "Bridge — Денис (локальный)");
  assert.equal(presetSpeech.rate, 1);
  assert.equal(presetSpeech.volume, 0.63);
  await page.locator("#stop").click();
  await page.reload();
  await page.locator("#settings-fields:not([disabled])").waitFor();
  assert.equal(await page.locator("#voice").inputValue(), "Bridge — Денис (локальный)");
  assert.equal(await page.locator("#natural-speech").isChecked(), true);
  assert.equal(await page.locator("#rate").inputValue(), "1");
  assert.equal(await page.locator("#volume").inputValue(), "63");
  assert.equal(await page.locator("#source-language").inputValue(), "en-US");
  assert.equal(await page.locator("#language").inputValue(), "ru-RU");
  await page.screenshot({ path: join(output, "settings-natural-speech.png"), fullPage: true });
  await page.locator("#voice-gender").selectOption("male");
  assert.equal(await page.locator("#voice").inputValue(), "Bridge — Денис (локальный)");
  await page.locator("#preview").click();
  await page.getByText("Сейчас звучит локальный голос.").waitFor();
  assert.equal((await worker.evaluate(() => globalThis.bridgeLastSpeech)).voiceName, "Bridge — Денис (локальный)");
  await page.locator("#stop").click();
  await page.locator("#voice-gender").selectOption("female");
  assert.equal(await page.locator("#voice").inputValue(), "Russian Enhanced");
  await page.locator("#ducking-amount").fill("47");
  await page.locator("#ducking-enabled").uncheck();
  assert.equal(await page.locator("#ducking-amount").isDisabled(), true);
  await page.locator("#rate").fill("0.9");
  await page.locator("#save").click();
  await page.getByText("✓ Настройки сохранены на компьютере.").waitFor();
  await page.locator("#rate").fill("1");
  console.log("Плавная речь: улучшенный локальный голос выбран, сохранён и отправлен тестовому движку; оба языка и громкость сохранены — OK.");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(output, "settings-narrow.png"), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  assert.deepEqual(errors, []);
  assert.deepEqual(remoteRequests, []);
  await worker.evaluate(() => new Promise((resolve) => chrome.storage.local.get("bridgeSettings", (stored) => {
    chrome.storage.local.set({ bridgeSettings: { ...stored.bridgeSettings, language: "en-US", voiceName: "" } }, resolve);
  })));
  await page.waitForFunction(() => document.getElementById("language").value === "en-US");
  assert.equal(await page.locator("#rate").inputValue(), "1", "Смена языка из плеера не стирает другие правки в открытых настройках");
  // The destination autosaves even when its tab is closed without clicking Save.
  await page.locator("#show-subtitles").check();
  await page.waitForFunction(() => document.getElementById("save-status").textContent.includes("сохранён"));
  await page.locator("#source-language").selectOption("en-US");
  await page.locator("#language").selectOption("de-DE");
  await page.close();
  for (let attempt = 0; attempt < 40; attempt++) {
    const result = await worker.evaluate(() => new Promise((resolve) => chrome.storage.local.get("bridgeSettings", resolve)));
    if (result.bridgeSettings.language === "de-DE") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await context.close();
  context = await chromium.launchPersistentContext(profile, launchOptions);
  const reopened = await context.newPage();
  await reopened.goto(`chrome-extension://${extensionId}/options.html`);
  await reopened.locator("#settings-fields:not([disabled])").waitFor();
  assert.equal(await reopened.locator("#language").inputValue(), "de-DE", "Язык сохранён после полного закрытия браузера");
  assert.equal(await reopened.locator("#source-language").inputValue(), "en-US", "Ручной исходный язык сохранён независимо от языка результата");
  assert.equal(await reopened.locator("#rate").inputValue(), "0.9", "Автосохранение языка не сохраняет другие несохранённые поля");
  assert.equal(await reopened.locator("#volume").inputValue(), "63");
  assert.equal(await reopened.locator("#voice-gender").inputValue(), "female");
  assert.equal(await reopened.locator("#ducking-enabled").isChecked(), false);
  assert.equal(await reopened.locator("#ducking-amount").inputValue(), "47");
  assert.equal(await reopened.locator("#show-subtitles").isChecked(), true, "Выбор показа субтитров сохранён после полного закрытия браузера");
  await reopened.locator("#show-subtitles").uncheck();
  await reopened.waitForFunction(() => document.getElementById("save-status").textContent.includes("сохранён"));
  await reopened.reload();
  await reopened.locator("#settings-fields:not([disabled])").waitFor();
  assert.equal(await reopened.locator("#show-subtitles").isChecked(), false, "Выбор скрытия субтитров тоже сохраняется");
  console.log("Полный перезапуск Chromium: исходный английский и выбранный немецкий сохранились независимо без нажатия Сохранить — OK.");
  console.log("Browser smoke: сохранение, повторное открытие, popup, озвучка с тестовым движком, остановка, поздняя ошибка, отсутствие голоса, узкий экран — OK.");
  console.log("Запросов к внешним сайтам со страниц расширения: 0. Скриншоты: test-results/.");
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
  await rm(fixtureRoot, { recursive: true, force: true });
}
