// [v26 demo] game.demo: the demo's gate (installed by src/game/ext/demo.js, demo build only).
//
// - Research sections outside DEMO_SECTIONS (and the single nodes in DEMO_LOCKED_NODES)
//   are "Full game": their section key reads "Full game only", they can't be unlocked,
//   their nodes can't be researched, and builds / fish / e-Buy items behind them say
//   "Full game" (lockReason). The Lab tree draws them with a FULL GAME lock
//   (src/ui/LabTree.js + lab/treeView.js check `key.demo` / `node.demoLock`).
//   No industry (Flint & Steel + the quarry survey), no Deepwood Expedition and so
//   no Mistfall Hollow / Old Longneck (that zone needs the expedition's last node).
// - The day limit: when the DEMO_LAST_DAY ledger is closed (startBedtime), the end
//   screen (src/demo/EndScreen.js) plays instead of the night. A demo save past the
//   limit opens straight onto the end screen.
//
// Tests: game.demo.info(), game.demo.end() (show the end screen now).
import { RESEARCH, RESEARCH_BY_ID, BRANCHES } from '../data/research.js';
import { DEMO_SECTIONS, DEMO_LOCKED_NODES, DEMO_LAST_DAY, DEMO_STORE_URL, clearDemoSaves } from './demo.js';
import { showDemoEnd } from './EndScreen.js';
import { QUESTS } from '../game/Quests.js';

export function installDemo(game) { return new DemoGate(game); }

class DemoGate {
  constructor(game) {
    this.game = game;
    this.lastDay = DEMO_LAST_DAY;
    this.ended = false;
    this.screen = null;
    this.lockedSections = new Set(BRANCHES.filter((B) => !DEMO_SECTIONS.includes(B.id)).map((B) => B.id));
    // mark the data: the tree / build menus read these flags; a locked section's key
    // has no gateway node any more, so no "Section key found!" for it either
    for (const B of BRANCHES) if (this.lockedSections.has(B.id)) { B.demo = true; B.key = { demo: true }; }
    for (const r of RESEARCH) if (this.lockedSections.has(r.branch) || DEMO_LOCKED_NODES.includes(r.id)) r.demoLock = true;
    // quest chains into full-game content never start (Flint & Steel, the road to Old Longneck)
    for (const q of QUESTS) if (/^(fs|ln)_/.test(q.id || '')) q.when = () => false;
    this.wrap();
    game.on('day', (d) => this.onDay(d?.day ?? game.state.day));
  }

  isLocked(id) { return !!RESEARCH_BY_ID[id]?.demoLock && !this.game.state.research.includes(id); }
  sectionLocked(b) { return this.lockedSections.has(b); }

  // the game's own rules, with the demo's locks in front
  wrap() {
    const g = this.game;
    const orig = {};
    for (const k of ['canResearch', 'sectionKey', 'unlockSection', 'researchSections', 'lockReason', 'startBedtime', 'save']) orig[k] = g[k].bind(g);
    this.orig = orig;
    g.canResearch = (id) => (this.isLocked(id) ? { ok: false, reason: 'Comes with the full game', demo: true } : orig.canResearch(id));
    g.sectionKey = (b) => {
      const k = orig.sectionKey(b);
      if (!k || k.open || !this.sectionLocked(b)) return k;
      return { ...k, demo: true, coins: 0, ready: false, canUnlock: false, needs: [{ kind: 'demo', id: 'demo', ok: false, text: 'Full game only' }] };
    };
    // the demo's own sections first (Reynard's "next section" hints point at one you can open)
    g.researchSections = () => { const all = orig.researchSections(); return [...all.filter((k) => !k?.demo), ...all.filter((k) => k?.demo)]; };
    g.unlockSection = (b, o) => (this.sectionLocked(b) && !g.sectionOpen(b) ? { ok: false, msg: 'That section comes with the full game', demo: true } : orig.unlockSection(b, o));
    g.lockReason = (rid) => (this.isLocked(rid) ? 'Full game' : orig.lockReason(rid));
    g.startBedtime = () => {
      if (!this.ended && g.state.phase === 'report' && g.state.day >= this.lastDay) { this.end(); return; }
      orig.startBedtime();
    };
    g.save = () => { if (!this.ended) orig.save(); };
  }

  onDay(day) {
    const g = this.game;
    if (day > this.lastDay) { this.end(); return; }
    if (day === this.lastDay) setTimeout(() => g.notify(`Last day of the demo! Make tonight's feast count.`, 'excited', { dur: 5 }), 2500);
  }

  onLoad() {
    // a demo save from past the limit: straight to the end screen
    if (this.game.state.day > this.lastDay) setTimeout(() => this.end({ loaded: true }), 900);
  }

  info() {
    return { lastDay: this.lastDay, day: this.game.state.day, ended: this.ended, open: DEMO_SECTIONS.slice(), locked: [...this.lockedSections], lockedNodes: RESEARCH.filter((r) => r.demoLock).length };
  }

  end({ loaded = false } = {}) {
    if (this.ended) return this.screen;
    this.ended = true;
    const g = this.game;
    const st = g.state;
    // the pond keeps living quietly behind the screen; nothing saves any more
    // (the ledger already saved the morning after the last day)
    st.phase = 'report';
    if (loaded) { st.hour = 19.4; g.transition = null; }
    try { g.ui?.closePanel?.(); g.ui?.closeModal?.(); } catch { /* ignore */ }
    try { g.audio.setMusic('title'); g.audio.play('fanfare', { volume: 0.5 }); } catch { /* ignore */ }
    document.body.classList.add('demo-over');
    g.emit('demoEnd', { day: st.day });
    this.screen = showDemoEnd(g, { storeUrl: DEMO_STORE_URL, lastDay: this.lastDay, onRestart: () => this.restart() });
    // behind the screen: the pond at dusk, Reynard back outside (the evening may have left him in his hut)
    setTimeout(() => { try { g.fox.rig.root.visible = true; g.rig.lookAt(68.5, 36); } catch { /* ignore */ } }, 700);
    return this.screen;
  }

  // PLAY AGAIN: a clean demo from the title
  restart() {
    clearDemoSaves();
    try {
      const u = new URL(location.href);
      for (const k of ['autostart', 'notut', 'slot']) u.searchParams.delete(k); // tests' shortcuts: back to the title
      if (u.href === location.href) location.reload(); else location.replace(u.href);
    } catch { /* ignore */ }
  }
}
