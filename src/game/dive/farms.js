// [v32 dive] The underwater fish farms (logic only; the dive mode draws them).
// Saved in game.state.dive.farms = [{ id, type, x, z, stock?, pearl, pearlT, eggs, eggT, note }].
//   pens / cages : stock(f, species) -> fingerlings grow in game time (+ boosts from kelp
//                  nurseries, feeders and mussel beds in range, + NIGHT_GROW each night),
//                  harvest(f, 'pond' | 'sell') -> live adults into your pond, or coins
//   mussel beds  : grow a pearl every pearlT (up to 3 waiting), collect -> coins
//   the hatchery : a rare egg every eggT (up to 2 waiting), collect -> your egg tray / pond
// Events: diveBuild { type }, diveStock { type, species }, diveHarvest { type, species, n, mode, coins }, divePearl, diveEgg
import { FARMS, NIGHT_GROW } from '../../data/dive.js';
import { SPECIES_BY_ID } from '../../data/species.js';
import { rollGenes, rarityOf } from '../genes.js';
import { FARM_AREA, DEEP_X } from '../../entities/diveScene.js';

const pickW = (list) => {
  let x = Math.random() * list.reduce((a, [, w]) => a + w, 0);
  for (const [id, w] of list) { x -= w; if (x <= 0) return id; }
  return list[0][0];
};

export class DiveFarms {
  constructor(sys) {
    this.sys = sys;
    this.game = sys.game;
  }
  get S() { return this.sys.S; }
  get list() { return this.S.farms; }
  def(f) { return FARMS[f.type]; }

  /** coins for one farm-grown fish of a species (a fat, healthy one) */
  fishValue(sp) {
    const S = SPECIES_BY_ID[sp];
    if (!S) return 10;
    return Math.max(6, Math.round(S.price * 0.55 + S.meal * S.value * 4));
  }
  unlocked(type) { const d = FARMS[type]; return !!d && (!d.research || (this.game.state.research || []).includes(d.research)); }
  count(type) { return this.list.filter((f) => f.type === type).length; }

  // ------------------------------------------------------------------ building
  /** why a farm can't go at (x, z) (null = ok) */
  canPlace(type, x, z, scene) {
    const d = FARMS[type];
    if (!d) return 'Unknown';
    if (d.fixed) return this.count(type) ? 'Already restored' : null;
    const A = FARM_AREA;
    if (x < A.x0 || x > A.x1 || z < A.z0 || z > A.z1) return 'Too far from the farm sands';
    for (const f of this.list) {
      const fd = FARMS[f.type];
      if (fd.fixed) continue;
      if (Math.hypot(f.x - x, f.z - z) < fd.r + d.r + 0.25) return 'Too close to another farm';
    }
    for (const o of scene?.obstacles || []) if (Math.hypot(o.x - x, o.z - z) < o.r + d.r * 0.8) return 'Rocks in the way';
    return null;
  }
  build(type, x, z, { free = false, scene = null } = {}) {
    const g = this.game, d = FARMS[type];
    if (!d) return null;
    if (!this.unlocked(type) && !free) { g.notify?.(`Research ${d.name} in the Lab first.`, 'no'); return null; }
    if (d.fixed) { const b = scene?.anchors?.barge; x = b ? b.x : DEEP_X + 8; z = b ? b.z : -3; }
    const why = this.canPlace(type, x, z, scene);
    if (why) { g.notify?.(why + '!', 'no'); g.audio?.play?.('error', { volume: 0.4 }); return null; }
    if (!free && !g.spend(d.cost, 'builds')) return null;
    const f = { id: this.S.nextId++, type, x: +x.toFixed(2), z: +z.toFixed(2), day: g.state.day, stock: null, pearl: 0, pearlT: 0, eggs: 0, eggT: 0 };
    this.list.push(f);
    g.emit('diveBuild', { type, id: f.id });
    g.save?.();
    return f;
  }
  remove(f) {
    const d = this.def(f);
    const i = this.list.indexOf(f);
    if (i < 0) return;
    this.list.splice(i, 1);
    const back = Math.floor(d.cost * 0.5);
    if (back) this.game.earnMisc?.(back, 'refunds');
    this.game.save?.();
  }

  // ------------------------------------------------------------------ pens + cages
  stockPrice(f, sp) {
    const d = this.def(f);
    const e = (d.stock || []).find(([id]) => id === sp);
    return e ? e[1] * d.cap : null;
  }
  stock(f, sp) {
    const g = this.game, d = this.def(f);
    if (d.kind !== 'pen' || f.stock) return false;
    const price = this.stockPrice(f, sp);
    if (price == null) return false;
    if (!g.spend(price, 'eggs')) return false;
    f.stock = { sp, n: d.cap, t: 0, need: d.grow };
    f.note = 0;
    g.audio?.play?.('splash', { volume: 0.4 });
    g.emit('diveStock', { type: f.type, species: sp });
    g.save?.();
    return true;
  }
  /** pens + cages: growth speed multiplier from boosters in range */
  rate(f) {
    let k = 1;
    for (const b of this.list) {
      const d = FARMS[b.type];
      if (!d.boost || b === f) continue;
      if (Math.hypot(b.x - f.x, b.z - f.z) <= d.radius) k += d.boost;
    }
    return Math.min(3, k);
  }
  progress(f) { return f.stock ? Math.min(1, f.stock.t / f.stock.need) : 0; }
  ready(f) { return !!f.stock && f.stock.t >= f.stock.need; }
  harvestValue(f) { return f.stock ? f.stock.n * this.fishValue(f.stock.sp) : 0; }
  harvest(f, mode = 'sell') {
    const g = this.game;
    if (!this.ready(f)) return null;
    const { sp, n } = f.stock;
    let sent = 0, coins = 0;
    if (mode === 'pond') {
      const room = Math.max(0, Math.floor((g.fish?.capacity?.() ?? 99) - (g.fish?.count ?? 0)));
      for (let i = 0; i < n; i++) {
        if (sent >= Math.max(room, 0)) break;
        const p = g.fish?.randomWaterPoint?.();
        if (!p) break;
        const genes = rollGenes(sp, g.mods, { luck: 1.2 });
        genes.size = Math.max(genes.size, 1.02);
        const fish = g.fish.spawn(sp, p.x, p.z, { adult: true, hunger: 0.4, g: genes, splash: true });
        if (fish) { sent++; if (!g.state.discovered.includes(sp)) g.state.discovered.push(sp); }
      }
    }
    const rest = n - sent;
    if (rest > 0) { coins = rest * this.fishValue(sp); g.earnMisc?.(coins, 'sales'); }
    f.stock = null;
    this.S.harvests = (this.S.harvests || 0) + 1;
    g.audio?.play?.(coins ? 'coins' : 'fish_flop', { volume: 0.5 });
    g.emit('diveHarvest', { type: f.type, species: sp, n, sent, coins, mode });
    g.save?.();
    return { sp, n, sent, coins };
  }

  // ------------------------------------------------------------------ pearls + eggs
  collectPearl(f) {
    const g = this.game, d = this.def(f);
    if (!f.pearl) return 0;
    let coins = 0;
    for (let i = 0; i < f.pearl; i++) coins += Math.round(d.pearl[0] + Math.random() * (d.pearl[1] - d.pearl[0]));
    f.pearl = 0;
    this.S.pearls = (this.S.pearls || 0) + 1;
    g.earnMisc?.(coins, 'sales');
    g.audio?.play?.('reveal_rare', { volume: 0.4 });
    g.emit('divePearl', { coins });
    g.save?.();
    return coins;
  }
  collectEgg(f) {
    const g = this.game, d = this.def(f);
    if (!f.eggs) return null;
    const sp = pickW(d.eggs);
    const genes = rollGenes(sp, g.mods, { luck: 2.2 });
    const st = g.state;
    f.eggs--;
    const rarity = rarityOf(genes.stars);
    if ((st.eggTray || []).length < (g.eggSlots?.() ?? 2)) {
      const t = [40, 60, 85, 115, 150][rarity] / (g.hatchSpeed?.() || 1);
      st.eggTray.push({ uid: 900000 + Math.floor(Math.random() * 90000), species: sp, g: genes, rarity, t, total: t, mystery: false });
      g.ui?.onEggBought?.(st.eggTray[st.eggTray.length - 1]);
    } else {
      try { g.fish.addBoughtEgg(sp, genes, 60); } catch { /* ignore */ }
    }
    g.audio?.play?.('egg_wobble', { volume: 0.45 });
    g.emit('diveEgg', { species: sp });
    g.save?.();
    return { sp, rarity };
  }

  // ------------------------------------------------------------------ time
  tick(dt) {
    if (!(dt > 0) || !this.list.length) return;
    for (const f of this.list) {
      const d = this.def(f);
      if (!d) continue;
      if (d.kind === 'pen' && f.stock && f.stock.t < f.stock.need) {
        f.stock.t += dt * this.rate(f);
        if (f.stock.t >= f.stock.need && !f.note) {
          f.note = 1;
          this.game.notify?.(`Your ${d.name} is full of grown ${SPECIES_BY_ID[f.stock.sp]?.name || 'fish'}! Dive down and harvest.`, 'excited', { dur: 4 });
        }
      } else if (d.kind === 'pearl' && f.pearl < 3) {
        f.pearlT += dt;
        if (f.pearlT >= d.pearlT) { f.pearlT = 0; f.pearl++; }
      } else if (d.kind === 'eggs' && f.eggs < 2) {
        f.eggT += dt;
        if (f.eggT >= d.eggT) { f.eggT = 0; f.eggs++; this.game.notify?.('The hatchery barge has a fresh egg for you!', 'happy', { dur: 3.5 }); }
      }
    }
  }
  /** the night passes: everything grows a little more */
  night() { this.tick(NIGHT_GROW); }
}
