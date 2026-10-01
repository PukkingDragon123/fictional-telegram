// OwlRanger: "Professor Hoot", the bird expert at the fire watch tower. A plump
// great horned owl: ear tufts poking through a ranger's campaign hat, olive
// ranger shirt with a gold badge, binoculars on a strap, a clipboard and a
// pencil tucked in the hat band. Big yellow owl eyes, a beak that opens to talk.
//
//   const o = new OwlRanger();  scene.add(o.root);
//   o.play('binoculars');   // raises them and slowly scans (loop)
//   o.play('head_turn');    // owl swivel ~170 degrees and back
//   o.onEvent = (name) => {};  // 'step' | 'hoot' | 'flap' | 'land' | 'scribble' | 'spot' | 'swivel' | 'tap'
//
// Anims: idle wave talk laugh walk happy binoculars head_turn write_notes
// Expressions: neutral happy talk surprised sleepy smug focused proud (+ BASE_EXPRS)
// Walk speed: 'walk' ~0.5 units/s (move the root; the anim is in place).
// Units: 1 voxel = 0.05. Root at the feet, facing +Z. ~1.12 tall to the head, ~1.3 with hat + tufts.
import * as THREE from 'three';
import {
  VS, FV, VoxelModel, rbox, ell, tone, buildGeo, geoCache, mirrorX, handModel, K, beat, win,
  sin, cos, abs, max, min, PI, TAU, clamp, lerp, smooth, SPARK_ROWS,
} from './critterKit.js';
import { BASE_EXPRS } from './critterFaces.js';
import { BipedRig, HAND_KINDS } from './critterBiped.js';
import { NpcFace, talkMouth, stepEvents, orientIn, NOTE_ROWS, BANG_ROWS } from './npcProps.js';

const C = {
  fea: 0x8a6a4a, feaD: 0x6e5236, feaL: 0xa8885e, feaDD: 0x4a3622, bar: 0x5a422a,
  cream: 0xf2e6c8, creamD: 0xdccca6, disc: 0xe6b27a, discD: 0xd09a62, discL: 0xf0c490, rim: 0x5a3a22, rimL: 0xc07c46,
  beak: 0x5e544a, beakD: 0x3a322c, beakL: 0x8a7e70, foot: 0xd8c070, footD: 0xb89a50, talon: 0x3a2e2a,
  shirt: 0x8a9450, shirtD: 0x6a7438, shirtL: 0xa2ac64, button: 0xe8dcb0,
  badge: 0xffd23a, badgeD: 0xc89a1a, tag: 0xf4ead0,
  shorts: 0x7a6a44, shortsD: 0x5e5032, belt: 0x4a3020, buckle: 0xe8c050,
  hat: 0xc49a5a, hatD: 0xa07a3e, hatL: 0xdcb47a, band: 0x6a4424, bandL: 0x8a5a30,
  bino: 0x34402e, binoD: 0x1e261c, binoL: 0x4e5a44, lens: 0x6ac0e8, lensL: 0xd8f4ff, strap: 0x5a3a22,
  board: 0xa8743e, boardD: 0x86582c, paper: 0xfaf6ea, line: 0x9ab0c8, clip: 0xc8ccd6, clipD: 0x9aa0ae,
  pencil: 0xffd23a, pencilD: 0xe0a81c, eraser: 0xf0a0a8, ferrule: 0xc8ccd6, wood: 0xf0d0a0, lead: 0x2a2028,
};

const D = {
  HIP_Y: 5, WAIST: 1, NECK: 8.0, NECK_Z: 0.2, SH: [6.3, 6.6, 0], L_UP: 3.4, L_FORE: 3.2, L_HAND: 2.2,
  THIGH: 2.7, SHIN: 2.6, LEG_X: 2.6, EAR: [4.6, 7.0, -0.6], TAIL: [0.6, -5.2],
};
const EYE_Y = 5.0; // head space

// ------------------------------------------------------------------ models
const feaCol = (x, y, z) => ((y * 2 + ((x * 3 + z * 5) & 3)) % 7 === 0 ? C.bar : tone(x, y, z, C.fea, C.feaD, C.feaL, 0.14, 0.1));
const shirtCol = (x, y, z) => tone(x, y, z, C.shirt, C.shirtD, C.shirtL, 0.12, 0.08);
function surfZ(v, x, y) { for (let z = 12; z >= -12; z--) if (v.has(x, y, z)) return z; return null; }

function pelvisModel() {
  const v = new VoxelModel();
  rbox(v, -5, 4, -3, 0, -4, 3, 1.4, (x, y, z) => (y === 0 ? (x === -1 || x === 0) && z >= 2 ? C.buckle : C.belt : tone(x, y, z, C.shorts, C.shortsD, C.shorts)));
  v.set(-1, 0, 4, C.buckle); v.set(0, 0, 4, C.buckle);
  // a little radio pouch on the belt
  for (let y = -2; y <= 0; y++) for (let z = -1; z <= 1; z++) v.set(-6, y, z, y === 0 ? C.belt : C.shortsD);
  v.set(-6, 1, 0, C.feaDD);
  return v;
}
function torsoModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    const fx = abs(x + 0.5);
    if (y >= 8.6) return feaCol(x, y, z); // feather ruff around the head
    if (z >= 1 && fx <= (y - 4.6) * 0.8) return (x * 3 + y * 5) % 7 === 0 ? C.creamD : tone(x, y, z, C.cream, C.creamD, C.cream, 0.1, 0);
    return shirtCol(x, y, z);
  };
  ell(v, 0, 3.6, -0.2, 6.6, 6.6, 5.8, (x, y, z) => (y < -1 ? null : col(x, y, z)));
  ell(v, 0, 1.8, 0, 7.3, 4.6, 6.3, (x, y, z) => (y < -1 ? null : col(x, y, z))); // plump belly
  // collar along the V
  for (let y = 5; y <= 9; y++) {
    const e = Math.floor((y - 4.6) * 0.8 + 0.5);
    for (const x of [e, -1 - e]) { const z = surfZ(v, x, y); if (z !== null && y < 9) v.set(x, y, z + 1, C.shirtD); }
  }
  // placket + buttons
  for (let y = -1; y <= 4; y++) { const z = surfZ(v, -1, y); v.set(-1, y, z, C.shirtD); if (y === 0 || y === 3) v.set(-1, y, z + 1, C.button); }
  // flap pockets
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? 1 : -5, x1 = s > 0 ? 4 : -2;
    for (let x = x0; x <= x1; x++)
      for (let y = 2; y <= 5; y++) {
        const z = surfZ(v, x, y);
        if (z === null) continue;
        v.set(x, y, z + (y === 5 ? 1 : 0), y === 5 ? C.shirtD : y === 2 ? C.shirtD : C.shirt);
      }
    const bx = s > 0 ? 2 : -4; v.set(bx, 5, surfZ(v, bx, 5) + 1, C.button);
  }
  // badge (left chest) + name tag (right chest)
  for (const [x, y, c] of [[2, 7, C.badge], [3, 7, C.badge], [2, 6, C.badgeD], [3, 6, C.badge], [2, 8, C.badgeD], [3, 8, C.badgeD]]) v.set(x, y, surfZ(v, x, y) + 1, c);
  for (const x of [-5, -4, -3]) v.set(x, 6, surfZ(v, x, 6) + 1, C.tag);
  // epaulettes
  for (const s of [-1, 1]) for (let z = -2; z <= 1; z++) { const x = s > 0 ? 5 : -6; for (let y = 8; y <= 8; y++) { if (v.has(x, y, z)) v.set(x, y + 1, z, C.shirtD); } }
  // binocular strap from the neck down to the chest
  for (const s of [-1, 1])
    for (let y = 4; y <= 10; y++) {
      const x = Math.round(s * (1 + (y - 4) * 0.4)) - (s < 0 ? 1 : 0);
      const z = surfZ(v, x, y);
      if (z !== null) v.set(x, y, z + 1, C.strap);
    }
  return v;
}
function headModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    const fx = abs(x + 0.5);
    if (z >= 1) {
      // facial disc: two lobes merged in the middle, dark rim on the outside
      const r = Math.hypot(fx - 2.9, (y + 0.5 - EYE_Y) * (y < EYE_Y ? 0.8 : 1.15));
      const inner = fx < 2.9 && y > 0.5 && y < EYE_Y + 2.6;
      if (r < 3.0 || inner) return y >= EYE_Y + 2 && fx < 1.5 ? tone(x, y, z, C.cream, C.creamD, C.cream, 0.1, 0) : tone(x, y, z, C.disc, C.discD, C.discL, 0.14, 0.1);
      if (r < 3.9 && y < EYE_Y + 2.4) return r < 3.45 ? C.rimL : C.rim;
      if (fx < 3.2 && y <= 0.5) return tone(x, y, z, C.cream, C.creamD, C.cream, 0.08, 0); // white chin
    }
    return feaCol(x, y, z);
  };
  rbox(v, -7, 6, 0, 7, -5, 4, 3.8, col);
  ell(v, 0, 3.0, 0.4, 7.0, 3.4, 4.9, col); // full cheeks
  // small hooked beak
  for (let y = 2; y <= 3; y++) for (let x = -1; x <= 0; x++) v.set(x, y, 5, y === 3 && x === -1 ? C.beakL : C.beak);
  v.set(-1, 1, 5, C.beakD); v.set(0, 1, 5, C.beakD);
  return v;
}
function beakLoModel() {
  const v = new VoxelModel();
  for (let x = -1; x <= 0; x++) v.set(x, -1, 0, C.beakD);
  return v;
}
function tuftModel() {
  const v = new VoxelModel();
  const rows = [[0, 2], [0, 2], [1, 2], [1, 2], [2, 2]];
  rows.forEach(([a, b], y) => {
    for (let x = a; x <= b; x++) for (let z = -1; z <= 0; z++) v.set(x, y, z, y === 4 ? C.feaDD : x === b ? C.feaDD : x === a ? C.feaL : C.fea);
  });
  return v;
}
function hatModel() {
  const v = new VoxelModel();
  for (let x = -8; x <= 7; x++)
    for (let z = -8; z <= 7; z++) {
      const r = Math.hypot(x + 0.5, z + 0.5);
      if (r > 7.4) continue;
      v.set(x, 0, z, r > 6.6 ? C.hatD : (x + z) % 5 === 0 ? C.hatL : C.hat);
    }
  // crown with a "Montana pinch"
  for (let y = 1; y <= 4; y++)
    for (let x = -4; x <= 3; x++)
      for (let z = -4; z <= 3; z++) {
        const r = Math.hypot(x + 0.5, z + 0.5), R = 3.3 - (y - 1) * 0.3;
        if (r > R) continue;
        if (y === 4 && abs(x + 0.5) > 1 && abs(z + 0.5) > 1) continue;
        if (y === 4 && abs(x + 0.5) < 1 && abs(z + 0.5) < 1) continue;
        v.set(x, y, z, y === 1 ? (r > R - 1 ? C.band : C.hat) : y === 4 ? C.hatD : tone(x, y, z, C.hat, C.hatD, C.hatL, 0.1, 0.1));
      }
  // band emblem: a little gold pine
  v.set(-1, 1, 3, C.badge); v.set(0, 1, 3, C.badgeD); v.set(-1, 2, 3, C.badgeD); v.set(0, 2, 3, C.badge);
  // chin strap ends
  v.set(-4, 1, -1, C.bandL); v.set(3, 1, -1, C.bandL);
  return v;
}
function upperModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_UP, 0, -1, 1, 1.0, (x, y, z) => (y >= -1 ? (y === -1 ? C.shirtD : shirtCol(x, y, z)) : feaCol(x, y, z)));
  rbox(v, -2, 2, -1, 0, -2, 2, 1.2, (x, y, z) => (y === -1 ? C.shirtD : shirtCol(x, y, z)));
  return v;
}
function foreModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_FORE - 1, 0, -1, 1, 1.2, feaCol);
  // trailing primaries along the back edge
  for (let y = -1; y >= -D.L_FORE - 2; y--) for (let x = -1; x <= 1; x++) v.set(x, Math.round(y), -2, y <= -D.L_FORE - 1 ? C.feaL : (x + y) % 3 === 0 ? C.bar : C.feaD);
  return v;
}
function thighModel() {
  const v = new VoxelModel();
  rbox(v, -2, 2, -D.THIGH, 1, -2, 2, 1.4, (x, y, z) => ((x + y * 2) % 4 === 0 ? C.creamD : tone(x, y, z, C.cream, C.creamD, C.feaL, 0.2, 0.06)));
  return v;
}
function shinModel() {
  const v = new VoxelModel();
  for (let y = -D.SHIN + 1; y <= 0; y++) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 0; z++) if (x !== 1 || z !== 0) v.set(x, y, z, y % 2 ? C.foot : C.footD);
  const y = -D.SHIN;
  for (const x of [-1, 0, 1]) { for (let z = -1; z <= 2; z++) v.set(x, y, z, C.foot); v.set(x, y, 3, C.talon); }
  v.set(0, y, -2, C.foot); v.set(0, y, -3, C.talon);
  return v;
}
function tailModel() {
  const v = new VoxelModel();
  for (let y = -4; y <= 0; y++) {
    const w = 2 + Math.round((-y) * 0.5);
    for (let x = -w; x < w; x++) v.set(x, y, 0, y === -4 ? C.feaL : (y + x) % 3 === 0 ? C.bar : C.feaD);
    for (let x = -w + 1; x < w - 1; x++) v.set(x, y, 1, C.feaD);
  }
  return v;
}
function binoModel() {
  const v = new VoxelModel();
  for (const cx of [-2.5, 1.5])
    for (let z = -3; z <= 3; z++)
      for (let x = Math.floor(cx - 2); x <= cx + 2; x++)
        for (let y = -2; y <= 2; y++) {
          const r = Math.hypot(x + 0.5 - cx - 0.5, y), R = z >= 2 ? 2.0 : z <= -2 ? 1.3 : 1.6;
          if (r > R) continue;
          let c = tone(x, y, z, C.bino, C.binoD, C.binoL, 0.15, 0.1);
          if (z === 3) c = r < 1.2 ? (y === 1 ? C.lensL : C.lens) : C.binoD;
          if (z === -3) c = C.binoD;
          if (z === 1 && r > 1.2) c = C.binoL;
          v.set(x, y, z, c);
        }
  for (let x = -1; x <= 0; x++) for (let z = -1; z <= 1; z++) v.set(x, 0, z, C.binoL);
  v.set(-1, 1, 0, C.lens); v.set(0, 1, 0, C.binoD); // focus wheel
  return v;
}
function clipboardModel() {
  const v = new VoxelModel();
  // board in the XY plane (paper on +Z), pivot at the left edge middle
  for (let x = 0; x <= 8; x++) for (let y = -5; y <= 5; y++) v.set(x, y, 0, x === 0 || x === 8 || y === -5 ? C.boardD : tone(x, y, 0, C.board, C.boardD, C.board, 0.15, 0));
  for (let x = 1; x <= 7; x++) for (let y = -4; y <= 3; y++) v.set(x, y, 1, (y + 10) % 2 === 0 && x > 1 && x < 7 ? C.line : C.paper);
  v.set(2, 1, 1, 0x3a7ad8); v.set(3, 1, 1, 0x3a7ad8); v.set(5, -1, 1, 0x3a7ad8); v.set(2, -3, 1, 0xd8403a); // scribbles
  v.set(5, 2, 1, C.feaD); v.set(6, 2, 1, C.feaD); v.set(5, 3, 1, C.feaD); // a little bird sketch
  for (let x = 2; x <= 6; x++) { v.set(x, 5, 1, C.clip); v.set(x, 4, 1, x === 2 || x === 6 ? C.clipD : C.clip); }
  v.set(4, 5, 2, C.clipD);
  return v;
}
function pencilModel() {
  const v = new VoxelModel();
  v.set(0, -5, 0, C.lead); v.set(0, -4, 0, C.wood);
  for (let y = -3; y <= 3; y++) v.set(0, y, 0, y % 2 ? C.pencil : C.pencilD);
  v.set(0, 4, 0, C.ferrule); v.set(0, 5, 0, C.eraser);
  return v;
}

const cache = geoCache(() => {
  const G = {
    pelvis: buildGeo(pelvisModel()), torso: buildGeo(torsoModel()), head: buildGeo(headModel()), beakLo: buildGeo(beakLoModel()),
    earL: buildGeo(tuftModel()), earR: buildGeo(mirrorX(tuftModel())), hat: buildGeo(hatModel()),
    upper: buildGeo(upperModel(), [0.5, 0, 0.5]), fore: buildGeo(foreModel(), [0.5, 0, 0.5]),
    thigh: buildGeo(thighModel(), [0.5, 0, 0.5]), shin: buildGeo(shinModel(), [0.5, 0, 0.5]), tail: buildGeo(tailModel(), [0, 0, 0]),
    bino: buildGeo(binoModel(), [0.5, 0, 0], FV), clip: buildGeo(clipboardModel(), [0, 0, 0], FV), pencil: buildGeo(pencilModel(), [0.5, 0, 0.5], FV),
  };
  for (const k of HAND_KINDS) {
    G['hand_' + k + 'L'] = buildGeo(handModel(k, 1, C.feaD, C.feaDD), [0, 0, 0], FV);
    G['hand_' + k + 'R'] = buildGeo(handModel(k, -1, C.feaD, C.feaDD), [0, 0, 0], FV);
  }
  return G;
});

// ------------------------------------------------------------------ face
const FACE = {
  w: 60, h: 30, eyes: [{ x: 17, y: 15 }, { x: 43, y: 15 }], rx: 6.6, ry: 6.8, style: 'toon',
  blush: [{ x: 9, y: 25 }, { x: 51, y: 25 }], blushW: 3,
  mw: 8, mh: 4, mx: 4, my: 1, mstyle: 'owl', mHalf: 2,
  pal: { w: '#ffd23a', W: '#f0a020', f: '#8a6a4a', F: '#4a3220', b: '#fff4dc', q: '#e88a18', v: '#fff4dc', V: '#b88a5a' },
};
const OPENISH = new Set(['open', 'half', 'focused', 'sleepy', 'shiny']);
/** Owl eyes: big black pupils with an amber ring on the yellow iris. */
function owlEyes(P, st, cfg) {
  // white V brows rising toward the ear tufts (always)
  cfg.eyes.forEach((e, i) => {
    const side = i ? 1 : -1;
    const br = st.ownBrows;
    const lift = br === 'raised' ? -2 : br === 'angry' ? 1 : br === 'up' ? -1 : br === 'worried' ? -1.5 : 0;
    const x0 = e.x - side * 2.5, y0 = e.y - cfg.ry - 0.6 + (br === 'angry' ? 1.5 : br === 'worried' ? -2 : 0) + lift * 0.4;
    const x1 = e.x + side * (cfg.rx + 2.5), y1 = e.y - cfg.ry - 4.2 + lift;
    P.line(x0, y0 + 2, x1, y1 + 2, 'V', 1);
    P.line(x0, y0, x1, y1, 'v', 2);
  });
  if (st.blink || !OPENISH.has(st.eyes || 'open')) return;
  cfg.eyes.forEach((e, i) => {
    const side = i ? 1 : -1;
    const lx = Math.round((st.lookX || 0) * 1.6), ly = Math.round((st.lookY || 0) * 1.2);
    const px = e.x + lx - side * 0.3, py = e.y + ly + (st.eyes === 'half' ? 1 : 0.3);
    const ok = (x, y) => P.is(x, y, 'w') || P.is(x, y, 'W') || P.is(x, y, 'p') || P.is(x, y, 'h');
    for (let y = Math.floor(py - 5); y <= py + 5; y++)
      for (let x = Math.floor(px - 5); x <= px + 5; x++) {
        if (!ok(x, y)) continue;
        const d = ((x + 0.5 - px) / 2.6) ** 2 + ((y + 0.5 - py) / 2.9) ** 2;
        if (d <= 1) P.set(x, y, 'p');
        else if (d <= 1.55) P.set(x, y, 'q');
      }
    for (const [a, b] of [[-1.6, -1.9], [-0.6, -1.9], [-1.6, -0.9], [-0.6, -0.9]]) if (P.is(px + a, py + b, 'p')) P.set(px + a, py + b, 'h');
    if (P.is(px + 1.4, py + 1.4, 'p')) P.set(px + 1.4, py + 1.4, 'h');
  });
}
const EXPRS = {
  ...BASE_EXPRS,
  neutral: { eyes: 'open', brows: null, mouth: 'smile', blush: 0, tear: 0 },
  happy: { eyes: 'happy', brows: null, mouth: 'grin', blush: 1, tear: 0 },
  talk: { eyes: 'open', brows: 'up', mouth: 'open', blush: 0, tear: 0 },
  surprised: { eyes: 'wide', brows: 'raised', mouth: 'o', blush: 0, tear: 0 },
  sleepy: { eyes: 'sleepy', brows: null, mouth: 'smile', blush: 0, tear: 0 },
  smug: { eyes: 'half', brows: 'flat', mouth: 'smile', blush: 0, tear: 0 },
  focused: { eyes: 'focused', brows: 'angry', mouth: 'flat', blush: 0, tear: 0 },
  laugh: { eyes: 'happy', brows: 'up', mouth: 'laugh', blush: 1, tear: 0 },
};
const BEAK_OPEN = { open: 0.55, laugh: 0.65, yell: 0.7, grin: 0.3, o: 0.4, sip: 0.15, chew2: 0.2, frown: 0.05 };

// ------------------------------------------------------------------ rig
export class OwlRanger extends BipedRig {
  constructor({ shadows = true } = {}) {
    super('OwlRanger', { shadows });
    const G = (this._G = cache.get());
    this._geoCache = cache;
    this._buildBiped(G, D);
    this.joint('hat', this.head, 0, 8.3, -0.6);
    this.mesh(G.hat, this.hat);
    this.hatPencil = this.mesh(G.pencil, this.hat, { x: -3.5 * VS, y: 1.6 * VS, z: 0.4 * VS });
    this.hatPencil.rotation.set(PI / 2 - 0.15, 0, 0.1);
    this.beakLo = new THREE.Group(); this.beakLo.position.set(0, 2.2 * VS, 4.6 * VS); this.head.add(this.beakLo);
    this.mesh(G.beakLo, this.beakLo);
    this._beak = 0;
    this.face = new NpcFace(FACE, { eyes: owlEyes, ownBrows: true });
    this.facePlane(this.face.eyes.tex, this.head, FACE.w, FACE.h, 0, EYE_Y, 5.1);
    // binoculars on the chest
    this.joint('bino', this.chest, 0, 3.8, 6.8);
    this.mesh(G.bino, this.bino, { y: -2.2 * FV });
    // clipboard: in the left hand, or tucked under the left wing; pencil in the right hand
    this.clipHand = this.mesh(G.clip, this.gripL);
    this.clipTuck = this.mesh(G.clip, this.chest, { x: 6.2 * VS, y: 1.0 * VS, z: 2.2 * VS });
    this.clipTuck.rotation.set(0, -PI / 2, 0.08);
    this.pencil = this.mesh(G.pencil, this.gripR);
    this._clipRest = new THREE.Quaternion();
    this._penRest = new THREE.Quaternion().setFromEuler(new THREE.Euler(PI / 2, 0, 0));
    // sprites
    this.notes = [0, 1].map(() => this.sprite(NOTE_ROWS, 0.07, this.root));
    this.sparks = [0, 1, 2].map(() => this.sprite(SPARK_ROWS, 0.07, this.root));
    this.bang = this.sprite(BANG_ROWS, 0.09, this.root);
    this.scalar('hoot', 0);
    this.scalar('spark', 0);
    this.scalar('bang', 0);
    this.scalar('clipW', 1); // 1 = aimed by clipY/clipZ (chest space), 0 = rigid in hand
    this.scalar('clipYz', 0); this.scalar('clipYy', 1); this.scalar('clipZx', 1); this.scalar('clipZy', 0); this.scalar('clipZz', 0.15);
    this.scalar('penW', 0);
    this.jiggle('earL', 'rz', { k: 170, c: 8, ay: -0.02, ax: 0.03, yaw: 0.01, max: 0.5, probe: 'head' });
    this.jiggle('earR', 'rz', { k: 170, c: 8, ay: 0.02, ax: 0.03, yaw: 0.01, max: 0.5, probe: 'head' });
    this.jiggle('earL', 'rx', { k: 160, c: 8, az: 0.02, max: 0.4, probe: 'head' });
    this.jiggle('earR', 'rx', { k: 160, c: 8, az: 0.02, max: 0.4, probe: 'head' });
    this.jiggle('hat', 'rx', { k: 240, c: 11, az: -0.012, ay: 0.006, max: 0.3, probe: 'head' });
    this.jiggle('hat', 'rz', { k: 240, c: 11, ax: 0.012, max: 0.25, probe: 'head' });
    this.jiggle('chest', 's', { k: 200, c: 8, ay: 0.003, max: 0.07, probe: 'hips' });
    this.jiggle('bino', 'rx', { k: 90, c: 5, az: 0.03, ay: 0.01, max: 0.5, probe: 'chest' });
    this.jiggle('bino', 'rz', { k: 90, c: 5, ax: -0.03, max: 0.4, probe: 'chest' });
    this.jiggle('tail', 'rx', { k: 150, c: 7, ay: 0.03, max: 0.5, probe: 'hips' });
    this.jiggle('tail', 'ry', { k: 140, c: 7, ax: 0.03, yaw: 0.02, max: 0.5, probe: 'hips' });
    this._init(ANIMS, EXPRS, 'idle');
  }
  _post(p, dt) {
    this._setHands(p);
    const k = this.k;
    const tuck = !!p.vis.tuck;
    this.clipTuck.visible = tuck;
    this.clipHand.visible = !tuck && !p.vis.noClip;
    if (this.clipHand.visible) {
      orientIn(this.clipHand, this.chest, [0, k.clipYy, k.clipYz], [k.clipZx, k.clipZy, k.clipZz], clamp(k.clipW, 0, 1), this._clipRest);
      // hold it by the left edge, centred on the palm
      this.clipHand.position.set(0, 0, 0);
    }
    this.pencil.visible = !!p.vis.pencil;
    this.hatPencil.visible = !p.vis.pencil;
    if (this.pencil.visible) orientIn(this.pencil, this.chest, [0.25, 0.85, -0.35], [0, 0.4, 0.9], clamp(k.penW, 0, 1), this._penRest);
    // sprites
    const tz = this.time;
    this.head.updateWorldMatrix(true, false);
    _w.set(0, 5 * VS, 6 * VS); this.head.localToWorld(_w); this.root.worldToLocal(_w);
    this.notes.forEach((s, i) => {
      const u = (tz * 0.55 + i * 0.5) % 1;
      s.visible = k.hoot > 0.5;
      s.position.set(_w.x + 0.12 + u * 0.14 + sin(u * 8 + i) * 0.03, _w.y + u * 0.3, _w.z);
      s.scale.setScalar(0.065 * (u < 0.8 ? 1 : (1 - u) / 0.2) * min(1, u * 6));
    });
    const sp = k.spark;
    this.sparks.forEach((s, i) => {
      s.visible = sp > 0.05;
      const a = i * 2.1 + tz * 1.6;
      s.position.set(cos(a) * 0.36, _w.y + 0.1 + sin(a * 1.3) * 0.14, sin(a) * 0.12 + 0.1);
      s.scale.setScalar(0.07 * sin(clamp(sp, 0, 1) * PI) * (0.7 + 0.3 * sin(tz * 9 + i)));
    });
    this.bang.visible = k.bang > 0.05;
    this.bang.position.set(_w.x + 0.05, _w.y + 0.42 + k.bang * 0.05, _w.z - 0.1);
    this.bang.scale.setScalar(0.1 * clamp(k.bang * 1.4, 0, 1));
  }
  _updateFace(dt, f, def) {
    super._updateFace(dt, f, def);
    const tgt = BEAK_OPEN[this._fst.mouth] || 0;
    this._beak += (tgt - this._beak) * Math.min(1, dt * 30);
    this.beakLo.rotation.x = this._beak;
  }
}
const _w = new THREE.Vector3();

// ------------------------------------------------------------------ pose helpers
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };
const _hp = [0, 0];
const ff = (t, d) => (t > d ? t % d : t);

/** Plump owl standing: proud chest, soft knees, binoculars hanging. */
function stand(p, rig, t, amt = 1) {
  rig.life(t, p, amt);
  rig.stance(p, 0.3, 0.6, 0.6, 0.14);
  p.chest.rx -= 0.03;
  p.bino.rx = 1.45;
}
/** Left hand carries the clipboard at the side (paper facing out). */
function clipSide(p, rig) {
  rig.reach(p, 1, 6.8, 0.2, 2.4, [0.8, 0, -1]);
  p.wristL.rx = 0.2; p.handL = 'fist';
  p.k.clipW = 1; p.k.clipYy = 1; p.k.clipYz = 0.2; p.k.clipZx = 1; p.k.clipZy = 0; p.k.clipZz = 0.25;
}
/** Clipboard held against the chest, paper facing the listener. */
function clipShow(p, rig, u = 1) {
  rig.reach(p, 1, lerp(6.8, 3.4, u), lerp(0.2, 2.6, u), lerp(2.4, 6.8, u), [0.9, -0.4, -0.6]);
  p.wristL.rx = 0.3; p.handL = 'fist';
  p.k.clipW = 1; p.k.clipYy = 1; p.k.clipYz = lerp(0.2, -0.15, u); p.k.clipZx = lerp(1, -0.25, u); p.k.clipZy = 0; p.k.clipZz = lerp(0.25, 1, u);
}
/** Clipboard held up for writing (paper facing up / toward him). */
function clipWrite(p, rig, u = 1) {
  rig.reach(p, 1, lerp(6.8, 4.4, u), lerp(0.2, 3.4, u), lerp(2.4, 6.4, u), [0.9, -0.4, -0.6]);
  p.wristL.rx = 0.3; p.handL = 'fist';
  p.k.clipW = 1; p.k.clipYy = lerp(1, 0.45, u); p.k.clipYz = lerp(0.2, 0.9, u); p.k.clipZx = lerp(1, -0.85, u); p.k.clipZy = lerp(0, 0.5, u); p.k.clipZz = lerp(0.25, -0.1, u);
}
/** Right wing tucked behind the back, professor style. */
function behindBack(p, rig) {
  rig.reach(p, -1, 3.0, 1.4, -5.0, [1, 0, 0.6]);
  p.handR = 'relax'; p.wristR.rx = -0.4;
}

// ------------------------------------------------------------------ animations
def('idle', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    stand(p, rig, t);
    const sway = sin(t * 0.75);
    p.hips.x = sway * 0.25; p.hips.rz = sway * 0.02; p.chest.rz = -sway * 0.03;
    clipSide(p, rig);
    behindBack(p, rig);
    const T = t % 10;
    // curious head tilts + a quick look round
    p.head.rz = K(T, [[0, 0], [1.6, 0], [1.8, 0.32, 'out'], [2.8, 0.32], [3.0, -0.28, 'io'], [3.9, -0.28], [4.1, 0]]);
    p.head.ry = K(T, [[0, 0], [5.0, 0], [5.25, 0.9, 'out'], [6.2, 0.9], [6.45, 0, 'io']]);
    p.head.x = sin(T * 18) * 0.25 * win(T, 7.0, 7.6, 0.05, 0.05); // owl bob
    p.head.y = abs(sin(T * 18)) * 0.25 * win(T, 7.0, 7.6, 0.05, 0.05);
    f.look = [p.head.ry * 0.8, 0];
    if (T > 3.95 && T < 4.6) f.eyes = 'sleepy'; // slow blink
    // fluff + hoot
    const hoot = win(T, 8.2, 9.3, 0.15, 0.2);
    p.chest.s += hoot * 0.05; p.head.rx -= hoot * 0.12;
    p.k.hoot = hoot > 0.5 ? 1 : 0;
    if (hoot > 0.3) f.mouth = sin(t * 9) > 0 ? 'o' : 'smile';
    if (beat(s, 'hoot', t, 10, 8.3)) rig._emit('hoot');
  },
});

def('walk', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    const ph = (t / 0.62) * TAU, sn = sin(ph), cs = cos(ph);
    rig.walk(p, ph, 0.5);
    p.hips.y = -0.5 + abs(cs) * 0.5;
    p.hips.rz = cs * 0.13; p.chest.rz = cs * 0.04; p.hips.ry = -sn * 0.06;
    p.head.rz = -cs * 0.17; // head stays level, owl style
    p.head.ry = sn * 0.05;
    p.bino.rx = 1.45;
    clipSide(p, rig);
    p.armL.rz += 0.15 + cs * 0.06;
    p.armR.rz = -0.35 + cs * 0.08; p.armR.rx = -sn * 0.25; p.foreR.rx = -0.4; p.handR = 'relax';
    p.tail.ry = sn * 0.2;
    stepEvents(s, ph, rig);
  },
});

def('wave', {
  loop: true, expr: 'happy',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.6);
    clipSide(p, rig);
    const wv = sin(t * 8.5);
    rig.reach(p, -1, 10.2 + wv * 0.7, 11.0, 4.4, [1, -0.6, 0.4]);
    p.wristR.rz = -wv * 0.4 + 0.2; p.wristR.rx = -0.2;
    p.handR = 'open';
    p.chest.rz -= 0.06; p.head.rz += 0.14 + sin(t * 4.2) * 0.05;
    f.mouth = 'grin';
  },
});

def('talk', {
  loop: true, expr: 'talk',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.7);
    const on = talkMouth(t, f, { rate: 6, open: 'open', mid: 'o', shut: 'smile', o: 'grin' });
    const T = t % 7;
    // explain (open palm) -> "Aha!" finger up -> tap the clipboard -> touch the hat brim
    const expl = win(T, 0.2, 2.2, 0.3, 0.3), aha = win(T, 2.5, 3.9, 0.2, 0.3), tap = win(T, 4.1, 5.4, 0.3, 0.3), brim = win(T, 5.6, 6.7, 0.25, 0.25);
    clipShow(p, rig, 0.4 + tap * 0.6);
    let x = 3.4, y = 1.6, z = 5.2;
    x = lerp(x, 8.2, expl); y = lerp(y, 4.4 + sin(t * 4.5) * 0.4, expl); z = lerp(z, 6.0, expl);
    x = lerp(x, 7.6, aha); y = lerp(y, 11.2, aha); z = lerp(z, 4.2, aha);
    x = lerp(x, 1.0, tap); y = lerp(y, 3.6 + abs(sin(t * 10)) * 0.5, tap); z = lerp(z, 8.2, tap);
    const hb = rig.headPoint(p, 9.0, 5.2, _hp);
    x = lerp(x, 3.0, brim); y = lerp(y, hb[0] - 2.2, brim); z = lerp(z, hb[1] + 0.6, brim);
    rig.reach(p, -1, x, y, z, [1, -0.5, -0.3]);
    p.handR = aha > 0.5 || tap > 0.5 ? 'point' : brim > 0.5 ? 'fist' : expl > 0.4 ? 'open' : 'relax';
    p.wristR.rz = -expl * 0.4; p.wristR.rx = -aha * 0.4;
    p.head.rx += (on ? sin(t * 6) * 0.04 : 0) - aha * 0.1 + brim * 0.06;
    p.head.rz += sin(t * 1.2) * 0.1;
    p.chest.ry = -expl * 0.12 + tap * 0.1;
    p.hat.rx = -brim * 0.12;
    if (aha > 0.5) { f.eyes = 'shiny'; f.brows = 'raised'; }
    if (tap > 0.5) f.look = [0.4, 0.8];
  },
});

def('laugh', {
  loop: true, expr: 'laugh',
  fn(t, p, f, s, rig) {
    const ha = sin(t * 12);
    stand(p, rig, t, 0.4);
    rig.stance(p, 0.3 + abs(ha) * 0.25, 0.6, 0.6, 0.14);
    p.vis.tuck = true;
    // both wings hold the belly; "hoo hoo hoo"
    rig.reach(p, 1, 3.6, 1.2 + ha * 0.2, 6.2, [0.9, -0.4, -0.6]);
    rig.reach(p, -1, 3.6, 1.2 - ha * 0.2, 6.2, [0.9, -0.4, -0.6]);
    p.handL = p.handR = 'open'; p.wristL.rx = p.wristR.rx = 0.7;
    p.chest.rx += -0.14 + ha * 0.05; p.head.rx += -0.3 + ha * 0.08;
    p.chest.s = 1 + abs(ha) * 0.05; p.mover.y += abs(ha) * 0.25;
    p.head.rz = sin(t * 2.2) * 0.12;
    p.k.hoot = 1;
    f.mouth = ha > -0.2 ? 'laugh' : 'o';
    if (beat(s, 'h', t, (TAU / 12) * 2, 0.1)) rig._emit('hoot');
  },
});

const HAPPY_DUR = 1.9;
def('happy', {
  dur: HAPPY_DUR, expr: 'happy', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, HAPPY_DUR);
    const jump = K(t, [[0, 0], [0.2, -0.9, 'out'], [0.3, 0], [0.55, 4.0, 'out'], [0.82, 0, 'in'], [0.92, -0.7, 'out'], [1.05, 0], [1.2, 1.6, 'out'], [1.36, 0, 'in'], [1.46, -0.4], [1.65, 0]]);
    const up = win(t, 0.22, 1.5, 0.12, 0.3);
    stand(p, rig, t, 0.4);
    p.vis.tuck = true;
    p.mover.y += max(0, jump);
    if (jump > 0.2) { p.thighL.rx = p.thighR.rx = -0.2; p.shinL.rx = p.shinR.rx = 0.4; p.thighL.rz = 0.3; p.thighR.rz = -0.3; }
    else rig.stance(p, max(0, -jump) * 1.2 + 0.3, 0.6, 0.6, 0.14);
    p.hips.s = 1 + (jump < 0 ? jump * 0.06 : 0.02);
    // wings out and flapping
    const fl = sin(t * 22) * up;
    p.armL.rz = 0.2 + up * (1.4 + fl * 0.45); p.armR.rz = -(0.2 + up * (1.4 + fl * 0.45));
    p.armL.rx = p.armR.rx = -0.2 * up;
    p.foreL.rx = p.foreR.rx = -0.2 - (1 - up) * 0.3;
    p.wristL.rz = p.wristR.rz = 0;
    p.handL = p.handR = 'open';
    p.chest.rx -= up * 0.1; p.head.rx -= up * 0.15;
    p.chest.s += up * 0.04;
    p.k.spark = clamp((t - 0.4) / 1.2, 0, 1) * (t < 1.6 ? 1 : 0);
    f.mouth = up > 0.3 ? 'open' : 'grin';
    if (up > 0.5 && beat(s, 'fl', t, TAU / 22, 0.3)) rig._emit('flap');
    if (beat(s, 'l1', t, 99, 0.82) || beat(s, 'l2', t, 99, 1.36)) rig._emit('land');
  },
});

def('binoculars', {
  loop: true, expr: 'focused',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.5);
    p.vis.tuck = true;
    const raise = smooth(t / 0.7);
    const st = max(0, t - 0.7);
    // slow scan with pauses; every so often he spots something ("!") and leans in
    const T = st % 9;
    const scan = K(T, [[0, 0], [1.6, 0.55, 'io'], [2.6, 0.55], [4.6, -0.6, 'io'], [5.6, -0.6], [7.2, 0.15, 'io'], [9, 0, 'io']]) * raise;
    const spot = win(T, 5.65, 7.0, 0.12, 0.4) * raise;
    p.chest.ry += scan * 0.55; p.hips.ry += scan * 0.35; p.head.ry += scan * 0.25;
    p.chest.rx += spot * 0.12; p.head.rx -= (0.08 + sin(st * 0.7) * 0.05) * raise;
    p.head.z += spot * 0.5;
    // binoculars to the eyes, both hands on the barrels
    const e = rig.headPoint(p, EYE_Y, 5.6 + spot * 0.4, _hp);
    p.bino.rx = lerp(1.45, p.head.rx, raise);
    p.bino.ry = p.head.ry * raise;
    p.bino.y = lerp(0, e[0] - 3.8 + 1.0, raise);
    p.bino.z = lerp(0, e[1] - 6.8 + 0.4, raise);
    const by = 3.8 + p.bino.y, bz = 6.8 + p.bino.z;
    rig.reach(p, 1, lerp(5.6, 2.4, raise), lerp(1.6, by - 2.2, raise), lerp(3, bz + 0.6, raise), [1, -0.6, -0.2]);
    rig.reach(p, -1, lerp(5.6, 2.4, raise), lerp(1.6, by - 2.2, raise), lerp(3, bz + 0.6, raise), [1, -0.6, -0.2]);
    p.wristL.rx = p.wristR.rx = -1.1 * raise; p.handL = p.handR = 'fist';
    p.k.bang = spot > 0.3 ? spot : 0;
    if (spot > 0.3) { f.expr = 'surprised'; f.mouth = 'o'; }
    f.blink = false;
    if (beat(s, 'spot', st, 9, 5.7)) rig._emit('spot');
  },
});

def('head_turn', {
  dur: 3.2, expr: 'neutral', next: 'idle',
  fn(t, p, f, s, rig) {
    stand(p, rig, t);
    clipSide(p, rig);
    behindBack(p, rig);
    // swivel all the way round, peer, blink, swivel back with a little overshoot
    const ry = K(t, [[0, 0], [0.25, 0], [0.95, 2.95, 'io'], [1.9, 2.95], [2.0, 3.0], [2.65, -0.18, 'io'], [3.0, 0, 'io']]);
    p.head.ry = ry;
    p.head.rz = K(t, [[0, 0], [1.1, 0], [1.3, 0.25, 'out'], [1.7, 0.25], [1.85, -0.1], [2.0, 0]]);
    p.chest.ry = ry * 0.04;
    f.look = [K(t, [[0, 0], [0.2, 1], [0.95, 0.6], [1.9, -1], [2.1, -1], [2.6, 0]]), 0];
    if (t > 1.45 && t < 1.6) f.eyes = 'closed';
    if (t > 2.65 && t < 3.0) f.eyes = 'shiny';
    if (beat(s, 'sw', t, 99, 0.3) || beat(s, 'sw2', t, 99, 2.0)) rig._emit('swivel');
  },
});

def('write_notes', {
  loop: true, expr: 'smug',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.6);
    const lift = smooth(t / 0.5);
    clipWrite(p, rig, lift);
    // 1) pluck the pencil from the hat band
    const grab = win(t, 0.05, 0.75, 0.3, 0.3);
    const hp = rig.headPoint(p, 9.6, 0.2, _hp);
    const st = max(0, t - 0.75), T = st % 6.4;
    // 2) scribble, look up at a bird, tap the beak thinking, scribble again
    const look = win(T, 2.2, 3.4, 0.25, 0.3), think = win(T, 3.6, 5.0, 0.25, 0.3);
    const wr = (1 - look) * (1 - think) * (t > 0.6 ? 1 : 0);
    const scrib = sin(st * 15) * 0.45 * wr, line = (st * 0.7) % 1.6;
    const bp = rig.headPoint(p, 2.6, 6.4, [0, 0]);
    let x = lerp(-0.2, 1.5 + line + scrib * 0.3, 1), y = 4.0 + abs(scrib) * 0.3 - line * 0.4, z = 8.6;
    x = lerp(x, 4.6, grab); y = lerp(y, hp[0] - 2.0, grab); z = lerp(z, hp[1] - 0.4, grab);
    x = lerp(x, 4.4, look); y = lerp(y, 3.0, look); z = lerp(z, 6.4, look);
    x = lerp(x, 2.0, think); y = lerp(y, bp[0] - 3.0 + abs(sin(st * 9)) * 0.4 * think, think); z = lerp(z, bp[1] + 0.6, think);
    rig.reach(p, -1, x, y, z, [1, -0.5, -0.3]);
    p.handR = 'fist'; p.wristR.rx = -0.3;
    p.vis.pencil = t > 0.42;
    p.k.penW = clamp((t - 0.45) / 0.3, 0, 1) * (1 - think * 0.6);
    p.head.rx += 0.32 * wr * lift - look * 0.45; p.head.ry += look * 0.35 - wr * 0.08;
    p.head.rz += think * 0.18;
    f.look = [look * 0.6, wr ? 1 : look ? -1 : 0];
    if (look > 0.5) f.expr = 'neutral';
    if (think > 0.4) { f.eyes = 'half'; f.look = [0.8, -0.6]; }
    if (wr > 0.5 && beat(s, 'sc', st, 0.42, 0)) rig._emit('scribble');
    if (think > 0.5 && beat(s, 'tap', st, 0.35, 0)) rig._emit('tap');
  },
});

export { ANIMS as OWL_ANIMS };
