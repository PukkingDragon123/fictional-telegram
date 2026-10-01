// Goose: a big, bossy voxel goose in two breeds.
//   canada  black neck + head with a white chinstrap, brown-grey barred body, pale breast, black tail
//   snow    all white with black wing tips and a pink bill (dark "grin patch") and pink feet
// Fine 0.025 voxels (same as the ducks), shared geometry per breed, no canvases.
// Long three-part neck (neck1, neck2, head) and two-part wings: the primaries unfold
// from the folded arm, so half-open (chase, hiss) and fully spread (flap) wings read right.
//
//   const g = new Goose({ sex: 'm' | 'f', breed: 'canada' | 'snow', fx: true });  scene.add(g.root);
//   g.play('chase');  g.update(dt);
//   loops:     idle waddle swim peck honk (= quack) flap sit brood sleep chase hiss
//   one-shots: eat happy (return to idle; pass { loop: true } to repeat them)
//   idle peck honk/quack flap hiss also play a single cycle with { loop: false } (then idle + onDone)
//   events:    'step', 'honk', 'hiss', 'peck', 'gulp', 'flap', 'paddle', 'turn_egg' (brood)
//   expressions: neutral angry panic sleepy happy
//
// Root at the feet (the water surface for 'swim'; the nest root for 'brood'), facing +Z.
// ~0.62 tall standing (gander 6% bigger than the goose), ~0.5 long.
import * as THREE from 'three';
import {
  VS, FV, VoxelModel, ell, tone, hash3, buildGeo, geoCache, mirrorX, CritterRig, K, pulse, beat, win,
  sin, cos, abs, max, min, PI, TAU, smooth, ZZZ_ROWS, HEART_ROWS,
} from './critterKit.js';
import { birdFx, keyed } from './critterDuck.js';

const F = FV / VS; // joint offsets are in 0.05 units; goose parts are drawn in fine voxels

export const GOOSE_BREEDS = ['canada', 'snow'];
const PAL = {
  canada: {
    neck: 0x2a282e, neckD: 0x1e1c22, neckL: 0x3a3840, chin: 0xf6f4ee,
    breast: 0xd8ccb6, breastD: 0xc4b69e, breastL: 0xe8dece, belly: 0xf2efe8,
    body: 0x988672, bodyD: 0x7c6a58, bodyL: 0xb8a690, back: 0x75624f, backD: 0x5e4e3e, backL: 0x988470,
    tail: 0x2a282e, rump: 0xf4f2ec,
    wing: 0x8a7764, wingD: 0x6a5a4a, wingL: 0xb09c84, sec: 0x5a4a3c, prim: 0x3a322c, primL: 0x4e443c,
    bill: 0x2a282e, billD: 0x1e1c22, nail: 0x161418, tongue: 0xd88a8a,
    foot: 0x34323a, footD: 0x24222a, thigh: 0x7c6a58, brow: 0x6a666e, eyePatch: 0x4a464e,
  },
  snow: {
    neck: 0xf8f8f4, neckD: 0xecece6, neckL: 0xffffff, chin: 0xf8f8f4, face: 0xf4ead8,
    breast: 0xfafaf6, breastD: 0xe8e8e2, breastL: 0xffffff, belly: 0xfafaf6,
    body: 0xf6f6f2, bodyD: 0xe4e4de, bodyL: 0xffffff, back: 0xf2f2ee, backD: 0xe0e0da, backL: 0xffffff,
    tail: 0xf2f2ee, rump: 0xffffff,
    wing: 0xf4f4f0, wingD: 0xe0e0da, wingL: 0xffffff, sec: 0xeaeae4, prim: 0x2a2a32, primL: 0x40404a, primB: 0xb8bcc4,
    bill: 0xf2949c, billD: 0x3a2a30, nail: 0xf8e0e0, tongue: 0xe07a8a,
    foot: 0xf08c8c, footD: 0xd06a70, thigh: 0xe4e4de, brow: 0x34343c,
  },
};

// body: pivot at the hip centre. Belly y -3.., z -10 (rump) .. 8 (breast)
function bodyModel(c, snow) {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    const h = hash3(x, y, z), side = abs(x + 0.5);
    if (z <= -6 && y <= 2) return tone(x, y, z, c.belly, c.breastD, c.belly, 0.06, 0); // white undertail
    if (y <= -2) return tone(x, y, z, c.belly, c.breastD, c.belly, 0.08, 0);
    if (z >= 4 && y <= 5) return tone(x, y, z, c.breast, c.breastD, c.breastL, 0.14, 0.12); // pale breast
    if (snow) return tone(x, y, z, c.body, c.bodyD, c.bodyL, 0.1, 0.12);
    if (y >= 5) return (z + y * 2 + 99) % 3 === 0 && h < 0.7 ? c.backL : tone(x, y, z, c.back, c.backD, c.back, 0.15, 0);
    // barred flanks: pale feather edges in staggered rows
    const bar = (z + (y & 1) * 2 + 99) % 4 === 0 && side > 3;
    return bar ? c.bodyL : tone(x, y, z, c.body, c.bodyD, c.body, 0.14, 0);
  };
  ell(v, 0, 2, -0.5, 6.2, 4.6, 9.0, col);
  ell(v, 0, 3, 4.5, 5.4, 4.4, 4.8, col);
  ell(v, 0, 3.6, -8, 3.6, 3.0, 3.4, col);
  return v;
}
// tail: pivot at the tail base on the rump; a short fan tipped up
function tailModel(c) {
  const v = new VoxelModel();
  for (let z = -5; z <= 0; z++) {
    const d = -z;
    const w = d <= 1 ? 3 : d <= 3 ? 2 : 1;
    for (let x = -w; x <= w - 1; x++) {
      const y = d >= 4 ? 1 : 0;
      const k = d === 0 ? c.rump : tone(x, y, z, c.tail, c.neckD, c.tail, 0.15, 0);
      v.set(x, y, z, k);
      if (d <= 2) v.set(x, y + 1, z, d === 0 ? c.rump : k);
    }
  }
  return v;
}
// neck segment: rounded 4x4 column, pivot at its base
function neckModel(c, n, top) {
  const v = new VoxelModel();
  for (let y = 0; y <= n; y++)
    for (let x = -2; x <= 1; x++)
      for (let z = -2; z <= 1; z++) {
        if (abs(x + 0.5) > 1 && abs(z + 0.5) > 1) continue;
        if (top && y === n && (abs(x + 0.5) > 1 || abs(z + 0.5) > 1)) continue;
        v.set(x, y, z, tone(x, y, z, c.neck, c.neckD, c.neckL, 0.12, 0.08));
      }
  return v;
}
// head: pivot at the top of the neck; bill at the front
const HEAD = { cy: 2.6, cz: 0.7, rx: 2.6, ry: 2.5, rz: 3.4, eyeY: 3, eyeZ: 2 };
function headModel(c, snow) {
  const v = new VoxelModel();
  ell(v, 0, HEAD.cy, HEAD.cz, HEAD.rx, HEAD.ry, HEAD.rz, (x, y, z) => {
    const side = abs(x + 0.5);
    if (!snow) {
      // the white chinstrap: cheeks below / behind the eye, joined under the chin
      if (side >= 1.5 && Math.hypot(y - HEAD.eyeY, z - HEAD.eyeZ) < 1.1 && y >= HEAD.eyeY) return c.eyePatch; // lifts the dark eye off the black head
      if ((side >= 1.5 && y <= 3 && z >= -2 && z <= 1 && !(y === 3 && z === 1)) || (y <= 1 && z >= -1 && z <= 2)) return c.chin;
      return tone(x, y, z, c.neck, c.neckD, c.neckL, 0.12, 0.12);
    }
    if (z >= 2 && y <= 2) return c.face; // a faint rusty wash on the face
    return tone(x, y, z, c.neck, c.neckD, c.neckL, 0.08, 0.1);
  });
  return v;
}
function billModel(c, snow, lower) {
  const v = new VoxelModel();
  if (lower) {
    for (let x = -1; x <= 0; x++) for (let z = 0; z <= 3; z++) v.set(x, 0, z, snow ? (z <= 2 ? c.billD : c.bill) : c.billD);
    v.set(-1, 1, 1, c.tongue); v.set(0, 1, 1, c.tongue); // tongue (hidden until the bill opens)
    return v;
  }
  for (let z = 0; z <= 4; z++) {
    const w = z <= 1 ? 2 : 1;
    for (let x = -w; x <= w - 1; x++) {
      v.set(x, 0, z, z === 4 ? c.nail : c.bill);
      if (z <= 2) v.set(x, 1, z, c.bill); // deep at the base (and it hides the tongue)
    }
  }
  if (snow) { v.set(-2, 0, 0, c.billD); v.set(1, 0, 0, c.billD); v.set(-2, 0, 1, c.billD); v.set(1, 0, 1, c.billD); } // grin patch
  return v;
}
// wing arm (left): flat, pivot at the shoulder, coverts + secondaries trailing back
function wingModel(c) {
  const v = new VoxelModel();
  for (let y = -5; y <= 0; y++)
    for (let z = -9; z <= 2; z++) {
      const r = ((y + 2.4) / 3.0) ** 2 + ((z + 3.2) / 6.0) ** 2;
      if (r > 1) continue;
      let k = tone(0, y, z, c.wing, c.wingD, c.wing, 0.15, 0);
      if ((y === -1 || y === -3) && (z & 1) === 0) k = c.wingL; // scalloped covert edges
      if (y <= -4 || z <= -7) k = c.sec;
      v.set(0, y, z, k);
    }
  return v;
}
// primaries (left): pivot at the wrist, folded back along -z over the tail; unfold with rx < 0
function primModel(c) {
  const v = new VoxelModel();
  for (let z = -10; z <= 0; z++) {
    const y0 = z <= -8 ? -1 : z <= -4 ? -2 : -3;
    for (let y = y0; y <= 0; y++) v.set(0, y, z, z <= -4 ? (hash3(y, z, 3) < 0.2 ? c.primL : c.prim) : c.primB || c.sec);
  }
  return v;
}
function legModel(c) {
  const v = new VoxelModel();
  for (let y = -1; y <= 0; y++) for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) v.set(x, y, z, c.thigh);
  for (let y = -5; y <= -2; y++) for (let x = -1; x <= 0; x++) v.set(x, y, 0, c.foot);
  // webbed foot: three toes fanning forward
  const web = [[0, -1, 0], [1, -2, 1], [2, -2, 1], [3, -2, 1]];
  for (const [z, x0, x1] of web) for (let x = x0; x <= x1; x++) v.set(x, -6, z, z === 3 && x > -2 && x < 1 && x !== -1 ? c.footD : c.foot);
  v.set(-1, -6, -1, c.foot);
  v.set(-3, -6, 3, c.footD); v.set(2, -6, 3, c.footD);
  return v;
}
function eyeModel(kind, c) {
  const v = new VoxelModel();
  const ink = 0x0c0a10;
  if (kind === 'dot') v.set(0, 0, 0, ink);
  else if (kind === 'wide') { v.set(0, 0, 0, 0xffffff); v.set(0, 1, 0, 0xffffff); v.set(0, 0, 1, 0xffffff); v.set(0, 1, 1, ink); }
  else if (kind === 'angry') { v.set(0, 0, 0, ink); v.set(0, 1, -1, c.brow); v.set(0, 1, 0, c.brow); v.set(0, 0, 1, c.brow); }
  else { v.set(0, 0, 0, ink); v.set(0, 0, 1, ink); }
  return v;
}

const caches = {};
function cacheFor(breed) {
  if (caches[breed]) return caches[breed];
  const c = PAL[breed], snow = breed === 'snow';
  caches[breed] = geoCache(() => {
    const b = (m, p = [0, 0, 0]) => buildGeo(m, p, FV);
    const head = headModel(c, snow);
    // eyes sit on the outermost head voxel of the eye row
    let ex = 0, exR = 0;
    for (let x = -6; x <= 6; x++) if (head.has(x, HEAD.eyeY, HEAD.eyeZ)) { ex = max(ex, x + 1); exR = min(exR, x - 1); }
    const G = {
      body: b(bodyModel(c, snow)), tail: b(tailModel(c)), neck1: b(neckModel(c, 5, false)), neck2: b(neckModel(c, 5, true)),
      head: b(head), billU: b(billModel(c, snow, false)), billL: b(billModel(c, snow, true)),
      wingL: b(wingModel(c)), wingR: b(mirrorX(wingModel(c))), primL: b(primModel(c)), primR: b(mirrorX(primModel(c))),
      leg: b(legModel(c)),
      eyeDot: b(eyeModel('dot', c)), eyeWide: b(eyeModel('wide', c), [0, 0.5, 0.5]), eyeShut: b(eyeModel('shut', c), [0, 0, 0.5]), eyeAngry: b(eyeModel('angry', c)),
    };
    G.eyeX = { dispose() {}, L: ex, R: exR };
    return G;
  });
  return caches[breed];
}

const EXPRS = { neutral: { eye: 'dot' }, angry: { eye: 'angry' }, panic: { eye: 'wide' }, sleepy: { eye: 'shut' }, happy: { eye: 'shut' } };

export class Goose extends CritterRig {
  constructor({ sex = 'm', breed = 'canada', shadows = true, fx = true } = {}) {
    sex = sex === 'f' ? 'f' : 'm';
    breed = GOOSE_BREEDS.includes(breed) ? breed : 'canada';
    super(`Goose_${breed}_${sex}`, { shadows });
    this.sex = sex;
    this.breed = breed;
    const cache = (this._geoCache = cacheFor(breed));
    const G = cache.get();
    // ganders are a touch bigger
    this.sizeG = new THREE.Group();
    this.sizeG.scale.setScalar(sex === 'm' ? 1.06 : 1);
    this.root.add(this.sizeG);
    this.joint('mover', this.sizeG);
    this.joint('body', this.mover, 0, 7.5 * F, 0);
    this.mesh(G.body, this.body);
    this.joint('tail', this.body, 0, 4.2 * F, -10 * F);
    this.mesh(G.tail, this.tail);
    this.joint('neck1', this.body, 0, 4.2 * F, 6.4 * F);
    this.mesh(G.neck1, this.neck1);
    this.joint('neck2', this.neck1, 0, 4.5 * F, 0);
    // a hair thinner than its neighbours, so the overlapping neck voxels never z-fight
    this.mesh(G.neck2, this.neck2).scale.set(0.94, 1, 0.94);
    this.joint('head', this.neck2, 0, 4.5 * F, 0);
    this.mesh(G.head, this.head, { y: -FV });
    this.joint('bill', this.head, 0, 0.6 * F, 3.4 * F);
    this.mesh(G.billU, this.bill);
    this.joint('jaw', this.head, 0, 0.6 * F, 3.4 * F);
    this.mesh(G.billL, this.jaw, { y: -FV * 0.9 });
    this.eyes = {};
    for (const s of [1, -1]) {
      const n = s > 0 ? 'L' : 'R';
      const x = s > 0 ? G.eyeX.L : G.eyeX.R;
      const eg = { dot: this.mesh(G.eyeDot, this.head), wide: this.mesh(G.eyeWide, this.head), shut: this.mesh(G.eyeShut, this.head), angry: this.mesh(G.eyeAngry, this.head) };
      for (const k in eg) { eg[k].position.set(x * FV + (s > 0 ? 0.0006 : -0.0006), (HEAD.eyeY - 1) * FV + 0.3 * FV, HEAD.eyeZ * FV - 0.3 * FV); eg[k].castShadow = false; }
      this.eyes[n] = eg;
      const w = this.joint('wing' + n, this.body, s * 4.4 * F, 5.4 * F, 2.4 * F);
      this.mesh(s > 0 ? G.wingL : G.wingR, w);
      const pj = this.joint('prim' + n, w, -s * 1 * F, -1 * F, -5 * F);
      this.mesh(s > 0 ? G.primL : G.primR, pj);
      const l = this.joint('leg' + n, this.body, s * 2.4 * F, -1.5 * F, 0.8 * F);
      this.mesh(G.leg, l);
    }
    this.fx = fx;
    if (fx) {
      this.zzz = [0, 1].map(() => this.sprite(ZZZ_ROWS, 0.05, this.root));
      this.hearts = [this.sprite(HEART_ROWS, 0.06, this.root)];
    }
    this.scalar('zzz', 0);
    this.scalar('hearts', 0);
    this.jiggle('neck1', 'rx', { k: 150, c: 9, az: 0.012, ay: -0.006, max: 0.25, probe: 'body' });
    this.jiggle('head', 'rx', { k: 200, c: 10, az: 0.02, ay: -0.012, max: 0.4, probe: 'neck2' });
    this.jiggle('body', 's', { k: 260, c: 12, ay: 0.0035, max: 0.08, probe: 'mover' });
    this.jiggle('tail', 'ry', { k: 140, c: 6, ax: 0.02, yaw: 0.012, max: 0.5, probe: 'body' });
    this.jiggle('wingL', 'rz', { k: 220, c: 12, ay: -0.008, max: 0.25, probe: 'body' });
    this.jiggle('wingR', 'rz', { k: 220, c: 12, ay: 0.008, max: 0.25, probe: 'body' });
    this._init(ANIMS, EXPRS, 'idle');
    this.anims = keyed(this.anims);
  }
  _updateFace(dt, f, def) {
    const ex = this._EXPRS[this._userExpr || f.expr || def.expr || 'neutral'] || EXPRS.neutral;
    this._blinkT -= dt;
    if (this._blinkT < -0.12) this._blinkT = 1.8 + hash3(Math.floor(this.time * 10), 4, 2) * 3;
    let e = (this._userExpr && ex.eye !== 'dot' ? ex.eye : f.eyes) || ex.eye;
    if (e === 'dot' && this._blinkT < 0) e = 'shut';
    for (const n of ['L', 'R']) for (const k in this.eyes[n]) this.eyes[n][k].visible = k === e;
  }
  _post() { if (this.fx) birdFx(this, 0.5, 0.0); }
}

// ------------------------------------------------------------------ animations
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };
/** Folded wings + a relaxed S neck. */
const WR = 0.3; // folded wings hug the round body: tilted out at the bottom
function rest(p) {
  p.wingL.rz = WR; p.wingR.rz = -WR;
  p.neck1.rx = 0.22; p.neck2.rx = -0.32; p.head.rx = 0.12;
}
/** Wing spread: arm raise a (rad), primaries unfold u (0 folded .. 1 spread). */
function wings(p, a, u, side = 0) {
  p.wingL.rz = WR + a + side; p.wingR.rz = -WR - a + side;
  p.primL.rx = p.primR.rx = -1.45 * u;
  p.primL.rz = 0.25 * u; p.primR.rz = -0.25 * u;
}
/** Neck pose from the base: lean (rad, + = forward), bend, head pitch so the bill points `look` from level. */
function neck(p, lean, bend, look = 0) {
  p.neck1.rx = lean; p.neck2.rx = bend; p.head.rx = look - lean - bend;
}
function steps(s, ph, rig) {
  const k = Math.floor(ph / PI + 0.5);
  if (s.step !== undefined && k !== s.step) rig._emit('step');
  s.step = k;
}
function legs(p, ph, amp) {
  const sn = sin(ph);
  p.legL.rx = -sn * amp; p.legR.rx = sn * amp;
  p.legL.y = max(0, cos(ph)) * 0.5; p.legR.y = max(0, -cos(ph)) * 0.5;
}
function settle(p, y) {
  p.mover.y = y * F;
  p.legL.rx = p.legR.rx = 1.45; p.legL.y = p.legR.y = 3 * F; p.legL.z = p.legR.z = -1 * F;
}

def('idle', {
  loop: true, dur: 8,
  fn(t, p, f, s, rig) {
    rest(p);
    const T = 8, u = t % T;
    const br = sin(t * 1.8);
    p.body.s = 1 + br * 0.015; p.body.rx = -0.04;
    // look around, a proud stretch, a tail waggle
    const look = K(u, [[0, 0], [1.2, 0], [1.5, 0.7], [2.6, 0.7], [2.9, -0.5], [3.9, -0.5], [4.2, 0], [T, 0]]);
    p.neck2.ry = look * 0.4; p.head.ry = look * 0.6;
    p.head.rz = K(u, [[0, 0], [1.5, 0], [1.8, 0.25], [2.4, 0.25], [2.6, 0], [T, 0]]); // a curious tilt
    const st = win(u, 5.0, 6.2, 0.35, 0.4);
    p.neck1.rx -= 0.2 * st; p.neck2.rx += 0.3 * st; p.head.rx -= 0.25 * st; p.body.rx -= 0.08 * st; p.mover.y = 0.1 * st;
    p.neck1.rx += sin(t * 1.1) * 0.03;
    p.tail.ry = sin(t * 26) * 0.35 * pulse(u, 6.8, 0.6);
    const sh = pulse(u, 7.2, 0.4);
    p.wingL.rz += sh * 0.25; p.wingR.rz -= sh * 0.25; p.mover.rz = sin(t * 40) * 0.05 * sh;
  },
});

def('waddle', {
  loop: true,
  fn(t, p, f, s, rig) {
    const ph = (t / 0.62) * TAU, sn = sin(ph), cs = cos(ph);
    rest(p);
    legs(p, ph, 0.55);
    p.mover.rz = sn * 0.11; p.mover.ry = sn * 0.06;
    p.mover.y = abs(cs) * 0.3;
    p.body.rx = -0.06;
    // the neck bobs with each step, the head stays steady
    p.neck1.rx += abs(sn) * 0.1 - 0.05; p.neck2.rx -= abs(sn) * 0.06; p.head.rx -= abs(sn) * 0.04;
    p.head.rz = -sn * 0.08;
    p.tail.ry = -sn * 0.12;
    p.wingL.rz += abs(sn) * 0.06; p.wingR.rz -= abs(sn) * 0.06;
    steps(s, ph, rig);
  },
});

def('swim', {
  loop: true,
  fn(t, p, f, s, rig) {
    // root = water surface: geese float high, neck tall
    const ph = (t / 0.8) * TAU, sn = sin(ph);
    rest(p);
    p.mover.y = -6.2 * F + sin(t * 2) * 0.15;
    p.mover.rx = sin(t * 2 + 1) * 0.03; p.mover.rz = sin(t * 1.3) * 0.04;
    p.body.rx = -0.06;
    p.legL.rx = 0.7 + sn * 0.6; p.legR.rx = 0.7 - sn * 0.6;
    p.neck1.rx = 0.12; p.neck2.rx = -0.22 + sin(t * 2) * 0.03;
    p.head.ry = sin(t * 0.6) * 0.35; p.head.rx = 0.12;
    p.tail.ry = sin(t * 1.5) * 0.08;
    if (beat(s, 'pd', t, 0.8, 0)) rig._emit('paddle');
  },
});

/** Head down to the ground in front of the feet: d 0..1. */
function graze(p, d) {
  p.body.rx += 0.3 * d; p.body.y -= 0.2 * d;
  p.neck1.rx = lerp(p.neck1.rx, 1.25, d); p.neck2.rx = lerp(p.neck2.rx, 1.05, d); p.head.rx = lerp(p.head.rx, 0.35, d);
  p.legL.rx -= 0.25 * d; p.legR.rx -= 0.25 * d;
  p.tail.rx = -0.25 * d;
}
const lerp = (a, b, t) => a + (b - a) * t;

def('peck', {
  loop: true, dur: 2.4,
  fn(t, p, f, s, rig) {
    // grazing: head down, a few tugs at the grass, a look up, repeat
    const T = 2.4, u = t % T;
    rest(p);
    const d = K(u, [[0, 0.2], [0.3, 1, 'out'], [1.7, 1], [2.1, 0.15, 'io'], [T, 0.2]]);
    graze(p, d);
    const tug = (pulse(u, 0.5, 0.2) + pulse(u, 0.85, 0.2) + pulse(u, 1.25, 0.2)) * d;
    p.head.rx -= tug * 0.3; p.neck2.rx -= tug * 0.12;
    p.jaw.rx = (pulse(u, 0.42, 0.12) + pulse(u, 0.78, 0.12) + pulse(u, 1.18, 0.12)) * 0.45;
    p.head.ry = sin(t * 3) * 0.1 * d;
    p.neck2.ry = K(u, [[0, 0], [2.0, 0], [2.2, 0.3], [T, 0]]);
    if (beat(s, 'p1', t, T, 0.46) || beat(s, 'p2', t, T, 0.82) || beat(s, 'p3', t, T, 1.22)) rig._emit('peck');
  },
});

def('eat', {
  dur: 1.4, next: 'idle',
  fn(t, p, f, s, rig) {
    // spot it, stab it, lift the head and gulp it down the long neck
    const T = 1.4, u = t % T;
    rest(p);
    const d = K(u, [[0, 0], [0.15, 0.25], [0.32, 1, 'in'], [0.44, 0.9], [0.62, 0, 'out'], [T, 0]]);
    graze(p, d);
    const up = K(u, [[0, 0], [0.55, 0], [0.7, 1, 'out'], [1.1, 1], [1.3, 0], [T, 0]]);
    p.neck1.rx -= 0.15 * up; p.neck2.rx += 0.05 * up; p.head.rx -= 0.5 * up;
    p.head.rz = K(u, [[0, 0], [0.1, 0.3], [0.25, 0], [T, 0]]);
    p.jaw.rx = pulse(u, 0.3, 0.12) * 0.6 + pulse(u, 0.72, 0.1) * 0.45;
    // the gulp travels down the neck
    p.neck2.s = 1 - pulse(u, 0.78, 0.16) * 0.08; p.neck1.s = 1 - pulse(u, 0.9, 0.16) * 0.08;
    p.head.s = 1 + pulse(u, 0.72, 0.12) * 0.06;
    if (beat(s, 'pk', t, T, 0.32)) rig._emit('peck');
    if (beat(s, 'g', t, T, 0.8)) rig._emit('gulp');
  },
});

def('honk', {
  loop: true, dur: 1.3,
  fn(t, p, f, s, rig) {
    // neck stretched up and forward, bill wide: "ah-HONK", a breath, again
    const T = 1.3, u = t % T;
    rest(p);
    const q1 = pulse(u, 0.1, 0.22), q2 = pulse(u, 0.4, 0.3), q = max(q1 * 0.7, q2);
    const up = smooth(min(u / 0.12, 1)) * (1 - smooth((u - 0.85) / 0.4)) * 0.6 + 0.4;
    neck(p, 0.35 + 0.12 * q, -0.15 - 0.05 * q, -0.35 * up - 0.25 * q);
    p.neck1.rx += sin(t * 2) * 0.02;
    p.jaw.rx = q * 0.85; p.bill.rx = -q * 0.12;
    p.body.rx = -0.12 * up; p.body.s = 1 + q * 0.06;
    p.mover.y = q * 0.35;
    p.wingL.rz += q * 0.25; p.wingR.rz -= q * 0.25;
    p.tail.rx = -0.15 * q;
    if (beat(s, 'h1', t, T, 0.12) || beat(s, 'h2', t, T, 0.42)) rig._emit('honk');
  },
});
ANIMS.quack = ANIMS.honk; // so 'quack' works on every bird

def('flap', {
  loop: true, dur: (TAU / 15) * 2,
  fn(t, p, f, s, rig) {
    // up on the toes, wings spread wide and beating, neck tall
    const fl = sin(t * 15);
    wings(p, 1.25 + fl * 0.6, 0.85 + fl * 0.15);
    p.wingL.rx = p.wingR.rx = -0.25;
    p.body.rx = -0.45; p.mover.y = 0.6 + abs(sin(t * 7.5)) * 0.6;
    neck(p, -0.05, -0.12, 0.15);
    p.legL.rx = p.legR.rx = 0.45;
    p.tail.rx = -0.3;
    p.jaw.rx = 0.25 + sin(t * 7) * 0.15;
    if (beat(s, 'fl', t, TAU / 15, PI / 30)) rig._emit('flap');
  },
});

def('sit', {
  loop: true,
  fn(t, p, f, s, rig) {
    // belly on the grass, neck in a soft S, the odd look around
    rest(p);
    const br = sin(t * 1.6);
    settle(p, -4.6);
    p.body.s = 1 + br * 0.02; p.body.rx = 0.02;
    p.neck1.rx = 0.05; p.neck2.rx = -0.25; p.head.rx = 0.2;
    p.head.ry = K(t % 7, [[0, 0], [2, 0], [2.3, 0.55], [3.6, 0.55], [3.9, 0]]);
    p.mover.rz = br * 0.015;
    if ((t % 10) > 7) f.eyes = 'shut';
  },
});

def('sleep', {
  loop: true, expr: 'sleepy',
  fn(t, p, f, s, rig) {
    // settled, the neck folded back and the head tucked on the back
    rest(p);
    const br = sin(t * 1.2);
    settle(p, -4.8);
    p.body.s = 1 + br * 0.03; p.body.rx = 0.03;
    p.neck1.rx = -1.05; p.neck1.ry = 0.25; p.neck2.rx = -1.45; p.neck2.ry = 0.35;
    p.head.rx = 0.95 + br * 0.03; p.head.ry = 2.3; p.head.rz = 0.2;
    p.neck1.y = -1.2 * F;
    p.wingL.rz = WR + 0.08 + br * 0.02; p.wingR.rz = -WR - 0.08 - br * 0.02;
    p.k.zzz = 1;
    f.eyes = 'shut';
  },
});

def('brood', {
  loop: true,
  fn(t, p, f, s, rig) {
    // deep in the nest cup (nest root = goose root), puffed up over the eggs
    const T = 8, u = t % T;
    rest(p);
    const br = sin(t * 1.4);
    settle(p, 0.2);
    p.body.s = 1.03 + br * 0.02; p.body.rx = 0.02;
    p.wingL.rz = WR + 0.1; p.wingR.rz = -WR - 0.1;
    p.neck1.rx = 0.08; p.neck2.rx = -0.3;
    const wg = win(u, 1.8, 2.8, 0.15, 0.2);
    p.mover.rz += sin(t * 18) * 0.06 * wg; p.mover.ry = sin(t * 9) * 0.07 * wg;
    p.wingL.rz += wg * 0.12 * (1 + sin(t * 18)); p.wingR.rz -= wg * 0.12 * (1 + sin(t * 18));
    p.tail.ry = sin(t * 22) * 0.3 * wg;
    // turn an egg: reach down under the breast
    const tu = win(u, 4.6, 5.8, 0.35, 0.35);
    p.neck1.rx += 0.6 * tu; p.neck2.rx += 1.3 * tu; p.head.rx += 0.4 * tu;
    p.jaw.rx = pulse(u, 5.2, 0.14) * 0.4;
    p.head.ry = K(u, [[0, 0], [0.6, 0.5], [1.4, 0.5], [1.6, 0], [3.3, 0], [3.6, -0.5], [4.2, -0.5], [4.4, 0], [T, 0]]);
    if (u > 6.2 && u < 7.4) f.eyes = 'shut';
    if (beat(s, 'pk', t, T, 5.2)) rig._emit('turn_egg');
  },
});

/** Head low and forward like a snake, wings half open. a: 0..1 */
function threat(p, a, t) {
  neck(p, 1.3 * a + 0.22 * (1 - a), 0.12 * a - 0.32 * (1 - a), -0.15 * a + 0.0 * (1 - a));
  p.body.rx = 0.18 * a;
  wings(p, 0.55 * a, 0.42 * a, 0);
  p.tail.rx = -0.35 * a;
}

def('chase', {
  loop: true, expr: 'angry',
  fn(t, p, f, s, rig) {
    // charge! fast angry waddle, neck low, wings half open and beating, hissing
    const ph = (t / 0.3) * TAU, sn = sin(ph), cs = cos(ph);
    legs(p, ph, 0.95);
    threat(p, 1, t);
    const fl = sin(t * 18);
    p.wingL.rz += fl * 0.22; p.wingR.rz -= fl * 0.22;
    p.primL.rx += fl * 0.15; p.primR.rx += fl * 0.15;
    p.mover.y = abs(cs) * 0.45;
    p.mover.rz = sn * 0.1; p.mover.ry = sn * 0.05;
    p.neck1.rx += abs(sn) * 0.08; p.neck1.ry = sin(t * 4) * 0.12; p.head.ry = -sin(t * 4) * 0.1;
    p.jaw.rx = 0.5 + sin(t * 11) * 0.25;
    p.tail.ry = sn * 0.2;
    f.eyes = 'angry';
    steps(s, ph, rig);
    if (beat(s, 'h', t, 0.9, 0.1)) rig._emit('honk');
    if (beat(s, 'fl', t, TAU / 18, 0)) rig._emit('flap');
  },
});

def('hiss', {
  loop: true, dur: 1.8, expr: 'angry',
  fn(t, p, f, s, rig) {
    // stand-off: feet planted, head weaving low, bill wide, the odd lunge
    const T = 1.8, u = t % T;
    threat(p, 1, t);
    const lunge = K(u, [[0, 0], [0.9, 0], [1.05, 1, 'out'], [1.25, 1], [1.6, 0], [T, 0]]);
    p.neck1.rx += 0.12 * lunge - 0.1; p.neck2.rx -= 0.12 * lunge; p.body.rx += 0.1 * lunge; p.mover.z = 0.4 * lunge;
    p.neck1.ry = sin(t * 3.2) * 0.25 * (1 - lunge); p.head.ry = -sin(t * 3.2) * 0.2 * (1 - lunge);
    p.neck1.rz = sin(t * 3.2 + 1) * 0.06;
    p.jaw.rx = 0.7 + sin(t * 30) * 0.06 + 0.15 * lunge; p.bill.rx = -0.1;
    p.wingL.rz += 0.15 * lunge + sin(t * 3.2) * 0.04; p.wingR.rz -= 0.15 * lunge + sin(t * 3.2) * 0.04;
    p.mover.rz = sin(t * 3.2) * 0.04;
    p.legL.rx = -0.15; p.legR.rx = 0.2; p.legL.rz = 0.08; p.legR.rz = -0.08;
    p.tail.ry = sin(t * 20) * 0.12;
    f.eyes = 'angry';
    if (beat(s, 'hs', t, T, 0.95)) rig._emit('hiss');
  },
});

def('happy', {
  dur: 1.7, next: 'idle',
  fn(t, p, f, s, rig) {
    // a joyful wing-flap hop and a honk
    const T = 1.7, u = t % T;
    rest(p);
    const hop = K(u, [[0, 0], [0.15, -0.4], [0.42, 1.3, 'out'], [0.66, 0, 'in'], [0.72, -0.3], [0.86, 0.6, 'out'], [1.0, 0, 'in'], [1.08, -0.15], [1.2, 0], [T, 0]]);
    const air = max(0, hop) / 1.3;
    const open = win(u, 0.12, 1.1, 0.15, 0.2);
    const fl = sin(t * 16) * open;
    wings(p, open * (0.9 + fl * 0.5), open * (0.7 + fl * 0.2));
    p.mover.y = hop;
    p.body.s = 1 - min(0, hop) * 0.2 + air * 0.05;
    p.body.rx = -0.3 * open;
    const q = pulse(u, 0.3, 0.3);
    neck(p, 0.15, -0.2, -0.3 * open - 0.2 * q);
    p.jaw.rx = q * 0.8;
    p.legL.rx = p.legR.rx = 0.3 * air;
    p.tail.ry = sin(t * 28) * 0.35 * pulse(u, 1.15, 0.45);
    p.k.hearts = u / T;
    f.eyes = 'shut';
    if (beat(s, 'h', t, T, 0.32)) rig._emit('honk');
    if (open > 0.2 && beat(s, 'fl', t, TAU / 16, 0)) rig._emit('flap');
    if (beat(s, 'l1', t, T, 0.66) || beat(s, 'l2', t, T, 1.0)) rig._emit('step');
  },
});

export { ANIMS as GOOSE_ANIMS };
