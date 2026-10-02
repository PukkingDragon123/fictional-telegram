// Assembles the static world meshes: terrain, water, trees, clutter, buildings.
import * as THREE from 'three';
import { hutDecals } from '../entities/structureDecals.js';
import { generateWorld, OFFICE, HUT, MEADOW, WORLD_W, WORLD_H, SIM_RECT, BIOME, LANDMARKS, WILLOW } from './worldgen.js';
const landmarkMods = import.meta.glob('../entities/landmarkModels.js', { eager: true });
const LM = landmarkMods['../entities/landmarkModels.js'] || null;
import { buildTerrainGeometry, makeTerrainMaterial, buildWaterGeometry, makeWaterMaterial, buildShoreTexture, buildSurfaceTexture } from './terrain.js';
import { WaterSim } from './waterSim.js';
import { pineModel, mapleModel, birchModel, boulderModel, tuftModel, flowerModel } from './models.js';
import { officeModel, hutModel } from './buildings.js';
import { voxelMaterial, linearRGB } from '../core/voxel.js';
import { fbm2, hash2 } from '../core/rng.js';
import { WATER_Y, KIND } from './grid.js';
import { SpriteBatch, pixelTexture } from '../core/spriteBatch.js';
import { buildNatureAtlas } from '../art/natureArt.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function decoModel(type, variant, far) {
  const seed = variant * 31 + (far ? 7 : 1);
  const k = far ? 0.5 : 1;
  switch (type) {
    case 'pine': return pineModel({ h: Math.round((50 + variant * 6) * k), r: Math.round((10 + variant) * k), seed });
    case 'spruce': return pineModel({ h: Math.round((58 + variant * 5) * k), r: Math.round(8 * k), seed, spruce: true });
    case 'maple': return mapleModel({ h: Math.round(34 * k), r: Math.round(11 * k), seed, variant });
    case 'birch': return birchModel({ h: Math.round(38 * k), r: Math.round(7 * k), seed });
    case 'boulder': return boulderModel({ seed, size: k });
    default: return null;
  }
}

// neon-sign buzz: mostly on, with the odd flicker and the occasional burst
function hash1(n) { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }
export function blinkOn(t) {
  const k = Math.floor(t * 8);
  if (hash1(k) < 0.12) return false;
  if (hash1(Math.floor(t / 2)) < 0.2 && k % 2) return false;
  return true;
}

export class World {
  constructor(scene, seed = 1337) {
    this.scene = scene;
    const gen = generateWorld(seed);
    this.grid = gen.grid;
    this.decos = gen.decos;
    this.clutter = gen.clutter;
    this.trail = gen.trail;
    this.landVersion = 0;
    this.sim = new WaterSim(this.grid, SIM_RECT, 4);
    this.surfTex = buildSurfaceTexture(this.grid);
    this.uniforms = {
      uTime: { value: 0 },
      uCaustic: { value: 1 },
      uSurf: { value: this.surfTex },
      uGridSize: { value: new THREE.Vector2(this.grid.w, this.grid.h) },
      uSim: { value: this.sim.tex },
      uBlueprint: { value: 0 },
      uSimRect: { value: new THREE.Vector4(SIM_RECT.x0, SIM_RECT.z0, SIM_RECT.x1 - SIM_RECT.x0, SIM_RECT.z1 - SIM_RECT.z0) },
    };
    this.terrainMat = makeTerrainMaterial(this.uniforms);
    this.terrain = new THREE.Mesh(buildTerrainGeometry(this.grid), this.terrainMat);
    this.terrain.receiveShadow = true;
    // bears walk the trail on the smoothed slope surface
    for (const tp of this.trail) tp[1] = this.grid.surfaceAtVisual(tp[0], tp[2]);
    this.terrain.castShadow = true;
    scene.add(this.terrain);

    this.shoreTex = buildShoreTexture(this.grid);
    this.waterUniforms = {
      uTime: this.uniforms.uTime,
      uShore: { value: this.shoreTex },
      uGridSize: { value: new THREE.Vector2(this.grid.w, this.grid.h) },
      uShallow: { value: new THREE.Color(0x4fa3a0) },
      uDeep: { value: new THREE.Color(0x2f6088) },
      uFoam: { value: new THREE.Color(0xe8f4f0) },
      uGlint: { value: new THREE.Color(0xffffff) },
      uSkyTint: { value: new THREE.Color(0xd0e8f8) },
      uNight: { value: 0 },
      uAurora: { value: 0 },
      uSim: this.uniforms.uSim,
      uSimRect: this.uniforms.uSimRect,
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.5) },
      uViewDir: { value: new THREE.Vector3(0, 0.7, 0.7) },
    };
    this.water = new THREE.Mesh(buildWaterGeometry(this.grid), makeWaterMaterial(this.waterUniforms));
    this.water.renderOrder = 10;
    scene.add(this.water);

    this.buildSkirt();
    this.decoGroup = new THREE.Group();
    scene.add(this.decoGroup);
    this.buildDecos();
    this.buildClutter();
    this.buildLandmarks();
    this.buildMapLandmarks();
  }

  // Endless forest canopy around the playable map so the edges never show.
  buildSkirt() {
    const { w, h } = this.grid;
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vWPos;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
{
  vec2 p = vWPos.xz;
  float n1 = vn(p * 0.55);
  float n2 = vn(p * 1.3 + 5.0);
  float n3 = vn(p * 3.1 + 11.0);
  float canopy = n1 * 0.5 + n2 * 0.33 + n3 * 0.17;
  vec3 dark = vec3(0.06, 0.13, 0.07);
  vec3 mid = vec3(0.10, 0.21, 0.10);
  vec3 lit = vec3(0.15, 0.28, 0.13);
  vec3 c = mix(dark, mid, smoothstep(0.38, 0.58, canopy));
  c = mix(c, lit, smoothstep(0.62, 0.74, canopy));
  float au = vn(p * 0.21 + 20.0);
  vec3 autumn = mix(vec3(0.5, 0.2, 0.07), vec3(0.62, 0.48, 0.12), vn(p * 0.4 + 3.0));
  c = mix(c, autumn * (0.6 + 0.5 * smoothstep(0.5, 0.75, canopy)), smoothstep(0.66, 0.8, au) * 0.8);
  float g = h21(floor(vWPos.xz * 10.0));
  c *= 0.92 + g * 0.16;
  vec2 mapC = vec2(${w / 2}.0, ${h / 2}.0);
  vec2 dd = max(abs(vWPos.xz - mapC) - vec2(${w / 2}.0, ${h / 2}.0), 0.0);
  float edge = length(dd);
  c = mix(c, vec3(0.2, 0.28, 0.3), smoothstep(8.0, 70.0, edge) * 0.55);
  diffuseColor.rgb = c;
}`,
        );
    };
    const E = 120, y = 3.6;
    // four strips framing the map (x0,z0,x1,z1)
    const strips = [
      [-E, h, w + E, h + E, y], // south
      [-E, -E, 0, h, y], // west
      [w, -E, w + E, h, y], // east
      [0, -E, w, 0, 9], // north (behind the mountain)
    ];
    this.skirt = new THREE.Group();
    for (const [x0, z0, x1, z1, yy] of strips) {
      const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, mat);
      m.position.set((x0 + x1) / 2, yy, (z0 + z1) / 2);
      m.receiveShadow = true;
      this.skirt.add(m);
    }
    this.scene.add(this.skirt);
  }

  // Dense forest far from the meadow: a lumpy voxel canopy (cheap, reads as
  // thousands of treetops from above).
  buildCanopy(tiles) {
    const g = this.grid;
    const W = g.w * 2, H = g.h * 2;
    const top = new Float32Array(W * H).fill(-99);
    const col = new Int32Array(W * H);
    const greens = [0x1f4229, 0x23482d, 0x1c3c27, 0x284a2b, 0x1b3833, 0x204636];
    const autumn = [0x7a2a22, 0x8e4a1c, 0x8a6428, 0x7e4418, 0x84702e];
    for (const i of tiles) {
      const x = i % g.w, z = (i / g.w) | 0;
      const base = g.height[i];
      for (let sz = 0; sz < 2; sz++)
        for (let sx = 0; sx < 2; sx++) {
          const cx = x * 2 + sx, cz = z * 2 + sz;
          const n = fbm2(cx * 0.33, cz * 0.33, 77);
          top[cz * W + cx] = base + 2.4 + Math.round((n * 2.6 + hash2(cx, cz, 5) * 0.7) * 4) / 4;
          const au = fbm2(cx * 0.08, cz * 0.08, 91);
          const r = hash2(cx, cz, 13);
          col[cz * W + cx] = au > 0.64 && r < 0.75 ? autumn[Math.floor(hash2(cx >> 1, cz >> 1, 3) * autumn.length)] : greens[Math.floor(r * greens.length)];
        }
    }
    const pos = [], nor = [], cols = [], idx = [];
    let vi = 0;
    const quad = (a, b, c, d, n, rgb) => {
      pos.push(...a, ...b, ...c, ...d);
      for (let k = 0; k < 4; k++) { nor.push(n[0], n[1], n[2]); cols.push(rgb[0], rgb[1], rgb[2]); }
      idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      vi += 4;
    };
    const groundAt = (cx, cz) => {
      const tx = cx >> 1, tz = cz >> 1;
      return g.inb(tx, tz) ? g.height[tz * g.w + tx] : -4;
    };
    for (let cz = 0; cz < H; cz++)
      for (let cx = 0; cx < W; cx++) {
        const y = top[cz * W + cx];
        if (y < -50) continue;
        const rgb = linearRGB(col[cz * W + cx]);
        const x0 = cx / 2, x1 = x0 + 0.5, z0 = cz / 2, z1 = z0 + 0.5;
        quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0], rgb);
        const dark = [rgb[0] * 0.62, rgb[1] * 0.62, rgb[2] * 0.62];
        const nb = (nx, nz) => {
          if (nx < 0 || nz < 0 || nx >= W || nz >= H) return -4;
          const t = top[nz * W + nx];
          return t > -50 ? t : groundAt(nx, nz);
        };
        let ny = nb(cx + 1, cz); if (ny < y) quad([x1, ny, z1], [x1, ny, z0], [x1, y, z0], [x1, y, z1], [1, 0, 0], dark);
        ny = nb(cx - 1, cz); if (ny < y) quad([x0, ny, z0], [x0, ny, z1], [x0, y, z1], [x0, y, z0], [-1, 0, 0], dark);
        ny = nb(cx, cz + 1); if (ny < y) quad([x0, ny, z1], [x1, ny, z1], [x1, y, z1], [x0, y, z1], [0, 0, 1], dark);
        ny = nb(cx, cz - 1); if (ny < y) quad([x1, ny, z0], [x0, ny, z0], [x0, y, z0], [x1, y, z0], [0, 0, -1], dark);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, voxelMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.canopy = mesh;
  }

  // Shared nature atlas (2D pixel trees, foliage, rocks, water plants).
  natureFrames() {
    if (!this.nat) {
      const a = buildNatureAtlas();
      this.nat = { frames: a.frames, tex: pixelTexture(a.canvas) };
    }
    return this.nat;
  }

  frame(name, i = 0) {
    const f = this.natureFrames().frames[name];
    return f ? f[i % f.length] : null;
  }

  treeSprite(d) {
    const h = hash2(d.x, d.z, 17);
    const ground = this.grid.height[d.z * this.grid.w + d.x];
    switch (d.type) {
      case 'pine': return h < 0.5 ? 'pine_0' : 'pine_1';
      case 'spruce':
        if (ground > 6) return h < 0.5 ? 'spruce_snow_0' : 'spruce_snow_1';
        return ['spruce_0', 'spruce_1', 'spruce_2'][Math.floor(h * 3)];
      case 'maple': return ['maple_red', 'maple_orange', 'maple_scarlet'][d.variant % 3];
      case 'birch': return h < 0.4 ? 'birch_0' : h < 0.8 ? 'birch_1' : 'aspen_0';
      case 'boulder': return h < 0.4 ? 'boulder_0' : h < 0.75 ? 'boulder_1' : 'mossrock';
      case 'greatwillow': return this.frame('greatwillow') ? 'greatwillow' : 'maple_scarlet';
      case 'weed': { const n = `weed_${d.variant % 4}`; return this.frame(n) ? n : d.variant % 2 ? 'tallgrass_1' : 'fern_1'; }
      case 'stump': return this.frame('stump_1') ? (d.variant % 2 ? 'stump_1' : 'stump') : 'stump';
      default: return null;
    }
  }

  // BFS distance (tiles) from your land, for forest darkening
  landDistance() {
    const g = this.grid, n = g.w * g.h;
    if (this._landDist && this._landDistV === this.landVersion) return this._landDist;
    const d = new Float32Array(n).fill(99);
    const q = [];
    for (let i = 0; i < n; i++) if (g.meadow[i]) { d[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const c = q[h], cx = c % g.w, cz = (c / g.w) | 0;
      if (d[c] >= 14) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= g.w || nz >= g.h) continue;
        const ni = nz * g.w + nx;
        if (d[ni] > d[c] + 1) { d[ni] = d[c] + 1; q.push(ni); }
      }
    }
    this._landDist = d;
    this._landDistV = this.landVersion;
    return d;
  }

  // voxel landmarks hidden in the forest (fire tower, lumber hut, shrine...)
  buildMapLandmarks() {
    this.landmarkObjs = {};
    if (!LM?.landmarkModel) return;
    for (const L of LANDMARKS) {
      let m;
      try { m = LM.landmarkModel(L.id, { seed: 3 }); } catch (e) { console.warn('landmark', L.id, e); continue; }
      if (!m?.body) continue;
      const grp = new THREE.Group();
      const body = new THREE.Mesh(m.body.build({ pivot: [0.5, 0, 0.5], scale: 0.1 }), voxelMaterial());
      body.castShadow = true; body.receiveShadow = true;
      grp.add(body);
      if (m.glow) grp.add(new THREE.Mesh(m.glow.build({ pivot: [0.5, 0, 0.5], scale: 0.1, ao: false }), this.glowMat));
      const parts = [];
      (m.parts || []).forEach((pt) => {
        const holder = new THREE.Group();
        holder.position.set((pt.pivot[0] - 0.5) * 0.1, pt.pivot[1] * 0.1, (pt.pivot[2] - 0.5) * 0.1);
        if (pt.model) { const mm = new THREE.Mesh(pt.model.build({ pivot: pt.pivot, scale: 0.1 }), voxelMaterial()); mm.castShadow = true; holder.add(mm); }
        if (pt.glow) holder.add(new THREE.Mesh(pt.glow.build({ pivot: pt.pivot, scale: 0.1, ao: false }), this.glowMat));
        grp.add(holder);
        parts.push({ holder, anim: pt.anim, axis: pt.axis || (pt.anim === 'rotateY' ? 'y' : 'z'), speed: pt.speed ?? 1, phase: pt.phase || 0, amp: pt.amp ?? 1, y0: holder.position.y });
      });
      const y = this.grid.height[L.z * this.grid.w + L.x];
      grp.position.set(L.x + L.w / 2, y, L.z + L.d / 2);
      if (m.smoke) (this.smokePoints ||= []).push(...m.smoke.map(([x, yy, z]) => [x + L.x + L.w / 2, yy + y, z + L.z + L.d / 2]));
      grp.userData.parts = parts;
      this.scene.add(grp);
      this.landmarkObjs[L.id] = grp;
    }
  }

  animateLandmarks(t) {
    for (const grp of Object.values(this.landmarkObjs || {})) {
      for (const p of grp.userData.parts) {
        const h = p.holder, tt = t * p.speed + p.phase;
        if (p.anim === 'spin' || p.anim === 'rotateY') h.rotation[p.axis] = tt;
        else if (p.anim === 'sway') h.rotation[p.axis] = Math.sin(tt) * 0.15 * p.amp;
        else if (p.anim === 'wave') h.rotation.y = Math.sin(tt) * 0.22;
        else if (p.anim === 'bob') h.position.y = p.y0 + Math.sin(tt) * 0.03 * p.amp;
        else if (p.anim === 'blink') h.visible = blinkOn(tt);
        else if (p.anim === 'flicker') { const n = Math.sin(tt * 7.3) * 0.5 + Math.sin(tt * 13.1) * 0.3; h.scale.set(1, 1 + n * 0.15, 1); }
      }
    }
  }

  buildDecos() {
    for (const c of [...this.decoGroup.children]) this.decoGroup.remove(c);
    const { tex } = this.natureFrames();
    const g = this.grid;
    if (!this.treeBatch) {
      this.treeBatch = new SpriteBatch(tex, { max: 30000, lit: true, castShadow: true, receiveShadow: true, name: 'trees' });
    }
    const B = this.treeBatch;
    B.clear();
    const items = [];
    for (const d of this.decos) {
      if (d.removed) continue;
      const name = this.treeSprite(d);
      const f = name && this.frame(name);
      if (!f) continue;
      const rock = d.type === 'boulder' || d.type === 'stump';
      if (d.type === 'greatwillow' && name === 'maple_scarlet') d.scale = 3;
      const jx = (hash2(d.x, d.z, 3) - 0.5) * 0.3, jz = (hash2(d.x, d.z, 4) - 0.5) * 0.3;
      const dark = d.far ? 0.9 : 1;
      items.push({ tile: d.z * g.w + d.x, f, x: d.x + 0.5 + jx, y: g.surfaceAtVisual(d.x + 0.5 + jx, d.z + 0.5 + jz), z: d.z + 0.5 + jz, o: { texels: 24, scale: d.scale * (rock ? 1 : 1.05), sway: rock ? 0 : 0.5, phase: hash2(d.x, d.z, 9) * 6.28, flip: d.rot % 2 === 1 && !rock, tint: [dark, dark, dark * 1.02] } });
    }
    // the big forest: every forest tile carries 1-3 procedural trees (by biome),
    // darker the deeper you go so the edge of your land reads clearly
    const g2 = this.grid;
    const landDist = this.landDistance();
    const pickF = (names, r) => { for (let k = 0; k < names.length; k++) { const n = names[(Math.floor(r * names.length) + k) % names.length]; if (this.frame(n)) return n; } return 'pine_0'; };
    for (let z = 21; z < g2.h; z++)
      for (let x = 0; x < g2.w; x++) {
        const i = z * g2.w + x;
        if (g2.kind[i] !== KIND.FOREST || g2.deco[i] >= 0 || g2.occ[i] === -2) continue;
        const bio = g2.biome ? g2.biome[i] : 0;
        const ld = landDist[i];
        const n = bio === BIOME.SWAMP ? (hash2(x, z, 23) < 0.5 ? 1 : 0) : hash2(x, z, 23) < 0.6 ? 2 : 1;
        for (let k = 0; k < Math.max(1, n); k++) {
          const r = hash2(x * 3 + k, z, 31);
          let name, sway = 0.4, sc = 0.95 + hash2(x, z, 70 + k) * 0.35;
          if (bio === BIOME.SWAMP) { name = r < 0.55 ? pickF(['cypress_0', 'cypress_1'], r * 2) : r < 0.75 ? pickF(['deadtree_0', 'deadtree_1'], r) : pickF(['swampreeds_0', 'swampgrass_0', 'pine_1'], r); }
          else if (bio === BIOME.MUSHROOM) { name = r < 0.5 ? pickF(['giantshroom_red_0', 'giantshroom_red_1', 'giantshroom_brown_0', 'giantshroom_glow_0', 'giantshroom_glow_1'], r * 2) : r < 0.7 ? pickF(['shroomcluster_0', 'shroomcluster_1', 'shroomcluster_2'], r) : pickF(['spruce_0', 'pine_0', 'birch_1'], r); sway = 0.15; }
          else if (bio === BIOME.WILLOW) name = r < 0.5 ? 'birch_0' : r < 0.8 ? 'aspen_0' : 'birch_1';
          else {
            const au = fbm2(x * 0.16, z * 0.16, 91);
            if (au > 0.62 && r < 0.6) name = ['maple_red', 'maple_orange', 'maple_scarlet'][Math.floor(hash2(x, z + k, 7) * 3)];
            else if (r < 0.45) name = ['spruce_0', 'spruce_1', 'spruce_2'][Math.floor(hash2(x + k, z, 8) * 3)];
            else if (r < 0.85) name = r < 0.65 ? 'pine_0' : 'pine_1';
            else name = r < 0.93 ? 'birch_0' : 'aspen_0';
          }
          const f = this.frame(name);
          if (!f) continue;
          const dk = Math.max(0.62, 1 - Math.min(ld, 12) * 0.03) * (0.9 + hash2(x, z, 41 + k) * 0.1);
          const glow = name.startsWith('giantshroom_glow') ? 0.35 : 0;
          const tx2 = x + 0.25 + hash2(x, z, 50 + k) * 0.5, tz2 = z + 0.25 + hash2(x, z, 60 + k) * 0.5;
          items.push({ tile: i, f, x: tx2, y: g2.surfaceAtVisual(tx2, tz2), z: tz2, o: { texels: 24, scale: sc, sway, phase: r * 6.28, flip: r > 0.5, emissive: glow, tint: [dk * 0.96, dk, dk * 1.05] } });
        }
      }
    // draw back to front so the dither/alpha-test edges sort nicely
    items.sort((a, b) => a.z - b.z);
    this.treeTiles = new Map();
    for (const it of items) {
      const bi = B.push(it.f, it.x, it.y, it.z, it.o);
      if (it.tile != null && bi >= 0) { let l = this.treeTiles.get(it.tile); if (!l) this.treeTiles.set(it.tile, (l = [])); l.push([bi, it.o.tint || [1, 1, 1], it.o.emissive || 0]); }
    }
    this.applyMarks(B, this.treeTiles);
    B.commit();
    this.decoGroup.add(B.mesh);
  }

  clutterSprite(c, k) {
    const h = hash2(Math.floor(c.x * 7), Math.floor(c.z * 7), 5 + k);
    switch (c.type) {
      case 'tuft': return h < 0.62 ? `tuft_${Math.floor(h * 6.4) % 4}` : h < 0.82 ? `tallgrass_${h < 0.72 ? 0 : 1}` : h < 0.9 ? 'clover' : 'dandelion';
      case 'fireweed': return h < 0.75 ? 'fireweed' : 'aster';
      case 'lupine': return ['lupine_purple', 'lupine_blue', 'lupine_pink'][Math.floor(h * 3)];
      case 'daisy': return h < 0.45 ? 'daisy' : h < 0.75 ? 'susan' : h < 0.9 ? 'dandelion' : 'trillium';
      case 'fern': return h < 0.5 ? 'fern_0' : 'fern_1';
      case 'mushroom': return h < 0.5 ? 'mushroom_red' : 'mushroom_brown';
      case 'glowcap': return this.frame('glowcap_0') ? `glowcap_${Math.floor(h * 3)}` : 'mushroom_red';
      case 'swampgrass': return this.frame('swampgrass_0') ? `swampgrass_${Math.floor(h * 3)}` : 'tallgrass_0';
      default: return c.type;
    }
  }

  buildClutter() {
    if (this.clutterGroup) this.scene.remove(this.clutterGroup);
    this.clutterGroup = new THREE.Group();
    this.scene.add(this.clutterGroup);
    const g = this.grid;
    const { tex } = this.natureFrames();
    if (!this.clutterBatch) {
      this.clutterBatch = new SpriteBatch(tex, { max: 9000, lit: true, castShadow: false, receiveShadow: true, name: 'clutter' });
      this.flatBatch = new SpriteBatch(tex, { max: 1500, lit: true, castShadow: false, receiveShadow: true, renderOrder: 11, name: 'flatnature' });
    }
    const B = this.clutterBatch, F = this.flatBatch;
    B.clear();
    F.clear();
    const free = (i) => g.kind[i] !== KIND.WATER && g.deco[i] !== -3 && g.occ[i] < 0;
    const items = [];
    const add = (name, x, z, o) => {
      const f = this.frame(name);
      if (!f) return;
      const tx = Math.floor(x), tz = Math.floor(z);
      items.push({ tile: tz * g.w + tx, f, x, y: g.surfaceAtVisual(x, z), z, o: { texels: 24, ...o } });
    };
    this._clutterMap = null;
    for (const c of this.clutter) {
      if (c.removed) continue;
      const tx = Math.floor(c.x), tz = Math.floor(c.z);
      const i = tz * g.w + tx;
      if (!free(i) || g.deco[i] >= 0) continue;
      const name = this.clutterSprite(c, 0);
      const grassy = c.type === 'tuft' || c.type === 'fern';
      add(name, c.x, c.z, { sway: grassy ? 1.4 : 1.1, phase: c.rot * 3, flip: c.rot > Math.PI, scale: 0.9 + (c.rot % 1) * 0.25 });
      // second, offset tuft so meadows read lush
      if (c.type === 'tuft' && hash2(tx, tz, 77) < 0.35) add(`tuft_${Math.floor(hash2(tx, tz, 78) * 4)}`, c.x + 0.28, c.z + 0.18, { sway: 1.4, phase: c.rot * 2 + 1, flip: c.rot < 2 });
    }
    const removedTiles = new Set();
    for (const c of this.clutter) if (c.removed) removedTiles.add(Math.floor(c.z) * g.w + Math.floor(c.x));
    // small details: pebbles, rocks, logs, stumps, pinecones and fallen leaves
    for (let z = 0; z < g.h; z++)
      for (let x = 0; x < g.w; x++) {
        const i = z * g.w + x;
        if (!free(i) || g.deco[i] >= 0) continue;
        const k = g.kind[i];
        const r = hash2(x, z, 201), r2 = hash2(x, z, 202);
        const px = x + 0.2 + hash2(x, z, 203) * 0.6, pz = z + 0.2 + hash2(x, z, 204) * 0.6;
        if (removedTiles.has(i)) continue;
        if (k === KIND.ROCK || k === KIND.SAND) {
          if (r < 0.35) add(`pebble_${Math.floor(r2 * 4)}`, px, pz, {});
          else if (r < 0.48) add(`rock_${Math.floor(r2 * 3)}`, px, pz, {});
        } else if (k === KIND.FOREST) {
          if (r < 0.06) add(r2 < 0.5 ? 'log_0' : 'log_1', px, pz, { flip: r2 > 0.25 && r2 < 0.75 });
          else if (r < 0.1) add('stump', px, pz, {});
          else if (r < 0.2) add('pinecone', px, pz, {});
          else if (r < 0.32) add(['leaf_red', 'leaf_orange', 'leaf_yellow', 'leaf_brown'][Math.floor(r2 * 4)], px, pz, { mode: 1 });
          else if (r < 0.37) add(r2 < 0.6 ? 'bush_0' : 'blueberry', px, pz, { sway: 0.6 });
        } else if (k === KIND.GRASS) {
          if (r < 0.025) add(`rock_${Math.floor(r2 * 3)}`, px, pz, {});
          else if (r < 0.05) add(`pebble_${Math.floor(r2 * 4)}`, px, pz, {});
          else if (r < 0.065 && !g.meadow[i]) add(r2 < 0.5 ? 'bush_1' : 'sumac', px, pz, { sway: 0.6 });
          else if (r < 0.075) add(['leaf_red', 'leaf_orange', 'leaf_yellow'][Math.floor(r2 * 3)], px, pz, { mode: 1 });
        }
      }
    // shore and water plants
    const isW = (x, z) => g.inb(x, z) && g.kind[z * g.w + x] === KIND.WATER;
    for (let z = MEADOW.z0; z < MEADOW.z1; z++)
      for (let x = MEADOW.x0; x < MEADOW.x1; x++) {
        const i = z * g.w + x;
        if (g.occ[i] >= 0) continue;
        const r = hash2(x, z, 301), r2 = hash2(x, z, 302);
        const px = x + 0.15 + hash2(x, z, 303) * 0.7, pz = z + 0.15 + hash2(x, z, 304) * 0.7;
        if (isW(x, z)) {
          const nearShore = !isW(x + 1, z) || !isW(x - 1, z) || !isW(x, z + 1) || !isW(x, z - 1);
          const y = WATER_Y + 0.02;
          if (nearShore && r < 0.1) {
            const f = this.frame(r2 < 0.4 ? `cattail_${r2 < 0.2 ? 0 : 1}` : r2 < 0.8 ? `reeds_${r2 < 0.6 ? 0 : 1}` : 'wildrice');
            items.push({ f, x: px, y: WATER_Y - 0.25, z: pz, o: { texels: 24, sway: 1.2, phase: r * 9, flip: r2 > 0.5 } });
          } else if (r < 0.07 || (nearShore && r < 0.2)) {
            const name = r2 < 0.45 ? 'lilypad_0' : r2 < 0.85 ? 'lilypad_1' : 'duckweed';
            const f = this.frame(name);
            F.push(f, px, y, pz, { texels: 24, mode: 1, ax: 0.5, ay: 0.5, rot: r * 6.28, sway: 0 });
            if (name !== 'duckweed' && r2 < 0.25) F.push(this.frame(r2 < 0.12 ? 'lilyflower_pink' : 'lilyflower_white'), px, y + 0.03, pz, { texels: 24, mode: 1, ax: 0.5, ay: 0.5 });
          }
        } else if (g.kind[i] !== KIND.WATER && g.deco[i] < 0 && free(i)) {
          const shore = isW(x + 1, z) || isW(x - 1, z) || isW(x, z + 1) || isW(x, z - 1);
          if (shore && r < 0.22) add(r2 < 0.5 ? 'cattail_0' : r2 < 0.8 ? 'reeds_1' : 'tallgrass_1', px, pz, { sway: 1.2, phase: r * 9, flip: r2 > 0.5 });
          else if (shore && r < 0.45) add(`pebble_${Math.floor(r2 * 4)}`, px, pz, {});
        }
      }
    items.sort((a, b) => a.z - b.z);
    this.clutterTiles = new Map();
    this.flatTiles = new Map();
    const rec = (m, tile, bi, tint, em = 0) => { if (bi < 0) return; let l = m.get(tile); if (!l) m.set(tile, (l = [])); l.push([bi, tint || [1, 1, 1], em]); };
    for (const it of items) {
      if (it.o.mode === 1) rec(this.flatTiles, it.tile, F.push(it.f, it.x, it.y + 0.02, it.z, { ...it.o, ax: 0.5, ay: 0.5, rot: hash2(Math.floor(it.x * 9), Math.floor(it.z * 9), 1) * 6.28 }), it.o.tint);
      else rec(this.clutterTiles, it.tile, B.push(it.f, it.x, it.y, it.z, it.o), it.o.tint);
    }
    this.applyMarks(B, this.clutterTiles);
    this.applyMarks(F, this.flatTiles);
    B.commit();
    F.commit();
    this.clutterGroup.add(B.mesh, F.mesh);
  }

  // Destroy tool: everything the beavers are told to tear down glows red
  applyMarks(B, map, prev = null) {
    if (!map) return;
    const marked = this.marked || new Set();
    const RED = [2.1, 0.42, 0.36];
    if (prev) for (const t of prev) if (!marked.has(t)) for (const [bi, tint, em] of map.get(t) || []) { B.setTint(bi, tint); B.setEmissive(bi, em || 0); }
    for (const t of marked) for (const [bi] of map.get(t) || []) { B.setTint(bi, RED); B.setEmissive(bi, 0.22); }
  }

  // beavers chopping a tile bit by bit: its trees get shorter (k 0 = whole, 1 = stump)
  setChop(i, k) {
    const B = this.treeBatch;
    const l = this.treeTiles?.get(i);
    if (!B || !l) return;
    for (const [bi] of l) B.setScale(bi, 1 - 0.18 * k, 1 - 0.62 * k);
    B.commit();
  }

  setMarked(set) {
    const prev = this.marked || new Set();
    this.marked = new Set(set);
    if (this.treeBatch && this.treeTiles) { this.applyMarks(this.treeBatch, this.treeTiles, prev); this.treeBatch.commit(); }
    if (this.clutterBatch && this.clutterTiles) { this.applyMarks(this.clutterBatch, this.clutterTiles, prev); this.applyMarks(this.flatBatch, this.flatTiles, prev); this.clutterBatch.commit(); this.flatBatch.commit(); }
  }

  // anything small on a tile (flowers, tufts, ferns, pebbles, logs...) that can be cleared
  clutterOn(x, z) {
    const g = this.grid;
    if (!this._clutterMap) {
      this._clutterMap = new Map();
      for (const c of this.clutter) { if (c.removed) continue; const k = Math.floor(c.z) * g.w + Math.floor(c.x); let l = this._clutterMap.get(k); if (!l) this._clutterMap.set(k, (l = [])); l.push(c); }
    }
    return this._clutterMap.get(z * g.w + x) || null;
  }

  hasClutter(x, z) {
    const g = this.grid;
    const i = z * g.w + x;
    if (this.clutterOn(x, z)?.length) return true;
    return (this.clutterTiles?.get(i)?.length || 0) + (this.flatTiles?.get(i)?.length || 0) > 0;
  }

  removeClutter(x, z) {
    const g = this.grid;
    const l = this.clutterOn(x, z) || [];
    for (const c of l) c.removed = true;
    // a removed marker also hides the procedural pebbles/leaves/bushes of the tile
    this.clutter.push({ type: 'none', x: x + 0.5, z: z + 0.5, y: g.height[z * g.w + x], rot: 0, removed: true });
    this._clutterMap = null;
  }

  buildLandmarks() {
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x445566 });
    // office
    const off = officeModel();
    const og = new THREE.Group();
    const ob = new THREE.Mesh(off.body.build({ scale: 0.25 }), voxelMaterial());
    ob.castShadow = true; ob.receiveShadow = true;
    const ow = new THREE.Mesh(off.glow.build({ scale: 0.25, ao: false }), this.glowMat);
    og.add(ob, ow);
    og.position.set(OFFICE.x, OFFICE.h, OFFICE.z);
    this.scene.add(og);
    this.office = og;
    this.officeDoor = new THREE.Vector3(OFFICE.x, OFFICE.h, OFFICE.z + 2.4);
    // hut
    const hut = hutModel();
    const hg = new THREE.Group();
    const hb = new THREE.Mesh(hut.body.build({ scale: 0.1 }), voxelMaterial());
    hb.castShadow = true; hb.receiveShadow = true;
    const hw = new THREE.Mesh(hut.glow.build({ scale: 0.1, ao: false }), this.glowMat);
    hg.add(hb, hw);
    try { hg.add(hutDecals()); } catch (e) { console.warn('hut decals', e); }
    hg.position.set(HUT.x, 0, HUT.z);
    this.scene.add(hg);
    this.hut = hg;
    for (let z = HUT.z; z < HUT.z + 3; z++)
      for (let x = HUT.x; x < HUT.x + 3; x++) this.grid.occ[z * this.grid.w + x] = -2; // reserved
  }

  rebuildTerrain() {
    this.terrain.geometry.dispose();
    this.terrain.geometry = buildTerrainGeometry(this.grid);
    this.water.geometry.dispose();
    this.water.geometry = buildWaterGeometry(this.grid);
    buildShoreTexture(this.grid, this.shoreTex);
    buildSurfaceTexture(this.grid, this.surfTex);
    this.sim.refreshMask();
    this.sim.resetLand();
  }

  update(time, sky, camera) {
    this.uniforms.uTime.value = time;
    this.animateLandmarks(time);
    const s = sky.state;
    const wu = this.waterUniforms;
    wu.uSunDir.value.copy(s.sunDir);
    if (camera) {
      const e = camera.matrixWorld.elements;
      wu.uViewDir.value.set(e[8], e[9], e[10]).normalize();
    }
    wu.uShallow.value.copy(s.waterShallow);
    wu.uDeep.value.copy(s.waterDeep);
    wu.uSkyTint.value.copy(s.skyTint);
    wu.uNight.value = s.night;
    wu.uAurora.value = s.aurora;
    this.uniforms.uCaustic.value = 1 - s.night * 0.8;
    // windows: dark reflective by day, warm glow at night
    const n = Math.max(s.night, 0);
    this.glowMat.color.setRGB(0.28 + 0.72 * n, 0.33 + 0.62 * n, 0.42 + 0.4 * n);
  }
}

export { MEADOW, WORLD_W, WORLD_H, WATER_Y };
