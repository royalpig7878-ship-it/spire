// src/render/tenants.js
//
// Draws the people who are walking, climbing stairs, relaxing in a cafe or
// sitting at home/at their desk, plus the "Moved out!" floating messages.
// People waiting in elevator lines and riding in cars are drawn by
// render/elevators.js instead. Reads tenant state; never changes it.

import { drawFigure, MOOD_COLORS, moodOfStress } from './figures.js';
import { drawIcon } from './facilities.js';

export function drawTenants(ctx, W, H, camera, config, sys) {
  const zoom = camera.zoom;
  const { cellWidth, floorHeight } = config.grid;
  const floorPx = floorHeight * zoom;
  const sc = config.tenants.stress;
  const toScreenX = (wx) => (wx - camera.x) * zoom + W / 2;
  const toScreenY = (wy) => (wy - camera.y) * zoom + H / 2;
  const showInside = zoom >= 0.4; // tiny people at their desks only when zoomed in enough

  for (const t of sys.list) {
    if (!t.pos || t.mode === 'away') continue;
    if (t.rider && (t.rider.state === 'waiting' || t.rider.state === 'riding')) continue;

    const inside = t.mode === 'home' || t.mode === 'dwell';
    if (inside && !showInside) continue;

    const x = toScreenX(t.pos.x * cellWidth);
    const baseY = toScreenY(-t.pos.floor * floorHeight) - floorPx * 0.06;
    if (x < -20 || x > W + 20 || baseY < -20 || baseY - floorPx > H) continue;

    const mood = moodOfStress(t.stress, sc);
    if (t.kind === 'inspector') {
      // Dark suit, bigger, with a gold star: easy to follow on its tour.
      ctx.globalAlpha = 1;
      drawFigure(ctx, x, baseY, floorPx * 0.78, '#27323f', mood, '#f1d3b3');
      drawIcon(ctx, 'star', x, baseY - floorPx * 1.12, Math.max(5, floorPx * 0.13), '#ffd166');
      continue;
    }
    const size = floorPx * (inside ? 0.46 : 0.62);
    ctx.globalAlpha = inside ? 0.9 : 1;
    drawFigure(ctx, x, baseY, size, MOOD_COLORS[mood], inside ? 'calm' : mood, config.tenants.traits[t.trait].color);
  }
  ctx.globalAlpha = 1;

  // Floating "Moved out!" notes
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of sys.fx) {
    const x = toScreenX(f.x * cellWidth);
    const y = toScreenY(-(f.floor + 1) * floorHeight) - f.age * 18;
    const alpha = Math.max(0, 1 - f.age / 2.5);
    const w = ctx.measureText(f.text).width + 16;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - w / 2, y - 11, w, 22, 11) : ctx.rect(x - w / 2, y - 11, w, 22);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(f.text, x, y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'start';
}
