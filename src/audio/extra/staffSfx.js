// [v26 staff] Beaver staff sounds. Loaded by audio.js through import.meta.glob('./extra/*.js').
//   st_ouch    a beaver gets bonked: a squeaky "eep" + a thud
//   st_siren   the stretcher crew: a little two-tone whistle siren
//   st_hired   HIRED: a rubber stamp + a happy jingle
//   st_pass    PASS: a paper swish + a low boop
//   st_knock   a job seeker knocks on the tent pole
//   st_blip    one syllable of beaver chatter (o.pitch = voice)
const rnd = (a, b) => a + Math.random() * (b - a);

function ouch(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.05);
  v.tone({ type: 'square', f: rnd(900, 1050), f2: 1500, gl: 0.06, a: 0.004, rel: 0.12, peak: 0.12, lp: 2600 });
  v.tone({ t: 0.08, type: 'triangle', f: 1300, f2: 700, gl: 0.12, a: 0.004, rel: 0.1, peak: 0.12 });
  v.tone({ type: 'sine', f: 120, f2: 60, gl: 0.1, a: 0.002, rel: 0.14, peak: 0.4 });
  v.noise({ buf: 'pink', f: 500, q: 0.8, bursts: [[0, 0.4, 0.05]] });
  return v.end;
}
function siren(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.08, 0.02);
  for (let i = 0; i < 4; i++) v.tone({ t: i * 0.22, type: 'triangle', f: i % 2 ? 880 : 1175, a: 0.01, hold: 0.16, rel: 0.05, peak: 0.12, lp: 3000 });
  return v.end;
}
function hired(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.1, 0.02);
  v.noise({ buf: 'pink', f: 260, q: 0.7, bursts: [[0, 0.7, 0.06]] });
  v.tone({ type: 'sine', f: 90, f2: 55, gl: 0.08, a: 0.002, rel: 0.12, peak: 0.45 });
  [0, 4, 7, 12].forEach((n, i) => v.tone({ t: 0.16 + i * 0.08, type: 'square', f: 523.25 * 2 ** (n / 12), a: 0.005, hold: 0.04, rel: 0.12, peak: 0.07, lp: 2800 }));
  return v.end;
}
function pass(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.03);
  v.noise({ buf: 'white', f: 2400, f2: 900, gl: 0.18, q: 0.6, a: 0.01, hold: 0.06, rel: 0.12, peak: 0.12 });
  v.tone({ t: 0.06, type: 'triangle', f: 330, f2: 220, gl: 0.15, a: 0.005, rel: 0.12, peak: 0.12 });
  return v.end;
}
function knock(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.03);
  for (let i = 0; i < 3; i++) {
    v.tone({ t: i * 0.11, type: 'sine', f: rnd(330, 380), f2: 180, gl: 0.04, a: 0.002, rel: 0.06, peak: 0.3 });
    v.noise({ t: i * 0.11, buf: 'white', f: 1400, q: 2, bursts: [[0, 0.12, 0.012]] });
  }
  return v.end;
}
function blip(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.04, 0.08);
  const f = 420 * (o?.voice || 1) * rnd(0.85, 1.2);
  v.tone({ type: 'square', f, f2: f * rnd(0.8, 1.25), gl: 0.06, a: 0.003, hold: 0.03, rel: 0.04, peak: 0.06, lp: 2200 });
  return v.end;
}

export const EXTRA_SFX = {
  st_ouch: { fn: ouch, max: 3, gap: 0.08 },
  st_siren: { fn: siren, max: 1, gap: 0.5 },
  st_hired: { fn: hired, max: 1, gap: 0.2 },
  st_pass: { fn: pass, max: 1, gap: 0.1 },
  st_knock: { fn: knock, max: 1, gap: 0.3 },
  st_blip: { fn: blip, max: 2, gap: 0.05 },
};
