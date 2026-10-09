// [v26 power] Physical storage: ore, ingots and parts live in storage buildings
// (Ore Shed, Warehouse, Parts Rack, Coal Bunker, Supply Pile, the Bear Mine's ore bin).
// No HUD strip: tap a storage building to look inside (src/ui/StorageUI.js). The models
// show the stock (heaps, crates, racks fill up). game.res (src/game/Resources.js) keeps
// its API and runs on top of this.
//
//   game.storage.open(s)                    the slot panel for storage s
//   game.storage.list                        built storages (+ sites)        isDepot(s)
//   game.storage.contents(s) / used(s) / cap(s) / room(s, id) / stock(s, id) / accepts(s, id)
//   game.storage.put(s, id, n, x?, z?)      -> stored (<= room)
//   game.storage.takeFrom(s, id, n)          -> taken (<= stock)
//   game.storage.total(id)                   all of it, everywhere
//   game.storage.nearestWithRoom(id, x, z, { n, piles }) / nearestWithStock(id, x, z, { n })
//   game.storage.canStore(id, n, x?, z?)     room for n somewhere (piles don't count): production checks this
//   game.storage.add(id, n, x?, z?)          into the nearest storages with room; the rest onto a Supply Pile
//   game.storage.take(id, n, x?, z?)         all or nothing, nearest stock first -> bool
//   game.storage.takeAll(bill, x?, z?)       all or nothing (build costs: "-2 Gear" pops at the storages)
//   game.storage.door(s)                     { x, z } where beavers drop off / pick up
//   game.storage.addSite(key, site)          a storage that isn't a build (the mine's ore bin)
//   game.storage.makeProp(id)                a small 3D prop of a resource (beavers carry them)
// Every change emits game 'res' { id, n (signed), total, x?, z?, first?, s }.
// State: game.state.storage = { v, s: { 'type@x,z': { id: n } }, capx: { key: extra cap }, migrated }
import * as THREE from 'three';
import { RES_INFO } from '../Resources.js';
import { HUT } from '../../world/worldgen.js';
import { makeBeltItem } from '../../entities/extra/industryModels.js';
import { Badges } from '../industry/badges.js';
import { StorageUI } from '../../ui/StorageUI.js';

const PILE = 'st_pile';
const PILE_CAP = 60;

export function install(game) {
  return new Storage(game);
}

class Storage {
  constructor(game) {
    this.game = game;
    this.ready = false;
    this.list = [];
    this.sites = new Map();
    this.ui = null;
    this.badges = new Badges(game);
    this.models = new Map(); // key -> { obj, sig }
    this.listT = 0;
    this.checkT = 1;
    // tap a storage building: the slot panel
    const ts = game.tapStructure.bind(game);
    game.tapStructure = (s) => (this.tap(s) ? true : ts(s));
    game.on('structureMoved', ({ s, from }) => this.onMoved(s, from));
    game.on('built', (s) => { if (s?.def?.depot) { this.refreshList(); this.dirty(s); } });
  }

  // ------------------------------------------------------------ state
  get S() {
    const st = this.game.state;
    if (!st.storage || typeof st.storage !== 'object') st.storage = {};
    const S = st.storage;
    S.s ||= {}; S.capx ||= {};
    return S;
  }
  isDepot(s) { return !!s?.def?.depot && (s.site || (s.built && !s.removed)); }
  keyOf(s) { return s.site ? s.key : `${s.type}@${s.x},${s.z}`; }
  contents(s) { const S = this.S; const k = this.keyOf(s); return S.s[k] || (S.s[k] = {}); }
  used(s) { let n = 0; for (const v of Object.values(this.contents(s))) n += v; return n; }
  cap(s) { return (s.def.depot.cap || 0) + (this.S.capx[this.keyOf(s)] || 0); }
  isPile(s) { return !!s?.def?.depot?.pile; }
  accepts(s, id) {
    const info = RES_INFO[id];
    if (!info) return false;
    const acc = s.def.depot.accepts || ['*'];
    return acc.includes('*') || acc.includes(id) || acc.includes(info.kind);
  }
  room(s, id) { return id && !this.accepts(s, id) ? 0 : Math.max(0, this.cap(s) - this.used(s)); }
  stock(s, id) { return Math.max(0, Math.floor(this.contents(s)[id] || 0)); }
  full(s) { return this.used(s) >= this.cap(s); }
  center(s) {
    if (s.site) return { x: s.x, z: s.z };
    const [w, d] = s.def.size || [1, 1];
    return { x: s.x + w / 2, z: s.z + d / 2 };
  }
  // where beavers drop off / pick up (in front of the door, +z)
  door(s) {
    if (s.site) return s.door || { x: s.x, z: s.z + 0.8 };
    const [w, d] = s.def.size || [1, 1];
    return { x: s.x + w / 2, z: s.z + d + 0.3 };
  }
  baseY(s) { return s.site ? this.game.grid.groundAt(s.x, s.z) : this.game.structures.baseY(s); }
  topY(s) { if (s.site) return this.baseY(s) + (s.badgeY || 1.4); const [w] = s.def.size || [1, 1]; return this.baseY(s) + (s.def.depot.badgeY || (w > 1 ? 2.05 : 1.45)); }

  refreshList() {
    const out = [];
    for (const s of this.game.structures.list) if (s.def.depot && s.built && !s.removed) out.push(s);
    for (const s of this.sites.values()) out.push(s);
    this.list = out;
    return out;
  }
  addSite(key, site) {
    const s = { site: true, key, type: key, built: true, removed: false, ...site };
    s.def = { name: site.name, icon: site.icon, depot: { cap: site.cap || 60, accepts: site.accepts || ['*'] } };
    this.sites.set(key, s);
    this.refreshList();
    return s;
  }
  site(key) { return this.sites.get(key) || null; }
  byKey(k) { return this.list.find((s) => this.keyOf(s) === k) || null; }

  // ------------------------------------------------------------ moving stuff
  put(s, id, n, x, z) {
    n = Math.floor(n);
    if (!(n > 0) || !this.isDepot(s)) return 0;
    const k = Math.min(n, this.room(s, id));
    if (k <= 0) return 0;
    const c = this.contents(s);
    c[id] = (c[id] || 0) + k;
    const first = this.game.res?.markSeen?.(id) || false;
    this.dirty(s);
    this.game.emit('res', { id, n: k, total: this.total(id), x, z, first, s });
    return k;
  }
  takeFrom(s, id, n) {
    n = Math.floor(n);
    if (!(n > 0) || !this.isDepot(s)) return 0;
    const c = this.contents(s);
    const k = Math.min(n, Math.floor(c[id] || 0));
    if (k <= 0) return 0;
    c[id] -= k;
    if (c[id] <= 0) delete c[id];
    this.dirty(s);
    this.game.emit('res', { id, n: -k, total: this.total(id), s });
    return k;
  }
  total(id) { let n = 0; for (const s of this.list) n += this.stock(s, id); return n; }
  totalRoom(id, { piles = false } = {}) { let n = 0; for (const s of this.list) if (piles || !this.isPile(s)) n += this.room(s, id); return n; }
  dist(s, x, z) { const d = this.door(s); return x == null ? 0 : Math.hypot(d.x - x, d.z - z); }

  nearestWithRoom(id, x, z, { n = 1, piles = false, except = null } = {}) {
    let best = null, bd = Infinity;
    for (const s of this.list) {
      if (s === except || (!piles && this.isPile(s))) continue;
      if (this.room(s, id) < n) continue;
      const d = this.dist(s, x, z) + (this.isPile(s) ? 40 : 0) + (s.site ? 25 : 0);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  // nearest storage holding id (Supply Piles get emptied first)
  nearestWithStock(id, x, z, { n = 1, except = null } = {}) {
    let best = null, bd = Infinity;
    for (const s of this.list) {
      if (s === except || this.stock(s, id) < n) continue;
      const d = this.dist(s, x, z) - (this.isPile(s) ? 12 : 0);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  canStore(id, n = 1) { return this.totalRoom(id) >= n; }

  // generic add: nearest storages with room, overflow onto a Supply Pile (gifts, refunds, belts)
  add(id, n, x, z) {
    n = Math.floor(n);
    if (!(n > 0) || !RES_INFO[id]) return 0;
    let left = n;
    for (let guard = 0; left > 0 && guard < 24; guard++) {
      const s = this.nearestWithRoom(id, x, z, { piles: true });
      if (!s) break;
      left -= this.put(s, id, left, x, z);
    }
    if (left > 0) {
      const p = this.newPile(x, z, left);
      if (p) left -= this.put(p, id, left, x, z);
    }
    return n - left;
  }
  take(id, n = 1, x, z) {
    n = Math.floor(n);
    if (n <= 0) return n === 0;
    if (this.total(id) < n) return false;
    let left = n;
    const cx = x ?? this.game.rig?.target?.x, cz = z ?? this.game.rig?.target?.z;
    for (let guard = 0; left > 0 && guard < 24; guard++) {
      const s = this.nearestWithStock(id, cx, cz);
      if (!s) break;
      left -= this.takeFrom(s, id, left);
    }
    return left <= 0;
  }
  hasAll(bill) { return Object.entries(bill || {}).every(([id, n]) => this.total(id) >= n); }
  takeAll(bill, x, z, { fx = true } = {}) {
    if (!this.hasAll(bill)) return false;
    const game = this.game;
    for (const [id, n] of Object.entries(bill || {})) {
      let left = n;
      for (let guard = 0; left > 0 && guard < 24; guard++) {
        const s = this.nearestWithStock(id, x ?? game.rig?.target?.x, z ?? game.rig?.target?.z);
        if (!s) break;
        const k = this.takeFrom(s, id, left);
        left -= k;
        if (fx && k > 0) {
          const c = this.center(s), y = this.topY(s);
          game.ui?.floatTextAt?.(c.x, y, c.z, `-${k} ${RES_INFO[id]?.name || id}`, '#ffd8a0');
          game.particles.puff(c.x, this.baseY(s) + 0.3, c.z, 4, 0.25);
        }
      }
    }
    return true;
  }

  // a Supply Pile with room near x, z (made when needed, near Reynard's hut if there's no spot given)
  newPile(x, z, need = PILE_CAP) {
    for (const s of this.list) if (this.isPile(s) && this.room(s) >= Math.min(need, 10) && (x == null || this.dist(s, x, z) < 14)) return s;
    const game = this.game;
    const spot = (x != null && this.freeSpot(Math.floor(x), Math.floor(z), 6)) || this.freeSpot(HUT.x + 1, HUT.z + 1, 10, true);
    if (!spot) return null;
    const s = game.structures.place(PILE, spot[0], spot[1], { instant: true, free: true });
    if (!s) return null;
    s.paid = 0;
    if (need > PILE_CAP) this.S.capx[this.keyOf(s)] = need - PILE_CAP;
    try { game.placeFx?.(s, true); } catch { /* fx only */ }
    s.pileBorn = performance.now();
    this.refreshList();
    if (this.ready && !this.S.pileTip) {
      this.S.pileTip = 1;
      game.ui?.foxSay?.('Who left all these crates by my door? Build a Warehouse, and the beavers will clear the Supply Pile first.', 'worried');
    }
    return s;
  }
  freeSpot(cx, cz, R, nearHut = false) {
    const st = this.game.structures;
    for (let r = 0; r <= R; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = cx + dx, z = cz + dz;
          // keep the hut's door, the delivery drop and the van's spot clear
          if (nearHut && x >= HUT.x - 1 && x <= HUT.x + 5 && z >= HUT.z + 2 && z <= HUT.z + 7) continue;
          if (st.canPlace(PILE, x, z).ok) return [x, z];
        }
    return null;
  }

  // ------------------------------------------------------------ taps + UI
  tap(s) {
    if (!s?.def?.depot || !s.built) return false;
    if (this.game.tool?.kind && this.game.tool.kind !== 'feed') return false;
    this.open(s);
    return true;
  }
  ensureUI() {
    if (!this.ui && this.game.ui?.root) { try { this.ui = new StorageUI(this); } catch (e) { console.warn('storage ui', e); } }
    return this.ui;
  }
  open(s) {
    if (!s) return false;
    const ui = this.ensureUI();
    if (!ui) return false;
    ui.open(s);
    this.game.audio?.play('crate_drop', { volume: 0.25, pitch: 1.3 });
    this.game.emit('storageOpen', s);
    return true;
  }
  close() { this.ui?.close(); }
  summary() { return this.list.map((s) => ({ s, name: s.def.name, used: this.used(s), cap: this.cap(s) })); }

  makeProp(id) {
    const m = makeBeltItem(id);
    m.scale.setScalar(1.5);
    const g = new THREE.Group();
    g.add(m);
    return g;
  }

  // ------------------------------------------------------------ keeping things straight
  onMoved(s, from) {
    if (!s?.def?.depot) return;
    const S = this.S;
    const ok = `${s.type}@${from[0]},${from[1]}`, nk = this.keyOf(s);
    if (ok !== nk && S.s[ok]) { S.s[nk] = S.s[ok]; delete S.s[ok]; }
    if (ok !== nk && S.capx[ok]) { S.capx[nk] = S.capx[ok]; delete S.capx[ok]; }
    this.models.delete(ok);
    this.refreshList();
    this.dirty(s);
  }
  // a storage got demolished / sold / stored: its contents move to the others (or a pile on the spot)
  cleanup() {
    const S = this.S;
    const live = new Set(this.list.map((s) => this.keyOf(s)));
    for (const s of this.game.structures.list) if (s.def.depot && !s.removed) live.add(this.keyOf(s)); // still being built
    for (const k of Object.keys(S.s)) {
      if (live.has(k)) continue;
      const bag = S.s[k];
      delete S.s[k]; delete S.capx[k];
      this.models.delete(k);
      const m = /@(-?\d+),(-?\d+)$/.exec(k);
      const x = m ? +m[1] + 0.5 : undefined, z = m ? +m[2] + 0.5 : undefined;
      let moved = 0;
      for (const [id, n] of Object.entries(bag || {})) if (n > 0) moved += this.add(id, n, x, z);
      if (moved) this.game.notify?.(`${moved} things from the old storage got carried to the nearest shelves.`, 'info');
    }
    // empty Supply Piles get tidied away
    for (const s of this.list) {
      if (!this.isPile(s) || s.site || this.used(s) > 0) continue;
      if (s.pileBorn && performance.now() - s.pileBorn < 8000) continue;
      const c = this.center(s), y = this.baseY(s);
      this.game.structures.remove(s, { silent: true });
      delete S.s[this.keyOf(s)]; delete S.capx[this.keyOf(s)];
      this.game.particles.puff(c.x, y + 0.2, c.z, 10, 0.35);
      this.game.ui?.floatTextAt?.(c.x, y + 1, c.z, 'All tidied up!', '#c8f0ff');
    }
    this.refreshList();
  }

  // pre-v26 saves: the old flat stockpile (state.res) moves into the storage buildings
  migrate() {
    const S = this.S, st = this.game.state;
    if (S.migrated) return;
    S.migrated = 1;
    S.v = 1;
    const old = st.res && typeof st.res === 'object' ? st.res : {};
    const ids = Object.keys(old).filter((id) => RES_INFO[id] && Math.floor(old[id] || 0) > 0);
    // old saves that already had the Machine Shop keep making circuits: the Circuit Fab node comes free
    const R = st.research || [];
    if (R.includes('r_mine_pick') && !R.includes('r_st_storage')) R.push('r_st_storage');
    if (R.includes('r_ind_shop') && !R.includes('r_pw_circuit')) R.push('r_pw_circuit');
    if (!ids.length) { st.res = {}; return; }
    let total = 0;
    for (const id of ids) total += Math.floor(old[id]);
    const shed = this.list.find((s) => !s.site && !this.isPile(s));
    const at = shed ? this.door(shed) : { x: HUT.x + 1.5, z: HUT.z + 1.5 };
    // into the existing storages first
    let left = 0;
    const rest = {};
    for (const id of ids) {
      let n = Math.floor(old[id]);
      for (let guard = 0; n > 0 && guard < 12; guard++) {
        const s = this.nearestWithRoom(id, at.x, at.z);
        if (!s) break;
        n -= this.put(s, id, n);
      }
      if (n > 0) { rest[id] = n; left += n; }
    }
    if (left > 0) {
      const p = this.newPile(undefined, undefined, Math.max(PILE_CAP, left));
      if (p) {
        const need = left - this.room(p);
        if (need > 0) this.S.capx[this.keyOf(p)] = (this.S.capx[this.keyOf(p)] || 0) + need;
        for (const [id, n] of Object.entries(rest)) this.put(p, id, n);
      }
    }
    st.res = {};
    this.game.notify?.(`Your ${total} ore and parts are in storage now${left ? ' (some on a Supply Pile by the hut)' : ''}. Tap a storage building to look inside.`, 'info', { dur: 6 });
  }

  // ------------------------------------------------------------ hooks
  onNewGame() { this.ready = false; }
  onLoad() {
    this.sites.clear();
    this.models.clear();
    this.badges.clear();
    this.refreshList();
    this.ready = true;
    this.migrate();
    this.game.mining?.registerBin?.();
    this.refreshList();
    for (const s of this.list) this.dirty(s);
  }

  dirty(s) { const m = this.models.get(this.keyOf(s)); if (m) m.sig = null; }

  update(simDt, dt) {
    const game = this.game;
    if (!this.ready || !game.started) return;
    this.listT -= dt;
    if (this.listT <= 0) { this.listT = 0.5; this.refreshList(); }
    this.checkT -= dt;
    if (this.checkT <= 0) { this.checkT = 1; this.cleanup(); }
    // models show the stock; full storages wear a badge
    for (const s of this.list) {
      const k = this.keyOf(s);
      if (!s.site) {
        const obj = s.extraModel;
        let m = this.models.get(k);
        if (!m || m.obj !== obj) { m = { obj, sig: null }; this.models.set(k, m); }
        const used = this.used(s), cap = this.cap(s);
        const sig = `${used}|${cap}|${Object.keys(this.contents(s)).join(',')}`;
        if (obj && sig !== m.sig) {
          m.sig = sig;
          const u = obj.userData;
          try { if (u?.setContents) u.setContents(this.contents(s), cap); else u?.setStock?.(used, cap); } catch (e) { console.warn('storage model', e); }
        }
      } else s.onChange?.(this.used(s) / Math.max(1, this.cap(s)), this.contents(s));
      if (this.full(s) && !(s.site && !s.visible?.())) {
        const c = this.center(s);
        this.badges.set('full:' + k, 'st_full', c.x, this.topY(s), c.z);
      }
    }
    this.badges.frame(dt);
    this.ui?.update(dt);
  }
}
