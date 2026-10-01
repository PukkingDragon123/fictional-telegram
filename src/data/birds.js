// Wild birds that visit your land. Tap one to spot it (Professor Hoot pays a
// bounty for every new species once you've met him). `like` = structures that
// attract it (x3 chance while you have one), rarity 0 common .. 3 super rare.
export const WILD_BIRDS = [
  { id: 'chickadee', name: 'Black-capped Chickadee', rarity: 0, like: ['birdhouse', 'feeder'] },
  { id: 'robin', name: 'American Robin', rarity: 0, like: ['compost', 'tallgrass'] },
  { id: 'sparrow', name: 'House Sparrow', rarity: 0, like: ['birdbath'] },
  { id: 'crow', name: 'American Crow', rarity: 0, like: ['bbq', 'picnictable'] },
  { id: 'bluejay', name: 'Blue Jay', rarity: 0, like: ['birdbath', 'berries'] },
  { id: 'junco', name: 'Dark-eyed Junco', rarity: 0, like: ['tallgrass'] },
  { id: 'dove', name: 'Mourning Dove', rarity: 0, like: ['birdbath'] },
  { id: 'cardinal', name: 'Northern Cardinal', rarity: 1, like: ['berries', 'birdhouse'] },
  { id: 'goldfinch', name: 'American Goldfinch', rarity: 1, like: ['flowers', 'butterflybush'] },
  { id: 'grayjay', name: 'Canada Jay', rarity: 1, like: ['picnictable', 'campfire'] },
  { id: 'blackbird', name: 'Red-winged Blackbird', rarity: 1, like: ['cattail', 'reeds'] },
  { id: 'swallow', name: 'Barn Swallow', rarity: 1, like: ['bogpool', 'cattail'] },
  { id: 'woodpecker', name: 'Downy Woodpecker', rarity: 1, like: ['rottinglog'] },
  { id: 'magpie', name: 'Black-billed Magpie', rarity: 1, like: ['gnome', 'neonsign'] },
  { id: 'flicker', name: 'Northern Flicker', rarity: 1, like: ['compost', 'rottinglog'] },
  { id: 'waxwing', name: 'Cedar Waxwing', rarity: 2, like: ['saskatoon', 'elderberry', 'berries'] },
  { id: 'bluebird', name: 'Eastern Bluebird', rarity: 2, like: ['birdhouse', 'tallgrass'] },
  { id: 'oriole', name: 'Baltimore Oriole', rarity: 2, like: ['butterflybush', 'raspberry'] },
  { id: 'bunting', name: 'Indigo Bunting', rarity: 2, like: ['tallgrass', 'flowers'] },
  { id: 'hummingbird', name: 'Ruby-throated Hummingbird', rarity: 2, like: ['flowers', 'butterflybush'] },
  { id: 'kingfisher', name: 'Belted Kingfisher', rarity: 2, like: ['platform', 'feeder'] },
  { id: 'grosbeak', name: 'Evening Grosbeak', rarity: 2, like: ['birdbath', 'feeder'] },
  { id: 'redpoll', name: 'Common Redpoll', rarity: 2, like: ['birdbath'] },
  { id: 'snowbunting', name: 'Snow Bunting', rarity: 3, like: ['stonelantern'] },
  { id: 'tanager', name: 'Scarlet Tanager', rarity: 3, like: ['butterflybush', 'glowmeadow'] },
  { id: 'snowyowl', name: 'Snowy Owl', rarity: 3, like: ['glowmeadow'], night: true },
];
export const BIRD_BY_ID = Object.fromEntries(WILD_BIRDS.map((b) => [b.id, b]));
export const BIRD_RARITY_WEIGHT = [10, 4, 1.2, 0.3];
export const BIRD_BOUNTY = [8, 15, 35, 80];
