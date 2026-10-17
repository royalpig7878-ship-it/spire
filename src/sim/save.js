// src/sim/save.js
//
// Saving and loading the game in the browser's localStorage.
//
// The save has a `version` number. If we ever change what a save contains,
// we bump config.save.version and add a step in `migrate` below so older
// saves keep working instead of breaking. Anything unreadable is ignored
// (we never crash because of a bad save).

import { serializeTower, restoreTower } from './tower.js';

export function saveGame(game, config) {
  try {
    const data = {
      version: config.save.version,
      savedAt: Date.now(),
      tower: serializeTower(game.tower),
      clockMinutes: game.clock.minutes,
      economy: { ...game.economy },
      speed: game.speed,
    };
    localStorage.setItem(config.save.key, JSON.stringify(data));
    return true;
  } catch {
    return false; // storage full, or blocked (e.g. private browsing)
  }
}

export function hasSave(config) {
  try {
    return localStorage.getItem(config.save.key) !== null;
  } catch {
    return false;
  }
}

// Reads the save and applies it onto `game`. Returns true on success.
export function loadGame(game, config) {
  try {
    const raw = localStorage.getItem(config.save.key);
    if (!raw) return false;
    const data = migrate(JSON.parse(raw), config);
    if (!data) return false;

    game.tower = restoreTower(config, data.tower);
    game.clock.minutes = data.clockMinutes;
    game.economy = { upkeepThisQuarter: 0, debtDays: 0, ...data.economy };
    game.speed = data.speed ?? config.time.defaultSpeed;
    game.blocked = false;
    game.events = [];
    return true;
  } catch {
    return false;
  }
}

// Upgrades an older save to the current format. Version 1 is the first
// format, so there is nothing to upgrade yet.
function migrate(data, config) {
  if (!data || data.version !== config.save.version) return null;
  return data;
}
