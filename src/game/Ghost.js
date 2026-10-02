// Placement previews: translucent structure models + tile highlights.
import * as THREE from 'three';
import { WATER_Y } from '../world/grid.js';
import { STRUCTURES } from '../data/structures.js';
import { stagesFor } from '../data/crops.js';
import { natureCanvas } from '../art/natureArt.js';

const okColor = new THREE.Color(0x8aff9a);
const badColor = new THREE.Color(0xff6a5a);

export class Ghost {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.renderOrder = 30;
    game.scene.add(this.group);
    this.tileGeo = new THREE.PlaneGeometry(0.96, 0.96);
    this.tileGeo.rotateX(-Math.PI / 2);
    this.okMat = new THREE.MeshBasicMaterial({ color: okColor, transparent: true, opacity: 0.35, depthWrite: false });
    this.badMat = new THREE.MeshBasicMaterial({ color: badColor, transparent: true, opacity: 0.4, depthWrite: false });
    this.modelOk = new THREE.MeshBasicMaterial({ color: 0xa8ffb8, transparent: true, opacity: 0.55, depthWrite: false });
    this.modelBad = new THREE.MeshBasicMaterial({ color: 0xff8a7a, transparent: true, opacity: 0.5, depthWrite: false });
    this.tiles = [];
    this.models = [];
    this.modelType = null;
    this.modelCache = new Map();
  }

  clear() {
    for (const t of this.tiles) t.visible = false;
    for (const m of this.models) m.visible = false;
  }

  tileY(x, z) {
    const g = this.game.grid;
    if (g.isWater(x, z)) return WATER_Y + 0.03;
    const s = g.structAt(x, z);
    if (s && s.type === 'platform' && s.built) return 0.72;
    return g.surfaceY(x, z) + 0.03;
  }

  // entries: [{x, z, ok}]
  showTiles(entries) {
    while (this.tiles.length < entries.length) {
      const m = new THREE.Mesh(this.tileGeo, this.okMat);
      m.renderOrder = 31;
      this.group.add(m);
      this.tiles.push(m);
    }
    this.tiles.forEach((m, i) => {
      const e = entries[i];
      if (!e) { m.visible = false; return; }
      m.visible = true;
      m.material = e.ok ? this.okMat : this.badMat;
      m.position.set(e.x + 0.5, this.tileY(e.x, e.z), e.z + 0.5);
    });
  }

  // structure model previews at entries
  showModels(type, entries) {
    if (!type) { for (const m of this.models) m.visible = false; return; }
    const proto = this.protoFor(type);
    while (this.models.length < entries.length) {
      const g = new THREE.Group();
      this.group.add(g);
      this.models.push(g);
    }
    this.models.forEach((g, i) => {
      const e = entries[i];
      if (!e || !proto) { g.visible = false; return; }
      if (g.userData.type !== type) {
        g.clear();
        if (proto.userData.spriteGhost) {
          // 2D plants: a see-through billboard of the grown plant
          const sp = new THREE.Sprite(proto.userData.spriteGhost);
          sp.center.set(0.5, 0);
          sp.scale.copy(proto.userData.spriteSize);
          sp.renderOrder = 32;
          sp.userData.isGhostSprite = true;
          g.add(sp);
        }
        for (const child of proto.children) {
          const m = new THREE.Mesh(child.geometry, this.modelOk);
          m.position.copy(child.position);
          m.rotation.copy(child.rotation);
          m.renderOrder = 32;
          g.add(m);
        }
        g.userData.type = type;
      }
      g.visible = true;
      g.traverse((o) => { if (o.isMesh) o.material = e.ok ? this.modelOk : this.modelBad; else if (o.isSprite) o.material.color.set(e.ok ? 0xc8ffd0 : 0xff9a8a); });
      const st = this.game.structures;
      const fake = { type, x: e.x, z: e.z, platform: 0 };
      const gs = this.game.grid.structAt(e.x, e.z);
      if (gs && gs.type === 'platform' && type !== 'platform') fake.platform = gs.id;
      g.position.set(e.x + 0.5, st.baseY(fake), e.z + 0.5);
    });
  }

  protoFor(type) {
    if (this.modelCache.has(type)) return this.modelCache.get(type);
    const proto = this.game.structures.previewObject(type);
    const d = STRUCTURES[type];
    const st = stagesFor(type);
    const names = [...(st ? [st[3]] : []), ...(d?.sprite || [])].filter(Boolean);
    if (!proto.children.length && names.length) {
      for (const n of names) {
        let cv = null;
        try { cv = natureCanvas(n, 0, 1); } catch { cv = null; }
        if (!cv || cv.width < 4) continue;
        const tex = new THREE.CanvasTexture(cv);
        tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
        proto.userData.spriteGhost = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.7, depthWrite: false, color: 0xc8ffd0 });
        const k = (d.spriteScale || 1) * (d.crop ? 1.2 : 1) / 24;
        proto.userData.spriteSize = new THREE.Vector3(cv.width * k, cv.height * k, 1);
        break;
      }
    }
    this.modelCache.set(type, proto);
    return proto;
  }
}
