// [v26 turtle] LongneckElder: "Old Longneck", the Old Wise Long-Neck Turtle who
// lives in the stone house behind the falls of Mistfall Hollow. Same CHIBI biped
// as the other neighbours, but unmistakably not Shellby: a very long, wobbly,
// segmented neck (five joints, a slow wave runs up it), a tall domed slate-green
// shell with growth rings on every scute, moss, little ferns, a tiny mushroom and
// barnacle stones on it, heavy sleepy lids, long white wispy brows and beard,
// tiny round brass spectacles perched low on the beak, a driftwood crook with a
// wind-chime bell, and a clay tea bowl. Everything he does is SLOW.
//
//   const t = new LongneckElder();  scene.add(t.root);
//   t.play('turn_head');   // slowly... slowly... turns to look at you (6 s)
//   t.onEvent = (name) => {};  // 'tap' (stick) | 'chime' | 'slurp' | 'ahh' | 'snore' | 'step' | 'word'
//
// Anims: idle talk nod retract hide sip_tea doze wake point turn_head wave happy laugh walk
// Expressions: neutral happy talk surprised sleepy smug asleep laugh (+ BASE_EXPRS)
// Units: 1 voxel = 0.05. Root at the feet, facing +Z. ~1.75 tall to the top of the head.
import * as THREE from 'three';
import {
  VS, FV, VoxelModel, rbox, ell, tone, hash3, buildGeo, geoCache, mirrorX, handModel, K, pulse, beat,
  sin, cos, abs, max, PI, TAU, clamp, lerp, smooth, ZZZ_ROWS, SPARK_ROWS,
} from './critterKit.js';
import { BASE_EXPRS } from './critterFaces.js';
import { BipedRig, HAND_KINDS } from './critterBiped.js';
import { NpcFace, stepEvents, plantStick, orientIn, PUFF_ROWS } from './npcProps.js';

const C = {
  skin: 0xa8b67c, skinD: 0x8a9a62, skinL: 0xc4d098, skinDD: 0x5a663e, spot: 0x7e8c56,
  belly: 0xd6cc9e, bellyD: 0xb8ad80, bellyL: 0xe8e0bc,
  shell: 0x5c6c68, shellD: 0x46544f, shellL: 0x7e9088, ring: 0x37423e, seam: 0x283230,
  scarf: 0xc8503a, scarfD: 0x9a3a2a, scarfL: 0xf0e0c0,
  moss: 0x4f9a3c, mossD: 0x3a7a2e, mossL: 0x7cc256, fern: 0x62b84c, fernD: 0x3e8a34,
  stone: 0x9c9c90, stoneD: 0x727268, stoneL: 0xc4c4b6,
  hair: 0xf6f4ec, hairD: 0xd8d4c8,
  stick: 0xb6aa90, stickD: 0x8a7e66, stickL: 0xd4cab0,
  brass: 0xd8b04a, brassD: 0xa8822a, brassL: 0xf0d27a, lens: 0xd8f0f8,
  clay: 0x8a5a3a, clayD: 0x6a4028, clayL: 0xb07a52, tea: 0x8aa846,
  mush: 0xc8743a, mushD: 0x9a5426, stem: 0xf0e6cc, cream: 0xfff0d0,
  beak: 0xc8bf96, beakD: 0x9a9070, beakL: 0xe2dab4, mouthIn: 0x5a2a2a, claw: 0x3e3a30,
};

const D = {
  CHIBI: { body: 0.86, head: 1.08 }, // small body, big head (BipedRig); the neck lives in body space
  HIP_Y: 5, WAIST: 1, NECK: 0, NECK_Z: 0, // the head is re-parented onto the end of the neck chain
  SH: [6.6, 6.2, 0.8], L_UP: 2.6, L_FORE: 2.4, L_HAND: 1.8,
  THIGH: 2.4, SHIN: 2.8, LEG_X: 3.2, EAR: [0.9, 6.1, 4.8], TAIL: [-0.6, -7.6],
};
const NB = [9.4, 2.4]; // neck base (y, z) in chest space
const SEG = 4.0, NSEG = 5; // neck segments (voxels, body space)
const NECK_REST = [-0.14, -0.1, 0.06, 0.26, 0.36]; // the S-curve (rx per segment, + = forward)
const STAFF_L = 20 * FV; // grip -> foot of the crook
const LID = 0.42; // resting heavy lids (0 = wide open, 1 = shut)

// ------------------------------------------------------------------ models
const skinCol = (x, y, z) => {
  const h = hash3(x, y, z);
  if (h < 0.06) return C.spot;
  return (x * 3 + y * 5 + z * 7) % 13 === 0 ? C.skinD : tone(x, y, z, C.skin, C.skinD, C.skinL, 0.12, 0.08);
};
function pelvisModel() {
  const v = new VoxelModel();
  rbox(v, -5, 4, -2, 1, -3, 2, 1.6, skinCol);
  return v;
}
function torsoModel() {
  const v = new VoxelModel();
  // a tall dome of a carapace on the back, a hood over the neck opening
  const CY = 5.6, CZ = -3.4, RX = 7.9, RY = 9.8, RZ = 7.0;
  const rowOf = (y) => (y + 3) / 4.6;
  const thOf = (x, y, z) => Math.atan2(x + 0.5, -(z + 0.5 - CZ)) * (2.3 / PI) + (Math.floor(rowOf(y)) % 2) * 0.5;
  const cell = (x, y, z) => Math.floor(rowOf(y)) * 100 + Math.floor(thOf(x, y, z) + 10);
  // scutes with concentric growth rings (very old shell): seams between cells, rings inside
  const shellCol = (x, y, z) => {
    const c0 = cell(x, y, z);
    if (cell(x + 1, y, z) !== c0 || cell(x, y + 1, z) !== c0 || cell(x, y, z - 1) !== c0) return C.seam;
    const u = abs(((thOf(x, y, z) + 10) % 1) - 0.5) * 2, w = abs((rowOf(y) % 1) - 0.5) * 2;
    const d = max(u, w);
    if (d < 0.22) return C.shellL;
    if (d > 0.4 && (d * 3.2) % 1 < 0.3) return C.ring;
    return tone(x, y, z, C.shell, C.shellD, C.shell, 0.12, 0.05);
  };
  ell(v, 0, CY, CZ, RX, RY, RZ, (x, y, z) => (y < -2 ? null : z <= 0 || (y >= 11 && z <= 2.6) ? shellCol(x, y, z) : null));
  // marginal scutes around the bottom rim
  for (let x = -8; x <= 7; x++) for (let z = -11; z <= 0; z++) if (v.has(x, -2, z)) v.set(x, -2, z, (x + z) % 2 ? C.shellD : C.seam);
  // bridges at the sides
  for (const x of [-7, 6]) for (let y = -1; y <= 8; y++) for (let z = -1; z <= 1; z++) v.set(x, y, z, (y + 20) % 3 === 0 ? C.seam : C.shellD);
  // plastron (belly plate), cream with seams
  rbox(v, -6, 5, -2, 9, -1, 1, 1.5, (x, y, z) => ((y + 20) % 4 === 0 || x === -1 || (x === 0 && y % 2 === 0) ? C.bellyD : tone(x, y, z, C.belly, C.bellyD, C.bellyL, 0.1, 0.1)));
  // wrinkly skin inside the neck opening
  rbox(v, -3, 2, 6, 12, -2, 2, 1.2, skinCol);
  // moss blanket on the top of the dome; remember the tops for ferns etc.
  const tops = [];
  for (let x = -8; x <= 7; x++)
    for (let z = -11; z <= 3; z++) {
      let top = null;
      for (let y = 17; y >= 0; y--) if (v.has(x, y, z)) { top = y; break; }
      if (top === null || top < 10) continue;
      if (z > 0 && top < 13) continue;
      const h = hash3(x, 7, z);
      if (h < 0.82) v.set(x, top, z, h < 0.3 ? C.mossD : h > 0.68 ? C.mossL : C.moss);
      if (h > 0.5) v.set(x, top + 1, z, h > 0.8 ? C.mossL : C.moss);
      tops.push([x, top + (h > 0.5 ? 1 : 0), z]);
    }
  // two little ferns: a curled stem with alternating leaflets
  const fern = (x0, y0, z0, dx, dz, n) => {
    for (let k = 0; k < n; k++) {
      const x = x0 + Math.round(dx * k * 0.5), y = y0 + 1 + k, z = z0 + Math.round(dz * k * 0.5);
      v.set(x, y, z, C.fernD);
      if (k > 0 && k < n - 1) { v.set(x + (k % 2 ? 1 : -1), y, z, C.fern); v.set(x, y, z + (k % 2 ? -1 : 1), C.fern); }
    }
    v.set(x0 + Math.round(dx * n * 0.5), y0 + n, z0 + Math.round(dz * n * 0.5), C.fern);
  };
  fern(-3, 15, -5, -1, 0.4, 5);
  fern(2, 15, -6, 1, -0.3, 4);
  fern(-5, 13, -2, -1.2, 0.8, 3);
  // a tiny orange mushroom on the back-right, cream spots
  v.set(5, 10, -8, C.stem); v.set(5, 11, -8, C.stem);
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) v.set(5 + dx, 12, -8 + dz, dx || dz ? C.mush : C.mushD);
  v.set(5, 13, -8, C.mush); v.set(6, 12, -8, C.cream); v.set(5, 12, -9, C.cream);
  // barnacle stones stuck on the shell sides (little grey rings with a dark middle)
  for (const [x, y, z] of [[-7, 4, -4], [6, 6, -6], [-5, 9, -8], [7, 2, -2], [-2, 3, -10], [3, 10, -9]]) {
    if (!v.has(x, y, z)) continue;
    const ox = x < 0 ? -1 : 1, oz = z < -6 ? -1 : 0;
    v.set(x + ox, y, z + oz, C.stoneD).set(x + ox, y + 1, z + oz, C.stone).set(x + ox, y, z + oz - 1, C.stoneL).set(x + ox, y + 1, z + oz - 1, C.stone);
  }
  // keel bumps
  for (let z = -10; z <= 0; z += 3) {
    let top = null;
    for (let y = 17; y >= 0; y--) if (v.has(-1, y, z)) { top = y; break; }
    if (top !== null && !v.has(-1, top + 1, z)) v.set(-1, top + 1, z, C.shellD);
  }
  return v;
}
function neckModel(i) {
  // a wrinkly tube segment along +Y (pivot at the base), throat paler at the front; a little thinner up top
  const v = new VoxelModel();
  const r = 2.7 - i * 0.12;
  for (let y = -1; y <= SEG; y++)
    for (let x = -3; x <= 2; x++)
      for (let z = -3; z <= 2; z++) {
        const d = Math.hypot(x + 0.5, z + 0.5);
        if (d > r) continue;
        const front = z >= 1 && abs(x + 0.5) < 2;
        const c = y === 0 ? C.skinD : front ? tone(x, y, z, C.belly, C.bellyD, C.bellyL, 0.1, 0.1) : skinCol(x, y + i * 9, z);
        v.set(x, y, z, c);
      }
  // a fold of loose skin on the sides at the base of every segment
  v.set(-3, 0, 0, C.skinDD); v.set(2, 0, 0, C.skinDD);
  return v;
}
function scarfModel() {
  // a long knitted scarf (a long neck needs a long scarf): a striped ring + one end hanging down the front
  const v = new VoxelModel();
  const col = (y, k) => ((y + k) % 3 === 0 ? C.scarfL : (y + k) % 3 === 1 ? C.scarf : C.scarfD);
  for (let y = 0; y <= 2; y++)
    for (let x = -4; x <= 3; x++)
      for (let z = -4; z <= 3; z++) {
        const d = Math.hypot(x + 0.5, z + 0.5);
        if (d <= 3.6 && d > 2.2) v.set(x, y, z, col(y, Math.floor((x + z + 20) / 2)));
      }
  for (let k = 0; k < 7; k++) for (let x = 0; x <= 2; x++) v.set(x - (k > 4 ? 1 : 0), -k, 3 + (k > 2 ? 1 : 0), col(k, x));
  for (let x = 0; x <= 2; x++) v.set(x - 1, -7, 4, C.scarfL); // fringe
  return v;
}
function headModel() {
  const v = new VoxelModel();
  // a round old tortoise head with a flat face disc (the eyes plane sits on it) and a short beak-snout
  ell(v, 0, 4.6, 0.5, 5.2, 4.4, 5.2, (x, y, z) => {
    if (z > 4) return null;
    if (y >= 7 && hash3(x, y, z) < 0.16) return C.spot; // age spots on the crown
    return skinCol(x, y, z);
  });
  rbox(v, -2, 1, 1, 2, 4, 6, 1.0, (x, y, z) => (z >= 6 ? (y === 1 ? C.beakD : C.beak) : skinCol(x, y, z)));
  // the beak's hooked tip, nostrils
  v.set(-1, 2, 7, C.beakL).set(0, 2, 7, C.beakL).set(-1, 1, 7, C.beakD).set(0, 1, 7, C.beakD).set(-1, 0, 7, C.beakD).set(0, 0, 7, C.beakD);
  v.set(-2, 2, 6, C.skinDD).set(1, 2, 6, C.skinDD);
  // a heavy brow ridge and forehead wrinkles over the face disc
  for (let x = -4; x <= 3; x++) if (v.has(x, 7, 4)) v.set(x, 7, 5, (x + 10) % 3 ? C.skinD : C.skinDD);
  for (let x = -2; x <= 1; x++) v.set(x, 8, 4, C.skinDD);
  // a mouth line along the sides
  for (const x of [-5, 4]) for (let z = -1; z <= 2; z++) if (v.has(x, 1, z)) v.set(x, 1, z, C.skinDD);
  // the throat where the neck goes in
  rbox(v, -3, 2, -1, 1, -2, 1, 1.2, skinCol);
  return v;
}
function jawModel() {
  const v = new VoxelModel();
  rbox(v, -4, 3, -1, 0, -2, 6, 0.9, (x, y, z) => (z >= 6 ? C.beakD : z >= 2 ? tone(x, y, z, C.belly, C.bellyD, C.bellyL, 0.1, 0.1) : skinCol(x, y, z)));
  for (let x = -2; x <= 1; x++) v.set(x, 1, 3, C.mouthIn).set(x, 1, 4, C.mouthIn);
  return v;
}
function browModel() {
  // long white wispy eyebrow (left; the "ear" joint): a short tuft over the eye that droops past its outer corner
  const v = new VoxelModel();
  v.set(0, 0, 0, C.hair).set(1, 0, 0, C.hairD).set(2, 0, 0, C.hair).set(1, 1, 0, C.hair);
  v.set(3, -1, 0, C.hair).set(3, -2, 1, C.hairD).set(4, -3, 1, C.hair);
  return v;
}
function beardModel() {
  // a long thin wispy goatee: strands of different lengths that curl at the end
  const v = new VoxelModel();
  const strands = [[-2, 4, 1], [-1, 8, 1], [0, 9, -1], [1, 5, -1]];
  for (const [x, len, curl] of strands)
    for (let k = 0; k < len; k++) {
      const xx = x + (k > len - 3 ? curl : 0);
      v.set(xx, -k, k > 2 ? 1 : 0, (x + k) % 3 ? C.hair : C.hairD);
    }
  v.set(0, -9, 0, C.hairD);
  return v;
}
function specsModel() {
  // tiny round brass spectacles (quarter voxels: 4 per voxel), perched low on the beak; origin between the lenses
  const v = new VoxelModel();
  for (const cx of [-9, 9])
    for (let x = cx - 6; x <= cx + 6; x++)
      for (let y = -6; y <= 6; y++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5);
        if (d <= 5.2 && d > 3.9) v.set(x, y, 0, y > 2 ? C.brassL : y < -3 ? C.brassD : C.brass);
      }
  // lens glints
  v.set(-7, 2, 1, C.lens).set(-6, 1, 1, C.lens).set(11, 2, 1, C.lens).set(12, 1, 1, C.lens);
  for (let x = -4; x <= 3; x++) v.set(x, 1 + (abs(x + 0.5) < 2 ? 1 : 0), 0, C.brass); // bridge
  // temples back to the sides of the head
  for (let k = 0; k <= 12; k++) { const x = 14 + Math.round(k * 0.5), z = -k; v.set(x, 1, z, C.brassD); v.set(-1 - x, 1, z, C.brassD); }
  return v;
}
function upperModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_UP, 0, -1, 1, 1.0, skinCol);
  return v;
}
function foreModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_FORE - 1, 0, -1, 1, 1.2, (x, y, z) => (y % 2 === 0 && z === 1 ? C.skinD : skinCol(x, y, z)));
  return v;
}
function thighModel() {
  const v = new VoxelModel();
  rbox(v, -2, 2, -D.THIGH, 1, -2, 1, 1.4, skinCol);
  return v;
}
function shinModel() {
  const v = new VoxelModel();
  rbox(v, -2, 2, -D.SHIN + 1, 0, -2, 1, 1.4, (x, y, z) => ((x + y + z) % 3 === 0 ? C.skinD : skinCol(x, y, z)));
  // big round elephant feet with three claws
  rbox(v, -3, 2, -D.SHIN, -D.SHIN + 1, -2, 2, 0.9, (x, y, z) => tone(x, y, z, C.skinD, C.skinDD, C.skinD, 0.2, 0));
  for (const x of [-2, 0, 1]) v.set(x, -D.SHIN, 3, C.claw);
  return v;
}
function tailModel() {
  const v = new VoxelModel();
  for (let z = 0; z >= -3; z--) { const w = z > -2 ? 1 : 0; for (let x = -1 - w; x <= w; x++) v.set(x, Math.round(z * 0.4), z, z === -3 ? C.skinD : skinCol(x, 0, z)); }
  return v;
}
function staffModel() {
  // a bleached driftwood crook (fine voxels): pivot at the grip, foot at -20, a hook on top with a tiny brass bell
  const v = new VoxelModel();
  const L = 20;
  for (let y = -L; y <= 5; y++) {
    const wob = Math.round(sin(y * 0.37) * 0.7);
    v.set(wob, y, 0, y <= -L + 1 ? C.stickD : tone(0, y, 0, C.stick, C.stickD, C.stickL, 0.18, 0.18));
    v.set(wob - 1, y, 0, C.stickD); v.set(wob, y, -1, C.stickD); v.set(wob - 1, y, -1, C.stick);
    if (y === -8 || y === 1) { v.set(wob + 1, y, 0, C.stickD); v.set(wob + 1, y, -1, C.stickD); }
  }
  // the hook: up, over and down towards the front (+z)
  const hook = [[0, 6], [0, 7], [1, 8], [2, 9], [3, 9], [4, 9], [5, 8], [6, 7], [6, 6], [6, 5]];
  for (const [z, y] of hook) { v.set(0, y, z, C.stick); v.set(-1, y, z, C.stickD); v.set(0, y, z - 1, C.stickL); }
  // string + bell under the hook's tip
  v.set(0, 4, 6, C.stickD).set(0, 3, 6, C.stickD);
  for (let x = -1; x <= 0; x++) for (let z = 5; z <= 6; z++) { v.set(x, 2, z, C.brass); v.set(x, 1, z, C.brassD); }
  v.set(0, 2, 7, C.brassL).set(-1, 1, 7, C.brassD).set(0, 1, 7, C.brass);
  return v;
}
function cupModel() {
  // a handleless clay tea bowl with green tea, pivot at the bottom centre (fine voxels)
  const v = new VoxelModel();
  for (let y = 0; y <= 5; y++)
    for (let x = -4; x <= 3; x++)
      for (let z = -4; z <= 3; z++) {
        const r = Math.hypot(x + 0.5, z + 0.5), R = y === 0 ? 2.4 : 3.3 + y * 0.12;
        if (r > R) continue;
        if (y === 5 && r < R - 1) { v.set(x, y, z, C.tea); continue; }
        if (y > 0 && r < R - 1) continue;
        v.set(x, y, z, y === 4 ? C.clayL : y === 0 ? C.clayD : tone(x, y, z, C.clay, C.clayD, C.clayL, 0.15, 0.1));
      }
  return v;
}

const cache = geoCache(() => {
  const G = {
    pelvis: buildGeo(pelvisModel()), torso: buildGeo(torsoModel()), head: buildGeo(headModel()),
    earL: buildGeo(browModel()), earR: buildGeo(mirrorX(browModel())), beard: buildGeo(beardModel(), [0, 0, 0]), jaw: buildGeo(jawModel()),
    specs: buildGeo(specsModel(), [0, 0, 0], FV * 0.5),
    upper: buildGeo(upperModel(), [0.5, 0, 0.5]), fore: buildGeo(foreModel(), [0.5, 0, 0.5]),
    thigh: buildGeo(thighModel(), [0.5, 0, 0.5]), shin: buildGeo(shinModel(), [0.5, 0, 0.5]), tail: buildGeo(tailModel(), [0, 0, 0]),
    staff: buildGeo(staffModel(), [0, 0, 0], FV), cup: buildGeo(cupModel(), [0, 0, 0], FV),
  };
  for (let i = 0; i < NSEG; i++) G['neck' + i] = buildGeo(neckModel(i), [0, 0, 0]);
  G.scarf = buildGeo(scarfModel(), [0, 0, 0]);
  for (const k of HAND_KINDS) {
    G['hand_' + k + 'L'] = buildGeo(handModel(k, 1, C.skin, C.skinDD), [0, 0, 0], FV);
    G['hand_' + k + 'R'] = buildGeo(handModel(k, -1, C.skin, C.skinDD), [0, 0, 0], FV);
  }
  return G;
});

// ------------------------------------------------------------------ face
const FACE = {
  w: 40, h: 16, eyes: [{ x: 11.6, y: 8 }, { x: 28.4, y: 8 }], rx: 4.4, ry: 5.0, style: 'bead', lash: false,
  blush: [{ x: 4, y: 13 }, { x: 36, y: 13 }], blushW: 2,
  mw: 24, mh: 10, mx: 12, my: 2, mstyle: 'turtle', mHalf: 5,
  pal: { b: '#f6f4ec', i: '#6a4a18', I: '#d0a040', f: '#a8b67c', F: '#5a663e' },
};
// heavy, droopy old lids drawn over the bead eyes (st.lid 0 = open .. 1 = shut) + a wrinkle under each eye
function lids(P, st) {
  const kind = st.eyes || 'open';
  if (kind === 'happy' || kind === 'closed' || kind === 'sleep' || kind === 'shut' || kind === 'heart') return;
  const lid = st.lid ?? LID;
  FACE.eyes.forEach((e, i) => {
    const side = i === 0 ? -1 : 1;
    const rx = 4.4 * 0.7 + 1, ry = 5.0 * 0.7 + 1;
    const y0 = Math.floor(e.y - ry), y1 = Math.ceil(e.y + ry);
    for (let x = Math.floor(e.x - rx - 1); x <= Math.ceil(e.x + rx); x++) {
      const xo = (x + 0.5 - e.x) * side; // + toward the outer corner: the lid droops there
      const edge = e.y - ry + (2 * ry + 0.5) * lid + max(0, xo) * 0.3;
      for (let y = y0; y <= y1; y++) {
        if (!P.get(x, y)) continue;
        if (y < edge - 0.5) P.set(x, y, 'f');
        else if (y < edge + 0.5) P.set(x, y, 'k');
      }
    }
    // the bag under the eye
    for (let x = -2; x <= 2; x++) P.set(e.x + x, e.y + ry + (abs(x) > 1 ? 0 : 1), 'F');
  });
}
class LongneckFace extends NpcFace {
  update(st) {
    let q = Math.round(clamp(this.lid ?? LID, 0, 1) * 10) / 10;
    if (st.eyes === 'wide') q = 0;
    else if (st.eyes === 'sleepy') q = max(q, 0.68);
    else if (st.eyes === 'half') q = max(q, 0.55);
    if (q !== this._lq) { this._lq = q; this.eyes.key = ''; }
    st.lid = q;
    super.update(st);
  }
}

const EXPRS = {
  ...BASE_EXPRS,
  neutral: { eyes: 'open', brows: null, mouth: 'smile', blush: 0, tear: 0 },
  happy: { eyes: 'happy', brows: 'up', mouth: 'grin', blush: 1, tear: 0 },
  talk: { eyes: 'open', brows: 'up', mouth: 'smile', blush: 0, tear: 0 },
  surprised: { eyes: 'wide', brows: 'raised', mouth: 'o', blush: 0, tear: 0 },
  sleepy: { eyes: 'sleepy', brows: null, mouth: 'flat', blush: 0, tear: 0 },
  smug: { eyes: 'half', brows: 'flat', mouth: 'smile', blush: 1, tear: 0 },
  asleep: { eyes: 'sleep', brows: null, mouth: 'chew2', blush: 0, tear: 0 },
  laugh: { eyes: 'happy', brows: 'up', mouth: 'grin', blush: 1, tear: 0 },
};
const JAW_OPEN = { open: 0.36, laugh: 0.4, yell: 0.45, grin: 0.12, o: 0.24, sip: 0.1, chew2: 0.1, chew1: 0.04 };
// brow joint offsets per brow state: [lift (voxels), tilt (rad, + = outer end up)]
const BROW = { null: [0, 0], up: [0.4, 0.12], raised: [1.0, 0.3], angry: [-0.3, -0.3], worried: [0.3, -0.2], flat: [-0.15, 0] };

// ------------------------------------------------------------------ rig
const _w = new THREE.Vector3(), _w2 = new THREE.Vector3(), _q = new THREE.Quaternion();
export class LongneckElder extends BipedRig {
  constructor({ shadows = true } = {}) {
    super('LongneckElder', { shadows });
    const G = (this._G = cache.get());
    this._geoCache = cache;
    this._buildBiped(G, D);
    // the neck chain: chest -> neck0 .. neck4 -> head
    let par = this.chest;
    for (let i = 0; i < NSEG; i++) {
      const j = this.joint('neck' + i, par, 0, i ? SEG : NB[0], i ? 0 : NB[1]);
      this.mesh(G['neck' + i], j);
      par = j;
    }
    this.mesh(G.scarf, this.neck0, { y: 0.6 * VS });
    par.add(this.head);
    const hj = this._joints.find((j) => j.name === 'head');
    hj.rest.set(0, (SEG - 0.6) * VS, 0.2 * VS);
    this.head.position.copy(hj.rest);
    // jaw + beard
    this.jaw = new THREE.Group(); this.jaw.position.set(0, 1 * VS, -2 * VS); this.head.add(this.jaw);
    this.mesh(G.jaw, this.jaw, { z: 2 * VS });
    this._jaw = 0;
    this.joint('beard', this.jaw, 0, -0.8, 6.4);
    this.mesh(G.beard, this.beard);
    // face + spectacles perched low on the beak
    this.face = new LongneckFace(FACE, { eyes: lids, ownBrows: true });
    this.facePlane(this.face.eyes.tex, this.head, FACE.w, FACE.h, 0, 4.6, 5);
    this.specs = this.mesh(G.specs, this.head, { y: 3.6 * VS, z: 5.35 * VS });
    // driftwood crook (left hand, planted) + tea bowl (right hand, only when sipping)
    this.staff = this.mesh(G.staff, this.gripL);
    this._staffRest = new THREE.Quaternion().setFromEuler(new THREE.Euler(PI / 2, 0, 0));
    this.cup = this.mesh(G.cup, this.gripR);
    this.cup.scale.setScalar(1.3);
    this._brow = [0, 0];
    this.zzz = [0, 1, 2].map(() => this.sprite(ZZZ_ROWS, 0.08, this.space));
    this.steam = [0, 1].map(() => this.sprite(PUFF_ROWS, 0.05, this.space));
    this.sparks = [0, 1, 2].map(() => this.sprite(SPARK_ROWS, 0.07, this.space));
    this.scalar('stick', 1);
    this.scalar('stickLean', 0.3);
    this.scalar('stickLift', 0);
    this.scalar('stickPoint', 0); // 1 = held out, pointing ahead with the tip
    this.scalar('cup', 0);
    this.scalar('steam', 1);
    this.scalar('zzz', 0);
    this.scalar('spark', 0);
    this.scalar('lid', LID);
    this.scalar('jawK', 0); // slow talking jaw (0..1)
    // the wobbly neck: springs on the upper segments, driven by the body's motion
    this.jiggle('neck2', 'rz', { k: 60, c: 3.5, ax: 0.04, yaw: 0.03, max: 0.25, probe: 'chest' });
    this.jiggle('neck3', 'rz', { k: 55, c: 3.2, ax: 0.05, yaw: 0.04, max: 0.3, probe: 'chest' });
    this.jiggle('neck3', 'rx', { k: 70, c: 4, az: 0.04, ay: 0.03, max: 0.25, probe: 'chest' });
    this.jiggle('neck4', 'rx', { k: 80, c: 4, az: 0.04, ay: 0.03, max: 0.3, probe: 'neck2' });
    this.jiggle('earL', 'rz', { k: 120, c: 5, ay: -0.03, ax: 0.02, max: 0.5, probe: 'head' });
    this.jiggle('earR', 'rz', { k: 120, c: 5, ay: 0.03, ax: 0.02, max: 0.5, probe: 'head' });
    this.jiggle('beard', 'rx', { k: 90, c: 4, az: 0.03, ay: 0.02, max: 0.6, probe: 'head' });
    this.jiggle('beard', 'rz', { k: 90, c: 4, ax: -0.03, max: 0.5, probe: 'head' });
    this.jiggle('tail', 'ry', { k: 140, c: 7, ax: 0.03, yaw: 0.02, max: 0.5, probe: 'hips' });
    this._init(ANIMS, EXPRS, 'idle');
  }
  _updateFace(dt, f, def) {
    if (this.face) this.face.lid = this.k?.lid ?? LID;
    super._updateFace(dt, f, def);
    const tgt = max(JAW_OPEN[this._fst.mouth] || 0, (this.k?.jawK || 0) * 0.34);
    this._jaw += (tgt - this._jaw) * Math.min(1, dt * 10);
    this.jaw.rotation.x = this._jaw;
  }
  _post(p, dt) {
    this._setHands(p);
    const k = this.k;
    plantStick(this.staff, this.space, STAFF_L, [0.3, k.stickLean], clamp(k.stick, 0, 1), this._staffRest, k.stickLift);
    if (k.stickPoint > 0.01) { _q.copy(this.staff.quaternion); orientIn(this.staff, this.space, [-0.15, 0.55, -1], [0, 1, 0], clamp(k.stickPoint, 0, 1), _q); }
    this.cup.visible = k.cup > 0.5;
    if (this.cup.visible) { orientIn(this.cup, this.chest, [0, 1, 0], [0, 0, 1]); this.cup.position.set(-0.01, -0.035, 0.02); }
    // brows follow the face's brow state
    const E = this._EXPRS[this._userExpr || this._f.expr || this._cur.def.expr] || this._EXPRS.neutral;
    const bs = BROW[(this._userExpr ? E.brows : this._f.brows || E.brows) ?? 'null'] || BROW.null;
    const r = Math.min(1, dt * 6);
    this._brow[0] += (bs[0] - this._brow[0]) * r; this._brow[1] += (bs[1] - this._brow[1]) * r;
    this.earL.position.y += this._brow[0] * VS; this.earR.position.y += this._brow[0] * VS;
    this.earL.rotation.z += this._brow[1]; this.earR.rotation.z -= this._brow[1];
    // sprites
    const tz = this.time;
    this.headFx.updateWorldMatrix(true, false);
    _w.set(0, 8 * VS, 2 * VS); this.headFx.localToWorld(_w); this.space.worldToLocal(_w);
    this.zzz.forEach((s, i) => {
      const u = (tz * 0.25 + i / 3) % 1;
      s.visible = k.zzz > 0.5;
      s.position.set(_w.x + 0.1 + u * 0.14 + sin(u * 9) * 0.02, _w.y + u * 0.32, _w.z);
      s.scale.setScalar((0.04 + u * 0.06) * (u < 0.85 ? 1 : (1 - u) / 0.15));
    });
    let cw = null;
    if (this.cup.visible) { this.cup.updateWorldMatrix(true, false); cw = this.cup.localToWorld(_w2.set(0, 6 * FV, 0)); this.space.worldToLocal(cw); }
    this.steam.forEach((s, i) => {
      const u = (tz * 0.3 + i * 0.5) % 1;
      s.visible = !!cw && k.steam > 0.5;
      if (!s.visible) return;
      s.position.set(cw.x + sin(u * 6 + i * 2) * 0.025, cw.y + 0.02 + u * 0.16, cw.z);
      s.scale.setScalar(0.045 * (0.5 + u) * (u < 0.7 ? 1 : (1 - u) / 0.3));
    });
    const sp = k.spark;
    this.sparks.forEach((s, i) => {
      s.visible = sp > 0.05;
      const a2 = i * 2.1 + tz * 0.8;
      s.position.set(_w.x + cos(a2) * 0.3, _w.y - 0.1 + sin(a2 * 1.3) * 0.12, _w.z + sin(a2) * 0.1);
      s.scale.setScalar(0.07 * sin(clamp(sp, 0, 1) * PI) * (0.7 + 0.3 * sin(tz * 5 + i)));
    });
  }
}

// ------------------------------------------------------------------ pose helpers
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };
const ff = (t, d) => (t > d ? t % d : t);

/** Old stance: soft knees, a little forward, very slow breathing. */
function stand(p, rig, t, amt = 1) {
  rig.life(t * 0.35, p, amt * 0.8);
  rig.stance(p, 0.4, 0.5, 0.3, 0.14);
  p.chest.rx += 0.06;
  p.tail.rx = -0.25;
}
/**
 * The long neck: S-curve + a slow wave travelling up it. fwd bends it forward/down (+),
 * lift straightens it up, turn spreads a yaw over the segments, tilt nods the head.
 * The head is kept level unless `tilt` says otherwise.
 */
function neck(p, t, { sway = 1, lift = 0, fwd = 0, turn = 0, tilt = 0, curl = null } = {}) {
  let sum = 0;
  for (let i = 0; i < NSEG; i++) {
    const q = p['neck' + i];
    q.rx += (curl ? curl[i] : NECK_REST[i] * (1 - lift)) + fwd * (i < 3 ? 0.22 : -0.04);
    q.rz += sin(t * 0.5 - i * 0.6) * 0.045 * sway;
    q.rx += sin(t * 0.37 - i * 0.5) * 0.02 * sway;
    q.ry += turn / NSEG;
    sum += q.rx;
  }
  p.head.rx += -sum * 0.9 + tilt + 0.05;
  return sum;
}
/** Super slow blink every ~9 s (lids are heavy anyway). */
function slowBlink(t, p, f, base = LID, period = 9) {
  f.blink = false;
  const T = t % period;
  p.k.lid = K(T, [[0, base], [period - 2.4, base], [period - 1.5, 1, 'io'], [period - 1.0, 1], [period - 0.1, base, 'io']]);
}
/** Left hand on the planted crook. */
function stickHand(p, rig, dz = 0, dy = 0) {
  rig.reach(p, 1, 7.4, 2.6 + dy, 3.4 + dz, [0.7, -0.4, -1]);
  p.wristL.rx = 0.2; p.handL = 'fist';
}
/** Right hand resting on the belly. */
function restHand(p, rig, dx = 0, dy = 0, dz = 0) {
  rig.reach(p, -1, 4.6 + dx, 3.4 + dy, 4.0 + dz, [0.9, -0.5, -0.6]);
  p.wristR.rx = 0.3; p.handR = 'relax';
}

// ------------------------------------------------------------------ animations
def('idle', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    stand(p, rig, t);
    const T = t % 24;
    // a slow look around: left... (a long time) ... right ... back
    const look = K(T, [[0, 0], [6, 0], [9, 0.45, 'io'], [12, 0.45], [15, -0.35, 'io'], [18, -0.35], [21, 0, 'io']]);
    neck(p, t, { turn: look * 0.6 });
    p.head.ry += look * 0.4;
    f.look = [look * 1.2, 0];
    stickHand(p, rig);
    restHand(p, rig, 0, sin(t * 0.35) * 0.2);
    slowBlink(t, p, f);
    if (beat(s, 'tap', t, 12, 10.5)) rig._emit('tap');
    p.k.stickLift = pulse(t % 12, 10.2, 0.5) * 0.02;
  },
});

def('talk', {
  loop: true, expr: 'talk',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.8);
    // one... very... slow... word: the jaw creaks open, hangs there, closes. A wise nod per word.
    const W = 3.4, u = t % W;
    const jaw = K(u, [[0, 0], [1.1, 1, 'io'], [1.9, 1], [2.9, 0, 'io']]);
    p.k.jawK = jaw;
    f.mouth = jaw > 0.4 ? 'o' : 'smile';
    neck(p, t, { fwd: 0.12 + jaw * 0.08, tilt: -jaw * 0.12 + sin(t * 0.6) * 0.04 });
    stickHand(p, rig);
    // the free hand rises, palm up, very slowly, and sinks again ("...patience...")
    const g = 0.5 - 0.5 * cos((t / 11) * TAU);
    rig.reach(p, -1, lerp(4.6, 6.2, g), lerp(3.4, 6.4, g), lerp(4.0, 4.9, g), [0.9, -0.5, -0.6]);
    p.wristR.rx = 0.3 - g * 0.8; p.handR = g > 0.3 ? 'open' : 'relax';
    slowBlink(t, p, f, LID + 0.05, 10);
    if (beat(s, 'w', t, W, 1.1)) rig._emit('word');
  },
});

const NOD = 4.2;
def('nod', {
  dur: NOD, expr: 'neutral', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, NOD);
    stand(p, rig, t);
    const n = K(t, [[0, 0], [1.6, 1, 'io'], [2.4, 1], [3.8, 0, 'io']]);
    neck(p, t, { fwd: n * 0.35, tilt: n * 0.35 });
    stickHand(p, rig);
    restHand(p, rig);
    p.k.lid = LID + n * 0.35; f.blink = false;
    if (n > 0.8) f.eyes = 'happy';
  },
});

// the head pulls into the shell (slowly), stays a while, comes back out (slowly)
const RET = 8;
function retractPose(p, w) {
  // the neck folds up like a concertina and slides back into the shell, the head ducks under the hood
  const fold = [0.9, -1.5, 1.4, -1.2, 0.2];
  for (let i = 0; i < NSEG; i++) p['neck' + i].rx += fold[i] * w;
  p.neck0.z -= 4.2 * w; p.neck0.y -= 3.2 * w;
  p.head.rx += 0.25 * w;
}
def('retract', {
  dur: RET, expr: 'sleepy', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, RET);
    stand(p, rig, t, 0.5);
    const w = K(t, [[0, 0], [2.6, 1, 'io'], [5.6, 1], [7.6, 0, 'io']]);
    neck(p, t, { sway: 1 - w });
    retractPose(p, w);
    stickHand(p, rig);
    restHand(p, rig);
    p.k.lid = lerp(LID, 0.85, w); f.blink = false;
    if (t > 5.6 && t < 6.6) f.eyes = 'open';
  },
});
def('hide', {
  loop: true, expr: 'asleep',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.4);
    const w = smooth(t / 2.6);
    neck(p, t, { sway: 1 - w });
    retractPose(p, w);
    stickHand(p, rig);
    restHand(p, rig);
    p.k.lid = 1; f.blink = false;
  },
});

const SIP = 9;
def('sip_tea', {
  dur: SIP, expr: 'neutral', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, SIP);
    stand(p, rig, t, 0.6);
    stickHand(p, rig);
    p.k.cup = t < SIP - 0.3 ? 1 : 0;
    // the bowl comes up to the chest... and the whole long neck curls down to meet it
    const lift = K(t, [[0, 0], [1.6, 1, 'io'], [6.6, 1], [8.4, 0, 'io']]);
    const dip = K(t, [[0, 0], [1.6, 0], [3.4, 1, 'io'], [5.2, 1], [6.8, 0, 'io']]);
    rig.reach(p, -1, lerp(4.6, 3.2, lift), lerp(3.4, 8.0, lift), lerp(4.0, 4.8, lift), [1, -0.5, -0.4]);
    p.wristR.rx = 0.2; p.handR = 'fist';
    neck(p, t, { sway: 1 - dip, curl: NECK_REST.map((r, i) => r + dip * [0.25, 0.35, 0.35, 0.2, 0.05][i]), tilt: dip * 0.45 });
    p.k.steam = dip > 0.6 ? 0 : 1;
    f.blink = false;
    p.k.lid = lerp(LID, 0.8, dip);
    if (dip > 0.6) { f.mouth = 'sip'; f.eyes = 'happy'; }
    if (t > 6.8 && t < 8.6) { f.expr = 'smug'; f.mouth = 'smile'; }
    if (beat(s, 'sl', t, 99, 3.8)) rig._emit('slurp');
    if (beat(s, 'ah', t, 99, 6.9)) rig._emit('ahh');
  },
});

def('doze', {
  loop: true, expr: 'asleep',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.3);
    stickHand(p, rig, -0.3, -0.3);
    restHand(p, rig, 0, -0.4);
    // the lids slide shut, then the long neck droops lower... and lower... and bobs
    const w = smooth(t / 5);
    const br = sin(t * 0.9);
    neck(p, t, { sway: 0.4, curl: NECK_REST.map((r, i) => r + w * [0.15, 0.3, 0.35, 0.2, 0][i]), tilt: w * 0.35 + br * 0.05 * w });
    p.chest.s = 1 + br * 0.03 * w;
    p.k.lid = lerp(LID, 1, smooth(t / 2.5)); f.blink = false;
    p.k.zzz = w > 0.8 ? 1 : 0;
    if (w < 0.5) f.expr = 'sleepy';
    if (w > 0.8 && beat(s, 'sn', t, TAU / 0.9, 0.5)) rig._emit('snore');
  },
});

def('wake', {
  dur: 4, expr: 'sleepy', next: 'idle',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.5);
    // no startle: one eye... then the other... then the neck slowly unfolds
    const up = K(t, [[0, 0], [1.2, 0], [3.6, 1, 'io']]);
    neck(p, t, { curl: NECK_REST.map((r, i) => r + (1 - up) * [0.15, 0.3, 0.35, 0.2, 0][i]), tilt: (1 - up) * 0.3 });
    stickHand(p, rig);
    restHand(p, rig);
    p.k.lid = K(t, [[0, 1], [1.0, 1], [2.2, 0.6, 'io'], [3.6, LID, 'io']]); f.blink = false;
    if (t > 3.2) f.expr = 'neutral';
  },
});

const PT = 7;
def('point', {
  dur: PT, expr: 'talk', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, PT);
    stand(p, rig, t, 0.6);
    restHand(p, rig);
    // the crook comes up... slowly... points out at something only he can see... goes back down
    const up = K(t, [[0, 0], [2.2, 1, 'io'], [5.0, 1], [6.8, 0, 'io']]);
    rig.reach(p, 1, lerp(7.4, 6.0, up), lerp(2.6, 6.4, up), lerp(3.4, 5.0, up), [1, -0.6, 0.2]);
    p.wristL.rx = -0.3 * up; p.handL = 'fist';
    p.k.stick = 1 - up; p.k.stickPoint = up;
    neck(p, t, { fwd: up * 0.25, turn: up * 0.25 });
    p.head.ry += up * 0.15;
    f.look = [up * 1.4, 0];
    slowBlink(t, p, f, LID - up * 0.15);
    if (up > 0.95) { f.brows = 'raised'; f.mouth = 'o'; p.k.jawK = 0.6; }
    if (beat(s, 'ch', t, 99, 2.4)) rig._emit('chime');
  },
});

const TURN = 6.4;
def('turn_head', {
  dur: TURN, expr: 'neutral', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, TURN);
    stand(p, rig, t, 0.6);
    stickHand(p, rig);
    restHand(p, rig);
    // looking away at the falls... then slowly... slowly... the whole neck swings round
    const k = K(t, [[0, 0], [0.8, 0], [5.4, 1, 'io']]);
    neck(p, t, { turn: lerp(2.2, 0, k), sway: 0.5 });
    p.head.ry += lerp(0.5, 0, k);
    f.look = [lerp(2, 0, k), 0];
    p.k.lid = K(t, [[0, LID + 0.1], [5.0, LID + 0.1], [5.8, LID - 0.1, 'io'], [6.4, LID, 'io']]); f.blink = false;
    if (t > 5.4) f.brows = 'up';
  },
});

const WAVE = 6;
def('wave', {
  dur: WAVE, expr: 'happy', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, WAVE);
    stand(p, rig, t, 0.6);
    stickHand(p, rig);
    // a hand rises (slowly), one slow wag, sinks (slowly)
    const up = K(t, [[0, 0], [2.0, 1, 'io'], [4.4, 1], [5.9, 0, 'io']]);
    const wag = sin(clamp((t - 2) / 2.4, 0, 1) * TAU) * up;
    rig.reach(p, -1, lerp(4.6, 7.4, up), lerp(3.4, 10.0, up), lerp(4.0, 3.0, up), [1, -0.6, 0.2]);
    p.wristR.rz = -wag * 0.4; p.handR = up > 0.4 ? 'open' : 'relax';
    neck(p, t, { tilt: -up * 0.1, turn: -up * 0.15 });
    p.head.rz += wag * 0.06;
    f.blink = false; p.k.lid = LID - up * 0.12;
    if (up < 0.5) f.expr = 'neutral';
  },
});

const HAPPY = 5;
def('happy', {
  dur: HAPPY, expr: 'happy', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, HAPPY);
    stand(p, rig, t, 0.6);
    stickHand(p, rig);
    restHand(p, rig, 0, sin(t * 1.2) * 0.3);
    // a deep, pleased, slow nod; little sparkles
    const n = K(t, [[0, 0], [1.6, 1, 'io'], [3.0, 1], [4.6, 0, 'io']]);
    neck(p, t, { fwd: n * 0.2, lift: -n * 0.1, tilt: n * 0.3 });
    p.k.spark = clamp(t / 4, 0, 1);
    f.blink = false;
    if (t < 0.6) f.expr = 'neutral';
    if (beat(s, 'ch', t, 99, 1.5)) rig._emit('chime');
  },
});

def('laugh', {
  loop: true, expr: 'laugh',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.3);
    // "heh... ... heh... ... heh": one slow chuckle every 1.6 s
    const h = pulse(t % 1.6, 0, 0.5);
    p.mover.y += h * 0.4; p.chest.s = 1 + h * 0.04;
    neck(p, t, { lift: h * 0.2, tilt: -h * 0.2 });
    p.k.jawK = h;
    stickHand(p, rig, 0, h * 0.3);
    restHand(p, rig, 0, h * 0.4);
    f.blink = false;
    f.mouth = h > 0.3 ? 'grin' : 'smile';
  },
});

def('walk', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    // a very unhurried plod
    const ph = (t / 1.6) * TAU, sn = sin(ph), cs = cos(ph);
    rig.walk(p, ph, 0.3);
    p.hips.y = -0.6 + abs(cs) * 0.3;
    p.hips.rz = cs * 0.08; p.chest.rz = -cs * 0.04; p.hips.ry = -sn * 0.06;
    p.chest.rx = 0.12;
    neck(p, t, { fwd: 0.1, sway: 1.4 });
    p.neck1.rz += cs * 0.04; p.neck3.rz -= cs * 0.05;
    stickHand(p, rig, 0.6 + sn * 1.0, sn * 0.3);
    p.k.stickLift = max(0, -sn) * 0.04; p.k.stickLean = 0.25 + sn * 0.7;
    restHand(p, rig, 0, abs(cs) * 0.2);
    p.tail.rx = -0.3; p.tail.ry = sn * 0.25;
    slowBlink(t, p, f);
    stepEvents(s, ph, rig);
  },
});

export { ANIMS as LONGNECK_ANIMS };
