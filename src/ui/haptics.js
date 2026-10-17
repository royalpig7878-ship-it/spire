// src/ui/haptics.js
//
// Short vibrations on phones (the Vibration API), for building, demolishing,
// errors and big moments. Silently does nothing on devices without it, and
// respects the "Vibration" setting.

import { settings } from './settings.js';

const PATTERNS = {
  tap: 8,
  build: 14,
  demolish: [24, 30, 24],
  error: [30, 40, 30],
  alarm: [60, 50, 60, 50, 120],
  celebrate: [20, 40, 20, 40, 20, 40, 140],
};

export function buzz(name) {
  if (!settings.haptics || !('vibrate' in navigator)) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; // browsers ignore it before the first tap
  try {
    navigator.vibrate(PATTERNS[name] ?? 10);
  } catch {
    // some browsers block vibration until the page has been touched
  }
}
