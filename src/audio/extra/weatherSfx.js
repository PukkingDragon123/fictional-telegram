// [v26 seasons] Weather sounds. Loaded by audio.js through import.meta.glob('./extra/*.js').
//
//   rain_loop      ~4.5 s bed of rain (fades in / out: re-triggered every ~3.3 s it
//                  overlaps into a steady loop; the volume follows the rain)
//   thunder        a crack and a long rolling rumble (play it with a delay: distance)
//   wind_gust      a howling swell
//   snow_crunch    one crunchy footstep in the snow
//   fire_crackle   a fire pit / heater catching: pops and a whoomph
//   mist_hiss      the misting fan's spray
//   teeth_chatter  rapid little clicks
//   brrr           a lip-trill "brrrr"
//   umbrella_pop   an umbrella snapping open
function rainLoop(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.15, 0.03);
  v.noise({ buf: 'pink', ft: 'bandpass', f: 1700, q: 0.45, a: 1.1, hold: 2.3, rel: 1.1, peak: 0.34 });
  v.noise({ buf: 'white', ft: 'highpass', f: 4500, a: 1.1, hold: 2.3, rel: 1.1, peak: 0.1 });
  v.rustle({ buf: 'white', dur: 4.4, f: 2800, q: 0.9, n: 80, peak: 0.14, peakAt: 0.5, rise: 0.7, fall: 0.7, flicker: 0.9 });
  v.spray({ t: 0.6, buf: 'pink', dur: 3.2, f: 3800, ft: 'bandpass', q: 1.4, n: 60, peak: 0.07, curve: 0.4 });
  return v.end;
}

function thunder(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.45, 0.1);
  v.noise({ buf: 'white', ft: 'bandpass', f: 2600, f2: 380, gl: 0.3, q: 0.55, a: 0.003, hold: 0.05, rel: 0.35, peak: 0.5 });
  v.noise({ buf: 'brown', ft: 'lowpass', f: 420, f2: 110, gl: 2.6, a: 0.05, hold: 0.6, rel: 2.8, peak: 1.0 });
  v.spray({ t: 0.1, buf: 'brown', dur: 2.8, f: 150, ft: 'lowpass', q: 0.7, n: 34, peak: 0.65, curve: 1.15 });
  v.tone({ type: 'sine', f: 50, f2: 30, gl: 2.2, a: 0.04, hold: 0.4, rel: 2.4, peak: 0.42 });
  return v.end;
}

function windGust(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.25, 0.18);
  v.noise({ buf: 'pink', ft: 'bandpass', f: 360, f2: 920, gl: 1.5, q: 1.9, a: 0.9, hold: 0.6, rel: 1.5, peak: 0.45 });
  v.noise({ t: 0.3, buf: 'pink', ft: 'bandpass', f: 1250, f2: 640, gl: 2, q: 3.2, a: 0.8, hold: 0.4, rel: 1.3, peak: 0.12 });
  v.rustle({ t: 0.2, buf: 'white', dur: 2.4, f: 2200, q: 1.2, n: 30, peak: 0.05, peakAt: 0.45, flicker: 0.7 });
  return v.end;
}

function snowCrunch(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.02, 0.12);
  v.noise({ buf: 'white', ft: 'bandpass', f: 1700, q: 1.1, bursts: [[0, 0.45, 0.03], [0.022, 0.32, 0.028], [0.046, 0.4, 0.035], [0.075, 0.22, 0.05], [0.11, 0.12, 0.04]] });
  v.noise({ buf: 'brown', ft: 'lowpass', f: 300, a: 0.002, rel: 0.09, peak: 0.25 });
  return v.end;
}

function fireCrackle(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.12, 0.08);
  v.noise({ buf: 'brown', ft: 'lowpass', f: 600, f2: 220, gl: 0.5, a: 0.04, hold: 0.25, rel: 0.6, peak: 0.55 }); // whoomph
  v.spray({ t: 0.15, buf: 'white', dur: 1.2, f: 2200, ft: 'highpass', q: 0.7, n: 22, peak: 0.3, curve: 1.3 });
  return v.end;
}

function mistHiss(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.08, 0.06);
  v.noise({ buf: 'white', ft: 'highpass', f: 5200, a: 0.08, hold: 0.7, rel: 0.4, peak: 0.25 });
  v.tone({ type: 'sine', f: 110, a: 0.1, hold: 0.7, rel: 0.3, peak: 0.08 }); // the fan motor
  return v.end;
}

function teethChatter(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.02, 0.1);
  const b = [];
  for (let i = 0; i < 9; i++) b.push([i * 0.045 + Math.random() * 0.008, 0.35 + Math.random() * 0.2, 0.012]);
  v.noise({ buf: 'white', ft: 'bandpass', f: 3200, q: 2.2, bursts: b });
  return v.end;
}

function brrr(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.08);
  v.tone({ type: 'sawtooth', f: 150, f2: 120, gl: 0.6, a: 0.03, hold: 0.45, rel: 0.15, peak: 0.25, lp: 900, q: 1.5, vr: 26, vc: 70, vd: 0.05 });
  v.noise({ buf: 'pink', ft: 'bandpass', f: 700, q: 1.5, a: 0.03, hold: 0.45, rel: 0.15, peak: 0.12 });
  return v.end;
}

function umbrellaPop(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.1);
  v.noise({ buf: 'pink', ft: 'bandpass', f: 900, f2: 2400, gl: 0.12, q: 1.2, a: 0.01, hold: 0.04, rel: 0.08, peak: 0.35 });
  v.tone({ t: 0.1, type: 'triangle', f: 520, f2: 260, gl: 0.06, a: 0.002, rel: 0.08, peak: 0.3 });
  return v.end;
}

export const EXTRA_SFX = {
  rain_loop: { fn: rainLoop, max: 3, gap: 1, g: 1.3 },
  thunder: { fn: thunder, max: 2, gap: 0.5, g: 1.6 },
  wind_gust: { fn: windGust, max: 2, gap: 1, g: 1.4 },
  snow_crunch: { fn: snowCrunch, max: 3, gap: 0.1, g: 1.5 },
  fire_crackle: { fn: fireCrackle, max: 2, gap: 0.3, g: 1.5 },
  mist_hiss: { fn: mistHiss, max: 2, gap: 0.3, g: 1.3 },
  teeth_chatter: { fn: teethChatter, max: 3, gap: 0.2, g: 1.6 },
  brrr: { fn: brrr, max: 2, gap: 0.3, g: 1.5 },
  umbrella_pop: { fn: umbrellaPop, max: 3, gap: 0.1, g: 1.4 },
};
