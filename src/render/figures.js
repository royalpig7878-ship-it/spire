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

export function drawFigure(ctx, cx, baseY, size, bodyColor, mood, headColor = '#f1d3b3') {
  ctx.fillStyle = bodyColor;
  roundedRectPath(ctx, cx - size * 0.17, baseY - size * 0.56, size * 0.34, size * 0.56, size * 0.1);
  ctx.fill();
  ctx.fillStyle = headColor;
  ctx.beginPath();
  ctx.arc(cx, baseY - size * 0.72, size * 0.17, 0, Math.PI * 2);
  ctx.fill();
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
