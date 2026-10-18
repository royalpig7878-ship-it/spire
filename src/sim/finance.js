// src/sim/finance.js
//
// The numbers behind the Finances screen: where money is going and coming
// from right now, a projection for the end of the quarter, and the last few
// quarters. It only reads the game.

import { dailyUpkeep, quarterlyRent } from './economy.js';
import { shaftCars, tallestFloor, isConnected } from './tower.js';
import { districtBonus } from './districts.js';
import { powerStatus } from './services.js';
import { weatherFx } from './weather.js';
import { occupancyOf } from './tenants.js';
import { MINUTES_PER_DAY } from './clock.js';

const CATEGORY_NAMES = {
  work: 'Offices',
  living: 'Homes',
  hotel: 'Hotel',
  commerce: 'Shops and food',
  services: 'Services',
  transport: 'Stairs and elevators',
  special: 'Lobby and landmarks',
};

export function financeSummary(game, config) {
  const { tower, economy, clock } = game;
  const dpq = config.time.daysPerQuarter;
  const quarterStart = Math.floor(clock.minutes / (dpq * MINUTES_PER_DAY)) * dpq * MINUTES_PER_DAY;
  const daysIn = Math.max(0.25, (clock.minutes - quarterStart) / MINUTES_PER_DAY);
  const rentMult = (f) => districtBonus(tower, config, f).rentMult;

  // Daily bills, by kind of building (before the "taller towers cost more" surcharge)
  const byCategory = new Map();
  let base = 0;
  let carCost = 0;
  for (const f of tower.facilities.values()) {
    const def = config.facilities[f.type];
    const cost = f.width * f.height * def.upkeepPerCell;
    byCategory.set(def.category, (byCategory.get(def.category) ?? 0) + cost);
    base += cost;
    if (def.transport === 'elevator') carCost += shaftCars(config, f) * config.elevators.carUpkeepPerDay;
  }
  base += carCost;
  const total = dailyUpkeep(tower, config);
  const surcharge = Math.max(0, total - base);
  const power = powerStatus(game, config);
  const powerPerDay = Math.round(power.demand * config.power.pricePerUnitPerDay * (weatherFx(game, config).powerPriceMult ?? 1));
  const bills = Array.from(byCategory.entries())
    .filter(([, v]) => v > 0)
    .map(([cat, v]) => ({ label: CATEGORY_NAMES[cat] ?? cat, perDay: Math.round(v) }))
    .sort((a, b) => b.perDay - a.perDay);
  if (carCost) bills.push({ label: 'Elevator cars', perDay: Math.round(carCost) });
  if (surcharge) bills.push({ label: `Height surcharge (${tallestFloor(tower)} floors)`, perDay: surcharge });
  bills.push({ label: 'Power', perDay: powerPerDay });
  const dailyTotal = total + powerPerDay;

  // This quarter so far
  const earned = quarterlyRent(tower, config, economy, rentMult); // rent accrued so far (paid at quarter end)
  const rentSoFar = economy.rentThisQuarter; // already in your funds
  const sales = economy.salesThisQuarter;
  const upkeepSoFar = economy.upkeepThisQuarter;

  // Projection: today's occupancy for a whole quarter, sales pace so far, today's bills
  let rentFull = 0;
  for (const f of tower.facilities.values()) {
    const def = config.facilities[f.type];
    if (def.rentPerCell <= 0 || !isConnected(tower, config, f)) continue;
    rentFull += f.width * def.rentPerCell * Math.min(1, occupancyOf(game, config, f)) * rentMult(f);
  }
  const projRent = Math.round(rentFull);
  const projSales = Math.round((sales / daysIn) * dpq);
  const projUpkeep = Math.round(dailyTotal * dpq);

  // Best earners by kind of building: rent so far plus sales so far
  const salesByType = new Map();
  for (const [id, amount] of Object.entries(economy.salesByFacility)) {
    const f = tower.facilities.get(Number(id));
    if (f) salesByType.set(f.type, (salesByType.get(f.type) ?? 0) + amount);
  }
  const earners = new Map();
  for (const r of earned.rows) earners.set(r.type, { name: r.name, count: r.count, amount: r.rent, percent: r.percent });
  for (const [type, amount] of salesByType) {
    const row = earners.get(type) ?? { name: config.facilities[type].name, count: 0, amount: 0, percent: null };
    row.amount += amount;
    earners.set(type, row);
  }
  const best = Array.from(earners.values()).sort((a, b) => b.amount - a.amount).slice(0, 6);

  return {
    funds: tower.funds,
    daysIn: Math.min(dpq, daysIn),
    daysPerQuarter: dpq,
    soFar: { rent: rentSoFar, sales, upkeep: upkeepSoFar, net: rentSoFar + sales - upkeepSoFar },
    rentPerDay: Math.round(projRent / dpq),
    projected: { rent: projRent, sales: projSales, upkeep: projUpkeep, net: projRent + projSales - projUpkeep },
    bills,
    dailyTotal,
    best,
    history: (economy.history ?? []).slice(-6),
  };
}
