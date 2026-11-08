import * as THREE from 'three';
// First-day tutorial. [v33 tut] The hands-on tour. [v33 tut2] Rewritten to teach the real game, step by
// step, in Reynard's dialogue box (the classroom's speech box: src/game/tutorial/tourBox.js).
//
// It opens inside Reynard's room (a returning player answers "I know the drill" there: the only way
// to skip), then Reynard is IN THE WORLD: he walks to every thing he talks about, points at it (his arm
// reaches for it, a pixel hand + ring sit on it) and the camera goes in close. Everything he says is in
// the dialogue box at the bottom of the screen (at the top when what he teaches is down there, like
// the hotbar). Talk beats are short Director scenes (camera moves; his lines in the same box); in
// between, you do it in the real UI, with a fallback for every wait. The HUD arrives one piece at a
// time (src/game/tutorial/hudIntro.js): the slot appears, Reynard explains it, you try it.
//
//   room -> the opening crane ->
//   1 The Goal          coins + the clock: day, the 5 PM feast, the night report
//   2 Buying Fish       e-Buy: buy the pair, unbox it, a boy + a girl
//   3 Feeding           the Food slot, you feed them, hunger + the well-fed heart
//   4 The Fish Scope    tap a fish, every stat one by one with this fish's numbers, its worth
//   5 Fish Care         Pet (happiness), pond room, Tag (DO NOT EAT), Carry
//   6 Eggs & Fry        the date, eggs, dad fertilizes, incubation, you hatch one, the fry
//   7 What Sells        the Scope on the fry: worth, size + colour from the parents, the money rule
//   8 The Feast         Bear Corp, the trail, what bears eat / pay / want, rating, rampage, the report
//   9 Research          the Lab slot, research Hire Beavers
//  10 Building          order the crew on e-Buy, the Build slot, place the lodge, research + place the Snack Bar
//  11 Farming           research carrots, plant, harvest, pay the beavers
//  12 Clearing Land     the Wood Garage, the Destroy slot, box the trees
//  13 Your Day          the speed control, the daily loop, tomorrow 5 PM
//
// No skip button: the room's first question is the way out. Every wait still races the internal
// skip (skipNow), so it ends the tour from any step and catches the save up (finishSkipped).
// Debug: ?autostart=new&tutfrom=<chapter> jumps straight to a chapter (ids in CHAPTERS below).
import { HUT, OFFICE, MEADOW } from '../world/worldgen.js';
import { STRUCTURES } from '../data/structures.js';
import { ynPair } from '../ui/ynButtons.js'; // [v27 knobs] painted YES / NO planks
import { TUT_SCENES } from './cine/tutorialScenes.js'; // [v31 guide]
import { floatTitle } from '../ui/kinetic/floatText.js'; // [v31 guide]
import { Guide } from './tutorial/stage.js'; // [v33 tut]
import { worldOf } from './tutorial/marks.js'; // [v33 tut]
import { introduce, hudTarget, toolPicked } from './tutorial/hudIntro.js'; // [v33 tut]
import { finishSkipped, TOUR_FEATURES } from './tutorial/skip.js'; // [v33 tut]
import { TourBox } from './tutorial/tourBox.js'; // [v33 tut2] the dialogue box
import { firstFish, feeding, fishScope, fishCare, loveEggs, whatSells } from './tutorial/fishCourse.js'; // [v33 tut]
import { rollGenes } from './genes.js';

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const SKIP = { tutSkip: true }; // what every wait rejects with once the tour is skipped
const strip = (t) => String(t).replace(/<[^>]+>/g, '').replace(/\*/g, '');

// v17: the research tree's stable bits (src/ui/LabTree.js, owned by the labtree
// helper). If the tree's markup changes, fix it here only.
const LAB_SEL = {
  node: (id) => `.lt-node[data-id="${id}"], [data-r="${id}"]`, // tree node (or the plain fallback card)
  go: '.lt-go', // the detail panel's RESEARCH button
  bench: '.lt-bench', // the bench bar with the running jobs
  job: (id) => `.lt-slotc[data-job="${id}"]`, // one running job on the bench
  labBtn: '.labui [data-a="research"]', // the "research" icon in Reynard's 3D lab (tree closed)
};
const TUT_RESEARCH_BOOST = 4; // research runs this many times faster during the tour
const PARTS = 13;

export const ALL_FEATURES = ['coins', 'ebuy', 'build', 'clear', 'feed', 'hand', 'tag', 'pet', 'clock', 'speed', 'rating', 'lab', 'dex', 'reviews', 'match', 'terraform'];

// the chapters in order: [id, features a finished chapter has unlocked (for ?tutfrom= jumps)]
const CHAPTERS = [
  ['room', []], ['opening', ['coins', 'clock']], ['first', ['ebuy']], ['feed', ['feed']], ['scope', []], ['care', ['pet', 'tag', 'hand']],
  ['love', []], ['sells', []], ['feast', []], ['science', ['lab']], ['hardhats', ['build']], ['green', []], ['timber', ['clear']], ['wrap', ['speed']],
];

/** a target for the pointing hand (marks.ui): 'sel:<css>' -> the selector */
const uiTarget = (t) => (typeof t === 'string' && t.startsWith('sel:') ? t.slice(4) : t);

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.teacher = null; // [v33 tut2] the old screen-space guide is retired (the dialogue box: this.box)
    this.box = null;
    this.skipping = false;
    this.pair = [];
    this.holdLove = false;
    this._abort = new Promise((_, rej) => { this._abortRej = rej; });
    this._abort.catch(() => {});
  }

  // ------------------------------------------------------------ waits (every one of them stops on SKIP)
  isSkip(e) { return !!(e && e.tutSkip); }
  /** race anything with the skip */
  g(p) { const q = Promise.race([Promise.resolve(p), this._abort]); q.catch(() => {}); return q; }
  wait(s) { return this.g(sleep(s)); }
  /** true if `p` settles within `s` seconds, false if the time ran out */
  within(p, s) { return this.g(Promise.race([Promise.resolve(p).then(() => true, () => true), sleep(s).then(() => false)])); }

  // Resolves when `ev` fires (and passes `pred`, if given)
  until(ev, pred = null) {
    this.stage = 'until:' + ev; // where the tour is waiting (debug / tests)
    return this.g(new Promise((res) => {
      const fn = (d) => {
        if (pred && !pred(d)) return;
        const L = this.game.listeners[ev];
        L.splice(L.indexOf(fn), 1);
        res(d);
      };
      this.game.on(ev, fn);
    }));
  }

  // polls a condition (for things that have no event)
  waitFor(test, every = 0.25) {
    this.stage = 'waitFor';
    return this.g(new Promise((res) => {
      const tick = () => {
        if (this.skipping) return;
        let ok = false; try { ok = test(); } catch { ok = false; }
        if (ok) res(); else setTimeout(tick, every * 1000);
      };
      tick();
    }));
  }

  /** end the tour now ("I know the drill" in the room): stop whatever is playing, reject every wait */
  skipNow() {
    if (this.skipping || !this.active) return;
    this.skipping = true;
    this.stage = 'skipped';
    try { if (this.game.director?.active) this.game.director.skip(); } catch { /* ignore */ }
    try { if (this.game.classroom?.active) this.game.classroom.skip(); } catch { /* ignore */ }
    try { this.box?.skip(); } catch { /* ignore */ }
    this._abortRej(SKIP);
  }

  // [v31 guide] a part card between the tour's sections: PART n OF 13 + the name in Alagard
  async part(n, title) {
    const game = this.game;
    this.stage = 'part:' + n;
    await this.hideTeacher();
    game.audio?.play?.('page', { volume: 0.45 });
    const h = floatTitle({ kicker: `PART ${n} OF ${PARTS}`, title, style: 'happy', y: 0.2, ms: 1700 });
    await this.g(Promise.race([h.done, sleep(2.6)]));
  }

  // [v31 guide] a step done: Reynard cheers, confetti and a jingle
  win(word, at = null) {
    const game = this.game;
    const f = game.fox;
    const p = at && !at.dead ? { x: at.x, y: (at.y || 0) + 0.8, z: at.z } : { x: f.x, y: f.y + 2.3, z: f.z };
    void word;
    f.react?.('cheer', 1.4);
    game.particles?.confetti?.(p.x, p.y, p.z, 26);
    game.audio?.play?.('star_pop', { volume: 0.45 });
  }

  // ------------------------------------------------------------ the dialogue box [v33 tut2]
  getBox() {
    if (!this.box) { try { this.box = new TourBox(this.game); } catch (e) { console.warn('[tut] box', e); this.box = null; } }
    return this.box;
  }
  /** a line in the box that doesn't wait (an instruction stays up while you do it) */
  line(text, { mood = 'happy', target = null, place = null } = {}) {
    if (this.skipping) return null;
    const b = this.getBox();
    if (!b) return null;
    try { return b.say(text, { mood, target, place }); } catch (e) { console.warn('[tut] line', e); return null; }
  }
  async hideTeacher() {
    this._ptr?.(); this._ptr = null;
    try { this.box?.hide(); } catch { /* ignore */ }
  }
  clearChalk() { this._ptr?.(); this._ptr = null; }

  // a Yes / No pair of planks under Reynard's question (resolves true for the first button)
  ask(question, [yesLabel, noLabel]) {
    const game = this.game;
    this.stage = 'ask:' + strip(question).slice(0, 20);
    try { this.game.lab?.fox?.talk?.(strip(question)); } catch { /* ignore */ }
    this.line(question, { mood: 'happy', place: 'top' });
    return this.g(new Promise((res) => {
      const el = document.createElement('div');
      el.className = 'tut-choice';
      el.innerHTML = `<button class="yes">${yesLabel}</button><button class="no">${noLabel}</button>`;
      const done = (v) => { el.classList.add('bye'); game.audio.play(v ? 'pop_in' : 'click', { volume: 0.5 }); setTimeout(() => el.remove(), 250); res(v); };
      el.querySelector('.yes').addEventListener('click', (e) => { e.stopPropagation(); done(true); });
      el.querySelector('.no').addEventListener('click', (e) => { e.stopPropagation(); done(false); });
      document.body.appendChild(el);
      try { ynPair(el.querySelector('.yes'), el.querySelector('.no'), { keys: true }); } catch (e) { console.warn('yn', e); } // [v27 knobs]
      game.audio.play('page', { volume: 0.4 });
    }));
  }

  /** a line in Reynard's room (the 3D fox talks, the words are in the box) */
  async lab(text, expr, mood = 'normal') {
    const L = this.game.lab;
    this.stage = 'room:' + strip(text).slice(0, 20);
    try { L?.fox?.talk?.(strip(text)); if (expr) L?.fox?.setExpression?.(expr, { hold: 2.5 }); } catch { /* ignore */ }
    const b = this.getBox();
    if (b) await this.g(b.say(text, { mood: expr || mood, wait: true, place: 'bottom' }));
    else await this.wait(2);
  }

  /** Reynard says a line in the box. target: keep the box off it (a HUD slot, a selector, a world thing);
   *  circle: also a pointing hand on it (until his next line). wait: tap to go on. Never throws. */
  async teach(text, { target = null, circle = false, wait: w = false, mood = 'normal', place = null } = {}) {
    if (this.skipping) return;
    this.stage = 'teach:' + strip(text).slice(0, 24);
    this._ptr?.(); this._ptr = null;
    if (circle && target) { const h = this.guide.marks.ui(uiTarget(target)); this._ptr = () => h.stop(); }
    const b = this.getBox();
    if (!b) { await this.wait(w ? 3 : 1); return; }
    try { await this.g(b.say(text, { mood, wait: w, target: uiTarget(target), place })); } catch (e) { if (!this.isSkip(e)) console.warn('[tut] teach', e); }
  }

  // keep a pointing hand on a HUD / UI thing while we wait for the player
  pointAt(target) {
    const t = uiTarget(target);
    if (!t) return () => {};
    const h = this.guide.marks.ui(t);
    return () => h.stop();
  }

  /** [v33 tut] a HUD piece arrives (src/game/tutorial/hudIntro.js) */
  hud(feature, o = {}) { return introduce(this, feature, o); }
  slot(feature) { return hudTarget(this.game, feature); }

  /** [v33 tut] a world thing: Reynard walks over, points at it and says it in the box (the line stays up).
   *  mark: also a ring + hand (+ label) on it. Returns stop() for the pointing. */
  async tell(target, text, { mark = false, label = null, color = 'gold', mood = 'happy', walk = true } = {}) {
    if (this.skipping) return () => {};
    const G = this.guide;
    if (walk && target) { try { await this.g(G.walkNear(target)); } catch (e) { if (this.isSkip(e)) return () => {}; } }
    const stop = target ? G.point(target, { ring: mark, arrow: mark, label: mark ? label : null, color }) : null;
    this.line(text, { mood, target });
    this.stage = 'tell:' + strip(text).slice(0, 20);
    return stop || (() => {});
  }

  /** [v33 tut] keep the camera on a thing while you play (a fish, [x, z], () => ...); null lets go */
  frame(target, zoom = 0.02) {
    this.focus = target || null;
    if (!target) return;
    this.follow = false;
    const p = worldOf(this.game, target);
    if (p) this.game.rig.lookAt(p.x, p.z);
    if (zoom) this.game.rig.wuppGoal = zoom;
  }

  // play one or more cutscenes from src/game/cine/tutorialScenes.js back to back (one letterbox)
  scene(...ids) {
    return this.cine(async (c) => { for (const id of ids) await TUT_SCENES[id]?.(c); }, { pause: true, id: 'tut:' + ids.join('+') });
  }

  /** [v33 tut] a Director scene with the tour's stage helpers (c.point, c.hold, c.low, c.ots, c.mark...).
   *  [v33 tut2] Reynard's c.say lines go in the dialogue box (other characters keep their comic bubbles). */
  async cine(fn, { pause = false, id = 'tut' } = {}) {
    const game = this.game, D = game.director;
    if (this.skipping) throw SKIP;
    if (!D) return false;
    this.stage = 'scene:' + id;
    await this.hideTeacher();
    game.ui?.foodPicker?.hide?.();
    const rig = game.rig;
    const pitch0 = rig.pitchGoal ?? rig.pitch;
    const follow = this.follow;
    this.follow = false;
    let ok = false;
    try {
      ok = await this.g(D.play(async (c) => { this.guide.extend(c); this.boxScene(c, D); await fn(c); }, { pause, id }));
    } catch (e) {
      if (this.isSkip(e)) throw e;
      console.warn('[tutorial] scene', id, e);
    } finally {
      try { this.box?.hide(); } catch { /* ignore */ }
      rig.pitchGoal = pitch0;
      this.guide.clear();
      this.guide.keep();
      this.follow = follow;
      game.ui?.syncFoodPicker?.();
    }
    return ok;
  }

  /** [v33 tut2] route Reynard's scene lines to the dialogue box (a tap / Enter moves on, like the bubbles) */
  boxScene(c, D) {
    const say0 = c.say;
    const T = this;
    c.say = async (who, text, o = {}) => {
      if (who !== c.fox) return say0(who, text, o);
      if (c.skipped || T.skipping) return;
      const b = T.getBox();
      if (!b) return say0(who, text, o);
      const style = o.style || 'say';
      const anim = o.anim || (style === 'laugh' ? 'laugh_evil' : style === 'scared' ? 'cower' : style === 'angry' ? 'angry_stomp' : 'talk');
      try { who.hold?.(anim); } catch { /* ignore */ }
      if (o.close && typeof who.x === 'number') c.shot([who.x, who.z], { zoom: typeof o.close === 'number' ? o.close : 0.0105, dur: 0.8, ease: 'out', lift: (typeof who.y === 'number' ? who.y : 0) + 0.55 });
      const adv = () => { if (D.skipped) b.skip(); else b.advance(); };
      D.adv = adv;
      try { await b.say(text, { mood: style, wait: true, auto: o.auto ?? null, place: o.place || null, target: o.target || null }); } finally {
        if (D.adv === adv) D.adv = null;
        try { who.hold?.(null); } catch { /* ignore */ }
      }
      await c.beat(0.08);
    };
    return c;
  }

  // the parcel lands: point at it until it's unboxed
  async unboxStep(pred) {
    const game = this.game;
    const landed = () => game.delivery.waiting().some((p) => pred(p.order));
    // listen for the unboxing right away: a quick tap must not slip past us
    const delivered = this.until('delivered', pred);
    // the moose takes its time: wait as long as an order is on its way (a slow machine runs game time slow)
    if (!landed()) await this.within(this.waitFor(() => landed() || !(game.delivery.pending?.() > 0) && !game.delivery.waiting().length), 240);
    if (!landed()) await this.within(this.until('parcelLanded', (p) => pred(p.order)), 20);
    // the camera swings over to the box so you can see what to tap
    const box = game.delivery.waiting().find((p) => pred(p.order));
    if (box) this.frame(box, 0.02);
    let done = false;
    delivered.then(() => { done = true; }, () => {});
    await this.wait(0.5);
    if (done) return;
    const ring = box ? this.guide.mark(box, { label: 'TAP!', color: 'gold' }) : null;
    const stop = await this.tell(box, 'Your parcel is here. <b>Tap the box</b> to unbox it.', { mood: 'excited' });
    this.nag(() => 'Tap the parcel to unbox it.', { world: true });
    this.stage = 'until:delivered';
    if (!(await this.within(delivered, 60))) {
      this.line('I\'ll open this one for you.', { mood: 'happy' });
      for (const p of game.delivery.waiting()) if (pred(p.order)) { try { game.delivery.unbox(p); } catch (e) { console.warn('[tut] unbox', e); } }
      await this.within(delivered, 8);
    }
    this.stopNag();
    stop?.();
    ring?.();
    this.frame(null);
  }

  /** wait for the first two fish to reach the pond (Reynard carries the bag); spawn them if the bag got lost */
  async firstPair() {
    const game = this.game;
    const adults = () => game.fish.list.filter((f) => f.adult && !f.tank && !f.dead);
    // Reynard carries the bag to the pond (an errand): wait for him, then for the splash
    const busy = () => game.fox.errands?.length > 0 || game.delivery.pending?.() > 0 || game.delivery.waiting().length > 0;
    await this.within(this.waitFor(() => adults().length >= 2 || !busy()), 150);
    if (!(await this.within(this.waitFor(() => adults().length >= 2), 8))) this.spawnPair(2 - adults().length);
    await this.wait(0.8);
    const all = adults();
    let boy = all.find((f) => f.g.sex === 'M'), girl = all.find((f) => f.g.sex === 'F' && f !== boy);
    if (!boy) { boy = all.find((f) => f !== girl); if (boy) boy.g.sex = 'M'; }
    if (!girl) { girl = all.find((f) => f !== boy); if (girl) girl.g.sex = 'F'; }
    this.pair = [boy, girl].filter(Boolean);
    return this.pair;
  }

  spawnPair(n = 2, names = null) {
    const game = this.game;
    const out = [];
    const have = game.fish.list.filter((f) => f.adult && !f.tank);
    const sexes = ['M', 'F'].filter((s) => !have.some((f) => f.g.sex === s));
    while (sexes.length < n) sexes.push(sexes.length % 2 ? 'F' : 'M');
    for (let i = 0; i < n; i++) {
      const p = game.fish.randomWaterPoint();
      if (!p) continue;
      const g = rollGenes('bluegill', game.mods, { sex: sexes[i] });
      g.traits = []; g.morph = 'normal'; g.size = +(0.98 + Math.random() * 0.1).toFixed(2); g.stars = 1;
      const f = game.fish.spawn('bluegill', p.x, p.z, { adult: true, hunger: 0.3, g, splash: true });
      if (f) { if (names) f.name = names[i]; out.push(f); }
    }
    return out;
  }

  // ------------------------------------------------------------ the tour
  async run() {
    try { await this.tour(); } catch (e) {
      if (!this.isSkip(e)) console.warn('[tutorial] failed, catching the save up', e);
      try { finishSkipped(this); } catch (e2) { console.warn('[tutorial] finish', e2); }
    } finally {
      this.game.researchBoost = 1; // research runs at normal speed after the tour (or if it fails)
      this.stopNag();
      this.holdLove = false;
      try { this.box?.dispose(); } catch { /* ignore */ }
      this.box = null;
    }
  }

  async tour() {
    const game = this.game;
    this.active = true;
    game.tutorialHold = true; // the clock waits until the tour is over
    game.state.unlocked = [];
    game.ui?.refreshUnlocks?.();
    this.guide = new Guide(this);
    const from = new URLSearchParams(location.search).get('tutfrom');
    let start = 0;
    if (from && CHAPTERS.some(([id]) => id === from)) { start = CHAPTERS.findIndex(([id]) => id === from); await this.jumpTo(start); }
    const RUN = {
      room: () => this.chRoom(), opening: () => this.chOpening(), first: () => firstFish(this), feed: () => feeding(this), scope: () => fishScope(this),
      care: () => fishCare(this), love: () => loveEggs(this), sells: () => whatSells(this), feast: () => this.chFeast(), science: () => this.chScience(),
      hardhats: () => this.chHardHats(), green: () => this.chGreen(), timber: () => this.chTimber(), wrap: () => this.chWrap(),
    };
    for (let i = start; i < CHAPTERS.length; i++) {
      if (this.skipping) throw SKIP;
      this.chapter = CHAPTERS[i][0];
      await RUN[this.chapter]();
      this.guide.clear();
    }
    this.finish();
  }

  finish() {
    const game = this.game;
    try { this.box?.dispose(); } catch { /* ignore */ }
    this.box = null;
    try { game.fox.rig?.setOutfit?.('default'); } catch { /* ignore */ }
    this.guide?.dispose();
    if (game.fox) game.fox.cine = null;
    this.follow = false;
    game.setTool({ kind: 'feed' });
    for (const f of TOUR_FEATURES) game.unlockFeature(f, { quiet: true });
    game.tutorialHold = false;
    game.state.tutorialDone = true;
    this.active = false;
    game.save();
  }

  /** ?tutfrom=<chapter>: start mid-tour with what the earlier chapters would have left */
  async jumpTo(idx) {
    const game = this.game;
    const fox = game.fox;
    fox.x = HUT.x + 1.5; fox.z = HUT.z + 3.4; fox.heading = Math.PI / 2;
    game.state.paused = false;
    game.rig.lookAt(fox.x, fox.z + 1, true);
    game.rig.wupp = game.rig.wuppGoal = 0.022;
    for (let i = 0; i < idx; i++) for (const f of CHAPTERS[i][1]) game.unlockFeature(f, { quiet: true });
    const id = CHAPTERS[idx][0];
    const after = (c) => idx > CHAPTERS.findIndex(([x]) => x === c);
    if (after('first')) { this.pair = this.spawnPair(2, ['Clyde', 'Bonnie']); this.holdLove = !after('care'); game.quickEggs = !after('love'); }
    if (after('feed')) for (const f of this.pair) { f.fed = 1; f.hunger = 0.1; }
    if (this.pair.length === 2) { const [a, b] = this.pair; this.frame(() => [(a.x + b.x) / 2, (a.z + b.z) / 2], 0.022); }
    if (after('science')) game.research('r_beavers');
    if (after('hardhats')) game.research('r_snackbar');
    if (after('green')) game.research('r_carrot');
    if (after('timber')) game.research('r_woodgarage');
    game.ui?.refreshUnlocks?.();
    this.guide.keep();
    console.log('[tutorial] jumped to', id);
    await this.wait(1.5);
  }

  // ------------------------------------------------------------ the room + the opening (part 1: the goal)
  async chRoom() {
    const game = this.game;
    const L = game.lab;
    // ---- inside the fox's room: Reynard in his classic suit (top hat, waistcoat)
    L.enterTutorial();
    try { L.fox?.setOutfit?.('default'); game.fox.rig?.setOutfit?.('default'); } catch { /* ignore */ }
    await this.wait(2.4);
    await this.g(L.tutorialStand());
    await this.lab('There you are! I\'m <b>Reynard</b>. I run the fish pond down the hill, and you\'re my new partner.', 'happy', 'excited');
    const fresh = await this.ask('First day running a fish pond?', ['First time!', 'I know the drill']);
    if (!fresh) {
      if (await this.ask('Skip the tour, then?', ['Skip the tour', 'Show me anyway'])) {
        await this.lab('Then the pond is all yours. The bears come tomorrow at <b>5 PM</b>.', 'laugh', 'excited');
        this.skipNow();
        throw SKIP;
      }
      await this.lab('A refresher it is. Quick and practical.', 'smug');
    } else {
      await this.lab('Then I\'ll walk you through it, step by step. You\'ll do every bit yourself.', 'happy');
    }
    await this.lab('The business: bears from the office up the hill eat at our pond at <b>5 PM</b>. We raise the fish, they <b>pay coins</b>.', 'scheming');
    await this.lab('Coins buy more fish, food and buildings. A bigger pond feeds more bears, and more bears pay more.', 'greedy');
    await this.lab('Come on, the pond is outside.', 'excited', 'excited');
    await this.g(L.walkOut());
  }

  async chOpening() {
    const game = this.game;
    // ---- out of the hut door, down to the (empty) pond
    const fox = game.fox;
    fox.x = HUT.x + 1.5; fox.z = HUT.z + 3.2; fox.heading = Math.PI / 2;
    game.rig.lookAt(fox.x, fox.z + 1, true);
    game.rig.wupp = game.rig.wuppGoal = 0.022;
    game.state.paused = false;
    await this.g(this.irisOpen(fox.x, 1, fox.z));
    const pond = game.shoreTiles().sort((a, b) => Math.hypot(a[0] - fox.x, a[1] - fox.z) - Math.hypot(b[0] - fox.x, b[1] - fox.z))[0];
    if (pond) fox.target = { x: pond[0] + 0.5, z: pond[1] + 0.5 };
    this.follow = true;
    await this.wait(1.6);
    this.guide.keep();
    // ---- the opening crane over the valley: where the bears come from, down to the empty pond
    await this.scene('opening');
    await this.part(1, 'The Goal');
    await this.hud('coins', { line: 'Your <b>coins</b>. Bears pay into this. You spend it on fish, food and buildings.', mood: 'greedy' });
    await this.hud('clock', { line: 'The <b>clock</b> runs the day. Daytime: get ready. <b>5 PM</b>: the bears\' feast. Night: the <b>report</b> on how you did.', mood: 'happy' });
    await this.teach('Today is <b>day 1</b>: no bears yet. The clock waits while I show you around.', { target: this.slot('clock'), wait: true, mood: 'happy' });
  }

  // ------------------------------------------------------------ 8. THE FEAST
  async chFeast() {
    const game = this.game;
    await this.part(8, 'The Feast');
    const ok = await this.cine(async (c) => {
      const O = c.office || OFFICE;
      const f = game.fox;
      const P = game.shoreTiles?.()[0];
      // up the mountain: Bear Corp
      await c.shot([O.x, O.z + 4], { zoom: 0.03, dur: 1.4, lift: (O.h || 6) + 2 }); // (the old 'tomorrow' framing: the tower in shot)
      await c.say(c.fox, 'Up the hill is <b>Bear Corp</b>. From tomorrow, at <b>5 PM</b> every day but Sunday, the office empties.', { style: 'say' });
      // down the trail to the pond
      await c.shot([(O.x + f.x) / 2, (O.z + f.z) / 2], { zoom: 0.032, dur: 1.8 });
      await c.say(c.fox, 'The bears run down this trail, jump in the pond and <b>catch fish</b>. They go for grown fish before fry.', { style: 'say' });
      await c.shot([f.x - 0.4, f.z], { zoom: 0.02, dur: 1.4 });
      if (P) c.point([P[0] + 0.5, P[1] + 0.5], { ring: false, arrow: false });
      await c.say(c.fox, 'Each bear pays for what it eats: the fish\'s <b>worth</b>. Some also want a side dish from a <b>Snack Bowl</b>.', { style: 'greedy' });
      await c.say(c.fox, 'Tagged fish are never eaten. Neither are fish in tanks or under shelters.', { style: 'say' });
      await c.say(c.fox, 'A full bear leaves a good <b>review</b> and tips: <b>5 stars</b> add 25%, 4 stars 10%.', { style: 'happy' });
      await c.say(c.fox, 'No fish left and out of patience? It <b>rampages</b>, smashes things and gives zero stars.', { style: 'scared' });
      await c.say(c.fox, 'Reviews make your <b>rating</b>. A high rating brings more bears. Below 1 star, we\'re <b>closed</b>.', { style: 'say' });
      await c.say(c.fox, 'After the feast, the night <b>report</b>: coins in and out, the reviews, and a grade for the day.', { style: 'happy' });
    }, { pause: true, id: 'tut:feast' });
    if (!ok) await this.teach('At 5 PM the bears eat our fish and pay their worth. Full bears give good reviews; hungry ones rampage.', { wait: true });
    const stop = this.pointAt(this.slot('clock'));
    await this.teach('So before <b>5 PM</b>: enough fish for every bear, fed and grown, and your best one tagged.', { target: this.slot('clock'), wait: true, mood: 'scheming' });
    stop();
  }

  // ------------------------------------------------------------ 9. RESEARCH
  async chScience() {
    const game = this.game;
    await this.part(9, 'Research');
    await this.hud('lab', { line: 'The <b>LAB</b>. Every building, crop and new fish is researched here first. Research is <b>free</b>, it just takes time.', mood: 'excited' });
    (game.state.tips ||= {}).lodge = true; // the tour teaches the lodge itself
    game.researchBoost = TUT_RESEARCH_BOOST; // short timers while the tour runs (reset in run())
    await this.enterLab();
    const beaversDone = this.until('research', (r) => r?.id === 'r_beavers');
    await this.teach('The <b>research tree</b>. We need workers first: <b>Hire Beavers</b>.', { target: 'sel:' + LAB_SEL.node('r_beavers'), circle: true, wait: true, mood: 'happy' });
    try { this.labTree()?.select?.('r_beavers'); } catch { /* ignore */ }
    await this.wait(0.4);
    this.teach('Tap <b>RESEARCH</b> to start it.', { target: 'sel:' + LAB_SEL.go, mood: 'excited' });
    this.nag(() => 'Tap RESEARCH on Hire Beavers.');
    await this.guideResearch('r_beavers', { until: 'start', autoAfter: 60 });
    this.stopNag();
    if (!game.state.research.includes('r_beavers')) {
      await this.teach('It runs on the <b>bench</b>. One project per bench at a time.', { target: 'sel:' + LAB_SEL.bench, wait: true, mood: 'happy' });
      if (!game.state.research.includes('r_beavers')) await this.teach('Greyed-out ones need something first: an earlier project, or a neighbour you haven\'t met yet.', { wait: true, mood: 'happy' });
    }
    await this.guideResearch('r_beavers', { autoAfter: 90 });
    await this.within(beaversDone, 3);
    game.audio.play('fanfare', { volume: 0.5 });
    this.win('EUREKA!');
    await this.teach('Done! Whatever you research shows up in <b>e-Buy</b> or the <b>Build</b> menu.', { wait: true, mood: 'excited' });
    await this.leaveLab();
    await this.wait(0.4);
  }

  // ------------------------------------------------------------ 10. BUILDING
  async chHardHats() {
    const game = this.game;
    await this.part(10, 'Building');
    this.force('ebuy', { ebuyFocus: 'item_lodge' });
    const buyHand = this.guide.marks.ui(() => (!document.querySelector('.pointer-hand.ebuy-ptr') && document.querySelector('.ebuy-host .eb-buy')) || null, { label: 'BUY!' });
    let stop = this.pointAt(this.slot('ebuy'));
    this.teach('Beavers are for sale now. Open <b>e-Buy</b> and order a <b>Beaver Crew</b>.', { target: this.slot('ebuy'), mood: 'excited' });
    this.nag(() => 'Open e-Buy and order the Beaver Crew.');
    const ordered = this.until('ordered', (o) => o.items.some((it) => it.type === 'lodge'));
    if (!(await this.within(ordered, 120))) {
      this.line('I\'ll order it for you this time.', { mood: 'happy' });
      try { game.ui?.closeEBuy?.(); const l = game.ebuyListings().find((x) => x.id === 'item_lodge' || x.type === 'lodge'); if (l) game.ebuyBuy(l, 1); } catch (e) { console.warn('[tut] lodge order', e); }
      if (!(await this.within(ordered, 6))) { const inv = (game.state.inventory ||= {}); inv.lodge = (inv.lodge || 0) + 1; game.emit('inventory', inv); }
    }
    this.stopNag();
    this.force(null);
    stop?.();
    buyHand.stop();
    if (!(game.state.inventory?.lodge > 0)) await this.unboxStep((o) => o.items.some((it) => it.type === 'lodge'));
    await this.wait(0.6);
    await this.placeStep('lodge', {
      hud: { line: '<b>BUILD</b>. Everything you own but haven\'t placed yet is in here.', mood: 'happy' },
      line: 'Pick the lodge and place it <b>in the water</b>, right by the shore.', nag: 'Build: place the lodge in the water by the shore.', label: 'LODGE HERE?',
    });
    this.win('BUILT!');
    game.state.beaverCredit = 0; // the signing bonus goes on the snack bar lesson instead
    await this.wait(0.8);
    // ---- the beavers' snack bar: research it, then they build it for free
    await this.teach('Beavers build the big things for you, but only if they\'re <b>paid in food</b> at a <b>Snack Bar</b>.', { wait: true, mood: 'happy' });
    await this.researchLesson('r_snackbar', 'Research the <b>Beaver Snack Bar</b> in the Lab.', 'Lab: Beaver Snack Bar, then RESEARCH.');
    const inv = (game.state.inventory ||= {});
    inv.beaverbar = (inv.beaverbar || 0) + 1; // a starter kit, on the house (only once it's researched)
    game.emit('inventory', inv);
    await this.placeStep('beaverbar', { line: 'Here\'s one on the house. Place the <b>Snack Bar</b> on land near the lodge.', nag: 'Build: place the Beaver Snack Bar on land.', label: 'SNACK BAR' });
    const bar = () => game.structures.list.find((s) => s.type === 'beaverbar' && !s.removed);
    await this.builtStep(bar);
    await this.cine(async (c) => {
      const b = bar();
      await c.walkNear(b);
      c.ots(b, { zoom: 0.013 });
      c.point(b, { label: 'SNACK BAR', color: 'green' });
      await c.say(c.fox, 'Big buildings go up as a <b>building site</b>, and the beavers finish them.', { style: 'happy' });
    }, { id: 'tut:bar' });
    stop = null;
  }

  // ------------------------------------------------------------ 11. FARMING
  async chGreen() {
    const game = this.game;
    await this.part(11, 'Farming');
    await this.teach('The beavers\' pay is <b>carrots</b>, and carrots grow from <b>seeds</b>.', { wait: true, mood: 'happy' });
    await this.researchLesson('r_carrot', 'Research <b>Carrot Seeds</b> in the Lab.', 'Lab: Carrot Seeds, then RESEARCH.');
    const inv = (game.state.inventory ||= {});
    inv.carrot = (inv.carrot || 0) + 2;
    game.emit('inventory', inv);
    await this.placeStep('carrot', { line: 'Two packs of seeds for you. <b>Plant them</b> on land from the Build menu.', nag: 'Build: plant the carrot seeds on land.', label: 'PLANT HERE' });
    game.quickCrops = true;
    const patch = game.structures.list.find((s) => s.type === 'carrot' && !s.removed);
    if (patch) this.frame(patch, 0.02);
    const sp = await this.tell(patch, 'Crops grow from seed to ripe over time. Today I\'ll hurry them along.', { mood: 'happy' });
    await this.wait(2);
    sp();
    if (!(await this.within(this.waitFor(() => game.harvest.ripeList().length > 0), 60))) {
      for (const s of game.structures.list) if (s.type === 'carrot' && s.crop && s.built) { s.crop.stage = 3; }
    }
    game.quickCrops = false;
    const ripe = game.harvest.ripeList()[0];
    const ring = await this.tell(ripe, 'Ripe! <b>Tap the carrots</b> to harvest them.', { mark: true, label: 'RIPE!', color: 'green', mood: 'excited' });
    this.nag(() => 'Tap the ripe carrots to harvest them.', { world: true });
    const harvested = this.until('harvested');
    if (!(await this.within(harvested, 60))) {
      this.line('I\'ll pick these for you.', { mood: 'happy' });
      const s = game.harvest.ripeList()[0];
      if (s) { try { game.harvest.harvest(s); } catch (e) { console.warn('[tut] harvest', e); } }
      await this.within(harvested, 5);
    }
    this.win('HARVEST!');
    this.stopNag();
    ring?.();
    await this.wait(1.2);
    // ---- pay the beavers with the carrots
    const bar = () => game.structures.list.find((s) => s.type === 'beaverbar' && !s.removed);
    game.setTool({ kind: 'feed' });
    game.foodStore.select('carrot');
    game.ui?.syncFoodPicker?.();
    this.force('feed');
    if (bar()) this.frame(bar(), 0.022);
    const pt = await this.tell(bar(), 'Harvests go in your <b>Food</b> bag. With carrots picked, <b>tap the Snack Bar</b> to stock it.', { mark: true, label: 'PAY HERE', color: 'gold' });
    this.nag(() => 'Food: pick the carrots, then tap the Beaver Snack Bar.', { world: true });
    const stocked = this.until('stocked', (d) => d.s.type === 'beaverbar');
    if (!(await this.within(stocked, 60))) {
      this.line('I\'ll stock it this time.', { mood: 'happy' });
      if (bar()) { try { game.foodStore.fillStorage(bar(), 'carrot'); } catch (e) { console.warn('[tut] pay', e); } }
      await this.within(stocked, 5);
    }
    this.stopNag();
    this.force(null);
    pt?.();
    this.frame(null);
    this.win('PAID!');
    await this.teach('Stocked. Beavers eat from the Snack Bar while they work. <b>No food, no work.</b>', { wait: true, mood: 'happy' });
  }

  // ------------------------------------------------------------ 12. CLEARING LAND
  async chTimber() {
    const game = this.game;
    await this.part(12, 'Clearing Land');
    await this.teach('Your land ends at the trees. Clearing them makes room, and gives <b>logs</b>. Logs are kept in a <b>Wood Garage</b>.', { wait: true, mood: 'happy' });
    await this.researchLesson('r_woodgarage', 'Research the <b>Wood Garage</b> in the Lab.', 'Lab: Wood Garage, then RESEARCH.');
    (game.state.inventory ||= {}).woodgarage = (game.state.inventory.woodgarage || 0) + 1;
    game.emit('inventory', game.state.inventory);
    if (!game.structures.list.some((q) => q.type === 'woodgarage' && !q.removed)) await this.placeStep('woodgarage', { line: 'Another one on the house. Place the <b>Wood Garage</b> on land.', nag: 'Build: place the Wood Garage on land.', label: 'GARAGE' });
    // ---- clear trees with the beavers: the DESTROY button, then drag a box
    game.setTool({ kind: 'feed' });
    await this.hud('clear', {
      line: '<b>DESTROY</b>: drag a box over trees and rocks, and the beavers clear them.', mood: 'happy',
      tryIt: () => { this.force('clear'); return toolPicked(this, 'clear'); }, tryLine: 'Pick the <b>DESTROY</b> tool.', nagLine: 'Pick the Destroy tool.',
      timeout: 30, fallback: () => game.setTool({ kind: 'clear' }),
    });
    const edge = this.forestEdge();
    if (edge) this.frame([edge.x, edge.z], 0.024);
    const pt = edge ? await this.tell([edge.x, edge.z], 'Now <b>drag a box</b> over these trees.', { mark: true, label: 'CLEAR', color: 'red' }) : null;
    this.nag(() => 'Destroy tool: drag a box over the trees at the edge.', { world: true });
    const area = this.until('clearArea');
    if (!(await this.within(area, 75)) && edge) {
      this.line('Like this.', { mood: 'happy' });
      let n = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { try { if (game.beavers.queueClear(Math.floor(edge.x) + dx, Math.floor(edge.z) + dz).ok) n++; } catch { /* ignore */ } }
      game.emit('clearArea', { n });
    }
    this.stopNag();
    pt?.();
    this.force(null);
    this.frame(null);
    this.teach('Marked in red. The beavers chop them one by one.', { mood: 'happy' });
    await this.within(this.until('cleared'), 90);
    this.win('TIMBER!');
    game.setTool({ kind: 'feed' });
    await this.teach('Cleared land is yours to build on. The logs go to the <b>Wood Garage</b>.', { wait: true, mood: 'happy' });
    await this.teach('Tomorrow morning <b>Pip</b> the chipmunk comes by. He buys logs for coins.', { wait: true, mood: 'scheming' });
  }

  // ------------------------------------------------------------ 13. YOUR DAY
  async chWrap() {
    const game = this.game;
    await this.part(13, 'Your Day');
    await this.hud('speed', {
      line: 'Days are short. <b>Tap the clock</b> to fast-forward, and tap again to go back to normal speed.', mood: 'happy',
      tryIt: () => this.until('speed'), tryLine: 'Try it: <b>tap the clock</b>.', timeout: 25,
      fallback: () => this.line('You can try it later.', { mood: 'happy' }),
    });
    await this.teach('That\'s every day: buy, feed and breed in the daytime, the feast at <b>5 PM</b>, the report at night.', { wait: true, mood: 'happy' });
    await this.teach('Spend the coins on research, buildings and better fish. New things get explained as they come up.', { wait: true, mood: 'happy' });
    await this.cine(async (c) => {
      c.low(c.fox, { zoom: 0.011, pitch: 0.38, lift: game.fox.y + 1 });
      await c.say(c.fox, 'Tomorrow at <b>5 PM</b>, the first bears. Let\'s have a pond full of fish ready.', { style: 'excited', close: 0.0105 });
    }, { id: 'tut:bye' });
  }

  // ------------------------------------------------------------ building steps (shared)
  /** the Build slot (first time) + a ring on a good spot + Reynard points at it; resolves once `type` is placed */
  async placeStep(type, { hud = null, line, nag, label = 'HERE?' }) {
    const game = this.game;
    const built = this.until('built', (s) => s?.type === type);
    const spot = this.goodSpot(type);
    let pt = null;
    if (spot) { this.frame([spot.x + 0.5, spot.z + 0.5], 0.022); await this.guide.walkNear([spot.x + 0.5, spot.z + 0.5]); pt = this.guide.point([spot.x + 0.5, spot.z + 0.5], { label, color: 'green', r: 0.7 }); }
    this.force('build', { bpTab: 'inv', bpSelect: { kind: 'build', type, free: true } });
    const doIt = async () => {
      if (!(await this.within(built, 110))) {
        this.line('I\'ll place it for you this time.', { mood: 'happy' });
        game.ui?.blueprint?.exit?.();
        const s = this.goodSpot(type);
        if (s) game.placeStructure(type, s.x, s.z, { free: true });
        await this.within(built, 6);
      }
    };
    try {
      if (hud && !game.isOpen('build')) {
        await this.hud('build', { ...hud, tryIt: doIt, tryLine: line, nagLine: nag, timeout: 120 });
      } else {
        const stop = this.pointAt(this.slot('build'));
        this.teach(line, { target: this.slot('build'), mood: 'excited' });
        this.nag(() => nag);
        this.stage = 'until:built';
        await doIt();
        this.stopNag();
        stop?.();
      }
    } finally {
      this.force(null);
      game.ui?.blueprint?.exit?.();
      pt?.();
      this.frame(null);
    }
  }

  /** wait until a placed building is finished (beavers build it), finishing it if they dawdle */
  async builtStep(get) {
    const game = this.game;
    if (!(await this.within(this.waitFor(() => get()?.built), 60))) {
      const s = get();
      if (s && !s.built) { try { game.structures.onBuilt(s); game.onStructureBuilt?.(s); } catch (e) { console.warn('[tut] built', e); } }
    }
  }

  /** a valid tile for `type` near Reynard (null if none) */
  goodSpot(type) {
    const game = this.game, f = game.fox;
    let best = null, bd = Infinity;
    for (let z = MEADOW.z0; z <= MEADOW.z1; z++) for (let x = MEADOW.x0; x <= MEADOW.x1; x++) {
      let ok = false;
      try { ok = game.structures.canPlace(type, x, z)?.ok; } catch { ok = false; }
      if (!ok) continue;
      const d = Math.hypot(x + 0.5 - f.x, z + 0.5 - f.z) + (Math.abs(x + 0.5 - HUT.x - 1.5) < 2 && Math.abs(z - HUT.z - 1) < 3 ? 6 : 0);
      if (d < bd) { bd = d; best = { x, z }; }
    }
    return best;
  }

  // ------------------------------------------------------------ research (v17)
  // the research tree that's on screen right now (Reynard's 3D lab or the Lab panel)
  labTree() {
    const game = this.game;
    if (game.lab?.active) return game.lab.tree || null;
    return game.ui?.panel === 'lab' ? game.ui.labTree || null : null;
  }

  // Reynard walks you into his lab (3D room) and switches the research screen on
  async enterLab() {
    const game = this.game;
    const L = game.lab;
    await this.hideTeacher();
    this.guide.clear();
    game.ui?.closeEBuy?.();
    game.ui?.blueprint?.exit?.();
    this.follow = false;
    this.stage = 'enterLab';
    if (L?.open && !game.inputLocked) {
      L.enter();
      await this.within(this.waitFor(() => !L.active || L.state === 'doze' || L.state === 'awake', 0.1), 12);
      if (L.active) {
        if (L.state === 'doze') { L.state = 'awake'; L.q?.('hint')?.classList.add('hidden'); } // he's expecting us: no nap today
        L.openTree();
        await this.wait(0.6);
        return;
      }
    }
    game.ui?.openLab?.(); // no 3D lab: the Lab panel
    await this.wait(0.4);
  }

  async leaveLab() {
    const game = this.game;
    const L = game.lab;
    if (game.ui?.panel === 'lab') game.ui.closePanel();
    if (L?.active) {
      await this.hideTeacher();
      L.exit();
      await this.within(this.waitFor(() => !L.active, 0.1), 8);
    }
    this.guide.keep();
  }

  // Keep pointing the player along: Lab button -> the node -> RESEARCH -> the bench,
  // until research `id` is running (until: 'start') or done. autoAfter: seconds before it starts it for them.
  guideResearch(id, { until = 'done', autoAfter = 0 } = {}) {
    const game = this.game;
    this.stage = 'research:' + id;
    const t0 = performance.now();
    return this.g(new Promise((res) => {
      let where = null, stop = null, seenTree = null;
      const tick = () => {
        if (this.skipping) { stop?.(); return; }
        const done = game.state.research.includes(id);
        const running = game.isResearching?.(id);
        if (done || (until === 'start' && running)) { stop?.(); res(); return; }
        // something else hogs the bench (a curious tap): the tour lets it finish now
        if (!running && game.canResearch?.(id)?.reason === 'Lab bench busy') for (const j of game.researchJobs()) game.rushResearch(j.id);
        // the player is stuck: Reynard pulls the lever himself
        if (autoAfter && !running && (performance.now() - t0) / 1000 > autoAfter) { try { if (!game.startResearch(id)) game.research(id); } catch { /* ignore */ } }
        if (autoAfter && running && until === 'done' && (performance.now() - t0) / 1000 > autoAfter * 2) { try { game.rushResearch(id); } catch { /* ignore */ } }
        const tree = this.labTree();
        if (tree && tree !== seenTree) { seenTree = tree; try { tree.select?.(id); } catch { /* ignore */ } }
        let w;
        if (running) w = tree ? 'job' : 'wait';
        else if (tree) w = document.querySelector(LAB_SEL.go) ? 'go' : 'node';
        else if (game.lab?.active) w = 'labBtn';
        else w = 'tool';
        if (w !== where) {
          stop?.();
          where = w;
          const tgt = { go: 'sel:' + LAB_SEL.go, node: 'sel:' + LAB_SEL.node(id), job: 'sel:' + LAB_SEL.job(id), labBtn: 'sel:' + LAB_SEL.labBtn, tool: this.slot('lab') }[w];
          stop = tgt ? this.pointAt(tgt) : null;
          if (tgt && this.box) this.box.target = uiTarget(tgt); // [v33 tut2] the box keeps off it
        }
        setTimeout(tick, 250);
      };
      tick();
    }));
  }

  // the quick version: "research X in the lab!" (Lab button -> node -> RESEARCH -> wait)
  async researchLesson(id, line, nagLine) {
    const game = this.game;
    if (game.state.research.includes(id)) return;
    game.unlockFeature('lab');
    this.force('lab');
    this.teach(line, { target: this.slot('lab'), mood: 'excited' }); // (guideResearch draws the hands)
    this.nag(() => nagLine);
    await this.guideResearch(id, { autoAfter: 75 });
    this.stopNag();
    this.force(null);
    game.audio.play('fanfare', { volume: 0.4 });
    await this.wait(1.4); // let the tree's "research complete" moment play
    await this.leaveLab();
  }

  // a clearable tree right at the edge of your land (for the Destroy lesson)
  forestEdge() {
    const game = this.game;
    const g = game.grid, B = game.beavers;
    const fox = game.fox;
    let best = null, bd = Infinity;
    for (let z = MEADOW.z0 - 3; z <= MEADOW.z1 + 3; z++) for (let x = MEADOW.x0 - 3; x <= MEADOW.x1 + 3; x++) {
      if (!g.inb(x, z) || !B.canClear(x, z).ok) continue;
      const k = B.clearKind(x, z);
      if (k !== 'forest' && k !== 'tree') continue;
      const d = Math.hypot(x - fox.x, z - fox.z);
      if (d < bd) { bd = d; best = { x: x + 0.5, z: z + 0.5 }; }
    }
    return best;
  }

  worldScreen(x, y, z) {
    const q = this.game.ui.screenOf(x, y, z);
    return { x: q.x, y: q.y };
  }

  fishScreen(f) {
    if (!f || f.dead) return { x: innerWidth / 2, y: innerHeight / 2 };
    const q = this.game.ui.screenOf(f.x, f.y + 0.2, f.z);
    return { x: q.x, y: q.y };
  }

  structScreen(s) {
    if (!s) return { x: innerWidth / 2, y: innerHeight / 2 };
    const q = this.game.ui.screenOf(s.x + 0.5, this.game.structures.baseY(s) + 0.6, s.z + 0.5);
    return { x: q.x, y: q.y };
  }

  // they took too long to find each other: nudge them together
  forceDate(two) {
    const [a, b] = two;
    if (!a || !b || a.dead || b.dead) return;
    b.x = a.x + 0.3; b.z = a.z + 0.1;
    a.state = b.state = 'court';
    a.mate = b; b.mate = a;
    a.courtT = b.courtT = 10;
    a.fed = b.fed = 1;
  }

  // only one thing works until you do it (others shake + fox says "not yet")
  force(feature, { ebuyFocus = null, bpTab = null, bpSelect = null } = {}) {
    const game = this.game;
    game.tutorialOnly = feature;
    if (game.ui) {
      game.ui.ebuyFocus = ebuyFocus;
      game.ui.bpForce = bpTab ? { tab: bpTab, select: bpSelect } : null;
    }
  }

  // gentle reminders if the player dawdles: the instruction comes back up in the box
  nag(text, { world = false } = {}) {
    void world;
    this.stopNag();
    this.nagT = setInterval(() => {
      const g = this.game;
      if (g.ui?.ebuy || g.ui?.blueprint?.open || g.director?.active || this.skipping || this.box?.waiting) return;
      this.line(text(), { mood: 'normal', target: this.box?.target || null });
    }, 15000);
  }

  stopNag() { clearInterval(this.nagT); this.nagT = null; }

  irisOpen(x, y, z) {
    const game = this.game;
    return new Promise((res) => {
      const t0 = performance.now();
      const R = Math.hypot(window.innerWidth, window.innerHeight);
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / 1100);
        const p = game.rig.worldToScreen({ x, y, z }, game.renderer);
        game.renderer.setIris(p.x, p.y, R * k * k + 1);
        if (k < 1) requestAnimationFrame(step);
        else { game.renderer.setIris(0, 0, -1); res(); }
      };
      step();
    });
  }

  update() {
    const game = this.game;
    if (!this.active) return;
    // [v33 tut] Reynard stays where the tour put him; the first pair waits for Part 5 to fall in love
    if (this.guide && game.fox && !game.fox.cine && !game.lab?.active) this.guide.keep();
    // (e-Buy fills the screen: the dialogue box steps out of its way by itself, src/game/tutorial/tourBox.js)
    if (this.holdLove) for (const f of this.pair) if (f && !f.dead) { f.loveT = Math.max(f.loveT, 6); if (f.state === 'court') { f.state = 'wander'; f.mate = null; } }
    // keep the action in view, but the player can always look around (we wait until they stop)
    if (performance.now() - (game.rig.userCamT || 0) < 7000) return;
    if (game.director?.active) return;
    if (this.watchPair) {
      const [a, b] = this.watchPair;
      if (a && b && !a.dead && !b.dead) game.rig.lookAt((a.x + b.x) / 2, (a.z + b.z) / 2);
    } else if (this.focus) {
      const p = worldOf(game, this.focus);
      if (p) game.rig.lookAt(p.x, p.z);
    } else if (this.follow) { const f = game.fox; game.rig.lookAt(f.x, f.z + 0.6); }
  }

  // later unlocks that come from playing, not the tour
  static progress(game) {
    if (!game.state.tutorialDone) return;
    if (game.state.day >= 2) { game.unlockFeature('rating'); game.unlockFeature('reviews'); }
    // research is the only way to unlock anything: the lab stays open after the tour
    // (older saves finished the tour before it taught the lab)
    if (!game.state.unlocked.includes('lab')) game.unlockFeature('lab', { quiet: true });
    if (game.state.discovered.length >= 2 || game.state.day >= 3) game.unlockFeature('dex');
    if (game.state.day >= 3) game.unlockFeature('tag');
  }
}

void THREE;
export { STRUCTURES };
