// src/main.js
//
// Entry point. Wires together the pieces from src/sim, src/render, src/ui.
// It holds the shared state (camera, game, ui) and translates "player
// dragged here" into calls on the simulation. It should stay thin.

import { config } from '../config.js';
import { createGameLoop } from './sim/loop.js';
import { createGame, updateGame, fireSaleOffers, fireSaleSell, fireSaleDecline } from './sim/game.js';
import { canPlace, place, canDemolish, demolish, facilityAt, refundFor, tallestFloor } from './sim/tower.js';
import { requestRide } from './sim/elevators.js';
import { calendar, hourOfDay, formatTime } from './sim/clock.js';
import { saveGame, loadGame, hasSave } from './sim/save.js';
import { createInputController } from './ui/input.js';
import { createToolbar } from './ui/toolbar.js';
import { createHud } from './ui/hud.js';
import { createModals } from './ui/modals.js';
import { renderWorld } from './render/world.js';
import { formatMoney } from './data/format.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const uiRoot = document.getElementById('ui-root');

// Camera: { x, y } is the world point at the screen center; zoom is scale.
const camera = {
  x: config.camera.startX,
  y: config.camera.startY,
  zoom: config.camera.startZoom,
};

// The game: tower + clock + economy + speed. Replaced piece by piece on load.
const game = createGame(config);
const loadedSave = loadGame(game, config);

// What the player is currently doing (read by the renderer to draw previews).
const ui = {
  tool: { kind: 'pan', typeId: null }, // 'pan' | 'build' | 'demolish'
  ghost: null, // { typeId, floor, cell, ok, reason } while dragging a build
  demolishTarget: null, // { facility, ok, reason, refund } while dragging demolish
};

const toolbar = createToolbar(uiRoot, config, {
  onToolChange(tool) {
    ui.tool = tool;
    ui.ghost = null;
    ui.demolishTarget = null;
  },
  getDemo: () => game.demoTraffic,
  onDemoToggle() {
    game.demoTraffic = !game.demoTraffic;
  },
});
const modals = createModals(uiRoot);
const hud = createHud(uiRoot, config, {
  onSpeed(speed) {
    game.speed = speed;
  },
  onMenu() {
    modals.showMenu({
      canLoad: hasSave(config),
      onSave() {
        toolbar.toast(saveGame(game, config) ? 'Game saved' : 'Could not save');
      },
      onLoad() {
        toolbar.toast(loadGame(game, config) ? 'Game loaded' : 'No saved game found');
      },
      onNew() {
        const fresh = createGame(config);
        Object.assign(game, fresh);
        saveGame(game, config); // overwrite the old save right away
        toolbar.toast('New game started');
      },
    });
  },
});
if (loadedSave) toolbar.toast('Saved game loaded');

// ---- Things that need the player's attention (reports, fire sale) ----

const modalQueue = [];

function openFireSale() {
  modals.showFireSale({
    funds: game.tower.funds,
    offers: fireSaleOffers(game, config),
    onSell(offer) {
      const result = fireSaleSell(game, config, offer.facility);
      if (result.ok) toolbar.toast(`Sold ${offer.name}  +${formatMoney(result.refund)}`);
      if (game.tower.funds >= 0) {
        modals.close();
        toolbar.toast('Back above $0');
      } else {
        openFireSale(); // still in debt: show the updated list
      }
    },
    onDecline() {
      fireSaleDecline(game, config);
    },
  });
}

// Drain the simulation's event list: autosave right away, queue pop-ups.
function processEvents() {
  for (const event of game.events) {
    if (event.type === 'autosave') saveGame(game, config);
    else modalQueue.push(event);
  }
  game.events.length = 0;
}

function pumpModals() {
  if (modals.isOpen() || modalQueue.length === 0) return;
  const event = modalQueue.shift();
  if (event.type === 'quarterReport') {
    modals.showReport(event.report, () => {});
  } else if (event.type === 'fireSale') {
    openFireSale();
  }
}

// ---- Placement gestures (reported by the input layer) ----

let dragAnchor = null; // where a stairs/elevator drag began: { floor, cell }

// Figure out which grid slot the finger is pointing at and update previews.
// `starting` is true on the first touch of a drag.
function updatePreview(world, pointerType, starting = false) {
  const { cellWidth, floorHeight } = config.grid;
  // On touch screens, aim a little above the fingertip so it isn't hidden.
  const lift = pointerType === 'touch' ? config.build.touchOffsetPx / camera.zoom : 0;
  const floor = Math.floor(-(world.y - lift) / floorHeight);
  const tower = game.tower;

  if (ui.tool.kind === 'build') {
    const typeId = ui.tool.typeId;
    const def = config.facilities[typeId];
    const cell = Math.round(world.x / cellWidth - def.width / 2); // center ghost on finger
    if (def.vertical) {
      // Stairs / elevators: the first press fixes the column and start floor,
      // then dragging up or down chooses how many floors it spans.
      const clamp = (fl) => Math.max(def.minFloor, Math.min(config.plot.maxFloor, fl));
      if (starting || !dragAnchor) dragAnchor = { floor: clamp(floor), cell };
      const current = clamp(floor);
      const bottom = Math.min(dragAnchor.floor, current);
      const height = Math.abs(current - dragAnchor.floor) + 1;
      const check = canPlace(tower, config, typeId, bottom, dragAnchor.cell, height);
      ui.ghost = { typeId, floor: bottom, cell: dragAnchor.cell, height, ok: check.ok, reason: check.reason };
    } else {
      const check = canPlace(tower, config, typeId, floor, cell);
      ui.ghost = { typeId, floor, cell, height: 1, ok: check.ok, reason: check.reason };
    }
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
  dragAnchor = null;
}

// Tap an elevator shaft (in pan mode) to send a test rider from that floor.
function onTap(world) {
  const { cellWidth, floorHeight } = config.grid;
  const floor = Math.floor(-world.y / floorHeight);
  const target = facilityAt(game.tower, floor, Math.floor(world.x / cellWidth));
  if (!target || config.facilities[target.type].transport !== 'elevator') return;
  const bottom = target.floor;
  const top = target.floor + target.height - 1;
  if (top === bottom) return;
  const others = [];
  for (let fl = bottom; fl <= top; fl++) if (fl !== floor) others.push(fl);
  // From the bottom: go up somewhere. From above: usually head back down.
  const dest =
    floor === bottom || Math.random() > 0.65
      ? others[Math.floor(Math.random() * others.length)]
      : bottom;
  if (!requestRide(game, config, floor, dest)) toolbar.toast('The line is full');
}

const placementHandlers = {
  wantsPlacement: () => ui.tool.kind !== 'pan',
  onPlaceStart: (world, pointerType) => updatePreview(world, pointerType, true),
  onPlaceMove: (world, pointerType) => updatePreview(world, pointerType, false),
  onTap,
  onPlaceEnd(world, pointerType) {
    updatePreview(world, pointerType, false);
    const tower = game.tower;
    if (ui.ghost) {
      const g = ui.ghost;
      const result = place(tower, config, g.typeId, g.floor, g.cell, game.clock.minutes, g.height);
      const total = config.facilities[g.typeId].cost * g.height;
      toolbar.toast(
        result.ok ? `Built ${config.facilities[g.typeId].name}  -${formatMoney(total)}` : result.reason,
      );
    } else if (ui.demolishTarget) {
      const result = demolish(tower, config, ui.demolishTarget.facility);
      toolbar.toast(result.ok ? `Demolished  +${formatMoney(result.refund)}` : result.reason);
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

// Save when the player leaves the tab/app, so nothing is lost.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveGame(game, config);
});

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
  update(dtSeconds) {
    processEvents();
    pumpModals();
    // The game waits while any pop-up is open (menu, report, fire sale).
    game.blocked = modals.isOpen() || modalQueue.length > 0;
    updateGame(game, config, dtSeconds);
  },
  render(alpha) {
    clampCamera();
    // While the game is paused/blocked the sim is not ticking: draw cars
    // exactly where they are instead of sliding between stale positions.
    const smooth = game.blocked || game.speed === 0 ? 1 : alpha;
    const cal = calendar(game.clock, config);
    hud.update({
      funds: game.tower.funds,
      topFloor: tallestFloor(game.tower),
      dateText: `Y${cal.year} Q${cal.quarter} D${cal.dayOfQuarter}`,
      timeText: formatTime(game.clock),
      speed: game.speed,
      debtDaysLeft: Math.max(0, config.economy.debtGraceDays - game.economy.debtDays),
    });
    toolbar.update(game.tower.funds);
    renderWorld(
      ctx,
      canvasWidthCss,
      canvasHeightCss,
      camera,
      config,
      game.tower,
      ui,
      hourOfDay(game.clock),
      game.elevators,
      smooth,
    );
  },
});

// Handy for testing in the browser console: window.spire.game
window.spire = { game, config, camera };

loop.start();
