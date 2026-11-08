// [v33 tut] Parts 2-7 of the day-1 tour: the hands-on fish course. [v33 tut2] Practical, step by step:
// every step is something you do in the real UI, and Reynard says it in the dialogue box.
//
//   2 Buying Fish    the e-Buy slot, buy the pair, unbox it, a boy + a girl
//   3 Feeding        the Food slot, you feed them, hunger + the well-fed heart
//   4 The Fish Scope you tap a fish, then every stat one by one (tap it, Reynard says what it means,
//                    with this fish's own numbers), its worth
//   5 Fish Care      the Pet slot (pet to full) + what happiness does, the pond's room, the Tag slot
//                    (DO NOT EAT), the Carry slot (drag a fish)
//   6 Eggs & Fry     top up the bellies, the date, the eggs, dad fertilizes, incubation, you hatch one, the fry
//   7 What Sells     the Scope on the new fry: its worth, size + colour from the parents, the money rule
//
// Every number Reynard says comes from the game's own rules (FishSystem.js, genes.js, data/species.js,
// data/foods.js, BearSystem.js); the comments next to the lines say where. Each wait the player has
// to finish has a fallback, so no step can stall the tour.
import { MORPHS, MUTATIONS } from '../../data/species.js';
import { sizeLabel } from '../genes.js';
import { openFishScope } from '../../ui/FishScope.js';
import { toolPicked } from './hudIntro.js';

const pct = (v) => Math.round(Math.max(0, Math.min(1, v || 0)) * 100);
const scopeNow = () => (typeof window !== 'undefined' ? window.__fishScope?.current || null : null);

/** the middle of the pond (the meadow's water tiles) */
export function pondMid(game) {
  const g = game.grid;
  let sx = 0, sz = 0, n = 0;
  for (let z = 21; z <= 55; z++) for (let x = 48; x <= 92; x++) if (g.inb?.(x, z) && g.isWater(x, z) && g.meadow?.[z * g.w + x]) { sx += x + 0.5; sz += z + 0.5; n++; }
  return n ? [sx / n, sz / n] : [70, 38];
}
const midOf = (a, b) => () => [(a.x + b.x) / 2, (a.z + b.z) / 2];
const live = (f) => f && !f.dead;
/** what a bear pays for a fish (the Fish Scope's WORTH: FishSystem.coinValue x 7 x the value mods) */
const worthOf = (game, f) => { try { return Math.round(game.fish.coinValue(f) * 7 * (game.mods?.fishValueMult || 1) * (game.mods?.payMult || 1)); } catch { return 0; } };

// ===================================================================== PART 2: BUYING FISH
export async function firstFish(T) {
  const game = T.game, G = T.guide;
  await T.part(2, 'Buying Fish');
  const pair = game.ebuyListings().find((l) => l.kind === 'fish' && !l.locked);
  game.quickEggs = true;
  T.force('ebuy', { ebuyFocus: pair?.id || null });
  const ordered = T.until('ordered', (o) => o.items.some((it) => it.kind === 'fish'));
  // the shop points at Buy It Now itself (UI.openEBuy, once, 0.9 s after it opens); if its listing
  // is still loading then, the tour's hand takes over (never both)
  const buyHand = G.marks.ui(() => (!document.querySelector('.pointer-hand.ebuy-ptr') && document.querySelector('.ebuy-host .eb-buy')) || null, { label: 'BUY!' });
  ordered.then(() => buyHand.stop(), () => buyHand.stop());
  await T.hud('ebuy', {
    line: '<b>e-Buy</b> is the shop: fish, eggs, food and buildings, paid in coins and delivered to the pond.', mood: 'happy',
    tryIt: () => ordered,
    tryLine: 'Open <b>e-Buy</b> and buy the <b>fish pair</b>: one boy and one girl.',
    nagLine: 'Open e-Buy and buy the fish pair.',
    timeout: 150,
    fallback: async () => {
      T.line('I\'ll order it for you this time.', { mood: 'happy' });
      try { game.ui?.closeEBuy?.(); if (pair) game.ebuyBuy(pair, 1); } catch (e) { console.warn('[tut] auto order', e); }
    },
  });
  T.force(null);
  T.line('Ordered. The delivery moose drops the parcel by the hut.', { mood: 'happy' });
  await T.unboxStep((o) => o.items.some((it) => it.kind === 'fish'));
  const two = await T.firstPair();
  T.holdLove = true; // no romance before Part 6 (Tutorial.update keeps their love timers up)
  const [boy, girl] = two[0].g.sex === 'M' ? two : [two[1], two[0]];
  T.win('NEW FISH!', two[0]);
  // meet them: over his shoulder, down at the water
  await T.cine(async (c) => {
    const mid = midOf(boy, girl);
    await c.walkNear(mid());
    c.ots(mid(), { zoom: 0.0125 });
    await c.beat(0.6);
    const s1 = c.mark(boy, { label: 'BOY', color: 'blue' });
    const s2 = c.mark(girl, { label: 'GIRL', color: 'pink' });
    await c.say(c.fox, 'In they go: a <b>boy</b> and a <b>girl</b>. You need one of each to get eggs.', { style: 'happy' });
    await c.say(c.fox, 'More fish means more for the bears to eat. Breeding them is free; buying them isn\'t.', { style: 'say' });
    s1(); s2();
  }, { id: 'tut:meet' });
  T.frame(midOf(boy, girl), 0.022); // the camera stays on the new pair
}

// ===================================================================== PART 3: FEEDING
export async function feeding(T) {
  const game = T.game, two = T.pair;
  await T.part(3, 'Feeding');
  await T.hud('feed', { line: 'The <b>FOOD</b> bag. Pick a food, then tap the water. Fish swim over and eat it.', mood: 'happy' });
  await feedPair(T, two, { first: true });
  T.win('FULL BELLIES!', two[1]);
  // what the two meters mean
  await T.cine(async (c) => {
    const f0 = live(two[0]) ? two[0] : two[1];
    c.low(f0, { zoom: 0.011, pitch: 0.46 });
    const m = c.mark(f0, { label: 'WELL FED', color: 'pink' });
    // FishSystem: HUNGER_RATE = 1/150 per second
    await c.say(c.fox, 'Two things to watch. <b>Hunger</b> climbs all day: full to starving in about two and a half minutes.', { style: 'say' });
    // FishSystem.eligibleForLove: fed >= 0.9; the fed meter drains at 1/420 per s, 1/90 per s once hunger > 0.7
    await c.say(c.fox, 'And the <b>well-fed heart</b>. Only a fish with a full heart will breed. Hungry fish empty it fast.', { style: 'say' });
    // FishSystem: hunger x0.3 at night; data/foods.js
    await c.say(c.fox, 'Fish get hungry three times slower at night. More foods come later: food bags on e-Buy, crops from your garden.', { style: 'happy' });
    m();
  }, { id: 'tut:meters' });
}

/** the hands-on feeding step (with the "I'll show you" fallback) */
export async function feedPair(T, two, { first = false } = {}) {
  const game = T.game, G = T.guide;
  game.setTool({ kind: 'feed' });
  try { game.foodStore.select('pellets'); } catch { /* ignore */ }
  game.ui?.syncFoodPicker?.();
  T.force('feed');
  T.frame(midOf(two[0], two[1]), 0.02);
  const stops = two.map((f, i) => G.mark(f, { color: i ? 'pink' : 'blue' }));
  // FishSystem.feedFish + data/foods.js: a pellet adds 0.34 to the well-fed meter
  stops.push(await T.tell(two[0], first ? '<b>Tap the water</b> right next to the fish. About three pellets fill one up.' : 'Feed them again: <b>tap the water</b> next to them.'));
  T.nag(() => 'Tap the water next to the fish to feed them.', { world: true });
  const fed = () => two.every((f) => !live(f) || f.fed >= 0.9);
  try {
    if (!(await T.within(T.waitFor(fed), first ? 55 : 40))) {
      T.line('Like this. Watch.', { mood: 'happy' });
      for (let k = 0; k < 4 && !fed(); k++) {
        for (const f of two) if (live(f) && f.fed < 0.9) { try { game.foodStore.throwAt(f.x, f.z); } catch { /* ignore */ } }
        await T.wait(2.4);
      }
      if (!fed()) for (const f of two) if (live(f)) { f.fed = Math.max(f.fed, 1); f.hunger = Math.min(f.hunger, 0.2); }
    }
  } finally {
    T.stopNag();
    stops.forEach((s) => s());
    T.force(null);
    T.clearChalk();
    T.frame(null);
  }
}

// ===================================================================== PART 4: THE FISH SCOPE
/** tap a fish (or the tour opens the Scope on it); resolves with the open Scope or null */
async function openScopeStep(T, fishes, line) {
  const game = T.game, G = T.guide;
  game.setTool({ kind: 'feed' });
  T.force('feed');
  T.frame(fishes.length > 1 ? midOf(fishes[0], fishes[1]) : fishes[0], 0.018);
  const ms = fishes.map((f, i) => G.mark(f, { color: i ? 'pink' : 'blue', label: 'TAP' }));
  ms.push(await T.tell(fishes[fishes.length - 1], line, { mood: 'happy' }));
  T.nag(() => 'Tap the fish to open the Fish Scope.', { world: true });
  try {
    if (!(await T.within(T.waitFor(() => !!scopeNow()), 40))) {
      const f = fishes.find(live);
      T.line('I\'ll open it for you.', { mood: 'happy' });
      if (f) openFishScope(game, f);
      await T.wait(0.6);
    }
  } finally {
    T.stopNag();
    ms.forEach((s) => s());
    T.clearChalk();
    T.frame(null);
  }
  return scopeNow();
}

export async function fishScope(T) {
  const two = T.pair;
  await T.part(4, 'The Fish Scope');
  await openScopeStep(T, two.filter(live), '<b>Tap a fish</b> to look at it through the <b>Fish Scope</b>.');
  await scopeLesson(T, (fish) => {
    const g = fish.g;
    const mo = MORPHS[g.morph] || MORPHS.normal;
    const mu = g.mut ? MUTATIONS[g.mut] : null;
    return [
      // FishSystem: 1/150 per s hunger; the fed meter drains x4.7 faster once hunger > 0.7; eligibleForLove: hunger < 0.75
      { k: 'hunger', label: 'HUNGER', why: () => `${pct(fish.hunger)}% hungry. Feed it before it climbs high: a starving fish won't breed and its well-fed heart drains.` },
      // Game.nurtureFish +0.2 a pet; FishSystem: love > 0.2 -> love timer x1.5; genes.breedGenes: nurtured parents x1.6 luck
      { k: 'mood', label: 'MOOD', why: () => `${pct(fish.love)}% happy. Petting fills it. Happy fish breed sooner and have luckier babies.` },
      { k: 'sex', label: 'SEX', why: () => (g.sex === 'M' ? 'A boy. After a date he swims over the eggs and fertilizes them.' : 'A girl. After a date she lays the eggs.') },
      // FishScope breed checklist = FishSystem.eligibleForLove: adult, fed >= 0.9, hunger < 0.75, loveT <= 0
      { k: 'breed', label: 'BREEDING', why: () => 'What it still needs before it can breed: grown up, well fed, not starving and rested. All ticked means ready.' },
      // data/species.js MORPHS values
      { k: 'morph', label: 'COLOUR', why: () => `${mo.name}. Rare colours are worth more: Albino x1.6, Golden x5, Prismatic x8.` },
      // genes.valueMult / mealMult: value and how full a bear gets scale with size
      { k: 'size', label: 'SIZE', why: () => `${sizeLabel(g.size)}, x${g.size.toFixed(2)}. Bigger fish are worth more and fill a bear up more.` },
      // genes.pickMutation: about 1 fresh roll in 5 gets one; MUTATIONS values
      { k: 'mut', label: 'MUTATION', why: () => (mu ? `${mu.name}! A mutation multiplies the price: this one x${mu.value}.` : 'No mutation. About one fresh egg in five rolls one, and it multiplies the price.') },
    ];
  }, (fish) => [
    // FishScope worth = coinValue * 7; FishSystem.coinValue = meal * value * valueMult(size x morph x mutation)
    { sel: '.fsc-worth', text: `WORTH: ${worthOf(T.game, fish)} coins. That's what a bear pays to eat this fish.`, mood: 'greedy' },
    { sel: '.fsc-btns', text: 'Tag and Pet buttons work right here in the Scope too.', mood: 'happy' },
  ], { hello: (fish) => `${fish.name || 'This fish'} under the Scope. Let's read it, one stat at a time.` });
  T.force(null);
}

/**
 * The Fish Scope lesson: for each step the stat's callout is pointed at (you tap it, or it opens itself),
 * then Reynard says what it means in the box; then the extra bits; then you close the Scope.
 * steps(fish) -> [{ k, label, why() }], extras(fish) -> [{ sel, text, mood }]
 */
async function scopeLesson(T, steps, extras, { hello = null } = {}) {
  const game = T.game, G = T.guide;
  let S = scopeNow();
  if (!S) return;
  const fish = S.fish;
  // the scope closes if you tap outside it: it comes right back
  const reopen = async () => {
    S = scopeNow();
    if (!S && live(fish) && !fish.held) { S = openFishScope(game, fish); await T.wait(0.7); }
    if (S) S.tipKey = '__tut'; // [v33 tut] no idle chatter over the lesson
    return S;
  };
  await reopen();
  if (!S) return;
  // [v33 tut2] inside the Scope, Reynard talks in the Scope's own dialogue strip (.fsc-say: his portrait +
  // the typed line), so there's one box on screen, never two. A waiting line moves on with a tap on it,
  // Enter / Space, or after its reading time.
  await T.hideTeacher();
  const say = (text, { mood = 'teacher', wait = false } = {}) => {
    const s = scopeNow();
    const plain = String(text).replace(/<[^>]+>/g, '');
    if (s) { try { s.tipKey = '__tut'; s.speak(plain, mood); s.poseT = Math.max(s.poseT || 0, 6); } catch { /* ignore */ } }
    if (!wait) return Promise.resolve();
    const secs = Math.min(10, 2.5 + plain.length * 0.055);
    return T.within(new Promise((res) => {
      const el = scopeNow()?.el?.querySelector('.fsc-say');
      const k = (e) => { if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); off(); res(); } };
      const c = () => { off(); res(); };
      const off = () => { window.removeEventListener('keydown', k, true); el?.removeEventListener('click', c); };
      window.addEventListener('keydown', k, true);
      el?.addEventListener('click', c);
      setTimeout(off, secs * 1000 + 100);
    }), secs);
  };
  if (hello) await T.g(say(hello(fish), { mood: 'excited', wait: true }));
  for (const st of steps(fish)) {
    if (!(await reopen())) break;
    const sel = `.fsc-call[data-k="${st.k}"]`;
    const arrow = G.marks.ui(sel, { label: 'TAP!' });
    say(`Tap ${st.label}.`, { mood: 'focused' });
    const tapped = T.waitFor(() => { const s = scopeNow(); return !s || !!s.open?.[st.k]; });
    T.stage = 'scope:' + st.k;
    await T.within(tapped, 14);
    if (!(await reopen())) { arrow.stop(); break; }
    if (!S.open?.[st.k]) { try { S.toggle(st.k); } catch { /* ignore */ } }
    arrow.stop();
    await T.g(say(st.why(), { mood: 'teacher', wait: true }));
    const s = scopeNow();
    if (s?.open?.[st.k]) { s.open[st.k] = false; try { s.renderCalls(); } catch { /* ignore */ } }
  }
  for (const x of extras(fish)) {
    if (!(await reopen())) break;
    T.stage = 'scope:' + x.sel;
    const a = G.marks.ui(x.sel);
    await T.g(say(x.text, { mood: x.mood, wait: true }));
    a.stop();
  }
  if (scopeNow()) {
    const a = G.marks.ui('.fsc-x', { label: 'CLOSE' });
    say('Tap the X to close the Scope.', { mood: 'happy' });
    if (!(await T.within(T.waitFor(() => !scopeNow()), 20))) { try { scopeNow()?.close(); } catch { /* ignore */ } }
    a.stop();
  }
  await T.hideTeacher();
  await T.wait(0.4);
}

// ===================================================================== PART 5: FISH CARE
export async function fishCare(T) {
  const game = T.game, G = T.guide, two = T.pair;
  await T.part(5, 'Fish Care');
  // ---- petting
  const loved = () => two.some((f) => live(f) && f.love >= 0.99);
  T.frame(midOf(two[0], two[1]), 0.018);
  let ms = [];
  await T.hud('pet', {
    line: '<b>PET</b> makes a fish happy. Happiness is the MOOD stat you just saw.', mood: 'happy',
    tryLine: 'Pick <b>PET</b>, then tap a fish again and again until its heart is full.',
    nagLine: 'Pet tool: tap a fish until its heart is full.',
    timeout: 70,
    tryIt: async () => {
      T.force('pet');
      if (!(await T.within(toolPicked(T, 'nurture'), 20))) game.setTool({ kind: 'nurture' });
      ms = two.map((f, i) => G.mark(f, { color: 'pink', label: i ? null : 'PET' }));
      T.nag(() => 'Pet tool: tap a fish until its heart is full.', { world: true });
      ms.push(await T.tell(two[0], 'Now <b>tap a fish</b> again and again until its heart is full.'));
      await T.waitFor(loved);
    },
    fallback: async () => {
      T.line('Like this: tap, tap, tap.', { mood: 'happy' });
      const f = two.find(live);
      for (let i = 0; i < 6 && f && !loved(); i++) { game.nurtureFish(f); await T.wait(0.45); }
    },
  });
  ms.forEach((s) => s());
  T.force(null);
  game.setTool({ kind: 'feed' });
  await T.cine(async (c) => {
    const f = two.find((x) => live(x) && x.love >= 0.9) || two.find(live);
    c.low(f, { zoom: 0.011, pitch: 0.44 });
    const m = c.mark(f, { label: 'HAPPY', color: 'pink' });
    // FishSystem: love > 0.2 -> loveT ticks x1.5 and fry grow x(1 + nurtureMult) = x2; genes.breedGenes: x1.6 luck
    await c.say(c.fox, 'Happy fish fall in love <b>1.5x sooner</b>, their fry grow <b>twice as fast</b>, and their babies roll rarer colours.', { style: 'happy' });
    // FishSystem: love -= dt / 240
    await c.say(c.fox, 'Happiness fades in about <b>four minutes</b>. Petting is free, so do it often.', { style: 'say' });
    m();
    // ---- the pond's room
    const P = pondMid(game);
    c.low(P, { zoom: 0.024, pitch: 0.62, lift: 0 });
    const cap = game.fish.capacity(), pop = game.fish.population();
    c.point(P, { label: `${pop} / ${cap} FISH`, r: 2.6, color: 'blue' });
    // FishSystem.capacity: water tiles x 0.62; FishSystem.update: canBreed only while population < capacity
    await c.say(c.fox, `The pond has room for about <b>${cap} fish</b>. When it's full, nobody breeds.`, { style: 'say' });
    await c.say(c.fox, 'So sell the extras to the bears, or make the pond bigger. More water, more room.', { style: 'happy' });
    c.unpoint();
  }, { id: 'tut:happy' });

  // ---- tags
  const girl = two.find((f) => live(f) && f.g.sex === 'F') || two.find(live);
  T.frame(midOf(two[0], two[1]), 0.018);
  let tagMs = [];
  await T.hud('tag', {
    line: '<b>TAG</b> puts a <b>DO NOT EAT</b> tag on a fish. Bears never touch a tagged fish.', mood: 'happy',
    tryLine: 'Pick <b>TAG</b>, then tap the fish you want to keep.',
    nagLine: 'Tag tool: tap a fish to tag it DO NOT EAT.',
    timeout: 60,
    tryIt: async () => {
      T.force('tag');
      const tagged = T.until('fishTagged');
      if (!(await T.within(toolPicked(T, 'tag'), 20))) game.setTool({ kind: 'tag' });
      tagMs = two.map((f) => G.mark(f, { color: 'red' }));
      T.nag(() => 'Tag tool: tap a fish to tag it DO NOT EAT.', { world: true });
      tagMs.push(await T.tell(girl, 'Now tap the fish you want to keep.'));
      await tagged;
    },
    fallback: async () => { T.line('I\'ll tag her for you.', { mood: 'happy' }); if (girl && !girl.tagged) game.tagFish(girl); },
  });
  tagMs.forEach((s) => s());
  T.force(null);
  game.setTool({ kind: 'feed' });
  {
    // Game.tagLimit = 1 + research
    const n = game.tagLimit();
    await T.teach(n <= 1 ? 'You have <b>one tag</b> for now. Keep it on your best breeder.' : `You have <b>${n} tags</b>. Keep them on your best breeders.`, { wait: true, mood: 'happy' });
  }

  // ---- carry
  const heldAny = () => game.fish.list.some((f) => f.held);
  T.frame(midOf(two[0], two[1]), 0.018);
  await T.hud('hand', {
    line: '<b>CARRY</b> picks a fish up so you can drop it somewhere else. Handy for putting a boy and a girl together.', mood: 'happy',
    tryLine: 'Pick <b>CARRY</b>, then press on a fish and drag it.',
    nagLine: 'Carry tool: press on a fish and drag it.',
    timeout: 45,
    tryIt: async () => {
      T.force('hand');
      if (!(await T.within(toolPicked(T, 'hand'), 20))) game.setTool({ kind: 'hand' });
      const m = two.map((f) => G.mark(f, { color: 'gold' }));
      T.nag(() => 'Carry tool: press on a fish and drag it.', { world: true });
      m.push(await T.tell(two[0], '<b>Press</b> on a fish and <b>drag</b> it.'));
      try { await T.waitFor(heldAny); await T.waitFor(() => !heldAny()); } finally { m.forEach((s) => s()); }
    },
    fallback: async () => { T.line('You can try that one later.', { mood: 'happy' }); },
  });
  T.force(null);
  T.frame(null);
  game.setTool({ kind: 'feed' });
}

// ===================================================================== PART 6: EGGS & FRY
export async function loveEggs(T) {
  const game = T.game, G = T.guide, two = T.pair;
  await T.part(6, 'Eggs & Fry');
  if (two.some((f) => live(f) && f.fed < 0.9)) {
    await T.teach('To breed, both need a <b>full heart</b>. They\'re hungry again.', { wait: true, mood: 'happy' });
    await feedPair(T, two);
  }
  T.holdLove = false;
  for (const f of two) if (live(f)) { f.loveT = Math.min(f.loveT, 1); f.fed = Math.max(f.fed, 1); f.hunger = Math.min(f.hunger, 0.3); }
  game.rig.lookAt(...midOf(two[0], two[1])());
  // listen for every stage up front: the pond doesn't wait for the talking
  const seen = { date: false, laid: false, fert: false, hatch: false };
  const dateP = T.until('fishDate').then(() => { seen.date = true; });
  const laidP = T.until('fishMated').then(() => { seen.laid = true; });
  const fertP = T.until('eggFertilized').then(() => { seen.fert = true; });
  const hatched = T.until('eggHatched').then(() => { seen.hatch = true; });
  T.watchPair = two;
  // FishSystem.eligibleForLove: adult, fed >= 0.9, hunger < 0.75, the love timer done
  T.line('A well-fed boy and girl find each other and go on a <b>date</b>. Watch.', { mood: 'happy' });
  if (!seen.date) await T.within(Promise.race([dateP, laidP, fertP, hatched]), 35);
  if (!seen.date && !seen.laid && !seen.fert && !seen.hatch) { T.forceDate(two); await T.within(dateP, 6); }
  if (seen.date && !seen.laid) T.line('There\'s the date. Next, she lays the eggs.', { mood: 'excited' });
  if (!seen.laid && !seen.fert && !seen.hatch) await T.within(Promise.race([laidP, fertP, hatched]), 45);
  T.watchPair = null;
  // still nothing: a clutch appears the old-fashioned way (the tour can't wait forever)
  if (!seen.laid && !seen.fert && !seen.hatch && !game.fish.eggs.some((e) => !e.bought)) {
    const [a, b] = two;
    if (live(a) && live(b)) { a.dateT = b.dateT = 0; try { game.fish.mate(a, b); } catch (e) { console.warn('[tut] mate', e); } }
  }
  const clutch = () => game.fish.eggs.find((e) => !e.bought && !e.dead);
  if (!seen.hatch && clutch()) {
    await T.cine(async (c) => {
      const e = clutch();
      await c.walkNear(e);
      c.ots(e, { zoom: 0.012 });
      const m = c.mark(e, { label: 'EGGS', color: 'gold' });
      await c.say(c.fox, 'Eggs! Now the dad swims over them and <b>fertilizes</b> them.', { style: 'excited' });
      // FishSystem: SPOIL_TIME = 90 s for a laid, unfertilized clutch
      await c.say(c.fox, 'If he takes longer than <b>90 seconds</b>, they spoil. Keep the boy close to the girl.', { style: 'say' });
      m();
    }, { pause: true, id: 'tut:eggs' });
  }
  // dad does his job (nudge him if he wandered off)
  if (!seen.fert && !seen.hatch) {
    const ok = await T.within(Promise.race([fertP, hatched]), 25);
    if (!ok) { const e = game.fish.eggs.find((x) => x.stage === 'laid'); if (e) game.fish.fertilize(e, null); }
  }
  if (!seen.hatch) {
    // FishSystem.fertilize: incubation 150-210 s (the tour runs the express version)
    T.line('Fertilized. Eggs <b>incubate</b> for about three minutes. Today I\'ll hurry them.', { mood: 'happy' });
    const bred = game.fish.eggs.find((e) => !e.bought && e.stage !== 'laid');
    if (bred && !bred.ready) bred.t = Math.min(bred.t, 5);
    if (!game.fish.eggs.some((e) => e.ready)) await T.within(Promise.race([T.until('eggReady'), hatched]), 30);
    if (!seen.hatch) {
      const ready = game.fish.eggs.find((e) => e.ready) || game.fish.eggs.find((e) => !e.bought);
      if (ready && !ready.ready) { ready.t = 0; ready.ready = true; }
      if (ready) { game.ui?.stopTracking?.(); T.frame(ready, 0.018); }
      game.quickEggs = false;
      await T.wait(0.6);
      const st = ready ? G.mark(ready, { label: 'TAP!', color: 'gold' }) : null;
      // FishSystem.tickEgg: ready eggs wait for a tap
      const stop = await T.tell(ready, 'Ready eggs glow and wait for you. <b>Tap the egg</b> to hatch it.', { mood: 'excited' });
      T.nag(() => 'Tap the glowing egg to hatch it.', { world: true });
      if (!(await T.within(hatched, 50))) {
        T.line('I\'ll hatch this one.', { mood: 'happy' });
        const e = game.fish.eggs.find((x) => x.ready);
        if (e) { try { game.ui.tapPondEgg(e); } catch { /* ignore */ } }
        if (!(await T.within(hatched, 20))) { const e2 = game.fish.eggs.find((x) => x.ready); if (e2) { const born = game.fish.hatchNow(e2); game.emit('eggHatched', born[0] || null); } }
      }
      T.stopNag();
      stop?.();
      st?.();
      T.frame(null);
    }
  }
  game.quickEggs = false;
  await T.wait(0.8);
  T.win('A BABY!');
  const baby = game.fish.list.filter((f) => !f.adult && !f.tank).sort((a, b) => (b.id || 0) - (a.id || 0))[0];
  T.baby = baby || null;
  if (baby) {
    await T.cine(async (c) => {
      await c.walkNear(baby);
      c.ots(baby, { zoom: 0.0115 });
      const m = c.mark(baby, { label: 'FRY', color: 'green' });
      // FishSystem.mate: 1 egg + a 25% chance of a 2nd
      await c.say(c.fox, 'A <b>fry</b>! A clutch hatches one or two.', { style: 'happy' });
      // FishSystem: GROW_TIME 70 / species growth (bluegill 1.2) when hunger < 0.7; x0.35 when hungry
      await c.say(c.fox, 'Fed fry grow up in about <b>a minute</b>. Hungry fry grow three times slower.', { style: 'say' });
      // FishSystem.mate: the love timer resets to 240-360 s
      await c.say(c.fox, 'The parents rest four to six minutes, then they\'re ready for another date.', { style: 'say' });
      m();
    }, { id: 'tut:baby' });
  }
}

// ===================================================================== PART 7: WHAT SELLS
export async function whatSells(T) {
  const game = T.game, two = T.pair;
  await T.part(7, 'What Sells');
  const baby = live(T.baby) && !T.baby.held ? T.baby : null;
  const [mum, dad] = two[0]?.g?.sex === 'F' ? two : [two[1], two[0]];
  if (baby) {
    await openScopeStep(T, [baby], '<b>Tap the fry</b> to scan it.');
    await scopeLesson(T, (f) => [
      // genes.breedGenes: size = the parents' mean + (rand - 0.45) x 0.14 x luck (a small lean up)
      { k: 'size', label: 'SIZE', why: () => `Size x${f.g.size.toFixed(2)}. Babies get about the <b>average</b> of mum and dad, with a small nudge up. Breed your biggest.` },
      // genes.breedGenes inheritMorph: 38% per parent with a rare morph; MORPHS.chance
      // FishSystem: GROW_TIME 70 s / species growth; x0.35 when hungry
      { k: 'age', label: 'AGE', why: () => 'Still a fry. Fed fry grow up in about a minute; then they\'re worth full price.' },
      { k: 'morph', label: 'COLOUR', why: () => 'Colours run in families: a rare-coloured parent passes it on about <b>4 times in 10</b>.' },
    ], (f) => {
      const w = worthOf(game, f);
      // FishSystem.coinValue: fry x0.35
      return [{ sel: '.fsc-worth', text: `Worth ${w} now. Fry are worth about a third, so grown up this one is worth about ${Math.round(w / 0.35)}.`, mood: 'greedy' }];
    }, { hello: () => 'Our new fry. Two things it got from its parents...' });
  }
  void mum; void dad;
  // the money rule (genes.valueMult: size x morph x mutation, chonky x1.35; BearSystem.finishReview: golden -> +1 star)
  await T.teach('So the money rule: <b>big</b>, <b>rare colours</b> and <b>mutations</b> sell for the most. Breed your best with your best.', { wait: true, mood: 'greedy' });
  await T.teach('A bear who eats a <b>Golden</b> fish even gives an extra star.', { wait: true, mood: 'happy' });
  // BearSystem.planWave: from day 5, 15% of bears prefer a species; the wrong one can cost a star
  await T.teach('From day 5, some bears want <b>one species</b>. More species come from e-Buy and research.', { wait: true, mood: 'happy' });
}
