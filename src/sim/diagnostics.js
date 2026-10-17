// src/sim/diagnostics.js
//
// Read-only questions the player's diagnostic tools ask about the tower:
// "how stressed are the people here?", "how long is the wait at this stop?",
// "how full is this building?", "how much does it earn?".
// Used by the overlays and the info panels. Never changes anything.

import { isConnected } from './tower.js';
import { MINUTES_PER_DAY } from './clock.js';
import { districtBonus } from './districts.js';
import { coverageOf, noiseOf } from './services.js';

export function tenantsOf(game, facility) {
  return Array.from(game.tenants.byFacility.get(facility.id) ?? []);
}

export function averageStress(game, facility) {
  const list = tenantsOf(game, facility);
  if (!list.length) return null;
  return list.reduce((sum, t) => sum + t.stress, 0) / list.length;
}

// 0..1, or null for facilities that have no tenants to count (stairs, shops...).
export function occupancy(game, config, facility) {
  const def = config.facilities[facility.type];
  if (!def.capacity) return null;
  return Math.min(1, tenantsOf(game, facility).length / def.capacity);
}

// Estimated money per quarter: rent at today's occupancy, plus shop sales so
// far this quarter scaled up to a whole quarter.
export function incomePerQuarter(game, config, facility) {
  const def = config.facilities[facility.type];
  if (def.rentPerCell <= 0 && !def.visitRevenue) return null;
  const occ = occupancy(game, config, facility) ?? 1;
  const connected = isConnected(game.tower, config, facility);
  const bonus = districtBonus(game.tower, config, facility);
  let rent = connected ? facility.width * def.rentPerCell * occ * bonus.rentMult : 0;
  const dpq = config.time.daysPerQuarter;
  const quarterStart = Math.floor(game.clock.minutes / (dpq * MINUTES_PER_DAY)) * dpq * MINUTES_PER_DAY;
  const daysIn = Math.max(0.5, (game.clock.minutes - quarterStart) / MINUTES_PER_DAY);
  const sales = ((game.economy.salesByFacility[facility.id] ?? 0) / daysIn) * dpq;
  rent += sales;
  return rent;
}

// How long people have recently waited at one stop of a shaft, in seconds:
// the larger of "the longest wait in line right now" and the recent average.
export function stopWaitSeconds(shaft, floor) {
  const queue = shaft.waiting.get(floor) ?? [];
  const longest = queue.reduce((max, r) => Math.max(max, r.waited), 0);
  return Math.max(longest, shaft.stopWait.get(floor) ?? 0);
}

export function shaftSummary(shaft) {
  let waitingNow = 0;
  let longest = 0;
  for (const queue of shaft.waiting.values()) {
    waitingNow += queue.length;
    for (const r of queue) longest = Math.max(longest, r.waited);
  }
  const completed = shaft.stats.completed;
  return {
    waitingNow,
    longest,
    completed,
    averageWait: completed ? shaft.stats.totalWait / completed : 0,
    ridingNow: shaft.cars.reduce((n, c) => n + c.riders.length, 0),
  };
}

// The value an overlay shows for one thing, as { value, text, t } where t is
// 0..1 for the color ramp. Returns null when the overlay has nothing to say
// about it (those tiles are dimmed).
export function overlayValue(game, config, mode, facility, floor, context) {
  switch (mode) {
    case 'stress': {
      const s = averageStress(game, facility);
      return s === null ? null : { value: s, text: `${Math.round(s)}`, t: s / 100 };
    }
    case 'occupancy': {
      const o = occupancy(game, config, facility);
      return o === null ? null : { value: o, text: `${Math.round(o * 100)}%`, t: o };
    }
    case 'income': {
      const v = incomePerQuarter(game, config, facility);
      if (v === null) return null;
      return { value: v, text: v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`, t: Math.min(1, v / context.incomeMax) };
    }
    case 'security':
    case 'medical':
    case 'maintenance': {
      const def = config.facilities[facility.type];
      if (def.transport || def.hall) return null;
      const n = coverageOf(game, config, facility)[mode];
      return { value: n, text: n ? `${n}` : '0', t: Math.min(1, n / 2) };
    }
    case 'noise': {
      if (config.facilities[facility.type].transport) return null;
      const n = noiseOf(game, config, facility);
      return { value: n, text: n >= 0.5 ? `${n.toFixed(1)}` : '0', t: Math.min(1, n / 8) };
    }
    case 'wait': {
      if (config.facilities[facility.type].transport !== 'elevator') return null;
      const shaft = game.elevators.shafts.get(facility.id);
      if (!shaft || !shaft.stops.has(floor)) return null;
      const w = stopWaitSeconds(shaft, floor);
      return { value: w, text: `${Math.round(w)}s`, t: Math.min(1, w / config.overlays.waitMaxSec) };
    }
    default:
      return null;
  }
}

// Largest income of any facility (so the income overlay scales to your tower).
export function incomeScale(game, config) {
  let max = 500;
  for (const f of game.tower.facilities.values()) {
    const v = incomePerQuarter(game, config, f);
    if (v !== null) max = Math.max(max, v);
  }
  return max;
}
