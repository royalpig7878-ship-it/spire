// src/render/weather.js
//
// Draws today's weather: rain, snow, a grey wash or heat haze over the part of the
// scene ABOVE the ground, and drifting cloud cover in the SKY behind the buildings.
// Underground there is no weather at all. Everything is cheap vector shapes placed
// by a simple formula of the time, so nothing needs storing.

// quality: 1 normally; lower in battery-saver mode (fewer drops and flakes).
// groundY: the screen row of the ground line. Weather only falls above it, so when the
// camera is down in the basement or the dirt there is no rain, snow or grey wash.
export function drawWeather(ctx, W, H, kind, seconds, quality = 1, groundY = H) {
  if (kind === 'clear') return;
  const skyH = Math.min(H, groundY);
  if (skyH <= 0) return;
  H = skyH; // everything below uses the visible sky-and-street height
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, skyH);
  ctx.clip();
  if (kind === 'cloudy') {
    ctx.fillStyle = 'rgba(95,108,125,0.16)';
    ctx.fillRect(0, 0, W, H);
  } else if (kind === 'rain') {
    ctx.fillStyle = 'rgba(70,82,100,0.26)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(200,220,245,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    const drops = Math.min(140, Math.round((W * H) / 3500)) * quality;
    for (let i = 0; i < drops; i++) {
      const x = (i * 97.3) % (W + 40);
      const y = (seconds * 520 + i * 61.7) % (H + 30);
      ctx.moveTo(x, y);
      ctx.lineTo(x - 5, y + 13);
    }
    ctx.stroke();
  } else if (kind === 'snow') {
    ctx.fillStyle = 'rgba(225,232,242,0.16)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const flakes = Math.min(110, Math.round((W * H) / 4500)) * quality;
    for (let i = 0; i < flakes; i++) {
      const x = ((i * 83.1) % W) + Math.sin(seconds * 0.9 + i) * 14;
      const y = (seconds * 55 + i * 47.3) % H;
      ctx.beginPath();
      ctx.arc(x, y, 1.6 + (i % 3) * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'heat') {
    const haze = ctx.createLinearGradient(0, 0, 0, H);
    haze.addColorStop(0, 'rgba(255,170,70,0.10)');
    haze.addColorStop(1, 'rgba(255,120,40,0.22)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// Weather clouds, drawn in the sky BEHIND the buildings. They drift slowly and shift a
// little as you pan (like the ordinary clouds), so they scroll away when you look down.
const CLOUD_DENSITY = { cloudy: 0.5, rain: 0.75, snow: 0.4 };
export function drawWeatherClouds(ctx, W, H, kind, seconds, camera) {
  const density = CLOUD_DENSITY[kind];
  if (!density) return;
  ctx.save();
  ctx.fillStyle = `rgba(230,236,244,${0.45 * density})`;
  for (let i = 0; i < 4; i++) {
    const span = W + 220;
    const x = ((((seconds * (6 + i * 3) + i * 190 - camera.x * 0.05) % span) + span) % span) - 110;
    const y = H * (0.1 + i * 0.07) - camera.y * 0.02;
    ctx.beginPath();
    ctx.ellipse(x, y, 60, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 36, y + 6, 34, 14, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 40, y + 7, 38, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
