// [v32 dig] THE DIG's sounds. Loaded by audio.js through import.meta.glob('./extra/*.js').
//
//   dig_open    the dig tray comes up: a crate lid creak and a soft thump
//   dig_brush   a scratchy little brush stroke on dry dirt
//   dig_pick    a steel pick on rock: a bright tink + gravel
//   dig_thud    the pick into soft dirt
//   dig_crack   bone cracking (a dry snap + a little rattle)
//   dig_glint   a find catching the light (two soft glock notes)
//   dig_uv      the UV lamp buzzing on
//   dig_tink    Snapp's rock hammer on his palm
//   dig_chomp   Snapp's beak snapping shut
//   dig_vial    the vial: a cork pop and a glug
//   dig_brew    brewing at the bench: bubbles rising
//   dig_rumble  the transformation building up: a low rumble under bubbling
//   dig_roar    the ancient fish wakes: a deep watery roar and a shimmer
const rnd = (a, b) => a + Math.random() * (b - a);

function open(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.2, 0.05);
  v.tone({ type: 'sawtooth', f: 180, f2: 120, gl: 0.25, a: 0.02, hold: 0.12, rel: 0.12, peak: 0.08, lp: 900 });
  v.noise({ buf: 'brown', ft: 'lowpass', f: 400, t: 0.22, a: 0.005, rel: 0.18, peak: 0.5 });
  return v.end;
}
function brush(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.12);
  v.noise({ buf: 'white', ft: 'bandpass', f: rnd(2600, 3800), f2: rnd(1800, 2400), q: 1.4, a: 0.01, hold: 0.04, rel: 0.07, peak: 0.28 });
  return v.end;
}
function pick(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.18, 0.08);
  v.bell({ f: rnd(1850, 2150), parts: kit.GLOCK || kit.BELL, peak: 0.18, rel: 0.25 });
  v.noise({ buf: 'white', ft: 'highpass', f: 2600, a: 0.001, rel: 0.05, peak: 0.35 });
  v.noise({ buf: 'pink', ft: 'bandpass', f: 900, q: 0.8, t: 0.02, a: 0.004, hold: 0.04, rel: 0.12, peak: 0.3 });
  return v.end;
}
function thud(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.08, 0.1);
  v.tone({ type: 'sine', f: 130, f2: 70, gl: 0.08, a: 0.002, rel: 0.12, peak: 0.4 });
  v.noise({ buf: 'brown', ft: 'lowpass', f: 700, a: 0.002, rel: 0.14, peak: 0.45 });
  return v.end;
}
function crack(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.12, 0.05);
  v.noise({ buf: 'white', ft: 'bandpass', f: 1800, q: 2.2, a: 0.0005, rel: 0.035, peak: 0.6 });
  v.noise({ buf: 'white', ft: 'bandpass', f: 1200, q: 2, t: 0.04, a: 0.0005, rel: 0.03, peak: 0.4 });
  v.noise({ buf: 'pink', ft: 'bandpass', f: 600, q: 1, t: 0.07, bursts: [[0, 0.25, 0.02], [0.05, 0.18, 0.02], [0.11, 0.1, 0.02]] });
  v.tone({ type: 'triangle', f: 320, f2: 160, gl: 0.1, a: 0.001, rel: 0.1, peak: 0.12 });
  return v.end;
}
function glint(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.35, 0.03);
  v.bell({ f: 1568, parts: kit.SOFT, peak: 0.1, rel: 0.5 });
  v.bell({ t: 0.07, f: 2093, parts: kit.SOFT, peak: 0.08, rel: 0.6 });
  return v.end;
}
function uv(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.1, 0.02);
  v.tone({ type: 'square', f: 120, a: 0.02, hold: 0.25, rel: 0.15, peak: 0.05, lp: 700 });
  v.tone({ type: 'sine', f: 880, f2: 1320, gl: 0.2, a: 0.04, hold: 0.1, rel: 0.2, peak: 0.06 });
  return v.end;
}
function tink(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.15, 0.06);
  v.bell({ f: rnd(1300, 1500), parts: kit.SOFT, peak: 0.12, rel: 0.15 });
  v.noise({ buf: 'white', ft: 'highpass', f: 3000, a: 0.001, rel: 0.02, peak: 0.12 });
  return v.end;
}
function chomp(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.1, 0.05);
  v.noise({ buf: 'white', ft: 'bandpass', f: 1400, q: 1.5, a: 0.0005, rel: 0.05, peak: 0.55 });
  v.tone({ type: 'sine', f: 180, f2: 90, gl: 0.06, a: 0.001, rel: 0.1, peak: 0.45 });
  return v.end;
}
function vial(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.25, 0.03);
  v.tone({ type: 'sine', f: 520, f2: 180, gl: 0.05, a: 0.001, rel: 0.06, peak: 0.4 }); // pop
  for (let k = 0; k < 4; k++) v.tone({ t: 0.15 + k * 0.12, type: 'sine', f: rnd(300, 420), f2: rnd(600, 800), gl: 0.08, a: 0.005, rel: 0.08, peak: 0.22 }); // glug
  return v.end;
}
function brew(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.3, 0.03);
  for (let k = 0; k < 9; k++) v.tone({ t: k * 0.09 + rnd(0, 0.04), type: 'sine', f: rnd(500, 900), f2: rnd(1000, 1500), gl: 0.06, a: 0.004, rel: 0.06, peak: 0.12 });
  v.bell({ t: 0.85, f: 1046.5, parts: kit.SOFT, peak: 0.1, rel: 0.8 });
  return v.end;
}
function rumble(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.3, 0.02);
  v.noise({ buf: 'brown', ft: 'lowpass', f: 160, f2: 420, gl: 1.4, a: 0.6, hold: 0.8, rel: 0.4, peak: 0.8 });
  v.tone({ type: 'sine', f: 48, f2: 62, gl: 1.6, a: 0.5, hold: 0.9, rel: 0.4, peak: 0.35 });
  for (let k = 0; k < 10; k++) v.tone({ t: k * 0.16, type: 'sine', f: rnd(200, 360), f2: rnd(500, 700), gl: 0.07, a: 0.004, rel: 0.07, peak: 0.1 });
  return v.end;
}
function roar(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.45, 0.02);
  v.tone({ type: 'sawtooth', f: 92, f2: 60, gl: 0.9, a: 0.05, hold: 0.35, rel: 0.6, peak: 0.28, lp: 520, vr: 6, vc: 40 });
  v.tone({ type: 'square', f: 46, f2: 38, gl: 0.9, a: 0.05, hold: 0.3, rel: 0.6, peak: 0.16, lp: 300 });
  v.noise({ buf: 'pink', ft: 'lowpass', f: 900, f2: 300, gl: 1, a: 0.02, hold: 0.3, rel: 0.8, peak: 0.45 });
  [0.2, 0.32, 0.46, 0.62].forEach((t, i) => v.bell({ t, f: [1318.5, 1568, 2093, 2637][i], parts: kit.SOFT, peak: 0.07, rel: 0.9 }));
  return v.end;
}

export const EXTRA_SFX = {
  dig_open: { fn: open, max: 1, gap: 0.3, g: 1 },
  dig_brush: { fn: brush, max: 3, gap: 0.06, g: 1 },
  dig_pick: { fn: pick, max: 3, gap: 0.05, g: 1 },
  dig_thud: { fn: thud, max: 3, gap: 0.05, g: 1 },
  dig_crack: { fn: crack, max: 2, gap: 0.1, g: 1.1 },
  dig_glint: { fn: glint, max: 3, gap: 0.08, g: 1 },
  dig_uv: { fn: uv, max: 1, gap: 0.3, g: 1 },
  dig_tink: { fn: tink, max: 2, gap: 0.08, g: 1 },
  dig_chomp: { fn: chomp, max: 2, gap: 0.1, g: 1 },
  dig_vial: { fn: vial, max: 1, gap: 0.4, g: 1 },
  dig_brew: { fn: brew, max: 1, gap: 0.5, g: 1 },
  dig_rumble: { fn: rumble, max: 1, gap: 1, g: 1 },
  dig_roar: { fn: roar, max: 1, gap: 1, g: 1.1 },
};
