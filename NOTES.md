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
- `src/sim/` — simulation logic (the game loop, later: tenants,
  elevators, economy). No drawing code lives here.
- `src/render/` — canvas drawing code. No game logic lives here.
- `src/ui/` — touch/mouse input, and later: build toolbar, HUD, overlays.
- `src/data/` — data definitions (later: facility catalog, tenant
  traits).

## Milestone log

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
