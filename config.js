// config.js
//
// Every tunable number in the game lives here. Nothing in src/sim or
// src/render should hard-code a number that a designer might want to
// change later — it should read it from this file instead. That way we
// can rebalance the game without touching simulation or drawing code.

export const config = {
  // --- Simulation timing ---
  sim: {
    // How many simulation "ticks" happen per second, no matter how fast
    // or slow the device is rendering frames. Keeping this fixed means
    // the game behaves the same on a fast phone and a slow one.
    ticksPerSecond: 30,
  },

  // --- Camera (pan & zoom) ---
  camera: {
    // Smallest and largest zoom level allowed. 1 = normal size,
    // 0.5 = zoomed out to half size, 3 = zoomed in to 3x size.
    minZoom: 0.1,
    maxZoom: 4,
    // Starting zoom level when the game first loads.
    startZoom: 1,
    // How far the camera starts from the world origin, in world pixels.
    startX: 0,
    startY: 0,
    // Two taps within this many milliseconds and this close together
    // (in screen pixels) count as a "double-tap to zoom".
    doubleTapMaxDelayMs: 300,
    doubleTapMaxDistancePx: 40,
    // How much each double-tap multiplies the zoom level by.
    doubleTapZoomFactor: 1.6,
    // How much a single mouse-wheel "click" changes zoom by (desktop only).
    wheelZoomFactor: 1.1,
  },

  // --- Placeholder world (replaced by the real grid in Milestone 1) ---
  world: {
    groundY: 0, // world-space y coordinate of street level
    groundColor: '#4a5a4e',
    skyColors: {
      // Simple placeholder sky — a real day/night cycle comes in Milestone 2.
      top: '#6ea8d8',
      bottom: '#cfe8f5',
    },
    // Placeholder reference marks so you can SEE panning and zooming
    // working. They go away when the real grid and buildings arrive in M1.
    debug: {
      gridSize: 100, // world pixels between grid lines on the ground
      gridColor: 'rgba(255,255,255,0.35)',
      markerSize: 100, // side length of the landmark square (world pixels)
      markerColor: '#e8553d',
      markerOutline: '#ffffff',
      showReadout: true, // small "zoom / x / y" text in the top-left corner
    },
  },
};
