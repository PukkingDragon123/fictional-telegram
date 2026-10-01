// Chick: chibi fluffy babies. Big round head, a fuzzy body, wing nubs, tiny feet.
//   duckling  mallard / wood: yellow with a brown cap, eye-stripe and back patches; pekin: pure yellow
//   gosling   canada: yellow-olive fluff with a darker back; snow: pale primrose fluff
// Fine 0.025 voxels (same as the adults), shared geometry per kind + breed, no canvases.
//
//   const c = new Chick({ kind: 'duckling' | 'gosling', breed: 'mallard' | 'pekin' | 'wood' | 'canada' | 'snow', fx: true });
//   c.play('follow');  c.update(dt);
//   loops:     idle waddle follow swim peck sleep peep (= honk = quack)
//   one-shots: eat happy (return to idle; pass { loop: true } to repeat them)
//   idle peck peep also play a single cycle with { loop: false } (then idle + onDone)
//   events:    'step', 'peep', 'peck', 'gulp', 'paddle'
//   expressions: neutral happy sleepy panic
//
// Root at the feet (the water surface for 'swim'), facing +Z.
// Duckling ~0.22 tall, gosling ~0.31 tall (CHICK_SIZE).
import {
  VS, FV, VoxelModel, ell, tone, hash3, buildGeo, geoCache, mirrorX, CritterRig, K, pulse, beat, win,
  sin, cos, abs, max, min, PI, TAU, smooth, ZZZ_ROWS, HEART_ROWS,
} from './critterKit.js';
import { birdFx, keyed } from './critterDuck.js';

const F = FV / VS;

export const CHICK_BREEDS = { duckling: ['mallard', 'pekin', 'wood'], gosling: ['canada', 'snow'] };
export const CHICK_SIZE = { duckling: { height: 0.22, length: 0.22 }, gosling: { height: 0.31, length: 0.3 } };

// body / head ellipsoids in fine voxels; joints in fine voxels (converted with F)
const KIND = {
  duckling: {
    body: [0, 2.0, -0.3, 2.9, 2.1, 3.4], bodyY: 1.5, head: [0, 2.3, 0.3, 2.7, 2.45, 2.6], headJ: [0, 2.4, 1.6], neck: 0,
    eye: [3, 1], bill: [0, 1.5, 2.6], billW: 1, billL: 2, wingJ: [2.6, 2.6, 0], wingH: 2, wingL: 3, legX: 1.2, shank: 1, tail: -4,
  },
  gosling: {
    body: [0, 2.6, -0.4, 3.8, 3.0, 4.4], bodyY: 2.5, head: [0, 3.4, 0.4, 3.0, 2.65, 3.0], headJ: [0, 4.4, 2.8], neck: 2,
    eye: [4, 1], bill: [0, 2.4, 3.0], billW: 1, billL: 3, wingJ: [3.4, 3.6, 0], wingH: 3, wingL: 4, legX: 1.6, shank: 2, tail: -5,
  },
};
const PAL = {
  'duckling:mallard': {
    fluff: 0xf6d64a, fluffD: 0xe2b83a, fluffL: 0xfde680, cap: 0x6e5428, capD: 0x564020, capL: 0x86683a,
    bill: 0x6e5e52, billD: 0x4e4238, nail: 0xd8b880, foot: 0xa08458, footD: 0x7c6440, stripe: true, spots: true,
  },
  'duckling:wood': {
    fluff: 0xefdc7a, fluffD: 0xd8c260, fluffL: 0xf8eca0, cap: 0x5a4a36, capD: 0x463a2a, capL: 0x6e5c44,
    bill: 0x4a4040, billD: 0x342c2c, nail: 0xc8a880, foot: 0x9a8a5a, footD: 0x786a44, stripe: true, spots: true,
  },
  'duckling:pekin': {
    fluff: 0xfde050, fluffD: 0xf0c838, fluffL: 0xfff2a0, cap: 0xfbd848, capD: 0xf0c838, capL: 0xfff2a0,
    bill: 0xf49a34, billD: 0xe07a24, nail: 0xf8c070, foot: 0xf8902a, footD: 0xd8701a, stripe: false, spots: false,
  },
  'gosling:canada': {
    fluff: 0xd4cc6a, fluffD: 0xb8b052, fluffL: 0xe6de8a, cap: 0x8c8a4c, capD: 0x72703c, capL: 0xa09e5c, face: 0xeadf80,
    bill: 0x3a3a36, billD: 0x2a2a28, nail: 0x5a5a50, foot: 0x5e5c4c, footD: 0x46443a, stripe: false, spots: false,
  },
  'gosling:snow': {
    fluff: 0xf2eaae, fluffD: 0xdcd492, fluffL: 0xfaf6d2, cap: 0xd6d098, capD: 0xc2bc84, capL: 0xe6e0aa, face: 0xf8f2c4,
    bill: 0x5e5050, billD: 0x463a3a, nail: 0x8a7a76, foot: 0x7e6e6a, footD: 0x625450, stripe: false, spots: false,
  },
};

function fluffy(v, c) {
  // stray fuzz: a few soft voxels poking out of the sides
  const add = [];
  for (const [k] of v.vox) {
    const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
    const out = x >= 0 ? 1 : -1;
    if (y < v.minY + 2 || y > v.maxY - 1 || v.has(x + out, y, z)) continue;
    if (hash3(x, y + 11, z) < 0.07) add.push([x + out, y, z]);
  }
  for (const [x, y, z] of add) v.set(x, y, z, c(x, y, z));
}
function bodyModel(k, c) {
  const v = new VoxelModel();
  const [cx, cy, cz, rx, ry, rz] = k.body;
  const topY = Math.floor(cy + ry - 0.5);
  const col = (x, y, z) => {
    const side = abs(x + 0.5);
    if (c.face) { // goslings: darker olive back, pale belly
      if (y >= topY - 1 && z < 2) return tone(x, y, z, c.cap, c.capD, c.capL, 0.15, 0.12);
      return tone(x, y, z, c.fluff, c.fluffD, c.fluffL, 0.14, 0.14);
    }
    if (c.spots) {
      // brown back with two pairs of yellow spots (and on the wing nubs), yellow belly + breast
      const spot = (side >= 1 && side <= 2 && (z === -2 || z === 1 - 0) && y >= topY - 1);
      if (y >= topY - 1 && z < 2 && !spot) return tone(x, y, z, c.cap, c.capD, c.capL, 0.15, 0.12);
      if (z <= -3 && y >= 1) return tone(x, y, z, c.cap, c.capD, c.capL, 0.15, 0.1);
    }
    return tone(x, y, z, c.fluff, c.fluffD, c.fluffL, 0.14, 0.14);
  };
  ell(v, cx, cy, cz, rx, ry, rz, col);
  fluffy(v, col);
  // tail tuft, tipped up
  const tz = k.tail;
  for (let x = -1; x <= 0; x++) { v.set(x, topY - 1, tz, col(x, topY + 1, tz - 3)); v.set(x, topY - 1, tz - 1, col(x, topY + 1, tz - 3)); }
  v.set(-1, topY, tz - 1, col(0, topY + 1, tz - 3));
  return v;
}
function headModel(k, c) {
  const v = new VoxelModel();
  const [cx, cy, cz, rx, ry, rz] = k.head;
  const [ey, ez] = k.eye;
  const top = Math.floor(cy + ry - 0.5);
  for (let y = 0; y < k.neck; y++) for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) if (!(abs(x + 0.5) > 1 && abs(z + 0.5) > 1)) v.set(x, y, z, tone(x, y, z, c.fluff, c.fluffD, c.fluffL, 0.14, 0.1));
  const col = (x, y, z) => {
    const side = abs(x + 0.5);
    if (c.stripe) {
      if (side >= 1.5 && y === ey && z <= ez - 1 && z >= -1) return c.capD; // eye-stripe behind the eye
      if (side >= 1.5 && y === ey && z >= ez + 1) return c.capD; // and in front of it, to the bill
      if ((y >= top && z <= 1) || (y >= top - 1 && z <= -1 && side < 2) || (z <= -2 && y >= ey)) return tone(x, y, z, c.cap, c.capD, c.capL, 0.15, 0.1); // cap + nape
    }
    if (c.face) {
      if (y >= top - 1 && z <= 1) return tone(x, y, z, c.cap, c.capD, c.capL, 0.12, 0.1);
      if (z >= 1 || y <= ey - 1) return tone(x, y, z, c.face, c.fluff, c.fluffL, 0.1, 0.1);
    }
    return tone(x, y, z, c.fluff, c.fluffD, c.fluffL, 0.12, 0.14);
  };
  ell(v, cx, cy, cz, rx, ry, rz, col);
  // a little cowlick of fuzz on top
  const tuft = c.stripe ? c.capL : c.face ? c.capL : c.fluffL;
  v.set(-1, top + 1, 0, tuft); v.set(0, top + 1, -1, tuft);
  return v;
}
function billModel(k, c, lower) {
  const v = new VoxelModel();
  const w = k.billW, L = k.billL;
  if (lower) { for (let x = -w; x <= w - 1; x++) for (let z = 0; z < L; z++) v.set(x, 0, z, c.billD); return v; }
  for (let x = -w; x <= w - 1; x++) for (let z = 0; z < L; z++) v.set(x, 0, z, z === L - 1 && L > 2 ? c.nail : c.bill);
  return v;
}
function wingModel(k, c) {
  const v = new VoxelModel();
  for (let y = -k.wingH + 1; y <= 0; y++)
    for (let z = -k.wingL + 1; z <= 0; z++) {
      if (y === -k.wingH + 1 && z === -k.wingL + 1) continue;
      v.set(0, y, z, c.spots && y === 0 ? c.cap : tone(0, y, z, c.fluff, c.fluffD, c.fluffL, 0.2, 0.1));
    }
  if (c.spots) v.set(0, -1, -1, c.fluffL);
  if (c.face) for (let z = -k.wingL + 1; z <= 0; z++) v.set(0, 0, z, c.cap);
  return v;
}
function legModel(k, c) {
  const v = new VoxelModel();
  for (let y = 0; y < k.shank; y++) v.set(0, -y, 0, c.foot);
  const fy = -k.shank;
  for (let x = -1; x <= 1; x++) for (let z = 0; z <= 1; z++) v.set(x, fy, z, z === 1 && x !== 0 ? c.footD : c.foot);
  if (k === KIND.gosling) { v.set(-1, fy, 2, c.footD); v.set(1, fy, 2, c.footD); v.set(0, fy, 2, c.foot); }
  return v;
}
const caches = {};
function cacheFor(kind, breed) {
  const key = kind + ':' + breed;
  if (caches[key]) return caches[key];
  const k = KIND[kind], c = PAL[key];
  caches[key] = geoCache(() => {
    const b = (m, p = [0, 0, 0]) => buildGeo(m, p, FV);
    const head = headModel(k, c);
    // eyes sit on the front corner of the face at the eye row: visible from the front and the side
    const ey = k.eye[0];
    let xL = -99, xR = 99;
    for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) if (head.has(x, ey, z)) { xL = max(xL, x); xR = min(xR, x); }
    let zF = -99;
    for (let z = -8; z <= 8; z++) if (head.has(xL, ey, z)) zF = max(zF, z);
    const eye = new VoxelModel(); eye.set(0, 0, 0, 0x14101a);
    const G = {
      body: b(bodyModel(k, c)), head: b(head), billU: b(billModel(k, c, false)), billL: b(billModel(k, c, true)),
      wingL: b(wingModel(k, c)), wingR: b(mirrorX(wingModel(k, c))), leg: b(legModel(k, c)),
      eye: b(eye, [0.5, 0.5, 0.5]),
    };
    G.eyeCell = { dispose() {}, xL, xR, y: ey, z: zF };
    return G;
  });
  return caches[key];
}

const EXPRS = { neutral: { eye: 'dot' }, happy: { eye: 'happy' }, sleepy: { eye: 'shut' }, panic: { eye: 'wide' } };

export class Chick extends CritterRig {
  constructor({ kind = 'duckling', breed, shadows = true, fx = true } = {}) {
    kind = kind === 'gosling' ? 'gosling' : 'duckling';
    const breeds = CHICK_BREEDS[kind];
    breed = breeds.includes(breed) ? breed : breeds[0];
    super(`Chick_${kind}_${breed}`, { shadows });
    this.kind = kind;
    this.breed = breed;
    const k = (this._k = KIND[kind]);
    const cache = (this._geoCache = cacheFor(kind, breed));
    const G = cache.get();
    this.joint('mover', this.root);
    this.joint('body', this.mover, 0, k.bodyY * F, 0);
    this.mesh(G.body, this.body);
    this.joint('head', this.body, 0, k.headJ[1] * F, k.headJ[2] * F);
    this.mesh(G.head, this.head);
    this.joint('bill', this.head, 0, k.bill[1] * F, k.bill[2] * F);
    this.mesh(G.billU, this.bill);
    this.joint('jaw', this.head, 0, k.bill[1] * F, k.bill[2] * F);
    this.mesh(G.billL, this.jaw, { y: -FV * 0.9 });
    this.eyes = {};
    for (const s of [1, -1]) {
      const n = s > 0 ? 'L' : 'R';
      const E = G.eyeCell, cx = ((s > 0 ? E.xL : E.xR) + 0.5) * FV, cy = (E.y + 0.5) * FV, cz = (E.z + 0.5) * FV;
      const eg = {};
      // one shared black voxel, shaped per expression: [scaleY, offsetY] (voxels)
      for (const [e, sy, oy] of [['dot', 0.94, 0], ['wide', 1.5, 0.2], ['shut', 0.32, -0.22], ['happy', 0.32, 0.18]]) {
        const m = (eg[e] = this.mesh(G.eye, this.head));
        m.scale.set(1.1, sy, 1.1);
        m.position.set(cx + s * 0.05 * FV, cy + oy * FV, cz + 0.05 * FV);
        m.castShadow = false;
      }
      this.eyes[n] = eg;
      const w = this.joint('wing' + n, this.body, s * k.wingJ[0] * F, k.wingJ[1] * F, k.wingJ[2] * F);
      this.mesh(s > 0 ? G.wingL : G.wingR, w);
      const l = this.joint('leg' + n, this.body, s * k.legX * F, 0, 0.6 * F);
      this.mesh(G.leg, l, { x: -FV * 0.5, y: -FV * 0.5 - (kind === 'gosling' ? 0 : 0) });
    }
    this.fx = fx;
    if (fx) {
      this.zzz = [0, 1].map(() => this.sprite(ZZZ_ROWS, 0.03, this.root));
      this.hearts = [this.sprite(HEART_ROWS, 0.04, this.root)];
    }
    this.scalar('zzz', 0);
    this.scalar('hearts', 0);
    this.jiggle('head', 'rx', { k: 240, c: 10, az: 0.03, ay: -0.02, max: 0.45, probe: 'body' });
    this.jiggle('head', 'rz', { k: 220, c: 9, ax: 0.03, max: 0.3, probe: 'body' });
    this.jiggle('body', 's', { k: 300, c: 11, ay: 0.006, max: 0.12, probe: 'mover' });
    this.jiggle('wingL', 'rz', { k: 260, c: 10, ay: -0.02, max: 0.5, probe: 'body' });
    this.jiggle('wingR', 'rz', { k: 260, c: 10, ay: 0.02, max: 0.5, probe: 'body' });
    this._init(ANIMS, EXPRS, 'idle');
    this.anims = keyed(this.anims);
  }
  _updateFace(dt, f, def) {
    const ex = this._EXPRS[this._userExpr || f.expr || def.expr || 'neutral'] || EXPRS.neutral;
    this._blinkT -= dt;
    if (this._blinkT < -0.1) this._blinkT = 1.2 + hash3(Math.floor(this.time * 10), 7, 2) * 2.5;
    let e = (this._userExpr && ex.eye !== 'dot' ? ex.eye : f.eyes) || ex.eye;
    if (e === 'dot' && this._blinkT < 0) e = 'shut';
    for (const n of ['L', 'R']) for (const q in this.eyes[n]) this.eyes[n][q].visible = q === e;
  }
  _post() { if (this.fx) birdFx(this, this.kind === 'gosling' ? 0.24 : 0.17, 0.0); }
}

// ------------------------------------------------------------------ animations
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };
function rest(p) { p.wingL.rz = 0.05; p.wingR.rz = -0.05; }
function steps(s, ph, rig) {
  const k = Math.floor(ph / PI + 0.5);
  if (s.step !== undefined && k !== s.step) rig._emit('step');
  s.step = k;
}
function legs(p, ph, amp) {
  const sn = sin(ph);
  p.legL.rx = -sn * amp; p.legR.rx = sn * amp;
  p.legL.y = max(0, cos(ph)) * 0.35; p.legR.y = max(0, -cos(ph)) * 0.35;
}
function peep(p, q) { p.jaw.rx = q * 0.7; p.bill.rx = -q * 0.15; p.head.rx -= q * 0.3; }

def('idle', {
  loop: true, dur: 6,
  fn(t, p, f, s, rig) {
    rest(p);
    const T = 6, u = t % T;
    p.body.s = 1 + sin(t * 3) * 0.025;
    // curious head tilts and looks
    p.head.ry = K(u, [[0, 0], [0.8, 0], [1.0, 0.6], [1.9, 0.6], [2.1, -0.5], [3.1, -0.5], [3.3, 0], [T, 0]]);
    p.head.rz = K(u, [[0, 0], [1.0, 0], [1.2, 0.35], [1.8, 0.35], [2.0, 0], [2.2, -0.3], [3.0, -0.3], [3.2, 0], [T, 0]]);
    p.head.rx = sin(t * 1.7) * 0.05;
    // a little wing-nub flutter and a bounce
    const fl = win(u, 4.2, 4.8, 0.08, 0.1);
    p.wingL.rz += fl * (0.6 + sin(t * 40) * 0.4); p.wingR.rz -= fl * (0.6 + sin(t * 40) * 0.4);
    p.mover.y = pulse(u, 4.3, 0.3) * 0.5;
  },
});

function trot(t, p, f, s, rig, T, bounce, headUp) {
  const ph = (t / T) * TAU, sn = sin(ph), cs = cos(ph);
  rest(p);
  legs(p, ph, 0.75);
  p.mover.y = abs(cs) * bounce;
  p.mover.rz = sn * 0.16; p.mover.ry = sn * 0.08;
  p.body.rx = 0.06 - headUp * 0.1; p.body.s = 1 + abs(cs) * 0.04;
  p.head.rx = -headUp * 0.15 + abs(sn) * 0.06; p.head.rz = -sn * 0.12; p.head.z = abs(sn) * 0.1;
  p.wingL.rz += 0.2 + abs(sn) * 0.25; p.wingR.rz -= 0.2 + abs(sn) * 0.25;
  steps(s, ph, rig);
}
def('waddle', {
  loop: true,
  fn(t, p, f, s, rig) { trot(t, p, f, s, rig, 0.26, 0.35, 0); },
});

def('follow', {
  loop: true,
  fn(t, p, f, s, rig) {
    // keeping up with mum: head up, a bouncier trot, the odd peep
    trot(t, p, f, s, rig, 0.3, 0.45, 1);
    const T = 1.5, u = t % T;
    const q = pulse(u, 0.1, 0.22);
    peep(p, q);
    p.head.ry = sin(t * 0.9) * 0.15;
    if (beat(s, 'pp', t, T, 0.14)) rig._emit('peep');
  },
});

def('swim', {
  loop: true,
  fn(t, p, f, s, rig) {
    // root = water surface: bobbing like a cork, paddling fast
    const ph = (t / 0.32) * TAU, sn = sin(ph);
    rest(p);
    const k = rig._k;
    p.mover.y = -(k.bodyY + 0.9) * F + sin(t * 3) * 0.12;
    p.mover.rx = sin(t * 3 + 1) * 0.05; p.mover.rz = sin(t * 2.2) * 0.06;
    p.legL.rx = 0.8 + sn * 0.7; p.legR.rx = 0.8 - sn * 0.7;
    p.head.ry = sin(t * 0.8) * 0.4; p.head.rz = sin(t * 1.3) * 0.1;
    p.wingL.rz += 0.1; p.wingR.rz -= 0.1;
    if (beat(s, 'pd', t, 0.32, 0)) rig._emit('paddle');
  },
});

def('peck', {
  loop: true, dur: 0.9,
  fn(t, p, f, s, rig) {
    // quick little double pecks at the ground
    const T = 0.9, u = t % T;
    rest(p);
    const d = K(u, [[0, 0], [0.18, 0], [0.26, 1, 'in'], [0.34, 0.5], [0.42, 1, 'in'], [0.6, 0, 'out'], [T, 0]]);
    p.body.rx = 0.45 * d; p.head.rx = 0.7 * d; p.head.z = 0.3 * d;
    p.legL.rx = p.legR.rx = -0.35 * d;
    p.wingL.rz += 0.15 * d; p.wingR.rz -= 0.15 * d;
    p.head.ry = K(u, [[0, 0], [0.1, 0.3], [0.2, 0], [0.7, 0], [0.8, -0.3], [T, 0]]);
    p.jaw.rx = pulse(u, 0.26, 0.06) * 0.5 + pulse(u, 0.42, 0.06) * 0.4;
    if (beat(s, 'p1', t, T, 0.26) || beat(s, 'p2', t, T, 0.42)) rig._emit('peck');
  },
});

def('eat', {
  dur: 1.0, next: 'idle',
  fn(t, p, f, s, rig) {
    const T = 1.0, u = t % T;
    rest(p);
    const d = K(u, [[0, 0], [0.14, 0.2], [0.26, 1, 'in'], [0.36, 0.9], [0.46, 0, 'out'], [T, 0]]);
    const up = K(u, [[0, 0], [0.4, 0], [0.52, 1, 'out'], [0.8, 1], [0.96, 0], [T, 0]]);
    p.body.rx = 0.45 * d - 0.1 * up; p.head.rx = 0.7 * d - 0.5 * up; p.head.z = 0.3 * d; p.head.y = 0.2 * up;
    p.head.rz = K(u, [[0, 0], [0.1, 0.35], [0.22, 0], [T, 0]]);
    p.legL.rx = p.legR.rx = -0.35 * d;
    p.jaw.rx = pulse(u, 0.26, 0.08) * 0.6 + pulse(u, 0.56, 0.07) * 0.5 + pulse(u, 0.68, 0.07) * 0.4;
    p.head.s = 1 + pulse(u, 0.62, 0.18) * 0.1;
    p.wingL.rz += 0.3 * up; p.wingR.rz -= 0.3 * up;
    p.mover.y = pulse(u, 0.78, 0.2) * 0.4; // a happy little bounce
    if (beat(s, 'pk', t, T, 0.26)) rig._emit('peck');
    if (beat(s, 'g', t, T, 0.62)) rig._emit('gulp');
  },
});

def('sleep', {
  loop: true, expr: 'sleepy',
  fn(t, p, f, s, rig) {
    // flopped on the belly, feet tucked, the big head nodding slowly forward
    rest(p);
    const k = rig._k, br = sin(t * 1.6);
    p.mover.y = -(k.bodyY + 0.2) * F;
    p.legL.rx = p.legR.rx = 1.5; p.legL.y = p.legR.y = (k.shank + 0.5) * F;
    p.body.s = 1 + br * 0.04; p.body.rx = 0.04;
    // chin sinks onto the fluffy breast, then bobs back up a little
    const nod = smooth(0.5 + 0.5 * sin(t * 0.7));
    p.head.rx = 0.18 + nod * 0.2; p.head.z = -0.1 + nod * 0.1; p.head.y = -1.0 * F - nod * 0.25;
    p.head.rz = 0.1 + sin(t * 0.35) * 0.05;
    p.wingL.rz = -0.02; p.wingR.rz = 0.02;
    p.k.zzz = 1;
    f.eyes = 'shut';
  },
});

def('peep', {
  loop: true, dur: 0.9, expr: 'happy',
  fn(t, p, f, s, rig) {
    // a little hop with the beak wide open: peep!
    const T = 0.9, u = t % T;
    rest(p);
    const hop = K(u, [[0, 0], [0.08, -0.25], [0.24, 0.9, 'out'], [0.4, 0, 'in'], [0.46, -0.15], [0.56, 0], [T, 0]]);
    p.mover.y = hop;
    p.body.s = 1 - min(0, hop) * 0.3 + max(0, hop) * 0.05;
    const q = pulse(u, 0.12, 0.3);
    peep(p, q);
    p.head.rx -= 0.1 * q;
    const air = max(0, hop) / 0.9;
    p.wingL.rz += air * (0.9 + sin(t * 45) * 0.3); p.wingR.rz -= air * (0.9 + sin(t * 45) * 0.3);
    p.legL.rx = p.legR.rx = 0.2 * air;
    f.eyes = q > 0.2 ? 'happy' : 'dot';
    if (beat(s, 'pp', t, T, 0.14)) rig._emit('peep');
    if (beat(s, 'land', t, T, 0.4)) rig._emit('step');
  },
});

ANIMS.honk = ANIMS.quack = ANIMS.peep; // any 'call' works on every bird

def('happy', {
  dur: 1.3, next: 'idle', expr: 'happy',
  fn(t, p, f, s, rig) {
    // two bouncy hops with the wing nubs going like mad, peeping
    const T = 1.3, u = t % T;
    rest(p);
    const hop = K(u, [[0, 0], [0.1, -0.3], [0.3, 1.1, 'out'], [0.48, 0, 'in'], [0.54, -0.25], [0.74, 0.9, 'out'], [0.92, 0, 'in'], [1.0, -0.15], [1.1, 0], [T, 0]]);
    const air = max(0, hop) / 1.1;
    p.mover.y = hop;
    p.body.s = 1 - min(0, hop) * 0.3 + air * 0.06;
    const fl = sin(t * 46) * win(u, 0.15, 0.95, 0.05, 0.1);
    p.wingL.rz += 0.5 + fl * 0.5 + air * 0.4; p.wingR.rz -= 0.5 + fl * 0.5 + air * 0.4;
    peep(p, pulse(u, 0.2, 0.22) + pulse(u, 0.66, 0.2));
    p.head.rz = sin(t * 9) * 0.12;
    p.legL.rx = p.legR.rx = 0.25 * air;
    p.k.hearts = u / T;
    f.eyes = 'happy';
    if (beat(s, 'p1', t, T, 0.22) || beat(s, 'p2', t, T, 0.68)) rig._emit('peep');
    if (beat(s, 'l1', t, T, 0.48) || beat(s, 'l2', t, T, 0.92)) rig._emit('step');
  },
});

export { ANIMS as CHICK_ANIMS };
