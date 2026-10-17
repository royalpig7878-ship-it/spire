// src/render/sky.js
//
// The sky: a gradient that follows the time of day, plus a sun, a moon and
// stars. `skyAt` also reports how dark it is (0 = day, 1 = night) so other
// drawing code can dim buildings and light windows.

import { mixToHex } from './color.js';

// Blends between the two keyframes surrounding `hour`.
export function skyAt(hour, config) {
  const frames = config.sky.keyframes;
  let i = 0;
  while (i < frames.length - 2 && hour >= frames[i + 1].hour) i++;
  const a = frames[i];
  const b = frames[i + 1];
  const t = Math.min(1, Math.max(0, (hour - a.hour) / (b.hour - a.hour)));
  return {
    top: mixToHex(a.top, b.top, t),
    bottom: mixToHex(a.bottom, b.bottom, t),
    dark: a.dark + (b.dark - a.dark) * t,
  };
}

// Stars at fixed pseudo-random spots (same every frame, no flicker).
let stars = null;
function getStars(count) {
  if (stars && stars.length === count) return stars;
  stars = [];
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < count; i++) stars.push({ x: rand(), y: rand() * 0.6, r: 0.6 + rand() * 1.2 });
  return stars;
}

export function drawSky(ctx, W, H, hour, config) {
  const sky = skyAt(hour, config);
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, sky.top);
  gradient.addColorStop(1, sky.bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  // Stars fade in with darkness.
  if (sky.dark > 0.3) {
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = (sky.dark - 0.3) / 0.7;
    for (const s of getStars(config.sky.starCount)) {
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Sun crosses the sky 6:00-18:00, the moon 18:00-6:00.
  const drawBody = (progress, radius, color, glow) => {
    if (progress < 0 || progress > 1) return;
    const x = W * (0.08 + 0.84 * progress);
    const y = H * 0.42 - Math.sin(Math.PI * progress) * H * 0.3;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  };
  drawBody((hour - 6) / 12, 20, '#ffe27a', 'rgba(255,226,122,0.25)');
  drawBody(((hour + 6) % 24) / 12, 15, '#eef2ff', 'rgba(238,242,255,0.18)');

  return sky;
}
