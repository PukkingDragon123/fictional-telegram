// Sounds for Chez Reynard's menu (src/ui/RestaurantMenu.js): a leather folder
// opening, thick card pages, a small brass fanfare, a glass/metal clink and a
// theatre spotlight switching on. Built with the audio.js kit (see EXTRA_SFX there).

// leather folder: a soft creak, the cover swinging through the air, a padded thump
// and a little harp-like flourish
function menuOpen(ctx, dest, o, { Voice, rr, SOFT }) {
  const v = new Voice(ctx, dest, o, 0.12, 0.03);
  v.rustle({ buf: 'pink', dur: 0.22, f: 320, f2: 520, q: 2.2, n: 18, peak: 0.35, peakAt: 0.5, flicker: 0.8 }); // creak
  v.noise({ t: 0.08, buf: 'pink', f: 500, f2: 1900, gl: 0.3, q: 0.8, a: 0.12, hold: 0.04, rel: 0.18, peak: 0.42 }); // swing
  v.tone({ t: 0.42, f: 120, f2: 70, gl: 0.08, a: 0.002, rel: 0.2, peak: 0.42 }); // thump
  v.noise({ t: 0.42, buf: 'pink', ft: 'lowpass', f: 700, q: 0.5, a: 0.002, rel: 0.08, peak: 0.6 });
  [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => v.bell({ t: 0.5 + i * 0.07, f: f * rr(0.998, 1.002), parts: SOFT, peak: 0.1, rel: 0.7 }));
  return v.end;
}

// thick card page: slower and lower than paper, a stiff flap and a soft landing
function menuPage(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.05, 0.06);
  v.noise({ buf: 'pink', f: 380, f2: 1800, gl: 0.22, q: 0.7, a: 0.07, hold: 0.03, rel: 0.14, peak: 0.55 });
  v.rustle({ t: 0.04, dur: 0.2, f: 1600, f2: 3400, q: 0.7, n: 20, peak: 0.32, peakAt: 0.55, flicker: 0.6 });
  v.noise({ t: 0.25, buf: 'pink', ft: 'lowpass', f: 900, q: 0.5, a: 0.002, rel: 0.06, peak: 0.5 });
  v.tone({ t: 0.25, f: 160, f2: 95, gl: 0.05, a: 0.002, rel: 0.08, peak: 0.18 });
  return v.end;
}

// a short, classy brass "ta-da-daaa" with a glockenspiel sparkle on top
function fanfareSmall(ctx, dest, o, { Voice, GLOCK }) {
  const v = new Voice(ctx, dest, o, 0.28, 0.01);
  const brass = (t, f, hold, rel, peak) => {
    v.tone({ t, type: 'sawtooth', f, a: 0.018, hold, rel, peak, lp: 600, lp2: 3200, lpt: 0.07, q: 1, det: -5 });
    v.tone({ t, type: 'sawtooth', f, a: 0.018, hold, rel, peak: peak * 0.8, lp: 600, lp2: 3200, lpt: 0.07, q: 1, det: 6 });
  };
  brass(0, 392, 0.06, 0.08, 0.055);
  brass(0.13, 523.25, 0.05, 0.08, 0.055);
  [523.25, 659.25, 783.99].forEach((f) => brass(0.27, f, 0.42, 0.55, 0.045));
  v.tone({ t: 0.27, f: 130.8, f2: 98, gl: 0.25, a: 0.004, rel: 0.45, peak: 0.28 });
  v.noise({ t: 0.27, buf: 'white', ft: 'highpass', f: 6000, q: 0.5, a: 0.01, rel: 0.9, peak: 0.1 });
  [1567.98, 2093, 2637].forEach((f, i) => v.bell({ t: 0.42 + i * 0.09, f, parts: GLOCK, peak: 0.12, rel: 0.7 }));
  return v.end;
}

// a polished trophy set down on a glass shelf: a bright inharmonic ping + tiny rattle
function clink(ctx, dest, o, { Voice, rr, BELL }) {
  const v = new Voice(ctx, dest, o, 0.18, 0.04);
  v.noise({ buf: 'white', ft: 'highpass', f: 4200, q: 0.7, bursts: [[0, 0.5, 0.01]] });
  v.bell({ f: 2350 * rr(0.98, 1.02), parts: BELL, peak: 0.22, rel: 0.55 });
  v.bell({ t: 0.004, f: 3170 * rr(0.98, 1.02), parts: BELL, peak: 0.1, rel: 0.35 });
  v.bell({ t: 0.07, f: 2350 * rr(0.97, 1.0), parts: BELL, peak: 0.06, rel: 0.3 });
  v.tone({ f: 420, f2: 300, gl: 0.03, a: 0.001, rel: 0.05, peak: 0.12 });
  return v.end;
}

// theatre spotlight: a heavy switch CHUNK, then the lamp hums up with a faint filament ring
function spotlight(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.2, 0.02);
  v.noise({ buf: 'pink', ft: 'lowpass', f: 1200, q: 0.6, a: 0.001, rel: 0.07, peak: 0.9 });
  v.tone({ f: 180, f2: 80, gl: 0.06, a: 0.001, rel: 0.12, peak: 0.45 });
  v.noise({ t: 0.01, buf: 'white', f: 2600, q: 2, bursts: [[0, 0.5, 0.012], [0.03, 0.25, 0.01]] });
  v.tone({ t: 0.06, type: 'sawtooth', f: 100, a: 0.25, hold: 0.25, rel: 0.4, peak: 0.035, lp: 700 });
  v.tone({ t: 0.06, type: 'sine', f: 200, a: 0.25, hold: 0.25, rel: 0.4, peak: 0.05 });
  v.tone({ t: 0.1, f: 3520, a: 0.2, hold: 0.1, rel: 0.5, peak: 0.012 });
  v.noise({ t: 0.06, buf: 'pink', f: 2800, f2: 4200, gl: 0.6, q: 0.8, a: 0.3, rel: 0.4, peak: 0.07 });
  return v.end;
}

// leather folder closing: a padded clap and a puff of air
function menuCloseSfx(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.06, 0.04);
  v.noise({ buf: 'pink', f: 1800, f2: 500, gl: 0.12, q: 0.8, a: 0.04, rel: 0.1, peak: 0.45 });
  v.tone({ t: 0.1, f: 140, f2: 72, gl: 0.07, a: 0.002, rel: 0.16, peak: 0.45 });
  v.noise({ t: 0.1, buf: 'pink', ft: 'lowpass', f: 650, q: 0.5, a: 0.002, rel: 0.07, peak: 0.55 });
  return v.end;
}

export const EXTRA_SFX = {
  menu_open: { fn: menuOpen, max: 1, gap: 0.3, g: 1.4 },
  menu_close: { fn: menuCloseSfx, max: 1, gap: 0.2, g: 1.5 },
  menu_page: { fn: menuPage, max: 2, gap: 0.08, g: 1.6 },
  fanfare_small: { fn: fanfareSmall, max: 1, gap: 0.5, g: 1.3 },
  clink: { fn: clink, max: 3, gap: 0.05, g: 1.4 },
  spotlight: { fn: spotlight, max: 1, gap: 0.3, g: 1.5 },
};
