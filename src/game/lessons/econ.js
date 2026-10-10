// [v26 tutorial] The real numbers behind the lessons. Every figure Reynard
// quotes comes from here, and every function here copies the game's own maths:
//   bill per fish  = species meal x value x valueMult(genes) x (adult 1 | fry 0.35)
//                    x 7 coins (BearSystem COIN_PER_MEAL) x bear pay x fishValueMult x payMult
//   tips           = bills x (5-star 25% | 4-star 10%) + side-dish bonuses (BearSystem 'pay')
//   stars          = genes.starsFor: 1 + tier x 0.8 + (size - 1) x 5 + morph + mutation + traits
//   mutation odds  = genes.pickMutation / breedGenes (bred eggs roll at luck x 0.6)
// If the game's formulas change, fix them here and every lesson follows.
import { SPECIES_BY_ID, MORPHS, MUTATIONS, MUTATION_IDS, TRAITS } from '../../data/species.js';
import { valueMult, starsFor, sizeLabel } from '../genes.js';

export const COIN_PER_MEAL = 7; // BearSystem.js
export const FRY_PAY = 0.35; // FishSystem.coinValue: fry are worth a third
export const TIP_4 = 0.1, TIP_5 = 0.25; // BearSystem 'pay': % of the bill on a 4 / 5-star review
export const MORPH_INHERIT = 0.38; // per parent with a colour morph (genes.breedGenes)
export const MUT_INHERIT = 0.3; // per parent with a mutation
export const TRAIT_INHERIT = 0.45; // per parent trait
export const BRED_MUT_LUCK = 0.6; // a bred egg's fresh mutation roll
export const NURTURE_LUCK = 1.6; // petted (love > 0.2) or matchmade parents

const M = (game) => game?.mods || {};
export const plain = (size = 1) => ({ sex: 'M', size, morph: 'normal', traits: [], mut: null });

/** Coins one bear pays for eating a fish with genes g (no tips). */
export function priceOf(game, spId, g, { adult = true, pay = 1 } = {}) {
  const sp = SPECIES_BY_ID[spId];
  if (!sp) return 0;
  const m = M(game);
  return Math.round(sp.meal * sp.value * valueMult(g) * (adult ? 1 : FRY_PAY) * COIN_PER_MEAL * pay * (m.fishValueMult || 1) * (m.payMult || 1));
}
export const fishPrice = (game, f, o = {}) => (f ? priceOf(game, f.sp.id, f.g, { adult: f.adult !== false, ...o }) : 0);

/** The star sum, part by part (same order as genes.starsFor). */
export function starParts(spId, g) {
  const sp = SPECIES_BY_ID[spId];
  const parts = [{ k: 'base', label: 'base', v: 1 }];
  if (sp?.tier) parts.push({ k: 'tier', label: `${sp.name} tier`, v: sp.tier * 0.8 });
  if (Math.abs(g.size - 1) > 0.005) parts.push({ k: 'size', label: `size ${g.size.toFixed(2)}`, v: (g.size - 1) * 5 });
  if (MORPHS[g.morph]?.stars) parts.push({ k: 'morph', label: MORPHS[g.morph].name, v: MORPHS[g.morph].stars });
  if (g.mut && MUTATIONS[g.mut]?.stars) parts.push({ k: 'mut', label: MUTATIONS[g.mut].name, v: MUTATIONS[g.mut].stars });
  for (const t of g.traits || []) parts.push({ k: 'trait', label: TRAITS[t]?.name || t, v: TRAITS[t]?.good ? 0.8 : -0.4 });
  return { parts, stars: starsFor(spId, g) };
}

/** Odds that a BRED egg comes out with some mutation (and with a good one, i.e. not Tiny). */
export function mutationOdds(game, { nurtured = false, arranged = false, food = 0, parentMut = 0 } = {}) {
  const mm = M(game).mutationMult || 1;
  const luckBoost = (arranged ? 0.2 : 0) + food * 1.5;
  const luck = ((nurtured || arranged) ? NURTURE_LUCK : 1) * (1 + luckBoost * 1.5) * BRED_MUT_LUCK;
  let any = 0, good = 0;
  for (const id of MUTATION_IDS) { const c = MUTATIONS[id].chance * mm * luck; any += c; if (id !== 'tiny') good += c; }
  any = Math.min(1, any); good = Math.min(any, good);
  const inh = 1 - (1 - MUT_INHERIT) ** parentMut; // a mutated parent passes it on 30% of the time
  return { any: inh + (1 - inh) * any, good: inh + (1 - inh) * good, luck };
}

/** Odds of a fresh egg rolling a rare colour (any) / Golden-or-Prismatic. */
export function morphOdds(game, luck = 1) {
  const m = M(game);
  let any = 0, gold = 0;
  for (const id of ['rainbow', 'golden', 'ghost', 'calico', 'albino', 'melanistic']) {
    let c = MORPHS[id].chance * (m.morphMult || 1) * luck;
    if (id === 'golden' || id === 'rainbow') c *= m.goldenMult || 1;
    any += c;
    if (id === 'golden') gold += c;
  }
  return { any: Math.min(1, any), gold: Math.min(1, gold) };
}

/** Chance of a Golden baby from two parents (a Punnett-style cell). */
export function goldenBaby(game, mumGold, dadGold) {
  const n = (mumGold ? 1 : 0) + (dadGold ? 1 : 0);
  const inherit = Math.min(1, MORPH_INHERIT * n);
  return inherit + (1 - inherit) * morphOdds(game).gold;
}

export const pct = (p) => (p >= 0.995 ? '100%' : p < 0.01 ? `${Math.max(0.1, Math.round(p * 1000) / 10)}%` : `${Math.round(p * 100)}%`);
export { sizeLabel };

// ------------------------------------------------------------------ the player's own pond
export const liveFish = (game) => (game.fish?.list || []).filter((f) => !f.dead && f.g && f.sp);
export function bestFish(game, filter = null) {
  let best = null, bv = -1;
  for (const f of liveFish(game)) {
    if (filter && !filter(f)) continue;
    const v = fishPrice(game, f) + f.g.stars * 0.01;
    if (v > bv) { bv = v; best = f; }
  }
  return best;
}
export function worstFish(game, filter = null) {
  let w = null, wv = Infinity;
  for (const f of liveFish(game)) {
    if (filter && !filter(f)) continue;
    const v = fishPrice(game, f);
    if (v < wv) { wv = v; w = f; }
  }
  return w;
}
/** "Yellow Perch, 3 stars, size L 1.18" */
export function fishLabel(f) {
  if (!f) return 'a fish';
  const morph = f.g.morph !== 'normal' ? `${MORPHS[f.g.morph]?.name} ` : '';
  const mut = f.g.mut ? `${MUTATIONS[f.g.mut]?.name} ` : '';
  return `${mut}${morph}${f.sp.name}`;
}
export const stars = (n) => `${n} star${n === 1 ? '' : 's'}`;
export { SPECIES_BY_ID, MORPHS, MUTATIONS, TRAITS };
