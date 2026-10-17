// src/audio/audio.js
//
// All the game's sound, made in code with the Web Audio API: short sound
// effects built from simple tones, and a gentle, endlessly varying music loop
// (a slow chord pad with soft plucked notes). No audio files are needed.
//
// Browsers only allow sound after the player has touched the screen, so the
// audio starts on the first tap (`unlock`). Everything respects the settings
// (sound effects on/off, music on/off, volume).

// Chords of the music loop (note frequencies in Hz): C major 7, A minor 7,
// F major 7, G sixth. Each lasts one bar.
const CHORDS = [
  [130.81, 164.81, 196.0, 246.94],
  [110.0, 130.81, 164.81, 196.0],
  [87.31, 110.0, 130.81, 164.81],
  [98.0, 123.47, 146.83, 164.81],
];
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16]; // semitones above the chord root note

export function createAudio(settings) {
  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let musicTimer = null;
  let nextBarTime = 0;
  let barIndex = 0;
  let darkness = 0; // 0 day .. 1 night: the music gets softer and lower
  const lastPlayed = {};

  function ensure() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      ctx = new AudioCtx();
      master = ctx.createGain();
      sfxBus = ctx.createGain();
      musicBus = ctx.createGain();
      sfxBus.connect(master);
      musicBus.connect(master);
      master.connect(ctx.destination);
      applySettings();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function applySettings() {
    if (!ctx) return;
    master.gain.value = settings.volume;
    sfxBus.gain.value = settings.sfx ? 1 : 0;
    musicBus.gain.value = settings.music ? 0.55 : 0;
    if (settings.music) startMusic();
    else stopMusic();
  }

  // One soft tone: an oscillator with a quick fade-in and a decay.
  function tone(freq, start, dur, { type = 'sine', gain = 0.2, attack = 0.01, slideTo = null, bus = sfxBus } = {}) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(bus);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  // Each effect is a few tones. Times are seconds from "now".
  const EFFECTS = {
    click: (t) => tone(620, t, 0.05, { type: 'triangle', gain: 0.08 }),
    build: (t) => {
      tone(180, t, 0.12, { type: 'square', gain: 0.1, slideTo: 90 });
      tone(520, t + 0.05, 0.14, { type: 'triangle', gain: 0.12 });
      tone(780, t + 0.1, 0.16, { type: 'triangle', gain: 0.1 });
    },
    demolish: (t) => {
      tone(220, t, 0.28, { type: 'sawtooth', gain: 0.09, slideTo: 55 });
      tone(90, t, 0.3, { type: 'square', gain: 0.1, slideTo: 40 });
    },
    error: (t) => {
      tone(210, t, 0.12, { type: 'square', gain: 0.08 });
      tone(160, t + 0.11, 0.16, { type: 'square', gain: 0.08 });
    },
    coin: (t) => {
      tone(1320, t, 0.08, { type: 'triangle', gain: 0.07 });
      tone(1760, t + 0.07, 0.18, { type: 'triangle', gain: 0.07 });
    },
    kaching: (t) => {
      EFFECTS.coin(t);
      EFFECTS.coin(t + 0.14);
      tone(2093, t + 0.3, 0.4, { type: 'sine', gain: 0.09 });
    },
    ding: (t) => {
      tone(1046, t, 0.5, { type: 'sine', gain: 0.06 });
      tone(1568, t + 0.02, 0.4, { type: 'sine', gain: 0.03 });
    },
    alarm: (t) => {
      for (let i = 0; i < 4; i++) {
        tone(880, t + i * 0.28, 0.14, { type: 'square', gain: 0.07 });
        tone(660, t + i * 0.28 + 0.14, 0.14, { type: 'square', gain: 0.07 });
      }
    },
    down: (t) => {
      tone(440, t, 0.6, { type: 'sawtooth', gain: 0.08, slideTo: 70 });
    },
    good: (t) => {
      tone(660, t, 0.12, { type: 'triangle', gain: 0.09 });
      tone(990, t + 0.1, 0.22, { type: 'triangle', gain: 0.09 });
    },
    notice: (t) => {
      tone(784, t, 0.15, { type: 'sine', gain: 0.09 });
      tone(659, t + 0.16, 0.25, { type: 'sine', gain: 0.09 });
    },
    fanfare: (t) => {
      const notes = [523, 659, 784, 1046, 784, 1046, 1318];
      notes.forEach((f, i) => tone(f, t + i * 0.14, i === notes.length - 1 ? 0.9 : 0.2, { type: 'triangle', gain: 0.12 }));
      tone(262, t, 1.2, { type: 'sine', gain: 0.1 });
    },
  };

  function play(name, minGapSec = 0.04) {
    if (!settings.sfx || !EFFECTS[name]) return;
    if (!ensure()) return;
    const now = ctx.currentTime;
    if (lastPlayed[name] !== undefined && now - lastPlayed[name] < minGapSec) return; // avoid machine-gunning
    lastPlayed[name] = now;
    EFFECTS[name](now + 0.01);
  }

  // ---- Music: a quiet generative loop ----

  function scheduleBar(start) {
    const chord = CHORDS[barIndex % CHORDS.length];
    const beat = 60 / 62; // about 62 beats per minute
    const barLen = beat * 4;
    const night = darkness > 0.6;
    // Pad: the chord's notes, slow fade in and out.
    // Kept in the mid range (phone speakers turn deep sustained notes into a hum)
    // and shorter than a bar, so one chord fades out before the next arrives.
    for (const f of chord) {
      tone(f * 2, start, barLen * 0.95, { type: 'sine', gain: night ? 0.018 : 0.026, attack: 0.9, bus: musicBus });
    }
    // Soft plucks: random notes from the chord's pentatonic scale.
    const steps = night ? 4 : 8;
    for (let i = 0; i < steps; i++) {
      if (Math.random() < (night ? 0.5 : 0.62)) {
        const semis = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
        const freq = chord[0] * 2 * 2 ** (semis / 12);
        tone(freq, start + (i * barLen) / steps, 1.1, { type: 'sine', gain: night ? 0.03 : 0.045, attack: 0.02, bus: musicBus });
      }
    }
    barIndex += 1;
    return barLen;
  }

  function startMusic() {
    if (musicTimer || !ctx) return;
    nextBarTime = ctx.currentTime + 0.2;
    // Every 250 ms top up a short queue of bars so the music never runs out.
    musicTimer = setInterval(() => {
      while (nextBarTime < ctx.currentTime + 1.2) nextBarTime += scheduleBar(nextBarTime);
    }, 250);
  }

  function stopMusic() {
    clearInterval(musicTimer);
    musicTimer = null;
  }

  return {
    // Call from a tap/click handler: browsers need that before allowing sound.
    // iPhones also want a (silent) sound played inside the touch to wake audio up.
    unlock() {
      if (!ensure()) return;
      try {
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, 22050);
        src.connect(ctx.destination);
        src.start(0);
      } catch {
        // not fatal: the first real sound will still try to wake audio
      }
      applySettings();
    },
    isRunning: () => Boolean(ctx) && ctx.state === 'running',
    play,
    applySettings,
    setDarkness(value) {
      darkness = value;
    },
    // Quiet everything when the app is in the background.
    suspend() {
      if (ctx && ctx.state === 'running') ctx.suspend();
    },
    resume() {
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
  };
}
