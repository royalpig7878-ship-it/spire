// tools/showcase.js - for testing in the browser only (not part of the game).
//
// Builds a varied demo tower in Sandbox, runs the simulation to a chosen time
// of day and frames it. In the browser console (or a test script):
//
//   const { showcase } = await import('/tools/showcase.js');
//   await showcase({ hour: 19.5, zoom: 1.45 });

export async function showcase({ hour = 17.5, zoom = 1.45, y = -170 } = {}) {
  const { game, config, camera, title } = window.spire;
  title.hide();
  const T = await import('/src/sim/tower.js');
  const G = await import('/src/sim/game.js');
  const tw = game.tower;
  T.setTier(tw, config, 4);
  game.mode = { kind: 'sandbox', sandbox: { money: 'endless', tier: 'max', events: 'off' } };
  for (const f of [...tw.facilities.values()]) if (!f.locked) T.demolish(tw, config, f, 1);
  const put = (t, f, c, h = 1) => {
    const k = T.canPlace(tw, config, t, f, c, h);
    if (k.ok) T.place(tw, config, t, f, c, 0, h);
  };
  const w = (t) => config.facilities[t].width;
  put('elevator', 0, 0, 10);
  const left = ['officeLarge', 'cinema', 'restaurant', 'clinic', 'gym', 'apartment', 'apartment'];
  const right = ['office', 'cafe', 'suite', 'shop', 'apartment', 'guestRoom', 'apartment'];
  left.forEach((t, i) => put(t, i + 1, -w(t)));
  right.forEach((t, i) => put(t, i + 1, 2));
  game.speed = 4;
  const step = (days) => {
    const ticks = Math.round((30 * 240 * days) / Math.max(1, game.speed)); // a day is 240 s at 1x
    for (let i = 0; i < ticks; i++) G.updateGame(game, config, 1 / 30);
    game.events.length = 0;
    game.blocked = false;
  };
  step(6); // let people move in
  // jump to just before the chosen hour and let the day play out to it
  const day = Math.floor(game.clock.minutes / 1440) + 1;
  game.clock.minutes = day * 1440 + (hour - 1.5) * 60;
  step(1.5 / 24);
  game.speed = 0;
  camera.x = 10;
  camera.y = y;
  camera.zoom = zoom;
  return { hour: (game.clock.minutes / 60) % 24, rooms: tw.facilities.size, tenants: game.tenants.list.length };
}
