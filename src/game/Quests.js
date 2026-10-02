// Little quests after the tutorial: a pinned paper note (src/ui/QuestLog.js)
// with checkbox steps. Each quest starts when it makes sense (the lab opens,
// a rare fish hatches, a couple is ready...), ticks off from game events and
// pays a reward. State lives in game.state.quests.
import { ZONES } from '../data/zones.js';

const rare = (g) => g.fish.list.some((f) => !f.dead && f.g.stars >= 3 && !f.tagged);
const couple = (g) => {
  const L = g.fish.list.filter((f) => !f.dead && f.adult);
  return L.some((a) => a.g.sex === 'F' && L.some((b) => b.g.sex === 'M' && b.region === a.region && g.fish.compatible(a, b)));
};

export const QUESTS = [
  {
    id: 'friend', title: 'Meet the neighbours', icon: 'heart', reward: { coins: 50 },
    when: (g) => (g.state.tutorialDone || g.skipTutorial) && g.state.day >= 1,
    intro: 'Somebody lives in the fog next door! Tap a "?" tag to see where.',
    steps: [{ text: 'Clear the forest up to a fog bank', ev: 'zone' }],
    point: (g) => g.quests.nearestFog(),
  },
  {
    id: 'lab', title: 'Science time!', icon: 'flask', reward: { coins: 60 },
    when: (g) => (g.state.tutorialDone || g.skipTutorial) && g.isOpen('lab'),
    intro: 'My Lab is open! Science = more money.',
    steps: [
      { text: 'Open Reynard\'s Lab', ev: 'labOpen' },
      { text: 'Research something new', ev: 'research' },
    ],
    point: () => 'tool:lab',
  },
  {
    id: 'tag', title: 'Save the rare fish!', icon: 'tag', reward: { coins: 40 },
    when: (g) => (g.state.tutorialDone || g.skipTutorial) && rare(g),
    start: (g) => g.unlockFeature('tag'),
    intro: 'A RARE fish! Bears would eat it. Tag it DO NOT EAT!',
    steps: [
      { text: 'Pick the Tag tool', ev: 'tool', test: (t) => t?.kind === 'tag' },
      { text: 'Tag a ★★★ rare fish', ev: 'fishTagged', test: (f) => f?.g?.stars >= 3 },
    ],
    point: () => 'tool:tag',
  },
  {
    id: 'match', title: 'Play Cupid', icon: 'heart', reward: { coins: 80, food: [{ id: 'clover', n: 1 }] },
    when: (g) => (g.state.tutorialDone || g.skipTutorial) && g.state.day >= 2 && couple(g),
    start: (g) => g.unlockFeature('match'),
    intro: 'Pick the parents yourself to breed the PERFECT fish!',
    steps: [
      { text: 'Open the Matchmaker', ev: 'matchOpen' },
      { text: 'Arrange a date', ev: 'matchArranged' },
      { text: 'Let the couple lay eggs', ev: 'matchMated' },
    ],
    point: () => 'tool:match',
  },
];
const BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

export class Quests {
  constructor(game) {
    this.game = game;
    this.checkT = 2;
    for (const ev of new Set(QUESTS.flatMap((q) => q.steps.map((s) => s.ev)))) game.on(ev, (d) => this.onEvent(ev, d));
  }

  get S() {
    const st = this.game.state;
    return (st.quests ||= { active: [], done: [], prog: {} });
  }

  // the closest fog bank that is still closed (for the "friend" quest)
  nearestFog() {
    const g = this.game;
    const fox = g.fox;
    let best = null, bd = 1e9;
    for (const Z of ZONES) {
      if (g.zones?.isOpen(Z.id)) continue;
      const d = Math.hypot(Z.cx - fox.x, Z.cz - fox.z) - Z.r;
      if (d < bd) { bd = d; best = Z; }
    }
    return best ? { x: best.cx, z: best.cz, zone: best } : null;
  }

  start(id) {
    const q = BY_ID[id];
    const S = this.S;
    if (!q || S.active.includes(id) || S.done.includes(id)) return;
    S.active.push(id);
    S.prog[id] = q.steps.map(() => false);
    try { q.start?.(this.game); } catch (e) { console.warn('quest start', e); }
    // a step that is already true counts (e.g. the Tag tool is in hand)
    if (id === 'tag' && this.game.tool?.kind === 'tag') S.prog[id][0] = true;
    this.game.audio.play('page', { volume: 0.45 });
    this.game.notify(`New quest: ${q.title}! ${q.intro}`, 'excited', { dur: 5 });
    this.hint(q);
    this.sync();
    this.game.emit('questStart', q);
  }

  hint(q) {
    const g = this.game;
    const p = q.point?.(g);
    if (!p) return;
    if (typeof p === 'string') { const stop = g.ui?.pointAt?.(p); if (stop) setTimeout(() => stop(), 5000); return; }
    // fog banks carry their own "Who lives here?" tags; tapping one shows the way
  }

  onEvent(ev, d) {
    const S = this.S;
    let changed = false;
    for (const id of [...S.active]) {
      const q = BY_ID[id];
      const P = S.prog[id];
      if (!q || !P) continue;
      q.steps.forEach((st, k) => {
        if (P[k] || st.ev !== ev) return;
        // steps go in order: an earlier unticked step blocks later ones
        if (P.slice(0, k).some((x) => !x)) return;
        if (st.test && !st.test(d)) return;
        P[k] = true;
        changed = true;
        this.game.audio.play('pen', { volume: 0.4 });
      });
      if (P.every(Boolean)) this.finish(id);
    }
    if (changed) this.sync();
  }

  finish(id) {
    const g = this.game;
    const q = BY_ID[id];
    const S = this.S;
    S.active = S.active.filter((x) => x !== id);
    if (!S.done.includes(id)) S.done.push(id);
    const R = q.reward || {};
    if (R.coins) g.earnMisc?.(R.coins, 'tips');
    for (const f of R.food || []) g.foodStore?.add?.(f.id, f.n || 1);
    g.audio.play('levelup', { volume: 0.5 });
    g.ui?.ensureQuestLog?.()?.complete?.(id);
    g.notify(`Quest complete: ${q.title}! +${R.coins || 0} coins`, 'excited', { dur: 4 });
    g.particles.confetti(g.fox.x, g.fox.y + 1.4, g.fox.z, 40);
    g.emit('questDone', q);
    g.save();
    setTimeout(() => this.sync(), 1800);
  }

  view() {
    const S = this.S;
    const R = (q) => [q.reward?.coins ? `${q.reward.coins} coins` : '', ...(q.reward?.food || []).map((f) => this.game.foodStore?.info?.(f.id)?.name || f.id)].filter(Boolean).join(' + ');
    return S.active.map((id) => {
      const q = BY_ID[id];
      const P = S.prog[id] || [];
      return { id, title: q.title, icon: q.icon, steps: q.steps.map((s, k) => ({ text: s.text, done: !!P[k] })), reward: R(q), progress: [P.filter(Boolean).length, q.steps.length] };
    });
  }

  sync() {
    const v = this.view();
    const QL = v.length || this.game.ui?.questLog ? this.game.ui?.ensureQuestLog?.() : null;
    QL?.set?.(v);
  }

  update(dt) {
    const g = this.game;
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 2;
    if (!(g.state.tutorialDone || g.skipTutorial) || g.tutorial?.active || g.cutscene?.active || g.state.phase !== 'day') return;
    const S = this.S;
    if (S.active.length >= 2) return;
    for (const q of QUESTS) {
      if (S.active.includes(q.id) || S.done.includes(q.id)) continue;
      let ok = false;
      try { ok = q.when(g); } catch { ok = false; }
      if (ok) { this.start(q.id); break; }
    }
  }

  onLoad() {
    const S = this.S;
    for (const id of S.active) {
      const q = BY_ID[id];
      if (q?.start) try { q.start(this.game); } catch { /* ignore */ }
    }
    this.sync();
  }
}
