# SPIRE — Project Notes

## What this is

SPIRE is a vertical tower-management game, built as a plain HTML/CSS/JS
web app (no frameworks), playable in a mobile browser and installable as
a PWA (Progressive Web App — a website that can act like an app: full
screen, home-screen icon, offline play).

## How to run the game (on this computer)

1. Open a terminal in the `spire` folder.
2. Run:
   ```
   python -m http.server 8000
   ```
3. Open `http://localhost:8000` in a browser on this computer.

Claude can also start this for you — just ask.

## How to view it on your phone

1. Make sure your phone is on the **same Wi-Fi network** as this computer.
2. On your phone's browser, go to: `http://192.168.1.243:8000`
   (This is this computer's current address on your home network — if it
   ever stops working, your computer's IP may have changed; ask Claude to
   look it up again with `ipconfig`.)
3. You should see a blue-to-light-blue sky over a dark green "ground".
   Drag with one finger to pan around; pinch with two fingers to zoom;
   double-tap to zoom in on a spot.

After each milestone, just **refresh the page** on your phone to see the
update — no reinstalling or redeploying needed, as long as the server on
this computer is still running.

**Note:** this local-network link does not use HTTPS (a secure
connection), so some PWA features (installing to your home screen,
playing offline) won't work yet through this link. We'll move to free
HTTPS hosting (GitHub Pages, using your GitHub Desktop app) once those
features are actually built, later in the project.

## Git basics (your "undo" safety net)

Git saves snapshots ("commits") of the project as we go, so we can always
go back to a previous working version if something breaks. You only need
three commands:

- **See the history of snapshots:**
  ```
  git log --oneline
  ```
- **Go back to a previous milestone** (e.g. after Milestone 3):
  ```
  git checkout m3-complete
  ```
- **Go back to the very latest version** (after looking at an old one):
  ```
  git checkout main
  ```

Claude will make a commit and tag (like `m0-complete`) after each
milestone, once you've confirmed it works — never before.

## Project structure

- `index.html` — the page that loads the game
- `config.js` — every tunable number in the game (costs, speeds,
  thresholds), with comments. This is the first place to look to change
  game balance.
- `catalog.js` — the list of buildings (prices, sizes, rents, effects).
  Part of the configuration; `config.js` imports it.
- `src/sim/` — simulation logic (the game loop, later: tenants,
  elevators, economy). No drawing code lives here.
- `src/render/` — canvas drawing code. No game logic lives here.
- `src/ui/` — touch/mouse input, and later: build toolbar, HUD, overlays.
- `src/data/` — data definitions (later: facility catalog, tenant
  traits).

## Milestone log

- **M8 — Polish and juice.** Tap any person to open a **story card**
  (name, job, what they are doing, mood, trait) and "Follow" to make the
  camera track them. Ambient life: clouds, birds, street traffic. Sound
  effects and a gentle music loop are made live with Web Audio (no audio
  files). Vibration feedback on phones. A 10-step **tutorial** (replay it
  from Settings). **Settings** screen: text size, sound, music, volume,
  vibration, color-blind colors, graphics (Auto / High / Saver), FPS
  readout. Floating "+$" pops, dust and debris particles, and a funds
  "hop". Auto battery-saver when frames run slow. The game is now an
  installable **PWA** (`manifest.json`, `sw.js`, icons made by
  `node tools/make-icons.mjs`). `node tools/balance-check.mjs` runs a
  headless 20-day sim.

  **Putting it online (needed for "install to home screen" + offline):**
  browsers only allow service workers over HTTPS, so the local
  `http://192.168...` address will not offer install. GitHub Pages gives
  free HTTPS:
  1. In GitHub Desktop: File > Add local repository > pick the spire
     folder, then **Publish repository** (public is required for free Pages).
  2. On github.com open the repo > Settings > Pages > Source: "Deploy from
     a branch", Branch: `main`, folder `/ (root)`, Save.
  3. After a minute it is live at `https://<your-username>.github.io/spire/`.
  4. On the phone open that address. iPhone: Share > Add to Home Screen.
     Android: menu > Install app.
  Each time you commit and push, the live copy updates (the phone fetches
  the new files the second time you open it).

- **M7 — Ratings, events, weather: the full game loop.** Five tiers
  (Foothold, Rising, Established, Prestigious, Legendary, shown as stars).
  Tap the stars for the progress checklist. Meet a tier's goals and an
  **inspector** tours your tower the next morning; pass and you rise (bonus
  money, bigger plot, new buildings, a ceremony). Buildings are locked
  until their tier. Random events: **fire** (sprinklers and maintenance put
  it out; elevators skip burning floors), **pests**, **power dips**,
  **extortion** (pay or trust security) and **VIP visits**; each is
  announced with a "Show" button. **Weather and seasons**: rain, heat
  waves, snow. **The Crown** (Special tab, Legendary only, needs 15,000
  people) wins the game. Everything about tiers, events and weather is in
  `config.js` (`tiers`, `inspector`, `incidents`, `weather`, `crown`).
  Save format is now version 4.

- **M6 — Full catalog and districts**: 29 building types (see
  `catalog.js`, which `config.js` imports): offices, studios and
  penthouses, hotel rooms and a ballroom, restaurants, shops, food courts,
  cinemas, a clinic, security, maintenance, recycling, power, parking, a
  gym, escalators, a staff-only service elevator, and the atrium. You can
  now build **basements** (floors -1 and -2). Services have real effects:
  coverage makes homes more attractive, maintenance cleans trash,
  recycling cuts it, substations feed the power grid (a shortage slows the
  elevators), garages hold workers' cars, and stressed tenants walk to the
  clinic. Noise and trash stress tenants at home. **Districts** tab: theme a
  band of floors (Business, Leisure, Residential, Wellness) for synergy
  bonuses. Four more overlays: Security, Medical, Maintenance, Noise.
  Save format is now version 3.

- **M5 — Diagnostics**: the **Layer** button cycles heat-map overlays
  (Stress, Wait, Occupancy, Income). Every tile shows its number, and a
  legend explains the colors. **Tap** an elevator stop to see its line and
  wait times; **hold a finger** on any building for its info panel. An
  elevator's panel lets you buy or sell cars and switch floors on or off.
  New buildings: **Express elevator** (fast, stops only at the lobby and
  sky lobbies) and **Sky lobby** (a transfer hall; shafts can start or run
  through it). Shaft prices, car costs and overlay colors are in
  `config.js`.

- **M4 — Tenants**: offices and apartments fill with people who move in
  hour by hour, follow daily routines (workers 8-5 with lunch, residents
  out by day and home at night), and plan routes (stairs for 1-2 floors,
  elevators for more, choosing by the live line length). They get stressed
  waiting, in crowds and on long walks, calm down at home or at a cafe,
  and move out if stress stays maxed. Five personality traits (see
  `tenants.traits` in `config.js`) change their schedule and tolerance.
  Rent now depends on how full each building is; cafes earn per visit.
  Save format is now version 2 (older saves still load).

- **M3 — Vertical transport**: stairwells and local elevators (drag up or
  down to choose how many floors), elevator cars with sliding doors,
  call buttons, queues, riders, and dispatch (the algorithm is explained
  in the big comment at the top of `src/sim/elevators.js`). Buildings
  must now connect to the lobby, and anything the player cannot reach
  shows a warning triangle and pays no rent. Tap a shaft to send a rider;
  the Tools tab has a "Demo riders" switch for random traffic. Elevator
  numbers are in `config.js` under `elevators`.

- **M2 — Time and economy**: game clock (pause/1x/2x/4x), day/night sky
  with sun, moon, stars and lit windows, daily upkeep, quarterly rent with
  a report screen, soft-fail debt warning and fire sale, autosave every
  game day plus a menu with Save / Load / New game. Game days, quarter
  length and all prices are in `config.js` (`time` and `economy`).

- **M1 — Grid and building**: cell/floor grid, lobby, build toolbar with
  category tabs, ghost-preview placement (check mark = allowed, hatched
  cross = blocked, with the reason), funds, three vector buildings
  (office, apartment, café), lobby wings, demolish tool with 50% refund.

- **M0 — Project skeleton**: fixed-timestep game loop, full-screen
  canvas with resize/orientation handling, pan & pinch-zoom touch input,
  placeholder sky and ground. Git initialized, local-network phone
  testing set up.
