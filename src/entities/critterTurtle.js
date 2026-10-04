// TurtleElder: "Grandpa Shellby", keeper of the ancient fish at the Great
// Willow. An old snapping turtle with a mossy shell (moss tufts, tiny flowers,
// a little mushroom), bushy white eyebrows that bounce, a wispy white beard,
// a gnarled willow walking stick (stays planted) and a cup of tea that steams.
//
//   const t = new TurtleElder();  scene.add(t.root);
//   t.play('doze');     // head slowly sinks into the shell, zzz (loop)
//   t.play('wake');     // pops out startled -> idle
//   t.onEvent = (name) => {};  // 'step' | 'tap' (stick) | 'slurp' | 'ahh' | 'snore' | 'pop' | 'rattle' | 'hoho'
//
// Anims: idle wave talk laugh walk happy sip_tea doze wake
// Expressions: neutral happy talk surprised sleepy smug asleep (+ BASE_EXPRS)
// Walk speed: 'walk' ~0.3 units/s (move the root; the anim is in place).
// Units: 1 voxel = 0.05. Root at the feet, facing +Z. ~1.12 tall to the top of the head (~1.05 to the moss).
import * as THREE from 'three';
import {
  VS, FV, VoxelModel, rbox, ell, tone, hash3, buildGeo, geoCache, mirrorX, handModel, K, pulse, beat, win,
  sin, cos, abs, max, min, PI, TAU, clamp, lerp, smooth, ZZZ_ROWS, SPARK_ROWS,
} from './critterKit.js';
import { BASE_EXPRS } from './critterFaces.js';
import { BipedRig, HAND_KINDS } from './critterBiped.js';
import { NpcFace, talkMouth, stepEvents, plantStick, orientIn, PUFF_ROWS } from './npcProps.js';

const C = {
  skin: 0x86b09a, skinD: 0x6a9682, skinL: 0xa4c8b4, skinDD: 0x4e7464, bump: 0x76a08a,
  shell: 0x84603a, shellD: 0x664628, shellL: 0xa47c4c, seam: 0x40281a,
  moss: 0x5aa040, mossD: 0x3e8030, mossL: 0x86c85c,
  plas: 0xdccc92, plasD: 0xbeae76, plasL: 0xeee2b4,
  beak: 0x6a6a4a, beakD: 0x46462e, beakL: 0x8a8a62,
  hair: 0xf6f4ee, hairD: 0xdcd8ce, claw: 0x3a3428,
  staff: 0x8a6a40, staffD: 0x6a4e2c, staffL: 0xa8845a, leaf: 0x7ac85a, leafD: 0x4e9a3a,
  cup: 0xfaf6ea, cupD: 0xe0dac8, band: 0x4caa6a, tea: 0xb06a2a,
  white: 0xffffff, pink: 0xf08aa8, yellow: 0xffd84a, red: 0xe0483a, stem: 0xf0e6cc,
};

const D = {
  CHIBI: { body: 0.86, head: 1.25 }, // [v20 npc rigs] small body, big head (BipedRig); a bit more shell
  HIP_Y: 6, WAIST: 1, NECK: 9.4, NECK_Z: 1.6, SH: [5.6, 6.4, 0.4], L_UP: 3.0, L_FORE: 2.8, L_HAND: 2.0,
  THIGH: 3.0, SHIN: 3.2, LEG_X: 2.8, EAR: [0.6, 4.4, 4.5], TAIL: [-0.6, -5.4],
};
const STAFF_L = 18 * FV; // grip -> foot of the stick
const RETRACT = [-2.2, -6.2]; // head (y, z) offset when pulled into the shell (voxels)

// ------------------------------------------------------------------ models
const skinCol = (x, y, z) => ((x * 5 + y * 3 + z * 7) % 11 === 0 ? C.bump : tone(x, y, z, C.skin, C.skinD, C.skinL, 0.14, 0.08));
function pelvisModel() {
  const v = new VoxelModel();
  rbox(v, -4, 3, -3, 0, -3, 2, 1.6, skinCol);
  return v;
}
function torsoModel() {
  const v = new VoxelModel();
  // carapace: a dome on the back with a hood over the neck opening, scutes, a ridged keel, moss on top
  const CZ = -2.6, CY = 4.8;
  // scutes: brick-offset cells around the dome, 1-voxel seams where neighbouring cells differ
  const cell = (x, y, z) => {
    const ring = Math.floor((y + 3) / 4.2);
    const th = Math.atan2(x + 0.5, -(z + 0.5 - CZ)) * (2.2 / PI) + (ring % 2) * 0.5;
    return ring * 100 + Math.floor(th + 10);
  };
  const shellCol = (x, y, z) => {
    const c0 = cell(x, y, z);
    if (cell(x + 1, y, z) !== c0 || cell(x, y + 1, z) !== c0 || cell(x, y, z - 1) !== c0) return C.seam;
    const th = Math.atan2(x + 0.5, -(z + 0.5 - CZ)) * (2.2 / PI) + (Math.floor((y + 3) / 4.2) % 2) * 0.5;
    const mid = abs(((th + 10) % 1) - 0.5) < 0.2 && abs((((y + 3) / 4.2) % 1) - 0.5) < 0.22;
    return mid ? C.shellL : tone(x, y, z, C.shell, C.shellD, C.shell, 0.14, 0.06);
  };
  ell(v, 0, CY, CZ, 7.3, 7.6, 5.8, (x, y, z) => (y < -3 ? null : z <= 0 || (y >= 11 && z <= 2.4) ? shellCol(x, y, z) : null));
  // rim of marginal scutes at the bottom + the bridge at the sides
  for (let x = -7; x <= 6; x++) for (let z = -8; z <= 0; z++) if (v.has(x, -3, z)) v.set(x, -3, z, (x + z) % 2 ? C.shellD : C.seam);
  for (const x of [-6, 5]) for (let y = -2; y <= 8; y++) for (let z = -1; z <= 1; z++) v.set(x, y, z, (y + 20) % 3 === 0 ? C.seam : C.shellD);
  // plastron (belly plate)
  rbox(v, -5, 4, -3, 9, -1, 1, 1.4, (x, y, z) => ((y + 20) % 4 === 0 || x === -1 || x === 0 && y % 2 === 0 ? C.plasD : tone(x, y, z, C.plas, C.plasD, C.plasL, 0.1, 0.1)));
  // neck skin inside the opening (fills gaps when the head moves)
  rbox(v, -3, 2, 6, 10, -3, 1, 1.2, skinCol);
  // keel ridges (snapping turtle bumps) along the top
  for (const kx of [-3, 0, 3]) for (let z = -7; z <= 0; z++) {
    let top = null;
    for (let y = 14; y >= 0; y--) if (v.has(kx, y, z)) { top = y; break; }
    if (top !== null && (z + 20) % 3 === 0) v.set(kx - (kx === 0 ? 1 : 0), top + 1, z, C.shellD);
  }
  // moss blanket on the upper shell + tufts + flowers + a tiny mushroom
  const tops = [];
  for (let x = -7; x <= 6; x++)
    for (let z = -9; z <= 2; z++) {
      let top = null;
      for (let y = 14; y >= 0; y--) if (v.has(x, y, z)) { top = y; break; }
      if (top === null || top < 8.5) continue;
      if (z > 0 && top < 11) continue;
      const h = hash3(x, 7, z);
      if (h < 0.85) v.set(x, top, z, h < 0.3 ? C.mossD : h > 0.7 ? C.mossL : C.moss);
      if (h > 0.55) v.set(x, top + 1, z, h > 0.8 ? C.mossL : C.moss);
      tops.push([x, top, z]);
    }
  for (const [x, top, z] of tops) {
    const h = hash3(x, 11, z);
    if (h > 0.93) { v.set(x, top + 2, z, C.white); v.set(x, top + 1, z, C.mossD); }
    else if (h > 0.89) { v.set(x, top + 2, z, C.pink); v.set(x, top + 1, z, C.mossD); }
    else if (h > 0.86) { v.set(x, top + 2, z, C.yellow); v.set(x, top + 1, z, C.mossD); }
  }
  // mushroom on the back-left
  v.set(5, 8, -6, C.stem); v.set(5, 9, -6, C.stem); v.set(5, 10, -6, C.red); v.set(6, 10, -6, C.red); v.set(4, 10, -6, C.red); v.set(5, 10, -5, C.red); v.set(5, 10, -7, C.red); v.set(5, 11, -6, C.white);
  return v;
}
function headModel() {
  const v = new VoxelModel();
  // wrinkly neck stalk + big blocky snapper head (upper jaw); the lower jaw is its own joint
  rbox(v, -3, 2, -4, 1, -3, 1, 1.4, (x, y, z) => (y % 2 === 0 ? C.skinD : skinCol(x, y, z)));
  rbox(v, -4, 3, 1, 5, -3, 4, 2.2, (x, y, z) => (y <= 2 && z >= 2 ? tone(x, y, z, C.skinL, C.skin, C.skinL, 0.1, 0) : skinCol(x, y, z)));
  // mouth line along the sides, curling up into a smile at the front corners
  for (const x of [-4, 3]) for (let z = -1; z <= 2; z++) v.set(x, 1, z, C.skinDD);
  v.set(-4, 2, 3, C.skinDD); v.set(3, 2, 3, C.skinDD); v.set(-3, 1, 4, C.skinDD); v.set(2, 1, 4, C.skinDD);
  // little hooked beak tip + nostrils
  v.set(-1, 2, 5, C.beakL); v.set(0, 2, 5, C.beakL); v.set(-1, 1, 5, C.beak); v.set(0, 1, 5, C.beak);
  v.set(-1, 1, 6, C.beakD); v.set(0, 1, 6, C.beakD);
  v.set(-1, 3, 5, C.skinDD); v.set(0, 3, 5, C.skinDD);
  return v;
}
function jawModel() {
  const v = new VoxelModel();
  // lower jaw, pivot at the hinge (back), pale chin
  rbox(v, -4, 3, -1, 0, -3, 4, 0.9, (x, y, z) => (z >= 1 ? tone(x, y, z, C.skinL, C.skin, C.skinL, 0.1, 0) : skinCol(x, y, z)));
  v.set(-1, 0, 5, C.beak); v.set(0, 0, 5, C.beak);
  return v;
}
function browModel() {
  // bushy white eyebrow (left; the "ear" joint), sticks out over the eye and droops at the end
  const v = new VoxelModel();
  for (let x = 0; x <= 3; x++) v.set(x, 0, 0, x % 2 ? C.hairD : C.hair);
  for (let x = 0; x <= 2; x++) v.set(x, 1, 0, C.hair);
  v.set(1, 0, 1, C.hair); v.set(2, 0, 1, C.hairD); v.set(4, -1, 0, C.hair); v.set(4, 0, 0, C.hairD); v.set(2, 2, -1, C.hairD);
  return v;
}
function beardModel() {
  const v = new VoxelModel();
  const strands = [[-2, 2], [-1, 4], [0, 3], [1, 2]];
  for (const [x, len] of strands) for (let k = 0; k < len; k++) v.set(x, -k, k > 1 ? 1 : 0, (x + k) % 2 ? C.hairD : C.hair);
  v.set(-1, -4, 1, C.hairD);
  return v;
}
function upperModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_UP, 0, -1, 1, 1.0, skinCol);
  return v;
}
function foreModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_FORE - 1, 0, -1, 1, 1.2, skinCol);
  return v;
}
function thighModel() {
  const v = new VoxelModel();
  rbox(v, -2, 2, -D.THIGH, 1, -2, 1, 1.4, skinCol);
  return v;
}
function shinModel() {
  const v = new VoxelModel();
  rbox(v, -2, 2, -D.SHIN + 1, 0, -2, 1, 1.4, skinCol);
  // stumpy elephant feet with claws
  rbox(v, -2, 2, -D.SHIN, -D.SHIN + 1, -2, 2, 0.8, (x, y, z) => tone(x, y, z, C.skinD, C.skinDD, C.skinD, 0.2, 0));
  for (const x of [-2, 0, 2]) v.set(x, -D.SHIN, 3, C.claw);
  return v;
}
function tailModel() {
  const v = new VoxelModel();
  for (let z = 0; z >= -4; z--) { const w = z > -2 ? 1 : 0; for (let x = -1 - w; x <= w; x++) v.set(x, Math.round(z * 0.35), z, z === -4 ? C.skinD : skinCol(x, 0, z)); }
  v.set(-1, 1, -1, C.shellD); v.set(-1, 0, -3, C.shellD); // ridges
  return v;
}
function staffModel() {
  const v = new VoxelModel();
  // gnarled willow stick: pivot at the grip, foot at -STAFF_L, knotted top with a willow sprig
  const L = 18;
  for (let y = -L; y <= 9; y++) {
    const wob = Math.round(sin(y * 0.45) * 0.6);
    v.set(wob, y, 0, y <= -L + 1 ? C.staffD : tone(0, y, 0, C.staff, C.staffD, C.staffL, 0.2, 0.15));
    v.set(wob - 1, y, 0, C.staffD); v.set(wob, y, -1, C.staffD); v.set(wob - 1, y, -1, C.staff);
    if (y === -5 || y === 4) { v.set(wob + 1, y, 0, C.staffD); v.set(wob + 1, y, -1, C.staffD); } // knots
  }
  for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) if (abs(x + 0.5) + abs(z + 0.5) < 2.5) v.set(x, 10, z, C.staffD);
  v.set(-1, 11, 0, C.staff); v.set(0, 11, -1, C.staffL);
  // sprig: a twig with hanging willow leaves
  for (let k = 0; k <= 3; k++) v.set(1 + k, 9 + Math.round(k * 0.5), 0, C.staffD);
  for (const [x, y] of [[2, 8], [2, 7], [3, 8], [4, 9], [4, 8], [4, 7], [5, 10], [5, 9]]) v.set(x, y, 0, (x + y) % 2 ? C.leaf : C.leafD);
  return v;
}
function cupModel() {
  const v = new VoxelModel();
  // tea cup on a saucer, pivot at the bottom centre
  for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) { const r = Math.hypot(x + 0.5, z + 0.5); if (r <= 4) v.set(x, 0, z, r > 3.2 ? C.band : C.cupD); }
  for (let y = 1; y <= 5; y++)
    for (let x = -3; x <= 2; x++)
      for (let z = -3; z <= 2; z++) {
        const r = Math.hypot(x + 0.5, z + 0.5), R = y === 1 ? 2.2 : 2.9;
        if (r > R) continue;
        if (y === 5 && r < 2.2) { v.set(x, y, z, C.tea); continue; }
        v.set(x, y, z, y === 4 ? C.band : x === -3 && y > 1 ? C.white : C.cup);
      }
  v.set(3, 4, 0, C.cup); v.set(4, 3, 0, C.cup); v.set(4, 2, 0, C.cup); v.set(3, 2, 0, C.cup); // handle
  return v;
}

const cache = geoCache(() => {
  const G = {
    pelvis: buildGeo(pelvisModel()), torso: buildGeo(torsoModel()), head: buildGeo(headModel()),
    earL: buildGeo(browModel()), earR: buildGeo(mirrorX(browModel())), beard: buildGeo(beardModel(), [0, 0, 0]), jaw: buildGeo(jawModel()),
    upper: buildGeo(upperModel(), [0.5, 0, 0.5]), fore: buildGeo(foreModel(), [0.5, 0, 0.5]),
    thigh: buildGeo(thighModel(), [0.5, 0, 0.5]), shin: buildGeo(shinModel(), [0.5, 0, 0.5]), tail: buildGeo(tailModel(), [0, 0, 0]),
    staff: buildGeo(staffModel(), [0, 0, 0], FV), cup: buildGeo(cupModel(), [0, 0, 0], FV),
  };
  for (const k of HAND_KINDS) {
    G['hand_' + k + 'L'] = buildGeo(handModel(k, 1, C.skin, C.skinDD), [0, 0, 0], FV);
    G['hand_' + k + 'R'] = buildGeo(handModel(k, -1, C.skin, C.skinDD), [0, 0, 0], FV);
  }
  return G;
});

// ------------------------------------------------------------------ face
const FACE = {
  w: 36, h: 18, eyes: [{ x: 8.8, y: 9 }, { x: 27.2, y: 9 }], rx: 4.2, ry: 4.6, style: 'bead', lash: false,
  blush: [{ x: 3, y: 15 }, { x: 33, y: 15 }], blushW: 2,
  mw: 24, mh: 10, mx: 12, my: 2, mstyle: 'turtle', mHalf: 5,
  pal: { b: '#f6f4ee', i: '#6a4418', I: '#c8902a' },
};
const noTeeth = (P) => { for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) if (P.is(x, y, 'e')) P.set(x, y, 'M'); };
const EXPRS = {
  ...BASE_EXPRS,
  neutral: { eyes: 'open', brows: null, mouth: 'smile', blush: 0, tear: 0 },
  happy: { eyes: 'happy', brows: 'up', mouth: 'grin', blush: 1, tear: 0 },
  talk: { eyes: 'open', brows: 'up', mouth: 'open', blush: 0, tear: 0 },
  surprised: { eyes: 'wide', brows: 'raised', mouth: 'o', blush: 0, tear: 0 },
  sleepy: { eyes: 'sleepy', brows: null, mouth: 'flat', blush: 0, tear: 0 },
  smug: { eyes: 'happy', brows: 'flat', mouth: 'smile', blush: 1, tear: 0 },
  asleep: { eyes: 'sleep', brows: null, mouth: 'chew2', blush: 0, tear: 0 },
  laugh: { eyes: 'happy', brows: 'up', mouth: 'laugh', blush: 1, tear: 0 },
};
const JAW_OPEN = { open: 0.42, laugh: 0.55, yell: 0.6, grin: 0.18, o: 0.3, sip: 0.12, chew2: 0.14, chew1: 0.05 };
// eyebrow joint offsets per brow state: [lift (voxels), tilt (rad, + = outer end up)]
const BROW = { null: [0, 0], up: [0.5, 0.15], raised: [1.2, 0.35], angry: [-0.3, -0.35], worried: [0.4, -0.25], flat: [-0.15, 0] };

// ------------------------------------------------------------------ rig
const _w = new THREE.Vector3();
export class TurtleElder extends BipedRig {
  constructor({ shadows = true } = {}) {
    super('TurtleElder', { shadows });
    const G = (this._G = cache.get());
    this._geoCache = cache;
    this._buildBiped(G, D);
    this.jaw = new THREE.Group(); this.jaw.position.set(0, 1 * VS, -1.5 * VS); this.head.add(this.jaw);
    this.mesh(G.jaw, this.jaw, { z: 1.5 * VS });
    this._jaw = 0;
    this.joint('beard', this.jaw, 0, -0.6, 5.6);
    this.mesh(G.beard, this.beard);
    this.face = new NpcFace(FACE, { mouth: noTeeth });
    this.facePlane(this.face.eyes.tex, this.head, FACE.w, FACE.h, 0, 3.4, 5);
    // stick (left hand, planted) + tea cup (right hand, kept level)
    this.staff = this.mesh(G.staff, this.gripL);
    this._staffRest = new THREE.Quaternion().setFromEuler(new THREE.Euler(PI / 2, 0, 0));
    this.cup = this.mesh(G.cup, this.gripR);
    this.cup.scale.setScalar(1.4); // [v20 npc rigs] reads next to the big chibi head
    this._brow = [0, 0];
    this.zzz = [0, 1, 2].map(() => this.sprite(ZZZ_ROWS, 0.08, this.space));
    this.steam = [0, 1].map(() => this.sprite(PUFF_ROWS, 0.05, this.space));
    this.sparks = [0, 1, 2].map(() => this.sprite(SPARK_ROWS, 0.07, this.space));
    this.scalar('stick', 1);
    this.scalar('stickLean', 0.3);
    this.scalar('stickLift', 0);
    this.scalar('stickUp', 0); // 1 = held up, pointing at the sky
    this.scalar('stickWag', 0);
    this.scalar('cupTilt', 0);
    this.scalar('steam', 1);
    this.scalar('zzz', 0);
    this.scalar('spark', 0);
    this.jiggle('earL', 'rz', { k: 150, c: 6, ay: -0.03, ax: 0.02, max: 0.5, probe: 'head' });
    this.jiggle('earR', 'rz', { k: 150, c: 6, ay: 0.03, ax: 0.02, max: 0.5, probe: 'head' });
    this.jiggle('beard', 'rx', { k: 110, c: 5, az: 0.03, ay: 0.02, max: 0.6, probe: 'head' });
    this.jiggle('beard', 'rz', { k: 110, c: 5, ax: -0.03, max: 0.5, probe: 'head' });
    this.jiggle('chest', 's', { k: 200, c: 9, ay: 0.002, max: 0.05, probe: 'hips' });
    this.jiggle('tail', 'ry', { k: 140, c: 7, ax: 0.03, yaw: 0.02, max: 0.5, probe: 'hips' });
    this._init(ANIMS, EXPRS, 'idle');
  }
  _updateFace(dt, f, def) {
    super._updateFace(dt, f, def);
    const tgt = JAW_OPEN[this._fst.mouth] || 0;
    this._jaw += (tgt - this._jaw) * Math.min(1, dt * 28);
    this.jaw.rotation.x = this._jaw;
  }
  _post(p, dt) {
    this._setHands(p);
    const k = this.k;
    plantStick(this.staff, this.space, STAFF_L, [0.35, k.stickLean], clamp(k.stick, 0, 1), this._staffRest, k.stickLift);
    if (k.stickUp > 0.01) { _q.copy(this.staff.quaternion); orientIn(this.staff, this.space, [k.stickWag, 1, 0.15], [0, 0, 1], clamp(k.stickUp, 0, 1), _q); }
    const a = k.cupTilt;
    orientIn(this.cup, this.chest, [0, cos(a), -sin(a)], [0, sin(a), cos(a)]);
    this.cup.position.set(0.012, -0.03, 0.02);
    // bushy brows follow the face's brow state
    const E = this._EXPRS[this._userExpr || this._f.expr || this._cur.def.expr] || this._EXPRS.neutral;
    const bs = BROW[(this._userExpr ? E.brows : this._f.brows || E.brows) ?? 'null'] || BROW.null;
    const r = Math.min(1, dt * 14);
    this._brow[0] += (bs[0] - this._brow[0]) * r; this._brow[1] += (bs[1] - this._brow[1]) * r;
    this.earL.position.y += this._brow[0] * VS; this.earR.position.y += this._brow[0] * VS;
    this.earL.rotation.z += this._brow[1]; this.earR.rotation.z -= this._brow[1];
    // sprites
    const tz = this.time;
    this.headFx.updateWorldMatrix(true, false);
    _w.set(0, 7 * VS, 2 * VS); this.headFx.localToWorld(_w); this.space.worldToLocal(_w);
    this.zzz.forEach((s, i) => {
      const u = (tz * 0.4 + i / 3) % 1;
      s.visible = k.zzz > 0.5;
      s.position.set(_w.x + 0.1 + u * 0.14 + sin(u * 9) * 0.02, _w.y + u * 0.32, _w.z);
      s.scale.setScalar((0.04 + u * 0.06) * (u < 0.85 ? 1 : (1 - u) / 0.15));
    });
    this.cup.updateWorldMatrix(true, false);
    const cw = this.cup.localToWorld(_w2.set(0, 6 * FV, 0)); this.space.worldToLocal(cw);
    this.steam.forEach((s, i) => {
      const u = (tz * 0.5 + i * 0.5) % 1;
      s.visible = k.steam > 0.5;
      s.position.set(cw.x + sin(u * 6 + i * 2) * 0.025, cw.y + 0.02 + u * 0.16, cw.z);
      s.scale.setScalar(0.045 * (0.5 + u) * (u < 0.7 ? 1 : (1 - u) / 0.3));
    });
    const sp = k.spark;
    this.sparks.forEach((s, i) => {
      s.visible = sp > 0.05;
      const a2 = i * 2.1 + tz * 1.5;
      s.position.set(cos(a2) * 0.34, _w.y - 0.05 + sin(a2 * 1.3) * 0.14, sin(a2) * 0.1 + 0.15);
      s.scale.setScalar(0.07 * sin(clamp(sp, 0, 1) * PI) * (0.7 + 0.3 * sin(tz * 9 + i)));
    });
  }
}
const _w2 = new THREE.Vector3(), _q = new THREE.Quaternion();

// ------------------------------------------------------------------ pose helpers
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };
const _hp = [0, 0];
const ff = (t, d) => (t > d ? t % d : t);

/** Old hunched stance: soft knees, shell tipped forward a touch, head forward. */
function stand(p, rig, t, amt = 1) {
  rig.life(t, p, amt);
  rig.stance(p, 0.5, 0.6, 0.4, 0.12);
  p.chest.rx += 0.14; p.head.rx -= 0.16;
  p.tail.rx = -0.3;
}
/** Left hand on the planted stick. */
function stickHand(p, rig, dz = 0, dy = 0) {
  rig.reach(p, 1, 6.8, 3.0 + dy, 3.6 + dz, [0.7, -0.4, -1]);
  p.wristL.rx = 0.2; p.handL = 'fist';
}
/** Right hand holding the tea cup in front of the belly. */
function cupHand(p, rig, dx = 0, dy = 0, dz = 0) {
  rig.reach(p, -1, 3.4 + dx, 2.4 + dy, 6.2 + dz, [0.9, -0.5, -0.6]);
  p.wristR.rx = 0.4; p.handR = 'fist';
}
/** Head pulled into the shell by w (0 = out .. 1 = in). */
function retract(p, w) {
  p.head.y += RETRACT[0] * w; p.head.z += RETRACT[1] * w;
  p.head.rx += 0.12 * w;
}

// ------------------------------------------------------------------ animations
def('idle', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    stand(p, rig, t);
    const sway = sin(t * 0.6);
    p.hips.x = sway * 0.25; p.chest.rz = -sway * 0.03; p.head.rz = sin(t * 0.6 + 0.8) * 0.05;
    stickHand(p, rig);
    const T = t % 12;
    // strokes his beard (tea in hand), thinking
    const st = win(T, 1.2, 4.0, 0.4, 0.4);
    const ch = rig.headPoint(p, -1.2, 6.0, _hp);
    cupHand(p, rig, lerp(0, -1.6, st), lerp(0, ch[0] - 2.4 - 2.4 + sin(t * 5) * 0.4 * st, st), lerp(0, ch[1] - 6.2 + 1.2, st));
    p.k.cupTilt = 0;
    if (st > 0.5) { f.eyes = 'happy'; f.mouth = 'chew1'; }
    // nods off... and jerks awake
    const nod = K(T, [[0, 0], [6, 0], [7.4, 1, 'io'], [8.0, 1], [8.12, -0.25, 'out'], [8.5, 0, 'io']]);
    p.head.rx += nod * 0.35; retract(p, nod * 0.2);
    if (nod > 0.5 && T < 8.1) f.eyes = 'sleep';
    if (T > 8.1 && T < 8.8) f.expr = 'surprised';
    // glance at the willow
    p.head.ry = K(T, [[0, 0], [9.2, 0], [9.6, -0.4], [10.8, -0.4], [11.2, 0]]);
    f.look = [p.head.ry * 1.6, 0];
    if (beat(s, 'tap', t, 6, 4.5)) rig._emit('tap');
    p.k.stickLift = pulse(t % 6, 4.3, 0.25) * 0.025;
  },
});

def('walk', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    const ph = (t / 1.0) * TAU, sn = sin(ph), cs = cos(ph);
    rig.walk(p, ph, 0.36);
    p.hips.y = -0.7 + abs(cs) * 0.4;
    p.hips.rz = cs * 0.08; p.chest.rz = -cs * 0.04; p.hips.ry = -sn * 0.06;
    p.chest.rx = 0.2; p.head.rx = -0.2; p.head.z = 0.4 + abs(cs) * 0.3;
    // stick swings forward with the left foot, plants, then the body passes it
    stickHand(p, rig, 0.6 + sn * 1.0, sn * 0.3);
    p.k.stickLift = max(0, -sn) * 0.04; p.k.stickLean = 0.25 + sn * 0.7;
    cupHand(p, rig, 0, abs(cs) * 0.2);
    p.k.cupTilt = cs * 0.05;
    p.tail.rx = -0.3; p.tail.ry = sn * 0.25;
    stepEvents(s, ph, rig);
  },
});

def('wave', {
  loop: true, expr: 'happy',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.6);
    cupHand(p, rig);
    // raises the willow stick in greeting and gives it a little waggle
    const wv = sin(t * 5.5);
    rig.reach(p, 1, 7.8 + wv * 0.5, 11.4, 3.4, [1, -0.6, 0.2]);
    p.wristL.rz = wv * 0.25; p.wristL.rx = -0.4;
    p.handL = 'fist';
    p.k.stick = 0; p.k.stickUp = 1; p.k.stickWag = 0.55 + wv * 0.35;
    p.chest.rz += 0.05; p.head.rz -= 0.1 + sin(t * 2.75) * 0.05;
    p.head.z += 0.6;
    f.mouth = 'grin';
  },
});

def('talk', {
  loop: true, expr: 'talk',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.7);
    stickHand(p, rig);
    const on = talkMouth(t, f, { rate: 5, open: 'open', mid: 'o', shut: 'smile', o: 'grin', phrase: 3.6, pause: 0.8 });
    // storyteller: tea hand sweeps out ("long ago..."), points to the sky, back to the belly; slow wise nods
    const T = t % 7.2;
    const sweep = win(T, 0.3, 2.6, 0.5, 0.5), sky = win(T, 3.0, 4.6, 0.4, 0.4), rest = win(T, 5.0, 7.0, 0.3, 0.3);
    cupHand(p, rig, sweep * 3.6 + sky * 1.6 - rest * 0.4, sweep * 2.2 + sky * 4.6, sweep * -0.6 + sky * -1.6);
    p.k.cupTilt = 0;
    p.chest.ry = -sweep * 0.12;
    p.head.rx += (on ? sin(t * 2.5) * 0.06 : 0) - sky * 0.25;
    p.head.ry = sweep * -0.25 + sin(t * 0.7) * 0.08;
    p.head.z += 0.4;
    f.look = [sweep * -0.8, sky ? -0.8 * sky : 0];
    if (rest > 0.5) { f.eyes = 'happy'; f.brows = 'flat'; }
    if (sky > 0.5) f.brows = 'raised';
  },
});

def('laugh', {
  loop: true, expr: 'laugh',
  fn(t, p, f, s, rig) {
    const ha = sin(t * 9);
    stand(p, rig, t, 0.3);
    rig.stance(p, 0.5 + abs(ha) * 0.4, 0.6, 0.4, 0.12);
    stickHand(p, rig, 0, abs(ha) * 0.3);
    // "ho ho ho": shell bounces, head tips back, the tea held carefully away
    cupHand(p, rig, 1.6, 0.6, -0.6);
    p.k.cupTilt = ha * 0.06;
    p.chest.rx += -0.12 + ha * 0.04; p.head.rx += -0.35 + ha * 0.08;
    p.chest.s = 1 + abs(ha) * 0.04; p.mover.y += abs(ha) * 0.2;
    p.head.rz = sin(t * 1.8) * 0.1;
    p.head.z += 0.5;
    f.mouth = ha > -0.3 ? 'laugh' : 'open';
    if (beat(s, 'ho', t, TAU / 9, 0.1)) rig._emit('hoho');
  },
});

const HAPPY_DUR = 2.0;
def('happy', {
  dur: HAPPY_DUR, expr: 'happy', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, HAPPY_DUR);
    // a creaky little jig: hop left, hop right, stick waved overhead, brows bouncing
    const j1 = pulse(t, 0.25, 0.4), j2 = pulse(t, 0.8, 0.4), j3 = pulse(t, 1.35, 0.35);
    const hop = j1 + j2 + j3 * 0.7;
    stand(p, rig, t, 0.4);
    p.mover.y += hop * 2.0;
    if (hop > 0.15) {
      const side = j2 > 0.1 ? -1 : 1;
      p.mover.rz = side * 0.08 * hop;
      p['thigh' + (side > 0 ? 'R' : 'L')].rx = -0.7 * hop; p['shin' + (side > 0 ? 'R' : 'L')].rx = 1.1 * hop;
    }
    const up = win(t, 0.15, 1.8, 0.2, 0.3);
    rig.reach(p, 1, lerp(6.8, 6.4, up), lerp(3.0, 11.0, up) + sin(t * 10) * 0.6 * up, lerp(3.6, 2.8, up), [1, -0.6, 0.2]);
    p.handL = 'fist'; p.wristL.rx = -0.4 * up; p.wristL.rz = sin(t * 10) * 0.3 * up;
    p.k.stick = 1 - smooth(up * 2); p.k.stickUp = smooth(up * 2); p.k.stickWag = sin(t * 10) * 0.35;
    cupHand(p, rig, 1.2 * up, 1.4 * up, 0);
    p.k.cupTilt = sin(t * 12) * 0.06 * up;
    p.head.z += 0.8 * up; p.head.rx -= 0.15 * up;
    p.k.spark = clamp((t - 0.3) / 1.4, 0, 1) * (t < 1.8 ? 1 : 0);
    f.mouth = hop > 0.2 ? 'open' : 'grin';
    if (beat(s, 'a', t, 99, 0.65) || beat(s, 'b', t, 99, 1.2) || beat(s, 'c', t, 99, 1.7)) rig._emit('step');
  },
});

const SIP = 3.6;
def('sip_tea', {
  dur: SIP, expr: 'neutral', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, SIP);
    stand(p, rig, t, 0.5);
    stickHand(p, rig);
    // lift, blow on it (steam puffs away), slurp, "ahh"
    const lift = K(t, [[0, 0], [0.6, 1, 'io'], [2.5, 1], [3.1, 0, 'io']]);
    const blow = win(t, 0.65, 1.3, 0.1, 0.1), sip = win(t, 1.4, 2.3, 0.2, 0.2);
    const m = rig.headPoint(p, 1.2, 7.4, _hp);
    const r0 = [3.4, 2.4, 6.2];
    rig.reach(p, -1, lerp(r0[0], 1.4, lift), lerp(r0[1], m[0] - 3.4 - sip * 0.6, lift), lerp(r0[2], m[1] + 1.2 + blow * 0.6, lift), [1, -0.5, -0.4]);
    p.wristR.rx = 0.4 - lift * 0.4; p.handR = 'fist';
    p.k.cupTilt = sip * 0.55;
    p.head.rx -= sip * 0.2 - blow * 0.05;
    p.head.z += 0.6 * lift;
    p.k.steam = sip > 0.5 ? 0 : 1;
    if (blow > 0.3) { f.mouth = 'sip'; f.eyes = 'half'; }
    if (sip > 0.3) { f.mouth = 'sip'; f.eyes = 'happy'; }
    if (t > 2.35) { f.expr = 'smug'; f.mouth = t < 2.9 ? 'grin' : 'smile'; p.chest.s = 1 + pulse(t, 2.35, 0.5) * 0.05; }
    if (beat(s, 'sl', t, 99, 1.6)) rig._emit('slurp');
    if (beat(s, 'ah', t, 99, 2.4)) rig._emit('ahh');
  },
});

def('doze', {
  loop: true, expr: 'asleep',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.3);
    stickHand(p, rig, -0.4, -0.4);
    cupHand(p, rig, -0.4, -1.2, -0.6);
    p.k.cupTilt = 0;
    // the head slowly sinks into the shell; slow breaths, zzz
    const w = smooth(t / 2.6);
    const br = sin(t * 1.3);
    retract(p, w * (0.92 + br * 0.08));
    p.head.rx += 0.1 * w;
    p.chest.s = 1 + br * 0.03 * w; p.chest.rx += 0.05 * w;
    p.k.zzz = w > 0.8 ? 1 : 0;
    p.k.steam = 0;
    if (w < 0.5) f.expr = 'sleepy';
    f.blink = false;
    if (w > 0.8 && beat(s, 'sn', t, TAU / 1.3, 0.5)) rig._emit('snore');
  },
});

def('wake', {
  dur: 2.0, expr: 'surprised', next: 'idle',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.5);
    // POP! out of the shell with an overshoot, brows shoot up, the tea rattles on its saucer
    const out = K(t, [[0, 1], [0.08, 1], [0.24, -0.25, 'out'], [0.4, 0.06], [0.55, 0, 'io']]);
    retract(p, out);
    p.mover.y += pulse(t, 0.05, 0.3) * 1.0;
    p.chest.s = 1 + pulse(t, 0.06, 0.25) * 0.06;
    const rat = win(t, 0.1, 1.0, 0.05, 0.3);
    stickHand(p, rig, 0, sin(t * 40) * 0.2 * rat);
    cupHand(p, rig, sin(t * 47) * 0.3 * rat, 0.6 * rat, 0);
    p.k.cupTilt = sin(t * 43) * 0.12 * rat;
    p.head.ry = K(t, [[0.5, 0], [0.8, 0.35], [1.1, -0.35], [1.4, 0]]);
    f.look = [p.head.ry * 2, 0];
    if (t > 1.4) { f.expr = 'neutral'; if (t < 1.55) f.eyes = 'closed'; }
    if (beat(s, 'pop', t, 99, 0.1)) rig._emit('pop');
    if (beat(s, 'rat', t, 99, 0.2)) rig._emit('rattle');
  },
});

export { ANIMS as TURTLE_ANIMS };
