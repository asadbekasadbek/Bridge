import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildPiperLoader, prepareVendor } from "../scripts/prepare-vendor.mjs";

test("патч Piper воспроизводим, восстанавливается после переустановки и отклоняет неизвестную версию", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bridge-vendor-")), root = pathToFileURL(`${directory}/`);
  try {
    const original = await readFile(new URL("../extension/licenses/sources/piper_phonemize.original.js", import.meta.url), "utf8");
    for (const path of ["licenses/sources/", "voices/", "vendor/piper/"]) await mkdir(new URL(path, root), { recursive: true });
    await writeFile(new URL("licenses/sources/piper_phonemize.original.js", root), original);
    await writeFile(new URL("voices/assets.lock.json", root), await readFile(new URL("../extension/voices/assets.lock.json", import.meta.url)));
    await prepareVendor({ root }); await prepareVendor({ root, check: true });
    const target = new URL("vendor/piper/phonemize.mjs", root), expected = buildPiperLoader(original);
    assert.equal(await readFile(target, "utf8"), expected);
    // Simulate replacing the vendor directory with unmodified upstream files.
    await writeFile(target, original);
    await assert.rejects(prepareVendor({ root, check: true }), /не подготовлен/);
    await prepareVendor({ root }); await prepareVendor({ root });
    assert.equal(await readFile(target, "utf8"), expected);
    await rm(target); await prepareVendor({ root });
    assert.equal(await readFile(target, "utf8"), expected);
    assert.throws(() => buildPiperLoader(`${original}\n`), /Исходный Piper изменился/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
