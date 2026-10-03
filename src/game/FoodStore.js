// The food inventory (state.food = { id: count }) and what you do with it.
// Pick a bag or harvest item with the Food tool, then:
//   tap the water        -> throw a scoop to the fish (each food has its own effects)
//   tap a Snack Bowl /   -> stock it with servings for bears
//     the Pantry
//   tap the Beaver       -> stock it so the beavers get paid (no pay, no work!)
//     Snack Bar
// Reynard's Classic Pellets trickle back by themselves when you run low, so
// nobody is ever completely stuck.
import { FOOD_ITEMS, BAG_IDS, STARTING_FOOD, STORAGE } from '../data/foods.js';

const FILL_PER_TAP = 4; // servings moved into a bowl per tap

export class FoodStore {
  constructor(game) {
    this.game = game;
    this.refillT = 0;
    this.cd = 0;
  }

  get inv() { return (this.game.state.food ||= { ...STARTING_FOOD }); }
  get selected() {
    const id = this.game.state.foodSel;
    return FOOD_ITEMS[id] ? id : 'pellets';
  }

  count(id) { return Math.floor(this.inv[id] || 0); }
  info(id) { return FOOD_ITEMS[id] || null; }

  add(id, n = 1) {
    if (!FOOD_ITEMS[id] || n <= 0) return;
    const inv = this.inv;
    inv[id] = (inv[id] || 0) + n;
    const seen = (this.game.state.foodSeen ||= []);
    if (!seen.includes(id)) seen.push(id);
    this.game.emit('food', { id, n });
  }

  take(id, n = 1) {
    if (this.count(id) < n) return false;
    const inv = this.inv;
    inv[id] -= n;
    if (inv[id] <= 0 && !BAG_IDS.includes(id)) delete inv[id];
    this.game.emit('food', { id, n: -n });
    return true;
  }

  select(id) {
    if (!FOOD_ITEMS[id]) return;
    this.game.state.foodSel = id;
    this.game.emit('foodSel', id);
  }

  unlocked(id) {
    const f = FOOD_ITEMS[id];
    if (!f) return false;
    if (f.kind !== 'bag') return true;
    return this.game.isUnlocked(f.unlock || 'start');
  }

  // everything the picker shows: bags (owned, empty or still locked) then
  // made food, produce and specials you actually have
  items() {
    const out = [];
    for (const id of BAG_IDS) {
      const f = FOOD_ITEMS[id];
      const n = this.count(id);
      if (f.kind === 'made' && n <= 0 && !this.game.structures.countBuilt('buggrinder')) continue;
      out.push({ id, count: n, locked: !this.unlocked(id) });
    }
    for (const [id, n] of Object.entries(this.inv)) {
      const f = FOOD_ITEMS[id];
      if (!f || f.material || BAG_IDS.includes(id) || n < 1) continue; // pinecones & resin are for Chip, not fish
      out.push({ id, count: Math.floor(n), locked: false });
    }
    return out;
  }

  // the free pellet trickle + throw cooldown
  update(dt) {
    this.cd = Math.max(0, this.cd - dt);
    const R = FOOD_ITEMS.pellets.refill;
    if (this.count('pellets') < R.upTo) {
      this.refillT += dt * Math.max(1, this.game.mods.bagBonus || 1);
      if (this.refillT >= R.every) { this.refillT = 0; this.inv.pellets = (this.inv.pellets || 0) + 1; this.game.emit('food', { id: 'pellets', n: 1, refill: true }); }
    } else this.refillT = 0;
  }

  // ------------------------------------------------------------ fish
  // throw one scoop of the selected food at a water point
  throwAt(x, z, id = this.selected) {
    const game = this.game;
    const f = FOOD_ITEMS[id];
    if (!f) return false;
    if (!f.fish) { game.notify(`${f.name}: not fish food! Put it in a Snack Bowl.`, 'no'); return false; }
    if (this.cd > 0) return false;
    if (!this.take(id, 1)) {
      game.audio.play('bag_empty', { volume: 0.4 });
      game.ui?.onFoodEmpty?.(id);
      return false;
    }
    this.cd = 0.12;
    game.fox.goToward(x, z);
    const h = game.fox.handPos();
    game.fox.react('throw', 0.4);
    const n = f.kind === 'bag' || f.kind === 'made' ? 6 : 4;
    game.food.throwHandful(h.x, h.y, h.z, x, z, n, 0.6, id);
    game.audio.play('scoop', { volume: 0.35, pitch: 0.9 + Math.random() * 0.2 });
    game.ui?.foodPicker?.pulse?.(id);
    game.emit('fed', { x, z, id });
    return true;
  }

  // ------------------------------------------------------------ storage
  isStorage(s) { return !!(s && s.built && !s.removed && STORAGE[s.type]); }
  storeOf(s) { return (s.store ||= {}); }
  stored(s) { let n = 0; for (const v of Object.values(s.store || {})) n += v; return n; }
  room(s) { return (STORAGE[s.type]?.cap || 0) - this.stored(s); }

  // move servings of `id` into a bowl / pantry / snack bar
  fillStorage(s, id = this.selected) {
    const game = this.game;
    const f = FOOD_ITEMS[id];
    const S = STORAGE[s.type];
    if (!f || !S) return false;
    const fits = S.for === 'beaver' ? !!f.beaver : !!f.bear;
    if (!fits) {
      game.notify(S.for === 'beaver' ? `Beavers won't take ${f.name}. Try veggies, berries or Bug Bites!` : `Bears won't eat ${f.name}. Use garden produce!`, 'no');
      game.audio.play('error', { volume: 0.3 });
      return false;
    }
    const room = this.room(s);
    if (room <= 0) { game.notify('It\'s full!', 'no'); return false; }
    const n = Math.min(room, FILL_PER_TAP, this.count(id));
    if (n <= 0) { game.ui?.onFoodEmpty?.(id); game.audio.play('error', { volume: 0.3 }); return false; }
    this.take(id, n);
    const st = this.storeOf(s);
    st[id] = (st[id] || 0) + n;
    game.structures.updateVisual(s);
    const y = game.structures.baseY(s);
    game.particles.popIn(s.x + 0.5, y + 0.5, s.z + 0.5, 0.6);
    game.audio.play('bowl_fill', { volume: 0.45 });
    game.ui?.floatTextAt(s.x + 0.5, y + 1.1, s.z + 0.5, `+${n} ${f.name}`, '#fff3a0');
    game.emit('stocked', { s, id, n });
    if (S.for === 'beaver') game.beavers.onPaid?.(s);
    return true;
  }

  // take one serving out (pick: (id, info) -> score, higher is better; null = any)
  takeFrom(s, pick = null) {
    const st = s.store;
    if (!st) return null;
    let best = null, bs = -Infinity;
    for (const [id, n] of Object.entries(st)) {
      if (n < 1) continue;
      const sc = pick ? pick(id, FOOD_ITEMS[id]) : 0;
      if (sc > bs) { bs = sc; best = id; }
    }
    if (!best) return null;
    st[best]--;
    if (st[best] <= 0) delete st[best];
    this.game.structures.updateVisual(s);
    return best;
  }

  // nearest stocked storage of a kind ('bear' / 'beaver') with a matching item
  nearestStore(kind, x, z, filter = null) {
    let best = null, bd = Infinity;
    for (const s of this.game.structures.list) {
      if (!this.isStorage(s) || STORAGE[s.type].for !== kind) continue;
      if (this.stored(s) < 1) continue;
      if (filter && !Object.keys(s.store).some((id) => s.store[id] >= 1 && filter(id, FOOD_ITEMS[id]))) continue;
      const d = (s.x + 0.5 - x) ** 2 + (s.z + 0.5 - z) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // all servings for bears waiting in bowls (HUD / encyclopedia)
  total(kind) {
    let n = 0;
    for (const s of this.game.structures.list) if (this.isStorage(s) && STORAGE[s.type].for === kind) n += this.stored(s);
    return n;
  }
}
