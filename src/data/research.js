// Research tree for Reynard's secret lab. Laid out like a skill tree:
// every BRANCH is a horizontal row, `col` is the node's slot along the row.
// Lines are drawn from each `req` parent to the node (parents may live in
// another row, which draws an elbow pipe between the rows).
// `mods` are additive deltas on BASE_MODS. `species` / `build` unlock content.
export const BRANCHES = [
  { id: 'panfish', name: 'Sunfish & Bass', icon: 'fish', color: '#4fb0d8' },
  { id: 'trout', name: 'Trout & Char', icon: 'fish', color: '#58c0a0' },
  { id: 'salmon', name: 'Salmon Run', icon: 'fish', color: '#e0604a' },
  { id: 'biggame', name: 'Big Game', icon: 'fish', color: '#8a9a3a' },
  { id: 'breed', name: 'Breeding Lab', icon: 'heart', color: '#f070a0' },
  { id: 'genes', name: 'Gene Splicing', icon: 'dna', color: '#b070f0' },
  { id: 'pond', name: 'Pond Life', icon: 'lilypad', color: '#6ac050' },
  { id: 'snack', name: 'Snack Bar', icon: 'berry', color: '#e8a030' },
  { id: 'beaver', name: 'Beaver Works', icon: 'beaver', color: '#c88a48' },
  { id: 'gizmo', name: 'Contraptions', icon: 'gear', color: '#a0a8b8' },
  { id: 'decor', name: 'Curb Appeal', icon: 'flower', color: '#f08ac0' },
  { id: 'biz', name: 'Business', icon: 'coins', color: '#f0c040' },
  { id: 'tools', name: 'Fox Tools', icon: 'hand', color: '#f08a3a' },
];

export const RESEARCH = [
  // ---------------- Sunfish & Bass
  { id: 'r_pumpkinseed', branch: 'panfish', col: 0, name: 'Pumpkinseed Eggs', icon: 'fish', cost: 30, req: [], species: 'pumpkinseed', desc: 'Stock Pumpkinseed eggs in the shop. A pumpkin-orange sunfish with turquoise war paint.' },
  { id: 'r_goldfish', branch: 'panfish', col: 1, name: 'Pond Goldfish', icon: 'fish', cost: 45, req: ['r_pumpkinseed'], species: 'goldfish', desc: 'Adopt flushed goldfish. Breeds fast. Try crossing it with a Pumpkinseed...' },
  { id: 'r_perch', branch: 'panfish', col: 2, name: 'Yellow Perch', icon: 'fish', cost: 60, req: ['r_pumpkinseed'], species: 'perch', desc: 'Stock Yellow Perch eggs. Tastier than bluegill, and bears adore the stripes.' },
  { id: 'r_smallmouth', branch: 'panfish', col: 3, name: 'Smallmouth Bass', icon: 'fish', cost: 110, req: ['r_perch'], species: 'smallmouth', desc: 'Stock Smallmouth Bass: the bronzeback that punches above its weight.' },
  { id: 'r_bass', branch: 'panfish', col: 4, name: 'Largemouth Bass', icon: 'fish', cost: 160, req: ['r_smallmouth'], species: 'bass', desc: 'Stock Largemouth Bass. A hearty meal for a hungry suit.' },
  // ---------------- Trout & Char
  { id: 'r_brook', branch: 'trout', col: 2, name: 'Brook Trout', icon: 'fish', cost: 180, req: ['r_perch'], species: 'brook', desc: 'Stock Brook Trout, the speckled jewel of the north.' },
  { id: 'r_rainbow', branch: 'trout', col: 3, name: 'Rainbow Trout', icon: 'fish', cost: 280, req: ['r_brook'], species: 'rainbow', desc: 'Stock Rainbow Trout. Cross it with a Brook Trout for something... stripey.' },
  { id: 'r_laketrout', branch: 'trout', col: 4, name: 'Lake Trout', icon: 'fish', cost: 380, req: ['r_rainbow'], species: 'laketrout', desc: 'Stock Lake Trout from the cold Shield lakes. Rumour has it they hybridise with Brookies.' },
  { id: 'r_grayling', branch: 'trout', col: 5, name: 'Arctic Grayling', icon: 'fish', cost: 520, req: ['r_laketrout'], species: 'grayling', desc: 'Stock Arctic Grayling: a slim silver fish flying a giant purple sail. Adds beauty just by existing.' },
  { id: 'r_char', branch: 'trout', col: 6, name: 'Arctic Char', icon: 'fish', cost: 1100, req: ['r_grayling'], species: 'char', desc: 'Stock Arctic Char from the far north. Sapphire back, sunset belly, luxury prices.' },
  // ---------------- Salmon Run
  { id: 'r_whitefish', branch: 'salmon', col: 3, name: 'Lake Whitefish', icon: 'fish', cost: 240, req: ['r_brook'], species: 'whitefish', desc: 'Stock Lake Whitefish. Humble, silver, and the backbone of every fish fry.' },
  { id: 'r_sockeye', branch: 'salmon', col: 4, name: 'Sockeye Salmon', icon: 'fish', cost: 460, req: ['r_whitefish', 'r_rainbow'], species: 'sockeye', desc: 'Stock Sockeye Salmon, the blazing red pride of B.C.' },
  { id: 'r_chinook', branch: 'salmon', col: 5, name: 'Chinook Salmon', icon: 'fish', cost: 780, req: ['r_sockeye'], species: 'chinook', desc: 'Stock the king salmon. Heavy as a briefcase full of quarterly reports.' },
  // ---------------- Big Game
  { id: 'r_walleye', branch: 'biggame', col: 4, name: 'Walleye', icon: 'fish', cost: 520, req: ['r_bass'], species: 'walleye', desc: 'Stock Walleye. Glow-in-the-dark eyes and Canada\'s favourite fish fry.' },
  { id: 'r_pike', branch: 'biggame', col: 5, name: 'Northern Pike', icon: 'fish', cost: 640, req: ['r_walleye'], species: 'pike', desc: 'Stock Northern Pike ("the baguette"). Pike × Walleye makes something spooky.' },
  { id: 'r_burbot', branch: 'biggame', col: 6, name: 'Burbot', icon: 'fish', cost: 700, req: ['r_pike'], species: 'burbot', desc: 'Stock Burbot, a.k.a. "the lawyer". Slimy, whiskered, and the Legal department\'s favourite.' },
  { id: 'r_muskie', branch: 'biggame', col: 7, name: 'Muskellunge', icon: 'fish', cost: 1400, req: ['r_burbot'], species: 'muskie', desc: 'Stock Muskies, the fish of ten thousand casts. Cross with a Pike for a Tiger Muskie.' },
  { id: 'r_sturgeon', branch: 'biggame', col: 8, name: 'Lake Sturgeon', icon: 'fish', cost: 2600, req: ['r_muskie', 'r_char'], species: 'sturgeon', desc: 'Stock the armoured Lake Sturgeon, a living dinosaur. One of these feeds a CEO.' },
  // ---------------- Breeding Lab
  { id: 'r_food1', branch: 'breed', col: 0, name: 'Tasty Pellets', icon: 'food', cost: 40, req: [], desc: 'Fish food is 50% more filling, so your fish stay in the mood.', mods: { foodMult: 0.5 } },
  { id: 'r_love1', branch: 'breed', col: 1, name: 'Mood Lighting', icon: 'heart', cost: 70, req: ['r_food1'], desc: 'Candles, jazz, a little Céline Dion... fish breed 30% faster.', mods: { breedMult: 0.3 } },
  { id: 'r_growth', branch: 'breed', col: 2, name: 'Growth Formula', icon: 'flask', cost: 150, req: ['r_love1'], desc: 'Fry grow up 50% faster.', mods: { growthMult: 0.5 } },
  { id: 'r_clutch', branch: 'breed', col: 3, name: 'Bigger Clutches', icon: 'egg', cost: 260, req: ['r_growth'], desc: '+1 egg in every clutch.', mods: { clutchBonus: 1 } },
  { id: 'r_love2', branch: 'breed', col: 4, name: 'Fish Love Songs', icon: 'music', cost: 600, req: ['r_clutch'], desc: 'Serenade them with loon calls: +40% breeding speed.', mods: { breedMult: 0.4 } },
  { id: 'r_fatten', branch: 'breed', col: 5, name: 'Premium Feed', icon: 'coin', cost: 700, req: ['r_love2'], desc: 'Plump, glossy fish: bears pay 25% more for every fish.', mods: { fishValueMult: 0.25 } },
  // ---------------- Gene Splicing
  { id: 'r_eggslot', branch: 'genes', col: 1, name: 'Egg Tray', icon: 'egg', cost: 90, req: ['r_love1'], desc: '+1 egg slot, so you can incubate more eggs at once.', mods: { eggSlots: 1 } },
  { id: 'r_genetics', branch: 'genes', col: 2, name: 'Genetics Lab', icon: 'dna', cost: 300, req: ['r_eggslot'], desc: 'Cross-breeds produce hybrids twice as often, and the Fishdex reveals hybrid recipes.', mods: { hybridMult: 1 } },
  { id: 'r_morphs', branch: 'genes', col: 3, name: 'Colour Morphs', icon: 'palette', cost: 420, req: ['r_genetics'], desc: 'Rare colour morphs (albino, calico, ghost...) show up twice as often.', mods: { morphMult: 1 } },
  { id: 'r_traits', branch: 'genes', col: 4, name: 'Personality Test', icon: 'sparkle', cost: 520, req: ['r_morphs'], desc: 'Good traits (Chonky, Speedy, Lucky...) are twice as likely, bad ones half as likely.', mods: { traitMult: 1 } },
  { id: 'r_eggslot2', branch: 'genes', col: 5, name: 'Egg Rack', icon: 'egg', cost: 650, req: ['r_traits'], desc: '+1 more egg slot, and eggs hatch 25% faster.', mods: { eggSlots: 1, hatchSpeed: 0.25 } },
  { id: 'r_golden', branch: 'genes', col: 6, name: 'Golden Genes', icon: 'fish_gold', cost: 1200, req: ['r_eggslot2'], desc: 'Golden fish (worth 5x) hatch 3x as often. Prismatic fish, too.', mods: { goldenMult: 2 } },
  // ---------------- Pond Life
  { id: 'r_duckweed', branch: 'pond', col: 0, name: 'Duckweed & Reeds', icon: 'duckweed', cost: 35, req: [], build: ['duckweed', 'reeds'], desc: 'Plant floating duckweed (fry food + hiding) and rustling reeds (bugs + songbirds).' },
  { id: 'r_lilypad', branch: 'pond', col: 1, name: 'Lily Pads', icon: 'lilypad', cost: 60, req: ['r_duckweed'], build: 'lilypad', desc: 'Build Lily Pads: bug magnets, frog hangouts and shady hiding spots.' },
  { id: 'r_bughotel', branch: 'pond', col: 2, name: 'Bug Hotel', icon: 'bughotel', cost: 160, req: ['r_lilypad'], build: 'bughotel', desc: 'Build Bug Hotels that swarm with dragonflies.' },
  { id: 'r_bugs2', branch: 'pond', col: 3, name: 'Bug Buffet', icon: 'bug', cost: 340, req: ['r_bughotel'], desc: 'Bug spawners work 50% faster and hold +1 bug.', mods: { bugMult: 0.5, bugBonus: 1 } },
  { id: 'r_bigpond', branch: 'pond', col: 4, name: 'Deep Pond', icon: 'pond', cost: 420, req: ['r_bugs2'], desc: 'The pond holds 25% more fish.', mods: { capacityMult: 0.25 } },
  { id: 'r_bigpond2', branch: 'pond', col: 5, name: 'Glacier Spring', icon: 'pond', cost: 1000, req: ['r_bigpond'], desc: 'Ice-cold spring water: the pond holds another 25% more fish.', mods: { capacityMult: 0.25 } },
  // ---------------- Snack Bar
  { id: 'r_flowers', branch: 'snack', col: 0, name: 'Wildflowers', icon: 'flower', cost: 40, req: [], build: ['flowers', 'fern'], desc: 'Plant fireweed, lupines and ferns. Pretty, and bees love them.' },
  { id: 'r_berries', branch: 'snack', col: 1, name: 'Bumper Crop', icon: 'berry', cost: 70, req: ['r_flowers'], desc: 'Every bear enjoys a side dish, and side dishes mean fewer fish eaten! All snacks regrow 25% faster.', mods: { produceMult: 0.25 } },
  { id: 'r_willow', branch: 'snack', col: 2, name: 'Weeping Willow', icon: 'willow', cost: 110, req: ['r_berries'], build: 'willow', desc: 'Plant willows. Bees only nest near willows.' },
  { id: 'r_bees', branch: 'snack', col: 3, name: 'Beekeeping', icon: 'hive', cost: 170, req: ['r_willow'], build: 'beehive', desc: 'Build beehives near willows. Accountants demand honey.' },
  { id: 'r_wildrice', branch: 'snack', col: 4, name: 'Wild Rice Paddy', icon: 'wildrice', cost: 260, req: ['r_bees'], build: 'wildrice', desc: 'Grow wild rice in the shallows. Bears slurp it like noodles.' },
  { id: 'r_mushrooms', branch: 'snack', col: 5, name: 'Mushroom Logs', icon: 'mushroom', cost: 340, req: ['r_wildrice'], build: 'mushrooms', desc: 'Inoculate logs with chanterelles. Critics go wild for foraged food.' },
  { id: 'r_maple', branch: 'snack', col: 6, name: 'Sugar Maples', icon: 'maple', cost: 420, req: ['r_mushrooms'], build: 'maple', desc: 'Tap sugar maples for syrup. Lumberjacks go wild.' },
  { id: 'r_fert', branch: 'snack', col: 7, name: 'Compost Magic', icon: 'sparkle', cost: 600, req: ['r_maple'], desc: 'Seaweed, honey, rice, mushrooms, syrup & berries regrow 50% faster.', mods: { produceMult: 0.5 } },
  { id: 'r_bigsnack', branch: 'snack', col: 8, name: 'All-You-Can-Eat', icon: 'food', cost: 900, req: ['r_fert'], desc: 'Every snack serving fills bears 50% more.', mods: { snackMealMult: 0.5 } },
  // ---------------- Beaver Works
  { id: 'r_beavers', branch: 'beaver', col: 0, name: 'Hire Beavers', icon: 'beaver', cost: 100, req: [], build: 'lodge', desc: 'Build a Beaver Lodge. Beavers build dams, fences, platforms & contraptions.' },
  { id: 'r_dams', branch: 'beaver', col: 1, name: 'Beaver Dams', icon: 'dam', cost: 70, req: ['r_beavers'], build: 'dam', desc: 'Dams block fish and bears. Wall off a safe nursery!' },
  { id: 'r_fences', branch: 'beaver', col: 2, name: 'Log Fences', icon: 'fence', cost: 70, req: ['r_dams'], build: 'fence', desc: 'Fences keep bears out on land.' },
  { id: 'r_platforms', branch: 'beaver', col: 3, name: 'Stilt Platforms', icon: 'platform', cost: 170, req: ['r_fences'], build: 'platform', desc: 'Raised decks: rampage-proof farming, and fish hide beneath.' },
  { id: 'r_gates', branch: 'beaver', col: 4, name: 'Sluice Gates', icon: 'gate', cost: 220, req: ['r_platforms'], build: 'gate', desc: 'Openable dams: let fish out of the nursery on your terms.' },
  { id: 'r_tools', branch: 'beaver', col: 5, name: 'Power Tools', icon: 'hammer', cost: 320, req: ['r_gates'], desc: 'Beavers build and repair twice as fast.', mods: { buildSpeed: 1 } },
  { id: 'r_union', branch: 'beaver', col: 6, name: 'Beaver Union', icon: 'beaver', cost: 520, req: ['r_tools'], desc: '+1 beaver per lodge (they wanted dental).', mods: { beaverBonus: 1 } },
  // ---------------- Contraptions
  { id: 'r_feeder', branch: 'gizmo', col: 2, name: 'Auto-Feeder', icon: 'feeder', cost: 240, req: ['r_fences'], build: 'feeder', desc: 'A contraption that feeds your fish for you.' },
  { id: 'r_sprinkler', branch: 'gizmo', col: 3, name: 'Sprinkler', icon: 'sprinkler', cost: 280, req: ['r_feeder'], build: 'sprinkler', desc: 'A rain-barrel sprinkler: snacks nearby regrow 60% faster.' },
  { id: 'r_hatchery', branch: 'gizmo', col: 4, name: 'Egg Incubator', icon: 'incubator', cost: 380, req: ['r_sprinkler'], build: 'hatchery', desc: 'A heat-lamp incubator: +1 egg slot each, and eggs hatch faster.' },
  { id: 'r_buglamp', branch: 'gizmo', col: 5, name: 'Bug Lamp', icon: 'buglamp', cost: 300, req: ['r_hatchery'], build: 'buglamp', desc: 'A humming porch lamp that draws moths and beetles for your fish.' },
  { id: 'r_aerator', branch: 'gizmo', col: 6, name: 'Bubble Aerator', icon: 'aerator', cost: 480, req: ['r_buglamp'], build: 'aerator', desc: 'Bubbles make fish frisky: +60% breeding nearby.' },
  // ---------------- Curb Appeal
  { id: 'r_decor1', branch: 'decor', col: 0, name: 'Cottage Kitsch', icon: 'pinwheel', cost: 40, req: [], build: ['mailbox', 'pinwheel', 'bench'], desc: 'Mailbox, pinwheel and a maple bench. Beauty brings more customers and bigger bills.' },
  { id: 'r_garden', branch: 'decor', col: 1, name: 'Garden Party', icon: 'birdhouse', cost: 90, req: ['r_decor1'], build: ['birdhouse', 'birdbath', 'gnome'], desc: 'Birdhouses, bird baths and a moose gnome. Songbirds move in!' },
  { id: 'r_lights', branch: 'decor', col: 2, name: 'Mood Lighting II', icon: 'lantern', cost: 150, req: ['r_garden'], build: ['stringlights', 'stonelantern'], desc: 'String lights and stone lanterns for magical evenings.' },
  { id: 'r_canadiana', branch: 'decor', col: 3, name: 'True North', icon: 'flag', cost: 220, req: ['r_lights'], build: ['flag', 'canoe', 'hockey', 'campfire'], desc: 'Flag pole, red canoe, hockey net and a crackling campfire. Peak Canadian.' },
  { id: 'r_waterdecor', branch: 'decor', col: 4, name: 'Water Garden', icon: 'floatlantern', cost: 260, req: ['r_canadiana'], build: ['stones', 'floatlantern', 'decoy'], desc: 'Stepping stones, floating lanterns and a duck decoy.' },
  { id: 'r_garden2', branch: 'decor', col: 5, name: 'Rose Arch', icon: 'arch', cost: 320, req: ['r_waterdecor'], build: 'arch', desc: 'A climbing-rose flower arch. Bears line up for selfies.' },
  { id: 'r_canadiana2', branch: 'decor', col: 6, name: 'Moose Monument', icon: 'moose', cost: 480, req: ['r_garden2'], build: 'moose', desc: 'A majestic carved moose statue. Tourists travel for miles.' },
  { id: 'r_waterdecor2', branch: 'decor', col: 7, name: 'Grand Features', icon: 'lighthouse', cost: 800, req: ['r_canadiana2'], build: ['fountain', 'lighthouse'], desc: 'A leaping-fish fountain and a Maritimes mini lighthouse.' },
  { id: 'r_beauty', branch: 'decor', col: 8, name: 'Beauty Pageant', icon: 'trophy', cost: 1200, req: ['r_waterdecor2'], desc: 'Every beauty point counts 50% more.', mods: { beautyMult: 0.5 } },
  // ---------------- Business
  { id: 'r_price1', branch: 'biz', col: 0, name: 'Price Hike', icon: 'coin', cost: 60, req: [], desc: 'Charge bears 20% more. They\'ll pay. Heh.', mods: { payMult: 0.2 } },
  { id: 'r_chairs', branch: 'biz', col: 1, name: 'Waiting Room', icon: 'chair', cost: 110, req: ['r_price1'], desc: 'Magazines and a water cooler: bears are 30% more patient.', mods: { patienceMult: 0.3 } },
  { id: 'r_tipjar', branch: 'biz', col: 2, name: 'Tip Jar', icon: 'coins', cost: 180, req: ['r_chairs'], desc: 'Snack bonuses and tips are 50% bigger.', mods: { tipMult: 0.5 } },
  { id: 'r_stress', branch: 'biz', col: 3, name: 'Stress Balls', icon: 'bear_happy', cost: 260, req: ['r_tipjar'], desc: '35% of angry bears calm down instead of rampaging.', mods: { calmChance: 0.35 } },
  { id: 'r_sign', branch: 'biz', col: 4, name: 'Neon Sign', icon: 'bolt', cost: 380, req: ['r_stress'], desc: '+1 more bear comes every evening.', mods: { bearBonus: 1 } },
  { id: 'r_pr', branch: 'biz', col: 5, name: 'PR Department', icon: 'newspaper', cost: 520, req: ['r_sign'], desc: 'Bad reviews hurt your rating 40% less.', mods: { badReviewMult: -0.4 } },
  { id: 'r_price2', branch: 'biz', col: 6, name: 'Surge Pricing', icon: 'chart', cost: 750, req: ['r_pr'], desc: 'Another +30% on every bill.', mods: { payMult: 0.3 } },
  { id: 'r_calm2', branch: 'biz', col: 7, name: 'Anger Management', icon: 'heart', cost: 800, req: ['r_price2'], desc: 'Rampaging bears smash 1 thing less and 25% more calm down.', mods: { rampageReduce: 1, calmChance: 0.25 } },
  { id: 'r_franchise', branch: 'biz', col: 8, name: 'Franchise Empire', icon: 'crown', cost: 5000, req: ['r_calm2', 'r_sturgeon'], desc: 'Reynard\'s greedy dream: every bill is doubled. You can retire as a legend.', mods: { payMult: 1 } },
  // ---------------- Fox Tools
  { id: 'r_shovel', branch: 'tools', col: 0, name: 'Sturdy Shovel', icon: 'shovel', cost: 35, req: [], desc: 'Digging the pond bigger costs 30% less.', mods: { digMult: -0.3 } },
  { id: 'r_bag', branch: 'tools', col: 1, name: 'Bigger Food Bag', icon: 'food', cost: 60, req: ['r_shovel'], desc: 'Carry 50% more fish food, and it refills faster.', mods: { bagBonus: 0.5 } },
  { id: 'r_tags', branch: 'tools', col: 2, name: 'Label Maker', icon: 'tag', cost: 120, req: ['r_bag'], desc: '+2 "DO NOT EAT" tags. Tagged fish are off the menu.', mods: { tagBonus: 2 } },
  { id: 'r_nurture', branch: 'tools', col: 3, name: 'Fish Whisperer', icon: 'nurture', cost: 200, req: ['r_tags'], desc: 'Nurtured fish get twice the love: faster growth, faster breeding, better genes.', mods: { nurtureMult: 1 } },
  { id: 'r_tags2', branch: 'tools', col: 4, name: 'Legal Loophole', icon: 'tag', cost: 450, req: ['r_nurture'], desc: '+3 more tags. Reynard found a loophole in the menu.', mods: { tagBonus: 3 } },
  { id: 'r_bag2', branch: 'tools', col: 5, name: 'Feed Silo', icon: 'food', cost: 520, req: ['r_tags2'], desc: 'Carry another 50% more food.', mods: { bagBonus: 0.5 } },
];

export const RESEARCH_BY_ID = Object.fromEntries(RESEARCH.map((r) => [r.id, r]));

export const BASE_MODS = {
  foodMult: 1, breedMult: 1, clutchBonus: 0, hybridMult: 1, goldenMult: 1, growthMult: 1, fishValueMult: 1,
  produceMult: 1, bugMult: 1, bugBonus: 0, digMult: 1, buildSpeed: 1, beaverBonus: 0, capacityMult: 1, capacityBonus: 0,
  payMult: 1, patienceMult: 1, tipMult: 1, calmChance: 0, bearBonus: 0, badReviewMult: 1, rampageReduce: 0,
  eggSlots: 0, hatchSpeed: 1, morphMult: 1, traitMult: 1, snackMealMult: 1, beautyMult: 1, bagBonus: 1, tagBonus: 0, nurtureMult: 1,
  mutationMult: 1, clearPayMult: 1, cropLuck: 1,
};

// `extra`: more mod sets added on top (villager perks from opened areas)
export function computeMods(researched, legacyTails = 0, extra = []) {
  const m = { ...BASE_MODS };
  const sets = researched.map((id) => RESEARCH_BY_ID[id]?.mods).concat(extra);
  for (const mods of sets) {
    if (!mods) continue;
    for (const [k, v] of Object.entries(mods)) m[k] = (m[k] ?? 0) + v;
  }
  m.payMult *= 1 + legacyTails * 0.1;
  m.badReviewMult = Math.max(0.2, m.badReviewMult);
  m.calmChance = Math.min(0.8, m.calmChance);
  return m;
}

// Which research unlocks a structure / species (for "Research it first" hints).
export const UNLOCKS_BUILD = {};
export const UNLOCKS_SPECIES = {};
for (const r of RESEARCH) {
  for (const b of [].concat(r.build || [])) UNLOCKS_BUILD[b] = r.id;
  if (r.species) UNLOCKS_SPECIES[r.species] = r.id;
}
