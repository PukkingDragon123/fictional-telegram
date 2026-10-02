// Arranged breeding: pick the mum and the dad yourself, see the baby's odds
// (stars, morphs, mutations, size, traits) before the date, then book it.
// The pair is "engaged": they only date each other, cross the pond to meet
// and get the Matchmaker's blessing (extra luck) when they do.
// The board itself is src/ui/Matchmaker.js; this file is the game side.
import { breedGenes, sizeLabel, rarityOf } from './genes.js';
import { SPECIES_BY_ID, MORPHS, MUTATIONS, TRAITS, HYBRIDS } from '../data/species.js';
import { fishCanvasFor } from './fishSprites.js';

const SAMPLES = 360;

export class Matchmaking {
  constructor(game) {
    this.game = game;
    this.heartT = 0;
  }

  fishById(id) { return this.game.fish.list.find((f) => f.id === id && !f.dead) || null; }

  // why a fish can't date right now (null = ready)
  why(f) {
    if (!f.adult) return 'Still a baby';
    if (f.state === 'court' || f.dateT > 0) return 'On a date right now';
    if (f.fed < 0.9) return `Hungry: feed to 90% (${Math.round(f.fed * 100)}%)`;
    if (f.loveT > 0) return `Resting: ${Math.ceil(f.loveT)}s`;
    return null;
  }

  card(f) {
    const g = f.g;
    const mut = g.mut ? MUTATIONS[g.mut] : null;
    return {
      id: f.id,
      name: f.name || SPECIES_BY_ID[f.sp.id]?.name || 'Fish',
      speciesId: f.sp.id,
      speciesName: f.sp.name,
      sex: g.sex,
      stars: g.stars,
      rarity: rarityOf(g.stars),
      morph: { id: g.morph, name: MORPHS[g.morph]?.name || 'Wild Type' },
      mut: mut ? { id: g.mut, name: mut.name, color: mut.color } : null,
      size: { label: sizeLabel(g.size), mult: g.size },
      traits: g.traits.map((t) => ({ id: t, name: TRAITS[t]?.name || t, icon: TRAITS[t]?.icon || 'star', good: !!TRAITS[t]?.good })),
      fed: f.fed || 0,
      adult: !!f.adult,
      ready: !this.why(f),
      why: this.why(f),
      match: f.match ? f.match.id : null,
      where: f.tank ? 'Tank' : 'Pond',
      art: () => fishCanvasFor(f.sp.id, { morph: g.morph, scale: 3 }),
    };
  }

  // every grown-up fish (and the fry, greyed out) for the picker
  cards() {
    return this.game.fish.list.filter((f) => !f.dead).sort((a, b) => (b.adult - a.adult) || (b.g.stars - a.g.stars)).map((f) => this.card(f));
  }

  pairCheck(a, b) {
    if (!a || !b) return 'Pick a mum and a dad';
    if (a === b) return 'Pick two different fish';
    if (a.g.sex === b.g.sex) return 'Needs a girl and a boy';
    if (!this.game.fish.compatible(a, b)) return `${a.sp.name} and ${b.sp.name} can't have babies`;
    if (!a.adult || !b.adult) return 'They have to be grown up';
    if (a.region !== b.region) return a.tank || b.tank ? 'Put them in the same water (pond or tank)' : 'They live in different ponds';
    return null;
  }

  // Monte Carlo over the real inheritance rules (genes.js breedGenes)
  predict(mumId, dadId) {
    const game = this.game;
    const a = this.fishById(mumId), b = this.fishById(dadId);
    const bad = this.pairCheck(a, b);
    if (bad) return { ok: false, why: bad };
    const mods = game.mods;
    const hyb = a.sp.id !== b.sp.id ? HYBRIDS[`${a.sp.id}|${b.sp.id}`] : null;
    const foodLuck = ((a.luck || 0) + (b.luck || 0)) * 0.5;
    const stars = [0, 0, 0, 0, 0];
    const morphs = {}, muts = {}, traits = {};
    let smin = 9, smax = 0, ssum = 0, better = 0;
    const best = Math.max(a.g.stars, b.g.stars);
    for (let k = 0; k < SAMPLES; k++) {
      let kid = a.sp.id;
      if (a.sp.id !== b.sp.id) kid = hyb && Math.random() < 0.3 * mods.hybridMult ? hyb : Math.random() < 0.5 ? a.sp.id : b.sp.id;
      const g = breedGenes(kid, a, b, mods, { nurtured: true, luckBoost: foodLuck * 1.5 + 0.2 });
      stars[g.stars - 1]++;
      if (g.stars > best) better++;
      morphs[g.morph] = (morphs[g.morph] || 0) + 1;
      if (g.mut) muts[g.mut] = (muts[g.mut] || 0) + 1;
      for (const t of g.traits) traits[t] = (traits[t] || 0) + 1;
      smin = Math.min(smin, g.size); smax = Math.max(smax, g.size); ssum += g.size;
    }
    const P = (n) => n / SAMPLES;
    const avg = ssum / SAMPLES;
    return {
      ok: true,
      stars: stars.map(P),
      morphs: Object.entries(morphs).sort((x, y) => y[1] - x[1]).map(([id, n]) => ({ id, name: MORPHS[id]?.name || id, p: P(n) })),
      muts: Object.entries(muts).sort((x, y) => y[1] - x[1]).map(([id, n]) => ({ id, name: MUTATIONS[id]?.name || id, color: MUTATIONS[id]?.color || '#fff', p: P(n) })),
      size: { min: +smin.toFixed(2), max: +smax.toFixed(2), avg: +avg.toFixed(2), label: sizeLabel(avg) },
      traits: Object.entries(traits).sort((x, y) => y[1] - x[1]).map(([id, n]) => ({ id, name: TRAITS[id]?.name || id, icon: TRAITS[id]?.icon || 'star', good: !!TRAITS[id]?.good, p: P(n) })),
      perfect: P(stars[4]),
      better: P(better),
      hybrid: hyb ? { speciesName: SPECIES_BY_ID[hyb]?.name || hyb, p: 0.3 * mods.hybridMult } : null,
      warn: [a, b].map((f) => this.why(f)).filter(Boolean)[0] || null,
    };
  }

  arrange(mumId, dadId) {
    const game = this.game;
    const a = this.fishById(mumId), b = this.fishById(dadId);
    const bad = this.pairCheck(a, b);
    if (bad) return { ok: false, msg: bad };
    // break up any older engagements
    for (const f of [a, b]) if (f.match && f.match !== a && f.match !== b) { f.match.match = null; f.match = null; }
    for (const f of [a, b]) if (f.mate && f.mate !== a && f.mate !== b) { f.mate.mate = null; if (f.mate.state === 'court') f.mate.state = 'wander'; f.mate = null; if (f.state === 'court') f.state = 'wander'; }
    a.match = b; b.match = a;
    const fish = game.fish;
    const now = fish.eligibleForLove(a) && fish.eligibleForLove(b);
    if (now) fish.findMate(a);
    for (const f of [a, b]) game.particles.hearts(f.x, (f.y || 0) + 0.3, f.z, 4);
    game.audio.play('heart', { volume: 0.5 });
    game.emit('matchArranged', { a, b, now });
    game.save();
    return now
      ? { ok: true, msg: 'DATE BOOKED! They\'re swimming to meet ♥' }
      : { ok: true, msg: 'ENGAGED! They\'ll date as soon as both are fed & rested' };
  }

  cancel(id) {
    const f = this.fishById(id);
    if (!f?.match) return;
    f.match.match = null;
    f.match = null;
  }

  // engaged fish trail little hearts so you can spot them in the pond
  update(dt) {
    this.heartT -= dt;
    if (this.heartT > 0) return;
    this.heartT = 2.2;
    const P = this.game.particles;
    for (const f of this.game.fish.list) {
      if (!f.match || f.dead) continue;
      if (f.match.dead || f.match.match !== f) { f.match = null; continue; }
      if (f.state !== 'court' && Math.random() < 0.7) P.hearts(f.x, (f.y || 0) + 0.25, f.z, 1);
    }
  }
}
