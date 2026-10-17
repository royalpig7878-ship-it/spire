// src/sim/services.js
//
// Everything a building gets (or suffers) from its surroundings:
//   COVERAGE  security / medical / maintenance offices cover nearby floors;
//   TRASH     tenants and visitors make it, maintenance hubs clean it,
//             recycling plants reduce it, and a trashy unit stresses its people;
//   NOISE     loud neighbours on nearby floors annoy people at home;
//   POWER     everything draws power; substations add supply; a shortage
//             slows the elevators (a "brownout");
//   PARKING   some workers drive, garages hold their cars and earn a fee;
//   ATRIUM    calming open space for nearby floors;
//   APPEAL    how attractive a unit is to new tenants, from all of the above.
// Pure calculations on the game state; the numbers are in config.js
// (`services`, `power`, `parking`) and catalog.js.

import { isConnected } from './tower.js';
import { districtBonus } from './districts.js';

export function createServices() {
  return {
    trash: {}, // facility id -> 0..100
    visitsToday: {}, // facility id -> visits since midnight (feeds trash)
  };
}

// Distance in floors between two floor ranges (0 if they overlap).
function floorGap(aFloor, aTop, bFloor, bTop) {
  return Math.max(0, bFloor - aTop, aFloor - bTop);
}

// Rebuilt only when the tower changes.
function getModel(game, config) {
  const tower = game.tower;
  if (tower._services && tower._services.version === tower.version) return tower._services.value;
  const sc = config.services;
  const all = Array.from(tower.facilities.values());
  const top = (f) => f.floor + f.height - 1;

  // Service shafts: staff elevators that stretch the reach of services.
  const serviceShafts = all.filter((f) => config.facilities[f.type].serviceOnly);
  const sharesShaft = (a, b) =>
    serviceShafts.some((s) => a.floor >= s.floor && top(a) <= top(s) && b.floor >= s.floor && top(b) <= top(s));

  // Coverage + noise
  const coverage = new Map(); // id -> { security, medical, maintenance, clean }
  const noise = new Map(); // id -> noise level
  for (const f of all) {
    coverage.set(f.id, { security: 0, medical: 0, maintenance: 0, clean: 0 });
    noise.set(f.id, 0);
  }
  for (const s of all) {
    const sdef = config.facilities[s.type];
    if (sdef.serviceKind && isConnected(tower, config, s)) {
      for (const f of all) {
        const reach = sdef.coverFloors * (sharesShaft(s, f) ? sc.serviceElevatorReachMult : 1);
        if (floorGap(s.floor, top(s), f.floor, top(f)) <= reach) {
          const c = coverage.get(f.id);
          c[sdef.serviceKind] += 1;
          if (sdef.serviceKind === 'maintenance') c.clean += sdef.cleanPerDay;
        }
      }
    }
    if (sdef.noise) {
      for (const f of all) {
        if (f === s) continue;
        const gap = floorGap(s.floor, top(s), f.floor, top(f));
        if (gap <= sc.noise.reachFloors) {
          noise.set(f.id, noise.get(f.id) + sdef.noise * (1 - gap / (sc.noise.reachFloors + 1)));
        }
      }
    }
  }

  // Power, recycling, parking, atria
  let demand = 0;
  let supply = config.power.baseSupply;
  let trashCut = 0;
  let recyclingIncome = 0;
  let parkingCapacity = 0;
  const atria = [];
  for (const f of all) {
    const def = config.facilities[f.type];
    demand += f.width * f.height * (def.powerPerCell ?? config.power.defaultPerCell);
    supply += def.powerSupply ?? 0;
    if (def.trashCut) {
      trashCut += def.trashCut;
      recyclingIncome += def.dailyIncome ?? 0;
    }
    parkingCapacity += def.parkingCapacity ?? 0;
    if (def.amenityRelief) atria.push({ floor: f.floor, top: top(f), reach: def.amenityReach, relief: def.amenityRelief });
  }
  const ratio = demand > 0 ? Math.min(1, supply / demand) : 1;

  const value = {
    coverage,
    noise,
    power: { demand, supply, ratio },
    trashCut: Math.min(sc.trash.maxCut, trashCut),
    recyclingIncome,
    parkingCapacity,
    atria,
    serviceShafts,
  };
  tower._services = { version: tower.version, value };
  return value;
}

export const coverageOf = (game, config, f) => getModel(game, config).coverage.get(f.id) ?? { security: 0, medical: 0, maintenance: 0, clean: 0 };
export const noiseOf = (game, config, f) => getModel(game, config).noise.get(f.id) ?? 0;
export const powerStatus = (game, config) => getModel(game, config).power;
export const recyclingCut = (game, config) => getModel(game, config).trashCut;

// Stress relief per second from nearby atria for someone on `floor`.
export function amenityRelief(game, config, floor) {
  let relief = 0;
  for (const a of getModel(game, config).atria) {
    if (floor >= a.floor - a.reach && floor <= a.top + a.reach) relief += a.relief;
  }
  return Math.min(0.7, relief);
}

export function trashLevel(game, f) {
  return game.services.trash[f.id] ?? 0;
}

// Parking: how many workers drive, how many spaces there are.
export function parkingStatus(game, config) {
  const capacity = getModel(game, config).parkingCapacity;
  let workers = 0;
  for (const t of game.tenants.list) if (t.kind === 'worker') workers += 1;
  const drivers = Math.round(workers * config.parking.driverShare);
  return { capacity, drivers, parked: Math.min(capacity, drivers), factor: drivers === 0 ? 1 : Math.min(1, capacity / drivers) };
}

// How attractive a unit is to people deciding where to move (1 = average).
export function appealOf(game, config, f) {
  const sc = config.services;
  const cov = coverageOf(game, config, f);
  const def = config.facilities[f.type];
  let appeal = 1;
  if (cov.security) appeal += sc.appeal.security;
  if (cov.medical) appeal += sc.appeal.medical;
  if (cov.maintenance) appeal += sc.appeal.maintenance;
  if (amenityRelief(game, config, f.floor) > 0) appeal += sc.appeal.atrium;
  if (def.tenantKind === 'worker') appeal += sc.appeal.parking * parkingStatus(game, config).factor * (parkingStatus(game, config).capacity ? 1 : 0);
  appeal += districtBonus(game.tower, config, f).appeal;
  const trash = trashLevel(game, f);
  appeal *= 1 - Math.max(0, Math.min(0.4, (trash - sc.trash.badgeAbove) / 100));
  return Math.min(sc.appeal.max, appeal);
}

// Called once per game day (midnight): trash piles up and is cleaned,
// recycling and parking earn their fees. Returns money earned today.
export function dailyServicesUpdate(game, config) {
  const model = getModel(game, config);
  const tc = config.services.trash;
  const sys = game.services;
  const genMult = 1 - model.trashCut;

  for (const f of game.tower.facilities.values()) {
    const def = config.facilities[f.type];
    if (!def.capacity && !def.purposes) continue;
    const tenants = game.tenants.byFacility.get(f.id)?.size ?? 0;
    const visits = sys.visitsToday[f.id] ?? 0;
    const made = (tenants * tc.perTenantPerDay + visits * tc.perVisit + tc.basePerDay) * genMult;
    const cleaned = model.coverage.get(f.id)?.clean ?? 0;
    sys.trash[f.id] = Math.max(0, Math.min(100, (sys.trash[f.id] ?? 0) + made - cleaned));
  }
  for (const id of Object.keys(sys.trash)) if (!game.tower.facilities.has(Number(id))) delete sys.trash[id];
  sys.visitsToday = {};

  let earned = model.recyclingIncome;
  earned += parkingStatus(game, config).parked * config.parking.incomePerCarPerDay;
  return earned;
}
