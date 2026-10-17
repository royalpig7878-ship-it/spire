// src/render/elevators.js
//
// Draws what is happening around elevator shafts: call buttons (lit when
// pressed), people waiting in line, and the cars themselves with sliding
// doors and riders inside. Reads the elevator state; never changes it.

import { roundedRectPath } from './facilities.js';
import { mixToHex } from './color.js';

const MOOD_COLORS = { calm: '#4a90d9', impatient: '#f0a830', stressed: '#e0503c' };

function moodOf(waitedSec, ec) {
  if (waitedSec >= ec.stressedAfterSec) return 'stressed';
  if (waitedSec >= ec.impatientAfterSec) return 'impatient';
  return 'calm';
}

// A tiny stylized person: round head, simple body. Not-calm moods also get
// a "!" bubble so mood never depends on color alone.
function drawFigure(ctx, cx, baseY, size, color, mood) {
  ctx.fillStyle = color;
  roundedRectPath(ctx, cx - size * 0.17, baseY - size * 0.56, size * 0.34, size * 0.56, size * 0.1);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, baseY - size * 0.72, size * 0.17, 0, Math.PI * 2);
  ctx.fill();
  if (mood !== 'calm' && size > 9) {
    const r = size * 0.14;
    const by = baseY - size * 1.05;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, by, r * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mood === 'stressed' ? '#c0392b' : '#b9770e';
    ctx.font = `700 ${Math.max(7, r * 2.4)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(mood === 'stressed' ? '!!' : '!', cx, by + r * 0.1);
    ctx.textAlign = 'start';
  }
}

function drawArrow(ctx, cx, cy, size, dir, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - dir * size);
  ctx.lineTo(cx - size, cy + dir * size * 0.7);
  ctx.lineTo(cx + size, cy + dir * size * 0.7);
  ctx.closePath();
  ctx.fill();
}

// alpha (0-1) smooths car movement between simulation ticks.
export function drawElevators(ctx, W, H, camera, config, system, alpha) {
  const zoom = camera.zoom;
  const { cellWidth, floorHeight } = config.grid;
  const cellPx = cellWidth * zoom;
  const floorPx = floorHeight * zoom;
  const ec = config.elevators;
  const detailed = zoom >= config.world.detailMinZoom;
  const toScreenX = (wx) => (wx - camera.x) * zoom + W / 2;
  const toScreenY = (wy) => (wy - camera.y) * zoom + H / 2;
  const slotY = (floor) => toScreenY(-(floor + 1) * floorHeight);

  for (const shaft of system.shafts.values()) {
    const f = shaft.facility;
    const x = toScreenX(f.cell * cellWidth);
    const w = f.width * cellPx;
    if (x > W || x + w < 0) continue;
    if (slotY(shaft.top) > H || slotY(shaft.bottom) + floorPx < 0) continue;
    const def = config.facilities[f.type];

    // --- Call button plates (lit arrow = somebody pressed it) ---
    if (detailed) {
      for (let fl = shaft.bottom; fl <= shaft.top; fl++) {
        const y = slotY(fl);
        if (y > H || y + floorPx < 0) continue;
        const px = x + w - cellPx * 0.17;
        const py = y + floorPx * 0.5;
        const pw = cellPx * 0.2;
        ctx.fillStyle = 'rgba(20,28,38,0.75)';
        roundedRectPath(ctx, px - pw / 2, py - floorPx * 0.19, pw, floorPx * 0.38, pw * 0.3);
        ctx.fill();
        const s = pw * 0.32;
        const upLit = shaft.calls.has(`${fl}:1`);
        const downLit = shaft.calls.has(`${fl}:-1`);
        if (fl < shaft.top) drawArrow(ctx, px, py - floorPx * 0.08, s, 1, upLit ? '#ffd166' : '#6d7b88');
        if (fl > shaft.bottom) drawArrow(ctx, px, py + floorPx * 0.08, s, -1, downLit ? '#ffd166' : '#6d7b88');
      }
    }

    // --- People waiting in line (to the left of the shaft) ---
    const figSize = floorPx * 0.62;
    for (const [fl, queue] of shaft.waiting) {
      const baseY = slotY(fl) + floorPx * 0.92;
      if (baseY < -figSize || baseY - figSize > H) continue;
      const shown = Math.min(queue.length, 6);
      for (let i = 0; i < shown; i++) {
        const r = queue[i];
        const mood = moodOf(r.waited, ec);
        drawFigure(ctx, x - cellPx * 0.2 - i * figSize * 0.42, baseY, figSize, MOOD_COLORS[mood], mood);
      }
      if (queue.length > shown && detailed) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 ${Math.max(9, figSize * 0.4)}px system-ui, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText(`+${queue.length - shown}`, x - cellPx * 0.2 - shown * figSize * 0.42 - figSize * 0.5, baseY - figSize * 0.3);
      }
    }

    // --- Cars ---
    for (const car of shaft.cars) {
      const pos = car.prevPos + (car.pos - car.prevPos) * alpha;
      const carW = w * 0.64;
      const carH = floorPx * 0.84;
      const x0 = x + (w - carW) / 2;
      const bottomY = toScreenY(-pos * floorHeight) - floorPx * 0.06;
      const y0 = bottomY - carH;
      if (y0 > H || bottomY < 0) continue;

      ctx.fillStyle = def.accent;
      roundedRectPath(ctx, x0, y0, carW, carH, carH * 0.1);
      ctx.fill();
      if (!detailed) continue;

      const ix = x0 + carW * 0.08;
      const iy = y0 + carH * 0.12;
      const iw = carW * 0.84;
      const ih = carH * 0.82;
      ctx.fillStyle = '#fff6d6'; // lit interior
      ctx.fillRect(ix, iy, iw, ih);

      // Riders inside (two rows of up to four)
      if (car.door > 0.12) {
        const size = ih * 0.62;
        car.riders.forEach((r, i) => {
          const col = i % 4;
          const row = Math.floor(i / 4);
          drawFigure(ctx, ix + iw * (0.15 + col * 0.23), iy + ih * (0.62 + row * 0.34), size * (row ? 0.85 : 1), MOOD_COLORS.calm, 'calm');
        });
      }

      // Sliding doors: two panels that part in the middle as `door` goes 0 -> 1
      const panel = (iw / 2) * (1 - car.door);
      ctx.fillStyle = mixToHex(def.color, '#ffffff', 0.25);
      ctx.fillRect(ix, iy, panel, ih);
      ctx.fillRect(ix + iw - panel, iy, panel, ih);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; // seam
      if (car.door < 0.98) ctx.fillRect(ix + iw / 2 - 0.5, iy, 1, ih);

      // Direction arrow on top
      if (car.dir !== 0) drawArrow(ctx, x0 + carW / 2, y0 - carH * 0.08, carW * 0.1, car.dir, '#ffd166');
    }
  }
}
