import { QUARRY_ZONE } from './zoneQuarry.js'; // [F&S mining]
// Fog-covered areas of the big forest. Each one hides a villager's home (and
// a landmark). Clear the forest up to the edge of the fog and it lifts: the
// villager becomes your friend and unlocks new things. `cx/cz/r` is the fog
// circle in tiles, `npc` where the villager hangs out.
export const ZONES = [
  {
    id: 'tower', landmark: 'firetower', name: 'Lookout Ridge', cx: 25, cz: 26, r: 10.5,
    npc: { id: 'hoot', name: 'Professor Hoot', title: 'Park ranger & bird nerd', x: 27.6, z: 28.6, color: '#6a7a3a' },
    sub: 'Professor Hoot keeps watch here',
    intro: ['Hoo-hoo! A visitor!', 'I count every bird in this forest.', 'Spot birds by your pond and I\'ll pay!'],
    lines: ['Spotted a waxwing yet? Gorgeous.', 'Feeders bring the rare ones.', 'Wood ducks are my favourite. Hoo!', 'Binoculars: never leave home without.'],
    unlocks: [
      { kind: 'feature', tab: 'farm', title: 'Bugs & Birds builds', icon: 'birdhouse' },
      { kind: 'species', ids: ['goldeye', 'cisco'], title: 'Goldeye & Cisco eggs', icon: 'fish' },
      { kind: 'breed', id: 'wood', title: 'Wood Duck on e-Buy', icon: 'egg' },
      { kind: 'perk', title: 'Bird bounty: spot new birds for coins', icon: 'eye' },
    ],
    gift: { coins: 30, items: ['birdhouse', 'tallgrass'] },
  },
  {
    id: 'river', landmark: 'lumberhut', name: 'Daisy River Camp', cx: 107.5, cz: 41.5, r: 8.5,
    npc: { id: 'dale', name: 'Dale', title: 'Daisy Beer enthusiast', x: 104.6, z: 45.2, color: '#a86a3a' },
    sub: 'Dale\'s lawn chair is set up by the river',
    intro: ['Oh hey bud! Didn\'t see ya there.', 'Pull up a lawn chair, eh?', 'River\'s full of salmon. Trade ya?'],
    lines: ['Daisy Beer: the official drink of not working.', 'Salmon run\'s been wicked this year.', 'The moose owes me twenty bucks.', 'You got any chips?'],
    unlocks: [
      { kind: 'feature', tab: 'beaver', title: 'Beaver Works: dams, fences, gates + beaver facilities', icon: 'dam' },
      { kind: 'species', ids: ['bulltrout', 'cutthroat', 'coho', 'pinksalmon', 'kokanee', 'browntrout'], title: '6 river trout & salmon', icon: 'fish' },
      { kind: 'perk', title: 'Clearing pays double, +1 beaver per lodge', icon: 'beaver' },
    ],
    mods: { clearPayMult: 1, beaverBonus: 1 },
    gift: { coins: 55, items: ['chair'] },
  },
  {
    id: 'willow', landmark: 'willowshrine', name: 'The Great Willow', cx: 22, cz: 46.5, r: 10,
    npc: { id: 'shellby', name: 'Grandpa Shellby', title: 'Keeper of ancient fish', x: 24.6, z: 50.2, color: '#5a7a5a' },
    sub: 'Grandpa Shellby has napped here for 200 years',
    intro: ['Hmm? ...Oh! Company!', 'I remember when this pond was a puddle.', 'The old fish still listen to me.'],
    lines: ['Back in my day, gar had MANNERS.', 'Tea? It\'s willow-bark. Good for the shell.', 'Snow geese visit me every autumn.', 'Zzz... hm? I was resting my eyes.'],
    unlocks: [
      { kind: 'feature', tab: 'decor', title: 'Decor builds', icon: 'gnome' },
      { kind: 'species', ids: ['gar', 'paddlefish', 'eel'], title: 'Gar, Paddlefish & Eel eggs', icon: 'fish' },
      { kind: 'breed', id: 'snow', title: 'Snow Goose on e-Buy', icon: 'egg' },
      { kind: 'perk', title: 'The willow blesses your pond: +15% beauty', icon: 'heart' },
    ],
    mods: { beautyMult: 0.15 }, biome: 3,
    gift: { coins: 40, egg: true },
  },
  {
    id: 'swamp', landmark: 'swampshack', name: 'The Murky Swamp', cx: 28.5, cz: 88.5, r: 14,
    npc: { id: 'granny', name: 'Granny Ribbit', title: 'Bug granny', x: 31.6, z: 91.4, color: '#5a9a4a' },
    sub: 'Granny Ribbit lives here',
    intro: ['Ribbit! Come in, dearie, come in!', 'You look thin. Have a mealworm.', 'I\'ll teach you my bug recipes!'],
    lines: ['A duck is only as good as its bugs.', 'Bog pools! Mayflies by the bucket.', 'Rotting logs grow the BIG beetles.', '*zap* ...oh, pardon me, dear.'],
    unlocks: [
      { kind: 'feature', tab: 'food', title: 'Bug Grinder (free fish food)', icon: 'bug' },
      { kind: 'build', ids: ['bogpool', 'rottinglog'], title: 'Bog Pool & Rotting Log bug farms', icon: 'bug' },
      { kind: 'species', ids: ['bullhead', 'catfish', 'bowfin'], title: 'Bullhead, Catfish & Bowfin eggs', icon: 'fish' },
      { kind: 'perk', title: 'Swamp water: twice the mutations', icon: 'sparkle' },
    ],
    mods: { mutationMult: 1 }, biome: 1,
    gift: { coins: 35, items: ['compost', 'tallgrass'] },
  },
  {
    id: 'mush', landmark: 'mushhut', name: 'Mushroom Hollow', cx: 88, cz: 94, r: 13,
    npc: { id: 'rocco', name: 'Rocco', title: 'Totally legit merchant', x: 90.6, z: 96.6, color: '#7a6a8a' },
    sub: 'Rocco does business here. Don\'t ask.',
    intro: ['Psst. Hey. Over here.', 'You want rare? I got rare.', 'Sabertooth Salmon. No questions.'],
    lines: ['Everything fell off a moose.', 'Cash only. Shiny cash.', 'That egg? Found it. Legally.', 'Glow bugs! Make eggs hatch like crazy.'],
    unlocks: [
      { kind: 'feature', tab: 'contraption', title: 'Gadgets: feeders, sprinklers, incubators', icon: 'gear' },
      { kind: 'species', ids: ['sabertooth', 'goldentrout'], title: 'Sabertooth Salmon & Golden Trout', icon: 'crown' },
      { kind: 'build', ids: ['glowmeadow'], title: 'Firefly Meadow bug farm', icon: 'lantern' },
      { kind: 'perk', title: 'Magic spores: eggs hatch 35% faster', icon: 'mushroom' },
    ],
    mods: { hatchSpeed: 0.35 }, biome: 2,
    gift: { coins: 80, items: ['gnome'] },
  },
  // ---- close neighbours: small fog pockets right next to the meadow, so the
  // first friends are only a few trees away
  {
    id: 'patch', landmark: null, name: 'Clover Patch', cx: 57.5, cz: 79, r: 6, near: true, // [v26 world] was 61.5, 63.5: out in the woods
    npc: { id: 'clover', name: 'Clover', title: 'Gardener next door', x: 57.6, z: 79.7, color: '#c8a070' },
    sub: 'Clover the bunny grows the best veggies in Ontario',
    intro: ['Oh! Hello, neighbour!', 'I heard the trees falling. Nice work!', 'Here, seeds! Gardens make bears happy.'],
    lines: ['Water in the morning, never at noon!', 'Carrots love sprinklers. So do I.', 'A golden carrot? Keep planting!', 'Compost is just salad\'s second chance.'],
    unlocks: [
      { kind: 'feature', tab: 'crops', title: 'Crops & berry bushes', icon: 'carrot' },
      { kind: 'perk', title: 'Green thumb: gardens & snacks grow 25% faster', icon: 'leaf' },
      { kind: 'perk', title: 'Daily seed gift', icon: 'harvest' },
    ],
    mods: { produceMult: 0.25, cropLuck: 0.25 },
    gift: { coins: 20, items: ['carrot', 'strawberry', 'radish', 'sunflower', 'lettuce'] },
  },
  {
    id: 'bend', landmark: null, name: 'Otter Bend', cx: 103.5, cz: 76.5, r: 6, near: true, // [v26 world] was 98.5, 63.5: further down the river
    npc: { id: 'otis', name: 'Otis', title: 'Fisherman & fish whisperer', x: 102.8, z: 76.2, color: '#7a5a3a' },
    sub: 'Otis the otter fishes the river bend',
    intro: ['Ahoy, pond neighbour!', 'Name\'s Otis. I know every fish by name.', 'Walleye and pike? I\'ll get ya some eggs!'],
    lines: ['Fish grow big on a full belly.', 'Pike are grumpy. Respect the pike.', 'Rare fish? Tag \'em, or the bears will eat \'em!', 'Wanna perfect fish? Pick the parents yourself!'],
    unlocks: [
      { kind: 'feature', tab: 'nature', title: 'Pond plants + fox-tool facilities', icon: 'seaweed' },
      { kind: 'species', ids: ['walleye', 'pike'], title: 'Walleye & Pike eggs (no research!)', icon: 'fish' },
      { kind: 'perk', title: 'Fish grow 20% faster', icon: 'fish' },
    ],
    early: ['walleye', 'pike'],
    mods: { growthMult: 0.2 },
    gift: { coins: 25, egg: true, eggPool: ['perch', 'walleye', 'pike', 'smallmouth'] },
  },
  {
    id: 'bakery', landmark: null, name: 'Hazel\'s Bakery', cx: 122.5, cz: 28.5, r: 5.5, near: true, // [v26 world] was 101.5, 24.5: over the river
    npc: { id: 'hazel', name: 'Hazel', title: 'Baker of famous pies', x: 122.2, z: 29.4, color: '#a07858' },
    sub: 'Hazel the hedgehog bakes for the bears upstairs',
    intro: ['Oh my! A customer? No, a neighbour!', 'I bake pies for Bear Corp.', 'Full bears tip better. Trust me, dear.'],
    lines: ['Honey in the crust. That\'s the secret.', 'Bears tip more after dessert.', 'Mind the spikes, sweetie.', 'Fresh out of the oven!'],
    unlocks: [
      { kind: 'feature', tab: 'restaurant', title: 'Snack bowls, pantry + bear facilities (Tip Jar...)', icon: 'coins' },
      { kind: 'perk', title: 'Dessert time: bears tip 15% more', icon: 'coin' },
      { kind: 'perk', title: 'Daily honey & syrup', icon: 'honey' },
    ],
    mods: { tipMult: 0.15 },
    gift: { coins: 30, food: [{ id: 'honey', n: 2 }, { id: 'syrup', n: 1 }] },
  },
  {
    id: 'treehouse', landmark: null, name: 'The Tree House', cx: 37.5, cz: 62.5, r: 4, near: true, // [v26 world] was 40.5, 38.5: deeper in the west woods
    npc: { id: 'chip', name: 'Chip', title: 'Woodpecker & master carpenter', x: 37.6, z: 64.2, color: '#c8402a' },
    sub: 'Chip the woodpecker carves furniture in his tree house',
    intro: ['Tok-tok-tok! Oh, hello there!', 'Name\'s Chip. I make furniture. Good furniture.', 'Bring me wood, I\'ll make your bears comfy!'],
    lines: ['Measure twice, peck once.', 'Found old junk in the forest? I can fix it!', 'Fallen logs = free wood. Pick \'em up!', 'Tok-tok. Sorry, habit.'],
    unlocks: [
      { kind: 'feature', tab: 'restaurant', title: 'Bear furniture: tables, chairs & more', icon: 'picnic' },
      { kind: 'feature', tab: 'woodwork', title: 'Woodwork: craft at Chip\'s workshop', icon: 'hammer' },
      { kind: 'perk', title: 'Repair old furniture from the forest', icon: 'star' },
    ],
    mods: {},
    gift: { coins: 15, wood: 3 },
  },
  {
    id: 'mill', landmark: null, name: 'Pip\'s Lumber Mill', cx: 80.5, cz: 74, r: 5, near: true, visitor: true, // [v26 world] was 80.5, 64.5
    npc: { id: 'pip', name: 'Pip', title: 'Lumber trader', x: 80.6, z: 74.9, color: '#b8783a' },
    sub: 'Pip the chipmunk buys every log you can chop',
    intro: ['Welcome to my mill, partner!', 'Bring me logs, I pay cash. Fair and square!', 'And try my Terraform kit: shape your land!'],
    lines: ['Logs, logs, lovely logs!', 'Price changes every day. Sell smart!', 'A garage full of wood is a happy garage.', 'Terraform tip: little hills look cozy!'],
    unlocks: [
      { kind: 'feature', tab: 'terraform', title: 'Terraform: hills, paint, new ponds', icon: 'shovel' },
      { kind: 'perk', title: 'Sell wood to Pip', icon: 'coins' },
    ],
    mods: {},
    gift: { coins: 20 },
  },
];
ZONES.push(QUARRY_ZONE); // [F&S mining] Flint's Quarry (src/data/zoneQuarry.js)
// [v26 world] The Deepest Zone: Mistfall Hollow, far south past the Broadwater,
// the Bramblewall, the Fallen Giant and the cliff (world/worldgen.js BARRIERS,
// DEEP_ZONE, WATERFALL). Fogged like the others; the fog only lifts once the
// last expedition research is done AND your land reaches it (`requires`).
// The turtle's story, house interior and lines get filled in later.
ZONES.push({
  id: 'deep', landmark: null, name: 'Mistfall Hollow', cx: 34, cz: 206, r: 14, biome: 7, requires: 'r_xp_ropes', deep: true,
  npc: { id: 'longneck', name: 'Old Longneck', title: 'The Old Wise Long-Neck Turtle', x: 37.6, z: 196.4, color: '#6a8a5a' }, // [v26 turtle] on the sand just east of the falls (34.5 stood inside the water curtain)
  sub: 'Somebody very old lives behind the falls',
  intro: ['...Visitors. Took you long enough.', 'Sit. The water has been talking about you.', 'I am older than your pond. Older than the bears.'],
  lines: ['Slow water runs deep. So do slow turtles.', 'The falls never stop. Neither should you.', 'Patience is just hurry, with better posture.', 'Mind the moss. It has been here longer than you.'],
  unlocks: [],
  hint: 'Mistfall Hollow lies past the Broadwater, the Bramblewall, the Fallen Giant and the cliff. The Expedition research gets you there.',
  mods: {},
  gift: { coins: 150 },
});
export const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z]));
// zone id -> a short "who to meet" label (for locked things)
export const ZONE_INFO = Object.fromEntries(ZONES.map((z) => [z.id, { npcName: z.npc.name, name: z.name }]));
