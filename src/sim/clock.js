// src/sim/clock.js
//
// The in-game calendar. Time is stored as ONE number: minutes since
// midnight at the start of day 1. Everything else (hour, day, quarter,
// year) is calculated from it, so there is nothing to get out of sync.

export const MINUTES_PER_DAY = 1440;

export function createClock(config) {
  return { minutes: config.time.startHour * 60 };
}

// 0..24, e.g. 7.5 = 7:30 AM
export function hourOfDay(clock) {
  return (clock.minutes % MINUTES_PER_DAY) / 60;
}

// Zero-based count of whole days since the start.
export function dayIndex(clock) {
  return Math.floor(clock.minutes / MINUTES_PER_DAY);
}

// Friendly calendar fields for the HUD and reports.
export function calendar(clock, config) {
  const { daysPerQuarter, quartersPerYear } = config.time;
  const day0 = dayIndex(clock);
  const quarterIndex = Math.floor(day0 / daysPerQuarter);
  return {
    dayOfQuarter: (day0 % daysPerQuarter) + 1,
    quarter: (quarterIndex % quartersPerYear) + 1,
    year: Math.floor(quarterIndex / quartersPerYear) + 1,
  };
}

// "7:30 AM"
export function formatTime(clock) {
  const totalMinutes = Math.floor(clock.minutes % MINUTES_PER_DAY);
  const h24 = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}
