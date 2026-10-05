// Floating voxel decorations over the things you can click: a Minecraft-style
// block, a pixel gamepad, a heart, a picture frame, a bell... Built from the
// game's VoxelModel (pixel icons are extruded into little 3D voxel objects).
import * as THREE from 'three';
import { VoxelModel } from '../src/core/voxel.js';
import { ICONS, PAL } from './icons.js';

const VS = 0.03;
const hex = (s) => parseInt(s.slice(1), 16);

function extrude(name, depth = 3) {
  const rows = ICONS[name]();
  const m = new VoxelModel();
  const h = rows.length;
  rows.forEach((row, ry) => [...row].forEach((ch, x) => {
    const c = PAL[ch];
    if (!c) return;
    for (let z = 0; z < depth; z++) m.set(x, h - 1 - ry, z, hex(c) * (z === depth - 1 || z === 0 ? 1 : 1));
  }));
  return { m, w: rows[0].length, h };
}

// a Minecraft-style grass block: green top, dirt sides with a grass fringe and specks
function block() {
  const m = new VoxelModel(), N = 9;
  const rnd = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) for (let z = 0; z < N; z++) {
    const top = y === N - 1, fringe = y >= N - 3;
    let c;
    if (top) c = rnd(x, y, z) < 0.3 ? 0x6fbf4a : 0x5cab3c;
    else if (fringe && (x === 0 || x === N - 1 || z === 0 || z === N - 1)) c = rnd(x, y, z) < 0.4 ? 0x5cab3c : 0x6fbf4a;
    else c = rnd(x, y, z) < 0.22 ? 0x6b4a30 : rnd(x, y, z) < 0.5 ? 0x8a6340 : 0x7b5636;
    m.set(x, y, z, c);
  }
  return { m, w: N, h: N, d: N };
}

const MAKE = { block: () => block(), };

export class Icons3D {
  constructor(parent) {
    this.group = new THREE.Group();
    this.group.name = 'floatingIcons';
    parent.add(this.group);
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2a2018 });
    this.items = new Map();
    this.t = 0;
  }

  _get(name) {
    let it = this.items.get(name);
    if (it) return it;
    const made = MAKE[name] ? MAKE[name]() : extrude(name);
    const d = made.d || 3;
    const geo = made.m.build({ scale: VS, ao: true, pivot: [made.w / 2, 0, d / 2] });
    const mesh = new THREE.Mesh(geo, this.mat);
    const holder = new THREE.Group();
    holder.add(mesh);
    holder.visible = false;
    this.group.add(holder);
    it = { holder, mesh, h: made.h * VS };
    this.items.set(name, it);
    return it;
  }

  /** place an icon over each spot that has `icon`; hide the rest. spot: { icon, p: Vector3, iy } */
  sync(spots, dt) {
    this.t += dt;
    const used = new Set();
    spots.forEach((s, i) => {
      if (!s.icon) return;
      const key = s.icon + i;
      let it = this.items.get(key);
      if (!it) { const base = this._get(s.icon); it = { holder: base.holder.clone(), h: base.h }; this.group.add(it.holder); this.items.set(key, it); }
      used.add(key);
      it.holder.visible = true;
      it.holder.position.set(s.p.x, s.p.y + (s.iy ?? 0.4) + Math.sin(this.t * 2 + i) * 0.03, s.p.z + 0.1);
      it.holder.rotation.y = Math.sin(this.t * 0.9 + i) * 0.5;
    });
    for (const [k, it] of this.items) if (!used.has(k)) it.holder.visible = false;
  }
  hideAll() { for (const it of this.items.values()) it.holder.visible = false; }
}
