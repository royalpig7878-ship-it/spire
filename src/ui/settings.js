// src/ui/settings.js
//
// The player's personal preferences (text size, sound, colors, graphics).
// They are kept in their own localStorage entry, separate from the saved
// game, so starting a new game never resets them. Anything that cares about
// a setting calls `onSettingChange` and is told when it changes.

const KEY = 'spire.settings';

export const DEFAULTS = {
  textScale: 1, // 0.9 small, 1 normal, 1.15 large, 1.3 huge
  sfxVolume: 0.75, // sound effects and the building's own sounds, 0 (off) to 1
  musicVolume: 0.75, // background music, 0 (off) to 1
  haptics: true, // vibration on phones
  colorblind: false, // color-blind friendly palette
  graphics: 'auto', // 'auto' | 'high' | 'low' (battery saver)
  showFps: false, // little frame-rate readout
  sandbox: { money: 'standard', tier: 'normal', events: 'on' }, // last Sandbox choices
  toolbarCollapsed: false, // the bottom build bar is folded away
  tutorialDone: false,
};

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

const saved = load();
export const settings = { ...DEFAULTS, ...saved };
// Older versions had On/Off switches: keep the choice of anyone who had sound switched off.
if (saved.sfx === false && saved.sfxVolume === undefined) settings.sfxVolume = 0;
if (saved.music === false && saved.musicVolume === undefined) settings.musicVolume = 0;
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
