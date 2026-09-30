// Player-built structures: placement rules, meshes (with auto-connecting
// dams/fences/platforms), blueprints for beaver jobs, production (seaweed,
// honey, syrup, berries, bugs), contraptions, damage and serialization.
import * as THREE from 'three';
import { STRUCTURES } from '../data/structures.js';
import { KIND, WATER_Y, N4 } from '../world/grid.js';
import { voxelMaterial, addGrain } from '../core/voxel.js';
import * as SM from '../entities/structureModels.js';

export const PLATFORM_DECK_Y = 0.6;
const geoCache = new Map();
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.42, depthWrite: false });
const damagedTint = new THREE.Color(1, 0.55, 0.5);

function cachedGeo(key, make, opts) {
  let g = geoCache.get(key);
  if (!g) {
    const vm = make();
    g = vm.build({ pivot: [0.5, 0, 0.5], ...(opts || {}) });
    geoCache.set(key, g);
  }
  return g;
}

let nextId = 1;

export class StructureSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.byId = new Map();
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff });
    game.grid.getStruct = (id) => this.byId.get(id) || null;
    this.time = 0;
  }

  get grid() { return this.game.grid; }

  // ------------------------------------------------------------ placement
  tileInfo(x, z) {
    const g = this.grid;
    if (!g.inb(x, z)) return null;
    const i = z * g.w + x;
    return { i, water: g.kind[i] === KIND.WATER, meadow: !!g.meadow[i], deco: g.deco[i] >= 0, occ: g.occ[i] };
  }

  canPlace(type, x, z) {
    const def = STRUCTURES[type];
    const g = this.grid;
    const t = this.tileInfo(x, z);
    if (!def || !t) return { ok: false, reason: 'Out of bounds' };
    if (!t.meadow) return { ok: false, reason: 'Outside your land' };
    const entry = this.game.bears?.entryTile;
    if (entry && Math.max(Math.abs(x - entry[0]), Math.abs(z - entry[1])) <= 1) return { ok: false, reason: 'Keep the trail clear for customers!' };
    if (t.deco) return { ok: false, reason: 'A tree or rock is in the way (demolish it first)' };
    const occ = t.occ >= 0 ? this.byId.get(t.occ) : null;
    if (t.occ === -2) return { ok: false, reason: 'That\'s the hut!' };
    const onPlatform = occ && occ.def.supports && occ.built && !occ.top;
    const shore = !t.water && g.hasWaterNeighbor(x, z);
    const shoreWater = t.water && g.hasLandNeighbor(x, z);
    switch (def.place) {
      case 'water': if (!t.water || occ) return { ok: false, reason: 'Must be placed in water' }; break;
      case 'shoreWater': if (!shoreWater || occ) return { ok: false, reason: 'Must be in water next to the shore' }; break;
      case 'land': if (t.water || occ) return { ok: false, reason: 'Must be placed on empty land' }; break;
      case 'shore': if (!shore || occ) return { ok: false, reason: 'Must be on the shoreline' }; break;
      case 'landOrPlatform':
        if (onPlatform) break;
        if (t.water || occ) return { ok: false, reason: 'Needs empty land or a platform' }; break;
      case 'shoreOrPlatform':
        if (onPlatform) break;
        if (!shore || occ) return { ok: false, reason: 'Needs the shoreline or a platform' }; break;
      case 'nearWillow': {
        if (t.water || occ) return { ok: false, reason: 'Must be on empty land' };
        if (!this.list.some((s) => s.type === 'willow' && s.built && Math.max(Math.abs(s.x - x), Math.abs(s.z - z)) <= 2))
          return { ok: false, reason: 'Must be within 2 tiles of a willow tree' };
        break;
      }
      case 'any': if (occ) return { ok: false, reason: 'Something is already there' }; break;
    }
    return { ok: true, onPlatform: onPlatform ? occ : null };
  }

  place(type, x, z, { instant = false, free = false } = {}) {
    const def = STRUCTURES[type];
    const chk = this.canPlace(type, x, z);
    if (!chk.ok) return null;
    const g = this.grid;
    const s = {
      id: nextId++, type, def, x, z, hp: def.hp, maxHp: def.hp,
      built: instant || def.builder !== 'beaver', progress: instant || def.builder !== 'beaver' ? 1 : 0,
      stock: def.food ? def.food.max * 0.5 : 0, bugCount: 0, timer: Math.random() * 3, open: false,
      platform: chk.onPlatform ? chk.onPlatform.id : 0, top: 0, obj: null, removed: false, assigned: null,
      seed: Math.floor(Math.random() * 1000), paid: free ? 0 : def.cost,
    };
    if (s.platform) {
      chk.onPlatform.top = s.id;
    } else {
      g.occ[z * g.w + x] = s.id;
    }
    this.list.push(s);
    this.byId.set(s.id, s);
    this.buildMesh(s);
    this.refreshNeighbors(s);
    if (s.built) this.onBuilt(s, true);
    return s;
  }

  remove(s, { silent = false } = {}) {
    if (s.removed) return;
    s.removed = true;
    const g = this.grid;
    if (s.platform) {
      const p = this.byId.get(s.platform);
      if (p && p.top === s.id) p.top = 0;
    } else {
      g.occ[s.z * g.w + s.x] = -1;
      if (s.top) { const t = this.byId.get(s.top); if (t) this.remove(t, { silent: true }); }
    }
    if (s.obj) { this.group.remove(s.obj); }
    this.list.splice(this.list.indexOf(s), 1);
    this.byId.delete(s.id);
    this.refreshNeighbors(s);
    if (s.def.blocksFish || s.def.blocksBear || s.def.beavers) this.game.onTopologyChanged();
    if (!silent) this.game.particles.debris(s.x + 0.5, this.baseY(s) + 0.4, s.z + 0.5, 10);
  }

  // Beaver finished (or instant structure placed)
  onBuilt(s, initial = false) {
    s.built = true;
    s.progress = 1;
    this.buildMesh(s);
    this.refreshNeighbors(s);
    if (s.def.blocksFish || s.def.blocksBear || s.def.beavers || s.def.gate) this.game.onTopologyChanged();
    if (s.def.beavers) this.game.beavers.onLodgeBuilt(s);
    if (!initial) {
      this.game.particles.dust(s.x + 0.5, this.baseY(s) + 0.3, s.z + 0.5, 8, 0xd8c8a0);
      this.game.audio.play('build', { volume: 0.5 });
    }
  }

  damage(s, amt) {
    if (!s.def.smashable || s.platform) return false;
    s.hp -= amt;
    this.game.particles.debris(s.x + 0.5, this.baseY(s) + 0.5, s.z + 0.5, 6);
    if (s.hp <= 0) {
      this.game.audio.play('smash', { volume: 0.7 });
      this.game.stats.smashed++;
      this.remove(s);
      return true;
    }
    this.tint(s);
    return false;
  }

  repair(s, amt) {
    s.hp = Math.min(s.maxHp, s.hp + amt);
    this.tint(s);
  }

  tint(s) {
    if (!s.obj) return;
    const dmg = s.hp < s.maxHp * 0.99 && s.maxHp < 90;
    s.obj.traverse((o) => {
      if (o.isMesh && o.userData.tintable) o.material = dmg ? this.damagedMat() : voxelMaterial();
    });
  }

  damagedMat() {
    if (!this._dmgMat) { this._dmgMat = addGrain(new THREE.MeshLambertMaterial({ vertexColors: true, color: damagedTint })); }
    return this._dmgMat;
  }

  toggleGate(s) {
    if (!s.def.gate || !s.built) return;
    s.open = !s.open;
    this.game.audio.play('gate', { volume: 0.6 });
    this.game.onTopologyChanged();
  }

  // ------------------------------------------------------------ meshes
  baseY(s) {
    const g = this.grid;
    if (s.platform) return PLATFORM_DECK_Y + 0.1;
    if (s.type === 'lilypad') return WATER_Y + 0.01;
    return g.height[s.z * g.w + s.x];
  }

  depthVox(s) {
    if (s.preview) return 9;
    const g = this.grid;
    return Math.max(3, Math.round((WATER_Y - g.height[s.z * g.w + s.x]) / 0.1));
  }

  connectMask(s) {
    const g = this.grid;
    let mask = 0;
    const bits = [1, 2, 4, 8];
    N4.forEach(([dx, dz], k) => {
      const nx = s.x + dx, nz = s.z + dz;
      if (!g.inb(nx, nz)) return;
      const o = g.structAt(nx, nz);
      const t = s.type;
      if (t === 'dam' || t === 'gate') {
        if (o && (o.type === 'dam' || o.type === 'gate' || o.type === 'fence' || o.type === 'lodge')) mask |= bits[k];
        else if (!g.isWater(nx, nz)) mask |= bits[k];
      } else if (t === 'fence') {
        if (o && (o.type === 'fence' || o.type === 'dam' || o.type === 'gate' || o.type === 'willow' || o.type === 'maple')) mask |= bits[k];
        if (g.occ[nz * g.w + nx] === -2) mask |= bits[k];
      } else if (t === 'platform') {
        if (o && o.type === 'platform') mask |= bits[k];
      }
    });
    return mask;
  }

  refreshNeighbors(s) {
    const g = this.grid;
    for (const [dx, dz] of N4) {
      const o = g.structAt(s.x + dx, s.z + dz);
      if (o && o.def.connect || (o && o.type === 'platform')) this.buildMesh(o);
    }
  }

  // A standalone model (used for placement previews).
  previewObject(type) {
    const def = STRUCTURES[type];
    const fake = { id: -1, type, def, x: 0, z: 0, seed: 0, built: true, progress: 1, stock: def.food ? def.food.max : 0, hp: 1, maxHp: 1, platform: 0, preview: true };
    return this.makeObject(fake);
  }

  buildMesh(s) {
    if (s.obj) this.group.remove(s.obj);
    const obj = this.makeObject(s);
    s.obj = obj;
    this.group.add(obj);
    this.updateVisual(s);
    this.tint(s);
  }

  makeObject(s) {
    const obj = new THREE.Group();
    const d = s.def;
    const add = (geo, mat = voxelMaterial(), { shadow = true, tint = true } = {}) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadow;
      m.receiveShadow = true;
      m.userData.tintable = tint;
      obj.add(m);
      return m;
    };
    const variant = s.seed % 3;
    let mask = 0;
    switch (s.type) {
      case 'seaweed': add(cachedGeo(`sw${variant}`, () => SM.seaweedModel(variant + 1, 1.25))); break;
      case 'cattail': add(cachedGeo(`ct${variant}`, () => SM.cattailModel(variant + 1))); break;
      case 'lilypad': add(cachedGeo(`lp${variant}`, () => SM.lilypadModel(variant + 1, variant !== 2)), undefined, { shadow: false }); break;
      case 'willow': add(cachedGeo('willow', () => SM.willowModel(3))); break;
      case 'beehive': {
        add(cachedGeo('skep', () => SM.skepModel()));
        const drip = add(cachedGeo('skepdrip', () => { const v = SM.skepModel(); v.vox.clear(); SM.honeyDrips(v, 4); return v; }), undefined, { shadow: false });
        drip.name = 'drip';
        break;
      }
      case 'flowers': add(cachedGeo(`fb${variant}`, () => SM.flowerBedModel(variant + 3))); break;
      case 'berries': {
        add(cachedGeo(`bb${variant}`, () => SM.berryBushModel(variant + 1, 1))).name = 'full';
        add(cachedGeo(`bb${variant}e`, () => SM.berryBushModel(variant + 1, 0))).name = 'empty';
        break;
      }
      case 'maple': add(cachedGeo('smaple', () => SM.sugarMapleModel())); break;
      case 'bughotel': add(cachedGeo('bughotel', () => SM.bugHotelModel())); break;
      case 'lodge': add(cachedGeo(`lodge${this.depthVox(s)}`, () => SM.lodgeModel(this.depthVox(s)))); break;
      case 'dam': mask = this.connectMask(s); add(cachedGeo(`dam${mask}_${this.depthVox(s)}`, () => SM.damModel(mask, this.depthVox(s), 3))); break;
      case 'fence': mask = this.connectMask(s); add(cachedGeo(`fence${mask}`, () => SM.fenceModel(mask, 2))); break;
      case 'gate': {
        mask = this.connectMask(s);
        const dv = this.depthVox(s);
        const key = `gate${mask}_${dv}`;
        const gm = SM.gateModel(mask, dv);
        add(cachedGeo(key, () => gm.body));
        const board = add(cachedGeo(key + 'b', () => gm.board));
        board.name = 'board';
        break;
      }
      case 'platform': {
        mask = this.connectMask(s);
        const stilt = s.preview ? 6 : Math.max(2, Math.round((PLATFORM_DECK_Y - this.grid.height[s.z * this.grid.w + s.x]) / 0.1));
        add(cachedGeo(`plat${mask}_${stilt}`, () => SM.platformModel(mask, stilt)));
        break;
      }
      case 'feeder': {
        const fm = SM.feederModel();
        add(cachedGeo('feeder', () => fm.body));
        const arm = add(cachedGeo('feederArm', () => fm.arm));
        arm.name = 'arm';
        arm.position.set(0, 1.62, 0);
        break;
      }
      case 'aerator': add(cachedGeo('aerator', () => SM.aeratorModel())); break;
      case 'lantern': {
        const lm = SM.lanternModel();
        add(cachedGeo('lantern', () => lm.body));
        add(cachedGeo('lanternG', () => lm.glow, { ao: false }), this.glowMat, { shadow: false, tint: false });
        break;
      }
    }
    if (!s.built) {
      obj.traverse((o) => { if (o.isMesh) { o.material = ghostMat; o.castShadow = false; o.userData.tintable = false; } });
    }
    if (s.preview) return obj;
    obj.position.set(s.x + 0.5, this.baseY(s), s.z + 0.5);
    if (s.type === 'lodge') {
      // face the entrance toward land
      const g = this.grid;
      for (let k = 0; k < 4; k++) {
        const [dx, dz] = N4[k];
        if (g.inb(s.x + dx, s.z + dz) && !g.isWater(s.x + dx, s.z + dz)) { obj.rotation.y = Math.atan2(dx, dz); break; }
      }
    } else if (!d.connect && s.type !== 'platform' && s.type !== 'beehive' && s.type !== 'maple') {
      obj.rotation.y = ((s.seed % 4) * Math.PI) / 2;
    }
    return obj;
  }

  updateVisual(s) {
    const o = s.obj;
    if (!o) return;
    if (s.type === 'seaweed') {
      const k = 0.35 + 0.65 * (s.stock / s.def.food.max);
      o.scale.set(1, k, 1);
    } else if (s.type === 'beehive') {
      const drip = o.getObjectByName('drip');
      if (drip) drip.visible = s.stock >= 1;
    } else if (s.type === 'berries') {
      const full = o.getObjectByName('full'), empty = o.getObjectByName('empty');
      if (full) full.visible = s.stock >= 1;
      if (empty) empty.visible = s.stock < 1;
    }
    if (!s.built) {
      const k = 0.15 + 0.85 * s.progress;
      o.scale.y = k;
    }
  }

  // ------------------------------------------------------------ queries
  nearestFood(kind, x, z, r, region = -2) {
    let best = null, bd = r * r;
    for (const s of this.list) {
      if (!s.built || !s.def.food || s.def.food.kind !== kind) continue;
      if (s.stock < (kind === 'seaweed' ? 0.3 : 1)) continue;
      if (region !== -2 && kind === 'seaweed' && this.grid.region[s.z * this.grid.w + s.x] !== region) continue;
      const dx = s.x + 0.5 - x, dz = s.z + 0.5 - z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  consume(s, amt) {
    if (s.removed || s.stock < amt * 0.5) return false;
    s.stock = Math.max(0, s.stock - amt);
    this.updateVisual(s);
    return true;
  }

  totalStock(kind) {
    let t = 0;
    for (const s of this.list) if (s.built && s.def.food && s.def.food.kind === kind) t += Math.floor(s.stock);
    return t;
  }

  countBuilt(type) {
    let n = 0;
    for (const s of this.list) if (s.type === type && s.built) n++;
    return n;
  }

  aeratorBoost(x, z) {
    let b = 0;
    for (const s of this.list) {
      if (s.type !== 'aerator' || !s.built) continue;
      const dx = s.x + 0.5 - x, dz = s.z + 0.5 - z;
      if (dx * dx + dz * dz < 16) b += s.def.aerator.boost;
    }
    return Math.min(1.5, b);
  }

  // fish under platforms / lily pads are hidden from bears
  isSheltered(x, z) {
    const s = this.grid.structAt(Math.floor(x), Math.floor(z));
    return !!(s && s.built && s.def.shelter);
  }

  smashTargets() {
    return this.list.filter((s) => s.def.smashable && !s.platform && s.built);
  }

  structureAtTile(x, z) {
    const s = this.grid.structAt(x, z);
    if (!s) return null;
    if (s.top) return this.byId.get(s.top) || s;
    return s;
  }

  // ------------------------------------------------------------ update
  update(dt) {
    this.time += dt;
    const game = this.game;
    const mods = game.mods;
    for (const s of this.list) {
      if (!s.built) { this.updateVisual(s); continue; }
      const d = s.def;
      if (d.food) {
        let mult = mods.produceMult;
        if (d.food.kind === 'honey') {
          let beds = 0;
          for (const o of this.list) if (o.type === 'flowers' && o.built && Math.abs(o.x - s.x) <= 3 && Math.abs(o.z - s.z) <= 3) beds++;
          mult *= 1 + 0.4 * Math.min(beds, 5);
          if (Math.random() < dt * 0.9) game.particles.lit.spawn(s.x + 0.5 + (Math.random() - 0.5), 0.8 + Math.random() * 0.4, s.z + 0.5 + (Math.random() - 0.5), 0, 0, 0, 1.6, 0.05, Math.random() < 0.5 ? 0xffd23a : 0x2a2010, 0, 0.5, 32);
        }
        const before = s.stock;
        s.stock = Math.min(d.food.max, s.stock + d.food.regen * mult * dt * (game.state.phase === 'night' ? 0.5 : 1));
        if (Math.floor(before) !== Math.floor(s.stock) || s.type === 'seaweed') this.updateVisual(s);
        if (d.food.kind === 'syrup' && s.stock >= 1 && Math.random() < dt * 0.5)
          game.particles.lit.spawn(s.x + 0.5, 1.0, s.z + 0.5 + 0.2, 0, -0.3, 0, 0.8, 0.04, 0xb8621a, 1, 0, 0);
      }
      if (d.bugs) {
        s.timer -= dt;
        if (s.timer <= 0) {
          s.timer = d.bugs.every / mods.bugMult;
          if (s.bugCount < d.bugs.max + mods.bugBonus) { game.food.spawnBug(s); s.bugCount++; }
        }
      }
      if (d.feeder) {
        s.timer -= dt;
        const arm = s.obj && s.obj.getObjectByName('arm');
        if (arm) arm.rotation.y += dt * (s.timer < 0.6 ? 14 : 1.5);
        if (s.timer <= 0 && game.state.phase !== 'night') {
          s.timer = d.feeder.every;
          const target = this.feederTarget(s);
          if (target) {
            game.food.throwHandful(s.x + 0.5, this.baseY(s) + 1.5, s.z + 0.5, target.x, target.z, d.feeder.n, 0.6);
            game.audio.play('click', { volume: 0.3, pitch: 0.7 });
          }
        }
      }
      if (d.aerator && Math.random() < dt * 5) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 1.2;
        game.particles.bubbles(s.x + 0.5 + Math.cos(a) * r, -0.8, s.z + 0.5 + Math.sin(a) * r, 1);
        if (Math.random() < 0.3) game.particles.ripple(s.x + 0.5 + Math.cos(a) * r, s.z + 0.5 + Math.sin(a) * r, 0.3, 0.7, 0.3);
      }
      if (d.gate) {
        const board = s.obj && s.obj.getObjectByName('board');
        if (board) board.position.y += ((s.open ? 1.05 : 0) - board.position.y) * Math.min(1, dt * 5);
      }
      if (s.type === 'seaweed' && s.obj) {
        s.obj.rotation.z = Math.sin(this.time * 1.2 + s.seed) * 0.06;
        s.obj.rotation.x = Math.cos(this.time * 0.9 + s.seed) * 0.05;
      }
      if (s.type === 'lilypad' && s.obj) s.obj.position.y = this.baseY(s) + Math.sin(this.time * 1.5 + s.seed) * 0.01;
    }
  }

  feederTarget(s) {
    const g = this.grid;
    const R = s.def.feeder.radius;
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * R;
      const x = s.x + 0.5 + Math.cos(a) * r, z = s.z + 0.5 + Math.sin(a) * r;
      if (g.fishPassable(Math.floor(x), Math.floor(z))) return { x, z };
    }
    return null;
  }

  // ------------------------------------------------------------ save
  serialize() {
    // platforms first so tops can attach on load
    const sorted = [...this.list].sort((a, b) => (a.platform ? 1 : 0) - (b.platform ? 1 : 0));
    return sorted.map((s) => [s.type, s.x, s.z, s.built ? 1 : 0, +s.progress.toFixed(2), +s.stock.toFixed(2), s.hp, s.open ? 1 : 0, s.seed]);
  }

  load(arr) {
    for (const s of [...this.list]) this.remove(s, { silent: true });
    for (const [type, x, z, built, progress, stock, hp, open, seed] of arr || []) {
      const s = this.place(type, x, z, { instant: !!built, free: true });
      if (!s) continue;
      s.progress = progress; s.stock = stock; s.hp = hp; s.open = !!open; s.seed = seed ?? s.seed;
      this.buildMesh(s);
    }
  }
}
