// Reynard's bedroom: a cosy voxel corner of his hut at night, for the bedtime
// cutscene (src/game/Bedtime.js). Built like the classroom / lab dioramas:
// 0.05 voxels, a dollhouse cutaway (log back wall + left wall, open front),
// lights inside the group so they only light this room.
//
// Space: origin = centre of the floor (floor top y = 0). Interior x -2.1..2.1,
// z -1.6..1.2; view it from +z (yaw ~0) with an orthographic camera.
//
//   const room = buildBedroom();   // { group, anchors, background, update, setLamp, setQuilt, setPajamasHung, setMonocle, dispose }
//   room.setLamp(false);           // click: warm lamplight -> moonlit blue (eased)
//   room.setQuilt(k);              // 0 = folded at the foot, 1 = pulled up to his chin
//   room.update(dt, time, camera);
//
// The bed matches FOX_BED (foxRig.js): stand the fox at anchors.bed (root yaw 0) and
// play climb_bed -> sleep_bed; his head lands on the pillow (anchors.bedPillow).
import * as THREE from 'three';
import { VoxelModel } from '../core/voxel.js';
import { FOX_BED } from './foxRig.js';

export const BED_VOXEL = 0.05;
export const BEDROOM_BACKGROUND = 0x0d0b18;
const V = BED_VOXEL, FV = 0.025;
const W = (n) => n * V;
const DEG = Math.PI / 180;

// room extents (voxels)
const X0 = -42, X1 = 41, ZB = -32, ZF = 24, HT = 46;
// bed: the fox's root stands on the floor at (BX, 0, BZ), head toward -z
const BX = 0.78, BZ = -0.02;

// ------------------------------------------------------------------ palette
const LOG = [0x8a5532, 0x7e4c2c, 0x96603a, 0x84502e];
const LOG_D = 0x5a3420, LOG_L = 0xa8703f;
const PLANK = [0xa8703e, 0x9c6638, 0xb07842, 0x986236];
const PLANK_D = 0x6e4426;
const WOOD = 0xb07a44, WOOD_D = 0x7e5230, WOOD_L = 0xcc9458;
const CREAM = 0xf6eedc, CREAM_D = 0xe2d4b8;
const QUILT = [0xe86a5a, 0xf2c45a, 0x6ab0d8, 0x8acb6a, 0xf09ab8, 0xb88ad8, 0xf6eedc, 0xf0a050];

function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const pick = (arr, x, y, z) => arr[Math.floor(hash3(x, y, z) * arr.length) % arr.length];

// Lambert + per-voxel grain
function grainLambert(params = {}, amount = 0.1, scale = V) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, ...params });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBedPos;\nvarying vec3 vBedNor;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBedPos = position;\nvBedNor = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vBedPos;
varying vec3 vBedNor;
float bedHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 an = abs(vBedNor);
  vec3 g = vBedPos * ${(1 / scale).toFixed(1)} + 0.001;
  vec2 cell = an.y > 0.5 ? g.xz : (an.x > 0.5 ? g.zy : g.xy);
  diffuseColor.rgb *= 1.0 + (bedHash(floor(cell)) - 0.5) * ${amount.toFixed(3)};
}`);
  };
  mat.customProgramCacheKey = () => 'bedgrain' + amount + scale;
  return mat;
}

// ------------------------------------------------------------------ builders (R = lit 0.05, G = glowing 0.05, F = lit 0.025, FG = glowing 0.025)
function buildShell(R) {
  // plank floor running along x, with seams and nail dots
  for (let x = X0; x <= X1; x++)
    for (let z = ZB; z <= ZF; z++) {
      const row = Math.floor((z - ZB) / 3), off = (row * 7) % 11;
      const seam = (z - ZB) % 3 === 0 || (x + off) % 22 === 0;
      R.set(x, -1, z, seam ? PLANK_D : pick(PLANK, row, Math.floor((x + off) / 22), 0));
      R.set(x, -2, z, PLANK_D);
    }
  // log walls: back (z = ZB-1..ZB-3) and left (x = X0-1..X0-3); round-ish logs, chinking between
  for (let y = 0; y < HT; y++) {
    const ly = y % 5, log = Math.floor(y / 5);
    const c = (a, b) => (ly === 4 ? 0xd8c49a : ly === 0 ? LOG_D : ly === 3 ? pick(LOG, log, a, b) : ly === 1 ? LOG_L : pick(LOG, log, a, b));
    for (let x = X0 - 3; x <= X1 + 1; x++) for (let k = 1; k <= 3; k++) R.set(x, y, ZB - k, k === 1 ? c(x >> 3, 1) : LOG_D);
    for (let z = ZB - 3; z <= ZF; z++) for (let k = 1; k <= 3; k++) R.set(X0 - k, y, z, k === 1 ? c(z >> 3, 2) : LOG_D);
  }
  // log ends sticking out at the corner + a beam along the top
  for (let y = 0; y < HT; y += 5) for (let k = 0; k < 3; k++) { R.set(X0 - 4, y + 1, ZB - 4 - k, LOG_L); R.set(X0 - 4, y + 2, ZB - 4 - k, pick(LOG, y, k, 3)); }
  for (let x = X0 - 3; x <= X1 + 1; x++) for (let k = 0; k < 3; k++) { R.set(x, HT, ZB - 1 - k, WOOD_D); R.set(x, HT + 1, ZB - 1 - k, WOOD_D); }
}

function buildRug(R) {
  // round braided rug in front of the bed
  const cx = -6, cz = 6, rx = 17, rz = 11;
  for (let x = cx - rx; x <= cx + rx; x++)
    for (let z = cz - rz; z <= cz + rz; z++) {
      const d = Math.hypot((x - cx) / rx, (z - cz) / rz);
      if (d > 1) continue;
      const ring = Math.floor(d * 7);
      const c = [0xd86a58, 0xf2d6a0, 0x6a9ac8, 0xe8b85a, 0xd86a58, 0x8ab86a, 0x6a4a8a][ring];
      R.set(x, 0, z, (x + z + ring) % 4 === 0 ? 0xf6eedc : c);
    }
}

function buildBed(R, F) {
  const x0 = Math.round((BX - 0.45) / V), x1 = Math.round((BX + 0.45) / V) - 1;
  const zFoot = Math.round((BZ - 0.12) / V), zHead = ZB;
  const top = Math.round(FOX_BED.height / V); // mattress top (voxel row below = surface)
  // legs + frame rails
  for (const [x, z] of [[x0, zFoot - 1], [x1, zFoot - 1], [x0, zHead], [x1, zHead]]) for (let y = 0; y < 3; y++) R.set(x, y, z, WOOD_D);
  for (let x = x0; x <= x1; x++) for (let z = zHead; z <= zFoot - 1; z++) {
    R.set(x, 3, z, (x === x0 || x === x1 || z === zFoot - 1) ? WOOD : WOOD_D);
  }
  // mattress with ticking stripes and a soft rounded edge
  for (let x = x0; x <= x1; x++) for (let z = zHead; z <= zFoot - 2; z++) for (let y = 4; y < top; y++) {
    const edge = (x === x0 || x === x1) && y === top - 1;
    R.set(x, y, z, edge ? CREAM_D : (x % 3 === 0 ? 0xc8d8f0 : CREAM));
  }
  // headboard: arched planks with a heart cut-out and two knob posts
  const hb = zHead;
  for (let x = x0 - 1; x <= x1 + 1; x++) {
    const u = (x - (x0 + x1) / 2) / ((x1 - x0) / 2 + 1);
    const h = 17 + Math.round((1 - u * u) * 3);
    for (let y = 0; y <= h; y++) {
      const hx = x - (x0 + x1) / 2, hy = y - 12;
      const heart = Math.pow(hx * hx / 9 + (hy * 1.2) ** 2 / 9 - 1, 3) - (hx * hx / 9) * Math.pow(hy * 1.2 / 3, 3) < 0 && y > 8;
      if (heart) continue;
      R.set(x, y, hb, y === h ? WOOD_L : (x - x0) % 4 === 0 ? WOOD_D : WOOD);
      R.set(x, y, hb + 1, y >= h - 1 || x === x0 - 1 || x === x1 + 1 ? WOOD_L : y > 4 ? WOOD : WOOD_D);
    }
  }
  for (const x of [x0 - 2, x1 + 2]) { for (let y = 0; y <= 21; y++) R.set(x, y, hb + 1, y > 19 ? WOOD_L : WOOD_D); }
  // footboard (low enough to hop over)
  for (let x = x0 - 1; x <= x1 + 1; x++) for (let y = 0; y <= 8; y++) R.set(x, y, zFoot - 1, y === 8 ? WOOD_L : (x - x0) % 4 === 0 ? WOOD_D : WOOD);
  for (const x of [x0 - 2, x1 + 2]) for (let y = 0; y <= 10; y++) R.set(x, y, zFoot - 1, y > 8 ? WOOD_L : WOOD_D);
  // pillow (fine voxels): plump, white with blue stitching
  const pz = (BZ - FOX_BED.head) / FV, pcx = BX / FV;
  for (let x = Math.round(pcx - 12); x <= Math.round(pcx + 11); x++)
    for (let z = Math.round(pz - 6); z <= Math.round(pz + 5); z++)
      for (let y = top * 2; y <= top * 2 + 5; y++) {
        const dx = (x + 0.5 - pcx) / 12.5, dz = (z + 0.5 - pz) / 6.5, dy = (y - top * 2) / 5.5;
        if (dx * dx + dz * dz + Math.max(0, dy) ** 2 * 1.4 > 1.05) continue;
        F.set(x, y, z, Math.abs(dx) > 0.85 ? 0xc8d8f0 : y === top * 2 + 5 || dx < -0.3 ? 0xffffff : 0xf2eee6);
      }
  return { x0, x1, zFoot, zHead, top };
}

// patchwork quilt, its own mesh so it can be pulled up
function quiltModel(bed) {
  const v = new VoxelModel();
  const w = bed.x1 - bed.x0 + 3, len = 18;
  const lyingZ = Math.round(-FOX_BED.step / V); // where his feet are (relative to the root)
  for (let i = 0; i < w; i++)
    for (let j = 0; j <= len; j++) {
      const x = i - 1, z = -j; // z 0 = foot end, going toward the pillow (-z)
      // puffy hump over his body (middle), hanging down over both sides
      const u = (i - (w - 1) / 2) / ((w - 1) / 2);
      const hump = Math.round(Math.max(0, 1 - u * u * 1.15) * 7.5) + 1;
      const side = Math.abs(u) > 0.9;
      const patch = QUILT[(Math.floor(i / 4) * 3 + Math.floor(j / 4) * 5) % QUILT.length];
      const stitch = i % 4 === 0 || j % 4 === 0;
      const col = stitch ? 0xfff4e0 : patch;
      for (let y = side ? -4 : hump - 1; y <= hump; y++) v.set(x, y, z, y === hump || side ? col : 0xf6e2c0);
      if (j === len) for (let y = 0; y <= hump + 1; y++) v.set(x, y, z, 0xfff4e0); // turned-down cream edge
    }
  void lyingZ;
  return v;
}

function buildNightstand(R, F, G) {
  const x0 = 26, x1 = 34, z0 = ZB, z1 = ZB + 8, top = 10;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = 0; y <= top; y++) {
    const shell = x === x0 || x === x1 || z === z1 || y === top || y === 0;
    if (!shell && z !== z0) continue;
    let c = y === top ? WOOD_L : (y === 5 && z === z1) ? WOOD_D : WOOD;
    if (z === z1 && x === (x0 + x1) >> 1 && (y === 7 || y === 3)) c = 0xf0c040; // knobs
    R.set(x, y, z, c);
  }
  // lamp (fine voxels): round wooden base, brass stem, cream pleated shade (glows)
  const lx = 31 * 2, lz = (ZB + 3) * 2, ly = (top + 1) * 2;
  for (let x = -3; x <= 2; x++) for (let z = -3; z <= 2; z++) if (Math.hypot(x + 0.5, z + 0.5) < 3.2) { F.set(lx + x, ly, lz + z, WOOD_D); F.set(lx + x, ly + 1, lz + z, WOOD); }
  for (let y = ly + 2; y <= ly + 9; y++) { F.set(lx - 1, y, lz - 1, 0xd8a83a); F.set(lx, y, lz - 1, 0xb88a2a); }
  const shade = [];
  for (let y = 0; y <= 6; y++) {
    const r = 3.4 + y * 0.45;
    for (let x = -7; x <= 6; x++) for (let z = -7; z <= 6; z++) {
      const d = Math.hypot(x + 0.5, z + 0.5);
      if (d > 8 - r * 0.3 + (6 - y) * 0 || d > 7 - y * 0.42 || (d < 5.6 - y * 0.42 && y > 0 && y < 6)) continue;
      shade.push([lx + x, ly + 16 - y, lz + z, (Math.floor(Math.atan2(z, x) * 3) & 1) ? 0xfff0c8 : 0xffe2a0]);
    }
  }
  for (const [x, y, z, c] of shade) G.set(x, y, z, c);
  // piggy bank (pink, coin slot) + a stray coin
  const px = 28 * 2 - 1, pz = (ZB + 5) * 2, py = (top + 1) * 2;
  for (let x = -4; x <= 4; x++) for (let y = 0; y <= 6; y++) for (let z = -3; z <= 3; z++) {
    const d = (x * x) / 20 + ((y - 3.2) ** 2) / 12 + (z * z) / 11;
    if (d > 1) continue;
    F.set(px + x, py + y, pz + z, y >= 5 && x < 0 ? 0xffc8d8 : y < 2 ? 0xd87898 : 0xf4a0b8);
  }
  F.set(px + 5, py + 3, pz, 0xe888a8); F.set(px + 5, py + 4, pz, 0xe888a8); F.set(px + 6, py + 3, pz, 0xc86888); // snout
  F.set(px + 5, py + 3, pz - 1, 0x8a3a58); F.set(px + 5, py + 3, pz + 1, 0x8a3a58);
  F.set(px + 3, py + 5, pz + 3, 0x2a1a20); F.set(px + 3, py + 5, pz - 3, 0x2a1a20); // eyes
  for (const [x, z] of [[-3, -2], [-3, 2], [3, -2], [3, 2]]) F.set(px + x, py - 1, pz + z, 0xc86888);
  F.set(px + 2, py + 7, pz - 2, 0xf4a0b8); F.set(px + 2, py + 7, pz + 2, 0xf4a0b8); // ears
  for (let z = -1; z <= 1; z++) F.set(px - 1, py + 7, pz + z, 0x5a2a3a); // coin slot
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) F.set(px - 5 + x, py, pz + 6 + z, x === -1 && z === -1 ? 0xfff6c4 : 0xffd23f);
  // the monocle, resting on a tiny dish (shown once he's in his pajamas)
  const mono = new VoxelModel();
  for (let x = -5; x <= 4; x++) for (let z = -5; z <= 4; z++) { const d = Math.hypot(x + 0.5, z + 0.5); if (d < 4.6) mono.set(x, 0, z, d > 3.6 ? 0xe2d4b8 : 0xf6eedc); }
  for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) { const d = Math.hypot(x + 0.5, z + 0.5); if (d < 3.4 && d > 2.4) mono.set(x, 1, z, x + z < 0 ? 0xfff6c4 : 0xffdc4a); }
  for (const [x, z] of [[3, 3], [4, 4], [5, 4], [6, 5], [7, 5]]) mono.set(x, 1, z, 0xf0b030); // chain
  return { lampAt: new THREE.Vector3(lx * FV, (ly + 13) * FV, lz * FV), mono, monoAt: new THREE.Vector3(33 * V - 0.04, (top + 1) * V, (ZB + 6) * V) };
}

function buildWindow(R, GL) {
  // back wall window above the head of the room: frame, sill with a little plant, curtains
  const x0 = -12, x1 = 4, y0 = 19, y1 = 35, z = ZB - 1;
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const fr = x === x0 || x === x1 || y === y0 || y === y1, mull = x === ((x0 + x1) >> 1) || y === ((y0 + y1) >> 1);
    if (fr || mull) { R.set(x, y, z, fr ? WOOD_L : WOOD); R.set(x, y, z + 1, fr ? WOOD : WOOD_D); }
    else { R.set(x, y, z, null); R.set(x, y, z - 1, null); R.set(x, y, z - 2, null); }
  }
  for (let x = x0 - 1; x <= x1 + 1; x++) for (let z2 = z; z2 <= z + 2; z2++) R.set(x, y0 - 1, z2, z2 === z + 2 ? WOOD_L : WOOD);
  // curtains (gingham), tied back
  for (const [cx, dir] of [[x0 - 1, -1], [x1 + 1, 1]]) {
    for (let y = y0 - 2; y <= y1 + 2; y++) {
      const wv = y > y0 + 4 ? 2 : 1 + (y0 + 4 - y > 0 ? 0 : 1);
      for (let k = 0; k < wv + 1; k++) {
        const x = cx + dir * k, c = ((x + y) & 1) ? 0xd85a50 : (y & 1) ? 0xf6eedc : 0xe8907a;
        R.set(x, y, z + 1, c); if (k === 0) R.set(x, y, z + 2, c);
      }
    }
    for (let k = -1; k <= 2; k++) R.set(cx + dir * k, y0 + 3, z + 2, 0xf0c040);
  }
  // curtain rod
  for (let x = x0 - 5; x <= x1 + 5; x++) R.set(x, y1 + 3, z + 2, 0x6a4026);
  // sill plant
  for (let y = y0; y <= y0 + 2; y++) for (let x = -2; x <= -1; x++) R.set(x, y, z + 2, 0xc86a3a);
  R.set(-2, y0 + 3, z + 2, 0x5aa83c); R.set(-1, y0 + 4, z + 2, 0x6ac04a); R.set(-2, y0 + 5, z + 2, 0x5aa83c); R.set(-1, y0 + 3, z + 3, 0x4a983a);
  void GL;
  return { x0, x1, y0, y1, z };
}

function buildSink(R, F) {
  // pedestal sink against the back wall, mirror above, towel on a hook
  const cx = -29, z0 = ZB, z1 = ZB + 6, top = 11;
  for (let y = 0; y < 8; y++) for (let x = cx - 1; x <= cx + 1; x++) for (let z = z0; z <= z0 + 2; z++) R.set(x, y, z, x === cx - 1 ? 0xffffff : 0xe8ecf0);
  for (let x = cx - 6; x <= cx + 6; x++) for (let z = z0; z <= z1; z++) for (let y = 8; y <= top; y++) {
    const rim = x === cx - 6 || x === cx + 6 || z === z1 || z === z0 || y === 8;
    if (!rim && y > 8) { if (y === 9) R.set(x, y, z, 0xb8c8d8); continue; }
    R.set(x, y, z, y === top ? 0xffffff : x < cx - 3 ? 0xf6f8fa : 0xdde4ea);
  }
  // brass faucet + taps (fine)
  const fx = cx * 2, fz = (z0 + 1) * 2, fy = (top + 1) * 2;
  for (let y = 0; y <= 4; y++) F.set(fx, fy + y, fz, 0xd8a83a);
  for (let z = 1; z <= 3; z++) F.set(fx, fy + 4, fz + z, z === 3 ? 0xb88a2a : 0xe8c050);
  F.set(fx - 4, fy, fz, 0xe8c050); F.set(fx - 4, fy + 1, fz, 0xff6a5a); F.set(fx + 4, fy, fz, 0xe8c050); F.set(fx + 4, fy + 1, fz, 0x5aa8f0);
  // toothbrush cup (empty while he's using it) + soap
  const ux = (cx + 4) * 2, uz = (z0 + 2) * 2;
  for (let y = 0; y <= 5; y++) for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) {
    if (y > 0 && x > -2 && x < 1 && z > -2 && z < 1) continue;
    F.set(ux + x, fy + y, uz + z, y === 5 ? 0xa8d8ff : x < 0 ? 0x7ac0f0 : 0x5aa0d8);
  }
  for (let x = -2; x <= 1; x++) for (let z = -1; z <= 0; z++) F.set((cx - 4) * 2 + x, fy, uz + z, x < 0 ? 0xfff0f4 : 0xf4c8d8);
  // mirror: wooden oval frame, glass with a glint
  const my = 26, mh = 9, mw = 6;
  for (let x = cx - mw - 1; x <= cx + mw + 1; x++) for (let y = my - mh - 1; y <= my + mh + 1; y++) {
    const d = ((x - cx) / (mw + 1)) ** 2 + ((y - my) / (mh + 1)) ** 2;
    if (d > 1.05) continue;
    const inner = ((x - cx) / mw) ** 2 + ((y - my) / mh) ** 2 < 0.92;
    let c = inner ? (y - my > 2 ? 0xbfe0f2 : 0x9cc8e4) : (y > my ? WOOD_L : WOOD);
    if (inner && (x - cx) + (y - my) * 0.6 > 1 && (x - cx) + (y - my) * 0.6 < 3) c = 0xffffff;
    R.set(x, y, ZB, c);
  }
  // towel on a hook (striped)
  for (let y = 9; y <= 20; y++) for (let k = 0; k <= 3; k++) R.set(X0, y, -14 + k, y === 20 ? 0x6a4026 : (y % 4 < 2 ? 0x8ac8f0 : 0xf6eedc));
  return { spot: new THREE.Vector3(W(cx), 0, W(z1) + 0.42), top: W(top + 1) };
}

function buildScreen(R) {
  // three-panel folding screen, zig-zag, painted koi on cream with wooden frames
  const panels = [[-20, -12, -14], [-12, -4, -18], [-4, 4, -14]];
  for (let p = 0; p < panels.length; p++) {
    const [xa, xb, z] = panels[p];
    const zb = p === 1 ? z : z - (p === 0 ? 0 : 0);
    for (let x = xa; x <= xb; x++) {
      const u = (x - xa) / (xb - xa);
      const zz = Math.round(p === 0 ? z - u * 4 : p === 1 ? zb + u * 4 : z - (1 - u) * 0);
      for (let y = 1; y <= 30; y++) {
        const frame = x === xa || x === xb || y <= 2 || y >= 29;
        let c = frame ? WOOD_D : 0xf2e6cc;
        if (!frame) {
          // koi + ripples
          const kx = x - (xa + xb) / 2, ky = y - (12 + p * 5);
          if ((kx * kx) / 6 + (ky * ky) / 1.8 < 1) c = p === 1 ? 0xf0a050 : 0xe86a5a;
          else if (Math.abs(Math.hypot(kx * 0.6, ky - 6) - 3) < 0.5) c = 0xa8c8e0;
          else if ((x + y * 3) % 17 === 0) c = 0xe6d8b8;
        }
        R.set(x, y, zz, c);
      }
      R.set(x, 0, zz, WOOD_D);
    }
  }
}

function pajamasHung() {
  // striped PJs draped over the top of the screen + the red nightcap on its corner
  const v = new VoxelModel();
  for (let x = -14; x <= -6; x++) for (let y = 22; y <= 31; y++) {
    if (y < 29 && (x === -14 || x === -6) && y < 24) continue;
    v.set(x, y, -17 + (y > 29 ? 0 : 1), (x % 3 === 0) ? 0xf6eedc : y > 29 ? 0x6a98cc : 0x86b4e4);
  }
  for (let y = 26; y <= 31; y++) v.set(-10, y, -15, 0x34508e);
  for (let y = 30; y <= 33; y++) for (let x = 2; x <= 4; x++) if (x - 2 <= 33 - y) v.set(x, y, -14, y === 30 ? 0xf6eedc : 0xd8463e);
  v.set(5, 31, -14, 0xfdfaf0);
  return v;
}

function buildNightlight(G, R) {
  // fish-shaped nightlight plugged into the left wall, glowing
  const z = -4, y = 4;
  const rows = ['...oo....', '.ooOOoo.o', 'oOOyOOooo', 'oOOOOOoo.', '.ooOOoo.o', '...oo....'];
  const col = { o: 0xffb84a, O: 0xffe08a, y: 0x5a3a20 };
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (col[r[i]]) G.set(X0, y + 5 - j, z + i, col[r[i]]); });
  R.set(X0, y + 2, z - 2, 0xe8e0d0); R.set(X0, y + 3, z - 2, 0xe8e0d0); // outlet
  return new THREE.Vector3(W(X0) + 0.06, W(y + 3), W(z + 4));
}

function buildDecor(R, F) {
  // slippers on the rug, a little picture frame (gold coin) on the left wall, a shelf with books + a candle
  for (const [sx, sz] of [[10, 4], [14, 5]]) {
    for (let x = 0; x <= 5; x++) for (let z = 0; z <= 9; z++) {
      const d = ((x - 2.5) / 3) ** 2 + ((z - 4.5) / 5) ** 2;
      if (d > 1) continue;
      F.set(sx * 2 + x, 0, sz * 2 + z, 0xf09ab8); if (z > 3) F.set(sx * 2 + x, 1, sz * 2 + z, d < 0.5 ? 0xfff4f8 : 0xf09ab8);
    }
    F.set(sx * 2 + 2, 2, sz * 2 + 6, 0xffffff); F.set(sx * 2 + 3, 2, sz * 2 + 6, 0xffffff);
  }
  // framed coin portrait on the left wall
  for (let z = 2; z <= 12; z++) for (let y = 24; y <= 33; y++) {
    const fr = z === 2 || z === 12 || y === 24 || y === 33;
    const d = Math.hypot(z - 7, y - 28.5);
    R.set(X0, y, z, fr ? 0xd8a83a : d < 3 ? (d < 2 ? 0xffd23f : 0xc8961c) : 0x3a5a8a);
  }
  // shelf with books and a cocoa mug on the left wall
  for (let z = -26; z <= -18; z++) { R.set(X0, 30, z, WOOD_D); R.set(X0 + 1, 30, z, WOOD); R.set(X0 + 2, 30, z, WOOD); }
  const books = [0xc8463e, 0x3a6aa8, 0xe8b84a, 0x5a9a5a, 0x8a5aa8];
  books.forEach((c, i) => { const h = 4 + (i % 3); for (let y = 31; y < 31 + h; y++) { R.set(X0 + 1, y, -26 + i, c); R.set(X0 + 2, y, -26 + i, c); } });
  for (let y = 31; y <= 33; y++) { R.set(X0 + 1, y, -19, 0xf6eedc); R.set(X0 + 2, y, -19, 0xf6eedc); }
}

// night sky in the window (canvas): gradient, crescent moon, twinkling stars, the odd shooting star
function makeSky(win) {
  const w = (win.x1 - win.x0 - 1) * 4, h = (win.y1 - win.y0 - 1) * 4;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const stars = [];
  for (let i = 0; i < 26; i++) stars.push({ x: (hash3(i, 1, 7) * w) | 0, y: (hash3(i, 2, 9) * h * 0.85) | 0, p: hash3(i, 3, 5) * 6.28, s: hash3(i, 4, 1) < 0.2 ? 2 : 1 });
  const draw = (t) => {
    for (let y = 0; y < h; y++) {
      const k = y / h;
      ctx.fillStyle = k < 0.33 ? '#121a3e' : k < 0.66 ? '#1a2856' : '#26386a';
      if ((y % 2 === 0) && (k > 0.31 && k < 0.36 || k > 0.64 && k < 0.69)) ctx.fillStyle = '#1a2856';
      ctx.fillRect(0, y, w, 1);
    }
    // treeline silhouette
    ctx.fillStyle = '#0c1226';
    for (let x = 0; x < w; x++) { const th = 5 + ((x * 7) % 5) + (Math.floor(x / 6) % 2 ? 3 : 0); ctx.fillRect(x, h - th, 1, th); }
    // moon: crescent with craters
    const mx = (w * 0.68) | 0, my = (h * 0.28) | 0, R = 7;
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      if (x * x + y * y > R * R) continue;
      if ((x + 4) ** 2 + (y - 2) ** 2 < (R - 1) ** 2) continue;
      ctx.fillStyle = x + y < -3 ? '#fffbe0' : '#f4e6a8';
      ctx.fillRect(mx + x, my + y, 1, 1);
    }
    for (const s of stars) {
      const tw = Math.sin(t * 2.2 + s.p);
      if (tw < -0.6) continue;
      ctx.fillStyle = tw > 0.6 ? '#ffffff' : '#c8d4ff';
      ctx.fillRect(s.x, s.y, 1, 1);
      if (s.s > 1 && tw > 0.3) { ctx.fillRect(s.x - 1, s.y, 3, 1); ctx.fillRect(s.x, s.y - 1, 1, 3); }
    }
    // shooting star every ~7 s
    const sh = (t % 7) / 0.6;
    if (sh < 1) {
      ctx.fillStyle = '#ffffff';
      for (let k = 0; k < 6; k++) { const x = (w * 0.1 + sh * w * 0.5 - k * 2) | 0, y = (h * 0.15 + sh * h * 0.25 - k) | 0; if (k < 4 || (k & 1)) ctx.fillRect(x, y, 1, 1); }
    }
    tex.needsUpdate = true;
  };
  draw(0);
  return { tex, draw, w: (win.x1 - win.x0 - 1) * V, h: (win.y1 - win.y0 - 1) * V };
}

// ------------------------------------------------------------------ build
export function buildBedroom() {
  const group = new THREE.Group();
  group.name = 'Bedroom';
  const disposables = new Set();
  const track = (x) => { disposables.add(x); return x; };
  const litMat = track(grainLambert({}, 0.1, V));
  const litFine = track(grainLambert({}, 0.06, FV));
  const glowMat = track(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const addMesh = (geo, mat, { cast = true, receive = true, name } = {}) => {
    const m = new THREE.Mesh(track(geo), mat);
    m.castShadow = cast; m.receiveShadow = receive;
    if (name) m.name = name;
    group.add(m);
    return m;
  };

  const R = new VoxelModel(), G = new VoxelModel(), F = new VoxelModel(), FG = new VoxelModel();
  buildShell(R);
  buildRug(R);
  const bed = buildBed(R, F);
  const stand = buildNightstand(R, F, FG);
  const win = buildWindow(R);
  const sink = buildSink(R, F);
  buildScreen(R);
  const nl = buildNightlight(G, R);
  buildDecor(R, F);
  addMesh(R.build({ scale: V }), litMat, { name: 'bedroom' });
  addMesh(F.build({ scale: FV }), litFine, { name: 'bedroomFine' });
  addMesh(G.build({ scale: V, ao: false }), glowMat, { cast: false, receive: false });
  const shadeMat = track(new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff }));
  addMesh(FG.build({ scale: FV, ao: false }), shadeMat, { cast: false, receive: false, name: 'lampShade' });

  // pajamas over the screen, monocle dish on the nightstand
  const pjs = addMesh(pajamasHung().build({ scale: V }), litMat, { name: 'pajamasHung' });
  const mono = addMesh(stand.mono.build({ scale: FV, pivot: [0, 0, 0] }), litFine, { name: 'monocleDish' });
  mono.position.copy(stand.monoAt);
  mono.visible = false;

  // quilt (pulled up by setQuilt): pivot at the foot of the mattress
  const quilt = addMesh(quiltModel(bed).build({ scale: V, pivot: [0, 0, 0] }), litMat, { name: 'quilt' });
  const quiltFoot = new THREE.Vector3(W(bed.x0), W(bed.top), W(bed.zFoot - 2) + V);
  quilt.position.copy(quiltFoot);

  // window sky + moonbeam
  const sky = makeSky(win);
  const skyMat = track(new THREE.MeshBasicMaterial({ map: track(sky.tex) }));
  const skyMesh = new THREE.Mesh(track(new THREE.PlaneGeometry(sky.w, sky.h)), skyMat);
  skyMesh.position.set(W(win.x0 + 1) + sky.w / 2, W(win.y0 + 1) + sky.h / 2, W(win.z - 1.5));
  group.add(skyMesh);
  const beamMat = track(new THREE.MeshBasicMaterial({ color: 0x9ab8ff, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const beamGeo = track(new THREE.BufferGeometry());
  {
    // a skewed prism from the window down onto the floor in front of the bed
    const a = [W(win.x0 + 1), W(win.x1), W(win.y0 + 1), W(win.y1), W(win.z + 1)];
    const top = [[a[0], a[3], a[4]], [a[1], a[3], a[4]], [a[1], a[2], a[4]], [a[0], a[2], a[4]]];
    const bot = top.map(([x, y]) => [x + 0.55, 0.01, a[4] + 0.6 + (y - a[2]) * 1.45]);
    const P = [...top, ...bot].flat();
    beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    beamGeo.setIndex([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7, 4, 5, 6, 4, 6, 7]);
  }
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.renderOrder = 5;
  group.add(beam);
  // floating dust motes in the moonbeam
  const moteMat = track(new THREE.MeshBasicMaterial({ color: 0xd8e4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  const moteGeo = track(new THREE.BoxGeometry(0.018, 0.018, 0.018));
  const motes = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(moteGeo, moteMat);
    m.userData = { x: W(win.x0) + 0.2 + hash3(i, 1, 1) * 1.1, y: 0.2 + hash3(i, 2, 2) * 1.4, z: W(win.z) + 0.4 + hash3(i, 3, 3) * 1.2, p: hash3(i, 4, 4) * 6.28, s: 0.6 + hash3(i, 5, 5) };
    group.add(m); motes.push(m);
  }

  // ---- lights
  const lights = {
    hemi: new THREE.HemisphereLight(0xffe2c0, 0x3a2418, 1.0),
    moon: new THREE.DirectionalLight(0xc0ccff, 0.5),
    fill: new THREE.DirectionalLight(0xffd8a8, 0.9),
    lamp: new THREE.PointLight(0xffc070, 3.2, 3.6, 1.3),
    night: new THREE.PointLight(0xffb050, 0.4, 1.4, 1.5),
    // warm glow by the bed once the lamp is off (keeps his orange fur reading in the moonlight)
    rim: new THREE.PointLight(0xffa860, 0, 1.6, 1.4),
  };
  lights.rim.position.set(BX + 0.65, FOX_BED.height + 0.55, BZ - FOX_BED.head + 0.35);
  group.add(lights.rim);
  lights.moon.position.set(-0.3, 2.6, -0.2); lights.moon.target.position.set(0.9, 0.35, -0.9); // from the window, onto the pillow
  lights.fill.position.set(1.2, 4, 5); lights.fill.target.position.set(0, 0.6, -0.8);
  lights.lamp.position.copy(stand.lampAt);
  lights.night.position.copy(nl);
  group.add(lights.hemi, lights.moon, lights.moon.target, lights.fill, lights.fill.target, lights.lamp, lights.night);

  // ---- anchors (world units); cameras frame a world box with an orthographic camera (yaw 0)
  const box = (x0, x1, y0, y1, z0, z1, pitch, pad = 1.05, yaw = 0) => {
    const p = pitch * DEG, c = Math.cos(p), sn = Math.sin(p);
    let a = Infinity, b = -Infinity;
    for (const y of [y0, y1]) for (const z of [z0, z1]) { const v = y * c - z * sn; a = Math.min(a, v); b = Math.max(b, v); }
    return { target: new THREE.Vector3((x0 + x1) / 2, (a + b) / 2 / c, 0), fit: { w: (x1 - x0) * pad, h: (b - a) * pad }, yaw, pitch: p };
  };
  const pillow = new THREE.Vector3(BX, FOX_BED.height + 0.12, BZ - FOX_BED.head);
  const anchors = {
    start: { position: new THREE.Vector3(-0.15, 0, 0.45), rotationY: 0.2 },
    sink: { position: sink.spot.clone(), rotationY: 0.45 }, // brushing 3/4 toward the camera, sink behind him
    mirror: new THREE.Vector3(sink.spot.x, 1.3, W(ZB) + 0.02),
    screen: { position: new THREE.Vector3(-0.42, 0, -0.32), rotationY: 0.15 },
    bed: { position: new THREE.Vector3(BX, 0, BZ), rotationY: 0 }, // root here, yaw 0, then climb_bed
    bedApproach: { position: new THREE.Vector3(BX - 0.05, 0, BZ + 0.32), rotationY: Math.PI },
    bedPillow: pillow,
    window: new THREE.Vector3(W((win.x0 + win.x1) / 2), W((win.y0 + win.y1) / 2), W(win.z) + 0.05),
    lamp: stand.lampAt.clone(),
    camWide: box(-2.2, 1.9, 0, 2.2, -1.6, 0.9, 26, 1.02),
    camSink: { ...box(-2.25, -0.25, 0, 1.6, -1.6, 0.2, 16, 1.0), yaw: 0.45 },
    camScreen: box(-1.35, 0.55, 0, 1.45, -1.1, 0.2, 16, 1.05),
    camBed: box(-0.35, 1.95, 0, 1.2, -1.6, 0.3, 52, 1.03),
    // sleep beat: a medium shot (whole bed, window with the moon, nightstand), pushing in to head-and-shoulders (camFace)
    camClose: box(-0.75, 1.95, 0.1, 2.15, -1.6, 0.05, 40, 1.02),
    camFace: box(BX - 1.0, BX + 0.95, FOX_BED.height + 0.1, FOX_BED.height + 1.55, pillow.z - 0.2, pillow.z + 0.6, 44, 1.0),
  };

  // ---- state + animation
  const MOOD = {
    lamp: { hemi: [0xffe2c0, 0x3a2418, 1.0], moon: 0.45, fill: 0.85, lamp: 3.2, night: 0.35, beam: 0.03, motes: 0.15, shade: 1, rim: 0 },
    moon: { hemi: [0x8a98d8, 0x2a2238, 0.95], moon: 1.9, fill: 0.32, lamp: 0, night: 1.4, beam: 0.025, motes: 0.5, shade: 0.42, rim: 1.6 },
  };
  const cur = { k: 0, goal: 0 }; // 0 = lamp on, 1 = moonlit
  const cA = new THREE.Color(), cB = new THREE.Color();
  function applyMood() {
    const a = MOOD.lamp, b = MOOD.moon, k = cur.k;
    const L = (x, y) => x + (y - x) * k;
    lights.hemi.color.copy(cA.setHex(a.hemi[0])).lerp(cB.setHex(b.hemi[0]), k);
    lights.hemi.groundColor.copy(cA.setHex(a.hemi[1])).lerp(cB.setHex(b.hemi[1]), k);
    lights.hemi.intensity = L(a.hemi[2], b.hemi[2]);
    lights.moon.intensity = L(a.moon, b.moon); lights.fill.intensity = L(a.fill, b.fill);
    lights.lamp.intensity = L(a.lamp, b.lamp); lights.night.intensity = L(a.night, b.night); lights.rim.intensity = L(a.rim, b.rim);
    beamMat.opacity = L(a.beam, b.beam); moteMat.opacity = L(a.motes, b.motes);
    shadeMat.color.setScalar(L(a.shade, b.shade));
  }
  applyMood();
  let quiltK = 0, quiltGoal = 0;
  function applyQuilt() {
    // folded back at the foot (0) -> pulled up to his chin (1), puffing up as it goes
    const k = quiltK;
    quilt.scale.set(1, 0.35 + 0.65 * Math.min(1, k * 1.3), 0.16 + 0.84 * k);
    quilt.position.copy(quiltFoot);
    quilt.position.y += (1 - k) * 0.02;
  }
  applyQuilt();

  function setLamp(on, instant = false) { cur.goal = on ? 0 : 1; if (instant) { cur.k = cur.goal; applyMood(); } }
  function setQuilt(k, instant = false) { quiltGoal = Math.max(0, Math.min(1, k)); if (instant) { quiltK = quiltGoal; applyQuilt(); } }
  function setPajamasHung(on) { pjs.visible = !!on; }
  function setMonocle(on) { mono.visible = !!on; }

  let time = 0, skyT = -1;
  function update(dt, t) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    time = t ?? time + dt;
    if (Math.abs(cur.goal - cur.k) > 1e-3) { cur.k += Math.sign(cur.goal - cur.k) * Math.min(Math.abs(cur.goal - cur.k), dt / 0.35); applyMood(); }
    if (Math.abs(quiltGoal - quiltK) > 1e-3) { quiltK += (quiltGoal - quiltK) * Math.min(1, dt * 7); applyQuilt(); }
    // lamp flicker, nightlight breathing
    if (cur.k < 0.5) lights.lamp.intensity *= 1 + Math.sin(time * 23) * Math.sin(time * 7.1) * 0.02;
    lights.night.intensity = (MOOD.lamp.night + (MOOD.moon.night - MOOD.lamp.night) * cur.k) * (0.85 + Math.sin(time * 1.3) * 0.15);
    if (time - skyT > 0.12 || skyT < 0) { skyT = time; sky.draw(time); }
    for (const m of motes) {
      const u = m.userData;
      m.position.set(u.x + Math.sin(time * 0.2 * u.s + u.p) * 0.12, u.y + Math.sin(time * 0.14 * u.s + u.p * 2) * 0.1, u.z + Math.cos(time * 0.17 * u.s + u.p) * 0.1);
    }
  }

  function dispose() {
    group.removeFromParent();
    for (const d of disposables) d.dispose?.();
    disposables.clear();
  }

  return { group, anchors, background: BEDROOM_BACKGROUND, update, setLamp, setQuilt, setPajamasHung, setMonocle, dispose, lights };
}
