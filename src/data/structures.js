import { STRUCTURES_V14 } from './structures14.js';
// Buildable structures. `place` rules:
//  water | shoreWater (water next to land) | land | shore (land next to water)
//  landOrPlatform | shoreOrPlatform | nearWillow | any
// `beauty` points make the pond prettier: bigger bills and more customers.
export const STRUCTURES = {
  // ------------------------------------------------------------ nature
  seaweed: {
    sprite: ['seaweed_0', 'seaweed_1', 'seaweed_2'], underwater: true, name: 'Seaweed', icon: 'seaweed', cost: 15, place: 'water', category: 'nature', unlock: 'r_seaweed',
    desc: 'Fish graze on it between meals. Janitor bears want seaweed salad.',
    food: { kind: 'seaweed', max: 6, regen: 0.1 }, hp: 2, smashable: true,
  },
  duckweed: {
    sprite: ['duckweed'], flat: true, name: 'Duckweed', icon: 'duckweed', cost: 10, place: 'water', category: 'nature', unlock: 'r_duckweed',
    desc: 'A floating carpet of tiny leaves. Fry love to nibble it and hide underneath.',
    food: { kind: 'seaweed', max: 3, regen: 0.14 }, shelterFry: true, hp: 1, smashable: true, beauty: 0.5,
  },
  cattail: {
    sprite: ['cattailpatch', 'cattail_0'], name: 'Cattails', icon: 'cattail', cost: 20, place: 'shore', category: 'nature', unlock: 'r_seaweed',
    desc: 'Attracts dragonflies. Fish leap out of the water to snack on them (breeding boost!).',
    bugs: { max: 2, every: 11 }, hp: 2, smashable: true, beauty: 0.5,
  },
  reeds: {
    sprite: ['reeds_0', 'reeds_1'], name: 'River Reeds', icon: 'reeds', cost: 18, place: 'shore', category: 'nature', unlock: 'r_duckweed',
    desc: 'Tall rustling reeds. Songbirds perch on them and damselflies hatch here.',
    bugs: { max: 1, every: 9 }, birds: 1, hp: 2, smashable: true, beauty: 1,
  },
  lilypad: {
    sprite: ['lilypad_0', 'lilypad_1'], flat: true, name: 'Lily Pads', icon: 'lilypad', cost: 30, place: 'water', category: 'nature', unlock: 'r_lilypad',
    desc: 'Attracts bugs and frogs, and gives fish a shady hiding spot bears can\'t see into.',
    bugs: { max: 2, every: 14 }, shelter: true, hp: 1, smashable: true, beauty: 1.5,
  },
  flowers: {
    sprite: ['flowerbed_0', 'flowerbed_1', 'flowerbed_2', 'flowerbed_3'], variants: true, name: 'Wildflowers', icon: 'flower', cost: 15, place: 'landOrPlatform', category: 'nature', unlock: 'r_flowers',
    desc: 'Fireweed & lupines. Each bed boosts beehives within 3 tiles by +40%.', hp: 1, smashable: true, beauty: 2,
  },
  fern: {
    sprite: ['fern_0', 'fern_1'], variants: true, name: 'Fern Patch', icon: 'fern', cost: 12, place: 'landOrPlatform', category: 'nature', unlock: 'r_flowers',
    desc: 'Lush ostrich ferns. Cheap, cheerful, and very forest-y.', hp: 1, smashable: true, beauty: 1,
  },
  willow: {
    sprite: ['greatwillow'], spriteScale: 0.38, name: 'Weeping Willow', icon: 'willow', cost: 90, place: 'land', category: 'nature', unlock: 'r_willow',
    desc: 'A graceful willow. Bees only nest near willows: required for beehives.', hp: 99, smashable: false, blocksBear: true, beauty: 4,
  },
  bughotel: {
    name: 'Bug Hotel', icon: 'bughotel', cost: 70, place: 'landOrPlatform', category: 'nature', unlock: 'r_bughotel',
    desc: 'A cosy stack of logs and pinecones. Ladybugs, bumblebees & pill bugs check in. Luck boost nearby.',
    bugs: { max: 4, every: 6 }, hp: 2, smashable: true, beauty: 1,
  },
  // ------------------------------------------------------------ bug farms & nests (livestock)
  tallgrass: {
    sprite: ['farm_tallgrass', 'farm_tallgrass_1'], name: 'Tall Grass Patch', icon: 'bug', cost: 20, place: 'landOrPlatform', category: 'farm', unlock: 'r_tallgrass',
    desc: 'Crickets & grasshoppers move in. Everything nearby grows faster.', hp: 1, smashable: true, beauty: 0.5,
  },
  compost: {
    sprite: ['farm_compost'], name: 'Compost Heap', icon: 'bug', cost: 30, place: 'land', category: 'farm', unlock: 'r_compost',
    desc: 'Worms, mealworms & juicy grubs. Growth + size boost nearby. Smells like profit.', hp: 2, smashable: true,
  },
  butterflybush: {
    sprite: ['farm_butterflybush'], name: 'Butterfly Bush', icon: 'flower', cost: 45, place: 'landOrPlatform', category: 'farm', unlock: 'r_butterfly',
    desc: 'Monarchs, bumblebees & ladybugs. Charm + breeding boost nearby.', hp: 1, smashable: true, beauty: 2,
  },
  bogpool: {
    sprite: ['farm_bogpool'], flat: true, name: 'Bog Pool', icon: 'pond', cost: 60, place: 'land', category: 'farm', unlock: 'r_bogpool',
    desc: 'Granny Ribbit\'s recipe. Mayflies, damselflies & water striders: big breeding boost nearby.', hp: 2, smashable: false,
  },
  rottinglog: {
    sprite: ['farm_rottinglog'], name: 'Rotting Log', icon: 'tree', cost: 55, place: 'land', category: 'farm', unlock: 'r_bogpool',
    desc: 'Stag beetles, June bugs... and sometimes a Rhino Beetle. Size boost nearby.', hp: 3, smashable: true,
  },
  glowmeadow: {
    sprite: ['farm_glowmeadow'], name: 'Firefly Meadow', icon: 'lantern', cost: 80, place: 'landOrPlatform', category: 'farm', unlock: 'r_glowmeadow',
    desc: 'Fireflies (and rare Luna Moths) at night. Eggs nearby hatch much faster.', hp: 1, smashable: true, beauty: 2, light: true,
  },
  glasstank: {
    name: 'Glass Tank', icon: 'tank', cost: 75, retired: true, place: 'land', category: 'contraption', tank: { cap: 4 },
    desc: 'Keep fish apart from the pond: safe from bears, fed for you, and they only breed with tank mates. Use the Tank tool to move fish in and out.', hp: 3, smashable: true, beauty: 1,
  },
  duck_nest: {
    name: 'Duck Nest', icon: 'egg', cost: 35, place: 'shore', category: 'farm', unlock: 'r_nests', nest: { kind: 'duck', cap: 4, eggs: 5 },
    desc: 'A cosy reed nest by the water. Home for up to 4 ducks; hens lay eggs here.', hp: 2, smashable: true, beauty: 0.5,
  },
  goose_nest: {
    name: 'Goose Nest', icon: 'egg', cost: 60, place: 'shore', category: 'farm', unlock: 'r_nests', nest: { kind: 'goose', cap: 3, eggs: 4 },
    desc: 'A big straw nest. Home for up to 3 geese. Geese chase rampaging bears!', hp: 3, smashable: true, beauty: 0.5,
  },
  // ------------------------------------------------------------ bear snacks
  berries: {
    sprite: ['blueberry', 'blueberry_picked'], name: 'Blueberry Bush', icon: 'berry', cost: 30, place: 'landOrPlatform', category: 'food', unlock: 'r_berrybush',
    desc: 'Grows from seed into a wild blueberry bush. Tap a ripe bush to harvest the batch, then serve the berries in a Snack Bowl. Grow them on a platform so rampagers can\'t trample them.',
    crop: true, hp: 2, smashable: true, beauty: 1,
  },
  beehive: {
    sprite: ['beehive_tree'], name: 'Beehive', icon: 'hive', cost: 60, place: 'nearWillow', category: 'food', unlock: 'r_bees',
    desc: 'Fills up with honey: tap to harvest the jars for bears with a sweet tooth (lucky batches: royal jelly!). Must be within 2 tiles of a willow (a platform works too).',
    crop: true, hp: 3, smashable: true, beauty: 1,
  },
  wildrice: {
    sprite: ['wildriceplot', 'wildrice'], name: 'Wild Rice', icon: 'wildrice', cost: 45, place: 'water', category: 'food', unlock: 'r_wildrice',
    desc: 'Manoomin, the good berry of the lakes. Grows in the shallows; bears slurp it like noodles.',
    crop: true, hp: 2, smashable: true, beauty: 1,
  },
  mushrooms: {
    sprite: ['mushlog'], name: 'Mushroom Log', icon: 'mushroom', cost: 55, place: 'landOrPlatform', category: 'food', unlock: 'r_mushrooms',
    desc: 'A mossy log sprouting chanterelles. Fancy bears pay extra for foraged mushrooms.',
    crop: true, hp: 2, smashable: true, beauty: 1,
  },
  maple: {
    sprite: ['sugarmaple', 'maple_red'], name: 'Sugar Maple', icon: 'maple', cost: 120, place: 'land', category: 'food', unlock: 'r_maple',
    desc: 'A tapped sugar maple dripping with syrup. Lumberjack bears go wild for it.',
    crop: true, hp: 99, smashable: false, blocksBear: true, beauty: 3,
  },
  raspberry: {
    name: 'Raspberry Cane', icon: 'berry', cost: 40, place: 'landOrPlatform', category: 'food', unlock: 'r_raspberry',
    desc: 'Plump red raspberries. Bears go back for seconds.', sprite: ['raspberry', 'raspberry_picked'],
    crop: true, hp: 2, smashable: true, beauty: 1.2,
  },
  strawberry: {
    name: 'Strawberry Patch', icon: 'berry', cost: 35, place: 'landOrPlatform', category: 'food', unlock: 'r_berrybush',
    desc: 'Low and sweet. Grows fast.', sprite: ['strawberry', 'strawberry_picked'],
    crop: true, hp: 1, smashable: true, beauty: 1.5,
  },
  saskatoon: {
    name: 'Saskatoon Bush', icon: 'berry', cost: 60, place: 'landOrPlatform', category: 'food', unlock: 'r_berries',
    desc: 'Prairie superfruit. Fills a bear right up.', sprite: ['saskatoon', 'saskatoon_picked'],
    crop: true, hp: 3, smashable: true, beauty: 1.5,
  },
  cranberry: {
    name: 'Cranberry Bog', icon: 'berry', cost: 45, place: 'shore', category: 'food', unlock: 'r_wildberries', landmark: 'swampshack',
    desc: 'Tart little gems from the swamp. Needs the shoreline.', sprite: ['cranberry', 'cranberry_picked'],
    crop: true, hp: 2, smashable: true, beauty: 1.5,
  },
  cloudberry: {
    name: 'Cloudberry', icon: 'berry', cost: 80, place: 'landOrPlatform', category: 'food', unlock: 'r_wildberries', landmark: 'firetower',
    desc: 'Rare golden berries from the north. Bears tip extra.', sprite: ['cloudberry', 'cloudberry_picked'],
    crop: true, hp: 2, smashable: true, beauty: 2.5,
  },
  elderberry: {
    name: 'Elderberry', icon: 'berry', cost: 55, place: 'landOrPlatform', category: 'food', unlock: 'r_wildberries', landmark: 'mushhut',
    desc: 'Dark and mysterious. Grows by magic mushrooms.', sprite: ['elderberry', 'elderberry_picked'],
    crop: true, hp: 2, smashable: true, beauty: 2,
  },
  goldenberry: {
    name: 'Goldenberry', icon: 'berry', cost: 200, place: 'landOrPlatform', category: 'food', unlock: 'r_wildberries', landmark: 'willowshrine',
    desc: 'Blessed by the Great Willow. Glows at night. Bears weep with joy.', sprite: ['goldenberry', 'goldenberry_picked'],
    crop: true, hp: 3, smashable: true, beauty: 5,
  },
  // ------------------------------------------------------------ garden (grows from seed, tap to harvest)
  carrot: {
    name: 'Carrot Patch', icon: 'carrot', cost: 15, place: 'land', category: 'food', unlock: 'r_carrot', crop: true,
    desc: 'Plant carrot seeds and watch them grow. Bears crunch them, beavers work 2 jobs per carrot.', hp: 1, smashable: true, beauty: 0.5,
  },
  lettuce: {
    name: 'Lettuce Bed', icon: 'lettuce', cost: 10, place: 'land', category: 'food', unlock: 'r_lettuce', crop: true,
    desc: 'Fast and leafy. Fish love a lettuce leaf, and lucky batches hide a four-leaf clover.', hp: 1, smashable: true, beauty: 0.5,
  },
  radish: {
    name: 'Radish Row', icon: 'radish', cost: 10, place: 'land', category: 'food', unlock: 'r_lettuce', crop: true,
    desc: 'The fastest crop in the garden. Small, peppery, popular with rabbits.', hp: 1, smashable: true, beauty: 0.5,
  },
  peas: {
    name: 'Sweet Pea Trellis', icon: 'peas', cost: 20, place: 'land', category: 'food', unlock: 'r_peas', crop: true,
    desc: 'Climbing peas. Shelled peas are a fish-breeder favourite.', hp: 1, smashable: true, beauty: 1,
  },
  potato: {
    name: 'Potato Hill', icon: 'potato', cost: 25, place: 'land', category: 'food', unlock: 'r_peas', crop: true,
    desc: 'Dig up a pile of spuds. Filling for bears, steady pay for beavers.', hp: 1, smashable: true, beauty: 0.5,
  },
  corn: {
    name: 'Sweet Corn', icon: 'corn', cost: 30, place: 'land', category: 'food', unlock: 'r_corn', crop: true,
    desc: 'Tall stalks of sweet corn. Beavers will do 3 jobs for a single cob. Lucky batches: rainbow corn!', hp: 2, smashable: true, beauty: 1,
  },
  sunflower: {
    name: 'Sunflowers', icon: 'sunflower', cost: 25, place: 'landOrPlatform', category: 'food', unlock: 'r_corn', crop: true,
    desc: 'Giant smiling flowers full of seeds. Songbirds and chipmunks adore them.', hp: 1, smashable: true, beauty: 2,
  },
  pumpkin: {
    name: 'Pumpkin Patch', icon: 'pumpkin', cost: 40, place: 'land', category: 'food', unlock: 'r_pumpkin', crop: true,
    desc: 'Slow, big and glorious. A legendary batch grows a GIANT pumpkin that fills a whole bear.', hp: 2, smashable: true, beauty: 1.5,
  },
  tomato: {
    name: 'Tomato Vines', icon: 'tomato', cost: 20, place: 'land', category: 'food', unlock: 'r_cabbage', crop: true,
    desc: 'Staked vines heavy with red tomatoes. Fish perk right up, bears want them on everything.', hp: 1, smashable: true, beauty: 1,
  },
  cabbage: {
    name: 'Cabbage Patch', icon: 'cabbage', cost: 15, place: 'land', category: 'food', unlock: 'r_cabbage', crop: true,
    desc: 'Big leafy heads. Filling for bears; fry that nibble the leaves grow faster.', hp: 1, smashable: true, beauty: 0.5,
  },
  // ------------------------------------------------------------ food storage (fill from the Food tool)
  snackbowl: {
    name: 'Snack Bowl', icon: 'bowl', cost: 20, place: 'landOrPlatform', category: 'food', unlock: 'r_snackbowl', storage: true,
    desc: 'Fill it with produce using the Food tool. Bears help themselves to a side dish (8 servings).', hp: 2, smashable: true,
  },
  pantry: {
    name: 'Bear Pantry', icon: 'pantry', cost: 120, place: 'land', category: 'food', unlock: 'r_pantry', storage: true, builder: 'beaver', buildTime: 6,
    desc: 'A big larder for 40 servings. Bears grab a snack on their way to the pond. Mice may sneak in at night!', hp: 4, smashable: true, beauty: 1,
  },
  beaverbar: {
    name: 'Beaver Snack Bar', icon: 'beaverbar', cost: 25, place: 'land', category: 'beaver', unlock: 'r_snackbar', storage: true, builder: 'beaver', buildTime: 4, freeLabour: true,
    desc: 'Beavers only work when PAID. Stock it with produce or Bug Bites: every serving pays for jobs. They build this one for free.', hp: 99, smashable: false,
  },
  buggrinder: {
    name: 'Bug Grinder 3000', icon: 'buggrinder', cost: 90, place: 'landOrPlatform', category: 'farm', unlock: 'r_buggrinder', builder: 'beaver', buildTime: 5,
    grinder: { radius: 3.5, per: 2, max: 30 },
    desc: 'A zapper lamp over a hopper: it catches bugs flying by and grinds every 2 into a scoop of Bug Bites fish food. Tap it to collect.', hp: 3, smashable: true,
  },
  rabbithutch: {
    name: 'Bunny Hutch', icon: 'rabbit', cost: 110, place: 'land', category: 'farm', unlock: 'r_bunnies', hutch: true,
    desc: 'Home for up to 4 tame bunnies. They hop around and fertilize crops within 3 tiles (+40% growth), and have babies when there\'s room.', hp: 3, smashable: true, beauty: 1.5,
  },
  // ------------------------------------------------------------ restaurant (beaver-built)
  bar: {
    name: 'Daisy Beer Bar', icon: 'bar', cost: 220, place: 'land', category: 'restaurant', unlock: 'r_bar', builder: 'beaver', buildTime: 12, size: [3, 1],
    desc: 'A proper bar with Daisy Beer on tap. Bears linger and tip.', comfort: 6, beauty: 4, hp: 99, smashable: false,
  },
  picnictable: {
    name: 'Picnic Table', icon: 'picnic', cost: 40, place: 'land', category: 'restaurant', unlock: 'r_picnic', builder: 'beaver', buildTime: 5, size: [2, 1],
    desc: 'Seats a family of bears.', comfort: 2, beauty: 1, hp: 3, smashable: true,
  },
  roundtable: {
    name: 'Bistro Table', icon: 'table', cost: 55, place: 'landOrPlatform', category: 'restaurant', unlock: 'r_bistro', builder: 'beaver', buildTime: 5,
    desc: 'Checkered cloth, two chairs. Romantic.', comfort: 2, beauty: 1.5, hp: 2, smashable: true,
  },
  umbrellatable: {
    name: 'Parasol Table', icon: 'umbrella', cost: 75, place: 'landOrPlatform', category: 'restaurant', unlock: 'r_parasol', builder: 'beaver', buildTime: 6,
    desc: 'Shade for sunburnt bears.', comfort: 3, beauty: 2, hp: 2, smashable: true,
  },
  bbq: {
    name: 'BBQ Grill', icon: 'bbq', cost: 90, place: 'land', category: 'restaurant', unlock: 'r_bbq', builder: 'beaver', buildTime: 6,
    desc: 'Sizzle sizzle. Bears smell it from the office.', comfort: 3, beauty: 1, bearBonus: 0.5, hp: 3, smashable: true,
  },
  hangout: {
    name: 'Campfire Hangout', icon: 'campfire', cost: 120, place: 'land', category: 'restaurant', unlock: 'r_hangout', builder: 'beaver', buildTime: 9, size: [2, 2],
    desc: 'Log benches round a crackling fire. The cozy heart of the place.', comfort: 5, beauty: 3, hp: 99, smashable: false,
  },
  hammock: {
    name: 'Hammock', icon: 'hammock', cost: 60, place: 'land', category: 'restaurant', unlock: 'r_parasol', builder: 'beaver', buildTime: 5,
    desc: 'Nap spot. Very relaxing.', comfort: 3, beauty: 1.5, hp: 2, smashable: true,
  },
  menuboard: {
    name: 'Menu Board', icon: 'sign', cost: 25, place: 'land', category: 'restaurant', unlock: 'r_picnic', builder: 'beaver', buildTime: 3,
    desc: 'Today\'s special: FISH. Bears decide faster.', comfort: 1, beauty: 0.5, hp: 2, smashable: true,
  },
  beercooler: {
    name: 'Daisy Cooler', icon: 'cooler', model: 'cooler', cost: 45, place: 'landOrPlatform', category: 'restaurant', unlock: 'r_bistro', builder: 'beaver', buildTime: 3,
    desc: 'Ice cold Daisy Beer. Happy bears tip.', comfort: 2, beauty: 0.5, hp: 2, smashable: true,
  },
  neonsign: {
    name: 'Neon Sign', icon: 'neon', cost: 150, place: 'land', category: 'restaurant', unlock: 'r_neon', builder: 'beaver', buildTime: 8, size: [3, 1],
    desc: 'BEAR\'S DINER in buzzing neon. Draws a crowd.', comfort: 1, beauty: 3, bearBonus: 1, hp: 3, smashable: true,
  },
  tikitorch: {
    name: 'Tiki Torch', icon: 'torch', cost: 20, place: 'landOrPlatform', category: 'restaurant', unlock: 'r_picnic', builder: 'beaver', buildTime: 3,
    desc: 'Flickery and festive.', comfort: 0.5, beauty: 1, hp: 1, smashable: true,
  },
  planterbox: {
    name: 'Planter Box', icon: 'flower', cost: 25, place: 'landOrPlatform', category: 'restaurant', unlock: 'r_bistro', builder: 'beaver', buildTime: 3,
    desc: 'Flowers in a box. Classy.', comfort: 0.5, beauty: 1.5, hp: 1, smashable: true,
  },
  jukebox: {
    name: 'Jukebox', icon: 'music', cost: 180, place: 'land', category: 'restaurant', unlock: 'r_jukebox', builder: 'beaver', buildTime: 8,
    desc: 'Plays the hits. Bears dance a little.', comfort: 4, beauty: 2, hp: 3, smashable: true,
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
    name: 'Lantern', icon: 'lantern', cost: 20, place: 'landOrPlatform', category: 'decor', unlock: 'r_decor0', beauty: 1, light: true,
    desc: 'A cosy lantern that glows at night.', hp: 1, smashable: true,
  },
  chair: {
    name: 'Muskoka Chair', icon: 'chair', cost: 30, place: 'landOrPlatform', category: 'decor', unlock: 'r_decor0', beauty: 2,
    desc: 'The classic red cottage chair.', hp: 1, smashable: true,
  },
  picnic: {
    name: 'Picnic Table', icon: 'picnic', cost: 45, place: 'landOrPlatform', category: 'decor', unlock: 'r_decor0', beauty: 3,
    desc: 'Checkered tablecloth, no ants (yet).', hp: 2, smashable: true,
  },
  mailbox: {
    name: 'Cottage Mailbox', icon: 'mailbox', cost: 25, place: 'land', category: 'decor', unlock: 'r_decor1', beauty: 1,
    desc: 'Red flag up: you\'ve got fan mail (and complaints).', hp: 1, smashable: true,
  },
  pinwheel: {
    name: 'Pinwheel', icon: 'pinwheel', cost: 15, place: 'landOrPlatform', category: 'decor', unlock: 'r_decor1', beauty: 1,
    desc: 'Spins in the breeze. Hypnotises the interns.', hp: 1, smashable: true,
  },
  bench: {
    name: 'Maple Bench', icon: 'bench', cost: 40, place: 'landOrPlatform', category: 'decor', unlock: 'r_decor1', beauty: 2,
    desc: 'A carved bench for digesting in style.', hp: 2, smashable: true,
  },
  birdhouse: {
    name: 'Birdhouse', icon: 'birdhouse', cost: 35, place: 'landOrPlatform', category: 'decor', unlock: 'r_garden', beauty: 2, birds: 2,
    desc: 'Chickadees move in and sing all day.', hp: 1, smashable: true,
  },
  birdbath: {
    name: 'Bird Bath', icon: 'birdbath', cost: 50, place: 'land', category: 'decor', unlock: 'r_garden', beauty: 3, birds: 2,
    desc: 'Blue jays and robins splash in it. Adorable.', hp: 2, smashable: true,
  },
  gnome: {
    name: 'Moose Gnome', icon: 'gnome', cost: 40, place: 'landOrPlatform', category: 'decor', unlock: 'r_garden', beauty: 2,
    desc: 'A garden gnome wearing antlers. Tasteful? No. Beloved? Yes.', hp: 1, smashable: true,
  },
  arch: {
    name: 'Flower Arch', icon: 'arch', cost: 90, place: 'land', category: 'decor', unlock: 'r_garden2', beauty: 5,
    desc: 'A trellis arch overflowing with climbing roses. Bears take selfies.', hp: 2, smashable: true,
  },
  stringlights: {
    name: 'String Lights', icon: 'stringlights', cost: 55, place: 'landOrPlatform', category: 'decor', unlock: 'r_lights', beauty: 3, light: true,
    desc: 'Warm fairy lights on little posts. Very date-night.', hp: 1, smashable: true,
  },
  stonelantern: {
    name: 'Stone Lantern', icon: 'stonelantern', cost: 70, place: 'land', category: 'decor', unlock: 'r_lights', beauty: 3, light: true,
    desc: 'A mossy stone lantern with a candle inside.', hp: 3, smashable: true,
  },
  campfire: {
    name: 'Campfire', icon: 'campfire', cost: 60, place: 'land', category: 'decor', unlock: 'r_canadiana', beauty: 4, light: true,
    desc: 'Crackling logs and marshmallows on sticks. Bears linger and pay more.', hp: 2, smashable: true,
  },
  flag: {
    name: 'Flag Pole', icon: 'flag', cost: 60, place: 'landOrPlatform', category: 'decor', unlock: 'r_canadiana', beauty: 4,
    desc: 'The red maple leaf, proudly flying.', hp: 2, smashable: true,
  },
  canoe: {
    name: 'Red Canoe', icon: 'canoe', cost: 80, place: 'shore', category: 'decor', unlock: 'r_canadiana', beauty: 4,
    desc: 'A cedar-strip canoe pulled up on the shore. Peak Canadian.', hp: 2, smashable: true,
  },
  hockey: {
    name: 'Hockey Net', icon: 'hockey', cost: 50, place: 'land', category: 'decor', unlock: 'r_canadiana', beauty: 3,
    desc: 'For pickup games on the frozen pond. Sorry, eh.', hp: 2, smashable: true,
  },
  moose: {
    name: 'Moose Statue', icon: 'moose', cost: 180, place: 'land', category: 'decor', unlock: 'r_canadiana2', beauty: 7,
    desc: 'A majestic carved moose. Tourist bears travel for miles to see it.', hp: 99, smashable: false, blocksBear: true,
  },
  stones: {
    name: 'Stepping Stones', icon: 'stones', cost: 30, place: 'water', category: 'decor', unlock: 'r_waterdecor', beauty: 2,
    desc: 'Flat mossy stones across the shallows. Frogs sunbathe on them.', hp: 99, smashable: false,
  },
  floatlantern: {
    name: 'Floating Lanterns', icon: 'floatlantern', cost: 40, place: 'water', category: 'decor', unlock: 'r_waterdecor', beauty: 3, light: true,
    desc: 'Paper lanterns drifting on the water. Magical at night.', hp: 1, smashable: true,
  },
  decoy: {
    name: 'Duck Decoy', icon: 'decoy', cost: 25, place: 'water', category: 'decor', unlock: 'r_waterdecor', beauty: 1,
    desc: 'A painted wooden mallard. Real ducks are confused and jealous.', hp: 1, smashable: true,
  },
  fountain: {
    name: 'Leaping Fish Fountain', icon: 'fountain', cost: 220, place: 'water', category: 'decor', unlock: 'r_waterdecor2', beauty: 8,
    desc: 'A bronze fish spouting water. Fish love the bubbles (+30% breeding nearby).', aerator: { radius: 3, boost: 0.3 }, hp: 99, smashable: false,
  },
  lighthouse: {
    name: 'Mini Lighthouse', icon: 'lighthouse', cost: 300, place: 'shore', category: 'decor', unlock: 'r_waterdecor2', beauty: 10, light: true,
    desc: 'A red-and-white Maritimes lighthouse with a spinning lamp. Guides hungry bears home.', hp: 99, smashable: false, blocksBear: true,
  },
};

// v14: facilities, woodwork, antiques
Object.assign(STRUCTURES, STRUCTURES_V14);

export const CHARM_CAP = 40; // max % bill bonus from beauty
export const BEAUTY_PER_BEAR = 10; // every N beauty brings one more customer

export const BUILD_CATEGORIES = [
  { id: 'nature', name: 'Nature' },
  { id: 'food', name: 'Garden & Snacks' },
  { id: 'restaurant', name: 'Restaurant' },
  { id: 'beaver', name: 'Beaver Works' },
  { id: 'contraption', name: 'Contraptions' },
  { id: 'decor', name: 'Decor' },
  { id: 'farm', name: 'Bugs & Birds' },
  { id: 'crops', name: 'Crops' },
  { id: 'woodwork', name: 'Woodwork' },
];
// [v18 bear events] defense builds (src/data/structuresDefense.js, optional): merged into STRUCTURES + a 'defense' build category
for (const m of Object.values(import.meta.glob('./structuresDefense.js', { eager: true }))) { Object.assign(STRUCTURES, m.STRUCTURES_DEFENSE || {}); if (m.DEFENSE_CATEGORY && !BUILD_CATEGORIES.some((c) => c.id === m.DEFENSE_CATEGORY.id)) BUILD_CATEGORIES.push(m.DEFENSE_CATEGORY); }

// Snack kinds bears can eat (meal points come from each structure's food.meal).
export const SNACKS = {
  seaweed: { name: 'Seaweed Salad', icon: 'seaweed' },
  berries: { name: 'Blueberries', icon: 'berry' },
  honey: { name: 'Honey', icon: 'honey' },
  rice: { name: 'Wild Rice', icon: 'wildrice' },
  mushroom: { name: 'Chanterelles', icon: 'mushroom' },
  syrup: { name: 'Maple Syrup', icon: 'syrup' },
};
