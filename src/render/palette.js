// src/render/palette.js
//
// The color-blind friendly palette. When switched on, it replaces the
// colors that might be confused (green/red) with the Okabe-Ito set, which
// stays distinguishable for the common kinds of color blindness. The game
// never depends on color alone (icons, numbers, hatching and "!" marks are
// always there); this just makes the colors themselves safer too.

import { MOOD_COLORS } from './figures.js';

let original = null;

export function applyPalette(config, colorblind) {
  if (!original) {
    original = {
      valid: config.world.validColor,
      invalid: config.world.invalidColor,
      ramps: JSON.parse(JSON.stringify(config.overlays.ramps)),
      mood: { ...MOOD_COLORS },
    };
  }
  if (colorblind) {
    config.world.validColor = '#0072B2'; // blue instead of green
    config.world.invalidColor = '#D55E00'; // vermillion instead of red
    config.overlays.ramps.bad = ['#fff7bc', '#fec44f', '#d95f0e', '#662506'];
    config.overlays.ramps.good = ['#f0f9ff', '#a6cee3', '#3182bd', '#08306b'];
    config.overlays.ramps.money = ['#fde725', '#35b779', '#31688e', '#440154'];
    Object.assign(MOOD_COLORS, { calm: '#0072B2', impatient: '#E69F00', stressed: '#D55E00' });
  } else {
    config.world.validColor = original.valid;
    config.world.invalidColor = original.invalid;
    config.overlays.ramps = JSON.parse(JSON.stringify(original.ramps));
    Object.assign(MOOD_COLORS, original.mood);
  }
}
