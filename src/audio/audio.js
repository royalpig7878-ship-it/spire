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
  let ambBus = null; // crowd, elevators, rain, birds...
  let sprite = null; // the packed recorded sounds (see assets/sfx), once loaded
  let spriteMap = null;
  const lastVariant = {};
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
      buildAmbience();
      loadSprite();
      applySettings();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function applySettings() {
    if (!ctx) return;
    master.gain.value = 0.8;
    sfxBus.gain.value = settings.sfxVolume;
    if (ambBus) ambBus.gain.value = settings.sfxVolume; // the building's own sounds follow the Sound effects bar
    musicBus.gain.value = 0.55 * settings.musicVolume;
    if (settings.musicVolume > 0) startMusic();
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


  // ---- Recorded sounds ----
  //
  // assets/sfx/sfx.wav holds all the recorded clips one after another, and sfx.json says
  // where each one starts (made by tools/build-sfx.py). A "group" is a few variations of
  // one job, e.g. four different placement thunks; each play picks one at random.

  // game sound name -> which group to play, and how loud (0..1)
  const RECORDED = {
    build: { group: 'place', gain: 0.34 },
    buildLow: { group: 'buildLow', gain: 0.27 },
    buildMed: { group: 'buildMed', gain: 0.2 },
    buildHigh: { group: 'buildHigh', gain: 0.21 },
    buildHospital: { group: 'buildHospital', gain: 0.23 },
    buildPolice: { group: 'buildPolice', gain: 0.22 },
    buildComms: { group: 'buildComms', gain: 0.25 },
    dragStep: { group: 'dragStep', gain: 0.18 },
    demolish: { group: 'demolish', gain: 0.33 },
    bulldoze: { group: 'bulldoze', gain: 0.23 },
    scrap: { group: 'scrap', gain: 0.19 },
    sell: { group: 'sell', gain: 0.21 },
    error: { group: 'denied', gain: 0.15 },
    select: { group: 'select', gain: 0.25 },
    good: { group: 'good', gain: 0.19 },
    notice: { group: 'good', gain: 0.16 },
    bad: { group: 'bad', gain: 0.16 },
    achievement: { group: 'achievement', gain: 0.25 },
    fanfare: { group: 'levelUp', gain: 0.23 },
    kaching: { group: 'money', gain: 0.35 },
    econUp: { group: 'econUp', gain: 0.3 },
    down: { group: 'econDown', gain: 0.34 },
    tax: { group: 'tax', gain: 0.31 },
    legislation: { group: 'legislation', gain: 0.32 },
    alarm: { group: 'disaster', gain: 0.32 },
    warning: { group: 'warning', gain: 0.24 },
    upgrade: { group: 'upgrade', gain: 0.11 },
    upgradeSmall: { group: 'upgradeSmall', gain: 0.18 },
    upgradeObject: { group: 'upgradeObject', gain: 0.27 },
  };
  // If the recordings are not loaded (yet), these sounds use a synthesized one instead.
  const FALLBACK = {
    buildLow: 'build', buildMed: 'build', buildHigh: 'build', buildHospital: 'build', buildPolice: 'build', buildComms: 'build',
    bulldoze: 'demolish', scrap: 'demolish', sell: 'coin', select: 'click', bad: 'error', achievement: 'fanfare',
    econUp: 'good', tax: 'notice', legislation: 'notice', warning: 'alarm', upgrade: 'good', upgradeSmall: 'good', upgradeObject: 'good',
  };

  async function loadSprite() {
    try {
      const base = new URL('../../assets/sfx/', import.meta.url);
      const [map, bytes] = await Promise.all([
        fetch(new URL('sfx.json', base)).then((r) => r.json()),
        fetch(new URL('sfx.wav', base)).then((r) => r.arrayBuffer()),
      ]);
      sprite = await ctx.decodeAudioData(bytes);
      spriteMap = map.groups;
    } catch {
      sprite = null; // no recordings: the synthesized sounds keep working
    }
  }

  // Plays one random clip from a group through `bus`. Returns false if it cannot.
  function playRecorded(group, gain, bus, when = ctx.currentTime + 0.01) {
    const clips = spriteMap?.[group];
    if (!sprite || !clips) return false;
    let i = Math.floor(Math.random() * clips.length);
    if (clips.length > 1 && i === lastVariant[group]) i = (i + 1) % clips.length; // never the same one twice in a row
    lastVariant[group] = i;
    const clip = clips[i];
    const src = ctx.createBufferSource();
    src.buffer = sprite;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(bus);
    src.start(when, clip.s, clip.d);
    return true;
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
    if (settings.sfxVolume <= 0) return;
    if (!ensure()) return;
    const now = ctx.currentTime;
    if (lastPlayed[name] !== undefined && now - lastPlayed[name] < minGapSec) return; // avoid machine-gunning
    // A recorded sound if we have one, otherwise the little synthesized version.
    const rec = RECORDED[name];
    if (rec && playRecorded(rec.group, rec.gain, sfxBus)) {
      lastPlayed[name] = now;
      return;
    }
    const synth = EFFECTS[name] ? name : FALLBACK[name];
    if (!EFFECTS[synth]) return;
    lastPlayed[name] = now;
    EFFECTS[synth](now + 0.01);
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


  // ---- Ambience: the sounds of a living building ----
  //
  // Everything is made from filtered noise and a few tiny blips, so there are no
  // audio files and no constant low drone (those make a speaker "hum"). A driver
  // (src/ui/ambience.js) tells us how crowded, how busy the elevators are, whether
  // it rains... and we fade the layers up and down.

  const amb = { crowd: null, crowd2: null, motor: null, motorFilter: null, rain: null };
  let noiseBuf = null;

  function noiseSource() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.loopStart = Math.random() * 0.5;
    return src;
  }

  function buildAmbience() {
    ambBus = ctx.createGain();
    ambBus.gain.value = 1;
    ambBus.connect(master);
    // two seconds of white noise, looped by every layer (each starts at a different spot)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const layer = (type, freq, q, extra) => {
      const src = noiseSource();
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f);
      let tail = f;
      if (extra) {
        const f2 = ctx.createBiquadFilter();
        f2.type = extra.type;
        f2.frequency.value = extra.freq;
        tail.connect(f2);
        tail = f2;
      }
      tail.connect(g);
      g.connect(ambBus);
      src.start();
      return { gain: g, filter: f };
    };
    amb.crowd = layer('bandpass', 700, 0.7, { type: 'lowpass', freq: 2400 }); // a room full of voices
    amb.crowd2 = layer('bandpass', 1500, 1.1, { type: 'lowpass', freq: 3200 }); // brighter chatter on top
    amb.motor = layer('bandpass', 420, 1.4, { type: 'lowpass', freq: 1800 }); // elevator whoosh
    amb.rain = layer('highpass', 1100, 0.5, { type: 'lowpass', freq: 7000 });
  }

  const smooth = (param, value, seconds = 0.35) => param.setTargetAtTime(value, ctx.currentTime, seconds);

  // levels are 0..1
  let lastAmbSet = 0;
  function setAmbience({ crowd = 0, motor = 0, motorPitch = 0.5, rain = 0 }) {
    if (!ctx || !amb.crowd) return;
    if (settings.sfxVolume <= 0) crowd = motor = rain = 0;
    if (ctx.currentTime - lastAmbSet < 0.08) return; // at most ~12 changes a second
    lastAmbSet = ctx.currentTime;
    // a living murmur: the level wobbles a little instead of sitting flat
    const wobble = 0.85 + Math.random() * 0.3;
    smooth(amb.crowd.gain.gain, 0.045 * crowd * wobble, 0.5);
    smooth(amb.crowd2.gain.gain, 0.016 * crowd * (2 - wobble), 0.5);
    smooth(amb.motor.gain.gain, 0.04 * motor, 0.25);
    smooth(amb.motor.filter.frequency, 300 + motorPitch * 700, 0.3);
    smooth(amb.rain.gain.gain, 0.026 * rain, 0.8);
  }

  // A burst of noise through a band filter: breath, door hiss, keyboard click.
  function burst(start, dur, freq, q, gain, bus = ambBus, attack = 0.005) {
    const src = noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(start);
    src.stop(start + dur + 0.05);
  }

  const AMBIENT_EFFECTS = {
    // Doors slide with a soft hiss, a little motor whirr, and (closing) a gentle thunk.
    doorOpen: (t) => {
      burst(t, 0.28, 2200, 1.2, 0.05);
      tone(260, t, 0.25, { type: 'sine', gain: 0.025, slideTo: 420, bus: ambBus });
    },
    doorClose: (t) => {
      burst(t, 0.28, 1900, 1.2, 0.05);
      tone(420, t, 0.25, { type: 'sine', gain: 0.025, slideTo: 260, bus: ambBus });
      tone(130, t + 0.27, 0.12, { type: 'sine', gain: 0.07, slideTo: 60, bus: ambBus });
    },
    // A murmur of chatter: a few soft vowel-like syllables.
    chatter: (t) => {
      const syllables = 2 + Math.floor(Math.random() * 3);
      const base = 105 + Math.random() * 120;
      let at = t;
      for (let i = 0; i < syllables; i++) {
        const dur = 0.08 + Math.random() * 0.1;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.3), at);
        osc.frequency.linearRampToValueAtTime(base * (0.8 + Math.random() * 0.4), at + dur);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 500 + Math.random() * 700;
        f.Q.value = 4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.03, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        osc.connect(f);
        f.connect(g);
        g.connect(ambBus);
        osc.start(at);
        osc.stop(at + dur + 0.05);
        at += dur + 0.04 + Math.random() * 0.06;
      }
    },
    typing: (t) => {
      const n = 3 + Math.floor(Math.random() * 6);
      let at = t;
      for (let i = 0; i < n; i++) {
        burst(at, 0.02, 3200 + Math.random() * 1200, 2, 0.03);
        at += 0.06 + Math.random() * 0.1;
      }
    },
    phone: (t) => {
      for (let ring = 0; ring < 2; ring++) {
        for (let i = 0; i < 6; i++) tone(i % 2 ? 1250 : 1000, t + ring * 0.7 + i * 0.055, 0.05, { type: 'triangle', gain: 0.018, bus: ambBus });
      }
    },
    bird: (t) => {
      const base = 2300 + Math.random() * 1200;
      const notes = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < notes; i++) tone(base * (0.9 + Math.random() * 0.25), t + i * 0.11, 0.08, { type: 'sine', gain: 0.022, slideTo: base * 1.35, bus: ambBus });
    },
    cricket: (t) => {
      for (let i = 0; i < 7; i++) tone(4300, t + i * 0.055, 0.025, { type: 'sine', gain: 0.01, bus: ambBus });
    },
  };

  // The sounds from the world outside come from the recordings, quietly.
  const OUTSIDE = { bird: { group: 'bird', gain: 0.065 }, hoot: { group: 'hoot', gain: 0.055 }, engine: { group: 'engine', gain: 0.05 }, police: { group: 'police', gain: 0.028 }, ambulance: { group: 'ambulance', gain: 0.036 } };

  function playAmbient(name, minGapSec = 0.15) {
    if (settings.sfxVolume <= 0 || !ctx || !ambBus) return;
    const now = ctx.currentTime;
    if (lastPlayed[name] !== undefined && now - lastPlayed[name] < minGapSec) return;
    const out = OUTSIDE[name];
    if (out && playRecorded(out.group, out.gain, ambBus)) {
      lastPlayed[name] = now;
      return;
    }
    if (!AMBIENT_EFFECTS[name]) return;
    lastPlayed[name] = now;
    AMBIENT_EFFECTS[name](now + 0.01);
  }

  // iPhones mute web audio when the silent switch is on, unless the page counts as "playing
  // media". A looping silent <audio> element (started inside a tap) does exactly that.
  let keepAlive = null;
  function startKeepAlive() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback'; // newer Safari
    } catch {
      // not available: fine
    }
    if (keepAlive) {
      if (keepAlive.paused) keepAlive.play().catch(() => {});
      return;
    }
    try {
      // half a second of silence as a tiny WAV file, made on the spot
      const rate = 8000;
      const samples = rate / 2;
      const buf = new ArrayBuffer(44 + samples);
      const v = new DataView(buf);
      const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
      str(0, 'RIFF');
      v.setUint32(4, 36 + samples, true);
      str(8, 'WAVEfmt ');
      v.setUint32(16, 16, true);
      v.setUint16(20, 1, true);
      v.setUint16(22, 1, true);
      v.setUint32(24, rate, true);
      v.setUint32(28, rate, true);
      v.setUint16(32, 1, true);
      v.setUint16(34, 8, true);
      str(36, 'data');
      v.setUint32(40, samples, true);
      new Uint8Array(buf, 44).fill(128); // 128 = silence in 8-bit audio
      keepAlive = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
      keepAlive.loop = true;
      keepAlive.setAttribute('playsinline', '');
      keepAlive.play().catch(() => {});
    } catch {
      keepAlive = null;
    }
  }

  return {
    // Call from a tap/click handler: browsers need that before allowing sound.
    // iPhones also want a (silent) sound played inside the touch to wake audio up.
    unlock() {
      startKeepAlive();
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
    recordingsLoaded: () => Boolean(sprite), // for testing
    setAmbience,
    playAmbient,
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
