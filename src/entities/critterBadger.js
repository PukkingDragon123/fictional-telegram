// [F&S mining] BadgerProspector: "Flint", the grizzled badger who has dug the
// north mountain for forty years. A stocky silver-grey badger with the classic
// black-and-white striped face, a bushy grizzled moustache, a dented miner's
// helmet with a brass carbide lamp, a red flannel shirt with the sleeves
// rolled up, patched denim overalls (brass buttons, a pencil in the bib),
// big hobnail boots and huge digging claws. His pickaxe leans against his leg.
//
//   const f = new BadgerProspector();  scene.add(f.root);
//   f.play('swing_pick');   // grabs the pick, two big swings into the ground: CLANK, sparks, chips
//   f.play('bite_nugget');  // a gold nugget from the bib: up to the lamp, squint, bite, proud grin
//   f.play('gentle_boom');  // lights a stick of "gentle" dynamite... it fizzles: pfft. Sheepish laugh.
//   f.onEvent = (name) => {};  // 'step' | 'clank' | 'chomp' | 'fizz' | 'pfft' | 'laugh' | 'grab'
//
// Anims: idle wave talk laugh walk happy swing_pick bite_nugget gentle_boom
// Expressions: neutral happy talk surprised sleepy smug laugh focused proud squint (+ BASE_EXPRS)
// Walk speed: 'walk' ~0.42 units/s (a heavy, rolling stomp; move the root, the anim is in place).
// Units: 1 voxel = 0.05. Root at the feet, facing +Z. ~1.1 tall to the head, ~1.38 to the helmet top.
import * as THREE from 'three';
import {
  VS, FV, VoxelModel, rbox, ell, tone, hash3, buildGeo, geoCache, mirrorX, handModel, K, beat, win,
  sin, cos, abs, max, min, PI, TAU, clamp, lerp, SPARK_ROWS, HEART_ROWS,
} from './critterKit.js';
import { BASE_EXPRS } from './critterFaces.js';
import { BipedRig, HAND_KINDS } from './critterBiped.js';
import { NpcFace, talkMouth, stepEvents, orientIn, NOTE_ROWS } from './npcProps.js';
import { spriteMatPal, STEAM_PAL, STEAM_ROWS, STAR_PAL, STAR_ROWS, PEBBLE_PAL, DIRT_PAL, DIRT_ROWS } from './npcProps2.js';

const C = {
  fur: 0x8e8c94, furD: 0x6e6c76, furL: 0xaeacb2, furDD: 0x56545e,
  blk: 0x2a2630, blkL: 0x3e3a46, wht: 0xf4f2ec, whtD: 0xdcd8d0, nose: 0x18141a, noseL: 0x5a5260,
  stache: 0xeceae4, stacheD: 0xc8c4bc, ear: 0x2e2a32, earW: 0xe8e6e0,
  paw: 0x3a3640, pawD: 0x26222c, claw: 0xf0e4c4,
  den: 0x4866a2, denD: 0x344c80, denL: 0x6a88c0, stitch: 0xf2d27a, patch: 0xc89a5a, patchD: 0xa07a3e,
  fl: 0xc83c34, flD: 0x8e2626, flL: 0xe0604a, flK: 0x2a1a20,
  brass: 0xe8c050, brassD: 0xb88e2a, brassL: 0xfff0a0, lens: 0xfff8d0, lensL: 0xffffff,
  hat: 0xe0a838, hatD: 0xb07c24, hatL: 0xf8d070, hatB: 0x5a3a22,
  boot: 0x6e4628, bootD: 0x4c2e18, bootL: 0x8e5e36, sole: 0x2a1a14, nail: 0xc8ccd4,
  wood: 0xb07c46, woodD: 0x86582c, woodL: 0xd09a5e, steel: 0xb8c0cc, steelD: 0x7e8696, steelL: 0xeef2f8,
  gold: 0xffcc34, goldD: 0xe0a01e, goldL: 0xfff2a0, dyn: 0xd8302a, dynD: 0xa8201e, dynL: 0xf06048, fuse: 0x4a3a2a, pencil: 0xf2c230,
};

const D = {
  CHIBI: { body: 0.82, head: 1.22, hatTilt: 0.1 }, // [v20 npc rigs] small stocky body, big head
  HIP_Y: 5, WAIST: 1, NECK: 6.6, NECK_Z: 0.6, SH: [5.8, 5.6, 0.4], L_UP: 3.2, L_FORE: 3.3, L_HAND: 1.8,
  THIGH: 2.6, SHIN: 2.6, LEG_X: 2.7, EAR: [4.0, 6.6, -1.2], TAIL: [0.4, -5.2],
};

// ------------------------------------------------------------------ models
const furCol = (x, y, z) => tone(x, y, z, C.fur, C.furD, C.furL, 0.16, 0.14);
const denCol = (x, y, z) => tone(x, y, z, C.den, C.denD, C.denL, 0.1, 0.08);
const plaid = (x, y, z) => ((x + 40) % 4 === 0 || (y + 40) % 4 === 0 ? (((x + 40) % 4 === 0 && (y + 40) % 4 === 0) ? C.flK : C.flD) : tone(x, y, z, C.fl, C.flD, C.flL, 0.05, 0.08));
function surfZ(v, x, y, front = true) {
  if (front) { for (let z = 14; z >= -14; z--) if (v.has(x, y, z)) return z; }
  else for (let z = -14; z <= 14; z++) if (v.has(x, y, z)) return z;
  return null;
}
function pelvisModel() {
  const v = new VoxelModel();
  ell(v, 0, -0.6, -0.4, 6.0, 3.6, 5.0, (x, y, z) => (y === 2 ? C.denD : denCol(x, y, z)));
  // a tan patch on the seat + stitched pocket
  for (let x = -3; x <= 1; x++) for (let y = -2; y <= 0; y++) { const z = surfZ(v, x, y, false); if (z !== null) v.set(x, y, z - 1, (x === -3 || x === 1 || y === -2 || y === 0) ? C.patchD : C.patch); }
  for (const x of [-4, -2, 0, 2]) { const z = surfZ(v, x, 1); if (z !== null) v.set(x, 1, z, C.stitch); }
  return v;
}
function torsoModel() {
  const v = new VoxelModel();
  // a barrel of a badger: flannel shirt, overalls bib in front, denim round the waist
  const CY = 2.6, R = [6.6, 5.7, 5.6];
  ell(v, 0, CY, -0.4, R[0], R[1], R[2], (x, y, z) => (y < -1 ? null : y <= 0 ? denCol(x, y, z) : plaid(x, y, z)));
  // the bib: denim panel, stitched edge, brass buttons, a pencil in the pocket
  for (let x = -4; x <= 3; x++)
    for (let y = 0; y <= 5; y++) {
      const z = surfZ(v, x, y);
      if (z === null) continue;
      const edge = x === -4 || x === 3 || y === 5;
      v.set(x, y, z + 1, edge ? C.denD : denCol(x, y, z));
      if (!edge && (x === -3 || x === 2 || y === 4) && (x + y) % 2 === 0) v.set(x, y, z + 1, C.stitch);
    }
  for (const x of [-4, 3]) { const z = surfZ(v, x, 5); v.set(x, 5, z + 1, C.brass); }
  // bib pocket + pencil
  for (let x = -2; x <= 1; x++) for (let y = 1; y <= 3; y++) { const z = surfZ(v, x, y); v.set(x, y, z + 1, y === 3 ? C.denD : x === -2 || x === 1 ? C.denD : C.den); }
  { const z = surfZ(v, 1, 3); for (let y = 3; y <= 5; y++) v.set(1, y, z, y === 5 ? C.blk : C.pencil); }
  // straps over the shoulders, down the back
  for (const x of [-4, 3]) for (let y = 5; y <= 8; y++) { const zf = surfZ(v, x, y); if (zf !== null) v.set(x, y, zf + 1, C.denD); const zb = surfZ(v, x, y, false); if (zb !== null) v.set(x, y, zb - 1, C.denD); }
  // neck ruff (grey) + flannel collar points
  rbox(v, -3, 2, 7, 9, -2, 2, 1.2, furCol);
  for (const [x, z] of [[-3, 2], [-2, 3], [1, 3], [2, 2]]) v.set(x, 7, z, C.flD);
  return v;
}
function headModel() {
  const v = new VoxelModel();
  // badger mask: a white blaze up the middle, a black band through each eye to
  // the ear, white cheeks below, silver-grey on top and at the back
  const col = (x, y, z) => {
    const fx = abs(x + 0.5);
    if (z < -2.5) return fx < 1.1 && y > 3 ? C.wht : furCol(x, y, z);
    if (fx < 1.15) return tone(x, y, z, C.wht, C.whtD, C.wht, 0.12, 0);
    if (fx < 2.9 && y >= 1.5) return tone(x, y, z, C.blk, C.blkL, C.blk, 0.15, 0);
    if (y < 4.5 || fx < 3.6) return tone(x, y, z, C.wht, C.whtD, C.wht, 0.15, 0);
    return furCol(x, y, z);
  };
  rbox(v, -5, 4, 0, 7, -4, 3, 3.0, col);
  ell(v, 0, 2.4, 0.4, 5.8, 2.8, 3.8, col); // round cheeks
  // the long snout: white blaze down to a big shiny nose, black side stripes
  for (let z = 3; z <= 7; z++) {
    const r = lerp(2.7, 1.2, (z - 3) / 4), cy = lerp(2.5, 2.7, (z - 3) / 4);
    for (let x = -3; x <= 2; x++) for (let y = 0; y <= 5; y++) {
      if (Math.hypot(x + 0.5, (y + 0.5 - cy) * 1.15) > r) continue;
      const fx = abs(x + 0.5);
      v.set(x, y, z, fx < 1 ? C.wht : y + 0.5 > cy - 0.3 ? C.blk : C.whtD);
    }
  }
  for (let x = -1; x <= 0; x++) for (let y = 2; y <= 3; y++) v.set(x, y, 8, y === 3 && x === -1 ? C.noseL : C.nose);
  // a grizzled walrus moustache drooping off both sides of the nose
  for (const s of [-1, 1]) {
    const bx = s < 0 ? -1 : 0;
    for (let k = 1; k <= 3; k++) {
      const x = bx + s * k, y = 1 - (k > 2 ? 1 : 0), z = 7 - (k > 1 ? 1 : 0);
      v.set(x, y, z, k === 3 ? C.stacheD : C.stache);
    }
    v.set(bx, 1, 8, C.stache);
  }
  // bushy grey eyebrow tufts
  for (const x of [-4, -3, 2, 3]) v.set(x, 7, 2, C.stacheD);
  return v;
}
function earModel() {
  const v = new VoxelModel();
  for (let y = 0; y <= 1; y++) for (let x = -1; x <= 1; x++) v.set(x, y, 0, y === 1 && x !== 0 ? C.earW : C.ear);
  v.set(0, 2, 0, C.earW); v.set(0, 0, -1, C.ear); v.set(0, 1, -1, C.ear);
  return v;
}
function helmetModel() {
  const v = new VoxelModel();
  // a dented tin miner's helmet: a short brim (longer at the front), a ridge, a leather band
  for (let x = -6; x <= 5; x++)
    for (let z = -6; z <= 7; z++) {
      const r = Math.hypot(x + 0.5, (z + 0.5) * (z > 0 ? 0.9 : 1.05));
      if (r > 6.2) continue;
      v.set(x, 0, z, r > 5.4 ? C.hatD : C.hat);
    }
  ell(v, 0, 0.6, 0, 5.0, 4.4, 5.2, (x, y, z) => {
    if (y < 1) return null;
    if (y === 1) return C.hatB;
    if (abs(x + 0.5) < 0.6 && y >= 3) return C.hatL; // ridge
    if (x === 3 && y === 3 && z === 2) return C.hatD; // dent
    return tone(x, y, z, C.hat, C.hatD, C.hatL, 0.1, 0.1);
  });
  // carbide lamp on the front: a brass cup and a round lens
  for (let x = -2; x <= 1; x++) for (let y = 2; y <= 5; y++) {
    const r = Math.hypot(x + 0.5, y - 3.5);
    if (r > 1.9) continue;
    v.set(x, y, 5, C.brassD);
    v.set(x, y, 6, r > 1.0 ? C.brass : C.lens);
  }
  v.set(-1, 3, 7, C.lensL); v.set(0, 4, 7, C.lens);
  return v;
}
function upperModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_UP, 0, -1, 1, 1.0, plaid);
  ell(v, 0.5, -0.4, 0.5, 2.1, 1.6, 2.1, (x, y, z) => (y < -1 ? null : plaid(x, y, z))); // shoulder
  return v;
}
function foreModel() {
  const v = new VoxelModel();
  // rolled-up cuff, then the badger's black forearm
  rbox(v, -1, 1, -D.L_FORE - 1, 0, -1, 1, 1.2, (x, y, z) => (y >= -1 ? (y === -1 ? C.flD : C.fl) : tone(x, y, z, C.paw, C.pawD, C.paw, 0.12, 0)));
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (abs(x) === 2 || abs(z) === 2) { if (abs(x) + abs(z) < 4) v.set(x, -1, z, (x + z) % 2 ? C.flD : C.flL); }
  return v;
}
function thighModel() {
  const v = new VoxelModel();
  rbox(v, -2, 1, -D.THIGH, 1, -2, 1, 1.2, denCol);
  return v;
}
function shinModel() {
  const v = new VoxelModel();
  rbox(v, -2, 1, -D.SHIN + 2, 0, -2, 1, 1.2, (x, y, z) => (y === -D.SHIN + 2 ? C.denD : denCol(x, y, z)));
  // a big hobnail boot with a fat toe cap
  const y = -D.SHIN;
  rbox(v, -2, 1, y, y + 2, -2, 4, 0.8, (x, yy, z) => (yy === y ? C.sole : z >= 3 && yy === y + 1 ? C.bootL : yy === y + 2 && z <= 1 ? C.bootD : C.boot));
  for (const x of [-2, 1]) v.set(x, y, 0, C.nail);
  v.set(-1, y + 2, 2, C.bootD); v.set(0, y + 2, 2, C.bootD);
  return v;
}
function tailModel() {
  const v = new VoxelModel();
  ell(v, 0, 0.4, -1.4, 1.8, 1.6, 1.8, (x, y, z) => (z < -2 ? C.furL : furCol(x, y, z)));
  return v;
}
// pickaxe (fine voxels): the handle runs up +Y from the grip, the head sits across Z at the top
const PICK_TOP = 22;
function pickModel() {
  const v = new VoxelModel();
  for (let y = -5; y <= PICK_TOP; y++) for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) v.set(x, y, z, y === -5 ? C.woodD : (x + y + z) % 5 === 0 ? C.woodD : y > PICK_TOP - 4 ? C.wood : tone(x, y, z, C.wood, C.woodD, C.woodL, 0.1, 0.1));
  // binding
  for (let y = PICK_TOP - 3; y <= PICK_TOP - 2; y++) for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) if (abs(x + 0.5) > 1 || abs(z + 0.5) > 1) v.set(x, y, z, C.steelD);
  // the head: thick in the middle, tapering to a point and a chisel
  for (let z = -11; z <= 10; z++) {
    const t = abs(z + 0.5) / 10.5;
    const h = Math.round(lerp(3, 1, t)), y0 = PICK_TOP - 1 + Math.round(-t * t * 2.5);
    for (let y = y0; y < y0 + h; y++) for (let x = -1; x <= 0; x++) v.set(x, y, z, y === y0 + h - 1 && t < 0.8 ? C.steelL : t > 0.85 ? C.steelD : C.steel);
  }
  return v;
}
function nuggetModel() {
  const v = new VoxelModel();
  ell(v, 0, 0, 0, 3.2, 2.6, 2.8, (x, y, z) => (y >= 1 && x <= 0 ? C.goldL : hash3(x, y, z) > 0.7 ? C.goldD : C.gold));
  v.set(2, 2, 0, C.gold); v.set(-3, -1, 1, C.goldD);
  return v;
}
function dynamiteModel() {
  const v = new VoxelModel();
  for (let y = 0; y <= 14; y++) for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) {
    if (Math.hypot(x + 0.5, z + 0.5) > 2.2) continue;
    v.set(x, y, z, y === 3 || y === 11 ? 0xf2e8d0 : x <= -1 && z >= 0 ? C.dynL : C.dyn);
  }
  for (let y = 15; y <= 18; y++) v.set(0, y, 0, C.fuse);
  v.set(1, 19, 0, C.fuse);
  return v;
}

const cache = geoCache(() => {
  const G = {
    pelvis: buildGeo(pelvisModel()), torso: buildGeo(torsoModel()), head: buildGeo(headModel()),
    earL: buildGeo(earModel()), earR: buildGeo(mirrorX(earModel())), helmet: buildGeo(helmetModel()),
    upper: buildGeo(upperModel(), [0.5, 0, 0.5]), fore: buildGeo(foreModel(), [0.5, 0, 0.5]),
    thigh: buildGeo(thighModel(), [0.5, 0, 0.5]), shin: buildGeo(shinModel(), [0.5, 0, 0.5]), tail: buildGeo(tailModel(), [0, 0, 0]),
    pick: buildGeo(pickModel(), [0, 0, 0], FV), nugget: buildGeo(nuggetModel(), [0, 0, 0], FV), dyn: buildGeo(dynamiteModel(), [0, 0, 0], FV),
  };
  for (const k of HAND_KINDS) {
    // big digging claws on the dark paws
    const hl = handModel(k, 1, C.paw, C.pawD), hr = handModel(k, -1, C.paw, C.pawD);
    for (const h of [hl, hr]) for (const [key, c] of h.vox) { const y = ((key >> 10) & 1023) - 512; if (y <= -5 && c !== C.pawD) h.vox.set(key, C.claw); }
    G['hand_' + k + 'L'] = buildGeo(hl, [0, 0, 0], FV);
    G['hand_' + k + 'R'] = buildGeo(hr, [0, 0, 0], FV);
  }
  return G;
});

// ------------------------------------------------------------------ face
const FACE = {
  w: 40, h: 18, eyes: [{ x: 11, y: 9 }, { x: 29, y: 9 }], rx: 5.6, ry: 6.2, style: 'toon',
  blush: [{ x: 4, y: 15 }, { x: 36, y: 15 }], blushW: 3,
  mw: 24, mh: 10, mx: 12, my: 1, mstyle: 'deer', mHalf: 3,
  pal: { i: '#2a1a14', I: '#6a4a2a', b: '#d8d4cc', f: '#2a2630', F: '#1a161e' },
};
const EXPRS = {
  ...BASE_EXPRS,
  neutral: { eyes: 'open', brows: 'flat', mouth: 'smile', blush: 0, tear: 0 },
  happy: { eyes: 'happy', brows: null, mouth: 'grin', blush: 1, tear: 0 },
  talk: { eyes: 'open', brows: 'flat', mouth: 'open', blush: 0, tear: 0 },
  surprised: { eyes: 'wide', brows: 'raised', mouth: 'o', blush: 0, tear: 0 },
  sleepy: { eyes: 'sleepy', brows: null, mouth: 'flat', blush: 0, tear: 0 },
  smug: { eyes: 'half', brows: 'flat', mouth: 'cheeky', blush: 0, tear: 0 },
  laugh: { eyes: 'shut', brows: 'up', mouth: 'laugh', blush: 1, tear: 1 },
  focused: { eyes: 'focused', brows: 'angry', mouth: 'flat', blush: 0, tear: 0 },
  proud: { eyes: 'shiny', brows: 'up', mouth: 'grin', blush: 1, tear: 0 },
  squint: { eyes: 'half', brows: 'angry', mouth: 'flat', blush: 0, tear: 0 },
};

// ------------------------------------------------------------------ rig
const _w = new THREE.Vector3(), _w2 = new THREE.Vector3();
const LAMP_PAL = { k: '#c8a040', y: '#fff2a0', Y: '#ffffff' };
const LAMP_ROWS = ['..k..', '.kyk.', 'kyYyk', '.kyk.', '..k..'];
export class BadgerProspector extends BipedRig {
  constructor({ shadows = true } = {}) {
    super('BadgerProspector', { shadows });
    const G = (this._G = cache.get());
    this._geoCache = cache;
    this._buildBiped(G, D);
    this.joint('hat', this.head, 0, 7.2, -0.2);
    this.mesh(G.helmet, this.hat);
    this.face = new NpcFace(FACE);
    this.facePlane(this.face.eyes.tex, this.head, FACE.w, FACE.h, 0, 6.9 - FACE.h / 8, 4.1);
    this.facePlane(this.face.mouth.tex, this.head, FACE.mw, FACE.mh, 0, 1.9 - FACE.mh / 8, 7.4);
    // pickaxe: in the right hand (aimed in chest space) or leaning on his left leg
    this.pickHold = new THREE.Group(); this.gripR.add(this.pickHold);
    this.pick = this.mesh(G.pick, this.pickHold);
    this.pick.scale.setScalar(1.7); // a chibi-sized body, a full-sized pick
    this.pickRest = this.mesh(G.pick, this.space, { x: 0.36, y: 5 * FV, z: 0.16 });
    this.pickRest.rotation.set(0.12, 0.4, 0.3);
    this.pickRest.scale.setScalar(1.35);
    this.nugget = this.mesh(G.nugget, this.gripR);
    this.dyn = this.mesh(G.dyn, this.gripL, { y: -0.04 });
    // sprites
    const stm = spriteMatPal(STEAM_ROWS, STEAM_PAL), sm = spriteMatPal(STAR_ROWS, STAR_PAL), dm = spriteMatPal(DIRT_ROWS, DIRT_PAL);
    const pm = spriteMatPal(['.kk.', 'kggk', 'kGdk', '.kk.'], PEBBLE_PAL), lm = spriteMatPal(LAMP_ROWS, LAMP_PAL);
    const spr = (m, n) => [...Array(n)].map(() => { const s = new THREE.Sprite(m); s.visible = false; this.space.add(s); return s; });
    this.smoke = spr(stm, 5);
    this.stars = spr(sm, 4);
    this.chips = [...spr(dm, 3), ...spr(pm, 3)];
    this.lamp = new THREE.Sprite(lm); this.lamp.scale.setScalar(0.07); this.headFx.add(this.lamp);
    this.lamp.position.set(0, 10.6 * VS, 7.6 * VS);
    this.fuse = spr(spriteMat2(), 1)[0];
    this.notes = [0, 1].map(() => this.sprite(NOTE_ROWS, 0.07, this.space));
    this.sparks = [0, 1, 2].map(() => this.sprite(SPARK_ROWS, 0.07, this.space));
    this.hearts = [0, 1].map(() => this.sprite(HEART_ROWS, 0.07, this.space));
    this.scalar('pickA', 0); // handle angle from straight up (rad, + = forward), when held
    this.scalar('chips', 0); // 0..1 burst of rock chips + sparks at the pick tip
    this.scalar('smoke', 0); // 0..1 puff of dynamite smoke
    this.scalar('fuse', 0);
    this.scalar('lampK', 1);
    this.scalar('notes', 0);
    this.scalar('spark', 0);
    this.scalar('hearts', 0);
    this.jiggle('hat', 'rx', { k: 170, c: 8, az: -0.8, ay: 0.3, max: 0.3, probe: 'head' });
    this.jiggle('hat', 'rz', { k: 170, c: 8, ax: 0.8, max: 0.25, probe: 'head' });
    this.jiggle('chest', 's', { k: 220, c: 9, ay: 0.07, max: 0.09, probe: 'hips' });
    this.jiggle('head', 's', { k: 260, c: 10, ay: 0.04, max: 0.06, probe: 'chest' });
    this.jiggle('earL', 'rz', { k: 200, c: 9, ay: -0.4, max: 0.35, probe: 'head' });
    this.jiggle('earR', 'rz', { k: 200, c: 9, ay: 0.4, max: 0.35, probe: 'head' });
    this.jiggle('tail', 'rz', { k: 140, c: 6, ax: 0.6, max: 0.5, probe: 'hips' });
    this._init(ANIMS, EXPRS, 'idle');
  }
  _post(p, dt) {
    this._setHands(p);
    const k = this.k, tz = this.time;
    // pickaxe: aimed by the swing angle in chest space (the hand's IK twist doesn't matter)
    const held = !!p.vis.pick;
    this.pick.visible = held;
    this.pickRest.visible = !held;
    if (held) { const a = k.pickA; orientIn(this.pickHold, this.chest, [0, cos(a), sin(a)], [0, -sin(a), cos(a)], 1); }
    this.nugget.visible = !!p.vis.nugget;
    this.dyn.visible = !!p.vis.dyn;
    // the carbide lamp glows (and flickers a little)
    this.lamp.visible = k.lampK > 0.05;
    this.lamp.scale.setScalar((0.05 + 0.012 * sin(tz * 11) + 0.006 * sin(tz * 27)) * k.lampK);
    // chips + sparks fly off the pick tip
    if (held) {
      this.pick.updateWorldMatrix(true, false);
      _w2.set(0, PICK_TOP * FV, 10 * FV); this.pick.localToWorld(_w2); this.space.worldToLocal(_w2);
    }
    const ch = k.chips;
    this.chips.forEach((s, i) => {
      s.visible = ch > 0.02 && ch < 0.98 && held;
      if (!s.visible) return;
      const a = i * 1.05 + 0.3, u = ch;
      s.position.set(_w2.x + cos(a) * u * 0.32, max(0.02, _w2.y + sin(u * PI) * 0.22 + (i % 2) * 0.04), _w2.z + sin(a) * u * 0.18 + u * 0.06);
      s.scale.setScalar(0.06 * (1 - u * 0.5));
    });
    this.stars.forEach((s, i) => {
      s.visible = ch > 0.02 && ch < 0.6 && held;
      if (!s.visible) return;
      const a = i * (TAU / 4) + 0.6;
      s.position.set(_w2.x + cos(a) * (0.05 + ch * 0.3), _w2.y + 0.05 + abs(sin(a)) * ch * 0.25, _w2.z + 0.05);
      s.scale.setScalar(0.07 * sin(clamp(ch / 0.6, 0, 1) * PI));
    });
    // dynamite fuse spark + smoke puff
    if (this.dyn.visible) { this.dyn.updateWorldMatrix(true, false); _w.set(FV, 19 * FV, 0); this.dyn.localToWorld(_w); this.space.worldToLocal(_w); }
    this.fuse.visible = k.fuse > 0.5 && this.dyn.visible;
    if (this.fuse.visible) { this.fuse.position.copy(_w); this.fuse.scale.setScalar(0.06 + 0.03 * abs(sin(tz * 31))); }
    const sm = k.smoke;
    this.smoke.forEach((s, i) => {
      s.visible = sm > 0.02 && sm < 0.99;
      if (!s.visible) return;
      const a = i * 1.26 + 0.2;
      s.position.set(0.18 + cos(a) * (0.05 + sm * 0.18), 0.55 + sm * 0.45 + sin(a * 2) * 0.05, 0.2 + sin(a) * 0.08);
      s.scale.setScalar(0.12 * sin(sm * PI) + 0.03);
    });
    // face sprites
    this.headFx.updateWorldMatrix(true, false);
    _w.set(0, 4 * VS, 4 * VS); this.headFx.localToWorld(_w); this.space.worldToLocal(_w);
    this.notes.forEach((s, i) => {
      const u = (tz * 0.5 + i * 0.5) % 1;
      s.visible = k.notes > 0.5;
      s.position.set(_w.x + 0.15 + u * 0.12 + sin(u * 8 + i) * 0.03, _w.y + 0.1 + u * 0.3, _w.z);
      s.scale.setScalar(0.065 * (u < 0.8 ? 1 : (1 - u) / 0.2) * min(1, u * 6));
    });
    const sp = k.spark;
    this.sparks.forEach((s, i) => {
      s.visible = sp > 0.05;
      const a = i * 2.1 + tz * 1.5;
      s.position.set(_w.x + cos(a) * 0.34, _w.y + 0.22 + sin(a * 1.3) * 0.12, _w.z + sin(a) * 0.1);
      s.scale.setScalar(0.07 * sin(clamp(sp, 0, 1) * PI) * (0.7 + 0.3 * sin(tz * 9 + i)));
    });
    this.hearts.forEach((s, i) => {
      const u = (tz * 0.6 + i * 0.5) % 1;
      s.visible = k.hearts > 0.5;
      s.position.set(_w.x + (i ? 0.17 : -0.15) + sin(u * 6 + i) * 0.03, _w.y + 0.28 + u * 0.28, _w.z - 0.05);
      s.scale.setScalar(0.06 * (u < 0.8 ? 1 : (1 - u) / 0.2) * min(1, u * 5));
    });
  }
}
let FUSE_MAT = null;
function spriteMat2() { return FUSE_MAT || (FUSE_MAT = spriteMatPal(['.y.y', 'yYy.', '.Yyy', 'y.y.'], { y: '#ffb030', Y: '#fff6c0' })); }

// ------------------------------------------------------------------ pose helpers
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };
const ff = (t, d) => (t > d ? t % d : t);
const _c = [0, 0];

/** Stocky stance: feet planted wide, a slight forward lean. */
function stand(p, rig, t, amt = 1) {
  rig.life(t, p, amt);
  rig.stance(p, 0.4, 0.5, 0.5, 0.2);
  p.chest.rx += 0.03;
}
/** Thumbs hooked in his overall straps. */
function thumbsIn(p, rig, w = 1) {
  rig.reach(p, 1, 3.5, 5.0, 6.0, [0.9, -0.2, -0.8], w);
  rig.reach(p, -1, 3.5, 5.0, 6.0, [0.9, -0.2, -0.8], w);
  if (w > 0.5) { p.wristL.rx = p.wristR.rx = 0.4; p.handL = p.handR = 'thumb'; }
}
function onHip(p, rig, side, w = 1) {
  rig.reach(p, side, 6.8, 0.6, 1.6, [0.9, 0.2, -1], w);
  const n = side > 0 ? 'L' : 'R';
  p['wrist' + n].rx = 0.4; p['wrist' + n].rz = side * 0.6; p['hand' + n] = 'fist';
}
/** Both hands on the pick handle for a swing angle a (rad from straight up, + = forward). */
function holdPick(p, rig, a, w = 1) {
  const b = a * 0.85 + 0.28, r = 5.4, py = 5.4, pz = 0.8;
  const y = py + cos(b) * r, z = pz + sin(b) * r;
  rig.reach(p, -1, 0.9, y, z, [1, -0.3, -0.8], w);
  // left hand further up the handle
  rig.reach(p, 1, 0.5, y + cos(a) * 3.2, z + sin(a) * 3.2, [1, -0.3, -0.8], w);
  p.handL = p.handR = 'fist';
  p.vis.pick = true;
  p.k.pickA = a;
}

// ------------------------------------------------------------------ animations
def('idle', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    stand(p, rig, t);
    const sway = sin(t * 0.8);
    p.hips.x = sway * 0.25; p.hips.rz = sway * 0.03; p.chest.rz = -sway * 0.035;
    p.head.rz = sin(t * 0.8 + 0.7) * 0.06;
    const T = t % 11;
    thumbsIn(p, rig);
    // pushes his helmet back and wipes his brow
    const wipe = win(T, 2.0, 3.6, 0.3, 0.3);
    if (wipe > 0) {
      const m = rig.headPoint(p, 0, 7.4, _c);
      rig.reach(p, -1, lerp(3.5, 1.6 + sin(t * 6) * 1.2, wipe), lerp(5.0, m[0] + 1.0, wipe), lerp(6.0, m[1] + 2.2, wipe), [1, -0.4, -0.3], wipe);
      p.handR = 'open'; p.hat.rx -= wipe * 0.25; p.head.rx -= wipe * 0.08;
      if (wipe > 0.5) f.eyes = 'shut';
    }
    // sniffs the air: rain coming? (nose up, a twitch)
    const sn = win(T, 5.4, 6.8, 0.3, 0.3);
    p.head.rx -= sn * (0.22 + sin(t * 17) * 0.03); p.chest.rx -= sn * 0.04;
    if (sn > 0.4) f.expr = 'squint';
    // hums a mining tune, rocking on his boots
    const hum = win(T, 8.0, 10.4, 0.3, 0.3);
    p.k.notes = hum > 0.5 ? 1 : 0;
    p.head.rz += hum * sin(t * 3.5) * 0.08; p.hips.x += hum * sin(t * 3.5) * 0.3; p.mover.y += hum * abs(sin(t * 3.5)) * 0.25;
    if (hum > 0.3) { f.eyes = 'happy'; f.mouth = 'chew1'; }
  },
});

def('walk', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    // a heavy rolling stomp, arms swinging wide
    const P = 0.56, ph = (t / P) * TAU, sn = sin(ph), cs = cos(ph);
    rig.walk(p, ph, 0.5);
    p.hips.y = -0.5 + abs(cs) * 0.5;
    p.hips.rz = cs * 0.09; p.chest.rz = -cs * 0.06; p.hips.ry = -sn * 0.1;
    p.chest.rx = 0.08; p.head.rx = -0.06; p.head.rz = cs * 0.05;
    p.armL.rx = sn * 0.55; p.armR.rx = -sn * 0.55; p.armL.rz = 0.4; p.armR.rz = -0.4;
    p.foreL.rx = p.foreR.rx = -0.5; p.handL = p.handR = 'fist';
    stepEvents(s, ph, rig);
  },
});

def('wave', {
  loop: true, expr: 'happy',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.6);
    const wv = sin(t * 7.5);
    rig.reach(p, 1, 8.0 + wv * 0.8, 10.0, 2.6, [1, -0.6, 0.2]);
    p.wristL.rz = wv * 0.45 - 0.2; p.wristL.rx = -0.2; p.handL = 'open';
    onHip(p, rig, -1);
    p.chest.rz += 0.06; p.head.rz += -0.1 + sin(t * 3.8) * 0.05;
    f.mouth = 'grin';
  },
});

def('talk', {
  loop: true, expr: 'talk',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.7);
    const on = talkMouth(t, f, { rate: 6.5, open: 'open', mid: 'grin', shut: 'flat' });
    // gruff: a pointed claw -> a fist thump into the palm -> thumbs back in the straps
    const T = t % 6.6;
    const point = win(T, 0.3, 2.0, 0.25, 0.3), thump = win(T, 2.4, 4.0, 0.25, 0.25);
    thumbsIn(p, rig, 1 - max(point, thump));
    if (point > 0) {
      rig.reach(p, -1, 4.2, 6.4 + sin(t * 5) * 0.3, 7.6, [1, -0.5, -0.3], point);
      p.handR = 'point'; p.wristR.rx = -0.3; p.chest.ry -= point * 0.12;
      thumbsIn(p, rig, 0); rig.reach(p, 1, 3.5, 5.0, 6.0, [0.9, -0.2, -0.8], point); p.handL = 'thumb';
    }
    if (thump > 0) {
      const hit = abs(sin((T - 2.4) * 7));
      rig.reach(p, 1, 2.0, 3.6, 6.6, [1, -0.5, -0.5], thump);
      rig.reach(p, -1, 1.4, 3.8 + hit * 1.6, 6.8, [1, -0.5, -0.5], thump);
      p.handL = 'open'; p.handR = 'fist'; p.head.rx += thump * 0.06;
      if (beat(s, 'th', T - 2.4, PI / 7, 0)) rig._emit('grab');
    }
    p.head.rx += on ? sin(t * 6.5) * 0.04 : 0;
    p.head.rz += sin(t * 1.2) * 0.06;
  },
});

def('laugh', {
  loop: true, expr: 'laugh',
  fn(t, p, f, s, rig) {
    // a big wheezy belly laugh, paws on the overalls, helmet bouncing
    const ha = sin(t * 12);
    stand(p, rig, t, 0.3);
    rig.stance(p, 0.4 + abs(ha) * 0.35, 0.5, 0.5, 0.2);
    for (const sd of [1, -1]) rig.reach(p, sd, 4.8, 0.8 + abs(ha) * 0.4, 5.8, [0.9, -0.4, -0.6]);
    p.handL = p.handR = 'open'; p.wristL.rx = p.wristR.rx = 0.8;
    p.chest.s = 1 + ha * 0.04; p.chest.rx += -0.14 + ha * 0.04; p.head.rx += -0.24 + ha * 0.06;
    p.mover.y += abs(ha) * 0.22;
    p.head.rz = sin(t * 2.2) * 0.1;
    f.mouth = ha > -0.3 ? 'laugh' : 'open';
    if (beat(s, 'g', t, 0.9, 0.1)) rig._emit('laugh');
  },
});

const HAPPY_DUR = 1.9;
def('happy', {
  dur: HAPPY_DUR, expr: 'happy', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, HAPPY_DUR);
    // a stompy little jig: hop, click the boots, fists up
    const jump = K(t, [[0, 0], [0.2, -1.0, 'out'], [0.32, 0], [0.55, 3.2, 'out'], [0.8, 0, 'in'], [0.9, -0.8, 'out'], [1.02, 0], [1.18, 1.2, 'out'], [1.32, 0, 'in'], [1.42, -0.4], [1.6, 0]]);
    const up = win(t, 0.24, 1.45, 0.12, 0.35);
    stand(p, rig, t, 0.4);
    p.mover.y += max(0, jump);
    if (jump > 0.2) { p.thighL.rx = p.thighR.rx = -0.25; p.shinL.rx = p.shinR.rx = 0.5; p.thighL.rz = 0.1; p.thighR.rz = -0.1; }
    else rig.stance(p, max(0, -jump) * 1.4 + 0.4, 0.5, 0.5, 0.2);
    p.hips.s = 1 + (jump < 0 ? jump * 0.07 : 0.02);
    const fl = sin(t * 14) * 0.5 * up;
    rig.reach(p, 1, lerp(3.5, 6.6, up), lerp(5.0, 9.6, up) + fl, lerp(6.0, 2.6, up), [1, -0.6, -0.4]);
    rig.reach(p, -1, lerp(3.5, 6.6, up), lerp(5.0, 9.6, up) - fl, lerp(6.0, 2.6, up), [1, -0.6, -0.4]);
    p.handL = p.handR = up > 0.4 ? 'fist' : 'thumb';
    p.chest.rx -= up * 0.1; p.head.rx -= up * 0.12;
    p.k.spark = clamp((t - 0.45) / 1.2, 0, 1) * (t < 1.7 ? 1 : 0);
    f.mouth = up > 0.3 ? 'open' : 'grin';
    if (beat(s, 'l1', t, 99, 0.8) || beat(s, 'l2', t, 99, 1.32)) rig._emit('step');
  },
});

const SP = 3.6;
def('swing_pick', {
  dur: SP, expr: 'focused', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, SP);
    // grab the pick, spit on the paws, two big swings: CLANK! CLANK!
    stand(p, rig, t, 0.4);
    const grab = win(t, 0.0, SP - 0.25, 0.35, 0.3);
    const a = K(t, [[0, 0.3], [0.35, 0.2], [0.9, -0.8, 'out'], [1.22, 2.3, 'in'], [1.5, 2.15, 'out'], [1.95, -0.85, 'io'], [2.27, 2.3, 'in'], [2.6, 2.1, 'out'], [3.1, 0.4, 'io'], [SP, 0.3]]);
    const lean = K(t, [[0.4, 0], [1.2, 1, 'in'], [1.5, 0.7], [1.9, 0.1], [2.25, 1, 'in'], [2.6, 0.7], [3.1, 0]]);
    rig.stance(p, 0.4 + lean * 1.0, 0.0, 1.2, 0.24);
    p.chest.rx += lean * 0.42 - (a < 0 ? -a * 0.12 : 0); p.head.rx -= lean * 0.18;
    holdPick(p, rig, a, grab);
    if (grab < 0.5) { p.vis.pick = false; thumbsIn(p, rig, 1 - grab); }
    // the hits
    const h1 = K(t, [[1.2, 0], [1.22, 0.02], [1.8, 1, 'out']]) * (t >= 1.2 && t < 1.8 ? 1 : 0);
    const h2 = K(t, [[2.25, 0], [2.27, 0.02], [2.85, 1, 'out']]) * (t >= 2.25 && t < 2.85 ? 1 : 0);
    p.k.chips = max(h1, h2);
    if (t > 1.2 && t < 1.4) p.mover.y -= 0.4;
    if (t > 2.25 && t < 2.45) p.mover.y -= 0.4;
    if ((t > 1.22 && t < 1.6) || (t > 2.27 && t < 2.65)) f.eyes = 'shut';
    if (t > 3.0) f.expr = 'proud';
    if (beat(s, 'c1', t, 99, 1.22) || beat(s, 'c2', t, 99, 2.27)) rig._emit('clank');
  },
});

const BN = 4.6;
def('bite_nugget', {
  dur: BN, expr: 'neutral', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, BN);
    stand(p, rig, t, 0.5);
    thumbsIn(p, rig, 1);
    // dig in the bib pocket -> hold it up to the lamp, squint -> CHOMP -> proud grin, back in the pocket
    const fetch = win(t, 0.1, 0.8, 0.25, 0.2), hold = win(t, 0.7, 4.0, 0.3, 0.35);
    const m = rig.headPoint(p, 0.6, 8.2, _c);
    const up = win(t, 0.9, 2.4, 0.3, 0.3), bite = win(t, 2.6, 3.4, 0.15, 0.2);
    let x = lerp(3.5, 0.6, fetch), y = lerp(5.0, 3.0, fetch), z = lerp(6.0, 6.4, fetch);
    x = lerp(x, lerp(1.6, 1.2, bite), hold); y = lerp(y, lerp(lerp(7.0, m[0] + 3.2, up), m[0] - 1.6, bite), hold); z = lerp(z, lerp(lerp(7.6, m[1] + 2.4, up), m[1] + 2.2, bite), hold);
    rig.reach(p, -1, x, y, z, [1, -0.5, -0.4], max(fetch, hold));
    p.handR = hold > 0.3 ? 'fist' : 'open';
    p.vis.nugget = hold > 0.3;
    p.head.rx -= up * 0.28; p.chest.rx -= up * 0.05;
    if (up > 0.4) { f.expr = 'squint'; f.look = [0, -1]; }
    if (bite > 0.3) { f.mouth = 'chew2'; f.eyes = 'shut'; p.head.rx += bite * 0.1; }
    const yay = win(t, 3.4, 4.2, 0.12, 0.25);
    if (yay > 0) { f.expr = 'proud'; p.k.spark = yay; p.mover.y += abs(sin(t * 10)) * 0.5 * yay; }
    if (beat(s, 'b', t, 99, 2.8)) rig._emit('chomp');
  },
});

const GB = 5.0;
def('gentle_boom', {
  dur: GB, expr: 'neutral', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, GB);
    stand(p, rig, t, 0.5);
    // a stick of dynamite, the fuse fizzes... he holds it out at arm's length... pfft. A tiny puff.
    const hold = win(t, 0.2, 3.9, 0.3, 0.35);
    const out = win(t, 1.4, 3.4, 0.35, 0.3);
    thumbsIn(p, rig, 1 - hold);
    rig.reach(p, 1, lerp(3.4, 6.0, out), lerp(5.4, 7.2, out), lerp(6.4, 6.8, out), [1, -0.5, -0.3], hold);
    p.handL = 'fist'; p.vis.dyn = hold > 0.3;
    p.k.fuse = t > 0.7 && t < 3.0 ? 1 : 0;
    // the other paw shields his face
    const shield = win(t, 1.6, 3.1, 0.25, 0.3);
    const m = rig.headPoint(p, 0, 5.4, _c);
    rig.reach(p, -1, 1.8, m[0], m[1] + 3.6, [1, -0.4, -0.3], shield);
    if (shield > 0.3) p.handR = 'open';
    p.chest.rx -= out * 0.12; p.head.rx -= out * 0.1; p.head.ry -= out * 0.25;
    if (t > 0.7 && t < 3.0) f.expr = t > 1.6 ? 'scared' : 'surprised';
    p.k.smoke = K(t, [[3.0, 0], [3.9, 1, 'out']]) * (t > 2.98 && t < 3.9 ? 1 : 0);
    if (t > 3.1) {
      // ...it fizzled. Sheepish laugh.
      const ha = sin(t * 12);
      f.expr = 'laugh'; p.mover.y += abs(ha) * 0.2 * win(t, 3.2, 4.8, 0.2, 0.2); p.head.rz = sin(t * 3) * 0.1;
    }
    if (beat(s, 'fz', t, 99, 0.75)) rig._emit('fizz');
    if (beat(s, 'pf', t, 99, 3.0)) rig._emit('pfft');
  },
});

export { ANIMS as BADGER_ANIMS };
