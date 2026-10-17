// src/sim/game.js
//
// Ties the pieces together: the tower, the clock and the economy, plus the
// speed setting. `updateGame` is what the fixed-timestep loop calls.
//
// Things that need the player's attention (a quarterly report, a fire-sale
// offer, an autosave) are pushed onto `game.events`. The UI reads and
// clears that list — the simulation never touches the screen itself.

import { createTower, canDemolish, demolish, buildCost } from './tower.js';
import { createElevatorSystem, updateElevators } from './elevators.js';
import { createClock, calendar, dayIndex, MINUTES_PER_DAY } from './clock.js';
import { createEconomy, dailyUpkeep, quarterlyRent, recordDailyOccupancy } from './economy.js';
import { createTenantSystem, updateTenants, dailyTenantUpdate, occupancyOf } from './tenants.js';
import { createServices, dailyServicesUpdate, powerStatus } from './services.js';
import { districtBonus } from './districts.js';
import { createWeather, rollWeather, weatherFx } from './weather.js';
import { createIncidents, updateIncidents, dailyIncidents } from './incidents.js';
import { createProgress, tickProgress, dailyProgress } from './progress.js';
import { spawnInspector } from './tenants.js';

export function createGame(config) {
  const clock = createClock(config);
  return {
    tower: createTower(config),
    clock,
    economy: createEconomy(),
    tenants: createTenantSystem(config, clock.minutes), // the people (saved in simple form)
    services: createServices(), // trash levels and other building-service state
    weather: createWeather(), // today's weather and season
    incidents: createIncidents(), // fires, pests, a power dip, an extortion note...
    progress: createProgress(), // rating tier, inspections, victory
    alerts: [], // short notices for the UI (fires, inspector news...); the UI empties this
    elevators: createElevatorSystem(), // cars and riders (not saved; rebuilt on load)
    demoTraffic: false, // Tools tab toggle: random riders for watching dispatch
    speed: config.time.defaultSpeed,
    blocked: false, // true while a report/offer is waiting for the player
    events: [],
  };
}

// Advance the game by `dtSeconds` of real time.
export function updateGame(game, config, dtSeconds) {
  if (game.blocked || game.speed === 0) return;

  // Tenants and elevators move in "sim seconds" (real seconds x speed),
  // separate from the game clock, so people and cars stay watchable.
  // Tenants go first so their ride requests are seen by this tick's dispatch.
  updateIncidents(game, config, dtSeconds * game.speed);
  updateTenants(game, config, dtSeconds * game.speed);
  updateElevators(game, config, dtSeconds * game.speed);
  tickProgress(game, config, spawnInspector);

  let minutesLeft = (dtSeconds * game.speed * MINUTES_PER_DAY) / config.time.dayLengthSeconds;
  const clock = game.clock;

  while (minutesLeft > 0 && !game.blocked) {
    // Step only up to the next midnight so day changes are never skipped.
    const nextMidnight = (dayIndex(clock) + 1) * MINUTES_PER_DAY;
    const step = Math.min(minutesLeft, nextMidnight - clock.minutes);
    minutesLeft -= step;
    if (step >= nextMidnight - clock.minutes) {
      clock.minutes = nextMidnight;
      onNewDay(game, config);
    } else {
      clock.minutes += step;
    }
  }
}

function onNewDay(game, config) {
  const { tower, economy, clock } = game;

  // 1. Pay today's upkeep, and note how full each rentable unit was today.
  // A new day: new weather, and maybe a random event or an inspector visit.
  rollWeather(game, config);
  dailyIncidents(game, config);
  dailyProgress(game, config);

  // The electricity bill is part of upkeep (a heat wave makes it dearer);
  // recycling and parking earn a little.
  const power = powerStatus(game, config);
  const powerPrice = config.power.pricePerUnitPerDay * (weatherFx(game, config).powerPriceMult ?? 1);
  const upkeep = dailyUpkeep(tower, config) + Math.round(power.demand * powerPrice);
  tower.funds -= upkeep;
  economy.upkeepThisQuarter += upkeep;
  const serviceIncome = dailyServicesUpdate(game, config);
  tower.funds += serviceIncome;
  economy.salesThisQuarter += serviceIncome;
  recordDailyOccupancy(economy, tower, config, (f) => occupancyOf(game, config, f));
  dailyTenantUpdate(game, config);

  // 2. If a quarter just ended, collect rent and prepare the report.
  const dpq = config.time.daysPerQuarter;
  const newDay0 = dayIndex(clock);
  if (newDay0 > 0 && newDay0 % dpq === 0) {
    const endMinute = clock.minutes;
    const rent = quarterlyRent(tower, config, economy, (f) => districtBonus(tower, config, f).rentMult);
    const fundsBefore = tower.funds;
    tower.funds += rent.total;

    // Calendar of the quarter that just finished (one minute ago).
    const finished = calendar({ minutes: endMinute - 1 }, config);
    game.events.push({
      type: 'quarterReport',
      report: {
        year: finished.year,
        quarter: finished.quarter,
        rows: rent.rows,
        income: rent.total,
        sales: economy.salesThisQuarter, // customer spending, already in funds
        upkeep: economy.upkeepThisQuarter,
        net: rent.total + economy.salesThisQuarter - economy.upkeepThisQuarter,
        moveOuts: game.tenants.stats.moveOuts,
        fundsBefore,
        fundsAfter: tower.funds,
      },
    });
    economy.upkeepThisQuarter = 0;
    economy.salesThisQuarter = 0;
    economy.salesByFacility = {};
    economy.occupancyDays = {};
    game.blocked = true;
  }

  // 3. Soft-fail: count days in debt; offer a fire sale when grace runs out.
  if (tower.funds < 0) {
    economy.debtDays += 1;
    if (economy.debtDays >= config.economy.debtGraceDays) {
      game.events.push({ type: 'fireSale' });
      game.blocked = true;
    }
  } else {
    economy.debtDays = 0;
  }

  // 4. Autosave once per game day.
  game.events.push({ type: 'autosave' });
}

// ---- Fire sale (the soft-fail "get out of debt" option) ----

// The priciest facilities that can be removed without leaving anything floating.
export function fireSaleOffers(game, config) {
  return Array.from(game.tower.facilities.values())
    .filter((f) => !f.locked && canDemolish(game.tower, config, f).ok)
    .sort((a, b) => buildCost(config, b) - buildCost(config, a))
    .slice(0, config.economy.fireSaleOffers)
    .map((f) => ({
      facility: f,
      name: config.facilities[f.type].name,
      value: Math.round(buildCost(config, f) * config.economy.fireSaleRatio),
    }));
}

export function fireSaleSell(game, config, facility) {
  const result = demolish(game.tower, config, facility, config.economy.fireSaleRatio);
  if (result.ok && game.tower.funds >= 0) game.economy.debtDays = 0;
  return result;
}

// Player declined: give a few more days before offering again.
export function fireSaleDecline(game, config) {
  game.economy.debtDays = Math.max(0, config.economy.debtGraceDays - config.economy.fireSaleExtraDays);
}
