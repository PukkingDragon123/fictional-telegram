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
    check: (g) => (g.state.zones || []).length > (g.state.quests?.zones0 ?? 0),
    point: (g) => g.quests.nearestFog(),
  },
  {
    id: 'lab', title: 'Science time!', icon: 'flask', reward: { coins: 60 },
    when: (g) => (g.state.tutorialDone || g.skipTutorial) && g.isOpen('lab'),
    intro: 'My Lab is open! Research is FREE, it just takes time. Science = more money.',
    steps: [
      { text: 'Open the Lab', ev: 'labOpen' },
      { text: 'Start a research project', ev: 'researchStart' },
      { text: 'Wait for it to finish', ev: 'research' },
    ],
    check: (g) => (g.state.research || []).length > (g.state.quests?.research0 ?? 0),
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
    check: (g) => g.fish.list.some((f) => !f.dead && f.tagged && f.g.stars >= 3),
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
  {
    id: 'chip', title: 'The carpenter', icon: 'hammer', reward: { coins: 40, wood: 5 },
    when: (g) => (g.state.tutorialDone || g.skipTutorial) && !(g.state.zones || []).includes('treehouse') && (g.state.quests?.done || []).includes('friend'),
    intro: 'Tok-tok-tok... someone is pecking wood west of the pond! Bear furniture needs a carpenter.',
    steps: [{ text: 'Clear the forest to the Tree House (west)', ev: 'zone', test: (Z) => Z?.id === 'treehouse' }],
    check: (g) => (g.state.zones || []).includes('treehouse'),
    point: () => ({ zone: ZONES.find((Z) => Z.id === 'treehouse') }),
  },
  {
    id: 'logs', title: 'Lumberjack', icon: 'hammer', reward: { coins: 40 },
    when: (g) => (g.state.tutorialDone || g.skipTutorial) && g.structures.countBuilt('woodgarage') > 0,
    intro: 'Box some trees with Destroy. The beavers chop, the logs go to your Wood Garage!',
    steps: [{ text: 'Stock 10 logs in the Wood Garage', ev: 'logStocked', count: 10 }],
  },
  {
    id: 'sellwood', title: 'Pip\'s best customer', icon: 'coins', reward: { coins: 30 },
    when: (g) => (g.state.zones || []).includes('mill'),
    intro: 'Pip buys logs! Tap him at his mill to sell some.',
    steps: [{ text: 'Sell logs to Pip', ev: 'woodSold' }],
    point: () => ({ zone: ZONES.find((Z) => Z.id === 'mill') }),
  },
  {
    id: 'forage', title: 'Forest finds', icon: 'leaf', reward: { coins: 30 },
    when: (g) => (g.state.tutorialDone || g.skipTutorial) && g.state.day >= 1 && !!g.forage,
    intro: 'The forest is full of free stuff! Tap logs, mushrooms and wild plants.',
    steps: [{ text: 'Pick up 5 forest finds', ev: 'forage', count: 5 }],
  },
  {
    id: 'craft', title: 'Woodworking 101', icon: 'hammer', reward: { coins: 60, wood: 4 },
    when: (g) => (g.state.zones || []).includes('treehouse'),
    intro: 'Chip can build us furniture! Bring wood, wait a while, collect.',
    steps: [
      { text: 'Tap Chip to open his workshop', ev: 'workshopOpen' },
      { text: 'Start a woodwork plan', ev: 'craftStart', test: (d) => d?.kind === 'craft' },
      { text: 'Collect it when it\'s done', ev: 'crafted', test: (d) => d?.kind === 'craft' },
      { text: 'Place it from Build ▸ Woodwork', ev: 'built', test: (s) => s?.def?.category === 'woodwork' },
    ],
  },
  {
    id: 'fix', title: 'Antique roadshow', icon: 'star', reward: { coins: 120 },
    when: (g) => (g.state.zones || []).includes('treehouse') && Object.keys(g.state.inventory || {}).some((k) => k.startsWith('ruin_')),
    intro: 'Old junk from the forest ruins? Chip can restore it into a fancy antique!',
    steps: [
      { text: 'Start a repair at Chip\'s', ev: 'craftStart', test: (d) => d?.kind === 'repair' },
      { text: 'Collect the antique', ev: 'crafted', test: (d) => d?.kind === 'repair' },
    ],
  },
  {
    id: 'facility', title: 'Upgrade by building', icon: 'coins', reward: { coins: 50 },
    when: (g) => ['bakery', 'river', 'bend'].some((z) => (g.state.zones || []).includes(z)),
    intro: 'Upgrades you can build: a Tip Jar, a Tool Box, a Tag Rack... Place one!',
    steps: [{ text: 'Place a facility (Tip Jar, Tool Box...)', ev: 'built', test: (s) => !!s?.def?.facility }],
    check: (g) => g.facilityTypes?.().length > 0,
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
    const st = this.game.state;
    if (id === 'friend') S.zones0 = (st.zones || []).length;
    if (id === 'lab') S.research0 = (st.research || []).length;
    try { q.start?.(this.game); } catch (e) { console.warn('quest start', e); }
    // a step that is already true counts (e.g. the Tag tool is in hand)
    if (id === 'tag' && this.game.tool?.kind === 'tag') S.prog[id][0] = true;
    this.game.audio.play('page', { volume: 0.45 });
    this.game.notify(`New quest: ${q.title}! ${q.intro}`, 'excited', { dur: 5 });
    this.hint(q);
    this.sync();
    this.game.emit('questStart', q);
  }

  hintById(id) { const q = BY_ID[id]; if (!q) return; this.fromNotebook = true; this.hint(q); this.fromNotebook = false; }

  hint(q) {
    const g = this.game;
    const p = q.point?.(g);
    if (!p) return;
    if (typeof p === 'string') { const stop = g.ui?.pointAt?.(p); if (stop) setTimeout(() => stop(), 5000); return; }
    // from the notebook: fly over to the fog bank and show where to clear
    if (p.zone) { if (this.fromNotebook) g.zones?.showHint?.(p.zone); }
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
        if (st.test && !st.test(d)) return;
        if (st.count) {
          const C = (S.cnt ||= {});
          const c = (C[id] ||= q.steps.map(() => 0));
          c[k] += d?.n ? 1 : 1;
          changed = true;
          if (c[k] < st.count) return;
        }
        // doing a later step proves the earlier ones (you researched, so the lab was open)
        for (let j = 0; j <= k; j++) P[j] = true;
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
    if (R.wood) g.workshop?.addWood(R.wood);
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
    const R = (q) => [q.reward?.coins ? `${q.reward.coins} coins` : '', q.reward?.wood ? `${q.reward.wood} wood` : '', ...(q.reward?.food || []).map((f) => this.game.foodStore?.info?.(f.id)?.name || f.id)].filter(Boolean).join(' + ');
    return S.active.map((id) => {
      const q = BY_ID[id];
      const P = S.prog[id] || [];
      const C = S.cnt?.[id] || [];
      const steps = q.steps.map((st, k) => ({ text: st.count ? `${st.text} (${Math.min(st.count, C[k] || 0)}/${st.count})` : st.text, done: !!P[k] }));
      const cs = q.steps.find((st) => st.count);
      const progress = cs && q.steps.length === 1 ? [Math.min(cs.count, C[0] || 0), cs.count] : [P.filter(Boolean).length, q.steps.length];
      return { id, title: q.title, icon: q.icon, steps, reward: R(q), progress };
    });
  }

  sync() {
    const v = this.view();
    const QL = v.length || this.game.ui?.questLog ? this.game.ui?.ensureQuestLog?.() : null;
    QL?.set?.(v);
    QL?.setDone?.((this.S.done || []).map((id) => ({ id, title: BY_ID[id]?.title || id })));
  }

  update(dt) {
    const g = this.game;
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 2;
    // safety net: finish any quest whose goal is already true in the game
    for (const id of [...this.S.active]) {
      const q = BY_ID[id];
      let ok = false;
      try { ok = !!q?.check?.(g); } catch { ok = false; }
      if (ok) { this.S.prog[id] = q.steps.map(() => true); this.sync(); this.finish(id); }
    }
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
