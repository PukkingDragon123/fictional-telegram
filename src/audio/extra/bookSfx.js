// Sounds for the Encyclopedia (src/ui/Encyclopedia.js): a heavy leather book
// landing, its cover creaking open, pages turning, a fast riffle, cloth tabs,
// an ink blot blooming and a wax seal pressing down.
// Built like the sfx* functions in src/audio/audio.js (kit = { Voice, rr, ... }).

/** page turn: the page lifts (tick), air rushes under it, it flutters and lands with a soft pat */
function pageFlip(ctx, dest, o, { Voice, rr }) {
  const v = new Voice(ctx, dest, o, 0.05, 0.07);
  v.noise({ buf: 'white', ft: 'highpass', f: 3600, q: 0.7, bursts: [[0, 0.5, 0.012], [0.018, 0.25, 0.01]] }); // the corner lets go
  v.noise({ t: 0.02, buf: 'pink', f: 500, f2: 2600, gl: 0.2, q: 0.6, a: 0.06, hold: 0.04, rel: 0.12, peak: 0.55 }); // air under the page
  v.rustle({ t: 0.05, dur: 0.22, f: 2400, f2: 5200, q: 0.7, n: 30, peak: 0.42, peakAt: 0.45, flicker: 0.75 });
  const land = rr(0.26, 0.3);
  v.noise({ t: land, buf: 'pink', ft: 'lowpass', f: 900, q: 0.5, a: 0.002, rel: 0.07, peak: 0.6 });
  v.tone({ t: land, f: 180, f2: 110, gl: 0.05, a: 0.002, rel: 0.07, peak: 0.16 });
  v.noise({ t: land + 0.004, buf: 'white', ft: 'highpass', f: 3000, q: 0.6, bursts: [[0, 0.3, 0.02]] });
  return v.end;
}

/** many pages thumbed at once: a burst of flicks that speeds up and fades */
function riffle(ctx, dest, o, { Voice, rr }) {
  const v = new Voice(ctx, dest, o, 0.05, 0.05);
  let t = 0;
  for (let i = 0; i < 9; i++) {
    const a = 1 - i / 11;
    v.noise({ t, buf: 'white', ft: 'highpass', f: rr(2600, 4200), q: 0.7, bursts: [[0, 0.5 * a, 0.014]] });
    v.noise({ t, buf: 'pink', f: rr(900, 1600), q: 0.8, a: 0.004, rel: 0.04, peak: 0.35 * a });
    t += rr(0.035, 0.05) * (1 - i * 0.04);
  }
  v.rustle({ dur: t + 0.08, f: 1800, f2: 4200, q: 0.6, n: 40, peak: 0.3, peakAt: 0.3, flicker: 0.8 });
  v.noise({ t: t + 0.03, buf: 'pink', ft: 'lowpass', f: 800, q: 0.5, a: 0.002, rel: 0.08, peak: 0.45 });
  return v.end;
}

/** the heavy book lands on the desk: a soft, deep thud and a little rattle */
function bookDrop(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.06, 0.04);
  v.tone({ f: 120, f2: 52, gl: 0.12, a: 0.002, rel: 0.24, peak: 0.7 });
  v.noise({ buf: 'pink', ft: 'lowpass', f: 700, q: 0.5, a: 0.002, rel: 0.12, peak: 1 });
  v.noise({ t: 0.004, buf: 'pink', f: 1400, q: 0.9, bursts: [[0, 0.5, 0.03]] });
  v.noise({ t: 0.05, buf: 'white', ft: 'highpass', f: 2600, q: 0.6, bursts: [[0, 0.12, 0.02], [0.04, 0.08, 0.02]] });
  return v.end;
}

/** the cover opens: leather creaks at the hinge, the board swings (whoosh), then a little sparkle of discovery */
function bookOpen(ctx, dest, o, { Voice, rr, CELESTA }) {
  const v = new Voice(ctx, dest, o, 0.12, 0.03);
  // creak: a slow stick-slip squeak through a resonant filter
  const bs = [];
  let t = 0;
  for (let i = 0; i < 14; i++) { bs.push([t, 0.25 + 0.35 * Math.sin(i / 13 * Math.PI), 0.016]); t += rr(0.018, 0.03); }
  v.noise({ buf: 'pink', f: 640, f2: 420, gl: 0.35, q: 6, bursts: bs });
  v.tone({ type: 'sawtooth', f: 150, f2: 118, gl: 0.34, a: 0.03, hold: 0.18, rel: 0.12, peak: 0.05, lp: 900 });
  // the swing of the board
  v.noise({ t: 0.2, buf: 'pink', f: 300, f2: 1400, gl: 0.45, q: 0.6, a: 0.25, hold: 0.05, rel: 0.3, peak: 0.6 });
  // it settles open
  v.noise({ t: 0.86, buf: 'pink', ft: 'lowpass', f: 600, q: 0.5, a: 0.003, rel: 0.12, peak: 0.55 });
  v.tone({ t: 0.86, f: 140, f2: 80, gl: 0.08, a: 0.002, rel: 0.14, peak: 0.25 });
  // a soft celesta flourish: what's inside?
  [72, 76, 79, 84, 88].forEach((m, i) => v.bell({ t: 0.95 + i * 0.07, f: 440 * Math.pow(2, (m - 69) / 12), parts: CELESTA, a: 0.003, rel: 0.7, peak: 0.12 * (1 - i * 0.12) }));
  return v.end;
}

/** the cover slams shut: a whoosh, then a big THUMP with a puff of air */
function bookClose(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.08, 0.03);
  v.noise({ buf: 'pink', f: 1400, f2: 400, gl: 0.1, q: 0.6, a: 0.04, rel: 0.06, peak: 0.4 });
  const t = 0.08;
  v.tone({ t, f: 96, f2: 40, gl: 0.16, a: 0.002, rel: 0.32, peak: 1 });
  v.tone({ t, type: 'triangle', f: 210, f2: 90, gl: 0.06, a: 0.001, rel: 0.12, peak: 0.45, lp: 900 });
  v.noise({ t, buf: 'pink', ft: 'lowpass', f: 900, q: 0.5, a: 0.001, rel: 0.16, peak: 1.2 });
  v.noise({ t: t + 0.01, buf: 'pink', f: 2000, f2: 600, gl: 0.2, q: 0.5, a: 0.01, rel: 0.25, peak: 0.25 }); // the puff
  return v.end;
}

/** a cloth tab pulled: a soft fabric "thwip" and a page tick */
function bookTab(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.04, 0.08);
  v.rustle({ dur: 0.09, buf: 'pink', f: 1200, f2: 2600, q: 0.8, n: 12, peak: 0.6, peakAt: 0.3, flicker: 0.5 });
  v.noise({ t: 0.07, buf: 'white', ft: 'highpass', f: 3200, q: 0.6, bursts: [[0, 0.4, 0.015]] });
  v.tone({ t: 0.07, f: 900, f2: 600, gl: 0.03, a: 0.001, rel: 0.04, peak: 0.08 });
  return v.end;
}

/** ink blooming: a wet blot that spreads (bubbly, falling), then glints of the colour appearing */
function inkBlot(ctx, dest, o, { Voice, rr, GLOCK }) {
  const v = new Voice(ctx, dest, o, 0.1, 0.06);
  v.noise({ buf: 'pink', ft: 'lowpass', f: 1600, f2: 300, gl: 0.25, q: 2, a: 0.004, rel: 0.25, peak: 0.6 });
  v.tone({ f: 420, f2: 160, gl: 0.18, a: 0.004, rel: 0.2, peak: 0.18, lp: 1200 });
  for (let i = 0; i < 4; i++) { const f = rr(500, 900); v.tone({ t: 0.05 + i * rr(0.04, 0.07), f, f2: f * 1.6, gl: 0.03, a: 0.002, rel: 0.04, peak: 0.07 }); }
  [84, 88, 91, 96].forEach((m, i) => v.bell({ t: 0.45 + i * 0.09, f: 440 * Math.pow(2, (m - 69) / 12), parts: GLOCK, a: 0.002, rel: 0.5, peak: 0.1 }));
  return v.end;
}

/** a wax seal pressed down: a soft squish and a muffled stamp */
function bookSeal(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.06, 0.05);
  v.tone({ f: 170, f2: 80, gl: 0.06, a: 0.001, rel: 0.14, peak: 0.6 });
  v.noise({ buf: 'pink', ft: 'lowpass', f: 1000, q: 0.5, a: 0.001, rel: 0.07, peak: 0.9 });
  v.noise({ t: 0.02, buf: 'pink', f: 700, f2: 300, gl: 0.1, q: 3, a: 0.01, rel: 0.12, peak: 0.25 }); // squish
  v.noise({ t: 0.004, buf: 'white', f: 1800, q: 0.9, bursts: [[0, 0.4, 0.015]] });
  return v.end;
}

export const EXTRA_SFX = {
  page_flip: { fn: pageFlip, max: 3, gap: 0.05, g: 1.3 },
  book_riffle: { fn: riffle, max: 1, gap: 0.2, g: 1.2 },
  book_drop: { fn: bookDrop, max: 1, gap: 0.3, g: 1.2 },
  book_open: { fn: bookOpen, max: 1, gap: 0.5, g: 1.3 },
  book_close: { fn: bookClose, max: 1, gap: 0.5, g: 1.1 },
  book_tab: { fn: bookTab, max: 2, gap: 0.06, g: 1.8 },
  ink_blot: { fn: inkBlot, max: 2, gap: 0.15, g: 1.4 },
  book_seal: { fn: bookSeal, max: 2, gap: 0.1, g: 1.4 },
};
