// [v18 bear events] Boss + blood moon + defense sounds. Loaded by audio.js through
// import.meta.glob('./extra/*.js').
//
//   boss_roar     huge, wobbly, lowpassed roar (boss intro / roar attack)
//   boss_slam     ground slam: sub thud + rumble + debris crackle
//   boss_stomp    one heavy footstomp
//   boss_sting    dramatic minor stab (the boss title card)
//   boss_win      the boss is full: a happy bell arpeggio
//   bm_toll       a deep, slow church-bell toll (blood moon warnings)
//   bm_drone      ~5 s eerie detuned drone with a slow filter swell (loops by re-triggering)
//   bm_heart      heartbeat: lub-dub
//   bm_dawn       sunrise shimmer: rising glockenspiel + pad
//   pinecone_throw  a little whoosh
//   bonk          hollow wooden bonk (pinecone on a bear's head)
//   honey_squish  sticky squelch
//   net_snap      spring snap + rope whip
//   water_blast   pressurised water burst
const rnd = (a, b) => a + Math.random() * (b - a);

function bossRoar(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.25, 0.04);
  v.tone({ type: 'sawtooth', f: 92, f2: 58, gl: 1.5, a: 0.12, hold: 0.9, rel: 0.6, peak: 0.55, lp: 620, q: 2, vr: 7, vc: 60, vd: 0.3 });
  v.tone({ type: 'square', f: 61, f2: 42, gl: 1.5, a: 0.15, hold: 0.85, rel: 0.6, peak: 0.3, lp: 420, det: 14 });
  v.tone({ type: 'sawtooth', f: 180, f2: 110, gl: 1.2, a: 0.1, hold: 0.7, rel: 0.5, peak: 0.16, lp: 900, q: 4, vr: 11, vc: 80 });
  v.noise({ buf: 'pink', f: 380, f2: 220, gl: 1.4, q: 1.1, a: 0.1, hold: 0.9, rel: 0.6, peak: 0.6 });
  v.noise({ buf: 'brown', ft: 'lowpass', f: 160, a: 0.05, hold: 1.1, rel: 0.5, peak: 0.7 });
  return v.end;
}

function bossSlam(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.2, 0.05);
  v.tone({ type: 'sine', f: 70, f2: 28, gl: 0.35, a: 0.002, rel: 0.6, peak: 1.0 });
  v.tone({ type: 'triangle', f: 120, f2: 50, gl: 0.2, a: 0.002, rel: 0.3, peak: 0.5, lp: 600 });
  v.noise({ buf: 'brown', ft: 'lowpass', f: 220, a: 0.003, hold: 0.25, rel: 0.9, peak: 0.9 });
  v.spray({ t: 0.05, buf: 'pink', dur: 0.7, f: 900, ft: 'bandpass', q: 0.8, n: 26, peak: 0.25 });
  return v.end;
}

function bossStomp(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.1, 0.08);
  v.tone({ type: 'sine', f: 82, f2: 36, gl: 0.18, a: 0.002, rel: 0.3, peak: 0.85 });
  v.noise({ buf: 'brown', ft: 'lowpass', f: 300, a: 0.002, rel: 0.25, peak: 0.6 });
  return v.end;
}

function bossSting(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.35, 0);
  // a minor-chord brass stab, falling tritone at the end
  for (const [f, p] of [[110, 0.3], [130.8, 0.24], [164.8, 0.22], [220, 0.18]]) {
    v.tone({ type: 'sawtooth', f, a: 0.02, hold: 0.55, rel: 0.5, peak: p, lp: 1400, lp2: 500, lpt: 1, det: 6 });
    v.tone({ type: 'square', f: f * 0.5, a: 0.02, hold: 0.5, rel: 0.5, peak: p * 0.4, lp: 600 });
  }
  v.tone({ t: 0.75, type: 'sawtooth', f: 155.6, f2: 110, gl: 0.6, a: 0.02, hold: 0.3, rel: 0.6, peak: 0.25, lp: 900 });
  v.noise({ buf: 'pink', f: 160, ft: 'lowpass', a: 0.005, rel: 0.8, peak: 0.6 }); // timpani-ish hit
  v.tone({ type: 'sine', f: 55, f2: 45, gl: 0.6, a: 0.003, rel: 0.9, peak: 0.6 });
  return v.end;
}

function bossWin(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.3, 0);
  [523, 659, 784, 1047, 1319].forEach((f, i) => v.bell({ t: i * 0.09, f, rel: 1.2, peak: 0.22 }));
  for (const f of [262, 330, 392]) v.tone({ t: 0.4, type: 'triangle', f, a: 0.05, hold: 0.5, rel: 0.7, peak: 0.12 });
  return v.end;
}

function bmToll(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.5, 0);
  v.bell({ f: 98, rel: 3.2, peak: 0.55 });
  v.bell({ f: 196.5, rel: 2.2, peak: 0.2 });
  v.tone({ type: 'sine', f: 49, a: 0.01, hold: 0.2, rel: 2.6, peak: 0.35 });
  return v.end;
}

function bmDrone(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.5, 0.02);
  const root = rnd(0, 1) < 0.5 ? 55 : 51.9;
  v.tone({ type: 'sawtooth', f: root, a: 1.6, hold: 1.8, rel: 1.8, peak: 0.22, lp: 240, lp2: 520, lpt: 2.6, q: 3, det: -9 });
  v.tone({ type: 'sawtooth', f: root * 1.5, a: 1.8, hold: 1.4, rel: 1.8, peak: 0.1, lp: 380, q: 4, det: 11 });
  v.tone({ type: 'sine', f: root * 4.24, a: 2, hold: 1, rel: 1.6, peak: 0.05, vr: 5, vc: 30 }); // the eerie tritone whistle
  v.noise({ buf: 'pink', f: 600, f2: 300, q: 2.5, a: 1.5, hold: 1.5, rel: 2, peak: 0.08 });
  return v.end;
}

function bmHeart(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.1, 0.02);
  for (const [t, p] of [[0, 0.9], [0.24, 0.65]]) {
    v.tone({ t, type: 'sine', f: 62, f2: 40, gl: 0.12, a: 0.004, rel: 0.18, peak: p });
    v.noise({ t, buf: 'brown', ft: 'lowpass', f: 140, a: 0.004, rel: 0.12, peak: p * 0.5 });
  }
  return v.end;
}

function bmDawn(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.4, 0);
  [392, 494, 587, 784, 988].forEach((f, i) => v.bell({ t: i * 0.14, f, rel: 1.6, peak: 0.16 }));
  for (const f of [196, 247, 294]) v.tone({ type: 'triangle', f, a: 0.6, hold: 0.6, rel: 1.2, peak: 0.08 });
  return v.end;
}

function pineconeThrow(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.1);
  v.noise({ buf: 'white', f: 900, f2: 2400, gl: 0.16, q: 1.2, a: 0.03, rel: 0.12, peak: 0.25 });
  return v.end;
}

function bonk(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.08);
  v.tone({ type: 'triangle', f: 520, f2: 260, gl: 0.08, a: 0.001, rel: 0.12, peak: 0.5 });
  v.tone({ type: 'sine', f: 180, f2: 120, gl: 0.08, a: 0.001, rel: 0.1, peak: 0.4 });
  v.noise({ buf: 'white', f: 2000, q: 1.5, bursts: [[0, 0.3, 0.02]] });
  return v.end;
}

function honeySquish(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.1);
  v.noise({ buf: 'pink', f: 500, f2: 200, gl: 0.3, q: 3, a: 0.02, hold: 0.12, rel: 0.2, peak: 0.45 });
  v.tone({ type: 'sine', f: 240, f2: 120, gl: 0.25, a: 0.01, rel: 0.25, peak: 0.2, vr: 18, vc: 60 });
  return v.end;
}

function netSnap(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.05, 0.05);
  v.noise({ buf: 'white', f: 3000, q: 2, bursts: [[0, 0.5, 0.02], [0.03, 0.3, 0.015]] });
  v.tone({ type: 'triangle', f: 900, f2: 300, gl: 0.08, a: 0.001, rel: 0.08, peak: 0.25 });
  v.rustle({ t: 0.04, buf: 'pink', dur: 0.4, f: 1400, f2: 700, q: 1, n: 16, peak: 0.3, peakAt: 0.2 });
  return v.end;
}

function waterBlast(ctx, dest, o, kit) {
  const v = new kit.Voice(ctx, dest, o, 0.1, 0.06);
  v.noise({ buf: 'white', ft: 'highpass', f: 1200, a: 0.01, hold: 0.25, rel: 0.35, peak: 0.45 });
  v.noise({ buf: 'pink', f: 500, q: 0.8, a: 0.005, hold: 0.1, rel: 0.25, peak: 0.4 });
  v.tone({ type: 'sine', f: 90, f2: 60, gl: 0.15, a: 0.002, rel: 0.15, peak: 0.4 });
  return v.end;
}

export const EXTRA_SFX = {
  boss_roar: { fn: bossRoar, max: 2, gap: 0.4, g: 1.6 },
  boss_slam: { fn: bossSlam, max: 2, gap: 0.2, g: 1.8 },
  boss_stomp: { fn: bossStomp, max: 3, gap: 0.08, g: 1.8 },
  boss_sting: { fn: bossSting, max: 1, gap: 1, g: 1.4 },
  boss_win: { fn: bossWin, max: 1, gap: 1, g: 1.6 },
  bm_toll: { fn: bmToll, max: 2, gap: 0.8, g: 1.4 },
  bm_drone: { fn: bmDrone, max: 2, gap: 2, g: 1.3 },
  bm_heart: { fn: bmHeart, max: 2, gap: 0.3, g: 1.6 },
  bm_dawn: { fn: bmDawn, max: 1, gap: 1, g: 1.4 },
  pinecone_throw: { fn: pineconeThrow, max: 4, gap: 0.05, g: 1.6 },
  bonk: { fn: bonk, max: 4, gap: 0.05, g: 2 },
  honey_squish: { fn: honeySquish, max: 3, gap: 0.1, g: 2 },
  net_snap: { fn: netSnap, max: 2, gap: 0.1, g: 2 },
  water_blast: { fn: waterBlast, max: 3, gap: 0.1, g: 1.8 },
};
