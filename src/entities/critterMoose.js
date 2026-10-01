// MooseCourier: the Moose Express mail moose on his bicycle. Postal cap,
// blue courier vest, a big leather mailbag, goofy wobbly antlers, long snout.
//
//   const m = new MooseCourier();  scene.add(m.root);
//   m.hold(makePackage('egg_crate'), 'basket');
//   m.play('ride');                       // m.speed = ground speed (units/s along the root's +Z):
//   root.position.addScaledVector(fwd, m.speed * dt)   // move the root by it so the wheels roll true
//   m.play('brake'); m.play('hop_off'); m.play('toss_package');
//   m.onEvent = (name, rig, data) => {}  // 'toss' {object, position, velocity} (world), 'ring', 'skid', 'stop', 'step', 'land'
//
// Units: 1 voxel = 0.05. Root at the feet (ground under the bike), facing +Z.
// ~1.75 tall on the bike. Dismounted he stands at x = +0.55 beside the parked bike.
import * as THREE from 'three';
import {
  VS, FV, VoxelModel, rbox, ell, tone, buildGeo, geoCache, mirrorX, handModel, K, pulse, beat, win,
  sin, cos, abs, max, min, PI, TAU, clamp, lerp, smooth, SPARK_ROWS,
} from './critterKit.js';
import { CritterFace, BASE_EXPRS } from './critterFaces.js';
import { BipedRig, HAND_KINDS } from './critterBiped.js';
import { makeBicycle, BIKE } from './critterBike.js';

const C = {
  fur: 0x7a4a2a, furD: 0x603820, furL: 0x8e5a34, furDD: 0x4a2a18,
  muz: 0xa87850, muzD: 0x8e6240, muzL: 0xbe8e60, nostril: 0x2a1a16,
  leg: 0xc8b090, legD: 0xa8906e, hoof: 0x2e2422, hoofL: 0x4a3c38,
  ant: 0xeedcae, antD: 0xcdb486, antL: 0xfaf0d2,
  cap: 0x26325e, capD: 0x1a2244, capL: 0x3a4a80, band: 0xffd22e, badge: 0xe0402e,
  vest: 0x2f62c8, vestD: 0x244ea8, vestL: 0x4a80e0, stripe: 0xfff070, stripeD: 0xe8c840,
  shirt: 0xa8d0f0, shirtD: 0x86b0d8, shorts: 0x34405e, shortsD: 0x262f48,
  bag: 0x8a5a30, bagD: 0x6a4020, bagL: 0xa8743e, buckle: 0xffd040, letter: 0xfaf6ea, red: 0xe0402e,
  earIn: 0xd89a84,
};

const D = {
  HIP_Y: 12, WAIST: 1, NECK: 7.2, NECK_Z: 0.8, SH: [5.6, 6, 0], L_UP: 4.4, L_FORE: 3.8, L_HAND: 2.2,
  THIGH: 6, SHIN: 6, LEG_X: 2.4, EAR: [4.8, 6.4, -2.2], TAIL: [0.2, -3.2],
};
const V = (u) => u / VS; // world -> voxels
const SEAT_HY = V(BIKE.seatY + 0.05) + 2 - D.HIP_Y; // hips offset when seated
const SEAT_HZ = V(BIKE.seatZ) + 0.2;
/** Where he stands when dismounted (bike space, world units). */
export const MOOSE_STAND_X = 0.55;
const STAND_X = V(MOOSE_STAND_X);

// ------------------------------------------------------------------ models
function pelvisModel() {
  const v = new VoxelModel();
  rbox(v, -5, 4, -2, 0, -3, 2, 1.4, (x, y, z) => (y === 0 ? C.shortsD : tone(x, y, z, C.shorts, C.shortsD, C.shorts)));
  return v;
}
function torsoModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    const fx = x + 0.5;
    if (z >= 2 && abs(fx) <= 1.2 && y >= 3) return tone(x, y, z, C.shirt, C.shirtD, C.shirt); // shirt in the vest opening
    if (y === 2) return (x + z) % 4 === 0 ? C.stripeD : C.stripe; // reflective band
    if (y <= -1) return C.vestD;
    return tone(x, y, z, C.vest, C.vestD, C.vestL, 0.14, 0.1);
  };
  rbox(v, -5, 4, -1, 7, -3, 2, 1.8, col);
  rbox(v, -4, 3, -1, 5, -1, 3, 2.0, col); // belly
  // neck fur
  rbox(v, -2, 1, 6, 10, -2, 2, 1.0, (x, y, z) => tone(x, y, z, C.fur, C.furD, C.furL));
  // shoulders: shirt
  for (const sx of [-5, 4]) for (let y = 5; y <= 7; y++) for (let z = -2; z <= 1; z++) if (v.has(sx, y, z)) v.set(sx, y, z, C.shirt);
  // Moose Express badge (left chest): yellow square with a red envelope
  for (let x = 2; x <= 3; x++) for (let y = 4; y <= 5; y++) v.set(x, y, 4, C.band);
  v.set(2, 4, 5, C.red); v.set(3, 4, 5, C.red);
  // mailbag strap: right shoulder (-x) to left hip (+x), front and back
  for (let y = -1; y <= 7; y++) {
    const x = Math.round(-3.5 + ((7 - y) / 8) * 7);
    for (const z of [3, -4]) { v.set(x, y, z + (y >= 3 && z > 0 ? 1 : 0), C.bagD); v.set(x + 1, y, z + (y >= 3 && z > 0 ? 1 : 0), C.bag); }
  }
  for (let z = -3; z <= 2; z++) { v.set(-5, 7, z, C.bagD); }
  return v;
}
function headModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => (y >= 7 && z <= -1 ? tone(x, y, z, C.furD, C.furDD, C.fur) : tone(x, y, z, C.fur, C.furD, C.furL));
  rbox(v, -5, 4, 0, 8, -4, 2, 2.6, col);
  // long droopy snout + bulbous nose
  const mc = (x, y, z) => tone(x, y, z, C.muz, C.muzD, C.muzL, 0.1, 0.06);
  rbox(v, -3, 2, -1, 4, 2, 8, 1.6, (x, y, z) => (y >= 4 && z <= 4 ? col(x, y, z) : mc(x, y, z)));
  ell(v, 0, 2.2, 8.4, 3.6, 2.8, 2.4, mc);
  // nostrils
  for (const x of [-3, 2]) { v.set(x, 2, 10, C.nostril); v.set(x, 3, 10, C.nostril); }
  v.set(-2, 4, 10, C.muzL); v.set(1, 4, 10, C.muzL);
  // floppy dewlap ("bell") under the chin
  for (let y = -3; y <= -1; y++) for (let x = -1; x <= 0; x++) v.set(x, y, 3 - (y === -3 ? 1 : 0), tone(x, y, 3, C.furD, C.furDD, C.fur));
  return v;
}
function earModel() {
  const v = new VoxelModel();
  const rows = [[0, 1], [-1, 1], [-1, 2], [0, 1]];
  rows.forEach(([a, b], x) => {
    for (let y = a; y <= b; y++) for (let z = -1; z <= 0; z++) v.set(x, y, z, z === 0 && x >= 1 && x <= 2 && y > a ? C.earIn : tone(x, y, z, C.fur, C.furD, C.furL));
  });
  return v;
}
// Palmate antler (left): short stalk out to +x, then a broad cupped paddle with stubby rounded tines.
function antlerModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => tone(x, y, z, C.ant, C.antD, C.antL, 0.14, 0.12);
  for (let x = 0; x <= 2; x++) for (let y = 0; y <= 1; y++) for (let z = -1; z <= 0; z++) v.set(x, y, z, col(x, y, z));
  // paddle (ellipse in the XY plane, 2 thick at the base, 1 thick at the rim)
  for (let x = 1; x <= 9; x++)
    for (let y = 0; y <= 6; y++) {
      const dx = (x - 5.2) / 4.4, dy = (y - 3.0) / 3.2;
      const r = dx * dx + dy * dy;
      if (r > 1) continue;
      v.set(x, y, -1, col(x, y, -1));
      if (r < 0.45) v.set(x, y, 0, col(x, y, 0));
    }
  // stubby tines along the top / outer edge
  for (const [x, y] of [[3, 6], [5, 7], [7, 7], [9, 5], [10, 3]]) { v.set(x, y, -1, C.antL); if (y >= 6) v.set(x, y - 1, -1, col(x, y, 1)); }
  v.set(1, 2, -1, C.antL); v.set(1, 3, -1, C.antL); // brow tine
  return v;
}
function capModel() {
  const v = new VoxelModel();
  for (let x = -4; x <= 3; x++)
    for (let z = -4; z <= 3; z++) {
      const r = Math.hypot(x + 0.5, z + 0.5);
      if (r > 4.3) continue;
      v.set(x, 0, z, C.band);
      v.set(x, 1, z, tone(x, 1, z, C.cap, C.capD, C.cap));
      if (r <= 4.0) v.set(x, 2, z, r > 3.3 ? C.capL : C.cap);
      if (r <= 3.2) v.set(x, 3, z, C.cap);
    }
  // badge + visor
  v.set(-1, 1, 4, C.band); v.set(0, 1, 4, C.band); v.set(-1, 2, 4, C.badge); v.set(0, 2, 4, C.band);
  for (let x = -3; x <= 2; x++) for (let z = 4; z <= 6; z++) if (!(z === 6 && (x === -3 || x === 2))) v.set(x, 0, z, z === 6 ? C.capD : C.capL);
  return v;
}
function upperModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_UP, 0, -1, 1, 1.0, (x, y, z) => (y >= -2 ? (y === -2 ? C.shirtD : tone(x, y, z, C.shirt, C.shirtD, C.shirt)) : tone(x, y, z, C.fur, C.furD, C.furL)));
  return v;
}
function foreModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_FORE - 1, 0, -1, 1, 1.2, (x, y, z) => tone(x, y, z, C.fur, C.furD, C.furL));
  return v;
}
function thighModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.THIGH, 1, -1, 1, 1.0, (x, y, z) => (y >= -2 ? (y === -2 ? C.shortsD : C.shorts) : tone(x, y, z, C.fur, C.furD, C.furL)));
  return v;
}
function shinModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.SHIN + 1, 0, -1, 1, 1.1, (x, y, z) => tone(x, y, z, y < -2 ? C.leg : C.fur, y < -2 ? C.legD : C.furD, y < -2 ? C.leg : C.furL));
  rbox(v, -1, 1, -D.SHIN, -D.SHIN + 1, -1, 2, 0.6, (x, y, z) => (z === 2 && y === -D.SHIN + 1 ? C.hoofL : C.hoof));
  v.set(-1, -D.SHIN, 2, null); // split hoof
  return v;
}
function tailModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -1, 0, -2, 0, 0.8, (x, y, z) => tone(x, y, z, C.furD, C.furDD, C.fur));
  return v;
}
// Leather mailbag (pivot at the strap ring, hangs down on the left hip).
function bagModel() {
  const v = new VoxelModel();
  rbox(v, 0, 2, -6, 0, -4, 2, 1.0, (x, y, z) => tone(x, y, z, C.bag, C.bagD, C.bagL, 0.14, 0.1));
  // flap
  for (let y = -3; y <= 0; y++) for (let z = -4; z <= 2; z++) v.set(3, y, z, y === -3 ? C.bagD : tone(3, y, z, C.bagL, C.bag, C.bagL));
  v.set(3, -3, -1, C.buckle); v.set(3, -3, 0, C.buckle); v.set(3, -4, -1, C.bagD); v.set(3, -4, 0, C.bagD);
  // letters peeking out
  for (let z = -3; z <= -1; z++) v.set(1, 1, z, C.letter);
  v.set(1, 2, -2, C.letter); v.set(2, 1, 2, C.letter); v.set(1, 1, 2, C.red);
  return v;
}

const cache = geoCache(() => {
  const G = {
    pelvis: buildGeo(pelvisModel()), torso: buildGeo(torsoModel()), head: buildGeo(headModel()),
    earL: buildGeo(earModel()), earR: buildGeo(mirrorX(earModel())),
    antL: buildGeo(antlerModel()), antR: buildGeo(mirrorX(antlerModel())), cap: buildGeo(capModel()),
    upper: buildGeo(upperModel(), [0.5, 0, 0.5]), fore: buildGeo(foreModel(), [0.5, 0, 0.5]),
    thigh: buildGeo(thighModel(), [0.5, 0, 0.5]), shin: buildGeo(shinModel(), [0.5, 0, 0.5]), tail: buildGeo(tailModel(), [0.5, 0, 0.5]),
    bag: buildGeo(bagModel(), [0, 0, 0]),
  };
  for (const k of HAND_KINDS) {
    G['hand_' + k + 'L'] = buildGeo(handModel(k, 1, C.furD, C.furDD), [0, 0, 0], FV);
    G['hand_' + k + 'R'] = buildGeo(handModel(k, -1, C.furD, C.furDD), [0, 0, 0], FV);
  }
  return G;
});

// ------------------------------------------------------------------ face
const FACE = {
  w: 40, h: 18, eyes: [{ x: 12, y: 9 }, { x: 28, y: 9 }], rx: 5, ry: 5.8, style: 'toon',
  blush: [{ x: 4, y: 14 }, { x: 36, y: 14 }], blushW: 3,
  mw: 28, mh: 10, mx: 14, my: 2, mstyle: 'moose', mHalf: 6,
  pal: { f: '#7a4a2a', F: '#4a2a18', b: '#4a2a18' },
};
const EXPRS = {
  ...BASE_EXPRS,
  neutral: { eyes: 'open', brows: null, mouth: 'smile', blush: 0, tear: 0 },
  goofy: { eyes: 'half', brows: 'up', mouth: 'grin', blush: 1, tear: 0 },
  determined: { eyes: 'focused', brows: 'angry', mouth: 'grin', blush: 0, tear: 0 },
};

// ------------------------------------------------------------------ rig
export class MooseCourier extends BipedRig {
  constructor({ shadows = true } = {}) {
    super('MooseCourier', { shadows });
    const G = (this._G = cache.get());
    this._geoCache = cache;
    // the bike (separate part)
    this.joint('bikeJ', this.root);
    this.bike = makeBicycle({ shadows });
    this.bikeJ.add(this.bike.group);
    this._buildBiped(G, D);
    this.joint('cap', this.head, 0, 8.6, -1.2);
    this.mesh(G.cap, this.cap);
    this.joint('antL', this.head, 3.6, 8.0, -1.4); this.mesh(G.antL, this.antL);
    this.joint('antR', this.head, -3.6, 8.0, -1.4); this.mesh(G.antR, this.antR);
    this.joint('bag', this.hips, 5, 1.6, -2.4); this.mesh(G.bag, this.bag);
    this.face = new CritterFace(FACE);
    this.facePlane(this.face.eyes.tex, this.head, FACE.w, FACE.h, 0, 9.0 - FACE.h / 8, 3);
    this.facePlane(this.face.mouth.tex, this.head, FACE.mw, FACE.mh, 0, 1.6 - FACE.mh / 8, 10.8);
    this.sparks = [0, 1].map(() => this.sprite(SPARK_ROWS, 0.08, this.root));
    // state
    this.mounted = true;
    this.speed = 0; // ground speed along the root's +Z (units/s); move the root by this
    this._crank = PI / 2; this._wheelF = 0; this._wheelR = 0; this._bellT = 9;
    this._held = null; this._heldWhere = null;
    this.scalar('speed', 0);
    this.scalar('pedal', 0); // 1 = crank driven by the wheels
    this.scalar('lockRear', 0);
    this.scalar('kick', 0); // 1 = kickstand down
    this.scalar('spark', 0);
    // jiggles: wobbly goofy antlers, ears, bag, cap
    this.jiggle('antL', 'rz', { k: 120, c: 6, ay: -0.03, ax: 0.02, max: 0.5, probe: 'head' });
    this.jiggle('antR', 'rz', { k: 110, c: 6, ay: 0.03, ax: 0.02, max: 0.5, probe: 'head' });
    this.jiggle('antL', 'rx', { k: 120, c: 7, az: 0.02, max: 0.4, probe: 'head' });
    this.jiggle('antR', 'rx', { k: 130, c: 7, az: 0.02, max: 0.4, probe: 'head' });
    this.jiggle('earL', 'rz', { k: 180, c: 9, ay: -0.03, max: 0.6, probe: 'head' });
    this.jiggle('earR', 'rz', { k: 180, c: 9, ay: 0.03, max: 0.6, probe: 'head' });
    this.jiggle('bag', 'rx', { k: 90, c: 6, az: 0.03, ay: 0.01, max: 0.7, probe: 'hips' });
    this.jiggle('bag', 'rz', { k: 90, c: 6, ax: -0.03, ay: 0.015, max: 0.5, probe: 'hips' });
    this.jiggle('cap', 'rx', { k: 260, c: 12, az: -0.01, ay: 0.006, max: 0.3, probe: 'head' });
    this.jiggle('head', 's', { k: 260, c: 10, ay: 0.002, max: 0.08, probe: 'chest' });
    this._init(ANIMS, EXPRS, 'idle_bike');
  }

  /** Put an Object3D in the basket ('basket') or the right hand ('hand'); null clears. */
  hold(obj, where = this.mounted ? 'basket' : 'hand') {
    if (this._held && this._held.parent) this._held.parent.remove(this._held);
    this._held = obj || null;
    this._heldWhere = obj ? where : null;
    if (obj) {
      obj.position.set(0, 0, 0); obj.rotation.set(0, 0, 0);
      if (where === 'basket') this.bike.basketSlot.add(obj);
      else { this.gripR.add(obj); obj.position.set(0, -0.06, 0.02); }
    }
    return this;
  }
  get held() { return this._held; }

  dispose() {
    this.bike.dispose();
    super.dispose();
  }

  _post(p, dt) {
    this._setHands(p);
    const k = this.k;
    this.speed = k.speed;
    const b = this.bike;
    // wheels roll exactly with the ground speed (the game moves the root by this.speed)
    const w = (k.speed / BIKE.R) * dt;
    this._wheelF += w;
    if (k.lockRear < 0.5) this._wheelR += w;
    b.frontWheel.rotation.x = this._wheelF;
    b.rearWheel.rotation.x = this._wheelR;
    b.crank.rotation.x = this._crank;
    b.pedalL.rotation.x = b.pedalR.rotation.x = -this._crank;
    if (k.pedal > 0.5) this._crank += (w / BIKE.gear) * clamp(k.pedal, 0, 1.6);
    else {
      // coasting: settle the pedals level
      const tgt = Math.round((this._crank - PI / 2) / PI) * PI + PI / 2;
      this._crank += (tgt - this._crank) * Math.min(1, dt * 5);
    }
    b.kick.rotation.x = lerp(-1.4, 0.15, k.kick);
    // bell shake
    this._bellT += dt;
    b.bell.rotation.z = Math.sin(this._bellT * 60) * 0.25 * Math.max(0, 1 - this._bellT * 4);
    // sparkle (thumbs up)
    const sp = k.spark;
    this.sparks.forEach((s, i) => {
      s.visible = sp > 0.05;
      this.gripR.getWorldPosition(s.position);
      this.root.worldToLocal(s.position);
      s.position.y += 0.12 + i * 0.08; s.position.x += (i ? 0.08 : -0.06);
      s.scale.setScalar(0.08 * sin(clamp(sp, 0, 1) * PI) * (i ? 0.7 : 1));
    });
  }
  _ring() { this._bellT = 0; this._emit('ring'); }
  _toss() {
    const o = this._held;
    const pos = new THREE.Vector3(), q = new THREE.Quaternion();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(q));
    const vel = fwd.clone().multiplyScalar(2.1 + this.speed).add(new THREE.Vector3(0, 2.6, 0));
    this.gripR.getWorldPosition(pos);
    if (o) {
      o.updateWorldMatrix(true, false);
      o.getWorldPosition(pos);
      const wq = o.getWorldQuaternion(new THREE.Quaternion());
      if (o.parent) o.parent.remove(o);
      o.position.copy(pos); o.quaternion.copy(wq);
      this._held = null; this._heldWhere = null;
    }
    this._emit('toss', { object: o, position: pos.clone(), velocity: vel });
  }
}

// ------------------------------------------------------------------ pose helpers
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };
const _c = [0, 0];

/** Pedal (or ground) foot targets + hands on the grips. */
function onBike(p, rig, t, { lean = 0.32, footDown = 0, handsL = 1, handsR = 1, stand = 0 } = {}) {
  p.hips.y = SEAT_HY + stand * 2.2; p.hips.z = SEAT_HZ + stand * 2.6;
  p.hips.rx = 0.14 + stand * 0.25; p.chest.rx = lean - 0.14 + stand * 0.1;
  p.head.rx = -(lean + stand * 0.3) * 0.85; p.head.z = 0.3;
  const a = rig._crank;
  const cy = V(BIKE.crankY), cz = V(BIKE.crankZ), r = V(BIKE.crankR);
  const pl = [cy + r * cos(a) + 0.6, cz + r * sin(a)], pr = [cy - r * cos(a) + 0.6, cz - r * sin(a)];
  // left foot may go down to the ground beside the bike
  const fy = lerp(pl[0], 0.0 + 0.0, footDown), fz = lerp(pl[1], 2.6, footDown);
  rig.legTo(p, 1, fy, fz);
  rig.legTo(p, -1, pr[0], pr[1]);
  p.thighL.rz = 0.12 + footDown * 0.32; p.thighR.rz = -0.12;
  p.shinL.rz = -footDown * 0.2;
  // hands on the grips
  for (const [side, w] of [[1, handsL], [-1, handsR]]) {
    if (w <= 0) continue;
    rig.toChest(p, V(BIKE.gripY) + 1.0, V(BIKE.gripZ) - 0.4, _c);
    rig.reach(p, side, V(BIKE.gripX) - 0.3, _c[0], _c[1], [1, -0.2, -0.8], w);
    p['wrist' + (side > 0 ? 'L' : 'R')].rx = -0.6 * w;
    p['hand' + (side > 0 ? 'L' : 'R')] = 'fist';
  }
}
/** Pedalling motion on top of onBike. */
function pedalSway(p, rig, t, amt = 1) {
  const a = rig._crank;
  p.hips.rz += sin(a) * 0.05 * amt; p.chest.rz -= sin(a) * 0.04 * amt;
  p.head.rz += sin(a) * 0.03 * amt;
  p.chest.y += abs(cos(a)) * 0.15 * amt;
  p.bikeJ.rz = sin(a) * 0.03 * amt + sin(t * 0.9) * 0.025; // wobble
  p.mover.rz = p.bikeJ.rz;
  // steering wobble lives on the bike group (handled in _post via p.k? keep it in the pose)
}
/** Standing beside the parked bike. */
function standing(p, rig, t, amt = 1) {
  p.mover.x = STAND_X;
  rig.life(t, p, amt);
  rig.stance(p, 0, 0.6, 0.6);
  rig.armsDown(p, 0.14);
  p.k.kick = 1;
  p.bikeJ.rz = 0.1;
}
/** Base pose for the current state (mounted / stopped / standing) used by gestures. */
function base(p, rig, t, s, hands = {}) {
  if (!rig.mounted) { standing(p, rig, t); return; }
  const moving = s.v > 0.1;
  p.k.speed = s.v; p.k.pedal = moving ? 1 : 0;
  onBike(p, rig, t, { footDown: moving ? 0 : 1, handsL: hands.L ?? 1, handsR: hands.R ?? 1 });
  if (moving) pedalSway(p, rig, t);
  else { p.bikeJ.rz = 0.07; p.mover.rz = 0.07; rig.life(t, p, 0.6); }
}
const backToBase = (rig) => (rig.mounted ? (rig.speed > 0.1 ? 'ride' : 'idle_bike') : 'idle');
const keepSpeed = (s, rig) => { s.v = rig.mounted ? rig.speed : 0; };

// ------------------------------------------------------------------ animations
def('idle_bike', {
  loop: true, expr: 'neutral',
  enter(s, rig) { rig.mounted = true; s.v = 0; },
  fn(t, p, f, s, rig) {
    base(p, rig, t, s);
    p.head.ry = K(t % 7, [[0, 0], [2.5, 0], [2.8, 0.45], [4, 0.45], [4.3, -0.2], [5.4, -0.2], [5.7, 0]]);
    f.look = [p.head.ry * 1.4, 0];
  },
});

def('ride', {
  loop: true, expr: 'neutral',
  enter(s, rig) { rig.mounted = true; s.v0 = rig.speed; },
  fn(t, p, f, s, rig) {
    const v = lerp(s.v0, 1.3, smooth(t / 0.8));
    p.k.speed = v; p.k.pedal = 1;
    onBike(p, rig, t);
    pedalSway(p, rig, t);
    p.head.ry = sin(t * 0.6) * 0.15;
    p.earL.rx = p.earR.rx = 0.25; // ears back in the wind
    if ((t % 6) > 4.2) f.mouth = 'grin';
  },
});

def('ring_bell', {
  dur: 1.25, expr: 'happy', next: backToBase,
  enter(s, rig) { keepSpeed(s, rig); },
  fn(t, p, f, s, rig) {
    base(p, rig, t, s);
    // left thumb flicks the bell twice
    const flick = pulse(t, 0.2, 0.16) + pulse(t, 0.55, 0.16);
    p.wristL.rz += flick * 0.4; p.wristL.ry = flick * 0.3;
    p.handL = 'thumb';
    p.head.rz += sin(t * 9) * 0.06; p.head.rx -= 0.08;
    p.chest.s = 1 + flick * 0.03;
    if (beat(s, 'r1', t, 99, 0.24) || beat(s, 'r2', t, 99, 0.6)) rig._ring();
    f.mouth = 'open';
  },
});

def('brake', {
  dur: 1.5, expr: 'surprised', next: 'idle_bike',
  enter(s, rig) { rig.mounted = true; s.v0 = Math.max(rig.speed, 0.2); },
  fn(t, p, f, s, rig) {
    const v = s.v0 * (1 - smooth(clamp(t / 0.75, 0, 1) ** 0.8));
    p.k.speed = v; p.k.pedal = 0;
    p.k.lockRear = t < 0.8 ? 1 : 0;
    const foot = smooth((t - 0.7) / 0.35);
    onBike(p, rig, t, { lean: 0.32, footDown: foot });
    // skid: rear swings out, bike + rider lean, nose dips, then rock back
    const skid = K(t, [[0, 0], [0.45, 1, 'out'], [0.8, 0.85], [1.2, 0.6, 'io']]);
    p.bikeJ.ry = 0.32 * skid; p.mover.ry = p.bikeJ.ry;
    const roll = K(t, [[0, 0], [0.35, -0.14, 'out'], [0.8, -0.06], [1.1, 0.07, 'io']]);
    p.bikeJ.rz = roll; p.mover.rz = roll;
    const dive = pulse(t, 0.55, 0.45);
    p.bikeJ.rx = dive * 0.05; p.mover.rx = p.bikeJ.rx;
    p.chest.rx += dive * 0.35 - pulse(t, 0.95, 0.4) * 0.15;
    p.head.rx += dive * 0.25;
    p.cap.rx = -dive * 0.4; p.cap.z = dive * 0.6;
    if (t > 0.9) f.expr = 'goofy';
    if (beat(s, 'sk', t, 99, 0.05)) rig._emit('skid');
    if (beat(s, 'st', t, 99, 0.95)) rig._emit('stop');
  },
});

function hopPose(p, rig, t, w) {
  // w: 0 = on the (stopped) bike, 1 = standing beside it; a little hop in between
  rig.mixPose(p, w, (q) => { q.k.kick = 0; onBike(q, rig, t, { footDown: 1 }); q.bikeJ.rz = 0.07; q.mover.rz = 0.07; }, (q) => standing(q, rig, t, 0.4));
  const hop = sin(clamp(w, 0, 1) * PI);
  p.mover.y += hop * 2.4;
  p.thighR.rx -= hop * 1.1; p.shinR.rx += hop * 1.4; // swing the right leg over
  p.thighR.rz -= hop * 0.3;
  p.chest.rx += hop * 0.15;
  p.k.kick = smooth(w * 1.4);
}
def('hop_off', {
  dur: 1.4, expr: 'happy', next: 'idle',
  enter(s, rig) { rig.mounted = true; },
  exit(s, rig) { rig.mounted = false; },
  fn(t, p, f, s, rig) {
    const w = K(t, [[0, 0], [0.25, 0], [0.95, 1, 'io']]);
    hopPose(p, rig, t, w);
    p.mover.ry = -0.25 * sin(w * PI);
    if (beat(s, 'l', t, 99, 0.95)) rig._emit('land');
    if (t > 1.0) rig.mounted = false;
    f.mouth = w > 0.3 && w < 0.9 ? 'open' : 'grin';
  },
});
def('hop_on', {
  dur: 1.4, expr: 'happy', next: 'idle_bike',
  enter(s, rig) { rig.mounted = false; },
  exit(s, rig) { rig.mounted = true; },
  fn(t, p, f, s, rig) {
    const w = 1 - K(t, [[0, 0], [0.2, 0], [0.95, 1, 'io']]);
    hopPose(p, rig, t, w);
    p.mover.ry = 0.25 * sin(w * PI);
    if (beat(s, 'l', t, 99, 0.95)) rig._emit('land');
    if (t > 1.0) rig.mounted = true;
    f.mouth = w > 0.1 && w < 0.7 ? 'open' : 'grin';
  },
});

def('idle', {
  loop: true, expr: 'neutral',
  enter(s, rig) { rig.mounted = false; },
  fn(t, p, f, s, rig) {
    standing(p, rig, t);
    p.hips.x = sin(t * 0.7) * 0.3; p.chest.rz = -sin(t * 0.7) * 0.03;
    p.head.ry = K(t % 8, [[0, 0], [3, 0], [3.3, -0.5], [4.8, -0.5], [5.1, 0]]); // glance at the bike
    f.look = [p.head.ry * 1.4, 0];
    // hand resting on the mailbag
    rig.reach(p, 1, 6.6, -1.6, 1.2, [1, 0, -1]); p.handL = 'relax';
  },
});

def('wave', {
  loop: true, expr: 'happy',
  enter(s, rig) { keepSpeed(s, rig); },
  fn(t, p, f, s, rig) {
    base(p, rig, t, s, { R: 0 });
    const wv = sin(t * 9);
    rig.reach(p, -1, 7.2 + wv * 1.2, 12.2, 1.4, [1, -0.6, -0.4]);
    p.wristR.rz = -wv * 0.35; p.handR = 'open';
    p.head.rz += 0.1 + sin(t * 4.5) * 0.05; p.chest.rz -= 0.05;
    f.mouth = 'grin';
  },
});

def('thumbs_up', {
  dur: 1.8, expr: 'goofy', next: backToBase,
  enter(s, rig) { keepSpeed(s, rig); },
  fn(t, p, f, s, rig) {
    base(p, rig, t, s, { R: 0 });
    const up = K(t, [[0, 0], [0.3, 1, 'back'], [1.4, 1], [1.75, 0]]);
    const pump = pulse(t, 0.35, 0.18) * 0.8;
    rig.reach(p, -1, lerp(5.8, 3.4, up), lerp(-2, 4.2, up) + pump, lerp(1, 7.6, up), [1, -1, -0.2]);
    p.wristR.rx = -0.2 * up;
    p.handR = up > 0.3 ? 'thumb' : 'relax';
    p.head.rz += 0.14 * up; p.head.rx -= 0.05 * up;
    p.k.spark = clamp((t - 0.3) / 0.6, 0, 1) * (t < 1.4 ? 1 : 0);
    f.mouth = 'grin';
    if (t > 0.3 && t < 1.4) f.eyes = (t % 1) < 0.7 ? 'happy' : null;
  },
});

def('toss_package', {
  dur: 1.9, expr: 'determined', next: backToBase,
  enter(s, rig) { keepSpeed(s, rig); s.fromBasket = rig._heldWhere === 'basket'; s.grabbed = !s.fromBasket; },
  fn(t, p, f, s, rig) {
    base(p, rig, t, s, { R: 0 });
    // 1) grab from the basket  2) wind up low  3) underhand toss forward and up
    const reach = s.fromBasket ? K(t, [[0, 0], [0.35, 1, 'io'], [0.5, 1], [0.75, 0, 'io']]) : 0;
    const wind = K(t, [[0.45, 0], [0.85, 1, 'io'], [1.0, 1], [1.12, -1, 'in'], [1.35, -0.8], [1.8, 0, 'io']]);
    // basket in chest space
    let bx = 0.6, by = 4, bz = 8;
    if (rig.mounted) { rig.toChest(p, V(BIKE.basketY) + 3.2, V(BIKE.basketZ) - 0.5, _c); bx = 0.8; by = _c[0]; bz = _c[1]; }
    else { rig.toChest(p, V(BIKE.basketY) + 3.2, V(BIKE.basketZ), _c); bx = STAND_X - 0.6; by = _c[0]; bz = _c[1]; }
    // wind (1 = back low, -1 = forward high)
    const wx = 5.2, wy = lerp(0.5, wind > 0 ? -1.8 : 9.5, abs(wind)), wz = lerp(4, wind > 0 ? -4.2 : 8.4, abs(wind));
    rig.reach(p, -1, lerp(wx, bx, reach), lerp(wy, by, reach), lerp(wz, bz, reach), [1, -0.5, -0.6]);
    p.handR = reach > 0.6 ? 'open' : 'fist';
    p.chest.ry = -wind * 0.18; p.chest.rx += max(0, wind) * 0.12 + reach * 0.15;
    p.head.rx -= max(0, -wind) * 0.15;
    if (t > 0.42 && !s.grabbed) {
      s.grabbed = true;
      const o = rig._held;
      if (o) { if (o.parent) o.parent.remove(o); rig.gripR.add(o); o.position.set(0, -0.08, 0.02); o.rotation.set(0, 0, 0); rig._heldWhere = 'hand'; }
    }
    if (beat(s, 'rel', t, 99, 1.11)) rig._toss();
    f.mouth = t > 1.0 && t < 1.5 ? 'open' : t > 1.5 ? 'grin' : 'flat';
    if (t > 1.5) f.expr = 'happy';
  },
});

def('ride_away', {
  loop: true, expr: 'determined',
  enter(s, rig) { rig.mounted = true; s.v0 = rig.speed; },
  fn(t, p, f, s, rig) {
    const v = lerp(s.v0, 2.1, smooth(t / 1.4));
    p.k.speed = v; p.k.pedal = 1.25;
    const st = 1 - smooth((t - 0.6) / 0.5); // stand on the pedals to push off
    const wave = win(t, 0.9, 2.3, 0.25, 0.3);
    onBike(p, rig, t, { stand: st, lean: 0.38, handsR: 1 - wave });
    pedalSway(p, rig, t, 1 + st * 2);
    if (wave > 0) {
      // waves goodbye over the shoulder
      const wv = sin(t * 10);
      rig.reach(p, -1, 7 + wv * 1.0, 11.6, -1.2, [1, -0.6, 0.2], wave);
      p.wristR.rz = -wv * 0.35 * wave; p.handR = 'open';
      p.head.ry -= 0.8 * wave; p.chest.ry -= 0.25 * wave;
      f.expr = 'happy'; f.mouth = 'grin';
    }
    p.earL.rx = p.earR.rx = 0.4;
  },
});

export { ANIMS as MOOSE_ANIMS };
