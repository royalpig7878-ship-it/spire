// config.js
//
// Every tunable number in the game lives here. Nothing in src/sim or
// src/render should hard-code a number that a designer might want to
// change later — it should read it from this file instead. That way we
// can rebalance the game without touching simulation or drawing code.

import { FACILITIES } from './catalog.js';

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
    minFloor: -2, // deepest basement (floor -1 is just under the street)
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
    version: 4, // bump when the save format changes (see src/sim/save.js)
  },

  // --- Build interaction ---
  build: {
    // On touch screens the ghost is drawn this many screen pixels ABOVE
    // your fingertip so your finger doesn't hide it.
    touchOffsetPx: 56,
  },

  // --- Facility catalog: every building you can build (see catalog.js) ---
  facilities: FACILITIES,

  // --- Building services: coverage, trash, power, parking, noise ---
  services: {
    // How far a service reaches is `coverFloors` in catalog.js. A service
    // elevator that spans both floors multiplies that reach by this much.
    serviceElevatorReachMult: 2,
    // Trash: every tenant and every visit makes some each day. Maintenance
    // hubs clean the facilities they cover; recycling plants cut how much is made.
    trash: {
      perTenantPerDay: 0.9,
      perVisit: 0.7,
      basePerDay: 0.4, // even an empty unit gathers a little
      maxCut: 0.65, // recycling can cut waste by at most this much
      stressAbove: 50, // trash level where people at home start to mind
      stressPerSec: 0.12, // stress per second at 100% trash
      badgeAbove: 60, // show a trash icon on the building above this level
    },
    // Each kind of cover makes a unit more attractive to move into.
    appeal: { security: 0.08, medical: 0.08, maintenance: 0.12, atrium: 0.1, parking: 0.2, max: 1.8 },
    // Noise: loud neighbours on nearby floors annoy people at home.
    noise: {
      reachFloors: 3, // floors above and below a source that still hear it
      ignoreBelow: 4, // quiet enough to ignore
      stressPerSec: 0.03, // per point of noise above the limit
      quietMult: 1.8, // Quiet tenants mind noise more
    },
    // Stressed tenants walk to a clinic once their stress reaches this level.
    careAbove: 65,
  },

  power: {
    defaultPerCell: 0.8, // power drawn per cell per floor (unless a facility says otherwise)
    baseSupply: 90, // what the city grid gives you for free
    pricePerUnitPerDay: 0.45, // electricity bill per unit of demand, per day
    minSpeedFactor: 0.5, // in a brownout elevators slow down, but never below this
  },

  // Some tenants drive: they need parking, and garages earn a small fee.
  parking: { driverShare: 0.3, incomePerCarPerDay: 3 },

  // --- Sky districts: every `bandFloors` floors you may theme a band of the tower ---
  // primary = what the district is FOR; supports = neighbours that make it better.
  // Each distinct kind of support present adds `perSupport` (up to `maxBonus`).
  // `weights` say how much of the bonus goes to rent, shop sales, how many
  // people want to move in, and stress relief.
  districts: {
    bandFloors: 15,
    designationCost: 2500,
    minFacilities: 3, // a band needs this many buildings before it can be themed
    supportSalesBonus: 0.15, // supporting shops/cafes earn this much more in a matching district
    themes: {
      business: {
        label: 'Business',
        color: '#4f7fc9',
        primary: ['work'],
        supports: ['food', 'parking', 'security'],
        perSupport: 0.07,
        maxBonus: 0.21,
        weights: { rent: 1, sales: 0.5, appeal: 0.3, relief: 0 },
        hint: 'Offices earn more rent near cafes, parking and security.',
      },
      leisure: {
        label: 'Leisure',
        color: '#d6559a',
        primary: ['fun', 'hospitality'],
        supports: ['food', 'shop', 'wellness'],
        perSupport: 0.07,
        maxBonus: 0.21,
        weights: { rent: 0.6, sales: 1, appeal: 0.5, relief: 0 },
        hint: 'Cinemas and hotels do better near food, shops and wellness.',
      },
      residential: {
        label: 'Residential',
        color: '#e2905b',
        primary: ['living'],
        supports: ['shop', 'food', 'wellness', 'security'],
        perSupport: 0.05,
        maxBonus: 0.2,
        weights: { rent: 0.8, sales: 0, appeal: 1, relief: 0.5 },
        hint: 'Homes are happier near shops, food, gyms and security.',
      },
      wellness: {
        label: 'Wellness',
        color: '#2e9c8e',
        primary: ['wellness'],
        supports: ['living', 'hospitality', 'food'],
        perSupport: 0.07,
        maxBonus: 0.21,
        weights: { rent: 0.4, sales: 1, appeal: 0.4, relief: 1 },
        hint: 'Gyms and clinics thrive near homes, hotels and food.',
      },
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
    // Workers are in the tower between arrive and leave. Residents and hotel
    // guests are home between `back` and `leave` the next morning.
    schedules: {
      worker: { arrive: 8 * 60, leave: 17 * 60 },
      resident: { leave: 7.5 * 60, back: 18 * 60 },
      guest: { leave: 11 * 60, back: 15 * 60 },
    },

    // Optional trips to venues. A rule applies to tenants of the listed kinds;
    // `chance` is the share of them who do it (a trait can change that).
    // purpose must match a venue's `purposes` in catalog.js. A trip starts
    // inside a two-hour window after `start` (minutes after midnight).
    visitRules: [
      { key: 'lunch', kinds: ['worker', 'guest'], purpose: 'food', start: 12 * 60, durMin: [30, 50], chance: 1 },
      { key: 'break', kinds: ['worker'], purpose: 'food', start: 15.5 * 60, durMin: [20, 30], chance: 0, traitChance: { social: 1 } },
      { key: 'workout', kinds: ['resident', 'worker'], purpose: 'fit', start: 18.25 * 60, durMin: [40, 55], chance: 0.25, traitChance: { social: 0.5, quiet: 0.1 } },
      { key: 'shopping', kinds: ['resident', 'guest'], purpose: 'shop', start: 18.5 * 60, durMin: [20, 35], chance: 0.35 },
      { key: 'dinner', kinds: ['resident', 'guest'], purpose: 'food', start: 19 * 60, durMin: [40, 60], chance: 0.25, traitChance: { social: 0.8 } },
      { key: 'evening', kinds: ['resident', 'guest'], purpose: 'fun', start: 20 * 60, durMin: [70, 100], chance: 0.2, traitChance: { social: 0.7, nightOwl: 0.6 } },
    ],

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
      cafeRelief: 28, // stress removed by a visit to a venue that does not say otherwise
      calmBelow: 35, // below this: calm (blue)
      stressedAbove: 70, // above this: stressed (red); in between: impatient (amber)
      maxedLeaveSec: 14, // stress pinned at 100 this long -> they move out
    },

    // Personality traits. Weight = how common. thresholdMult below 1 means
    // stress builds faster (0.6 = threshold 40% lower, i.e. gain x1.67).
    // jitterMin = schedule wobble; shiftMin = schedule shifted later;
    // reliefMult = how much cafe visits help; crowdMult = bothered by crowds.
    traits: {
      punctual: { label: 'Punctual', desc: 'Always on time, and hates being late.', weight: 30, thresholdMult: 0.85, jitterMin: 4, shiftMin: 0, reliefMult: 1, crowdMult: 1, color: '#3b82c4' },
      impatient: { label: 'Impatient', desc: 'Gets stressed 40% faster. Hates lines.', weight: 20, thresholdMult: 0.6, jitterMin: 35, shiftMin: 0, reliefMult: 1, crowdMult: 1.3, color: '#e8842c' },
      nightOwl: { label: 'Night Owl', desc: 'Arrives and leaves late, which smooths the rush.', weight: 15, thresholdMult: 1.0, jitterMin: 40, shiftMin: 180, reliefMult: 1, crowdMult: 0.9, color: '#7a5bc4' },
      social: { label: 'Social', desc: 'Loves cafes: a visit calms them twice as much.', weight: 20, thresholdMult: 1.0, jitterMin: 30, shiftMin: 0, reliefMult: 2, crowdMult: 0.6, color: '#d6559a' },
      quiet: { label: 'Quiet', desc: 'Minds noise, but not crowds.', weight: 15, thresholdMult: 1.1, jitterMin: 20, shiftMin: 0, reliefMult: 0.7, crowdMult: 0.5, color: '#2e9c8e' },
    },

    // Moving out hurts the tower's reputation (rating tiers in M7 will use it).
    reputation: { start: 50, perMoveOut: -1, perGoodDay: 0.8, goodMoodAbove: 70 },
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

  // --- Rating tiers: the road from empty plot to the Crown ---
  // `requires` is what the NEXT tier asks of you: people, mood, reputation and
  // buildings that must exist. Meet it and an inspector comes to judge your
  // tower; pass and you rise. `unlocks` lists what each tier lets you build,
  // `plot` the room you get, and `peoplePerTenant` how many people each
  // simulated tenant stands for (bigger towers hold bigger households and
  // teams, so 500 simulated tenants can add up to 15,000+ people).
  tiers: [
    {
      id: 'foothold',
      name: 'Foothold',
      plot: { halfWidthCells: 24, maxFloor: 10 },
      peoplePerTenant: 1,
      unlocks: ['lobby', 'office', 'studio', 'apartment', 'cafe', 'stairs', 'elevator'],
    },
    {
      id: 'rising',
      name: 'Rising',
      plot: { halfWidthCells: 28, maxFloor: 20 },
      peoplePerTenant: 3,
      requires: { people: 40, mood: 60, reputation: 0, facilities: [] },
      bonus: { funds: 10000, reputation: 3 },
      unlocks: ['shop', 'restaurant', 'officeLarge', 'guestRoom', 'gym', 'maintenance', 'security', 'parking', 'substation', 'escalator', 'elevatorExpress', 'skylobby'],
    },
    {
      id: 'established',
      name: 'Established',
      plot: { halfWidthCells: 32, maxFloor: 35 },
      peoplePerTenant: 8,
      requires: { people: 250, mood: 65, reputation: 40, facilities: ['security', 'maintenance'] },
      bonus: { funds: 40000, reputation: 4 },
      unlocks: ['coworking', 'clinic', 'recycling', 'suite', 'foodCourt', 'cinema', 'atrium', 'elevatorService'],
    },
    {
      id: 'prestigious',
      name: 'Prestigious',
      plot: { halfWidthCells: 36, maxFloor: 55 },
      peoplePerTenant: 18,
      requires: { people: 1500, mood: 70, reputation: 55, facilities: ['clinic', 'skylobby', 'atrium'] },
      bonus: { funds: 120000, reputation: 5 },
      unlocks: ['penthouse', 'ballroom'],
    },
    {
      id: 'legendary',
      name: 'Legendary',
      plot: { halfWidthCells: 40, maxFloor: 75 },
      peoplePerTenant: 32,
      requires: { people: 6500, mood: 75, reputation: 65, facilities: ['elevatorExpress', 'recycling', 'substation', 'elevatorService'] },
      bonus: { funds: 300000, reputation: 6 },
      unlocks: ['crown'],
    },
  ],

  // The Crown: the landmark that wins the game. Build it high on the roof.
  crown: { minFloor: 30, requiresPeople: 15000 },

  // --- Inspectors and VIP visits ---
  // An inspector walks a tour of your tower. Their stress is judged like a
  // tenant's: long waits, crowds and problems fail the visit.
  inspector: {
    arriveHour: 10, // they arrive the morning after you qualify, after the rush
    tourStops: 4,
    dwellMin: [15, 25], // game minutes at each stop
    trait: 'punctual', // inspectors are fairly picky (see traits)
    stressWeight: 0.8, // how much their peak stress counts against the tower
    passScore: 50, // score = 100 - (peak stress x weight) - penalties; pass at or above this
    incidentPenalty: 12, // per active fire, power dip or pest problem
    dirtyPenalty: 6, // per dirty building they visit
    retryCooldownDays: 3, // wait this long after a failed inspection
    vip: { fundsPerTier: 4000, reputation: 3, failReputation: -2 },
  },

  // --- Random events (always announced, always escapable) ---
  incidents: {
    graceDays: 4, // nothing happens in the first days
    chancePerDay: 0.22,
    minDaysBetween: 2,
    weights: { fire: 3, extortion: 2, outage: 2, pests: 2, vip: 1.5 },
    // Rating tier (0 = Foothold) at which each event may start. The nastier
    // ones wait until you can build what answers them (security, maintenance).
    fromTier: { fire: 0, outage: 0, extortion: 1, pests: 1, vip: 1 },
    fire: {
      growthPerSec: 2.2, // fire grows this fast...
      sprinklerSuppress: 3.0, // ...minus this if the building has sprinklers (puts it out)
      maintenanceSuppress: 1.3, // ...and this per covering maintenance hub (one slows it, two put it out)
      maxMaintenance: 2,
      securitySuppress: 0.2,
      spreadAbove: 45, // a fire this strong may jump to neighbours
      spreadChancePerSec: 0.05,
      sprinklerSpreadMult: 0.2,
      startIntensity: 8,
      gutAt: 100, // at this strength the building is wrecked
      repairShare: 0.2, // repair cost as a share of its build price
      closedDays: 2,
      smokeStressPerSec: 4, // stress for people on a burning floor
      sprinklerCostPerCell: 150,
    },
    extortion: {
      demandShareOfFunds: [0.06, 0.12],
      minDemand: 1500,
      maxDemand: 60000,
      baseChance: 0.25, // chance the security office finds the device
      perSecurity: 0.18, // each security office adds this
      coverageBonus: 0.35, // times the share of buildings with security cover
      maxChance: 0.92,
      damageMult: 1.8, // damage if the device goes off, times the demand
      stressSpike: 20,
      reputationHit: -3,
      successReputation: 2,
    },
    outage: { durationMin: [120, 240], baseFactor: 0.3, surplusBonus: 1.0, maxFactor: 0.85 },
    pests: { needTrashAbove: 65, stressPerSec: 0.4, clearBelow: 40, maxDays: 8 },
  },

  // --- Weather and seasons (a quarter is a season) ---
  weather: {
    seasons: ['Spring', 'Summer', 'Autumn', 'Winter'],
    odds: {
      Spring: { clear: 0.45, cloudy: 0.3, rain: 0.25 },
      Summer: { clear: 0.55, cloudy: 0.15, rain: 0.1, heat: 0.2 },
      Autumn: { clear: 0.35, cloudy: 0.3, rain: 0.35 },
      Winter: { clear: 0.3, cloudy: 0.3, snow: 0.4 },
    },
    kinds: {
      clear: { label: 'Clear' },
      cloudy: { label: 'Cloudy' },
      // Rain: people dislike walking and stairs, so more take the elevator;
      // indoor shops do well; arrivals come in damp and a bit stressed.
      rain: { label: 'Rain', walkCostMult: 1.4, stairCostMult: 1.35, salesMult: 1.15, arrivalStress: 4 },
      // Heat wave: air conditioning drains the grid and the power bill.
      heat: { label: 'Heat wave', powerDemandMult: 1.25, powerPriceMult: 1.8, salesMult: 1.05 },
      // Snow: the street slows everyone down.
      snow: { label: 'Snow', walkSpeedMult: 0.8, arrivalDelayMin: 40, salesMult: 0.9 },
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
    grassColor: '#6fae5b', // thin strip along street level (spring)
    seasonGrass: ['#6fae5b', '#8bb94d', '#c08a3c', '#cfd8dc'], // spring, summer, autumn, winter
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
