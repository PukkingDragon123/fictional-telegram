// Buildable structures. `place` rules:
//  water | shoreWater (water next to land) | land | shore (land next to water)
//  landOrPlatform | shoreOrPlatform | nearWillow | any
// `beauty` points make the pond prettier: bigger bills and more customers.
export const STRUCTURES = {
  // ------------------------------------------------------------ nature
  seaweed: {
    name: 'Seaweed', icon: 'seaweed', cost: 15, place: 'water', category: 'nature',
    desc: 'Fish graze on it between meals. Janitor bears want seaweed salad.',
    food: { kind: 'seaweed', max: 6, regen: 0.1 }, hp: 2, smashable: true,
  },
  duckweed: {
    name: 'Duckweed', icon: 'duckweed', cost: 10, place: 'water', category: 'nature', unlock: 'r_duckweed',
    desc: 'A floating carpet of tiny leaves. Fry love to nibble it and hide underneath.',
    food: { kind: 'seaweed', max: 3, regen: 0.14 }, shelterFry: true, hp: 1, smashable: true, beauty: 0.5,
  },
  cattail: {
    name: 'Cattails', icon: 'cattail', cost: 20, place: 'shore', category: 'nature',
    desc: 'Attracts dragonflies. Fish leap out of the water to snack on them (breeding boost!).',
    bugs: { max: 2, every: 11 }, hp: 2, smashable: true, beauty: 0.5,
  },
  reeds: {
    name: 'River Reeds', icon: 'reeds', cost: 18, place: 'shore', category: 'nature', unlock: 'r_duckweed',
    desc: 'Tall rustling reeds. Songbirds perch on them and damselflies hatch here.',
    bugs: { max: 1, every: 9 }, birds: 1, hp: 2, smashable: true, beauty: 1,
  },
  lilypad: {
    name: 'Lily Pads', icon: 'lilypad', cost: 30, place: 'water', category: 'nature', unlock: 'r_lilypad',
    desc: 'Attracts bugs and frogs, and gives fish a shady hiding spot bears can\'t see into.',
    bugs: { max: 2, every: 14 }, shelter: true, hp: 1, smashable: true, beauty: 1.5,
  },
  flowers: {
    name: 'Wildflowers', icon: 'flower', cost: 15, place: 'landOrPlatform', category: 'nature', unlock: 'r_flowers',
    desc: 'Fireweed & lupines. Each bed boosts beehives within 3 tiles by +40%.', hp: 1, smashable: true, beauty: 2,
  },
  fern: {
    name: 'Fern Patch', icon: 'fern', cost: 12, place: 'landOrPlatform', category: 'nature', unlock: 'r_flowers',
    desc: 'Lush ostrich ferns. Cheap, cheerful, and very forest-y.', hp: 1, smashable: true, beauty: 1,
  },
  willow: {
    name: 'Weeping Willow', icon: 'willow', cost: 90, place: 'land', category: 'nature', unlock: 'r_willow',
    desc: 'A graceful willow. Bees only nest near willows: required for beehives.', hp: 99, smashable: false, blocksBear: true, beauty: 4,
  },
  bughotel: {
    name: 'Bug Hotel', icon: 'bughotel', cost: 70, place: 'landOrPlatform', category: 'nature', unlock: 'r_bughotel',
    desc: 'A cosy stack of logs and pinecones. Spawns lots of dragonflies.',
    bugs: { max: 4, every: 6 }, hp: 2, smashable: true, beauty: 1,
  },
  // ------------------------------------------------------------ bear snacks
  berries: {
    name: 'Blueberry Bush', icon: 'berry', cost: 30, place: 'landOrPlatform', category: 'food',
    desc: 'Wild blueberries. Every bear loves a side of berries, and each serving fills them up a little. Grow them on a platform so rampagers can\'t trample them.',
    food: { kind: 'berries', max: 6, regen: 1 / 14, meal: 0.6 }, hp: 2, smashable: true, beauty: 1,
  },
  beehive: {
    name: 'Beehive', icon: 'hive', cost: 60, place: 'nearWillow', category: 'food', unlock: 'r_bees',
    desc: 'Makes honey for bears with a sweet tooth. Must be within 2 tiles of a willow (a platform works too).',
    food: { kind: 'honey', max: 4, regen: 1 / 20, meal: 0.8 }, hp: 3, smashable: true, beauty: 1,
  },
  wildrice: {
    name: 'Wild Rice', icon: 'wildrice', cost: 45, place: 'water', category: 'food', unlock: 'r_wildrice',
    desc: 'Manoomin, the good berry of the lakes. Grows in the shallows; bears slurp it like noodles.',
    food: { kind: 'rice', max: 5, regen: 1 / 16, meal: 0.7 }, hp: 2, smashable: true, beauty: 1,
  },
  mushrooms: {
    name: 'Mushroom Log', icon: 'mushroom', cost: 55, place: 'landOrPlatform', category: 'food', unlock: 'r_mushrooms',
    desc: 'A mossy log sprouting chanterelles. Fancy bears pay extra for foraged mushrooms.',
    food: { kind: 'mushroom', max: 4, regen: 1 / 18, meal: 0.7 }, hp: 2, smashable: true, beauty: 1,
  },
  maple: {
    name: 'Sugar Maple', icon: 'maple', cost: 120, place: 'land', category: 'food', unlock: 'r_maple',
    desc: 'A tapped sugar maple dripping with syrup. Lumberjack bears go wild for it.',
    food: { kind: 'syrup', max: 3, regen: 1 / 26, meal: 1 }, hp: 99, smashable: false, blocksBear: true, beauty: 3,
  },
  // ------------------------------------------------------------ beaver works
  lodge: {
    name: 'Beaver Lodge', icon: 'lodge', cost: 100, place: 'shoreWater', category: 'beaver', unlock: 'r_beavers',
    desc: 'Home to 2 hard-working beavers who build dams, fences, platforms and contraptions.',
    beavers: 2, hp: 99, smashable: false, blocksFish: true, blocksBear: true, beauty: 1,
  },
  dam: {
    name: 'Beaver Dam', icon: 'dam', cost: 15, place: 'water', category: 'beaver', unlock: 'r_dams', builder: 'beaver', buildTime: 4, drag: true, connect: true,
    desc: 'Blocks fish AND bears. Wall off a safe breeding nursery!', blocksFish: true, blocksBear: true, hp: 6, smashable: true,
  },
  fence: {
    name: 'Log Fence', icon: 'fence', cost: 8, place: 'land', category: 'beaver', unlock: 'r_fences', builder: 'beaver', buildTime: 2.5, drag: true, connect: true,
    desc: 'Keeps bears out on land. Combine with dams to seal off an area.', blocksBear: true, hp: 5, smashable: true,
  },
  gate: {
    name: 'Sluice Gate', icon: 'gate', cost: 60, place: 'water', category: 'beaver', unlock: 'r_gates', builder: 'beaver', buildTime: 6, connect: true,
    desc: 'A dam you can open and close (tap it). Open to let fish through. Bears can pass when open!',
    blocksFish: true, blocksBear: true, gate: true, hp: 8, smashable: true,
  },
  platform: {
    name: 'Stilt Platform', icon: 'platform', cost: 35, place: 'any', category: 'beaver', unlock: 'r_platforms', builder: 'beaver', buildTime: 5, drag: true,
    desc: 'A raised deck for rampage-proof farming: bears snack from the edge but can\'t smash what\'s on top. Fish hide underneath.',
    blocksBear: true, shelter: true, supports: true, hp: 99, smashable: false,
  },
  // ------------------------------------------------------------ contraptions
  feeder: {
    name: 'Auto-Feeder', icon: 'feeder', cost: 140, place: 'shoreOrPlatform', category: 'contraption', unlock: 'r_feeder', builder: 'beaver', buildTime: 7,
    desc: 'A beaver-built contraption that flings fish food into the pond every few seconds.',
    feeder: { every: 6.5, radius: 3.2, n: 5 }, hp: 3, smashable: true,
  },
  aerator: {
    name: 'Bubble Aerator', icon: 'aerator', cost: 180, place: 'water', category: 'contraption', unlock: 'r_aerator', builder: 'beaver', buildTime: 7,
    desc: 'Bubbly water makes fish frisky: +60% breeding speed within 4 tiles.',
    aerator: { radius: 4, boost: 0.6 }, hp: 3, smashable: true,
  },
  hatchery: {
    name: 'Egg Incubator', icon: 'incubator', cost: 220, place: 'landOrPlatform', category: 'contraption', unlock: 'r_hatchery', builder: 'beaver', buildTime: 8,
    desc: 'A warm glass-topped box with a heat lamp. +1 egg slot, and every egg hatches 30% faster.',
    eggSlot: 1, hatchBoost: 0.3, hp: 3, smashable: true,
  },
  sprinkler: {
    name: 'Rain Barrel Sprinkler', icon: 'sprinkler', cost: 160, place: 'landOrPlatform', category: 'contraption', unlock: 'r_sprinkler', builder: 'beaver', buildTime: 6,
    desc: 'A spinning sprinkler fed by a rain barrel. Plants and snacks within 3 tiles regrow 60% faster.',
    sprinkler: { radius: 3, boost: 0.6 }, hp: 3, smashable: true,
  },
  buglamp: {
    name: 'Porch Bug Lamp', icon: 'buglamp', cost: 120, place: 'landOrPlatform', category: 'contraption', unlock: 'r_buglamp', builder: 'beaver', buildTime: 5,
    desc: 'A humming lamp on a post. Moths and beetles swarm to it, day and night.',
    bugs: { max: 3, every: 7 }, light: true, hp: 2, smashable: true, beauty: 1,
  },
  // ------------------------------------------------------------ decor (beauty attracts more customers)
  lantern: {
    name: 'Lantern', icon: 'lantern', cost: 20, place: 'landOrPlatform', category: 'decor', beauty: 1, light: true,
    desc: 'A cosy lantern that glows at night.', hp: 1, smashable: true,
  },
  chair: {
    name: 'Muskoka Chair', icon: 'chair', cost: 30, place: 'landOrPlatform', category: 'decor', beauty: 2,
    desc: 'The classic red cottage chair.', hp: 1, smashable: true,
  },
  picnic: {
    name: 'Picnic Table', icon: 'picnic', cost: 45, place: 'landOrPlatform', category: 'decor', beauty: 3,
    desc: 'Checkered tablecloth, no ants (yet).', hp: 2, smashable: true,
  },
  mailbox: {
    name: 'Cottage Mailbox', icon: 'mailbox', cost: 25, place: 'land', category: 'decor', beauty: 1, unlock: 'r_decor1',
    desc: 'Red flag up: you\'ve got fan mail (and complaints).', hp: 1, smashable: true,
  },
  pinwheel: {
    name: 'Pinwheel', icon: 'pinwheel', cost: 15, place: 'landOrPlatform', category: 'decor', beauty: 1, unlock: 'r_decor1',
    desc: 'Spins in the breeze. Hypnotises the interns.', hp: 1, smashable: true,
  },
  bench: {
    name: 'Maple Bench', icon: 'bench', cost: 40, place: 'landOrPlatform', category: 'decor', beauty: 2, unlock: 'r_decor1',
    desc: 'A carved bench for digesting in style.', hp: 2, smashable: true,
  },
  birdhouse: {
    name: 'Birdhouse', icon: 'birdhouse', cost: 35, place: 'landOrPlatform', category: 'decor', beauty: 2, birds: 2, unlock: 'r_garden',
    desc: 'Chickadees move in and sing all day.', hp: 1, smashable: true,
  },
  birdbath: {
    name: 'Bird Bath', icon: 'birdbath', cost: 50, place: 'land', category: 'decor', beauty: 3, birds: 2, unlock: 'r_garden',
    desc: 'Blue jays and robins splash in it. Adorable.', hp: 2, smashable: true,
  },
  gnome: {
    name: 'Moose Gnome', icon: 'gnome', cost: 40, place: 'landOrPlatform', category: 'decor', beauty: 2, unlock: 'r_garden',
    desc: 'A garden gnome wearing antlers. Tasteful? No. Beloved? Yes.', hp: 1, smashable: true,
  },
  arch: {
    name: 'Flower Arch', icon: 'arch', cost: 90, place: 'land', category: 'decor', beauty: 5, unlock: 'r_garden2',
    desc: 'A trellis arch overflowing with climbing roses. Bears take selfies.', hp: 2, smashable: true,
  },
  stringlights: {
    name: 'String Lights', icon: 'stringlights', cost: 55, place: 'landOrPlatform', category: 'decor', beauty: 3, light: true, unlock: 'r_lights',
    desc: 'Warm fairy lights on little posts. Very date-night.', hp: 1, smashable: true,
  },
  stonelantern: {
    name: 'Stone Lantern', icon: 'stonelantern', cost: 70, place: 'land', category: 'decor', beauty: 3, light: true, unlock: 'r_lights',
    desc: 'A mossy stone lantern with a candle inside.', hp: 3, smashable: true,
  },
  campfire: {
    name: 'Campfire', icon: 'campfire', cost: 60, place: 'land', category: 'decor', beauty: 4, light: true, unlock: 'r_canadiana',
    desc: 'Crackling logs and marshmallows on sticks. Bears linger and pay more.', hp: 2, smashable: true,
  },
  flag: {
    name: 'Flag Pole', icon: 'flag', cost: 60, place: 'landOrPlatform', category: 'decor', beauty: 4, unlock: 'r_canadiana',
    desc: 'The red maple leaf, proudly flying.', hp: 2, smashable: true,
  },
  canoe: {
    name: 'Red Canoe', icon: 'canoe', cost: 80, place: 'shore', category: 'decor', beauty: 4, unlock: 'r_canadiana',
    desc: 'A cedar-strip canoe pulled up on the shore. Peak Canadian.', hp: 2, smashable: true,
  },
  hockey: {
    name: 'Hockey Net', icon: 'hockey', cost: 50, place: 'land', category: 'decor', beauty: 3, unlock: 'r_canadiana',
    desc: 'For pickup games on the frozen pond. Sorry, eh.', hp: 2, smashable: true,
  },
  moose: {
    name: 'Moose Statue', icon: 'moose', cost: 180, place: 'land', category: 'decor', beauty: 7, unlock: 'r_canadiana2',
    desc: 'A majestic carved moose. Tourist bears travel for miles to see it.', hp: 99, smashable: false, blocksBear: true,
  },
  stones: {
    name: 'Stepping Stones', icon: 'stones', cost: 30, place: 'water', category: 'decor', beauty: 2, unlock: 'r_waterdecor',
    desc: 'Flat mossy stones across the shallows. Frogs sunbathe on them.', hp: 99, smashable: false,
  },
  floatlantern: {
    name: 'Floating Lanterns', icon: 'floatlantern', cost: 40, place: 'water', category: 'decor', beauty: 3, light: true, unlock: 'r_waterdecor',
    desc: 'Paper lanterns drifting on the water. Magical at night.', hp: 1, smashable: true,
  },
  decoy: {
    name: 'Duck Decoy', icon: 'decoy', cost: 25, place: 'water', category: 'decor', beauty: 1, unlock: 'r_waterdecor',
    desc: 'A painted wooden mallard. Real ducks are confused and jealous.', hp: 1, smashable: true,
  },
  fountain: {
    name: 'Leaping Fish Fountain', icon: 'fountain', cost: 220, place: 'water', category: 'decor', beauty: 8, unlock: 'r_waterdecor2',
    desc: 'A bronze fish spouting water. Fish love the bubbles (+30% breeding nearby).', aerator: { radius: 3, boost: 0.3 }, hp: 99, smashable: false,
  },
  lighthouse: {
    name: 'Mini Lighthouse', icon: 'lighthouse', cost: 300, place: 'shore', category: 'decor', beauty: 10, light: true, unlock: 'r_waterdecor2',
    desc: 'A red-and-white Maritimes lighthouse with a spinning lamp. Guides hungry bears home.', hp: 99, smashable: false, blocksBear: true,
  },
};

export const CHARM_CAP = 40; // max % bill bonus from beauty
export const BEAUTY_PER_BEAR = 10; // every N beauty brings one more customer

export const BUILD_CATEGORIES = [
  { id: 'nature', name: 'Nature' },
  { id: 'food', name: 'Bear Snacks' },
  { id: 'beaver', name: 'Beaver Works' },
  { id: 'contraption', name: 'Contraptions' },
  { id: 'decor', name: 'Decor' },
];

// Snack kinds bears can eat (meal points come from each structure's food.meal).
export const SNACKS = {
  seaweed: { name: 'Seaweed Salad', icon: 'seaweed' },
  berries: { name: 'Blueberries', icon: 'berry' },
  honey: { name: 'Honey', icon: 'honey' },
  rice: { name: 'Wild Rice', icon: 'wildrice' },
  mushroom: { name: 'Chanterelles', icon: 'mushroom' },
  syrup: { name: 'Maple Syrup', icon: 'syrup' },
};
