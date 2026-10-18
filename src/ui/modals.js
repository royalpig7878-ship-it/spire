// src/ui/modals.js
//
// Pop-up cards that sit on top of the game: the quarterly report, the
// fire-sale offer (soft-fail), and the menu (save / load / new game).
// Only one is open at a time.

import { formatMoney } from '../data/format.js';

const COIN_ICON =
  '<svg class="coin" viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="10" fill="#ffd166" stroke="#c98f12" stroke-width="2"/><text x="12" y="17" text-anchor="middle" font-size="14" font-weight="700" fill="#8a5a00">$</text></svg>';

// Falling paper pieces for the celebration cards (pure CSS animation).
function confettiHtml(count = 36) {
  const colors = ['#ffd166', '#ef476f', '#06d6a0', '#118ab2', '#f78c6b', '#c77dff'];
  let html = '';
  for (let i = 0; i < count; i++) {
    const left = Math.round(Math.random() * 100);
    const delay = (Math.random() * 1.2).toFixed(2);
    const dur = (2 + Math.random() * 2).toFixed(2);
    const color = colors[i % colors.length];
    html += `<i style="left:${left}%;background:${color};animation-delay:${delay}s;animation-duration:${dur}s"></i>`;
  }
  return html;
}

export function createModals(root) {
  let backdrop = null;

  function close() {
    if (backdrop) backdrop.remove();
    backdrop = null;
  }

  // Opens a card. `dismissOnBackdrop` lets a tap outside close it (menu only).
  function open(html, dismissOnBackdrop = false) {
    close();
    backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<div class="card" role="dialog" aria-modal="true">${html}</div>`;
    if (dismissOnBackdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) close();
      });
    }
    root.appendChild(backdrop);
    return backdrop.querySelector('.card');
  }

  // Animates a number counting up (the "ka-ching" moment).
  function countUp(el, target, ms = 900) {
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - t) * (1 - t);
      el.textContent = formatMoney(target * eased);
      if (t < 1 && el.isConnected) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  return {
    isOpen: () => backdrop !== null,
    close,

    showReport(report, onCollect) {
      const rows = report.rows.length
        ? report.rows
            .map(
              (r) =>
                `<div class="row"><span>${r.name} x${r.count} <span class="muted-inline">${r.percent}% full</span></span><span>+${formatMoney(r.rent)}</span></div>`,
            )
            .join('')
        : '<div class="row muted"><span>No rent this quarter</span><span>$0</span></div>';
      const salesRow = report.sales
        ? `<div class="row"><span>Sales and fees</span><span>+${formatMoney(report.sales)}</span></div>`
        : '';
      const leftRow = report.moveOuts
        ? `<div class="row muted"><span>Tenants moved out so far</span><span>${report.moveOuts}</span></div>`
        : '';
      const positive = report.net >= 0;
      const card = open(`
        <h2>${COIN_ICON} Quarter ${report.quarter}, Year ${report.year}</h2>
        <div class="section-label">Rent collected</div>
        ${rows}
        <div class="row total"><span>Rent income</span><span>+${formatMoney(report.income)}</span></div>
        ${salesRow}
        <div class="row"><span>Upkeep paid</span><span>-${formatMoney(report.upkeep)}</span></div>
        ${leftRow}
        <div class="net ${positive ? 'gain' : 'loss'}">
          <span class="net-label">${positive ? '&#9650; Profit' : '&#9660; Loss'}</span>
          <span class="net-value" id="net-value">$0</span>
        </div>
        <div class="row"><span>Funds now</span><span>${formatMoney(report.fundsAfter)}</span></div>
        <button class="primary" id="modal-ok" type="button">Collect</button>`);
      countUp(card.querySelector('#net-value'), report.net);
      card.querySelector('#modal-ok').addEventListener('click', () => {
        close();
        onCollect();
      });
    },

    // offers: [{ facility, name, value }]; funds: current (negative) balance
    showFireSale({ funds, offers, onSell, onDecline }) {
      const buttons = offers.length
        ? offers
            .map(
              (o, i) =>
                `<button class="choice" data-i="${i}" type="button"><span>Sell ${o.name}</span><span>+${formatMoney(o.value)}</span></button>`,
            )
            .join('')
        : '<div class="row muted"><span>Nothing left that can be sold.</span></div>';
      const card = open(`
        <h2>Fire sale</h2>
        <p>You owe ${formatMoney(-funds)}. Sell something to the bank at a discount to get back above $0, or keep trying for a few more days.</p>
        ${buttons}
        <button class="secondary" id="modal-decline" type="button">Keep trying</button>`);
      card.querySelectorAll('.choice').forEach((b) =>
        b.addEventListener('click', () => onSell(offers[Number(b.dataset.i)])),
      );
      card.querySelector('#modal-decline').addEventListener('click', () => {
        close();
        onDecline();
      });
    },

    // ---- Rating, inspections and random-event pop-ups ----

    // The celebration when the tower rises a tier.
    showTierUp(ev, onDone) {
      const stars = '&#9733;'.repeat(ev.tier + 1);
      const card = open(`
        <div class="confetti" aria-hidden="true">${confettiHtml()}</div>
        <h2 class="center big">${stars}</h2>
        <h2 class="center">You are now ${ev.name}!</h2>
        <p class="center">The inspector approved (score ${ev.score}).</p>
        <div class="row"><span>Bonus</span><span>+${formatMoney(ev.bonusFunds)}</span></div>
        <div class="row"><span>Build limit</span><span>${ev.maxFloor} floors, ${ev.width} cells wide</span></div>
        <div class="section-label">Now you can build</div>
        <p class="unlock-list">${ev.unlocks.join(' · ')}</p>
        <button class="primary" id="modal-ok" type="button">Wonderful</button>`);
      card.querySelector('#modal-ok').addEventListener('click', () => {
        close();
        onDone();
      });
    },

    showInspectionResult(ev, onDone) {
      const card = open(`
        <h2>Inspection failed</h2>
        <p>Score ${ev.score}. The inspector needs ${ev.need} to approve.</p>
        <ul class="notes">${ev.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
        <p>They will come back in ${ev.retryDays} days. Fix what went wrong first.</p>
        <button class="primary" id="modal-ok" type="button">OK</button>`);
      card.querySelector('#modal-ok').addEventListener('click', () => {
        close();
        onDone();
      });
    },

    showVipResult(ev, onDone) {
      const card = open(`
        <h2>${ev.pass ? 'The VIP was delighted' : 'The VIP left unimpressed'}</h2>
        <p>Score ${ev.score}. ${ev.pass ? `Reward: ${formatMoney(ev.reward)} and a better reputation.` : 'Your reputation took a small hit.'}</p>
        <ul class="notes">${ev.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
        <button class="primary" id="modal-ok" type="button">OK</button>`);
      card.querySelector('#modal-ok').addEventListener('click', () => {
        close();
        onDone();
      });
    },

    showExtortion(ev, { onPay, onTrust }) {
      const card = open(`
        <h2>Anonymous threat</h2>
        <p>"Pay ${formatMoney(ev.demand)} or something in your tower will go off."</p>
        <button class="choice" id="ext-pay" type="button"><span>Pay up</span><span>-${formatMoney(ev.demand)}</span></button>
        <button class="choice" id="ext-trust" type="button"><span>Trust security</span><span>${Math.round(ev.chance * 100)}% to find it</span></button>
        <p class="note">${ev.share > 0 ? `Security covers ${Math.round(ev.share * 100)}% of your buildings, which also softens damage if it fails.` : 'You have no security cover, so a failure would hurt badly.'}</p>`);
      card.querySelector('#ext-pay').addEventListener('click', () => {
        close();
        onPay();
      });
      card.querySelector('#ext-trust').addEventListener('click', () => {
        close();
        onTrust();
      });
    },

    showVictory(ev, onDone) {
      const card = open(`
        <div class="confetti" aria-hidden="true">${confettiHtml(60)}</div>
        <h2 class="center big">&#9733;&#9733;&#9733;&#9733;&#9733;</h2>
        <h2 class="center">The Crown shines over the city</h2>
        <p class="center">${ev.people.toLocaleString('en-US')} people call your tower home. You built a legend.</p>
        <button class="primary" id="modal-ok" type="button">Keep playing</button>`);
      card.querySelector('#modal-ok').addEventListener('click', () => {
        close();
        onDone();
      });
    },

    // The Finances screen (tap the funds at the top). `s` is finance.financeSummary.
    showFinances(s, onClose) {
      const money = (v) => (v < 0 ? '-' : '') + formatMoney(Math.abs(v));
      const row = (label, value, cls = '') => `<div class="row ${cls}"><span>${label}</span><span>${value}</span></div>`;
      const net = (v) => `<span class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : ''}${money(v)}</span>`;
      const peak = Math.max(1, ...s.history.map((h) => Math.abs(h.net)));
      const bars = s.history
        .map((h) => `<div class="hbar" title="Y${h.year} Q${h.quarter}"><span class="fill ${h.net >= 0 ? 'pos' : 'neg'}" style="height:${Math.max(4, Math.round((Math.abs(h.net) / peak) * 46))}px"></span><small>Q${h.quarter}</small><small>${h.net >= 0 ? '+' : '-'}${formatMoney(Math.abs(h.net)).replace('$', '')}</small></div>`)
        .join('');
      const card = open(`
        <h2>Finances</h2>
        <div class="net ${s.funds >= 0 ? 'gain' : 'loss'}"><span>In the bank</span><span class="net-value">${money(s.funds)}</span></div>
        <div class="section-label">This quarter so far (day ${Math.max(1, Math.ceil(s.daysIn))} of ${s.daysPerQuarter})</div>
        ${row('Rent collected', money(s.soFar.rent))}
        ${row('Shop sales (already paid)', money(s.soFar.sales))}
        ${row('Upkeep and power so far', '-' + money(s.soFar.upkeep))}
        ${row('So far', net(s.soFar.net), 'total')}
        <div class="section-label">Expected by quarter end, at today's pace</div>
        ${row('Rent (about ' + money(s.rentPerDay) + ' a day)', money(s.projected.rent))}
        ${row('Sales', money(s.projected.sales))}
        ${row('Upkeep and power', '-' + money(s.projected.upkeep))}
        ${row('Net', net(s.projected.net), 'total')}
        <div class="section-label">What you pay every day (${money(s.dailyTotal)} in all)</div>
        ${s.bills.map((b) => row(b.label, money(b.perDay), 'muted')).join('')}
        ${s.best.length ? `<div class="section-label">Best earners this quarter</div>${s.best.map((b) => row(`${b.name}${b.count ? ` x${b.count}` : ''}${b.percent !== null ? ` · ${b.percent}% full` : ''}`, money(b.amount))).join('')}` : ''}
        ${bars ? `<div class="section-label">Past quarters (net)</div><div class="hbars">${bars}</div>` : '<p class="note">Past quarters will show here after your first quarter ends.</p>'}
        <button class="secondary" id="modal-ok" type="button">Close</button>`);
      card.querySelector('#modal-ok').addEventListener('click', () => {
        close();
        onClose();
      });
    },

    // Career goals checklist (opened from the Goals pill). `status` is modes.scenarioStatus.
    showGoals(status, onClose) {
      const num = (g, v) => (g.money ? formatMoney(v) : `${v.toLocaleString('en-US')}${g.suffix}`);
      const rows = status.goals
        .map((g) => `<div class="row check ${g.ok ? 'ok' : ''}"><span>${g.ok ? '&#10003;' : '&#9675;'} ${g.label}</span><span>${g.flag ? (g.ok ? 'Done' : 'Not yet') : `${num(g, g.have)} / ${num(g, g.need)}`}</span></div>`)
        .join('');
      const timeLine = status.ended
        ? '<p class="note">This scenario is finished. You are free to keep building.</p>'
        : `<div class="row"><span>Day</span><span>${Math.min(status.dayNo, status.limit)} of ${status.limit}</span></div>
           <p class="note">Meet every goal by midnight of day ${status.limit}. A faster finish earns a better medal.</p>`;
      const card = open(`
        <h2>${status.spec.name}</h2>
        <div class="section-label">Goals</div>${rows}
        ${timeLine}
        <button class="secondary" id="modal-ok" type="button">Close</button>`);
      card.querySelector('#modal-ok').addEventListener('click', () => {
        close();
        onClose();
      });
    },

    // Scenario won or lost. `actions`: { onNext (or null), onRetry, onKeep, onMenu }.
    showScenarioResult({ won, spec, days, medal, firstTime, limit }, actions) {
      const names = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };
      const body = won
        ? `<div class="confetti" aria-hidden="true">${confettiHtml(48)}</div>
           <h2 class="center big"><span class="medal ${medal}">${names[medal]}</span></h2>
           <h2 class="center">${spec.name} complete!</h2>
           <p class="center">You did it in ${days} day${days === 1 ? '' : 's'} (limit ${limit}).${firstTime ? ' A new scenario may have opened.' : ''}</p>`
        : `<h2 class="center">Time is up</h2>
           <p class="center">${spec.name}: the ${limit} days ran out before every goal was met. Try again with what you learned.</p>`;
      const card = open(`
        ${body}
        ${won && actions.onNext ? '<button class="primary" id="res-next" type="button">Next scenario</button>' : ''}
        ${won ? '' : '<button class="primary" id="res-retry" type="button">Try again</button>'}
        <button class="${won && !actions.onNext ? 'primary' : 'secondary'}" id="res-keep" type="button">Keep playing</button>
        <button class="secondary" id="res-menu" type="button">Main menu</button>`);
      const on = (id, fn) => card.querySelector(id)?.addEventListener('click', () => {
        close();
        fn();
      });
      on('#res-next', actions.onNext ?? (() => {}));
      on('#res-retry', actions.onRetry);
      on('#res-keep', actions.onKeep);
      on('#res-menu', actions.onMenu);
    },

    // Tier checklist (opened from the star badge). `status` is progress.tierStatus.
    showProgress({ tierName, stars, plot, status, inspection, won, crown, onClose }) {
      const rows = status
        ? status.checks
            .map((c) => {
              const value = c.flag ? '' : `${c.number ? c.have.toLocaleString('en-US') : c.have}${c.suffix ?? ''} / ${c.number ? c.need.toLocaleString('en-US') : c.need}${c.suffix ?? ''}`;
              return `<div class="row check ${c.ok ? 'ok' : ''}"><span>${c.ok ? '&#10003;' : '&#9675;'} ${c.label}</span><span>${value}</span></div>`;
            })
            .join('')
        : '';
      const inspectionLine = inspection
        ? `<p class="note">${inspection.state === 'scheduled' ? 'An inspector is on the way.' : 'An inspector is touring your tower now.'}</p>`
        : status && status.allMet
          ? '<p class="note">Everything is met. An inspector will be invited at midnight.</p>'
          : '';
      const card = open(`
        <h2>${'&#9733;'.repeat(stars)} ${tierName}</h2>
        <div class="row"><span>You may build up to</span><span>${plot.maxFloor} floors</span></div>
        ${
          status
            ? `<div class="section-label">To reach ${status.next.name}</div>${rows}${inspectionLine}`
            : won
              ? '<p>You built the Crown. Your tower is a legend.</p>'
              : `<div class="section-label">The Crown</div>
                 <div class="row check ${crown.peopleOk ? 'ok' : ''}"><span>${crown.peopleOk ? '&#10003;' : '&#9675;'} People</span><span>${crown.people.toLocaleString('en-US')} / ${crown.need.toLocaleString('en-US')}</span></div>
                 <p class="note">Build the Crown high on the roof (Special tab) to win.</p>`
        }
        <button class="secondary" id="modal-ok" type="button">Close</button>`);
      card.querySelector('#modal-ok').addEventListener('click', () => {
        close();
        onClose();
      });
    },

    // Settings: segmented choices that apply right away. `onChange(key, value)`.
    showSettings({ settings, onChange, onTutorial, onInstall, canInstall, onClose }) {
      const SEGMENTS = [
        { key: 'textScale', label: 'Text size', options: [['Small', 0.9], ['Normal', 1], ['Large', 1.15], ['Huge', 1.3]] },
        { key: 'haptics', label: 'Vibration', options: [['On', true], ['Off', false]] },
        { key: 'colorblind', label: 'Color-blind colors', options: [['Off', false], ['On', true]] },
        { key: 'graphics', label: 'Graphics', options: [['Auto', 'auto'], ['High', 'high'], ['Saver', 'low']] },
        { key: 'showFps', label: 'Frame rate', options: [['Hide', false], ['Show', true]] },
      ];
      const render = () => {
        const card = open(`
          <h2>Settings</h2>
          ${SEGMENTS.map(
            (s) => `<div class="setting"><span>${s.label}</span><div class="seg" data-key="${s.key}">${s.options
              .map(([text, value], i) => `<button type="button" data-i="${i}" class="${settings[s.key] === value ? 'on' : ''}">${text}</button>`)
              .join('')}</div></div>`,
          ).join('')}
          <div class="setting"><span>Sound effects</span><input type="range" id="set-sfx" min="0" max="1" step="0.05" value="${settings.sfxVolume}" aria-label="Sound effects volume" /></div>
          <div class="setting"><span>Music</span><input type="range" id="set-music" min="0" max="1" step="0.05" value="${settings.musicVolume}" aria-label="Music volume" /></div>
          <p class="note">No sound on iPhone? Turn the silent switch (the little switch above the volume buttons) off, and turn the volume up.</p>
          <button class="choice" id="set-tutorial" type="button"><span>Replay the tutorial</span></button>
          ${canInstall ? '<button class="choice" id="set-install" type="button"><span>Install the app on this device</span></button>' : ''}
          <p class="note">On iPhone: tap Share, then "Add to Home Screen" to install.</p>
          <button class="primary" id="set-done" type="button">Done</button>`, false);
        card.querySelectorAll('.seg').forEach((seg) => {
          const def = SEGMENTS.find((s) => s.key === seg.dataset.key);
          seg.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (!button) return;
            onChange(def.key, def.options[Number(button.dataset.i)][1]);
            const scroll = card.scrollTop;
            render();
            backdrop.querySelector('.card').scrollTop = scroll;
          });
        });
        card.querySelector('#set-sfx').addEventListener('input', (e) => onChange('sfxVolume', Number(e.target.value)));
        card.querySelector('#set-music').addEventListener('input', (e) => onChange('musicVolume', Number(e.target.value)));
        card.querySelector('#set-tutorial').addEventListener('click', () => {
          close();
          onTutorial();
        });
        const install = card.querySelector('#set-install');
        if (install) install.addEventListener('click', onInstall);
        card.querySelector('#set-done').addEventListener('click', () => {
          close();
          onClose();
        });
      };
      render();
    },

    // A plain "are you sure?" box with one action button and Cancel.
    showConfirm({ question, yesLabel, onYes, onCancel = () => {} }) {
      const c = open(
        `<h2>${question}</h2>
        <button class="primary" id="confirm-yes" type="button">${yesLabel}</button>
        <button class="secondary" id="confirm-no" type="button">Cancel</button>`,
        true,
      );
      c.querySelector('#confirm-yes').addEventListener('click', () => {
        close();
        onYes();
      });
      c.querySelector('#confirm-no').addEventListener('click', () => {
        close();
        onCancel();
      });
    },

    showMenu({ canLoad, onSave, onLoad, onNew, onSettings }) {
      const card = open(
        `<h2>Menu</h2>
        <button class="choice" id="menu-save" type="button"><span>Save game</span></button>
        <button class="choice" id="menu-load" type="button" ${canLoad ? '' : 'disabled'}><span>Load saved game</span></button>
        <button class="choice" id="menu-settings" type="button"><span>Settings and help</span></button>
        <button class="choice" id="menu-new" type="button"><span>Main menu</span></button>
        <button class="secondary" id="menu-close" type="button">Close</button>`,
        true,
      );
      card.querySelector('#menu-settings').addEventListener('click', () => {
        close();
        onSettings();
      });
      const ask = (question, yesLabel, onYes) => {
        const c = open(
          `<h2>${question}</h2>
          <button class="primary" id="confirm-yes" type="button">${yesLabel}</button>
          <button class="secondary" id="confirm-no" type="button">Cancel</button>`,
          true,
        );
        c.querySelector('#confirm-yes').addEventListener('click', () => {
          close();
          onYes();
        });
        c.querySelector('#confirm-no').addEventListener('click', close);
      };
      card.querySelector('#menu-save').addEventListener('click', () => {
        close();
        onSave();
      });
      card.querySelector('#menu-load').addEventListener('click', () =>
        ask('Replace your current tower with the saved one?', 'Load it', onLoad),
      );
      card.querySelector('#menu-new').addEventListener('click', () => {
        close();
        onNew(); // opens the title screen (Continue brings you straight back)
      });
      card.querySelector('#menu-close').addEventListener('click', close);
    },
  };
}
