// [v26 power] Power grid + physical storage builds and their research (pure data).
// Merged by src/data/structures.js / research.js (the src/data/ext/*.js hook).
//
// def.pw     read by src/game/ext/power.js
//   kind 'solar'   out = peak power in full sun (night 0, weaker in rain / snow / winter)
//   kind 'water'   out = base + flow x current speed; must stand on a flowing river tile (place 'river')
//   kind 'wind'    out = power at a normal breeze (game.wind)
//   kind 'battery' cap = stored power-seconds, rate = max charge / discharge per second
//   kind 'pole'    reach = tiles to the buildings it feeds, link = tiles to the next pole
// def.depot  read by src/game/ext/storage.js: { cap: units held, accepts: [kind 'ore'|'ingot'|'part' | res id | '*'] }
// Models: src/entities/extra/powerModels.js (+ storageModels.js), icons: src/ui/icons/powerIcons.js.
export const CATEGORIES = [
  { id: 'power', name: 'Power', icon: 'pw_bolt' },
  { id: 'storage', name: 'Storage', icon: 'st_crate' },
];

export const STRUCTURES = {
  pw_pole: {
    name: 'Power Pole', icon: 'pw_pole', cost: 15, res: { ingot_copper: 1 }, place: 'land', category: 'power', unlock: 'r_ind_power',
    desc: 'Strings a cable 8 tiles to the next pole. Powers every machine within 4 tiles.',
    hp: 99, smashable: false, pw: { kind: 'pole', reach: 4, link: 8 },
  },
  pw_solar: {
    name: 'Solar Panel', icon: 'pw_solar', cost: 180, res: { solar_cell: 2, plate: 1, wire: 1 }, place: 'land', category: 'power', unlock: 'r_pw_solar',
    desc: 'Up to 3 power in full sun. Nothing at night, less in rain, snow and winter.',
    hp: 99, smashable: false, pw: { kind: 'solar', out: 3 },
  },
  pw_waterwheel: {
    name: 'Water Wheel', icon: 'pw_water', cost: 160, res: { gear: 4, plate: 2, wire: 2 }, place: 'river', category: 'power', unlock: 'r_pw_water',
    desc: 'Goes in a flowing river next to your land. The faster the current, the more power. Day and night.',
    hp: 99, smashable: false, pw: { kind: 'water', base: 1.5, flow: 4 },
  },
  pw_wind: {
    name: 'Wind Turbine', icon: 'pw_wind', cost: 240, res: { motor: 1, plate: 3, wire: 3 }, place: 'land', category: 'power', unlock: 'r_pw_wind',
    desc: 'About 3.5 power in a breeze, more when it blows. Day and night.',
    hp: 99, smashable: false, pw: { kind: 'wind', out: 3.5 },
  },
  pw_battery: {
    name: 'Battery Bank', icon: 'pw_battery', cost: 200, res: { plate: 3, ingot_copper: 4, wire: 4 }, place: 'land', category: 'power', unlock: 'r_ind_power',
    desc: 'Banks the spare power from sunny afternoons and spends it at night.',
    hp: 99, smashable: false, blocksBear: true, pw: { kind: 'battery', cap: 360, rate: 6 },
  },
  st_warehouse: {
    name: 'Warehouse', icon: 'st_warehouse', cost: 220, res: { stone: 16 }, place: 'land', category: 'storage', unlock: 'r_st_storage', size: [2, 2], builder: 'beaver', buildTime: 10,
    desc: 'Holds 300 of anything: ore, ingots, parts. Crates stack up as it fills.',
    hp: 99, smashable: false, blocksBear: true, depot: { cap: 300, accepts: ['*'] },
  },
  st_partsrack: {
    name: 'Parts Rack', icon: 'st_partsrack', cost: 90, res: { ingot_iron: 2 }, place: 'land', category: 'storage', unlock: 'r_st_storage',
    desc: 'Steel shelves for 80 ingots and parts. Put one next to the machines.',
    hp: 99, smashable: false, depot: { cap: 80, accepts: ['ingot', 'part'] },
  },
  st_coalbunker: {
    name: 'Coal Bunker', icon: 'st_coalbunker', cost: 60, res: { stone: 8 }, place: 'land', category: 'storage', unlock: 'r_st_storage',
    desc: 'A concrete bin for 100 coal. Generators and smelters love a bunker nearby.',
    hp: 99, smashable: false, depot: { cap: 100, accepts: ['coal'] },
  },
  // never built from the menu: crates appear by themselves when there is nowhere else to put things
  st_pile: {
    name: 'Supply Pile', icon: 'st_pile', cost: 0, place: 'land', category: 'storage', unlock: 'r_never',
    desc: 'Crates and sacks under a tarp. Nobody built it: there was just nowhere else to put things.',
    hp: 99, smashable: false, depot: { cap: 60, accepts: ['*'], pile: true },
  },
};

// research: the Flint & Steel section (branch 'industry'), next to src/data/researchIndustry.js
export const RESEARCH = [
  { id: 'r_st_storage', branch: 'industry', name: 'Warehousing', icon: 'st_warehouse', time: 60, req: ['r_mine_pick'], build: ['st_warehouse', 'st_partsrack', 'st_coalbunker'],
    desc: 'Proper storage: a big Warehouse, Parts Racks and a Coal Bunker. Ore and parts live in buildings now. Tap one to look inside.' },
  { id: 'r_pw_water', branch: 'industry', name: 'Water Wheels', icon: 'pw_water', time: 150, req: ['r_ind_power'], build: 'pw_waterwheel',
    desc: 'A paddle wheel for the river. Free power day and night, as long as the water keeps running.' },
  { id: 'r_pw_assembly', branch: 'industry', name: 'Assembly Bench', icon: 'ind_assembly', time: 150, req: ['r_ind_shop'], build: 'ind_assembly',
    desc: 'A fitter\'s bench. Beavers put gears, wire and plates together into electric motors.' },
  { id: 'r_pw_wind', branch: 'industry', name: 'Wind Turbines', icon: 'pw_wind', time: 200, req: ['r_pw_assembly', 'r_ind_power'], build: 'pw_wind',
    desc: 'Three big blades on a tower. A motor run backwards makes power whenever the wind blows.' },
  { id: 'r_pw_circuit', branch: 'industry', name: 'Circuit Fab', icon: 'ind_circuitfab', time: 200, req: ['r_ind_shop'], build: 'ind_circuitfab',
    desc: 'A dust-free shed and a very steady paw. Wire, gold and crystal become circuits.' },
  { id: 'r_pw_solar', branch: 'industry', name: 'Solar Cells', icon: 'pw_solar', time: 240, req: ['r_pw_circuit', 'r_ind_power'], build: 'pw_solar',
    desc: 'Glass, wire and a circuit make a solar cell. Two cells make a panel. Sunshine makes money.' },
  { id: 'r_pw_apprentice', branch: 'industry', name: 'Beaver Apprentices', icon: 'ind_assembly', time: 220, req: ['r_pw_assembly'], mods: { indWorkSpeed: 0.2 },
    desc: 'Night classes at the Lodge. Beavers fabricate 20% faster and stop gluing their paws to the bench.' },
];
