// BeaverRig: a VERY cute chibi beaver worker. Big head, buck teeth, rosy
// cheeks, a hard hat, a little tool belt and a flat paddle tail.
//
//   const b = new BeaverRig();  scene.add(b.root);
//   b.onEvent = (name) => {};  // 'chop_hit' | 'hammer_hit' | 'step' | 'munch' | 'thump' | 'splash'
//   b.play('chop');  b.setExpression('focused');  b.update(dt);
//
// Units: 1 voxel = 0.05. Root at the feet, facing +Z. ~0.65 tall to the hat.
import * as THREE from 'three';
import {
  VS, FV, VoxelModel, rbox, ell, tone, buildGeo, geoCache, mirrorX, CritterRig, K, win, pulse, once, beat,
  sin, cos, abs, max, min, PI, TAU, clamp, lerp, smooth, HEART_ROWS, ZZZ_ROWS, SPARK_ROWS,
} from './critterKit.js';
import { CritterFace, BASE_EXPRS } from './critterFaces.js';

/** Distance (world units) from the root to the tree bark the 'chop' animation gnaws at (+Z). */
export const BEAVER_CHOP_DIST = 0.34;
/** Distance (world units) in front of the root where the mallet strikes ('hammer'). */
export const BEAVER_HAMMER_DIST = 0.3;

const C = {
  fur: 0x8c5530, furD: 0x774522, furL: 0xa0653a, furDD: 0x5e361a,
  tan: 0xdcae7c, tanD: 0xc89668, tanL: 0xeac496, belly: 0xe8c592, bellyD: 0xd8b07c,
  nose: 0x3a2224, noseL: 0x7a4a48, earIn: 0xe8968a,
  hat: 0xffbf1a, hatD: 0xe8961a, hatL: 0xffe27a, hatS: 0xffffff, hatR: 0xe2402a,
  belt: 0x6a3f20, beltD: 0x4c2a14, buckle: 0xe8e4d8, pouch: 0x9c6838, pouchD: 0x7c4e28,
  tail: 0x5a4038, tailD: 0x45302a, tailL: 0x705248,
  foot: 0x4a2c20, footL: 0x5e3a2a, paw: 0x6e4028,
  wood: 0xb07840, woodD: 0x8a5a2c, woodL: 0xd6a066, ring: 0xf0cc8c, ringD: 0xc89a5a, bark: 0x6a4428, barkD: 0x4e301c,
  steel: 0xb8c0cc, berry: 0xe8304a, berryD: 0xb01c38, berryL: 0xff7a8a, leaf: 0x4caa3c, leafD: 0x2e7a2c,
  barrow: 0x3a8ad8, barrowD: 0x2a62a8, barrowL: 0x6ab0f0, tyre: 0x2a2228, hub: 0xd8d8e0,
};

// ------------------------------------------------------------------ models (voxels)
// Body: in hips space, y -1..4, pear shaped, belly + tool belt.
function bodyModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    const fx = x + 0.5;
    if (z >= 1 && abs(fx) <= 2.6 - max(0, y - 2) * 0.4 && y <= 3) return tone(x, y, z, C.belly, C.bellyD, C.belly, 0.12, 0);
    return tone(x, y, z, C.fur, C.furD, C.furL);
  };
  ell(v, 0, 1.4, 0, 4.5, 2.9, 3.9, col);
  ell(v, 0, 3.2, 0, 3.6, 2.2, 3.1, col);
  // tool belt (y 0)
  for (let x = -5; x <= 4; x++)
    for (let z = -4; z <= 4; z++) {
      if (!v.has(x, 0, z)) continue;
      const out = !v.has(x + 1, 0, z) || !v.has(x - 1, 0, z) || !v.has(x, 0, z + 1) || !v.has(x, 0, z - 1);
      if (out) v.set(x, 0, z, (x + z) % 3 === 0 ? C.beltD : C.belt);
    }
  // buckle + pouches + tiny wrench
  v.set(-1, 0, 4, C.buckle); v.set(0, 0, 4, C.buckle);
  for (const [x, z] of [[-5, 1], [-5, 0], [4, -1], [4, 0]]) { v.set(x, 0, z, C.pouch); v.set(x, -1, z, C.pouchD); }
  v.set(-5, 1, 1, C.pouchD); v.set(4, 1, 0, C.pouchD);
  return v;
}

// Head: pivot at the neck (bottom centre). x -5..4, y 0..6, z -4..3; muzzle z 4..5.
function headModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    if (z >= 1 && y <= 2 && abs(x + 0.5) <= 4.2) return tone(x, y, z, C.tan, C.tanD, C.tanL, 0.1, 0.05);
    if (y >= 6 && z <= -2) return tone(x, y, z, C.furD, C.furDD, C.fur);
    return tone(x, y, z, C.fur, C.furD, C.furL);
  };
  ell(v, 0, 3.3, -0.3, 5.5, 3.9, 4.6, (x, y, z) => (z > 3 ? null : col(x, y, z)));
  rbox(v, -4, 3, 0, 5, 0, 3, 1.6, col);
  // chubby cheek pouches
  for (const s of [-1, 1]) ell(v, s * 3.4, 2.0, 2.6, 1.7, 1.5, 1.4, (x, y, z) => tone(x, y, z, C.tan, C.tanD, C.tanL, 0.1, 0));
  // muzzle
  rbox(v, -2, 1, 0, 2, 3, 5, 0.9, (x, y, z) => tone(x, y, z, C.tanL, C.tan, C.tanL, 0.15, 0));
  // nose
  v.set(-1, 2, 6, C.noseL); v.set(0, 2, 6, C.nose);
  return v;
}

function earModel() {
  const v = new VoxelModel();
  rbox(v, -1, 0, 0, 1, -1, 0, 0.7, (x, y, z) => (z === 0 && x === -1 + 0 && y <= 1 ? C.earIn : tone(x, y, z, C.furD, C.furDD, C.fur)));
  v.set(-1, 0, 0, C.earIn); v.set(0, 0, 0, C.earIn);
  return v;
}

// Hard hat: pivot at the brim underside centre.
function hatModel() {
  const v = new VoxelModel();
  for (let x = -6; x <= 5; x++)
    for (let z = -6; z <= 6; z++) {
      const dx = (x + 0.5) / 5.4, dz = (z + 0.5) / (z > 0 ? 6.4 : 5.2);
      if (dx * dx + dz * dz > 1) continue;
      v.set(x, 0, z, dx * dx + dz * dz > 0.7 ? C.hatD : C.hat);
    }
  ell(v, 0, 0.5, 0, 4.4, 2.9, 4.6, (x, y, z) => (y < 1 ? null : tone(x, y, z, C.hat, C.hatD, C.hat, 0.04, 0)));
  // ridge + highlight + sticker
  v.set(2, 2, 4, C.hatS); v.set(1, 2, 4, C.hatR);
  return v;
}

function armModel(len, paw) {
  const v = new VoxelModel();
  rbox(v, -1, 0, -len, -1, -1, 0, 0.7, (x, y, z) => (paw && y <= -len + 1 ? tone(x, y, z, C.paw, C.furDD, C.paw) : tone(x, y, z, C.fur, C.furD, C.furL)));
  if (paw) { v.set(-1, -len - 1, 0, C.paw); v.set(0, -len - 1, 0, C.paw); }
  return v;
}

function legModel() {
  const v = new VoxelModel();
  rbox(v, -1, 0, -2, -1, -1, 0, 0.6, (x, y, z) => tone(x, y, z, C.fur, C.furD, C.furL));
  // big webbed back feet
  for (let x = -2; x <= 1; x++)
    for (let z = -1; z <= 2; z++) {
      if ((x === -2 || x === 1) && z === -1) continue;
      v.set(x, -2, z, z === 2 && (x + 2) % 2 === 0 ? C.footL : C.foot);
    }
  return v;
}

function tail0Model() {
  const v = new VoxelModel();
  rbox(v, -1, 0, -1, 0, -2, -1, 0.6, (x, y, z) => tone(x, y, z, C.furD, C.furDD, C.fur));
  return v;
}
// Flat paddle with a crosshatch scale pattern; pivot at the base.
function tailModel() {
  const v = new VoxelModel();
  for (let x = -3; x <= 2; x++)
    for (let z = -8; z <= 0; z++) {
      const dx = (x + 0.5) / 3.2, dz = (z + 4) / 4.6;
      if (dx * dx + dz * dz > 1) continue;
      const hatch = (x + z) % 2 === 0;
      for (let y = 0; y <= 0; y++) v.set(x, y, z, hatch ? C.tailL : tone(x, y, z, C.tail, C.tailD, C.tail));
      if (dx * dx + dz * dz < 0.55) v.set(x, -1, z, C.tailD);
    }
  return v;
}

// Props (fine voxels)
function malletModel() {
  const v = new VoxelModel();
  for (let y = -2; y <= 9; y++) { v.set(0, y, 0, y < 0 ? C.woodD : C.wood); v.set(-1, y, 0, C.woodD); v.set(0, y, -1, C.woodD); v.set(-1, y, -1, C.wood); }
  rbox(v, -4, 3, 9, 14, -3, 2, 1.2, (x, y, z) => (x === -4 || x === 3 ? C.ringD : tone(x, y, z, C.woodL, C.wood, C.ring)));
  for (let y = 10; y <= 13; y++) for (let z = -2; z <= 1; z++) { v.set(-5, y, z, C.ring); v.set(4, y, z, C.ring); }
  v.set(-5, 11, 0, C.ringD); v.set(4, 12, -1, C.ringD);
  return v;
}
function logModel() {
  const v = new VoxelModel();
  for (let x = -11; x <= 10; x++)
    for (let y = -4; y <= 3; y++)
      for (let z = -4; z <= 3; z++) {
        const dy = y + 0.5, dz = z + 0.5, r = Math.hypot(dy, dz);
        if (r > 4.1) continue;
        let c = tone(x, y, z, C.bark, C.barkD, C.woodD, 0.25, 0.08);
        if (x === -11 || x === 10) c = r > 3.2 ? C.bark : (Math.round(r) % 2 ? C.ringD : C.ring);
        v.set(x, y, z, c);
      }
  // a stubby branch with a leaf
  v.set(2, 4, 0, C.bark); v.set(2, 5, 0, C.bark); v.set(3, 6, 0, C.leaf); v.set(2, 6, 0, C.leaf); v.set(3, 7, 0, C.leafD); v.set(4, 6, 0, C.leafD);
  return v;
}
function berryModel() {
  const v = new VoxelModel();
  ell(v, 0, 0, 0, 2.6, 2.8, 2.6, (x, y, z) => ((x + y + z) % 2 === 0 ? (y > 0 && x < 0 ? C.berryL : C.berry) : C.berryD));
  v.set(0, 3, 0, C.leafD); v.set(-1, 3, 0, C.leaf); v.set(1, 3, 0, C.leaf); v.set(0, 3, 1, C.leaf); v.set(0, 3, -1, C.leaf); v.set(0, 4, 0, C.leafD);
  return v;
}
// Tiny wheelbarrow: pivot at the wheel axle; handles toward -Z.
function barrowModel() {
  const v = new VoxelModel();
  // tray
  for (let x = -6; x <= 5; x++)
    for (let z = -16; z <= -2; z++)
      for (let y = 2; y <= 9; y++) {
        const inset = (9 - y) * 0.45;
        if (abs(x + 0.5) > 6 - inset * 0.6 || z < -16 + inset * 0.5 || z > -2 - inset) continue;
        const wall = abs(x + 0.5) > 5 - inset * 0.6 || z < -15 + inset * 0.5 || z > -3 - inset || y === 2;
        if (!wall && y > 2) continue;
        v.set(x, y, z, y === 9 ? C.barrowL : tone(x, y, z, C.barrow, C.barrowD, C.barrow));
      }
  // dirt + a pebble
  for (let x = -4; x <= 3; x++) for (let z = -14; z <= -5; z++) if ((x * 7 + z * 3) % 5 !== 0) v.set(x, 7 + ((x + z) % 3 === 0 ? 1 : 0), z, (x + z) % 2 ? 0x7a5432 : 0x6a4626);
  v.set(0, 8, -9, 0xb8b0a8); v.set(1, 8, -9, 0x9a928a);
  // handles + legs + fork
  for (const s of [-1, 1]) {
    const x = s < 0 ? -5 : 4;
    for (let z = -26; z <= -4; z++) { const y = 3 + Math.round((z + 4) * -0.12); v.set(x, y, z, z < -22 ? C.footL : C.woodD); }
    for (let y = 0; y <= 2; y++) v.set(x, y, -13, C.woodD);
    v.set(x, 1, -1, C.steel); v.set(x, 2, -2, C.steel); v.set(x, 0, 0, C.steel);
  }
  return v;
}
function wheelModel() {
  const v = new VoxelModel();
  for (let y = -4; y <= 3; y++)
    for (let z = -4; z <= 3; z++) {
      const r = Math.hypot(y + 0.5, z + 0.5);
      if (r > 4.2) continue;
      const c = r > 3 ? C.tyre : r < 1.3 ? C.hub : (y === 0 || z === 0 || y === -1 || z === -1) ? C.hub : C.barrowD;
      for (let x = -1; x <= 0; x++) v.set(x, y, z, c);
    }
  return v;
}

const cache = geoCache(() => ({
  body: buildGeo(bodyModel(), [0, 0, 0]),
  head: buildGeo(headModel(), [0, 0, 0]),
  earL: buildGeo(earModel(), [0, 0, 0]),
  earR: buildGeo(mirrorX(earModel()), [0, 0, 0]),
  hat: buildGeo(hatModel(), [0, 0, 0]),
  upper: buildGeo(armModel(2, false), [-0.0, 0, 0]),
  fore: buildGeo(armModel(3, true), [0, 0, 0]),
  leg: buildGeo(legModel(), [0, 0, 0]),
  tail0: buildGeo(tail0Model(), [0, 0, 0]),
  tail: buildGeo(tailModel(), [0, 0, 0]),
  mallet: buildGeo(malletModel(), [0, 0, 0], FV),
  log: buildGeo(logModel(), [0, 0, 0], FV),
  berry: buildGeo(berryModel(), [0, 0, 0], FV),
  barrow: buildGeo(barrowModel(), [0, 0, 0], FV),
  wheel: buildGeo(wheelModel(), [0, 0, 0], FV),
}));

// ------------------------------------------------------------------ face
const FACE = {
  w: 40, h: 22, eyes: [{ x: 11.5, y: 10 }, { x: 28.5, y: 10 }], rx: 4.4, ry: 5.2, style: 'bead', lash: false,
  blush: [{ x: 5, y: 17 }, { x: 35, y: 17 }], blushW: 3,
  mw: 16, mh: 12, mx: 8, my: 4, mstyle: 'beaver', mHalf: 4,
  pal: { f: '#8c5530', F: '#5e361a', b: '#5e361a', i: '#6a3420', I: '#c27a44' },
};
const EXPRS = {
  ...BASE_EXPRS,
  neutral: { ...BASE_EXPRS.neutral, blush: 1 },
  happy: { eyes: 'happy', brows: null, mouth: 'grin', blush: 2, tear: 0 },
  focused: { eyes: 'focused', brows: 'angry', mouth: 'smile', blush: 1, tear: 0 },
  sleepy: { eyes: 'sleepy', brows: null, mouth: 'smile', blush: 1, tear: 0 },
  surprised: { eyes: 'wide', brows: 'raised', mouth: 'o', blush: 1, tear: 0 },
  munch: { eyes: 'happy', brows: null, mouth: 'chew1', blush: 2, tear: 0 },
};

// ------------------------------------------------------------------ rig
const HIP_Y = 2, NECK = [0, 4.6, 0.2], SH = [4.1, 3.6, 0.4];
const ARM_L = ['armL', 'foreL'], ARM_R = ['armR', 'foreR'];

export class BeaverRig extends CritterRig {
  constructor({ shadows = true, hat = 'yellow' } = {}) {
    super('Beaver', { shadows });
    const G = (this._G = cache.get());
    this._geoCache = cache;
    this.joint('mover', this.root);
    this.joint('hips', this.mover, 0, HIP_Y, 0);
    this.mesh(G.body, this.hips);
    this.joint('head', this.hips, ...NECK);
    this.headMesh = this.mesh(G.head, this.head);
    this.joint('earL', this.head, 4.3, 5.2, -0.8); this.mesh(G.earL, this.earL);
    this.joint('earR', this.head, -4.3, 5.2, -0.8); this.mesh(G.earR, this.earR);
    this.joint('hat', this.head, 0, 6.3, -0.3);
    this.hatMesh = this.mesh(G.hat, this.hat, { y: 0 });
    if (hat === 'orange') {
      this.hatMesh.material = this.hatMesh.material.clone();
      this.hatMesh.material.color = new THREE.Color(0xffa070);
      this._owned.push(this.hatMesh.material);
    }
    for (const s of [1, -1]) {
      const n = s > 0 ? 'L' : 'R';
      const a = this.joint('arm' + n, this.hips, s * SH[0], SH[1], SH[2]);
      this.mesh(G.upper, a, { x: 0 });
      const f = this.joint('fore' + n, a, 0, -2, 0);
      this.mesh(G.fore, f);
      const grip = new THREE.Group(); grip.position.set(0, -3.4 * VS, 0.2 * VS); f.add(grip);
      this['grip' + n] = grip;
      const l = this.joint('leg' + n, this.hips, s * 2, 0, 0.4);
      this.mesh(G.leg, l);
    }
    this.joint('tail0', this.hips, 0, 0.2, -2.8);
    this.mesh(G.tail0, this.tail0);
    this.joint('tail', this.tail0, 0, 0, -1.6);
    this.mesh(G.tail, this.tail);
    // props
    this.props = {};
    const prop = (name, geo, parent, x, y, z) => { const m = this.mesh(geo, parent, { x, y, z }); m.visible = false; this.props[name] = m; return m; };
    prop('mallet', G.mallet, this.gripR, 0, -0.05, 0.02).rotation.x = PI / 2;
    this.joint('logJ', this.hips, 0, 14.3, 0.2);
    prop('log', G.log, this.logJ, 0, 0, 0);
    this.joint('berryJ', this.head, 0, 0.6, 7.8);
    prop('berry', G.berry, this.berryJ, 0, 0, 0);
    this.joint('barrowJ', this.mover, 0, 0, 11);
    prop('barrow', G.barrow, this.barrowJ, 0, 0.1, 0);
    this.wheelG = new THREE.Group(); this.wheelG.position.set(0, 0.1, 0); this.barrowJ.add(this.wheelG);
    prop('wheel', G.wheel, this.wheelG, 0, 0, 0);
    this._wheelA = 0;
    // face
    this.face = new CritterFace(FACE);
    this.facePlane(this.face.eyes.tex, this.head, FACE.w, FACE.h, -0.0, 7 - FACE.h / 8, 4);
    this.facePlane(this.face.mouth.tex, this.head, FACE.mw, FACE.mh, -0.0, 3 - FACE.mh / 8, 6);
    // sprites
    this.zzz = [0, 1, 2].map(() => this.sprite(ZZZ_ROWS, 0.08, this.root));
    this.hearts = [0, 1, 2].map(() => this.sprite(HEART_ROWS, 0.08, this.root));
    this.sparks = [0, 1].map(() => this.sprite(SPARK_ROWS, 0.07, this.root));
    // secondary
    this.scalar('wheelSpd', 0);
    this.scalar('zzz', 0);
    this.scalar('hearts', 0);
    this.scalar('berryS', 1);
    this.scalar('spark', 0);
    this.jiggle('earL', 'rx', { k: 220, c: 10, az: 0.02, ay: 0.03, probe: 'head' });
    this.jiggle('earR', 'rx', { k: 220, c: 10, az: 0.02, ay: 0.03, probe: 'head' });
    this.jiggle('earL', 'rz', { k: 200, c: 9, ax: 0.03, probe: 'head' });
    this.jiggle('earR', 'rz', { k: 200, c: 9, ax: 0.03, probe: 'head' });
    this.jiggle('hat', 'rx', { k: 260, c: 12, az: -0.012, ay: 0.006, max: 0.35, probe: 'head' });
    this.jiggle('hat', 'rz', { k: 260, c: 12, ax: 0.012, max: 0.35, probe: 'head' });
    this.jiggle('hat', 'y', { k: 320, c: 14, ay: 0.012, max: 0.6, probe: 'head' });
    this.jiggle('head', 's', { k: 300, c: 11, ay: 0.0035, max: 0.12, probe: 'hips' });
    this.jiggle('tail', 'rx', { k: 120, c: 7, ay: 0.03, az: -0.01, max: 0.6, probe: 'hips' });
    this.jiggle('tail', 'ry', { k: 110, c: 7, ax: 0.03, yaw: 0.02, max: 0.6, probe: 'hips' });
    this._init(ANIMS, EXPRS, 'idle');
  }

  _post(p, dt) {
    for (const k of ['mallet', 'log', 'berry', 'barrow', 'wheel']) this.props[k].visible = !!p.vis[k === 'wheel' ? 'barrow' : k];
    this.props.berry.scale.setScalar(p.k.berryS ?? 1);
    this._wheelA += this.k.wheelSpd * dt;
    this.wheelG.rotation.x = this._wheelA;
    // sprites
    const tz = this.time;
    this.zzz.forEach((s, i) => {
      const u = (tz * 0.45 + i / 3) % 1;
      s.visible = this.k.zzz > 0.5;
      s.position.set(0.14 + u * 0.12 + sin(u * 9) * 0.02, 0.32 + u * 0.35, 0.1);
      s.scale.setScalar((0.04 + u * 0.06) * (u < 0.85 ? 1 : (1 - u) / 0.15));
    });
    this.hearts.forEach((s, i) => {
      const u = (tz * 0.6 + i / 3) % 1;
      s.visible = this.k.hearts > 0.5;
      s.position.set((i - 1) * 0.16 + sin(u * 7 + i) * 0.03, 0.55 + u * 0.3, 0.12);
      s.scale.setScalar(0.07 * (u < 0.8 ? 1 : (1 - u) / 0.2) * (0.6 + 0.4 * min(1, u * 5)));
    });
    const sp = p.k.spark || 0;
    this.sparks.forEach((s, i) => {
      s.visible = sp > 0.05;
      s.position.set((i ? 1 : -1) * (0.2 + sp * 0.06), 0.5 + sp * 0.1 + i * 0.05, 0.12);
      s.scale.setScalar(0.07 * sin(clamp(sp, 0, 1) * PI));
    });
  }
}
// berryS is a per-frame scalar (not blended)
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };

// ------------------------------------------------------------------ helpers
function life(t, p, amt = 1) {
  const br = sin(t * 2.6);
  p.hips.s = 1 + br * 0.015 * amt;
  p.head.rx += -br * 0.02 * amt;
  p.armL.rz += sin(t * 2.6 + 0.5) * 0.04 * amt; p.armR.rz -= sin(t * 2.6 + 0.5) * 0.04 * amt;
  p.earL.rz += sin(t * 1.3) * 0.05 * amt; p.earR.rz -= sin(t * 1.3 + 0.7) * 0.05 * amt;
  p.tail.ry += sin(t * 1.1) * 0.12 * amt;
}
function restArms(p) {
  // chubby arms resting on the belly
  p.armL.rx = -0.35; p.armL.rz = 0.25; p.foreL.rx = -0.9;
  p.armR.rx = -0.35; p.armR.rz = -0.25; p.foreR.rx = -0.9;
}
function tailRest(p) { p.tail0.rx = -0.35; p.tail.rx = -0.25; }
function steps(s, ph, rig) {
  const k = Math.floor(ph / PI + 0.5);
  if (s.step !== undefined && k !== s.step) rig._emit('step');
  s.step = k;
}
function walkLegs(p, ph, amp = 0.7) {
  const sn = sin(ph);
  p.legL.rx = -sn * amp; p.legR.rx = sn * amp;
  p.legL.y = max(0, cos(ph)) * 0.6; p.legR.y = max(0, -cos(ph)) * 0.6;
}

// ------------------------------------------------------------------ animations
def('idle', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    life(t, p);
    restArms(p);
    tailRest(p);
    p.hips.rz = sin(t * 0.9) * 0.03; p.head.rz = sin(t * 0.9 + 0.6) * 0.06;
    p.head.ry = K(t % 7, [[0, 0], [2.2, 0], [2.6, 0.45], [3.8, 0.45], [4.2, -0.35], [5.3, -0.35], [5.8, 0]]);
    f.look = [p.head.ry * 1.5, 0];
    // tail thump every 2.6s: lift, then slam
    const u = t % 2.6;
    const lift = K(u, [[0, 0], [1.6, 0], [1.9, 1, 'out'], [2.02, -0.25, 'in'], [2.3, 0, 'out']]);
    p.tail0.rx += lift * 0.9; p.tail.rx += lift * 0.4;
    if (beat(s, 'th', t, 2.6, 2.0)) rig._emit('thump');
    const sq = pulse(u, 2.0, 0.22);
    p.mover.y += sq * 0.5; p.hips.s -= sq * 0.04;
    p.earL.rx -= sq * 0.3; p.earR.rx -= sq * 0.3;
  },
});

def('run', {
  loop: true, expr: 'happy',
  fn(t, p, f, s, rig) {
    const ph = (t / 0.26) * TAU, sn = sin(ph), cs = cos(ph);
    const bob = abs(cs);
    walkLegs(p, ph, 1.0);
    p.mover.y = bob * 1.4;
    p.hips.rx = 0.28; p.head.rx = -0.22 + bob * 0.06;
    p.hips.s = 1 + (bob - 0.5) * 0.08;
    p.hips.rz = cs * 0.08; p.head.rz = -cs * 0.07;
    // little arms pumping
    p.armL.rx = -0.4 + sn * 0.8; p.armR.rx = -0.4 - sn * 0.8; p.foreL.rx = p.foreR.rx = -1.3;
    p.armL.rz = 0.2; p.armR.rz = -0.2;
    p.tail0.rx = 0.05 + bob * 0.25; p.tail.rx = 0.2 + cs * 0.3;
    p.tail.ry = sn * 0.25;
    p.earL.rx = p.earR.rx = -bob * 0.4;
    f.mouth = 'grin';
    steps(s, ph, rig);
  },
});

def('chop', {
  loop: true, expr: 'focused',
  fn(t, p, f, s, rig) {
    const ph = (t / 0.32) * TAU;
    const g = sin(ph);
    // braced on the tail, leaning into the trunk
    p.hips.rx = 0.22; p.mover.z = 0.6;
    p.head.rx = 0.05 + g * 0.16; p.head.z = 0.8 + max(0, g) * 0.7; p.head.ry = sin(t * 1.3) * 0.2;
    p.head.s = 1 - max(0, g) * 0.06;
    arm(p, ARM_L, 1, 1.45, -0.05, 0.4); arm(p, ARM_R, -1, 1.45, -0.05, 0.4);
    p.armL.rx += g * 0.06; p.armR.rx -= g * 0.06;
    p.legL.rx = 0.2; p.legR.rx = 0.2;
    p.tail0.rx = -0.6; p.tail.rx = -0.05;
    p.tail.ry = sin(t * 9) * 0.06;
    f.mouth = g > 0.2 ? 'grin' : 'chew2';
    if (beat(s, 'hit', t, 0.32, 0.08)) rig._emit('chop_hit');
    p.k.spark = 0;
  },
});

function arm(p, names, side, fwd, out, el) {
  p[names[0]].rx = -fwd; p[names[0]].rz = out * side; p[names[1]].rx = -el;
}

def('carry_log', {
  loop: true, expr: 'happy',
  fn(t, p, f, s, rig) {
    const ph = (t / 0.42) * TAU, sn = sin(ph), cs = cos(ph);
    const bob = abs(cs);
    walkLegs(p, ph, 0.6);
    p.mover.y = bob * 0.6;
    p.hips.s = 1 - bob * 0.05;
    p.hips.rz = cs * 0.05; p.head.rz = cs * 0.03;
    p.head.rx = 0.06;
    // little arms straining up to steady the log
    arm(p, ARM_L, 1, 2.7, 0.35, 0.2 + sn * 0.1); arm(p, ARM_R, -1, 2.7, 0.35, 0.2 - sn * 0.1);
    p.vis.log = true;
    p.logJ.y = -bob * 0.5; p.logJ.rz = cs * 0.08; p.logJ.y += 0;
    p.hat.y = -bob * 0.2;
    tailRest(p); p.tail.rx += bob * 0.2;
    f.mouth = 'grin';
    f.eyes = (t % 3) > 2.6 ? 'happy' : 'focused';
    f.brows = null;
    steps(s, ph, rig);
  },
});

def('hammer', {
  loop: true, expr: 'focused',
  fn(t, p, f, s, rig) {
    const T = 0.7, u = (t % T) / T;
    // wind-up, smash, recoil
    const sw = K(u, [[0, 0.2], [0.45, -0.9, 'out'], [0.62, 1.15, 'in'], [0.7, 1.05, 'out'], [1, 0.2]]);
    const hit = pulse(u, 0.6, 0.18);
    p.hips.rx = 0.12 + sw * 0.1; p.head.rx = 0.25 + hit * 0.1;
    p.mover.y = -hit * 0.4; p.hips.s = 1 - hit * 0.07;
    p.legL.rx = -0.2; p.legR.rx = 0.25;
    // right paw swings the mallet, left paw steadies the peg
    arm(p, ARM_R, -1, 0.9 - sw * 1.4 + 1.2, 0.15, 0.5 + max(0, -sw) * 0.4);
    arm(p, ARM_L, 1, 1.0, 0.1, 0.9);
    p.vis.mallet = true;
    tailRest(p);
    p.tail0.rx += hit * 0.4;
    f.mouth = hit > 0.3 ? 'grin' : 'smile';
    f.look = [0, 1];
    if (beat(s, 'hit', t, T, T * 0.61)) rig._emit('hammer_hit');
    p.k.spark = hit;
  },
});

def('eat_berry', {
  loop: true, expr: 'munch',
  fn(t, p, f, s, rig) {
    // sitting on the bum, feet out, berry held to the mouth with both paws
    p.mover.y = -1.3; p.hips.rx = -0.18;
    p.legL.rx = p.legR.rx = -1.2; p.legL.rz = 0.15; p.legR.rz = -0.15;
    const ch = sin(t * 13);
    p.head.rx = 0.18 + ch * 0.05; p.head.s = 1 + ch * 0.03;
    p.head.rz = sin(t * 1.4) * 0.08;
    arm(p, ARM_L, 1, 1.55, -0.42, 0.95); arm(p, ARM_R, -1, 1.55, -0.42, 0.95);
    p.armL.rx += ch * 0.04; p.armR.rx += ch * 0.04;
    p.tail0.rx = -0.2; p.tail.rx = -0.05; p.tail.ry = sin(t * 3) * 0.3;
    p.vis.berry = true;
    p.berryJ.y = -0.3 + ch * 0.25;
    const bite = Math.floor(t / 1.2) % 4;
    p.k.berryS = 1 - bite * 0.18;
    f.mouth = ch > 0 ? 'chew1' : 'chew2';
    p.k.hearts = (t % 4.8) > 3.6 ? 1 : 0;
    if (beat(s, 'm', t, 0.6, 0)) rig._emit('munch');
  },
});

def('cheer', {
  loop: true, expr: 'happy',
  fn(t, p, f, s, rig) {
    const T = 0.62, u = (t % T) / T;
    const jump = K(u, [[0, 0], [0.12, -0.6, 'out'], [0.25, 0], [0.5, 4.2, 'out'], [0.78, 0, 'in'], [0.88, -0.7, 'out'], [1, 0]]);
    p.mover.y = max(0, jump);
    p.hips.s = 1 + (jump < 0 ? jump * 0.12 : min(0.08, jump * 0.03));
    const up = smooth(u * 3) * (1 - smooth((u - 0.85) * 7));
    arm(p, ARM_L, 1, 2.6 * up + 0.4, 0.6 + sin(t * 20) * 0.1, 0.3); arm(p, ARM_R, -1, 2.6 * up + 0.4, 0.6 - sin(t * 20) * 0.1, 0.3);
    p.legL.rx = p.legR.rx = jump > 0.5 ? -0.4 : 0;
    p.legL.rz = 0.2 * (jump > 0.5); p.legR.rz = -0.2 * (jump > 0.5);
    p.head.rx = -0.18;
    p.tail0.rx = 0.2; p.tail.rx = 0.3 + sin(t * 16) * 0.3; p.tail.ry = sin(t * 12) * 0.4;
    f.mouth = 'open';
    p.k.spark = jump > 0 ? jump / 4.2 : 0;
    if (beat(s, 'land', t, T, T * 0.8)) rig._emit('step');
  },
});

def('sleep', {
  loop: true, expr: 'asleep',
  fn(t, p, f, s, rig) {
    // belly-flop nap: chin on paws, tail curled over like a blanket
    const br = sin(t * 1.5);
    p.mover.rx = 1.42; p.mover.y = 2.9; p.mover.z = -3;
    p.hips.s = 1 + br * 0.03;
    p.head.rx = -1.25 + br * 0.03; p.head.z = 0.3; p.head.rz = 0.15;
    arm(p, ARM_L, 1, 1.4, -0.55, 1.6); arm(p, ARM_R, -1, 1.4, -0.55, 1.6);
    p.legL.rx = p.legR.rx = 1.2;
    p.tail0.rx = 0.9; p.tail.rx = 0.9; p.tail.ry = 0.2 + br * 0.05;
    p.hat.rx = 0.35; p.hat.z = 0.5;
    p.earL.rx = p.earR.rx = 0.3;
    p.k.zzz = 1;
    f.mouth = br > 0.4 ? 'chew2' : 'smile';
    f.blink = false;
    if (beat(s, 'snore', t, (TAU / 1.5), 1.0)) rig._emit('snore');
  },
});

def('swim', {
  loop: true, expr: 'happy',
  fn(t, p, f, s, rig) {
    // root = water surface. Body under water, head + hat above, tail paddling.
    const ph = (t / 0.55) * TAU, sn = sin(ph), cs = cos(ph);
    p.mover.rx = 1.25; p.mover.y = -3.4 + sin(t * 3) * 0.25; p.mover.z = -2;
    p.head.rx = -1.15 + sn * 0.03; p.head.rz = sin(t * 1.2) * 0.08; p.head.z = 0.4;
    p.legL.rx = 0.8 + sn * 0.7; p.legR.rx = 0.8 - sn * 0.7;
    arm(p, ARM_L, 1, 0.9 + cs * 0.6, 0.5, 0.6); arm(p, ARM_R, -1, 0.9 - cs * 0.6, 0.5, 0.6);
    p.tail0.rx = -1.15 + sn * 0.2; p.tail.rx = sn * 0.45;
    p.mover.rz = cs * 0.04;
    f.mouth = 'smile';
    if (beat(s, 'spl', t, 1.1, 0.3)) rig._emit('splash');
  },
});

def('plow', {
  loop: true, expr: 'focused',
  fn(t, p, f, s, rig) {
    const ph = (t / 0.34) * TAU, sn = sin(ph), cs = cos(ph);
    const bob = abs(cs);
    walkLegs(p, ph, 0.9);
    p.mover.y = bob * 0.6;
    p.hips.rx = 0.42; p.head.rx = -0.32; p.hips.rz = cs * 0.04;
    p.legL.rx -= 0.2; p.legR.rx -= 0.2;
    arm(p, ARM_L, 1, 1.15 + sn * 0.04, 0.12, 0.1); arm(p, ARM_R, -1, 1.15 - sn * 0.04, 0.12, 0.1);
    p.vis.barrow = true;
    p.barrowJ.y = bob * 0.25; p.barrowJ.rx = -0.04 + sn * 0.02; p.barrowJ.rz = cs * 0.03;
    p.k.wheelSpd = 9;
    tailRest(p); p.tail.rx += 0.2 + bob * 0.2; p.tail.ry = sn * 0.2;
    f.mouth = (t % 2.4) > 1.8 ? 'grin' : 'smile';
    f.brows = 'angry';
    steps(s, ph, rig);
  },
});

def('wave', {
  loop: true, expr: 'happy',
  fn(t, p, f, s, rig) {
    life(t, p, 0.6);
    restArms(p);
    const w = sin(t * 10);
    arm(p, ARM_R, -1, 0.35, 2.0 + w * 0.2, 0.5 + w * 0.45);
    p.armR.ry = 0.5;
    p.hips.rz = -0.06 + sin(t * 5) * 0.03; p.head.rz = 0.14 + sin(t * 5) * 0.06;
    p.mover.y = abs(sin(t * 5)) * 0.4;
    p.tail0.rx = 0.05; p.tail.rx = 0.2; p.tail.ry = sin(t * 9) * 0.45;
    f.mouth = 'open';
  },
});

export { ANIMS as BEAVER_ANIMS };
