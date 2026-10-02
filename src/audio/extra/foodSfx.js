// Food sounds (the Food picker, bowls and storage, the harvest, the Bug Grinder).
// Loaded by audio.js through import.meta.glob('./extra/*.js'); synthesised on demand.
//
//   bag_rustle       picking up a bag: crinkly paper / foil
//   scoop            a scoop digs into kibble and rattles out
//   bag_empty        an empty bag: hollow crumple and a sad little "bwomp"
//   harvest_pop      produce pops out of the ground: juicy pop + rising pluck
//   harvest_special  a special find: sparkle arpeggio, shimmer and a warm chord
//   bowl_fill        food clatters into a ceramic bowl: clinks and a thunk
//   crate_drop       a wooden crate set down, the produce inside rattles
//   grinder          the Bug Grinder: ratcheting gears, a grind, a zap
//   zap              a bug zapper: "bzzt!"
const rnd = (a, b) => a + Math.random() * (b - a);

function bagRustle(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.04, 0.08);
  const d = rnd(0.22, 0.3);
  v.rustle({ buf: 'pink', dur: d, f: 1400, f2: 2600, q: 0.6, n: 22, peak: 0.5, peakAt: 0.3, flicker: 0.5, rise: 0.8, fall: 1.3 });
  v.rustle({ dur: d * 0.9, f: 4200, f2: 6200, q: 0.8, n: 34, peak: 0.45, peakAt: 0.25, flicker: 0.9 });
  for (let i = 0; i < 5; i++) v.noise({ t: rnd(0.01, d * 0.8), buf: 'white', ft: 'highpass', f: rnd(5000, 8000), q: 0.7, bursts: [[0, rnd(0.2, 0.4), 0.006]] });
  return v.end;
}

function scoop(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.06, 0.08);
  // the scoop shoves into the kibble
  v.noise({ buf: 'pink', f: 1700, f2: 900, gl: 0.08, q: 0.8, a: 0.01, rel: 0.09, peak: 0.55 });
  v.tone({ type: 'triangle', f: 520, f2: 380, gl: 0.05, a: 0.002, rel: 0.06, peak: 0.12 });
  // and a handful rattles out
  let t = 0.06;
  for (let i = 0; i < 9; i++) {
    const a = 1 - i / 11, f = rnd(1800, 4200);
    v.noise({ t, buf: 'white', f, q: 2.2, bursts: [[0, 0.32 * a, 0.012]] });
    v.tone({ t, f: f * 0.6, a: 0.001, rel: 0.025, peak: 0.04 * a });
    t += rnd(0.012, 0.035);
  }
  return v.end;
}

function bagEmpty(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.06, 0.04);
  v.rustle({ buf: 'pink', dur: 0.22, f: 900, f2: 500, q: 0.7, n: 18, peak: 0.45, peakAt: 0.2, flicker: 0.6 });
  v.noise({ t: 0.03, buf: 'pink', ft: 'lowpass', f: 600, q: 0.5, a: 0.004, rel: 0.12, peak: 0.4 }); // a hollow puff
  v.tone({ t: 0.06, type: 'triangle', f: 330, f2: 300, gl: 0.12, a: 0.01, hold: 0.04, rel: 0.12, peak: 0.22, lp: 1400 });
  v.tone({ t: 0.22, type: 'triangle', f: 262, f2: 196, gl: 0.25, a: 0.01, hold: 0.06, rel: 0.25, peak: 0.26, lp: 1100 });
  return v.end;
}

function harvestPop(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.12, 0.06);
  v.noise({ buf: 'white', f: 2200, q: 1, bursts: [[0, 0.5, 0.01]] });
  v.tone({ f: 240, f2: 820, gl: 0.05, a: 0.002, rel: 0.09, peak: 0.42 });
  v.tone({ t: 0.01, f: 480, f2: 1500, gl: 0.04, a: 0.002, rel: 0.05, peak: 0.08 });
  v.pluck({ t: 0.04, midi: 79, dur: 0.12, rel: 0.2, peak: 0.22 });
  v.bell({ t: 0.07, f: 2093, parts: kit.SOFT, peak: 0.07, rel: 0.25 });
  return v.end;
}

function harvestSpecial(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.35, 0.01);
  v.noise({ buf: 'pink', f: 500, f2: 4800, gl: 0.5, q: 0.7, a: 0.4, hold: 0.04, rel: 0.25, peak: 0.3 });
  [784, 988, 1175, 1568, 1976, 2349].forEach((f, i) => v.bell({ t: 0.05 + i * 0.07, f, parts: kit.GLOCK, peak: 0.12, rel: 0.6 }));
  for (const f of [392, 494, 587, 784]) v.tone({ t: 0.45, type: 'triangle', f, a: 0.03, hold: 0.35, rel: 0.6, peak: 0.07, lp: 2600, vr: 5, vc: 8 });
  v.bell({ t: 0.45, f: 1568, parts: kit.CELESTA, peak: 0.16, rel: 1.1 });
  v.bell({ t: 0.45, f: 3136, parts: kit.CELESTA, peak: 0.08, rel: 0.9 });
  for (let i = 0; i < 10; i++) v.tone({ t: 0.55 + i * 0.07 + rnd(0, 0.04), f: [2637, 3136, 3520, 4186][i % 4], a: 0.002, rel: 0.2, peak: 0.05 * (1 - i / 12) });
  return v.end;
}

function bowlFill(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.1, 0.06);
  v.tone({ f: 180, f2: 110, gl: 0.06, a: 0.002, rel: 0.1, peak: 0.3 }); // the thunk into the bowl
  v.noise({ buf: 'pink', f: 900, q: 0.8, a: 0.002, rel: 0.06, peak: 0.35 });
  let t = 0.03;
  for (let i = 0; i < 6; i++) {
    const a = 1 - i / 8;
    v.bell({ t, f: rnd(1900, 2600), parts: [[1, 1, 1], [2.7, 0.4, 0.5]], peak: 0.08 * a, rel: 0.18 }); // ceramic clinks
    v.noise({ t, buf: 'white', f: rnd(2500, 4500), q: 2, bursts: [[0, 0.22 * a, 0.01]] });
    t += rnd(0.025, 0.06);
  }
  return v.end;
}

function crateDrop(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.08, 0.05);
  v.tone({ type: 'triangle', f: 210, f2: 120, gl: 0.06, a: 0.001, rel: 0.12, peak: 0.45, lp: 900 });
  v.noise({ buf: 'pink', f: 700, q: 1.2, bursts: [[0, 0.7, 0.03], [0.05, 0.25, 0.02]] }); // wood knock + small bounce
  v.tone({ t: 0.05, type: 'triangle', f: 640, f2: 520, gl: 0.03, a: 0.001, rel: 0.05, peak: 0.1 });
  let t = 0.04;
  for (let i = 0; i < 4; i++) { v.noise({ t, buf: 'pink', f: rnd(1200, 2000), q: 1.5, bursts: [[0, 0.2, 0.02]] }); t += rnd(0.03, 0.06); }
  return v.end;
}

function grinder(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.06, 0.04);
  // ratcheting gears
  for (let i = 0; i < 8; i++) {
    const t = i * 0.045;
    v.noise({ t, buf: 'white', f: 3000 + (i % 2) * 600, q: 3, bursts: [[0, 0.3, 0.008]] });
    v.tone({ t, type: 'square', f: 900, f2: 700, gl: 0.01, a: 0.001, rel: 0.015, peak: 0.03, lp: 2500 });
  }
  // the grind: a wobbling rasp
  v.tone({ type: 'sawtooth', f: 85, f2: 110, gl: 0.4, a: 0.03, hold: 0.25, rel: 0.1, peak: 0.12, lp: 900, vr: 18, vc: 60 });
  v.rustle({ dur: 0.38, f: 1500, f2: 2200, q: 1.4, n: 30, peak: 0.35, peakAt: 0.5, flicker: 0.7 });
  // and a little zap at the end
  zapInto(v, 0.4, 0.7);
  return v.end;
}

function zapInto(v, t, amp) {
  v.tone({ t, type: 'square', f: 1200, f2: 300, gl: 0.12, a: 0.002, rel: 0.1, peak: 0.08 * amp, lp: 3000, vr: 60, vc: 400, vd: 0.01 });
  v.tone({ t, type: 'sawtooth', f: 120, a: 0.002, hold: 0.06, rel: 0.05, peak: 0.1 * amp, lp: 2600 }); // mains hum buzz
  v.noise({ t, buf: 'white', f: 4200, q: 0.8, bursts: [[0, 0.5 * amp, 0.015], [0.02, 0.35 * amp, 0.012], [0.045, 0.45 * amp, 0.02], [0.075, 0.2 * amp, 0.03]] });
}

function zap(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.06, 0.06);
  zapInto(v, 0, 1);
  v.tone({ t: 0.1, f: 2400, f2: 1800, gl: 0.03, a: 0.001, rel: 0.04, peak: 0.04 }); // the tiny "tink"
  return v.end;
}

export const EXTRA_SFX = {
  bag_rustle: { fn: bagRustle, max: 2, gap: 0.08, g: 1.6 },
  scoop: { fn: scoop, max: 3, gap: 0.05, g: 1.6 },
  bag_empty: { fn: bagEmpty, max: 1, gap: 0.25, g: 1.5 },
  harvest_pop: { fn: harvestPop, max: 4, gap: 0.05, g: 1.8 },
  harvest_special: { fn: harvestSpecial, max: 1, gap: 0.6, g: 1.4 },
  bowl_fill: { fn: bowlFill, max: 2, gap: 0.08, g: 1.8 },
  crate_drop: { fn: crateDrop, max: 2, gap: 0.08, g: 1.6 },
  grinder: { fn: grinder, max: 2, gap: 0.3, g: 1.6 },
  zap: { fn: zap, max: 3, gap: 0.08, g: 1.4 },
};
