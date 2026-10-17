// config.js
//
// Every tunable number in the game lives here. Nothing in src/sim or
// src/render should hard-code a number that a designer might want to
// change later — it should read it from this file instead. That way we
// can rebalance the game without touching simulation or drawing code.

export const config = {
  // --- Simulation timing ---
  sim: {
    // Simulation "ticks" per second, regardless of device frame rate.
    ticksPerSecond: 30,
  },

  // --- Game clock ---
  time: {
    // Real seconds for one full game day at 1x speed. Long enough that a
    // morning rush (about 2 game hours) lasts ~20 seconds you can watch.
    dayLengthSeconds: 240,
    startHour: 6, // the game begins at 6:00 AM on day 1
    daysPerQuarter: 6, // length of one quarter, in game days
    quartersPerYear: 4,
    speeds: [0, 1, 2, 4], // speed buttons: pause, 1x, 2x, 4x
    defaultSpeed: 1,
  },

  // --- Camera (pan & zoom) ---
  camera: {
    minZoom: 0.1, // 0.1 = zoomed way out (see a huge tower)
    maxZoom: 4, // 4 = zoomed way in
    startZoom: 0.7,
    // World point at the center of the screen when the game starts.
    // Negative y = above street level. This puts the street a bit below center.
    startX: 0,
    startY: -110,
    // Two taps within this time/distance count as a double-tap zoom.
    doubleTapMaxDelayMs: 300,
    doubleTapMaxDistancePx: 40,
    doubleTapZoomFactor: 1.6,
    longPressMs: 450, // hold a finger still this long to open an info panel
    wheelZoomFactor: 1.1, // desktop mouse wheel
    // How far past the plot edges the camera may wander (world pixels).
    panMarginPx: 300,
  },

  // --- The grid ---
  grid: {
    cellWidth: 40, // world pixels per cell, horizontally
    floorHeight: 48, // world pixels per floor, vertically
  },

  // --- The building plot (grows with rating tier in M7) ---
  plot: {
    halfWidthCells: 24, // plot spans cells -24 .. +23
    maxFloor: 10, // highest floor you may build (floor 0 = lobby level)
    minFloor: -2, // deepest basement (basement facilities arrive later)
  },

  // --- Lobby ---
  lobby: {
    startCell: -6, // leftmost cell of the starting lobby
    startWidthCells: 12,
  },

  // --- Money ---
  economy: {
    startFunds: 30000,
    demolishRefundRatio: 0.5, // fraction of build cost refunded on demolish
    // Upkeep grows with the tower: every floor of height adds this fraction
    // to the whole daily upkeep bill (0.03 = +3% per floor).
    sizeUpkeepPerFloor: 0.03,
    // Soft-fail: when funds are below $0 you get this many days to recover
    // before the fire-sale offer appears.
    debtGraceDays: 5,
    fireSaleRatio: 0.75, // fraction of build cost paid when you sell in a fire sale
    fireSaleExtraDays: 3, // extra days granted if you decline the fire sale
    fireSaleOffers: 4, // how many facilities the fire sale lists
  },

  // --- Saving ---
  save: {
    key: 'spire.save', // localStorage key
    version: 2, // bump when the save format changes (see src/sim/save.js)
  },

  // --- Build interaction ---
  build: {
    // On touch screens the ghost is drawn this many screen pixels ABOVE
    // your fingertip so your finger doesn't hide it.
    touchOffsetPx: 56,
  },

  // --- Facility catalog (M1 subset; the full catalog comes in M6) ---
  // width: cells wide. cost: build price. minFloor/maxFloor: allowed floors
  // (maxFloor omitted = plot.maxFloor). color/accent: vector art palette.
  // rentPerCell: rent per occupied cell per QUARTER. upkeepPerCell: cost per
  // cell per DAY (before the size scaling in `economy`).
  facilities: {
    lobby: {
      name: 'Lobby wing',
      category: 'lobby',
      width: 2,
      cost: 2000,
      minFloor: 0,
      maxFloor: 0,
      hall: true, // a hall: elevators may stand inside it and stop at it
      rentPerCell: 0,
      upkeepPerCell: 3,
      color: '#cdbfa6',
      accent: '#8fb7c9',
    },
    office: {
      name: 'Small office',
      category: 'work',
      width: 4,
      cost: 4000,
      capacity: 6, // workers who can have a desk here
      tenantKind: 'worker',
      minFloor: 1,
      rentPerCell: 300,
      upkeepPerCell: 6,
      color: '#4f7fc9',
      accent: '#bcd6f7',
    },
    apartment: {
      name: 'Apartment',
      category: 'living',
      width: 3,
      cost: 3000,
      capacity: 3, // residents who can live here
      tenantKind: 'resident',
      minFloor: 1,
      rentPerCell: 300,
      upkeepPerCell: 6,
      color: '#e2905b',
      accent: '#ffe3a3',
    },
    cafe: {
      name: 'Café',
      category: 'commerce',
      width: 4,
      cost: 5000,
      visitRevenue: 12, // money earned per customer visit
      visitCapacity: 8, // customers at once
      minFloor: 1,
      rentPerCell: 250,
      upkeepPerCell: 8,
      color: '#3f9d70',
      accent: '#f6f1e7',
    },
    // --- Transport ---
    // vertical: true = you drag up/down to choose how many floors it spans;
    // `cost` and upkeep are then PER FLOOR. transport: what kind of link it is.
    // A stairwell on floor N joins floor N with the floor below it.
    stairs: {
      name: 'Stairwell',
      category: 'transport',
      width: 2,
      cost: 600,
      minFloor: 1,
      vertical: true,
      transport: 'stairs',
      rentPerCell: 0,
      upkeepPerCell: 2,
      color: '#a79b86',
      accent: '#6f6455',
    },
    // An elevator shaft joins every floor it stops at (it may start in the lobby).
    // stopMode 'all' = stops everywhere (you can switch floors off in its settings).
    elevator: {
      name: 'Local elevator',
      category: 'transport',
      width: 2,
      cost: 1800,
      minFloor: 0,
      vertical: true,
      transport: 'elevator',
      stopMode: 'all',
      rentPerCell: 0,
      upkeepPerCell: 5,
      color: '#66788a',
      accent: '#e8d9a8',
    },
    // Express: faster, bigger cars, but it only stops at its bottom floor and at
    // "halls" (the lobby and sky lobbies) that it passes through or touches.
    elevatorExpress: {
      name: 'Express elevator',
      category: 'transport',
      width: 2,
      cost: 2800,
      minFloor: 0,
      vertical: true,
      transport: 'elevator',
      stopMode: 'hubs',
      carSpeedMult: 1.9,
      carCapacityBonus: 2,
      rentPerCell: 0,
      upkeepPerCell: 7,
      color: '#3d5a80',
      accent: '#f2c46d',
    },
    // A transfer floor: a wide hall where elevators can stop and people change
    // between express and local shafts. Elevators can run right through it.
    skylobby: {
      name: 'Sky lobby',
      category: 'transport',
      width: 8,
      cost: 7000,
      minFloor: 3,
      hall: true,
      rentPerCell: 0,
      upkeepPerCell: 3,
      color: '#8fbfb5',
      accent: '#e9f4ef',
    },
  },

  // --- Elevators ---
  // Times are in "sim seconds": real seconds at 1x speed (2x/4x run faster).
  elevators: {
    defaultCars: 1, // a new shaft comes with one car; add more in its settings
    maxCars: 6, // most cars one shaft can hold
    carCost: 2500, // price of each extra car
    carUpkeepPerDay: 10, // every car costs this to run, per day
    car: {
      capacity: 8, // riders per car
      speedFloorsPerSec: 3.6, // travel speed
      doorSeconds: 0.5, // time for doors to open (or close)
      dwellSeconds: 0.9, // doors stay open this long after the last person moves
      exchangeSeconds: 0.2, // time for one person to step on or off
      idleParkSeconds: 4, // an idle car drives back to its home floor after this long
    },
    // How hall calls are matched to cars (see src/sim/elevators.js).
    dispatch: {
      reassignEverySec: 0.25, // how often hall calls are re-matched to cars
      hysteresisFloors: 1.5, // only switch a call to another car if it is this much better
      stopPenaltyFloors: 0.6, // each extra stop on the way counts as this many floors of delay
      bunchDistanceFloors: 3, // two cars chasing calls this close together are "bunching"
      bunchPenaltyFloors: 4, // extra cost for sending a car right next to another busy car
      loadPenaltyFloors: 2, // extra cost for a nearly full car
    },
    maxQueuePerFloor: 40, // riders that can wait at one stop
    // Waiting-rider moods (seconds waited). Tenants in M4 reuse these.
    impatientAfterSec: 10,
    stressedAfterSec: 22,
    // Demo traffic (Tools tab) spawns random riders so you can watch dispatch.
    demoSpawnEverySec: 1.1,
  },

  // --- Tenants: the people who live and work in the tower ---
  // Times of day are in minutes after midnight (8 * 60 = 8:00 AM).
  // "sec" values are sim seconds (real seconds at 1x speed).
  tenants: {
    maxSimulated: 500, // safety cap on individually simulated tenants
    walkSpeedCellsPerSec: 1.7, // walking speed along a floor
    stairSecPerFloor: 3.2, // time to climb or descend one floor of stairs

    // New tenants move into vacant, reachable units. Each hour, every vacancy
    // has this chance (scaled down when the tower's mood is low).
    moveIn: {
      chancePerVacancyPerHour: 0.12,
      minDemand: 0.25, // lowest the mood multiplier can push move-ins
      enterDelayMin: [5, 45], // a new tenant first shows up this many game minutes later
    },

    // Daily routines. Each tenant gets small personal offsets (see traits).
    schedules: {
      worker: { arrive: 8 * 60, leave: 17 * 60, lunch: 12 * 60, lunchDurMin: [30, 50] },
      resident: { leave: 7.5 * 60, back: 18 * 60 },
      // Extra cafe trips for Social tenants.
      socialWorkerBreak: { start: 15.5 * 60, durMin: [20, 30] },
      socialEvening: { start: 19.5 * 60, durMin: [30, 50] },
    },

    // How the route planner compares stairs with elevators (see src/sim/routing.js).
    routing: {
      elevatorBaseWaitSec: 8, // typical wait for a car on an empty line
      elevatorPerWaiterSec: 1.5, // each person already in line adds this
      elevatorRideSecPerFloor: 0.5,
      retryRideEverySec: 2, // when the line is full, try again this often
    },

    // Stress runs 0-100. GAIN values are multiplied by the trait (below).
    stress: {
      waitPerSec: 1.7, // standing in an elevator line
      queueCrowdBonus: 0.04, // line length adds this fraction per waiting person
      ridePerSec: 0.25, // riding a crowded car (scaled by how full it is)
      walkPerCell: 0.12, // long walks along a floor
      stairsPerFloor: 0.8, // climbing
      crowdedFloorPeople: 8, // above this many people on a floor, it feels crowded
      crowdPerSec: 0.25, // crowded floor, per extra person over the limit / limit
      decayInsidePerSec: 0.5, // calming down at home or at work
      decayAwayPerSec: 1.5, // calming down while outside the tower
      cafeRelief: 28, // stress removed by a cafe visit
      calmBelow: 35, // below this: calm (blue)
      stressedAbove: 70, // above this: stressed (red); in between: impatient (amber)
      maxedLeaveSec: 14, // stress pinned at 100 this long -> they move out
    },

    // Personality traits. Weight = how common. thresholdMult below 1 means
    // stress builds faster (0.6 = threshold 40% lower, i.e. gain x1.67).
    // jitterMin = schedule wobble; shiftMin = schedule shifted later;
    // reliefMult = how much cafe visits help; crowdMult = bothered by crowds.
    traits: {
      punctual: { label: 'Punctual', weight: 30, thresholdMult: 0.85, jitterMin: 4, shiftMin: 0, reliefMult: 1, crowdMult: 1, color: '#3b82c4' },
      impatient: { label: 'Impatient', weight: 20, thresholdMult: 0.6, jitterMin: 35, shiftMin: 0, reliefMult: 1, crowdMult: 1.3, color: '#e8842c' },
      nightOwl: { label: 'Night Owl', weight: 15, thresholdMult: 1.0, jitterMin: 40, shiftMin: 180, reliefMult: 1, crowdMult: 0.9, color: '#7a5bc4' },
      social: { label: 'Social', weight: 20, thresholdMult: 1.0, jitterMin: 30, shiftMin: 0, reliefMult: 2, crowdMult: 0.6, color: '#d6559a' },
      quiet: { label: 'Quiet', weight: 15, thresholdMult: 1.1, jitterMin: 20, shiftMin: 0, reliefMult: 0.7, crowdMult: 0.5, color: '#2e9c8e' },
    },

    // Moving out hurts the tower's reputation (rating tiers in M7 will use it).
    reputation: { start: 50, perMoveOut: -1.5, perGoodDay: 0.4, goodMoodAbove: 70 },
  },

  // --- Diagnostic overlays (the heat-map layers) ---
  // Each ramp goes from "low" to "high" using lightness AND hue, plus every
  // tile shows its number, so nothing depends on color alone.
  overlays: {
    waitMaxSec: 40, // an elevator stop averaging this wait is "maximum" red
    ramps: {
      bad: ['#fff1b8', '#f7b267', '#e0603c', '#8e1d4c'], // stress, wait: high is bad
      good: ['#e4f1f3', '#8fd0d6', '#3a9fb0', '#0d5a73'], // occupancy: high is good
      money: ['#f4f1d0', '#c4de8a', '#74b36b', '#1f6e43'], // income
    },
  },

  // --- Sky colors through the day ---
  // Keyframes by hour (0-24). The sky blends smoothly between neighbors.
  // dark: 0 = bright day, 1 = deep night (dims buildings, lights windows).
  sky: {
    keyframes: [
      { hour: 0, top: '#0b1430', bottom: '#1c2a52', dark: 1 },
      { hour: 4.5, top: '#0e1838', bottom: '#27345f', dark: 1 },
      { hour: 5.75, top: '#2e3a6e', bottom: '#e58f6b', dark: 0.6 }, // dawn
      { hour: 7.5, top: '#6ea8d8', bottom: '#cfe8f5', dark: 0 },
      { hour: 17, top: '#6ea8d8', bottom: '#cfe8f5', dark: 0 },
      { hour: 18.75, top: '#43508f', bottom: '#f08a5d', dark: 0.5 }, // dusk
      { hour: 20.5, top: '#0e1838', bottom: '#27345f', dark: 1 },
      { hour: 24, top: '#0b1430', bottom: '#1c2a52', dark: 1 },
    ],
    nightTint: '#10162e', // color buildings are blended toward at night
    nightDimStrength: 0.5, // how strongly (0-1) night darkens buildings
    windowGlow: '#ffd978', // color of lit windows
    starCount: 45,
  },

  // --- Look of the world ---
  world: {
    groundY: 0, // world-space y of street level
    groundColor: '#4a5a4e', // underground
    grassColor: '#6fae5b', // thin strip along street level
    grassHeight: 10, // world pixels
    plotOutlineColor: 'rgba(255,255,255,0.5)',
    gridColor: 'rgba(255,255,255,0.28)', // cell grid, shown while building
    validColor: '#1f9d55', // ghost outline when placement is allowed
    invalidColor: '#d64545', // ghost outline when it is not
    // Below this zoom level facilities are drawn as flat blocks (faster,
    // and details would be too tiny to see anyway).
    detailMinZoom: 0.3,
  },
};
