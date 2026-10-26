import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", { paths: [process.env.BRIDGE_PLAYWRIGHT_ROOT || process.cwd()] }));
const profile = await mkdtemp(join(tmpdir(), "bridge-native-translation-"));
const context = await chromium.launchPersistentContext(profile, { channel: process.env.BRIDGE_TRANSLATOR_CHANNEL || 'chrome', headless: true, ignoreDefaultArgs: ['--disable-component-update'], args: ['--no-first-run'] });
try {
  const page = await context.newPage();
  await page.route('https://www.udemy.com/**', route => route.fulfill({ contentType: 'text/html', body: '<button>Локальный перевод</button><pre></pre>' }));
  await page.goto('https://www.udemy.com/course/bridge-local-translation-test/');
  await page.addScriptTag({ content: await readFile(new URL('../extension/platforms/local-translation.js', import.meta.url), 'utf8') });
  await page.evaluate(() => {
    globalThis.modelCreates = 0;
    globalThis.localTranslator = BridgeLocalTranslation.createLocalTranslator({ Translator: {
      availability: options => Translator.availability(options),
      create: options => { globalThis.modelCreates++; return Translator.create(options); }
    } });
    document.querySelector('button').onclick = async () => {
      try {
        await localTranslator.prepare('en-US', 'ru-RU', { onProgress: text => { document.querySelector('pre').textContent = text; } });
        globalThis.translationResult = await localTranslator.translate('At first, I tried to reply to everyone individually.');
      } catch (error) { globalThis.translationError = error.message; }
    };
  });
  await page.locator('button').click();
  await page.waitForFunction(() => globalThis.translationResult || globalThis.translationError, { timeout: 160000 });
  const first = await page.evaluate(() => ({ text: globalThis.translationResult, error: globalThis.translationError }));
  assert.equal(first.error, undefined); assert.match(first.text, /[А-Яа-я]/); assert.match(first.text, /ответ|отвеч/);
  await context.setOffline(true);
  const second = await page.evaluate(async () => {
    localTranslator.destroy(true);
    await localTranslator.prepare('en-GB', 'ru');
    return { text: await localTranslator.translate('The video is paused.'), creates: globalThis.modelCreates };
  });
  assert.match(second.text, /[А-Яа-я]/); assert.equal(second.creates, 2);
  const output = new URL('../test-results/', import.meta.url); await mkdir(output, { recursive: true });
  await writeFile(new URL('translation-native-browser.json', output), JSON.stringify({ nativeChromeTranslator: true, extensionHelper: true, sourceFixture: true, first: first.text, offline: second.text, modelCreates: second.creates, note: 'Настоящий Translator; страница Udemy заменена тестовым HTML, авторизованный урок не проверяется.' }, null, 2));
  console.log(JSON.stringify({ first: first.text, offline: second.text, modelCreates: second.creates }));
} finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
