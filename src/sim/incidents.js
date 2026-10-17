// src/sim/incidents.js
//
// Random events. Every one is announced, every one can be handled, and a
// well-run tower rarely sees the worst of them:
//   FIRE        starts in a busy building and spreads to neighbours. Sprinklers,
//               maintenance hubs (and, a little, security) fight it. A fire left
//               to burn gutts the building: closed for days, repair bill.
//               Elevators will not stop on a burning floor, so people must
//               use stairs; stuck on a smoky floor they get very stressed.
//   PESTS       breed in dirty buildings (high trash). Clean up and they go.
//   POWER DIP   the power fails for a couple of game hours: elevators crawl,
//               windows go dark. A big power surplus softens it.
//   EXTORTION   an anonymous demand for money: pay, or trust your security.
//   VIP VISIT   a test of your smoothness (see progress.js).
// The sim posts alerts (`game.alerts`) and pop-up events (`game.events`).

import { coverageOf, trashLevel, powerStatus } from './services.js';
import { dayIndex, MINUTES_PER_DAY } from './clock.js';
import { buildCost, isConnected } from './tower.js';
import { scheduleVip } from './progress.js';

export function createIncidents() {
  return {
    fires: {}, // facility id -> { intensity }
    pests: {}, // facility id -> { days }
    outage: null, // { untilMinute, factor }
    extortion: null, // { demand, chance } while waiting for the player's answer
    lastEventDay: -99,
  };
}

const rnd = (a, b) => a + Math.random() * (b - a);
const nameOf = (config, f) => config.facilities[f.type].name;

function alert(game, text, f, kind) {
  game.alerts.push({ text, kind, floor: f ? f.floor : null, cell: f ? f.cell + f.width / 2 : null });
}

// ---------- Lookups used elsewhere ----------

export function isBurning(game, f) {
  return Boolean(game.incidents.fires[f.id]);
}

export function isClosed(game, f) {
  return Boolean(f.closedUntil && f.closedUntil > game.clock.minutes);
}

// Floors that currently have a fire (elevators do not stop there).
export function fireFloors(game) {
  const floors = new Set();
  for (const id of Object.keys(game.incidents.fires)) {
    const f = game.tower.facilities.get(Number(id));
    if (!f) continue;
    for (let fl = f.floor; fl < f.floor + f.height; fl++) floors.add(fl);
  }
  return floors;
}

// 1 normally; during a power dip, how fast the elevators still go.
export function outageFactor(game) {
  return game.incidents.outage ? game.incidents.outage.factor : 1;
}

export function hasCrisis(game) {
  const inc = game.incidents;
  return Object.keys(inc.fires).length + Object.keys(inc.pests).length + (inc.outage ? 1 : 0);
}

// ---------- Fire ----------

function neighbours(game, config, f) {
  const t = game.tower;
  const found = new Set();
  const add = (fl, c) => {
    const id = t.cells.get(`${fl},${c}`);
    if (id !== undefined && id !== f.id) found.add(id);
  };
  for (let fl = f.floor; fl < f.floor + f.height; fl++) {
    add(fl, f.cell - 1);
    add(fl, f.cell + f.width);
  }
  for (let c = f.cell; c < f.cell + f.width; c++) {
    add(f.floor - 1, c);
    add(f.floor + f.height, c);
  }
  return Array.from(found)
    .map((id) => t.facilities.get(id))
    .filter((n) => n && !config.facilities[n.type].transport);
}

function ignite(game, config, f, announce) {
  if (game.incidents.fires[f.id] || isClosed(game, f) || config.facilities[f.type].transport) return;
  game.incidents.fires[f.id] = { intensity: config.incidents.fire.startIntensity };
  if (announce) alert(game, `Fire at the ${nameOf(config, f)} on floor ${f.floor}!`, f, 'fire');
}

function startFire(game, config) {
  const candidates = [];
  for (const f of game.tower.facilities.values()) {
    const def = config.facilities[f.type];
    if (def.transport || def.hall || isClosed(game, f) || !isConnected(game.tower, config, f)) continue;
    if (!(game.tenants.byFacility.get(f.id)?.size || def.purposes)) continue;
    const weight = 1 + trashLevel(game, f) / 50 + (f.sprinklers ? 0 : 1);
    candidates.push({ f, weight });
  }
  if (candidates.length < 4) return false;
  let roll = Math.random() * candidates.reduce((s, c) => s + c.weight, 0);
  for (const c of candidates) {
    roll -= c.weight;
    if (roll <= 0) {
      ignite(game, config, c.f, true);
      return true;
    }
  }
  return false;
}

export function installSprinklers(game, config, f) {
  const def = config.facilities[f.type];
  if (def.transport || def.hall) return { ok: false, reason: 'Not needed here' };
  if (f.sprinklers) return { ok: false, reason: 'Already installed' };
  const cost = f.width * f.height * config.incidents.fire.sprinklerCostPerCell;
  if (game.tower.funds < cost) return { ok: false, reason: 'Not enough funds' };
  game.tower.funds -= cost;
  f.sprinklers = true;
  return { ok: true, reason: '', cost };
}

function updateFires(game, config, dt) {
  const ic = config.incidents.fire;
  for (const [key, fire] of Object.entries(game.incidents.fires)) {
    const f = game.tower.facilities.get(Number(key));
    if (!f) {
      delete game.incidents.fires[key];
      continue;
    }
    const cov = coverageOf(game, config, f);
    const suppress =
      (f.sprinklers ? ic.sprinklerSuppress : 0) +
      Math.min(cov.maintenance, ic.maxMaintenance) * ic.maintenanceSuppress +
      (cov.security ? ic.securitySuppress : 0);
    fire.intensity += (ic.growthPerSec - suppress) * dt;

    if (fire.intensity <= 0) {
      delete game.incidents.fires[key];
      alert(game, `The fire at the ${nameOf(config, f)} is out.`, f, 'good');
      continue;
    }
    if (fire.intensity >= ic.gutAt) {
      // Gutted: closed for repairs, and the owner pays.
      delete game.incidents.fires[key];
      const repair = Math.round(buildCost(config, f) * ic.repairShare);
      game.tower.funds -= repair;
      f.closedUntil = game.clock.minutes + ic.closedDays * MINUTES_PER_DAY;
      game.tenants.stats.reputation = Math.max(0, game.tenants.stats.reputation - 2);
      alert(game, `The ${nameOf(config, f)} was gutted. Repairs cost $${repair.toLocaleString('en-US')}; closed ${ic.closedDays} days.`, f, 'fire');
      continue;
    }
    // A strong fire can jump to a neighbour (much less likely behind sprinklers).
    if (fire.intensity > ic.spreadAbove) {
      for (const n of neighbours(game, config, f)) {
        const mult = n.sprinklers ? ic.sprinklerSpreadMult : 1;
        if (Math.random() < ic.spreadChancePerSec * mult * dt) ignite(game, config, n, true);
      }
    }
  }
}

// ---------- Power dip ----------

function startOutage(game, config) {
  const oc = config.incidents.outage;
  const p = powerStatus(game, config);
  const surplus = p.demand > 0 ? Math.max(0, p.supply / p.demand - 1) : 1;
  const factor = Math.min(oc.maxFactor, oc.baseFactor + surplus * oc.surplusBonus);
  game.incidents.outage = { untilMinute: game.clock.minutes + rnd(oc.durationMin[0], oc.durationMin[1]), factor };
  alert(game, `Power dip! Elevators run at ${Math.round(factor * 100)}% speed and lights are down. A power surplus would soften this.`, null, 'power');
}

// ---------- Pests ----------

function startPests(game, config) {
  const pc = config.incidents.pests;
  const dirty = [];
  for (const f of game.tower.facilities.values()) {
    if (!game.incidents.pests[f.id] && trashLevel(game, f) >= pc.needTrashAbove) dirty.push(f);
  }
  if (!dirty.length) return false;
  const f = dirty[Math.floor(Math.random() * dirty.length)];
  game.incidents.pests[f.id] = { days: 0 };
  alert(game, `Pests in the ${nameOf(config, f)}! Trash is piling up: build maintenance and recycling.`, f, 'pests');
  return true;
}

function dailyPests(game, config) {
  const pc = config.incidents.pests;
  for (const [key, p] of Object.entries(game.incidents.pests)) {
    const f = game.tower.facilities.get(Number(key));
    p.days += 1;
    if (!f || trashLevel(game, f) < pc.clearBelow || p.days >= pc.maxDays) {
      delete game.incidents.pests[key];
      if (f) alert(game, `The pests in the ${nameOf(config, f)} are gone.`, f, 'good');
    }
  }
}

// ---------- Extortion ----------

function startExtortion(game, config) {
  const ec = config.incidents.extortion;
  const funds = game.tower.funds;
  if (funds < ec.minDemand * 2) return false;
  const demand = Math.round(Math.max(ec.minDemand, Math.min(ec.maxDemand, funds * rnd(ec.demandShareOfFunds[0], ec.demandShareOfFunds[1]))) / 100) * 100;
  const { offices, share } = securityShare(game, config);
  const chance = Math.min(ec.maxChance, ec.baseChance + ec.perSecurity * offices + ec.coverageBonus * share);
  game.incidents.extortion = { demand, chance, share };
  game.events.push({ type: 'extortion', demand, chance, share });
  return true;
}

function securityShare(game, config) {
  let offices = 0;
  let covered = 0;
  let total = 0;
  for (const f of game.tower.facilities.values()) {
    const def = config.facilities[f.type];
    if (def.serviceKind === 'security') offices += 1;
    if (def.capacity || def.purposes) {
      total += 1;
      if (coverageOf(game, config, f).security) covered += 1;
    }
  }
  return { offices, share: total ? covered / total : 0 };
}

// choice: 'pay' | 'trust'. Returns { text, good }.
export function resolveExtortion(game, config, choice) {
  const ec = config.incidents.extortion;
  const e = game.incidents.extortion;
  game.incidents.extortion = null;
  if (!e) return { text: 'Nothing to answer.', good: true };
  const stats = game.tenants.stats;
  if (choice === 'pay') {
    game.tower.funds -= e.demand;
    return { text: `You paid $${e.demand.toLocaleString('en-US')}. Nothing happened.`, good: true };
  }
  if (Math.random() < e.chance) {
    stats.reputation = Math.min(100, stats.reputation + ec.successReputation);
    return { text: 'Security found the device and disarmed it. Reputation up!', good: true };
  }
  // The device goes off. Good security cover softens the damage.
  const damage = Math.round(e.demand * ec.damageMult * (1 - 0.6 * e.share));
  game.tower.funds -= damage;
  for (const t of game.tenants.list) t.stress = Math.min(100, t.stress + ec.stressSpike);
  stats.reputation = Math.max(0, stats.reputation + ec.reputationHit);
  return { text: `The device went off. Damage cost $${damage.toLocaleString('en-US')} and everyone is shaken.`, good: false };
}

// ---------- Scheduler and per-tick update ----------

export function updateIncidents(game, config, dt) {
  updateFires(game, config, dt);
  const inc = game.incidents;
  if (inc.outage && game.clock.minutes >= inc.outage.untilMinute) {
    inc.outage = null;
    alert(game, 'Power is back on.', null, 'good');
  }
}

// Called each midnight.
export function dailyIncidents(game, config) {
  const ic = config.incidents;
  const inc = game.incidents;
  const day = dayIndex(game.clock);
  dailyPests(game, config);
  if (day < ic.graceDays || day - inc.lastEventDay < ic.minDaysBetween) return;
  if (inc.extortion || inc.outage || Object.keys(inc.fires).length) return; // one serious thing at a time
  if (Math.random() >= ic.chancePerDay) return;

  const options = Object.entries(ic.weights).filter(([k]) => game.tower.tier >= (ic.fromTier[k] ?? 0));
  let roll = Math.random() * options.reduce((s, [, w]) => s + w, 0);
  let kind = options[0][0];
  for (const [k, w] of options) {
    roll -= w;
    if (roll <= 0) {
      kind = k;
      break;
    }
  }
  const started =
    kind === 'fire'
      ? startFire(game, config)
      : kind === 'pests'
        ? startPests(game, config)
        : kind === 'outage'
          ? (startOutage(game, config), true)
          : kind === 'extortion'
            ? startExtortion(game, config)
            : scheduleVip(game, config);
  if (started) inc.lastEventDay = day;
}
