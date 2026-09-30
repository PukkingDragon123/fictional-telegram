// Buildable structures. `place` rules:
//  water | shoreWater (water next to land) | land | shore (land next to water)
//  landOrPlatform | shoreOrPlatform | nearWillow | any
export const STRUCTURES = {
  seaweed: {
    name: 'Seaweed', icon: 'seaweed', cost: 15, place: 'water', category: 'nature',
    desc: 'Fish graze on it between meals. Janitor bears want seaweed salad.',
    food: { kind: 'seaweed', max: 6, regen: 0.1 }, hp: 2, smashable: true,
  },
  cattail: {
    name: 'Cattails', icon: 'cattail', cost: 20, place: 'shore', category: 'nature',
    desc: 'Attracts dragonflies. Fish leap out of the water to snack on them (breeding boost!).',
    bugs: { max: 2, every: 11 }, hp: 2, smashable: true,
  },
  lilypad: {
    name: 'Lily Pads', icon: 'lilypad', cost: 30, place: 'water', category: 'nature', unlock: 'r_lilypad',
    desc: 'Attracts bugs and gives fish a shady hiding spot bears can\'t see into.',
    bugs: { max: 2, every: 14 }, shelter: true, hp: 1, smashable: true,
  },
  flowers: {
    name: 'Wildflowers', icon: 'flower', cost: 15, place: 'landOrPlatform', category: 'nature', unlock: 'r_flowers',
    desc: 'Fireweed & lupines. Each bed boosts beehives within 3 tiles by +40%.', hp: 1, smashable: true,
  },
  willow: {
    name: 'Weeping Willow', icon: 'willow', cost: 90, place: 'land', category: 'nature', unlock: 'r_willow',
    desc: 'A graceful willow. Bees only nest near willows: required for beehives.', hp: 99, smashable: false, blocksBear: true,
  },
  beehive: {
    name: 'Beehive', icon: 'hive', cost: 60, place: 'nearWillow', category: 'food', unlock: 'r_bees',
    desc: 'Makes honey for bears with a sweet tooth. Must be within 2 tiles of a willow (a platform works too).',
    food: { kind: 'honey', max: 4, regen: 1 / 20 }, hp: 3, smashable: true,
  },
  berries: {
    name: 'Blueberry Bush', icon: 'berry', cost: 40, place: 'landOrPlatform', category: 'food', unlock: 'r_berries',
    desc: 'Wild blueberries for tourists and cubs. Grow them on a platform so rampaging bears can\'t trample them.',
    food: { kind: 'berries', max: 5, regen: 1 / 15 }, hp: 2, smashable: true,
  },
  maple: {
    name: 'Sugar Maple', icon: 'maple', cost: 120, place: 'land', category: 'food', unlock: 'r_maple',
    desc: 'A tapped sugar maple dripping with syrup. Lumberjack bears go wild for it.',
    food: { kind: 'syrup', max: 3, regen: 1 / 26 }, hp: 99, smashable: false, blocksBear: true,
  },
  bughotel: {
    name: 'Bug Hotel', icon: 'bughotel', cost: 70, place: 'landOrPlatform', category: 'nature', unlock: 'r_bughotel',
    desc: 'A cosy stack of logs and pinecones. Spawns lots of dragonflies.',
    bugs: { max: 4, every: 6 }, hp: 2, smashable: true,
  },
  lodge: {
    name: 'Beaver Lodge', icon: 'lodge', cost: 100, place: 'shoreWater', category: 'beaver', unlock: 'r_beavers',
    desc: 'Home to 2 hard-working beavers who build dams, fences, platforms and contraptions.',
    beavers: 2, hp: 99, smashable: false, blocksFish: true, blocksBear: true,
  },
  dam: {
    name: 'Beaver Dam', icon: 'dam', cost: 15, place: 'water', category: 'beaver', unlock: 'r_dams', builder: 'beaver', buildTime: 5, drag: true, connect: true,
    desc: 'Blocks fish AND bears. Wall off a safe breeding nursery!', blocksFish: true, blocksBear: true, hp: 6, smashable: true,
  },
  fence: {
    name: 'Log Fence', icon: 'fence', cost: 8, place: 'land', category: 'beaver', unlock: 'r_fences', builder: 'beaver', buildTime: 3, drag: true, connect: true,
    desc: 'Keeps bears out on land. Combine with dams to seal off an area.', blocksBear: true, hp: 5, smashable: true,
  },
  gate: {
    name: 'Sluice Gate', icon: 'gate', cost: 60, place: 'water', category: 'beaver', unlock: 'r_gates', builder: 'beaver', buildTime: 8, connect: true,
    desc: 'A dam you can open and close (tap it). Open to let fish through. Bears can pass when open!',
    blocksFish: true, blocksBear: true, gate: true, hp: 8, smashable: true,
  },
  platform: {
    name: 'Stilt Platform', icon: 'platform', cost: 35, place: 'any', category: 'beaver', unlock: 'r_platforms', builder: 'beaver', buildTime: 6, drag: true,
    desc: 'A raised deck for rampage-proof farming: bears snack from the edge but can\'t smash what\'s on top. Fish hide underneath.',
    blocksBear: true, shelter: true, supports: true, hp: 99, smashable: false,
  },
  feeder: {
    name: 'Auto-Feeder', icon: 'feeder', cost: 140, place: 'shoreOrPlatform', category: 'contraption', unlock: 'r_feeder', builder: 'beaver', buildTime: 9,
    desc: 'A beaver-built contraption that flings fish food into the pond every few seconds.',
    feeder: { every: 6.5, radius: 3.2, n: 5 }, hp: 3, smashable: true,
  },
  aerator: {
    name: 'Bubble Aerator', icon: 'aerator', cost: 180, place: 'water', category: 'contraption', unlock: 'r_aerator', builder: 'beaver', buildTime: 9,
    desc: 'Bubbly water makes fish frisky: +60% breeding speed within 4 tiles.',
    aerator: { radius: 4, boost: 0.6 }, hp: 3, smashable: true,
  },
  lantern: {
    name: 'Lantern', icon: 'sparkle', cost: 20, place: 'landOrPlatform', category: 'decor', charm: 1,
    desc: 'A cosy lantern that glows at night. Charm +1%.', hp: 1, smashable: true,
  },
  chair: {
    name: 'Muskoka Chair', icon: 'home', cost: 30, place: 'landOrPlatform', category: 'decor', charm: 2,
    desc: 'The classic red cottage chair. Charm +2% on every bill.', hp: 1, smashable: true,
  },
  picnic: {
    name: 'Picnic Table', icon: 'home', cost: 45, place: 'landOrPlatform', category: 'decor', charm: 3,
    desc: 'Checkered tablecloth, no ants (yet). Charm +3%.', hp: 2, smashable: true,
  },
  flag: {
    name: 'Flag Pole', icon: 'maple', cost: 60, place: 'landOrPlatform', category: 'decor', charm: 4,
    desc: 'The red maple leaf, proudly flying. Bears get patriotic: charm +4%.', hp: 2, smashable: true,
  },
};

export const CHARM_CAP = 30;

export const BUILD_CATEGORIES = [
  { id: 'nature', name: 'Nature' },
  { id: 'food', name: 'Bear Snacks' },
  { id: 'beaver', name: 'Beaver Works' },
  { id: 'contraption', name: 'Contraptions' },
  { id: 'decor', name: 'Decor' },
];
