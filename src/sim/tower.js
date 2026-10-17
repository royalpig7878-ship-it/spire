// src/sim/tower.js
//
// The tower's data and building rules. No drawing and no touch input here.
//
// Grid coordinates:
//   floor 0   = the lobby level, sitting on the street
//   floor 1.. = floors above; negative floors = basements
//   cell      = horizontal slot, can be negative (0 is the plot's center)
// A facility is stored by its leftmost cell and covers `width` cells.

const cellKey = (floor, cell) => `${floor},${cell}`;

export function createTower(config) {
  const tower = {
    funds: config.economy.startFunds,
    facilities: new Map(), // id -> facility
    cells: new Map(), // "floor,cell" -> facility id (fast overlap lookups)
    nextId: 1,
  };
  addFacility(tower, config, 'lobby', 0, config.lobby.startCell, {
    width: config.lobby.startWidthCells,
    locked: true,
  });
  return tower;
}

function addFacility(tower, config, type, floor, cell, extra = {}) {
  const width = extra.width ?? config.facilities[type].width;
  const facility = {
    id: extra.id ?? tower.nextId++,
    type,
    floor,
    cell,
    width,
    locked: extra.locked ?? false, // locked = cannot be demolished
    builtMinute: extra.builtMinute ?? 0, // game-clock minute it was built (rent is prorated)
    occupied: extra.occupied ?? true, // M4 will drive this from real tenants
  };
  tower.facilities.set(facility.id, facility);
  tower.nextId = Math.max(tower.nextId, facility.id + 1);
  for (let c = cell; c < cell + width; c++) {
    tower.cells.set(cellKey(floor, c), facility.id);
  }
  return facility;
}

// Plain-data copy of the tower for saving.
export function serializeTower(tower) {
  return {
    funds: tower.funds,
    nextId: tower.nextId,
    facilities: Array.from(tower.facilities.values()).map((f) => ({ ...f })),
  };
}

// Rebuilds a tower from saved data (the inverse of serializeTower).
export function restoreTower(config, data) {
  const tower = {
    funds: data.funds,
    facilities: new Map(),
    cells: new Map(),
    nextId: data.nextId,
  };
  for (const f of data.facilities) {
    addFacility(tower, config, f.type, f.floor, f.cell, f);
  }
  return tower;
}

function removeFacility(tower, facility) {
  tower.facilities.delete(facility.id);
  for (let c = facility.cell; c < facility.cell + facility.width; c++) {
    tower.cells.delete(cellKey(facility.floor, c));
  }
}

export function facilityAt(tower, floor, cell) {
  const id = tower.cells.get(cellKey(floor, cell));
  return id === undefined ? null : tower.facilities.get(id);
}

function isOccupied(tower, floor, cell) {
  return tower.cells.has(cellKey(floor, cell));
}

// A floor-1-or-higher facility must sit fully on top of occupied cells.
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
export function canPlace(tower, config, typeId, floor, cell) {
  const def = config.facilities[typeId];
  const width = def.width;
  const maxFloor = def.maxFloor ?? config.plot.maxFloor;

  if (floor < def.minFloor || floor > maxFloor) {
    return { ok: false, reason: 'Cannot be built on this floor' };
  }
  const half = config.plot.halfWidthCells;
  if (cell < -half || cell + width > half) {
    return { ok: false, reason: 'Outside your plot' };
  }
  for (let c = cell; c < cell + width; c++) {
    if (isOccupied(tower, floor, c)) return { ok: false, reason: 'Space is taken' };
  }
  if (!isSupported(tower, floor, cell, width)) {
    return { ok: false, reason: 'Needs floor space below' };
  }
  if (typeId === 'lobby') {
    // Lobby wings must touch the existing lobby so it stays one hall.
    const touches = isOccupied(tower, 0, cell - 1) || isOccupied(tower, 0, cell + width);
    if (!touches) return { ok: false, reason: 'Must touch the lobby' };
  }
  if (tower.funds < def.cost) return { ok: false, reason: 'Not enough funds' };
  return { ok: true, reason: '' };
}

export function place(tower, config, typeId, floor, cell, nowMinute = 0) {
  const check = canPlace(tower, config, typeId, floor, cell);
  if (!check.ok) return check;
  tower.funds -= config.facilities[typeId].cost;
  addFacility(tower, config, typeId, floor, cell, { builtMinute: nowMinute });
  return check;
}

// Demolishing must not leave anything floating in mid-air, and must not
// cut the lobby in two. We test by removing it, checking, and putting it back.
export function canDemolish(tower, config, facility) {
  if (facility.locked) return { ok: false, reason: 'The main lobby stays' };

  removeFacility(tower, facility);
  let reason = '';
  for (const other of tower.facilities.values()) {
    if (!isSupported(tower, other.floor, other.cell, other.width)) {
      reason = 'Floors above depend on it';
      break;
    }
  }
  if (!reason && facility.type === 'lobby' && !isLobbyContiguous(tower)) {
    reason = 'It would split the lobby';
  }
  // Put it back exactly as it was (same id).
  tower.facilities.set(facility.id, facility);
  for (let c = facility.cell; c < facility.cell + facility.width; c++) {
    tower.cells.set(cellKey(facility.floor, c), facility.id);
  }
  return reason ? { ok: false, reason } : { ok: true, reason: '' };
}

function isLobbyContiguous(tower) {
  const cells = [];
  for (const f of tower.facilities.values()) {
    if (f.floor !== 0) continue;
    for (let c = f.cell; c < f.cell + f.width; c++) cells.push(c);
  }
  cells.sort((a, b) => a - b);
  for (let i = 1; i < cells.length; i++) {
    if (cells[i] !== cells[i - 1] + 1) return false;
  }
  return true;
}

export function refundFor(config, facility, ratio = config.economy.demolishRefundRatio) {
  return Math.round(config.facilities[facility.type].cost * ratio);
}

// `ratio` lets the fire sale pay a different fraction than a normal demolish.
export function demolish(tower, config, facility, ratio = config.economy.demolishRefundRatio) {
  const check = canDemolish(tower, config, facility);
  if (!check.ok) return check;
  const refund = refundFor(config, facility, ratio);
  removeFacility(tower, facility);
  tower.funds += refund;
  return { ok: true, reason: '', refund };
}

export function tallestFloor(tower) {
  let top = 0;
  for (const f of tower.facilities.values()) top = Math.max(top, f.floor);
  return top;
}
