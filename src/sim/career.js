// src/sim/career.js
//
// Remembers which Career scenarios you have beaten, and with which medal.
// It lives in its own localStorage entry (like settings), so starting a new
// game or loading a save never erases your medals.

const KEY = 'spire.career';
const RANK = { bronze: 1, silver: 2, gold: 3 };

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

// { 'first-floors': { medal: 'gold', days: 18 }, ... }
export function careerRecords() {
  return read();
}

// Keeps only the best result. Returns true when this is a new best.
export function recordResult(id, medal, days) {
  const all = read();
  const old = all[id];
  const better = !old || RANK[medal] > RANK[old.medal] || (RANK[medal] === RANK[old.medal] && days < old.days);
  if (better) {
    all[id] = { medal, days };
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      // storage blocked: medals just won't persist
    }
  }
  return better;
}

// Scenario 1 is always open; each next one opens after you beat the one before.
export function isUnlocked(config, index, records = read()) {
  if (index === 0) return true;
  return Boolean(records[config.modes.scenarios[index - 1].id]);
}
