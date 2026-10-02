// Sounds for the classroom cutscenes (src/game/Classroom.js). Loaded by
// audio.js through import.meta.glob('./extra/*.js'); synthesised on demand.
// Names are prefixed class_ so they never clash with other modules.
//
//   class_chalk       one gritty chalk scratch (fired every ~0.1 s while a stroke draws)
//   class_chalk_down  chalk taps onto the slate at the start of a stroke
//   class_erase       felt eraser swish
//   class_tap         wooden pointer knocking on the board: "tok"
//   class_bell        brass school handbell
//   class_pop         soft bubble pop (fish reactions, advancing a line)
//   class_cheer       a little chorus of happy fish "ooh!"s
//   class_whoosh      the title card dropping in / flipping away
//   class_stamp       rubber stamp thud
//   class_star        sparkly gold-star jingle
const rnd = (a, b) => a + Math.random() * (b - a);

function chalk(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.03, 0.15);
  v.rustle({ buf: 'white', f: rnd(2600, 3600), f2: rnd(1800, 2400), q: 1.6, dur: rnd(0.08, 0.13), peak: 0.32, peakAt: 0.25, flicker: 0.85, n: 18 });
  v.noise({ buf: 'white', ft: 'highpass', f: 5200, q: 0.6, bursts: [[0, 0.06, 0.02], [0.04, 0.05, 0.015]] });
  return v.end;
}

function chalkDown(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.04, 0.12);
  v.noise({ buf: 'white', f: 3200, q: 1.4, bursts: [[0, 0.5, 0.014], [0.012, 0.25, 0.02]] });
  v.tone({ f: 900, f2: 500, gl: 0.02, a: 0.001, rel: 0.03, peak: 0.08 });
  return v.end;
}

function erase(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.06, 0.1);
  v.rustle({ buf: 'pink', f: 900, f2: 1600, q: 0.7, dur: rnd(0.22, 0.3), peak: 0.38, peakAt: 0.5, flicker: 0.35, n: 22, rise: 1.4 });
  v.noise({ buf: 'white', f: 4200, q: 0.8, a: 0.03, rel: 0.12, peak: 0.05 });
  return v.end;
}

function tap(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.12, 0.06);
  v.tone({ type: 'triangle', f: 620, f2: 380, gl: 0.04, a: 0.001, rel: 0.09, peak: 0.42 });
  v.tone({ f: 1240, f2: 900, gl: 0.03, a: 0.001, rel: 0.05, peak: 0.12 });
  v.noise({ buf: 'white', f: 2400, q: 1.2, bursts: [[0, 0.4, 0.01]] });
  return v.end;
}

function bell(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.3, 0.02);
  const f = 1320;
  for (let i = 0; i < 6; i++) {
    const t = i * 0.11 + (i % 2) * 0.012;
    v.bell({ t, f: f * (i % 2 ? 1.06 : 1), parts: kit.BELL, peak: 0.22 * (1 - i * 0.08), rel: 0.7 });
    v.noise({ t, buf: 'white', f: 5200, q: 0.9, bursts: [[0, 0.12, 0.008]] });
  }
  return v.end;
}

function pop(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.08, 0.2);
  const f = rnd(560, 820);
  v.tone({ f, f2: f * 2.6, gl: 0.05, a: 0.002, rel: 0.08, peak: 0.28 });
  v.tone({ t: 0.03, type: 'triangle', f: f * 2, a: 0.002, rel: 0.05, peak: 0.05 });
  return v.end;
}

function cheer(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.25, 0.02);
  // a few tiny bubbly voices going "ooh!" upward
  for (let i = 0; i < 5; i++) {
    const t = i * 0.06 + rnd(0, 0.04), f = rnd(520, 900);
    v.tone({ t, type: 'triangle', f, f2: f * 1.5, gl: 0.22, a: 0.03, hold: 0.06, rel: 0.16, peak: 0.12, vr: 9, vc: 30, lp: 2400 });
  }
  v.bell({ t: 0.32, f: 2093, parts: kit.SOFT, peak: 0.1, rel: 0.5 });
  return v.end;
}

function whoosh(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.1, 0.05);
  v.noise({ buf: 'pink', f: 400, f2: 2400, gl: 0.22, q: 0.9, a: 0.08, hold: 0.04, rel: 0.16, peak: 0.42 });
  return v.end;
}

function stamp(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.12, 0.03);
  v.tone({ f: 160, f2: 60, gl: 0.08, a: 0.002, rel: 0.18, peak: 0.6 });
  v.noise({ buf: 'brown', ft: 'lowpass', f: 900, q: 0.5, a: 0.002, rel: 0.12, peak: 0.6 });
  v.noise({ buf: 'white', f: 1800, q: 0.9, bursts: [[0, 0.35, 0.02]] });
  return v.end;
}

function star(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.35, 0.01);
  [1568, 1976, 2349, 3136].forEach((f, i) => v.bell({ t: i * 0.075, f, parts: kit.CELESTA, peak: 0.16, rel: 0.6 }));
  v.bell({ t: 0.34, f: 4186, parts: kit.GLOCK, peak: 0.08, rel: 0.8 });
  return v.end;
}

export const EXTRA_SFX = {
  class_chalk: { fn: chalk, max: 3, gap: 0.05, g: 1.3 },
  class_chalk_down: { fn: chalkDown, max: 3, gap: 0.04, g: 1.3 },
  class_erase: { fn: erase, max: 2, gap: 0.12, g: 1.4 },
  class_tap: { fn: tap, max: 3, gap: 0.06, g: 1.4 },
  class_bell: { fn: bell, max: 1, gap: 0.5, g: 1.4 },
  class_pop: { fn: pop, max: 4, gap: 0.04, g: 1.3 },
  class_cheer: { fn: cheer, max: 1, gap: 0.4, g: 1.4 },
  class_whoosh: { fn: whoosh, max: 2, gap: 0.1, g: 1.4 },
  class_stamp: { fn: stamp, max: 1, gap: 0.3, g: 1.4 },
  class_star: { fn: star, max: 1, gap: 0.3, g: 1.3 },
};
