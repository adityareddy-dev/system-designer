// System Designer sound kit. Everything is synthesised with Web Audio; there are no audio files.
// Chain: voices -> bus gain -> gentle compressor -> master gain -> output.
// Safe to call play() before unlock(); it is silently ignored.

const CATEGORY_HZ = {
  clients: 523.25, edge: 587.33, compute: 659.25, data: 392.0, messaging: 440.0,
  platform: 783.99, ops: 880.0, ai: 587.33, external: 329.63,
};
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.51;
const MAX_VOICES = 10;
const COOLDOWN_MS = 60;
const HARSH = new Set(['overload', 'fail.burst', 'alert']); // crackle and error sounds: 4 per second in total

export const SOUND_NAMES = [
  'ui.tap', 'place', 'connect', 'remove', 'start', 'event.1', 'event.2', 'event.3',
  'overload', 'recover', 'fail.burst', 'count', 'star', 'pass', 'miss',
  'request.ok', 'alert', 'level.clear', 'streak',
];

export function createAudio() {
  let ctx = null, bus = null, comp = null, master = null, noiseBuf = null;
  let muted = false, masterVol = 0.6, ambientOn = false, load = 0, amb = null;
  let voices = 0, okStep = 0;
  const lastAt = Object.create(null);
  let harshWindow = [];

  const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
  const outLevel = () => (muted ? 0 : masterVol);

  function unlock() {
    if (!ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return false;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch { return false; }
      master = ctx.createGain();
      master.gain.value = outLevel();
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20; comp.knee.value = 24; comp.ratio.value = 3;
      comp.attack.value = 0.004; comp.release.value = 0.2;
      bus = ctx.createGain();
      bus.gain.value = 1.6; // about +5 dB into the compressor, so the loudest cue peaks near -10 dBFS
      bus.connect(comp); comp.connect(master); master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 1.5);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let s = 12345; // tiny fixed generator: the same noise every run
      for (let i = 0; i < len; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 4294967296) * 2 - 1; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (ambientOn) startAmbient();
    return true;
  }

  // One oscillator voice with a fast attack and an exponential decay.
  function tone({ type = 'sine', f, f2 = f, t = 0, dur = 0.15, gain = 0.2, attack = 0.004, pan = 0, detune = 0 }) {
    if (voices >= MAX_VOICES) return;
    const t0 = ctx.currentTime + t;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2 !== f) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    if (detune) o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let tail = g;
    o.connect(g);
    if (pan && ctx.createStereoPanner) {
      const sp = ctx.createStereoPanner(); sp.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(sp); tail = sp;
    }
    tail.connect(bus);
    voices++;
    o.onended = () => { voices--; try { tail.disconnect(); } catch { /* already gone */ } };
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise({ type = 'bandpass', f = 1000, f2 = f, q = 1, t = 0, dur = 0.1, gain = 0.1, attack = 0.005, swell = false }) {
    if (voices >= MAX_VOICES) return;
    const t0 = ctx.currentTime + t;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f, t0);
    if (f2 !== f) flt.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    if (swell) {
      g.gain.linearRampToValueAtTime(gain, t0 + dur * 0.8);
      g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    } else {
      g.gain.linearRampToValueAtTime(gain, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    }
    src.connect(flt); flt.connect(g); g.connect(bus);
    voices++;
    src.onended = () => { voices--; try { g.disconnect(); } catch { /* already gone */ } };
    src.start(t0, 0);
    src.stop(t0 + dur + 0.05);
  }

  // Soft bell: a sine plus an inharmonic partial that dies faster.
  function bell(f, t, gain = 0.16, dur = 0.7, pan = 0) {
    tone({ f, t, dur, gain, attack: 0.006, pan });
    tone({ f: f * 2.76, t, dur: dur * 0.4, gain: gain * 0.25, attack: 0.004, pan });
  }

  const RECIPES = {
    'ui.tap': () => tone({ f: 1800, f2: 1200, dur: 0.03, gain: 0.17, attack: 0.002 }),
    place: ({ category, pan }) => {
      const f = CATEGORY_HZ[category] || E5;
      tone({ type: 'triangle', f, f2: f * 0.97, dur: 0.14, gain: 0.18, pan });
      tone({ type: 'sine', f: f * 2, f2: f * 2 * 0.97, dur: 0.14, gain: 0.08, pan });
    },
    connect: ({ pan }) => {
      tone({ f: 659.25, dur: 0.12, gain: 0.12, pan });
      tone({ f: 987.77, t: 0.07, dur: 0.14, gain: 0.12, pan });
    },
    remove: () => {
      tone({ f: 440, dur: 0.09, gain: 0.13 });
      tone({ f: 369.99, t: 0.08, dur: 0.12, gain: 0.13 });
      noise({ type: 'lowpass', f: 900, t: 0.02, dur: 0.14, gain: 0.05 });
    },
    start: () => {
      noise({ type: 'bandpass', f: 200, f2: 3000, q: 0.9, dur: 0.6, gain: 0.07, swell: true });
      tone({ f: 82.4, f2: 164.8, dur: 0.6, gain: 0.12, attack: 0.25 });
    },
    'event.1': () => { tone({ f: 880, dur: 0.22, gain: 0.12 }); tone({ f: 1174.66, t: 0.14, dur: 0.28, gain: 0.12 }); },
    'event.2': () => { tone({ f: 220, dur: 0.22, gain: 0.2 }); tone({ f: 220, t: 0.28, dur: 0.22, gain: 0.2 }); },
    'event.3': () => {
      [0, 0.24, 0.48].forEach(t => tone({ f: 150, t, dur: 0.24, gain: 0.18 }));
      noise({ type: 'lowpass', f: 700, dur: 0.8, gain: 0.04 });
    },
    // warnings must be heard over the good news, but a bad day must not be much louder than building:
    // the warnings sit about 3 dB under where they started, level with the loudest good news
    overload: ({ intensity }) => {
      const k = 0.55 + 0.45 * Math.min(1, intensity);
      tone({ type: 'triangle', f: 233, f2: 196, dur: 0.16, gain: 0.43 * k });
      noise({ type: 'bandpass', f: 1800, q: 1.1, dur: 0.1, gain: 0.3 * k });
    },
    recover: () => [392, 493.88, 587.33].forEach((f, i) => tone({ f, t: i * 0.07, dur: 0.22, gain: 0.12 })),
    'fail.burst': () => { tone({ type: 'triangle', f: 140, f2: 118, dur: 0.16, gain: 0.4 }); noise({ type: 'lowpass', f: 900, dur: 0.12, gain: 0.07 }); },
    count: () => tone({ f: 1400, dur: 0.02, gain: 0.16, attack: 0.001 }),
    star: ({ intensity }) => { // intensity 1, 2 or 3 picks the note: C5, E5, G5
      const i = Math.max(1, Math.min(3, Math.round(intensity))) - 1;
      bell([C5, E5, G5][i], 0, 0.15, 0.9);
    },
    pass: () => [C5, E5, G5, C6].forEach(f => tone({ type: 'triangle', f, dur: 1.0, gain: 0.05, attack: 0.02 })),
    miss: () => { tone({ f: 329.63, dur: 0.35, gain: 0.12, attack: 0.02 }); tone({ f: 261.63, t: 0.22, dur: 0.5, gain: 0.12, attack: 0.02 }); },
    // small additions
    'request.ok': () => { // a tiny pop; cycles through a pentatonic so busy traffic sounds musical, never repetitive
      const f = [C5, 587.33, E5, G5, 880][okStep++ % 5] * 2;
      tone({ f, dur: 0.05, gain: 0.12, attack: 0.002 });
    },
    alert: () => { // a calm two-note warning, softer than an overload
      [0, 0.2].forEach(t => { tone({ type: 'triangle', f: 660, t, dur: 0.16, gain: 0.12 }); tone({ type: 'triangle', f: 880, t: t + 0.08, dur: 0.16, gain: 0.12 }); });
    },
    'level.clear': () => {
      [C5, E5, G5, C6, E6].forEach((f, i) => { bell(f, i * 0.09, 0.045, 0.9); });
      tone({ type: 'triangle', f: C5, t: 0.45, dur: 1.1, gain: 0.022, attack: 0.03 });
      tone({ type: 'triangle', f: G5, t: 0.45, dur: 1.1, gain: 0.022, attack: 0.03 });
    },
    streak: () => {
      [392, 440, 587.33, 783.99].forEach((f, i) => bell(f, i * 0.1, 0.027, 0.7));
      noise({ type: 'highpass', f: 6000, t: 0.3, dur: 0.35, gain: 0.007 });
    },
  };

  const COOLDOWN_OVERRIDE = { 'request.ok': 120, count: 30 };

  function play(name, { pan = 0, intensity = 1, category } = {}) {
    if (!ctx || ctx.state !== 'running' || muted || masterVol <= 0) return;
    const r = RECIPES[name];
    if (!r) return;
    const t = now();
    if (t - (lastAt[name] || -1e9) < (COOLDOWN_OVERRIDE[name] || COOLDOWN_MS)) return;
    if (HARSH.has(name)) {
      harshWindow = harshWindow.filter(x => t - x < 1000);
      if (harshWindow.length >= 4) return;
      harshWindow.push(t);
    }
    lastAt[name] = t;
    r({ pan, intensity, category });
  }

  // Ambient bed: two detuned sines (55 and 82.5 Hz) through a low-pass that opens with load.
  function startAmbient() {
    if (!ctx || amb) return;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200 + 1000 * load; lp.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    const a = ctx.createOscillator(), b = ctx.createOscillator();
    a.type = 'sine'; b.type = 'sine'; a.frequency.value = 55; b.frequency.value = 82.5; b.detune.value = 7;
    a.connect(lp); b.connect(lp); lp.connect(g); g.connect(bus);
    g.gain.setTargetAtTime(muted ? 0.0001 : 0.05, ctx.currentTime, 0.8);
    a.start(); b.start();
    amb = { a, b, lp, g };
  }
  function stopAmbient() {
    if (!amb) return;
    const { a, b, g } = amb; amb = null;
    g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
    setTimeout(() => { try { a.stop(); b.stop(); g.disconnect(); } catch { /* done */ } }, 1500);
  }

  return {
    names: SOUND_NAMES,
    unlock,
    play,
    setMaster(v) {
      masterVol = Math.max(0, Math.min(1, v));
      if (master) master.gain.setTargetAtTime(outLevel(), ctx.currentTime, 0.02);
    },
    setMuted(b) {
      muted = !!b;
      if (master) master.gain.setTargetAtTime(outLevel(), ctx.currentTime, 0.02);
    },
    setAmbient(on) {
      ambientOn = !!on;
      if (!ctx) return; // starts at unlock
      if (ambientOn) startAmbient(); else stopAmbient();
    },
    setLoad(level) {
      load = Math.max(0, Math.min(1, level));
      if (amb) amb.lp.frequency.setTargetAtTime(200 + 1000 * load, ctx.currentTime, 0.3);
    },
  };
}
