// Everything that can be eaten, kept in one inventory: state.food = { id: count }.
//   bag      fish food sold on e-Buy (counted in scoops: one tap throws one scoop)
//   made     Bug Bites, ground from bugs by the Bug Grinder
//   produce  harvested from your garden (fish, bears AND beavers eat it)
//   special  rare finds from lucky harvest batches
// What each eater gets:
//   fish   { fill, love, happy, grow, luck }  thrown into the water.
//          fill  = hunger removed per pellet
//          love  = "well fed" meter per pellet (fish need a full meter to breed)
//          happy = mood, grow = seconds of fast growth for fry,
//          luck  = mutation luck carried into the next clutch
//   bear   { meal, coins, snack }             served from a Snack Bowl / Pantry
//          (snack = the side-dish kind bears ask for: berries, honey, veggie...)
//   beaver { jobs }                           left at the Beaver Snack Bar:
//          beavers only work when paid, one serving pays this many jobs
// Bags also have packaging info (brand, mascot, colours) for the bag art.
export const FOOD_ITEMS = {
  // ------------------------------------------------------------ fish food bags
  pellets: {
    kind: 'bag', name: 'Classic Pellets', brand: "Reynard's", mascot: 'fox', tagline: 'Crunchy! Cheap! Mine!',
    colors: { main: '#e8742c', accent: '#fff1c8', dark: '#6a2a10', trim: '#ffd23a' },
    scoops: 40, price: 12, unlock: 'start', pellet: [0xb8742e, 0xa0622a],
    fish: { fill: 0.3, love: 0.34, happy: 0.02 },
    refill: { every: 14, upTo: 12 }, // the fox's "complimentary" scoops when you run low
    desc: 'Reynard\'s own brand. Fills bellies, gets fish in the mood. Refills a little by itself (don\'t ask).',
  },
  flakes: {
    kind: 'bag', name: 'Rainbow Flakes', brand: "Flakey Jake's", mascot: 'trout', tagline: 'Taste the rainbow trout!',
    colors: { main: '#2ab0b8', accent: '#ffe8f4', dark: '#14485a', trim: '#ff6aa8' },
    scoops: 30, price: 28, unlock: 'start', pellet: [0xff6a8a, 0xffd23a, 0x6ad04a, 0x4ab0ff],
    fish: { fill: 0.22, love: 0.3, happy: 0.12 },
    desc: 'Colourful flakes that float. Happy fish are prettier, and pretty fish sell.',
  },
  worms: {
    kind: 'bag', name: 'Wiggle Worms', brand: 'Dr. Wiggles', mascot: 'worm', tagline: 'Love is in the worm!',
    colors: { main: '#c8384a', accent: '#ffe0e0', dark: '#4a1020', trim: '#ffb0c0' },
    scoops: 25, price: 40, unlock: 'day:2', pellet: [0xd04a5a, 0xa83040],
    fish: { fill: 0.3, love: 0.6, happy: 0.04 },
    desc: 'Freeze-dried bloodworms. Fish get "well fed" twice as fast: the breeder\'s choice.',
  },
  krill: {
    kind: 'bag', name: 'Krill Thrill', brand: 'Captain Krill', mascot: 'krill', tagline: 'Grow up fast, matey!',
    colors: { main: '#24386a', accent: '#ffd0c0', dark: '#101830', trim: '#ff8a6a' },
    scoops: 25, price: 55, unlock: 'day:3', pellet: [0xff8a6a, 0xe06a4a],
    fish: { fill: 0.35, love: 0.34, grow: 40 },
    desc: 'Protein-packed krill. Fry that eat it grow up in no time.',
  },
  maple: {
    kind: 'bag', name: 'Maple Munchies', brand: 'Mountie Moose', mascot: 'moose', tagline: 'A bit of everything, eh?',
    colors: { main: '#d02a2a', accent: '#fff6ec', dark: '#5a0e0e', trim: '#ffc040' },
    scoops: 20, price: 70, unlock: 'day:4', pellet: [0xc8702a, 0xe8a040],
    fish: { fill: 0.4, love: 0.5, happy: 0.2, grow: 20 },
    desc: 'Maple-glazed bites from the True North. Happy, full and in love. Sorry, very tasty.',
  },
  caviar: {
    kind: 'bag', name: 'Royal Pearls', brand: 'Queen Sturgeon', mascot: 'sturgeon', tagline: 'Fit for a fishy queen.',
    colors: { main: '#5a2a8a', accent: '#fff4c8', dark: '#200a38', trim: '#ffc020' },
    scoops: 12, price: 180, unlock: 'day:5', pellet: [0x2a2a3a, 0x4a3a6a],
    fish: { fill: 0.3, love: 0.5, happy: 0.1, luck: 0.25 },
    desc: 'Luxury pearls. Fish that eat them carry mutation luck: rare morphs are far more likely.',
  },
  // ------------------------------------------------------------ made on site
  bugbites: {
    kind: 'made', name: 'Bug Bites', brand: 'Grinder Fresh', mascot: 'ladybug', tagline: 'Locally caught!',
    colors: { main: '#5aa83a', accent: '#fffbd0', dark: '#1e3a14', trim: '#ffd23a' },
    pellet: [0x4a7a2a, 0x6a4a2a], made: 'buggrinder',
    fish: { fill: 0.3, love: 0.55, grow: 15 }, beaver: { jobs: 1 },
    desc: 'Ground from the bugs your Bug Grinder catches. Great breeding food, and it\'s free.',
  },
  // ------------------------------------------------------------ garden produce
  blueberry: { kind: 'produce', name: 'Blueberries', icon: 'berry', snack: 'berries', from: 'berries', pellet: [0x3a4ab0], fish: { fill: 0.15, love: 0.2, happy: 0.05 }, bear: { meal: 0.6 }, beaver: { jobs: 1 } },
  raspberry: { kind: 'produce', name: 'Raspberries', icon: 'berry', snack: 'berries', from: 'raspberry', pellet: [0xd02a4a], fish: { fill: 0.15, love: 0.2, happy: 0.05 }, bear: { meal: 0.7 }, beaver: { jobs: 1 } },
  strawberry: { kind: 'produce', name: 'Strawberries', icon: 'berry', snack: 'berries', from: 'strawberry', pellet: [0xe8303a], fish: { fill: 0.15, love: 0.2, happy: 0.08 }, bear: { meal: 0.5 }, beaver: { jobs: 1 } },
  saskatoon: { kind: 'produce', name: 'Saskatoons', icon: 'berry', snack: 'berries', from: 'saskatoon', pellet: [0x5a3a7a], fish: { fill: 0.2, love: 0.2 }, bear: { meal: 0.9 }, beaver: { jobs: 1 } },
  cranberry: { kind: 'produce', name: 'Cranberries', icon: 'berry', snack: 'berries', from: 'cranberry', pellet: [0xb0202a], fish: { fill: 0.15, love: 0.25 }, bear: { meal: 0.6 }, beaver: { jobs: 1 } },
  cloudberry: { kind: 'produce', name: 'Cloudberries', icon: 'berry', snack: 'berries', from: 'cloudberry', pellet: [0xf0a040], fish: { fill: 0.2, love: 0.3, happy: 0.1 }, bear: { meal: 1.1, coins: 3 }, beaver: { jobs: 2 } },
  elderberry: { kind: 'produce', name: 'Elderberries', icon: 'berry', snack: 'berries', from: 'elderberry', pellet: [0x2a1a3a], fish: { fill: 0.2, love: 0.25, luck: 0.03 }, bear: { meal: 0.8, coins: 1 }, beaver: { jobs: 1 } },
  goldenberry: { kind: 'produce', name: 'Goldenberries', icon: 'berry', snack: 'berries', from: 'goldenberry', pellet: [0xffc020], fish: { fill: 0.25, love: 0.4, luck: 0.08 }, bear: { meal: 1.6, coins: 8 }, beaver: { jobs: 3 } },
  honey: { kind: 'produce', name: 'Honey Jar', icon: 'honey', snack: 'honey', from: 'beehive', pellet: [0xf0b020], fish: { fill: 0.1, happy: 0.1 }, bear: { meal: 0.8 }, beaver: { jobs: 2 } },
  wildrice: { kind: 'produce', name: 'Wild Rice', icon: 'wildrice', snack: 'rice', from: 'wildrice', pellet: [0x8a6a3a], fish: { fill: 0.25, love: 0.2 }, bear: { meal: 0.7 }, beaver: { jobs: 1 } },
  chanterelle: { kind: 'produce', name: 'Chanterelles', icon: 'mushroom', snack: 'mushroom', from: 'mushrooms', pellet: [0xf0a030], fish: { fill: 0.15, grow: 8 }, bear: { meal: 0.7, coins: 2 }, beaver: { jobs: 1 } },
  syrup: { kind: 'produce', name: 'Maple Syrup', icon: 'syrup', snack: 'syrup', from: 'maple', pellet: [0xb8601a], fish: { fill: 0.1, happy: 0.12 }, bear: { meal: 1 }, beaver: { jobs: 2 } },
  carrot: { kind: 'produce', name: 'Carrots', icon: 'carrot', snack: 'veggie', from: 'carrot', pellet: [0xf07a1a], fish: { fill: 0.15, grow: 10 }, bear: { meal: 0.6 }, beaver: { jobs: 2 } },
  lettuce: { kind: 'produce', name: 'Lettuce', icon: 'lettuce', snack: 'veggie', from: 'lettuce', pellet: [0x7ad04a], fish: { fill: 0.2, happy: 0.06 }, bear: { meal: 0.4 }, beaver: { jobs: 2 } },
  peas: { kind: 'produce', name: 'Sweet Peas', icon: 'peas', snack: 'veggie', from: 'peas', pellet: [0x5ac03a], fish: { fill: 0.25, love: 0.3 }, bear: { meal: 0.5 }, beaver: { jobs: 1 } },
  corn: { kind: 'produce', name: 'Sweet Corn', icon: 'corn', snack: 'veggie', from: 'corn', pellet: [0xffd23a], fish: { fill: 0.2, love: 0.15 }, bear: { meal: 0.8 }, beaver: { jobs: 3 } },
  pumpkin: { kind: 'produce', name: 'Pumpkin', icon: 'pumpkin', snack: 'veggie', from: 'pumpkin', pellet: [0xf08a2a], fish: { fill: 0.3, grow: 12 }, bear: { meal: 1.4, coins: 2 }, beaver: { jobs: 3 } },
  potato: { kind: 'produce', name: 'Potatoes', icon: 'potato', snack: 'veggie', from: 'potato', pellet: [0xc8a060], fish: { fill: 0.25 }, bear: { meal: 0.9 }, beaver: { jobs: 2 } },
  radish: { kind: 'produce', name: 'Radishes', icon: 'radish', snack: 'veggie', from: 'radish', pellet: [0xe04a6a], fish: { fill: 0.12, love: 0.15 }, bear: { meal: 0.4 }, beaver: { jobs: 1 } },
  sunflower: { kind: 'produce', name: 'Sunflower Seeds', icon: 'sunflower', snack: 'veggie', from: 'sunflower', pellet: [0x3a3020, 0xe8d8a0], fish: { fill: 0.15, love: 0.2, happy: 0.08 }, bear: { meal: 0.5 }, beaver: { jobs: 2 } },
  // ------------------------------------------------------------ special finds (lucky batches)
  golden_carrot: { kind: 'special', rarity: 4, name: 'Golden Carrot', icon: 'golden_carrot', snack: 'veggie', from: 'carrot', pellet: [0xffc020], fish: { fill: 0.3, love: 1, luck: 0.4 }, bear: { meal: 1.5, coins: 40 }, beaver: { jobs: 12 }, desc: 'Solid gold and somehow crunchy. Beavers will work a week for one.' },
  giant_pumpkin: { kind: 'special', rarity: 3, name: 'Giant Pumpkin', icon: 'giant_pumpkin', snack: 'veggie', from: 'pumpkin', pellet: [0xf08a2a], fish: { fill: 0.6, grow: 60 }, bear: { meal: 3, coins: 25 }, beaver: { jobs: 8 }, desc: 'Fills a whole bear. Wins county fairs.' },
  moonberry: { kind: 'special', rarity: 3, name: 'Moonberry', icon: 'moonberry', snack: 'berries', from: 'berries', pellet: [0x9ad4ff], fish: { fill: 0.2, love: 0.6, luck: 0.35 }, bear: { meal: 1, coins: 15 }, beaver: { jobs: 4 }, desc: 'Glows softly. Fish that eat it dream in rare colours.' },
  clover: { kind: 'special', rarity: 2, name: 'Four-Leaf Clover', icon: 'clover', snack: 'veggie', from: 'lettuce', pellet: [0x3ac04a], fish: { fill: 0.1, love: 0.3, luck: 0.2 }, bear: { meal: 0.3, coins: 10 }, beaver: { jobs: 4 }, desc: 'Lucky! Mutation luck for the fish that nibbles it.' },
  royal_jelly: { kind: 'special', rarity: 3, name: 'Royal Jelly', icon: 'royal_jelly', snack: 'honey', from: 'beehive', pellet: [0xfff0a0], fish: { fill: 0.2, love: 1, luck: 0.15 }, bear: { meal: 1, coins: 20 }, beaver: { jobs: 5 }, desc: 'Queen bee food. Instantly puts a fish in the mood.' },
  truffle: { kind: 'special', rarity: 3, name: 'Golden Truffle', icon: 'truffle', snack: 'mushroom', from: 'mushrooms', pellet: [0x6a4a2a], fish: { fill: 0.2, grow: 20 }, bear: { meal: 1.2, coins: 35 }, beaver: { jobs: 6 }, desc: 'Fancy bears weep. Executive bears tip.' },
  maple_gem: { kind: 'special', rarity: 4, name: 'Maple Diamond', icon: 'maple_gem', snack: 'syrup', from: 'maple', pellet: [0xe08a2a], fish: { fill: 0.1, happy: 0.4, luck: 0.2 }, bear: { meal: 1, coins: 60 }, beaver: { jobs: 10 }, desc: 'A crystal of pure maple sugar. Worth a small fortune.' },
  pearl_rice: { kind: 'special', rarity: 2, name: 'Pearl Rice', icon: 'pearl_rice', snack: 'rice', from: 'wildrice', pellet: [0xf4f0e0], fish: { fill: 0.4, love: 0.6, grow: 30 }, bear: { meal: 1, coins: 8 }, beaver: { jobs: 3 }, desc: 'Shimmering grains. Fish grow and fall in love.' },
  rainbow_corn: { kind: 'special', rarity: 3, name: 'Rainbow Corn', icon: 'rainbow_corn', snack: 'veggie', from: 'corn', pellet: [0xff6a8a, 0x6ad04a, 0x4ab0ff], fish: { fill: 0.3, happy: 0.3, luck: 0.2 }, bear: { meal: 1.2, coins: 18 }, beaver: { jobs: 6 }, desc: 'Every kernel a different colour. Pure joy, also lucky.' },
  sun_seed: { kind: 'special', rarity: 2, name: 'Sunburst Seed', icon: 'sun_seed', snack: 'veggie', from: 'sunflower', pellet: [0xffd23a], fish: { fill: 0.2, love: 0.4, happy: 0.2 }, bear: { meal: 0.6, coins: 9 }, beaver: { jobs: 4 }, desc: 'A seed as warm as a summer afternoon.' },
};
export const FOOD_IDS = Object.keys(FOOD_ITEMS);
export const BAG_IDS = FOOD_IDS.filter((id) => FOOD_ITEMS[id].kind === 'bag' || FOOD_ITEMS[id].kind === 'made');
export const STARTING_FOOD = { pellets: 30 };

// snack kinds bears ask for (side dishes)
export const SNACK_KINDS = {
  berries: { name: 'berries', icon: 'berry' },
  honey: { name: 'honey', icon: 'honey' },
  rice: { name: 'wild rice', icon: 'wildrice' },
  mushroom: { name: 'mushrooms', icon: 'mushroom' },
  syrup: { name: 'maple syrup', icon: 'syrup' },
  veggie: { name: 'veggies', icon: 'carrot' },
  seaweed: { name: 'seaweed salad', icon: 'seaweed' },
};

// what a Snack Bowl / Pantry / Beaver Snack Bar can hold
export const STORAGE = {
  snackbowl: { cap: 8, for: 'bear' },
  pantry: { cap: 40, for: 'bear' },
  beaverbar: { cap: 24, for: 'beaver' },
};

export function foodUses(id) {
  const f = FOOD_ITEMS[id];
  if (!f) return [];
  const u = [];
  if (f.fish) u.push('fish');
  if (f.bear) u.push('bear');
  if (f.beaver) u.push('beaver');
  return u;
}
