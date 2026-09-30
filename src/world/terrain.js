// Terrain mesh (voxel columns per tile) with a pixel-noise shader for grain,
// plus the water surface with animated pixel ripples, foam and sparkles.
import * as THREE from 'three';
import { KIND, WATER_Y } from './grid.js';
import { hash2, fbm2 } from '../core/rng.js';
import { linearRGB, mix } from '../core/voxel.js';

const BASE_Y = -4;

const KIND_COLORS = {
  [KIND.GRASS]: [0x6e993b, 0x6f9a3c, 0x6d983a],
  [KIND.SAND]: [0xc8b27a, 0xd1bb82, 0xbca872],
  [KIND.DIRT]: [0x8a6a44, 0x94734b, 0x80623e],
  [KIND.WATER]: [0x8a7f5a, 0x7f7552, 0x938760], // pond floor (silt/pebbles)
  [KIND.ROCK]: [0x857f7a, 0x8f8983, 0x7a7571],
  [KIND.SNOW]: [0xeef3f7, 0xe4ebf1, 0xf5f8fb],
  [KIND.FOREST]: [0x4d6f33, 0x557a38, 0x46672f],
  [KIND.TRAIL]: [0xb08c5a, 0xb89462, 0xa88452],
};
const CLIFF = { [KIND.ROCK]: 0x6f6a66, [KIND.SNOW]: 0x9aa3ab, [KIND.TRAIL]: 0x6c6660, default: 0x7b5a3a };

function topColor(grid, x, z) {
  const i = z * grid.w + x;
  const k = grid.kind[i];
  const pal = KIND_COLORS[k] || KIND_COLORS[KIND.GRASS];
  let c = pal[Math.floor(hash2(x, z, 3) * pal.length)];
  if (k === KIND.GRASS || k === KIND.FOREST) {
    // sandy rim along the shore
    let shore = 0;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) if (grid.isWater(x + dx, z + dz)) shore++;
    if (shore > 0) c = mix(c, 0xb7a06b, Math.min(0.75, 0.35 + shore * 0.1));
    // patchy autumn tint in the meadow (smooth low-frequency patches)
    const n = fbm2(x * 0.12, z * 0.12, 17);
    if (n > 0.55) c = mix(c, 0x94983c, Math.min(0.35, (n - 0.55) * 2.2));
    else if (n < 0.38) c = mix(c, 0x5d8a36, Math.min(0.3, (0.38 - n) * 2));
  }
  if (k === KIND.WATER) {
    const deep = grid.height[i] < -0.7;
    c = deep ? mix(c, 0x6f7a58, 0.35) : c;
  }
  if (k === KIND.ROCK && grid.height[i] > 11) c = mix(c, 0xdfe6ec, 0.35);
  return c;
}

const terrainVert = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNor;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNor = normalize(mat3(modelMatrix) * objectNormal);');
};

export function makeTerrainMaterial(uniforms) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWaterY = { value: WATER_Y };
    shader.uniforms.uCaustic = uniforms.uCaustic;
    terrainVert(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWPos;
varying vec3 vWNor;
uniform float uTime;
uniform float uWaterY;
uniform float uCaustic;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 an = abs(vWNor);
  vec2 cell = an.y > 0.5 ? vWPos.xz : (an.x > 0.5 ? vWPos.zy : vWPos.xy);
  vec2 q = floor(cell * 10.0 + 0.001);
  float n = h21(q);
  float n2 = h21(floor(cell * 5.0 + 0.001) + 17.0);
  float grain = (n - 0.5) * 0.14 + (n2 - 0.5) * 0.08;
  if (an.y < 0.5) {
    // strata on cliffs
    float s = h21(vec2(floor(vWPos.y * 10.0), floor((vWPos.x + vWPos.z) * 2.0)));
    grain += (s - 0.5) * 0.12;
  }
  diffuseColor.rgb *= 1.0 + grain;
  if (vWPos.y < uWaterY - 0.02) {
    // underwater: caustics + tint
    vec2 cp = floor(vWPos.xz * 10.0) / 10.0;
    float c1 = sin(cp.x * 3.1 + uTime * 1.3 + sin(cp.y * 2.3 + uTime * 0.7) * 1.5);
    float c2 = sin(cp.y * 3.7 - uTime * 1.1 + sin(cp.x * 1.9 - uTime * 0.9) * 1.5);
    float c = smoothstep(0.75, 1.0, abs(c1 * c2));
    diffuseColor.rgb = diffuseColor.rgb * vec3(0.4, 0.56, 0.66);
    diffuseColor.rgb += c * uCaustic * vec3(0.22, 0.3, 0.26);
  }
}`,
      );
  };
  return mat;
}

export function buildTerrainGeometry(grid) {
  const { w, h } = grid;
  const pos = [], nor = [], col = [], idx = [];
  let vi = 0;
  const quad = (a, b, c, d, n, rgb) => {
    pos.push(...a, ...b, ...c, ...d);
    for (let k = 0; k < 4; k++) nor.push(n[0], n[1], n[2]);
    for (let k = 0; k < 4; k++) col.push(rgb[k][0], rgb[k][1], rgb[k][2]);
    idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    vi += 4;
  };
  const Hs = (x, z) => (grid.inb(x, z) ? grid.height[z * w + x] : BASE_Y);
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      const y = grid.height[i];
      const k = grid.kind[i];
      const tc = linearRGB(topColor(grid, x, z));
      // simple corner AO on top face: darker where neighbours are higher
      const ao = (dx, dz) => {
        const hs = [Hs(x + dx, z), Hs(x, z + dz), Hs(x + dx, z + dz)];
        let occ = 0;
        for (const v of hs) if (v > y + 0.01) occ++;
        return [1, 0.86, 0.76, 0.68][occ];
      };
      const c00 = ao(-1, -1), c10 = ao(1, -1), c11 = ao(1, 1), c01 = ao(-1, 1);
      const tcol = (f) => [tc[0] * f, tc[1] * f, tc[2] * f];
      // top face (CCW from above): (x,z) -> (x,z+1) -> (x+1,z+1) -> (x+1,z)
      quad([x, y, z], [x, y, z + 1], [x + 1, y, z + 1], [x + 1, y, z], [0, 1, 0], [tcol(c00), tcol(c01), tcol(c11), tcol(c10)]);
      // side faces where neighbour is lower
      let sideHex = CLIFF[k] ?? CLIFF.default;
      if (!grid.meadow[i] && y > 0.6 && k === KIND.FOREST) sideHex = 0x746e67;
      const topHex = topColor(grid, x, z);
      const sides = [
        [1, 0, [1, 0, 0]],
        [-1, 0, [-1, 0, 0]],
        [0, 1, [0, 0, 1]],
        [0, -1, [0, 0, -1]],
      ];
      for (const [dx, dz, n] of sides) {
        const ny = Hs(x + dx, z + dz);
        if (ny >= y) continue;
        const y0 = Math.max(ny, BASE_Y), y1 = y;
        // lip: top 0.1 of the side keeps the top colour (grass overhang)
        const lip = Math.min(0.1, y1 - y0);
        const sc = linearRGB(k === KIND.WATER ? 0x8a7a55 : sideHex);
        const lc = linearRGB(k === KIND.WATER ? 0x8a7a55 : mix(topHex, 0x000000, 0.12));
        const dark = [sc[0] * 0.8, sc[1] * 0.8, sc[2] * 0.8];
        const faces = [
          [y1 - lip, y1, lc, lc],
          [y0, y1 - lip, dark, sc],
        ];
        for (const [a0, a1, cb, ct] of faces) {
          if (a1 - a0 <= 0.0001) continue;
          let A, B, C, D;
          if (dx === 1) { A = [x + 1, a0, z + 1]; B = [x + 1, a0, z]; C = [x + 1, a1, z]; D = [x + 1, a1, z + 1]; }
          else if (dx === -1) { A = [x, a0, z]; B = [x, a0, z + 1]; C = [x, a1, z + 1]; D = [x, a1, z]; }
          else if (dz === 1) { A = [x, a0, z + 1]; B = [x + 1, a0, z + 1]; C = [x + 1, a1, z + 1]; D = [x, a1, z + 1]; }
          else { A = [x + 1, a0, z]; B = [x, a0, z]; C = [x, a1, z]; D = [x + 1, a1, z]; }
          quad(A, B, C, D, n, [cb, cb, ct, ct]);
        }
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- water

const waterVert = /* glsl */ `
varying vec3 vWPos;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const waterFrag = /* glsl */ `
uniform float uTime;
uniform sampler2D uShore;
uniform vec2 uGridSize;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uGlint;
uniform vec3 uSkyTint;
uniform float uNight;
uniform float uAurora;
varying vec3 vWPos;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec2 q = floor(vWPos.xz * 10.0) / 10.0 + 0.05;
  float shore = texture2D(uShore, q / uGridSize).r; // 0 at land, 1 deep
  vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 1.0, shore));
  // slow colour drift like the reference (teal <-> violet)
  float drift = sin(q.x * 0.21 + uTime * 0.05) * sin(q.y * 0.17 - uTime * 0.04);
  col = mix(col, col * vec3(0.9, 0.95, 1.12), 0.5 + 0.5 * drift);
  // pixel ripple lines
  float r1 = sin(q.x * 2.2 + q.y * 0.9 + uTime * 1.1) + sin(q.y * 2.6 - q.x * 0.7 - uTime * 0.8);
  float line = step(1.82, r1);
  col += line * uGlint * 0.07;
  // sparkles
  vec2 cell = floor(vWPos.xz * 10.0);
  float s = h21(cell + floor(uTime * 1.5));
  float spark = step(0.9985, s) * (0.6 + 0.4 * sin(uTime * 9.0 + s * 40.0));
  col += spark * uGlint * 0.5;
  // foam at the shore
  float foamN = h21(cell * 0.5 + floor(uTime * 2.0) * 0.37);
  float foamEdge = 0.05 + 0.035 * sin(uTime * 2.0 + q.x * 3.0 + q.y * 2.0);
  float foam = step(shore, foamEdge) * step(0.45, foamN);
  col = mix(col, uFoam, foam * 0.6);
  // sky reflection tint (sunset / aurora at night)
  col = mix(col, uSkyTint, 0.06);
  float au = uAurora * (0.5 + 0.5 * sin(q.x * 0.35 + uTime * 0.3 + sin(q.y * 0.2) * 2.0));
  col += vec3(0.05, 0.35, 0.22) * au * 0.35;
  float alpha = mix(0.6, 0.84, smoothstep(0.1, 1.0, shore));
  alpha = max(alpha, foam * 0.8);
  gl_FragColor = vec4(col, alpha);
}
`;

export function makeWaterMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: waterVert,
    fragmentShader: waterFrag,
    uniforms,
    transparent: true,
    depthWrite: false,
  });
}

export function buildWaterGeometry(grid) {
  const { w, h } = grid;
  const pos = [], idx = [];
  let vi = 0;
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      if (grid.kind[z * w + x] !== KIND.WATER) continue;
      pos.push(x, WATER_Y, z, x, WATER_Y, z + 1, x + 1, WATER_Y, z + 1, x + 1, WATER_Y, z);
      idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      vi += 4;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(vi > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// Shore distance texture: per tile distance to land, normalised (0..1).
export function buildShoreTexture(grid, tex) {
  const { w, h } = grid;
  const dist = new Float32Array(w * h).fill(99);
  const q = [];
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      if (grid.kind[i] !== KIND.WATER) { dist[i] = 0; q.push(i); }
    }
  // chamfer BFS
  let head = 0;
  while (head < q.length) {
    const c = q[head++];
    const cx = c % w, cz = (c / w) | 0;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        const ni = nz * w + nx;
        const nd = dist[c] + (dx && dz ? 1.414 : 1);
        if (nd < dist[ni]) { dist[ni] = nd; q.push(ni); }
      }
  }
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = Math.min(1, Math.max(0, (dist[i] - 0.5) / 3.0));
    data[i * 4] = Math.round(v * 255);
    data[i * 4 + 3] = 255;
  }
  if (!tex) {
    tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  } else {
    tex.image.data.set(data);
  }
  tex.needsUpdate = true;
  return tex;
}
