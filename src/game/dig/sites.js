// [v32 dig] Fossil sites in the world: the three home sites at Bonebed Bluff (they
// refill: a new find turns up every other day) and the sites around the valley
// that Survey Maps reveals one at a time (src/data/digSites.js SITE_ANCHORS: a free
// tile near the anchor, out of the fog). Each site is a voxel mound with a little
// orange flag and something peeking out (src/entities/digModels.js makeSiteMound);
// a dug site is a hole for a day. Tap a site -> the dig tray (src/ui/dig/DigGame.js).
//
// State (game.state.dig.sites): { [id]: { id, x, z, find, dugDay, made, anchor?, away } }
import * as THREE from 'three';
import { KIND } from '../../world/grid.js';
import { BONEBED, SITE_ANCHORS, MAP_SITE_MAX } from '../../data/digSites.js';
import { FIND_BY_ID, rollFind } from '../../data/digFinds.js';
import { makeSiteMound } from '../../entities/digModels.js';

const _v = new THREE.Vector3();
const HOME_REFILL = 2; // days

export class DigSites {
  constructor(sys) {
    this.sys = sys;
    this.game = sys.game;
    this.group = new THREE.Group();
    this.group.name = 'digSites';
    this.game.scene.add(this.group);
    this.meshes = new Map(); // id -> { obj, kind, find }
    this.t = 0;
  }
  get S() { return this.sys.S; }
  get list() { return Object.values(this.S.sites); }
  has(id) { return this.sys.has(id); }

  // ------------------------------------------------------------------ bookkeeping
  /** make sure the home sites exist; refill dug ones; called on load / each morning */
  refresh() {
    const S = this.S, day = this.game.state.day || 1;
    if (!this.sys.zoneOpen()) return;
    for (const h of BONEBED.home) {
      let s = S.sites[h.id];
      if (!s) s = S.sites[h.id] = { id: h.id, x: h.x, z: h.z, find: null, dugDay: -99, made: day, away: false, name: 'Bonebed Bluff' };
      if (!s.find && day - (s.dugDay ?? -99) >= HOME_REFILL) s.find = this.roll(s);
    }
    // map sites: drop the dug ones after a day, one new site a day while there's room
    for (const s of this.list) if (s.away && !s.find && day - (s.dugDay ?? day) >= 1) delete S.sites[s.id];
    if (this.has('r_dig_maps')) {
      const away = this.list.filter((s) => s.away);
      if (away.length < MAP_SITE_MAX && S.mapDay !== day) {
        const made = this.spawnMapSite();
        if (made) { S.mapDay = day; this.sys.announceSite(made); }
      }
    }
  }
  roll(s) {
    const A = s.anchor ? SITE_ANCHORS.find((a) => a.id === s.anchor) : { tier: 0, bias: { bone: 1.2 } };
    return rollFind(A, (id) => this.has(id));
  }
  /** a new site near the next anchor whose area is open; returns the site or null */
  spawnMapSite(force = null) {
    const S = this.S, game = this.game, g = game.grid;
    const day = game.state.day || 1;
    const used = new Set(this.list.map((s) => s.anchor).filter(Boolean));
    const cands = SITE_ANCHORS.filter((a) => (force ? a.id === force : !used.has(a.id)) && (!a.zone || game.zones?.isOpen?.(a.zone)));
    if (!cands.length) return null;
    // rotate through the anchors so the valley gets explored
    S.mapN = (S.mapN || 0) + 1;
    const A = force ? cands[0] : cands[(S.mapN * 7 + day) % cands.length];
    const spot = this.findTile(A.x, A.z, 9);
    if (!spot) return null;
    const id = 'm_' + A.id + '_' + day;
    const s = S.sites[id] = { id, x: spot.x, z: spot.z, find: null, dugDay: null, made: day, anchor: A.id, away: true, name: A.name };
    s.find = this.roll(s);
    return s;
  }
  /** a visible tile near (x, z): land, no tree on it, no building, out of the fog */
  findTile(cx, cz, R) {
    const g = this.game.grid, zones = this.game.zones;
    let best = null, bd = 1e9;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const x = Math.floor(cx) + dx, z = Math.floor(cz) + dz;
      if (!g.inb(x, z)) continue;
      const i = z * g.w + x;
      const k = g.kind[i];
      if (k === KIND.WATER || k === KIND.SNOW || g.occ[i] !== -1 || g.deco[i] >= 0) continue;
      if (k === KIND.FOREST && g.glade && g.glade[i] !== 2) continue; // only glades: no trees in the way
      if (zones?.fogAt?.(x + 0.5, z + 0.5) > 0.15) continue;
      if (this.list.some((s) => Math.hypot(s.x - x - 0.5, s.z - z - 0.5) < 3)) continue;
      // no steep step under it
      const h = g.height[i];
      let flat = true;
      for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (g.inb(x + ax, z + az) && Math.abs(g.height[i + az * g.w + ax] - h) > 0.6) flat = false;
      if (!flat) continue;
      const d = dx * dx + dz * dz + Math.random() * 3;
      if (d < bd) { bd = d; best = { x: x + 0.5, z: z + 0.5 }; }
    }
    return best;
  }
  /** a find was dug out of site s */
  dug(s) {
    s.find = null;
    s.dugDay = this.game.state.day || 1;
    this.sync(true);
  }

  // ------------------------------------------------------------------ meshes
  sync(force = false) {
    const live = new Set();
    for (const s of this.list) {
      if (!s.away && !this.sys.zoneOpen()) continue;
      live.add(s.id);
      const kind = s.find ? 'fresh' : 'dug';
      const group = s.find ? (FIND_BY_ID[s.find]?.group || 'bone') : null;
      let m = this.meshes.get(s.id);
      if (m && (m.kind !== kind || m.group !== group || force)) { if (m.kind !== kind || m.group !== group) { this.group.remove(m.obj); m = null; } }
      if (!m) {
        const obj = makeSiteMound(kind, group || 'bone');
        obj.position.set(s.x, this.game.grid.groundAt(s.x, s.z), s.z);
        obj.rotation.y = ((s.x * 13.7 + s.z * 7.1) % 6.28);
        obj.scale.setScalar(1.15);
        this.group.add(obj);
        m = { obj, kind, group, s };
        this.meshes.set(s.id, m);
      }
      m.s = s;
    }
    for (const [id, m] of this.meshes) if (!live.has(id)) { this.group.remove(m.obj); this.meshes.delete(id); }
  }
  update(dt) {
    this.t += dt;
    const game = this.game, r = game.rig?.target;
    if (!r) return;
    const show = !game.overrideScene && !game.titleMode;
    for (const m of this.meshes.values()) {
      const near = Math.abs(m.s.x - r.x) < 34 && Math.abs(m.s.z - r.z) < 34;
      m.obj.visible = show && near;
      if (!m.obj.visible) continue;
      const f = m.obj.userData.flag;
      if (f) { f.rotation.y = Math.sin(this.t * 3.1 + m.s.x) * 0.35; f.rotation.z = Math.sin(this.t * 5.3 + m.s.z) * 0.08; }
    }
    // a twinkle on fresh sites near the camera now and then (something shiny in the dirt)
    this.twT = (this.twT ?? 1) - dt;
    if (this.twT <= 0) {
      this.twT = 1.4;
      for (const m of this.meshes.values()) {
        if (m.kind !== 'fresh' || !m.obj.visible || Math.random() > 0.5) continue;
        const y = game.grid.groundAt(m.s.x, m.s.z);
        game.particles?.sparkle?.(m.s.x + 0.05, y + 0.25, m.s.z, 2, m.group === 'amber' ? 0xffc040 : 0xfff2c0);
      }
    }
  }
  /** screen tap -> the nearest site (or null) */
  pick(sx, sy) {
    const game = this.game;
    if (!game.rig || !game.renderer) return null;
    const wupp = game.rig.wupp || 0.045;
    const R = Math.max(22, Math.min(80, 0.55 / wupp * (game.renderer.pixelScale || 2) / (game.renderer.dpr || 1)));
    let best = null, bd = R * R;
    for (const m of this.meshes.values()) {
      if (!m.obj.visible) continue;
      const y = game.grid.groundAt(m.s.x, m.s.z) + 0.25;
      const q = game.rig.worldToScreen(_v.set(m.s.x, y, m.s.z), game.renderer);
      if (q.visible === false) continue;
      const d = (q.x - sx) ** 2 + (q.y - sy) ** 2;
      if (d < bd) { bd = d; best = m.s; }
    }
    return best;
  }
  dispose() { this.group.removeFromParent(); this.meshes.clear(); }
}
