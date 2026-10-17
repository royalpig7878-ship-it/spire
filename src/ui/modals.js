// src/ui/modals.js
//
// Pop-up cards that sit on top of the game: the quarterly report, the
// fire-sale offer (soft-fail), and the menu (save / load / new game).
// Only one is open at a time.

import { formatMoney } from '../data/format.js';

const COIN_ICON =
  '<svg class="coin" viewBox="0 0 24 24" width="34" height="34"><circle cx="12" cy="12" r="10" fill="#ffd166" stroke="#c98f12" stroke-width="2"/><text x="12" y="17" text-anchor="middle" font-size="14" font-weight="700" fill="#8a5a00">$</text></svg>';

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
        ? `<div class="row"><span>Customer sales</span><span>+${formatMoney(report.sales)}</span></div>`
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

    showMenu({ canLoad, onSave, onLoad, onNew }) {
      const card = open(
        `<h2>Menu</h2>
        <button class="choice" id="menu-save" type="button"><span>Save game</span></button>
        <button class="choice" id="menu-load" type="button" ${canLoad ? '' : 'disabled'}><span>Load saved game</span></button>
        <button class="choice" id="menu-new" type="button"><span>New game</span></button>
        <button class="secondary" id="menu-close" type="button">Close</button>`,
        true,
      );
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
      card.querySelector('#menu-new').addEventListener('click', () =>
        ask('Start over? Your current tower will be erased.', 'Start over', onNew),
      );
      card.querySelector('#menu-close').addEventListener('click', close);
    },
  };
}
