// Placement previews: translucent structure models + tile highlights.
import * as THREE from 'three';
import { WATER_Y } from '../world/grid.js';

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
      g.traverse((o) => { if (o.isMesh) o.material = e.ok ? this.modelOk : this.modelBad; });
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
    this.modelCache.set(type, proto);
    return proto;
  }
}
