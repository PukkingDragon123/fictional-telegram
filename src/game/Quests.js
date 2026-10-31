// Quests (game.quests): the notebook's three kinds of jobs.
//
// [v30 tutorial]
//   MAIN    Reynard's questline in chapters (src/data/questline.js): one pond to a
//           bear resort and the Deepest Zone. Chapter 1 is the guided tutorial
//           (src/game/tutorial/guide.js). Quests open the tool they need, pay a
//           reward, and every chapter opens something new.
//   DAILY   three small goals every morning from day 2 (feed, hatch, serve,
//           build...), coins each, a bonus for all three.
//   SIDE    villagers' errands and lesson goals (QUESTS below + mining, Old
//           Longneck, lessons): they start when they make sense, 2 at a time.
// Steps tick from game events or from polled state checks (resumable, and old
// saves catch up silently). Completions pop a toast (src/ui/QuestToast.js).
// State: game.state.quests = { active, done, prog, cnt, main: {...}, daily: {...} }.
import { ZONES } from '../data/zones.js';
import { MINING_QUESTS } from '../data/questsMining.js'; // [F&S mining]
import { LONGNECK_QUESTS } from '../data/longneck.js'; // [v26 turtle]
import { LESSON_QUESTS } from '../data/lessons.js'; // [v26 tutorial] lesson goals (started by game.lessons)
import { CHAPTERS, MAIN_QUESTS, MAIN_BY_ID, DAILY, DAILY_BY_ID, dailyCoins, dailyBonus } from '../data/questline.js';
import { showQuestToast } from '../ui/QuestToast.js';

// side errands (the old after-tutorial quests that the main line does not cover)
export const QUESTS = [
  {
    id: 'chip', title: 'The carpenter', icon: 'hammer', reward: { coins: 40, wood: 5 },
    when: (g) => (g.state.zones || []).length > 0 && !(g.state.zones || []).includes('treehouse'),
    intro: 'Tok-tok-tok... someone is pecking wood west of the pond!',
    steps: [{ text: 'Clear the forest to the Tree House (west)', ev: 'zone', test: (Z) => Z?.id === 'treehouse' }],
    check: (g) => (g.state.zones || []).includes('treehouse'),
    point: () => ({ zone: ZONES.find((Z) => Z.id === 'treehouse') }),
  },
  {
    id: 'logs', title: 'Lumberjack', icon: 'hammer', reward: { coins: 40 },
    when: (g) => g.structures.countBuilt('woodgarage') > 0,
    intro: 'Box trees with Destroy. The beavers chop, the logs go to the Wood Garage.',
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
    when: (g) => g.state.day >= 3 && !!g.forage && (g.state.zones || []).length > 0,
    intro: 'The forest is full of free stuff! Tap logs, mushrooms and wild plants.',
    steps: [{ text: 'Pick up 5 forest finds', ev: 'forage', count: 5 }],
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
];
QUESTS.push(...MINING_QUESTS); // [F&S mining] src/data/questsMining.js
QUESTS.push(...LONGNECK_QUESTS); // [v26 turtle] the way to Old Longneck (src/data/longneck.js)
QUESTS.push(...LESSON_QUESTS); // [v26 tutorial] src/data/lessons.js
const BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
// old side quests that the main line took over (old saves: done there = done here)
const OLD_TO_MAIN = { friend: 'm_friend', lab: null, tag: null, match: 'm_cupid', lq_match: 'm_cupid', lq_3star: 'm_3star', lq_hire: 'm_hire', lq_keeper: 'm_keeper', craft: 'm_chip', facility: 'm_facility' };
const SIDE_MAX = 2;
const FEATURE_NAME = { coins: 'Coins', ebuy: 'e-Buy', feed: 'Food tool', hand: 'Carry tool', lab: 'The Lab', build: 'Build menu', clock: 'The clock', speed: 'Fast-forward', rating: 'Star rating', reviews: 'Restaurant', pet: 'Pet tool', tag: 'Tag tool', dex: 'Encyclopedia', clear: 'Destroy tool', match: 'Matchmaker', staff: 'Staff' };

export class Quests {
  constructor(game) {
    this.game = game;
    this.checkT = 2;
    this.pollT = 0.5;
    const evs = new Set([...QUESTS, ...MAIN_QUESTS].flatMap((q) => q.steps.map((s) => s.ev).filter(Boolean)));
    for (const d of DAILY) evs.add(d.ev);
    for (const ev of evs) game.on(ev, (d) => { try { this.onEvent(ev, d); } catch (e) { console.warn('[quests]', ev, e); } });
    game.on('day', () => { try { this.onDay(); } catch (e) { console.warn('[quests] day', e); } });
  }

  get S() {
    const st = this.game.state;
    const S = (st.quests ||= { active: [], done: [], prog: {} });
    S.active ||= []; S.done ||= []; S.prog ||= {};
    return S;
  }
  get M() {
    const S = this.S;
    const M = (S.main ||= { v: 30, started: false, ch: 0, active: [], done: [], prog: {}, cnt: {}, cls: [], clsDone: [] });
    for (const k of ['active', 'done', 'cls', 'clsDone']) if (!Array.isArray(M[k])) M[k] = [];
    M.prog ||= {}; M.cnt ||= {};
    return M;
  }
  get D() {
    const S = this.S;
    return (S.daily ||= { day: 0, list: [], bonus: false });
  }

  // ================================================================ main questline
  chapter() { return CHAPTERS[Math.min(this.M.ch, CHAPTERS.length - 1)]; }
  mainDone(id) { return this.M.done.includes(id); }
  /** the main quest Reynard is guiding / the notebook's slip shows */
  current() { const id = this.M.active.find((x) => !this.M.done.includes(x)); return id ? MAIN_BY_ID[id] : null; }

  /** the tutorial starts the questline (new game) */
  beginMain() {
    const M = this.M;
    if (M.started) { this.refreshMain(); return; }
    M.started = true;
    M.ch = 0;
    this.chapterCard(CHAPTERS[0], 0);
    this.refreshMain();
    this.sync();
  }

  // open every quest of the current chapter whose prerequisites are done
  refreshMain({ quiet = false } = {}) {
    const M = this.M;
    if (!M.started) return;
    const C = CHAPTERS[M.ch];
    if (!C) return;
    for (const q of C.quests) {
      if (M.done.includes(q.id) || M.active.includes(q.id)) continue;
      if ((q.req || []).some((r) => !M.done.includes(r))) continue;
      this.startMain(q, { quiet });
    }
  }

  startMain(q, { quiet = false } = {}) {
    const g = this.game, M = this.M;
    M.active.push(q.id);
    M.prog[q.id] ||= q.steps.map(() => false);
    for (const f of q.unlock || []) g.unlockFeature(f, { quiet: true });
    if (q.cls && !M.clsDone.includes(q.cls) && !M.cls.includes(q.cls)) M.cls.push(q.cls);
    this.pollMain(q, true);
    if (!quiet && !q.guided) {
      g.audio?.play?.('page', { volume: 0.45 });
      this.toast({ kind: 'new', title: q.title, line: q.steps.find((s, k) => !M.prog[q.id][k])?.text || '', icon: q.icon });
    }
    g.emit('questStart', { ...q, main: true });
  }

  // ticks steps whose state check is true (quiet: no pen sound)
  pollMain(q, quiet = false) {
    const g = this.game, M = this.M;
    const P = M.prog[q.id];
    if (!P) return false;
    let changed = false;
    q.steps.forEach((st, k) => {
      if (P[k] || !st.done) return;
      let ok = false;
      try { ok = !!st.done(g); } catch { ok = false; }
      if (ok) { P[k] = true; changed = true; this.stepGift(st); if (!quiet) g.audio?.play?.('pen', { volume: 0.4 }); }
    });
    if (P.every(Boolean) && !M.done.includes(q.id)) { this.finishMain(q.id); return true; }
    return changed;
  }

  stepGift(st) {
    const G = st.gift;
    if (!G) return;
    const g = this.game, inv = (g.state.inventory ||= {});
    for (const [t, n] of Object.entries(G.items || {})) inv[t] = (inv[t] || 0) + n;
    g.emit('inventory', inv);
    if (G.say) g.notify(G.say, 'happy', { dur: 4 });
  }

  finishMain(id, { silent = false } = {}) {
    const g = this.game, M = this.M, q = MAIN_BY_ID[id];
    if (!q || M.done.includes(id)) return;
    M.active = M.active.filter((x) => x !== id);
    M.done.push(id);
    if (M.prog[id]) M.prog[id] = M.prog[id].map(() => true);
    if (!silent) {
      this.pay(q.reward);
      g.audio?.play?.('levelup', { volume: 0.5 });
      this.toast({ kind: 'quest', title: q.title, reward: q.reward, icon: q.icon });
      try { g.ui?.ensureQuestLog?.()?.complete?.(id); } catch { /* ignore */ }
      g.particles?.confetti?.(g.fox.x, g.fox.y + 1.4, g.fox.z, 30);
    } else for (const f of q.reward?.unlock || []) g.unlockFeature(f, { quiet: true });
    g.emit('questDone', { ...q, main: true });
    // chapter done?
    const C = CHAPTERS[M.ch];
    if (C && C.quests.every((x) => M.done.includes(x.id))) {
      if (!silent) this.pay(C.reward);
      else for (const f of C.reward?.unlock || []) g.unlockFeature(f, { quiet: true });
      M.ch++;
      const N = CHAPTERS[M.ch];
      g.emit('chapterDone', { chapter: C, next: N });
      if (!silent) {
        this.toast({ kind: 'chapterDone', title: C.title, n: M.ch, reward: C.reward });
        if (N) setTimeout(() => { this.chapterCard(N, M.ch); }, 3600);
      }
    }
    if (!silent) setTimeout(() => { this.refreshMain(); this.sync(); }, silent ? 0 : 900);
    else this.refreshMain({ quiet: true });
    if (!silent) g.save?.();
    this.sync();
  }

  chapterCard(C, i) {
    if (!C) return;
    this.game.audio?.play?.('fanfare', { volume: 0.35 });
    this.toast({ kind: 'chapter', n: i + 1, title: C.title, line: C.sub });
  }

  pay(R) {
    if (!R) return;
    const g = this.game;
    if (R.coins) g.earnMisc?.(R.coins, 'tips');
    for (const f of R.food || []) g.foodStore?.add?.(f.id, f.n || 1);
    if (R.wood) g.workshop?.addWood?.(R.wood);
    if (R.items) { const inv = (g.state.inventory ||= {}); for (const [t, n] of Object.entries(R.items)) inv[t] = (inv[t] || 0) + n; g.emit('inventory', inv); }
    for (const f of R.unlock || []) g.unlockFeature(f);
  }

  rewardText(R) {
    if (!R) return '';
    const g = this.game;
    const out = [];
    if (R.coins) out.push(`${R.coins} coins`);
    if (R.wood) out.push(`${R.wood} wood`);
    for (const f of R.food || []) out.push(`${f.n > 1 ? f.n + ' ' : ''}${g.foodStore?.info?.(f.id)?.name || f.id}`);
    for (const f of R.unlock || []) if (FEATURE_NAME[f] && !(R.text && R.unlock.length > 1)) out.push(FEATURE_NAME[f]);
    if (R.text && (R.unlock || []).length > 1) out.push(R.text);
    return out.join(' + ');
  }

  // old saves (and ?notut games): tick off what is already true, quietly, then carry on
  catchUp() {
    const g = this.game, M = this.M, S = this.S;
    M.started = true;
    const tut = g.state.tutorialDone || g.skipTutorial;
    const mapped = new Set(S.done.map((id) => OLD_TO_MAIN[id]).filter(Boolean));
    for (let guard = 0; guard < 80 && M.ch < CHAPTERS.length; guard++) {
      const C = CHAPTERS[M.ch];
      let moved = false;
      for (const q of C.quests) {
        if (M.done.includes(q.id)) continue;
        const ok = (M.ch === 0 && tut) || mapped.has(q.id) || q.steps.every((st) => { try { return !!st.done?.(g); } catch { return false; } });
        if (ok) { this.finishMain(q.id, { silent: true }); moved = true; }
      }
      if (!moved) break;
    }
    // the old side quests that the main line covers go away
    S.active = S.active.filter((id) => BY_ID[id]);
    this.refreshMain({ quiet: true });
  }

  // ================================================================ daily goals
  onDay() {
    const g = this.game;
    if (!this.M.started || g.state.day < 2) return;
    this.rollDaily();
  }

  rollDaily() {
    const g = this.game, D = this.D, day = g.state.day;
    if (D.day === day) return;
    const off = g.isDayOff?.();
    let pool = DAILY.filter((d) => { try { return d.avail(g) && !(off && d.feast); } catch { return false; } });
    // a seeded shuffle: the same day always rolls the same goals
    let s = (day * 9301 + 49297) % 233280;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    pool = pool.map((d) => [rnd(), d]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    // serve bears goal first on feast days: the 5 PM feast is the heart of the day
    const pick = [];
    const serve = pool.find((d) => d.id === 'd_serve');
    if (serve) pick.push(serve);
    for (const d of pool) { if (pick.length >= 3) break; if (!pick.includes(d)) pick.push(d); }
    D.day = day;
    D.bonus = false;
    D.list = pick.map((d) => ({ id: d.id, n: 0, need: d.need(day), done: false }));
    if (D.list.length) {
      this.toast({ kind: 'daily', title: `Day ${day}: today's goals`, lines: D.list.map((x) => DAILY_BY_ID[x.id].text(x.need)) });
    }
    this.sync();
  }

  dailyEvent(ev, d) {
    const g = this.game, D = this.D;
    if (D.day !== g.state.day || !D.list.length) return false;
    let changed = false;
    for (const x of D.list) {
      const def = DAILY_BY_ID[x.id];
      if (!def || x.done || def.ev !== ev) continue;
      if (def.test && !def.test(d)) continue;
      x.n++;
      changed = true;
      if (x.n >= x.need) {
        x.done = true;
        const c = dailyCoins(g.state.day);
        g.earnMisc?.(c, 'tips');
        g.audio?.play?.('coin', { volume: 0.4 });
        this.toast({ kind: 'dailyDone', title: def.text(x.need), reward: { coins: c } });
      }
    }
    if (changed && !D.bonus && D.list.every((x) => x.done)) {
      D.bonus = true;
      const b = dailyBonus(g.state.day);
      g.earnMisc?.(b, 'tips');
      g.foodStore?.add?.('clover', 1);
      g.audio?.play?.('levelup', { volume: 0.45 });
      setTimeout(() => this.toast({ kind: 'quest', title: 'All daily goals!', reward: { coins: b, food: [{ id: 'clover', n: 1 }] }, icon: 'star' }), 1400);
    }
    return changed;
  }

  // ================================================================ side quests
  // the closest fog bank that is still closed
  nearestFog() {
    const g = this.game;
    const fox = g.fox;
    let best = null, bd = 1e9;
    for (const Z of ZONES) {
      if (g.zones?.isOpen(Z.id) || Z.noReach || Z.requires) continue; // [F&S mining] research-only fog
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
    this.game.audio.play('page', { volume: 0.45 });
    this.toast({ kind: 'side', title: q.title, line: q.intro || q.steps[0]?.text || '', icon: q.icon });
    this.sync();
    this.game.emit('questStart', q);
  }

  hintById(id) {
    const q = MAIN_BY_ID[id] || BY_ID[id];
    if (!q) return;
    this.fromNotebook = true; this.hint(q); this.fromNotebook = false;
  }

  hint(q) {
    const g = this.game;
    let p = null;
    try { p = q.point?.(g); } catch { p = null; }
    if (!p) { const st = this.stepsOf(q).find((s) => !s.done); if (st) g.notify(st.text, 'info', { dur: 3.5 }); return; }
    if (typeof p === 'string') { const stop = g.ui?.pointAt?.(p); if (stop) setTimeout(() => stop(), 5000); return; }
    if (p.zone) { if (this.fromNotebook) g.zones?.showHint?.(p.zone); }
  }

  onEvent(ev, d) {
    const S = this.S, M = this.M;
    let changed = false;
    const tick = (q, P, C, k, st) => {
      if (P[k] || st.ev !== ev) return;
      if (st.test && !st.test(d)) return;
      if (st.count) {
        C[k] = (C[k] || 0) + 1;
        changed = true;
        if (C[k] < st.count) return;
      }
      P[k] = true;
      changed = true;
      this.stepGift(st);
      this.game.audio.play('pen', { volume: 0.4 });
    };
    for (const id of [...M.active]) {
      const q = MAIN_BY_ID[id], P = M.prog[id];
      if (!q || !P) continue;
      const C = (M.cnt[id] ||= q.steps.map(() => 0));
      q.steps.forEach((st, k) => tick(q, P, C, k, st));
      if (P.every(Boolean)) this.finishMain(id);
    }
    for (const id of [...S.active]) {
      const q = BY_ID[id], P = S.prog[id];
      if (!q || !P) continue;
      const C = ((S.cnt ||= {})[id] ||= q.steps.map(() => 0));
      q.steps.forEach((st, k) => {
        if (P[k] || st.ev !== ev) return;
        if (st.test && !st.test(d)) return;
        if (st.count) { C[k]++; changed = true; if (C[k] < st.count) return; }
        // doing a later step proves the earlier ones
        for (let j = 0; j <= k; j++) P[j] = true;
        changed = true;
        this.game.audio.play('pen', { volume: 0.4 });
      });
      if (P.every(Boolean)) this.finish(id);
    }
    if (this.dailyEvent(ev, d)) changed = true;
    if (changed) this.sync();
  }

  finish(id) {
    const g = this.game;
    const q = BY_ID[id];
    const S = this.S;
    S.active = S.active.filter((x) => x !== id);
    if (!S.done.includes(id)) S.done.push(id);
    this.pay({ ...(q.reward || {}), unlock: [] });
    g.audio.play('levelup', { volume: 0.5 });
    try { g.ui?.ensureQuestLog?.()?.complete?.(id); } catch { /* ignore */ }
    this.toast({ kind: 'quest', title: q.title, reward: q.reward, icon: q.icon });
    g.particles.confetti(g.fox.x, g.fox.y + 1.4, g.fox.z, 30);
    g.emit('questDone', q);
    g.save();
    setTimeout(() => this.sync(), 1800);
  }

  // ================================================================ views
  stepsOf(q) {
    const main = !!MAIN_BY_ID[q.id];
    const P = (main ? this.M.prog[q.id] : this.S.prog[q.id]) || [];
    const C = (main ? this.M.cnt[q.id] : this.S.cnt?.[q.id]) || [];
    return q.steps.map((st, k) => ({ text: st.count && !P[k] ? `${st.text} (${Math.min(st.count, C[k] || 0)}/${st.count})` : st.text, done: !!P[k] }));
  }

  view() {
    const S = this.S, M = this.M;
    const out = [];
    const mk = (q, main) => {
      const steps = this.stepsOf(q);
      const C = (main ? M.cnt[q.id] : S.cnt?.[q.id]) || [];
      const cs = q.steps.find((st) => st.count);
      const progress = cs && q.steps.length === 1 ? [Math.min(cs.count, C[0] || 0), cs.count] : [steps.filter((s) => s.done).length, q.steps.length];
      return { id: q.id, title: q.title, icon: q.icon, steps, reward: this.rewardText(q.reward), progress, main, chapter: main ? M.ch + 1 : null };
    };
    for (const id of M.active) if (MAIN_BY_ID[id]) out.push(mk(MAIN_BY_ID[id], true));
    for (const id of S.active) if (BY_ID[id]) out.push(mk(BY_ID[id], false));
    return out;
  }

  chapterView() {
    const M = this.M;
    if (!M.started) return null;
    const C = CHAPTERS[M.ch];
    if (!C) return { n: CHAPTERS.length, title: 'The End... for now', sub: 'Every chapter done. Legend.', done: 1, total: 1, reward: '', final: true, quests: [] };
    return {
      n: M.ch + 1, of: CHAPTERS.length, title: C.title, sub: C.sub, done: C.quests.filter((q) => M.done.includes(q.id)).length, total: C.quests.length,
      reward: C.reward?.text || this.rewardText(C.reward),
      quests: C.quests.map((q) => ({ id: q.id, title: q.title, done: M.done.includes(q.id), active: M.active.includes(q.id) })),
    };
  }

  dailyView() {
    const g = this.game, D = this.D;
    if (D.day !== g.state.day) return null;
    return {
      day: D.day, bonus: D.bonus, bonusCoins: dailyBonus(D.day), coins: dailyCoins(D.day),
      list: D.list.map((x) => ({ id: x.id, text: DAILY_BY_ID[x.id]?.text(x.need) || x.id, n: Math.min(x.n, x.need), need: x.need, done: x.done, icon: DAILY_BY_ID[x.id]?.icon })),
    };
  }

  sync() {
    const v = this.view();
    const ch = this.chapterView();
    const QL = v.length || ch || this.game.ui?.questLog ? this.game.ui?.ensureQuestLog?.() : null;
    if (!QL) return;
    QL.setChapter?.(ch);
    QL.setDaily?.(this.dailyView());
    QL.set?.(v);
    const M = this.M;
    QL.setDone?.([...M.done.map((id) => ({ id, title: MAIN_BY_ID[id]?.title || id })), ...(this.S.done || []).filter((id) => BY_ID[id]).map((id) => ({ id, title: BY_ID[id].title }))]);
  }

  toast(t) {
    if (this.game.titleMode || this.silentToasts) return;
    try { showQuestToast(this.game, t); } catch (e) { console.warn('[quests] toast', e); }
  }

  // ================================================================ loop
  update(dt) {
    const g = this.game;
    const M = this.M;
    // main: state checks a couple of times a second
    this.pollT -= dt;
    if (this.pollT <= 0 && M.started) {
      this.pollT = 0.5;
      let changed = false;
      for (const id of [...M.active]) { const q = MAIN_BY_ID[id]; if (q && this.pollMain(q)) changed = true; }
      if (changed) this.sync();
      this.maybeClass();
    }
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 2;
    // a new day began while a menu was open, or an old save
    if (M.started && g.state.day >= 2 && this.D.day !== g.state.day && g.state.phase === 'day') this.rollDaily();
    // safety net: finish any side quest whose goal is already true
    for (const id of [...this.S.active]) {
      const q = BY_ID[id];
      let ok = false;
      try { ok = !!q?.check?.(g); } catch { ok = false; }
      if (ok) { this.S.prog[id] = q.steps.map(() => true); this.sync(); this.finish(id); }
    }
    if (!(g.state.tutorialDone || g.skipTutorial) || g.tutorial?.active || g.cutscene?.active || g.state.phase !== 'day') return;
    const S = this.S;
    if (S.active.length >= SIDE_MAX) return;
    for (const q of QUESTS) {
      if (S.active.includes(q.id) || S.done.includes(q.id) || q.when === undefined) continue;
      let ok = false;
      try { ok = q.when(g); } catch { ok = false; }
      if (ok) { this.start(q.id); break; }
    }
  }

  // a chapter's class plays at the next quiet moment (after its hour)
  maybeClass() {
    const g = this.game, M = this.M;
    if (!M.cls.length || g.tutorial?.active || g.state.phase !== 'day' || g.skipTutorial) return;
    const L = g.lessons;
    if (!L?.playClass || L.busy || (L.quiet && !L.quiet())) return;
    const id = M.cls[0];
    const q = MAIN_QUESTS.find((x) => x.cls === id && M.active.includes(x.id));
    if (q?.clsHour && g.state.hour < q.clsHour) return;
    if (g.state.hour > 16.3) return; // never right before the feast
    M.cls.shift();
    M.clsDone.push(id);
    L.playClass(id).then((ok) => { if (!ok) { /* blocked: it stays in the notebook's Lessons page */ } }).catch(() => {});
  }

  onLoad() {
    const g = this.game, S = this.S;
    // drop side quests that no longer exist (taken over by the main line)
    S.active = S.active.filter((id) => BY_ID[id]);
    if (!this.M.started && (g.state.tutorialDone || g.skipTutorial)) this.catchUp();
    else if (this.M.started) this.refreshMain({ quiet: true });
    for (const id of S.active) {
      const q = BY_ID[id];
      if (q?.start) try { q.start(g); } catch { /* ignore */ }
    }
    this.sync();
  }
}
