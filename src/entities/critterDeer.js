// DeerGuy: the Daisy Beer delivery guy, Reynard's buddy. A young deer in a
// Daisy Beer trucker cap and polo, always with a can in his left hand.
//
//   const d = new DeerGuy();  scene.add(d.root);
//   d.play('sit_chair');   // lounge (pose matches makeLawnChair() placed at the root)
//   d.play('laugh');       // seated or standing variants follow d.seated
//   d.onEvent = (name) => {};   // 'sip' | 'ahh' | 'slap' | 'clink' | 'step'
//
// Units: 1 voxel = 0.05. Root at the feet, facing +Z. ~1.35 tall (1.42 with the cap).
import * as THREE from 'three';
import {
  VS, FV, VoxelModel, rbox, ell, tone, buildGeo, geoCache, mirrorX, handModel, K, pulse, beat, win,
  sin, cos, abs, max, min, PI, TAU, clamp, lerp, smooth,
} from './critterKit.js';
import { CritterFace, BASE_EXPRS } from './critterFaces.js';
import { BipedRig, HAND_KINDS } from './critterBiped.js';
import { makeDaisyBeerCan, LAWN_CHAIR_SEAT } from './critterProps.js';

const C = {
  fur: 0xc98448, furD: 0xb06e38, furL: 0xdc9a5c, furDD: 0x8e5428,
  cream: 0xf8ead2, creamD: 0xe8d4b4, spot: 0xfbf3e4,
  nose: 0x2a1e22, noseL: 0x5e4c52, hoof: 0x3a2a26, hoofL: 0x54403a, earIn: 0xf2c2b0, earInD: 0xe0a494,
  polo: 0x3e9e52, poloD: 0x2e8040, poloL: 0x5ab868, collar: 0xf8f4e8, collarD: 0xdcd8c8,
  shorts: 0xcbb07a, shortsD: 0xa88e5a, shortsL: 0xdcc494,
  cap: 0xffd22e, capD: 0xe6a81c, capL: 0xffe680, mesh: 0xfaf8f0, meshD: 0xd6d2c6, white: 0xfdfbf2, orange: 0xf08a1a,
  antler: 0xead8ae, antlerD: 0xcdb486,
};

const D = {
  HIP_Y: 9, WAIST: 1, NECK: 7.4, NECK_Z: 0.2, SH: [4.9, 5.4, 0], L_UP: 3.4, L_FORE: 3.1, L_HAND: 2.2,
  THIGH: 4.5, SHIN: 4.5, LEG_X: 2, EAR: [4.4, 6.6, -1.2], TAIL: [-0.6, -3.1],
};
const MOUTH = [1.4, 6.4]; // head space (y, z), voxels

// ------------------------------------------------------------------ models
function pelvisModel() {
  const v = new VoxelModel();
  rbox(v, -4, 3, -3, 0, -3, 2, 1.4, (x, y, z) => (y === 0 ? C.shortsD : tone(x, y, z, C.shorts, C.shortsD, C.shortsL)));
  v.set(-1, -1, 3, C.shortsD); v.set(0, -2, 3, C.shortsD); // fly seam
  v.set(3, -1, 2, C.shortsD); v.set(-4, -1, 2, C.shortsD); // pockets
  return v;
}
function torsoModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => (y <= -1 ? C.poloD : tone(x, y, z, C.polo, C.poloD, C.poloL, 0.14, 0.1));
  rbox(v, -4, 3, -1, 6, -3, 2, 1.6, col);
  rbox(v, -3, 2, -1, 4, -1, 3, 1.8, col); // tummy
  // neck fur (fills gaps when the head tilts)
  rbox(v, -2, 1, 6, 9, -2, 1, 0.9, (x, y, z) => (z >= 1 ? C.cream : C.fur));
  // collar + placket + buttons
  for (let x = -3; x <= 2; x++) for (let z = -2; z <= 2; z++) if (v.has(x, 6, z) && (!v.has(x, 6, z + 1) || !v.has(x, 6, z - 1) || abs(x + 0.5) > 2)) v.set(x, 7, z, C.collar);
  for (const x of [-3, -2, 1, 2]) { v.set(x, 6, 3, C.collar); v.set(x, 5, 3, x === -3 || x === 2 ? C.collarD : C.collar); }
  for (let y = 3; y <= 5; y++) { v.set(-1, y, 3, C.poloD); v.set(0, y, 3, C.poloD); }
  v.set(-1, 4, 4, C.collar); v.set(0, 3, 4, C.collar);
  v.set(-1, 6, 3, C.cream); v.set(0, 6, 3, C.cream);
  // Daisy Beer logo: yellow label with a white daisy, left chest
  for (let x = 1; x <= 2; x++) for (let y = 2; y <= 4; y++) v.set(x, y, 3, C.cap);
  v.set(1, 3, 4, C.white); v.set(2, 3, 4, C.orange);
  return v;
}
function headModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    if (z >= 1 && y <= 3 && abs(x + 0.5) <= 4) return tone(x, y, z, C.cream, C.creamD, C.cream, 0.1, 0);
    if (z <= -3 && y >= 3 && (x * 3 + y * 5) % 7 === 0) return C.spot; // fawn spots
    return tone(x, y, z, C.fur, C.furD, C.furL);
  };
  rbox(v, -5, 4, 0, 8, -4, 3, 3, col);
  rbox(v, -4, 3, 0, 6, 0, 3, 1.8, col);
  // snout
  rbox(v, -2, 1, 0, 3, 3, 5, 1.1, (x, y, z) => (y >= 3 ? tone(x, y, z, C.furL, C.fur, C.furL) : tone(x, y, z, C.cream, C.creamD, C.cream, 0.08, 0)));
  // nose
  v.set(-1, 3, 6, C.noseL); v.set(0, 3, 6, C.nose); v.set(-1, 2, 6, C.nose); v.set(0, 2, 6, C.nose);
  // little antler nubs poking out from under the cap
  for (const x of [-4, 3]) { v.set(x, 9, -1, C.antler); v.set(x, 10, -1, C.antlerD); }
  return v;
}
function earModel() {
  const v = new VoxelModel();
  const rows = [[-1, 1], [-1, 2], [-2, 2], [-1, 2], [-1, 1], [0, 1]]; // y range per x step
  rows.forEach(([a, b], x) => {
    for (let y = a; y <= b; y++)
      for (let z = -1; z <= 0; z++) {
        let c = tone(x, y, z, C.fur, C.furD, C.furL);
        if (z === 0 && x >= 1 && x <= 4 && y > a && y < b) c = x >= 3 ? C.earInD : C.earIn;
        if (x === 5) c = C.furDD;
        v.set(x, y, z, c);
      }
  });
  return v;
}
function capModel() {
  const v = new VoxelModel();
  rbox(v, -5, 4, 0, 3, -5, 3, 1.6, (x, y, z) => (z >= 2 ? tone(x, y, z, C.cap, C.capD, C.capL, 0.06, 0.06) : y === 0 ? C.meshD : (x * 3 + y * 5 + z * 7) % 4 === 0 ? C.meshD : C.mesh));
  // brim
  for (let x = -5; x <= 4; x++)
    for (let z = 4; z <= 8; z++) {
      if ((x === -5 || x === 4) && z >= 7) continue;
      v.set(x, z >= 7 ? 0 : 1, z, z === 8 || x === -5 || x === 4 ? C.capD : C.cap);
    }
  // daisy logo on the front panel
  const zf = 4;
  for (const [x, y] of [[-2, 2], [1, 2], [-1, 3], [0, 3], [-1, 1], [0, 1]]) v.set(x, y, zf, C.white);
  v.set(-1, 2, zf, C.orange); v.set(0, 2, zf, C.orange);
  v.set(-1, 4, -1, C.cap); v.set(0, 4, -1, C.cap); // top button
  // snapback strap
  v.set(-1, 1, -6, C.capD); v.set(0, 1, -6, C.capD);
  return v;
}
function upperModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_UP, 0, -1, 1, 1.0, (x, y, z) => (y >= -2 ? (y === -2 ? C.poloD : tone(x, y, z, C.polo, C.poloD, C.poloL)) : tone(x, y, z, C.fur, C.furD, C.furL)));
  return v;
}
function foreModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_FORE - 1, 0, -1, 1, 1.2, (x, y, z) => tone(x, y, z, C.fur, C.furD, C.furL));
  return v;
}
function thighModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.THIGH, 1, -1, 1, 1.0, (x, y, z) => (y <= -3 ? (y === -3 ? C.shortsD : tone(x, y, z, C.fur, C.furD, C.furL)) : tone(x, y, z, C.shorts, C.shortsD, C.shortsL)));
  return v;
}
function shinModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.SHIN + 1, 0, -1, 1, 1.2, (x, y, z) => tone(x, y, z, C.fur, C.furD, C.furL));
  // hooves (sneaker-ish)
  rbox(v, -1, 1, -D.SHIN, -D.SHIN + 1, -1, 2, 0.6, (x, y, z) => (y === -D.SHIN + 1 && z === 2 ? C.hoofL : C.hoof));
  return v;
}
function tailModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -1, 1, -2, 0, 1.0, (x, y, z) => (z <= -2 || y <= -1 ? C.white : tone(x, y, z, C.fur, C.furD, C.furL)));
  return v;
}

const cache = geoCache(() => {
  const G = {
    pelvis: buildGeo(pelvisModel()), torso: buildGeo(torsoModel()), head: buildGeo(headModel()),
    earL: buildGeo(earModel()), earR: buildGeo(mirrorX(earModel())), cap: buildGeo(capModel()),
    upper: buildGeo(upperModel(), [0.5, 0, 0.5]), fore: buildGeo(foreModel(), [0.5, 0, 0.5]),
    thigh: buildGeo(thighModel(), [0.5, 0, 0.5]), shin: buildGeo(shinModel(), [0.5, 0, 0.5]), tail: buildGeo(tailModel(), [0.5, 0, 0.5]),
  };
  for (const k of HAND_KINDS) {
    G['hand_' + k + 'L'] = buildGeo(handModel(k, 1, C.fur, C.furDD), [0, 0, 0], FV);
    G['hand_' + k + 'R'] = buildGeo(handModel(k, -1, C.fur, C.furDD), [0, 0, 0], FV);
  }
  return G;
});

// ------------------------------------------------------------------ face
const FACE = {
  w: 40, h: 18, eyes: [{ x: 12, y: 9 }, { x: 28, y: 9 }], rx: 4.4, ry: 5.4, style: 'bead', lash: false,
  blush: [{ x: 5, y: 15 }, { x: 35, y: 15 }], blushW: 3,
  mw: 16, mh: 12, mx: 8, my: 5, mstyle: 'deer', mHalf: 4,
  pal: { b: '#7a4a24', i: '#5a3018', I: '#b0703a' },
};
const EXPRS = {
  ...BASE_EXPRS,
  chill: { eyes: 'half', brows: 'flat', mouth: 'smile', blush: 0, tear: 0 },
  ahh: { eyes: 'happy', brows: 'up', mouth: 'grin', blush: 2, tear: 0 },
};

// ------------------------------------------------------------------ rig
export class DeerGuy extends BipedRig {
  constructor({ shadows = true } = {}) {
    super('DeerGuy', { shadows });
    const G = (this._G = cache.get());
    this._geoCache = cache;
    this._buildBiped(G, D);
    this.joint('cap', this.head, 0, 8.4, -0.2);
    this.mesh(G.cap, this.cap);
    this.face = new CritterFace(FACE);
    this.facePlane(this.face.eyes.tex, this.head, FACE.w, FACE.h, 0, 8.6 - FACE.h / 8, 4);
    this.facePlane(this.face.mouth.tex, this.head, FACE.mw, FACE.mh, 0, 3 - FACE.mh / 8, 6);
    // the can (left hand)
    this.can = makeDaisyBeerCan();
    this.can.rotation.x = PI / 2;
    this.can.position.set(0.004, 0, 0.0);
    this.gripL.add(this.can);
    this.seated = false;
    this.jiggle('earL', 'rz', { k: 170, c: 9, ay: -0.02, ax: 0.02, probe: 'head' });
    this.jiggle('earR', 'rz', { k: 170, c: 9, ay: 0.02, ax: 0.02, probe: 'head' });
    this.jiggle('earL', 'ry', { k: 150, c: 8, az: 0.02, probe: 'head' });
    this.jiggle('earR', 'ry', { k: 150, c: 8, az: -0.02, probe: 'head' });
    this.jiggle('cap', 'rx', { k: 280, c: 13, az: -0.008, ay: 0.004, max: 0.25, probe: 'head' });
    this.jiggle('chest', 's', { k: 260, c: 10, ay: 0.002, max: 0.06, probe: 'hips' });
    this.jiggle('tail', 'rx', { k: 160, c: 7, ay: 0.03, max: 0.6, probe: 'hips' });
    this._init(ANIMS, EXPRS, 'idle');
  }
  /** Show or hide the can in the left hand. */
  showCan(on = true) { this.can.visible = on; return this; }
  _post(p) {
    this._setHands(p);
  }
}

// ------------------------------------------------------------------ animation helpers
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };
const SEAT_HIP = LAWN_CHAIR_SEAT / VS + 2.6 - D.HIP_Y; // hips offset when seated (voxels)
const _hp = [0, 0];

/** Lower body + spine for standing (w = 0) or lounging in the lawn chair (w = 1). */
function seat(p, rig, w, t = 0) {
  p.mover.z = -1.4 * w;
  p.hips.y += SEAT_HIP * w;
  p.hips.rx += -0.42 * w;
  p.chest.rx += -0.1 * w;
  p.head.rx += 0.32 * w;
  // feet: planted under the hips standing, stretched out and crossed when lounging
  const zL = lerp(0.3, 10.5, w), zR = lerp(0.3, 10, w);
  const yL = lerp(-p.mover.y, 0.6, w), yR = lerp(-p.mover.y, 0, w);
  rig.legTo(p, 1, yL, zL); rig.legTo(p, -1, yR, zR);
  p.thighL.rz = lerp(0.05, -0.16, w); p.thighR.rz = lerp(-0.05, 0.02, w);
  p.shinL.ry = 0;
  if (w > 0.5) { p.thighL.y = 0.3; }
}
const sw = (rig) => (rig.seated ? 1 : 0);
/** Can held in front of the belly (left hand). */
function holdCan(rig, p, dz = 0) {
  rig.reach(p, 1, 2.2, 2.4, 5.2 + dz, [0.9, -0.5, -0.6]);
  p.wristL.rx = 0.25; p.wristL.rz = 0.1;
  p.handL = 'fist';
}
function relaxR(rig, p, seated) {
  if (seated) { rig.reach(p, -1, 5.6, -1.5, 3.2, [0.8, 0, -1]); p.handR = 'relax'; }
  else { p.armR.rz = -0.12; p.armR.rx = 0.05; p.foreR.rx = -0.2; }
}
/** Can to the mouth: u = 0 (held) .. 1 (sipping). */
function sipArm(rig, p, u) {
  const m = rig.headPoint(p, MOUTH[0], MOUTH[1], _hp);
  const tx = lerp(2.2, 1.3, u), ty = lerp(2.4, m[0] - 2.4, u), tz = lerp(5.2, m[1] + 0.4, u);
  rig.reach(p, 1, tx, ty, tz, [1, -0.6, -0.3]);
  p.wristL.rx = lerp(0.25, -0.7, u); p.wristL.rz = lerp(0.1, 0.5, u);
  p.handL = 'fist';
}
function steps(s, ph, rig) {
  const k = Math.floor(ph / PI + 0.5);
  if (s.step !== undefined && k !== s.step) rig._emit('step');
  s.step = k;
}
const nextIdle = (rig) => (rig.seated ? 'sit_chair' : 'idle');

// ------------------------------------------------------------------ animations
def('idle', {
  loop: true, expr: 'neutral',
  enter(s, rig) { rig.seated = false; },
  fn(t, p, f, s, rig) {
    rig.life(t, p);
    const sway = sin(t * 0.7);
    p.hips.x = sway * 0.35; p.hips.rz = sway * 0.03; p.chest.rz = -sway * 0.04;
    p.head.rz = sin(t * 0.7 + 0.6) * 0.05;
    seat(p, rig, 0);
    holdCan(rig, p);
    // right hand in the pocket-ish, thumb hooked
    p.armR.rz = -0.2; p.armR.rx = 0.2; p.foreR.rx = -0.5; p.handR = 'relax';
    p.head.ry = K(t % 8, [[0, 0], [3, 0], [3.3, 0.4], [4.8, 0.4], [5.1, 0]]);
    f.look = [p.head.ry * 1.6, 0];
    p.tail.rx += sin(t * 9) * 0.15 * win(t % 5, 2, 2.6);
  },
});

def('drink', {
  dur: 2.5, expr: 'neutral', next: nextIdle,
  fn(t, p, f, s, rig) {
    const w = sw(rig);
    rig.life(t, p, 0.5);
    seat(p, rig, w);
    const u = K(t, [[0, 0], [0.45, 1, 'io'], [1.6, 1], [2.0, 0, 'io']]);
    const tip = K(t, [[0.4, 0], [0.7, 1], [1.5, 1], [1.8, 0]]);
    p.head.rx -= 0.38 * tip; p.chest.rx -= 0.1 * tip;
    sipArm(rig, p, u);
    p.wristL.rx -= tip * 0.4;
    relaxR(rig, p, w > 0.5);
    p.head.y += sin(t * 18) * 0.12 * win(t, 0.75, 1.5); // gulp
    if (t > 0.4 && t < 1.65) { f.mouth = 'sip'; f.eyes = 'happy'; }
    if (t > 1.85) { f.expr = 'ahh'; p.chest.s = 1 + pulse(t, 1.85, 0.4) * 0.05; }
    beat(s, 'sip', t, 99, 0.8) && rig._emit('sip');
    beat(s, 'ahh', t, 99, 1.9) && rig._emit('ahh');
  },
});

def('laugh', {
  loop: true, expr: 'laugh',
  fn(t, p, f, s, rig) {
    const w = sw(rig);
    seat(p, rig, w);
    const ha = sin(t * 15), slapT = t % 0.6;
    const bend = K(slapT, [[0, 0], [0.2, 1, 'in'], [0.3, 0.8], [0.6, 0, 'io']]);
    p.chest.rx += -0.22 + bend * 0.5; p.head.rx += -0.3 + bend * 0.25 + ha * 0.05;
    p.chest.s = 1 + ha * 0.035; p.mover.y += abs(ha) * 0.15 * (1 - w);
    p.chest.ry = sin(t * 2) * 0.1;
    // right paw slaps the knee
    const kneeY = w ? 0.5 : -3.6, kneeZ = w ? 4.2 : 2.6;
    rig.reach(p, -1, lerp(3.2, 2.2, bend), lerp(3, kneeY, bend), lerp(4, kneeZ, bend), [0.9, -0.2, -0.6]);
    p.handR = 'open';
    // left holds the can against the belly
    holdCan(rig, p, -1);
    if (!w) rig.stance(p, bend * 0.8, 0.3, 0.3);
    if (beat(s, 'slap', t, 0.6, 0.2)) rig._emit('slap');
    f.mouth = ha > -0.3 ? 'laugh' : 'open';
  },
});

def('point_laugh', {
  loop: true, expr: 'laugh',
  fn(t, p, f, s, rig) {
    const w = sw(rig);
    seat(p, rig, w);
    const ha = sin(t * 14);
    p.chest.rx += -0.15 + ha * 0.06; p.head.rx += -0.2 + ha * 0.06;
    p.chest.s = 1 + ha * 0.03;
    p.mover.y += abs(ha) * 0.2 * (1 - w);
    p.chest.ry = -0.12;
    // jabbing point straight ahead
    const jab = abs(sin(t * 7)) * 0.6;
    rig.reach(p, -1, 2.4, 6.6 + ha * 0.2, 7.6 + jab, [0.8, -0.8, -0.3]);
    p.wristR.rx = -0.25;
    p.handR = 'point';
    // left paw clutches the belly (can and all)
    rig.reach(p, 1, 2.4, -0.4, 4.3, [0.9, -0.4, -0.6]);
    p.wristL.rx = 0.5; p.handL = 'fist';
    f.mouth = ha > -0.4 ? 'laugh' : 'open';
    f.tear = 1;
  },
});

def('wave', {
  loop: true, expr: 'happy',
  fn(t, p, f, s, rig) {
    const w = sw(rig);
    rig.life(t, p, 0.6);
    seat(p, rig, w);
    holdCan(rig, p);
    const wv = sin(t * 9);
    rig.reach(p, -1, 6.6 + wv * 0.9, 10.8, 1.6, [1, -0.6, -0.4]);
    p.wristR.rz = -wv * 0.3; p.wristR.rx = -0.1;
    p.handR = 'open';
    p.chest.rz += -0.06; p.head.rz += 0.1 + sin(t * 4.5) * 0.04;
    f.mouth = 'grin';
  },
});

def('cheers', {
  dur: 2.2, expr: 'happy', next: nextIdle,
  fn(t, p, f, s, rig) {
    const w = sw(rig);
    rig.life(t, p, 0.5);
    seat(p, rig, w);
    const up = K(t, [[0, 0], [0.4, 1, 'back'], [1.5, 1], [1.95, 0, 'io']]);
    const clink = pulse(t, 0.55, 0.2);
    rig.reach(p, 1, lerp(2.6, 2.2, up), lerp(0.6, 10.6, up) + clink * 0.6, lerp(4.2, 6.6, up) + clink * 0.8, [1, -0.3, -0.6]);
    p.wristL.rx = lerp(0.25, -0.9, up); p.wristL.rz = 0.1;
    p.handL = 'fist';
    relaxR(rig, p, w > 0.5);
    if (w < 0.5) { rig.reach(p, -1, 5.4, 4.2, 1.6, [1, -0.4, -0.5]); p.handR = 'fist'; }
    p.chest.rx -= 0.08 * up; p.head.rx -= 0.12 * up;
    p.mover.y += up * 0.25 * (1 - w);
    f.mouth = t > 0.4 && t < 1.5 ? 'open' : 'grin';
    beat(s, 'cl', t, 99, 0.6) && rig._emit('clink');
  },
});

def('sit_chair', {
  loop: true, expr: 'chill',
  enter(s, rig) { s.from = rig.seated ? 1 : 0; rig.seated = true; },
  fn(t, p, f, s, rig) {
    // sits down first if he was standing
    const w = s.from ? 1 : K(t, [[0, 0], [0.9, 1, 'io']]);
    const tt = s.from ? t : max(0, t - 0.9);
    rig.life(tt, p, 0.7);
    seat(p, rig, w);
    p.chest.rx += sin(t * PI * 0.7) * 0.12 * (1 - w) * w * 4 * 0.25;
    // right paw behind the head, can resting on the armrest
    const hb = w;
    rig.reach(p, -1, lerp(4.6, 2.4, hb), lerp(1, 11.8, hb), lerp(1, -2.2, hb), [1, 0.4, 0.2]);
    p.handR = 'open';
    rig.reach(p, 1, 6.2, lerp(0.6, -0.3, w), lerp(4.2, 4.6, w), [0.8, -0.6, -0.6]);
    p.wristL.rx = 0.25; p.handL = 'fist';
    // foot tap + head bob
    const tap = max(0, sin(tt * 4.5)) * win(tt % 7, 3, 5.5);
    p.shinR.rx -= tap * 0.25;
    p.head.rz += sin(tt * 4.5) * 0.04 * win(tt % 7, 3, 5.5);
    p.head.ry += K(tt % 9, [[0, 0], [6, 0], [6.4, -0.35], [7.8, -0.35], [8.2, 0]]);
    if (w < 1) f.expr = 'neutral';
  },
});

def('stand', {
  dur: 1.3, expr: 'neutral', next: 'idle',
  enter(s, rig) { s.from = rig.seated ? 1 : 0; },
  exit(s, rig) { rig.seated = false; },
  fn(t, p, f, s, rig) {
    const w = s.from * K(t, [[0, 1], [0.25, 1], [1.0, 0, 'io']]);
    const push = pulse(t, 0.15, 0.9);
    seat(p, rig, w);
    p.chest.rx += push * 0.6; p.head.rx -= push * 0.3;
    // push off the armrests
    rig.reach(p, -1, 5.6, lerp(-1.5, -2, push), 3.2, [0.8, 0, -1], w);
    rig.reach(p, 1, 6.2, -0.3, 4.6, [0.8, -0.6, -0.6], w);
    if (w < 0.6) { holdCan(rig, p); relaxR(rig, p, false); }
    p.handL = 'fist';
    rig.seated = false;
    if (t > 0.9) p.mover.y += pulse(t, 0.9, 0.3) * 0.3;
    f.mouth = push > 0.5 ? 'flat' : 'smile';
  },
});

def('walk', {
  loop: true, expr: 'neutral',
  enter(s, rig) { rig.seated = false; },
  fn(t, p, f, s, rig) {
    const ph = (t / 0.6) * TAU, sn = sin(ph), cs = cos(ph);
    rig.walk(p, ph, 0.55);
    p.mover.y = 0; p.hips.rz = cs * 0.04; p.chest.ry = sn * 0.1; p.hips.ry = -sn * 0.08;
    p.head.rz = cs * 0.04;
    holdCan(rig, p);
    p.armR.rx = -sn * 0.5; p.foreR.rx = -0.3 - max(0, sn) * 0.4; p.armR.rz = -0.1;
    p.tail.rx = 0.3 + abs(cs) * 0.2;
    steps(s, ph, rig);
  },
});

export { ANIMS as DEER_ANIMS };
