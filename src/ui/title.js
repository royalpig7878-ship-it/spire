// src/ui/title.js
//
// The title screen: Continue, Career (five scenarios), Sandbox (free play
// with your own rules) and Settings. It sits on top of the game, which is
// paused while it is open. It only reports what the player chose; main.js
// does the starting.

import { formatMoney } from '../data/format.js';
import { careerRecords, isUnlocked } from '../sim/career.js';

const MEDAL = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };

// Short text for one goal, e.g. "People 40" or "Funds $35,000".
function goalText(config, goal) {
  const label = config.modes.goalLabels[goal.kind] ?? goal.kind;
  if (goal.kind === 'crown') return label;
  const value = goal.kind === 'funds' ? formatMoney(goal.value) : goal.kind === 'mood' ? `${goal.value}%` : goal.value.toLocaleString('en-US');
  return `${label} ${value}`;
}

export function createTitle(root, config, handlers) {
  const screen = document.createElement('div');
  screen.className = 'title-screen';
  screen.hidden = true;
  root.appendChild(screen);
  let view = 'main';
  let sandbox = { ...handlers.getSandboxChoice() };

  const seg = (key, label, options) =>
    `<div class="setting"><span>${label}</span><div class="seg" data-key="${key}">${options
      .map((o) => `<button type="button" data-v="${o.id}" class="${sandbox[key] === o.id ? 'on' : ''}">${o.label}</button>`)
      .join('')}</div></div>`;

  function render() {
    if (view === 'main') {
      const cont = handlers.continueSummary();
      screen.innerHTML = `
        <div class="title-card">
          <div class="logo">SPIRE</div>
          <div class="tagline">Build the sky, one floor at a time.</div>
          ${cont ? `<button class="primary hero" data-act="continue">Continue<small>${cont}</small></button>` : ''}
          <button class="${cont ? 'choice' : 'primary hero'}" data-act="career"><span>Career<small>Five scenarios with goals and medals</small></span></button>
          <button class="choice" data-act="sandbox"><span>Sandbox<small>Free play, your rules</small></span></button>
          <button class="choice" data-act="settings"><span>Settings and help</span></button>
          <div class="credit">Sound effects by Ovani Sound</div>
        </div>`;
    } else if (view === 'career') {
      const records = careerRecords();
      const cards = config.modes.scenarios
        .map((s, i) => {
          const open = isUnlocked(config, i, records);
          const rec = records[s.id];
          const goals = s.goals.map((g) => goalText(config, g)).join(' · ');
          const prev = config.modes.scenarios[i - 1]?.name;
          return `<button class="scenario ${open ? '' : 'locked'}" type="button" data-scenario="${s.id}" ${open ? '' : 'disabled'}>
            <span class="sc-top"><b>${i + 1}. ${s.name}</b>${rec ? `<span class="medal ${rec.medal}">${MEDAL[rec.medal]}</span>` : ''}</span>
            <span class="sc-blurb">${open ? s.blurb : `Beat "${prev}" to unlock.`}</span>
            <span class="sc-goals">${open ? `Goals: ${goals}<br>Within ${s.days} days · start with ${formatMoney(s.startFunds)}${rec ? ` · best ${rec.days} days` : ''}` : ''}</span>
          </button>`;
        })
        .join('');
      screen.innerHTML = `<div class="title-card wide">
        <h2>Career</h2>
        <div class="scenario-list">${cards}</div>
        <button class="secondary" data-act="back">Back</button>
      </div>`;
    } else {
      const sb = config.modes.sandbox;
      screen.innerHTML = `<div class="title-card">
        <h2>Sandbox</h2>
        <p class="note">Free play. No goals and no time limit.</p>
        ${seg('money', 'Money', sb.money)}
        ${seg('tier', 'Unlocks', sb.tier)}
        ${seg('events', 'Random events', sb.events)}
        <button class="primary hero" data-act="start-sandbox">Start building</button>
        <button class="secondary" data-act="back">Back</button>
      </div>`;
    }
  }

  screen.addEventListener('click', (event) => {
    const segBtn = event.target.closest('.seg button');
    if (segBtn) {
      sandbox[segBtn.parentElement.dataset.key] = segBtn.dataset.v;
      handlers.saveSandboxChoice(sandbox);
      render();
      return;
    }
    const card = event.target.closest('[data-scenario]');
    if (card) {
      handlers.onStart({ kind: 'career', scenario: card.dataset.scenario });
      return;
    }
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'continue') handlers.onContinue();
    else if (act === 'career' || act === 'sandbox' || act === 'back') {
      view = act === 'back' ? 'main' : act;
      render();
    } else if (act === 'settings') handlers.onSettings();
    else if (act === 'start-sandbox') handlers.onStart({ kind: 'sandbox', sandbox: { ...sandbox } });
  });

  return {
    show(startView = 'main') {
      view = startView;
      sandbox = { ...handlers.getSandboxChoice() };
      render();
      screen.hidden = false;
    },
    hide() {
      screen.hidden = true;
    },
    isOpen: () => !screen.hidden,
  };
}
