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
    dayLengthSeconds: 90, // real seconds for one full game day at 1x speed
    startHour: 6, // the game begins at 6:00 AM on day 1
    daysPerQuarter: 10, // length of one quarter, in game days
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
    version: 1, // bump when the save format changes (see src/sim/save.js)
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
      minFloor: 1,
      rentPerCell: 250,
      upkeepPerCell: 8,
      color: '#3f9d70',
      accent: '#f6f1e7',
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
