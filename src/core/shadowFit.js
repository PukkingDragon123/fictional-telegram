// [v26 perf] Shadow-map scissor: the sun's 2048^2 shadow map is redrawn every
// frame, but only the texels that some *visible* shadow receiver can look up
// are ever sampled. Before the scene render we bound those texels (each visible
// receiver's world box, clipped to the camera's view prism, projected into the
// light's texture space) and scissor the shadow pass (clear + casters) to that
// rectangle. Every texel that can be sampled is drawn exactly as before, so the
// picture is identical; the rest of the map is simply not touched.
// Whenever a visible receiver can't be bounded, the whole map is drawn.
import * as THREE from 'three';
import { SPRITE_UNIFORMS } from './spriteBatch.js';

const _frustum = new THREE.Frustum();
const _pm = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _box = new THREE.Box3();
const _v = new THREE.Vector3();
const _A = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _D = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _geoCache = new WeakMap(); // geometry -> { pos, ver, box } (local bounds)
const _sprCache = new WeakMap(); // geometry -> { ver, n, ... } sprite batch bounds
const _instCache = new WeakMap(); // InstancedMesh -> { ver, count, box }
const MARGIN_WORLD = 0.6;
const MARGIN_TEX = 6;
const FLOOR_Y = -4;
const EMPTY = 2; // worldBox(): nothing drawn
const SPRITES = 3; // worldBox(): a sprite batch, see spriteCells()

function findSun(scene) {
  for (const c of scene.children) if (c.isDirectionalLight && c.castShadow && c.visible) return c;
  return null;
}

function geoBox(geo) {
  const pos = geo.attributes.position;
  if (!pos) return null;
  let c = _geoCache.get(geo);
  if (!c || c.pos !== pos || c.ver !== pos.version || c.morph !== geo.morphAttributes.position) {
    geo.computeBoundingBox(); // (also folds in morph targets)
    c = { pos, ver: pos.version, morph: geo.morphAttributes.position, box: geo.boundingBox.clone() };
    _geoCache.set(geo, c);
  }
  return c.box.isEmpty() ? null : c.box;
}

// a SpriteBatch mesh (see spriteBatch.js): its instances, binned into CELL x CELL
// columns, each with its own box (one world-wide box would be far too tall)
const CELL = 12;
function spriteCells(o) {
  const g = o.geometry, P = g.attributes.aPos, S = g.attributes.aSize, Pr = g.attributes.aParams, X = g.attributes.aExtra, An = g.attributes.aAnchor;
  const n = Math.min(g.instanceCount, P.count);
  if (!n) return EMPTY;
  const hc = Math.max(1, SPRITE_UNIFORMS.uHeightComp.value, SPRITE_UNIFORMS.uFlatComp.value);
  let c = _sprCache.get(g);
  const ver = P.version + S.version * 7 + (Pr ? Pr.version * 13 : 0) + (X ? X.version * 31 : 0) + (An ? An.version * 61 : 0);
  if (!c || c.ver !== ver || c.n !== n || c.P !== P || c.hc !== hc) {
    const p = P.array, s = S.array, pr = Pr?.array, ex = X?.array, an = An?.array;
    const idx = new Map(), B = [];
    let ok = true;
    for (let i = 0; i < n; i++) {
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      const w = Math.abs(s[i * 2]), h = Math.abs(s[i * 2 + 1]);
      if (!Number.isFinite(x + y + z + w + h)) { ok = false; break; }
      const sw = pr ? Math.abs(pr[i * 4]) : 0;
      const bend = ex ? Math.abs(ex[i * 4 + 3]) : 0;
      const ax = an ? an[i * 2] : 0.5, ay = an ? an[i * 2 + 1] : 0;
      const aw = Math.max(Math.abs(ax), Math.abs(1 - ax)), ah = Math.max(Math.abs(ay), Math.abs(1 - ay));
      // corner offsets (any rotation, height / flat compensation), push, tail bend, water bob
      const r = (aw * w + ah * h) * hc + sw * (0.6 + 0.15 * h) + bend * (0.2 * h * hc + 0.05) + 0.5;
      if (!Number.isFinite(r)) { ok = false; break; }
      const swh = sw * Math.max(0.35, h); // wind sway, scaled by uWind per frame
      const key = Math.floor(x / CELL) * 65536 + Math.floor(z / CELL);
      let j = idx.get(key);
      if (j === undefined) { j = B.length; idx.set(key, j); B.push(Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity, 0); }
      if (x - r < B[j]) B[j] = x - r; if (y - r < B[j + 1]) B[j + 1] = y - r; if (z - r < B[j + 2]) B[j + 2] = z - r;
      if (x + r > B[j + 3]) B[j + 3] = x + r; if (y + r > B[j + 4]) B[j + 4] = y + r; if (z + r > B[j + 5]) B[j + 5] = z + r;
      if (swh > B[j + 6]) B[j + 6] = swh;
    }
    c = { ver, n, P, hc, ok, B };
    _sprCache.set(g, c);
  }
  return c.ok ? c.B : false;
}

// world-space bounds of what `o` can draw: true, EMPTY (draws nothing) or false (unknown)
function worldBox(o, out) {
  const g = o.geometry;
  if (!g) return false;
  if (o.isBatchedMesh) return false;
  if (g.isInstancedBufferGeometry) {
    if (g.attributes.aPos && g.attributes.aSize && String(o.customDepthMaterial?.customProgramCacheKey?.()).startsWith('spriteDepth')) return SPRITES;
    return false;
  }
  if (o.isInstancedMesh) {
    let c = _instCache.get(o);
    const ver = o.instanceMatrix.version;
    if (!c || c.ver !== ver || c.count !== o.count || c.geo !== g || c.gv !== g.attributes.position?.version) {
      o.computeBoundingBox();
      c = { ver, count: o.count, geo: g, gv: g.attributes.position?.version, box: o.boundingBox.clone() };
      _instCache.set(o, c);
    }
    if (o.count === 0) return EMPTY;
    if (c.box.isEmpty()) return false;
    out.copy(c.box).applyMatrix4(o.matrixWorld);
    return true;
  }
  const b = geoBox(g);
  if (!b) return false;
  out.copy(b);
  if (o.isSkinnedMesh) {
    // bind-pose box: bones can stretch / swing limbs past it
    out.getSize(_v);
    out.expandByScalar(Math.max(_v.x, _v.y, _v.z) * 0.6 + 0.3);
  }
  out.applyMatrix4(o.matrixWorld);
  return true;
}

// Returns the light whose map got a scissor (caller clears it after the render), or null.
export function fitShadowScissor(renderer, scene, cam) {
  if (!renderer.shadowMap.enabled) return null;
  const light = findSun(scene);
  const sh = light?.shadow;
  const map = sh?.map;
  if (!map || sh.autoUpdate === false || renderer.shadowMap.autoUpdate === false) return null;
  const W = map.width, H = map.height;
  scene.updateMatrixWorld();
  if (cam.parent === null) cam.updateMatrixWorld();
  if (light.target.parent === null) light.target.updateMatrixWorld();
  sh.updateMatrices(light);
  const m = sh.matrix.elements;
  _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_pm);
  _inv.multiplyMatrices(cam.matrixWorld, cam.projectionMatrixInverse);
  for (let k = 0; k < 4; k++) {
    const sx = k & 1 ? 1 : -1, sy = k & 2 ? 1 : -1;
    _A[k].set(sx, sy, -1).applyMatrix4(_inv);
    _D[k].set(sx, sy, 1).applyMatrix4(_inv).sub(_A[k]);
  }
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity, bad = false;
  const uOf = (x, y, z) => m[0] * x + m[4] * y + m[8] * z + m[12];
  const vOf = (x, y, z) => m[1] * x + m[5] * y + m[9] * z + m[13];
  // one receiver box (world space): grow the scissor by what of it the camera can see
  const addBox = (box) => {
    box.expandByScalar(MARGIN_WORLD);
    // shader cuts can drop cube tops down to the floor, and the ring flattens towards y = 2
    if (box.min.y > FLOOR_Y) box.min.y = FLOOR_Y;
    if (box.max.y < 2.1) box.max.y = 2.1;
    if (!_frustum.intersectsBox(box)) return;
    // (a) the box itself, in light texture space
    let a0 = Infinity, b0 = Infinity, a1 = -Infinity, b1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const x = i & 1 ? box.max.x : box.min.x, y = i & 2 ? box.max.y : box.min.y, z = i & 4 ? box.max.z : box.min.z;
      const u = uOf(x, y, z), v = vOf(x, y, z);
      if (u < a0) a0 = u; if (u > a1) a1 = u; if (v < b0) b0 = v; if (v > b1) b1 = v;
    }
    // (b) the camera's view prism cut to the box's height range
    let c0 = Infinity, d0 = Infinity, c1 = -Infinity, d1 = -Infinity, slab = true;
    for (let k = 0; k < 4 && slab; k++) {
      const A = _A[k], D = _D[k];
      if (Math.abs(D.y) < 1e-6) { slab = false; break; }
      for (let j = 0; j < 2; j++) {
        const t = ((j ? box.max.y : box.min.y) - A.y) / D.y;
        const x = A.x + D.x * t, y = A.y + D.y * t, z = A.z + D.z * t;
        const u = uOf(x, y, z), v = vOf(x, y, z);
        if (u < c0) c0 = u; if (u > c1) c1 = u; if (v < d0) d0 = v; if (v > d1) d1 = v;
      }
    }
    if (slab) { a0 = Math.max(a0, c0); a1 = Math.min(a1, c1); b0 = Math.max(b0, d0); b1 = Math.min(b1, d1); }
    if (a0 > a1 || b0 > b1) return;
    if (a0 < u0) u0 = a0; if (a1 > u1) u1 = a1; if (b0 < v0) v0 = b0; if (b1 > v1) v1 = b1;
  };
  const wind = Math.max(1, Math.abs(SPRITE_UNIFORMS.uWind.value || 0));
  scene.traverseVisible((o) => {
    if (bad || !o.receiveShadow || !(o.isMesh || o.isPoints || o.isLine)) return;
    const wb = worldBox(o, _box);
    if (wb === EMPTY) return;
    if (wb === SPRITES) {
      const B = spriteCells(o);
      if (B === EMPTY) return;
      if (!B) { bad = true; fitShadowScissor.unbounded = o.name || o.type; return; }
      for (let j = 0; j < B.length; j += 7) {
        const sway = B[j + 6] * 0.2 * wind;
        _box.min.set(B[j] - sway, B[j + 1] - sway, B[j + 2] - sway);
        _box.max.set(B[j + 3] + sway, B[j + 4] + sway, B[j + 5] + sway);
        addBox(_box.applyMatrix4(o.matrixWorld));
      }
      return;
    }
    if (!wb) { bad = true; fitShadowScissor.unbounded = o.name || o.type; return; } // (debug aid: what forced a full pass)
    addBox(_box);
  });
  if (bad) return null;
  let x0 = 0, y0 = 0, x1 = 1, y1 = 1; // nothing visible receives: a 1-texel pass
  if (u0 <= u1) {
    x0 = Math.max(0, Math.floor(u0 * W) - MARGIN_TEX); x1 = Math.min(W, Math.ceil(u1 * W) + MARGIN_TEX);
    y0 = Math.max(0, Math.floor(v0 * H) - MARGIN_TEX); y1 = Math.min(H, Math.ceil(v1 * H) + MARGIN_TEX);
    if (x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = 1; y1 = 1; }
  }
  if (x0 === 0 && y0 === 0 && x1 === W && y1 === H) return null;
  map.scissor.set(x0, y0, x1 - x0, y1 - y0);
  map.scissorTest = true;
  return light;
}
