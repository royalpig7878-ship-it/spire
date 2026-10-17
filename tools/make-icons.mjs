// tools/make-icons.mjs
//
// Draws SPIRE's app icon and saves it as PNG files (192, 512 and the 180 px
// size iPhones use). It builds the picture pixel by pixel and writes the PNG
// format by hand, so it needs nothing installed beyond Node itself.
//
// Run it from the project folder with:   node tools/make-icons.mjs

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 8 bits per channel
  header[9] = 6; // RGBA
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0; // no filter
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// The picture: night-to-dusk sky, a stack of lit windows, a golden crown, grass.
function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, [r, g, b], a = 1) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = px[i] * (1 - a) + r * a;
    px[i + 1] = px[i + 1] * (1 - a) + g * a;
    px[i + 2] = px[i + 2] * (1 - a) + b * a;
    px[i + 3] = 255;
  };
  const rect = (x0, y0, w, h, c) => {
    for (let y = Math.round(y0); y < Math.round(y0 + h); y++) for (let x = Math.round(x0); x < Math.round(x0 + w); x++) set(x, y, c);
  };
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const u = size / 100; // everything is drawn on a 100 x 100 grid

  // sky gradient
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) set(x, y, mix([34, 52, 110], [240, 148, 98], y / size));
  // grass
  rect(0, 86 * u, size, 14 * u, [92, 160, 84]);
  // tower body
  rect(34 * u, 30 * u, 32 * u, 58 * u, [66, 112, 190]);
  rect(34 * u, 30 * u, 32 * u, 3.5 * u, [44, 78, 140]);
  // windows
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 3; col++) {
      const lit = (row * 3 + col) % 4 !== 1;
      rect((38.5 + col * 9.5) * u, (37 + row * 7.4) * u, 6 * u, 4.6 * u, lit ? [255, 222, 130] : [150, 190, 235]);
    }
  }
  // door
  rect(46 * u, 80 * u, 8 * u, 8 * u, [40, 52, 74]);
  // crown
  const gold = [236, 186, 40];
  rect(36 * u, 22 * u, 28 * u, 8 * u, gold);
  for (let i = 0; i < 5; i++) {
    const cx = (38 + i * 6) * u;
    const tip = i === 2 ? 11 * u : 15 * u;
    for (let y = Math.round(tip); y < 22 * u; y++) {
      const half = ((y - tip) / (22 * u - tip)) * 3.4 * u;
      for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) set(x, y, gold);
    }
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 4) set(Math.round(cx + dx * u * 0.6), Math.round(tip + dy * u * 0.6), i === 2 ? [224, 64, 90] : [255, 251, 224]);
  }
  return px;
}

mkdirSync('icons', { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(`icons/${name}`, encodePng(size, drawIcon(size)));
  console.log('wrote icons/' + name);
}
