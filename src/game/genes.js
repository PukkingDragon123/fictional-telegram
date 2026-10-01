// Fish genetics: sex, size, colour morph, personality traits and a star
// rating that decides the egg's rarity tier (common .. legendary).
// Bought eggs roll fresh genes; bred eggs inherit from both parents with a
// little mutation, so careful breeding (and nurturing) pays off.
import { SPECIES_BY_ID, MORPHS, MORPH_IDS, TRAITS, TRAIT_IDS, RARITIES } from '../data/species.js';

const SIZE_LABELS = [[0.92, 'S'], [1.06, 'M'], [1.2, 'L'], [99, 'XL']];
export function sizeLabel(m) { for (const [t, l] of SIZE_LABELS) if (m < t) return l; return 'XL'; }

function pickMorph(mods, luck = 1) {
  let r = Math.random();
  for (const id of ['rainbow', 'golden', 'ghost', 'calico', 'albino', 'melanistic']) {
    const m = MORPHS[id];
    let c = m.chance * (mods?.morphMult || 1) * luck;
    if (id === 'golden' || id === 'rainbow') c *= mods?.goldenMult || 1;
    if (r < c) return id;
    r -= c;
  }
  return 'normal';
}

function pickTraits(mods, luck = 1, inherited = []) {
  const out = [];
  for (const t of inherited) if (!out.includes(t) && Math.random() < 0.45 * luck) out.push(t);
  const tm = mods?.traitMult || 1;
  const rolls = Math.random() < 0.35 * luck * tm ? (Math.random() < 0.25 ? 2 : 1) : 0;
  for (let i = 0; i < rolls && out.length < 2; i++) {
    const pool = TRAIT_IDS.filter((t) => !out.includes(t));
    const weights = pool.map((t) => (TRAITS[t].good ? tm : 1 / tm));
    let x = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let k = 0; k < pool.length; k++) { x -= weights[k]; if (x <= 0) { out.push(pool[k]); break; } }
  }
  return out.slice(0, 2);
}

export function starsFor(speciesId, g) {
  const sp = SPECIES_BY_ID[speciesId];
  let score = (sp?.tier || 0) * 0.8;
  score += (g.size - 1) * 5;
  score += MORPHS[g.morph]?.stars || 0;
  for (const t of g.traits) score += TRAITS[t]?.good ? 0.8 : -0.4;
  return Math.max(1, Math.min(5, Math.round(1 + score)));
}

// Fresh genes for a bought egg / wild fish
export function rollGenes(speciesId, mods, { luck = 1, sex = null } = {}) {
  const g = {
    sex: sex || (Math.random() < 0.5 ? 'M' : 'F'),
    size: +(0.86 + Math.random() * 0.26 + (Math.random() < 0.12 * luck ? 0.14 : 0)).toFixed(2),
    morph: pickMorph(mods, luck),
    traits: pickTraits(mods, luck),
  };
  g.stars = starsFor(speciesId, g);
  return g;
}

// Offspring genes from two parents (a, b are fish with .g)
export function breedGenes(speciesId, a, b, mods, { nurtured = false } = {}) {
  const ga = a.g || rollGenes(a.sp.id, mods), gb = b.g || rollGenes(b.sp.id, mods);
  const luck = nurtured ? 1.6 : 1;
  const inheritMorph = () => {
    const pm = [ga.morph, gb.morph].filter((m) => m !== 'normal');
    if (pm.length && Math.random() < 0.38 * pm.length) return pm[Math.floor(Math.random() * pm.length)];
    return pickMorph(mods, luck);
  };
  const g = {
    sex: Math.random() < 0.5 ? 'M' : 'F',
    size: +Math.max(0.8, Math.min(1.45, (ga.size + gb.size) / 2 + (Math.random() - 0.45) * 0.14 * luck)).toFixed(2),
    morph: inheritMorph(),
    traits: pickTraits(mods, luck, [...ga.traits, ...gb.traits]),
  };
  g.stars = starsFor(speciesId, g);
  return g;
}

export function rarityOf(stars) { return Math.max(0, Math.min(4, stars - 1)); }

export function valueMult(g) {
  if (!g) return 1;
  let v = g.size * (MORPHS[g.morph]?.value || 1);
  if (g.traits.includes('chonky')) v *= 1.35;
  return v;
}
export function mealMult(g) {
  if (!g) return 1;
  let v = 0.7 + g.size * 0.3;
  if (g.traits.includes('chonky')) v *= 1.35;
  return v;
}

// Everything the hatch ceremony needs to show one fish
export function hatchCard(speciesId, g, { isNewSpecies = false, isNewMorph = false, value = 0 } = {}) {
  const sp = SPECIES_BY_ID[speciesId] || SPECIES_BY_ID.bluegill;
  return {
    rarity: rarityOf(g.stars), speciesId: sp.id, speciesName: sp.name, latin: sp.latin,
    morph: { id: g.morph, name: MORPHS[g.morph]?.name || 'Wild Type' },
    sex: g.sex, size: { label: sizeLabel(g.size), mult: g.size },
    traits: g.traits.map((t) => ({ id: t, name: TRAITS[t].name, desc: TRAITS[t].desc, good: TRAITS[t].good, icon: TRAITS[t].icon })),
    stars: g.stars, isNewSpecies, isNewMorph, value,
  };
}

export { RARITIES, MORPH_IDS };
