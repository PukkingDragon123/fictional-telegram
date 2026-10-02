// Garden plants grow from seed: seed -> sprout -> growing -> ripe (see
// src/data/crops.js). When a plant ripens it rolls a batch with a rarity like
// fish eggs (bigger yield, a chance of a special find). Tap it to harvest:
// produce goes to the food inventory, and the plant grows the next batch
// (veggies replant from seed, bushes regrow their fruit).
import { CROPS, BATCH_RARITY, GROWTH_BOOSTS } from '../data/crops.js';
import { FOOD_ITEMS } from '../data/foods.js';
import { RARITIES } from '../data/species.js';

const SEED_SPLIT = [0.22, 0.3, 0.48]; // seed / sprout / growing share of the grow time
const PERENNIAL = new Set(['berries', 'raspberry', 'strawberry', 'saskatoon', 'cranberry', 'cloudberry', 'elderberry', 'goldenberry', 'beehive', 'maple', 'mushrooms', 'wildrice']);

export class Harvest {
  constructor(game) {
    this.game = game;
    this.time = 0;
    this.boostT = 0;
    this.boosts = new Map(); // structure id -> growth multiplier (refreshed every few s)
  }

  isCrop(s) { return !!(s && CROPS[s.type]); }
  def(s) { return CROPS[s.type]; }

  // fresh plant: from seed (or straight to growing for hives / maple taps)
  init(s, { stage = null } = {}) {
    const C = CROPS[s.type];
    if (!C) return;
    const st = stage ?? (C.noSeed ? 2 : 0);
    s.crop = { stage: st, t: 0, batch: null, first: true };
    if (st === 3) this.ripen(s, true);
  }

  // seconds a stage takes for this plant (first growth vs regrowth)
  stageTime(s, stage) {
    const C = CROPS[s.type];
    const c = s.crop;
    if (C.noSeed) return stage === 2 ? (c.first ? C.grow : C.regrow) : 1;
    if (c.first) return C.grow * SEED_SPLIT[stage];
    if (PERENNIAL.has(s.type)) return stage === 2 ? C.regrow : C.regrow * 0.25;
    return C.regrow * SEED_SPLIT[stage];
  }

  progress(s) {
    const c = s.crop;
    if (!c) return 0;
    if (c.stage >= 3) return 1;
    const C = CROPS[s.type];
    const stages = C.noSeed ? [2] : !c.first && PERENNIAL.has(s.type) ? [2] : [0, 1, 2];
    let tot = 0, done = 0;
    for (const k of stages) {
      const T = this.stageTime(s, k);
      tot += T;
      if (k < c.stage) done += T;
      else if (k === c.stage) done += Math.min(T, c.t);
    }
    return tot > 0 ? done / tot : 0;
  }

  secondsLeft(s) {
    const c = s.crop;
    if (!c || c.stage >= 3) return 0;
    let left = this.stageTime(s, c.stage) - c.t;
    for (let k = c.stage + 1; k < 3; k++) left += this.stageTime(s, k);
    return Math.max(0, left / Math.max(0.05, this.rate(s)));
  }

  // growth speed: research, sprinklers, bunnies, compost, bug auras, night
  rate(s) {
    const game = this.game;
    let r = (game.mods.produceMult || 1) * (this.boosts.get(s.id) || 1);
    if (game.state.phase === 'night') r *= 0.5;
    if (game.quickCrops) r *= 8;
    return r;
  }

  refreshBoosts() {
    const L = this.game.structures.list;
    this.boosts.clear();
    for (const s of L) {
      if (!this.isCrop(s) || !s.built) continue;
      let b = this.game.structures.sprinklerBoost(s);
      for (const o of L) {
        const k = GROWTH_BOOSTS[o.type];
        if (!k || !o.built || o.type === 'sprinkler') continue;
        if (Math.abs(o.x - s.x) <= 3 && Math.abs(o.z - s.z) <= 3) b += k;
      }
      const aura = this.game.bugs?.auraAt(s.x + 0.5, s.z + 0.5);
      if (aura) b += (aura.growth || 0) * 0.5;
      this.boosts.set(s.id, Math.min(3, b));
    }
  }

  update(dt) {
    this.time += dt;
    this.boostT -= dt;
    if (this.boostT <= 0) { this.boostT = 2.5; this.refreshBoosts(); }
    const game = this.game;
    for (const s of game.structures.list) {
      if (!s.built || s.removed || !this.isCrop(s)) continue;
      if (!s.crop) this.init(s);
      const c = s.crop;
      if (c.stage >= 3) {
        // ripe: a little glint now and then so it reads as "ready"
        if (Math.random() < dt * (0.6 + (c.batch?.r || 0) * 0.5)) {
          const col = RARITIES[c.batch?.r || 0]?.glow || '#ffffff';
          game.particles.sparkle(s.x + 0.5 + (Math.random() - 0.5) * 0.5, game.structures.baseY(s) + 0.5 + Math.random() * 0.4, s.z + 0.5 + (Math.random() - 0.5) * 0.5, 1, parseInt(col.slice(1), 16));
        }
        continue;
      }
      c.t += dt * this.rate(s);
      let guard = 4;
      while (c.stage < 3 && c.t >= this.stageTime(s, c.stage) && guard--) {
        c.t -= this.stageTime(s, c.stage);
        c.stage++;
        s.popT = 0.45;
        game.structures.spritesDirty = true;
        if (c.stage === 3) this.ripen(s);
        else if (c.stage === 1) game.particles.leaf?.(s.x + 0.5, game.structures.baseY(s) + 0.3, s.z + 0.5, 0x7ad04a);
      }
    }
  }

  // roll the batch a ripe plant offers
  rollBatch(s, luck = 1) {
    const C = CROPS[s.type];
    let tot = 0;
    const w = BATCH_RARITY.map((b, i) => { const v = b.w * (i ? luck : 1); tot += v; return v; });
    let x = Math.random() * tot, r = 0;
    for (let i = 0; i < w.length; i++) { if (x < w[i]) { r = i; break; } x -= w[i]; }
    const B = BATCH_RARITY[r];
    const n = C.yield[0] + Math.floor(Math.random() * (C.yield[1] - C.yield[0] + 1)) + B.bonus;
    const special = C.special && FOOD_ITEMS[C.special] && Math.random() < B.special ? C.special : null;
    return { r, n, special };
  }

  luckFor(s) {
    // compost and bunnies improve the odds a little, so does the Lucky research
    let l = this.game.mods.cropLuck || 1;
    for (const o of this.game.structures.list) {
      if (!o.built || (o.type !== 'compost' && o.type !== 'rabbithutch')) continue;
      if (Math.abs(o.x - s.x) <= 3 && Math.abs(o.z - s.z) <= 3) l += 0.2;
    }
    return l;
  }

  ripen(s, quiet = false) {
    const game = this.game;
    const c = s.crop;
    c.stage = 3;
    c.t = 0;
    c.batch = this.rollBatch(s, this.luckFor(s));
    s.stock = 1;
    game.structures.updateVisual(s);
    game.structures.spritesDirty = true;
    if (!quiet) {
      const y = game.structures.baseY(s);
      game.particles.sparkle(s.x + 0.5, y + 0.6, s.z + 0.5, 5 + c.batch.r * 4, parseInt((RARITIES[c.batch.r].glow || '#ffffff').slice(1), 16));
      if (c.batch.r >= 3) game.audio.play('reveal_rare', { volume: 0.25 });
      game.emit('cropRipe', s);
    }
  }

  ripeList() { return this.game.structures.list.filter((s) => s.built && !s.removed && s.crop?.stage === 3); }

  // tap a ripe plant: everything goes into the food inventory
  harvest(s) {
    const game = this.game;
    const c = s.crop;
    if (!c || c.stage !== 3 || !c.batch) return null;
    const C = CROPS[s.type];
    const b = c.batch;
    const items = [{ id: C.item, count: b.n, rarity: b.r, special: false }];
    game.foodStore.add(C.item, b.n);
    if (b.special) { game.foodStore.add(b.special, 1); items.push({ id: b.special, count: 1, rarity: Math.max(b.r, FOOD_ITEMS[b.special].rarity || 3), special: true }); }
    const st = game.state;
    st.harvested ||= {};
    for (const it of items) st.harvested[it.id] = (st.harvested[it.id] || 0) + it.count;
    game.stats.harvests = (game.stats.harvests || 0) + 1;
    // next batch
    c.batch = null;
    c.first = false;
    c.t = 0;
    c.stage = C.noSeed || PERENNIAL.has(s.type) ? 2 : 0;
    s.stock = 0;
    s.popT = 0.45;
    game.structures.updateVisual(s);
    game.structures.spritesDirty = true;
    const y = game.structures.baseY(s);
    game.particles.leaf?.(s.x + 0.5, y + 0.5, s.z + 0.5, 0x7ad04a);
    game.particles.popIn(s.x + 0.5, y + 0.4, s.z + 0.5, 0.8);
    if (b.special || b.r >= 3) game.particles.confetti(s.x + 0.5, y + 0.8, s.z + 0.5, 24);
    game.audio.play(b.special ? 'harvest_special' : 'harvest_pop', { volume: 0.5 });
    game.ui?.onHarvest?.(s, items);
    game.emit('harvested', { s, items });
    return items;
  }

  // overnight: plants keep growing (batches wait in the morning)
  simulate(T) {
    for (const s of this.game.structures.list) {
      if (!s.built || !this.isCrop(s)) continue;
      if (!s.crop) this.init(s);
      const c = s.crop;
      let t = T * 0.5 * (this.game.mods.produceMult || 1);
      let guard = 4;
      while (c.stage < 3 && guard--) {
        const need = this.stageTime(s, c.stage) - c.t;
        if (t < need) { c.t += t; break; }
        t -= need;
        c.t = 0;
        c.stage++;
        if (c.stage === 3) this.ripen(s, true);
      }
    }
  }

  serialize(s) { return s.crop ? [s.crop.stage, +s.crop.t.toFixed(1), s.crop.batch ? [s.crop.batch.r, s.crop.batch.n, s.crop.batch.special || 0] : 0, s.crop.first ? 1 : 0] : null; }

  restore(s, d) {
    if (!this.isCrop(s)) return;
    if (!d) { this.init(s, { stage: 2 }); return; } // older saves: plants are already grown
    const [stage, t, batch, first] = d;
    s.crop = { stage, t, batch: batch ? { r: batch[0], n: batch[1], special: batch[2] || null } : null, first: !!first };
    if (stage === 3 && !s.crop.batch) this.ripen(s, true);
    s.stock = stage === 3 ? 1 : 0;
  }
}

export { PERENNIAL };
