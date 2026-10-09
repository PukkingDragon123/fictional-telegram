// [F&S industry] "Flint & Steel" industry builds: crafting machines, automation,
// power and the pollution clean-up kit. Merged into STRUCTURES by
// src/data/structures.js (import.meta.glob, optional) + a new 'industry' build tab.
// Models: src/entities/extra/industryModels.js. Behaviour: src/game/Industry.js.
// Research: src/data/researchIndustry.js (r_ind_* nodes, `unlock` = node id).
//
// `res`  crafted parts / ore paid on top of the coins (game.res = the storage buildings, see Game.placeStructure)
// `jobs` [v26 power] staff contract: a hired beaver with the 'fab' skill runs the machine
// `ind`  read by Industry.js:
//   kind 'craft'   [v26 power] fabrication: a beaver fetches the inputs from storage, works the
//                  machine (needs POWER from the grid, src/game/ext/power.js) and carries the
//                  product back to storage (src/game/industry/Fab.js). Job queue + keep-stocked.
//   kind 'power'   burns coal (else wood) from storage -> `out` power (only when its grid needs it)
//   kind 'belt'    conveyor: carries items one tile per ~0.8 s in its facing direction
//   kind 'loader'  pushes what the machine at the end of its belt needs, from the stockpile
//   kind 'feeder' | 'harvester' | 'hauler' | 'vending'   automation (needs power)
//   kind 'scrubber' | 'filter' | 'tree'                  clean-up: `clean` pollution points
//   power  power drawn (units) from the grid   pollute  pollution points while running
export const INDUSTRY_CATEGORY = { id: 'industry', name: 'Industry' };

export const STRUCTURES_INDUSTRY = {
  ind_smelter: {
    name: 'Smelter', icon: 'ind_smelter', cost: 180, res: { stone: 12 }, place: 'land', category: 'industry', unlock: 'r_ind_smelter', size: [2, 2],
    desc: 'Ore + coal in, ingots and glass out. A beaver runs it. Needs power. Smoky.',
    hp: 99, smashable: false, blocksBear: true,
    jobs: { slots: 1, skill: 'fab', title: 'Smelter Hand' }, // [v26 power]
    ind: { kind: 'craft', machine: 'smelter', power: 2, pollute: 14, fab: true },
  },
  ind_shop: {
    name: 'Machine Shop', icon: 'ind_shop', cost: 220, res: { stone: 8, ingot_iron: 4 }, place: 'land', category: 'industry', unlock: 'r_ind_shop', size: [2, 2],
    desc: 'Ingots in, gears, steel plates and copper wire out. A beaver runs it. Needs power.',
    hp: 99, smashable: false, blocksBear: true,
    jobs: { slots: 1, skill: 'fab', title: 'Machinist' }, // [v26 power]
    ind: { kind: 'craft', machine: 'shop', power: 2, pollute: 7, fab: true },
  },
  // [v26 power] the next two links of the parts chain (models: industryModels.js)
  ind_circuitfab: {
    name: 'Circuit Fab', icon: 'ind_circuitfab', cost: 300, res: { plate: 4, gear: 2, ingot_gold: 2 }, place: 'land', category: 'industry', unlock: 'r_pw_circuit', size: [2, 2],
    desc: 'A dust-free shed with a soldering iron. Wire, gold and crystal in: circuits and solar cells out.',
    hp: 99, smashable: false, blocksBear: true,
    jobs: { slots: 1, skill: 'fab', title: 'Solderer' },
    ind: { kind: 'craft', machine: 'circuitfab', power: 3, pollute: 3, fab: true },
  },
  ind_assembly: {
    name: 'Assembly Bench', icon: 'ind_assembly', cost: 200, res: { plate: 2, gear: 4, ingot_iron: 2 }, place: 'land', category: 'industry', unlock: 'r_pw_assembly', size: [2, 1],
    desc: 'A long workbench with a vice. Gears, wire and plates in: electric motors out.',
    hp: 99, smashable: false, blocksBear: true,
    jobs: { slots: 1, skill: 'fab', title: 'Fitter' },
    ind: { kind: 'craft', machine: 'assembly', power: 2, pollute: 2, fab: true },
  },
  ind_generator: {
    name: 'Steam Generator', icon: 'ind_generator', cost: 250, res: { stone: 10, iron: 6 }, place: 'land', category: 'power', unlock: 'r_ind_smelter',
    desc: 'Burns coal (or logs) from storage when its grid runs short: 6 power. Very smoky.',
    hp: 99, smashable: false, blocksBear: true,
    ind: { kind: 'power', out: 6, burn: { coal: 30, wood: 18 }, pollute: 16 },
  },
  ind_belt: {
    name: 'Conveyor Belt', icon: 'ind_belt', cost: 10, res: { ingot_iron: 1 }, place: 'land', category: 'industry', unlock: 'r_ind_belts',
    desc: 'Drag to lay a line. Carries ore and parts from machine to machine. Tap to turn it.',
    hp: 99, smashable: false,
    ind: { kind: 'belt' },
  },
  ind_loader: {
    name: 'Supply Chute', icon: 'ind_loader', cost: 60, res: { gear: 2, plate: 1 }, place: 'land', category: 'industry', unlock: 'r_ind_belts',
    desc: 'Start a belt here. It sends whatever the machine at the end of the belt needs, straight from storage.',
    hp: 99, smashable: false,
    ind: { kind: 'loader', power: 1, pollute: 1 },
  },
  ind_feeder2: {
    name: 'Auto-Feeder Mk2', icon: 'ind_feeder2', cost: 160, res: { gear: 3, plate: 2, circuit: 1 }, place: 'shore', category: 'industry', unlock: 'r_ind_feeder',
    desc: 'Fires fish food from your pantry at hungry fish. Needs power.',
    hp: 99, smashable: false,
    ind: { kind: 'feeder', power: 1, pollute: 1, every: 7, radius: 5 },
  },
  ind_harvester: {
    name: 'Auto-Harvester', icon: 'ind_harvester', cost: 200, res: { gear: 4, plate: 2, circuit: 1 }, place: 'land', category: 'industry', unlock: 'r_ind_harvester',
    desc: 'Picks ripe crops within 3 tiles into your food store. Needs power.',
    hp: 99, smashable: false,
    ind: { kind: 'harvester', power: 2, pollute: 2, every: 3.5, radius: 3 },
  },
  ind_hauler: {
    name: 'Auto-Hauler', icon: 'ind_hauler', cost: 220, res: { gear: 3, plate: 3, circuit: 2 }, place: 'land', category: 'industry', unlock: 'r_ind_hauler',
    desc: 'A drone that flies loose logs and ore sacks into storage. Needs power.',
    hp: 99, smashable: false,
    ind: { kind: 'hauler', power: 2, pollute: 2, radius: 14 },
  },
  ind_vending: {
    name: 'Bear Vending Machine', icon: 'ind_vending', cost: 180, res: { plate: 4, circuit: 1, ingot_gold: 1 }, place: 'landOrPlatform', category: 'industry', unlock: 'r_ind_vending',
    desc: 'Sells snacks from your pantry to passing bears. Cash only. Needs power.',
    hp: 99, smashable: false, blocksBear: true,
    ind: { kind: 'vending', power: 1, pollute: 1, radius: 3.2 },
  },
  ind_scrubber: {
    name: 'Air Scrubber', icon: 'ind_scrubber', cost: 200, res: { plate: 4, gear: 2, circuit: 1 }, place: 'land', category: 'industry', unlock: 'r_ind_scrubber',
    desc: 'Big fans suck the smog out of the sky (-18 pollution). Needs power.',
    hp: 99, smashable: false,
    ind: { kind: 'scrubber', power: 2, clean: 18 },
  },
  ind_filter: {
    name: 'Water Filter', icon: 'ind_filter', cost: 160, res: { plate: 3, gear: 2 }, place: 'shoreWater', category: 'industry', unlock: 'r_ind_filter',
    desc: 'Pumps the pond through charcoal (-14 pollution). Needs power.',
    hp: 99, smashable: false,
    ind: { kind: 'filter', power: 1, clean: 14 },
  },
  ind_sapling: {
    sprite: ['pine_0', 'pine_1'], variants: true, spriteScale: 0.4, name: 'Pine Sapling', icon: 'ind_sapling', cost: 20, place: 'land', category: 'industry', unlock: 'r_ind_trees',
    desc: 'A tree eats a little smog (-2.5 pollution each, up to 12 trees).',
    hp: 1, smashable: true, beauty: 1,
    ind: { kind: 'tree', clean: 2.5 },
  },
};

// Fabrication recipes ([v26 power]). A beaver fetches `in` from storage (or it rolls in by
// belt), works the machine for `time` seconds (faster with skill, slower in a brownout) and
// carries `out` back to storage (or onto an outgoing belt). Ids are saved: never rename one.
//   ingots -> gears, plates, wire -> circuits, motors -> solar cells
export const RECIPES = {
  ingot_copper: { machine: 'smelter', name: 'Copper Ingot', in: { copper: 2, coal: 1 }, out: { ingot_copper: 1 }, time: 6 },
  ingot_iron: { machine: 'smelter', name: 'Iron Ingot', in: { iron: 2, coal: 1 }, out: { ingot_iron: 1 }, time: 8 },
  ingot_gold: { machine: 'smelter', name: 'Gold Ingot', in: { gold: 2, coal: 1 }, out: { ingot_gold: 1 }, time: 10 },
  glass: { machine: 'smelter', name: 'Glass', in: { stone: 3, coal: 1 }, out: { glass: 1 }, time: 8 },
  gear: { machine: 'shop', name: 'Gears', in: { ingot_iron: 1 }, out: { gear: 2 }, time: 6 },
  plate: { machine: 'shop', name: 'Steel Plates', in: { ingot_iron: 1, ingot_copper: 1 }, out: { plate: 2 }, time: 8 },
  wire: { machine: 'shop', name: 'Copper Wire', in: { ingot_copper: 1 }, out: { wire: 3 }, time: 5 },
  circuit: { machine: 'circuitfab', name: 'Circuits', in: { wire: 2, ingot_gold: 1, crystal: 1 }, out: { circuit: 2 }, time: 14 },
  solar_cell: { machine: 'circuitfab', name: 'Solar Cell', in: { glass: 2, circuit: 1, wire: 1 }, out: { solar_cell: 1 }, time: 16 },
  motor: { machine: 'assembly', name: 'Electric Motor', in: { gear: 2, wire: 2, plate: 1 }, out: { motor: 1 }, time: 12 },
};
export const RECIPES_FOR = { smelter: ['ingot_copper', 'ingot_iron', 'ingot_gold', 'glass'], shop: ['gear', 'plate', 'wire'], circuitfab: ['circuit', 'solar_cell'], assembly: ['motor'] };
// keep-stocked targets a beaver can be told to hold in storage (0 = only when ordered)
export const KEEP_STEPS = [0, 5, 10, 20, 40];
export const KEEP_DEFAULT = 10;

// Worker bears (pre-v26 saves: they ran the machines; beavers do that now)
export const WORKER = { hire: 40, wage: 10 };

// Pollution tiers (meter 0..100)
export const POLLUTION_TIERS = [
  { at: 0, id: 'clean', name: 'Fresh air', color: '#7ad06a' },
  { at: 20, id: 'hazy', name: 'Hazy', color: '#d8c84a' },
  { at: 45, id: 'smoggy', name: 'Smoggy', color: '#e08a3a' },
  { at: 70, id: 'toxic', name: 'Toxic', color: '#c84ad0' },
];
