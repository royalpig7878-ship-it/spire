// src/ui/infopanel.js
//
// The bottom sheet that opens when you long-press a building. For any
// facility it shows status, tenants, mood and money. For an elevator shaft it
// also holds the settings: how many cars it has and which floors it stops at.
// The numbers refresh a couple of times a second while the sheet is open.

import { formatMoney } from '../data/format.js';
import { isConnected, shaftCars } from '../sim/tower.js';
import { districtBonus } from '../sim/districts.js';
import { coverageOf, noiseOf, trashLevel, powerStatus, parkingStatus, recyclingCut } from '../sim/services.js';
import { isEligibleStop, effectiveStops } from '../sim/shafts.js';
import {
  tenantsOf,
  averageStress,
  occupancy,
  incomePerQuarter,
  shaftSummary,
  stopWaitSeconds,
} from '../sim/diagnostics.js';
import { moodOfStress } from '../render/figures.js';

const MOOD_WORDS = { calm: 'calm', impatient: 'impatient', stressed: 'stressed' };

export function createInfoPanel(root, config, handlers) {
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.hidden = true;
  root.appendChild(sheet);

  let selectedId = null;
  let updaters = []; // functions that refresh the live numbers
  let lastRefresh = 0;

  function hide() {
    selectedId = null;
    sheet.hidden = true;
    sheet.innerHTML = '';
    updaters = [];
    handlers.onClose();
  }

  function row(label, valueHtml, bind) {
    return `<div class="kv"><span>${label}</span><span ${bind ? `data-bind="${bind}"` : ''}>${valueHtml}</span></div>`;
  }

  function show(id) {
    const game = handlers.getGame();
    const f = game.tower.facilities.get(id);
    if (!f) return;
    selectedId = id;
    sheet.hidden = false;
    updaters = [];
    const def = config.facilities[f.type];
    const top = f.floor + f.height - 1;
    const floors = f.height > 1 ? `Floors ${f.floor}-${top}` : `Floor ${f.floor}`;
    const isShaft = def.transport === 'elevator' && !def.serviceOnly;

    sheet.innerHTML = `
      <div class="sheet-head">
        <div><h3>${def.name}</h3><span class="tag">${floors}</span></div>
        <button class="close" id="sheet-close" type="button" aria-label="Close">&times;</button>
      </div>
      <div class="sheet-body" id="sheet-body"></div>`;
    sheet.querySelector('#sheet-close').addEventListener('click', hide);
    const body = sheet.querySelector('#sheet-body');
    if (isShaft) buildShaft(body, f, def);
    else buildFacility(body, f, def);
    refresh(true);
  }

  // ----- Ordinary facilities -----

  // What a service building does, in plain words (updated live).
  function serviceNotes(game, f, def) {
    const lines = [];
    const top = f.floor + f.height - 1;
    if (def.serviceKind) {
      lines.push(`${def.serviceKind[0].toUpperCase()}${def.serviceKind.slice(1)} cover reaches ${def.coverFloors} floors up and down (double on a service elevator's floors).`);
    }
    if (def.cleanPerDay) lines.push(`Cleans ${def.cleanPerDay} trash per day from each building it covers.`);
    if (def.trashCut) lines.push(`Recycling cuts trash tower-wide (tower total now ${Math.round(recyclingCut(game, config) * 100)}%). Earns ${formatMoney(def.dailyIncome)} a day.`);
    if (def.powerSupply) {
      const p = powerStatus(game, config);
      lines.push(`Adds ${def.powerSupply} power. Tower: using ${Math.round(p.demand)} of ${Math.round(p.supply)}${p.ratio < 1 ? ' (SHORTAGE: elevators slowed)' : ''}.`);
    }
    if (def.parkingCapacity) {
      const p = parkingStatus(game, config);
      lines.push(`Holds ${def.parkingCapacity} cars. Tower: ${p.drivers} drivers, ${p.capacity} spaces. Earns ${formatMoney(config.parking.incomePerCarPerDay)} per car per day.`);
    }
    if (def.amenityRelief) lines.push(`Calms people within ${def.amenityReach} floors of floors ${f.floor}-${top}.`);
    if (def.purposes) lines.push(`Customers come for: ${def.purposes.join(', ')}. ${formatMoney(def.visitRevenue)} per visit.`);
    if (def.climbSecPerFloor) lines.push('A fast, easy way to move between floors.');
    return lines;
  }

  function buildFacility(body, f, def) {
    const game = handlers.getGame();
    const showEnv = Boolean(def.capacity || def.purposes);
    body.innerHTML = `
      ${row('Access', '', 'access')}
      ${def.capacity ? row('Tenants', '', 'tenants') : ''}
      ${def.capacity ? row('Average stress', '', 'stress') : ''}
      ${def.rentPerCell > 0 || def.visitRevenue ? row('Income (per quarter)', '', 'income') : ''}
      ${row('Upkeep (per day)', formatMoney(f.width * f.height * def.upkeepPerCell))}
      ${def.purposes ? row('Customers now', '', 'visitors') : ''}
      ${showEnv ? row('Cover', '', 'cover') : ''}
      ${showEnv ? row('Trash', '', 'trash') : ''}
      ${showEnv ? row('Noise from neighbours', '', 'noise') : ''}
      <div class="note" data-bind="status"></div>
      ${
        !def.transport && !def.hall && !def.landmark
          ? `<button class="choice" id="sprinkler-btn" type="button"><span>Fire sprinklers</span><span data-bind="sprinklerCost"></span></button>`
          : ''
      }
      <div class="note" data-bind="district"></div>
      <div class="note" data-bind="effects"></div>
      <div class="section-label" id="tenant-title"></div>
      <div id="tenant-list"></div>`;
    const set = (key, html) => {
      const el = body.querySelector(`[data-bind="${key}"]`);
      if (el && el.innerHTML !== html) el.innerHTML = html;
    };
    const sprinklerBtn = body.querySelector('#sprinkler-btn');
    if (sprinklerBtn) {
      sprinklerBtn.addEventListener('click', () => {
        handlers.onSprinklers(f);
        refresh(true);
      });
    }
    updaters.push(() => {
      const connected = isConnected(game.tower, config, f);
      set('access', connected ? 'Connected to the lobby' : '<b class="warn">No route from the lobby</b>');
      // Trouble report: fire, repairs, pests
      const bits = [];
      const fire = game.incidents.fires[f.id];
      if (fire) bits.push(`<b class="warn">ON FIRE (${Math.round(fire.intensity)}%). Sprinklers and maintenance hubs fight it.</b>`);
      if (f.closedUntil && f.closedUntil > game.clock.minutes) bits.push('<b class="warn">Closed for repairs after a fire.</b>');
      if (game.incidents.pests[f.id]) bits.push('<b class="warn">Pests! Clean up the trash.</b>');
      set('status', bits.join('<br>'));
      if (sprinklerBtn) {
        const cost = f.width * f.height * config.incidents.fire.sprinklerCostPerCell;
        set('sprinklerCost', f.sprinklers ? 'installed' : formatMoney(cost));
        sprinklerBtn.disabled = Boolean(f.sprinklers) || game.tower.funds < cost;
      }
      set('effects', serviceNotes(game, f, def).join('<br>'));
      set('district', districtBonus(game.tower, config, f).notes.join('<br>'));
      if (showEnv) {
        const cov = coverageOf(game, config, f);
        set('cover', `Security ${cov.security} · Medical ${cov.medical} · Maintenance ${cov.maintenance}`);
        const trash = Math.round(trashLevel(game, f));
        set('trash', `${trash}%${trash >= config.services.trash.badgeAbove ? ' <b class="warn">(dirty)</b>' : ''}`);
        const noise = noiseOf(game, config, f);
        set('noise', noise < 0.5 ? 'quiet' : noise.toFixed(1));
      }
      const list = tenantsOf(game, f);
      if (def.capacity) {
        const occ = occupancy(game, config, f);
        set('tenants', `${list.length} / ${def.capacity} (${Math.round(occ * 100)}%)`);
        const avg = averageStress(game, f);
        set('stress', avg === null ? 'no tenants' : `${Math.round(avg)} · ${MOOD_WORDS[moodOfStress(avg, config.tenants.stress)]}`);
      }
      const income = incomePerQuarter(game, config, f);
      if (income !== null) set('income', formatMoney(income));
      if (def.purposes) set('visitors', `${game.tenants.visitors.get(f.id) ?? 0} / ${def.visitCapacity}`);
      const title = body.querySelector('#tenant-title');
      const listEl = body.querySelector('#tenant-list');
      title.textContent = list.length ? 'Tenants' : '';
      listEl.innerHTML = list
        .sort((a, b) => b.stress - a.stress)
        .map((t) => {
          const trait = config.tenants.traits[t.trait];
          return `<div class="tenant-row"><span class="dot" style="background:${trait.color}"></span><span>${trait.label}</span>
            <span class="bar"><span style="width:${Math.round(t.stress)}%"></span></span><span class="num">${Math.round(t.stress)}</span></div>`;
        })
        .join('');
    });
  }

  // ----- Elevator shafts -----

  function buildShaft(body, f, def) {
    const game = handlers.getGame();
    const express = def.stopMode === 'hubs';
    const top = f.floor + f.height - 1;
    const stopsNote = express
      ? 'Express: stops only at the bottom and at the lobby or sky lobbies it passes or touches. Faster, bigger cars.'
      : 'Local: stops at every floor. Switch floors off to make it skip them.';

    body.innerHTML = `
      <p class="note">${stopsNote}</p>
      ${row('Waiting now', '', 'waiting')}
      ${row('Longest wait now', '', 'longest')}
      ${row('Average wait (all rides)', '', 'avg')}
      ${row('Rides completed', '', 'done')}
      <div class="section-label">Cars</div>
      <div class="stepper">
        <button type="button" class="step" id="car-minus" aria-label="Remove a car">&minus;</button>
        <div class="step-value"><b data-bind="cars"></b><small data-bind="carsNote"></small></div>
        <button type="button" class="step" id="car-plus" aria-label="Add a car">+</button>
      </div>
      <div data-bind="carList" class="car-list"></div>
      <div class="section-label">Stops (tap a floor to switch it)</div>
      <div class="chips" id="stop-chips"></div>`;

    const chips = body.querySelector('#stop-chips');
    for (let fl = top; fl >= f.floor; fl--) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.floor = String(fl);
      b.addEventListener('click', () => {
        handlers.onToggleStop(f, fl);
        refresh(true);
      });
      chips.appendChild(b);
    }
    body.querySelector('#car-minus').addEventListener('click', () => {
      handlers.onSetCars(f, shaftCars(config, f) - 1);
      refresh(true);
    });
    body.querySelector('#car-plus').addEventListener('click', () => {
      handlers.onSetCars(f, shaftCars(config, f) + 1);
      refresh(true);
    });

    const set = (key, html) => {
      const el = body.querySelector(`[data-bind="${key}"]`);
      if (el && el.innerHTML !== html) el.innerHTML = html;
    };
    updaters.push(() => {
      const shaft = game.elevators.shafts.get(f.id);
      if (!shaft) return;
      const s = shaftSummary(shaft);
      set('waiting', `${s.waitingNow} (${s.ridingNow} riding)`);
      set('longest', `${Math.round(s.longest)}s`);
      set('avg', s.completed ? `${s.averageWait.toFixed(1)}s` : '-');
      set('done', String(s.completed));

      const cars = shaftCars(config, f);
      set('cars', `${cars} car${cars === 1 ? '' : 's'}`);
      const removing = shaft.cars.length > cars;
      set('carsNote', removing ? 'removing when a car is empty' : `${config.elevators.carCost > 0 ? `+ costs ${formatMoney(config.elevators.carCost)}` : ''}`);
      body.querySelector('#car-minus').disabled = cars <= 1;
      body.querySelector('#car-plus').disabled = cars >= config.elevators.maxCars || game.tower.funds < config.elevators.carCost;
      set(
        'carList',
        shaft.cars
          .map((c, i) => `<div class="car-row">Car ${i + 1}: floor ${c.pos.toFixed(1)} · ${c.riders.length}/${shaft.capacity} riding · ${c.state === 'open' || c.state === 'opening' || c.state === 'closing' ? 'doors' : c.state}</div>`)
          .join(''),
      );

      const stops = new Set(effectiveStops(game.tower, config, f));
      for (const chip of chips.children) {
        const fl = Number(chip.dataset.floor);
        const eligible = isEligibleStop(game.tower, config, f, fl);
        const forced = fl === f.floor || (!express && fl === top);
        const on = stops.has(fl);
        const wait = on ? stopWaitSeconds(shaft, fl) : 0;
        chip.className = `chip ${on ? 'on' : 'off'}${!eligible ? ' locked' : ''}${forced ? ' forced' : ''}`;
        chip.disabled = forced || !eligible;
        const text = `${fl === 0 ? 'L' : fl}`;
        const tag = on ? (wait >= 1 ? `${Math.round(wait)}s` : 'stop') : !eligible ? 'wall' : 'skip';
        const html = `<b>${text}</b><small>${tag}</small>`;
        if (chip.innerHTML !== html) chip.innerHTML = html;
      }
    });
  }

  function refresh(force = false) {
    if (selectedId === null) return;
    const game = handlers.getGame();
    if (!game.tower.facilities.has(selectedId)) {
      hide();
      return;
    }
    const now = performance.now();
    if (!force && now - lastRefresh < 400) return;
    lastRefresh = now;
    for (const update of updaters) update();
  }

  return {
    show,
    hide,
    refresh,
    isOpen: () => selectedId !== null,
    get selectedId() {
      return selectedId;
    },
  };
}
