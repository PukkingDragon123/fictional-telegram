// Land animals: rabbits, hares and rodents that wander in from the woods.
// Tap one to spot it (encyclopedia entry + a small bounty). `like` = things
// that attract it (structures or crop types; x3 chance while you have one).
// rarity 0 common .. 3 super rare. `mischief`:
//   nibble  munches a ripe crop (shrinks the batch) unless shooed
//   steal   sneaks a serving out of a Snack Bowl / Pantry
//   stash   pockets seeds: a growing crop slows down a little
//   stink   bears near it lose their appetite for a moment (and run)
// Sprites (src/art/extra/landAnimalArt.js): `${id}_${anim}` for anims
// idle, move, eat, look; side view facing right.
export const LAND_ANIMALS = [
  { id: 'cottontail', name: 'Eastern Cottontail', kind: 'rabbit', rarity: 0, like: ['carrot', 'lettuce', 'tallgrass'], move: 'hop', mischief: 'nibble', size: 0.9, desc: 'A fluffy white tail and a nose that never stops wiggling. Loves your lettuce a bit too much.' },
  { id: 'snowshoe', name: 'Snowshoe Hare', kind: 'rabbit', rarity: 1, like: ['fern', 'tallgrass', 'radish'], move: 'hop', mischief: 'nibble', size: 1.1, desc: 'Huge feet for snow. Brown in summer, white in winter, sneaky all year.' },
  { id: 'jackrabbit', name: 'White-tailed Jackrabbit', kind: 'rabbit', rarity: 2, like: ['peas', 'sunflower'], move: 'hop', mischief: 'nibble', size: 1.25, desc: 'The prairie sprinter. Ears like satellite dishes.' },
  { id: 'chipmunk', name: 'Eastern Chipmunk', kind: 'rodent', rarity: 0, like: ['sunflower', 'feeder', 'corn'], move: 'scurry', mischief: 'stash', size: 0.55, desc: 'Cheeks stuffed with seeds, stripes on the back, zero chill.' },
  { id: 'redsquirrel', name: 'Red Squirrel', kind: 'rodent', rarity: 0, like: ['maple', 'feeder', 'willow'], move: 'scurry', mischief: 'stash', size: 0.65, desc: 'Small, loud and very territorial. Chatters at bears.' },
  { id: 'deermouse', name: 'Deer Mouse', kind: 'rodent', rarity: 0, like: ['pantry', 'snackbowl', 'corn'], move: 'scurry', mischief: 'steal', night: true, size: 0.4, desc: 'Big eyes, tiny paws, raids the pantry at night.' },
  { id: 'vole', name: 'Meadow Vole', kind: 'rodent', rarity: 1, like: ['tallgrass', 'potato'], move: 'scurry', mischief: 'stash', size: 0.45, desc: 'A round little potato with legs. Tunnels under the tall grass.' },
  { id: 'groundhog', name: 'Groundhog', kind: 'rodent', rarity: 1, like: ['lettuce', 'peas', 'pumpkin'], move: 'waddle', mischief: 'nibble', size: 1.1, desc: 'Predicts the weather, eats the garden. Wiarton Willie\'s cousin.' },
  { id: 'muskrat', name: 'Muskrat', kind: 'rodent', rarity: 1, like: ['cattail', 'wildrice', 'reeds'], move: 'waddle', size: 0.9, desc: 'Lives by the water and builds tiny cattail houses. Not a beaver. Stop asking.' },
  { id: 'porcupine', name: 'North American Porcupine', kind: 'rodent', rarity: 2, like: ['rottinglog', 'maple'], move: 'waddle', night: true, size: 1.15, desc: 'Thirty thousand quills and a gentle soul. Bears give it a wide berth.' },
  { id: 'skunk', name: 'Striped Skunk', kind: 'other', rarity: 2, like: ['compost', 'bughotel'], move: 'waddle', mischief: 'stink', night: true, size: 1, desc: 'Eats bugs, scares bears. Please do not tap it too hard.' },
  { id: 'flyingsquirrel', name: 'Northern Flying Squirrel', kind: 'rodent', rarity: 3, like: ['maple', 'mushrooms', 'glowmeadow'], move: 'scurry', night: true, size: 0.6, desc: 'Glides between trees on starlit nights. Glows faintly pink under UV. Really!' },
  { id: 'pika', name: 'American Pika', kind: 'other', rarity: 3, like: ['tallgrass', 'cloudberry'], move: 'scurry', size: 0.5, desc: 'A tiny mountain rabbit-cousin that makes hay piles and squeaks "EEP!".' },
  { id: 'lemming', name: 'Brown Lemming', kind: 'rodent', rarity: 3, like: ['cloudberry', 'clover'], move: 'scurry', size: 0.42, desc: 'A round arctic fluffball. Does not, in fact, jump off cliffs.' },
];
export const LAND_BY_ID = Object.fromEntries(LAND_ANIMALS.map((a) => [a.id, a]));
export const LAND_RARITY_WEIGHT = [10, 4, 1.4, 0.35];
export const LAND_BOUNTY = [6, 12, 30, 70];

// Tame bunnies that live in a Bunny Hutch: they hop around the garden,
// fertilize crops nearby (growth boost) and have babies when the hutch has room.
export const TAME_BUNNIES = [
  { id: 'lop', name: 'Holland Lop', desc: 'Floppy ears, floppy everything. The garden\'s best fertilizer.' },
  { id: 'dutch', name: 'Dutch Rabbit', desc: 'Wears a little tuxedo pattern. Very formal hops.' },
  { id: 'lionhead', name: 'Lionhead', desc: 'A fluffy mane and the heart of a lion (the heart of a bunny).' },
];
export const HUTCH = { cap: 4, babyEvery: 160, aura: 3 };
export const BUNNY_NAMES = ['Clover', 'Thumper', 'Biscuit', 'Hazel', 'Pip', 'Juniper', 'Marshmallow', 'Cinnabun', 'Dumpling', 'Sir Hops', 'Nutmeg', 'Pancake'];
