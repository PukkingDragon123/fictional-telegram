// [v26 menu] Sounds for the title's save boxes and settings page (src/ui/SaveBoxes.js,
// src/ui/SettingsScreen.js). Cardboard, packing tape and a boot.
//
//   box_thump   an empty-ish cardboard box set down / tapped (hollow, papery)
//   box_flap    a flap flicked open
//   box_tape    packing tape pulled off the roll and slapped down
//   box_kick    a boot punting a taped box (thud + whoosh)
//   box_land    a fresh box dropping onto the floor boards
//   set_tick    a small brass detent (sliders, switches)

function thump(ctx, dest, o, { Voice, rr }) {
  const v = new Voice(ctx, dest, o, 0.06, 0.08);
  v.tone({ f: 150 * rr(0.95, 1.05), f2: 85, gl: 0.06, a: 0.002, rel: 0.12, peak: 0.5 });
  v.noise({ buf: 'pink', ft: 'bandpass', f: 520, q: 1.4, a: 0.002, rel: 0.07, peak: 0.6 });
  v.noise({ t: 0.004, buf: 'white', ft: 'highpass', f: 2600, q: 0.6, a: 0.001, rel: 0.03, peak: 0.12 });
  return v.end;
}
function flap(ctx, dest, o, { Voice, rr }) {
  const v = new Voice(ctx, dest, o, 0.05, 0.08);
  v.noise({ buf: 'pink', f: 700 * rr(0.9, 1.1), f2: 2200, gl: 0.08, q: 0.9, a: 0.01, rel: 0.08, peak: 0.45 });
  v.tone({ t: 0.07, f: 210, f2: 120, gl: 0.04, a: 0.002, rel: 0.06, peak: 0.25 });
  return v.end;
}
function tapeRip(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.04, 0.05);
  v.rustle({ buf: 'white', f: 3200, f2: 1900, q: 1.1, dur: 0.42, peak: 0.42, peakAt: 0.35, flicker: 0.95, n: 46 }); // shhhrrrrk
  v.noise({ t: 0.44, buf: 'pink', ft: 'lowpass', f: 1300, q: 0.6, a: 0.002, rel: 0.06, peak: 0.55 }); // slap
  v.tone({ t: 0.44, f: 180, f2: 100, gl: 0.04, a: 0.002, rel: 0.07, peak: 0.25 });
  return v.end;
}
function kick(ctx, dest, o, { Voice }) {
  const v = new Voice(ctx, dest, o, 0.1, 0.05);
  v.tone({ f: 110, f2: 55, gl: 0.08, a: 0.002, rel: 0.16, peak: 0.7 });
  v.noise({ buf: 'pink', ft: 'lowpass', f: 900, q: 0.6, a: 0.002, rel: 0.09, peak: 0.8 });
  v.noise({ t: 0.05, buf: 'pink', f: 500, f2: 2600, gl: 0.3, q: 0.8, a: 0.05, rel: 0.25, peak: 0.3 }); // whoosh
  return v.end;
}
function land(ctx, dest, o, { Voice, rr }) {
  const v = new Voice(ctx, dest, o, 0.08, 0.06);
  v.tone({ f: 130 * rr(0.95, 1.05), f2: 70, gl: 0.07, a: 0.002, rel: 0.14, peak: 0.55 });
  v.noise({ buf: 'pink', ft: 'bandpass', f: 420, q: 1.2, a: 0.002, rel: 0.09, peak: 0.55 });
  v.tone({ t: 0.12, f: 120, f2: 80, gl: 0.04, a: 0.002, rel: 0.07, peak: 0.18 }); // little bounce
  return v.end;
}
function tick(ctx, dest, o, { Voice, rr }) {
  const v = new Voice(ctx, dest, o, 0.03, 0.1);
  v.tone({ type: 'square', f: 1800 * rr(0.97, 1.03), a: 0.001, rel: 0.02, peak: 0.07, lp: 4000 });
  v.noise({ buf: 'white', ft: 'highpass', f: 5000, q: 0.5, a: 0.001, rel: 0.015, peak: 0.12 });
  return v.end;
}

export const EXTRA_SFX = {
  box_thump: { fn: thump, max: 2, gap: 0.06, g: 1.3 },
  box_flap: { fn: flap, max: 2, gap: 0.05, g: 1.2 },
  box_tape: { fn: tapeRip, max: 1, gap: 0.3, g: 1.2 },
  box_kick: { fn: kick, max: 1, gap: 0.2, g: 1.4 },
  box_land: { fn: land, max: 2, gap: 0.08, g: 1.3 },
  set_tick: { fn: tick, max: 3, gap: 0.035, g: 1.0 },
};
