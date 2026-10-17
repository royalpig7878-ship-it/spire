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
import { installSprinklers, resolveExtortion } from './sim/incidents.js';
import { tierStatus, onCrownBuilt, peopleCount } from './sim/progress.js';
import { weatherLabel } from './sim/weather.js';
import { calendar, formatTime } from './sim/clock.js';
import { saveGame, loadGame, hasSave } from './sim/save.js';
import { createInputController } from './ui/input.js';
import { createToolbar } from './ui/toolbar.js';
import { createHud } from './ui/hud.js';
import { createModals } from './ui/modals.js';
import { createInfoPanel } from './ui/infopanel.js';
import { createAlerts } from './ui/alerts.js';
import { createStoryCard } from './ui/story.js';
import { createTutorial } from './ui/tutorial.js';
import { settings, updateSetting, onSettingChange } from './ui/settings.js';
import { buzz } from './ui/haptics.js';
import { createAudio } from './audio/audio.js';
import { tenantAt } from './sim/stories.js';
import { renderWorld } from './render/world.js';
import { OVERLAY_MODES } from './render/overlays.js';
import { applyPalette } from './render/palette.js';
import { skyAt } from './render/sky.js';
import { spawnDust, spawnDebris, updateParticles } from './render/particles.js';
import { hourOfDay } from './sim/clock.js';
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
  storyId: null, // person whose story card is open
  sawProgress: false, // has the player opened the rating screen (the tutorial asks)
  lowDetail: false, // battery-saver graphics
  pops: new Map(), // facility id -> time it was built (for the little pop animation)
  particles: [], // dust and debris
};

// ---- Sound, vibration, accessibility and graphics settings ----
const audio = createAudio(settings);
const baseDetailMinZoom = config.world.detailMinZoom;
let autoLow = false; // graphics 'auto' switched itself to battery saver
const fpsEl = document.createElement('div');
fpsEl.className = 'fps';
fpsEl.hidden = true;
document.body.appendChild(fpsEl);

function setLowDetail(on) {
  ui.lowDetail = on;
  config.world.detailMinZoom = baseDetailMinZoom * (on ? 1.7 : 1); // simpler buildings sooner
  resizeCanvasToFillScreen(); // also lowers the pixel density cap
}

function applySetting(key) {
  if (key === 'textScale') document.documentElement.style.setProperty('--text-scale', String(settings.textScale));
  if (key === 'colorblind') applyPalette(config, settings.colorblind);
  if (key === 'graphics') setLowDetail(settings.graphics === 'low' || (settings.graphics === 'auto' && autoLow));
  if (key === 'showFps') fpsEl.hidden = !settings.showFps;
  audio.applySettings();
}
onSettingChange(applySetting);

// Browsers allow sound only after a touch: start the audio on the first one.
// iPhone only counts the end of a touch (touchend/click) as permission, Android
// accepts the start, so listen to all of them until the audio is really running.
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
function tryUnlockAudio() {
  audio.unlock();
  if (audio.isRunning()) UNLOCK_EVENTS.forEach((name) => document.removeEventListener(name, tryUnlockAudio, true));
}
UNLOCK_EVENTS.forEach((name) => document.addEventListener(name, tryUnlockAudio, true));
// A soft click on every on-screen button.
document.getElementById('ui-root').addEventListener('click', (event) => {
  if (event.target.closest('button')) {
    audio.play('click', 0.06);
    buzz('tap');
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) audio.suspend();
  else audio.resume();
});

// "Install the app" (Android/desktop browsers offer this when the game is hosted over https).
let installEvent = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installEvent = event;
});
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {}); // offline play; only over https
}

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
  getTier: () => game.tower.tier,
  onLockedTap: (message) => toolbar.toast(message),
});
const modals = createModals(uiRoot);

// Camera glide: alerts (and "Follow") can ask the camera to swing to a place.
let cameraGoal = null; // { x, y, zoom }

// Tap a person to read their story.
const storyCard = createStoryCard(uiRoot, config, {
  getGame: () => game,
  onClose() {
    ui.storyId = null;
  },
  onFollow(on) {
    if (!on) cameraGoal = null;
  },
});

// The first-time tutorial (also replayable from Settings).
const tutorial = createTutorial(uiRoot, () => ({ game, ui }));
const alerts = createAlerts(uiRoot, {
  onFocus(alert) {
    const { cellWidth, floorHeight } = config.grid;
    cameraGoal = {
      x: alert.cell * cellWidth,
      y: -(alert.floor + 0.5) * floorHeight,
      zoom: Math.max(camera.zoom, 0.9),
    };
  },
});
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
  onSprinklers(facility) {
    const result = installSprinklers(game, config, facility);
    toolbar.toast(result.ok ? `Sprinklers installed  -${formatMoney(result.cost)}` : result.reason);
  },
});
const hud = createHud(uiRoot, config, {
  onSpeed(speed) {
    game.speed = speed;
  },
  onProgress() {
    ui.sawProgress = true;
    const crownNeed = config.crown.requiresPeople;
    const people = peopleCount(game, config);
    modals.showProgress({
      tierName: config.tiers[game.tower.tier].name,
      stars: game.tower.tier + 1,
      plot: game.tower.plot,
      status: tierStatus(game, config),
      inspection: game.progress.inspection,
      won: game.progress.won,
      crown: { people, need: crownNeed, peopleOk: people >= crownNeed },
      onClose() {},
    });
  },
  onOverlay(mode) {
    ui.overlay = OVERLAY_MODES.includes(mode) ? mode : 'off';
  },
  onMenu() {
    modals.showMenu({
      onSettings() {
        modals.showSettings({
          settings,
          onChange: (key, value) => updateSetting(key, value),
          // The tutorial teaches on an empty plot, so replaying it starts a new tower.
          onTutorial: () => {
            const startIt = () => startFreshGame(true);
            if (game.tower.facilities.size <= 1) startIt(); // nothing built yet: no need to ask
            else modals.showConfirm({ question: 'The tutorial starts a new, empty tower. Your current tower will be erased.', yesLabel: 'Start tutorial', onYes: startIt });
          },
          canInstall: Boolean(installEvent),
          onInstall: () => installEvent?.prompt(),
          onClose() {},
        });
      },
      canLoad: hasSave(config),
      onSave() {
        toolbar.toast(saveGame(game, config) ? 'Game saved' : 'Could not save');
      },
      onLoad() {
        toolbar.toast(loadGame(game, config) ? 'Game loaded' : 'No saved game found');
      },
      onNew() {
        startFreshGame(!settings.tutorialDone); // new players get the tutorial on their first new game
      },
    });
  },
});
if (loadedSave) toolbar.toast('Saved game loaded');

// Wipe the tower and begin again, optionally with the tutorial.
function startFreshGame(withTutorial) {
  const fresh = createGame(config);
  Object.assign(game, fresh);
  storyCard.hide();
  ui.sawProgress = false;
  saveGame(game, config); // overwrite the old save right away
  if (withTutorial) tutorial.start();
  else toolbar.toast('New game started');
}

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
    audio.play(event.report.net >= 0 ? 'kaching' : 'down');
    modals.showReport(event.report, () => {});
  } else if (event.type === 'fireSale') {
    audio.play('alarm');
    openFireSale();
  } else if (event.type === 'tierUp') {
    audio.play('fanfare');
    buzz('celebrate');
    modals.showTierUp(event, () => saveGame(game, config));
  } else if (event.type === 'inspection') {
    audio.play('error');
    modals.showInspectionResult(event, () => {});
  } else if (event.type === 'vipResult') {
    audio.play(event.pass ? 'good' : 'error');
    modals.showVipResult(event, () => {});
  } else if (event.type === 'victory') {
    audio.play('fanfare');
    buzz('celebrate');
    modals.showVictory(event, () => saveGame(game, config));
  } else if (event.type === 'extortion') {
    audio.play('notice');
    buzz('alarm');
    modals.showExtortion(event, {
      onPay: () => toolbar.toast(resolveExtortion(game, config, 'pay').text),
      onTrust: () => {
        const outcome = resolveExtortion(game, config, 'trust');
        game.alerts.push({ text: outcome.text, kind: outcome.good ? 'good' : 'fire' });
      },
    });
  }
}

// ---- Placement gestures (reported by the input layer) ----

let dragAnchor = null; // where a stairs/elevator drag began: { floor, cell }

// Figure out which grid slot the finger is pointing at and update previews.
// `starting` is true on the first touch of a drag.
function updatePreview(world, pointerType, starting = false) {
  const { cellWidth, floorHeight } = config.grid;
  // On touch screens, aim a little above the fingertip so it isn't hidden.
  // (The Build aim setting scales that: Under = right at the finger, Close = half, Above = full.)
  const aimScale = { under: 0, close: 0.5, above: 1 }[settings.aim] ?? 1;
  const lift = pointerType === 'touch' ? (config.build.touchOffsetPx * aimScale) / camera.zoom : 0;
  const floor = Math.floor(-(world.y - lift) / floorHeight);
  const tower = game.tower;

  if (ui.tool.kind === 'build') {
    const typeId = ui.tool.typeId;
    const def = config.facilities[typeId];
    const cell = Math.round(world.x / cellWidth - def.width / 2); // center ghost on finger
    if (def.vertical) {
      // Stairs / elevators: the first press fixes the column and start floor,
      // then dragging up or down chooses how many floors it spans.
      const clamp = (fl) => Math.max(def.minFloor, Math.min(game.tower.plot.maxFloor, fl));
      if (starting || !dragAnchor) dragAnchor = { floor: clamp(floor), cell };
      const current = clamp(floor);
      const bottom = Math.min(dragAnchor.floor, current);
      const height = Math.abs(current - dragAnchor.floor) + 1;
      const check = canPlace(tower, config, typeId, bottom, dragAnchor.cell, height);
      ui.ghost = { typeId, floor: bottom, cell: dragAnchor.cell, height, ok: check.ok, reason: check.reason };
    } else {
      const height = def.fixedHeight ?? 1; // the Crown is always 3 floors tall
      const check = canPlace(tower, config, typeId, floor, cell, height);
      ui.ghost = { typeId, floor, cell, height, ok: check.ok, reason: check.reason };
    }
  } else if (ui.tool.kind === 'district') {
    // Aim at a band of floors; basements and floors above the plot do not count.
    const band = bandOf(config, Math.max(0, Math.min(game.tower.plot.maxFloor, floor)));
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
  // Tapping a person opens their story card.
  const person = tenantAt(game, config, world);
  if (person) {
    ui.storyId = person.id;
    ui.tooltip = null;
    storyCard.show(person.id);
    return;
  }
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
      const gdef = config.facilities[g.typeId];
      const total = gdef.fixedHeight ? gdef.cost : gdef.cost * g.height;
      toolbar.toast(result.ok ? `Built ${gdef.name}  -${formatMoney(total)}` : result.reason);
      if (result.ok) {
        // A little celebration: pop-up animation, dust, a sound and a buzz.
        const built = facilityAt(tower, g.floor, g.cell);
        if (built) {
          ui.pops.set(built.id, performance.now());
          spawnDust(ui.particles, config, built);
        }
        audio.play('build');
        buzz('build');
        if (gdef.landmark) onCrownBuilt(game, config); // the Crown wins the game
      } else {
        audio.play('error');
        buzz('error');
      }
    } else if (ui.districtPreview) {
      const p = ui.districtPreview;
      const theme = config.districts.themes[p.themeId];
      const result = p.clear ? clearDistrict(tower, p.band) : applyDistrict(tower, config, p.band, p.themeId);
      toolbar.toast(
        result.ok ? (p.clear ? 'District removed' : `${theme.label} district  -${formatMoney(p.cost)}`) : result.reason,
      );
      audio.play(result.ok ? 'good' : 'error');
    } else if (ui.demolishTarget) {
      const target = ui.demolishTarget.facility;
      const result = demolish(tower, config, target);
      toolbar.toast(result.ok ? `Demolished  +${formatMoney(result.refund)}` : result.reason);
      if (result.ok) {
        spawnDebris(ui.particles, config, target, config.facilities[target.type].color);
        audio.play('demolish');
        buzz('demolish');
      } else {
        audio.play('error');
        buzz('error');
      }
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
  // Sharp text on high-density phones, but capped: far more pixels cost far
  // more time, so battery-saver graphics use a lower cap.
  const dpr = Math.min(window.devicePixelRatio || 1, ui.lowDetail ? 1.25 : 2);
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
  const halfPlotW = game.tower.plot.halfWidthCells * cellWidth;
  camera.x = Math.max(-halfPlotW - margin, Math.min(halfPlotW + margin, camera.x));
  const top = -(game.tower.plot.maxFloor + 1) * floorHeight - margin;
  const bottom = -game.tower.plot.minFloor * floorHeight + margin;
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
    // Frame timing: shown if asked, and used by "Auto" graphics to drop to
    // battery saver when the device cannot keep up.
    const nowMs = performance.now();
    const frameMs = nowMs - lastFrameMs;
    lastFrameMs = nowMs;
    if (frameMs < 250 && !document.hidden) {
      avgFrameMs = avgFrameMs * 0.94 + frameMs * 0.06;
      if (settings.graphics === 'auto' && !ui.lowDetail) {
        slowFrames = avgFrameMs > 26 ? slowFrames + frameMs : 0;
        if (slowFrames > 4000) {
          autoLow = true;
          setLowDetail(true);
          toolbar.toast('Battery-saver graphics on (change in Settings)');
        }
      }
    }
    if (settings.showFps && nowMs - fpsShownAt > 500) {
      fpsShownAt = nowMs;
      fpsEl.textContent = `${Math.round(1000 / Math.max(1, avgFrameMs))} fps${ui.lowDetail ? ' (saver)' : ''}`;
    }
    const dtSec = Math.min(0.1, frameMs / 1000);
    updateParticles(ui.particles, dtSec);

    // "Follow" keeps the camera on the chosen person.
    if (storyCard.following) {
      const followed = game.tenants.list.find((t) => t.id === storyCard.id);
      if (followed?.pos) {
        cameraGoal = { x: followed.pos.x * config.grid.cellWidth, y: -(followed.pos.floor + 0.5) * config.grid.floorHeight, zoom: camera.zoom };
      }
    }
    // Glide toward the place an alert pointed at ("Show").
    if (cameraGoal) {
      camera.x += (cameraGoal.x - camera.x) * 0.18;
      camera.y += (cameraGoal.y - camera.y) * 0.18;
      camera.zoom += (cameraGoal.zoom - camera.zoom) * 0.18;
      if (Math.hypot(cameraGoal.x - camera.x, cameraGoal.y - camera.y) < 1.5) cameraGoal = null;
    }
    clampCamera();
    // While the game is paused/blocked the sim is not ticking: draw cars
    // exactly where they are instead of sliding between stale positions.
    const smooth = game.blocked || game.speed === 0 ? 1 : alpha;
    const cal = calendar(game.clock, config);
    // News from the simulation (fires, inspector notes...) becomes on-screen alerts.
    for (const alert of game.alerts) {
      alerts.add(alert);
      const sound = { fire: 'alarm', power: 'down', good: 'good' }[alert.kind] ?? 'notice';
      audio.play(sound, 0.5);
      if (alert.kind === 'fire') buzz('alarm');
    }
    game.alerts.length = 0;
    alerts.tick();

    // Sounds from inside the tower: only the ones you could see, and not too many.
    const H = canvasHeightCss;
    for (const s of game.sfx.splice(0)) {
      if (camera.zoom < 0.35) continue;
      if (s.floor !== null) {
        const sy = (-(s.floor + 0.5) * config.grid.floorHeight - camera.y) * camera.zoom + H / 2;
        if (sy < 0 || sy > H) continue;
      }
      audio.play(s.name, s.name === 'ding' ? 0.18 : 0.3);
    }
    audio.setDarkness(skyAt(hourOfDay(game.clock), config).dark);
    storyCard.refresh();
    tutorial.tick();
    hud.update({
      funds: game.tower.funds,
      topFloor: tallestFloor(game.tower),
      maxFloor: game.tower.plot.maxFloor,
      stars: game.tower.tier + 1,
      population: game.tenants.stats.population,
      mood: game.tenants.stats.mood,
      dateText: `Y${cal.year} Q${cal.quarter} D${cal.dayOfQuarter}`,
      timeText: formatTime(game.clock),
      weatherText: weatherLabel(game, config),
      speed: game.speed,
      overlay: ui.overlay,
      power: powerStatus(game, config),
      outage: game.incidents.outage,
      debtDaysLeft: Math.max(0, config.economy.debtGraceDays - game.economy.debtDays),
    });
    toolbar.update(game.tower.funds);
    infoPanel.refresh();
    renderWorld(ctx, canvasWidthCss, canvasHeightCss, camera, config, game, ui, smooth);
  },
});

// Frame timing bookkeeping (see the render function)
let lastFrameMs = performance.now();
let avgFrameMs = 16;
let slowFrames = 0;
let fpsShownAt = 0;

// Apply the saved settings now that everything exists.
for (const key of ['textScale', 'colorblind', 'graphics', 'showFps']) applySetting(key);
// First visit: start the tutorial (not for someone who already has a saved tower).
if (!settings.tutorialDone && !loadedSave) tutorial.start();

// Handy for testing in the browser console: window.spire.game
window.spire = { game, config, camera, ui, infoPanel, modals, alerts, audio, settings, storyCard, tutorial };

loop.start();
