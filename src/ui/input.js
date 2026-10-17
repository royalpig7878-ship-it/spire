// src/ui/input.js
//
// Turns raw touch/mouse input into either:
//   - camera movement (one finger drag = pan, two fingers = pinch zoom), or
//   - a "placement drag" while a build/demolish tool is active
//     (one finger drags the ghost, lifting the finger confirms).
// Two fingers ALWAYS pan/zoom, even in build mode, and cancel any placement.
//
// This file knows nothing about buildings. It reports placement gestures to
// the `handlers` it is given:
//   wantsPlacement()                  -> true while a build/demolish tool is on
//   onPlaceStart/Move/End(world, pointerType), onPlaceCancel()
//   onTap(world)                      -> a clean single tap while in pan mode

export function createInputController(canvas, camera, config, handlers) {
  const cameraConfig = config.camera;
  const activePointers = new Map(); // pointerId -> { x, y, startX, startY, moved }

  let lastTapTimeMs = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  let placingPointerId = null; // set while a placement drag is in progress
  let pinchStartDistance = null;
  let pinchStartZoom = null;
  let sawMultiTouch = false; // true if a 2nd finger touched during this gesture

  const clampZoom = (z) => Math.min(cameraConfig.maxZoom, Math.max(cameraConfig.minZoom, z));

  // Screen point (client coordinates) -> world point under the current camera.
  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: camera.x + (clientX - rect.left - rect.width / 2) / camera.zoom,
      y: camera.y + (clientY - rect.top - rect.height / 2) / camera.zoom,
    };
  }

  // Zoom while keeping the world point under (clientX, clientY) fixed there.
  function zoomTowardScreenPoint(clientX, clientY, newZoom) {
    const rect = canvas.getBoundingClientRect();
    const before = screenToWorld(clientX, clientY);
    camera.zoom = clampZoom(newZoom);
    camera.x = before.x - (clientX - rect.left - rect.width / 2) / camera.zoom;
    camera.y = before.y - (clientY - rect.top - rect.height / 2) / camera.zoom;
  }

  const distanceBetween = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function cancelPlacement() {
    if (placingPointerId !== null) {
      placingPointerId = null;
      handlers.onPlaceCancel();
    }
  }

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    });
    if (activePointers.size === 1) sawMultiTouch = false;

    if (activePointers.size === 1 && handlers.wantsPlacement()) {
      placingPointerId = event.pointerId;
      handlers.onPlaceStart(screenToWorld(event.clientX, event.clientY), event.pointerType);
      return;
    }

    if (activePointers.size === 2) {
      sawMultiTouch = true;
      cancelPlacement();
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
    if (Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) > 10) {
      pointer.moved = true;
    }

    if (placingPointerId === event.pointerId) {
      handlers.onPlaceMove(screenToWorld(event.clientX, event.clientY), event.pointerType);
      return;
    }

    if (activePointers.size === 1) {
      camera.x -= (pointer.x - prevX) / camera.zoom;
      camera.y -= (pointer.y - prevY) / camera.zoom;
    } else if (activePointers.size === 2 && pinchStartDistance !== null) {
      const [a, b] = Array.from(activePointers.values());
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const factor = distanceBetween(a, b) / pinchStartDistance;
      zoomTowardScreenPoint(midX, midY, pinchStartZoom * factor);
    }
  });

  canvas.addEventListener('pointerup', (event) => {
    const pointer = activePointers.get(event.pointerId);
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) {
      pinchStartDistance = null;
      pinchStartZoom = null;
    }

    if (placingPointerId === event.pointerId) {
      placingPointerId = null;
      handlers.onPlaceEnd(screenToWorld(event.clientX, event.clientY), event.pointerType);
      return;
    }

    // Double-tap to zoom: only in pan mode, only for a clean single-finger tap.
    if (!pointer || pointer.moved || sawMultiTouch || handlers.wantsPlacement()) return;
    if (handlers.onTap) handlers.onTap(screenToWorld(event.clientX, event.clientY));
    const nowMs = performance.now();
    const close =
      Math.hypot(event.clientX - lastTapX, event.clientY - lastTapY) < cameraConfig.doubleTapMaxDistancePx;
    if (nowMs - lastTapTimeMs < cameraConfig.doubleTapMaxDelayMs && close) {
      zoomTowardScreenPoint(event.clientX, event.clientY, camera.zoom * cameraConfig.doubleTapZoomFactor);
      lastTapTimeMs = 0;
    } else {
      lastTapTimeMs = nowMs;
      lastTapX = event.clientX;
      lastTapY = event.clientY;
    }
  });

  canvas.addEventListener('pointercancel', (event) => {
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) {
      pinchStartDistance = null;
      pinchStartZoom = null;
    }
    if (placingPointerId === event.pointerId) cancelPlacement();
  });

  // Mouse wheel zoom (desktop)
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const direction = event.deltaY > 0 ? -1 : 1;
      zoomTowardScreenPoint(event.clientX, event.clientY, camera.zoom * cameraConfig.wheelZoomFactor ** direction);
    },
    { passive: false },
  );
}
