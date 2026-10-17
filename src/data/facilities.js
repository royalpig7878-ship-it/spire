// src/data/facilities.js
//
// Static info about the build menu: which category tabs exist and which
// facility types belong to each. Numbers (cost, size, colors) live in
// config.js — this file only decides how the menu is organized.

export const CATEGORIES = [
  { id: 'tools', label: 'Tools' },
  { id: 'work', label: 'Work' },
  { id: 'living', label: 'Living' },
  { id: 'commerce', label: 'Commerce' },
  { id: 'transport', label: 'Transport' },
  { id: 'lobby', label: 'Lobby' },
];

// Returns [{ id, ...facilityConfig }] for one category tab.
export function facilitiesInCategory(config, categoryId) {
  return Object.entries(config.facilities)
    .filter(([, def]) => def.category === categoryId)
    .map(([id, def]) => ({ id, ...def }));
}
