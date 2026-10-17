// tools/balance-check.mjs - runs the sim with no screen for 20 days and prints how it went.
// Run with:  node tools/balance-check.mjs
import { config } from '../config.js';
import { createGame, updateGame } from '../src/sim/game.js';
import { canPlace, place } from '../src/sim/tower.js';

const game = createGame(config);
const tw = game.tower;
const put = (type, floor, cell, h = 1) => { const ok = canPlace(tw, config, type, floor, cell, h); if (ok === true || ok?.ok) { place(tw, config, type, floor, cell, 0, h); return true; } return false; };
put('stairs', 1, 0); put('stairs', 2, 0);
let placed = 0;
for (const f of [1, 2]) for (const c of [-5, -3, 2, 4]) if (put(f === 1 ? 'office' : 'apartment', f, c)) placed++;
console.log('placed', placed, 'start funds', Math.round(tw.funds));
const t0 = performance.now();
let ticks = 0;
for (let day = 1; day <= 20; day++) {
  for (let i = 0; i < 240 * config.sim.ticksPerSecond; i++) { updateGame(game, config, 1 / config.sim.ticksPerSecond); ticks++; if (game.blocked) { game.events.length = 0; game.blocked = false; } }
  if (day % 5 === 0) console.log(`day ${day}: funds ${Math.round(tw.funds)}, tenants ${game.tenants.list.length}, people ${tw.people}`);
}
console.log('avg ms per tick', ((performance.now() - t0) / ticks).toFixed(4));
console.log('clock', game.clock.minutes, 'speed', game.speed, 'blocked', game.blocked);
