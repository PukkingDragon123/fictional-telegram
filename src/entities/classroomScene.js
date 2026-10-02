// Reynard's pond school: a cosy classroom diorama for the tutorial lessons
// (src/game/Classroom.js). Built like the fox's lab (src/entities/labScene.js):
// procedural voxels at 0.05 world units, a dollhouse cutaway (front wall and
// ceiling removed), lights living inside the group so they only light this room.
//
// Space: origin = centre of the floor (floor top at y = 0). The interior spans
// x -4.6..4.6 and z -2.9..2.6, walls are 3.2 tall. The back wall with the big
// chalkboard is at -z and the open front faces +z: view it from +z (yaw ~0)
// with an orthographic camera pitched 18..38 degrees down.
//
//   const room = buildClassroom();         // { group, anchors, board, students, update, setNight, setClock, dispose }
//   room.board.chalk.draw([...]);          // the board surface is a Chalkboard (src/ui/Chalkboard.js)
//   room.board.uvToWorld(u, v, out);       // board uv (0..1, v down) -> world point on the surface
//   room.students.react('heart');          // heart | bang | question | zzz | raise | cheer | laugh | note | sweat | star | wow
//   room.update(dt, time, camera);         // animates; fish billboards face `camera`
//
// The students are the game's own fish sprites (src/game/fishSprites.js) as
// billboards in round fishbowls on little desks, with painted-on glasses, a
// bow, a sleepy fish and a keen one that raises a fin.
import * as THREE from 'three';
import { VoxelModel, shade } from '../core/voxel.js';
import { mulberry32, hash2, hash3 } from '../core/rng.js';
import { Chalkboard, pixelText } from '../ui/Chalkboard.js';
import { fishCanvasFor } from '../game/fishSprites.js';

export const CLASS_VOXEL = 0.05;
export const CLASS_BACKGROUND = 0x1a1420;
const V = CLASS_VOXEL;
const W = (n) => n * V;
const DEG = Math.PI / 180;

// room extents (voxels): interior x X0..X1, back wall face at z = ZB*V
const X0 = -92, X1 = 91, ZB = -58, ZF = 52, HT = 64;
// chalkboard surface (world units): 192x108 texels at 0.0125, above a low
// wooden teacher's platform (RISER) so the fox can reach most of it
export const BOARD = { w: 2.4, h: 1.35, cx: -0.35, cy: 0.45 + 0.675, z: ZB * V + 0.056, texW: 192, texH: 108 };
export const RISER = { x0: -2.0, x1: 1.15, z0: ZB * V, z1: ZB * V + 0.75, h: 0.3 };

// ------------------------------------------------------------------ palette
const FLOOR = [0xc98c4e, 0xbd8046, 0xd29656, 0xb47840, 0xc68a4c, 0xbf8448];
const WAIN = [0x8f5a34, 0x9a6238, 0x86532f, 0x95603a];
const TRIM = 0x6e4226, TRIM_L = 0xa86e40;
const PLASTER = [0xf2e3bb, 0xeedcb2, 0xf5e8c4, 0xe9d6aa];
const WHITE_TRIM = 0xf4ecd8, WHITE_TRIM_D = 0xd8cdb4;
const DESK = 0xb8763e, DESK_D = 0x8e5a30, DESK_L = 0xcc8a4e;
const METAL = 0x4a7a9a, METAL_D = 0x34586e;
const GOLD = 0xf0c030, GOLD_D = 0xc8961c, GOLD_L = 0xffe27a;
const PAPER = 0xf6eedc;
const INK = 0x2a1c16;

// Lambert + per-voxel grain (same trick as the lab, at this voxel size)
function grainLambert(params = {}, amount = 0.1) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, ...params });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vClsPos;\nvarying vec3 vClsNor;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvClsPos = position;\nvClsNor = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vClsPos;
varying vec3 vClsNor;
float clsHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 an = abs(vClsNor);
  vec2 cell = an.y > 0.5 ? vClsPos.xz : (an.x > 0.5 ? vClsPos.zy : vClsPos.xy);
  float gn = clsHash(floor(cell * 20.0 + 0.001));
  diffuseColor.rgb *= 1.0 + (gn - 0.5) * ${amount.toFixed(3)};
}`);
  };
  mat.customProgramCacheKey = () => 'clsgrain' + amount;
  return mat;
}

const pick = (arr, h) => arr[Math.min(arr.length - 1, Math.floor(h * arr.length))];
const canvasTex = (cv) => {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
};

// ================================================================== shell
function buildFloor(R) {
  for (let x = X0 - 4; x <= X1 + 4; x++) {
    const p = Math.floor((x + 200) / 6);
    const base = pick(FLOOR, hash2(p, 7, 3));
    const col = (x + 200) % 6;
    const off = Math.floor(hash2(p, 2, 9) * 30);
    for (let z = ZB - 4; z <= ZF; z++) {
      const along = (z + 200 + off) % 30;
      let c = shade(base, 0.95 + 0.1 * hash2(p, Math.floor((z + 200 + off) / 30), 4));
      if (col === 0) c = shade(c, 0.8);
      if (along === 0) c = 0x7a4a26;
      if ((along === 2 || along === 28) && (col === 2 || col === 4)) c = 0x6a5446;
      if (hash3(x, z, 77) < 0.004) c = shade(base, 0.74);
      R.set(x, -1, z, c);
      R.set(x, -2, z, shade(base, 0.72));
    }
  }
  // foundation lip + a strip of meadow in front (the room is a little diorama)
  for (let x = X0 - 4; x <= X1 + 4; x++) for (let y = -6; y <= -3; y++) for (let z = ZF - 2; z <= ZF; z++) R.set(x, y, z, y === -3 ? 0x8a5a30 : y === -6 ? 0x6a4424 : 0x7c4e2a);
  const stones = [0x8f8a84, 0x9c968e, 0x7f7a74, 0xa8a198, 0x8a857f];
  for (let y = -12; y <= -7; y++) for (let x = X0 - 4; x <= X1 + 4; x++) for (let z = ZF - 2; z <= ZF; z++) {
    const row = Math.floor((y + 12) / 3), k = Math.floor((x + row * 3 + 300) / 6);
    R.set(x, y, z, (x + row * 3 + 300) % 6 === 0 || (y + 12) % 3 === 0 ? 0x5e5a56 : pick(stones, hash2(k, row, 31)));
  }
  for (let x = X0 - 8; x <= X1 + 8; x++) for (let z = ZF + 1; z <= ZF + 5; z++) {
    const g = hash2(x, z, 5);
    R.set(x, -13, z, g < 0.5 ? 0x6e993b : 0x7aa444);
    R.set(x, -14, z, 0x6a4a2e);
    if (z === ZF + 1 && g < 0.3) R.set(x, -12, z, 0x86ad48);
  }
  for (const [x, c] of [[-70, 0xf2c230], [-41, 0xffffff], [-6, 0xd9529b], [29, 0xffffff], [58, 0x7d63d8], [80, 0xf2c230]]) { R.set(x, -12, ZF + 2, 0x5a8a36); R.set(x, -11, ZF + 2, c); }
}

// back wall: wood wainscot, chair rail, butter-cream plaster, crown trim
function wallColor(x, y, seed) {
  if (y <= 2) return y === 2 ? TRIM_L : TRIM; // baseboard
  if (y <= 16) { // vertical planks
    const p = Math.floor((x + 400) / 4);
    let c = pick(WAIN, hash2(p, seed, 3));
    if ((x + 400) % 4 === 0) c = shade(c, 0.78);
    if (hash3(x, y, seed, 4) < 0.02) c = shade(c, 0.85);
    return c;
  }
  if (y <= 18) return y === 18 ? TRIM_L : TRIM; // chair rail
  if (y >= HT - 2) return y === HT - 1 ? TRIM_L : TRIM; // crown
  const n = hash2(Math.floor(x / 3), Math.floor(y / 3), seed + 9);
  let c = pick(PLASTER, n);
  if (hash3(x, y, seed, 2) < 0.03) c = shade(c, 0.96);
  return c;
}

function buildWalls(R) {
  // back wall z ZB-4..ZB-1
  for (let x = X0 - 4; x <= X1 + 4; x++) for (let y = 0; y < HT; y++) for (let z = ZB - 4; z <= ZB - 1; z++) {
    let c = wallColor(x, y, 1);
    if (z < ZB - 1) c = shade(c, 0.8);
    R.set(x, y, z, c);
  }
  // rails stick out a voxel
  for (let x = X0; x <= X1; x++) {
    R.set(x, 0, ZB, TRIM); R.set(x, 1, ZB, TRIM); R.set(x, 2, ZB, TRIM_L);
    R.set(x, 17, ZB, TRIM); R.set(x, 18, ZB, TRIM_L);
    R.set(x, HT - 2, ZB, TRIM); R.set(x, HT - 1, ZB, TRIM_L);
  }
  // side walls, cut down in steps toward the front (dollhouse)
  for (const side of [-1, 1]) {
    for (let z = ZB - 4; z <= ZF - 3; z++) {
      const top = Math.min(HT, Math.max(22, Math.floor((HT - Math.max(0, z - (ZB + 4)) * 0.75) / 4) * 4));
      for (let y = 0; y < top; y++) for (let t = 0; t < 4; t++) {
        const x = side < 0 ? X0 - 4 + t : X1 + 4 - t;
        let c = wallColor(z * 1 + 300, y, side < 0 ? 2 : 3);
        if (t < 3) c = shade(c, 0.82);
        if (y === top - 1) c = t === 3 ? TRIM_L : TRIM;
        R.set(x, y, z, c);
      }
    }
  }
}

// window cut into the back wall with blinds, sill and a plant
function buildWindow(R, GL, x0, x1, y0, y1, fx, side) {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = ZB - 4; z <= ZB - 1; z++) R.set(x, y, z, null);
  for (let z = ZB - 4; z <= ZB - 1; z++) {
    for (let y = y0 - 1; y <= y1 + 1; y++) { R.set(x0 - 1, y, z, WHITE_TRIM_D); R.set(x1 + 1, y, z, WHITE_TRIM_D); }
    for (let x = x0 - 1; x <= x1 + 1; x++) { R.set(x, y0 - 1, z, WHITE_TRIM_D); R.set(x, y1 + 1, z, WHITE_TRIM_D); }
  }
  // trim frame on the room side
  for (let x = x0 - 3; x <= x1 + 3; x++) for (let y = y0 - 3; y <= y1 + 3; y++) {
    const inside = x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1;
    if (!inside) R.set(x, y, ZB, (x + y) % 7 === 0 ? WHITE_TRIM_D : WHITE_TRIM);
  }
  // mullions + glass
  const mx = Math.round((x0 + x1) / 2), my = Math.round((y0 + y1) / 2);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    if (x === mx || y === my) R.set(x, y, ZB - 3, WHITE_TRIM);
    else GL.set(x, y, ZB - 3, 1);
  }
  // deep sill
  for (let x = x0 - 4; x <= x1 + 4; x++) for (let z = ZB; z <= ZB + 4; z++) { R.set(x, y0 - 2, z, WHITE_TRIM); R.set(x, y0 - 3, z, WHITE_TRIM_D); }
  for (let x = x0; x <= x1; x++) for (let z = ZB - 3; z < ZB; z++) R.set(x, y0 - 1, z, WHITE_TRIM_D);
  // venetian blind pulled half up: slats + bottom rail + cord
  const by = y1 - 9;
  for (let y = by; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if ((y1 - y) % 2 === 0) R.set(x, y, ZB - 1, y === by ? 0xd8cbb0 : 0xece2cc);
  }
  for (let x = x0; x <= x1; x++) R.set(x, by - 1, ZB - 1, 0xc4b494);
  R.box(x1 - 2, by - 8, ZB, x1 - 2, by - 1, ZB, 0xe8dcc0); R.set(x1 - 2, by - 9, ZB, 0xb89a6a);
  // things on the sill
  if (side < 0) {
    // potted geranium + a jar of pencils
    const px = x0 + 4;
    R.box(px - 2, y0 - 1, ZB + 1, px + 2, y0 + 2, ZB + 3, (x, y) => (y === y0 + 2 ? 0xb85a32 : 0xc8693a));
    for (const [dx, dy, c] of [[0, 3, 0x4a9a3a], [-1, 4, 0x5aaa4a], [1, 4, 0x4a9a3a], [-2, 5, 0x5aaa4a], [2, 5, 0x5aaa4a], [0, 5, 0x3a8a3a], [-1, 6, 0xe8404a], [1, 6, 0xf05a6a], [0, 7, 0xe8404a], [2, 7, 0xf05a6a], [-2, 7, 0xe8404a]]) R.set(px + dx, y0 + dy, ZB + 2, c);
    const jx = x1 - 4;
    for (let y = y0 - 1; y <= y0 + 2; y++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) GL.set(jx + dx, y, ZB + 2 + dz, 1);
    for (const [dx, h, c] of [[0, 5, 0xf2c230], [1, 6, 0xe0503a], [0, 4, 0x3a7ad8]]) for (let y = y0 - 1; y <= y0 - 1 + h; y++) R.set(jx + dx, y, ZB + 2 + (dx ? 1 : 0), y === y0 - 1 + h ? 0x3a2a1a : c);
  } else {
    // apple core... no: a tiny cactus and a stack of returned homework
    const px = x0 + 5;
    R.box(px - 1, y0 - 1, ZB + 1, px + 1, y0, ZB + 3, 0xc8693a);
    R.box(px, y0 + 1, ZB + 2, px, y0 + 4, ZB + 2, 0x4a9a4a); R.set(px - 1, y0 + 3, ZB + 2, 0x4a9a4a); R.set(px + 1, y0 + 2, ZB + 2, 0x5aaa5a); R.set(px, y0 + 5, ZB + 2, 0xff8ac0);
    R.box(x1 - 6, y0 - 1, ZB + 1, x1 - 2, y0, ZB + 3, (x, y) => (y === y0 ? PAPER : 0xe8dcc4));
    R.set(x1 - 4, y0 + 1, ZB + 2, 0xe03a3a);
  }
  fx.windows.push({ x0: W(x0), x1: W(x1 + 1), y0: W(y0), y1: W(by), my: W(my), mx: W(mx) });
}

// ================================================================== chalkboard
function buildBoardFrame(R, fx) {
  const bx0 = Math.round((BOARD.cx - BOARD.w / 2) / V), bx1 = Math.round((BOARD.cx + BOARD.w / 2) / V) - 1;
  const y0 = Math.round((BOARD.cy - BOARD.h / 2) / V), y1 = Math.round((BOARD.cy + BOARD.h / 2) / V) - 1;
  const FR = [0x8a5430, 0x9a603a, 0x7e4a2a];
  // frame (2 voxels) + a dark backing behind the slate
  for (let x = bx0 - 2; x <= bx1 + 2; x++) for (let y = y0 - 2; y <= y1 + 2; y++) {
    const ring = x < bx0 || x > bx1 || y < y0 || y > y1;
    if (ring) {
      const outer = x === bx0 - 2 || x === bx1 + 2 || y === y0 - 2 || y === y1 + 2;
      const c = outer ? FR[2] : pick(FR, hash2(Math.floor(x / 5), y, 4));
      R.set(x, y, ZB, c); R.set(x, y, ZB + 1, outer ? shade(c, 0.9) : c);
    } else R.set(x, y, ZB, 0x1c2a22);
  }
  // corner pegs
  for (const [x, y] of [[bx0 - 2, y0 - 2], [bx1 + 2, y0 - 2], [bx0 - 2, y1 + 2], [bx1 + 2, y1 + 2]]) R.set(x, y, ZB + 2, 0x6a3a20);
  // chalk tray with chalk sticks and a felt eraser
  for (let x = bx0 - 1; x <= bx1 + 1; x++) for (let z = ZB + 1; z <= ZB + 4; z++) R.set(x, y0 - 3, z, z === ZB + 4 ? 0x7a4626 : 0x9a603a);
  for (let x = bx0 - 1; x <= bx1 + 1; x++) R.set(x, y0 - 2, ZB + 4, 0x8a5430);
  for (let x = bx0 - 1; x <= bx1 + 1; x++) if (hash2(x, 3, 3) < 0.35) R.set(x, y0 - 2, ZB + 2, 0xd8d8cc); // dust
  const sticks = [[bx0 + 6, 0xf6f6ee], [bx0 + 10, 0xf7e07a], [bx0 + 13, 0xf6a8c4], [bx1 - 18, 0x98cff2], [bx1 - 15, 0xaddf8a]];
  for (const [x, c] of sticks) { R.box(x, y0 - 2, ZB + 2, x + 2, y0 - 2, ZB + 2, c); }
  // eraser: felt + wood back
  R.box(bx1 - 9, y0 - 2, ZB + 2, bx1 - 3, y0 - 2, ZB + 3, 0xd4d0c4);
  R.box(bx1 - 9, y0 - 1, ZB + 2, bx1 - 3, y0 - 1, ZB + 3, 0x9a603a);
  fx.boardVox = { bx0, bx1, y0, y1 };
  // the teacher's platform: planks on a skirted frame, with a little step at the right end
  const rx0 = Math.round(RISER.x0 / V), rx1 = Math.round(RISER.x1 / V) - 1, rz1 = Math.round(RISER.z1 / V) - 1, rh = Math.round(RISER.h / V) - 1;
  for (let x = rx0; x <= rx1; x++) for (let z = ZB; z <= rz1; z++) for (let y = 0; y <= rh; y++) {
    if (y < rh && z < rz1 && x > rx0 && x < rx1) continue;
    let c;
    if (y === rh) {
      const p = Math.floor((z - ZB + 100) / 5);
      c = (z - ZB) % 5 === 0 ? 0x8a5430 : pick([0xb87a44, 0xc4844a, 0xae7240], hash2(p, Math.floor((x + 200) / 17), 6));
      if (z === rz1) c = 0xd8a060;
    } else c = y === 0 ? 0x5e3519 : (x + y) % 9 === 0 ? 0x7a4626 : 0x8a5430;
    R.set(x, y, z, c);
  }
  for (let x = rx1 + 1; x <= rx1 + 6; x++) for (let z = ZB + 2; z <= rz1 - 2; z++) for (let y = 0; y <= 2; y++) R.set(x, y, z, y === 2 ? 0xc4844a : 0x8a5430);
}

// ================================================================== props
function book(R, x, y0, z0, h, depth, color) {
  for (let y = y0; y < y0 + h; y++) for (let z = z0; z < z0 + depth; z++) R.set(x, y, z, color);
  R.set(x, y0 + h - 2, z0 + depth - 1, shade(color, 1.35));
  R.set(x, y0 + 1, z0 + depth - 1, shade(color, 1.35));
}

const SPINES = [0xb83a32, 0x3a6a8a, 0xd89a3a, 0x5a3a7a, 0x3a7a4a, 0xc8b890, 0x8a2a3a, 0x2e4a6a, 0xe07a3a, 0x4a8ab8];

// low bookshelf under the left window
function buildBookshelf(R, fx) {
  const x0 = -90, x1 = -60, z0 = ZB, z1 = ZB + 9, top = 14;
  const wood = [0x7a4a2a, 0x8a5634, 0x6a3e22];
  R.box(x0, 0, z0, x1, top, z0, wood[1]);
  for (const sx of [x0, x1, Math.round((x0 + x1) / 2)]) R.box(sx, 0, z0, sx, top, z1, wood[0]);
  for (const y of [0, 7, top]) R.box(x0, y, z0, x1, y, z1, y === top ? wood[1] : wood[2]);
  R.box(x0 - 1, top + 1, z0, x1 + 1, top + 1, z1 + 1, 0x9a6038);
  // books on both shelves
  let i = 0;
  for (const y of [1, 8]) {
    for (let x = x0 + 1; x < x1; x++) {
      if (x === Math.round((x0 + x1) / 2)) continue;
      const h = 4 + Math.floor(hash2(x, y, 5) * 3);
      if (hash2(x, y, 9) < 0.12) continue;
      book(R, x, y, z0 + 1, h, 7, SPINES[i++ % SPINES.length]);
    }
  }
  // on top: a big leafy plant in a pot, a fish trophy and a globe-ish snow globe
  const px = x0 + 6, pz = z0 + 5;
  R.cylinder(px, top + 2, pz, 3.2, 5, (x, y) => (y === top + 6 ? 0xb85a32 : 0xd06a3a));
  R.box(px - 2, top + 6, pz - 2, px + 2, top + 6, pz + 2, 0x4a3020);
  fx.bigPlant = [px, top + 7, pz];
  // trophy (golden fish)
  const tx = x1 - 7, tz = z0 + 5;
  R.box(tx - 2, top + 2, tz - 1, tx + 2, top + 3, tz + 1, 0x3a2418); R.set(tx, top + 4, tz, GOLD_D);
  R.box(tx - 2, top + 5, tz, tx + 2, top + 7, tz, GOLD); R.box(tx - 1, top + 8, tz, tx + 1, top + 8, tz, GOLD); R.set(tx + 3, top + 6, tz, GOLD); R.set(tx + 4, top + 7, tz, GOLD_L); R.set(tx + 4, top + 5, tz, GOLD_L);
  R.set(tx - 1, top + 6, tz + 1, INK);
  // apple-shaped pencil sharpener + a few pencils
  R.box(x0 + 13, top + 2, z0 + 4, x0 + 15, top + 3, z0 + 6, 0x3a7ad8);
  for (const [dx, c] of [[0, 0xf2c230], [1, 0xe0503a], [2, 0x5aaa4a]]) R.box(x0 + 18 + dx * 2, top + 2, z0 + 3, x0 + 18 + dx * 2, top + 2, z0 + 8, c);
}

// teacher's desk: drawers, apple, globe, brass bell, books, mug, papers
const TDESK = { x0: 44, x1: 73, z0: ZB + 2, z1: ZB + 17, top: 13 };
function buildTeacherDesk(R, fx) {
  const { x0, x1, z0, z1, top } = TDESK;
  R.box(x0, top - 1, z0, x1, top, z1, (x, y, z) => (z === z1 || x === x0 || x === x1 ? (y === top ? DESK_L : DESK_D) : y === top ? DESK : DESK_D));
  // drawer pedestals (front faces +z) and a modesty panel
  for (const [a, b] of [[x0, x0 + 9], [x1 - 9, x1]]) {
    R.box(a, 0, z0 + 1, b, top - 2, z1, (x, y, z) => (z === z1 ? (y % 5 === 0 || x === a || x === b ? DESK_D : DESK) : DESK_D));
    for (const y of [2, 7]) R.box(Math.round((a + b) / 2) - 1, y + 1, z1 + 1, Math.round((a + b) / 2) + 1, y + 1, z1 + 1, GOLD_D);
  }
  R.box(x0 + 10, 4, z0 + 2, x1 - 10, top - 2, z0 + 2, DESK_D);
  // wood grain
  for (let x = x0 + 1; x < x1; x++) for (let z = z0; z < z1; z++) if (hash2(Math.floor(x / 4), z, 19) < 0.07) R.set(x, top, z, shade(DESK, 0.9));
  const S = top + 1;
  // red apple with a leaf
  const ax = x0 + 6, az = z1 - 4;
  R.ellipsoid(ax, S + 1.6, az, 2, 1.8, 2, (x, y, z) => (hash3(x, y, z, 3) < 0.25 ? 0xe8443a : y > S + 2 ? 0xd8302a : 0xb82424));
  R.set(ax, S + 4, az, 0x5a3a1a); R.set(ax + 1, S + 4, az, 0x5aaa3a); R.set(ax + 2, S + 5, az, 0x4a9a3a);
  R.set(ax - 1, S + 3, az + 1, 0xff8a7a);
  // stack of books
  R.box(x0 + 11, S, z1 - 8, x0 + 19, S + 1, z1 - 3, 0x3a6a8a); R.box(x0 + 11, S, z1 - 3, x0 + 19, S + 1, z1 - 3, PAPER);
  R.box(x0 + 12, S + 2, z1 - 8, x0 + 18, S + 3, z1 - 4, 0xb83a32); R.box(x0 + 12, S + 2, z1 - 4, x0 + 18, S + 3, z1 - 4, PAPER);
  R.box(x0 + 12, S + 4, z1 - 7, x0 + 17, S + 4, z1 - 4, 0x3a7a4a);
  // brass desk bell
  const bx = x0 + 23, bz = z1 - 4;
  R.cylinder(bx, S, bz, 2.2, 1, 0x3a2a1a);
  R.ellipsoid(bx, S + 1, bz, 2, 1.6, 2, (x, y) => (y > S + 1 ? GOLD : GOLD_D));
  R.set(bx, S + 3, bz, GOLD_L); R.set(bx, S + 4, bz, GOLD_D);
  R.set(bx - 1, S + 2, bz + 1, GOLD_L);
  // mug "#1" with pencils
  const mx = x1 - 6, mz = z1 - 5;
  R.cylinder(mx, S, mz, 1.6, 4, 0xf4f0e6); R.box(mx - 1, S + 1, mz + 2, mx + 1, S + 2, mz + 2, 0xe0503a);
  for (const [dx, dz, c] of [[0, 0, 0xf2c230], [1, 0, 0x3a7ad8], [0, 1, 0xe0503a]]) R.box(mx + dx, S + 4, mz + dz, mx + dx, S + 7, mz + dz, c);
  R.set(mx, S + 8, mz, 0xf6c0a0);
  // homework papers with a red A+
  R.box(x1 - 16, S, z1 - 9, x1 - 9, S, z1 - 3, PAPER); R.box(x1 - 15, S + 1, z1 - 8, x1 - 10, S + 1, z1 - 4, 0xfaf4e6);
  R.set(x1 - 13, S + 2, z1 - 6, 0xe03030); R.set(x1 - 12, S + 2, z1 - 6, 0xe03030); R.set(x1 - 11, S + 2, z1 - 5, 0xe03030);
  // globe stand (the globe itself spins, see buildClassroom)
  const gx = x1 - 4, gz = z0 + 5;
  R.cylinder(gx, S, gz, 2.4, 1, 0x3a2a1a); R.box(gx, S + 1, gz, gx, S + 3, gz, GOLD_D);
  for (let a = 0; a < 12; a++) { const t = (a / 12) * Math.PI * 1.2 - 0.3; R.set(gx + Math.round(Math.cos(t) * 4.5), S + 8 + Math.round(Math.sin(t) * 4.5), gz, GOLD_D); }
  fx.globe = [gx, S + 8, gz];
  fx.bell = [bx, S + 3, bz];
}

// student desk: wooden top, metal frame, book shelf, a pencil
function buildStudentDesk(R, cx, cz, seed) {
  const x0 = cx - 9, x1 = cx + 8, z0 = cz - 6, z1 = cz + 5, top = 9;
  R.box(x0, top, z0, x1, top + 1, z1, (x, y, z) => (y === top + 1 ? (z === z1 || x === x0 || x === x1 ? DESK_L : DESK) : DESK_D));
  // shelf under the top with a book
  R.box(x0 + 1, top - 3, z0 + 1, x1 - 1, top - 3, z1 - 3, METAL_D);
  book(R, x0 + 3, top - 2, z0 + 2, 2, 5, SPINES[seed % SPINES.length]);
  R.box(x0 + 4, top - 2, z0 + 2, x0 + 7, top - 2, z0 + 6, SPINES[(seed + 3) % SPINES.length]);
  // legs (metal tube frame with feet)
  for (const [x, z] of [[x0 + 1, z0 + 1], [x1 - 1, z0 + 1], [x0 + 1, z1 - 1], [x1 - 1, z1 - 1]]) {
    R.box(x, 1, z, x, top - 1, z, METAL);
    R.set(x, 0, z, METAL_D);
  }
  R.box(x0 + 1, 2, z0 + 1, x0 + 1, 2, z1 - 1, METAL); R.box(x1 - 1, 2, z0 + 1, x1 - 1, 2, z1 - 1, METAL);
  // pencil + eraser on the desk top
  const pz = z1 - 2;
  R.box(x1 - 7, top + 2, pz, x1 - 3, top + 2, pz, 0xf2c230); R.set(x1 - 2, top + 2, pz, 0xf6c8a0); R.set(x1 - 8, top + 2, pz, 0xf08aa0);
  if (seed % 2) { R.box(x0 + 2, top + 2, pz - 1, x0 + 3, top + 2, pz, 0xf6a8c4); }
}

// posters, alphabet strip, star chart, class rules (canvas textures)
function posterCanvas(kind) {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  if (kind === 'maple') {
    cv.width = 26; cv.height = 34;
    px(0, 0, 26, 34, '#f8f2e4'); px(0, 0, 26, 1, '#e0d6c0'); px(0, 33, 26, 1, '#d8ccb4');
    px(1, 1, 5, 32, '#d8241c'); px(20, 1, 5, 32, '#d8241c');
    const leaf = ['....R....', '...RRR...', '.R.RRR.R.', '.RRRRRRR.', 'RRRRRRRRR', '.RRRRRRR.', '..RRRRR..', '...RRR...', '....R....', '....R....'];
    leaf.forEach((row, y) => [...row].forEach((ch, x) => ch === 'R' && px(8 + x, 6 + y, 1, 1, '#d8241c')));
    pixelText(ctx, 'EH!', 13, 21, '#2a1c16', { font: 'small', align: 'center' });
    pixelText(ctx, 'O CANADA', 13, 27, '#d8241c', { font: 'small', align: 'center', scale: 1 });
  } else if (kind === 'moose') {
    cv.width = 28; cv.height = 36;
    px(0, 0, 28, 36, '#3a6aa0'); px(1, 1, 26, 34, '#5a8ac0');
    pixelText(ctx, 'READ', 14, 3, '#fff6d8', { font: 'small', align: 'center' });
    // moose head with glasses, holding a book
    const art = [
      'A.A........A.A',
      'AAA........AAA',
      '.AAAA....AAAA.',
      '....bbbbbb....',
      '...bbbbbbbb...',
      '...bkkbbkkb...',
      '...kwkkkkwk...',
      '...bkkbbkkb...',
      '....bbbbbb....',
      '....bbnnbb....',
      '.....bbbb.....',
      '..rrrrrrrrrr..',
      '..rWWWWrWWWr..',
      '..rWWWWrWWWr..',
      '..rrrrrrrrrr..',
    ];
    const pal = { A: '#e8d8a8', b: '#7a4a2a', k: '#1a1410', w: '#cfe8ff', n: '#3a2418', r: '#c8302a', W: '#f8f0dc' };
    art.forEach((row, y) => [...row].forEach((ch, x) => pal[ch] && px(7 + x, 9 + y, 1, 1, pal[ch])));
    pixelText(ctx, 'EH?', 14, 28, '#ffe07a', { font: 'small', align: 'center' });
  } else if (kind === 'rules') {
    cv.width = 24; cv.height = 28;
    px(0, 0, 24, 28, '#fff8e8'); px(0, 0, 24, 4, '#e8604a');
    pixelText(ctx, 'RULES', 12, 0, '#fff8e8', { font: 'small', align: 'center' });
    const lines = [['1 NO', 'EATING'], ['2 RAISE', 'FINS'], ['3 BE', 'NICE!']];
    let y = 6;
    for (const [a, b] of lines) { pixelText(ctx, a, 2, y, '#2a1c16', { font: 'small' }); pixelText(ctx, b, 4, y + 6, '#3a6aa0', { font: 'small' }); y += 7; }
    px(1, 26, 22, 1, '#e8d8c0');
  } else if (kind === 'stars') {
    cv.width = 30; cv.height = 26;
    px(0, 0, 30, 26, '#fdf4dc'); px(0, 0, 30, 5, '#5a9a4a');
    pixelText(ctx, 'STARS', 15, 0, '#fff8e0', { font: 'small', align: 'center' });
    const names = ['PIP', 'BOB', 'GOLD', 'MAP'];
    names.forEach((n, i) => {
      pixelText(ctx, n, 1, 7 + i * 5, '#2a1c16', { font: 'small' });
      const k = [3, 2, 4, 1][i];
      for (let s = 0; s < k; s++) { px(17 + s * 3, 8 + i * 5, 2, 2, '#f0c030'); px(18 + s * 3, 7 + i * 5, 1, 1, '#ffe27a'); }
    });
  } else if (kind === 'alpha') {
    const N = 26, CW = 13;
    cv.width = N * CW + 2; cv.height = 11;
    const cols = ['#d8403a', '#3a7ad8', '#3aa04a', '#e0a020', '#9a4ac0'];
    for (let i = 0; i < N; i++) {
      const x = 1 + i * CW;
      px(x, 0, CW - 1, 11, '#fdf8ec'); px(x, 10, CW - 1, 1, '#d8ccb4');
      const ch = String.fromCharCode(65 + i);
      pixelText(ctx, ch, x + 6, 2, cols[i % cols.length], { font: 'big', align: 'center' });
      pixelText(ctx, ch, x + 10, 6, '#8a7a6a', { font: 'small', align: 'center' }); // tiny echo
      px(x + 1, 0, 1, 1, '#e04040');
    }
  } else if (kind === 'clock') {
    cv.width = 18; cv.height = 18;
  } else if (kind === 'name') {
    cv.width = 34; cv.height = 9;
  }
  return cv;
}

// window view: blue sky, clouds, a pine ridge and a distant mountain
function drawWindowView(ctx, w, h, night, time) {
  ctx.fillStyle = night ? '#141c3a' : '#8ac8ee'; ctx.fillRect(0, 0, w, h);
  if (!night) { ctx.fillStyle = '#a8daf6'; ctx.fillRect(0, Math.round(h * 0.45), w, h); }
  else for (let i = 0; i < 14; i++) { ctx.fillStyle = i % 3 ? '#cfd8ff' : '#fff6c8'; ctx.fillRect((i * 37) % w, (i * 13) % Math.round(h * 0.5), 1, 1); }
  // mountain
  ctx.fillStyle = night ? '#2a3458' : '#8aa0c8';
  for (let x = 0; x < w; x++) { const y = Math.round(h * 0.42 + Math.abs(x - w * 0.62) * 0.55); ctx.fillRect(x, y, 1, h); }
  ctx.fillStyle = night ? '#d8e0ff' : '#ffffff';
  for (let x = Math.round(w * 0.55); x < w * 0.7; x++) { const y = Math.round(h * 0.42 + Math.abs(x - w * 0.62) * 0.55); ctx.fillRect(x, y, 1, 2); }
  // clouds drift
  if (!night) {
    ctx.fillStyle = '#ffffff';
    for (const [cx, cy, s] of [[10, 8, 1], [48, 14, 0.8], [80, 6, 1.2]]) {
      const x = Math.round(((cx + time * 1.5 * s) % (w + 30)) - 15);
      ctx.fillRect(x, cy, 12 * s, 3); ctx.fillRect(x + 3, cy - 2, 6 * s, 2);
    }
  }
  // pine ridge
  for (let i = 0; i < 16; i++) {
    const x = Math.round(i * (w / 14) - 4 + (i % 2) * 3), th = 10 + ((i * 7) % 5) * 2;
    const base = Math.round(h * 0.82);
    ctx.fillStyle = night ? '#16301e' : i % 2 ? '#2e6a36' : '#3a7a40';
    for (let y = 0; y < th; y++) { const hw = Math.round(y * 0.42); ctx.fillRect(x - hw, base - th + y, hw * 2 + 1, 1); }
  }
  ctx.fillStyle = night ? '#1e3a26' : '#5a9a3e'; ctx.fillRect(0, Math.round(h * 0.82), w, h);
}

// ================================================================== fishbowl
function bowlModels() {
  const GL = new VoxelModel(), WT = new VoxelModel(), R = new VoxelModel();
  const r = 6.2, cy = 6;
  for (let x = -7; x <= 7; x++) for (let y = 0; y <= 12; y++) for (let z = -7; z <= 7; z++) {
    const d = Math.hypot(x, (y - cy) * 1.0, z);
    if (y > 10) continue; // open top
    if (d <= r && d > r - 1.1) GL.set(x, y, z, 1);
    else if (d <= r - 1.1 && y <= 8) WT.set(x, y, z, y === 8 ? 0x9ae0ff : 0x5ab8e8);
  }
  // rim
  for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; GL.set(Math.round(Math.cos(t) * 4.2), 11, Math.round(Math.sin(t) * 4.2), 1); }
  // gravel + a little plant + a castle stone
  const gravel = [0xf2c230, 0xe86a8a, 0x5ab8e8, 0xf4f0e6, 0x8ad05a];
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) if (x * x + z * z <= 17) { R.set(x, 1, z, gravel[Math.floor(hash2(x, z, 3) * gravel.length)]); WT.set(x, 1, z, null); }
  for (const [x, y, z] of [[-3, 2, -1], [-3, 3, -1], [-2, 4, -1], [-3, 5, -1], [-4, 4, -1]]) { R.set(x, y, z, 0x3a9a4a); WT.set(x, y, z, null); }
  for (const [x, y, z] of [[3, 2, -2], [3, 3, -2], [2, 2, -2]]) { R.set(x, y, z, 0x8a8a90); WT.set(x, y, z, null); }
  return { GL, WT, R };
}

// ================================================================== fish students
const STUDENTS = [
  { id: 'pip', name: 'PIP', species: 'pumpkinseed', desk: [-58, -10], acc: null },
  { id: 'bubbles', name: 'BUBBLES', species: 'bluegill', desk: [-9, -10], acc: 'glasses', nerd: true },
  { id: 'goldie', name: 'GOLDIE', species: 'goldfish', desk: [40, -10], acc: 'bow' },
  { id: 'percy', name: 'PERCY', species: 'perch', desk: [-58, 21], acc: 'sleep', sleepy: true },
  { id: 'maple', name: 'MAPLE', species: 'mapleKoi', desk: [-9, 21], acc: 'star' },
  { id: 'chub', name: 'CHUB', species: 'creekchub', desk: [40, 21], acc: 'cap' },
];

// find the eye (white shine next to a dark pupil) on a fish sprite canvas
function findEye(cv) {
  const { width: w, height: h } = cv;
  const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const at = (x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
  let best = null, bd = Infinity;
  for (let y = 1; y < h - 1; y++) for (let x = Math.floor(w * 0.5); x < w - 1; x++) {
    const [r, g, b, a] = at(x, y);
    if (a < 200 || r < 245 || g < 245 || b < 245) continue;
    let dark = false;
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]]) { const c = at(x + dx, y + dy); if (c[3] > 200 && c[0] + c[1] + c[2] < 200) dark = true; }
    if (!dark) continue;
    const dd = Math.hypot(x - w * 0.82, y - h * 0.42);
    if (dd < bd) { bd = dd; best = [x, y]; }
  }
  return best ? { x: best[0] + 0.5, y: best[1] + 0.8 } : { x: w * 0.8, y: h * 0.42 };
}

// paint an accessory onto one swim frame (in place)
function paintAccessory(cv, kind, eye) {
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const w = cv.width, h = cv.height;
  const P = (x, y, c) => { if (x >= 0 && y >= 0 && x < w && y < h) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); } };
  const ex = Math.round(eye.x), ey = Math.round(eye.y);
  if (kind === 'glasses') {
    const ring = [[-2, -1], [-2, 0], [-2, 1], [-1, -2], [0, -2], [1, -2], [2, -1], [2, 0], [2, 1], [-1, 2], [0, 2], [1, 2]];
    for (const [dx, dy] of ring) P(ex + dx, ey + dy, '#2b1d16');
    P(ex + 1, ey - 1, '#dff4ff');
    for (let k = 3; k <= 6; k++) P(ex - k, ey - 1 + (k > 4 ? 0 : 0), '#2b1d16'); // temple arm
  } else if (kind === 'sleep') {
    // sample the body colour just behind the eye, cover the eye, draw a closed lid
    const s = ctx.getImageData(Math.max(0, ex - 4), ey, 1, 1).data;
    const body = `rgb(${s[0]},${s[1]},${s[2]})`;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const a = ctx.getImageData(ex + dx, ey + dy, 1, 1).data;
      if (a[3] > 0) P(ex + dx, ey + dy, body);
    }
    for (const [dx, dy] of [[-2, 0], [-1, 1], [0, 1], [1, 1], [2, 0]]) P(ex + dx, ey + dy, '#2b1d16');
  } else if (kind === 'bow') {
    const bx = ex - 3;
    let top = 0;
    for (let y = 0; y < h; y++) { if (ctx.getImageData(bx, y, 1, 1).data[3] > 0) { top = y; break; } }
    const bow = ['PP.PP', 'PPKPP', 'PP.PP'];
    bow.forEach((row, dy) => [...row].forEach((ch, dx) => {
      if (ch === 'P') P(bx - 2 + dx, top - 2 + dy, dy === 0 && (dx === 0 || dx === 4) ? '#ff9ac8' : '#ff5a9a');
      if (ch === 'K') P(bx - 2 + dx, top - 2 + dy, '#c8306a');
    }));
  } else if (kind === 'cap') {
    // a tiny red toque with a pompom
    const bx = ex - 2;
    let top = 0;
    for (let y = 0; y < h; y++) { if (ctx.getImageData(bx, y, 1, 1).data[3] > 0) { top = y; break; } }
    const cap = ['..W..', '.RRR.', 'RRRRR', 'WWWWW'];
    cap.forEach((row, dy) => [...row].forEach((ch, dx) => {
      if (ch === 'R') P(bx - 2 + dx, top - 3 + dy, dx % 2 ? '#c8302a' : '#e0443a');
      if (ch === 'W') P(bx - 2 + dx, top - 3 + dy, '#f4f0e6');
    }));
  } else if (kind === 'star') {
    // gold star sticker on the cheek
    const sx = ex - 4, sy = ey + 3;
    for (const [dx, dy] of [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1], [-1, 1], [1, 1]]) P(sx + dx, sy + dy, dx === 0 && dy === -1 ? '#fff6a0' : '#f0c030');
  }
}

// little reaction icons above the bowls (pixel art)
const REACT_ART = {
  heart: { rows: ['.PP.PP.', 'PpPPPPP', 'PPPPPPP', '.PPPPP.', '..PPP..', '...P...'], pal: { P: '#ff5a8a', p: '#ffc0d8' } },
  bang: { rows: ['.KKKKK.', 'KYYYYYK', 'KYYKYYK', 'KYYKYYK', 'KYYKYYK', 'KYYYYYK', 'KYYKYYK', 'KYYYYYK', '.KKKKK.', '..KK...', '.K.....'], pal: { K: '#2a1c16', Y: '#ffe060' } },
  question: { rows: ['.KKKKK.', 'KWWWWWK', 'KWKKKWK', 'KWWWKWK', 'KWWKWWK', 'KWWWWWK', 'KWWKWWK', 'KWWWWWK', '.KKKKK.', '..KK...', '.K.....'], pal: { K: '#2a1c16', W: '#f4f8ff' } },
  zzz: { rows: ['....ZZZZ', '......Z.', '.....Z..', '....ZZZZ', 'ZZZ.....', '..Z.....', '.Z......', 'ZZZ.....'], pal: { Z: '#cfe0ff' } },
  star: { rows: ['...Y...', '..YYY..', 'YYYwYYY', '.YYYYY.', '.YY.YY.', 'Y.....Y'], pal: { Y: '#ffd23a', w: '#fff8c0' } },
  note: { rows: ['..LLLL', '..L..L', '..L..L', '..L..L', 'LLL.LL', 'LLL.LL'], pal: { L: '#c8a0ff' } },
  sweat: { rows: ['..B.', '.BB.', 'BBwB', 'BBBB', '.BB.'], pal: { B: '#7ac8ff', w: '#e8f8ff' } },
  laugh: { rows: ['K..K.K..K', 'K..K.K..K', 'KKKK.KKKK', 'K..K.K..K', 'K..K.K..K'], pal: { K: '#ffe060' } },
  sparkle: { rows: ['...W...', '...W...', '..WYW..', 'WWYYYWW', '..WYW..', '...W...', '...W...'], pal: { W: '#ffffff', Y: '#ffe060' } },
  wow: { rows: ['.KKKKKKK.', 'KWWWWWWWK', 'KWKWKWKWK', 'KWKWKWKWK', 'KWWWWWWWK', 'KWKWKWKWK', 'KWWWWWWWK', '.KKKKKKK.', '..KK.....', '.K.......'], pal: { K: '#2a1c16', W: '#ffe8f0' } },
};
const reactTex = new Map();
function reactTexture(kind) {
  if (reactTex.has(kind)) return reactTex.get(kind);
  const a = REACT_ART[kind] || REACT_ART.bang;
  const w = Math.max(...a.rows.map((r) => r.length)) + 2, h = a.rows.length + 2;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  // 1px dark outline around coloured pixels for readability
  const filled = (x, y) => a.rows[y]?.[x] && a.rows[y][x] !== '.';
  for (let y = -1; y <= a.rows.length; y++) for (let x = -1; x <= w; x++) {
    if (filled(x, y)) continue;
    let n = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (filled(x + dx, y + dy)) n = true;
    if (n && kind !== 'bang' && kind !== 'question' && kind !== 'wow') { ctx.fillStyle = '#2a1c16'; ctx.fillRect(x + 1, y + 1, 1, 1); }
  }
  a.rows.forEach((row, y) => [...row].forEach((ch, x) => { if (a.pal[ch]) { ctx.fillStyle = a.pal[ch]; ctx.fillRect(x + 1, y + 1, 1, 1); } }));
  const t = canvasTex(cv);
  const out = { tex: t, w, h };
  reactTex.set(kind, out);
  return out;
}

// raised fin "hand" sprite in the fish's own colours
function finCanvas(fishCv) {
  const s = fishCv.getContext('2d', { willReadFrequently: true }).getImageData(2, Math.floor(fishCv.height / 2), 1, 1).data;
  const fin = s[3] ? `rgb(${s[0]},${s[1]},${s[2]})` : '#7ab0e0';
  const cv = document.createElement('canvas');
  cv.width = 7; cv.height = 9;
  const ctx = cv.getContext('2d');
  const rows = ['..k....', '.kfk...', '.kffk..', 'kfrfk..', 'kffrfk.', 'kfrffk.', '.kfrfk.', '..kffk.', '...kk..'];
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    ctx.fillStyle = ch === 'k' ? '#2a1c16' : ch === 'r' ? 'rgba(255,255,255,0.45)' : fin;
    ctx.fillRect(x, y, 1, 1);
    if (ch === 'r') { ctx.fillStyle = fin; ctx.globalAlpha = 0.6; ctx.fillRect(x, y, 1, 1); ctx.globalAlpha = 1; }
  }));
  return cv;
}

// ================================================================== main
/**
 * Build the classroom. opts.chalkboard: an existing Chalkboard to use as the
 * board surface (default: a new 192x108 one).
 * Returns { group, anchors, board, students, update(dt, time, camera), setNight(on), setClock(hour), dispose(), lights }.
 */
export function buildClassroom(opts = {}) {
  const t0 = performance.now();
  const group = new THREE.Group();
  group.name = 'Classroom';
  const disposables = new Set();
  const track = (x) => { disposables.add(x); return x; };

  const litMat = track(grainLambert({}, 0.1));
  const glowMat = track(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const glassMat = track(new THREE.MeshBasicMaterial({ color: 0xd8f2ff, transparent: true, opacity: 0.13, depthWrite: false }));
  const waterMat = track(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.26, depthWrite: false }));
  const moteMat = track(new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));

  const fx = { windows: [] };
  const R = new VoxelModel(), G = new VoxelModel(), GL = new VoxelModel(), WT = new VoxelModel();
  buildFloor(R);
  buildWalls(R);
  buildWindow(R, GL, -86, -65, 21, 48, fx, -1);
  buildWindow(R, GL, 48, 69, 21, 48, fx, 1);
  buildBoardFrame(R, fx);
  buildBookshelf(R, fx);
  buildTeacherDesk(R, fx);
  for (const s of STUDENTS) buildStudentDesk(R, s.desk[0], s.desk[1], STUDENTS.indexOf(s));
  // rug under the student desks (braided border)
  for (let x = -78; x <= 60; x++) for (let z = -24; z <= 36; z++) {
    const e = Math.min(x + 78, 60 - x, z + 24, 36 - z);
    if (R.has(x, 0, z)) continue;
    let c = e < 2 ? 0xa83a32 : e < 3 ? 0xe8d8b0 : e < 5 ? 0x3a6a8a : (Math.floor((x + 100) / 6) + Math.floor((z + 100) / 6)) % 2 ? 0xd8c49a : 0xcfb98c;
    if (e < 2 && (x + z) % 3 === 0) c = 0xc04a3a;
    R.set(x, 0, z, c);
  }
  // hockey stick + puck in the right corner, toque on a hook
  {
    const hx = X1 - 3, hz = ZB + 3;
    R.line(hx, 2, hz + 2, hx - 1, 30, hz, 0x8a5a2a, 0);
    R.line(hx + 1, 2, hz + 2, hx, 30, hz, 0x7a4a22, 0);
    R.box(hx - 8, 0, hz + 2, hx, 1, hz + 3, 0x2a2a30); R.box(hx - 8, 1, hz + 2, hx - 5, 1, hz + 3, 0xf4f0e6);
    for (let y = 26; y <= 28; y++) R.set(hx, y, hz + 1, 0xf4f0e6);
    R.cylinder(hx - 12, 0, hz + 9, 1.6, 1, 0x1a1a1e);
    // coat hooks with a red toque and a striped scarf
    R.box(76, 36, ZB, 88, 37, ZB, TRIM);
    R.set(78, 35, ZB + 1, 0x8a8a90); R.set(86, 35, ZB + 1, 0x8a8a90);
    R.ellipsoid(78, 31, ZB + 2, 2.2, 2.6, 1.4, (x, y) => (y <= 29 ? 0xf4f0e6 : (x + y) % 2 ? 0xc8302a : 0xe0443a));
    R.set(78, 34, ZB + 2, 0xf8f6f0);
    for (let y = 22; y <= 34; y++) { R.set(86, y, ZB + 1, Math.floor(y / 2) % 2 ? 0x3a7ad8 : 0xf2c230); R.set(87, y, ZB + 1, Math.floor(y / 2) % 2 ? 0x2a6ac8 : 0xe0b020); }
  }
  // trash can with crumpled paper
  R.cylinder(-74, 0, ZB + 14, 2.6, 7, (x, y) => (y === 6 ? 0x8a8a90 : y % 3 === 0 ? 0x6a6a72 : 0x7a7a82));
  for (const [x, y, z] of [[-74, 7, ZB + 14], [-75, 7, ZB + 13], [-73, 8, ZB + 14], [-70, 0, ZB + 17]]) R.set(x, y, z, 0xf4f0e6);
  // clock on the wall (face is a canvas; hands animate)
  const CLK = { x: 30, y: 49 };
  for (let a = 0; a < 48; a++) { const t = (a / 48) * Math.PI * 2; R.set(CLK.x + Math.round(Math.cos(t) * 4.4), CLK.y + Math.round(Math.sin(t) * 4.4), ZB, 0x3a2418); }
  R.box(CLK.x - 3, CLK.y - 3, ZB, CLK.x + 3, CLK.y + 3, ZB, 0xf4ecd8);

  const addMesh = (geo, mat, { cast = true, receive = true, name } = {}) => {
    const m = new THREE.Mesh(track(geo), mat);
    m.castShadow = cast; m.receiveShadow = receive;
    if (name) m.name = name;
    group.add(m);
    return m;
  };
  addMesh(R.build({ scale: V }), litMat, { name: 'classRoom' });
  if (G.vox.size) addMesh(G.build({ scale: V, ao: false }), glowMat, { cast: false, receive: false });
  GL.paint(() => 0xffffff);
  addMesh(GL.build({ scale: V, ao: false }), glassMat, { cast: false, receive: false, name: 'classGlass' });
  if (WT.vox.size) addMesh(WT.build({ scale: V, ao: false }), waterMat, { cast: false, receive: false });

  const place = (vm, pos, { pivot = [0, 0, 0], mat = litMat, rotY = 0, parent = group, cast = true, name, ao = true } = {}) => {
    const m = new THREE.Mesh(track(vm.build({ pivot, scale: V, ao })), mat);
    m.position.set(W(pos[0]), W(pos[1]), W(pos[2]));
    m.rotation.y = rotY;
    m.castShadow = cast; m.receiveShadow = mat === litMat;
    if (name) m.name = name;
    parent.add(m);
    return m;
  };

  // ---- the chalkboard surface (Chalkboard canvas)
  const chalk = opts.chalkboard || new Chalkboard({ w: BOARD.texW, h: BOARD.texH, seed: 21 });
  const boardTex = track(canvasTex(chalk.canvas));
  const boardMat = track(new THREE.MeshLambertMaterial({ map: boardTex, emissive: 0xffffff, emissiveMap: boardTex, emissiveIntensity: 0.32 }));
  const boardMesh = new THREE.Mesh(track(new THREE.PlaneGeometry(BOARD.w, BOARD.h)), boardMat);
  boardMesh.position.set(BOARD.cx, BOARD.cy, BOARD.z);
  boardMesh.receiveShadow = true;
  boardMesh.name = 'chalkboard';
  group.add(boardMesh);
  let boardVer = -1;
  const board = {
    chalk, mesh: boardMesh, texture: boardTex,
    center: new THREE.Vector3(BOARD.cx, BOARD.cy, BOARD.z), width: BOARD.w, height: BOARD.h, normal: new THREE.Vector3(0, 0, 1),
    /** board uv (u right, v down, 0..1) -> world point on the surface (+lift toward the room) */
    uvToWorld(u, v, out = new THREE.Vector3(), lift = 0.004) {
      return out.set(BOARD.cx + (u - 0.5) * BOARD.w, BOARD.cy + (0.5 - v) * BOARD.h, BOARD.z + lift);
    },
    /** board pixel -> world */
    pxToWorld(x, y, out = new THREE.Vector3(), lift = 0.004) { return this.uvToWorld(x / chalk.w, y / chalk.h, out, lift); },
    /** world point of a drawn item's centre (or null) */
    itemWorld(id, out = new THREE.Vector3()) { const it = chalk.item(id); return it ? this.uvToWorld(it.u, it.v, out) : null; },
  };

  // ---- posters + alphabet strip
  const poster = (kind, x, y, w, h, z = ZB * V + 0.006, emissive = 0.12) => {
    const cv = posterCanvas(kind);
    const tex = track(canvasTex(cv));
    const m = new THREE.Mesh(track(new THREE.PlaneGeometry(w, h)), track(new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: emissive })));
    m.position.set(x, y, z);
    m.receiveShadow = true;
    m.name = 'poster_' + kind;
    group.add(m);
    return { mesh: m, cv, tex };
  };
  poster('maple', -2.66, 1.52, 0.65, 0.85);
  poster('rules', -1.92, 1.22, 0.42, 0.49);
  poster('stars', 1.42, 1.28, 0.6, 0.52);
  poster('moose', 4.02, 1.62, 0.62, 0.8);
  poster('alpha', 0, 2.82, 8.6, 0.27);
  // tape corners on the posters
  {
    const tape = new VoxelModel();
    for (const [x, y] of [[-66, 38], [-41, 38], [-46, 29], [-31, 29], [16, 30], [40, 30], [69, 40], [92, 40]]) { tape.box(x, y, 0, x + 1, y, 0, 0xf4ecc8); }
    place(tape, [0, 0, ZB], { name: 'tape' });
  }
  // clock face (canvas) + pendulum-free school clock hands
  const clockCv = posterCanvas('clock');
  const clockTex = track(canvasTex(clockCv));
  const clockFace = new THREE.Mesh(track(new THREE.PlaneGeometry(W(9), W(9))), track(new THREE.MeshLambertMaterial({ map: clockTex, emissive: 0xffffff, emissiveMap: clockTex, emissiveIntensity: 0.25 })));
  clockFace.position.set(W(CLK.x + 0.5), W(CLK.y + 0.5), W(ZB + 1) + 0.003);
  group.add(clockFace);
  let clockHour = 9.0;
  const drawClock = () => {
    const c = clockCv.getContext('2d');
    const w = clockCv.width, cx = 9, cy = 9;
    c.clearRect(0, 0, w, w);
    c.fillStyle = '#3a2418'; c.beginPath(); c.arc(cx, cy, 9, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fbf4e2'; c.beginPath(); c.arc(cx, cy, 8, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#3a2418';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.fillRect(Math.round(cx + Math.sin(a) * 6.5 - 0.5), Math.round(cy - Math.cos(a) * 6.5 - 0.5), 1, 1); }
    const hand = (a, len, col) => { c.fillStyle = col; for (let k = 0; k <= len; k += 0.5) c.fillRect(Math.round(cx + Math.sin(a) * k - 0.5), Math.round(cy - Math.cos(a) * k - 0.5), 1, 1); };
    hand(((clockHour % 12) / 12) * Math.PI * 2, 3.6, '#2a1c16');
    hand(((clockHour % 1)) * Math.PI * 2, 5.6, '#2a1c16');
    c.fillStyle = '#e03a3a'; c.fillRect(cx - 1, cy - 1, 2, 2);
    clockTex.needsUpdate = true;
  };
  drawClock();

  // ---- globe (spins) on the teacher's desk
  const globeV = new VoxelModel();
  globeV.ellipsoid(0, 0, 0, 3.6, 3.6, 3.6, (x, y, z) => {
    const n = hash3(Math.floor((x + 8) / 2), Math.floor((y + 8) / 2), Math.floor((z + 8) / 2), 4);
    return Math.abs(y) > 3 ? 0xf4f8ff : n < 0.42 ? (n < 0.2 ? 0x6aa84a : 0x5a9a3a) : (n > 0.85 ? 0x5ab0e8 : 0x3a8ad8);
  });
  const globe = place(globeV, fx.globe, { name: 'globe' });
  globe.rotation.z = 0.35;

  // ---- big leafy plant (sways)
  const plantV = new VoxelModel();
  const pr = mulberry32(5);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, len = 5 + pr() * 4;
    for (let k = 0; k <= len; k++) {
      const x = Math.round(Math.cos(a) * k * 0.6), z = Math.round(Math.sin(a) * k * 0.6), y = Math.round(k * 0.9 - (k * k) / (len * 2.2));
      plantV.set(x, y, z, k > len - 2 ? 0x6ac04a : k % 2 ? 0x4a9a3a : 0x5aaa44);
      if (k > 2) plantV.set(x + (i % 2), y, z + ((i + 1) % 2), 0x3a8a34);
    }
  }
  const plant = place(plantV, fx.bigPlant, { name: 'plant' });

  // ---- window views + god rays
  const views = [];
  for (const wv of fx.windows) {
    const VW = 48, VH = 56;
    const cv = document.createElement('canvas'); cv.width = VW; cv.height = VH;
    const tex = track(canvasTex(cv));
    const m = new THREE.Mesh(track(new THREE.PlaneGeometry(wv.x1 - wv.x0 + 0.2, W(48 - 21 + 1) + 0.2)), track(new THREE.MeshBasicMaterial({ map: tex })));
    m.position.set((wv.x0 + wv.x1) / 2, W(21) + W(28) / 2, W(ZB - 4) - 0.02);
    group.add(m);
    views.push({ cv, ctx: cv.getContext('2d'), tex, w: VW, h: VH, seed: views.length * 20 });
  }
  const WIN_DIR = new THREE.Vector3(0.16, -0.6, 0.78).normalize();
  const beamMat = track(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  {
    const pos = [], col = [], idx = [];
    for (const wv of fx.windows) {
      const panes = [[wv.x0, wv.mx - 0.03, wv.y0, wv.my - 0.03], [wv.mx + 0.05, wv.x1, wv.y0, wv.my - 0.03], [wv.x0, wv.mx - 0.03, wv.my + 0.05, wv.y1], [wv.mx + 0.05, wv.x1, wv.my + 0.05, wv.y1]];
      for (const [xa, xb, ya, yb] of panes) {
        if (yb <= ya) continue;
        const base = pos.length / 3;
        const corners = [[xa, ya], [xb, ya], [xb, yb], [xa, yb]];
        const zw = ZB * V - 0.02;
        for (const [x, y] of corners) { pos.push(x, y, zw); col.push(1, 1, 1); }
        for (const [x, y] of corners) { const t = (y - 0.02) / -WIN_DIR.y; pos.push(x + WIN_DIR.x * t, 0.02, zw + WIN_DIR.z * t); col.push(0, 0, 0); }
        for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0]]) idx.push(base + a, base + b, base + 4 + b, base + a, base + 4 + b, base + 4 + a);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(track(g), beamMat);
    m.renderOrder = 5;
    m.name = 'windowBeams';
    group.add(m);
  }
  // dust motes drifting in the light
  const motes = [];
  {
    const geo = track(new THREE.BoxGeometry(0.022, 0.022, 0.022));
    for (let i = 0; i < 26; i++) {
      const r = mulberry32(i * 17 + 3);
      const wv = fx.windows[i % fx.windows.length];
      const t = 0.1 + r() * 0.8, y0 = wv.y0 + r() * (wv.y1 - wv.y0), x0 = wv.x0 + r() * (wv.x1 - wv.x0);
      const tt = (y0 / -WIN_DIR.y) * t;
      const m = new THREE.Mesh(geo, moteMat);
      m.userData = { x: x0 + WIN_DIR.x * tt, y: y0 + WIN_DIR.y * tt, z: ZB * V + WIN_DIR.z * tt, s: 0.3 + r() * 0.5, p: r() * 10 };
      group.add(m);
      motes.push(m);
    }
  }

  // ---- invisible lid: casts shadow so sunlight only enters through the windows
  {
    const lid = new THREE.Mesh(track(new THREE.BoxGeometry(10.2, 0.1, 6.4)), track(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })));
    lid.position.set(0, HT * V + 0.05, -0.2);
    lid.castShadow = true;
    group.add(lid);
  }

  // ---- fishbowls + students
  const bowl = bowlModels();
  const bowlGlassGeo = track(bowl.GL.paint(() => 0xffffff).build({ scale: V, ao: false }));
  const bowlWaterGeo = track(bowl.WT.build({ scale: V, ao: false }));
  const bowlInGeo = track(bowl.R.build({ scale: V }));
  const bubbleGeo = track(new THREE.BoxGeometry(0.03, 0.03, 0.03));
  const bubbleMat = track(new THREE.MeshBasicMaterial({ color: 0xeefaff, transparent: true, opacity: 0.85 }));
  const students = [];
  const fishTarget = 0.46; // billboard width
  for (const S of STUDENTS) {
    const bx = W(S.desk[0]), bz = W(S.desk[1]) + 0.02, by = W(11);
    const bg = new THREE.Group();
    bg.position.set(bx, by, bz);
    group.add(bg);
    const gm = new THREE.Mesh(bowlGlassGeo, glassMat); gm.renderOrder = 3; bg.add(gm);
    const wm = new THREE.Mesh(bowlWaterGeo, waterMat); wm.renderOrder = 2; bg.add(wm);
    const im = new THREE.Mesh(bowlInGeo, litMat); im.receiveShadow = true; bg.add(im);
    // fish sprite strip: 4 swim frames side by side (+ painted accessories)
    const frames = [0, 1, 2, 3].map((f) => {
      const src = fishCanvasFor(S.species, { frame: f });
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
      return c;
    });
    const fw = frames[0].width, fh = frames[0].height;
    const eye = findEye(frames[0]);
    if (S.acc) for (const c of frames) paintAccessory(c, S.acc, findEye(c) || eye);
    // headroom above the sprite for bows / caps
    const pad = 4;
    const strip = document.createElement('canvas');
    strip.width = fw * 4; strip.height = fh + pad;
    const sctx = strip.getContext('2d');
    frames.forEach((c, i) => sctx.drawImage(c, i * fw, pad));
    // repaint the accessories that poke above the sprite into the padding
    if (S.acc === 'bow' || S.acc === 'cap') {
      frames.forEach((c, i) => {
        const tmp = document.createElement('canvas');
        tmp.width = fw; tmp.height = fh + pad;
        const t = tmp.getContext('2d', { willReadFrequently: true });
        t.drawImage(fishCanvasFor(S.species, { frame: i }), 0, pad);
        paintAccessory(tmp, S.acc, (() => { const e = findEye(fishCanvasFor(S.species, { frame: i })); return { x: e.x, y: e.y + pad }; })());
        sctx.clearRect(i * fw, 0, fw, fh + pad);
        sctx.drawImage(tmp, i * fw, 0);
      });
    }
    const tex = track(canvasTex(strip));
    tex.repeat.set(0.25, 1);
    const ppu = fw / fishTarget; // texels per world unit
    const mat = track(new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.18 }));
    const fish = new THREE.Mesh(track(new THREE.PlaneGeometry(fw / ppu, (fh + pad) / ppu)), mat);
    fish.renderOrder = 4; // after the glass + water: the fish stays crisp
    const fishHolder = new THREE.Group();
    fishHolder.add(fish);
    bg.add(fishHolder);
    // name card on the desk, in front of the bowl
    const nc = posterCanvas('name');
    const nctx = nc.getContext('2d');
    nctx.fillStyle = '#fdf6e2'; nctx.fillRect(0, 0, nc.width, nc.height);
    nctx.fillStyle = '#d8ccb0'; nctx.fillRect(0, nc.height - 1, nc.width, 1);
    pixelText(nctx, S.name, nc.width / 2, 2, '#2a1c16', { font: 'small', align: 'center' });
    nctx.fillStyle = ['#e0503a', '#3a7ad8', '#3aa04a', '#e0a020', '#9a4ac0', '#e06a9a'][students.length % 6];
    nctx.fillRect(1, 1, 2, 2); nctx.fillRect(nc.width - 3, 1, 2, 2);
    const ntex = track(canvasTex(nc));
    const card = new THREE.Mesh(track(new THREE.PlaneGeometry(0.4, 0.106)), track(new THREE.MeshLambertMaterial({ map: ntex, emissive: 0xffffff, emissiveMap: ntex, emissiveIntensity: 0.15 })));
    card.position.set(bx, W(11) + 0.055, W(S.desk[1] + 5) + 0.02);
    card.rotation.x = -0.25;
    group.add(card);
    // raised fin (keen student)
    let finMesh = null;
    if (S.nerd) {
      const fcv = finCanvas(frames[0]);
      const ftex = track(canvasTex(fcv));
      finMesh = new THREE.Mesh(track(new THREE.PlaneGeometry(7 / ppu * 1.4, 9 / ppu * 1.4)), track(new THREE.MeshLambertMaterial({ map: ftex, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: ftex, emissiveIntensity: 0.18 })));
      finMesh.geometry.translate(0, 9 / ppu * 0.7, 0); // pivot at the base
      finMesh.visible = false;
      fishHolder.add(finMesh);
    }
    const bubbles = [];
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(bubbleGeo, bubbleMat);
      b.visible = false;
      b.userData = { t: 0, on: false };
      bg.add(b);
      bubbles.push(b);
    }
    const rnd = mulberry32(students.length * 31 + 7);
    students.push({
      ...S, group: bg, fish, holder: fishHolder, tex, frames: 4, fw, fh, ppu, finMesh, bubbles, card,
      world: new THREE.Vector3(bx, by + W(6), bz),
      face: S.desk[0] < 20 ? 1 : -1, faceK: S.desk[0] < 20 ? 1 : -1, x: 0, phase: rnd() * 10, speed: 0.6 + rnd() * 0.5,
      bubbleT: 1 + rnd() * 3, turnT: 3 + rnd() * 5, hop: 0, raise: 0, mood: S.sleepy ? 'sleep' : 'idle', zzzT: 1 + rnd(), rnd,
    });
  }

  // reaction sprites (pooled)
  const reactPool = [];
  const reacts = [];
  const spawnReact = (st, kind, delay = 0) => {
    let s = reactPool.pop();
    const T = reactTexture(kind);
    if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ alphaTest: 0.5, transparent: false, depthTest: true })); s.renderOrder = 6; }
    s.material.map = T.tex; s.material.needsUpdate = true;
    s.userData = { st, t: -delay, life: kind === 'zzz' ? 2.2 : 1.9, k: kind, w: T.w / 64, h: T.h / 64, side: (st.rnd() - 0.5) * 0.12 };
    s.visible = false;
    group.add(s);
    reacts.push(s);
  };
  const studentsApi = {
    list: students,
    /** kind: heart | bang | question | zzz | raise | cheer | laugh | note | sweat | star | wow | sparkle; who: id, index, or array (default: all awake) */
    react(kind, { who = null, stagger = 0.12 } = {}) {
      let L = students;
      if (who != null) L = (Array.isArray(who) ? who : [who]).map((w) => (typeof w === 'number' ? students[w] : students.find((s) => s.id === w))).filter(Boolean);
      else if (kind !== 'zzz') L = students.filter((s) => s.mood !== 'sleep' || kind === 'bang');
      L.forEach((st, i) => {
        const d = i * stagger + st.rnd() * stagger;
        if (kind === 'raise') { const nerd = students.find((s) => s.nerd) || st; nerd.raise = 2.4; nerd.hop = 0.25; spawnReact(nerd, 'bang', 0.15); return; }
        if (kind === 'cheer') { st.hop = 0.3 + d; spawnReact(st, i % 3 === 0 ? 'star' : i % 3 === 1 ? 'heart' : 'note', d); return; }
        if (kind === 'bang' && st.mood === 'sleep') { st.hop = 0.35; st.wakeT = 2.5; }
        if (kind === 'heart' || kind === 'wow' || kind === 'bang' || kind === 'laugh') st.hop = 0.18 + d * 0.5;
        spawnReact(st, kind, d);
      });
    },
    /** the sleepy student wakes up (or nods off again) */
    setSleepy(on) { for (const s of students) if (s.sleepy) s.mood = on ? 'sleep' : 'idle'; },
    /** turn every fish toward a world x (e.g. the teacher) */
    lookAtX(x) { for (const s of students) s.lookX = x; },
  };

  // ---- lights (inside the group: they only light this room)
  const lights = {};
  lights.hemi = new THREE.HemisphereLight(0xfff0d8, 0x6a4a36, 1.6);
  lights.sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
  lights.sun.target.position.set(0, 0, 0.2);
  lights.sun.position.copy(lights.sun.target.position).addScaledVector(WIN_DIR, -12);
  lights.sun.castShadow = true;
  lights.sun.shadow.mapSize.set(1024, 1024);
  { const sc = lights.sun.shadow.camera; sc.left = -6.5; sc.right = 6.5; sc.top = 6.5; sc.bottom = -6.5; sc.near = 2; sc.far = 26; sc.updateProjectionMatrix(); }
  lights.sun.shadow.bias = -0.0008;
  lights.sun.shadow.normalBias = 0.02;
  lights.fill = new THREE.DirectionalLight(0xffe8cc, 0.8);
  lights.fill.position.set(0.8, 6, 9);
  lights.fill.target.position.set(0, 1, -1);
  lights.desk = new THREE.PointLight(0xffc880, 0.0, 3, 1.4);
  lights.desk.position.set(W(TDESK.x0 + 14), 1.2, W(TDESK.z1) + 0.4);
  lights.board = new THREE.PointLight(0xfff4e0, 0.5, 4.5, 1.2);
  lights.board.position.set(BOARD.cx, 2.0, BOARD.z + 1.6);
  group.add(lights.hemi, lights.sun, lights.sun.target, lights.fill, lights.fill.target, lights.desk, lights.board);

  // ---- anchors
  const tdFront = new THREE.Vector3(W((TDESK.x0 + TDESK.x1) / 2), 0, W(TDESK.z1) + 0.45);
  // frame a world box with an orthographic camera at `pitch` (yaw 0)
  const box = (x0, x1, y0, y1, z0, z1, pitch, pad = 1.05, yaw = 0) => {
    const p = pitch * DEG, c = Math.cos(p), sn = Math.sin(p);
    let a = Infinity, b = -Infinity;
    for (const y of [y0, y1]) for (const z of [z0, z1]) { const v = y * c - z * sn; a = Math.min(a, v); b = Math.max(b, v); }
    return { target: new THREE.Vector3((x0 + x1) / 2, (a + b) / 2 / c, 0), fit: { w: (x1 - x0) * pad, h: (b - a) * pad }, yaw, pitch: p };
  };
  const bx0 = BOARD.cx - BOARD.w / 2, bx1 = BOARD.cx + BOARD.w / 2;
  const tsx = bx1 + 0.62;
  const anchors = {
    teacherSpot: { position: new THREE.Vector3(tsx, 0, BOARD.z + 0.62), rotationY: -0.55 },
    deskSpot: { position: new THREE.Vector3(tdFront.x - 0.2, 0, tdFront.z + 0.05), rotationY: -0.25 },
    boardCenter: board.center.clone(),
    boardTop: BOARD.cy + BOARD.h / 2,
    riser: { ...RISER },
    camWide: box(-4.72, 4.72, 0, 3.2, -2.95, 2.7, 30, 1.02),
    camBoard: box(bx0 - 0.5, tsx + 0.75, 0.2, 1.9, BOARD.z, BOARD.z + 0.9, 26, 1.03),
    camStudents: box(-3.75, 2.95, -0.7, 1.45, -1.1, 1.75, 30, 1.02),
    camTeacher: box(tsx - 1.1, tsx + 0.9, 0, 1.9, BOARD.z, BOARD.z + 1.0, 20, 1.05),
    camDesk: box(tdFront.x - 1.6, tdFront.x + 1.3, 0, 2.0, -2.9, tdFront.z + 0.4, 18, 1.05),
  };

  // ---- state + animation
  let night = false;
  let viewT = -1;
  const MOOD = {
    day: { hemi: [0xfff0d8, 0x6a4a36, 1.6], fill: [0xffe8cc, 0.8], sun: [0xfff0d0, 2.4], desk: 0, board: 0.5, beam: 0xffe8b0, beamK: 0.15, motes: 0.55 },
    night: { hemi: [0x6a5aa8, 0x1e1628, 0.8], fill: [0x8a86d8, 0.32], sun: [0x8aa8ff, 1.2], desk: 2.6, board: 1.2, beam: 0x9ab8ff, beamK: 0.1, motes: 0.3 },
  };
  function setNight(on) {
    night = !!on;
    const m = night ? MOOD.night : MOOD.day;
    lights.hemi.color.setHex(m.hemi[0]); lights.hemi.groundColor.setHex(m.hemi[1]); lights.hemi.intensity = m.hemi[2];
    lights.fill.color.setHex(m.fill[0]); lights.fill.intensity = m.fill[1];
    lights.sun.color.setHex(m.sun[0]); lights.sun.intensity = m.sun[1];
    lights.desk.intensity = m.desk; lights.board.intensity = m.board;
    beamMat.color.setHex(m.beam).multiplyScalar(m.beamK);
    moteMat.opacity = m.motes;
    viewT = -1;
    base = { hemi: m.hemi[2], fill: m.fill[1], sun: m.sun[1], desk: m.desk, board: m.board, hemiC: lights.hemi.color.clone(), beam: beamMat.color.clone(), motes: m.motes };
    dim.applied = -1;
  }
  // dramatic beat: dim the room (0..1), eased in update()
  let base = null;
  const dim = { k: 0, goal: 0, applied: -1 };
  const DIM_TINT = new THREE.Color(0x6a4a9a);
  function setDim(k) { dim.goal = Math.max(0, Math.min(1, k || 0)); }
  function applyDim() {
    if (!base || Math.abs(dim.k - dim.applied) < 0.002) return;
    dim.applied = dim.k;
    const k = dim.k, f = 1 - 0.72 * k;
    lights.hemi.intensity = base.hemi * f; lights.hemi.color.copy(base.hemiC).lerp(DIM_TINT, k * 0.6);
    lights.fill.intensity = base.fill * (1 - 0.8 * k); lights.sun.intensity = base.sun * (1 - 0.85 * k);
    lights.desk.intensity = base.desk + k * 1.4; lights.board.intensity = base.board * (1 - 0.4 * k);
    beamMat.color.copy(base.beam).multiplyScalar(1 - 0.9 * k);
    moteMat.opacity = base.motes * (1 - k);
  }
  function setClock(hour) { clockHour = hour; drawClock(); }

  const _q = new THREE.Quaternion();
  let time = 0;
  function update(dt, t, camera) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    time = t ?? time + dt;
    dim.k += (dim.goal - dim.k) * Math.min(1, dt * 4);
    applyDim();
    chalk.update(dt);
    if (chalk.version !== boardVer) { boardVer = chalk.version; boardTex.needsUpdate = true; }
    globe.rotation.y = time * 0.35;
    plant.rotation.z = Math.sin(time * 1.2) * 0.035;
    for (const m of motes) {
      const u = m.userData;
      m.position.set(u.x + Math.sin(time * 0.21 * u.s + u.p) * 0.1, Math.max(0.1, u.y + Math.sin(time * 0.13 * u.s + u.p * 2) * 0.12), u.z + Math.cos(time * 0.17 * u.s + u.p) * 0.1);
    }
    if (time - viewT > 0.15 || viewT < 0) {
      viewT = time;
      for (const v of views) { drawWindowView(v.ctx, v.w, v.h, night, time + v.seed); v.tex.needsUpdate = true; }
    }
    if (camera) _q.copy(camera.quaternion);
    // students
    for (const s of students) {
      s.phase += dt * s.speed * (s.mood === 'sleep' ? 0.35 : 1);
      const sleeping = s.mood === 'sleep' && !(s.wakeT > 0);
      if (s.wakeT > 0) s.wakeT -= dt;
      // swim back and forth, turn at the glass, look at the teacher now and then
      s.turnT -= dt;
      if (s.turnT <= 0 && !sleeping) { s.turnT = 3 + s.rnd() * 5; s.face = s.lookX != null && s.rnd() < 0.6 ? Math.sign(s.lookX - s.world.x) || 1 : -s.face; }
      s.faceK += (s.face - s.faceK) * Math.min(1, dt * 7);
      const swim = sleeping ? 0 : Math.sin(s.phase * 0.7) * 0.05;
      s.hop = Math.max(0, s.hop - dt);
      const hopY = s.hop > 0 ? Math.sin(Math.min(1, s.hop / 0.3) * Math.PI) * 0.06 : 0;
      const bob = Math.sin(s.phase * 1.6) * (sleeping ? 0.01 : 0.018);
      s.holder.position.set(swim, 0.16 + bob + hopY, 0.02);
      // billboard: face the camera, flip by facing, a little wiggle
      s.holder.quaternion.copy(_q);
      const sx = Math.abs(s.faceK) < 0.15 ? 0.15 * Math.sign(s.faceK || 1) : s.faceK;
      s.fish.scale.set(sx, 1 + Math.sin(s.phase * 6) * 0.02, 1);
      s.fish.rotation.z = sleeping ? -0.12 + Math.sin(s.phase) * 0.04 : Math.sin(s.phase * 3) * 0.04;
      const fr = sleeping ? 0 : Math.floor(s.phase * 5) % 4;
      s.tex.offset.x = fr * 0.25;
      // bubbles from the mouth
      s.bubbleT -= dt * (sleeping ? 0.4 : 1);
      if (s.bubbleT <= 0) {
        s.bubbleT = 1.4 + s.rnd() * 2.6;
        const b = s.bubbles.find((q) => !q.userData.on);
        if (b) { b.userData.on = true; b.userData.t = 0; b.userData.x = swim + s.faceK * 0.17; b.visible = true; }
      }
      for (const b of s.bubbles) {
        const u = b.userData;
        if (!u.on) continue;
        u.t += dt;
        const y = 0.2 + u.t * 0.16;
        b.position.set(u.x + Math.sin(u.t * 9) * 0.012, y, 0.06);
        b.scale.setScalar(0.7 + u.t * 0.5);
        if (y > 0.43) { u.on = false; b.visible = false; }
      }
      // keen student: fin up and waving
      if (s.finMesh) {
        s.raise = Math.max(0, s.raise - dt);
        const on = s.raise > 0;
        s.finMesh.visible = on;
        if (on) {
          const k = Math.min(1, (2.4 - s.raise) * 6, s.raise * 4);
          s.finMesh.position.set(-0.02 * Math.sign(s.faceK), s.fh / s.ppu * 0.32, 0.002);
          s.finMesh.scale.set(Math.sign(s.faceK) || 1, k, 1);
          s.finMesh.rotation.z = Math.sin(time * 16) * 0.35 * Math.sign(s.faceK);
        }
      }
      // sleepy Zzz
      if (sleeping) {
        s.zzzT -= dt;
        if (s.zzzT <= 0) { s.zzzT = 2.4 + s.rnd(); spawnReact(s, 'zzz', 0); }
      }
    }
    // reaction sprites: pop in, float up, pop out
    for (let i = reacts.length - 1; i >= 0; i--) {
      const r = reacts[i], u = r.userData;
      u.t += dt;
      if (u.t < 0) continue;
      if (u.t >= u.life) { r.visible = false; r.removeFromParent(); reacts.splice(i, 1); reactPool.push(r); continue; }
      r.visible = true;
      const k = u.t;
      const pop = k < 0.18 ? k / 0.18 * 1.25 : k < 0.28 ? 1.25 - (k - 0.18) / 0.1 * 0.25 : u.life - k < 0.15 ? (u.life - k) / 0.15 : 1;
      const zig = u.k === 'zzz' ? Math.sin(k * 3) * 0.06 : 0;
      r.position.set(u.st.world.x + u.side + zig, u.st.world.y + 0.42 + k * (u.k === 'zzz' ? 0.18 : 0.08), u.st.world.z + 0.05);
      r.scale.set(u.w * pop, u.h * pop, 1);
    }
  }

  function dispose() {
    group.traverse((o) => { if (o.isLight && o.shadow && o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; } });
    for (const r of [...reacts, ...reactPool]) r.material.dispose();
    for (const d of disposables) d.dispose?.();
    disposables.clear();
    group.clear();
    group.removeFromParent();
  }

  setNight(false);
  update(0, 0, null);
  group.userData.buildMs = performance.now() - t0;
  return { group, anchors, board, students: studentsApi, update, setNight, setClock, setDim, dispose, lights, background: CLASS_BACKGROUND };
}
