// src/sim/progress.js
//
// The road from Foothold to the Crown.
//
//   1. Each rating tier asks for people, mood, reputation and certain
//      buildings (config.tiers). `tierStatus` reports which are met.
//   2. When everything is met, an INSPECTOR is scheduled for the next morning.
//      They walk a tour of your tower (src/sim/tenants.js runs them like a
//      picky tenant) and are judged by how smooth the visit was.
//   3. Pass: you rise one tier (bigger plot, new buildings, a bonus, a
//      ceremony). Fail: a cooldown, then they will return.
//   4. At Legendary you may build the Crown once you have 15,000 people.
//
// VIP visits (random events) reuse the same inspector: a smooth visit pays a
// reward, a rough one costs a little reputation.
// The simulation never touches the screen: it posts to `game.events` and
// `game.alerts`, which the UI reads.

import { setTier, isConnected } from './tower.js';
import { dayIndex, MINUTES_PER_DAY } from './clock.js';

export function createProgress() {
  return {
    inspection: null, // { purpose: 'tier' | 'vip', state: 'scheduled' | 'active', arriveMinute, result }
    cooldownUntil: 0, // game minute: no new tier inspection before this
    won: false,
    wonAt: null,
  };
}

// People = simulated tenants x how many people each represents at this tier.
export function peopleCount(game, config) {
  let tenants = 0;
  for (const t of game.tenants.list) if (t.kind !== 'inspector') tenants += 1;
  return tenants * config.tiers[game.tower.tier].peoplePerTenant;
}

export const stars = (tower) => tower.tier + 1;
export const nextTierOf = (config, tower) => config.tiers[tower.tier + 1] ?? null;

// What the next tier needs, and how you are doing against each item.
export function tierStatus(game, config) {
  const next = nextTierOf(config, game.tower);
  if (!next) return null;
  const req = next.requires;
  const people = peopleCount(game, config);
  const checks = [
    { label: 'People', have: people, need: req.people, ok: people >= req.people, number: true },
    { label: 'Mood', have: game.tenants.stats.mood, need: req.mood, ok: game.tenants.stats.mood >= req.mood, suffix: '%' },
    { label: 'Reputation', have: Math.round(game.tenants.stats.reputation), need: req.reputation, ok: game.tenants.stats.reputation >= req.reputation },
  ];
  for (const typeId of req.facilities) {
    const has = Array.from(game.tower.facilities.values()).some((f) => f.type === typeId && isConnected(game.tower, config, f));
    checks.push({ label: `Build: ${config.facilities[typeId].name}`, ok: has, flag: true });
  }
  return { next, checks, allMet: checks.every((c) => c.ok) };
}

// Called each midnight: decide whether to invite an inspector.
export function dailyProgress(game, config) {
  const progress = game.progress;
  if (progress.won || progress.inspection) return;
  const status = tierStatus(game, config);
  if (!status || !status.allMet) return;
  if (game.clock.minutes < progress.cooldownUntil) return;
  const arrive = (dayIndex(game.clock) + 1) * MINUTES_PER_DAY + config.inspector.arriveHour * 60;
  progress.inspection = { purpose: 'tier', state: 'scheduled', arriveMinute: arrive, result: null };
  game.alerts.push({
    text: `Inspector coming tomorrow at ${config.inspector.arriveHour}:00 to judge your tower. Keep the elevators smooth!`,
    kind: 'inspector',
  });
}

export function scheduleVip(game, config) {
  const progress = game.progress;
  if (progress.inspection) return false;
  const arrive = (dayIndex(game.clock) + 1) * MINUTES_PER_DAY + (config.inspector.arriveHour + 1) * 60;
  progress.inspection = { purpose: 'vip', state: 'scheduled', arriveMinute: arrive, result: null };
  game.alerts.push({ text: 'A VIP will visit tomorrow. A smooth visit pays a reward.', kind: 'inspector' });
  return true;
}

// Called every tick (it is very cheap): start and finish inspections.
export function tickProgress(game, config, spawnInspector) {
  const insp = game.progress.inspection;
  if (!insp) return;
  if (insp.state === 'scheduled' && game.clock.minutes >= insp.arriveMinute) {
    insp.state = 'active';
    if (!spawnInspector(game, config, insp.purpose)) {
      game.progress.inspection = null; // nothing to show them yet
      return;
    }
    game.alerts.push({ text: insp.purpose === 'tier' ? 'The inspector has arrived.' : 'The VIP has arrived.', kind: 'inspector' });
  } else if (insp.state === 'active' && insp.result) {
    resolveInspection(game, config, insp);
  }
}

function resolveInspection(game, config, insp) {
  const ic = config.inspector;
  const r = insp.result; // { peakStress, worstWait, dirty, stormedOut, incidents }
  const score = Math.round(100 - r.peakStress * ic.stressWeight - r.incidents * ic.incidentPenalty - r.dirty * ic.dirtyPenalty);
  const pass = !r.stormedOut && score >= ic.passScore;
  const notes = [];
  if (r.stormedOut) notes.push('The visitor stormed out, too stressed to continue.');
  if (r.worstWait >= 12) notes.push(`They waited ${Math.round(r.worstWait)}s for an elevator.`);
  if (r.dirty) notes.push(`${r.dirty} building${r.dirty > 1 ? 's were' : ' was'} dirty. Add maintenance and recycling.`);
  if (r.incidents) notes.push('There was a crisis going on during the visit.');
  if (!notes.length) notes.push('Smooth elevators, clean floors, calm people.');

  game.progress.inspection = null;
  if (insp.purpose === 'tier') {
    if (pass) {
      promote(game, config, score, notes);
    } else {
      game.progress.cooldownUntil = game.clock.minutes + ic.retryCooldownDays * MINUTES_PER_DAY;
      game.events.push({ type: 'inspection', pass: false, score, need: ic.passScore, notes, retryDays: ic.retryCooldownDays });
    }
  } else {
    const tierN = game.tower.tier + 1;
    const reward = pass ? ic.vip.fundsPerTier * tierN : 0;
    game.tower.funds += reward;
    const stats = game.tenants.stats;
    stats.reputation = Math.max(0, Math.min(100, stats.reputation + (pass ? ic.vip.reputation : ic.vip.failReputation)));
    game.events.push({ type: 'vipResult', pass, score, reward, notes });
  }
}

function promote(game, config, score, notes) {
  const tower = game.tower;
  const nextIndex = tower.tier + 1;
  const tier = config.tiers[nextIndex];
  setTier(tower, config, nextIndex);
  tower.funds += tier.bonus.funds;
  const stats = game.tenants.stats;
  stats.reputation = Math.min(100, stats.reputation + tier.bonus.reputation);
  game.events.push({
    type: 'tierUp',
    tier: nextIndex,
    name: tier.name,
    score,
    notes,
    bonusFunds: tier.bonus.funds,
    unlocks: tier.unlocks.map((id) => config.facilities[id].name),
    maxFloor: tier.plot.maxFloor,
    width: tier.plot.halfWidthCells * 2,
  });
}

// The Crown was just built: the game is won (play can continue).
export function onCrownBuilt(game, config) {
  if (game.progress.won) return;
  game.progress.won = true;
  game.progress.wonAt = game.clock.minutes;
  game.events.push({ type: 'victory', people: peopleCount(game, config) });
}
