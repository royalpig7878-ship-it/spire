// src/render/world.js
//
// Draws the whole scene each frame: sky, ground, plot, grid, buildings and
// the placement ghost. It only READS the tower and ui state — it never
// changes them. (Simulation stays in src/sim.)

import {
  drawFacility,
  drawNoAccessBadge,
  drawTrashBadge,
  drawFlames,
  drawPests,
  drawClosed,
  drawSprinklers,
  roundedRectPath,
} from './facilities.js';
import { drawWeather } from './weather.js';
import { drawSkyLife, drawFlyers } from './ambient.js';
import { drawParticles } from './particles.js';
import { drawDirt, drawGlow, drawRoofProps, drawStreetProps, roofIds } from './detail.js';
import { calendar } from '../sim/clock.js';
import { bandRange } from '../sim/districts.js';
import { trashLevel } from '../sim/services.js';
import { drawElevators } from './elevators.js';
import { drawTenants } from './tenants.js';
import { drawSky } from './sky.js';
import { mixToHex } from './color.js';
import { drawOverlay } from './overlays.js';
import { isConnected, facilityAt } from '../sim/tower.js';
import { hourOfDay } from '../sim/clock.js';
import { formatMoney } from '../data/format.js';

// `alpha` (0-1) smooths motion between simulation ticks.
export function renderWorld(ctx, W, H, camera, config, game, ui, alpha) {
  const { tower, elevators, tenants } = game;
  const hour = hourOfDay(game.clock);
  const seconds = performance.now() / 1000; // for flames, rain and other little animations
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

  // Rich art (extra details) needs the setting on, no battery saver, and a close-enough zoom.
  const rich = Boolean(ui.rich) && zoom >= world.richMinZoom;
  // Cutaway: rooms are drawn as furnished cross-sections with people doing things.
  const cutaway = Boolean(ui.cutaway) && zoom >= world.cutawayMinZoom;

  // --- Sky (follows the game clock) ---
  const skyState = drawSky(ctx, W, H, hour, config);
  const nightDim = Math.min(1, skyState.dark * config.sky.nightDimStrength);
  if (!ui.lowDetail) drawSkyLife(ctx, W, H, camera, hour, seconds, skyState.dark); // clouds, birds
  if (!ui.lowDetail) drawFlyers(ctx, W, H, camera, seconds, skyState.dark); // planes, blimps, balloons...

  // --- Ground (dims at night like the buildings) ---
  const groundY = toScreenY(world.groundY);
  if (groundY < H) {
    ctx.fillStyle = mixToHex(world.groundColor, config.sky.nightTint, nightDim);
    ctx.fillRect(0, groundY, W, H - groundY);
    // The grass follows the season (and goes white under snow).
    const seasonIndex = calendar(game.clock, config).quarter - 1;
    const grass = game.weather.kind === 'snow' ? world.seasonGrass[3] : world.seasonGrass[seasonIndex] ?? world.grassColor;
    ctx.fillStyle = mixToHex(grass, config.sky.nightTint, nightDim);
    ctx.fillRect(0, groundY, W, world.grassHeight * zoom);
    // Layers of earth with things buried in them (Rich art; zoomed in enough to see them)
    if (ui.rich && zoom >= 0.25) drawDirt(ctx, W, H, camera, config, groundY, skyState.dark, performance.now() / 1000);
    // Lamp posts, trees and bushes (Rich art)
    if (rich) drawStreetProps(ctx, W, camera, config, tower, facilityAt, groundY, skyState.dark, seasonIndex, game.weather.kind === 'snow');
  }

  // --- Plot outline (dashed) so you can see where you may build ---
  const half = tower.plot.halfWidthCells;
  const plotLeft = slotX(-half);
  const plotRight = slotX(half);
  const plotTop = slotY(tower.plot.maxFloor);
  ctx.save();
  ctx.strokeStyle = world.plotOutlineColor;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  // The plot reaches down through the basement floors too.
  const plotBottom = slotY(tower.plot.minFloor) + floorPx;
  ctx.strokeRect(plotLeft, plotTop, plotRight - plotLeft, plotBottom - plotTop);
  ctx.restore();

  // --- Sky districts: a tinted, labelled band of floors ---
  const bandRect = (band) => {
    const { first, last } = bandRange(config, band);
    const topFloor = Math.min(last, tower.plot.maxFloor);
    if (first > tower.plot.maxFloor) return null;
    return { x: plotLeft, y: slotY(topFloor), w: plotRight - plotLeft, h: slotY(first - 1) - slotY(topFloor) };
  };
  const drawBand = (band, color, label, alpha, dashed = false) => {
    const r = bandRect(band);
    if (!r || r.y > H || r.y + r.h < 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash(dashed ? [10, 6] : []);
    ctx.beginPath();
    ctx.moveTo(r.x, r.y);
    ctx.lineTo(r.x + r.w, r.y);
    ctx.moveTo(r.x, r.y + r.h);
    ctx.lineTo(r.x + r.w, r.y + r.h);
    ctx.stroke();
    ctx.restore();
    // label pill on the left edge of the band
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width + 16;
    const px = Math.max(4, r.x + 4);
    const py = Math.max(4, Math.min(H - 30, r.y + 6));
    ctx.fillStyle = color;
    roundedRectPath(ctx, px, py, tw, 20, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, px + 8, py + 10);
  };
  for (const [bandKey, themeId] of Object.entries(tower.districts)) {
    const theme = config.districts.themes[themeId];
    if (theme) drawBand(Number(bandKey), theme.color, `${theme.label} district`, 0.1);
  }
  if (ui.districtPreview) {
    const p = ui.districtPreview;
    const theme = config.districts.themes[p.themeId];
    const color = p.clear ? '#888888' : (theme?.color ?? '#888888');
    const label = p.ok ? (p.clear ? 'Remove district' : `${theme.label}  ${formatMoney(p.cost)}`) : p.reason;
    drawBand(p.band, p.ok ? color : world.invalidColor, label, 0.22, true);
  }

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
      ctx.lineTo(x, Math.min(H, plotBottom));
    }
    for (let f = tower.plot.minFloor; f <= tower.plot.maxFloor + 1; f++) {
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
      if (game.incidents.outage || (f.closedUntil && f.closedUntil > game.clock.minutes)) lit = 0; // lights out
    }
    const shaft = def.transport === 'elevator' ? elevators.shafts.get(f.id) : null;
    const look = {
      isMain: f.locked,
      dark: skyState.dark,
      lit,
      sky: config.sky,
      tileIndex: 0,
      isStop: true,
      express: def.stopMode === 'hubs',
      tileTotal: f.height,
      rich,
      cutaway,
      id: f.id,
      present: tenants.present.get(f.id) ?? 0,
      hour,
      seconds,
    };
    // A newly built facility "pops" up from its base with a little bounce.
    let popped = false;
    const popAt = ui.pops.get(f.id);
    if (popAt !== undefined) {
      const k = (performance.now() - popAt) / 400;
      if (k >= 1) ui.pops.delete(f.id);
      else {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        const scale = 0.55 + 0.45 * (1 + c3 * (k - 1) ** 3 + c1 * (k - 1) ** 2); // ease-out-back
        const cx = x + w / 2;
        const baseY = slotY(f.floor) + floorPx;
        ctx.save();
        ctx.translate(cx, baseY);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -baseY);
        popped = true;
      }
    }
    if (rich && lit > 0 && skyState.dark > 0.3) drawGlow(ctx, x, slotY(f.floor + f.height - 1), w, floorPx * f.height, skyState.dark, lit);
    for (let i = 0; i < f.height; i++) {
      const y = slotY(f.floor + i);
      if (y > H || y + floorPx < 0) continue;
      look.tileIndex = i;
      look.floor = f.floor + i;
      look.isStop = shaft ? shaft.stops.has(f.floor + i) : true; // shafts have a door only at stops
      drawFacility(ctx, f.type, def, x, y, w, floorPx, cellPx, detailed, look);
    }
    if (rich && !def.transport && roofIds(tower, facilityAt, ui.roofCache).has(f.id)) {
      drawRoofProps(ctx, f, def, x, slotY(f.floor + f.height - 1), w, floorPx, cellPx, skyState.dark, seconds);
    }
    if (popped) ctx.restore();
    // Trouble on the tile: fire, pests, repairs, and (good news) sprinklers.
    if (detailed) {
      const ty = slotY(f.floor + f.height - 1);
      const th = floorPx * f.height;
      if (f.sprinklers) drawSprinklers(ctx, x, ty, w, th);
      if (f.closedUntil && f.closedUntil > game.clock.minutes) drawClosed(ctx, x, ty, w, th);
      if (game.incidents.pests[f.id]) drawPests(ctx, x, ty, w, th, seconds);
      const fire = game.incidents.fires[f.id];
      if (fire) drawFlames(ctx, x, ty, w, th, fire.intensity, seconds);
    }
    if (!connected && !def.transport && detailed) {
      drawNoAccessBadge(ctx, x, slotY(f.floor), w, floorPx);
    }
    const trash = trashLevel(game, f);
    if (detailed && trash >= config.services.trash.badgeAbove) {
      drawTrashBadge(ctx, x, slotY(f.floor), w, floorPx, trash);
    }
  }

  // --- A ring around the place a Needs card pointed at ---
  if (ui.pulse) {
    const left = ui.pulse.until - performance.now();
    if (left <= 0) ui.pulse = null;
    else {
      const p = ui.pulse;
      const beat = 0.5 + 0.5 * Math.sin(performance.now() / 150);
      ctx.save();
      ctx.globalAlpha = Math.min(1, left / 600);
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 3 + beat * 3;
      ctx.shadowColor = 'rgba(255,209,102,0.9)';
      ctx.shadowBlur = 10 + beat * 10;
      roundedRectPath(ctx, slotX(p.cell) - 3, slotY(p.floor + p.height - 1) - 3, p.width * cellPx + 6, p.height * floorPx + 6, 8);
      ctx.stroke();
      ctx.restore();
    }
  }

  // --- Dust and debris from building and demolishing ---
  drawParticles(ctx, W, H, camera, ui.particles);

  // --- Diagnostic heat-map layer (tints and labels the buildings) ---
  if (ui.overlay !== 'off') drawOverlay(ctx, W, H, camera, config, game, ui.overlay);

  // --- People walking, climbing, relaxing at their desks ---
  drawTenants(ctx, W, H, camera, config, tenants, ui.storyId, rich, cutaway ? { tower, hour } : null);

  // --- Elevator cars, call buttons and waiting riders ---
  drawElevators(ctx, W, H, camera, config, elevators, alpha, rich);

  // --- A power dip darkens the whole tower ---
  if (game.incidents.outage) {
    ctx.fillStyle = 'rgba(6,10,26,0.38)';
    ctx.fillRect(0, 0, W, H);
  }

  // --- Weather over everything ---
  drawWeather(ctx, W, H, game.weather.kind, seconds, ui.lowDetail ? 0.4 : 1);

  // --- Ghost (build preview; may be several floors tall) ---
  if (ui.ghost) {
    const g = ui.ghost;
    const def = config.facilities[g.typeId];
    const x = slotX(g.cell);
    const w = def.width * cellPx;
    const topY = slotY(g.floor + g.height - 1);
    ctx.save();
    ctx.globalAlpha = 0.7;
    const ghostLook = { isMain: false, dark: skyState.dark, lit: 0, sky: config.sky, tileIndex: 0, tileTotal: g.height };
    for (let i = 0; i < g.height; i++) {
      ghostLook.tileIndex = i;
      drawFacility(ctx, g.typeId, def, x, slotY(g.floor + i), w, floorPx, cellPx, detailed, ghostLook);
    }
    ctx.restore();
    const label = g.ok ? formatMoney(def.fixedHeight ? def.cost : def.cost * g.height) : g.reason;
    drawVerdict(ctx, world, x, topY, w, floorPx * g.height, g.ok, label);
  }

  // --- Demolish target highlight ---
  if (ui.demolishTarget) {
    const t = ui.demolishTarget;
    const f = t.facility;
    const label = t.ok ? `Demolish  +${formatMoney(t.refund)}` : t.reason;
    drawVerdict(ctx, world, slotX(f.cell), slotY(f.floor + f.height - 1), f.width * cellPx, floorPx * f.height, t.ok, label, true);
  }

  // --- The building whose info panel is open: a dashed white outline ---
  const selected = ui.selectedId !== null ? tower.facilities.get(ui.selectedId) : null;
  if (selected) {
    ctx.save();
    ctx.setLineDash([8, 5]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;
    roundedRectPath(ctx, slotX(selected.cell), slotY(selected.floor + selected.height - 1), selected.width * cellPx, floorPx * selected.height, 6);
    ctx.stroke();
    ctx.restore();
  }

  // --- Quick tooltip (tap on an elevator stop) ---
  if (ui.tooltip && performance.now() < ui.tooltip.until) {
    const tip = ui.tooltip;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lineHeight = 18;
    const widest = Math.max(...tip.lines.map((l) => ctx.measureText(l).width)) + 20;
    const tx = Math.max(widest / 2 + 4, Math.min(W - widest / 2 - 4, toScreenX(tip.cell * cellWidth)));
    const ty = slotY(tip.floor) - 8 - tip.lines.length * lineHeight;
    ctx.fillStyle = 'rgba(20,28,38,0.92)';
    roundedRectPath(ctx, tx - widest / 2, ty - 6, widest, tip.lines.length * lineHeight + 12, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    tip.lines.forEach((line, i) => ctx.fillText(line, tx, ty + 6 + i * lineHeight));
    ctx.textAlign = 'start';
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
