// Terraform tool (Build menu tab 'terraform', unlocked by Pip): reshape your
// own land. Raise / lower ground in smooth steps, paint it (grass, sand, dirt
// path, flower meadow, moss), dig new ponds and fill water back in, and name
// every pond (a floating wooden sign you can tap to rename).
//
// Only on your land (grid.meadow), never under trees, rocks, builds or the
// fox's hut. Every change costs a few coins. Strokes come from Input.js
// (drag = paint along the path); the brush preview, pond signs and the
// throttled terrain rebuilds run in update().
import * as THREE from 'three';
import { KIND, WATER_Y, N4, N8 } from '../world/grid.js';
import { HUT, refreshWaterHeights } from '../world/worldgen.js';
import { PAINT } from '../world/world.js';
import { buildPaintAtlas } from '../art/paintArt.js';
import { buildTerrainAtlas } from '../art/terrainArt.js';
import '../ui/terraform.css';

export const STEP = 0.25; // one terrace step
export const MAX_H = 2.5; // tallest hill
const MAXD = 0.5; // steepest step between neighbours (keeps slopes smooth)
export const TF_COST = { raise: 1, lower: 1, paint: 1, dig: 4, fill: 3, name: 0 };

export const TF_MODES = [
  { id: 'raise', icon: 'tf_raise', name: 'Raise' },
  { id: 'lower', icon: 'tf_lower', name: 'Lower' },
  { id: 'paint', icon: 'tf_paint', name: 'Paint' },
  { id: 'dig', icon: 'tf_dig', name: 'Dig' },
  { id: 'fill', icon: 'tf_fill', name: 'Fill' },
];
export const TF_PAINTS = [
  { id: PAINT.GRASS, key: 'grass', name: 'Grass', atlas: 'grass', color: 0x8cc453 },
  { id: PAINT.SAND, key: 'sand', name: 'Sand', atlas: 'sand', color: 0xf2dcaa },
  { id: PAINT.PATH, key: 'path', name: 'Dirt path', atlas: 'trail', color: 0xd8a868 },
  { id: PAINT.FLOWERS, key: 'flowers', name: 'Flower meadow', atlas: 'flowers', color: 0xffb0d0 },
  { id: PAINT.MOSS, key: 'moss', name: 'Moss', atlas: 'moss', color: 0x8ad860 },
];
const PAINT_BY_ID = Object.fromEntries(TF_PAINTS.map((p) => [p.id, p]));

// cozy default pond names: big water gets a lake-ish name, puddles a puddle-ish one
const BIG_NAMES = ['Lily Lake', 'Minnow Mere', 'Frog Hollow', 'Loonie Lagoon', 'Maple Mirror', 'Bluegill Bay', 'Cattail Cove', 'Old Toad Pond', 'Beaver Basin', 'Moonbeam Pond', 'Pickerel Pool', 'Snoozy Shallows'];
const SMALL_NAMES = ['Muddy Puddle', 'Teacup Pond', 'Tadpole Tarn', 'Frog Bath', 'Duckweed Dip', 'Wee Splash', 'Puddle Jr.', 'Bubble Bowl', 'Mossy Dip', 'Moose Footprint'];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class Terraform {
  constructor(game) {
    this.game = game;
    this.mode = 'raise';
    this.paint = PAINT.PATH;
    this.brush = 2;
    this.stroke = null;
    this.dirty = null; // { terrain, water, clutter, topo }
    this.buildT = 0;
    this.ponds = []; // { name, x, z, n, tiles: Set }
    this.savedPonds = null;
    this.signs = new Map(); // pond -> element
    this.time = 0;
  }

  // ------------------------------------------------------------ rules
  nearHut(x, z) { return x >= HUT.x - 1 && x <= HUT.x + 3 && z >= HUT.z - 1 && z <= HUT.z + 4; }
  nearEntry(x, z) {
    const e = this.game.bears?.entryTile;
    return !!e && Math.max(Math.abs(x - e[0]), Math.abs(z - e[1])) <= 1;
  }
  fishOn(x, z) {
    for (const f of this.game.fish.list) if (!f.tank && !f.held && Math.floor(f.x) === x && Math.floor(f.z) === z) return true;
    return false;
  }

  // why this tile can't be changed in `mode` (null = ok)
  reason(x, z, mode = this.mode) {
    const g = this.game.grid;
    if (!g.inb(x, z)) return 'Out of bounds';
    const i = z * g.w + x;
    if (!g.meadow[i]) return 'Only on your own land';
    if (g.occ[i] === -2) return "That's Reynard's hut!";
    if (g.occ[i] >= 0) return 'Something is built here';
    if (g.deco[i] !== -1) return 'Clear the tree/rock first';
    const water = g.kind[i] === KIND.WATER;
    if (mode === 'name') return water ? null : 'Tap a pond to name it';
    if (mode === 'fill') return water ? null : 'Not water';
    if (water) return mode === 'dig' ? 'Already water' : 'That\'s water (use Fill)';
    if (mode === 'paint') return null;
    if (this.nearHut(x, z)) return 'Too close to the hut';
    if (this.nearEntry(x, z)) return 'Keep the trail clear for customers!';
    if (mode === 'dig') {
      const fox = this.game.fox;
      if (fox && Math.floor(fox.x) === x && Math.floor(fox.z) === z) return 'Reynard is standing there!';
    }
    return null;
  }

  // brush footprint: 1 tile, 3x3, or a 5x5 circle
  footprint(x, z, brush = this.mode === 'name' ? 1 : this.brush) {
    const r = [0.5, 1.5, 2.5][brush - 1] || 0.5, R = Math.floor(r), out = [];
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dz * dz <= r * r + 0.01) out.push({ x: x + dx, z: z + dz });
    return out;
  }

  // ------------------------------------------------------------ strokes (from Input.js)
  strokeStart(t) {
    this.stroke = { seen: new Set(), done: 0, start: t, last: t, spent: 0, n: 0, broke: false, mode: this.mode };
    this.strokePath([t]);
  }

  // walk the drag path (Input keeps it gap-free), applying the brush on each new tile
  strokePath(path) {
    const s = this.stroke;
    if (!s) return;
    for (; s.done < path.length; s.done++) {
      const t = path[s.done];
      s.last = t;
      if (s.mode === 'name') continue;
      const tiles = this.footprint(t.x, t.z).filter((p) => !s.seen.has(p.x + ',' + p.z));
      for (const p of tiles) s.seen.add(p.x + ',' + p.z);
      if (tiles.length) this.apply(s.mode, tiles, t);
    }
  }

  strokeEnd(moved = false) {
    const s = this.stroke;
    this.stroke = null;
    if (!s) return;
    if (s.mode === 'name') { if (!moved) this.tapName(s.last.x, s.last.z); return; }
    this.flush(true);
    if (s.spent > 0) {
      const g = this.game.grid, t = s.last;
      this.game.ui?.floatTextAt?.(t.x + 0.5, (g.inb(t.x, t.z) ? Math.max(0, g.height[t.z * g.w + t.x]) : 0) + 1.2, t.z + 0.5, `-${s.spent}`, '#ffb0a0');
      this.game.emit('terraform', { mode: s.mode, n: s.n });
      this.game.save?.();
    } else if (!s.broke && s.start) {
      const why = this.reason(s.start.x, s.start.z, s.mode);
      if (why) { this.game.ui?.toast?.(why, 'bad'); this.game.audio.play('error', { volume: 0.3 }); }
    }
  }

  pay(s, cost) {
    const game = this.game;
    if (cost <= 0) return true;
    if (!game.canAfford(cost)) {
      if (!s?.broke) game.spend(cost, 'digging'); // shows "Not enough coins!"
      if (s) s.broke = true;
      return false;
    }
    game.spend(cost, 'digging');
    if (s) s.spent += cost;
    return true;
  }

  apply(mode, tiles, at) {
    if (mode === 'raise' || mode === 'lower') return this.reshape(tiles, mode === 'raise' ? 1 : -1, at);
    if (mode === 'paint') return this.paintTiles(tiles, this.paint);
    if (mode === 'dig') return this.digTiles(tiles);
    if (mode === 'fill') return this.fillTiles(tiles);
    return 0;
  }

  // ------------------------------------------------------------ raise / lower
  heightEditable(x, z) {
    const g = this.game.grid;
    return g.terraformable(x, z) && !this.nearHut(x, z) && !this.nearEntry(x, z);
  }

  // +-1 step on the brush; neighbours follow so no step is steeper than MAXD
  reshape(tiles, dir, at) {
    const g = this.game.grid, H = g.height, w = g.w;
    const old = new Map();
    const set = (i, v) => { if (!old.has(i)) old.set(i, H[i]); H[i] = v; };
    const q = [];
    for (const t of tiles) {
      if (!this.heightEditable(t.x, t.z)) continue;
      const i = t.z * w + t.x;
      const v = Math.min(MAX_H, Math.max(0, Math.round((H[i] + dir * STEP) / STEP) * STEP));
      if (v !== H[i]) { set(i, v); q.push(i); }
    }
    for (let h = 0; h < q.length; h++) {
      const c = q[h], cx = c % w, cz = (c / w) | 0;
      for (const [dx, dz] of N8) {
        const nx = cx + dx, nz = cz + dz;
        if (!this.heightEditable(nx, nz)) continue;
        const ni = nz * w + nx;
        if (dir > 0 && H[c] - H[ni] > MAXD + 1e-4) { set(ni, H[c] - MAXD); q.push(ni); }
        else if (dir < 0 && H[ni] - H[c] > MAXD + 1e-4) { set(ni, H[c] + MAXD); q.push(ni); }
      }
    }
    const changed = [...old.keys()].filter((i) => Math.abs(old.get(i) - H[i]) > 1e-4);
    if (!changed.length) return 0;
    if (!this.pay(this.stroke, changed.length * TF_COST[dir > 0 ? 'raise' : 'lower'])) { for (const [i, v] of old) H[i] = v; return 0; }
    if (this.stroke) this.stroke.n += changed.length;
    for (const i of changed) g.terraEdit[i] = 1;
    this.markDirty({ terrain: true, clutter: true });
    // FX: dirt puffs where the ground heaves
    const P = this.game.particles;
    const dirt = [0x6a4a2a, 0x8a6a44, 0x4a3a28, 0x7bb347];
    changed.slice(0, 10).forEach((i, k) => {
      const x = (i % w) + 0.5, z = ((i / w) | 0) + 0.5, y = H[i];
      if (k % 2 === 0) P.dust(x, y, z, 2);
      if (k < 4) P.debris(x, y + 0.1, z, dir > 0 ? 4 : 3, dirt);
    });
    if (at) {
      const ci = at.z * w + at.x, y = g.inb(at.x, at.z) ? H[ci] : 0;
      P.puff(at.x + 0.5, y + 0.05, at.z + 0.5, 7, 0.32);
      if (Math.random() < 0.25) P.word?.(dir > 0 ? 'pop' : 'pow', at.x + 0.5, y + 1, at.z + 0.5, { size: 0.24, life: 0.6 });
    }
    this.game.audio.play(dir > 0 ? 'tf_raise' : 'tf_lower', { volume: 0.5, pitch: 0.9 + Math.random() * 0.2 });
    return changed.length;
  }

  // ------------------------------------------------------------ paint
  paintTiles(tiles, paint) {
    const g = this.game.grid;
    const list = [];
    for (const t of tiles) {
      if (this.reason(t.x, t.z, 'paint')) continue;
      const i = t.z * g.w + t.x;
      if (g.paint[i] === paint) continue;
      list.push(i);
    }
    if (!list.length) return 0;
    let n = list.length;
    if (!this.game.canAfford(n * TF_COST.paint)) n = Math.floor(this.game.state.coins / TF_COST.paint);
    if (n <= 0 || !this.pay(this.stroke, n * TF_COST.paint)) { if (this.stroke) this.stroke.broke = true; return 0; }
    list.length = n;
    for (const i of list) g.paint[i] = paint;
    if (this.stroke) this.stroke.n += n;
    this.game.world.refreshSurfaceTiles(list);
    this.markDirty({ clutter: true });
    // FX: sparkles in the paint colour (petals for flowers)
    const P = this.game.particles, col = PAINT_BY_ID[paint]?.color || 0xfff2a0;
    list.slice(0, 6).forEach((i, k) => {
      const x = (i % g.w) + 0.5, z = ((i / g.w) | 0) + 0.5, y = Math.max(0, g.height[i]) + 0.15;
      if (k % 2 === 0) P.sparkle(x, y, z, 3, col);
      if (paint === PAINT.FLOWERS && k < 2) P.confetti(x, y, z, 4);
      if ((paint === PAINT.PATH || paint === PAINT.SAND) && k < 2) P.dust(x, y - 0.1, z, 1);
    });
    this.game.audio.play('tf_paint', { volume: 0.4, pitch: 0.9 + Math.random() * 0.25 });
    return n;
  }

  // ------------------------------------------------------------ dig / fill
  digTiles(tiles) {
    const game = this.game, g = game.grid;
    let n = 0;
    for (const t of tiles) {
      if (this.reason(t.x, t.z, 'dig')) continue;
      if (!this.pay(this.stroke, TF_COST.dig)) break;
      const i = t.z * g.w + t.x;
      g.kind[i] = KIND.WATER;
      g.height[i] = 0;
      g.paint[i] = 0;
      game.world.removeClutter?.(t.x, t.z);
      for (const c of game.world.clutter) if (Math.floor(c.x) === t.x && Math.floor(c.z) === t.z) c.removed = true;
      n++;
      if (n <= 4) {
        game.particles.debris(t.x + 0.5, 0.2, t.z + 0.5, 6, [0x6a4a2a, 0x8a6a44, 0x4a3a28]);
        game.particles.splash(t.x + 0.5, t.z + 0.5, 6, 0.7);
      }
    }
    if (!n) return 0;
    if (this.stroke) this.stroke.n += n;
    this.markDirty({ terrain: true, water: true, clutter: true, topo: true });
    game.audio.play('dig', { volume: 0.5 });
    game.audio.play('splash', { volume: 0.35, pitch: 1.1 });
    game.emit('dig');
    return n;
  }

  // meadow water tiles connected to i (4-neighbour)
  pondTiles(i) {
    const g = this.game.grid, w = g.w, out = new Set([i]), q = [i];
    for (let h = 0; h < q.length; h++) {
      const c = q[h], cx = c % w, cz = (c / w) | 0;
      for (const [dx, dz] of N4) {
        const nx = cx + dx, nz = cz + dz;
        if (!g.inb(nx, nz)) continue;
        const ni = nz * w + nx;
        if (out.has(ni) || g.kind[ni] !== KIND.WATER || !g.meadow[ni]) continue;
        out.add(ni); q.push(ni);
      }
    }
    return out;
  }

  // nearest water tile of the same pond (BFS), or null
  nearestPondWater(x, z, pond) {
    const g = this.game.grid;
    let best = null, bd = 1e9;
    for (const i of pond) {
      if (g.kind[i] !== KIND.WATER) continue;
      const tx = i % g.w, tz = (i / g.w) | 0, d = (tx - x) ** 2 + (tz - z) ** 2;
      if (d < bd) { bd = d; best = { x: tx + 0.5, z: tz + 0.5 }; }
    }
    return best;
  }

  fillTiles(tiles) {
    const game = this.game, g = game.grid, w = g.w;
    let n = 0;
    for (const t of tiles) {
      if (this.reason(t.x, t.z, 'fill')) continue;
      const i = t.z * w + t.x;
      const pond = this.pondTiles(i);
      // the last bit of a pond with fish (or eggs) in it stays: they'd have nowhere to go
      if (pond.size <= 1) {
        const lives = game.fish.list.some((f) => !f.tank && !f.held && pond.has(Math.floor(f.z) * w + Math.floor(f.x))) || game.fish.eggs.some((e) => !e.tank && pond.has(Math.floor(e.z) * w + Math.floor(e.x)));
        if (lives) { if (this.stroke && !this.stroke.fishWarn) { this.stroke.fishWarn = true; game.notify('Fish live there! Carry them to another pond first.', 'no'); } continue; }
      }
      if (!this.pay(this.stroke, TF_COST.fill)) break;
      g.kind[i] = KIND.GRASS;
      // the new ground meets its neighbours without a cliff
      let h = 0;
      for (const [dx, dz] of N8) {
        const nx = t.x + dx, nz = t.z + dz;
        if (g.inb(nx, nz) && g.meadow[nz * w + nx] && g.kind[nz * w + nx] !== KIND.WATER) h = Math.max(h, g.height[nz * w + nx] - MAXD);
      }
      g.height[i] = Math.round(h / STEP) * STEP;
      g.terraEdit[i] = 1;
      pond.delete(i);
      n++;
      // fish and eggs on the tile hop over to the nearest water of their pond
      for (const f of game.fish.list) {
        if (f.tank || f.held || Math.floor(f.x) !== t.x || Math.floor(f.z) !== t.z) continue;
        const p = this.nearestPondWater(t.x, t.z, pond);
        if (!p) continue;
        game.particles.splash(f.x, f.z, 5, 0.6);
        f.x = p.x + (Math.random() - 0.5) * 0.4; f.z = p.z + (Math.random() - 0.5) * 0.4;
        game.particles.splash(f.x, f.z, 8, 0.8);
        game.audio.play('fish_flop', { volume: 0.35 });
        game.ui?.floatTextAt?.(f.x, 0.6, f.z, 'Hop!', '#bfe8ff');
      }
      for (const e of game.fish.eggs) {
        if (e.tank || Math.floor(e.x) !== t.x || Math.floor(e.z) !== t.z) continue;
        const p = this.nearestPondWater(t.x, t.z, pond);
        if (p) { e.x = p.x; e.z = p.z; }
      }
      if (n <= 4) {
        game.particles.debris(t.x + 0.5, 0.6, t.z + 0.5, 6, [0x6a4a2a, 0x8a6a44, 0x4a3a28]);
        game.particles.splash(t.x + 0.5, t.z + 0.5, 5, 0.5);
        game.particles.puff(t.x + 0.5, g.height[i] + 0.1, t.z + 0.5, 5, 0.3);
      }
    }
    if (!n) return 0;
    if (this.stroke) this.stroke.n += n;
    this.markDirty({ terrain: true, water: true, clutter: true, topo: true });
    game.audio.play('tf_fill', { volume: 0.5 });
    return n;
  }

  // ------------------------------------------------------------ rebuilds
  markDirty(d) {
    this.dirty ||= {};
    Object.assign(this.dirty, d);
  }

  // terrain rebuilds are throttled while dragging; the rest waits for the end
  flush(final = false) {
    const d = this.dirty;
    if (!d) return;
    const game = this.game, world = game.world;
    if (d.water) refreshWaterHeights(game.grid);
    if (d.terrain) world.rebuildTerrain();
    if (d.topo) {
      // eggs follow the floor they sit on
      for (const e of game.fish.eggs) if (!e.tank) e.y = game.grid.groundAt(e.x, e.z) + 0.02;
      game.onTopologyChanged();
    }
    if (final) {
      if (d.clutter) world.buildClutter();
      if (d.terrain) for (const s of game.structures.list) if (s.def?.water || game.grid.isWater(s.x, s.z)) game.structures.buildMesh?.(s);
      this.dirty = null;
    } else this.dirty = d.clutter ? { clutter: true } : null;
    this.buildT = 0;
  }

  // ------------------------------------------------------------ ponds & names
  onTopologyChanged() { this.refreshPonds(); }

  refreshPonds() {
    const g = this.game.grid, w = g.w, n = w * g.h;
    const seen = new Uint8Array(n);
    const comps = [];
    for (let i = 0; i < n; i++) {
      if (seen[i] || g.kind[i] !== KIND.WATER || !g.meadow[i]) continue;
      const tiles = this.pondTiles(i);
      for (const t of tiles) seen[t] = 1;
      comps.push({ tiles });
    }
    const old = this.ponds;
    const used = new Set();
    const named = new Map(); // comp -> name
    if (this.savedPonds) {
      // from a save: each anchor names the pond it sits in (or the nearest one)
      for (const [x, z, name] of this.savedPonds) {
        let best = null, bd = 9;
        for (const c of comps) {
          if (named.has(c)) continue;
          if (c.tiles.has(z * w + x)) { best = c; break; }
          for (const t of c.tiles) { const d = Math.hypot((t % w) - x, ((t / w) | 0) - z); if (d < bd) { bd = d; best = c; } }
        }
        if (best) { named.set(best, name); used.add(name); }
      }
      this.savedPonds = null;
    } else {
      // keep names through edits: biggest overlap wins (merging keeps the bigger name)
      const pairs = [];
      for (const p of old) for (const c of comps) {
        let k = 0;
        for (const t of c.tiles) if (p.tiles.has(t)) k++;
        if (k) pairs.push([k, p, c]);
      }
      pairs.sort((a, b) => b[0] - a[0] || b[1].tiles.size - a[1].tiles.size);
      const taken = new Set();
      for (const [, p, c] of pairs) {
        if (taken.has(p) || named.has(c)) continue;
        taken.add(p); named.set(c, p.name); used.add(p.name);
      }
    }
    for (const p of old) used.add(p.name);
    this.ponds = comps.map((c) => {
      let name = named.get(c);
      if (!name) { name = this.defaultName(c.tiles.size, used); used.add(name); }
      // the sign floats over the water tile nearest the middle
      let sx = 0, sz = 0;
      for (const t of c.tiles) { sx += t % w; sz += (t / w) | 0; }
      sx /= c.tiles.size; sz /= c.tiles.size;
      let best = 0, bd = 1e9;
      for (const t of c.tiles) {
        const x = t % w, z = (t / w) | 0, d = (x - sx) ** 2 + (z - sz) ** 2 - (g.hasLandNeighbor(x, z) ? 0 : 0.5);
        if (d < bd) { bd = d; best = t; }
      }
      return { name, x: best % w, z: (best / w) | 0, n: c.tiles.size, tiles: c.tiles };
    });
    // drop signs of ponds that are gone
    for (const [p, el] of this.signs) if (!this.ponds.includes(p)) { el.remove(); this.signs.delete(p); }
  }

  defaultName(size, used) {
    const list = size >= 8 ? BIG_NAMES : SMALL_NAMES;
    const free = list.filter((nm) => !used.has(nm));
    if (free.length) return size >= 8 && !used.has('Lily Lake') ? 'Lily Lake' : free[Math.floor(Math.random() * free.length)];
    let k = 2;
    while (used.has(`${list[0]} ${k}`)) k++;
    return `${list[0]} ${k}`;
  }

  pondAt(x, z) {
    const i = z * this.game.grid.w + x;
    return this.ponds.find((p) => p.tiles.has(i)) || null;
  }

  tapName(x, z) {
    const p = this.game.grid.inb(x, z) ? this.pondAt(x, z) : null;
    if (!p) { this.game.ui?.toast?.('Tap a pond (or its sign) to name it'); return; }
    this.renameCard(p);
  }

  // a paper card with a pencil line: type a name, roll the dice for ideas
  renameCard(p) {
    const game = this.game;
    document.querySelector('.tf-card-wrap')?.remove();
    game.audio.play('paper', { volume: 0.45 });
    const ico = (n, s) => game.ui?.icon?.(n, s) || '';
    const wrap = document.createElement('div');
    wrap.className = 'tf-card-wrap';
    wrap.innerHTML = `
      <div class="tf-card">
        <i class="tf-tape"></i>
        <div class="tf-card-h">${ico('tf_name', 2)}<span>Name this pond</span></div>
        <div class="tf-card-sub">${p.n} tile${p.n === 1 ? '' : 's'} of water</div>
        <div class="tf-field"><input class="tf-input" maxlength="20" spellcheck="false" value="${esc(p.name)}"><button class="tf-dice" title="Another idea">?!</button></div>
        <div class="tf-card-btns"><button class="tf-btn no">Cancel</button><button class="tf-btn ok">Name it!</button></div>
      </div>`;
    (game.ui?.root || document.body).appendChild(wrap);
    const input = wrap.querySelector('.tf-input');
    const close = () => { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 200); };
    const ok = () => {
      const name = input.value.replace(/\s+/g, ' ').trim().slice(0, 20);
      if (name && name !== p.name) {
        p.name = name;
        const el = this.signs.get(p);
        if (el) { el.querySelector('.tf-sign-name').textContent = name; el.classList.remove('wob'); void el.offsetWidth; el.classList.add('wob'); }
        game.particles.confetti(p.x + 0.5, WATER_Y + 1.2, p.z + 0.5, 30);
        game.audio.play('stamp', { volume: 0.5 });
        game.emit('pondNamed', p);
        game.save?.();
      }
      close();
    };
    wrap.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === wrap) close(); });
    wrap.querySelector('.ok').onclick = ok;
    wrap.querySelector('.no').onclick = () => { game.audio.play('close', { volume: 0.3 }); close(); };
    wrap.querySelector('.tf-dice').onclick = () => {
      const used = new Set(this.ponds.map((q) => q.name));
      input.value = this.defaultName(Math.random() < 0.5 ? 10 : 2, used);
      game.audio.play('tf_sign', { volume: 0.4 });
    };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') ok(); else if (e.key === 'Escape') close(); });
    setTimeout(() => { input.focus(); input.select(); }, 60);
  }

  // floating wooden signs over every pond (DOM, like the fog tags)
  updateSigns() {
    // pond name signs were removed: clear any left over and stop
    if (this.signs.size) { for (const el of this.signs.values()) el.remove(); this.signs.clear(); }
    if (!this.SHOW_SIGNS) return;
    const game = this.game, ui = game.ui;
    if (!ui?.screenOf) return;
    const hide = game.titleMode || game.cutscene?.active || game.lab?.active || game.classroom?.active || !game.started || game.rig.wupp > 0.085;
    const W = window.innerWidth, H = window.innerHeight;
    for (const p of this.ponds) {
      let el = this.signs.get(p);
      if (hide) { if (el) el.style.display = 'none'; continue; }
      if (!el) {
        el = document.createElement('div');
        el.className = 'tf-sign' + (p.n < 8 ? ' small' : '');
        el.innerHTML = '<span class="tf-sign-board"><b class="tf-sign-name"></b></span><i class="tf-sign-post"></i>';
        el.querySelector('.tf-sign-name').textContent = p.name;
        el.addEventListener('pointerdown', (e) => e.stopPropagation());
        el.addEventListener('click', (e) => { e.stopPropagation(); game.audio.play('tf_sign', { volume: 0.45 }); this.renameCard(p); });
        (ui.overlay || document.body).appendChild(el);
        this.signs.set(p, el);
      }
      const q = ui.screenOf(p.x + 0.5, WATER_Y + 0.75, p.z + 0.5);
      const vis = q.visible !== false && q.x > -80 && q.y > -60 && q.x < W + 80 && q.y < H + 80;
      el.style.display = vis ? '' : 'none';
      if (vis) el.style.transform = `translate(${Math.round(q.x)}px, ${Math.round(q.y)}px) translate(-50%, -100%)`;
    }
  }

  // ------------------------------------------------------------ brush preview
  previewMesh() {
    if (this.pv) return this.pv;
    const S = 24, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const c = cv.getContext('2d');
    c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(2, 2, S - 4, S - 4);
    c.fillStyle = '#fff';
    for (let k = 0; k < S; k += 4) { c.fillRect(k, 0, 2, 2); c.fillRect(k, S - 2, 2, 2); c.fillRect(0, k, 2, 2); c.fillRect(S - 2, k, 2, 2); }
    for (const [x, y] of [[0, 0], [S - 6, 0], [0, S - 2], [S - 6, S - 2]]) c.fillRect(x, y, 6, 2);
    for (const [x, y] of [[0, 0], [0, S - 6], [S - 2, 0], [S - 2, S - 6]]) c.fillRect(x, y, 2, 6);
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    const MAXT = 32;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXT * 12), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXT * 12), 3));
    const uv = [], idx = [];
    for (let k = 0; k < MAXT; k++) { uv.push(0, 0, 0, 1, 1, 1, 1, 0); idx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3); }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 33;
    mesh.visible = false;
    this.game.scene.add(mesh);
    this.pv = { mesh, geo, MAXT };
    return this.pv;
  }

  cornerY(cx, cz, i) {
    const g = this.game.grid;
    if (g.kind[i] === KIND.WATER) return WATER_Y + 0.04;
    if (g.terraSlope?.[i] && g.slopeH) return g.slopeH[cz * (g.w + 1) + cx] + 0.05;
    return g.height[i] + 0.05;
  }

  updatePreview() {
    const game = this.game;
    const on = game.tool?.kind === 'terraform' && !game.inputLocked;
    if (!on) { if (this.pv) this.pv.mesh.visible = false; return; }
    const ht = this.stroke?.last || game.input?.currentHoverTile?.();
    const pv = this.previewMesh();
    if (!ht) { pv.mesh.visible = false; return; }
    const g = game.grid;
    const tiles = this.footprint(ht.x, ht.z).filter((t) => g.inb(t.x, t.z)).slice(0, pv.MAXT);
    const pos = pv.geo.attributes.position.array, col = pv.geo.attributes.color.array;
    const pulse = 0.85 + Math.sin(this.time * 6) * 0.15;
    const mc = new THREE.Color({ raise: 0xffe070, lower: 0x9ad0ff, dig: 0x7ae8ff, fill: 0xd8a868, name: 0xfff4c8 }[this.mode] ?? (PAINT_BY_ID[this.paint]?.color || 0xffffff));
    tiles.forEach((t, k) => {
      const i = t.z * g.w + t.x;
      const ok = !this.reason(t.x, t.z);
      const c = ok ? mc : new THREE.Color(0xff6a5a);
      const cs = [[t.x, t.z], [t.x, t.z + 1], [t.x + 1, t.z + 1], [t.x + 1, t.z]];
      cs.forEach(([cx, cz], j) => {
        const o = (k * 4 + j) * 3;
        pos[o] = cx; pos[o + 1] = this.cornerY(cx, cz, i); pos[o + 2] = cz;
        col[o] = c.r * pulse; col[o + 1] = c.g * pulse; col[o + 2] = c.b * pulse;
      });
    });
    pv.geo.setDrawRange(0, tiles.length * 6);
    pv.geo.attributes.position.needsUpdate = true;
    pv.geo.attributes.color.needsUpdate = true;
    pv.mesh.visible = true;
  }

  update(dt) {
    this.time += dt;
    if (this.dirty && (this.dirty.terrain || this.dirty.topo)) {
      this.buildT += dt;
      if (!this.stroke || this.buildT > 0.15) this.flush(!this.stroke);
    } else if (this.dirty && !this.stroke) this.flush(true);
    this.updatePreview();
    this.updateSigns();
  }

  // ------------------------------------------------------------ Build-menu panel
  swatch(p) {
    this._sw ||= {};
    if (this._sw[p.key]) return this._sw[p.key];
    let url = '';
    try {
      const A = p.key === 'flowers' || p.key === 'moss' ? buildPaintAtlas() : buildTerrainAtlas();
      const r = A.tiles[p.atlas];
      const cv = document.createElement('canvas');
      cv.width = cv.height = 48;
      const c = cv.getContext('2d');
      c.imageSmoothingEnabled = false;
      c.drawImage(A.canvas, r.x + 4, r.y + 4, 24, 24, 0, 0, 48, 48);
      url = cv.toDataURL();
    } catch { /* plain colour */ }
    this._sw[p.key] = url;
    return url;
  }

  panelHTML(tico) {
    const coin = tico('coin', 1);
    const modes = TF_MODES.map((m) => `<button class="tf-mode ${this.mode === m.id ? 'on' : ''}" data-tf-mode="${m.id}" title="${m.name}">${tico(m.icon, 2)}<em>${m.name}</em></button>`).join('');
    let ctx = '';
    if (this.mode === 'paint') {
      ctx += `<div class="tf-group">${TF_PAINTS.map((p) => {
        const url = this.swatch(p);
        const bg = url ? `background-image:url(${url})` : `background:#${p.color.toString(16).padStart(6, '0')}`;
        return `<button class="tf-swatch ${this.paint === p.id ? 'on' : ''}" data-tf-paint="${p.id}" title="${p.name}" style="${bg}"><em>${p.name}</em></button>`;
      }).join('')}</div>`;
    }
    if (this.mode !== 'name') {
      ctx += `<div class="tf-group tf-brushes">${[1, 2, 3].map((b) => `<button class="tf-brush ${this.brush === b ? 'on' : ''}" data-tf-brush="${b}" title="Brush ${b}"><i style="--s:${4 + b * 5}px"></i></button>`).join('')}</div>`;
      ctx += `<div class="tf-cost">${coin}${TF_COST[this.mode]}<small>/tile</small></div>`;
    } else ctx += '<div class="tf-hint">Tap a pond or its sign</div>';
    return `<div class="tf-panel"><div class="tf-group">${modes}</div><div class="tf-sep"></div>${ctx}</div>`;
  }

  bindPanel(box, rerender) {
    const game = this.game;
    box.querySelectorAll('[data-tf-mode]').forEach((b) => b.addEventListener('click', () => { this.mode = b.dataset.tfMode; game.audio.play('click', { volume: 0.35 }); rerender(); }));
    box.querySelectorAll('[data-tf-paint]').forEach((b) => b.addEventListener('click', () => { this.paint = +b.dataset.tfPaint; game.audio.play('tf_paint', { volume: 0.3 }); rerender(); }));
    box.querySelectorAll('[data-tf-brush]').forEach((b) => b.addEventListener('click', () => { this.brush = +b.dataset.tfBrush; game.audio.play('click', { volume: 0.3 }); rerender(); }));
  }

  // ------------------------------------------------------------ save / load
  serialize() {
    const g = this.game.grid, h = [], p = [];
    for (let i = 0; i < g.w * g.h; i++) {
      if (!g.meadow[i]) continue;
      if (g.terraEdit[i] && g.kind[i] !== KIND.WATER) h.push([i, +g.height[i].toFixed(3)]);
      if (g.paint[i]) p.push([i, g.paint[i]]);
    }
    return { h, p, ponds: this.ponds.map((q) => [q.x, q.z, q.name]) };
  }

  // call after the water tiles are restored and before the terrain rebuild
  load(d) {
    if (!d) return;
    const g = this.game.grid;
    for (const [i, v] of d.h || []) if (g.meadow[i] && g.kind[i] !== KIND.WATER) { g.height[i] = Math.max(0, Math.min(MAX_H, v)); g.terraEdit[i] = 1; }
    for (const [i, v] of d.p || []) if (g.meadow[i]) g.paint[i] = v;
    this.ponds = [];
    for (const el of this.signs.values()) el.remove();
    this.signs.clear();
    this.savedPonds = Array.isArray(d.ponds) ? d.ponds : null;
  }
}
