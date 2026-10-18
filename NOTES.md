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

> Tip: if the phone shows an old version of the game, start the server with
> `python tools/serve.py` instead of `python -m http.server 8000`. It tells the
> browser never to keep old copies, so a refresh always shows the latest.

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

- **Varied people** (after M10): nobody follows the same script any more.
  Each person has their own routine: the day is cut into stretches that are
  offset differently for everyone, and in each stretch they pick something
  from a weighted list that depends on the time and the room. Homes: sleep,
  cook, snack, TV, read, phone calls (pacing), nap on the sofa, stretch,
  dance, water the plant, look out of the window. Offices: mostly typing,
  plus phone calls, coffee, chatting at a neighbour's desk, stretching,
  thinking. Shops, gym and ballroom have their own mixes (browse, look,
  reach, pay, lift weights, dance). The code is `personSpot` in
  `src/render/rooms.js`, and the new animations are in `src/render/poses.js`.

- **Stairs fix** (after M10): stairs and escalators now zigzag by the real
  floor number, so ones built one floor at a time alternate just like a
  stairwell built in one go. People climb the drawn steps diagonally, with a
  stepping animation (and stand still on escalators) instead of sliding
  straight up.

- **Recorded sounds** (after M10): the game's building, demolish, money,
  warning and level-up sounds, plus birds and distant street noises, now use
  recordings from the **Ovani Sound "Building Tycoon Sound FX Pack"** that you
  bought (credited on the title screen). The elevator ding, doors, crowd,
  rain, keyboards and the music are still made live by the game. The
  recordings are packed into one small file, `assets/sfx/sfx.wav`, with
  `assets/sfx/sfx.json` listing where each clip starts. `tools/build-sfx.py`
  makes them from the pack (clips trimmed, shrunk to 22 kHz, volume evened
  out). **License note:** Ovani's terms allow using the sounds inside a game
  but not sharing the raw files on their own, so the original WAV files stay
  OUT of this project and the repository, and only this changed, combined
  file ships with the game. If a sound is missing or still loading, the game
  falls back to its built-in synthesized sound.

- **Building ambience** (after M10): the tower now sounds alive. A crowd
  murmur grows with the people on screen (plus soft chatter), elevators
  whoosh while they move and their doors hiss and thunk, offices click with
  keyboards and the odd phone, rain patters, birds sing by day and crickets
  at night. Zoom in and it gets louder; zoom out and it is distant. It is
  all made from filtered noise (no audio files, no low drone) and follows
  the Sound effects bar. Code: `src/ui/ambience.js` (what to play) and the
  ambience section of `src/audio/audio.js` (how it sounds).

- **M10 — Detailed art, cutaway rooms and the Needs tab.**
  **Cutaway** (always on): rooms are drawn like a dollhouse
  cross-section with furniture, and people do little things inside them
  depending on the time of day: workers type at desks and fetch water,
  residents sleep, cook, and watch TV, shoppers browse, diners eat, people
  run on treadmills and watch films. Empty rooms go dark at night. Rooms are
  painted once into small cached pictures, so it is cheap
  (`src/render/rooms.js`, `poses.js`). Cutaway needs zoom of
  at every zoom level. Every room has an interior: offices, homes, hotel
  rooms, shops, cafés, restaurants, cinema, clinic, gym, security,
  maintenance, recycling, substation, garage, the lobby, sky lobby, atrium
  and the Crown's hall, and stairs and escalators stand in a hall of their
  own. (`world.cutawayMinZoom` in `config.js` sets the lowest zoom.)
  **Underground:** basement rooms get an earthy, murkier tint, and the dirt
  gets darker with depth, in layers, with things buried in it: rocks,
  roots, worms, bones, fossils, old pipes, gems, gold, coins, bottles,
  treasure chests (deep down) and a mole that pops up now and then.
  **Sound on iPhone:** the silent switch mutes web audio, so the game plays a
  silent looping clip to count as media. Settings has separate **Sound
  effects** and **Music** volume bars (all the way left is off).
  **Rent is now paid every day** (a sixth of the quarter's rent each midnight,
  by how full each unit was), so money comes in as steadily as bills go out;
  the quarterly report is a summary. **Finances:** tap your funds at the top (or Menu > Finances) any time to
  see this quarter so far, a projection for quarter end, the daily bills by
  kind of building, your best earners, and the last quarters' net.
  **Needs tab** (next to Tools): a ranked list of what your tower needs
  (fires, unreachable rooms, long lifts waits, stressed people, trash, power,
  missing services, empty units, the next rating). A red badge counts the
  urgent ones. Tap a card to fly to the problem, ring it, and switch on the
  helpful layer; build suggestions select that building (`src/sim/needs.js`).
  A new **Rich** art layer (`src/render/detail.js`),
  always on (Settings > Graphics > Saver turns it off for slow phones). Rich adds:
  desks and glowing monitors in offices, curtains, lamps and balcony plants
  in apartments, goods and a neon sign in shops, door plates in hotels,
  vents and hazard stripes on services, a checkered lobby floor and a clock
  over the front door; roof props (air-conditioners, blinking antennas,
  water tanks, dishes, rooftop gardens); street lamps that light up at
  night, trees that change with the seasons and bushes; a warm window halo
  after dark; people with legs, swinging arms, hair and (for workers) a
  briefcase; and elevator cars with a ceiling light, handrail and a floor
  display. Rich switches itself off in battery-saver graphics and when you
  zoom out (below `world.richMinZoom` in `config.js`), so big towers stay
  fast. It also works on top of the colour-blind palette.

- **M9 — Sandbox and Career.** Every visit now opens a **title screen**:
  Continue, Career, Sandbox, Settings. The menu's old "New game" is now
  "Main menu". **Sandbox** is free play with your own rules: money
  (Normal / $1 million / Endless), unlocks (start small / everything
  unlocked at once) and random events on or off. **Career** has five
  scenarios, each with goals and a day limit: First Floors, Lean Times,
  Happy Tower, Reach for the Sky, The Crown. A **Goals** pill shows your
  progress and the days left (tap it for the checklist). You win at the
  midnight every goal is met; finishing in half the limit or less earns
  Gold, within 75% Silver, otherwise Bronze. Each scenario opens after you
  beat the one before. Medals are stored separately from saves
  (`spire.career`), so a new game never erases them. Saves are now version 5
  and remember the mode; old saves load as a Sandbox. Everything tunable is
  in `config.js` under `modes`. Helper scripts: `node tools/modes-check.mjs`
  (each mode starts correctly and loses cleanly) and
  `node tools/bot.mjs <scenario-id>` (a simple scripted player used to check
  the goals are reachable). There is only one save slot: starting a new game
  replaces it (the game asks first).

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
