// Chip the woodpecker's workshop: turn wood (from chopped trees and fallen
// logs) and forest finds into furniture, and repair the broken antiques you
// find in the forest ruins. Jobs run in REAL time (minutes) on 3 workbench
// slots, keep running while you play (or are away) and wait to be collected.
// Finished pieces go to the build inventory (Build ▸ Woodwork tab).
// The screen itself is src/ui/Workshop.js.
import { STRUCTURES } from '../data/structures.js';
import { WOOD_RECIPES, REPAIRS } from '../data/structures14.js';

const SLOTS = 3;
const comps = import.meta.glob('../ui/Workshop.js', { eager: true });
const UIW = comps['../ui/Workshop.js'] || null;

export class Workshop {
  constructor(game) {
    this.game = game;
    this.view = null;
    this.tickT = 1;
  }

  get S() {
    const st = this.game.state;
    st.wood ||= 0;
    return (st.workshop ||= { jobs: [], made: 0, nextId: 1 });
  }

  have(id) {
    if (id === 'wood') return Math.floor(this.game.state.wood || 0);
    if (id.startsWith('ruin_')) return this.game.state.inventory?.[id] || 0;
    return this.game.foodStore.count(id);
  }

  materials() {
    const out = {};
    for (const id of ['pinecone', 'resin', 'fiddlehead', 'wildberry', 'ramps', 'morel']) {
      const info = this.game.foodStore.info(id);
      out[id] = { name: info?.name || id, icon: info?.icon || id, have: this.have(id) };
    }
    return out;
  }

  recipes() {
    const list = [];
    for (const r of WOOD_RECIPES) {
      const d = STRUCTURES[r.id];
      if (!d) continue;
      list.push({ id: r.id, kind: 'craft', name: d.name, icon: d.icon, desc: d.desc, cost: r.cost, time: r.time, locked: null });
    }
    for (const r of REPAIRS) {
      const d = STRUCTURES[r.id];
      if (!d) continue;
      const n = this.have(r.ruin);
      list.push({ id: r.id, kind: 'repair', name: d.name, ruin: r.ruin, ruinName: r.ruinName, icon: d.icon, desc: `Fix the ${r.ruinName} you found in the forest.`, cost: { ...r.cost, [r.ruin]: 1 }, time: r.time, locked: n > 0 ? null : `Find a ${r.ruinName} in the forest ruins` });
    }
    return list;
  }

  jobs() {
    const now = Date.now();
    return this.S.jobs.map((j) => ({ ...j, name: STRUCTURES[j.recipeId]?.name || j.recipeId, done: now >= j.end }));
  }

  craft(id) {
    const game = this.game;
    const r = this.recipes().find((x) => x.id === id);
    if (!r) return { ok: false, msg: 'Unknown plan' };
    if (r.locked) return { ok: false, msg: r.locked };
    if (this.S.jobs.length >= SLOTS) return { ok: false, msg: 'All benches are busy! Collect something first.' };
    for (const [k, n] of Object.entries(r.cost)) if (this.have(k) < n) return { ok: false, msg: `Need ${n} ${this.label(k)} (have ${this.have(k)})` };
    for (const [k, n] of Object.entries(r.cost)) this.take(k, n);
    const now = Date.now();
    const time = r.time * (game.quickCraft ? 0.02 : 1);
    this.S.jobs.push({ id: this.S.nextId++, recipeId: id, kind: r.kind, start: now, end: now + time * 1000 });
    game.audio.play('hammer', { volume: 0.45 });
    game.emit('craftStart', { id, kind: r.kind });
    game.save();
    return { ok: true, msg: r.kind === 'repair' ? 'Repair started!' : 'On the bench!' };
  }

  collect(jobId) {
    const game = this.game;
    const S = this.S;
    const j = S.jobs.find((x) => x.id === jobId);
    if (!j) return { ok: false, msg: 'Gone?' };
    if (Date.now() < j.end) return { ok: false, msg: 'Still working on it!' };
    S.jobs = S.jobs.filter((x) => x !== j);
    const inv = (game.state.inventory ||= {});
    inv[j.recipeId] = (inv[j.recipeId] || 0) + 1;
    S.made = (S.made || 0) + 1;
    game.emit('inventory', inv);
    game.emit('crafted', { id: j.recipeId, kind: j.kind });
    game.audio.play('levelup', { volume: 0.4 });
    game.save();
    return { ok: true, msg: `${STRUCTURES[j.recipeId]?.name || 'It'} is ready! Place it from Build ▸ Woodwork.` };
  }

  take(id, n) {
    const st = this.game.state;
    if (id === 'wood') st.wood = Math.max(0, (st.wood || 0) - n);
    else if (id.startsWith('ruin_')) { st.inventory[id] = Math.max(0, (st.inventory[id] || 0) - n); if (!st.inventory[id]) delete st.inventory[id]; }
    else this.game.foodStore.take(id, n);
  }

  label(id) {
    if (id === 'wood') return 'wood';
    if (id.startsWith('ruin_')) return REPAIRS.find((r) => r.ruin === id)?.ruinName || id;
    return this.game.foodStore.info(id)?.name || id;
  }

  addWood(n, x = null, z = null) {
    const st = this.game.state;
    st.wood = (st.wood || 0) + n;
    if (x != null) this.game.ui?.floatTextAt?.(x, 1, z, `+${n} wood`, '#e8c08a');
    this.game.emit('wood', st.wood);
  }

  data() {
    return { wood: this.have('wood'), materials: this.materials(), recipes: this.recipes(), jobs: this.jobs() };
  }

  open() {
    const game = this.game;
    if (this.view) return;
    if (!UIW?.openWorkshop) { game.notify('Chip: "Workshop\'s a mess. Come back later!"', 'no'); return; }
    const wasPaused = game.state.paused;
    game.state.paused = true;
    const icon = (n, sc) => game.ui?.icon?.(n, sc) || '';
    this.view = UIW.openWorkshop(game.ui?.root || document.body, {
      ...this.data(),
      slots: SLOTS,
      chat: ['Tok-tok! What are we making?', 'Wood from fallen logs and chopped trees.', 'Good things take time. Come back later!', 'Found a broken antique? I can fix it!'],
      art: (id) => game.ui?.structureArt?.(id) || null,
      icon,
      sfx: (n, o) => game.audio.play(n, { volume: 0.45, ...(o || {}) }),
      onCraft: (id) => { const r = this.craft(id); this.view?.refresh?.(this.data()); return r; },
      onCollect: (jid) => { const r = this.collect(jid); this.view?.refresh?.(this.data()); return r; },
      onClose: () => { this.view = null; game.state.paused = wasPaused; },
    });
    game.emit('workshopOpen');
  }

  // live countdowns, and a heads-up when something finishes while you play
  update(dt) {
    this.tickT -= dt;
    if (this.tickT > 0) return;
    this.tickT = 1;
    const now = Date.now();
    for (const j of this.S.jobs) {
      if (now >= j.end && !j.told) {
        j.told = true;
        this.game.notify(`Chip: "Your ${STRUCTURES[j.recipeId]?.name || 'order'} is done! Come pick it up."`, 'excited', { dur: 4 });
        this.game.audio.play('bell', { volume: 0.35 });
      }
    }
    if (this.view) this.view.refresh?.(this.data());
  }
}
