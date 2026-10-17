// src/sim/sfx.js
//
// The simulation does not play sounds itself (it has no idea about speakers).
// It just notes "an elevator dinged on floor 4" in a short list, and the UI
// decides whether it is close enough to hear and plays it.

export function emit(game, name, floor = null) {
  if (game.sfx.length < 40) game.sfx.push({ name, floor });
}
