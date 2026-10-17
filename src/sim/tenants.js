// src/sim/tenants.js
//
// The people of the tower: who moves in, what their day looks like, how they
// travel (using the route planner and the elevators), how stressed they get,
// and when they give up and move out. Pure simulation: nothing here draws.
//
// A tenant's life in one picture (modes):
//
//   away  --(schedule says "be inside")-->  travel (enter)  -->  home
//   home  --(lunch / coffee window)------>  travel (visit)  -->  dwell at a cafe
//   dwell --(time is up)----------------->  travel (return) -->  home
//   home  --(schedule says "leave")------>  travel (leave)  -->  away
//
// "home" means in their own unit (a desk for workers, the flat for residents).
// Everyone follows a daily schedule shifted by their personality trait, so
// rush hours EMERGE from many tenants wanting to travel at the same time.
//
// Stress (0-100) goes up while waiting in elevator lines, in crowds, on long
// walks and stairs, and goes down inside units, outside the tower, and at
// cafes. Stress pinned at 100 for too long makes a tenant move out.

import { planRoute } from './routing.js';
import { requestRide, cancelRider } from './elevators.js';
import { isConnected } from './tower.js';
import { districtBonus } from './districts.js';
import { coverageOf, noiseOf, trashLevel, amenityRelief, appealOf } from './services.js';

const DAY = 1440; // minutes per day
const rnd = (a, b) => a + Math.random() * (b - a);
const wrap = (minutes) => ((minutes % DAY) + DAY) % DAY;
// Is time-of-day `t` inside [start, end)? Handles windows that cross midnight.
const inWindow = (t, start, end) => (start <= end ? t >= start && t < end : t >= start || t < end);

export function createTenantSystem(config, clockMinutes) {
  return {
    list: [],
    nextId: 1,
    byFacility: new Map(), // facility id -> Set of tenants who live/work there
    present: new Map(), // facility id -> how many are inside it right now
    visitors: new Map(), // cafe id -> customers currently dwelling
    counts: new Map(), // floor -> people standing/waiting on it (for crowd stress)
    effectCache: new Map(), // per-tick cache of what each unit does to its people
    fx: [], // little floating messages ("Moved out!")
    lastHour: Math.floor(clockMinutes / 60),
    moodTimer: 0,
    stats: { population: 0, mood: 100, moveOuts: 0, reputation: config.tenants.reputation.start },
  };
}

// ---------- Creating tenants ----------

function pickTrait(config) {
  const traits = Object.entries(config.tenants.traits);
  let roll = Math.random() * traits.reduce((sum, [, t]) => sum + t.weight, 0);
  for (const [id, t] of traits) {
    roll -= t.weight;
    if (roll <= 0) return id;
  }
  return traits[0][0];
}

// Builds a tenant's personal day: when they are in the tower, and which
// optional venue trips (lunch, shopping, the cinema...) they make.
function makeSchedule(kind, trait, config) {
  const sc = config.tenants.schedules[kind];
  const tr = config.tenants.traits[trait];
  const jitter = () => rnd(-tr.jitterMin, tr.jitterMin);
  const shift = tr.shiftMin;
  const sched =
    kind === 'worker'
      ? { arrive: wrap(sc.arrive + shift + jitter()), leave: wrap(sc.leave + shift + jitter()) }
      : { back: wrap(sc.back + shift + jitter()), leave: wrap(sc.leave + shift + jitter()) };

  const visits = [];
  for (const rule of config.tenants.visitRules) {
    if (!rule.kinds.includes(kind)) continue;
    const chance = rule.traitChance?.[trait] ?? rule.chance;
    if (Math.random() >= chance) continue;
    visits.push({ key: rule.key, purpose: rule.purpose, start: wrap(rule.start + shift + jitter()), durMin: rule.durMin });
  }
  return { sched, visits };
}

// Saves from before venues existed stored visits without a purpose.
const OLD_PURPOSES = { lunch: 'food', break: 'food', evening: 'fun' };
const fixVisits = (visits) => (visits ?? []).map((v) => ({ purpose: OLD_PURPOSES[v.key] ?? 'food', ...v }));

function registerHome(sys, t) {
  if (!sys.byFacility.has(t.homeId)) sys.byFacility.set(t.homeId, new Set());
  sys.byFacility.get(t.homeId).add(t);
}

function newTenant(sys, config, facility, extra = {}) {
  const def = config.facilities[facility.type];
  const used = new Set();
  for (const other of sys.byFacility.get(facility.id) ?? []) used.add(other.slot);
  let slot = 0;
  while (used.has(slot)) slot++;
  const kind = def.tenantKind;
  const trait = extra.trait ?? pickTrait(config);
  const made = extra.sched ? { sched: extra.sched, visits: fixVisits(extra.visits) } : makeSchedule(kind, trait, config);
  const t = {
    id: sys.nextId++,
    kind,
    homeId: facility.id,
    slot: extra.slot ?? slot,
    trait,
    sched: made.sched,
    visits: made.visits,
    visitDone: {}, // visit key -> day index it was last done
    stress: extra.stress ?? 0,
    maxedSec: 0,
    mode: 'away', // away | home | travel | dwell
    enterAfter: 0, // do not appear before this game minute
    pos: null, // { floor, x } while inside the tower
    route: null,
    legIdx: 0,
    legT: 0,
    task: null, // enter | leave | visit | return
    rider: null, // current elevator ride
    dest: null,
    cafeId: null, // the venue they are visiting (any shop, cinema, clinic...)
    careDay: -1, // last day they went to a clinic
    visitDur: [20, 30], // game minutes to stay at a venue
    dwellUntil: 0,
    nextTry: 0,
    fails: 0,
    rideRetry: 0,
    dead: false,
  };
  sys.list.push(t);
  registerHome(sys, t);
  return t;
}

// ---------- Small helpers ----------

const gainMult = (config, t) => 1 / config.tenants.traits[t.trait].thresholdMult;

function addStress(config, t, amount) {
  t.stress = Math.max(0, Math.min(100, t.stress + amount * gainMult(config, t)));
}

function homeSpot(game, config, t) {
  const f = game.tower.facilities.get(t.homeId);
  const def = config.facilities[f.type];
  return { floor: f.floor, x: f.cell + ((t.slot + 0.5) * f.width) / def.capacity };
}

function doorSpot(config) {
  return { floor: 0, x: config.lobby.startCell + config.lobby.startWidthCells / 2 };
}

function shouldBeInside(t, minuteOfDay) {
  return t.kind === 'worker'
    ? inWindow(minuteOfDay, t.sched.arrive, t.sched.leave)
    : inWindow(minuteOfDay, t.sched.back, t.sched.leave); // residents and guests
}

function fx(sys, floor, x, text) {
  sys.fx.push({ floor, x, text, age: 0 });
}

// ---------- Removing tenants ----------

function removeTenant(game, config, t, reason) {
  const sys = game.tenants;
  if (t.dead) return;
  t.dead = true;
  if (t.rider) cancelRider(game, t.rider);
  t.rider = null;
  sys.byFacility.get(t.homeId)?.delete(t);
  if (t.mode === 'dwell' && t.cafeId !== null) {
    sys.visitors.set(t.cafeId, Math.max(0, (sys.visitors.get(t.cafeId) ?? 1) - 1));
  }
  if (reason === 'stress') {
    // Moving out because of stress hurts the tower's reputation.
    sys.stats.moveOuts += 1;
    const stats = sys.stats;
    stats.reputation = Math.max(0, Math.min(100, stats.reputation + config.tenants.reputation.perMoveOut));
    const p = t.pos ?? doorSpot(config);
    fx(sys, Math.round(p.floor), p.x, 'Moved out!');
  }
}

// ---------- Travel ----------

function startTrip(game, config, t, task, from, to) {
  const route = planRoute(game, config, from, to);
  if (!route) {
    t.fails += 1;
    t.nextTry = game.clock.minutes + 20;
    if (t.fails >= 6) removeTenant(game, config, t, 'unreachable');
    return false;
  }
  t.fails = 0;
  t.task = task;
  t.dest = to;
  t.route = route;
  t.legIdx = 0;
  t.legT = 0;
  t.rider = null;
  t.pos = { floor: from.floor, x: from.x };
  t.mode = 'travel';
  return true;
}

// The tower changed under a travelling tenant: plan again from where they are.
function replan(game, config, t) {
  if (t.rider) cancelRider(game, t.rider);
  t.rider = null;
  const from = { floor: Math.round(t.pos.floor), x: t.pos.x };
  const route = planRoute(game, config, from, t.dest);
  if (!route) {
    removeTenant(game, config, t, 'unreachable');
    return;
  }
  t.pos = { floor: from.floor, x: from.x };
  t.route = route;
  t.legIdx = 0;
  t.legT = 0;
}

// Nearest, least crowded reachable venue that serves `purpose`
// (food, shop, fun, fit, care).
function findVenue(game, config, t, purpose) {
  const sys = game.tenants;
  let best = null;
  let bestScore = Infinity;
  for (const f of game.tower.facilities.values()) {
    const def = config.facilities[f.type];
    if (!def.purposes?.includes(purpose) || !isConnected(game.tower, config, f)) continue;
    const here = sys.visitors.get(f.id) ?? 0;
    if (here >= def.visitCapacity) continue;
    const score = Math.abs(f.floor - Math.round(t.pos.floor)) + here * 0.3;
    if (score < bestScore) {
      best = f;
      bestScore = score;
    }
  }
  return best;
}

// Set off for a venue; returns false if there is no route.
function beginVisit(game, config, t, venue, durMin) {
  t.cafeId = venue.id;
  t.visitDur = durMin;
  const spot = { floor: venue.floor, x: venue.cell + rnd(0.6, Math.max(0.7, venue.width - 0.6)) };
  const ok = startTrip(game, config, t, 'visit', homeSpot(game, config, t), spot);
  if (!ok) t.cafeId = null;
  return ok;
}

// What a tenant's own unit does to them each second: calming effects and
// annoyances. Worked out once per facility per tick.
function homeEffects(game, config, t) {
  const sys = game.tenants;
  let fx = sys.effectCache.get(t.homeId);
  const f = game.tower.facilities.get(t.homeId);
  if (!fx) {
    const sv = config.services;
    const cov = coverageOf(game, config, f);
    const district = districtBonus(game.tower, config, f);
    const noise = Math.max(0, noiseOf(game, config, f) - sv.noise.ignoreBelow) * sv.noise.stressPerSec;
    const trashShare = Math.max(0, (trashLevel(game, f) - sv.trash.stressAbove) / (100 - sv.trash.stressAbove));
    fx = {
      relief: amenityRelief(game, config, f.floor) + district.relief + (cov.medical ? 0.12 : 0) + (cov.security ? 0.08 : 0),
      noise,
      trash: trashShare * sv.trash.stressPerSec,
    };
    sys.effectCache.set(t.homeId, fx);
  }
  const quiet = t.trait === 'quiet' ? config.services.noise.quietMult : 1;
  return { relief: fx.relief, annoy: fx.noise * quiet + fx.trash };
}

function finishTrip(game, config, t) {
  const sys = game.tenants;
  const minute = game.clock.minutes;
  switch (t.task) {
    case 'enter':
    case 'return':
      t.mode = 'home';
      t.pos = homeSpot(game, config, t);
      break;
    case 'leave':
      t.mode = 'away';
      t.pos = null;
      break;
    case 'visit': {
      const cafe = game.tower.facilities.get(t.cafeId);
      const def = cafe && config.facilities[cafe.type];
      if (!cafe) {
        t.mode = 'home';
        t.pos = homeSpot(game, config, t);
        break;
      }
      // The customer pays (more in a matching district), and a visit calms them down.
      const revenue = Math.round(def.visitRevenue * districtBonus(game.tower, config, cafe).salesMult);
      game.tower.funds += revenue;
      game.economy.salesThisQuarter += revenue;
      game.economy.salesByFacility[cafe.id] = (game.economy.salesByFacility[cafe.id] ?? 0) + revenue;
      game.services.visitsToday[cafe.id] = (game.services.visitsToday[cafe.id] ?? 0) + 1;
      const relief = (def.visitRelief ?? config.tenants.stress.cafeRelief) * config.tenants.traits[t.trait].reliefMult;
      t.stress = Math.max(0, t.stress - relief);
      t.maxedSec = 0;
      sys.visitors.set(cafe.id, (sys.visitors.get(cafe.id) ?? 0) + 1);
      t.dwellUntil = minute + rnd(t.visitDur[0], t.visitDur[1]);
      t.mode = 'dwell';
      break;
    }
    default:
      t.mode = 'home';
  }
  t.task = null;
  t.route = null;
}

function stepTravel(game, config, t, dt) {
  const sys = game.tenants;
  const sc = config.tenants.stress;
  const leg = t.route[t.legIdx];
  if (!leg) {
    finishTrip(game, config, t);
    return;
  }
  const trait = config.tenants.traits[t.trait];
  const floorKey = Math.round(t.pos.floor);
  let standing = true; // counts toward floor crowding

  if (leg.type === 'walk') {
    const dx = leg.to - t.pos.x;
    const step = config.tenants.walkSpeedCellsPerSec * dt;
    t.pos.floor = leg.floor;
    const moved = Math.min(Math.abs(dx), step);
    t.pos.x += Math.sign(dx) * moved;
    if (Math.abs(dx) <= step) {
      t.pos.x = leg.to;
      t.legIdx += 1;
    }
    addStress(config, t, moved * sc.walkPerCell);
  } else if (leg.type === 'stairs') {
    if (!game.tower.facilities.has(leg.id)) return replan(game, config, t);
    // Stairs and escalators both land here; escalators are faster and easier.
    const climbSec = leg.sec ?? config.tenants.stairSecPerFloor;
    t.legT += dt / climbSec;
    t.pos.x = leg.x;
    t.pos.floor = leg.fromFloor + (leg.toFloor - leg.fromFloor) * Math.min(1, t.legT);
    if (t.legT >= 1) {
      t.pos.floor = leg.toFloor;
      t.legT = 0;
      t.legIdx += 1;
      addStress(config, t, sc.stairsPerFloor * (climbSec < config.tenants.stairSecPerFloor ? 0.25 : 1));
    }
  } else {
    // Elevator leg: join the line, wait, ride, step out.
    if (!game.elevators.shafts.has(leg.shaftId) && !t.rider && !game.tower.facilities.has(leg.shaftId)) {
      return replan(game, config, t);
    }
    t.pos.floor = leg.fromFloor;
    t.pos.x = leg.x;
    // The shaft's settings changed since this trip was planned: plan again.
    const planned = game.elevators.shafts.get(leg.shaftId);
    if (!t.rider && planned && (!planned.stops.has(leg.fromFloor) || !planned.stops.has(leg.toFloor))) {
      return replan(game, config, t);
    }
    if (!t.rider) {
      t.rideRetry -= dt;
      if (t.rideRetry <= 0) {
        const rider = requestRide(game, config, leg.fromFloor, leg.toFloor, { shaftId: leg.shaftId, tenant: t });
        if (rider) t.rider = rider;
        else t.rideRetry = config.tenants.routing.retryRideEverySec; // line is full
      }
      addStress(config, t, sc.waitPerSec * 0.7 * dt); // milling about, waiting for space
    } else if (t.rider.state === 'waiting') {
      const lineLength = (game.elevators.shafts.get(t.rider.shaftId)?.waiting.get(leg.fromFloor) ?? []).length;
      addStress(config, t, sc.waitPerSec * (1 + sc.queueCrowdBonus * lineLength) * dt);
    } else if (t.rider.state === 'riding') {
      standing = false;
      const shaft = game.elevators.shafts.get(t.rider.shaftId);
      const car = shaft?.cars.find((c) => c.riders.includes(t.rider));
      const fullness = car ? car.riders.length / shaft.capacity : 0.5;
      addStress(config, t, sc.ridePerSec * fullness * dt);
      if (car) t.pos.floor = car.pos; // so the tenant "is" where the car is
    } else if (t.rider.state === 'done') {
      t.pos.floor = leg.toFloor;
      t.rider = null;
      t.legIdx += 1;
    } else {
      // cancelled (e.g. the shaft was rebuilt): plan again
      return replan(game, config, t);
    }
  }

  // Passing through an atrium's calming range helps a little.
  t.stress = Math.max(0, t.stress - amenityRelief(game, config, floorKey) * dt);

  if (standing) {
    const next = sys.nextCounts;
    next.set(floorKey, (next.get(floorKey) ?? 0) + 1);
    const crowd = sys.counts.get(floorKey) ?? 0;
    if (crowd > sc.crowdedFloorPeople) {
      addStress(config, t, ((sc.crowdPerSec * (crowd - sc.crowdedFloorPeople)) / sc.crowdedFloorPeople) * trait.crowdMult * dt);
    }
  }
  return undefined;
}

// ---------- Per-tenant update ----------

function updateTenant(game, config, t, dt, minute) {
  const sys = game.tenants;
  const sc = config.tenants.stress;
  const mod = minute % DAY;
  const day = Math.floor(minute / DAY);

  switch (t.mode) {
    case 'away':
      t.stress = Math.max(0, t.stress - sc.decayAwayPerSec * dt);
      t.maxedSec = 0;
      if (minute >= t.enterAfter && minute >= t.nextTry && shouldBeInside(t, mod)) {
        startTrip(game, config, t, 'enter', doorSpot(config), homeSpot(game, config, t));
      }
      break;

    case 'home': {
      // At home: calm down (helped by atria, districts, medical cover), but
      // noise and trash in the unit wear on people.
      const fx = homeEffects(game, config, t);
      t.stress = Math.max(0, t.stress - (sc.decayInsidePerSec + fx.relief) * dt);
      if (fx.annoy > 0) addStress(config, t, fx.annoy * dt);
      sys.present.set(t.homeId, (sys.present.get(t.homeId) ?? 0) + 1);
      if (minute < t.nextTry) break;
      if (!shouldBeInside(t, mod)) {
        startTrip(game, config, t, 'leave', homeSpot(game, config, t), doorSpot(config));
        break;
      }
      // Very stressed? Walk to a clinic (checked once a day).
      if (t.stress >= config.services.careAbove && t.careDay !== day) {
        t.careDay = day;
        const clinic = findVenue(game, config, t, 'care');
        if (clinic && beginVisit(game, config, t, clinic, [25, 40])) break;
      }
      for (const v of t.visits) {
        if (t.visitDone[v.key] === day || !inWindow(mod, v.start, wrap(v.start + 120))) continue;
        t.visitDone[v.key] = day; // decide once per day, even if there is no venue
        const venue = findVenue(game, config, t, v.purpose);
        if (venue && beginVisit(game, config, t, venue, v.durMin)) break;
      }
      break;
    }

    case 'dwell':
      t.stress = Math.max(0, t.stress - sc.decayInsidePerSec * dt);
      if (minute >= t.dwellUntil) {
        sys.visitors.set(t.cafeId, Math.max(0, (sys.visitors.get(t.cafeId) ?? 1) - 1));
        t.cafeId = null;
        startTrip(game, config, t, 'return', t.pos, homeSpot(game, config, t));
        if (t.mode === 'dwell') {
          t.mode = 'home'; // no route back (cafe gone?): just appear at their desk
          t.pos = homeSpot(game, config, t);
        }
      }
      break;

    case 'travel':
      stepTravel(game, config, t, dt);
      break;

    default:
  }

  // Stress pinned at the top for too long: this tenant has had enough.
  if (t.stress >= 99.9) t.maxedSec += dt;
  else t.maxedSec = Math.max(0, t.maxedSec - dt * 0.5);
  if (!t.dead && t.maxedSec >= sc.maxedLeaveSec) removeTenant(game, config, t, 'stress');
}

// ---------- Move-ins ----------

export function occupancyOf(game, config, facility) {
  const def = config.facilities[facility.type];
  if (!def.capacity) return 1; // shops etc. are "let" as soon as they are reachable
  return Math.min(1, (game.tenants.byFacility.get(facility.id)?.size ?? 0) / def.capacity);
}

function moveInStep(game, config) {
  const sys = game.tenants;
  const mi = config.tenants.moveIn;
  const demand = Math.max(mi.minDemand, sys.stats.mood / 100);
  for (const f of game.tower.facilities.values()) {
    const def = config.facilities[f.type];
    if (!def.capacity || !isConnected(game.tower, config, f)) continue;
    let count = sys.byFacility.get(f.id)?.size ?? 0;
    while (count < def.capacity && sys.list.length < config.tenants.maxSimulated) {
      if (Math.random() >= mi.chancePerVacancyPerHour * demand * appealOf(game, config, f)) break;
      const t = newTenant(sys, config, f);
      t.enterAfter = game.clock.minutes + rnd(mi.enterDelayMin[0], mi.enterDelayMin[1]);
      count += 1;
    }
  }
}

// ---------- Main update ----------

export function updateTenants(game, config, dt) {
  const sys = game.tenants;
  const minute = game.clock.minutes;

  // Hourly: new tenants may move into vacant units.
  const hourNow = Math.floor(minute / 60);
  while (sys.lastHour < hourNow) {
    sys.lastHour += 1;
    moveInStep(game, config);
  }

  sys.present = new Map();
  sys.nextCounts = new Map();
  sys.effectCache = new Map();
  for (const t of sys.list) {
    if (t.dead) continue;
    if (!game.tower.facilities.has(t.homeId)) {
      removeTenant(game, config, t, 'demolished'); // their unit was torn down
      continue;
    }
    updateTenant(game, config, t, dt, minute);
  }
  sys.counts = sys.nextCounts;
  if (sys.list.some((t) => t.dead)) sys.list = sys.list.filter((t) => !t.dead);

  for (const f of sys.fx) f.age += dt;
  if (sys.fx.length) sys.fx = sys.fx.filter((f) => f.age < 2.5);

  sys.moodTimer -= dt;
  if (sys.moodTimer <= 0) {
    sys.moodTimer = 0.5;
    let total = 0;
    for (const t of sys.list) total += t.stress;
    sys.stats.population = sys.list.length;
    sys.stats.mood = sys.list.length ? Math.round(100 - total / sys.list.length) : 100;
  }
}

// Called once per game day (from the clock).
export function dailyTenantUpdate(game, config) {
  const rep = config.tenants.reputation;
  const stats = game.tenants.stats;
  if (stats.population > 0 && stats.mood >= rep.goodMoodAbove) {
    stats.reputation = Math.min(100, stats.reputation + rep.perGoodDay);
  }
}

// ---------- Saving ----------

export function serializeTenants(sys) {
  return {
    stats: { moveOuts: sys.stats.moveOuts, reputation: sys.stats.reputation },
    list: sys.list.map((t) => ({
      kind: t.kind,
      homeId: t.homeId,
      slot: t.slot,
      trait: t.trait,
      sched: t.sched,
      visits: t.visits,
      stress: Math.round(t.stress),
    })),
  };
}

// Everyone restarts "away" and walks in again according to their schedule.
export function restoreTenants(game, config, data) {
  const sys = createTenantSystem(config, game.clock.minutes);
  if (data) {
    sys.stats.moveOuts = data.stats?.moveOuts ?? 0;
    sys.stats.reputation = data.stats?.reputation ?? config.tenants.reputation.start;
    for (const s of data.list ?? []) {
      const f = game.tower.facilities.get(s.homeId);
      if (!f || !config.facilities[f.type].capacity) continue;
      newTenant(sys, config, f, s);
    }
  }
  return sys;
}
