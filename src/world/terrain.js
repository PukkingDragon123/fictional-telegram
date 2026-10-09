// Terrain mesh (voxel columns per tile) textured with 2D pixel-art tiles, and
// the water surface driven by the height-field simulation (waterSim.js).
//
// Terrain: every top face samples a pixel texture chosen from a per-tile
// "surface" map (grass, autumn grass, dirt, shore sand, pond floor, rock,
// snow, trail, forest floor). The lookup is jittered at texel resolution so
// borders between surfaces become ragged, dithered pixel edges instead of a
// tile grid. Cliffs/banks use a vertical rock or soil texture. Vertex colours
// only carry ambient occlusion.
import * as THREE from 'three';
import { KIND, WATER_Y } from './grid.js';
import { hash2, fbm2 } from '../core/rng.js';
import { STONE_GLSL, stoneUniforms } from '../art/stoneArt.js'; // [v20 map]

const BASE_Y = -4;
// [v26 world] cube walls: flat vertex shade (each block is shaded in the shader)
const CUBE_LO = [0.86, 0.86, 0.88], CUBE_HI = [0.92, 0.92, 0.92];
const SOIL_LO = [0.62, 0.62, 0.66], SOIL_HI = [0.95, 0.95, 0.95];
const AO_K = [1, 0.84, 0.74, 0.66];
const SIDES4 = [[1, 0, [1, 0, 0]], [-1, 0, [-1, 0, 0]], [0, 1, [0, 0, 1]], [0, -1, [0, 0, -1]]];
// [v26 world] True cubes for mountains, cliffs and the Highland: 0.5-unit blocks
// (every grid height there is a whole number of them). Each block face picks
// its own 12x12 window of the pixel texture and gets a bevel (lit top-left edge,
// dark bottom-right edge), so a cliff reads as a stack of blocks, never as one
// stretched column. The top block of a grassy / snowy column wears its lip.
export const CUBE_GLSL = /* glsl */ `
float cbH(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
vec3 atlasWin(int id, vec2 win, vec2 lu) {
  vec4 r = uRects[id];
  vec2 t = (win * 12.0 + floor(lu * 12.0) + 0.5) / 48.0;
  return texture2D(uAtlas, r.xy + t * r.zw).rgb;
}
vec3 stoneWin(float v, vec2 win, vec2 lu) {
  vec2 t = (win * 12.0 + floor(lu * 12.0) + 0.5) / 48.0;
  return texture2D(uStone, vec2((v + t.x) / 7.0, t.y)).rgb;
}
int cubeSurf(vec2 tile) { return int(texture2D(uSurf, (tile + 0.5) / uGridSize).r * 255.0 / 16.0 + 0.5); }
vec3 cubeBlock(vec3 wp, vec3 wn, vec3 cb) {
  const float BS = 0.5;
  vec3 an = abs(wn);
  vec3 c;
  vec2 lu, bp;
  if (an.y > 0.5) {
    bp = floor(wp.xz / BS + 0.001);
    lu = fract(wp.xz / BS + 0.001);
    float hb = cbH(bp + floor(wp.y * 2.0 + 0.5) * 0.37);
    // the surface of this block's tile (edge blocks borrow a neighbour's now and then: blocky borders)
    vec2 tile = floor((bp + 0.5) * BS + (vec2(cbH(bp + 3.1), cbH(bp + 7.7)) - 0.5) * 0.7);
    int id = cubeSurf(tile);
    vec2 win = floor(vec2(hb, cbH(bp + 1.3)) * 4.0);
    if (id == 5 || id == 9) c = stoneWin(hb < 0.7 ? 0.0 : (hb < 0.85 ? 1.0 : 2.0), win, lu) * 1.22;
    else c = atlasWin(id, win, lu);
    c *= 0.93 + hb * 0.14;
  } else {
    float u = (an.x > 0.5 ? wp.z : wp.x) / BS, v = wp.y / BS;
    bp = vec2(floor(u + 0.001), floor(v + 0.001));
    lu = vec2(fract(u + 0.001), fract(v + 0.001));
    if (wn.x < -0.5 || wn.z > 0.5) lu.x = 1.0 - lu.x;
    vec2 tile = floor(wp.xz - wn.xz * 0.5);
    float hb = cbH(bp + tile * 0.173);
    vec2 win = floor(vec2(hb, cbH(bp + 5.9)) * 4.0);
    int top = cubeSurf(tile);
    float depthB = (cb.y - wp.y) / BS; // blocks below the column top
    float band = floor(wp.y / 1.5);
    float hs = cbH(vec2(band, tile.x * 0.01 + 3.0));
    float sv = hs < 0.45 ? 0.0 : hs < 0.75 ? 1.0 : hs < 0.9 ? 3.0 : 6.0;
    if (wp.y < 2.0 && cbH(bp + 9.1) < 0.5) sv = 2.0; // mossy at the foot
    if (wp.y > 14.0 && hs < 0.6) sv = 5.0; // frosted up high
    bool soil = (top == 8 || top == 0 || top == 1 || top == 2 || top == 7 || top == 3) && depthB < 1.0;
    bool snowy = top == 6 && depthB < 1.0;
    if (soil) c = atlasWin(2, win, lu) * 0.95;
    else if (snowy) c = stoneWin(5.0, win, lu) * 1.18;
    else c = stoneWin(sv, win, lu) * 1.22;
    // the lip of the top block: grass / forest floor / snow hanging over the edge
    float lipT = floor((1.0 - lu.y) * 12.0);
    if (depthB < 1.0 && lipT < 2.0 + step(0.5, cbH(vec2(floor(lu.x * 12.0), bp.x)))) {
      if (top == 6) c = vec3(0.93, 0.96, 1.0);
      else if (top == 8 || top == 0 || top == 1) c = atlasWin(top, win, vec2(lu.x, 0.95)) * 0.95;
    }
    c *= 0.9 + hb * 0.14;
    // contact shade at the foot of the wall
    c *= mix(0.72, 1.0, smoothstep(0.0, 1.0, (wp.y - cb.z) / BS));
    // shade by side (the camera usually sees south / east faces): a touch of depth
    c *= an.x > 0.5 ? 0.9 : 0.97;
  }
  // bevel: a lit top-left edge and a dark bottom-right edge on every block
  float px = 1.0 / 12.0;
  float ly = an.y > 0.5 ? 1.0 - lu.y : lu.y; // tops: the far edge is "up"
  if (lu.x < px || ly > 1.0 - px) c *= 1.13;
  if (lu.x > 1.0 - px || ly < px) c *= 0.74;
  return c;
}
`;

// surface ids (must match SURF_NAMES order)
export const SURF = { GRASS: 0, AUTUMN: 1, DIRT: 2, SAND: 3, POND: 4, ROCK: 5, SNOW: 6, TRAIL: 7, FOREST: 8, CLIFF: 9 };
export const SURF_NAMES = ['grass', 'grass_autumn', 'dirt', 'sand', 'pondfloor', 'cliff', 'snow', 'trail', 'forest', 'cliff'];

// ------------------------------------------------------------------ atlas
// Procedural stand-in textures (used until src/art/terrainArt.js is present).
function fallbackAtlas() {
  const S = 48;
  const cv = document.createElement('canvas');
  cv.width = S * 4; cv.height = S * 3;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const tiles = {};
  const pals = {
    grass: ['#6da53f', '#7bb347', '#5f9638', '#8cc453', '#4f8534'],
    grass_autumn: ['#9aa545', '#a9b04c', '#8a963c', '#c0b85a', '#c8743a'],
    dirt: ['#8a6444', '#7a583c', '#9a7450', '#6a4c34', '#a88a64'],
    sand: ['#d8c28a', '#cbb47c', '#e4d09a', '#b8a06c', '#9c8c70'],
    pondfloor: ['#7c7a52', '#6e6c48', '#8a885c', '#5e5c3e', '#a09a78'],
    cliff: ['#8a8680', '#7a7670', '#9a968e', '#66625e', '#6f8a5a'],
    snow: ['#eef3f8', '#e2eaf2', '#f8fbff', '#d0dcea', '#ffffff'],
    trail: ['#b8946a', '#a8845c', '#c4a07a', '#94744e', '#8a8a86'],
    forest: ['#5c6a36', '#4e5c30', '#6a7a3e', '#7a5a34', '#8a4a2a'],
  };
  let k = 0;
  for (const [name, pal] of Object.entries(pals)) {
    const ox = (k % 4) * S, oy = Math.floor(k / 4) * S;
    k++;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const n = hash2(x + ox, y + oy, 11);
        const m = fbm2(x * 0.15 + ox, y * 0.15 + oy, 5);
        let c = pal[0];
        if (m > 0.6) c = pal[1];
        else if (m < 0.38) c = pal[2];
        if (n > 0.93) c = pal[3];
        else if (n < 0.025) c = pal[4];
        ctx.fillStyle = c;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    tiles[name] = { x: ox, y: oy, w: S, h: S };
  }
  return { canvas: cv, tiles };
}

let atlasTex = null;
const rectUniform = { value: Array.from({ length: 10 }, () => new THREE.Vector4(0, 0, 1, 1)) };
const atlasUniform = { value: null };

function applyAtlas(atlas) {
  const cv = atlas.canvas;
  if (atlasTex) atlasTex.dispose();
  atlasTex = new THREE.CanvasTexture(cv);
  atlasTex.magFilter = THREE.NearestFilter;
  atlasTex.minFilter = THREE.NearestFilter;
  atlasTex.generateMipmaps = false;
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.flipY = false;
  atlasTex.needsUpdate = true;
  atlasUniform.value = atlasTex;
  SURF_NAMES.forEach((name, i) => {
    const t = atlas.tiles[name] || atlas.tiles.grass || { x: 0, y: 0, w: cv.width, h: cv.height };
    rectUniform.value[i].set(t.x / cv.width, t.y / cv.height, t.w / cv.width, t.h / cv.height);
  });
}

applyAtlas(fallbackAtlas());
// [v20 map] the valley ring (outerRing.js) shares the same pixel textures
export function terrainAtlasUniforms() { return { uAtlas: atlasUniform, uRects: rectUniform }; }
// swap in the real pixel art when the module is available
const artMods = import.meta.glob('../art/terrainArt.js');
if (artMods['../art/terrainArt.js']) {
  artMods['../art/terrainArt.js']().then((m) => {
    try { const a = m.buildTerrainAtlas?.(); if (a?.canvas) applyAtlas(a); } catch { /* keep fallback */ }
  }).catch(() => {});
}

// ------------------------------------------------------------------ surface map
export function surfaceOf(grid, x, z) {
  const i = z * grid.w + x;
  const k = grid.kind[i];
  switch (k) {
    case KIND.WATER: return SURF.POND;
    case KIND.SAND: return SURF.SAND;
    case KIND.DIRT: return SURF.DIRT;
    case KIND.ROCK: return SURF.ROCK;
    case KIND.SNOW: return SURF.SNOW;
    case KIND.TRAIL: return SURF.TRAIL;
    case KIND.FOREST: return SURF.FOREST;
    default: break;
  }
  // meadow grass: sandy rim along the water, patches of autumn grass
  let shore = false;
  for (let dz = -1; dz <= 1 && !shore; dz++)
    for (let dx = -1; dx <= 1; dx++) if (grid.isWater(x + dx, z + dz)) { shore = true; break; }
  if (shore) return SURF.SAND;
  const n = fbm2(x * 0.12, z * 0.12, 17);
  return n > 0.58 ? SURF.AUTUMN : SURF.GRASS;
}

export function buildSurfaceTexture(grid, tex) {
  const { w, h } = grid;
  const data = tex ? tex.image.data : new Uint8Array(w * h * 4);
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const o = (z * w + x) * 4;
      data[o] = surfaceOf(grid, x, z) * 16;
      data[o + 1] = grid.meadow[z * w + x] ? 255 : 0; data[o + 2] = 0; data[o + 3] = 255;
    }
  if (!tex) {
    tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
  }
  tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------------ terrain material
const terrainVert = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aSide;\nattribute vec3 aCube;\nvarying vec3 vCube;\nvarying vec3 vWPos;\nvarying vec3 vWNor;\nvarying float vSide;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNor = normalize(mat3(modelMatrix) * objectNormal);\nvSide = aSide;\nvCube = aCube;');
};

export function makeTerrainMaterial(uniforms) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWaterY = { value: WATER_Y };
    shader.uniforms.uCaustic = uniforms.uCaustic;
    shader.uniforms.uAtlas = atlasUniform;
    shader.uniforms.uRects = rectUniform;
    shader.uniforms.uSurf = uniforms.uSurf;
    shader.uniforms.uGridSize = uniforms.uGridSize;
    shader.uniforms.uSim = uniforms.uSim;
    shader.uniforms.uSimRect = uniforms.uSimRect;
    shader.uniforms.uBlueprint = uniforms.uBlueprint;
    Object.assign(shader.uniforms, stoneUniforms()); // [v20 map] mountain stone, shared with the valley
    terrainVert(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWPos;
varying vec3 vWNor;
varying float vSide;
varying vec3 vCube;
uniform float uTime;
uniform float uWaterY;
uniform float uCaustic;
uniform sampler2D uAtlas;
uniform vec4 uRects[10];
uniform sampler2D uSurf;
uniform vec2 uGridSize;
uniform sampler2D uSim;
uniform vec4 uSimRect;
uniform float uBlueprint;
${STONE_GLSL}
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn2(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
${CUBE_GLSL}
vec3 surfTex(int id, vec2 p) {
  vec4 r = uRects[id];
  vec2 t = fract(p / 2.0);            // one 48px texture covers 2x2 tiles
  t = (floor(t * 48.0) + 0.5) / 48.0; // snap to texels
  return texture2D(uAtlas, r.xy + t * r.zw).rgb;
}
`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 an = abs(vWNor);
  vec3 tex;
  if (an.y > 0.5) {
    // jittered surface lookup -> ragged, dithered borders between surfaces
    vec2 p = vWPos.xz;
    vec2 tp = floor(p * 24.0) / 24.0;
    vec2 j = vec2(h21(tp) - 0.5, h21(tp + 7.3) - 0.5) * 0.28 + (vec2(vn2(p * 1.9), vn2(p * 1.9 + 4.1)) - 0.5) * 0.7;
    vec2 q = (floor(p + j) + 0.5) / uGridSize;
    int id = int(texture2D(uSurf, q).r * 255.0 / 16.0 + 0.5);
    tex = surfTex(id, p);
    // [v20 map] bare mountain rock: the detailed stone of the valley ranges
    if (id == 5) tex = stoneTex(vn2(p * 0.08) > 0.55 ? 1.0 : 0.0, p) * 1.25;
  } else {
    vec2 sp = an.x > 0.5 ? vec2(vWPos.z, vWPos.y) : vec2(vWPos.x, vWPos.y);
    int id = vSide > 0.5 ? 9 : 2;
    tex = surfTex(id, sp * vec2(1.0, 1.0));
    // [v20 map] rocky cliffs (the north mountain) in the valley's stone strata
    if (vSide > 0.5) { float band = floor(vWPos.y / 1.5); float hb = h21(vec2(band, 3.0)); tex = stoneTex(hb < 0.45 ? 1.0 : hb < 0.8 ? 0.0 : 6.0, sp) * 1.25; }
    // grassy lip along the top edge of banks
    if (vSide < 0.5 && fract(vWPos.y) > 0.0) {}
  }
  if (vCube.x > 0.5) tex = cubeBlock(vWPos, vWNor, vCube); // [v26 world] true cubes: one block texture per face
  diffuseColor.rgb *= tex * 1.12;
  if (vWPos.y < uWaterY - 0.02) {
    // underwater: tint + caustics that follow the simulated ripples
    vec2 cp = floor(vWPos.xz * 24.0) / 24.0;
    vec2 suv = (cp - uSimRect.xy) / uSimRect.zw;
    // [v20 water] the sim texture holds height only: slope from the neighbours
    vec2 st = 1.0 / vec2(textureSize(uSim, 0));
    vec3 s = vec3(0.0, texture2D(uSim, suv + vec2(st.x, 0.0)).r - texture2D(uSim, suv - vec2(st.x, 0.0)).r,
                  texture2D(uSim, suv + vec2(0.0, st.y)).r - texture2D(uSim, suv - vec2(0.0, st.y)).r) * 2.2;
    float c1 = sin(cp.x * 3.1 + uTime * 1.3 + sin(cp.y * 2.3 + uTime * 0.7) * 1.5);
    float c2 = sin(cp.y * 3.7 - uTime * 1.1 + sin(cp.x * 1.9 - uTime * 0.9) * 1.5);
    float c = smoothstep(0.72, 1.0, abs(c1 * c2)) + smoothstep(0.04, 0.12, length(s.gb)) * 0.6;
    float depth = clamp((uWaterY - vWPos.y) / 1.0, 0.0, 1.0);
    diffuseColor.rgb *= mix(vec3(0.62, 0.78, 0.8), vec3(0.36, 0.52, 0.64), depth);
    diffuseColor.rgb += c * uCaustic * vec3(0.2, 0.28, 0.24) * (1.0 - depth * 0.5);
  }
  if (uBlueprint > 0.001) {
    // blueprint mode: chalky tile grid, your land bright, the wild dim
    vec2 tq = (floor(vWPos.xz) + 0.5) / uGridSize;
    float mine = texture2D(uSurf, tq).g;
    vec2 f = fract(vWPos.xz);
    float px = 1.0 / 24.0;
    float line = (f.x < px || f.y < px) ? 1.0 : 0.0;
    float major = (mod(floor(vWPos.x), 5.0) < 0.5 && f.x < px * 2.0) || (mod(floor(vWPos.z), 5.0) < 0.5 && f.y < px * 2.0) ? 1.0 : 0.0;
    vec3 bp = diffuseColor.rgb * mix(0.45, 1.0, mine);
    bp += vec3(0.9, 0.97, 1.0) * max(line * 0.35, major * 0.6) * mix(0.35, 1.0, mine);
    diffuseColor.rgb = mix(diffuseColor.rgb, bp, uBlueprint);
  }
}`,
      );
  };
  mat.customProgramCacheKey = () => 'terrain3'; // [v26 world] (cubes)
  return mat;
}

export function buildTerrainGeometry(grid) {
  const { w, h } = grid;
  const pos = [], nor = [], col = [], side = [], idx = [], cub = [];
  let vi = 0;
  // [v26 world] cube tiles (mountains, cliffs, the Highland): aCube = (1, column top, wall bottom)
  let cubeF = 0, cubeTop = 0, cubeBot = 0;
  const quad = (a, b, c, d, n, rgb, sd) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]); // [v26 world] (no spreads: the map is twice as big)
    for (let k = 0; k < 4; k++) { nor.push(n[0], n[1], n[2]); side.push(sd); cub.push(cubeF, cubeTop, cubeBot); }
    for (let k = 0; k < 4; k++) col.push(rgb[k][0], rgb[k][1], rgb[k][2]);
    idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    vi += 4;
  };
  const Hs = (x, z) => (grid.inb(x, z) ? grid.height[z * w + x] : BASE_Y);
  const isW = (x, z) => grid.inb(x, z) && grid.kind[z * w + x] === KIND.WATER;
  // pond floors are smoothed into a gentle bowl: each corner takes the mean
  // depth of the water tiles touching it (no stair-stepped slabs underwater)
  const CW = w + 1;
  const cornerH = new Float32Array(CW * (h + 1));
  for (let cz = 0; cz <= h; cz++)
    for (let cx = 0; cx <= w; cx++) {
      let sum = 0, n = 0;
      for (let q = 0; q < 4; q++) { const tx = cx - 1 + (q & 1), tz = cz - 1 + (q >> 1); if (isW(tx, tz)) { sum += grid.height[tz * w + tx]; n++; } } // [v26 world] (no per-corner arrays)
      cornerH[cz * CW + cx] = n ? sum / n : 0;
    }
  const CH = (cx, cz) => cornerH[cz * CW + cx];
  // wild land (mountain, forest hills) is smoothed into slopes instead of
  // stair-stepped terraces: corners take the mean height of the land tiles
  // around them. Your land (the meadow) and the trail stay crisp and flat.
  const terra = grid.terraSlope; // Terraform: reshaped meadow tiles get smooth slopes too
  const smoothT = (x, z) => {
    if (!grid.inb(x, z)) return false;
    const i = z * w + x, k = grid.kind[i];
    if (terra && terra[i]) return true;
    if (grid.cube && grid.cube[i]) return false; // [v26 world] true cubes, never smoothed
    return !grid.meadow[i] && k !== KIND.WATER && k !== KIND.TRAIL && grid.occ[i] !== -2 && z >= 22 && !(grid.biome && grid.biome[i] === 4);
  };
  // [line fix] tiles actually drawn as a smoothed slope (low ones stay flat tops)
  const smoothDrawn = (x, z) => smoothT(x, z) && (grid.height[z * w + x] > 0.01 || !!(terra && terra[z * w + x]));
  const landH = new Float32Array(CW * (h + 1));
  for (let cz = 0; cz <= h; cz++)
    for (let cx = 0; cx <= w; cx++) {
      let sum = 0, n = 0, mx = -99;
      for (let q = 0; q < 4; q++) { // [v26 world] (no per-corner arrays)
        const tx = cx - 1 + (q & 1), tz = cz - 1 + (q >> 1);
        if (!grid.inb(tx, tz)) continue;
        const ti = tz * w + tx;
        if (grid.kind[ti] === KIND.WATER) continue;
        const hh = grid.height[ti];
        // never sink below a flat (unsmoothed) neighbour: keeps the meadow/trail edges sealed
        if (!smoothDrawn(tx, tz)) mx = Math.max(mx, hh); // [line fix] (was !smoothT: low slope tiles are drawn flat too)
        sum += hh; n++;
      }
      let v = Math.max(sum / n, mx === -99 ? -99 : Math.min(mx, sum / n + 0.5));
      // [line fix] a hair above a flat neighbour: meet it exactly. A sub-pixel
      // step (the forest's 0.02 next to the meadow's 0 gave 0.01) can't be drawn
      // as pixel art: square to the camera it flickers in as a full-width line.
      if (mx !== -99 && v > mx && v - mx < 0.2) v = mx;
      landH[cz * CW + cx] = n ? v : 0;
    }
  const LH = (cx, cz) => landH[cz * CW + cx];
  // remember the smoothed surface so sprites (trees, rocks) sit on the slope
  grid.slopeH = landH;
  grid.isSlope = smoothT;
  const edgeLH = (x, z, dx, dz) => (dx === 1 ? [LH(x + 1, z), LH(x + 1, z + 1)] : dx === -1 ? [LH(x, z), LH(x, z + 1)] : dz === 1 ? [LH(x, z + 1), LH(x + 1, z + 1)] : [LH(x, z), LH(x + 1, z)]);
  const _e1 = [0, 0, 0], _e2 = [0, 0, 0];
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const i = z * w + x;
      const y = grid.height[i];
      const k = grid.kind[i];
      cubeF = 0; // [v26 world]
      if (smoothDrawn(x, z)) { // [line fix] same test, shared with the seals
        const a = [x, LH(x, z), z], b = [x, LH(x, z + 1), z + 1], c = [x + 1, LH(x + 1, z + 1), z + 1], d = [x + 1, LH(x + 1, z), z];
        _e1[0] = c[0] - a[0]; _e1[1] = c[1] - a[1]; _e1[2] = c[2] - a[2];
        _e2[0] = d[0] - b[0]; _e2[1] = d[1] - b[1]; _e2[2] = d[2] - b[2];
        // normal = e2 x e1 (pointing up)
        let nx = _e2[1] * _e1[2] - _e2[2] * _e1[1], ny = _e2[2] * _e1[0] - _e2[0] * _e1[2], nz = _e2[0] * _e1[1] - _e2[1] * _e1[0];
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const nl = Math.hypot(nx, ny, nz) || 1;
        const steep = 1 - ny / nl;
        const rocky = k === KIND.ROCK || k === KIND.SNOW;
        let shade = 1 - steep * 0.25;
        // Terraform hills: banded top-left light so they read from the high camera
        if (terra && terra[i]) shade = Math.round(Math.min(1.25, Math.max(0.68, shade + (-nx - nz) / nl * 0.9)) * 10) / 10;
        const f = [shade, shade, shade];
        quad(a, b, c, d, [nx / nl, ny / nl, nz / nl], [f, f, f, f], rocky && steep > 0.35 ? 1 : 0);
        // seal against flat neighbours (trail / meadow) that sit lower
        // [line fix] every step is sealed, however small: the old 0.01 tolerance
        // left 1 cm see-through slivers all along the meadow / trail edges (the
        // smoothed corner there is exactly 0.01 up). With the camera rotated
        // square to such an edge a whole row of pixels can fall into the
        // sliver: a full-width line of sky across the screen. Also covers
        // flat-drawn slope tiles (height <= 0.01) and pond banks.
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nxx = x + dx, nzz = z + dz;
          if (!grid.inb(nxx, nzz) || smoothDrawn(nxx, nzz)) continue; // [line fix]
          const wet = grid.kind[nzz * w + nxx] === KIND.WATER; // [line fix]
          const ny0 = grid.height[nzz * w + nxx];
          let P, Q;
          if (dx === 1) { P = d; Q = c; } else if (dx === -1) { P = b; Q = a; } else if (dz === 1) { P = c; Q = b; } else { P = a; Q = d; }
          const lo = [0.62, 0.62, 0.66], hi = [0.95, 0.95, 0.95];
          if (wet) { // [line fix] bank down to the smoothed pond floor, like the flat tiles do
            quad([P[0], CH(P[0], P[2]) - 0.05, P[2]], [Q[0], CH(Q[0], Q[2]) - 0.05, Q[2]], Q, P, [dx, 0, dz], [lo, lo, hi, hi], 0);
            continue;
          }
          const pa = P[1] - ny0, qa = Q[1] - ny0; // [line fix]
          if (pa <= 0 && qa <= 0) continue;
          if (pa > 0 && qa > 0) quad([P[0], ny0, P[2]], [Q[0], ny0, Q[2]], [Q[0], Q[1], Q[2]], [P[0], P[1], P[2]], [dx, 0, dz], [lo, lo, hi, hi], 1);
          else { // [line fix] the edge dips under the neighbour: seal just the part above it
            const t = pa / (pa - qa), M = [P[0] + (Q[0] - P[0]) * t, ny0, P[2] + (Q[2] - P[2]) * t];
            const T = pa > 0 ? P : Q;
            quad([T[0], ny0, T[2]], M, M, T, [dx, 0, dz], [lo, lo, hi, hi], 1);
          }
        }
        continue;
      }
      cubeF = 0; // [v26 world]
      if (k === KIND.WATER) {
        const c00 = 0.92, f = [c00, c00, c00];
        const a = [x, CH(x, z), z], b = [x, CH(x, z + 1), z + 1], c = [x + 1, CH(x + 1, z + 1), z + 1], d = [x + 1, CH(x + 1, z), z];
        quad(a, b, c, d, [0, 1, 0], [f, f, f, f], 0);
        continue;
      }
      cubeF = grid.cube && grid.cube[i] ? 1 : 0; cubeTop = y; cubeBot = y; // [v26 world]
      // simple corner AO on top face: darker where neighbours are higher
      const ao = (dx, dz) => AO_K[(Hs(x + dx, z) > y + 0.01) + (Hs(x, z + dz) > y + 0.01) + (Hs(x + dx, z + dz) > y + 0.01)]; // [v26 world] (no arrays)
      const tint = k === KIND.WATER ? 0.92 : 1;
      const g = (f) => [f * tint, f * tint, f * tint];
      const c00 = ao(-1, -1), c10 = ao(1, -1), c11 = ao(1, 1), c01 = ao(-1, 1);
      quad([x, y, z], [x, y, z + 1], [x + 1, y, z + 1], [x + 1, y, z], [0, 1, 0], [g(c00), g(c01), g(c11), g(c10)], 0);
      // rock/snow/mountain sides use the cliff texture, meadow & pond banks use soil
      const rocky = k === KIND.ROCK || k === KIND.SNOW || (!grid.meadow[i] && y > 0.6);
      for (const [dx, dz, n] of SIDES4) { // [v26 world] (hoisted)
        let ny = Hs(x + dx, z + dz);
        if (isW(x + dx, z + dz)) {
          // bank down to the smoothed pond floor (overlaps slightly below it)
          const ex = dx === 1 ? x + 1 : x, ez = dz === 1 ? z + 1 : z;
          const e0 = dx !== 0 ? CH(ex, z) : CH(x, ez), e1 = dx !== 0 ? CH(ex, z + 1) : CH(x + 1, ez);
          ny = Math.min(ny, e0, e1) - 0.05;
        } else if (smoothDrawn(x + dx, z + dz)) {
          // [line fix] a slope neighbour: its edge may sit below its own tile height
          const [e0, e1] = edgeLH(x, z, dx, dz);
          ny = Math.min(ny, e0, e1);
        }
        if (ny >= y) continue;
        const y0 = Math.max(ny, BASE_Y), y1 = y;
        cubeBot = y0; // [v26 world]
        const lo = cubeF ? CUBE_LO : SOIL_LO, hi = cubeF ? CUBE_HI : SOIL_HI; // [v26 world] cube walls: shaded per block in the shader
        let A, B, C, D;
        if (dx === 1) { A = [x + 1, y0, z + 1]; B = [x + 1, y0, z]; C = [x + 1, y1, z]; D = [x + 1, y1, z + 1]; }
        else if (dx === -1) { A = [x, y0, z]; B = [x, y0, z + 1]; C = [x, y1, z + 1]; D = [x, y1, z]; }
        else if (dz === 1) { A = [x, y0, z + 1]; B = [x + 1, y0, z + 1]; C = [x + 1, y1, z + 1]; D = [x, y1, z + 1]; }
        else { A = [x + 1, y0, z]; B = [x, y0, z]; C = [x, y1, z]; D = [x + 1, y1, z]; }
        quad(A, B, C, D, n, [lo, lo, hi, hi], rocky ? 1 : 0);
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute('aCube', new THREE.Float32BufferAttribute(cub, 3)); // [v26 world]
  g.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- water

const waterVert = /* glsl */ `
uniform sampler2D uSim;
uniform vec4 uSimRect;
varying vec3 vWPos;
varying vec3 vSimV;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 suv = (wp.xz - uSimRect.xy) / uSimRect.zw;
  vec3 s = texture2D(uSim, suv).rgb;
  wp.y += (s.r - 0.5) * 0.11;
  vSimV = s;
  vWPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const waterFrag = /* glsl */ `
uniform float uTime;
uniform sampler2D uShore;
uniform sampler2D uSim;
uniform vec4 uSimRect;
uniform vec2 uGridSize;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uGlint;
uniform vec3 uSkyTint;
uniform vec3 uSunDir;
uniform vec3 uViewDir;
uniform float uNight;
uniform float uAurora;
varying vec3 vWPos;
varying vec3 vSimV;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec2 q = floor(vWPos.xz * 24.0) / 24.0 + 1.0 / 48.0;   // pixel-snapped
  vec2 suv = (q - uSimRect.xy) / uSimRect.zw;
  vec3 s = texture2D(uSim, suv).rgb - 0.5;
  // small procedural capillary waves on top of the simulation
  float t = uTime;
  vec2 cap = vec2(sin(q.x * 3.7 + q.y * 1.3 + t * 1.6) + sin(q.y * 4.3 - t * 1.2),
                  cos(q.y * 3.1 - q.x * 1.7 + t * 1.3) + cos(q.x * 5.1 + t * 0.9)) * 0.01;
  vec2 slope = s.gb * 1.9 + cap;
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
  // refraction: wobble the shore/depth lookup with the surface slope
  vec2 rq = q + slope * 0.35;
  float shore = texture2D(uShore, rq / uGridSize).r; // 0 at land, 1 deep
  vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 1.0, shore));
  float drift = sin(q.x * 0.21 + t * 0.05) * sin(q.y * 0.17 - t * 0.04);
  col = mix(col, col * vec3(0.9, 0.96, 1.1), 0.5 + 0.5 * drift);
  // sky reflection on slopes facing away (fresnel-ish), quantised in bands
  float base = max(uViewDir.y, 0.2);
  float fres = clamp((base - max(dot(N, uViewDir), 0.0)) * 5.0, -1.0, 1.0);
  col = mix(col, uSkyTint * 1.1, 0.1 + clamp(floor(fres * 3.0) / 3.0, 0.0, 1.0) * 0.35);
  col *= 1.0 - clamp(floor(-fres * 3.0) / 3.0, 0.0, 1.0) * 0.12;
  // crest / trough shading
  float hh = s.r;
  col *= 1.0 + clamp(floor(hh * 26.0) / 26.0, -0.2, 0.25) * 1.3;
  // sun glints (pixel-crisp)
  vec3 H = normalize(uSunDir + uViewDir);
  float spec = pow(max(dot(N, H), 0.0), 90.0);
  col += step(0.45, spec) * uGlint * (0.55 - uNight * 0.3) + step(0.12, spec) * uGlint * 0.08;
  // sparkles
  vec2 cell = floor(vWPos.xz * 24.0);
  float sp = h21(cell + floor(t * 1.5));
  col += step(0.9988, sp) * (0.6 + 0.4 * sin(t * 9.0 + sp * 40.0)) * uGlint * 0.5;
  // foam at the shore and on steep crests
  float foamN = h21(cell * 0.5 + floor(t * 2.0) * 0.37);
  float foamEdge = 0.05 + 0.035 * sin(t * 2.0 + q.x * 3.0 + q.y * 2.0) + max(0.0, hh) * 0.6;
  float foam = step(shore, foamEdge) * step(0.45, foamN);
  foam = max(foam, step(0.1, hh) * step(0.6, foamN) * (1.0 - smoothstep(0.3, 0.9, shore)));
  col = mix(col, uFoam, foam * 0.7);
  // aurora reflection at night
  float au = uAurora * (0.5 + 0.5 * sin(q.x * 0.35 + t * 0.3 + sin(q.y * 0.2) * 2.0));
  col += vec3(0.05, 0.35, 0.22) * au * 0.35;
  float alpha = mix(0.4, 0.7, smoothstep(0.1, 1.0, shore));
  alpha = max(alpha, foam * 0.85);
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

// Subdivided per-tile quads so the surface can be displaced by the sim.
export function buildWaterGeometry(grid, sub = 3) {
  const { w, h } = grid;
  const pos = [], idx = [];
  let vi = 0;
  const step = 1 / sub;
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      if (grid.kind[z * w + x] !== KIND.WATER) continue;
      for (let j = 0; j <= sub; j++)
        for (let i = 0; i <= sub; i++) pos.push(x + i * step, WATER_Y, z + j * step);
      for (let j = 0; j < sub; j++)
        for (let i = 0; i < sub; i++) {
          const a = vi + j * (sub + 1) + i;
          idx.push(a, a + sub + 1, a + sub + 2, a, a + sub + 2, a + 1);
        }
      vi += (sub + 1) * (sub + 1);
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
