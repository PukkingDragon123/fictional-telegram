// Research tree for Reynard's secret lab (v17: research is THE unlock path).
//
// Research is FREE (no coins) but takes TIME: `time` is seconds of game time
// on a lab bench (one bench, more with `mods.labSlots`). Every buildable thing
// and every fish species except the starter bluegill is unlocked by a node.
//
// Node fields:
//   id, branch, name, icon, time (s), req: [node ids], desc
//   zone?    neighbour (zones.js id) you must have met first
//   build?   structure id or [ids] it unlocks      species? fish species id
//   mods?    additive deltas on BASE_MODS           feature? (free-form tag)
//   col      layout column (auto: one more than its deepest prerequisite)
//   row      sub-row inside its branch (auto: 0, 1, 2... when columns collide)
//   tier     0..3 from the time (auto)
//   cost     always 0 (kept so older UI code never reads undefined)
// Node ids are referenced by saves: never rename one.
export const BRANCHES = [
  { id: 'lab', name: 'Reynard\'s Lab', icon: 'flask', color: '#e8c050' },
  { id: 'panfish', name: 'Sunfish & Bass', icon: 'fish', color: '#4fb0d8' },
  { id: 'trout', name: 'Trout & Char', icon: 'fish', color: '#58c0a0' },
  { id: 'salmon', name: 'Salmon Run', icon: 'fish', color: '#e0604a' },
  { id: 'biggame', name: 'Big & Ancient Fish', icon: 'fish', color: '#8a9a3a' },
  { id: 'breed', name: 'Breeding & Genes', icon: 'heart', color: '#f070a0' },
  { id: 'pond', name: 'Pond & Bugs', icon: 'lilypad', color: '#6ac050' },
  { id: 'garden', name: 'Clover\'s Garden', icon: 'carrot', color: '#f0902a' },
  { id: 'snack', name: 'Snack Bar', icon: 'berry', color: '#e8a030' },
  { id: 'beaver', name: 'Beaver Works', icon: 'beaver', color: '#c88a48' },
  { id: 'gizmo', name: 'Gadgets & Tools', icon: 'gear', color: '#a0a8b8' },
  { id: 'decor', name: 'Curb Appeal', icon: 'flower', color: '#f08ac0' },
  { id: 'diner', name: 'Bear Diner', icon: 'picnic', color: '#d0603a' },
  { id: 'woodwork', name: 'Woodworking', icon: 'hammer', color: '#b07840' },
];

// [v18 research] SECTIONS: every branch is a tree "section". Only the starter
// sections are open in a new game; the others are ENCRYPTED until you use their
// "section key": research the gateway node and/or meet a neighbour, then pay
// the coins (game.unlockSection). `node` / `zone` / `coins` are all optional.
// A key always includes the neighbour its first nodes need, so a freshly
// decrypted section has something you can research right away.
export const SECTION_KEYS = {
  lab: { start: true },
  panfish: { start: true },
  breed: { node: 'r_pumpkinseed', coins: 30 },
  garden: { node: 'r_carrot', zone: 'patch', coins: 40 },
  snack: { node: 'r_carrot', zone: 'bakery', coins: 50 },
  beaver: { node: 'r_snackbar', coins: 60 },
  pond: { node: 'r_coffee', zone: 'bend', coins: 60 },
  defense: { node: 'r_beavers', coins: 50 },
  decor: { zone: 'willow', coins: 70 },
  gizmo: { node: 'r_notebook', coins: 90 },
  trout: { node: 'r_perch', coins: 100 },
  woodwork: { node: 'r_woodgarage', zone: 'treehouse', coins: 100 },
  diner: { node: 'r_coffee', zone: 'treehouse', coins: 120 },
  salmon: { node: 'r_brook', coins: 150 },
  biggame: { node: 'r_perch', zone: 'bend', coins: 150 },
};

// [v18 research] the Defense section (src/data/researchDefense.js, written by
// the "bear events" helper) joins the tree when that file exists.
let DEFENSE_MOD = null;
try { DEFENSE_MOD = import.meta.glob('./researchDefense.js', { eager: true })['./researchDefense.js'] || null; } catch { DEFENSE_MOD = null; }
// [F&S mining] the Flint & Steel (industry) section, src/data/researchIndustry.js
let INDUSTRY_MOD = null;
try { INDUSTRY_MOD = import.meta.glob('./researchIndustry.js', { eager: true })['./researchIndustry.js'] || null; } catch { INDUSTRY_MOD = null; }

export const RESEARCH = [
  // ================================================================ Reynard's Lab (the start)
  { id: 'r_carrot', branch: 'lab', name: 'Carrot Seeds', icon: 'carrot', time: 8, req: [], build: 'carrot', desc: 'Plant carrot patches. Bears crunch them, and beavers work 2 jobs for every carrot.' },
  { id: 'r_beavers', branch: 'lab', name: 'Hire Beavers', icon: 'beaver', time: 10, req: [], build: 'lodge', desc: 'Build a Beaver Lodge. Beavers build dams, fences, platforms & contraptions.' },
  { id: 'r_snackbar', branch: 'lab', name: 'Beaver Snack Bar', icon: 'beaverbar', time: 10, req: ['r_beavers'], build: 'beaverbar', desc: 'Beavers only work when PAID. Stock the snack bar with produce and they get busy.' },
  { id: 'r_woodgarage', branch: 'lab', name: 'Wood Garage', icon: 'hammer', time: 15, req: ['r_beavers'], build: 'woodgarage', desc: 'A garage for logs from felled trees: wood for Chip\'s furniture, or to sell to Pip.' },
  { id: 'r_coffee', branch: 'lab', name: 'Fox Espresso', icon: 'flask', time: 25, req: ['r_carrot'], mods: { researchSpeed: 0.25 }, desc: 'Triple-shot espresso for the lab. All research runs 25% faster.' },
  { id: 'r_notebook', branch: 'lab', name: 'Evil Notebook', icon: 'book', time: 90, req: ['r_coffee'], mods: { researchSpeed: 0.25 }, desc: 'Every scheme, written down neatly. Research runs another 25% faster.' },
  { id: 'r_labslots', branch: 'lab', name: 'Second Lab Bench', icon: 'flask', time: 150, req: ['r_notebook'], mods: { labSlots: 1 }, desc: 'A second bench (and a second lab coat): run TWO research projects at once.' },
  { id: 'r_supercomp', branch: 'lab', name: 'Potato Supercomputer', icon: 'gear', time: 300, req: ['r_labslots'], mods: { researchSpeed: 0.5 }, desc: '1,024 potatoes wired in parallel. Research runs 50% faster.' },
  { id: 'r_labslots2', branch: 'lab', name: 'Third Lab Bench', icon: 'flask', time: 420, req: ['r_supercomp'], mods: { labSlots: 1 }, desc: 'Hire an intern (unpaid, obviously): THREE research projects at once.' },

  // ================================================================ Sunfish & Bass
  { id: 'r_pumpkinseed', branch: 'panfish', name: 'Pumpkinseed Eggs', icon: 'fish', time: 12, req: [], species: 'pumpkinseed', desc: 'Stock Pumpkinseed eggs. A pumpkin-orange sunfish with turquoise war paint.' },
  { id: 'r_goldfish', branch: 'panfish', name: 'Pond Goldfish', icon: 'fish', time: 25, req: ['r_pumpkinseed'], species: 'goldfish', desc: 'Adopt flushed goldfish. Breeds fast. Try crossing it with a Pumpkinseed...' },
  { id: 'r_crappie', branch: 'panfish', name: 'Black Crappie', icon: 'fish', time: 30, req: ['r_pumpkinseed'], species: 'crappie', desc: 'Stock Black Crappie: speckled, papery-mouthed and very popular at fish fries.' },
  { id: 'r_perch', branch: 'panfish', name: 'Yellow Perch', icon: 'fish', time: 35, req: ['r_pumpkinseed'], species: 'perch', desc: 'Stock Yellow Perch eggs. Tastier than bluegill, and bears adore the stripes.' },
  { id: 'r_rockbass', branch: 'panfish', name: 'Rock Bass', icon: 'fish', time: 45, req: ['r_crappie'], species: 'rockbass', desc: 'Stock Rock Bass, the red-eyed goggle-eye of rocky shores.' },
  { id: 'r_creekchub', branch: 'panfish', name: 'Creek Chub', icon: 'fish', time: 45, req: ['r_goldfish'], species: 'creekchub', desc: 'Stock Creek Chubs. Cheap, cheerful and they breed like crazy.' },
  { id: 'r_dace', branch: 'panfish', name: 'Redbelly Dace', icon: 'fish', time: 60, req: ['r_creekchub'], species: 'dace', desc: 'Stock Northern Redbelly Dace: tiny, flashy and worth more than they look.' },
  { id: 'r_smallmouth', branch: 'panfish', name: 'Smallmouth Bass', icon: 'fish', time: 75, req: ['r_perch'], species: 'smallmouth', desc: 'Stock Smallmouth Bass: the bronzeback that punches above its weight.' },
  { id: 'r_bass', branch: 'panfish', name: 'Largemouth Bass', icon: 'fish', time: 100, req: ['r_smallmouth'], species: 'bass', desc: 'Stock Largemouth Bass. A hearty meal for a hungry suit.' },
  { id: 'r_drum', branch: 'panfish', name: 'Freshwater Drum', icon: 'fish', time: 120, req: ['r_bass', 'r_rockbass'], species: 'drum', desc: 'Stock Freshwater Drum. It grunts. Bears find it hilarious.' },

  // ================================================================ Trout & Char
  { id: 'r_brook', branch: 'trout', name: 'Brook Trout', icon: 'fish', time: 80, req: ['r_perch'], species: 'brook', desc: 'Stock Brook Trout, the speckled jewel of the north.' },
  { id: 'r_rainbow', branch: 'trout', name: 'Rainbow Trout', icon: 'fish', time: 110, req: ['r_brook'], species: 'rainbow', desc: 'Stock Rainbow Trout. Cross it with a Brook Trout for something... stripey.' },
  { id: 'r_laketrout', branch: 'trout', name: 'Lake Trout', icon: 'fish', time: 150, req: ['r_rainbow'], species: 'laketrout', desc: 'Stock Lake Trout from the cold Shield lakes. Rumour has it they hybridise with Brookies.' },
  { id: 'r_grayling', branch: 'trout', name: 'Arctic Grayling', icon: 'fish', time: 200, req: ['r_laketrout'], species: 'grayling', desc: 'Stock Arctic Grayling: a slim silver fish flying a giant purple sail. Adds beauty just by existing.' },
  { id: 'r_char', branch: 'trout', name: 'Arctic Char', icon: 'fish', time: 300, req: ['r_grayling'], species: 'char', desc: 'Stock Arctic Char from the far north. Sapphire back, sunset belly, luxury prices.' },
  { id: 'r_bulltrout', branch: 'trout', name: 'Bull Trout', icon: 'fish', time: 110, req: ['r_brook'], zone: 'river', species: 'bulltrout', desc: 'Dale knows where the Bull Trout run. Stock their eggs.' },
  { id: 'r_cutthroat', branch: 'trout', name: 'Cutthroat Trout', icon: 'fish', time: 140, req: ['r_bulltrout'], zone: 'river', species: 'cutthroat', desc: 'Stock Cutthroat Trout. The red slash is just a fashion statement.' },
  { id: 'r_browntrout', branch: 'trout', name: 'Brown Trout', icon: 'fish', time: 180, req: ['r_cutthroat'], zone: 'river', species: 'browntrout', desc: 'Stock Brown Trout: wily, spotty, and a little bit posh.' },
  { id: 'r_goldentrout', branch: 'trout', name: 'Golden Trout', icon: 'fish', time: 360, req: ['r_browntrout', 'r_grayling'], zone: 'mush', species: 'goldentrout', desc: 'Rocco "found" some Golden Trout eggs. Don\'t ask where.' },

  // ================================================================ Salmon Run
  { id: 'r_goldeye', branch: 'salmon', name: 'Goldeye', icon: 'fish', time: 60, req: ['r_perch'], zone: 'tower', species: 'goldeye', desc: 'Professor Hoot spotted Goldeye in the ridge lakes. Stock their eggs.' },
  { id: 'r_cisco', branch: 'salmon', name: 'Cisco', icon: 'fish', time: 90, req: ['r_goldeye'], zone: 'tower', species: 'cisco', desc: 'Stock Cisco, the silver lake herring.' },
  { id: 'r_whitefish', branch: 'salmon', name: 'Lake Whitefish', icon: 'fish', time: 100, req: ['r_brook'], species: 'whitefish', desc: 'Stock Lake Whitefish. Humble, silver, and the backbone of every fish fry.' },
  { id: 'r_pinksalmon', branch: 'salmon', name: 'Pink Salmon', icon: 'fish', time: 140, req: ['r_whitefish'], zone: 'river', species: 'pinksalmon', desc: 'Stock Pink Salmon from Dale\'s river. Humpies, he calls them.' },
  { id: 'r_coho', branch: 'salmon', name: 'Coho Salmon', icon: 'fish', time: 180, req: ['r_pinksalmon'], zone: 'river', species: 'coho', desc: 'Stock Coho Salmon, the silver acrobats.' },
  { id: 'r_sockeye', branch: 'salmon', name: 'Sockeye Salmon', icon: 'fish', time: 200, req: ['r_whitefish', 'r_rainbow'], species: 'sockeye', desc: 'Stock Sockeye Salmon, the blazing red pride of B.C.' },
  { id: 'r_kokanee', branch: 'salmon', name: 'Kokanee', icon: 'fish', time: 200, req: ['r_coho', 'r_sockeye'], zone: 'river', species: 'kokanee', desc: 'Stock Kokanee: sockeye that decided the ocean was too much effort.' },
  { id: 'r_chinook', branch: 'salmon', name: 'Chinook Salmon', icon: 'fish', time: 260, req: ['r_sockeye'], species: 'chinook', desc: 'Stock the king salmon. Heavy as a briefcase full of quarterly reports.' },
  { id: 'r_sabertooth', branch: 'salmon', name: 'Sabertooth Salmon', icon: 'fish', time: 420, req: ['r_chinook'], zone: 'mush', species: 'sabertooth', desc: 'An ice-age salmon with fangs. Rocco swears it\'s legal. It is not.' },

  // ================================================================ Big & Ancient Fish
  { id: 'r_walleye', branch: 'biggame', name: 'Walleye', icon: 'fish', time: 60, req: ['r_perch'], zone: 'bend', species: 'walleye', desc: 'Otis brings Walleye eggs. Glow-in-the-dark eyes and Canada\'s favourite fish fry.' },
  { id: 'r_pike', branch: 'biggame', name: 'Northern Pike', icon: 'fish', time: 90, req: ['r_walleye'], zone: 'bend', species: 'pike', desc: 'Stock Northern Pike ("the baguette"). Pike × Walleye makes something spooky.' },
  { id: 'r_bullhead', branch: 'biggame', name: 'Brown Bullhead', icon: 'fish', time: 70, req: ['r_perch'], zone: 'swamp', species: 'bullhead', desc: 'Granny Ribbit\'s whiskery swamp pals. Stock Bullheads.' },
  { id: 'r_catfish', branch: 'biggame', name: 'Channel Catfish', icon: 'fish', time: 150, req: ['r_bullhead'], zone: 'swamp', species: 'catfish', desc: 'Stock Channel Catfish. Purrs? No. Delicious? Yes.' },
  { id: 'r_bowfin', branch: 'biggame', name: 'Bowfin', icon: 'fish', time: 200, req: ['r_catfish'], zone: 'swamp', species: 'bowfin', desc: 'Stock Bowfin, a living fossil that can breathe air. Rude, but impressive.' },
  { id: 'r_burbot', branch: 'biggame', name: 'Burbot', icon: 'fish', time: 160, req: ['r_pike'], species: 'burbot', desc: 'Stock Burbot, a.k.a. "the lawyer". Slimy, whiskered, and the Legal department\'s favourite.' },
  { id: 'r_gar', branch: 'biggame', name: 'Longnose Gar', icon: 'fish', time: 180, req: ['r_pike'], zone: 'willow', species: 'gar', desc: 'Grandpa Shellby\'s ancient friends. Stock Longnose Gar.' },
  { id: 'r_eel', branch: 'biggame', name: 'American Eel', icon: 'fish', time: 220, req: ['r_gar'], zone: 'willow', species: 'eel', desc: 'Stock American Eels. They swam here from the Sargasso Sea. Respect.' },
  { id: 'r_paddlefish', branch: 'biggame', name: 'Paddlefish', icon: 'fish', time: 300, req: ['r_gar'], zone: 'willow', species: 'paddlefish', desc: 'Stock Paddlefish: a fish with a canoe paddle for a nose.' },
  { id: 'r_muskie', branch: 'biggame', name: 'Muskellunge', icon: 'fish', time: 260, req: ['r_burbot', 'r_bass'], species: 'muskie', desc: 'Stock Muskies, the fish of ten thousand casts. Cross with a Pike for a Tiger Muskie.' },
  { id: 'r_sturgeon', branch: 'biggame', name: 'Lake Sturgeon', icon: 'fish', time: 420, req: ['r_muskie', 'r_char'], species: 'sturgeon', desc: 'Stock the armoured Lake Sturgeon, a living dinosaur. One of these feeds a CEO.' },

  // ================================================================ Breeding & Genes
  { id: 'r_food1', branch: 'breed', name: 'Tasty Pellets', icon: 'food', time: 10, req: [], mods: { foodMult: 0.5 }, desc: 'Fish food is 50% more filling, so your fish stay in the mood.' },
  { id: 'r_love1', branch: 'breed', name: 'Mood Lighting', icon: 'heart', time: 30, req: ['r_food1'], mods: { breedMult: 0.3 }, desc: 'Candles, jazz, a little Céline Dion... fish breed 30% faster.' },
  { id: 'r_eggslot', branch: 'breed', name: 'Egg Tray', icon: 'egg', time: 45, req: ['r_love1'], mods: { eggSlots: 1 }, desc: '+1 egg slot.' },
  { id: 'r_growth', branch: 'breed', name: 'Growth Formula', icon: 'flask', time: 60, req: ['r_love1'], mods: { growthMult: 0.5 }, desc: 'Fry grow up 50% faster.' },
  { id: 'r_clutch', branch: 'breed', name: 'Bigger Clutches', icon: 'egg', time: 100, req: ['r_growth'], mods: { clutchBonus: 1 }, desc: '+1 egg in every clutch.' },
  { id: 'r_genetics', branch: 'breed', name: 'Genetics Lab', icon: 'dna', time: 120, req: ['r_eggslot'], mods: { hybridMult: 1 }, desc: 'Cross-breeds produce hybrids twice as often, and the Encyclopedia shows hybrid recipes.' },
  { id: 'r_morphs', branch: 'breed', name: 'Colour Morphs', icon: 'palette', time: 150, req: ['r_genetics'], mods: { morphMult: 1 }, desc: 'Rare colour morphs (albino, calico, ghost...) show up twice as often.' },
  { id: 'r_love2', branch: 'breed', name: 'Fish Love Songs', icon: 'music', time: 180, req: ['r_clutch'], mods: { breedMult: 0.4 }, desc: 'Serenade them with loon calls: +40% breeding speed.' },
  { id: 'r_traits', branch: 'breed', name: 'Personality Test', icon: 'sparkle', time: 180, req: ['r_morphs'], mods: { traitMult: 1 }, desc: 'Good traits (Chonky, Speedy, Lucky...) are twice as likely, bad ones half as likely.' },
  { id: 'r_eggslot2', branch: 'breed', name: 'Egg Rack', icon: 'egg', time: 220, req: ['r_traits'], mods: { eggSlots: 1, hatchSpeed: 0.25 }, desc: '+1 more egg slot, and eggs hatch 25% faster.' },
  { id: 'r_fatten', branch: 'breed', name: 'Premium Feed', icon: 'coin', time: 240, req: ['r_love2'], mods: { fishValueMult: 0.25 }, desc: 'Plump, glossy fish: bears pay 25% more for every fish.' },
  { id: 'r_golden', branch: 'breed', name: 'Golden Genes', icon: 'fish_gold', time: 360, req: ['r_eggslot2'], mods: { goldenMult: 2 }, desc: 'Golden fish (worth 5x) hatch 3x as often. Prismatic fish, too.' },

  // ================================================================ Pond & Bugs
  { id: 'r_seaweed', branch: 'pond', name: 'Pond Plants', icon: 'seaweed', time: 15, req: [], zone: 'bend', build: ['seaweed', 'cattail'], desc: 'Otis shares his cuttings: seaweed (fish graze on it) and cattails (dragonflies!).' },
  { id: 'r_duckweed', branch: 'pond', name: 'Duckweed & Reeds', icon: 'duckweed', time: 30, req: ['r_seaweed'], zone: 'bend', build: ['duckweed', 'reeds'], desc: 'Plant floating duckweed (fry food + hiding) and rustling reeds (bugs + songbirds).' },
  { id: 'r_lilypad', branch: 'pond', name: 'Lily Pads', icon: 'lilypad', time: 45, req: ['r_duckweed'], build: 'lilypad', desc: 'Bug magnets, frog hangouts and shady hiding spots.' },
  { id: 'r_bughotel', branch: 'pond', name: 'Bug Hotel', icon: 'bughotel', time: 70, req: ['r_lilypad'], build: 'bughotel', desc: 'Ladybugs, bumblebees & pill bugs check in. Luck boost nearby.' },
  { id: 'r_tallgrass', branch: 'pond', name: 'Tall Grass', icon: 'bug', time: 20, req: [], zone: 'tower', build: 'tallgrass', desc: 'Professor Hoot\'s tip: let the grass grow. Crickets & grasshoppers move in.' },
  { id: 'r_nests', branch: 'pond', name: 'Nesting Boxes', icon: 'egg', time: 45, req: ['r_tallgrass'], zone: 'tower', build: ['duck_nest', 'goose_nest'], desc: 'Duck and goose nests by the water. Geese chase rampaging bears!' },
  { id: 'r_butterfly', branch: 'pond', name: 'Butterfly Bush', icon: 'flower', time: 60, req: ['r_tallgrass'], build: 'butterflybush', desc: 'Monarchs, bumblebees & ladybugs. Charm + breeding boost nearby.' },
  { id: 'r_buggrinder', branch: 'pond', name: 'Bug Grinder 3000', icon: 'buggrinder', time: 40, req: [], zone: 'swamp', build: 'buggrinder', desc: 'Granny Ribbit\'s zapper: grinds passing bugs into free Bug Bites fish food.' },
  { id: 'r_bogpool', branch: 'pond', name: 'Swamp Bug Farms', icon: 'pond', time: 120, req: ['r_buggrinder'], zone: 'swamp', build: ['bogpool', 'rottinglog'], desc: 'Bog pools (mayflies!) and rotting logs (BIG beetles). Granny\'s secret recipes.' },
  { id: 'r_bugs2', branch: 'pond', name: 'Bug Buffet', icon: 'bug', time: 120, req: ['r_bughotel'], mods: { bugMult: 0.5, bugBonus: 1 }, desc: 'Bug spawners work 50% faster and hold +1 bug.' },
  { id: 'r_glowmeadow', branch: 'pond', name: 'Firefly Meadow', icon: 'lantern', time: 150, req: ['r_butterfly'], zone: 'mush', build: 'glowmeadow', desc: 'Fireflies (and rare Luna Moths) at night. Eggs nearby hatch much faster.' },
  { id: 'r_bigpond', branch: 'pond', name: 'Deep Pond', icon: 'pond', time: 150, req: ['r_bugs2'], mods: { capacityMult: 0.25 }, desc: 'The pond holds 25% more fish.' },
  { id: 'r_bigpond2', branch: 'pond', name: 'Glacier Spring', icon: 'pond', time: 300, req: ['r_bigpond'], mods: { capacityMult: 0.25 }, desc: 'Ice-cold spring water: the pond holds another 25% more fish.' },

  // ================================================================ Clover's Garden
  { id: 'r_lettuce', branch: 'garden', name: 'Salad Days', icon: 'lettuce', time: 20, req: ['r_carrot'], zone: 'patch', build: ['lettuce', 'radish'], desc: 'Lettuce and radishes: the fastest crops in the garden.' },
  { id: 'r_berrybush', branch: 'garden', name: 'Berry Bushes', icon: 'berry', time: 30, req: ['r_carrot'], zone: 'patch', build: ['berries', 'strawberry'], desc: 'Blueberry bushes and strawberry patches. Serve berries in a snack bowl.' },
  { id: 'r_compost', branch: 'garden', name: 'Compost Heap', icon: 'bug', time: 25, req: ['r_carrot'], zone: 'patch', build: 'compost', desc: 'Worms, mealworms & juicy grubs. Growth + size boost nearby.' },
  { id: 'r_cabbage', branch: 'garden', name: 'Veggie Patch', icon: 'cabbage', time: 40, req: ['r_lettuce'], zone: 'patch', build: ['tomato', 'cabbage'], desc: 'Tomato vines and cabbage heads. Fish and bears both approve.' },
  { id: 'r_peas', branch: 'garden', name: 'Peas & Potatoes', icon: 'peas', time: 60, req: ['r_lettuce'], zone: 'patch', build: ['peas', 'potato'], desc: 'Sweet pea trellises and potato hills. Filling and cheap.' },
  { id: 'r_raspberry', branch: 'garden', name: 'Raspberry Canes', icon: 'berry', time: 60, req: ['r_berrybush'], build: 'raspberry', desc: 'Plump red raspberries. Bears go back for seconds.' },
  { id: 'r_bunnies', branch: 'garden', name: 'Bunny Hutch', icon: 'rabbit', time: 90, req: ['r_compost'], zone: 'patch', build: 'rabbithutch', desc: 'Tame bunnies fertilize crops nearby (+40% growth). And they multiply...' },
  { id: 'r_berries', branch: 'garden', name: 'Bumper Crop', icon: 'berry', time: 90, req: ['r_raspberry'], build: 'saskatoon', mods: { produceMult: 0.25 }, desc: 'Saskatoon bushes, and every snack regrows 25% faster. Side dishes mean fewer fish eaten!' },
  { id: 'r_corn', branch: 'garden', name: 'Corn & Sunflowers', icon: 'corn', time: 90, req: ['r_peas'], build: ['corn', 'sunflower'], desc: 'Sweet corn (beavers do 3 jobs per cob!) and giant smiling sunflowers.' },
  { id: 'r_pumpkin', branch: 'garden', name: 'Pumpkin Patch', icon: 'pumpkin', time: 150, req: ['r_corn'], build: 'pumpkin', desc: 'Slow, big and glorious. A legendary batch grows a GIANT pumpkin.' },
  { id: 'r_wildberries', branch: 'garden', name: 'Forest Berry Lore', icon: 'berry', time: 180, req: ['r_berries'], build: ['cranberry', 'cloudberry', 'elderberry', 'goldenberry'], desc: 'Cranberries, cloudberries, elderberries and goldenberries. Each one also needs its landmark found in the forest.' },

  // ================================================================ Snack Bar (Hazel's)
  { id: 'r_snackbowl', branch: 'snack', name: 'Snack Bowls', icon: 'bowl', time: 15, req: [], zone: 'bakery', build: 'snackbowl', desc: 'Fill a bowl with produce: bears help themselves to a side dish.' },
  { id: 'r_flowers', branch: 'snack', name: 'Wildflowers', icon: 'flower', time: 20, req: [], zone: 'patch', build: ['flowers', 'fern'], desc: 'Plant fireweed, lupines and ferns. Pretty, and bees love them.' },
  { id: 'r_pantry', branch: 'snack', name: 'Bear Pantry', icon: 'pantry', time: 60, req: ['r_snackbowl'], zone: 'bakery', build: 'pantry', desc: 'A big larder for 40 servings. Bears grab a snack on their way to the pond.' },
  { id: 'r_willow', branch: 'snack', name: 'Weeping Willow', icon: 'willow', time: 60, req: ['r_flowers'], build: 'willow', desc: 'Plant willows. Bees only nest near willows.' },
  { id: 'r_wildrice', branch: 'snack', name: 'Wild Rice Paddy', icon: 'wildrice', time: 90, req: ['r_snackbowl'], zone: 'bend', build: 'wildrice', desc: 'Grow wild rice in the shallows. Bears slurp it like noodles.' },
  { id: 'r_bees', branch: 'snack', name: 'Beekeeping', icon: 'hive', time: 90, req: ['r_willow', 'r_snackbowl'], build: 'beehive', desc: 'Build beehives near willows. Accountants demand honey.' },
  { id: 'r_mushrooms', branch: 'snack', name: 'Mushroom Logs', icon: 'mushroom', time: 120, req: ['r_bees'], build: 'mushrooms', desc: 'Inoculate logs with chanterelles. Critics go wild for foraged food.' },
  { id: 'r_maple', branch: 'snack', name: 'Sugar Maples', icon: 'maple', time: 150, req: ['r_mushrooms'], build: 'maple', desc: 'Tap sugar maples for syrup. Lumberjacks go wild.' },
  { id: 'r_fert', branch: 'snack', name: 'Compost Magic', icon: 'sparkle', time: 240, req: ['r_maple'], mods: { produceMult: 0.5 }, desc: 'Seaweed, honey, rice, mushrooms, syrup & berries regrow 50% faster.' },
  { id: 'r_bigsnack', branch: 'snack', name: 'All-You-Can-Eat', icon: 'food', time: 300, req: ['r_fert', 'r_pantry'], mods: { snackMealMult: 0.5 }, desc: 'Every snack serving fills bears 50% more.' },

  // ================================================================ Beaver Works (Dale)
  { id: 'r_beaverchow', branch: 'beaver', name: 'Beaver Chow', icon: 'beaver', time: 40, req: ['r_snackbar'], mods: { buildSpeed: 0.25 }, desc: 'A balanced diet of bark and carrots: beavers build 25% faster.' },
  { id: 'r_dams', branch: 'beaver', name: 'Beaver Dams', icon: 'dam', time: 30, req: ['r_beavers'], zone: 'river', build: 'dam', desc: 'Dams block fish and bears. Wall off a safe nursery!' },
  { id: 'r_fences', branch: 'beaver', name: 'Log Fences', icon: 'fence', time: 30, req: ['r_dams'], zone: 'river', build: 'fence', desc: 'Fences keep bears out on land.' },
  { id: 'r_toolbox', branch: 'beaver', name: 'Beaver Tool Box', icon: 'hammer', time: 60, req: ['r_dams'], zone: 'river', build: 'toolbox', desc: 'Sharp saws, new mallets: a facility that makes beavers build 50% faster.' },
  { id: 'r_platforms', branch: 'beaver', name: 'Stilt Platforms', icon: 'platform', time: 90, req: ['r_fences'], build: 'platform', desc: 'Raised decks: rampage-proof farming, and fish hide beneath.' },
  { id: 'r_beaverbed', branch: 'beaver', name: 'Beaver Bed', icon: 'beaver', time: 120, req: ['r_toolbox'], build: 'beaverbed', desc: 'A cozy log bed. Well rested: +1 beaver per lodge.' },
  { id: 'r_gates', branch: 'beaver', name: 'Sluice Gates', icon: 'gate', time: 120, req: ['r_platforms'], build: 'gate', desc: 'Openable dams: let fish out of the nursery on your terms.' },
  { id: 'r_gearstation', branch: 'beaver', name: 'Gear Station', icon: 'gear', time: 180, req: ['r_beaverbed'], build: 'gearstation', desc: 'A grinding wheel for teeth and axes: build +50%, chopping +50%.' },

  // ================================================================ Gadgets & Tools (Otis + Rocco)
  { id: 'r_labelmaker', branch: 'gizmo', name: 'Label Maker', icon: 'tag', time: 30, req: [], mods: { tagBonus: 2 }, desc: '+2 "DO NOT EAT" tags. Click-clack, this fish is MINE.' },
  { id: 'r_shovelshed', branch: 'gizmo', name: 'Shovel Shed', icon: 'shovel', time: 20, req: [], zone: 'bend', build: 'shovelshed', desc: 'A sturdy shovel: digging the pond costs 35% less.' },
  { id: 'r_tagrack', branch: 'gizmo', name: 'Tag Rack', icon: 'tag', time: 40, req: ['r_shovelshed'], zone: 'bend', build: 'tagrack', desc: '+3 "DO NOT EAT" tags. Tagged fish are off the menu.' },
  { id: 'r_feedsilo', branch: 'gizmo', name: 'Feed Silo', icon: 'food', time: 80, req: ['r_tagrack'], build: 'feedsilo', desc: 'Carry 75% more fish food, and it refills faster.' },
  { id: 'r_whisper', branch: 'gizmo', name: 'Whisper Shell', icon: 'nurture', time: 120, req: ['r_feedsilo'], build: 'whispershell', desc: 'Fish hear sweet nothings: petting gives twice the love.' },
  { id: 'r_feeder', branch: 'gizmo', name: 'Auto-Feeder', icon: 'feeder', time: 90, req: ['r_beavers'], zone: 'mush', build: 'feeder', desc: 'Rocco\'s contraption that feeds your fish for you.' },
  { id: 'r_sprinkler', branch: 'gizmo', name: 'Sprinkler', icon: 'sprinkler', time: 120, req: ['r_feeder'], build: 'sprinkler', desc: 'A rain-barrel sprinkler: snacks nearby regrow 60% faster.' },
  { id: 'r_hatchery', branch: 'gizmo', name: 'Egg Incubator', icon: 'incubator', time: 150, req: ['r_sprinkler'], build: 'hatchery', desc: 'A heat-lamp incubator: +1 egg slot each, and eggs hatch faster.' },
  { id: 'r_buglamp', branch: 'gizmo', name: 'Bug Lamp', icon: 'buglamp', time: 150, req: ['r_hatchery'], build: 'buglamp', desc: 'A humming porch lamp that draws moths and beetles for your fish.' },
  { id: 'r_aerator', branch: 'gizmo', name: 'Bubble Aerator', icon: 'aerator', time: 200, req: ['r_buglamp'], build: 'aerator', desc: 'Bubbles make fish frisky: +60% breeding nearby.' },

  // ================================================================ Curb Appeal (Grandpa Shellby)
  { id: 'r_decor0', branch: 'decor', name: 'Cottage Comforts', icon: 'chair', time: 15, req: [], zone: 'willow', build: ['lantern', 'chair', 'picnic'], desc: 'Lanterns, Muskoka chairs and a picnic table. Beauty brings more customers.' },
  { id: 'r_decor1', branch: 'decor', name: 'Cottage Kitsch', icon: 'pinwheel', time: 30, req: ['r_decor0'], build: ['mailbox', 'pinwheel', 'bench'], desc: 'Mailbox, pinwheel and a maple bench. Beauty brings bigger bills.' },
  { id: 'r_garden', branch: 'decor', name: 'Garden Party', icon: 'birdhouse', time: 60, req: ['r_decor1'], build: ['birdhouse', 'birdbath', 'gnome'], desc: 'Birdhouses, bird baths and a moose gnome. Songbirds move in!' },
  { id: 'r_lights', branch: 'decor', name: 'Mood Lighting II', icon: 'lantern', time: 90, req: ['r_garden'], build: ['stringlights', 'stonelantern'], desc: 'String lights and stone lanterns.' },
  { id: 'r_canadiana', branch: 'decor', name: 'True North', icon: 'flag', time: 120, req: ['r_lights'], build: ['flag', 'canoe', 'hockey', 'campfire'], desc: 'Flag pole, red canoe, hockey net and a crackling campfire. Peak Canadian.' },
  { id: 'r_waterdecor', branch: 'decor', name: 'Water Garden', icon: 'floatlantern', time: 150, req: ['r_canadiana'], build: ['stones', 'floatlantern', 'decoy'], desc: 'Stepping stones, floating lanterns and a duck decoy.' },
  { id: 'r_garden2', branch: 'decor', name: 'Rose Arch', icon: 'arch', time: 180, req: ['r_waterdecor'], build: 'arch', desc: 'A climbing-rose flower arch. Bears line up for selfies.' },
  { id: 'r_canadiana2', branch: 'decor', name: 'Moose Monument', icon: 'moose', time: 240, req: ['r_garden2'], build: 'moose', desc: 'A majestic carved moose statue. Tourists travel for miles.' },
  { id: 'r_waterdecor2', branch: 'decor', name: 'Grand Features', icon: 'lighthouse', time: 360, req: ['r_canadiana2'], build: ['fountain', 'lighthouse'], desc: 'A leaping-fish fountain and a Maritimes mini lighthouse.' },
  { id: 'r_beauty', branch: 'decor', name: 'Beauty Pageant', icon: 'trophy', time: 300, req: ['r_waterdecor2'], mods: { beautyMult: 0.5 }, desc: 'Every beauty point counts 50% more.' },

  // ================================================================ Bear Diner (Chip's furniture + Hazel's facilities)
  { id: 'r_picnic', branch: 'diner', name: 'Picnic Area', icon: 'picnic', time: 20, req: [], zone: 'treehouse', build: ['picnictable', 'menuboard', 'tikitorch'], desc: 'Picnic tables, a menu board and tiki torches. Comfy bears stay and pay.' },
  { id: 'r_bistro', branch: 'diner', name: 'Bistro Corner', icon: 'table', time: 45, req: ['r_picnic'], build: ['roundtable', 'planterbox', 'beercooler'], desc: 'Bistro tables, planter boxes and an ice-cold Daisy Cooler.' },
  { id: 'r_parasol', branch: 'diner', name: 'Lazy Afternoon', icon: 'umbrella', time: 70, req: ['r_bistro'], build: ['umbrellatable', 'hammock'], desc: 'Parasol tables and hammocks. Very relaxing.' },
  { id: 'r_bbq', branch: 'diner', name: 'BBQ Grill', icon: 'bbq', time: 90, req: ['r_bistro'], build: 'bbq', desc: 'Sizzle sizzle. Bears smell it from the office (+bears).' },
  { id: 'r_hangout', branch: 'diner', name: 'Campfire Hangout', icon: 'campfire', time: 120, req: ['r_parasol'], build: 'hangout', desc: 'Log benches round a crackling fire. The cozy heart of the place.' },
  { id: 'r_bar', branch: 'diner', name: 'Daisy Beer Bar', icon: 'bar', time: 150, req: ['r_bbq'], build: 'bar', desc: 'A proper bar with Daisy Beer on tap. Bears linger and tip.' },
  { id: 'r_jukebox', branch: 'diner', name: 'Jukebox', icon: 'music', time: 180, req: ['r_bar'], build: 'jukebox', desc: 'Plays the hits. Bears dance a little.' },
  { id: 'r_neon', branch: 'diner', name: 'Neon Sign', icon: 'neon', time: 240, req: ['r_jukebox'], build: 'neonsign', desc: 'BEAR\'S DINER in buzzing neon. Draws a crowd.' },
  { id: 'r_tipjar', branch: 'diner', name: 'Tip Jar', icon: 'coins', time: 30, req: [], zone: 'bakery', build: 'tipjar', desc: 'Hazel\'s trick: a jar by the counter. Snack bonuses and tips +50%.' },
  { id: 'r_pricesign', branch: 'diner', name: 'Price Board', icon: 'coin', time: 60, req: ['r_tipjar'], build: 'pricesign', desc: 'A chalkboard of "market prices". Bears pay 20% more.' },
  { id: 'r_waitbench', branch: 'diner', name: 'Waiting Bench', icon: 'bench', time: 90, req: ['r_pricesign'], build: 'waitbench', desc: 'Magazines and a bench: bears are 30% more patient.' },
  { id: 'r_stressbin', branch: 'diner', name: 'Stress Ball Bucket', icon: 'bear_happy', time: 150, req: ['r_waitbench'], build: 'stressbin', desc: 'Squeeze! 35% of angry bears calm down instead of rampaging.' },
  { id: 'r_prboard', branch: 'diner', name: 'PR Billboard', icon: 'newspaper', time: 240, req: ['r_stressbin'], build: 'prboard', desc: 'A smiling bear on a billboard. Bad reviews hurt 40% less.' },
  { id: 'r_franchise', branch: 'diner', name: 'Franchise Empire', icon: 'crown', time: 420, req: ['r_prboard', 'r_neon'], build: 'franchise', desc: 'A solid gold Reynard statue. Every bill doubled, and you can retire as a legend.' },

  // ================================================================ Woodworking (Chip's plans)
  { id: 'r_ww_basic', branch: 'woodwork', name: 'Woodshop Basics', icon: 'hammer', time: 20, req: [], zone: 'treehouse', build: ['wd_stool', 'wd_crate'], desc: 'Plans for log stools and crate stacks. Chip crafts them from wood.' },
  { id: 'r_ww_table', branch: 'woodwork', name: 'Tables & Barrels', icon: 'table', time: 60, req: ['r_ww_basic'], build: ['wd_table', 'wd_barrel'], desc: 'Plans for plank tables and syrup barrels.' },
  { id: 'r_restore', branch: 'woodwork', name: 'Restoration', icon: 'star', time: 60, req: ['r_ww_basic'], build: ['an_chair', 'an_table', 'an_lamp'], desc: 'Chip learns to repair the broken armchairs, tables and lanterns you find in the forest.' },
  { id: 'r_ww_shelf', branch: 'woodwork', name: 'Shelves & Planters', icon: 'pantry', time: 90, req: ['r_ww_table'], build: ['wd_shelf', 'wd_planter'], desc: 'Plans for pine shelves and cedar planter boxes.' },
  { id: 'r_ww_bench', branch: 'woodwork', name: 'Benches & Rockers', icon: 'chair', time: 150, req: ['r_ww_shelf'], build: ['wd_bench', 'wd_rocker'], desc: 'Plans for bear benches and rocking chairs. Creak... creak... bliss.' },
  { id: 'r_restore2', branch: 'woodwork', name: 'Master Restorer', icon: 'clock', time: 180, req: ['r_restore'], build: ['an_cart', 'an_clock'], desc: 'Restore the old hand cart and the grandfather clock.' },
  { id: 'r_ww_fancy', branch: 'woodwork', name: 'Fancy Carpentry', icon: 'birdhouse', time: 240, req: ['r_ww_bench'], build: ['wd_birdhouse', 'wd_arch'], desc: 'Plans for birdhouse towers and twig arches.' },
];

// [v18 research] merge the Defense section (optional file, see above)
if (DEFENSE_MOD && Array.isArray(DEFENSE_MOD.DEFENSE_RESEARCH)) {
  const DB = DEFENSE_MOD.DEFENSE_BRANCH || {};
  const bid = DB.id || 'defense';
  if (!BRANCHES.some((b) => b.id === bid)) BRANCHES.push({ name: 'Bear Defense', icon: 'fence', color: '#d84a4a', ...DB, id: bid });
  if (DB.key || DB.start) SECTION_KEYS[bid] = DB.start ? { start: true } : { ...DB.key };
  const have = new Set(RESEARCH.map((r) => r.id));
  for (const r of DEFENSE_MOD.DEFENSE_RESEARCH) {
    if (!r || !r.id || have.has(r.id)) continue;
    have.add(r.id);
    RESEARCH.push({ icon: 'fence', time: 60, desc: '', ...r, branch: r.branch || bid, req: Array.isArray(r.req) ? r.req : [] });
  }
}

// [F&S mining] merge the Flint & Steel section (nodes may also sit in other branches, e.g. the Lab gateway)
if (INDUSTRY_MOD && Array.isArray(INDUSTRY_MOD.INDUSTRY_RESEARCH)) {
  const IB = INDUSTRY_MOD.INDUSTRY_BRANCH || {};
  const bid = IB.id || 'industry';
  if (!BRANCHES.some((b) => b.id === bid)) BRANCHES.push({ name: 'Flint & Steel', icon: 'gear', color: '#8a8f9c', ...IB, id: bid });
  if (IB.key) SECTION_KEYS[bid] = { ...IB.key };
  const have = new Set(RESEARCH.map((r) => r.id));
  for (const r of INDUSTRY_MOD.INDUSTRY_RESEARCH) {
    if (!r || !r.id || have.has(r.id)) continue;
    have.add(r.id);
    RESEARCH.push({ icon: 'gear', time: 60, desc: '', ...r, branch: r.branch || bid, req: Array.isArray(r.req) ? r.req : [] });
  }
}

// [v26] extension research: every src/data/ext/*.js may export BRANCHES ([{ id, name, icon, color, key }]) and RESEARCH (nodes)
for (const m of Object.values(import.meta.glob('./ext/*.js', { eager: true }))) {
  for (const b of m.BRANCHES || []) { if (!BRANCHES.some((x) => x.id === b.id)) BRANCHES.push({ icon: 'gear', color: '#8a8f9c', ...b }); if (b.key) SECTION_KEYS[b.id] = { ...b.key }; }
  const have = new Set(RESEARCH.map((r) => r.id));
  for (const r of m.RESEARCH || []) { if (!r || !r.id || have.has(r.id)) continue; have.add(r.id); RESEARCH.push({ icon: 'gear', time: 60, desc: '', ...r, req: Array.isArray(r.req) ? r.req : [] }); }
}

export const RESEARCH_BY_ID = Object.fromEntries(RESEARCH.map((r) => [r.id, r]));
// [v18 research] section lookups
export const BRANCH_BY_ID = Object.fromEntries(BRANCHES.map((b) => [b.id, b]));
for (const b of BRANCHES) b.key = SECTION_KEYS[b.id] || b.key || { coins: 100 };
export const STARTER_SECTIONS = BRANCHES.filter((b) => b.key.start).map((b) => b.id);

// [v18 research] coins to speed up a running job. `left` = seconds still to go
// (at the current research speed). mode 'half' = -50% of what is left,
// 'now' = finish right away. Longer jobs and higher tiers cost more.
export function researchRushPrice(r, left, mode = 'now') {
  const tier = r?.tier || 0;
  const raw = (4 + Math.max(0, left) * 0.5) * (1 + tier * 0.25);
  const k = mode === 'half' ? 0.45 : 1;
  const p = Math.max(mode === 'half' ? 3 : 5, raw * k);
  return p >= 50 ? Math.ceil(p / 5) * 5 : Math.ceil(p);
}

// ---- layout + derived fields (col = depth, row = sub-row inside the branch)
(function layout() {
  const colOf = new Map();
  const depth = (r, seen = new Set()) => {
    if (colOf.has(r.id)) return colOf.get(r.id);
    if (seen.has(r.id)) return 0;
    seen.add(r.id);
    const c = r.req.length ? 1 + Math.max(...r.req.map((q) => (RESEARCH_BY_ID[q] ? depth(RESEARCH_BY_ID[q], seen) : 0))) : 0;
    colOf.set(r.id, c);
    return c;
  };
  const taken = new Set();
  for (const r of RESEARCH) {
    r.cost = 0;
    if (r.col == null) r.col = depth(r);
    if (r.row == null) { let row = 0; while (taken.has(`${r.branch}:${row}:${r.col}`)) row++; r.row = row; }
    taken.add(`${r.branch}:${r.row}:${r.col}`);
    if (r.tier == null) r.tier = r.time <= 15 ? 0 : r.time <= 45 ? 1 : r.time <= 150 ? 2 : 3;
  }
})();

export const BASE_MODS = {
  foodMult: 1, breedMult: 1, clutchBonus: 0, hybridMult: 1, goldenMult: 1, growthMult: 1, fishValueMult: 1,
  produceMult: 1, bugMult: 1, bugBonus: 0, digMult: 1, buildSpeed: 1, beaverBonus: 0, capacityMult: 1, capacityBonus: 0,
  payMult: 1, patienceMult: 1, tipMult: 1, calmChance: 0, bearBonus: 0, badReviewMult: 1, rampageReduce: 0,
  eggSlots: 0, hatchSpeed: 1, morphMult: 1, traitMult: 1, snackMealMult: 1, beautyMult: 1, bagBonus: 1, tagBonus: 0, nurtureMult: 1,
  mutationMult: 1, clearPayMult: 1, cropLuck: 1, clearSpeed: 1,
  researchSpeed: 1, labSlots: 0, // v17: lab benches (1 + labSlots) and research speed
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
