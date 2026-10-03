// Procedural sounds for fish eating (src/game/fishEatFx.js). Picked up by the
// EXTRA_SFX hook in audio.js. Every call is a little different (random bite
// counts, timings and jitter); pitch follows the fish size (the caller passes
// a low pitch for big fish, a high one for fry).
//   fish_nom fish_slurp fish_gulp fish_pip fish_nibble fish_snap

const rnd = (a, b) => a + Math.random() * (b - a);

/** munch munch: 2-3 quick crunchy bites and a wet little lip smack */
function fishNom(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.04, 0.08);
  const n = Math.random() < 0.5 ? 2 : 3;
  let t = 0;
  for (let i = 0; i < n; i++) {
    const pk = 0.55 - i * 0.12;
    v.noise({ t, buf: 'white', f: rnd(1700, 2600), q: 1.4, bursts: [[0, pk, 0.022], [0.012, pk * 0.6, 0.02]] });
    v.tone({ t, type: 'triangle', f: rnd(480, 600), f2: 230, gl: 0.04, a: 0.002, rel: 0.05, peak: 0.22 });
    t += rnd(0.07, 0.1);
  }
  v.tone({ t, f: 620, f2: 1300, gl: 0.03, a: 0.002, rel: 0.04, peak: 0.16 }); // smack
  return v.end;
}

/** a short sucked-in slurp ending in a lippy pop */
function fishSlurp(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.05, 0.1);
  const d = rnd(0.12, 0.18);
  v.rustle({ buf: 'pink', dur: d, f: 600, f2: rnd(1800, 2400), q: 4, n: 16, peak: 0.7, peakAt: 0.7, flicker: 0.5 });
  v.tone({ f: 480, f2: 1250, gl: d, a: 0.02, hold: d * 0.4, rel: 0.05, peak: 0.13 });
  v.tone({ t: d, f: 520, f2: 1500, gl: 0.03, a: 0.002, rel: 0.05, peak: 0.32 }); // pop
  v.noise({ t: d, buf: 'white', f: 2600, q: 1, bursts: [[0, 0.35, 0.01]] });
  return v.end;
}

/** a big fish's low, wet GULP: a falling throat glunk plus a bubbly pop */
function fishGulp(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.06, 0.08);
  v.tone({ type: 'sine', f: rnd(190, 230), f2: 62, gl: 0.14, a: 0.005, hold: 0.03, rel: 0.13, peak: 0.75 });
  v.noise({ buf: 'pink', ft: 'lowpass', f: 650, f2: 180, gl: 0.15, q: 2, a: 0.008, rel: 0.14, peak: 0.55 });
  v.tone({ t: 0.13, f: 280, f2: 760, gl: 0.04, a: 0.002, rel: 0.07, peak: 0.26 });
  if (Math.random() < 0.5) v.tone({ t: 0.21, f: 340, f2: 900, gl: 0.03, a: 0.002, rel: 0.05, peak: 0.14 }); // second bubble
  return v.end;
}

/** a fry's tiny "pip!" */
function fishPip(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.03, 0.12);
  v.tone({ f: rnd(1700, 2000), f2: 2700, gl: 0.03, a: 0.001, rel: 0.045, peak: 0.24 });
  v.noise({ buf: 'white', f: 4200, q: 1.2, bursts: [[0, 0.12, 0.006]] });
  return v.end;
}

/** a soft seaweed nibble: two crisp leafy crunches */
function fishNibble(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.03, 0.15);
  const gap = rnd(0.035, 0.055);
  v.noise({ buf: 'pink', f: rnd(2600, 3400), q: 2, bursts: [[0, 0.32, 0.016], [gap, 0.22, 0.014]] });
  v.tone({ f: 900, f2: 520, gl: 0.03, a: 0.001, rel: 0.035, peak: 0.12 });
  return v.end;
}

/** jumping at a bug: a sharp jaw CLACK, a crunch and a little thump */
function fishSnap(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.1, 0.06);
  v.noise({ buf: 'white', f: 3200, q: 1.5, bursts: [[0, 1.1, 0.012], [0.01, 0.5, 0.016]] });
  v.tone({ type: 'triangle', f: 1100, f2: 380, gl: 0.03, a: 0.001, rel: 0.05, peak: 0.42, lp: 3000 });
  v.tone({ f: 240, f2: 80, gl: 0.08, a: 0.002, rel: 0.09, peak: 0.45 });
  for (let i = 0; i < 3; i++) v.noise({ t: 0.06 + i * rnd(0.05, 0.07), buf: 'white', f: rnd(1800, 2800), q: 1.3, bursts: [[0, 0.4 - i * 0.1, 0.02]] });
  return v.end;
}

export const EXTRA_SFX = {
  fish_nom: { fn: fishNom, max: 3, gap: 0.06, g: 1.1 },
  fish_slurp: { fn: fishSlurp, max: 3, gap: 0.07, g: 1.1 },
  fish_gulp: { fn: fishGulp, max: 2, gap: 0.09, g: 1.25 },
  fish_pip: { fn: fishPip, max: 3, gap: 0.05, g: 1.0 },
  fish_nibble: { fn: fishNibble, max: 2, gap: 0.08, g: 1.0 },
  fish_snap: { fn: fishSnap, max: 2, gap: 0.12, g: 1.25 },
};
