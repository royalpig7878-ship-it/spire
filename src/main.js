// src/main.js
//
// Entry point. Wires together the pieces from src/sim, src/render, src/ui.
// It holds the shared state (camera, tower, ui) and translates "player
// dragged here" into calls on the simulation. It should stay thin.

import { config } from '../config.js';
import { createGameLoop } from './sim/loop.js';
import {
  createTower,
  canPlace,
  place,
  canDemolish,
  demolish,
  facilityAt,
  refundFor,
  tallestFloor,
} from './sim/tower.js';
import { createInputController } from './ui/input.js';
import { createToolbar } from './ui/toolbar.js';
import { renderWorld } from './render/world.js';
import { formatMoney } from './data/format.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Camera: { x, y } is the world point at the screen center; zoom is scale.
const camera = {
  x: config.camera.startX,
  y: config.camera.startY,
  zoom: config.camera.startZoom,
};

const tower = createTower(config);

// What the player is currently doing (read by the renderer to draw previews).
const ui = {
  tool: { kind: 'pan', typeId: null }, // 'pan' | 'build' | 'demolish'
  ghost: null, // { typeId, floor, cell, ok, reason } while dragging a build
  demolishTarget: null, // { facility, ok, reason, refund } while dragging demolish
};

const toolbar = createToolbar(document.getElementById('ui-root'), config, {
  onToolChange(tool) {
    ui.tool = tool;
    ui.ghost = null;
    ui.demolishTarget = null;
  },
});

// ---- Placement gestures (reported by the input layer) ----

// Figure out which grid slot the finger is pointing at and update previews.
function updatePreview(world, pointerType) {
  const { cellWidth, floorHeight } = config.grid;
  // On touch screens, aim a little above the fingertip so it isn't hidden.
  const lift = pointerType === 'touch' ? config.build.touchOffsetPx / camera.zoom : 0;
  const floor = Math.floor(-(world.y - lift) / floorHeight);

  if (ui.tool.kind === 'build') {
    const def = config.facilities[ui.tool.typeId];
    const cell = Math.round(world.x / cellWidth - def.width / 2); // center ghost on finger
    const check = canPlace(tower, config, ui.tool.typeId, floor, cell);
    ui.ghost = { typeId: ui.tool.typeId, floor, cell, ok: check.ok, reason: check.reason };
  } else if (ui.tool.kind === 'demolish') {
    const target = facilityAt(tower, floor, Math.floor(world.x / cellWidth));
    if (!target) {
      ui.demolishTarget = null;
      return;
    }
    const check = canDemolish(tower, config, target);
    ui.demolishTarget = {
      facility: target,
      ok: check.ok,
      reason: check.reason,
      refund: refundFor(config, target),
    };
  }
}

function clearPreview() {
  ui.ghost = null;
  ui.demolishTarget = null;
}

const placementHandlers = {
  wantsPlacement: () => ui.tool.kind !== 'pan',
  onPlaceStart: updatePreview,
  onPlaceMove: updatePreview,
  onPlaceEnd(world, pointerType) {
    updatePreview(world, pointerType);
    if (ui.ghost) {
      const g = ui.ghost;
      const result = place(tower, config, g.typeId, g.floor, g.cell);
      toolbar.toast(
        result.ok
          ? `Built ${config.facilities[g.typeId].name}  -${formatMoney(config.facilities[g.typeId].cost)}`
          : result.reason,
      );
    } else if (ui.demolishTarget) {
      const t = ui.demolishTarget;
      const result = demolish(tower, config, t.facility);
      toolbar.toast(
        result.ok ? `Demolished  +${formatMoney(result.refund)}` : result.reason,
      );
    } else if (ui.tool.kind === 'demolish') {
      toolbar.toast('Nothing there to demolish');
    }
    clearPreview();
  },
  onPlaceCancel: clearPreview,
};

createInputController(canvas, camera, config, placementHandlers);

// ---- Canvas sizing ----

let canvasWidthCss = 0;
let canvasHeightCss = 0;

function resizeCanvasToFillScreen() {
  const dpr = window.devicePixelRatio || 1; // sharp text on high-density phones
  canvasWidthCss = window.innerWidth;
  canvasHeightCss = window.innerHeight;
  canvas.width = Math.round(canvasWidthCss * dpr);
  canvas.height = Math.round(canvasHeightCss * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeCanvasToFillScreen();
window.addEventListener('resize', resizeCanvasToFillScreen); // also fires on rotation

// Keep the camera from wandering far away from the plot.
function clampCamera() {
  const { cellWidth, floorHeight } = config.grid;
  const margin = config.camera.panMarginPx;
  const halfPlotW = config.plot.halfWidthCells * cellWidth;
  camera.x = Math.max(-halfPlotW - margin, Math.min(halfPlotW + margin, camera.x));
  const top = -(config.plot.maxFloor + 1) * floorHeight - margin;
  const bottom = -config.plot.minFloor * floorHeight + margin;
  camera.y = Math.max(top, Math.min(bottom, camera.y));
}

const loop = createGameLoop({
  ticksPerSecond: config.sim.ticksPerSecond,
  update(_dtSeconds) {
    // Time-based simulation (money over time, tenants, elevators) arrives
    // in later milestones.
  },
  render(_alpha) {
    clampCamera();
    toolbar.update(tower.funds, tallestFloor(tower));
    renderWorld(ctx, canvasWidthCss, canvasHeightCss, camera, config, tower, ui);
  },
});

loop.start();
