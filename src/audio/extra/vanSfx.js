// Moose Express van sounds. Loaded by audio.js through import.meta.glob('./extra/*.js').
//
//   van_horn   one cheerful "meep!" of the little two-tone horn (the van beeps twice)
//   van_start  starter whirr, then the engine catches: putt-putt-putt
//   van_door   back door: latch click and a hinge squeak
//   van_shut   back door slammed shut: a hollow tin thunk
//   van_ramp   the roller ramp clanks down onto the ground
//   van_roll   a parcel rattling down the rollers
const rnd = (a, b) => a + Math.random() * (b - a);

function vanHorn(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.1, 0.02);
  // two slightly sour square voices a fourth apart: a toy-car "meep"
  for (const [f, p] of [[620, 0.3], [830, 0.24]]) {
    v.tone({ type: 'square', f: f * 0.94, f2: f, gl: 0.03, a: 0.006, hold: 0.13, rel: 0.06, peak: p, lp: 2600, q: 1.2 });
    v.tone({ type: 'sawtooth', f, a: 0.008, hold: 0.12, rel: 0.05, peak: p * 0.35, lp: 1800, det: 9 });
  }
  v.noise({ buf: 'white', f: 3200, q: 2, bursts: [[0, 0.05, 0.02]] });
  return v.end;
}

function vanStart(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.05);
  // starter motor: a rising whine with a rough edge
  v.tone({ type: 'sawtooth', f: 90, f2: 160, gl: 0.32, a: 0.02, hold: 0.24, rel: 0.06, peak: 0.12, lp: 900 });
  v.noise({ buf: 'pink', f: 500, f2: 900, gl: 0.3, q: 1.2, a: 0.02, hold: 0.22, rel: 0.06, peak: 0.18 });
  // catches: a few low chuffs speeding up
  let t = 0.34;
  for (let i = 0; i < 7; i++) {
    const a = 1 - i / 9;
    v.tone({ t, type: 'triangle', f: rnd(68, 80), f2: 48, gl: 0.06, a: 0.003, rel: 0.08, peak: 0.42 * a, lp: 500 });
    v.noise({ t, buf: 'brown', ft: 'lowpass', f: 420, q: 0.6, a: 0.003, rel: 0.07, peak: 0.55 * a });
    t += 0.12 - i * 0.008;
  }
  return v.end;
}

function vanDoor(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.08, 0.06);
  v.noise({ buf: 'white', f: 3600, q: 2.5, bursts: [[0, 0.4, 0.012], [0.035, 0.25, 0.01]] }); // latch
  v.tone({ t: 0.002, type: 'triangle', f: 1300, f2: 900, gl: 0.03, a: 0.001, rel: 0.04, peak: 0.08 });
  // hinge squeak
  v.tone({ t: 0.08, type: 'sawtooth', f: 1150, f2: 1500, gl: 0.22, a: 0.03, hold: 0.12, rel: 0.1, peak: 0.05, lp: 2400, q: 6, vr: 18, vc: 40 });
  return v.end;
}

function vanShut(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.1, 0.05);
  v.tone({ type: 'triangle', f: 150, f2: 90, gl: 0.07, a: 0.001, rel: 0.16, peak: 0.5, lp: 700 });
  v.noise({ buf: 'pink', f: 600, q: 0.9, bursts: [[0, 0.8, 0.05]] });
  v.tone({ t: 0.01, type: 'square', f: 420, f2: 380, gl: 0.04, a: 0.001, rel: 0.09, peak: 0.05, lp: 1500 }); // tinny body ring
  v.noise({ t: 0.05, buf: 'white', f: 3200, q: 2, bursts: [[0, 0.18, 0.01]] }); // latch catches
  return v.end;
}

function vanRamp(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.1, 0.05);
  // the ramp slides out (a rumbly scrape) and clanks onto the ground
  v.rustle({ buf: 'pink', dur: 0.32, f: 1400, f2: 900, q: 1.4, n: 18, peak: 0.25, peakAt: 0.6, flicker: 0.5 });
  v.tone({ t: 0.34, type: 'triangle', f: 260, f2: 170, gl: 0.06, a: 0.001, rel: 0.14, peak: 0.36, lp: 1200 });
  v.bell({ t: 0.34, f: 1180, parts: kit.SOFT, peak: 0.06, rel: 0.3 });
  v.noise({ t: 0.34, buf: 'pink', f: 900, q: 1, bursts: [[0, 0.6, 0.03], [0.07, 0.2, 0.02]] });
  return v.end;
}

function vanRoll(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.08);
  // rollers: a quick run of light ticks
  let t = 0;
  for (let i = 0; i < 9; i++) {
    v.noise({ t, buf: 'white', f: rnd(2000, 3000), q: 2.4, bursts: [[0, 0.22 * (1 - i / 12), 0.012]] });
    v.tone({ t, type: 'triangle', f: rnd(700, 900), a: 0.001, rel: 0.02, peak: 0.03 });
    t += 0.03 + i * 0.002;
  }
  return v.end;
}

export const EXTRA_SFX = {
  van_horn: { fn: vanHorn, max: 2, gap: 0.12, g: 1.6 },
  van_start: { fn: vanStart, max: 1, gap: 0.5, g: 2.2 },
  van_door: { fn: vanDoor, max: 2, gap: 0.1, g: 2.6 },
  van_shut: { fn: vanShut, max: 2, gap: 0.15, g: 2.4 },
  van_ramp: { fn: vanRamp, max: 1, gap: 0.3, g: 2.6 },
  van_roll: { fn: vanRoll, max: 3, gap: 0.08, g: 3.2 },
};
