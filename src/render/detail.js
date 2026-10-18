// src/render/detail.js
//
// The "Rich" art layer (M10). Everything here is extra decoration drawn on top
// of the basic building shapes: furniture glowing in windows, curtains, shop
// signs, roof props (antennas, tanks, air-conditioners), street lamps and
// trees. It only reads game state and never changes it.
//
// It is skipped in battery-saver graphics, and when zoomed out too far to see it
// (config.world.richMinZoom).

import { roundedRectPath, shade } from './facilities.js';
import { mixToHex } from './color.js';

// A repeatable pseudo-random number from any number (same input, same result).
const hash = (n) => {
  const x = Math.sin(n * 91.7 + 17.3) * 43758.5453;
  return x - Math.floor(x);
};

function box(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.fill();
}

function dot(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

const CURTAINS = ['#c9697a', '#6aa6c9', '#d6b25e', '#8bbf7f', '#a98bd0'];
const SHOP_GOODS = ['#e86a5c', '#f2c14e', '#5aa9e6', '#7bc47f', '#c58ae8'];

// ---- Facility tiles -------------------------------------------------------

// Called for each floor tile after the basic drawing. `parts` carries the
// colors the basic drawing used: { color, accent, dark } (already night-dimmed).
export function richFacility(ctx, kind, typeId, def, x, y, w, h, cellPx, look, parts) {
  if (def.transport || def.vertical) return; // stairs, escalators and shafts stay clean
  const night = look.dark;
  const lit = look.lit * night; // how much interior light shows right now
  const cells = Math.max(1, Math.round(w / cellPx));
  const seed = (look.id ?? 1) * 7 + (look.tileIndex ?? 0);

  // Light from above, shadow below, and a floor slab line.
  ctx.fillStyle = `rgba(255,255,255,${0.1 * (1 - night * 0.7)})`;
  ctx.fillRect(x, y, w, Math.max(1, h * 0.07));
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fillRect(x, y + h * 0.9, w, h * 0.1);
  ctx.fillStyle = shade(parts.color, 0.4);
  ctx.fillRect(x, y + h - Math.max(1, h * 0.035), w, Math.max(1, h * 0.035));

  if (kind === 'office') {
    for (let i = 0; i < cells; i++) {
      const wx = x + i * cellPx + cellPx * 0.12;
      const wy = y + h * 0.26;
      const ww = cellPx * 0.76;
      const wh = h * 0.46;
      // desk and monitor
      box(ctx, wx + ww * 0.15, wy + wh * 0.78, ww * 0.7, wh * 0.14, 1, 'rgba(30,38,50,0.5)');
      box(ctx, wx + ww * 0.3, wy + wh * 0.5, ww * 0.22, wh * 0.28, 1, lit > 0.2 ? `rgba(170,230,255,${0.5 + lit * 0.5})` : 'rgba(30,38,50,0.55)');
      // blinds on some windows
      if (hash(seed + i) > 0.5) {
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        for (let b = 0; b < 3; b++) ctx.fillRect(wx, wy + wh * (0.08 + b * 0.13), ww, Math.max(1, wh * 0.05));
      }
    }
    // a small rooftop sign strip on the parapet
    box(ctx, x + w * 0.4, y + h * 0.045, w * 0.2, h * 0.04, 1, shade(parts.accent, 0.1));
  } else if (kind === 'apartment') {
    for (let i = 0; i < cells; i++) {
      const cx = x + i * cellPx + cellPx / 2;
      const ww = cellPx * 0.42;
      const wy = y + h * 0.2;
      const wh = h * 0.5;
      const curtain = CURTAINS[Math.floor(hash(seed + i * 3) * CURTAINS.length)];
      // curtains hang at both sides of the window
      box(ctx, cx - ww / 2, wy + ww * 0.45, ww * 0.26, wh - ww * 0.45, 1, curtain);
      box(ctx, cx + ww / 2 - ww * 0.26, wy + ww * 0.45, ww * 0.26, wh - ww * 0.45, 1, curtain);
      if (lit > 0.2) dot(ctx, cx, wy + wh * 0.42, ww * 0.55, `rgba(255,214,140,${0.28 * lit})`); // lamp glow
      // a potted plant on the balcony
      if (hash(seed + i * 5) > 0.45) {
        const px = cx + cellPx * 0.2;
        box(ctx, px - cellPx * 0.05, wy + wh - h * 0.03, cellPx * 0.1, h * 0.07, 1, '#9a6b43');
        dot(ctx, px, wy + wh - h * 0.06, cellPx * 0.08, '#4f9d69');
      }
    }
  } else if (kind === 'shop') {
    const winX = x + w * 0.06;
    const winY = y + h * 0.5;
    const winW = w * 0.88;
    const winH = h * 0.38;
    ctx.fillStyle = shade(parts.color, 0.3); // shelf
    ctx.fillRect(winX, winY + winH * 0.78, winW, Math.max(1, winH * 0.08));
    const goods = Math.max(2, Math.round(winW / (cellPx * 0.5)));
    for (let g = 0; g < goods; g++) {
      const gw = winW / goods;
      box(ctx, winX + g * gw + gw * 0.2, winY + winH * 0.4, gw * 0.6, winH * 0.38, 1, SHOP_GOODS[Math.floor(hash(seed + g) * SHOP_GOODS.length)]);
    }
    // neon sign: glows after dark
    const sx = x + w * 0.5;
    const sy = y + h * 0.44;
    if (lit > 0.1) dot(ctx, sx, sy, h * 0.16, `rgba(255,90,130,${0.22 * lit})`);
    box(ctx, sx - w * 0.1, sy - h * 0.04, w * 0.2, h * 0.08, h * 0.04, lit > 0.1 ? '#ff6b8f' : shade(parts.accent, 0.2));
  } else if (kind === 'hotel') {
    for (let i = 0; i < cells; i++) {
      const dx = x + i * cellPx + cellPx * 0.2;
      box(ctx, dx + cellPx * 0.2, y + h * 0.2, cellPx * 0.2, h * 0.06, 1, 'rgba(255,255,255,0.55)'); // door number plate
      if (lit > 0.2) dot(ctx, dx + cellPx * 0.3, y + h * 0.5, cellPx * 0.3, `rgba(255,214,140,${0.24 * lit})`);
    }
  } else if (kind === 'service') {
    // vents, rivets and a hazard strip along the base
    const panels = Math.max(1, Math.round(w / (cellPx * 1.5)));
    for (let p = 0; p < panels; p++) {
      const px = x + (w / panels) * p + w * 0.03;
      const pw = w / panels - w * 0.06;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      for (let v = 0; v < 3; v++) ctx.fillRect(px + pw * 0.15, y + h * (0.22 + v * 0.06), pw * 0.7, Math.max(1, h * 0.02));
      for (const [rx, ry] of [[0.08, 0.2], [0.92, 0.2], [0.08, 0.76], [0.92, 0.76]]) dot(ctx, px + pw * rx, y + h * ry, Math.max(0.8, h * 0.015), 'rgba(255,255,255,0.45)');
    }
    for (let s = 0; s < w; s += h * 0.2) {
      ctx.fillStyle = (s / (h * 0.2)) % 2 < 1 ? '#e6b93a' : '#2b2f36';
      ctx.fillRect(x + s, y + h * 0.9, Math.min(h * 0.1, w - s), h * 0.08);
    }
  } else if (kind === 'lobby') {
    // checkered floor, plants between the glass panels, and a clock over the door
    const tile = h * 0.06;
    for (let s = 0, i = 0; s < w; s += tile, i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
      ctx.fillRect(x + s, y + h * 0.92, Math.min(tile, w - s), h * 0.06);
    }
    for (let i = 3; i < cells; i += 4) {
      const px = x + i * cellPx;
      box(ctx, px - cellPx * 0.06, y + h * 0.7, cellPx * 0.12, h * 0.16, 1, '#9a6b43');
      dot(ctx, px, y + h * 0.62, cellPx * 0.14, '#4f9d69');
      dot(ctx, px - cellPx * 0.08, y + h * 0.68, cellPx * 0.09, '#5fb07a');
    }
    if (look.isMain) {
      const cx = x + w / 2;
      const cy = y + h * 0.06;
      const r = Math.max(2, h * 0.055);
      dot(ctx, cx, cy, r, '#f4efe0');
      ctx.strokeStyle = '#3a4a57';
      ctx.lineWidth = Math.max(1, r * 0.25);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - r * 0.7);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r * 0.5, cy);
      ctx.stroke();
    }
  }
}

// A soft warm halo around a lit building at night.
export function drawGlow(ctx, x, y, w, h, night, lit) {
  const a = 0.1 * night * lit;
  if (a < 0.01) return;
  const pad = Math.max(2, h * 0.08);
  ctx.fillStyle = `rgba(255,206,110,${a})`;
  roundedRectPath(ctx, x - pad, y - pad, w + pad * 2, h + pad * 2, h * 0.2);
  ctx.fill();
}

// ---- Roofs -----------------------------------------------------------------

// Which facilities have nothing above them (so their roof is open sky)?
// Cached per tower.version, because it only changes when something is built.
export function roofIds(tower, facilityAt, cache) {
  if (cache.version === tower.version && cache.ids) return cache.ids;
  const ids = new Set();
  for (const f of tower.facilities.values()) {
    let covered = false;
    for (let c = f.cell; c < f.cell + f.width && !covered; c++) {
      if (facilityAt(tower, f.floor + f.height, c)) covered = true;
    }
    if (!covered) ids.add(f.id);
  }
  cache.version = tower.version;
  cache.ids = ids;
  return ids;
}

// Props standing on a roof. (x, topY) is the roof's top-left corner on screen.
export function drawRoofProps(ctx, f, def, x, topY, w, floorPx, cellPx, night, seconds) {
  if (def.transport || def.vertical) return;
  const seed = f.id * 13;
  const base = topY + 1;
  const dim = (c) => mixToHex(c, '#101828', night * 0.55);
  const kind = Math.floor(hash(seed) * 4);

  // an air-conditioner box on most roofs
  if (hash(seed + 1) > 0.25) {
    const bx = x + w * (0.1 + hash(seed + 2) * 0.55);
    const bw = Math.max(cellPx * 0.7, w * 0.15);
    box(ctx, bx, base - floorPx * 0.2, bw, floorPx * 0.2, 2, dim('#8b97a3'));
    dot(ctx, bx + bw * 0.5, base - floorPx * 0.1, floorPx * 0.06, dim('#5c6773'));
  }
  const px = x + w * (0.62 + hash(seed + 3) * 0.28);
  if (kind === 0) {
    // radio antenna with a blinking red light
    ctx.strokeStyle = dim('#6b7682');
    ctx.lineWidth = Math.max(1, floorPx * 0.03);
    ctx.beginPath();
    ctx.moveTo(px, base);
    ctx.lineTo(px, base - floorPx * 0.8);
    ctx.moveTo(px - floorPx * 0.1, base - floorPx * 0.55);
    ctx.lineTo(px + floorPx * 0.1, base - floorPx * 0.55);
    ctx.stroke();
    if (Math.floor(seconds * 1.5 + f.id) % 2 === 0) {
      dot(ctx, px, base - floorPx * 0.82, Math.max(1.5, floorPx * 0.045), '#ff4d4d');
      if (night > 0.3) dot(ctx, px, base - floorPx * 0.82, floorPx * 0.14, `rgba(255,77,77,${0.3 * night})`);
    }
  } else if (kind === 1) {
    // water tank on legs
    const tw = floorPx * 0.32;
    ctx.strokeStyle = dim('#5c4a3a');
    ctx.lineWidth = Math.max(1, floorPx * 0.03);
    ctx.beginPath();
    ctx.moveTo(px - tw * 0.4, base);
    ctx.lineTo(px - tw * 0.4, base - floorPx * 0.18);
    ctx.moveTo(px + tw * 0.4, base);
    ctx.lineTo(px + tw * 0.4, base - floorPx * 0.18);
    ctx.stroke();
    box(ctx, px - tw / 2, base - floorPx * 0.48, tw, floorPx * 0.3, floorPx * 0.06, dim('#a47c58'));
    box(ctx, px - tw / 2 - 1, base - floorPx * 0.5, tw + 2, floorPx * 0.05, 1, dim('#6e5238'));
  } else if (kind === 2) {
    // satellite dish
    ctx.strokeStyle = dim('#6b7682');
    ctx.lineWidth = Math.max(1, floorPx * 0.03);
    ctx.beginPath();
    ctx.moveTo(px, base);
    ctx.lineTo(px, base - floorPx * 0.2);
    ctx.stroke();
    ctx.fillStyle = dim('#dfe6ec');
    ctx.beginPath();
    ctx.ellipse(px, base - floorPx * 0.3, floorPx * 0.17, floorPx * 0.11, -0.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // a little rooftop garden
    box(ctx, px - floorPx * 0.25, base - floorPx * 0.1, floorPx * 0.5, floorPx * 0.1, 2, dim('#8a6a4a'));
    for (let i = 0; i < 3; i++) dot(ctx, px - floorPx * 0.14 + i * floorPx * 0.14, base - floorPx * 0.16, floorPx * 0.09, dim('#4f9d69'));
  }
}

// ---- Street ----------------------------------------------------------------

// Lamp posts, trees and bushes along the ground, outside the tower's footprint.
export function drawStreetProps(ctx, W, camera, config, tower, facilityAt, groundY, night, seasonIndex, snow) {
  const zoom = camera.zoom;
  const { cellWidth, floorHeight } = config.grid;
  const cellPx = cellWidth * zoom;
  const floorPx = floorHeight * zoom;
  const half = tower.plot.halfWidthCells + 14;
  const firstCol = Math.max(-half, Math.floor((camera.x - W / 2 / zoom) / cellWidth) - 1);
  const lastCol = Math.min(half, Math.ceil((camera.x + W / 2 / zoom) / cellWidth) + 1);
  const toX = (cell) => (cell * cellWidth - camera.x) * zoom + W / 2;
  const leaf = snow ? '#e8eef4' : seasonIndex === 2 ? '#c7782e' : seasonIndex === 3 ? '#9fb7a8' : '#3f8f5c';
  const leafColor = mixToHex(leaf, config.sky.nightTint, Math.min(1, night * config.sky.nightDimStrength));
  const trunk = mixToHex('#7b5a3c', config.sky.nightTint, Math.min(1, night * config.sky.nightDimStrength));

  for (let c = firstCol; c <= lastCol; c++) {
    if (facilityAt(tower, 0, c) || facilityAt(tower, 0, c - 1) || facilityAt(tower, 0, c + 1)) continue; // keep the lobby area clear
    const x = toX(c + 0.5);
    const kind = c % 6 === 0 ? 'lamp' : Math.abs(c) % 5 === 2 ? 'tree' : Math.abs(c) % 7 === 4 ? 'bush' : null;
    if (!kind) continue;
    if (kind === 'lamp') {
      const poleH = floorPx * 0.85;
      ctx.strokeStyle = mixToHex('#4a5560', config.sky.nightTint, night * 0.5);
      ctx.lineWidth = Math.max(1.5, zoom * 1.6);
      ctx.beginPath();
      ctx.moveTo(x, groundY);
      ctx.lineTo(x, groundY - poleH);
      ctx.lineTo(x + floorPx * 0.12, groundY - poleH - floorPx * 0.04);
      ctx.stroke();
      const hx = x + floorPx * 0.12;
      const hy = groundY - poleH - floorPx * 0.04;
      if (night > 0.3) {
        const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, floorPx * 0.9);
        g.addColorStop(0, `rgba(255,226,150,${0.55 * night})`);
        g.addColorStop(1, 'rgba(255,226,150,0)');
        ctx.fillStyle = g;
        ctx.fillRect(hx - floorPx, hy - floorPx * 0.9, floorPx * 2, floorPx * 2);
      }
      dot(ctx, hx, hy, Math.max(1.8, floorPx * 0.05), night > 0.3 ? '#fff0b8' : '#c8d0d8');
    } else if (kind === 'tree') {
      const th = floorPx * (0.7 + 0.25 * ((Math.abs(c) % 3) / 2));
      ctx.fillStyle = trunk;
      ctx.fillRect(x - floorPx * 0.035, groundY - th * 0.5, floorPx * 0.07, th * 0.5 + 1);
      dot(ctx, x, groundY - th * 0.7, th * 0.3, leafColor);
      dot(ctx, x - th * 0.2, groundY - th * 0.52, th * 0.2, leafColor);
      dot(ctx, x + th * 0.2, groundY - th * 0.52, th * 0.2, leafColor);
    } else {
      ctx.fillStyle = leafColor;
      ctx.beginPath();
      ctx.ellipse(x, groundY - floorPx * 0.07, floorPx * 0.2, floorPx * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---- Underground ---------------------------------------------------------------

// The earth below the lawn: darker with depth, in layers, with things buried in it.
// Deterministic: the same spot always holds the same treasure.
export function drawDirt(ctx, W, H, camera, config, groundY, night, seconds) {
  const zoom = camera.zoom;
  const { cellWidth, floorHeight } = config.grid;
  const floorPx = floorHeight * zoom;
  const dim = Math.min(1, night * config.sky.nightDimStrength);
  const grassPx = config.world.grassHeight * zoom;
  const top = groundY + grassPx;
  if (top > H) return;

  // layers of earth, getting darker the deeper you go
  const floors = Math.ceil((H - groundY) / floorPx) + 1;
  for (let d = 0; d < floors; d++) {
    const y0 = groundY + d * floorPx;
    if (y0 > H) break;
    const shade = Math.min(0.5, 0.05 + d * 0.045);
    ctx.fillStyle = `rgba(30,16,6,${shade})`;
    ctx.fillRect(0, Math.max(top, y0), W, floorPx + 1);
    if (d % 3 === 1) {
      ctx.fillStyle = 'rgba(255,236,200,0.05)'; // a pale seam of sand
      ctx.fillRect(0, y0 + floorPx * 0.35, W, Math.max(1, floorPx * 0.12));
    }
  }

  // things buried in it (too small to see, and too many to draw, when zoomed far out)
  if (zoom < 0.6) return;
  const firstCol = Math.floor((camera.x - W / 2 / zoom) / cellWidth) - 1;
  const lastCol = Math.ceil((camera.x + W / 2 / zoom) / cellWidth) + 1;
  const toX = (wx) => (wx - camera.x) * zoom + W / 2;
  const s = zoom; // one world unit in pixels
  ctx.save();
  ctx.globalAlpha = 1 - dim * 0.45;
  for (let d = 0; d < floors; d++) {
    const y0 = groundY + d * floorPx;
    if (y0 > H) break;
    for (let c = firstCol; c <= lastCol; c++) {
      const seed = c * 131 + (d + 1) * 17;
      if (hash(seed) > 0.3) continue;
      const x = toX((c + 0.15 + hash(seed + 1) * 0.7) * cellWidth);
      const y = y0 + floorPx * (0.25 + hash(seed + 2) * 0.55) + (d === 0 ? grassPx : 0);
      if (y > H) continue;
      const r = hash(seed + 3);
      const deep = d >= 2;
      if (r < 0.2) rock(ctx, x, y, s, seed);
      else if (r < 0.32) {
        if (d === 0) root(ctx, x, top, s);
        else rock(ctx, x, y, s * 0.7, seed);
      } else if (r < 0.43) worm(ctx, x, y, s, seconds, seed);
      else if (r < 0.52) bone(ctx, x, y, s, seed);
      else if (r < 0.61) {
        if (deep) fossil(ctx, x, y, s);
        else rock(ctx, x, y, s * 0.8, seed);
      } else if (r < 0.69) pipe(ctx, x, y, s);
      else if (r < 0.77) gem(ctx, x, y, s, seconds, seed);
      else if (r < 0.83) nugget(ctx, x, y, s, seconds, seed);
      else if (r < 0.88) coin(ctx, x, y, s);
      else if (r < 0.92) bottle(ctx, x, y, s, seed);
      else if (r < 0.96) {
        if (deep) chest(ctx, x, y, s);
        else rock(ctx, x, y, s, seed);
      } else mole(ctx, x, d === 0 ? top : y, s, seconds, seed);
    }
  }
  ctx.restore();
}

function rock(ctx, x, y, s, seed) {
  const n = 1 + Math.floor(hash(seed + 5) * 3);
  for (let i = 0; i < n; i++) {
    const ox = (i - (n - 1) / 2) * 7 * s;
    const rw = (4 + hash(seed + i) * 5) * s;
    ctx.fillStyle = i % 2 ? '#8b8277' : '#a29a8d';
    ctx.beginPath();
    ctx.ellipse(x + ox, y + (i % 2) * 2 * s, rw, rw * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(x + ox - rw * 0.25, y + (i % 2) * 2 * s - rw * 0.25, rw * 0.35, rw * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function root(ctx, x, top, s) {
  ctx.strokeStyle = '#6a4a2a';
  ctx.lineWidth = Math.max(1, 2 * s);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.bezierCurveTo(x - 8 * s, top + 10 * s, x + 9 * s, top + 16 * s, x - 3 * s, top + 26 * s);
  ctx.moveTo(x - 2 * s, top + 8 * s);
  ctx.quadraticCurveTo(x - 10 * s, top + 12 * s, x - 12 * s, top + 20 * s);
  ctx.stroke();
}

function worm(ctx, x, y, s, seconds, seed) {
  const t = seconds * 2 + hash(seed) * 10;
  ctx.strokeStyle = '#d98a8a';
  ctx.lineWidth = Math.max(1.4, 2.4 * s);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 8; i++) {
    const px = x + (i - 4) * 2.4 * s;
    const py = y + Math.sin(i * 0.9 + t) * 2.2 * s;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

function bone(ctx, x, y, s, seed) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((hash(seed + 9) - 0.5) * 1.2);
  ctx.fillStyle = '#efe8d6';
  ctx.fillRect(-7 * s, -1.1 * s, 14 * s, 2.2 * s);
  for (const sx of [-7, 7]) {
    for (const sy of [-1.5, 1.5]) {
      ctx.beginPath();
      ctx.arc(sx * s, sy * s, 1.9 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function fossil(ctx, x, y, s) {
  ctx.fillStyle = 'rgba(185,171,140,0.25)';
  ctx.beginPath();
  ctx.arc(x, y, 7.5 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#b9ab8c';
  ctx.lineWidth = Math.max(1, 1.8 * s);
  ctx.beginPath();
  for (let a = 0; a < 11; a += 0.25) {
    const r = (0.5 + a * 0.55) * s;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (a === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

function pipe(ctx, x, y, s) {
  ctx.fillStyle = '#6b7480';
  ctx.fillRect(x - 12 * s, y - 2.6 * s, 24 * s, 5.2 * s);
  ctx.fillStyle = '#4e5762';
  for (const px of [-12, -1, 10]) ctx.fillRect(x + px * s, y - 3.4 * s, 2.2 * s, 6.8 * s);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(x - 11 * s, y - 2 * s, 22 * s, 1 * s);
}

function gem(ctx, x, y, s, seconds, seed) {
  const color = ['#5ad1e6', '#e65aa0', '#7be08a', '#b58cff'][Math.floor(hash(seed + 7) * 4)];
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - 4.5 * s);
  ctx.lineTo(x + 4 * s, y);
  ctx.lineTo(x, y + 4.5 * s);
  ctx.lineTo(x - 4 * s, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.moveTo(x, y - 4.5 * s);
  ctx.lineTo(x + 2 * s, y - 1 * s);
  ctx.lineTo(x - 2 * s, y - 1 * s);
  ctx.closePath();
  ctx.fill();
  twinkle(ctx, x + 4 * s, y - 4 * s, s, seconds, seed);
}

function nugget(ctx, x, y, s, seconds, seed) {
  ctx.fillStyle = '#e6b93a';
  ctx.beginPath();
  ctx.ellipse(x, y, 5 * s, 3.4 * s, 0.3, 0, Math.PI * 2);
  ctx.ellipse(x + 3.5 * s, y + 1 * s, 3 * s, 2.4 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillRect(x - 2 * s, y - 2 * s, 2 * s, 1 * s);
  twinkle(ctx, x - 5 * s, y - 4 * s, s, seconds, seed);
}

function coin(ctx, x, y, s) {
  ctx.fillStyle = '#d9b348';
  ctx.beginPath();
  ctx.arc(x, y, 4 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#a98320';
  ctx.lineWidth = Math.max(0.8, 0.9 * s);
  ctx.stroke();
  ctx.fillStyle = '#a98320';
  ctx.fillRect(x - 0.6 * s, y - 2 * s, 1.2 * s, 4 * s);
}

function bottle(ctx, x, y, s, seed) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((hash(seed + 4) - 0.5) * 2);
  ctx.fillStyle = 'rgba(90,170,120,0.85)';
  ctx.fillRect(-2.6 * s, -3 * s, 5.2 * s, 8 * s);
  ctx.fillRect(-1.1 * s, -7 * s, 2.2 * s, 4.2 * s);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(-1.6 * s, -2 * s, 1 * s, 6 * s);
  ctx.restore();
}

function chest(ctx, x, y, s) {
  ctx.fillStyle = '#7b4a24';
  ctx.fillRect(x - 8 * s, y - 3 * s, 16 * s, 8 * s);
  ctx.beginPath();
  ctx.arc(x, y - 3 * s, 8 * s, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#d9b348';
  ctx.fillRect(x - 8.4 * s, y - 0.5 * s, 16.8 * s, 1.6 * s);
  ctx.fillRect(x - 1.4 * s, y - 2 * s, 2.8 * s, 3.6 * s);
}

function mole(ctx, x, top, s, seconds, seed) {
  // pops its head out of a little mound now and then
  const t = (seconds / 5 + hash(seed)) % 1;
  const up = t < 0.3 ? Math.sin((t / 0.3) * Math.PI) : 0;
  ctx.fillStyle = '#6b4a2a';
  ctx.beginPath();
  ctx.ellipse(x, top + 1 * s, 7 * s, 3 * s, 0, Math.PI, 0);
  ctx.fill();
  if (up > 0.05) {
    const hy = top - up * 5 * s;
    ctx.fillStyle = '#56483e';
    ctx.beginPath();
    ctx.arc(x, hy, 4.2 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e6a0a0';
    ctx.beginPath();
    ctx.arc(x + 3.2 * s, hy + 0.6 * s, 1.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 1 * s, hy - 1.8 * s, 1.2 * s, 1.2 * s);
  }
}

function twinkle(ctx, x, y, s, seconds, seed) {
  const k = (Math.sin(seconds * 3 + hash(seed) * 20) + 1) / 2;
  if (k < 0.6) return;
  ctx.strokeStyle = `rgba(255,255,255,${(k - 0.6) * 2.5})`;
  ctx.lineWidth = Math.max(0.8, 0.9 * s);
  ctx.beginPath();
  ctx.moveTo(x - 2.5 * s, y);
  ctx.lineTo(x + 2.5 * s, y);
  ctx.moveTo(x, y - 2.5 * s);
  ctx.lineTo(x, y + 2.5 * s);
  ctx.stroke();
}
