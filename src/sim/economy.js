// src/sim/economy.js
//
// Money rules: what the tower costs to run each day (upkeep) and what it
// earns each quarter (rent). Pure calculations — no drawing, no timing.
// All the numbers come from config.js.

import { tallestFloor, isConnected, shaftCars } from './tower.js';

export function createEconomy() {
  return {
    upkeepThisQuarter: 0, // running total, shown on the quarterly report
    salesThisQuarter: 0, // money customers spent this quarter (already in funds)
    salesByFacility: {}, // facility id -> sales this quarter (for the income overlay)
    occupancyDays: {}, // facility id -> days of "fully occupied" earned this quarter
    debtDays: 0, // consecutive days spent below $0
  };
}

// Daily upkeep bill. Every facility costs (cells x floors x upkeepPerCell), and
// the whole bill grows with the tower's height: bigger towers cost more to run.
export function dailyUpkeep(tower, config) {
  let base = 0;
  for (const f of tower.facilities.values()) {
    const def = config.facilities[f.type];
    base += f.width * f.height * def.upkeepPerCell;
    if (def.transport === 'elevator') base += shaftCars(config, f) * config.elevators.carUpkeepPerDay;
  }
  const sizeFactor = 1 + config.economy.sizeUpkeepPerFloor * tallestFloor(tower);
  return Math.round(base * sizeFactor);
}

// Once a day, note how full each rentable facility was. `occupancyOf` returns
// 0..1 (tenants / capacity). Unreachable facilities earn nothing.
export function recordDailyOccupancy(economy, tower, config, occupancyOf) {
  for (const f of tower.facilities.values()) {
    if (config.facilities[f.type].rentPerCell <= 0 || !isConnected(tower, config, f)) continue;
    economy.occupancyDays[f.id] = (economy.occupancyDays[f.id] ?? 0) + occupancyOf(f);
  }
}

// Rent due at the end of a quarter: each facility's full-quarter rent times
// the share of days it was occupied (an empty unit pays nothing, a unit built
// halfway through the quarter only counts the days it existed).
export function quarterlyRent(tower, config, economy) {
  const dpq = config.time.daysPerQuarter;
  const byType = new Map(); // type -> { type, name, count, rent, days }
  let total = 0;

  for (const f of tower.facilities.values()) {
    const def = config.facilities[f.type];
    if (def.rentPerCell <= 0) continue;
    const days = Math.min(dpq, economy.occupancyDays[f.id] ?? 0);
    const rent = Math.round((f.width * def.rentPerCell * days) / dpq);

    const row = byType.get(f.type) ?? { type: f.type, name: def.name, count: 0, rent: 0, days: 0 };
    row.count += 1;
    row.rent += rent;
    row.days += days;
    byType.set(f.type, row);
    total += rent;
  }
  const rows = Array.from(byType.values()).map((r) => ({
    ...r,
    percent: Math.round((r.days / (dpq * r.count)) * 100), // average % occupied
  }));
  return { rows, total };
}
