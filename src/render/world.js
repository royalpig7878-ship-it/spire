// src/render/world.js
//
// Draws the whole scene each frame: sky, ground, plot, grid, buildings and
// the placement ghost. It only READS the tower and ui state — it never
// changes them. (Simulation stays in src/sim.)

import { drawFacility, roundedRectPath } from './facilities.js';
import { formatMoney } from '../data/format.js';

export function renderWorld(ctx, W, H, camera, config, tower, ui) {
  const world = config.world;
  const { cellWidth, floorHeight } = config.grid;
  const zoom = camera.zoom;
  const halfW = W / 2;
  const halfH = H / 2;
  const toScreenX = (wx) => (wx - camera.x) * zoom + halfW;
  const toScreenY = (wy) => (wy - camera.y) * zoom + halfH;
  // Top-left screen position of a grid slot (floor, cell).
  const slotX = (cell) => toScreenX(cell * cellWidth);
  const slotY = (floor) => toScreenY(-(floor + 1) * floorHeight);
  const cellPx = cellWidth * zoom;
  const floorPx = floorHeight * zoom;

  // --- Sky ---
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, world.skyColors.top);
  sky.addColorStop(1, world.skyColors.bottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // --- Ground ---
  const groundY = toScreenY(world.groundY);
  if (groundY < H) {
    ctx.fillStyle = world.groundColor;
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = world.grassColor;
    ctx.fillRect(0, groundY, W, world.grassHeight * zoom);
  }

  // --- Plot outline (dashed) so you can see where you may build ---
  const half = config.plot.halfWidthCells;
  const plotLeft = slotX(-half);
  const plotRight = slotX(half);
  const plotTop = slotY(config.plot.maxFloor);
  ctx.save();
  ctx.strokeStyle = world.plotOutlineColor;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(plotLeft, plotTop, plotRight - plotLeft, groundY - plotTop);
  ctx.restore();

  // --- Cell grid (only while a build/demolish tool is active) ---
  if (ui.tool.kind !== 'pan') {
    ctx.strokeStyle = world.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const firstCol = Math.max(-half, Math.floor((camera.x - halfW / zoom) / cellWidth));
    const lastCol = Math.min(half, Math.ceil((camera.x + halfW / zoom) / cellWidth));
    for (let c = firstCol; c <= lastCol; c++) {
      const x = Math.round(slotX(c)) + 0.5;
      ctx.moveTo(x, Math.max(0, plotTop));
      ctx.lineTo(x, Math.min(H, groundY));
    }
    for (let f = 0; f <= config.plot.maxFloor + 1; f++) {
      const y = Math.round(toScreenY(-f * floorHeight)) + 0.5;
      if (y < 0 || y > H) continue;
      ctx.moveTo(Math.max(0, plotLeft), y);
      ctx.lineTo(Math.min(W, plotRight), y);
    }
    ctx.stroke();
  }

  // --- Facilities (skip anything off-screen) ---
  const detailed = zoom >= world.detailMinZoom;
  for (const f of tower.facilities.values()) {
    const x = slotX(f.cell);
    const y = slotY(f.floor);
    const w = f.width * cellPx;
    if (x > W || x + w < 0 || y > H || y + floorPx < 0) continue;
    drawFacility(ctx, f.type, config.facilities[f.type], x, y, w, floorPx, cellPx, detailed, f.locked);
  }

  // --- Ghost (build preview) ---
  if (ui.ghost) {
    const g = ui.ghost;
    const def = config.facilities[g.typeId];
    const x = slotX(g.cell);
    const y = slotY(g.floor);
    const w = def.width * cellPx;
    ctx.save();
    ctx.globalAlpha = 0.7;
    drawFacility(ctx, g.typeId, def, x, y, w, floorPx, cellPx, detailed, false);
    ctx.restore();
    drawVerdict(ctx, world, x, y, w, floorPx, g.ok, g.ok ? formatMoney(def.cost) : g.reason);
  }

  // --- Demolish target highlight ---
  if (ui.demolishTarget) {
    const t = ui.demolishTarget;
    const f = t.facility;
    const label = t.ok ? `Demolish  +${formatMoney(t.refund)}` : t.reason;
    drawVerdict(ctx, world, slotX(f.cell), slotY(f.floor), f.width * cellPx, floorPx, t.ok, label, true);
  }
}

// Outline + badge + label showing whether an action is allowed. Color is
// never the only signal: allowed = solid outline + check mark; blocked =
// diagonal hatching + a cross mark.
function drawVerdict(ctx, world, x, y, w, h, ok, label, warnStyle = false) {
  const color = ok && !warnStyle ? world.validColor : world.invalidColor;
  const showHatch = !ok || warnStyle;
  ctx.save();
  roundedRectPath(ctx, x, y, w, h, h * 0.12);
  ctx.clip();
  if (showHatch) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = -h; i < w + h; i += 12) {
      ctx.moveTo(x + i, y + h);
      ctx.lineTo(x + i + h, y);
    }
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();

  roundedRectPath(ctx, x, y, w, h, h * 0.12);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Badge in the middle: check or cross
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(14, Math.max(8, h * 0.3));
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(2, r * 0.22);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const k = r * 0.45;
  if (ok && !warnStyle) {
    ctx.moveTo(cx - k, cy);
    ctx.lineTo(cx - k * 0.25, cy + k * 0.75);
    ctx.lineTo(cx + k, cy - k * 0.6);
  } else {
    ctx.moveTo(cx - k, cy - k);
    ctx.lineTo(cx + k, cy + k);
    ctx.moveTo(cx + k, cy - k);
    ctx.lineTo(cx - k, cy + k);
  }
  ctx.stroke();

  // Label pill above the target
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const tw = ctx.measureText(label).width + 20;
  const px = Math.max(4, Math.min(ctx.canvas.clientWidth - tw - 4, cx - tw / 2));
  const py = y - 34;
  ctx.fillStyle = 'rgba(20,28,38,0.88)';
  roundedRectPath(ctx, px, py, tw, 26, 13);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(label, px + tw / 2, py + 13);
  ctx.textAlign = 'start';
}
