// [v19 npc] Conversations in the villager card: topic tabs (about them, their
// home, tips, gossip, a daily line, follow-ups unlocked by choices) and 2-3
// choice buttons per topic. Choices can raise friendship (0..10, shown as 5
// hearts), pay out small rewards, or unlock a follow-up topic. Friendship
// milestones at 3 / 6 / 10 queue a cutscene (NpcScenes.queueEvent).
// State: game.state.villagers[id] = { hearts, friend, giftDay, met, picked: {key: 1}, open: {topic: 1}, seen: {topic: day}, ms: {3: 1} }
import { DIALOGUE } from '../data/npcDialogue.js';

export const MILESTONES = [3, 6, 10];
export const FRIEND_MAX = 10;
const BASE_TOPICS = ['about', 'home', 'tips', 'gossip'];

export class NpcDialogue {
  constructor(game) { this.game = game; }

  data(id) { return DIALOGUE[id] || null; }

  state(v) {
    const S = (this.game.state.villagers ||= {});
    const st = (S[v.id] ||= { hearts: 0, giftDay: 0, met: false });
    if (st.friend == null) st.friend = Math.min(FRIEND_MAX, Math.round((+st.hearts || 0)));
    st.picked ||= {}; st.open ||= {}; st.seen ||= {}; st.ms ||= {};
    st.hearts = st.friend / 2;
    return st;
  }

  hearts(v) { return this.state(v).friend / 2; }

  /** +n friendship (capped); returns the amount actually added. Queues milestone scenes. */
  addFriend(v, n = 1) {
    const st = this.state(v);
    const before = st.friend;
    st.friend = Math.max(0, Math.min(FRIEND_MAX, before + n));
    st.hearts = st.friend / 2;
    for (const m of MILESTONES) if (before < m && st.friend >= m && !st.ms[m]) this.game.npcScenes?.queueEvent?.({ kind: 'milestone', id: v.id, level: m });
    return st.friend - before;
  }

  topics(v, active = null) {
    const D = this.data(v.id);
    if (!D) return [];
    const st = this.state(v);
    const day = this.game.state.day;
    const out = [];
    for (const id of BASE_TOPICS) if (D.topics[id]) out.push({ id, label: D.topics[id].label, done: !!st.seen[id], on: id === active });
    for (const [id, T] of Object.entries(D.topics)) if (T.hidden && st.open[id]) out.push({ id, label: T.label, isNew: !st.seen[id], done: !!st.seen[id], on: id === active });
    out.push({ id: 'today', label: 'Today', isNew: st.seen.today !== day, on: active === 'today' });
    return out;
  }

  dailyLine(v) {
    const D = this.data(v.id);
    if (!D?.daily?.length) return null;
    const day = this.game.state.day | 0;
    const k = (day * 7 + v.id.length * 3) % D.daily.length;
    return D.daily[k];
  }

  /** Card callback: show a topic (lines + its open choices). */
  showTopic(v, id, card) {
    const D = this.data(v.id);
    if (!D || !card || card.closed) return;
    const st = this.state(v);
    const game = this.game;
    const p = card.portrait;
    if (id === 'today') {
      const first = st.seen.today !== game.state.day;
      st.seen.today = game.state.day;
      card.setChoices([]);
      card.setLines([this.dailyLine(v) || '...']);
      // the first chat of the day: a small friendship nudge
      if (first && this.addFriend(v, 0.5) > 0) { card.update({ hearts: st.hearts }); }
      p?.play?.('wave');
      card.update({ topics: this.topics(v, id) });
      game.save?.();
      return;
    }
    const T = D.topics[id];
    if (!T) return;
    st.seen[id] = game.state.day || 1;
    card.setLines(T.lines);
    const open = (T.choices || []).map((c, i) => ({ c, key: `${id}.${i}` }));
    card.setChoices(open.map(({ c, key }) => ({
      label: c.t,
      hint: st.picked[key] ? '' : this.hint(c),
      onPick: () => this.pick(v, c, key, card, id),
    })));
    card.update({ topics: this.topics(v, id) });
  }

  hint(c) {
    if (c.coins) return `+${c.coins} coins`;
    if (c.wood) return `+${c.wood} wood`;
    if (c.food) return 'a gift';
    return '';
  }

  pick(v, c, key, card, topic) {
    const game = this.game;
    const st = this.state(v);
    const first = !st.picked[key];
    st.picked[key] = 1;
    const p = card.portrait;
    if (c.anim) p?.play?.(c.anim);
    if (c.mood) { p?.mood?.(c.mood); setTimeout(() => { if (!card.closed) p?.mood?.(null); }, 4000); }
    card.setLines(c.r);
    const gained = [];
    if (first) {
      if (c.coins) { game.earnMisc?.(c.coins, 'gifts'); gained.push(`+${c.coins} coins`); game.audio?.play?.('coins', { volume: 0.4 }); }
      if (c.wood) { game.state.wood = (game.state.wood || 0) + c.wood; game.emit?.('wood', game.state.wood); gained.push(`+${c.wood} wood`); }
      if (c.food) { try { game.foodStore?.add?.(c.food.id, c.food.n || 1); } catch { /* ignore */ } gained.push(`+${c.food.n || 1} ${game.foodStore?.info?.(c.food.id)?.name || c.food.id}`); }
      if (c.f) { const n = this.addFriend(v, c.f); if (n > 0) gained.push('+friendship'); }
      if (c.unlock && !st.open[c.unlock]) { st.open[c.unlock] = 1; gained.push('New topic'); }
    }
    if (gained.length) card.reward(gained.join('  '));
    card.update({ hearts: st.hearts, topics: this.topics(v, topic) });
    // the other answers stay open until each was tried once
    const T0 = this.data(v.id).topics[topic];
    const rest = (T0?.choices || []).map((cc, i) => ({ cc, key: `${topic}.${i}` })).filter((x) => !st.picked[x.key]);
    card.setChoices(rest.map(({ cc, key: k }) => ({ label: cc.t, hint: this.hint(cc), onPick: () => this.pick(v, cc, k, card, topic) })));
    // a follow-up was opened: offer to jump to it
    if (first && c.unlock) {
      const T = this.data(v.id).topics[c.unlock];
      card.setChoices([{ label: `Ask about ${T.label.replace(/^The /, 'the ')}`, onPick: () => this.showTopic(v, c.unlock, card) }, { label: 'Maybe later.', onPick: () => card.setLines(['Anytime.']) }]);
    }
    game.save?.();
  }
}
