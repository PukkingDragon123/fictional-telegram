import * as THREE from 'three';
// First-day tutorial. [v33 tut] The big hands-on tour.
//
// It opens inside Reynard's room (a returning player can skip right there), a crane over the valley
// lands on his empty pond, and then Reynard is IN THE WORLD: he walks to every thing he talks about,
// points at it (his arm reaches for it, a pixel arrow + ring sit on it), holds things up in his paws
// (real voxel props: a fish, an egg, the pellet bag, the Fish Scope, a tag, coins) and the camera goes
// in low and close, over his shoulder. Talk beats are Director scenes (comic bubbles, close-ups,
// c.ask reply buttons with real reactions); everything in between is you doing it, with a fallback
// for every wait. The HUD arrives one piece at a time (src/game/tutorial/hudIntro.js): the slot
// appears, Reynard hops over to it, you try it.
//
//   room -> opening crane + class "Pond Life" ->
//   1 First Fish       coins, e-Buy: buy the pair, unbox, meet + name them
//   2 Feeding Time     Food slot, the pellet bag + quiz, you feed them, the two meters
//   3 The Fish Scope   tap a fish, every stat one by one with this fish's numbers, worth, buttons
//   4 Fish Care        Pet slot (pet to full), happiness, the pond + quiz, Tag slot, bear-proofing, Carry slot
//   5 Love & Eggs      refeed, the date, the egg + quiz, fertilize, incubate, hatch, the fry
//   6 Genes & Money    (you can skip it) genes + quiz, morphs, hybrids, value, what bears like
//   7 Science!         Lab slot, research Hire Beavers
//   8 Hard Hats        order the crew, Build slot, place the lodge, research + place the Snack Bar
//   9 Green Thumb      research carrots, plant, harvest, pay the beavers
//  10 Timber!          Wood Garage, Destroy slot, box the trees
//  11 Customers        class "Customers", the bears hear the news, the clock, tomorrow 5 PM, recap
//
// SKIP TOUR: a paper tag hangs at the top of the screen the whole time (src/game/tutorial/skip.js).
// Every wait in here races the skip, so a skip ends the tour from any step and catches the save up.
// Debug: ?autostart=new&tutfrom=<chapter> jumps straight to a chapter (ids in CHAPTERS below).
import { HUT, OFFICE, MEADOW } from '../world/worldgen.js';
import { STRUCTURES } from '../data/structures.js';
import { COMBINED_LESSONS } from './lessonsCombined.js';
import { ynPair } from '../ui/ynButtons.js'; // [v27 knobs] painted YES / NO planks
import { TeacherOverlay } from '../ui/TeacherOverlay.js'; // the on-screen guide: Reynard hops onto the HUD and points
import { TUT_SCENES } from './cine/tutorialScenes.js'; // [v31 guide]
import { floatTitle } from '../ui/kinetic/floatText.js'; // [v31 guide]
import { Guide } from './tutorial/stage.js'; // [v33 tut]
import { worldOf } from './tutorial/marks.js'; // [v33 tut]
import { introduce, hudTarget, toolPicked } from './tutorial/hudIntro.js'; // [v33 tut]
import { SkipTag, finishSkipped, TOUR_FEATURES } from './tutorial/skip.js'; // [v33 tut]
import { firstFish, feeding, fishScope, fishCare, loveEggs, genesMoney } from './tutorial/fishCourse.js'; // [v33 tut]
import { rollGenes } from './genes.js';
// [v32] the classroom is back: the day-1 lessons are classes again (src/game/Classroom.js)
const clsMods = import.meta.glob('./Classroom.js', { eager: true });
const Classroom = clsMods['./Classroom.js']?.Classroom || null;
if (clsMods['./Classroom.js']?.LESSONS) Object.assign(clsMods['./Classroom.js'].LESSONS, COMBINED_LESSONS);

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const SKIP = { tutSkip: true }; // what every wait rejects with once the tour is skipped

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
const PARTS = 11;

export const ALL_FEATURES = ['coins', 'ebuy', 'build', 'clear', 'feed', 'hand', 'tag', 'pet', 'clock', 'speed', 'rating', 'lab', 'dex', 'reviews', 'match', 'terraform'];

// the chapters in order: [id, features a finished chapter has unlocked (for ?tutfrom= jumps)]
const CHAPTERS = [
  ['room', []], ['opening', []], ['first', ['coins', 'ebuy']], ['feed', ['feed']], ['scope', []], ['care', ['pet', 'tag', 'hand']],
  ['love', []], ['genes', []], ['science', ['lab']], ['hardhats', ['build']], ['green', []], ['timber', ['clear']], ['customers', ['clock', 'speed']],
];

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.teacher = null;
    this.classroom = null;
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

  /** SKIP TOUR (the paper tag): stop whatever is playing, reject every wait */
  skipNow() {
    if (this.skipping || !this.active) return;
    this.skipping = true;
    this.stage = 'skipped';
    try { if (this.game.director?.active) this.game.director.skip(); } catch { /* ignore */ }
    try { if (this.game.classroom?.active) this.game.classroom.skip(); } catch { /* ignore */ }
    try { this.teacher?.skip(); } catch { /* ignore */ }
    this._abortRej(SKIP);
  }

  foxAnchor() {
    const f = this.game.fox;
    return { getWorldPos: (v) => v.set(f.x, f.y + 1.75, f.z) };
  }

  // a line from the in-world fox (fallback when the teacher overlay is missing)
  async fox(text, { mood = 'normal', wait: w = true, expr = null, dur } = {}) {
    const game = this.game;
    if (expr) game.fox.react?.(expr, 1.5);
    const h = game.say(this.foxAnchor(), text, { voice: 'fox', mood, wait: w, key: 'tutfox', size: 'm', dur });
    if (w && h?.done) await this.g(Promise.race([h.done, sleep(12)]));
    else await this.wait(dur || 1.6);
  }

  // [v31 guide] a part card between the tour's sections: PART n OF 11 + the name in Alagard
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

  // a Yes / No card under the fox's speech (resolves true for the first button)
  ask(question, [yesLabel, noLabel]) {
    const game = this.game;
    this.game.lab.say(question, 'happy', { mood: 'excited', wait: false, dur: 7 });
    return this.g(new Promise((res) => {
      const el = document.createElement('div');
      el.className = 'tut-choice';
      el.innerHTML = `<button class="yes">${yesLabel}</button><button class="no">${noLabel}</button>`;
      const done = (v) => { el.classList.add('bye'); game.audio.play(v ? 'pop_in' : 'click', { volume: 0.5 }); setTimeout(() => el.remove(), 250); game.ui?.hideBubble?.('labfox'); res(v); };
      el.querySelector('.yes').addEventListener('click', (e) => { e.stopPropagation(); done(true); });
      el.querySelector('.no').addEventListener('click', (e) => { e.stopPropagation(); done(false); });
      document.body.appendChild(el);
      try { ynPair(el.querySelector('.yes'), el.querySelector('.no'), { keys: true }); } catch (e) { console.warn('yn', e); } // [v27 knobs]
      game.audio.play('page', { volume: 0.4 });
    }));
  }

  async lab(text, expr, mood = 'normal') {
    const h = this.game.lab.say(text, expr, { mood, wait: true });
    if (h?.done) await this.g(Promise.race([h.done, sleep(14)])); else await this.wait(2);
  }

  // the screen-space teacher (hops onto the HUD with his pointer stick)
  getTeacher() {
    if (this.teacher) return this.teacher;
    try { this.teacher = new TeacherOverlay({ game: this.game, root: document.body, outfit: 'default' }); } catch (e) { console.warn('TeacherOverlay failed', e); this.teacher = null; }
    return this.teacher;
  }
  async hideTeacher() {
    const t = this.teacher;
    if (!t?.visible) return;
    try {
      t.clearChalk();
      const p = t.hide();
      await Promise.race([p, sleep(1.4)]);
      // still bowing / running off (a slow frame rate): snap him off screen so no scene starts with him in it
      if (t.visible) { t.skip(); await Promise.race([p, sleep(0.4)]); }
    } catch { /* ignore */ }
  }
  clearChalk() { try { this.teacher?.clearChalk(); } catch { /* ignore */ } }

  // run to `target`, point at it (and circle it), say a line. Never throws (often not awaited):
  // after a skip it just returns, and the tour's next wait stops it.
  async teach(text, { target = null, circle = false, arrowTo = null, wait: w = false, dur = 4, mood = 'normal', doodle = null } = {}) {
    if (this.skipping) return;
    const t = this.getTeacher();
    this.stage = 'teach:' + text.replace(/<[^>]+>/g, '').slice(0, 24);
    if (t) {
      try {
        if (!t.visible) await this.g(Promise.race([t.show({ greet: false }), sleep(3)]));
        if (target) await this.g(Promise.race([t.goTo(target), sleep(3)]));
        if (circle && target) t.circle(target, { color: 'yellow' });
        if (arrowTo) t.arrow(target || { x: innerWidth / 2, y: innerHeight / 2 }, arrowTo);
        if (doodle) t.doodle(doodle, target || { x: innerWidth / 2, y: innerHeight / 3 });
        await this.g(t.say(text, { wait: w, dur, mood }));
        return;
      } catch (e) { if (this.isSkip(e)) return; console.warn('teacher', e); }
    }
    // fallback: the bouncing hand + a bubble from the fox in the world
    const ptr = target && typeof target === 'string' ? this.game.ui?.pointAt?.(target) : null;
    try { await this.fox(text.replace(/<[^>]+>/g, ''), { wait: w, dur, mood }); } catch { /* skipped */ }
    if (ptr) setTimeout(() => ptr(), (dur || 3) * 1000);
  }

  // keep the stick on something while we wait for the player
  pointAt(target, { circle = true } = {}) {
    const t = this.getTeacher();
    if (t) {
      t.goTo(target).catch?.(() => {});
      if (circle) t.circle(target, { color: 'yellow' });
      return () => { try { t.clearChalk(); } catch { /* ignore */ } };
    }
    return typeof target === 'string' ? this.game.ui?.pointAt?.(target) || (() => {}) : () => {};
  }

  /** [v33 tut] a HUD piece arrives (src/game/tutorial/hudIntro.js) */
  hud(feature, o = {}) { return introduce(this, feature, o); }
  slot(feature) { return hudTarget(this.game, feature); }

  /** [v33 tut] a world thing: Reynard himself walks over, points at it and says it (the on-screen guide
   *  is for the HUD only). mark: also a ring + arrow (+ label) on it. Returns stop() for the pointing. */
  async tell(target, text, { mark = false, label = null, color = 'gold', mood = 'happy', dur = 4.5, walk = true } = {}) {
    if (this.skipping) return () => {};
    await this.hideTeacher();
    const G = this.guide;
    if (walk && target) { try { await this.g(G.walkNear(target)); } catch (e) { if (this.isSkip(e)) return () => {}; } }
    const stop = target ? G.point(target, { ring: mark, arrow: mark, label: mark ? label : null, color }) : null;
    G.bark(String(text).replace(/<\/?b>/g, '*'), { mood, dur });
    this.stage = 'tell:' + String(text).replace(/<[^>]+>/g, '').slice(0, 20);
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

  // [v32] a full-screen classroom lesson; fallback: a few lines from the fox
  async lesson(id) {
    const game = this.game;
    this.stage = 'lesson:' + id;
    await this.hideTeacher();
    this.guide.clear();
    if (Classroom) {
      try {
        if (!this.classroom) this.classroom = game.classroom ||= new Classroom(game);
        game.ui?.foodPicker?.hide?.();
        await this.g(this.classroom.lesson(id));
        game.ui?.syncFoodPicker?.();
        return;
      } catch (e) { if (this.isSkip(e)) throw e; console.warn('lesson failed', id, e); }
    }
    const lines = FALLBACK_LESSONS[id] || [];
    for (const l of lines) await this.fox(l, { mood: 'happy' });
  }

  // play one or more cutscenes from src/game/cine/tutorialScenes.js back to back (one letterbox)
  scene(...ids) {
    return this.cine(async (c) => { for (const id of ids) await TUT_SCENES[id]?.(c); }, { pause: true, id: 'tut:' + ids.join('+') });
  }

  /** [v33 tut] a Director scene with the tour's stage helpers (c.point, c.hold, c.low, c.ots, c.mark...) */
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
      ok = await this.g(D.play(async (c) => { this.guide.extend(c); await fn(c); }, { pause, id }));
    } catch (e) {
      if (this.isSkip(e)) throw e;
      console.warn('[tutorial] scene', id, e);
    } finally {
      rig.pitchGoal = pitch0;
      this.guide.clear();
      this.guide.keep();
      this.follow = follow;
      game.ui?.syncFoodPicker?.();
    }
    return ok;
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
    const stop = await this.tell(box, 'A parcel! <b>Tap the box</b> to unbox it!', { mood: 'excited' });
    this.nag(() => 'Tap the box!', { world: true });
    this.stage = 'until:delivered';
    if (!(await this.within(delivered, 60))) {
      this.guide.bark('Allow me. *Rip.*', { mood: 'happy' });
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
      this.skipTag?.remove();
      this.skipTag = null;
    }
  }

  async tour() {
    const game = this.game;
    this.active = true;
    game.tutorialHold = true; // the clock waits until the tour is over
    game.state.unlocked = [];
    game.ui?.refreshUnlocks?.();
    this.guide = new Guide(this);
    this.skipTag = new SkipTag(this);
    const from = new URLSearchParams(location.search).get('tutfrom');
    let start = 0;
    if (from && CHAPTERS.some(([id]) => id === from)) { start = CHAPTERS.findIndex(([id]) => id === from); await this.jumpTo(start); }
    const RUN = {
      room: () => this.chRoom(), opening: () => this.chOpening(), first: () => firstFish(this), feed: () => feeding(this), scope: () => fishScope(this),
      care: () => fishCare(this), love: () => loveEggs(this), genes: () => genesMoney(this), science: () => this.chScience(), hardhats: () => this.chHardHats(),
      green: () => this.chGreen(), timber: () => this.chTimber(), customers: () => this.chCustomers(),
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
    try { const t = this.teacher; if (t) { t.clearChalk(); t.hide(); } } catch { /* ignore */ }
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

  // ------------------------------------------------------------ the room + the opening
  async chRoom() {
    const game = this.game;
    const L = game.lab;
    // ---- inside the fox's room: Reynard in his classic suit (top hat, waistcoat)
    L.enterTutorial();
    try { L.fox?.setOutfit?.('default'); game.fox.rig?.setOutfit?.('default'); } catch { /* ignore */ }
    await this.wait(2.4);
    await this.g(L.tutorialStand());
    await this.lab('Oh! A customer! ...No? A VISITOR. Even better. Visitors work for free.', 'shocked', 'excited');
    await this.lab('Reynard. Fish tycoon. Genius. Extremely humble.', 'smug');
    const fresh = await this.ask('First day in the fish business?', ['First time!', 'I know the drill']);
    if (!fresh) {
      await this.lab('A professional! I can smell the ambition. Smells like money.', 'scheming', 'excited');
      if (await this.ask('Skip my grand tour, then?', ['Skip it', 'Show me anyway'])) {
        await this.lab('Fine! The pond is all yours. Make me RICH.', 'laugh', 'excited');
        this.skipNow();
        throw SKIP;
      }
      await this.lab('A refresher. Smart. Smart people get rich. Like me.', 'greedy');
    } else {
      await this.lab('Fresh talent! I LOVE fresh talent. It\'s so... affordable.', 'greedy', 'excited');
      // he asks... and does not take no for an answer
      const pleas = [
        ['No?! I made a whole TOUR.', 'shocked'],
        ['There will be coins. And fish. Fish coins!', 'scheming'],
        ['Pleeease? I\'ll throw in a free fish. Okay, half a fish.', 'sad'],
        ['That was not really a question. LET\'S GO!', 'angry'],
      ];
      for (let k = 0; ; k++) {
        const yes = await this.ask(k ? 'So... the tour?' : 'Want me to show you how to run a pond?', k ? ['Fine, yes!', 'Still no'] : ['Yes please!', 'No thanks']);
        if (yes) { await this.lab('Splendid! Follow the fox.', 'excited', 'excited'); break; }
        const [line, ex] = pleas[Math.min(k, pleas.length - 1)];
        await this.lab(line, ex, 'excited');
        if (k >= pleas.length - 1) break;
      }
    }
    L.fox?.play(L.fox?.anims?.includes('laugh_evil') ? 'laugh_evil' : 'idle', { loop: false, onDone: () => L.fox?.play('idle', { loop: true }) });
    await this.lab('Bears in suits eat here at five. We sell them FISH.', 'scheming', 'happy');
    await this.lab('Grab your coat. We\'re going OUT!', 'excited', 'excited');
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
    // ---- the opening crane over the valley, then class: Pond Life
    if (!(await this.scene('opening'))) await this.teach('Behold! The pond! ...It\'s <b>empty</b>.', { wait: true, mood: 'excited' });
    await this.teach('Quick <b>class</b> first. Knowledge is money!', { dur: 2.2, mood: 'excited' });
    await this.lesson('pondlife');
  }

  // ------------------------------------------------------------ 7. SCIENCE
  async chScience() {
    const game = this.game;
    await this.part(7, 'Science!');
    await this.cine(async (c) => {
      c.low(c.fox, { zoom: 0.012, pitch: 0.4, lift: game.fox.y + 1 });
      await c.say(c.fox, 'Fish: done. Now we need *workers*.', { style: 'say' });
      const v = await c.ask(c.fox, '*BEAVERS!* Strong. Tireless. And we pay them in...?', [
        { label: 'Coins', value: 'coins' },
        { label: 'Snacks', value: 'snacks' },
        { label: 'Compliments', value: 'nice' },
      ]);
      const R = {
        coins: ['Coins?! Bite your tongue. Coins are for *ME*.', 'angry'],
        snacks: ['SNACKS. Carrots, mostly. My dream employees.', 'laugh'],
        nice: ['Ha! I tried that once. They stopped working. *Snacks* it is.', 'laugh'],
      }[v] || ['Snacks.', 'say'];
      await c.say(c.fox, R[0], { style: R[1] });
      await c.say(c.fox, 'But first we *invent* them. Science!', { style: 'excited', close: 0.011 });
    }, { id: 'tut:science' });
    await this.hud('lab', { line: 'My <b>LAB</b>. Every building, plant and fish gets invented in there. For <b>free</b>!', mood: 'excited' });
    (game.state.tips ||= {}).lodge = true; // the tour teaches the lodge itself
    game.researchBoost = TUT_RESEARCH_BOOST; // short timers while the tour runs (reset in run())
    await this.enterLab();
    const beaversDone = this.until('research', (r) => r?.id === 'r_beavers');
    await this.teach('My <b>research tree</b>! Every building, plant and fish starts <b>right here</b>.', { wait: true, mood: 'excited' });
    await this.teach('This one: <b>Hire Beavers</b>!', { target: 'sel:' + LAB_SEL.node('r_beavers'), circle: true, wait: true, mood: 'happy' });
    try { this.labTree()?.select?.('r_beavers'); } catch { /* ignore */ }
    await this.wait(0.4);
    await this.teach('Research is <b>FREE</b>. My favourite price! It just takes <b>TIME</b>.', { target: 'sel:' + LAB_SEL.go, wait: true, mood: 'happy' });
    this.teach('Tap <b>RESEARCH</b>!', { target: 'sel:' + LAB_SEL.go, circle: true, dur: 5, mood: 'excited' });
    this.nag(() => 'Tap RESEARCH on Hire Beavers!');
    await this.guideResearch('r_beavers', { until: 'start', autoAfter: 60 });
    this.stopNag();
    if (!game.state.research.includes('r_beavers')) {
      await this.teach('It\'s on the <b>BENCH</b>. One project per bench. More benches come later!', { target: 'sel:' + LAB_SEL.bench, wait: true, mood: 'happy' });
      if (!game.state.research.includes('r_beavers')) await this.teach('Greyed-out stuff? Some needs a <b>NEIGHBOUR</b>. Meet them and more of the tree opens up!', { wait: true, mood: 'scheming' });
    }
    await this.guideResearch('r_beavers', { autoAfter: 90 });
    await this.within(beaversDone, 3);
    game.audio.play('fanfare', { volume: 0.5 });
    this.win('EUREKA!');
    await this.teach('DING! <b>BEAVERS: INVENTED!</b> Science is beautiful. And profitable.', { wait: true, mood: 'excited' });
    await this.teach('Back to the pond! The <b>flask</b> brings you back here anytime.', { dur: 3, mood: 'happy' });
    await this.leaveLab();
    await this.wait(0.4);
  }

  // ------------------------------------------------------------ 8. HARD HATS
  async chHardHats() {
    const game = this.game;
    await this.part(8, 'Hard Hats');
    this.force('ebuy', { ebuyFocus: 'item_lodge' });
    const buyHand = this.guide.marks.ui(() => (!document.querySelector('.pointer-hand.ebuy-ptr') && document.querySelector('.ebuy-host .eb-buy')) || null, { label: 'BUY!' });
    let stop = this.pointAt(this.slot('ebuy'));
    this.teach('Researched = for sale! Order a <b>BEAVER CREW</b> on e-Buy!', { target: this.slot('ebuy'), circle: true, dur: 5, mood: 'excited' });
    this.nag(() => 'Tap e-Buy! Beaver crew!');
    const ordered = this.until('ordered', (o) => o.items.some((it) => it.type === 'lodge'));
    if (!(await this.within(ordered, 120))) {
      this.guide.bark('I\'ll order it. You owe me.', { mood: 'scheming' });
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
      hud: { line: '<b>BUILD</b>. Everything you own and haven\'t placed yet lives in here.', mood: 'happy' },
      line: 'Place the lodge <b>in the water</b>, right by the shore!', nag: 'Build ▸ tap the shore water!', label: 'LODGE HERE?',
    });
    this.win('BUILT!');
    game.state.beaverCredit = 0; // the signing bonus goes on the snack bar lesson instead
    await this.wait(0.8);
    // ---- the beavers' snack bar: research it, then they build it for free
    await this.teach('Beavers only work when <b>PAID</b>. In food! They need a <b>Snack Bar</b>.', { wait: true, mood: 'scheming' });
    await this.researchLesson('r_snackbar', 'Research the <b>Beaver Snack Bar</b> in the Lab!', 'Lab ▸ Beaver Snack Bar ▸ RESEARCH!');
    const inv = (game.state.inventory ||= {});
    inv.beaverbar = (inv.beaverbar || 0) + 1; // a starter kit, on the house (only once it's researched)
    game.emit('inventory', inv);
    await this.placeStep('beaverbar', { line: 'First one\'s on me. Place the <b>Snack Bar</b> on land near the lodge!', nag: 'Build ▸ place the Beaver Snack Bar on land!', label: 'SNACK BAR' });
    const bar = () => game.structures.list.find((s) => s.type === 'beaverbar' && !s.removed);
    await this.builtStep(bar);
    await this.cine(async (c) => {
      const b = bar();
      await c.walkNear(b);
      c.ots(b, { zoom: 0.013 });
      c.point(b, { label: 'SNACK BAR', color: 'green' });
      await c.say(c.fox, 'Built for *free*! Beavers are not dumb. Just cheap.', { style: 'laugh' });
    }, { id: 'tut:bar' });
    stop = null;
  }

  // ------------------------------------------------------------ 9. GREEN THUMB
  async chGreen() {
    const game = this.game;
    await this.part(9, 'Green Thumb');
    await this.teach('Beavers eat <b>carrots</b>. We need <b>seeds</b>!', { dur: 2.5, mood: 'happy' });
    await this.researchLesson('r_carrot', 'Research <b>Carrot Seeds</b> in the Lab!', 'Lab ▸ Carrot Seeds ▸ RESEARCH!');
    const inv = (game.state.inventory ||= {});
    inv.carrot = (inv.carrot || 0) + 2;
    game.emit('inventory', inv);
    await this.placeStep('carrot', { line: 'Here, carrot seeds! <b>Plant them</b> on land.', nag: 'Build ▸ plant the carrot seeds on land!', label: 'PLANT HERE' });
    game.quickCrops = true;
    const patch = game.structures.list.find((s) => s.type === 'carrot' && !s.removed);
    if (patch) this.frame(patch, 0.02);
    const sp = await this.tell(patch, 'Seed... sprout... growing... Patience. Ugh.', { mood: 'happy', dur: 3.5 });
    await this.wait(2);
    sp();
    if (!(await this.within(this.waitFor(() => game.harvest.ripeList().length > 0), 60))) {
      for (const s of game.structures.list) if (s.type === 'carrot' && s.crop && s.built) { s.crop.stage = 3; }
    }
    game.quickCrops = false;
    const ripe = game.harvest.ripeList()[0];
    const ring = await this.tell(ripe, 'Ripe! <b>Tap the carrots</b> to harvest the batch!', { mark: true, label: 'RIPE!', color: 'green', mood: 'excited' });
    const stop = null;
    this.nag(() => 'Tap the ripe carrots to harvest them!', { world: true });
    const harvested = this.until('harvested');
    if (!(await this.within(harvested, 60))) {
      this.guide.bark('Yoink! Harvest is a team sport.', { mood: 'happy' });
      const s = game.harvest.ripeList()[0];
      if (s) { try { game.harvest.harvest(s); } catch (e) { console.warn('[tut] harvest', e); } }
      await this.within(harvested, 5);
    }
    this.win('HARVEST!');
    this.stopNag();
    stop?.();
    ring?.();
    await this.wait(1.2);
    // ---- pay the beavers with the carrots
    const bar = () => game.structures.list.find((s) => s.type === 'beaverbar' && !s.removed);
    game.setTool({ kind: 'feed' });
    game.foodStore.select('carrot');
    game.ui?.syncFoodPicker?.();
    this.force('feed');
    if (bar()) this.frame(bar(), 0.022);
    const pt = await this.tell(bar(), 'Carrots are in your Food bag. Now <b>tap the Snack Bar</b> to pay the crew!', { mark: true, label: 'PAY HERE', color: 'gold', dur: 6 });
    const stop2 = null;
    this.nag(() => 'Food tool: pick the carrots, then tap the Beaver Snack Bar!', { world: true });
    const stocked = this.until('stocked', (d) => d.s.type === 'beaverbar');
    if (!(await this.within(stocked, 60))) {
      this.guide.bark('Here\'s your wages, lads.', { mood: 'happy' });
      if (bar()) { try { game.foodStore.fillStorage(bar(), 'carrot'); } catch (e) { console.warn('[tut] pay', e); } }
      await this.within(stocked, 5);
    }
    this.stopNag();
    this.force(null);
    stop2?.();
    pt?.();
    this.frame(null);
    this.win('PAID!');
    await this.teach('Paid! No pay, no work. <b>Snacks = jobs.</b>', { dur: 3, mood: 'excited' });
  }

  // ------------------------------------------------------------ 10. TIMBER
  async chTimber() {
    const game = this.game;
    await this.part(10, 'Timber!');
    await this.teach('Trees give <b>LOGS</b>! Logs need a home: the <b>Wood Garage</b>.', { wait: true, mood: 'excited' });
    await this.researchLesson('r_woodgarage', 'Research the <b>Wood Garage</b> in the Lab!', 'Lab ▸ Wood Garage ▸ RESEARCH!');
    (game.state.inventory ||= {}).woodgarage = (game.state.inventory.woodgarage || 0) + 1;
    game.emit('inventory', game.state.inventory);
    if (!game.structures.list.some((q) => q.type === 'woodgarage' && !q.removed)) await this.placeStep('woodgarage', { line: 'On the house again! Place the <b>Wood Garage</b> on your land!', nag: 'Build ▸ place the Wood Garage on land!', label: 'GARAGE' });
    // ---- clear trees with the beavers: the DESTROY button, then drag a box
    game.setTool({ kind: 'feed' });
    await this.hud('clear', {
      line: 'More land = more money. <b>DESTROY</b>: box up trees and rocks, the beavers clear them.', mood: 'excited',
      tryIt: () => { this.force('clear'); return toolPicked(this, 'clear'); }, tryLine: 'Tap the <b>DESTROY</b> button!', nagLine: 'Tap the Destroy button!',
      timeout: 30, fallback: () => game.setTool({ kind: 'clear' }),
    });
    const edge = this.forestEdge();
    if (edge) this.frame([edge.x, edge.z], 0.024);
    const pt = edge ? await this.tell([edge.x, edge.z], 'Now <b>drag a box</b> over these trees!', { mark: true, label: 'CHOP!', color: 'red', dur: 6 }) : null;
    const stop = null;
    this.nag(() => 'Destroy tool: drag a box over the trees at the edge!', { world: true });
    const area = this.until('clearArea');
    if (!(await this.within(area, 75)) && edge) {
      this.guide.bark('Like this. Snip snip.', { mood: 'happy' });
      let n = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { try { if (game.beavers.queueClear(Math.floor(edge.x) + dx, Math.floor(edge.z) + dz).ok) n++; } catch { /* ignore */ } }
      game.emit('clearArea', { n });
    }
    this.stopNag();
    stop?.();
    pt?.();
    this.force(null);
    this.frame(null);
    this.teach('Red = marked! Tape goes up and the beavers chop them <b>bit by bit</b>.', { dur: 4.5, mood: 'happy' });
    await this.within(this.until('cleared'), 90);
    this.win('TIMBER!');
    this.teach('Ka-ching! More land!', { dur: 1.8, mood: 'excited' });
    await this.wait(2);
    game.setTool({ kind: 'feed' });
    this.teach('Chopped trees fall into <b>LOGS</b>. Beavers haul them to the <b>Wood Garage</b>!', { dur: 4.5, mood: 'happy' });
    await this.wait(1.5);
    await this.teach('Wood = furniture from Chip... or cash from <b>Pip</b>, who visits tomorrow!', { wait: true, mood: 'scheming' });
  }

  // ------------------------------------------------------------ 11. CUSTOMERS
  async chCustomers() {
    const game = this.game;
    await this.teach('Last class: our <b>customers</b>... gulp.', { dur: 2.2, mood: 'scared' });
    await this.part(11, 'Customers');
    await this.lesson('customers');
    await this.scene('customers'); // meanwhile, up the mountain: the bears hear about the pond
    // ---- the clock (bears come tomorrow), with a peek up the mountain
    await this.hud('clock', { line: 'The <b>CLOCK</b>. At <b>5 PM</b> the bears come. Every. Single. Day.', mood: 'scared' });
    // [v31 guide] the day-1 close: TOMORROW, 5:00 PM (a cinematic up at the tower)
    if (!(await this.scene('tomorrow'))) {
      await this.cineShots([
        { at: { x: OFFICE.x, z: OFFICE.z + 7 }, wupp: 0.03, yaw: 0, dur: 2.8, sfx: 'growl', caption: 'Bear Corp, tomorrow...', sub: '4:59 PM. Four hundred empty stomachs.' },
        { at: { x: game.fox.x, z: game.fox.z + 0.6 }, wupp: 0.02, dur: 2.2, caption: 'Meanwhile...', sub: 'Reynard has ONE day to get ready.' },
      ]);
    }
    game.particles.confetti(game.fox.x, game.fox.y + 1.5, game.fox.z, 40);
    // ---- recap: the money loop, and where NEW stuff comes from [v26 tutorial]
    let stop = this.pointAt(this.slot('coins'));
    await this.teach('The <b>money loop</b>: breed fish, bears pay at <b>5 PM</b>, <b>bigger + rarer</b> fish pay MORE.', { target: this.slot('coins'), circle: true, wait: true, mood: 'excited' });
    stop?.();
    await this.teach('Full bears <b>tip</b> and rate you. A good <b>rating</b> brings <b>more bears</b> tomorrow!', { wait: true, mood: 'happy' });
    stop = this.pointAt(this.slot('lab'));
    await this.teach('New stuff? The <b>LAB</b>: research is <b>FREE</b>, it just takes time. Neighbours open more!', { target: this.slot('lab'), circle: true, wait: true, mood: 'happy' });
    stop?.();
    await this.hud('speed', {
      line: 'Time is money. <b>Tap the clock</b> to fast-forward. Tap again to slow down.', mood: 'smug',
      tryIt: () => this.until('speed'), tryLine: 'Go on, <b>tap the clock</b>!', timeout: 25,
      fallback: () => this.guide.bark('Later, then. Time waits for no fox.', { mood: 'happy' }),
    });
    await this.teach('I\'ll teach you the rest <b>as it happens</b>. Every lesson goes in my <b>notebook</b>.', { wait: true, mood: 'scheming' });
    await this.hideTeacher();
    await this.cine(async (c) => {
      c.low(c.fox, { zoom: 0.011, pitch: 0.38, lift: game.fox.y + 1 });
      const v = await c.ask(c.fox, 'So. Ready for four hundred hungry bears?', [
        { label: 'Born ready', value: 'ready' },
        { label: 'Terrified', value: 'scared' },
        { label: 'Show me the money', value: 'money' },
      ]);
      const R = {
        ready: ['That\'s the spirit! Partner material. Seventy-thirty.', 'laugh'],
        scared: ['Good. Fear keeps you *sharp*. Fear and full fish tanks.', 'scared'],
        money: ['A fox after my own heart! Ha HA!', 'laugh'],
      }[v] || ['Good.', 'say'];
      await c.say(c.fox, R[0], { style: R[1] });
      await c.say(c.fox, '*Tour dismissed!* Now go make me RICH!', { style: 'excited', close: 0.0105 });
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
        this.guide.bark('Fine, I\'ll put it here. Fox knows best.', { mood: 'scheming' });
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
        this.teach(line, { target: this.slot('build'), circle: true, dur: 5 });
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
    this.teach(line, { target: this.slot('lab'), dur: 5, mood: 'excited' }); // (guideResearch draws the circles)
    this.nag(() => nagLine);
    await this.guideResearch(id, { autoAfter: 75 });
    this.stopNag();
    this.force(null);
    game.audio.play('fanfare', { volume: 0.4 });
    await this.wait(1.4); // let the tree's "research complete" moment play
    await this.leaveLab();
  }

  // ------------------------------------------------------------ bits
  // a cinematic on the real world (skipped quietly if cutscenes are missing)
  async cineShots(shots) {
    const game = this.game;
    await this.hideTeacher();
    game.ui?.foodPicker?.hide?.();
    try { await this.g(game.cutscene?.play({ shots })); } catch (e) { if (this.isSkip(e)) throw e; console.warn('cutscene', e); }
    game.ui?.syncFoodPicker?.();
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

  // gentle reminders if the player dawdles
  nag(text, { world = false } = {}) {
    this.stopNag();
    this.nagT = setInterval(() => {
      const g = this.game;
      if (g.ui?.ebuy || g.ui?.blueprint?.open || g.director?.active || this.skipping) return;
      // [v33 tut] the reminder comes from the Reynard already on screen (no second fox in the corner):
      // in the world it's his own bubble, on the HUD it's the guide's
      const t = this.teacher;
      if (world || !t) { this.guide?.bark(text(), { mood: 'normal', dur: 4 }); return; }
      if (!t.waiting) this.teach(text(), { dur: 4, mood: 'normal' });
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
    // e-Buy fills the screen: the guide steps out of its way (the shop's own hand points at Buy It Now)
    if (game.ui?.ebuy && this.teacher?.visible && !this._ebHide) { this._ebHide = true; try { this.teacher.skip(); } catch { /* ignore */ } this.hideTeacher(); }
    else if (!game.ui?.ebuy) this._ebHide = false;
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

// older classroom builds: compose new lessons from the ones that exist
const LESSON_FALLBACK = { fishlife: ['breeding'], build: [], bears: [], stars: [], pondlife: ['condition', 'breeding'], builder: ['plants'], customers: [] };
void LESSON_FALLBACK;

// if the classroom can't load, the fox explains in a few bubbles instead
const FALLBACK_LESSONS = {
  pondlife: ['Feed fish with the Food tool. Well fed boy ♂ + girl ♀ = a date, eggs... then YOU tap to hatch!'],
  builder: ['Beavers build big stuff, but only when PAID in food. Plant seeds, harvest, pay them!'],
  customers: ['Bears come at 5 to eat fish. Tag your best DO NOT EAT. Hungry bears RAMPAGE!'],
  fishlife: ['Fed boy ♂ + girl ♀ = a date, eggs, dad fertilizes, YOU tap to hatch.', 'Babies inherit size, colour and traits... and sometimes MUTATE!'],
  build: ['Build menu: small things pop in, big ones the beavers build (for food!).', 'Destroy tool: box the trees, beavers clear them. Pretty stuff = more bears.'],
  bears: ['Bears come at 5 and eat fish. Stock Snack Bowls for side dishes.', 'Tag your best fish DO NOT EAT. Hungry bears RAMPAGE!'],
  stars: ['Every bear leaves a review. Keep your rating above 1.0 or we\'re CLOSED!'],
  condition: ['Every fish has a belly and a mood.', 'Feed them and they fill their ♥ meter. Full meter = ready to breed!'],
  breeding: ['A boy ♂ + a girl ♀, both well fed...', 'Date, lay eggs, dad fertilizes, eggs incubate... then YOU tap to hatch!'],
  genes: ['Babies get genes from mum and dad: size, colour, traits, stars.'],
  mutations: ['Sometimes genes MUTATE! Rare = rich. Fancy food adds luck.'],
  plants: ['Plants grow from seed. Tap a ripe plant to harvest the batch!', 'Rare batches give more... and maybe a golden carrot!'],
  foods: ['Food bags on e-Buy, Bug Bites from the Bug Grinder, veggies from the garden.'],
};

void THREE;
export { STRUCTURES };
