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

// a SpriteBatch mesh (see spriteBatch.js): bound its instances from aPos/aSize
function spriteBox(o, out) {
  const g = o.geometry, P = g.attributes.aPos, S = g.attributes.aSize, Pr = g.attributes.aParams, X = g.attributes.aExtra;
  const n = Math.min(g.instanceCount, P.count);
  let c = _sprCache.get(g);
  const ver = P.version + S.version * 7 + (Pr ? Pr.version * 13 : 0) + (X ? X.version * 31 : 0);
  if (!c || c.ver !== ver || c.n !== n || c.P !== P) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity, wh = 0, sw = 0, swh = 0, bend = 0;
    const p = P.array, s = S.array, pr = Pr?.array, ex = X?.array;
    for (let i = 0; i < n; i++) {
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
      const w = Math.abs(s[i * 2]), h = Math.abs(s[i * 2 + 1]);
      if (w + h > wh) wh = w + h;
      if (pr) { const a = Math.abs(pr[i * 4]); if (a > sw) sw = a; if (a * Math.max(0.35, h) > swh) swh = a * Math.max(0.35, h); }
      if (ex) { const b = Math.abs(ex[i * 4 + 3]) * h; if (b > bend) bend = b; }
    }
    c = { ver, n, P, x0, y0, z0, x1, y1, z1, wh, sw, swh, bend };
    _sprCache.set(g, c);
  }
  if (!c.n) return EMPTY;
  if (!Number.isFinite(c.x0)) return false;
  const hc = Math.max(1, SPRITE_UNIFORMS.uHeightComp.value, SPRITE_UNIFORMS.uFlatComp.value);
  const wind = Math.max(1, Math.abs(SPRITE_UNIFORMS.uWind.value || 0));
  // corner offsets, wind sway + push, tail bend, water bob
  const R = c.wh * hc + c.swh * 0.2 * wind + c.sw * 0.6 + c.bend * 0.3 * hc + 0.5;
  out.min.set(c.x0 - R, c.y0 - R, c.z0 - R);
  out.max.set(c.x1 + R, c.y1 + R, c.z1 + R);
  out.applyMatrix4(o.matrixWorld);
  return true;
}

// world-space bounds of what `o` can draw: true, EMPTY (draws nothing) or false (unknown)
function worldBox(o, out) {
  const g = o.geometry;
  if (!g) return false;
  if (o.isBatchedMesh) return false;
  if (g.isInstancedBufferGeometry) {
    if (g.attributes.aPos && g.attributes.aSize && String(o.customDepthMaterial?.customProgramCacheKey?.()).startsWith('spriteDepth')) return spriteBox(o, out);
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
  scene.traverseVisible((o) => {
    if (bad || !o.receiveShadow || !(o.isMesh || o.isPoints || o.isLine)) return;
    const wb = worldBox(o, _box);
    if (wb === EMPTY) return;
    if (!wb) { bad = true; fitShadowScissor.unbounded = o; return; } // (debug: what forced a full pass)
    _box.expandByScalar(MARGIN_WORLD);
    // shader cuts can drop cube tops down to the floor, and the ring flattens towards y = 2
    if (_box.min.y > FLOOR_Y) _box.min.y = FLOOR_Y;
    if (_box.max.y < 2.1) _box.max.y = 2.1;
    if (!_frustum.intersectsBox(_box)) return;
    // (a) the box itself, in light texture space
    let a0 = Infinity, b0 = Infinity, a1 = -Infinity, b1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const x = i & 1 ? _box.max.x : _box.min.x, y = i & 2 ? _box.max.y : _box.min.y, z = i & 4 ? _box.max.z : _box.min.z;
      const u = uOf(x, y, z), v = vOf(x, y, z);
      if (u < a0) a0 = u; if (u > a1) a1 = u; if (v < b0) b0 = v; if (v > b1) b1 = v;
    }
    // (b) the camera's view prism cut to the box's height range
    let c0 = Infinity, d0 = Infinity, c1 = -Infinity, d1 = -Infinity, slab = true;
    for (let k = 0; k < 4 && slab; k++) {
      const A = _A[k], D = _D[k];
      if (Math.abs(D.y) < 1e-6) { slab = false; break; }
      for (let j = 0; j < 2; j++) {
        const t = ((j ? _box.max.y : _box.min.y) - A.y) / D.y;
        const x = A.x + D.x * t, y = A.y + D.y * t, z = A.z + D.z * t;
        const u = uOf(x, y, z), v = vOf(x, y, z);
        if (u < c0) c0 = u; if (u > c1) c1 = u; if (v < d0) d0 = v; if (v > d1) d1 = v;
      }
    }
    if (slab) { a0 = Math.max(a0, c0); a1 = Math.min(a1, c1); b0 = Math.max(b0, d0); b1 = Math.min(b1, d1); }
    if (a0 > a1 || b0 > b1) return;
    if (a0 < u0) u0 = a0; if (a1 > u1) u1 = a1; if (b0 < v0) v0 = b0; if (b1 > v1) v1 = b1;
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
