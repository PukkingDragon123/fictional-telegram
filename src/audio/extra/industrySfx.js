// [F&S industry] Machine sounds. Loaded by audio.js through import.meta.glob('./extra/*.js').
//
//   ind_clank   the stamping press comes down: metal thunk + ring
//   ind_pour    molten metal into a mould: sizzle + low glug
//   ind_power   a generator kicks in: rising hum + a spark
//   ind_hire    a time-card punch: stamp + a little bell
//   ind_pop     the pellet cannon: compressed-air pop
//   ind_vend    vending machine: coin drop, motor whirr, can thunk
//   ind_drone   the hauler drone lifting off: buzzing rotors
const rnd = (a, b) => a + Math.random() * (b - a);

function clank(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.12, 0.08);
  v.noise({ buf: 'white', ft: 'bandpass', f: 1800, q: 1.2, a: 0.001, rel: 0.06, peak: 0.5 });
  v.tone({ type: 'square', f: 140, f2: 70, gl: 0.06, a: 0.002, rel: 0.1, peak: 0.28, lp: 900 });
  v.bell({ t: 0.01, f: rnd(880, 1000), parts: kit.BELL, peak: 0.08, rel: 0.35 });
  return v.end;
}
function pour(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.1, 0.1);
  v.noise({ buf: 'pink', ft: 'highpass', f: 2600, q: 0.6, a: 0.02, rel: 0.4, peak: 0.28 });
  v.tone({ t: 0.05, type: 'sine', f: 180, f2: 120, gl: 0.2, a: 0.01, rel: 0.2, peak: 0.25 });
  v.tone({ t: 0.22, type: 'sine', f: 150, f2: 210, gl: 0.08, a: 0.005, rel: 0.12, peak: 0.16 });
  return v.end;
}
function power(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.15, 0.04);
  v.tone({ type: 'sawtooth', f: 55, f2: 110, gl: 0.5, a: 0.05, rel: 0.35, peak: 0.22, lp: 700 });
  v.tone({ type: 'sine', f: 110, f2: 220, gl: 0.5, a: 0.05, rel: 0.35, peak: 0.18 });
  v.noise({ t: 0.45, buf: 'white', ft: 'bandpass', f: 5000, q: 2, bursts: [[0, 0.3, 0.01], [0.04, 0.2, 0.01]] });
  return v.end;
}
function hire(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.12, 0.05);
  v.noise({ buf: 'white', ft: 'lowpass', f: 1600, q: 0.7, a: 0.001, rel: 0.05, peak: 0.45 });
  v.tone({ type: 'triangle', f: 220, f2: 140, gl: 0.04, a: 0.001, rel: 0.06, peak: 0.3 });
  v.bell({ t: 0.09, f: 1320, parts: kit.GLOCK, peak: 0.1, rel: 0.3 });
  v.bell({ t: 0.17, f: 1760, parts: kit.GLOCK, peak: 0.08, rel: 0.35 });
  return v.end;
}
function pop(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.08, 0.1);
  v.noise({ buf: 'pink', ft: 'bandpass', f: 900, f2: 400, gl: 0.08, q: 0.8, a: 0.001, rel: 0.1, peak: 0.5 });
  v.tone({ type: 'sine', f: 320, f2: 120, gl: 0.06, a: 0.001, rel: 0.08, peak: 0.3 });
  return v.end;
}
function vend(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.1, 0.05);
  v.bell({ f: 2400, parts: kit.COINP || kit.BELL, peak: 0.1, rel: 0.2 });
  v.bell({ t: 0.06, f: 2000, parts: kit.COINP || kit.BELL, peak: 0.07, rel: 0.2 });
  v.tone({ t: 0.12, type: 'sawtooth', f: 90, f2: 95, gl: 0.3, a: 0.02, rel: 0.05, peak: 0.12, lp: 600 });
  v.noise({ t: 0.42, buf: 'pink', ft: 'lowpass', f: 700, q: 0.7, a: 0.001, rel: 0.1, peak: 0.45 });
  v.tone({ t: 0.42, type: 'sine', f: 160, f2: 90, gl: 0.08, a: 0.001, rel: 0.1, peak: 0.3 });
  return v.end;
}
function drone(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.06);
  v.tone({ type: 'sawtooth', f: 180, f2: 260, gl: 0.4, a: 0.05, rel: 0.25, peak: 0.08, lp: 1400 });
  v.tone({ type: 'sawtooth', f: 183, f2: 266, gl: 0.4, a: 0.05, rel: 0.25, peak: 0.07, lp: 1400 });
  v.noise({ buf: 'pink', ft: 'bandpass', f: 1200, q: 1, a: 0.06, rel: 0.25, peak: 0.12 });
  return v.end;
}

export const EXTRA_SFX = {
  ind_clank: { fn: clank, max: 3, gap: 0.08, g: 1.3 },
  ind_pour: { fn: pour, max: 2, gap: 0.2, g: 1.3 },
  ind_power: { fn: power, max: 1, gap: 0.5, g: 1.2 },
  ind_hire: { fn: hire, max: 2, gap: 0.2, g: 1.3 },
  ind_pop: { fn: pop, max: 3, gap: 0.08, g: 1.3 },
  ind_vend: { fn: vend, max: 2, gap: 0.2, g: 1.3 },
  ind_drone: { fn: drone, max: 2, gap: 0.3, g: 1.2 },
};
