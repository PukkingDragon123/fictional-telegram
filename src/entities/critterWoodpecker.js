// WoodpeckerCarpenter: "Chip", master carpenter of the tree house. A trim
// little woodpecker: a springy red crest, a cream face with black eye and
// "moustache" stripes, a chisel beak, black-and-white barred wings and a stiff
// prop tail. Round brass spectacles, a flat red carpenter's pencil tucked
// behind his ear-feathers, and a riveted leather carpenter's apron: a pocket
// of nails, a folding ruler, a tape measure clipped to the belt and a tiny
// hammer hanging in the hip loop.
//
//   const c = new WoodpeckerCarpenter();  scene.add(c.root);
//   c.play('peck_wood');  // a log pops up, he hops round and drums: tok-tok, tok-tok-tok-tok... chips fly
//   c.play('measure');    // tape out, "yay big", lets go - ZIP - it snaps back and makes him jump
//   c.play('saw');        // sawhorse + plank, saws the end off, blows the dust away
//   c.play('inspect');    // pushes his glasses up, squints at an offcut, approves
//   c.play('hammer');     // a nail: tap, tap, BANG! then twirls the hammer back into the loop
//   c.onEvent = (name) => {};  // 'step' | 'tok' | 'zip' | 'snap' | 'saw' | 'clunk' | 'hammer_hit' | 'flap' | 'land' | 'laugh' | 'blow' | 'pop' | 'ding'
//   c.beakTip(v3)        // beak tip in root space (for particles)
//
// Anims: idle wave talk laugh walk happy peck_wood measure saw inspect hammer
// Expressions: neutral happy talk surprised sleepy smug focused squint laugh proud (+ BASE_EXPRS)
// The crest reads his mood (up when surprised or delighted, flat when concentrating) and springs on every peck.
// Walk speed: 'walk' ~0.45 units/s (move the root, the anim is in place).
// Units: 1 voxel = 0.05. Root at the feet, facing +Z. ~1.15 tall to the head top, ~1.4 to the crest tip.
import * as THREE from 'three';
import {
  VS, FV, VoxelModel, rbox, ell, tone, buildGeo, geoCache, mirrorX, handModel, pixTex, Spring, K, pulse, beat, win,
  sin, cos, abs, max, min, PI, TAU, clamp, lerp, smooth, SPARK_ROWS, HEART_ROWS,
} from './critterKit.js';
import { BASE_EXPRS } from './critterFaces.js';
import { BipedRig, HAND_KINDS } from './critterBiped.js';
import { NpcFace, talkMouth, stepEvents, orientIn, NOTE_ROWS, BANG_ROWS } from './npcProps.js';
import { spriteMatPal, DIRT_PAL, DIRT_ROWS, FLOUR_ROWS } from './npcProps2.js';

const C = {
  red: 0xe23a3c, redD: 0xb02636, redL: 0xff6a52, redDD: 0x7e1a2a,
  ink: 0x2e2a36, inkD: 0x1c1822, inkL: 0x4a4652,
  bar: 0xf6f2e8, barD: 0xdcd6c8,
  cream: 0xf8eed8, creamD: 0xe6d6b6, creamL: 0xfffaf0,
  beak: 0x5e5c6a, beakD: 0x3e3c48, beakL: 0x9290a0, beakDD: 0x2a2832, tongue: 0xf08aa0,
  leg: 0x84849a, legD: 0x606074, talon: 0x2a2630,
  lea: 0x9c5c34, leaD: 0x7a4226, leaL: 0xbc7a4a, leaDD: 0x5a2e18, stitch: 0xf2d498,
  brass: 0xe8c050, brassD: 0xb88e2a, brassL: 0xfff0a0,
  rim: 0xd8a83a, rimD: 0x9a6a1a, glint: 0xffffff,
  pen: 0xd8403a, penD: 0xa82a28, penL: 0xf06a5a, penWood: 0xf0d0a0, penWoodD: 0xd8b07a, lead: 0x2a2028,
  iron: 0x9aa2b0, ironD: 0x646a78, ironL: 0xdce2ec, ironDD: 0x3e424c,
  hdl: 0xc88a4a, hdlD: 0xa0663a, hdlL: 0xe4ac6c,
  tape: 0xffd23a, tapeD: 0xd8a018, tapeL: 0xfff0a0, tapeK: 0x2a2630,
  ruler: 0xf6e2a8, rulerD: 0xd8bc78,
  pine: 0xeac48a, pineD: 0xcc9c5c, pineL: 0xf8deac, pineDD: 0xa87a44, knot: 0x8a5a2e, mark: 0x3a2a3a,
  bark: 0x7a5232, barkD: 0x5a3a22, barkL: 0x9a6a42, ring: 0xecc890, ringD: 0xc89a5e, hole: 0x5a3418, holeD: 0x2e1a10,
  moss: 0x6a9a3a, mossL: 0x8ab84a, leaf: 0x5aae3c, leafL: 0x86d05a, shroom: 0xe8804a, shroomL: 0xf8b878,
};

const D = {
  HIP_Y: 5.2, WAIST: 1, NECK: 7.8, NECK_Z: 0.4, SH: [5.3, 6.6, 0.2], L_UP: 3.3, L_FORE: 3.2, L_HAND: 2.0,
  THIGH: 2.7, SHIN: 2.8, LEG_X: 2.3, EAR: [6.5, 4.2, -1.4], TAIL: [0.8, -4.0],
};
const EYE_Y = 5.4; // eye centre, head space (voxels)
const BEAK = [3.3, 4.85]; // beak base (y, z), head space (voxels)
const BEAK_L = 10; // beak length (fine voxels)
// work props, root space (world units / fine voxels)
const HORSE = [0.1, 0.46]; // sawhorse x, z
const HORSE_RY = 0.45; // 'hammer': the plank sits at an angle (reads better than square-on)
const SAW_TURN = -0.62; // 'saw': he hops round to a 3/4 view so the plank and the blade both read diagonally from the camera
const PLANK_TOP = 16; // fine voxels above the ground
const CUT_X = -9; // saw cut, sawhorse space (fine voxels)
const NAIL_X = -5;
const LOG = [-0.7, 0.52]; // pecking log x, z
const LOG_R = 6; // fine voxels
const LOG_TURN = Math.atan2(LOG[0], LOG[1]);
/** Sawhorse-space point (world units) -> mover space (the sawhorse turns with him; yaw ry within his frame). */
function horsePt(x, y, z, out, ry = HORSE_RY) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return out.set(HORSE[0] + x * c + z * s, y, HORSE[1] - x * s + z * c);
}
const _hp = new THREE.Vector3();

// ------------------------------------------------------------------ models
const redCol = (x, y, z) => tone(x, y, z, C.red, C.redD, C.redL, 0.14, 0.1);
const inkCol = (x, y, z) => tone(x, y, z, C.ink, C.inkD, C.inkL, 0.12, 0.1);
const creamCol = (x, y, z) => tone(x, y, z, C.cream, C.creamD, C.creamL, 0.1, 0.08);
const leaCol = (x, y, z) => tone(x, y, z, C.lea, C.leaD, C.leaL, 0.07, 0.07);
/** Black feathers with white bars every third row (spotted, like a downy's wing). */
const barCol = (x, y, z) => ((y + 60) % 3 === 0 ? ((x + z + 60) % 4 === 0 ? C.barD : C.bar) : inkCol(x, y, z));
const pineCol = (x, y, z) => ((z + 40) % 3 === 0 ? C.pineD : tone(x, y, z, C.pine, C.pineD, C.pineL, 0.1, 0.12));
function surfZ(v, x, y, front = true) {
  if (front) { for (let z = 14; z >= -14; z--) if (v.has(x, y, z)) return z; }
  else for (let z = -14; z <= 14; z++) if (v.has(x, y, z)) return z;
  return null;
}

function pelvisModel() {
  const v = new VoxelModel();
  // cream belly feathers at the front, barred back
  rbox(v, -5, 4, -3, 1, -4, 3, 1.8, (x, y, z) => (z >= 0 ? creamCol(x, y, z) : barCol(x, y, z)));
  // apron skirt: a short leather panel over the tops of the thighs, stitched hem
  const zs = {};
  for (let x = -4; x <= 3; x++) for (let y = -3; y <= 0; y++) zs[x + ',' + y] = surfZ(v, x, y);
  for (let x = -4; x <= 3; x++)
    for (let y = -3; y <= 0; y++) {
      const zf = zs[x + ',' + y];
      const z = zf != null ? zf + 1 : 4;
      v.set(x, y, z, x === -4 || x === 3 || y === -3 ? C.leaD : leaCol(x, y, z));
      if (zf == null) for (let zz = 2; zz < z; zz++) if (!v.has(x, y, zz)) v.set(x, y, zz, C.leaDD);
    }
  // pockets: nails peeking out on the left, a folding ruler on the right
  for (const [x0, x1] of [[1, 2], [-3, -2]]) for (let x = x0; x <= x1; x++) for (let y = -2; y <= -1; y++) v.set(x, y, 5, y === -1 ? C.leaL : C.lea);
  v.set(1, 0, 5, C.iron); v.set(2, 0, 5, C.ironL);
  v.set(-3, 0, 5, C.ruler); v.set(-3, 1, 5, C.rulerD);
  // belt all round + a little bow at the back
  for (let x = -6; x <= 5; x++) for (let z = -5; z <= 4; z++) if (v.has(x, 1, z) && (!v.has(x + 1, 1, z) || !v.has(x - 1, 1, z) || !v.has(x, 1, z + 1) || !v.has(x, 1, z - 1))) v.set(x, 1, z, C.leaD);
  for (const [x, y, z, c] of [[-2, 1, -5, C.lea], [-3, 2, -5, C.lea], [1, 1, -5, C.lea], [2, 2, -5, C.lea], [-1, 1, -5, C.leaD], [0, 1, -5, C.leaD], [-1, 0, -5, C.leaD], [0, -1, -5, C.lea]]) v.set(x, y, z, c);
  // hammer loop on the right hip
  for (const [y, z] of [[0, -1], [0, 0], [0, 1]]) v.set(-6, y, z, C.leaD);
  v.set(-7, 0, -1, C.leaD); v.set(-7, 0, 1, C.leaD); v.set(-7, -1, 0, C.leaD);
  return v;
}
function torsoModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => (z >= -0.4 + abs(x + 0.5) * 0.3 ? creamCol(x, y, z) : barCol(x, y, z));
  ell(v, 0, 3.2, -0.4, 5.4, 6.0, 4.8, (x, y, z) => (y < -1 ? null : col(x, y, z)));
  ell(v, 0, 1.6, 0.2, 5.8, 4.2, 5.0, (x, y, z) => (y < -1 ? null : col(x, y, z))); // round little tummy
  // neck: cream throat, black nape
  rbox(v, -3, 2, 7, 10, -2, 2, 1.2, (x, y, z) => (z >= 0 ? creamCol(x, y, z) : inkCol(x, y, z)));
  // leather bib: stitched top, a pocket with a pencil stub, rivets where the strap joins
  const bx0 = -3, bx1 = 2, by0 = 0, by1 = 5;
  const zs = {};
  for (let x = bx0; x <= bx1; x++) for (let y = by0; y <= by1; y++) zs[x + ',' + y] = surfZ(v, x, y);
  for (let x = bx0; x <= bx1; x++)
    for (let y = by0; y <= by1; y++) {
      const z = zs[x + ',' + y];
      if (z === null) continue;
      const edge = x === bx0 || x === bx1 || y === by1;
      v.set(x, y, z + 1, edge ? C.leaD : y === by1 - 1 && (x & 1) ? C.stitch : leaCol(x, y, z));
    }
  for (let x = -2; x <= 0; x++) for (let y = 1; y <= 2; y++) v.set(x, y, zs[x + ',' + y] + 2, y === 2 ? C.leaL : C.lea);
  { const z = zs['-1,2']; v.set(-1, 3, z + 1, C.pen); v.set(-2, 3, z + 1, C.ruler); }
  // neck strap: bib corners up over the shoulders, round the back of the neck
  for (const x of [bx0, bx1]) for (let y = by1 + 1; y <= 9; y++) { const z = surfZ(v, x, y); if (z !== null) v.set(x, y, z + 1, y === 9 ? C.leaD : C.lea); }
  for (let x = -3; x <= 2; x++) { const z = surfZ(v, x, 9, false); if (z !== null) v.set(x, 9, z - 1, C.leaD); }
  for (const x of [bx0, bx1]) v.set(x, by1, zs[x + ',' + by1] + 1, C.brassD);
  return v;
}
function headModel() {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    const fx = abs(x + 0.5);
    if (y - 6.6 + max(0, -z) * 0.8 > 0) {
      // red cap, down the nape: scalloped feather rows, a dark rim where the eye-stripes wrap up the sides
      if (fx > 5.4 && y <= 7 && z < 3) return inkCol(x, y, z);
      if (y >= 8 && fx > 4.2 && fx < 5.6) return C.redD;
      return (z + 40 + ((x + 40) % 2)) % 3 === 0 ? C.redD : redCol(x, y, z);
    }
    if (z < -2.5 && y > 1) return inkCol(x, y, z); // black nape band
    if (fx > 4.6 && z < 2.4 && y >= 5 && y <= 6) return inkCol(x, y, z); // eye stripe
    const my = 3.1 - (3.6 - z) * 0.22; // malar stripe ("moustache") sloping back
    if (fx > 3.0 && z < 3.6 && abs(y - my) < 0.75) return inkCol(x, y, z);
    return creamCol(x, y, z);
  };
  rbox(v, -7, 6, 0, 8, -5, 4, 3.6, col);
  ell(v, 0, 3.0, 0.6, 7.2, 3.1, 4.6, col); // round cheeks
  return v;
}
// crest: four red feathers fanning up and back from the crown (fine voxels), split into a base and a
// springy tip at CREST_SPLIT so the tips whip on every peck and hop
const CREST_SPLIT = [3, -3]; // tip pivot (y, z), crest space (fine voxels)
const CREST_FEATHERS = [[4, 0, 6, 0.6], [1.5, -4, 8.5, 0.5], [-1.5, -8.5, 8, 0.4], [-4.5, -12, 5, 0.3]]; // base z, tip z, tip y, curl
function crestModel(tip) {
  const v = new VoxelModel();
  CREST_FEATHERS.forEach(([z0, z1, y1, curl], fi) => {
    for (let k = 0; k <= 40; k++) {
      const u = k / 40;
      const y = y1 * Math.sin(u * PI * 0.5), z = lerp(z0, z1, u) - curl * sin(u * PI) * 2;
      const hw = u < 0.55 ? 2 : 1;
      if ((y >= CREST_SPLIT[0]) !== tip) continue;
      for (let x = -hw; x < hw; x++)
        for (let t = 0; t <= (u < 0.75 ? 1 : 0); t++) {
          const yy = Math.round(y) - t - (tip ? CREST_SPLIT[0] : 0), zz = Math.round(z) - (tip ? CREST_SPLIT[1] : 0);
          v.set(x, yy, zz, u > 0.85 ? C.redDD : t ? C.redD : abs(x + 0.5) > 1 ? C.redD : fi === 0 || u > 0.6 ? C.redL : C.red);
        }
    }
  });
  if (!tip) for (let z = -5; z <= 4; z++) for (let x = -2; x < 2; x++) v.set(x, -1, z, abs(x + 0.5) > 1 ? C.redD : C.red); // root tuft
  return v;
}
function tuftModel() {
  // little cream ear-feather flick (the pencil lives behind the right one)
  const v = new VoxelModel();
  for (const [x, y, z, c] of [[0, 0, 0, C.cream], [0, 0, -1, C.creamD], [0, 1, -1, C.creamL]]) v.set(x, y, z, c);
  return v;
}
function beakModel() {
  // chisel beak (fine voxels): broad at the base, flat-sided taper to a chisel tip, +Z forward
  const v = new VoxelModel();
  for (let z = 0; z < BEAK_L; z++) {
    const u = z / (BEAK_L - 1);
    const hw = u < 0.3 ? 3 : u < 0.62 ? 2 : 1;
    const top = u < 0.25 ? 2 : u < 0.6 ? 1 : 0;
    for (let x = -hw; x < hw; x++)
      for (let y = 0; y <= top; y++) {
        let c = y === top ? (x === -1 ? C.beakL : C.beak) : C.beakD;
        if (z >= BEAK_L - 2) c = y === top ? C.beak : C.beakDD;
        v.set(x, y, z, c);
      }
  }
  return v;
}
function beakLoModel() {
  // lower mandible, hinged at the base; a pink tongue shows when it opens
  const v = new VoxelModel();
  for (let z = 0; z < BEAK_L - 1; z++) {
    const u = z / (BEAK_L - 2);
    const hw = u < 0.3 ? 3 : u < 0.62 ? 2 : 1;
    for (let x = -hw; x < hw; x++) {
      v.set(x, -2, z, z >= BEAK_L - 3 ? C.beakDD : C.beakD);
      const rim = x === -hw || x === hw - 1 || z >= BEAK_L - 4;
      v.set(x, -1, z, rim ? C.beakD : z < 4 ? C.tongue : C.beakDD);
    }
  }
  return v;
}
function glassesModel() {
  // round brass spectacles (fine voxels): two rims, an arched bridge over the beak, temples back to the ears
  const v = new VoxelModel();
  const CX = 5.75, R0 = 2.55, R1 = 3.5;
  for (const s of [-1, 1])
    for (let x = -11; x <= 10; x++)
      for (let y = -4; y <= 3; y++) {
        const r = Math.hypot(x + 0.5 - s * CX, y + 0.5);
        if (r >= R0 && r <= R1) v.set(x, y, 0, y >= 1 ? C.rim : y <= -2 ? C.rimD : C.rim);
      }
  for (const [x, y] of [[-3, 1], [-2, 2], [-1, 2], [0, 2], [1, 2], [2, 1]]) v.set(x, y, 0, C.rim);
  // tiny glints on the lenses
  v.set(-8, 1, 0, C.glint); v.set(3, 1, 0, C.glint);
  // temples
  for (const s of [-1, 1]) {
    const xo = s > 0 ? 9 : -10, xs = s > 0 ? 14 : -15;
    v.set(xo, 0, 0, C.rimD); v.set(s > 0 ? 10 : -11, 0, -1, C.rimD); v.set(s > 0 ? 11 : -12, 0, -1, C.rimD); v.set(s > 0 ? 12 : -13, 0, -2, C.rimD); v.set(s > 0 ? 13 : -14, 0, -2, C.rimD);
    for (let z = -3; z >= -12; z--) v.set(xs, 0, z, C.rimD);
    v.set(xs, -1, -12, C.rimD); v.set(xs, -2, -11, C.rimD);
  }
  return v;
}
function upperModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_UP, 0, -1, 1, 1.0, barCol);
  ell(v, 0.5, -0.6, 0.5, 2.2, 1.8, 2.2, (x, y, z) => ((x + y * 2 + z) % 4 === 0 ? C.bar : inkCol(x, y, z))); // spotted shoulder
  return v;
}
function foreModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_FORE - 1, 0, -1, 1, 1.2, barCol);
  // primaries trailing behind the wrist: black with white spots, pale tips
  for (let y = -1; y >= -D.L_FORE - 2; y--) for (let x = -1; x <= 1; x++) v.set(x, Math.round(y), -2, y <= -D.L_FORE - 1 ? C.barD : (x + y + 60) % 3 === 0 ? C.bar : C.inkD);
  return v;
}
function thighModel() {
  const v = new VoxelModel();
  rbox(v, -2, 1, -D.THIGH, 1, -2, 1, 1.3, (x, y, z) => ((x + y * 2 + 40) % 5 === 0 ? C.creamD : creamCol(x, y, z)));
  return v;
}
function shinModel() {
  const v = new VoxelModel();
  for (let y = -D.SHIN + 1; y <= 0; y++) for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) v.set(x, y, z, (y + 40) % 2 ? C.leg : C.legD);
  // zygodactyl feet: two toes forward, two back
  const y = Math.round(-D.SHIN);
  for (const x of [-2, 1]) { for (let z = 0; z <= 2; z++) v.set(x, y, z, C.leg); v.set(x, y, 3, C.talon); }
  for (const x of [-1, 0]) { v.set(x, y, 0, C.legD); v.set(x, y, 1, C.leg); }
  for (const x of [-1, 0]) { v.set(x, y, -1, C.leg); v.set(x, y, -2, C.legD); v.set(x, y, -3, C.talon); }
  return v;
}
function tailModel() {
  // stiff pointed tail (the brace woodpeckers lean on); white-barred outer feathers
  const v = new VoxelModel();
  for (let x = -3; x <= 2; x++) {
    const fx = abs(x + 0.5), bot = Math.round(-6 + fx * 0.8);
    for (let y = bot; y <= 0; y++) {
      const outer = fx > 2;
      v.set(x, y, 0, outer ? ((y + 40) % 2 ? C.bar : C.ink) : y === bot ? C.inkD : fx < 1 && y < -1 ? C.inkL : C.ink);
      if (y > bot + 1 && fx < 2) v.set(x, y, 1, C.inkD);
    }
  }
  return v;
}
function pencilModel() {
  // flat red carpenter's pencil, sharpened end toward +Y, origin in the middle
  const v = new VoxelModel();
  for (let y = -4; y <= 4; y++) for (let x = -1; x <= 0; x++) v.set(x, y, 0, y === -4 ? C.penD : x === -1 ? C.penL : C.pen);
  v.set(-1, 5, 0, C.penWood); v.set(0, 5, 0, C.penWoodD); v.set(-1, 6, 0, C.lead);
  return v;
}
function hammerModel() {
  // tiny claw hammer: grip at the origin, handle along +Y, head across it (striking face +Z, claw -Z)
  const v = new VoxelModel();
  for (let y = -2; y <= 5; y++)
    for (let x = -1; x <= 0; x++)
      for (let z = -1; z <= 0; z++) v.set(x, y, z, y <= 0 ? (y === -2 ? C.penD : (y & 1) ? C.pen : C.penL) : x === -1 && z === 0 ? C.hdlL : y === 5 ? C.hdlD : C.hdl);
  for (let z = -1; z <= 3; z++)
    for (let y = 6; y <= 8; y++)
      for (let x = -2; x <= 1; x++) {
        if (abs(x + 0.5) > 1 && (y === 6 || y === 8) && z < 3) continue;
        v.set(x, y, z, z === 3 ? C.ironL : y === 8 ? C.ironL : y === 6 ? C.ironD : C.iron);
      }
  for (const [y, z] of [[8, -2], [8, -3], [7, -4], [6, -5]]) for (let x = -1; x <= 0; x++) v.set(x, y, z, y === 8 ? C.iron : C.ironD);
  return v;
}
const HAMMER_FACE = new THREE.Vector3(0, 7.5 * FV, 4 * FV);
function tapeModel() {
  // chunky yellow tape measure (origin = centre), the blade comes out of a slot at the front bottom (+Z)
  const v = new VoxelModel();
  rbox(v, -2, 1, -3, 3, -3, 3, 1.6, (x, y, z) => {
    if (x === -2 || x === 1) { const r = Math.hypot(y, z); return r < 0.5 ? C.ironL : r < 1.5 ? C.tape : r < 2.6 ? C.tapeK : C.tape; }
    return y >= 2 && z <= 0 ? C.tapeL : y <= -2 ? C.tapeD : C.tape;
  });
  v.set(-1, 4, -1, C.tapeK); v.set(0, 4, -1, C.tapeK); v.set(-1, 4, 0, C.tapeK);
  v.set(-1, -2, 4, C.brass); v.set(0, -2, 4, C.brass); v.set(-1, -3, 4, C.brassD); v.set(0, -3, 4, C.brassD);
  return v;
}
const TAPE_EXIT = new THREE.Vector3(0, -1.5 * FV, 4 * FV);
function hookModel() {
  const v = new VoxelModel();
  for (const [x, y, z, c] of [[-1, 0, 0, C.brass], [0, 0, 0, C.brass], [-1, -1, 0, C.brassD], [0, -1, 0, C.brassD], [-1, -2, 0, C.brassD], [0, -2, 0, C.brassD], [-1, -2, -1, C.brassD], [0, -2, -1, C.brassD]]) v.set(x, y, z, c);
  return v;
}
function sawModel() {
  // handsaw: grip at the origin inside a closed wooden handle, blade along +Z, teeth along -Y
  const v = new VoxelModel();
  for (let z = -3; z <= 2; z++)
    for (let y = -3; y <= 4; y++) {
      const hole = z >= -2 && z <= 1 && y >= -2 && y <= 2;
      const corner = (z === -3 || z === 2) && (y === -3 || y === 4);
      if (hole || corner) continue;
      for (let x = -1; x <= 0; x++) v.set(x, y, z, x === -1 ? C.hdlL : (y + z + 40) % 3 === 0 ? C.hdlD : C.hdl);
    }
  for (let z = 3; z <= 15; z++) {
    const top = Math.round(3 - (z - 3) * 0.25);
    for (let y = -4; y <= top; y++) v.set(0, y, z, y === top || y === -4 ? C.ironD : y === top - 1 ? C.ironL : C.iron);
    if (z & 1) v.set(0, -5, z, C.ironDD);
  }
  v.set(1, 0, 3, C.brass); v.set(1, 2, 3, C.brass); v.set(-2, 0, 3, C.brassD); v.set(-2, 2, 3, C.brassD);
  return v;
}
const SAW_TOOTH = (s) => new THREE.Vector3(0.5 * FV, -5 * FV, (9 + s) * FV);
function horseModel() {
  // little sawhorse (fine voxels, origin on the ground), beam along X
  const v = new VoxelModel();
  for (let x = -9; x <= 8; x++) for (let y = 12; y <= 13; y++) for (let z = -1; z <= 0; z++) v.set(x, y, z, y === 13 ? C.pineL : pineCol(x, y, z));
  for (const ex of [-7, 6])
    for (const sz of [-1, 1])
      for (let y = 0; y <= 11; y++) {
        const z = Math.round((sz > 0 ? 0 : -1) + sz * (11 - y) * 0.4);
        const x = ex + Math.round((ex < 0 ? -1 : 1) * (11 - y) * 0.1);
        v.set(x, y, z, y === 0 ? C.pineDD : C.pineD); v.set(x + 1, y, z, y === 0 ? C.pineDD : pineCol(x + 1, y, z));
      }
  for (const ex of [-7, 6]) for (let z = -3; z <= 2; z++) v.set(ex, 6, z, C.pineD);
  return v;
}
function plankModel(x0, x1) {
  const v = new VoxelModel();
  for (let x = x0; x <= x1; x++)
    for (let y = 0; y <= 1; y++)
      for (let z = -3; z <= 2; z++) {
        let c = pineCol(x, y, z);
        if (x === x0 || x === x1) c = (y + z) & 1 ? C.ring : C.ringD;
        v.set(x, y, z, c);
      }
  return v;
}
function plankMain() {
  const v = plankModel(-9, 12);
  for (const [x, z] of [[5, -1], [6, -1], [5, 0]]) v.set(x, 1, z, C.knot);
  for (let z = -3; z <= 2; z++) v.set(-8, 1, z, (z & 1) ? C.mark : C.pineD); // pencilled cut line
  return v;
}
function plankEnd() {
  const v = plankModel(-9, -1); // fine voxels left of the cut; pivot = the cut edge
  v.set(-5, 1, 0, C.knot);
  return v;
}
function offcutModel() {
  // little offcut to inspect: pine block with a knot and an end-grain face
  const v = new VoxelModel();
  for (let x = -5; x <= 4; x++)
    for (let y = -1; y <= 0; y++)
      for (let z = -2; z <= 2; z++) v.set(x, y, z, x === -5 || x === 4 ? ((y + z) & 1 ? C.ring : C.ringD) : pineCol(x, y, z));
  v.set(1, 0, 1, C.knot); v.set(2, 0, 1, C.knot); v.set(-2, 0, -1, C.pineDD);
  return v;
}
function nailModel() {
  const v = new VoxelModel();
  for (let y = -6; y <= -1; y++) v.set(0, y, 0, C.ironD);
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) v.set(x, 0, z, x === -1 && z === -1 ? C.ironL : C.iron);
  return v;
}
function logModel() {
  // a stout upright log to drum on (fine voxels): ridged bark, sawn top with rings, moss, a shelf fungus, a sprig
  const v = new VoxelModel();
  const H = 38;
  for (let y = 0; y <= H; y++)
    for (let x = -LOG_R - 1; x <= LOG_R; x++)
      for (let z = -LOG_R - 1; z <= LOG_R; z++) {
        const r = Math.hypot(x + 0.5, z + 0.5), R = LOG_R + (y < 3 ? 1.2 - y * 0.35 : 0);
        if (r > R) continue;
        if (y === H) { v.set(x, y, z, r < 1.2 ? C.ringD : Math.round(r) % 2 ? C.ring : C.ringD); continue; }
        if (r < R - 1.3) continue; // hollow inside
        const a = Math.atan2(z + 0.5, x + 0.5);
        const ridge = Math.round(a * 3.2 + sin(y * 0.3) * 0.6) & 1;
        let c = ridge ? C.barkD : tone(x, y, z, C.bark, C.barkD, C.barkL, 0.12, 0.14);
        if (y < 6 && z < 0 && (x + y) % 3) c = y < 3 ? C.moss : C.mossL;
        v.set(x, y, z, c);
      }
  // shelf fungus on the left, a leafy sprig on the right, bark ring at the top
  for (let x = 4; x <= 7; x++) for (let z = -2; z <= 2; z++) if (Math.hypot(x - 4, z) < 3) v.set(x, 22, z, x === 7 || abs(z) === 2 ? C.shroomL : C.shroom);
  for (let x = 4; x <= 6; x++) for (let z = -1; z <= 1; z++) v.set(x, 26, z, x === 6 ? C.shroomL : C.shroom);
  for (const [x, y, z, c] of [[-7, 29, 0, C.barkD], [-8, 30, 0, C.barkD], [-9, 31, 0, C.leaf], [-9, 32, 1, C.leafL], [-10, 31, -1, C.leaf], [-8, 32, 0, C.leafL]]) v.set(x, y, z, c);
  return v;
}
function holeModel() {
  // freshly drilled hole: dark middle, pale chewed rim (faces +Z)
  const v = new VoxelModel();
  for (let x = -3; x <= 2; x++) for (let y = -3; y <= 2; y++) {
    const r = Math.hypot(x + 0.5, y + 0.5);
    if (r > 3.1) continue;
    v.set(x, y, 0, r < 1.5 ? C.holeD : r < 2.3 ? C.hole : C.ring);
  }
  return v;
}

const cache = geoCache(() => {
  const G = {
    pelvis: buildGeo(pelvisModel()), torso: buildGeo(torsoModel()), head: buildGeo(headModel()),
    earL: buildGeo(tuftModel()), earR: buildGeo(mirrorX(tuftModel())),
    crest: buildGeo(crestModel(false), [0, 0, 0], FV), crest2: buildGeo(crestModel(true), [0, 0, 0], FV),
    beak: buildGeo(beakModel(), [0, 0, 0], FV), beakLo: buildGeo(beakLoModel(), [0, 0, 0], FV), glasses: buildGeo(glassesModel(), [0, 0, 0.5], FV),
    upper: buildGeo(upperModel(), [0.5, 0, 0.5]), fore: buildGeo(foreModel(), [0.5, 0, 0.5]),
    thigh: buildGeo(thighModel(), [0, 0, 0]), shin: buildGeo(shinModel(), [0, 0, 0]), tail: buildGeo(tailModel(), [0, 0, 0]),
    pencil: buildGeo(pencilModel(), [0, 0, 0.5], FV), hammer: buildGeo(hammerModel(), [0, 0, 0], FV),
    tape: buildGeo(tapeModel(), [0, 0, 0], FV), hook: buildGeo(hookModel(), [0, 0, 0], FV), saw: buildGeo(sawModel(), [0, 0, 0], FV),
    horse: buildGeo(horseModel(), [0, 0, 0.5], FV), plank: buildGeo(plankMain(), [0, 0, 0.5], FV), plankEnd: buildGeo(plankEnd(), [0, 0, 0.5], FV),
    offcut: buildGeo(offcutModel(), [0, 0, 0], FV), nail: buildGeo(nailModel(), [0.5, 0, 0.5], FV),
    log: buildGeo(logModel(), [0, 0, 0], FV), hole: buildGeo(holeModel(), [0, 0, 0], FV),
  };
  for (const k of HAND_KINDS) {
    G['hand_' + k + 'L'] = buildGeo(handModel(k, 1, C.inkL, C.inkD), [0, 0, 0], FV);
    G['hand_' + k + 'R'] = buildGeo(handModel(k, -1, C.inkL, C.inkD), [0, 0, 0], FV);
  }
  return G;
});

// ------------------------------------------------------------------ sprites
const CHIP_PAL = { k: '#5a3418', l: '#fbe0aa', d: '#e0b06a', D: '#b07a3a' };
const CHIP_ROWS = ['.kk..', 'klkk.', 'kldDk', '.kdDk', '..kk.'];
const CHIP2_ROWS = ['kkk.', 'klDk', '.kdk', '..k.'];
const DUST_PAL = { k: '#c8a066', w: '#fff4dc', W: '#f2d8a8' };
const TOK_PAL = { k: '#4a2a10', w: '#fff4d0', s: '#e8a850' };
/** Tiny comic word in the fxAtlas style: light top rows, warm shade, thick ink outline. */
function wordRows(text) {
  const F = { T: ['###', '.#.', '.#.', '.#.', '.#.'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], '!': ['#', '#', '#', '.', '#'] };
  const gl = [...text].map((c) => F[c]);
  const w = gl.reduce((s, g) => s + g[0].length + 1, -1) + 2, h = 7;
  const grid = [...Array(h)].map(() => Array(w).fill('.'));
  let x0 = 1;
  for (const g of gl) {
    for (let y = 0; y < 5; y++) for (let x = 0; x < g[0].length; x++) if (g[y][x] === '#') grid[y + 1][x0 + x] = y < 2 ? 'w' : 's';
    x0 += g[0].length + 1;
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (grid[y][x] !== '.') continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const c = grid[y + dy]?.[x + dx]; if (c === 'w' || c === 's') grid[y][x] = 'K'; }
    }
  return grid.map((r) => r.join('').replace(/K/g, 'k'));
}
const TOK_ROWS = wordRows('TOK');
const TOK2_ROWS = wordRows('TOK!');

/** Tape blade texture: yellow with a major tick every 0.1 units and a minor one between. */
function bladeTexture() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 4;
  const x = c.getContext('2d');
  x.fillStyle = '#ffd84a'; x.fillRect(0, 0, 16, 4);
  x.fillStyle = '#d8a018'; x.fillRect(0, 3, 16, 1);
  x.fillStyle = '#2a2028'; x.fillRect(0, 0, 1, 3); x.fillRect(8, 0, 1, 2); x.fillRect(4, 0, 1, 1); x.fillRect(12, 0, 1, 1);
  x.fillStyle = '#d8403a'; x.fillRect(2, 1, 2, 1);
  const t = pixTex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
let bladeGeo = null;
const BLADE_UNIT = 0.1; // world units per texture repeat

// ------------------------------------------------------------------ face
const FACE = {
  w: 48, h: 20, eyes: [{ x: 12.5, y: 9.5 }, { x: 35.5, y: 9.5 }], rx: 3.9, ry: 4.5, style: 'bead', lash: false,
  blush: [{ x: 5, y: 16 }, { x: 43, y: 16 }], blushW: 3,
  mw: 8, mh: 4, mx: 4, my: 1, mstyle: 'owl', mHalf: 2,
  pal: { i: '#3a2014', I: '#8a5432', b: '#2e2a36' },
};
const EXPRS = {
  ...BASE_EXPRS,
  neutral: { eyes: 'open', brows: null, mouth: 'smile', blush: 1, tear: 0 },
  happy: { eyes: 'happy', brows: null, mouth: 'grin', blush: 2, tear: 0 },
  talk: { eyes: 'open', brows: 'up', mouth: 'open', blush: 1, tear: 0 },
  surprised: { eyes: 'wide', brows: 'raised', mouth: 'o', blush: 1, tear: 0 },
  sleepy: { eyes: 'sleepy', brows: null, mouth: 'smile', blush: 1, tear: 0 },
  smug: { eyes: 'half', brows: 'flat', mouth: 'smile', blush: 1, tear: 0 },
  focused: { eyes: 'focused', brows: 'angry', mouth: 'flat', blush: 0, tear: 0 },
  squint: { eyes: 'sleepy', brows: 'angry', mouth: 'flat', blush: 0, tear: 0 },
  laugh: { eyes: 'happy', brows: 'up', mouth: 'laugh', blush: 2, tear: 0 },
  proud: { eyes: 'shiny', brows: 'up', mouth: 'grin', blush: 2, tear: 0 },
};
const BEAK_OPEN = { open: 0.5, laugh: 0.62, yell: 0.66, grin: 0.24, o: 0.36, sip: 0.12, chew2: 0.18, frown: 0.04, cheeky: 0.08, blep: 0.14 };
/** Crest mood per eye shape (radians-ish): up when surprised / delighted, flat when concentrating, droopy when sleepy. */
const CREST_MOOD = { wide: 0.85, happy: 0.22, shiny: 0.4, heart: 0.35, shut: 0.25, half: 0.1, focused: -0.3, sleepy: -0.45, sleep: -0.55, closed: -0.08 };

// ------------------------------------------------------------------ rig
const _w = new THREE.Vector3(), _w2 = new THREE.Vector3(), _w3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _sv = new THREE.Vector3();
const _nail = new THREE.Vector3(), _hitv = new THREE.Vector3();
export class WoodpeckerCarpenter extends BipedRig {
  constructor({ shadows = true } = {}) {
    super('WoodpeckerCarpenter', { shadows });
    const G = (this._G = cache.get());
    this._geoCache = cache;
    this._buildBiped(G, D);
    this.tail.children[0].rotation.x = 0.8; // stiff prop tail, angled back
    // springy two-part crest
    this.joint('crest', this.head, 0, 8.9, 0.2); this.mesh(G.crest, this.crest);
    this.joint('crest2', this.crest, 0, CREST_SPLIT[0] * FV / VS, CREST_SPLIT[1] * FV / VS); this.mesh(G.crest2, this.crest2);
    this._crestS = new Spring(90, 6.5);
    // beak: upper fixed, lower hinged
    this.mesh(G.beak, this.head, { y: BEAK[0] * VS, z: BEAK[1] * VS });
    this.beakLo = new THREE.Group(); this.beakLo.position.set(0, BEAK[0] * VS, BEAK[1] * VS); this.head.add(this.beakLo);
    this.mesh(G.beakLo, this.beakLo);
    this._beak = 0;
    // face + round spectacles (a joint: they slide up and down the beak)
    this.face = new NpcFace(FACE);
    this.facePlane(this.face.eyes.tex, this.head, FACE.w, FACE.h, 0, EYE_Y - 0.25, 5.1);
    this.joint('glasses', this.head, 0, EYE_Y, 5.25);
    this.mesh(G.glasses, this.glasses, { shadow: false });
    // carpenter's pencil: behind the right ear-feathers, or in the right hand
    this.pencilEar = this.mesh(G.pencil, this.earR, { x: -0.6 * VS, y: 0.9 * VS, z: 0.2 * VS, shadow: false });
    this.pencilEar.rotation.set(1.95, 0.25, 0.1);
    this.pencil = this.mesh(G.pencil, this.gripR);
    // tiny hammer: hanging in the hip loop, or in the right hand
    this.hammerTuck = this.mesh(G.hammer, this.hips, { x: -6.8 * VS, y: -2.9 * VS, z: -0.2 * VS });
    this.hammerTuck.rotation.set(0.45, 1.5, -0.3);
    this.hammer = this.mesh(G.hammer, this.gripR);
    // tape measure: clipped to the left hip, or in the left hand with the blade pulled out to the hook
    this.tapeTuck = this.mesh(G.tape, this.hips, { x: 6.0 * VS, y: -0.9 * VS, z: 1.0 * VS });
    this.tapeTuck.rotation.set(0, 0.25, 0);
    this.tape = this.mesh(G.tape, this.gripL);
    this.hook = this.mesh(G.hook, this.root, { shadow: false });
    if (!bladeGeo) {
      bladeGeo = new THREE.PlaneGeometry(1, 0.032);
      bladeGeo.rotateY(-PI / 2); bladeGeo.translate(0, 0, 0.5);
    }
    this._bladeTex = bladeTexture();
    const bm = new THREE.MeshLambertMaterial({ map: this._bladeTex, side: THREE.DoubleSide });
    this._owned.push(this._bladeTex, bm);
    this.blade = new THREE.Mesh(bladeGeo, bm);
    this.blade.visible = false;
    this.root.add(this.blade);
    // saw (right hand) + offcut (left hand)
    this.saw = this.mesh(G.saw, this.gripR);
    this.offcut = this.mesh(G.offcut, this.gripL);
    // work props in root space: sawhorse + plank (+ the end that gets sawn off, a nail), a log to peck
    this.horse = new THREE.Group(); this.root.add(this.horse);
    this.mesh(G.horse, this.horse);
    this.mesh(G.plank, this.horse, { y: (PLANK_TOP - 2) * FV });
    this.plankEnd = this.mesh(G.plankEnd, this.horse, { x: CUT_X * FV, y: (PLANK_TOP - 2) * FV });
    this.nail = this.mesh(G.nail, this.horse, { x: NAIL_X * FV, y: PLANK_TOP * FV, z: -0.5 * FV });
    this.log = new THREE.Group(); this.log.position.set(LOG[0], 0, LOG[1]); this.root.add(this.log);
    this.logMesh = this.mesh(G.log, this.log);
    this.logMesh.rotation.y = 0.5;
    this.hole = this.mesh(G.hole, this.log, { shadow: false });
    this.hole.rotation.y = LOG_TURN + PI; // faces Chip
    this._holeY = 0.84;
    this._hit = new THREE.Vector3();
    // sprites
    const spr = (m, n, sc = 0.06) => [...Array(n)].map(() => { const s = new THREE.Sprite(m); s.visible = false; s.scale.setScalar(sc); this.root.add(s); return s; });
    const cm = spriteMatPal(CHIP_ROWS, CHIP_PAL), cm2 = spriteMatPal(CHIP2_ROWS, CHIP_PAL);
    this.chips = [...spr(cm, 4), ...spr(cm2, 4)];
    this.dust = spr(spriteMatPal(FLOUR_ROWS, DUST_PAL), 6);
    this.clods = spr(spriteMatPal(DIRT_ROWS, DIRT_PAL), 4);
    this.tok = spr(spriteMatPal(TOK_ROWS, TOK_PAL), 2);
    this.tokBig = spr(spriteMatPal(TOK2_ROWS, TOK_PAL), 1)[0];
    this.stars = [0, 1, 2, 3].map(() => this.sprite(SPARK_ROWS, 0.07, this.root));
    this.notes = [0, 1].map(() => this.sprite(NOTE_ROWS, 0.07, this.root));
    this.sparks = [0, 1, 2].map(() => this.sprite(SPARK_ROWS, 0.07, this.root));
    this.hearts = [0, 1].map(() => this.sprite(HEART_ROWS, 0.07, this.root));
    this.bang = this.sprite(BANG_ROWS, 0.09, this.root);
    for (const n of ['notes', 'spark', 'hearts', 'bang', 'chips', 'dust', 'blow', 'stars', 'board', 'cut', 'drop', 'nail', 'log', 'hole', 'peck', 'tapeOut', 'sawLock', 'hamLock']) this.scalar(n, 0);
    this.scalar('tokU', -1); this.scalar('tokN', 0); this.scalar('tokBig', 0);
    this.scalar('hamA', 0.6); this.scalar('hry', 0); this.scalar('sawB', 0.45); this.scalar('sawS', 0); this.scalar('offR', 0);
    this.scalar('penX', 0); this.scalar('penY', 1); this.scalar('penZ', 0.3);
    // springs: the crest whips on every peck / hop, the tail and specs follow along
    this.jiggle('crest', 'rx', { k: 120, c: 6, az: 0.55, ay: 0.4, max: 0.7, probe: 'head' });
    this.jiggle('crest', 'rz', { k: 120, c: 6, ax: -0.5, yaw: 0.03, max: 0.5, probe: 'head' });
    this.jiggle('crest2', 'rx', { k: 85, c: 4.5, az: 0.5, ay: 0.45, max: 0.8, probe: 'crest' });
    this.jiggle('crest2', 'rz', { k: 85, c: 4.5, ax: -0.5, max: 0.6, probe: 'crest' });
    this.jiggle('chest', 's', { k: 220, c: 9, ay: 0.05, max: 0.07, probe: 'hips' });
    this.jiggle('head', 's', { k: 260, c: 10, ay: 0.04, max: 0.06, probe: 'chest' });
    this.jiggle('tail', 'rx', { k: 150, c: 7, az: 0.3, ay: 0.3, max: 0.4, probe: 'hips' });
    this.jiggle('tail', 'ry', { k: 140, c: 7, ax: 0.4, yaw: 0.02, max: 0.4, probe: 'hips' });
    this.jiggle('glasses', 'y', { k: 300, c: 12, ay: 0.08, max: 0.4, probe: 'head' });
    this._init(ANIMS, EXPRS, 'idle');
  }

  /** Beak tip in root space (world units). */
  beakTip(out = new THREE.Vector3()) {
    this.head.updateWorldMatrix(true, false);
    out.set(0, (BEAK[0] + 0.1) * VS - this._beak * 0.02, BEAK[1] * VS + BEAK_L * FV);
    this.head.localToWorld(out);
    return this.root.worldToLocal(out);
  }

  /** Mover-space point (unrotated layout) -> root space, following his turn. */
  _mv(v) {
    const a = this.mover.rotation.y, c = cos(a), s = sin(a), x = v.x, z = v.z;
    return v.set(this.mover.position.x + x * c + z * s, v.y, this.mover.position.z - x * s + z * c);
  }

  /** Slide a hand-held prop so its local point `lp` lands on root-space `target` (blended by w, capped). */
  _lock(mesh, lp, target, w) {
    mesh.position.set(0, 0, 0);
    mesh.updateWorldMatrix(true, false);
    _w.copy(lp).applyMatrix4(mesh.matrixWorld);
    _w2.copy(target); this.root.localToWorld(_w2);
    _w2.sub(_w).multiplyScalar(clamp(w, 0, 1));
    if (_w2.length() > 0.09) _w2.setLength(0.09);
    mesh.parent.getWorldQuaternion(_q).invert(); _w2.applyQuaternion(_q);
    mesh.parent.getWorldScale(_sv); _w2.divide(_sv);
    mesh.position.copy(_w2);
  }

  _post(p, dt) {
    this._setHands(p);
    const k = this.k, tz = this.time;
    // --- pencil
    const pen = !!p.vis.pencil;
    this.pencil.visible = pen; this.pencilEar.visible = !pen;
    if (pen) orientIn(this.pencil, this.chest, [k.penX, k.penY, k.penZ], [1, 0, 0], 1);
    // --- hammer (swings in the mover's XY plane: a = 0 handle points across to the left, face down)
    const ham = !!p.vis.hammer;
    this.hammer.visible = ham; this.hammerTuck.visible = !ham;
    const nailTop = this._mv(horsePt(NAIL_X * FV, (PLANK_TOP + (1 - k.nail) * 5 + 1) * FV, -0.5 * FV, _nail, k.hry));
    if (ham) {
      const a = k.hamA;
      orientIn(this.hammer, this.mover, [cos(a), sin(a), 0.22], [sin(a), -cos(a), 0], 1);
      if (k.hamLock > 0.01) this._lock(this.hammer, HAMMER_FACE, nailTop, k.hamLock);
      else this.hammer.position.set(0, 0, 0);
    }
    // --- saw (blade tilt b in the mover's YZ plane, teeth locked into the cut while sawing)
    this.saw.visible = !!p.vis.saw;
    if (this.saw.visible) {
      const b = k.sawB;
      const hs = sin(k.hry), hc = cos(k.hry);
      orientIn(this.saw, this.mover, [sin(b) * hs, cos(b), sin(b) * hc], [cos(b) * hs, -sin(b), cos(b) * hc], 1);
      if (k.sawLock > 0.01) this._lock(this.saw, SAW_TOOTH(k.sawS), this._mv(horsePt((CUT_X + 0.5) * FV, (PLANK_TOP - k.cut * 1.6) * FV, -0.5 * FV, _w3, k.hry)), k.sawLock);
      else this.saw.position.set(0, 0, 0);
    }
    // --- offcut
    this.offcut.visible = !!p.vis.offcut;
    if (this.offcut.visible) { const r = k.offR; orientIn(this.offcut, this.chest, [0, cos(r), sin(r)], [1, 0, 0.2], 1); }
    // --- tape measure + blade
    const tp = !!p.vis.tape;
    this.tape.visible = tp; this.tapeTuck.visible = !tp;
    this.blade.visible = false; this.hook.visible = false;
    if (tp) {
      orientIn(this.tape, this.mover, [0, 1, 0], [-0.95, 0, 0.3], 1);
      this.tape.updateWorldMatrix(true, false);
      _w.copy(TAPE_EXIT).applyMatrix4(this.tape.matrixWorld); // exit slot (world)
      this.gripR.updateWorldMatrix(true, false);
      _w2.setFromMatrixPosition(this.gripR.matrixWorld);
      _w2.lerpVectors(_w, _w2, clamp(k.tapeOut, 0, 1)); // hook (world)
      const d = _w.distanceTo(_w2);
      if (d > 0.012) {
        this.root.worldToLocal(this.blade.position.copy(_w));
        this.blade.lookAt(_w2);
        this.blade.scale.set(1, 1, d);
        this._bladeTex.repeat.x = d / BLADE_UNIT;
        this.blade.visible = true;
        this.hook.visible = true;
        this.root.worldToLocal(this.hook.position.copy(_w2));
        _w3.copy(_w2).sub(_w).add(_w2);
        this.hook.lookAt(_w3);
      }
    }
    // --- sawhorse + plank + nail
    const bd = k.board;
    this.horse.visible = bd > 0.02;
    if (this.horse.visible) {
      this._mv(this.horse.position.set(HORSE[0], 0, HORSE[1]));
      this.horse.rotation.y = this.mover.rotation.y + k.hry;
      this.horse.scale.setScalar(min(bd, 1.15));
      this.nail.visible = k.nail > -0.5;
      this.nail.position.y = (PLANK_TOP + (1 - clamp(k.nail, 0, 1)) * 5) * FV;
      // the sawn-off end tips over the edge, drops and bounces
      const dr = k.drop;
      const fall = K(dr, [[0, 0], [0.35, 0.1, 'in'], [0.75, 1, 'in'], [0.86, 0.94, 'out'], [1, 1, 'in']]);
      this.plankEnd.rotation.z = K(dr, [[0, 0], [0.35, 0.9, 'in'], [0.75, 0.2, 'io'], [0.86, 0.32, 'out'], [1, 0.18]]);
      this.plankEnd.position.set((CUT_X - dr * 4) * FV, (PLANK_TOP - 2) * FV * (1 - fall) + fall * 0.004, 0);
    }
    // --- the log (rises out of the ground) + the hole he drills
    const lg = k.log;
    this.log.visible = lg > 0.02;
    if (this.log.visible) {
      this.log.scale.set(min(1, lg * 1.2), lg, min(1, lg * 1.2));
      if (k.peck > 0.85) { this.beakTip(this._hit); this._holeY = this._hit.y / max(0.2, lg); }
      const hr = (LOG_R + 0.6) * FV;
      this.hole.position.set(-sin(LOG_TURN) * hr, this._holeY, -cos(LOG_TURN) * hr);
      this.hole.scale.setScalar(clamp(k.hole, 0, 1) * 1.1);
      this.hole.visible = k.hole > 0.03;
    }
    // --- particles
    // wood chips spray out of the hole while pecking
    const hx = LOG[0] - sin(LOG_TURN) * (LOG_R * FV), hz = LOG[1] - cos(LOG_TURN) * (LOG_R * FV), hy = this._holeY;
    this.chips.forEach((s, i) => {
      const u = (tz * 2.6 + i / 8) % 1;
      s.visible = k.chips > 0.5 && this.log.visible;
      if (!s.visible) return;
      const a = LOG_TURN + PI + (i - 3.5) * 0.32, sp = 0.18 + (i % 3) * 0.06;
      s.position.set(hx + sin(a) * sp * u, hy + 0.12 * u - 0.9 * u * u, hz + cos(a) * sp * u);
      s.scale.setScalar((i < 4 ? 0.075 : 0.06) * (u < 0.85 ? 1 : (1 - u) / 0.15));
    });
    // dirt clods when the log pushes up out of the ground
    this.clods.forEach((s, i) => {
      const u = clamp(lg * 1.6 - 0.1, 0, 1);
      s.visible = lg > 0.05 && lg < 0.95 && k.board < 0.01;
      const a = i * (TAU / 4) + 0.6;
      s.position.set(LOG[0] + cos(a) * (0.14 + u * 0.16), 0.04 + sin(u * PI) * 0.18, LOG[1] + sin(a) * (0.1 + u * 0.12));
      s.scale.setScalar(0.05 * sin(u * PI) + 0.01);
    });
    // sawdust: falls out of the cut while sawing, or a puff when he blows on it
    this._mv(horsePt(CUT_X * FV, 0, 0, _hp, k.hry));
    const cx = _hp.x, cz = _hp.z;
    this.dust.forEach((s, i) => {
      if (k.blow > 0.02 && k.blow < 0.98) {
        const u = k.blow, a = (i - 2.5) * 0.35;
        s.visible = true;
        s.position.set(cx - 0.04 - u * 0.3 + sin(a) * 0.05 * u, PLANK_TOP * FV + 0.02 + u * 0.12 + cos(a * 3) * 0.04 * u, cz + a * 0.12 * u);
        s.scale.setScalar(0.06 * sin(u * PI) + 0.02);
        return;
      }
      const u = (tz * 1.4 + i / 6) % 1;
      s.visible = k.dust > 0.5 && this.horse.visible;
      if (!s.visible) return;
      s.position.set(cx + (i - 2.5) * 0.012 + sin(u * 5 + i) * 0.02, PLANK_TOP * FV * (1 - u) - 0.02, cz + sin(i * 2.7) * 0.05 + u * 0.03);
      s.scale.setScalar(0.045 * (u < 0.8 ? min(1, u * 5) : (1 - u) / 0.2));
    });
    // "TOK" words pop at the impact (alternating sides), a bigger "TOK!" + stars for the big hammer blow
    const hit = k.board > 0.5 ? nailTop : _hitv.set(hx, hy, hz);
    const tu = k.tokU;
    this.tok.forEach((s, i) => {
      s.visible = tu >= 0 && tu < 1 && (Math.round(k.tokN) & 1) === i;
      if (!s.visible) return;
      const sd = i ? 1 : -1;
      s.position.set(hit.x + sd * (0.2 + tu * 0.05), hit.y + 0.1 + tu * 0.1, hit.z + 0.05);
      const sc = K(tu, [[0, 0.4], [0.15, 1.15, 'out'], [0.3, 1], [0.8, 1], [1, 0.6]]);
      s.scale.set(0.2 * sc, 0.108 * sc, 1);
    });
    const tb = k.tokBig;
    this.tokBig.visible = tb > 0.01 && tb < 0.99;
    if (this.tokBig.visible) {
      const sc = K(tb, [[0, 0.3], [0.12, 1.25, 'out'], [0.25, 1], [0.85, 1], [1, 0.5]]);
      this.tokBig.position.set(hit.x + 0.34, hit.y + 0.2 + tb * 0.1, hit.z + 0.05);
      this.tokBig.scale.set(0.3 * sc, 0.14 * sc, 1);
    }
    const st = k.stars;
    this.stars.forEach((s, i) => {
      s.visible = st > 0.02 && st < 0.98;
      const a = i * (TAU / 4) + 0.4;
      s.position.set(hit.x + cos(a) * (0.04 + st * 0.18), hit.y + 0.03 + abs(sin(a)) * (0.03 + st * 0.14), hit.z + sin(a) * 0.05);
      s.scale.setScalar(0.065 * sin(st * PI));
    });
    // face sprites
    this.head.updateWorldMatrix(true, false);
    _w.set(0, 5 * VS, 4 * VS); this.head.localToWorld(_w); this.root.worldToLocal(_w);
    this.notes.forEach((s, i) => {
      const u = (tz * 0.5 + i * 0.5) % 1;
      s.visible = k.notes > 0.5;
      s.position.set(_w.x + 0.14 + u * 0.12 + sin(u * 8 + i) * 0.03, _w.y + 0.08 + u * 0.3, _w.z);
      s.scale.setScalar(0.065 * (u < 0.8 ? 1 : (1 - u) / 0.2) * min(1, u * 6));
    });
    const sp = k.spark;
    this.sparks.forEach((s, i) => {
      s.visible = sp > 0.05;
      const a = i * 2.1 + tz * 1.5;
      s.position.set(_w.x + cos(a) * 0.34, _w.y + 0.2 + sin(a * 1.3) * 0.12, _w.z + sin(a) * 0.1);
      s.scale.setScalar(0.07 * sin(clamp(sp, 0, 1) * PI) * (0.7 + 0.3 * sin(tz * 9 + i)));
    });
    this.hearts.forEach((s, i) => {
      const u = (tz * 0.6 + i * 0.5) % 1;
      s.visible = k.hearts > 0.5;
      s.position.set(_w.x + (i ? 0.17 : -0.15) + sin(u * 6 + i) * 0.03, _w.y + 0.26 + u * 0.28, _w.z - 0.05);
      s.scale.setScalar(0.06 * (u < 0.8 ? 1 : (1 - u) / 0.2) * min(1, u * 5));
    });
    this.bang.visible = k.bang > 0.05;
    this.bang.position.set(_w.x + 0.22, _w.y + 0.36 + k.bang * 0.05, _w.z);
    this.bang.scale.setScalar(0.1 * clamp(k.bang * 1.4, 0, 1));
  }

  _updateFace(dt, f, def) {
    super._updateFace(dt, f, def);
    const st = this._fst;
    const tgt = BEAK_OPEN[st.mouth] || 0;
    this._beak += (tgt - this._beak) * Math.min(1, dt * 30);
    this.beakLo.rotation.x = this._beak;
    // the crest reads the mood and springs into each new one
    const mood = (CREST_MOOD[st.eyes] ?? 0) + (st.brows === 'raised' ? 0.25 : 0);
    const c = this._crestS.step(mood, 0, dt);
    this.crest.rotation.x += c * 0.5;
    this.crest2.rotation.x += c * 0.45;
  }
}

// ------------------------------------------------------------------ pose helpers
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };
const ff = (t, d) => (t > d ? t % d : t);
const _c = [0, 0];

/** Upright little woodpecker: a slight forward lean, stiff tail, crest ticking over. */
function stand(p, rig, t, amt = 1, crouch = 0.3) {
  rig.life(t, p, amt);
  rig.stance(p, crouch, 0.7, 0.4, 0.12);
  p.chest.rx += 0.05; p.head.rx -= 0.06;
  p.crest.rx += sin(t * 1.3) * 0.04 * amt; p.crest2.rx += sin(t * 1.9 + 0.7) * 0.06 * amt;
}
/** Right wing resting on the hammer in the hip loop. */
function onHammer(p, rig, w = 1) {
  rig.reach(p, -1, 6.6, 0.6, 1.2, [0.9, 0.2, -1], w);
  if (w > 0.5) { p.wristR.rx = 0.3; p.wristR.rz = -0.3; p.handR = 'relax'; }
}
/** Left thumb hooked in the apron belt. */
function onBelt(p, rig, w = 1) {
  rig.reach(p, 1, 5.4, 0.4, 3.2, [0.9, 0.2, -1], w);
  if (w > 0.5) { p.wristL.rx = 0.5; p.wristL.rz = 0.4; p.handL = 'fist'; }
}
/** Mover-space point (world units) -> chest-space reach target. */
function reachMv(p, rig, side, x, y, z, pole, w = 1) {
  const c = rig.toChest(p, y / VS, z / VS, _c);
  rig.reach(p, side, side * x / VS, c[0], c[1], pole, w);
}
/** Pecking thrust: 0..1 at time t for a list of strike times; returns [amount, last hit index, time since that hit]. */
const PK = 0.075;
function peckAt(t, list, out) {
  let a = 0, last = -1, since = 99;
  for (let i = 0; i < list.length; i++) {
    const u = (t - list[i]) / PK;
    if (u >= 0 && u < 1) a = max(a, u < 0.35 ? smooth(u / 0.35) : 1 - smooth((u - 0.35) / 0.65));
    const h = list[i] + PK * 0.35;
    if (t >= h) { last = i; since = t - h; }
  }
  out[0] = a; out[1] = last; out[2] = since;
  return out;
}
const _pk = [0, 0, 0];

// ------------------------------------------------------------------ animations
def('idle', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    stand(p, rig, t);
    const sway = sin(t * 0.8);
    p.hips.x = sway * 0.3; p.hips.rz = sway * 0.025; p.chest.rz = -sway * 0.035;
    onHammer(p, rig);
    onBelt(p, rig);
    const T = t % 12;
    // bird head: quick little jerks between still poses
    p.head.ry += K(T, [[0, 0], [0.9, 0], [0.98, 0.42, 'out'], [1.9, 0.42], [1.98, -0.32, 'out'], [2.9, -0.32], [2.98, 0, 'out']]);
    // cocks his head, listening ("woodworm?")
    const lis = win(T, 3.4, 4.9, 0.08, 0.12);
    p.head.rz += lis * 0.38; p.head.rx -= lis * 0.06;
    p.crest.rx += lis * 0.3;
    f.look = [p.head.ry * 1.6 + lis * 0.6, -lis * 0.8];
    if (lis > 0.5) f.brows = 'up';
    // specs creep down his beak... and get pushed back up with one fingertip
    p.glasses.y += K(T, [[0, 0.1], [6.5, -0.45, 'in'], [6.75, 0.25, 'out'], [7.0, 0.1], [12, 0.1]]);
    const push = win(T, 6.0, 7.3, 0.3, 0.35);
    if (push > 0) {
      const g = rig.headPoint(p, EYE_Y + 0.6, 6.2, _c);
      rig.reach(p, -1, lerp(6.6, 1.2, push), lerp(0.6, g[0] - 2.6, push), lerp(1.2, g[1] + 0.8, push), [1, -0.7, -0.2], push);
      if (push > 0.5) { p.handR = 'point'; p.wristR.rx = -0.2; }
      p.head.rx -= pulse(T, 6.4, 0.5) * 0.08;
    }
    // hums a tune, crest bobbing along
    const hum = win(T, 8.4, 10.8, 0.25, 0.3);
    p.k.notes = hum > 0.5 ? 1 : 0;
    p.head.rz += hum * sin(t * 4.4) * 0.08; p.hips.x += hum * sin(t * 4.4) * 0.25;
    p.crest.rx += hum * abs(sin(t * 4.4)) * 0.2;
    if (hum > 0.3) { f.eyes = 'happy'; f.mouth = 'chew1'; }
  },
});

def('walk', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    const P = 0.6, ph = (t / P) * TAU, sn = sin(ph), cs = cos(ph);
    rig.walk(p, ph, 0.5);
    p.hips.y = -0.5 + abs(cs) * 0.5;
    p.hips.rz = cs * 0.08; p.chest.rz = -cs * 0.04; p.hips.ry = -sn * 0.07;
    p.chest.rx = 0.1;
    // pigeon-style head bob: thrust forward on each step, hold, glide back
    const hb = ((ph / PI) % 1 + 1) % 1;
    p.head.z = K(hb, [[0, -0.5], [0.22, 0.8, 'out'], [0.55, 0.7], [1, -0.5, 'io']]);
    p.head.rx = -0.08; p.head.rz = cs * 0.04;
    p.armL.rx = sn * 0.4; p.armR.rx = -sn * 0.4; p.armL.rz = 0.3; p.armR.rz = -0.3;
    p.foreL.rx = p.foreR.rx = -0.6; p.handL = p.handR = 'relax';
    p.tail.ry = sn * 0.15;
    stepEvents(s, ph, rig);
  },
});

def('wave', {
  loop: true, dur: 2.6, expr: 'happy', // dur: play('wave', { loop: false, onDone }) ends + calls back (Villagers' tap)
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.6);
    const wv = sin(t * 8.5);
    // wing held out wide of his big head, wingtip flapping hello
    rig.reach(p, 1, 9.8 + wv * 0.3, 9.4 + wv * 0.5, 2.6, [1, -0.6, 0.2]);
    p.wristL.rz = wv * 0.6 + 0.3; p.wristL.rx = -0.3; p.handL = 'open';
    p.armL.rz += 0.15;
    onHammer(p, rig);
    p.mover.y += abs(sin(t * 4.25)) * 0.4;
    p.chest.rz -= 0.1; p.hips.rz -= 0.04; p.head.rz += -0.16 + sin(t * 4.25) * 0.05;
    p.crest.rx += 0.25 + sin(t * 8.5) * 0.05;
    f.mouth = 'grin';
  },
});

def('talk', {
  loop: true, expr: 'talk',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.7);
    const on = talkMouth(t, f, { rate: 6.5, open: 'open', mid: 'o', shut: 'smile', o: 'grin' });
    // the pencil comes out from behind his ear: wag it, sketch a square in the air, tap the plan on his palm
    const T = t % 7.2;
    const ear = max(win(T, 0.05, 0.75, 0.25, 0.2), win(T, 6.35, 7.15, 0.2, 0.25));
    const wag = win(T, 0.8, 2.4, 0.25, 0.25), sq = win(T, 2.6, 4.3, 0.25, 0.25), tap = win(T, 4.5, 6.2, 0.25, 0.25);
    let x = 4.4, y = 3.4, z = 7.0;
    const e = rig.headPoint(p, 4.2, -1.4, _c);
    x = lerp(x, 7.6, ear); y = lerp(y, e[0] - 1.8, ear); z = lerp(z, e[1] + 0.2, ear);
    x = lerp(x, 6.4 + sin(t * 9) * 0.5 * wag, wag); y = lerp(y, 9.6, wag); z = lerp(z, 5.6, wag);
    const u = clamp((T - 2.8) / 1.3, 0, 0.999) * 4, si = Math.floor(u), fr = smooth(u - si);
    const CR = [[1.4, 8.6], [5.4, 8.6], [5.4, 5.0], [1.4, 5.0]];
    const a0 = CR[si], a1 = CR[(si + 1) % 4];
    x = lerp(x, lerp(a0[0], a1[0], fr), sq); y = lerp(y, lerp(a0[1], a1[1], fr), sq); z = lerp(z, 8.4, sq);
    x = lerp(x, 0.6, tap); y = lerp(y, 5.4 + abs(sin(t * 9)) * 0.7, tap); z = lerp(z, 8.0, tap);
    rig.reach(p, -1, x, y, z, [1, -0.5, -0.3]);
    p.handR = 'fist'; p.wristR.rx = -0.3;
    p.vis.pencil = T > 0.45 && T < 6.8;
    // pencil aim (chest space): up while wagging, forward for the square, down onto the palm
    p.k.penX = -0.1 * tap; p.k.penY = lerp(lerp(0.8, 1, wag), -0.5, max(sq * 0.3, tap)); p.k.penZ = lerp(0.6, 1, sq) - wag * 0.4;
    // the other wing: thumb in the belt, then an open palm for the taps
    onBelt(p, rig, 1 - tap);
    if (tap > 0) { rig.reach(p, 1, 1.6, 3.8, 8.0, [0.9, -0.4, -0.6], tap); p.handL = 'open'; p.wristL.rx = -0.6; p.wristL.rz = 0.9; }
    p.head.rx += (on ? sin(t * 6.5) * 0.04 : 0) + tap * 0.12;
    p.head.rz += sin(t * 1.2) * 0.08;
    p.chest.ry += sq * 0.1;
    f.look = [sq ? (x - 3.4) * -0.3 : 0, tap ? 1 : sq ? (7 - y) * 0.3 : 0];
    if (wag > 0.5) f.brows = 'raised';
    p.crest.rx += wag * abs(sin(t * 9)) * 0.15;
  },
});

def('laugh', {
  loop: true, expr: 'laugh',
  fn(t, p, f, s, rig) {
    // a woody "ha-ha-ha-HA-ha": wings on the tummy, the crest bouncing, head thrown back on the big HA
    const ha = sin(t * 13);
    const T = t % 3.0, big = win(T, 1.8, 2.7, 0.15, 0.25);
    stand(p, rig, t, 0.4);
    rig.stance(p, 0.3 + abs(ha) * 0.25, 0.7, 0.4, 0.12);
    rig.reach(p, 1, 3.8, 1.2 + ha * 0.2, 6.8, [0.9, -0.4, -0.6]);
    rig.reach(p, -1, 3.8, 1.2 - ha * 0.2, 6.8, [0.9, -0.4, -0.6]);
    p.handL = p.handR = 'open'; p.wristL.rx = p.wristR.rx = 0.7;
    p.chest.rx += lerp(0.06, -0.24, big) + ha * 0.05; p.head.rx += lerp(0.04, -0.42, big) + ha * 0.08;
    p.chest.s = 1 + abs(ha) * 0.04; p.mover.y += abs(ha) * 0.25;
    p.head.rz = sin(t * 2.4) * 0.1;
    p.crest.rx += big * 0.35 + ha * 0.08;
    f.mouth = ha > -0.2 ? 'laugh' : 'open';
    if (beat(s, 'h', t, (TAU / 13) * 2, 0.1)) rig._emit('laugh');
  },
});

const HAPPY = 2.0;
def('happy', {
  dur: HAPPY, expr: 'happy', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, HAPPY);
    // hop, a flappy twirl in the air, land; crest springing
    const jump = K(t, [[0, 0], [0.2, -1.0, 'out'], [0.3, 0], [0.56, 4.4, 'out'], [0.84, 0, 'in'], [0.94, -0.8, 'out'], [1.06, 0], [1.22, 1.6, 'out'], [1.38, 0, 'in'], [1.48, -0.4], [1.68, 0]]);
    const up = win(t, 0.22, 1.5, 0.12, 0.3);
    stand(p, rig, t, 0.4);
    p.mover.y += max(0, jump);
    p.mover.ry = K(t, [[0.3, 0], [0.84, TAU, 'io']]) % TAU;
    if (jump > 0.2) { p.thighL.rx = p.thighR.rx = -0.25; p.shinL.rx = p.shinR.rx = 0.5; p.thighL.rz = 0.25; p.thighR.rz = -0.25; }
    else rig.stance(p, max(0, -jump) * 1.2 + 0.3, 0.7, 0.4, 0.12);
    p.hips.s = 1 + (jump < 0 ? jump * 0.06 : 0.02);
    const fl = sin(t * 22) * up;
    p.armL.rz = 0.2 + up * (1.35 + fl * 0.45); p.armR.rz = -(0.2 + up * (1.35 + fl * 0.45));
    p.armL.rx = p.armR.rx = -0.2 * up;
    p.foreL.rx = p.foreR.rx = -0.2 - (1 - up) * 0.3;
    p.handL = p.handR = 'open';
    p.chest.rx -= up * 0.1; p.head.rx -= up * 0.15;
    p.crest.rx += up * 0.4;
    p.k.spark = clamp((t - 0.4) / 1.2, 0, 1) * (t < 1.6 ? 1 : 0);
    f.mouth = up > 0.3 ? 'open' : 'grin';
    if (up > 0.5 && beat(s, 'fl', t, TAU / 22, 0.3)) rig._emit('flap');
    if (beat(s, 'l1', t, 99, 0.84) || beat(s, 'l2', t, 99, 1.38)) rig._emit('land');
  },
});

// tok-tok | tok-tok-tok-tok | tok-tok | drumroll
const PECKS = [1.05, 1.19, 1.78, 1.9, 2.02, 2.14, 2.72, 2.86, 3.3, 3.38, 3.46, 3.54, 3.62, 3.7, 3.78, 3.86];
const BURSTS = [1.05, 1.78, 2.72, 3.3];
const PW = 6.0;
def('peck_wood', {
  dur: PW, expr: 'neutral', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, PW);
    // a log pushes up out of the ground; he hops round to face it
    p.k.log = K(t, [[0, 0], [0.38, 1.12, 'out'], [0.5, 1], [5.3, 1], [5.7, 0, 'in']]);
    const turn = K(t, [[0.25, 0], [0.62, 1, 'io'], [4.35, 1], [4.75, 0, 'io']]);
    stand(p, rig, t, 0.5);
    p.mover.ry = LOG_TURN * turn;
    p.mover.y += abs(sin(clamp((t - 0.25) / 0.37, 0, 1) * TAU)) * 0.7 + abs(sin(clamp((t - 4.35) / 0.4, 0, 1) * TAU)) * 0.6;
    // lean in, wings swept back for balance, tail braced
    const work = win(t, 0.62, 4.15, 0.3, 0.35);
    p.chest.rx += work * 0.16; p.head.rx -= work * 0.12;
    p.tail.rx -= work * 0.3;
    p.armL.rx += work * 0.7; p.armR.rx += work * 0.7; p.armL.rz += work * 0.25; p.armR.rz -= work * 0.25;
    p.foreL.rx -= work * 0.5; p.foreR.rx -= work * 0.5;
    if (work > 0.4) { p.handL = p.handR = 'open'; }
    // the pecks: quick thrusts with a little pull-back before each burst
    peckAt(t, PECKS, _pk);
    let pre = 0;
    for (const b of BURSTS) pre = max(pre, win(t, b - 0.2, b - 0.02, 0.1, 0.06));
    p.head.z += _pk[0] * 1.7 - pre * 0.8;
    p.head.rx += _pk[0] * 0.14 - pre * 0.1;
    p.chest.rx += _pk[0] * 0.05;
    p.crest.rx += pre * 0.35;
    p.k.peck = _pk[0];
    p.k.hole = clamp((_pk[1] + 1) / PECKS.length, 0, 1);
    p.k.chips = _pk[2] < 0.22 && _pk[1] >= 0 && t < 4.1 ? 1 : 0;
    p.k.tokU = _pk[2] < 0.32 ? _pk[2] / 0.32 : -1; p.k.tokN = _pk[1];
    if (work > 0.3) { f.expr = 'focused'; f.blink = false; }
    if (_pk[1] > (s.tok ?? -1)) { s.tok = _pk[1]; rig._emit('tok', { i: _pk[1] }); }
    // admires the hole, hops back round, brushes the chips off his apron
    const admire = win(t, 4.0, 4.6, 0.12, 0.2);
    if (admire > 0) { f.expr = 'proud'; p.k.spark = admire; p.head.rz += admire * 0.2; p.head.z -= admire * 0.6; }
    const brush = win(t, 4.8, 5.6, 0.2, 0.2);
    if (brush > 0) {
      const b = abs(sin((t - 4.8) * 9));
      rig.reach(p, -1, lerp(6.6, 1.6, brush), lerp(0.6, 2.4 + b * 2.4, brush), lerp(1.2, 7.4, brush), [0.9, -0.4, -0.6], brush);
      p.handR = 'open'; p.wristR.rx = 0.4; p.head.rx += brush * 0.2;
      f.look = [0, brush * 1.2];
      if (brush > 0.5) f.expr = 'happy';
    }
    if (beat(s, 'up', t, 99, 0.1)) rig._emit('pop');
  },
});

const MS = 5.4;
def('measure', {
  dur: MS, expr: 'neutral', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, MS);
    stand(p, rig, t, 0.5);
    // left hand: clip -> holds the case out front
    const grab = K(t, [[0, 0], [0.4, 1, 'io']]);
    const front = K(t, [[0.4, 0], [0.9, 1, 'io'], [4.55, 1], [4.95, 0, 'io']]);
    const pull = K(t, [[1.0, 0], [2.2, 1, 'io']]);
    const LET = 3.42, back = (t - LET) / 0.14;
    const jolt = pulse(t, LET + 0.12, 0.35);
    let lx = lerp(5.4, 6.4, grab), ly = lerp(0.4, -0.4, grab), lz = lerp(3.2, 1.6, grab);
    lx = lerp(lx, lerp(3.2, 5.0, pull), front); ly = lerp(ly, 4.6 + jolt * 1.4, front); lz = lerp(lz, 7.4, front);
    rig.reach(p, 1, lx, ly, lz, [0.9, -0.3, -0.6]);
    p.handL = 'fist'; p.wristL.rx = 0.2;
    p.vis.tape = t > 0.38 && t < 4.95;
    // right hand: pinches the hook, pulls the tape wide... lets go. ZIP! Shakes it off, scratches his head.
    const meet = win(t, 0.6, LET + 0.14, 0.3, 0.01);
    const shake = win(t, LET + 0.14, 4.0, 0.05, 0.2), scratch = win(t, 4.0, 4.9, 0.2, 0.25);
    let rx = 6.6, ry = 0.6, rz = 1.2;
    rx = lerp(rx, lerp(-1.4, 8.2, pull), meet); ry = lerp(ry, 4.6, meet); rz = lerp(rz, 7.6, meet);
    rx = lerp(rx, 8.0 + sin(t * 30) * 0.8, shake); ry = lerp(ry, 6.0, shake); rz = lerp(rz, 5.0, shake);
    const hb = rig.headPoint(p, 6.0, -3.2, _c);
    rx = lerp(rx, 3.6, scratch); ry = lerp(ry, hb[0] - 1.6 + sin(t * 18) * 0.4, scratch); rz = lerp(rz, hb[1] - 0.6, scratch);
    rig.reach(p, -1, rx, ry, rz, [1, -0.5, -0.4]);
    p.handR = meet > 0.5 && t < LET ? 'fist' : 'open';
    if (scratch > 0.5) p.handR = 'relax';
    p.k.tapeOut = t < LET ? smooth((t - 0.85) / 0.12) : max(0, 1 - back * back);
    // looks at the reading, nods; jumps at the snap (crest straight up!), then a sheepish grin
    const read = win(t, 2.2, LET, 0.2, 0.05);
    p.head.ry += read * 0.32 + pull * 0.1 * (1 - read); p.head.rx += read * (0.16 + abs(sin((t - 2.4) * 7)) * 0.08);
    p.chest.rx -= pull * 0.06 * (1 - read);
    f.look = [read * 1.2 - (1 - read) * pull * 0.8, read * 0.8];
    if (read > 0.4) f.expr = 'squint';
    p.mover.y += jolt * 1.4;
    p.crest.rx += jolt * 0.6;
    p.k.bang = win(t, LET + 0.12, 3.95, 0.04, 0.15);
    if (t > LET + 0.1 && t < 4.0) { f.expr = 'surprised'; f.blink = false; }
    if (t >= 4.0) { f.expr = 'happy'; }
    if (beat(s, 'zip', t, 99, LET)) rig._emit('zip');
    if (beat(s, 'snap', t, 99, LET + 0.14)) rig._emit('snap');
  },
});

const SW = 6.85, SW0 = 0.35; // he hops round first (SW0), then the old timeline runs
const STROKE = 0.48;
def('saw', {
  dur: SW, expr: 'focused', next: 'idle',
  fn(t, p, f, s, rig) {
    const T0 = ff(t, SW);
    t = T0 - SW0;
    // hop round to a 3/4 profile (and back at the end)
    const turn = K(T0, [[0, 0], [SW0, 1, 'io'], [6.4, 1], [6.8, 0, 'io']]);
    p.k.board = K(t, [[0, 0], [0.35, 1.12, 'out'], [0.48, 1], [5.6, 1], [6.05, 0, 'in']]);
    p.k.nail = -1; p.k.hry = 0;
    const lean = win(t, 0.6, 4.9, 0.35, 0.4);
    stand(p, rig, T0, 0.5, 0.3 + lean * 0.7);
    p.mover.ry = SAW_TURN * turn;
    p.mover.y += abs(sin(clamp(T0 / SW0, 0, 1) * PI)) * 0.8 + abs(sin(clamp((T0 - 6.4) / 0.4, 0, 1) * PI)) * 0.8;
    p.chest.rx += lean * 0.2; p.head.rx -= lean * 0.12;
    // saw from behind his back -> onto the pencil line -> six strokes
    const fetch = K(t, [[0.1, 0], [0.42, 1, 'io']]);
    const toCut = K(t, [[0.45, 0], [0.95, 1, 'io'], [3.9, 1], [4.15, 0, 'io']]);
    const proud = win(t, 4.9, 5.55, 0.2, 0.25), stow = K(t, [[5.5, 0], [5.85, 1, 'io']]);
    const sawing = t > 1.0 && t < 3.9;
    const ph = ((t - 1.0) / STROKE) * TAU;
    const stroke = sawing ? -cos(ph) * win(t, 1.0, 3.9, 0.2, 0.15) : 0;
    p.k.cut = clamp((t - 1.0) / 2.9, 0, 1);
    p.k.sawS = stroke * 3;
    p.k.sawLock = toCut;
    p.k.sawB = lerp(lerp(1.3, 0.45, toCut), -1.15, proud);
    const b = 0.45, cy = PLANK_TOP * FV - p.k.cut * 0.04;
    horsePt(CUT_X * FV - 0.02, 0, -0.17 - 0.075 * stroke * cos(b), _hp, 0);
    const gx = _hp.x, gy = cy + 0.2 + 0.075 * stroke * sin(b), gz = _hp.z;
    const c = rig.toChest(p, gy / VS, gz / VS, _c);
    let x = lerp(lerp(5.6, 3.6, fetch), -gx / VS, toCut), y = lerp(lerp(1.0, 2.6, fetch), c[0], toCut), z = lerp(lerp(2.0, -4.8, fetch), c[1], toCut);
    x = lerp(x, 6.6, proud); y = lerp(y, 10.2, proud); z = lerp(z, 4.6, proud);
    x = lerp(x, 3.6, stow); y = lerp(y, 2.6, stow); z = lerp(z, -4.8, stow);
    rig.reach(p, -1, x, y, z, [1, -0.3, -0.5]);
    p.handR = 'fist'; p.wristR.rx = -0.2;
    p.vis.saw = t > 0.4 && t < 5.82;
    if (t < 0) { onHammer(p, rig); onBelt(p, rig); }
    // other hand holds the plank down
    const hold = win(t, 0.6, 3.95, 0.3, 0.2);
    horsePt(0.15, 0, -0.02, _hp, 0);
    reachMv(p, rig, 1, _hp.x, PLANK_TOP * FV + 0.1, _hp.z, [0.9, -0.3, -0.6], hold);
    if (hold > 0.5) { p.handL = 'open'; p.wristL.rx = 0.9; } else onBelt(p, rig, 1 - hold);
    p.chest.rx += stroke * 0.03; p.chest.ry += stroke * 0.05; p.head.rz += stroke * 0.03;
    p.k.dust = sawing ? 1 : 0;
    // the end drops off (blink!), he blows the sawdust away, holds the saw up proudly
    p.k.drop = clamp((t - 3.9) / 0.42, 0, 1);
    const blowW = win(t, 4.3, 4.95, 0.15, 0.2);
    p.k.blow = clamp((t - 4.4) / 0.55, 0, 1);
    if (blowW > 0) { p.head.z += blowW * 0.8; p.head.rx += blowW * 0.25; p.chest.rx += blowW * 0.08; f.mouth = 'sip'; f.eyes = 'closed'; }
    if (t > 3.95 && t < 4.3) { f.expr = 'surprised'; p.crest.rx += pulse(t, 3.95, 0.35) * 0.5; }
    if (proud > 0.1) { f.expr = 'proud'; p.k.spark = proud; }
    if (sawing) f.look = [-0.6, 1.2];
    if (sawing && beat(s, 'st', t - 1.0, STROKE, STROKE * 0.25)) rig._emit('saw');
    if (beat(s, 'clunk', t, 99, 4.22)) rig._emit('clunk');
    if (beat(s, 'blow', t, 99, 4.4)) rig._emit('blow');
    if (beat(s, 'pop', T0, 99, SW0 + 0.1)) rig._emit('pop');
  },
});

const HS = 5.2;
const HITS = [1.12, 1.52, 2.36];
def('hammer', {
  dur: HS, expr: 'focused', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, HS);
    p.k.board = K(t, [[0, 0], [0.35, 1.12, 'out'], [0.48, 1], [4.6, 1], [5.05, 0, 'in']]);
    p.k.drop = 0; p.k.hry = HORSE_RY;
    const lean = win(t, 0.55, 3.0, 0.3, 0.35);
    const big = K(t, [[1.7, 0], [2.22, 1, 'io'], [2.36, 0, 'in']]);
    stand(p, rig, t, 0.5, 0.3 + lean * 0.6 + big * 0.5);
    p.chest.rx += lean * 0.18 - big * 0.2; p.head.rx -= lean * 0.08 - big * 0.1;
    // hammer: out of the loop, tap, tap, wind up... BANG! Then a twirl back into the loop
    const draw = K(t, [[0.15, 0], [0.45, 1, 'io']]);
    const work = K(t, [[0.45, 0], [0.85, 1, 'io'], [2.9, 1], [3.1, 0, 'io']]);
    const tw = K(t, [[3.05, 0], [3.75, 1, 'io']]);
    let a = 0.9;
    a = K(t, [[0.85, 0.9], [1.0, 1.5, 'out'], [1.12, 0, 'in'], [1.3, 0.2, 'out'], [1.4, 1.5, 'out'], [1.52, 0, 'in'], [1.7, 0.3, 'out'], [2.22, 2.5, 'io'], [2.36, 0, 'in'], [2.9, 0], [3.05, 0.9, 'io']]);
    a += tw * (TAU + PI / 2 - 0.9);
    p.k.hamA = a;
    // nail: in a bit with each blow
    const depth = K(t, [[1.1, 0], [1.13, 0.3, 'out'], [1.5, 0.3], [1.53, 0.55, 'out'], [2.34, 0.55], [2.38, 1, 'out']]);
    p.k.nail = depth;
    // hand: a handle's length right of the nail, lifting with each wind-up
    horsePt(NAIL_X * FV, 0, -0.5 * FV, _hp);
    const nx = _hp.x, nz = _hp.z, nTop = (PLANK_TOP + (1 - depth) * 5 + 1) * FV;
    const wx = nx - 8.5 * FV, wy = nTop + 4 * FV + 0.09 + max(0, sin(a)) * 0.07 + big * 0.12, wz = nz - 0.03 - big * 0.04;
    const c = rig.toChest(p, wy / VS, wz / VS, _c);
    let x = lerp(lerp(6.6, 6.8, draw), -wx / VS, work), y = lerp(lerp(0.6, 0.2, draw), c[0], work), z = lerp(lerp(1.2, 2.0, draw), c[1], work);
    x = lerp(x, 6.8, tw); y = lerp(y, 0.4 + sin(tw * PI) * 3, tw); z = lerp(z, 2.2, tw);
    rig.reach(p, -1, x, y, z, [1, -0.3, -0.5]);
    p.handR = 'fist'; p.wristR.rx = -0.2;
    p.vis.hammer = t > 0.4 && t < 3.72;
    // lock the face onto the nail right at each blow
    let lock = 0;
    for (const h of HITS) lock = max(lock, win(t, h - 0.05, h + 0.12, 0.04, 0.08));
    p.k.hamLock = lock * work;
    // left hand steadies the plank
    const hold = win(t, 0.5, 2.95, 0.3, 0.25);
    horsePt(0.15, 0, -0.02, _hp);
    reachMv(p, rig, 1, _hp.x, PLANK_TOP * FV + 0.1, _hp.z, [0.9, -0.3, -0.6], hold);
    if (hold > 0.5) { p.handL = 'open'; p.wristL.rx = 0.9; } else onBelt(p, rig, 1 - hold);
    // impacts: squash, "TOK" words, the BANG gets stars and a big "TOK!"
    let since = 99, n = -1;
    HITS.forEach((h, i) => { if (t >= h) { since = t - h; n = i; } });
    const sq = n >= 0 ? max(0, 1 - since / 0.18) : 0;
    p.hips.s += -sq * (n === 2 ? 0.1 : 0.04); p.mover.y -= sq * (n === 2 ? 0.6 : 0.2);
    p.k.tokU = n >= 0 && n < 2 && since < 0.3 ? since / 0.3 : -1; p.k.tokN = n;
    p.k.tokBig = n === 2 ? clamp(since / 0.55, 0, 1) : 0;
    p.k.stars = n === 2 ? clamp(since / 0.5, 0, 1) : 0;
    p.crest.rx += (n === 2 ? sq * 0.6 : 0) + big * 0.4;
    f.look = [0.6 * work, 1.2 * work];
    if (big > 0.3) { f.eyes = 'focused'; f.brows = 'angry'; }
    // inspects the nail (flush!), then happy twirl + proud
    const insp = win(t, 2.5, 3.05, 0.12, 0.15);
    if (insp > 0) { p.head.z += insp * 0.8; f.expr = 'squint'; }
    if (t > 3.05) { f.expr = tw < 1 ? 'happy' : 'proud'; p.k.spark = win(t, 3.6, 4.6, 0.15, 0.3); }
    for (let i = 0; i < HITS.length; i++) if (beat(s, 'h' + i, t, 99, HITS[i])) rig._emit('hammer_hit', { strength: i === 2 ? 1 : 0.4 });
    if (beat(s, 'pop', t, 99, 0.1)) rig._emit('pop');
  },
});

const IS = 4.6;
def('inspect', {
  dur: IS, expr: 'neutral', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, IS);
    stand(p, rig, t, 0.5);
    // an offcut from behind his back, up close to his eyes
    const bring = K(t, [[0, 0], [0.5, 1, 'io'], [3.8, 1], [4.3, 0, 'io']]);
    const near = win(t, 0.9, 3.0, 0.3, 0.3);
    const e = rig.headPoint(p, EYE_Y + 0.6, 9.4 + near * 0.8, _c);
    let lx = lerp(4.4, 3.0, near), ly = lerp(2.4, e[0], bring), lz = lerp(-3.0, e[1], bring);
    lx = lerp(4.6, lx, bring);
    rig.reach(p, 1, lx, ly, lz, [0.9, -0.5, -0.4]);
    p.handL = 'fist'; p.wristL.rx = -0.4;
    p.vis.offcut = t > 0.22 && t < 4.15;
    // turns it over, end grain, back again
    p.k.offR = K(t, [[1.2, 0.2], [1.7, 1.4, 'io'], [2.2, 1.4], [2.6, -0.3, 'io'], [3.0, 0.2, 'io']]);
    // right fingertip pushes the specs up, squints, leans in; tilts this way, that way
    const push = win(t, 0.45, 1.25, 0.2, 0.25);
    const g = rig.headPoint(p, EYE_Y + 0.6, 6.2, _c);
    rig.reach(p, -1, lerp(6.6, 1.2, push), lerp(0.6, g[0] - 2.6, push), lerp(1.2, g[1] + 0.8, push), [1, -0.7, -0.2]);
    p.handR = push > 0.5 ? 'point' : 'relax';
    if (push > 0.5) p.wristR.rx = -0.2; else onHammer(p, rig, 1 - push);
    p.glasses.y += K(t, [[0.7, 0], [0.95, 1.0, 'out'], [3.3, 1.0], [3.5, -0.25, 'in'], [3.62, 0.12, 'out'], [3.75, 0]]);
    p.head.z += near * 0.7;
    p.head.rz += near * K(t, [[1.2, 0], [1.6, 0.22], [2.2, 0.22], [2.6, -0.2], [3.0, 0]]);
    p.head.rx += near * 0.08;
    p.chest.rx += near * 0.06;
    if (near > 0.4) { f.expr = 'squint'; f.look = [0.6, 0.4]; }
    // ...and approves: crest pops, sparkle, nod nod
    const ok = win(t, 3.0, 3.8, 0.1, 0.25);
    if (ok > 0) { f.expr = 'proud'; p.k.spark = ok; p.head.rx += abs(sin((t - 3.0) * 10)) * 0.12 * ok; p.crest.rx += ok * 0.3; }
    if (t > 3.8) f.expr = 'happy';
    if (beat(s, 'ding', t, 99, 3.05)) rig._emit('ding');
  },
});

export { ANIMS as WOODPECKER_ANIMS };
