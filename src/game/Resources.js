// [F&S mining] Resources: the "Flint & Steel" inventory of raw ore and crafted
// parts, kept in game.state.res (saved with the state).
//
//   game.res.add(id, n, x?, z?)   add n (x/z: world spot for a little "+n" pop)
//   game.res.take(id, n)          remove n if you have them -> true / false
//   game.res.has(id, n = 1)       -> bool
//   game.res.count(id)            -> number
//   game.res.seen(id)             found at least once (the HUD strip only shows these)
//   game.res.found()              ids found so far, in RES_IDS order
//   game.res.takeAll({ id: n })   take a whole bill at once (all or nothing)
//   game.res.hasAll({ id: n })
// Every change emits game 'res' { id, n (signed), total, x?, z? }.
// RES_INFO[id] = { name, icon (UI sprite name, src/ui/icons/oreIcons.js), color, value (coins each), kind }
export const RES_IDS = ['stone', 'coal', 'copper', 'iron', 'gold', 'crystal', 'ingot_copper', 'ingot_iron', 'ingot_gold', 'gear', 'plate', 'circuit'];

export const RES_INFO = {
  stone: { name: 'Stone', icon: 'res_stone', color: '#9a929c', value: 1, kind: 'ore' },
  coal: { name: 'Coal', icon: 'res_coal', color: '#3c3a44', value: 2, kind: 'ore' },
  copper: { name: 'Copper Ore', icon: 'res_copper', color: '#d0763e', value: 3, kind: 'ore' },
  iron: { name: 'Iron Ore', icon: 'res_iron', color: '#a87a6a', value: 4, kind: 'ore' },
  gold: { name: 'Gold Nugget', icon: 'res_gold', color: '#ffcc34', value: 9, kind: 'ore' },
  crystal: { name: 'Crystal', icon: 'res_crystal', color: '#9a7ed8', value: 14, kind: 'ore' },
  ingot_copper: { name: 'Copper Ingot', icon: 'res_ingot_copper', color: '#e08a4a', value: 9, kind: 'ingot' },
  ingot_iron: { name: 'Iron Ingot', icon: 'res_ingot_iron', color: '#9aa0b2', value: 12, kind: 'ingot' },
  ingot_gold: { name: 'Gold Ingot', icon: 'res_ingot_gold', color: '#ffd23f', value: 30, kind: 'ingot' },
  gear: { name: 'Gear', icon: 'res_gear', color: '#b8924c', value: 20, kind: 'part' },
  plate: { name: 'Steel Plate', icon: 'res_plate', color: '#8c92aa', value: 22, kind: 'part' },
  circuit: { name: 'Circuit', icon: 'res_circuit', color: '#30ad9c', value: 40, kind: 'part' },
};

export class Resources {
  constructor(game) {
    this.game = game;
  }

  // the live store (created on first use, so old saves just get an empty one)
  get store() {
    const st = this.game.state;
    if (!st.res || typeof st.res !== 'object') st.res = {};
    return st.res;
  }
  get seenList() {
    const st = this.game.state;
    if (!Array.isArray(st.resSeen)) st.resSeen = Object.keys(st.res || {}).filter((k) => (st.res[k] || 0) > 0);
    return st.resSeen;
  }

  count(id) { return Math.max(0, Math.floor(this.store[id] || 0)); }
  has(id, n = 1) { return this.count(id) >= n; }
  seen(id) { return this.seenList.includes(id); }
  found() { const s = this.seenList; return RES_IDS.filter((id) => s.includes(id)); }
  hasAll(bill) { return Object.entries(bill || {}).every(([id, n]) => this.has(id, n)); }

  add(id, n = 1, x, z) {
    if (!RES_INFO[id] || !(n > 0)) return 0;
    n = Math.round(n);
    const s = this.store;
    s[id] = this.count(id) + n;
    const first = !this.seen(id);
    if (first) this.seenList.push(id);
    this.game.emit('res', { id, n, total: s[id], x, z, first });
    return n;
  }

  take(id, n = 1) {
    n = Math.round(n);
    if (!RES_INFO[id] || n <= 0) return n === 0;
    if (!this.has(id, n)) return false;
    const s = this.store;
    s[id] = this.count(id) - n;
    this.game.emit('res', { id, n: -n, total: s[id] });
    return true;
  }

  takeAll(bill) {
    if (!this.hasAll(bill)) return false;
    for (const [id, n] of Object.entries(bill || {})) this.take(id, n);
    return true;
  }

  // "3 Coal, 2 Iron Ore" (for tooltips / notifications)
  billText(bill) {
    return Object.entries(bill || {}).map(([id, n]) => `${n} ${RES_INFO[id]?.name || id}`).join(', ');
  }
}
