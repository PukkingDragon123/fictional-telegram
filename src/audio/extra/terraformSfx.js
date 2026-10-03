// Terraform tool sounds. Loaded by audio.js through import.meta.glob('./extra/*.js').
//
//   tf_raise   earth heaving up: a soft low thump, gravel trickle, a rising "bloop"
//   tf_lower   a spade scooping out a dip: scrape down + hollow thock
//   tf_paint   a fat brush swish with a little twinkle
//   tf_fill    dirt shovelled into water: pour, plop, muddy gulp
//   tf_sign    knocking on the wooden name sign
const rnd = (a, b) => a + Math.random() * (b - a);

function raise(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.08, 0.08);
  v.tone({ type: 'sine', f: 130, f2: 62, gl: 0.12, a: 0.004, rel: 0.2, peak: 0.55 });
  v.noise({ buf: 'pink', ft: 'lowpass', f: 900, q: 0.6, a: 0.006, rel: 0.16, peak: 0.42 });
  let t = 0.05;
  for (let i = 0; i < 6; i++) { v.noise({ t, buf: 'white', f: rnd(1800, 3600), q: 2, bursts: [[0, 0.22 * (1 - i / 7), 0.01]] }); t += rnd(0.02, 0.05); }
  v.tone({ t: 0.05, type: 'triangle', f: 220, f2: 440, gl: 0.08, a: 0.004, rel: 0.1, peak: 0.12, lp: 2200 });
  return v.end;
}

function lower(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.06, 0.08);
  v.noise({ buf: 'pink', f: 1800, f2: 700, gl: 0.12, q: 0.9, a: 0.01, rel: 0.12, peak: 0.5 });
  v.tone({ t: 0.08, type: 'triangle', f: 300, f2: 150, gl: 0.1, a: 0.003, rel: 0.12, peak: 0.26, lp: 1400 });
  v.tone({ t: 0.08, type: 'sine', f: 90, f2: 60, gl: 0.1, a: 0.003, rel: 0.14, peak: 0.3 });
  return v.end;
}

function paint(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.25, 0.1);
  v.rustle({ buf: 'pink', dur: 0.2, f: 1300, f2: 3200, q: 0.7, n: 16, peak: 0.42, peakAt: 0.35, flicker: 0.3 });
  v.bell({ t: 0.09, f: rnd(1900, 2400), parts: kit.SOFT, peak: 0.07, rel: 0.3 });
  v.bell({ t: 0.15, f: rnd(2600, 3200), parts: kit.SOFT, peak: 0.05, rel: 0.25 });
  return v.end;
}

function fill(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.1, 0.08);
  v.rustle({ buf: 'pink', dur: 0.22, f: 700, f2: 420, q: 0.6, n: 20, peak: 0.5, peakAt: 0.2, flicker: 0.6 });
  v.tone({ t: 0.16, type: 'sine', f: 380, f2: 140, gl: 0.08, a: 0.003, rel: 0.12, peak: 0.34 });
  v.noise({ t: 0.16, buf: 'pink', ft: 'lowpass', f: 700, q: 0.5, a: 0.004, rel: 0.16, peak: 0.35 });
  v.tone({ t: 0.26, type: 'sine', f: 160, f2: 300, gl: 0.06, a: 0.003, rel: 0.08, peak: 0.16 });
  return v.end;
}

function sign(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.12, 0.05);
  for (const [t, f] of [[0, 330], [0.11, 290]]) {
    v.noise({ t, buf: 'white', f: 2400, q: 1.4, bursts: [[0, 0.3, 0.008]] });
    v.tone({ t, type: 'triangle', f, f2: f * 0.8, gl: 0.04, a: 0.001, rel: 0.07, peak: 0.34, lp: 1800 });
  }
  return v.end;
}

export const EXTRA_SFX = {
  tf_raise: { fn: raise, max: 3, gap: 0.06, g: 1.6 },
  tf_lower: { fn: lower, max: 3, gap: 0.06, g: 1.6 },
  tf_paint: { fn: paint, max: 3, gap: 0.05, g: 1.4 },
  tf_fill: { fn: fill, max: 3, gap: 0.06, g: 1.6 },
  tf_sign: { fn: sign, max: 2, gap: 0.1, g: 1.4 },
};
