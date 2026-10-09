// [v26 world] The water system (game.waterworks). Digging (Terraform > Dig) no
// longer turns land into water on the spot: it cuts a dry channel, and water
// runs into it from whatever it touches (your pond, the river, a creek), one
// tile after the other, with a splash at the front. A channel dug off the
// river carries the current in (water wheels get a flow: world.riverAt).
// A hole that touches no water fills from the ground after a little while
// (rain and springs), then spreads the same way - so digging a new pond works
// as before, just with a moment of suspense.
//
// Beaver dams and closed sluice gates stop the water: a channel won't fill
// through one, and a dam across a flowing channel backs the water up - the
// low, empty ground on its upstream side floods into a beaver pond. Pull the
// dam out and the backwater drains away.
//
// State: game.state.waterworks = { dry: [tile], flooded: [[tile, damKey]] }.
import { KIND, N4 } from '../../world/grid.js';
import { refreshWaterHeights } from '../../world/worldgen.js';

const DRY_Y = -0.35; // a fresh ditch
const STEP_T = 0.55; // seconds per tile of spreading
const SEEP_T = 6; // a hole on its own fills from the ground after this long
const BACKUP_T = 2.5, BACKUP_MAX = 8, BACKUP_R = 3;

export function install(game) { return new Waterworks(game); }

class Waterworks {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.backT = 0;
    this.age = new Map(); // dry tile -> seconds waiting
    this.dirty = false;
    this.rebuildT = 0;
  }

  get S() {
    const st = this.game.state;
    if (!st.waterworks || typeof st.waterworks !== 'object') st.waterworks = { dry: [], flooded: [] };
    const S = st.waterworks;
    if (!Array.isArray(S.dry)) S.dry = [];
    if (!Array.isArray(S.flooded)) S.flooded = [];
    return S;
  }

  onNewGame() { this.age.clear(); }
  onLoad() {
    // re-cut the saved channels (the save only keeps meadow water and heights)
    const g = this.game.grid;
    const S = this.S;
    S.dry = S.dry.filter((i) => g.meadow[i] && g.kind[i] !== KIND.WATER && g.occ[i] < 0);
    for (const i of S.dry) { g.kind[i] = KIND.DIRT; g.height[i] = DRY_Y; }
    S.flooded = S.flooded.filter(([i]) => g.meadow[i]);
    this.age.clear();
    if (S.dry.length) { this.game.world.rebuildTerrain(); }
  }

  // Terraform: dig this tile. true = we took it (a dry channel); false = do it the old way
  dig(i) {
    const g = this.game.grid;
    if (!g.meadow[i] || g.kind[i] === KIND.WATER) return false;
    if (g.kind[i] === KIND.DIRT && g.height[i] <= DRY_Y + 0.01) return true;
    g.kind[i] = KIND.DIRT;
    g.height[i] = DRY_Y;
    if (!this.S.dry.includes(i)) this.S.dry.push(i);
    this.age.set(i, 0);
    this.t = Math.min(this.t, 0.15);
    return true;
  }

  isDry(i) { return this.S.dry.includes(i); }

  // a tile water can come from (blocked by a built dam / closed gate)
  wet(x, z) {
    const g = this.game.grid;
    if (!g.isWater(x, z)) return false;
    const s = g.structAt(x, z);
    return !(s && s.built && s.def.blocksFish && !(s.def.gate && s.open));
  }

  update(simDt, dt) {
    const game = this.game, g = game.grid;
    const S = this.S;
    const step = simDt > 0 ? simDt : 0;
    if (S.dry.length && step > 0) {
      for (const i of S.dry) this.age.set(i, (this.age.get(i) || 0) + step);
      this.t -= step;
      if (this.t <= 0) { this.t = STEP_T; this.spread(); }
    }
    if (step > 0) {
      this.backT -= step;
      if (this.backT <= 0) { this.backT = BACKUP_T; this.backups(); }
    }
    this.rebuildT -= dt || 0;
    if (this.dirty && this.rebuildT <= 0) {
      this.dirty = false;
      this.rebuildT = 0.35;
      refreshWaterHeights(g);
      game.world.rebuildTerrain();
      game.onTopologyChanged?.();
    }
  }

  // one ring of water creeps into the dry channels
  spread() {
    const game = this.game, g = game.grid, S = this.S;
    const fill = [];
    for (const i of S.dry) {
      if (g.kind[i] === KIND.WATER) { fill.push([i, null]); continue; }
      if (g.kind[i] !== KIND.DIRT || g.height[i] > -0.1 || !g.meadow[i]) { fill.push([i, 'cancel']); continue; } // filled back in / raised
      const x = i % g.w, z = (i / g.w) | 0;
      let src = null;
      for (const [dx, dz] of N4) if (this.wet(x + dx, z + dz)) { src = [x + dx, z + dz]; break; }
      if (src) fill.push([i, src]);
    }
    // nothing to run in from: the oldest lonely hole fills from the ground
    if (!fill.length && S.dry.length) {
      let best = -1, ba = SEEP_T;
      for (const i of S.dry) { const a = this.age.get(i) || 0; if (a >= ba) { ba = a; best = i; } }
      if (best >= 0) fill.push([best, 'seep']);
    }
    if (!fill.length) return;
    let n = 0;
    for (const [i, src] of fill) {
      S.dry = S.dry.filter((j) => j !== i);
      this.age.delete(i);
      if (src === 'cancel') { if (g.kind[i] === KIND.DIRT && g.height[i] > -0.1) g.kind[i] = KIND.GRASS; this.dirty = true; continue; }
      if (src === null) continue;
      g.kind[i] = KIND.WATER;
      g.height[i] = 0;
      g.paint[i] = 0;
      const x = i % g.w, z = (i / g.w) | 0;
      // the current comes along from a river
      if (Array.isArray(src) && g.flowS) {
        const si = src[1] * g.w + src[0];
        const sp = g.flowS[si] * 0.75;
        if (sp > 0.08) { const dx = x - src[0], dz = z - src[1]; g.flowX[i] = dx * 0.6 + g.flowX[si] * 0.4; g.flowZ[i] = dz * 0.6 + g.flowZ[si] * 0.4; const L = Math.hypot(g.flowX[i], g.flowZ[i]) || 1; g.flowX[i] /= L; g.flowZ[i] /= L; g.flowS[i] = sp; }
      }
      if (n++ < 3) {
        game.particles?.splash?.(x + 0.5, z + 0.5, 6, 0.6);
        game.world.sim?.disturb?.(x + 0.5, z + 0.5, 0.5, 0.25);
      }
      this.dirty = true;
    }
    if (n) game.audio?.play?.('splash', { volume: 0.22, pitch: 1.2 + Math.random() * 0.3 });
    if (n) game.emit('waterSpread', n);
  }

  // dams across flowing water back it up; gone dams let the backwater drain
  backups() {
    const game = this.game, g = game.grid, S = this.S;
    const dams = [];
    for (const s of game.structures?.list || []) {
      if (!s.built || !s.def?.blocksFish || (s.def.gate && s.open) || s.type === 'lodge') continue;
      if (!g.isWater(s.x, s.z)) continue;
      // flowing water at or right next to it
      let fx = 0, fz = 0, sp = 0;
      for (const [dx, dz] of [[0, 0], ...N4]) {
        const x = s.x + dx, z = s.z + dz;
        if (!g.inb(x, z) || !g.flowS) continue;
        const i = z * g.w + x;
        if (g.flowS[i] > sp) { sp = g.flowS[i]; fx = g.flowX[i]; fz = g.flowZ[i]; }
      }
      if (sp > 0.08) dams.push({ s, fx, fz, key: `${s.type}@${s.x},${s.z}` });
      if (g.flowS) g.flowS[s.z * g.w + s.x] = 0; // the current stops at the dam
    }
    const live = new Set(dams.map((d) => d.key));
    // drain the backwater of dams that are gone
    const keep = [];
    let drained = 0;
    for (const f of S.flooded) {
      const [i, key] = f;
      if (live.has(key)) { keep.push(f); continue; }
      if (drained < 2 && g.kind[i] === KIND.WATER && !game.fish?.list.some((q) => !q.tank && Math.floor(q.z) * g.w + Math.floor(q.x) === i)) {
        g.kind[i] = KIND.GRASS; g.height[i] = 0; drained++; this.dirty = true;
        continue;
      }
      keep.push(f);
    }
    S.flooded = keep;
    // back up behind the live ones: one tile at a time
    for (const d of dams) {
      const mine = S.flooded.filter((f) => f[1] === d.key).length;
      if (mine >= BACKUP_MAX) continue;
      let best = -1, bd = 1e9;
      for (let dz = -BACKUP_R; dz <= BACKUP_R; dz++)
        for (let dx = -BACKUP_R; dx <= BACKUP_R; dx++) {
          const x = d.s.x + dx, z = d.s.z + dz;
          if (!g.inb(x, z) || dx * d.fx + dz * d.fz > -0.3) continue; // upstream side only
          const i = z * g.w + x;
          if (!g.meadow[i] || g.kind[i] === KIND.WATER || g.kind[i] === KIND.TRAIL || g.deco[i] !== -1 || g.occ[i] !== -1 || g.height[i] > 0.3) continue;
          if (!g.hasWaterNeighbor(x, z)) continue;
          const dd = dx * dx + dz * dz;
          if (dd < bd) { bd = dd; best = i; }
        }
      if (best < 0) continue;
      g.kind[best] = KIND.WATER; g.height[best] = 0; g.paint[best] = 0;
      S.flooded.push([best, d.key]);
      const x = best % g.w, z = (best / g.w) | 0;
      game.particles?.splash?.(x + 0.5, z + 0.5, 5, 0.5);
      this.dirty = true;
    }
  }
}
