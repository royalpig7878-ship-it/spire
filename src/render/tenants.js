// src/render/tenants.js
//
// Draws the people who are walking, climbing stairs, relaxing in a cafe or
// sitting at home/at their desk, plus the "Moved out!" floating messages.
// People waiting in elevator lines and riding in cars are drawn by
// render/elevators.js instead. Reads tenant state; never changes it.

import { drawFigure, MOOD_COLORS, moodOfStress } from './figures.js';
import { drawIcon } from './facilities.js';
import { ROOM_KINDS, roomGeom, personSpot, shirtOf } from './rooms.js';
import { drawPose, hairOf } from './poses.js';

const lastX = new Map(); // tenant id -> last screen x, to know which way they walk
const facing = new Map(); // tenant id -> facing left?

// The "!" bubble over an impatient or stressed walker.
function drawMoodBubble(ctx, cx, y, floorPx, mood) {
  const r = floorPx * 0.07;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, y, r * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = mood === 'stressed' ? '#c0392b' : '#b9770e';
  ctx.font = `700 ${Math.max(7, r * 2.6)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(mood === 'stressed' ? '!!' : '!', cx, y + r * 0.1);
  ctx.textAlign = 'start';
}

// `cutaway` is { tower, hour } when rooms are drawn as cross-sections: people then
// stand and sit inside their rooms, doing what suits the time of day.
export function drawTenants(ctx, W, H, camera, config, sys, highlightId = null, rich = false, cutaway = null) {
  const seconds = performance.now() / 1000;
  const zoom = camera.zoom;
  const { cellWidth, floorHeight } = config.grid;
  const floorPx = floorHeight * zoom;
  const sc = config.tenants.stress;
  const toScreenX = (wx) => (wx - camera.x) * zoom + W / 2;
  const toScreenY = (wy) => (wy - camera.y) * zoom + H / 2;
  const showInside = zoom >= 0.3; // tiny people at their desks only when zoomed in enough

  for (const t of sys.list) {
    if (!t.pos || t.mode === 'away') continue;
    if (t.rider && (t.rider.state === 'waiting' || t.rider.state === 'riding')) continue;

    const inside = t.mode === 'home' || t.mode === 'dwell';
    if (inside && !showInside) continue;

    // Cutaway: draw them in their room, busy with something.
    if (cutaway && inside && t.kind !== 'inspector' && drawInRoom(ctx, t, config, cutaway, camera, W, H, seconds, floorPx)) continue;

    const x = toScreenX(t.pos.x * cellWidth);
    const baseY = toScreenY(-t.pos.floor * floorHeight) - floorPx * 0.06;
    if (x < -20 || x > W + 20 || baseY < -20 || baseY - floorPx > H) continue;

    const mood = moodOfStress(t.stress, sc);
    if (t.kind === 'inspector') {
      // Dark suit, bigger, with a gold star: easy to follow on its tour.
      ctx.globalAlpha = 1;
      drawFigure(ctx, x, baseY, floorPx * 0.78, '#27323f', mood, '#f1d3b3', rich ? { rich, walk: seconds * 7 + t.id, hair: 2, bag: true } : null);
      drawIcon(ctx, 'star', x, baseY - floorPx * 1.12, Math.max(5, floorPx * 0.13), '#ffd166');
      continue;
    }
    // Cutaway: on stairs and escalators, follow the diagonal of the steps.
    if (cutaway && !inside && onSteps(ctx, t, config, cutaway, sys, camera, W, H, seconds, floorPx, mood)) continue;

    // Cutaway: walkers get the same drawing style, facing the way they are heading.
    if (cutaway && !inside) {
      const last = lastX.get(t.id);
      lastX.set(t.id, x);
      if (last !== undefined && Math.abs(x - last) > 0.05) facing.set(t.id, x < last);
      drawPose(ctx, 'walk', x, baseY, (floorPx / 48) * 1.05, facing.get(t.id) ?? false, seconds * 1.1 + t.id * 1.7, {
        shirt: mood === 'calm' ? shirtOf(t.id) : MOOD_COLORS[mood],
        skin: config.tenants.traits[t.trait].color,
        hair: hairOf(t.id),
        bag: t.kind === 'worker',
      });
      if (mood !== 'calm' && floorPx > 30) drawMoodBubble(ctx, x, baseY - floorPx * 0.7, floorPx, mood);
      continue;
    }
    const size = floorPx * (inside ? 0.46 : 0.62);
    ctx.globalAlpha = inside ? 0.9 : 1;
    const look = rich ? { rich, walk: t.mode === 'travel' ? seconds * 9 + t.id * 1.7 : null, hair: t.id, bag: t.kind === 'worker' && !inside } : null;
    drawFigure(ctx, x, baseY, size, MOOD_COLORS[mood], inside ? 'calm' : mood, config.tenants.traits[t.trait].color, look);
  }
  ctx.globalAlpha = 1;

  // A pulsing ring around the person whose story card is open
  const chosen = highlightId === null ? null : sys.list.find((t) => t.id === highlightId);
  if (chosen && chosen.pos && chosen.mode !== 'away') {
    const x = toScreenX(chosen.pos.x * cellWidth);
    const y = toScreenY(-chosen.pos.floor * floorHeight) - floorPx * 0.32;
    const pulse = 1 + 0.15 * Math.sin(performance.now() / 180);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(10, floorPx * 0.5) * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

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
    if (f.tone === 'gold' && zoom < 0.45) continue; // money notes only when zoomed in enough to read
    ctx.fillStyle = f.tone === 'gold' ? '#b8860b' : '#c0392b';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - w / 2, y - 11, w, 22, 11) : ctx.rect(x - w / 2, y - 11, w, 22);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(f.text, x, y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'start';
}

// Returns true when the person was drawn inside a cutaway room.
function drawInRoom(ctx, t, config, cutaway, camera, W, H, seconds, floorPx) {
  const venue = t.mode === 'dwell' && t.cafeId !== null;
  const f = cutaway.tower.facilities.get(venue ? t.cafeId : t.homeId);
  if (!f) return false;
  const def = config.facilities[f.type];
  const kind = def.style ?? f.type;
  if (!ROOM_KINDS.has(kind) || def.transport) return false;
  const zoom = camera.zoom;
  const { cellWidth, floorHeight } = config.grid;
  const x = (f.cell * cellWidth - camera.x) * zoom + W / 2;
  const top = (-(f.floor + 1) * floorHeight - camera.y) * zoom + H / 2;
  if (x > W || x + f.width * cellWidth * zoom < 0 || top > H || top + floorPx < 0) return true;
  const g = roomGeom(x, top, f.width * cellWidth * zoom, floorPx);
  const spot = personSpot({ typeId: f.type, def, W: g.W, slot: t.slot ?? 0, id: t.id, hour: cutaway.hour, minutes: cutaway.minutes, seconds, venue });
  const mood = moodOfStress(t.stress, config.tenants.stress);
  drawPose(
    ctx,
    spot.pose,
    g.x + spot.x * g.k,
    g.y + spot.y * g.k,
    g.k * spot.scale,
    spot.flip,
    seconds + t.id * 0.7,
    { shirt: mood === 'calm' ? shirtOf(t.id) : MOOD_COLORS[mood], skin: config.tenants.traits[t.trait].color, hair: hairOf(t.id) },
  );
  return true;
}

// A person on a staircase or escalator: they walk (or ride) up the drawn steps, diagonally.
// Returns true when the person was drawn.
function onSteps(ctx, t, config, cutaway, sys, camera, W, H, seconds, floorPx, mood) {
  const leg = t.route?.[t.legIdx];
  if (!leg || leg.type !== 'stairs' || !t.pos) return false;
  const f = cutaway.tower.facilities.get(leg.id);
  if (!f) return false;
  const def = config.facilities[f.type];
  const { cellWidth, floorHeight } = config.grid;
  const zoom = camera.zoom;
  const up = leg.toFloor > leg.fromFloor;
  const a = t.pos.floor;
  // which floor's tile they are on, and how far along it (0 bottom .. 1 top)
  let tileFloor = Math.floor(a + 1e-6);
  if (!up && Math.abs(a - Math.round(a)) < 1e-6) tileFloor = Math.round(a) - 1; // starting a descent: top of the tile below
  tileFloor = Math.max(Math.min(leg.fromFloor, leg.toFloor), Math.min(tileFloor, Math.max(leg.fromFloor, leg.toFloor) - 1));
  const p = Math.min(1, Math.max(0, a - tileFloor));
  const flipTile = Math.abs(tileFloor) % 2 === 1; // same rule the steps are drawn with
  const fx = (f.cell * cellWidth - camera.x) * zoom + W / 2;
  const fw = f.width * cellWidth * zoom;
  const tileTop = (-(tileFloor + 1) * floorHeight - camera.y) * zoom + H / 2;
  const left = fx + fw * 0.12;
  const right = fx + fw * 0.88;
  const x = flipTile ? right - (right - left) * p : left + (right - left) * p;
  const feetY = tileTop + floorPx * (0.92 - 0.88 * p);
  if (x < -30 || x > W + 30 || feetY < -30 || feetY - floorPx > H) return true;
  const facingRight = (up ? 1 : -1) * (flipTile ? -1 : 1) > 0;
  drawPose(ctx, def.transport === 'escalator' ? 'stand' : 'climb', x, feetY, (floorPx / 48) * 1.05, !facingRight, seconds + t.id * 1.3, {
    shirt: mood === 'calm' ? shirtOf(t.id) : MOOD_COLORS[mood],
    skin: config.tenants.traits[t.trait].color,
    hair: hairOf(t.id),
    bag: t.kind === 'worker',
  });
  return true;
}
