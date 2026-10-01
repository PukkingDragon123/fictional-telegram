// Preview for src/entities/structureDecals.js: every decorated structure, built
// with the game's own StructureSystem.makeObject (previewObject), plus its
// decals, on a grass tile; Reynard's hut too.
// URL flags: ?only=type,type  &zoom=0.02  &yaw=deg  &cols=6  &night=1  &decals=0  &sheet=1 (texture sheet, &scale=6)
//            &hut=0 (skip hut) &hutonly=1
import * as THREE from 'three';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import { CameraRig } from '../src/core/cameraRig.js';
import { voxelMaterial } from '../src/core/voxel.js';
import { StructureSystem } from '../src/game/StructureSystem.js';
import { STRUCTURES } from '../src/data/structures.js';
import { hutModel } from '../src/world/buildings.js';
import { decalsFor, hutDecals, DECAL_TYPES, DECAL_TEXTURES, decalCanvas } from '../src/entities/structureDecals.js';

const params = new URLSearchParams(location.search);

if (params.get('sheet') === '1') {
  const el = document.getElementById('sheet');
  el.style.display = 'block';
  const sc = +(params.get('scale') || 6);
  for (const k of DECAL_TEXTURES) {
    const src = decalCanvas(k);
    const c = document.createElement('canvas');
    c.width = src.width * sc; c.height = src.height * sc;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(src, 0, 0, c.width, c.height);
    const d = document.createElement('div'); d.appendChild(c); d.appendChild(document.createTextNode(k)); el.appendChild(d);
  }
}

const hutOnly = params.get('hutonly') === '1';
const allTypes = DECAL_TYPES.filter((t) => STRUCTURES[t]);
let types = params.get('only') ? params.get('only').split(',') : allTypes;
if (hutOnly) types = [];
const withHut = !hutOnly ? params.get('hut') === '1' : true;
const COLS = +(params.get('cols') || Math.min(6, types.length || 1));
const GAP = +(params.get('gap') || 3.4);
const showDecals = params.get('decals') !== '0';

const pr = new PixelRenderer(document.getElementById('c'));
const rig = new CameraRig();
rig.bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
rig.minWupp = 0.002; rig.maxWupp = 1;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3a2a);
const hemi = new THREE.HemisphereLight(0xfff0dc, 0x5a6a8a, 1.3);
const sun = new THREE.DirectionalLight(0xffe0b8, 2.0);
sun.position.set(-6, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 0.5, far: 60 });
scene.add(hemi, sun, sun.target);

// the real StructureSystem with a tiny game stub (previewObject never touches the grid)
const stubScene = new THREE.Scene();
const SS = new StructureSystem({ scene: stubScene, grid: {} });
const grassMat = new THREE.MeshLambertMaterial({ color: 0x6aa040 });
const waterMat = new THREE.MeshLambertMaterial({ color: 0x3a8ac0, transparent: true, opacity: 0.6, depthWrite: false });
const sandMat = new THREE.MeshLambertMaterial({ color: 0xb8a070 });

const labels = [];
const decalGroups = [];
const rows = Math.ceil(types.length / COLS) || 0;
types.forEach((type, i) => {
  const def = STRUCTURES[type];
  const [fw, fd] = def.size || [1, 1];
  const cx = ((i % COLS) - (COLS - 1) / 2) * GAP;
  const cz = (Math.floor(i / COLS) - (rows - 1) / 2) * GAP;
  const tile = new THREE.Group();
  tile.position.set(cx, 0, cz);
  scene.add(tile);
  let obj = SS.previewObject(type);
  if (!obj.children.length && def.model) { // beercooler: makeObject only checks s.type against RESTAURANT_TYPES
    obj = new THREE.Group();
    const s = { type, def, seed: 0, preview: true };
    SS.addRestaurant(s, obj, (geo, mat = voxelMaterial(), { shadow = true } = {}) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; obj.add(m); return m; });
  }
  const lodge = type === 'lodge';
  if (lodge) {
    obj.position.y = -0.9;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.2, 0.1, fd + 0.2), sandMat); floor.position.y = -0.95; floor.receiveShadow = true;
    const w = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.2, 0.02, fd + 0.2), waterMat); w.position.y = -0.01; w.renderOrder = 2;
    const land = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.2, 0.2, 0.6), grassMat); land.position.set(0, -0.1, 0.9); land.receiveShadow = true;
    tile.add(floor, w, land);
  } else {
    const gr = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.3, 0.2, fd + 0.3), grassMat);
    gr.position.y = -0.1; gr.receiveShadow = true; tile.add(gr);
  }
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = o.castShadow ?? true; o.receiveShadow = true; } });
  tile.add(obj);
  const seed = +(params.get('seed') || i);
  const dec = decalsFor(type, { seed, depth: lodge ? 9 : undefined });
  if (dec) { obj.add(dec); decalGroups.push(dec); dec.visible = showDecals; }
  const el = document.createElement('div');
  el.textContent = type;
  document.getElementById('labels').appendChild(el);
  labels.push({ el, pos: new THREE.Vector3(cx, -0.1, cz + fd / 2 + 0.2) });
});

let hutCenter = null;
if (withHut) {
  const hut = hutModel();
  const hg = new THREE.Group();
  const hb = new THREE.Mesh(hut.body.build({ scale: 0.1 }), voxelMaterial()); hb.castShadow = true; hb.receiveShadow = true;
  const hw = new THREE.Mesh(hut.glow.build({ scale: 0.1, ao: false }), new THREE.MeshBasicMaterial({ vertexColors: true }));
  hg.add(hb, hw);
  const ox = types.length ? (COLS / 2) * GAP + 1 : -1.5, oz = -1.5;
  hg.position.set(ox, 0, oz);
  const gr = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 4.5), grassMat); gr.position.set(ox + 1.5, -0.1, oz + 1.8); gr.receiveShadow = true;
  scene.add(gr, hg);
  const hd = hutDecals(); hg.add(hd); decalGroups.push(hd); hd.visible = showDecals;
  hutCenter = new THREE.Vector3(ox + 1.5, 0.6, oz + 1.6);
}

let night = params.get('night') === '1';
function setNight(v) {
  night = v;
  hemi.intensity = v ? 0.35 : 1.3; sun.intensity = v ? 0.35 : 2.0;
  hemi.color.set(v ? 0x8a9ad8 : 0xfff0dc); sun.color.set(v ? 0x9ab0ff : 0xffe0b8);
  scene.background.set(v ? 0x141828 : 0x2a3a2a);
}
setNight(night);
document.getElementById('night').onclick = () => setNight(!night);
let spin = false;
document.getElementById('rot').onclick = () => { spin = !spin; };
document.getElementById('dec').onclick = () => { for (const d of decalGroups) d.visible = !d.visible; };

const extentW = (types.length ? COLS * GAP : 0) + (withHut ? 4.5 : 0), extentH = Math.max(rows * GAP, withHut ? 4 : 0) * Math.sin(rig.pitch) + 1.6;
function resize() {
  pr.resize(innerWidth, innerHeight, Math.min(2, devicePixelRatio || 1));
  const z = +(params.get('zoom') || 0) || Math.max(extentW / pr.lowW, extentH / pr.lowH) * 1.05;
  rig.wupp = rig.wuppGoal = z;
  const tx = +(params.get('tx') ?? NaN), tz = +(params.get('tz') ?? NaN);
  if (hutOnly && hutCenter) rig.target.copy(hutCenter);
  else rig.target.set(withHut && types.length ? 2.2 : 0, 0.4, 0);
  if (!Number.isNaN(tx)) rig.target.x = tx;
  if (!Number.isNaN(tz)) rig.target.z = tz;
  rig.goal.copy(rig.target);
  rig.yaw = rig.yawGoal = (+(params.get('yaw') || 0) * Math.PI) / 180;
}
addEventListener('resize', resize);
resize();

const v = new THREE.Vector3();
let last = performance.now(), time = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  if (spin) rig.yawGoal += dt * 0.4;
  rig.update(dt, pr);
  pr.render(scene, rig);
  for (const l of labels) {
    v.copy(l.pos).project(rig.camera);
    l.el.style.left = ((v.x + 1) / 2) * innerWidth + 'px';
    l.el.style.top = ((1 - v.y) / 2) * innerHeight + 'px';
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__decals = { scene, rig, pr };
