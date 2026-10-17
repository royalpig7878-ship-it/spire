// src/sim/connectivity.js
//
// Answers one question: "can people get from the lobby to here?"
//
// Idea: on each floor, a "run" is a row of touching occupied cells (people
// can walk along it). Stairs and elevators join runs on different floors
// together. Starting from the run that holds the main lobby, everything we
// can reach by walking and riding is "connected".
//
//   stairs   (on floors b..t) join floor b-1 to b, b to b+1, ... up to t
//   elevator (on floors b..t) joins every floor it stops at
//
// Pure calculation on the tower's data: nothing here draws or moves anything.

import { effectiveStops } from './shafts.js';

export function computeReach(tower, config) {
  // 1. Which cells are walkable on each floor? An elevator shaft is a wall on
  // floors where it has no door (it does not stop there), so people cannot
  // walk through it.
  const cellsByFloor = new Map(); // floor -> Set(cell)
  const stopsOf = new Map(); // shaft id -> its stop floors
  for (const f of tower.facilities.values()) {
    const isElevator = config.facilities[f.type].transport === 'elevator';
    let stops = null;
    if (isElevator) {
      stops = effectiveStops(tower, config, f);
      stopsOf.set(f.id, stops);
    }
    for (let fl = f.floor; fl < f.floor + f.height; fl++) {
      if (stops && !stops.includes(fl)) continue;
      let set = cellsByFloor.get(fl);
      if (!set) cellsByFloor.set(fl, (set = new Set()));
      for (let c = f.cell; c < f.cell + f.width; c++) set.add(c);
    }
  }

  // 2. Split each floor into runs of touching cells; give each run an id.
  const runOf = new Map(); // "floor,cell" -> run id
  let runCount = 0;
  for (const [fl, set] of cellsByFloor) {
    const sorted = Array.from(set).sort((a, b) => a - b);
    let prev = null;
    for (const c of sorted) {
      if (prev === null || c !== prev + 1) runCount++;
      runOf.set(`${fl},${c}`, runCount);
      prev = c;
    }
  }

  // 3. Union-find: merge runs that stairs / elevators join together.
  const parent = Array.from({ length: runCount + 1 }, (_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a, b) => {
    if (a === undefined || b === undefined) return;
    parent[find(a)] = find(b);
  };
  const run = (fl, c) => runOf.get(`${fl},${c}`);

  for (const f of tower.facilities.values()) {
    const kind = config.facilities[f.type].transport;
    if (kind === 'stairs') {
      for (let fl = f.floor; fl < f.floor + f.height; fl++) union(run(fl - 1, f.cell), run(fl, f.cell));
    } else if (kind === 'elevator') {
      const stops = stopsOf.get(f.id);
      for (const fl of stops) union(run(stops[0], f.cell), run(fl, f.cell));
    }
  }

  // 4. Everything in the same group as the main lobby is reachable.
  const lobbyRun = run(0, config.lobby.startCell);
  const root = lobbyRun === undefined ? -1 : find(lobbyRun);

  return {
    has(floor, cell) {
      const r = run(floor, cell);
      return r !== undefined && find(r) === root;
    },
    // Which walkable run a cell belongs to (undefined = nothing there).
    // Two cells with the same run id can be walked between along the floor.
    runAt: run,
  };
}

// True if any floor of the facility sits on a reachable run.
export function isFacilityConnected(reach, facility) {
  for (let fl = facility.floor; fl < facility.floor + facility.height; fl++) {
    if (reach.has(fl, facility.cell)) return true;
  }
  return false;
}
