// src/sim/weather.js
//
// Seasons and weather. Each quarter is a season (Spring, Summer, Autumn,
// Winter) and each morning the weather is rolled from that season's odds.
// What each kind of weather does is listed in config.js (`weather`):
//   Rain       people avoid walking and stairs, so more ride the elevator;
//              shops do well; arrivals come in damp and a little stressed.
//   Heat wave  air conditioning raises power demand and the power bill.
//   Snow       the street slows people down: later arrivals, slower walking.
// Pure logic: the sky and the falling rain/snow are drawn in render/weather.js.

import { calendar } from './clock.js';

export function createWeather() {
  return { kind: 'clear', season: 'Spring' };
}

export function seasonName(config, clock) {
  return config.weather.seasons[calendar(clock, config).quarter - 1];
}

// Pick today's weather for the current season. Called each midnight.
export function rollWeather(game, config) {
  const season = seasonName(config, game.clock);
  const odds = config.weather.odds[season];
  let roll = Math.random() * Object.values(odds).reduce((a, b) => a + b, 0);
  let kind = 'clear';
  for (const [k, p] of Object.entries(odds)) {
    roll -= p;
    if (roll <= 0) {
      kind = k;
      break;
    }
  }
  game.weather = { kind, season };
}

// The effects of today's weather (an object of optional multipliers).
export function weatherFx(game, config) {
  return config.weather.kinds[game.weather.kind] ?? {};
}

export function weatherLabel(game, config) {
  return `${game.weather.season} · ${config.weather.kinds[game.weather.kind].label}`;
}
