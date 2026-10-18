// src/data/facilities.js
//
// Static info about the build menu: which category tabs exist and which
// facility types belong to each. Numbers (cost, size, colors) live in
// catalog.js / config.js — this file only decides how the menu is organized.

export const CATEGORIES = [
  { id: 'tools', label: 'Tools' },
  { id: 'needs', label: 'Needs' },
  { id: 'work', label: 'Work' },
  { id: 'living', label: 'Living' },
  { id: 'hotel', label: 'Hotel' },
  { id: 'commerce', label: 'Shops' },
  { id: 'services', label: 'Services' },
  { id: 'transport', label: 'Transport' },
  { id: 'special', label: 'Special' },
  { id: 'districts', label: 'Districts' },
];

// Returns [{ id, ...facilityConfig }] for one category tab.
export function facilitiesInCategory(config, categoryId) {
  return Object.entries(config.facilities)
    .filter(([, def]) => def.category === categoryId)
    .map(([id, def]) => ({ id, ...def }));
}
