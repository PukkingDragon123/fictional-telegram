// [v32 dive] Under Loon Lake: the whole underwater diorama the dive mode renders
// (src/game/dive/DiveMode.js swaps it in through game.overrideScene, like the homes).
//
// Side-on view of a slice of the lake, ~58 units wide: the sandy shallows under Chief's dock
// on the left (x < -14), the weedy middle where the farms go, the Deep Hole on the right
// (x > 11) with the old barge, a ridge of rock and kelp at the back, the surface seen from
// below as a shimmering band across the top. Everything soft is quantised and ordered-
// dithered on the low-res pixel grid (gl_FragCoord), never smooth:
//   - caustics: a rippling light net on every up-facing surface (3 dithered steps)
//   - depth: the deeper, the bluer and darker (4 dithered steps); far things fade into the
//     water through a dithered fog (THREE.Fog with a NEGATIVE near = "dither me", see FOG_PATCH)
//   - light shafts from the surface: additive, 3 dithered steps, slow flicker
//   - the surface from below: Snell's window, ripple lines, glints, lily pads in silhouette
//   - the backdrop: a dithered gradient into the deep with far kelp and rock silhouettes
// Plants sway in the current (per-vertex `sway` attribute) and bend away from the diver.
//
//   const S = buildDiveScene({ wreck: 'old' | 'restored' });
//   S.scene, S.bedH(x, z), S.update(dt, t, diver), S.dispose(), S.anchors, S.obstacles, S.SURF
import * as THREE from 'three';
import { VS, hash3 } from './critterKit.js';
import { VoxelModel } from '../core/voxel.js';
import {
  diveGeo, rockModel, logModel, kelpModel, grassModel, coontailModel, lilyStemModel, lilyPadModel, reedModel,
  bargeModel,
} from './diveModels.js';

export const SURF = 6.0; // water surface (world y)
export const X0 = -29, X1 = 31, Z0 = -13, Z1 = 7;
export const DEEP_X = 11; // the Deep Hole starts here
export const FARM_AREA = { x0: -12.5, x1: 9.5, z0: -4.6, z1: 2.4 };
const { abs, floor, sin, PI } = Math;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ dithered fog for every material
// THREE's fog chunk with one addition: when fogNear is NEGATIVE the factor is quantised into
// 5 steps with the same 4x4 ordered dither the pixel renderer uses. The main world never uses
// a negative near (weather fog is 1e5), so it renders exactly as before.
const FOG_PATCH = `#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( abs( fogNear ), fogFar, vFogDepth );
		if ( fogNear < 0.0 ) {
			vec2 fq = floor( gl_FragCoord.xy );
			vec2 fh = floor( fq * 0.5 );
			float fb = fract( fh.x * 0.5 + fh.y * fh.y * 0.75 ) * 0.25 + fract( fq.x * 0.5 + fq.y * fq.y * 0.75 );
			fogFactor = floor( fogFactor * 5.0 + fb * 0.94 ) / 5.0;
		}
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
if (!THREE.ShaderChunk.fog_fragment.includes('fogNear < 0.0')) THREE.ShaderChunk.fog_fragment = FOG_PATCH;

// ------------------------------------------------------------------ shared uniforms
export const UW = {
  uTime: { value: 0 },
  uSurf: { value: SURF },
  uPush: { value: new THREE.Vector4(0, -99, 0, 1.2) }, // diver (x, y, z, radius): plants bend away
  uCaus: { value: 1 },
};
const GLSL_COMMON = /* glsl */ `
uniform float uTime;
uniform float uSurf;
uniform float uCaus;
varying vec3 vUwPos;
varying vec3 vUwNor;
float uwB(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float uwBay(vec2 a) { return uwB(0.5 * a) * 0.25 + uwB(a); }
float uwHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float uwNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(uwHash(i), uwHash(i + vec2(1, 0)), f.x), mix(uwHash(i + vec2(0, 1)), uwHash(i + vec2(1, 1)), f.x), f.y); }
float uwCaus(vec2 p, float t) {
  vec2 q = p * 0.95;
  float a = sin(q.x * 2.3 + sin(q.y * 1.9 + t * 0.8) * 1.3 + t * 0.6);
  float b = sin(q.y * 2.1 - sin(q.x * 1.7 - t * 0.7) * 1.4 - t * 0.5);
  float c = sin((q.x + q.y) * 1.6 + t * 0.9);
  return clamp(1.0 - abs(a + b + c * 0.6) / 1.35, 0.0, 1.0);
}
`;
const GLSL_LIGHT = /* glsl */ `
{
  float bay = uwBay(gl_FragCoord.xy);
  float depthK = clamp((uSurf - vUwPos.y) / 10.0, 0.0, 1.0);
  float up = clamp(vUwNor.y * 0.85 + 0.25, 0.0, 1.0);
  float cz = uwCaus(vUwPos.xz + vec2(vUwPos.y * 0.35, 0.0), uTime);
  cz = cz * cz * cz * cz * cz;
  float cq = floor(cz * 3.0 + bay * 0.92) / 3.0;
  outgoingLight += vec3(0.55, 0.9, 0.95) * cq * up * (1.0 - depthK * 0.75) * 0.42 * uCaus;
  float dk = floor(depthK * 4.0 + bay) / 4.0;
  outgoingLight *= mix(vec3(1.0), vec3(0.36, 0.56, 0.7), dk * 0.8);
}
`;
const GLSL_VERT_PRE = /* glsl */ `
uniform float uTime;
uniform vec4 uPush;
uniform float uSwayAmp;
varying vec3 vUwPos;
varying vec3 vUwNor;
#ifdef UW_SWAY
attribute float sway;
#endif
`;
const GLSL_SWAY = /* glsl */ `
#ifdef UW_SWAY
{
  vec3 wo = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #ifdef USE_INSTANCING
  wo += instanceMatrix[3].xyz;
  #endif
  float ph = wo.x * 0.7 + wo.z * 1.3;
  float s = sway * sway;
  transformed.x += (sin(uTime * 1.05 + ph + position.y * 0.9) * 0.6 + sin(uTime * 0.55 + ph * 0.5) * 0.4) * s * uSwayAmp;
  transformed.z += cos(uTime * 0.85 + ph + position.y * 0.7) * s * uSwayAmp * 0.35;
  vec3 wp = wo + transformed;
  vec2 dd = wp.xy - uPush.xy;
  float near = max(0.0, 1.0 - length(vec2(dd.x, (wp.z - uPush.z) * 0.6)) / uPush.w) * step(abs(dd.y), uPush.w * 1.6);
  transformed.x += sign(dd.x) * near * s * 0.7;
}
#endif
`;
const GLSL_WORLD = /* glsl */ `
{
  vec4 uwWp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  uwWp = instanceMatrix * uwWp;
  #endif
  uwWp = modelMatrix * uwWp;
  vUwPos = uwWp.xyz;
  vec3 uwN = objectNormal;
  #ifdef USE_INSTANCING
  uwN = mat3(instanceMatrix) * uwN;
  #endif
  vUwNor = normalize(mat3(modelMatrix) * uwN);
}
`;

const matCache = new Map();
/**
 * Underwater voxel material: Lambert + vertex colours + per-voxel grain (aligned like critterKit's
 * matFor) + caustics + depth tint; `sway` (amplitude, world units) makes it a swaying plant.
 */
export function uwMat(geo, { sway = 0, grain = 0.09, emissive = 0 } = {}) {
  const sc = geo.userData.scale || VS, off = geo.userData.grain || [0, 0, 0];
  const key = `${sc}|${off.join(',')}|${sway}|${grain}|${emissive}`;
  let m = matCache.get(key);
  if (m) return m;
  m = new THREE.MeshLambertMaterial({ vertexColors: true, emissive });
  const o = new THREE.Vector3(...off);
  const freq = (1 / sc).toFixed(2);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = UW.uTime; shader.uniforms.uSurf = UW.uSurf; shader.uniforms.uPush = UW.uPush; shader.uniforms.uCaus = UW.uCaus;
    shader.uniforms.uSwayAmp = { value: sway };
    shader.uniforms.uGrainOff = { value: o };
    if (sway) shader.defines = { ...(shader.defines || {}), UW_SWAY: 1 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + GLSL_VERT_PRE + 'varying vec3 vGrPos;\nvarying vec3 vGrNor;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrPos = position;\nvGrNor = normal;\n' + GLSL_SWAY)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + GLSL_WORLD);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + 'uniform vec3 uGrainOff;\nvarying vec3 vGrPos;\nvarying vec3 vGrNor;')
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 an = abs(vGrNor);
  vec3 g = vGrPos * ${freq} + uGrainOff;
  vec2 cell = an.y > 0.5 ? g.xz : (an.x > 0.5 ? g.zy : g.xy);
  diffuseColor.rgb *= 1.0 + (uwHash(floor(cell + 0.001)) - 0.5) * ${grain.toFixed(3)};
}`)
      .replace('#include <opaque_fragment>', GLSL_LIGHT + '#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'uwvox' + freq + (sway ? 's' : '') + grain;
  matCache.set(key, m);
  return m;
}

// ------------------------------------------------------------------ the lake bed
function bedNoise(x, z) {
  return (hash3(floor(x * 0.18), 0, floor(z * 0.18)) * 0.5 + hash3(floor(x * 0.5 + 7), 3, floor(z * 0.5)) * 0.3) - 0.4;
}
function vn2(x, z, s) {
  const xi = floor(x), zi = floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const h = (a, b) => hash3(a, s, b);
  return (h(xi, zi) * (1 - u) + h(xi + 1, zi) * u) * (1 - v) + (h(xi, zi + 1) * (1 - u) + h(xi + 1, zi + 1) * u) * v;
}
/** Raw lake-bed height (world y) at (x, z), before terracing. */
export function bedRaw(x, z) {
  let h = 0.3 + (vn2(x * 0.16, z * 0.16, 1) - 0.5) * 1.0 + (vn2(x * 0.5, z * 0.5, 2) - 0.5) * 0.25 + sin(x * 0.33) * 0.12;
  h += smooth(-13, -28, x) * 4.0; // the shallows under the dock
  const deep = smooth(DEEP_X - 2, DEEP_X + 4, x) * (1 - smooth(26, 31, x));
  h -= deep * (4.3 - smooth(3.5, 9, abs(z + 2)) * 2.6); // the Deep Hole
  h += smooth(-5.5, -12, z) * 2.8; // the back ridge
  h += smooth(3.2, 7, z) * 0.55; // the front lip
  return h;
}
const TER = 0.1; // terrace step (2 voxels)
export const bedH = (x, z) => Math.round(bedRaw(x, z) / TER) * TER;
void bedNoise;

function bedGeometry(cell = 0.25) {
  const nx = Math.round((X1 - X0) / cell), nz = Math.round((Z1 - Z0) / cell);
  const H = new Float32Array((nx + 2) * (nz + 2));
  const hAt = (i, k) => H[(k + 1) * (nx + 2) + (i + 1)];
  for (let k = -1; k <= nz; k++) for (let i = -1; i <= nx; i++) H[(k + 1) * (nx + 2) + (i + 1)] = bedH(X0 + (i + 0.5) * cell, Z0 + (k + 0.5) * cell);
  const pos = [], nor = [];
  const quad = (a, b, c, d, n) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); for (let j = 0; j < 6; j++) nor.push(...n); };
  for (let k = 0; k < nz; k++)
    for (let i = 0; i < nx; i++) {
      const x0 = X0 + i * cell, x1 = x0 + cell, z0 = Z0 + k * cell, z1 = z0 + cell, h = hAt(i, k);
      quad([x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], [0, 1, 0]);
      // sides down to lower neighbours (only the faces that can be seen)
      const hr = i < nx - 1 ? hAt(i + 1, k) : h - 2;
      if (hr < h) quad([x1, hr, z1], [x1, hr, z0], [x1, h, z0], [x1, h, z1], [1, 0, 0]);
      const hl = i > 0 ? hAt(i - 1, k) : h - 2;
      if (hl < h) quad([x0, hl, z0], [x0, hl, z1], [x0, h, z1], [x0, h, z0], [-1, 0, 0]);
      const hf = k < nz - 1 ? hAt(i, k + 1) : h - 3;
      if (hf < h) quad([x0, hf, z1], [x1, hf, z1], [x1, h, z1], [x0, h, z1], [0, 0, 1]);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
function bedMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = UW.uTime; shader.uniforms.uSurf = UW.uSurf; shader.uniforms.uPush = UW.uPush; shader.uniforms.uCaus = UW.uCaus;
    shader.uniforms.uSwayAmp = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + GLSL_VERT_PRE)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + GLSL_WORLD);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
{
  // sand, drawn texel by texel (0.05 units = one voxel): ripples, dunes, silt, pebbles, weed
  vec2 P = vUwPos.xz;
  vec2 cell = floor(P / 0.05);
  float n1 = uwHash(cell);
  float big = uwNoise(P * 0.22) * 0.65 + uwNoise(P * 0.61 + 7.0) * 0.35;
  float rp = sin(P.x * 6.6 + sin(P.y * 1.7) * 1.7 + sin(P.y * 4.3 + P.x * 0.4) * 0.45);
  float t = 0.5 + rp * 0.22 + (big - 0.5) * 0.5 + (n1 - 0.5) * 0.12;
  vec3 s0 = vec3(0.42, 0.34, 0.22), s1 = vec3(0.56, 0.46, 0.30), s2 = vec3(0.69, 0.58, 0.39), s3 = vec3(0.80, 0.70, 0.49), s4 = vec3(0.88, 0.80, 0.60);
  vec3 c = t < 0.28 ? s0 : t < 0.45 ? s1 : t < 0.62 ? s2 : t < 0.78 ? s3 : s4;
  // the ripple crests catch a lighter line, the troughs a darker one
  if (rp > 0.86 && n1 > 0.25) c = s4;
  if (rp < -0.9) c = s1;
  // silt and weed patches
  float silt = uwNoise(P * 0.35 + 3.0);
  if (silt > 0.66) c = mix(c, n1 > 0.5 ? vec3(0.36, 0.38, 0.24) : vec3(0.30, 0.33, 0.21), 0.85);
  else if (silt > 0.6 && n1 > 0.55) c = vec3(0.34, 0.40, 0.24);
  // pebbles: little two-tone clusters
  float pb = uwHash(floor(P / 0.15));
  if (pb > 0.955) { vec2 f = fract(P / 0.15); c = f.y > 0.5 ? (f.x < 0.5 ? vec3(0.62, 0.62, 0.62) : vec3(0.5, 0.5, 0.52)) : vec3(0.36, 0.36, 0.38); }
  // steps and slopes: dark silt-rock, the deep: mud
  if (vUwNor.y < 0.5) c = mix(vec3(0.30, 0.27, 0.22), vec3(0.40, 0.36, 0.28), step(0.5, n1));
  float deep = clamp((-vUwPos.y - 0.6) / 2.4, 0.0, 1.0);
  float dq = floor(deep * 3.0 + uwBay(gl_FragCoord.xy)) / 3.0;
  c = mix(c, mix(vec3(0.20, 0.22, 0.20), vec3(0.26, 0.28, 0.24), step(0.6, n1)), dq * 0.85);
  diffuseColor.rgb = c;
}`)
      .replace('#include <opaque_fragment>', GLSL_LIGHT + '#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'uwbed';
  return m;
}

// ------------------------------------------------------------------ the surface from below
function surfaceMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: UW.uTime },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec3 vWp; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec3 vWp;
      float uwB(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
      float bay4(vec2 a) { return uwB(0.5 * a) * 0.25 + uwB(a); }
      float hs(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float rip(vec2 q, float t) {
        float a = sin(q.x * 2.6 + sin(q.y * 2.2 + t * 1.1) * 1.4 + t * 0.9);
        float b = sin(q.y * 2.4 - sin(q.x * 1.9 - t * 0.9) * 1.5 - t * 0.7);
        return clamp(1.0 - abs(a + b) / 1.2, 0.0, 1.0);
      }
      void main() {
        float bay = bay4(gl_FragCoord.xy);
        vec2 p = vWp.xz;
        // Snell's window: bright overhead (front), the back mirrors the dark lake (total internal reflection)
        float win = clamp((vWp.z + 10.0) / 15.0, 0.0, 1.0);
        float r = rip(p * 0.75, uTime);
        float r2 = rip(p * 1.6 + 3.0, uTime * 1.3);
        float t = win * 0.78 + r * r * 0.32 + r2 * 0.08 - 0.06;
        float q = floor(clamp(t, 0.0, 1.0) * 5.0 + bay * 0.95) / 5.0;
        vec3 c0 = vec3(0.10, 0.30, 0.36), c1 = vec3(0.16, 0.44, 0.50), c2 = vec3(0.32, 0.64, 0.70), c3 = vec3(0.58, 0.85, 0.86), c4 = vec3(0.86, 0.98, 0.94), c5 = vec3(1.0, 1.0, 0.94);
        vec3 c = q < 0.1 ? c0 : q < 0.3 ? c1 : q < 0.5 ? c2 : q < 0.7 ? c3 : q < 0.9 ? c4 : c5;
        // sun glints dancing on the ripples
        if (r > 0.93 && hs(floor(p / 0.06) + floor(uTime * 3.0)) > 0.8 && win > 0.35) c = c5;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

// ------------------------------------------------------------------ light shafts
function shaftMaterial(seed, strength = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: UW.uTime, uSeed: { value: seed }, uK: { value: strength } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uSeed; uniform float uK; varying vec2 vUv;
      float uwB(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
      float bay4(vec2 a) { return uwB(0.5 * a) * 0.25 + uwB(a); }
      void main() {
        float edge = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
        float streak = 0.55 + 0.45 * sin(vUv.x * 16.0 + sin(vUv.y * 3.0 + uTime * 0.4 + uSeed) * 1.2 + uSeed * 5.0);
        float flick = 0.62 + 0.38 * sin(uTime * 0.7 + uSeed * 3.1) * sin(uTime * 0.43 + uSeed);
        float a = edge * streak * flick * pow(vUv.y, 1.3) * uK;
        float q = floor(a * 3.2 + bay4(gl_FragCoord.xy) * 0.96) / 3.0;
        if (q <= 0.0) discard;
        gl_FragColor = vec4(vec3(0.34, 0.6, 0.58) * q * 0.55, 1.0);
      }`,
  });
}

// ------------------------------------------------------------------ the backdrop into the deep
function backdropMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: UW.uTime },
    vertexShader: /* glsl */ `varying vec3 vWp; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec3 vWp;
      float uwB(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
      float bay4(vec2 a) { return uwB(0.5 * a) * 0.25 + uwB(a); }
      float hs(float x) { return fract(sin(x * 127.1) * 43758.5453); }
      void main() {
        float bay = bay4(gl_FragCoord.xy);
        float y = vWp.y, x = vWp.x;
        // gradient: lit near the surface, deep blue-black at the bottom (6 dithered steps)
        float t = clamp((y + 5.0) / 12.5, 0.0, 1.0);
        float shafts = 0.07 * max(0.0, sin(x * 0.45 + 0.6 * sin(uTime * 0.2)) * sin(x * 0.17 + 1.0)) * t;
        float q = floor((t * 0.92 + shafts) * 6.0 + bay * 0.95) / 6.0;
        vec3 deep = vec3(0.03, 0.10, 0.15), mid = vec3(0.09, 0.27, 0.33), hi = vec3(0.26, 0.55, 0.60);
        vec3 c = q < 0.5 ? mix(deep, mid, q * 2.0) : mix(mid, hi, (q - 0.5) * 2.0);
        // far kelp: dark wavy columns rising from the far bed
        float col = floor(x / 0.9);
        float has = step(0.55, hs(col));
        float h = 3.0 + hs(col + 3.0) * 6.0;
        float sw = sin(y * 0.8 + uTime * 0.7 + col) * 0.18 * clamp((y + 3.0) / 8.0, 0.0, 1.0);
        float fx = abs(fract(x / 0.9) - 0.5 - sw) * 0.9;
        float leaf = step(fx, 0.06 + 0.07 * step(0.5, fract(y * 1.3 + col * 0.37)));
        if (has * leaf > 0.5 && y < -2.5 + h) c = mix(c, vec3(0.05, 0.17, 0.18), 0.75);
        // far rocks along the bottom
        float ridge = -3.2 + sin(x * 0.31) * 0.9 + sin(x * 0.87 + 1.3) * 0.4 + floor(hs(floor(x / 0.6)) * 2.0) * 0.15;
        if (y < ridge) c = vec3(0.04, 0.12, 0.15) + step(ridge - 0.25, y) * vec3(0.03, 0.06, 0.06);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

// ------------------------------------------------------------------ helpers
function inst(geo, mat, list, { shadow = false } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  const o = new THREE.Object3D();
  list.forEach((p, i) => {
    o.position.set(p.x, p.y, p.z);
    o.rotation.set(0, p.ry || 0, 0);
    o.scale.setScalar(p.s || 1);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
  });
  m.instanceMatrix.needsUpdate = true;
  m.castShadow = shadow; m.receiveShadow = false;
  m.frustumCulled = false;
  return m;
}
function rnd(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ------------------------------------------------------------------ build
export function buildDiveScene({ wreck = 'old' } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b2630);
  scene.fog = new THREE.Fog(0x174652, -31.5, 47); // negative near: dithered fog (see FOG_PATCH)
  const root = new THREE.Group();
  scene.add(root);
  const disposables = [];
  const obstacles = []; // { x, z, r } on the bed: no farms there
  const anchors = {};

  // lights: a cool sky from above, a warm-ish sun slanting in from the upper left, the deep below
  scene.add(new THREE.HemisphereLight(0xc8f4ff, 0x1a3442, 1.25));
  const sun = new THREE.DirectionalLight(0xfff4d8, 1.7);
  sun.position.set(-6, 14, 7);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x6ad0e0, 0.55);
  rim.position.set(6, 3, -8);
  scene.add(rim);

  // the bed
  const bg = bedGeometry();
  disposables.push(bg);
  const bed = new THREE.Mesh(bg, bedMaterial());
  bed.receiveShadow = false;
  root.add(bed);

  // backdrop + surface
  const bdg = new THREE.PlaneGeometry(150, 34);
  disposables.push(bdg);
  const back = new THREE.Mesh(bdg, backdropMaterial());
  back.position.set(1, 1.5, Z0 - 2);
  root.add(back);
  const sfg = new THREE.PlaneGeometry(150, 40);
  sfg.rotateX(-PI / 2);
  disposables.push(sfg);
  const surf = new THREE.Mesh(sfg, surfaceMaterial());
  surf.position.set(1, SURF, -6);
  root.add(surf);

  // light shafts, slanting down from the upper left
  const shafts = new THREE.Group();
  const R = rnd(42);
  for (let i = 0; i < 16; i++) {
    const x = X0 + 3 + i * 3.7 + R() * 2.2, z = -1.5 - R() * 8;
    const h = SURF - bedH(x, z) + 0.6;
    const w = 0.6 + R() * 1.5;
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(0, -h / 2, 0);
    disposables.push(g);
    const m = new THREE.Mesh(g, shaftMaterial(i * 1.37, 0.65 + R() * 0.55));
    m.position.set(x, SURF + 0.02, z);
    m.rotation.z = 0.28 + R() * 0.08;
    m.renderOrder = 5;
    shafts.add(m);
  }
  root.add(shafts);

  // ---------------------------------------------------------------- rocks
  const rockList = [];
  const addRock = (x, z, size, seed, opt = {}) => {
    const y = bedH(x, z) - size * VS * 0.12;
    rockList.push({ x, y, z, size, seed, ...opt });
    obstacles.push({ x, z, r: size * VS * 0.55 });
  };
  const RR = rnd(7);
  // the back ridge: big boulders
  for (let i = 0; i < 18; i++) { const x = X0 + 2 + i * 3.3 + RR() * 1.6; addRock(x, -9.2 - RR() * 2.6, 34 + floor(RR() * 30), 100 + i, { warm: RR() < 0.3 }); }
  // the middle: scattered rocks
  for (const [x, z, s] of [[-17.5, -1.2, 22], [-10.4, -5.6, 30], [-6.2, 2.8, 16], [-2.4, -5.9, 26], [3.6, 3.0, 14], [7.8, -5.2, 24], [9.8, 1.6, 20], [-21.5, -4.0, 26], [-24.5, 1.0, 18]]) addRock(x, z, s, floor(x * 7 + z * 13 + 500));
  // the Deep Hole's walls
  for (const [x, z, s] of [[12.2, -5.8, 40], [13.4, 1.6, 30], [22.6, -6.5, 44], [26.4, -1.0, 36], [16.0, 3.4, 22], [24.0, 3.0, 26]]) addRock(x, z, s, floor(x * 11 + z * 3 + 900), { warm: false, moss: 0.4 });
  const rockGroup = new THREE.Group();
  for (const r of rockList) {
    const g = diveGeo(`rock_${r.seed}_${r.size}_${r.warm ? 1 : 0}`, () => rockModel(r.seed, r.size, { warm: r.warm, moss: r.moss ?? 1 }));
    const m = new THREE.Mesh(g, uwMat(g));
    m.position.set(r.x, r.y, r.z);
    m.rotation.y = (r.seed * 0.73) % (PI * 2);
    rockGroup.add(m);
  }
  root.add(rockGroup);

  // ---------------------------------------------------------------- logs
  for (const [x, z, len, ry, seed] of [[-13.6, 0.6, 74, 0.25, 3], [5.6, -3.4, 90, -0.4, 5], [18.6, 1.8, 64, 0.9, 8]]) {
    const g = diveGeo(`log_${seed}_${len}`, () => logModel(seed, len, 7 + (seed % 2)));
    const m = new THREE.Mesh(g, uwMat(g));
    m.position.set(x, bedH(x, z) - 0.12, z);
    m.rotation.set(0.04, ry, 0.03);
    root.add(m);
    obstacles.push({ x, z, r: 1.9 });
    if (seed === 3) anchors.log = { x: x + 1.6, y: bedH(x, z), z: z + 0.4 };
  }

  // ---------------------------------------------------------------- the barge in the Deep Hole
  const bx = 19.4, bz = -3.0;
  const bargeGeo = diveGeo(wreck === 'restored' ? 'barge_r' : 'barge_o', () => bargeModel(wreck === 'restored'), { scale: 0.1 });
  const barge = new THREE.Mesh(bargeGeo, uwMat(bargeGeo, { emissive: wreck === 'restored' ? 0x221a08 : 0 }));
  barge.position.set(bx, bedH(bx, bz) - 0.3, bz);
  barge.rotation.set(0.05, -0.18, 0.32);
  root.add(barge);
  anchors.barge = { x: bx, y: bedH(bx, bz) + 1.4, z: bz + 1.2 };
  obstacles.push({ x: bx, z: bz, r: 3.4 });

  // ---------------------------------------------------------------- plants
  const plants = new THREE.Group();
  const Kr = rnd(11);
  const kelp = [[], [], [], []];
  const kelpAt = (x, z, k) => { kelp[k].push({ x, y: bedH(x, z) - 0.05, z, ry: Kr() < 0.5 ? 0 : PI, s: 0.85 + Kr() * 0.3 }); };
  // a kelp forest along the back ridge and two groves in the middle (the farm area stays open)
  for (let i = 0; i < 46; i++) kelpAt(X0 + 1 + i * 1.3 + Kr() * 0.9, -6.4 - Kr() * 3.4, floor(Kr() * 4));
  for (let i = 0; i < 9; i++) kelpAt(-20 + Kr() * 5, -2 + Kr() * 3.4, floor(Kr() * 4));
  for (let i = 0; i < 8; i++) kelpAt(10.5 + Kr() * 3, -1 + Kr() * 3, floor(Kr() * 4));
  for (let i = 0; i < 6; i++) kelpAt(-4.6 + Kr() * 3, -5.4 + Kr() * 0.8, floor(Kr() * 4));
  const kh = [92, 108, 80, 118];
  for (let k = 0; k < 4; k++) {
    const g = diveGeo('kelp' + k, () => kelpModel(k + 1, kh[k], { yellow: k === 2 }), { sway: true });
    plants.add(inst(g, uwMat(g, { sway: 0.42 }), kelp[k]));
  }
  // eelgrass meadows on the sand
  const grass = [[], [], []];
  for (let i = 0; i < 160; i++) {
    const x = X0 + 2 + Kr() * (X1 - X0 - 4), z = -5 + Kr() * 8.6;
    if (x > DEEP_X + 1 && x < 27) continue;
    if (Kr() < 0.35 && x > FARM_AREA.x0 && x < FARM_AREA.x1 && z > FARM_AREA.z0 && z < FARM_AREA.z1) continue;
    grass[floor(Kr() * 3)].push({ x, y: bedH(x, z) - 0.03, z, ry: Kr() * PI * 2, s: 0.7 + Kr() * 0.6 });
  }
  for (let k = 0; k < 3; k++) {
    const g = diveGeo('grass' + k, () => grassModel(k + 4, 20 + k * 6), { sway: true });
    plants.add(inst(g, uwMat(g, { sway: 0.12 }), grass[k]));
  }
  // coontail bushes
  const coon = [];
  for (let i = 0; i < 26; i++) { const x = X0 + 3 + Kr() * (X1 - X0 - 6), z = -6 + Kr() * 9; if (x > DEEP_X && x < 26) continue; coon.push({ x, y: bedH(x, z) - 0.03, z, ry: Kr() * 6, s: 0.8 + Kr() * 0.5 }); }
  { const g = diveGeo('coon', () => coontailModel(3), { sway: true }); plants.add(inst(g, uwMat(g, { sway: 0.1 }), coon)); }
  // lilies: long stems from the bed up to pads floating on the surface (seen from below)
  const stems = [], pads = [[], []];
  const lilyX = [-23.5, -22, -19.8, -18.6, -9.6, -8.4, -7.6, 1.6, 2.6, 7.4, 8.2, 9.4, 28.2, 29.4];
  for (const x0 of lilyX) {
    const x = x0 + Kr() * 0.6, z = -3.5 + Kr() * 4;
    const by = bedH(x, z);
    stems.push({ x, y: by, z, s: (SURF - by) / (110 * VS) });
    pads[Kr() < 0.3 ? 1 : 0].push({ x: x + 0.12, y: SURF + 0.03, z, ry: Kr() * 6, s: 0.9 + Kr() * 0.4 });
  }
  { const g = diveGeo('lilystem', () => lilyStemModel(1, 110), { sway: true }); plants.add(inst(g, uwMat(g, { sway: 0.08 }), stems)); }
  for (let k = 0; k < 2; k++) { const g = diveGeo('lilypad' + k, () => lilyPadModel(2 + k, k === 1), { scale: VS }); const m = inst(g, uwMat(g), pads[k]); m.renderOrder = 2; plants.add(m); }
  // reeds piercing the surface in the shallows
  const reeds = [];
  for (let i = 0; i < 12; i++) { const x = X0 + 0.5 + Kr() * 6, z = -4 + Kr() * 8; const by = bedH(x, z); reeds.push({ x, y: by, z, s: (SURF - by + 1.2) / (60 * VS * 0.9), ry: Kr() * 6 }); }
  { const g = diveGeo('reeds_uw', () => reedModel(5, 60), { sway: true }); plants.add(inst(g, uwMat(g, { sway: 0.06 }), reeds)); }
  root.add(plants);

  // ---------------------------------------------------------------- the dock pilings in the shallows (up through the surface)
  const dockX = -21.5;
  for (const [x, z] of [[dockX - 1.4, -1.6], [dockX + 1.4, -1.6], [dockX - 1.4, 1.6], [dockX + 1.4, 1.6]]) {
    const by = bedH(x, z);
    const h = SURF - by + 0.7;
    const g = diveGeo('piling' + Math.round(h * 10), () => {
      const v = new VoxelModel();
      const n = Math.round(h / VS);
      for (let y = 0; y < n; y++) for (let a = -2; a <= 1; a++) for (let b = -2; b <= 1; b++) {
        if (abs(a + 0.5) + abs(b + 0.5) > 3) continue;
        let c = y < n * 0.75 ? (hash3(a, y, b) < 0.45 ? 0x3e5a2e : 0x4a3a28) : (a < 0 ? 0x8a6a4a : 0x6a4c34);
        if ((y + 40) % 13 === 0 && y < n * 0.7) c = 0xd8d0c0; // zebra mussels band
        v.set(a, y, b, c);
      }
      return v;
    });
    const m = new THREE.Mesh(g, uwMat(g));
    m.position.set(x, by, z);
    root.add(m);
  }
  // the dock deck seen from below, lying on the surface band
  {
    const g = new THREE.BoxGeometry(4.2, 0.18, 4.6);
    disposables.push(g);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x2a2a20 }));
    m.position.set(dockX, SURF + 0.14, 0);
    disposables.push(m.material);
    root.add(m);
  }
  anchors.entry = { x: dockX + 0.8, y: SURF - 0.6, z: 0.4 };
  anchors.ladder = { x: dockX, y: SURF - 0.3, z: 2.0 };

  // ---------------------------------------------------------------- bubbling vents in the sand
  anchors.vents = [[-15.2, -2.2], [-3.6, -4.4], [4.4, 1.2], [15.2, -1.0], [23.4, 0.4]].map(([x, z]) => ({ x, y: bedH(x, z), z }));

  // ---------------------------------------------------------------- update
  const t0 = { t: 0 };
  function update(dt, t, diver) {
    t0.t = t;
    UW.uTime.value = t;
    if (diver) UW.uPush.value.set(diver.x, diver.y, diver.z, 1.1);
    sun.position.x = -6 + sin(t * 0.13) * 1.5;
  }
  function dispose() {
    scene.traverse((o) => { if (o.isInstancedMesh) o.dispose?.(); });
    for (const d of disposables) d.dispose?.();
    for (const m of [bed.material, surf.material, back.material]) m.dispose?.();
    for (const s of shafts.children) s.material.dispose?.();
  }
  return { scene, root, bedH, update, dispose, anchors, obstacles, SURF, sun };
}

