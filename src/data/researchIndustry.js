// [F&S] The "Flint & Steel" research section (industry). Merged into RESEARCH by
// src/data/research.js (import.meta.glob, optional) exactly like researchDefense.js.
// Same node format as research.js. Ids: r_mine_* belong to the "mining" helper,
// r_ind_* to the "industry" helper. Node ids are referenced by saves: never rename one.
// The section key: research the gateway node r_mine_survey (Lab section) and meet
// Flint (zone 'quarry'), then pay the coins.
export const INDUSTRY_BRANCH = { id: 'industry', name: 'Flint & Steel', icon: 'pickaxe', color: '#8a8f9c',
  key: { node: 'r_mine_survey', zone: 'quarry', coins: 150 } };

export const INDUSTRY_RESEARCH = [
  // ---- [F&S mining] (r_mine_*)
  // the gateway: sits in the Lab section, lifts the fog off Flint's Quarry (src/game/Mining.js)
  { id: 'r_mine_survey', branch: 'lab', name: 'Mountain Survey', icon: 'pickaxe', time: 120, req: ['r_notebook'], feature: 'quarry', featureName: 'Find Flint\'s Quarry',
    desc: 'Something glitters up on the mountain. Map it, and find out who keeps digging up there.' },
  { id: 'r_mine_pick', branch: 'industry', name: 'Beaver Pickaxes', icon: 'pickaxe', time: 60, req: [], zone: 'quarry', build: 'oreshed', feature: 'veins', featureName: 'Beavers mine ore veins',
    desc: 'Beavers mine the ore veins on the mountain (stone, coal, copper) and haul the sacks to an Ore Shed.' },
  { id: 'r_mine_helmet', branch: 'industry', name: 'Drill Helmets', icon: 'drillhelmet', time: 150, req: ['r_mine_pick'], mods: { mineSpeed: 0.5 }, feature: 'veins2', featureName: 'Iron + gold veins',
    desc: 'Hard hats with a drill on top. Beavers mine 50% faster and crack iron and gold veins.' },
  { id: 'r_mine_crystal', branch: 'industry', name: 'Gentle Dynamite', icon: 'res_crystal', time: 300, req: ['r_mine_helmet'], mods: { veinRegrow: 1 }, feature: 'veins3', featureName: 'Crystal veins',
    desc: 'Flint\'s "gentle" dynamite. Opens crystal veins, and every vein grows back twice as fast.' },
  { id: 'r_mine_mine', branch: 'industry', name: 'The Bear Mine', icon: 'mine', time: 120, req: ['r_mine_pick'], feature: 'bearmine', featureName: 'Mine + worker bears',
    desc: 'Dig a proper mine in the quarry and hire worker bears. They dig ore all day. They also eat.' },
  { id: 'r_mine_lunch', branch: 'industry', name: 'Lunch Pail Line', icon: 'lunchbox', time: 180, req: ['r_mine_mine'], feature: 'autolunch', featureName: 'Automatic lunch runs',
    desc: 'A pulley line from your pantries to the mine canteen. Lunch gets delivered by itself.' },
  { id: 'r_mine_shift', branch: 'industry', name: 'Double Shift', icon: 'hardhat', time: 240, req: ['r_mine_lunch'], mods: { mineSlots: 3 },
    desc: 'Bunk beds in the canteen. Room for 3 more worker bears.' },
  { id: 'r_mine_drill', branch: 'industry', name: 'Ore Drill', icon: 'drill', time: 200, req: ['r_mine_mine'], feature: 'm_drill', featureName: 'Ore Drill machine',
    desc: 'A steam drill for the mine face. The crew digs 50% more, and deeper: more iron and gold.' },
  { id: 'r_mine_rail', branch: 'industry', name: 'Ore Cart Rail', icon: 'minecart', time: 260, req: ['r_mine_drill'], feature: 'm_rail', featureName: 'Ore Cart Rail machine',
    desc: 'Rails and carts from the mine face to the ore bin. Trips are 40% faster. Choo choo.' },
  { id: 'r_mine_excavator', branch: 'industry', name: 'Steam Excavator', icon: 'excavator', time: 420, req: ['r_mine_rail', 'r_mine_helmet'], feature: 'm_excavator', featureName: 'Steam Excavator machine',
    desc: 'A huge puffing excavator. Doubles the mine\'s output and digs up crystals.' },
  // ---- [F&S mining] end
  // ---- [F&S industry] (r_ind_*)
  // mods read by src/game/Industry.js: indWorkSpeed / indPowerSpeed (+% fabrication speed),
  // indWageCut (-% worker wages, pre-v26), indPollute (+/-% pollution from machines)
  // [v26 power] more nodes (storage, water / wind / solar, circuit fab, assembly) in src/data/ext/power.js
  { id: 'r_ind_smelter', branch: 'industry', name: 'Smelting', icon: 'ind_smelter', time: 90, req: ['r_mine_pick'], build: ['ind_smelter', 'ind_generator'], // [v26 power] + the Steam Generator
    desc: 'A Smelter and a coal Steam Generator to run it. Park them side by side: a beaver fetches the ore and pours the ingots.' },
  { id: 'r_ind_trees', branch: 'industry', name: 'Replanting', icon: 'ind_sapling', time: 60, req: ['r_ind_smelter'], build: 'ind_sapling',
    desc: 'Pine saplings. Every tree soaks up a little smog. Bears like trees too.' },
  { id: 'r_ind_shop', branch: 'industry', name: 'Machine Shop', icon: 'ind_shop', time: 150, req: ['r_ind_smelter'], build: 'ind_shop',
    desc: 'Lathes and presses: beavers turn ingots into gears, steel plates and copper wire.' },
  { id: 'r_ind_union', branch: 'industry', name: 'Union Contract', icon: 'ind_worker', time: 120, req: ['r_ind_smelter'], mods: { indWorkSpeed: 0.25, indWageCut: 0.25 },
    desc: 'Hard hats, lunch breaks, dental. Beavers at the machines work 25% faster.' },
  { id: 'r_ind_power', branch: 'industry', name: 'Power Grid', icon: 'pw_pole', time: 180, req: ['r_ind_shop'], build: ['pw_pole', 'pw_battery'], // [v26 power] was Steam Power
    desc: 'Power poles carry the juice across the yard, and Battery Banks keep the spare for the night.' },
  { id: 'r_ind_scrubber', branch: 'industry', name: 'Clean Air Act', icon: 'ind_scrubber', time: 140, req: ['r_ind_shop', 'r_ind_trees'], build: 'ind_scrubber',
    desc: 'Air Scrubbers: giant fans that eat smog. Fish and bears breathe easier.' },
  { id: 'r_ind_belts', branch: 'industry', name: 'Conveyor Belts', icon: 'ind_belt', time: 150, req: ['r_ind_power'], build: ['ind_belt', 'ind_loader'],
    desc: 'Belts and a Supply Chute. Ore rolls from machine to machine all by itself.' },
  { id: 'r_ind_feeder', branch: 'industry', name: 'Auto-Feeder Mk2', icon: 'ind_feeder2', time: 160, req: ['r_ind_power'], build: 'ind_feeder2',
    desc: 'A pellet cannon on a turret. Feeds hungry fish from your pantry. Never sleeps.' },
  { id: 'r_ind_harvester', branch: 'industry', name: 'Auto-Harvester', icon: 'ind_harvester', time: 200, req: ['r_ind_power'], build: 'ind_harvester',
    desc: 'A robot arm with a basket. Picks ripe crops nearby while you scheme.' },
  { id: 'r_ind_vending', branch: 'industry', name: 'Bear Vending', icon: 'ind_vending', time: 180, req: ['r_ind_power'], build: 'ind_vending',
    desc: 'A snack machine that sells your produce to passing bears. Exact change only.' },
  { id: 'r_ind_filter', branch: 'industry', name: 'Water Filter', icon: 'ind_filter', time: 160, req: ['r_ind_scrubber'], build: 'ind_filter',
    desc: 'A charcoal pump for the pond. Keeps the water clear and the fish smiling.' },
  { id: 'r_ind_hauler', branch: 'industry', name: 'Auto-Hauler', icon: 'ind_hauler', time: 240, req: ['r_ind_belts'], build: 'ind_hauler',
    desc: 'A delivery drone. Flies loose logs and ore home so the beavers can nap.' },
  { id: 'r_ind_overclock', branch: 'industry', name: 'Overclocking', icon: 'ind_power', time: 260, req: ['r_ind_belts'], mods: { indPowerSpeed: 0.3, indPollute: 0.15 },
    desc: 'Machines run 30% faster. A bit more smoke. Worth it.' },
  { id: 'r_ind_green', branch: 'industry', name: 'Green Steel', icon: 'ind_sapling', time: 300, req: ['r_ind_filter'], mods: { indPollute: -0.35 },
    desc: 'Cleaner furnaces and filters on every chimney: machines pollute 35% less.' },
  // ---- [F&S industry] end
];
