// [v26 evening] Sounds for Reynard's home office + the cooler night/morning (src/game/ext/homePC.js,
// src/game/Bedtime.js). Loaded by audio.js through import.meta.glob('./extra/*.js').
//   ev_slam    fists on a walnut desk: a deep thud + the clutter rattling
//   ev_key     one chunky mechanical keyboard clack
//   ev_boot    old PC power-on: relay clunk, rising CRT whine, a little degauss thump
//   ev_twinkle night sky shimmer (the stars start to wheel)
//   ev_chirp   a morning bird, two notes
const rnd = (a, b) => a + Math.random() * (b - a);

function slam(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.1, 0.06);
  v.tone({ f: 110, f2: 48, gl: 0.12, a: 0.002, rel: 0.22, peak: 0.6 });
  v.noise({ buf: 'brown', ft: 'lowpass', f: 600, q: 0.7, a: 0.002, rel: 0.18, peak: 0.7 });
  for (let i = 0; i < 5; i++) v.noise({ t: 0.05 + i * 0.045 + rnd(0, 0.02), buf: 'white', f: rnd(2500, 4200), q: 3, a: 0.001, rel: 0.03, peak: 0.12 });
  return v.end;
}
function key(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.02, 0.2);
  v.noise({ buf: 'white', f: rnd(1800, 2600), q: 2.5, a: 0.001, rel: 0.035, peak: 0.3 });
  v.tone({ f: rnd(380, 460), f2: 200, gl: 0.03, a: 0.001, rel: 0.04, peak: 0.12 });
  return v.end;
}
function boot(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.08, 0.02);
  v.noise({ buf: 'brown', ft: 'lowpass', f: 500, q: 0.8, a: 0.002, rel: 0.12, peak: 0.5 });
  v.tone({ t: 0.05, type: 'sine', f: 9000, f2: 15000, gl: 0.6, a: 0.05, hold: 0.3, rel: 0.3, peak: 0.04 });
  v.tone({ t: 0.12, f: 60, f2: 50, gl: 0.3, a: 0.01, rel: 0.35, peak: 0.35 });
  v.tone({ t: 0.5, type: 'square', f: 880, a: 0.002, hold: 0.06, rel: 0.02, peak: 0.08, lp: 2400 });
  return v.end;
}
function twinkle(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.35, 0.02);
  [1568, 2093, 2349, 3136, 2637, 3520].forEach((f, i) => v.bell({ t: i * 0.11, f, parts: kit.CELESTA, peak: 0.07, rel: 0.9 }));
  return v.end;
}
function chirp(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.15, 0.08);
  v.tone({ f: 3200, f2: 4200, gl: 0.06, a: 0.005, rel: 0.06, peak: 0.12 });
  v.tone({ t: 0.12, f: 3800, f2: 2900, gl: 0.08, a: 0.005, rel: 0.08, peak: 0.12 });
  return v.end;
}

export const EXTRA_SFX = {
  ev_slam: { fn: slam, max: 2, gap: 0.08, g: 1.4 },
  ev_key: { fn: key, max: 4, gap: 0.03, g: 2 },
  ev_boot: { fn: boot, max: 1, gap: 0.5, g: 1.6 },
  ev_twinkle: { fn: twinkle, max: 1, gap: 0.5, g: 1.4 },
  ev_chirp: { fn: chirp, max: 3, gap: 0.1, g: 1.2 },
};
