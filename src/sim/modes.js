// src/sim/modes.js
//
// Game modes. Every game has a `mode`:
//
//   { kind: 'sandbox', sandbox: { money, tier, events } }   free play
//   { kind: 'career', scenario: 'first-floors', ended: false }   goals + a day limit
//
// A career scenario is won the midnight ALL its goals are met, and lost when
// the day limit runs out first. After either, play can continue ("ended").
// The simulation never touches the screen: results go out as `game.events`.
// All numbers (goals, limits, money) live in `config.modes`.

import { setTier, tallestFloor } from './tower.js';
import { dayIndex } from './clock.js';
import { peopleCount, stars } from './progress.js';

export const defaultSandbox = () => ({ money: 'standard', tier: 'normal', events: 'on' });

export function newMode(kind, scenarioId = null, sandbox = null) {
  if (kind === 'career') return { kind: 'career', scenario: scenarioId, ended: false };
  return { kind: 'sandbox', sandbox: { ...defaultSandbox(), ...(sandbox ?? {}) } };
}

export function scenarioById(config, id) {
  return config.modes.scenarios.find((s) => s.id === id) ?? null;
}

// Called once when a new game is made: money and rating tier for the chosen mode.
export function applyModeStart(game, config) {
  const mode = game.mode;
  if (mode.kind === 'career') {
    const spec = scenarioById(config, mode.scenario);
    if (!spec) return;
    game.tower.funds = spec.startFunds;
    if (spec.startTier > 0) setTier(game.tower, config, spec.startTier);
  } else {
    const money = config.modes.sandbox.money.find((m) => m.id === mode.sandbox.money);
    if (money) game.tower.funds = money.funds;
    if (mode.sandbox.tier === 'max') setTier(game.tower, config, config.tiers.length - 1);
  }
}

// How often random events strike, relative to normal (0 = never).
export function eventRate(game, config) {
  const mode = game.mode;
  if (!mode) return 1;
  if (mode.kind === 'career') return scenarioById(config, mode.scenario)?.eventRate ?? 1;
  return config.modes.sandbox.events.find((e) => e.id === mode.sandbox.events)?.rate ?? 1;
}

// ---- Goals ----

function measure(game, config, goal) {
  const tower = game.tower;
  const stats = game.tenants.stats;
  switch (goal.kind) {
    case 'people': return peopleCount(game, config);
    case 'stars': return stars(tower);
    case 'funds': return Math.round(tower.funds);
    case 'mood': return Math.round(stats.mood);
    case 'reputation': return Math.round(stats.reputation);
    case 'topFloor': return tallestFloor(tower);
    case 'crown': return game.progress.won ? 1 : 0;
    default: return 0;
  }
}

// Progress against the current scenario's goals, or null outside Career.
export function scenarioStatus(game, config) {
  const mode = game.mode;
  if (!mode || mode.kind !== 'career') return null;
  const spec = scenarioById(config, mode.scenario);
  if (!spec) return null;
  const goals = spec.goals.map((g) => {
    const have = measure(game, config, g);
    const flag = g.kind === 'crown';
    return {
      kind: g.kind,
      label: config.modes.goalLabels[g.kind] ?? g.kind,
      have,
      need: g.value,
      ok: have >= g.value,
      money: g.kind === 'funds',
      suffix: g.kind === 'mood' ? '%' : '',
      flag,
    };
  });
  const dayNo = dayIndex(game.clock) + 1; // day 1 is the first day
  return {
    spec,
    goals,
    allMet: goals.every((g) => g.ok),
    dayNo,
    daysLeft: Math.max(0, spec.days - dayIndex(game.clock)),
    limit: spec.days,
    ended: mode.ended,
  };
}

// gold / silver / bronze, from how many days it took.
export function medalFor(config, spec, daysUsed) {
  const frac = daysUsed / spec.days;
  if (frac <= config.modes.medals.gold) return 'gold';
  if (frac <= config.modes.medals.silver) return 'silver';
  return 'bronze';
}

// Each midnight: check the scenario's win and lose conditions.
export function dailyMode(game, config) {
  const mode = game.mode;
  if (!mode || mode.kind !== 'career' || mode.ended) return;
  const status = scenarioStatus(game, config);
  if (!status) return;
  const daysUsed = dayIndex(game.clock); // full days played
  if (status.allMet) {
    mode.ended = true;
    game.events.push({ type: 'scenarioWon', id: status.spec.id, days: daysUsed, medal: medalFor(config, status.spec, daysUsed) });
    game.blocked = true;
  } else if (daysUsed >= status.spec.days) {
    mode.ended = true;
    game.events.push({ type: 'scenarioLost', id: status.spec.id, days: daysUsed });
    game.blocked = true;
  }
}

// Called every tick (cheap): endless sandbox money never runs out.
export function tickMode(game, config) {
  const mode = game.mode;
  if (mode?.kind !== 'sandbox' || mode.sandbox.money !== 'endless') return;
  const rule = config.modes.sandbox;
  if (game.tower.funds < rule.endlessTopUpBelow) {
    game.tower.funds = rule.money.find((m) => m.id === 'endless').funds;
  }
}
