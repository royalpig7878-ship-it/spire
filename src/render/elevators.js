// src/render/elevators.js
//
// Draws what is happening around elevator shafts: call buttons (lit when
// pressed), people waiting in line, and the cars themselves with sliding
// doors and riders inside. Reads the elevator state; never changes it.

import { roundedRectPath } from './facilities.js';
import { mixToHex } from './color.js';
import { drawFigure, MOOD_COLORS, moodOfStress } from './figures.js';

// Mood of a rider: real tenants use their stress; demo riders (no tenant)
// use how long they have waited.
function riderMood(r, config) {
  if (r.tenant) return moodOfStress(r.tenant.stress, config.tenants.stress);
  const ec = config.elevators;
  if (r.waited >= ec.stressedAfterSec) return 'stressed';
  if (r.waited >= ec.impatientAfterSec) return 'impatient';
  return 'calm';
}

function riderHead(r, config) {
  return r.tenant ? config.tenants.traits[r.tenant.trait].color : undefined;
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
export function drawElevators(ctx, W, H, camera, config, system, alpha, rich = false) {
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
      for (const fl of shaft.stopList) {
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
        if (fl < shaft.stopList[shaft.stopList.length - 1]) drawArrow(ctx, px, py - floorPx * 0.08, s, 1, upLit ? '#ffd166' : '#6d7b88');
        if (fl > shaft.stopList[0]) drawArrow(ctx, px, py + floorPx * 0.08, s, -1, downLit ? '#ffd166' : '#6d7b88');
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
        const mood = riderMood(r, config);
        drawFigure(ctx, x - cellPx * 0.2 - i * figSize * 0.42, baseY, figSize, MOOD_COLORS[mood], mood, riderHead(r, config), rich ? { rich, hair: r.tenant?.id ?? i } : null);
      }
      if (queue.length > shown && detailed) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 ${Math.max(9, figSize * 0.4)}px system-ui, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText(`+${queue.length - shown}`, x - cellPx * 0.2 - shown * figSize * 0.42 - figSize * 0.5, baseY - figSize * 0.3);
      }
      // Queue indicator: a label with the line length and the longest wait,
      // shown once a line is long or someone has been waiting a while.
      const longest = queue.reduce((max, r) => Math.max(max, r.waited), 0);
      if (zoom >= 0.45 && (queue.length >= 4 || longest >= ec.impatientAfterSec)) {
        const text = `${queue.length} in line · ${Math.round(longest)}s`;
        ctx.font = '700 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(text).width + 12;
        const bx = x - cellPx * 0.2 - Math.min(shown, 3) * figSize * 0.21;
        const by = baseY - figSize * 1.28;
        ctx.fillStyle = longest >= ec.stressedAfterSec ? '#a8302b' : 'rgba(20,28,38,0.88)';
        roundedRectPath(ctx, bx - tw / 2, by - 9, tw, 18, 9);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, bx, by);
        ctx.textAlign = 'start';
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

      if (rich) {
        // ceiling light, a handrail and a little floor display
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(ix + iw * 0.2, iy, iw * 0.6, Math.max(1, ih * 0.05));
        ctx.fillStyle = 'rgba(120,100,70,0.35)';
        ctx.fillRect(ix, iy + ih * 0.5, iw, Math.max(1, ih * 0.03));
        if (zoom >= 0.8 && car.door > 0.3) {
          ctx.fillStyle = '#1b222b';
          roundedRectPath(ctx, ix + iw * 0.34, iy + ih * 0.07, iw * 0.32, ih * 0.15, ih * 0.04);
          ctx.fill();
          ctx.fillStyle = '#ffb347';
          ctx.font = `700 ${Math.max(6, ih * 0.12)}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(Math.round(pos)), ix + iw * 0.5, iy + ih * 0.15);
          ctx.textAlign = 'start';
        }
      }

      // Riders inside (two rows of up to four)
      if (car.door > 0.12) {
        const size = ih * 0.62;
        car.riders.forEach((r, i) => {
          const col = i % 4;
          const row = Math.floor(i / 4);
          const mood = riderMood(r, config);
          drawFigure(ctx, ix + iw * (0.15 + col * 0.23), iy + ih * (0.62 + row * 0.34), size * (row ? 0.85 : 1), MOOD_COLORS[mood], 'calm', riderHead(r, config), rich ? { rich, hair: r.tenant?.id ?? i } : null);
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
