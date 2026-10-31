// Sounds for the e-Buy shop (src/ui/EBuy.js): a cheesy dial-up-era boot jingle
// for the logo splash and a "bloop-bling" for dropping something in the cart.
// Built with the audio.js kit (see EXTRA_SFX there).

// boot: a squarewave arpeggio "e - Buy - ding!" with a glockenspiel sparkle,
// like a 1999 website that really wants you to stay
function ebuyBoot(ctx, dest, o, { Voice, GLOCK }) {
  const v = new Voice(ctx, dest, o, 0.18, 0.01);
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => {
    const t = i * 0.075;
    v.tone({ t, type: 'square', f, a: 0.003, hold: 0.04, rel: 0.06, peak: 0.08, lp: 3800 });
    v.tone({ t, f, a: 0.003, hold: 0.04, rel: 0.08, peak: 0.14 });
  });
  // the final "ding" an octave up, held a little
  v.tone({ t: 0.32, type: 'square', f: 1567.98, a: 0.003, hold: 0.08, rel: 0.25, peak: 0.07, lp: 4200 });
  v.tone({ t: 0.32, f: 1046.5, a: 0.004, hold: 0.08, rel: 0.3, peak: 0.12 });
  v.bell({ t: 0.32, f: 2093, parts: GLOCK, peak: 0.12, rel: 0.6 });
  v.bell({ t: 0.4, f: 3136, parts: GLOCK, peak: 0.06, rel: 0.5 });
  return v.end;
}

// add to cart: a soft "bloop" drop plus two rising bell notes
function ebuyCart(ctx, dest, o, { Voice, SOFT }) {
  const v = new Voice(ctx, dest, o, 0.12, 0.03);
  v.tone({ f: 380, f2: 760, gl: 0.07, a: 0.003, rel: 0.09, peak: 0.3 });
  v.noise({ buf: 'white', f: 3000, q: 1, bursts: [[0, 0.08, 0.008]] });
  v.bell({ t: 0.07, f: 1318.5, parts: SOFT, peak: 0.18, rel: 0.25 });
  v.bell({ t: 0.13, f: 1975.5, parts: SOFT, peak: 0.16, rel: 0.4 });
  return v.end;
}

// [v30 ebuy] coin tick: one tiny metallic click per step while the wallet counts down
function ebuyTick(ctx, dest, o, { Voice, COINP }) {
  const v = new Voice(ctx, dest, o, 0.05, 0.04);
  v.tone({ type: 'square', f: 2400, a: 0.001, hold: 0.004, rel: 0.025, peak: 0.05, lp: 5200 });
  v.bell({ f: 3520, parts: COINP, peak: 0.08, rel: 0.07 });
  return v.end;
}

// [v30 ebuy] card press: a soft wooden "tok"
function ebuyTok(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.04, 0.05);
  v.tone({ f: 520, f2: 340, gl: 0.04, a: 0.002, rel: 0.05, peak: 0.22 });
  v.noise({ buf: 'white', f: 1800, q: 2, bursts: [[0, 0.02, 0.004]] });
  return v.end;
}

export const EXTRA_SFX = {
  ebuy_tick: { fn: ebuyTick, max: 4, gap: 0.03, g: 1 },
  ebuy_tok: { fn: ebuyTok, max: 2, gap: 0.04, g: 1.2 },
  ebuy_boot: { fn: ebuyBoot, max: 1, gap: 0.5, g: 1.2 },
  ebuy_cart: { fn: ebuyCart, max: 3, gap: 0.05, g: 1.6 },
};
