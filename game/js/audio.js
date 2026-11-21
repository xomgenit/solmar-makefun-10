// audio.js — WebAudio-synthesised sound effects. No audio files, no
// network requests: every sound is an oscillator/noise burst built at
// runtime. All calls are safe before any user gesture (the context is
// created lazily on the first ensureAudio call).

let ctx = null;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;

export function ensureAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq, dur, type = 'sine', vol = 0.15, slideTo = null) {
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch {
    // Audio is cosmetic; never let it break the game.
  }
}

function noiseBurst(dur, vol = 0.2, filterFreq = 1200) {
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
    src.start(t);
  } catch {
    // Cosmetic only.
  }
}

export const sfx = {
  shoot() {
    noiseBurst(0.09, 0.22, 2800);
    tone(180, 0.08, 'square', 0.08, 60);
  },
  crash() {
    noiseBurst(0.18, 0.25, 500);
  },
  blip() {
    tone(660, 0.07, 'sine', 0.1);
  },
  cash() {
    tone(880, 0.09, 'sine', 0.12);
    setTimeout(() => tone(1320, 0.12, 'sine', 0.12), 70);
  },
  horn() {
    tone(370, 0.18, 'square', 0.07);
  },
  wasted() {
    tone(320, 0.5, 'sawtooth', 0.12, 80);
  },
  click() {
    tone(520, 0.05, 'sine', 0.08);
  },
  heal() {
    tone(520, 0.12, 'sine', 0.1, 780);
  },
  steal() {
    tone(240, 0.1, 'square', 0.08, 420);
  },
};

// Continuous engine hum while driving; speed01 is 0..1.
export function updateEngine(driving, speed01) {
  if (!ctx) return;
  try {
    if (driving && speed01 > 0.02) {
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineGain = ctx.createGain();
        engineOsc.type = 'sawtooth';
        engineGain.gain.value = 0;
        engineOsc.connect(engineGain);
        engineGain.connect(ctx.destination);
        engineOsc.start();
      }
      engineOsc.frequency.value = 55 + speed01 * 130;
      engineGain.gain.value = 0.03 + speed01 * 0.035;
    } else if (engineOsc) {
      engineGain.gain.value = 0;
    }
  } catch {
    // Cosmetic only.
  }
}

// Two-tone police siren while any cruiser is active.
export function updateSiren(active) {
  if (!ctx) return;
  try {
    if (active) {
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenGain = ctx.createGain();
        sirenOsc.type = 'sine';
        sirenGain.gain.value = 0.02;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(ctx.destination);
        sirenOsc.start();
        const t0 = ctx.currentTime;
        sirenOsc.frequency.setValueAtTime(700, t0);
        sirenOsc.frequency.linearRampToValueAtTime(950, t0 + 0.4);
        sirenOsc.frequency.linearRampToValueAtTime(700, t0 + 0.8);
      }
    } else if (sirenOsc) {
      try {
        sirenOsc.stop();
      } catch {
        // Already stopped.
      }
      sirenOsc.disconnect();
      sirenGain.disconnect();
      sirenOsc = null;
      sirenGain = null;
    }
  } catch {
    // Cosmetic only.
  }
}

export function stopAllLoops() {
  try {
    if (engineOsc) {
      engineGain.gain.value = 0;
    }
    updateSiren(false);
  } catch {
    // Cosmetic only.
  }
}
