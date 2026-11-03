// [v32 dig] THE DIG: everything you can dig up at a fossil site, the condition a
// find comes out in, and the little bits of maths that pick what is in the ground.
// Pure data (no DOM, no three.js). The art for every find is drawn in
// src/ui/dig/findArt.js (same ids). Find ids are saved: never rename one.
//
//   FINDS            [{ id, name, kind: 'fossil' | 'amber', r (rarity 0..4), era, value, fact, w, big }]
//   CONDITIONS       how a find came out of the ground (cracks while digging)
//   rollFind(site, has, rnd) -> find id         what is buried at a site
//   findValue(id, cond) -> coins                selling price at Snapp's bench
//   VIAL_RECIPE      1 amber + 3 fossils -> 1 Primordial Vial
export const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
export const RARITY_COLORS = ['#d8d2c0', '#6cc04a', '#3c8ce0', '#a050e0', '#ffb020'];

// `w` = base weight in the ground, `big` = dig art size class (0 small .. 2 huge)
export const FINDS = [
  // ---------------------------------------------------------------- fossils
  { id: 'ammonite', name: 'Ammonite', kind: 'fossil', r: 0, era: 'Jurassic · 180 million years', value: 18, w: 10, big: 0, group: 'shell',
    fact: 'A squid in a snail costume. Swam backwards. Ate its cousins. Respect.' },
  { id: 'trilobite', name: 'Trilobite', kind: 'fossil', r: 0, era: 'Cambrian · 510 million years', value: 20, w: 9, big: 0, group: 'shell',
    fact: 'First critter with proper eyes. The lenses were made of ROCK. Imagine blinking.' },
  { id: 'fern', name: 'Seed Fern Frond', kind: 'fossil', r: 0, era: 'Carboniferous · 300 million years', value: 15, w: 8, big: 1, group: 'plant',
    fact: 'Before flowers, everything was ferns. Very green. Very boring. I loved it.' },
  { id: 'sharktooth', name: 'Shark Tooth', kind: 'fossil', r: 1, era: 'Cretaceous · 90 million years', value: 45, w: 6, big: 0, group: 'bone',
    fact: 'Sharks drop thirty thousand teeth in a lifetime. This one is still annoyed about it.' },
  { id: 'crinoid', name: 'Sea Lily', kind: 'fossil', r: 1, era: 'Ordovician · 450 million years', value: 40, w: 6, big: 1, group: 'shell',
    fact: 'Looks like a flower. Is an animal. Nature has been lying to us for ages.' },
  { id: 'fishskull', name: 'Armoured Fish Skull', kind: 'fossil', r: 1, era: 'Devonian · 370 million years', value: 60, w: 5, big: 1, group: 'bone',
    fact: 'Dunkleosteus. No teeth. Self-sharpening bone blades. Bit through sharks for fun.' },
  { id: 'lobescale', name: 'Lobe-fin Scale', kind: 'fossil', r: 1, era: 'Devonian · 380 million years', value: 50, w: 5, big: 0, group: 'bone',
    fact: 'From a fish that grew little legs, walked out, looked around and went right back in.' },
  { id: 'raptorclaw', name: 'Raptor Claw', kind: 'fossil', r: 2, era: 'Cretaceous · 75 million years', value: 120, w: 3, big: 1, group: 'bone',
    fact: 'The sickle claw. For holding hands, probably. Do NOT hold hands with it.' },
  { id: 'sabrefang', name: 'Sabre-tooth Fang', kind: 'fossil', r: 2, era: 'Miocene · 6 million years', value: 140, w: 3, big: 1, group: 'bone',
    fact: 'From a SALMON. Two-metre sabre-tooth salmon. Yes, really. Look it up. I wrote the paper.' },
  { id: 'mammoth', name: 'Mammoth Molar', kind: 'fossil', r: 2, era: 'Ice Age · 20 thousand years', value: 110, w: 3, big: 2, group: 'bone',
    fact: 'A tooth the size of a loaf of bread. Chewed grass for sixty years. Never flossed.' },
  { id: 'dinoegg', name: 'Dinosaur Egg', kind: 'fossil', r: 3, era: 'Cretaceous · 70 million years', value: 320, w: 1.2, big: 2, group: 'egg',
    fact: 'It will NOT hatch. It is a rock. ...Stop putting it near the incubator.' },
  { id: 'coelacanth', name: 'Coelacanth', kind: 'fossil', r: 3, era: 'Devonian · 360 million years', value: 380, w: 1, big: 2, group: 'bone',
    fact: 'Declared extinct for 66 million years. Then a fisherman caught one. Very awkward for everyone.' },
  // ---------------------------------------------------------------- amber
  { id: 'amber', name: 'Raw Amber', kind: 'amber', r: 0, era: 'Eocene · 45 million years', value: 25, w: 8, big: 0, group: 'amber',
    fact: 'Tree sap, fossilised. Smells like a pine forest from before there were noses.' },
  { id: 'amberbug', name: 'Amber with Mosquito', kind: 'amber', r: 2, era: 'Cretaceous · 90 million years', value: 150, w: 2.4, big: 0, group: 'amber',
    fact: 'No. We are NOT doing the movie thing. ...We are doing a slightly different thing.' },
  { id: 'amberfeather', name: 'Amber with Feather', kind: 'amber', r: 3, era: 'Cretaceous · 99 million years', value: 300, w: 1, big: 1, group: 'amber',
    fact: 'A dinosaur feather. Fluffy. Terrifying. Both. The past was confusing.' },
  { id: 'heartamber', name: 'Heartstone Amber', kind: 'amber', r: 4, era: 'Unknown · very, very old', value: 800, w: 0.3, big: 1, group: 'amber',
    fact: 'Something in there is still... glowing. I do not like that. I LOVE that.' },
];
export const FIND_BY_ID = Object.fromEntries(FINDS.map((f) => [f.id, f]));
export const FIND_IDS = FINDS.map((f) => f.id);

// how it came out of the ground: 0 cracks = perfect, 3+ = in pieces
export const CONDITIONS = [
  { id: 'perfect', name: 'Perfect', mult: 1.6, stamp: 'MINT', color: '#ffd23f' },
  { id: 'good', name: 'Good', mult: 1, stamp: 'GOOD', color: '#6cc04a' },
  { id: 'chipped', name: 'Chipped', mult: 0.6, stamp: 'CHIPPED', color: '#e8943a' },
  { id: 'broken', name: 'In pieces', mult: 0.3, stamp: 'GLUED', color: '#c8382e' },
];
export const condOf = (cracks) => CONDITIONS[Math.max(0, Math.min(3, cracks | 0))];
export function findValue(id, cond = 1) {
  const F = FIND_BY_ID[id];
  if (!F) return 0;
  const C = typeof cond === 'number' ? CONDITIONS[cond] || CONDITIONS[1] : CONDITIONS.find((c) => c.id === cond) || CONDITIONS[1];
  return Math.max(1, Math.round(F.value * C.mult));
}

// the vial: one amber (any) and three cleaned fossils (any)
export const VIAL_RECIPE = { amber: 1, fossil: 3 };

/**
 * What is buried at a site. site: { bias: { findId | group: weight mult }, tier } ,
 * has(researchId) -> bool. Amber only turns up after Amber Studies; Deep Strata
 * makes rare and better finds more likely; a site's tier pushes them up too.
 */
export function rollFind(site, has = () => false, rnd = Math.random) {
  const deep = has('r_dig_deep');
  const tier = site?.tier || 0;
  const bias = site?.bias || {};
  const pool = [];
  let sum = 0;
  for (const F of FINDS) {
    if (F.kind === 'amber' && !has('r_dig_amber')) continue;
    if (F.r >= 4 && !deep) continue; // the heartstone only comes out of deep strata
    let w = F.w;
    if (F.r >= 2) w *= 1 + tier * 0.6 + (deep ? 1.1 : 0);
    if (F.r === 0) w *= Math.max(0.35, 1 - tier * 0.2);
    w *= bias[F.id] ?? bias[F.group] ?? 1;
    if (w <= 0) continue;
    pool.push([F.id, w]);
    sum += w;
  }
  let x = rnd() * sum;
  for (const [id, w] of pool) { x -= w; if (x <= 0) return id; }
  return pool.length ? pool[pool.length - 1][0] : 'ammonite';
}

// Professor Snapp sorts them like this (the collection page)
export const GROUP_NAMES = { shell: 'Shells & critters', plant: 'Plants', bone: 'Bones & teeth', egg: 'Eggs', amber: 'Amber' };
