// Sounds for Professor Reynard (src/ui/TeacherOverlay.js): chalk scratching on
// the "screen", the pointer stick, a little brass school handbell and the
// pitter-patter of a fox running across the UI. Loaded by audio.js through
// import.meta.glob('./extra/*.js'); everything is synthesised on demand.
//
//   chalk_draw   one gritty chalk segment (the overlay fires it every ~0.1 s while a stroke draws)
//   chalk_tick   chalk touches down at the start of a stroke
//   chalk_tap    wooden pointer tapping a button: "tok"
//   chalk_erase  felt eraser wiping the marks away
//   school_bell  handbell ding-a-ling: class is in session!
//   teach_step   light running footstep
//   teach_skid   sneaker skid when he stops
//   teach_hop    springy little hop
//   teach_land   soft landing thump
//   teach_ding   bright "a-ha!" chime when he arrives and points
//   teach_swish  the stick swishing through the air
const rnd = (a, b) => a + Math.random() * (b - a);

function chalkDraw(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.03, 0.12);
  const d = rnd(0.075, 0.11), f = rnd(2500, 3700);
  // grit: a narrow band of flickering noise, the chalk grains catching
  v.rustle({ dur: d, f, f2: f * rnd(0.75, 1.3), q: 1.7, n: 14, peak: 0.5, peakAt: rnd(0.2, 0.5), flicker: 0.75 });
  // body: the stick knocking along the board
  v.rustle({ buf: 'pink', dur: d, f: rnd(800, 1100), q: 0.9, n: 9, peak: 0.22, peakAt: 0.35, flicker: 0.5 });
  // now and then the classic squeak
  if (Math.random() < 0.28) v.tone({ t: rnd(0, d * 0.4), f: rnd(2300, 3000), f2: rnd(2100, 3300), gl: d * 0.7, a: 0.006, rel: d * 0.6, peak: 0.03, vr: 36, vc: 45, vd: 0.02 });
  return v.end;
}

function chalkTick(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.04, 0.1);
  v.noise({ buf: 'pink', f: 3200, q: 1.4, bursts: [[0, 0.5, 0.012]] });
  v.tone({ f: 460, f2: 230, gl: 0.02, a: 0.001, rel: 0.035, peak: 0.12 });
  return v.end;
}

function chalkTap(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.06, 0.06);
  v.tone({ type: 'triangle', f: 1150, f2: 720, gl: 0.03, a: 0.001, rel: 0.07, peak: 0.36 }); // hollow wood
  v.tone({ f: 2350, f2: 1900, gl: 0.015, a: 0.001, rel: 0.025, peak: 0.08 });
  v.noise({ buf: 'pink', f: 2600, q: 2, bursts: [[0, 0.42, 0.01]] });
  return v.end;
}

function chalkErase(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.08);
  const d = rnd(0.34, 0.42);
  v.rustle({ buf: 'pink', dur: d, f: 700, f2: 1500, q: 0.6, n: 26, peak: 0.6, peakAt: 0.3, flicker: 0.4, rise: 0.8, fall: 1.1 });
  v.rustle({ dur: d * 0.9, f: 2800, f2: 4200, q: 0.8, n: 30, peak: 0.22, peakAt: 0.4, flicker: 0.8 });
  return v.end;
}

function schoolBell(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.2, 0.02);
  // three swings of a little brass handbell, each with its clapper click
  const rings = [[0, 1], [0.15, 0.8], [0.3, 0.9]];
  for (const [t, a] of rings) {
    v.noise({ t, buf: 'white', f: 5200, q: 2, bursts: [[0, 0.16 * a, 0.006]] });
    v.bell({ t, f: 1396.9, parts: kit.BELL, peak: 0.19 * a, rel: 0.85 });
    v.bell({ t: t + 0.004, f: 1404.5, parts: kit.BELL, peak: 0.08 * a, rel: 0.7 }); // slightly detuned: shimmer
  }
  return v.end;
}

function teachStep(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.02, 0.15);
  v.tone({ f: 250, f2: 120, gl: 0.03, a: 0.002, rel: 0.05, peak: 0.26 });
  v.noise({ buf: 'pink', f: 1500, q: 1, bursts: [[0, 0.22, 0.022]] });
  return v.end;
}

function teachSkid(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.04, 0.08);
  v.rustle({ dur: 0.24, f: 1500, f2: 650, q: 0.8, n: 20, peak: 0.5, peakAt: 0.15, flicker: 0.45 });
  v.tone({ f: 1900, f2: 1450, gl: 0.16, a: 0.006, hold: 0.05, rel: 0.1, peak: 0.05, vr: 28, vc: 60, vd: 0.03 }); // sneaker squeak
  return v.end;
}

function teachHop(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.06, 0.08);
  v.tone({ f: 320, f2: 780, gl: 0.09, a: 0.003, rel: 0.11, peak: 0.24 });
  v.tone({ type: 'triangle', f: 640, f2: 1400, gl: 0.07, a: 0.002, rel: 0.07, peak: 0.06 });
  return v.end;
}

function teachLand(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.03, 0.08);
  v.tone({ f: 170, f2: 70, gl: 0.06, a: 0.002, rel: 0.12, peak: 0.42 });
  v.noise({ buf: 'pink', ft: 'lowpass', f: 700, q: 0.5, a: 0.002, rel: 0.08, peak: 0.45 });
  return v.end;
}

function teachDing(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.18, 0.02);
  v.bell({ f: 1318.5, parts: kit.CELESTA, peak: 0.15, rel: 0.45 });
  v.bell({ t: 0.075, f: 1975.5, parts: kit.CELESTA, peak: 0.13, rel: 0.6 });
  return v.end;
}

function teachSwish(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.1);
  v.noise({ buf: 'white', f: 1100, f2: 4200, gl: 0.12, q: 1.1, a: 0.03, rel: 0.1, peak: 0.32 });
  return v.end;
}

export const EXTRA_SFX = {
  chalk_draw: { fn: chalkDraw, max: 3, gap: 0.05, g: 1.3 },
  chalk_tick: { fn: chalkTick, max: 3, gap: 0.04, g: 1.4 },
  chalk_tap: { fn: chalkTap, max: 3, gap: 0.06, g: 1.5 },
  chalk_erase: { fn: chalkErase, max: 2, gap: 0.15, g: 1.4 },
  school_bell: { fn: schoolBell, max: 1, gap: 0.5, g: 1.6 },
  teach_step: { fn: teachStep, max: 3, gap: 0.06, g: 1.3 },
  teach_skid: { fn: teachSkid, max: 1, gap: 0.2, g: 1.5 },
  teach_hop: { fn: teachHop, max: 2, gap: 0.1, g: 1.4 },
  teach_land: { fn: teachLand, max: 2, gap: 0.1, g: 1.5 },
  teach_ding: { fn: teachDing, max: 1, gap: 0.25, g: 1.4 },
  teach_swish: { fn: teachSwish, max: 2, gap: 0.08, g: 1.4 },
};
