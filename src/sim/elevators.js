// src/sim/elevators.js
//
// Elevator shafts, cars, doors, hall calls and the riders that use them.
// Pure simulation: nothing here draws anything (see src/render/elevators.js).
//
// ===================== HOW DISPATCH WORKS =====================
// This is "collective control", the way real elevators work:
//
// 1. CALLS. A rider waiting at a floor presses a hall call button, UP or
//    DOWN. Inside a car, riders press car calls for their destination. A hall
//    call exists exactly while somebody who wants that direction is waiting
//    there (we derive calls from the waiting lines, so they can never go stale).
//
// 2. ASSIGNMENT. Each hall call is given to ONE car: the one with the lowest
//    "arrival cost", an estimate of how many floors of delay it would take:
//      - an idle car costs its distance to the call;
//      - a car already heading that way (and the call is on its route, in its
//        direction) costs its distance, plus a small penalty per stop on the way;
//      - a car heading away, or the wrong way, must finish its run first and
//        come back: distance to its farthest stop, plus the trip back;
//      - nearly full cars cost extra (they may not have room);
//      - BUNCHING PREVENTION: if another car is already serving a call near
//        this floor in the same direction, the cost goes up, so cars spread
//        out instead of travelling nose to tail.
//    A call only moves to a different car if that car is clearly better
//    (hysteresis), so assignments don't flicker back and forth.
//
// 3. DIRECTION COMMIT. A moving car keeps its direction until nothing is left
//    ahead of it. It stops for: car calls on the way, hall calls assigned to
//    it that want its direction, and the farthest call ahead (whatever its
//    direction, since that is where it turns around). Hall calls in the
//    opposite direction wait for the return trip. Then it reverses or idles.
//
// 4. IDLE. Idle cars wait with doors closed, then drift back to a "home"
//    floor (homes are spread along the shaft when there are several cars).
// ===============================================================

import { effectiveStops } from './shafts.js';
import { shaftCars } from './tower.js';

const EPS = 1e-6;
const callKey = (floor, dir) => `${floor}:${dir}`;

export function createElevatorSystem() {
  return {
    shafts: new Map(), // facility id -> shaft state
    nextRiderId: 1,
    demoTimer: 0,
  };
}

// ---------- Shaft bookkeeping ----------

function makeCar(id, home) {
  return {
    id,
    home,
    pos: home, // floor position; 3.5 = halfway between floors 3 and 4
    prevPos: home, // last tick's position, for smooth drawing
    dir: 0, // -1 down, 0 none, +1 up
    serveDir: 0, // direction of the riders it is picking up right now
    state: 'idle', // idle | moving | parking | opening | open | closing
    door: 0, // 0 closed .. 1 fully open
    dwell: 0, // seconds left before the doors start closing
    exTimer: 0, // countdown until the next person can step on/off
    idleTime: 0,
    riders: [],
    carCalls: new Set(), // destination floors pressed inside the car
  };
}

// Spread the cars' "home" floors along the shaft's stops: the first car waits
// at the bottom, the last near the top, so there is always one nearby.
function assignHomes(shaft) {
  const stops = shaft.stopList;
  const n = shaft.cars.length;
  shaft.cars.forEach((car, i) => {
    car.home = n === 1 ? stops[0] : stops[Math.round(((stops.length - 1) * i) / (n - 1))];
  });
}

function makeShaft(facility, config, stops) {
  const def = config.facilities[facility.type];
  const shaft = {
    id: facility.id,
    facility,
    bottom: facility.floor,
    top: facility.floor + facility.height - 1,
    stopList: stops, // floors this shaft stops at, sorted
    stops: new Set(stops),
    speedMult: def.carSpeedMult ?? 1, // express cars are faster...
    capacity: config.elevators.car.capacity + (def.carCapacityBonus ?? 0), // ...and bigger
    cars: [],
    calls: new Map(), // "floor:dir" -> { floor, dir, car }
    waiting: new Map(), // floor -> [riders in line order]
    reassignTimer: 0,
    stats: { completed: 0, totalWait: 0, maxWait: 0 },
    stopWait: new Map(), // floor -> recent average wait (seconds), for the wait overlay
    configKey: '',
  };
  return shaft;
}

// Brings a shaft in line with its facility's current settings (stops and
// number of cars) WITHOUT rebuilding it, so cars and riders carry on.
function reconfigureShaft(game, config, shaft, facility) {
  const stops = effectiveStops(game.tower, config, facility);
  const key = stops.join(',');
  if (key !== shaft.stopList.join(',') || !shaft.configKey) {
    shaft.stopList = stops;
    shaft.stops = new Set(stops);
    // Anyone waiting for a floor that no longer stops must plan again.
    for (const queue of shaft.waiting.values()) {
      for (const r of queue.slice()) {
        if (!shaft.stops.has(r.from) || !shaft.stops.has(r.to)) cancelRider(game, r);
      }
    }
    for (const floor of Array.from(shaft.stopWait.keys())) {
      if (!shaft.stops.has(floor)) shaft.stopWait.delete(floor);
    }
  }
  const wanted = shaftCars(config, facility);
  while (shaft.cars.length < wanted) {
    shaft.cars.push(makeCar(shaft.cars.length, shaft.stopList[0]));
  }
  // Remove surplus cars only when they are empty and parked, so nobody vanishes.
  while (shaft.cars.length > wanted) {
    const last = shaft.cars[shaft.cars.length - 1];
    if (last.riders.length || last.state !== 'idle') break;
    shaft.cars.pop();
  }
  assignHomes(shaft);
  shaft.configKey = `${game.tower.version}:${wanted}`;
}

function syncShafts(game, config) {
  const shafts = game.elevators.shafts;
  const seen = new Set();
  for (const f of game.tower.facilities.values()) {
    if (config.facilities[f.type].transport !== 'elevator') continue;
    seen.add(f.id);
    let shaft = shafts.get(f.id);
    if (!shaft || shaft.bottom !== f.floor || shaft.top !== f.floor + f.height - 1) {
      shaft = makeShaft(f, config, effectiveStops(game.tower, config, f));
      shafts.set(f.id, shaft);
    }
    shaft.facility = f;
    // Only redo the settings work when the tower or the car count changed
    // (or a car is still waiting to be removed).
    if (shaft.configKey !== `${game.tower.version}:${shaftCars(config, f)}` || shaft.cars.length !== shaftCars(config, f)) {
      reconfigureShaft(game, config, shaft, f);
    }
  }
  for (const id of shafts.keys()) if (!seen.has(id)) shafts.delete(id); // demolished
}

// ---------- Riders ----------

// A rider appears at floor `from` and wants to go to floor `to`.
// (Tenants in M4 call this too.) Returns the rider, or null if no shaft
// serves both floors or the line is full.
// `opts.shaftId` forces a particular shaft (tenants follow their planned
// route); `opts.tenant` links the rider to the person riding.
export function requestRide(game, config, from, to, opts = {}) {
  if (from === to) return null;
  syncShafts(game, config); // a shaft built a moment ago may not be registered yet
  let best = null;
  for (const shaft of game.elevators.shafts.values()) {
    if (opts.shaftId !== undefined && shaft.id !== opts.shaftId) continue;
    if (!shaft.stops.has(from) || !shaft.stops.has(to)) continue; // this shaft has no door there
    const length = (shaft.waiting.get(from) ?? []).length;
    if (length >= config.elevators.maxQueuePerFloor) continue;
    if (!best || length < best.length) best = { shaft, length };
  }
  if (!best) return null;
  const rider = {
    id: game.elevators.nextRiderId++,
    from,
    to,
    dir: Math.sign(to - from),
    waited: 0, // seconds spent in line
    rideTime: 0,
    state: 'waiting', // waiting | riding | done | cancelled
    tenant: opts.tenant ?? null,
    shaftId: best.shaft.id,
  };
  const queue = best.shaft.waiting.get(from) ?? [];
  queue.push(rider);
  best.shaft.waiting.set(from, queue);
  return rider;
}

// Remove a rider from wherever they are (line or car), e.g. when a tenant
// moves out or the shaft is demolished.
export function cancelRider(game, rider) {
  if (rider.state === 'done' || rider.state === 'cancelled') return;
  const shaft = game.elevators.shafts.get(rider.shaftId);
  rider.state = 'cancelled';
  if (!shaft) return;
  const queue = shaft.waiting.get(rider.from);
  if (queue) {
    const i = queue.indexOf(rider);
    if (i >= 0) queue.splice(i, 1);
  }
  for (const car of shaft.cars) {
    const i = car.riders.indexOf(rider);
    if (i >= 0) car.riders.splice(i, 1);
  }
}

// How many people are in line at a stop (used by tenants to pick a route).
export function queueLength(game, shaftId, floor) {
  const shaft = game.elevators.shafts.get(shaftId);
  return shaft ? (shaft.waiting.get(floor) ?? []).length : 0;
}

function spawnDemoRider(game, config) {
  const shafts = Array.from(game.elevators.shafts.values());
  if (!shafts.length) return;
  const shaft = shafts[Math.floor(Math.random() * shafts.length)];
  const stops = shaft.stopList;
  if (stops.length < 2) return;
  const pick = () => stops[Math.floor(Math.random() * stops.length)];
  const above = () => stops[1 + Math.floor(Math.random() * (stops.length - 1))];
  const roll = Math.random();
  // Like a real building: most trips start or end at the bottom (the lobby).
  if (roll < 0.5) requestRide(game, config, stops[0], above());
  else if (roll < 0.8) requestRide(game, config, above(), stops[0]);
  else requestRide(game, config, pick(), pick());
}

// ---------- Main update ----------

export function updateElevators(game, config, dt) {
  const sys = game.elevators;
  syncShafts(game, config);

  if (game.demoTraffic && sys.shafts.size) {
    sys.demoTimer -= dt;
    if (sys.demoTimer <= 0) {
      sys.demoTimer = config.elevators.demoSpawnEverySec * (0.6 + Math.random() * 0.8);
      spawnDemoRider(game, config);
    }
  }

  for (const shaft of sys.shafts.values()) updateShaft(shaft, config, dt);
}

function updateShaft(shaft, config, dt) {
  const ec = config.elevators;

  // Waiting and riding people get older.
  for (const queue of shaft.waiting.values()) for (const r of queue) r.waited += dt;
  for (const car of shaft.cars) for (const r of car.riders) r.rideTime += dt;
  // Recent average wait per stop fades away when nobody is waiting (overlay data).
  for (const [floor, avg] of shaft.stopWait) shaft.stopWait.set(floor, avg * (1 - Math.min(1, 0.05 * dt)));

  refreshCalls(shaft);
  shaft.reassignTimer -= dt;
  if (shaft.reassignTimer <= 0) {
    assignCalls(shaft, ec);
    shaft.reassignTimer = ec.dispatch.reassignEverySec;
  }
  for (const car of shaft.cars) updateCar(shaft, car, dt, ec);
}

// Hall calls mirror the waiting lines: one per (floor, direction) with people.
function refreshCalls(shaft) {
  for (const [k, call] of shaft.calls) {
    const queue = shaft.waiting.get(call.floor);
    if (!queue || !queue.some((r) => r.dir === call.dir)) shaft.calls.delete(k);
  }
  for (const [floor, queue] of shaft.waiting) {
    for (const dir of [1, -1]) {
      if (!queue.some((r) => r.dir === dir)) continue;
      const k = callKey(floor, dir);
      if (!shaft.calls.has(k)) {
        shaft.calls.set(k, { floor, dir, car: null });
        shaft.reassignTimer = 0; // assign new calls right away
      }
    }
  }
}

// ---------- Dispatch ----------

// Floors this car is committed to visiting: its car calls + calls assigned to
// it. A FULL car ignores hall calls (it has no room), like a real elevator
// that sails past a crowded floor; those calls wait until it has space.
function carTargets(shaft, car, ec) {
  const targets = new Set(car.carCalls);
  if (car.riders.length >= shaft.capacity) return targets;
  for (const call of shaft.calls.values()) if (call.car === car.id) targets.add(call.floor);
  return targets;
}

// Estimated delay (in floors) before `car` could serve `call`. See the
// big comment at the top of this file.
function arrivalCost(shaft, car, call, ec) {
  const dc = ec.dispatch;
  const targets = Array.from(carTargets(shaft, car, ec));
  const dist = call.floor - car.pos;
  let cost;

  if (targets.length === 0) {
    cost = Math.abs(dist); // idle car: straight to it
  } else {
    let dir = car.dir;
    if (dir === 0) {
      const nearest = targets.reduce((a, b) => (Math.abs(b - car.pos) < Math.abs(a - car.pos) ? b : a));
      dir = Math.sign(nearest - car.pos) || 1;
    }
    const ahead = targets.filter((f) => (f - car.pos) * dir > -EPS);
    const farthest = ahead.length ? (dir > 0 ? Math.max(...ahead) : Math.min(...ahead)) : car.pos;
    const stopsBetween = (a, b) =>
      targets.filter((f) => f !== call.floor && f > Math.min(a, b) - EPS && f < Math.max(a, b) + EPS).length;

    if (dist * dir >= -EPS) {
      // The call is on the way.
      const sameWay = call.dir === dir || (dir > 0 ? call.floor >= farthest : call.floor <= farthest);
      cost = sameWay
        ? Math.abs(dist)
        : Math.abs(farthest - car.pos) + Math.abs(farthest - call.floor);
      cost += stopsBetween(car.pos, call.floor) * dc.stopPenaltyFloors;
    } else {
      // Behind the car: finish the current run, then come back.
      cost = Math.abs(farthest - car.pos) + Math.abs(farthest - call.floor);
      cost += targets.length * dc.stopPenaltyFloors;
    }
  }

  // Nearly full cars are a worse choice.
  cost += (car.riders.length / shaft.capacity) ** 2 * dc.loadPenaltyFloors;

  // Bunching prevention: another car already busy right here, same direction.
  for (const other of shaft.cars) {
    if (other === car) continue;
    for (const c2 of shaft.calls.values()) {
      if (c2.car === other.id && c2.dir === call.dir && Math.abs(c2.floor - call.floor) < dc.bunchDistanceFloors) {
        cost += dc.bunchPenaltyFloors;
        break;
      }
    }
  }
  return cost;
}

function assignCalls(shaft, ec) {
  for (const call of shaft.calls.values()) {
    let best = null;
    let bestCost = Infinity;
    let currentCost = Infinity;
    for (const car of shaft.cars) {
      const c = arrivalCost(shaft, car, call, ec);
      if (car.id === call.car) currentCost = c;
      if (c < bestCost) {
        best = car;
        bestCost = c;
      }
    }
    // Hysteresis: only switch cars when the new one is clearly better.
    if (call.car === null || bestCost + ec.dispatch.hysteresisFloors < currentCost) call.car = best.id;
  }
}

// ---------- Car state machine ----------

function updateCar(shaft, car, dt, ec) {
  car.prevPos = car.pos;
  switch (car.state) {
    case 'idle':
      return idleStep(shaft, car, dt, ec);
    case 'parking':
      return parkingStep(shaft, car, dt, ec);
    case 'moving':
      return movingStep(shaft, car, dt, ec);
    case 'opening':
      car.door += dt / ec.car.doorSeconds;
      if (car.door >= 1) {
        car.door = 1;
        car.state = 'open';
        car.dwell = ec.car.dwellSeconds;
        car.exTimer = 0.05;
      }
      return undefined;
    case 'open':
      return openStep(shaft, car, dt, ec);
    case 'closing':
      return closingStep(shaft, car, dt, ec);
    default:
      return undefined;
  }
}

function idleStep(shaft, car, dt, ec) {
  const targets = Array.from(carTargets(shaft, car, ec));
  if (targets.length === 0) {
    car.dir = 0;
    car.idleTime += dt;
    if (car.idleTime >= ec.car.idleParkSeconds && Math.abs(car.pos - car.home) > 0.01) {
      car.state = 'parking';
    }
    return;
  }
  car.idleTime = 0;
  // Keep going the way we were headed if anything is still ahead.
  const ahead = car.dir !== 0 ? targets.filter((f) => (f - car.pos) * car.dir > EPS) : [];
  const pool = ahead.length ? ahead : targets;
  const nearest = pool.reduce((a, b) => (Math.abs(b - car.pos) < Math.abs(a - car.pos) ? b : a));
  if (Math.abs(nearest - car.pos) < EPS) {
    arrive(shaft, car, nearest, ec);
    return;
  }
  car.dir = Math.sign(nearest - car.pos);
  car.state = 'moving';
}

function parkingStep(shaft, car, dt, ec) {
  if (carTargets(shaft, car, ec).size > 0) {
    car.state = 'idle';
    return;
  }
  const dist = car.home - car.pos;
  const step = ec.car.speedFloorsPerSec * shaft.speedMult * 0.6 * dt; // park gently
  if (Math.abs(dist) <= step) {
    car.pos = car.home;
    car.dir = 0;
    car.state = 'idle';
    car.idleTime = 0;
  } else {
    car.dir = Math.sign(dist);
    car.pos += car.dir * step;
  }
}

// The next floor this car should stop at, or null. May reverse the car's
// direction when nothing it can serve is left ahead.
function nextStop(shaft, car, ec) {
  const targets = Array.from(carTargets(shaft, car, ec));
  for (let attempt = 0; attempt < 2; attempt++) {
    const d = car.dir;
    const ahead = targets.filter((f) => (f - car.pos) * d > -EPS);
    if (ahead.length) {
      const farthest = d > 0 ? Math.max(...ahead) : Math.min(...ahead);
      const servable = ahead.filter(
        (f) =>
          car.carCalls.has(f) ||
          f === farthest || // the turnaround stop takes any call
          hasAssignedCall(shaft, car, f, d),
      );
      return servable.reduce((a, b) => (Math.abs(b - car.pos) < Math.abs(a - car.pos) ? b : a));
    }
    car.dir = -d; // nothing ahead: look the other way
  }
  return null;
}

function hasAssignedCall(shaft, car, floor, dir) {
  const call = shaft.calls.get(callKey(floor, dir));
  return Boolean(call && call.car === car.id);
}

function movingStep(shaft, car, dt, ec) {
  const stop = nextStop(shaft, car, ec);
  if (stop === null) {
    car.state = 'idle';
    car.dir = 0;
    return;
  }
  const dist = stop - car.pos;
  const step = ec.car.speedFloorsPerSec * shaft.speedMult * dt;
  if (Math.abs(dist) <= step) {
    arrive(shaft, car, stop, ec);
  } else {
    car.pos += Math.sign(dist) * step;
  }
}

// The car reaches floor F: decide who it will pick up and open the doors.
function arrive(shaft, car, F, ec) {
  car.pos = F;
  car.carCalls.delete(F);

  const up = shaft.calls.get(callKey(F, 1));
  const down = shaft.calls.get(callKey(F, -1));
  const moreAhead =
    car.dir !== 0 && Array.from(carTargets(shaft, car, ec)).some((f) => f !== F && (f - F) * car.dir > EPS);

  let serve = 0;
  if (car.dir > 0 && up) serve = 1;
  else if (car.dir < 0 && down) serve = -1;
  else if (!moreAhead) {
    // Turnaround (or an idle car arriving): take whichever call is waiting,
    // the one whose first person has waited longest.
    const longest = (dir) => (shaft.waiting.get(F) ?? []).find((r) => r.dir === dir)?.waited ?? -1;
    if (up && down) serve = longest(1) >= longest(-1) ? 1 : -1;
    else if (up) serve = 1;
    else if (down) serve = -1;
  } else {
    serve = car.dir; // opposite-direction calls wait for the return trip
  }
  if (serve !== 0) car.dir = serve;
  car.serveDir = serve;
  car.state = 'opening';
}

function openStep(shaft, car, dt, ec) {
  car.exTimer -= dt;
  if (car.exTimer > 0) return;
  const F = Math.round(car.pos);

  // 1. Let people off first.
  const leaving = car.riders.findIndex((r) => r.to === F);
  if (leaving >= 0) {
    const rider = car.riders.splice(leaving, 1)[0];
    rider.state = 'done';
    shaft.stats.completed += 1;
    car.exTimer = ec.car.exchangeSeconds;
    car.dwell = ec.car.dwellSeconds;
    return;
  }

  // 2. Then let people on (only those going the way this car is going).
  const queue = shaft.waiting.get(F);
  if (queue && queue.length && car.riders.length < shaft.capacity) {
    const idx = queue.findIndex((r) => car.serveDir === 0 || r.dir === car.serveDir);
    if (idx >= 0) {
      const rider = queue.splice(idx, 1)[0];
      if (car.serveDir === 0) {
        car.serveDir = rider.dir;
        car.dir = rider.dir;
      }
      rider.state = 'riding';
      rider.rideTime = 0;
      car.riders.push(rider);
      car.carCalls.add(rider.to);
      shaft.stats.totalWait += rider.waited;
      shaft.stats.maxWait = Math.max(shaft.stats.maxWait, rider.waited);
      const recent = shaft.stopWait.get(rider.from);
      shaft.stopWait.set(rider.from, recent === undefined ? rider.waited : recent * 0.6 + rider.waited * 0.4);
      car.exTimer = ec.car.exchangeSeconds;
      car.dwell = ec.car.dwellSeconds;
      return;
    }
  }

  // 3. Nobody left to move: wait out the dwell time, then close.
  car.dwell -= dt;
  if (car.dwell <= 0) car.state = 'closing';
}

function closingStep(shaft, car, dt, ec) {
  car.door -= dt / ec.car.doorSeconds;

  // Someone ran up while the doors were closing: open again.
  const F = Math.round(car.pos);
  const queue = shaft.waiting.get(F);
  if (
    car.door > 0 &&
    queue &&
    car.riders.length < shaft.capacity &&
    queue.some((r) => car.serveDir === 0 || r.dir === car.serveDir)
  ) {
    car.state = 'opening';
    return;
  }
  if (car.door <= 0) {
    car.door = 0;
    car.state = 'idle';
    car.idleTime = 0;
  }
}
