// Assembles the static world meshes: terrain, water, trees, clutter, buildings.
import * as THREE from 'three';
import { generateWorld, OFFICE, HUT, MEADOW, WORLD_W, WORLD_H } from './worldgen.js';
import { buildTerrainGeometry, makeTerrainMaterial, buildWaterGeometry, makeWaterMaterial, buildShoreTexture } from './terrain.js';
import { pineModel, mapleModel, birchModel, boulderModel, tuftModel, flowerModel } from './models.js';
import { officeModel, hutModel } from './buildings.js';
import { voxelMaterial, linearRGB } from '../core/voxel.js';
import { fbm2, hash2 } from '../core/rng.js';
import { WATER_Y } from './grid.js';

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

export class World {
  constructor(scene, seed = 1337) {
    this.scene = scene;
    const gen = generateWorld(seed);
    this.grid = gen.grid;
    this.decos = gen.decos;
    this.clutter = gen.clutter;
    this.trail = gen.trail;
    this.uniforms = {
      uTime: { value: 0 },
      uCaustic: { value: 1 },
    };
    this.terrainMat = makeTerrainMaterial(this.uniforms);
    this.terrain = new THREE.Mesh(buildTerrainGeometry(this.grid), this.terrainMat);
    this.terrain.receiveShadow = true;
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
    };
    this.water = new THREE.Mesh(buildWaterGeometry(this.grid), makeWaterMaterial(this.waterUniforms));
    this.water.renderOrder = 10;
    scene.add(this.water);

    this.buildSkirt();
    this.buildCanopy(gen.canopy);
    this.decoGroup = new THREE.Group();
    scene.add(this.decoGroup);
    this.buildDecos();
    this.buildClutter();
    this.buildLandmarks();
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
    const greens = [0x2b5634, 0x2f5e3a, 0x274e30, 0x345f36, 0x23483f, 0x2a5a44];
    const autumn = [0xb8322a, 0xd9701f, 0xe2a232, 0xc9661d, 0xe0bd45];
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
    const mesh = new THREE.Mesh(geo, this.terrainMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.canopy = mesh;
  }

  buildDecos() {
    for (const c of [...this.decoGroup.children]) {
      this.decoGroup.remove(c);
      c.dispose?.();
    }
    const groups = new Map();
    this.decos.forEach((d, i) => {
      if (d.removed) return;
      const far = !!d.far;
      const chunk = `${Math.floor(d.x / 20)}_${Math.floor(d.z / 20)}`;
      const k = `${d.type}|${d.variant}|${far ? 1 : 0}|${chunk}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(i);
    });
    this.modelCache = this.modelCache || new Map();
    for (const [k, list] of groups) {
      const [type, variantS, farS] = k.split('|');
      const variant = +variantS, far = farS === '1';
      const mk = `${type}|${variant}|${far}`;
      let geo = this.modelCache.get(mk);
      if (!geo) {
        const vm = decoModel(type, variant, far);
        geo = vm.build({ pivot: [0.5, 0, 0.5], scale: far ? 0.2 : 0.1, ao: type === 'boulder' });
        this.modelCache.set(mk, geo);
      }
      const mesh = new THREE.InstancedMesh(geo, voxelMaterial(), list.length);
      list.forEach((di, j) => {
        const d = this.decos[di];
        const y = this.grid.height[d.z * this.grid.w + d.x];
        _q.setFromAxisAngle(UP, (d.rot * Math.PI) / 2);
        _s.setScalar(d.scale);
        _p.set(d.x + 0.5, y, d.z + 0.5);
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(j, _m);
      });
      mesh.castShadow = !far;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.userData.decoIdx = list;
      this.decoGroup.add(mesh);
    }
  }

  buildClutter() {
    if (this.clutterGroup) this.scene.remove(this.clutterGroup);
    this.clutterGroup = new THREE.Group();
    this.scene.add(this.clutterGroup);
    const byType = new Map();
    for (const c of this.clutter) {
      if (c.removed) continue;
      const tx = Math.floor(c.x), tz = Math.floor(c.z);
      const i = tz * this.grid.w + tx;
      if (this.grid.kind[i] === 3 || this.grid.deco[i] >= 0 || this.grid.deco[i] === -3 || this.grid.occ[i] >= 0) continue;
      if (!byType.has(c.type)) byType.set(c.type, []);
      byType.get(c.type).push(c);
    }
    for (const [type, list] of byType) {
      const variants = type === 'tuft' ? 3 : 1;
      for (let v = 0; v < variants; v++) {
        const items = list.filter((_, i) => i % variants === v);
        if (!items.length) continue;
        const vm = type === 'tuft' ? tuftModel(v + 1) : flowerModel(type, v + 1);
        const geo = vm.build({ pivot: [0.5, 0, 0.5], ao: false });
        const mesh = new THREE.InstancedMesh(geo, voxelMaterial(), items.length);
        items.forEach((c, j) => {
          _q.setFromAxisAngle(UP, c.rot);
          _s.setScalar(1);
          _p.set(c.x, this.grid.height[Math.floor(c.z) * this.grid.w + Math.floor(c.x)], c.z);
          _m.compose(_p, _q, _s);
          mesh.setMatrixAt(j, _m);
        });
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        this.clutterGroup.add(mesh);
      }
    }
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
  }

  update(time, sky) {
    this.uniforms.uTime.value = time;
    const s = sky.state;
    const wu = this.waterUniforms;
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
