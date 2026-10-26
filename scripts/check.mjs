import assert from "node:assert/strict";
import { readdir, readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import "../extension/platforms/catalogue.js";
import { prepareVendor } from "./prepare-vendor.mjs";
import { readManifestLocales } from "./store-locales.mjs";

await prepareVendor({ check: true });

const root = new URL("../extension/", import.meta.url);
const { manifest, locales } = await readManifestLocales(root);
assert.equal(manifest.default_locale, "en");
assert.deepEqual(locales.map(item => item.locale), ["en", "ru"]);
const project = JSON.parse(await readFile(new URL("../package.json", root), "utf8"));
assert.equal(manifest.version, project.version, "Версии проекта и расширения должны совпадать");
assert.equal(manifest.manifest_version, 3);
assert.deepEqual([...manifest.permissions].sort(), ["offscreen", "storage", "tts"]);
assert.equal(manifest.host_permissions, undefined, "Дополнительный сетевой доступ не нужен");
assert.deepEqual(manifest.content_scripts[0].matches, ["https://www.youtube.com/*", "https://youtube.com/*"]);
const supported = new Set();
for (const entry of manifest.content_scripts) for (const match of entry.matches) {
  const site = globalThis.BridgePlatforms.fromUrl(match.replace("://*.", "://tenant.").replace(/\/\*$/, "/"));
  assert.ok(site, `Недопустимый доступ к сайту: ${match}`);
  if (site.id !== "youtube") assert.equal(entry.all_frames, true, "Встроенный плеер должен получать контент-скрипт");
  supported.add(site.id);
}
assert.equal(supported.size, globalThis.BridgePlatforms.sites.length);
assert.equal(manifest.web_accessible_resources.length, 1);
assert.deepEqual(manifest.web_accessible_resources[0].resources, ["youtube/controls.css"]);
assert.deepEqual(manifest.web_accessible_resources[0].matches, manifest.content_scripts[1].matches);
assert.ok(manifest.content_security_policy.extension_pages.includes("connect-src 'self'"));
assert.ok(manifest.content_security_policy.extension_pages.includes("'wasm-unsafe-eval'"));
assert.ok(!manifest.content_security_policy.extension_pages.includes("'unsafe-eval'"));
assert.equal(manifest.cross_origin_embedder_policy?.value, "require-corp");
assert.equal(manifest.cross_origin_opener_policy?.value, "same-origin");
for (const path of ["speech/offscreen.html", "speech/worker.js", "vendor/ort/ort-wasm-simd-threaded.wasm", "vendor/piper/phonemize.wasm", "vendor/piper/phonemize.data", "licenses/espeak-ng-GPL-3.0.txt"]) await access(new URL(path, root));
const paths = [manifest.background.service_worker, manifest.action.default_popup, manifest.options_ui.page, ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon), ...manifest.content_scripts.flatMap((entry) => [...entry.js, ...entry.css])];
for (const path of paths) await access(new URL(path, root));
async function checkDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(entry.name, directory);
    if (entry.isDirectory()) { await checkDirectory(new URL(`${entry.name}/`, directory)); continue; }
    assert.ok(!entry.name.endsWith('.onnx'), "Акустическая модель не должна входить в основной пакет");
    if (/\.m?js$/.test(entry.name)) execFileSync(process.execPath, ["--check", fileURLToPath(url)]);
    if (entry.name.endsWith(".html")) {
      const html = await readFile(url, "utf8");
      assert.ok(!/\son\w+\s*=|<script\b(?![^>]*\bsrc=)[^>]*>/i.test(html), `Inline JavaScript недопустим: ${entry.name}`);
      for (const [, resource] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
        assert.ok(!/^(?:https?:)?\/\//i.test(resource), "Все ресурсы должны быть локальными");
        await access(new URL(resource, url));
      }
    }
  }
}
await checkDirectory(root);
console.log("Manifest, разрешения, локальные ресурсы и синтаксис JavaScript: OK.");
