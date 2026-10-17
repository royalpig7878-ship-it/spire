// src/render/weather.js
//
// Draws today's weather over the scene: a grey wash and slanting rain, drifting
// snowflakes, a warm heat haze, or plain cloud cover. Everything is cheap vector
// shapes placed by a simple formula of the time, so nothing needs storing.

export function drawWeather(ctx, W, H, kind, seconds) {
  if (kind === 'clear') return;
  ctx.save();
  if (kind === 'cloudy') {
    ctx.fillStyle = 'rgba(95,108,125,0.16)';
    ctx.fillRect(0, 0, W, H);
    drawClouds(ctx, W, H, seconds, 0.5);
  } else if (kind === 'rain') {
    ctx.fillStyle = 'rgba(70,82,100,0.26)';
    ctx.fillRect(0, 0, W, H);
    drawClouds(ctx, W, H, seconds, 0.75);
    ctx.strokeStyle = 'rgba(200,220,245,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    const drops = Math.min(140, Math.round((W * H) / 3500));
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
    drawClouds(ctx, W, H, seconds, 0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const flakes = Math.min(110, Math.round((W * H) / 4500));
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

// A few soft clouds drifting across the top of the screen.
function drawClouds(ctx, W, H, seconds, density) {
  ctx.fillStyle = `rgba(230,236,244,${0.45 * density})`;
  for (let i = 0; i < 4; i++) {
    const x = ((seconds * (6 + i * 3) + i * 190) % (W + 220)) - 110;
    const y = H * (0.1 + i * 0.07);
    ctx.beginPath();
    ctx.ellipse(x, y, 60, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 36, y + 6, 34, 14, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 40, y + 7, 38, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
