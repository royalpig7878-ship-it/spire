// tools/bot.mjs - a simple scripted player used to test whether scenarios are winnable.
// Run with:  node tools/bot.mjs [scenario-id] [days]
// It builds an elevator and fills floors with offices and apartments as money allows,
// adds a few services after rating-ups, and dismisses report pop-ups like a player would.
import { config } from '../config.js';
import { createGame, updateGame } from '../src/sim/game.js';
import { canPlace, place, priceFor, tallestFloor } from '../src/sim/tower.js';
import { scenarioStatus } from '../src/sim/modes.js';
import { peopleCount } from '../src/sim/progress.js';
import { occupancyOf } from '../src/sim/tenants.js';
import { dailyUpkeep } from '../src/sim/economy.js';

const id = process.argv[2] ?? 'first-floors';
const maxDays = Number(process.argv[3] ?? 0);
const game = createGame(config, { kind: 'career', scenario: id });
const tw = game.tower;
const TICK = 1 / config.sim.ticksPerSecond;
game.speed = 4;

const tryPlace = (type, floor, cell, h = 1) => {
  const cost = priceFor(config, type, h);
  if (tw.funds < cost + 500) return false;
  const check = canPlace(tw, config, type, floor, cell, h);
  if (!check.ok) return false;
  place(tw, config, type, floor, cell, game.clock.minutes, h);
  return true;
};

const ROW = [['office', -6], ['apartment', -2], ['apartment', 1]]; // 4+3+3 = 10 cells per floor
let shaftTop = -1;
// Occupancy of what we already built (0..1); the bot only expands when units are mostly full.
function fullness() {
  const rentable = [...tw.facilities.values()].filter((f) => ['office', 'apartment', 'studio'].includes(f.type));
  if (!rentable.length) return 1;
  return rentable.reduce((s, f) => s + Math.min(1, occupancyOf(game, config, f)), 0) / rentable.length;
}
function step() {
  const reserve = dailyUpkeep(tw, config) * 10;
  if (tw.funds < reserve + 3000 || fullness() < 0.7) return;
  // elevator up to the current tallest floor + 4 (re-place taller when needed isn't possible, so build tall early)
  if (shaftTop < 0) { for (const h of [7, 5, 3]) if (tryPlace('stairs', 0, 4, h)) { shaftTop = h - 1; break; } return; }
  const maxFloor = Math.min(tw.plot.maxFloor, shaftTop);
  for (let floor = 1; floor <= maxFloor; floor++) {
    for (const [type, cell] of ROW) if (tryPlace(type, floor, cell)) return;
  }
  // this shaft's floors are full: stack another flight of stairs on top (cheap) while stairs are enough
  if (tw.tier === 0 && shaftTop < tw.plot.maxFloor) { const c = canPlace(tw, config, 'stairs', shaftTop, 4, 3); if (process.env.DBG) console.log('stack?', shaftTop, c.reason, tw.funds);  }
  // everything on this shaft is full: services as money allows
  for (const [type, floor, cell] of [['maintenance', -1, -6], ['security', -1, -3], ['cafe', 1, 6]]) {
    if (![...tw.facilities.values()].some((f) => f.type === type) && tryPlace(type, floor, cell)) return;
  }
}

let lastDay = -1;
const totalTicks = (maxDays || config.modes.scenarios.find((s) => s.id === id).days + 5) * config.time.dayLengthSeconds * config.sim.ticksPerSecond;
for (let i = 0; i < totalTicks; i++) {
  updateGame(game, config, TICK);
  if (i % 60 === 0) step();
  for (const e of game.events) {
    if (e.type === 'scenarioWon' || e.type === 'scenarioLost') { console.log('RESULT', e.type, 'day', e.days, e.medal ?? ''); process.exit(0); }
    if (e.type === 'quarterReport') console.log('  quarter', e.report.quarter, 'income', e.report.income, 'sales', e.report.sales, 'upkeep', e.report.upkeep, 'net', e.report.net);
    if (e.type === 'tierUp') console.log('  tier up ->', e.name, 'on day', Math.floor(game.clock.minutes / 1440));
  }
  game.events.length = 0;
  game.blocked = false;
  const day = Math.floor(game.clock.minutes / 1440);
  if (day !== lastDay && day % 5 === 0) {
    lastDay = day;
    const s = scenarioStatus(game, config);
    const fac = [...tw.facilities.values()]; const cnt = {}; for (const f of fac) cnt[f.type] = (cnt[f.type] ?? 0) + 1;
    console.log(JSON.stringify(cnt), "moveOuts", game.tenants.stats.moveOuts, "rep", Math.round(game.tenants.stats.reputation), "tenants", game.tenants.list.length);
    console.log(`day ${day}: funds ${Math.round(tw.funds)} people ${peopleCount(game, config)} mood ${Math.round(game.tenants.stats.mood)} tier ${tw.tier} top ${tallestFloor(tw)} | ${s.goals.map((g) => `${g.label} ${g.have}/${g.need}`).join(', ')}`);
  }
}
console.log('no result');
