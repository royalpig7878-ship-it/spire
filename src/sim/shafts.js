// src/sim/shafts.js
//
// Which floors does an elevator shaft actually stop at?
//
//   Local shaft   ('stopMode: all')  stops at every floor it spans, except
//                 floors the player switched off in its settings.
//   Express shaft ('stopMode: hubs') stops only at its bottom floor and at
//                 floors where it passes through, or touches, a "hall" (the
//                 lobby or a sky lobby). Halls are what make a floor a place
//                 people can change elevators.
//
// The bottom floor is always a stop, and a local shaft's top floor too.
// Pure functions of the tower's data (no drawing, no timing).

export function hallAt(tower, config, floor, cell) {
  const id = tower.cells.get(`${floor},${cell}`);
  if (id === undefined) return false;
  const facility = tower.facilities.get(id);
  return Boolean(facility && config.facilities[facility.type].hall);
}

// Is `floor` a place this shaft is allowed to stop? (Used for the settings screen.)
export function isEligibleStop(tower, config, shaft, floor) {
  const def = config.facilities[shaft.type];
  if (def.stopMode === 'none') return false;
  if (def.stopMode !== 'hubs') return true;
  for (let c = shaft.cell - 1; c <= shaft.cell + shaft.width; c++) {
    if (hallAt(tower, config, floor, c)) return true;
  }
  return false;
}

// Sorted list of the floors this shaft stops at right now.
export function effectiveStops(tower, config, shaft) {
  const def = config.facilities[shaft.type];
  if (def.stopMode === 'none') return []; // service shafts have no doors for tenants
  const top = shaft.floor + shaft.height - 1;
  const skipped = new Set(shaft.skip ?? []);
  const stops = [];
  for (let fl = shaft.floor; fl <= top; fl++) {
    const forced = fl === shaft.floor || (def.stopMode !== 'hubs' && fl === top);
    if (forced || (isEligibleStop(tower, config, shaft, fl) && !skipped.has(fl))) stops.push(fl);
  }
  return stops;
}
