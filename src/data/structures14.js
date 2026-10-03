// v14 builds: facilities (upgrades you PLACE instead of research), woodwork
// crafted at Chip the woodpecker's workshop and restored antiques.
// Merged into STRUCTURES (structures.js). Models: src/entities/extra/*.js.
//
// `facility.mods` are added to the game mods while at least one is built
// (each kind counts once). `craft` = only from Chip's workshop (placed from
// the Woodwork tab out of your inventory, never bought with coins).
// `gate` = the neighbour (zone id) who unlocks it.
export const STRUCTURES_V14 = {
  // ---- bear business (Hazel the baker)
  tipjar: { name: 'Tip Jar', icon: 'coins', cost: 60, place: 'landOrPlatform', category: 'restaurant', gate: 'bakery', facility: { mods: { tipMult: 0.5 } },
    desc: 'A jar by the counter. Snack bonuses and tips +50%.', beauty: 1, hp: 2, smashable: true },
  pricesign: { name: 'Price Board', icon: 'coin', cost: 120, place: 'landOrPlatform', category: 'restaurant', gate: 'bakery', facility: { mods: { payMult: 0.2 } },
    desc: 'A chalkboard of "market prices". Bears pay 20% more.', beauty: 1, hp: 2, smashable: true },
  waitbench: { name: 'Waiting Bench', icon: 'bench', cost: 110, place: 'land', category: 'restaurant', gate: 'bakery', builder: 'beaver', buildTime: 5, facility: { mods: { patienceMult: 0.3 } },
    desc: 'Magazines and a bench: bears are 30% more patient.', comfort: 1, hp: 3, smashable: true },
  stressbin: { name: 'Stress Ball Bucket', icon: 'bear_happy', cost: 220, place: 'landOrPlatform', category: 'restaurant', gate: 'bakery', facility: { mods: { calmChance: 0.35 } },
    desc: 'Squeeze! 35% of angry bears calm down instead of rampaging.', hp: 2, smashable: true },
  prboard: { name: 'PR Billboard', icon: 'newspaper', cost: 420, place: 'land', category: 'restaurant', gate: 'bakery', builder: 'beaver', buildTime: 8, size: [2, 1], facility: { mods: { badReviewMult: -0.4 } },
    desc: 'A smiling bear on a billboard. Bad reviews hurt 40% less.', beauty: 2, hp: 3, smashable: true },
  franchise: { name: 'Franchise Statue', icon: 'crown', cost: 5000, place: 'land', category: 'restaurant', gate: 'bakery', builder: 'beaver', buildTime: 14, size: [2, 2], facility: { mods: { payMult: 1 } },
    desc: 'A solid gold Reynard. Every bill doubled. You can retire as a legend.', beauty: 12, hp: 99, smashable: false, unlock: 'day:6' },

  // ---- fox tools (Otis the otter)
  tagrack: { name: 'Tag Rack', icon: 'tag', cost: 90, place: 'landOrPlatform', category: 'contraption', gate: 'bend', facility: { mods: { tagBonus: 3 } },
    desc: '+3 "DO NOT EAT" tags. Tagged fish are off the menu.', hp: 2, smashable: true },
  feedsilo: { name: 'Feed Silo', icon: 'food', cost: 160, place: 'land', category: 'contraption', gate: 'bend', builder: 'beaver', buildTime: 6, facility: { mods: { bagBonus: 0.75 } },
    desc: 'Carry 75% more fish food, and it refills faster.', hp: 3, smashable: true },
  shovelshed: { name: 'Shovel Shed', icon: 'shovel', cost: 70, place: 'land', category: 'contraption', gate: 'bend', facility: { mods: { digMult: -0.35 } },
    desc: 'A sturdy shovel: digging the pond costs 35% less.', hp: 2, smashable: true },
  whispershell: { name: 'Whisper Shell', icon: 'nurture', cost: 240, place: 'shoreOrPlatform', category: 'contraption', gate: 'bend', facility: { mods: { nurtureMult: 1 } },
    desc: 'Fish hear sweet nothings: petting gives twice the love.', beauty: 2, hp: 2, smashable: true },

  // ---- beaver works (Dale)
  toolbox: { name: 'Beaver Tool Box', icon: 'hammer', cost: 120, place: 'land', category: 'beaver', gate: 'river', facility: { mods: { buildSpeed: 0.5 } },
    desc: 'Sharp saws, new mallets: beavers build 50% faster.', hp: 2, smashable: true },
  gearstation: { name: 'Gear Station', icon: 'gear', cost: 260, place: 'land', category: 'beaver', gate: 'river', builder: 'beaver', buildTime: 6, facility: { mods: { buildSpeed: 0.5, clearSpeed: 0.5 } },
    desc: 'A grinding wheel for teeth and axes: build +50%, chopping +50%.', hp: 3, smashable: true },
  beaverbed: { name: 'Beaver Bed', icon: 'beaver', cost: 200, place: 'land', category: 'beaver', gate: 'river', builder: 'beaver', buildTime: 5, facility: { mods: { beaverBonus: 1 } },
    desc: 'A cozy log bed. Well rested: +1 beaver per lodge.', beauty: 1, hp: 3, smashable: true },

  // ---- logs from felled trees are stocked here (beavers haul them in)
  woodgarage: { name: 'Wood Garage', icon: 'hammer', cost: 120, place: 'land', category: 'beaver', size: [2, 2], builder: 'beaver', buildTime: 6,
    woodCap: 40, desc: 'Beavers stack the logs here: 40 per garage. Wood for Chip\'s furniture, or to sell to Pip.', hp: 99, smashable: false },

  // ---- woodwork (crafted at Chip's)
  wd_stool: { name: 'Log Stool', icon: 'chair', cost: 0, craft: true, place: 'landOrPlatform', category: 'woodwork', comfort: 1, beauty: 1, desc: 'A sawn log with a cushion.', hp: 2, smashable: true },
  wd_table: { name: 'Plank Table', icon: 'table', cost: 0, craft: true, place: 'landOrPlatform', category: 'woodwork', comfort: 2, beauty: 1, desc: 'Seats hungry bears. Hand-planed by Chip.', hp: 3, smashable: true },
  wd_bench: { name: 'Bear Bench', icon: 'bench', cost: 0, craft: true, place: 'land', category: 'woodwork', size: [2, 1], comfort: 2, beauty: 2, desc: 'Wide enough for the big boss.', hp: 3, smashable: true },
  wd_rocker: { name: 'Rocking Chair', icon: 'chair', cost: 0, craft: true, place: 'landOrPlatform', category: 'woodwork', comfort: 2, beauty: 2, desc: 'Creak... creak... bliss.', hp: 2, smashable: true },
  wd_shelf: { name: 'Pine Shelf', icon: 'pantry', cost: 0, craft: true, place: 'land', category: 'woodwork', beauty: 2, desc: 'Jars, pinecones and a tiny fox figurine.', hp: 2, smashable: true },
  wd_barrel: { name: 'Barrel', icon: 'barrel', cost: 0, craft: true, place: 'landOrPlatform', category: 'woodwork', beauty: 1, desc: 'Rustic. Possibly full of syrup.', hp: 2, smashable: true },
  wd_crate: { name: 'Crate Stack', icon: 'mailbox', cost: 0, craft: true, place: 'landOrPlatform', category: 'woodwork', beauty: 1, desc: 'Stamped "FRAGILE: FISH".', hp: 2, smashable: true },
  wd_planter: { name: 'Planter Box', icon: 'flower', cost: 0, craft: true, place: 'landOrPlatform', category: 'woodwork', beauty: 3, desc: 'Cedar box overflowing with flowers.', hp: 2, smashable: true },
  wd_birdhouse: { name: 'Birdhouse Tower', icon: 'birdhouse', cost: 0, craft: true, place: 'land', category: 'woodwork', beauty: 4, birds: 3, desc: 'Three storeys of bird apartments.', hp: 2, smashable: true },
  wd_arch: { name: 'Twig Arch', icon: 'arch', cost: 0, craft: true, place: 'land', category: 'woodwork', size: [2, 1], beauty: 5, desc: 'Woven birch twigs and fairy lights.', hp: 3, smashable: true },
  // restored antiques (repairs)
  an_chair: { name: 'Antique Armchair', icon: 'chair', cost: 0, craft: true, place: 'landOrPlatform', category: 'woodwork', comfort: 3, beauty: 5, desc: 'Velvet and carved oak, good as new.', hp: 3, smashable: true },
  an_table: { name: 'Antique Dining Table', icon: 'table', cost: 0, craft: true, place: 'land', category: 'woodwork', size: [2, 1], comfort: 4, beauty: 6, desc: 'Where fancy bears dine.', hp: 3, smashable: true },
  an_clock: { name: 'Grandfather Clock', icon: 'clock', cost: 0, craft: true, place: 'land', category: 'woodwork', beauty: 8, desc: 'Tick... tock... dinner o\'clock.', hp: 3, smashable: true },
  an_lamp: { name: 'Brass Lantern', icon: 'lantern', cost: 0, craft: true, place: 'landOrPlatform', category: 'woodwork', beauty: 4, light: true, desc: 'Polished brass, warm glow.', hp: 2, smashable: true },
  an_cart: { name: 'Flower Cart', icon: 'flower', cost: 0, craft: true, place: 'land', category: 'woodwork', size: [2, 1], beauty: 7, desc: 'The old hand cart, now full of flowers.', hp: 3, smashable: true },
};

// what Chip can make: wood + forage materials + real time (seconds)
export const WOOD_RECIPES = [
  { id: 'wd_stool', cost: { wood: 3 }, time: 90 },
  { id: 'wd_crate', cost: { wood: 4 }, time: 120 },
  { id: 'wd_barrel', cost: { wood: 5, resin: 1 }, time: 150 },
  { id: 'wd_table', cost: { wood: 6 }, time: 180 },
  { id: 'wd_planter', cost: { wood: 5, wildberry: 2 }, time: 180 },
  { id: 'wd_shelf', cost: { wood: 7, pinecone: 3 }, time: 240 },
  { id: 'wd_bench', cost: { wood: 9 }, time: 300 },
  { id: 'wd_rocker', cost: { wood: 8, resin: 2 }, time: 360 },
  { id: 'wd_birdhouse', cost: { wood: 10, pinecone: 4 }, time: 420 },
  { id: 'wd_arch', cost: { wood: 12, resin: 2, fiddlehead: 3 }, time: 540 },
];
// broken things found in the forest -> antiques
export const REPAIRS = [
  { id: 'an_chair', ruin: 'ruin_chair', ruinName: 'Broken Armchair', cost: { wood: 4, resin: 1 }, time: 300 },
  { id: 'an_table', ruin: 'ruin_table', ruinName: 'Rotten Table', cost: { wood: 6 }, time: 360 },
  { id: 'an_lamp', ruin: 'ruin_lamp', ruinName: 'Rusty Lantern', cost: { wood: 2, resin: 2 }, time: 240 },
  { id: 'an_cart', ruin: 'ruin_cart', ruinName: 'Old Hand Cart', cost: { wood: 8, resin: 1 }, time: 480 },
  { id: 'an_clock', ruin: 'ruin_clock', ruinName: 'Old Grandfather Clock', cost: { wood: 6, resin: 3, pinecone: 2 }, time: 600 },
];
