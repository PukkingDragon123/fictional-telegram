// Fish species. `meal` = how filling for a bear, `value` = coin multiplier.
// Model params drive the procedural voxel fish generator.
export const SPECIES = [
  {
    id: 'bluegill', name: 'Bluegill', latin: 'Lepomis macrochirus',
    desc: 'A plucky little sunfish. Cheap, cheerful and breeds like crazy.',
    price: 8, meal: 1, value: 1, breed: 1.25, growth: 1.2, speed: 1.0, size: 0.9, unlock: 'start',
    model: { L: 9, H: 7, W: 3, shape: 'round', back: 0x3a5f9c, side: 0x5b86c9, belly: 0xe8a34c, fin: 0x3f6aa8, eye: 0x101418,
      pattern: [{ type: 'bars', color: 0x2f4d80, count: 4, from: 0.15, to: 0.75 }, { type: 'patch', color: 0x16223a, at: 0.78, y: 0.1, r: 1 }],
      tail: 'round', dorsal: 'long', mouth: 'small', cheek: 0xf0b8c8 },
  },
  {
    id: 'perch', name: 'Yellow Perch', latin: 'Perca flavescens',
    desc: 'Golden with bold tiger stripes. A Great Lakes classic that bears adore.',
    price: 18, meal: 1.5, value: 1.25, breed: 1.1, growth: 1.1, speed: 1.05, size: 0.95, unlock: 'r_perch',
    model: { L: 11, H: 5, W: 3, shape: 'fusiform', back: 0x5e6f2a, side: 0xe0c040, belly: 0xf6e8a8, fin: 0xe8743a, eye: 0x101418,
      pattern: [{ type: 'bars', color: 0x3c4a1e, count: 6, from: 0.1, to: 0.8 }], tail: 'fork', dorsal: 'spiny', mouth: 'small' },
  },
  {
    id: 'bass', name: 'Largemouth Bass', latin: 'Micropterus salmoides',
    desc: 'Big mouth, bigger attitude. A hearty meal for a hungry suit.',
    price: 32, meal: 2, value: 1.35, breed: 0.95, growth: 1.0, speed: 1.0, size: 1.1, unlock: 'r_bass',
    model: { L: 12, H: 5, W: 4, shape: 'fusiform', back: 0x3e5e2a, side: 0x7fa04a, belly: 0xe6ecd0, fin: 0x5a7a36, eye: 0x101418,
      pattern: [{ type: 'stripe', color: 0x2a3e1c, y: 0.0, blotchy: true }], tail: 'square', dorsal: 'spiny', mouth: 'big' },
  },
  {
    id: 'brook', name: 'Brook Trout', latin: 'Salvelinus fontinalis',
    desc: 'The speckled jewel of northern streams. Red spots with blue halos!',
    price: 48, meal: 2, value: 1.6, breed: 0.9, growth: 0.95, speed: 1.15, size: 1.05, unlock: 'r_brook',
    model: { L: 12, H: 4, W: 3, shape: 'fusiform', back: 0x3f4f2e, side: 0x6a7a44, belly: 0xe86a2c, fin: 0xd8582a, finEdge: 0xffffff, eye: 0x101418,
      pattern: [{ type: 'worms', color: 0x9aa860, yMin: 0.35 }, { type: 'spots', color: 0xe6d060, density: 0.18, yMin: -0.3, yMax: 0.45, seed: 3 }, { type: 'spots', color: 0xd03030, halo: 0x5a8ad8, density: 0.08, yMin: -0.3, yMax: 0.3, seed: 9 }],
      tail: 'square', dorsal: 'short', mouth: 'small' },
  },
  {
    id: 'rainbow', name: 'Rainbow Trout', latin: 'Oncorhynchus mykiss',
    desc: 'Silver with a blushing pink stripe. Fights hard, tastes better.',
    price: 75, meal: 2.5, value: 1.8, breed: 0.85, growth: 0.9, speed: 1.2, size: 1.1, unlock: 'r_rainbow',
    model: { L: 13, H: 4, W: 3, shape: 'fusiform', back: 0x5a7a58, side: 0xc8d0cc, belly: 0xf2f4f0, fin: 0x9aa89a, eye: 0x101418,
      pattern: [{ type: 'stripe', color: 0xe07a8a, y: 0.0, width: 1 }, { type: 'spots', color: 0x2a2e2a, density: 0.2, yMin: 0.1, yMax: 1, seed: 5 }],
      tail: 'fork', dorsal: 'short', mouth: 'small' },
  },
  {
    id: 'sockeye', name: 'Sockeye Salmon', latin: 'Oncorhynchus nerka',
    desc: 'Blazing red with a green head. The pride of British Columbia.',
    price: 120, meal: 3, value: 2.2, breed: 0.75, growth: 0.85, speed: 1.25, size: 1.15, unlock: 'r_sockeye',
    model: { L: 14, H: 5, W: 3, shape: 'fusiform', back: 0xb02828, side: 0xd83a30, belly: 0xe8604a, fin: 0x5a7a3a, head: 0x4a7a3a, headFrom: 0.8, eye: 0x101418,
      pattern: [], tail: 'fork', dorsal: 'hump', mouth: 'hook' },
  },
  {
    id: 'pike', name: 'Northern Pike', latin: 'Esox lucius',
    desc: 'A long, toothy ambush predator. Bears call it "the baguette".',
    price: 180, meal: 4, value: 2.2, breed: 0.7, growth: 0.8, speed: 1.35, size: 1.2, unlock: 'r_pike',
    model: { L: 17, H: 4, W: 3, shape: 'long', back: 0x3a5a2c, side: 0x5e8440, belly: 0xe8ecc8, fin: 0x8a8a3a, eye: 0x101418,
      pattern: [{ type: 'spots', color: 0xd8dc80, density: 0.3, yMin: -0.4, yMax: 0.7, seed: 11, elongated: true }], tail: 'fork', dorsal: 'back', mouth: 'duck' },
  },
  {
    id: 'walleye', name: 'Walleye', latin: 'Sander vitreus',
    desc: 'Glassy glow-in-the-dark eyes. Canada\'s favourite fish fry.',
    price: 280, meal: 4, value: 2.6, breed: 0.65, growth: 0.8, speed: 1.1, size: 1.15, unlock: 'r_walleye',
    model: { L: 14, H: 4, W: 3, shape: 'fusiform', back: 0x6a6a30, side: 0xc4a848, belly: 0xf0ecd0, fin: 0xa89040, eye: 0xe8f0c0, eyeBig: true,
      pattern: [{ type: 'saddles', color: 0x4a4424, count: 5 }], tail: 'fork', dorsal: 'spiny', mouth: 'small', tailTip: 0xffffff },
  },
  {
    id: 'char', name: 'Arctic Char', latin: 'Salvelinus alpinus',
    desc: 'From the far north: sapphire back, sunset belly. Pure luxury.',
    price: 420, meal: 4, value: 3, breed: 0.6, growth: 0.75, speed: 1.15, size: 1.15, unlock: 'r_char',
    model: { L: 13, H: 4, W: 3, shape: 'fusiform', back: 0x2a3a5a, side: 0x5a6a8a, belly: 0xf05a30, fin: 0xe8603a, finEdge: 0xffffff, eye: 0x101418,
      pattern: [{ type: 'spots', color: 0xf0b0b8, density: 0.16, yMin: -0.2, yMax: 0.8, seed: 13 }], tail: 'fork', dorsal: 'short', mouth: 'small' },
  },
  {
    id: 'sturgeon', name: 'Lake Sturgeon', latin: 'Acipenser fulvescens',
    desc: 'A living dinosaur armoured in bony plates. One of these feeds a CEO.',
    price: 750, meal: 8, value: 3.4, breed: 0.4, growth: 0.55, speed: 0.75, size: 1.55, unlock: 'r_sturgeon',
    model: { L: 18, H: 4, W: 4, shape: 'sturgeon', back: 0x5a5a4e, side: 0x7a786a, belly: 0xd8d4c4, fin: 0x5a5a4e, eye: 0x101418,
      pattern: [{ type: 'scutes', color: 0xc4c0a8 }], tail: 'shark', dorsal: 'back', mouth: 'barbels' },
  },
  // ---- hybrids (discovered by cross-breeding)
  {
    id: 'sunperch', name: 'Sunburst Perch', latin: 'Lepomis × Perca',
    desc: 'Bluegill × Perch. Turquoise and gold, like a sunrise on Georgian Bay.',
    price: 0, meal: 1.5, value: 2, breed: 1.1, growth: 1.1, speed: 1.05, size: 0.95, unlock: 'hybrid', parents: ['bluegill', 'perch'],
    model: { L: 10, H: 6, W: 3, shape: 'round', back: 0x2a8a8a, side: 0x48c0b0, belly: 0xf6d040, fin: 0xf08a3a, eye: 0x101418,
      pattern: [{ type: 'bars', color: 0xf0a030, count: 4, from: 0.15, to: 0.75 }], tail: 'fork', dorsal: 'spiny', mouth: 'small', cheek: 0xf0b8c8 },
  },
  {
    id: 'bassgill', name: 'Bassgill', latin: 'Micropterus × Lepomis',
    desc: 'Bass × Bluegill. A chonky round boi with a big grin.',
    price: 0, meal: 2.5, value: 2, breed: 1.0, growth: 1.0, speed: 0.95, size: 1.1, unlock: 'hybrid', parents: ['bass', 'bluegill'],
    model: { L: 11, H: 7, W: 4, shape: 'round', back: 0x3a6a5a, side: 0x6aa07a, belly: 0xf0a040, fin: 0x4a7a8a, eye: 0x101418,
      pattern: [{ type: 'bars', color: 0x2a4e40, count: 3, from: 0.2, to: 0.7 }], tail: 'round', dorsal: 'long', mouth: 'big', cheek: 0xf0b8c8 },
  },
  {
    id: 'tiger', name: 'Tiger Trout', latin: 'Salvelinus × Oncorhynchus',
    desc: 'Brook × Rainbow. A maze of golden tiger stripes. Rare and fierce.',
    price: 0, meal: 2.5, value: 3, breed: 0.85, growth: 0.9, speed: 1.2, size: 1.1, unlock: 'hybrid', parents: ['brook', 'rainbow'],
    model: { L: 13, H: 4, W: 3, shape: 'fusiform', back: 0x6a5a28, side: 0xd8a848, belly: 0xf4e0b0, fin: 0xd8804a, eye: 0x101418,
      pattern: [{ type: 'worms', color: 0x3a3018, yMin: -0.5, dense: true }], tail: 'square', dorsal: 'short', mouth: 'small' },
  },
  {
    id: 'aurora', name: 'Aurora Salmon', latin: 'Oncorhynchus borealis',
    desc: 'Sockeye × Rainbow. Shimmers like the northern lights. Bears weep.',
    price: 0, meal: 3, value: 5, breed: 0.7, growth: 0.85, speed: 1.25, size: 1.15, unlock: 'hybrid', parents: ['sockeye', 'rainbow'],
    model: { L: 14, H: 5, W: 3, shape: 'fusiform', back: 0x3a2a7a, side: 0x3ac8a0, belly: 0xb8f0e0, fin: 0x9a5ad8, eye: 0x101418,
      pattern: [{ type: 'gradient', colors: [0x3ae0a0, 0x4ab0e0, 0x9a6ae8] }, { type: 'spots', color: 0xe8fff0, density: 0.08, yMin: -0.5, yMax: 1, seed: 21 }],
      tail: 'fork', dorsal: 'hump', mouth: 'small' },
  },
  {
    id: 'sparctic', name: 'Sparctic Char', latin: 'S. fontinalis × alpinus',
    desc: 'Brook × Arctic Char. A real Canadian hybrid with a molten-copper belly.',
    price: 0, meal: 4, value: 4, breed: 0.65, growth: 0.8, speed: 1.15, size: 1.15, unlock: 'hybrid', parents: ['brook', 'char'],
    model: { L: 13, H: 4, W: 3, shape: 'fusiform', back: 0x2e3e3a, side: 0x7a6a4a, belly: 0xff7a2a, fin: 0xff6a2a, finEdge: 0xffffff, eye: 0x101418,
      pattern: [{ type: 'worms', color: 0xa8b070, yMin: 0.2 }, { type: 'spots', color: 0xffc0a0, density: 0.12, yMin: -0.2, yMax: 0.6, seed: 17 }], tail: 'square', dorsal: 'short', mouth: 'small' },
  },
  {
    id: 'pikeeye', name: 'Pikeye', latin: 'Esox × Sander',
    desc: 'Pike × Walleye. Long, spotty and its eyes glow at night. Spooky!',
    price: 0, meal: 5, value: 4.5, breed: 0.6, growth: 0.75, speed: 1.3, size: 1.2, unlock: 'hybrid', parents: ['pike', 'walleye'],
    model: { L: 16, H: 4, W: 3, shape: 'long', back: 0x5a6a2c, side: 0xa8a848, belly: 0xf0ecd0, fin: 0xa89040, eye: 0xe8f0c0, eyeBig: true,
      pattern: [{ type: 'spots', color: 0xe8e090, density: 0.22, yMin: -0.3, yMax: 0.7, seed: 23, elongated: true }, { type: 'saddles', color: 0x3a4420, count: 4 }], tail: 'fork', dorsal: 'back', mouth: 'duck' },
  },
  {
    id: 'mapleKoi', name: 'Maple Leaf Koi', latin: 'Cyprinus canadensis',
    desc: 'Aurora × Sparctic. White as fresh snow with red maple-leaf patches. Legendary.',
    price: 0, meal: 6, value: 10, breed: 0.5, growth: 0.7, speed: 1.0, size: 1.25, unlock: 'hybrid', parents: ['aurora', 'sparctic'],
    model: { L: 14, H: 5, W: 4, shape: 'fusiform', back: 0xf6f2ea, side: 0xfaf8f2, belly: 0xffffff, fin: 0xf0e8e0, eye: 0x101418,
      pattern: [{ type: 'blotches', color: 0xd52b1e, seed: 31 }], tail: 'flowing', dorsal: 'long', mouth: 'barbels' },
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
