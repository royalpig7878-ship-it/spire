// src/ui/ambience.js
//
// Turns "what is happening on screen" into the building's background sound:
// a crowd murmur that grows with the people you can see, elevator whooshes and
// door sounds, keyboards and phones in busy offices, rain, birds by day and
// crickets by night. Zooming in makes it louder, like moving closer.
//
// It only reads the game and tells the audio engine how loud to be. Nothing
// here changes the simulation.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createAmbience(audio, config) {
  let lastTick = 0;
  let nextChatter = 0;
  let nextBird = 0;
  let nextCricket = 0;
  let nextPhone = 0;
  let nextTyping = 0;
  const carStates = new Map(); // car -> last state, to hear doors open and close

  return {
    // Called every frame; does its work about ten times a second.
    tick(game, camera, W, H, nowMs) {
      if (nowMs - lastTick < 100 || !audio.isRunning()) return;
      lastTick = nowMs;
      const now = nowMs / 1000;
      const zoom = camera.zoom;
      const { cellWidth, floorHeight } = config.grid;
      const closeness = clamp((zoom - 0.2) / 1.1, 0.22, 1); // zoomed out = distant and quiet
      const toX = (cell) => (cell * cellWidth - camera.x) * zoom + W / 2;
      const toY = (floor) => (-floor * floorHeight - camera.y) * zoom + H / 2;

      // ---- People you can see ----
      let visible = 0;
      let typists = 0;
      for (const t of game.tenants.list) {
        if (!t.pos || t.mode === 'away') continue;
        const x = toX(t.pos.x);
        const y = toY(t.pos.floor);
        if (x < -20 || x > W + 20 || y < -20 || y > H + 60) continue;
        visible += 1;
        if (t.mode === 'home' && t.kind === 'worker') typists += 1;
      }
      for (const shaft of game.elevators.shafts.values()) {
        for (const [floor, queue] of shaft.waiting) {
          const y = toY(floor);
          if (y > -20 && y < H + 60) visible += queue.length;
        }
      }
      const everyone = game.tenants.stats.population ?? game.tenants.list.length;
      const crowd = clamp(0.62 * Math.sqrt(visible / 12) + 0.28 * Math.sqrt(everyone / 600), 0, 1) * closeness;

      // ---- Elevators ----
      let movingNear = 0;
      let movingAll = 0;
      let speedSum = 0;
      for (const shaft of game.elevators.shafts.values()) {
        const f = shaft.facility;
        const x = toX(f.cell);
        const onScreenX = x > -80 && x < W + 80;
        for (const car of shaft.cars) {
          const speed = Math.abs(car.pos - car.prevPos) * 30; // floors per second
          const y = toY(car.pos);
          const near = onScreenX && y > -40 && y < H + 40;
          if (speed > 0.2) {
            movingAll += 1;
            if (near) {
              movingNear += 1;
              speedSum += speed;
            }
          }
          const before = carStates.get(car);
          if (before !== car.state) {
            carStates.set(car, car.state);
            if (near && zoom >= 0.35) {
              if (car.state === 'opening') audio.playAmbient('doorOpen', 0.12);
              else if (car.state === 'closing') audio.playAmbient('doorClose', 0.12);
            }
          }
        }
      }
      const motor = clamp(movingNear / 2, 0, 1) * closeness + 0.12 * clamp(movingAll / 6, 0, 1);
      const motorPitch = movingNear ? clamp(speedSum / movingNear / 8, 0, 1) : 0.3;

      // ---- Weather and time of day ----
      // Outdoor sounds fade away as you look down into the basement and the dirt.
      const outdoors = clamp(toY(0) / (H * 0.4), 0, 1);
      const kind = game.weather.kind;
      const rain = kind === 'rain' ? 1 : 0;
      const hour = ((game.clock.minutes / 60) % 24 + 24) % 24;
      const day = hour > 6.5 && hour < 18.5;
      const night = hour < 5 || hour > 20;

      audio.setAmbience({ crowd, motor, motorPitch, rain: rain * clamp(0.35 + closeness * 0.65, 0, 1) * outdoors });

      // ---- Little events, at random moments ----
      if (crowd > 0.04 && now > nextChatter) {
        audio.playAmbient('chatter', 0.1);
        nextChatter = now + (1.6 - crowd * 1.3) * (0.5 + Math.random());
      }
      if (zoom >= 0.8 && typists > 0 && now > nextTyping) {
        audio.playAmbient('typing', 0.3);
        nextTyping = now + (4 / Math.sqrt(typists)) * (0.5 + Math.random());
      }
      if (zoom >= 0.8 && typists >= 2 && now > nextPhone) {
        audio.playAmbient('phone', 5);
        nextPhone = now + 14 + Math.random() * 25;
      }
      if (day && !rain && kind !== 'snow' && zoom <= 1.4 && outdoors > 0.5 && now > nextBird) {
        audio.playAmbient('bird', 1);
        nextBird = now + 5 + Math.random() * 10;
      }
      if (night && !rain && zoom <= 1.6 && outdoors > 0.5 && now > nextCricket) {
        audio.playAmbient('cricket', 0.4);
        nextCricket = now + 0.8 + Math.random() * 1.6;
      }
    },
  };
}
