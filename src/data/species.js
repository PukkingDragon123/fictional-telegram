// Fish species. `meal` = how filling for a bear (meal points), `value` = coin
// multiplier, `size` = adult body length in world units (1 tile = 1 unit).
// `tier` 0..4 is the base rarity (common .. legendary) used by eggs.
// `look` + `colors` describe the pixel-art sprite (src/art/fishArt.js).
export const SPECIES = [
  // ---------------------------------------------------------------- panfish
  {
    id: 'bluegill', name: 'Bluegill', latin: 'Lepomis macrochirus', tier: 0,
    desc: 'A plucky little sunfish. Cheap, cheerful and breeds like crazy.',
    price: 10, meal: 1, value: 1, breed: 1.25, growth: 1.2, speed: 1.0, size: 0.95, unlock: 'start',
    look: 'Deep round sunfish body. Olive-blue back, blue-violet sides with 5 faint dark vertical bars, orange-yellow breast, dark navy "ear" flap behind the gill, long dorsal fin.',
    colors: { back: 0x3a5f9c, side: 0x5b86c9, belly: 0xe8a34c, fin: 0x3f6aa8, accent: 0x16223a },
  },
  {
    id: 'pumpkinseed', name: 'Pumpkinseed', latin: 'Lepomis gibbosus', tier: 0,
    desc: 'A pumpkin-orange sunfish with turquoise war paint. Cottage-dock royalty.',
    price: 14, meal: 1, value: 1.15, breed: 1.2, growth: 1.2, speed: 1.0, size: 0.9, unlock: 'r_pumpkinseed',
    look: 'Very round, flat sunfish. Olive-gold back, sides speckled orange and gold, bright orange belly, wavy turquoise lines on the cheek, small bright red spot on the black ear flap.',
    colors: { back: 0x6a7a3a, side: 0xd8a040, belly: 0xf07a2a, fin: 0x8a8a4a, accent: 0x3ad0c8 },
  },
  {
    id: 'goldfish', name: 'Pond Goldfish', latin: 'Carassius auratus', tier: 0,
    desc: 'Somebody flushed Mr. Bubbles. Now he lives here, rent-free. Bears think he\'s a snack-size treat.',
    price: 12, meal: 0.8, value: 1.3, breed: 1.3, growth: 1.3, speed: 0.9, size: 0.8, unlock: 'r_goldfish',
    look: 'Chubby egg-shaped body, glossy orange with a paler yellow belly, big round eye, flowing double tail and fins with lighter orange edges.',
    colors: { back: 0xd8501a, side: 0xf08a2a, belly: 0xffd070, fin: 0xf8a050, accent: 0xffe0a0 },
  },
  {
    id: 'perch', name: 'Yellow Perch', latin: 'Perca flavescens', tier: 1,
    desc: 'Golden with bold tiger stripes. A Great Lakes classic that bears adore.',
    price: 22, meal: 1.5, value: 1.25, breed: 1.1, growth: 1.1, speed: 1.05, size: 1.05, unlock: 'r_perch',
    look: 'Torpedo-ish body with a humped back. Golden-yellow sides with 6-7 dark olive vertical bars, pale belly, spiny dorsal fin, bright orange lower fins.',
    colors: { back: 0x5e6f2a, side: 0xe0c040, belly: 0xf6e8a8, fin: 0xe8743a, accent: 0x3c4a1e },
  },
  {
    id: 'smallmouth', name: 'Smallmouth Bass', latin: 'Micropterus dolomieu', tier: 1,
    desc: 'The bronzeback. Punches way above its weight class. Loves rocky shallows.',
    price: 34, meal: 2, value: 1.3, breed: 1.0, growth: 1.0, speed: 1.1, size: 1.15, unlock: 'r_smallmouth',
    look: 'Muscular bass body, bronze-brown with darker vertical bars, dark lines radiating from the red eye across the cheek, cream belly.',
    colors: { back: 0x5a4a28, side: 0xa8844a, belly: 0xe8dcb8, fin: 0x8a6a3a, accent: 0xc83028 },
  },
  {
    id: 'bass', name: 'Largemouth Bass', latin: 'Micropterus salmoides', tier: 1,
    desc: 'Big mouth, bigger attitude. A hearty meal for a hungry suit.',
    price: 42, meal: 2.5, value: 1.35, breed: 0.95, growth: 1.0, speed: 1.0, size: 1.25, unlock: 'r_bass',
    look: 'Chunky bass with a huge mouth reaching past the eye. Green back, lime-olive sides with a jagged dark horizontal stripe along the middle, white belly.',
    colors: { back: 0x3e5e2a, side: 0x7fa04a, belly: 0xe6ecd0, fin: 0x5a7a36, accent: 0x2a3e1c },
  },
  // ---------------------------------------------------------------- trout & char
  {
    id: 'brook', name: 'Brook Trout', latin: 'Salvelinus fontinalis', tier: 1,
    desc: 'The speckled jewel of northern streams. Red spots with blue halos!',
    price: 60, meal: 2, value: 1.6, breed: 0.9, growth: 0.95, speed: 1.15, size: 1.2, unlock: 'r_brook',
    look: 'Trout body. Dark olive back with pale wormy squiggles, sides with yellow spots and a few red spots ringed in blue, orange-red belly, lower fins orange with a crisp white leading edge.',
    colors: { back: 0x3f4f2e, side: 0x6a7a44, belly: 0xe86a2c, fin: 0xd8582a, accent: 0xd03030 },
  },
  {
    id: 'rainbow', name: 'Rainbow Trout', latin: 'Oncorhynchus mykiss', tier: 2,
    desc: 'Silver with a blushing pink stripe. Fights hard, tastes better.',
    price: 90, meal: 2.5, value: 1.8, breed: 0.85, growth: 0.9, speed: 1.2, size: 1.3, unlock: 'r_rainbow',
    look: 'Sleek trout. Green-grey back, silvery sides with a wide rosy-pink band from cheek to tail, small black spots all over back and tail, white belly.',
    colors: { back: 0x5a7a58, side: 0xc8d0cc, belly: 0xf2f4f0, fin: 0x9aa89a, accent: 0xe07a8a },
  },
  {
    id: 'laketrout', name: 'Lake Trout', latin: 'Salvelinus namaycush', tier: 2,
    desc: 'A deep, cold-water giant from the Shield lakes. Patient, grumpy, delicious.',
    price: 130, meal: 3, value: 1.9, breed: 0.75, growth: 0.8, speed: 1.05, size: 1.45, unlock: 'r_laketrout',
    look: 'Long heavy char body with a deeply forked tail. Grey-green back and sides covered in creamy pale spots, pale belly, pale fin edges.',
    colors: { back: 0x3a4a44, side: 0x6a7a70, belly: 0xe0e4d8, fin: 0x5a6a60, accent: 0xe8e4c8 },
  },
  {
    id: 'grayling', name: 'Arctic Grayling', latin: 'Thymallus arcticus', tier: 3,
    desc: 'Flies a huge purple sail fin like a tiny Viking ship. The Yukon\'s showoff.',
    price: 220, meal: 2.5, value: 2.8, breed: 0.7, growth: 0.85, speed: 1.2, size: 1.2, unlock: 'r_grayling',
    look: 'Slim silvery-lavender body with scattered black spots near the head, and an enormous tall sail-like dorsal fin: dark purple with turquoise and pink spots and a red edge.',
    colors: { back: 0x4a4a6a, side: 0xa8a8c8, belly: 0xe8e8f0, fin: 0x6a3a8a, accent: 0x3ac8b8 },
  },
  {
    id: 'char', name: 'Arctic Char', latin: 'Salvelinus alpinus', tier: 3,
    desc: 'From the far north: sapphire back, sunset belly. Pure luxury.',
    price: 480, meal: 4, value: 3, breed: 0.6, growth: 0.75, speed: 1.15, size: 1.35, unlock: 'r_char',
    look: 'Char body. Deep sapphire-blue back, blue-grey sides with pale pink spots, blazing red-orange belly, red lower fins with white leading edges.',
    colors: { back: 0x2a3a5a, side: 0x5a6a8a, belly: 0xf05a30, fin: 0xe8603a, accent: 0xf0b0b8 },
  },
  // ---------------------------------------------------------------- salmon & whitefish
  {
    id: 'whitefish', name: 'Lake Whitefish', latin: 'Coregonus clupeaformis', tier: 1,
    desc: 'A humble silver fish with a tiny head and a big hump. Every fish fry in Ontario owes it one.',
    price: 50, meal: 2, value: 1.5, breed: 1.0, growth: 1.0, speed: 1.05, size: 1.2, unlock: 'r_whitefish',
    look: 'Silvery body with a humped back behind a small pointy head, bright silver-white sides with a faint blue-grey back, clear greyish fins, small adipose fin.',
    colors: { back: 0x6a7a8a, side: 0xd0d8e0, belly: 0xf4f6f8, fin: 0xa8b0b8, accent: 0x8a98a8 },
  },
  {
    id: 'sockeye', name: 'Sockeye Salmon', latin: 'Oncorhynchus nerka', tier: 2,
    desc: 'Blazing red with a green head. The pride of British Columbia.',
    price: 150, meal: 3, value: 2.2, breed: 0.75, growth: 0.85, speed: 1.25, size: 1.4, unlock: 'r_sockeye',
    look: 'Spawning salmon: bright crimson body, olive-green head with a hooked jaw, humped back, greenish fins.',
    colors: { back: 0xb02828, side: 0xd83a30, belly: 0xe8604a, fin: 0x5a7a3a, accent: 0x4a7a3a },
  },
  {
    id: 'chinook', name: 'Chinook Salmon', latin: 'Oncorhynchus tshawytscha', tier: 3,
    desc: 'The king salmon. Chrome-bright, heavy as a briefcase full of quarterly reports.',
    price: 300, meal: 5, value: 2.4, breed: 0.65, growth: 0.75, speed: 1.2, size: 1.6, unlock: 'r_chinook',
    look: 'Big thick salmon. Blue-green back with black spots on the back and both tail lobes, bright chrome-silver sides, white belly, black gum line.',
    colors: { back: 0x3a5a6a, side: 0xc8d4dc, belly: 0xf4f6f8, fin: 0x6a7a80, accent: 0x1a2024 },
  },
  // ---------------------------------------------------------------- big game
  {
    id: 'walleye', name: 'Walleye', latin: 'Sander vitreus', tier: 2,
    desc: 'Glassy glow-in-the-dark eyes. Canada\'s favourite fish fry.',
    price: 200, meal: 4, value: 2.6, breed: 0.65, growth: 0.8, speed: 1.1, size: 1.4, unlock: 'r_walleye',
    look: 'Long perch-like body, olive-gold with darker saddles on the back, white belly, big glassy pale-silver eyes, white tip on the lower tail lobe, two dorsal fins (spiny then soft).',
    colors: { back: 0x6a6a30, side: 0xc4a848, belly: 0xf0ecd0, fin: 0xa89040, accent: 0xe8f0c0 },
  },
  {
    id: 'pike', name: 'Northern Pike', latin: 'Esox lucius', tier: 2,
    desc: 'A long, toothy ambush predator. Bears call it "the baguette".',
    price: 240, meal: 4, value: 2.2, breed: 0.7, growth: 0.8, speed: 1.35, size: 1.7, unlock: 'r_pike',
    look: 'Very long torpedo body with a duck-bill snout full of teeth. Dark green back, green sides covered in rows of pale yellow bean-shaped spots, cream belly, dorsal fin far back near the tail.',
    colors: { back: 0x3a5a2c, side: 0x5e8440, belly: 0xe8ecc8, fin: 0x8a8a3a, accent: 0xd8dc80 },
  },
  {
    id: 'burbot', name: 'Burbot', latin: 'Lota lota', tier: 2,
    desc: 'Nicknamed "the lawyer". Slimy, whiskered, and weirdly popular with the Legal department.',
    price: 180, meal: 3, value: 2.3, breed: 0.8, growth: 0.85, speed: 0.85, size: 1.45, unlock: 'r_burbot',
    look: 'Eel-like long body with a broad flat head and a single whisker (barbel) on the chin. Mottled brown and yellow-olive marbling, long low dorsal and anal fins running to a rounded tail.',
    colors: { back: 0x4a3a22, side: 0x8a7a44, belly: 0xd8cc98, fin: 0x5a4a2a, accent: 0x2a2014 },
  },
  {
    id: 'muskie', name: 'Muskellunge', latin: 'Esox masquinongy', tier: 3,
    desc: 'The fish of ten thousand casts. The CEO keeps one mounted in his office.',
    price: 600, meal: 6, value: 2.8, breed: 0.55, growth: 0.7, speed: 1.3, size: 1.9, unlock: 'r_muskie',
    look: 'Huge long pike-shaped body with a duck-bill jaw. Light olive-silver with bold dark vertical tiger bars, bronze-tinged fins with dark spots, cream belly.',
    colors: { back: 0x5a6a4a, side: 0xb8b890, belly: 0xece8d0, fin: 0xa8783a, accent: 0x3a4028 },
  },
  {
    id: 'sturgeon', name: 'Lake Sturgeon', latin: 'Acipenser fulvescens', tier: 4,
    desc: 'A living dinosaur armoured in bony plates. One of these feeds a CEO.',
    price: 1100, meal: 9, value: 3.4, breed: 0.4, growth: 0.55, speed: 0.75, size: 2.1, unlock: 'r_sturgeon',
    look: 'Prehistoric: long body with rows of bony white-grey plates (scutes) along the back and sides, pointed shovel snout with 4 whiskers underneath, shark-like tail with a longer upper lobe. Slate grey-brown, pale belly.',
    colors: { back: 0x5a5a4e, side: 0x7a786a, belly: 0xd8d4c4, fin: 0x5a5a4e, accent: 0xc4c0a8 },
  },
  // ---------------------------------------------------------------- hybrids (discovered by cross-breeding)
  {
    id: 'sunperch', name: 'Sunburst Perch', latin: 'Lepomis × Perca', tier: 2,
    desc: 'Bluegill × Perch. Turquoise and gold, like a sunrise on Georgian Bay.',
    price: 0, meal: 1.5, value: 2, breed: 1.1, growth: 1.1, speed: 1.05, size: 1.0, unlock: 'hybrid', parents: ['bluegill', 'perch'],
    look: 'Round-ish perch/sunfish mix. Turquoise back and sides with orange-gold vertical bars, sunny yellow belly, orange fins.',
    colors: { back: 0x2a8a8a, side: 0x48c0b0, belly: 0xf6d040, fin: 0xf08a3a, accent: 0xf0a030 },
  },
  {
    id: 'goldseed', name: 'Sunny Goldie', latin: 'Carassius × Lepomis', tier: 2,
    desc: 'Goldfish × Pumpkinseed. A glowing tangerine sunfish with a flowing tail. Pure cottage vibes.',
    price: 0, meal: 1.2, value: 2.2, breed: 1.2, growth: 1.2, speed: 0.95, size: 0.95, unlock: 'hybrid', parents: ['goldfish', 'pumpkinseed'],
    look: 'Round sunfish shape with a long flowing goldfish tail. Bright tangerine body, turquoise cheek squiggles, lemon belly, translucent orange fins.',
    colors: { back: 0xe06a1a, side: 0xf8a030, belly: 0xffe070, fin: 0xffb060, accent: 0x40d8d0 },
  },
  {
    id: 'bassgill', name: 'Bassgill', latin: 'Micropterus × Lepomis', tier: 2,
    desc: 'Bass × Bluegill. A chonky round boi with a big grin.',
    price: 0, meal: 2.5, value: 2, breed: 1.0, growth: 1.0, speed: 0.95, size: 1.15, unlock: 'hybrid', parents: ['bass', 'bluegill'],
    look: 'Very round, chubby body with a big bass mouth. Teal-green back, sea-green sides with 3 dark bars, orange belly, blue-grey fins.',
    colors: { back: 0x3a6a5a, side: 0x6aa07a, belly: 0xf0a040, fin: 0x4a7a8a, accent: 0x2a4e40 },
  },
  {
    id: 'tiger', name: 'Tiger Trout', latin: 'Salvelinus × Salmo', tier: 3,
    desc: 'Brook × Rainbow. A maze of golden tiger stripes. Rare and fierce.',
    price: 0, meal: 2.5, value: 3, breed: 0.85, growth: 0.9, speed: 1.2, size: 1.25, unlock: 'hybrid', parents: ['brook', 'rainbow'],
    look: 'Trout body covered in a dense maze of dark wavy vermiculations over golden-tan sides, cream belly, orange lower fins.',
    colors: { back: 0x6a5a28, side: 0xd8a848, belly: 0xf4e0b0, fin: 0xd8804a, accent: 0x3a3018 },
  },
  {
    id: 'splake', name: 'Splake', latin: 'S. namaycush × fontinalis', tier: 3,
    desc: 'Lake Trout × Brook Trout. A real Canadian hybrid, first bred in Ontario. Tough as a snowplow.',
    price: 0, meal: 3, value: 2.8, breed: 0.8, growth: 0.9, speed: 1.1, size: 1.35, unlock: 'hybrid', parents: ['laketrout', 'brook'],
    look: 'Char body with a slightly forked tail. Dark green-grey back with pale worm marks, sides with cream spots and a few red spots, peach-orange belly, lower fins with white edges.',
    colors: { back: 0x3a4a3a, side: 0x6a7a5a, belly: 0xf0a070, fin: 0xd87a4a, accent: 0xe8e0c0 },
  },
  {
    id: 'aurora', name: 'Aurora Salmon', latin: 'Oncorhynchus borealis', tier: 3,
    desc: 'Sockeye × Rainbow. Shimmers like the northern lights. Bears weep.',
    price: 0, meal: 3, value: 5, breed: 0.7, growth: 0.85, speed: 1.25, size: 1.4, unlock: 'hybrid', parents: ['sockeye', 'rainbow'],
    look: 'Salmon body that shifts from green at the head through cyan-blue to violet at the tail, like an aurora. Tiny white star-like spots, pale mint belly, violet fins.',
    colors: { back: 0x3a2a7a, side: 0x3ac8a0, belly: 0xb8f0e0, fin: 0x9a5ad8, accent: 0xe8fff0 },
  },
  {
    id: 'sparctic', name: 'Sparctic Char', latin: 'S. fontinalis × alpinus', tier: 3,
    desc: 'Brook × Arctic Char. A real Canadian hybrid with a molten-copper belly.',
    price: 0, meal: 4, value: 4, breed: 0.65, growth: 0.8, speed: 1.15, size: 1.3, unlock: 'hybrid', parents: ['brook', 'char'],
    look: 'Char body. Dark teal-grey back with pale squiggles, bronze sides with peach spots, molten copper-orange belly, orange fins with white edges.',
    colors: { back: 0x2e3e3a, side: 0x7a6a4a, belly: 0xff7a2a, fin: 0xff6a2a, accent: 0xffc0a0 },
  },
  {
    id: 'pikeeye', name: 'Pikeye', latin: 'Esox × Sander', tier: 3,
    desc: 'Pike × Walleye. Long, spotty and its eyes glow at night. Spooky!',
    price: 0, meal: 5, value: 4.5, breed: 0.6, growth: 0.75, speed: 1.3, size: 1.6, unlock: 'hybrid', parents: ['pike', 'walleye'],
    look: 'Long pike body with walleye colouring: olive-gold with dark saddles and pale yellow spots, huge glowing pale-green eyes, white tail tip.',
    colors: { back: 0x5a6a2c, side: 0xa8a848, belly: 0xf0ecd0, fin: 0xa89040, accent: 0xd8ffb0 },
  },
  {
    id: 'tigermuskie', name: 'Tiger Muskie', latin: 'Esox masquinongy × lucius', tier: 4,
    desc: 'Muskie × Pike. Nature\'s own hybrid apex predator. The interns are terrified of it.',
    price: 0, meal: 7, value: 5, breed: 0.5, growth: 0.7, speed: 1.35, size: 1.8, unlock: 'hybrid', parents: ['muskie', 'pike'],
    look: 'Huge pike body with sharp broken tiger stripes of dark olive over bright silver-green, rounded fin tips with dark spots, cream belly.',
    colors: { back: 0x4a5a3a, side: 0xc0c8a0, belly: 0xf0eee0, fin: 0xb08a4a, accent: 0x2a3420 },
  },
  {
    id: 'mapleKoi', name: 'Maple Leaf Koi', latin: 'Cyprinus canadensis', tier: 4,
    desc: 'Aurora × Sparctic. White as fresh snow with red maple-leaf patches. Legendary.',
    price: 0, meal: 6, value: 10, breed: 0.5, growth: 0.7, speed: 1.0, size: 1.45, unlock: 'hybrid', parents: ['aurora', 'sparctic'],
    look: 'Elegant koi: pearl-white body with bold crimson patches, one patch on the back shaped like a maple leaf, long flowing white fins with a red tint, two little whiskers, gold eye.',
    colors: { back: 0xf6f2ea, side: 0xfaf8f2, belly: 0xffffff, fin: 0xf0e8e0, accent: 0xd52b1e },
  },
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

// Hybrid recipes, order-independent: "a|b" -> hybrid id
export const HYBRIDS = {};
for (const s of SPECIES) if (s.parents) {
  const [a, b] = s.parents;
  HYBRIDS[`${a}|${b}`] = s.id;
  HYBRIDS[`${b}|${a}`] = s.id;
}

export const GOLDEN_MULT = 5;

// ---------------------------------------------------------------- genes
// Rarity tiers shared by eggs, genes and the hatch ceremony.
export const RARITIES = [
  { id: 'common', name: 'Common', color: '#d8d2c0', glow: '#ffffff' },
  { id: 'uncommon', name: 'Uncommon', color: '#6cc04a', glow: '#b8ff90' },
  { id: 'rare', name: 'Rare', color: '#3c8ce0', glow: '#9ad4ff' },
  { id: 'epic', name: 'Epic', color: '#a050e0', glow: '#e0a8ff' },
  { id: 'legendary', name: 'Legendary', color: '#ffb020', glow: '#fff0a0' },
];

// Colour morphs (palette variants of every species sprite).
// `chance` = base roll per egg, `value` = coin multiplier, `stars` = rarity bump.
export const MORPHS = {
  normal: { name: 'Wild Type', chance: 1, value: 1, stars: 0 },
  albino: { name: 'Albino', chance: 0.035, value: 1.6, stars: 1, desc: 'Pale pink-white with ruby eyes.' },
  melanistic: { name: 'Melanistic', chance: 0.035, value: 1.6, stars: 1, desc: 'Smoky black with a shadowy sheen.' },
  calico: { name: 'Calico', chance: 0.025, value: 1.8, stars: 1, desc: 'Patchwork of white, orange and black, like a koi.' },
  ghost: { name: 'Ghost', chance: 0.012, value: 2.5, stars: 2, desc: 'Nearly see-through, glowing faintly blue.' },
  golden: { name: 'Golden', chance: 0.01, value: GOLDEN_MULT, stars: 2, desc: 'Solid gold shimmer. Worth five times as much.' },
  rainbow: { name: 'Prismatic', chance: 0.003, value: 8, stars: 3, desc: 'Every colour of the aurora at once. Once in a lifetime.' },
};
export const MORPH_IDS = Object.keys(MORPHS);

// Personality traits a fish can be born with (0-2 each).
export const TRAITS = {
  fertile: { name: 'Fertile', icon: 'heart', desc: 'Breeds 50% more often.', good: true },
  chonky: { name: 'Chonky', icon: 'food', desc: '+35% meal & value. A proper unit.', good: true },
  speedy: { name: 'Speedy', icon: 'bolt', desc: 'Much harder for bears to catch.', good: true },
  lucky: { name: 'Lucky', icon: 'clover', desc: 'Bears that eat it tip double.', good: true },
  sparkly: { name: 'Sparkly', icon: 'sparkle', desc: 'So pretty it adds +1 beauty to the pond.', good: true },
  hardy: { name: 'Hardy', icon: 'shield', desc: 'Grows up fast and rarely goes hungry.', good: true },
  glutton: { name: 'Glutton', icon: 'food', desc: 'Always hungry. Eats twice as much food.', good: false },
  shy: { name: 'Shy', icon: 'question', desc: 'Hides under lily pads and platforms.', good: false },
};
export const TRAIT_IDS = Object.keys(TRAITS);
