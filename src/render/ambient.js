// src/render/ambient.js
//
// Little touches of life that do not affect the game: soft clouds drifting
// across the day sky, a flock of birds now and then, and odd things flying by
// (planes, blimps, helicopters, balloons, kites, a UFO at night). Everything is a simple function of the
// clock, so nothing is stored. Skipped entirely in battery-saver graphics.


// Clouds and birds: drawn right after the sky, behind everything else.
export function drawSkyLife(ctx, W, H, camera, hour, seconds, dark) {
  const day = 1 - dark;
  if (day < 0.15) return;
  ctx.save();
  ctx.fillStyle = `rgba(255,255,255,${0.55 * day})`;
  for (let i = 0; i < 5; i++) {
    const speed = 5 + i * 2.2;
    const span = W + 300;
    // clouds slide slowly, and shift a little as you pan (they are far away)
    const x = ((seconds * speed + i * 211 - camera.x * 0.05) % span + span) % span - 150;
    const y = H * (0.07 + i * 0.075) - camera.y * 0.02;
    const s = 0.7 + (i % 3) * 0.25;
    ctx.beginPath();
    ctx.ellipse(x, y, 52 * s, 15 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 30 * s, y + 5 * s, 30 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 34 * s, y + 6 * s, 34 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // A flock of birds crosses the sky every so often.
  const cycle = 52;
  const phase = (seconds % cycle) / cycle;
  if (phase < 0.45 && hour > 6.5 && hour < 18.5) {
    const t = phase / 0.45;
    ctx.strokeStyle = `rgba(40,50,70,${0.7 * day})`;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (let b = 0; b < 5; b++) {
      const bx = -40 + t * (W + 120) - b * 22;
      const by = H * 0.22 + Math.sin(t * 6 + b) * 12 + b * 8;
      const flap = Math.sin(seconds * 9 + b * 1.3) * 4;
      ctx.beginPath();
      ctx.moveTo(bx - 7, by + flap);
      ctx.quadraticCurveTo(bx - 3, by - 3, bx, by);
      ctx.quadraticCurveTo(bx + 3, by - 3, bx + 7, by + flap);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Odd things that fly past, far behind the tower. Time is cut into "epochs" per
// lane; a hash of the epoch number decides whether something flies in it, what,
// which way and how high - so the pattern looks random but needs no storage.
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const FLYERS = ['plane', 'blimp', 'helicopter', 'balloon', 'plane', 'helicopter', 'ufo', 'kite'];
const LANES = 3;

export function drawFlyers(ctx, W, H, camera, seconds, dark) {
  ctx.save();
  for (let lane = 0; lane < LANES; lane++) {
    const epochLen = 47 + lane * 31; // a different rhythm in every lane
    const epochNo = Math.floor(seconds / epochLen);
    const epoch = epochNo + lane * 1000;
    if (hash(epoch) > 0.55) continue; // quiet epoch: nothing flies
    const kind = FLYERS[Math.floor(hash(epoch + 0.3) * FLYERS.length)];
    if (kind === 'ufo' && dark < 0.5) continue; // UFOs only come out at night
    const dur = { plane: 14, blimp: 36, helicopter: 22, balloon: 44, ufo: 12, kite: 30 }[kind];
    const startAt = hash(epoch + 0.6) * (epochLen - dur);
    const t = (seconds - epochNo * epochLen - startAt) / dur;
    if (t < 0 || t > 1) continue;
    const dir = hash(epoch + 0.9) < 0.5 ? 1 : -1;
    const x = (dir > 0 ? -90 + t * (W + 180) : W + 90 - t * (W + 180)) - camera.x * 0.03;
    let y = H * (0.1 + hash(epoch + 1.2) * 0.3) - camera.y * 0.02;
    if (kind === 'ufo' || kind === 'kite' || kind === 'balloon') y += Math.sin(seconds * 1.7 + epoch) * 6;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    drawFlyer(ctx, kind, seconds, dark);
    ctx.restore();
  }
  ctx.restore();
}

function drawFlyer(ctx, kind, seconds, dark) {
  const body = dark > 0.5 ? '#9aa5b8' : '#eef1f5';
  const dim = dark > 0.5 ? '#5d6880' : '#9aa7b8';
  const blink = Math.floor(seconds * 2) % 2 === 0;
  if (kind === 'plane') {
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = dim;
    ctx.beginPath(); // wing and tail
    ctx.moveTo(-2, 0); ctx.lineTo(-10, 9); ctx.lineTo(-5, 9); ctx.lineTo(6, 0); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-18, 0); ctx.lineTo(-24, -8); ctx.lineTo(-19, -8); ctx.lineTo(-12, 0); ctx.fill();
    if (dark > 0.35 && blink) { ctx.fillStyle = '#ff5a5a'; ctx.fillRect(-1, 5, 2, 2); }
    ctx.strokeStyle = `rgba(255,255,255,${0.35 * (1 - dark)})`; // contrail
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-24, 1); ctx.lineTo(-90, 1); ctx.stroke();
  } else if (kind === 'blimp') {
    ctx.fillStyle = '#e8b04a';
    ctx.beginPath(); ctx.ellipse(0, 0, 36, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c4452f';
    ctx.fillRect(-14, -9, 6, 18);
    ctx.fillStyle = dim;
    ctx.fillRect(-6, 10, 12, 5);
    ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(-44, -9); ctx.lineTo(-44, 9); ctx.fill();
  } else if (kind === 'helicopter') {
    ctx.fillStyle = '#d95d4f';
    ctx.beginPath(); ctx.ellipse(0, 0, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(-26, -2, 16, 3);
    ctx.fillRect(-27, -8, 2, 8);
    ctx.fillStyle = 'rgba(170,210,240,0.8)';
    ctx.beginPath(); ctx.ellipse(5, -1, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = dim;
    ctx.lineWidth = 1.6;
    const spin = Math.sin(seconds * 40) * 20;
    ctx.beginPath(); ctx.moveTo(-spin, -9); ctx.lineTo(spin, -9); ctx.moveTo(0, -9); ctx.lineTo(0, -7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, 10); ctx.lineTo(12, 10); ctx.stroke();
    if (dark > 0.35 && blink) { ctx.fillStyle = '#ff5a5a'; ctx.fillRect(-27, -9, 3, 3); }
  } else if (kind === 'balloon') {
    ctx.fillStyle = '#d96a4f';
    ctx.beginPath(); ctx.ellipse(0, -10, 13, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f3d36b';
    ctx.beginPath(); ctx.ellipse(0, -10, 5, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = dim;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-7, 4); ctx.lineTo(-3, 11); ctx.moveTo(7, 4); ctx.lineTo(3, 11); ctx.stroke();
    ctx.fillStyle = '#8a5a3a';
    ctx.fillRect(-4, 11, 8, 5);
  } else if (kind === 'ufo') {
    const glow = ctx.createRadialGradient(0, 4, 0, 0, 4, 40);
    glow.addColorStop(0, 'rgba(150,255,200,0.35)');
    glow.addColorStop(1, 'rgba(150,255,200,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-40, -36, 80, 80);
    ctx.fillStyle = '#aeb9c9';
    ctx.beginPath(); ctx.ellipse(0, 0, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(150,255,200,0.9)';
    ctx.beginPath(); ctx.ellipse(0, -4, 8, 6, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = blink ? '#ffe07a' : '#7affc1';
    for (const px of [-10, 0, 10]) ctx.fillRect(px - 1, 2, 2, 2);
  } else if (kind === 'kite') {
    const sway = Math.sin(seconds * 3) * 3;
    ctx.fillStyle = '#e0517a';
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 0); ctx.lineTo(0, 12); ctx.lineTo(-8, 0); ctx.fill();
    ctx.strokeStyle = '#e8c85a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 12); ctx.quadraticCurveTo(-8 + sway, 20, -4, 28); ctx.quadraticCurveTo(4 - sway, 34, -2, 40); ctx.stroke();
  }
}
