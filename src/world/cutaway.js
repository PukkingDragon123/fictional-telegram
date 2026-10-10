// [v26 world] Camera vs tall stuff. [v26 mountains] reworked: only what truly
// hides the spot you look at is cut, and it is cut along your line of sight.
//
// The focus F is the camera target at its ground height. Every frame a few
// rays are marched from F (and points just round it) towards the camera over
// the heightfield (map + valley ranges) and the boxes of tall buildings. Only
// when something really stands in the way does the cut fade in (uCutK), and
// it only removes what rises above the sight line: a sloped "window" plane
// through F towards the camera, `uCutW.w` above F, opening `uCutW.y` in front
// of F and widening with steep block steps `uCutW.x` to each side. So a slope
// you look at, a cliff you stand next to, or a mountain beside the view is
// never touched; a ridge in front of the spot gets a stepped notch, whole
// blocks, with real block tops (terrain + valley cubes do it per column in the
// vertex shader), buildings / trees in that notch dither out over ~1 unit (no
// hard slice planes). When uCutK fades the window sinks block by block.
import * as THREE from 'three';
import { addGrain } from '../core/voxel.js';

export const CUT_UNIFORMS = {
  uCutPos: { value: new THREE.Vector3(0, -999, 0) },
  uCutBack: { value: new THREE.Vector3(0, 0.7, 0.7) },
  uCutK: { value: 0 },
  uCutW: { value: new THREE.Vector4(3, 1.5, 0.97, 0.75) }, // half width, front gap, tan(pitch), clearance
  // (kept for old references)
  uCutR: { value: 0 },
  uCutPlane: { value: 999 },
  uCutFar: { value: 40 },
  uCubeMask: { value: null },
  uCubeGrid: { value: new THREE.Vector2(1, 1) },
};
const SIDE_SLOPE = 1.4; // window walls: height gained per unit to the side

const CUT_CORE = /* glsl */ `
uniform vec3 uCutPos;
uniform vec3 uCutBack;
uniform float uCutK;
uniform vec4 uCutW;
// height above which something at xz stands between the camera and the spot
float cutCap(vec2 xz) {
  if (uCutK <= 0.002) return 999.0;
  vec2 dir = normalize(uCutBack.xz + vec2(1e-5));
  vec2 d = xz - uCutPos.xz;
  float a = dot(d, dir);
  if (a < uCutW.y * 0.4) return 999.0; // at / behind the spot: never
  float l = abs(d.x * dir.y - d.y * dir.x);
  float c = uCutPos.y + uCutW.w + max(0.0, a - uCutW.y) * uCutW.z + max(0.0, l - uCutW.x) * ${SIDE_SLOPE.toFixed(2)};
  return c + (1.0 - uCutK) * (1.0 - uCutK) * 48.0;
}
// the same, in whole blocks of size bs (columns)
float cutCapQ(vec2 xz, float bs) { float c = cutCap(xz); return c > 900.0 ? 999.0 : floor(c / bs + 0.001) * bs; }
`;

// vertex-stage helpers for block columns (declares its own uniforms)
export const CUT_PLANE_GLSL = CUT_CORE + /* glsl */ `
float mapCap(vec2 c) { return cutCapQ(c, 0.5); }
`;

export const CUT_GLSL = CUT_CORE + /* glsl */ `
// 0..1 how much of a fragment / sprite at p is cut (soft over ~1 unit above the window)
float cutAmount(vec3 p, float soft) {
  float c = cutCap(p.xz);
  if (c > 900.0) return 0.0;
  return smoothstep(c, c + soft, p.y);
}
float cutBayer(vec2 a) {
  ivec2 q = ivec2(mod(floor(a), 4.0));
  int i = q.x + q.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
`;

// opaque (Lambert / Basic) materials: dithered discard. soft = fade band in world units.
export function patchCutawayMaterial(mat, key, soft = 1.0) {
  if (mat.userData?.cutaway) return mat;
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  mat.onBeforeCompile = (shader, r) => {
    if (prev) prev.call(mat, shader, r);
    Object.assign(shader.uniforms, CUT_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCutW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 cw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  cw = instanceMatrix * cw;
  #endif
  vCutW = (modelMatrix * cw).xyz;
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCutW;\n' + CUT_GLSL)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
{
  float ck = cutAmount(vCutW, ${Math.max(0.2, soft).toFixed(2)});
  if (ck > 0.0 && ck * 0.97 > cutBayer(gl_FragCoord.xy)) discard;
}`);
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|cut2:' + key;
  mat.userData = { ...(mat.userData || {}), cutaway: true };
  mat.needsUpdate = true;
  return mat;
}

// sprite batches (spriteBatch.js materials): a tree / rock / bush whose foot is
// cut away goes, one whose crown pokes far into the window fades (dither alpha);
// reach 0: small stuff (rocks, bushes) goes only with its block
export function patchCutawaySprites(mat, key, reach = 1.1) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    if (prev) prev.call(mat, shader, r);
    Object.assign(shader.uniforms, CUT_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + CUT_GLSL)
      .replace('vSEmis = aExtra.z;\n', `vSEmis = aExtra.z;
{
  float cc = cutCap(aPos.xz);
  ${reach > 0 ? `if (cc < 900.0) vSAlpha *= 1.0 - smoothstep(-0.25, 0.75, aPos.y + ${reach.toFixed(2)} - cc);`
    : 'if (cc < 900.0 && aPos.y > floor(cc / 0.5 + 0.001) * 0.5 + 0.05) vSAlpha = 0.0; // its block was cut away'}
}
`);
  };
  mat.customProgramCacheKey = () => key + '3';
  mat.needsUpdate = true;
  return mat;
}

// one shared see-through copy of the voxel material (office, houses, landmarks, big builds)
let cutVoxel = null;
export function cutVoxelMaterial() {
  if (!cutVoxel) cutVoxel = patchCutawayMaterial(addGrain(new THREE.MeshLambertMaterial({ vertexColors: true })), 'voxel', 1.0);
  return cutVoxel;
}

// ---- CPU mirrors (the occlusion test must see the world the shaders draw)
// the valley ranges' camera-side cut (cubeMountains.js capAt)
export const RING_CAP_GLSL = /* glsl */ `
float ringCapRaw(vec2 c, float bs) {
  vec2 cl = clamp(c, uRect.xy, uRect.zw);
  float d = length(c - cl);
  if (d < 0.5) return 999.0;
  vec2 outDir = (c - cl) / d;
  float r = smoothstep(0.42, -0.12, dot(outDir, uRingCam));
  if (r >= 0.97) return 999.0;
  return bs + floor(r * r * (4.0 + d) / max(0.03, 1.0 - r) / bs) * bs;
}
`;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function ringCapJS(x, z, W, H, cx, cz, bs = 1) {
  const lx = Math.min(W, Math.max(0, x)), lz = Math.min(H, Math.max(0, z));
  const d = Math.hypot(x - lx, z - lz);
  if (d < 0.5) return 999;
  const r = smooth(0.42, -0.12, ((x - lx) * cx + (z - lz) * cz) / d);
  if (r >= 0.97) return 999;
  return bs + Math.floor(r * r * (4 + d) / Math.max(0.03, 1 - r) / bs) * bs;
}

const _box = new THREE.Box3();

export class Cutaway {
  constructor(world) {
    this.world = world;
    this.scanT = 0;
    this.k = 0;
    this.occ = 0;
    this.hold = 0;
    this.swapped = new WeakSet();
    this.boxes = []; // [x0, y0, z0, x1, y1, z1] of tall see-through things
    this.adopted = new Set();
  }

  // swap the plain voxel material for the see-through one on tall things
  adopt(obj, minH = 0) {
    if (!obj) return;
    if (minH > 0) {
      _box.setFromObject(obj);
      if (_box.isEmpty() || _box.max.y - _box.min.y < minH) return;
    }
    if (obj.userData?.noCut) return;
    this.adopted.add(obj);
    const glow = this.world.glowMat;
    obj.traverse((o) => {
      if (!o.isMesh || this.swapped.has(o)) return;
      this.swapped.add(o);
      const m = o.material;
      // lit windows: a see-through copy that shares the world's glow colour (day / night)
      if (glow && m === glow) {
        if (!this.cutGlow) { this.cutGlow = new THREE.MeshBasicMaterial({ vertexColors: true }); this.cutGlow.color = glow.color; patchCutawayMaterial(this.cutGlow, 'glow', 1.0); }
        o.material = this.cutGlow;
        return;
      }
      if (!m || Array.isArray(m) || !m.isMeshLambertMaterial || !m.vertexColors || m.map || m.transparent) return;
      if (m.userData?.cutaway) return;
      // only the (shared) grainy voxel material: same look + the cut
      const key = m.customProgramCacheKey?.();
      if (typeof key !== 'string' || !key.startsWith('grain')) return;
      o.material = cutVoxelMaterial();
    });
  }

  // every couple of seconds: buildings that appeared (houses on reveal, big builds)
  scan(game) {
    const W = this.world;
    this.adopt(W.office);
    for (const grp of Object.values(W.landmarkObjs || {})) this.adopt(grp);
    if (W.deep?.group) this.adopt(W.deep.group);
    if (game) {
      for (const v of game.villagers?.list || []) if (v.props) for (const c of v.props.children) if (c.userData?.door || c.userData?.house || c.children.length > 3) this.adopt(c, 1.6);
      for (const s of game.structures?.list || []) if (s.mesh && s.built) this.adopt(s.mesh, 2.2);
    }
    // their boxes (things that hide the spot without any terrain in the way)
    this.boxes.length = 0;
    for (const o of this.adopted) {
      if (!o.parent || !o.visible) { if (!o.parent) this.adopted.delete(o); continue; }
      _box.setFromObject(o);
      if (_box.isEmpty() || _box.max.y - _box.min.y < 1.2) continue;
      const sx = _box.max.x - _box.min.x, sz = _box.max.z - _box.min.z;
      if (sx > 40 || sz > 40) continue; // a whole zone group: its parts are terrain-ish, skip
      this.boxes.push([_box.min.x, _box.min.y, _box.min.z, _box.max.x, _box.max.y, _box.max.z]);
    }
  }

  // what the shaders draw (map + valley ranges with their camera-side cut)
  heightAt(x, z) {
    const g = this.world.grid;
    const ix = Math.floor(x), iz = Math.floor(z);
    if (g.inb(ix, iz)) return g.cube?.[iz * g.w + ix] ? g.height[iz * g.w + ix] : g.surfaceAtVisual(x, z);
    const R = this.world.ring;
    if (!R?.heightAt) return 0;
    return Math.min(R.heightAt(x, z), ringCapJS(x, z, g.w, g.h, this._rc[0], this._rc[1], 1));
  }

  // does anything stand between (x, y, z) and the camera?
  blocked(x, y, z, bx, bz, tanP) {
    const step = 0.35;
    for (let t = 0.7; t < 70; t += step) {
      const px = x + bx * t, pz = z + bz * t, py = y + t * tanP;
      if (py > 46) return false;
      if (this.heightAt(px, pz) > py + 0.3) return true;
    }
    return false;
  }

  blockedByBox(x, y, z, bx, bz, tanP) {
    for (const b of this.boxes) {
      // slab test of the ray (x,y,z) + t (bx, tanP, bz), t > 0.8
      let t0 = 0.8, t1 = 80;
      const o = [x, y, z], d = [bx, tanP, bz];
      let hit = true;
      for (let k = 0; k < 3; k++) {
        const lo = b[k], hi = b[k + 3];
        if (Math.abs(d[k]) < 1e-6) { if (o[k] < lo || o[k] > hi) { hit = false; break; } continue; }
        let ta = (lo - o[k]) / d[k], tb = (hi - o[k]) / d[k];
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) { hit = false; break; }
      }
      if (hit) return true;
    }
    return false;
  }

  update(rig, game, dt = 0.016) {
    const U = CUT_UNIFORMS;
    const W = this.world, g = W.grid;
    if (!rig?.camera) return;
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 2; try { this.scan(game); } catch (e) { console.warn('cutaway scan', e); this.scanT = 30; } }
    const off = game?.titleMode || game?.overrideScene || game?.classroom?.active || game?.homes?.active;
    const t = rig.target;
    const x = t.x, z = t.z;
    let y = t.y || 0;
    if (g.inb(Math.floor(x), Math.floor(z))) y = Math.max(y, g.surfaceAtVisual(x, z));
    const e = rig.camera.matrixWorld.elements;
    const back = U.uCutBack.value.set(e[8], e[9], e[10]).normalize();
    const hl = Math.hypot(back.x, back.z) || 1e-5;
    const bx = back.x / hl, bz = back.z / hl, tanP = Math.max(0.05, back.y / hl);
    this._rc = [Math.sin(rig.yaw || 0), Math.cos(rig.yaw || 0)];
    // the window: a fraction of the view, a few tiles at most
    const vw = (rig._rt?.w || 400) * rig.wupp, vh = (rig._rt?.h || 300) * rig.wupp;
    const half = Math.max(1.6, Math.min(6.5, Math.min(vw, vh) * 0.36));
    const front = Math.max(1.0, half * 0.5);
    // occlusion: the spot itself, and two points either side of it
    let occ = 0;
    if (!off) {
      const sx = -bz, sz = bx, side = Math.min(1.4, half * 0.5);
      const pts = [[x, z, 2], [x + sx * side, z + sz * side, 1], [x - sx * side, z - sz * side, 1]];
      let n = 0;
      for (const [px, pz, wgt] of pts) {
        let py = y;
        if (wgt < 2) { const ix = Math.floor(px), iz = Math.floor(pz); py = g.inb(ix, iz) ? g.surfaceAtVisual(px, pz) : y; if (py > y + 1.5) continue; }
        if (this.blocked(px, py + 0.15, pz, bx, bz, tanP) || this.blockedByBox(px, py + 0.4, pz, bx, bz, tanP)) n += wgt;
      }
      occ = n >= 2 ? 1 : 0;
    }
    // hysteresis: switch on at once, off only after a moment in the clear
    if (occ) this.hold = 0.5; else this.hold -= dt;
    const goal = this.hold > 0 ? 1 : 0;
    this.k += (goal - this.k) * Math.min(1, dt * (goal ? 4.5 : 3));
    if (this.k < 0.003) this.k = 0;
    this.occ = occ;
    U.uCutK.value = this.k;
    U.uCutPos.value.set(x, y, z);
    U.uCutW.value.set(half, front, tanP, 0.75);
  }
}
