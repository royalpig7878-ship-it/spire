// src/sim/tower.js
//
// The tower's data and building rules. No drawing and no touch input here.
//
// Grid coordinates:
//   floor 0   = the lobby level, sitting on the street
//   floor 1.. = floors above; negative floors = basements
//   cell      = horizontal slot, can be negative (0 is the plot's center)
// A facility is stored by its bottom floor and leftmost cell. Most are one
// floor tall; stairs and elevators can span several (`height`).
//
// Two lookup tables make rules fast:
//   cells   "floor,cell" -> facility id   (what physically fills a cell)
//   overlay "0,cell"     -> facility id   (elevator doors standing INSIDE the
//                                          lobby on floor 0, on top of it)

import { computeReach, isFacilityConnected } from './connectivity.js';

const cellKey = (floor, cell) => `${floor},${cell}`;

export function createTower(config) {
  const tower = {
    funds: config.economy.startFunds,
    facilities: new Map(), // id -> facility
    cells: new Map(),
    overlay: new Map(),
    nextId: 1,
    version: 0, // bumps on every change; lets cached results know when to refresh
  };
  addFacility(tower, config, 'lobby', 0, config.lobby.startCell, {
    width: config.lobby.startWidthCells,
    locked: true,
  });
  return tower;
}

// ---- Low-level add / remove (keep both lookup tables in step) ----

function usesOverlay(config, type, floor) {
  return floor === 0 && Boolean(config.facilities[type].transport);
}

function indexFacility(tower, config, f) {
  for (let fl = f.floor; fl < f.floor + f.height; fl++) {
    const table = usesOverlay(config, f.type, fl) ? tower.overlay : tower.cells;
    for (let c = f.cell; c < f.cell + f.width; c++) table.set(cellKey(fl, c), f.id);
  }
}

function unindexFacility(tower, config, f) {
  for (let fl = f.floor; fl < f.floor + f.height; fl++) {
    const table = usesOverlay(config, f.type, fl) ? tower.overlay : tower.cells;
    for (let c = f.cell; c < f.cell + f.width; c++) table.delete(cellKey(fl, c));
  }
}

function addFacility(tower, config, type, floor, cell, extra = {}) {
  const facility = {
    id: extra.id ?? tower.nextId++,
    type,
    floor,
    cell,
    width: extra.width ?? config.facilities[type].width,
    height: extra.height ?? 1,
    locked: extra.locked ?? false, // locked = cannot be demolished
    builtMinute: extra.builtMinute ?? 0, // game-clock minute it was built (rent is prorated)
    occupied: extra.occupied ?? true, // M4 will drive this from real tenants
  };
  if (extra.cars !== undefined) facility.cars = extra.cars; // elevator cars (M5 settings)
  tower.facilities.set(facility.id, facility);
  tower.nextId = Math.max(tower.nextId, facility.id + 1);
  indexFacility(tower, config, facility);
  tower.version++;
  return facility;
}

function removeFacility(tower, config, facility) {
  tower.facilities.delete(facility.id);
  unindexFacility(tower, config, facility);
  tower.version++;
}

// ---- Saving ----

// Plain-data copy of the tower for saving.
export function serializeTower(tower) {
  return {
    funds: tower.funds,
    nextId: tower.nextId,
    facilities: Array.from(tower.facilities.values()).map((f) => ({ ...f })),
  };
}

// Rebuilds a tower from saved data (the inverse of serializeTower).
// Older saves have no `height`; addFacility defaults it to 1.
export function restoreTower(config, data) {
  const tower = {
    funds: data.funds,
    facilities: new Map(),
    cells: new Map(),
    overlay: new Map(),
    nextId: data.nextId,
    version: 0,
  };
  for (const f of data.facilities) {
    addFacility(tower, config, f.type, f.floor, f.cell, f);
  }
  return tower;
}

// ---- Lookups ----

export function facilityAt(tower, floor, cell) {
  const key = cellKey(floor, cell);
  const id = tower.overlay.get(key) ?? tower.cells.get(key);
  return id === undefined ? null : tower.facilities.get(id);
}

function isOccupied(tower, floor, cell) {
  return tower.cells.has(cellKey(floor, cell));
}

// Cached "who can reach the lobby" answer; recomputed only after changes.
export function getReach(tower, config) {
  if (!tower._reach || tower._reach.version !== tower.version) {
    tower._reach = { version: tower.version, value: computeReach(tower, config) };
  }
  return tower._reach.value;
}

export function isConnected(tower, config, facility) {
  return isFacilityConnected(getReach(tower, config), facility);
}

export function buildCost(config, facility) {
  return config.facilities[facility.type].cost * facility.height;
}

export function tallestFloor(tower) {
  let top = 0;
  for (const f of tower.facilities.values()) top = Math.max(top, f.floor + f.height - 1);
  return top;
}

// ---- Placement rules ----

// A facility on floor 1 or higher must sit fully on top of occupied cells.
// Floor 0 sits on the ground and is always supported.
function isSupported(tower, floor, cell, width) {
  if (floor <= 0) return true;
  for (let c = cell; c < cell + width; c++) {
    if (!isOccupied(tower, floor - 1, c)) return false;
  }
  return true;
}

// Every checked rule returns { ok, reason }. The reason is shown to the
// player, so it is written in plain language.
export function canPlace(tower, config, typeId, floor, cell, height = 1) {
  const def = config.facilities[typeId];
  const width = def.width;
  const top = floor + height - 1;
  const maxFloor = def.maxFloor ?? config.plot.maxFloor;
  const isTransport = Boolean(def.transport);

  if (height > 1 && !def.vertical) return { ok: false, reason: 'Only one floor tall' };
  if (floor < def.minFloor || top > maxFloor) {
    return { ok: false, reason: 'Cannot be built on this floor' };
  }
  const half = config.plot.halfWidthCells;
  if (cell < -half || cell + width > half) {
    return { ok: false, reason: 'Outside your plot' };
  }
  for (let fl = floor; fl <= top; fl++) {
    for (let c = cell; c < cell + width; c++) {
      if (usesOverlay(config, typeId, fl)) {
        // Elevator doors on the lobby floor must stand inside the lobby.
        if (!isOccupied(tower, 0, c)) return { ok: false, reason: 'Must stand in the lobby' };
        if (tower.overlay.has(cellKey(0, c))) return { ok: false, reason: 'Space is taken' };
      } else if (isOccupied(tower, fl, c)) {
        return { ok: false, reason: 'Space is taken' };
      }
    }
  }
  if (!isSupported(tower, floor, cell, width)) {
    return { ok: false, reason: 'Needs floor space below' };
  }
  if (typeId === 'lobby') {
    // Lobby wings must touch the existing lobby so it stays one hall.
    const touches = isOccupied(tower, 0, cell - 1) || isOccupied(tower, 0, cell + width);
    if (!touches) return { ok: false, reason: 'Must touch the lobby' };
  }

  // Must be reachable from the lobby: try it, ask the connectivity check,
  // then take it away again (restoring the version so caches stay valid).
  const versionBefore = tower.version;
  const trial = addFacility(tower, config, typeId, floor, cell, { id: -1, height });
  const connected = isFacilityConnected(computeReach(tower, config), trial);
  removeFacility(tower, config, trial);
  tower.version = versionBefore;
  if (!connected) {
    return {
      ok: false,
      reason: isTransport ? 'Must connect to the lobby' : 'No stairs or elevator reaches here',
    };
  }

  if (tower.funds < def.cost * height) return { ok: false, reason: 'Not enough funds' };
  return { ok: true, reason: '' };
}

export function place(tower, config, typeId, floor, cell, nowMinute = 0, height = 1) {
  const check = canPlace(tower, config, typeId, floor, cell, height);
  if (!check.ok) return check;
  tower.funds -= config.facilities[typeId].cost * height;
  addFacility(tower, config, typeId, floor, cell, { builtMinute: nowMinute, height });
  return check;
}

// ---- Demolishing ----

// Demolishing must not leave anything floating in mid-air, strand floors
// that need its stairs/elevator, or cut the lobby in two. We test by
// removing it, checking, and putting it back.
export function canDemolish(tower, config, facility) {
  if (facility.locked) return { ok: false, reason: 'The main lobby stays' };

  const reachBefore = getReach(tower, config);
  const connectedBefore = new Set();
  for (const f of tower.facilities.values()) {
    if (isFacilityConnected(reachBefore, f)) connectedBefore.add(f.id);
  }

  const versionBefore = tower.version;
  removeFacility(tower, config, facility);
  let reason = '';
  for (const other of tower.facilities.values()) {
    if (!isSupported(tower, other.floor, other.cell, other.width)) {
      reason = 'Floors above depend on it';
      break;
    }
  }
  if (!reason) {
    // Elevator doors standing in the lobby need the lobby floor under them.
    for (const key of tower.overlay.keys()) {
      if (!tower.cells.has(key)) {
        reason = 'An elevator stands here';
        break;
      }
    }
  }
  if (!reason && facility.type === 'lobby' && !isLobbyContiguous(tower)) {
    reason = 'It would split the lobby';
  }
  if (!reason) {
    const reachAfter = computeReach(tower, config);
    for (const other of tower.facilities.values()) {
      if (connectedBefore.has(other.id) && !isFacilityConnected(reachAfter, other)) {
        reason = 'Other floors need it to reach the lobby';
        break;
      }
    }
  }

  // Put it back exactly as it was (same id).
  tower.facilities.set(facility.id, facility);
  indexFacility(tower, config, facility);
  tower.version = versionBefore;
  return reason ? { ok: false, reason } : { ok: true, reason: '' };
}

function isLobbyContiguous(tower) {
  const cells = [];
  for (const f of tower.facilities.values()) {
    if (f.type !== 'lobby') continue;
    for (let c = f.cell; c < f.cell + f.width; c++) cells.push(c);
  }
  cells.sort((a, b) => a - b);
  for (let i = 1; i < cells.length; i++) {
    if (cells[i] !== cells[i - 1] + 1) return false;
  }
  return true;
}

export function refundFor(config, facility, ratio = config.economy.demolishRefundRatio) {
  return Math.round(buildCost(config, facility) * ratio);
}

// `ratio` lets the fire sale pay a different fraction than a normal demolish.
export function demolish(tower, config, facility, ratio = config.economy.demolishRefundRatio) {
  const check = canDemolish(tower, config, facility);
  if (!check.ok) return check;
  const refund = refundFor(config, facility, ratio);
  removeFacility(tower, config, facility);
  tower.funds += refund;
  return { ok: true, reason: '', refund };
}
