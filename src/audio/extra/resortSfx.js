// [v26 resort] Bear Resort sounds. Loaded by audio.js through import.meta.glob('./extra/*.js').
//
//   rs_path        gravel crunch of a path tile going down     rs_plank   a boardwalk plank knocked in
//   rs_path_erase  a scrape as a path tile is dug up          rs_squish  flowers trampled underfoot
//   rs_crack       wood splintering (a bear's blow)           rs_crash   a whole build collapsing
//   rs_door        a little wooden door clacking              rs_ticket  ticket punch + turnstile click
//   rs_flash       photo booth flash pop                      rs_flush   a cartoon flush
//   rs_bonk        a beaver bonked by a rampaging bear
const rnd = (a, b) => a + Math.random() * (b - a);

function path(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.04, 0.12);
  for (let i = 0; i < 6; i++) v.noise({ t: i * rnd(0.015, 0.03), buf: 'white', f: rnd(1800, 3600), q: 2.5, bursts: [[0, rnd(0.1, 0.22), 0.012]] });
  v.noise({ buf: 'brown', ft: 'lowpass', f: 400, a: 0.004, hold: 0.04, rel: 0.08, peak: 0.25 });
  return v.end;
}
function plank(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.06, 0.06);
  v.tone({ type: 'triangle', f: rnd(210, 260), f2: 150, gl: 0.06, a: 0.001, rel: 0.12, peak: 0.45, lp: 1400 });
  v.noise({ buf: 'pink', f: 1200, q: 1.5, bursts: [[0, 0.3, 0.02]] });
  return v.end;
}
function pathErase(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.04, 0.1);
  v.noise({ buf: 'pink', f: 900, f2: 1600, gl: 0.15, q: 1.2, a: 0.01, hold: 0.08, rel: 0.08, peak: 0.3 });
  return v.end;
}
function squish(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.03, 0.1);
  v.tone({ type: 'sine', f: rnd(300, 360), f2: 140, gl: 0.08, a: 0.004, rel: 0.08, peak: 0.25 });
  v.noise({ buf: 'pink', f: 700, q: 1, bursts: [[0, 0.2, 0.03], [0.04, 0.12, 0.02]] });
  return v.end;
}
function crack(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.08, 0.08);
  v.noise({ buf: 'white', f: rnd(2200, 3000), q: 1.4, bursts: [[0, 0.6, 0.01], [0.02, 0.4, 0.012], [0.05, 0.3, 0.01], [0.09, 0.2, 0.012]] });
  v.tone({ type: 'triangle', f: rnd(150, 190), f2: 80, gl: 0.08, a: 0.001, rel: 0.1, peak: 0.35, lp: 900 });
  return v.end;
}
function crash(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.18, 0.06);
  v.tone({ type: 'sine', f: 80, f2: 34, gl: 0.3, a: 0.002, rel: 0.5, peak: 0.8 });
  v.noise({ buf: 'brown', ft: 'lowpass', f: 300, a: 0.003, hold: 0.2, rel: 0.7, peak: 0.7 });
  let t = 0.03;
  for (let i = 0; i < 12; i++) { v.noise({ t, buf: 'white', f: rnd(800, 3200), q: 2, bursts: [[0, 0.35 * (1 - i / 14), 0.02]] }); v.tone({ t, type: 'triangle', f: rnd(160, 420), a: 0.001, rel: 0.05, peak: 0.12 }); t += rnd(0.03, 0.08); }
  return v.end;
}
function door(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.08);
  v.tone({ type: 'triangle', f: 320, f2: 240, gl: 0.04, a: 0.001, rel: 0.06, peak: 0.3, lp: 1600 });
  v.tone({ t: 0.07, type: 'triangle', f: 260, f2: 200, gl: 0.04, a: 0.001, rel: 0.08, peak: 0.35, lp: 1400 });
  return v.end;
}
function ticket(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.05);
  v.noise({ buf: 'white', f: 3200, q: 3, bursts: [[0, 0.4, 0.008]] });
  v.bell({ t: 0.05, f: 1760, parts: kit.SOFT, peak: 0.08, rel: 0.18 });
  for (let i = 0; i < 3; i++) v.noise({ t: 0.22 + i * 0.07, buf: 'white', f: 2400, q: 4, bursts: [[0, 0.22, 0.006]] });
  return v.end;
}
function flash(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.05);
  v.tone({ type: 'sine', f: 2600, f2: 4200, gl: 0.08, a: 0.002, rel: 0.1, peak: 0.12 });
  v.noise({ buf: 'white', f: 5000, q: 0.7, bursts: [[0.02, 0.3, 0.03]] });
  return v.end;
}
function flush(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.12, 0.08);
  v.noise({ buf: 'pink', f: 500, f2: 1400, gl: 0.6, q: 0.8, a: 0.05, hold: 0.5, rel: 0.4, peak: 0.45 });
  v.tone({ type: 'sine', f: 180, f2: 420, gl: 0.8, a: 0.05, hold: 0.4, rel: 0.3, peak: 0.12 });
  return v.end;
}
function bonk(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.08, 0.05);
  v.tone({ type: 'square', f: 520, f2: 260, gl: 0.12, a: 0.001, rel: 0.12, peak: 0.18, lp: 2000 });
  v.tone({ type: 'sine', f: 140, f2: 70, gl: 0.1, a: 0.001, rel: 0.15, peak: 0.5 });
  v.tone({ t: 0.14, type: 'sine', f: 900, f2: 1400, gl: 0.2, a: 0.01, rel: 0.25, peak: 0.08, vr: 9, vc: 40 });
  return v.end;
}

export const EXTRA_SFX = {
  rs_path: { fn: path, max: 3, gap: 0.04, g: 1.2 },
  rs_plank: { fn: plank, max: 3, gap: 0.05, g: 1.1 },
  rs_path_erase: { fn: pathErase, max: 2, gap: 0.05, g: 1 },
  rs_squish: { fn: squish, max: 2, gap: 0.12, g: 1 },
  rs_crack: { fn: crack, max: 3, gap: 0.06, g: 1.2 },
  rs_crash: { fn: crash, max: 2, gap: 0.2, g: 1.3 },
  rs_door: { fn: door, max: 2, gap: 0.1, g: 1 },
  rs_ticket: { fn: ticket, max: 2, gap: 0.1, g: 1.1 },
  rs_flash: { fn: flash, max: 2, gap: 0.1, g: 1 },
  rs_flush: { fn: flush, max: 1, gap: 0.5, g: 1 },
  rs_bonk: { fn: bonk, max: 2, gap: 0.1, g: 1.2 },
};
