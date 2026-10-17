// src/sim/loop.js
//
// A "fixed timestep" game loop. This is the heartbeat of the whole game.
//
// Why we need this: phones and browsers don't all draw frames at the same
// speed (some are 60fps, some are 90fps, some stutter to 30fps). If our
// simulation just ran "once per drawn frame", the game would run at
// different speeds on different devices. A fixed timestep loop separates
// two things:
//   - "update" (the simulation: moving tenants, elevators, money, etc.)
//     which always advances in the same-size steps, ticksPerSecond times
//     per second, no matter the device.
//   - "render" (drawing to the canvas) which happens as often as the
//     browser can manage, and just draws the *current* state.
//
// This file doesn't know anything about tenants, elevators, or graphics —
// it just calls the update and render functions it's given, on schedule.
// That's what "simulation separated from rendering" means in practice.

export function createGameLoop({ ticksPerSecond, update, render }) {
  const tickDurationMs = 1000 / ticksPerSecond;

  let running = false;
  let lastTimeMs = 0;
  // "Accumulator" pattern: we bank up elapsed time and spend it in
  // fixed-size chunks, so leftover time carries over to the next frame
  // instead of being lost or causing drift.
  let accumulatorMs = 0;
  let animationFrameHandle = null;

  function frame(nowMs) {
    if (!running) return;

    // Clamp a huge gap (e.g. the tab was backgrounded for a while) so we
    // don't try to "catch up" with thousands of ticks at once.
    const elapsedMs = Math.min(nowMs - lastTimeMs, 250);
    lastTimeMs = nowMs;
    accumulatorMs += elapsedMs;

    while (accumulatorMs >= tickDurationMs) {
      update(tickDurationMs / 1000); // seconds, since most game math prefers seconds
      accumulatorMs -= tickDurationMs;
    }

    // alpha is how far we are between the last tick and the next one
    // (0 to 1). Passing it to render lets us smoothly interpolate
    // positions later, instead of movement looking stepped/jittery.
    const alpha = accumulatorMs / tickDurationMs;
    render(alpha);

    animationFrameHandle = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastTimeMs = performance.now();
      accumulatorMs = 0;
      animationFrameHandle = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (animationFrameHandle !== null) {
        cancelAnimationFrame(animationFrameHandle);
        animationFrameHandle = null;
      }
    },
  };
}
