// src/main.js
//
// Entry point. Wires together the pieces from src/sim, src/render, src/ui.
// It holds the shared state (camera, game, ui) and translates "player
// dragged here" into calls on the simulation. It should stay thin.

import { config } from '../config.js';
import { createGameLoop } from './sim/loop.js';
import { createGame, updateGame, fireSaleOffers, fireSaleSell, fireSaleDecline } from './sim/game.js';
import {
  canPlace,
  place,
  canDemolish,
  demolish,
  facilityAt,
  refundFor,
  tallestFloor,
  setShaftCars,
  toggleShaftStop,
} from './sim/tower.js';
import { stopWaitSeconds } from './sim/diagnostics.js';
import { bandOf, designateDistrict, applyDistrict, clearDistrict } from './sim/districts.js';
import { powerStatus } from './sim/services.js';
import { calendar, formatTime } from './sim/clock.js';
import { saveGame, loadGame, hasSave } from './sim/save.js';
import { createInputController } from './ui/input.js';
import { createToolbar } from './ui/toolbar.js';
import { createHud } from './ui/hud.js';
import { createModals } from './ui/modals.js';
import { createInfoPanel } from './ui/infopanel.js';
import { renderWorld } from './render/world.js';
import { OVERLAY_MODES } from './render/overlays.js';
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
  overlay: 'off', // diagnostic heat-map layer: off | stress | wait | occupancy | income
  selectedId: null, // facility whose info panel is open
  tooltip: null, // { lines, floor, cell, until } quick note after tapping an elevator stop
  districtPreview: null, // { band, themeId, ok, reason, cost } while dragging the district tool
};

const toolbar = createToolbar(uiRoot, config, {
  onToolChange(tool) {
    ui.tool = tool;
    ui.ghost = null;
    ui.demolishTarget = null;
    ui.districtPreview = null;
  },
  getDemo: () => game.demoTraffic,
  onDemoToggle() {
    game.demoTraffic = !game.demoTraffic;
  },
});
const modals = createModals(uiRoot);
const infoPanel = createInfoPanel(uiRoot, config, {
  getGame: () => game,
  onClose() {
    ui.selectedId = null;
  },
  onSetCars(facility, count) {
    const result = setShaftCars(game.tower, config, facility, count);
    if (!result.ok) toolbar.toast(result.reason);
    else if (result.change > 0) toolbar.toast(`Car added  -${formatMoney(config.elevators.carCost)}`);
    else if (result.change < 0) toolbar.toast('Car removed');
  },
  onToggleStop(facility, floor) {
    const result = toggleShaftStop(game.tower, config, facility, floor);
    if (!result.ok) toolbar.toast(result.reason);
  },
});
const hud = createHud(uiRoot, config, {
  onSpeed(speed) {
    game.speed = speed;
  },
  onOverlay(mode) {
    ui.overlay = OVERLAY_MODES.includes(mode) ? mode : 'off';
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
  } else if (ui.tool.kind === 'district') {
    // Aim at a band of floors; basements and floors above the plot do not count.
    const band = bandOf(config, Math.max(0, Math.min(config.plot.maxFloor, floor)));
    const themeId = ui.tool.typeId;
    if (themeId === 'clear') {
      const has = Boolean(tower.districts[band]);
      ui.districtPreview = { band, themeId, clear: true, ok: has, reason: 'No district here', cost: 0 };
    } else {
      const check = designateDistrict(tower, config, band, themeId);
      ui.districtPreview = { band, themeId, clear: false, ok: check.ok, reason: check.reason, cost: check.cost ?? 0 };
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
  ui.districtPreview = null;
  dragAnchor = null;
}

function facilityUnder(world) {
  const { cellWidth, floorHeight } = config.grid;
  const floor = Math.floor(-world.y / floorHeight);
  return { floor, cell: Math.floor(world.x / cellWidth), facility: facilityAt(game.tower, floor, Math.floor(world.x / cellWidth)) };
}

// Tap an elevator stop: a quick note with the line length and wait times.
function onTap(world) {
  const { floor, cell, facility } = facilityUnder(world);
  ui.tooltip = null;
  if (!facility || config.facilities[facility.type].transport !== 'elevator') return;
  const shaft = game.elevators.shafts.get(facility.id);
  if (!shaft || !shaft.stops.has(floor)) {
    ui.tooltip = { lines: ['No door on this floor'], floor, cell, until: performance.now() + 2500 };
    return;
  }
  const queue = shaft.waiting.get(floor) ?? [];
  const longest = queue.reduce((max, r) => Math.max(max, r.waited), 0);
  ui.tooltip = {
    lines: [
      `${config.facilities[facility.type].name} · floor ${floor}`,
      `${queue.length} in line · longest ${Math.round(longest)}s`,
      `Recent average wait ${Math.round(stopWaitSeconds(shaft, floor))}s`,
    ],
    floor,
    cell,
    until: performance.now() + 4500,
  };
}

// Hold a finger on a building: open its info panel.
function onLongPress(world) {
  const { facility } = facilityUnder(world);
  if (!facility) return;
  ui.selectedId = facility.id;
  ui.tooltip = null;
  infoPanel.show(facility.id);
}

const placementHandlers = {
  wantsPlacement: () => ui.tool.kind !== 'pan',
  onPlaceStart: (world, pointerType) => updatePreview(world, pointerType, true),
  onPlaceMove: (world, pointerType) => updatePreview(world, pointerType, false),
  onTap,
  onLongPress,
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
    } else if (ui.districtPreview) {
      const p = ui.districtPreview;
      const theme = config.districts.themes[p.themeId];
      const result = p.clear ? clearDistrict(tower, p.band) : applyDistrict(tower, config, p.band, p.themeId);
      toolbar.toast(
        result.ok ? (p.clear ? 'District removed' : `${theme.label} district  -${formatMoney(p.cost)}`) : result.reason,
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
      population: game.tenants.stats.population,
      mood: game.tenants.stats.mood,
      dateText: `Y${cal.year} Q${cal.quarter} D${cal.dayOfQuarter}`,
      timeText: formatTime(game.clock),
      speed: game.speed,
      overlay: ui.overlay,
      power: powerStatus(game, config),
      debtDaysLeft: Math.max(0, config.economy.debtGraceDays - game.economy.debtDays),
    });
    toolbar.update(game.tower.funds);
    infoPanel.refresh();
    renderWorld(ctx, canvasWidthCss, canvasHeightCss, camera, config, game, ui, smooth);
  },
});

// Handy for testing in the browser console: window.spire.game
window.spire = { game, config, camera, ui, infoPanel };

loop.start();
