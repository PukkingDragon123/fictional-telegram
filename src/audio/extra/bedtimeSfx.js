// Sounds for the bedtime cutscene (src/game/Bedtime.js). Loaded by audio.js
// through import.meta.glob('./extra/*.js'); synthesised on demand.
// Names are prefixed bed_ so they never clash with other modules.
//
//   bed_yawn      a big sleepy "haaaWWmm" (soft, vowel-ish)
//   bed_scrub     one bristly toothbrush stroke (fired ~6x a second while brushing)
//   bed_foam      tiny foam bubble pop
//   bed_gargle    "glglglgl" + a little spit
//   bed_ding      sparkly clean-teeth "ding!"
//   bed_poof      cartoon clothes-change poof (whoosh + puff + twinkle)
//   bed_creak     wooden bed creak as he lands on the mattress
//   bed_quilt     cosy quilt rustle
//   bed_click     lamp pull-chain click
//   bed_snore     one cute snore (in-breath rumble + whistly out-breath)
//   bed_mumble    a sleepy little "mnyeh..."
//   bed_lullaby   soft music-box lullaby sting as he drifts off
const rnd = (a, b) => a + Math.random() * (b - a);

function yawn(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.12, 0.05);
  v.tone({ type: 'triangle', f: 330, f2: 520, gl: 0.35, a: 0.08, hold: 0.25, rel: 0.4, peak: 0.16, vr: 5, vc: 12, lp: 1600 });
  v.tone({ t: 0.55, type: 'triangle', f: 520, f2: 240, gl: 0.45, a: 0.02, hold: 0.1, rel: 0.35, peak: 0.12, vr: 4, vc: 10, lp: 1200 });
  v.noise({ buf: 'pink', f: 900, f2: 1500, gl: 0.4, q: 1.2, a: 0.12, hold: 0.3, rel: 0.4, peak: 0.08 });
  return v.end;
}
function scrub(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.02, 0.15);
  v.rustle({ buf: 'white', f: rnd(3800, 5200), f2: rnd(2600, 3400), q: 1.4, dur: rnd(0.06, 0.09), peak: 0.22, peakAt: 0.3, flicker: 0.9, n: 14 });
  v.noise({ buf: 'pink', ft: 'bandpass', f: 1400, q: 2, a: 0.004, rel: 0.05, peak: 0.05 });
  return v.end;
}
function foam(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.25);
  const f = rnd(1300, 2200);
  v.tone({ f, f2: f * 1.9, gl: 0.03, a: 0.001, rel: 0.05, peak: 0.12 });
  return v.end;
}
function gargle(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.06, 0.06);
  for (let i = 0; i < 9; i++) {
    const t = i * 0.075;
    v.tone({ t, type: 'triangle', f: rnd(180, 260), f2: rnd(320, 420), gl: 0.04, a: 0.005, rel: 0.05, peak: 0.12, lp: 1400 });
    v.noise({ t, buf: 'white', f: rnd(900, 1600), q: 3, a: 0.003, rel: 0.04, peak: 0.08 });
  }
  v.noise({ t: 0.78, buf: 'pink', f: 2200, f2: 900, gl: 0.08, q: 0.9, a: 0.005, rel: 0.09, peak: 0.16 });
  return v.end;
}
function ding(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.25, 0.02);
  v.bell({ f: 2637, parts: kit.GLOCK, peak: 0.2, rel: 0.9 });
  v.bell({ t: 0.06, f: 3951, parts: kit.CELESTA, peak: 0.1, rel: 0.7 });
  v.noise({ t: 0.02, buf: 'white', ft: 'highpass', f: 7000, q: 0.7, a: 0.005, rel: 0.25, peak: 0.03 });
  return v.end;
}
function poof(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.15, 0.06);
  v.noise({ buf: 'pink', f: 500, f2: 2600, gl: 0.18, q: 0.8, a: 0.03, hold: 0.04, rel: 0.25, peak: 0.4 });
  v.tone({ t: 0.12, f: 140, f2: 70, gl: 0.12, a: 0.003, rel: 0.18, peak: 0.35 });
  v.noise({ t: 0.12, buf: 'brown', ft: 'lowpass', f: 700, q: 0.6, a: 0.005, rel: 0.22, peak: 0.45 });
  [1568, 2093, 2637].forEach((f, i) => v.bell({ t: 0.26 + i * 0.06, f, parts: kit.CELESTA, peak: 0.08, rel: 0.5 }));
  return v.end;
}
function creak(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.08, 0.08);
  v.tone({ type: 'sawtooth', f: rnd(210, 260), f2: rnd(150, 180), gl: 0.25, a: 0.02, hold: 0.06, rel: 0.12, peak: 0.07, vr: 26, vc: 18, lp: 1100 });
  v.tone({ t: 0.04, type: 'square', f: rnd(330, 380), f2: 290, gl: 0.18, a: 0.01, rel: 0.12, peak: 0.03, lp: 900 });
  v.noise({ buf: 'brown', ft: 'lowpass', f: 400, q: 0.6, a: 0.003, rel: 0.12, peak: 0.25 });
  return v.end;
}
function quilt(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.08, 0.1);
  v.rustle({ buf: 'pink', f: 700, f2: 1400, q: 0.6, dur: 0.42, peak: 0.3, peakAt: 0.4, flicker: 0.3, n: 26, rise: 1.2 });
  return v.end;
}
function click(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.04);
  v.tone({ f: 2400, f2: 1300, gl: 0.01, a: 0.0005, rel: 0.02, peak: 0.3 });
  v.noise({ buf: 'white', f: 4200, q: 1.2, bursts: [[0, 0.5, 0.006], [0.07, 0.35, 0.008]] });
  v.tone({ t: 0.07, f: 1800, f2: 900, gl: 0.01, a: 0.0005, rel: 0.025, peak: 0.18 });
  return v.end;
}
function snore(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.1, 0.06);
  // in: a soft little rumble; out: a whistly "fweee"
  v.tone({ type: 'sawtooth', f: 74, f2: 92, gl: 0.6, a: 0.25, hold: 0.25, rel: 0.25, peak: 0.07, vr: 22, vc: 10, lp: 420 });
  v.noise({ buf: 'pink', ft: 'lowpass', f: 600, q: 0.7, a: 0.3, hold: 0.2, rel: 0.25, peak: 0.12 });
  v.tone({ t: 0.95, type: 'sine', f: 1150, f2: 1600, gl: 0.35, a: 0.06, hold: 0.08, rel: 0.25, peak: 0.05 });
  v.noise({ t: 0.95, buf: 'white', ft: 'bandpass', f: 2400, q: 2, a: 0.08, hold: 0.1, rel: 0.25, peak: 0.04 });
  return v.end;
}
function mumble(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.08, 0.08);
  [[0, 300, 360], [0.14, 380, 300], [0.3, 320, 260]].forEach(([t, f, f2]) => v.tone({ t, type: 'triangle', f, f2, gl: 0.12, a: 0.02, hold: 0.04, rel: 0.1, peak: 0.08, vr: 6, vc: 18, lp: 1100 }));
  return v.end;
}
function lullaby(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.35, 0);
  // music box: G E G E C D E ... gently slowing
  const notes = [[0, 784], [0.32, 659], [0.64, 784], [0.96, 659], [1.36, 523], [1.7, 587], [2.08, 659], [2.6, 523]];
  for (const [t, f] of notes) {
    v.bell({ t, f, parts: kit.CELESTA, peak: 0.12, rel: 1.1 });
    v.bell({ t: t + 0.01, f: f * 2, parts: kit.GLOCK, peak: 0.025, rel: 0.6 });
  }
  v.tone({ t: 0, type: 'sine', f: 196, a: 0.6, hold: 1.8, rel: 1.4, peak: 0.05 });
  v.tone({ t: 1.36, type: 'sine', f: 131, a: 0.4, hold: 1.0, rel: 1.4, peak: 0.05 });
  return v.end;
}

export const EXTRA_SFX = {
  bed_yawn: { fn: yawn, max: 1, gap: 0.5, g: 1.3 },
  bed_scrub: { fn: scrub, max: 2, gap: 0.07, g: 1.2 },
  bed_foam: { fn: foam, max: 3, gap: 0.08, g: 1.2 },
  bed_gargle: { fn: gargle, max: 1, gap: 0.5, g: 1.3 },
  bed_ding: { fn: ding, max: 1, gap: 0.3, g: 1.3 },
  bed_poof: { fn: poof, max: 1, gap: 0.3, g: 1.4 },
  bed_creak: { fn: creak, max: 2, gap: 0.15, g: 1.3 },
  bed_quilt: { fn: quilt, max: 1, gap: 0.3, g: 1.3 },
  bed_click: { fn: click, max: 1, gap: 0.2, g: 1.4 },
  bed_snore: { fn: snore, max: 1, gap: 1.2, g: 1.3 },
  bed_mumble: { fn: mumble, max: 1, gap: 0.5, g: 1.3 },
  bed_lullaby: { fn: lullaby, max: 1, gap: 2, g: 1.3 },
};
