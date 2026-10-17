// src/ui/hud.js
//
// The always-visible top display: funds, floors, menu button, the date and
// time, the speed buttons, and the "you are in debt" banner. Built once,
// then only the text that changed is touched each frame.

import { formatMoney } from '../data/format.js';
import { OVERLAY_INFO } from '../render/overlays.js';

const PAUSE_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const LAYERS_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><path d="M12 3 3 8l9 5 9-5-9-5zM3 13l9 5 9-5"/></svg>';
const MENU_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';

export function createHud(root, config, callbacks) {
  root.insertAdjacentHTML(
    'beforeend',
    `<div class="hud">
      <div class="pill" id="hud-funds"></div>
      <div class="pill" id="hud-pop"></div>
      <button class="pill icon-btn" id="hud-menu" type="button" aria-label="Menu">${MENU_ICON}</button>
    </div>
    <div class="hud hud2">
      <div class="pill" id="hud-clock"></div>
      <div class="speeds" id="hud-speeds"></div>
    </div>
    <div class="hud hud3">
      <div class="pill small" id="hud-height"></div>
      <div class="pill small" id="hud-mood"></div>
      <button class="pill small overlay-btn" id="hud-overlay" type="button">${LAYERS_ICON}<span id="hud-overlay-label">Layer: Off</span></button>
    </div>
    <div class="legend" id="hud-legend"></div>
    <div class="debt-banner" id="hud-debt"></div>`,
  );
  const overlayBtn = root.querySelector('#hud-overlay');
  const overlayLabel = root.querySelector('#hud-overlay-label');
  const legendEl = root.querySelector('#hud-legend');
  overlayBtn.addEventListener('click', callbacks.onOverlay);
  let legendKey = '';
  const fundsEl = root.querySelector('#hud-funds');
  const popEl = root.querySelector('#hud-pop');
  const moodEl = root.querySelector('#hud-mood');
  const heightEl = root.querySelector('#hud-height');
  const clockEl = root.querySelector('#hud-clock');
  const speedsEl = root.querySelector('#hud-speeds');
  const debtEl = root.querySelector('#hud-debt');
  root.querySelector('#hud-menu').addEventListener('click', callbacks.onMenu);

  const speedButtons = new Map();
  for (const speed of config.time.speeds) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'speed-btn';
    b.innerHTML = speed === 0 ? PAUSE_ICON : `${speed}x`;
    b.setAttribute('aria-label', speed === 0 ? 'Pause' : `Speed ${speed}x`);
    b.addEventListener('click', () => callbacks.onSpeed(speed));
    speedsEl.appendChild(b);
    speedButtons.set(speed, b);
  }

  const setText = (el, text) => {
    if (el.textContent !== text) el.textContent = text;
  };

  return {
    // state: { funds, topFloor, population, mood, dateText, timeText, speed, debtDaysLeft }
    update(state) {
      setText(fundsEl, formatMoney(state.funds));
      fundsEl.classList.toggle('debt', state.funds < 0);
      setText(popEl, `Pop ${state.population}`);
      setText(heightEl, `Floors ${state.topFloor} / ${config.plot.maxFloor}`);
      // Low mood gets a "!" badge as well as red text (never color alone).
      setText(moodEl, `Mood ${state.mood}%`);
      moodEl.classList.toggle('low', state.mood < 50);

      // Overlay button + color legend
      const info = OVERLAY_INFO[state.overlay];
      setText(overlayLabel, info ? info.label : 'Layers');
      overlayBtn.classList.toggle('active', Boolean(info));
      const key = state.overlay;
      if (key !== legendKey) {
        legendKey = key;
        if (info) {
          const stops = config.overlays.ramps[info.ramp];
          legendEl.innerHTML = `<span>${info.label}: ${info.low}</span><div class="ramp" style="background:linear-gradient(90deg,${stops.join(',')})"></div><span>${info.high}</span>`;
          legendEl.classList.add('show');
        } else {
          legendEl.classList.remove('show');
        }
      }
      setText(clockEl, `${state.dateText}  ${state.timeText}`);
      for (const [speed, b] of speedButtons) {
        const active = speed === state.speed;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      }
      // Warning phase of the soft-fail: show how long until the fire sale.
      if (state.funds < 0) {
        setText(
          debtEl,
          `In debt! ${state.debtDaysLeft} day${state.debtDaysLeft === 1 ? '' : 's'} to get back above $0`,
        );
        debtEl.classList.add('show');
      } else {
        debtEl.classList.remove('show');
      }
    },
  };
}
