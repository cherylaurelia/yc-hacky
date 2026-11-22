// Decodes the QR code in a PNG (a still, or a frame pulled from an MP4) and checks it says the expected URL.
//   node scripts/check-qr.mjs <frame.png> <expected-url>      (run from video/)
// Exits 1 when no code is found or it decodes to something else.
import { readFile } from "node:fs/promises";
import jsQR from "jsqr";
import { PNG } from "pngjs";

const [file, expected] = process.argv.slice(2);
if (!file || !expected) {
  console.error("usage: node scripts/check-qr.mjs <frame.png> <expected-url>");
  process.exit(2);
}
const png = PNG.sync.read(await readFile(file));
const hit = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
if (!hit) {
  console.error(`${file}: no QR code found`);
  process.exit(1);
}
if (hit.data !== expected) {
  console.error(`${file}: decoded ${JSON.stringify(hit.data)}, expected ${JSON.stringify(expected)}`);
  process.exit(1);
}
console.log(`${file}: QR decodes to ${hit.data}`);
