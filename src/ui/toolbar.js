// src/ui/toolbar.js
//
// The on-screen controls: top HUD (funds, height), bottom build toolbar
// (category tabs + items), and the little pop-up messages ("toasts").
// These are ordinary HTML elements layered over the canvas, which makes them
// easy to tap (44px+ targets) and lets the browser handle text sizing.

import { CATEGORIES, facilitiesInCategory } from '../data/facilities.js';
import { formatMoney } from '../data/format.js';
import { unlockTier } from '../sim/tower.js';
import { settings, updateSetting } from './settings.js';

const ICONS = {
  pan:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg>',
  people:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><circle cx="8" cy="7" r="3"/><circle cx="17" cy="8" r="2.5"/><path d="M2 20c0-4 2.5-7 6-7s6 3 6 7zM14 20c0-3 1.5-5.5 4-5.5s4 2.5 4 5.5z"/></svg>',
  demolish:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/></svg>',
};

export function createToolbar(root, config, callbacks) {
  let category = 'tools';
  let tool = { kind: 'pan', typeId: null };
  let funds = 0;
  let affordKey = ''; // which items were affordable at the last render

  root.insertAdjacentHTML(
    'beforeend',
    `<div class="toast" id="toast"></div>
    <div class="toolbar">
      <button class="tb-handle" id="tb-handle" type="button" aria-label="Hide or show the build bar"></button>
      <div class="hint" id="hint"></div>
      <div class="tabs" id="tabs"></div>
      <div class="items" id="items"></div>
    </div>`,
  );
  // Other floating UI (toasts, the legend) sits just above the toolbar, which
  // changes height, so publish its height as a CSS variable.
  const toolbarEl = root.querySelector('.toolbar');
  new ResizeObserver(() => root.style.setProperty('--toolbar-h', `${toolbarEl.offsetHeight}px`)).observe(toolbarEl);
  // The little handle folds the bar away to give the tower more room.
  const handleEl = root.querySelector('#tb-handle');
  function applyCollapsed() {
    toolbarEl.classList.toggle('collapsed', settings.toolbarCollapsed);
    handleEl.innerHTML = settings.toolbarCollapsed ? '&#9650; Build' : '&#9660;';
    handleEl.setAttribute('aria-expanded', String(!settings.toolbarCollapsed));
  }
  handleEl.addEventListener('click', () => {
    updateSetting('toolbarCollapsed', !settings.toolbarCollapsed);
    applyCollapsed();
  });
  applyCollapsed();
  const toastEl = root.querySelector('#toast');
  const hintEl = root.querySelector('#hint');
  const tabsEl = root.querySelector('#tabs');
  const itemsEl = root.querySelector('#items');

  function makeButton(className, html, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.innerHTML = html;
    b.addEventListener('click', onClick);
    return b;
  }

  function selectTool(next) {
    const same = tool.kind === next.kind && tool.typeId === next.typeId;
    tool = same ? { kind: 'pan', typeId: null } : next;
    callbacks.onToolChange(tool);
    render();
  }

  let renderedCategory = null;
  function render() {
    // Rebuilding the buttons must not snap the scrolled rows back to the start.
    const tabsScroll = tabsEl.scrollLeft;
    const itemsScroll = renderedCategory === category ? itemsEl.scrollLeft : 0;
    renderedCategory = category;
    tabsEl.innerHTML = '';
    for (const cat of CATEGORIES) {
      const b = makeButton('tab' + (cat.id === category ? ' active' : ''), cat.label, () => {
        category = cat.id;
        render();
      });
      tabsEl.appendChild(b);
    }

    itemsEl.innerHTML = '';
    if (category === 'tools') {
      itemsEl.appendChild(
        makeButton('item' + (tool.kind === 'pan' ? ' active' : ''), `${ICONS.pan}<span class="name">Pan / look</span>`, () =>
          selectTool({ kind: 'pan', typeId: null }),
        ),
      );
      itemsEl.appendChild(
        makeButton('item' + (tool.kind === 'demolish' ? ' active' : ''), `${ICONS.demolish}<span class="name">Demolish</span>`, () =>
          selectTool({ kind: 'demolish', typeId: null }),
        ),
      );
      // Not a tool: an on/off switch for random test riders in the elevators.
      const demoOn = callbacks.getDemo();
      itemsEl.appendChild(
        makeButton('item' + (demoOn ? ' active' : ''), `${ICONS.people}<span class="name">Demo riders: ${demoOn ? 'ON' : 'off'}</span>`, () => {
          callbacks.onDemoToggle();
          render();
        }),
      );
    } else if (category === 'districts') {
      const dc = config.districts;
      for (const [id, theme] of Object.entries(dc.themes)) {
        const selected = tool.kind === 'district' && tool.typeId === id;
        const poor = funds < dc.designationCost;
        itemsEl.appendChild(
          makeButton(
            'item' + (selected ? ' active' : '') + (poor ? ' poor' : ''),
            `<span class="swatch" style="background:${theme.color};border-color:#fff"></span>
             <span class="name">${theme.label}</span>
             <span class="cost">${formatMoney(dc.designationCost)}</span>`,
            () => selectTool({ kind: 'district', typeId: id }),
          ),
        );
      }
      itemsEl.appendChild(
        makeButton(
          'item' + (tool.kind === 'district' && tool.typeId === 'clear' ? ' active' : ''),
          `${ICONS.demolish}<span class="name">Remove theme</span>`,
          () => selectTool({ kind: 'district', typeId: 'clear' }),
        ),
      );
    } else {
      for (const def of facilitiesInCategory(config, category)) {
        const selected = tool.kind === 'build' && tool.typeId === def.id;
        const poor = funds < def.cost;
        // Buildings unlock with your rating: show a lock (and the star level) instead of a price.
        const needTier = unlockTier(config, def.id);
        const locked = needTier > callbacks.getTier() + 1;
        const b = makeButton(
          'item' + (selected ? ' active' : '') + (poor && !locked ? ' poor' : '') + (locked ? ' locked' : ''),
          `<span class="swatch" style="background:${def.color};border-color:${def.accent}">${locked ? '&#128274;' : def.width}</span>
           <span class="name">${def.name}</span>
           <span class="cost">${locked ? `${'&#9733;'.repeat(needTier)} ${config.tiers[needTier - 1].name}` : `${poor ? 'Need ' : ''}${formatMoney(def.cost)}${def.vertical ? '/floor' : ''}`}</span>`,
          () => {
            if (locked) callbacks.onLockedTap(`Unlocks at ${config.tiers[needTier - 1].name}`);
            else selectTool({ kind: 'build', typeId: def.id });
          },
        );
        itemsEl.appendChild(b);
      }
    }
    tabsEl.scrollLeft = tabsScroll;
    itemsEl.scrollLeft = itemsScroll;

    if (tool.kind === 'district') {
      hintEl.textContent =
        tool.typeId === 'clear'
          ? 'Touch a themed band of floors and let go to remove its theme.'
          : `${config.districts.themes[tool.typeId].hint} Touch a band of ${config.districts.bandFloors} floors and let go.`;
    } else if (tool.kind === 'build') {
      const def = config.facilities[tool.typeId];
      hintEl.textContent = def.vertical
        ? `Press where it starts, drag up or down for more floors, let go to build ${def.name}.`
        : `Drag on the tower to place ${def.name}. Let go to build. Two fingers move the view.`;
    } else if (tool.kind === 'demolish') {
      hintEl.textContent = 'Drag onto a building and let go to demolish it (partial refund).';
    } else {
      hintEl.textContent = 'Drag to pan, pinch to zoom. Tap an elevator stop for its line; hold on any building for details.';
    }
  }

  let toastTimer = null;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  render();

  return {
    toast,
    // Called every frame; only rebuilds the buttons when which items are
    // affordable has actually changed.
    update(newFunds) {
      funds = newFunds;
      const key =
        callbacks.getTier() +
        ':' +
        Object.values(config.facilities)
          .map((def) => (funds < def.cost ? '1' : '0'))
          .join('');
      if (key !== affordKey) {
        affordKey = key;
        render();
      }
    },
  };
}
