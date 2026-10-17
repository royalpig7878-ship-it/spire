// src/sim/economy.js
//
// Money rules: what the tower costs to run each day (upkeep) and what it
// earns each quarter (rent). Pure calculations — no drawing, no timing.
// All the numbers come from config.js.

import { tallestFloor, isConnected } from './tower.js';
import { MINUTES_PER_DAY } from './clock.js';

export function createEconomy() {
  return {
    upkeepThisQuarter: 0, // running total, shown on the quarterly report
    debtDays: 0, // consecutive days spent below $0
  };
}

// Daily upkeep bill. Every facility costs (cells x upkeepPerCell), and the
// whole bill grows with the tower's height: bigger towers cost more to run.
export function dailyUpkeep(tower, config) {
  let base = 0;
  for (const f of tower.facilities.values()) {
    base += f.width * f.height * config.facilities[f.type].upkeepPerCell;
  }
  const sizeFactor = 1 + config.economy.sizeUpkeepPerFloor * tallestFloor(tower);
  return Math.round(base * sizeFactor);
}

// Rent due at the end of a quarter. Only occupied facilities pay, and a
// facility built partway through the quarter pays only for the days it
// existed (so building right before the report isn't a free-money trick).
export function quarterlyRent(tower, config, quarterStartMinute, quarterEndMinute) {
  const quarterMinutes = config.time.daysPerQuarter * MINUTES_PER_DAY;
  const byType = new Map(); // type -> { type, name, count, rent }
  let total = 0;

  for (const f of tower.facilities.values()) {
    const def = config.facilities[f.type];
    // Only occupied facilities that people can actually reach pay rent.
    if (!f.occupied || def.rentPerCell <= 0 || !isConnected(tower, config, f)) continue;
    const ownedFrom = Math.max(quarterStartMinute, f.builtMinute);
    const fraction = Math.max(0, Math.min(1, (quarterEndMinute - ownedFrom) / quarterMinutes));
    const rent = Math.round(f.width * def.rentPerCell * fraction);

    const row = byType.get(f.type) ?? { type: f.type, name: def.name, count: 0, rent: 0 };
    row.count += 1;
    row.rent += rent;
    byType.set(f.type, row);
    total += rent;
  }
  return { rows: Array.from(byType.values()), total };
}
