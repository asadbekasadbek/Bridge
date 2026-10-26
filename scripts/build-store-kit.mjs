import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { readManifestLocales } from "./store-locales.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = join(root, "distribution/chrome-web-store");
const { manifest, locales } = await readManifestLocales(new URL("../extension/", import.meta.url));
const metadata = JSON.parse(await readFile(join(source, "metadata.json"), "utf8"));
const listings = await Promise.all(locales.map(async item => ({ ...item, description: (await readFile(join(source, `listing-${item.locale}.txt`), "utf8")).trim() })));
const primary = listings.find(item => item.locale === manifest.default_locale);
const reviewer = (await readFile(join(source, "reviewer-instructions-en.txt"), "utf8")).trim();
const policy = (await readFile(join(source, "privacy-policy.md"), "utf8")).trim();
for (const listing of listings) assert.ok(listing.description.length >= 100 && listing.description.length <= 16000, `${listing.locale}: detailed description length`);
assert.deepEqual(metadata.locales, listings.map(item => item.locale));
assert.equal(metadata.locale, manifest.default_locale);
assert.equal(metadata.visibility, "Public");
for (const script of ["check.mjs", "package.mjs"]) execFileSync(process.execPath, [join(root, "scripts", script)], { cwd: root, stdio: "inherit" });

const kitName = `bridge-chrome-web-store-${manifest.version}`;
const directory = join(root, "dist", kitName);
// Only overwrite the output tree belonging to this exact generated kit.
await rm(directory, { recursive: true, force: true });
for (const folder of ["01-upload", "02-listing", "03-images", "04-review", "05-privacy"]) await mkdir(join(directory, folder), { recursive: true });
const upload = `bridge-${manifest.version}-lite.zip`;
for (const file of [upload, `${upload}.sha256`]) await copyFile(join(root, "dist", file), join(directory, "01-upload", file));
await cp(join(source, "assets"), join(directory, "03-images"), { recursive: true });
for (const { locale, title, shortDescription, description } of listings) {
  await writeFile(join(directory, `02-listing/title-${locale}.txt`), `${title}\n`);
  await writeFile(join(directory, `02-listing/short-description-${locale}.txt`), `${shortDescription}\n`);
  await writeFile(join(directory, `02-listing/description-${locale}.txt`), `${description}\n`);
}
await writeFile(join(directory, "02-listing/title.txt"), `${primary.title}\n`);
await writeFile(join(directory, "02-listing/short-description.txt"), `${primary.shortDescription}\n`);
await writeFile(join(directory, "02-listing/metadata.json"), JSON.stringify({ version: manifest.version, title: primary.title, shortDescription: primary.shortDescription, ...metadata, localizedListings: listings.map(({ locale, title, shortDescription }) => ({ locale, title, shortDescription, descriptionFile: `description-${locale}.txt` })) }, null, 2) + "\n");
await copyFile(join(source, "discovery-notes-ru.md"), join(directory, "02-listing/discovery-notes-ru.md"));
await writeFile(join(directory, "04-review/reviewer-instructions-en.txt"), `${reviewer}\n`);
const dataNames = { websiteContent: "Website content", webHistory: "Web history", userActivity: "User activity", personallyIdentifiableInformation: "Personally identifiable information", healthInformation: "Health information", financialAndPaymentInformation: "Financial and payment information", authenticationInformation: "Authentication information", personalCommunications: "Personal communications", location: "Location" };
const privacyAnswers = [
  "SINGLE PURPOSE", metadata.singlePurpose,
  ...Object.entries(metadata.permissions).flatMap(([name, value]) => [`\n${name.toUpperCase()} JUSTIFICATION`, value]),
  "\nREMOTE CODE: No, I am not using remote code.", metadata.remoteCode.explanation,
  "\nDATA USAGE (local handling is disclosed)",
  ...Object.entries(dataNames).map(([key, label]) => `${metadata.dataUse[key] ? "[x]" : "[ ]"} ${label}`),
  metadata.dataUse.explanation,
  "\nCERTIFICATIONS", ...metadata.certifications.map(value => `[x] ${value}`),
  "\nPRIVACY POLICY URL", "Publish 05-privacy/privacy-policy.html at your own public HTTPS URL, then paste the real URL into the dashboard. A local file path is not a public policy URL.",
  "\nSources", ...Object.values(metadata.sources)
].join("\n\n");
await writeFile(join(directory, "04-review/privacy-practices.txt"), `${privacyAnswers}\n`);
await writeFile(join(directory, "05-privacy/privacy-policy.md"), `${policy}\n`);
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const paragraphs = policy.split(/\n\s*\n/).map(value => value.startsWith("# ")
  ? `<h1>${escape(value.slice(2))}</h1>` : `<p>${escape(value.replaceAll("\n", " "))}</p>`).join("\n");
const policyHtml = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Политика конфиденциальности Bridge</title><style>body{margin:0;background:#f6f5f0;color:#182238;font:17px/1.7 Arial,sans-serif}main{max-width:850px;margin:40px auto;padding:40px;background:white;border:1px solid #dfe3ec;border-radius:16px}h1{font-size:32px;line-height:1.2;letter-spacing:-1px}h2{font-size:21px}a{color:#294ac8}footer{margin-top:32px;border-top:1px solid #dde2eb;padding-top:20px;font-size:14px;color:#5f6c81}@media(max-width:600px){main{margin:0;padding:24px;border:0;border-radius:0}h1{font-size:27px}}</style></head><body><main>${paragraphs}<footer><h2>Издатель и контакт</h2><p data-publisher>Издатель Bridge, указанный в карточке Chrome Web Store.</p><p data-contact>Публичный email поддержки, указанный в карточке расширения.</p></footer></main></body></html>`;
await writeFile(join(directory, "05-privacy/privacy-policy.html"), policyHtml);
await writeFile(join(directory, "05-privacy/README_RU.md"), `# Публичная политика\n\nТекст и HTML готовы. По желанию добавьте своё имя/email через форму в START_HERE.html и скачайте персонализированный HTML.\n\nРазместите HTML на своём сайте или статическом хостинге. Например, в публичном репозитории GitHub положите его как index.html, включите Settings → Pages → Deploy from a branch → main / root и дождитесь выдачи адреса хостингом. Другой вариант — публичная страница Google Sites с текстом из privacy-policy.md.\n\nОткройте итоговый HTTPS-адрес в инкогнито без входа. Только этот реальный адрес вставляйте в Privacy policy URL. Ссылка на локальный файл или закрытый репозиторий не подходит.\n\nВ карточке магазина должны быть ваш настоящий издатель и действующий публичный email поддержки. Эти сведения не придуманы и не опубликованы автоматически.\n`);
await copyFile(join(source, "publishing-guide-ru.md"), join(directory, "README_RU.md"));
const screenshotInfo = [
  ["01-subtitles-to-voice.png", "01 · Субтитры становятся голосом"],
  ["02-language-controls.png", "02 · Исходный язык и язык результата"],
  ["03-voice-library.png", "03 · Отдельная установка голосов"],
  ["04-original-volume.png", "04 · Громкость и приглушение оригинала"],
  ["05-personal-settings.png", "05 · Настройки и поддерживаемые площадки"]
];
const replacements = {
  VERSION: manifest.version,
  LISTINGS: listings.map(({ locale, title, shortDescription, description }) => `<div id="listing-${locale}"><h3>${locale === "en" ? "English (en) — основной язык" : "Русский (ru) — перевод карточки"}</h3><div class="grid"><div class="field"><label for="title-${locale}">Название / Title</label><textarea id="title-${locale}" lang="${locale}" rows="2" readonly>${escape(title)}</textarea><button data-copy="title-${locale}">Скопировать</button></div><div class="field"><label for="short-${locale}">Короткое описание / Summary · ${shortDescription.length} символов</label><textarea id="short-${locale}" lang="${locale}" rows="2" readonly>${escape(shortDescription)}</textarea><button data-copy="short-${locale}">Скопировать</button></div></div><div class="field"><label for="description-${locale}">Подробное описание / Detailed description</label><textarea id="description-${locale}" lang="${locale}" rows="15" readonly>${escape(description)}</textarea><button data-copy="description-${locale}">Скопировать описание ${locale.toUpperCase()}</button></div></div>`).join(""),
  PURPOSE: escape(metadata.singlePurpose), REMOTE: escape(metadata.remoteCode.explanation),
  DATA_USE: escape(metadata.dataUse.explanation), REVIEWER: escape(reviewer), DATE: "26 октября 2026 года",
  SCREENSHOTS: screenshotInfo.map(([file, caption]) => `<a href="03-images/screenshots/${file}" target="_blank"><img src="03-images/screenshots/${file}" alt="${caption}"><span>${caption}</span></a>`).join(""),
  PERMISSIONS: Object.entries(metadata.permissions).map(([name, value]) => `<details><summary>${name === "hostAccess" ? "Host access / доступ к видеоплеерам" : name}</summary><div class="field"><textarea id="permission-${name}" rows="6" readonly>${escape(value)}</textarea><button data-copy="permission-${name}">Скопировать</button></div></details>`).join(""),
  CERTIFICATIONS: metadata.certifications.map(value => `<li>${escape(value)}</li>`).join(""),
  POLICY_JSON: JSON.stringify(policyHtml).replaceAll("<", "\\u003c")
};
const template = await readFile(join(source, "handoff-template.html"), "utf8");
const handoff = template.replace(/%%([A-Z_]+)%%/g, (_, name) => { assert.ok(name in replacements, name); return replacements[name]; });
assert.ok(!/%%[A-Z_]+%%/.test(handoff));
await writeFile(join(directory, "START_HERE.html"), handoff);

function pngHeader(bytes) {
  assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "PNG signature");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
}
const images = [];
for (const [file, width, height, alpha] of [
  ...screenshotInfo.map(([name]) => [`screenshots/${name}`, 1280, 800, false]),
  ["icon-128.png", 128, 128, true], ["promo-440x280.png", 440, 280, false], ["marquee-1400x560.png", 1400, 560, false]
]) {
  const actual = pngHeader(await readFile(join(directory, "03-images", file)));
  assert.equal(actual.width, width); assert.equal(actual.height, height);
  assert.equal(actual.colorType, alpha ? 6 : 2, `${file}: expected ${alpha ? "RGBA" : "RGB"}`);
  images.push({ file: `03-images/${file}`, ...actual });
}
const archiveEntries = execFileSync("unzip", ["-Z1", join(directory, "01-upload", upload)], { encoding: "utf8" }).trim().split("\n");
assert.ok(archiveEntries.includes("manifest.json")); assert.ok(!archiveEntries.some(file => file.endsWith(".onnx")));
const archiveManifest = JSON.parse(execFileSync("unzip", ["-p", join(directory, "01-upload", upload), "manifest.json"], { encoding: "utf8" }));
assert.equal(archiveManifest.version, manifest.version); assert.equal(archiveManifest.name, manifest.name);
for (const { locale } of listings) assert.ok(archiveEntries.includes(`_locales/${locale}/messages.json`), `${locale}: locale missing from upload ZIP`);
const report = { version: manifest.version, title: primary.title, defaultLocale: manifest.default_locale, locales: listings.map(({ locale, title, shortDescription, description }) => ({ locale, title, shortDescriptionLength: shortDescription.length, detailedDescriptionLength: description.length })), shortDescriptionLength: primary.shortDescription.length, detailedDescriptionLength: primary.description.length, extensionZip: `01-upload/${upload}`, manifestAtZipRoot: true, acousticModelsBundled: false, images, publicationPerformed: false, requiredPublisherActions: ["Google publisher account/contact details", "public HTTPS privacy-policy URL", "dashboard upload and review submission"], sourcesChecked: metadata.sources };
await writeFile(join(directory, "validation-report.json"), JSON.stringify(report, null, 2) + "\n");
async function files(folder) {
  const result = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) result.push(...await files(path)); else result.push(path);
  }
  return result;
}
const hashes = [];
for (const path of (await files(directory)).sort()) hashes.push(`${createHash("sha256").update(await readFile(path)).digest("hex")}  ${relative(directory, path)}`);
await writeFile(join(directory, "SHA256SUMS.txt"), `${hashes.join("\n")}\n`);
const kitArchive = join(root, "dist", `${kitName}.zip`);
await rm(kitArchive, { force: true });
execFileSync("zip", ["-r", "-q", "-6", kitArchive, kitName, "-x", "*.DS_Store"], { cwd: join(root, "dist"), stdio: "inherit" });
execFileSync("unzip", ["-tq", kitArchive], { stdio: "inherit" });
await writeFile(`${kitArchive}.sha256`, `${createHash("sha256").update(await readFile(kitArchive)).digest("hex")}  ${kitName}.zip\n`);
console.log(`Комплект: ${kitArchive}\nНачните с: ${join(directory, "START_HERE.html")}`);
