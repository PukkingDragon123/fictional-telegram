// Procedural voxel fish. Fish face +x, centred on the origin; a per-vertex
// "bend" attribute (0 at head, 1 at tail tip) drives the swim wiggle shader.
import * as THREE from 'three';
import { VoxelModel, VOXEL, mix, shade } from '../core/voxel.js';
import { mulberry32, hash3 } from '../core/rng.js';
import { SPECIES } from '../data/species.js';

function profile(shape, t) {
  // t: 0 = tail joint, 1 = snout. returns 0..1 relative thickness
  switch (shape) {
    case 'round': return Math.pow(Math.sin(Math.PI * (0.12 + 0.8 * t)), 0.55);
    case 'long': return t < 0.12 ? 0.55 + t * 3 : t > 0.85 ? Math.max(0.35, 1 - (t - 0.85) * 4) : 0.9 + 0.1 * Math.sin(t * 3);
    case 'sturgeon': return t < 0.15 ? 0.5 + t * 3 : t > 0.7 ? Math.max(0.25, 1 - (t - 0.7) * 2.6) : 1;
    default: return Math.pow(Math.sin(Math.PI * (0.08 + 0.86 * t)), 0.75); // fusiform
  }
}

export function fishVoxels(m, golden = false) {
  const v = new VoxelModel();
  const rnd = mulberry32(m.L * 131 + m.H * 7);
  const L = m.L, H = m.H, W = m.W;
  const hh0 = (H - 1) / 2, ww0 = (W - 1) / 2;
  let back = m.back, side = m.side, belly = m.belly, fin = m.fin;
  if (golden) { back = 0xd89a18; side = 0xf2c43a; belly = 0xfff0a0; fin = 0xe8b02a; }
  const sideOf = (x) => {
    const t = x / (L - 1);
    return profile(m.shape, t);
  };
  // body
  for (let x = 0; x < L; x++) {
    const t = x / (L - 1);
    const p = sideOf(x);
    const hh = Math.max(0.6, hh0 * p + 0.3);
    const ww = Math.max(0.5, ww0 * Math.pow(p, 0.8) + 0.25);
    const yC = m.shape === 'sturgeon' ? -0.3 * (1 - p) : 0;
    for (let y = -Math.ceil(hh); y <= Math.ceil(hh); y++)
      for (let z = -Math.ceil(ww); z <= Math.ceil(ww); z++) {
        const ny = (y - yC) / hh, nz = z / ww;
        if (ny * ny + nz * nz > 1.05) continue;
        let c = ny > 0.35 ? back : ny < -0.4 ? belly : side;
        if (m.head && t >= (m.headFrom || 0.8) && ny > -0.4) c = m.head;
        v.set(x, y, z, c);
      }
  }
  // patterns
  const bodyVox = [];
  for (const [k] of v.vox) bodyVox.push(k);
  const decode = (k) => [(k & 1023) - 512, ((k >> 10) & 1023) - 512, ((k >> 20) & 1023) - 512];
  const isSurface = (x, y, z) => !(v.has(x + 1, y, z) && v.has(x - 1, y, z) && v.has(x, y + 1, z) && v.has(x, y - 1, z) && v.has(x, y, z + 1) && v.has(x, y, z - 1));
  for (const pat of m.pattern || []) {
    for (const k of bodyVox) {
      const [x, y, z] = decode(k);
      if (!isSurface(x, y, z)) continue;
      const t = x / (L - 1);
      const p = sideOf(x);
      const hh = Math.max(0.6, hh0 * p + 0.3);
      const ny = y / hh;
      const cur = v.get(x, y, z);
      let c = null;
      const pc = golden ? shade(pat.color, 0.9) : pat.color;
      switch (pat.type) {
        case 'bars': {
          if (t < pat.from || t > pat.to || ny < -0.5) break;
          const period = (pat.to - pat.from) / pat.count;
          const ph = ((t - pat.from) / period) % 1;
          if (ph < 0.35) c = golden ? shade(side, 0.85) : pc;
          break;
        }
        case 'stripe': {
          const yw = pat.width ?? 0.8;
          if (Math.abs(ny - (pat.y || 0)) * hh <= yw * 0.6 && t > 0.05 && t < 0.92) {
            if (!pat.blotchy || hash3(x, y, 1) > 0.25) c = pc;
          }
          break;
        }
        case 'spots': {
          if (ny < (pat.yMin ?? -1) || ny > (pat.yMax ?? 1) || t > 0.88) break;
          const r = hash3(x, y + 50, z * 3 + (pat.seed || 0));
          if (r < (pat.density || 0.15)) {
            c = pc;
            if (pat.halo && golden === false) {
              for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
                if (v.has(x + dx, y + dy, z) && isSurface(x + dx, y + dy, z) && hash3(x + dx, y + dy + 50, z * 3 + (pat.seed || 0)) >= pat.density)
                  v.set(x + dx, y + dy, z, pat.halo);
            }
            if (pat.elongated && v.has(x + 1, y, z)) v.set(x + 1, y, z, pc);
          }
          break;
        }
        case 'worms': {
          if (ny < (pat.yMin ?? 0.3) || t > 0.9) break;
          const w = Math.sin(x * 1.7 + y * 2.3 + z) + Math.sin(x * 0.9 - y * 3.1);
          if (Math.abs(w) < (pat.dense ? 0.55 : 0.4)) c = pc;
          break;
        }
        case 'saddles': {
          if (ny < 0.1) break;
          const ph = (t * pat.count) % 1;
          if (ph < 0.45 && t > 0.1 && t < 0.9) c = pc;
          break;
        }
        case 'scutes': {
          if ((Math.abs(ny) < 0.15 || ny > 0.85) && x % 2 === 0 && t > 0.1 && t < 0.85) c = pc;
          break;
        }
        case 'gradient': {
          if (ny < -0.45) break;
          const cols = pat.colors;
          const g = Math.min(cols.length - 1, Math.floor((1 - t) * cols.length + (ny > 0.3 ? 1 : 0)));
          c = golden ? cur : cols[Math.max(0, g)];
          break;
        }
        case 'blotches': {
          const cx1 = L * 0.62, cx2 = L * 0.3;
          const d1 = Math.hypot(x - cx1, (y - 1) * 1.3), d2 = Math.hypot(x - cx2, (y - 0.5) * 1.4);
          if ((d1 < 2.3 || d2 < 1.8) && ny > -0.3) c = golden ? 0xc07818 : pc;
          if (t > 0.85 && ny > 0.2 && Math.abs(z) < 1) c = golden ? 0xc07818 : pc;
          break;
        }
        case 'patch': {
          if (Math.abs(t - pat.at) < 0.08 && Math.abs(ny - pat.y) < 0.35 && Math.abs(z) >= ww0) c = pc;
          break;
        }
      }
      if (c != null) v.set(x, y, z, c);
    }
  }
  // eyes + cheeks + mouth
  const ex = Math.round((L - 1) * (m.shape === 'long' ? 0.86 : 0.82));
  const ep = sideOf(ex);
  const ey = Math.max(0, Math.round((hh0 * ep + 0.3) * 0.3));
  const ez = Math.ceil(Math.max(0.5, ww0 * Math.pow(ep, 0.8) + 0.25));
  for (const s of [1, -1]) {
    let zz = ez * s;
    while (!v.has(ex, ey, zz) && Math.abs(zz) > 0) zz -= s;
    v.set(ex, ey, zz, m.eye || 0x101418);
    if (m.eyeBig) v.set(ex, ey + 1, zz, m.eye);
    v.set(ex - 1, ey + 1, zz, mix(v.get(ex - 1, ey + 1, zz) ?? side, 0xffffff, 0.35));
    if (m.cheek && !golden) v.set(ex - 1, ey - 1, zz, m.cheek);
  }
  const tipX = L - 1;
  if (m.mouth === 'big') { v.set(tipX, -1, 0, 0x3a2020); v.set(tipX, 0, 0, 0x5a3030); v.set(tipX - 1, -1, Math.ceil(ww0), 0x2a2a1a); v.set(tipX - 1, -1, -Math.ceil(ww0), 0x2a2a1a); }
  else if (m.mouth === 'hook') { v.set(tipX + 1, 0, 0, m.head || back); v.set(tipX + 1, -1, 0, m.head || back); v.set(tipX + 2, -1, 0, 0xe8e0c0); }
  else if (m.mouth === 'duck') { v.set(tipX + 1, 0, 0, back); v.set(tipX + 2, 0, 0, side); v.set(tipX + 1, -1, 0, belly); }
  else if (m.mouth === 'barbels') { v.set(tipX + 1, -1, 0, side); v.set(tipX, -2, 1, 0xd8c8a8); v.set(tipX, -2, -1, 0xd8c8a8); v.set(tipX - 1, -2, 0, 0xd8c8a8); }
  else v.set(tipX, -1, 0, mix(belly, 0x802020, 0.4));
  // dorsal fin
  const topAt = (x) => { let y = 8; while (y > -8 && !v.has(x, y, 0)) y--; return y; };
  const botAt = (x) => { let y = -8; while (y < 8 && !v.has(x, y, 0)) y++; return y; };
  const finC = fin;
  const d = m.dorsal || 'short';
  const dFrom = d === 'long' ? 0.2 : d === 'back' ? 0.12 : d === 'hump' ? 0.35 : 0.38;
  const dTo = d === 'long' ? 0.75 : d === 'back' ? 0.3 : d === 'hump' ? 0.7 : 0.62;
  for (let x = Math.round(dFrom * (L - 1)); x <= Math.round(dTo * (L - 1)); x++) {
    const ty = topAt(x);
    const hgt = d === 'spiny' ? (x % 2 === 0 ? 2 : 1) : d === 'hump' ? 1 : x === Math.round((dFrom + dTo) / 2 * (L - 1)) ? 2 : 1;
    for (let k = 1; k <= hgt; k++) v.set(x, ty + k, 0, finC);
  }
  // pectoral fins
  const px = Math.round((L - 1) * 0.68);
  const pby = Math.round(-hh0 * 0.4);
  for (const s of [1, -1]) {
    let zz = s * 4;
    while (!v.has(px, pby, zz - s) && Math.abs(zz) > 1) zz -= s;
    v.set(px, pby, zz, finC);
    v.set(px - 1, pby - 1, zz, finC);
  }
  // pelvic/anal fin
  const ax = Math.round((L - 1) * 0.3);
  v.set(ax, botAt(ax) - 1, 0, m.finEdge && !golden ? m.finEdge : finC);
  // tail fin at x < 0
  const tail = m.tail || 'fork';
  const tailLen = tail === 'flowing' ? 5 : tail === 'shark' ? 4 : 3;
  for (let i = 1; i <= tailLen; i++) {
    const x = -i;
    let spread = Math.min(hh0 + 1, i + 0.5);
    if (tail === 'flowing') spread = Math.min(hh0 + 2, 1 + i * 0.8);
    for (let y = -Math.ceil(spread); y <= Math.ceil(spread); y++) {
      const ay = Math.abs(y);
      if (ay > spread) continue;
      if (tail === 'fork' && i >= 2 && ay < i - 1.5) continue;
      if (tail === 'round' && i === tailLen && ay > spread - 1) continue;
      if (tail === 'shark' && y < 0 && ay > i * 0.6) continue;
      if (tail === 'shark' && y > 0 && i < 2) continue;
      let c = finC;
      if (m.tailTip && i === tailLen && y < 0) c = m.tailTip;
      if (m.finEdge && !golden && i === tailLen) c = m.finEdge;
      if (tail === 'flowing' && (i + y) % 3 === 0) c = golden ? 0xf6d060 : 0xd52b1e;
      v.set(x, y, 0, c);
    }
  }
  return v;
}

// Build geometry with bend attribute; returns { geo, len }
export function buildFishGeometry(species, golden = false) {
  const vm = fishVoxels(species.model, golden);
  const cx = (vm.minX + vm.maxX + 1) / 2;
  const geo = vm.build({ pivot: [cx, 0.5, 0.5], scale: VOXEL });
  const pos = geo.attributes.position;
  const headX = (vm.maxX + 1 - cx) * VOXEL;
  const tailX = (vm.minX - cx) * VOXEL;
  const len = headX - tailX;
  const bend = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const k = Math.min(1, Math.max(0, (headX - x) / len - 0.25) / 0.75);
    bend[i] = k * k;
  }
  geo.setAttribute('bend', new THREE.BufferAttribute(bend, 1));
  return { geo, len };
}

// Shared swim material: wiggle in vertex shader using per-instance phase/amp.
// Fish are drawn after the (transparent) water surface so they stay vivid,
// with a light depth-based underwater tint applied in the shader instead.
export const fishUniforms = {
  uWaterColor: { value: new THREE.Color(0x2f8a88) },
  uWaterY: { value: -0.1 },
};
let fishMat = null;
export function fishMaterial() {
  if (fishMat) return fishMat;
  fishMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 1, depthWrite: true });
  fishMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterColor = fishUniforms.uWaterColor;
    shader.uniforms.uWaterY = fishUniforms.uWaterY;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float bend;
attribute float iPhase;
attribute float iAmp;
varying float vFishY;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
transformed.z += sin(iPhase - position.x * 7.0) * iAmp * bend;
{
  vec4 fwp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  fwp = instanceMatrix * fwp;
  #endif
  vFishY = (modelMatrix * fwp).y;
}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uWaterColor;
uniform float uWaterY;
varying float vFishY;`)
      .replace('#include <opaque_fragment>', `
{
  float under = clamp((uWaterY - vFishY) / 0.9, 0.0, 1.0);
  outgoingLight = mix(outgoingLight, outgoingLight * 0.6 + uWaterColor * 0.4, under * 0.35);
}
#include <opaque_fragment>`);
  };
  return fishMat;
}

export function allSpeciesGeometries() {
  const out = {};
  for (const s of SPECIES) out[s.id] = buildFishGeometry(s);
  return out;
}
