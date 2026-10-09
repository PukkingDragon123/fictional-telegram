// [v26 feast] Sounds for the feast events (src/game/feast/*, src/game/feastEvents/*).
// Loaded by audio.js through import.meta.glob('./extra/*.js'). All procedural.
//
//   feast_pop      an event icon pops up: bubbly bloop + a two-note ding
//   feast_whoosh   the camera swoops in on an event
//   feast_click    a choice on the card: wooden clack
//   feast_good     a happy outcome stinger (glock arpeggio)
//   feast_bad      a sad trombone (wah wah wah waaah)
//   feast_meh      a shrugging two-note
//   feast_tick     an event is about to expire
//   feast_expire   an unanswered event fizzles out
//   feast_achoo    ah... ah... CHOO!
//   feast_buzz     an angry bee swarm
//   feast_flies    flies buzzing round rotten food
//   feast_cough    a hacking cough
//   feast_ptoo     something spat out (the fish bone!)
//   feast_snore    a big bear snore
//   feast_shutter  a phone camera shutter
//   feast_screech  an eagle's screech
//   feast_party    a party horn
//   feast_sizzle   crackling flames
//   feast_heave    a grunt of effort
//   feast_scratch  a record scratch
//   feast_drumroll a snare drum roll
//   feast_squelch  mud letting go of something (schloop)
const rnd = (a, b) => a + Math.random() * (b - a);

function pop(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.15, 0.04);
  v.tone({ type: 'sine', f: 260, f2: 900, gl: 0.07, a: 0.002, rel: 0.1, peak: 0.55 });
  v.noise({ buf: 'pink', f: 1500, q: 2, a: 0.001, rel: 0.04, peak: 0.25 });
  v.bell({ t: 0.06, f: 1320, parts: kit.GLOCK, peak: 0.22, rel: 0.5 });
  v.bell({ t: 0.15, f: 1760, parts: kit.GLOCK, peak: 0.2, rel: 0.7 });
  return v.end;
}

function whoosh(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.25, 0.03);
  v.noise({ buf: 'pink', f: 300, f2: 3200, gl: 0.35, q: 1.2, a: 0.12, hold: 0.05, rel: 0.25, peak: 0.6 });
  v.tone({ type: 'triangle', f: 220, f2: 660, gl: 0.35, a: 0.08, hold: 0.05, rel: 0.2, peak: 0.12 });
  v.tone({ t: 0.32, type: 'sine', f: 880, f2: 1320, gl: 0.08, a: 0.003, rel: 0.25, peak: 0.12 });
  return v.end;
}

function click(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.06, 0.06);
  v.noise({ buf: 'white', f: 2200, q: 3, a: 0.001, rel: 0.035, peak: 0.5 });
  v.tone({ type: 'triangle', f: 340, f2: 220, gl: 0.05, a: 0.001, rel: 0.07, peak: 0.4 });
  v.noise({ t: 0.04, buf: 'pink', f: 900, q: 2, a: 0.001, rel: 0.05, peak: 0.25 });
  return v.end;
}

function good(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.3, 0.01);
  [523, 659, 784, 1047].forEach((f, i) => v.bell({ t: i * 0.075, f, parts: kit.GLOCK, peak: 0.26, rel: 0.9 }));
  v.tone({ t: 0.3, type: 'triangle', f: 1047, a: 0.01, hold: 0.15, rel: 0.4, peak: 0.12, vr: 6, vc: 20 });
  v.tone({ t: 0.3, type: 'sine', f: 523, a: 0.01, hold: 0.2, rel: 0.4, peak: 0.15 });
  return v.end;
}

function bad(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.2, 0.01);
  const notes = [[0, 311, 0.22], [0.28, 294, 0.22], [0.56, 277, 0.22], [0.86, 262, 0.75]];
  for (const [t, f, d] of notes) {
    v.tone({ t, type: 'sawtooth', f, f2: d > 0.5 ? f * 0.94 : null, gl: d, a: 0.03, hold: d * 0.6, rel: 0.12, peak: 0.3, lp: 1100, lp2: 600, lpt: d, vr: d > 0.5 ? 6 : 0, vc: 40, vd: 0.25 });
    v.tone({ t, type: 'square', f: f * 0.5, a: 0.03, hold: d * 0.6, rel: 0.12, peak: 0.08, lp: 500 });
  }
  return v.end;
}

function meh(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.15, 0.01);
  v.tone({ type: 'triangle', f: 392, a: 0.01, hold: 0.1, rel: 0.12, peak: 0.25 });
  v.tone({ t: 0.18, type: 'triangle', f: 349, f2: 330, gl: 0.3, a: 0.01, hold: 0.15, rel: 0.2, peak: 0.25 });
  return v.end;
}

function tick(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.03);
  v.noise({ buf: 'white', f: 3200, q: 4, a: 0.001, rel: 0.02, peak: 0.45 });
  v.tone({ type: 'sine', f: 1800, a: 0.001, rel: 0.04, peak: 0.15 });
  return v.end;
}

function expire(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.15, 0.03);
  v.noise({ buf: 'pink', f: 2400, f2: 300, gl: 0.6, q: 1, a: 0.01, hold: 0.1, rel: 0.5, peak: 0.35 });
  v.tone({ type: 'triangle', f: 600, f2: 140, gl: 0.6, a: 0.01, rel: 0.6, peak: 0.2 });
  return v.end;
}

function achoo(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.12, 0.05);
  v.tone({ type: 'triangle', f: 330, f2: 420, gl: 0.3, a: 0.05, hold: 0.15, rel: 0.12, peak: 0.25, lp: 1600 });
  v.noise({ buf: 'pink', f: 900, q: 3, a: 0.05, hold: 0.2, rel: 0.1, peak: 0.2 });
  v.tone({ t: 0.5, type: 'triangle', f: 380, f2: 520, gl: 0.3, a: 0.05, hold: 0.15, rel: 0.1, peak: 0.28, lp: 1600 });
  v.noise({ t: 0.95, buf: 'white', ft: 'highpass', f: 1800, a: 0.003, hold: 0.06, rel: 0.3, peak: 0.8 });
  v.noise({ t: 0.95, buf: 'pink', f: 700, f2: 300, gl: 0.3, q: 0.7, a: 0.003, hold: 0.05, rel: 0.35, peak: 0.6 });
  v.tone({ t: 0.95, type: 'sawtooth', f: 260, f2: 120, gl: 0.3, a: 0.003, rel: 0.3, peak: 0.25, lp: 900 });
  return v.end;
}

function buzz(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.05);
  for (let i = 0; i < 4; i++) v.tone({ t: i * 0.05, type: 'sawtooth', f: rnd(190, 260), f2: rnd(200, 280), gl: 1, a: 0.1, hold: 0.9, rel: 0.3, peak: 0.12, lp: 1400, q: 3, vr: rnd(14, 22), vc: 60, vd: 0.05 });
  return v.end;
}

function flies(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.03, 0.05);
  for (let i = 0; i < 2; i++) v.tone({ t: i * 0.2, type: 'sawtooth', f: rnd(380, 460), f2: rnd(300, 520), gl: 1.2, a: 0.2, hold: 0.8, rel: 0.3, peak: 0.07, lp: 2200, q: 4, vr: rnd(20, 30), vc: 90, vd: 0.05 });
  return v.end;
}

function cough(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.1, 0.06);
  for (const [t, p] of [[0, 0.7], [0.22, 0.55], [0.42, 0.8]]) {
    v.noise({ t, buf: 'pink', f: 600, f2: 300, gl: 0.12, q: 1.5, a: 0.005, hold: 0.04, rel: 0.12, peak: p });
    v.tone({ t, type: 'sawtooth', f: 180, f2: 120, gl: 0.12, a: 0.005, rel: 0.12, peak: p * 0.3, lp: 700 });
  }
  return v.end;
}

function ptoo(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.1, 0.05);
  v.noise({ buf: 'white', f: 2400, q: 1.5, a: 0.002, rel: 0.05, peak: 0.6 });
  v.tone({ t: 0.02, type: 'sine', f: 900, f2: 250, gl: 0.15, a: 0.002, rel: 0.15, peak: 0.5 });
  v.tone({ t: 0.05, type: 'triangle', f: 500, f2: 1400, gl: 0.3, a: 0.01, rel: 0.25, peak: 0.15 });
  return v.end;
}

function snore(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.1, 0.04);
  v.noise({ buf: 'brown', ft: 'lowpass', f: 300, a: 0.3, hold: 0.5, rel: 0.2, peak: 0.7 });
  v.tone({ type: 'sawtooth', f: 70, f2: 90, gl: 0.9, a: 0.3, hold: 0.5, rel: 0.2, peak: 0.25, lp: 400, vr: 28, vc: 80, vd: 0.1 });
  v.tone({ t: 1.05, type: 'sine', f: 900, f2: 1400, gl: 0.5, a: 0.1, hold: 0.2, rel: 0.25, peak: 0.08 });
  return v.end;
}

function shutter(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.03);
  v.noise({ buf: 'white', f: 4000, q: 2, bursts: [[0, 0.5, 0.025], [0.06, 0.35, 0.03]] });
  v.tone({ type: 'square', f: 2600, a: 0.001, rel: 0.02, peak: 0.08 });
  return v.end;
}

function screech(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.3, 0.04);
  v.tone({ type: 'sawtooth', f: 2400, f2: 1300, gl: 0.7, a: 0.02, hold: 0.3, rel: 0.4, peak: 0.25, lp: 3600, q: 4, vr: 26, vc: 120, vd: 0.05 });
  v.tone({ type: 'square', f: 1800, f2: 1000, gl: 0.7, a: 0.02, hold: 0.25, rel: 0.4, peak: 0.08, lp: 2600 });
  v.noise({ buf: 'white', f: 3000, q: 2, a: 0.02, hold: 0.3, rel: 0.3, peak: 0.12 });
  return v.end;
}

function party(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.1, 0.04);
  v.tone({ type: 'square', f: 420, f2: 520, gl: 0.15, a: 0.01, hold: 0.45, rel: 0.1, peak: 0.25, lp: 2000, vr: 30, vc: 40, vd: 0.05 });
  v.noise({ buf: 'pink', f: 1200, q: 2, a: 0.01, hold: 0.45, rel: 0.1, peak: 0.12 });
  v.rustle({ t: 0.05, buf: 'white', dur: 0.5, f: 3000, q: 1, n: 20, peak: 0.15 });
  return v.end;
}

function sizzle(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.05);
  v.spray({ buf: 'white', dur: 1.2, f: 2500, ft: 'highpass', n: 40, peak: 0.35 });
  v.noise({ buf: 'brown', ft: 'lowpass', f: 250, a: 0.1, hold: 0.8, rel: 0.3, peak: 0.4 });
  return v.end;
}

function heave(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.1, 0.06);
  v.tone({ type: 'sawtooth', f: 140, f2: 190, gl: 0.4, a: 0.04, hold: 0.25, rel: 0.12, peak: 0.35, lp: 700, q: 3 });
  v.noise({ buf: 'pink', f: 500, q: 2, a: 0.04, hold: 0.25, rel: 0.1, peak: 0.25 });
  return v.end;
}

function scratch(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.04);
  v.noise({ buf: 'white', f: 800, f2: 2600, gl: 0.12, q: 3, a: 0.005, hold: 0.06, rel: 0.05, peak: 0.6 });
  v.noise({ t: 0.14, buf: 'white', f: 2600, f2: 600, gl: 0.15, q: 3, a: 0.005, hold: 0.06, rel: 0.08, peak: 0.6 });
  return v.end;
}

function drumroll(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.15, 0.02);
  const bursts = [];
  for (let i = 0; i < 26; i++) bursts.push([i * 0.032, 0.25 + i * 0.012, 0.03]);
  v.noise({ buf: 'white', f: 1800, q: 0.8, bursts });
  v.noise({ t: 0.86, buf: 'pink', f: 160, ft: 'lowpass', a: 0.002, rel: 0.4, peak: 0.8 });
  v.noise({ t: 0.86, buf: 'white', f: 5000, ft: 'highpass', a: 0.002, rel: 0.7, peak: 0.35 });
  return v.end;
}

function squelch(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.08);
  v.noise({ buf: 'pink', f: 300, f2: 1400, gl: 0.25, q: 4, a: 0.01, hold: 0.15, rel: 0.1, peak: 0.6 });
  v.tone({ t: 0.25, type: 'sine', f: 300, f2: 1100, gl: 0.08, a: 0.002, rel: 0.08, peak: 0.45 });
  return v.end;
}

export const EXTRA_SFX = {
  feast_pop: { fn: pop, max: 3, gap: 0.1, g: 1.6 },
  feast_whoosh: { fn: whoosh, max: 2, gap: 0.2, g: 1.6 },
  feast_click: { fn: click, max: 3, gap: 0.05, g: 1.8 },
  feast_good: { fn: good, max: 2, gap: 0.3, g: 1.5 },
  feast_bad: { fn: bad, max: 1, gap: 0.5, g: 1.4 },
  feast_meh: { fn: meh, max: 2, gap: 0.3, g: 1.5 },
  feast_tick: { fn: tick, max: 2, gap: 0.2, g: 1.6 },
  feast_expire: { fn: expire, max: 2, gap: 0.3, g: 1.5 },
  feast_achoo: { fn: achoo, max: 1, gap: 0.5, g: 1.8 },
  feast_buzz: { fn: buzz, max: 2, gap: 0.6, g: 1.6 },
  feast_flies: { fn: flies, max: 2, gap: 0.8, g: 1.6 },
  feast_cough: { fn: cough, max: 2, gap: 0.4, g: 1.8 },
  feast_ptoo: { fn: ptoo, max: 2, gap: 0.2, g: 1.8 },
  feast_snore: { fn: snore, max: 2, gap: 1, g: 1.6 },
  feast_shutter: { fn: shutter, max: 3, gap: 0.1, g: 1.6 },
  feast_screech: { fn: screech, max: 1, gap: 0.6, g: 1.4 },
  feast_party: { fn: party, max: 2, gap: 0.3, g: 1.5 },
  feast_sizzle: { fn: sizzle, max: 2, gap: 0.6, g: 1.5 },
  feast_heave: { fn: heave, max: 3, gap: 0.15, g: 1.7 },
  feast_scratch: { fn: scratch, max: 2, gap: 0.3, g: 1.6 },
  feast_drumroll: { fn: drumroll, max: 1, gap: 1, g: 1.5 },
  feast_squelch: { fn: squelch, max: 3, gap: 0.1, g: 1.7 },
};
