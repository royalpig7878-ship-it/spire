// src/render/rooms.js
//
// The cutaway view (M10): rooms drawn like a dollhouse cross-section, with
// furniture inside and the people doing little things. Like in the old
// skyscraper sims, you look straight into the rooms.
//
// Every room is drawn in "room units": 48 units tall (one floor), 40 units
// per cell wide, floor line at y = 42. The canvas is moved and scaled once,
// so a desk is the same drawing at any zoom. `personSpot` says where a
// person stands in a room and what they are doing, from the time of day.

import { mixToHex } from './color.js';
import { shade } from './facilities.js';

export const ROOM_KINDS = new Set(['office', 'apartment', 'hotel', 'shop', 'service', 'lobby', 'skylobby', 'atrium', 'crown']);
export const FLOOR_Y = 42;

const hash = (n) => {
  const x = Math.sin(n * 91.7 + 17.3) * 43758.5453;
  return x - Math.floor(x);
};

// Same inset the facade drawing uses, so people line up with the room.
export function roomGeom(x, y, w, h) {
  const inset = Math.max(0.5, h * 0.015);
  const nx = x + inset;
  const ny = y + inset;
  const nw = w - inset * 2;
  const nh = h - inset * 2;
  const k = nh / 48;
  return { x: nx, y: ny, w: nw, h: nh, k, W: nw / k };
}

// ---- Office desks -----------------------------------------------------------

function deskLayout(def, W) {
  const n = def.capacity;
  if (W / n >= 24) return { rows: 1, cols: n, sw: W / n };
  const cols = Math.ceil(n / 2);
  return { rows: 2, cols, sw: W / cols };
}

// Where worker `slot` sits: origin of the person (hip x, floor y) and scale.
function deskSeat(def, W, slot) {
  const lay = deskLayout(def, W);
  const col = lay.rows === 1 ? slot : Math.floor(slot / 2);
  const row = lay.rows === 1 ? 0 : slot % 2;
  return { x: col * lay.sw + 8, y: row ? 38 : FLOOR_Y, scale: row ? 0.86 : 1, back: row === 1, sw: lay.sw };
}

// ---- Drawing helpers --------------------------------------------------------

function R(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}
function RR(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}
function C(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function windowPane(ctx, x, y, w, h, sky) {
  R(ctx, x - 1.2, y - 1.2, w + 2.4, h + 2.4, '#e9e4da');
  R(ctx, x, y, w, h, sky);
  R(ctx, x + w / 2 - 0.5, y, 1, h, '#e9e4da');
  R(ctx, x, y + h / 2 - 0.5, w, 1, '#e9e4da');
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x, y, w * 0.35, h * 0.5);
}

function plant(ctx, x, floorY, s = 1) {
  RR(ctx, x - 3 * s, floorY - 6 * s, 6 * s, 6 * s, 1, '#9a6b43');
  C(ctx, x, floorY - 9 * s, 4.5 * s, '#4f9d69');
  C(ctx, x - 3.5 * s, floorY - 7.5 * s, 3 * s, '#5fb07a');
  C(ctx, x + 3.5 * s, floorY - 7.5 * s, 3 * s, '#5fb07a');
}

function lamp(ctx, x, on) {
  R(ctx, x - 4, 3.5, 8, 1.4, '#f6f2e6');
  if (on) {
    ctx.fillStyle = 'rgba(255,236,170,0.22)';
    ctx.beginPath();
    ctx.moveTo(x - 4, 4.9);
    ctx.lineTo(x + 4, 4.9);
    ctx.lineTo(x + 16, 42);
    ctx.lineTo(x - 16, 42);
    ctx.closePath();
    ctx.fill();
  }
}

function table(ctx, x, floorY, w = 14, cloth = '#f4efe4') {
  R(ctx, x - w / 2, floorY - 9, w, 2, cloth);
  R(ctx, x - 0.8, floorY - 7, 1.6, 7, shade(cloth, 0.4));
  R(ctx, x - 3, floorY - 1, 6, 1, shade(cloth, 0.4));
}

// ---- The rooms --------------------------------------------------------------

const FLOORS = { office: '#8d99a6', apartment: '#a67c52', hotel: '#8a6f8f', shop: '#b5ae9f', service: '#7d868e', lobby: '#bdb7a8', skylobby: '#b4aa9a', atrium: '#7f9a6d', crown: '#c9a64a' };

// x, y, w, h: the room on screen (after the inset). look: { dark, lit, present, hour, seconds, sky, skyColor }
function paintRoom(ctx, kind, typeId, def, x, y, w, h, look) {
  const k = h / 48;
  const W = w / k;
  const night = look.dark;
  const occupied = look.lit > 0;
  const seconds = look.seconds ?? 0;
  const sky = mixToHex('#8ec5f2', '#16224a', Math.min(1, night * 1.1));
  const depth = look.depth ?? 0; // 0 above ground, 1 and 2: floors below the ground
  let wallBase = mixToHex(def.color, '#f4ead8', kind === 'service' ? 0.7 : 0.62);
  if (depth) wallBase = mixToHex(wallBase, '#8a6a4a', 0.16 * depth); // earthy

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0, 0, W, 48, 3);
  else ctx.rect(0, 0, W, 48);
  ctx.clip();

  // back wall, ceiling, floor
  R(ctx, 0, 0, W, 48, wallBase);
  if (kind === 'apartment' || kind === 'hotel') {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (let sx = 6; sx < W; sx += 12) ctx.fillRect(sx, 4, 5, 38); // wallpaper stripes
  }
  R(ctx, 0, 0, W, 3.5, shade(wallBase, 0.22));
  R(ctx, 0, 42, W, 6, FLOORS[kind] ?? '#888');
  R(ctx, 0, 41, W, 1.4, shade(wallBase, 0.3)); // skirting board
  R(ctx, 0, 42, W, 0.8, 'rgba(0,0,0,0.25)');

  const fn = FURNISH[typeId] ?? FURNISH[kind];
  if (fn) fn(ctx, def, W, { ...look, sky, occupied, seconds });

  // ceiling lights
  const lights = Math.max(1, Math.round(W / 90));
  for (let i = 0; i < lights; i++) lamp(ctx, (W * (i + 0.5)) / lights, occupied);

  // Empty rooms go dark at night; occupied ones stay warm.
  const dim = occupied ? 0 : night * 0.5 + (1 - night) * 0.07;
  if (dim > 0.01) R(ctx, 0, 0, W, 48, `rgba(10,16,40,${dim})`);
  // walls on both sides and the floor edge give the cut-away its frame
  R(ctx, 0, 0, 1.6, 48, 'rgba(30,36,46,0.55)');
  R(ctx, W - 1.6, 0, 1.6, 48, 'rgba(30,36,46,0.55)');
  if (depth) {
    // below ground: murkier light, and the bare earth showing at the edges
    R(ctx, 0, 0, W, 48, `rgba(38,22,8,${0.12 + 0.08 * depth})`);
    R(ctx, 0, 0, 3, 48, 'rgba(60,38,20,0.7)');
    R(ctx, W - 3, 0, 3, 48, 'rgba(60,38,20,0.7)');
    R(ctx, 0, 0, W, 2, 'rgba(60,38,20,0.55)');
  }
  ctx.restore();
}


// ---- Caching ------------------------------------------------------------------
//
// Painting a furnished room takes a few dozen drawing calls, and a tower has
// many rooms on screen. So each room is painted once into a small off-screen
// picture and that picture is reused every frame. A room is painted again only
// when something visible about it changes: night/day, lights on or off, the
// TV being on, or (for the few animated rooms) the next animation frame.

const cache = new Map();
const ANIMATED = new Set(['cafe', 'cinema', 'recycling', 'substation', 'clinic']);

export function drawRoom(ctx, kind, typeId, def, x, y, w, h, look) {
  // Paint at a few fixed sizes (a third of an octave apart) and let drawImage stretch to the
  // exact size, so zooming does not make every room repaint on every frame.
  const dpr = Math.min(3, Math.max(1, ctx.getTransform().a));
  const qi = Math.max(-6, Math.round(Math.log2(Math.max(0.05, (h / 48) * dpr)) * 3));
  const qk = 2 ** (qi / 3);
  const units = Math.max(8, Math.round((w / h) * 48));
  const pw = Math.max(1, Math.round(units * qk));
  const ph = Math.max(1, Math.round(48 * qk));
  const night = Math.round(look.dark * 8);
  const occupied = look.lit > 0 ? 1 : 0;
  const busy = look.present > 0 ? 1 : 0;
  const tv = look.hour >= 17.5 && look.hour < 24 ? 1 : 0;
  const tvAnim = tv && occupied && (kind === 'apartment' || kind === 'hotel');
  const frame = (ANIMATED.has(typeId) || tvAnim) && occupied ? Math.floor((look.seconds ?? 0) * 3) % 24 : 0;
  const depth = look.floor < 0 ? Math.min(2, -look.floor) : 0;
  const key = typeId + '|' + units + '|' + qi + '|' + night + occupied + busy + tv + '|' + frame + '|' + (look.isMain ? 1 : 0) + '|' + depth;
  let img = cache.get(key);
  if (!img) {
    if (cache.size > 160) cache.clear();
    img = document.createElement('canvas');
    img.width = pw;
    img.height = ph;
    paintRoom(img.getContext('2d'), kind, typeId, def, 0, 0, pw, ph, { ...look, dark: night / 8, hour: tv ? 20 : 12, seconds: frame / 3, present: busy, depth });
    cache.set(key, img);
  }
  ctx.drawImage(img, x, y, w, h);
}

function windowsAcross(ctx, W, sky, y = 9, h = 16) {
  const n = Math.max(1, Math.floor(W / 80));
  for (let i = 0; i < n; i++) windowPane(ctx, (W * (i + 0.5)) / n - 11, y, 22, h, sky);
}

const FURNISH = {
  lobby(ctx, def, W, look) {
    // glass wall with the sky behind, marble floor, plants, benches, a reception desk
    const n = Math.max(2, Math.floor(W / 44));
    for (let i = 0; i < n; i++) {
      const gx = (W * (i + 0.5)) / n - 14;
      R(ctx, gx - 1.5, 6, 31, 36, '#d9d6cc');
      R(ctx, gx, 7.5, 28, 33.5, look.sky);
      R(ctx, gx + 13.5, 7.5, 1.2, 33.5, '#d9d6cc');
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(gx, 7.5, 10, 14);
    }
    for (let i = 0; i < W; i += 12) R(ctx, i, 42, 6, 6, 'rgba(255,255,255,0.15)'); // marble checks
    if (look.isMain) {
      // the front doors in the middle, and a reception desk to one side
      const mx = W / 2;
      R(ctx, mx - 16, 9, 32, 33, '#59616b');
      R(ctx, mx - 14, 11, 13, 30, 'rgba(190,225,245,0.9)');
      R(ctx, mx + 1, 11, 13, 30, 'rgba(190,225,245,0.9)');
      R(ctx, mx - 18, 5, 36, 4, '#3a4a57');
      RR(ctx, W * 0.15, 31, 44, 11, 2, '#6e4a2c');
      R(ctx, W * 0.15, 29.5, 44, 2, '#d9c9a3');
      RR(ctx, W * 0.15 + 28, 22, 10, 7, 1, '#2b3440');
      R(ctx, W * 0.15 + 29.5, 23.5, 7, 4, look.occupied ? '#9fdcff' : '#5a6a7a');
      RR(ctx, W * 0.74, 15, 26, 16, 1.5, '#243a2e'); // directory board
      for (let i = 0; i < 4; i++) R(ctx, W * 0.74 + 3, 18 + i * 3.4, 16 - (i % 2) * 4, 1.2, '#f4efe4');
    }
    for (let i = 1; i < n; i += 2) plant(ctx, (W * i) / n, 42, 1.15);
    if (W > 150) {
      RR(ctx, W * 0.62, 36, 26, 5, 1.5, '#7d4a5c');
      R(ctx, W * 0.62 + 2, 41, 2, 2, '#3a2a30');
      R(ctx, W * 0.62 + 22, 41, 2, 2, '#3a2a30');
    }
  },

  skylobby(ctx, def, W, look) {
    // a lounge high above the city: floor-to-ceiling windows, sofas, tall plants, chandelier
    for (let i = 0; i < Math.floor(W / 40); i++) {
      R(ctx, 4 + i * 40, 6, 34, 35, '#e9e4da');
      R(ctx, 5.5 + i * 40, 7.5, 31, 32.5, look.sky);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(5.5 + i * 40, 7.5, 12, 14);
    }
    R(ctx, W / 2 - 0.5, 3, 1, 6, '#c9a64a');
    C(ctx, W / 2, 12, 4.5, '#ffe9a8');
    for (const sx of [W * 0.12, W * 0.62]) {
      RR(ctx, sx, 33, 34, 9, 2.5, '#5c7a8a');
      RR(ctx, sx, 27, 34, 8, 3, '#4a6676');
    }
    plant(ctx, W * 0.5, 42, 1.4);
    plant(ctx, W - 10, 42, 1.2);
    plant(ctx, 10, 42, 1.2);
  },

  atrium(ctx, def, W, look) {
    // a glass garden: tall windows onto the sky, a big tree, benches, a small pond
    R(ctx, 0, 0, W, 42, look.sky);
    for (let i = 8; i < W; i += 18) R(ctx, i, 0, 1.4, 42, 'rgba(255,255,255,0.55)');
    R(ctx, 0, 0, W, 1.4, 'rgba(255,255,255,0.55)');
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(0, 0, W * 0.3, 42);
    R(ctx, 0, 41, W, 7, '#6f8f5c');
    for (let i = 4; i < W; i += 7) C(ctx, i, 41.5 + (i % 3), 2.2, '#82a86b');
    const tx = W * 0.5;
    R(ctx, tx - 2.2, 14, 4.4, 28, '#7b5a3c');
    C(ctx, tx, 12, 15, '#4f9d69');
    C(ctx, tx - 12, 20, 10, '#5fb07a');
    C(ctx, tx + 12, 20, 10, '#5fb07a');
    RR(ctx, W * 0.16, 36, 22, 4, 1.5, '#8a6a4a'); // bench
    RR(ctx, W * 0.74, 38, 26, 4, 2, '#5aa9e6'); // pond
    plant(ctx, W - 8, 42, 1.1);
  },

  crown(ctx, def, W, look) {
    // the golden hall under the Crown: arched windows, columns, red carpet and chandeliers
    for (let i = 0; i < Math.floor(W / 40); i++) {
      const ax = 6 + i * (W / Math.floor(W / 40));
      R(ctx, ax, 14, 18, 28, look.sky);
      ctx.fillStyle = look.sky;
      ctx.beginPath();
      ctx.arc(ax + 9, 14, 9, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = '#c9a64a';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(ax, 14, 18, 28);
      R(ctx, ax + 18, 8, 5, 34, '#e9d9a0'); // column
    }
    R(ctx, 0, 41, W, 7, '#8c2f3e');
    R(ctx, 0, 41, W, 1.4, '#c9a64a');
    for (const cx of [W * 0.25, W * 0.5, W * 0.75]) {
      R(ctx, cx - 0.5, 3, 1, 5, '#c9a64a');
      C(ctx, cx, 11, 4, '#ffe9a8');
    }
  },

  office(ctx, def, W, look) {
    windowsAcross(ctx, W, look.sky, 8, 15);
    const lay = deskLayout(def, W);
    const drawDesk = (seat) => {
      ctx.save();
      ctx.translate(seat.x, seat.y);
      ctx.scale(seat.scale, seat.scale);
      const dw = Math.min(15, seat.sw - 16);
      R(ctx, 8, -8, dw, 2, '#8a6a4a');
      R(ctx, 8.6, -6, 1.4, 6, '#6e5238');
      R(ctx, 8 + dw - 2, -6, 1.4, 6, '#6e5238');
      R(ctx, 10 + dw * 0.3, -10, 2, 2, '#404750'); // monitor foot
      RR(ctx, 9 + dw * 0.12, -17, dw * 0.7, 7.5, 1, '#232a33');
      const glow = look.present > 0 ? 'rgba(150,215,255,0.85)' : 'rgba(80,100,120,0.5)';
      R(ctx, 10 + dw * 0.12, -16, dw * 0.7 - 2, 5.5, glow);
      ctx.restore();
    };
    for (let s = def.capacity - 1; s >= 0; s--) if (deskSeat(def, W, s).back) drawDesk(deskSeat(def, W, s));
    for (let s = 0; s < def.capacity; s++) if (!deskSeat(def, W, s).back) drawDesk(deskSeat(def, W, s));
    // water cooler and a plant at the far end
    if (W > 120) {
      RR(ctx, W - 26, 24, 7, 18, 1.5, '#dde6ec');
      RR(ctx, W - 25, 17, 5, 8, 2, 'rgba(120,190,255,0.8)');
      plant(ctx, W - 10, 42);
    }
  },

  apartment(ctx, def, W, look) {
    const compact = W < 100;
    const bedW = Math.min(40, W * 0.38);
    if (!compact) windowPane(ctx, 14, 8, 20, 14, look.sky); // above the bed; the TV has the other wall
    const bedX = 4;
    // bed
    R(ctx, bedX - 1.5, 22, 3, 20, '#6e5238');
    R(ctx, bedX, 34, bedW, 8, '#8a6a4a');
    RR(ctx, bedX + 1, 29.5, bedW - 2, 5, 2, '#f4efe4');
    RR(ctx, bedX + 2, 27.5, 9, 4, 2, '#fff');
    RR(ctx, bedX + bedW * 0.38, 29.5, bedW * 0.6, 5, 2, '#6c8fc7');
    // bedside table and lamp
    R(ctx, bedX + bedW + 1, 35, 6, 7, '#7d5a3c');
    C(ctx, bedX + bedW + 4, 31, 2.5, look.occupied ? '#ffe9a8' : '#cfc9b8');
    // sofa and television
    const sx = W * (compact ? 0.47 : 0.44);
    const tvOn = look.occupied && look.hour >= 17.5 && look.hour < 24;
    RR(ctx, sx + 5, 7, 22, 12, 1.5, '#1a1f26');
    ctx.fillStyle = tvOn ? `hsl(${(look.seconds * 40) % 360},55%,62%)` : '#2b3440';
    ctx.fillRect(sx + 6.5, 8.5, 19, 9);
    RR(ctx, sx, 26, 6, 16, 2, '#7d4a5c');
    RR(ctx, sx, 33, 34, 9, 2.5, '#8a5a6a');
    RR(ctx, sx, 27, 34, 8, 3, '#7d4a5c');
    // kitchen
    const kx = W * (compact ? 0.78 : 0.76);
    R(ctx, kx, 33, W - kx - 12, 9, '#d8d3c8');
    R(ctx, kx, 32, W - kx - 12, 1.8, '#7a7f86');
    R(ctx, kx, 12, W - kx - 12, 8, '#b9a58a');
    R(ctx, kx + 3, 30.5, 8, 1.5, '#444b53'); // hob
    RR(ctx, W - 11, 19, 9, 23, 1.2, '#e4e8ec'); // fridge
    R(ctx, W - 10, 30, 7, 0.8, '#aeb6bd');
    if (W >= 160) {
      plant(ctx, W * 0.34, 42, 1.2);
      R(ctx, W * 0.55, 6, 16, 10, '#d9c9a3'); // picture frame
      R(ctx, W * 0.55 + 1.5, 7.5, 13, 7, '#7bb0c9');
    }
  },

  hotel(ctx, def, W, look) {
    windowsAcross(ctx, W, look.sky, 8, 14);
    const bedW = Math.min(44, W * 0.5);
    R(ctx, 2.5, 23, 3, 19, '#5c4332');
    R(ctx, 4, 34, bedW, 8, '#7d5a3c');
    RR(ctx, 5, 29.5, bedW - 2, 5, 2, '#fbf8f1');
    RR(ctx, 6, 27.5, 9, 4, 2, '#fff');
    RR(ctx, 5 + bedW * 0.38, 29.5, bedW * 0.58, 5, 2, '#b4566e');
    const tvx = W * 0.6;
    const tvOn = look.occupied && look.hour >= 17 && look.hour < 24;
    RR(ctx, tvx, 9, 18, 11, 1.5, '#1a1f26');
    ctx.fillStyle = tvOn ? `hsl(${(look.seconds * 35 + 120) % 360},55%,60%)` : '#2b3440';
    ctx.fillRect(tvx + 1.4, 10.4, 15.2, 8.2);
    R(ctx, tvx + 2, 21, 14, 2, '#5c4332');
    if (W >= 150) {
      RR(ctx, W * 0.45, 33, 28, 9, 2.5, '#9a6a7a'); // suite sofa
      R(ctx, W - 28, 33, 22, 2, '#7d5a3c');
      R(ctx, W - 27, 35, 2, 7, '#5c4332');
      R(ctx, W - 9, 35, 2, 7, '#5c4332');
      plant(ctx, W - 36, 42);
    }
  },

  shop(ctx, def, W, look) {
    // shelves of colorful goods and a counter with a register
    for (const sy of [14, 23, 32]) {
      R(ctx, 6, sy + 6, W - 46, 1.4, '#7d5a3c');
      const items = Math.floor((W - 52) / 8);
      for (let i = 0; i < items; i++) {
        const hh = 3 + hash(i * 3 + sy) * 3;
        R(ctx, 8 + i * 8, sy + 6 - hh, 6, hh, ['#e86a5c', '#f2c14e', '#5aa9e6', '#7bc47f', '#c58ae8'][Math.floor(hash(i + sy) * 5)]);
      }
    }
    RR(ctx, W - 36, 31, 31, 11, 1.5, '#8a6a4a');
    RR(ctx, W - 28, 24, 11, 8, 1.5, '#2b3440');
    R(ctx, W - 27, 25, 9, 5, look.occupied ? '#9fdcff' : '#5a6a7a');
    plant(ctx, W - 40, 42, 0.9);
  },

  cafe(ctx, def, W, look) {
    // counter, espresso machine, pastry case, and two little tables
    RR(ctx, 4, 30, 52, 12, 1.5, '#7d4a2c');
    R(ctx, 4, 29, 52, 2, '#d9c9a3');
    RR(ctx, 10, 21, 14, 9, 1.5, '#4a5560');
    R(ctx, 12, 24, 4, 6, '#ff7a59');
    RR(ctx, 32, 24, 20, 6, 1, 'rgba(200,230,255,0.7)');
    R(ctx, 34, 26, 5, 4, '#e8a85c');
    R(ctx, 42, 26, 6, 4, '#c0763c');
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(16 + Math.sin(look.seconds * 2 + i) * 1.5, 19 - ((look.seconds * 3 + i * 3) % 8), 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    RR(ctx, 62, 10, 34, 14, 1.5, '#243a2e'); // menu board
    R(ctx, 66, 14, 20, 1.4, '#f4efe4');
    R(ctx, 66, 18, 14, 1.4, '#f4efe4');
    for (const tx of [W - 76, W - 34]) table(ctx, tx, 42, 14, '#c9a875');
    plant(ctx, W - 8, 42, 0.9);
  },

  restaurant(ctx, def, W, look) {
    R(ctx, 8, 9, 40, 22, '#6b3a2c'); // wine rack
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) C(ctx, 14 + c * 9, 14 + r * 7, 2.6, c % 2 ? '#7a1f3d' : '#2f5a3a');
    RR(ctx, W - 40, 28, 36, 14, 1.5, '#8a6a4a'); // service counter
    RR(ctx, W - 38, 16, 32, 9, 1, '#d8d3c8');
    ctx.fillStyle = '#7a7f86';
    for (let i = 0; i < 4; i++) ctx.fillRect(W - 35 + i * 8, 19, 3, 4);
    for (const tx of [70, 112, 154].filter((v) => v < W - 40)) {
      table(ctx, tx, 42, 16, '#f4efe4');
      C(ctx, tx, 31.5, 1.5, '#ffd37a'); // candle
    }
  },

  foodCourt(ctx, def, W, look) {
    const stalls = Math.floor(W / 64);
    const colors = ['#e86a5c', '#f2c14e', '#5aa9e6', '#7bc47f', '#c58ae8'];
    for (let i = 0; i < stalls; i++) {
      const sx = 6 + i * (W / stalls);
      const sw = W / stalls - 10;
      RR(ctx, sx, 27, sw, 15, 1.5, '#8a6a4a');
      R(ctx, sx - 1, 12, sw + 2, 7, colors[i % colors.length]);
      for (let a = 0; a < sw; a += 8) {
        ctx.fillStyle = a % 16 ? '#ffffff' : colors[i % colors.length];
        ctx.fillRect(sx + a, 19, Math.min(8, sw - a), 3);
      }
    }
    for (const tx of [W * 0.2, W * 0.45, W * 0.7, W * 0.9]) table(ctx, tx, 42, 14, '#d9d3c4');
  },

  cinema(ctx, def, W, look) {
    // a big screen with a moving picture, and rows of red seats
    RR(ctx, 24, 7, W - 48, 23, 1.5, '#0f1318');
    const hue = (look.seconds * 20) % 360;
    const g = ctx.createLinearGradient(26, 8, W - 26, 30);
    g.addColorStop(0, `hsl(${hue},50%,45%)`);
    g.addColorStop(1, `hsl(${(hue + 80) % 360},55%,35%)`);
    ctx.fillStyle = look.occupied ? g : '#222a33';
    ctx.fillRect(26, 9, W - 52, 19);
    C(ctx, 40 + ((look.seconds * 8) % (W - 90)), 20, 4, 'rgba(255,255,255,0.35)');
    for (const [row, sy] of [[0, 33], [1, 38.5]]) {
      for (let sx = 20 + row * 6; sx < W - 20; sx += 12) RR(ctx, sx, sy, 9, 9 - row * 0.5, 2.5, '#9b2f3f');
    }
  },

  ballroom(ctx, def, W, look) {
    for (let i = 0; i < W; i += 10) R(ctx, i, 41, 5, 1, i % 20 ? '#e8e0cc' : '#3a3d4a'); // dance floor
    // chandelier
    R(ctx, W / 2 - 0.5, 3, 1, 8, '#c9a64a');
    C(ctx, W / 2, 14, 5, '#ffe9a8');
    C(ctx, W / 2 - 9, 11, 3, '#ffe9a8');
    C(ctx, W / 2 + 9, 11, 3, '#ffe9a8');
    // stage with curtain
    RR(ctx, W - 62, 30, 56, 12, 1.5, '#6e4a2c');
    R(ctx, W - 62, 9, 12, 22, '#8c2f3e');
    R(ctx, W - 18, 9, 12, 22, '#8c2f3e');
    for (const tx of [30, 80, 130]) table(ctx, tx, 42, 14, '#f4efe4');
  },

  clinic(ctx, def, W, look) {
    RR(ctx, 6, 31, 52, 8, 2, '#e9eef2'); // hospital bed
    R(ctx, 8, 39, 2, 3, '#7a8590');
    R(ctx, 54, 39, 2, 3, '#7a8590');
    RR(ctx, 8, 28, 10, 4, 2, '#fff');
    R(ctx, 64, 8, 24, 10, '#f4f8fa'); // red cross sign
    R(ctx, 74, 6.5, 4, 13, '#d64545');
    R(ctx, 70, 11, 12, 4, '#d64545');
    R(ctx, W - 40, 10, 14, 22, '#9ecbe3'); // curtain
    for (let i = 0; i < 14; i += 3) R(ctx, W - 40 + i, 10, 1, 22, 'rgba(255,255,255,0.4)');
    RR(ctx, W - 22, 20, 14, 11, 1.5, '#1b222b'); // monitor
    ctx.strokeStyle = '#6dff9c';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const yy = 25.5 - (i % 4 === 2 ? 4 : 0) * (look.occupied ? 1 : 0.2);
      if (i === 0) ctx.moveTo(W - 21, yy);
      else ctx.lineTo(W - 21 + i, yy);
    }
    ctx.stroke();
    R(ctx, W - 16, 31, 2, 11, '#7a8590');
    R(ctx, W - 20, 41, 10, 1, '#7a8590');
  },

  security(ctx, def, W, look) {
    RR(ctx, 6, 8, W - 12, 17, 1.5, '#1b222b'); // monitor wall
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const mx = 9 + c * ((W - 18) / 3);
        ctx.fillStyle = look.occupied ? ['#4d8a5a', '#3f6e86', '#6a6f3d'][(c + r) % 3] : '#2c3a44';
        ctx.fillRect(mx, 10 + r * 7.5, (W - 18) / 3 - 3, 6);
      }
    }
    RR(ctx, 8, 31, W - 28, 11, 1.5, '#4a5560');
    R(ctx, 8, 30, W - 28, 1.6, '#6c7885');
    R(ctx, 16, 28, 8, 2, '#222');
    R(ctx, W - 16, 22, 8, 20, '#c9d1d8'); // locker
  },

  maintenance(ctx, def, W, look) {
    R(ctx, 6, 8, W - 12, 16, '#c7b08a'); // pegboard
    ctx.fillStyle = '#556';
    for (let i = 0; i < 5; i++) {
      R(ctx, 12 + i * 20, 11, 3, 10, i % 2 ? '#d64545' : '#6b7682');
      R(ctx, 10 + i * 20, 11, 7, 2, '#6b7682');
    }
    RR(ctx, 6, 31, W - 44, 11, 1.5, '#7d5a3c');
    R(ctx, 8, 28, 10, 3, '#555e68');
    RR(ctx, W - 34, 33, 14, 9, 1.5, '#d64545'); // toolbox
    R(ctx, W - 31, 31, 8, 2, '#8a2f2f');
    RR(ctx, W - 16, 31, 10, 11, 1.5, '#4a77a8'); // bucket
    R(ctx, W - 11, 20, 1.6, 12, '#a07a4a');
  },

  recycling(ctx, def, W, look) {
    const bins = [['#3f78c4', 'paper'], ['#4fa36a', 'glass'], ['#d9b23a', 'plastic']];
    const bw = Math.min(32, (W - 20) / 3 - 6);
    bins.forEach(([c], i) => {
      const bx = 10 + i * (bw + 8);
      RR(ctx, bx, 27, bw, 15, 2, c);
      R(ctx, bx - 1, 25.5, bw + 2, 3, shade(c, 0.25));
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(bx + bw / 2, 35, 3.6, 0.3, 4.6);
      ctx.stroke();
    });
    R(ctx, W - 30, 38, 26, 4, '#4a5560'); // conveyor
    for (let i = 0; i < 6; i++) R(ctx, W - 30 + ((i * 5 + look.seconds * 6) % 26), 38, 1, 4, '#2c333a');
    RR(ctx, W - 24 + ((look.seconds * 6) % 14), 33, 5, 5, 1, '#c9d1d8');
  },

  substation(ctx, def, W, look) {
    for (let i = 0; i < 2; i++) {
      const cx = 8 + i * (W / 2 - 4);
      RR(ctx, cx, 12, W / 2 - 16, 30, 2, '#9aa4ad');
      R(ctx, cx + 3, 16, W / 2 - 22, 2, '#6b7682');
      R(ctx, cx + 3, 22, W / 2 - 22, 2, '#6b7682');
      for (let s = 0; s < W / 2 - 16; s += 6) R(ctx, cx + s, 36, 3, 6, s % 12 ? '#e6b93a' : '#2b2f36');
    }
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.moveTo(W / 2 + 2, 8);
    ctx.lineTo(W / 2 - 4, 19);
    ctx.lineTo(W / 2, 19);
    ctx.lineTo(W / 2 - 3, 28);
    ctx.lineTo(W / 2 + 5, 15);
    ctx.lineTo(W / 2 + 1, 15);
    ctx.closePath();
    ctx.fill();
    if (look.occupied && Math.sin(look.seconds * 8) > 0.8) C(ctx, W / 2, 18, 9, 'rgba(255,230,120,0.25)');
  },

  parking(ctx, def, W, look) {
    const cars = ['#d95d4f', '#4f8fd9', '#e6b74a', '#5aae7a', '#8f7ad6'];
    const n = Math.floor(W / 60);
    for (let i = 0; i < n; i++) {
      const cx = 8 + i * (W / n);
      R(ctx, cx - 4, 41.5, 52, 0.8, 'rgba(255,255,255,0.7)'); // bay line
      if (hash(i * 3 + 7) > 0.2) {
        const c = cars[Math.floor(hash(i * 7) * cars.length)];
        RR(ctx, cx, 31, 44, 9.5, 3, c);
        RR(ctx, cx + 9, 24.5, 24, 8, 3, c);
        R(ctx, cx + 11, 26, 9, 5, 'rgba(180,220,245,0.85)');
        R(ctx, cx + 22, 26, 9, 5, 'rgba(180,220,245,0.85)');
        C(ctx, cx + 9, 41, 3.6, '#20252d');
        C(ctx, cx + 35, 41, 3.6, '#20252d');
      }
    }
    R(ctx, W - 10, 8, 5, 34, '#8c949c');
    RR(ctx, W - 14, 6, 13, 11, 1.5, '#3f78c4');
    ctx.fillStyle = '#fff';
    ctx.font = '700 9px system-ui, sans-serif';
    ctx.fillText('P', W - 11.5, 15);
  },

  gym(ctx, def, W, look) {
    RR(ctx, 6, 8, W - 12, 20, 1.5, 'rgba(190,225,245,0.55)'); // mirror
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(14, 8);
    ctx.lineTo(30, 8);
    ctx.lineTo(18, 28);
    ctx.lineTo(8, 28);
    ctx.closePath();
    ctx.fill();
    for (const tx of [16, 56]) {
      RR(ctx, tx, 39, 30, 3, 1, '#2b3440'); // belt
      R(ctx, tx + 22, 24, 2.5, 16, '#555e68');
      RR(ctx, tx + 17, 21, 12, 5, 1.5, '#222a33');
      const sparkle = look.occupied ? '#6dff9c' : '#556';
      R(ctx, tx + 19, 22.5, 8, 2, sparkle);
    }
    // bench and barbell
    RR(ctx, W - 62, 36, 28, 4, 1.5, '#3f4650');
    R(ctx, W - 58, 40, 2, 2, '#3f4650');
    R(ctx, W - 40, 40, 2, 2, '#3f4650');
    R(ctx, W - 66, 28, 36, 1.4, '#9aa4ad');
    C(ctx, W - 66, 28.7, 4, '#2b2f36');
    C(ctx, W - 30, 28.7, 4, '#2b2f36');
    // dumbbell rack
    R(ctx, W - 22, 28, 18, 14, '#555e68');
    for (let i = 0; i < 4; i++) C(ctx, W - 18 + i * 4, 33 + (i % 2) * 5, 1.8, '#c9d1d8');
  },
};

// ---- Who stands where, doing what -----------------------------------------

const SHIRTS = ['#4a90d9', '#e07a5f', '#81b29a', '#f2cc8f', '#9a7fcf', '#d4a373'];
export const shirtOf = (id) => SHIRTS[Math.abs(id) % SHIRTS.length];

// info: { typeId, def, W, slot, id, hour, seconds, mode, venue }
// venue is true when the person is visiting (a shop, cinema, gym...), false at their own desk or home.
// Returns { x, y, pose, flip, scale } in room units.
export function personSpot({ typeId, def, W, slot, id, hour, seconds, venue }) {
  const kind = def.style ?? typeId;
  const idr = hash(id);
  const phase = seconds + idr * 20;

  if (venue) {
    switch (typeId) {
      case 'cinema': {
        const seat = Math.floor(idr * ((W - 40) / 12));
        const row = Math.floor(hash(id + 3) * 2);
        return { x: 26 + seat * 12 + 4.5, y: (row ? 38.5 : 33) + 6.5, pose: 'watch', flip: false, scale: 1 };
      }
      case 'gym': {
        const t = slot % 2 === 0 ? 16 : 56;
        return { x: t + 14, y: 40, pose: 'run', flip: false, scale: 1 };
      }
      case 'clinic':
        return idr < 0.5 ? { x: 36, y: 31, pose: 'lie', flip: false, scale: 1 } : { x: 100 + idr * 20, y: 42, pose: 'sit', flip: true, scale: 1 };
      case 'cafe':
      case 'restaurant':
      case 'foodCourt': {
        const tables = typeId === 'cafe' ? [W - 76, W - 34] : typeId === 'restaurant' ? [70, 112, 154] : [W * 0.2, W * 0.45, W * 0.7, W * 0.9];
        const tx = tables[Math.floor(idr * tables.length) % tables.length];
        const left = hash(id + 9) < 0.5;
        return { x: tx + (left ? -10 : 10), y: 42, pose: 'eat', flip: !left, scale: 1 };
      }
      case 'ballroom': {
        return { x: 20 + idr * (W - 90), y: 42, pose: 'browse', flip: idr > 0.5, scale: 1 };
      }
      default: {
        // shops: browse the shelves, drifting slowly
        const x = W * 0.1 + (W * 0.6) * (0.5 + 0.5 * Math.sin(phase * 0.15 + idr * 6));
        return { x, y: 42, pose: 'browse', flip: Math.cos(phase * 0.15 + idr * 6) < 0, scale: 1 };
      }
    }
  }

  if (kind === 'office') {
    const seat = deskSeat(def, W, slot);
    const cycle = (seconds / 11 + idr) % 1;
    if (cycle > 0.9 && W > 120) return { x: W - 24, y: FLOOR_Y, pose: 'drink', flip: true, scale: 1 }; // water cooler
    if (cycle > 0.8) return { x: seat.x + 2, y: seat.y, pose: 'stand', flip: false, scale: seat.scale };
    return { x: seat.x, y: seat.y, pose: 'type', flip: false, scale: seat.scale };
  }

  if (kind === 'apartment' || kind === 'hotel') {
    const compact = W < 100;
    const bedW = Math.min(kind === 'hotel' ? 44 : 40, W * (kind === 'hotel' ? 0.5 : 0.38));
    const bedPillow = (kind === 'hotel' ? 6 : 5) + bedW * 0.55;
    const sofaX = W * (compact ? 0.47 : kind === 'hotel' ? 0.45 : 0.44) + 10 + (slot % 3) * 11;
    const kitchenX = W * (compact ? 0.78 : 0.76) + 6 + (slot % 3) * 9;
    const night = hour >= 22.5 || hour < 6.5;
    if (night && slot === 0) return { x: bedPillow, y: 34, pose: 'sleep', flip: false, scale: 1 };
    // deep night: a second person falls asleep on the sofa
    if (kind === 'apartment' && slot === 1 && (hour >= 23.5 || hour < 6)) return { x: W * (compact ? 0.47 : 0.44) + 14, y: 36, pose: 'sleep', flip: false, scale: 1 };
    if (kind === 'hotel') {
      return { x: sofaX - 6, y: 42, pose: 'tv', flip: false, scale: 1 };
    }
    const mealtime = (hour >= 6.5 && hour < 8.5) || (hour >= 17 && hour < 19.5);
    if (mealtime) {
      if (slot === 0) return { x: kitchenX, y: 42, pose: 'cook', flip: false, scale: 1 };
      if (slot === 1) return { x: kitchenX + 6, y: 42, pose: 'drink', flip: true, scale: 1 };
    }
    return { x: sofaX, y: 42, pose: 'tv', flip: false, scale: 1 };
  }

  return { x: W * (0.2 + 0.6 * idr), y: 42, pose: 'stand', flip: idr > 0.5, scale: 1 };
}

// A plain hall behind stairs and escalators: pale wall, ceiling band, floor and skirting.
export function drawHall(ctx, x, y, w, h, look) {
  const wall = mixToHex('#e6dfd0', '#16224a', Math.min(0.5, look.dark * 0.45));
  ctx.fillStyle = wall;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.fillRect(x, y, w, h * 0.07);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x, y + h * 0.875, w, h * 0.125);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x, y + h * 0.855, w, Math.max(1, h * 0.03));
}
