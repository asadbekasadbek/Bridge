import { createReadStream } from "node:fs";
import { readFile, mkdir, stat, writeFile, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareVendor } from "./prepare-vendor.mjs";

await prepareVendor({ check: true });

const root = new URL("../extension/", import.meta.url);
async function sha256(path) { const hash = createHash("sha256"); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest("hex"); }
const lock = JSON.parse(await readFile(new URL("voices/assets.lock.json", root), "utf8"));
for (const file of lock.files) {
  const path = fileURLToPath(new URL(file.path, root));
  if ((await stat(path)).size !== file.bytes || await sha256(path) !== file.sha256) throw new Error(`Повреждён файл пакета: ${file.path}`);
}
const { version } = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
const dist = new URL("../dist/", import.meta.url);
await mkdir(dist, { recursive: true });
const archive = fileURLToPath(new URL(`bridge-${version}-lite.zip`, dist));
try { await unlink(archive); } catch (error) { if (error.code !== "ENOENT") throw error; }
execFileSync("zip", ["-r", "-q", "-6", archive, ".", "-x", "*.DS_Store", "*.onnx"], { cwd: fileURLToPath(root), stdio: "inherit" });
execFileSync("unzip", ["-tq", archive], { stdio: "inherit" });
await writeFile(`${archive}.sha256`, `${await sha256(archive)}  bridge-${version}-lite.zip\n`);
console.log(`Готовый пакет: ${archive} (${((await stat(archive)).size / 1024 / 1024).toFixed(1)} МиБ).`);
