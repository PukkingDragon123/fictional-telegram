// First-day tutorial: Pond School! It opens inside Reynard's room, where he's
// dressed as a teacher today. Lessons are full-screen classroom cutscenes
// (src/game/Classroom.js: fish students, chalkboard drawings) and out at the
// pond the teacher fox runs around the screen and the UI pointing with his
// stick (src/ui/TeacherOverlay.js). The UI starts empty and each piece appears
// only when he introduces it:
//   lesson 1 (a fish's condition) -> buy your first 2 fish on e-Buy -> unbox,
//   Reynard carries the bag to the pond -> feed them until they're WELL FED ->
//   lesson 2 (love & eggs) -> watch them date, lay, fertilize -> tap to hatch ->
//   lesson 3 (genes & mutations) -> beaver crew + their Snack Bar -> lesson 4
//   (plants & food) -> plant carrots, harvest, pay the beavers -> clear trees ->
//   the clock. Day 1 is a building day: bears start on day 2.
import { HUT, OFFICE, MEADOW } from '../world/worldgen.js';
import { STRUCTURES } from '../data/structures.js';

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const clsMods = import.meta.glob('./Classroom.js', { eager: true });
const Classroom = clsMods['./Classroom.js']?.Classroom || null;
const teachMods = import.meta.glob('../ui/TeacherOverlay.js', { eager: true });
const TeacherOverlay = teachMods['../ui/TeacherOverlay.js']?.TeacherOverlay || null;

export const ALL_FEATURES = ['coins', 'ebuy', 'build', 'clear', 'land', 'feed', 'hand', 'tag', 'pet', 'clock', 'speed', 'rating', 'lab', 'dex', 'reviews', 'match'];

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.teacher = null;
    this.classroom = null;
  }

  // ------------------------------------------------------------ helpers
  // Resolves when `ev` fires (and passes `pred`, if given)
  until(ev, pred = null) {
    this.stage = 'until:' + ev; // where the tour is waiting (debug / tests)
    return new Promise((res) => {
      const fn = (d) => {
        if (pred && !pred(d)) return;
        const L = this.game.listeners[ev];
        L.splice(L.indexOf(fn), 1);
        res(d);
      };
      this.game.on(ev, fn);
    });
  }

  // polls a condition (for things that have no event)
  waitFor(test, every = 0.25) {
    this.stage = 'waitFor';
    return new Promise((res) => {
      const tick = () => { let ok = false; try { ok = test(); } catch { ok = false; } if (ok) res(); else setTimeout(tick, every * 1000); };
      tick();
    });
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
    if (w && h?.done) await h.done;
    else await wait(dur || 1.6);
  }

  async lab(text, expr, mood = 'normal') {
    const h = this.game.lab.say(text, expr, { mood, wait: true });
    if (h?.done) await h.done; else await wait(2);
  }

  // the screen-space teacher (runs around the UI with his pointer stick)
  getTeacher() {
    if (this.teacher || !TeacherOverlay) return this.teacher;
    try { this.teacher = new TeacherOverlay({ game: this.game, root: document.body }); } catch (e) { console.warn('TeacherOverlay failed', e); this.teacher = null; }
    return this.teacher;
  }

  // run to `target`, point at it (and circle it in chalk), say a line
  async teach(text, { target = null, circle = false, arrowTo = null, wait: w = false, dur = 4, mood = 'normal', doodle = null } = {}) {
    const t = this.getTeacher();
    this.stage = 'teach:' + text.replace(/<[^>]+>/g, '').slice(0, 24);
    if (t) {
      try {
        if (!t.visible) await t.show();
        if (target) await t.goTo(target);
        if (circle && target) t.circle(target);
        if (arrowTo) t.arrow(target || { x: innerWidth / 2, y: innerHeight / 2 }, arrowTo);
        if (doodle) t.doodle(doodle, target || { x: innerWidth / 2, y: innerHeight / 3 });
        await t.say(text, { wait: w, dur, mood });
        return;
      } catch (e) { console.warn('teacher', e); }
    }
    // fallback: the bouncing hand + a bubble from the fox in the world
    const ptr = target && typeof target === 'string' ? this.game.ui?.pointAt?.(target) : null;
    await this.fox(text.replace(/<[^>]+>/g, ''), { wait: w, dur, mood });
    if (ptr) setTimeout(() => ptr(), (dur || 3) * 1000);
  }

  // keep the stick on something while we wait for the player
  pointAt(target, { circle = true } = {}) {
    const t = this.getTeacher();
    if (t) {
      t.goTo(target).catch?.(() => {});
      if (circle) t.circle(target);
      return () => { try { t.clearChalk(); } catch { /* ignore */ } };
    }
    return typeof target === 'string' ? this.game.ui?.pointAt?.(target) || (() => {}) : () => {};
  }

  // a full-screen classroom lesson (fallback: a few lines from the fox)
  async lesson(id) {
    const game = this.game;
    this.stage = 'lesson:' + id;
    if (Classroom && !clsMods['./Classroom.js']?.LESSONS?.[id] && LESSON_FALLBACK[id]) {
      for (const k of LESSON_FALLBACK[id]) await this.lesson(k);
      return;
    }
    if (Classroom) {
      try {
        if (!this.classroom) this.classroom = game.classroom ||= new Classroom(game);
        game.ui?.foodPicker?.hide?.();
        const t = this.teacher;
        if (t?.visible) { try { t.clearChalk(); await t.hide(); } catch { /* ignore */ } }
        await this.classroom.lesson(id);
        game.ui?.syncFoodPicker?.();
        return;
      } catch (e) { console.warn('lesson failed', id, e); }
    }
    const lines = FALLBACK_LESSONS[id] || [];
    for (const l of lines) await this.fox(l, { mood: 'happy' });
  }

  // the parcel lands: point at it until it's unboxed
  async unboxStep(pred) {
    const game = this.game;
    const landed = () => game.delivery.waiting().some((p) => pred(p.order));
    // listen for the unboxing right away: a quick tap must not slip past us
    const delivered = this.until('delivered', pred);
    if (!landed()) await this.until('parcelLanded', (p) => pred(p.order));
    let done = false;
    delivered.then(() => { done = true; });
    await wait(0.5);
    if (done) return;
    const stop = this.pointAt('sel:.parceltag');
    this.teach('A parcel! <b>Tap the box</b> to unbox it!', { target: 'sel:.parceltag', dur: 4, mood: 'excited' });
    this.nag(() => 'Tap the box!');
    this.stage = 'until:delivered';
    await delivered;
    this.stopNag();
    stop?.();
  }

  // ------------------------------------------------------------ the tour
  async run() {
    const game = this.game;
    const L = game.lab;
    this.active = true;
    game.tutorialHold = true; // the clock waits until the tour is over
    game.state.unlocked = [];
    game.ui?.refreshUnlocks?.();
    try { game.fox.rig?.setOutfit?.('teacher'); } catch { /* ignore */ } // school day!

    // ---- inside the fox's room: it's a school day
    L.enterTutorial();
    try { L.fox?.setOutfit?.('teacher'); L.fox?.holdProp?.('pointer'); } catch { /* ignore */ }
    await wait(2.4);
    await L.tutorialStand();
    await this.lab('Oh! You\'re here! Class is in session!', 'shocked', 'excited');
    await this.lab('I\'m Reynard. Fish tycoon. Today: your TEACHER.', 'smug');
    L.fox?.play(L.fox?.anims?.includes('teach_point') ? 'teach_point' : 'laugh_evil', { loop: false, onDone: () => L.fox?.play('idle', { loop: true }) });
    await this.lab('Bears in suits eat here at 5. We sell them FISH!', 'scheming', 'happy');
    await this.lab('But first, a field trip. Follow me!', 'excited', 'excited');
    await L.walkOut();

    // ---- out of the hut door, down to the (empty) pond
    const fox = game.fox;
    fox.x = HUT.x + 1.5; fox.z = HUT.z + 3.2; fox.heading = Math.PI / 2;
    game.rig.lookAt(fox.x, fox.z + 1, true);
    game.rig.wupp = game.rig.wuppGoal = 0.022;
    game.state.paused = false;
    await this.irisOpen(fox.x, 1, fox.z);
    const pond = game.shoreTiles().sort((a, b) => Math.hypot(a[0] - fox.x, a[1] - fox.z) - Math.hypot(b[0] - fox.x, b[1] - fox.z))[0];
    if (pond) fox.target = { x: pond[0] + 0.5, z: pond[1] + 0.5 };
    this.follow = true;
    await wait(1.6);
    await this.teach('Behold! The pond! ...It\'s <b>empty</b>. Quick class first!', { wait: true, mood: 'excited' });

    // ---- lesson 1: a fish's condition
    await this.lesson('condition');

    // ---- buy the first two fish
    game.unlockFeature('coins');
    game.unlockFeature('ebuy');
    const pair = game.ebuyListings().find((l) => l.kind === 'fish' && !l.locked);
    game.quickEggs = true;
    this.force('ebuy', { ebuyFocus: pair?.id || null });
    let stop = this.pointAt('tool:ebuy');
    this.teach('Step 1: buy <b>2 fish</b> on e-Buy! A boy ♂ and a girl ♀.', { target: 'tool:ebuy', circle: true, dur: 6, mood: 'excited' });
    this.nag(() => 'Tap e-Buy and buy the fish pair!');
    await this.until('ordered', (o) => o.items.some((it) => it.kind === 'fish'));
    this.stopNag();
    this.force(null);
    stop?.();
    this.teach('Moose Express is on it!', { dur: 2.5, mood: 'happy' });
    await this.unboxStep((o) => o.items.some((it) => it.kind === 'fish'));
    const newFish = () => game.fish.list.filter((f) => f.adult && !f.tank);
    await this.waitFor(() => newFish().length >= 2);
    await wait(0.8);
    const two = newFish().slice(0, 2);
    this.follow = false;
    game.rig.lookAt((two[0].x + two[1].x) / 2, (two[0].z + two[1].z) / 2);
    this.teach('Our first fish! ♥', { target: () => this.fishScreen(two[0]), dur: 2.2, mood: 'happy' });
    await wait(1.4);

    // ---- feed them until they're well fed
    game.unlockFeature('feed');
    game.setTool({ kind: 'feed' });
    game.foodStore.select('pellets');
    game.ui?.syncFoodPicker?.();
    this.force('feed');
    stop = this.pointAt(() => this.fishScreen(two[0]));
    this.teach('Hungry fish can\'t love! <b>Tap the water</b> by them to fill their ♥ meters!', { target: () => this.fishScreen(two[0]), dur: 6 });
    this.nag(() => 'Tap the water near the fish to feed them!');
    const fed = () => two.every((f) => f.dead || f.fed >= 0.9);
    await this.waitFor(fed);
    this.stopNag();
    stop?.();
    this.force(null);
    this.teach('♥ Full bellies! <b>Ready for love.</b>', { target: () => this.fishScreen(two[1]), dur: 2.2, mood: 'excited' });
    await wait(1.6);

    // ---- lesson 2: fish life (love, eggs, genes & mutations in one go), then watch it happen
    await this.lesson('fishlife');
    this.getTeacher();
    for (const f of two) { f.loveT = Math.min(f.loveT, 1); f.fed = Math.max(f.fed, 1); }
    game.rig.lookAt((two[0].x + two[1].x) / 2, (two[0].z + two[1].z) / 2);
    this.watchPair = two;
    // listen for every stage up front: the pond doesn't wait for the teacher to finish talking
    const seen = { date: false, fert: false, hatch: false };
    const dateP = this.until('fishDate').then(() => { seen.date = true; });
    const fertP = this.until('eggFertilized').then(() => { seen.fert = true; });
    const hatched = this.until('eggHatched').then(() => { seen.hatch = true; });
    this.teach('Shh... watch them!', { dur: 2.5, mood: 'happy' });
    if (!seen.date) await Promise.race([dateP, fertP, hatched, wait(40)]);
    if (!seen.date && !seen.fert && !seen.hatch) this.forceDate(two);
    if (!seen.fert && !seen.hatch) this.teach('A <b>date</b>! ♥', { target: () => this.fishScreen(two[0]), dur: 3, mood: 'excited' });
    if (!seen.fert && !seen.hatch) await Promise.race([fertP, hatched, wait(60)]);
    this.watchPair = null;
    if (!seen.hatch && !game.fish.eggs.some((e) => e.stage === 'incubate' || e.ready)) {
      const laid = game.fish.eggs.find((e) => e.stage === 'laid');
      if (laid) game.fish.fertilize(laid, null);
    }
    const hatchedNow = () => seen.hatch;
    if (!seen.hatch) await this.teach('Eggs! Dad fertilized them. Now they <b>incubate</b>...', { dur: 3, mood: 'happy' });
    const bred = game.fish.eggs.find((e) => !e.bought && e.stage !== 'laid');
    if (bred && !bred.ready) bred.t = Math.min(bred.t, 4);
    if (!hatchedNow() && !game.fish.eggs.some((e) => e.ready)) await Promise.race([this.until('eggReady'), hatched, wait(30)]);
    game.quickEggs = false;
    if (!hatchedNow()) {
      const ready = game.fish.eggs.find((e) => e.ready);
      if (ready) { game.ui?.stopTracking?.(); game.rig.lookAt(ready.x, ready.z); }
      await wait(0.6);
      stop = this.pointAt('sel:.eggtag.ready');
      this.teach('Ready! <b>Tap the egg</b> to hatch it!', { target: 'sel:.eggtag.ready', dur: 4, mood: 'excited' });
      this.nag(() => 'Tap the egg!');
      await hatched;
      this.stopNag();
      stop?.();
    }
    await wait(0.8);
    game.unlockFeature('hand');
    game.unlockFeature('pet');

    // ---- lesson 3: building (and who does the heavy lifting)
    await this.teach('Fish: done! Now we <b>BUILD</b>. Class!', { dur: 2.2, mood: 'excited' });
    await this.lesson('build');

    // ---- beavers: order a crew, place the lodge
    await this.teach('Workers first: <b>BEAVERS!</b>', { dur: 2.5, mood: 'shout' });
    this.force('ebuy', { ebuyFocus: 'item_lodge' });
    stop = this.pointAt('tool:ebuy');
    this.teach('Order a <b>BEAVER CREW</b> on e-Buy!', { target: 'tool:ebuy', circle: true, dur: 5, mood: 'excited' });
    this.nag(() => 'Tap e-Buy! Beaver crew!');
    await this.until('ordered', (o) => o.items.some((it) => it.type === 'lodge'));
    this.stopNag();
    this.force(null);
    stop?.();
    await this.unboxStep((o) => o.items.some((it) => it.type === 'lodge'));
    await wait(0.6);
    game.unlockFeature('build');
    this.force('build', { bpTab: 'inv', bpSelect: { kind: 'build', type: 'lodge', free: true } });
    stop = this.pointAt('tool:build');
    this.teach('Place the lodge in the water by the shore!', { target: 'tool:build', circle: true, dur: 5 });
    this.nag(() => 'Build ▸ tap the shore water!');
    await this.until('built', (s) => s.type === 'lodge');
    this.stopNag();
    this.force(null);
    game.ui?.blueprint?.exit();
    stop?.();
    game.state.beaverCredit = 0; // the signing bonus goes on the snack bar lesson instead
    await wait(0.8);

    // ---- the beavers' snack bar (they build it for free)
    await this.teach('Beavers only work when <b>PAID</b>. In food! First: their <b>Snack Bar</b>.', { wait: true, mood: 'scheming' });
    const inv = (game.state.inventory ||= {});
    inv.beaverbar = (inv.beaverbar || 0) + 1;
    game.emit('inventory', inv);
    this.force('build', { bpTab: 'inv', bpSelect: { kind: 'build', type: 'beaverbar', free: true } });
    stop = this.pointAt('tool:build');
    this.teach('Place the <b>Beaver Snack Bar</b> on land near the lodge!', { target: 'tool:build', dur: 5 });
    this.nag(() => 'Build ▸ place the Beaver Snack Bar on land!');
    await this.until('built', (s) => s.type === 'beaverbar');
    this.stopNag();
    this.force(null);
    game.ui?.blueprint?.exit();
    stop?.();
    const bar = () => game.structures.list.find((s) => s.type === 'beaverbar' && !s.removed);
    await this.waitFor(() => bar()?.built);
    await this.teach('Built for free! (Beavers are not dumb.)', { target: () => this.structScreen(bar()), dur: 3, mood: 'happy' });

    // ---- lesson 4: plants & food, then grow + harvest carrots
    await this.lesson('plants');
    await this.lesson('foods');
    inv.carrot = (inv.carrot || 0) + 2;
    game.emit('inventory', inv);
    this.force('build', { bpTab: 'inv', bpSelect: { kind: 'build', type: 'carrot', free: true } });
    stop = this.pointAt('tool:build');
    this.teach('Here, carrot seeds! <b>Plant them</b> on land.', { target: 'tool:build', circle: true, dur: 5, mood: 'happy' });
    this.nag(() => 'Build ▸ plant the carrot seeds on land!');
    await this.until('built', (s) => s.type === 'carrot');
    this.stopNag();
    this.force(null);
    game.ui?.blueprint?.exit();
    stop?.();
    game.quickCrops = true;
    const patch = game.structures.list.find((s) => s.type === 'carrot' && !s.removed);
    if (patch) game.rig.lookAt(patch.x + 0.5, patch.z + 0.5);
    await this.teach('Seed... sprout... growing...', { target: patch ? () => this.structScreen(patch) : null, dur: 3 });
    await this.waitFor(() => game.harvest.ripeList().length > 0);
    game.quickCrops = false;
    stop = this.pointAt('sel:.croptag');
    this.teach('Ripe! <b>Tap the tag</b> to harvest the batch!', { target: 'sel:.croptag', dur: 5, mood: 'excited' });
    this.nag(() => 'Tap the ripe carrots to harvest them!');
    await this.until('harvested');
    this.stopNag();
    stop?.();
    await wait(1.2);

    // ---- pay the beavers with the carrots
    game.setTool({ kind: 'feed' });
    game.foodStore.select('carrot');
    game.ui?.syncFoodPicker?.();
    this.force('feed');
    stop = this.pointAt(() => this.structScreen(bar()));
    this.teach('Carrots are in your Food bag. Now <b>tap the Snack Bar</b> to pay the crew!', { target: () => this.structScreen(bar()), dur: 6, mood: 'happy' });
    this.nag(() => 'Food tool: pick the carrots, then tap the Beaver Snack Bar!');
    await this.until('stocked', (d) => d.s.type === 'beaverbar');
    this.stopNag();
    this.force(null);
    stop?.();
    await this.teach('Paid! No pay, no work. <b>Snacks = jobs.</b>', { dur: 3, mood: 'excited' });

    // ---- clear trees with the beavers: the DESTROY button, then drag a box
    game.unlockFeature('clear');
    game.setTool({ kind: 'feed' });
    this.force('clear');
    stop = this.pointAt('tool:clear');
    this.teach('More land = more money! Tap the <b>DESTROY</b> button!', { target: 'tool:clear', circle: true, dur: 5, mood: 'excited' });
    this.nag(() => 'Tap the Destroy button!');
    if (game.tool.kind !== 'clear') await this.until('tool', (t) => t.kind === 'clear');
    this.stopNag();
    stop?.();
    const edge = this.forestEdge();
    if (edge) game.rig.lookAt(edge.x, edge.z);
    stop = edge ? this.pointAt(() => this.worldScreen(edge.x, 0.8, edge.z)) : () => {};
    this.teach('Now <b>drag a box</b> over the trees next to your land!', { target: edge ? () => this.worldScreen(edge.x, 0.8, edge.z) : null, dur: 6 });
    this.nag(() => 'Destroy tool: drag a box over the trees at the edge!');
    await this.until('clearArea');
    this.stopNag();
    stop?.();
    this.force(null);
    this.teach('Red = marked! Then tape goes up and the beavers chop them <b>bit by bit</b>.', { dur: 4.5, mood: 'happy' });
    await this.until('cleared');
    this.teach('TIMBER! Ka-ching!', { dur: 1.8, mood: 'excited' });
    await wait(2);
    game.setTool({ kind: 'feed' });

    // ---- land plots for sale
    game.unlockFeature('land');
    stop = this.pointAt('tool:land');
    await this.teach('Want even more room? <b>Buy land</b> with the Land tool when you\'re rich!', { target: 'tool:land', circle: true, wait: true, mood: 'scheming' });
    stop?.();

    // ---- lessons: bears & stars
    await this.teach('Last class: our <b>customers</b>...', { dur: 2.2, mood: 'scared' });
    await this.lesson('bears');
    await this.lesson('stars');

    // ---- the clock (bears come tomorrow), with a peek up the mountain
    game.unlockFeature('clock');
    await this.cine([
      { at: { x: OFFICE.x, z: OFFICE.z + 7 }, wupp: 0.03, yaw: 0, dur: 2.8, sfx: 'growl', caption: 'Bear Corp, tomorrow...', sub: '4:59 PM. Four hundred empty stomachs.' },
      { at: { x: OFFICE.x, z: OFFICE.z + 9 }, wupp: 0.022, dur: 1.8, call: () => game.audio.play('roar', { volume: 0.35 }), caption: 'RUMBLE', sub: '"Is it five yet?"' },
      { at: { x: game.fox.x, z: game.fox.z + 0.6 }, wupp: 0.02, dur: 2.2, caption: 'Meanwhile...', sub: 'Reynard has ONE day to get ready.' },
    ]);
    stop = this.pointAt('sel:#clockwrap');
    await this.teach('Bears come <b>TOMORROW</b> at 5. Tap the clock to go faster!', { target: 'sel:#clockwrap', wait: true, mood: 'scared' });
    stop?.();
    game.particles.confetti(game.fox.x, game.fox.y + 1.5, game.fox.z, 40);
    await this.teach('<b>Class dismissed!</b> Now go make me RICH!', { wait: true, mood: 'excited' });
    game.unlockFeature('speed');
    game.setTool({ kind: 'feed' });
    try { const t = this.teacher; if (t) { t.clearChalk(); await t.hide(); } } catch { /* ignore */ }
    try { game.fox.rig?.setOutfit?.('default'); } catch { /* ignore */ }
    this.follow = false;
    game.tutorialHold = false;
    game.state.tutorialDone = true;
    this.active = false;
    game.save();
  }

  // ------------------------------------------------------------ bits
  // a cinematic on the real world (skipped quietly if cutscenes are missing)
  async cine(shots) {
    const game = this.game;
    const t = this.teacher;
    if (t?.visible) { try { t.clearChalk(); await t.hide(); } catch { /* ignore */ } }
    game.ui?.foodPicker?.hide?.();
    try { await game.cutscene?.play({ shots }); } catch (e) { console.warn('cutscene', e); }
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
  nag(text) {
    this.stopNag();
    this.nagT = setInterval(() => { if (!this.game.ui?.ebuy && !this.game.ui?.blueprint?.open) this.game.notify(text(), 'info'); }, 14000);
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
    // keep the action in view, but the player can always look around (we wait until they stop)
    if (performance.now() - (game.rig.userCamT || 0) < 7000) return;
    if (this.watchPair) {
      const [a, b] = this.watchPair;
      if (a && b && !a.dead && !b.dead) game.rig.lookAt((a.x + b.x) / 2, (a.z + b.z) / 2);
    } else if (this.follow) { const f = game.fox; game.rig.lookAt(f.x, f.z + 0.6); }
  }

  // later unlocks that come from playing, not the tour
  static progress(game) {
    if (!game.state.tutorialDone) return;
    game.unlockFeature('land', { quiet: true });
    if (game.state.day >= 2) { game.unlockFeature('rating'); game.unlockFeature('reviews'); }
    if (game.state.day >= 2) game.unlockFeature('lab');
    if (game.state.discovered.length >= 2 || game.state.day >= 3) game.unlockFeature('dex');
    if (game.state.day >= 3) game.unlockFeature('tag');
  }
}

// older classroom builds: compose new lessons from the ones that exist
const LESSON_FALLBACK = { fishlife: ['breeding'], build: [], bears: [], stars: [] };

// if the classroom can't load, the fox explains in a few bubbles instead
const FALLBACK_LESSONS = {
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

export { STRUCTURES };
