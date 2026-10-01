// Voxel props for the fog villagers (Granny Ribbit, Professor Hoot, Rocco,
// Grandpa Shellby) plus a few small helpers their rigs share. Fine 0.025
// voxels, Lambert + grain, geometry built lazily and shared between copies
// (don't dispose it). Every maker returns a THREE.Group with shadows, origin at
// the bottom centre, front = +Z, sized for 1-unit tiles.
//
//   makeRockingChair()   granny's rocker (+ granny-square blanket). FrogGranny.useChair(chair) rocks it;
//                        or call rockChair(chair, angle) yourself. ROCKING_CHAIR_SEAT = seat height.
//   makeBugJarShelf()    two-tier shelf of bug jars (glowing fireflies).          ~0.72 x 0.86 x 0.26
//   makeTelescope()      brass telescope on a wooden tripod. userData.tube = the swivelling head.  ~0.75 tall
//   makeMerchantStall()  Rocco's cart: striped awning, potions, glowcaps, coins, lantern.  ~0.95 x 1.08 x 0.6
//   makeTeaTable()       low round table, teapot, two cups + saucers, maple cookies. userData.steam (spout tip).
//   makeSignpost(text)   wooden sign, text in a 3x5 pixel font on a canvas (short! '\n' for 2 lines).
import * as THREE from 'three';
import {
  FV, VoxelModel, rbox, ell, tone, hash3, buildGeo, matFor, pixTex, grainMaterial,
  sin, cos, abs, max, PI, floor, clamp,
} from './critterKit.js';
import { CritterFace } from './critterFaces.js';

// ------------------------------------------------------------------ shared villager helpers
/** CritterFace with overlay hooks drawn on top of the eyes / mouth canvases after each redraw. */
export class NpcFace extends CritterFace {
  /** ownBrows: the base face draws no brows; the eyes overlay gets them as st.ownBrows. */
  constructor(cfg, { eyes = null, mouth = null, ownBrows = false } = {}) {
    super(cfg);
    this._oe = eyes; this._om = mouth; this._ownBrows = ownBrows;
  }
  update(st) {
    if (this._ownBrows) {
      const b = st.brows || '';
      if (b !== this._lastBrows) { this._lastBrows = b; this.eyes.key = ''; }
      st = this._st2 = Object.assign(this._st2 || {}, st);
      st.ownBrows = b || null; st.brows = null;
    }
    const ek = this.eyes.key, mk = this.mouth.key;
    super.update(st);
    if (this._oe && this.eyes.key !== ek) { this._oe(this.eyes.pix, st, this.cfg); this.eyes.pix.paint(this.eyes.ctx); this.eyes.tex.needsUpdate = true; }
    if (this._om && this.mouth.key !== mk) { this._om(this.mouth.pix, st, this.cfg); this.mouth.pix.paint(this.mouth.ctx); this.mouth.tex.needsUpdate = true; }
  }
}

/**
 * Dialogue mouth flaps: syllables at `rate` per second in phrases with short pauses.
 * Returns 1 while speaking, 0 in a pause (handy for gesture accents).
 */
export function talkMouth(t, f, { rate = 7.5, open = 'open', mid = 'grin', shut = 'smile', o = 'o', phrase = 3.1, pause = 0.55 } = {}) {
  const u = t % phrase;
  if (u > phrase - pause) { f.mouth = shut; return 0; }
  const k = floor(t * rate);
  const h = hash3(k, 17, 3);
  f.mouth = h < 0.38 ? open : h < 0.7 ? mid : h < 0.84 ? o : shut;
  return 1;
}
/** 'step' events on each foot fall of a walk phase. */
export function stepEvents(s, ph, rig, name = 'step') {
  const k = Math.floor(ph / PI + 0.5);
  if (s.step !== undefined && k !== s.step) rig._emit(name);
  s.step = k;
}

const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sq = new THREE.Quaternion(), _sq2 = new THREE.Quaternion(), _sy = new THREE.Vector3(0, 1, 0);
/**
 * Keep a hand-held stick (cane, staff) planted: `stick` is a child of a grip whose
 * shaft runs along its own -Y for `L` world units. Blends from the rigid in-hand
 * orientation `restQ` (w = 0) to pointing at the ground (w = 1); if the grip is lower
 * than L the tip slides out along `lean` (root-space [x, z]); `lift` raises the tip off the ground.
 */
export function plantStick(stick, root, L, lean = [0, 1], w = 1, restQ = null, lift = 0) {
  const parent = stick.parent;
  parent.updateWorldMatrix(true, false);
  _sa.setFromMatrixPosition(parent.matrixWorld);
  root.worldToLocal(_sa);
  const h = _sa.y - lift, d = h < L ? Math.sqrt(L * L - h * h) : 0;
  const ll = Math.hypot(lean[0], lean[1]) || 1;
  _sb.set(_sa.x + (lean[0] / ll) * d, h >= L ? _sa.y - L : lift, _sa.z + (lean[1] / ll) * d);
  _sb.sub(_sa).normalize().negate();
  _sq.setFromUnitVectors(_sy, _sb);
  root.getWorldQuaternion(_sq2); _sq.premultiply(_sq2);
  parent.getWorldQuaternion(_sq2).invert(); _sq.premultiply(_sq2);
  if (restQ && w < 1) stick.quaternion.copy(restQ).slerp(_sq, clamp(w, 0, 1));
  else stick.quaternion.copy(_sq);
}

const _om = new THREE.Matrix4(), _ox = new THREE.Vector3(), _oy = new THREE.Vector3(), _oz = new THREE.Vector3(), _oq = new THREE.Quaternion(), _oq2 = new THREE.Quaternion();
/**
 * Orient a held prop relative to a reference joint (e.g. the chest) regardless of the
 * hand's IK twist: the prop's local +Y goes along `y` and +Z along `z` (frame space).
 * w blends from `restQ` (its rigid in-hand orientation) to the aimed one.
 */
export function orientIn(obj, frame, y, z, w = 1, restQ = null) {
  _oy.set(y[0], y[1], y[2]).normalize();
  _oz.set(z[0], z[1], z[2]);
  _oz.addScaledVector(_oy, -_oz.dot(_oy)).normalize();
  _ox.crossVectors(_oy, _oz);
  _om.makeBasis(_ox, _oy, _oz);
  _oq.setFromRotationMatrix(_om);
  obj.parent.updateWorldMatrix(true, false);
  frame.getWorldQuaternion(_oq2); _oq.premultiply(_oq2);
  obj.parent.getWorldQuaternion(_oq2).invert(); _oq.premultiply(_oq2);
  if (restQ && w < 1) obj.quaternion.copy(restQ).slerp(_oq, clamp(w, 0, 1));
  else obj.quaternion.copy(_oq);
}

// little sprite rows (critterKit SPRITE_PAL: k w b B r R D y Y)
export const PUFF_ROWS = ['..w.', '.wb.', '.w..', 'bw..', '.wb.', '..w.', '..b.'];
export const NOTE_ROWS = ['...kk', '..kyk', '..kk.', '..k..', 'kkk..', 'kyk..', 'kkk..'];
export const BANG_ROWS = ['.kkk.', '.kyk.', '.kyk.', '.kyk.', '.kkk.', '.kyk.', '.kkk.'];
export const COIN_ROWS = ['.kkk.', 'kyYyk', 'kYyyk', 'kyyyk', '.kkk.'];
export const DROPLET_ROWS = ['..k..', '.kbk.', 'kbwbk', 'kbbBk', '.kkk.'];

// ------------------------------------------------------------------ prop plumbing
const geoMemo = new Map();
function memoGeo(key, build, pivot = [0, 0, 0], scale = FV) {
  let g = geoMemo.get(key);
  if (!g) { g = buildGeo(build(), pivot, scale); geoMemo.set(key, g); }
  return g;
}
function meshOf(geo, { shadows = true, emissive = 0, amount = 0.08 } = {}) {
  const m = new THREE.Mesh(geo, emissive ? grainMaterial(geo.userData.scale, geo.userData.grain, amount, emissive) : matFor(geo, amount));
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}
function group(name, ...meshes) {
  const g = new THREE.Group();
  g.name = name;
  for (const m of meshes) g.add(m);
  return g;
}

const W = {
  wood: 0xa8743e, woodD: 0x86582c, woodL: 0xc48c52, woodDD: 0x5e3c1e,
  oak: 0xc89a5a, oakD: 0xa0763a, oakL: 0xdcb070,
  grey: 0x8a8478, greyD: 0x6a645a, iron: 0x3a3a42, ironL: 0x5a5a66,
  brass: 0xe0b040, brassD: 0xb08020, brassL: 0xffe080,
  glass: 0xc8ecf0, glassD: 0xa0d0dc, glassL: 0xf2feff, cork: 0xc89060, corkD: 0xa06e40,
  white: 0xfaf6ea, whiteD: 0xe0dac8, cream: 0xf4e8c8, creamD: 0xdccca4,
  plum: 0x6a3a8a, plumD: 0x522a6e, plumL: 0x8a5aaa, gold: 0xffd23a, goldD: 0xd8a020, goldL: 0xfff0a0,
  red: 0xd8403a, redD: 0xa82a28, green: 0x4caa3c, greenD: 0x2e7a2c, greenL: 0x7acc5a,
  blue: 0x3a7ad8, blueD: 0x2a5aa8, blueL: 0x8ab8f0, pink: 0xf08aa8, lilac: 0xb89ad8, lilacD: 0x9a7cc0, yellow: 0xffd84a, orange: 0xf08a2a,
  ink: 0x2a2028, glow: 0xfff27a, glowD: 0xe8c840, teal: 0x3ab8b0, shroom: 0x6ad8f0, shroomD: 0x3a9ac8,
};
const plank = (x, y, z) => tone(x, y, z, W.wood, W.woodD, W.woodL, 0.14, 0.1);
const oakc = (x, y, z) => tone(x, y, z, W.oak, W.oakD, W.oakL, 0.14, 0.1);

// ------------------------------------------------------------------ rocking chair
/** Seat (cushion top) height of makeRockingChair, world units. FrogGranny's 'sit_knit' is posed for it. */
export const ROCKING_CHAIR_SEAT = 0.3;
const ROCK_R = 40; // rocker arc radius (fine voxels)
/** Rocker arc radius of makeRockingChair (world units). */
export const ROCKING_CHAIR_R = ROCK_R * FV;
function rockingChairModel() {
  const v = new VoxelModel();
  const S = 10; // seat board y; cushion on top at S + 1 => top surface (S + 2) * FV = 0.3
  const X0 = -15, X1 = 14, Z0 = -9, Z1 = 8;
  // rockers: arcs along z, two voxels tall
  for (const x of [X0, X1])
    for (let z = -17; z <= 15; z++) {
      const y = Math.round(ROCK_R - Math.sqrt(ROCK_R * ROCK_R - z * z));
      v.set(x, y, z, W.woodD); v.set(x, y + 1, z, plank(x, y + 1, z));
      if (z === -17 || z === 15) v.set(x, y + 2, z, W.woodL); // curled tips
    }
  // legs
  for (const x of [X0, X1])
    for (const z of [Z0 + 1, Z1 - 1]) {
      const y0 = Math.round(ROCK_R - Math.sqrt(ROCK_R * ROCK_R - z * z)) + 2;
      for (let y = y0; y < S; y++) v.set(x, y, z, y === y0 + 2 ? W.woodL : plank(x, y, z));
    }
  // side stretchers
  for (const x of [X0, X1]) for (let z = Z0 + 1; z <= Z1 - 1; z++) v.set(x, 4, z, W.woodD);
  // seat
  for (let x = X0; x <= X1; x++) for (let z = Z0; z <= Z1; z++) v.set(x, S, z, (x === X0 || x === X1 || z === Z1) ? W.woodD : oakc(x, S, z));
  for (let x = X0; x <= X1; x++) v.set(x, S - 1, Z1, W.woodD);
  // knitted cushion (lilac / pink checks, little tie bows)
  for (let x = X0 + 2; x <= X1 - 2; x++)
    for (let z = Z0 + 2; z <= Z1 - 1; z++) {
      const ck = (floor((x + 20) / 3) + floor((z + 20) / 3)) % 2;
      v.set(x, S + 1, z, (x === X0 + 2 || x === X1 - 2 || z === Z1 - 1 || z === Z0 + 2) ? W.lilacD : ck ? W.lilac : 0xf2c8dc);
    }
  // arms: posts + rests
  for (const x of [X0, X1]) {
    for (let y = S + 1; y <= S + 8; y++) v.set(x, y, Z1 - 2, plank(x, y, Z1 - 2));
    for (let z = Z0 - 1; z <= Z1; z++) { v.set(x, S + 9, z, z === Z1 ? W.woodL : oakc(x, S + 9, z)); }
    v.set(x + (x < 0 ? -1 : 1), S + 9, Z1 - 1, W.woodD); v.set(x + (x < 0 ? -1 : 1), S + 9, Z1, W.oak);
  }
  // back: two tilted posts, spindles, a curved top rail
  const back = (k) => Z0 - Math.round(k * 0.2);
  for (let k = 0; k <= 30; k++) {
    const y = S + 1 + k, z = back(k);
    for (const x of [X0, X1]) { v.set(x, y, z, plank(x, y, z)); if (k >= 29) v.set(x, y + 1, z, W.woodL); }
    if (k >= 3 && k <= 25) for (let x = X0 + 3; x <= X1 - 3; x += 4) v.set(x, y, z, k % 7 === 0 ? W.woodL : W.wood);
  }
  for (let x = X0; x <= X1; x++) {
    const bump = Math.round(2 * Math.sin(((x - X0) / (X1 - X0)) * PI));
    for (let y = S + 27; y <= S + 29 + bump; y++) v.set(x, y, back(y - S - 1), y === S + 29 + bump ? W.woodL : oakc(x, y, 0));
    v.set(x, S + 2, back(1), W.woodD);
  }
  // granny-square blanket draped over the top rail
  const sq = [W.pink, W.yellow, 0x7ac8e8, W.green, W.lilac, W.orange];
  for (let x = X0 + 1; x <= X1 - 1; x++)
    for (let k = 14; k <= 31; k++) {
      const y = S + 1 + k, z = back(k) + 1;
      if (k >= 30) { v.set(x, y + 1, z - 1, W.cream); continue; }
      const cx = floor((x - X0 - 1) / 4), cy = floor((k - 14) / 4);
      const lx = (x - X0 - 1) % 4, ly = (k - 14) % 4;
      const edge = lx === 0 || ly === 0;
      const hang = x < X0 + 3 || x > X1 - 3 ? 0 : 0;
      v.set(x, y, z + hang, edge ? W.cream : sq[(cx * 3 + cy * 5) % sq.length]);
      if (lx === 2 && ly === 2) v.set(x, y, z, W.white);
    }
  for (let x = X0 + 1; x <= X1 - 1; x += 2) v.set(x, S + 14, back(13) + 1, W.cream); // fringe
  return v;
}
/** Rock a makeRockingChair() by `a` radians (positive tips forward), rolling on its rockers. */
export function rockChair(chair, a) {
  const r = chair.userData.rocker;
  if (!r) return;
  const R = ROCK_R * FV;
  r.rotation.x = a;
  r.position.set(0, R - R * cos(a), R * a - R * sin(a));
}
/** Granny's rocking chair. userData.rocker rocks (see rockChair); seat top at ROCKING_CHAIR_SEAT. */
export function makeRockingChair() {
  const rocker = group('Rocker', meshOf(memoGeo('rockchair', rockingChairModel)));
  const g = group('RockingChair', rocker);
  g.userData.rocker = rocker;
  g.userData.seat = ROCKING_CHAIR_SEAT;
  g.userData.rockR = ROCK_R * FV;
  return g;
}

// ------------------------------------------------------------------ bug jar shelf
const BUGS = [
  { glass: W.glass, bug: [[0, 0, 0xd8303a], [1, 0, 0xd8303a], [0, 1, 0x2a2028], [1, 1, 0xd8303a], [0, -1, 0x2a2028]] }, // ladybug
  { glass: 0xd4f0d0, bug: [[0, 0, 0x2e9a6a], [1, 0, 0x3ac8a0], [0, 1, 0x2e9a6a], [1, 1, 0x1e6a5a], [0, 2, 0x2a2028]] }, // beetle
  { glass: W.glass, bug: [[-1, 1, 0xf08a2a], [0, 0, 0x2a2028], [1, 1, 0xf08a2a], [-1, 0, 0xffb84a], [1, 0, 0xffb84a], [0, 1, 0x2a2028]] }, // butterfly
  { glass: 0xd8e4f8, bug: [[-1, 1, 0x8ac8f0], [0, 1, 0x3a7ad8], [1, 1, 0x8ac8f0], [0, 0, 0x3a7ad8], [0, -1, 0x3a7ad8], [0, 2, 0x2a2028]] }, // dragonfly
  { glass: 0xe8f0d8, bug: [[0, 0, 0x6aaa3a], [0, 1, 0x6aaa3a], [1, 2, 0x4a8a2a], [-1, -1, 0x4a8a2a], [1, -1, 0x4a8a2a]] }, // grasshopper
  { glass: 0xf0e8d8, bug: [[0, 0, 0x8a6a4a], [1, 0, 0x6a4a2a], [0, 1, 0x8a6a4a], [1, 1, 0xa88a5a]] }, // moth
];
function jar(v, cx, y0, cz, kind, glowOut) {
  const H = 8, R = 2.6;
  for (let y = y0; y < y0 + H; y++)
    for (let x = cx - 3; x <= cx + 2; x++)
      for (let z = cz - 3; z <= cz + 2; z++) {
        const r = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        const shoulder = y >= y0 + H - 2 ? 0.8 : 0;
        if (r > R - shoulder) continue;
        const g = kind < 0 ? 0xe0f4d8 : BUGS[kind].glass;
        v.set(x, y, z, y === y0 ? W.glassD : (x === cx - 2 && y > y0 + 1 && y < y0 + H - 2) ? W.glassL : g);
      }
  // cork / cloth lid
  for (let x = cx - 2; x <= cx + 1; x++) for (let z = cz - 2; z <= cz + 1; z++) { v.set(x, y0 + H, z, tone(x, 0, z, W.cork, W.corkD, W.cork, 0.3, 0)); }
  v.set(cx - 1, y0 + H + 1, cz - 1, W.corkD); v.set(cx, y0 + H + 1, cz, W.cork);
  // bug on the front pane
  const zf = cz + 2;
  if (kind >= 0) for (const [dx, dy, c] of BUGS[kind].bug) v.set(cx + dx - 0.5, y0 + 3 + dy, zf, c);
  else for (const [dx, dy] of [[-1, 2], [1, 4], [0, 1], [1, 2], [-1, 5]]) { glowOut.set(cx + dx, y0 + dy, zf + 0.0, W.glow); v.set(cx + dx, y0 + dy, zf, null); }
  // little paper label
  v.set(cx - 1, y0 + 1, zf, W.cream); v.set(cx, y0 + 1, zf, W.creamD);
}
function shelfModel(glow) {
  const v = new VoxelModel();
  const X0 = -15, X1 = 14, Z0 = -5, Z1 = 4, TOP = 33;
  for (const x of [X0, X1])
    for (let y = 0; y <= TOP; y++)
      for (let z = Z0; z <= Z1; z++) {
        if (y < 2 && z > Z0 + 1 && z < Z1 - 1) continue; // feet notch
        v.set(x, y, z, z === Z1 ? W.woodD : plank(x, y, z));
      }
  for (let x = X0; x <= X1; x++) for (let y = 2; y <= TOP; y++) v.set(x, y, Z0, (x + y * 3) % 11 === 0 ? W.woodDD : W.woodD); // back
  for (const y of [2, 17, TOP])
    for (let x = X0; x <= X1; x++)
      for (let z = Z0; z <= Z1 + (y === TOP ? 1 : 0); z++) v.set(x, y, z, z >= Z1 ? W.woodL : oakc(x, y, z));
  // scalloped top trim + a little pinned leaf
  for (let x = X0 + 1; x <= X1 - 1; x++) if ((x + 20) % 4 !== 0) v.set(x, TOP - 1, Z1 + 1, W.woodD);
  v.set(X1 - 3, TOP + 1, Z1 - 1, W.green); v.set(X1 - 2, TOP + 1, Z1 - 1, W.greenL); v.set(X1 - 4, TOP + 1, Z1 - 2, W.greenD);
  // jars: bottom shelf 4, top shelf 3 + a magnifying glass
  [[-10, 0], [-3, 1], [4, -1], [10, 2]].forEach(([x, k]) => jar(v, x, 3, 0, k, glow));
  [[-10, 3], [-3, -1], [3, 4]].forEach(([x, k]) => jar(v, x, 18, 0, k, glow));
  // magnifying glass leaning on the top shelf
  for (let k = 0; k < 6; k++) v.set(8 + k, 18 + Math.round(k * 0.5), 2, W.woodD);
  for (let a = 0; a < 16; a++) { const x = Math.round(12 + 3 * cos((a / 16) * PI * 2)), y = Math.round(24 + 3 * sin((a / 16) * PI * 2)); v.set(x, y, 2, W.brass); }
  for (let x = 10; x <= 13; x++) for (let y = 22; y <= 25; y++) if (Math.hypot(x + 0.5 - 12.5, y + 0.5 - 24.5) < 2.2) v.set(x, y, 2, (x + y) % 3 ? W.glass : W.glassL);
  return v;
}
/** Wooden shelf of bug jars (ladybug, beetle, butterfly, dragonfly, grasshopper, moth + two firefly jars that glow). */
export function makeBugJarShelf() {
  let glowGeo = geoMemo.get('shelf_glow');
  const geo = memoGeo('shelf', () => {
    const glow = new VoxelModel();
    const v = shelfModel(glow);
    glowGeo = buildGeo(glow, [0, 0, 0], FV);
    geoMemo.set('shelf_glow', glowGeo);
    return v;
  });
  glowGeo = geoMemo.get('shelf_glow');
  const g = group('BugJarShelf', meshOf(geo));
  const gm = meshOf(glowGeo, { emissive: 0xc8b030, shadows: false });
  gm.position.z = 0.002;
  g.add(gm);
  return g;
}

// ------------------------------------------------------------------ telescope
function tripodModel() {
  const v = new VoxelModel();
  const top = 22;
  for (const [ax, az] of [[0, 1], [0.87, -0.5], [-0.87, -0.5]])
    for (let y = 0; y <= top; y++) {
      const u = 1 - y / top, x = Math.round(ax * u * 10), z = Math.round(az * u * 10);
      v.set(x, y, z, y < 2 ? W.iron : plank(x, y, z));
      if (y === 9) v.set(x, y, z, W.brassD);
    }
  // spreader + head
  rbox(v, -2, 1, top, top + 2, -2, 1, 0.8, (x, y, z) => (y === top + 2 ? W.brassL : W.brass));
  for (let a = 0; a < 3; a++) { const x = Math.round([0, 0.87, -0.87][a] * 4), z = Math.round([1, -0.5, -0.5][a] * 4); v.set(x, 12, z, W.iron); }
  return v;
}
function tubeModel() {
  const v = new VoxelModel();
  // along +z, pivot at the mount; brass bands, wide objective at the front
  for (let z = -12; z <= 16; z++) {
    const R = z > 11 ? 3.1 : z > 4 ? 2.6 : z < -9 ? 1.6 : 2.1;
    for (let x = -4; x <= 3; x++)
      for (let y = -4; y <= 3; y++) {
        const r = Math.hypot(x + 0.5, y + 0.5);
        if (r > R) continue;
        let c = tone(x, y, z, W.brass, W.brassD, W.brassL, 0.12, 0.12);
        if (y >= 1 && x <= -1 && r > R - 1.2) c = W.brassL; // shine
        if (z === 4 || z === 11 || z === -9) c = W.brassD;
        if (z === 16 && r < R - 0.9) c = r < 1 ? W.glassL : 0x3a5a7a;
        if (z === -12) c = W.iron;
        v.set(x, y, z, c);
      }
  }
  // finder scope on top
  for (let z = 0; z <= 7; z++) { v.set(-1, 4, z, W.brassD); v.set(0, 4, z, W.brass); }
  v.set(-1, 3, 2, W.iron); v.set(-1, 3, 6, W.iron);
  return v;
}
/** Brass telescope on a wooden tripod. userData.tube: the tube group (rotate .y to swivel, .x to tilt). */
export function makeTelescope() {
  const tube = new THREE.Group();
  tube.name = 'TelescopeTube';
  tube.position.set(0, 24 * FV, 0);
  const tm = meshOf(memoGeo('scope_tube', tubeModel, [0.0, 0.0, 0]));
  tm.rotation.x = -0.45;
  tube.add(tm);
  const g = group('Telescope', meshOf(memoGeo('scope_tripod', tripodModel)), tube);
  g.userData.tube = tube;
  return g;
}

// ------------------------------------------------------------------ merchant stall
function stallModel() {
  const v = new VoxelModel();
  const X0 = -17, X1 = 16, Z0 = -10, Z1 = 9, TOP = 20;
  // cart body (planks with dark seams), front panel with a painted coin
  for (let x = X0; x <= X1; x++)
    for (let y = 5; y <= TOP; y++)
      for (let z = Z0; z <= Z1; z++) {
        const shell = x === X0 || x === X1 || z === Z0 || z === Z1 || y === 5 || y === TOP;
        if (!shell) continue;
        let c = (y - 5) % 4 === 0 ? W.woodD : plank(x, y, z);
        if (y === TOP) c = z === Z1 || x === X0 || x === X1 ? W.woodL : oakc(x, y, z);
        if ((x === X0 || x === X1) && (z === Z0 || z === Z1)) c = W.woodDD;
        v.set(x, y, z, c);
      }
  // plum skirt + gold trim along the front
  for (let x = X0; x <= X1; x++) for (let y = 10; y <= TOP - 2; y++) v.set(x, y, Z1 + 1, y === TOP - 2 || y === 10 ? W.gold : (x + 40) % 6 < 3 ? W.plum : W.plumD);
  // painted coin + fish emblem
  for (let x = -3; x <= 2; x++) for (let y = 12; y <= 17; y++) if (Math.hypot(x + 0.5, y - 14.5) < 3) v.set(x, y, Z1 + 2, Math.hypot(x + 0.5, y - 14.5) > 2 ? W.goldD : W.gold);
  v.set(-1, 15, Z1 + 3, W.goldD); v.set(0, 14, Z1 + 3, W.goldD); v.set(-1, 13, Z1 + 3, W.goldD);
  // wheels (side), axle
  for (const x of [X0 - 1, X1 + 1])
    for (let y = -1; y <= 12; y++)
      for (let z = -7; z <= 7; z++) {
        const r = Math.hypot(y - 5.5, z + 0.5);
        if (r > 6.4) continue;
        const spoke = abs(y - 5.5) < 0.6 || abs(z + 0.5) < 0.6 || abs(abs(y - 5.5) - abs(z + 0.5)) < 0.7;
        if (r > 5.2) v.set(x, y, z, r > 5.9 ? W.iron : W.woodD);
        else if (spoke || r < 1.4) v.set(x, y, z, r < 1.4 ? W.brass : W.wood);
      }
  // handles (back)
  for (const x of [X0 + 2, X1 - 2]) for (let z = Z0 - 9; z < Z0; z++) v.set(x, 9 + Math.round((Z0 - z) * 0.15), z, W.woodD);
  // awning poles
  for (const x of [X0, X1]) for (const z of [Z0, Z1]) for (let y = TOP + 1; y <= 42; y++) v.set(x, y, z, y % 5 === 0 ? W.woodD : W.wood);
  // striped awning: slopes from the back (y 44) to the front (y 39), overhangs the front, scalloped edge
  for (let z = Z0 - 1; z <= Z1 + 4; z++) {
    const y = Math.round(44 - ((z - Z0) / (Z1 + 4 - Z0)) * 5);
    for (let x = X0 - 1; x <= X1 + 1; x++) {
      const st = floor((x - X0 + 1) / 4) % 2;
      v.set(x, y, z, st ? W.cream : W.plum);
      v.set(x, y + 1, z, st ? W.creamD : W.plumD === 0 ? 0 : W.plumL);
    }
  }
  for (let x = X0 - 1; x <= X1 + 1; x++) {
    const st = floor((x - X0 + 1) / 4) % 2, ph = (x - X0 + 1) % 4;
    for (let k = 1; k <= (ph === 1 || ph === 2 ? 3 : 2); k++) v.set(x, 39 - k, Z1 + 4, st ? W.cream : W.plum);
    if (ph === 1 || ph === 2) v.set(x, 36, Z1 + 4, W.gold);
  }
  // top finial flag
  for (let y = 46; y <= 51; y++) v.set(0, y, Z0 + 2, W.woodD);
  for (let x = 1; x <= 4; x++) for (let y = 49; y <= 51 - (x > 2 ? 1 : 0); y++) v.set(x, y, Z0 + 2, W.gold);
  return v;
}
function waresModel() {
  const v = new VoxelModel();
  const y0 = 21; // counter top
  // potion bottles
  const bottle = (cx, cz, col, colD, h = 6) => {
    for (let y = y0; y < y0 + h; y++)
      for (let x = cx - 1; x <= cx + 1; x++)
        for (let z = cz - 1; z <= cz + 1; z++) {
          if (y >= y0 + h - 2 && (x !== cx || z !== cz)) continue;
          v.set(x, y, z, y >= y0 + h - 2 ? W.glass : x === cx - 1 && y > y0 ? W.glassL : (x + y + z) % 3 === 0 ? colD : col);
        }
    v.set(cx, y0 + h, cz, W.cork);
  };
  bottle(-13, 4, 0xb84ad8, 0x8a2ab0, 7); bottle(-10, 6, 0x4ad87a, 0x2aa85a, 6); bottle(-7, 3, 0xe84a5a, 0xb82a3a, 8);
  // glowcap mushrooms in a basket
  for (let x = -3; x <= 4; x++) for (let z = 1; z <= 7; z++) { v.set(x, y0, z, W.woodD); if (x === -3 || x === 4 || z === 1 || z === 7) v.set(x, y0 + 1, z, (x + z) % 2 ? W.oak : W.oakD); }
  for (const [cx, cz, h] of [[-1, 3, 3], [2, 5, 4], [0, 6, 2], [3, 2, 2]]) {
    for (let y = y0 + 1; y < y0 + h; y++) v.set(cx, y, cz, W.cream);
    for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) v.set(x, y0 + h, z, (x + z) % 2 ? W.shroom : W.shroomD);
    v.set(cx, y0 + h + 1, cz, W.shroom);
  }
  // coin pile + a little treasure chest
  for (const [x, z, y] of [[8, 5, 0], [9, 5, 0], [8, 6, 0], [9, 6, 1], [10, 5, 0], [9, 4, 0], [8, 5, 1], [7, 6, 0]]) v.set(x, y0 + y, z, (x + z + y) % 2 ? W.gold : W.goldD);
  rbox(v, 10, 15, y0, y0 + 4, -6, -1, 0.6, (x, y, z) => (y === y0 + 3 ? W.brass : (x === 10 || x === 15) ? W.woodDD : plank(x, y, z)));
  v.set(12, y0 + 2, 0, W.gold); v.set(13, y0 + 2, 0, W.gold); v.set(12, y0 + 5, -4, W.gold); v.set(14, y0 + 5, -3, W.goldL);
  // dangling trinkets under the awning: fishing lure, horseshoe, bell
  for (const [x, len, c] of [[-12, 5, W.red], [-5, 3, W.brass], [6, 6, W.teal], [12, 4, W.gold]]) {
    for (let k = 0; k < len; k++) v.set(x, 37 - k, 12, W.ink);
    v.set(x, 37 - len, 12, c); v.set(x, 36 - len, 12, c); v.set(x + 1, 37 - len, 12, c);
  }
  return v;
}
function lanternModel() {
  const v = new VoxelModel();
  rbox(v, -2, 1, -6, -1, -2, 1, 0.5, (x, y, z) => (y === -6 || y === -1 ? W.iron : (abs(x + 0.5) > 1 && abs(z + 0.5) > 1) ? W.iron : W.glow));
  v.set(-1, 0, 0, W.iron); v.set(0, 0, -1, W.iron); v.set(-1, 1, -1, W.ironL);
  return v;
}
/** Rocco's black-market cart: plum-and-cream striped awning, potions, glowcaps, gold, a lantern. */
export function makeMerchantStall() {
  const g = group('MerchantStall', meshOf(memoGeo('stall', stallModel)), meshOf(memoGeo('stall_wares', waresModel)));
  const lan = meshOf(memoGeo('stall_lantern', lanternModel), { emissive: 0x6a5a10 });
  lan.position.set(-14 * FV, 39 * FV, 12 * FV);
  g.add(lan);
  g.userData.lantern = lan;
  return g;
}

// ------------------------------------------------------------------ tea table
function teaTableModel() {
  const v = new VoxelModel();
  const T = 6; // tabletop y
  for (let x = -10; x <= 9; x++)
    for (let z = -10; z <= 9; z++) {
      const r = Math.hypot(x + 0.5, z + 0.5);
      if (r > 10) continue;
      v.set(x, T, z, r > 9 ? W.woodD : oakc(x, T, z));
      if (r > 9) v.set(x, T - 1, z, W.woodD);
      if (r < 6.5 && r > 5.5 && (x + z) % 2 === 0) v.set(x, T + 1, z, W.white); // lace doily ring
      if (r <= 5.5) v.set(x, T + 1, z, r < 5 && (floor(Math.atan2(z, x) * 3) % 2) ? W.whiteD : W.white);
    }
  for (const [x, z] of [[-6, -6], [5, -6], [-6, 5], [5, 5]]) for (let y = 0; y < T; y++) { v.set(x, y, z, plank(x, y, z)); v.set(x + 1, y, z, W.woodD); }
  return v;
}
function teapotModel() {
  const v = new VoxelModel();
  // round brown-betty teapot: glossy glaze, lid with a cream knob, spout (+z) and handle (-z)
  const g = 0x8a3a24, gD = 0x6a2a18, gL = 0xc06a48;
  ell(v, 0, 2.9, 0, 3.1, 2.8, 3.1, (x, y, z) => (y >= 4 && x <= -1 && z >= 0 ? gL : y < 1 ? gD : tone(x, y, z, g, gD, g, 0.12, 0)));
  for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) if (abs(x + 0.5) + abs(z + 0.5) < 3) v.set(x, 6, z, gD);
  v.set(-1, 7, -1, W.cream); v.set(0, 7, 0, W.cream); v.set(-1, 7, 0, W.creamD); v.set(0, 7, -1, W.cream);
  for (let k = 0; k <= 3; k++) { v.set(-1, 1 + k, 3 + k, g); v.set(0, 1 + k, 3 + k, gD); }
  v.set(-1, 5, 6, gL);
  for (let y = 2; y <= 5; y++) v.set(-1, y, -4, y === 2 || y === 5 ? gD : g);
  v.set(-1, 5, -3, g); v.set(-1, 2, -3, g);
  return v;
}
function cupModel() {
  const v = new VoxelModel();
  for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) if (Math.hypot(x + 0.5, z + 0.5) <= 2.3) v.set(x, 0, z, Math.hypot(x + 0.5, z + 0.5) > 1.6 ? W.blue : W.white); // saucer
  for (let y = 1; y <= 2; y++)
    for (let x = -1; x <= 0; x++)
      for (let z = -1; z <= 0; z++) v.set(x, y, z, y === 2 && x === 0 && z === 0 ? 0xb06a2a : y === 1 ? W.blue : W.white);
  v.set(1, 2, -1, W.white); v.set(1, 1, -1, W.white); // handle
  return v;
}
function cookiesModel() {
  const v = new VoxelModel();
  for (let x = -3; x <= 2; x++) for (let z = -3; z <= 2; z++) if (Math.hypot(x + 0.5, z + 0.5) <= 3.2) v.set(x, 0, z, W.white);
  // maple-leaf cookies
  for (const [cx, cz, y] of [[-1, -1, 1], [1, 0, 1], [0, 1, 2]]) {
    for (const [dx, dz] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) v.set(cx + dx, y, cz + dz, (dx + dz) % 2 ? 0xd8964a : 0xe8b060);
    v.set(cx, y, cz, 0xc8783a);
  }
  return v;
}
/** Low round tea table: teapot, two cups on saucers, a plate of maple cookies. userData.steam = spout tip (local). */
export function makeTeaTable() {
  const g = group('TeaTable', meshOf(memoGeo('teatable', teaTableModel)));
  const top = 8 * FV;
  const pot = meshOf(memoGeo('teapot', teapotModel));
  pot.position.set(-0.04, top, -0.05); pot.rotation.y = 0.9;
  const c1 = meshOf(memoGeo('teacup', cupModel)); c1.position.set(0.14, top, 0.09); c1.rotation.y = -0.4;
  const c2 = meshOf(memoGeo('teacup', cupModel)); c2.position.set(-0.13, top, 0.14); c2.rotation.y = 2.2;
  const ck = meshOf(memoGeo('cookies', cookiesModel)); ck.position.set(0.12, top, -0.13);
  g.add(pot, c1, c2, ck);
  g.userData.steam = new THREE.Vector3(-0.04 + sin(0.9) * 6 * FV, top + 6 * FV, -0.05 + cos(0.9) * 6 * FV);
  return g;
}

// ------------------------------------------------------------------ signpost
const FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'], '?': ['##.', '..#', '.#.', '...', '.#.'], '.': ['...', '...', '...', '...', '.#.'],
  ',': ['...', '...', '...', '.#.', '#..'], '-': ['...', '...', '###', '...', '...'], "'": ['.#.', '.#.', '...', '...', '...'],
  ':': ['...', '.#.', '...', '.#.', '...'], '&': ['.#.', '#.#', '.#.', '#.#', '.##'], '+': ['...', '.#.', '###', '.#.', '...'],
  '/': ['..#', '..#', '.#.', '#..', '#..'], '>': ['#..', '.#.', '..#', '.#.', '#..'], '<': ['..#', '.#.', '#..', '.#.', '..#'],
  '$': ['.##', '##.', '.#.', '.##', '##.'], '#': ['#.#', '###', '#.#', '###', '#.#'], ' ': ['...', '...', '...', '...', '...'],
};
const signTex = new Map();
function signTexture(lines) {
  const key = lines.join('\n');
  let e = signTex.get(key);
  if (e) return e;
  const tw = max(...lines.map((l) => l.length * 4 - 1)), th = lines.length * 6 - 1;
  const c = document.createElement('canvas');
  c.width = tw + 2; c.height = th + 2;
  const ctx = c.getContext('2d');
  lines.forEach((line, li) => {
    const x0 = 1 + Math.floor((tw - (line.length * 4 - 1)) / 2);
    [...line].forEach((ch, i) => {
      const gl = FONT[ch] || FONT['?'];
      for (let y = 0; y < 5; y++)
        for (let x = 0; x < 3; x++) {
          if (gl[y][x] !== '#') continue;
          const px = x0 + i * 4 + x, py = 1 + li * 6 + y;
          ctx.fillStyle = '#3a1e0e'; ctx.fillRect(px, py, 1, 1); // carved / burnt into the wood
        }
    });
  });
  e = { tex: pixTex(c), w: c.width, h: c.height };
  signTex.set(key, e);
  return e;
}
const signMats = new Map();
/** Wooden signpost; `text` in a 3x5 pixel font, uppercase, about 14 characters a line ('\n' for a second line). */
export function makeSignpost(text = 'HELLO', { arrow = false } = {}) {
  const lines = String(text).toUpperCase().split('\n').slice(0, 2).map((l) => l.slice(0, 18));
  const T = signTexture(lines);
  const TX = 0.0125; // world units per text texel
  const pw = Math.max(14, Math.ceil((T.w * TX) / FV) + 4), ph = Math.ceil((T.h * TX) / FV) + 3;
  const key = `sign_${pw}_${ph}_${arrow ? 1 : 0}`;
  const geo = memoGeo(key, () => {
    const v = new VoxelModel();
    const X0 = -Math.floor(pw / 2), X1 = X0 + pw - 1, Y0 = 22, Y1 = Y0 + ph - 1;
    // post
    for (let y = 0; y <= Y1 + 2; y++) for (let x = -1; x <= 0; x++) for (let z = -2; z <= -1; z++) v.set(x, y, z, y < 2 ? W.woodDD : plank(x, y, z));
    v.set(-1, Y1 + 3, -2, W.woodD); v.set(0, Y1 + 3, -1, W.woodD);
    // plank
    for (let x = X0; x <= X1 + (arrow ? 3 : 0); x++)
      for (let y = Y0; y <= Y1; y++) {
        if (arrow && x > X1) { const d = x - X1, mid = (Y0 + Y1) / 2; if (abs(y - mid) > (ph / 2) * (1 - d / 4)) continue; }
        const edge = y === Y0 || y === Y1 || x === X0 || (!arrow && x === X1);
        for (let z = 0; z <= 1; z++) v.set(x, y, z, edge ? W.woodD : (y + floor(hash3(x >> 2, y, 3) * 2)) % 3 === 0 ? W.wood : oakc(x, y, z));
      }
    // nails + a little mushroom at the foot
    v.set(X0 + 1, Y1 - 1, 2, W.ironL); v.set(X1 - 1, Y1 - 1, 2, W.ironL); v.set(X0 + 1, Y0 + 1, 2, W.iron); v.set(X1 - 1, Y0 + 1, 2, W.iron);
    v.set(2, 0, 1, W.cream); v.set(2, 1, 1, W.red); v.set(3, 1, 1, W.red); v.set(1, 1, 1, W.red); v.set(2, 2, 1, W.white);
    v.set(-3, 0, 0, W.greenD); v.set(-3, 1, 0, W.green); v.set(-4, 0, 0, W.green);
    return v;
  });
  const g = group('Signpost', meshOf(geo));
  let mat = signMats.get(T);
  if (!mat) { mat = new THREE.MeshLambertMaterial({ map: T.tex, transparent: true, alphaTest: 0.5 }); signMats.set(T, mat); }
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(T.w * TX, T.h * TX), mat);
  plane.position.set((-Math.floor(pw / 2) + pw / 2) * FV, (22 + ph / 2) * FV, 2 * FV + 0.002);
  g.add(plane);
  g.userData.text = lines.join('\n');
  return g;
}
