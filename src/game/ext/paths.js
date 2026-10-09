// [v26 resort] game.paths: the Path tool and how bears respect paths.
//
// The player paints path tiles (Build > Paths: dirt, gravel, stone slabs, plank
// boardwalks over shallow water, or the eraser), dragging like the Terraform brush.
// Once ANY path exists, bears walking to the pond, the snacks or a resort facility
// use a flow field where path tiles are cheap and off-path grass is very expensive
// (cost()/costMap(), read by BearSystem.fieldFrom/entryField), so they follow the
// paths. If the only way to a spot is across the grass they grumble ("No path?"),
// trample the flowers on the way and remember it in their review. Rampaging bears
// ignore paths entirely. With no paths at all (a new game) nothing changes.
//
// API: isPath(x, z), cost(x, z), costMap(), typeAt(x, z), deckY(x, z) (boardwalk deck
// height or null), hasPaths(), set(x, z, type), canPaint(x, z, type),
// strokeStart/strokePath/strokeEnd (Input.js), panelHTML/bindPanel (Blueprint.js).
// Save: game.state.paths = { v: 1, t: [i, type, i, type, ...] }.
import { KIND } from '../../world/grid.js';
import { PathLayer, DECK_Y } from '../resort/pathMesh.js';
import { buildTerrainAtlas } from '../../art/terrainArt.js';
import { buildPathAtlas, boardSwatch } from '../resort/pathArt.js';

export const PATH_TYPES = [
  null,
  { id: 1, key: 'dirt', name: 'Dirt path', cost: 1, walk: 1, need: 'r_rs_paths', color: 0xd8a868 },
  { id: 2, key: 'gravel', name: 'Gravel path', cost: 2, walk: 0.95, need: 'r_rs_paths', color: 0xc8bca8 },
  { id: 3, key: 'stone', name: 'Stone slabs', cost: 4, walk: 0.9, need: 'r_rs_paths2', color: 0xa8a296 },
  { id: 4, key: 'board', name: 'Boardwalk', cost: 6, walk: 1 / 1.5, need: 'r_rs_paths2', water: true, color: 0xc28a4c },
];
export const OFF_PATH = 6; // flow-field cost of a grass tile once paths exist
const FLOWERY = new Set(['fireweed', 'lupine', 'daisy']);
const GRUMBLE = ['No path?', 'Where\'s the path?', 'My good shoes! Grass!', 'Am I supposed to hike?', 'Is this the way?', 'Ugh. Mud.'];

export function install(game) { return new Paths(game); }

class Paths {
  constructor(game) {
    this.game = game;
    const g = game.grid;
    this.type = new Uint8Array(g.w * g.h);
    this.count = 0;
    this.version = 1;
    this.sel = 1; // selected path type (0 = eraser)
    this.stroke = null;
    this.layer = null;
    this.dirty = true;
    this._costVer = -1; this._costGrid = -1; this._cost = null;
    this.clutterT = 0; this.clutterDirty = false;
    this.toolKind = 'path';
  }

  get grid() { return this.game.grid; }

  // ------------------------------------------------------------ queries
  idx(x, z) { return z * this.grid.w + x; }
  typeAt(x, z) { return this.grid.inb(x, z) ? this.type[this.idx(x, z)] : 0; }
  isPath(x, z) { return this.typeAt(x, z) > 0; }
  isDeck(x, z) { return this.typeAt(x, z) === 4; }
  deckY(x, z) { return this.typeAt(x, z) === 4 ? DECK_Y : null; }
  hasPaths() { return this.count > 0; }
  available(key = 'r_rs_paths') { const r = this.game.state?.research || []; return r.includes(key); }

  nearEntry(x, z) {
    const e = this.game.bears?.entryTile;
    return !!e && Math.max(Math.abs(x - e[0]), Math.abs(z - e[1])) <= 1;
  }

  // a land tile a bear would rather not walk on (paths exist, this isn't one)
  offPath(x, z) {
    const g = this.grid;
    if (!this.count || !g.inb(x, z)) return false;
    const i = this.idx(x, z);
    if (this.type[i] || g.kind[i] === KIND.WATER || g.kind[i] === KIND.TRAIL || !g.meadow[i]) return false;
    return !this.nearEntry(x, z);
  }

  // walking cost multiplier of a tile for calm bears (1 = normal)
  cost(x, z) {
    if (!this.count) return 1;
    const m = this.costMap();
    return m ? m[this.idx(x, z)] : 1;
  }

  // per-tile multipliers for grid.bearField, or null when there are no paths
  costMap() {
    if (!this.count) return null;
    const g = this.grid;
    if (this._cost && this._costVer === this.version && this._costGrid === g.version) return this._cost;
    const m = this._cost || (this._cost = new Float32Array(g.w * g.h));
    const e = this.game.bears?.entryTile || [-9, -9];
    for (let i = 0; i < m.length; i++) {
      const t = this.type[i], k = g.kind[i];
      if (t) m[i] = PATH_TYPES[t].walk;
      else if (k === KIND.WATER || k === KIND.TRAIL || !g.meadow[i]) m[i] = 1;
      else {
        const x = i % g.w, z = (i / g.w) | 0;
        m[i] = Math.max(Math.abs(x - e[0]), Math.abs(z - e[1])) <= 1 ? 1 : OFF_PATH;
      }
    }
    this._costVer = this.version; this._costGrid = g.version;
    return m;
  }

  // ------------------------------------------------------------ editing
  // why tile (x, z) can't take path type t (null = ok); t = 0 erases
  canPaint(x, z, t = this.sel) {
    const g = this.grid;
    if (!g.inb(x, z)) return 'Out of bounds';
    const i = this.idx(x, z);
    if (t === 0) return this.type[i] ? null : 'No path here';
    if (!g.meadow[i]) return 'Only on your own land';
    if (g.occ[i] === -2) return 'That\'s Reynard\'s hut!';
    if (g.occ[i] >= 0) return 'Something is built here';
    if (g.deco[i] !== -1) return 'Clear the tree/rock first';
    if (this.type[i] === t) return 'Already a path';
    const water = g.kind[i] === KIND.WATER;
    if (PATH_TYPES[t]?.water) {
      if (!water) return 'Boardwalks go over water';
      let ok = false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (!g.inb(nx, nz)) continue;
        const ni = this.idx(nx, nz);
        if (g.kind[ni] !== KIND.WATER || this.type[ni] === 4) { ok = true; break; }
      }
      return ok ? null : 'Start the boardwalk at the shore';
    }
    if (water) return 'That\'s water (use the Boardwalk)';
    return null;
  }

  set(x, z, t, { quiet = false } = {}) {
    const g = this.grid;
    const i = this.idx(x, z);
    const was = this.type[i];
    if (was === t) return false;
    this.type[i] = t;
    this.count += (t ? 1 : 0) - (was ? 1 : 0);
    this.version++;
    this.dirty = true;
    if (t && t !== 4) {
      // the path replaces ground paint and grass tufts on that tile
      if (g.paint[i]) { g.paint[i] = 0; this.game.world.refreshSurfaceTiles?.([i]); }
      if (this.game.world.hasClutter?.(x, z)) { this.game.world.removeClutter(x, z); this.clutterDirty = true; }
    }
    if (!quiet) this.saveState();
    return true;
  }

  // dug ponds / filled water: paths that no longer fit their tile go away
  validate() {
    const g = this.grid;
    let changed = false;
    for (let i = 0; i < this.type.length; i++) {
      const t = this.type[i];
      if (!t) continue;
      const water = g.kind[i] === KIND.WATER;
      if ((t === 4) !== water || g.occ[i] === -2) { this.type[i] = 0; this.count--; changed = true; }
    }
    if (changed) { this.version++; this.dirty = true; this.saveState(); }
  }

  // ------------------------------------------------------------ strokes (Input.js)
  strokeStart(t) {
    this.stroke = { seen: new Set(), done: 0, spent: 0, n: 0, broke: false, start: t, last: t, sel: this.sel, warned: false };
    this.strokePath([t]);
  }

  strokePath(path) {
    const s = this.stroke;
    if (!s) return;
    for (; s.done < path.length; s.done++) {
      const t = path[s.done];
      s.last = t;
      const k = t.x + ',' + t.z;
      if (s.seen.has(k)) continue;
      s.seen.add(k);
      this.paintTile(s, t.x, t.z);
    }
    if (this.dirty) this.rebuild();
  }

  paintTile(s, x, z) {
    const game = this.game;
    const why = this.canPaint(x, z, s.sel);
    if (why) return false;
    const cost = s.sel ? PATH_TYPES[s.sel].cost : 0;
    if (cost > 0) {
      if (!game.canAfford(cost)) {
        if (!s.broke) { s.broke = true; game.spend(cost, 'builds'); } // "Not enough coins!"
        return false;
      }
      game.spend(cost, 'builds');
      s.spent += cost;
    }
    this.set(x, z, s.sel, { quiet: true });
    s.n++;
    // FX: a puff of dust (gravel crunch / plank knock) on every few tiles
    const g = this.grid, i = this.idx(x, z);
    const y = (g.kind[i] === KIND.WATER ? DECK_Y : Math.max(0, g.height[i])) + 0.1;
    const P = game.particles;
    if (s.n % 2 === 1) {
      if (s.sel === 0) P.puff(x + 0.5, y, z + 0.5, 5, 0.3);
      else if (s.sel === 4) { P.debris(x + 0.5, y + 0.1, z + 0.5, 3, [0xc28a4c, 0xdcaa6a, 0x8a5a32]); P.splash(x + 0.5, z + 0.5, 4, 0.4); }
      else { P.dust(x + 0.5, y, z + 0.5, 2); P.debris(x + 0.5, y, z + 0.5, 2, s.sel === 1 ? [0xa87a4a, 0x8a6a44] : [0xb8b0a0, 0x9a9488, 0xd8d0c0]); }
    }
    game.audio.play(s.sel === 0 ? 'rs_path_erase' : s.sel === 4 ? 'rs_plank' : 'rs_path', { volume: 0.35, pitch: 0.9 + Math.random() * 0.25 });
    return true;
  }

  strokeEnd(moved = false) {
    const s = this.stroke;
    this.stroke = null;
    if (!s) return;
    const game = this.game;
    if (s.n > 0) {
      this.saveState();
      this.rebuild();
      if (s.spent > 0) {
        const g = this.grid, t = s.last;
        game.ui?.floatTextAt?.(t.x + 0.5, (g.inb(t.x, t.z) ? Math.max(0, g.height[this.idx(t.x, t.z)]) : 0) + 1.1, t.z + 0.5, `-${s.spent}`, '#ffb0a0');
      }
      game.emit('paths', { n: s.n, type: s.sel, count: this.count });
      game.save?.();
    } else if (!s.broke && s.start) {
      const why = this.canPaint(s.start.x, s.start.z, s.sel);
      if (why) { game.ui?.toast?.(why, 'bad'); game.audio.play('error', { volume: 0.3 }); }
    }
    void moved;
  }

  // ------------------------------------------------------------ visuals
  rebuild() {
    this.dirty = false;
    if (!this.layer) { if (!this.count) return; this.layer = new PathLayer(this.game, this); }
    this.layer.rebuild();
  }

  // ------------------------------------------------------------ Blueprint panel
  swatch(t) {
    this._sw ||= {};
    if (this._sw[t]) return this._sw[t];
    let url = '';
    try {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 48;
      const c = cv.getContext('2d');
      c.imageSmoothingEnabled = false;
      if (t === 1) {
        const A = buildTerrainAtlas();
        const img = A?.canvas, r = A?.tiles?.trail;
        if (img && r) c.drawImage(img, r.x + 4, r.y + 4, 24, 24, 0, 0, 48, 48);
        else { c.fillStyle = '#c8945a'; c.fillRect(0, 0, 48, 48); c.fillStyle = '#a87a4a'; for (let k = 0; k < 40; k++) c.fillRect((k * 17) % 46, (k * 29) % 46, 2, 2); }
      } else if (t === 2 || t === 3) {
        const A = buildPathAtlas(), r = A.tiles[t === 2 ? 'gravel' : 'stone'];
        c.drawImage(A.canvas, r.x + 2, r.y + 2, 24, 24, 0, 0, 48, 48);
      } else if (t === 4) c.drawImage(boardSwatch(), 0, 0, 48, 48);
      url = cv.toDataURL();
    } catch { /* plain colour */ }
    this._sw[t] = url;
    return url;
  }

  panelHTML(tico) {
    const coin = tico('coin', 1);
    const list = PATH_TYPES.filter((p) => p && this.available(p.need));
    if (!list.some((p) => p.id === this.sel) && this.sel !== 0) this.sel = list[0]?.id || 0;
    const sw = list.map((p) => {
      const url = this.swatch(p.id);
      const bg = url ? `background-image:url(${url})` : `background:#${p.color.toString(16).padStart(6, '0')}`;
      return `<button class="tf-swatch ${this.sel === p.id ? 'on' : ''}" data-rs-path="${p.id}" title="${p.name}" style="${bg}"><em>${p.name}</em></button>`;
    }).join('');
    const er = `<button class="tf-mode ${this.sel === 0 ? 'on' : ''}" data-rs-path="0" title="Remove paths">${tico('rs_erase', 2)}<em>Remove</em></button>`;
    const cost = this.sel ? `<div class="tf-cost">${coin}${PATH_TYPES[this.sel].cost}<small>/tile</small></div>` : '<div class="tf-cost"><small>free</small></div>';
    const hint = this.count ? `<div class="tf-hint">${this.count} tiles. Bears stick to paths.</div>` : '<div class="tf-hint">Drag to lay a path. Once you have paths, bears stick to them.</div>';
    return `<div class="tf-panel rs-paths"><div class="tf-group">${sw}</div><div class="tf-group">${er}</div><div class="tf-sep"></div>${cost}${hint}</div>`;
  }

  bindPanel(box, rerender) {
    const game = this.game;
    box.querySelectorAll('[data-rs-path]').forEach((b) => b.addEventListener('click', () => {
      this.sel = +b.dataset.rsPath;
      game.audio.play('click', { volume: 0.35 });
      if (game.tool?.kind !== 'path') game.setTool({ kind: 'path' });
      rerender();
    }));
  }

  // ------------------------------------------------------------ bears
  // a freshly planned route that crosses the grass: grumble (once in a while)
  checkRoute(b, path) {
    if (!this.count || !path || path.length < 4 || b.angry || b.hostile) return 0;
    let off = 0;
    for (let k = 1; k < path.length - 1; k++) if (this.offPath(path[k][0], path[k][1])) off++;
    const allow = this.game.structures.countBuilt('rs_infoboard') ? 5 : 3;
    if (off >= allow) {
      b.pathGripes = (b.pathGripes || 0) + 1;
      const now = this.game.time;
      if (!(b._pvSaid > now - 14)) { b._pvSaid = now; this.game.bears.say(b, GRUMBLE[(b.id + b.pathGripes) % GRUMBLE.length], 'emo_question', null, 1.8); }
    }
    return off;
  }

  // a calm bear stomping across off-path grass flattens the flowers
  trample(b, x, z) {
    const game = this.game, w = game.world;
    const list = w.clutterOn?.(x, z) || [];
    if (!list.some((c) => !c.removed && FLOWERY.has(c.type))) return;
    w.removeClutter(x, z);
    this.clutterDirty = true;
    const g = this.grid, y = Math.max(0, g.height[this.idx(x, z)]) + 0.15;
    for (let k = 0; k < 5; k++) game.particles.leaf?.(x + 0.3 + Math.random() * 0.4, y + 0.1, z + 0.3 + Math.random() * 0.4, [0xf06a8a, 0xffd84a, 0xb48aff, 0xffffff][k % 4]);
    game.audio.play('rs_squish', { volume: 0.3, pitch: 0.9 + Math.random() * 0.3 });
    b.trampled = (b.trampled || 0) + 1;
    game.emit('trample', { bear: b, x, z });
  }

  // ------------------------------------------------------------ hooks
  update(simDt, dt) {
    const game = this.game, g = this.grid;
    // the tool's hover/drag preview comes from UI.updateGhost (game.ghost tiles)
    if (this._gridVer !== g.version) { this._gridVer = g.version; if (this.count) this.validate(); }
    const terr = game.world?.terrain?.geometry;
    if (terr && terr !== this._terrGeo) { this._terrGeo = terr; if (this.count) this.dirty = true; }
    if (this.dirty && !this.stroke) this.rebuild();
    if (this.clutterDirty) { this.clutterT -= dt || 0.016; if (this.clutterT <= 0) { this.clutterT = 0.6; this.clutterDirty = false; game.world.buildClutter?.(); } }
    if (!this.count || !simDt) return;
    for (const b of game.bears.list) {
      if (!b.visible || b.angry || b.hostile || b.def.boss) continue;
      if (b.path && b.path !== b._pvPath) { b._pvPath = b.path; if (b.state === 'walk' && b.goal?.kind !== 'leave') this.checkRoute(b, b.path); }
      if (!b.moving || b.inWater || b.jump) continue;
      const tx = Math.floor(b.x), tz = Math.floor(b.z), i = tx + tz * g.w;
      if (i === b._pvTile) continue;
      b._pvTile = i;
      if (this.offPath(tx, tz)) { b.offPathSteps = (b.offPathSteps || 0) + 1; this.trample(b, tx, tz); }
    }
  }

  saveState() {
    const t = [];
    for (let i = 0; i < this.type.length; i++) if (this.type[i]) t.push(i, this.type[i]);
    this.game.state.paths = { v: 1, t };
  }

  loadState() {
    const g = this.grid;
    this.type.fill(0);
    this.count = 0;
    const d = this.game.state?.paths;
    if (d && Array.isArray(d.t)) {
      for (let k = 0; k + 1 < d.t.length; k += 2) {
        const i = d.t[k] | 0, t = d.t[k + 1] | 0;
        if (i < 0 || i >= this.type.length || t < 1 || t > 4) continue;
        if ((t === 4) !== (g.kind[i] === KIND.WATER)) continue;
        this.type[i] = t; this.count++;
      }
    }
    this.version++;
    this.dirty = true;
    this._gridVer = g.version;
  }

  onNewGame() { this.game.state.paths = { v: 1, t: [] }; }
  onLoad() { this.loadState(); this.rebuild(); }
}
