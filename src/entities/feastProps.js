// [v26 feast] Voxel props for the feast events (src/game/feastEvents/*): Karen's
// blond bob, a bowl of (rotten) berries with flies and stink lines, fish bones,
// a golden fish, cakes, phones, a bald eagle, bees, a raccoon, lanterns...
// Lambert + grain like every other voxel prop; geometry memoised and shared
// (never disposed). makeProp(name, opts) -> handle:
//   { obj: THREE.Object3D, update?(dt, t), dispose?(), top?: number (height of the prop) }
// Origins are at the bottom centre, front = +Z, sizes in world units (1 = a tile).
// Props for bear rig slots ('wig_bob', 'party_hat', 'shawl', 'stache') are built
// in bear voxels (0.0625) around the slot's anchor (see FeastCtx.attach).
import * as THREE from 'three';
import { VoxelModel, buildGeo, matFor, grainMaterial, spriteTexture, pixTex, tone, hash3, ell, rbox } from './critterKit.js';

const BV = 0.0625; // bear voxel (head / body anchors)
const geoMemo = new Map();
function memo(key, build, pivot = [0, 0, 0], scale = 0.03) {
  let g = geoMemo.get(key);
  if (!g) { g = buildGeo(build(), pivot, scale); geoMemo.set(key, g); }
  return g;
}
function mesh(geo, { shadow = true, emissive = 0 } = {}) {
  const m = new THREE.Mesh(geo, emissive ? grainMaterial(geo.userData.scale, geo.userData.grain, 0.08, emissive) : matFor(geo));
  m.castShadow = shadow;
  m.receiveShadow = false;
  return m;
}
const grp = (...ch) => { const g = new THREE.Group(); for (const c of ch) if (c) g.add(c); return g; };
const spCache = new Map();
function spriteOf(rows, pal, { size = 0.1, own = false } = {}) {
  let m = spCache.get(rows);
  if (!m) { m = new THREE.SpriteMaterial({ map: spriteTexture(rows, pal), alphaTest: 0.5, depthWrite: false }); spCache.set(rows, m); }
  const s = new THREE.Sprite(own ? m.clone() : m);
  const h = rows.length, w = rows[0].length;
  s.scale.set(size * (w / h), size, 1);
  return s;
}

const C = {
  wood: 0xa8743e, woodD: 0x7a4e26, woodL: 0xc89058, ink: 0x1e1418,
  blond: 0xf0c860, blondL: 0xffe6a0, blondD: 0xc8963a, blondDD: 0xa07228,
  berry: 0x3a4ab8, berryD: 0x26307a, berryL: 0x7a8ae8, leaf: 0x4caa3c, leafD: 0x2e7a2c,
  rot: 0x6a4a2a, rotD: 0x4a3018, rotG: 0x7a8a34, rotM: 0xc8d8a0, rotW: 0xe8ecd8,
  bone: 0xf2ead8, boneD: 0xd2c4a6, boneL: 0xfffaf0,
  gold: 0xffd23a, goldD: 0xe5a320, goldDD: 0xb0661a, goldL: 0xfff3a3,
  white: 0xfaf6ea, whiteD: 0xe0d8c4, red: 0xd8403a, redD: 0xa82a28, redL: 0xf07a6a,
  pink: 0xf08aa8, pinkL: 0xffc8d8, pinkD: 0xc85a80, blue: 0x3a7ad8, blueL: 0x8ab8f0, blueD: 0x24508e,
  yellow: 0xffd84a, yellowD: 0xd8a020, black: 0x1e1e24, grey: 0x8a8a96, greyD: 0x5a5a66, greyL: 0xc4c4cc,
  steel: 0xb8c0cc, steelD: 0x7a8494, mud: 0x5a3a20, mudD: 0x3e2614, mudL: 0x7a5432,
  green: 0x4caa3c, greenD: 0x2e7a2c, cream: 0xf4e8c8, creamD: 0xdccca4, brown: 0x6a4428, brownD: 0x4a2e18,
};

// ---------------------------------------------------------------- sprites (fx)
const FLY_ROWS = ['w.w', '.k.', 'kkk'];
const FLY_PAL = { k: '#16121a', w: '#dff2ff' };
const STINK_ROWS = ['.gg.', 'g...', '.gg.', '...g', '.gg.', 'g...', '.gg.', '...g'];
const STINK_PAL = { g: '#8ad04a' };
const BEE_ROWS = ['.ww.', 'kyky', 'ykyk'];
const BEE_PAL = { k: '#1e1418', y: '#ffd23a', w: '#eaf6ff' };
const FLAME_ROWS = ['...y....', '..yy..y.', '..yoy.y.', '.yoooy..', '.yorroy.', 'yorrrroy', 'yorrrroy', '.yorroy.'];
const FLAME_PAL = { y: '#ffe060', o: '#ff9a2a', r: '#e83a1a' };
const SPARK_ROWS = ['..w..', '..y..', 'wyYyw', '..y..', '..w..'];
const SPARK_PAL = { w: '#ffffff', y: '#ffe060', Y: '#fffbe0' };
const BUBBLE_ROWS = ['.kk.', 'kl.k', 'k..k', '.kk.'];
const BUBBLE_PAL = { k: '#3e2614', l: '#c8a070' };
const NOTE_ROWS = ['..kk', '..kk', '..k.', '..k.', 'kkk.', 'kkk.'];
const NOTE_PAL = { k: '#2a1a14' };

// ---------------------------------------------------------------- bowl of berries (fresh or rotten)
function bowlModel(rotten) {
  const v = new VoxelModel();
  for (let y = 0; y <= 4; y++) {
    const r = 3.6 + y * 0.75;
    for (let x = -7; x <= 7; x++) for (let z = -7; z <= 7; z++) {
      const d = Math.hypot(x, z);
      if (d > r) continue;
      if (y > 0 && d < r - 1.3 && y < 4) continue; // hollow
      v.set(x, y, z, y === 4 ? C.woodL : tone(x, y, z, C.wood, C.woodD, C.woodL, 0.18, 0.1));
    }
  }
  // the berries: a mound
  for (let i = 0; i < 46; i++) {
    const a = hash3(i, 1, 7) * Math.PI * 2, rr = Math.sqrt(hash3(i, 2, 7)) * 5.2;
    const x = Math.round(Math.cos(a) * rr), z = Math.round(Math.sin(a) * rr);
    const y = 3 + Math.round((1 - rr / 5.6) * 3 + hash3(i, 3, 7));
    const h = hash3(i, 4, 7);
    let c;
    if (!rotten) c = h < 0.25 ? C.berryD : h > 0.85 ? C.berryL : C.berry;
    else c = h < 0.3 ? C.rotD : h < 0.55 ? C.rot : h < 0.75 ? C.rotG : h < 0.9 ? C.rotM : C.rotW;
    v.set(x, y, z, c); v.set(x + 1, y, z, c); v.set(x, y, z + 1, c);
    v.set(x, y + 1, z, rotten && h > 0.8 ? C.rotW : c);
  }
  if (!rotten) { v.set(0, 8, 0, C.leaf); v.set(1, 8, 0, C.leafD); v.set(-1, 9, 0, C.leaf); }
  else { v.set(1, 8, 1, C.rotW); v.set(-2, 7, 2, C.rotM); v.set(2, 7, -2, C.rotG); }
  return v;
}

function makeBowl({ rotten = false } = {}) {
  const m = mesh(memo('bowl' + (rotten ? 'R' : ''), () => bowlModel(rotten), [0, 0, 0], 0.03));
  const g = grp(m);
  const fx = [];
  if (rotten) {
    for (let i = 0; i < 4; i++) { const s = spriteOf(FLY_ROWS, FLY_PAL, { size: 0.05 }); g.add(s); fx.push({ s, kind: 'fly', ph: i * 1.7, r: 0.16 + i * 0.05 }); }
    for (let i = 0; i < 3; i++) { const s = spriteOf(STINK_ROWS, STINK_PAL, { size: 0.16, own: true }); g.add(s); fx.push({ s, kind: 'stink', ph: i / 3 }); }
  }
  return {
    obj: g, top: 0.3,
    update(dt, t) {
      for (const f of fx) {
        if (f.kind === 'fly') {
          const a = t * (4 + f.r * 6) + f.ph;
          f.s.position.set(Math.cos(a) * f.r, 0.32 + Math.sin(t * 7 + f.ph) * 0.06 + f.r * 0.4, Math.sin(a * 1.3) * f.r);
        } else {
          const u = (t * 0.45 + f.ph) % 1;
          f.s.position.set((f.ph - 0.33) * 0.22 + Math.sin(t * 3 + f.ph * 9) * 0.03, 0.28 + u * 0.5, 0.02);
          f.s.material.opacity = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
          f.s.material.transparent = true;
          f.s.material.alphaTest = 0.05;
        }
      }
    },
    dispose() { for (const f of fx) if (f.kind === 'stink') f.s.material.dispose(); },
  };
}

// ---------------------------------------------------------------- Karen's blond bob (head anchor, bear voxels)
function wigModel() {
  const v = new VoxelModel();
  const se = (x, y, z, cx, cy, cz, rx, ry, rz, p) => Math.pow(Math.abs(x - cx) / rx, p) + Math.pow(Math.abs(y - cy) / ry, p) + Math.pow(Math.abs(z - cz) / rz, p);
  for (let x = -11; x <= 11; x++)
    for (let y = 18; y <= 33; y++)
      for (let z = -10; z <= 10; z++) {
        const flip = y <= 20 ? 1.1 : 0; // the flipped-out ends
        const out = se(x, y, z, 0, 24.6, -0.4, 9.7 + flip, 7.3, 8.2 + flip * 0.6, 2.4);
        if (out > 1) continue;
        const inner = se(x, y, z, 0, 23.5, 0.3, 8.5, 6.6, 6.9, 2.5);
        if (inner <= 1 && y < 30) continue;
        if (y < 19) continue;
        // the face stays open; bangs swept to one side across the forehead
        if (z > 1.5 && Math.abs(x) <= 7 && y < 27) continue;
        if (z > 1.5 && Math.abs(x) <= 7 && y === 27 && x > -2 && x < 5) continue;
        if (z > 6 && y < 29 && x > 3) continue;
        const lit = (y - 22) / 9 - (z + 6) / 30 - x / 30;
        const strand = (x * 3 + z * 2 + Math.floor(y / 2)) % 5 === 0;
        v.set(x, y, z, y <= 20 ? C.blondD : strand ? C.blondD : lit > 0.75 ? C.blondL : lit < 0.05 ? C.blondDD : C.blond);
      }
  // the side part
  for (let z = -2; z <= 7; z++) v.set(-2, 31, z, C.blondDD);
  return v;
}
function makeWig() {
  const m = mesh(memo('wig_bob', wigModel, [0.5, 23.5, 0.3], BV));
  return { obj: grp(m) };
}

// party hat (head anchor)
function partyHatModel() {
  const v = new VoxelModel();
  for (let y = 0; y <= 10; y++) {
    const r = 3.6 * (1 - y / 11);
    for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
      if (Math.hypot(x, z) > r + 0.2) continue;
      v.set(x, y, z, (y + Math.floor((Math.atan2(z, x) + 3.2) * 1.3)) % 3 === 0 ? C.yellow : y % 4 < 2 ? C.pink : C.blue);
    }
  }
  ell(v, 0.5, 11.5, 0.5, 1.8, 1.8, 1.8, (x, y, z) => (hash3(x, y, z) > 0.6 ? C.white : C.yellow));
  return v;
}
function makePartyHat() {
  const m = mesh(memo('party_hat', partyHatModel, [0.5, -29.5 + 23.5, 0.5], BV));
  m.position.set(0.14, 0, -0.05);
  m.rotation.z = -0.32;
  return { obj: grp(m) };
}

// fake moustache (head anchor): the incognito critic
function stacheModel() {
  const v = new VoxelModel();
  const rows = ['.kk.....kk.', 'kkkk...kkkk', 'k.kkk.kkk.k', '...kkkkk...'];
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === 'k') { v.set(i - 5, 22 - j, 10, C.black); v.set(i - 5, 22 - j, 9, C.black); } });
  return v;
}
function makeStache() { return { obj: grp(mesh(memo('stache', stacheModel, [0.5, 23.5, 0.3], BV))) }; }

// a plaid shawl over the shoulders (body anchor)
function shawlModel() {
  const v = new VoxelModel();
  for (let x = -10; x <= 10; x++) for (let y = 12; y <= 20; y++) for (let z = -8; z <= 8; z++) {
    const d = Math.pow(Math.abs(x) / 9.4, 2.2) + Math.pow(Math.abs(z) / 7.2, 2.2);
    const top = 19.5 - Math.abs(x) * 0.18;
    if (y > top) continue;
    if (d > 1 || d < 0.62) { if (!(y > top - 1.2 && d <= 1)) continue; }
    if (z > 3 && Math.abs(x) < 4 && y < 18) continue; // open at the front
    if (y < 13 + (Math.abs(x) > 6 ? 0 : 2)) continue;
    const pl = ((x + 20) % 6 < 2) || ((y + 20) % 5 < 1);
    v.set(x, y, z, pl ? 0x2e5a3a : (x + y) % 2 ? C.red : C.redD);
  }
  // fringe
  for (let x = -9; x <= 9; x += 2) v.set(x, 12, -6, C.cream);
  return v;
}
function makeShawl() { return { obj: grp(mesh(memo('shawl', shawlModel, [0.5, 17.5, 0.5], BV))) }; }

// ---------------------------------------------------------------- fish bone, golden fish, plate
function fishBoneModel() {
  const v = new VoxelModel();
  // skull
  for (const [x, y] of [[8, 1], [9, 1], [10, 0], [10, 2], [11, 1], [9, 0], [9, 2], [8, 0], [8, 2], [11, 0], [11, 2]]) v.set(x, y, 0, C.bone);
  v.set(10, 1, 1, C.ink); v.set(10, 1, -1, C.ink);
  // spine + ribs
  for (let x = -6; x <= 7; x++) { v.set(x, 1, 0, x % 2 ? C.bone : C.boneD); if (x > -5 && x < 7 && x % 2 === 0) { v.set(x, 0, 0, C.boneL); v.set(x, 2, 0, C.boneL); v.set(x, -1, 0, C.bone); v.set(x, 3, 0, C.bone); } }
  // tail fin
  for (const [x, y] of [[-7, 1], [-8, 0], [-8, 2], [-9, -1], [-9, 3], [-9, 0], [-9, 2]]) v.set(x, y, 0, C.boneD);
  return v;
}
function makeFishBone() { return { obj: grp(mesh(memo('fishbone', fishBoneModel, [0.5, 1.5, 0.5], 0.03))), top: 0.1 }; }

function goldFishModel() {
  const v = new VoxelModel();
  ell(v, 0.5, 4.5, 0.5, 7, 3.6, 2.4, (x, y, z) => (y > 5 ? (hash3(x, y, z) > 0.7 ? C.goldL : C.gold) : y < 3 ? C.goldD : C.gold));
  for (const [x, y] of [[-7, 4], [-8, 3], [-8, 5], [-9, 2], [-9, 6], [-9, 3], [-9, 5], [-9, 4], [-10, 1], [-10, 7]]) { v.set(x, y, 0, C.goldD); v.set(x, y, 1, C.goldD); }
  for (let x = -3; x <= 2; x++) v.set(x, 8, 0, C.goldDD);
  v.set(5, 5, 2, C.ink); v.set(5, 5, -2, C.ink); v.set(5, 6, 2, C.white); v.set(5, 6, -2, C.white);
  v.set(7, 4, 0, C.goldDD); v.set(7, 3, 1, C.goldDD);
  return v;
}
function makeGoldenFish() {
  const m = mesh(memo('goldfish', goldFishModel, [0.5, 4.5, 0.5], 0.03), { emissive: 0.35 });
  const g = grp(m);
  const sp = [0, 1, 2].map((i) => { const s = spriteOf(SPARK_ROWS, SPARK_PAL, { size: 0.08, own: true }); s.material.transparent = true; g.add(s); return s; });
  return {
    obj: g, top: 0.15,
    update(dt, t) {
      m.rotation.z = Math.sin(t * 9) * 0.12;
      sp.forEach((s, i) => { const u = (t * 0.9 + i / 3) % 1; s.position.set(Math.cos(i * 2.1 + t) * 0.2, 0.1 + u * 0.2, Math.sin(i * 2.1) * 0.08); s.material.opacity = Math.sin(u * Math.PI); });
    },
    dispose() { sp.forEach((s) => s.material.dispose()); },
  };
}

function plateModel() {
  const v = new VoxelModel();
  for (let x = -7; x <= 7; x++) for (let z = -7; z <= 7; z++) {
    const d = Math.hypot(x, z);
    if (d > 7.2) continue;
    v.set(x, 0, z, d > 5.8 ? C.whiteD : C.white);
    if (d > 6) v.set(x, 1, z, C.white);
  }
  // a garnish: lettuce leaf + lemon slice
  for (const [x, z] of [[-4, 2], [-5, 1], [-4, 1], [-3, 3], [-5, 2]]) v.set(x, 1, z, C.green);
  for (const [x, z] of [[4, 3], [5, 3], [4, 4], [5, 4]]) v.set(x, 1, z, C.yellow);
  return v;
}
function makePlate({ fish = 'gold' } = {}) {
  const p = mesh(memo('plate', plateModel, [0.5, 0, 0.5], 0.035));
  const f = fish === 'gold' ? makeGoldenFish() : { obj: grp(mesh(memo('platefish', () => { const v = goldFishModel(); v.paint((x, y, z, c) => (c === C.gold ? 0x7ab8d8 : c === C.goldL ? 0xc8e8f4 : c === C.goldD || c === C.goldDD ? 0x4a88b0 : c)); return v; }, [0.5, 4.5, 0.5], 0.03))) };
  f.obj.position.set(0, 0.14, 0);
  f.obj.rotation.set(0, 0.4, Math.PI / 2 * 0);
  f.obj.scale.setScalar(0.85);
  return { obj: grp(p, f.obj), update: f.update, dispose: f.dispose, top: 0.25 };
}

// ---------------------------------------------------------------- notepad, clipboard, phone, selfie stick, ring box
function notepadModel() {
  const v = new VoxelModel();
  for (let x = -4; x <= 4; x++) for (let y = 0; y <= 11; y++) { v.set(x, y, 0, y % 3 === 0 && y < 10 && x > -3 ? 0x9ab8e0 : x === -3 ? 0xf08a9a : C.white); v.set(x, y, -1, C.whiteD); }
  for (let x = -4; x <= 4; x += 2) v.set(x, 12, 0, C.steel);
  // a pencil
  for (let y = -1; y <= 9; y++) v.set(6, y, 1, y === 9 ? C.pink : y === -1 ? C.ink : y === 0 ? 0xe8c890 : C.yellow);
  return v;
}
function makeNotepad() { return { obj: grp(mesh(memo('notepad', notepadModel, [0.5, 0, 0.5], 0.022))), top: 0.28 }; }

function clipboardModel() {
  const v = new VoxelModel();
  for (let x = -5; x <= 5; x++) for (let y = 0; y <= 14; y++) v.set(x, y, 0, tone(x, y, 0, C.wood, C.woodD, C.woodL));
  for (let x = -4; x <= 4; x++) for (let y = 1; y <= 12; y++) v.set(x, y, 1, y % 3 === 1 && x > -3 && x < 4 ? 0x7a8494 : C.white);
  for (let x = -2; x <= 2; x++) { v.set(x, 14, 1, C.steel); v.set(x, 13, 1, C.steelD); }
  // a red X and a check
  v.set(-3, 10, 2, C.red); v.set(-2, 9, 2, C.red); v.set(-3, 9, 2, C.red); v.set(-2, 10, 2, C.red);
  v.set(-3, 4, 2, C.green); v.set(-2, 3, 2, C.green); v.set(-1, 4, 2, C.green); v.set(0, 5, 2, C.green);
  return v;
}
function makeClipboard() { return { obj: grp(mesh(memo('clipboard', clipboardModel, [0.5, 0, 0.5], 0.024))), top: 0.36 }; }

function phoneModel() {
  const v = new VoxelModel();
  for (let x = -3; x <= 3; x++) for (let y = 0; y <= 12; y++) { v.set(x, y, 0, C.black); v.set(x, y, 1, x > -3 && x < 3 && y > 1 && y < 11 ? (y > 7 ? 0xff6aa8 : 0x5ac8ff) : C.black); }
  v.set(0, 1, 1, C.grey);
  return v;
}
function makePhone({ glow = true } = {}) { return { obj: grp(mesh(memo('phone', phoneModel, [0.5, 0, 0.5], 0.02), { emissive: glow ? 0.25 : 0 })), top: 0.26 }; }

function selfieModel() {
  const v = new VoxelModel();
  for (let y = 0; y <= 34; y++) v.set(0, y, 0, y < 6 ? C.black : y % 6 === 0 ? C.steelD : C.steel);
  for (let x = -4; x <= 4; x++) for (let y = 34; y <= 43; y++) { v.set(x, y, 1, C.black); v.set(x, y, 0, x > -4 && x < 4 && y > 35 && y < 42 ? 0xff8ac0 : C.black); }
  // the ring light
  for (let a = 0; a < 24; a++) { const x = Math.round(Math.cos(a / 24 * Math.PI * 2) * 6), y = Math.round(38.5 + Math.sin(a / 24 * Math.PI * 2) * 6); v.set(x, y, 2, C.white); }
  return v;
}
function makeSelfieStick() {
  const m = mesh(memo('selfie', selfieModel, [0.5, 0, 0.5], 0.025), { emissive: 0.3 });
  return { obj: grp(m), top: 1.1 };
}

function ringBoxModel() {
  const v = new VoxelModel();
  for (let x = -3; x <= 3; x++) for (let y = 0; y <= 3; y++) for (let z = -3; z <= 3; z++) v.set(x, y, z, y === 3 ? 0x5a0a1a : tone(x, y, z, C.red, C.redD, C.redL));
  // the open lid, tilted back
  for (let x = -3; x <= 3; x++) for (let k = 0; k <= 3; k++) { v.set(x, 4 + k, -4, C.redD); v.set(x, 4 + k, -3 - (k > 2 ? 1 : 0), C.red); }
  // the ring + diamond
  for (const [x, y] of [[-1, 4], [1, 4], [-1, 5], [1, 5], [0, 6], [0, 3]]) v.set(x, y, 0, C.gold);
  v.set(0, 7, 0, 0xe8fcff); v.set(0, 8, 0, 0xffffff); v.set(-1, 7, 0, 0xc8f0ff); v.set(1, 7, 0, 0xc8f0ff);
  return v;
}
function makeRingBox() {
  const m = mesh(memo('ringbox', ringBoxModel, [0.5, 0, 0.5], 0.025), { emissive: 0.15 });
  const g = grp(m);
  const s = spriteOf(SPARK_ROWS, SPARK_PAL, { size: 0.09, own: true }); s.material.transparent = true; g.add(s);
  return { obj: g, top: 0.2, update(dt, t) { s.position.set(0, 0.24, 0.02); s.material.opacity = 0.5 + 0.5 * Math.sin(t * 6); s.material.rotation = t * 2; }, dispose() { s.material.dispose(); } };
}

// ---------------------------------------------------------------- cake, tissues, medkit, bucket, lunchbox, jar, extinguisher, wrench
function cakeModel() {
  const v = new VoxelModel();
  for (let x = -7; x <= 7; x++) for (let z = -7; z <= 7; z++) {
    const d = Math.hypot(x, z);
    if (d <= 7.2) v.set(x, 0, z, C.whiteD);
    for (let y = 1; y <= 5; y++) if (d <= 6.2) v.set(x, y, z, d > 5.2 ? (y === 5 || (y === 4 && hash3(x, 0, z) > 0.5) ? C.white : y === 2 ? C.pinkD : C.pink) : y === 5 ? C.white : C.pinkL);
    for (let y = 6; y <= 9; y++) if (d <= 4.1) v.set(x, y, z, d > 3.2 ? (y === 9 || (y === 8 && hash3(x, 1, z) > 0.5) ? C.white : C.pink) : y === 9 ? C.white : C.pinkL);
  }
  for (const [x, z] of [[-4, 4], [4, 4], [-5, -2], [5, -1], [0, -5]]) { v.set(x, 6, z, C.red); v.set(x, 7, z, C.redL); }
  return v;
}
function makeCake({ candles = 5 } = {}) {
  const m = mesh(memo('cake', cakeModel, [0.5, 0, 0.5], 0.035));
  const g = grp(m);
  const fl = [];
  for (let i = 0; i < candles; i++) {
    const a = (i / candles) * Math.PI * 2;
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.03), new THREE.MeshLambertMaterial({ color: [0x8ab8f0, 0xffd84a, 0xf08aa8][i % 3] }));
    c.position.set(Math.cos(a) * 0.08, 0.41, Math.sin(a) * 0.08);
    g.add(c);
    const f = spriteOf(FLAME_ROWS, FLAME_PAL, { size: 0.07, own: true });
    f.position.set(c.position.x, 0.5, c.position.z);
    g.add(f);
    fl.push({ f, c, ph: i * 1.3 });
  }
  return {
    obj: g, top: 0.55,
    out: false,
    blowOut() { this.out = true; for (const x of fl) x.f.visible = false; },
    update(dt, t) { for (const x of fl) { if (this.out) continue; const k = 0.85 + Math.sin(t * 17 + x.ph) * 0.15; x.f.scale.set(0.07 * k, 0.07 * (2 - k), 1); } },
    dispose() { for (const x of fl) { x.f.material.dispose(); x.c.geometry.dispose(); x.c.material.dispose(); } },
  };
}

function tissueModel() {
  const v = new VoxelModel();
  for (let x = -5; x <= 5; x++) for (let y = 0; y <= 5; y++) for (let z = -3; z <= 3; z++) v.set(x, y, z, (x + y) % 4 === 0 ? 0x9ad4f0 : 0x6ab8e8);
  for (const [x, y, z] of [[0, 6, 0], [-1, 7, 0], [1, 7, 0], [0, 8, 1], [0, 7, -1], [1, 8, 0], [-1, 6, 1]]) v.set(x, y, z, C.white);
  return v;
}
function makeTissues() { return { obj: grp(mesh(memo('tissues', tissueModel, [0.5, 0, 0.5], 0.03))), top: 0.27 }; }

function medkitModel() {
  const v = new VoxelModel();
  rbox(v, -5, 5, 0, 7, -3, 3, 1.2, (x, y, z) => tone(x, y, z, C.red, C.redD, C.redL));
  for (let k = -2; k <= 2; k++) { v.set(k, 4, 4, C.white); v.set(0, 4 + k, 4, C.white); v.set(k, 4, -4, C.white); v.set(0, 4 + k, -4, C.white); }
  for (let x = -2; x <= 2; x++) v.set(x, 9, 0, C.black);
  v.set(-2, 8, 0, C.black); v.set(2, 8, 0, C.black);
  return v;
}
function makeMedkit() { return { obj: grp(mesh(memo('medkit', medkitModel, [0.5, 0, 0.5], 0.03))), top: 0.3 }; }

function bucketModel(full) {
  const v = new VoxelModel();
  for (let y = 0; y <= 7; y++) {
    const r = 3.6 + y * 0.25;
    for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) {
      const d = Math.hypot(x, z);
      if (d > r) continue;
      if (y > 0 && d < r - 1.1) { if (full && y === 6) v.set(x, y, z, d < 2 ? C.blueL : C.blue); continue; }
      v.set(x, y, z, y === 7 ? C.steel : y % 3 === 0 ? C.steelD : C.greyL);
    }
  }
  for (let a = 0; a <= 8; a++) { const x = Math.round(-5 + a * 1.25), y = Math.round(8 + Math.sin((a / 8) * Math.PI) * 3); v.set(x, y, 0, C.greyD); }
  return v;
}
function makeBucket({ full = true } = {}) { return { obj: grp(mesh(memo('bucket' + (full ? 'F' : ''), () => bucketModel(full), [0.5, 0, 0.5], 0.035))), top: 0.35 }; }

function lunchboxModel() {
  const v = new VoxelModel();
  rbox(v, -6, 6, 0, 7, -3, 3, 1, (x, y, z) => (y === 4 ? C.redD : tone(x, y, z, C.blue, C.blueD, C.blueL)));
  for (let x = -3; x <= 3; x++) v.set(x, 10, 0, C.black);
  v.set(-3, 9, 0, C.black); v.set(3, 9, 0, C.black); v.set(-3, 8, 0, C.black); v.set(3, 8, 0, C.black);
  v.set(0, 4, 4, C.steel); v.set(0, 3, 4, C.steelD);
  for (const [x, y] of [[-4, 6], [-3, 6], [-4, 5]]) v.set(x, y, 4, C.yellow);
  return v;
}
function makeLunchbox() { return { obj: grp(mesh(memo('lunchbox', lunchboxModel, [0.5, 0, 0.5], 0.03))), top: 0.32 }; }

function jarModel() {
  const v = new VoxelModel();
  for (let y = 0; y <= 9; y++) for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
    const d = Math.hypot(x, z);
    if (d > 4.2) continue;
    if (d > 3.3) v.set(x, y, z, y === 9 ? C.greyL : 0xc8e8f0);
    else if (y < 7) v.set(x, y, z, hash3(x, y, z) > 0.75 ? C.goldL : hash3(x, y, z) < 0.25 ? C.goldD : C.gold);
  }
  for (let x = -2; x <= 2; x++) for (let y = 2; y <= 5; y++) v.set(x, y, 5, y === 2 || y === 5 ? C.redD : C.cream);
  return v;
}
function makeJar() { return { obj: grp(mesh(memo('jar', jarModel, [0.5, 0, 0.5], 0.035))), top: 0.36 }; }

function extModel() {
  const v = new VoxelModel();
  for (let y = 0; y <= 12; y++) for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (Math.hypot(x, z) <= 2.3) v.set(x, y, z, y === 9 ? C.white : tone(x, y, z, C.red, C.redD, C.redL));
  for (let y = 13; y <= 14; y++) v.set(0, y, 0, C.black);
  for (let z = 1; z <= 4; z++) v.set(0, 14, z, C.black);
  v.set(1, 14, 0, C.steel); v.set(2, 14, 0, C.steel);
  return v;
}
function makeExtinguisher() { return { obj: grp(mesh(memo('ext', extModel, [0.5, 0, 0.5], 0.03))), top: 0.45 }; }

function wrenchModel() {
  const v = new VoxelModel();
  for (let y = 0; y <= 9; y++) v.set(0, y, 0, C.steel);
  for (const [x, y] of [[-1, 10], [1, 10], [-1, 11], [1, 11], [-1, 12], [1, 12], [-2, 11], [2, 11]]) v.set(x, y, 0, C.steelD);
  v.set(0, -1, 0, C.red); v.set(0, 0, 0, C.red);
  return v;
}
function makeWrench() { return { obj: grp(mesh(memo('wrench', wrenchModel, [0.5, 0, 0.5], 0.03))), top: 0.3 }; }

// ---------------------------------------------------------------- mud puddle, flames, lanterns, picket sign
function mudModel() {
  const v = new VoxelModel();
  for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) {
    const a = Math.atan2(z, x), r = 10 + Math.sin(a * 3) * 1.4 + Math.sin(a * 7 + 1) * 0.8;
    const d = Math.hypot(x, z);
    if (d > r) continue;
    const h = hash3(x, 0, z);
    v.set(x, 0, z, d > r - 1.5 ? C.mudL : h > 0.85 ? C.mudL : h < 0.3 ? C.mudD : C.mud);
    if (d < r - 3 && h > 0.93) v.set(x, 1, z, C.mudD);
  }
  return v;
}
function makeMud() {
  const m = mesh(memo('mud', mudModel, [0.5, 0, 0.5], 0.05), { shadow: false });
  const g = grp(m);
  const bub = [0, 1, 2].map((i) => { const s = spriteOf(BUBBLE_ROWS, BUBBLE_PAL, { size: 0.08, own: true }); s.material.transparent = true; g.add(s); return s; });
  return {
    obj: g, top: 0.05,
    update(dt, t) { bub.forEach((s, i) => { const u = (t * 0.7 + i / 3) % 1; const a = i * 2.3 + Math.floor(t * 0.7 + i / 3) * 1.7; s.position.set(Math.cos(a) * 0.32, 0.06 + u * 0.06, Math.sin(a) * 0.32); s.scale.setScalar(0.04 + u * 0.06); s.material.opacity = u < 0.85 ? 1 : 0; }); },
    dispose() { bub.forEach((s) => s.material.dispose()); },
  };
}

function makeFlames({ n = 5, spread = 0.35, size = 0.28 } = {}) {
  const g = new THREE.Group();
  const f = [];
  for (let i = 0; i < n; i++) { const s = spriteOf(FLAME_ROWS, FLAME_PAL, { size, own: true }); g.add(s); f.push({ s, ph: i * 1.9, x: (hash3(i, 3, 1) - 0.5) * spread, z: (hash3(i, 5, 1) - 0.5) * spread }); }
  return {
    obj: g, top: size,
    level: 1,
    update(dt, t) {
      for (const x of f) {
        const k = (0.75 + Math.sin(t * 13 + x.ph) * 0.2 + Math.sin(t * 29 + x.ph * 3) * 0.08) * this.level;
        x.s.scale.set(size * 0.8 * k, size * k * 1.15, 1);
        x.s.position.set(x.x + Math.sin(t * 7 + x.ph) * 0.02, size * 0.5 * k, x.z);
        x.s.visible = this.level > 0.05;
      }
    },
    dispose() { for (const x of f) x.s.material.dispose(); },
  };
}

function lanternModel() {
  const v = new VoxelModel();
  ell(v, 0.5, 5, 0.5, 4, 4.6, 4, (x, y, z) => ((y + 20) % 3 === 0 ? 0xc84a2a : hash3(x, y, z) > 0.8 ? 0xffd08a : 0xf08a3a));
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) { v.set(x, 0, z, C.brownD); v.set(x, 10, z, C.brownD); }
  return v;
}
function makeLantern() {
  const m = mesh(memo('lantern', lanternModel, [0.5, 0, 0.5], 0.03), { emissive: 0.85 });
  return { obj: grp(m), top: 0.32, update(dt, t) { m.position.y = Math.sin(t * 1.6 + m.id) * 0.03; m.rotation.y = t * 0.3; } };
}

const SIGN_FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'], '?': ['##.', '..#', '.#.', '...', '.#.'], '!': ['.#.', '.#.', '.#.', '...', '.#.'], N: ['##.', '#.#', '#.#', '#.#', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], ' ': ['...', '...', '...', '...', '...'], P: ['##.', '#.#', '##.', '#..', '#..'],
  L: ['#..', '#..', '#..', '#..', '###'], S: ['.##', '#..', '.#.', '..#', '##.'], H: ['#.#', '#.#', '###', '#.#', '#.#'], Z: ['###', '..#', '.#.', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], U: ['#.#', '#.#', '#.#', '#.#', '###'], C: ['.##', '#..', '#..', '#..', '.##'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
  I: ['###', '.#.', '.#.', '.#.', '###'], D: ['##.', '#.#', '#.#', '#.#', '##.'], Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], F: ['###', '#..', '##.', '#..', '#..'], G: ['.##', '#..', '#.#', '#.#', '.##'],
};
const signTexCache = new Map();
function signTex(text) {
  let t = signTexCache.get(text);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = text.length * 4 + 3; c.height = 9;
  const x2 = c.getContext('2d');
  x2.fillStyle = '#f4e8c8'; x2.fillRect(0, 0, c.width, c.height);
  x2.fillStyle = '#c8403a';
  [...text].forEach((ch, i) => { const gl = SIGN_FONT[ch] || SIGN_FONT['?']; for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (gl[y][x] === '#') x2.fillRect(2 + i * 4 + x, 2 + y, 1, 1); });
  t = { tex: pixTex(c), w: c.width, h: c.height };
  signTexCache.set(text, t);
  return t;
}
function makeSign({ text = 'BREAK?' } = {}) {
  const T = signTex(String(text).toUpperCase());
  const k = 0.03;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(T.w * k, T.h * k), new THREE.MeshLambertMaterial({ map: T.tex, side: THREE.DoubleSide }));
  board.position.y = 0.62;
  const back = new THREE.Mesh(new THREE.BoxGeometry(T.w * k + 0.04, T.h * k + 0.04, 0.02), new THREE.MeshLambertMaterial({ color: C.woodD }));
  back.position.set(0, 0.62, -0.012);
  const stick = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.6, 0.035), new THREE.MeshLambertMaterial({ color: C.wood }));
  stick.position.y = 0.3;
  const g = grp(stick, back, board);
  return { obj: g, top: 0.8, dispose() { for (const m of [board, back, stick]) { m.geometry.dispose(); m.material.dispose(); } } };
}

// ---------------------------------------------------------------- critters: eagle, raccoon, bees
function eagleBodyModel() {
  const v = new VoxelModel();
  ell(v, 0.5, 4.5, 0.5, 3.4, 3.2, 6.5, (x, y, z) => (z < -4 ? C.white : tone(x, y, z, 0x5a3a22, 0x3e2614, 0x7a5232)));
  ell(v, 0.5, 6.5, 6.8, 2.8, 2.8, 2.8, (x, y, z) => (hash3(x, y, z) > 0.8 ? C.whiteD : C.white)); // the white head
  for (const [x, y, z] of [[0, 6, 9], [0, 5, 9], [1, 6, 9], [0, 6, 10], [0, 5, 10], [0, 4, 10], [1, 5, 9]]) v.set(x, y, z, C.yellow); // hooked beak
  v.set(-2, 7, 8, C.ink); v.set(2, 7, 8, C.ink); v.set(-2, 8, 8, 0xffd84a); v.set(2, 8, 8, 0xffd84a); // fierce eyes
  for (let x = -2; x <= 3; x++) for (let z = -11; z <= -6; z++) if (Math.abs(x - 0.5) < 3.5 - (z + 11) * 0.2) v.set(x, 4, z, C.white); // fan tail
  for (const x of [-1, 2]) for (let y = 0; y <= 1; y++) v.set(x, y, 1, C.yellow); // talons
  return v;
}
function eagleWingModel() {
  const v = new VoxelModel();
  for (let x = 0; x <= 17; x++) {
    const w = Math.round(6 - x * 0.18);
    for (let z = -w; z <= 2; z++) v.set(x, 0, z, x > 13 && z < -2 ? 0x2e1a0e : (x + z) % 5 === 0 ? 0x3e2614 : 0x5a3a22);
    if (x > 12 && x % 2 === 0) for (let k = 1; k <= 3; k++) v.set(x, 0, -w - k, 0x2e1a0e);
  }
  return v;
}
function makeEagle() {
  const s = 0.045;
  const body = mesh(memo('eagle_b', eagleBodyModel, [0.5, 4.5, 0.5], s));
  const wl = mesh(memo('eagle_w', eagleWingModel, [0, 0, 0], s));
  const wr = mesh(memo('eagle_w', eagleWingModel, [0, 0, 0], s));
  const pl = new THREE.Group(); pl.position.set(0.12, 0.08, 0); pl.add(wl);
  const pr = new THREE.Group(); pr.position.set(-0.12, 0.08, 0); pr.add(wr); pr.scale.x = -1;
  const g = grp(body, pl, pr);
  const claw = new THREE.Group(); claw.position.set(0, -0.12, 0.05); g.add(claw);
  return {
    obj: g, top: 0.3, claw, flap: 1,
    update(dt, t) {
      const a = Math.sin(t * (6 + this.flap * 6)) * (0.25 + this.flap * 0.55);
      pl.rotation.z = a; pr.rotation.z = a;
      body.position.y = -a * 0.04;
    },
  };
}

function raccoonModel() {
  const v = new VoxelModel();
  const fur = (x, y, z) => tone(x, y, z, 0x8a8a98, 0x6e6e7c, 0xa4a4b2);
  ell(v, 0.5, 5, 0.5, 4.2, 3.6, 6, fur); // body
  ell(v, 0.5, 4.2, 2, 3, 2.2, 3.2, (x, y, z) => (y < 4 ? 0xd8d4cc : fur(x, y, z))); // belly
  ell(v, 0.5, 8.5, 6.5, 3.6, 3.2, 3.2, fur); // head
  for (let x = -3; x <= 4; x++) { v.set(x, 9, 9, 0x2e2a36); v.set(x, 9, 8, 0x2e2a36); } // the bandit mask
  v.set(-2, 9, 10, 0xffffff); v.set(3, 9, 10, 0xffffff); v.set(-2, 10, 9, 0x2e2a36); v.set(3, 10, 9, 0x2e2a36);
  for (const [x, y, z] of [[0, 7, 10], [1, 7, 10], [0, 8, 10], [1, 8, 10], [0, 7, 11], [1, 7, 11]]) v.set(x, y, z, 0xf2f0ea); // muzzle
  v.set(0, 8, 12, C.ink); v.set(1, 8, 12, C.ink);
  for (const s of [-1, 1]) { v.set(s * 3 + 0.5, 12, 6, 0x6e6e7c); v.set(s * 3 + 0.5, 13, 6, 0x4e4e5a); v.set(s * 2 + 0.5, 12, 6, 0xd8a0a8); }
  for (let z = -6; z >= -13; z--) for (let x = -1; x <= 2; x++) for (let y = 4; y <= 7; y++) if (Math.hypot(x - 0.5, y - 5.5) <= 2) v.set(x, y + (z < -10 ? 1 : 0), z, ((z + 20) % 3 === 0) ? 0x2e2a36 : 0x9a9aa8); // ringed tail
  for (const [x, z] of [[-2, 3], [3, 3], [-2, -3], [3, -3]]) for (let y = 0; y <= 2; y++) v.set(x, y, z, 0x3a3642);
  return v;
}
function makeRaccoon() {
  const m = mesh(memo('raccoon', raccoonModel, [0.5, 0, 0.5], 0.032));
  const g = grp(m);
  const carry = new THREE.Group(); carry.position.set(0, 0.36, 0.42); g.add(carry);
  return { obj: g, top: 0.45, carry, run: 0, update(dt, t) { m.position.y = Math.abs(Math.sin(t * 16)) * 0.05 * this.run; m.rotation.z = Math.sin(t * 16) * 0.08 * this.run; } };
}

function makeBees({ n = 12, r = 0.5 } = {}) {
  const g = new THREE.Group();
  const bees = [];
  for (let i = 0; i < n; i++) { const s = spriteOf(BEE_ROWS, BEE_PAL, { size: 0.06 }); g.add(s); bees.push({ s, a: hash3(i, 1, 2) * 6.3, b: hash3(i, 2, 2) * 6.3, sp: 3 + hash3(i, 3, 2) * 4, rr: r * (0.5 + hash3(i, 4, 2) * 0.6) }); }
  return {
    obj: g, top: 0.5, r,
    update(dt, t) { for (const b of bees) { const a = b.a + t * b.sp; b.s.position.set(Math.cos(a) * b.rr * this.r / r, 0.2 + Math.sin(t * b.sp * 1.3 + b.b) * 0.25, Math.sin(a * 1.1 + b.b) * b.rr * this.r / r); } },
  };
}

function makeNotes() {
  const g = new THREE.Group();
  const ns = [0, 1, 2].map((i) => { const s = spriteOf(NOTE_ROWS, NOTE_PAL, { size: 0.12, own: true }); s.material.transparent = true; g.add(s); return s; });
  return { obj: g, top: 0.6, glitch: 0, update(dt, t) { ns.forEach((s, i) => { const u = (t * 0.6 + i / 3) % 1; s.position.set(Math.sin(u * 6 + i) * 0.2, u * 0.7, 0); s.material.opacity = 1 - u; s.material.rotation = this.glitch ? (Math.floor(t * 8) % 2 ? 0.6 : -0.6) : 0; }); }, dispose() { ns.forEach((s) => s.material.dispose()); } };
}

// ---------------------------------------------------------------- rope
function makeRope({ len = 2 } = {}) {
  const n = Math.max(2, Math.round(len / 0.06));
  const geo = new THREE.BoxGeometry(0.05, 0.05, len);
  geo.translate(0, 0, len / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xc8a060 }));
  m.castShadow = true;
  void n;
  return { obj: grp(m), top: 0.05, mesh: m, dispose() { geo.dispose(); m.material.dispose(); } };
}

const MAKERS = {
  bowl: makeBowl, wig_bob: makeWig, party_hat: makePartyHat, stache: makeStache, shawl: makeShawl,
  fishbone: makeFishBone, golden_fish: makeGoldenFish, plate: makePlate,
  notepad: makeNotepad, clipboard: makeClipboard, phone: makePhone, selfie_stick: makeSelfieStick, ring_box: makeRingBox,
  cake: makeCake, tissues: makeTissues, medkit: makeMedkit, bucket: makeBucket, lunchbox: makeLunchbox, jar: makeJar,
  extinguisher: makeExtinguisher, wrench: makeWrench, mud: makeMud, flames: makeFlames, lantern: makeLantern, sign: makeSign,
  eagle: makeEagle, raccoon: makeRaccoon, bees: makeBees, notes: makeNotes, rope: makeRope,
};
export const FEAST_PROPS = Object.keys(MAKERS);

/** makeProp(name, opts) -> { obj, update?(dt, t), dispose?(), top? } */
export function makeProp(name, opts = {}) {
  const f = MAKERS[name];
  if (!f) { console.warn('[feastProps] unknown prop', name); return null; }
  const h = f(opts);
  if (opts.scale) h.obj.scale.multiplyScalar(opts.scale);
  if (opts.rot != null) h.obj.rotation.y = opts.rot;
  h.obj.name = 'feast:' + name;
  return h;
}
