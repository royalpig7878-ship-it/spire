// src/render/overlays.js
//
// The diagnostic heat-map layers. Each facility tile is tinted by a metric
// (stress, elevator wait, occupancy, income) and labelled with its number, so
// the layer never relies on color alone. Tiles the layer has nothing to say
// about are dimmed. Reads game state only.

import { mixToHex } from './color.js';
import { roundedRectPath } from './facilities.js';
import { overlayValue, incomeScale } from '../sim/diagnostics.js';

export const OVERLAY_MODES = ['off', 'stress', 'wait', 'occupancy', 'income', 'security', 'medical', 'maintenance', 'noise'];

export const OVERLAY_INFO = {
  stress: { label: 'Stress', ramp: 'bad', low: 'calm', high: 'stressed' },
  wait: { label: 'Wait', ramp: 'bad', low: 'short', high: 'long' },
  occupancy: { label: 'Occupancy', ramp: 'good', low: 'empty', high: 'full' },
  income: { label: 'Income', ramp: 'money', low: 'low', high: 'high' },
  security: { label: 'Security cover', ramp: 'good', low: 'none', high: 'covered' },
  medical: { label: 'Medical cover', ramp: 'good', low: 'none', high: 'covered' },
  maintenance: { label: 'Maintenance cover', ramp: 'good', low: 'none', high: 'covered' },
  noise: { label: 'Noise', ramp: 'bad', low: 'quiet', high: 'loud' },
};

// Color along a multi-stop ramp for t in 0..1.
export function rampColor(stops, t) {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  return mixToHex(stops[i], stops[i + 1], scaled - i);
}

export function drawOverlay(ctx, W, H, camera, config, game, mode) {
  const info = OVERLAY_INFO[mode];
  if (!info) return;
  const ramp = config.overlays.ramps[info.ramp];
  const { cellWidth, floorHeight } = config.grid;
  const zoom = camera.zoom;
  const cellPx = cellWidth * zoom;
  const floorPx = floorHeight * zoom;
  const toScreenX = (wx) => (wx - camera.x) * zoom + W / 2;
  const toScreenY = (wy) => (wy - camera.y) * zoom + H / 2;
  const context = { incomeMax: mode === 'income' ? incomeScale(game, config) : 1 };

  ctx.font = `700 ${Math.max(10, Math.min(16, floorPx * 0.32))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const f of game.tower.facilities.values()) {
    const x = toScreenX(f.cell * cellWidth);
    const w = f.width * cellPx;
    if (x > W || x + w < 0) continue;
    for (let i = 0; i < f.height; i++) {
      const floor = f.floor + i;
      const y = toScreenY(-(floor + 1) * floorHeight);
      if (y > H || y + floorPx < 0) continue;
      const v = overlayValue(game, config, mode, f, floor, context);

      roundedRectPath(ctx, x + 1, y + 1, w - 2, floorPx - 2, floorPx * 0.1);
      if (!v) {
        ctx.fillStyle = 'rgba(24,32,44,0.55)'; // nothing to show here
        ctx.fill();
        continue;
      }
      const color = rampColor(ramp, v.t);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.82;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (w > 24 && floorPx > 14) {
        ctx.fillStyle = v.t > 0.55 ? '#ffffff' : '#1d2733';
        ctx.fillText(v.text, x + w / 2, y + floorPx / 2);
      }
    }
  }
  ctx.textAlign = 'start';
}
