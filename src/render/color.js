// src/render/color.js
// Tiny color helpers for "#rrggbb" strings.

function parse(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Blend color a toward color b. t = 0 gives a, t = 1 gives b.
export function mixHex(a, b, t) {
  if (t <= 0) return a;
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

// mixHex returns "rgb(...)" strings; this variant always returns "#rrggbb"
// so the result can be fed back into other helpers.
export function mixToHex(a, b, t) {
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const to = (x, y) => Math.round(x + (y - x) * Math.min(1, Math.max(0, t)));
  const h = (v) => v.toString(16).padStart(2, '0');
  return `#${h(to(ar, br))}${h(to(ag, bg))}${h(to(ab, bb))}`;
}
