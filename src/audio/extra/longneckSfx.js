// [v26 turtle] Old Longneck's sounds. Loaded by audio.js through import.meta.glob('./extra/*.js').
//
//   ln_chime   slow wind chimes: a few soft pentatonic bells, far apart
//   ln_word    one... slow... word: a low, wobbly "hmmm"
//   ln_roar    the waterfall: a deep swell of rushing water
//   ln_gong    the Old Ways: a deep bell under a shower of chimes
const rnd = (a, b) => a + Math.random() * (b - a);
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];

function chime(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.5, 0.02);
  let t = 0;
  const n = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    v.bell({ t, f: PENTA[Math.floor(Math.random() * PENTA.length)] * 2, parts: kit.SOFT, peak: rnd(0.07, 0.12), rel: rnd(1.6, 2.4) });
    t += rnd(0.25, 0.6);
  }
  return v.end;
}
function word(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.12, 0.04);
  const f = rnd(92, 118);
  v.tone({ type: 'triangle', f, f2: f * 0.9, gl: 0.7, a: 0.12, hold: 0.25, rel: 0.45, peak: 0.32, lp: 520, vr: 4.5, vc: 6 });
  v.tone({ type: 'sine', f: f * 2, f2: f * 1.8, gl: 0.7, a: 0.15, hold: 0.2, rel: 0.4, peak: 0.08 });
  return v.end;
}
function roar(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.3, 0.02);
  v.noise({ buf: 'brown', ft: 'lowpass', f: 520, a: 0.9, hold: 1.2, rel: 1.6, peak: 0.6 });
  v.noise({ buf: 'pink', f: 1400, q: 0.7, a: 0.8, hold: 1.0, rel: 1.4, peak: 0.18 });
  return v.end;
}
function gong(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.45, 0.01);
  v.bell({ f: 130.81, parts: kit.BELL, peak: 0.32, rel: 3.2 });
  v.tone({ type: 'sine', f: 65.4, a: 0.02, hold: 0.4, rel: 2.4, peak: 0.25 });
  [0.35, 0.6, 0.9, 1.15, 1.5].forEach((t, i) => v.bell({ t, f: PENTA[(i * 2 + 1) % PENTA.length] * 2, parts: kit.SOFT, peak: 0.08, rel: 1.6 }));
  return v.end;
}

export const EXTRA_SFX = {
  ln_chime: { fn: chime, max: 2, gap: 0.6, g: 1 },
  ln_word: { fn: word, max: 1, gap: 0.4, g: 1 },
  ln_roar: { fn: roar, max: 1, gap: 1, g: 1 },
  ln_gong: { fn: gong, max: 1, gap: 1, g: 1.1 },
};
