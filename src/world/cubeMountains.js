// [v26 world] The valley ranges round the map, built from true cubes. The ring
// is sampled on square cells whose size grows with the distance from the map
// (1 tile near it, 2, then 4 out on the far ranges); every cell is a column of
// equal cubes (0.5 / 1 / 2 units: one block size per band, so blocks are always
// cubes) - flat tops, walls a whole number of blocks tall, each face with its
// own block of pixel texture (no stretching, no smearing).
//
// The ranges on the camera's side used to sink by squashing their height
// (which smeared the walls). Now they are cut: every column on that side is
// capped at a height that grows with the distance from the map, blocks above
// the cap simply aren't there (whole blocks, so it stays a block world), and
// the cut tops show dark rock. It follows the camera as you rotate.
import * as THREE from 'three';
import { fbm2, hash2, clamp } from '../core/rng.js';
import { WATER_Y } from './grid.js';
import { STONE, STONE_GLSL, stoneUniforms } from '../art/stoneArt.js';
import { terrainAtlasUniforms } from './terrain.js';
import { HAZE_PARS } from './outerRing.js';
import { patchCutawayMaterial } from './cutaway.js';

const E = 100;
const CHUNK = 36;
const chunkKey = (x, z) => Math.floor((x + 400) / CHUNK) * 1000 + Math.floor((z + 400) / CHUNK);
const B1 = 26, B2 = 58; // band edges (distance from the map, tiles)

const CAP_GLSL = /* glsl */ `
// the camera-side cut: columns there are capped (whole blocks)
// everything on the camera's side of the map is cut flat to one block above the
// ground (a clean forest-floor plain, real top faces); the sides keep their ranges,
// ending in a clean block cliff where the cut begins
float capAt(vec2 c, float bs) {
  vec2 cl = clamp(c, uRect.xy, uRect.zw);
  float d = length(c - cl);
  if (d < 0.5) return 999.0;
  vec2 outDir = (c - cl) / d;
  if (dot(outDir, uRingCam) < 0.42) return 999.0;
  return bs;
}
`;

export function buildCubeGround(ring) {
  const { W, H } = ring;
  const NX = W + 2 * E, NZ = H + 2 * E;
  const fine = new Float32Array(NX * NZ).fill(NaN);
  const top = new Uint8Array(NX * NZ); // surface id (atlas < 20, stone 20+)
  const bsz = new Float32Array(NX * NZ); // block size of the cell owning this unit
  const cellC = new Float32Array(NX * NZ * 2); // owning cell's centre
  const fi = (x, z) => (z + E) * NX + (x + E);
  ring.fine = fine;
  ring.fineBs = bsz;
  const S = { GRASS: 0, AUTUMN: 1, DIRT: 2, POND: 4, SNOW: 6, FOREST: 8 };
  const ST = (v) => 20 + v;
  const rockOf = (x, z) => { const m = fbm2(x * 0.045, z * 0.045, 741); return m > 0.58 ? STONE.SLATE : m < 0.4 ? STONE.CRACKED : STONE.GRANITE; };
  const topOf = (x, z, y, wet) => {
    if (wet) return S.POND;
    const r = hash2(Math.floor(x * 2), Math.floor(z * 2), 711);
    const n = fbm2(x * 0.09, z * 0.09, 717);
    const snowLine = 31 + (n - 0.5) * 8 - (z < 0 ? 5 : 0);
    const stoneLine = 10 + (n - 0.5) * 6;
    if (y > snowLine) return S.SNOW;
    if (y > snowLine - 7) return r < 0.55 ? ST(STONE.SNOWROCK) : ST(STONE.GRANITE);
    if (y > stoneLine) return y < stoneLine + 2.5 ? ST(fbm2(x * 0.2, z * 0.2, 733) > 0.5 ? STONE.SCREE : STONE.MOSSY) : ST(rockOf(x, z));
    if (ring.clearing(x, z)) return S.GRASS;
    if (fbm2(x * 0.05, z * 0.05, 91) > 0.62 && r < 0.5) return S.AUTUMN;
    return S.FOREST;
  };
  // ---- sample every cell (square, aligned to its size)
  const cells = [];
  for (let z = -E; z < H + E; z++)
    for (let x = -E; x < W + E; x++) {
      if (x >= 0 && x < W && z >= 0 && z < H) continue;
      if (!Number.isNaN(fine[fi(x, z)])) continue;
      const d0 = ring.dist(x + 0.5, z + 0.5);
      const cs = d0 < B1 ? 1 : d0 < B2 ? 2 : 4;
      const x0 = Math.floor((x + E) / cs) * cs - E, z0 = Math.floor((z + E) / cs) * cs - E;
      const cx = x0 + cs / 2, cz = z0 + cs / 2;
      const s = ring.sample(cx, cz);
      const bs = cs === 1 ? 0.5 : cs === 2 ? 1 : 2;
      let y = s.water ? WATER_Y - 0.05 : Math.max(0, Math.round(s.y / bs) * bs);
      // the first row by the map: never below the map's own edge there (no crack)
      const dd = ring.dist(cx, cz);
      if (!s.water && dd < 1.01) y = Math.max(y, Math.ceil(ring.edgeH(cx, cz) / bs - 0.02) * bs);
      const id = topOf(cx, cz, y, s.water);
      const c = { x0, z0, cs, bs, y, id, cx, cz, wet: s.water };
      cells.push(c);
      for (let zz = z0; zz < z0 + cs; zz++)
        for (let xx = x0; xx < x0 + cs; xx++) {
          if (xx < -E || zz < -E || xx >= W + E || zz >= H + E) continue;
          if (xx >= 0 && xx < W && zz >= 0 && zz < H) continue;
          const k = fi(xx, zz);
          fine[k] = y; top[k] = id; bsz[k] = bs; cellC[k * 2] = cx; cellC[k * 2 + 1] = cz;
        }
    }
  ring.heightAt = (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z);
    if (ix >= 0 && ix < W && iz >= 0 && iz < H) return 0;
    if (ix < -E || iz < -E || ix >= W + E || iz >= H + E) return 0;
    const v = fine[fi(ix, iz)];
    return Number.isNaN(v) ? 0 : Math.max(0, v);
  };
  // the map side of a unit edge: the map's edge height there
  const mapH = (x, z) => Math.max(0, ring.edgeH(x + 0.5, z + 0.5));
  // ---- geometry
  const chunks = new Map();
  const partOf = (x, z) => { const k = chunkKey(x, z); let c = chunks.get(k); if (!c) chunks.set(k, (c = { pos: [], nor: [], col: [], surf: [], blk: [], nb: [], idx: [], n: 0 })); return c; };
  const quad = (P, v4, nrm, rgb, topId, wallId, bs, topY, cS, cN, lo, hi) => {
    const v = P.n;
    for (let k = 0; k < 4; k++) {
      const q = v4[k];
      P.pos.push(q[0], q[1], q[2]); P.nor.push(nrm[0], nrm[1], nrm[2]); P.col.push(rgb[k], rgb[k], rgb[k]);
      P.surf.push(topId, wallId); P.blk.push(bs, topY, cS[0], cS[1]); P.nb.push(cN[0], cN[1], lo, hi);
    }
    P.idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    P.n += 4;
  };
  const wallStone = (x, z, lo) => {
    const hb = hash2(Math.floor(lo / 3), 0, 77);
    const rk = rockOf(x, z);
    if (lo > 26 && hb < 0.5) return ST(STONE.SNOWROCK);
    if (lo < 6 && hb < 0.4) return ST(STONE.MOSSY);
    if (hb > 0.82) return ST(STONE.DARK);
    if (hb > 0.62) return ST(rk === STONE.SLATE ? STONE.GRANITE : STONE.SLATE);
    return ST(rk);
  };
  for (const c of cells) {
    const { x0, z0, cs, bs, y, id, cx, cz } = c;
    const P = partOf(cx, cz);
    const x1 = x0 + cs, z1 = z0 + cs;
    const C = [cx, cz];
    // top (fake AO: corners next to taller neighbours darker)
    const nbAt = (x, z) => {
      if (x >= 0 && x < W && z >= 0 && z < H) return mapH(x, z);
      if (x < -E || z < -E || x >= W + E || z >= H + E) return -4;
      return fine[fi(x, z)];
    };
    const ao = (sx, sz) => { const up = (nbAt(sx < 0 ? x0 - 1 : x1, sz < 0 ? z0 : z1 - 1) > y + 0.3) + (nbAt(sx < 0 ? x0 : x1 - 1, sz < 0 ? z0 - 1 : z1) > y + 0.3); return 1 - up * 0.14; };
    quad(P, [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]], [0, 1, 0], [ao(-1, -1), ao(-1, 1), ao(1, 1), ao(1, -1)], id, wallStone(cx, cz, y - bs), bs, y, C, C, y, y);
    // walls: per unit edge towards each lower neighbour, merged along runs of equal height
    const sides = [
      { n: [1, 0, 0], len: cs, at: (k) => [x1, z0 + k], face: (k, lo, hi, L) => [[x1, lo, z0 + k + L], [x1, lo, z0 + k], [x1, hi, z0 + k], [x1, hi, z0 + k + L]] },
      { n: [-1, 0, 0], len: cs, at: (k) => [x0 - 1, z0 + k], face: (k, lo, hi, L) => [[x0, lo, z0 + k], [x0, lo, z0 + k + L], [x0, hi, z0 + k + L], [x0, hi, z0 + k]] },
      { n: [0, 0, 1], len: cs, at: (k) => [x0 + k, z1], face: (k, lo, hi, L) => [[x0 + k, lo, z1], [x0 + k + L, lo, z1], [x0 + k + L, hi, z1], [x0 + k, hi, z1]] },
      { n: [0, 0, -1], len: cs, at: (k) => [x0 + k, z0 - 1], face: (k, lo, hi, L) => [[x0 + k + L, lo, z0], [x0 + k, lo, z0], [x0 + k, hi, z0], [x0 + k + L, hi, z0]] },
    ];
    for (const sd of sides) {
      let k = 0;
      while (k < sd.len) {
        const [nx, nz] = sd.at(k);
        const inMap = nx >= 0 && nx < W && nz >= 0 && nz < H;
        let ny = nbAt(nx, nz);
        if (inMap) ny = -4; // a skirt down under the map's edge: no crack from any angle
        if (Number.isNaN(ny)) ny = -4;
        if (ny >= y - 0.01) { k++; continue; }
        // the neighbour cell's centre (its cap applies to the wall's foot)
        const nk = !inMap && nx >= -E && nz >= -E && nx < W + E && nz < H + E ? fi(nx, nz) : -1;
        const cN = nk >= 0 ? [cellC[nk * 2], cellC[nk * 2 + 1]] : [nx + 0.5, nz + 0.5];
        let L = 1;
        while (k + L < sd.len) {
          const [mx, mz] = sd.at(k + L);
          const inMap2 = mx >= 0 && mx < W && mz >= 0 && mz < H;
          let my = inMap2 ? -4 : nbAt(mx, mz);
          if (Number.isNaN(my)) my = -4;
          const mk = !inMap2 && mx >= -E && mz >= -E && mx < W + E && mz < H + E ? fi(mx, mz) : -1;
          const sameCell = mk >= 0 && nk >= 0 ? cellC[mk * 2] === cN[0] && cellC[mk * 2 + 1] === cN[1] : mk === nk;
          if (Math.abs(my - ny) > 0.01 || !sameCell) break;
          L++;
        }
        const lo = Math.max(ny, -4);
        const wid = wallStone(cx + k, cz, lo);
        const sh = sd.n[0] !== 0 ? 0.86 : 0.76;
        quad(P, sd.face(k, lo, y, L), sd.n, [sh, sh, sh, sh], id, wid, bs, y, C, cN, lo, y);
        k += L;
      }
    }
  }
  // ---- material: the block shader + haze + the camera-side cap + the see-through
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const U = ring.uniforms;
  const TA = terrainAtlasUniforms();
  const SU = stoneUniforms();
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, TA, SU);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
${HAZE_PARS}
${CAP_GLSL}
attribute vec2 aSurf;
attribute vec4 aBlk; // block size, column top, cell centre
attribute vec4 aNb;  // neighbour cell centre (wall foot), lo, hi
varying vec2 vSurf;
varying vec4 vBlk;
varying float vRingHaze;
varying vec3 vRPos;
varying vec3 vRNor;
varying float vCutTop;
varying float vCapK;`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvRNor = objectNormal;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float bs = aBlk.x;
  float capS = capAt(aBlk.zw, bs), capN = capAt(aNb.xy, bs);
  float lo = aNb.z, hi = aNb.w;
  float bot = min(lo, capN);
  float tp = max(bot, min(hi, capS));
  bool isTop = abs(position.y - hi) < 0.001;
  transformed.y = isTop ? tp : bot;
  vCutTop = (abs(objectNormal.y) > 0.5 && hi - tp > 0.01) ? 1.0 : 0.0;
  vCapK = capS < 900.0 ? 1.0 : 0.0;
  vRPos = transformed;
  vSurf = aSurf;
  vBlk = vec4(bs, min(aBlk.y, capS), 0.0, 0.0);
}`)
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvRingHaze = ringHaze((modelMatrix * vec4(transformed, 1.0)).xyz);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uHaze;
uniform sampler2D uAtlas;
uniform vec4 uRects[10];
varying vec2 vSurf;
varying vec4 vBlk;
varying float vRingHaze;
varying vec3 vRPos;
varying vec3 vRNor;
varying float vCutTop;
varying float vCapK;
${STONE_GLSL}
float rbH(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
vec3 ringWin(int id, vec2 win, vec2 lu) {
  vec2 t = (win * 12.0 + floor(lu * 12.0) + 0.5) / 48.0;
  if (id >= 20) return texture2D(uStone, vec2((float(id - 20) + t.x) / 7.0, t.y)).rgb * 1.1;
  vec4 r = uRects[id];
  return texture2D(uAtlas, r.xy + t * r.zw).rgb;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float bs = vBlk.x;
  int topId = int(vSurf.x + 0.5), wallId = int(vSurf.y + 0.5);
  vec3 an = abs(vRNor);
  vec2 lu, bp; vec3 c;
  if (an.y > 0.5) {
    bp = floor(vRPos.xz / bs + 0.001); lu = fract(vRPos.xz / bs + 0.001);
    float hb = rbH(bp + floor(vRPos.y) * 0.31);
    vec2 win = floor(vec2(hb, rbH(bp + 1.3)) * 4.0);
    c = ringWin(vCutTop > 0.5 ? 8 : topId, win, lu); // the cut: plain forest floor
    c *= 0.93 + hb * 0.14;
  } else {
    float u = (an.x > 0.5 ? vRPos.z : vRPos.x) / bs, v = vRPos.y / bs;
    bp = vec2(floor(u + 0.001), floor(v + 0.001)); lu = vec2(fract(u + 0.001), fract(v + 0.001));
    float hb = rbH(bp);
    vec2 win = floor(vec2(hb, rbH(bp + 5.9)) * 4.0);
    float depthB = (vBlk.y - vRPos.y) / bs;
    bool soil = (topId == 8 || topId == 0 || topId == 1) && depthB < 1.0;
    c = soil ? ringWin(2, win, lu) * 0.95 : ringWin(topId == 6 && depthB < 1.0 ? 25 : wallId, win, lu);
    float lipT = floor((1.0 - lu.y) * 12.0);
    if (depthB < 1.0 && lipT < 2.0 + step(0.5, rbH(vec2(floor(lu.x * 12.0), bp.x)))) {
      if (topId == 6) c = vec3(0.93, 0.96, 1.0);
      else if (soil) c = ringWin(topId, win, vec2(lu.x, 0.95)) * 0.95;
    }
    c *= 0.9 + hb * 0.14;
  }
  float px = 1.0 / 12.0;
  float ly = an.y > 0.5 ? 1.0 - lu.y : lu.y;
  if (lu.x < px || ly > 1.0 - px) c *= 1.12;
  if (lu.x > 1.0 - px || ly < px) c *= 0.74;
  diffuseColor.rgb *= c * 1.08;
}`)
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, uHaze, vRingHaze * (1.0 - vCapK));\n#include <opaque_fragment>'); // the cut foreground: solid, no haze slivers
  };
  mat.customProgramCacheKey = () => 'outerRingCubes3';
  patchCutawayMaterial(mat, 'ringCubes', 1.4);
  ring.ground = [];
  for (const P of chunks.values()) {
    if (!P.n) continue;
    const geo = new THREE.BufferGeometry();
    geo.setIndex(P.n > 65535 ? new THREE.Uint32BufferAttribute(P.idx, 1) : new THREE.Uint16BufferAttribute(P.idx, 1));
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(P.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(P.col, 3));
    geo.setAttribute('aSurf', new THREE.Float32BufferAttribute(P.surf, 2));
    geo.setAttribute('aBlk', new THREE.Float32BufferAttribute(P.blk, 4));
    geo.setAttribute('aNb', new THREE.Float32BufferAttribute(P.nb, 4));
    geo.computeBoundingSphere();
    geo.boundingSphere.radius += 4;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'outerRingGround';
    ring.ground.push(mesh);
    ring.group.add(mesh);
  }
}

// sprites on the ranges follow the cap (and fade where the ground was cut away)
export const SPRITE_CAP = /* glsl */ `
${CAP_GLSL}
`;
export { clamp };
