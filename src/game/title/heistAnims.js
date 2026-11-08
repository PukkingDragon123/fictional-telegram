// [v33 title] Extra Reynard animations for the noon title cinematic (HeistScene.js).
//
// FoxRig keeps its animation table private, so these are plain defs in the same shape
// (fn(t, pose, faceReq, state, rig)) started through playDef(), which does exactly what
// FoxRig.play() does with a def it was handed. The rig's own defs can be borrowed and
// layered (borrow(rig, 'run')) without touching src/entities/foxRig.js.
//
//   lick_count  lick the thumb, then flick through a bundle of bills (emits 'lick', 'flick')
//   hug_pile    lean over the crate and hug the heap of coins, squeezing (emits 'squeeze')
//   scoop       a blur of paws sweeping the desk into the sack (emits 'sweep')
//   windup      legs spinning in place before the dash, both paws on the sack (emits 'step')
//   freeze      stiff as a board, eyes wide, a tremble (the double take's "wait...")
//   pick_kiss   crouch, snatch the coin off the grass, kiss it (emits 'grab', 'kiss')
//   pour        lift the sack over the crate and tip the money out (emits 'pour')
//   sheepish    a guilty grin at the camera, paw behind the head
const { sin, cos, abs, max, min, PI } = Math;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const win = (t, a, b, ra = 0.12, rb = 0.12) => smooth((t - a) / ra) * (1 - smooth((t - b) / rb));
const pulse = (t, a, d) => (t >= a && t < a + d ? sin(((t - a) / d) * PI) : 0);
const once = (s, key, cond, fn) => { if (cond && !s[key]) { s[key] = true; fn(); } };

function life(t, p, amt = 1) {
  const br = sin(t * 2.3);
  p.breath = br * amt;
  p.chRx += br * 0.014 * amt;
  p.hRx += -br * 0.016 * amt;
  p.tSide += sin(t * 1.7) * 0.3 * amt;
  p.tLift += sin(t * 1.1) * 0.07 * amt;
}

/** The rig's own def for an animation name (plays it for a moment to read it, then restores). */
export function borrow(rig, name) {
  const cache = (rig._heistDefs ||= {});
  if (cache[name]) return cache[name];
  const prev = rig._cur;
  rig.play(name, { fade: 0 });
  const def = rig._cur?.name === name ? rig._cur.def : null;
  if (prev) rig._cur = prev;
  cache[name] = def;
  return def;
}

/** FoxRig.play() for a def object (see the header). */
export function playDef(rig, name, def, { fade = 0.2, loop, onDone, speed = 1 } = {}) {
  if (!def) return rig;
  const cur = rig._cur;
  if (cur && cur.def === def && cur.loop) return rig;
  if (cur && cur.def.exit) cur.def.exit(cur.state, rig, name);
  rig._fFrom.copy(rig._fOut);
  rig._fadeT = 0;
  rig._fadeDur = Math.max(0, fade);
  rig._cur = { name, def, t: 0, loop: loop ?? !!def.loop, speed, onDone, state: {}, done: false };
  if (def.enter) def.enter(rig._cur.state, rig);
  return rig;
}

export const HEIST_ANIMS = {
  lick_count: {
    loop: true, expr: 'greedy',
    fn(t, p, f, s, rig) {
      life(t, p, 0.4);
      const C = 3.4, u = t % C, cyc = Math.floor(t / C);
      // the bundle in the left paw, held up close
      p.ik(p.aL, 1.6, 3.6, 7.0, 1, -0.6, -0.5); p.pawL = 'fist';
      p.aL.wx = -0.5;
      p.chRx += 0.02; p.hRx -= 0.1; // (chin up: the low title camera wants his face)
      // lick the thumb
      const lw = win(u, 0.05, 0.75, 0.22, 0.2);
      // then flick, flick, flick through the bills
      const fu = u - 0.95;
      const fk = fu > 0 ? Math.floor(fu / 0.4) : -1;
      const fp = fu > 0 && fk < 6 ? (fu % 0.4) / 0.4 : 0;
      const flick = fp > 0 ? (fp < 0.35 ? 0 : sin(((fp - 0.35) / 0.65) * PI)) : 0;
      const fw = win(u, 0.8, C - 0.12, 0.18, 0.1);
      const bx = 1.9 + flick * 2.4, by = 4.4 + flick * 1.2, bz = 7.2 - flick * 0.4;
      p.ik(p.aR, lerp(bx, 1.0, lw), lerp(by, 7.3, lw), lerp(bz, 9.2, lw), 1, -0.6, -0.3, max(lw, fw));
      p.aR.st = 1.6;
      p.pawR = lw > 0.5 ? 'point' : 'open';
      p.hRx += 0.1 * lw - 0.04 * flick;
      if (lw > 0.4) {
        f.mouth = u > 0.25 && u < 0.6 ? 'tongue' : 'mmm';
        f.eyeL = f.eyeR = 'happy';
      } else if (fw > 0.3) {
        f.mouth = fk % 2 ? 'grin' : 'smile';
        f.eyeL = f.eyeR = fk >= 3 ? 'coin' : 'squint';
        f.look = [-0.2, -0.6];
      }
      once(s, 'l' + cyc, u > 0.3, () => rig._emit('lick'));
      if (fk >= 0 && fk < 6) once(s, 'f' + cyc + '_' + fk, fp > 0.55, () => rig._emit('flick'));
      p.tSide = sin(t * 9) * 0.45;
    },
  },

  hug_pile: {
    dur: 2.6, hold: true, expr: 'love', lookW: 0.1,
    fn(t, p, f, s, rig) {
      const w = smooth(t / 0.35);
      const sq = abs(sin(t * 7)) * win(t, 0.4, 2.3, 0.2, 0.3);
      p.lean = 0.34 * w; p.chRx += 0.3 * w + sq * 0.05; p.hRx -= 0.12 * w;
      p.hRz = 0.32 * w; p.hRy = -0.15 * w;
      p.hipY = -0.5 * w; p.lL.kn = p.lR.kn = 0.35 * w; p.lL.sw = p.lR.sw = -0.25 * w;
      // arms round the heap on the crate in front
      const rx = 4.2 - sq * 0.8;
      p.ik(p.aL, rx, -0.2 - sq * 0.3, 8.6, 1, -0.2, -0.4, w);
      p.ik(p.aR, rx, -0.2 - sq * 0.3, 8.6, 1, -0.2, -0.4, w);
      p.aL.st = p.aR.st = 1.7;
      p.pawL = p.pawR = 'open';
      p.y += sq * 0.3; p.sq *= 1 - sq * 0.03;
      p.tSide = sin(t * 14) * 0.7 * w; p.tLift += 0.6 * w; p.tPuff = 1 + 0.15 * w;
      p.eL.fl = p.eR.fl = -0.2;
      f.eyeL = f.eyeR = 'closed';
      f.mouth = Math.floor(t * 3) % 3 === 2 ? 'kiss' : 'smile';
      f.blush = 1;
      const k = Math.floor(t * 7 / PI);
      if (t > 0.4 && t < 2.3 && s.k !== k) { s.k = k; rig._emit('squeeze'); }
    },
  },

  scoop: {
    dur: 0.95, hold: true, expr: 'determined',
    fn(t, p, f, s, rig) {
      const a = t * 34;
      p.lean = 0.3; p.chRx += 0.22; p.hRx += 0.1;
      p.ik(p.aL, 3 + sin(a) * 3, 0.8 + cos(a) * 1.2, 8.4 + cos(a * 0.5) * 1.5, 1, -0.3, -0.3);
      p.ik(p.aR, 3 + sin(a + PI) * 3, 0.8 + cos(a + PI) * 1.2, 8.4 + cos(a * 0.5 + 1) * 1.5, 1, -0.3, -0.3);
      p.pawL = p.pawR = 'open';
      p.x += sin(t * 61) * 0.25;
      p.chRy = sin(a * 0.5) * 0.25;
      p.y += abs(sin(t * 30)) * 0.4;
      p.tPuff = 1.3; p.tLift = 0.8; p.tSide = sin(t * 40) * 0.6;
      p.hatY = abs(sin(t * 20)) * 0.6;
      f.eyeL = f.eyeR = 'narrow'; f.mouth = 'grit'; f.sweat = 1;
      const k = Math.floor(a / PI);
      if (s.k !== k) { s.k = k; rig._emit('sweep'); }
    },
  },

  windup: {
    loop: true, expr: 'determined',
    fn(t, p, f, s, rig) {
      const ph = (t / 0.16) * PI * 2, sn = sin(ph), cs = cos(ph);
      p.lean = -0.16; p.hRx = -0.12; p.chRx = -0.06;
      p.lL.sw = -sn * 1.3 - 0.3; p.lR.sw = sn * 1.3 - 0.3;
      p.lL.kn = max(0, cs) * 2.0 + 0.3; p.lR.kn = max(0, -cs) * 2.0 + 0.3;
      p.y = 1.2 + abs(sn) * 0.6; p.hipY = 0.2;
      p.x += sin(t * 70) * 0.18;
      p.tLift = 0.6; p.tSide = sin(t * 30) * 0.5; p.tPuff = 1.25;
      p.hatRx = 0.2;
      p.eL.fl = p.eR.fl = 0.7;
      f.eyeL = f.eyeR = 'narrow'; f.mouth = 'grit';
      const k = Math.floor(ph / PI);
      if (s.k !== undefined && k !== s.k) rig._emit('step');
      s.k = k;
    },
  },

  freeze: {
    loop: true, expr: 'alarmed', lookW: 0.15,
    fn(t, p, f) {
      const tr = sin(t * 71) * 0.06;
      p.chRx += 0.05; p.hRx += 0.04; p.x += tr;
      p.ik(p.aL, 1.8, 2.6, 6.6, 1, -0.6, -0.5); p.pawL = 'fist';
      p.ik(p.aR, 2.4, 3.2, 6.6, 1, -0.6, -0.5); p.pawR = 'fist';
      p.propL = 'stack'; p.propR = 'coin';
      p.eL.fl = p.eR.fl = 0.3 + abs(tr) * 2; p.tPuff = 1.2; p.tLift = 0.1; p.tSide = 0;
      p.sq *= 1.02;
      f.blink = false; f.eyeL = f.eyeR = 'open'; f.mouth = 'slack'; f.sweat = 1;
    },
  },

  pick_kiss: {
    dur: 1.7, hold: true, expr: 'greedy', lookW: 0.2,
    fn(t, p, f, s, rig) {
      // down: crouch and reach for the coin on the grass in front
      const dn = win(t, 0, 0.45, 0.16, 0.16);
      p.hipY = -2.4 * dn; p.lean = 0.5 * dn; p.chRx += 0.3 * dn; p.hRx += 0.2 * dn;
      p.lL.sw = p.lR.sw = -0.9 * dn; p.lL.kn = p.lR.kn = 1.6 * dn;
      p.ik(p.aR, 2.2, -6.4, 7.6, 1, -0.3, -0.5, dn);
      p.pawR = dn > 0.5 ? 'open' : 'fist';
      // up: hold it up to the face, admire it, kiss it
      const up = smooth((t - 0.5) / 0.3);
      const kiss = win(t, 0.95, 1.35, 0.1, 0.12);
      p.ik(p.aR, lerp(2.8, 1.2, kiss), lerp(9.5, 7.6, kiss), lerp(8.8, 9.6, kiss), 1, -0.6, -0.2, up);
      p.aR.st = 1.6;
      if (t > 0.38) { p.propR = 'coin'; p.pawR = 'fist'; }
      p.hRx += -0.1 * up * (1 - kiss); p.hRz += 0.12 * up;
      p.y += pulse(t, 1.35, 0.3) * 1.4;
      p.tSide = sin(t * 10) * 0.5 * up; p.tLift += 0.5 * up;
      if (kiss > 0.4) { f.mouth = 'kiss'; f.eyeL = f.eyeR = 'closed'; f.blush = 1; }
      else if (up > 0.5) { f.eyeL = f.eyeR = 'coin'; f.mouth = 'grin'; }
      once(s, 'grab', t > 0.38, () => rig._emit('grab'));
      once(s, 'kiss', t > 1.0, () => rig._emit('kiss'));
    },
  },

  pour: {
    dur: 1.6, hold: true, expr: 'greedy',
    fn(t, p, f, s, rig) {
      // lift the sack up over the crate and tip it forward, shaking the coins out
      const up = smooth(t / 0.4) * (1 - smooth((t - 1.35) / 0.25));
      const tip = win(t, 0.35, 1.3, 0.2, 0.2);
      const shake = sin(t * 38) * tip;
      p.both = [shake * 0.5, lerp(1.6, 5.4, up), lerp(7.4, 10.4, up)];
      p.bothRx = 1.25 * tip; p.bothRz = shake * 0.08;
      p.lean = 0.12 * up; p.chRx += 0.08 * up - 0.06 * tip;
      p.hRx += 0.22 * tip;
      p.y += abs(shake) * 0.25;
      p.tSide = sin(t * 12) * 0.5; p.tLift += 0.4 * up;
      f.eyeL = f.eyeR = tip > 0.5 ? 'coin' : null; f.mouth = tip > 0.5 ? 'grin' : null;
      once(s, 'pour', t > 0.45, () => rig._emit('pour'));
    },
  },

  sheepish: {
    dur: 1.4, hold: true, expr: 'embarrassed', lookW: 1,
    fn(t, p, f) {
      const w = smooth(t / 0.25);
      // paw scratching the back of the head, a wobbly grin
      p.ik(p.aR, 4.6, 13.2 + sin(t * 26) * 0.4 * w, 2.2, 1, 0.2, -0.6, w);
      p.aR.st = 1.6; p.pawR = 'open';
      p.ik(p.aL, 1.8, 2.6, 6.6, 1, -0.6, -0.5, w); p.pawL = 'fist';
      p.propR = null;
      p.hRz = -0.2 * w; p.hRx += -0.05 * w; p.chRz = 0.06 * w;
      p.sq *= 1 - 0.04 * w; p.hipY = -0.3 * w;
      p.eL.fl = p.eR.fl = 0.5 * w; p.tLift = -0.3; p.tCurl = 1.2;
      f.mouth = Math.floor(t * 4) % 2 ? 'grimace' : 'wobbly';
      f.eyeL = 'nervous'; f.eyeR = 'half'; f.sweat = 2; f.blush = 1;
      f.browL = f.browR = 'worried';
    },
  },
};
