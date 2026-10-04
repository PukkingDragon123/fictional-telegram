// RaccoonMerchant: "Rocco", the mushroom forest's black-market trader. A sly
// raccoon with a bandit mask, a big ringed tail, a tweed flat cap, a teal
// vest and mustard neckerchief, one gold tooth, and a HUGE overstuffed
// backpack: bedroll, copper pot, frying pan, rolled map, a net, trinkets and a
// swinging lantern.
//
//   const r = new RaccoonMerchant();  scene.add(r.root);
//   r.play('rummage');            // digs in the pack, pulls out the item -> 'show_item' (ta-da!)
//   r.setItem(obj);               // optional: show your own Object3D instead of the purple potion (null = potion)
//   r.onEvent = (name) => {};     // 'step' | 'clink' (coins) | 'bite' | 'clank' (pack) | 'pop' (item out) | 'tada' | 'snicker'
//
// Anims: idle wave talk laugh walk (sneaky tiptoe) happy count_coins rummage show_item
// Expressions: neutral happy talk surprised sleepy sly smug greedy (+ BASE_EXPRS)
// Walk speed: 'walk' ~0.45 units/s (move the root; the anim is in place).
// Units: 1 voxel = 0.05. Root at the feet, facing +Z. ~1.27 tall to the cap, ~1.55 to the net on top of the pack.
import * as THREE from 'three';
import {
  VS, FV, VoxelModel, rbox, ell, tone, buildGeo, geoCache, mirrorX, handModel, K, beat, win,
  sin, cos, abs, max, min, PI, TAU, clamp, lerp, smooth, SPARK_ROWS,
} from './critterKit.js';
import { BASE_EXPRS } from './critterFaces.js';
import { BipedRig, HAND_KINDS } from './critterBiped.js';
import { NpcFace, talkMouth, stepEvents, orientIn, COIN_ROWS } from './npcProps.js';

const C = {
  fur: 0x8a8a98, furD: 0x6e6e7c, furL: 0xa4a4b2, furDD: 0x4e4e5a,
  white: 0xf2f0ea, whiteD: 0xd8d4cc, mask: 0x2e2a36, maskL: 0x46424e, nose: 0x1e1a22, noseL: 0x4a4650,
  earIn: 0xd8a0a8, paw: 0x3a3642, pawD: 0x26222c,
  vest: 0x2e6a6a, vestD: 0x225250, vestL: 0x3e8682, brass: 0xe0b040, brassD: 0xb08020,
  shirt: 0xf0e6cc, shirtD: 0xd8caa8, scarf: 0xe8b030, scarfD: 0xc08a20, scarfL: 0xf8d060,
  pants: 0x6a4a34, pantsD: 0x543a28, pantsL: 0x80604a, patch: 0xc85a3a, patchD: 0x8a3a2a, shoe: 0x3a2a24, shoeL: 0x5a4234,
  cap: 0x7a5a3e, capD: 0x5e442e, capL: 0x947050,
  pack: 0xb09a6a, packD: 0x8e7a50, packL: 0xc8b484, strap: 0x6a4424, strapD: 0x4a2e18,
  roll: 0xc84a3a, rollD: 0x8a2a2a, rollL: 0xe8d8b0, pot: 0xd08a4a, potD: 0xa86a30, potL: 0xf0b070,
  pan: 0x3a3a44, panL: 0x5a5a66, map: 0xf0e2c0, mapD: 0xd4c49c, ribbon: 0xd83a4a, net: 0xd8c8a0, pole: 0x8a6a40,
  glow: 0xfff27a, iron: 0x3a3a42,
  gold: 0xffd23a, goldD: 0xd8a020, goldL: 0xfff0a0, potion: 0xa84ad8, potionD: 0x7a2ab0, potionL: 0xd8a0ff, glass: 0xd8f4ff, cork: 0xc89060,
};

const D = {
  CHIBI: { body: 0.8, head: 1.25, tail: 1.35 }, // [v20 npc rigs] small body, big head (BipedRig)
  HIP_Y: 8, WAIST: 1, NECK: 6.6, NECK_Z: 0.6, SH: [4.6, 5.2, 0], L_UP: 3.2, L_FORE: 3.0, L_HAND: 2.0,
  THIGH: 4.0, SHIN: 4.0, LEG_X: 2, EAR: [3.9, 6.2, -1.6], TAIL: [0.6, -3.2],
};
const MOUTH = [1.2, 6.2];

// ------------------------------------------------------------------ models
const furCol = (x, y, z) => tone(x, y, z, C.fur, C.furD, C.furL);
function surfZ(v, x, y, front = true) {
  if (front) { for (let z = 14; z >= -14; z--) if (v.has(x, y, z)) return z; }
  else for (let z = -14; z <= 14; z++) if (v.has(x, y, z)) return z;
  return null;
}
function pelvisModel() {
  const v = new VoxelModel();
  rbox(v, -4, 3, -3, 0, -3, 2, 1.4, (x, y, z) => (y === 0 ? C.pantsD : tone(x, y, z, C.pants, C.pantsD, C.pantsL)));
  // belt with a brass buckle and a coin pouch
  for (let x = -4; x <= 3; x++) { const z = surfZ(v, x, 0); v.set(x, 0, z, C.strapD); }
  v.set(-1, 0, 3, C.brass); v.set(0, 0, 3, C.brass);
  for (let y = -2; y <= 0; y++) for (let z = -1; z <= 1; z++) v.set(4, y, z, y === 0 ? C.strap : C.strapD);
  v.set(5, -1, 0, C.gold); v.set(4, 1, 0, C.gold);
  return v;
}
function torsoModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    const fx = abs(x + 0.5);
    if (z >= 1 && fx <= 1.6 && y >= 0) return tone(x, y, z, C.shirt, C.shirtD, C.shirt, 0.1, 0); // shirt in the vest opening
    if (y <= -1) return C.vestD;
    return tone(x, y, z, C.vest, C.vestD, C.vestL, 0.12, 0.08);
  };
  rbox(v, -4, 3, -1, 6, -3, 2, 1.6, col);
  rbox(v, -3, 2, -1, 3, -1, 3, 1.8, col); // tummy
  // vest buttons + a watch chain
  for (const y of [1, 3]) { const z = surfZ(v, 1, y); v.set(1, y, z + 1, C.brass); }
  for (const [x, y] of [[2, 2], [3, 1], [3, 0]]) { const z = surfZ(v, x, y); v.set(x, y, z + 1, C.gold); }
  // neck fur + neckerchief (knot at the front, a point hanging down)
  rbox(v, -2, 1, 6, 9, -2, 1, 0.9, (x, y, z) => (z >= 1 ? C.white : C.fur));
  for (let x = -4; x <= 3; x++) for (let z = -3; z <= 3; z++) if (v.has(x, 6, z) && (abs(x + 0.5) > 2 || abs(z + 0.5) > 1.6)) v.set(x, 7, z, (x + z) % 2 ? C.scarf : C.scarfL);
  for (let x = -2; x <= 1; x++) for (let z = -2; z <= 2; z++) v.set(x, 7, z, (x + z) % 3 === 0 ? C.scarfD : C.scarf);
  for (const [x, y] of [[-1, 6], [0, 6], [-1, 5], [0, 5], [0, 4]]) v.set(x, y, surfZ(v, x, y) + (y === 6 ? 1 : 1), y === 4 ? C.scarfD : C.scarf);
  // backpack straps over the shoulders
  for (const s of [-1, 1]) {
    const x = s > 0 ? 2 : -3;
    for (let y = 0; y <= 6; y++) { const z = surfZ(v, x, y); v.set(x, y, z + 1, y === 0 ? C.brass : C.strap); }
    for (let z = -3; z <= 2; z++) v.set(x, 7, z, C.strap);
  }
  return v;
}
function headModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    const fx = abs(x + 0.5);
    if (z >= 1) {
      // bandit mask: two lobes joined over the nose bridge
      const r = Math.hypot(fx - 2.6, (y + 0.5 - 4.4) * 1.2);
      if ((r < 2.6 || (fx < 2.6 && y >= 3.6 && y <= 5.2)) && y >= 2.6) return tone(x, y, z, C.mask, C.mask, C.maskL, 0, 0.1);
      if (y >= 5.6 && y <= 6.6 && fx >= 0.8 && fx <= 4.4) return C.white; // white brows
      if (y <= 3 && fx <= 3.6) return tone(x, y, z, C.white, C.whiteD, C.white, 0.1, 0); // white muzzle + cheeks
    }
    if (y >= 6 && z <= -1 && fx < 1.2) return C.furDD; // dark stripe up the forehead
    return furCol(x, y, z);
  };
  rbox(v, -5, 4, 0, 7, -4, 3, 2.8, col);
  // cheek ruffs sticking out
  for (const s of [-1, 1]) for (let y = 1; y <= 3; y++) for (let z = -1; z <= 2; z++) { const x = s > 0 ? 5 : -6; if ((y + z) % 3 !== 0) v.set(x, y, z, y === 1 ? C.whiteD : C.white); if (y === 2 && z === 0) v.set(x + s, y, z, C.white); }
  // pointy muzzle + nose
  rbox(v, -2, 1, 0, 2, 3, 5, 1.0, (x, y, z) => (y >= 2 && z <= 3 ? C.white : tone(x, y, z, C.white, C.whiteD, C.white, 0.08, 0)));
  v.set(-1, 2, 6, C.noseL); v.set(0, 2, 6, C.nose); v.set(-1, 3, 5, C.nose); v.set(0, 3, 5, C.nose);
  return v;
}
function earModel() {
  const v = new VoxelModel();
  const rows = [[0, 2], [0, 2], [0, 1], [0, 1]];
  rows.forEach(([a, b], y) => { for (let x = a; x <= b; x++) for (let z = -1; z <= 0; z++) v.set(x, y, z, z === 0 && x === 1 && y <= 2 ? C.earIn : y === 3 || x === b ? C.white : C.furD); });
  return v;
}
function capModel() {
  const v = new VoxelModel();
  // flat cap: low crown, slopes to a short brim at the front
  for (let x = -4; x <= 3; x++)
    for (let z = -5; z <= 3; z++) {
      const r = Math.hypot((x + 0.5) / 4.3, (z + 1) / 4.6);
      if (r > 1) continue;
      const h = z > 1 ? 1 : 2;
      for (let y = 0; y <= h; y++) v.set(x, y, z, (x * 3 + y + z * 5) % 4 === 0 ? C.capD : (x + z) % 3 === 0 ? C.capL : C.cap);
    }
  for (let x = -3; x <= 2; x++) for (let z = 4; z <= 5; z++) v.set(x, 0, z, z === 5 ? C.capD : C.cap);
  v.set(-1, 3, -1, C.capD); v.set(0, 3, -1, C.capD); // button
  for (let x = -3; x <= 2; x++) v.set(x, 1, 3, C.capD); // snap seam
  return v;
}
function upperModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_UP, 0, -1, 1, 1.0, (x, y, z) => (y >= -2 ? (y === -2 ? C.shirtD : tone(x, y, z, C.shirt, C.shirtD, C.shirt)) : furCol(x, y, z)));
  return v;
}
function foreModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_FORE - 1, 0, -1, 1, 1.2, (x, y, z) => (y <= -D.L_FORE ? C.paw : y === 0 ? C.shirtD : furCol(x, y, z)));
  return v;
}
function thighModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.THIGH, 1, -1, 1, 1.0, (x, y, z) => tone(x, y, z, C.pants, C.pantsD, C.pantsL));
  for (let y = -3; y <= -2; y++) for (let x = -1; x <= 0; x++) v.set(x, y, 2, (x + y) % 2 ? C.patch : C.patchD); // knee patch
  return v;
}
function shinModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.SHIN + 1, 0, -1, 1, 1.1, (x, y, z) => (y >= -2 ? tone(x, y, z, C.pants, C.pantsD, C.pantsL) : C.paw));
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 0; z++) v.set(x, -1, z, C.pantsD); // rolled cuff
  rbox(v, -1, 1, -D.SHIN, -D.SHIN + 1, -1, 2, 0.6, (x, y, z) => (z === 2 && y === -D.SHIN + 1 ? C.noseL : C.pawD));
  return v;
}
// ringed tail segments (hang back from the joint along -Z)
function tailSegModel(tip) {
  const v = new VoxelModel();
  ell(v, 0, 0, -2.0, 2.6, 2.6, 2.5, (x, y, z) => {
    const band = Math.floor((-z + 0.5) / 1.7) % 2;
    if (tip && z <= -3) return C.mask;
    return band ? tone(x, y, z, C.mask, C.mask, C.maskL, 0, 0.12) : tone(x, y, z, C.furL, C.fur, 0xc4c4cc, 0.15, 0.15);
  });
  return v;
}
function packModel() {
  const v = new VoxelModel();
  // overstuffed canvas sack (pivot at the middle of its front face, against his back)
  const body = (x, y, z) => tone(x, y, z, C.pack, C.packD, C.packL, 0.14, 0.1);
  rbox(v, -5, 4, -6, 6, -9, 0, 2.6, body);
  ell(v, 0, 1.5, -5, 6.2, 5.6, 5.2, body); // bulging
  // flap + buckles
  for (let x = -5; x <= 4; x++) for (let z = -9; z <= -1; z++) if (v.has(x, 6, z)) v.set(x, 7, z, (x + z) % 4 === 0 ? C.packD : C.packL);
  for (const x of [-3, 2]) for (let y = 3; y <= 7; y++) { const z = surfZ(v, x, y, false); if (z !== null) v.set(x, y, z - (y === 7 ? 0 : 0), y === 4 ? C.brass : C.strap); }
  // side patch + stitched pocket
  for (let y = -4; y <= -1; y++) for (let z = -8; z <= -5; z++) v.set(-7, y, z, (y + z) % 2 ? C.patch : C.patchD);
  // bedroll on top (red plaid)
  for (let x = -6; x <= 5; x++)
    for (let y = 8; y <= 11; y++)
      for (let z = -7; z <= -3; z++) {
        if (Math.hypot(y - 9.5, z + 5) > 2.4) continue;
        const pl = (x + 20) % 3 === 0 || (y + z + 20) % 3 === 0;
        v.set(x, y, z, x === -6 || x === 5 ? C.rollD : pl ? C.rollL : (x + y) % 2 ? C.roll : C.rollD);
      }
  for (const x of [-4, 3]) for (let y = 7; y <= 12; y++) { if (Math.hypot(y - 9.5, -3 + 5) <= 2.6) v.set(x, y, -2, C.strap); }
  // rolled map + a net on a pole poking out of the top
  for (let y = 7; y <= 12; y++) { v.set(-3, y, -6, y === 10 ? C.ribbon : C.map); v.set(-2, y, -6, y === 10 ? C.ribbon : C.mapD); }
  v.set(-3, 13, -6, C.mapD);
  for (let y = 7; y <= 11; y++) v.set(2, y, -8, C.pole);
  for (let x = 1; x <= 5; x++) for (let y = 11; y <= 15; y++) if (Math.hypot(x - 3, y - 13) < 1.9 && (x + y) % 2 === 0) v.set(x, y, -8, C.net);
  for (let a = 0; a < 12; a++) v.set(Math.round(3 + 1.9 * cos((a / 12) * TAU)), Math.round(13 + 1.9 * sin((a / 12) * TAU)), -8, C.pole);
  // trinkets peeking out from under the flap: a sock, a clock, a fish skeleton sign
  v.set(4, 7, -1, 0xd85a8a); v.set(4, 8, -1, 0xd85a8a); v.set(5, 8, -1, 0xf0f0f0);
  v.set(-5, 7, -2, C.gold); v.set(-5, 8, -2, C.goldD); v.set(-6, 8, -2, C.white);
  // copper pot (left side) + frying pan (right side, hanging)
  for (let y = -3; y <= 1; y++)
    for (let z = -7; z <= -2; z++)
      for (let x = 6; x <= 9; x++) {
        const r = Math.hypot(y + 1, z + 4.5);
        if (r > 2.6 || x < 6) continue;
        v.set(x, y, z, x === 9 ? (r < 1.6 ? C.potD : C.pot) : r > 2 ? C.potL : C.pot);
      }
  v.set(10, -1, -4, C.potD); v.set(10, -1, -5, C.potD); v.set(7, 2, -4, C.iron); v.set(7, 2, -5, C.iron);
  // frying pan hanging on the back
  for (let y = -5; y <= 0; y++) for (let x = -4; x <= 1; x++) if (Math.hypot(y + 2.5, x + 1.5) < 2.7) v.set(x, y, -12, Math.hypot(y + 2.5, x + 1.5) > 2 ? C.panL : C.pan);
  for (let y = 1; y <= 4; y++) v.set(-2, y, -12, C.strapD);
  v.set(-2, 5, -11, C.brass);
  return v;
}
function lanternModel() {
  const v = new VoxelModel();
  rbox(v, -2, 1, -7, -2, -2, 1, 0.5, (x, y, z) => (y === -7 || y === -2 ? C.iron : (abs(x + 0.5) > 1 && abs(z + 0.5) > 1) ? C.iron : C.glow));
  v.set(-1, -1, 0, C.iron); v.set(0, -1, -1, C.iron); v.set(-1, 0, -1, C.iron); v.set(0, 0, 0, C.iron);
  v.set(-1, -8, -1, C.iron); v.set(0, -8, 0, C.iron);
  return v;
}
function coinStackModel() {
  const v = new VoxelModel();
  for (let k = 0; k < 4; k++)
    for (let x = -2; x <= 1; x++)
      for (let z = -2; z <= 1; z++) {
        if (abs(x + 0.5) + abs(z + 0.5) > 2.6) continue;
        v.set(x + (k % 2), k, z, k % 2 ? C.goldD : (x + z) % 2 ? C.gold : C.goldL);
      }
  return v;
}
function coinModel() {
  const v = new VoxelModel();
  for (let x = -2; x <= 1; x++) for (let y = -2; y <= 1; y++) if (abs(x + 0.5) + abs(y + 0.5) <= 2.6) v.set(x, y, 0, (x === -1 && y === 0) || (x === 0 && y === -1) ? C.goldD : x === -2 || y === 1 ? C.goldL : C.gold);
  return v;
}
function potionModel() {
  const v = new VoxelModel();
  ell(v, 0, 3.2, 0, 3.3, 3.3, 3.3, (x, y, z) => (y >= 5 ? C.glass : x <= -2 && y >= 3 ? C.potionL : (x + y + z) % 3 === 0 ? C.potionD : C.potion));
  for (let y = 6; y <= 9; y++) for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) v.set(x, y, z, C.glass);
  for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) { v.set(x, 10, z, C.cork); v.set(x, 11, z, C.cork); }
  v.set(-1, 3, 3, 0xfff0a0); v.set(1, 4, 3, 0xffffff); v.set(0, 2, 3, 0xfff0a0); // sparkles inside
  v.set(1, 8, 0, C.ribbon); v.set(1, 7, 0, C.ribbon); v.set(2, 6, 0, C.gold); // a little price tag
  return v;
}

const cache = geoCache(() => {
  const G = {
    pelvis: buildGeo(pelvisModel()), torso: buildGeo(torsoModel()), head: buildGeo(headModel()),
    earL: buildGeo(earModel()), earR: buildGeo(mirrorX(earModel())), cap: buildGeo(capModel()),
    upper: buildGeo(upperModel(), [0.5, 0, 0.5]), fore: buildGeo(foreModel(), [0.5, 0, 0.5]),
    thigh: buildGeo(thighModel(), [0.5, 0, 0.5]), shin: buildGeo(shinModel(), [0.5, 0, 0.5]),
    tail: buildGeo(tailSegModel(false), [0, 0, 0]), tailTip: buildGeo(tailSegModel(true), [0, 0, 0]),
    pack: buildGeo(packModel(), [0, 0, 0]), lantern: buildGeo(lanternModel(), [0, 0, 0], FV),
    coins: buildGeo(coinStackModel(), [0, 0, 0], FV), coin: buildGeo(coinModel(), [0, 0, 0.5], FV), potion: buildGeo(potionModel(), [0, 0, 0], FV),
  };
  for (const k of HAND_KINDS) {
    G['hand_' + k + 'L'] = buildGeo(handModel(k, 1, C.paw, C.pawD), [0, 0, 0], FV);
    G['hand_' + k + 'R'] = buildGeo(handModel(k, -1, C.paw, C.pawD), [0, 0, 0], FV);
  }
  return G;
});

// ------------------------------------------------------------------ face
const FACE = {
  w: 40, h: 20, eyes: [{ x: 9.6, y: 10 }, { x: 30.4, y: 10 }], rx: 4.6, ry: 5.0, style: 'toon',
  blush: [{ x: 4, y: 18 }, { x: 36, y: 18 }], blushW: 3,
  mw: 16, mh: 12, mx: 8, my: 2, mstyle: 'deer', mHalf: 4,
  pal: { f: '#5a5466', F: '#14101a', b: '#f2f0ea', w: '#fffaf0', g: '#ffd23a', G: '#c8901a', j: '#fff8c0' },
};
/** One gold tooth: shows in open mouths, glints at the corner of a smile. */
function goldTooth(P, st) {
  const m = st.mouth || 'smile';
  if (m === 'grin' || m === 'open' || m === 'laugh' || m === 'yell') {
    for (let x = 9; x <= 10; x++) for (let y = 3; y <= 4; y++) P.set(x, y, y === 4 ? 'G' : 'g');
    P.set(9, 3, 'j');
    for (let x = 6; x <= 8; x++) P.set(x, 3, 'e'); // a couple of plain teeth beside it
  } else if (m === 'smile' || m === 'cheeky') {
    P.set(11, 3, 'g'); P.set(11, 4, 'G'); P.set(12, 3, 'j');
  }
}
const EXPRS = {
  ...BASE_EXPRS,
  neutral: { eyes: 'open', brows: null, mouth: 'smile', blush: 0, tear: 0 },
  happy: { eyes: 'happy', brows: null, mouth: 'grin', blush: 1, tear: 0 },
  talk: { eyes: 'half', brows: 'up', mouth: 'open', blush: 0, tear: 0 },
  surprised: { eyes: 'wide', brows: 'raised', mouth: 'o', blush: 0, tear: 0 },
  sleepy: { eyes: 'sleepy', brows: null, mouth: 'flat', blush: 0, tear: 0 },
  sly: { eyes: 'half', brows: 'flat', mouth: 'cheeky', blush: 0, tear: 0 },
  smug: { eyes: 'half', brows: 'flat', mouth: 'cheeky', blush: 0, tear: 0 },
  greedy: { eyes: 'shiny', brows: 'up', mouth: 'grin', blush: 1, tear: 0 },
};

// ------------------------------------------------------------------ rig
export class RaccoonMerchant extends BipedRig {
  constructor({ shadows = true } = {}) {
    super('RaccoonMerchant', { shadows });
    const G = (this._G = cache.get());
    this._geoCache = cache;
    this._buildBiped(G, D);
    this.joint('tail2', this.tail, 0, 0, -3.6); this.mesh(G.tail, this.tail2);
    this.joint('tail3', this.tail2, 0, 0, -3.6); this.mesh(G.tailTip, this.tail3);
    this.joint('cap', this.head, 0, 7.5, -0.6);
    const capTilt = new THREE.Group(); capTilt.rotation.set(-0.14, 0, 0.06); this.cap.add(capTilt);
    this.mesh(G.cap, capTilt);
    this.joint('pack', this.chest, 0, 7.6, -3.6);
    this.mesh(G.pack, this.pack);
    this.joint('lantern', this.pack, -7.6, 5.2, -6.0);
    this.lanternMesh = this.mesh(G.lantern, this.lantern);
    this.lanternMesh.material = this.lanternMesh.material.clone();
    this.lanternMesh.material.emissive = new THREE.Color(0x6a5a10);
    this._owned.push(this.lanternMesh.material);
    this.face = new NpcFace(FACE, { mouth: goldTooth });
    this.facePlane(this.face.eyes.tex, this.head, FACE.w, FACE.h, 0, 6.6 - FACE.h / 8, 4);
    this.facePlane(this.face.mouth.tex, this.head, FACE.mw, FACE.mh, 0, 2.4 - FACE.mh / 8, 6);
    // coins (left palm), single coin + item (right hand)
    this.coins = this.mesh(G.coins, this.gripL);
    this.coin = this.mesh(G.coin, this.gripR);
    this.itemSlot = new THREE.Group(); this.gripR.add(this.itemSlot);
    this.potion = this.mesh(G.potion, this.itemSlot, { y: -0.02 });
    this._item = null;
    this.sparks = [0, 1, 2].map(() => this.sprite(SPARK_ROWS, 0.07, this.space));
    this.coinFx = [0, 1, 2].map(() => this.sprite(COIN_ROWS, 0.06, this.space));
    this.scalar('spark', 0);
    this.scalar('coinFx', 0);
    this.scalar('coinN', 4);
    this.jiggle('earL', 'rz', { k: 180, c: 9, ay: -0.02, ax: 0.02, probe: 'head' });
    this.jiggle('earR', 'rz', { k: 180, c: 9, ay: 0.02, ax: 0.02, probe: 'head' });
    this.jiggle('cap', 'rx', { k: 280, c: 13, az: -0.008, ay: 0.004, max: 0.25, probe: 'head' });
    this.jiggle('pack', 'rx', { k: 120, c: 7, az: 0.012, ay: 0.008, max: 0.25, probe: 'chest' });
    this.jiggle('pack', 'rz', { k: 120, c: 7, ax: -0.012, max: 0.2, probe: 'chest' });
    this.jiggle('pack', 's', { k: 180, c: 8, ay: 0.003, max: 0.06, probe: 'chest' });
    this.jiggle('lantern', 'rx', { k: 40, c: 2.2, az: 0.05, ay: 0.01, max: 0.8, probe: 'pack' });
    this.jiggle('lantern', 'rz', { k: 40, c: 2.2, ax: -0.05, max: 0.7, probe: 'pack' });
    this.jiggle('tail', 'ry', { k: 90, c: 6, ax: 0.03, yaw: 0.03, max: 0.6, probe: 'hips' });
    this.jiggle('tail2', 'ry', { k: 80, c: 5, ax: 0.03, yaw: 0.03, max: 0.6, probe: 'tail' });
    this.jiggle('tail3', 'ry', { k: 70, c: 4.5, ax: 0.03, max: 0.6, probe: 'tail2' });
    this.jiggle('tail2', 'rx', { k: 90, c: 5, ay: 0.03, max: 0.5, probe: 'tail' });
    this.jiggle('chest', 's', { k: 260, c: 10, ay: 0.002, max: 0.06, probe: 'hips' });
    this._init(ANIMS, EXPRS, 'idle');
  }
  /** Show your own Object3D in 'show_item' / 'rummage' instead of the potion (null = the potion). */
  setItem(obj) {
    if (this._item && this._item.parent === this.itemSlot) this.itemSlot.remove(this._item);
    this._item = obj || null;
    if (obj) { obj.position.set(0, -0.02, 0); this.itemSlot.add(obj); }
    return this;
  }
  _post(p, dt) {
    this._setHands(p);
    const k = this.k;
    this.coins.visible = !!p.vis.coins;
    this.coins.scale.set(1, clamp(k.coinN, 0.5, 4) / 4, 1);
    if (this.coins.visible) { orientIn(this.coins, this.chest, [0, 1, 0.15], [0, 0, 1]); this.coins.position.set(0.004, -0.004, 0.01); }
    this.coin.visible = !!p.vis.coin;
    if (this.coin.visible) orientIn(this.coin, this.chest, [0, 1, 0], [0, -0.2, 1]);
    this.itemSlot.visible = !!p.vis.item;
    this.potion.visible = !this._item;
    if (this.itemSlot.visible) orientIn(this.itemSlot, this.chest, [0, 1, 0], [0, 0, 1], 1);
    // sprites
    const tz = this.time;
    this.headFx.updateWorldMatrix(true, false);
    _w.set(0, 4 * VS, 4 * VS); this.headFx.localToWorld(_w); this.space.worldToLocal(_w);
    const sp = k.spark;
    this.sparks.forEach((s, i) => {
      s.visible = sp > 0.05;
      const a = i * 2.1 + tz * 1.6;
      s.position.set(cos(a) * 0.3, _w.y + 0.05 + sin(a * 1.3) * 0.15, sin(a) * 0.1 + 0.18);
      s.scale.setScalar(0.07 * sin(clamp(sp, 0, 1) * PI) * (0.7 + 0.3 * sin(tz * 9 + i)));
    });
    this.coinFx.forEach((s, i) => {
      const u = (tz * 0.9 + i / 3) % 1;
      s.visible = k.coinFx > 0.5;
      s.position.set((i - 1) * 0.18 + sin(u * 7 + i) * 0.02, _w.y + 0.2 + u * 0.32, 0.14);
      s.scale.setScalar(0.06 * (u < 0.8 ? 1 : (1 - u) / 0.2) * min(1, u * 6));
    });
  }
}
const _w = new THREE.Vector3();

// ------------------------------------------------------------------ pose helpers
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };
const _hp = [0, 0];
const ff = (t, d) => (t > d ? t % d : t);

/** Slouchy stance: shoulders a little hunched under the pack, tail curled up behind. */
function stand(p, rig, t, amt = 1) {
  rig.life(t, p, amt);
  rig.stance(p, 0.5, 0.7, 0.1, 0.08);
  p.chest.rx += 0.1; p.head.rx -= 0.1;
  tailPose(p, t, amt);
}
function tailPose(p, t, amt = 1) {
  const sw = sin(t * 1.6);
  p.tail.rx = 0.3; p.tail2.rx = 0.85; p.tail3.rx = 0.8;
  p.tail.ry = 1.45 + sw * 0.18 * amt; p.tail2.ry = sin(t * 1.6 - 0.7) * 0.3 * amt; p.tail3.ry = sin(t * 1.6 - 1.4) * 0.35 * amt;
}
/** Paws held together in front of the tummy (greedy rub when rub > 0). */
function rubPaws(p, rig, t, rub = 0) {
  const r = sin(t * 14) * rub;
  rig.reach(p, 1, 1.6 + r * 0.4, 2.4 + r * 0.25, 5.6, [0.9, -0.5, -0.6]);
  rig.reach(p, -1, 1.6 - r * 0.4, 2.4 - r * 0.25, 5.6, [0.9, -0.5, -0.6]);
  p.wristL.rx = p.wristR.rx = 0.6; p.wristL.rz = 0.5; p.wristR.rz = -0.5;
  p.handL = p.handR = 'open';
}

// ------------------------------------------------------------------ animations
def('idle', {
  loop: true, expr: 'sly',
  fn(t, p, f, s, rig) {
    stand(p, rig, t);
    const sway = sin(t * 0.9);
    p.hips.x = sway * 0.3; p.hips.rz = sway * 0.03; p.chest.rz = -sway * 0.04;
    const T = t % 9;
    // shifty glances both ways
    p.head.ry = K(T, [[0, 0], [1.2, 0], [1.35, 0.55, 'out'], [2.1, 0.55], [2.25, -0.55, 'out'], [3.0, -0.55], [3.2, 0]]);
    f.look = [p.head.ry * 2, 0];
    if (T > 1.2 && T < 3.2) f.eyes = 'focused';
    // greedy paw rub, then the hands rest on the belt; cap tug
    const rub = win(T, 3.6, 5.6, 0.25, 0.3);
    const rest = 1 - rub;
    rubPaws(p, rig, t, rub);
    if (rest > 0.01) {
      rig.reach(p, 1, 4.6, -0.6, 3.6, [0.8, -0.2, -1], rest);
      rig.reach(p, -1, 4.6, -0.6, 3.6, [0.8, -0.2, -1], rest);
      if (rest > 0.5) { p.handL = p.handR = 'fist'; p.wristL.rz = p.wristR.rz = 0; }
    }
    if (rub > 0.4) { f.expr = 'greedy'; f.mouth = 'grin'; }
    const tug = win(T, 6.6, 7.6, 0.25, 0.3);
    if (tug > 0) {
      const c = rig.headPoint(p, 7.4, 6.6, _hp);
      rig.reach(p, -1, 2.0, c[0] - 2.0, c[1] + 0.6, [1, -0.6, -0.2], tug);
      p.handR = 'fist'; p.cap.rx = -tug * 0.18; p.head.rx += tug * 0.08;
    }
    p.tail.ry += win(T, 4.0, 5.4) * sin(t * 6) * 0.3;
  },
});

def('walk', {
  loop: true, expr: 'sly',
  fn(t, p, f, s, rig) {
    // sneaky tiptoe: crouched, high knees, paws up, head darting left and right
    const P = 0.9, ph = (t / P) * TAU, sn = sin(ph), cs = cos(ph);
    const up = (x) => max(0, x);
    p.hips.y = -1.6 + abs(sn) * 0.6;
    p.hips.rx = 0.18; p.chest.rx = 0.3; p.head.rx = -0.35;
    rig.legTo(p, 1, -p.mover.y + up(sn) * 2.6, 1.0 + cs * 2.2);
    rig.legTo(p, -1, -p.mover.y + up(-sn) * 2.6, 1.0 - cs * 2.2);
    p.thighL.rz = 0.1; p.thighR.rz = -0.1;
    p.hips.rz = sn * 0.05; p.hips.ry = -cs * 0.08;
    // paws up in front like a cartoon burglar
    const bob = sin(ph * 2) * 0.3;
    rig.reach(p, 1, 3.2, 5.6 + bob, 6.0, [0.9, -0.6, -0.4]);
    rig.reach(p, -1, 3.2, 5.6 - bob, 6.0, [0.9, -0.6, -0.4]);
    p.wristL.rx = p.wristR.rx = 1.1;
    p.handL = p.handR = 'relax';
    p.head.ry = K(t % 3.6, [[0, 0], [0.6, 0], [0.75, 0.6, 'out'], [1.3, 0.6], [1.45, -0.6, 'out'], [2.1, -0.6], [2.3, 0]]);
    f.look = [p.head.ry * 2, 0];
    tailPose(p, t, 0.6);
    p.tail.rx = 0.0; p.tail2.rx = 0.3 + sn * 0.1;
    stepEvents(s, ph, rig);
  },
});

def('wave', {
  loop: true, expr: 'sly',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.6);
    rig.reach(p, 1, 4.6, -0.6, 3.6, [0.8, -0.2, -1]); p.handL = 'fist';
    // "psst, over here": a lazy wave that ends in a two-finger cap salute
    const wv = sin(t * 7);
    rig.reach(p, -1, 7.6 + wv * 0.8, 10.4, 3.0, [1, -0.6, 0.2]);
    p.wristR.rz = -wv * 0.35 + 0.2; p.wristR.rx = -0.2;
    p.handR = 'open';
    p.chest.rz -= 0.05; p.head.rz += 0.12 + sin(t * 3.5) * 0.04;
    f.mouth = 'grin';
    if ((t % 2.4) > 1.8) f.eyes = 'closed'; // a wink-ish squint
  },
});

def('talk', {
  loop: true, expr: 'talk',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.7);
    const on = talkMouth(t, f, { rate: 8, open: 'open', mid: 'grin', shut: 'cheeky', o: 'smile' });
    // salesman patter: palms out "have I got a deal" -> point at you -> rub fingers ($) -> hand on heart "trust me"
    const T = t % 6.6;
    const deal = win(T, 0.2, 1.9, 0.25, 0.25), point = win(T, 2.1, 3.3, 0.2, 0.25), money = win(T, 3.5, 4.8, 0.25, 0.25), heart = win(T, 5.0, 6.3, 0.25, 0.3);
    let lx = 4.6, ly = -0.6, lz = 3.6;
    lx = lerp(lx, 6.8, deal); ly = lerp(ly, 4.4, deal); lz = lerp(lz, 5.4, deal);
    lx = lerp(lx, 2.4, heart); ly = lerp(ly, 4.6, heart); lz = lerp(lz, 4.8, heart);
    rig.reach(p, 1, lx, ly, lz, [0.9, -0.5, -0.4]);
    let rx = 4.6, ry = -0.6, rz = 3.6;
    rx = lerp(rx, 6.8, deal); ry = lerp(ry, 4.4 + sin(t * 5) * 0.3, deal); rz = lerp(rz, 5.4, deal);
    rx = lerp(rx, 2.6, point); ry = lerp(ry, 6.0, point); rz = lerp(rz, 8.6 + abs(sin(t * 9)) * 0.6, point);
    rx = lerp(rx, 3.4, money); ry = lerp(ry, 5.0, money); rz = lerp(rz, 6.4, money);
    rig.reach(p, -1, rx, ry, rz, [0.9, -0.5, -0.4]);
    p.handL = deal > 0.5 ? 'open' : heart > 0.5 ? 'open' : 'fist';
    p.handR = point > 0.5 ? 'point' : money > 0.5 ? 'thumb' : deal > 0.5 ? 'open' : 'fist';
    p.wristR.rz = money * sin(t * 16) * 0.3 - deal * 0.4; p.wristL.rz = deal * 0.4;
    p.wristL.rx = heart * 0.6;
    p.chest.rx += point * 0.12 - heart * 0.06; p.head.rx += (on ? sin(t * 8) * 0.04 : 0);
    p.head.rz += sin(t * 1.4) * 0.08 + heart * 0.12;
    p.chest.ry = deal * 0.05 - point * 0.15;
    if (money > 0.5) { f.expr = 'greedy'; }
    if (heart > 0.5) { f.eyes = 'closed'; }
  },
});

def('laugh', {
  loop: true, expr: 'sly',
  fn(t, p, f, s, rig) {
    // "heh heh heh": hunched snicker behind a paw, shoulders bouncing, then a big cackle
    const T = t % 4.4, cackle = win(T, 2.6, 4.1, 0.2, 0.3);
    const ha = sin(t * 14);
    stand(p, rig, t, 0.3);
    rig.stance(p, 0.5 + abs(ha) * 0.3, 0.7, 0.1, 0.08);
    p.chest.rx += lerp(0.18, -0.2, cackle) + ha * 0.05; p.head.rx += lerp(0.1, -0.4, cackle) + ha * 0.06;
    p.chest.y += abs(ha) * 0.3 * (1 - cackle);
    const m = rig.headPoint(p, 1.6, 6.4, _hp);
    rig.reach(p, -1, lerp(1.6, 3.4, cackle), lerp(m[0] - 2.4, 1.4, cackle), lerp(m[1] + 0.4, 6.0, cackle), [1, -0.6, -0.2]);
    p.wristR.rx = lerp(-0.4, 0.6, cackle); p.handR = 'open';
    rig.reach(p, 1, lerp(3.0, 3.4, cackle), lerp(1.4, 1.4 + ha * 0.3, cackle), 6.0, [0.9, -0.4, -0.6]);
    p.handL = 'open'; p.wristL.rx = 0.6;
    p.tail.ry += sin(t * 9) * 0.3;
    f.expr = cackle > 0.4 ? 'laugh' : 'sly';
    f.mouth = cackle > 0.4 ? (ha > -0.3 ? 'laugh' : 'open') : ha > 0 ? 'cheeky' : 'grin';
    if (beat(s, 'sn', t, 0.9, 0.1)) rig._emit('snicker');
  },
});

const HAPPY_DUR = 1.9;
def('happy', {
  dur: HAPPY_DUR, expr: 'greedy', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, HAPPY_DUR);
    // "ka-ching!": rub paws, hop and click heels, fists pump, coins fly
    const jump = K(t, [[0, 0], [0.45, 0], [0.6, -1.1, 'out'], [0.7, 0], [0.92, 4.2, 'out'], [1.2, 0, 'in'], [1.3, -0.8, 'out'], [1.5, 0]]);
    const air = smooth(jump / 2);
    stand(p, rig, t, 0.4);
    p.mover.y += max(0, jump);
    if (jump > 0.3) {
      // heel click: feet swing together out to the side
      p.thighL.rx = p.thighR.rx = -0.25; p.shinL.rx = p.shinR.rx = 0.8;
      p.thighL.rz = -0.25 * air + 0.05; p.thighR.rz = 0.25 * air - 0.05;
      p.hips.rz = 0.15 * air;
    } else rig.stance(p, 0.5 + max(0, -jump) * 1.5, 0.7, 0.1, 0.08);
    const rub = win(t, 0, 0.55, 0.1, 0.12);
    rubPaws(p, rig, t, rub);
    const pump = win(t, 0.6, 1.6, 0.12, 0.3);
    if (pump > 0) {
      rig.reach(p, 1, 5.6, lerp(2.4, 10.4, pump) + sin(t * 18) * 0.4, 3.0, [1, -0.6, -0.4], pump);
      rig.reach(p, -1, 5.6, lerp(2.4, 10.4, pump) - sin(t * 18) * 0.4, 3.0, [1, -0.6, -0.4], pump);
      if (pump > 0.4) p.handL = p.handR = 'fist';
    }
    p.chest.rx -= pump * 0.2; p.head.rx -= pump * 0.2;
    p.k.spark = clamp((t - 0.6) / 1.1, 0, 1) * (t < 1.7 ? 1 : 0);
    p.k.coinFx = t > 0.7 && t < 1.8 ? 1 : 0;
    f.mouth = pump > 0.3 ? 'open' : 'grin';
    tailPose(p, t * 3, 1.4);
    if (beat(s, 'l', t, 99, 1.2)) rig._emit('step');
  },
});

const CC = 4.6;
def('count_coins', {
  dur: CC, expr: 'greedy', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, CC);
    stand(p, rig, t, 0.5);
    const hold = win(t, 0, 4.2, 0.35, 0.35);
    // left palm up with a stack of coins; right finger taps each coin, then one gets the gold-tooth bite test
    rig.reach(p, 1, lerp(4.6, 1.8, hold), lerp(-0.6, 3.0, hold), lerp(3.6, 6.4, hold), [0.9, -0.5, -0.6]);
    p.wristL.rx = 0.5; p.handL = 'open';
    p.vis.coins = hold > 0.4;
    const n = 1 + Math.min(4, Math.floor(max(0, t - 0.5) / 0.5));
    p.k.coinN = t < 2.7 ? 4 : t < 3.6 ? 3 : 4;
    const taps = win(t, 0.5, 2.6, 0.15, 0.2);
    const tap = max(0, sin((t - 0.5) * TAU * 2)) * taps;
    const bite = win(t, 2.75, 3.6, 0.25, 0.25);
    const mth = rig.headPoint(p, MOUTH[0], MOUTH[1], _hp);
    let rx = lerp(4.6, 0.6, hold), ry = lerp(-0.6, 4.6 + tap * 0.9, hold), rz = lerp(3.6, 7.4, hold);
    rx = lerp(rx, 0.8, bite); ry = lerp(ry, mth[0] - 2.4, bite); rz = lerp(rz, mth[1] + 0.8, bite);
    rig.reach(p, -1, rx, ry, rz, [1, -0.5, -0.4]);
    p.handR = bite > 0.3 ? 'fist' : taps > 0.3 ? 'point' : 'relax';
    p.wristR.rx = -0.3 - bite * 0.6;
    p.vis.coin = bite > 0.2;
    p.head.rx += 0.25 * taps - bite * 0.05 + (taps ? tap * 0.05 : 0);
    p.head.rz = bite * 0.15;
    f.look = [0, taps > 0.3 ? 1 : 0];
    if (taps > 0.3) { f.mouth = tap > 0.4 ? 'o' : 'smile'; f.eyes = 'focused'; }
    if (bite > 0.3) { f.mouth = 'grin'; f.eyes = 'shut'; }
    if (t > 3.7) { f.expr = 'smug'; p.k.spark = clamp((t - 3.7) / 0.6, 0, 1) * (t < 4.4 ? 1 : 0); }
    for (let i = 0; i < 4; i++) if (beat(s, 'c' + i, t, 99, 0.62 + i * 0.5)) rig._emit('clink', { count: i + 1 });
    if (beat(s, 'b', t, 99, 3.05)) rig._emit('bite');
    void n;
  },
});

const RM = 3.4;
def('rummage', {
  dur: RM, expr: 'focused', next: 'show_item',
  fn(t, p, f, s, rig) {
    t = ff(t, RM);
    stand(p, rig, t, 0.4);
    // reach back over the right shoulder, dig dig dig, yank the item out
    const reach = win(t, 0.15, 2.85, 0.35, 0.3);
    const dig = win(t, 0.55, 2.4, 0.15, 0.15);
    const d1 = sin(t * 15) * dig, d2 = cos(t * 11) * dig;
    rig.reach(p, -1, lerp(4.6, 2.6 + d1 * 0.6, reach), lerp(-0.6, 8.6 + d2 * 0.7, reach), lerp(3.6, -2.6 + d1 * 0.6, reach), [0.6, -0.2, 1]);
    p.handR = reach > 0.5 ? 'open' : 'fist';
    p.wristR.rx = 0.8 * reach;
    rig.reach(p, 1, 4.6, -0.6, 3.6, [0.8, -0.2, -1]); p.handL = 'fist';
    p.chest.ry = -0.35 * reach; p.head.ry = -0.8 * reach; p.head.rx += -0.1 * reach;
    p.chest.rz = 0.1 * reach;
    p.pack.rx = d2 * 0.06; p.pack.rz = d1 * 0.05; p.pack.s = 1 + abs(d1) * 0.03;
    p.mover.y += abs(d1) * 0.15;
    f.look = [-1, -0.4];
    if (dig > 0.3) f.mouth = (t * 4) % 1 > 0.5 ? 'flat' : 'o';
    // pop! the item comes out at the end
    p.vis.item = t > 2.55;
    if (t > 2.55) { f.expr = 'surprised'; p.k.spark = clamp((t - 2.55) / 0.5, 0, 1); }
    if (dig > 0.5 && beat(s, 'cl', t, 0.45, 0.6)) rig._emit('clank');
    if (beat(s, 'pop', t, 99, 2.6)) rig._emit('pop');
  },
});

const SI = 3.0;
def('show_item', {
  dur: SI, expr: 'smug', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, SI);
    stand(p, rig, t, 0.5);
    // swoop the item round in an arc, present it at face height, flourish with the other paw
    const sw = K(t, [[0, 0], [0.55, 1, 'io'], [2.4, 1], [2.9, 0, 'io']]);
    const arc = sin(sw * PI) * (t < 0.6 ? 1 : 0);
    rig.reach(p, -1, lerp(6.4, 3.8, sw) + arc * 3, lerp(1.0, 6.4, sw) + arc * 2, lerp(2.0, 8.2, sw), [1, -0.6, -0.3]);
    p.wristR.rx = -0.5 * sw; p.handR = 'fist';
    p.vis.item = t < 2.75;
    const flo = win(t, 0.45, 2.3, 0.2, 0.3);
    const wig = sin(t * 9) * flo;
    rig.reach(p, 1, lerp(4.6, 8.8, flo) + wig * 0.5, lerp(-0.6, 9.2, flo) + wig * 0.7, lerp(3.6, 4.6, flo), [1, -0.6, 0.3]);
    p.wristL.rz = wig * 0.6 - 0.3 * flo; p.wristL.rx = -0.3 * flo; p.handL = flo > 0.4 ? 'open' : 'fist';
    p.chest.ry = 0.1 * sw; p.head.rz = 0.15 * flo + sin(t * 3) * 0.04;
    p.chest.rx -= 0.1 * flo; p.head.rx -= 0.08 * flo;
    p.k.spark = clamp((t - 0.4) / 1.6, 0, 1) * (t < 2.2 ? 1 : 0);
    if (flo > 0.3) { f.brows = sin(t * 12) > 0 ? 'up' : 'flat'; f.mouth = 'grin'; }
    if (beat(s, 'tada', t, 99, 0.55)) rig._emit('tada');
  },
});

export { ANIMS as RACCOON_ANIMS };
