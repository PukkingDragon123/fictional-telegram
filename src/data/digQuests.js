// [v32 dig] THE DIG questline (side quests, pushed onto QUESTS by src/game/Quests.js).
// The first one starts by itself (a note from Hoot); every later one is handed out
// by one of Professor Snapp's scenes when the previous one is done
// (src/game/dig/scenes.js, chained in src/game/ext/digsite.js), like the bear errands.
// Events (emitted by game.digsite): digFind { id, kind, r, cond, away, site }, labClean { id, kind },
// digDisplay { id }, vialBrewed {}, fishAncient { species, first }, bearAteAncient {}.
// Quest ids are saved: never rename one.
const has = (g, id) => (g.state.research || []).includes(id);
const done = (g) => (g.state.tutorialDone || g.skipTutorial);
const zone = (g, id) => (g.state.zones || []).includes(id);
const look = (g) => { try { g.digsite?.focusBluff?.(); } catch { /* ignore */ } return {}; };

export const DIG_QUESTS = [
  {
    id: 'dg_rumor', title: 'Bones in the Old Wood', icon: 'dig_survey', reward: { coins: 60 },
    when: (g) => done(g) && zone(g, 'tower') && g.state.day >= 4 && !zone(g, 'bonebed'),
    intro: 'A note from Professor Hoot: "Something is digging holes in the Old Wood and yelling at rocks. Big shell. Bigger temper. Decrypt The Dig and survey it?"',
    steps: [
      { text: 'Decrypt The Dig (Lab)', ev: 'sectionUnlock', test: (d) => d?.id === 'dig' },
      { text: 'Research Survey the Bluff', ev: 'research', test: (r) => r?.id === 'r_dig_survey' },
    ],
    check: (g) => has(g, 'r_dig_survey'),
    point: () => 'tool:lab',
  },
  {
    id: 'dg_grunt', title: 'Grunt Work', icon: 'dig_brush', reward: { coins: 120 },
    intro: 'Snapp handed over a brush. "Three fossils. Carefully. Then my bench."',
    steps: [
      { text: 'Dig up 3 finds at Bonebed Bluff', ev: 'digFind', count: 3 },
      { text: 'Clean a find at Snapp\'s lab bench', ev: 'labClean' },
    ],
    point: look,
  },
  {
    id: 'dg_amber', title: 'Something in the Amber', icon: 'dig_amber', reward: { coins: 180 },
    intro: '"Amber. Golden, sticky, full of secrets. Learn to see it."',
    steps: [
      { text: 'Research Amber Studies', ev: 'research', test: (r) => r?.id === 'r_dig_amber' },
      { text: 'Dig up a piece of amber', ev: 'digFind', test: (d) => d?.kind === 'amber' },
      { text: 'Clean the amber at the bench', ev: 'labClean', test: (d) => d?.kind === 'amber' },
    ],
    check: (g) => (g.state.dig?.cleanedAmber || 0) > 0 && has(g, 'r_dig_amber'),
    point: (g) => (has(g, 'r_dig_amber') ? look(g) : 'tool:lab'),
  },
  {
    id: 'dg_maps', title: 'The Old Maps', icon: 'dig_map', reward: { coins: 240 },
    intro: '"My maps. Coffee stains are contour lines. Probably. Go dig somewhere ELSE for once."',
    steps: [
      { text: 'Research Survey Maps', ev: 'research', test: (r) => r?.id === 'r_dig_maps' },
      { text: 'Dig at a site away from the Bluff', ev: 'digFind', test: (d) => !!d?.away },
      { text: 'Put 3 finds on display', ev: 'digDisplay', count: 3 },
    ],
    point: (g) => (has(g, 'r_dig_maps') ? look(g) : 'tool:lab'),
  },
  {
    id: 'dg_vial', title: 'Primordial Soup', icon: 'dig_vial', reward: { coins: 400 },
    intro: '"Fish are older than dinosaurs. Somewhere in yours, the old fish is still in there. Let\'s wake it up."',
    steps: [
      { text: 'Research the Primordial Vial', ev: 'research', test: (r) => r?.id === 'r_dig_vial' },
      { text: 'Brew a vial at the bench (1 amber + 3 fossils)', ev: 'vialBrewed' },
      { text: 'Feed it to an adult fish (tap a fish: Vial)', ev: 'fishAncient' },
    ],
    point: (g) => (has(g, 'r_dig_vial') ? look(g) : 'tool:lab'),
  },
  {
    id: 'dg_living', title: 'Living Fossils', icon: 'dig_dna', reward: { coins: 600 },
    intro: '"One is a miracle. Three is a population. Make me a population."',
    steps: [
      { text: 'Wake 3 different kinds of prehistoric fish', ev: 'fishAncient', count: 3, test: (d) => !!d?.first },
      { text: 'Let a bear eat one at the feast (they rave)', ev: 'bearAteAncient' },
    ],
  },
];
export const DIG_QUEST_BY_ID = Object.fromEntries(DIG_QUESTS.map((q) => [q.id, q]));
// which scene plays when a quest is done (it also starts the next quest)
export const DIG_CHAIN = { dg_grunt: 'snapp_amber', dg_amber: 'snapp_maps', dg_maps: 'snapp_vial', dg_vial: 'snapp_living', dg_living: 'snapp_finale' };
