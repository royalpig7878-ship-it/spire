// src/main.js
//
// The entry point. index.html loads this file. Its only job is to wire
// together the pieces that live in src/sim, src/render, and src/ui —
// it shouldn't contain simulation logic or drawing logic itself.

import { config } from '../config.js';
import { createGameLoop } from './sim/loop.js';
import { createInputController } from './ui/input.js';
import { renderWorld } from './render/world.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// The camera is the one piece of shared state that both input (which
// changes it) and rendering (which reads it) need. { x, y } is the world
// point currently at the center of the screen; zoom is the scale factor.
const camera = {
  x: config.camera.startX,
  y: config.camera.startY,
  zoom: config.camera.startZoom,
};

// Tracks the canvas size in CSS pixels (not device pixels) since that's
// the unit all our drawing math and input math uses.
let canvasWidthCss = 0;
let canvasHeightCss = 0;

function resizeCanvasToFillScreen() {
  // devicePixelRatio accounts for high-density ("retina") phone screens.
  // Without this, text and shapes would look blurry on most phones.
  const devicePixelRatio = window.devicePixelRatio || 1;

  canvasWidthCss = window.innerWidth;
  canvasHeightCss = window.innerHeight;

  canvas.width = Math.round(canvasWidthCss * devicePixelRatio);
  canvas.height = Math.round(canvasHeightCss * devicePixelRatio);

  // Reset then scale the drawing context so our drawing code can keep
  // using CSS-pixel coordinates even though the canvas's real pixel
  // buffer is bigger on high-density screens.
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}

resizeCanvasToFillScreen();
// Covers both plain window resizing and phone orientation changes —
// 'resize' fires for both in all modern mobile browsers.
window.addEventListener('resize', resizeCanvasToFillScreen);

createInputController(canvas, camera, config);

const loop = createGameLoop({
  ticksPerSecond: config.sim.ticksPerSecond,
  update(_dtSeconds) {
    // Nothing to simulate yet in Milestone 0 — tenants, money, and time
    // arrive in later milestones. This hook exists now so every future
    // milestone just adds to it instead of restructuring the loop.
  },
  render(_alpha) {
    renderWorld(ctx, canvasWidthCss, canvasHeightCss, camera, config.world);
  },
});

loop.start();
