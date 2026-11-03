// [v32 dive] ChiefBuff: Chief Petty Officer Buffington "Buff" Bufflehead (ret.), dive
// instructor of Loon Lake. A barrel-chested little diving duck: a big glossy black head
// shot with green and purple, the bufflehead's huge white bonnet patch sweeping back from
// the eye, a short slate-blue beak, a crisp white chest. He wears a navy knit watch cap, a
// navy sweater vest with an anchor patch, a brass whistle on a red lanyard, dog tags, a
// webbing belt with a dive knife and a stopwatch, and big orange paddle feet. Clipboard
// under the wing. Stern brows. Secretly soft.
//
//   const b = new ChiefBuff();  scene.add(b.root);
//   b.play('whistle');   // whistle to the beak: TWEEEET! and a pointed wing
//   b.play('pushups');   // drops, three push-ups (counting), pops back up
//   b.play('clipboard'); // checks the clipboard, ticks a box with a flourish
//   b.play('salute');    // a crisp salute, held
//   b.play('cry');       // graduation: a tear, wipes it with a wingtip ("it's lake water")
//   b.play('swim');      // underwater: body flat, paddle feet kicking, wings tucked (loop)
//   b.onEvent = (name) => {};  // 'step' | 'tweet' | 'count' | 'tick' | 'snap' | 'sniff' | 'paddle'
//
// Anims: idle wave talk laugh walk happy whistle pushups clipboard salute cry swim
// Expressions: neutral (stern) happy talk shout surprised proud laugh sad think (+ BASE_EXPRS)
// Units: 1 voxel = 0.05. Root at the feet, facing +Z. ~1.25 tall to the cap.
import * as THREE from 'three';
import {
  VS, FV, VoxelModel, rbox, ell, tone, buildGeo, geoCache, mirrorX, handModel, K, pulse, beat, win,
  sin, cos, abs, max, min, PI, TAU, clamp, lerp, smooth, SPARK_ROWS,
} from './critterKit.js';
import { BASE_EXPRS } from './critterFaces.js';
import { BipedRig, HAND_KINDS } from './critterBiped.js';
import { NpcFace, talkMouth, stepEvents, orientIn, NOTE_ROWS, BANG_ROWS, DROPLET_ROWS, PUFF_ROWS } from './npcProps.js';
import { spriteMatPal } from './npcProps2.js';

const C = {
  ink: 0x1e1a26, inkD: 0x141018, inkL: 0x302a3c, green: 0x1e4a44, greenL: 0x2e6a5c, purple: 0x3a2a5c, purpleL: 0x5a3e86,
  white: 0xf6f4ee, whiteD: 0xdcd8ce, whiteL: 0xffffff,
  beak: 0x7a88a2, beakD: 0x58627a, beakL: 0xa4b0c4, beakDD: 0x323848, tongue: 0xe07a90,
  leg: 0xf0883a, legD: 0xc86424, legL: 0xffaa60, web: 0xe07430,
  navy: 0x26325e, navyD: 0x1a2446, navyL: 0x3a4a82, knit: 0x2c3a6c,
  red: 0xd8403a, redD: 0xa02a28, brass: 0xe8c050, brassD: 0xb08a2a, brassL: 0xfff0a0,
  silver: 0xc8ccd6, silverD: 0x8a909c, belt: 0x5a5a3a, beltD: 0x3e3e26, knife: 0x2a2a2a,
  board: 0xa8743e, boardD: 0x7e5428, paper: 0xfaf6ea, paperD: 0xd8d2c0, line: 0x8aa8d8, clip: 0xc8ccd6,
};

const D = {
  CHIBI: { body: 0.82, head: 1.3, tail: 1.2 }, // [v20 npc rigs] small body, big head
  HIP_Y: 5.2, WAIST: 1, NECK: 8.4, NECK_Z: 0.8, SH: [5.6, 6.8, 0.2], L_UP: 3.2, L_FORE: 3.2, L_HAND: 2.0,
  THIGH: 2.5, SHIN: 2.7, LEG_X: 2.5, EAR: [6.2, 5.2, -1.2], TAIL: [0.8, -4.6],
};
const EYE_Y = 5.4;
const BEAK = [3.0, 5.0]; // beak base (y, z), head space (voxels)
const BEAK_L = 7; // fine voxels: short and wide

// ------------------------------------------------------------------ models
const h3 = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const inkCol = (x, y, z) => tone(x, y, z, C.ink, C.inkD, C.inkL, 0.12, 0.08);
const whiteCol = (x, y, z) => tone(x, y, z, C.white, C.whiteD, C.whiteL, 0.1, 0.1);
const navyCol = (x, y, z) => tone(x, y, z, C.navy, C.navyD, C.navyL, 0.12, 0.08);
function surfZ(v, x, y, front = true) {
  if (front) { for (let z = 16; z >= -16; z--) if (v.has(x, y, z)) return z; }
  else for (let z = -16; z <= 16; z++) if (v.has(x, y, z)) return z;
  return null;
}
function pelvisModel() {
  const v = new VoxelModel();
  // white flanks + belly, black rump
  rbox(v, -5, 4, -3, 1, -4, 3, 1.9, (x, y, z) => (z < -1.5 ? inkCol(x, y, z) : whiteCol(x, y, z)));
  // webbing belt all round with a brass buckle; dive knife on the right hip, stopwatch on the left
  for (let x = -6; x <= 5; x++) for (let z = -5; z <= 4; z++) if (v.has(x, 1, z) && (!v.has(x + 1, 1, z) || !v.has(x - 1, 1, z) || !v.has(x, 1, z + 1) || !v.has(x, 1, z - 1))) v.set(x, 1, z, (x + z) & 1 ? C.belt : C.beltD);
  { const z = surfZ(v, 0, 1); v.set(-1, 1, z + 1, C.brass); v.set(0, 1, z + 1, C.brass); v.set(-1, 0, z + 1, C.brassD); v.set(0, 0, z + 1, C.brassD); }
  for (let y = -3; y <= 1; y++) { v.set(-6, y, 0, y === 1 ? C.belt : C.knife); v.set(-6, y, 1, y === 1 ? C.belt : C.knife); }
  v.set(-6, 2, 0, C.silver); v.set(-6, 2, 1, C.silverD);
  for (const [y, z, c] of [[0, -1, C.silver], [1, -1, C.silverD], [0, -2, C.silverD], [1, -2, C.silver], [2, -1, C.silverD]]) v.set(5, y, z, c);
  v.set(6, 0, -1, C.ink); v.set(6, 1, -2, C.red);
  return v;
}
function torsoModel() {
  const v = new VoxelModel();
  // barrel chest, white front, black back
  const col = (x, y, z) => (z >= -0.6 + abs(x + 0.5) * 0.15 ? whiteCol(x, y, z) : inkCol(x, y, z));
  ell(v, 0, 3.4, -0.2, 5.8, 6.2, 5.0, (x, y, z) => (y < -1 ? null : col(x, y, z)));
  ell(v, 0, 2.6, 1.0, 5.6, 4.8, 4.8, (x, y, z) => (y < -1 ? null : col(x, y, z))); // the puffed-out chest
  // navy sweater vest: open at the front (white chest shows), ribbed hem, anchor patch on the left breast
  for (let x = -6; x <= 5; x++)
    for (let y = -1; y <= 7; y++) {
      const fx = abs(x + 0.5);
      const open = fx < 2.2 + max(0, y - 2) * 0.25;
      for (const front of [true, false]) {
        const z = surfZ(v, x, y, front);
        if (z === null) continue;
        if (front && open) continue;
        if (front && z < 0 && fx < 4) continue;
        v.set(x, y, front ? z + 1 : z - 1, y === -1 ? ((x & 1) ? C.navyD : C.navy) : navyCol(x, y, z));
      }
    }
  // anchor patch (gold on navy) on the left breast
  { const zs = (x, y) => surfZ(v, x, y);
    for (const [x, y] of [[4, 5], [4, 4], [4, 3], [3, 4], [5, 4], [3, 2], [5, 2], [4, 2]]) { const z = zs(x, y); if (z !== null) v.set(x, y, z, C.brass); } }
  // neck: black, white bonnet at the back
  rbox(v, -3, 2, 7, 10, -2, 2, 1.2, (x, y, z) => (z < -1 ? C.white : inkCol(x, y, z)));
  // red lanyard round the neck down to the chest (the whistle is its own mesh)
  for (let y = 4; y <= 8; y++) for (const s of [-1, 1]) {
    const x = s * Math.round(1 + (8 - y) * 0.25) - (s < 0 ? 1 : 0);
    const z = surfZ(v, x, y); if (z !== null) v.set(x, y, z + 1, y % 2 ? C.red : C.redD);
  }
  // dog tags just left of the whistle
  { const z = surfZ(v, 2, 4); if (z !== null) { v.set(2, 4, z + 1, C.silver); v.set(2, 3, z + 1, C.silverD); v.set(3, 4, z + 1, C.silverD); } }
  return v;
}
function headModel() {
  const v = new VoxelModel();
  // glossy black, iridescent green on the crown and purple on the cheeks; the white bonnet
  // patch from behind the eye up and back round the nape
  const col = (x, y, z) => {
    const fx = abs(x + 0.5);
    const bon = (fx > 3.2 && z < 1.4 && y > 3.0 && y < 9 && z > -6) || (z < -2.8 && y > 3.6 && y < 8.6);
    if (bon) return y > 7.6 && h3(x, y, z) < 0.3 ? C.whiteD : whiteCol(x, y, z);
    const hh = h3(x, y, z);
    if (y > 6.5) return hh < 0.3 ? C.greenL : hh < 0.55 ? C.green : inkCol(x, y, z);
    if (fx > 3 && y < 4) return hh < 0.35 ? C.purpleL : hh < 0.6 ? C.purple : inkCol(x, y, z);
    return hh < 0.12 ? C.inkL : inkCol(x, y, z);
  };
  rbox(v, -7, 6, 0, 9, -6, 4, 3.8, col);
  ell(v, 0, 3.4, 0.4, 7.4, 3.6, 5.0, col); // round cheeks
  return v;
}
function tuftModel() {
  const v = new VoxelModel();
  for (const [x, y, z, c] of [[0, 0, 0, C.white], [0, 0, -1, C.whiteD], [0, 1, -1, C.white]]) v.set(x, y, z, c);
  return v;
}
function capModel() {
  // navy knit watch cap: a rolled cuff, ribbed crown, perched on the crown and tipped forward
  const v = new VoxelModel();
  for (let y = 0; y <= 5; y++) {
    const R = y <= 1 ? 5.2 : 5.0 - (y - 2) * 0.8;
    for (let x = -6; x <= 5; x++)
      for (let z = -6; z <= 5; z++) {
        const r = Math.hypot(x + 0.5, z + 0.5);
        if (r > R || (y < 5 && r < R - 1.2)) continue;
        v.set(x, y, z, y <= 1 ? ((x + z) & 1 ? C.navy : C.navyL) : (x & 1) ? C.knit : C.navyD);
      }
  }
  return v;
}
function beakModel() {
  // short, wide slate-blue bill with a dark nail at the tip
  const v = new VoxelModel();
  for (let z = 0; z < BEAK_L; z++) {
    const u = z / (BEAK_L - 1);
    const hw = u < 0.5 ? 4 : 3;
    const top = u < 0.4 ? 2 : 1;
    for (let x = -hw; x < hw; x++)
      for (let y = 0; y <= top; y++) {
        let c = y === top ? (x === -1 || x === 0 ? C.beakL : C.beak) : C.beakD;
        if (z === BEAK_L - 1 && abs(x + 0.5) < 2) c = C.beakDD;
        v.set(x, y, z, c);
      }
  }
  v.set(-2, 2, 2, C.beakDD); v.set(1, 2, 2, C.beakDD); // nostrils
  return v;
}
function beakLoModel() {
  const v = new VoxelModel();
  for (let z = 0; z < BEAK_L - 1; z++) {
    const hw = z < 4 ? 4 : 3;
    for (let x = -hw; x < hw; x++) {
      v.set(x, -2, z, C.beakD);
      const rim = x === -hw || x === hw - 1 || z >= BEAK_L - 2;
      v.set(x, -1, z, rim ? C.beakD : z < 3 ? C.tongue : C.beakDD);
    }
  }
  return v;
}
const wingCol = (x, y, z) => ((y + 60) % 4 === 0 && z >= 0 ? C.white : inkCol(x, y, z));
function upperModel() {
  // black wing with the bufflehead's white wing patch
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_UP, 0, -1, 1, 1.0, (x, y, z) => (y < -1 && x >= 0 ? whiteCol(x, y, z) : inkCol(x, y, z)));
  ell(v, 0.5, -0.6, 0.5, 2.3, 1.8, 2.3, (x, y, z) => (y < -1.5 ? null : inkCol(x, y, z)));
  return v;
}
function foreModel() {
  const v = new VoxelModel();
  rbox(v, -1, 1, -D.L_FORE - 1, 0, -1, 1, 1.2, wingCol);
  for (let y = -1; y >= -D.L_FORE - 2; y--) for (let x = -1; x <= 1; x++) v.set(x, y, -2, y <= -D.L_FORE - 1 ? C.inkD : C.ink);
  return v;
}
function thighModel() {
  const v = new VoxelModel();
  rbox(v, -2, 1, -D.THIGH, 1, -2, 1, 1.3, (x, y, z) => (z < -1 ? inkCol(x, y, z) : whiteCol(x, y, z)));
  return v;
}
function shinModel() {
  // orange legs, big webbed paddle feet
  const v = new VoxelModel();
  for (let y = -D.SHIN + 1; y <= 0; y++) for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) v.set(x, y, z, (y + 40) % 2 ? C.leg : C.legD);
  const y = Math.round(-D.SHIN);
  for (let z = -1; z <= 4; z++) {
    const hw = z < 1 ? 1 : z < 3 ? 2 : 3;
    for (let x = -hw - 1; x <= hw; x++) {
      const toe = (x === -hw - 1 || x === hw || x === -1 || x === 0);
      v.set(x, y, z, z === 4 ? (toe ? C.legD : null) : toe ? C.leg : C.web);
    }
  }
  v.set(-1, y + 1, 0, C.legL); v.set(0, y + 1, 0, C.legL);
  return v;
}
function tailModel() {
  const v = new VoxelModel();
  for (let x = -3; x <= 2; x++) {
    const fx = abs(x + 0.5), bot = Math.round(-4 + fx * 0.6);
    for (let y = bot; y <= 0; y++) { v.set(x, y, 0, y === bot ? C.inkD : inkCol(x, y, 0)); if (y > bot + 1 && fx < 2) v.set(x, y, 1, C.inkD); }
  }
  return v;
}
function whistleModel() {
  // brass pea whistle (fine voxels), mouthpiece toward +Z
  const v = new VoxelModel();
  ell(v, 0, 0, 0, 2.2, 2.2, 2.0, (x, y, z) => (y >= 1 && x <= -1 ? C.brassL : C.brass));
  for (let z = 1; z <= 4; z++) for (let x = -1; x <= 0; x++) v.set(x, 1, z, z === 4 ? C.brassD : C.brass);
  v.set(-1, 2, 2, C.brassD); v.set(0, 2, 2, C.brassD);
  v.set(-1, -2, 0, C.red); v.set(0, -2, 0, C.red);
  return v;
}
function clipboardModel() {
  // clipboard (fine voxels), held at the bottom edge: board up +Y, paper facing +Z
  const v = new VoxelModel();
  for (let x = -6; x <= 5; x++)
    for (let y = 0; y <= 16; y++) {
      v.set(x, y, 0, abs(x + 0.5) > 5 || y === 0 || y === 16 ? C.boardD : C.board);
      if (abs(x + 0.5) < 5 && y > 0 && y < 14) v.set(x, y, 1, y % 3 === 0 && x > -4 && x < 4 ? C.line : (x === -4 && y % 3 === 0) ? C.red : C.paper);
    }
  for (let x = -3; x <= 2; x++) { v.set(x, 15, 1, C.clip); v.set(x, 14, 2, C.silverD); }
  return v;
}
const TWEET_PAL = { k: '#1a2a5a', w: '#fffbe0', s: '#ffd23a' };
/** "TWEET!" as a tiny comic word. */
function wordRows(text) {
  const F = { T: ['###', '.#.', '.#.', '.#.', '.#.'], W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], E: ['###', '#..', '##.', '#..', '###'], '!': ['#', '#', '#', '.', '#'] };
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
const TWEET_ROWS = wordRows('TWEET!');
const TEAR_PAL = { k: '#2a5a9a', w: '#ffffff', b: '#8fd8ff' };
const TEAR_ROWS = ['.k.', 'kbk', 'kwk', '.k.'];

const cache = geoCache(() => {
  const G = {
    pelvis: buildGeo(pelvisModel()), torso: buildGeo(torsoModel()), head: buildGeo(headModel()),
    earL: buildGeo(tuftModel()), earR: buildGeo(mirrorX(tuftModel())), cap: buildGeo(capModel()),
    beak: buildGeo(beakModel(), [0, 0, 0], FV), beakLo: buildGeo(beakLoModel(), [0, 0, 0], FV),
    upper: buildGeo(upperModel(), [0.5, 0, 0.5]), fore: buildGeo(foreModel(), [0.5, 0, 0.5]),
    thigh: buildGeo(thighModel(), [0, 0, 0]), shin: buildGeo(shinModel(), [0, 0, 0]), tail: buildGeo(tailModel(), [0, 0, 0]),
    whistle: buildGeo(whistleModel(), [0, 0, 0], FV), board: buildGeo(clipboardModel(), [0, 0, 0.5], FV),
  };
  for (const k of HAND_KINDS) {
    G['hand_' + k + 'L'] = buildGeo(handModel(k, 1, C.inkL, C.inkD), [0, 0, 0], FV);
    G['hand_' + k + 'R'] = buildGeo(handModel(k, -1, C.inkL, C.inkD), [0, 0, 0], FV);
  }
  return G;
});

// ------------------------------------------------------------------ face
const FACE = {
  w: 50, h: 20, eyes: [{ x: 13.5, y: 10.5 }, { x: 36.5, y: 10.5 }], rx: 3.6, ry: 4.2, style: 'bead', lash: false,
  blush: [{ x: 5, y: 17 }, { x: 45, y: 17 }], blushW: 3,
  mw: 8, mh: 4, mx: 4, my: 1, mstyle: 'owl', mHalf: 2,
  pal: { i: '#e8a020', I: '#ffd860', b: '#f6f4ee' }, // golden eyes, white brows
};
/** Heavy white drill-sergeant brows, always on, tilted by mood. */
function brows(P, st, cfg) {
  const b = st.ownBrows;
  cfg.eyes.forEach((e, i) => {
    const s = i === 0 ? -1 : 1;
    const lift = b === 'raised' ? -2 : b === 'up' ? -1 : 0;
    const tilt = b === 'worried' ? -1 : b === 'up' || b === 'raised' ? 0 : b === 'flat' ? 0.3 : 1; // stern by default
    for (let k = -4; k <= 4; k++) {
      const x = e.x + k, y = e.y - 6 + lift + Math.round(k * s * tilt * 0.4);
      P.set(x, y, 'b'); P.set(x, y + 1, abs(k) < 4 ? 'b' : null);
    }
  });
}
const EXPRS = {
  ...BASE_EXPRS,
  neutral: { eyes: 'open', brows: null, mouth: 'flat', blush: 0, tear: 0 }, // stern
  happy: { eyes: 'happy', brows: 'up', mouth: 'grin', blush: 1, tear: 0 },
  talk: { eyes: 'open', brows: null, mouth: 'open', blush: 0, tear: 0 },
  shout: { eyes: 'wide', brows: null, mouth: 'yell', blush: 0, tear: 0 },
  surprised: { eyes: 'wide', brows: 'raised', mouth: 'o', blush: 0, tear: 0 },
  proud: { eyes: 'shiny', brows: 'up', mouth: 'grin', blush: 1, tear: 0 },
  laugh: { eyes: 'happy', brows: 'up', mouth: 'laugh', blush: 1, tear: 0 },
  sad: { eyes: 'half', brows: 'worried', mouth: 'frown', blush: 1, tear: 1 },
  think: { eyes: 'half', brows: 'flat', mouth: 'flat', blush: 0, tear: 0 },
};
const BEAK_OPEN = { open: 0.42, laugh: 0.55, yell: 0.62, grin: 0.2, o: 0.3, sip: 0.1, chew2: 0.15, frown: 0.03, cheeky: 0.06, blep: 0.12 };

// ------------------------------------------------------------------ rig
const _w = new THREE.Vector3(), _w2 = new THREE.Vector3();
export class ChiefBuff extends BipedRig {
  constructor({ shadows = true } = {}) {
    super('ChiefBuff', { shadows });
    const G = (this._G = cache.get());
    this._geoCache = cache;
    this._buildBiped(G, D);
    this.tail.children[0].rotation.x = 0.5;
    this.joint('cap', this.head, 0.2, 8.6, -1.0);
    const tilt = new THREE.Group(); tilt.rotation.set(0.32, 0, -0.12); this.cap.add(tilt);
    this.mesh(G.cap, tilt);
    this.mesh(G.beak, this.head, { y: BEAK[0] * VS, z: BEAK[1] * VS });
    this.beakLo = new THREE.Group(); this.beakLo.position.set(0, BEAK[0] * VS, BEAK[1] * VS); this.head.add(this.beakLo);
    this.mesh(G.beakLo, this.beakLo);
    this._beak = 0;
    this.face = new NpcFace(FACE, { eyes: brows, ownBrows: true });
    this.facePlane(this.face.eyes.tex, this.head, FACE.w, FACE.h, 0, EYE_Y - 0.2, 5.15);
    // whistle: on the lanyard at his chest, or up at the beak
    this.whistleChest = this.mesh(G.whistle, this.chest, { x: -0.3 * VS, y: 3.4 * VS, z: 6.0 * VS, shadow: false });
    this.whistleBeak = this.mesh(G.whistle, this.head, { y: (BEAK[0] - 0.4) * VS, z: (BEAK[1] + 3.2) * VS, shadow: false });
    this.whistleBeak.rotation.set(0, PI, 0);
    // clipboard: tucked under the left wing, or held up to read
    this.board = this.mesh(G.board, this.gripL);
    this.boardTuck = this.mesh(G.board, this.chest, { x: 6.2 * VS, y: 0.6 * VS, z: -1.2 * VS });
    this.boardTuck.rotation.set(0.1, PI / 2 + 0.25, -0.12);
    // sprites
    this.tweet = new THREE.Sprite(spriteMatPal(TWEET_ROWS, TWEET_PAL)); this.tweet.visible = false; this.space.add(this.tweet);
    this.tears = [0, 1].map(() => { const s = new THREE.Sprite(spriteMatPal(TEAR_ROWS, TEAR_PAL)); s.visible = false; s.scale.setScalar(0.035); this.space.add(s); return s; });
    this.puffs = [0, 1, 2].map(() => this.sprite(PUFF_ROWS, 0.06, this.space));
    this.notes = [0, 1].map(() => this.sprite(NOTE_ROWS, 0.07, this.space));
    this.sparks = [0, 1, 2].map(() => this.sprite(SPARK_ROWS, 0.07, this.space));
    this.bang = this.sprite(BANG_ROWS, 0.09, this.space);
    this.drops = [0, 1, 2].map(() => this.sprite(DROPLET_ROWS, 0.04, this.space));
    for (const n of ['tweet', 'tear', 'puff', 'notes', 'spark', 'bang', 'board', 'whistle', 'drops']) this.scalar(n, 0);
    this.jiggle('cap', 'rx', { k: 200, c: 9, az: -0.5, ay: 0.3, max: 0.3, probe: 'head' });
    this.jiggle('chest', 's', { k: 220, c: 9, ay: 0.05, max: 0.07, probe: 'hips' });
    this.jiggle('head', 's', { k: 260, c: 10, ay: 0.04, max: 0.06, probe: 'chest' });
    this.jiggle('tail', 'rx', { k: 150, c: 7, az: 0.3, ay: 0.3, max: 0.4, probe: 'hips' });
    this.jiggle('tail', 'ry', { k: 140, c: 7, ax: 0.4, yaw: 0.02, max: 0.4, probe: 'hips' });
    this._init(ANIMS, EXPRS, 'idle');
  }
  _post(p, dt) {
    this._setHands(p);
    const k = this.k, tz = this.time;
    const wb = k.whistle > 0.5;
    this.whistleBeak.visible = wb; this.whistleChest.visible = !wb;
    const bd = k.board > 0.5;
    this.board.visible = bd; this.boardTuck.visible = !bd;
    if (bd) { orientIn(this.board, this.chest, [0, 0.85, 0.5], [0, -0.5, 0.85], 1); this.board.position.set(0, 0, 0.02); }
    this.headFx.updateWorldMatrix(true, false);
    _w.set(0, BEAK[0] * VS, (BEAK[1] + 4) * VS); this.headFx.localToWorld(_w); this.space.worldToLocal(_w);
    _w2.set(0, 6 * VS, 3 * VS); this.headFx.localToWorld(_w2); this.space.worldToLocal(_w2);
    this.tweet.visible = k.tweet > 0.05;
    if (this.tweet.visible) {
      const u = clamp(k.tweet, 0, 1);
      this.tweet.position.set(_w.x + 0.2 + u * 0.12, _w.y + 0.1 + u * 0.08 + sin(tz * 40) * 0.01, _w.z);
      this.tweet.scale.set(0.3 * min(1, u * 3), 0.07 * min(1, u * 3), 1);
    }
    this.tears.forEach((s, i) => {
      const u = ((tz * 0.7 + i * 0.5) % 1);
      s.visible = k.tear > 0.5;
      s.position.set(_w2.x + (i ? 0.17 : -0.17), _w2.y - 0.06 - u * 0.22, _w2.z + 0.05);
    });
    this.puffs.forEach((s, i) => {
      const u = ((tz * 1.1 + i * 0.33) % 1);
      s.visible = k.puff > 0.5;
      s.position.set(_w.x + (i - 1) * 0.08 + u * 0.1, _w.y + u * 0.25, _w.z + 0.05);
      s.scale.setScalar(0.05 + u * 0.04);
    });
    this.notes.forEach((s, i) => {
      const u = (tz * 0.5 + i * 0.5) % 1;
      s.visible = k.notes > 0.5;
      s.position.set(_w2.x + 0.18 + u * 0.12, _w2.y + 0.12 + u * 0.3, _w2.z);
      s.scale.setScalar(0.065 * (u < 0.8 ? 1 : (1 - u) / 0.2) * min(1, u * 6));
    });
    const sp = k.spark;
    this.sparks.forEach((s, i) => {
      s.visible = sp > 0.05;
      const a = i * 2.1 + tz * 1.5;
      s.position.set(_w2.x + cos(a) * 0.38, _w2.y + 0.16 + sin(a * 1.3) * 0.12, _w2.z + sin(a) * 0.1);
      s.scale.setScalar(0.07 * sin(clamp(sp, 0, 1) * PI) * (0.7 + 0.3 * sin(tz * 9 + i)));
    });
    this.bang.visible = k.bang > 0.05;
    this.bang.position.set(_w2.x + 0.1, _w2.y + 0.42, _w2.z - 0.05);
    this.bang.scale.setScalar(0.1 * clamp(k.bang * 1.4, 0, 1));
    this.drops.forEach((s, i) => {
      const u = ((tz * 1.6 + i * 0.33) % 1);
      s.visible = k.drops > 0.5;
      s.position.set((i - 1) * 0.12, 0.25 + u * 0.4, -0.2 - u * 0.15);
    });
  }
  _updateFace(dt, f, def) {
    super._updateFace(dt, f, def);
    const st = this._fst;
    const tgt = this.k?.whistle > 0.5 ? 0.12 : BEAK_OPEN[st.mouth] || 0;
    this._beak += (tgt - this._beak) * Math.min(1, dt * 30);
    this.beakLo.rotation.x = this._beak;
  }
}

// ------------------------------------------------------------------ pose helpers
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };
const ff = (t, d) => (t > d ? t % d : t);
const _c = [0, 0];

/** Parade rest: chest out, chin up, feet planted wide. */
function stand(p, rig, t, amt = 1) {
  rig.life(t, p, amt);
  rig.stance(p, 0.2, 0.9, 0.9, 0.18);
  p.chest.rx -= 0.1; p.chest.s = 1.03; p.head.rx -= 0.04; p.head.z += 0.4;
}
/** Wings clasped behind the back. */
function atEase(p, rig, w = 1) {
  rig.reach(p, 1, 2.2, 2.6, -4.6, [1, 0.4, 0.6], w);
  rig.reach(p, -1, 2.2, 2.6, -4.6, [1, 0.4, 0.6], w);
  if (w > 0.5) { p.handL = p.handR = 'relax'; }
}
/** A wing on the hip (drill-sergeant). */
function onHip(p, rig, side, w = 1) {
  rig.reach(p, side, 6.6, 1.0, 1.0, [1, 0.6, -0.4], w);
  if (w > 0.5) { if (side > 0) { p.handL = 'fist'; p.wristL.rz = 0.6; } else { p.handR = 'fist'; p.wristR.rz = 0.6; } }
}
function saluteR(p, rig, w = 1) {
  const b = rig.headPoint(p, 7.6, 4.2, _c);
  rig.reach(p, -1, 4.0, b[0], b[1], [1, -0.2, 0.4], w);
  if (w > 0.5) { p.handR = 'open'; p.wristR.rx = -0.4; p.wristR.rz = -0.6; }
}

// ------------------------------------------------------------------ animations
def('idle', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    stand(p, rig, t);
    atEase(p, rig);
    const T = t % 13;
    // rocks on his heels, then a stern scan left... right...
    p.mover.y += max(0, sin(t * 1.6)) * 0.25 * win(T, 0, 3, 0.2, 0.3);
    p.head.ry += K(T, [[3, 0], [3.3, 0.55, 'out'], [4.6, 0.55], [4.9, -0.5, 'out'], [6.2, -0.5], [6.5, 0, 'out']]);
    f.look = [p.head.ry * 1.4, 0];
    // the chest puff (a deep proud breath)
    const puff = win(T, 7.5, 9.0, 0.4, 0.5);
    p.chest.s += puff * 0.06; p.chest.rx -= puff * 0.1; p.head.rx -= puff * 0.08;
    if (puff > 0.6) f.eyes = 'half';
    // a quiet hum of "Anchors Aweigh"
    const hum = win(T, 10, 12.2, 0.3, 0.3);
    p.k.notes = hum > 0.5 ? 1 : 0;
    if (hum > 0.3) { f.mouth = 'chew1'; p.head.rz += sin(t * 4) * 0.06; }
  },
});

def('walk', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    // a crisp waddle-march: knees high, wings swinging stiff, chest out
    const P = 0.62, ph = (t / P) * TAU, sn = sin(ph), cs = cos(ph);
    rig.walk(p, ph, 0.6);
    p.hips.y = -0.4 + abs(cs) * 0.5;
    p.hips.rz = cs * 0.12; p.chest.rz = -cs * 0.08;
    p.chest.rx = -0.08; p.head.rx = -0.06;
    p.armL.rx = sn * 0.7; p.armR.rx = -sn * 0.7; p.armL.rz = 0.15; p.armR.rz = -0.15;
    p.foreL.rx = p.foreR.rx = -0.15; p.handL = p.handR = 'fist';
    p.tail.ry = sn * 0.2;
    stepEvents(s, ph, rig);
  },
});

def('wave', {
  loop: true, dur: 2.4, expr: 'neutral',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.5);
    // the wave is a salute: snap up, hold, snap down
    const T = t % 2.4;
    const sal = K(T, [[0, 0], [0.18, 1, 'out'], [1.8, 1], [2.0, 0, 'in']]);
    saluteR(p, rig, sal);
    onHip(p, rig, 1);
    p.chest.rx -= 0.05 * sal;
    if (beat(s, 'sn', T, 99, 0.18)) rig._emit('snap');
  },
});

def('talk', {
  loop: true, expr: 'talk',
  fn(t, p, f, s, rig) {
    stand(p, rig, t, 0.7);
    const on = talkMouth(t, f, { rate: 7.2, open: 'yell', mid: 'open', shut: 'flat', o: 'o', phrase: 2.6, pause: 0.5 });
    // drill sergeant: the wing jabs at you on every phrase, the other on his hip; head jutting forward
    onHip(p, rig, 1);
    const T = t % 2.6;
    const jab = pulse(T, 0.1, 0.35) + pulse(T, 0.9, 0.3) + pulse(T, 1.6, 0.3);
    rig.reach(p, -1, 3.0, 6.4 + jab * 0.4, 7.4 + jab * 1.6, [1, -0.5, -0.3]);
    p.handR = 'point'; p.wristR.rx = -0.3;
    p.head.z += 0.6 + jab * 0.5; p.head.rx += on ? sin(t * 7.2) * 0.05 : 0;
    p.chest.rx += jab * 0.06;
    f.brows = null;
  },
});

def('laugh', {
  loop: true, expr: 'laugh',
  fn(t, p, f, s, rig) {
    // a short, barking "HAR! HAR!" and a slap on the knee
    const ha = sin(t * 10);
    stand(p, rig, t, 0.3);
    const slap = max(0, sin(t * 5));
    rig.reach(p, 1, 3.8, -1.2 + (1 - slap) * 1.6, 5.0, [0.9, -0.2, -0.6]);
    p.handL = 'open'; p.wristL.rx = 0.8;
    onHip(p, rig, -1);
    p.chest.rx += 0.1 + ha * 0.05; p.head.rx += -0.3 + ha * 0.08;
    p.mover.y += abs(ha) * 0.25; p.chest.s = 1.03 + abs(ha) * 0.03;
    f.mouth = ha > -0.2 ? 'laugh' : 'open';
  },
});

const HAPPY = 2.2;
def('happy', {
  dur: HAPPY, expr: 'proud', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, HAPPY);
    // chest puff, a hop, a salute that lands crisp
    const jump = K(t, [[0, 0], [0.2, -0.9, 'out'], [0.32, 0], [0.55, 3.2, 'out'], [0.8, 0, 'in'], [0.9, -0.6, 'out'], [1.05, 0]]);
    stand(p, rig, t, 0.4);
    p.mover.y += max(0, jump);
    if (jump > 0.2) { p.thighL.rx = p.thighR.rx = -0.3; p.shinL.rx = p.shinR.rx = 0.6; }
    const sal = win(t, 0.9, 2.0, 0.1, 0.2);
    saluteR(p, rig, sal);
    if (sal < 0.5) { rig.reach(p, -1, 7.0, 9.0, 2.0, [1, -0.6, 0.2], 1 - sal); p.handR = 'fist'; }
    onHip(p, rig, 1);
    p.chest.s += 0.05;
    p.k.spark = clamp((t - 0.4) / 1.4, 0, 1) * (t < 1.9 ? 1 : 0);
  },
});

const WH = 2.6;
def('whistle', {
  dur: WH, expr: 'shout', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, WH);
    stand(p, rig, t, 0.5);
    // the whistle up to the beak, a long TWEEEET, the wing pointing out
    const up = win(t, 0.15, 2.2, 0.2, 0.25);
    const b = rig.headPoint(p, BEAK[0] - 0.4, BEAK[1] + 3.0, _c);
    rig.reach(p, 1, lerp(2.2, 1.6, up), lerp(2.6, b[0] - 1.6, up), lerp(-4.6, b[1] + 0.6, up), [1, -0.4, -0.4]);
    p.handL = up > 0.5 ? 'fist' : 'relax';
    p.k.whistle = up > 0.7 ? 1 : 0;
    const blow = win(t, 0.6, 1.9, 0.05, 0.1);
    p.k.tweet = blow > 0.1 ? clamp((t - 0.6) / 0.4, 0, 1) : 0;
    p.chest.s += blow * 0.08; p.head.rx -= blow * 0.12;
    p.mover.y += blow * abs(sin(t * 30)) * 0.12;
    rig.reach(p, -1, 9.6, 7.6, 3.6, [1, -0.6, 0.2], win(t, 0.8, 2.3, 0.15, 0.25));
    if (t > 0.8 && t < 2.3) { p.handR = 'point'; }
    else atEase(p, rig, 0.6);
    f.eyes = blow > 0.5 ? 'wide' : null;
    if (beat(s, 'tw', t, 99, 0.6)) rig._emit('tweet');
  },
});

const PU = 5.4;
def('pushups', {
  dur: PU, expr: 'neutral', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, PU);
    rig.life(t, p, 0.3);
    // drop to the plank, three push-ups (counting), spring back up
    const down = K(t, [[0.2, 0], [0.8, 1, 'io'], [4.4, 1], [5.0, 0, 'out']]);
    const rep = K(t, [[0.9, 0], [1.3, 1, 'io'], [1.7, 0, 'io'], [2.2, 1, 'io'], [2.6, 0, 'io'], [3.1, 1, 'io'], [3.6, 0, 'io']]);
    p.mover.rx = down * 1.38;
    p.mover.y += down * (2.6 - rep * 1.4);
    p.mover.z -= down * 2.6;
    if (down < 0.5) rig.stance(p, 0.2, 0.9, 0.9, 0.18);
    else { p.thighL.rx = p.thighR.rx = 0.05; p.shinL.rx = p.shinR.rx = 0.05; p.thighL.rz = 0.05; p.thighR.rz = -0.05; }
    // wings: planted under the shoulders, bending on the way down
    const c = rig.toChest(p, 0, 2.4, _c);
    for (const side of [1, -1]) rig.reach(p, side, 6.0, lerp(2.6, c[0], down), lerp(-4.6, c[1], down), [1, 0.8, -0.2], 1);
    p.handL = p.handR = 'open';
    p.head.rx -= down * 1.0;
    f.mouth = rep > 0.6 ? 'yell' : 'flat';
    if (rep > 0.6 && down > 0.5) f.eyes = 'focused';
    for (const at of [1.3, 2.2, 3.1]) if (beat(s, 'c' + at, t, 99, at)) rig._emit('count');
  },
});

const CB = 3.8;
def('clipboard', {
  dur: CB, expr: 'think', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, CB);
    stand(p, rig, t, 0.5);
    const up = win(t, 0.2, 3.4, 0.3, 0.3);
    p.k.board = up > 0.2 ? 1 : 0;
    rig.reach(p, 1, lerp(2.2, 2.0, up), lerp(2.6, 5.0, up), lerp(-4.6, 7.6, up), [1, -0.4, -0.6]);
    p.handL = 'fist';
    // the other wingtip runs down the list... and TICKS
    const tick = pulse(t, 2.2, 0.3);
    const run = clamp((t - 0.8) / 1.4, 0, 1);
    rig.reach(p, -1, lerp(2.2, 0.8, up), lerp(2.6, 8.6 - run * 2.4 - tick * 0.6, up), lerp(-4.6, 9.0, up), [1, -0.4, -0.6]);
    p.handR = up > 0.5 ? 'point' : 'relax';
    p.head.rx += up * 0.2; f.look = [0, up];
    if (t > 2.4 && t < 3.2) { f.expr = 'proud'; }
    if (beat(s, 'tk', t, 99, 2.25)) rig._emit('tick');
  },
});

const SL = 2.4;
def('salute', {
  dur: SL, expr: 'neutral', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, SL);
    stand(p, rig, t, 0.3);
    const sal = K(t, [[0, 0], [0.15, 1, 'out'], [2.0, 1], [2.25, 0, 'in']]);
    saluteR(p, rig, sal);
    rig.reach(p, 1, 5.6, -0.6, 1.0, [1, 0.4, -0.4]); p.handL = 'open'; // the other wing stiff at his side
    p.mover.y += pulse(t, 0.05, 0.25) * 0.4;
    if (beat(s, 'sn', t, 99, 0.15)) rig._emit('snap');
  },
});

const CR = 5.0;
def('cry', {
  dur: CR, expr: 'sad', next: 'idle',
  fn(t, p, f, s, rig) {
    t = ff(t, CR);
    stand(p, rig, t, 0.5);
    // a tear... he wipes it with a wingtip, sniffs, pulls himself together with a salute
    const wipe = win(t, 1.0, 2.6, 0.3, 0.3);
    const sal = win(t, 3.4, 4.8, 0.15, 0.25);
    const e = rig.headPoint(p, EYE_Y, 5.2, _c);
    rig.reach(p, 1, lerp(2.2, 2.4 + sin(t * 8) * 0.5 * wipe, wipe), lerp(2.6, e[0] - 0.4, wipe), lerp(-4.6, e[1] + 0.6, wipe), [1, -0.5, -0.2]);
    p.handL = wipe > 0.5 ? 'relax' : 'relax';
    if (sal > 0.05) saluteR(p, rig, sal); else rig.reach(p, -1, 2.2, 2.6, -4.6, [1, 0.4, 0.6]);
    p.k.tear = t < 3.2 ? 1 : 0;
    p.head.rx += 0.15 * (1 - sal); p.chest.s += pulse(t, 2.8, 0.4) * 0.06;
    if (sal > 0.5) { f.expr = 'proud'; f.mouth = 'flat'; }
    if (beat(s, 'sf', t, 99, 2.8)) rig._emit('sniff');
  },
});

def('swim', {
  loop: true, expr: 'neutral',
  fn(t, p, f, s, rig) {
    // underwater: body flat, head up, wings tucked to the flanks, the paddle feet doing all the work
    const ph = t * 7.5;
    p.mover.rx = 1.35;
    p.mover.y += 3.4; p.mover.z -= 3.0;
    p.mover.y += sin(ph * 0.5) * 0.3;
    p.head.rx -= 1.15; p.head.z += 0.8;
    p.chest.rx -= 0.1;
    for (const side of [1, -1]) rig.reach(p, side, 5.4, 1.6, -2.6, [1, 0.4, 0.4], 1);
    p.handL = p.handR = 'relax';
    p.thighL.rx = 0.9 + sin(ph) * 0.5; p.thighR.rx = 0.9 + sin(ph + PI) * 0.5;
    p.shinL.rx = 0.3 + max(0, -sin(ph)) * 0.8; p.shinR.rx = 0.3 + max(0, sin(ph)) * 0.8;
    p.thighL.rz = 0.25; p.thighR.rz = -0.25;
    p.tail.rx = 0.4 + sin(ph) * 0.1;
    f.look = [0, -0.3];
    if (beat(s, 'pd', t, TAU / 7.5, 0)) rig._emit('paddle');
  },
});

export { ANIMS as BUFF_ANIMS };
