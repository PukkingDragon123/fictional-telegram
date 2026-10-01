// Glass fish tank on a little wooden stand: a 1-tile build where fish can be
// kept apart from the pond. Voxel wood/frame (0.05 voxels, Lambert + grain via
// critterKit) and a transparent glass + water box that never writes depth, so
// the game's depth-outline pass only outlines the frame, stand and contents.
//
//   makeGlassTank({ size = 'small' | 'large', seed }) -> {
//     root: THREE.Group,      origin = tile ground centre (y = 0 is the ground), front faces +Z
//     water: THREE.Mesh,      tinted water volume (transparent, depthWrite false)
//     interior: { x0, x1, y0, y1, z0, z1 },  root-local box where fish may swim (billboards)
//     capacity: number,       comfy fish count (water clouds a little past it)
//     setFishCount(n), update(dt), dispose()
//   }
//
// Footprint: 'small' fits one tile (x, z in [-0.45, 0.45] x [-0.3, 0.3]), 0.9 tall
// (stand top at y 0.35, glass 0.4..0.875, rim to 0.9).
// 'large' spans two tiles along X (x in [-0.95, 0.95]); centre it on the pair.
// Fish sprites in the game are opaque (alpha discard) so they draw before the
// glass and get tinted by the water. Render orders used: back glass 15, water 16,
// bubbles 16.5, water surface 16.6, front glass 17.
import * as THREE from 'three';
import { VoxelModel, VS, voxMesh, hash3 } from './critterKit.js';

// ---------------------------------------------------------------- palette
const WOOD = [0xb07a48, 0xa36e3f, 0xbc8852];
const WOOD_L = 0xcc9a62;
const WOOD_D = 0x7a4c2a;
const FRAME = [0x74482c, 0x7e5234, 0x683e24];
const FRAME_L = 0x9c6c44;
const BRASS = 0xd6a73c, BRASS_L = 0xf4d77a, BRASS_D = 0x9a6c22;
const GRAVEL = [0xd8c08a, 0xc4a676, 0xe2d2a8, 0xcdb27e, 0xd8c08a, 0xc4a676, 0xd2b886, 0xe2d2a8, 0xe6a4a8, 0xf2ead8, 0xbfa070, 0xd8c08a];
const SAND = 0xd2b47e;
const PLANT = [0x3f9a48, 0x52b04e, 0x2f7c3c, 0x68c05a];
const ROCK = [0x8a8a92, 0x7a7a84, 0x9c9ca4];

const pick = (h, arr) => arr[Math.floor(h * arr.length) % arr.length];

/** Voxel bodies. Coordinates in voxels; root-local position = voxel * VS (pivot 0). */
function buildModels(hx, seed) {
  const body = new VoxelModel();
  const X0 = -hx, X1 = hx - 1; // stand x range
  const Z0 = -6, Z1 = 5; // stand z range (0.6 deep)
  const w = (x, y, z) => {
    const h = hash3(x + seed, y, z);
    return h < 0.12 ? WOOD[1] : h > 0.9 ? WOOD[2] : WOOD[0];
  };
  // ---- stand: legs, lower shelf, apron, top slab
  const legX = [X0, X1 - 1];
  if (hx > 12) legX.push(-1); // middle legs for the long tank
  for (const lx of legX) for (const lz of [Z0, Z1 - 1]) body.box(lx, 0, lz, lx + 1, 4, lz + 1, (x, y) => (y === 0 ? WOOD_D : w(x, y, lz)));
  body.box(X0 + 1, 1, Z0 + 1, X1 - 1, 1, Z1 - 1, (x, y, z) => ((x + 40) % 5 === 0 ? WOOD_D : w(x, y, z))); // slatted shelf
  // apron (front/back/sides), 2 voxels tall, just under the top
  body.box(X0 + 2, 3, Z1, X1 - 2, 4, Z1, (x, y, z) => (y === 3 ? WOOD_D : w(x, y, z)));
  body.box(X0 + 2, 3, Z0, X1 - 2, 4, Z0, (x, y, z) => (y === 3 ? WOOD_D : w(x, y, z)));
  body.box(X0, 3, Z0 + 2, X0, 4, Z1 - 2, (x, y, z) => (y === 3 ? WOOD_D : w(x, y, z)));
  body.box(X1, 3, Z0 + 2, X1, 4, Z1 - 2, (x, y, z) => (y === 3 ? WOOD_D : w(x, y, z)));
  // top slab with a lighter front lip
  body.box(X0, 5, Z0, X1, 6, Z1, (x, y, z) => (y === 6 && (z === Z1 || x === X0 || x === X1) ? WOOD_L : y === 5 && z === Z1 ? WOOD_D : w(x, y, z)));
  // brass label plate on the front apron (engraved line, bright top edge)
  for (let x = -3; x <= 2; x++) for (let y = 3; y <= 4; y++) {
    const c = y === 4 ? (x === -3 || x === 2 ? BRASS : BRASS_L) : x === -3 || x === 2 ? BRASS_D : (x === -2 || x === 0 || x === 1) ? BRASS_D : BRASS;
    body.set(x, y, Z1 + 1, c);
  }
  // a tub of fish food on the shelf
  const fx = X0 + 3;
  body.box(fx, 2, Z0 + 2, fx + 2, 3, Z0 + 4, (x, y, z) => (y === 3 ? 0xf2c230 : z === Z0 + 4 && x === fx + 1 ? 0xffffff : 0xd23a2e));
  body.set(fx + 1, 4, Z0 + 3, 0xf2c230);
  // a folded net leaning on the other leg
  body.box(X1 - 3, 2, Z0 + 2, X1 - 3, 4, Z0 + 2, 0x8a6a4a);
  body.box(X1 - 4, 2, Z0 + 1, X1 - 2, 2, Z0 + 3, 0x5a8aa0);

  // ---- tank frame (glass sits inside it). Base tray y 7, glass y 8..17, rim y 17
  const GX0 = X0 + 1, GX1 = X1 - 1, GZ0 = Z0 + 1, GZ1 = Z1 - 1; // frame outer extents
  const f = (x, y, z) => { const h = hash3(x, y + seed, z); return h < 0.15 ? FRAME[1] : h > 0.9 ? FRAME[2] : FRAME[0]; };
  // base tray
  body.box(GX0, 7, GZ0, GX1, 7, GZ1, (x, y, z) => (z === GZ1 || x === GX0 || x === GX1 || z === GZ0 ? f(x, y, z) : SAND));
  // corner posts
  for (const px of [GX0, GX1]) for (const pz of [GZ0, GZ1]) body.box(px, 8, pz, px, 16, pz, f);
  // top rim (with a lighter top edge)
  for (let x = GX0; x <= GX1; x++) for (const z of [GZ0, GZ1]) body.set(x, 17, z, z === GZ1 ? FRAME_L : f(x, 17, z));
  for (let z = GZ0; z <= GZ1; z++) for (const x of [GX0, GX1]) body.set(x, 17, z, FRAME_L);

  // ---- gravel bed, sloping up toward the back
  const IX0 = GX0 + 1, IX1 = GX1 - 1, IZ0 = GZ0 + 1, IZ1 = GZ1 - 1;
  for (let x = IX0; x <= IX1; x++) for (let z = IZ0; z <= IZ1; z++) {
    const g = (y) => pick(hash3(x * 3 + seed, y, z * 5), GRAVEL);
    body.set(x, 8, z, g(8));
    if (z <= IZ0 + 2 || (z <= IZ0 + 3 && hash3(x, 1, z) < 0.5)) body.set(x, 9, z, g(9));
  }
  // a rock pile at the back right with the airstone in front of it
  const rx = IX1 - 3;
  body.box(rx, 9, IZ0, rx + 2, 11, IZ0 + 1, (x, y, z) => pick(hash3(x, y, z + 9), ROCK));
  body.set(rx + 1, 12, IZ0, ROCK[2]); body.set(rx + 2, 12, IZ0, ROCK[0]); body.set(rx, 11, IZ0 + 1, null);
  body.set(rx - 1, 9, IZ0 + 3, 0x6a6a74); // airstone
  // airline tube up the back-right corner
  for (let y = 9; y <= 16; y++) body.set(IX1, y, IZ0, 0x9ad0c8);
  body.set(IX1 - 1, 9, IZ0 + 1, 0x9ad0c8); body.set(IX1 - 1, 9, IZ0 + 2, 0x9ad0c8);
  // a tiny shell + a pink pebble up front
  body.set(IX0 + 3, 9, IZ1 - 1, 0xf6e8d8); body.set(IX0 + 4, 9, IZ1 - 1, 0xe8b8a0);
  body.set(IX1 - 6, 9, IZ1, 0xe6a4a8);

  // ---- plant (animated part): a few blades from the back left
  const plant = new VoxelModel();
  const PX = IX0 + 2, PZ = IZ0 + 1, PY = 10;
  const blades = [[0, 0, 7, 1], [1, 0, 6, -1], [-1, 1, 4, 1], [1, 1, 3, 0], [0, -1, 5, -1], [2, 1, 4, 1]];
  for (const [dx, dz, h, lean] of blades) {
    for (let k = 0; k < h; k++) {
      const off = lean && k >= h - 2 ? lean : 0;
      plant.set(PX + dx + off, PY + k, PZ + dz, k === h - 1 ? PLANT[3] : pick(hash3(dx, k, dz), PLANT.slice(0, 3)));
    }
  }
  if (hx > 12) { // a second clump for the long tank
    for (const [dx, dz, h] of [[0, 0, 5], [1, 0, 4], [-1, 0, 3]]) for (let k = 0; k < h; k++) plant.set(-1 + dx, PY - 1 + k, PZ + dz, k === h - 1 ? PLANT[3] : PLANT[k % 3]);
  }
  return {
    body, plant, plantPivot: [PX + 0.5, PY, PZ + 0.5],
    glass: { x0: GX0 + 0.5, x1: GX1 + 0.5, z0: GZ0 + 0.5, z1: GZ1 + 0.5, y0: 8, y1: 17.5 },
    inner: { x0: IX0, x1: IX1 + 1, z0: IZ0, z1: IZ1 + 1 },
    bubbler: [rx - 0.5, 9.5, IZ0 + 3.5],
  };
}

// ---------------------------------------------------------------- textures
function pixTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// glass pane: faint tint, bright rim, two diagonal highlight streaks (front/back panes)
function glassCanvas(w, h, streaks) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(200,240,248,0.16)';
  x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(235,252,255,0.55)';
  x.fillRect(0, 0, w, 1); x.fillRect(0, h - 1, w, 1); x.fillRect(0, 0, 1, h); x.fillRect(w - 1, 0, 1, h);
  x.fillStyle = 'rgba(235,252,255,0.25)';
  x.fillRect(1, 1, w - 2, 1);
  if (streaks) {
    const band = (x0, wd, a) => {
      x.fillStyle = `rgba(255,255,255,${a})`;
      for (let y = 1; y < h - 1; y++) { const sx = Math.round(x0 + (h - y) * 0.8); x.fillRect(sx, y, wd, 1); }
    };
    band(Math.round(w * 0.06), 3, 0.5);
    band(Math.round(w * 0.06) + 5, 1, 0.4);
    band(Math.round(w * 0.6), 2, 0.28);
  }
  return c;
}
function surfaceCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(170,230,245,0.14)';
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < 14; i++) {
    const px = (i * 37) % w, py = (i * 23) % h;
    x.fillStyle = i % 3 ? 'rgba(230,250,255,0.45)' : 'rgba(255,255,255,0.75)';
    x.fillRect(px, py, 2 + (i % 3), 1);
  }
  return c;
}

// ---------------------------------------------------------------- the tank
export function makeGlassTank({ size = 'small', seed = 1 } = {}) {
  const large = size === 'large';
  const hx = large ? 19 : 9;
  const M = buildModels(hx, seed | 0);
  const root = new THREE.Group();
  root.name = `glassTank:${large ? 'large' : 'small'}`;
  const owned = []; // geometries, materials, textures to dispose

  // voxel body (grain material is cached/shared by critterKit: don't dispose it)
  const bodyMesh = voxMesh(M.body, [0, 0, 0], VS);
  bodyMesh.receiveShadow = true;
  root.add(bodyMesh);
  owned.push(bodyMesh.geometry);

  const plantHolder = new THREE.Group();
  plantHolder.position.set(M.plantPivot[0] * VS, M.plantPivot[1] * VS, M.plantPivot[2] * VS);
  const plantMesh = voxMesh(M.plant, M.plantPivot, VS, { shadows: false });
  plantHolder.add(plantMesh);
  root.add(plantHolder);
  owned.push(plantMesh.geometry);

  // ---- glass: one box drawn twice (inside faces first, then outside faces)
  const G = M.glass;
  const gw = (G.x1 - G.x0) * VS, gh = (G.y1 - G.y0) * VS, gd = (G.z1 - G.z0) * VS;
  const gcx = ((G.x0 + G.x1) / 2) * VS, gcy = ((G.y0 + G.y1) / 2) * VS, gcz = ((G.z0 + G.z1) / 2) * VS;
  const ppu = 40; // glass texels per world unit
  const texFront = pixTex(glassCanvas(Math.round(gw * ppu), Math.round(gh * ppu), true));
  const texSide = pixTex(glassCanvas(Math.round(gd * ppu), Math.round(gh * ppu), false));
  const texClear = pixTex((() => { const c = document.createElement('canvas'); c.width = c.height = 2; return c; })());
  owned.push(texFront, texSide, texClear);
  const glassMat = (map, side) => {
    const m = new THREE.MeshLambertMaterial({
      map, color: 0xffffff, emissive: 0x2a4048, transparent: true, depthWrite: false, side,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    owned.push(m);
    return m;
  };
  // BoxGeometry groups: +x, -x, +y, -y, +z, -z
  const sideMats = (side) => [glassMat(texSide, side), glassMat(texSide, side), glassMat(texClear, side), glassMat(texClear, side), glassMat(texFront, side), glassMat(texFront, side)];
  const glassGeo = new THREE.BoxGeometry(gw, gh, gd);
  owned.push(glassGeo);
  const glassBack = new THREE.Mesh(glassGeo, sideMats(THREE.BackSide));
  const glassFront = new THREE.Mesh(glassGeo, sideMats(THREE.FrontSide));
  for (const g of [glassBack, glassFront]) { g.position.set(gcx, gcy, gcz); g.castShadow = false; g.receiveShadow = false; g.name = 'glass'; }
  glassBack.renderOrder = 15; glassFront.renderOrder = 17;
  root.add(glassBack, glassFront);

  // ---- water: tinted volume up to just under the rim + a rippling surface
  const I = M.inner;
  const wTop = 16.4 * VS, wBot = 8 * VS;
  const ww = (I.x1 - I.x0) * VS + 0.02, wd = (I.z1 - I.z0) * VS + 0.02;
  const wcx = ((I.x0 + I.x1) / 2) * VS, wcz = ((I.z0 + I.z1) / 2) * VS;
  const waterGeo = new THREE.BoxGeometry(ww, wTop - wBot, wd);
  { // deeper blue toward the bottom (vertex colours, multiplied by the material colour)
    const pos = waterGeo.attributes.position, col = new Float32Array(pos.count * 3), hh = (wTop - wBot) / 2;
    const top = new THREE.Color(0xd8f4ff), bot = new THREE.Color(0x6a9ad8), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { c.copy(bot).lerp(top, (pos.getY(i) + hh) / (2 * hh)); col.set([c.r, c.g, c.b], i * 3); }
    waterGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x5ab8e8, vertexColors: true, emissive: 0x0c3448, transparent: true, opacity: 0.4, depthWrite: false });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.set(wcx, (wTop + wBot) / 2, wcz);
  water.renderOrder = 16;
  water.name = 'tankWater';
  root.add(water);
  owned.push(waterGeo, waterMat);
  const surfTex = pixTex(surfaceCanvas(Math.round(ww * ppu), Math.round(wd * ppu)));
  surfTex.wrapS = surfTex.wrapT = THREE.RepeatWrapping;
  const surfGeo = new THREE.PlaneGeometry(ww, wd);
  const surfMat = new THREE.MeshLambertMaterial({ map: surfTex, emissive: 0x204858, transparent: true, depthWrite: false });
  const surf = new THREE.Mesh(surfGeo, surfMat);
  surf.rotation.x = -Math.PI / 2;
  surf.position.set(wcx, wTop + 0.002, wcz);
  surf.renderOrder = 16.6;
  root.add(surf);
  owned.push(surfTex, surfGeo, surfMat);
  // the waterline where the surface meets the glass
  const wl = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => new THREE.Vector3(wcx + (a * ww) / 2, wTop + 0.003, wcz + (b * wd) / 2));
  const wlGeo = new THREE.BufferGeometry().setFromPoints([wl[0], wl[1], wl[1], wl[2], wl[2], wl[3], wl[3], wl[0]]);
  const wlMat = new THREE.LineBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.85, depthWrite: false });
  const waterline = new THREE.LineSegments(wlGeo, wlMat);
  waterline.renderOrder = 16.7;
  root.add(waterline);
  owned.push(wlGeo, wlMat);

  // ---- bubbles from the airstone
  const MAXB = large ? 22 : 14;
  const bubGeo = new THREE.BoxGeometry(0.022, 0.022, 0.022);
  const bubMat = new THREE.MeshBasicMaterial({ color: 0xeefcff, transparent: true, opacity: 0.85, depthWrite: false });
  const bubbles = new THREE.InstancedMesh(bubGeo, bubMat, MAXB);
  bubbles.renderOrder = 16.5;
  bubbles.frustumCulled = false;
  bubbles.name = 'bubbles';
  root.add(bubbles);
  owned.push(bubGeo, bubMat);
  const B0 = M.bubbler.map((v) => v * VS);
  const bub = Array.from({ length: MAXB }, (_, i) => ({ y: B0[1] + ((i * 0.37) % 1) * (wTop - B0[1]), sp: 0.16 + ((i * 0.61) % 1) * 0.12, ph: i * 1.7, s: 0.6 + ((i * 0.43) % 1) * 0.6, on: true }));
  const tmp = new THREE.Object3D();

  // fish swim box (root-local)
  const interior = {
    x0: I.x0 * VS + 0.05, x1: I.x1 * VS - 0.05,
    y0: 10.2 * VS, y1: wTop - 0.04,
    z0: I.z0 * VS + 0.07, z1: I.z1 * VS - 0.04,
  };
  const capacity = large ? 9 : 4;
  const clearCol = new THREE.Color(0x5ab8e8), murkCol = new THREE.Color(0x5aa88a);
  let fishN = 0, t = 0, active = 6;

  function setFishCount(n) {
    fishN = Math.max(0, n | 0);
    active = Math.min(MAXB, (large ? 8 : 5) + fishN * 2);
    const crowd = Math.max(0, Math.min(1, (fishN - capacity) / capacity));
    waterMat.color.copy(clearCol).lerp(murkCol, crowd);
    waterMat.opacity = 0.4 + crowd * 0.14;
  }
  setFishCount(0);

  function update(dt) {
    dt = Math.min(0.1, Math.max(0, dt || 0));
    t += dt;
    plantHolder.rotation.z = Math.sin(t * 1.3) * 0.12;
    plantHolder.rotation.x = Math.sin(t * 0.9 + 1) * 0.06;
    surfTex.offset.set((t * 0.03) % 1, Math.sin(t * 0.7) * 0.02);
    for (let i = 0; i < MAXB; i++) {
      const b = bub[i];
      if (i >= active) { tmp.position.set(0, -10, 0); tmp.scale.setScalar(0.001); tmp.updateMatrix(); bubbles.setMatrixAt(i, tmp.matrix); continue; }
      b.y += b.sp * dt * (1 + (b.y - B0[1]) * 1.5);
      if (b.y > wTop - 0.012) b.y = B0[1] + Math.random() * 0.02;
      const rise = (b.y - B0[1]) / (wTop - B0[1]);
      // snap to the 0.025 fine-voxel grid so they read as pixels
      const sx = Math.round((B0[0] + Math.sin(t * 3 + b.ph) * 0.02 * rise) / 0.0125) * 0.0125;
      const sy = Math.round(b.y / 0.0125) * 0.0125;
      tmp.position.set(sx, sy, B0[2] + Math.sin(b.ph) * 0.015);
      tmp.scale.setScalar(b.s * (0.7 + rise * 0.5));
      tmp.updateMatrix();
      bubbles.setMatrixAt(i, tmp.matrix);
    }
    bubbles.instanceMatrix.needsUpdate = true;
  }
  update(0);

  function dispose() {
    root.removeFromParent();
    for (const o of owned) o.dispose?.();
    bubbles.dispose?.();
    owned.length = 0;
  }

  return { root, water, interior, capacity, setFishCount, update, dispose };
}
