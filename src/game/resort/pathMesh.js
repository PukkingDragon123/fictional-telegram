// [v26 resort] How paths look: a thin lit overlay over the terrain for the ground
// paths (dirt, gravel, stone slabs) and a voxel boardwalk over the water.
//
// The overlay copies the terrain shader's trick (src/world/terrain.js): every
// pixel looks its tile up through a jittered, texel-snapped offset, so path edges
// come out as the same ragged, dithered pixel borders the trail and the grass
// have, and paths auto-join with each other and with the mountain trail. A darker
// two-texel rim along the edge reads as packed earth / a stone curb. Dirt samples
// the terrain atlas 'trail' tile itself; gravel and slabs come from pathArt.js.
import * as THREE from 'three';
import { KIND, WATER_Y } from '../../world/grid.js';
import { terrainAtlasUniforms, SURF } from '../../world/terrain.js';
import { VoxelModel, voxelMaterial } from '../../core/voxel.js';
import { pixelTexture } from '../../core/spriteBatch.js';
import { buildPathAtlas } from './pathArt.js';

export const DECK_Y = WATER_Y + 0.17; // boardwalk deck height (bears walk on it)
const LIFT = 0.012;

// one boardwalk tile (fine voxels, local 0..1 tile units): alongX = walking direction,
// open = edges facing water (1 -x, 2 +x, 4 -z, 8 +z), v = plank colour shift
const BOARD_CACHE = new Map();
function boardTile(alongX, open, v) {
  const key = `${alongX ? 1 : 0}:${open}:${v}`;
  let geo = BOARD_CACHE.get(key);
  if (geo) return geo;
  const vm = new VoxelModel();
  const S = 20;
  const PL = [0xc28a4c, 0xd09a5a, 0xb47c42, 0xdcaa6a];
  const base = Math.round(WATER_Y / 0.05), yTop = base + Math.round((DECK_Y - WATER_Y) / 0.05);
  for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) {
    const along = alongX ? a : b;
    if (along % 4 === 3) continue; // gaps between planks
    const plank = Math.floor(along / 4);
    vm.set(a, yTop, b, PL[(plank * 3 + v) % PL.length]);
    vm.set(a, yTop - 1, b, 0x8a5a32);
  }
  for (let a = 0; a < S; a++) for (const b of [2, S - 3]) { if (alongX) vm.set(a, yTop - 2, b, 0x6b4220); else vm.set(b, yTop - 2, a, 0x6b4220); }
  for (const [px, pz] of [[1, 1], [S - 2, 1], [1, S - 2], [S - 2, S - 2]]) for (let y = base - 14; y <= yTop - 1; y++) vm.set(px, y, pz, y < base ? 0x4a2e18 : 0x6b4220);
  const edges = [[1, 0, -1], [2, S - 1, -1], [4, -1, 0], [8, -1, S - 1]];
  for (const [bit, ex, ez] of edges) {
    if (!(open & bit)) continue;
    for (let k = 0; k < S; k++) {
      const px = ex >= 0 ? ex : k, pz = ez >= 0 ? ez : k;
      if (k === 1 || k === S - 2) for (let y = yTop + 1; y <= yTop + 10; y++) vm.set(px, y, pz, 0x6b4220);
      vm.set(px, yTop + 9 - Math.round(Math.sin((k / (S - 1)) * Math.PI) * 2), pz, 0xd8c090);
    }
  }
  geo = vm.build({ scale: 0.05 });
  BOARD_CACHE.set(key, geo);
  return geo;
}

// concatenate indexed geometries that share attribute layouts (position, normal, color)
function mergeGeos(list) {
  const names = Object.keys(list[0].attributes);
  const out = new THREE.BufferGeometry();
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  for (const n of names) {
    const sz = list[0].attributes[n].itemSize;
    const arr = new Float32Array(nv * sz);
    let o = 0;
    for (const g of list) { arr.set(g.attributes[n].array, o); o += g.attributes[n].array.length; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, sz));
  }
  const idx = new Uint32Array(ni);
  let o = 0, base = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    if (g.index) { const a = g.index.array; for (let k = 0; k < a.length; k++) idx[o + k] = a[k] + base; o += a.length; }
    else { for (let k = 0; k < c; k++) idx[o + k] = base + k; o += c; }
    base += c;
  }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

const GLSL_NOISE = /* glsl */ `
float ph21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float pvn2(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ph21(i), ph21(i + vec2(1.0, 0.0)), f.x), mix(ph21(i + vec2(0.0, 1.0)), ph21(i + vec2(1.0, 1.0)), f.x), f.y); }
`;

export class PathLayer {
  constructor(game, paths) {
    this.game = game;
    this.paths = paths;
    const g = game.grid;
    this.w = g.w; this.h = g.h;
    // path type per tile (R = type * 40), read by the overlay shader
    this.data = new Uint8Array(g.w * g.h * 4);
    this.tex = new THREE.DataTexture(this.data, g.w, g.h, THREE.RGBAFormat);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter;
    this.tex.needsUpdate = true;
    this.mat = this.makeMaterial();
    this.ground = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.ground.receiveShadow = true;
    this.ground.renderOrder = 1;
    this.ground.frustumCulled = false;
    this.ground.name = 'paths';
    this.board = new THREE.Mesh(new THREE.BufferGeometry(), voxelMaterial());
    this.board.castShadow = true; this.board.receiveShadow = true;
    this.board.name = 'boardwalk';
    game.scene.add(this.ground, this.board);
  }

  makeMaterial() {
    let atlasTex = null;
    try { atlasTex = pixelTexture(buildPathAtlas().canvas); } catch { atlasTex = null; }
    const U = { uPathTex: { value: this.tex }, uPathAtlas: { value: atlasTex }, uGrid: { value: new THREE.Vector2(this.w, this.h) }, ...terrainAtlasUniforms() };
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvPW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vPW;
uniform sampler2D uPathTex;
uniform sampler2D uPathAtlas;
uniform sampler2D uAtlas;
uniform vec4 uRects[10];
uniform vec2 uGrid;
${GLSL_NOISE}
float pathAt(vec2 c) { return floor(texture2D(uPathTex, (floor(c) + 0.5) / uGrid).r * 255.0 / 40.0 + 0.5); }
vec2 snapT(vec2 p) { vec2 t = fract(p / 2.0); return (floor(t * 48.0) + 0.5) / 48.0; }
`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 p = vPW.xz;
  vec2 tp = floor(p * 24.0) / 24.0;
  vec2 j = vec2(ph21(tp) - 0.5, ph21(tp + 7.3) - 0.5) * 0.28 + (vec2(pvn2(p * 1.9), pvn2(p * 1.9 + 4.1)) - 0.5) * 0.7;
  float t = pathAt(p + j);
  if (t < 0.5 || t > 3.5) discard;
  // two-texel rim where the path meets the grass
  float d = 2.0 / 24.0;
  float rim = 0.0;
  if (pathAt(p + j + vec2(d, 0.0)) < 0.5 || pathAt(p + j - vec2(d, 0.0)) < 0.5 || pathAt(p + j + vec2(0.0, d)) < 0.5 || pathAt(p + j - vec2(0.0, d)) < 0.5) rim = 1.0;
  vec2 st = snapT(p);
  vec3 tex;
  if (t < 1.5) { vec4 r = uRects[${SURF.TRAIL}]; tex = texture2D(uAtlas, r.xy + st * r.zw).rgb; }
  else tex = texture2D(uPathAtlas, vec2((t - 2.0 + st.x) / 2.0, st.y)).rgb;
  float k = t < 1.5 ? 0.78 : t < 2.5 ? 0.74 : 0.62;
  diffuseColor.rgb = tex * 1.12 * mix(1.0, k, rim);
}`);
    };
    mat.customProgramCacheKey = () => 'resort-paths';
    return mat;
  }

  // corner height of tile (x, z) at corner (cx, cz) (cx in {x, x+1})
  cornerY(x, z, cx, cz) {
    const g = this.game.grid;
    const i = z * g.w + x;
    if (g.terraSlope?.[i] && g.slopeH) return g.slopeH[cz * (g.w + 1) + cx];
    if (g.slopeH && g.isSlope?.(x, z) && g.height[i] > 0.01) return g.slopeH[cz * (g.w + 1) + cx];
    return g.height[i];
  }

  rebuild() {
    const g = this.game.grid, P = this.paths;
    const T = P.type;
    // shader data
    for (let i = 0; i < T.length; i++) this.data[i * 4] = T[i] * 40;
    this.tex.needsUpdate = true;
    // overlay quads: every ground path tile + its 8 neighbours (the ragged edge spills out)
    const want = new Uint8Array(g.w * g.h);
    for (let i = 0; i < T.length; i++) {
      if (!T[i] || T[i] === 4) continue;
      const x = i % g.w, z = (i / g.w) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, nz = z + dz;
        if (!g.inb(nx, nz)) continue;
        const ni = nz * g.w + nx;
        if (g.kind[ni] === KIND.WATER) continue;
        want[ni] = 1;
      }
    }
    const pos = [], nor = [], idx = [];
    let v = 0;
    for (let i = 0; i < want.length; i++) {
      if (!want[i]) continue;
      const x = i % g.w, z = (i / g.w) | 0;
      const ys = [this.cornerY(x, z, x, z), this.cornerY(x, z, x + 1, z), this.cornerY(x, z, x + 1, z + 1), this.cornerY(x, z, x, z + 1)];
      pos.push(x, ys[0] + LIFT, z, x + 1, ys[1] + LIFT, z, x + 1, ys[2] + LIFT, z + 1, x, ys[3] + LIFT, z + 1);
      for (let k = 0; k < 4; k++) nor.push(0, 1, 0);
      idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
      v += 4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setIndex(idx);
    if (v) geo.computeVertexNormals();
    this.ground.geometry.dispose();
    this.ground.geometry = geo;
    this.ground.visible = v > 0;
    this.rebuildBoardwalk();
  }

  // voxel boardwalk: planks across the walking direction, posts into the pond,
  // a rope rail along edges that face open water. One small voxel model per tile
  // kind (direction + open edges), cached, translated and merged into one mesh.
  rebuildBoardwalk() {
    const g = this.game.grid, T = this.paths.type;
    const isB = (x, z) => g.inb(x, z) && T[z * g.w + x] === 4;
    const solid = (x, z) => g.inb(x, z) && (isB(x, z) || g.kind[z * g.w + x] !== KIND.WATER);
    const geos = [];
    for (let z = 0; z < g.h; z++) for (let x = 0; x < g.w; x++) {
      if (!isB(x, z)) continue;
      const ew = (solid(x - 1, z) ? 1 : 0) + (solid(x + 1, z) ? 1 : 0);
      const ns = (solid(x, z - 1) ? 1 : 0) + (solid(x, z + 1) ? 1 : 0);
      const alongX = ew >= ns;
      const open = (solid(x - 1, z) ? 0 : 1) | (solid(x + 1, z) ? 0 : 2) | (solid(x, z - 1) ? 0 : 4) | (solid(x, z + 1) ? 0 : 8);
      const geo = boardTile(alongX, open, (x * 7 + z * 3) % 4).clone();
      geo.translate(x, 0, z);
      geos.push(geo);
    }
    this.board.geometry.dispose();
    this.board.geometry = geos.length ? mergeGeos(geos) : new THREE.BufferGeometry();
    for (const q of geos) q.dispose();
    this.board.visible = geos.length > 0;
  }

  dispose() {
    this.game.scene.remove(this.ground, this.board);
    this.ground.geometry.dispose(); this.board.geometry.dispose();
    this.tex.dispose(); this.mat.dispose();
  }
}
