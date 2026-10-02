// Encyclopedia data: every creature, plant, food, villager and trophy the big
// book (src/ui/Encyclopedia.js) shows, built fresh from the game state each
// time the book opens. Building is cheap: no art is drawn until a page asks.
//
//   buildEncyclopedia(game, { seen }) -> { chapters, known, total }
//     chapter = { id, name, icon, color, cloth, blurb, perPage, entries, known, total }
//     entry   = { id, name, sub, desc, known, isNew, art(scale) -> canvas | data URL,
//                 silhouette, rarity: { name, color, tier }, stats: [{ icon, label, value, color }],
//                 variants: [{ id, name, known, isNew, art }], hint, how, note, plate,
//                 recipe?: [{ id, name, known, art }, { ... }], perks?: [{ icon, title }],
//                 hearts?, done?, reward? }
//   commitDexSeen(game, book)  remembers what is known now (state.dexSeen) so the
//                              next opening can ribbon the NEW entries, plus a
//                              small log of sightings the game doesn't keep
//                              itself (state.dexLog: mutations, livestock, builds).
//   encArt                     the tiny pixel kit (shared with Encyclopedia.js).
//
// Missing pieces (art or data still being built) degrade to sketches and
// silhouettes instead of breaking the book.
import { SPECIES, MORPHS, MORPH_IDS, MUTATIONS, MUTATION_IDS, RARITIES } from '../data/species.js';
import { WILD_BIRDS, BIRD_BOUNTY } from '../data/birds.js';
import { BUGS, BUG_FARMS, EFFECTS, BUG_RARITY, WILD_DAY, WILD_NIGHT } from '../data/bugs.js';
import { BREEDS, KIND_INFO } from '../data/livestock.js';
import { STRUCTURES } from '../data/structures.js';
import { ZONES } from '../data/zones.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { RESEARCH_BY_ID } from '../data/research.js';
import { fishCanvasFor } from '../game/fishSprites.js';
import { natureCanvas, NATURE_NAMES } from '../art/natureArt.js';
import { hasSprite, spriteCanvas, foxPortraitURL } from './sprites.js';

// optional modules: newer data / art that may not exist (yet)
const OPT = import.meta.glob(['../data/landAnimals.js', '../data/crops.js', '../data/foods.js', './bagArt.js', './VillagerCard.js', '../entities/critters3d.js'], { eager: true });
const LAND = OPT['../data/landAnimals.js'] || {};
const CROPD = OPT['../data/crops.js'] || {};
const FOODD = OPT['../data/foods.js'] || {};
const BAGS = OPT['./bagArt.js'] || {};
const VCARD = OPT['./VillagerCard.js'] || {};
const C3 = OPT['../entities/critters3d.js'] || {};

const LAND_ANIMALS = LAND.LAND_ANIMALS || [];
const TAME_BUNNIES = LAND.TAME_BUNNIES || [];
const LAND_BOUNTY = LAND.LAND_BOUNTY || [6, 12, 30, 70];
const CROPS = CROPD.CROPS || {};
const STAGE_NAMES = CROPD.STAGE_NAMES || { seed: 'Seed', sprout: 'Sprout', growing: 'Growing', ripe: 'Ripe' };
const CROP_STAGES = CROPD.CROP_STAGES || ['seed', 'sprout', 'growing', 'ripe'];
const FOOD_ITEMS = FOODD.FOOD_ITEMS || {};

// ===========================================================================
// tiny pixel kit
// ===========================================================================
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function hexc(h) {
  let s = String(h).replace('#', '');
  if (s.length <= 4) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round);
export function hash(x, y = 0, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function strHash(str) { let h = 7; for (const c of String(str)) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0; return Math.abs(h); }
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
// dithered pick from a ramp: v in [0, n)
export const dq = (v, x, y, n) => clamp(Math.floor(v + bayer(x, y) - 0.5 + 0.5), 0, n - 1);

export function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  return c;
}
const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });

// RGBA texel buffer
export class Pix {
  constructor(w, h) { this.w = w | 0; this.h = h | 0; this.d = new Uint8ClampedArray(this.w * this.h * 4); }
  i(x, y) { x = Math.round(x); y = Math.round(y); return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : (y * this.w + x) * 4; }
  set(x, y, c, a = 255) { const i = this.i(x, y); if (i < 0 || !c) return this; const d = this.d; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a; return this; }
  a(x, y) { const i = this.i(x, y); return i < 0 ? 0 : this.d[i + 3]; }
  get(x, y) { const i = this.i(x, y); return i < 0 || !this.d[i + 3] ? null : [this.d[i], this.d[i + 1], this.d[i + 2]]; }
  mix(x, y, c, t) { const i = this.i(x, y); if (i < 0 || !this.d[i + 3]) return; const d = this.d; for (let k = 0; k < 3; k++) d[i + k] += (c[k] - d[i + k]) * t; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) this.set(x + k, y + j, typeof c === 'function' ? c(x + k, y + j) : c); return this; }
  // filled ellipse; c = colour or fn(x, y, nx, ny) -> colour | null
  ell(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry;
      if (nx * nx + ny * ny > 1.02) continue;
      const col = typeof c === 'function' ? c(x, y, nx, ny) : c;
      if (col) this.set(x, y, col);
    }
    return this;
  }
  line(x0, y0, x1, y1, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let k = 0; k <= n; k++) this.set(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, typeof c === 'function' ? c(k, n) : c);
    return this;
  }
  // rows of chars -> colours via a palette; '.' is empty
  rows(x0, y0, rows, pal) {
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.' && pal[ch]) this.set(x0 + x, y0 + y, pal[ch]); }));
    return this;
  }
  // copy an image (canvas) in, optionally mapping colours
  blit(src, dx = 0, dy = 0, map = null) {
    if (!src) return this;
    const sd = ctx2d(src).getImageData(0, 0, src.width, src.height).data;
    for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
      const i = (y * src.width + x) * 4;
      if (sd[i + 3] < 128) continue;
      const c = [sd[i], sd[i + 1], sd[i + 2]];
      const m = map ? map(c, x, y) : c;
      if (m) this.set(dx + x, dy + y, m);
    }
    return this;
  }
  // 1px outline (outside the shape) tinted from the neighbour colour
  outline(dark = 0.55, ink = [34, 22, 18]) {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.a(x, y)) continue;
      let best = null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const c = this.get(x + dx, y + dy); if (c && (!best || c[0] + c[1] + c[2] < best[0] + best[1] + best[2])) best = c; }
      if (best) add.push([x, y, mixc(best, ink, dark)]);
    }
    for (const [x, y, c] of add) this.set(x, y, c);
    return this;
  }
  canvas(scale = 1) {
    const c = mkCanvas(this.w, this.h);
    ctx2d(c).putImageData(new ImageData(this.d, this.w, this.h), 0, 0);
    return scale > 1 ? scaled(c, scale) : c;
  }
}

export function scaled(src, s = 1) {
  s = Math.max(1, Math.round(s) || 1);
  if (!src || s === 1) return src;
  const c = mkCanvas(src.width * s, src.height * s);
  const g = ctx2d(c);
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

let NAT = null;
export function natArt(name, frame = 0) {
  NAT ||= new Set(NATURE_NAMES);
  if (!name || !NAT.has(name)) return null;
  try { return natureCanvas(name, frame, 1); } catch { return null; }
}
export function iconArt(name) {
  if (!name || !hasSprite(name)) return null;
  try { return spriteCanvas(name, 1); } catch { return null; }
}

// memoised art: (scale) -> canvas (or a data URL for 3D renders)
const ART_CACHE = new Map();
function lazyArt(key, fn) {
  return (s = 1) => {
    const k = `${key}@${s}`;
    if (ART_CACHE.has(k)) return ART_CACHE.get(k);
    let base = ART_CACHE.get(`${key}@1`);
    if (base === undefined) {
      try { base = fn() || null; } catch (e) { console.warn('encyclopedia art', key, e); base = null; }
      ART_CACHE.set(`${key}@1`, base);
    }
    const out = !base || s === 1 || typeof base === 'string' ? base : scaled(base, s);
    ART_CACHE.set(k, out);
    return out;
  };
}

// ===========================================================================
// chapters
// ===========================================================================
export const CHAPTERS = [
  { id: 'fish', name: 'Fish', icon: 'fish', color: '#2f6fb0', cloth: '#2f6fb0', perPage: 1, plate: 'water', blurb: 'Every fish in my pond, and every fish I still want. Bears pay by the pound!' },
  { id: 'morphs', name: 'Mutations & Morphs', short: 'Morphs', icon: 'dna', color: '#7a3cb0', cloth: '#7a3cb0', perPage: 1, plate: 'night', blurb: 'Rare colours and weird mutations. The weirder the fish, the fatter the bill.' },
  { id: 'birds', name: 'Birds', icon: 'feather', color: '#c0392b', cloth: '#b8342c', perPage: 1, plate: 'sky', blurb: 'Feathered freeloaders. Tap one to log it. Professor Hoot pays a bounty!' },
  { id: 'bugs', name: 'Bugs', icon: 'bug', color: '#4a8a2a', cloth: '#4f8f2f', perPage: 1, plate: 'leaf', blurb: 'Duck food with legs. Some of them even glow.' },
  { id: 'livestock', name: 'Livestock', icon: 'egg', color: '#c88a1c', cloth: '#d8a028', perPage: 1, plate: 'pond', blurb: 'Ducks and geese: eggs, honks and free bear security.' },
  { id: 'land', name: 'Land Animals', short: 'Animals', icon: 'paw', color: '#8a5a2c', cloth: '#8a5a32', perPage: 1, plate: 'meadow', blurb: 'Hoppers, nibblers and garden thieves. Log them, then shoo them.' },
  { id: 'plants', name: 'Plants & Crops', short: 'Plants', icon: 'leaf', color: '#2f6f4a', cloth: '#2e7a4c', perPage: 1, plate: 'soil', blurb: 'Plant it, grow it, sell it to a bear.' },
  { id: 'foods', name: 'Foods', icon: 'food', color: '#d0601c', cloth: '#d86a24', perPage: 2, plate: 'table', blurb: 'Everything that can be eaten. By fish, by bears, or by beavers on the clock.' },
  { id: 'villagers', name: 'Villagers', icon: 'home', color: '#5a4a8a', cloth: '#5e4e90', perPage: 1, plate: 'cameo', blurb: 'My neighbours. Friends are good for business.' },
  { id: 'trophies', name: 'Trophies', icon: 'trophy', color: '#a8781c', cloth: '#b88a2a', perPage: 4, plate: 'velvet', blurb: 'Proof that I am magnificent.' },
];
export const CHAPTER_BY_ID = Object.fromEntries(CHAPTERS.map((c) => [c.id, c]));

const RANK = [
  { name: 'Common', color: RARITIES[0].color, tier: 0 },
  { name: 'Uncommon', color: RARITIES[1].color, tier: 1 },
  { name: 'Rare', color: RARITIES[2].color, tier: 2 },
  { name: 'Super rare', color: RARITIES[3].color, tier: 3 },
];
const rarityOfTier = (t) => ({ name: RARITIES[t]?.name || 'Common', color: RARITIES[t]?.color || '#d8d2c0', tier: t });

// ===========================================================================
// game-state readers (all optional)
// ===========================================================================
function readKnown(game) {
  const st = game?.state || {};
  const log = st.dexLog || {};
  const S = {
    discovered: new Set(st.discovered || []),
    morphs: new Set(st.morphsSeen || []),
    birds: new Set(st.birdsSpotted || []),
    bugs: new Set(),
    mut: new Set([...(st.mutationsSeen || []), ...(log.mut || [])].map((k) => String(k).split(':').pop())),
    mutOn: new Map(), // mutation -> species ids it was seen on
    breeds: new Set([...(st.livestockSeen || []), ...(log.breeds || [])]),
    land: new Set(st.landSpotted || []),
    tame: new Set(log.tame || []),
    built: new Set([...(st.builtTypes || []), ...(log.built || [])]),
    food: new Set(st.foodSeen || []),
    zones: new Set(st.zones || []),
    achievements: new Set(st.achievements || []),
    research: new Set(st.research || []),
  };
  try { for (const id of game.bugs?.seen || []) S.bugs.add(id); } catch { /* none */ }
  for (const id of st.bugsSeen || []) S.bugs.add(id);
  for (const k of [...(st.mutationsSeen || []), ...(log.mutOn || [])]) {
    const [sp, m] = String(k).includes(':') ? String(k).split(':') : [null, k];
    if (sp && m) { S.mut.add(m); if (!S.mutOn.has(m)) S.mutOn.set(m, new Set()); S.mutOn.get(m).add(sp); }
  }
  try {
    for (const f of game.fish?.list || []) {
      const m = f.g?.mut || f.g?.mutation;
      if (!m) continue;
      S.mut.add(m);
      if (!S.mutOn.has(m)) S.mutOn.set(m, new Set());
      S.mutOn.get(m).add(f.sp?.id || f.species);
    }
  } catch { /* none */ }
  try { for (const b of game.livestock?.list || []) S.breeds.add(b.breed); } catch { /* none */ }
  try { for (const b of game.landAnimals?.tame || []) if (b.breed) S.tame.add(b.breed); } catch { /* none */ }
  try { for (const s of game.structures?.list || []) if (s.built && !s.removed) S.built.add(s.type); } catch { /* none */ }
  for (const [id, n] of Object.entries(st.food || {})) if (n > 0) S.food.add(id);
  for (const id of Object.keys(st.harvested || {})) S.food.add(id);
  for (const [id, v] of Object.entries(st.villagers || {})) if (v?.met) S.zones.add(ZONES.find((z) => z.npc.id === id)?.id);
  return S;
}

// where / how something unlocks
const ZONE_OF_LANDMARK = Object.fromEntries(ZONES.map((z) => [z.landmark, z]));
function unlockText(rid, { verb = 'Unlocks' } = {}) {
  if (!rid || rid === 'start') return 'Available from day one';
  if (rid === 'hybrid') return 'Cross-breed two species';
  if (rid.startsWith('day:')) return `${verb} on day ${rid.slice(4)}`;
  if (rid.startsWith('zone_')) {
    const z = ZONES.find((q) => q.id === rid.slice(5));
    return z ? `Befriend ${z.npc.name}` : 'Explore the forest';
  }
  const r = RESEARCH_BY_ID[rid];
  return r ? `Research "${r.name}"` : 'Keep exploring';
}
function landmarkText(lm) {
  const z = ZONE_OF_LANDMARK[lm];
  return z ? `Befriend ${z.npc.name} (${z.name})` : 'Explore the forest';
}
const structName = (t) => STRUCTURES[t]?.name || FOOD_ITEMS[t]?.name || String(t).replace(/^\w/, (c) => c.toUpperCase());
const listNames = (ids, n = 3) => ids.slice(0, n).map(structName).join(', ');
const pickBy = (id, arr) => arr[strHash(id) % arr.length];
const secs = (s) => (s >= 90 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`);

// ===========================================================================
// FISH
// ===========================================================================
const FISH_NOTES = ['Bears love these!', 'Breeds like crazy.', 'Mine. All mine.', 'Tag the pretty ones!', 'Worth every coin.', 'Good eating, bears say.', 'Feed it, breed it, sell it.'];
function fishChapter(game, S) {
  const genetics = S.research.has('r_genetics');
  const counts = (() => { try { return game.fish?.countBySpecies?.() || {}; } catch { return {}; } })();
  return SPECIES.map((sp, i) => {
    const known = S.discovered.has(sp.id);
    const rar = rarityOfTier(sp.tier || 0);
    const hybrid = sp.unlock === 'hybrid';
    const recipeKnown = known || genetics;
    const recipe = sp.parents ? sp.parents.map((pid) => {
      const p = SPECIES.find((x) => x.id === pid);
      return { id: pid, name: p?.name || pid, known: recipeKnown && S.discovered.has(pid), art: lazyArt(`fish:${pid}:normal`, () => fishCanvasFor(pid, { scale: 1 })) };
    }) : null;
    const how = hybrid ? (recipeKnown ? `Breed ${recipe.map((r) => r.name).join(' × ')}` : 'Breed ??? × ???') : sp.unlock === 'start' ? 'Sold as eggs on e-Buy' : unlockText(sp.unlock);
    const size = Math.round(sp.size * 32);
    return {
      id: sp.id, num: i + 1, name: sp.name, sub: sp.latin, desc: sp.desc, known,
      art: lazyArt(`fish:${sp.id}:normal`, () => fishCanvasFor(sp.id, { scale: 1 })), silhouette: true,
      rarity: rar,
      stats: [
        { icon: 'gem', label: 'Rarity', value: rar.name, color: rar.color },
        hybrid ? { icon: 'dna', label: 'Egg', value: 'Hybrid' } : { icon: 'coin', label: 'Egg', value: `${sp.price}` },
        { icon: 'ruler', label: 'Size', value: `${size} cm` },
        { icon: 'bear', label: 'Meal', value: `×${sp.meal}` },
        { icon: 'heart', label: 'Breeds', value: sp.breed >= 1.15 ? 'Fast' : sp.breed >= 0.85 ? 'Normal' : sp.breed >= 0.6 ? 'Slow' : 'Rarely' },
        { icon: 'pond', label: 'In pond', value: `${counts[sp.id] || 0}` },
      ],
      variants: MORPH_IDS.map((m) => ({
        id: m, name: m === 'normal' ? 'Wild' : MORPHS[m].name, known: m === 'normal' ? known : S.morphs.has(`${sp.id}:${m}`),
        art: lazyArt(`fish:${sp.id}:${m}`, () => fishCanvasFor(sp.id, { morph: m, scale: 1 })),
      })),
      variantsTitle: 'Colour morphs',
      recipe, how, hint: how,
      note: sp.tier >= 4 ? 'Do NOT let the bears near this one!' : hybrid ? 'Bred it myself!' : pickBy(sp.id, FISH_NOTES),
      plate: 'water', value: sp.value,
    };
  });
}

// ===========================================================================
// MUTATIONS & MORPHS
// ===========================================================================
const MUT_DESC = {
  tiny: 'Fun-size! Worth a little less, but SO cute. Bears need two.',
  frozen: 'Frost on the fins and always two degrees. Bears get brain freeze.',
  candy: 'Pink, sweet and covered in sprinkles. Dentists hate it.',
  hot: 'Too spicy to touch. Leaves a trail of sparks through the water.',
  zombie: 'Groans. Glows. Smells. Still delicious, apparently.',
  shiny: 'Sparkles like a brand new coin. Collectors pay triple.',
  titan: 'Nearly twice the size of its friends. Feeds two whole bears.',
  doge: 'Such fish. Very gold. Much value. Wow.',
  doublehot: 'Hotter than hot. The pond steams when it swims by.',
  galaxy: 'A whole starry night inside one fish. Once in a blue moon.',
};
const FX_NAME = { none: 'Smaller', frost: 'Frost', sprinkles: 'Sprinkles', flame: 'Flames', stink: 'Stink lines', sparkle: 'Sparkles', stomp: 'Ground shake', wow: 'Wow', bigflame: 'Inferno', stars: 'Starlight' };
function oneIn(chance) { return `1 in ${Math.round(1 / chance)}`; }
function morphChapter(game, S) {
  const out = [];
  const seenOn = (m) => SPECIES.filter((sp) => S.morphs.has(`${sp.id}:${m}`)).map((sp) => sp.id);
  for (const m of MORPH_IDS) {
    if (m === 'normal') continue;
    const M = MORPHS[m];
    const on = seenOn(m);
    const sample = on[0] || 'bluegill';
    out.push({
      id: `m_${m}`, name: M.name, sub: 'Colour morph', desc: M.desc, known: on.length > 0,
      art: lazyArt(`fish:${sample}:${m}`, () => fishCanvasFor(sample, { morph: m, scale: 1 })), silhouette: true,
      rarity: rarityOfTier(clamp(M.stars + 1, 0, 4)),
      stats: [
        { icon: 'clover', label: 'Chance', value: oneIn(M.chance) },
        { icon: 'coin', label: 'Value', value: `×${M.value}` },
        { icon: 'star', label: 'Rarity', value: `+${M.stars}★` },
        { icon: 'eye', label: 'Seen on', value: `${on.length} sp.` },
      ],
      variants: on.slice(0, 7).map((sid) => ({ id: sid, name: SPECIES.find((s) => s.id === sid)?.name || sid, known: true, art: lazyArt(`fish:${sid}:${m}`, () => fishCanvasFor(sid, { morph: m, scale: 1 })) })),
      variantsTitle: 'Seen on',
      how: 'Hatch lots of eggs. Lucky food helps!',
      hint: 'Hatch lots of eggs. Lucky food helps!',
      note: M.stars >= 3 ? 'Once in a lifetime!!' : M.stars >= 2 ? 'Worth a fortune!' : 'Pretty!',
      plate: 'night',
    });
  }
  for (const id of MUTATION_IDS) {
    const M = MUTATIONS[id];
    const on = [...(S.mutOn.get(id) || [])].filter((sid) => SPECIES.some((s) => s.id === sid));
    const sample = on[0] || (id === 'titan' ? 'bass' : id === 'doge' ? 'goldfish' : 'bluegill');
    out.push({
      id: `x_${id}`, name: M.name, sub: 'Mutation', desc: MUT_DESC[id] || 'A strange and valuable mutation.', known: S.mut.has(id),
      art: lazyArt(`mut:${id}:${sample}`, () => mutationArt(id, sample)), silhouette: true,
      rarity: rarityOfTier(clamp(M.stars + 1, 0, 4)),
      stats: [
        { icon: 'clover', label: 'Chance', value: oneIn(M.chance) },
        { icon: 'coin', label: 'Value', value: `×${M.value}` },
        { icon: 'star', label: 'Rarity', value: `+${M.stars}★` },
        { icon: 'sparkle', label: 'Effect', value: FX_NAME[M.fx] || M.fx, color: M.color },
        ...(M.scale !== 1 ? [{ icon: 'ruler', label: 'Size', value: `×${M.scale}` }] : []),
      ],
      variants: on.slice(0, 7).map((sid) => ({ id: sid, name: SPECIES.find((s) => s.id === sid)?.name || sid, known: true, art: lazyArt(`mut:${id}:${sid}`, () => mutationArt(id, sid)) })),
      variantsTitle: 'Seen on',
      how: 'Rolls on any egg. Swamp water helps!',
      hint: 'Rolls on any egg. Swamp water helps...',
      note: M.stars >= 3 ? 'I MUST have one!' : pickBy(id, ['So weird!', 'Bears go nuts for it.', 'Sell high!']),
      plate: 'night', color: M.color,
    });
  }
  out.forEach((e, i) => { e.num = i + 1; });
  return out;
}

// ===========================================================================
// BIRDS
// ===========================================================================
const BIRD_INFO = {
  chickadee: ['Poecile atricapillus', 'Tiny, fearless and always chatting. It says its own name: chick-a-dee-dee-dee!'],
  robin: ['Turdus migratorius', 'The first sign of spring. Hunts worms like a pro and sings at 4 AM sharp.'],
  sparrow: ['Passer domesticus', 'A little brown bird with big city energy. Will steal your fries.'],
  crow: ['Corvus brachyrhynchos', 'Very clever. Remembers faces. Has strong opinions about your picnic.'],
  bluejay: ['Cyanocitta cristata', 'Loud, blue and a little bit of a bully. Copies hawk calls for fun.'],
  junco: ['Junco hyemalis', 'A small grey "snowbird" that flashes white tail feathers. Hops, never walks.'],
  dove: ['Zenaida macroura', 'Coos softly at dawn. Its wings whistle when it takes off.'],
  cardinal: ['Cardinalis cardinalis', 'A blazing red crest. Couples share seeds beak to beak. Aww.'],
  goldfinch: ['Spinus tristis', 'A flying lemon drop. Bounces through the air singing po-ta-to-chip!'],
  grayjay: ['Perisoreus canadensis', 'The Canada Jay. Friendly, fluffy, and it WILL take your sandwich.'],
  blackbird: ['Agelaius phoeniceus', 'Red shoulder patches and a song like a rusty gate: konk-la-reee!'],
  swallow: ['Hirundo rustica', 'Blue back, forked tail. Catches bugs mid-air in loop-de-loops.'],
  woodpecker: ['Dryobates pubescens', 'The smallest woodpecker. Drums on trees, pipes, and sometimes the hut.'],
  magpie: ['Pica hudsonia', 'Black, white and loves anything shiny. Garden gnomes, beware.'],
  flicker: ['Colaptes auratus', 'A woodpecker that eats ants off the ground. Polka-dot belly!'],
  waxwing: ['Bombycilla cedrorum', 'Silky, sleek and wearing a robber\'s mask. Gets tipsy on old berries.'],
  bluebird: ['Sialia sialis', 'A piece of sky with wings. Rare, lucky, and loves a birdhouse.'],
  oriole: ['Icterus galbula', 'Flame orange and black. Weaves a nest shaped like a sock.'],
  bunting: ['Passerina cyanea', 'Electric indigo... except the feathers are really brown. Light trick!'],
  hummingbird: ['Archilochus colubris', 'Wings beat 50 times a second. Sips flowers, picks fights with bees.'],
  kingfisher: ['Megaceryle alcyon', 'A punk-crested fisher that rattles as it dives. Your fish\'s nemesis.'],
  grosbeak: ['Coccothraustes vespertinus', 'A chunky golden finch with a nutcracker beak. Travels in gangs.'],
  redpoll: ['Acanthis flammea', 'A tiny arctic finch in a red beret. Visits in chattering flocks.'],
  snowbunting: ['Plectrophenax nivalis', 'A snowflake that flies. Lives where it\'s coldest, and likes it there.'],
  tanager: ['Piranga olivacea', 'Scarlet with jet-black wings, hiding in the treetops. A birder\'s prize.'],
  snowyowl: ['Bubo scandiacus', 'A silent ghost of the tundra, only out at night. Professor Hoot\'s hero.'],
};
const POSES = [['idle', 'Perched'], ['hop', 'Hopping'], ['peck', 'Pecking'], ['fly', 'In flight']];
function birdChapter(game, S) {
  return WILD_BIRDS.map((b, i) => {
    const known = S.birds.has(b.id);
    const info = BIRD_INFO[b.id] || ['Aves incognita', 'A visitor from the woods.'];
    const r = RANK[b.rarity] || RANK[0];
    const likes = (b.like || []).filter((t) => STRUCTURES[t] || BUG_FARMS[t]);
    const how = `Visits: ${listNames(likes, 3) || 'anywhere'}${b.night ? ' · at night' : ''}`;
    return {
      id: b.id, num: i + 1, name: b.name, sub: info[0], desc: info[1], known,
      art: lazyArt(`bird:${b.id}`, () => natArt(`${b.id}_idle`) || iconArt('birdhouse')), silhouette: true,
      rarity: r,
      stats: [
        { icon: 'gem', label: 'Rarity', value: r.name, color: r.color },
        { icon: 'coin', label: 'Bounty', value: `${BIRD_BOUNTY[b.rarity] || 0}` },
        { icon: b.night ? 'moon' : 'sun', label: 'Active', value: b.night ? 'Night' : 'Day' },
        { icon: 'heart', label: 'Likes', value: likes.length ? structName(likes[0]) : '?' },
      ],
      variants: POSES.map(([a, nm]) => ({ id: a, name: nm, known, art: lazyArt(`bird:${b.id}:${a}`, () => natArt(`${b.id}_${a}`)) })),
      variantsTitle: 'Field sketches',
      how, hint: how,
      note: b.rarity >= 3 ? 'Saw it! Nobody believes me.' : pickBy(b.id, ['Spotted it!', 'Pretty little thing.', 'Hoot owes me coins.', 'Noisy neighbour.', 'Pooped on the hut.']),
      plate: 'sky',
    };
  });
}

// ===========================================================================
// BUGS
// ===========================================================================
const BUG_LATIN = {
  ladybug: 'Coccinella septempunctata', firefly: 'Photinus pyralis', mayfly: 'Hexagenia limbata', dragonfly: 'Anax junius',
  damselfly: 'Enallagma civile', cricket: 'Gryllus pennsylvanicus', grasshopper: 'Melanoplus femurrubrum', katydid: 'Pterophylla camellifolia',
  junebug: 'Phyllophaga anxia', stagbeetle: 'Lucanus elaphus', rhinobeetle: 'Xyloryctes jamaicensis', mealworm: 'Tenebrio molitor',
  earthworm: 'Lumbricus terrestris', grub: 'Scarabaeidae larva', waterstrider: 'Aquarius remigis', mosquito: 'Culex pipiens',
  bumblebee: 'Bombus impatiens', monarch: 'Danaus plexippus', lunamoth: 'Actias luna', pillbug: 'Armadillidium vulgare',
};
const MOVE_NAME = { fly: 'Flies', crawl: 'Crawls', hop: 'Hops', skate: 'Skates' };
function bugChapter(game, S) {
  return BUGS.map((b, i) => {
    const known = S.bugs.has(b.id);
    const r = RANK[b.rarity] || RANK[0];
    const farms = Object.entries(BUG_FARMS).filter(([, f]) => f.kinds?.[b.id]).map(([id]) => id);
    const wild = [WILD_DAY[b.id] ? 'day' : null, WILD_NIGHT[b.id] ? 'night' : null].filter(Boolean);
    const fx = b.effect ? EFFECTS[b.effect] : null;
    const how = farms.length ? `Grows in: ${listNames(farms, 3)}` : wild.length ? `Wild, by ${wild.join(' & ')}` : 'Wanders in now and then';
    return {
      id: b.id, num: i + 1, name: b.name, sub: BUG_LATIN[b.id] || 'Insecta', desc: b.desc, known,
      art: lazyArt(`bug:${b.id}`, () => natArt(`bugicon_${b.id}`) || natArt(`bug_${b.id}`) || iconArt('bug')), silhouette: true,
      rarity: r,
      stats: [
        { icon: 'gem', label: 'Rarity', value: r.name, color: r.color },
        { icon: 'food', label: 'Duck food', value: `+${Math.round(b.food * 100)}%` },
        fx ? { icon: fx.icon, label: 'Boost', value: fx.name, color: fx.color } : { icon: 'question', label: 'Boost', value: 'None' },
        { icon: b.night ? 'moon' : 'sun', label: 'Moves', value: MOVE_NAME[b.move] || b.move },
      ],
      variants: [0, 1].map((f) => ({ id: `f${f}`, name: f ? 'Wings up' : 'At rest', known, art: lazyArt(`bug:${b.id}:${f}`, () => natArt(`bug_${b.id}`, f)) })),
      variantsTitle: 'Field sketches',
      how, hint: how,
      note: b.glow ? 'Glows in the dark!' : b.rarity >= 2 ? 'Rare find!' : pickBy(b.id, ['Duck snack!', 'Crunchy.', 'Ducks go quackers.', 'Ew. Useful, though.']),
      plate: b.night ? 'night' : b.water ? 'pond' : 'leaf',
      fx: fx ? fx.line : null,
    };
  });
}

// ===========================================================================
// LIVESTOCK
// ===========================================================================
const BREED_LATIN = { mallard: 'Anas platyrhynchos', pekin: 'Anas platyrhynchos domesticus', wood: 'Aix sponsa', canada: 'Branta canadensis', snow: 'Anser caerulescens' };
// render a 3D rig into a pixel image through the UI's icon renderer
function rigArt(game, key, make, opts) {
  const icons = game?.ui?.icons;
  if (!icons?.renderObject) return null;
  let rig = null;
  try {
    rig = make();
    if (!rig?.root) return null;
    rig.play?.('idle', { loop: true });
    for (let i = 0; i < 4; i++) rig.update?.(0.05);
    return icons.renderObject(key, rig.root, { size: 56, yaw: 0.85, pitch: 0.32, pad: 1.04, ...opts });
  } catch (e) {
    console.warn('encyclopedia rig art', key, e);
    return null;
  } finally {
    try { rig?.dispose?.(); } catch { /* ignore */ }
  }
}
function livestockChapter(game, S) {
  return Object.entries(BREEDS).map(([id, B], i) => {
    const known = S.breeds.has(id);
    const K = KIND_INFO[B.kind] || {};
    const goose = B.kind === 'goose';
    const flat = () => natArt(goose ? 'goose_swim' : 'mallard_swim');
    const make = (sex, baby) => () => (baby ? (C3.Chick ? new C3.Chick({ kind: goose ? 'gosling' : 'duckling', breed: id, shadows: false, fx: false }) : null)
      : goose ? (C3.Goose ? new C3.Goose({ sex, breed: id, shadows: false, fx: false }) : null)
        : (C3.Duck ? new C3.Duck({ sex, breed: id, shadows: false, fx: false }) : null));
    const art = (sex, baby) => lazyArt(`ls:${id}:${sex}:${baby ? 1 : 0}`, () => rigArt(game, `dex:ls:${id}:${sex}:${baby ? 1 : 0}`, make(sex, baby)) || flat());
    const how = unlockText(B.unlock).replace('Available from day one', 'Sold on e-Buy');
    return {
      id, num: i + 1, name: B.name, sub: BREED_LATIN[id] || 'Anatidae', desc: B.desc, known,
      art: art('m', false), silhouette: true,
      rarity: rarityOfTier(Math.min(4, Math.floor(B.price / 50))),
      stats: [
        { icon: 'coin', label: 'Price', value: `${B.price}` },
        { icon: 'egg', label: 'Egg', value: `${B.eggValue} c` },
        { icon: 'hourglass', label: 'Grows up', value: secs(K.grow || 150) },
        { icon: 'heart', label: 'Lays', value: `every ${secs(K.layEvery || 90)}` },
      ],
      variants: [
        { id: 'm', name: goose ? 'Gander' : 'Drake', known, art: art('m', false) },
        { id: 'f', name: goose ? 'Goose' : 'Hen', known, art: art('f', false) },
        { id: 'baby', name: K.baby || 'Baby', known, art: art('f', true) },
      ],
      variantsTitle: 'The family',
      how, hint: `${how}, then buy a pair`,
      note: goose ? 'Chases bears! Good goose.' : pickBy(id, ['Quack.', 'Lays golden eggs (rarely)!', 'Feed it bugs.']),
      plate: 'pond',
    };
  });
}

// ===========================================================================
// LAND ANIMALS
// ===========================================================================
const LAND_LATIN = {
  cottontail: 'Sylvilagus floridanus', snowshoe: 'Lepus americanus', jackrabbit: 'Lepus townsendii', chipmunk: 'Tamias striatus',
  redsquirrel: 'Tamiasciurus hudsonicus', deermouse: 'Peromyscus maniculatus', vole: 'Microtus pennsylvanicus', groundhog: 'Marmota monax',
  muskrat: 'Ondatra zibethicus', porcupine: 'Erethizon dorsatum', skunk: 'Mephitis mephitis', flyingsquirrel: 'Glaucomys sabrinus',
  pika: 'Ochotona princeps', lemming: 'Lemmus trimucronatus', lop: 'Oryctolagus cuniculus (lop)', dutch: 'Oryctolagus cuniculus (Dutch)', lionhead: 'Oryctolagus cuniculus (lionhead)',
};
const MISCHIEF = {
  nibble: { icon: 'food', label: 'Nibbles crops' },
  steal: { icon: 'hand', label: 'Raids snacks' },
  stash: { icon: 'hourglass', label: 'Pockets seeds' },
  stink: { icon: 'anger', label: 'Stinks!' },
};
const LAND_POSES = [['idle', 'Sitting'], ['move', 'On the move'], ['eat', 'Munching'], ['look', 'On alert']];
function landChapter(game, S) {
  const out = LAND_ANIMALS.map((a, i) => {
    const known = S.land.has(a.id);
    const r = RANK[a.rarity] || RANK[0];
    const likes = a.like || [];
    const mis = MISCHIEF[a.mischief] || { icon: 'heart', label: 'Harmless' };
    const how = `Drawn to: ${listNames(likes, 3) || 'the woods'}${a.night ? ' · at night' : ''}`;
    return {
      id: a.id, num: i + 1, name: a.name, sub: LAND_LATIN[a.id] || 'Mammalia', desc: a.desc, known,
      art: lazyArt(`land:${a.id}`, () => natArt(`${a.id}_idle`) || critterSketch(a)), silhouette: true,
      rarity: r,
      stats: [
        { icon: 'gem', label: 'Rarity', value: r.name, color: r.color },
        { icon: 'coin', label: 'Bounty', value: `${LAND_BOUNTY[a.rarity] || 0}` },
        { icon: mis.icon, label: 'Mischief', value: mis.label },
        { icon: a.night ? 'moon' : 'sun', label: 'Active', value: a.night ? 'Night' : 'Day' },
      ],
      variants: LAND_POSES.map(([p, nm]) => ({ id: p, name: nm, known, art: lazyArt(`land:${a.id}:${p}`, () => natArt(`${a.id}_${p}`)) })),
      variantsTitle: 'Field sketches',
      how, hint: how,
      note: a.mischief === 'stink' ? 'Do NOT poke it.' : a.mischief === 'nibble' ? 'Garden thief!' : a.rarity >= 3 ? 'Super rare! Hoot was jealous.' : pickBy(a.id, ['So fluffy!', 'Shoo! Shoo!', 'Cute, but suspicious.']),
      plate: 'meadow',
    };
  });
  TAME_BUNNIES.forEach((b, i) => {
    const known = S.tame.has(b.id);
    out.push({
      id: `tame_${b.id}`, num: out.length + 1, name: b.name, sub: LAND_LATIN[b.id] || 'Oryctolagus cuniculus', desc: b.desc, known,
      art: lazyArt(`tame:${b.id}`, () => natArt(`bunny_${b.id}_idle`) || natArt(`${b.id}_idle`) || critterSketch({ id: b.id, kind: 'rabbit' })), silhouette: true,
      rarity: { name: 'Tame', color: '#f08aa8', tier: 1 },
      stats: [
        { icon: 'home', label: 'Lives in', value: 'Bunny Hutch' },
        { icon: 'bolt', label: 'Crops', value: '+40% growth' },
        { icon: 'heart', label: 'Babies', value: 'Yes!' },
      ],
      variants: LAND_POSES.map(([p, nm]) => ({ id: p, name: nm, known, art: lazyArt(`tame:${b.id}:${p}`, () => natArt(`bunny_${b.id}_${p}`)) })),
      variantsTitle: 'Field sketches',
      how: 'Build a Bunny Hutch', hint: 'Build a Bunny Hutch: two bunnies move in',
      note: pickBy(b.id, ['Best fertilizer in town.', 'Boop the nose!', 'Hop hop hop.']),
      plate: 'meadow', tame: true,
    });
  });
  return out;
}

// ===========================================================================
// PLANTS & CROPS
// ===========================================================================
const PLANT_LATIN = {
  seaweed: 'Elodea canadensis', duckweed: 'Lemna minor', cattail: 'Typha latifolia', reeds: 'Phragmites australis', lilypad: 'Nymphaea odorata',
  flowers: 'Chamaenerion & Lupinus', fern: 'Matteuccia struthiopteris', willow: 'Salix babylonica', tallgrass: 'Andropogon gerardii', butterflybush: 'Buddleja davidii',
  berries: 'Vaccinium angustifolium', raspberry: 'Rubus idaeus', strawberry: 'Fragaria virginiana', saskatoon: 'Amelanchier alnifolia', cranberry: 'Vaccinium macrocarpon',
  cloudberry: 'Rubus chamaemorus', elderberry: 'Sambucus canadensis', goldenberry: 'Physalis aurea (blessed)', beehive: 'Apis mellifera', wildrice: 'Zizania palustris',
  mushrooms: 'Cantharellus cibarius', maple: 'Acer saccharum', carrot: 'Daucus carota', lettuce: 'Lactuca sativa', radish: 'Raphanus sativus', peas: 'Pisum sativum',
  potato: 'Solanum tuberosum', corn: 'Zea mays', sunflower: 'Helianthus annuus', pumpkin: 'Cucurbita pepo',
};
const PLANT_TYPES = (() => {
  const out = [];
  for (const [t, d] of Object.entries(STRUCTURES)) {
    const plant = d.category === 'nature' && t !== 'bughotel';
    if (plant || d.crop || d.food || t === 'tallgrass' || t === 'butterflybush' || CROPS[t]) out.push(t);
  }
  return out;
})();
function plantArtFn(t) {
  const d = STRUCTURES[t] || {};
  const C = CROPS[t];
  const ripe = C?.stages?.[3];
  return () => natArt(ripe) || natArt(d.sprite?.[0]) || iconArt(d.icon) || iconArt(FOOD_ITEMS[C?.item]?.icon) || plantSketch(FOOD_ITEMS[C?.item]?.pellet?.[0]);
}
function plantChapter(game, S) {
  return PLANT_TYPES.map((t, i) => {
    const d = STRUCTURES[t];
    const C = CROPS[t];
    const known = S.built.has(t);
    const item = C ? FOOD_ITEMS[C.item] : null;
    const special = C?.special ? FOOD_ITEMS[C.special] : null;
    const unlock = d.landmark ? landmarkText(d.landmark) : d.unlock ? unlockText(d.unlock) : 'Build it from Blueprints';
    const stats = [{ icon: 'coin', label: 'Cost', value: `${d.cost}` }];
    if (C) {
      stats.push({ icon: item?.icon && hasSprite(item.icon) ? item.icon : 'food', label: 'Yield', value: `${C.yield[0]}-${C.yield[1]}` });
      stats.push({ icon: 'hourglass', label: 'Grows', value: secs(C.grow) });
    } else if (d.food) {
      stats.push({ icon: 'food', label: 'Servings', value: `${d.food.max}` });
    }
    if (d.beauty) stats.push({ icon: 'beauty', label: 'Beauty', value: `+${d.beauty}` });
    if (special) stats.push({ icon: 'sparkle', label: 'Lucky find', value: special.name, color: '#c88a1c' });
    let variants = [];
    if (C?.stages?.length && !C.noSeed) {
      variants = C.stages.map((sn, k) => ({ id: CROP_STAGES[k] || `s${k}`, name: STAGE_NAMES[CROP_STAGES[k]] || `Stage ${k + 1}`, known, art: lazyArt(`plant:${t}:stage${k}`, () => natArt(sn)) }));
      variants[variants.length - 1].name = 'Ripe';
    } else if ((d.sprite || []).length > 1) {
      const roman = ['I', 'II', 'III', 'IV', 'V'];
      variants = d.sprite.slice(0, 5).map((sn, k) => ({ id: sn, name: d.variants ? `Variety ${roman[k]}` : k ? 'Picked' : 'Ripe', known, art: lazyArt(`plant:${t}:v${k}`, () => natArt(sn)) }));
      if (!d.variants && t !== 'cattail') variants = variants.reverse();
    }
    const how = known ? unlock : `${unlock}, then build one`;
    return {
      id: t, num: i + 1, name: d.name, sub: PLANT_LATIN[t] || 'Plantae', desc: d.desc, known,
      art: lazyArt(`plant:${t}`, plantArtFn(t)), silhouette: true,
      rarity: rarityOfTier(clamp(Math.floor((d.cost || 0) / 45), 0, 4)),
      stats, variants, variantsTitle: C && !C.noSeed ? 'Growing up' : 'Varieties',
      how: item ? `${unlock}. Harvest: ${item.name}` : unlock, hint: how,
      note: special ? `Lucky batches: ${special.name}!` : d.beauty >= 3 ? 'Gorgeous. Bears agree.' : pickBy(t, ['Water daily. (Rain counts.)', 'Grows like a weed.', 'Bears love a garden.']),
      plate: d.place === 'water' || d.underwater ? 'pond' : 'soil',
    };
  });
}

// ===========================================================================
// FOODS
// ===========================================================================
const USE_TXT = { fish: 'fish nibble it', bear: 'bears munch it', beaver: 'beavers work for it' };
function foodDesc(id, f) {
  if (f.desc) return f.desc;
  const from = structName(f.from);
  const uses = ['fish', 'bear', 'beaver'].filter((k) => f[k]).map((k) => USE_TXT[k]);
  const u = uses.length > 1 ? `${uses.slice(0, -1).join(', ')} and ${uses[uses.length - 1]}` : uses[0] || 'everyone loves it';
  return `Fresh from the ${from}. ${u.charAt(0).toUpperCase()}${u.slice(1)}.`;
}
function foodStats(f) {
  const s = [];
  if (f.kind === 'bag') s.push({ icon: 'coin', label: 'Bag', value: `${f.price}` }, { icon: 'food', label: 'Scoops', value: `${f.scoops}` });
  const F = f.fish || {};
  if (F.love) s.push({ icon: 'heart', label: 'Fish love', value: `+${Math.round(F.love * 100)}` });
  if (F.grow) s.push({ icon: 'bolt', label: 'Fry grow', value: `+${F.grow}s` });
  if (F.luck) s.push({ icon: 'clover', label: 'Luck', value: `+${Math.round(F.luck * 100)}%` });
  if (F.happy && s.length < 4) s.push({ icon: 'beauty', label: 'Happy', value: `+${Math.round(F.happy * 100)}` });
  if (f.bear) s.push({ icon: 'bear', label: 'Bear meal', value: `${f.bear.meal}${f.bear.coins ? ` +${f.bear.coins}c` : ''}` });
  if (f.beaver) s.push({ icon: 'beaver', label: 'Beaver', value: `${f.beaver.jobs} job${f.beaver.jobs > 1 ? 's' : ''}` });
  return s.slice(0, 5);
}
function bagArtFn(id, f) {
  return () => {
    if (typeof BAGS.bagCanvas === 'function') {
      try { const c = BAGS.bagCanvas(id, { scale: 1 }); if (c) return c; } catch { /* sketch */ }
    }
    return bagSketch(f);
  };
}
function foodChapter(game, S) {
  return Object.entries(FOOD_ITEMS).map(([id, f], i) => {
    const known = S.food.has(id) || (f.kind === 'bag' && f.unlock === 'start' && id === 'pellets');
    const bag = f.kind === 'bag' || f.kind === 'made';
    const plant = f.from ? structName(f.from) : null;
    const sub = bag ? `${f.brand || 'House brand'} · "${f.tagline || 'Yum!'}"` : f.kind === 'special' ? `Lucky find · ${plant}` : `Garden produce · ${plant}`;
    const how = f.kind === 'bag' ? `${unlockText(f.unlock).replace('Available from day one', 'Sold on e-Buy').replace('Unlocks on', 'e-Buy from')}` : f.kind === 'made' ? 'Build a Bug Grinder 3000' : f.kind === 'special' ? `Hides in lucky batches of ${plant}` : `Harvest a ${plant}`;
    const r = f.kind === 'special' ? rarityOfTier(f.rarity || 2) : bag ? rarityOfTier(clamp(Math.floor((f.price || 0) / 45), 0, 4)) : rarityOfTier(0);
    return {
      id, num: i + 1, name: f.name, sub, desc: foodDesc(id, f), known,
      art: lazyArt(`food:${id}`, bag ? bagArtFn(id, f) : () => iconArt(f.icon) || natArt(CROPS[f.from]?.stages?.[3]) || natArt(STRUCTURES[f.from]?.sprite?.[0]) || plantSketch(f.pellet?.[0])),
      silhouette: true, rarity: r, stats: foodStats(f), variants: [],
      how, hint: how,
      note: f.kind === 'special' ? 'Lucky!' : bag ? pickBy(id, ['Stock up!', 'Fish go wild.', 'Read the label.']) : pickBy(id, ['Yum.', 'Fresh!', 'Bears love a side dish.']),
      plate: 'table', bag, kind: f.kind, colors: f.colors || null,
    };
  });
}

// ===========================================================================
// VILLAGERS
// ===========================================================================
function villagerChapter(game, S) {
  const st = game?.state || {};
  const out = [{
    id: 'reynard', num: 1, name: 'Reynard Fox', sub: 'Esq. · Proprietor & author', known: true,
    desc: 'Owner of the All-U-Can-Eat Pond. Greedy, handsome, and humble (the greatest fox alive).',
    art: lazyArt('vil:reynard', () => iconArt('fox_smug') || iconArt('fox')), silhouette: false,
    rarity: { name: 'One of a kind', color: '#e8702c', tier: 4 },
    stats: [{ icon: 'home', label: 'Home', value: 'The pond' }, { icon: 'tophat', label: 'Wears', value: 'Top hat' }, { icon: 'coin', label: 'Loves', value: 'Coins' }],
    variants: [], quote: 'Heh heh heh. Business is GOOD.', perks: [], how: 'You!', hint: '', note: 'Me! Magnificent.', plate: 'cameo', hearts: 5, portrait: 'fox',
  }];
  ZONES.forEach((Z) => {
    const n = Z.npc;
    const known = S.zones.has(Z.id);
    const V = st.villagers?.[n.id] || {};
    out.push({
      id: n.id, num: out.length + 1, name: n.name, sub: n.title, known,
      desc: `${Z.sub}. Lives at ${Z.name}.`,
      art: lazyArt(`vil:${n.id}`, () => (typeof VCARD.villagerPortrait === 'function' ? VCARD.villagerPortrait(n.id, { scale: 1 }) : null)), silhouette: true,
      rarity: { name: 'Neighbour', color: n.color || '#6a5a8a', tier: 2 },
      stats: [
        { icon: 'map', label: 'Home', value: Z.name },
        { icon: 'heart', label: 'Friendship', value: `${V.hearts || 0}/5` },
        { icon: 'sparkle', label: 'Unlocks', value: `${Z.unlocks.length}` },
      ],
      variants: [], quote: Z.intro?.[0] || '', perks: Z.unlocks.map((u) => ({ icon: u.icon, title: u.title })),
      how: `Clear the forest fog around ${Z.name}`, hint: `Clear the fog around ${Z.name}`,
      note: pickBy(n.id, ['Good neighbour.', 'Owes me a favour.', 'Bring snacks.']), plate: 'cameo', hearts: V.hearts || 0,
    });
  });
  return out;
}

// ===========================================================================
// TROPHIES
// ===========================================================================
const TROPHY_EMBLEM = {
  a_first: 'food', a_love: 'heart', a_full: 'fish', a_happy10: 'star', a_research5: 'flask', a_hybrid: 'dna', a_golden: 'fish_gold',
  a_dams: 'dam', a_big: 'pond', a_rating: 'star', a_ceo: 'necktie', a_week: 'calendar', a_rich: 'coins', a_month: 'crown', a_dex: 'book',
};
export const trophyTier = (reward) => (reward <= 40 ? 0 : reward <= 150 ? 1 : reward <= 500 ? 2 : 3);
function trophyChapter(game, S) {
  return ACHIEVEMENTS.map((a, i) => {
    const done = S.achievements.has(a.id);
    const tier = trophyTier(a.reward);
    return {
      id: a.id, num: i + 1, name: a.name, sub: ['Bronze medal', 'Silver medal', 'Golden cup', 'Grand cup'][tier], desc: a.desc, known: done, done,
      art: lazyArt(`trophy:${a.id}:${done ? 1 : 0}`, () => medalArt(tier, TROPHY_EMBLEM[a.id] || 'star', done)), silhouette: false,
      rarity: rarityOfTier([0, 2, 3, 4][tier]),
      stats: [{ icon: 'coin', label: 'Reward', value: `+${a.reward}` }],
      variants: [], how: a.desc, hint: a.desc, reward: a.reward, tier, plate: 'velvet',
      note: done ? 'Nailed it.' : 'Soon...',
    };
  });
}

// ===========================================================================
// build
// ===========================================================================
const BUILDERS = { fish: fishChapter, morphs: morphChapter, birds: birdChapter, bugs: bugChapter, livestock: livestockChapter, land: landChapter, plants: plantChapter, foods: foodChapter, villagers: villagerChapter, trophies: trophyChapter };

export function buildEncyclopedia(game, { seen } = {}) {
  const S = readKnown(game);
  const last = seen || game?.state?.dexSeen || null;
  const prevMorphs = last?._morphs ? new Set(last._morphs) : null;
  const chapters = [];
  let known = 0, total = 0;
  for (const C of CHAPTERS) {
    let entries = [];
    try { entries = BUILDERS[C.id](game, S) || []; } catch (e) { console.warn('encyclopedia chapter', C.id, e); entries = []; }
    const prev = last?.[C.id] ? new Set(last[C.id]) : null;
    for (const e of entries) {
      e.chapter = C.id;
      e.isNew = !!e.known && !(prev && prev.has(e.id));
      // a morph seen for the first time on a fish you already knew
      for (const v of e.variants || []) v.isNew = !!(v.known && C.id === 'fish' && v.id !== 'normal' && !(prevMorphs && prevMorphs.has(`${e.id}:${v.id}`)));
    }
    const k = entries.filter((e) => e.known).length;
    chapters.push({ ...C, entries, known: k, total: entries.length });
    known += k; total += entries.length;
  }
  return { chapters, known, total, day: game?.state?.day || 1, memo: S };
}

// remember what the player knows right now
export function commitDexSeen(game, book) {
  const st = game?.state;
  if (!st || !book) return;
  const seen = {};
  for (const c of book.chapters) seen[c.id] = c.entries.filter((e) => e.known).map((e) => e.id);
  seen._morphs = [...(st.morphsSeen || [])];
  st.dexSeen = seen;
  const S = book.memo;
  if (!S) return;
  const mutOn = [];
  for (const [m, set] of S.mutOn) for (const sp of set) mutOn.push(`${sp}:${m}`);
  st.dexLog = { mut: [...S.mut], mutOn, breeds: [...S.breeds], tame: [...S.tame], built: [...S.built] };
}

// ===========================================================================
// entry art: mutations, medals, sketches
// ===========================================================================
const tintc = (c, t) => [clamp(c[0] * t[0], 0, 255), clamp(c[1] * t[1], 0, 255), clamp(c[2] * t[2], 0, 255)].map(Math.round);
const lumc = (c) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;

// a fish with its mutation's tint, size and particle effect painted in
export function mutationArt(mut, speciesId = 'bluegill') {
  const M = MUTATIONS[mut] || {};
  const src = fishCanvasFor(speciesId, { scale: 1 });
  if (!src) return null;
  const k = mut === 'titan' ? 2 : 1;
  const fw = src.width * k, fh = src.height * k;
  const P = mut === 'tiny' ? Math.round(src.width * 0.45) : 9;
  const W = fw + P * 2, H = fh + P * 2 + (mut === 'hot' || mut === 'doublehot' ? 6 : 0);
  const p = new Pix(W, H);
  const ox = P, oy = H - P - fh;
  const t = M.tint || [1, 1, 1];
  const sd = ctx2d(src).getImageData(0, 0, src.width, src.height).data;
  const body = [];
  const R = (n) => hash(n, 3, strHash(mut + speciesId));
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    const i = ((y / k | 0) * src.width + (x / k | 0)) * 4;
    if (sd[i + 3] < 128) continue;
    let c = tintc([sd[i], sd[i + 1], sd[i + 2]], t);
    if (mut === 'galaxy') {
      const L = lumc(c);
      c = mixc(hexc('#1a1240'), hexc('#7a5ae0'), clamp(L * 1.3, 0, 1));
      if (hash(x, y, 77) < 0.06 && L > 0.15) c = [255, 255, 240];
    }
    if (mut === 'zombie' && hash(x, y, 5) < 0.08) c = mixc(c, hexc('#3a5a20'), 0.5);
    p.set(ox + x, oy + y, c);
    body.push([ox + x, oy + y]);
  }
  const top = new Map();
  for (const [x, y] of body) if (!top.has(x) || y < top.get(x)) top.set(x, y);
  const xs = [...top.keys()].sort((a, b) => a - b);
  const star = (cx, cy, c, big = false) => {
    p.set(cx, cy, c);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(cx + dx, cy + dy, c);
    if (big) for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) p.set(cx + dx, cy + dy, mixc(c, [255, 255, 255], 0.4));
  };
  const fx = M.fx;
  if (fx === 'frost') {
    for (const x of xs) if (hash(x, 1, 9) < 0.5) p.set(x, top.get(x), [236, 250, 255]);
    for (let n = 0; n < 6; n++) star(Math.round(2 + R(n) * (W - 4)), Math.round(1 + R(n + 9) * (P - 2)), [200, 240, 255], n % 2 === 0);
    for (let n = 0; n < 4; n++) { const x = ox + Math.round(fw * (0.25 + n * 0.17)); for (let d = 0; d < 2 + (n % 2); d++) p.set(x, oy + fh + d, [170, 225, 255]); }
  } else if (fx === 'sprinkles') {
    const cols = ['#ff6aa8', '#ffe070', '#6ad8ff', '#ffffff', '#9aff8a'].map(hexc);
    body.forEach(([x, y], n) => { if (hash(x, y, 31) < 0.09) p.set(x, y, cols[n % cols.length]); });
    for (let n = 0; n < 8; n++) p.set(Math.round(R(n) * W), Math.round(R(n + 20) * (P - 1)), cols[n % cols.length]);
  } else if (fx === 'flame' || fx === 'bigflame') {
    const big = fx === 'bigflame';
    const F = ['#a01a0a', '#e8401a', '#ff8a1a', '#ffd23a', '#fff6c0'].map(hexc);
    for (const x of xs) {
      if (hash(x, 2, 4) > (big ? 0.7 : 0.45)) continue;
      const y0 = top.get(x), hgt = Math.round((big ? 5 : 3) + hash(x, 5, 4) * (big ? 5 : 3));
      for (let d = 1; d <= hgt; d++) p.set(x, y0 - d, F[clamp(Math.floor((d / hgt) * 5), 0, 4)]);
    }
    if (big) for (let n = 0; n < 5; n++) p.set(Math.round(R(n) * W), Math.round(R(n + 5) * 3), [120, 110, 110]);
  } else if (fx === 'stink') {
    const G = hexc('#7ac040');
    for (let n = 0; n < 3; n++) {
      const x0 = ox + Math.round(fw * (0.25 + n * 0.25));
      for (let d = 0; d < P - 1; d++) p.set(x0 + Math.round(Math.sin(d * 0.9 + n) * 1.2), oy - 2 - d, G);
    }
    p.set(ox + fw - 2, oy - 5, [30, 30, 30]); p.set(ox + 3, oy - 7, [30, 30, 30]);
  } else if (fx === 'sparkle') {
    for (let n = 0; n < 6; n++) star(Math.round(2 + R(n) * (W - 4)), Math.round(R(n + 7) < 0.5 ? 2 + R(n + 3) * (P - 3) : H - 2 - R(n + 3) * (P - 3)), [255, 248, 190], n % 3 === 0);
    body.forEach(([x, y]) => { if (hash(x, y, 61) < 0.05) p.set(x, y, [255, 255, 230]); });
  } else if (fx === 'stomp') {
    const D = hexc('#b8a078');
    for (let n = 0; n < 5; n++) { const x = ox + Math.round(fw * (0.1 + n * 0.2)); p.set(x, H - 2, D); p.set(x - 1, H - 1, D); p.set(x + 1, H - 1, D); }
    for (const [x0, dir] of [[ox - 2, -1], [ox + fw + 1, 1]]) for (let d = 0; d < 3; d++) p.set(x0 + dir * d, oy + fh - 3 - d * 2, D);
  } else if (fx === 'wow') {
    const WOW = ['#.#.###.#.#', '#.#.#.#.#.#', '#.#.#.#.#.#', '###.#.#.###', '#.#.###.#.#'];
    const cx = Math.max(0, W - 13), cy = 1;
    WOW.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') p.set(cx + x, cy + y, hexc(y % 2 ? '#ff6aa8' : '#ffe040')); }));
    star(3, 3, [255, 240, 160]);
  } else if (fx === 'stars') {
    for (let n = 0; n < 9; n++) star(Math.round(1 + R(n) * (W - 2)), Math.round(1 + R(n + 11) * (H - 2)), n % 2 ? [190, 170, 255] : [255, 255, 255], n % 4 === 0);
  } else if (mut === 'tiny') {
    // a little ruler tick under it
    const C = hexc('#8a7a60');
    for (let x = ox; x < ox + fw; x++) p.set(x, H - 2, C);
    p.set(ox, H - 3, C); p.set(ox + fw - 1, H - 3, C);
  }
  // body pixels keep their outline from the source; fx pixels get none (they're light)
  return p.canvas();
}

const METAL = {
  bronze: ['#3a1a08', '#6a3618', '#9a5a2a', '#c8823e', '#e8aa6a', '#fbd8a8'],
  silver: ['#30343e', '#5a6070', '#8a92a4', '#b8bfd0', '#e2e6f0', '#ffffff'],
  gold: ['#4a2806', '#80480c', '#b8801a', '#e2ae2c', '#ffd85a', '#fff4b8'],
}; for (const k in METAL) METAL[k] = METAL[k].map(hexc);
const SKETCH = ['#6a5a48', '#9a8a70', '#c4b494', '#ddd0b0'].map(hexc);
// a medal (tier 0-1) or a cup (tier 2-3) with an embossed emblem
export function medalArt(tier, emblem, done = true) {
  const W = 40, H = 48, p = new Pix(W, H);
  const metal = done ? (tier === 0 ? METAL.bronze : tier === 1 ? METAL.silver : METAL.gold) : null;
  const sk = (v) => SKETCH[clamp(Math.round(v), 0, 3)];
  const shade = (nx, ny, x, y, bias = 0) => {
    const v = 2.6 + (-nx * 0.9 - ny * 1.1) * 1.4 + bias;
    return metal ? metal[dq(v, x, y, 6)] : (bayer(x, y) < 0.5 ? sk(2) : sk(3));
  };
  if (tier <= 1) {
    // ribbon: two crossing tails
    const rc = done ? (tier === 0 ? ['#1f4a8a', '#2f6fb0', '#5a9ae0'] : ['#7a1a22', '#b0303a', '#e06a62']).map(hexc) : [sk(1), sk(2), sk(3)];
    for (let y = 0; y < 22; y++) {
      for (let k = 0; k < 7; k++) {
        const xl = 9 + Math.round(y * 0.34) + k, xr = 30 - Math.round(y * 0.34) - k;
        const c = k === 0 || k === 6 ? rc[0] : k === 3 ? rc[2] : rc[1];
        p.set(xl, y, c); p.set(xr, y, c);
      }
    }
    // the disc
    const cx = 19.5, cy = 31, r = 13;
    p.ell(cx, cy, r, r, (x, y, nx, ny) => {
      const d = Math.hypot(nx, ny);
      if (d > 0.86) return shade(nx, ny, x, y, d > 0.95 ? -1 : 0.6);
      if (d > 0.76) return shade(-nx, -ny, x, y, -0.6);
      return shade(nx * 0.4, ny * 0.4, x, y, 0.1);
    });
    // little loop on top
    p.ell(cx, cy - r - 1, 2.5, 2, (x, y, nx, ny) => (Math.hypot(nx, ny) > 0.45 ? shade(nx, ny, x, y) : null));
    emboss(p, emblem, Math.round(cx - 8), Math.round(cy - 8), metal);
  } else {
    // cup: bowl, handles, stem, foot, plinth
    const grand = tier === 3;
    const cx = 19.5, bowlTop = grand ? 9 : 11, bowlR = grand ? 13 : 11, bowlH = grand ? 16 : 14;
    for (let y = bowlTop; y < bowlTop + bowlH; y++) {
      const t = (y - bowlTop) / bowlH;
      const hw = bowlR * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, t - 0.15) / 0.85, 2)));
      for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
        const nx = (x - cx) / (bowlR + 0.5), ny = t * 1.2 - 0.6;
        p.set(x, y, shade(nx, ny * 0.5, x, y, 0.3));
      }
    }
    // rim
    for (let x = Math.floor(cx - bowlR - 1); x <= Math.ceil(cx + bowlR + 1); x++) p.set(x, bowlTop - 1, metal ? metal[x < cx - 3 ? 5 : 4] : sk(1));
    // handles
    for (const s of [-1, 1]) {
      for (let a = 0; a < 12; a++) {
        const ang = -Math.PI / 2 + (a / 11) * Math.PI;
        const x = cx + s * (bowlR + 1 + Math.cos(ang) * 4.5), y = bowlTop + 5 + Math.sin(ang) * 4.5;
        p.set(x, y, shade(s * 0.5, Math.sin(ang), Math.round(x), Math.round(y)));
        p.set(x + s, y, shade(s, Math.sin(ang), Math.round(x), Math.round(y), -0.8));
      }
    }
    const stemY = bowlTop + bowlH;
    for (let y = stemY; y < stemY + 6; y++) { const hw = y < stemY + 2 ? 2.5 : 1.5; for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) p.set(x, y, shade((x - cx) / 3, 0, x, y)); }
    const footY = stemY + 6;
    for (let y = footY; y < footY + 4; y++) { const hw = 4 + (y - footY) * 1.6; for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) p.set(x, y, shade((x - cx) / (hw + 1), -0.3, x, y, y === footY ? 0.6 : 0)); }
    // plinth
    const wood = done ? ['#2e1a0c', '#4a2c16', '#6b4220', '#8b5a2b'].map(hexc) : [sk(0), sk(1), sk(2), sk(2)];
    const plY = footY + 4;
    for (let y = plY; y < Math.min(H, plY + 7); y++) for (let x = 7; x < 33; x++) {
      const edge = y === plY || x === 7 || x === 32;
      p.set(x, y, edge ? wood[3] : wood[dq(1.4 + (y === plY + 1 ? 1 : 0), x, y, 3)]);
    }
    if (metal) for (let x = 14; x < 26; x++) for (let y = plY + 2; y < plY + 5; y++) p.set(x, y, metal[y === plY + 2 ? 5 : 3]);
    emboss(p, emblem, Math.round(cx - 8), bowlTop + 1, metal);
    if (grand) {
      // a star finial and two gems
      const st = metal ? metal[5] : sk(1);
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0, -2], [2, 1], [-2, 1]]) p.set(cx + dx, 4 + dy, st);
      if (metal) { p.set(cx - 7, bowlTop + bowlH - 4, hexc('#e83a4a')); p.set(cx + 7, bowlTop + bowlH - 4, hexc('#3a8ae8')); }
    }
  }
  p.outline(done ? 0.62 : 0.3, done ? [34, 18, 12] : [110, 96, 78]);
  if (done) {
    // twinkles
    p.set(6, 6, [255, 255, 255]); p.set(5, 6, [255, 240, 180]); p.set(7, 6, [255, 240, 180]); p.set(6, 5, [255, 240, 180]); p.set(6, 7, [255, 240, 180]);
  }
  return p.canvas();
}
function emboss(p, name, x0, y0, metal) {
  const ic = iconArt(name);
  if (!ic) return;
  const d = ctx2d(ic).getImageData(0, 0, ic.width, ic.height).data;
  const w = ic.width, h = ic.height;
  const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (A(x, y) < 128) continue;
    // only the inner shape (drop the icon's own dark outline ring)
    const edge = A(x - 1, y) < 128 || A(x + 1, y) < 128 || A(x, y - 1) < 128 || A(x, y + 1) < 128;
    if (edge) continue;
    const tx = x0 + x * (16 / w), ty = y0 + y * (16 / h);
    if (!p.a(tx, ty)) continue;
    if (metal) {
      const c = [d[(y * w + x) * 4], d[(y * w + x) * 4 + 1], d[(y * w + x) * 4 + 2]];
      const L = lumc(c);
      p.set(tx, ty, metal[clamp(Math.round(1 + L * 3.2), 1, 4)]);
      if (A(x - 1, y - 1) < 128) p.set(tx, ty, metal[5]);
    } else p.set(tx, ty, SKETCH[1]);
  }
}

// an artist's placeholder sketch for an animal whose sprite isn't drawn yet
const SK_RABBIT = [
  '..........aa....',
  '.........abba...',
  '.........abba.a.',
  '..........abaab.',
  '...........aaba.',
  '.....aaaaaaabbka',
  '...aabbbbbbbbbba',
  '..abbbbbbbbbbba.',
  '.abbbbbbbbbbbba.',
  'aabbbbbbbbbbba..',
  'abbbbbbbbbbbba..',
  '.abbbbbbbbbba...',
  '..aabba..abba...',
  '....aa....aa....',
];
const SK_RODENT = [
  '.aaa............',
  'abbba...........',
  'abbbba..........',
  'abbbbba...aaaa..',
  '.abbbba.aabbbba.',
  '..abbbaabbbbbkba',
  '...abbbbbbbbbbba',
  '..abbbbbbbbbbba.',
  '..abbbbbbbbbba..',
  '...aabba.abba...',
  '.....aa...aa....',
];
const SK_COLORS = { cottontail: '#a08060', snowshoe: '#9a7a5a', jackrabbit: '#b09a78', chipmunk: '#b0703a', redsquirrel: '#c0602a', deermouse: '#8a6a4a', vole: '#7a5a3a', groundhog: '#8a6a40', muskrat: '#5a4030', porcupine: '#4a3a2a', skunk: '#2a2a30', flyingsquirrel: '#9a8a7a', pika: '#a09070', lemming: '#a07a50', lop: '#d8c0a0', dutch: '#2a2a2a', lionhead: '#e0c890' };
export function critterSketch(a) {
  const rows = a.kind === 'rabbit' || a.id === 'pika' ? SK_RABBIT : SK_RODENT;
  const base = hexc(SK_COLORS[a.id] || '#8a6a4a');
  const p = new Pix(rows[0].length + 2, rows.length + 2);
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === 'b') p.set(x + 1, y + 1, mixc(base, [255, 240, 210], y < rows.length / 2 ? 0.18 : 0));
    else if (ch === 'k') p.set(x + 1, y + 1, [20, 14, 10]);
  }));
  if (a.id === 'skunk') for (let x = 3; x < 13; x++) p.set(x, 7, [240, 240, 240]);
  if (a.id === 'chipmunk') for (let x = 5; x < 12; x++) p.set(x, 7, [60, 36, 20]);
  p.outline(0.6);
  return p.canvas();
}
// a generic fruit/veg for produce whose icon isn't drawn yet
export function plantSketch(pellet = 0x6ac04a) {
  const c = hexc('#' + (pellet >>> 0).toString(16).padStart(6, '0'));
  const p = new Pix(16, 16);
  p.ell(8, 9.5, 5.5, 5, (x, y, nx, ny) => mixc(c, nx + ny < -0.6 ? [255, 255, 230] : [30, 20, 40], nx + ny < -0.6 ? 0.35 : clamp((nx + ny) * 0.25, 0, 0.4)));
  p.rows(6, 1, ['..gg', '.gG.', 'gG..', '.g..'], { g: hexc('#2f7a3a'), G: hexc('#6cc04a') });
  p.outline(0.6);
  return p.canvas();
}
// a fish-food bag sketch from its packaging colours
export function bagSketch(f) {
  const C = f.colors || { main: '#c8a060', accent: '#fff4d8', dark: '#4a3020', trim: '#ffd23a' };
  const main = hexc(C.main), acc = hexc(C.accent), dark = hexc(C.dark), trim = hexc(C.trim);
  const W = 26, H = 32, p = new Pix(W, H);
  for (let y = 3; y < H - 1; y++) {
    const inset = y < 6 ? 2 : y > H - 4 ? 1 : 0;
    for (let x = 2 + inset; x < W - 2 - inset; x++) {
      const nx = (x - W / 2) / (W / 2);
      let c = mixc(main, nx < -0.45 ? [255, 250, 230] : [20, 10, 30], nx < -0.45 ? 0.18 : clamp(nx * 0.3, 0, 0.3));
      if (y === 6 || y === 7) c = trim;
      p.set(x, y, c);
    }
  }
  for (let x = 2; x < W - 2; x++) if (x % 2) p.set(x, 2, main); // crimped top
  p.rect(6, 11, 14, 11, acc);
  p.ell(13, 16, 4, 3.5, (x, y, nx, ny) => (nx + ny < -0.5 ? mixc(main, [255, 255, 255], 0.3) : main));
  p.set(12, 15, dark); p.set(14, 15, dark);
  const pel = (f.pellet || [0xb8742e]).map((v) => hexc('#' + (v >>> 0).toString(16).padStart(6, '0')));
  for (let n = 0; n < 6; n++) p.set(6 + n * 3, 25 + (n % 2), pel[n % pel.length]);
  p.outline(0.65);
  return p.canvas();
}

export const encArt = { Pix, hexc, mixc, hash, strHash, bayer, dq, mkCanvas, scaled, natArt, iconArt, clamp, foxPortraitURL };
