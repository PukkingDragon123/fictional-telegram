// [v26 world] The road to the Deepest Zone (game.expedition). Four natural
// barriers lie between your land and Mistfall Hollow (world/worldgen.js
// BARRIERS, research in src/data/ext/world.js). Each opens when its research is
// done - and, for the bridge and the Fallen Giant, once your land reaches the
// spot (`near`): the beavers string the bridge (your land jumps to the far
// bank) or saw the giant apart (its tiles become yours). Until then the beavers
// refuse to clear those tiles (BeaverSystem.canClear asks world.barrierAt) and
// the land agent won't sell plots over them (Land.info).
//
// State: game.state.expedition = { open: ['bridge', ...] }.
// API: open(id, { quiet }) (tests / story), isOpen(id), next() -> the first closed
// barrier, hintFor(zone) -> a line about what's in the way.
// Event: game.emit('barrier', B) when one opens.
import { BARRIERS } from '../../world/worldgen.js';
import { KIND } from '../../world/grid.js';

export function install(game) { return new Expedition(game); }

class Expedition {
  constructor(game) {
    this.game = game;
    this.t = 0;
    game.on('research', () => { this.t = 0; });
  }

  get S() {
    const st = this.game.state;
    if (!st.expedition || typeof st.expedition !== 'object') st.expedition = { open: [] };
    if (!Array.isArray(st.expedition.open)) st.expedition.open = [];
    return st.expedition;
  }
  researched(B) { return (this.game.state.research || []).includes(B.research); }
  isOpen(id) { return this.S.open.includes(id); }
  next() { return BARRIERS.find((B) => !this.isOpen(B.id)) || null; }
  hintFor() { const B = this.next(); return B ? `${B.name}: ${B.hint}` : null; }

  onNewGame() { this.apply(); }
  onLoad() { this.apply(); }

  // sync the world (open set, meshes) with the saved state
  apply() {
    const W = this.game.world;
    if (!W?.barrierOpen) return;
    W.barrierOpen.clear();
    for (const B of BARRIERS) {
      const open = this.isOpen(B.id);
      if (open) W.barrierOpen.add(B.id);
      W.deep?.setBarrier(B.id, open);
    }
  }

  // does your land reach the barrier's spot?
  reached(B) {
    const g = this.game.grid;
    if (!B.near) return true;
    const [nx, nz] = B.near;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = nx + dx, z = nz + dz;
      if (g.inb(x, z) && g.meadow[z * g.w + x]) return true;
    }
    return false;
  }

  update(simDt, dt) {
    this.t -= dt || 0;
    if (this.t > 0) return;
    this.t = 1;
    for (const B of BARRIERS) {
      if (this.isOpen(B.id) || !this.researched(B)) continue;
      if (B.trigger && !this.reached(B)) continue;
      this.open(B.id);
    }
  }

  open(id, { quiet = false } = {}) {
    const B = BARRIERS.find((b) => b.id === id);
    const game = this.game, W = game.world, g = game.grid;
    if (!B || this.isOpen(id)) return false;
    this.S.open.push(id);
    W.barrierOpen?.add(id);
    W.deep?.setBarrier(id, true);
    const Bv = game.beavers;
    let changed = false;
    if (B.kind === 'bridge') {
      // the far bank is yours: the bridge lands there
      const [fx, fz] = B.far;
      for (let z = fz; z <= fz + 1; z++) for (let x = B.x0 - 1; x <= B.x1 + 1; x++) if (g.inb(x, z) && g.kind[z * g.w + x] !== KIND.WATER && Bv?.clearInstant(x, z)) changed = true;
    } else if (B.kind === 'log') {
      // the giant comes apart: its tiles are cleared and yours
      for (const [x, z] of B.tiles || []) if (Bv?.clearInstant(x, z)) changed = true;
      game.state.wood = (game.state.wood || 0) + 6;
    }
    if (changed) { W.landVersion++; if (Bv) Bv.rebuildT = 0; }
    if (!quiet) {
      const p = W.deep?.spot(id);
      if (p) {
        game.particles?.puff?.(p.x, p.y + 0.5, p.z, 22, 1.1);
        if (B.kind === 'log') game.particles?.debris?.(p.x, p.y + 0.6, p.z, 26, [0xc8a06a, 0x8a6a44, 0x5a3e28]);
        game.audio?.play?.(B.kind === 'log' ? 'demolish' : 'discover', { volume: 0.5 });
      }
      const line = { bridge: 'The beavers strung a rope bridge over the Broadwater!', thorns: 'Bramble hooks out: the beavers will clear the Bramblewall now.', log: 'The Fallen Giant is sawn apart. Heron Steps lie open below.', cliff: 'Ropes are up on Heron Steps. Mistfall Hollow waits at the bottom.' }[B.kind];
      game.notify?.(line || `${B.name} is open!`, 'excited', { dur: 4 });
    }
    game.emit('barrier', B);
    game.save?.();
    return true;
  }
}
