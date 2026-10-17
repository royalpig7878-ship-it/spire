// src/sim/save.js
//
// Saving and loading the game in the browser's localStorage.
//
// The save has a `version` number. If we ever change what a save contains,
// we bump config.save.version and add a step in `migrate` below so older
// saves keep working instead of breaking. Anything unreadable is ignored
// (we never crash because of a bad save).
//
// Version history:
//   1 - tower, clock, economy, speed
//   2 - adds tenants (people restart "away" and walk in again on load)
//   3 - adds sky districts (in the tower) and building services (trash levels)
//   4 - adds the rating tier (in the tower), progress, incidents and weather
//   5 - adds the game mode (sandbox settings, or the career scenario)

import { serializeTower, restoreTower } from './tower.js';
import { createElevatorSystem } from './elevators.js';
import { createEconomy } from './economy.js';
import { serializeTenants, restoreTenants } from './tenants.js';
import { createServices } from './services.js';
import { createWeather } from './weather.js';
import { createIncidents } from './incidents.js';
import { createProgress } from './progress.js';
import { newMode } from './modes.js';

export function saveGame(game, config) {
  try {
    const data = {
      version: config.save.version,
      savedAt: Date.now(),
      tower: serializeTower(game.tower),
      clockMinutes: game.clock.minutes,
      economy: { ...game.economy },
      tenants: serializeTenants(game.tenants),
      services: { trash: { ...game.services.trash } },
      weather: { ...game.weather },
      progress: {
        cooldownUntil: game.progress.cooldownUntil,
        won: game.progress.won,
        wonAt: game.progress.wonAt,
      },
      incidents: {
        fires: { ...game.incidents.fires },
        pests: { ...game.incidents.pests },
        outage: game.incidents.outage,
        lastEventDay: game.incidents.lastEventDay,
      },
      mode: JSON.parse(JSON.stringify(game.mode)),
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
    game.economy = { ...createEconomy(), ...data.economy };
    game.tenants = restoreTenants(game, config, data.tenants);
    game.services = { ...createServices(), trash: { ...(data.services?.trash ?? {}) } };
    game.weather = { ...createWeather(), ...(data.weather ?? {}) };
    game.progress = { ...createProgress(), ...(data.progress ?? {}), inspection: null }; // an inspector in mid-visit is rescheduled by the next qualifying day
    game.incidents = { ...createIncidents(), ...(data.incidents ?? {}), extortion: null };
    game.mode = data.mode ?? newMode('sandbox');
    game.alerts = [];
    game.speed = data.speed ?? config.time.defaultSpeed;
    game.elevators = createElevatorSystem(); // cars restart at their home floors
    game.blocked = false;
    game.events = [];
    return true;
  } catch {
    return false;
  }
}

// Upgrades an older save to the current format.
function migrate(data, config) {
  if (!data || typeof data.version !== 'number' || data.version > config.save.version) return null;
  if (data.version === 1) {
    data.tenants = { list: [], stats: {} }; // v1 had no people
    data.version = 2;
  }
  if (data.version === 2) {
    data.services = { trash: {} }; // v2 had no districts or services (both default to empty)
    data.version = 3;
  }
  if (data.version === 3) {
    data.version = 4; // v3 had no tier, progress, incidents or weather: all start fresh
  }
  if (data.version === 4) {
    data.mode = null; // v4 saves were free play: they load as a normal sandbox
    data.version = 5;
  }
  return data.version === config.save.version ? data : null;
}
