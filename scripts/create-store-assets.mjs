import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const paths = [process.env.BRIDGE_PLAYWRIGHT_ROOT || process.cwd()];
const { chromium } = require(require.resolve("playwright", { paths }));
const sharp = require(require.resolve("sharp", { paths }));
const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "distribution/chrome-web-store/assets");
for (const folder of ["", "screenshots", "source"]) await mkdir(join(output, folder), { recursive: true });
const icon = await readFile(join(root, "extension/icons/mark.svg"), "utf8");
const iconData = `data:image/svg+xml;base64,${Buffer.from(icon).toString("base64")}`;
const png = async (bytes, path) => sharp(bytes).flatten({ background: "#f6f5f0" }).removeAlpha().png().toFile(path);
const svg = (width, height, content) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`;
const bridge = (x, y, size, color = "white") => `<g transform="translate(${x} ${y}) scale(${size / 40})"><path d="M10 26V17m20 9V17M10 23c3-10 17-10 20 0M8 27h24" fill="none" stroke="${color}" stroke-width="2.7" stroke-linecap="round"/><path d="M17 26v-4m6 4v-4" fill="none" stroke="${color}" stroke-width="2.3" stroke-linecap="round"/></g>`;
const wave = (x, y, width, height, color) => `<g fill="${color}">${Array.from({ length: 21 }, (_, i) => {
  const h = height * (0.16 + 0.84 * Math.abs(Math.sin(i * 0.63) * Math.sin((i + 2) * 0.24)));
  return `<rect x="${x + i * width / 21}" y="${y - h / 2}" width="${width / 34}" height="${h}" rx="${width / 70}"/>`;
}).join("")}</g>`;

const small = svg(440, 280, `<rect width="440" height="280" fill="#3856f6"/><circle cx="420" cy="-60" r="230" fill="#ffffff" opacity=".06"/><path d="M-30 250Q220-130 470 250" fill="none" stroke="#ffffff" opacity=".08" stroke-width="50"/>${bridge(142, 28, 156)}<text x="220" y="222" text-anchor="middle" font-family="Arial,sans-serif" font-size="48" font-weight="700" fill="white">Bridge</text>`);
const marquee = svg(1400, 560, `<rect width="1400" height="560" fill="#3856f6"/><path d="M670 560Q1030-180 1430 560" fill="none" stroke="white" stroke-width="80" opacity=".07"/>${bridge(56, 50, 170)}<g font-family="Arial,sans-serif" fill="white"><text x="78" y="307" font-size="102" font-weight="700" letter-spacing="-5">Bridge</text><text x="84" y="367" font-size="30">Субтитры становятся голосом</text></g><g transform="translate(783 145)"><rect width="420" height="264" rx="24" fill="#233ec6"/><rect x="36" y="34" width="174" height="10" rx="5" fill="#c2ceff"/><rect x="36" y="56" width="118" height="10" rx="5" fill="#c2ceff" opacity=".5"/>${wave(40, 150, 340, 117, "#ffffff")}<path d="M36 227h348" stroke="#91a4ff" stroke-width="2"/></g>`);
await writeFile(join(output, "source/promo-small.svg"), small);
await writeFile(join(output, "source/promo-marquee.svg"), marquee);
await png(Buffer.from(small), join(output, "promo-440x280.png"));
await png(Buffer.from(marquee), join(output, "marquee-1400x560.png"));
await copyFile(join(root, "extension/icons/128.png"), join(output, "icon-128.png"));

const fixture = await readFile(join(root, "tests/fixtures/youtube.html"), "utf8");
const menuScript = fixture.slice(fixture.indexOf("<script>") + 8, fixture.lastIndexOf("</script>"));
const art = svg(1152, 596, `<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#f2b9a6"/><stop offset="1" stop-color="#e6d9be"/></linearGradient></defs><rect width="1152" height="596" fill="url(#sky)"/><circle cx="904" cy="114" r="48" fill="#fff2d0"/><path d="M0 428L222 172l143 197 114-147 265 292L960 230l192 202V596H0" fill="#849293"/><path d="M0 475L261 323l205 191 280-208 406 217V596H0" fill="#3d6264"/><path d="M0 550q310-170 586-18t566-40v104H0" fill="#21494b"/><path d="M0 596q320-160 597-55t555-14v69" fill="#163a40"/><g opacity=".45" fill="#0b2e37"><path d="M1040 198l-27 78h17l-32 78h83l-33-78h18z"/><path d="M1095 254l-30 89h18l-35 87h95l-35-87h18z"/></g>`);
const demo = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Bridge · демонстрация интерфейса</title><style>
*{box-sizing:border-box}body{margin:0;background:#f6f5f0;color:#182238;font:16px Arial,sans-serif}header{height:76px;padding:0 64px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #deded7}.brand{display:flex;align-items:center;gap:11px;font-size:25px;letter-spacing:-1px;font-weight:700}.brand img{width:36px;height:36px}.demo-label{font-size:12px;color:#737a87}main{margin:24px 64px}.html5-video-player{height:596px;position:relative;overflow:hidden;background:#21494b}video{position:absolute;width:100%;height:100%;opacity:.01}.scene{position:absolute;inset:0;background-image:url('data:image/svg+xml;base64,${Buffer.from(art).toString("base64")}');background-size:cover}.scene::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#163a4088,transparent 65%)}.lesson{position:absolute;left:48px;top:70px;color:#fff;text-shadow:0 2px 16px #102d3155}.lesson p{font-size:12px;letter-spacing:3px;font-weight:700}.lesson h1{font-size:49px;line-height:1.08;letter-spacing:-2px;margin:20px 0;max-width:580px}.lesson span{font-size:15px;opacity:.9}.ytp-right-controls{position:absolute;bottom:0;right:16px;height:54px;display:flex;align-items:center;gap:8px;z-index:2}.player-bottom{position:absolute;bottom:0;left:0;right:0;height:90px;background:linear-gradient(transparent,#081e2bca)}.fixture-control{height:32px;border:0;background:transparent;color:#fff;font-size:20px}.ytp-caption-window-container{position:absolute;bottom:95px;width:100%;text-align:center;pointer-events:none}.ytp-caption-segment{display:inline-block;max-width:83%;padding:11px 18px;background:#102230d9;color:#fff;font-size:22px;line-height:1.4}.below{display:flex;justify-content:space-between;align-items:center;margin-top:18px}.below strong{font-size:17px;font-weight:500}.below span{font-size:12px;color:#67707b}.ytp-settings-menu{color:white}
</style></head><body><header><div class="brand"><img src="${iconData}" alt="">Bridge</div><div class="demo-label">Демонстрационный ролик · настоящий интерфейс расширения</div></header><main><div id="movie_player" class="html5-video-player"><video muted autoplay loop playsinline></video><div class="scene"></div><div class="lesson"><p>СЛУШАЙТЕ В СВОЁМ РИТМЕ</p><h1>Меньше чтения.<br>Больше понимания.</h1><span>Доступные субтитры — выбранным голосом.</span></div><div class="ytp-caption-window-container" style="visibility:hidden"></div><div class="player-bottom"></div><div class="ytp-right-controls"><button class="fixture-control ytp-subtitles-button" aria-label="Субтитры" aria-pressed="false">CC</button><button class="fixture-control" aria-label="Настройки">⚙</button><button class="fixture-control" aria-label="Полный экран">⛶</button></div></div><div class="below"><strong>Субтитры становятся голосом</strong><span>Для работы нужны доступные текстовые дорожки</span></div></main><script>${menuScript}</script></body></html>`;
await writeFile(join(output, "source/demo.html"), demo);

const directory = await mkdtemp(join(tmpdir(), "bridge-store-capture-"));
let context;
try {
  const extension = join(root, "extension");
  context = await chromium.launchPersistentContext(join(directory, "profile"), {
    channel: "chromium", headless: true, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--no-first-run", "--mute-audio"]
  });
  const errors = [];
  context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const id = new URL(worker.url()).host;
  const model = await readFile(join(root, "archive/bundled-0.16/voices/ru/denis.onnx"));
  const config = await readFile(join(root, "archive/bundled-0.16/voices/ru/config.json"));
  await context.route("https://huggingface.co/**", route => route.fulfill({
    body: route.request().url().includes(".onnx.json") ? config : model,
    contentType: route.request().url().includes(".json") ? "application/json" : "application/octet-stream",
    headers: { "Access-Control-Allow-Origin": "*" }
  }));
  const options = await context.newPage(); await options.goto(`chrome-extension://${id}/options.html`);
  await options.locator("#settings-fields:not([disabled])").waitFor();
  await options.locator('[data-bridge-install-voices="ru_RU-denis-medium"]').click();
  await options.waitForFunction(() => document.querySelector("#voice").value.includes("Денис"), null, { timeout: 60000 });
  await options.locator("#source-language").selectOption("en-US");
  await options.locator("#show-subtitles").check();
  await options.locator("#voice-gender").selectOption("any");
  await options.locator("#voice").selectOption({ label: (await options.locator("#voice option").allTextContents()).find(label => label.includes("Денис")) });
  await options.locator("#save").click(); await options.getByText("✓ Настройки сохранены на компьютере.").waitFor();
  const capture = async (page, name) => {
    const file = join(output, "source", `${name}.png`);
    await page.screenshot({ path: file, animations: "disabled" });
    await png(await readFile(file), join(output, "screenshots", `${name}.png`));
  };
  await options.locator("#voice-pack-controls").evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 74));
  await capture(options, "03-voice-library");
  const libraryBytes = await options.locator("#voice-pack-controls").screenshot({ animations: "disabled" });
  await writeFile(join(output, "source/voice-library-panel.png"), libraryBytes);
  const libraryPanel = await sharp(libraryBytes).resize({ width: 440, height: 660, fit: "inside" }).flatten({ background: "white" }).removeAlpha().png().toBuffer();
  const libraryCard = svg(1280, 800, `<rect width="1280" height="800" fill="#f6f5f0"/>${bridge(49, 38, 78, "#3856f6")}<g font-family="Arial,sans-serif" fill="#182238"><text x="134" y="93" font-size="36" font-weight="700">Bridge</text><text x="64" y="225" font-size="53" font-weight="700" letter-spacing="-2">Выберите голос.</text><text x="64" y="290" font-size="53" font-weight="700" letter-spacing="-2">Остальные</text><text x="64" y="355" font-size="53" font-weight="700" letter-spacing="-2">не скачиваются.</text><text x="67" y="442" font-size="26" font-weight="700" fill="#3856f6">53 пакета · 49 языков</text><text x="67" y="492" font-size="21" fill="#5e687b">Установленные голоса хранятся</text><text x="67" y="524" font-size="21" fill="#5e687b">на компьютере. Ненужные можно удалить.</text><text x="67" y="667" font-size="16" fill="#687385">Голос и перевод — отдельные возможности.</text><text x="67" y="695" font-size="16" fill="#687385">Поддержка языков и пар зависит от браузера.</text></g><rect x="758" y="60" width="474" height="690" rx="24" fill="#e7eaff"/>`);
  await sharp(Buffer.from(libraryCard)).composite([{ input: libraryPanel, left: 775, top: 75 }]).removeAlpha().png().toFile(join(output, "screenshots/03-voice-library.png"));

  await context.route("https://www.youtube.com/**", route => route.fulfill({ contentType: "text/html", body: demo }));
  const page = await context.newPage(); await page.goto("https://www.youtube.com/watch?v=bridge_store_demo");
  const wav = Buffer.alloc(44 + 16000 * 120);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);
  await page.evaluate(async url => { const v = document.querySelector("video"); v.src = url; await v.play(); }, `data:audio/wav;base64,${wav.toString("base64")}`);
  await page.locator(".bridge-youtube-toggle:not([disabled])").click();
  await page.waitForFunction(() => document.querySelector("#bridge-youtube-status").textContent.includes("Ждём"), null, { timeout: 20000 });
  await page.evaluate(() => {
    const span = document.createElement("span"); span.className = "ytp-caption-segment";
    span.textContent = "Слушайте доступные субтитры на выбранном языке.";
    document.querySelector(".ytp-caption-window-container").replaceChildren(span);
  });
  await page.waitForFunction(() => document.querySelector("#bridge-youtube-status").textContent.includes("Озвучиваем"), null, { timeout: 60000 });
  await capture(page, "01-subtitles-to-voice");
  await page.locator(".bridge-language-settings").click();
  await page.locator("#bridge-language-panel").evaluate(el => { el.scrollTop = 0; });
  await capture(page, "02-language-controls");
  await page.locator("#bridge-ducking-amount").fill("60");
  await page.locator("#bridge-language-panel").evaluate(el => {
    const item = el.querySelector("#bridge-voice-volume").closest(".bridge-mix-section");
    el.scrollTop += item.getBoundingClientRect().top - el.getBoundingClientRect().top - 70;
  });
  await capture(page, "04-original-volume");
  await page.locator(".bridge-language-settings").click();

  const popup = await context.newPage(); await popup.setViewportSize({ width: 380, height: 800 });
  await page.bringToFront();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.waitForFunction(() => !document.querySelector("#summary-language").textContent.includes("Загружаем"));
  const popupBytes = await popup.screenshot({ animations: "disabled" });
  await writeFile(join(output, "source/popup.png"), popupBytes);
  const panel = await sharp(popupBytes).resize({ width: 342 }).flatten({ background: "#f6f5f0" }).removeAlpha().png().toBuffer();
  const card = svg(1280, 800, `<rect width="1280" height="800" fill="#f6f5f0"/><rect x="788" y="32" width="460" height="736" rx="28" fill="#e7eaff"/>${bridge(49, 38, 78, "#3856f6")}<g font-family="Arial,sans-serif" fill="#182238"><text x="134" y="93" font-size="36" font-weight="700">Bridge</text><text x="64" y="235" font-size="52" font-weight="700" letter-spacing="-2">Настройте один раз.</text><text x="64" y="297" font-size="52" font-weight="700" letter-spacing="-2">Слушайте по-своему.</text><text x="67" y="368" font-size="22" fill="#5e687b">Язык, голос, скорость и громкость</text><text x="67" y="401" font-size="22" fill="#5e687b">сохраняются на компьютере.</text><text x="67" y="510" font-size="17" font-weight="700">ПОДДЕРЖИВАЕМЫЕ ПЛОЩАДКИ</text><text x="67" y="555" font-size="20">YouTube · TED · Vimeo · Udemy · Coursera</text><text x="67" y="589" font-size="20">VK Видео · RUTUBE · Twitch</text><text x="67" y="701" font-size="16" fill="#687385">Нужны доступные текстовые субтитры.</text></g>`);
  await sharp(Buffer.from(card)).composite([{ input: panel, left: 847, top: 40 }]).removeAlpha().png().toFile(join(output, "screenshots/05-personal-settings.png"));
  assert.deepEqual(errors, []);
  const files = ["01-subtitles-to-voice", "02-language-controls", "03-voice-library", "04-original-volume", "05-personal-settings"];
  for (const name of files) {
    const metadata = await sharp(join(output, "screenshots", `${name}.png`)).metadata();
    assert.equal(metadata.width, 1280); assert.equal(metadata.height, 800); assert.equal(metadata.hasAlpha, false);
  }
  await writeFile(join(output, "capture-report.json"), JSON.stringify({ browser: context.browser().version(), dimensions: "1280x800", screenshots: files, extension: "real UI, real pinned voice installation and ONNX speech", sourceVideo: "locally authored demo fixture", modelDownload: "local archive response, checked by the real installer", errors }, null, 2) + "\n");
  console.log(`Готовы 5 скриншотов, иконка и 2 промоизображения: ${output}`);
} finally { await context?.close(); await rm(directory, { recursive: true, force: true }); }
