// Duck: a small, cheap mallard (drake: green head; hen: brown speckles).
// Fine 0.025 voxels, shared geometry per sex, no canvases: the eyes are tiny
// voxel meshes swapped for expressions.
//
//   const d = new Duck({ sex: 'm' | 'f' });  scene.add(d.root);
//   d.play('waddle');  d.update(dt);   // events: 'step', 'quack', 'peck', 'flap', 'paddle'
//
// Root at the feet (or the water surface for 'swim'), facing +Z. ~0.35 tall.
import {
  VS, FV, VoxelModel, ell, tone, hash3, buildGeo, geoCache, mirrorX, CritterRig, K, pulse, beat,
  sin, cos, abs, max, min, PI, TAU, smooth,
} from './critterKit.js';

const F = FV / VS; // joint offsets are in 0.05 units; duck parts are drawn in fine voxels

const PAL = {
  m: {
    head: 0x2e8a4a, headD: 0x1f6a3a, headL: 0x4cb46a, collar: 0xf4f4ec, breast: 0x8a4632, breastD: 0x6e3424,
    body: 0xc4c0b8, bodyD: 0xa8a49c, bodyL: 0xdcd8d0, back: 0x8a7e72, backD: 0x6e6458, tail: 0x26262e, tailW: 0xeeeee6,
    bill: 0xf2d040, billD: 0xc8a42a, nail: 0x3a3a2a, wing: 0x9a9088, wingD: 0x7e766e, spec: 0x3a5ad8, specW: 0xf4f4ec,
    foot: 0xf28a2a, footD: 0xd06a1a,
  },
  f: {
    head: 0x9a7048, headD: 0x6a4a2c, headL: 0xb88a5c, collar: 0x9a7048, breast: 0xa8784a, breastD: 0x6a4626,
    body: 0xa8784a, bodyD: 0x6a4626, bodyL: 0xc89a68, back: 0x8a6038, backD: 0x5a3a20, tail: 0x8a6038, tailW: 0xc8a070,
    bill: 0xe8903a, billD: 0x6a4a2a, nail: 0x3a2a1a, wing: 0x8a6038, wingD: 0x5a3a20, spec: 0x3a5ad8, specW: 0xf4f4ec,
    foot: 0xf28a2a, footD: 0xd06a1a, stripe: 0x4a3018,
  },
};

// body: pivot at the hip centre (fine voxels). Belly y -3.., length z -7..6
function bodyModel(c, hen) {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    if (hen) {
      const h = hash3(x, y, z);
      const base = z > 3 && y < 3 ? c.breast : c.body;
      return h < 0.22 ? c.bodyD : h > 0.86 ? c.bodyL : base;
    }
    if (z >= 3 && y <= 4) return tone(x, y, z, c.breast, c.breastD, c.breast, 0.15, 0);
    if (y >= 3 && z < 3) return tone(x, y, z, c.back, c.backD, c.back);
    return tone(x, y, z, c.body, c.bodyD, c.bodyL);
  };
  ell(v, 0, 1.5, 0, 4.6, 3.6, 6.4, col);
  ell(v, 0, 2.2, 3.4, 3.6, 3.2, 3.4, col);
  // tail, tipped up
  for (let z = -9; z <= -6; z++) {
    const d = -6 - z;
    for (let x = -2 + (d > 2 ? 1 : 0); x <= 1 - (d > 2 ? 1 : 0); x++)
      for (let y = 2 + d; y <= 3 + d; y++) v.set(x, y, z, hen ? (hash3(x, y, z) < 0.3 ? c.bodyD : c.tail) : y === 2 + d && d < 2 ? c.tailW : c.tail);
  }
  if (!hen) { v.set(-1, 6, -7, c.tail); v.set(0, 6, -7, c.tail); v.set(0, 7, -6, c.tail); } // drake curl
  return v;
}
function headModel(c, hen) {
  const v = new VoxelModel();
  // neck (pivot at the neck base), head ball, collar ring
  for (let y = 0; y <= 3; y++) for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) v.set(x, y, z, y === 1 && !hen ? c.collar : y < 1 ? c.breast : c.head);
  ell(v, 0, 5, 0.4, 3.1, 3.0, 3.3, (x, y, z) => {
    if (hen && y === 5 && abs(x + 0.5) > 1.5) return c.stripe;
    return tone(x, y, z, c.head, c.headD, c.headL, 0.12, hen ? 0.08 : 0.2);
  });
  return v;
}
function billModel(c, lower) {
  const v = new VoxelModel();
  if (lower) {
    for (let x = -1; x <= 0; x++) for (let z = 0; z <= 3; z++) v.set(x, 0, z, c.billD);
    return v;
  }
  for (let x = -2; x <= 1; x++)
    for (let z = 0; z <= 3; z++) {
      if (z === 3 && (x === -2 || x === 1)) continue;
      v.set(x, 0, z, c.bill);
      if (z <= 1 && x >= -1 && x <= 0) v.set(x, 1, z, c.bill);
    }
  v.set(-1, 0, 4, c.nail); v.set(0, 0, 4, c.nail);
  if (c.stripe) { v.set(-1, 1, 1, c.billD); v.set(0, 1, 1, c.billD); }
  return v;
}
// wing (left side): flat, pivot at the shoulder, trailing back (-z)
function wingModel(c) {
  const v = new VoxelModel();
  for (let y = -4; y <= 0; y++)
    for (let z = -9; z <= 1; z++) {
      const r = ((y + 2) / 2.8) ** 2 + ((z + 4) / 5.6) ** 2;
      if (r > 1) continue;
      let col = tone(0, y, z, c.wing, c.wingD, c.wing, 0.2, 0);
      if (y === -3 && z >= -6 && z <= -2) col = c.spec;
      if (y === -3 && (z === -7 || z === -1)) col = c.specW;
      if (y <= -4 || z <= -8) col = c.wingD;
      v.set(0, y, z, col);
      if (r < 0.5) v.set(-1, y, z, c.wingD);
    }
  return v;
}
function legModel(c) {
  const v = new VoxelModel();
  for (let y = -3; y <= 0; y++) v.set(0, y, 0, c.foot);
  for (let x = -1; x <= 1; x++) for (let z = 0; z <= 2; z++) if (!(z === 2 && x === 0)) v.set(x, -4, z, z === 2 ? c.footD : c.foot);
  v.set(0, -4, -1, c.foot);
  return v;
}
function eyeModel(kind) {
  const v = new VoxelModel();
  if (kind === 'dot') v.set(0, 0, 0, 0x14101a);
  else if (kind === 'wide') { v.set(0, 0, 0, 0xffffff); v.set(0, 1, 0, 0xffffff); v.set(0, 0, 1, 0xffffff); v.set(0, 1, 1, 0x14101a); }
  else { v.set(0, 0, 0, 0x14101a); v.set(0, 0, 1, 0x14101a); } // closed: a little line
  return v;
}

const caches = {};
function cacheFor(sex) {
  if (caches[sex]) return caches[sex];
  const c = PAL[sex], hen = sex === 'f';
  caches[sex] = geoCache(() => {
    const b = (m, p = [0, 0, 0]) => buildGeo(m, p, FV);
    return {
      body: b(bodyModel(c, hen)), head: b(headModel(c, hen)),
      billU: b(billModel(c, false), [0.0, 0, 0]), billL: b(billModel(c, true)),
      wingL: b(wingModel(c)), wingR: b(mirrorX(wingModel(c))),
      leg: b(legModel(c), [0, 0, 0]),
      eyeDot: b(eyeModel('dot'), [0, 0, 0]), eyeWide: b(eyeModel('wide'), [0, 0.5, 0.5]), eyeShut: b(eyeModel('shut'), [0, 0, 0.5]),
    };
  });
  return caches[sex];
}

const EXPRS = { neutral: { eye: 'dot' }, panic: { eye: 'wide' }, sleepy: { eye: 'shut' }, happy: { eye: 'shut' } };

export class Duck extends CritterRig {
  constructor({ sex = 'm', shadows = true } = {}) {
    super(sex === 'f' ? 'DuckHen' : 'DuckDrake', { shadows });
    this.sex = sex;
    const cache = (this._geoCache = cacheFor(sex));
    const G = cache.get();
    this.joint('mover', this.root);
    this.joint('body', this.mover, 0, 5 * F, 0);
    this.mesh(G.body, this.body);
    this.joint('head', this.body, 0, 2.5 * F, 4.2 * F);
    this.mesh(G.head, this.head);
    this.joint('bill', this.head, 0, 4.2 * F, 3.4 * F);
    this.mesh(G.billU, this.bill);
    this.joint('jaw', this.head, 0, 4.2 * F, 3.4 * F);
    this.mesh(G.billL, this.jaw, { y: -FV * 0.9 });
    this.eyes = {};
    for (const s of [1, -1]) {
      const n = s > 0 ? 'L' : 'R';
      const x = s > 0 ? 3 : -4;
      const eg = { dot: this.mesh(G.eyeDot, this.head), wide: this.mesh(G.eyeWide, this.head), shut: this.mesh(G.eyeShut, this.head) };
      for (const k in eg) { eg[k].position.set(x * FV + (s > 0 ? 0.0006 : -0.0006), 5.4 * FV, 1.6 * FV); eg[k].castShadow = false; }
      this.eyes[n] = eg;
      const w = this.joint('wing' + n, this.body, s * 4.1 * F, 3.6 * F, 1 * F);
      this.mesh(s > 0 ? G.wingL : G.wingR, w, { x: s > 0 ? 0 : 0 });
      const l = this.joint('leg' + n, this.body, s * 1.6 * F, -1.0 * F, 0.5 * F);
      this.mesh(G.leg, l, { x: -FV * 0.5 + 0 });
    }
    this.jiggle('head', 'rx', { k: 200, c: 10, az: 0.02, ay: -0.012, max: 0.4, probe: 'body' });
    this.jiggle('body', 's', { k: 280, c: 12, ay: 0.004, max: 0.1, probe: 'mover' });
    this.jiggle('wingL', 'rz', { k: 220, c: 12, ay: -0.01, max: 0.3, probe: 'body' });
    this.jiggle('wingR', 'rz', { k: 220, c: 12, ay: 0.01, max: 0.3, probe: 'body' });
    this._init(ANIMS, EXPRS, 'idle');
  }
  _updateFace(dt, f, def) {
    const ex = this._EXPRS[this._userExpr || f.expr || def.expr || 'neutral'] || EXPRS.neutral;
    this._blinkT -= dt;
    if (this._blinkT < -0.12) this._blinkT = 1.5 + hash3(floor10(this.time), 1, 2) * 3;
    let e = f.eyes || ex.eye;
    if (e === 'dot' && this._blinkT < 0) e = 'shut';
    for (const n of ['L', 'R']) for (const k in this.eyes[n]) this.eyes[n][k].visible = k === e;
  }
}
const floor10 = (t) => Math.floor(t * 10);

// ------------------------------------------------------------------ animations
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };
function rest(p) { p.wingL.rz = -0.05; p.wingR.rz = 0.05; }
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

def('idle', {
  loop: true,
  fn(t, p, f, s, rig) {
    rest(p);
    const br = sin(t * 2);
    p.body.s = 1 + br * 0.02; p.body.rx = -0.05;
    p.head.ry = K(t % 5, [[0, 0], [1.5, 0], [1.7, 0.6], [2.8, 0.6], [3.0, -0.4], [4.2, -0.4], [4.4, 0]]);
    p.head.rx = sin(t * 1.3) * 0.06;
    const sh = pulse(t % 7, 5.5, 0.4); // little feather ruffle
    p.mover.rz = sin(t * 40) * 0.06 * sh; p.wingL.rz -= sh * 0.25; p.wingR.rz += sh * 0.25;
  },
});

def('waddle', {
  loop: true,
  fn(t, p, f, s, rig) {
    const ph = (t / 0.46) * TAU, sn = sin(ph), cs = cos(ph);
    legs(p, ph, 0.6);
    rest(p);
    p.mover.rz = sn * 0.16; p.mover.ry = sn * 0.08;
    p.mover.y = abs(cs) * 0.25;
    p.body.rx = -0.08;
    p.head.z = abs(sn) * 0.15; p.head.rx = 0.08 - abs(cs) * 0.08; p.head.rz = -sn * 0.1;
    p.wingL.rz -= abs(sn) * 0.1; p.wingR.rz += abs(sn) * 0.1;
    steps(s, ph, rig);
  },
});

def('peck', {
  loop: true,
  fn(t, p, f, s, rig) {
    const T = 1.2, u = t % T;
    rest(p);
    const dip = K(u, [[0, 0], [0.3, 0], [0.42, 1, 'in'], [0.5, 0.85], [0.58, 1, 'in'], [0.75, 0, 'out'], [T, 0]]);
    p.body.rx = 0.55 * dip; p.head.rx = 0.95 * dip; p.head.z = dip * 0.4;
    p.body.y = -dip * 0.1; p.mover.z = 0;
    p.legL.rx = -0.4 * dip; p.legR.rx = -0.4 * dip;
    p.mover.y = 0;
    p.head.ry = K(u, [[0, 0], [0.15, 0.4], [0.28, 0], [0.8, 0], [1.0, -0.35], [T, 0]]);
    p.jaw.rx = pulse(u, 0.44, 0.08) * 0.5 + pulse(u, 0.6, 0.08) * 0.4;
    if (beat(s, 'pk', t, T, 0.42) || beat(s, 'pk2', t, T, 0.58)) rig._emit('peck');
  },
});

def('quack', {
  loop: true,
  fn(t, p, f, s, rig) {
    const T = 0.9, u = t % T;
    rest(p);
    const q = pulse(u, 0.1, 0.26);
    p.head.rx = -0.35 * q; p.head.z = q * 0.35; p.head.y = q * 0.2;
    p.jaw.rx = q * 0.75; p.bill.rx = -q * 0.18;
    p.body.rx = -0.12 * q; p.body.s = 1 + q * 0.08;
    p.mover.y = q * 0.3;
    p.wingL.rz -= q * 0.35; p.wingR.rz += q * 0.35;
    p.mover.rz = sin(t * 3) * 0.03;
    if (beat(s, 'q', t, T, 0.12)) rig._emit('quack');
  },
});

def('flap', {
  loop: true,
  fn(t, p, f, s, rig) {
    const fl = sin(t * 26);
    p.wingL.rz = -1.1 - fl * 0.8; p.wingR.rz = 1.1 + fl * 0.8;
    p.wingL.rx = p.wingR.rx = -0.4;
    p.body.rx = -0.5; p.head.rx = 0.4; p.head.z = -0.1;
    p.mover.y = 0.3 + abs(sin(t * 6)) * 1.0;
    p.legL.rx = p.legR.rx = 0.4;
    p.jaw.rx = 0.3 + sin(t * 9) * 0.15;
    f.eyes = 'dot';
    if (beat(s, 'fl', t, TAU / 26, 0)) rig._emit('flap');
  },
});

def('swim', {
  loop: true,
  fn(t, p, f, s, rig) {
    // root = water surface: the body floats a little submerged
    const ph = (t / 0.7) * TAU, sn = sin(ph);
    rest(p);
    p.mover.y = -2.2 * F + sin(t * 2.2) * 0.12;
    p.mover.rx = sin(t * 2.2 + 1) * 0.04; p.mover.rz = sin(t * 1.4) * 0.05;
    p.body.rx = -0.05;
    p.legL.rx = 0.7 + sn * 0.6; p.legR.rx = 0.7 - sn * 0.6;
    p.head.rx = 0.05 + sin(t * 2.2) * 0.04; p.head.ry = sin(t * 0.7) * 0.3;
    p.head.z = -0.05;
    if (beat(s, 'pd', t, 0.7, 0)) rig._emit('paddle');
  },
});

def('chase_flee', {
  loop: true,
  fn(t, p, f, s, rig) {
    const ph = (t / 0.22) * TAU, sn = sin(ph), cs = cos(ph);
    legs(p, ph, 1.1);
    const fl = sin(t * 30);
    p.wingL.rz = -0.9 - fl * 0.7; p.wingR.rz = 0.9 + fl * 0.7;
    p.mover.y = abs(cs) * 0.5;
    p.mover.rz = sn * 0.12; p.mover.ry = sin(t * 5) * 0.15;
    p.body.rx = 0.25; p.head.rx = -0.2; p.head.z = 0.4 + abs(sn) * 0.1;
    p.jaw.rx = 0.6 + sin(t * 14) * 0.2;
    f.eyes = 'wide';
    steps(s, ph, rig);
    if (beat(s, 'q', t, 0.5, 0)) rig._emit('quack');
  },
});

def('sit', {
  loop: true,
  fn(t, p, f, s, rig) {
    rest(p);
    const br = sin(t * 1.8);
    p.mover.y = -3.2 * F; p.body.s = 1 + br * 0.02;
    p.legL.rx = p.legR.rx = 1.4; p.legL.y = p.legR.y = 1.8 * F;
    p.head.y = -0.6 * F; p.head.z = -0.6 * F;
    p.head.ry = K(t % 6, [[0, 0], [2, 0], [2.3, 0.5], [3.5, 0.5], [3.8, 0]]);
    p.head.rx = 0.1;
    p.mover.rz = br * 0.02;
    if ((t % 9) > 6) f.eyes = 'shut';
  },
});

export { ANIMS as DUCK_ANIMS };
