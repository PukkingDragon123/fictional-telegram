// Research tree for Reynard's lab. `mods` are additive deltas on BASE_MODS.
// col/row place the node in its branch column in the lab view.
export const BRANCHES = [
  { id: 'fish', name: 'Aquaculture', color: '#4fb0d8' },
  { id: 'eco', name: 'Ecology', color: '#7ac85a' },
  { id: 'eng', name: 'Beaver Works', color: '#d8a048' },
  { id: 'biz', name: 'Business', color: '#e8c040' },
];

export const RESEARCH = [
  // ---------------- Aquaculture
  { id: 'r_perch', branch: 'fish', row: 0, col: 0, name: 'Yellow Perch', icon: 'fish', cost: 40, req: [], species: 'perch', desc: 'Stock Yellow Perch in the fish shop. Tastier than bluegill.' },
  { id: 'r_food1', branch: 'fish', row: 0, col: 1, name: 'Tasty Pellets', icon: 'food', cost: 45, req: [], desc: 'Fish food is 50% more filling.', mods: { foodMult: 0.5 } },
  { id: 'r_bass', branch: 'fish', row: 1, col: 0, name: 'Largemouth Bass', icon: 'fish', cost: 90, req: ['r_perch'], species: 'bass', desc: 'Stock Largemouth Bass. A hearty meal for a hungry suit.' },
  { id: 'r_love1', branch: 'fish', row: 1, col: 1, name: 'Mood Lighting', icon: 'heart', cost: 70, req: ['r_food1'], desc: 'Candles, jazz... fish breed 30% faster.', mods: { breedMult: 0.3 } },
  { id: 'r_brook', branch: 'fish', row: 2, col: 0, name: 'Brook Trout', icon: 'fish', cost: 160, req: ['r_bass'], species: 'brook', desc: 'Stock Brook Trout, the speckled jewel of the north.' },
  { id: 'r_growth', branch: 'fish', row: 2, col: 1, name: 'Growth Formula', icon: 'flask', cost: 200, req: ['r_love1'], desc: 'Fry grow up 50% faster.', mods: { growthMult: 0.5 } },
  { id: 'r_rainbow', branch: 'fish', row: 3, col: 0, name: 'Rainbow Trout', icon: 'fish', cost: 260, req: ['r_brook'], species: 'rainbow', desc: 'Stock Rainbow Trout.' },
  { id: 'r_clutch', branch: 'fish', row: 3, col: 1, name: 'Bigger Clutches', icon: 'egg', cost: 300, req: ['r_growth'], desc: '+1 egg in every clutch.', mods: { clutchBonus: 1 } },
  { id: 'r_sockeye', branch: 'fish', row: 4, col: 0, name: 'Sockeye Salmon', icon: 'fish', cost: 420, req: ['r_rainbow'], species: 'sockeye', desc: 'Stock Sockeye Salmon, the pride of B.C.' },
  { id: 'r_genetics', branch: 'fish', row: 4, col: 1, name: 'Genetics Lab', icon: 'flask', cost: 350, req: ['r_love1'], desc: 'Cross-breeds produce hybrids twice as often. The Fishdex reveals hybrid recipes.', mods: { hybridMult: 1 } },
  { id: 'r_pike', branch: 'fish', row: 5, col: 0, name: 'Northern Pike', icon: 'fish', cost: 600, req: ['r_sockeye'], species: 'pike', desc: 'Stock Northern Pike ("the baguette").' },
  { id: 'r_fatten', branch: 'fish', row: 5, col: 1, name: 'Premium Feed', icon: 'coin', cost: 650, req: ['r_clutch'], desc: 'Plump fish: bears pay 25% more for every fish.', mods: { fishValueMult: 0.25 } },
  { id: 'r_walleye', branch: 'fish', row: 6, col: 0, name: 'Walleye', icon: 'fish', cost: 850, req: ['r_pike'], species: 'walleye', desc: 'Stock Walleye. Glow-in-the-dark eyes!' },
  { id: 'r_love2', branch: 'fish', row: 6, col: 1, name: 'Fish Love Songs', icon: 'music', cost: 800, req: ['r_fatten'], desc: 'Serenade them: +40% breeding speed.', mods: { breedMult: 0.4 } },
  { id: 'r_char', branch: 'fish', row: 7, col: 0, name: 'Arctic Char', icon: 'fish', cost: 1200, req: ['r_walleye'], species: 'char', desc: 'Stock Arctic Char from the far north.' },
  { id: 'r_golden', branch: 'fish', row: 7, col: 1, name: 'Golden Genes', icon: 'fish_gold', cost: 1000, req: ['r_genetics'], desc: 'Golden fish (worth 5x) hatch 3x as often.', mods: { goldenMult: 2 } },
  { id: 'r_sturgeon', branch: 'fish', row: 8, col: 0, name: 'Lake Sturgeon', icon: 'fish', cost: 2000, req: ['r_char'], species: 'sturgeon', desc: 'Stock the armoured Lake Sturgeon. Feeds a CEO.' },
  // ---------------- Ecology
  { id: 'r_lilypad', branch: 'eco', row: 0, col: 0, name: 'Lily Pads', icon: 'lilypad', cost: 45, req: [], build: 'lilypad', desc: 'Build Lily Pads: bug magnets and hiding spots.' },
  { id: 'r_flowers', branch: 'eco', row: 0, col: 1, name: 'Wildflowers', icon: 'flower', cost: 50, req: [], build: 'flowers', desc: 'Plant fireweed & lupines. Bees love them.' },
  { id: 'r_willow', branch: 'eco', row: 1, col: 1, name: 'Weeping Willow', icon: 'willow', cost: 100, req: ['r_flowers'], build: 'willow', desc: 'Plant willows. Bees only nest near willows.' },
  { id: 'r_bughotel', branch: 'eco', row: 1, col: 0, name: 'Bug Hotel', icon: 'bughotel', cost: 180, req: ['r_lilypad'], build: 'bughotel', desc: 'Build Bug Hotels that swarm with dragonflies.' },
  { id: 'r_bees', branch: 'eco', row: 2, col: 1, name: 'Beekeeping', icon: 'hive', cost: 150, req: ['r_willow'], build: 'beehive', desc: 'Build beehives near willows. Accountants demand honey.' },
  { id: 'r_berries', branch: 'eco', row: 2, col: 0, name: 'Wild Blueberries', icon: 'berry', cost: 220, req: ['r_flowers'], build: 'berries', desc: 'Plant blueberry bushes for tourists and cubs.' },
  { id: 'r_maple', branch: 'eco', row: 3, col: 1, name: 'Sugar Maples', icon: 'maple', cost: 360, req: ['r_bees'], build: 'maple', desc: 'Tap sugar maples for syrup. Lumberjacks go wild.' },
  { id: 'r_bugs2', branch: 'eco', row: 3, col: 0, name: 'Bug Buffet', icon: 'bug', cost: 380, req: ['r_bughotel'], desc: 'Bug spawners work 50% faster and hold +1 bug.', mods: { bugMult: 0.5, bugBonus: 1 } },
  { id: 'r_fert', branch: 'eco', row: 4, col: 1, name: 'Compost Magic', icon: 'sparkle', cost: 520, req: ['r_maple'], desc: 'Seaweed, honey, syrup & berries regrow 50% faster.', mods: { produceMult: 0.5 } },
  { id: 'r_fert2', branch: 'eco', row: 4, col: 0, name: 'Beaver Mulch', icon: 'sparkle', cost: 900, req: ['r_bugs2', 'r_fert'], desc: 'Everything regrows another 50% faster.', mods: { produceMult: 0.5 } },
  // ---------------- Beaver works
  { id: 'r_shovel', branch: 'eng', row: 0, col: 0, name: 'Sturdy Shovel', icon: 'shovel', cost: 35, req: [], desc: 'Digging the pond bigger costs 30% less.', mods: { digMult: -0.3 } },
  { id: 'r_beavers', branch: 'eng', row: 0, col: 1, name: 'Hire Beavers', icon: 'beaver', cost: 110, req: [], build: 'lodge', desc: 'Build a Beaver Lodge. Beavers build dams, fences & contraptions.' },
  { id: 'r_dams', branch: 'eng', row: 1, col: 1, name: 'Beaver Dams', icon: 'dam', cost: 70, req: ['r_beavers'], build: 'dam', desc: 'Dams block fish and bears. Wall off a safe nursery!' },
  { id: 'r_fences', branch: 'eng', row: 1, col: 0, name: 'Log Fences', icon: 'fence', cost: 70, req: ['r_beavers'], build: 'fence', desc: 'Fences keep bears out on land.' },
  { id: 'r_gates', branch: 'eng', row: 2, col: 1, name: 'Sluice Gates', icon: 'gate', cost: 200, req: ['r_dams'], build: 'gate', desc: 'Openable dams: let fish out of the nursery on your terms.' },
  { id: 'r_platforms', branch: 'eng', row: 2, col: 0, name: 'Stilt Platforms', icon: 'platform', cost: 180, req: ['r_fences'], build: 'platform', desc: 'Raised decks: rampage-proof farming, and fish hide beneath.' },
  { id: 'r_feeder', branch: 'eng', row: 3, col: 1, name: 'Auto-Feeder', icon: 'feeder', cost: 240, req: ['r_dams'], build: 'feeder', desc: 'A contraption that feeds your fish for you.' },
  { id: 'r_bigpond', branch: 'eng', row: 3, col: 0, name: 'Deep Pond', icon: 'pond', cost: 450, req: ['r_shovel'], desc: 'The pond holds 25% more fish.', mods: { capacityMult: 0.25 } },
  { id: 'r_tools', branch: 'eng', row: 4, col: 1, name: 'Power Tools', icon: 'hammer', cost: 320, req: ['r_feeder'], desc: 'Beavers build and repair twice as fast.', mods: { buildSpeed: 1 } },
  { id: 'r_aerator', branch: 'eng', row: 4, col: 0, name: 'Bubble Aerator', icon: 'aerator', cost: 420, req: ['r_platforms'], build: 'aerator', desc: 'Bubbles make fish frisky: +60% breeding nearby.' },
  { id: 'r_union', branch: 'eng', row: 5, col: 1, name: 'Beaver Union', icon: 'beaver', cost: 500, req: ['r_tools'], desc: '+1 beaver per lodge (they wanted dental).', mods: { beaverBonus: 1 } },
  { id: 'r_bigpond2', branch: 'eng', row: 5, col: 0, name: 'Glacier Spring', icon: 'pond', cost: 1100, req: ['r_bigpond'], desc: 'The pond holds another 25% more fish.', mods: { capacityMult: 0.25 } },
  // ---------------- Business
  { id: 'r_price1', branch: 'biz', row: 0, col: 0, name: 'Price Hike', icon: 'coin', cost: 60, req: [], desc: 'Charge bears 20% more. They\'ll pay. Heh.', mods: { payMult: 0.2 } },
  { id: 'r_chairs', branch: 'biz', row: 0, col: 1, name: 'Muskoka Chairs', icon: 'home', cost: 110, req: [], desc: 'Comfy chairs: bears are 30% more patient.', mods: { patienceMult: 0.3 } },
  { id: 'r_tipjar', branch: 'biz', row: 1, col: 0, name: 'Tip Jar', icon: 'coins', cost: 180, req: ['r_price1'], desc: 'Snack bonuses and tips are 50% bigger.', mods: { tipMult: 0.5 } },
  { id: 'r_stress', branch: 'biz', row: 1, col: 1, name: 'Stress Balls', icon: 'bear_happy', cost: 260, req: ['r_chairs'], desc: '35% of angry bears calm down instead of rampaging.', mods: { calmChance: 0.35 } },
  { id: 'r_sign', branch: 'biz', row: 2, col: 0, name: 'Neon Sign', icon: 'bolt', cost: 380, req: ['r_tipjar'], desc: '+25% more bears come every evening.', mods: { bearMult: 0.25 } },
  { id: 'r_pr', branch: 'biz', row: 2, col: 1, name: 'PR Department', icon: 'newspaper', cost: 520, req: ['r_stress'], desc: 'Bad reviews hurt your rating 40% less.', mods: { badReviewMult: -0.4 } },
  { id: 'r_price2', branch: 'biz', row: 3, col: 0, name: 'Surge Pricing', icon: 'chart', cost: 750, req: ['r_sign'], desc: 'Another +30% on every bill.', mods: { payMult: 0.3 } },
  { id: 'r_calm2', branch: 'biz', row: 3, col: 1, name: 'Anger Management', icon: 'heart', cost: 800, req: ['r_pr'], desc: 'Rampaging bears smash 1 thing less (min 1) and 25% more calm down.', mods: { rampageReduce: 1, calmChance: 0.25 } },
  { id: 'r_franchise', branch: 'biz', row: 4, col: 0, name: 'Franchise Empire', icon: 'trophy', cost: 5000, req: ['r_price2', 'r_calm2'], desc: 'Reynard\'s greedy dream: every bill is doubled. You can retire as a legend.', mods: { payMult: 1 } },
];

export const RESEARCH_BY_ID = Object.fromEntries(RESEARCH.map((r) => [r.id, r]));

export const BASE_MODS = {
  foodMult: 1, breedMult: 1, clutchBonus: 0, hybridMult: 1, goldenMult: 1, growthMult: 1, fishValueMult: 1,
  produceMult: 1, bugMult: 1, bugBonus: 0, digMult: 1, buildSpeed: 1, beaverBonus: 0, capacityMult: 1, capacityBonus: 0,
  payMult: 1, patienceMult: 1, tipMult: 1, calmChance: 0, bearMult: 1, badReviewMult: 1, rampageReduce: 0,
};

export function computeMods(researched, legacyTails = 0) {
  const m = { ...BASE_MODS };
  for (const id of researched) {
    const r = RESEARCH_BY_ID[id];
    if (!r || !r.mods) continue;
    for (const [k, v] of Object.entries(r.mods)) m[k] = (m[k] ?? 0) + v;
  }
  m.payMult *= 1 + legacyTails * 0.1;
  m.badReviewMult = Math.max(0.2, m.badReviewMult);
  m.calmChance = Math.min(0.8, m.calmChance);
  return m;
}
