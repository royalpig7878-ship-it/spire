// src/sim/needs.js
//
// "What does my tower need?" Looks at the whole game and returns a short,
// ranked list of problems and suggestions, each with a place to jump to.
// It only reads the game; it never changes anything. The UI asks for a fresh
// list every second or two (not every frame), because walking all the
// elevator stops and rooms is a little work.
//
// Each need: { id, severity, title, detail, target?, overlay?, build?, openProgress? }
//   severity: 3 urgent (red), 2 important (amber), 1 suggestion (blue)
//   target:   { floor, cell, width, height } where to point the camera
//   overlay:  a heat-map layer that shows the problem ('stress', 'wait', ...)
//   build:    a facility type that would help

import { isConnected, unlockTier } from './tower.js';
import { stopWaitSeconds } from './diagnostics.js';
import { coverageOf, parkingStatus, powerStatus, trashLevel } from './services.js';
import { occupancyOf } from './tenants.js';
import { peopleCount, tierStatus } from './progress.js';

const aboutFacility = (f) => ({ floor: f.floor, cell: f.cell, width: f.width, height: f.height });

export function computeNeeds(game, config) {
  const needs = [];
  const tower = game.tower;
  const stats = game.tenants.stats;
  const list = Array.from(tower.facilities.values());
  const nameOf = (f) => config.facilities[f.type].name;
  const has = (type) => list.some((f) => f.type === type && isConnected(tower, config, f));
  const canBuild = (type) => unlockTier(config, type) <= tower.tier + 1;
  const workers = game.tenants.list.filter((t) => t.kind === 'worker').length;
  const tenants = game.tenants.list.filter((t) => t.kind !== 'inspector').length;

  // ---- Urgent ----
  for (const [id] of Object.entries(game.incidents.fires)) {
    const f = tower.facilities.get(Number(id));
    if (!f) continue;
    needs.push({
      id: `fire${id}`,
      severity: 3,
      title: `Fire on floor ${f.floor}!`,
      detail: `The ${nameOf(f)} is burning. Maintenance puts fires out faster, and sprinklers (tap the room) stop them spreading.`,
      target: aboutFacility(f),
    });
  }
  if (game.incidents.outage) {
    needs.push({ id: 'outage', severity: 3, title: 'Power dip', detail: 'Elevators run slowly until it passes. A substation makes your power supply stronger.', build: canBuild('substation') ? 'substation' : undefined });
  }
  if (tower.funds < 0) {
    needs.push({ id: 'debt', severity: 3, title: 'You are in debt', detail: 'Rent comes in every day, but the bills are bigger. Stop spending, or sell something, before the fire sale.' });
  }
  const power = powerStatus(game, config);
  if (power.ratio < 1) {
    needs.push({
      id: 'power',
      severity: power.ratio < 0.8 ? 3 : 2,
      title: 'Not enough power',
      detail: `Demand is ${Math.round(power.demand)} and supply is ${Math.round(power.supply)}. Elevators slow down. Build a substation.`,
      build: canBuild('substation') ? 'substation' : undefined,
    });
  }

  // ---- Rooms that people cannot reach ----
  const unreachable = list.filter((f) => !config.facilities[f.type].transport && f.type !== 'lobby' && !isConnected(tower, config, f));
  if (unreachable.length) {
    const f = unreachable.reduce((a, b) => (b.floor < a.floor ? b : a));
    needs.push({
      id: 'unreachable',
      severity: 3,
      title: `${unreachable.length} room${unreachable.length > 1 ? 's' : ''} cannot be reached`,
      detail: `For example the ${nameOf(f)} on floor ${f.floor}. Stairs or an elevator must reach it, and the lobby must be connected.`,
      target: aboutFacility(f),
    });
  }

  // ---- Elevator waits ----
  const ec = config.elevators;
  let worst = null;
  for (const shaft of game.elevators.shafts.values()) {
    for (const floor of shaft.stopList) {
      const wait = stopWaitSeconds(shaft, floor);
      if (wait >= ec.impatientAfterSec && (!worst || wait > worst.wait)) worst = { shaft, floor, wait };
    }
  }
  if (worst) {
    const f = worst.shaft.facility;
    needs.push({
      id: 'waits',
      severity: worst.wait >= ec.stressedAfterSec ? 3 : 2,
      title: `Long wait for the elevator (${Math.round(worst.wait)}s)`,
      detail: `Floor ${worst.floor}. Tap the shaft to add a second car, or add another elevator, an express shaft or an escalator.`,
      target: { floor: worst.floor, cell: f.cell, width: f.width, height: 1 },
      overlay: 'wait',
    });
  }

  // ---- People ----
  const stressedAbove = config.tenants.stress.stressedAbove;
  const stressed = game.tenants.list.filter((t) => t.kind !== 'inspector' && t.stress >= stressedAbove);
  if (stressed.length) {
    const t = stressed.reduce((a, b) => (b.stress > a.stress ? b : a));
    const home = tower.facilities.get(t.homeId);
    needs.push({
      id: 'stress',
      severity: stressed.length >= 5 ? 3 : 2,
      title: `${stressed.length} ${stressed.length === 1 ? 'person is' : 'people are'} stressed`,
      detail: 'Long elevator lines, noise, trash and no place to relax are the usual causes. The Stress layer shows where.',
      target: home ? aboutFacility(home) : undefined,
      overlay: 'stress',
    });
  }
  // Move-outs in the last two game days (stats.moveOuts is a running total, so keep a few samples).
  const memo = (game.needsMemo ??= { moveOuts: [] });
  const now = game.clock.minutes;
  if (!memo.moveOuts.length || now - memo.moveOuts[memo.moveOuts.length - 1][0] > 120) memo.moveOuts.push([now, stats.moveOuts]);
  memo.moveOuts = memo.moveOuts.filter(([m]) => now - m <= 3 * 1440).slice(-60);
  const base = memo.moveOuts.find(([m]) => now - m <= 2 * 1440) ?? memo.moveOuts[0];
  const recent = base ? stats.moveOuts - base[1] : 0;
  if (recent >= 2) {
    needs.push({ id: 'moveouts', severity: 2, title: `${recent} people moved out lately`, detail: 'Unhappy tenants leave and your reputation falls. The Stress layer shows who is unhappy.', overlay: 'stress' });
  }

  // ---- Trash ----
  const dirty = list.filter((f) => trashLevel(game, f) >= config.services.trash.badgeAbove);
  if (dirty.length) {
    const f = dirty.reduce((a, b) => (trashLevel(game, b) > trashLevel(game, a) ? b : a));
    const noMaintenance = !list.some((x) => x.type === 'maintenance');
    needs.push({
      id: 'trash',
      severity: dirty.length >= 4 ? 3 : 2,
      title: `Trash is piling up (${dirty.length} room${dirty.length > 1 ? 's' : ''})`,
      detail: noMaintenance ? 'Build a Maintenance office. It cleans nearby floors every day.' : 'Add another Maintenance office closer, or Recycling to cut the trash at its source.',
      target: aboutFacility(f),
      build: noMaintenance && canBuild('maintenance') ? 'maintenance' : !noMaintenance && canBuild('recycling') ? 'recycling' : undefined,
    });
  }

  // ---- Services the tower has outgrown ----
  const people = peopleCount(game, config);
  if (tenants >= 12 && !has('maintenance') && canBuild('maintenance') && !dirty.length) {
    needs.push({ id: 'svc-maint', severity: 1, title: 'Build a Maintenance office', detail: 'It keeps floors clean and puts out fires. You will need one before long.', build: 'maintenance' });
  }
  if (people >= 80 && !has('security') && canBuild('security')) {
    needs.push({ id: 'svc-sec', severity: 1, title: 'Build a Security office', detail: 'Tenants feel safer, units are more attractive, and trouble ends sooner.', build: 'security' });
  }
  const food = ['cafe', 'restaurant', 'shop', 'foodCourt'].some(has);
  if (workers >= 8 && !food) {
    needs.push({ id: 'svc-food', severity: 2, title: 'Workers need a break room', detail: 'Nowhere to get a coffee or lunch. A café calms people down and earns money.', build: 'cafe' });
  }
  if (people >= 60 && tower.tier >= 2 && !has('clinic') && canBuild('clinic')) {
    needs.push({ id: 'svc-clinic', severity: 1, title: 'Build a Clinic', detail: 'A big tower needs medical cover. It also relieves stress for people who visit.', build: 'clinic' });
  }
  const park = parkingStatus(game, config);
  if (park.drivers > 0 && park.capacity < park.drivers && canBuild('parking')) {
    needs.push({ id: 'parking', severity: 2, title: 'Not enough parking', detail: `${park.drivers} workers drive but there are ${park.capacity} spaces. A Garage makes offices more attractive.`, build: 'parking' });
  }

  // ---- Empty units ----
  if (game.clock.minutes > 6 * 1440) {
    const empties = list.filter((f) => {
      const def = config.facilities[f.type];
      return def.capacity && isConnected(tower, config, f) && occupancyOf(game, config, f) < 0.3;
    });
    if (empties.length >= 2) {
      const f = empties.reduce((a, b) => (b.floor > a.floor ? b : a));
      const weak = coverageOf(game, config, f);
      needs.push({
        id: 'empty',
        severity: 1,
        title: `${empties.length} units are mostly empty`,
        detail: weak.security || weak.maintenance ? 'Give it time, or add amenities nearby (cafés, an atrium, parking).' : 'People like security and maintenance nearby, and clean, quiet floors.',
        target: aboutFacility(f),
        overlay: 'occupancy',
      });
    }
  }

  // ---- The road to the next star ----
  const status = tierStatus(game, config);
  if (status && !status.allMet) {
    const unmet = status.checks.filter((c) => !c.ok);
    needs.push({
      id: 'next-star',
      severity: 1,
      title: `Next rating: ${status.next.name}`,
      detail: unmet.map((c) => (c.flag ? c.label : `${c.label} ${c.number ? c.have.toLocaleString('en-US') : c.have}/${c.number ? c.need.toLocaleString('en-US') : c.need}`)).join(' · '),
      openProgress: true,
    });
  }

  needs.sort((a, b) => b.severity - a.severity);
  return needs.slice(0, 14);
}
