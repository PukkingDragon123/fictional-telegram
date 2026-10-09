// [v26 seasons] How seasons and weather change fish and crops.
//
// Fish: every species has a water preference (cold / cool / warm). Spring is
// spawning time (breeding boost), summer is lively, autumn is a feeding
// frenzy, winter is sluggish (slow, deep, barely breeding, eating little).
// Cold-water fish (trout, char, grayling, salmon...) are happy in the cold and
// sulk in summer heat; warm-water fish (bass, sunfish...) sulk in winter.
// A few eggs are only sold in their season (salmon in the autumn run...).
//
// Crops: a growth multiplier per season (0 = dormant), tender crops are killed
// by hard frost unless a Greenhouse covers them.

export const COLD_FISH = new Set(['brook', 'rainbow', 'laketrout', 'grayling', 'char', 'whitefish', 'sockeye', 'chinook', 'burbot', 'cisco', 'bulltrout', 'cutthroat', 'coho', 'pinksalmon', 'kokanee', 'browntrout', 'goldentrout', 'splake', 'tiger', 'aurora', 'sparctic', 'sabertooth']);
export const WARM_FISH = new Set(['bluegill', 'pumpkinseed', 'goldfish', 'smallmouth', 'bass', 'crappie', 'rockbass', 'bullhead', 'catfish', 'bowfin', 'gar', 'sunperch', 'goldseed', 'bassgill', 'drum', 'paddlefish', 'eel']);
export const SALMON = new Set(['sockeye', 'chinook', 'coho', 'pinksalmon', 'kokanee', 'aurora', 'sabertooth']);

// spawning season of each species (its eggs are "in season" then: cheaper, a badge on e-Buy)
const SPAWN = {
  spring: ['walleye', 'pike', 'perch', 'grayling', 'rainbow', 'cutthroat', 'sturgeon', 'muskie', 'creekchub', 'dace', 'goldeye', 'tigermuskie', 'pikeeye'],
  summer: ['bluegill', 'pumpkinseed', 'bass', 'smallmouth', 'crappie', 'rockbass', 'catfish', 'bullhead', 'bowfin', 'gar', 'drum', 'goldfish', 'sunperch', 'goldseed', 'bassgill', 'paddlefish', 'goldentrout', 'eel'],
  autumn: ['brook', 'browntrout', 'laketrout', 'char', 'bulltrout', 'sockeye', 'chinook', 'coho', 'pinksalmon', 'kokanee', 'whitefish', 'cisco', 'splake', 'tiger', 'aurora', 'sparctic', 'sabertooth'],
  winter: ['burbot', 'cisco'],
};
export const SPAWN_SEASON = {};
for (const [s, ids] of Object.entries(SPAWN)) for (const id of ids) (SPAWN_SEASON[id] ||= []).push(s);
// eggs only sold in these seasons (everything else: all year)
export const EGG_SEASONS = {
  sockeye: ['summer', 'autumn'], chinook: ['summer', 'autumn'], coho: ['summer', 'autumn'], pinksalmon: ['summer', 'autumn'], kokanee: ['summer', 'autumn'],
  burbot: ['autumn', 'winter'], grayling: ['spring', 'summer'], goldentrout: ['spring', 'summer'],
};

const SEASON_FISH = {
  spring: { appetite: 1.0, breed: 1.5, speed: 1.0, depth: 0 },
  summer: { appetite: 1.1, breed: 1.0, speed: 1.12, depth: 0 },
  autumn: { appetite: 1.45, breed: 0.8, speed: 1.02, depth: 0 },
  winter: { appetite: 0.5, breed: 0.25, speed: 0.62, depth: -0.16 },
};

export function waterPref(id) { return COLD_FISH.has(id) ? 'cold' : WARM_FISH.has(id) ? 'warm' : 'cool'; }

// -> { appetite, breed, speed, depth, available, inSeason, mood: 'happy' | 'sulk' | null }
export function fishModFor(id, season, weather, temp) {
  const B = SEASON_FISH[season] || SEASON_FISH.spring;
  let { appetite, breed, speed, depth } = B;
  let mood = null;
  const pref = waterPref(id);
  const hot = weather === 'heat' || temp >= 27;
  if (pref === 'cold') {
    if (season === 'winter') { appetite *= 1.6; breed *= 2.4; speed *= 1.4; depth += 0.1; mood = 'happy'; }
    else if (season === 'summer' || hot) { appetite *= 0.75; breed *= 0.65; speed *= 0.85; depth -= 0.12; mood = 'sulk'; }
    if (hot) { appetite *= 0.85; breed *= 0.8; }
  } else if (pref === 'warm') {
    if (season === 'winter') { appetite *= 0.85; breed *= 0.5; speed *= 0.85; mood = 'sulk'; }
    else if (season === 'summer') { appetite *= 1.1; breed *= 1.25; mood = 'happy'; }
    if (hot) appetite *= 1.1;
  }
  const inSeason = !!SPAWN_SEASON[id]?.includes(season);
  if (inSeason) breed *= 1.35;
  // the autumn salmon run: frenzied, leaping, in love
  if (season === 'autumn' && SALMON.has(id)) { appetite *= 1.15; breed *= 1.2; speed *= 1.1; mood = 'happy'; }
  // weather on the water: rain brings bugs (appetite), storms send fish deep
  if (weather === 'rain') appetite *= 1.1;
  else if (weather === 'storm') { speed *= 0.85; depth -= 0.06; }
  else if (weather === 'fog') speed *= 0.95;
  const avail = EGG_SEASONS[id];
  return {
    appetite: +appetite.toFixed(3), breed: +breed.toFixed(3), speed: +speed.toFixed(3), depth: +depth.toFixed(3),
    available: !avail || avail.includes(season), inSeason, mood, pref,
  };
}

// ------------------------------------------------------------------ crops
// growth multiplier by season [spring, summer, autumn, winter]; tender = hard frost kills it
export const CROP_SEASONS = {
  carrot: [1.2, 1.0, 1.15, 0.3],
  lettuce: [1.35, 0.75, 1.2, 0],
  radish: [1.3, 0.9, 1.2, 0.25],
  peas: [1.4, 0.8, 0.9, 0],
  potato: [1.1, 1.15, 1.1, 0],
  corn: [0.7, 1.45, 0.8, 0],
  sunflower: [0.8, 1.5, 0.7, 0],
  pumpkin: [0.6, 1.25, 1.5, 0],
  tomato: [0.8, 1.45, 0.75, 0],
  cabbage: [1.1, 0.85, 1.35, 0.4],
  berries: [0.9, 1.4, 0.9, 0],
  raspberry: [0.9, 1.4, 1.0, 0],
  strawberry: [1.4, 1.2, 0.6, 0],
  saskatoon: [1.0, 1.4, 0.8, 0],
  cranberry: [0.8, 1.0, 1.6, 0.15],
  cloudberry: [1.0, 1.3, 0.9, 0.2],
  elderberry: [0.9, 1.3, 1.2, 0],
  goldenberry: [0.7, 1.4, 1.1, 0],
  wildrice: [0.8, 1.3, 1.2, 0],
  mushrooms: [1.2, 0.9, 1.6, 0.3],
  beehive: [1.2, 1.4, 0.8, 0],
  maple: [1.8, 0.6, 0.8, 1.2],
};
export const TENDER = new Set(['lettuce', 'peas', 'corn', 'sunflower', 'pumpkin', 'tomato', 'strawberry', 'goldenberry']);
const SI = { spring: 0, summer: 1, autumn: 2, winter: 3 };

// what a season does to a crop, for cards and tips: 'peak' | 'good' | 'slow' | 'dormant'
export function cropSeasonWord(type, season) {
  const row = CROP_SEASONS[type];
  if (!row) return null;
  const k = row[SI[season] ?? 0];
  return k <= 0 ? 'dormant' : k >= 1.35 ? 'peak' : k >= 0.95 ? 'good' : 'slow';
}

export function cropModFor(type, season, weather, { greenhouse = false } = {}) {
  const row = CROP_SEASONS[type];
  let k = row ? row[SI[season] ?? 0] : season === 'winter' ? 0.3 : 1;
  if (greenhouse) k = season === 'winter' ? Math.max(k, 0.9) : k * 1.15;
  if (!greenhouse) {
    if (weather === 'rain') k *= 1.15;
    else if (weather === 'storm') k *= 0.9;
    else if (weather === 'heat') k *= 0.85;
  }
  return Math.max(0, +k.toFixed(3));
}
