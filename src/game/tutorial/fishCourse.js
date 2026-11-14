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
  const spent = T.spentSince();
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
  T.line(spent() > 0 ? `That's <b>${spent()} coins</b> for the pair. You have ${T.coins()} left; the bears pay it back.` : 'Ordered. The delivery moose drops the parcel by the hut.', { mood: 'happy' });
  await T.unboxStep((o) => o.items.some((it) => it.kind === 'fish'));
  const two = await T.firstPair();
  T.holdLove = true; // no romance before Part 6 (Tutorial.update keeps their love timers up)
  const [boy, girl] = two[0].g.sex === 'M' ? two : [two[1], two[0]];
  if (boy && !boy.name) boy.name = 'Clyde';
  if (girl && !girl.name) girl.name = 'Bonnie';
  T.win('NEW FISH!', two[0]);
  // meet them: over his shoulder, down at the water
  await T.cine(async (c) => {
    const mid = midOf(boy, girl);
    await c.walkNear(mid());
    c.ots(mid(), { zoom: 0.0125 });
    await c.beat(0.6);
    const s1 = c.mark(boy, { label: 'BOY', color: 'blue' });
    const s2 = c.mark(girl, { label: 'GIRL', color: 'pink' });
    await c.say(c.fox, `In they go. <b>${T.nm(boy)}</b> is the boy, <b>${T.nm(girl)}</b> the girl. I named them; you can rename them in the Fish Scope.`, { style: 'happy' });
    await c.say(c.fox, `That's ${T.pondCount()} fish in the pond. Two won't feed many bears, so we'll breed them. Eggs need a boy and a girl.`, { style: 'say' });
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
    await c.say(c.fox, `Both full: ${T.nm(two[0])} is ${pct(two[0]?.hunger)}% hungry, ${T.nm(two[1])} ${pct(two[1]?.hunger)}%. That climbs all day: full to starving takes about five hours on the clock.`, { style: 'say' });
    // FishSystem.eligibleForLove: fed >= 0.9; the fed meter drains at 1/420 per s, 1/90 per s once hunger > 0.7
    await c.say(c.fox, 'And the <b>well-fed heart</b>. Only a fish with a full heart will breed. Hungry fish empty it fast.', { style: 'say' });
    // FishSystem: hunger x0.3 at night; data/foods.js
    await c.say(c.fox, 'So feed them in the morning and again in the afternoon. At night they get hungry three times slower.', { style: 'happy' });
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
  const [a, b] = two;
  stops.push(await T.tell(two[0], `${T.nm(a)} is ${pct(a?.hunger)}% hungry, ${T.nm(b)} ${pct(b?.hunger)}%. <b>Tap the water</b> right next to them. About three pellets fill a fish up.`));
  const hungriest = () => two.filter((f) => live(f) && f.fed < 0.9).sort((x, y) => x.fed - y.fed)[0] || null;
  T.nag(() => { const f = hungriest(); return f ? `${T.nm(f)}'s heart is at ${pct(f.fed)}%. Tap the water right next to ${T.him(f)}.` : 'Tap the water next to the fish.'; }, { world: true });
  const fed = () => two.every((f) => !live(f) || f.fed >= 0.9);
  // react to each handful: too far away, or how full they are now
  let lastT = 0;
  const offFed = T.listen('fed', (d) => {
    const now = performance.now();
    if (now - lastT < 1800 || fed()) return;
    lastT = now;
    const near = two.filter(live).map((f) => [f, Math.hypot(f.x - d.x, f.z - d.z)]).sort((x, y) => x[1] - y[1])[0];
    if (near && near[1] > 3) { T.line(`That landed ${Math.round(near[1])} tiles from ${T.nm(near[0])}. Drop it right beside ${T.him(near[0])}.`, { mood: 'normal', target: near[0] }); return; }
    setTimeout(() => { if (fed() || T.skipping) return; const f = hungriest(); if (f) T.line(`${T.nm(a)}'s heart: ${pct(a?.fed)}%. ${T.nm(b)}'s: ${pct(b?.fed)}%. ${f.fed > 0.5 ? 'Nearly there.' : 'Keep going.'}`, { target: f }); }, 1600);
  });
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
    offFed();
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
  await openScopeStep(T, two.filter(live), `<b>Tap ${T.nm(two[0])} or ${T.nm(two[1])}</b> to look at them through the <b>Fish Scope</b>.`);
  await scopeLesson(T, (fish) => {
    const g = fish.g, n = T.nm(fish), him = T.him(fish);
    const mo = MORPHS[g.morph] || MORPHS.normal;
    const mu = g.mut ? MUTATIONS[g.mut] : null;
    return [
      // FishSystem: 1/150 per s hunger; the fed meter drains x4.7 faster once hunger > 0.7; eligibleForLove: hunger < 0.75
      { k: 'hunger', label: 'HUNGER', why: () => `${n} is ${pct(fish.hunger)}% hungry and ${T.he(fish)} just ate. A starving fish won't breed, so keep this low.` },
      // Game.nurtureFish +0.2 a pet; FishSystem: love > 0.2 -> love timer x1.5; genes.breedGenes: nurtured parents x1.6 luck
      { k: 'mood', label: 'MOOD', why: () => `${n} is ${pct(fish.love)}% happy. ${fish.love < 0.5 ? `Petting ${him} raises it` : 'Petting keeps it up'}; happy fish breed sooner.` },
      { k: 'sex', label: 'SEX', why: () => (g.sex === 'M' ? `${n} is the boy. After a date he swims over the eggs and fertilizes them.` : `${n} is the girl. After a date she lays the eggs.`) },
      // FishScope breed checklist = FishSystem.eligibleForLove: adult, fed >= 0.9, hunger < 0.75, loveT <= 0
      { k: 'breed', label: 'BREEDING', why: () => { const miss = [!fish.adult && 'grown', fish.fed < 0.9 && 'well fed', fish.hunger >= 0.75 && 'not starving', fish.loveT > 0 && 'rested'].filter(Boolean); return miss.length ? `The breeding checklist. ${n} still needs: ${miss.join(', ')}. ${miss.length === 1 && miss[0] === 'rested' ? 'That\'s fine, we breed them in a minute.' : ''}` : `The breeding checklist: ${n} is ready to breed.`; } },
      // data/species.js MORPHS values
      { k: 'morph', label: 'COLOUR', why: () => `${n} is ${mo.name === 'Wild Type' ? 'the normal Wild Type colour, x1' : `${mo.name}, x${mo.value}`}. Rare colours pay more: Albino x1.6, Golden x5.` },
      // genes.valueMult / mealMult: value and how full a bear gets scale with size
      { k: 'size', label: 'SIZE', why: () => `${n} is size ${sizeLabel(g.size)}, x${g.size.toFixed(2)}. Bigger fish are worth more and fill a bear more.` },
      // genes.pickMutation: about 1 fresh roll in 5 gets one; MUTATIONS values
      { k: 'mut', label: 'MUTATION', why: () => (mu ? `${n} has the ${mu.name} mutation: x${mu.value} on the price.` : `${n} has no mutation. About one fresh egg in five rolls one, and it multiplies the price.`) },
    ];
  }, (fish) => [
    // FishScope worth = coinValue * 7; FishSystem.coinValue = meal * value * valueMult(size x morph x mutation)
    { sel: '.fsc-worth', text: `A bear would pay ${worthOf(T.game, fish)} coins to eat ${T.nm(fish)}. That's the worth.`, mood: 'greedy' },
    { sel: '.fsc-btns', text: `Buttons down here do things to ${T.nm(fish)}. More of them turn up as we go.`, mood: 'happy' }, // [v33 bubble]
  ], { hello: (fish) => `That's ${T.nm(fish)}. Let's read ${T.him(fish)} one stat at a time.` });
  T.force(null);
}

/** [v33 tut2] Reynard talks in the Scope's own dialogue strip (.fsc-say). A waiting line moves on with a tap on it,
 * Enter / Space, or after its reading time. */
function scopeSay(T, text, { mood = 'teacher', wait = false } = {}) {
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
  const say = (text, o) => scopeSay(T, text, o); // [v33 bubble] shared with the Tag / Pet lesson
  if (hello) await T.g(say(hello(fish), { mood: 'excited', wait: true }));
  for (const st of steps(fish)) {
    if (!(await reopen())) break;
    const sel = `.fsc-call[data-k="${st.k}"]`;
    const arrow = G.marks.ui(sel, { label: 'TAP!' });
    say(`Tap ${st.label}.`, { mood: 'focused' });
    let told = false;
    const LBL = { hunger: 'HUNGER', mood: 'MOOD', sex: 'SEX', morph: 'COLOUR', size: 'SIZE', mut: 'MUTATION', age: 'AGE', breed: 'BREEDING' };
    const tapped = T.waitFor(() => {
      const s = scopeNow();
      if (!s) return true;
      const other = Object.keys(s.open || {}).find((k) => s.open[k] && k !== st.k);
      if (other && !told) { told = true; setTimeout(() => say(`That's ${LBL[other] || 'another one'}. Tap ${st.label} first.`, { mood: 'focused' }), 1200); }
      return !!s.open?.[st.k];
    });
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
  // ---- petting + tags: [v33 bubble] both are buttons in the Fish Scope now (they left the hotbar)
  game.unlockFeature('pet', { quiet: true });
  game.unlockFeature('tag', { quiet: true });
  await scopeCare(T, two);
  T.force(null);
  game.setTool({ kind: 'feed' });
  await T.cine(async (c) => {
    const f = two.find((x) => live(x) && x.love >= 0.9) || two.find(live);
    c.low(f, { zoom: 0.011, pitch: 0.44 });
    const m = c.mark(f, { label: 'HAPPY', color: 'pink' });
    // FishSystem: love > 0.2 -> loveT ticks x1.5 and fry grow x(1 + nurtureMult) = x2; genes.breedGenes: x1.6 luck
    await c.say(c.fox, `${T.nm(f)} is at ${pct(f.love)}% happy. Happy fish fall in love <b>1.5x sooner</b>, their fry grow <b>twice as fast</b>, and their babies roll rarer colours.`, { style: 'happy' });
    // FishSystem: love -= dt / 240
    await c.say(c.fox, 'Happiness fades in about <b>four minutes</b>. Petting is free, so do it often.', { style: 'say' });
    m();
    // ---- the pond's room
    const P = pondMid(game);
    c.low(P, { zoom: 0.024, pitch: 0.62, lift: 0 });
    const cap = game.fish.capacity(), pop = game.fish.population();
    c.point(P, { label: `${pop} / ${cap} FISH`, r: 2.6, color: 'blue' });
    // FishSystem.capacity: water tiles x 0.62; FishSystem.update: canBreed only while population < capacity
    await c.say(c.fox, `${pop} fish in the pond now, and room for about <b>${cap}</b>. When it's full, nobody breeds.`, { style: 'say' });
    await c.say(c.fox, 'So sell the extras to the bears, or make the pond bigger. More water, more room.', { style: 'happy' });
    c.unpoint();
  }, { id: 'tut:happy' });

  {
    // Game.tagLimit = 1 + research
    const n = game.tagLimit();
    const tf = two.find((f) => live(f) && f.tagged) || T.taggedFish;
    await T.teach(`${tf ? `${T.nm(tf)} has the tag now; no bear will eat ${T.him(tf)}. ` : ''}${n <= 1 ? 'You get <b>one tag</b> for now, so keep it on your best breeder.' : `You get <b>${n} tags</b>.`}`, { wait: true, mood: 'happy' });
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
      try {
        await T.waitFor(heldAny);
        const h = game.fish.list.find((f) => f.held);
        if (h) T.line(`You've got ${T.nm(h)}. Drop ${T.him(h)} anywhere in the water.`, { target: h });
        await T.waitFor(() => !heldAny());
        if (h && live(h)) T.line(`Dropped. That's how you move a fish, like putting a boy next to a girl.`, { target: h });
      } finally { m.forEach((s) => s()); }
    },
    fallback: async () => { T.line('You can try that one later.', { mood: 'happy' }); },
  });
  T.force(null);
  T.frame(null);
  game.setTool({ kind: 'feed' });
}

/**
 * [v33 bubble] Pet and Tag, taught on the Fish Scope's buttons: open the Scope on one of the pair, pet it to a
 * full heart (tap or hold PET), tag it DO NOT EAT, close the Scope. Every wait has a timeout + a fallback.
 */
async function scopeCare(T, two) {
  const game = T.game, G = T.guide;
  await openScopeStep(T, two.filter(live), `<b>Tap ${T.nm(two[0])} or ${T.nm(two[1])}</b> to open the <b>Fish Scope</b> again.`);
  let S = scopeNow();
  const fish = S?.fish || two.find(live);
  if (!fish) return;
  const reopen = async () => {
    S = scopeNow();
    if (!S && live(fish) && !fish.held) { S = openFishScope(game, fish); await T.wait(0.7); }
    if (S) { S.tipKey = '__tut'; if (!S.el?.querySelector('.fsc-btn[data-a="pet"]')) { try { S.refresh(); } catch { /* ignore */ } } }
    return S;
  };
  if (!(await reopen())) return;
  await T.hideTeacher();
  const say = (text, o) => scopeSay(T, text, o);
  const n = T.nm(fish);
  // ---- PET
  // Game.nurtureFish: +0.2 love a pat (0.35 s cooldown) -> five pats to a full heart
  const loved = () => !live(fish) || fish.love >= 0.99;
  T.stage = 'scope:pet';
  let arrow = G.marks.ui('.fsc-btn[data-a="pet"]', { label: 'PET' });
  try {
    if (!loved()) {
      await T.g(say(`This is <b>PET</b>. It makes ${n} happy: that's the MOOD you just read.`, { mood: 'happy', wait: true }));
      say(`Tap PET again and again (or hold it) until ${n} is 100% happy.`, { mood: 'excited' });
      let shown = -1;
      const tick = setInterval(() => {
        if (loved() || T.skipping) { clearInterval(tick); return; }
        if (!scopeNow()) { reopen(); return; }
        const p = Math.floor(fish.love * 5);
        if (p !== shown && fish.love > 0.05) { shown = p; say(`${n}: ${pct(fish.love)}% happy. Keep going!`, { mood: 'love' }); }
      }, 400);
      try {
        if (!(await T.within(T.waitFor(loved), 60))) {
          say('Like this: pat, pat, pat.', { mood: 'happy' });
          for (let i = 0; i < 8 && !loved(); i++) { const s = scopeNow(); if (s?.pat) s.pat(); else game.nurtureFish(fish); await T.wait(0.45); }
        }
      } finally { clearInterval(tick); }
      T.win();
      await T.g(say(`Full heart! ${n} will breed sooner now.`, { mood: 'love', wait: true }));
    }
  } finally { arrow.stop(); }
  // ---- TAG
  T.stage = 'scope:tag';
  if (live(fish) && !fish.tagged) {
    await reopen();
    const tagged = T.until('fishTagged');
    arrow = G.marks.ui('.fsc-btn[data-a="tag"]', { label: 'TAG' });
    try {
      await T.g(say(`This is <b>TAG</b>. A tagged fish says <b>DO NOT EAT</b>, and bears never touch it.`, { mood: 'happy', wait: true }));
      say(`Tap TAG to keep ${n} safe.`, { mood: 'excited' });
      let nagT = 0;
      const tick = setInterval(() => {
        if (T.skipping || fish.tagged) return;
        if (!scopeNow()) { reopen(); return; }
        if (++nagT % 14 === 0) say(`Tap TAG to keep ${n} safe.`, { mood: 'focused' });
      }, 600);
      try {
        if (await T.within(tagged.then((f) => { T.taggedFish = f; }), 45)) T.win();
        else { say(`I'll tag ${n} for you.`, { mood: 'happy' }); if (!fish.tagged) game.tagFish(fish); }
      } finally { clearInterval(tick); }
    } finally { arrow.stop(); }
  }
  // ---- close it
  if (scopeNow()) {
    const a = G.marks.ui('.fsc-x', { label: 'CLOSE' });
    say('Tap the X to close the Scope.', { mood: 'happy' });
    if (!(await T.within(T.waitFor(() => !scopeNow()), 20))) { try { scopeNow()?.close(); } catch { /* ignore */ } }
    a.stop();
  }
  await T.hideTeacher();
  await T.wait(0.4);
}

// ===================================================================== PART 6: EGGS & FRY
export async function loveEggs(T) {
  const game = T.game, G = T.guide, two = T.pair;
  await T.part(6, 'Eggs & Fry');
  if (two.some((f) => live(f) && f.fed < 0.9)) {
    const h = two.filter((f) => live(f) && f.fed < 0.9).map((f) => `${T.nm(f)}'s heart is at ${pct(f.fed)}%`).join(', ');
    await T.teach(`To breed, both need a <b>full heart</b>. ${h}.`, { wait: true, mood: 'happy' });
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
  const boy = two.find((f) => live(f) && f.g.sex === 'M') || two[0], girl = two.find((f) => live(f) && f.g.sex === 'F') || two[1];
  T.line(`${T.nm(boy)} and ${T.nm(girl)} are both full and rested now. Watch: they'll find each other and go on a <b>date</b>.`, { mood: 'happy' });
  if (!seen.date) await T.within(Promise.race([dateP, laidP, fertP, hatched]), 35);
  if (!seen.date && !seen.laid && !seen.fert && !seen.hatch) { T.forceDate(two); await T.within(dateP, 6); }
  if (seen.date && !seen.laid) T.line(`There's the date, the little loops. Next, ${T.nm(girl)} lays the eggs.`, { mood: 'excited' });
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
      const n = e?.count || 1;
      await c.say(c.fox, `${T.nm(girl)} laid ${n === 1 ? 'an egg' : `${n} eggs`}. Now ${T.nm(boy)} has to swim over and <b>fertilize</b> ${n === 1 ? 'it' : 'them'}.`, { style: 'excited' });
      // FishSystem: SPOIL_TIME = 90 s for a laid, unfertilized clutch
      await c.say(c.fox, `If ${T.nm(boy)} takes longer than <b>90 seconds</b>, the eggs spoil. That's why you keep a pair close.`, { style: 'say' });
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
    T.line(`${T.nm(boy)} fertilized them. Eggs <b>incubate</b> for about three minutes; today I'll hurry them.`, { mood: 'happy' });
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
      const born = game.fish.list.filter((f) => !f.adult && !f.tank && !f.dead).length;
      await c.say(c.fox, `${born === 1 ? 'One <b>fry</b>' : `${born} <b>fry</b>`}, from ${T.nm(girl)} and ${T.nm(boy)}. That makes ${T.pondCount()} fish in the pond.`, { style: 'happy' });
      // FishSystem: GROW_TIME 70 / species growth (bluegill 1.2) when hunger < 0.7; x0.35 when hungry
      const hr = Math.max(1, (game.dayLength?.() || 240) / 8); // real seconds per clock hour
      const growH = Math.max(1, Math.round((70 - (baby.age || 0)) / (baby.sp?.growth || 1) / hr));
      await c.say(c.fox, `Fed, it grows up in about <b>${growH} hour${growH > 1 ? 's' : ''}</b> on the clock. Hungry fry grow three times slower.`, { style: 'say' });
      // FishSystem.mate: the love timer resets to 240-360 s
      const restH = Math.max(1, Math.round(Math.max(girl?.loveT || 0, boy?.loveT || 0) / hr));
      await c.say(c.fox, `${T.nm(girl)} and ${T.nm(boy)} need about <b>${restH} hours</b> of rest now, less if they're happy. Then they can date again.`, { style: 'say' });
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
      { k: 'size', label: 'SIZE', why: () => `x${f.g.size.toFixed(2)}. ${mum ? `${T.nm(mum)} is x${mum.g.size.toFixed(2)}` : 'Mum'}, ${dad ? `${T.nm(dad)} x${dad.g.size.toFixed(2)}` : 'dad'}: babies land near the average, with a small nudge up. Breed your biggest.` },
      // genes.breedGenes inheritMorph: 38% per parent with a rare morph; MORPHS.chance
      // FishSystem: GROW_TIME 70 s / species growth; x0.35 when hungry
      { k: 'age', label: 'AGE', why: () => `${pct(Math.min(1, (f.age || 0) / 70))}% grown. Once grown it's worth full price.` },
      { k: 'morph', label: 'COLOUR', why: () => `${MORPHS[f.g.morph]?.name || 'Wild Type'}${f.g.morph === 'normal' ? ', like its parents' : ''}. Colours run in families: a rare-coloured parent passes it on about 4 times in 10.` },
    ], (f) => {
      const w = worthOf(game, f);
      // FishSystem.coinValue: fry x0.35
      const pw = mum ? worthOf(game, mum) : 0;
      return [{ sel: '.fsc-worth', text: `Worth ${w} now${pw ? `; ${T.nm(mum)} is worth ${pw}` : ''}. Fry pay about a third, so grown up this one is worth about ${Math.round(w / 0.35)}.`, mood: 'greedy' }];
    }, { hello: () => `The new fry. Let's see what it got from ${mum ? T.nm(mum) : 'mum'} and ${dad ? T.nm(dad) : 'dad'}.` });
  }
  // the money rule (genes.valueMult: size x morph x mutation, chonky x1.35; BearSystem.finishReview: golden -> +1 star)
  await T.teach('So <b>size</b>, <b>colour</b> and <b>mutations</b> set the price. Breed your best with your best, and the babies get better.', { wait: true, mood: 'greedy' });
  await T.teach('A bear who eats a <b>Golden</b> fish even gives an extra star.', { wait: true, mood: 'happy' });
  // BearSystem.planWave: from day 5, 15% of bears prefer a species; the wrong one can cost a star
  await T.teach('From day 5, some bears want <b>one species</b>. More species come from e-Buy and research.', { wait: true, mood: 'happy' });
}
