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

// Darkens a "#rrggbb" color by `amount` (0..1) for trims and shadows.
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amount));
  const g = Math.round(((n >> 8) & 255) * (1 - amount));
  const b = Math.round((n & 255) * (1 - amount));
  return `rgb(${r},${g},${b})`;
}

// x,y = top-left on screen; w,h = size in screen pixels; cellPx = one cell's width.
// isMain marks the original lobby (it gets the front doors).
export function drawFacility(ctx, typeId, def, x, y, w, h, cellPx, detailed, isMain) {
  const inset = Math.max(0.5, h * 0.015);
  x += inset;
  y += inset;
  w -= inset * 2;
  h -= inset * 2;

  ctx.fillStyle = def.color;
  roundedRectPath(ctx, x, y, w, h, h * 0.12);
  ctx.fill();
  if (!detailed) return;

  const dark = shade(def.color, 0.25);
  const cells = Math.max(1, Math.round(w / cellPx));

  if (typeId === 'office') {
    ctx.fillStyle = dark; // roof parapet
    roundedRectPath(ctx, x, y, w, h * 0.12, h * 0.06);
    ctx.fill();
    for (let i = 0; i < cells; i++) {
      const wx = x + i * cellPx + cellPx * 0.12;
      const wy = y + h * 0.26;
      ctx.fillStyle = def.accent;
      roundedRectPath(ctx, wx, wy, cellPx * 0.76, h * 0.46, h * 0.05);
      ctx.fill();
      ctx.fillStyle = shade(def.accent, 0.18); // window mullion
      ctx.fillRect(wx + cellPx * 0.37, wy, Math.max(1, cellPx * 0.02), h * 0.46);
    }
  } else if (typeId === 'apartment') {
    for (let i = 0; i < cells; i++) {
      const cx = x + i * cellPx + cellPx / 2;
      const ww = cellPx * 0.42;
      const wy = y + h * 0.2;
      const wh = h * 0.5;
      ctx.fillStyle = def.accent; // arched window
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
  } else if (typeId === 'cafe') {
    const awningH = h * 0.3;
    const stripe = cellPx / 2;
    const stripes = Math.ceil(w / stripe);
    ctx.save();
    roundedRectPath(ctx, x, y, w, h, h * 0.12);
    ctx.clip();
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? def.accent : dark;
      const sx = x + i * stripe;
      const sw = Math.min(stripe, x + w - sx);
      ctx.fillRect(sx, y, sw, awningH);
      ctx.beginPath(); // scalloped edge
      ctx.arc(sx + sw / 2, y + awningH, sw / 2, 0, Math.PI);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = shade(def.accent, 0.08); // shop window
    roundedRectPath(ctx, x + w * 0.06, y + h * 0.5, w * 0.88, h * 0.38, h * 0.06);
    ctx.fill();
    // Coffee cup icon
    const cx = x + w / 2;
    const cy = y + h * 0.69;
    const s = h * 0.1;
    ctx.fillStyle = '#6b4226';
    ctx.beginPath();
    ctx.moveTo(cx - s, cy - s * 0.7);
    ctx.lineTo(cx + s, cy - s * 0.7);
    ctx.lineTo(cx + s * 0.7, cy + s * 0.8);
    ctx.lineTo(cx - s * 0.7, cy + s * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6b4226';
    ctx.lineWidth = Math.max(1, s * 0.3);
    ctx.beginPath();
    ctx.arc(cx + s, cy, s * 0.45, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
  } else if (typeId === 'lobby') {
    ctx.fillStyle = dark; // base strip
    ctx.fillRect(x, y + h * 0.88, w, h * 0.12);
    for (let i = 0; i < cells; i++) {
      ctx.fillStyle = def.accent; // tall glass panels
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
      ctx.fillStyle = def.accent; // two door panes
      ctx.fillRect(dx + doorW * 0.06, y + h * 0.3, doorW * 0.41, h * 0.54);
      ctx.fillRect(dx + doorW * 0.53, y + h * 0.3, doorW * 0.41, h * 0.54);
    }
  }
}
