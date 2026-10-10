// [v26 tutorial] game.lessons: Reynard's progressive lessons, after the day-1 tour.
//
// One new thing at a time, just in time: lessons (src/game/lessons/progressive.js)
// watch the game (day, first 2-star hatch, first mutant, a decrypted section, the
// first feast, winter coming, a tent, a powerless machine, a full store...) and
// queue up. A queued lesson plays only in a quiet moment of the day (no feast
// camera, menu, cutscene, lab, classroom, home PC...) and never within one
// in-game hour of the last one. The teacher fox (src/ui/TeacherOverlay.js) runs
// to the real thing on screen, circles it and says 2-4 short lines with the
// player's own numbers; then a tiny goal goes into the notebook (a quest from
// src/data/lessons.js) and the matching chalkboard class unlocks (offered once).
// Everything learned is replayable from the notebook's Lessons page.
//
// API: play(id) (now, tests), replay('lesson:<id>' | 'class:<id>'), queue, busy,
//      force (true: run even with ?notut / no tutorial), seen(id), sync().
// Save: game.state.lessons = { v, seen: [], queue: [], last, flags: {}, classes: [], played: [] }.
import { TeacherOverlay } from '../../ui/TeacherOverlay.js';
import { Classroom, LESSONS as CLASS_BOOK } from '../Classroom.js';
import { LESSONS, LESSON_BY_ID, DAY1_CLASSES } from '../lessons/progressive.js';
import { CLASS_ORDER } from '../lessons/classes.js';
import '../../ui/lessons.css';

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const CORE = ['l_price', 'l_tips', 'l_stars', 'l_mutant', 'l_select', 'l_sections'];
const CORE_CLASSES = ['money101', 'genetics', 'mutations', 'breeding', 'unlocking'];
const BUSY_BODY = ['feast-cam', 'lt-pc', 'home-mode', 'pc-mode', 'class-mode'];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class Lessons {
  constructor(game) {
    this.game = game;
    this.busy = false;
    this.force = false;
    this.refs = {};
    this.checkT = 2;
    this.teacherObj = null;
    try { this.force = /[?&]lessons=1/.test(location.search); } catch { /* no location */ }
    const on = (ev, fn) => game.on(ev, (d) => { if (this.live()) try { fn(d); } catch (e) { console.warn('[lessons]', ev, e); } });
    on('eggHatched', (f) => {
      if (!f?.g) return;
      if (f.g.stars >= 2 && !this.flags.hatch2) { this.flags.hatch2 = 1; this.refs.hatch2 = f; }
      if (f.g.mut && !this.flags.mutant) { this.flags.mutant = 1; this.refs.mutant = f; }
    });
    on('review', () => { this.flags.review = 1; });
    on('sectionUnlock', (d) => { if (!this.flags.section) this.flags.section = d?.name || 'A section'; });
    on('feastEvent', () => { this.flags.feastEvt = 1; });
    on('feastEnd', () => { this.flags.feastDone = 1; this.flags.feastDay = game.state.day; });
    on('weather', (d) => { if (d?.weather && d.weather !== 'clear') this.flags.wx = 1; });
  }

  // ---------------------------------------------------------------- state
  get S() {
    const st = this.game.state;
    const S = (st.lessons ||= { v: 1, seen: [], queue: [], last: -99, flags: {}, classes: [], played: [] });
    for (const k of ['seen', 'queue', 'classes', 'played']) if (!Array.isArray(S[k])) S[k] = [];
    S.flags ||= {};
    return S;
  }
  get flags() { return this.S.flags; }
  seen(id) { return this.S.seen.includes(id); }
  get queue() { return this.S.queue; }

  /** lessons run once the day-1 tour is done (not in ?notut test games, unless forced) */
  live() {
    const g = this.game;
    if (g.titleMode || g.state.phase === 'gameover') return false;
    if (this.force) return true;
    return !!g.state.tutorialDone && !g.skipTutorial;
  }

  onNewGame() { this.game.state.lessons = null; this.refs = {}; this.S; }
  onLoad() {
    const st = this.game.state;
    // an old save that already knows the basics: file the core lessons as learned, teach only what's new
    if (!st.lessons && st.tutorialDone && st.day >= 3) {
      const S = this.S;
      S.seen.push(...CORE);
      S.classes.push(...CORE_CLASSES);
    }
    this.S;
    this.refs = {};
    setTimeout(() => this.sync(), 600);
  }

  // ---------------------------------------------------------------- loop
  update(simDt, dt) {
    if (!this.live() || this.busy) return;
    this.checkT -= dt || simDt || 0;
    if (this.checkT > 0) return;
    this.checkT = 1;
    const g = this.game, S = this.S;
    if (g.state.phase !== 'day') return;
    // new triggers join the queue (in book order = priority)
    for (const L of LESSONS) {
      if (S.seen.includes(L.id) || S.queue.includes(L.id)) continue;
      let ok = false;
      try { ok = !!L.when(g, this); } catch { ok = false; }
      if (ok) S.queue.push(L.id);
    }
    if (!S.queue.length) return;
    S.queue.sort((a, b) => LESSONS.findIndex((l) => l.id === a) - LESSONS.findIndex((l) => l.id === b));
    if (!this.quiet()) return;
    const now = g.state.day * 24 + g.state.hour;
    if (now - (S.last ?? -99) < 1) return; // never more than one lesson per in-game hour
    if (g.state.hour < 9.6 || g.state.hour > 16.45) return; // not in the morning bustle, not right before the feast
    const id = S.queue.shift();
    if (LESSON_BY_ID[id]) this.play(id);
  }

  /** a calm moment of the day: nothing on screen that a lesson would talk over */
  quiet() {
    const g = this.game, ui = g.ui;
    if (!ui || g.state.paused || g.inputLocked || g.titleMode) return false;
    if (g.feast?.active || g.tutorial?.active || g.cutscene?.active || g.cine?.active || g.lab?.active || g.classroom?.active) return false;
    if (g.homes?.active || g.bedtime?.active || g.npcScenes?.busy || g.zones?.busy || g.bossFight?.active) return false;
    if (ui.panel || ui.ebuy || ui.blueprint?.open || ui.busy || ui.unboxing || ui.matchCard || ui.questLog?.isOpen) return false;
    if (ui.foxTalking?.()) return false;
    try {
      const b = document.body.classList;
      if (BUSY_BODY.some((c) => b.contains(c))) return false;
      if (document.querySelector('.tut-choice, #modal:not(.hidden), .fsc:not(.hidden), .lsn-tag')) return false;
    } catch { /* no DOM */ }
    return true;
  }

  // ---------------------------------------------------------------- the teacher
  teacher() {
    if (this.teacherObj) return this.teacherObj;
    try { this.teacherObj = new TeacherOverlay({ game: this.game, root: document.body }); } catch (e) { console.warn('[lessons] teacher', e); this.teacherObj = null; }
    return this.teacherObj;
  }

  screen(x, y, z) { const q = this.game.ui.screenOf(x, y, z); return { x: q.x, y: q.y }; }
  // lesson `at` -> a TeacherOverlay target (and swing the camera over to world things)
  target(at, look = true) {
    const g = this.game;
    if (!at) return null;
    if (typeof at === 'string') return at;
    if (at.fish) {
      const f = at.fish;
      if (look && !f.dead) g.rig.lookAt(f.x, f.z);
      return () => (f.dead ? { x: innerWidth / 2, y: innerHeight / 2 } : this.screen(f.x, (f.y || 0) + 0.2, f.z));
    }
    if (at.struct) {
      const s = at.struct;
      if (look) g.rig.lookAt(s.x + 0.5, s.z + 0.5);
      return () => this.screen(s.x + 0.5, (g.structures.baseY?.(s) || 0) + 0.7, s.z + 0.5);
    }
    if (at.x != null && at.z != null) {
      if (look) g.rig.lookAt(at.x, at.z);
      return () => this.screen(at.x, (g.grid?.groundAt?.(at.x, at.z) || 0) + 0.8, at.z);
    }
    return null;
  }

  // the lesson's slate tag (title, beat counter, skip)
  tag(def, n) {
    this.untag();
    const el = document.createElement('div');
    el.className = 'lsn-tag';
    el.innerHTML = `<span class="lsn-k">LESSON</span><b class="lsn-t">${esc(def.title)}</b><span class="lsn-n"></span><button type="button" class="lsn-skip" title="Skip this lesson">skip</button>`;
    el.querySelector('.lsn-skip').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.skip(); });
    document.body.appendChild(el);
    this.tagEl = el;
    this.setBeat(0, n);
  }
  setBeat(i, n) { const e = this.tagEl?.querySelector('.lsn-n'); if (e) e.textContent = `${Math.min(i + 1, n)}/${n}`; }
  untag() { this.tagEl?.remove(); this.tagEl = null; }
  skip() {
    this.abort = true;
    this.game.audio?.play?.('click', { volume: 0.4 });
    try { this.teacherObj?.skip(); } catch { /* ignore */ }
    this._choiceRes?.(false);
  }

  // two paper buttons under the bubble (resolves true for the first)
  choice(yes, no) {
    return new Promise((res) => {
      const el = document.createElement('div');
      el.className = 'tut-choice lsn-choice';
      el.innerHTML = `<button class="yes">${esc(yes)}</button><button class="no">${esc(no)}</button>`;
      const done = (v) => { if (!el.isConnected) return; this._choiceRes = null; el.classList.add('bye'); this.game.audio?.play?.(v ? 'pop_in' : 'click', { volume: 0.5 }); setTimeout(() => el.remove(), 250); res(v); };
      el.querySelector('.yes').addEventListener('click', (e) => { e.stopPropagation(); done(true); });
      el.querySelector('.no').addEventListener('click', (e) => { e.stopPropagation(); done(false); });
      this._choiceRes = done;
      document.body.appendChild(el);
      this.game.audio?.play?.('page', { volume: 0.4 });
    });
  }

  // ---------------------------------------------------------------- play
  /** Teach lesson `id` right now. replay: from the notebook (no goal, no class offer). */
  async play(id, { replay = false } = {}) {
    const g = this.game, def = LESSON_BY_ID[id];
    if (!def || this.busy) return false;
    let beats = null;
    try { beats = def.beats(g, this)?.filter(Boolean); } catch (e) { console.warn('[lessons] beats', id, e); }
    const S = this.S;
    if (!beats?.length) { if (!replay && !S.seen.includes(id)) S.seen.push(id); return false; }
    const t = this.teacher();
    if (!t) return false;
    this.busy = true; this.abort = false; this.current = id;
    const st = g.state, wasPaused = st.paused;
    st.paused = true;
    S.last = st.day * 24 + st.hour;
    if (!replay && !S.seen.includes(id)) S.seen.push(id);
    g.ui?.foodPicker?.hide?.();
    this.tag(def, beats.length);
    g.audio?.play?.('page', { volume: 0.4 });
    let classNow = false;
    try {
      await t.show({ greet: false });
      for (let i = 0; i < beats.length && !this.abort; i++) {
        const b = beats[i];
        this.setBeat(i, beats.length);
        const tgt = this.target(b.at);
        try { await t.clearChalk(); } catch { /* ignore */ }
        if (this.abort) break;
        if (tgt) {
          if (typeof tgt !== 'string') await wait(0.35); // the camera swings over first
          await t.goTo(tgt);
          if (b.circle !== false) t.circle(tgt, { color: 'yellow' });
        }
        if (this.abort) break;
        await t.say(b.say, { wait: true, mood: b.mood || 'normal' });
      }
      // the full class: offered once, the first time
      if (!replay && !this.abort && def.cls && CLASS_BOOK[def.cls]) {
        const fresh = !S.classes.includes(def.cls);
        if (fresh) S.classes.push(def.cls);
        if (fresh && !S.played.includes(def.cls)) {
          t.say(`Want the full class? <b>${esc(CLASS_BOOK[def.cls].title)}</b>: chalkboard, diagrams, the works.`, { wait: false, mood: 'excited' });
          classNow = await this.choice('Class now!', 'Later');
          if (!classNow && !this.abort) await t.say('It\'s in my <b>notebook</b>, under Lessons. Whenever you like.', { wait: true, mood: 'wink' });
        }
      }
    } catch (e) { console.warn('[lessons] play', id, e); }
    try { await t.clearChalk(); await Promise.race([t.hide(), wait(3)]); } catch { /* ignore */ }
    this.untag();
    st.paused = wasPaused;
    g.ui?.syncFoodPicker?.();
    this.busy = false; this.current = null;
    if (!replay && def.goal && !this.abort) {
      const Q = g.quests?.S;
      if (Q && !Q.done.includes(def.goal) && !Q.active.includes(def.goal)) try { g.quests.start(def.goal); } catch (e) { console.warn('[lessons] goal', e); }
    }
    this.abort = false;
    this.sync();
    g.save?.();
    if (classNow) await this.playClass(def.cls);
    g.emit('lesson', { id, replay });
    return true;
  }

  async playClass(id) {
    const g = this.game;
    if (!CLASS_BOOK[id] || g.classroom?.active) return false;
    const S = this.S;
    if (!S.played.includes(id)) S.played.push(id);
    if (!S.classes.includes(id) && !DAY1_CLASSES.some(([k]) => k === id)) S.classes.push(id);
    try {
      g.classroom ||= new Classroom(g);
      g.ui?.foodPicker?.hide?.();
      await g.classroom.lesson(id);
    } catch (e) { console.warn('[lessons] class', id, e); }
    g.ui?.syncFoodPicker?.();
    this.sync();
    return true;
  }

  /** from the notebook: 'class:<id>' plays the chalkboard class, 'lesson:<id>' re-teaches a lesson */
  async replay(key) {
    const [kind, id] = String(key).split(':');
    const QL = this.game.ui?.questLog;
    if (QL?.isOpen) { try { await Promise.race([QL.close(), wait(1.5)]); } catch { /* ignore */ } }
    await wait(0.2);
    if (kind === 'class') return this.playClass(id);
    return this.play(id, { replay: true });
  }

  // ---------------------------------------------------------------- the notebook's Lessons page
  book() {
    const S = this.S, g = this.game;
    const out = [];
    if (g.state.tutorialDone) for (const [id, title] of DAY1_CLASSES) if (CLASS_BOOK[id]) out.push({ id: 'class:' + id, title, kind: 'class' });
    for (const id of CLASS_ORDER) if (S.classes.includes(id) && CLASS_BOOK[id]) out.push({ id: 'class:' + id, title: CLASS_BOOK[id].title, kind: 'class', fresh: !S.played.includes(id) });
    for (const L of LESSONS) if (S.seen.includes(L.id)) out.push({ id: 'lesson:' + L.id, title: L.title, kind: 'lesson', icon: L.icon });
    return out;
  }
  sync() {
    const g = this.game;
    const list = this.book();
    if (!list.length && !g.ui?.questLog) return;
    try { g.ui?.ensureQuestLog?.()?.setLessons?.(list, (key) => this.replay(key)); } catch (e) { console.warn('[lessons] notebook', e); }
  }
}

export function install(game) { return new Lessons(game); }
