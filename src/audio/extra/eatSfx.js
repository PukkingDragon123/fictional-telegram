// Procedural sounds for the bear eating styles (src/game/BearEat.js) and the
// title-screen bear jumpscare. Picked up by the EXTRA_SFX hook in audio.js.
//   gulp swallow rip slurp shloop unhinge cutlery napkin ding pop jumpscare

/** a big wet GULP: a falling throat "glunk" with a squelchy pop */
function gulp(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.05, 0.08);
  v.tone({ type: 'sine', f: 240, f2: 70, gl: 0.16, a: 0.006, hold: 0.04, rel: 0.16, peak: 0.7 });
  v.tone({ type: 'triangle', f: 520, f2: 160, gl: 0.08, a: 0.004, rel: 0.08, peak: 0.18, lp: 1400 });
  v.noise({ buf: 'pink', ft: 'lowpass', f: 700, f2: 200, gl: 0.18, q: 2, a: 0.01, rel: 0.18, peak: 0.6 });
  v.tone({ t: 0.16, f: 330, f2: 900, gl: 0.05, a: 0.002, rel: 0.08, peak: 0.28 }); // wet pop
  return v.end;
}

/** the lump going down: three soft, descending gloops */
function swallow(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.06, 0.06);
  [[0, 210], [0.11, 160], [0.22, 115]].forEach(([t, f], i) => {
    v.tone({ t, f, f2: f * 0.55, gl: 0.09, a: 0.01, rel: 0.1, peak: 0.42 - i * 0.08 });
    v.noise({ t, buf: 'brown', ft: 'lowpass', f: 500, q: 1, a: 0.01, rel: 0.08, peak: 0.25 });
  });
  return v.end;
}

/** tearing: a rasping rip that rises, then a snap and a splat */
function rip(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.06, 0.06);
  v.rustle({ buf: 'white', dur: 0.26, f: 900, f2: 3200, q: 2.2, n: 30, peak: 0.95, peakAt: 0.75, rise: 1.6, fall: 3, flicker: 0.7 });
  v.noise({ t: 0.25, buf: 'white', f: 2400, q: 0.8, bursts: [[0, 1.4, 0.02], [0.016, 0.8, 0.02]] });
  v.tone({ t: 0.25, f: 180, f2: 60, gl: 0.06, a: 0.002, rel: 0.1, peak: 0.45 });
  v.rustle({ buf: 'pink', t: 0.27, dur: 0.18, f: 1500, f2: 400, q: 3, n: 16, peak: 0.6, peakAt: 0.1, flicker: 0.6 });
  return v.end;
}

/** a long noodle slurp: a sucked, rising, rattling whistle */
function slurp(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.05, 0.1);
  v.rustle({ buf: 'pink', dur: 0.3, f: 700, f2: 2200, q: 5, n: 26, peak: 0.85, peakAt: 0.6, flicker: 0.55 });
  v.tone({ type: 'sine', f: 600, f2: 1300, gl: 0.28, a: 0.03, hold: 0.1, rel: 0.12, peak: 0.12, vr: 23, vc: 120, vd: 0.02 });
  return v.end;
}

/** the end of the noodle: SHLOOP! a quick upward suck and a lippy pop */
function shloop(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.06, 0.06);
  v.noise({ buf: 'pink', f: 500, f2: 3000, gl: 0.14, q: 3, a: 0.01, hold: 0.04, rel: 0.06, peak: 0.9 });
  v.tone({ f: 300, f2: 1400, gl: 0.14, a: 0.01, hold: 0.03, rel: 0.05, peak: 0.3 });
  v.tone({ t: 0.16, f: 500, f2: 1500, gl: 0.04, a: 0.002, rel: 0.07, peak: 0.45 });
  v.noise({ t: 0.16, buf: 'white', f: 2600, q: 1, bursts: [[0, 0.5, 0.012]] });
  return v.end;
}

/** the jaw coming off its hinges: a hollow bony CLONK */
function unhinge(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.08, 0.1);
  v.tone({ type: 'triangle', f: 380, f2: 180, gl: 0.05, a: 0.001, rel: 0.09, peak: 0.5, lp: 2000 });
  v.tone({ type: 'square', f: 760, f2: 520, gl: 0.02, a: 0.001, rel: 0.03, peak: 0.08, lp: 2600 });
  v.noise({ buf: 'white', f: 1900, q: 1.2, bursts: [[0, 0.8, 0.014]] });
  return v.end;
}

/** a knife and fork: a bright clink plus a quick plate scrape */
function cutlery(ctx, dest, o, { Voice, GLOCK }) {
  const v = new Voice(ctx, dest, o, 0.25, 0.08);
  v.bell({ f: 2637, parts: GLOCK, peak: 0.22, rel: 0.4 });
  v.bell({ t: 0.05, f: 3520, parts: GLOCK, peak: 0.12, rel: 0.3 });
  v.noise({ t: 0.02, buf: 'white', ft: 'highpass', f: 5000, q: 0.6, a: 0.005, hold: 0.04, rel: 0.05, peak: 0.12 });
  return v.end;
}

/** a cloth flick (napkin tucked in, mouth dabbed) */
function napkin(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.05, 0.12);
  v.rustle({ buf: 'pink', dur: 0.16, f: 2400, f2: 1400, q: 1.2, n: 12, peak: 0.5, peakAt: 0.3, flicker: 0.5 });
  return v.end;
}

/** typewriter carriage bell: DING! */
function ding(ctx, dest, o, { Voice, BELL }) {
  const v = new Voice(ctx, dest, o, 0.3, 0.02);
  v.bell({ f: 1760, parts: BELL, peak: 0.34, rel: 1.1 });
  return v.end;
}

/** a cartoon pop (a head coming off, a cork) */
function pop(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.08, 0.12);
  v.tone({ f: 420, f2: 1250, gl: 0.04, a: 0.001, rel: 0.07, peak: 0.55 });
  v.noise({ buf: 'white', f: 2200, q: 1, bursts: [[0, 0.9, 0.012]] });
  return v.end;
}

/** title jumpscare sting: a dissonant orchestral STAB + a low boom and a rising shriek */
function jumpscare(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.25, 0.02);
  for (const [f, type, pk] of [[110, 'sawtooth', 0.22], [116.5, 'sawtooth', 0.2], [164.8, 'square', 0.12], [233, 'sawtooth', 0.14], [311, 'square', 0.08]]) {
    v.tone({ type, f, f2: f * 0.94, gl: 0.6, a: 0.004, hold: 0.12, rel: 0.5, peak: pk, lp: 2600 });
  }
  v.tone({ f: 90, f2: 34, gl: 0.5, a: 0.002, rel: 0.6, peak: 0.8 }); // boom
  v.noise({ buf: 'brown', ft: 'lowpass', f: 900, f2: 120, gl: 0.4, q: 0.6, a: 0.003, rel: 0.45, peak: 0.9 });
  v.noise({ buf: 'white', f: 3000, q: 0.7, a: 0.002, rel: 0.12, peak: 0.6 });
  v.tone({ type: 'sawtooth', f: 900, f2: 2300, gl: 0.45, a: 0.02, hold: 0.1, rel: 0.3, peak: 0.07, lp: 4000, vr: 13, vc: 60, vd: 0.05 });
  return v.end;
}

export const EXTRA_SFX = {
  gulp: { fn: gulp, max: 3, gap: 0.08, g: 1.4 },
  swallow: { fn: swallow, max: 2, gap: 0.1, g: 1.3 },
  rip: { fn: rip, max: 2, gap: 0.1, g: 1.2 },
  slurp: { fn: slurp, max: 3, gap: 0.06, g: 1.2 },
  shloop: { fn: shloop, max: 2, gap: 0.1, g: 1.3 },
  unhinge: { fn: unhinge, max: 3, gap: 0.05, g: 1.3 },
  cutlery: { fn: cutlery, max: 3, gap: 0.05, g: 1.1 },
  napkin: { fn: napkin, max: 3, gap: 0.05, g: 1.2 },
  ding: { fn: ding, max: 2, gap: 0.2, g: 1.0 },
  pop: { fn: pop, max: 3, gap: 0.05, g: 1.2 },
  jumpscare: { fn: jumpscare, max: 1, gap: 1, g: 1.1 },
};
