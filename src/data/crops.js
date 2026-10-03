// Garden plants grow from seed: seed -> sprout -> growing -> ripe. A ripe plant
// shows its batch tag (rarity like fish eggs: rarer batches give more produce
// and can hide a special find). Tap to harvest; the plant regrows for the next
// batch (it skips the seed stage). Produce goes to the food inventory.
//
// CROPS[structureType] = {
//   item     produce id in FOOD_ITEMS
//   yield    [min, max] servings in a common batch
//   grow     seconds from seed to the first ripe batch
//   regrow   seconds from a harvest to the next ripe batch
//   special  FOOD_ITEMS id that lucky batches can hide
//   stages   nature-atlas sprite per stage [seed, sprout, growing, ripe]
//   noSeed   not a plant (beehive, maple tap): no seed / sprout stages
// }
export const CROP_STAGES = ['seed', 'sprout', 'growing', 'ripe'];
export const STAGE_NAMES = { seed: 'Seed', sprout: 'Sprout', growing: 'Growing', ripe: 'Ready!' };

// batch rarity (same names and colours as fish eggs: RARITIES in species.js)
export const BATCH_RARITY = [
  { id: 'common', w: 62, bonus: 0, special: 0 },
  { id: 'uncommon', w: 24, bonus: 1, special: 0.05 },
  { id: 'rare', w: 10, bonus: 2, special: 0.25 },
  { id: 'epic', w: 3.4, bonus: 3, special: 0.6 },
  { id: 'legendary', w: 0.6, bonus: 5, special: 1 },
];

const seedStages = (growing, ripe) => ['crop_seed', 'crop_sprout', growing, ripe];

export const CROPS = {
  // vegetables (new garden plots)
  carrot: { item: 'carrot', yield: [3, 5], grow: 55, regrow: 40, special: 'golden_carrot', stages: seedStages('crop_carrot_grow', 'crop_carrot_ripe') },
  lettuce: { item: 'lettuce', yield: [2, 4], grow: 40, regrow: 30, special: 'clover', stages: seedStages('crop_lettuce_grow', 'crop_lettuce_ripe') },
  radish: { item: 'radish', yield: [3, 4], grow: 30, regrow: 24, special: 'clover', stages: seedStages('crop_radish_grow', 'crop_radish_ripe') },
  peas: { item: 'peas', yield: [3, 6], grow: 60, regrow: 40, special: 'clover', stages: seedStages('crop_peas_grow', 'crop_peas_ripe') },
  potato: { item: 'potato', yield: [3, 5], grow: 70, regrow: 50, special: 'golden_carrot', stages: seedStages('crop_potato_grow', 'crop_potato_ripe') },
  corn: { item: 'corn', yield: [2, 4], grow: 80, regrow: 55, special: 'rainbow_corn', stages: seedStages('crop_corn_grow', 'crop_corn_ripe') },
  sunflower: { item: 'sunflower', yield: [3, 5], grow: 75, regrow: 55, special: 'sun_seed', stages: seedStages('crop_sunflower_grow', 'crop_sunflower_ripe') },
  pumpkin: { item: 'pumpkin', yield: [1, 2], grow: 110, regrow: 80, special: 'giant_pumpkin', stages: seedStages('crop_pumpkin_grow', 'crop_pumpkin_ripe') },
  tomato: { item: 'tomato', yield: [3, 5], grow: 65, regrow: 42, special: 'clover', stages: seedStages('crop_tomato_grow', 'crop_tomato_ripe') },
  cabbage: { item: 'cabbage', yield: [2, 3], grow: 75, regrow: 50, special: 'clover', stages: seedStages('crop_cabbage_grow', 'crop_cabbage_ripe') },
  // berry bushes (existing sprites: "<name>_picked" = growing, "<name>" = ripe)
  berries: { item: 'blueberry', yield: [3, 5], grow: 60, regrow: 42, special: 'moonberry', stages: seedStages('blueberry_picked', 'blueberry') },
  raspberry: { item: 'raspberry', yield: [3, 6], grow: 60, regrow: 40, special: 'moonberry', stages: seedStages('raspberry_picked', 'raspberry') },
  strawberry: { item: 'strawberry', yield: [2, 4], grow: 40, regrow: 28, special: 'moonberry', stages: seedStages('strawberry_picked', 'strawberry') },
  saskatoon: { item: 'saskatoon', yield: [4, 6], grow: 70, regrow: 45, special: 'moonberry', stages: seedStages('saskatoon_picked', 'saskatoon') },
  cranberry: { item: 'cranberry', yield: [4, 7], grow: 65, regrow: 40, special: 'moonberry', stages: seedStages('cranberry_picked', 'cranberry') },
  cloudberry: { item: 'cloudberry', yield: [3, 5], grow: 75, regrow: 50, special: 'moonberry', stages: seedStages('cloudberry_picked', 'cloudberry') },
  elderberry: { item: 'elderberry', yield: [4, 6], grow: 65, regrow: 45, special: 'moonberry', stages: seedStages('elderberry_picked', 'elderberry') },
  goldenberry: { item: 'goldenberry', yield: [3, 5], grow: 80, regrow: 40, special: 'moonberry', stages: seedStages('goldenberry_picked', 'goldenberry') },
  // other snacks
  wildrice: { item: 'wildrice', yield: [3, 5], grow: 60, regrow: 45, special: 'pearl_rice', stages: ['crop_seed_water', 'wildriceplot', 'wildriceplot', 'wildrice'] },
  mushrooms: { item: 'chanterelle', yield: [2, 4], grow: 70, regrow: 50, special: 'truffle', stages: ['mushlog_bare', 'mushlog_bare', 'mushlog_bare', 'mushlog'] },
  beehive: { item: 'honey', yield: [2, 3], grow: 70, regrow: 55, special: 'royal_jelly', noSeed: true },
  maple: { item: 'syrup', yield: [2, 3], grow: 85, regrow: 65, special: 'maple_gem', noSeed: true },
};
export const CROP_TYPES = Object.keys(CROPS);

// crop growth multipliers from things nearby (see Harvest.js)
export const GROWTH_BOOSTS = {
  sprinkler: 0.6, // sprinkler within 3 tiles: +60%
  rabbithutch: 0.4, // tame bunnies fertilize within 3 tiles: +40%
  compost: 0.25, // compost heap within 3 tiles: +25%
};

// sprite per growth stage for every plant (filled in by the plant art modules,
// see src/art/extra/*: PLANT_STAGES). Falls back to CROPS[type].stages.
const stageMods = import.meta.glob('../art/extra/*.js', { eager: true });
export const PLANT_STAGES = {};
for (const m of Object.values(stageMods)) Object.assign(PLANT_STAGES, m.PLANT_STAGES || {});
export function stagesFor(type) { return PLANT_STAGES[type] || CROPS[type]?.stages || null; }
