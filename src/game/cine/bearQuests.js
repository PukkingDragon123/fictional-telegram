// [v31 cine] Bear errands on the calendar (game.bearQuests): one bear knocks on Reynard's door per
// day (mornings to early afternoon, when nothing else is going on), plays its intro scene and
// starts its quest (src/data/questsBears.js). When an errand is done its outro scene plays at the
// next quiet moment (saved, so a reload never loses it). Quiet days sometimes get a drop-in talk
// scene with no quest (gossiping bears, Mop the janitor).
// State: game.state.cineQ = { day, seen: [scene ids], out: [pending outro scene ids] }.
import { BEAR_QUESTS, BEAR_QUEST_BY_ID } from '../../data/questsBears.js';
import { SCENES, DROP_INS } from './scenes.js';

export class BearQuests {
  constructor(game) {
    this.game = game;
    this.t = 3;
    game.on('questDone', (q) => {
      const d = BEAR_QUEST_BY_ID[q?.id];
      if (!d?.sceneOut) return;
      const S = this.S;
      if (!S.out.includes(d.sceneOut) && !S.seen.includes(d.sceneOut)) S.out.push(d.sceneOut);
      this.queueOutros();
    });
  }

  get S() {
    const st = this.game.state;
    const S = (st.cineQ ||= { day: 0, seen: [], out: [] });
    S.seen ||= []; S.out ||= [];
    return S;
  }

  scene(id) {
    const fn = SCENES[id];
    if (!fn) return null;
    return async (c) => {
      const S = this.S;
      if (!S.seen.includes(id)) S.seen.push(id);
      S.out = S.out.filter((x) => x !== id);
      await fn(c);
      this.game.save?.();
    };
  }

  queueOutros() {
    const D = this.game.director;
    if (!D) return;
    for (const id of this.S.out) { const f = this.scene(id); if (f) D.queue(f, { id }); }
  }

  onLoad() { this.queueOutros(); }

  update(dt) {
    const g = this.game, D = g.director;
    if (!D) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 2.5;
    const st = g.state;
    if (g.titleMode || !(st.tutorialDone || g.skipTutorial) || g.tutorial?.active) return;
    if (D.active || D.queueList.length) return;
    const S = this.S;
    if (S.day === st.day) return;
    if (st.phase !== 'day' || (st.hour || 0) < 8.6 || (st.hour || 0) > 14) return;
    if (!D.quiet()) return;
    const Q = g.quests?.S;
    if (!Q) return;
    // one bear errand per day, never more than 3 side jobs at once
    if ((Q.active || []).length < 3) {
      for (const q of BEAR_QUESTS) {
        if (Q.active.includes(q.id) || Q.done.includes(q.id) || S.seen.includes(q.sceneIn)) continue;
        let ok = false;
        try { ok = q.avail(g); } catch { ok = false; }
        if (!ok) continue;
        S.day = st.day;
        D.queue(this.scene(q.sceneIn), { id: q.sceneIn });
        return;
      }
    }
    // nothing to ask for: maybe a drop-in
    S.day = st.day;
    const r = ((st.day * 7919) % 100) / 100;
    for (const [id, o] of Object.entries(DROP_INS)) {
      if (S.seen.includes(id) || st.day < o.day) continue;
      if (r < o.chance) { D.queue(this.scene(id), { id }); return; }
    }
  }

  /** debug: play a scene now (window.__game.bearQuests.play('critic_in')) */
  play(id) { const f = this.scene(id); if (f) return this.game.director.play(f, { id }); return null; }
}

export { BEAR_QUESTS };
