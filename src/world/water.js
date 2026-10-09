// [v20 water] The water surface: a stylised pixel-art shader for every body of
// water (pond, river, swamps, player-dug ponds, the valley rivers outside the
// map) plus the bits that feed it each frame.
//
//  - Colour comes from a per-map "water info" texture (4 texels per tile):
//    R = distance to the bank, G = floor depth, BA = river flow direction.
//    Shallow turquoise at the banks, deep blue in the middle, a greener tint in
//    the swamps, banded + ordered-dithered so it stays crisp in the low-res
//    pixel renderer.
//  - Normals: three octaves of value noise in world space (no tiling), carried
//    downstream along the flow map on the river, plus the height-field sim
//    (waterSim.js) for real waves from fish, bears, birds and splashes.
//  - Sun / moon path: the camera is orthographic, so a real specular highlight
//    would be the same everywhere. Instead the glint is computed from a virtual
//    eye placed opposite the sun, which puts a glittering sun path on the side
//    of the screen the light comes from: long and golden at sunset, small and
//    white at noon, silver from the moon, red under the blood moon.
//  - Sky/fresnel tint on wave flanks, wave crests lit by the sun, animated
//    lapping foam along the banks, foam on big wave crests.
import * as THREE from 'three';
import { KIND, WATER_Y } from './grid.js';
import { SPRITE_UNIFORMS } from '../core/spriteBatch.js';
import { HAZE_PARS } from './outerRing.js';
import { buildWhiteInfo } from './rivers.js'; // [v26 world]

const RES = 4; // info texels per tile
const SHORE_SPAN = 3.5; // tiles from the bank to "deep"

// ------------------------------------------------------------------ info map
export function buildWaterInfo(grid, tex) {
  const { w, h } = grid;
  const W = w * RES, H = h * RES;
  const n = W * H;
  // distance (in texels) to the nearest land texel: two-pass chamfer 3-4
  const INF = 1e6;
  const d = new Float32Array(n);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const t = ((j / RES) | 0) * w + ((i / RES) | 0);
      d[j * W + i] = grid.kind[t] === KIND.WATER ? INF : 0;
    }
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      let v = d[k];
      if (!v) continue;
      if (i > 0) v = Math.min(v, d[k - 1] + 3);
      if (j > 0) {
        v = Math.min(v, d[k - W] + 3);
        if (i > 0) v = Math.min(v, d[k - W - 1] + 4);
        if (i < W - 1) v = Math.min(v, d[k - W + 1] + 4);
      }
      d[k] = v;
    }
  for (let j = H - 1; j >= 0; j--)
    for (let i = W - 1; i >= 0; i--) {
      const k = j * W + i;
      let v = d[k];
      if (!v) continue;
      if (i < W - 1) v = Math.min(v, d[k + 1] + 3);
      if (j < H - 1) {
        v = Math.min(v, d[k + W] + 3);
        if (i < W - 1) v = Math.min(v, d[k + W + 1] + 4);
        if (i > 0) v = Math.min(v, d[k + W - 1] + 4);
      }
      d[k] = v;
    }
  // floor depth at tile corners: mean of the water tiles touching the corner
  // (matches the smoothed pond bowl in terrain.js)
  const CW = w + 1;
  const ch = new Float32Array(CW * (h + 1));
  const isW = (x, z) => x >= 0 && z >= 0 && x < w && z < h && grid.kind[z * w + x] === KIND.WATER;
  for (let cz = 0; cz <= h; cz++)
    for (let cx = 0; cx <= w; cx++) {
      let s = 0, c = 0;
      for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) if (isW(cx + dx, cz + dz)) { s += grid.height[(cz + dz) * w + cx + dx]; c++; }
      ch[cz * CW + cx] = c ? WATER_Y - s / c : 0;
    }
  // river flow per tile: principal axis of the nearby river tiles, pointing downstream (+z)
  const fx = new Float32Array(w * h), fz = new Float32Array(w * h);
  const bio = grid.biome;
  if (grid.flowS) {
    // [v26 world] the real current (world/flow.js): direction x speed (1.6 tiles/s = full)
    for (let i = 0; i < w * h; i++) { const k = Math.min(1, grid.flowS[i] / 1.6) * (grid.kind[i] === KIND.WATER ? 1 : 0); fx[i] = grid.flowX[i] * k; fz[i] = grid.flowZ[i] * k; }
  } else if (bio) {
    const R = 4;
    for (let z = 0; z < h; z++)
      for (let x = 0; x < w; x++) {
        const i = z * w + x;
        if (bio[i] !== 5 || grid.kind[i] !== KIND.WATER) continue;
        let sx = 0, sz = 0, c = 0, xx = 0, zz = 0, xz = 0;
        for (let dz = -R; dz <= R; dz++)
          for (let dx = -R; dx <= R; dx++) {
            const x2 = x + dx, z2 = z + dz;
            if (!isW(x2, z2) || bio[z2 * w + x2] !== 5) continue;
            sx += dx; sz += dz; c++; xx += dx * dx; zz += dz * dz; xz += dx * dz;
          }
        if (c < 3) continue;
        const mx = sx / c, mz = sz / c;
        const cxx = xx / c - mx * mx, czz = zz / c - mz * mz, cxz = xz / c - mx * mz;
        const a = 0.5 * Math.atan2(2 * cxz, cxx - czz);
        let vx = Math.cos(a), vz = Math.sin(a);
        if (vz < 0 || (Math.abs(vz) < 1e-3 && vx < 0)) { vx = -vx; vz = -vz; }
        fx[i] = vx; fz[i] = vz;
      }
  }
  const data = new Uint8Array(n * 4);
  const span = SHORE_SPAN * RES * 3; // chamfer units
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const k = j * W + i, o = k * 4;
      data[o] = Math.min(255, Math.round((d[k] >= INF ? span : Math.min(d[k], span)) / span * 255));
      // floor depth, bilinear over the tile corners
      const px = (i + 0.5) / RES, pz = (j + 0.5) / RES;
      const x0 = Math.min(w - 1, Math.floor(px)), z0 = Math.min(h - 1, Math.floor(pz));
      const tx = px - x0, tz = pz - z0;
      const a = ch[z0 * CW + x0], b = ch[z0 * CW + x0 + 1], c = ch[(z0 + 1) * CW + x0], e = ch[(z0 + 1) * CW + x0 + 1];
      const dep = (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + e * tx) * tz;
      data[o + 1] = Math.max(0, Math.min(255, Math.round(dep * 255)));
      // flow, bilinear over tile centres
      const qx = px - 0.5, qz = pz - 0.5;
      const ax = Math.max(0, Math.min(w - 2, Math.floor(qx))), az = Math.max(0, Math.min(h - 2, Math.floor(qz)));
      const ux = Math.max(0, Math.min(1, qx - ax)), uz = Math.max(0, Math.min(1, qz - az));
      const f = (arr) => (arr[az * w + ax] * (1 - ux) + arr[az * w + ax + 1] * ux) * (1 - uz) + (arr[(az + 1) * w + ax] * (1 - ux) + arr[(az + 1) * w + ax + 1] * ux) * uz;
      data[o + 2] = Math.round((f(fx) * 0.5 + 0.5) * 255);
      data[o + 3] = Math.round((f(fz) * 0.5 + 0.5) * 255);
    }
  if (!tex || tex.image.width !== W || tex.image.height !== H) {
    tex?.dispose?.();
    tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  } else tex.image.data.set(data);
  tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------------ shaders
const VERT = /* glsl */ `
uniform sampler2D uSim;
uniform vec4 uSimRect;
varying vec3 vWPos;
varying float vSimH;
#ifdef OUTER
attribute vec4 aInfo;
varying vec4 vInfo;
varying vec2 vRing; // x: sunk towards the camera (outerRing flatK), y: valley haze
${HAZE_PARS}
#endif
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float h = 0.0;
#ifndef OUTER
  vec2 suv = (wp.xz - uSimRect.xy) / uSimRect.zw;
  h = (texture2D(uSim, suv).r - 0.502) * 2.55;
  wp.y += h * 0.13;
#else
  vInfo = aInfo;
  // the valley on the camera's side sinks into a dark plate (outerRing.js): follow it
  // [v26 world] the ranges no longer sink (they are capped, world/cubeMountains.js): the water stays put
  vRing = vec2(0.0, ringHaze(wp.xyz));
#endif
  vSimH = h;
  vWPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform sampler2D uShore;      // water info (R shore, G depth, BA flow)
uniform sampler2D uWhite;      // [v26 world] R white water (rapids, rock wakes, the falls), G speed
uniform sampler2D uSim;
uniform vec4 uSimRect;
uniform vec2 uGridSize;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uSkyTint;
uniform vec3 uSkyTop;
uniform vec3 uSkyBot;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uViewDir;
uniform vec3 uEye;
uniform float uGlintK;
uniform float uDayK;
uniform float uNight;
uniform float uAurora;
uniform float uWind;
varying vec3 vWPos;
varying float vSimH;
#ifdef OUTER
varying vec4 vInfo;
varying vec2 vRing;
uniform vec3 uHaze;
#endif

uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float hash2(vec2 p) { ivec2 q = ivec2(floor(p)); return float(pcg(uint(q.x) * 1597334677u ^ pcg(uint(q.y)))) / 4294967295.0; }
// value noise with analytic derivatives (x = value, yz = gradient)
vec3 noised(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = hash2(i), b = hash2(i + vec2(1.0, 0.0)), c = hash2(i + vec2(0.0, 1.0)), d = hash2(i + vec2(1.0, 1.0));
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return vec3(a + k1 * u.x + k2 * u.y + k4 * u.x * u.y, du * vec2(k1 + k4 * u.y, k2 + k4 * u.x));
}
const mat2 R1 = mat2(0.8, 0.6, -0.6, 0.8);
const mat2 R2 = mat2(-0.48, 0.88, -0.88, -0.48);
// slope of the wind ripples (d height / dx, dz) in world space
vec2 ripples(vec2 p, float t) {
  // ripples are stretched across the wind (x) so they read as little wave lines
  const vec2 S = vec2(0.55, 1.6);
  vec3 n1 = noised(p * S * 0.8 + vec2(t * 0.06, t * 0.16));
  vec3 n2 = noised(R1 * p * 1.9 + vec2(-t * 0.19, t * 0.13));
  vec3 n3 = noised(p * S * 4.2 + vec2(t * 0.21, -t * 0.42));
  return n1.yz * S * 0.8 * 0.06 + (transpose(R1) * n2.yz) * 1.9 * 0.03 + n3.yz * S * 4.2 * 0.012;
}
float bayer4(vec2 a) {
  ivec2 q = ivec2(mod(a, 4.0));
  int i = q.x + q.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
// banded value; the ordered dither only frays a thin seam between bands
float band(float v, float steps, float dith) { return floor(v * steps + 0.5 + (dith - 0.5) * 0.3) / steps; }

void main() {
  vec2 p = vWPos.xz;
  float t = uTime;
  float dith = bayer4(gl_FragCoord.xy);
#ifdef OUTER
  vec4 info = vInfo;
#else
  vec4 info = texture2D(uShore, p / uGridSize);
#endif
  float shore = info.r;            // 0 at the bank .. 1 open water
  float floorD = info.g;           // floor depth (0..1 world units)
  vec2 flow = info.ba * 2.0 - 1.0; // river current
  float flowK = length(flow);

  // --- wind ripples (carried downstream on the river with a two-phase flow map)
  vec2 g;
  if (flowK > 0.05) {
    float ph = fract(t * 0.3);
    vec2 off = flow * 1.4;
    vec2 g0 = ripples(p - off * ph, t), g1 = ripples(p - off * fract(ph + 0.5) + 3.7, t);
    g = mix(g0, g1, abs(1.0 - 2.0 * ph));
    g *= 1.0 + 0.4 * flowK;
  } else g = ripples(p, t);
  g *= uWind * mix(0.5, 0.85, smoothstep(0.0, 0.5, shore));

  // --- simulated waves
  float simH = vSimH;
  vec2 simG = vec2(0.0);
#ifndef OUTER
  {
    vec2 suv = (p - uSimRect.xy) / uSimRect.zw;
    vec2 st = 1.0 / vec2(textureSize(uSim, 0));
    simH = (texture2D(uSim, suv).r - 0.502) * 2.55;
    float hl = texture2D(uSim, suv - vec2(st.x, 0.0)).r, hr = texture2D(uSim, suv + vec2(st.x, 0.0)).r;
    float hu = texture2D(uSim, suv - vec2(0.0, st.y)).r, hd = texture2D(uSim, suv + vec2(0.0, st.y)).r;
    simG = vec2(hr - hl, hd - hu) * 2.55 / (2.0 * st * uSimRect.zw);
  }
#endif
  g += simG * 0.24;
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  float waveE = length(simG);

  // --- body colour: depth ramp, refracted by the surface slope, banded + dithered
#ifndef OUTER
  float rshore = texture2D(uShore, (p + g * 0.6) / uGridSize).r;
#else
  float rshore = shore;
#endif
  float deep = clamp(rshore * mix(0.62, 1.0, smoothstep(0.4, 0.95, floorD)), 0.0, 1.0);
  deep = band(smoothstep(0.0, 1.0, deep), 4.0, dith);
  vec3 turq = uShallow * vec3(0.92, 1.18, 1.08) + vec3(0.015, 0.05, 0.045) * (1.0 - uNight * 0.8);
  vec3 col = deep < 0.4 ? mix(turq, uShallow, deep / 0.4) : mix(uShallow, uDeep, (deep - 0.4) / 0.6);
  // swamps and shallow puddles: greener, murkier
  float swamp = smoothstep(0.6, 0.45, floorD) * step(0.01, floorD);
  col = mix(col, col * vec3(0.78, 0.98, 0.62) + vec3(0.01, 0.025, 0.0), swamp * 0.8);
  // slow large-scale colour drift so big water isn't one flat tone
  float drift = noised(p * 0.09 + vec2(t * 0.01, -t * 0.008)).x;
  col *= 1.0 + band(drift - 0.5, 3.0, dith) * 0.1;
  col *= 1.0 - uNight * 0.16; // night water sits a little darker than the banks

  vec3 L = normalize(uSunDir);
  // --- crest lighting: flanks facing the sun brighten, the backs darken
  float lam = (dot(N, L) - L.y) * 6.0 + clamp(simH * 12.0, -1.5, 1.5);
  float lk = 0.4 + 0.6 * uDayK;
  // troughs a shade darker, crests lit, the very tops catch a light line
  col *= 1.0 - step(lam, -0.55) * 0.1 * lk - step(lam, -1.3) * 0.08 * lk;
  col = mix(col, col * 1.12 + uSkyTint * 0.06, step(0.55, lam) * lk);
  col = mix(col, mix(uSkyTint, uSunCol, 0.4) * 0.95, step(1.35, lam) * 0.55 * lk);
  // wake / ring lines: a light line along each simulated crest, a dark one in the trough behind it
  // (thin contour lines: distance to the iso-line = |h - level| / |grad h|)
  float gl2 = max(waveE, 0.05);
  float crestL = step(abs(simH - 0.025) / gl2, 0.03) + step(abs(simH - 0.09) / gl2, 0.025);
  float troughL = step(abs(simH + 0.03) / gl2, 0.03);
  crestL = min(crestL, 1.0) * step(0.12, waveE);
  troughL *= step(0.12, waveE);
  col = mix(col, uSkyTint * 1.05 + vec3(0.04), crestL * (0.3 + 0.25 * lk));
  col *= 1.0 - troughL * 0.13;

  // --- sky reflection (fresnel-ish: flanks tilted away from the camera mirror the sky)
  vec3 V0 = normalize(uViewDir);
  vec3 Rv = reflect(-V0, N);
  vec3 sky = mix(uSkyBot, uSkyTop, smoothstep(0.35, 1.0, Rv.y));
  sky = mix(sky, uSkyTint, 0.5);
  float fres = 0.08 + clamp((V0.y - dot(N, V0)) * 3.0, -0.06, 0.3);
  col = mix(col, sky, band(fres, 4.0, dith));

  // --- sun / moon path from the virtual eye
  vec3 P = vec3(p.x, ${WATER_Y.toFixed(3)}, p.y);
  vec3 V = normalize(uEye - P);
  float sd = max(dot(reflect(-V, N), L), 0.0);
  float sheen = pow(sd, 70.0);
  col += uSunCol * band(sheen, 3.0, dith) * 0.28 * uGlintK;
  // glitter: crisp pixels that twinkle (per-pixel micro facets)
  vec2 cell = floor(p * 24.0);
  float tw = hash2(cell + floor(t * 7.0 + hash2(cell * 0.37) * 7.0) * 17.0);
  vec3 Nm = normalize(N + vec3(tw - 0.5, 0.0, hash2(cell.yx + floor(t * 5.0) * 13.0) - 0.5) * 0.16);
  float sg = max(dot(reflect(-V, Nm), L), 0.0);
  float glit = step(0.9965 - 0.002 * uWind, sg) * step(0.6, tw) * step(0.05, uGlintK);
  col += uSunCol * glit * (1.1 + 1.4 * sheen) * uGlintK;
  // core of the path: brightest where wave flanks line up
  col += uSunCol * step(0.7, pow(sd, 500.0)) * 1.1 * uGlintK;

  // --- foam: lapping along the banks, a second line breaking outwards, wave crests
  float fn = noised(p * 2.6 + vec2(t * 0.35, t * 0.2)).x;
  float fn2 = noised(p * 6.0 - vec2(t * 0.5, -t * 0.3)).x;
  float edgeW = 0.025 + 0.018 * sin(t * 1.4 + fn * 6.0) + 0.02 * fn;
  float foam = step(shore, edgeW) * step(0.3, fn2);
  float ph2 = fract(t * 0.18 + fn * 0.25);
  float lap = step(abs(shore - (0.05 + ph2 * 0.14)), 0.008) * step(0.45 + ph2 * 0.4, fn2);
  foam = max(foam, lap * 0.8);
  // foam on big wave crests and splash zones
  // (coverage grows with crest height; the edges break up into speckle)
  float fs = noised(p * 9.0 + vec2(t * 0.8, -t * 0.6)).x * 0.7 + hash2(floor(p * 24.0)) * 0.3;
  float crest = smoothstep(0.1, 0.55, simH) + smoothstep(0.7, 2.2, waveE) * 0.6;
  foam = max(foam, step(fs, crest * 0.85) * min(1.0, crest * 2.0));
  // [v26 world] the current: long light streaks and foam lines sliding downstream,
  // churning white water on rapids, behind rocks and under the falls
  float whiteW = 0.0;
#ifndef OUTER
  whiteW = texture2D(uWhite, p / uGridSize).r;
#endif
  if (flowK > 0.03) {
    vec2 fd = flow / flowK;
    float spd = 0.35 + flowK * 2.2;
    vec2 q = vec2(dot(p, vec2(fd.y, -fd.x)) * 2.6, dot(p, fd) * 0.55 - t * spd);
    float lines = step(0.8 - flowK * 0.12, noised(q).x) * step(0.45, fn2);
    foam = max(foam, lines * min(1.0, flowK * 1.6) * 0.62);
    // glints that ride the current (bright dashes, stretched along the flow)
    vec2 q2 = vec2(dot(p, vec2(fd.y, -fd.x)) * 6.0, dot(p, fd) * 1.4 - t * spd * 1.3);
    col += uSkyTint * 0.16 * step(0.88, noised(q2).x) * min(1.0, flowK * 2.0) * (1.0 - uNight * 0.6);
    // foam strings hugging the banks
    foam = max(foam, step(shore, 0.16) * step(0.62, noised(q * vec2(1.6, 0.8)).x) * min(1.0, flowK * 2.4) * 0.8);
  }
  if (whiteW > 0.02) {
    vec2 fd = flowK > 0.03 ? flow / flowK : vec2(0.0, 1.0);
    vec2 q3 = vec2(dot(p, vec2(fd.y, -fd.x)) * 5.0, dot(p, fd) * 2.2 - t * 2.4);
    float churn = noised(q3).x * 0.65 + noised(p * 7.0 + vec2(t * 1.3, -t * 0.9)).x * 0.35;
    foam = max(foam, step(1.0 - whiteW * 0.95, churn));
  }
  vec3 foamCol = uFoam * mix(vec3(1.0), uSunCol * 0.6 + 0.4, 0.3) * (1.0 - uNight * 0.6);
  col = mix(col, foamCol, foam);

  // --- aurora reflection at night
  float au = uAurora * (0.5 + 0.5 * sin(p.x * 0.35 + t * 0.3 + sin(p.y * 0.2) * 2.0));
  col += vec3(0.05, 0.35, 0.22) * au * 0.3;

#ifdef OUTER
  col = mix(col, vec3(0.012, 0.04, 0.05), smoothstep(0.2, 0.7, vRing.x) * 0.8);
  col = mix(col, uHaze, vRing.y);
#endif
  float alpha = mix(0.4, 0.68, smoothstep(0.05, 0.8, deep));
  alpha = max(alpha, max(foam, glit));
  alpha = max(alpha, whiteW * 0.7); // [v26 world] white water is opaque
  gl_FragColor = vec4(col, alpha);
}
`;

export function makeWater20Material(uniforms, { outer = false } = {}) {
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    transparent: true,
    depthWrite: !outer,
    defines: outer ? { OUTER: 1 } : {},
  });
  m.name = outer ? 'water20Outer' : 'water20';
  return m;
}

// ------------------------------------------------------------- valley rivers
// a ribbon of water down each river that leaves the map (outerRing.js)
export function buildOuterRiverGeometry(ring) {
  const pos = [], info = [], idx = [];
  let vi = 0;
  const ACROSS = [-1.7, -1.2, -0.85, -0.45, 0, 0.45, 0.85, 1.2, 1.7];
  for (const r of ring.rivers || []) {
    const P = r.pts;
    // resample the polyline every ~1 unit
    const pts = [];
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(len / (i === 0 ? 1 : 2)));
      for (let k = 0; k < n; k++) pts.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
    }
    pts.push(P[P.length - 1]);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      for (const s of ACROSS) {
        const x = pts[i][0] - tz * s * r.width, z = pts[i][1] + tx * s * r.width;
        pos.push(x, WATER_Y, z);
        const dd = ring.riverDist(x, z).d;
        const sh = Math.max(0, Math.min(1, (1 - dd) * 1.6));
        info.push(sh, 0.85, tx * 0.5 + 0.5, tz * 0.5 + 0.5);
      }
      if (i > 0) {
        const n = ACROSS.length;
        for (let k = 0; k < n - 1; k++) {
          const a0 = vi - n + k, b0 = vi + k;
          idx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0); // (up-facing)
        }
      }
      vi += ACROSS.length;
    }
  }
  if (!vi) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------- per-frame glue
const _c = new THREE.Color();
const SILVER = new THREE.Color(0.6, 0.86, 1.0);
export class WaterFX {
  constructor(world) {
    this.world = world;
    const u = world.waterUniforms;
    world.shoreTex?.dispose?.();
    world.shoreTex = buildWaterInfo(world.grid);
    u.uShore.value = world.shoreTex;
    u.uWhite = { value: buildWhiteInfo(world.grid) }; // [v26 world]
    Object.assign(u, {
      uSkyTop: { value: new THREE.Color(0x62a4ea) },
      uSkyBot: { value: new THREE.Color(0xcfe8f8) },
      uSunCol: { value: new THREE.Color(1, 1, 1) },
      uEye: { value: new THREE.Vector3() },
      uGlintK: { value: 1 },
      uDayK: { value: 1 },
      uWind: { value: 1 },
    });
    this.mat = makeWater20Material(u);
    world.water.material.dispose();
    world.water.material = this.mat;
    this.outer = null;
    // lily pads & duckweed ride the waves
    SPRITE_UNIFORMS.uWaterSim.value = world.sim.tex;
    SPRITE_UNIFORMS.uWaterRect.value.copy(u.uSimRect.value);
  }

  // the valley rivers (call once the outer ring exists)
  addOuter() {
    const ring = this.world.ring;
    if (!ring || this.outer) return;
    const geo = buildOuterRiverGeometry(ring);
    if (!geo) return;
    this.outer = new THREE.Mesh(geo, makeWater20Material({ ...this.world.waterUniforms, ...ring.uniforms, uTime: this.world.waterUniforms.uTime }, { outer: true }));
    this.outer.renderOrder = 10;
    this.outer.name = 'outerRiverWater';
    this.world.scene.add(this.outer);
  }

  rebuild() {
    const u = this.world.waterUniforms;
    this.world.shoreTex = buildWaterInfo(this.world.grid, this.world.shoreTex);
    u.uShore.value = this.world.shoreTex;
    if (u.uWhite) u.uWhite.value = buildWhiteInfo(this.world.grid, u.uWhite.value); // [v26 world]
  }

  update(sky, camera, wind = 1) {
    const u = this.world.waterUniforms;
    const s = sky.state;
    if (sky.uniforms) { u.uSkyTop.value.copy(sky.uniforms.uTop.value); u.uSkyBot.value.copy(sky.uniforms.uBottom.value); }
    u.uWind.value = Math.max(0.6, Math.min(1.6, 0.75 + wind * 0.35));
    const night = s.night, bm = sky.bloodMoon || 0;
    const L = s.sunDir;
    // light colour: the sun's (golden at dusk), silver moonlight, red blood moon
    _c.copy(sky.sun.color);
    const mx = Math.max(_c.r, _c.g, _c.b, 1e-3);
    _c.multiplyScalar(1 / mx);
    _c.lerp(SILVER, night * (1 - bm));
    u.uSunCol.value.copy(_c);
    const day = (1 - night) * Math.max(0, Math.min(1, L.y * 4));
    u.uDayK.value = day;
    u.uGlintK.value = day * 0.9 + night * (0.4 + 0.3 * (sky.moonlit || 0)) + bm * 0.2;
    if (!camera) return;
    // where the middle of the screen meets the water
    const e = camera.matrixWorld.elements;
    const fx = -e[8], fy = -e[9], fz = -e[10];
    const px = e[12], py = e[13], pz = e[14];
    const k = Math.abs(fy) > 1e-4 ? (WATER_Y - py) / fy : 0;
    const cx = px + fx * k, cz = pz + fz * k;
    const half = (camera.right - camera.left) / (2 * (camera.zoom || 1));
    // the path sits on the side of the screen the light comes from
    const hl = Math.hypot(L.x, L.z) || 1;
    const ox = cx + (L.x / hl) * half * 0.4, oz = cz + (L.z / hl) * half * 0.4;
    // virtual eye opposite the light, mirrored about the water
    const D = half * 1.2;
    u.uEye.value.set(ox - L.x * D, WATER_Y + L.y * D, oz - L.z * D);
  }
}

// ------------------------------------------------------------------- wakes
// Everything that moves through water pushes the height field: fish leave
// little V-wakes (and rise rings at dawn/dusk), wading bears plough a bow wave
// and big rings, cannonballs slam a crater, ducks/geese and beavers draw wakes.
const prev = new WeakMap();
function track(o, x, z, dt) {
  let p = prev.get(o);
  if (!p) { p = { x, z, acc: 0, spd: 0, wet: false, jump: false, t: Math.random() }; prev.set(o, p); return null; }
  const dx = x - p.x, dz = z - p.z;
  const d = Math.hypot(dx, dz);
  p.x = x; p.z = z;
  if (d > 2) return null; // teleported
  p.spd += (d / Math.max(dt, 1e-4) - p.spd) * Math.min(1, dt * 8);
  p.acc += d;
  p.dx = d > 1e-5 ? dx / d : p.dx || 0;
  p.dz = d > 1e-5 ? dz / d : p.dz || 0;
  return p;
}

// stamp a V-wake: trough under the body, a raised bow ahead, two stern quarters
function stampWake(sim, x, z, p, size, amt) {
  const fx = p.dx, fz = p.dz;
  sim.disturb(x - fx * size * 0.6, z - fz * size * 0.6, size, amt);
  sim.disturb(x + fx * size * 0.9, z + fz * size * 0.9, size * 0.8, -amt * 0.6);
  const sx = -fz, sz = fx;
  sim.disturb(x - fx * size * 1.2 + sx * size * 0.9, z - fz * size * 1.2 + sz * size * 0.9, size * 0.6, amt * 0.45);
  sim.disturb(x - fx * size * 1.2 - sx * size * 0.9, z - fz * size * 1.2 - sz * size * 0.9, size * 0.6, amt * 0.45);
}

export function updateWakes(game, dt) {
  const sim = game.world?.sim;
  const g = game.grid;
  if (!sim || !g || !(dt > 0)) return;
  const wet = (x, z) => g.isWater(Math.floor(x), Math.floor(z));
  const hour = game.state?.hour ?? 12;
  const rise = (hour > 5.5 && hour < 8.5) || (hour > 17.5 && hour < 20.5) ? 3 : 1;
  // fish
  const fish = game.fish?.list;
  if (fish) {
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      if (f.dead || f.tank || f.held || f.jump) continue;
      const p = track(f, f.x, f.z, dt);
      if (!p || !wet(f.x, f.z)) continue;
      const sz = f.adult ? 0.26 : 0.17;
      // the fish's own swim speed / heading (smoother than the measured step)
      const spd = f.speed ?? p.spd;
      if (f.heading != null) { p.dx = Math.cos(f.heading); p.dz = Math.sin(f.heading); }
      if (spd > 0.15 && p.acc > 0.1) {
        p.acc = 0;
        const fast = Math.min(1, (spd - 0.15) / 1.8);
        stampWake(sim, f.x, f.z, p, sz + fast * 0.12, (0.05 + fast * 0.1) * (f.adult ? 1 : 0.6));
      }
      // a fish nosing the surface: a little ring now and then (more at dawn/dusk)
      if (Math.random() < dt * 0.025 * rise) sim.disturb(f.x, f.z, 0.12, 0.07);
    }
  }
  // bears: wading, swimming, cannonballs
  const bears = game.bears?.list;
  if (bears) {
    for (const b of bears) {
      if (!b.visible) continue;
      const p = track(b, b.x, b.z, dt);
      if (!p) continue;
      const s = b.def?.scale || 1;
      const inW = !!b.inWater && !b.jump;
      if (p.jump && !b.jump && wet(b.x, b.z)) {
        // landed a cannonball: one huge crater + a ring of spray
        sim.disturb(b.x, b.z, 1.5 * s, 1.1);
        for (let k = 0; k < 6; k++) { const a = k * 1.047 + p.t; sim.disturb(b.x + Math.cos(a) * 1.2 * s, b.z + Math.sin(a) * 1.2 * s, 0.4, -0.25); }
      }
      p.jump = !!b.jump;
      if (inW && !p.wet) sim.disturb(b.x, b.z, 0.7 * s, 0.45); // stepped in
      p.wet = inW;
      if (!inW) continue;
      const spd = Math.max(p.spd, b.moving ? b._spd || 0 : 0);
      if (spd > 0.25 && p.acc > 0.18) {
        p.acc = 0;
        stampWake(sim, b.x, b.z, p, 0.5 * s, 0.14 + Math.min(0.12, spd * 0.05));
      }
      p.t += dt;
      if (p.t > 0.9) { p.t = 0; sim.disturb(b.x, b.z, 0.55 * s, 0.08); } // bobbing / paddling rings
    }
  }
  // ducks & geese, beavers
  const lists = [game.livestock?.list, game.beavers?.list];
  for (let li = 0; li < lists.length; li++) {
    const L = lists[li];
    if (!L) continue;
    const big = li === 1;
    for (const o of L) {
      if (o.x == null) continue;
      const p = track(o, o.x, o.z, dt);
      if (!p || !wet(o.x, o.z)) continue;
      const spd = Math.max(p.spd, o.speed || 0);
      if (spd > 0.15 && p.acc > 0.14) {
        p.acc = 0;
        stampWake(sim, o.x, o.z, p, big ? 0.2 : 0.15, big ? 0.04 : 0.028);
      }
    }
  }
}
