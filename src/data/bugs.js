// Bugs: food for your ducks & geese (and a snack for leaping fish).
// Each bug farm grows certain bugs, and while bugs live there the farm gives
// everything inside its circle a boost (`aura`). A bug that gets eaten also
// gives the eater its own `effect` for a while.
//   move: fly (circles, sometimes dips to water) | crawl | hop | skate (water surface)
//   effect / aura keys: growth, breed, size, luck, hatch, charm
export const EFFECTS = {
  growth: { name: 'Growth', icon: 'bolt', color: '#6cd04a', line: 'grow faster' },
  breed: { name: 'Breeding', icon: 'heart', color: '#ff7ab0', line: 'breed & lay more' },
  size: { name: 'Size', icon: 'trophy', color: '#f0a030', line: 'bigger babies' },
  luck: { name: 'Luck', icon: 'clover', color: '#4fd6e8', line: 'rare morphs & golden eggs' },
  hatch: { name: 'Hatching', icon: 'hourglass', color: '#c890ff', line: 'eggs hatch faster' },
  charm: { name: 'Charm', icon: 'beauty', color: '#ffd84a', line: 'prettier pond' },
};

export const BUGS = [
  { id: 'ladybug', name: 'Ladybug', rarity: 0, food: 0.15, move: 'crawl', effect: 'luck', desc: 'Seven spots, seven wishes. Ducks swear by them.' },
  { id: 'firefly', name: 'Firefly', rarity: 1, food: 0.15, move: 'fly', night: true, glow: true, effect: 'hatch', desc: 'Tiny night-lights. Eggs nearby hatch faster in the glow.' },
  { id: 'mayfly', name: 'Mayfly', rarity: 0, food: 0.12, move: 'fly', water: true, effect: 'breed', desc: 'Lives one day, makes it count. Fish go wild for them.' },
  { id: 'dragonfly', name: 'Dragonfly', rarity: 1, food: 0.25, move: 'fly', water: true, effect: 'growth', desc: 'A helicopter with legs. Very crunchy.' },
  { id: 'damselfly', name: 'Damselfly', rarity: 1, food: 0.18, move: 'fly', water: true, effect: 'breed', desc: 'The dragonfly\'s fancy cousin. Teal and dramatic.' },
  { id: 'cricket', name: 'Cricket', rarity: 0, food: 0.25, move: 'hop', effect: 'growth', desc: 'Chirps all night. Protein all day.' },
  { id: 'grasshopper', name: 'Grasshopper', rarity: 0, food: 0.3, move: 'hop', effect: 'growth', desc: 'Jumps 20 times its length. Ducklings jump for it too.' },
  { id: 'katydid', name: 'Katydid', rarity: 1, food: 0.3, move: 'crawl', effect: 'size', desc: 'Looks exactly like a leaf. Tastes nothing like one.' },
  { id: 'junebug', name: 'June Bug', rarity: 1, food: 0.3, move: 'fly', effect: 'size', desc: 'Bonks into every lantern. Big, shiny, filling.' },
  { id: 'stagbeetle', name: 'Stag Beetle', rarity: 2, food: 0.45, move: 'crawl', effect: 'size', desc: 'Antlers like a moose. Geese love a challenge.' },
  { id: 'rhinobeetle', name: 'Rhino Beetle', rarity: 3, food: 0.6, move: 'crawl', effect: 'size', desc: 'Lifts 850× its weight. Makes chonky babies.' },
  { id: 'mealworm', name: 'Mealworm', rarity: 0, food: 0.3, move: 'crawl', effect: 'growth', desc: 'The classic. Every duck\'s comfort food.' },
  { id: 'earthworm', name: 'Earthworm', rarity: 0, food: 0.35, move: 'crawl', effect: 'growth', desc: 'Not technically a bug. Nobody tell the ducks.' },
  { id: 'grub', name: 'Grub', rarity: 1, food: 0.4, move: 'crawl', effect: 'size', desc: 'A chubby little C. Pure duck candy.' },
  { id: 'waterstrider', name: 'Water Strider', rarity: 1, food: 0.15, move: 'skate', water: true, effect: 'breed', desc: 'Walks on water. Fish think that\'s showing off.' },
  { id: 'mosquito', name: 'Mosquito', rarity: 0, food: 0.06, move: 'fly', water: true, effect: null, desc: 'Nobody likes them. Ducks eat them anyway, bless them.' },
  { id: 'bumblebee', name: 'Bumblebee', rarity: 1, food: 0.2, move: 'fly', effect: 'breed', desc: 'Fuzzy, round and in love with everything.' },
  { id: 'monarch', name: 'Monarch', rarity: 2, food: 0.2, move: 'fly', effect: 'charm', desc: 'Flew here from Mexico. Bears stop to take photos.' },
  { id: 'lunamoth', name: 'Luna Moth', rarity: 3, food: 0.35, move: 'fly', night: true, glow: true, effect: 'luck', desc: 'A ghost-green moon moth. Seeing one is good luck. Eating one, even more.' },
  { id: 'pillbug', name: 'Pill Bug', rarity: 0, food: 0.2, move: 'crawl', effect: 'growth', desc: 'Rolls into a ball when nervous. Relatable.' },
];
export const BUG_BY_ID = Object.fromEntries(BUGS.map((b) => [b.id, b]));
export const BUG_RARITY = ['Common', 'Uncommon', 'Rare', 'Super rare'];

// what each bug farm grows (weights), how fast, how many at once, and the
// boost it gives inside its circle while it has bugs
export const BUG_FARMS = {
  tallgrass: { kinds: { cricket: 4, grasshopper: 4, katydid: 1.5 }, every: 9, max: 4, radius: 3.5, aura: { growth: 0.3 } },
  compost: { kinds: { earthworm: 4, mealworm: 3, grub: 1.5 }, every: 10, max: 4, radius: 3, aura: { growth: 0.2, size: 0.15 } },
  bogpool: { kinds: { mayfly: 4, mosquito: 3, damselfly: 2, waterstrider: 2 }, every: 8, max: 5, radius: 4, aura: { breed: 0.35 } },
  rottinglog: { kinds: { stagbeetle: 2, junebug: 3, pillbug: 3, rhinobeetle: 0.35 }, every: 12, max: 4, radius: 3.5, aura: { size: 0.3 } },
  glowmeadow: { kinds: { firefly: 5, lunamoth: 0.6 }, every: 9, max: 5, radius: 4, aura: { hatch: 0.4, luck: 0.1 }, night: true },
  butterflybush: { kinds: { monarch: 3, bumblebee: 3, ladybug: 2 }, every: 10, max: 4, radius: 3.5, aura: { charm: 0.3, breed: 0.15 } },
  // older builds grow bugs too
  bughotel: { kinds: { ladybug: 4, bumblebee: 2, pillbug: 2 }, every: 8, max: 4, radius: 3, aura: { luck: 0.25 } },
  cattail: { kinds: { dragonfly: 4, damselfly: 2, mayfly: 2 }, every: 11, max: 2, radius: 3, aura: { breed: 0.15 } },
  reeds: { kinds: { damselfly: 3, mosquito: 2 }, every: 9, max: 1, radius: 2.5, aura: { breed: 0.1 } },
  lilypad: { kinds: { waterstrider: 3, mayfly: 2, dragonfly: 1 }, every: 14, max: 2, radius: 2.5, aura: { growth: 0.1 } },
  buglamp: { kinds: { junebug: 3, lunamoth: 0.5, mosquito: 2 }, every: 7, max: 3, radius: 3, aura: { luck: 0.15 }, night: true },
  flowers: { kinds: { monarch: 1, bumblebee: 2, ladybug: 1 }, every: 16, max: 1, radius: 2, aura: {} },
};

// wild bugs that turn up on their own (by time of day)
export const WILD_DAY = { cricket: 3, grasshopper: 3, ladybug: 2, pillbug: 2, earthworm: 2, mosquito: 1.5, bumblebee: 1, monarch: 0.4, katydid: 0.6 };
export const WILD_NIGHT = { firefly: 4, cricket: 3, mosquito: 2, junebug: 1.5, lunamoth: 0.15 };
