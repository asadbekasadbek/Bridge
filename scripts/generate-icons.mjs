import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

// Small raster extension icons generated with built-in Node APIs, no packages.
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}
function distanceToSegment(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}
const segments = [[[30, 53], [30, 85]], [[98, 53], [98, 85]], [[25, 87], [103, 87]], [[53, 73], [53, 85]], [[75, 73], [75, 85]]];
for (let step = 0; step < 40; step++) {
  const point = (t) => [30 + 68 * t, 75 - 31 * 4 * t * (1 - t)];
  segments.push([point(step / 40), point((step + 1) / 40)]);
}
function png(size) {
  const inset = size === 128 ? 16 : 0;
  const artworkSize = size - inset * 2;
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sum = [0, 0, 0, 0];
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const px = (x + (sx + 0.5) / 4 - inset) / artworkSize * 128;
      const py = (y + (sy + 0.5) / 4 - inset) / artworkSize * 128;
      const inside = Math.hypot(Math.max(Math.abs(px - 64) - 31, 0), Math.max(Math.abs(py - 64) - 31, 0)) <= 31;
      if (!inside) continue;
      const white = segments.some(([a, b]) => distanceToSegment(px, py, a, b) < 4.1);
      const color = white ? [255, 255, 255] : [56, 86, 246];
      sum[0] += color[0]; sum[1] += color[1]; sum[2] += color[2]; sum[3] += 255;
    }
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    const alpha = sum[3] / 16;
    for (let c = 0; c < 3; c++) pixels[offset + c] = alpha ? Math.round(sum[c] / (sum[3] / 255)) : 0;
    pixels[offset + 3] = Math.round(alpha);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}
const directory = new URL("../extension/icons/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const size of [16, 32, 48, 128]) await writeFile(new URL(`${size}.png`, directory), png(size));
console.log("Иконки расширения готовы.");
