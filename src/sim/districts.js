// src/sim/districts.js
//
// Sky districts. Every `bandFloors` floors (15 by default) form a "band" of
// the tower, and you may give a band a theme: Business, Leisure, Residential
// or Wellness. A building inside a themed band earns a SYNERGY BONUS when the
// right neighbours are in the same band, for example:
//   - offices in a Business district earn more rent for each of: a cafe or
//     restaurant, a parking garage, a security office also being in the band;
//   - a gym in a Wellness district does better when homes are near it.
// The themes and numbers live in config.js (`districts`).
// Everything here is a pure calculation on the tower's data.

export function bandOf(config, floor) {
  return floor <= 0 ? 0 : Math.floor((floor - 1) / config.districts.bandFloors);
}

// Floors a band covers, e.g. band 0 = floors 0..15 (the lobby belongs to band 0).
export function bandRange(config, band) {
  const size = config.districts.bandFloors;
  return { first: band === 0 ? 0 : band * size + 1, last: (band + 1) * size };
}

export function themeOf(tower, config, floor) {
  return tower.districts[bandOf(config, floor)] ?? null;
}

// ---- Designating ----

export function designateDistrict(tower, config, band, themeId) {
  const dc = config.districts;
  if (!dc.themes[themeId]) return { ok: false, reason: 'Unknown district theme' };
  if (tower.districts[band] === themeId) return { ok: false, reason: 'Already this theme' };
  const { first, last } = bandRange(config, band);
  let count = 0;
  for (const f of tower.facilities.values()) {
    if (f.floor >= first && f.floor <= last && !config.facilities[f.type].transport) count++;
  }
  if (count < dc.minFacilities) {
    return { ok: false, reason: `Needs ${dc.minFacilities} buildings in this band first` };
  }
  if (tower.funds < dc.designationCost) return { ok: false, reason: 'Not enough funds' };
  return { ok: true, reason: '', cost: dc.designationCost };
}

export function applyDistrict(tower, config, band, themeId) {
  const check = designateDistrict(tower, config, band, themeId);
  if (!check.ok) return check;
  tower.funds -= check.cost;
  tower.districts[band] = themeId;
  tower.version++;
  return check;
}

export function clearDistrict(tower, band) {
  if (!tower.districts[band]) return { ok: false, reason: 'No district here' };
  delete tower.districts[band];
  tower.version++;
  return { ok: true, reason: '' };
}

// ---- Bonuses ----

// How many of each tag are in each band (cached until the tower changes).
function bandTags(tower, config) {
  if (tower._bandTags && tower._bandTags.version === tower.version) return tower._bandTags.value;
  const value = new Map(); // band -> Map(tag -> count)
  for (const f of tower.facilities.values()) {
    const band = bandOf(config, f.floor);
    if (!value.has(band)) value.set(band, new Map());
    const tags = value.get(band);
    for (const tag of config.facilities[f.type].tags ?? []) tags.set(tag, (tags.get(tag) ?? 0) + 1);
  }
  tower._bandTags = { version: tower.version, value };
  return value;
}

const NEUTRAL = { rentMult: 1, salesMult: 1, appeal: 0, relief: 0, theme: null, notes: [] };

// The synergy a facility gets from its district: rent multiplier, shop-sales
// multiplier, extra appeal to new tenants, extra stress relief per second, and
// plain-language notes for the info panel.
export function districtBonus(tower, config, facility) {
  const themeId = themeOf(tower, config, facility.floor);
  if (!themeId) return NEUTRAL;
  const dc = config.districts;
  const theme = dc.themes[themeId];
  const tags = bandTags(tower, config).get(bandOf(config, facility.floor)) ?? new Map();
  const own = config.facilities[facility.type].tags ?? [];
  const others = (tag) => (tags.get(tag) ?? 0) - (own.includes(tag) ? 1 : 0); // do not count itself

  const isPrimary = own.some((t) => theme.primary.includes(t));
  const isSupport = own.some((t) => theme.supports.includes(t));
  const result = { rentMult: 1, salesMult: 1, appeal: 0, relief: 0, theme: themeId, notes: [] };

  if (isPrimary) {
    const present = theme.supports.filter((t) => others(t) > 0);
    const bonus = Math.min(theme.maxBonus, theme.perSupport * present.length);
    const w = theme.weights;
    result.rentMult = 1 + bonus * w.rent;
    result.salesMult = 1 + bonus * w.sales;
    result.appeal = bonus * w.appeal;
    result.relief = bonus * w.relief * 2;
    result.notes.push(
      present.length
        ? `${theme.label} district: +${Math.round(bonus * 100)}% bonus (${present.join(', ')} nearby)`
        : `${theme.label} district: no bonus yet. Add ${theme.supports.join(', ')} to this band.`,
    );
  } else if (isSupport && theme.primary.some((t) => others(t) > 0)) {
    result.salesMult = 1 + dc.supportSalesBonus;
    result.notes.push(`${theme.label} district: +${Math.round(dc.supportSalesBonus * 100)}% sales (it supports the district)`);
  } else {
    result.notes.push(`In a ${theme.label} district but not part of its theme.`);
  }
  return result;
}
