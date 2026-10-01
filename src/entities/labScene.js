// Reynard's secret lab: the inside of the fox's hut as a cosy-villain cutaway
// diorama (front wall and ceiling removed), shown when the player opens the
// Lab. Everything is procedural voxels built at half the game's voxel size
// (1 lab voxel = 0.05 world units) so props can carry lots of small details.
//
// Space: the returned group's origin is the centre of the floor (floor top at
// y = 0). The room interior spans x -3.5..3.5, z -2.5..2.5 and is 4 units
// tall; the back wall is at -z and the open front faces +z, so view it from
// +z with an orthographic camera pitched ~40 degrees down (yaw 0).
import * as THREE from 'three';
import { VoxelModel, shade, mix } from '../core/voxel.js';
import { mulberry32, hash2, hash3 } from '../core/rng.js';

export const LAB_VOXEL = 0.05; // world units per lab voxel
export const LAB_BACKGROUND = 0x16111d; // suggested clear colour around the diorama
export const FOX_SEAT_HEIGHT = 0.55; // hip height above anchors.foxSeat.position

const S = LAB_VOXEL;
const W = (n) => n * S; // lab voxels -> world units
const DEG = Math.PI / 180;

// ------------------------------------------------------------------ pixel font
// 3x5 glyphs (some wider). Used for chalk, the CRT and little signs.
const GLYPHS = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'],
  $: ['.##', '##.', '.#.', '.##', '##.'], '>': ['#..', '.#.', '..#', '.#.', '#..'], '<': ['..#', '.#.', '#..', '.#.', '..#'],
  ':': ['...', '.#.', '...', '.#.', '...'], '.': ['...', '...', '...', '...', '.#.'], ',': ['...', '...', '...', '.#.', '#..'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'], '?': ['##.', '..#', '.#.', '...', '.#.'], '-': ['...', '...', '###', '...', '...'],
  '+': ['...', '.#.', '###', '.#.', '...'], '=': ['...', '###', '...', '###', '...'], '/': ['..#', '..#', '.#.', '#..', '#..'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'], "'": ['.#.', '.#.', '...', '...', '...'], '(': ['.#.', '#..', '#..', '#..', '.#.'],
  ')': ['.#.', '..#', '..#', '..#', '.#.'], '_': ['...', '...', '...', '...', '###'], '#': ['#.#', '###', '#.#', '###', '#.#'],
  '*': ['...', '#.#', '.#.', '#.#', '...'], '"': ['#.#', '#.#', '...', '...', '...'], '[': ['##.', '#..', '#..', '#..', '##.'],
  ']': ['.##', '..#', '..#', '..#', '.##'], ' ': ['...', '...', '...', '...', '...'], '\\': ['#..', '#..', '.#.', '..#', '..#'],
  '→': ['.....', '...#.', '#####', '...#.', '.....'], '♥': ['.#.#.', '#####', '#####', '.###.', '..#..'],
  '█': ['###', '###', '###', '###', '###'],
};
const glyph = (ch) => GLYPHS[ch] || GLYPHS[String(ch).toUpperCase()] || GLYPHS[' '];
export function textWidth(str, scale = 1) {
  let w = 0;
  for (const ch of str) w += (glyph(ch)[0].length + 1) * scale;
  return Math.max(0, w - scale);
}
// Paint text into a voxel plane. `put(u, v)` receives glyph pixel coords
// (u to the right, v downward from the top of the line).
function eachTextPixel(str, put) {
  let cx = 0;
  for (const ch of str) {
    const g = glyph(ch);
    for (let r = 0; r < 5; r++) for (let c = 0; c < g[r].length; c++) if (g[r][c] === '#') put(cx + c, r);
    cx += g[0].length + 1;
  }
  return cx - 1;
}
// Crisp pixel text on a canvas.
function canvasText(ctx, str, x, y, color, scale = 1) {
  ctx.fillStyle = color;
  const w = eachTextPixel(str, (u, v) => ctx.fillRect(x + u * scale, y + v * scale, scale, scale));
  return w * scale;
}

// ------------------------------------------------------------------ helpers
const rgbStr = (hex) => '#' + hex.toString(16).padStart(6, '0');
const pick = (arr, h) => arr[Math.min(arr.length - 1, Math.floor(h * arr.length))];

// Lambert + per-voxel grain (like voxel.js addGrain, but at lab resolution).
function grainLambert(params = {}, amount = 0.1) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, ...params });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLabPos;\nvarying vec3 vLabNor;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLabPos = position;\nvLabNor = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vLabPos;
varying vec3 vLabNor;
float labHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 an = abs(vLabNor);
  vec2 cell = an.y > 0.5 ? vLabPos.xz : (an.x > 0.5 ? vLabPos.zy : vLabPos.xy);
  float gn = labHash(floor(cell * 20.0 + 0.001));
  diffuseColor.rgb *= 1.0 + (gn - 0.5) * ${amount.toFixed(3)};
}`);
  };
  mat.customProgramCacheKey = () => 'labgrain' + amount;
  return mat;
}

// ------------------------------------------------------------------ palette
const LOGS = [0x9c6435, 0x8f5b2f, 0xa66d3a, 0x965f32];
const CHINK = 0xd8c49a;
const END_OUT = 0xa87444, END_IN = 0xdcaa6c, END_MID = 0xc28c52;
const PLANKS = [0xc3844a, 0xb67640, 0xcb9056, 0xab6e3c, 0xbe7e46, 0xb87a42];
const DARKWOOD = [0x5e3a22, 0x6a4228, 0x543420];
const DESKWOOD = 0x8a5634, DESKEDGE = 0x9e6640, DESKSIDE = 0x70442a;
const BEIGE = 0xdcd0b2, BEIGE_D = 0xc2b596, BEIGE_DD = 0x9e9276;
const GOLD = 0xf0c030, GOLD_D = 0xc8961c, GOLD_L = 0xffe27a;
const STEEL = 0xa8b0ba, STEEL_D = 0x747c88, STEEL_L = 0xd4dae2;
const COPPER = 0xc87a3e, COPPER_D = 0x9a5a2c;
const PAPER = 0xf2ead6, PAPER_D = 0xd8ceb6;
const GREEN_GLOW = [0x7cff9a, 0x4aff78, 0xb8ffc8];
const BLACK = 0x221c26;

// Room extents in lab voxels (interior).
const X0 = -70, X1 = 69, Z0 = -50, Z1 = 49, HT = 80;

// ================================================================== shell
function buildFloor(R) {
  for (let x = -74; x <= 73; x++) {
    const p = Math.floor((x + 74) / 6);
    const base = pick(PLANKS, hash2(p, 7, 3));
    const col = (x + 74) % 6;
    const off = Math.floor(hash2(p, 2, 9) * 34);
    for (let z = -54; z <= 49; z++) {
      const along = (z + 54 + off) % 34;
      const seg = Math.floor((z + 54 + off) / 34);
      let c = shade(base, 0.95 + 0.1 * hash2(p, seg, 4));
      if (col === 0) c = shade(c, 0.78);
      if (along === 0) c = 0x6a4022;
      if ((along === 2 || along === 32) && (col === 2 || col === 4)) c = 0x5a4a40; // nails
      if (hash3(x, z, 77) < 0.004) c = shade(base, 0.72); // knots
      R.set(x, -1, z, c);
      R.set(x, -2, z, shade(base, 0.72));
    }
  }
  // rim beam along the open front + stone foundation below it
  for (let x = -74; x <= 73; x++)
    for (let y = -6; y <= -3; y++)
      for (let z = 47; z <= 49; z++) {
        const ring = x <= -73 || x >= 72;
        R.set(x, y, z, ring ? END_IN : y === -3 ? 0x8a5a30 : y === -6 ? 0x6a4424 : 0x7c4e2a);
      }
  const stones = [0x8f8a84, 0x9c968e, 0x7f7a74, 0xa8a198, 0x8a857f];
  const stoneAt = (a, y) => {
    const row = Math.floor((y + 13) / 3);
    const k = Math.floor((a + row * 3 + 200) / 6);
    const edgeA = (a + row * 3 + 200) % 6 === 0, edgeY = (y + 13) % 3 === 0;
    return edgeA || edgeY ? 0x5e5a56 : pick(stones, hash2(k, row, 31));
  };
  for (let y = -13; y <= -7; y++) {
    for (let x = -74; x <= 73; x++) for (let z = 47; z <= 49; z++) R.set(x, y, z, stoneAt(x, y));
    for (let z = -54; z <= 46; z++)
      for (const x of [-74, -73, -72, 71, 72, 73]) R.set(x, y, z, stoneAt(z, y));
  }
  // grassy lip in front of the foundation (the diorama sits on a patch of meadow)
  for (let x = -78; x <= 77; x++)
    for (let z = 50; z <= 55; z++) {
      const g = hash2(x, z, 5);
      R.set(x, -14, z, g < 0.5 ? 0x6e993b : 0x7aa444);
      R.set(x, -15, z, 0x6a4a2e);
      if (z === 50 && g < 0.35) R.set(x, -13, z, 0x86ad48);
    }
  for (let x = -78; x <= 77; x++) for (let y = -19; y <= -15; y++) R.set(x, y, 55, y === -15 ? 0x5e8a34 : hash2(x, y, 8) < 0.15 ? 0x8a847c : 0x5a3e28);
  for (const [x, c] of [[-60, 0xf2c230], [-31, 0xffffff], [8, 0xd9529b], [37, 0xffffff], [63, 0x7d63d8]]) {
    R.set(x, -13, 52, 0x5a8a36); R.set(x, -12, 52, c);
  }
  // little mushrooms by the foundation
  R.set(-44, -13, 51, 0xeee6d8); R.box(-45, -12, 51, -43, -12, 51, 0xc8322a); R.set(-44, -12, 51, 0xffffff);
  R.set(52, -13, 51, 0xeee6d8); R.set(52, -12, 51, 0xc8322a);
}

// One log course: `t` = depth into the room (0 = outside, 3 = inner bulge).
// Row profile gives rounded logs with recessed chinking between them.
const ROW_T = [1, 2, 3, 3, 2];
function logColor(course, along, row, seed) {
  const base = LOGS[(course + seed) % LOGS.length];
  const seg = Math.floor((along + course * 7 + 300) / 11);
  let c = shade(base, 0.94 + 0.12 * hash2(seg, course, seed + 3));
  if (row === 1) c = shade(c, 0.84);
  if (row === 4) c = shade(c, 1.07);
  const h = hash3(along, course, row, seed + 11);
  if (h < 0.02 && row >= 2) c = shade(base, 0.62); // knot
  else if (h < 0.05 && row === 3) c = shade(c, 0.86); // crack
  return c;
}

function endGrain(row, t, tMax) {
  if (row === 1 || row === 4 || t === 0 || t === tMax) return END_OUT;
  return (row === 2 && t === 1) || (row === 3 && t === 2) ? END_MID : END_IN;
}

// Last z (lab voxels) of side-wall log course `c`: a stepped diagonal cut from
// the full-height back corner down to a 3-course-high wall at the front.
const CUT_LOW = 3, CUT_Z0 = -50, CUT_Z1 = 14;
export function sideCourseEnd(c) {
  if (c < CUT_LOW) return 49;
  const k = (HT / 5 - 1 - c) / (HT / 5 - 1 - CUT_LOW); // 0 at the top course, 1 at the low wall
  return Math.round(CUT_Z0 + (CUT_Z1 - CUT_Z0) * k);
}

function buildWalls(R) {
  for (let c = 0; c < HT / 5; c++) {
    for (let r = 0; r < 5; r++) {
      const y = c * 5 + r;
      const tMax = ROW_T[r];
      // back wall (along x); even courses stick out past the corners
      const ext = c % 2 === 0 ? 3 : 0;
      for (let x = -74 - ext; x <= 73 + ext; x++) {
        const out = x < -74 || x > 73;
        for (let t = 0; t <= tMax; t++) {
          if (out && t > 2) continue;
          const z = -54 + t;
          let col = r === 0 ? (t === tMax ? CHINK : shade(CHINK, 0.8)) : logColor(c, x, r, 0);
          if (out && r > 0 && (x === -74 - ext || x === 73 + ext)) col = endGrain(r, t, 2);
          R.set(x, y, z, col);
        }
      }
      // side walls (along z), cut away in steps like a dollhouse: full height
      // at the back corners, stepping down to a low wall toward the front.
      // Odd courses stick out behind the back wall (log-cabin corners).
      const extB = c % 2 === 1 ? 3 : 0;
      const zEnd = sideCourseEnd(c);
      for (let z = -54 - extB; z <= zEnd; z++) {
        const out = z < -54;
        for (let t = 0; t <= tMax; t++) {
          if (out && t > 2) continue;
          const front = z === zEnd;
          const mk = (along) => {
            if (r === 0) return t === tMax ? CHINK : shade(CHINK, 0.8);
            if (front || (out && z === -54 - extB)) return endGrain(r, t, tMax);
            return logColor(c, along, r, 1);
          };
          R.set(-74 + t, y, z, mk(z));
          R.set(73 - t, y, z, mk(z + 50));
        }
      }
    }
  }
}

// ================================================================== props
function cylinder(v, cx, y0, cz, r, h, color) { v.cylinder(cx, y0, cz, r, h, color); }

// Glass flask filled with glowing liquid. `kind`: 'round' | 'cone' | 'tube'.
function flask(R, G, GL, cx, y0, cz, kind, liquid, fill = 0.6) {
  const lcol = typeof liquid === 'number' ? liquid : liquid[0];
  const lite = typeof liquid === 'number' ? shade(liquid, 1.2) : liquid[1];
  if (kind === 'round') {
    const r = 2.6, cy = y0 + 2.6;
    for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) for (let z = -3; z <= 3; z++) {
      if (x * x + y * y + z * z > r * r + 0.5) continue;
      const yy = Math.round(cy + y);
      if (y <= fill * 3 - 1.5) G.set(cx + x, yy, cz + z, y === Math.round(fill * 3 - 1.5) ? lite : lcol);
      else GL.set(cx + x, yy, cz + z, 1);
    }
    for (let y = y0 + 5; y <= y0 + 8; y++) GL.set(cx, y, cz, 1);
    R.set(cx, y0 + 9, cz, 0xb08850); // cork
    return { top: y0 + 9, bubbleFrom: [cx, y0 + 1, cz], bubbleTo: y0 + 3 };
  }
  if (kind === 'cone') {
    for (let y = 0; y <= 6; y++) {
      const rr = y < 4 ? 2.6 - y * 0.35 : 0.6;
      for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
        if (x * x + z * z > rr * rr + 0.3) continue;
        if (y <= fill * 5) G.set(cx + x, y0 + y, cz + z, y === Math.floor(fill * 5) ? lite : lcol);
        else GL.set(cx + x, y0 + y, cz + z, 1);
      }
    }
    GL.set(cx, y0 + 7, cz, 1);
    return { top: y0 + 7, bubbleFrom: [cx, y0, cz], bubbleTo: y0 + Math.floor(fill * 5) };
  }
  // tall tube / graduated cylinder
  const h = 9;
  for (let y = 0; y < h; y++) {
    if (y < h * fill) G.set(cx, y0 + y, cz, y === Math.ceil(h * fill) - 1 ? lite : lcol);
    else GL.set(cx, y0 + y, cz, 1);
    if (y % 2 === 0 && y > 0) GL.set(cx + 1, y0 + y, cz, 1);
  }
  R.set(cx - 1, y0, cz, 0xc8d4dc); R.set(cx + 1, y0, cz, 0xc8d4dc); R.set(cx, y0 - 0, cz + 1, 0xc8d4dc);
  return { top: y0 + h, bubbleFrom: [cx, y0, cz], bubbleTo: y0 + Math.ceil(h * fill) - 1 };
}

function book(R, x, y0, z0, h, depth, color) {
  for (let y = y0; y < y0 + h; y++) for (let z = z0; z < z0 + depth; z++) R.set(x, y, z, color);
  R.set(x, y0 + h - 2, z0 + depth - 1, shade(color, 1.35)); // spine band
  R.set(x, y0 + 1, z0 + depth - 1, shade(color, 1.35));
}

// ---------------------------------------------------------------- lab shelf
function buildLabShelf(R, G, GL, WT, fx) {
  const x0 = -69, x1 = -48, z0 = -50, z1 = -41;
  const wood = DARKWOOD;
  // back panel, sides, shelves
  R.box(x0, 0, z0, x1, 58, z0, (x, y) => (y % 7 === 0 ? wood[2] : wood[1]));
  for (const sx of [x0, x0 + 1, x1 - 1, x1]) R.box(sx, 0, z0, sx, 58, z1, sx === x0 || sx === x1 ? wood[0] : wood[2]);
  for (const y of [0, 1, 15, 29, 43, 57, 58]) R.box(x0, y, z0, x1, y, z1, y === 0 ? wood[2] : wood[0]);
  R.box(x0 - 1, 59, z0, x1 + 1, 59, z1 + 1, 0x7a4c2c); // crown
  R.box(x0 - 1, 60, z0, x1 + 1, 60, z1, 0x6a4226);
  for (const y of [1, 15, 29, 43]) R.box(x0 + 2, y, z1, x1 - 2, y, z1, 0x7a4c2c); // shelf lips
  // ---- level 0 (y 2..14): fish skeleton in a jar, stacked tomes, purple potion
  {
    const cx = -62, cz = -45;
    for (let y = 3; y <= 12; y++)
      for (let x = -4; x <= 4; x++) for (let z = -3; z <= 3; z++) {
        if (x * x / 16.5 + z * z / 10.5 > 1) continue;
        if (y <= 10) WT.set(cx + x, y, cz + z, y === 10 ? 0xf0f8b0 : 0xc8e080);
        else GL.set(cx + x, y, cz + z, 1);
      }
    R.box(cx - 4, 2, cz - 2, cx + 4, 2, cz + 2, 0x5a6a70);
    for (let x = -3; x <= 3; x++) for (let z = -2; z <= 2; z++) R.set(cx + x, 13, cz + z, (x + z) % 2 ? 0xb08850 : 0xc09860); // cork
    R.box(cx - 1, 14, cz - 1, cx + 1, 14, cz, 0x8a6a40);
    // skeleton (facing +x): spine, ribs, skull with an eye socket, forked tail
    const BONE = 0xfaf6ea, BONE_D = 0xe0d8c4;
    for (let x = -3; x <= 2; x++) R.set(cx + x, 7, cz, BONE);
    for (const x of [-2, 0, 2]) for (let y = 5; y <= 9; y++) if (y !== 7) R.set(cx + x, y, cz, y === 5 || y === 9 ? BONE_D : BONE);
    R.box(cx + 3, 6, cz, cx + 4, 8, cz, BONE); R.set(cx + 4, 8, cz, 0x3a3a2a); R.set(cx + 4, 6, cz, BONE_D);
    R.set(cx - 4, 8, cz, BONE); R.set(cx - 4, 6, cz, BONE); R.set(cx - 4, 9, cz, BONE_D); R.set(cx - 4, 5, cz, BONE_D);
    fx.jar = [W(cx), W(8), W(cz)];
  }
  // stacked big books + a round flask on top
  book(R, -56, 2, -48, 3, 6, 0x7a2e3a); R.box(-57, 2, -48, -52, 3, -43, 0x7a2e3a); R.box(-57, 4, -48, -52, 5, -44, 0x2e5a7a); R.box(-56, 6, -47, -53, 6, -45, 0x5a7a3a);
  R.box(-57, 2, -43, -52, 3, -43, PAPER); R.box(-57, 4, -44, -52, 5, -44, PAPER_D);
  fx.flasks.push(flask(R, G, GL, -54, 7, -46, 'round', [0xc66cff, 0xe8b8ff], 0.55));
  // ---- level 1 (y 16..28): a row of flasks
  fx.flasks.push(flask(R, G, GL, -65, 16, -46, 'cone', [0x5aff82, 0xc8ffd0], 0.65));
  fx.flasks.push(flask(R, G, GL, -59, 16, -46, 'round', [0xff6aa8, 0xffc0dc], 0.6));
  fx.flasks.push(flask(R, G, GL, -55, 16, -45, 'tube', [0x5ae0ff, 0xc0f4ff], 0.7));
  // test tube rack
  R.box(-53, 16, -47, -50, 16, -44, 0x8a5a34); R.box(-53, 19, -47, -50, 19, -44, 0x8a5a34);
  [[0x7cff9a, 4], [0xffe060, 3], [0xff7ab0, 5], [0x8ab8ff, 3]].forEach(([c, h], i) => {
    const x = -53 + i;
    for (let y = 17; y <= 22; y++) (y < 17 + h ? G : GL).set(x, y, -45, y < 17 + h ? c : 1);
  });
  // ---- level 2 (y 30..42): books and a fish skull
  let bx = -67;
  const spines = [0xb83a32, 0x3a6a8a, 0xd89a3a, 0x5a3a7a, 0x3a7a4a, 0xc8b890, 0x8a2a3a, 0x2e4a6a];
  for (let i = 0; i < 9; i++) {
    const h = 8 + Math.floor(hash2(i, 3, 5) * 5);
    book(R, bx, 30, -48, h, 6, spines[i % spines.length]);
    bx++;
    if (i === 5) bx++;
  }
  R.box(-56, 30, -48, -56, 37, -43, 0x6a3a2a); R.box(-55, 30, -48, -55, 36, -43, 0x6a3a2a); // leaning books
  // fish skull
  R.box(-53, 30, -47, -49, 33, -44, 0xefe8d8); R.box(-52, 34, -46, -50, 34, -45, 0xefe8d8);
  R.set(-49, 32, -44, BLACK); R.set(-49, 31, -44, 0x4a3a3a); R.box(-49, 30, -46, -48, 30, -45, 0xefe8d8);
  R.set(-51, 33, -43, BLACK); R.set(-52, 31, -43, 0xd8d0c0); R.set(-50, 31, -43, 0xd8d0c0);
  // ---- level 3 (y 44..56): bubbling beaker, potion bottle, tiny cactus, papers
  {
    const cx = -64, cz = -46;
    for (let y = 44; y <= 51; y++) for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
      if (Math.abs(x) === 3 && Math.abs(z) === 3) continue;
      if (y <= 48) G.set(cx + x, y, cz + z, y === 48 ? 0xc8ffb0 : 0x6aff8a);
      else GL.set(cx + x, y, cz + z, 1);
    }
    R.set(cx + 3, 51, cz, 0xc8d4dc);
    fx.flasks.push({ top: 52, bubbleFrom: [cx, 44, cz], bubbleTo: 49, wide: 2.2, big: true });
  }
  // potion bottle
  R.box(-59, 44, -46, -57, 44, -44, 0x5a3a7a);
  G.box(-59, 45, -46, -57, 48, -44, 0xb86aff); G.box(-58, 49, -45, -58, 50, -45, 0xe0b0ff);
  R.set(-58, 51, -45, 0xb08850);
  // cactus in a pot
  R.box(-55, 44, -46, -52, 46, -43, 0xc86a3a); R.box(-55, 47, -46, -52, 47, -43, 0x5a3a24);
  R.box(-54, 48, -45, -53, 53, -44, 0x4a9a4a); R.box(-55, 50, -45, -55, 52, -45, 0x4a9a4a); R.set(-55, 53, -45, 0x5aaa5a);
  R.set(-53, 54, -44, 0xff7ab0); R.set(-52, 50, -44, 0x4a9a4a); R.set(-52, 51, -44, 0x5aaa5a);
  // stack of papers
  R.box(-51, 44, -48, -49, 46, -43, PAPER); R.set(-50, 47, -46, PAPER_D);
  // top of the shelf: rolled blueprints + an old globe
  for (const [z, len] of [[-47, 12], [-45, 10], [-43, 11]]) {
    R.box(-68, 61, z, -68 + len, 62, z + 1, (x) => (x === -68 || x === -68 + len ? 0xd8e8f8 : 0x3a6ab8));
  }
  R.box(-54, 61, -46, -52, 61, -44, 0x6a4424); R.set(-53, 62, -45, GOLD_D);
  R.ellipsoid(-53, 66, -45, 3, 3, 3, (x, y, z) => (hash3(x, y, z, 4) < 0.45 ? 0x5aa05a : 0x3a7ac8));
}

// ---------------------------------------------------------------- lab bench
function buildLabBench(R, G, GL, fx) {
  const x0 = -46, x1 = -18, z0 = -50, z1 = -38;
  // legs, lower shelf, top
  for (const [x, z] of [[x0, z0 + 1], [x0, z1 - 1], [x1 - 1, z0 + 1], [x1 - 1, z1 - 1]]) R.box(x, 0, z, x + 1, 13, z + 1, 0x6a4228);
  R.box(x0, 4, z0 + 1, x1, 4, z1 - 1, 0x7a4c2c);
  R.box(x0 - 1, 14, z0, x1 + 1, 15, z1, (x, y, z) => (z === z1 || x === x0 - 1 || x === x1 + 1 ? 0x2c3038 : 0x3a404a));
  R.box(x0 - 1, 13, z1, x1 + 1, 13, z1, 0x6a4228);
  // burn mark + scorch on the bench top
  R.set(-34, 15, -42, 0x22262c); R.set(-33, 15, -42, 0x2a2e34); R.set(-34, 15, -41, 0x2a2e34);
  // under the bench: barrel, gas bottle, crate of empties
  R.cylinder(-41, 5, -45, 3.4, 8, (x, y) => (y === 6 || y === 11 ? 0x5a5a60 : 0x8a5a30));
  R.box(-43, 8, -42, -39, 9, -42, 0xe8d8a0); R.set(-41, 8, -42, 0xd82a2a); // label
  R.cylinder(-35, 5, -46, 1.6, 9, (x, y) => (y >= 12 ? STEEL : 0x3a8a4a)); R.set(-35, 14, -46, STEEL_D);
  R.box(-31, 5, -48, -22, 9, -41, (x, y, z) => (y === 9 || x === -31 || x === -22 ? 0x9a7040 : (x + y) % 3 ? 0xb08050 : 0x8a6038));
  for (const [x, z, c] of [[-29, -46, 0x3a8ae0], [-27, -44, 0x9ae03a], [-25, -46, 0x3a8ae0], [-28, -43, 0xc8ccd0]]) {
    R.box(x, 10, z, x + 1, 11, z + 1, c); R.set(x, 11, z, 0xd0d4d8);
  }
  // ---- on top (surface y = 16)
  // Bunsen burner + tripod + round flask of green glow
  const bx = -41, bz = -45;
  R.box(bx - 1, 16, bz - 1, bx + 1, 16, bz + 1, 0x3a3a44);
  R.box(bx, 17, bz, bx, 19, bz, STEEL);
  R.line(bx + 1, 16, bz, bx + 5, 16, bz + 5, 0xd87a3a); // gas hose
  for (const [dx, dz] of [[-3, -2], [3, -2], [0, 3]]) R.line(bx + dx, 16, bz + dz, bx + Math.sign(dx) * 2, 22, bz + Math.sign(dz) * 2, 0x4a4a52);
  R.box(bx - 2, 22, bz - 2, bx + 2, 22, bz + 2, (x, y, z) => (Math.abs(x - bx) === 2 || Math.abs(z - bz) === 2 ? 0x5a5a64 : null));
  const f = flask(R, G, GL, bx, 23, bz, 'round', [0x6aff8a, 0xd0ffd8], 0.7);
  fx.flasks.push(f);
  fx.bunsen = [bx, 20, bz];
  // glass tube over to a condenser + collecting beaker
  R.line(bx, 32, bz, bx + 6, 34, bz, 0xcfe6ee); R.line(bx + 6, 34, bz, bx + 10, 27, bz, 0xcfe6ee);
  for (let y = 26; y <= 32; y++) if (y % 2 === 0) R.set(bx + 9, y, bz - 1, COPPER); // condenser coil
  for (let y = 16; y <= 21; y++) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
    if (y <= 18) G.set(bx + 10 + x, y, bz + z, y === 18 ? 0xd0ffd8 : 0x6aff8a);
    else GL.set(bx + 10 + x, y, bz + z, 1);
  }
  fx.drip = [bx + 10, 26, bz];
  // blueprint sheet unrolled with a mug and a stapler holding the corners
  R.box(-37, 16, -41, -26, 16, -39, (x, y, z) => ((x + z) % 4 === 0 || z === -40 ? 0xd8e8ff : 0x3a6ab8));
  R.box(-38, 17, -42, -38, 17, -39, 0xd8e8ff); R.box(-38, 16, -42, -38, 16, -39, 0x3a6ab8);
  R.box(-28, 17, -40, -27, 18, -40, 0xd8322a); R.set(-26, 17, -40, 0xd8322a);
  // microscope
  R.box(-22, 16, -46, -19, 16, -44, BLACK);
  R.box(-21, 17, -47, -21, 23, -47, 0x3a3a44); R.box(-21, 23, -47, -21, 23, -44, 0x3a3a44);
  R.box(-21, 20, -45, -20, 25, -45, 0xe8e8ec); R.set(-21, 26, -45, BLACK); R.box(-22, 19, -46, -19, 19, -44, 0x5a5a64);
  fx.dna = [-27, 16, -45];
}

// ---------------------------------------------------------------- chalkboard
function buildChalkboard(R) {
  const x0 = -46, x1 = -18, y0 = 30, y1 = 52;
  R.box(x0, y0, -50, x1, y1, -49, (x, y) => (x === x0 || x === x1 || y === y0 || y === y1 ? 0x8a5a30 : null));
  const chalk = 0xe6ebe0, pinkC = 0xf2a0b8, yel = 0xf2e08a;
  const board = (x, y) => {
    const n = hash2(Math.floor(x / 3), Math.floor(y / 2), 9);
    return n < 0.12 ? 0x3c5446 : n < 0.3 ? 0x33493c : 0x2c4034;
  };
  for (let x = x0 + 1; x < x1; x++) for (let y = y0 + 1; y < y1; y++) R.set(x, y, -50, board(x, y));
  const paint = (u, v, c) => { const x = x0 + 1 + u, y = y1 - 1 - v; if (x > x0 && x < x1 && y > y0 && y < y1) R.set(x, y, -50, c); };
  // "BEARS"
  eachTextPixel('BEARS', (u, v) => paint(2 + u, 1 + v, chalk));
  for (let u = 1; u <= 20; u++) if (u % 5 !== 0) paint(u, 7, chalk);
  // bear doodle
  const bear = ['#...#', '#####', '#.#.#', '#####', '.###.'];
  bear.forEach((row, v) => [...row].forEach((ch, u) => ch === '#' && paint(21 + u, 1 + v, 0xd8b890)));
  // arrow + $$$ (circled)
  eachTextPixel('→', (u, v) => paint(2 + u, 10 + v, chalk));
  eachTextPixel('$$$', (u, v) => paint(10 + u, 10 + v, yel));
  for (let a = 0; a < 40; a++) {
    const t = (a / 40) * Math.PI * 2;
    paint(Math.round(15 + Math.cos(t) * 7.5), Math.round(12 + Math.sin(t) * 4), pinkC);
  }
  // small print: fish + bear = money, with a scribbled underline
  eachTextPixel('FISH+', (u, v) => paint(1 + u, 16 + v, chalk));
  eachTextPixel('!!', (u, v) => paint(22 + u, 16 + v, pinkC));
  // chalk tray, chalk and an eraser
  R.box(x0 + 1, y0 - 1, -49, x1 - 1, y0 - 1, -47, 0x7a4c2c);
  R.box(-40, y0, -48, -38, y0, -48, 0xf4f4ee); R.box(-35, y0, -47, -34, y0, -47, 0xf2a0b8);
  R.box(-26, y0, -48, -22, y0, -47, 0x5a5a60); R.box(-26, y0 + 1, -48, -22, y0 + 1, -47, 0xb08050);
  // blueprint pinned beside the board
  R.box(-44, 54, -50, -36, 62, -50, (x, y) => ((x + y) % 5 === 0 || x === -44 || y === 62 ? 0xd8e8ff : 0x3a6ab8));
  R.line(-43, 55, -50, -38, 60, -50, 0xd8e8ff); R.box(-41, 56, -50, -39, 58, -50, 0xd8e8ff);
  R.set(-40, 62, -49, 0xe03030); R.set(-37, 62, -49, 0xe03030);
}

// ---------------------------------------------------------------- wall clock
function buildClock(R) {
  const cx = -13, x0 = -16, x1 = -10;
  R.box(x0, 34, -50, x1, 58, -49, (x, y) => (x === x0 || x === x1 || y === 34 || y === 58 || y === 48 ? 0x6a3a22 : 0x8a4c2a));
  R.box(x0 + 1, 35, -49, x1 - 1, 47, -49, null); // pendulum window (open)
  R.box(x0 + 1, 35, -50, x1 - 1, 47, -50, 0x3a2418);
  R.box(x0 - 1, 58, -50, x1 + 1, 59, -48, 0x6a3a22); R.set(cx, 60, -49, 0x6a3a22);
  // clock face
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (dx * dx + dy * dy <= 5) R.set(cx + dx, 53 + dy, -48, 0xf2e8cc);
  R.set(cx, 54, -47, BLACK); R.set(cx, 55, -47, BLACK); R.set(cx + 1, 53, -47, BLACK); R.set(cx, 53, -47, 0xc8322a);
  R.box(x0 - 1, 33, -50, x1 + 1, 33, -48, 0x6a3a22);
}

// ---------------------------------------------------------------- window
function buildWindow(R, GL) {
  const wx0 = 0, wx1 = 25, wy0 = 34, wy1 = 55;
  for (let x = wx0; x <= wx1; x++) for (let y = wy0; y <= wy1; y++) for (let z = -54; z <= -51; z++) R.set(x, y, z, null);
  const FR = 0xefe4cc, FRD = 0xcfc2a6;
  // jambs, head, trim
  for (let z = -54; z <= -51; z++) {
    for (let y = wy0 - 1; y <= wy1 + 1; y++) { R.set(wx0 - 1, y, z, FRD); R.set(wx1 + 1, y, z, FRD); }
    for (let x = wx0 - 1; x <= wx1 + 1; x++) { R.set(x, wy0 - 1, z, FRD); R.set(x, wy1 + 1, z, FRD); }
  }
  R.box(wx0 - 3, wy0 - 3, -50, wx1 + 3, wy1 + 3, -50, (x, y) => (x >= wx0 - 1 && x <= wx1 + 1 && y >= wy0 - 1 && y <= wy1 + 1 ? null : FR));
  R.box(wx0 - 3, wy1 + 3, -49, wx1 + 3, wy1 + 3, -49, FR); // head trim lip
  // mullions + glass
  for (let x = wx0; x <= wx1; x++) for (let y = wy0; y <= wy1; y++) {
    const mull = x === 12 || x === 13 || y === 44 || y === 45;
    if (mull) R.set(x, y, -53, FR);
    else GL.set(x, y, -53, 1);
  }
  // sill (deep, holds stuff)
  R.box(wx0 - 4, wy0 - 3, -50, wx1 + 4, wy0 - 2, -44, (x, y, z) => (y === wy0 - 2 ? FR : FRD));
  R.box(wx0, wy0 - 1, -52, wx1, wy0 - 1, -50, FRD);
  // curtains: buffalo check, tied back
  const plaid = (x, y) => {
    const a = ((x % 4) + 4) % 4 < 2, b = ((y % 4) + 4) % 4 < 2;
    return a && b ? 0x2a1418 : a || b ? 0x8a1e24 : 0xc42c30;
  };
  const curtain = (xa, xb, dir) => {
    for (let y = 29; y <= 60; y++) {
      let lo = xa, hi = xb;
      if (y >= 39 && y <= 42) { if (dir < 0) hi = xb - 2; else lo = xa + 2; }
      else if (y < 39) { const k = Math.round((39 - y) / 5); if (dir < 0) hi = xb - 2 + k; else lo = xa + 2 - k; }
      for (let x = lo; x <= hi; x++) {
        const fold = (x + (dir < 0 ? 0 : 1)) % 2 === 0 ? -48 : -47;
        R.set(x, y, fold, plaid(x, y));
        R.set(x, y, -48, plaid(x, y));
      }
    }
    // tie-back band
    for (let x = xa; x <= xb; x++) R.set(x, 40, -46, 0xe8d8b0);
  };
  curtain(-8, -2, -1);
  curtain(27, 33, 1);
  // brass rod + finials
  R.box(-10, 61, -47, 35, 61, -47, 0xd4a444);
  R.box(-12, 60, -48, -11, 62, -46, GOLD_D); R.box(36, 60, -48, 37, 62, -46, GOLD_D);
  R.box(-9, 62, -50, -9, 62, -48, 0x8a6a3a); R.box(34, 62, -50, 34, 62, -48, 0x8a6a3a);
  // things on the sill: a tiny cactus and a jar of coins
  R.box(2, 33, -49, 4, 34, -47, 0xc86a3a); R.box(3, 35, -48, 3, 38, -48, 0x4a9a4a); R.set(2, 37, -48, 0x4a9a4a); R.set(3, 39, -48, 0xff9ac8);
  for (let y = 33; y <= 36; y++) for (const [x, z] of [[21, -48], [22, -48], [21, -47], [22, -47]]) (y <= 35 ? R.set(x, y, z, y === 35 ? GOLD_L : GOLD) : GL.set(x, y, z, 1));
  R.box(21, 37, -48, 22, 37, -47, 0x8a5a30);
}

// ---------------------------------------------------------------- scheme wall
function buildCorkboard(R) {
  const x0 = 36, x1 = 67, y0 = 22, y1 = 44;
  R.box(x0, y0, -50, x1, y1, -49, (x, y) => (x === x0 || x === x1 || y === y0 || y === y1 ? 0x8a5a30 : null));
  for (let x = x0 + 1; x < x1; x++) for (let y = y0 + 1; y < y1; y++) {
    const h = hash2(x, y, 41);
    R.set(x, y, -50, h < 0.18 ? 0xb3834c : h > 0.85 ? 0xd8ac72 : 0xc8995e);
  }
  const Z = -49;
  const P = (u, v, c) => R.set(x0 + 1 + u, y1 - 1 - v, Z, c);
  const rect = (u0, v0, u1, v1, c) => { for (let u = u0; u <= u1; u++) for (let v = v0; v <= v1; v++) P(u, v, c); };
  const sprite = (u0, v0, rows, pal) => rows.forEach((row, v) => [...row].forEach((ch, u) => { if (pal[ch] != null) P(u0 + u, v0 + v, pal[ch]); }));
  // polaroid 1: office bear with a tie
  rect(1, 1, 8, 9, 0xf4f0e6);
  sprite(2, 2, ['######', '#b..b#', 'bbbbbb', 'bebbeb', '.bnnb.', '.wrrw.'], { '#': 0x8ac4e8, b: 0x8a5a34, e: BLACK, n: 0xc8a070, w: 0xf4f4f4, r: 0xc8322a, '.': 0x8ac4e8 });
  // polaroid 2: hard-hat bear
  rect(11, 2, 18, 10, 0xf4f0e6);
  sprite(12, 3, ['.yyyy.', 'yyyyyy', 'bbbbbb', 'bebbeb', '.bnnb.', '.oooo.'], { y: 0xf2c230, b: 0x6a4428, e: BLACK, n: 0xb89060, o: 0xe07a2a, '.': 0xa8d8a0 });
  // polaroid 3: the polar bear CEO, circled in red
  rect(21, 1, 28, 9, 0xf4f0e6);
  sprite(22, 2, ['.g..g.', 'gwwwwg', 'wwwwww', 'wewwew', '.wnnw.', '.kkkk.'], { g: 0x5a6a7a, w: 0xf8f8f4, e: BLACK, n: 0x2a2a2a, k: 0x2a2a3a, '.': 0x5a6a7a });
  for (let a = 0; a < 28; a++) { const t = (a / 28) * Math.PI * 2; P(Math.round(24.5 + Math.cos(t) * 5), Math.round(5 + Math.sin(t) * 5.2), 0xe02a2a); }
  // map of the pond with an X
  rect(2, 12, 11, 19, 0x7aa850);
  sprite(3, 13, ['..wwww..', '.wwwwww.', 'wwwwwwww', '.wwwxww.', '..wwww..', '...ww...'], { w: 0x4a8ac8, x: 0xe02a2a });
  // WANTED poster
  rect(14, 12, 20, 20, 0xe8d49c);
  sprite(15, 13, ['#####', '.....', 'b...b', 'bbbbb', 'bebeb', 'bbnbb', '..$..'], { '#': 0x6a3a1a, b: 0x8a5a34, e: BLACK, n: 0x3a2a1a, $: 0x2a7a3a });
  // sticky notes
  rect(23, 13, 27, 17, 0xffe066); P(24, 14, 0x3a3a3a); P(25, 14, 0x3a3a3a); P(26, 15, 0x3a3a3a); P(24, 16, 0x3a3a3a);
  rect(24, 18, 28, 20, 0xff9ac0); P(25, 19, 0x3a3a3a); P(27, 19, 0x3a3a3a);
  // pins + red string
  const pins = [[4.5, 1, 0xe03030], [14.5, 2, 0x3060e0], [24.5, 1, 0xf0c020], [6, 12, 0x30b040], [17, 12, 0xe03030], [25, 13, 0x3060e0]];
  const pinXYZ = pins.map(([u, v, c]) => { const x = x0 + 1 + Math.round(u), y = y1 - 1 - v; R.set(x, y, -48, c); return [x, y]; });
  const string = (a, b) => {
    const [xa, ya] = pinXYZ[a], [xb, yb] = pinXYZ[b];
    const n = Math.max(Math.abs(xb - xa), Math.abs(yb - ya));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const sag = Math.sin(t * Math.PI) * 1.2;
      R.set(Math.round(xa + (xb - xa) * t), Math.round(ya + (yb - ya) * t - sag), -48, 0xd42a2a);
    }
  };
  string(0, 1); string(1, 2); string(0, 3); string(3, 4); string(4, 2); string(4, 5); string(1, 4);
}

function buildPortrait(R) {
  // "EMPLOYEE OF THE MONTH" portrait of Reynard in a chunky gold frame
  const x0 = 44, x1 = 59, y0 = 53, y1 = 74;
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const ring = Math.min(x - x0, x1 - x, y - y0, y1 - y);
    if (ring > 1) continue;
    R.set(x, y, -50, GOLD_D); R.set(x, y, -49, ring === 0 ? GOLD : GOLD_L); if (ring === 0) R.set(x, y, -48, (x + y) % 3 === 0 ? GOLD_L : GOLD);
  }
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) R.box(x - 1, y - 1, -48, x + 1, y + 1, -47, GOLD);
  R.box(Math.round((x0 + x1) / 2) - 1, y1 + 1, -49, Math.round((x0 + x1) / 2) + 1, y1 + 2, -48, GOLD); // crest
  const art = [
    '............',
    '....kkkk....',
    '....kkkk....',
    '....kkkk....',
    '...ggggggg..',
    '..kkkkkkkkk.',
    '..o.......o.',
    '..oo.....oo.',
    '..ooooooooo.',
    '..oyeooyeoo.',
    '..ooooooooM.',
    '..cconnocc..',
    '...cc##cc...',
    '....cccc....',
    '...prrrrp...',
    '..pppwwppp..',
    '.ppppwwpppp.',
    '.pppppppppp.',
  ];
  const pal = { k: 0x16161a, g: GOLD, o: 0xe0662a, c: 0xf6ead8, y: 0xf2c230, e: BLACK, n: 0x1a1420, '#': 0x2a1a20, M: 0xf0d050, p: 0x5a2a6a, r: 0xd8302a, w: 0xf4f0e6 };
  art.forEach((row, v) => [...row].forEach((ch, u) => {
    const x = x0 + 2 + u, y = y1 - 2 - v;
    if (x >= x1 - 1 || y <= y0 + 1) return;
    R.set(x, y, -50, pal[ch] ?? mix(0x2a4a44, 0x3a6a5a, v / art.length));
  }));
  // brass plaque (text drawn on a small canvas plane in buildLab)
  R.box(45, 49, -49, 58, 51, -49, 0xb88a3a);
  R.box(44, 49, -50, 59, 51, -50, 0x7a5a2a);
}

// ---------------------------------------------------------------- trophies
function buildTrophyShelf(R, GL) {
  R.box(-6, 64, -50, 31, 64, -46, 0x7a4c2c);
  R.box(-6, 63, -46, 31, 63, -46, 0x6a4226);
  for (const x of [-3, 28]) { R.box(x, 61, -50, x, 63, -49, 0x6a4226); R.set(x, 62, -48, 0x6a4226); }
  // gold cup
  R.box(-2, 65, -49, 2, 66, -47, 0x3a2418); R.box(-1, 67, -48, 1, 67, -48, GOLD_D); R.set(0, 68, -48, GOLD);
  R.box(-2, 69, -49, 2, 72, -47, (x, y) => (y === 72 ? GOLD_L : GOLD)); R.box(-1, 72, -48, 1, 72, -48, 0x8a6a1a);
  R.set(-3, 71, -48, GOLD); R.set(-3, 70, -48, GOLD); R.set(3, 71, -48, GOLD); R.set(3, 70, -48, GOLD);
  // #1 star trophy
  R.box(5, 65, -49, 8, 66, -47, 0x2a2a3a); R.box(6, 67, -48, 7, 69, -48, STEEL_L);
  const star = ['..#..', '.###.', '#####', '.###.', '.#.#.'];
  star.forEach((row, v) => [...row].forEach((ch, u) => ch === '#' && R.set(4 + u, 74 - v, -48, GOLD)));
  // golden fish award
  R.box(11, 65, -49, 17, 66, -47, 0x3a2418); R.box(14, 67, -48, 14, 67, -48, GOLD_D);
  R.box(12, 68, -48, 16, 70, -48, GOLD); R.box(13, 71, -48, 15, 71, -48, GOLD); R.set(17, 69, -48, GOLD); R.set(18, 70, -48, GOLD_L); R.set(18, 68, -48, GOLD_L);
  R.set(12, 69, -47, BLACK); R.set(11, 69, -48, GOLD_L);
  // snow globe with a tiny cabin
  R.box(20, 65, -49, 23, 65, -47, 0x6a3a22);
  for (let x = -2; x <= 1; x++) for (let y = 0; y <= 3; y++) for (let z = -2; z <= 1; z++) {
    if ((x + 0.5) ** 2 + (y - 1.5) ** 2 + (z + 0.5) ** 2 > 4.2) continue;
    GL.set(22 + x, 66 + y, -48 + z, 1);
  }
  R.set(21, 66, -48, 0xf4f4f8); R.set(22, 66, -48, 0xf4f4f8); R.set(21, 67, -48, 0x8a5a30); R.set(22, 67, -48, 0xc8322a);
  // little gold coin pile
  R.box(25, 65, -49, 27, 65, -47, GOLD); R.box(26, 66, -48, 27, 66, -48, GOLD_L);
}

// ---------------------------------------------------------------- desk
const DESK = { x0: -9, x1: 33, z0: -50, z1: -26, top: 15 }; // top surface at y = 16
function buildDesk(R, G, fx) {
  const { x0, x1, z0, z1, top } = DESK;
  R.box(x0, top - 1, z0, x1, top, z1, (x, y, z) => (z === z1 || x === x0 || x === x1 ? (y === top ? DESKEDGE : DESKSIDE) : y === top ? DESKWOOD : DESKSIDE));
  R.box(x0, top - 2, z1, x1, top - 2, z1, DESKSIDE); // apron
  // centre drawer
  R.box(1, 11, z1, 19, 12, z1, 0x7a4a2c); R.box(1, 11, z1, 19, 11, z1, 0x6a3e24); R.set(10, 12, z1 + 1, GOLD);
  for (const [x, z] of [[x0, z0 + 1], [x0, z1 - 1], [x1 - 1, z0 + 1]]) R.box(x, 0, z, x + 1, top - 2, z + 1, DESKSIDE);
  // wood grain streaks on the desk top
  for (let x = x0 + 1; x < x1; x++) for (let z = z0; z < z1; z++) if (hash2(Math.floor(x / 5), z, 19) < 0.08) R.set(x, top, z, shade(DESKWOOD, 0.9));
  // PC tower under the left side
  R.box(-7, 0, -40, -1, 12, -27, (x, y, z) => (x === -1 && y % 2 === 0 && z < -30 ? BEIGE_D : y === 12 ? BEIGE_D : BEIGE));
  R.box(-6, 10, -26, -2, 10, -26, 0x2a2a2a); R.box(-6, 8, -26, -2, 8, -26, BEIGE_D); R.box(-5, 8, -26, -3, 8, -26, 0xa89c80);
  R.box(-5, 3, -26, -4, 4, -26, BEIGE_DD); R.set(-5, 5, -26, 0x2a2a2a);
  fx.leds.push({ pos: [-3, 5, -26], color: 0x5aff6a, mode: 'steady' }, { pos: [-2, 5, -26], color: 0xffa030, mode: 'disk' });
  // mini fridge under the right side
  const FR = 0xa8dcc4, FRD = 0x86bca4;
  R.box(21, 0, -40, 32, 13, -27, (x, y, z) => (y === 0 ? 0x5a6a64 : y === 13 || x === 21 || x === 32 ? FRD : FR));
  R.box(22, 1, -26, 31, 12, -26, (x, y) => (y === 10 ? FRD : FR)); // door
  R.box(30, 3, -25, 30, 8, -25, STEEL_L); R.set(30, 11, -25, STEEL_L);
  R.box(23, 7, -25, 25, 8, -25, 0xf4f0e6); R.set(23, 8, -24, 0xe03030); R.box(23, 7, -25, 25, 7, -25, 0xe03030); // KEEP OUT note
  R.set(27, 5, -25, 0xf08a2a); R.set(28, 5, -25, 0xf08a2a); R.set(26, 5, -25, 0xffffff); // fish magnet
  R.set(24, 3, -25, 0x3a8ae0); R.set(25, 3, -25, 0x3a8ae0);
  // ---- things on the desk (surface y = 16)
  // ramen cup: styrofoam, peeled lid, noodles, chopsticks
  const rx = -5, rz = -30;
  for (let y = 16; y <= 20; y++) R.cylinder(rx, y, rz, y < 18 ? 1.8 : 2.2, 1, y === 18 ? 0xd8322a : y === 20 ? 0xf6f2ea : 0xeee8dc);
  R.box(rx - 1, 20, rz - 1, rx + 1, 20, rz + 1, 0xe8b64a); R.set(rx, 20, rz, 0xf2c860); R.set(rx + 1, 21, rz, 0xe8b64a); R.set(rx - 1, 20, rz, 0x8a5a2a);
  R.box(rx - 2, 21, rz - 3, rx + 2, 21, rz - 3, 0xe8e0c8); R.box(rx - 2, 22, rz - 3, rx + 1, 22, rz - 3, 0xd8322a); // peeled lid
  R.line(rx, 20, rz + 1, rx + 3, 28, rz + 3, 0xc8a070); R.line(rx + 1, 20, rz + 1, rx + 4, 28, rz + 2, 0xb89060);
  fx.ramen = [rx, 22, rz];
  // energy drinks: two standing, one crushed
  const can = (x, z, body, band) => {
    for (let y = 16; y <= 20; y++) R.box(x, y, z, x + 1, y, z + 1, y === 20 ? STEEL_L : y === 18 ? band : body);
    R.set(x, 21, z, STEEL); R.set(x + 1, 21, z + 1, STEEL_D);
  };
  can(14, -48, 0x2a4ac8, 0xe8e8f0);
  can(17, -47, 0x9ae02a, 0x1a1a1a);
  can(19, -49, 0x2a4ac8, 0xd8322a);
  R.box(23, 16, -33, 25, 16, -32, 0x2a4ac8); R.set(24, 17, -33, 0x2a4ac8); R.set(25, 16, -33, STEEL_L); R.set(23, 17, -32, 0xe8e8f0);
  // coffee mug with a fox face
  R.cylinder(29, 16, -31, 1.6, 4, 0xf4f0e6); R.box(28, 19, -32, 30, 19, -30, 0x4a2a1a);
  R.set(29, 18, -29, 0xe0662a); R.set(28, 18, -29, 0xe0662a); R.set(30, 18, -29, 0xe0662a); R.set(29, 17, -29, 0xf6ead8);
  R.box(31, 17, -31, 31, 18, -31, 0xf4f0e6); R.set(32, 17, -31, 0xf4f0e6); R.set(32, 18, -31, 0xf4f0e6);
  fx.mug = [29, 20, -31];
  // bowl of blueberries
  for (let y = 16; y <= 18; y++) R.cylinder(18, y, -30, y === 16 ? 1.5 : 2.4, 1, y === 18 ? 0x3a78b0 : 0x4a8ac8);
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (x * x + z * z <= 4.5) R.set(18 + x, 19, -30 + z, hash2(x, z, 3) < 0.5 ? 0x3a4ad0 : 0x5a6ae8);
  R.set(18, 20, -30, 0x4a5ad8); R.set(17, 20, -31, 0x2e3aa8); R.set(19, 20, -29, 0x6a7af0);
  R.set(21, 16, -27, 0x3a4ad0); R.set(15, 16, -28, 0x5a6ae8); // escaped berries
  // stack of papers + TOP SECRET folder
  R.box(24, 16, -44, 29, 18, -38, (x, y) => (y === 18 ? PAPER : PAPER_D));
  R.box(23, 19, -43, 28, 19, -38, 0xc8a050); R.box(24, 19, -41, 27, 19, -40, 0xd8322a);
  // desk lamp (anglepoise) at the back right
  R.cylinder(30, 16, -46, 2.4, 1, 0x3a2a4a); R.set(30, 17, -46, 0x2a1a3a);
  R.line(30, 17, -46, 29, 31, -46, 0x5a2a6a, 0); R.line(30, 17, -45, 29, 31, -45, 0x4a2258, 0);
  R.box(28, 31, -46, 29, 32, -45, GOLD_D); // joint
  R.line(28, 32, -46, 21, 36, -42, 0x5a2a6a, 0); R.line(28, 32, -45, 21, 36, -41, 0x4a2258, 0);
  // shade (cone pointing down-left)
  for (let y = 0; y <= 4; y++) {
    const r = 1 + y * 0.7;
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
      const d = x * x + z * z;
      if (d > r * r + 0.3) continue;
      if (y > 0 && d < (r - 1) * (r - 1)) continue;
      R.set(20 + x, 36 - y, -41 + z, y === 0 ? 0x4a2258 : 0x6a3a8c);
    }
  }
  fx.lampBulb = [20, 32, -41];
}

// ---------------------------------------------------------------- cot
const COT = { x0: 38, x1: 68, z0: -50, z1: -34 };
function buildCot(R, fx) {
  const { x0, x1, z0, z1 } = COT;
  const WD = 0x8a5634, WDL = 0xa06840;
  for (const [x, z] of [[x0, z1 - 1], [x1 - 1, z1 - 1], [x0, z0], [x1 - 1, z0]]) R.box(x, 0, z, x + 1, 5, z + 1, WD);
  R.box(x0, 4, z1, x1, 5, z1, WDL); R.box(x0, 4, z0, x1, 5, z0 + 1, WDL);
  R.box(x0, 4, z0, x0 + 1, 5, z1, WDL);
  // headboard with a carved fish
  R.box(x1 - 1, 0, z0, x1, 17, z1, (x, y, z) => (y === 17 || z === z0 || z === z1 ? WDL : y > 6 && (z - z0) % 4 === 0 ? WDL : WD));
  R.box(x1 - 2, 12, -45, x1 - 2, 14, -40, 0xc08a50); R.set(x1 - 2, 13, -39, 0xc08a50); R.set(x1 - 2, 12, -38, 0xc08a50); R.set(x1 - 2, 14, -38, 0xc08a50);
  // mattress
  R.box(x0 + 1, 6, z0 + 1, x1 - 2, 7, z1 - 1, (x, y, z) => ((z % 3 === 0) ? 0xa8b4c8 : 0xece6d8));
  // pillow + nightcap
  R.box(x1 - 9, 8, z0 + 2, x1 - 2, 10, z1 - 3, (x, y, z) => (y === 10 && z > z0 + 3 && z < z1 - 4 ? 0xe8e2d8 : 0xf6f2ea));
  R.set(x1 - 6, 11, -44, 0xf6f2ea); R.set(x1 - 5, 11, -41, 0xf6f2ea);
  // patchwork quilt (covers the foot end and hangs over the front edge)
  const patches = [0xc84a3a, 0xe0a838, 0x3a8a8a, 0x7a4a9a, 0xf0e4c8, 0x6a9a4a, 0xd87a8a, 0x4a6aa8];
  const quilt = (x, z) => {
    const px = Math.floor((x - x0) / 4), pz = Math.floor((z - z0) / 4);
    const edge = (x - x0) % 4 === 0 || (z - z0) % 4 === 0;
    const c = patches[Math.floor(hash2(px, pz, 12) * patches.length)];
    if (edge) return shade(c, 0.8);
    if (c === 0xf0e4c8 && (x + z) % 2 === 0) return 0xd8322a; // polka patch
    return c;
  };
  for (let x = x0 + 1; x <= x1 - 10; x++) {
    for (let z = z0 + 1; z <= z1; z++) R.set(x, 8, z, quilt(x, z));
    for (let y = 3; y <= 8; y++) R.set(x, y, z1 + 1, quilt(x, z1 + 1 + (8 - y)));
  }
  // a fold of the quilt near the pillow
  R.box(x1 - 11, 9, z0 + 1, x1 - 10, 9, z1, 0xf0e4c8);
  // plush teddy bear at the foot (a little ironic)
  const tx = x0 + 4, tz = -43;
  R.ellipsoid(tx, 11, tz, 2.4, 2.4, 2, 0xa0703a);
  R.ellipsoid(tx, 15, tz + 0.5, 2, 1.8, 1.8, 0xa0703a);
  R.set(tx - 2, 17, tz, 0xa0703a); R.set(tx + 2, 17, tz, 0xa0703a); R.set(tx - 2, 17, tz + 1, 0x7a5028); R.set(tx + 2, 17, tz + 1, 0x7a5028);
  R.box(tx - 1, 14, tz + 2, tx + 1, 14, tz + 2, 0xd8b890); R.set(tx, 15, tz + 3, BLACK);
  R.set(tx - 1, 16, tz + 2, BLACK); R.set(tx + 1, 16, tz + 2, BLACK);
  R.box(tx - 1, 13, tz + 2, tx + 1, 13, tz + 2, 0xd8322a); // bow
  R.set(tx + 1, 11, tz + 2, 0x6a9a4a); // patch
  R.set(tx - 3, 11, tz + 1, 0xa0703a); R.set(tx + 3, 11, tz + 1, 0xa0703a);
  // fuzzy plaid slippers on the floor
  for (const sx of [44, 50]) R.box(sx, 0, -31, sx + 3, 1, -27, (x, y, z) => (y === 1 && z > -30 ? 0xf6ead8 : (x + z) % 2 ? 0xc42c30 : 0x2a1418));
  fx.bed = [W((x0 + x1) / 2 + 2), W(9), W((z0 + z1) / 2)];
}

// ---------------------------------------------------------------- aquarium
const TANK = { x0: 41, x1: 64, z0: 7, z1: 18, y0: 12, y1: 25 };
function buildTank(R, G, WT, fx) {
  const { x0, x1, z0, z1, y0, y1 } = TANK;
  // cabinet stand
  R.box(x0 - 1, 0, z0 - 1, x1 + 1, 10, z1 + 1, (x, y, z) => (y === 0 ? 0x4a2e1a : z === z1 + 1 && (x === 52 || x === 53) ? 0x5a3a22 : 0x7a4a2a));
  R.box(x0 - 2, 11, z0 - 2, x1 + 2, 11, z1 + 2, 0x8a5634);
  R.set(50, 6, z1 + 2, GOLD); R.set(55, 6, z1 + 2, GOLD);
  R.box(x0 + 1, 2, z1 + 2, 51, 9, z1 + 2, (x, y) => (y === 2 || y === 9 || x === x0 + 1 || x === 51 ? 0x6a3e22 : null));
  R.box(54, 2, z1 + 2, x1 - 1, 9, z1 + 2, (x, y) => (y === 2 || y === 9 || x === 54 || x === x1 - 1 ? 0x6a3e22 : null));
  // black frame
  const FRM = 0x2a2a30;
  for (const x of [x0, x1]) for (const z of [z0, z1]) R.box(x, y0, z, x, y1, z, FRM);
  R.box(x0, y0, z0, x1, y0, z1, FRM);
  R.box(x0, y1, z0, x1, y1, z0, FRM); R.box(x0, y1, z1, x1, y1, z1, FRM);
  R.box(x0, y1, z0, x0, y1, z1, FRM); R.box(x1, y1, z0, x1, y1, z1, FRM);
  // hood with a light strip underneath
  R.box(x0, y1 + 1, z0, x1, y1 + 1, z0 + 5, 0x34343c);
  G.box(x0 + 2, y1, z0 + 2, x1 - 2, y1, z0 + 3, 0xd8f4ff);
  // gravel
  const grav = [0xd8c090, 0xc8b080, 0xe0cca0, 0xd0b888, 0xd8c090, 0xc8b080, 0xe07050, 0x5a8ac0, 0xf0e0b0];
  for (let x = x0 + 1; x < x1; x++) for (let z = z0 + 1; z < z1; z++) {
    R.set(x, y0 + 1, z, pick(grav.slice(0, 6), hash2(x, z, 21)));
    if (hash2(x, z, 22) < 0.3) R.set(x, y0 + 2, z, hash2(z, x, 24) < 0.25 ? pick(grav.slice(6), hash2(z, x, 23)) : pick(grav.slice(0, 6), hash2(z, x, 23)));
  }
  // treasure chest spilling coins, air stone, a rock arch
  const cx = 56, cz = 12;
  R.box(cx - 2, y0 + 2, cz - 1, cx + 2, y0 + 4, cz + 1, (x, y) => (y === y0 + 4 ? GOLD_D : 0x6a3e22));
  R.box(cx - 2, y0 + 5, cz - 2, cx + 2, y0 + 7, cz - 2, 0x7a4a2a); R.box(cx - 2, y0 + 7, cz - 2, cx + 2, y0 + 7, cz - 2, GOLD_D);
  G.box(cx - 1, y0 + 4, cz, cx + 1, y0 + 4, cz, 0xffe070); G.set(cx, y0 + 5, cz - 1, 0x7affe0);
  R.set(cx + 3, y0 + 2, cz + 1, GOLD); R.set(cx + 4, y0 + 2, cz + 2, GOLD); R.set(cx + 3, y0 + 2, cz + 3, GOLD_L);
  R.box(61, y0 + 2, 15, 62, y0 + 2, 16, 0x8a8a90);
  R.box(44, y0 + 2, 9, 45, y0 + 6, 10, 0x9a8a7a); R.box(49, y0 + 2, 9, 50, y0 + 6, 10, 0x8a7a6a); R.box(44, y0 + 7, 9, 50, y0 + 8, 10, 0x9a8a7a);
  R.set(47, y0 + 8, 10, 0x6a9a4a); R.set(45, y0 + 9, 9, 0x5a8a3a);
  // water volume (transparent, gently glowing)
  for (let x = x0 + 1; x < x1; x++) for (let z = z0 + 1; z < z1; z++) for (let y = y0 + 1; y <= y1 - 2; y++) {
    if (R.has(x, y, z)) continue;
    WT.set(x, y, z, y === y1 - 2 ? 0x9ae4f4 : mix(0x1e7a9a, 0x3aa8c8, (y - y0) / (y1 - y0)));
  }
  fx.tank = { x0: W(x0 + 2), x1: W(x1 - 1), y0: W(y0 + 4), y1: W(y1 - 3), z0: W(z0 + 2), z1: W(z1 - 1), stone: [W(61.5), W(y0 + 3), W(15.5)], surface: W(y1 - 1) };
  // fish food shaker on the corner of the cabinet
  R.box(x1, 12, z1 + 1, x1 + 1, 15, z1 + 2, (x, y) => (y === 15 ? 0xd8322a : 0xf2c230));
}

// ---------------------------------------------------------------- greed corner
function buildTreasure(R, fx) {
  // safe
  const x0 = -68, x1 = -55, z0 = 16, z1 = 29;
  const SF = 0x3e5e4e, SFD = 0x2c463a, SFL = 0x547a64;
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) R.set(x, 0, z, 0x1e2a24);
  R.box(x0, 1, z0, x1, 16, z1, (x, y, z) => (y === 16 || x === x0 || x === x1 ? SFL : z === z1 && (y === 2 || y === 15 || x === x0 + 1 || x === x1 - 1) ? SFD : SF));
  R.box(x0 + 2, 3, z1 + 1, x1 - 2, 14, z1 + 1, (x, y) => (x === x0 + 2 || x === x1 - 2 || y === 3 || y === 14 ? SFD : null));
  const dx = -61, dy = 9;
  for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
    const d = a * a + b * b;
    if (d <= 9.5) R.set(dx + a, dy + b, z1 + 1, d > 6 ? STEEL : d > 2 ? STEEL_L : GOLD);
  }
  R.set(dx, dy + 3, z1 + 2, 0xd8322a);
  R.box(x1 - 4, 6, z1 + 1, x1 - 3, 12, z1 + 2, GOLD_D); R.set(x1 - 3, 9, z1 + 3, GOLD);
  for (const y of [4, 13]) R.box(x0 + 1, y, z1 + 1, x0 + 1, y + 1, z1 + 2, 0x1e2a24);
  R.box(x0 + 3, 17, z0 + 3, x1 - 3, 17, z1 - 3, SFD);
  // money bags
  const bag = (cx, cz, r, tipped) => {
    R.ellipsoid(cx, r, cz, r, r, r, (x, y, z) => (y < 0 ? null : hash3(x, y, z, 5) < 0.2 ? 0xd0b07a : 0xe2c48e));
    R.box(cx - 1, 2 * r - 1, cz - 1, cx + 1, 2 * r, cz + 1, 0xa88850);
    R.box(cx - 1, 2 * r + 1, cz - 1, cx + 1, 2 * r + 1, cz + 1, 0xc8a870); R.set(cx, 2 * r + 2, cz, 0xb49464);
    R.box(cx - 1, 2 * r, cz - 1, cx + 1, 2 * r, cz + 1, 0x7a4a2a);
    const f = Math.round(cz + r);
    eachTextPixel('$', (u, v) => R.set(cx - 1 + u, Math.round(r + 2 - v), f, 0x2a6a3a));
    if (tipped) for (let i = 0; i < 7; i++) R.set(cx + 3 + i, 0, cz + r + (i % 3), i % 2 ? GOLD : GOLD_L);
  };
  bag(-50, 24, 4, false);
  bag(-42, 30, 3, true);
  bag(-61, 20, 3, false);
  R.box(-61, 17, 18, -61, 17, 18, 0xa88850);
  // coin stacks
  const stack = (cx, cz, h) => { for (let y = 0; y < h; y++) R.cylinder(cx, y, cz, 1.4, 1, y === h - 1 ? GOLD_L : y % 2 ? GOLD : GOLD_D); };
  stack(-34, 34, 6); stack(-31, 37, 3); stack(-36, 38, 4); stack(-29, 32, 8); stack(-32, 31, 2);
  // gold bars
  R.box(-54, 0, 36, -50, 1, 37, (x, y) => (y === 1 ? GOLD_L : GOLD)); R.box(-53, 2, 36, -50, 2, 37, GOLD_L);
  R.box(-48, 0, 39, -45, 1, 40, (x, y) => (y === 1 ? GOLD_L : GOLD));
  // loose coins
  for (let i = 0; i < 16; i++) {
    const x = -46 + Math.floor(hash2(i, 1, 90) * 22), z = 28 + Math.floor(hash2(i, 2, 90) * 16);
    if (!R.has(x, 0, z)) R.set(x, 0, z, i % 3 ? GOLD : GOLD_L);
  }
  fx.coins = [W(-32), W(8), W(34)];
}

// ---------------------------------------------------------------- tesla coil
function buildTesla(R, G, fx) {
  const cx = -57, cz = -22;
  // black base with brass trim, hazard stripes, a dial and a big lever
  R.box(cx - 5, 0, cz - 5, cx + 5, 4, cz + 5, (x, y, z) => (y === 0 ? ((x + z) % 4 < 2 ? 0x2a2a2a : 0xf2c230) : y === 4 ? GOLD_D : 0x2e2a34));
  for (const [x, z] of [[cx - 5, cz - 5], [cx + 5, cz - 5], [cx - 5, cz + 5], [cx + 5, cz + 5]]) R.set(x, 3, z, GOLD);
  R.box(cx - 4, 1, cz + 6, cx - 2, 3, cz + 6, 0xf2e8cc); R.set(cx - 3, 2, cz + 7, 0xd8322a); R.set(cx - 2, 3, cz + 7, 0xd8322a);
  R.box(cx + 2, 1, cz + 6, cx + 3, 2, cz + 6, 0x3a3a3a); R.line(cx + 2, 2, cz + 7, cx + 4, 6, cz + 8, STEEL_L); R.box(cx + 4, 7, cz + 8, cx + 5, 7, cz + 8, 0xd8322a);
  fx.leds.push({ pos: [cx - 1, 3, cz + 6], color: 0xff4040, mode: 'blink' }, { pos: [cx + 0, 3, cz + 6], color: 0x40ff60, mode: 'blink2' });
  // primary coil: a few fat turns of copper tube around the base of the tower
  for (let y = 5; y <= 8; y++) for (let a = 0; a < 40; a++) {
    const t = (a / 40) * Math.PI * 2;
    if ((y + Math.floor(a / 5)) % 2) continue;
    R.set(Math.round(cx + Math.cos(t) * 4), y, Math.round(cz + Math.sin(t) * 4), y % 2 ? 0xe8a060 : COPPER);
  }
  R.cylinder(cx, 5, cz, 1.6, 3, 0xf0e8d8); // insulator
  // secondary: tall, finely wound copper column
  for (let y = 8; y <= 27; y++) R.cylinder(cx, y, cz, 1.5, 1, y % 2 ? 0xf0aa62 : 0xc27a3c);
  R.cylinder(cx, 28, cz, 0.9, 1, STEEL_D);
  // shiny toroid + crown ball
  for (let x = -7; x <= 7; x++) for (let z = -7; z <= 7; z++) for (let y = -2; y <= 2; y++) {
    const d = Math.hypot(Math.hypot(x, z) - 4.6, y * 1.25);
    if (d <= 2.1) R.set(cx + x, 30 + y, cz + z, y >= 1 ? 0xeef2f6 : y === 0 ? STEEL_L : STEEL);
  }
  R.ellipsoid(cx, 33, cz, 1.5, 1.5, 1.5, 0xeef2f6);
  fx.tesla = [cx, 30, cz];
}

// ---------------------------------------------------------------- floor clutter
function buildClutter(R, fx) {
  // pizza box, open, two slices left
  const px0 = -38, px1 = -24, pz0 = 2, pz1 = 15;
  R.box(px0, 0, pz0, px1, 0, pz1, 0xc8a06a);
  for (let x = px0; x <= px1; x++) { R.set(x, 1, pz1, 0xb89058); R.set(x, 1, pz0, 0xb89058); }
  for (let z = pz0; z <= pz1; z++) { R.set(px0, 1, z, 0xb89058); R.set(px1, 1, z, 0xb89058); }
  for (let x = px0 + 1; x < px1; x++) for (let z = pz0 + 1; z < pz1; z++) R.set(x, 0, z, hash2(x, z, 4) < 0.1 ? 0xb08a50 : 0xd8b880);
  R.box(px0, 1, pz0 - 1, px1, 13, pz0 - 1, (x, y) => (y === 13 || x === px0 || x === px1 ? 0xb89058 : 0xc8a06a)); // lid
  for (let a = 0; a < 24; a++) { const t = (a / 24) * Math.PI * 2; R.set(Math.round(-31 + Math.cos(t) * 4), Math.round(7 + Math.sin(t) * 4), pz0 - 1, 0xd8322a); }
  R.box(-32, 6, pz0 - 1, -30, 8, pz0 - 1, 0xe0662a); R.set(-31, 7, pz0 - 1, BLACK); R.set(-33, 11, pz0 - 1, 0xb08a50); R.set(-27, 3, pz0 - 1, 0xb08a50);
  const slice = (x, z, flip) => {
    for (let i = 0; i < 6; i++) for (let j = 0; j <= Math.floor(i / 2); j++) {
      const xx = flip ? x - i : x + i, z1 = z + j, z2 = z - j;
      const crust = i === 5;
      R.set(xx, 1, z1, crust ? 0xd89040 : 0xf2c850); R.set(xx, 1, z2, crust ? 0xd89040 : 0xf2c850);
    }
    R.set(flip ? x - 2 : x + 2, 2, z, 0xc83a2a); R.set(flip ? x - 4 : x + 4, 2, z + 1, 0xc83a2a);
  };
  slice(-36, 7, false); slice(-26, 11, true);
  R.box(-35, 1, 12, -34, 1, 13, 0xd89040); // crust left behind
  // waste basket, overflowing
  const bx = -14, bz = -20;
  for (let y = 0; y <= 7; y++) for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
    const d = Math.hypot(x, z);
    if (d > 3.2 || (d < 2.2 && y > 0)) continue;
    R.set(bx + x, y, bz + z, (x + y + z) % 2 ? 0xc8a060 : 0xa88040);
  }
  const ball = (x, y, z) => { R.ellipsoid(x, y, z, 1.4, 1.2, 1.4, (a, b, c) => (hash3(a, b, c, 3) < 0.3 ? PAPER_D : PAPER)); };
  ball(bx, 8, bz); ball(bx + 2, 7, bz - 1); ball(bx - 1, 9, bz + 1);
  for (const [x, z] of [[-8, -16], [-19, -12], [4, -8], [-10, -6], [34, -16]]) ball(x, 1, z);
  // crushed cans on the floor
  const crushed = (x, z, c) => { R.box(x, 0, z, x + 2, 0, z + 1, c); R.set(x + 1, 1, z, c); R.set(x + 2, 0, z + 1, STEEL_L); R.set(x, 1, z + 1, shade(c, 1.2)); };
  crushed(-5, -19, 0x2a4ac8); crushed(9, -13, 0x9ae02a); crushed(-22, -8, 0x2a4ac8); crushed(28, 6, 0x9ae02a);
  // standing empties by the desk
  for (const [x, z] of [[-12, -30], [-10, -32]]) for (let y = 0; y <= 4; y++) R.box(x, y, z, x + 1, y, z + 1, y === 4 ? STEEL_L : y === 2 ? 0x1a1a1a : 0x9ae02a);
  // rolled blueprints in a bin
  R.cylinder(-19, 0, -33, 2.2, 6, (x, y) => (y === 5 ? 0x5a3a22 : 0x7a4a2a));
  for (const [x, z, h] of [[-20, -34, 12], [-18, -33, 10], [-19, -32, 13]]) { R.box(x, 6, z, x, h, z, 0x3a6ab8); R.set(x, h + 1, z, 0xd8e8ff); }
  // big potted monstera in the front-right corner
  const ppx = 62, ppz = 38;
  for (let y = 0; y <= 7; y++) R.cylinder(ppx, y, ppz, y >= 6 ? 4.4 : 3.6, 1, y >= 6 ? 0xd8804a : y % 3 === 0 ? 0xb85a2a : 0xc86a3a);
  R.cylinder(ppx, 8, ppz, 3.4, 1, 0x4a3020);
  const leafG = [0x3a8a3a, 0x4a9a44, 0x2e7430];
  const leaf = (ang, len, h) => {
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const ex = ppx + dx * len, ez = ppz + dz * len;
    R.line(ppx, 8, ppz, Math.round(ex), h, Math.round(ez), 0x5a8a3a);
    for (let a = -3; a <= 3; a++) for (let b = -2; b <= 2; b++) {
      if (a * a / 10 + b * b / 4.5 > 1) continue;
      const x = Math.round(ex + dx * a - dz * b * 1.2), z = Math.round(ez + dz * a + dx * b * 1.2);
      const y = h + Math.round(-Math.abs(a) * 0.35 - Math.abs(b) * 0.3);
      if ((b === 1 || b === -1) && a % 2 === 0 && Math.abs(a) > 0) continue; // monstera splits
      R.set(x, y, z, b === 0 ? 0x5aaa4a : pick(leafG, hash3(x, y, z, 2)));
    }
  };
  leaf(-2.3, 6, 26); leaf(-0.9, 7, 22); leaf(0.4, 6, 19); leaf(2.4, 6, 17); leaf(-3.3, 5, 20); leaf(1.4, 5, 24);
  // coat rack in the front-left corner: spare top hat, villain cape, scarf
  {
    const cx = -64, cz = 42;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; R.line(cx, 1, cz, cx + Math.round(Math.cos(a) * 3), 0, cz + Math.round(Math.sin(a) * 3), 0x5a3420); }
    R.box(cx, 1, cz, cx, 34, cz, 0x6a3e24);
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) R.line(cx, 31, cz, cx + dx, 33, cz + dz, 0x5a3420);
    R.box(cx - 1, 35, cz - 1, cx + 1, 35, cz + 1, 0x7a4a2a);
    // top hat hung on a peg
    R.box(cx - 3, 33, cz - 3, cx + 1, 33, cz + 1, 0x16161a); R.box(cx - 2, 34, cz - 2, cx, 38, cz, (x, y) => (y === 34 ? 0x8a2a3a : 0x1c1c22));
    // purple cape with a gold clasp, draped down the pole
    for (let y = 14; y <= 31; y++) {
      const w = 2 + Math.floor((31 - y) / 5);
      for (let x = -w; x <= w; x++) for (let z = -1; z <= 1; z++) {
        if (Math.abs(x) < w && z === 0) continue;
        R.set(cx + x, y, cz + 2 + z + (Math.abs(x) === w ? 0 : 1), y < 16 ? 0xc8322a : (x + y) % 5 === 0 ? 0x4a2258 : 0x5a2a6a);
      }
    }
    R.box(cx - 1, 30, cz + 4, cx + 1, 31, cz + 4, GOLD);
    // striped scarf
    for (let y = 18; y <= 30; y++) R.set(cx + 2, y, cz - 1, Math.floor(y / 2) % 2 ? 0xd8322a : 0xf4f0e6);
    R.set(cx + 3, 18, cz - 1, 0xf4f0e6); R.set(cx + 1, 18, cz - 1, 0xf4f0e6);
  }
  // little space heater by the cot: glowing coils keep the fox toasty
  {
    const hx = 58, hz = -27;
    R.box(hx - 4, 0, hz - 2, hx + 4, 1, hz + 2, 0x3a3a44);
    R.box(hx - 4, 2, hz - 2, hx + 4, 9, hz + 1, (x, y, z) => (y === 9 || x === hx - 4 || x === hx + 4 ? 0xe8e0d0 : 0xd8d0c0));
    R.box(hx - 3, 3, hz + 2, hx + 3, 8, hz + 2, (x, y) => (y % 2 === 0 ? STEEL_D : null)); // grille
    R.set(hx + 3, 10, hz, 0x3a3a44); R.set(hx - 3, 10, hz, 0x3a3a44);
    fx.heater = [hx, 5, hz + 1];
  }
  // sacks of fish food by the aquarium
  {
    const sack = (cx, cz, h, c, label) => {
      for (let y = 0; y < h; y++) for (let x = -3; x <= 3; x++) for (let z = -2; z <= 2; z++) {
        if (Math.abs(x) === 3 && Math.abs(z) === 2) continue;
        if (y === h - 1 && (Math.abs(x) === 3 || Math.abs(z) === 2)) continue;
        R.set(cx + x, y, cz + z, hash3(x, y, z, 17) < 0.15 ? shade(c, 0.88) : c);
      }
      R.box(cx - 1, h, cz - 1, cx + 1, h, cz, shade(c, 0.9)); R.set(cx, h + 1, cz, 0x8a6a40);
      R.box(cx - 2, 2, cz + 2, cx + 2, 5, cz + 2, 0xf4f0e6);
      label.forEach(([u, v, lc]) => R.set(cx - 2 + u, 5 - v, cz + 3, lc));
    };
    const fishLabel = [[1, 1, 0xf08a2a], [2, 1, 0xf08a2a], [3, 1, 0xf08a2a], [0, 1, 0xf08a2a], [4, 0, 0xf08a2a], [4, 2, 0xf08a2a], [2, 2, 0xd8322a]];
    sack(32, 20, 9, 0xc8a870, fishLabel);
    sack(33, 30, 7, 0xb89a68, fishLabel);
  }
  // floor rug (round braided)
  const rcx = 14, rcz = -6, rx = 34, rz = 22;
  const rings = [0x7a3a34, 0xb0584a, 0xd89a5a, 0xe8cfa0, 0xc07a52, 0x8a5a78, 0xb86a50, 0xe0b878];
  for (let x = rcx - rx; x <= rcx + rx; x++) for (let z = rcz - rz; z <= rcz + rz; z++) {
    const d = Math.hypot((x - rcx) / rx, (z - rcz) / rz);
    if (d > 1) continue;
    if (R.has(x, 0, z)) continue;
    const ring = Math.min(rings.length - 1, Math.floor((1 - d) * 7.5));
    let c = rings[ring];
    if (hash3(x, z, ring, 6) < 0.35) c = shade(c, 0.86);
    R.set(x, 0, z, c);
  }
}

// ================================================================== sub-models
function crtModel(lift = 4) {
  // keyboard + mouse sit on the desk (y 0); the monitor stands on two thick
  // encyclopedias (y 0..lift-1) so the fox's head doesn't hide the screen.
  const v = new VoxelModel();
  v.box(-8, 0, -6, 7, 1, 4, (x, y, z) => (z === 4 && y === 0 ? PAPER_D : z === 4 ? PAPER : y === 0 ? 0x2e5a7a : 0x7a2e3a));
  v.box(-8, 0, 4, 7, 0, 4, 0xd8c8a0); v.box(-8, 1, 4, 7, 1, 4, 0xe8dcc0);
  v.box(-7, 2, -5, 6, 3, 3, (x, y, z) => (z === 3 ? (y === 2 ? PAPER : PAPER_D) : 0x3a6a3a));
  v.box(-4, 2, 3, -3, 3, 3, GOLD_D); v.box(-4, 0, 4, -3, 0, 4, GOLD_D);
  const m = new VoxelModel();
  m.box(-5, 0, -5, 5, 0, 3, BEIGE_D); // swivel base
  m.box(-9, 1, 2, 8, 15, 7, (x, y, z) => (y === 15 || y === 1 || x === -9 || x === 8 ? BEIGE_D : BEIGE));
  m.box(-8, 2, -3, 7, 14, 1, BEIGE_D);
  m.box(-6, 3, -8, 5, 12, -4, (x, y, z) => (y === 12 && (x + z) % 2 === 0 ? BEIGE_DD : BEIGE_D));
  for (let x = -7; x <= 6; x += 2) m.set(x, 15, 3, BEIGE_DD); // vents
  // screen recess + bezel
  for (let x = -6; x <= 5; x++) for (let y = 4; y <= 12; y++) { m.set(x, y, 7, null); m.set(x, y, 6, 0x1c241e); }
  for (let x = -7; x <= 6; x++) { m.set(x, 3, 7, 0xb8ac8e); m.set(x, 13, 7, 0xb8ac8e); }
  for (let y = 3; y <= 13; y++) { m.set(-7, y, 7, 0xb8ac8e); m.set(6, y, 7, 0xb8ac8e); }
  // knobs and buttons
  m.set(-6, 2, 8, BEIGE_DD); m.set(-4, 2, 8, BEIGE_DD); m.box(4, 2, 8, 5, 2, 8, 0xa89c80);
  m.set(7, 12, 8, 0xd8c8a0); // brand badge
  // sticky notes on the bezel
  m.box(-9, 13, 8, -7, 15, 8, 0xffe066); m.set(-8, 14, 9, 0x3a3a3a);
  m.box(6, 3, 8, 8, 5, 8, 0xff9ac0); m.set(7, 4, 9, 0x3a3a3a);
  m.box(-9, 5, 8, -8, 6, 8, 0x9ae8ff);
  // tiny cactus in a pot on top (it absorbs the radiation, obviously)
  m.box(2, 16, -1, 4, 17, 1, 0xc86a3a); m.box(3, 18, 0, 3, 21, 0, 0x4a9a4a); m.set(2, 20, 0, 0x4a9a4a); m.set(4, 19, 0, 0x4a9a4a); m.set(3, 22, 0, 0xffe066);
  // gold fish figurine
  m.box(-5, 16, 0, -3, 16, 1, 0x3a2418); m.box(-5, 17, 1, -3, 18, 1, GOLD); m.set(-2, 18, 1, GOLD_L); m.set(-6, 17, 1, GOLD_L);
  v.merge(m, 0, lift, 0);
  // keyboard
  v.box(-8, 0, 8, 7, 0, 11, BEIGE_D);
  for (let x = -7; x <= 6; x++) for (let z = 8; z <= 11; z++) if ((x + z) % 1 === 0 && !(z === 11 && x > -3 && x < 3)) v.set(x, 1, z, z === 8 && x === -7 ? 0xd8322a : (x * 3 + z) % 7 === 0 ? 0xb8ac8e : BEIGE);
  v.box(-2, 1, 11, 2, 1, 11, BEIGE); // space bar
  // mouse on a purple pad, with cord
  v.box(9, 0, 8, 13, 0, 12, 0x5a2a6a); v.set(11, 0, 10, GOLD);
  v.box(10, 1, 9, 11, 1, 11, BEIGE); v.set(10, 2, 10, BEIGE); v.set(11, 1, 9, BEIGE_DD);
  v.line(10, 1, 8, 8, 1, 2, 0x3a3a3a);
  return v;
}

function chairModel() {
  const v = new VoxelModel();
  const PU = 0x6b3a8c, PUD = 0x55296f, PUL = 0x8a54ac;
  // five-star base with casters
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const ex = Math.round(Math.cos(a) * 6), ez = Math.round(Math.sin(a) * 6);
    v.line(0, 2, 0, ex, 1, ez, 0x2a2630);
    v.set(ex, 0, ez, 0x141216);
  }
  v.box(-1, 1, -1, 1, 2, 1, 0x2a2630);
  v.box(0, 3, 0, 0, 7, 0, STEEL); v.box(-1, 3, 0, -1, 4, 0, STEEL_D);
  // seat cushion (tufted), top surface at y = 10 (0.5 world units)
  for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
    if (x * x + z * z > 27) continue;
    v.set(x, 8, z, PUD);
    v.set(x, 9, z, (x % 3 === 0 && z % 3 === 0) ? GOLD : x * x + z * z > 19 ? PU : PUL);
  }
  // short back rest behind (local -z) so the fox stays visible
  v.box(0, 8, -6, 0, 12, -6, STEEL);
  for (let x = -4; x <= 4; x++) for (let y = 12; y <= 18; y++) {
    if ((Math.abs(x) === 4 && (y === 12 || y === 18))) continue;
    v.set(x, y, -7, PUD);
    v.set(x, y, -6, (x % 3 === 0 && y === 15) ? GOLD : y === 18 ? PUL : PU);
  }
  // arm rests
  for (const sx of [-6, 6]) { v.box(sx, 9, -2, sx, 12, -2, 0x2a2630); v.box(sx, 13, -3, sx, 13, 2, 0x3a3440); }
  return v;
}

function goldfishModel() {
  // local: nose at +x
  const v = new VoxelModel();
  const O = 0xf08a2a, OL = 0xffb050, OD = 0xd86a1a, WF = 0xfff0e0;
  v.box(-2, -1, -1, 2, 1, 0, O);
  v.box(-1, 2, -1, 1, 2, 0, OL); v.box(-1, -2, -1, 1, -2, 0, OD);
  v.box(3, -1, -1, 3, 0, 0, O);
  v.set(3, 1, 0, BLACK); v.set(3, 1, -1, BLACK);
  v.set(-3, 0, -1, OD); v.set(-3, 0, 0, OD);
  v.set(-4, 1, -1, WF); v.set(-4, -1, 0, WF); v.set(-4, 2, 0, OL); v.set(-4, -2, -1, OL); v.set(-5, 2, -1, WF); v.set(-5, -2, 0, WF);
  v.set(0, 3, -1, WF); v.set(-1, 3, 0, OL);
  v.set(1, -1, 1, WF); v.set(1, -1, -2, WF);
  return v;
}

function tetraModel() {
  const v = new VoxelModel();
  v.box(-1, 0, 0, 1, 1, 0, 0x3ab0ff);
  v.set(-1, 0, 0, 0xe03a4a); v.set(0, 0, 0, 0xe03a4a); v.set(2, 1, 0, 0x3ab0ff); v.set(2, 0, 0, 0xcfe8ff);
  v.set(-2, 1, 0, 0x8ad0ff); v.set(-2, -1, 0, 0x8ad0ff); v.set(-2, 0, 0, 0x3ab0ff);
  v.set(1, 1, 1, BLACK);
  return v;
}

function plantModel(seed) {
  const v = new VoxelModel();
  const rnd = mulberry32(seed);
  const g = [0x3aa04a, 0x4ab85a, 0x2e8a3e, 0x6ac85a];
  for (let s = 0; s < 4; s++) {
    let x = Math.floor(rnd() * 4) - 2;
    const z = Math.floor(rnd() * 3) - 1, h = 6 + Math.floor(rnd() * 4);
    for (let y = 0; y < h; y++) {
      if (y % 3 === 2) x += rnd() < 0.5 ? 1 : -1;
      v.set(x, y, z, g[(y + s) % 4]);
      if (y % 2 === 1) v.set(x + (s % 2 ? 1 : -1), y, z, g[(y + 1) % 4]);
    }
  }
  return v;
}

function pendulumModel() {
  const v = new VoxelModel();
  v.box(0, -10, 0, 0, 0, 0, 0xd4a444);
  v.box(-1, -12, 0, 1, -11, 0, GOLD); v.set(0, -13, 0, GOLD_D); v.set(0, -10, 0, GOLD_D);
  return v;
}

function dnaModel() {
  const v = new VoxelModel();
  v.cylinder(0, 0, 0, 3, 1, 0x3a2418); v.cylinder(0, 1, 0, 2, 1, GOLD_D);
  v.box(0, 2, 0, 0, 3, 0, GOLD_D);
  const rungs = [0xffe060, 0x7cff9a, 0xf4f0e6, 0xff9ac0];
  for (let y = 4; y <= 21; y++) {
    const a = (y - 4) * 0.42;
    const ax = Math.cos(a) * 3.4, az = Math.sin(a) * 3.4;
    v.set(Math.round(ax), y, Math.round(az), 0xff5a6a);
    v.set(Math.round(-ax), y, Math.round(-az), 0x5a8aff);
    if (y % 2 === 0) for (let k = -2; k <= 2; k++) v.set(Math.round(ax * k / 3), y, Math.round(az * k / 3), rungs[(y / 2) % 4]);
  }
  return v;
}

function drinkingBirdModel() {
  // pivot at the hinge (0,0,0); the bird tips toward +z into its water glass
  const v = new VoxelModel();
  v.box(0, -5, 0, 0, 4, 0, 0xe8f4ff); // glass neck
  v.box(-1, -8, -1, 1, -6, 1, 0xd8322a); // red bulb
  v.set(0, -2, 0, 0xd8322a); v.set(0, 1, 0, 0xe86a5a);
  v.box(-1, 5, -1, 1, 7, 1, 0xd8322a); // head
  v.set(0, 6, 2, 0xf2c230); v.set(0, 6, 3, 0xf2c230); // beak
  v.set(1, 7, 1, BLACK); v.set(-1, 7, 1, BLACK);
  v.box(-2, 8, -2, 2, 8, 2, 0x16161a); v.box(-1, 9, -1, 1, 11, 1, 0x16161a); v.box(-1, 9, -1, 1, 9, 1, GOLD); // top hat!
  return v;
}

function nightcapModel() {
  const v = new VoxelModel();
  const A = 0x6a4a9a, B = 0xa88ad8;
  // lies on the pillow, drooping toward -x, ending in a pom-pom
  for (let i = 0; i <= 9; i++) {
    const r = i < 3 ? 2 : i < 6 ? 1 : 0;
    const y = i < 4 ? 0 : -Math.min(2, Math.floor((i - 3) / 2));
    for (let a = -r; a <= r; a++) for (let b = 0; b <= r; b++) v.set(-i, y + b, a, i % 2 ? A : B);
  }
  v.box(1, 0, -2, 1, 1, 2, 0xf4f0e6); // cuff
  v.ellipsoid(-11, -1, 0, 1.3, 1.3, 1.3, 0xffffff);
  return v;
}

function arcModel(rnd) {
  // a jagged 1-voxel lightning arc heading out along +x (with a small fork)
  const v = new VoxelModel();
  let x = 0, y = 0, z = 0;
  const len = 5 + Math.floor(rnd() * 6);
  for (let i = 0; i < len; i++) {
    v.set(x, y, z, i < 2 ? 0xffffff : i % 3 === 0 ? 0xc8b4ff : 0xeae4ff);
    x += 1;
    if (rnd() < 0.6) y += rnd() < 0.55 ? -1 : 1;
    if (rnd() < 0.4) z += rnd() < 0.5 ? -1 : 1;
    if (i === 3 && rnd() < 0.6) { v.set(x, y + 1, z, 0xd8ccff); v.set(x + 1, y + 2, z, 0xb8a4ff); }
  }
  return v;
}

// ================================================================== window view + screen art
function drawWindowView(ctx, w, h, night, time) {
  const g = ctx;
  const bands = night
    ? ['#0b1030', '#0e1638', '#121c44', '#17224e', '#1c2a58', '#243464', '#2c3c6e']
    : ['#5a9ee6', '#68a8ea', '#78b2ee', '#88bcf0', '#9ac6f2', '#acd0f4', '#c2dcf6'];
  const hz = 44; // horizon row
  for (let y = 0; y < h; y++) {
    const k = Math.min(bands.length - 1, Math.floor((y / hz) * bands.length));
    g.fillStyle = bands[k];
    g.fillRect(0, y, w, 1);
  }
  if (night) {
    // aurora ribbons
    for (let x = 0; x < w; x++) {
      const y0 = 10 + Math.sin(x * 0.11 + time * 0.35) * 3 + Math.sin(x * 0.047 - time * 0.2) * 4;
      const a = 0.35 + 0.3 * Math.sin(x * 0.3 + time * 1.3);
      g.fillStyle = `rgba(90,255,160,${(a * 0.5).toFixed(3)})`;
      g.fillRect(x, Math.round(y0), 1, 5);
      g.fillStyle = `rgba(170,110,255,${(a * 0.35).toFixed(3)})`;
      g.fillRect(x, Math.round(y0) - 3, 1, 3);
    }
    // stars
    const rnd = mulberry32(5);
    for (let i = 0; i < 46; i++) {
      const sx = Math.floor(rnd() * w), sy = Math.floor(rnd() * (hz - 6));
      const tw = 0.5 + 0.5 * Math.sin(time * (1.5 + rnd() * 2) + i);
      g.fillStyle = tw > 0.75 ? '#ffffff' : tw > 0.35 ? '#b8c8ff' : '#5a6aa8';
      g.fillRect(sx, sy, 1, 1);
    }
    // moon
    const mx = 60, my = 12;
    g.fillStyle = '#fff4d0';
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 26) g.fillRect(mx + x, my + y, 1, 1);
    g.fillStyle = '#e8d8a8';
    for (const [x, y] of [[-2, -1], [1, 2], [2, -2], [-1, 3]]) g.fillRect(mx + x, my + y, 1, 1);
    g.fillStyle = '#16204a';
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if ((x + 3) * (x + 3) + (y - 1) * (y - 1) <= 18 && x * x + y * y <= 26 && x < -1) g.fillRect(mx + x - 1, my + y, 1, 1);
  } else {
    // sun + puffy clouds
    g.fillStyle = '#fff6c8';
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 17) g.fillRect(64 + x, 11 + y, 1, 1);
    const cloud = (cx, cy, s) => {
      g.fillStyle = '#ffffff';
      g.fillRect(cx - 6 * s, cy, 13 * s, 3 * s); g.fillRect(cx - 4 * s, cy - 2 * s, 7 * s, 2 * s); g.fillRect(cx - 1 * s, cy - 3 * s, 4 * s, 2 * s);
      g.fillStyle = '#dce8f6'; g.fillRect(cx - 6 * s, cy + 2 * s, 13 * s, 1 * s);
    };
    const drift = (time * 1.2) % (w + 30);
    cloud(Math.round(((20 + drift) % (w + 30)) - 15), 16, 1);
    cloud(Math.round(((58 + drift * 0.7) % (w + 30)) - 15), 26, 1);
  }
  // the mountain with the Bear St. office tower
  const mcol = night ? '#28305a' : '#8a9ab8', snow = night ? '#8a96c8' : '#f4f8fc';
  for (let x = 0; x < w; x++) {
    const top = Math.round(hz - 2 - Math.max(0, 16 - Math.abs(x - 26) * 0.9) - Math.max(0, 7 - Math.abs(x - 70) * 0.5));
    g.fillStyle = mcol; g.fillRect(x, top, 1, hz - top + 2);
    if (top < hz - 12) { g.fillStyle = snow; g.fillRect(x, top, 1, 2); }
  }
  g.fillStyle = night ? '#3a3e58' : '#c2bcb0'; g.fillRect(23, 21, 7, 9);
  g.fillStyle = night ? '#ffe2a0' : '#6a7a90';
  for (let y = 22; y < 29; y += 2) for (let x = 24; x < 29; x += 2) g.fillRect(x, y, 1, 1);
  g.fillStyle = night ? '#ff6a5a' : '#d85a4a'; g.fillRect(24, 19, 5, 1);
  // pond glimpse + moon glint
  g.fillStyle = night ? '#1a2a50' : '#4f9aa8'; g.fillRect(0, hz + 4, w, 4);
  g.fillStyle = night ? '#fff0c0' : '#e8f8ff';
  for (let i = 0; i < 6; i++) g.fillRect(56 + ((i * 7 + Math.floor(time * 3)) % 12) - 4, hz + 5 + (i % 3), 2, 1);
  // pine silhouettes
  const pine = night ? '#0e1a1e' : '#2b5634', pineL = night ? '#15262a' : '#376a3c';
  const trees = [[4, 12], [13, 18], [21, 10], [33, 20], [44, 13], [52, 17], [66, 11], [75, 19], [83, 14]];
  for (const [tx, th] of trees) {
    for (let y = 0; y < th; y++) {
      const half = Math.floor((y / th) * 5) + (y % 4 === 3 ? 1 : 0);
      g.fillStyle = y % 4 === 0 ? pineL : pine;
      g.fillRect(tx - half, hz + 10 - th + y, half * 2 + 1, 1);
    }
  }
  g.fillStyle = night ? '#0a1216' : '#3a6a2e'; g.fillRect(0, hz + 8, w, h - hz - 8);
}

const BEAR_ICON = [
  '..##........##..',
  '.####......####.',
  '.####......####.',
  '..############..',
  '.##############.',
  '.###$$####$$###.',
  '.##$$######$$##.',
  '.###$$####$$###.',
  '.####......####.',
  '..###..##..###..',
  '..####....####..',
  '...##########...',
  '.....######.....',
];
const SCHEMES = [
  'FEED THE BEARS', 'BEARS PAY $$$', 'RAISE PRICES 5%', 'BREED MORE FISH', 'BUY TALLER HAT', 'DIG BIGGER POND',
  'MORE BEARS = MORE $', 'IGNORE 0-STAR REVIEWS', 'POLISH MONOCLE', 'CORNER THE FISH MARKET', 'NAP.EXE ..... OK',
  'FRANCHISE?!', 'COUNT COINS AGAIN', 'BEAR ST. = CUSTOMERS', 'SNACK BREAK', 'PROFIT!!!',
];

// ================================================================== main
/**
 * Build Reynard's lab interior. See the module header for the coordinate
 * system. Returns { group, screen, anchors, update, setNight, drawIdleScreen, dispose }.
 */
export function buildLab() {
  const t0 = performance.now();
  const group = new THREE.Group();
  group.name = 'ReynardLab';
  const disposables = new Set();
  const track = (x) => { disposables.add(x); return x; };

  // ---- materials
  const litMat = track(grainLambert({}, 0.1));
  const glowMat = track(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const glassMat = track(new THREE.MeshBasicMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.22, depthWrite: false }));
  const waterMat = track(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false }));
  const steamMat = new THREE.MeshBasicMaterial({ color: 0xf4f0ea, transparent: true, opacity: 0.5, depthWrite: false });
  const moteMat = track(new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));

  const fx = { flasks: [], leds: [] };
  const R = new VoxelModel(), G = new VoxelModel(), GL = new VoxelModel(), WT = new VoxelModel();
  buildFloor(R);
  buildWalls(R);
  buildWindow(R, GL);
  buildLabShelf(R, G, GL, WT, fx);
  buildLabBench(R, G, GL, fx);
  buildChalkboard(R);
  buildClock(R);
  buildCorkboard(R);
  buildPortrait(R);
  buildTrophyShelf(R, GL);
  buildDesk(R, G, fx);
  buildCot(R, fx);
  buildTank(R, G, WT, fx);
  buildTreasure(R, fx);
  buildTesla(R, G, fx);
  buildClutter(R, fx);

  const addMesh = (geo, mat, { cast = true, receive = true, name } = {}) => {
    const m = new THREE.Mesh(track(geo), mat);
    m.castShadow = cast; m.receiveShadow = receive;
    if (name) m.name = name;
    group.add(m);
    return m;
  };
  const roomMesh = addMesh(R.build({ scale: S }), litMat, { name: 'labRoom' });
  addMesh(G.build({ scale: S, ao: false }), glowMat, { cast: false, receive: false, name: 'labGlow' });
  GL.paint(() => 0xffffff);
  addMesh(GL.build({ scale: S, ao: false }), glassMat, { cast: false, receive: false, name: 'labGlass' });
  const water = addMesh(WT.build({ scale: S, ao: false }), waterMat, { cast: false, receive: false, name: 'tankWater' });
  water.renderOrder = 2;

  // Sub-model helper: model built around a voxel-space pivot, placed at a
  // lab-voxel position (pivots on whole voxels keep the grain aligned).
  const place = (vm, pos, { pivot = [0, 0, 0], mat = litMat, rotY = 0, parent = group, cast = true, name, ao = true } = {}) => {
    const m = new THREE.Mesh(track(vm.build({ pivot, scale: S, ao })), mat);
    m.position.set(W(pos[0]), W(pos[1]), W(pos[2]));
    m.rotation.y = rotY;
    m.castShadow = cast; m.receiveShadow = mat === litMat;
    if (name) m.name = name;
    parent.add(m);
    return m;
  };

  // ---- CRT workstation (angled toward the chair)
  const CRT_YAW = 30 * DEG;
  const crt = new THREE.Group();
  crt.name = 'crt';
  crt.position.set(W(3), W(DESK.top + 1), W(-40));
  crt.rotation.y = CRT_YAW;
  group.add(crt);
  const CRT_LIFT = 4;
  place(crtModel(CRT_LIFT), [0, 0, 0], { parent: crt, name: 'crtBody' });
  // screen canvas
  const SW = 160, SH = 120;
  const canvas = document.createElement('canvas');
  canvas.width = SW; canvas.height = SH;
  const ctx = canvas.getContext('2d');
  const texture = track(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  const screenMat = track(new THREE.MeshBasicMaterial({ map: texture }));
  const screenMesh = new THREE.Mesh(track(new THREE.PlaneGeometry(W(12), W(9))), screenMat);
  screenMesh.position.set(0, W(8.5 + CRT_LIFT), W(7) + 0.004);
  screenMesh.name = 'crtScreen';
  crt.add(screenMesh);
  const screen = { mesh: screenMesh, canvas, ctx, texture, w: SW, h: SH };
  // helper for callers: crisp pixel text on the screen canvas
  screen.print = (str, x, y, color = '#8affb0', scale = 1) => canvasText(ctx, String(str), x, y, color, scale);
  screen.textWidth = textWidth;
  const crtLed = place(new VoxelModel().set(3, 2 + CRT_LIFT, 8, 0x6aff7a), [0, 0, 0], { parent: crt, mat: glowMat, cast: false, ao: false });
  fx.ledMeshes = [{ mesh: crtLed, mode: 'steady' }];

  // ---- the fox's chair, facing the CRT
  const seatX = 19, seatZ = -18;
  const screenWorld = new THREE.Vector3();
  crt.updateMatrixWorld(true);
  screenMesh.getWorldPosition(screenWorld);
  const foxYaw = Math.atan2(screenWorld.x - W(seatX), screenWorld.z - W(seatZ));
  place(chairModel(), [seatX, 0, seatZ], { rotY: foxYaw, name: 'foxChair' });

  // ---- animated bits
  const anim = {};
  // desk lamp bulb
  const bulbV = new VoxelModel();
  bulbV.box(-1, 0, -1, 1, 1, 1, 0xfff0c0); bulbV.set(0, -1, 0, 0xffffff);
  anim.bulb = place(bulbV, fx.lampBulb, { mat: track(new THREE.MeshBasicMaterial({ vertexColors: true })), cast: false, ao: false, name: 'lampBulb' });
  // LEDs
  for (const l of fx.leds) {
    const m = place(new VoxelModel().set(0, 0, 0, l.color), l.pos, { mat: glowMat, cast: false, ao: false });
    fx.ledMeshes.push({ mesh: m, mode: l.mode });
  }
  // pendulum clock
  anim.pendulum = place(pendulumModel(), [-13, 48, -49], { name: 'pendulum' });
  // DNA helix (spins)
  anim.dna = place(dnaModel(), fx.dna, { name: 'dnaHelix' });
  // drinking bird on the sill, dipping into a glass of water
  {
    const gx = 17, gz = -51;
    const cup = new VoxelModel();
    cup.box(0, 0, 0, 2, 6, 2, 0xffffff);
    const cupM = place(cup, [gx - 1, 33, gz + 5], { mat: glassMat, cast: false, ao: false });
    cupM.renderOrder = 1;
    const cw = new VoxelModel(); cw.box(0, 0, 0, 2, 4, 2, 0x5ad0ff);
    place(cw, [gx - 1, 33, gz + 5], { mat: waterMat, cast: false, ao: false });
    const legs = new VoxelModel();
    legs.box(-2, 0, -1, 2, 0, 1, 0x3a6ab8); legs.box(-2, 1, 0, -2, 8, 0, 0x3a6ab8); legs.box(2, 1, 0, 2, 8, 0, 0x3a6ab8);
    place(legs, [gx, 34, gz], {});
    anim.bird = place(drinkingBirdModel(), [gx, 42, gz], { name: 'drinkingBird' });
  }
  // nightcap on the pillow (named so it can be hidden while the fox wears his own)
  place(nightcapModel(), [COT.x1 - 4, 11, -43], { name: 'nightcap' });
  // tank fish, plant, bubbles
  const tank = fx.tank;
  anim.fish = [
    { mesh: place(goldfishModel(), [0, 0, 0], { name: 'tankFish' }), speed: 0.55, phase: 0, y: 0.35, z: 0.5, dir: 1, turn: 0 },
    { mesh: place(tetraModel(), [0, 0, 0], { name: 'tankFish2' }), speed: 0.8, phase: 2.1, y: 0.7, z: 0.25, dir: 1, turn: 0 },
  ];
  anim.plants = [place(plantModel(3), [46, TANK.y0 + 2, 13], {}), place(plantModel(8), [62, TANK.y0 + 2, 10], {})];
  anim.plants.forEach((p, i) => { p.userData.phase = i * 1.7; });
  const bubbleGeo = track(new THREE.BoxGeometry(0.035, 0.035, 0.035));
  const bubbleMat = track(new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.85 }));
  anim.tankBubbles = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(bubbleGeo, bubbleMat);
    m.userData.t = i / 7;
    group.add(m);
    anim.tankBubbles.push(m);
  }
  // flask bubbles (glowing)
  const fbMat = track(new THREE.MeshBasicMaterial({ color: 0xeaffea }));
  const fbGeo = track(new THREE.BoxGeometry(0.03, 0.03, 0.03));
  anim.flaskBubbles = [];
  fx.flasks.forEach((f, i) => {
    const n = f.big ? 4 : 2;
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(fbGeo, fbMat);
      m.userData = { f, t: (k / n + i * 0.37) % 1, speed: 0.5 + ((i * 7 + k * 3) % 5) * 0.12, wob: i * 1.3 + k };
      group.add(m);
      anim.flaskBubbles.push(m);
    }
  });
  // ramen steam wisps
  anim.steam = [];
  const steamGeo = track(new THREE.BoxGeometry(0.07, 0.07, 0.07));
  for (let i = 0; i < 6; i++) {
    const mat = track(steamMat.clone());
    const m = new THREE.Mesh(steamGeo, mat);
    m.userData.t = i / 6;
    m.renderOrder = 3;
    group.add(m);
    anim.steam.push(m);
  }
  steamMat.dispose();
  // mug steam (just two)
  anim.mugSteam = [];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xf4f0ea, transparent: true, opacity: 0.4, depthWrite: false });
    track(mat);
    const m = new THREE.Mesh(steamGeo, mat);
    m.scale.setScalar(0.7);
    m.userData.t = i / 3;
    group.add(m);
    anim.mugSteam.push(m);
  }
  // Bunsen flame (flickers)
  {
    const fl = new VoxelModel();
    fl.box(0, 0, 0, 0, 1, 0, 0x6aa8ff); fl.set(0, 2, 0, 0xffb060); fl.set(0, 3, 0, 0xffe0a0);
    fl.set(1, 0, 0, 0x4a88ff); fl.set(-1, 0, 0, 0x4a88ff); fl.set(0, 0, 1, 0x4a88ff); fl.set(0, 0, -1, 0x4a88ff);
    anim.flame = place(fl, fx.bunsen, { mat: glowMat, cast: false, ao: false, name: 'bunsenFlame' });
  }
  // space heater coils
  {
    const hv = new VoxelModel();
    for (let x = -3; x <= 3; x++) for (const y of [4, 6, 8]) hv.set(x, y - 1, 0, (x + y) % 2 ? 0xff7a2a : 0xffb050);
    anim.heater = place(hv, [fx.heater[0], 0, fx.heater[2]], { mat: track(new THREE.MeshBasicMaterial({ vertexColors: true })), cast: false, ao: false, name: 'heaterCoils' });
  }
  // condenser drip
  anim.drip = new THREE.Mesh(fbGeo, track(new THREE.MeshBasicMaterial({ color: 0x9affb0 })));
  group.add(anim.drip);
  // Tesla coil sparks
  anim.arcs = [];
  {
    const rnd = mulberry32(99);
    const arcMat = track(new THREE.MeshBasicMaterial({ vertexColors: true }));
    for (let i = 0; i < 8; i++) {
      const m = place(arcModel(rnd), [fx.tesla[0], fx.tesla[1], fx.tesla[2]], { mat: arcMat, cast: false, ao: false, pivot: [-6, 0, 0] });
      m.visible = false;
      anim.arcs.push(m);
    }
  }
  // dust motes drifting in the window light
  anim.motes = [];
  const moteGeo = track(new THREE.BoxGeometry(0.025, 0.025, 0.025));
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(moteGeo, moteMat);
    const r = mulberry32(i * 13 + 1);
    // spread through the window beam: from the glass (t=0) toward the floor patch (t=1)
    const t = 0.08 + r() * 0.8, wy = 1.75 + r() * 1.0, wx = 0.05 + r() * 1.2;
    m.userData = { x: wx + 0.26 / 0.5 * wy * t, y: wy * (1 - t), z: -2.55 + 0.83 / 0.5 * wy * t, s: 0.3 + r() * 0.5, p: r() * 10 };
    group.add(m);
    anim.motes.push(m);
  }

  // ---- window view (canvas behind the glass)
  const VW = 88, VH = 64;
  const viewCanvas = document.createElement('canvas');
  viewCanvas.width = VW; viewCanvas.height = VH;
  const viewCtx = viewCanvas.getContext('2d');
  const viewTex = track(new THREE.CanvasTexture(viewCanvas));
  viewTex.colorSpace = THREE.SRGBColorSpace;
  viewTex.minFilter = viewTex.magFilter = THREE.NearestFilter;
  viewTex.generateMipmaps = false;
  const view = new THREE.Mesh(track(new THREE.PlaneGeometry(VW * 0.025, VH * 0.025)), track(new THREE.MeshBasicMaterial({ map: viewTex })));
  view.position.set(W(13), 2.12, -3.0);
  view.name = 'windowView';
  group.add(view);

  // ---- god rays through the four window panes (fake volumetric light)
  const beamMat = track(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const beams = [];
  const buildBeams = (dir) => {
    const pos = [], col = [], idx = [];
    const panes = [[W(0), W(12), W(34), W(44)], [W(14), W(26), W(34), W(44)], [W(0), W(12), W(46), W(56)], [W(14), W(26), W(46), W(56)]];
    for (const [xa, xb, ya, yb] of panes) {
      const base = pos.length / 3;
      const corners = [[xa, ya], [xb, ya], [xb, yb], [xa, yb]];
      for (const [x, y] of corners) { pos.push(x, y, -2.55); col.push(1, 1, 1); }
      for (const [x, y] of corners) {
        const t = (y - 0.02) / -dir.y;
        pos.push(x + dir.x * t, 0.02, -2.55 + dir.z * t);
        col.push(0, 0, 0);
      }
      for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0]]) idx.push(base + a, base + b, base + 4 + b, base + a, base + 4 + b, base + 4 + a);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  };
  {
    const m = new THREE.Mesh(track(buildBeams(new THREE.Vector3(0.26, -0.5, 0.83).normalize())), beamMat);
    m.renderOrder = 5;
    m.name = 'windowBeams';
    group.add(m);
    beams.push(m);
  }

  // ---- plaque text (EMPLOYEE OF THE MONTH)
  {
    const pc = document.createElement('canvas');
    pc.width = 56; pc.height = 12;
    const p = pc.getContext('2d');
    p.fillStyle = '#b88a3a'; p.fillRect(0, 0, 56, 12);
    canvasText(p, 'EMPLOYEE OF', 7, 0, '#3a2410');
    canvasText(p, 'THE MONTH', 11, 6, '#3a2410');
    const tex = track(new THREE.CanvasTexture(pc));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    const plaque = new THREE.Mesh(track(new THREE.PlaneGeometry(W(14), W(3))), track(new THREE.MeshLambertMaterial({ map: tex })));
    plaque.position.set(W(52), W(50.5), W(-48) + 0.003);
    plaque.receiveShadow = true;
    group.add(plaque);
  }

  // ---- invisible ceiling that only casts shadows (keeps outdoor light out)
  {
    const lid = new THREE.Mesh(track(new THREE.BoxGeometry(8.2, 0.1, 5.8)), track(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })));
    lid.position.set(0, 4.08, -0.05);
    lid.castShadow = true;
    lid.receiveShadow = false;
    group.add(lid);
  }

  // ---- lights (all inside the group, so they only light this scene)
  const lights = {};
  lights.hemi = new THREE.HemisphereLight(0xffe2c4, 0x5a3a30, 1.4);
  lights.window = new THREE.DirectionalLight(0xfff0d0, 2.6);
  const WIN_DIR = new THREE.Vector3(0.26, -0.5, 0.83).normalize();
  lights.window.target.position.set(1.4, 0, 0.6);
  lights.window.position.copy(lights.window.target.position).addScaledVector(WIN_DIR, -12);
  lights.window.castShadow = true;
  lights.window.shadow.mapSize.set(1024, 1024);
  {
    const sc = lights.window.shadow.camera;
    sc.left = -5.5; sc.right = 5.5; sc.top = 5.5; sc.bottom = -5.5; sc.near = 2; sc.far = 24;
    sc.updateProjectionMatrix();
  }
  lights.window.shadow.bias = -0.0008;
  lights.window.shadow.normalBias = 0.02;
  const pt = (color, intensity, distance, decay, p) => {
    const l = new THREE.PointLight(color, intensity, distance, decay);
    l.position.set(p[0], p[1], p[2]);
    return l;
  };
  lights.lamp = pt(0xffc47a, 3.2, 6, 1.3, [W(fx.lampBulb[0]), W(fx.lampBulb[1] - 2), W(fx.lampBulb[2] + 1)]);
  const screenFront = new THREE.Vector3(0, W(8.5 + CRT_LIFT), W(24)).applyMatrix4(crt.matrixWorld);
  lights.screen = pt(0x8affc0, 1.0, 2.6, 1.6, screenFront.toArray());
  lights.lab = pt(0x7cff9a, 1.6, 3.4, 1.5, [-2.6, 1.3, -1.7]);
  lights.tank = pt(0x6ad8ff, 1.3, 2.6, 1.5, [W((TANK.x0 + TANK.x1) / 2), W(20), W(TANK.z1 + 6)]);
  lights.tesla = pt(0xb89aff, 0, 2.6, 1.5, [W(fx.tesla[0]), W(fx.tesla[1] + 2), W(fx.tesla[2] + 2)]);
  lights.heater = pt(0xff8a3a, 0.9, 1.8, 1.6, [W(fx.heater[0]), W(7), W(fx.heater[2] + 6)]);
  // soft fill from the open front (the viewer's side) keeps the diorama readable
  lights.fill = new THREE.DirectionalLight(0xffe4c8, 0.55);
  lights.fill.position.set(0.8, 6, 9);
  lights.fill.target.position.set(0, 1, -1);
  group.add(lights.hemi, lights.window, lights.window.target, lights.fill, lights.fill.target, lights.lamp, lights.screen, lights.lab, lights.tank, lights.tesla, lights.heater);

  // ---- anchors
  const foxSeatPos = new THREE.Vector3(W(seatX), 0, W(seatZ));
  const ref = { w: 640, h: 360 }; // zoom values are tuned for a 640x360 low-res view
  const zoomFor = (fw, fh) => Math.max(fw / ref.w, fh / ref.h) * 100;
  const cam = (target, fw, fh, yaw = 0) => ({ target, zoom: zoomFor(fw, fh), fit: { w: fw, h: fh }, yaw, pitch: 40 * DEG });
  // overview: frame the whole diorama (room bounds projected on the view plane)
  const over = (() => {
    const bb = roomMesh.geometry.boundingBox;
    const pitch = 40 * DEG, cu = Math.cos(pitch), su = Math.sin(pitch);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const x = i & 1 ? bb.max.x : bb.min.x, y = i & 2 ? bb.max.y : bb.min.y, z = i & 4 ? bb.max.z : bb.min.z;
      const sy = y * cu - z * su;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    // a point on the floor-centre plane (z = 0) that projects to the frame centre
    return { target: new THREE.Vector3(cx, cy / cu, 0), w: (x1 - x0) * 1.06, h: (y1 - y0) * 1.07 };
  })();
  const anchors = {
    foxSeat: { position: foxSeatPos, rotationY: foxYaw, seatHeight: W(10) },
    foxBed: { position: new THREE.Vector3(...fx.bed), rotationY: Math.PI / 2 },
    camOverview: cam(over.target, over.w, over.h),
    camScreen: cam(screenWorld.clone(), 1.25, 0.72, CRT_YAW),
    camFox: cam(foxSeatPos.clone().add(new THREE.Vector3(-0.15, 1.05, -0.2)), 2.3, 1.55),
  };

  // ---- state + animation
  let night = false;
  let viewT = -1;
  const state = { lampBase: 3.2, lampFlick: 0, arcT: 0, time: 0, screen: 1, heater: 1 };

  // Day: sunny window, airy warm fill. Night: moonbeam, deep purple ambient,
  // and the room lit mostly by the lamp, the glowing flasks, CRT and tank.
  const MOOD = {
    day: { hemi: [0xffe6c8, 0x6a4a36, 1.7], fill: [0xffe8cc, 0.75], win: [0xfff0d0, 3.4], lamp: 2.4, screen: 1.0, lab: 1.3, tank: 1.1, heater: 0.7, beam: 0xffe8b0, beamK: 0.16, motes: 0.55 },
    night: { hemi: [0x6a5aa8, 0x1e1628, 0.75], fill: [0x8a86d8, 0.28], win: [0x8aa8ff, 1.9], lamp: 5.2, screen: 1.8, lab: 2.4, tank: 1.9, heater: 1.3, beam: 0x9ab8ff, beamK: 0.12, motes: 0.35 },
  };
  function setNight(on) {
    night = !!on;
    const m = night ? MOOD.night : MOOD.day;
    lights.hemi.color.setHex(m.hemi[0]); lights.hemi.groundColor.setHex(m.hemi[1]); lights.hemi.intensity = m.hemi[2];
    lights.fill.color.setHex(m.fill[0]); lights.fill.intensity = m.fill[1];
    lights.window.color.setHex(m.win[0]); lights.window.intensity = m.win[1];
    state.lampBase = m.lamp; state.screen = m.screen; state.heater = m.heater;
    lights.lab.intensity = m.lab; lights.tank.intensity = m.tank;
    beamMat.color.setHex(m.beam).multiplyScalar(m.beamK);
    moteMat.opacity = m.motes;
    viewT = -1;
    drawWindowView(viewCtx, VW, VH, night, state.time);
    viewTex.needsUpdate = true;
  }

  function drawIdleScreen(time = state.time) {
    const c = ctx;
    c.fillStyle = '#04120a'; c.fillRect(0, 0, SW, SH);
    // header
    c.fillStyle = '#123a20'; c.fillRect(0, 0, SW, 12);
    canvasText(c, 'REYNARD OS', 4, 2, '#9affb8', 1);
    canvasText(c, 'V6.6', 48, 2, '#4aa86a', 1);
    const hh = String(Math.floor(time / 60) % 24).padStart(2, '0'), mm = String(Math.floor(time) % 60).padStart(2, '0');
    canvasText(c, hh + (Math.floor(time * 2) % 2 ? ':' : ' ') + mm, SW - 26, 2, '#9affb8');
    c.fillStyle = '#9affb8'; c.fillRect(0, 12, SW, 1);
    // bear target with $ eyes
    const bob = Math.round(Math.sin(time * 2) * 1.5);
    const bx = 8, by = 26 + bob;
    BEAR_ICON.forEach((row, v) => [...row].forEach((ch, u) => {
      if (ch === '.') return;
      c.fillStyle = ch === '$' ? (Math.floor(time * 3) % 2 ? '#ffe060' : '#fff4a0') : '#6affa0';
      c.fillRect(bx + u * 3, by + v * 3, 3, 3);
    }));
    // crosshair
    const r = 30 + Math.round(Math.sin(time * 3) * 2), cx = bx + 24, cy = by + 19;
    c.fillStyle = '#ff5a5a';
    for (let a = 0; a < 64; a++) {
      const t = (a / 64) * Math.PI * 2;
      if (a % 8 < 5) c.fillRect(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r * 0.8), 1, 1);
    }
    c.fillRect(cx - 2, cy, 5, 1); c.fillRect(cx, cy - 2, 1, 5);
    canvasText(c, 'TARGET: BEARS', 6, 80, '#6affa0');
    // scrolling scheme list
    const x0 = 66, lh = 8, visible = 9;
    const scroll = time * 0.9;
    const first = Math.floor(scroll);
    const frac = scroll - first;
    c.save();
    c.beginPath(); c.rect(x0 - 2, 16, SW - x0, visible * lh); c.clip();
    for (let i = 0; i <= visible; i++) {
      const idx = (((first + i) % SCHEMES.length) + SCHEMES.length) % SCHEMES.length;
      const y = 17 + Math.round((i - frac) * lh);
      const done = (idx * 5) % 3 === 0;
      canvasText(c, (done ? '+' : '>') + ' ' + SCHEMES[idx].slice(0, 21), x0, y, done ? '#4aa86a' : '#9affb8');
    }
    c.restore();
    c.fillStyle = '#1e6a3a'; c.fillRect(x0 - 4, 16, 1, visible * lh);
    // money chart
    const gy = 92, gh = 22;
    c.fillStyle = '#0a2414'; c.fillRect(4, gy, SW - 8, gh);
    c.fillStyle = '#1e5a34';
    for (let x = 4; x < SW - 4; x += 8) c.fillRect(x, gy, 1, gh);
    c.fillStyle = '#ffe060';
    let prev = null;
    for (let x = 0; x < SW - 10; x++) {
      const k = x / (SW - 10);
      const v = k * 0.8 + 0.12 * Math.sin(x * 0.35 + time * 2.2) * (1 - k * 0.5) + 0.05 * Math.sin(x * 1.3 - time * 4);
      const y = Math.round(gy + gh - 3 - Math.max(0, Math.min(1, v)) * (gh - 6));
      c.fillRect(5 + x, y, 1, 1);
      if (prev !== null && Math.abs(prev - y) > 1) c.fillRect(5 + x, Math.min(prev, y), 1, Math.abs(prev - y));
      prev = y;
    }
    canvasText(c, '$$$', SW - 22, gy + 3, Math.floor(time * 2) % 2 ? '#ffe060' : '#fff8c0');
    // blinking prompt
    canvasText(c, 'C:\\>', 4, SH - 6, '#6affa0');
    if (Math.floor(time * 2.5) % 2) { c.fillStyle = '#9affb8'; c.fillRect(22, SH - 6, 3, 5); }
    crtOverlay(c, time);
    texture.needsUpdate = true;
  }

  // scanlines, rolling refresh band and a soft vignette (also handy after
  // drawing custom content: screen.overlay(time))
  function crtOverlay(c, time = state.time) {
    c.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 1; y < SH; y += 2) c.fillRect(0, y, SW, 1);
    const band = Math.floor(((time * 40) % (SH + 30)) - 15);
    c.fillStyle = 'rgba(160,255,190,0.06)'; c.fillRect(0, band, SW, 10);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(0, 0, 2, SH); c.fillRect(SW - 2, 0, 2, SH); c.fillRect(0, SH - 1, SW, 1);
    c.fillStyle = 'rgba(255,255,255,0.10)'; c.fillRect(6, 15, 10, 2); c.fillRect(6, 17, 4, 2);
  }
  screen.overlay = (time) => { crtOverlay(ctx, time); texture.needsUpdate = true; };

  function update(dt, time) {
    state.time = time;
    // lamp: warm with a little buzz and the odd flicker
    if (Math.random() < dt * 0.25) state.lampFlick = 0.25 + Math.random() * 0.2;
    state.lampFlick = Math.max(0, state.lampFlick - dt);
    const buzz = 0.97 + 0.03 * Math.sin(time * 37) * Math.sin(time * 11.3);
    const dip = state.lampFlick > 0 ? (Math.sin(state.lampFlick * 90) > 0 ? 0.55 : 1) : 1;
    lights.lamp.intensity = state.lampBase * buzz * dip;
    anim.bulb.material.color.setScalar(0.75 + 0.25 * buzz * dip);
    // screen glow breathes with the content
    lights.screen.intensity = state.screen * (0.9 + 0.1 * Math.sin(time * 5.1) * Math.sin(time * 1.7));
    // LEDs
    for (const l of fx.ledMeshes) {
      if (l.mode === 'disk') l.mesh.visible = Math.sin(time * 23) * Math.sin(time * 7.7 + 1) > 0.1;
      else if (l.mode === 'blink') l.mesh.visible = Math.floor(time * 2) % 2 === 0;
      else if (l.mode === 'blink2') l.mesh.visible = Math.floor(time * 3 + 1) % 3 !== 0;
      else l.mesh.visible = true;
    }
    // clock pendulum, helix, drinking bird
    anim.pendulum.rotation.z = Math.sin(time * Math.PI * 0.95) * 0.32;
    anim.dna.rotation.y = time * 0.9;
    // drinking bird: slow wobbling lean, a dip into the glass, then it swings back upright
    const cyc = (time / 5) % 1;
    let tilt;
    if (cyc < 0.72) tilt = cyc / 0.72 * 0.75 + Math.sin(time * 5.5) * 0.08 * (1 - cyc);
    else if (cyc < 0.82) tilt = 0.75 + (cyc - 0.72) / 0.1 * 0.7;
    else { const k = (cyc - 0.82) / 0.18; tilt = 1.45 * (1 - k) + Math.sin(k * Math.PI * 3) * 0.3 * (1 - k); }
    anim.bird.rotation.x = tilt;
    // tank fish swim back and forth, turning around at the glass
    for (const f of anim.fish) {
      const k = Math.sin(time * f.speed + f.phase);
      const x = tank.x0 + (tank.x1 - tank.x0) * (0.5 + 0.5 * k);
      const vel = Math.cos(time * f.speed + f.phase);
      const face = vel >= 0 ? 0 : Math.PI;
      f.turn += (face - f.turn) * Math.min(1, dt * 6);
      f.mesh.rotation.y = f.turn + Math.sin(time * 9 + f.phase) * 0.12;
      f.mesh.position.set(x, tank.y0 + (tank.y1 - tank.y0) * (f.y + 0.12 * Math.sin(time * 1.3 + f.phase)),
        tank.z0 + (tank.z1 - tank.z0) * (f.z + 0.2 * Math.sin(time * 0.7 + f.phase * 2)));
    }
    for (const p of anim.plants) p.rotation.z = Math.sin(time * 1.4 + p.userData.phase) * 0.08;
    for (const b of anim.tankBubbles) {
      b.userData.t = (b.userData.t + dt * 0.45) % 1;
      const t = b.userData.t;
      b.position.set(tank.stone[0] + Math.sin(t * 17 + b.id) * 0.02, tank.stone[1] + t * (tank.surface - tank.stone[1]), tank.stone[2] + Math.cos(t * 13) * 0.015);
      b.scale.setScalar(0.6 + t * 0.7);
    }
    // flask bubbles
    for (const b of anim.flaskBubbles) {
      const u = b.userData, f = u.f;
      u.t = (u.t + dt * u.speed) % 1;
      const h = f.bubbleTo - f.bubbleFrom[1];
      const wob = f.wide ? Math.sin(u.t * 9 + u.wob) * f.wide * 0.5 : Math.sin(u.t * 11 + u.wob) * 0.4;
      b.position.set(W(f.bubbleFrom[0] + 0.5 + wob), W(f.bubbleFrom[1] + 0.5 + u.t * h), W(f.bubbleFrom[2] + 0.5 + Math.cos(u.t * 7 + u.wob) * 0.4));
      b.scale.setScalar(f.big ? 1.3 : 1);
    }
    // ramen + mug steam
    const steam = (arr, origin, rise, spread, maxOp) => {
      for (const s of arr) {
        s.userData.t = (s.userData.t + dt * 0.28) % 1;
        const t = s.userData.t;
        s.position.set(W(origin[0] + 0.5) + Math.sin(t * 6 + s.id) * spread * t, W(origin[1]) + t * rise, W(origin[2] + 0.5) + Math.cos(t * 5 + s.id) * spread * 0.5 * t);
        s.scale.setScalar((0.7 + t * 0.9) * (arr === anim.mugSteam ? 0.7 : 1));
        s.material.opacity = maxOp * Math.sin(t * Math.PI);
      }
    };
    steam(anim.steam, fx.ramen, 0.55, 0.06, 0.55);
    steam(anim.mugSteam, fx.mug, 0.35, 0.04, 0.35);
    // Bunsen flame + condenser drip
    anim.flame.scale.set(1, 0.8 + 0.35 * Math.abs(Math.sin(time * 13) * Math.sin(time * 5.3)), 1);
    const dripT = (time * 0.7) % 1;
    anim.drip.position.set(W(fx.drip[0] + 0.5), W(fx.drip[1] - dripT * 7), W(fx.drip[2] + 0.5));
    anim.drip.visible = dripT < 0.85;
    // Tesla coil: crackling arcs + violet flashes
    state.arcT -= dt;
    if (state.arcT <= 0) {
      state.arcT = 0.05 + Math.random() * 0.12;
      const burst = Math.random() < 0.55;
      let lit = 0;
      for (const a of anim.arcs) {
        a.visible = burst && Math.random() < 0.3;
        if (a.visible) { lit++; a.rotation.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.9); }
      }
      lights.tesla.intensity = lit ? 1.2 + lit * 0.6 : 0;
    }
    // heater coils pulse gently
    const hp = 0.85 + 0.15 * Math.sin(time * 1.7);
    anim.heater.material.color.setScalar(hp);
    lights.heater.intensity = state.heater * hp;
    // dust motes
    for (const m of anim.motes) {
      const u = m.userData;
      m.position.set(u.x + Math.sin(time * 0.21 * u.s + u.p) * 0.12, Math.max(0.1, u.y + Math.sin(time * 0.13 * u.s + u.p * 2) * 0.15), u.z + Math.cos(time * 0.17 * u.s + u.p) * 0.12);
    }
    // window view animates at a few fps
    if (time - viewT > 0.12 || viewT < 0) {
      viewT = time;
      drawWindowView(viewCtx, VW, VH, night, time);
      viewTex.needsUpdate = true;
    }
  }

  function dispose() {
    group.traverse((o) => { if (o.isLight && o.shadow && o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; } });
    for (const d of disposables) d.dispose?.();
    disposables.clear();
    group.clear();
    group.removeFromParent();
  }

  setNight(false);
  drawIdleScreen(0);
  update(0, 0);
  group.userData.buildMs = performance.now() - t0;
  return { group, screen, anchors, update, setNight, drawIdleScreen, dispose, lights };
}
