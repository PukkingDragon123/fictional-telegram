// [v26 world] Camera vs tall stuff. Whatever stands between the camera and the
// spot you're looking at (the north mountain, a cliff, the bears' office, a
// neighbour's house, a big build, the valley ranges) is dithered away in a
// soft circle round that spot, x-ray style, like the foliage see-through.
//
// The focus is the camera target at ground height. A fragment is cut when it
// is closer to the camera than the focus (along the view direction), within
// `uCutR` of the focus on screen (the camera is orthographic: the distance
// off the view line IS the screen distance), and higher than the focus plus a
// clearance (so the ground you look at, and anything at its level, stays).
// Opaque materials discard on an ordered dither (no sorting, keeps depth);
// sprites fade through their own dither alpha.
import * as THREE from 'three';
import { addGrain } from '../core/voxel.js';

export const CUT_UNIFORMS = {
  uCutPos: { value: new THREE.Vector3(0, -999, 0) },
  uCutBack: { value: new THREE.Vector3(0, 0.7, 0.7) },
  uCutR: { value: 0 },
  uCutK: { value: 0 },
};

export const CUT_GLSL = /* glsl */ `
uniform vec3 uCutPos;
uniform vec3 uCutBack;
uniform float uCutR;
uniform float uCutK;
float cutAmount(vec3 p, float clearance) {
  if (uCutK <= 0.0) return 0.0;
  vec3 d = p - uCutPos;
  // in front of the spot on the ground (things standing AT the spot - the office
  // you're looking at - are never cut), and off the view line by less than uCutR
  float alongH = dot(d.xz, normalize(uCutBack.xz + vec2(1e-5)));
  if (alongH < 2.0) return 0.0;
  float along = dot(d, uCutBack);
  float r = length(d - uCutBack * along);
  float up = p.y - uCutPos.y;
  return uCutK * (1.0 - smoothstep(uCutR * 0.5, uCutR, r)) * smoothstep(2.0, 4.5, alongH) * smoothstep(clearance, clearance + 1.2, up);
}
float cutBayer(vec2 a) {
  ivec2 q = ivec2(mod(floor(a), 4.0));
  int i = q.x + q.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
`;

// opaque (Lambert / Basic) materials: dithered discard. clearance in world units.
export function patchCutawayMaterial(mat, key, clearance = 1.2) {
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
  float ck = cutAmount(vCutW, ${clearance.toFixed(2)});
  if (ck > 0.0 && ck * 0.86 > cutBayer(gl_FragCoord.xy)) discard;
}`);
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|cut:' + key;
  mat.userData = { ...(mat.userData || {}), cutaway: true };
  mat.needsUpdate = true;
  return mat;
}

// sprite batches (spriteBatch.js materials): fade the whole sprite (it stands on
// high ground in front of the spot: a tree on the mountain you look past)
export function patchCutawaySprites(mat, key) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    if (prev) prev.call(mat, shader, r);
    Object.assign(shader.uniforms, CUT_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + CUT_GLSL)
      .replace('vSEmis = aExtra.z;\n', 'vSEmis = aExtra.z;\nvSAlpha *= 1.0 - cutAmount(aPos + vec3(0.0, 0.3, 0.0), 1.4) * 0.9;\n');
  };
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
  return mat;
}

// one shared see-through copy of the voxel material (office, houses, landmarks, big builds)
let cutVoxel = null;
export function cutVoxelMaterial() {
  if (!cutVoxel) cutVoxel = patchCutawayMaterial(addGrain(new THREE.MeshLambertMaterial({ vertexColors: true })), 'voxel', 1.0);
  return cutVoxel;
}

const _v = new THREE.Vector3();
const _box = new THREE.Box3();

export class Cutaway {
  constructor(world) {
    this.world = world;
    this.scanT = 0;
    this.k = 0;
    this.swapped = new WeakSet();
  }

  // swap the plain voxel material for the see-through one on tall things
  adopt(obj, minH = 0) {
    if (!obj) return;
    if (minH > 0) {
      _box.setFromObject(obj);
      if (_box.isEmpty() || _box.max.y - _box.min.y < minH) return;
    }
    if (obj.userData?.noCut) return;
    obj.traverse((o) => {
      if (!o.isMesh || this.swapped.has(o)) return;
      this.swapped.add(o);
      const m = o.material;
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
    if (!game) return;
    for (const v of game.villagers?.list || []) if (v.props) for (const c of v.props.children) if (c.userData?.door || c.userData?.house || c.children.length > 3) this.adopt(c, 1.6);
    for (const s of game.structures?.list || []) if (s.mesh && s.built) this.adopt(s.mesh, 2.2);
  }

  update(rig, game, dt = 0.016) {
    const U = CUT_UNIFORMS;
    const W = this.world, g = W.grid;
    if (!rig?.camera) return;
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 2; try { this.scan(game); } catch (e) { console.warn('cutaway scan', e); this.scanT = 30; } }
    const off = game?.titleMode || game?.overrideScene || game?.classroom?.active || game?.homes?.active;
    this.k += ((off ? 0 : 1) - this.k) * Math.min(1, dt * 6);
    U.uCutK.value = this.k;
    const t = rig.target;
    const x = t.x, z = t.z;
    let y = t.y || 0;
    if (g.inb(Math.floor(x), Math.floor(z))) y = Math.max(y, g.surfaceAtVisual(x, z));
    U.uCutPos.value.set(x, y, z);
    const e = rig.camera.matrixWorld.elements;
    U.uCutBack.value.set(e[8], e[9], e[10]).normalize();
    const vw = (rig._rt?.w || 400) * rig.wupp, vh = (rig._rt?.h || 300) * rig.wupp;
    U.uCutR.value = Math.max(3.5, Math.min(vw, vh) * 0.46);
  }
}

export { _v };
