// src/ui/tutorial.js
//
// A gentle, step-by-step introduction for new players. A card at the top says
// what to do next and a button in the toolbar pulses to show where to tap.
// Most steps finish by themselves when you actually do the thing (build the
// stairs, build an office...), so you learn by playing. "Skip" is always there.

import { settings, updateSetting } from './settings.js';

// Finds a toolbar tab, item or HUD button to pulse.
const byText = (selector, text) => () => [...document.querySelectorAll(selector)].find((el) => el.textContent.includes(text));
const byId = (id) => () => document.getElementById(id);

const has = (game, type, connected = false) =>
  Array.from(game.tower.facilities.values()).some((f) => f.type === type);

// Each step: text, optional `pulse` (which element to highlight), `done`
// (is it finished?), or `button` (a "Next" button instead).
const STEPS = [
  {
    text: 'Welcome to SPIRE! You run a tower. Drag with a finger to look around and pinch to zoom. Build homes and offices, keep people happy, and climb the ratings.',
    button: 'Show me how',
  },
  {
    text: 'People need a way up from the lobby. Open the Transport tab and pick Stairwell, then press on the floor above the lobby and let go.',
    pulse: (g, ui) => (ui.tool.typeId === 'stairs' ? null : byText('#tabs .tab', 'Transport')() ?? null),
    done: (g) => has(g, 'stairs'),
  },
  {
    text: 'Now the Work tab: pick Small office and drop it on floor 1 right next to your stairs. Green with a check mark means it is allowed.',
    pulse: byText('#tabs .tab', 'Work'),
    done: (g) => has(g, 'office'),
  },
  {
    text: 'Offices need neighbours who live nearby. Open Living, choose Apartment, and build one beside the office.',
    pulse: byText('#tabs .tab', 'Living'),
    done: (g) => has(g, 'apartment'),
  },
  {
    text: 'Tap 2x or 4x to speed up time. Tenants will start moving in over the next game hours. Rent arrives every day, and the bills go out every day.',
    pulse: byText('.speed-btn', '4x'),
    done: (g) => g.tenants.list.length > 0,
  },
  {
    text: 'Taller towers need elevators. Pick Local elevator in Transport, press in the lobby and drag UP to choose how many floors it serves.',
    pulse: byText('#tabs .tab', 'Transport'),
    done: (g) => has(g, 'elevator'),
  },
  {
    text: 'Tap the stars at the top to see what your next rating needs. Meet the goals and an inspector will visit.',
    pulse: byId('hud-height'),
    done: (g, ui) => ui.sawProgress,
  },
  {
    text: 'Hold a finger on any building for its details. On an elevator you can buy more cars and choose which floors it stops at.',
    done: (g, ui) => ui.selectedId !== null,
  },
  {
    text: 'Open Layers and pick Stress to see where people are unhappy. This is your main tool for fixing traffic jams.',
    pulse: byId('hud-overlay'),
    done: (g, ui) => ui.overlay !== 'off',
  },
  {
    text: 'You are ready! Tap a person any time to read their story. Menu has Settings and this tutorial again. Good luck, builder!',
    button: "Let's go",
    finish: true,
  },
];

export function createTutorial(root, getContext) {
  const card = document.createElement('div');
  card.className = 'tutorial';
  card.hidden = true;
  root.appendChild(card);

  let index = -1;
  let pulsing = null;

  function stop(markDone) {
    index = -1;
    card.hidden = true;
    if (pulsing) pulsing.classList.remove('tutorial-pulse');
    pulsing = null;
    if (markDone) updateSetting('tutorialDone', true);
  }

  function render() {
    const step = STEPS[index];
    card.hidden = false;
    card.innerHTML = `
      <div class="tutorial-count">Step ${index + 1} of ${STEPS.length}</div>
      <div class="tutorial-text">${step.text}</div>
      <div class="tutorial-actions">
        <button class="secondary" type="button" id="tut-skip">Skip tutorial</button>
        ${step.button ? `<button class="primary" type="button" id="tut-next">${step.button}</button>` : ''}
      </div>`;
    card.querySelector('#tut-skip').addEventListener('click', () => stop(true));
    const next = card.querySelector('#tut-next');
    if (next) next.addEventListener('click', () => advance());
  }

  function advance() {
    if (STEPS[index]?.finish) {
      stop(true);
      return;
    }
    index += 1;
    if (index >= STEPS.length) stop(true);
    else render();
  }

  return {
    start() {
      index = 0;
      render();
    },
    isRunning: () => index >= 0,
    // Called every frame: finish steps the player completed, keep the pulse on the right button.
    tick() {
      if (index < 0) return;
      const { game, ui } = getContext();
      const step = STEPS[index];
      if (step.done && step.done(game, ui)) {
        advance();
        return;
      }
      const target = step.pulse ? step.pulse(game, ui) : null;
      if (target !== pulsing) {
        if (pulsing) pulsing.classList.remove('tutorial-pulse');
        pulsing = target ?? null;
      }
      if (pulsing && !pulsing.classList.contains('tutorial-pulse')) pulsing.classList.add('tutorial-pulse');
    },
    shouldAutoStart: () => !settings.tutorialDone,
  };
}
