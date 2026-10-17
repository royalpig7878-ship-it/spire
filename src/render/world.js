// src/render/world.js
//
// Draws the current state of the world to the canvas. Keeping drawing
// isolated here means we can change how things look without touching
// simulation code.

export function renderWorld(ctx, canvasWidthCss, canvasHeightCss, camera, worldConfig) {
  const halfW = canvasWidthCss / 2;
  const halfH = canvasHeightCss / 2;
  const zoom = camera.zoom;

  // Convert world coordinates to screen coordinates using the camera.
  const toScreenX = (worldX) => (worldX - camera.x) * zoom + halfW;
  const toScreenY = (worldY) => (worldY - camera.y) * zoom + halfH;

  // Sky: a simple vertical gradient. A real day/night cycle is M2.
  const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeightCss);
  gradient.addColorStop(0, worldConfig.skyColors.top);
  gradient.addColorStop(1, worldConfig.skyColors.bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidthCss, canvasHeightCss);

  // Ground
  const groundScreenY = toScreenY(worldConfig.groundY);
  ctx.fillStyle = worldConfig.groundColor;
  ctx.fillRect(0, groundScreenY, canvasWidthCss, canvasHeightCss - groundScreenY);

  const debug = worldConfig.debug;
  if (!debug) return;

  // Grid lines in the world (vertical lines everywhere, horizontal lines
  // below ground). They move and scale with the camera, so you can see
  // panning and zooming happen.
  ctx.strokeStyle = debug.gridColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const worldLeft = camera.x - halfW / zoom;
  const worldRight = camera.x + halfW / zoom;
  const worldBottom = camera.y + halfH / zoom;
  const firstCol = Math.floor(worldLeft / debug.gridSize);
  const lastCol = Math.ceil(worldRight / debug.gridSize);
  for (let col = firstCol; col <= lastCol; col++) {
    const x = Math.round(toScreenX(col * debug.gridSize)) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasHeightCss);
  }
  const firstRow = Math.max(0, Math.floor(worldConfig.groundY / debug.gridSize));
  const lastRow = Math.ceil(worldBottom / debug.gridSize);
  for (let row = firstRow; row <= lastRow; row++) {
    const y = Math.round(toScreenY(row * debug.gridSize)) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(canvasWidthCss, y);
  }
  ctx.stroke();

  // Landmark square sitting on the ground at world x = 0.
  const size = debug.markerSize * zoom;
  const left = toScreenX(-debug.markerSize / 2);
  const top = groundScreenY - size;
  ctx.fillStyle = debug.markerColor;
  ctx.fillRect(left, top, size, size);
  ctx.strokeStyle = debug.markerOutline;
  ctx.lineWidth = 3;
  ctx.strokeRect(left, top, size, size);

  if (debug.showReadout) {
    ctx.font = '14px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(8, 8, 190, 24);
    ctx.fillStyle = '#fff';
    ctx.fillText(
      `zoom ${zoom.toFixed(2)}  x ${Math.round(camera.x)}  y ${Math.round(camera.y)}`,
      14,
      13,
    );
  }
}
