// src/sim/stories.js
//
// "What is this person doing right now?" Turns a tenant's live state into a
// one-line story ("Waiting 40s for the lift", "Late for a meeting") and
// finds who you tapped. Read-only: it never changes the tenant.

import { moodOfStress } from '../render/figures.js';

const MOOD_WORDS = { calm: 'calm', impatient: 'getting impatient', stressed: 'very stressed' };

const PURPOSE_STORY = {
  food: (name) => `Having a bite at the ${name}`,
  shop: (name) => `Browsing at the ${name}`,
  fun: (name) => `Enjoying the ${name}`,
  fit: (name) => `Working out at the ${name}`,
  care: () => 'Seeing the doctor at the clinic',
};

function venuePurpose(config, venue) {
  return venue ? config.facilities[venue.type].purposes?.[0] : null;
}

export function statusOf(game, config, t) {
  const minute = game.clock.minutes;
  const mod = minute % 1440;
  const facilityName = (id) => {
    const f = game.tower.facilities.get(id);
    return f ? config.facilities[f.type].name : 'building';
  };

  if (t.kind === 'inspector') {
    if (t.mode === 'dwell') return `Inspecting the ${facilityName(t.inspector.stops[t.inspector.stopIdx]?.facilityId)}`;
    if (t.rider?.state === 'waiting') return `Waiting ${Math.round(t.rider.waited)}s for the lift. Not impressed.`;
    return 'Touring the tower';
  }

  // Stuck in a line or riding
  if (t.rider?.state === 'waiting') {
    const s = Math.round(t.rider.waited);
    return t.stress >= config.tenants.stress.stressedAbove ? `Fuming after ${s}s in the lift line` : `Waiting ${s}s for the lift`;
  }
  if (t.rider?.state === 'riding') return `Riding the lift to floor ${t.route?.[t.legIdx]?.toFloor ?? '?'}`;

  switch (t.mode) {
    case 'dwell': {
      const venue = game.tower.facilities.get(t.cafeId);
      const purpose = venuePurpose(config, venue);
      return (PURPOSE_STORY[purpose] ?? ((n) => `Relaxing at the ${n}`))(venue ? config.facilities[venue.type].name : 'venue');
    }
    case 'travel': {
      if (t.task === 'enter') {
        const late = t.kind === 'worker' && mod > t.sched.arrive + 20;
        if (late) return 'Late for a meeting';
        return t.kind === 'worker' ? 'Arriving for work' : t.kind === 'guest' ? 'Checking in' : 'Coming home';
      }
      if (t.task === 'leave') return t.kind === 'worker' ? 'Heading home for the day' : 'Heading out';
      if (t.task === 'visit') {
        const purpose = venuePurpose(config, game.tower.facilities.get(t.cafeId));
        return { food: 'Off to get something to eat', shop: 'Off to the shops', fun: 'Off for some fun', fit: 'Off to the gym', care: 'Going to see the doctor' }[purpose] ?? 'Off on an errand';
      }
      if (t.task === 'return') return t.kind === 'worker' ? 'Back to their desk' : 'Heading back home';
      return 'On the move';
    }
    case 'home': {
      if (t.stress >= config.tenants.stress.stressedAbove) return t.kind === 'worker' ? 'At their desk, still fuming' : 'At home, still fuming';
      if (t.kind === 'worker') return 'Working at their desk';
      if (t.kind === 'guest') return 'Resting in their room';
      return mod >= 22 * 60 || mod < 6 * 60 ? 'Fast asleep' : 'Relaxing at home';
    }
    default:
      return 'Out and about';
  }
}

export function moodWord(config, t) {
  return MOOD_WORDS[moodOfStress(t.stress, config.tenants.stress)];
}

// Which tenant is at this world point? (A tap on a person.) Returns the
// closest one within reach, preferring angrier ones in a crowded line.
export function tenantAt(game, config, world) {
  const { cellWidth, floorHeight } = config.grid;
  const cx = world.x / cellWidth;
  const cy = -world.y / floorHeight; // in floors
  let best = null;
  let bestScore = Infinity;
  for (const t of game.tenants.list) {
    if (!t.pos || t.mode === 'away') continue;
    const floor = t.pos.floor;
    if (cy < floor - 0.15 || cy > floor + 1.0) continue;
    let dx = Math.abs(cx - t.pos.x);
    if (t.rider?.state === 'waiting') {
      // people in a lift line stand to the left of the shaft
      const left = t.pos.x - 3.4;
      if (cx >= left && cx <= t.pos.x) dx = 0.4;
    }
    if (dx > 0.8) continue;
    const score = dx - t.stress * 0.002;
    if (score < bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}
