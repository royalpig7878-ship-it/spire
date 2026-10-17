// src/ui/hud.js
//
// The always-visible top display: funds, floors, menu button, the date and
// time, the speed buttons, and the "you are in debt" banner. Built once,
// then only the text that changed is touched each frame.

import { formatMoney } from '../data/format.js';
import { OVERLAY_INFO, OVERLAY_MODES } from '../render/overlays.js';

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
      <div class="pill clock" id="hud-clock"><span id="hud-time"></span><small id="hud-weather"></small></div>
      <div class="speeds" id="hud-speeds"></div>
    </div>
    <div class="hud hud3">
      <button class="pill small tier-btn" id="hud-height" type="button" aria-label="Rating and progress"></button>
      <div class="pill small" id="hud-mood"></div>
      <button class="pill small overlay-btn" id="hud-overlay" type="button">${LAYERS_ICON}<span id="hud-overlay-label">Layer: Off</span></button>
    </div>
    <div class="layer-menu" id="layer-menu" hidden></div>
    <div class="legend" id="hud-legend"></div>
    <div class="debt-banner" id="hud-debt"></div>
    <div class="debt-banner power-banner" id="hud-power"></div>`,
  );
  const overlayBtn = root.querySelector('#hud-overlay');
  const overlayLabel = root.querySelector('#hud-overlay-label');
  const legendEl = root.querySelector('#hud-legend');
  const powerEl = root.querySelector('#hud-power');
  const layerMenu = root.querySelector('#layer-menu');
  let legendKey = '';
  let lastFunds = Infinity;

  // The Layer button opens a short list of overlays to choose from.
  layerMenu.innerHTML = OVERLAY_MODES.map((mode) => {
    const label = mode === 'off' ? 'Layers off' : OVERLAY_INFO[mode].label;
    return `<button type="button" class="layer-option" data-mode="${mode}">${label}</button>`;
  }).join('');
  overlayBtn.addEventListener('click', () => {
    layerMenu.hidden = !layerMenu.hidden;
  });
  layerMenu.addEventListener('click', (event) => {
    const button = event.target.closest('.layer-option');
    if (!button) return;
    callbacks.onOverlay(button.dataset.mode);
    layerMenu.hidden = true;
  });
  const fundsEl = root.querySelector('#hud-funds');
  const popEl = root.querySelector('#hud-pop');
  const moodEl = root.querySelector('#hud-mood');
  const heightEl = root.querySelector('#hud-height');
  const timeEl = root.querySelector('#hud-time');
  const weatherEl = root.querySelector('#hud-weather');
  heightEl.addEventListener('click', callbacks.onProgress);
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
      // The funds pill gives a little hop whenever money comes in.
      if (state.funds > lastFunds + 0.5) {
        fundsEl.classList.remove('bump');
        void fundsEl.offsetWidth; // restart the CSS animation
        fundsEl.classList.add('bump');
      }
      lastFunds = state.funds;
      setText(fundsEl, formatMoney(state.funds));
      fundsEl.classList.toggle('debt', state.funds < 0);
      setText(popEl, `Pop ${state.population.toLocaleString('en-US')}`);
      // The stars are the rating; tapping them opens the progress screen.
      setText(heightEl, `${'★'.repeat(state.stars)} ${state.topFloor}/${state.maxFloor}`);
      // Low mood gets a "!" badge as well as red text (never color alone).
      setText(moodEl, `Mood ${state.mood}%`);
      moodEl.classList.toggle('low', state.mood < 50);

      // Power warnings: a short-lived dip, or demand that has outgrown the supply
      if (state.outage) {
        setText(powerEl, `Power dip: elevators at ${Math.round(state.outage.factor * 100)}% speed until it passes.`);
        powerEl.classList.add('show');
      } else if (state.power.ratio < 1) {
        setText(powerEl, `Power shortage: elevators at ${Math.round(Math.max(config.power.minSpeedFactor, state.power.ratio) * 100)}% speed. Build a substation.`);
        powerEl.classList.add('show');
      } else {
        powerEl.classList.remove('show');
      }

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
      setText(timeEl, `${state.dateText}  ${state.timeText}`);
      setText(weatherEl, state.weatherText);
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
