// [v26 menu] BoxStage3D: the save boxes as real 3D voxel cardboard boxes, plus
// Reynard asleep on his own box, all in ONE small three.js scene rendered low-res
// with an ink outline (the game's pixel look) into a canvas over the save-box
// screen. The DOM keeps the layout, the hit areas and the hanging tags: each box
// floats over its `.tbx-bw` placeholder, Reynard over `.tbx-nap`.
//
//   const st = createBoxStage(host, { ps, sfx, slots: [el, el, el], nap: el });   // null without WebGL
//   st.setBox(i, { empty, items, label })   // contents from saveSlots.boxItems()
//   st.hover(i, on)
//   await st.pick(i)       // a full box flies at the camera / an empty one unfolds
//   await st.toss(i, onGone)   // flaps shut, tape wraps, kicked off-screen spinning; onGone() then a fresh box drops in
//   st.poke()              // Reynard grumbles in his sleep
//   st.dispose()
import * as THREE from 'three';
import { VoxelModel, voxelMaterial } from '../core/voxel.js';
import { FoxRig } from '../entities/foxRig.js';
import { makeProp } from '../entities/feastProps.js';
import { makeTrophy } from '../entities/trophyModels.js';
import { goofyBitmap, GOOFY_SMALL } from './goofyFont.js';
import { ITEMS, IP } from './titleArt.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
function h3(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const hex = (s) => parseInt(String(s).slice(1), 16);

// ------------------------------------------------------------------ post: outline + creases, shadows pass through
const VERT = 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 size; uniform vec3 ink; uniform float cNear; uniform float cFar; uniform float crease;
varying vec2 vUv;
float A(vec2 o) { return texture2D(tColor, vUv + o).a; }
float Z(vec2 o) { return -perspectiveDepthToViewZ(texture2D(tDepth, vUv + o).x, cNear, cFar); }
void main() {
  vec2 px = 1.0 / size;
  vec4 c = texture2D(tColor, vUv);
  if (c.a < 0.9) {
    float n = max(max(A(vec2(px.x, 0.0)), A(vec2(-px.x, 0.0))), max(A(vec2(0.0, px.y)), A(vec2(0.0, -px.y))));
    gl_FragColor = n > 0.9 ? vec4(ink, 1.0) : c;
  } else {
    float z = Z(vec2(0.0));
    float zn = min(min(Z(vec2(px.x, 0.0)), Z(vec2(-px.x, 0.0))), min(Z(vec2(0.0, px.y)), Z(vec2(0.0, -px.y))));
    vec3 col = c.rgb;
    if (z - zn > crease) col = mix(col, ink, 0.6);
    gl_FragColor = vec4(col, 1.0);
  }
  #include <colorspace_fragment>
}`;

function pixTex(w, h, paint) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false;
  return t;
}

// ------------------------------------------------------------------ the box (1 unit = 1 voxel; origin = bottom centre)
const BW = 20, BD = 16, BH = 14;
const CB = { base: 0xc99558, flute: 0xbf8b4f, light: 0xdcaa6c, edge: 0xe8c48a, dark: 0xa8763f, dirt: 0x8a5a30, scuff: 0x9a6a3a, flap: 0xd6a666, flapD: 0xc49254, tape: 0xe7c37c, tapeL: 0xf6dda4, print: 0x6a4224 };
function wallColor(u, v, top, seed) {
  // u runs along the wall, v up it: vertical flutes, a cut top edge, dirt at the bottom, scuffs
  const r = h3(u, v, seed);
  if (v === top) return u % 2 ? CB.edge : CB.light;
  if (v === 0) return CB.dirt;
  if (r > 0.965) return CB.scuff;
  if (v === 1 && r > 0.6) return CB.dark;
  return u % 2 ? CB.flute : CB.base;
}
const MAT = () => voxelMaterial();
function vmesh(v, pivot) { const m = new THREE.Mesh(v.build({ pivot, scale: 1 }), MAT()); return m; }

function labelTex(text) {
  const bm = goofyBitmap(GOOFY_SMALL, text);
  return pixTex(bm.w + 4, bm.h + 5, (g) => {
    g.fillStyle = '#231512';
    bm.rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') g.fillRect(2 + x, 1 + y, 1, 1); });
    for (let x = 1; x < bm.w + 3; x++) g.fillRect(x, bm.h + 2 + (x > bm.w * 0.6 ? 1 : 0), 1, 1); // the underline swoosh
  });
}

function buildBox(seed, label) {
  const root = new THREE.Group(); // bob / spin / kick
  const body = new THREE.Group(); // squash
  root.add(body);
  // bottom
  const vb = new VoxelModel();
  vb.box(-9, 0, -7, 8, 0, 6, (x, y, z) => (h3(x, z, seed) > 0.9 ? CB.dark : CB.base));
  body.add(vmesh(vb, [0, 0, 0]));
  const walls = [], flaps = [];
  // front (+z) / back (-z): full width, one voxel taller; sides between them
  const mk = (side) => {
    const v = new VoxelModel();
    const piv = new THREE.Group();
    let pivot;
    if (side === 'front' || side === 'back') {
      const z = side === 'front' ? 7 : -8, top = BH;
      for (let x = -10; x <= 9; x++) for (let y = 0; y <= top; y++) v.set(x, y, z, wallColor(x + 10, y, top, seed + (side === 'front' ? 1 : 2)));
      if (side === 'front') {
        // a torn strip of tape hanging from the top
        for (let x = -2; x <= 1; x++) for (let y = top - (x === -1 ? 5 : x === 0 ? 4 : 3); y <= top; y++) v.set(x, y, 8, x === -2 ? CB.tapeL : CB.tape);
      }
      pivot = [0, 0, side === 'front' ? 8 : -8];
      piv.position.set(0, 0, pivot[2]);
    } else {
      const x = side === 'right' ? 9 : -10, top = BH - 1;
      for (let z = -7; z <= 6; z++) for (let y = 0; y <= top; y++) v.set(x, y, z, wallColor(z + 7, y, top, seed + (side === 'right' ? 3 : 4)));
      if (side === 'right') {
        // THIS SIDE UP arrows, printed
        for (const az of [-4, 4]) {
          for (let y = 4; y <= 9; y++) v.set(x, y, az, CB.print);
          v.set(x, 8, az - 1, CB.print); v.set(x, 8, az + 1, CB.print); v.set(x, 7, az - 2, CB.print); v.set(x, 7, az + 2, CB.print);
        }
      }
      pivot = [side === 'right' ? 10 : -10, 0, 0];
      piv.position.set(pivot[0], 0, 0);
    }
    piv.add(vmesh(v, pivot));
    body.add(piv);
    walls.push({ side, piv });
    // the flap on its top edge
    const fv = new VoxelModel();
    const fp = new THREE.Group();
    if (side === 'front' || side === 'back') {
      const s = side === 'front' ? 1 : -1;
      // closed it lies flat over half the top, reaching inward from the hinge
      for (let x = -10; x <= 9; x++) for (let d = 0; d < BD / 2; d++) {
        const z = s > 0 ? 7 - d : -8 + d;
        if (d === BD / 2 - 1 && (x === -10 || x === 9) && h3(x, d, seed) > 0.4) continue; // a chewed corner
        const tapeC = x >= -2 && x <= 1;
        fv.set(x, BH + 1, z, tapeC && side === 'front' ? (x === -2 ? CB.tapeL : CB.tape) : (x + d) % 5 === 0 && h3(x, d, seed + 9) > 0.5 ? CB.flapD : CB.flap);
      }
      fv.set(4, BH + 1, s > 0 ? 6 : -7, null); // a little tear
      fp.position.set(0, BH + 1, s > 0 ? 8 : -8);
      fp.add(vmesh(fv, [0, BH + 1, s > 0 ? 8 : -8]));
    } else {
      const s = side === 'right' ? 1 : -1;
      for (let z = -7; z <= 6; z++) for (let d = 0; d < 7; d++) fv.set(s > 0 ? 9 - d : -10 + d, BH, z, (z + d) % 6 === 0 ? CB.flapD : CB.flap);
      fp.position.set(s > 0 ? 10 : -10, BH, 0);
      fp.add(vmesh(fv, [s > 0 ? 10 : -10, BH, 0]));
    }
    // the flap hangs off the wall's pivot, so it rides along when the wall unfolds
    fp.position.sub(piv.position);
    piv.add(fp);
    flaps.push({ side, piv: fp });
  };
  for (const s of ['front', 'back', 'left', 'right']) mk(s);
  // SAVE n, scribbled in marker on the front
  const lt = labelTex(label);
  const lw = 12, lh = lw * lt.image.height / lt.image.width;
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), new THREE.MeshLambertMaterial({ map: lt, transparent: false, alphaTest: 0.5 }));
  lab.position.set(0.5, 4.4, 0.06);
  walls[0].piv.add(lab);
  // packing tape for the toss (hidden until then): across the seam, down the front and back
  const tapeG = new THREE.Group();
  const tm = new THREE.MeshLambertMaterial({ color: CB.tape });
  const tTop = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, BD + 1), tm); tTop.position.set(0, BH + 2.25, 0);
  const tF = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 0.5), tm); tF.position.set(0, BH - 1, BD / 2 + 0.75);
  const tB = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 0.5), tm); tB.position.set(0, BH - 1, -BD / 2 - 0.75);
  tapeG.add(tTop, tF, tB);
  tapeG.visible = false;
  body.add(tapeG);
  const contents = new THREE.Group();
  body.add(contents);
  return { root, body, walls, flaps, contents, tape: { g: tapeG, top: tTop, f: tF, b: tB }, label: lab };
}

// open angles per flap (radians from closed-flat), idle and on hover
const NAP = { yaw: -0.22, tilt: 0.1, headTilt: 0.2 }; // facing us, a touch turned; head tipped onto his paw
const OPEN = { front: 3.25, back: 1.85, left: 2.2, right: 2.2 };
function setFlaps(B, k, wob = 0) {
  for (const f of B.flaps) {
    const a = OPEN[f.side] * k + wob * (f.side === 'back' ? 0.5 : 1);
    if (f.side === 'front') f.piv.rotation.x = a;
    else if (f.side === 'back') f.piv.rotation.x = -a;
    else if (f.side === 'right') f.piv.rotation.z = -a;
    else f.piv.rotation.z = a;
  }
}
function setUnfold(B, k) {
  const a = (Math.PI / 2) * k;
  for (const w of B.walls) {
    if (w.side === 'front') w.piv.rotation.x = a;
    else if (w.side === 'back') w.piv.rotation.x = -a;
    else if (w.side === 'right') w.piv.rotation.z = -a;
    else w.piv.rotation.z = a;
  }
}

// ------------------------------------------------------------------ the stuff in the box
function extrude(rows, depth = 2) {
  const v = new VoxelModel();
  const H = rows.length;
  const at = (x, y) => (y >= 0 && y < H && x >= 0 && x < rows[y].length ? rows[y][x] : '.');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (!IP[ch]) continue;
      // the ink outline is drawn by the post pass: drop edge ink, keep inner ink (eyes, seams)
      if (ch === 'k' && (!IP[at(x + 1, y)] || !IP[at(x - 1, y)] || !IP[at(x, y + 1)] || !IP[at(x, y - 1)])) continue;
      for (let z = 0; z < depth; z++) v.set(x, H - 1 - y, z, hex(IP[ch]));
    }
  });
  return v;
}
function coinPile(n) {
  const v = new VoxelModel();
  const coin = (cx, cy, cz) => {
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
      if (x * x + z * z > 5) continue;
      const rim = x * x + z * z > 3;
      v.set(cx + x, cy, cz + z, rim ? 0xe5a320 : (x + z) % 3 === 0 ? 0xfff3a3 : 0xffd23a);
    }
  };
  const layers = n >= 3 ? [[[-4, -2], [0, -3], [4, -2], [-3, 2], [2, 2], [5, 2]], [[-2, -1], [2, -1], [0, 2]], [[0, 0], [1, 0]], [[0, 0]]] : n === 2 ? [[[-3, -1], [2, -2], [0, 2]], [[-1, 0], [1, 0]], [[0, 0]]] : [[[-1, 0], [2, 1]], [[0, 0]]];
  layers.forEach((ls, y) => ls.forEach(([x, z], i) => { coin(x, y, z); if (i % 2 === 0) coin(x, y + 0.6 | 0, z); }));
  return v;
}
function crownModel() {
  const v = new VoxelModel();
  for (let a = 0; a < 24; a++) {
    const t = (a / 24) * TAU, x = Math.round(Math.cos(t) * 4), z = Math.round(Math.sin(t) * 4);
    for (let y = 0; y <= 2; y++) v.set(x, y, z, y === 1 && a % 6 === 0 ? (a % 12 ? 0x3a7ad8 : 0xd8403a) : 0xffd23a);
    if (a % 4 === 0) { v.set(x, 3, z, 0xffd23a); v.set(x, 4, z, 0xfff3a3); }
  }
  return v;
}
function hatModel() {
  const v = new VoxelModel();
  v.ellipsoid(0, 0, 0, 4.5, 4, 4.5, (x, y) => (y < 0 ? null : y === 1 ? 0xe5a320 : 0xffd84a));
  for (let x = -6; x <= 6; x++) for (let z = -5; z <= 5; z++) if (x * x / 36 + z * z / 25 <= 1) v.set(x, 0, z, x * x / 36 + z * z / 25 > 0.65 ? 0xd8a020 : 0xffd84a);
  for (let y = 1; y <= 4; y++) v.set(0, y, 4 - (y > 3 ? 1 : 0), 0xfff3a0);
  return v;
}
function flaskModel() {
  const v = new VoxelModel();
  v.cylinder(0, 0, 0, 3.2, 5, (x, y) => (y >= 4 ? 0xb8f29a : (x + y) % 4 === 0 ? 0x8ee06a : 0x5cd24c));
  v.cylinder(0, 5, 0, 1.2, 4, 0xd8f0ff);
  v.cylinder(0, 9, 0, 1.2, 1, 0x8a5a2a);
  return v;
}
function eggModel() {
  const v = new VoxelModel();
  v.ellipsoid(0, 3.5, 0, 2.8, 3.6, 2.8, (x, y, z) => (h3(x, y, z) > 0.85 ? 0xc8bfa4 : 0xf4f0e0));
  return v;
}
function carrotModel() {
  const v = new VoxelModel();
  for (let y = 0; y < 9; y++) { const r = 0.4 + y * 0.28; v.cylinder(0, y, 0, r, 1, y % 3 === 0 ? 0xc86a1e : 0xff8a3a); }
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 1], [0, -1]]) for (let y = 9; y < 13; y++) v.set(dx * (y - 8 > 2 ? 2 : 1), y, dz * (y - 8 > 2 ? 2 : 1), y % 2 ? 0x5cd24c : 0x2a8a3a);
  return v;
}

// item id -> { make(): Object3D, h: target height (box units), at: [x, y, z], rot: [x, y, z] }
const STUFF = {
  fish: { h: 14, at: [-4, 9, -2], rot: [0, 0.5, 1.35], make: () => makeProp('fish').obj },
  goldfish: { h: 13, at: [5, 10, -3], rot: [0, -0.6, 1.2], make: () => makeProp('golden_fish').obj },
  trophy: { h: 12, at: [-1, 10, -4], rot: [0, 0.3, 0], make: () => makeTrophy({ tier: 'gold', shape: 'cup' }) },
  flask: { h: 11, at: [2, 10, -1], rot: [0.1, 0, -0.2], vox: flaskModel },
  pickaxe: { h: 14, at: [7, 10, -4], rot: [0, 0.4, 0.25], vox: () => extrude(ITEMS.pickaxe) },
  carrot: { h: 12, at: [-7, 10, -3], rot: [0.2, 0, 0.45], vox: carrotModel },
  map: { h: 9, at: [6, 12, 2], rot: [-0.5, 0.4, 0.3], vox: () => extrude(ITEMS.map) },
  gear: { h: 9, at: [-5, 12, 3], rot: [-0.3, 0.6, 0.2], vox: () => extrude(ITEMS.gear) },
  coins: { h: 8, at: [0, 12, 2], rot: [0, 0.3, 0], vox: null },
  egg: { h: 7, at: [3, 13, 3], rot: [0.2, 0, -0.3], vox: eggModel },
  beaverhat: { h: 7, at: [-3, 14, 1], rot: [0.15, 0.4, -0.2], vox: hatModel },
  crown: { h: 6, at: [0, 0, 2], rot: [0.15, 0, 0.12], vox: crownModel, onCoins: true },
  tie: { h: 10, at: [BW / 2 + 0.7, BH, 0], rot: [0, Math.PI / 2, 0.1], vox: () => extrude(ITEMS.tie), hang: true },
};
const PILE_H = [0, 6, 9, 12];
function fitTo(obj, h) {
  const b = new THREE.Box3().setFromObject(obj);
  const size = b.getSize(new THREE.Vector3());
  const k = h / Math.max(0.001, size.y, size.x * 0.8);
  obj.scale.multiplyScalar(k);
  const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
  const by = new THREE.Box3().setFromObject(obj).min.y;
  obj.position.set(-c.x, -by, -c.z);
  return obj;
}
function makeStuff(id) {
  const key = id.startsWith('coins') ? 'coins' : id;
  const S = STUFF[key];
  if (!S) return null;
  let inner;
  try {
    if (key === 'coins') { const n = +id.slice(5) || 1; inner = new THREE.Mesh(coinPile(n).build({ scale: 1 }), MAT()); }
    else if (S.vox) inner = new THREE.Mesh(S.vox().build({ scale: 1 }), MAT());
    else inner = S.make();
  } catch (e) { console.warn('box stuff', id, e); return null; }
  const holder = new THREE.Group();
  const h = key === 'coins' ? PILE_H[+id.slice(5) || 1] : S.h;
  holder.add(fitTo(inner, h));
  const g = new THREE.Group(); // bounce offset
  g.add(holder);
  g.position.set(...S.at);
  holder.rotation.set(...S.rot);
  if (S.hang) holder.position.y = -h; // hangs down over the edge
  g.userData = { base: g.position.y, v: 0, y: 0, id: key, hang: !!S.hang };
  return g;
}

// ------------------------------------------------------------------ sparkles
function sparkTex() {
  return pixTex(7, 7, (g) => {
    const rows = ['...k...', '..kwk..', '.kwyyk.', 'kwyyywk', '.kyyyk.', '..kyk..', '...k...'];
    const P = { k: '#2a160c', w: '#ffffff', y: '#ffe24a' };
    rows.forEach((r, y) => { for (let x = 0; x < 7; x++) if (P[r[x]]) { g.fillStyle = P[r[x]]; g.fillRect(x, y, 1, 1); } });
  });
}
function shadowTex() {
  return pixTex(24, 12, (g) => {
    for (let y = 0; y < 12; y++) for (let x = 0; x < 24; x++) {
      const dx = (x + 0.5 - 12) / 12, dy = (y + 0.5 - 6) / 6, d = dx * dx + dy * dy;
      if (d > 1) continue;
      g.fillStyle = `rgba(28,10,26,${d < 0.45 ? 0.5 : 0.32})`;
      g.fillRect(x, y, 1, 1);
    }
  });
}

// ------------------------------------------------------------------ the stage
export function createBoxStage(host, { ps = 3, sfx = null, slots = [], nap = null, fps = 30 } = {}) {
  let r;
  try {
    r = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!r.getContext()) throw new Error('no gl');
  } catch (e) { console.warn('BoxStage3D: no WebGL', e); return null; }
  const play = (n, o) => { try { sfx?.(n, o); } catch { /* optional */ } };
  r.setPixelRatio(1);
  r.setClearColor(0x000000, 0);
  r.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
  const cv = r.domElement;
  cv.className = 'tbx-gl';
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;image-rendering:pixelated;image-rendering:crisp-edges';
  host.appendChild(cv);
  const zl = document.createElement('div');
  zl.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  host.appendChild(zl);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffe8c8, 0x5a3a6a, 1.25));
  const key = new THREE.DirectionalLight(0xfff0d6, 2.2); key.position.set(-3, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffb070, 1.6); rim.position.set(5, 2.5, -4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xb8a0ff, 0.45); fill.position.set(4, 1, 5); scene.add(fill);

  const FOV = 24, DIST = 30, PITCH = 0.42;
  const cam = new THREE.PerspectiveCamera(FOV, 1, 1, 120);
  cam.position.set(0, Math.sin(PITCH) * DIST, Math.cos(PITCH) * DIST);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld();
  const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
  const plane = new THREE.Plane(fwd.clone().negate(), 0); // through the origin, facing the camera
  const ray = new THREE.Raycaster();
  const _v = new THREE.Vector3(), _n = new THREE.Vector2();

  const rt = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  rt.depthTexture = new THREE.DepthTexture(2, 2);
  const post = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false, transparent: false,
    uniforms: { tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, size: { value: new THREE.Vector2(2, 2) }, ink: { value: new THREE.Color(0x150910) }, cNear: { value: cam.near }, cFar: { value: cam.far }, crease: { value: 0.12 } },
  });
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const postScene = new THREE.Scene();
  const pm = new THREE.Mesh(tri, post); pm.frustumCulled = false; postScene.add(pm);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const shTex = shadowTex(), spTex = sparkTex();
  const shMat = new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false });
  const spMat = new THREE.SpriteMaterial({ map: spTex, alphaTest: 0.5 });

  // css px -> point on the layout plane
  let VW = 1, VH = 1, wpp = 0.01;
  function toPlane(x, y, out) {
    _n.set((x / VW) * 2 - 1, -(y / VH) * 2 + 1);
    ray.setFromCamera(_n, cam);
    return ray.ray.intersectPlane(plane, out) || out.set(0, 0, 0);
  }
  function resize() {
    const W = host.clientWidth || window.innerWidth, H = host.clientHeight || window.innerHeight;
    const w = Math.max(16, Math.round(W / ps)), h = Math.max(16, Math.round(H / ps));
    VW = W; VH = H;
    cam.aspect = W / H; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    wpp = (2 * DIST * Math.tan((FOV * Math.PI) / 360)) / H;
    if (r.domElement.width !== w || r.domElement.height !== h) {
      r.setSize(w, h, false);
      rt.setSize(w, h);
      post.uniforms.size.value.set(w, h);
    }
  }

  // ---- boxes
  const boxes = slots.map((el, i) => {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shMat);
    sh.rotation.x = -Math.PI / 2;
    scene.add(sh);
    return { i, el, B: null, sh, floor: new THREE.Vector3(), s: 1, hover: 0, flapK: 0, flapV: 0, lift: 0, liftV: 0, sq: 0, sqV: 0, mode: 'idle', t: 0, empty: true, sparkT: 0, wob: 0, ph: i * 2.1 };
  });
  function setBox(i, { empty = true, items = [], label = `SAVE ${i + 1}` } = {}) {
    const b = boxes[i];
    if (!b) return;
    if (b.B) { scene.remove(b.B.root); disposeTree(b.B.root); }
    const B = buildBox(i * 17 + 5, label);
    b.B = B; b.empty = empty;
    const pile = PILE_H[+(items.find((x) => x.startsWith('coins')) || 'coins1').slice(5) || 1];
    for (const id of empty ? [] : items) {
      const s = makeStuff(id);
      if (!s) continue;
      if (STUFF[id]?.onCoins) { s.position.y = s.userData.base = STUFF.coins.at[1] + pile - 1; }
      B.contents.add(s);
    }
    scene.add(B.root);
    b.flapK = empty ? 0.85 : 1; b.flapV = 0;
    setFlaps(B, b.flapK);
  }
  const sparks = [];
  function spark(b, n = 5) {
    for (let k = 0; k < n; k++) {
      const s = new THREE.Sprite(spMat);
      scene.add(s);
      const a = Math.random() * TAU;
      sparks.push({ s, t: -k * 0.05, life: 0.7 + Math.random() * 0.4, x: Math.cos(a) * BW * 0.4, z: Math.sin(a) * BD * 0.4, y: BH + 2 + Math.random() * 4, vy: 6 + Math.random() * 6, b });
    }
  }

  // ---- Reynard, asleep sitting up in an open box of his own: walls to his chest, the quilt over
  // the rim, chin on his paw (the 'think' pose with an asleep face), nightcap drooping
  const napG = new THREE.Group();
  const napTilt = new THREE.Group(); napG.add(napTilt);
  const napYaw = new THREE.Group(); napTilt.add(napYaw);
  const napBob = new THREE.Group(); napYaw.add(napBob);
  const rig = new FoxRig({ shadows: false });
  rig.setOutfit('pajamas');
  rig.play('think', { fade: 0 });
  rig.setExpression('asleep', { hold: 1e9 });
  napBob.add(rig.root);
  for (let k = 0; k < 4; k++) rig.update(0.25);
  const _c = new THREE.Vector3();
  rig.root.updateMatrixWorld(true);
  rig.headTop(_c);
  const napBox = buildBox(77, 'FRAGILE');
  const kb = (_c.y * 0.36) / (BH + 1), ky = (_c.y * 0.23) / (BH + 1); // roomy, walls up to his chest
  napBox.root.scale.set(kb, ky, kb);
  napBox.root.position.z = -0.04;
  setFlaps(napBox, 1);
  napYaw.add(napBox.root);
  // the quilt, draped over the front rim
  const quiltTex = pixTex(8, 16, (x, w, h) => {
    for (let y = 0; y < h; y++) { x.fillStyle = (y >> 1) % 2 ? '#f4e6c4' : '#d8402e'; x.fillRect(0, y, w, 1); }
    x.fillStyle = '#ffd84a'; x.fillRect(3, 2, 2, 2); x.fillRect(3, 10, 2, 2);
  });
  const quiltMat = new THREE.MeshLambertMaterial({ map: quiltTex });
  const qTop = new THREE.Mesh(new THREE.BoxGeometry(BW * kb * 0.86, 0.035, BD * kb * 0.36), quiltMat);
  qTop.position.set(0.02, (BH + 1.2) * ky, BD * kb * 0.32);
  const qHang = new THREE.Mesh(new THREE.BoxGeometry(BW * kb * 0.86, BH * ky * 0.5, 0.035), quiltMat);
  qHang.position.set(0.02, (BH + 1.2) * ky - BH * ky * 0.25, (BD / 2 + 1.6) * kb);
  qHang.rotation.x = -0.08;
  napYaw.add(qTop, qHang);
  let napH = 1, napW = 1;
  function setNapPose({ yaw = NAP.yaw, tilt = NAP.tilt, headTilt = NAP.headTilt } = {}) {
    NAP.yaw = yaw; NAP.tilt = tilt; NAP.headTilt = headTilt;
    napYaw.rotation.y = yaw; napTilt.rotation.x = tilt;
    const sc = napG.scale.x || 1;
    napG.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(napBox.root);
    rig.headTop(_c);
    napH = (Math.max(bb.max.y, _c.y) - bb.min.y) / sc + 0.1;
    napW = (bb.max.x - bb.min.x) / sc;
  }
  setNapPose();
  scene.add(napG);
  const napSh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shMat); napSh.rotation.x = -Math.PI / 2; scene.add(napSh);
  let poked = 0;

  // ---- per frame
  const _r = new THREE.Vector3(), _p = new THREE.Vector3();
  let T = 0;
  function layout() {
    for (const b of boxes) {
      const rc = b.el.getBoundingClientRect(), hr = host.getBoundingClientRect();
      const cx = rc.left - hr.left + rc.width / 2, by = rc.top - hr.top + rc.height * 0.93;
      toPlane(cx, by, b.floor);
      b.s = (rc.width * 0.62 * wpp) / BW;
    }
    if (nap) {
      const rc = nap.getBoundingClientRect(), hr = host.getBoundingClientRect();
      // a little off-centre, away from the SHH! sign (right of him on wide screens, left on tall ones)
      toPlane(rc.left - hr.left + rc.width * (host.classList.contains('tbx--tall') ? 0.6 : 0.4), rc.top - hr.top + rc.height * 0.95, _p);
      const s = Math.min((rc.height * 0.88 * wpp) / napH, (rc.width * 0.86 * wpp) / napW);
      napG.position.copy(_p);
      napG.scale.setScalar(s);
      napSh.position.set(_p.x, _p.y - 0.02, _p.z + 0.05 * s);
      napSh.scale.set(napW * s * 1.35, napW * s * 0.8, 1);
    }
  }
  // damped spring, sub-stepped so slow frames can't blow it up
  function spring(x, v, target, k, d, dt) {
    const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n;
    for (let i = 0; i < n; i++) { v += (-(x - target) * k - v * d) * h; x += v * h; }
    return [x, v];
  }
  function stepBox(b, dt) {
    const B = b.B;
    if (!B) return;
    b.t += dt;
    const ph = T + b.ph;
    // springs: lift, flap opening (overshoots = pop), squash
    const wantLift = b.mode === 'idle' ? b.hover * 0.5 : b.mode === 'pick' ? 1.2 : 0;
    [b.lift, b.liftV] = spring(b.lift, b.liftV, wantLift, 60, 9, dt);
    const wantFlap = b.mode === 'toss' ? (b.t < 0.05 ? b.flapK : 0) : b.mode === 'pick' ? 1.35 : b.empty ? 0.85 + b.hover * 0.25 : 1 + b.hover * 0.22;
    [b.flapK, b.flapV] = spring(b.flapK, b.flapV, wantFlap, 140, 9, dt);
    [b.sq, b.sqV] = spring(b.sq, b.sqV, 0, 220, 12, dt);
    b.sq = clamp(b.sq, -0.45, 0.6);
    const floatH = (2.4 + Math.sin(ph * 1.25) * 0.6 + b.lift * 2.2) * b.s * BH * 0.16;
    let pos = _r.copy(b.floor).add(_v.set(0, floatH + b.s * 2, 0));
    let yaw = -0.42 + Math.sin(ph * 0.55) * 0.2 + b.hover * Math.sin(ph * 3) * 0.06, roll = Math.sin(ph * 0.9) * 0.05, pitchX = Math.sin(ph * 0.7) * 0.04;
    let scale = b.s;
    // the special moves
    if (b.mode === 'pick') {
      const u = b.t;
      if (!b.empty && u > 0.35) {
        const k = ease((u - 0.35) / 0.55);
        pos.lerp(_p.copy(cam.position).addScaledVector(fwd, 8).sub(_v.set(0, 1.2, 0)), k * 0.9);
        yaw += k * 1.2; roll += Math.sin(u * 20) * 0.05 * (1 - k);
      } else if (b.empty) {
        setUnfold(B, ease((u - 0.15) / 0.5));
        pos.y += ease((u - 0.15) / 0.6) * b.s * 4;
        yaw += ease(u / 0.8) * 0.6;
      }
    } else if (b.mode === 'toss') {
      const u = b.t;
      B.contents.visible = u < 0.22; // stuffed back in as the flaps shut
      B.tape.g.visible = u > 0.35;
      if (u > 0.35) {
        const k = ease((u - 0.35) / 0.35);
        B.tape.top.scale.set(1, 1, Math.max(0.01, k));
        B.tape.f.scale.set(1, Math.max(0.01, clamp((k - 0.5) * 2, 0, 1)), 1);
        B.tape.b.scale.set(1, Math.max(0.01, clamp((k - 0.5) * 2, 0, 1)), 1);
      }
      if (u > 0.8) {
        if (!b.kicked) { b.kicked = true; b.kv = { x: 22 + Math.random() * 6, y: 14, s: 9 }; b.kp = pos.clone(); b.sqV += 6; play('box_kick'); }
        const k = u - 0.8;
        pos = _r.set(b.kp.x + b.kv.x * k * b.s * 6, b.kp.y + (b.kv.y * k - 20 * k * k) * b.s * 6, b.kp.z - k * 4);
        yaw += k * b.kv.s; roll -= k * b.kv.s * 0.8;
        if (k > 1.1 && !b.gone) { b.gone = true; b.onGone?.(); }
      }
    } else if (b.mode === 'drop') {
      const u = b.t;
      const fall = Math.max(0, 1 - u / 0.45);
      pos.y += fall * fall * b.s * 60;
      if (u >= 0.45 && !b.landed) { b.landed = true; b.sqV -= 9; play('box_land'); spark(b, 4); }
      if (u > 1.0) { b.mode = 'idle'; b.landed = false; }
    }
    B.root.position.copy(pos);
    B.root.rotation.set(pitchX, yaw, roll);
    B.root.scale.setScalar(scale);
    const sy = 1 + b.sq, sx = 1 / Math.sqrt(Math.max(0.5, sy));
    B.body.scale.set(sx, sy, sx);
    setFlaps(B, Math.max(0, b.flapK), b.mode === 'idle' ? Math.sin(ph * 2.2) * 0.04 : 0);
    // contents: bounce on their own springs
    for (const s of B.contents.children) {
      const d = s.userData;
      [d.y, d.v] = spring(d.y, d.v, b.hover * (d.hang ? 0 : 1.5), 90, 7, dt);
      s.position.y = d.base + d.y + (d.hang ? 0 : Math.sin(ph * 2 + d.base) * 0.15);
      if (d.hang) s.rotation.z = Math.sin(ph * 1.6) * 0.12;
    }
    // soft shadow on the floor below
    const hgt = floatH / (b.s * BH);
    b.sh.visible = b.mode !== 'toss' || b.t < 0.8;
    b.sh.position.set(b.floor.x, b.floor.y - 0.02, b.floor.z + 0.1);
    const shs = b.s * BW * 1.25 * (1 - clamp(hgt * 0.35, 0, 0.45)) * (b.mode === 'drop' ? clamp(b.t / 0.45, 0.2, 1) : 1);
    b.sh.scale.set(shs, shs * 0.55, 1);
    // hover sparkles
    if (b.hover > 0.5 && !b.empty && b.mode === 'idle') { b.sparkT -= dt; if (b.sparkT <= 0) { b.sparkT = 0.45; spark(b, 2); } }
  }
  const head = new THREE.Vector3();
  const zs = [];
  let zT = 1, snoreT = 2.5;
  function spawnZ(big = 1) {
    const c = document.createElement('canvas');
    c.width = 6; c.height = 7;
    const g = c.getContext('2d');
    const rows = ['kkkkkk', 'kwwwBk', 'kkkwBk', '.kwBk.', 'kwBkkk', 'kwwwwk', 'kkkkkk'];
    const P = { k: '#2a1626', w: '#ffffff', B: '#9ccff2' };
    rows.forEach((rr, y) => { for (let x = 0; x < 6; x++) if (P[rr[x]]) { g.fillStyle = P[rr[x]]; g.fillRect(x, y, 1, 1); } });
    const s = 3 * (zs.length % 2 ? 1 : 1.4) * big;
    c.style.cssText = `position:absolute;left:0;top:0;width:${6 * s}px;height:${7 * s}px;image-rendering:pixelated;opacity:0`;
    zl.appendChild(c);
    rig.headTop(head);
    head.project(cam);
    zs.push({ c, t: 0, x: (head.x * 0.5 + 0.5) * VW + 4, y: (0.5 - head.y * 0.5) * VH - 6, ph: Math.random() * 6 });
    if (zs.length > 8) { zs[0].c.remove(); zs.shift(); }
  }
  function step(dt) {
    T += dt;
    resize();
    layout();
    for (const b of boxes) stepBox(b, dt);
    for (let k = sparks.length - 1; k >= 0; k--) {
      const p = sparks[k];
      p.t += dt;
      if (p.t >= p.life || !p.b.B) { scene.remove(p.s); sparks.splice(k, 1); continue; }
      if (p.t < 0) { p.s.visible = false; continue; }
      p.s.visible = true;
      _v.set(p.x, p.y + p.vy * p.t, p.z).applyMatrix4(p.b.B.root.matrixWorld);
      p.s.position.copy(_v);
      const u = p.t / p.life, sc = p.b.s * 3.2 * (u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8 * 0.8);
      p.s.scale.set(sc, sc, 1);
    }
    // Reynard
    rig.update(dt);
    rig.bubble.visible = false; rig.pop.visible = false;
    for (const z of rig.zzz) z.visible = false; // the DOM Zzz are bigger
    rig.head.rotation.z += NAP.headTilt + Math.sin(T * 0.45) * 0.03; // head tipped onto the paw
    // slow breathing bob, and a jolt when poked
    poked = Math.max(0, poked - dt * 2.4);
    const j = Math.sin(poked * 18) * poked * 0.12, br = Math.sin(T * 1.6);
    napBob.position.y = br * 0.008;
    napBob.scale.set(1 - j * 0.5 - br * 0.006, 1 + j + br * 0.012, 1 - j * 0.5 - br * 0.006);
    zT -= dt;
    if (zT <= 0 && nap) { zT = 1.4; spawnZ(); }
    for (let k = zs.length - 1; k >= 0; k--) {
      const z = zs[k];
      z.t += dt;
      const u = z.t / 3.2;
      if (u >= 1) { z.c.remove(); zs.splice(k, 1); continue; }
      const x = z.x + u * 34 + Math.sin(z.t * 2.4 + z.ph) * 6, y = z.y - u * 58;
      const a = u < 0.15 ? u / 0.15 : u > 0.7 ? (1 - u) / 0.3 : 1;
      z.c.style.transform = `translate(${Math.round(x / 3) * 3}px,${Math.round(y / 3) * 3}px) rotate(${(Math.sin(z.t * 1.7 + z.ph) * 0.25).toFixed(2)}rad) scale(${(0.7 + u * 0.6).toFixed(2)})`;
      z.c.style.opacity = a.toFixed(2);
    }
    snoreT -= dt;
    if (snoreT <= 0) { snoreT = (TAU / 1.5) * 2; play('bed_snore', { volume: 0.16 }); }
    // render
    r.setRenderTarget(rt);
    r.clear();
    r.render(scene, cam);
    r.setRenderTarget(null);
    r.clear();
    r.render(postScene, postCam);
  }
  let dead = false, raf = 0, last = performance.now(), acc = 0;
  function loop(now) {
    raf = 0;
    if (dead) return;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    acc += dt;
    if (!document.hidden && host.isConnected && acc >= 1 / fps - 0.004) { step(Math.min(0.1, acc)); acc = 0; }
    raf = requestAnimationFrame(loop);
  }
  resize();
  raf = requestAnimationFrame(loop);

  function disposeTree(o) {
    o.traverse((m) => {
      if (m.isSprite) return;
      m.geometry?.dispose?.();
      for (const mt of [].concat(m.material || [])) { if (mt === voxelMaterial() || mt === shMat) continue; mt.map?.dispose?.(); mt.dispose?.(); }
    });
  }
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  return {
    el: cv,
    step,
    setBox,
    hover(i, on) {
      const b = boxes[i];
      if (!b?.B || b.mode !== 'idle') return;
      const was = b.hover;
      b.hover = on ? 1 : 0;
      if (on && !was) {
        b.flapV += 4; b.sqV += 3;
        for (const s of b.B.contents.children) s.userData.v += 10 + Math.random() * 6;
        if (!b.empty) spark(b, 4);
      }
    },
    async pick(i) {
      const b = boxes[i];
      if (!b?.B) return;
      b.mode = 'pick'; b.t = 0; b.flapV += 6; b.sqV -= 4;
      for (const s of b.B.contents.children) s.userData.v += 18;
      if (!b.empty) spark(b, 8);
      play(b.empty ? 'box_flap' : 'box_thump');
      await wait(b.empty ? 750 : 900);
    },
    toss(i, onGone) {
      const b = boxes[i];
      if (!b?.B) return Promise.resolve();
      return new Promise((res) => {
        b.mode = 'toss'; b.t = 0; b.kicked = false; b.gone = false; b.hover = 0; b.sqV += 4;
        play('box_flap');
        setTimeout(() => play('box_tape'), 350);
        b.onGone = () => {
          onGone?.();
          b.mode = 'drop'; b.t = 0; b.sq = 0; b.sqV = 0; b.lift = 0; b.liftV = 0;
          setTimeout(res, 700);
        };
      });
    },
    setNapPose,
    get debug() { return { rig, napBox, napG, kb, ky, napH, napW }; },
    poke() { poked = 1; for (let k = 0; k < 3; k++) setTimeout(() => !dead && spawnZ(1.3), k * 140); play('bed_mumble', { volume: 0.35 }); },
    dispose() {
      if (dead) return;
      dead = true;
      cancelAnimationFrame(raf);
      for (const b of boxes) if (b.B) disposeTree(b.B.root);
      rig.dispose?.();
      disposeTree(napBox.root); quiltTex.dispose(); quiltMat.dispose(); qTop.geometry.dispose(); qHang.geometry.dispose();
      for (const s of sparks) scene.remove(s.s);
      shTex.dispose(); spTex.dispose(); shMat.dispose(); spMat.dispose(); post.dispose(); tri.dispose();
      rt.depthTexture.dispose(); rt.dispose();
      r.dispose(); r.forceContextLoss?.();
      cv.remove(); zl.remove();
    },
  };
}
