// src/render/facilities.js
//
// Vector (code-drawn) art for each facility type. Everything is built from
// Canvas paths, so it stays crisp at any zoom. Each type has its own color
// family AND its own window shape, so you can tell them apart even when the
// tower is zoomed far out:
//   lobby     - stone color, tall glass panels, a doorway
//   office    - blue, wide rectangular windows
//   apartment - orange, arched windows with little balconies
//   cafe      - green, striped scalloped awning and a coffee cup

import { mixToHex } from './color.js';
import { richFacility } from './detail.js';
import { drawRoom, drawHall, ROOM_KINDS } from './rooms.js';

// Warning triangle shown on facilities that no stairs or elevator reaches.
// (Shape + "!" so it is readable without relying on color.)
export function drawNoAccessBadge(ctx, x, y, w, h) {
  const s = Math.max(10, Math.min(h * 0.5, w * 0.4, 22));
  const cx = x + s * 0.8;
  const cy = y + s * 0.75;
  ctx.fillStyle = '#f2b134';
  ctx.strokeStyle = '#7a4b00';
  ctx.lineWidth = Math.max(1, s * 0.08);
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.5);
  ctx.lineTo(cx + s * 0.55, cy + s * 0.45);
  ctx.lineTo(cx - s * 0.55, cy + s * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#4a2c00';
  ctx.font = `800 ${s * 0.6}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', cx, cy + s * 0.12);
  ctx.textAlign = 'start';
}

// Flames along the bottom of a burning unit; they grow and flicker with the
// fire's strength (0-100).
export function drawFlames(ctx, x, y, w, h, intensity, seconds) {
  const n = Math.max(2, Math.round(w / (h * 0.55)));
  const power = 0.35 + (Math.min(100, intensity) / 100) * 0.65;
  ctx.save();
  roundedRectPath(ctx, x, y, w, h, h * 0.1);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,90,20,0.28)';
  ctx.fillRect(x, y, w, h);
  for (let layer = 0; layer < 2; layer++) {
    ctx.fillStyle = layer === 0 ? '#ff5a1f' : '#ffd23f';
    for (let i = 0; i < n; i++) {
      const bx = x + ((i + 0.5) * w) / n;
      const flick = 0.75 + 0.25 * Math.sin(seconds * 9 + i * 1.7 + layer);
      const fh = h * 0.85 * power * flick * (layer === 0 ? 1 : 0.62);
      const fw = (w / n) * (layer === 0 ? 0.62 : 0.34);
      ctx.beginPath();
      ctx.moveTo(bx - fw, y + h);
      ctx.quadraticCurveTo(bx - fw * 0.9, y + h - fh * 0.55, bx + Math.sin(seconds * 6 + i) * fw * 0.3, y + h - fh);
      ctx.quadraticCurveTo(bx + fw * 0.9, y + h - fh * 0.55, bx + fw, y + h);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

// A swarm of small dark bugs on a pest-ridden unit.
export function drawPests(ctx, x, y, w, h, seconds) {
  ctx.save();
  ctx.fillStyle = 'rgba(95,140,40,0.22)';
  roundedRectPath(ctx, x, y, w, h, h * 0.1);
  ctx.fill();
  ctx.fillStyle = '#2d2a1f';
  const n = Math.max(4, Math.round(w / (h * 0.35)));
  for (let i = 0; i < n; i++) {
    const bx = x + ((i * 0.618 + 0.1) % 1) * w + Math.sin(seconds * 3 + i) * h * 0.08;
    const by = y + h * (0.25 + ((i * 0.37) % 0.6)) + Math.cos(seconds * 2.6 + i * 2) * h * 0.06;
    ctx.beginPath();
    ctx.ellipse(bx, by, h * 0.05, h * 0.035, Math.sin(seconds + i), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// A unit shut for repairs after a fire.
export function drawClosed(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(18,22,32,0.6)';
  roundedRectPath(ctx, x, y, w, h, h * 0.1);
  ctx.fill();
  drawIcon(ctx, 'wrench', x + w / 2, y + h / 2, Math.min(h * 0.28, w * 0.3), '#ffd166');
  ctx.restore();
}

// Tiny water drops along the roof line of a building with sprinklers.
export function drawSprinklers(ctx, x, y, w, h) {
  ctx.fillStyle = '#5ab4e8';
  const n = Math.max(2, Math.round(w / (h * 0.6)));
  for (let i = 0; i < n; i++) {
    const sx = x + ((i + 0.5) * w) / n;
    ctx.beginPath();
    ctx.arc(sx, y + h * 0.07, Math.max(1.5, h * 0.035), 0, Math.PI * 2);
    ctx.fill();
  }
}

// A little rubbish bin on the top-right corner of a unit that is getting dirty.
export function drawTrashBadge(ctx, x, y, w, h, level) {
  const s = Math.max(9, Math.min(h * 0.42, 18));
  const cx = x + w - s * 0.8;
  const cy = y + s * 0.8;
  ctx.fillStyle = level > 85 ? '#a8302b' : '#5c6b78';
  roundedRectPath(ctx, cx - s * 0.4, cy - s * 0.25, s * 0.8, s * 0.75, s * 0.12);
  ctx.fill();
  ctx.fillRect(cx - s * 0.5, cy - s * 0.42, s, s * 0.14); // lid
  ctx.fillRect(cx - s * 0.14, cy - s * 0.55, s * 0.28, s * 0.14); // handle
  ctx.strokeStyle = '#e8edf2';
  ctx.lineWidth = Math.max(1, s * 0.08);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.15, cy - s * 0.05);
  ctx.lineTo(cx - s * 0.15, cy + s * 0.35);
  ctx.moveTo(cx + s * 0.15, cy - s * 0.05);
  ctx.lineTo(cx + s * 0.15, cy + s * 0.35);
  ctx.stroke();
}

export function roundedRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Small vector pictograms for signs. `s` is the icon's half-size in pixels.
export function drawIcon(ctx, name, cx, cy, s, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, s * 0.28);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const rr = (x, y, w, h, r) => {
    roundedRectPath(ctx, x, y, w, h, r);
    ctx.fill();
  };
  switch (name) {
    case 'cup':
      ctx.beginPath();
      ctx.moveTo(cx - s, cy - s * 0.7);
      ctx.lineTo(cx + s, cy - s * 0.7);
      ctx.lineTo(cx + s * 0.7, cy + s * 0.8);
      ctx.lineTo(cx - s * 0.7, cy + s * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + s, cy, s * 0.45, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      break;
    case 'fork':
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.5, cy - s);
      ctx.lineTo(cx - s * 0.5, cy);
      ctx.moveTo(cx - s * 0.1, cy - s);
      ctx.lineTo(cx - s * 0.1, cy);
      ctx.moveTo(cx + s * 0.3, cy - s);
      ctx.lineTo(cx + s * 0.3, cy);
      ctx.moveTo(cx - s * 0.5, cy);
      ctx.quadraticCurveTo(cx - s * 0.1, cy + s * 0.3, cx + s * 0.3, cy);
      ctx.moveTo(cx - s * 0.1, cy + s * 0.2);
      ctx.lineTo(cx - s * 0.1, cy + s);
      ctx.stroke();
      break;
    case 'bag':
      rr(cx - s * 0.8, cy - s * 0.3, s * 1.6, s * 1.2, s * 0.2);
      ctx.beginPath();
      ctx.arc(cx, cy - s * 0.3, s * 0.45, Math.PI, 0);
      ctx.stroke();
      break;
    case 'film':
      rr(cx - s * 0.9, cy - s * 0.6, s * 1.8, s * 1.3, s * 0.15);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 3; i++) ctx.fillRect(cx - s * 0.75 + i * s * 0.6, cy - s * 0.45, s * 0.35, s * 0.3);
      break;
    case 'note':
      ctx.beginPath();
      ctx.arc(cx - s * 0.35, cy + s * 0.55, s * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.05, cy + s * 0.5);
      ctx.lineTo(cx + s * 0.05, cy - s * 0.8);
      ctx.lineTo(cx + s * 0.7, cy - s * 0.4);
      ctx.stroke();
      break;
    case 'cross':
      rr(cx - s * 0.3, cy - s, s * 0.6, s * 2, s * 0.15);
      rr(cx - s, cy - s * 0.3, s * 2, s * 0.6, s * 0.15);
      break;
    case 'shield':
      ctx.beginPath();
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx + s * 0.85, cy - s * 0.6);
      ctx.lineTo(cx + s * 0.75, cy + s * 0.2);
      ctx.quadraticCurveTo(cx + s * 0.5, cy + s * 0.8, cx, cy + s);
      ctx.quadraticCurveTo(cx - s * 0.5, cy + s * 0.8, cx - s * 0.75, cy + s * 0.2);
      ctx.lineTo(cx - s * 0.85, cy - s * 0.6);
      ctx.closePath();
      ctx.fill();
      break;
    case 'wrench':
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.7, cy + s * 0.7);
      ctx.lineTo(cx + s * 0.25, cy - s * 0.25);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + s * 0.45, cy - s * 0.45, s * 0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'recycle':
      for (let i = 0; i < 3; i++) {
        const a = (i * 2 * Math.PI) / 3 - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.8, a + 0.2, a + 1.8);
        ctx.stroke();
        const ex = cx + Math.cos(a + 1.8) * s * 0.8;
        const ey = cy + Math.sin(a + 1.8) * s * 0.8;
        ctx.beginPath();
        ctx.arc(ex, ey, s * 0.28, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'bolt':
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.2, cy - s);
      ctx.lineTo(cx - s * 0.6, cy + s * 0.15);
      ctx.lineTo(cx - s * 0.05, cy + s * 0.15);
      ctx.lineTo(cx - s * 0.25, cy + s);
      ctx.lineTo(cx + s * 0.6, cy - s * 0.2);
      ctx.lineTo(cx + s * 0.05, cy - s * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'car':
      rr(cx - s, cy - s * 0.1, s * 2, s * 0.7, s * 0.2);
      rr(cx - s * 0.6, cy - s * 0.65, s * 1.2, s * 0.65, s * 0.25);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - s * 0.55, cy + s * 0.65, s * 0.28, 0, Math.PI * 2);
      ctx.arc(cx + s * 0.55, cy + s * 0.65, s * 0.28, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'dumbbell':
      rr(cx - s * 0.9, cy - s * 0.55, s * 0.35, s * 1.1, s * 0.1);
      rr(cx + s * 0.55, cy - s * 0.55, s * 0.35, s * 1.1, s * 0.1);
      rr(cx - s * 0.55, cy - s * 0.15, s * 1.1, s * 0.3, s * 0.1);
      break;
    case 'bed':
      rr(cx - s, cy - s * 0.1, s * 2, s * 0.55, s * 0.15);
      rr(cx - s, cy - s * 0.6, s * 0.28, s * 1.2, s * 0.1);
      ctx.beginPath();
      ctx.arc(cx - s * 0.45, cy - s * 0.2, s * 0.25, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'star':
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? s : s * 0.45;
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    default:
  }
  ctx.restore();
}

// Darkens a "#rrggbb" color by `amount` (0..1) for trims and shadows.
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amount));
  const g = Math.round(((n >> 8) & 255) * (1 - amount));
  const b = Math.round((n & 255) * (1 - amount));
  return `rgb(${r},${g},${b})`;
}

// x,y = top-left on screen; w,h = size in screen pixels; cellPx = one cell's width.
// look = { isMain, dark, lit, sky }:
//   isMain - the original lobby (it gets the front doors)
//   dark   - 0 (day) .. 1 (night): dims the building
//   lit    - 0..1: how strongly windows glow once it is dark (occupied = 1)
//   sky    - config.sky (night tint / glow colors)
export function drawFacility(ctx, typeId, def, x, y, w, h, cellPx, detailed, look) {
  const { isMain, dark: night, lit, sky } = look;
  const dim = Math.min(1, night * sky.nightDimStrength);
  const color = mixToHex(def.color, sky.nightTint, dim);
  let accent = mixToHex(def.accent, sky.nightTint, Math.min(1, dim * 1.2));
  if (lit > 0) accent = mixToHex(accent, sky.windowGlow, Math.min(1, night * lit * 1.3));

  const inset = Math.max(0.5, h * 0.015);
  x += inset;
  y += inset;
  w -= inset * 2;
  h -= inset * 2;

  // The top tile of the Crown is drawn as a crown shape, with sky showing between the points.
  const crownTop = def.style === 'crown' && (look.tileIndex ?? 0) === (look.tileTotal ?? 1) - 1;
  const kind = def.style ?? typeId; // facilities of one style share a drawing

  // Cutaway view (at every zoom): look straight into the furnished room instead of at its facade.
  // The room pictures are cached, so this is cheap even when zoomed far out.
  if (look.cutaway && ROOM_KINDS.has(kind) && !def.transport && !crownTop) {
    drawRoom(ctx, kind, typeId, def, x, y, w, h, look);
    return;
  }

  if (!(crownTop && detailed)) {
    ctx.fillStyle = color;
    roundedRectPath(ctx, x, y, w, h, h * 0.12);
    ctx.fill();
  }
  if (!detailed) return;

  const dark = shade(color, 0.25);
  const cells = Math.max(1, Math.round(w / cellPx));

  // Stairs and escalators stand inside a hall of their own in the cutaway view.
  if (look.cutaway && (typeId === 'stairs' || typeId === 'escalator')) drawHall(ctx, x, y, w, h, look);

  if (kind === 'office') {
    ctx.fillStyle = dark; // roof parapet
    roundedRectPath(ctx, x, y, w, h * 0.12, h * 0.06);
    ctx.fill();
    for (let i = 0; i < cells; i++) {
      const wx = x + i * cellPx + cellPx * 0.12;
      const wy = y + h * 0.26;
      ctx.fillStyle = accent;
      roundedRectPath(ctx, wx, wy, cellPx * 0.76, h * 0.46, h * 0.05);
      ctx.fill();
      ctx.fillStyle = shade(accent, 0.18); // window mullion
      ctx.fillRect(wx + cellPx * 0.37, wy, Math.max(1, cellPx * 0.02), h * 0.46);
    }
  } else if (kind === 'apartment') {
    if (def.icon) drawIcon(ctx, def.icon, x + w / 2, y + h * 0.09, h * 0.07, accent); // e.g. penthouse star
    for (let i = 0; i < cells; i++) {
      const cx = x + i * cellPx + cellPx / 2;
      const ww = cellPx * 0.42;
      const wy = y + h * 0.2;
      const wh = h * 0.5;
      ctx.fillStyle = accent; // arched window
      ctx.beginPath();
      ctx.moveTo(cx - ww / 2, wy + wh);
      ctx.lineTo(cx - ww / 2, wy + ww / 2);
      ctx.arc(cx, wy + ww / 2, ww / 2, Math.PI, 0);
      ctx.lineTo(cx + ww / 2, wy + wh);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = dark; // balcony rail
      roundedRectPath(ctx, cx - cellPx * 0.3, wy + wh, cellPx * 0.6, h * 0.08, h * 0.03);
      ctx.fill();
    }
  } else if (kind === 'shop') {
    const awningH = h * 0.3;
    const stripe = cellPx / 2;
    const stripes = Math.ceil(w / stripe);
    ctx.save();
    roundedRectPath(ctx, x, y, w, h, h * 0.12);
    ctx.clip();
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? accent : dark;
      const sx = x + i * stripe;
      const sw = Math.min(stripe, x + w - sx);
      ctx.fillRect(sx, y, sw, awningH);
      ctx.beginPath(); // scalloped edge
      ctx.arc(sx + sw / 2, y + awningH, sw / 2, 0, Math.PI);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = shade(accent, 0.08); // shop window
    roundedRectPath(ctx, x + w * 0.06, y + h * 0.5, w * 0.88, h * 0.38, h * 0.06);
    ctx.fill();
    drawIcon(ctx, def.icon ?? 'cup', x + w / 2, y + h * 0.69, h * 0.12, shade(color, 0.45));
  } else if (kind === 'hotel') {
    // Rows of balcony doors with a bed (or star) sign.
    for (let i = 0; i < cells; i++) {
      const dx = x + i * cellPx + cellPx * 0.2;
      ctx.fillStyle = accent;
      roundedRectPath(ctx, dx, y + h * 0.3, cellPx * 0.6, h * 0.5, h * 0.05);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.fillRect(dx - cellPx * 0.04, y + h * 0.62, cellPx * 0.68, h * 0.05); // rail
    }
    ctx.fillStyle = dark;
    roundedRectPath(ctx, x + w / 2 - h * 0.2, y + h * 0.04, h * 0.4, h * 0.22, h * 0.05);
    ctx.fill();
    drawIcon(ctx, def.icon ?? 'bed', x + w / 2, y + h * 0.15, h * 0.075, accent);
  } else if (kind === 'service') {
    // A sturdy block with a big icon; services read as "utility" at a glance.
    ctx.fillStyle = dark;
    ctx.fillRect(x, y + h * 0.88, w, h * 0.12); // base strip
    const panels = Math.max(1, Math.round(w / (cellPx * 1.5)));
    for (let i = 0; i < panels; i++) {
      ctx.fillStyle = shade(accent, 0.05);
      roundedRectPath(ctx, x + (w / panels) * i + w * 0.03, y + h * 0.16, w / panels - w * 0.06, h * 0.64, h * 0.07);
      ctx.fill();
    }
    drawIcon(ctx, def.icon ?? 'cross', x + w / 2, y + h * 0.48, Math.min(h * 0.3, w * 0.28), shade(color, 0.15));
  } else if (kind === 'atrium') {
    // Tall glass with a tree: one floor tile of a multi-floor garden.
    ctx.fillStyle = accent;
    for (let i = 0; i < cells; i++) {
      roundedRectPath(ctx, x + i * cellPx + cellPx * 0.1, y + h * 0.08, cellPx * 0.8, h * 0.84, h * 0.06);
      ctx.fill();
    }
    ctx.fillStyle = '#7b5a3c';
    ctx.fillRect(x + w / 2 - h * 0.03, y + h * 0.55, h * 0.06, h * 0.37);
    ctx.fillStyle = '#4f9d69';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.42, h * 0.26, 0, Math.PI * 2);
    ctx.arc(x + w / 2 - h * 0.18, y + h * 0.55, h * 0.16, 0, Math.PI * 2);
    ctx.arc(x + w / 2 + h * 0.18, y + h * 0.55, h * 0.16, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'crown') {
    const top = (look.tileIndex ?? 0) === (look.tileTotal ?? 1) - 1;
    if (top) {
      // The crown itself: a band with five tall points and jewels.
      const baseY = y + h * 0.5;
      ctx.fillStyle = color;
      roundedRectPath(ctx, x, baseY, w, h * 0.5, h * 0.08);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, baseY + h * 0.05);
      const points = 5;
      for (let i = 0; i < points; i++) {
        const px = x + (w * (i + 0.5)) / points;
        ctx.lineTo(x + (w * i) / points + w / points / 2 - w / points / 2, baseY);
        ctx.lineTo(px, y + (i === 2 ? 0 : h * 0.12));
        ctx.lineTo(x + (w * (i + 1)) / points, baseY);
      }
      ctx.closePath();
      ctx.fill();
      for (let i = 0; i < points; i++) {
        const px = x + (w * (i + 0.5)) / points;
        ctx.fillStyle = i === 2 ? '#e0405a' : '#fffbe0';
        ctx.beginPath();
        ctx.arc(px, y + (i === 2 ? 0 : h * 0.12), h * (i === 2 ? 0.09 : 0.06), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#e0405a';
      ctx.beginPath();
      ctx.arc(x + w / 2, baseY + h * 0.25, h * 0.11, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Gold hall below it: columns and arched windows.
      for (let i = 0; i < cells; i++) {
        const cx = x + i * cellPx + cellPx / 2;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.moveTo(cx - cellPx * 0.22, y + h * 0.88);
        ctx.lineTo(cx - cellPx * 0.22, y + h * 0.35);
        ctx.arc(cx, y + h * 0.35, cellPx * 0.22, Math.PI, 0);
        ctx.lineTo(cx + cellPx * 0.22, y + h * 0.88);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = dark;
      ctx.fillRect(x, y + h * 0.9, w, h * 0.1);
    }
  } else if (typeId === 'escalator') {
    // A diagonal belt with chevrons; flips every other floor like stairs.
    const flip = (look.tileIndex ?? 0) % 2 === 1;
    const left = x + w * 0.12;
    const right = x + w * 0.88;
    const base = y + h * 0.9;
    const topY = y + h * 0.14;
    const mx = (v) => (flip ? left + right - v : v);
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(2, h * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(mx(left), base - h * 0.04);
    ctx.lineTo(mx(right), topY + h * 0.04);
    ctx.stroke();
    ctx.strokeStyle = shade(color, 0.05);
    ctx.lineWidth = Math.max(1, h * 0.04);
    for (let i = 1; i <= 4; i++) {
      const u = i / 5;
      const px = left + (right - left) * u;
      const py = base - (base - topY) * u;
      ctx.beginPath();
      ctx.moveTo(mx(px - w * 0.03), py + h * 0.05);
      ctx.lineTo(mx(px + w * 0.02), py - h * 0.05);
      ctx.stroke();
    }
  } else if (typeId === 'stairs') {
    // A flight of steps; every other floor mirrors it so a column zigzags.
    const flip = (look.tileIndex ?? 0) % 2 === 1;
    const left = x + w * 0.12;
    const right = x + w * 0.88;
    const base = y + h * 0.92;
    const topY = y + h * 0.14;
    const mx = (v) => (flip ? left + right - v : v);
    const steps = 6;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(mx(left), base);
    for (let i = 0; i < steps; i++) {
      const ty = base - ((base - topY) * (i + 1)) / steps;
      ctx.lineTo(mx(left + ((right - left) * i) / steps), ty);
      ctx.lineTo(mx(left + ((right - left) * (i + 1)) / steps), ty);
    }
    ctx.lineTo(mx(right), base);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shade(color, 0.5); // handrail
    ctx.lineWidth = Math.max(1, h * 0.04);
    ctx.beginPath();
    ctx.moveTo(mx(left), base - h * 0.2);
    ctx.lineTo(mx(right), topY - h * 0.04);
    ctx.stroke();
  } else if (def.transport === 'elevator' && def.serviceOnly) {
    // Staff shaft: dark panel with hazard stripes (tenants cannot use it).
    ctx.fillStyle = shade(color, 0.5);
    roundedRectPath(ctx, x + w * 0.12, y + h * 0.06, w * 0.76, h * 0.9, h * 0.06);
    ctx.fill();
    ctx.save();
    roundedRectPath(ctx, x + w * 0.12, y + h * 0.06, w * 0.76, h * 0.9, h * 0.06);
    ctx.clip();
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(2, h * 0.09);
    ctx.beginPath();
    for (let i = -h; i < w + h; i += h * 0.28) {
      ctx.moveTo(x + i, y + h);
      ctx.lineTo(x + i + h * 0.6, y);
    }
    ctx.stroke();
    ctx.restore();
  } else if (def.transport === 'elevator') {
    if (look.isStop === false) {
      // No door on this floor: the shaft is just a wall here.
      ctx.fillStyle = shade(color, 0.12);
      roundedRectPath(ctx, x + w * 0.12, y + h * 0.06, w * 0.76, h * 0.9, h * 0.06);
      ctx.fill();
      ctx.strokeStyle = shade(color, 0.3);
      ctx.lineWidth = Math.max(1, h * 0.04);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.18, y + h * 0.5);
      ctx.lineTo(x + w * 0.82, y + h * 0.5);
      ctx.stroke();
    } else {
      // Dark shaft opening with a frame; the car is drawn separately on top.
      ctx.fillStyle = shade(color, 0.55);
      roundedRectPath(ctx, x + w * 0.12, y + h * 0.06, w * 0.76, h * 0.9, h * 0.06);
      ctx.fill();
      ctx.strokeStyle = shade(color, 0.2);
      ctx.lineWidth = Math.max(1, h * 0.05);
      ctx.stroke();
      if (look.express) {
        // Express shafts carry a double chevron so you can tell them apart.
        ctx.strokeStyle = accent;
        ctx.lineWidth = Math.max(1.2, h * 0.05);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const dy of [0.2, 0.3]) {
          ctx.beginPath();
          ctx.moveTo(x + w * 0.42, y + h * (dy + 0.07));
          ctx.lineTo(x + w * 0.5, y + h * dy);
          ctx.lineTo(x + w * 0.58, y + h * (dy + 0.07));
          ctx.stroke();
        }
      }
    }
  } else if (typeId === 'skylobby') {
    ctx.fillStyle = shade(color, 0.25); // base strip
    ctx.fillRect(x, y + h * 0.88, w, h * 0.12);
    for (let i = 0; i < cells; i++) {
      ctx.fillStyle = accent; // tall glass panes
      roundedRectPath(ctx, x + i * cellPx + cellPx * 0.12, y + h * 0.14, cellPx * 0.76, h * 0.7, h * 0.05);
      ctx.fill();
      if (i % 2 === 1) {
        // a potted plant in front of every second pane
        const px = x + i * cellPx + cellPx * 0.5;
        ctx.fillStyle = '#9a6b43';
        ctx.fillRect(px - cellPx * 0.1, y + h * 0.66, cellPx * 0.2, h * 0.18);
        ctx.fillStyle = '#4f9d69';
        ctx.beginPath();
        ctx.arc(px, y + h * 0.58, cellPx * 0.17, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = shade(color, 0.45); // sign over the middle
    roundedRectPath(ctx, x + w / 2 - cellPx * 0.9, y + h * 0.04, cellPx * 1.8, h * 0.12, h * 0.05);
    ctx.fill();
  } else if (typeId === 'lobby') {
    ctx.fillStyle = dark; // base strip
    ctx.fillRect(x, y + h * 0.88, w, h * 0.12);
    for (let i = 0; i < cells; i++) {
      ctx.fillStyle = accent; // tall glass panels
      roundedRectPath(ctx, x + i * cellPx + cellPx * 0.14, y + h * 0.16, cellPx * 0.72, h * 0.66, h * 0.05);
      ctx.fill();
    }
    if (isMain) {
      const doorW = cellPx * 1.6;
      const dx = x + w / 2 - doorW / 2;
      ctx.fillStyle = dark; // canopy
      roundedRectPath(ctx, dx - cellPx * 0.2, y + h * 0.1, doorW + cellPx * 0.4, h * 0.12, h * 0.05);
      ctx.fill();
      ctx.fillStyle = '#3a4a57'; // doorway
      roundedRectPath(ctx, dx, y + h * 0.26, doorW, h * 0.62, h * 0.06);
      ctx.fill();
      ctx.fillStyle = accent; // two door panes
      ctx.fillRect(dx + doorW * 0.06, y + h * 0.3, doorW * 0.41, h * 0.54);
      ctx.fillRect(dx + doorW * 0.53, y + h * 0.3, doorW * 0.41, h * 0.54);
    }
  }

  // Rich art: furniture, curtains, signs and other small details (src/render/detail.js).
  if (look.rich) richFacility(ctx, kind, typeId, def, x, y, w, h, cellPx, look, { color, accent, dark });
}
