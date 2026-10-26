import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

// Resolve the same metadata that Chrome reads, rather than publishing literal
// __MSG_...__ placeholders or maintaining a second set of store titles.
export async function readManifestLocales(extensionRoot) {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", extensionRoot), "utf8"));
  assert.ok(manifest.default_locale, "A default locale is required for localized store metadata");
  const directory = new URL("_locales/", extensionRoot);
  const names = (await readdir(directory, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name);
  assert.ok(names.includes(manifest.default_locale), "The default locale must have messages.json");
  names.sort((a, b) => Number(b === manifest.default_locale) - Number(a === manifest.default_locale) || a.localeCompare(b));
  const messages = new Map(await Promise.all(names.map(async locale => [locale, JSON.parse(await readFile(new URL(`${locale}/messages.json`, directory), "utf8"))])));
  const fallback = messages.get(manifest.default_locale);
  const locales = names.map(locale => {
    const resolve = value => {
      assert.ok(typeof value === "string" && value.trim(), `${locale}: missing manifest text`);
      return value.replace(/__MSG_(\w+)__/g, (_, key) => {
        const message = messages.get(locale)[key]?.message ?? fallback[key]?.message;
        assert.ok(typeof message === "string" && message.trim(), `${locale}: missing message ${key}`);
        return message;
      });
    };
    const title = resolve(manifest.name), shortDescription = resolve(manifest.description), actionTitle = resolve(manifest.action.default_title);
    assert.ok(title.length > 0 && title.length <= 75, `${locale}: store title length`);
    assert.ok(shortDescription.length > 0 && shortDescription.length <= 132, `${locale}: store summary length`);
    assert.ok(!/__MSG_/.test(`${title} ${shortDescription} ${actionTitle}`), `${locale}: unresolved message`);
    return { locale, title, shortDescription, actionTitle };
  });
  return { manifest, locales };
}
