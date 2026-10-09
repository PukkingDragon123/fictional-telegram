// [F&S mining] Mining sounds. Loaded by audio.js through import.meta.glob('./extra/*.js').
//
//   pick_clank   a pickaxe biting rock: a bright metal ping over a gritty crack
//   ore_drop     a sack of ore thumped down: rocky clatter
//   cart_roll    a mine cart rumbling on its rails (short, loopable by repeating)
//   steam_chuff  one puff of a steam engine
//   drill_whirr  the ore drill spinning up
//   fuse_fizz    a dynamite fuse sputtering
//   pfft         ...and the gentle dynamite fizzling out
const rnd = (a, b) => a + Math.random() * (b - a);

function pickClank(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.05);
  v.bell({ f: rnd(1450, 1750), parts: kit.SOFT, peak: 0.12, rel: 0.22 });
  v.tone({ type: 'triangle', f: rnd(320, 380), f2: 180, gl: 0.05, a: 0.001, rel: 0.08, peak: 0.28, lp: 1500 });
  v.noise({ buf: 'pink', f: 2400, q: 0.9, bursts: [[0, 0.55, 0.03], [0.04, 0.25, 0.03], [0.09, 0.12, 0.02]] });
  return v.end;
}

function oreDrop(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.08);
  v.tone({ type: 'sine', f: 110, f2: 70, gl: 0.08, a: 0.002, rel: 0.12, peak: 0.4 });
  let t = 0.01;
  for (let i = 0; i < 7; i++) {
    v.noise({ t, buf: 'white', f: rnd(900, 2200), q: 2, bursts: [[0, 0.25 * (1 - i / 9), 0.015]] });
    v.tone({ t, type: 'triangle', f: rnd(380, 720), a: 0.001, rel: 0.03, peak: 0.05 });
    t += rnd(0.02, 0.05);
  }
  return v.end;
}

function cartRoll(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.1);
  v.noise({ buf: 'brown', f: 220, q: 0.8, a: 0.05, hold: 0.45, rel: 0.15, peak: 0.35 });
  for (let i = 0; i < 4; i++) v.noise({ t: 0.04 + i * 0.13, buf: 'white', f: rnd(1600, 2400), q: 3, bursts: [[0, 0.16, 0.012]] });
  v.tone({ type: 'sawtooth', f: 62, a: 0.05, hold: 0.4, rel: 0.12, peak: 0.05, lp: 300 });
  return v.end;
}

function steamChuff(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.1);
  v.noise({ buf: 'white', f: 1800, f2: 900, gl: 0.2, q: 0.7, a: 0.01, hold: 0.06, rel: 0.2, peak: 0.3 });
  v.tone({ type: 'sine', f: 90, f2: 60, gl: 0.12, a: 0.005, rel: 0.12, peak: 0.25 });
  return v.end;
}

function drillWhirr(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.1);
  v.tone({ type: 'sawtooth', f: 120, f2: 260, gl: 0.5, a: 0.05, hold: 0.45, rel: 0.2, peak: 0.12, lp: 1400 });
  v.tone({ type: 'square', f: 240, f2: 520, gl: 0.5, a: 0.05, hold: 0.45, rel: 0.2, peak: 0.04, lp: 2000 });
  v.noise({ buf: 'pink', f: 1200, q: 1, a: 0.05, hold: 0.5, rel: 0.2, peak: 0.12 });
  return v.end;
}

function fuseFizz(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.1);
  v.rustle({ buf: 'white', dur: 0.7, f: 5200, f2: 3800, q: 1.2, n: 30, peak: 0.18, peakAt: 0.3, flicker: 0.8 });
  return v.end;
}

function pfft(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.1);
  v.noise({ buf: 'pink', f: 700, f2: 300, gl: 0.25, q: 0.6, a: 0.01, hold: 0.05, rel: 0.3, peak: 0.35 });
  v.tone({ type: 'sine', f: 180, f2: 90, gl: 0.2, a: 0.005, rel: 0.2, peak: 0.12 });
  return v.end;
}

export const EXTRA_SFX = {
  pick_clank: { fn: pickClank, max: 4, gap: 0.06, g: 2.0 },
  ore_drop: { fn: oreDrop, max: 3, gap: 0.08, g: 2.2 },
  cart_roll: { fn: cartRoll, max: 2, gap: 0.2, g: 2.2 },
  steam_chuff: { fn: steamChuff, max: 3, gap: 0.12, g: 2.0 },
  drill_whirr: { fn: drillWhirr, max: 1, gap: 0.4, g: 2.0 },
  fuse_fizz: { fn: fuseFizz, max: 1, gap: 0.5, g: 2.2 },
  pfft: { fn: pfft, max: 1, gap: 0.3, g: 2.4 },
};
