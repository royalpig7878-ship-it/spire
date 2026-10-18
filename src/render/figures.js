// src/render/figures.js
//
// The tiny stylized people. A round head (tinted by personality trait) on a
// simple body (tinted by mood). Moods beyond calm also get a "!" bubble so
// mood never depends on color alone.

import { roundedRectPath } from './facilities.js';

export const MOOD_COLORS = { calm: '#4a90d9', impatient: '#f0a830', stressed: '#e0503c' };

// stress (0-100) -> 'calm' | 'impatient' | 'stressed', using config thresholds.
export function moodOfStress(stress, sc) {
  if (stress >= sc.stressedAbove) return 'stressed';
  if (stress >= sc.calmBelow) return 'impatient';
  return 'calm';
}

const HAIR = ['#3b2a20', '#6b4423', '#1f1f24', '#b5651d', '#8d8d93'];

// opts (all optional): { rich, walk, hair, bag }
//   rich - draw legs, arms and hair instead of a plain capsule
//   walk - null when standing, otherwise a phase (radians) that swings the legs
//   hair - index into the hair colors; bag - carry a briefcase
export function drawFigure(ctx, cx, baseY, size, bodyColor, mood, headColor = '#f1d3b3', opts = null) {
  if (opts?.rich && size >= 7) drawRichPerson(ctx, cx, baseY, size, bodyColor, headColor, opts);
  else {
    ctx.fillStyle = bodyColor;
    roundedRectPath(ctx, cx - size * 0.17, baseY - size * 0.56, size * 0.34, size * 0.56, size * 0.1);
    ctx.fill();
    ctx.fillStyle = headColor;
    ctx.beginPath();
    ctx.arc(cx, baseY - size * 0.72, size * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }
  if (mood !== 'calm' && size > 9) {
    const r = size * 0.14;
    const by = baseY - size * 1.05;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, by, r * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mood === 'stressed' ? '#c0392b' : '#b9770e';
    ctx.font = `700 ${Math.max(7, r * 2.4)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(mood === 'stressed' ? '!!' : '!', cx, by + r * 0.1);
    ctx.textAlign = 'start';
  }
}

function drawRichPerson(ctx, cx, baseY, size, bodyColor, headColor, opts) {
  const swing = opts.walk === null || opts.walk === undefined ? 0 : Math.sin(opts.walk);
  const legTop = baseY - size * 0.26;
  const lw = Math.max(1, size * 0.085);
  // legs (dark trousers), swinging opposite each other while walking
  ctx.strokeStyle = '#2d3748';
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.07, legTop);
  ctx.lineTo(cx - size * 0.07 + swing * size * 0.12, baseY);
  ctx.moveTo(cx + size * 0.07, legTop);
  ctx.lineTo(cx + size * 0.07 - swing * size * 0.12, baseY);
  ctx.stroke();
  // torso
  ctx.fillStyle = bodyColor;
  roundedRectPath(ctx, cx - size * 0.16, baseY - size * 0.56, size * 0.32, size * 0.34, size * 0.1);
  ctx.fill();
  // arms
  ctx.strokeStyle = bodyColor;
  ctx.lineWidth = Math.max(1, size * 0.075);
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.16, baseY - size * 0.5);
  ctx.lineTo(cx - size * 0.2 - swing * size * 0.06, baseY - size * 0.3);
  ctx.moveTo(cx + size * 0.16, baseY - size * 0.5);
  ctx.lineTo(cx + size * 0.2 + swing * size * 0.06, baseY - size * 0.3);
  ctx.stroke();
  if (opts.bag) {
    ctx.fillStyle = '#5b3a24';
    roundedRectPath(ctx, cx + size * 0.14 + swing * size * 0.06, baseY - size * 0.3, size * 0.16, size * 0.12, size * 0.02);
    ctx.fill();
  }
  // head and hair
  ctx.fillStyle = headColor;
  ctx.beginPath();
  ctx.arc(cx, baseY - size * 0.72, size * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = HAIR[(opts.hair ?? 0) % HAIR.length];
  ctx.beginPath();
  ctx.arc(cx, baseY - size * 0.74, size * 0.175, Math.PI * 1.05, Math.PI * 1.95);
  ctx.closePath();
  ctx.fill();
}
