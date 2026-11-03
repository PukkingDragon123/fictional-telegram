// [v32 dig] Where THE DIG happens.
//
// BONEBED Bluff: a fog pocket in the east of the Old Wood (tiles x 86..104, z 129..147),
// on the south slope of a low hill where Fern Brook has cut the bank open: a
// layered bluff face with bones in it, Professor Snapp's lab hut, his field tent,
// trenches and the first dig sites. The fog lifts with the research "Survey the
// Bluff" (src/data/ext/dig.js), like Flint's quarry (noReach).
//
// SITE_ANCHORS: fossil sites around the valley, revealed one by one once Survey
// Maps is researched (src/game/dig/sites.js picks a free tile near each anchor,
// out of the fog). `bias` multiplies find weights (ids or groups, src/data/digFinds.js).
export const BONEBED = {
  cx: 95, cz: 138.2, r: 9,
  npc: { x: 95.6, z: 139.7 },
  bluff: { x: 95.2, z: 135.15 }, // the strata face (front at z ~136.3)
  hut: { x: 90.3, z: 139.9 }, // Snapp's lab hut (door on its front)
  tent: { x: 100.7, z: 139.6 },
  case: { x: 92.65, z: 140.5 }, // the glass display case by the hut
  bench: { x: 98.2, z: 140.15 }, // the sieve + prep bench
  trench: [{ x: 94.2, z: 142.2, w: 3.0, d: 1.45 }, { x: 98.9, z: 142.75, w: 2.2, d: 1.2 }],
  clear: { x0: 86, x1: 104, z0: 134, z1: 145 }, // trees cleared when the fog lifts
  view: { x: 95.2, z: 140.4 }, // camera aim for the yard
  // the three home sites (they refill: one new find every other day)
  home: [{ id: 'bb1', x: 93.4, z: 142.3 }, { id: 'bb2', x: 96.4, z: 141.4 }, { id: 'bb3', x: 99.2, z: 142.9 }],
};

export const DIG_ZONE = {
  id: 'bonebed', landmark: null, name: 'Bonebed Bluff', cx: BONEBED.cx, cz: BONEBED.cz, r: BONEBED.r,
  npc: { id: 'snapp', name: 'Prof. Snapp', title: 'Grumpy paleontologist', x: BONEBED.npc.x, z: BONEBED.npc.z, color: '#7a6a3a' },
  sub: 'Professor Snapp has been digging here since the Jurassic. Allegedly.',
  intro: ['HM?! Don\'t. Move.', 'You are standing on the Cretaceous.', '...It\'s fine. A T-rex stood there once. She was lighter.'],
  lines: ['Every rock is a book. Most are boring books.', 'Brush, don\'t bash. BRUSH.', 'Gerald, NOT NOW.', 'I\'m a hundred and forty. These bones are older. Show some respect.', 'Amber is just sap that never got over it.'],
  unlocks: [
    { kind: 'perk', title: 'Fossil digs: tap a dig site to excavate', icon: 'dig_brush' },
    { kind: 'perk', title: 'Snapp\'s lab bench: clean, sell and display finds', icon: 'dig_survey' },
    { kind: 'perk', title: 'The Dig research: amber, maps, the Primordial Vial', icon: 'dig_vial' },
  ],
  noReach: true, // only the research lifts this fog (src/game/dig/sites.js)
  hint: 'Somebody is digging holes in the Old Wood and yelling at rocks. Decrypt The Dig in the Lab and research Survey the Bluff.',
  mods: {},
  gift: { coins: 40 },
};

export const SITE_ANCHORS = [
  { id: 'ridge', name: 'Lookout Shale', x: 35, z: 33, bias: { trilobite: 2.2, crinoid: 1.6 }, tier: 0 },
  { id: 'willow', name: 'Willow Clay Bank', x: 33, z: 55, bias: { ammonite: 2, fern: 1.6 }, tier: 0 },
  { id: 'bog', name: 'Bog Amber Pit', x: 46, z: 99, bias: { amber: 3, amberbug: 2, fern: 1.5 }, tier: 1, amber: true },
  { id: 'riverbank', name: 'Daisy River Cutbank', x: 113, z: 60, bias: { sharktooth: 2.2, fishskull: 2, lobescale: 2 }, tier: 1 },
  { id: 'mushroom', name: 'Glowcap Sinkhole', x: 103, z: 107, bias: { amber: 1.8, dinoegg: 2.4, raptorclaw: 1.6 }, tier: 2 },
  { id: 'mill', name: 'Sawdust Gravel Bar', x: 70, z: 86, bias: { shell: 1.5 }, tier: 0 },
  { id: 'oldwood_w', name: 'Old Wood Tar Seep', x: 30, z: 124, bias: { mammoth: 2.6, sabrefang: 2 }, tier: 2 },
  { id: 'oldwood_e', name: 'Mossy Run Gravels', x: 74, z: 126, bias: { sabrefang: 2.4, raptorclaw: 1.6, fishskull: 1.4 }, tier: 2 },
  { id: 'quarry', name: 'Summit Sea Bed', x: 58, z: 15, bias: { trilobite: 2, crinoid: 2.4, ammonite: 1.6 }, tier: 1, zone: 'quarry' },
  { id: 'deep', name: 'Mistfall Lake Bed', x: 50, z: 210, bias: { coelacanth: 4, lobescale: 2.4, heartamber: 2 }, tier: 3, zone: 'deep' },
];

// how many sites away from the Bluff can be open at once, and how often a new one turns up
export const MAP_SITE_MAX = 3;
export const MAP_SITE_EVERY = 1; // days
