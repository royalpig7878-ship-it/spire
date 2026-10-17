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
import { createEconomy, dailyUpkeep, quarterlyRent } from './economy.js';

export function createGame(config) {
  return {
    tower: createTower(config),
    clock: createClock(config),
    economy: createEconomy(),
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

  // Elevators run in "sim seconds" (real seconds x speed), separate from the
  // game clock, so cars stay watchable even though a game day is short.
  updateElevators(game, config, dtSeconds * game.speed);

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

  // 1. Pay today's upkeep.
  const upkeep = dailyUpkeep(tower, config);
  tower.funds -= upkeep;
  economy.upkeepThisQuarter += upkeep;

  // 2. If a quarter just ended, collect rent and prepare the report.
  const dpq = config.time.daysPerQuarter;
  const newDay0 = dayIndex(clock);
  if (newDay0 > 0 && newDay0 % dpq === 0) {
    const endMinute = clock.minutes;
    const startMinute = endMinute - dpq * MINUTES_PER_DAY;
    const rent = quarterlyRent(tower, config, startMinute, endMinute);
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
        upkeep: economy.upkeepThisQuarter,
        net: rent.total - economy.upkeepThisQuarter,
        fundsBefore,
        fundsAfter: tower.funds,
      },
    });
    economy.upkeepThisQuarter = 0;
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
