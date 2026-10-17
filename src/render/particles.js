// src/render/particles.js
//
// Short-lived puffs and bits: a cloud of dust when something is built, flying
// debris when something is torn down. Pure decoration: positions are in world
// units, so they stay put as you pan and zoom.

const MAX = 120;

export function spawnDust(list, config, facility) {
  const { cellWidth, floorHeight } = config.grid;
  const x0 = facility.cell * cellWidth;
  const w = facility.width * cellWidth;
  const baseY = -facility.floor * floorHeight;
  for (let i = 0; i < 12 && list.length < MAX; i++) {
    list.push({
      x: x0 + Math.random() * w,
      y: baseY - 2,
      vx: (Math.random() - 0.5) * 30,
      vy: -10 - Math.random() * 22,
      age: 0,
      life: 0.5 + Math.random() * 0.4,
      size: 4 + Math.random() * 5,
      color: '#efe8d8',
      gravity: -4,
    });
  }
}

export function spawnDebris(list, config, facility, color) {
  const { cellWidth, floorHeight } = config.grid;
  const x0 = facility.cell * cellWidth;
  const w = facility.width * cellWidth;
  const midY = -(facility.floor + facility.height / 2) * floorHeight;
  for (let i = 0; i < 16 && list.length < MAX; i++) {
    list.push({
      x: x0 + Math.random() * w,
      y: midY + (Math.random() - 0.5) * floorHeight * facility.height,
      vx: (Math.random() - 0.5) * 90,
      vy: -30 - Math.random() * 60,
      age: 0,
      life: 0.7 + Math.random() * 0.5,
      size: 2.5 + Math.random() * 4,
      color: Math.random() < 0.5 ? color : '#8b8f94',
      gravity: 220,
    });
  }
}

export function updateParticles(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.age += dt;
    if (p.age >= p.life) {
      list.splice(i, 1);
      continue;
    }
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

export function drawParticles(ctx, W, H, camera, list) {
  if (!list.length) return;
  const zoom = camera.zoom;
  for (const p of list) {
    const sx = (p.x - camera.x) * zoom + W / 2;
    const sy = (p.y - camera.y) * zoom + H / 2;
    const k = 1 - p.age / p.life;
    ctx.globalAlpha = Math.max(0, k) * 0.9;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(1, p.size * zoom * (0.6 + 0.6 * (1 - k))), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
