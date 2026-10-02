// OtterFisher: "Otis", the meadow brook's laid-back fisherman. A sleek brown
// otter with a cream muzzle and whiskers, a long thick tail, a yellow
// sou'wester rain hat, a navy-and-cream striped jumper under an olive fishing
// vest full of pockets and lures, yellow rain boots, a wicker creel on his
// hip and a bamboo rod (with a red-and-white bobber on a real line).
//
//   const o = new OtterFisher();  scene.add(o.root);
//   o.castTarget.set(0.2, 0, 1.5);  // where the bobber lands (root space; he turns toward it a little)
//   o.play('cast_line');     // wind up, cast, wait, nibble!, reel in, shrug
//   o.play('hold_fish');     // rod on the back, a trout out of the creel, shows it off
//   o.play('juggle_pebble'); // two pebbles cascade paw to paw, big finish
//   o.play('float_back');    // lies on his back like he's floating, paws on his tummy
//   o.onEvent = (name) => {};  // 'step' | 'whoosh' | 'plop' | 'nibble' | 'reel' | 'flop' | 'toss' | 'catch' | 'splash' | 'chuckle'
//
// Anims: idle wave talk laugh walk happy cast_line hold_fish juggle_pebble float_back
// Expressions: neutral happy talk surprised sleepy smug laugh focused content proud (+ BASE_EXPRS)
// Walk speed: 'walk' ~0.45 units/s (move the root; the anim is in place).
// Units: 1 voxel = 0.05. Root at the feet, facing +Z. ~1.2 tall to the head, ~1.33 to the hat; the rod tip reaches ~1.9.
import * as THREE from 'three';
import {
  VS, FV, VoxelModel, rbox, ell, tone, buildGeo, geoCache, mirrorX, handModel, K, pulse, beat, win,
  sin, cos, abs, max, min, PI, TAU, clamp, lerp, smooth, SPARK_ROWS,
} from './critterKit.js';
import { BASE_EXPRS } from './critterFaces.js';
import { BipedRig, HAND_KINDS } from './critterBiped.js';
import { NpcFace, talkMouth, stepEvents, orientIn, NOTE_ROWS, BANG_ROWS, DROPLET_ROWS } from './npcProps.js';
import { spriteMatPal, RIPPLE_PAL, RIPPLE_ROWS } from './npcProps2.js';

const C = {
  fur: 0x8a5a36, furD: 0x6e4426, furL: 0xa8744a, furDD: 0x4a2c18,
  cream: 0xecd6ae, creamD: 0xd4bc90, creamL: 0xf8ead0, nose: 0x2a1a16, noseL: 0x5a4238, paw: 0x5a3a24, pawD: 0x3a2416,
  navy: 0x2e3e6a, navyD: 0x22305a, stripe: 0xf2ead6,
  vest: 0x7a8a46, vestD: 0x5e6c34, vestL: 0x96a65a, zip: 0xc8ccd6,
  pants: 0x3a4a6a, pantsD: 0x2c3a56, boot: 0xffd23a, bootD: 0xe0a81c, bootL: 0xffe680, sole: 0x4a3a2a,
  hat: 0xffd23a, hatD: 0xe0a81c, hatL: 0xffe680, hatS: 0xc8901a,
  red: 0xe0403a, redD: 0xa82a28, white: 0xfaf6ee, silver: 0xc8ccd6, silverD: 0x8a909c, blue: 0x3a8ad8, orange: 0xf08a2a, feather: 0x6ac0e8,
  cork: 0xd8a868, corkD: 0xb88a4a, bamboo: 0xc8a060, bambooD: 0x9a7438, bambooL: 0xe0c080, wrap: 0x8a2a2a,
  wick: 0xc8a060, wickD: 0x9a7438, wickL: 0xe0c48a, strap: 0x6a4424,
  trout: 0x8ab0c0, troutD: 0x5a8098, troutL: 0xd8ecf0, troutP: 0xf08aa0, spot: 0x3a3a4a, eye: 0x1e1018, fin: 0xb8c8d0,
  pebble: 0xb8c4d4, pebbleD: 0x8a96a8, pebbleL: 0xeef2f8, pebble2: 0xe8b890, pebble2D: 0xc08a64,
};

const D = {
  HIP_Y: 7, WAIST: 1, NECK: 7.6, NECK_Z: 0.6, SH: [4.6, 6.4, 0.2], L_UP: 3.4, L_FORE: 3.2, L_HAND: 2.0,
  THIGH: 3.6, SHIN: 3.4, LEG_X: 2.2, EAR: [4.6, 6.2, -0.6], TAIL: [0.6, -3.2],
};
const ROD_TIP = 38; // fine voxels from the grip to the rod tip
const ROD_BACK = { x: -1.0, y: 2.0, z: -4.6, rx: -0.2, rz: -0.55 }; // rod slung across the back (chest space)

// ------------------------------------------------------------------ models
const furCol = (x, y, z) => tone(x, y, z, C.fur, C.furD, C.furL, 0.12, 0.1);
const creamCol = (x, y, z) => tone(x, y, z, C.cream, C.creamD, C.creamL, 0.1, 0.08);
const vestCol = (x, y, z) => tone(x, y, z, C.vest, C.vestD, C.vestL, 0.12, 0.08);
const stripeCol = (x, y) => ((y + 40) % 3 === 0 ? C.stripe : (y + 40) % 3 === 1 ? C.navy : (x + y) % 7 === 0 ? C.navyD : C.navy);
function surfZ(v, x, y, front = true) {
  if (front) { for (let z = 14; z >= -14; z--) if (v.has(x, y, z)) return z; }
  else for (let z = -14; z <= 14; z++) if (v.has(x, y, z)) return z;
  return null;
}
function pelvisModel() {
  const v = new VoxelModel();
  rbox(v, -4, 3, -3, 1, -3, 2, 1.5, (x, y, z) => (y === 1 ? C.strap : tone(x, y, z, C.pants, C.pantsD, C.pants, 0.12, 0)));
  for (let x = -4; x <= 3; x++) { const z = surfZ(v, x, 1); if (z !== null) v.set(x, 1, z, C.strap); }
  v.set(-1, 1, 3, C.silver); v.set(0, 1, 3, C.silver);
  // wicker creel on the left hip (strap goes up over the right shoulder)
  for (let x = 4; x <= 7; x++)
    for (let y = -4; y <= 1; y++)
      for (let z = -3; z <= 2; z++) {
        const edge = x === 7 || z === -3 || z === 2 || y === -4;
        if (!edge && x !== 4) continue;
        v.set(x, y, z, y === 1 ? C.wickD : (x + y + z) % 2 ? C.wick : (y % 2 ? C.wickL : C.wickD));
      }
  for (let x = 4; x <= 7; x++) for (let z = -3; z <= 2; z++) v.set(x, 2, z, x === 7 ? C.wickD : C.wickL); // lid
  v.set(7, 0, 0, C.strap); v.set(8, 0, 0, C.silver); // latch
  v.set(7, 2, 3, C.trout); v.set(7, 3, 3, C.fin); // a fin poking out
  return v;
}
function torsoModel() {
  const v = new VoxelModel();
  // sleek body: striped jumper, vest over it (open front with a zip edge)
  const col = (x, y, z) => {
    const fx = abs(x + 0.5);
    if (z >= 1 && fx <= 1.6) return stripeCol(x, y);
    return vestCol(x, y, z);
  };
  rbox(v, -4, 3, -1, 8, -3, 2, 2.2, col);
  ell(v, 0, 2.2, 0.2, 4.6, 4.0, 3.6, (x, y, z) => (y < -1 ? null : col(x, y, z))); // tummy
  // vest zip edges + pockets with flaps + lures
  for (let y = -1; y <= 7; y++) for (const x of [-3, 2]) { const z = surfZ(v, x, y); if (z !== null) v.set(x, y, z, C.vestD); }
  for (const s of [-1, 1])
    for (const [y0, h] of [[0, 2], [3, 2]]) {
      const x0 = s > 0 ? 2 : -5, x1 = s > 0 ? 4 : -3;
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y0 + h; y++) {
          const z = surfZ(v, x, y);
          if (z === null) continue;
          v.set(x, y, z + 1, y === y0 + h ? C.vestD : vestCol(x, y, z));
        }
    }
  // lures hooked on the vest: red/white spoon, yellow spinner, a blue-orange feather fly, a silver hook
  const put = (x, y, c, dz = 1) => { const z = surfZ(v, x, y); if (z !== null) v.set(x, y, z + dz, c); };
  put(3, 6, C.red); put(3, 5, C.white); put(4, 5, C.redD);
  put(-4, 6, C.boot); put(-4, 5, C.silver); put(-5, 6, C.orange);
  put(-5, 2, C.feather); put(-4, 2, C.orange); put(-5, 1, C.blue);
  put(3, 1, C.silver); put(4, 2, C.silverD);
  // creel strap from the left hip across to the right shoulder, front and back
  for (let y = -1; y <= 8; y++) {
    const x = Math.round(3 - (y + 1) * 0.75);
    const zf = surfZ(v, x, y), zb = surfZ(v, x, y, false);
    if (zf !== null) v.set(x, y, zf + 1, C.strap);
    if (zb !== null) v.set(x, y, zb - 1, C.strap);
  }
  // neck: fur with a cream throat, jumper roll collar
  rbox(v, -3, 2, 7, 10, -2, 2, 1.2, (x, y, z) => (z >= 1 ? C.cream : C.fur));
  for (let x = -3; x <= 2; x++) for (let z = -2; z <= 2; z++) if (abs(x + 0.5) > 1.6 || abs(z) > 1) v.set(x, 8, z, (x + z) % 2 ? C.navy : C.navyD);
  return v;
}
function headModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    const fx = abs(x + 0.5);
    if (z >= 1 && y <= 3.6 - fx * 0.2) return creamCol(x, y, z); // cream cheeks + chin
    if (z >= 2 && Math.hypot(fx - 2.4, y + 0.5 - 6.2) < 2.3) return tone(x, y, z, C.furL, C.fur, 0xb8845a, 0.1, 0.12); // lighter "spectacles" so the eyes read
    if (y >= 6 && z <= -1 && (x * 5 + y * 3 + z * 7) % 11 === 0) return C.furDD;
    return furCol(x, y, z);
  };
  rbox(v, -5, 4, 0, 8, -4, 3, 3.0, col);
  ell(v, 0, 2.6, 0.2, 5.6, 2.8, 3.8, col); // wide cheeks
  // broad muzzle with two whisker pads + a small shiny nose on top
  for (const s of [-1, 1]) ell(v, s * 1.2, 2.0, 4.0, 1.9, 1.5, 1.7, (x, y, z) => (y >= 2 && z >= 5 ? C.creamL : creamCol(x, y, z)));
  for (let x = -1; x <= 0; x++) for (let z = 4; z <= 5; z++) v.set(x, 3, z, x === -1 && z === 5 ? C.noseL : C.nose);
  v.set(-1, 0, 4, C.creamD); v.set(0, 0, 4, C.creamD); // chin
  return v;
}
function earModel() {
  const v = new VoxelModel();
  for (let y = 0; y <= 1; y++) for (let z = -1; z <= 0; z++) v.set(0, y, z, y === 1 ? C.furD : C.fur);
  v.set(0, 0, 1, C.furDD); v.set(1, 0, 0, C.furD); v.set(1, 1, -1, C.furD); v.set(1, 0, -1, C.fur);
  return v;
}
function hatModel() {
  const v = new VoxelModel();
  // sou'wester: dome crown, short front brim, long brim drooping down at the back + a stitched seam
  for (let x = -7; x <= 6; x++)
    for (let z = -8; z <= 6; z++) {
      const r = Math.hypot(x + 0.5, z + 0.5);
      const back = z < 0 ? -(z + 0.5) / 8 : 0;
      const R = 5.6 + back * 2.2;
      if (r > R) continue;
      const droop = r > 4.2 ? -Math.round((r - 4.2) * (0.4 + back * 1.2)) : 0;
      v.set(x, droop, z, r > R - 0.8 ? C.hatS : (r > 4.6 && r < 5.2) ? C.hatD : (x + z) % 3 === 0 ? C.hatL : C.hat);
      if (droop < -1) v.set(x, droop + 1, z, C.hatD);
    }
  ell(v, 0, 0.2, -0.4, 4.4, 3.8, 4.4, (x, y, z) => (y < 0 ? null : y >= 3 && x <= -1 && z >= -1 ? C.hatL : (x === -1 || x === 0) && y >= 1 ? C.hatD : C.hat));
  // a little red fly hooked on the side + chin tie ends
  v.set(4, 1, 1, C.red); v.set(5, 1, 1, C.white); v.set(4, 2, 1, C.feather);
  return v;
}
function upperModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_UP, 0, -1, 1, 1.0, (x, y, z) => stripeCol(x, y + 40));
  ell(v, 0.5, -0.4, 0.5, 2.0, 1.4, 2.0, (x, y, z) => (y < -1 ? null : vestCol(x, y, z))); // vest shoulder
  return v;
}
function foreModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_FORE - 1, 0, -1, 1, 1.2, (x, y, z) => (y >= -1 ? (y === -1 ? C.stripe : C.navy) : furCol(x, y, z)));
  return v;
}
function thighModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.THIGH, 1, -1, 1, 1.0, (x, y, z) => tone(x, y, z, C.pants, C.pantsD, C.pants, 0.12, 0));
  return v;
}
function shinModel() {
  const v = new VoxelModel();
  // yellow rain boots, folded-down cuff, dark sole
  rbox(v, -2, 1, -D.SHIN + 1, 0, -2, 1, 0.9, (x, y, z) => (y === 0 ? C.bootD : y === -1 ? C.bootL : tone(x, y, z, C.boot, C.bootD, C.bootL, 0.08, 0.08)));
  const y = -D.SHIN;
  rbox(v, -2, 1, y, y + 1, -2, 3, 0.7, (x, yy, z) => (yy === y ? C.sole : z === 3 ? C.bootD : C.boot));
  v.set(-2, y + 1, 3, C.bootL);
  return v;
}
function tailSegModel(r0, r1, len, tip) {
  // thick tapering otter tail segment along -Z
  const v = new VoxelModel();
  for (let z = 0; z >= -len; z--) {
    const u = -z / len, r = lerp(r0, r1, u);
    for (let x = -3; x <= 2; x++)
      for (let y = -3; y <= 2; y++) {
        if (Math.hypot(x + 0.5, y + 0.5) > r) continue;
        v.set(x, y, z, y >= 1 ? (tip && u > 0.7 ? C.furDD : C.furD) : y <= -2 ? C.furL : furCol(x, y, z));
      }
  }
  return v;
}
function rodModel() {
  // grip at the origin: cork handle, silver reel on the left, bamboo blank along +Y to the tip
  const v = new VoxelModel();
  for (let y = -5; y <= 4; y++) for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) v.set(x, y, z, y === -5 ? C.corkD : (y + 40) % 3 === 0 ? C.corkD : C.cork);
  // reel
  for (let y = -3; y <= 0; y++) for (let z = -2; z <= 1; z++) if (Math.hypot(y + 1.5, z + 0.5) < 2.2) v.set(-3, y, z, Math.hypot(y + 1.5, z + 0.5) < 1 ? C.silverD : C.silver);
  v.set(-2, -2, -1, C.silverD); v.set(-2, -1, 0, C.silverD); v.set(-4, -1, -1, C.red); v.set(-4, -2, -1, C.red);
  for (let y = 5; y <= ROD_TIP; y++) {
    const c = (y + 40) % 7 === 0 ? C.wrap : y % 2 ? C.bamboo : C.bambooL;
    v.set(0, y, 0, c);
    if (y < 16) v.set(-1, y, 0, y % 2 ? C.bambooD : C.bamboo);
    if (y % 9 === 0) v.set(0, y, 1, C.silver); // line guides
  }
  v.set(0, ROD_TIP, 1, C.silver);
  return v;
}
function bobberModel() {
  const v = new VoxelModel();
  ell(v, 0, 0, 0, 2.3, 2.3, 2.3, (x, y, z) => (y >= 0 ? (x <= -1 && y >= 1 ? 0xff7a6a : C.red) : C.white));
  v.set(-1, 2, -1, C.white); v.set(0, 2, 0, C.white); v.set(-1, 3, -1, C.red); // little stick on top
  return v;
}
function troutModel() {
  // a fat rainbow trout along X (head at -X), centre at the origin
  const v = new VoxelModel();
  for (let x = -10; x <= 9; x++) {
    const u = (x + 10) / 19;
    const h = u < 0.15 ? 2.2 + u * 6 : u < 0.75 ? 3.2 : 3.2 * (1 - (u - 0.75) / 0.3);
    const w = h * 0.55;
    for (let y = -4; y <= 4; y++)
      for (let z = -2; z <= 1; z++) {
        const dy = (y + 0.5) / max(0.6, h), dz = (z + 0.5) / max(0.6, w);
        if (dy * dy + dz * dz > 1) continue;
        let c = y >= 1 ? C.troutD : y <= -2 ? C.troutL : C.trout;
        if (y === 0 || y === -1) c = u > 0.12 && u < 0.85 ? C.troutP : C.trout;
        if (y >= 1 && (x * 3 + y * 5 + z) % 4 === 0) c = C.spot;
        v.set(x, y, z, c);
      }
  }
  // tail fin, dorsal fin, eye, smile
  for (let y = -4; y <= 4; y++) { const span = abs(y); for (let x = 10; x <= 10 + Math.round(span * 0.5) + 1; x++) for (let z = -1; z <= 0; z++) v.set(x, y, z, span >= 3 ? C.troutD : C.fin); }
  for (let x = -2; x <= 3; x++) v.set(x, 4 + (x > 0 && x < 3 ? 1 : 0), -1, C.fin);
  for (const z of [-3, 2]) { v.set(-7, 1, z, C.eye); v.set(-7, 2, z, C.white); }
  v.set(-10, -1, -1, C.troutP); v.set(-10, -1, 0, C.troutP);
  return v;
}
function pebbleModel(c, cD, cL) {
  const v = new VoxelModel();
  ell(v, 0, 0, 0, 2.7, 2.1, 2.4, (x, y, z) => (y >= 1 && x <= -1 ? cL : (x + y + z) % 4 === 0 ? cD : c));
  return v;
}

const cache = geoCache(() => {
  const G = {
    pelvis: buildGeo(pelvisModel()), torso: buildGeo(torsoModel()), head: buildGeo(headModel()),
    earL: buildGeo(earModel()), earR: buildGeo(mirrorX(earModel())), hat: buildGeo(hatModel()),
    upper: buildGeo(upperModel(), [0.5, 0, 0.5]), fore: buildGeo(foreModel(), [0.5, 0, 0.5]),
    thigh: buildGeo(thighModel(), [0.5, 0, 0.5]), shin: buildGeo(shinModel(), [0, 0, 0]),
    tail: buildGeo(tailSegModel(2.6, 2.3, 3, false), [0, 0, 0]), tail2: buildGeo(tailSegModel(2.3, 1.8, 3, false), [0, 0, 0]), tail3: buildGeo(tailSegModel(1.8, 0.9, 4, true), [0, 0, 0]),
    rod: buildGeo(rodModel(), [0, 0, 0], FV), bobber: buildGeo(bobberModel(), [0, 0, 0], FV), trout: buildGeo(troutModel(), [0, 0, 0], FV),
    pebble: buildGeo(pebbleModel(C.pebble, C.pebbleD, C.pebbleL), [0, 0, 0], FV), pebble2: buildGeo(pebbleModel(C.pebble2, C.pebble2D, C.cream), [0, 0, 0], FV),
  };
  for (const k of HAND_KINDS) {
    G['hand_' + k + 'L'] = buildGeo(handModel(k, 1, C.paw, C.pawD), [0, 0, 0], FV);
    G['hand_' + k + 'R'] = buildGeo(handModel(k, -1, C.paw, C.pawD), [0, 0, 0], FV);
  }
  return G;
});

// ------------------------------------------------------------------ face
const FACE = {
  w: 40, h: 18, eyes: [{ x: 10.4, y: 8.4 }, { x: 29.6, y: 8.4 }], rx: 4.0, ry: 4.5, style: 'bead', lash: false,
  blush: [{ x: 4, y: 16 }, { x: 36, y: 16 }], blushW: 3,
  mw: 44, mh: 12, mx: 22, my: 1, mstyle: 'deer', mHalf: 4,
  pal: { i: '#3a2418', I: '#7a5034', b: '#3a2418', q: '#fff4e4', Q: '#d8c4a8' },
};
/** Long pale whiskers fanning out over the cheeks. */
function whiskers(P, st, cfg) {
  for (const s of [-1, 1])
    for (let k = 0; k < 3; k++)
      for (let i = 0; i <= 12; i++) {
        const x = cfg.mx + s * (7 + i) - (s < 0 ? 1 : 0), y = 2 + k * 1.8 + (k - 1) * i * 0.3 - (i > 9 ? 0.5 : 0);
        P.set(x, y, i > 9 ? 'Q' : 'q');
      }
}
const EXPRS = {
  ...BASE_EXPRS,
  neutral: { eyes: 'open', brows: null, mouth: 'smile', blush: 0, tear: 0 },
  happy: { eyes: 'happy', brows: null, mouth: 'grin', blush: 1, tear: 0 },
  talk: { eyes: 'half', brows: 'up', mouth: 'open', blush: 0, tear: 0 },
  surprised: { eyes: 'wide', brows: 'raised', mouth: 'o', blush: 0, tear: 0 },
  sleepy: { eyes: 'sleepy', brows: null, mouth: 'smile', blush: 0, tear: 0 },
  smug: { eyes: 'half', brows: 'flat', mouth: 'cheeky', blush: 0, tear: 0 },
  laugh: { eyes: 'happy', brows: 'up', mouth: 'laugh', blush: 1, tear: 0 },
  focused: { eyes: 'focused', brows: 'angry', mouth: 'flat', blush: 0, tear: 0 },
  content: { eyes: 'happy', brows: null, mouth: 'cheeky', blush: 1, tear: 0 },
  proud: { eyes: 'shiny', brows: 'up', mouth: 'grin', blush: 1, tear: 0 },
};

// ------------------------------------------------------------------ rig
const _w = new THREE.Vector3(), _w2 = new THREE.Vector3(), _w3 = new THREE.Vector3();
const _ROD_BACK_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(ROD_BACK.rx, 0, ROD_BACK.rz));
export class OtterFisher extends BipedRig {
  constructor({ shadows = true } = {}) {
    super('OtterFisher', { shadows });
    const G = (this._G = cache.get());
    this._geoCache = cache;
    this._buildBiped(G, D);
    this.joint('tail2', this.tail, 0, 0, -3); this.mesh(G.tail2, this.tail2);
    this.joint('tail3', this.tail2, 0, 0, -3); this.mesh(G.tail3, this.tail3);
    this.joint('hat', this.head, 0, 7.6, -0.4);
    const hatTilt = new THREE.Group(); hatTilt.rotation.set(-0.12, 0, 0.05); this.hat.add(hatTilt);
    this.mesh(G.hat, hatTilt);
    this.face = new NpcFace(FACE, { mouth: whiskers });
    this.facePlane(this.face.eyes.tex, this.head, FACE.w, FACE.h, 0, 8.2 - FACE.h / 8, 4.1);
    this.facePlane(this.face.mouth.tex, this.head, FACE.mw, FACE.mh, 0, 3.0 - FACE.mh / 8, 5.75);
    // rod: right hand, slung on the back, or laid on the ground
    this.rod = this.mesh(G.rod, this.gripR);
    this.rodBack = this.mesh(G.rod, this.chest, { x: ROD_BACK.x * VS, y: ROD_BACK.y * VS, z: ROD_BACK.z * VS });
    this.rodBack.quaternion.copy(_ROD_BACK_Q);
    this.rodGround = this.mesh(G.rod, this.root, { x: -0.42, y: 0.03, z: -0.25 });
    this.rodGround.rotation.set(PI / 2, 0, 0.25);
    this.rodTip = new THREE.Object3D(); this.rodTip.position.set(0, ROD_TIP * FV, 0.5 * FV); this.rod.add(this.rodTip);
    // line + bobber (root space)
    this._lineN = 18;
    this.lineGeo = new THREE.BufferGeometry();
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this._lineN * 3), 3));
    this.lineMat = new THREE.LineBasicMaterial({ color: 0xf4f8fc, transparent: true, opacity: 0.85 });
    this.line = new THREE.Line(this.lineGeo, this.lineMat);
    this.line.frustumCulled = false;
    this.root.add(this.line);
    this._owned.push(this.lineGeo, this.lineMat);
    this.bobber = this.mesh(G.bobber, this.root, { shadow: false });
    this._bob = { p: new THREE.Vector3(0, 1, 0.5), v: new THREE.Vector3(), init: false };
    this._from = new THREE.Vector3();
    /** Where 'cast_line' lands the bobber (root space, y = water level). */
    this.castTarget = new THREE.Vector3(0.15, 0, 1.55);
    // held things
    this.trout = this.mesh(G.trout, this.gripL);
    this.pebbles = [this.mesh(G.pebble, this.root), this.mesh(G.pebble2, this.root)];
    this._peb = [new THREE.Vector3(), new THREE.Vector3()];
    // sprites
    this.ripples = [0, 1].map(() => { const s = new THREE.Sprite(spriteMatPal(RIPPLE_ROWS, RIPPLE_PAL)); s.visible = false; this.root.add(s); return s; });
    this.drops = [0, 1, 2].map(() => this.sprite(DROPLET_ROWS, 0.04, this.root));
    this.notes = [0, 1].map(() => this.sprite(NOTE_ROWS, 0.07, this.root));
    this.sparks = [0, 1, 2].map(() => this.sprite(SPARK_ROWS, 0.07, this.root));
    this.bang = this.sprite(BANG_ROWS, 0.09, this.root);
    this.scalar('rodW', 0); // 1 = rod aimed by rodY/rodZ (chest space), 0 = rigid in the fist
    this.scalar('rodYx', 0); this.scalar('rodYy', 1); this.scalar('rodYz', 0); this.scalar('rodZz', 1);
    this.scalar('cast', 0); // 0 = bobber dangles at the tip, 1 = scripted (flying / in the water)
    this.scalar('fly', 0); // 0 at the tip .. 1 in the water
    this.scalar('dip', 0);
    this.scalar('sag', 0);
    this.scalar('ripple', 0);
    this.scalar('splash', 0);
    this.scalar('notes', 0);
    this.scalar('spark', 0);
    this.scalar('bang', 0);
    this.scalar('flop', 0);
    this.jiggle('hat', 'rx', { k: 200, c: 9, az: -0.6, ay: 0.25, max: 0.3, probe: 'head' });
    this.jiggle('hat', 'rz', { k: 200, c: 9, ax: 0.6, max: 0.25, probe: 'head' });
    this.jiggle('earL', 'rz', { k: 200, c: 9, ay: -0.5, max: 0.4, probe: 'head' });
    this.jiggle('earR', 'rz', { k: 200, c: 9, ay: 0.5, max: 0.4, probe: 'head' });
    this.jiggle('chest', 's', { k: 240, c: 10, ay: 0.04, max: 0.06, probe: 'hips' });
    this.jiggle('tail', 'ry', { k: 70, c: 5, ax: 1.2, yaw: 0.08, max: 0.6, probe: 'hips' });
    this.jiggle('tail2', 'ry', { k: 60, c: 4.5, ax: 1.2, yaw: 0.08, max: 0.6, probe: 'tail' });
    this.jiggle('tail3', 'ry', { k: 50, c: 4, ax: 1.2, max: 0.6, probe: 'tail2' });
    this.jiggle('tail2', 'rx', { k: 70, c: 5, ay: 0.9, max: 0.4, probe: 'tail' });
    this._init(ANIMS, EXPRS, 'idle');
  }
  _post(p, dt) {
    this._setHands(p);
    const k = this.k, tz = this.time;
    // rod
    const where = p.vis.rodGround ? 2 : p.vis.rodBack ? 1 : 0;
    this.rod.visible = where === 0; this.rodBack.visible = where === 1; this.rodGround.visible = where === 2;
    if (where === 0) orientIn(this.rod, this.chest, [k.rodYx, k.rodYy, k.rodYz], [0, 0, k.rodZz || 1], clamp(k.rodW, 0, 1), _REST_Q);
    // bobber + line
    this.root.updateWorldMatrix(true, true);
    const tip = _w;
    if (where === 0) { tip.set(0, 0, 0); this.rodTip.localToWorld(tip); }
    else if (where === 1) { tip.set(0, ROD_TIP * FV, 0.5 * FV); this.rodBack.localToWorld(tip); }
    else { tip.set(0, ROD_TIP * FV, 0); this.rodGround.localToWorld(tip); }
    this.root.worldToLocal(tip);
    const B = this._bob, step = clamp(dt, 0, 1 / 30);
    // dangling: a damped pendulum-ish spring hanging under the tip
    const hang = _w2.set(tip.x, tip.y - (where === 2 ? 0 : 0.11), tip.z + (where === 2 ? 0.08 : 0));
    if (!B.init || dt <= 0) { B.p.copy(hang); B.v.set(0, 0, 0); B.init = true; }
    else {
      B.v.addScaledVector(_w3.subVectors(hang, B.p), 260 * step).multiplyScalar(Math.max(0, 1 - 9 * step));
      B.v.y -= 0.6 * step;
      B.p.addScaledVector(B.v, step);
      if (B.p.distanceTo(hang) > 0.2) B.p.lerp(hang, 0.5);
    }
    const ct = this.castTarget, cast = clamp(k.cast, 0, 1), fly = clamp(k.fly, 0, 1);
    const pos = _w3;
    if (cast < 0.001) { pos.copy(B.p); this._from.copy(B.p); }
    else {
      // arc from where the bobber was at release to the water, + a bob / dip once it's in
      const from = this._from;
      if (fly < 0.02) from.copy(B.p);
      pos.lerpVectors(from, ct, fly);
      pos.y += sin(fly * PI) * 0.5 * (k.sag > 0.5 ? 0.15 : 1) + (fly > 0.97 ? sin(tz * 3.2) * 0.008 - k.dip * 0.035 : 0);
      if (cast < 1) pos.lerp(B.p, 1 - cast);
      if (fly > 0.98) pos.y = max(pos.y, ct.y - 0.04);
    }
    this.bobber.visible = true;
    this.bobber.position.copy(pos);
    // the line: tip -> bobber, sagging when slack
    const arr = this.lineGeo.attributes.position.array, N = this._lineN;
    const slack = clamp(k.sag, 0, 1) * min(0.4, tip.distanceTo(pos) * 0.18);
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      arr[i * 3] = lerp(tip.x, pos.x, u);
      arr[i * 3 + 1] = lerp(tip.y, pos.y + 0.03, u) - sin(u * PI) * slack;
      arr[i * 3 + 2] = lerp(tip.z, pos.z, u);
    }
    this.lineGeo.attributes.position.needsUpdate = true;
    // trout + pebbles
    this.trout.visible = !!p.vis.trout;
    if (this.trout.visible) {
      const fl = k.flop * sin(tz * 24);
      orientIn(this.trout, this.chest, [0, 1, 0], [0.1 * fl, 0.2, 1], 1);
      this.trout.rotateY(fl * 0.25);
      this.trout.position.set(-0.11, -0.01, 0.01);
    }
    for (let i = 0; i < 2; i++) {
      const pb = this.pebbles[i];
      pb.visible = !!p.vis['peb' + i];
      if (!pb.visible) continue;
      // chest-space voxels -> root
      const q = this._peb[i];
      _w2.set(q.x * VS, q.y * VS, q.z * VS); this.chest.localToWorld(_w2); this.root.worldToLocal(_w2);
      pb.position.copy(_w2);
      pb.rotation.set(tz * 7 + i, tz * 5, 0);
    }
    // sprites: ripples where the bobber sits / plops, splash drops
    const rp = k.ripple;
    this.ripples.forEach((s, i) => {
      const u = (tz * 0.8 + i * 0.5) % 1;
      s.visible = rp > 0.5;
      s.position.set(ct.x, ct.y + 0.005, ct.z);
      s.scale.set(0.08 + u * 0.16, (0.08 + u * 0.16) * 0.55, 1);
      s.material.opacity = 1;
    });
    this.drops.forEach((s, i) => {
      const u = clamp(k.splash, 0, 1);
      s.visible = u > 0.02 && u < 0.98;
      const a = i * 2.1;
      s.position.set(ct.x + cos(a) * u * 0.12, ct.y + sin(u * PI) * 0.14, ct.z + sin(a) * u * 0.08);
    });
    this.head.updateWorldMatrix(true, false);
    _w2.set(0, 5 * VS, 4 * VS); this.head.localToWorld(_w2); this.root.worldToLocal(_w2);
    this.notes.forEach((s, i) => {
      const u = (tz * 0.5 + i * 0.5) % 1;
      s.visible = k.notes > 0.5;
      s.position.set(_w2.x + 0.14 + u * 0.12 + sin(u * 8 + i) * 0.03, _w2.y + 0.08 + u * 0.3, _w2.z);
      s.scale.setScalar(0.065 * (u < 0.8 ? 1 : (1 - u) / 0.2) * min(1, u * 6));
    });
    const sp = k.spark;
    this.sparks.forEach((s, i) => {
      s.visible = sp > 0.05;
      const a = i * 2.1 + tz * 1.5;
      s.position.set(_w2.x + cos(a) * 0.34, _w2.y + 0.12 + sin(a * 1.3) * 0.12, _w2.z + sin(a) * 0.1);
      s.scale.setScalar(0.07 * sin(clamp(sp, 0, 1) * PI) * (0.7 + 0.3 * sin(tz * 9 + i)));
    });
    this.bang.visible = k.bang > 0.05;
    this.bang.position.set(_w2.x + 0.06, _w2.y + 0.36 + k.bang * 0.05, _w2.z - 0.05);
    this.bang.scale.setScalar(0.1 * clamp(k.bang * 1.4, 0, 1));
  }
}
const _REST_Q = new THREE.Quaternion();

// ------------------------------------------------------------------ pose helpers
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };
const ff = (t, d) => (t > d ? t % d : t);
const _c = [0, 0];

/** Easy-going stance: weight on one hip, tail curled round on the ground behind. */
function stand(p, rig, t, amt = 1) {
  rig.life(t, p, amt);
  rig.stance(p, 0.4, 0.8, 0.3, 0.08);
  p.hips.x += 0.3; p.hips.rz += 0.03; p.chest.rz -= 0.04;
  tailPose(p, t, amt);
}
function tailPose(p, t, amt = 1) {
  const sw = sin(t * 1.4);
  p.tail.rx = -0.75; p.tail2.rx = 0.45; p.tail3.rx = 0.35;
  p.tail.ry = 0.5 + sw * 0.12 * amt; p.tail2.ry = 0.55 + sin(t * 1.4 - 0.7) * 0.2 * amt; p.tail3.ry = 0.45 + sin(t * 1.4 - 1.4) * 0.3 * amt;
}
/** Rod aimed in chest space (direction of the blank). */
function rodAim(p, x, y, z) { p.k.rodW = 1; p.k.rodYx = x; p.k.rodYy = y; p.k.rodYz = z; p.k.rodZz = 1; }
/** Right fist near the chest, rod resting back over the right shoulder. */
function rodShoulder(p, rig, w = 1) {
  rig.reach(p, -1, 4.2, 4.4, 4.4, [1, -0.5, -0.5], w);
  p.handR = 'fist'; p.wristR.rx = 0.2;
  rodAim(p, -0.62, 0.62, -0.48);
}
/** Rod held upright at the side like a staff. */
function rodUpright(p, rig, w = 1) {
  rig.reach(p, -1, 6.0, 0.8, 2.6, [0.9, 0, -1], w);
  p.handR = 'fist';
  rodAim(p, -0.12, 1, 0.12);
}
/** Left paw hooked in the vest pocket / resting on the creel. */
function pawCreel(p, rig) {
  rig.reach(p, 1, 6.2, -0.2, 2.0, [0.9, 0.1, -1]);
  p.handL = 'relax'; p.wristL.rx = 0.4; p.wristL.rz = 0.4;
}
/** Swap the rod onto the back: returns 1 while it should be on the back (reaches over the right shoulder around the swap times). */
function stashRod(p, rig, t, tOff, tOn, w = 1) {
  // tOff: rod goes on the back, tOn: comes back into the hand
  const r1 = pulse(t, tOff - 0.3, 0.6), r2 = pulse(t, tOn - 0.3, 0.6);
  const r = max(r1, r2) * w;
  if (r > 0) {
    rig.reach(p, -1, 4.4, 7.4, -2.2, [1, 0.2, 0.6], r);
    p.handR = 'fist'; p.chest.ry -= r * 0.2; p.head.ry -= r * 0.25;
  }
  const back = t > tOff && t < tOn;
  p.vis.rodBack = back;
  return back;
}

// ------------------------------------------------------------------ animations
def('idle', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    stand(p, rig, t);
    const sway = sin(t * 0.8);
    p.hips.x += sway * 0.25; p.head.rz = sin(t * 0.8 + 0.5) * 0.06;
    const T = t % 12;
    rodShoulder(p, rig);
    pawCreel(p, rig);
    // looks out at the water, shading his eyes with a paw
    const look = win(T, 2.0, 4.6, 0.4, 0.4);
    if (look > 0) {
      const m = rig.headPoint(p, 6.0, 5.0, _c);
      rig.reach(p, 1, lerp(6.2, 2.2, look), lerp(-0.2, m[0] - 0.6, look), lerp(2.0, m[1] + 1.4, look), [1, -0.6, -0.2], look);
      p.handL = 'open'; p.wristL.rx = lerp(0.4, -1.3, look); p.wristL.rz = 0;
      p.head.ry += look * 0.3 * sin(t * 0.9); p.head.rx -= look * 0.08;
      f.eyes = look > 0.5 ? 'focused' : null; f.brows = null;
    }
    // scratches his chin, whiskers twitch; then a lazy hum
    const scratch = win(T, 6.0, 7.6, 0.3, 0.3);
    if (scratch > 0) {
      const m = rig.headPoint(p, 0.4, 4.8, _c);
      rig.reach(p, 1, lerp(6.2, 1.4, scratch), lerp(-0.2, m[0] - 1.8, scratch) + sin(t * 16) * 0.3 * scratch, lerp(2.0, m[1] + 0.8, scratch), [1, -0.6, -0.2], scratch);
      p.handL = 'point'; p.wristL.rx = -0.6;
      p.head.rx -= scratch * 0.15; f.eyes = scratch > 0.5 ? 'half' : null;
    }
    const hum = win(T, 8.6, 11.0, 0.3, 0.3);
    p.k.notes = hum > 0.5 ? 1 : 0;
    p.head.rz += hum * sin(t * 3) * 0.08;
    p.tail3.ry += hum * sin(t * 6) * 0.4;
    if (hum > 0.3) { f.eyes = 'happy'; f.mouth = 'chew1'; }
  },
});

def('walk', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    // a loose, rolling waddle; rod over the shoulder, tail swinging behind
    const P = 0.84, ph = (t / P) * TAU, sn = sin(ph), cs = cos(ph);
    rig.walk(p, ph, 0.45);
    p.hips.y = -0.6 + abs(cs) * 0.5;
    p.hips.rz = cs * 0.08; p.chest.rz = -cs * 0.07; p.hips.ry = -sn * 0.1;
    p.chest.rx = 0.12; p.head.rx = -0.1; p.head.rz = cs * 0.05;
    rodShoulder(p, rig);
    p.armL.rx = sn * 0.45; p.armL.rz = 0.18; p.foreL.rx = -0.5; p.handL = 'relax';
    tailPose(p, t, 0.4);
    p.tail.ry += -sn * 0.25; p.tail2.ry += -sin(ph - 0.8) * 0.3; p.tail3.ry += -sin(ph - 1.6) * 0.35;
    stepEvents(s, ph, rig);
  },
});

def('wave', {
  loop: true, expr: 'happy',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.6);
    rodShoulder(p, rig);
    const wv = sin(t * 7.5);
    rig.reach(p, 1, 7.4 + wv * 0.8, 10.2, 2.8, [1, -0.6, 0.2]);
    p.wristL.rz = wv * 0.45 - 0.2; p.wristL.rx = -0.2; p.handL = 'open';
    p.chest.rz += 0.06; p.head.rz += -0.1 + sin(t * 3.7) * 0.05;
    p.tail3.ry += sin(t * 7.5) * 0.4;
    f.mouth = 'grin';
  },
});

def('talk', {
  loop: true, expr: 'talk',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.7);
    rodUpright(p, rig);
    const on = talkMouth(t, f, { rate: 6.5, open: 'open', mid: 'grin', shut: 'smile' });
    // fish-tale gestures: "THIS big" (paw out wide) -> thumb back at the water -> paw on heart
    const T = t % 6.6;
    const big = win(T, 0.2, 2.0, 0.3, 0.3), thumb = win(T, 2.4, 3.8, 0.25, 0.3), heart = win(T, 4.2, 6.0, 0.3, 0.3);
    let x = 6.2, y = -0.2, z = 2.0;
    x = lerp(x, 9.4, big); y = lerp(y, 4.4 + sin(t * 4) * 0.4, big); z = lerp(z, 3.6, big);
    x = lerp(x, 6.4, thumb); y = lerp(y, 6.2, thumb); z = lerp(z, -1.4, thumb);
    x = lerp(x, 2.2, heart); y = lerp(y, 4.4, heart); z = lerp(z, 4.6, heart);
    rig.reach(p, 1, x, y, z, [1, -0.5, -0.3]);
    p.handL = big > 0.5 ? 'open' : thumb > 0.5 ? 'thumb' : heart > 0.5 ? 'open' : 'relax';
    p.wristL.rz = big * 0.4; p.wristL.rx = -0.3 * big + heart * 0.5;
    p.chest.ry = big * 0.1 - thumb * 0.12; p.head.ry = -thumb * 0.25;
    p.head.rx += on ? sin(t * 6.5) * 0.04 : 0;
    p.head.rz += sin(t * 1.3) * 0.08;
    if (big > 0.5) f.brows = 'raised';
    if (heart > 0.5) f.eyes = 'happy';
  },
});

def('laugh', {
  loop: true, expr: 'laugh',
  fn(t, p, f, s, rig) {
    // belly laugh: leans back, paw slapping his tummy, tail thumping the ground
    const ha = sin(t * 12);
    stand(p, rig, t, 0.3);
    rig.stance(p, 0.4 + abs(ha) * 0.3, 0.8, 0.3, 0.08);
    rodUpright(p, rig);
    const slap = max(0, sin(t * 6));
    rig.reach(p, 1, 3.0, 1.4 + slap * 0.6, 5.0 + slap * 0.6, [0.9, -0.4, -0.6]);
    p.handL = 'open'; p.wristL.rx = 0.8;
    p.chest.rx += -0.2 + ha * 0.05; p.head.rx += -0.3 + ha * 0.06;
    p.mover.y += abs(ha) * 0.2;
    p.tail.rx += max(0, sin(t * 6)) * 0.3;
    p.head.rz = sin(t * 2.2) * 0.1;
    f.mouth = ha > -0.3 ? 'laugh' : 'open';
    if (beat(s, 'c', t, 1.0, 0.2)) rig._emit('chuckle');
  },
});

const HAPPY_DUR = 2.0;
def('happy', {
  dur: HAPPY_DUR, expr: 'happy', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, HAPPY_DUR);
    // hop with the rod thrust up like a trophy, other paw punching the air, tail whips
    const jump = K(t, [[0, 0], [0.22, -1.1, 'out'], [0.34, 0], [0.6, 4.2, 'out'], [0.88, 0, 'in'], [0.98, -0.8, 'out'], [1.1, 0], [1.26, 1.4, 'out'], [1.4, 0, 'in'], [1.5, -0.4], [1.7, 0]]);
    const up = win(t, 0.25, 1.5, 0.12, 0.35);
    stand(p, rig, t, 0.4);
    p.mover.y += max(0, jump);
    if (jump > 0.2) { p.thighL.rx = p.thighR.rx = -0.3; p.shinL.rx = p.shinR.rx = 0.7; p.thighL.rz = 0.3; p.thighR.rz = -0.3; }
    else rig.stance(p, max(0, -jump) * 1.4 + 0.4, 0.8, 0.3, 0.08);
    p.hips.s = 1 + (jump < 0 ? jump * 0.06 : 0.02);
    const fl = sin(t * 16) * 0.4 * up;
    rig.reach(p, -1, lerp(3.0, 5.6, up), lerp(3.6, 10.4, up) + fl, lerp(4.8, 2.6, up), [1, -0.6, -0.4]);
    p.handR = 'fist';
    rodAim(p, lerp(-0.3, -0.25, up), lerp(0.72, 1, up), lerp(-0.62, 0.1, up));
    rig.reach(p, 1, lerp(6.2, 5.6, up), lerp(-0.2, 10.0, up) - fl, lerp(2.0, 2.6, up), [1, -0.6, -0.4]);
    p.handL = up > 0.4 ? 'fist' : 'relax';
    p.chest.rx -= up * 0.12; p.head.rx -= up * 0.15;
    p.tail.rx += up * 0.5; p.tail2.rx -= up * 0.2; p.tail3.ry += sin(t * 14) * 0.5 * up;
    p.k.spark = clamp((t - 0.45) / 1.2, 0, 1) * (t < 1.7 ? 1 : 0);
    f.mouth = up > 0.3 ? 'open' : 'grin';
    if (beat(s, 'l1', t, 99, 0.88) || beat(s, 'l2', t, 99, 1.4)) rig._emit('step');
  },
});

const CL = { dur: 7.4, wind: 0.55, whip: 1.15, rel: 1.24, land: 2.0, nib: 4.1, reel: 4.7, in: 5.6, home: 6.7 };
def('cast_line', {
  dur: CL.dur, expr: 'focused', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, CL.dur);
    stand(p, rig, t, 0.5);
    // turn a little toward the cast spot
    const ct = rig.castTarget;
    const yaw = clamp(Math.atan2(ct.x, ct.z), -1.1, 1.1) * win(t, 0.1, CL.home, 0.4, 0.5);
    p.mover.ry += yaw;
    // rod angle over the cast: shoulder -> front -> wind back -> WHIP -> held out -> reel -> shoulder
    const back = K(t, [[0.15, 0], [CL.wind, 1, 'io'], [CL.whip - 0.12, 1.15, 'out'], [CL.whip + 0.1, 0, 'out']]);
    const out = K(t, [[CL.whip, 0], [CL.whip + 0.12, 1, 'out'], [CL.whip + 0.3, 0.85, 'io'], [CL.home - 0.6, 0.85], [CL.home, 0, 'io']]);
    const yank = pulse(t, CL.nib + 0.35, 0.3);
    const ang = K(t, [[0, -0.85], [0.3, 0.2, 'io']]) * (1 - out) * (1 - back) + back * -0.95 + out * (0.85 - yank * 0.6);
    const home = smooth((t - (CL.home - 0.6)) / 0.6);
    const a = lerp(ang, -0.85, home);
    rig.reach(p, -1, lerp(3.4, 3.0, home), lerp(5.4 + back * 2.4 - out * 1.2, 3.6, home), lerp(5.6 - back * 1.6 + out * 1.4, 4.8, home), [1, -0.5, -0.4]);
    p.handR = 'fist'; p.wristR.rx = 0.2;
    rodAim(p, -0.2 * (1 - home) - 0.3 * home, cos(a), sin(a));
    // left paw: on the creel, then cranks the reel
    const crank = win(t, CL.reel, CL.in, 0.15, 0.15);
    if (crank > 0) {
      const ca = (t - CL.reel) * 16;
      rig.reach(p, 1, 0.6 + cos(ca) * 0.6, 3.2 + sin(ca) * 0.6, 6.6, [1, -0.4, -0.6], crank);
      p.handL = 'fist';
    } else pawCreel(p, rig);
    // body: lean back on the wind-up, throw forward on the whip
    p.chest.rx += -back * 0.18 + out * 0.15 * (t < CL.whip + 0.5 ? 1 : 0.3) + yank * 0.1;
    p.head.rx += -back * 0.1 + out * 0.08;
    p.hips.z += -back * 0.6 + out * 0.4;
    // bobber
    p.k.cast = K(t, [[CL.rel - 0.02, 0], [CL.rel, 1, 'lin'], [CL.in - 0.05, 1], [CL.in + 0.05, 0, 'lin']]);
    p.k.fly = K(t, [[CL.rel, 0], [CL.land, 1, 'out'], [CL.reel, 1], [CL.in, 0, 'in']]);
    p.k.sag = t > CL.land - 0.1 && t < CL.reel ? 1 : 0;
    p.k.dip = pulse(t, CL.nib, 0.18) + pulse(t, CL.nib + 0.3, 0.18) * 1.4;
    p.k.ripple = t > CL.land && t < CL.reel + 0.2 ? 1 : 0;
    p.k.splash = K(t, [[CL.land - 0.02, 0], [CL.land + 0.5, 1, 'out']]);
    // face: focused aim, relaxed hum while waiting, "!" on the nibble, shrug at the empty hook
    f.look = [0, 0.4];
    if (t > CL.land && t < CL.nib) { f.expr = 'content'; p.k.notes = t > CL.land + 0.6 ? 1 : 0; p.tail3.ry += sin(t * 5) * 0.35; }
    if (t > CL.nib - 0.05 && t < CL.reel) { f.expr = 'surprised'; p.k.bang = 1 - smooth((t - CL.nib - 0.4) / 0.2); }
    if (t > CL.reel && t < CL.in) f.expr = 'focused';
    const shrug = win(t, CL.in + 0.05, CL.home + 0.1, 0.2, 0.3);
    if (shrug > 0) {
      f.expr = 'happy'; f.mouth = 'cheeky';
      p.armL.rz += shrug * 0.5; p.chest.y += shrug * 0.5; p.head.rz += shrug * 0.18;
      rig.reach(p, 1, 7.4, 3.6, 4.4, [1, -0.5, -0.3], shrug); p.handL = 'open'; p.wristL.rz = 0.6 * shrug;
    }
    if (beat(s, 'w', t, 99, CL.whip)) rig._emit('whoosh');
    if (beat(s, 'p', t, 99, CL.land)) rig._emit('plop');
    if (beat(s, 'n', t, 99, CL.nib)) rig._emit('nibble');
    if (crank > 0.5 && beat(s, 'r', t, 0.25, 0)) rig._emit('reel');
  },
});

const HF = 4.4;
def('hold_fish', {
  dur: HF, expr: 'proud', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, HF);
    stand(p, rig, t, 0.5);
    // rod onto the back, a trout out of the creel, held up with both paws (it flops!), back in, rod back
    const onBack = stashRod(p, rig, t, 0.35, 4.05);
    if (!onBack && t < 0.5) rodShoulder(p, rig, 1 - pulse(t, 0.05, 0.6));
    else if (!onBack) rodShoulder(p, rig, 1 - pulse(t, 3.75, 0.6));
    const dig = win(t, 0.4, 1.1, 0.2, 0.15);
    const show = win(t, 1.0, 3.5, 0.3, 0.35);
    const both = win(t, 1.25, 3.3, 0.25, 0.3);
    // left paw: creel lid -> fish up in front of the face
    let lx = 6.2, ly = -0.2, lz = 2.0;
    lx = lerp(lx, 6.8, dig); ly = lerp(ly, 0.6 + sin(t * 18) * 0.3 * dig, dig); lz = lerp(lz, 0.2, dig);
    lx = lerp(lx, 4.4, show); ly = lerp(ly, 7.0 + sin(t * 3) * 0.3, show); lz = lerp(lz, 6.2, show);
    rig.reach(p, 1, lx, ly, lz, [1, -0.6, -0.3]);
    p.handL = dig > 0.3 || show > 0.2 ? 'fist' : 'relax';
    p.vis.trout = t > 0.95 && t < 3.6;
    // right paw supports the tail end
    if (both > 0) { rig.reach(p, -1, 2.2, 6.4 + sin(t * 3) * 0.3, 6.8, [1, -0.6, -0.3], both); p.handR = 'open'; p.wristR.rx = -0.4; }
    p.k.flop = win(t, 1.1, 3.2, 0.1, 0.2) * (0.5 + 0.5 * max(0, sin(t * 4)));
    p.chest.rx -= show * 0.1; p.head.rx -= show * 0.06; p.head.ry += show * 0.2;
    p.mover.y += both * abs(sin(t * 5)) * 0.3;
    p.k.spark = show > 0.5 ? clamp((t - 1.3) / 1.6, 0, 1) : 0;
    f.look = [show * -0.8, 0];
    if (show > 0.4) { f.expr = 'proud'; f.mouth = sin(t * 6) > 0.2 ? 'open' : 'grin'; }
    else if (dig > 0.3) f.expr = 'focused';
    if (p.k.flop > 0.3 && beat(s, 'fl', t, 0.5, 0.1)) rig._emit('flop');
  },
});

const JP = 5.4;
const JT = 0.62; // seconds per throw
def('juggle_pebble', {
  dur: JP, expr: 'focused', next: 'idle',
  enter(s, rig) { rig._peb[0].set(3, 2, 6); rig._peb[1].set(-3, 2, 6); },
  fn(t, p, f, s, rig) {
    t = ff(t, JP);
    stand(p, rig, t, 0.4);
    const onBack = stashRod(p, rig, t, 0.35, 5.05);
    if (!onBack) rodShoulder(p, rig, 1 - max(pulse(t, 0.05, 0.6), pulse(t, 4.75, 0.6)));
    // two pebbles cascade paw to paw, then one big high toss + catch
    const on = win(t, 0.6, 4.75, 0.25, 0.3);
    const PY = 2.8, PZ = 7.0, PX = 3.0;
    const hand = (side, tt) => {
      // paws dip to throw, rise to catch
      const ph = ((tt / JT) % 1 + 1) % 1;
      return PY + sin(ph * TAU + (side > 0 ? 0 : PI)) * 0.6;
    };
    const tt = t - 0.8;
    let lh = hand(1, tt), rh = hand(-1, tt);
    const fin = win(t, 3.6, 4.7, 0.05, 0.2);
    for (let i = 0; i < 2; i++) {
      const q = rig._peb[i];
      const local = tt - i * JT;
      p.vis['peb' + i] = t > 0.62 && t < 4.95;
      if (local < 0) { const side = i === 0 ? 1 : -1; q.set(side * PX, (side > 0 ? lh : rh) + 0.6, PZ); continue; }
      const n = Math.floor(local / JT), u = (local / JT) - n;
      const fromL = (n + i) % 2 === 0;
      const sx = fromL ? PX : -PX;
      const h = 8.0 + (i ? 0.8 : 0);
      if (t > 3.6 && i === 0) {
        // the big finale toss, straight up and caught in both paws
        const u2 = clamp((t - 3.6) / 0.85, 0, 1);
        q.set(lerp(PX, 0, u2), PY + 0.6 + sin(u2 * PI) * 11, PZ + 0.4);
      } else if (t > 3.6 && i === 1) q.set(-PX, rh + 0.6, PZ);
      else q.set(lerp(sx, -sx, u), PY + 0.6 + sin(u * PI) * h, PZ + sin(u * PI) * 0.6);
    }
    if (fin > 0) { lh = lerp(lh, PY + 1.0, fin); rh = lerp(rh, PY + 0.6, fin); }
    if (on > 0) {
      rig.reach(p, 1, lerp(6.2, PX + (fin > 0 ? -2 * fin : 0), on), lerp(-0.2, lh, on), lerp(2.0, PZ - 1.0, on), [0.9, -0.5, -0.6], on);
      rig.reach(p, -1, lerp(3.4, PX, on), lerp(3.6, rh, on), lerp(4.8, PZ - 1.0, on), [0.9, -0.5, -0.6], on);
      p.handL = p.handR = 'open'; p.wristL.rx = p.wristR.rx = 0.9;
    } else pawCreel(p, rig);
    // eyes follow pebble 0, head bobs
    const q0 = rig._peb[0];
    f.look = [clamp(q0.x * 0.25, -1, 1), clamp(-(q0.y - 7) * 0.12, -1.2, 1)];
    p.head.rx += clamp(-(q0.y - 6) * 0.02, -0.25, 0.1) * on; p.head.ry += clamp(q0.x * 0.03, -0.12, 0.12) * on;
    p.tail3.ry += sin(t * 9) * 0.3 * on;
    const ta = win(t, 4.45, 5.2, 0.1, 0.3);
    if (ta > 0) { f.expr = 'proud'; p.k.spark = ta; p.mover.y += ta * 0.4; }
    else if (t > 3.6 && t < 4.45) f.expr = 'surprised';
    if (on > 0.5 && t < 3.6 && beat(s, 'toss', tt, JT, 0)) rig._emit('toss');
    if (beat(s, 'cf', t, 99, 4.45)) rig._emit('catch');
  },
});

const FB = 7.0;
def('float_back', {
  dur: FB, expr: 'neutral', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, FB);
    // turn side-on, set the rod down, sit, lie back "floating" (paws on the tummy, toes up), bob, then get up
    const turn = K(t, [[0, 0], [0.6, 1, 'io'], [6.3, 1], [6.9, 0, 'io']]);
    const put = pulse(t, 0.35, 0.6), pick = pulse(t, 6.05, 0.6);
    const lie = K(t, [[0.8, 0], [1.7, 1, 'io'], [5.6, 1], [6.3, 0, 'io']]);
    const sit = K(t, [[0.4, 0], [1.0, 1, 'io'], [6.3, 1], [6.7, 0, 'io']]);
    rig.life(t, p, 0.4);
    p.mover.ry = turn * PI * 0.5;
    p.vis.rodGround = t > 0.62 && t < 6.35;
    // sit down: hips drop, then the whole body rolls back around the hips
    p.hips.y -= sit * 4.0;
    p.hips.rx -= lie * 1.45;
    p.hips.y -= lie * 0.2;
    const bob = sin(t * 2.2) * lie;
    p.mover.y += bob * 0.35 + lie * 0.2;
    p.hips.rz += bob * 0.04;
    // legs: crouch to sit, then toes up while floating (little paddle)
    if (lie < 0.05) rig.stance(p, 0, lerp(0.8, 2.6, sit), lerp(0.3, 2.6, sit), 0.12);
    else {
      const pad = sin(t * 3.1);
      p.thighL.rx = lerp(-1.2, -0.6, lie) + pad * 0.12 * lie; p.thighR.rx = lerp(-1.2, -0.7, lie) - pad * 0.12 * lie;
      p.shinL.rx = lerp(1.4, 0.6, lie); p.shinR.rx = lerp(1.4, 0.7, lie);
      p.thighL.rz = 0.18; p.thighR.rz = -0.18;
    }
    // arms: right paw sets the rod down by his side; then both paws folded on the tummy, patting
    const pat = max(0, sin(t * 4)) * lie * win(t, 2.4, 4.4, 0.2, 0.2);
    if (put > 0 || pick > 0) {
      const w = max(put, pick);
      const c = rig.toChest(p, 0.6, -2.0, _c);
      rig.reach(p, -1, 6.4, c[0], c[1], [1, 0.2, -0.6], w);
      p.handR = 'fist';
    }
    if (t < 0.62 || t > 6.35) rodShoulder(p, rig, 1 - max(put, pick));
    else if (put < 0.05 && pick < 0.05) {
      rig.reach(p, -1, 1.8, 2.4 + pat * 0.4, 5.4, [0.9, -0.4, -0.6], lie);
      p.handR = 'relax'; p.wristR.rx = 0.8;
    }
    rig.reach(p, 1, 1.8, 2.8 + pat * 0.5, 5.4 + pat * 0.4, [0.9, -0.4, -0.6], lie);
    if (lie < 0.5) pawCreel(p, rig);
    else { p.handL = 'relax'; p.wristL.rx = 0.8; }
    p.head.rx += lie * 0.35 + bob * 0.04;
    p.head.rz += sin(t * 1.1) * 0.08 * lie;
    tailPose(p, t, 0.5);
    p.tail.rx = lerp(-0.75, 0.2, lie); p.tail2.rx = lerp(0.45, 0.1, lie); p.tail.ry += sin(t * 2.2) * 0.4 * lie;
    if (lie > 0.6) { f.expr = 'content'; p.k.notes = t > 2.2 && t < 5.2 ? 1 : 0; }
    if (t > 2.6 && t < 3.8) f.mouth = 'chew1';
    if (beat(s, 'sp', t, 99, 1.7)) rig._emit('splash');
  },
});

export { ANIMS as OTTER_ANIMS };
