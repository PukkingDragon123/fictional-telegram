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
      { kind: 'species', ids: ['bulltrout', 'cutthroat', 'coho', 'pinksalmon', 'kokanee', 'browntrout'], title: '6 river trout & salmon', icon: 'fish' },
      { kind: 'perk', title: 'Clearing pays double, +1 beaver per lodge', icon: 'beaver' },
    ],
    gift: { coins: 55, items: ['chair'] },
  },
  {
    id: 'willow', landmark: 'willowshrine', name: 'The Great Willow', cx: 22, cz: 46.5, r: 10,
    npc: { id: 'shellby', name: 'Grandpa Shellby', title: 'Keeper of ancient fish', x: 24.6, z: 50.2, color: '#5a7a5a' },
    sub: 'Grandpa Shellby has napped here for 200 years',
    intro: ['Hmm? ...Oh! Company!', 'I remember when this pond was a puddle.', 'The old fish still listen to me.'],
    lines: ['Back in my day, gar had MANNERS.', 'Tea? It\'s willow-bark. Good for the shell.', 'Snow geese visit me every autumn.', 'Zzz... hm? I was resting my eyes.'],
    unlocks: [
      { kind: 'species', ids: ['gar', 'paddlefish', 'eel'], title: 'Gar, Paddlefish & Eel eggs', icon: 'fish' },
      { kind: 'breed', id: 'snow', title: 'Snow Goose on e-Buy', icon: 'egg' },
      { kind: 'perk', title: 'The willow blesses your pond: +15 beauty', icon: 'heart' },
    ],
    gift: { coins: 40, egg: true },
  },
  {
    id: 'swamp', landmark: 'swampshack', name: 'The Murky Swamp', cx: 28.5, cz: 88.5, r: 14,
    npc: { id: 'granny', name: 'Granny Ribbit', title: 'Bug granny', x: 31.6, z: 91.4, color: '#5a9a4a' },
    sub: 'Granny Ribbit lives here',
    intro: ['Ribbit! Come in, dearie, come in!', 'You look thin. Have a mealworm.', 'I\'ll teach you my bug recipes!'],
    lines: ['A duck is only as good as its bugs.', 'Bog pools! Mayflies by the bucket.', 'Rotting logs grow the BIG beetles.', '*zap* ...oh, pardon me, dear.'],
    unlocks: [
      { kind: 'build', ids: ['bogpool', 'rottinglog'], title: 'Bog Pool & Rotting Log bug farms', icon: 'bug' },
      { kind: 'species', ids: ['bullhead', 'catfish', 'bowfin'], title: 'Bullhead, Catfish & Bowfin eggs', icon: 'fish' },
      { kind: 'perk', title: 'Swamp water: way more mutations', icon: 'sparkle' },
    ],
    gift: { coins: 35, items: ['compost', 'tallgrass'] },
  },
  {
    id: 'mush', landmark: 'mushhut', name: 'Mushroom Hollow', cx: 88, cz: 94, r: 13,
    npc: { id: 'rocco', name: 'Rocco', title: 'Totally legit merchant', x: 90.6, z: 96.6, color: '#7a6a8a' },
    sub: 'Rocco does business here. Don\'t ask.',
    intro: ['Psst. Hey. Over here.', 'You want rare? I got rare.', 'Sabertooth Salmon. No questions.'],
    lines: ['Everything fell off a moose.', 'Cash only. Shiny cash.', 'That egg? Found it. Legally.', 'Glow bugs! Make eggs hatch like crazy.'],
    unlocks: [
      { kind: 'species', ids: ['sabertooth', 'goldentrout'], title: 'Sabertooth Salmon & Golden Trout', icon: 'crown' },
      { kind: 'build', ids: ['glowmeadow'], title: 'Firefly Meadow bug farm', icon: 'lantern' },
      { kind: 'perk', title: 'Magic spores: eggs hatch 35% faster', icon: 'mushroom' },
    ],
    gift: { coins: 80, items: ['gnome'] },
  },
];
export const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z]));
// zone id -> a short "who to meet" label (for locked things)
export const ZONE_INFO = Object.fromEntries(ZONES.map((z) => [z.id, { npcName: z.npc.name, name: z.name }]));
