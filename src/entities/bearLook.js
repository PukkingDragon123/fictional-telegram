// Procedural bear looks (v18). Every bear customer gets a seeded look layered
// on top of its TYPE (src/data/bears.js): fur colour + fur pattern, a face
// (muzzle, nose, eye patches, brows, blush, freckles, scars, eye colour,
// moustache / beard) and a few accessories (hats, glasses, earrings, chains,
// badges, ...). The type keeps its identity (suit, props, its own hat) and can
// bias everything through `lookPool`; per-type colour ways live in `variants`.
//
//   import { makeBearLook, lookDef, describeLook } from './bearLook.js';
//   const look = makeBearLook('office', BEAR_TYPES.office, seed);   // plain JSON, save it (b.look)
//   const def = lookDef(BEAR_TYPES.office, look);                    // derived def -> new BearRig(typeId, def)
//
// The look is plain data (numbers / strings / arrays), so it can be saved and
// re-applied later: the same look always builds the same bear. The rig reads
// `def.look` (bearRig.js: lookOf / applyLook*) for patterns, face voxels and
// accessories; the classic fields (fur, furLight, hat, glasses, tie...) are
// written straight into the derived def so all the old outfit code just works.
import { mulberry32 } from '../core/rng.js';

export const LOOK_VERSION = 1;

// ---------------------------------------------------------------- colour helpers
const mixC = (a, b, t) => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
};
const shadeC = (c, k) => {
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
};
export const lumC = (c) => (((c >> 16) & 255) * 0.299 + ((c >> 8) & 255) * 0.587 + (c & 255) * 0.114) / 255;

// ---------------------------------------------------------------- fur
// fur = main coat, light = muzzle / tufts. pattern forces a fur pattern (panda, sun bear).
export const FUR_COLORS = {
  brown: { name: 'Brown', fur: 0x7a4a2a, light: 0xc0925e, w: 10 },
  chocolate: { name: 'Chocolate', fur: 0x55321e, light: 0xa87a52, w: 6 },
  cinnamon: { name: 'Cinnamon', fur: 0xa4632e, light: 0xdcaa72, w: 6 },
  honey: { name: 'Honey', fur: 0xbc8240, light: 0xf0cc90, w: 4 },
  blonde: { name: 'Blonde', fur: 0xd2aa6a, light: 0xf6e4bc, w: 2.5 },
  black: { name: 'Black', fur: 0x2c2622, light: 0xa88a66, w: 6 },
  grizzly: { name: 'Grizzly', fur: 0x6a4a30, light: 0xb08a60, grizzle: 0xd8c0a0, w: 5 },
  silvertip: { name: 'Silvertip', fur: 0x54483e, light: 0xc0b0a0, grizzle: 0xeee6d8, w: 2 },
  rusty: { name: 'Rusty', fur: 0x9a4a24, light: 0xe8c8a8, w: 2 },
  polar: { name: 'Polar', fur: 0xeeeee6, light: 0xffffff, w: 2 },
  panda: { name: 'Panda', fur: 0xf2eee6, light: 0xfffaf2, pattern: 'panda', w: 1.4 },
  sun: { name: 'Sun Bear', fur: 0x2a2420, light: 0xd8a060, pattern: 'collar', patternColor: 0xf0c060, w: 1.4 },
  glacier: { name: 'Glacier', fur: 0x6c7684, light: 0xc4ccd6, w: 1 },
  silver: { name: 'Silver', fur: 0x8a8078, light: 0xdcd4cc, w: 0.8 },
  pastel: { name: 'Cotton Candy', fur: 0xe0a0bc, light: 0xfbe0ea, w: 0.25 },
  lilac: { name: 'Midnight Lilac', fur: 0x4a3a5a, light: 0xb0a0c0, w: 0.25 },
};

// fur patterns: tone 'light' | 'dark' | 'any' | 'dye' picks the patch colour relative to the fur
export const FUR_PATTERNS = {
  none: { name: 'Plain', w: 8 },
  socks: { name: 'Socks', w: 4, tone: 'any' },
  blaze: { name: 'Blaze', w: 3, tone: 'light' },
  patches: { name: 'Patches', w: 3, tone: 'any' },
  twoTone: { name: 'Two-tone', w: 2.5, tone: 'dark' },
  earTips: { name: 'Dark ears', w: 2, tone: 'dark' },
  collar: { name: 'Moon collar', w: 2, tone: 'light' },
  stripes: { name: 'Stripes', w: 1.5, tone: 'dark' },
  spots: { name: 'Spots', w: 1.5, tone: 'any' },
  tips: { name: 'Frosted tips', w: 1.5, tone: 'dye' },
  panda: { name: 'Panda', w: 0 },
};

const DYES = [0x8a4ad8, 0x3ac8d8, 0xf060a8, 0x4ad070, 0xf0a020, 0xe83a3a];

// ---------------------------------------------------------------- accessories
const COLS = {
  red: 0xd83a32, navy: 0x2a3a6a, mustard: 0xd8a032, teal: 0x2aa8a0, pink: 0xf07aa8, forest: 0x2e6a3a,
  orange: 0xf07a20, purple: 0x7a3ab8, white: 0xf2f2ee, black: 0x1e1e24, grey: 0x7a7a84, sky: 0x5ab0e8,
  cream: 0xeadcb8, maroon: 0x7a1e2e, lime: 0x9ad040, tan: 0xc8a070,
};
const METALS = { gold: 0xe8c040, silver: 0xd0d4dc, rose: 0xe8a088 };
const BRIGHT = ['red', 'navy', 'mustard', 'teal', 'pink', 'forest', 'orange', 'purple', 'sky', 'lime'];
const DARKS = ['black', 'navy', 'maroon', 'forest', 'grey'];
const ALL = Object.keys(COLS);

// slot: only one accessory per slot. cols: colour pool names (or 'metal'). w: default weight.
export const ACCESSORIES = {
  // hats (only when the type has no hat of its own)
  cap: { slot: 'hat', name: 'Ball cap', w: 3, cols: BRIGHT },
  backcap: { slot: 'hat', name: 'Backwards cap', w: 1.6, cols: BRIGHT },
  beanie: { slot: 'hat', name: 'Beanie', w: 2.4, cols: ALL },
  bucket: { slot: 'hat', name: 'Bucket hat', w: 1.6, cols: ['tan', 'cream', 'forest', 'sky', 'pink', 'mustard'] },
  visor: { slot: 'hat', name: 'Visor', w: 1.2, cols: ['white', 'sky', 'pink', 'lime', 'navy'] },
  cowboy: { slot: 'hat', name: 'Cowboy hat', w: 0.8, cols: ['tan', 'black', 'cream', 'maroon'] },
  flatcap: { slot: 'hat', name: 'Flat cap', w: 0.9, cols: ['grey', 'tan', 'forest', 'navy'] },
  party: { slot: 'hat', name: 'Party hat', w: 0.6, cols: BRIGHT },
  flowers: { slot: 'hat', name: 'Flower crown', w: 0.9, cols: ['pink', 'white', 'mustard', 'sky'] },
  headphones: { slot: 'hat', name: 'Headphones', w: 1.2, cols: ['black', 'white', 'red', 'teal', 'pink'] },
  bandana: { slot: 'hat', name: 'Head bandana', w: 0.9, cols: ['red', 'navy', 'black', 'forest'] },
  beret: { slot: 'hat', name: 'Beret', w: 0.5, cols: ['black', 'maroon', 'navy', 'red'] },
  fedora: { slot: 'hat', name: 'Fedora', w: 0.5, cols: ['grey', 'tan', 'black'] },
  crown: { slot: 'hat', name: 'Tiny crown', w: 0.12, cols: ['metal'] },
  // eyes
  glasses: { slot: 'eyes', name: 'Glasses', w: 3, cols: ['black', 'maroon', 'navy', 'tan', 'grey'] },
  shades: { slot: 'eyes', name: 'Sunglasses', w: 2.2, cols: ['black', 'navy', 'maroon'] },
  halfmoon: { slot: 'eyes', name: 'Reading glasses', w: 0.6, cols: ['metal'] },
  monocle: { slot: 'eyes', name: 'Monocle', w: 0.35, cols: ['metal'] },
  eyepatch: { slot: 'eyes', name: 'Eye patch', w: 0.15, cols: ['black'] },
  // neck (only when the type has nothing at the neck)
  tie: { slot: 'neck', name: 'Tie', w: 0, cols: BRIGHT },
  bowtie: { slot: 'neck', name: 'Bow tie', w: 0.8, cols: ['red', 'navy', 'black', 'purple', 'pink', 'teal'] },
  scarf: { slot: 'neck', name: 'Scarf', w: 1.6, cols: ALL },
  kerchief: { slot: 'neck', name: 'Neckerchief', w: 1.4, cols: ['red', 'navy', 'mustard', 'teal', 'black'] },
  chain: { slot: 'neck', name: 'Gold chain', w: 1.1, cols: ['metal'] },
  pearls: { slot: 'neck', name: 'Pearls', w: 0.6, cols: ['white'] },
  medal: { slot: 'neck', name: 'Medal', w: 0.4, cols: ['red', 'navy', 'teal'] },
  neckphones: { slot: 'neck', name: 'Neck headphones', w: 0.8, cols: ['black', 'white', 'red', 'teal'] },
  // ears / nose / mouth
  earring: { slot: 'ears', name: 'Hoop earring', w: 1.6, cols: ['metal'] },
  studs: { slot: 'ears', name: 'Ear studs', w: 1.2, cols: ['metal', 'sky', 'pink'] },
  earbow: { slot: 'ears', name: 'Ear bow', w: 0.8, cols: ['pink', 'red', 'sky', 'mustard', 'purple'] },
  nosering: { slot: 'nose', name: 'Nose ring', w: 0.5, cols: ['metal'] },
  toothpick: { slot: 'mouth', name: 'Toothpick', w: 0.5, cols: ['tan'] },
  wheat: { slot: 'mouth', name: 'Grass stem', w: 0.3, cols: ['mustard'] },
  lollipop: { slot: 'mouth', name: 'Lollipop', w: 0.3, cols: ['pink', 'red', 'sky', 'lime'] },
  // chest / wrist
  badge: { slot: 'chest', name: 'Name tag', w: 1.6, cols: ['red', 'navy', 'teal', 'orange'] },
  pin: { slot: 'chest', name: 'Button pin', w: 1.4, cols: BRIGHT },
  flower: { slot: 'chest', name: 'Boutonniere', w: 0.8, cols: ['red', 'white', 'pink', 'mustard'] },
  star: { slot: 'chest', name: 'Sheriff star', w: 0, cols: ['metal'] },
  watch: { slot: 'wristL', name: 'Wristwatch', w: 1.6, cols: ['metal', 'black', 'tan'] },
  wristband: { slot: 'wristR', name: 'Sweatband', w: 0.9, cols: BRIGHT },
};

// accessories that only make sense on some outfits (collar for a tie, etc.)
const NEEDS_COLLAR = new Set(['tie', 'bowtie']);
const COLLAR_OUTFITS = new Set(['jacket', 'tux', 'shirt', 'threepiece', 'western', 'chef', 'argyle', 'cardigan', 'trench']);

// Classic outfit derivation (shared with bearRig.lookOf so accessories never change the outfit).
export function outfitOf(d) {
  return d.outfit || (d.straps ? 'coveralls' : d.vest ? 'hivis' : d.flannel ? 'flannel' : d.hawaiian ? 'hawaiian'
    : d.suit === d.shirt ? (d.tie ? 'shirt' : 'tshirt') : d.monocle ? 'tux' : 'jacket');
}

// which slots the TYPE itself already fills (its identity wins)
function typeSlots(d) {
  const s = new Set();
  if (d.hat) s.add('hat');
  if (d.glasses || d.shades || d.monocle || d.halfmoon) s.add('eyes');
  const o = outfitOf(d);
  if (d.tie || d.bowtie || d.scarf || d.lanyard || d.pearls || d.earpiece || o === 'trench' || o === 'fur' || o === 'spacesuit' || o === 'pirate' || d.kerchief) s.add('neck');
  if (d.cigar || d.mouthItem) s.add('mouth');
  if (d.armband || o === 'hivis' || o === 'coveralls' || d.lanyard || o === 'spacesuit' || d.badge) s.add('chest');
  if (d.earpiece) s.add('ears');
  return s;
}

// ---------------------------------------------------------------- face pools
const IRIS = { brown: 0x6a3a1a, amber: 0xd08a1a, green: 0x3a9a4a, blue: 0x3a7ad0, grey: 0x8a98a8, hazel: 0x9a7a2a, violet: 0x9a5ad8, red: 0xd02a4a };
const NOSES = { black: 0x24160f, brown: 0x5a3420, pink: 0xe07a8a, liver: 0x7a3a30 };

// weighted pick from { key: w } (w <= 0 skipped)
function wpick(r, table) {
  let tot = 0;
  for (const k in table) if (table[k] > 0) tot += table[k];
  if (tot <= 0) return null;
  let x = r() * tot;
  for (const k in table) { if (table[k] <= 0) continue; x -= table[k]; if (x <= 0) return k; }
  for (const k in table) if (table[k] > 0) return k;
  return null;
}
const pickArr = (r, a) => a[Math.floor(r() * a.length) % a.length];
const colorOf = (r, cols) => {
  const k = pickArr(r, cols);
  if (k === 'metal') return METALS[pickArr(r, ['gold', 'gold', 'silver', 'rose'])];
  return COLS[k] ?? 0x888888;
};

// pool table: default weights, overridden per key by the type's pool (furOnly / accOnly: only the listed keys)
function merged(defaults, over, only = false) {
  const out = {};
  if (only && over) { for (const k in over) out[k] = over[k]; return out; }
  for (const k in defaults) out[k] = defaults[k].w ?? defaults[k];
  if (over) for (const k in over) out[k] = over[k]; // the type's pool overrides the default weight
  return out;
}

/**
 * Seeded look for one bear of a type. Plain JSON, safe to save.
 * @param {string} typeId
 * @param {object} def BEAR_TYPES entry
 * @param {number} seed any integer
 */
export function makeBearLook(typeId, def, seed) {
  seed = (seed >>> 0) || 1;
  const r = mulberry32(seed ^ 0x9e3779b9);
  const P = def.lookPool || {};
  const boss = !!(def.boss && def.hp) || !!def.bloodmoon || !!def.noLook; // bosses + blood-moon bears keep their own look
  const cub = (def.scale || 1) < 0.7;
  const look = { seed, v: LOOK_VERSION, type: typeId, variant: null, fur: null, furPattern: { kind: 'none' }, face: {}, accessories: [] };

  // variant (colour way)
  if (def.variants?.length && !boss) {
    const t = { classic: def.classicW ?? 1.6 };
    for (const v of def.variants) t[v.id] = v.w ?? 1;
    const vid = wpick(r, t);
    look.variant = vid === 'classic' ? null : vid;
  }
  const vdef = look.variant ? { ...def, ...def.variants.find((x) => x.id === look.variant) } : def;

  // fur
  if (boss) {
    look.fur = { id: 'type', name: 'Classic', fur: def.fur, light: def.furLight };
    look.face = { muzzle: 'round' };
    return look;
  }
  const furT = merged(FUR_COLORS, P.fur, !!P.furOnly);
  furT.type = P.typeFurW ?? 2.5; // the type's own classic fur
  const fid = wpick(r, furT) || 'type';
  const F = fid === 'type' ? { name: 'Classic', fur: def.fur, light: def.furLight, grizzle: def.grizzle } : FUR_COLORS[fid];
  // a little per-bear drift so two "brown" bears are never identical
  const drift = 0.92 + r() * 0.16;
  const fur = lumC(F.fur) > 0.8 ? F.fur : shadeC(F.fur, drift);
  look.fur = { id: fid, name: F.name, fur, light: F.light };
  if (F.grizzle != null) look.fur.grizzle = F.grizzle;
  const white = lumC(fur) > 0.8, dark = lumC(fur) < 0.2;

  // fur pattern
  let pk = F.pattern || wpick(r, merged(FUR_PATTERNS, P.pattern));
  if (pk === 'panda' && !F.pattern) pk = 'none';
  if (pk && pk !== 'none') {
    const tone = FUR_PATTERNS[pk]?.tone || 'any';
    let pc;
    if (F.patternColor != null) pc = F.patternColor;
    else if (pk === 'panda') pc = 0x2a2628;
    else if (tone === 'dye' && (P.dye || r() < 0.35)) pc = pickArr(r, DYES);
    else {
      const wantLight = tone === 'light' || tone === 'dye' ? true : tone === 'dark' ? false : r() < 0.5;
      if (white) pc = wantLight ? 0xfffaf0 : pickArr(r, [0x2a2628, 0x8a7a6a, 0xc8b8a0]);
      else if (wantLight) pc = mixC(F.light, 0xfff8ec, 0.25 + r() * 0.3);
      else pc = dark ? mixC(fur, F.light, 0.38) : shadeC(fur, 0.5 + r() * 0.12);
      if (!wantLight && dark) pc = shadeC(fur, 0.55); // dark-on-black: still readable as a sheen
    }
    look.furPattern = { kind: pk, color: pc, scale: 0.85 + r() * 0.4 };
  }

  // face
  const fp = P.face || {};
  const face = (look.face = {});
  face.muzzle = wpick(r, { round: 6, wide: 2, jowly: cub ? 0 : 1.2, fluffy: 1.5, ...(fp.muzzle || {}) });
  const mt = wpick(r, { light: 6, cream: 2, match: 1.4, dark: white ? 0 : 1 });
  face.muzzleColor = mt === 'cream' ? mixC(F.light, 0xfff4e0, 0.55) : mt === 'match' ? mixC(fur, F.light, 0.35) : mt === 'dark' ? mixC(fur, 0x1a1210, 0.25) : F.light;
  const nk = wpick(r, { black: 8, brown: 2, pink: white ? 3 : 0.8, liver: 1 });
  face.nose = NOSES[nk];
  face.noseShape = wpick(r, { button: 6, big: 2, round: 1.5 });
  const ep = pk === 'panda' ? 'panda' : wpick(r, { none: 10, both: 1.2, left: 1, right: 1, mask: 0.6, ...(fp.eyePatch || {}) });
  if (ep !== 'none') {
    face.eyePatch = ep;
    face.patchColor = ep === 'panda' ? 0x2a2628 : white ? pickArr(r, [0x3a3236, 0x9a8a7a]) : dark ? mixC(fur, F.light, 0.55) : r() < 0.6 ? shadeC(fur, 0.45) : mixC(F.light, 0xffffff, 0.3);
  }
  const bk = wpick(r, { none: 7, thin: 2, bushy: cub ? 0 : 1.4, angry: 0.8, worried: 0.8, uni: cub ? 0 : 0.3, ...(fp.brows || {}) });
  if (bk !== 'none') {
    face.brows = bk;
    face.browColor = def.old || P.old ? 0xe8e4dc : white ? 0x8a8478 : dark ? mixC(F.light, 0xffffff, 0.2) : shadeC(fur, 0.42);
  }
  if (r() < (cub ? 0.55 : (fp.blush ?? 0.18))) face.blush = 1;
  if (r() < (cub ? 0.3 : (fp.freckles ?? 0.12))) { face.freckles = 1; face.freckleColor = white ? 0xc8a890 : shadeC(fur, 0.62); }
  if (!cub && r() < (fp.scar ?? 0.07)) face.scar = wpick(r, { eye: 2, ear: 2, nose: 1.2 });
  const ik = wpick(r, { none: 12, brown: 2, amber: 1.4, green: 1.2, blue: 1.2, grey: 0.6, hazel: 0.8, violet: 0.25, red: 0.1, ...(fp.iris || {}) });
  if (ik !== 'none') {
    face.iris = IRIS[ik];
    if (r() < 0.06) face.iris2 = IRIS[pickArr(r, Object.keys(IRIS).filter((k) => k !== ik))]; // heterochromia
  }
  if (!cub && !def.beard) {
    const sk = wpick(r, { none: 14, walrus: 1, curly: 0.8, pencil: 0.7, ...(fp.stache || {}) });
    if (sk !== 'none') face.stache = sk;
    if (r() < (fp.beard ?? 0.05)) face.beard = 1;
    if (face.stache || face.beard) face.hairColor = def.old || P.old ? 0xe8e4dc : white ? 0xd8d4cc : dark ? shadeC(F.light, 0.8) : r() < 0.5 ? shadeC(fur, 0.6) : mixC(fur, F.light, 0.5);
  }

  // accessories
  const taken = typeSlots(vdef);
  if (P.block) for (const s of P.block) taken.add(s);
  const outfit = outfitOf(vdef);
  const accT = merged(ACCESSORIES, P.acc, !!P.accOnly);
  const [n0, n1] = P.accN || (cub ? [0, 2] : [0, 3]);
  const nW = [];
  for (let n = n0; n <= n1; n++) nW.push(n === 0 ? 1.4 : n === 1 ? 3 : n === 2 ? 2.4 : 0.9);
  let n = n0 + Number(wpick(r, Object.fromEntries(nW.map((w, i) => [i, w]))) || 0);
  for (let guard = 0; n > 0 && guard < 30; guard++) {
    const k = wpick(r, accT);
    if (!k) break;
    const A = ACCESSORIES[k];
    accT[k] = 0;
    if (!A || taken.has(A.slot)) continue;
    if (NEEDS_COLLAR.has(k) && !COLLAR_OUTFITS.has(outfit)) continue;
    if (cub && (k === 'chain' || k === 'nosering' || k === 'toothpick' || k === 'monocle')) continue;
    taken.add(A.slot);
    const a = { kind: k, color: colorOf(r, (P.accCols && P.accCols[k]) || A.cols) };
    if (k === 'cowboy' || k === 'bucket' || k === 'party' || k === 'flowers' || k === 'headphones' || k === 'kerchief' || k === 'medal' || k === 'cap' || k === 'backcap' || k === 'badge') a.color2 = colorOf(r, ALL.filter((c) => COLS[c] !== a.color));
    if (k === 'earring' || k === 'studs' || k === 'earbow') a.side = wpick(r, { both: 2, L: 1, R: 1 });
    look.accessories.push(a);
    n--;
  }
  return look;
}

/**
 * The def a BearRig is built from: the type + its variant + the look's fur / accessories.
 * Keeps every gameplay field of the type (boss, hp, scale, appetite...).
 */
export function lookDef(def, look) {
  if (!look) return def;
  const v = look.variant && def.variants ? def.variants.find((x) => x.id === look.variant) : null;
  const out = { ...def, ...(v || {}) };
  delete out.id; delete out.w; // variant bookkeeping, not look fields
  if (v) { out.variantName = v.name; out.name = def.name; }
  out.outfit = outfitOf(out); // freeze the outfit before accessories add ties / monocles
  out.look = look;
  if (look.fur && look.fur.id !== 'type') {
    out.fur = look.fur.fur;
    out.furLight = look.face?.muzzleColor ?? look.fur.light;
    out.grizzle = look.fur.grizzle;
  } else if (look.fur && look.face?.muzzleColor != null) out.furLight = look.face.muzzleColor;
  if (look.face?.beard && !out.beard) out.beard = look.face.hairColor;
  for (const a of look.accessories || []) {
    const A = ACCESSORIES[a.kind];
    if (!A) continue;
    if (A.slot === 'hat') { if (!out.hat) { out.hat = a.kind; out.hatColor = a.color; out.hatColor2 = a.color2; } }
    else if (a.kind === 'glasses') out.glasses = a.color;
    else if (a.kind === 'shades') out.shades = a.color;
    else if (a.kind === 'halfmoon') out.halfmoon = a.color;
    else if (a.kind === 'monocle') out.monocleAcc = a.color;
    else if (a.kind === 'tie') out.tie = a.color;
    else if (a.kind === 'bowtie') out.bowtie = a.color;
    else if (a.kind === 'scarf') out.scarf = a.color;
  }
  return out;
}

// "Cinnamon fur with socks; gold hoop earring, sunglasses"
export function describeLook(look) {
  if (!look) return '';
  const bits = [];
  const f = look.fur?.name || '';
  const p = look.furPattern?.kind && look.furPattern.kind !== 'none' ? FUR_PATTERNS[look.furPattern.kind]?.name : '';
  bits.push(`${f}${p ? ' · ' + p : ''}`);
  const acc = (look.accessories || []).map((a) => ACCESSORIES[a.kind]?.name).filter(Boolean);
  if (acc.length) bits.push(acc.join(', '));
  return bits.join(' — ');
}

// Speech line for a bear: sometimes its type's own line, otherwise the shared pool.
export function bearLine(def, key, shared, rnd = Math.random) {
  const own = def?.lines?.[key];
  const pool = own && own.length && rnd() < 0.5 ? own : shared?.[key] || own || [''];
  return pool[Math.floor(rnd() * pool.length) % pool.length];
}

// Stable key of a look (geometry cache key in bearRig).
export function lookKey(look) {
  if (!look) return '';
  return JSON.stringify([look.v, look.variant, look.fur, look.furPattern, look.face, look.accessories]);
}
