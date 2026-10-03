// Forest finds. The woods are scattered (deterministically, per tile) with
// things to pick up: fallen logs (wood), morels, fiddleheads, wild ramps,
// bramble berries, pinecones and old stumps weeping resin. In mossy little
// clearings stand the ruins of old homesteads (worldgen.js placeRuins), each
// with a piece of broken furniture that Chip the woodpecker can restore.
//
// Tap a find the fox can reach (on or near your land, or across a glade
// connected to it) and Reynard trots over and grabs it: pop, sparkle,
// "+2 Fiddleheads". Food and forage go to the food store, wood to
// state.wood, ruins to state.inventory. Wild plants grow back after a day;
// logs and ruins are one-off. Reachable finds twinkle now and then.
//
// State lives in game.state.forage = { p: { tileIndex: hourPicked } } (so it
// saves with the rest of the state; serialize() / load() are there too).
//
//   new Forage(game)
//   update(dt)                 rebuild sprites, regrowth, the fox's errand, glints
//   tapAt(sx, sy) -> boolean   screen tap: true when it hit a find (picked or not)
//   pick(x, z, { force }) -> { id, n } | null   collect the find on tile (x, z) now
//   spots / spotAt(x, z) / canReach(spot)
//   serialize() -> data        load(data)
// Emits game.emit('forage', { id, n, kind, x, z }).
import * as THREE from 'three';
import { SpriteBatch } from '../core/spriteBatch.js';
import { KIND, FloatHeap } from '../world/grid.js';
import { GLADE } from '../world/worldgen.js';
import { hash2 } from '../core/rng.js';
import { FOOD_ITEMS } from '../data/foods.js';

// what each kind of find gives. regrow: game hours (0 = one-off)
export const FORAGE_KINDS = {
  log: { give: 'wood', n: [2, 3], sprites: ['forage_log_0', 'forage_log_1'], regrow: 0, color: '#e8c08a', sfx: 'crate_drop' },
  morel: { give: 'morel', n: [1, 3], sprites: ['forage_morel'], regrow: 24, color: '#f4d8a0', sfx: 'harvest_pop' },
  fiddlehead: { give: 'fiddlehead', n: [2, 3], sprites: ['forage_fiddlehead'], regrow: 24, color: '#c8ff9a', sfx: 'harvest_pop' },
  ramps: { give: 'ramps', n: [2, 3], sprites: ['forage_ramps'], regrow: 24, color: '#c8ff9a', sfx: 'harvest_pop' },
  wildberry: { give: 'wildberry', n: [3, 4], sprites: ['forage_wildberry'], picked: 'forage_wildberry_picked', regrow: 24, color: '#ffb0c8', sfx: 'harvest_pop' },
  pinecone: { give: 'pinecone', n: [2, 3], sprites: ['forage_pinecone'], regrow: 24, color: '#e8c08a', sfx: 'grab' },
  resin: { give: 'resin', n: [1, 2], sprites: ['forage_resin'], picked: 'forage_stump', regrow: 24, color: '#ffd060', sfx: 'harvest_pop' },
  ruin: { n: [1, 1], regrow: 0, color: '#fff3a0', sfx: 'reveal_rare' },
};
export const RUIN_NAMES = {
  ruin_chair: 'Broken Armchair', ruin_table: 'Rotten Table', ruin_clock: 'Old Grandfather Clock', ruin_lamp: 'Rusty Lantern', ruin_cart: 'Old Hand Cart',
};
const REACH = 5; // path cost into the woods the fox will walk (glade 1, open 1.5, grove 2.5)
const FOG = 0.45;
const _v = new THREE.Vector3();

export class Forage {
  constructor(game) {
    this.game = game;
    this.time = 0;
    this.spots = [];
    this.byTile = new Map();
    this.decor = []; // ruin foundations, columns, walls (always shown)
    this.pops = []; // little "picked!" animations
    this.pending = null; // the fox's errand
    this.dirty = true;
    this.regrowT = 0;
    this._st = null;
    this._reachKey = '';
    this.reach = null;
    const nat = game.world.natureFrames();
    this.frames = nat.frames;
    this.batch = new SpriteBatch(nat.tex, { max: 1600, lit: true, castShadow: true, receiveShadow: true, renderOrder: 2, name: 'forage' });
    this.fx = new SpriteBatch(nat.tex, { max: 32, lit: true, castShadow: false, receiveShadow: false, renderOrder: 14, name: 'forageFx' });
    // twinkles shine through the trees, so a find behind a pine still calls you
    this.glints = new SpriteBatch(nat.tex, { max: 80, lit: false, castShadow: false, receiveShadow: false, renderOrder: 30, name: 'forageGlints' });
    this.glints.mesh.material.depthTest = false;
    this.glints.mesh.material.depthWrite = false;
    game.scene.add(this.batch.mesh, this.fx.mesh, this.glints.mesh);
    this.buildSpots();
  }

  // ------------------------------------------------------------ layout
  buildSpots() {
    const g = this.game.grid;
    const { w } = g;
    const add = (s) => { s.idx = this.spots.length; this.spots.push(s); this.byTile.set(s.i, s); };
    // where the finds are is decided by worldgen (placeForage), so the trees
    // can leave them a sightline; here they get their look and amount
    for (const f of g.forage || []) {
      const K = FORAGE_KINDS[f.kind];
      if (!K) continue;
      const { x, z } = f;
      add({ i: f.i, x, z, kind: f.kind, give: K.give, sprite: K.sprites[Math.floor(f.h * K.sprites.length) % K.sprites.length], px: x + 0.5 + (hash2(x, z, 5107) - 0.5) * 0.36, pz: z + 0.5 + (hash2(x, z, 5109) - 0.5) * 0.3, flip: hash2(x, z, 5111) < 0.5 && f.kind !== 'resin', n: K.n[0] + Math.floor(hash2(x, z, 5113) * (K.n[1] - K.n[0] + 1)) });
    }
    // ruins: a foundation, a broken column and a wall stub round each piece
    for (const r of g.ruins || []) {
      const i = r.z * w + r.x;
      const y = g.height[i];
      this.decor.push({ name: 'ruin_floor', x: r.x + 0.5, y: y + 0.03, z: r.z + 0.45, flat: true });
      this.decor.push({ name: 'ruin_pillar', x: r.x - 0.35, y, z: r.z - 0.45 });
      this.decor.push({ name: 'ruin_wall', x: r.x + 1.05, y, z: r.z - 0.3, flip: hash2(r.x, r.z, 5121) < 0.5 });
      add({ i, x: r.x, z: r.z, kind: 'ruin', give: r.type, sprite: r.type, px: r.x + 0.45, pz: r.z + 0.6, flip: false, n: 1 });
    }
  }

  spotAt(x, z) { return this.byTile.get(Math.floor(z) * this.game.grid.w + Math.floor(x)) || null; }

  // ------------------------------------------------------------ state
  get S() {
    const st = this.game.state;
    if (!st.forage || typeof st.forage !== 'object') st.forage = { p: {} };
    st.forage.p ||= {};
    return st.forage;
  }
  now() { const st = this.game.state; return (st.day || 1) * 24 + (st.hour || 0); }

  available(s) {
    const t = this.S.p[s.i];
    if (t == null) return true;
    const K = FORAGE_KINDS[s.kind];
    return K.regrow > 0 && this.now() >= t + K.regrow;
  }

  // a find the land has been built over or dug into a pond is gone for good
  blocked(s) {
    const g = this.game.grid;
    return g.kind[s.i] === KIND.WATER || g.occ[s.i] >= 0;
  }

  // ------------------------------------------------------------ reach
  // Dijkstra from your land (meadow + owned plots) into the woods
  reachMap() {
    const game = this.game, g = game.grid;
    const key = `${game.world.landVersion}|${game.land?.owned?.size || 0}`;
    if (this.reach && key === this._reachKey) return this.reach;
    this._reachKey = key;
    const n = g.w * g.h;
    const d = this.reach || new Float32Array(n);
    d.fill(Infinity);
    const heap = this._heap || (this._heap = new FloatHeap(4096));
    heap.clear();
    for (let i = 0; i < n; i++) if (g.meadow[i] || game.land?.ownsTile?.(i)) { d[i] = 0; heap.push(i, 0); }
    const gl = g.glade;
    const cost = (i) => {
      const k = g.kind[i];
      if (k === KIND.WATER) return Infinity;
      if (k === KIND.FOREST) { const v = gl ? gl[i] : 0; return v === GLADE.GLADE ? 1 : v === GLADE.OPEN ? 1.5 : 2.5; }
      if (k === KIND.ROCK || k === KIND.SNOW) return 3;
      return 1;
    };
    while (heap.size) {
      const cd = heap.topValue();
      const c = heap.pop();
      if (cd > d[c] || cd >= REACH) continue;
      const cx = c % g.w, cz = (c - cx) / g.w;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= g.w || nz >= g.h) continue;
        const ni = nz * g.w + nx;
        const nd = cd + cost(ni);
        if (nd < d[ni] && nd <= REACH) { d[ni] = nd; heap.push(ni, nd); }
      }
    }
    this.reach = d;
    return d;
  }

  fogged(s) { return (this.game.zones?.fogAt(s.x, s.z) || 0) > FOG; }
  canReach(s) { return !this.fogged(s) && this.reachMap()[s.i] <= REACH; }

  // ------------------------------------------------------------ picking
  // screen tap: the find under the finger (if any). Reachable ones send the
  // fox; out-of-reach ones get a hint. Finds under the fog don't count.
  tapAt(sx, sy) {
    const game = this.game;
    if (!game.rig || !game.renderer) return false;
    let best = null, bd = Infinity;
    const tx = game.rig.target.x, tz = game.rig.target.z;
    const wupp = game.rig.wupp || 0.045;
    for (const s of this.spots) {
      if (Math.abs(s.px - tx) > 40 || Math.abs(s.pz - tz) > 40) continue;
      if (!this.available(s) || this.blocked(s) || this.fogged(s)) continue;
      const f = this.frames[s.sprite]?.[0];
      const hgt = f ? f.h / 24 : 0.6;
      _v.set(s.px, this.game.grid.height[s.i] + hgt * 0.45, s.pz);
      const q = game.rig.worldToScreen(_v, game.renderer);
      if (q.visible === false) continue;
      // hit radius grows with the sprite and the zoom (and is never tiny)
      const r = Math.max(16, Math.min(60, ((f ? Math.max(f.w, f.h) : 20) / 24) * 0.55 / wupp * (game.renderer.pixelScale || 2) / (game.renderer.dpr || 1)));
      const dd = (q.x - sx) ** 2 + (q.y - sy) ** 2;
      if (dd < r * r && dd < bd) { bd = dd; best = s; }
    }
    if (!best) return false;
    if (this.pending?.spot === best) return true;
    if (!this.canReach(best)) {
      game.notify(best.kind === 'ruin' ? 'Old ruins! Too deep in the woods: clear a path closer first.' : 'Too deep in the woods! Clear a bit closer first.', 'no');
      game.audio?.play('error', { volume: 0.3 });
      this.pops.push({ spot: best, t: 0, shake: true });
      return true;
    }
    this.go(best);
    return true;
  }

  // the fox trots over (if he's free and it's not miles away), else it's instant
  go(s) {
    const game = this.game, fox = game.fox;
    if (this.pending) this.finish(this.pending.spot);
    const far = fox ? Math.hypot(fox.x - s.px, fox.z - s.pz) : 99;
    if (!fox || fox.bed || fox.errands?.length || game.inputLocked || far > 34 || game.state.phase === 'night') { this.collect(s); return; }
    const side = fox.x < s.px ? -1 : 1;
    fox.target = { x: s.px + side * 0.55, z: s.pz + 0.25 };
    fox.mood = 'idle';
    this.pending = { spot: s, t: 0, max: 1.5 + far / 3.6 };
    game.audio?.play('click', { volume: 0.3, pitch: 1.3 });
  }

  finish(s) {
    this.pending = null;
    if (this.available(s) && !this.blocked(s)) this.collect(s);
  }

  // collect the find on tile (x, z) right now (no walking). force: skip reach
  pick(x, z, { force = false } = {}) {
    const g = this.game.grid;
    let s = this.spotAt(x, z);
    if (!s) {
      let bd = 0.8;
      for (const c of this.spots) { const d = Math.hypot(c.px - x, c.pz - z); if (d < bd) { bd = d; s = c; } }
    }
    if (!s || !g.inb(s.x, s.z) || !this.available(s) || this.blocked(s)) return null;
    if (!force && !this.canReach(s)) return null;
    return this.collect(s);
  }

  collect(s) {
    const game = this.game, st = game.state;
    const K = FORAGE_KINDS[s.kind];
    const y = game.grid.height[s.i];
    const id = s.give, n = s.n;
    this.S.p[s.i] = K.regrow > 0 ? this.now() : -1;
    let label;
    if (s.kind === 'ruin') {
      const inv = (st.inventory ||= {});
      inv[id] = (inv[id] || 0) + 1;
      game.emit('inventory', inv);
      label = RUIN_NAMES[id] || 'Old furniture';
      game.particles?.word?.('wow', s.px, y + 1.6, s.pz, { size: 0.32, life: 1.1 });
      game.particles?.stars?.(s.px, y + 0.8, s.pz, 8);
      game.notify(`An old ${label}! Chip could fix it up.`, 'excited');
    } else if (id === 'wood') {
      if (game.workshop?.addWood) game.workshop.addWood(n);
      else { st.wood = (st.wood || 0) + n; game.emit('wood', st.wood); }
      label = 'Wood';
    } else {
      game.foodStore?.add(id, n);
      label = FOOD_ITEMS[id]?.name || id;
    }
    game.particles?.puff?.(s.px, y + 0.15, s.pz, 6, 0.3);
    game.particles?.sparkle?.(s.px, y + 0.5, s.pz, 7);
    game.ui?.floatTextAt?.(s.px, y + 1.1, s.pz, s.kind === 'ruin' ? label : `+${n} ${label}`, K.color);
    game.audio?.play(K.sfx, { volume: 0.45, pitch: 0.95 + Math.random() * 0.15 });
    if (game.fox && Math.hypot(game.fox.x - s.px, game.fox.z - s.pz) < 2) {
      game.fox.heading = Math.atan2(s.pz - game.fox.z, s.px - game.fox.x);
      game.fox.react?.('cheer', 0.9);
    }
    this.pops.push({ spot: s, t: 0 });
    this.dirty = true;
    game.emit('forage', { id, n, kind: s.kind, x: s.x, z: s.z });
    return { id, n };
  }

  // ------------------------------------------------------------ save / load
  serialize() { return { p: { ...this.S.p } }; }
  load(data) {
    if (data && typeof data === 'object') this.game.state.forage = { p: { ...(data.p || {}) } };
    this.pending = null;
    this.pops.length = 0;
    this.dirty = true;
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    const game = this.game;
    dt = dt > 0 ? Math.min(dt, 0.1) : 0; // the loop can hand us a negative first frame
    this.time += dt;
    if (this._st !== game.state) { this._st = game.state; this.pending = null; this.dirty = true; } // new game / load
    // wild plants grow back
    this.regrowT -= dt;
    if (this.regrowT <= 0) {
      this.regrowT = 2;
      const p = this.S.p, now = this.now();
      for (const k in p) {
        const s = this.byTile.get(+k);
        if (!s || p[k] < 0) continue;
        if (now >= p[k] + FORAGE_KINDS[s.kind].regrow) { delete p[k]; this.dirty = true; }
      }
      // land changes (a pond dug, a build placed) hide finds
      const lv = game.world.landVersion + ':' + game.structures?.list?.length;
      if (lv !== this._lv) { this._lv = lv; this.dirty = true; }
    }
    // the fox's errand: grab it when he gets there (or gives up the walk)
    const P = this.pending;
    if (P) {
      P.t += dt;
      const fox = game.fox;
      const there = fox && Math.hypot(fox.x - P.spot.px, fox.z - P.spot.pz) < 0.8;
      if (there || P.t > P.max || (fox && !fox.target && P.t > 0.4)) this.finish(P.spot);
    }
    if (this.dirty) this.rebuild();
    this.drawFx(dt);
  }

  rebuild() {
    this.dirty = false;
    const B = this.batch, g = this.game.grid;
    B.clear();
    const items = [];
    for (const d of this.decor) {
      const f = this.frames[d.name]?.[0];
      if (!f) continue;
      const i = Math.floor(d.z) * g.w + Math.floor(d.x);
      if (g.inb(Math.floor(d.x), Math.floor(d.z)) && (g.occ[i] >= 0 || g.kind[i] === KIND.WATER)) continue;
      items.push({ f, x: d.x, y: d.y, z: d.z, o: d.flat ? { texels: 24, mode: 1, ax: 0.5, ay: 0.5 } : { texels: 24, flip: !!d.flip } });
    }
    for (const s of this.spots) {
      if (this.blocked(s)) continue;
      let name = s.sprite;
      if (!this.available(s)) { name = FORAGE_KINDS[s.kind].picked; if (!name) continue; }
      const f = this.frames[name]?.[0];
      if (!f) continue;
      const sway = s.kind === 'log' || s.kind === 'resin' || s.kind === 'ruin' || s.kind === 'pinecone' ? 0 : 0.7;
      items.push({ f, x: s.px, y: g.surfaceAtVisual(s.px, s.pz), z: s.pz, o: { texels: 24, flip: s.flip, sway, phase: s.i % 7 } });
    }
    items.sort((a, b) => a.z - b.z);
    for (const it of items) B.push(it.f, it.x, it.y, it.z, it.o);
    B.commit();
  }

  // twinkles on reachable finds near the camera, plus pick-up pops
  drawFx(dt) {
    const game = this.game, g = game.grid, F = this.fx, GL = this.glints;
    F.clear();
    GL.clear();
    const glint = this.frames.crop_ready_glint;
    const tx = game.rig?.target?.x ?? 70, tz = game.rig?.target?.z ?? 40;
    const night = game.sky?.state?.night || 0;
    if (glint && !game.titleMode) {
      let n = 0;
      for (const s of this.spots) {
        if (n >= 70) break;
        if (Math.abs(s.px - tx) > 22 || Math.abs(s.pz - tz) > 18) continue;
        if (!this.available(s) || this.blocked(s) || !this.canReach(s)) continue;
        // each find flashes for a moment every few seconds, out of step
        const ph = (((this.time * 0.42 + (s.i % 13) * 0.137) % 1) + 1) % 1;
        if (ph > 0.12 && this.pending?.spot !== s) continue;
        const f = this.frames[s.sprite]?.[0];
        const k = Math.floor((ph / 0.12) * 4) % 4;
        const hx = f ? (f.w / 24) * 0.32 : 0.3, hy = f ? (f.h / 24) * 0.8 : 0.5;
        GL.push(glint[this.pending?.spot === s ? Math.floor(this.time * 10) % glint.length : k % glint.length], s.px + (s.flip ? -hx : hx), g.height[s.i] + hy + 0.12, s.pz + 0.05, { texels: 24, mode: 2, ax: 0.5, ay: 0.5, emissive: 0.3 + night * 0.4 });
        n++;
      }
    }
    // pops: the picked find squashes, stretches up and vanishes (or shakes "no")
    for (let k = this.pops.length - 1; k >= 0; k--) {
      const P = this.pops[k];
      P.t += dt;
      const s = P.spot, f = this.frames[s.sprite]?.[0];
      const y = g.surfaceAtVisual(s.px, s.pz);
      if (P.shake) {
        if (P.t > 0.35) { this.pops.splice(k, 1); continue; }
        if (!f) continue;
        // drawn over the static sprite, wiggling side to side
        F.push(f, s.px + Math.sin(P.t * 50) * 0.04 * (1 - P.t / 0.35), y + 0.005, s.pz + 0.02, { texels: 24, flip: s.flip, tint: [1.15, 0.85, 0.8] });
        continue;
      }
      const T = 0.32;
      if (P.t > T || !f) { this.pops.splice(k, 1); continue; }
      const u = P.t / T;
      const sx = u < 0.3 ? 1 + u * 1.2 : (1.36 - (u - 0.3) * 1.9);
      const sy = u < 0.3 ? 1 - u * 0.9 : (0.73 + (u - 0.3) * 1.6) * (1 - Math.max(0, u - 0.7) * 3);
      if (sx <= 0.02 || sy <= 0.02) continue;
      F.push(f, s.px, y + Math.max(0, u - 0.3) * 0.6, s.pz, { texels: 24, flip: s.flip, sx: Math.max(0.05, sx), sy: Math.max(0.05, sy), emissive: 0.25 });
    }
    F.commit();
    GL.commit();
  }
}
