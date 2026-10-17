// src/render/world.js
//
// Draws the whole scene each frame: sky, ground, plot, grid, buildings and
// the placement ghost. It only READS the tower and ui state — it never
// changes them. (Simulation stays in src/sim.)

import { drawFacility, drawNoAccessBadge, roundedRectPath } from './facilities.js';
import { drawElevators } from './elevators.js';
import { drawTenants } from './tenants.js';
import { drawSky } from './sky.js';
import { mixToHex } from './color.js';
import { isConnected } from '../sim/tower.js';
import { formatMoney } from '../data/format.js';

// `hour` is the time of day (0-24) from the game clock. `elevators` is the
// elevator system state; `alpha` (0-1) smooths motion between sim ticks.
export function renderWorld(ctx, W, H, camera, config, tower, ui, hour, elevators, alpha, tenants) {
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

  // --- Sky (follows the game clock) ---
  const skyState = drawSky(ctx, W, H, hour, config);
  const nightDim = Math.min(1, skyState.dark * config.sky.nightDimStrength);

  // --- Ground (dims at night like the buildings) ---
  const groundY = toScreenY(world.groundY);
  if (groundY < H) {
    ctx.fillStyle = mixToHex(world.groundColor, config.sky.nightTint, nightDim);
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = mixToHex(world.grassColor, config.sky.nightTint, nightDim);
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

  // --- Facilities (skip anything off-screen). Tall ones (stairs, elevator
  // shafts) are drawn one floor tile at a time. ---
  const detailed = zoom >= world.detailMinZoom;
  for (const f of tower.facilities.values()) {
    const x = slotX(f.cell);
    const w = f.width * cellPx;
    if (x > W || x + w < 0) continue;
    const def = config.facilities[f.type];
    const connected = isConnected(tower, config, f);
    // Windows glow at night when someone is inside. Homes and offices light up
    // only while a tenant is actually there; shops and lobbies when reachable.
    let lit = 0;
    if (!def.transport && connected) {
      lit = def.capacity ? ((tenants.present.get(f.id) ?? 0) > 0 ? 1 : 0) : 1;
    }
    const look = { isMain: f.locked, dark: skyState.dark, lit, sky: config.sky, tileIndex: 0 };
    for (let i = 0; i < f.height; i++) {
      const y = slotY(f.floor + i);
      if (y > H || y + floorPx < 0) continue;
      look.tileIndex = i;
      drawFacility(ctx, f.type, def, x, y, w, floorPx, cellPx, detailed, look);
    }
    if (!connected && !def.transport && detailed) {
      drawNoAccessBadge(ctx, x, slotY(f.floor), w, floorPx);
    }
  }

  // --- People walking, climbing, relaxing at their desks ---
  drawTenants(ctx, W, H, camera, config, tenants);

  // --- Elevator cars, call buttons and waiting riders ---
  drawElevators(ctx, W, H, camera, config, elevators, alpha);

  // --- Ghost (build preview; may be several floors tall) ---
  if (ui.ghost) {
    const g = ui.ghost;
    const def = config.facilities[g.typeId];
    const x = slotX(g.cell);
    const w = def.width * cellPx;
    const topY = slotY(g.floor + g.height - 1);
    ctx.save();
    ctx.globalAlpha = 0.7;
    const ghostLook = { isMain: false, dark: skyState.dark, lit: 0, sky: config.sky, tileIndex: 0 };
    for (let i = 0; i < g.height; i++) {
      ghostLook.tileIndex = i;
      drawFacility(ctx, g.typeId, def, x, slotY(g.floor + i), w, floorPx, cellPx, detailed, ghostLook);
    }
    ctx.restore();
    const label = g.ok ? formatMoney(def.cost * g.height) : g.reason;
    drawVerdict(ctx, world, x, topY, w, floorPx * g.height, g.ok, label);
  }

  // --- Demolish target highlight ---
  if (ui.demolishTarget) {
    const t = ui.demolishTarget;
    const f = t.facility;
    const label = t.ok ? `Demolish  +${formatMoney(t.refund)}` : t.reason;
    drawVerdict(ctx, world, slotX(f.cell), slotY(f.floor + f.height - 1), f.width * cellPx, floorPx * f.height, t.ok, label, true);
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
