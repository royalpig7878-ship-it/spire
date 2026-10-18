// src/render/poses.js
//
// Tiny people doing tiny things, for the cutaway rooms (M10). Everything is
// drawn in "room units": the room is 48 units tall and a person about 26
// units tall, with the origin at the feet (or, lying down, at the mattress).
// The caller moves and scales the canvas first, so these functions never
// care how far you have zoomed.

const HAIR = ['#3b2a20', '#6b4423', '#1f1f24', '#b5651d', '#8d8d93', '#d9b75e'];
export const hairOf = (id) => HAIR[Math.abs(id) % HAIR.length];

function limb(ctx, x1, y1, x2, y2, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function roundBox(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

function head(ctx, x, y, skin, hair, r = 4.2) {
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.arc(x, y - 0.4, r + 0.3, Math.PI * 1.05, Math.PI * 1.95);
  ctx.closePath();
  ctx.fill();
}

const PANTS = '#2d3748';

// pose: 'stand' | 'sit' | 'type' | 'tv' | 'eat' | 'drink' | 'cook' | 'browse'
//       | 'sleep' | 'run' | 'watch' | 'lie'
// c: { shirt, skin, hair }.  phase: seconds-based number for animation.
export function drawPose(ctx, pose, x, y, scale, flip, phase, c) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -scale : scale, scale);
  switch (pose) {
    case 'sleep':
    case 'lie': {
      // lying on a bed, under a blanket, with a pillow
      roundBox(ctx, -14, -4, 9, 4, 2, '#f4f1ea');
      head(ctx, -10, -3.2, c.skin, c.hair, 3.8);
      roundBox(ctx, -6, -5, 20, 6, 2.5, '#6c8fc7');
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(-6, -5, 20, 1.4);
      if (pose === 'sleep') {
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 6px system-ui, sans-serif';
        const rise = (phase * 3) % 8;
        ctx.globalAlpha = 1 - rise / 8;
        ctx.fillText('z', -6 + rise * 0.4, -9 - rise);
        ctx.globalAlpha = 1;
      }
      break;
    }
    case 'watch': {
      // seen from behind in a cinema seat: just head and shoulders
      roundBox(ctx, -4.5, -13, 9, 6, 3, c.shirt);
      head(ctx, 0, -16.5, c.skin, c.hair);
      break;
    }
    case 'run': {
      // on a treadmill: fast legs, swinging arms, a little bounce
      const s = Math.sin(phase * 9);
      const bob = Math.abs(Math.sin(phase * 9)) * 0.8;
      limb(ctx, -1, -10 - bob, -1 + s * 6, 0, 3, PANTS);
      limb(ctx, 1, -10 - bob, 1 - s * 6, 0, 3, PANTS);
      roundBox(ctx, -4.5, -21 - bob, 9, 12, 3, c.shirt);
      limb(ctx, 0, -18 - bob, 4 - s * 5, -12 - bob, 2.4, c.shirt);
      limb(ctx, 0, -18 - bob, -4 + s * 5, -12 - bob, 2.4, c.shirt);
      head(ctx, 0.5, -25.5 - bob, c.skin, c.hair);
      break;
    }
    case 'sit':
    case 'type':
    case 'tv':
    case 'eat': {
      // seated, facing right; a chair under them for the working poses
      if (pose !== 'tv') {
        roundBox(ctx, -6.5, -9.5, 11, 1.8, 0.8, '#59616b'); // seat
        roundBox(ctx, -7, -21, 1.8, 12, 0.8, '#59616b'); // back
        ctx.fillStyle = '#3d444c';
        ctx.fillRect(-2, -8, 1.6, 8);
      }
      limb(ctx, -1, -9, 7, -9, 3.2, PANTS); // thigh
      limb(ctx, 7, -9, 7, -0.5, 3, PANTS); // shin
      roundBox(ctx, -4.5, -21, 9, 12.5, 3, c.shirt);
      if (pose === 'type') {
        const tap = Math.sin(phase * 12) * 0.9;
        limb(ctx, 2, -18, 9, -13 + tap, 2.4, c.shirt);
        limb(ctx, 2, -18, 9.5, -13 - tap, 2.4, c.shirt);
      } else if (pose === 'eat') {
        const bob = Math.sin(phase * 3) * 3;
        limb(ctx, 2, -18, 9, -13 - Math.max(0, bob), 2.4, c.shirt);
        limb(ctx, 2, -18, 7, -12, 2.4, c.shirt);
        ctx.fillStyle = '#ddd';
        ctx.fillRect(9.5, -15 - Math.max(0, bob), 1.4, 3);
      } else {
        limb(ctx, 2, -18, 6, -11, 2.4, c.shirt);
      }
      head(ctx, pose === 'tv' ? 0.5 : 0, -25.5, c.skin, c.hair);
      break;
    }
    case 'drink': {
      const sip = (Math.sin(phase * 1.6) + 1) / 2;
      limb(ctx, -1.2, -10, -1.8, 0, 3, PANTS);
      limb(ctx, 1.2, -10, 1.8, 0, 3, PANTS);
      roundBox(ctx, -4.5, -21, 9, 12, 3, c.shirt);
      limb(ctx, 2, -18, 6, -17 - sip * 5, 2.4, c.shirt);
      limb(ctx, -2, -18, -5, -11, 2.4, c.shirt);
      roundBox(ctx, 5.2, -21 - sip * 5, 3.4, 4, 1, '#f4f1ea');
      head(ctx, 0, -25.5, c.skin, c.hair);
      break;
    }
    case 'cook': {
      const stir = Math.sin(phase * 5) * 2;
      limb(ctx, -1.2, -10, -1.8, 0, 3, PANTS);
      limb(ctx, 1.2, -10, 1.8, 0, 3, PANTS);
      roundBox(ctx, -4.5, -21, 9, 12, 3, c.shirt);
      limb(ctx, 2, -18, 8 + stir * 0.4, -13, 2.4, c.shirt);
      limb(ctx, -2, -18, -5, -11, 2.4, c.shirt);
      head(ctx, 0.5, -25.5, c.skin, c.hair);
      break;
    }
    case 'walk': {
      const s = Math.sin(phase * 9);
      const bob = Math.abs(s) * 0.7;
      limb(ctx, -1.2, -10 - bob, -1.2 + s * 4.5, 0, 3, PANTS);
      limb(ctx, 1.2, -10 - bob, 1.2 - s * 4.5, 0, 3, PANTS);
      roundBox(ctx, -4.5, -21 - bob, 9, 12, 3, c.shirt);
      limb(ctx, 0, -19 - bob, -s * 4.5, -11 - bob, 2.4, c.shirt);
      limb(ctx, 0, -19 - bob, s * 4.5, -11 - bob, 2.4, c.shirt);
      if (c.bag) roundBox(ctx, 4 + s * 3, -13 - bob, 6, 5, 1, '#5b3a24');
      head(ctx, 0.6, -25.5 - bob, c.skin, c.hair);
      break;
    }
    case 'browse':
    case 'stand':
    default: {
      const walk = pose === 'browse' ? Math.sin(phase * 3) : 0;
      limb(ctx, -1.4, -10, -1.4 + walk * 2.5, 0, 3, PANTS);
      limb(ctx, 1.4, -10, 1.4 - walk * 2.5, 0, 3, PANTS);
      roundBox(ctx, -4.5, -21, 9, 12, 3, c.shirt);
      limb(ctx, -4, -19, -5.5 - walk, -10.5, 2.4, c.shirt);
      limb(ctx, 4, -19, 5.5 + walk, -10.5, 2.4, c.shirt);
      head(ctx, 0, -25.5, c.skin, c.hair);
    }
  }
  ctx.restore();
}
