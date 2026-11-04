// [v32 dive] Sounds for THE DIVE. Loaded by audio.js through import.meta.glob('./extra/*.js').
//
//   dv_plunge   going under: a splash, then the world goes muffled with a rush of bubbles
//   dv_bubbles  a little burst of bubbles (exhale, a vent, stocking a pen)
//   dv_tweet    Chief Buff's pea whistle: a sharp trilled TWEEEET
//   dv_gulp     surfacing: a gasp of air after the gurgle
const rnd = (a, b) => a + Math.random() * (b - a);

function plunge(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.35, 0.02);
  v.noise({ buf: 'white', ft: 'bandpass', f: 1800, q: 0.8, a: 0.005, hold: 0.06, rel: 0.25, peak: 0.45 });
  v.noise({ t: 0.08, buf: 'brown', ft: 'lowpass', f: 420, a: 0.12, hold: 0.5, rel: 0.7, peak: 0.5 });
  for (let i = 0; i < 9; i++) { const f = rnd(300, 900); v.tone({ t: 0.15 + i * 0.07 + rnd(0, 0.04), type: 'sine', f, f2: f * 1.8, gl: 0.06, a: 0.004, hold: 0.01, rel: 0.05, peak: 0.12 }); }
  return v.end;
}
function bubbles(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.25, 0.04);
  const n = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) { const f = rnd(380, 1100); v.tone({ t: i * rnd(0.04, 0.09), type: 'sine', f, f2: f * rnd(1.5, 2.2), gl: 0.05, a: 0.003, hold: 0.01, rel: 0.05, peak: 0.1 }); }
  return v.end;
}
function tweet(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.2, 0.01);
  v.tone({ type: 'square', f: 2350, a: 0.01, hold: 0.55, rel: 0.08, peak: 0.08, lp: 5200, vr: 28, vc: 120 });
  v.tone({ type: 'sine', f: 2350, a: 0.01, hold: 0.55, rel: 0.08, peak: 0.12, vr: 28, vc: 120 });
  v.noise({ buf: 'white', ft: 'highpass', f: 3500, a: 0.01, hold: 0.5, rel: 0.08, peak: 0.04 });
  return v.end;
}
function gulp(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.2, 0.02);
  v.noise({ buf: 'pink', ft: 'bandpass', f: 900, q: 1.2, a: 0.02, hold: 0.12, rel: 0.25, peak: 0.25 });
  v.noise({ t: 0.22, buf: 'white', ft: 'bandpass', f: 2400, q: 0.7, a: 0.04, hold: 0.14, rel: 0.2, peak: 0.22 });
  return v.end;
}

export const EXTRA_SFX = {
  dv_plunge: { fn: plunge, max: 1, gap: 0.5, g: 1 },
  dv_bubbles: { fn: bubbles, max: 3, gap: 0.08, g: 1 },
  dv_tweet: { fn: tweet, max: 1, gap: 0.4, g: 0.9 },
  dv_gulp: { fn: gulp, max: 1, gap: 0.5, g: 1 },
};
