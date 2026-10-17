// src/ui/input.js
//
// Turns raw touch/mouse input into camera movement (pan & zoom).
//
// We use "Pointer Events" (pointerdown/move/up) instead of separate touch
// and mouse events, because the browser normalizes finger touches, mouse
// clicks, and stylus input into one API. That means the same code handles
// a finger drag on a phone and a mouse drag on a desktop.
//
// This file knows nothing about the game world, grid, or rendering — it
// only edits the `camera` object it's given ({ x, y, zoom }). Anything
// that draws the world reads that object to decide what to show.

export function createInputController(canvas, camera, config) {
  const cameraConfig = config.camera;

  // Every pointer currently touching the screen, keyed by its id.
  // For a single finger this has 1 entry (panning). For two fingers it
  // has 2 (pinch-to-zoom).
  const activePointers = new Map();

  // Remembers the last tap's time and position so we can detect a
  // "double tap" (two taps close together in time and space).
  let lastTapTimeMs = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  function clampZoom(zoom) {
    return Math.min(cameraConfig.maxZoom, Math.max(cameraConfig.minZoom, zoom));
  }

  // Converts a point on the screen (e.g. where a pinch is centered) to
  // the world-space point currently underneath it, given the *current*
  // camera. We use this to zoom "toward" where the user is pinching or
  // double-tapping, instead of always zooming toward the center.
  function screenToWorld(screenX, screenY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: camera.x + (screenX - rect.width / 2) / camera.zoom,
      y: camera.y + (screenY - rect.height / 2) / camera.zoom,
    };
  }

  // Changes the zoom level while keeping a specific world point locked
  // under a specific screen point (so the thing you're pinching/pointing
  // at doesn't appear to slide away as you zoom).
  function zoomTowardScreenPoint(screenX, screenY, newZoom) {
    const worldPoint = screenToWorld(screenX, screenY);
    camera.zoom = clampZoom(newZoom);
    const rect = canvas.getBoundingClientRect();
    camera.x = worldPoint.x - (screenX - rect.width / 2) / camera.zoom;
    camera.y = worldPoint.y - (screenY - rect.height / 2) / camera.zoom;
  }

  function distanceBetween(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function midpointBetween(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  // Remembered only while exactly two pointers are down, so we can tell
  // how much a pinch has grown or shrunk since the last move event.
  let pinchStartDistance = null;
  let pinchStartZoom = null;

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointers.size === 2) {
      const [a, b] = Array.from(activePointers.values());
      pinchStartDistance = distanceBetween(a, b);
      pinchStartZoom = camera.zoom;
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    const pointer = activePointers.get(event.pointerId);
    if (!pointer) return;

    const prevX = pointer.x;
    const prevY = pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (activePointers.size === 1) {
      // One finger (or mouse) down and moving: pan the camera.
      // Dividing by zoom means a drag always covers the same amount of
      // *world* space on screen, regardless of current zoom level.
      const dx = pointer.x - prevX;
      const dy = pointer.y - prevY;
      camera.x -= dx / camera.zoom;
      camera.y -= dy / camera.zoom;
    } else if (activePointers.size === 2 && pinchStartDistance !== null) {
      // Two fingers down and moving: pinch-to-zoom.
      const [a, b] = Array.from(activePointers.values());
      const currentDistance = distanceBetween(a, b);
      const mid = midpointBetween(a, b);
      const zoomFactor = currentDistance / pinchStartDistance;
      zoomTowardScreenPoint(mid.x, mid.y, pinchStartZoom * zoomFactor);
    }
  });

  function endPointer(event) {
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) {
      pinchStartDistance = null;
      pinchStartZoom = null;
    }
    // Re-sync the remaining single pointer's position so it doesn't
    // "jump" the camera on its next move (its stored x/y could be stale
    // relative to when the second finger lifted).
    if (activePointers.size === 1) {
      const [remainingId, remainingPointer] = Array.from(activePointers.entries())[0];
      activePointers.set(remainingId, remainingPointer);
    }
  }

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  // Double-tap-to-zoom: detected on pointerup rather than a dedicated
  // "dblclick" event, because dblclick doesn't fire for touch on all
  // mobile browsers.
  canvas.addEventListener('pointerup', (event) => {
    const nowMs = performance.now();
    const dx = event.clientX - lastTapX;
    const dy = event.clientY - lastTapY;
    const distance = Math.hypot(dx, dy);

    if (
      nowMs - lastTapTimeMs < cameraConfig.doubleTapMaxDelayMs &&
      distance < cameraConfig.doubleTapMaxDistancePx
    ) {
      zoomTowardScreenPoint(
        event.clientX,
        event.clientY,
        camera.zoom * cameraConfig.doubleTapZoomFactor,
      );
      lastTapTimeMs = 0; // consume the tap so a third tap doesn't chain-zoom
    } else {
      lastTapTimeMs = nowMs;
      lastTapX = event.clientX;
      lastTapY = event.clientY;
    }
  });

  // Mouse wheel zoom, for desktop testing with a mouse (no pinch gesture).
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      const factor = cameraConfig.wheelZoomFactor ** direction;
      zoomTowardScreenPoint(event.clientX, event.clientY, camera.zoom * factor);
    },
    { passive: false },
  );
}
