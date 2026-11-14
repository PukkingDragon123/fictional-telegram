// [v33 title] The 3D title logo: "THE BEAR / MUST EAT" built out of the valley itself.
//
// A floating island of meadow cut out of the ground: chunky voxel letters (the game font's own
// glyphs, GOOFY_HI, extruded) that are little cliffs of land, grass and a ragged turf lip on top,
// a band of dirt, then rock strata in the terrain's own colours (terrainArt grass / dirt / rock /
// moss palettes), moss at the foot. "THE BEAR" stands on a raised back terrace, "MUST EAT" on the
// front terrace at the back shore of a little pool. A waterfall drops from the upper terrace
// between the two words, two more spill from the tops of S and E into the pool, and the pool
// overflows off the island's edge in a long fall that dissolves into the air. Tufts, flowers,
// ferns, cattails, vines and lily pads (voxel plants in the world's colours) sway in the wind and
// rustle when a letter is touched. Fish (the game's fish sprites) leap out of the pool in arcs
// between the letters with splashes (the game's particles).
//
// Drawn by the game's own renderer (Lambert + voxel grain, the ink outline pass, the time of day's
// light), so it belongs to the world. Built once: one mesh per letter (terrain and its plants in
// one geometry, one shared material: 13 draw calls), the island, the pool, the falls and 3 fish.
//
//   const L = buildTitleLogo(game, { voxel: 0.068 });   // world units per voxel
//   scene.add(L.group);                                // origin = the logo's visual centre
//   L.update(dt);                                       // every frame (sway, water, fish, springs)
//   L.intro();  L.hide();                               // rise out of the ground / sink away
//   L.pick(ray) -> letter index or -1                   // THREE.Ray in world space
//   L.hover(i)  L.poke(i)  L.leap()                     // wobble + rustle / a click gag / a fish
//   L.setVoxel(v)  L.fitTilt(rel)  L.dispose()
// Facing: local +Z is the front (towards the viewer), +Y up. L.extent(rel) gives its projected
// size in voxels when seen from `rel` radians above (used to fit it into a screen box).
import * as THREE from 'three';
import { VoxelModel, addGrain } from '../../core/voxel.js';
import { GOOFY_HI, goofyGlyph } from '../../ui/goofyFont.js';
import { fishCanvasFor, FISH_TPU } from '../fishSprites.js';
import { FX } from '../Particles.js';

const S = 0.1; // local units per voxel (the voxel grain shader expects 10 cells per unit)
const DEP = 6; // letter depth (voxels)
const LINES = ['THE BEAR', 'MUST EAT'];
const SPACE = 6;
const TIER = 16; // the back terrace is this many voxels higher
const Z2 = 0, Z1 = -12, ZC = -4; // (ZC: the upper terrace's cliff face, set back so MUST EAT stands clear of it) // back faces of line 2 / line 1 (front faces at +DEP)
const POOL_Y = -0.42; // water surface (voxels)
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- palettes (src/art/terrainArt.js)
const hx = (s) => parseInt(s.slice(1), 16);
const GRASS = ['#5e8b35', '#658f38', '#6c963c', '#739d40', '#7ba444'].map(hx);
const BLADES = ['#557f31', '#6a9a3a', '#86b24a', '#9cc056'].map(hx);
const DIRT = ['#765838', '#7f603e', '#886744', '#916f4a', '#9a7851'].map(hx);
const DIRT_D = hx('#6a4e32');
const ROCK = ['#625a5a', '#6a6262', '#726a68', '#7a716e', '#837a76'].map(hx);
const ROCK_L = hx('#9a908a'), ROCK_D = hx('#524a4c'), CRACK = hx('#4c4446');
const SAND = ['#a2804f', '#b08c5a', '#be9966'].map(hx); // banks (warm, like the shore)
const MOSS = ['#3e5a2e', '#4e6e34', '#62843c'].map(hx);
const FLOWERS = [['#f4f0e0', '#f2d24a'], ['#f2d24a', '#c8861a'], ['#e8a0c0', '#f4f0e0'], ['#f4f0e0', '#e8a0c0'], ['#e05a48', '#f2d24a']].map((p) => p.map(hx));
const CATTAIL = { stalk: hx('#6a8a3a'), leaf: hx('#86a248'), head: hx('#6a4426'), headL: hx('#8a5a34') };
const LILY = { pad: hx('#4e8a38'), padL: hx('#6aa848'), flower: hx('#f4b8d0'), flowerC: hx('#f2d24a') };
const VINE = [hx('#4e7a32'), hx('#62903a'), hx('#7aa848')];
// the letter faces: the old title words' gold (line 1) and orange (line 2), src/ui/TitleWords.js PAL
// carved wood faces, from the game's own wood: THE BEAR in honey wood (the signpost's gold plank,
// src/ui/titleArt.js WOOD.gold), MUST EAT in a richer reddish wood (the plain signpost plank pushed
// towards the red plank / src/ui/frames.js wood). base, grain line, light grain, worn edge, carved groove, knot
const FACE_PAL = [
  { base: hx('#c8963c'), alt: hx('#d4a448'), grain: hx('#96682a'), light: hx('#eec668'), worn: hx('#fbe2a0'), groove: hx('#7a4d24'), knot: hx('#5a3418'), side: hx('#6b4220') },
  { base: hx('#b0562e'), alt: hx('#bc6434'), grain: hx('#843a20'), light: hx('#d8824e'), worn: hx('#f0aa6e'), groove: hx('#5e2616'), knot: hx('#421a10'), side: hx('#55331a') },
];
const INK = hx('#1e0c10');
const WATER = { light: new THREE.Color('#9ae0d8'), mid: new THREE.Color('#4aa6a0'), deep: new THREE.Color('#2a6a8e'), foam: new THREE.Color('#f2fbff'), edge: new THREE.Color('#2f7f9a') };

function h3(x, y, z, s = 0) {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647) + Math.imul(s | 0, 1442695041)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const pick = (a, r) => a[Math.min(a.length - 1, Math.floor(r * a.length))];
function vn(x, s = 0) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return h3(i, 0, 0, s) * (1 - u) + h3(i + 1, 0, 0, s) * u; }

// ---------------------------------------------------------------- layout: glyphs on two terraces
function layoutLetters() {
  const letters = [];
  LINES.forEach((str, li) => {
    const glyphs = [];
    let x = 0, inkR = 0;
    for (const ch of str) {
      if (ch === ' ') { x += SPACE; continue; }
      const rows = goofyGlyph(GOOFY_HI, ch);
      const w = rows[0].length;
      let minU = 99, maxU = -1, maxV = -1, minV = 99;
      rows.forEach((r, v) => { for (let u = 0; u < w; u++) if (r[u] === '#') { minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v); } });
      glyphs.push({ ch, rows, x, minU, maxU, minV, maxV });
      inkR = x + maxU + 1;
      x += w;
    }
    const left = -Math.round(inkR / 2) + li; // centred (line 2 one voxel right, like the board)
    for (const g of glyphs) {
      const vox = [];
      g.rows.forEach((r, v) => { for (let u = 0; u < r.length; u++) if (r[u] === '#') vox.push([left + g.x + u, g.maxV - v]); }); // ink bottom on y = 0
      letters.push({ ch: g.ch, line: li, vox, x0: left + g.x + g.minU, x1: left + g.x + g.maxU, h: g.maxV - g.minV + 1 });
    }
  });
  return letters;
}

// ---------------------------------------------------------------- plants: little voxel cubes that sway
// A plant voxel: [x, y, z, colour, sway (0 = rooted .. rises with height)]. Emitted as cubes with
// shared faces culled; aSway drives the wind in the vertex shader.
const FACE = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], k: 0.92 },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], k: 0.92 },
  { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], k: 1.0 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], k: 0.7 },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], k: 0.96 },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], k: 0.96 },
];
const _c = new THREE.Color();
function plantArrays(list, pivot, letterIdx, flat = null) {
  const key = (x, y, z) => `${x},${y},${z}`;
  const has = new Set(list.map((p) => key(p[0], p[1], p[2])));
  const pos = [], nor = [], col = [], sway = [], idx = [];
  let vi = 0;
  for (const [x, y, z, hex, sw, th, hang] of list) {
    _c.setHex(hex);
    const hgt = th ?? 1; // voxel height (lily pads are thin)
    for (const F of FACE) {
      if (has.has(key(x + F.n[0], y + F.n[1], z + F.n[2]))) continue;
      for (const c of F.c) {
        pos.push((x + c[0] - pivot[0]) * S, (y + c[1] * hgt - pivot[1]) * S, (z + c[2] - pivot[2]) * S);
        nor.push(F.n[0], F.n[1], F.n[2]);
        col.push(_c.r * F.k, _c.g * F.k, _c.b * F.k);
        sway.push(hang ? sw + (1 - c[1]) * 0.7 : th != null && th < 1 ? sw : sw + c[1]);
      }
      idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      vi += 4;
    }
  }
  void flat;
  return { pos, nor, col, sway, idx, n: vi, letter: letterIdx };
}

// one geometry from a VoxelModel geometry (no sway) + plant arrays
function mergeGeo(base, plants, letterIdx) {
  const bp = base.getAttribute('position'), bn = base.getAttribute('normal'), bc = base.getAttribute('color');
  const nb = bp.count, np = plants ? plants.n : 0;
  const pos = new Float32Array((nb + np) * 3), nor = new Float32Array((nb + np) * 3), col = new Float32Array((nb + np) * 3);
  const sway = new Float32Array(nb + np), let1 = new Float32Array(nb + np).fill(letterIdx);
  pos.set(bp.array); nor.set(bn.array); col.set(bc.array);
  if (np) { pos.set(plants.pos, nb * 3); nor.set(plants.nor, nb * 3); col.set(plants.col, nb * 3); sway.set(plants.sway, nb); }
  const bi = base.getIndex().array;
  const idx = new Uint32Array(bi.length + (plants ? plants.idx.length : 0));
  idx.set(bi);
  if (plants) for (let i = 0; i < plants.idx.length; i++) idx[bi.length + i] = plants.idx[i] + nb;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
  g.setAttribute('aLetter', new THREE.BufferAttribute(let1, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  base.dispose();
  return g;
}

// ---------------------------------------------------------------- earth colouring
// the letters' own stone: a light, warm sandstone (the trail / shore tones) so the words read
// against the island's darker cliffs, with thin strata lines
const SANDSTONE = ['#d8c088', '#d1b981', '#cab27a', '#c3ab74'].map(hx);
const SAND_LINE = hx('#a89060'), SAND_HI = hx('#e8d4a0'), SAND_D = hx('#9a8660');
function letterEarth(x, y, z, d, foot) {
  const r = h3(x, y, z, 5);
  if (d === 0) return pick(GRASS, r);
  if (d === 1 && r < 0.18) return BLADES[0]; // a few drips of turf over the edge
  if (d === 1 && r < 0.4) return DIRT[3];
  if (foot === 0 && r < 0.6) return pick(MOSS, h3(x, y, z, 9));
  const line = (y + Math.floor(vn(x * 0.25, 3) * 2)) % 4 === 0;
  if (line) return r < 0.7 ? SAND_LINE : SAND_D;
  if (r > 0.93) return SAND_HI;
  return pick(SANDSTONE, r);
}
// d = depth below the column's top surface, open = which sides are open air
function earth(x, y, z, d, { underside = false, foot = 0, seed = 0 } = {}) {
  const r = h3(x, y, z, seed);
  if (d === 0) return pick(GRASS, r);
  if (d === 1) return r < 0.55 ? pick(GRASS.slice(0, 3), r) : DIRT[4]; // the turf lip
  if (d <= 3 + (h3(x, 0, z, 5) < 0.4 ? 1 : 0)) return r < 0.12 ? DIRT_D : pick(DIRT, r);
  if (underside) return r < 0.5 ? ROCK_D : CRACK;
  if (foot >= 0 && foot <= 1 && r < 0.55) return pick(MOSS, h3(x, y, z, 9));
  // rock strata: broad wavy bands of slate, warm dirt-rock and granite
  const band = Math.floor((y + vn(x * 0.18, 7) * 2.2 + vn(z * 0.3, 8)) / 3) & 3;
  if (r > 0.94) return ROCK_L;
  if (r < 0.05) return CRACK;
  if (band === 0) return pick(ROCK.slice(2), r);
  if (band === 1) return r < 0.5 ? DIRT[0] : DIRT_D;
  if (band === 2) return pick(ROCK.slice(0, 3), r);
  return r < 0.6 ? ROCK[4] : ROCK_L;
}

// colour a solid VoxelModel as land: tops grass, sides strata, a ragged turf lip hanging over
function paintLand(v, keyFn, { seed = 0, baseY = 0, letter = false } = {}) {
  const top = new Map();
  for (const k of v.vox.keys()) {
    const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
    const c = `${x},${z}`;
    if (!top.has(c) || top.get(c) < y) top.set(c, y);
  }
  const out = [];
  for (const k of v.vox.keys()) {
    const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
    // depth below the nearest open air straight above (letters have overhangs: count from there)
    let d = 0;
    while (d < 8 && v.has(x, y + d + 1, z)) d++;
    // the turf hangs a voxel or two over open sides
    const sideOpen = !v.has(x + 1, y, z) || !v.has(x - 1, y, z) || !v.has(x, y, z + 1) || !v.has(x, y, z - 1);
    let dd = d;
    if (d === 2 && sideOpen && h3(x, y, z, seed + 11) < 0.3) dd = 1; // drips of turf
    const underside = !v.has(x, y - 1, z) && y > baseY;
    out.push([x, y, z, letter ? letterEarth(x, y, z, dd, y - baseY) : earth(x, y, z, dd, { underside: underside && d > 2, foot: y - baseY, seed })]);
  }
  for (const [x, y, z, c] of out) v.set(x, y, z, c);
  void keyFn; void top;
}

// ---------------------------------------------------------------- the builder
export function buildTitleLogo(game, { voxel = 0.068, sfx = null } = {}) {
  const P = () => game?.particles;
  const play = (n, o) => { try { if (sfx) sfx(n, o); else game?.audio?.play?.(n, o); } catch { /* optional */ } };
  const group = new THREE.Group();
  group.name = 'TitleLogo3D';
  const inner = new THREE.Group(); // centred under `group`
  group.add(inner);

  // --- one material for all land + plants: Lambert, voxel grain, wind sway + per-letter rustle
  const U = { uTime: { value: 0 }, uWind: { value: 0.5 }, uRustle: { value: new Array(16).fill(0) } };
  const mat = addGrain(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const grainHook = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    grainHook(sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSway;\nattribute float aLetter;\nuniform float uTime;\nuniform float uWind;\nuniform float uRustle[16];')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
if (aSway > 0.0) {
  float rus = uRustle[int(aLetter + 0.5)];
  float ph = position.x * 23.0 + position.z * 17.0;
  float gust = 0.6 + 0.4 * sin(uTime * 0.7 + position.x * 2.0);
  float k = aSway * ${S.toFixed(3)} * (0.33 * uWind * gust + rus * 0.6);
  transformed.x += sin(uTime * (2.2 + rus * 9.0) + ph) * k;
  transformed.z += cos(uTime * (1.7 + rus * 7.0) + ph * 0.7) * k * 0.5;
}`);
  };
  mat.customProgramCacheKey = () => 'tbmeLogo3d';

  const letters = layoutLetters();
  const wordGap = (() => { // x of the space between MUST and EAT (the centre waterfall)
    const l2 = letters.filter((l) => l.line === 1);
    let i = 0, best = -1; // the widest gap between letters: the word space
    for (let k = 1; k < l2.length; k++) { const g = l2[k].x0 - l2[k - 1].x1; if (g > best) { best = g; i = k; } }
    return i > 0 ? Math.round((l2[i - 1].x1 + l2[i].x0) / 2) : 0;
  })();
  const X0 = Math.min(...letters.map((l) => l.x0)) - 8, X1 = Math.max(...letters.map((l) => l.x1)) + 8;
  const ZB = Z1 - 6, ZF = Z2 + DEP + 17; // island back / front edge

  // --- the pool: in front of line 2, from its front faces to near the island's front edge
  const poolZ0 = Z2 + DEP, poolZ1 = ZF - 4;
  const poolX0 = X0 + 3, poolX1 = X1 - 3;
  const inPool = (x, z) => {
    if (z < poolZ0 || z > poolZ1 + Math.round(vn(x * 0.21, 4) * 2) - 1) return false;
    const ex = Math.round(vn(z * 0.5 + 3, 6) * 4);
    return x >= poolX0 + ex && x <= poolX1 - Math.round(vn(z * 0.43, 9) * 4);
  };
  const spillX = Math.round(poolX0 + (poolX1 - poolX0) * 0.68); // the overflow notch
  const inSpill = (x, z) => x >= spillX - 1 && x <= spillX + 2 && z > poolZ1 - 3 && z <= ZF + 1;
  // two narrow falls behind MUST EAT in the widest gaps between its letters (curtains of water behind the words)
  // [readability] no water crosses a letter: falls only between the words and off the island's sides
  const LX0 = Math.min(...letters.map((l) => l.x0)), LX1 = Math.max(...letters.map((l) => l.x1));
  const curtains = [LX0 - 5, LX1 + 5];
  const brooks = [[wordGap - 1, wordGap + 1], ...curtains.map((x) => [x - 1, x + 1])];
  const inBrook = (x, z) => z >= ZC && z < poolZ0 + 1 && brooks.some(([a, b]) => x >= a && x <= b); // runnels from the falls to the pool

  // --- the island
  const iv = new VoxelModel();
  const edgeN = (x, z) => vn(x * 0.23, 1) * 3 + vn(z * 0.31, 2) * 2;
  const plantsIsle = [];
  for (let x = X0 - 3; x <= X1 + 3; x++)
    for (let z = ZB - 3; z <= ZF + 2; z++) {
      // footprint: a rounded rectangle with a ragged edge
      const ex = Math.min(x - X0, X1 - x), ez = Math.min(z - ZB, ZF - z);
      const e = Math.min(ex, ez * 1.6) + edgeN(x, z) - 2.2;
      if (e < 0) continue;
      const back = z < ZC + (h3(x, 0, 0, 7) < 0.3 && Math.abs(x - wordGap) > 4 ? 1 : 0);
      let topY = back ? TIER - 1 : -1;
      if (back && (z < ZB + 2 || ex < 3)) topY -= Math.max(0, 3 - Math.min(z - ZB, ex)) * 2; // round the terrace off
      // the underside: deepest in the middle, roots of rock hanging down
      const depth = 3 + Math.min(e, 8) * 0.9 + vn(x * 0.37, 3) * 3 + (h3(x >> 1, 0, z >> 1, 4) < 0.08 ? 3 : 0);
      const bot = Math.round(-1 - depth);
      for (let y = bot; y <= topY; y++) {
        if (y >= -2 && !back && inPool(x, z) && y > -3) continue; // the basin
        if (y === -1 && !back && (inSpill(x, z) || inBrook(x, z))) continue; // runnels
        iv.set(x, y, z, 1);
      }
    }
  paintLand(iv, null, { seed: 21, baseY: -40 });
  // the upper terrace's cliff face sits in shade behind MUST EAT (so the light letters stand out)
  const dark = (c, k) => (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);
  for (const [k, c] of [...iv.vox]) {
    const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
    if (z >= ZC - 3 && z < ZC + 1 && y >= 0 && y < TIER - 3) iv.set(x, y, z, dark(c, 0.62 + 0.12 * (y / TIER)));
  }
  // banks: sand round the water, the basin floor
  for (const k of [...iv.vox.keys()]) {
    const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
    if (iv.has(x, y + 1, z)) continue;
    const wet = (xx, zz) => inPool(xx, zz) || inSpill(xx, zz) || inBrook(xx, zz);
    if (wet(x, z)) iv.set(x, y, z, pick(SAND, h3(x, y, z, 2)) - 0x0c0c0c);
    else if (y <= -1 && (wet(x + 1, z) || wet(x - 1, z) || wet(x, z + 1) || wet(x, z - 1)) && h3(x, 1, z, 6) < 0.8) iv.set(x, y, z, pick(SAND, h3(x, y, z, 3)));
  }
  // island plants
  const tops = [];
  for (const k of iv.vox.keys()) {
    const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
    if (iv.has(x, y + 1, z)) continue;
    if (y === -1 || y === TIER - 1) tops.push([x, y, z]);
  }
  const occupied = (x, z, line) => letters.some((l) => l.line === line && x >= l.x0 - 1 && x <= l.x1 + 1);
  for (const [x, y, z] of tops) {
    const r = h3(x, y, z, 31);
    const nearWater = inPool(x, z + 1) || inPool(x, z - 1) || inPool(x + 1, z) || inPool(x - 1, z);
    const underLetter = (y === -1 && z >= Z2 && z < Z2 + DEP && occupied(x, z, 1)) || (y === TIER - 1 && z >= Z1 && z < Z1 + DEP && occupied(x, z, 0));
    if (underLetter) continue;
    if (y === TIER - 1 && z >= Z1 + DEP && x > X0 + 12 && x < X1 - 12) continue; // the ledge between the lines: grass only
    // the front terrace stays low in front of the words: short grass only, taller plants at its ends
    const frontOfWords = y === -1 && z > Z2 + DEP && x > X0 + 12 && x < X1 - 12;
    if (frontOfWords && r > 0.12) continue;
    if (frontOfWords) { tuft(plantsIsle, x, y + 1, z, 0.1); continue; }
    const besideWords = x < LX0 - 1 || x > LX1 + 1;
    if (nearWater && r < 0.14 && besideWords) cattail(plantsIsle, x, y + 1, z, h3(x, 0, z, 8));
    else if (r < 0.2) tuft(plantsIsle, x, y + 1, z, h3(x, z, 1, 9));
    else if (r < 0.225) flower(plantsIsle, x, y + 1, z, h3(x, z, 2, 10));
    else if (r < 0.235 && !nearWater) fern(plantsIsle, x, y + 1, z, h3(z, x, 3, 11));
  }
  // vines down the island's front cliff and the terrace cliff
  for (let x = X0; x <= X1; x++) {
    if (h3(x, 0, 0, 41) > 0.12) continue;
    for (const [z0, y0] of [[ZF, -2]]) {
      let z = z0 + 3;
      while (z > z0 - 8 && !iv.has(x, y0, z)) z--;
      if (!iv.has(x, y0, z)) continue;
      vine(plantsIsle, x, y0, z + 1, 4 + Math.floor(h3(x, z, 2, 42) * 7));
    }
  }
  // lily pads on the pool
  for (let i = 0; i < 9; i++) {
    const x = Math.round(poolX0 + 4 + h3(i, 1, 1, 51) * (poolX1 - poolX0 - 8)), z = Math.round(poolZ0 + 2 + h3(i, 2, 2, 52) * (poolZ1 - poolZ0 - 3));
    if (!inPool(x, z) || Math.abs(x - wordGap) < 4) continue;
    lily(plantsIsle, x, z, i);
  }
  const isle = new THREE.Mesh(mergeGeo(iv.build({ pivot: [0, 0, 0], scale: S }), plantArrays(plantsIsle, [0, 0, 0], 15), 15), mat);
  isle.castShadow = false; isle.receiveShadow = true;
  inner.add(isle);

  // --- the letters
  // the springs: both T's of MUST EAT bubble up at the end of their right arm and spill over it,
  // falling free under the arm into the pool (the letter's stroke stays clear)
  for (const l of letters.filter((q) => false && q.line === 1 && q.ch === 'T')) { // [readability] off: no falls over the letters
    const arm = [];
    for (let x = l.x1; x > l.x0; x--) { if (l.vox.some((p) => p[0] === x && p[1] === 0)) break; arm.push(x); }
    if (arm.length < 2) continue;
    l.spring = arm[1]; l.springW = 2;
    l.colTop = Math.max(...l.vox.filter((p) => p[0] >= l.spring && p[0] < l.spring + 2).map((p) => p[1])) + 1;
  }
  const L = letters.map((l, i) => {
    const v = new VoxelModel();
    const zb = l.line === 0 ? Z1 : Z2, yb = l.line === 0 ? TIER : 0;
    for (const [x, y] of l.vox) for (let z = zb; z < zb + DEP; z++) v.set(x, y + yb, z, 1);
    paintLand(v, null, { seed: 100 + i, baseY: yb, letter: true });
    // [readability] the face: the old title board's gold / orange (TitleWords palette), a darker
    // carved rim round the glyph, and an ink outline one voxel behind it; the sides stay earth
    const P2 = FACE_PAL[l.line];
    const on = new Set(l.vox.map(([x, y]) => `${x},${y}`));
    const has2 = (x, y) => on.has(`${x},${y}`);
    const fz = zb + DEP - 1;
    let hmax = 0;
    for (const [, y] of l.vox) hmax = Math.max(hmax, y);
    // grain runs along each stroke: horizontal in bars, vertical in stems (by the longer run here)
    const run = (x, y, dx, dy) => { let n = 0; for (let k = 1; k < 9 && has2(x + dx * k, y + dy * k); k++) n++; return n; };
    const knots = l.vox.filter(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => has2(x + a, y + b) && has2(x + 2 * a, y + 2 * b))).filter((p, k) => h3(p[0], p[1], i, 73) < 0.12).slice(0, 1);
    const seed = i * 3.7;
    for (const [x, y] of l.vox) {
      const horiz = run(x, y, 1, 0) + run(x, y, -1, 0) > run(x, y, 0, 1) + run(x, y, 0, -1);
      const along = horiz ? x : y, across = horiz ? y : x;
      const g = Math.sin(across * 1.9 + Math.sin(along * 0.33 + seed) * 1.5 + seed);
      let c = (across + Math.floor(along / 5)) & 1 ? P2.base : P2.alt;
      if (g > 0.8) c = P2.grain; else if (g < -0.88) c = P2.light;
      // worn light edges on top / left, carved dark grooves on bottom / right
      if (!has2(x, y + 1) || !has2(x - 1, y)) c = h3(x, y, i, 74) < 0.75 ? P2.worn : P2.light;
      if (!has2(x, y - 1) || !has2(x + 1, y)) c = P2.groove;
      for (const [kx, ky] of knots) {
        const d = Math.max(Math.abs(x - kx), Math.abs(y - ky));
        if (d === 0) c = P2.knot; else if (d === 1 && (x === kx || y === ky)) c = P2.grain;
      }
      v.set(x, y + yb, fz, c);
      if (!has2(x, y - 1) || !has2(x + 1, y) || !has2(x, y + 1) || !has2(x - 1, y)) v.set(x, y + yb, fz - 1, P2.side); // the shaded bevel behind the edge
    }
    for (const [x, y] of l.vox) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const xx = x + a, yy = y + b;
      if (yy < 0 || has2(xx, yy)) continue;
      v.set(xx, yy + yb, fz - 1, INK); // the ink outline, just behind the face
    }
    if (l.spring != null) {
      // water bubbling up on the top, running out over a notch in the front lip
      for (let x = l.spring; x < l.spring + l.springW; x++)
        for (let z = zb + 1; z < zb + DEP; z++) {
          let y = l.colTop - 1 + yb;
          while (y > yb && !v.has(x, y, z)) y--;
          if (!v.has(x, y, z)) continue;
          v.set(x, y, z, (x + z) & 1 ? 0x9ae0d8 : 0x4aa6a0);
          if (z === zb + DEP - 1) v.set(x, y, z, 0xf2fbff);
        }
    }
    // mossy feet, a spring on top where a fall starts
    const pl = [];
    const tp = [];
    for (const k of v.vox.keys()) {
      const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
      if (!v.has(x, y + 1, z)) tp.push([x, y, z]);
    }
    for (const [x, y, z] of tp) {
      if (l.spring != null && x >= l.spring - 1 && x <= l.spring + l.springW) continue;
      const r = h3(x, y, z, 61 + i);
      if (z > zb + DEP - 4 || v.get(x, y, z) === INK) continue; // plants only on the top, behind the face
      if (l.line === 1) { if (r < 0.06) tuft(pl, x, y + 1, z, 0.1); continue; } // low: never across THE BEAR
      if (r < 0.07) tuft(pl, x, y + 1, z, h3(x, z, y, 62) * 0.6);
      else if (r < 0.11) flower(pl, x, y + 1, z, h3(x, z, y, 63) * 0.34);
    }
    // a vine or two hanging from the front top edge
    const front = zb + DEP;
    for (let x = l.x0; x <= l.x1; x++) {
      if (true) continue; // [readability] no vines across the faces
      let y = yb + l.h + 1;
      while (y > yb && !v.has(x, y, front - 1)) y--;
      if (y > yb + 3 && (l.spring == null || x < l.spring - 1 || x > l.spring + l.springW)) vine(pl, x, y, front, 2 + Math.floor(h3(x, y, 1, 65) * 5));
    }
    const cx = Math.round((l.x0 + l.x1 + 1) / 2), cz = zb + DEP / 2;
    const pivot = [cx, yb, cz];
    const geo = mergeGeo(v.build({ pivot, scale: S }), plantArrays(pl, pivot, i), i);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(cx * S, yb * S, cz * S);
    m.castShadow = false; m.receiveShadow = true;
    m.userData.letter = i;
    inner.add(m);
    return { ...l, mesh: m, i, cx, yb, zb, top: yb + l.h - 1, base: m.position.clone(), wob: 0, wv: 0, sq: 0, sv: 0, grow: 0, delay: 0, tilt: (h3(i, 7, 7, 66) - 0.5) * 0.06 };
  });

  // --- fish on the letters (the game's fish sprites): one hangs on a line from the arm of the T of
  // EAT, one leaps over the A of BEAR. Neither crosses a stroke.
  const letterFish = [];
  {
    const tex = (id) => {
      try {
        const cv = fishCanvasFor(id, { scale: 1 });
        const t = new THREE.CanvasTexture(cv);
        t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
        return { t, ar: cv.height / cv.width };
      } catch { return null; }
    };
    const T = L.filter((l) => l.line === 1 && l.ch === 'T').pop();
    if (T) {
      const arm = [];
      for (let x = T.x1; x > T.x0; x--) { if (T.vox.some((p) => p[0] === x && p[1] === 0)) break; arm.push(x); }
      const armBot = arm.length ? Math.min(...T.vox.filter((p) => arm.includes(p[0])).map((p) => p[1])) : 0;
      const tx = tex('bluegill');
      if (tx && arm.length >= 3 && armBot >= 8) {
        const hx2 = arm[Math.floor(arm.length / 2)] + 0.5 - T.cx;
        // the line + hook: a few voxels in the letter's own mesh would be re-meshed; a thin box is enough
        const lineM = new THREE.Mesh(new THREE.BoxGeometry(0.35 * S, 2.2 * S, 0.35 * S), new THREE.MeshLambertMaterial({ color: 0xe8e0c8 }));
        lineM.position.set(hx2 * S, (armBot - 1.1) * S, (DEP / 2 + 0.4) * S);
        T.mesh.add(lineM);
        const len = Math.min(8, armBot - 3.5);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx.t, alphaTest: 0.5, transparent: false, rotation: Math.PI / 2 }));
        sp.scale.set(len * S, len * tx.ar * S, 1);
        sp.position.set(hx2 * S, (armBot - 2.2 - len / 2) * S, (DEP / 2 + 0.6) * S);
        sp.renderOrder = 4;
        T.mesh.add(sp);
        sp.userData.letterFish = true; // (tools/promo hides the pool's leapers, not these)
        letterFish.push({ s: sp, kind: 'hang', y0: sp.position.y, x0: sp.position.x, line: lineM, ph: 0 });
      }
    }
    const A = L.find((l) => l.line === 0 && l.ch === 'A');
    const tx2 = tex('rainbow');
    if (A && tx2) {
      const len = 10;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx2.t, alphaTest: 0.5, transparent: false }));
      sp.scale.set(len * S, len * tx2.ar * S, 1);
      sp.position.set(0, (A.h + 3.2) * S, (DEP / 2 + 0.6) * S);
      sp.renderOrder = 4;
      A.mesh.add(sp);
      sp.userData.letterFish = true;
      letterFish.push({ s: sp, kind: 'leap', y0: sp.position.y, x0: 0, ph: 1.3 });
    }
  }

  // --- water: the pool + runnels (flat) and the falls (vertical), one shader each
  const waterU = { uTime: { value: 0 }, uFall: { value: 1 }, uLight: { value: WATER.light }, uMid: { value: WATER.mid }, uDeep: { value: WATER.deep }, uFoam: { value: WATER.foam }, uEdge: { value: WATER.edge }, uK: { value: 1 },
    uFoamAt: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) } };
  const COMMON = /* glsl */ `
float wh(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float wbay(vec2 a) { a = floor(a); float b2 = fract(a.x * 0.5 + a.y * a.y * 0.75); vec2 c = floor(a * 0.5); return fract(c.x * 0.5 + c.y * c.y * 0.75) * 0.25 + b2; }
uniform float uTime; uniform float uFall; uniform float uK;
uniform vec3 uLight; uniform vec3 uMid; uniform vec3 uDeep; uniform vec3 uFoam; uniform vec3 uEdge;
`;
  // flat water: per-vertex shore distance (aD)
  const poolMat = new THREE.ShaderMaterial({
    uniforms: waterU,
    vertexShader: /* glsl */ `attribute float aD; varying float vD; varying vec3 vP;
      void main() { vD = aD; vP = position / ${S.toFixed(3)}; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: COMMON + /* glsl */ `varying float vD; varying vec3 vP;
      uniform vec4 uFoamAt[6];
      void main() {
        vec2 p = floor(vP.xz * 2.0) / 2.0; // half-voxel pixels
        float b = wbay(gl_FragCoord.xy);
        float d = vD + (b - 0.5) * 0.9;
        vec3 c = d < 0.9 ? uLight : d < 2.4 ? uMid : uDeep;
        if (d < 0.35) c = mix(uLight, uFoam, 0.35);
        // drifting ripple lines
        float rp = sin(p.x * 0.55 + p.y * 1.3 - uTime * 1.6) + sin(p.x * 0.23 - p.y * 0.9 + uTime * 1.1);
        if (rp > 1.55 + b * 0.3) c = mix(c, uLight, 0.55);
        // sun glints twinkling
        float g = wh(p + floor(uTime * 2.5) * 0.37);
        if (g > 0.985 && d > 1.0) c = uFoam;
        // churning foam where the falls land
        for (int i = 0; i < 6; i++) {
          vec4 f = uFoamAt[i];
          if (f.w <= 0.0) continue;
          float r = length((p - f.xz) * vec2(0.7, 1.0));
          float ch = wh(floor(p) + floor(uTime * 6.0) * 1.7);
          if (r < f.w * (0.7 + 0.3 * ch)) c = mix(c, uFoam, r < f.w * 0.5 ? 0.9 : 0.6);
        }
        gl_FragColor = vec4(c * uK, 1.0);
      }`,
  });
  {
    const pos = [], dd = [], idx = [];
    const wet = (x, z) => inPool(x, z) || inBrook(x, z) || inSpill(x, z);
    const dist = (x, z) => { for (let r = 1; r <= 4; r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (Math.max(Math.abs(a), Math.abs(b)) === r && !wet(x + a, z + b)) return r - 1; return 4; };
    let vi = 0;
    for (let x = X0; x <= X1; x++)
      for (let z = -2; z <= ZF + 1; z++) {
        if (!wet(x, z)) continue;
        const d = dist(x, z);
        const y = inPool(x, z) ? POOL_Y : -0.35;
        for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { pos.push((x + a) * S, y * S, (z + b) * S); dd.push(d); }
        idx.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2);
        vi += 4;
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aD', new THREE.Float32BufferAttribute(dd, 1));
    g.setIndex(idx);
    const pool = new THREE.Mesh(g, poolMat);
    pool.renderOrder = 2;
    inner.add(pool);
  }
  // the falls: vertical strips (aU across 0..1, aV voxels from the top, aL length, aF fade start)
  const falls = [];
  const fallMat = new THREE.ShaderMaterial({
    uniforms: waterU,
    vertexShader: /* glsl */ `attribute vec4 aW; varying vec4 vW;
      void main() { vW = aW; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: COMMON + /* glsl */ `varying vec4 vW;
      void main() {
        float u = vW.x, v = vW.y, len = vW.z, fade = vW.w;
        if (v > uFall * len) discard;
        float b = wbay(gl_FragCoord.xy);
        if (v > fade && b < (v - fade) / max(1.0, len - fade)) discard; // dissolves into the air
        float col = floor(u * 6.0);
        float s = wh(vec2(col, 3.1));
        float k = fract((v * 0.55 - uTime * (2.6 + s * 0.9)) + s * 7.0);
        vec3 c = k < 0.3 ? uLight : k < 0.75 ? uMid : mix(uMid, uDeep, 0.5);
        if (u < 0.12 || u > 0.88) c = mix(c, uEdge, 0.55);
        if (v < 0.9) c = mix(uFoam, uLight, b * 0.4); // the lip
        if (len - v < 1.6 && fade > len) c = mix(c, uFoam, step(0.35, wh(vec2(col, floor(uTime * 8.0)))) * 0.85); // churning foot
        if (wh(vec2(col, floor(v * 2.0 - uTime * 14.0))) > 0.93) c = uFoam; // sparkles
        gl_FragColor = vec4(c * uK, 1.0);
      }`,
  });
  {
    const pos = [], aw = [], idx = [];
    let vi = 0;
    const strip = (x0, w, yTop, yBot, z, fadeAt = 999, foamAt = null) => {
      const len = yTop - yBot;
      for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        pos.push((x0 + a * w) * S, (yTop - b * len) * S, z * S);
        aw.push(a, b * len, len, fadeAt);
      }
      idx.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2);
      vi += 4;
      falls.push({ x: x0 + w / 2, y: yBot, z, w, len, foam: foamAt });
    };
    // centre: from the upper terrace's lip down between the words
    strip(wordGap - 1.5, 3, TIER + 0.05, -0.3, ZC + 0.15, 999, [wordGap, ZC + 2, 2]);
    // curtains behind the words
    for (const x of curtains) strip(x - 1, 3, TIER + 0.05, -0.3, ZC + 0.15, 999, [x + 0.5, ZC + 2, 1.8]);
    // off the arms of the T's into the pool
    for (const l of L) if (l.spring != null) strip(l.spring, l.springW, l.colTop + 0.05, POOL_Y, Z2 + DEP + 0.12, 999, [l.spring + 1, Z2 + DEP + 1.2, 1.6]);
    // the overflow off the island's edge into the air
    strip(spillX, 3, -0.4, -36, ZF + 1.6, -15);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aW', new THREE.Float32BufferAttribute(aw, 4));
    g.setIndex(idx);
    const fm = new THREE.Mesh(g, fallMat);
    fm.renderOrder = 3;
    inner.add(fm);
    falls.filter((f) => f.foam).slice(0, 6).forEach((f, i) => waterU.uFoamAt.value[i].set(f.foam[0], 0, f.foam[1], f.foam[2]));
  }

  // --- fish (the game's fish sprites)
  const FISH = ['bluegill', 'sockeye', 'goldfish', 'perch', 'rainbow'];
  const fishTex = new Map();
  const fishMats = [];
  const fishPool = [0, 1, 2].map(() => {
    const m = new THREE.SpriteMaterial({ alphaTest: 0.5, transparent: false });
    fishMats.push(m);
    const s = new THREE.Sprite(m);
    s.visible = false;
    s.renderOrder = 4;
    s.userData.leapFish = true; // the pool's leapers
    inner.add(s);
    return { s, on: false };
  });
  const texFor = (id) => {
    if (!fishTex.has(id)) {
      let t = null;
      try {
        const cv = fishCanvasFor(id, { scale: 1 });
        t = new THREE.CanvasTexture(cv);
        t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
        t.userData = { w: cv.width / FISH_TPU, h: cv.height / FISH_TPU };
      } catch { t = null; }
      fishTex.set(id, t);
    }
    return fishTex.get(id);
  };

  // --- particles in world space at a local voxel point
  const _w = new THREE.Vector3();
  const world = (x, y, z) => { inner.updateWorldMatrix(true, false); return inner.localToWorld(_w.set(x * S, y * S, z * S)); };
  const vw = () => voxel; // world units per voxel
  function splash(x, z, n = 8, power = 1) {
    const p = P(); if (!p) return;
    const w = world(x, POOL_Y, z), k = vw();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = (0.5 + Math.random()) * power;
      p.fx.spawn(Math.random() < 0.6 ? 'drop' : 'drop_s', w.x, w.y, w.z, { vx: Math.cos(a) * sp * k * 6, vy: (6 + Math.random() * 6) * power * k * 6, vz: Math.sin(a) * sp * k * 4, grav: 160 * k, life: 0.55, size: (0.9 + Math.random() * 0.8) * k * 1.4, flags: FX.FADE, bright: true });
    }
    for (let i = 0; i < 3; i++) p.fx.spawn('foam', w.x + rand(-1, 1) * k * 2, w.y + k * 0.2, w.z, { vx: rand(-1, 1) * k * 4, drag: 2, life: 0.7, size: k * 1.2, flags: FX.FADE, bright: true });
  }
  function puff(x, y, z, n = 4) {
    const p = P(); if (!p) return;
    const w = world(x, y, z), k = vw();
    for (let i = 0; i < n; i++) p.fx.spawn('dust', w.x + rand(-3, 3) * k, w.y + k, w.z + rand(-1, 1) * k, { vx: rand(-6, 6) * k, vy: rand(3, 8) * k, drag: 2.5, life: 0.6, size: rand(3, 5) * k, fps: 6, flags: FX.FADE | FX.ONCE, flip: Math.random() < 0.5 });
  }
  function petals(x, y, z, cols) {
    const p = P(); if (!p) return;
    const w = world(x, y, z), k = vw();
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * TAU;
      const c = new THREE.Color(pick(cols, Math.random()));
      p.fx.spawn('petal', w.x, w.y, w.z, { vx: Math.cos(a) * k * 18, vy: rand(14, 30) * k, vz: Math.sin(a) * k * 8, grav: 60 * k, drag: 1.5, life: 1.1, size: k * 1.6, spin: rand(-6, 6), flags: FX.FADE | FX.WOBBLE, tint: [c.r * 2, c.g * 2, c.b * 2], bright: true });
    }
  }

  // --- the bounding box (for fitting into a screen box)
  // the fitting box: the letters and a little island round them (the island's roots hang below it)
  const box = new THREE.Box3(new THREE.Vector3((LX0 - 3) * S, -5 * S, Z1 * S), new THREE.Vector3((LX1 + 4) * S, (TIER + 16) * S, (Z2 + DEP + 3) * S));
  function extent(rel) {
    const c = Math.cos(rel), s = Math.sin(rel);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const sy = y * c - z * s;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return { w: (x1 - x0) / S, h: (y1 - y0) / S, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  // centre `inner` on the visual centre for a view from `rel` above
  function fitTilt(rel) {
    const e = extent(rel), c = Math.cos(rel), s = Math.sin(rel);
    // a local point (cx, Y, Z) with Y*c - Z*s = cy: shift along y only
    inner.position.set(-e.cx, -e.cy * c, e.cy * s);
    return e;
  }

  // --- state, the intro, the gags
  let T = 0, shown = 0, showGoal = 0, introT = -1, hideT = -1, leapT = 1.5;
  const fishOn = [];
  function intro() {
    introT = 0; hideT = -1; showGoal = 1; group.visible = true;
    L.forEach((l, k) => { l.grow = 0; l.delay = 0.35 + k * 0.075 + (l.line === 0 ? 0 : 0.12); l.landed = false; });
    waterU.uFall.value = 0;
    leapT = 2.4;
  }
  function hide() { if (showGoal === 0) return; showGoal = 0; hideT = 0; }
  function leap(from = null) {
    const f = fishPool.find((q) => !q.on);
    if (!f) return;
    const id = FISH[Math.floor(Math.random() * FISH.length)];
    const tex = texFor(id);
    if (!tex) return;
    f.s.material.map = tex; f.s.material.needsUpdate = true;
    const x0 = from != null ? from + rand(-5, 5) : rand(poolX0 + 6, poolX1 - 6);
    const dir = Math.random() < 0.5 ? -1 : 1;
    const z = rand(poolZ1 - 5, poolZ1 - 1.5);
    const span = rand(8, 13);
    f.on = true; f.t = 0; f.dur = rand(0.85, 1.05); f.x0 = x0; f.x1 = clamp(x0 + dir * span, poolX0 + 2, poolX1 - 2); f.z = z; f.h = rand(7, 12); f.dir = Math.sign(f.x1 - f.x0) || 1;
    f.w = tex.userData.w * 9; f.hh = tex.userData.h * 9; // ~ the size of a real fish against the letters
    f.s.visible = true;
    fishOn.push(f);
    splash(x0, z, 7, 0.8);
    play('fish_flop', { volume: 0.12, pitch: rand(1.1, 1.4) });
  }
  function hover(i) {
    const l = L[i]; if (!l) return;
    l.wv += (Math.random() < 0.5 ? -1 : 1) * 2.6;
    l.sv -= 1.2;
    U.uRustle.value[i] = Math.min(1.6, U.uRustle.value[i] + 1.1);
  }
  let pokeN = 0;
  function poke(i) {
    const l = L[i]; if (!l) return;
    l.sv += 5.5; l.wv += (Math.random() - 0.5) * 3;
    U.uRustle.value[i] = 1.8;
    const top = l.top + 1, front = l.zb + DEP;
    const kind = ['fish', 'splash', 'flower'][pokeN++ % 3];
    if (kind === 'fish' && l.line === 1) { leap(l.cx); }
    else if (kind === 'splash' || (kind === 'fish' && l.line === 0)) {
      const p = P();
      if (p) {
        const w = world(l.cx, top, front - 2), k = vw();
        for (let n = 0; n < 14; n++) { const a = Math.random() * TAU; p.fx.spawn(Math.random() < 0.6 ? 'drop' : 'spray', w.x, w.y, w.z, { vx: Math.cos(a) * k * 14, vy: rand(20, 34) * k, vz: Math.sin(a) * k * 8, grav: 150 * k, life: 0.7, size: k * rand(1.2, 2), flags: FX.FADE, bright: true }); }
      }
      play('splash', { volume: 0.3, pitch: rand(1.2, 1.5) });
    } else {
      petals(l.cx, top + 1, front - 2, FLOWERS.map((f) => f[0]));
      play('pop_in', { volume: 0.3, pitch: rand(1.1, 1.4) });
    }
    puff(l.cx, l.yb, front, 2);
  }

  function update(dt) {
    dt = Math.min(0.1, Math.max(0, dt || 0));
    T += dt;
    U.uTime.value = T; waterU.uTime.value = T;
    const wind = game?.wind;
    U.uWind.value = 0.55 + (typeof wind?.strength === 'number' ? wind.strength * 0.4 : 0.2 * Math.sin(T * 0.3));
    for (let i = 0; i < 16; i++) U.uRustle.value[i] = Math.max(0, U.uRustle.value[i] - dt * 1.2);
    // show / hide
    if (introT >= 0) {
      introT += dt;
      shown = smooth(introT / 0.45);
      waterU.uFall.value = clamp((introT - 1.6) / 1.2, 0, 1);
      if (introT > 3) introT = -1;
    }
    if (hideT >= 0) {
      hideT += dt;
      shown = 1 - smooth(hideT / 0.35);
      if (hideT > 0.4) { hideT = -1; group.visible = false; }
    }
    // the island rises into place with a soft bounce
    const rise = introT >= 0 ? 1 - (1 - smooth(introT / 0.55)) * 1.0 : shown;
    const ov = introT >= 0 && introT < 0.9 ? Math.sin(clamp((introT - 0.35) / 0.55, 0, 1) * Math.PI) * 0.035 : 0;
    inner.scale.setScalar(Math.max(0.001, rise * (1 + ov)));
    // letters: grow out of the ground (staggered), then springs
    for (const l of L) {
      if (introT >= 0) {
        const u = clamp((introT - l.delay) / 0.38, 0, 1);
        l.grow = u <= 0 ? 0 : u < 1 ? 1 + Math.sin(u * Math.PI) * 0.18 - (1 - u) * (1 - u) * 1 : 1;
        if (u > 0.05 && !l.landed) { l.landed = true; puff(l.cx, l.yb, l.zb + DEP, 3); if (l.i % 3 === 0) play('build_cloud', { volume: 0.06, pitch: rand(1.3, 1.6) }); }
      } else if (hideT < 0) l.grow = 1;
      // wobble (rotation about the base) and squash springs
      l.wv += (-60 * l.wob - 5 * l.wv) * dt; l.wob += l.wv * dt;
      l.sv += (-140 * l.sq - 9 * l.sv) * dt; l.sq += l.sv * dt;
      const m = l.mesh, gr = Math.max(0.001, l.grow);
      m.rotation.set(0, 0, l.wob * 0.12 + l.tilt + Math.sin(T * 0.9 + l.i) * 0.006);
      const sq = clamp(l.sq * 0.05, -0.25, 0.3);
      m.scale.set((1 - sq * 0.5) , gr * (1 + sq), (1 - sq * 0.5));
      m.position.y = l.base.y + Math.max(0, l.sq) * 0.04 + Math.sin(T * 1.3 + l.i * 0.8) * 0.004;
    }
    // the fish on the letters: the hanging one turns and swings on its line, the leaper arcs over its A
    for (const f of letterFish) {
      const m = f.s.material;
      if (f.kind === 'hang') {
        const sw = Math.sin(T * 1.6 + f.ph) * 0.12 + Math.sin(T * 5.3) * 0.03;
        m.rotation = Math.PI / 2 + sw;
        f.s.position.x = f.x0 + Math.sin(T * 1.6 + f.ph) * 0.06;
      } else {
        // a slow hop to and fro over the apex, nose following the arc, tail flicking
        const u = (Math.sin(T * 0.9) + 1) / 2;
        const ax = (u - 0.5) * 9;
        f.s.position.set(ax * S, f.y0 + Math.cos((u - 0.5) * Math.PI) * 1.6 * S, f.s.position.z);
        const dir = Math.cos(T * 0.9) >= 0 ? 1 : -1;
        f.s.scale.x = Math.abs(f.s.scale.x) * dir;
        m.rotation = -(u - 0.5) * 1.1 * dir * dir + Math.sin(T * 9) * 0.05;
      }
    }
    // ambient fish
    if (showGoal && introT < 0) {
      leapT -= dt;
      if (leapT <= 0) { leapT = rand(2.2, 4.8); leap(); }
    }
    for (let i = fishOn.length - 1; i >= 0; i--) {
      const f = fishOn[i];
      f.t += dt;
      const u = f.t / f.dur;
      if (u >= 1) { f.on = false; f.s.visible = false; fishOn.splice(i, 1); splash(f.x1, f.z, 9, 1); play('plop', { volume: 0.1, pitch: rand(1.2, 1.6) }); continue; }
      const x = f.x0 + (f.x1 - f.x0) * u, y = POOL_Y + Math.sin(u * Math.PI) * f.h;
      f.s.position.set(x * S, y * S, f.z * S);
      f.s.material.rotation = Math.cos(u * Math.PI) * 0.9 * f.dir;
      f.s.scale.set(f.w * S * f.dir, f.hh * S, 1); // (the fish art faces right)
    }
    // a little spray at the foot of each fall
    const p = P();
    if (p && waterU.uFall.value >= 1 && group.visible) {
      for (const f of falls) {
        if (Math.random() > dt * (f.foam ? 7 : 3)) continue;
        const k = vw();
        const w = world(f.x + rand(-1, 1), f.foam ? POOL_Y + 0.2 : -14, f.z + (f.foam ? 0.4 : 0));
        p.fx.spawn(f.foam ? 'spray' : 'foam', w.x, w.y, w.z, { vx: rand(-4, 4) * k, vy: rand(4, 10) * k * (f.foam ? 1 : -1), drag: 2, life: 0.5, size: k * rand(1, 1.6), flags: FX.FADE, bright: true });
      }
    }
  }

  const ray0 = new THREE.Raycaster();
  function pickRay(ray) {
    if (!group.visible) return -1;
    ray0.ray.copy(ray);
    const hit = ray0.intersectObjects(L.map((l) => l.mesh), false)[0];
    return hit ? hit.object.userData.letter : -1;
  }

  function setVoxel(v) { voxel = v; group.scale.setScalar(v / S); }
  setVoxel(voxel);
  group.visible = false;

  function dispose() {
    group.removeFromParent();
    group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    mat.dispose(); poolMat.dispose(); fallMat.dispose();
    for (const m of fishMats) m.dispose();
    for (const f of letterFish) { f.s.material.map?.dispose(); f.s.material.dispose(); f.line?.material.dispose(); }
    for (const t of fishTex.values()) t?.dispose();
  }

  return {
    group, letters: L, chars: L.map((l) => l.ch),
    update, intro, hide, leap, hover, poke, pick: pickRay, setVoxel, fitTilt, extent, dispose,
    get visible() { return group.visible && showGoal > 0; },
    get busy() { return introT >= 0 || hideT >= 0; }, // (tests: the rise / sink is playing)
  };
}

// ---------------------------------------------------------------- plant makers (voxel lists)
function tuft(out, x, y, z, r) {
  const n = 1 + Math.floor(r * 3);
  for (let i = 0; i < n; i++) {
    const c = i === n - 1 ? BLADES[3] : BLADES[1 + (i & 1)];
    out.push([x, y + i, z, c, i]);
  }
  if (r > 0.6) out.push([x + (r > 0.8 ? 1 : -1), y, z, BLADES[0], 0]);
}
function flower(out, x, y, z, r) {
  const [petal, eye] = pick(FLOWERS, r);
  const h = 1 + Math.floor(r * 7) % 2;
  for (let i = 0; i < h; i++) out.push([x, y + i, z, BLADES[1], i]);
  const t = y + h;
  out.push([x, t, z, eye, h]);
  if (r > 0.35) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) out.push([x + a, t, z + b, petal, h]);
  else out.push([x, t + 1, z, petal, h + 1]);
}
function fern(out, x, y, z, r) {
  out.push([x, y, z, BLADES[0], 0]);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [a, b] of dirs) {
    if (h3(x + a, y, z + b, 77) > 0.85) continue;
    out.push([x + a, y + 1, z + b, BLADES[1], 1]);
    out.push([x + a * 2, y + 1, z + b * 2, BLADES[2], 1.5]);
    if (r > 0.4) out.push([x + a * 3, y, z + b * 3, BLADES[3], 1.5]);
  }
  out.push([x, y + 1, z, BLADES[2], 1]);
}
function cattail(out, x, y, z, r) {
  const h = 4 + Math.floor(r * 4);
  for (let i = 0; i < h; i++) out.push([x, y + i, z, CATTAIL.stalk, i]);
  out.push([x, y + h, z, CATTAIL.head, h]);
  out.push([x, y + h + 1, z, CATTAIL.headL, h + 1]);
  out.push([x, y + h + 2, z, CATTAIL.stalk, h + 2]);
  // a leaf or two
  out.push([x + 1, y + 1, z, CATTAIL.leaf, 1]);
  out.push([x + 1, y + 2, z, CATTAIL.leaf, 2]);
  if (r > 0.5) { out.push([x - 1, y + 1, z, CATTAIL.leaf, 1]); out.push([x - 1, y + 2, z + 1, CATTAIL.leaf, 2]); out.push([x - 2, y + 3, z + 1, CATTAIL.leaf, 3]); }
}
function vine(out, x, y, z, n) {
  for (let i = 0; i < n; i++) {
    const c = VINE[(i + x) % 3];
    out.push([x, y - i, z, c, i * 0.7, 1, true]);
    if (h3(x, y - i, z, 81) < 0.35) out.push([x + (i & 1 ? 1 : -1), y - i, z, VINE[2], i * 0.7, 1, true]);
  }
}
function lily(out, x, z, i) {
  const y = 0; // sits on the water (thin)
  const r = 1 + (i % 2);
  for (let a = -r; a <= r; a++) for (let b = -1; b <= 1; b++) {
    if (Math.abs(a) === r && Math.abs(b) === 1) continue;
    if (a === 0 && b === 1) continue; // the notch
    out.push([x + a, POOL_Y - 0.05 + y, z + b, (a + b) & 1 ? LILY.pad : LILY.padL, 0, 0.25]);
  }
  if (i % 3 === 0) { out.push([x, POOL_Y + 0.2, z, LILY.flower, 0, 0.8]); out.push([x, POOL_Y + 0.2, z - 1, LILY.flowerC, 0, 0.6]); }
}
