// [v30 tutorial] Reynard's main questline: the whole game as chapters, from
// one empty pond to a bear resort and the Deepest Zone. Pure data, run by
// src/game/Quests.js (game.quests) and shown in the notebook (src/ui/QuestLog.js).
//
// Only existing mechanics: e-Buy fish, feeding, breeding + hatching, the Carry
// tool, research, beavers + their Snack Bar, crops, the 5 PM feast, clearing
// land, neighbours, section keys, tags, the Matchmaker, Chip and Pip, staff,
// paths + resort facilities, the Deepwood Expedition and Old Longneck.
//
// CHAPTER  { id, title, sub, reward, quests: [QUEST] }
//   chapter rewards are the "something new" moments: tools and HUD pieces open
// QUEST    { id, title, icon, req?: [quest ids], steps: [STEP], reward, unlock?, cls?, point? }
//   req     quests that must be done first (chapter 1 is a straight line; later
//           chapters run 2-3 quests side by side)
//   unlock  features opened the moment the quest starts (the tool you need for it)
//   reward  { coins, wood, food: [{ id, n }], items: { type: n }, unlock: [features], text }
//   cls     a chalkboard class played when the quest starts (game.classroom.lesson)
//   guided  Reynard walks you through it (src/game/tutorial/guide.js)
// STEP     { text, done?(g) -> bool (polled), ev?, test?(data), count?, gift? }
//   a step is ticked by its event (ev + test, `count` times) or by done(g): the
//   state check makes quests resumable and lets old saves catch up. `gift` is
//   handed over the moment the step ticks (a free kit for the next step).
//   Steps tick in any order; the quest is done when all are.
// Quest and chapter ids are saved: never rename one.
const adults = (g) => (g.fish?.list || []).filter((f) => !f.dead && f.adult && !f.tank);
const alive = (g) => (g.fish?.list || []).filter((f) => !f.dead);
const has = (g, id) => (g.state.research || []).includes(id);
const built = (g, type) => (g.structures?.list || []).some((s) => s.type === type && s.built && !s.removed);
const builtAny = (g, fn) => (g.structures?.list || []).some((s) => s.built && !s.removed && s.def && fn(s));
const zonesN = (g) => (g.state.zones || []).filter((z) => z !== 'deep').length;
const extraSections = (g) => { try { return g.ensureSections().filter((b) => b !== 'lab' && b !== 'panfish').length; } catch { return 0; } };
const harvestedAny = (g) => Object.values(g.state.harvested || {}).some((n) => n > 0);
const species = (g) => new Set(alive(g).map((f) => f.sp?.id)).size;

export const CHAPTERS = [
  // ------------------------------------------------------------------ 1
  {
    id: 'c1', title: 'A Pond and a Dream', sub: 'One pond. No fish. Big plans.',
    reward: { coins: 50, unlock: ['clock', 'speed'], text: 'The clock' },
    quests: [
      {
        id: 'm_fish', title: 'First Fish', icon: 'fish', guided: true, unlock: ['coins', 'ebuy'],
        steps: [
          { text: 'Buy a fish pair on e-Buy', ev: 'ordered', test: (o) => o?.items?.some((it) => it.kind === 'fish'), done: (g) => adults(g).length >= 2 },
          { text: 'Unbox them at the hut', done: (g) => adults(g).length >= 2 },
        ],
        reward: { coins: 10 },
        point: () => 'tool:ebuy',
      },
      {
        id: 'm_feed', title: 'Dinner Time', icon: 'food', guided: true, req: ['m_fish'], unlock: ['feed'],
        steps: [{ text: 'Feed both fish until they are full', done: (g) => { const A = adults(g); return A.length >= 2 && A.filter((f) => f.fed >= 0.9).length >= 2; } }],
        reward: { coins: 10 },
        point: () => 'tool:feed',
      },
      {
        id: 'm_hatch', title: 'Baby Boom', icon: 'egg', guided: true, req: ['m_feed'],
        steps: [
          { text: 'Let the pair lay eggs', ev: 'fishMated', done: (g) => (g.stats?.hatched || 0) > 0 || (g.fish?.eggs || []).some((e) => !e.bought) },
          { text: 'Tap a glowing egg to hatch it', ev: 'eggHatched', done: (g) => (g.stats?.hatched || 0) > 0 },
        ],
        reward: { coins: 20, unlock: ['hand'], text: 'Carry tool' },
      },
      {
        id: 'm_carry', title: 'Gotcha!', icon: 'hand', guided: true, req: ['m_hatch'], unlock: ['hand'],
        steps: [{ text: 'Catch a fish with Carry and drop it back', ev: 'fishCarried' }],
        reward: { coins: 15 },
        point: () => 'tool:hand',
      },
      {
        id: 'm_lab', title: 'Science!', icon: 'flask', guided: true, req: ['m_carry'], unlock: ['lab'],
        steps: [
          { text: 'Start "Hire Beavers" in the Lab', ev: 'researchStart', test: (r) => (r?.id || r) === 'r_beavers', done: (g) => has(g, 'r_beavers') || !!g.isResearching?.('r_beavers') },
          { text: 'Wait for the research', done: (g) => has(g, 'r_beavers') },
        ],
        reward: { coins: 20 },
        point: () => 'tool:lab',
      },
      {
        id: 'm_lodge', title: 'Hard Hats', icon: 'beaver', guided: true, req: ['m_lab'], unlock: ['build'],
        steps: [
          { text: 'Order a Beaver Crew on e-Buy', ev: 'ordered', test: (o) => o?.items?.some((it) => it.type === 'lodge'), done: (g) => built(g, 'lodge') || (g.state.inventory?.lodge || 0) > 0 || (g.structures?.list || []).some((s) => s.type === 'lodge' && !s.removed) },
          { text: 'Place the lodge on the shore', ev: 'built', test: (s) => s?.type === 'lodge', done: (g) => (g.structures?.list || []).some((s) => s.type === 'lodge' && !s.removed) },
        ],
        reward: { coins: 30 },
        point: () => 'tool:build',
      },
    ],
  },
  // ------------------------------------------------------------------ 2
  {
    id: 'c2', title: 'Open for Business', sub: 'The bears are coming. Be ready.',
    reward: { coins: 80, unlock: ['pet'], text: 'Pet tool' },
    quests: [
      {
        id: 'm_bar', title: 'Pay the Crew', icon: 'beaverbar', cls: 'builder',
        steps: [
          { text: 'Research the Beaver Snack Bar', done: (g) => has(g, 'r_snackbar'), gift: { items: { beaverbar: 1 }, say: 'First Snack Bar is on the house.' } },
          { text: 'Place the Snack Bar', ev: 'built', test: (s) => s?.type === 'beaverbar', done: (g) => built(g, 'beaverbar') },
        ],
        reward: { coins: 30 },
        point: (g) => (has(g, 'r_snackbar') ? 'tool:build' : 'tool:lab'),
      },
      {
        id: 'm_carrot', title: 'Green Thumb', icon: 'carrot',
        steps: [
          { text: 'Research Carrot Seeds', done: (g) => has(g, 'r_carrot'), gift: { items: { carrot: 2 }, say: 'Two carrot patches. Plant them on dry land.' } },
          { text: 'Plant a carrot patch', ev: 'built', test: (s) => s?.type === 'carrot', done: (g) => built(g, 'carrot') || harvestedAny(g) },
          { text: 'Harvest it when it is ripe', ev: 'harvested', done: harvestedAny },
        ],
        reward: { coins: 30 },
        point: (g) => (has(g, 'r_carrot') ? 'tool:build' : 'tool:lab'),
      },
      {
        id: 'm_stock', title: 'Snack Time', icon: 'beaver', req: ['m_bar', 'm_carrot'],
        steps: [{ text: 'Stock the Snack Bar with food', ev: 'stocked', test: (d) => d?.s?.type === 'beaverbar' }],
        reward: { coins: 25 },
        point: () => 'tool:feed',
      },
      {
        id: 'm_feast', title: 'Dinner Rush', icon: 'bear', cls: 'customers', clsHour: 13,
        steps: [
          { text: 'Keep 4+ fish in the pond', done: (g) => alive(g).length >= 4 },
          { text: 'Serve 3 bears at the 5 PM feast', ev: 'review', count: 3, done: (g) => (g.stats?.bearsServed || 0) >= 3 },
        ],
        reward: { coins: 60, unlock: ['rating', 'reviews'], text: 'Restaurant reviews' },
      },
    ],
  },
  // ------------------------------------------------------------------ 3
  {
    id: 'c3', title: 'Room to Grow', sub: 'More land, more ponds, more money.',
    reward: { coins: 100, unlock: ['tag'], text: 'Tag tool' },
    quests: [
      {
        id: 'm_garage', title: 'Lumber Yard', icon: 'hammer',
        steps: [
          { text: 'Research the Wood Garage', done: (g) => has(g, 'r_woodgarage'), gift: { items: { woodgarage: 1 }, say: 'A Wood Garage kit. On the house. Again.' } },
          { text: 'Place the Wood Garage', ev: 'built', test: (s) => s?.type === 'woodgarage', done: (g) => built(g, 'woodgarage') },
        ],
        reward: { coins: 30 },
        point: (g) => (has(g, 'r_woodgarage') ? 'tool:build' : 'tool:lab'),
      },
      {
        id: 'm_clear', title: 'Timber!', icon: 'bang', unlock: ['clear'],
        steps: [
          { text: 'Box some trees with Destroy', ev: 'clearArea' },
          { text: 'Let the beavers chop 5 tiles', ev: 'cleared', count: 5 },
        ],
        reward: { coins: 40, wood: 3 },
        point: () => 'tool:clear',
      },
      {
        id: 'm_friend', title: 'Hello, Neighbour', icon: 'heart', req: ['m_clear'],
        steps: [{ text: 'Clear the forest up to a fog bank', ev: 'zone', done: (g) => zonesN(g) >= 1 }],
        reward: { coins: 50, unlock: ['dex'], text: 'Encyclopedia' },
        point: (g) => g.quests?.nearestFog?.(),
      },
      {
        id: 'm_section', title: 'Crack the Code', icon: 'flask', req: ['m_friend'],
        steps: [{ text: 'Decrypt a new section in the Lab', ev: 'sectionUnlock', done: (g) => extraSections(g) >= 1 }],
        reward: { coins: 60 },
        point: () => 'tool:lab',
      },
    ],
  },
  // ------------------------------------------------------------------ 4
  {
    id: 'c4', title: 'Better Fish, Bigger Bills', sub: 'Bears pay for size, colour and stars.',
    reward: { coins: 150, food: [{ id: 'clover', n: 2 }], text: '2 Lucky Clovers' },
    quests: [
      {
        id: 'm_species', title: 'New Blood', icon: 'fish', unlock: ['tag'],
        steps: [
          { text: 'Research a new fish species', done: (g) => (g.state.research || []).some((id) => /^r_(pumpkinseed|goldfish|crappie|perch|rockbass|creekchub|dace|smallmouth|bass|walleye|pike)$/.test(id)) },
          { text: 'Have 2 kinds of fish in the pond', done: (g) => species(g) >= 2 },
        ],
        reward: { coins: 50 },
        point: () => 'tool:lab',
      },
      {
        id: 'm_keeper', title: 'Keep the Best', icon: 'tag', unlock: ['tag'],
        steps: [{ text: 'Tag a 2-star fish DO NOT EAT', ev: 'fishTagged', test: (f) => (f?.g?.stars || 0) >= 2, done: (g) => alive(g).some((f) => f.tagged && (f.g?.stars || 0) >= 2) }],
        reward: { coins: 40 },
        point: () => 'tool:tag',
      },
      {
        id: 'm_cupid', title: 'Play Cupid', icon: 'heart', req: ['m_keeper'], unlock: ['match'],
        steps: [{ text: 'Arrange a date in the Matchmaker', ev: 'matchArranged' }],
        reward: { coins: 60 },
        point: () => 'tool:match',
      },
      {
        id: 'm_3star', title: 'Three Stars', icon: 'star', req: ['m_cupid'],
        steps: [{ text: 'Hatch a fish with 3+ stars', ev: 'eggHatched', test: (f) => (f?.g?.stars || 0) >= 3, done: (g) => alive(g).some((f) => (f.g?.stars || 0) >= 3) }],
        reward: { coins: 80 },
      },
    ],
  },
  // ------------------------------------------------------------------ 5
  {
    id: 'c5', title: 'Friends in the Forest', sub: 'Every neighbour opens something new.',
    reward: { coins: 200, text: 'A fat purse' },
    quests: [
      {
        id: 'm_friends3', title: 'Social Butterfly', icon: 'heart',
        steps: [{ text: 'Meet 3 neighbours', ev: 'zone', done: (g) => zonesN(g) >= 3 }],
        reward: { coins: 80 },
        point: (g) => g.quests?.nearestFog?.(),
      },
      {
        id: 'm_chip', title: 'Fine Furniture', icon: 'hammer', req: ['m_friends3'],
        steps: [{ text: 'Craft something at Chip\'s workshop', ev: 'crafted' }],
        reward: { coins: 60, wood: 4 },
      },
      {
        id: 'm_pretty', title: 'Curb Appeal', icon: 'flower',
        steps: [{ text: 'Place 5 decorations', ev: 'built', count: 5, test: (s) => ['decor', 'nature', 'garden'].includes(s?.def?.category) || !!s?.def?.beauty }],
        reward: { coins: 60 },
        point: () => 'tool:build',
      },
      {
        id: 'm_rating4', title: 'Four Stars', icon: 'star',
        steps: [{ text: 'Reach a 4.0 rating', done: (g) => (g.state.rating || 0) >= 4 }],
        reward: { coins: 80 },
      },
    ],
  },
  // ------------------------------------------------------------------ 6
  {
    id: 'c6', title: 'Hired Paws', sub: 'Let the beavers do the work.',
    reward: { coins: 300, text: 'A fatter purse' },
    quests: [
      {
        id: 'm_tent', title: 'Now Hiring', icon: 'beaver',
        steps: [
          { text: 'Research "Now Hiring"', done: (g) => has(g, 'r_st_tent') },
          { text: 'Place the Interview Tent', ev: 'built', test: (s) => s?.type === 'st_tent', done: (g) => built(g, 'st_tent') },
        ],
        reward: { coins: 60 },
        point: (g) => (has(g, 'r_st_tent') ? 'tool:build' : 'tool:lab'),
      },
      {
        id: 'm_hire', title: 'Welcome Aboard', icon: 'staff', req: ['m_tent'],
        steps: [{ text: 'Hire a beaver at the tent', ev: 'staffHired', done: (g) => (g.state.staff?.list || g.state.staff?.staff || []).length > 0 }],
        reward: { coins: 80 },
      },
      {
        id: 'm_bench', title: 'Two Benches', icon: 'flask',
        steps: [{ text: 'Research the Second Lab Bench', done: (g) => has(g, 'r_labslots') }],
        reward: { coins: 100 },
        point: () => 'tool:lab',
      },
      {
        id: 'm_facility', title: 'Upgrade by Building', icon: 'coins',
        steps: [{ text: 'Place a facility (Tip Jar, Tool Box...)', ev: 'built', test: (s) => !!s?.def?.facility, done: (g) => (g.facilityTypes?.() || []).length > 0 }],
        reward: { coins: 80 },
        point: () => 'tool:build',
      },
    ],
  },
  // ------------------------------------------------------------------ 7
  {
    id: 'c7', title: 'The Bear Resort', sub: 'Fish is dinner. A resort is a lifestyle.',
    reward: { coins: 500, text: 'Resort money' },
    quests: [
      {
        id: 'm_paths', title: 'Yellow Brick Road', icon: 'flower',
        steps: [
          { text: 'Research Bear Paths', done: (g) => has(g, 'r_rs_paths') },
          { text: 'Paint a path', ev: 'paths', done: (g) => !!g.paths?.hasPaths?.() },
        ],
        reward: { coins: 60 },
        point: () => 'tool:lab',
      },
      {
        id: 'm_resort', title: 'Guest Services', icon: 'heart', req: ['m_paths'],
        steps: [{ text: 'Build a resort facility', ev: 'built', test: (s) => !!s?.def?.visit, done: (g) => builtAny(g, (s) => !!s.def.visit) }],
        reward: { coins: 120 },
        point: () => 'tool:build',
      },
      {
        id: 'm_rating45', title: 'Five-Star Resort', icon: 'trophy', req: ['m_resort'],
        steps: [{ text: 'Reach a 4.5 rating', done: (g) => (g.state.rating || 0) >= 4.5 }],
        reward: { coins: 200 },
      },
      {
        id: 'm_rich', title: 'Fish Tycoon', icon: 'coins',
        steps: [{ text: 'Earn 5,000 coins in total', done: (g) => (g.state.totalEarned || 0) >= 5000 }],
        reward: { coins: 250 },
      },
    ],
  },
  // ------------------------------------------------------------------ 8
  {
    id: 'c8', title: 'The Deepest Zone', sub: 'Something old lives behind the falls.',
    reward: { coins: 1000, text: 'Legend status' },
    quests: [
      {
        id: 'm_xp', title: 'The Expedition', icon: 'xp_compass',
        steps: [{ text: 'Decrypt the Deepwood Expedition', ev: 'sectionUnlock', done: (g) => { try { return g.ensureSections().includes('expedition'); } catch { return false; } } }],
        reward: { coins: 100 },
        point: () => 'tool:lab',
      },
      {
        id: 'm_road', title: 'Four Barriers', icon: 'xp_bridge', req: ['m_xp'],
        steps: [
          { text: 'Rope Bridge', done: (g) => has(g, 'r_xp_bridge') },
          { text: 'Bramble Hooks', done: (g) => has(g, 'r_xp_thorns') },
          { text: 'Crosscut Saw', done: (g) => has(g, 'r_xp_saw') },
          { text: 'Climbing Ropes', done: (g) => has(g, 'r_xp_ropes') },
        ],
        reward: { coins: 200 },
        point: () => 'tool:lab',
      },
      {
        id: 'm_deep', title: 'Mistfall Hollow', icon: 'map', req: ['m_road'],
        steps: [{ text: 'Clear the way to Mistfall Hollow', ev: 'zone', done: (g) => (g.state.zones || []).includes('deep') }],
        reward: { coins: 300 },
      },
    ],
  },
];

export const MAIN_QUESTS = CHAPTERS.flatMap((C, ci) => C.quests.map((q) => ({ ...q, chapter: C.id, ci })));
export const MAIN_BY_ID = Object.fromEntries(MAIN_QUESTS.map((q) => [q.id, q]));
export const CHAPTER_BY_ID = Object.fromEntries(CHAPTERS.map((C) => [C.id, C]));

// ------------------------------------------------------------------ daily goals
// Three small jobs each morning (from day 2), picked from what is open. Each one
// pays a little; all three pay a bonus. { id, text(n), need(day), ev, test?, avail(g), coins(day), feast? }
const D = (day) => Math.max(0, day - 2);
export const DAILY = [
  { id: 'd_feed', icon: 'food', text: (n) => `Feed the fish ${n} times`, need: (d) => 6 + Math.min(10, D(d)), ev: 'fed', avail: (g) => g.isOpen('feed') },
  { id: 'd_hatch', icon: 'egg', text: (n) => `Hatch ${n} egg${n > 1 ? 's' : ''}`, need: (d) => 1 + Math.min(3, Math.floor(D(d) / 2)), ev: 'eggHatched', avail: (g) => (g.fish?.list || []).filter((f) => !f.dead && f.adult).length >= 2 },
  { id: 'd_serve', icon: 'bear', text: (n) => `Serve ${n} bears tonight`, need: (d) => 3 + Math.min(12, D(d)), ev: 'review', feast: true, avail: (g) => g.state.day >= 2 },
  { id: 'd_happy', icon: 'star', text: () => 'Get a 5-star review', need: () => 1, ev: 'review', test: (r) => (r?.stars || 0) >= 5, feast: true, avail: (g) => g.state.day >= 3 },
  { id: 'd_research', icon: 'flask', text: () => 'Start a research project', need: () => 1, ev: 'researchStart', avail: (g) => g.isOpen('lab') },
  { id: 'd_harvest', icon: 'carrot', text: (n) => `Harvest ${n} crop${n > 1 ? 's' : ''}`, need: (d) => 1 + Math.min(3, Math.floor(D(d) / 3)), ev: 'harvested', avail: (g) => (g.structures?.list || []).some((s) => s.def?.crop || s.def?.category === 'crops' || s.type === 'carrot') },
  { id: 'd_build', icon: 'hammer', text: (n) => `Build ${n} thing${n > 1 ? 's' : ''}`, need: (d) => 1 + Math.min(3, Math.floor(D(d) / 3)), ev: 'built', avail: (g) => g.isOpen('build') },
  { id: 'd_clear', icon: 'bang', text: (n) => `Clear ${n} tiles of land`, need: (d) => 4 + Math.min(12, D(d) * 2), ev: 'cleared', avail: (g) => g.isOpen('clear') },
  { id: 'd_side', icon: 'berry', text: (n) => `Serve ${n} side dish${n > 1 ? 'es' : ''}`, need: (d) => 2 + Math.min(4, Math.floor(D(d) / 2)), ev: 'bearSnack', feast: true, avail: (g) => (g.structures?.list || []).some((s) => s.built && !s.removed && (s.type === 'snackbowl' || s.type === 'pantry')) },
  { id: 'd_forage', icon: 'leaf', text: (n) => `Pick up ${n} forest finds`, need: () => 3, ev: 'forage', avail: (g) => !!g.forage && (g.state.zones || []).length > 0 },
  { id: 'd_carry', icon: 'hand', text: () => 'Move a fish with Carry', need: () => 1, ev: 'fishCarried', avail: (g) => g.isOpen('hand') && g.state.day <= 6 },
  { id: 'd_wood', icon: 'hammer', text: (n) => `Stock ${n} logs`, need: (d) => 4 + Math.min(8, D(d)), ev: 'logStocked', avail: (g) => (g.structures?.list || []).some((s) => s.type === 'woodgarage' && s.built && !s.removed) },
];
export const DAILY_BY_ID = Object.fromEntries(DAILY.map((d) => [d.id, d]));
export const dailyCoins = (day) => 10 + Math.min(40, (day - 2) * 4);
export const dailyBonus = (day) => 25 + Math.min(100, (day - 2) * 10);
