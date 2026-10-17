// tools/modes-check.mjs - quick headless checks for sandbox and career modes.
// Run with:  node tools/modes-check.mjs
import { config } from '../config.js';
import { createGame, updateGame } from '../src/sim/game.js';
import { scenarioStatus } from '../src/sim/modes.js';
import { serializeTower } from '../src/sim/tower.js';

const TICK = 1 / config.sim.ticksPerSecond;
const run = (game, days) => {
  for (let i = 0; i < days * config.time.dayLengthSeconds * config.sim.ticksPerSecond; i++) {
    updateGame(game, config, TICK);
    if (game.blocked && !game.events.some((e) => e.type.startsWith('scenario'))) { game.events.length = 0; game.blocked = false; }
    if (game.events.some((e) => e.type.startsWith('scenario'))) return game.events.filter((e) => e.type.startsWith('scenario'));
    game.events.length = 0;
  }
  return [];
};

// Sandbox variations
for (const [money, tier] of [['standard', 'normal'], ['rich', 'normal'], ['endless', 'max']]) {
  const g = createGame(config, { kind: 'sandbox', sandbox: { money, tier, events: 'off' } });
  console.log('sandbox', money, tier, '-> funds', g.tower.funds, 'tier', g.tower.tier, 'maxFloor', g.tower.plot.maxFloor);
}
// Each scenario starts as described and runs idle until the limit (must lose cleanly)
for (const spec of config.modes.scenarios) {
  const g = createGame(config, { kind: 'career', scenario: spec.id });
  const s0 = scenarioStatus(g, config);
  g.speed = 4;
  const result = run(g, spec.days + 2);
  console.log(spec.id.padEnd(18), 'funds', Math.round(g.tower.funds), 'tier', g.tower.tier, 'goals', s0.goals.map((x) => `${x.label} ${x.have}/${x.need}`).join(', '), '=>', result.map((e) => e.type + '@day' + e.days).join(',') || 'no result');
}
