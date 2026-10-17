// src/ui/settings.js
//
// The player's personal preferences (text size, sound, colors, graphics).
// They are kept in their own localStorage entry, separate from the saved
// game, so starting a new game never resets them. Anything that cares about
// a setting calls `onSettingChange` and is told when it changes.

const KEY = 'spire.settings';

export const DEFAULTS = {
  textScale: 1, // 0.9 small, 1 normal, 1.15 large, 1.3 huge
  sfx: true, // sound effects
  music: true, // background music
  volume: 0.6, // 0 to 1
  haptics: true, // vibration on phones
  colorblind: false, // color-blind friendly palette
  graphics: 'auto', // 'auto' | 'high' | 'low' (battery saver)
  showFps: false, // little frame-rate readout
  aim: 'close', // where a build lands relative to the fingertip: 'under' | 'close' | 'above'
  tutorialDone: false,
};

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

export const settings = { ...DEFAULTS, ...load() };
const listeners = new Set();

export function updateSetting(key, value) {
  settings[key] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // storage blocked: the setting still works for this session
  }
  for (const fn of listeners) fn(key, value);
}

export function onSettingChange(fn) {
  listeners.add(fn);
}
