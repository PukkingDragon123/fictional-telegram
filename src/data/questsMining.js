// [F&S mining] "Flint & Steel" quests (pushed onto QUESTS by src/game/Quests.js).
// Same format as Quests.js: when(g) starts it, steps tick off from game events.
const has = (g, id) => (g.state.research || []).includes(id);
const done = (g) => (g.state.tutorialDone || g.skipTutorial);

export const MINING_QUESTS = [
  {
    id: 'fs_survey', title: 'Who digs up there?', icon: 'pickaxe', reward: { coins: 60 },
    when: (g) => done(g) && has(g, 'r_notebook') && !has(g, 'r_mine_survey'),
    intro: 'Something glitters on the mountain, and somebody keeps digging. Research the Mountain Survey!',
    steps: [{ text: 'Research the Mountain Survey (Lab)', ev: 'research', test: (r) => r?.id === 'r_mine_survey' }],
    check: (g) => has(g, 'r_mine_survey'),
    point: () => 'tool:lab',
  },
  {
    id: 'fs_flint', title: 'Flint & Steel', icon: 'pickaxe', reward: { coins: 80 },
    when: (g) => done(g) && (g.state.zones || []).includes('quarry'),
    intro: 'Flint knows every rock on the mountain. Decrypt Flint & Steel in the lab and get the beavers some pickaxes!',
    steps: [
      { text: 'Decrypt the Flint & Steel section', ev: 'sectionUnlock', test: (d) => d?.id === 'industry' },
      { text: 'Research Beaver Pickaxes', ev: 'research', test: (r) => r?.id === 'r_mine_pick' },
    ],
    check: (g) => has(g, 'r_mine_pick'),
    point: () => 'tool:lab',
  },
  {
    id: 'fs_ore', title: 'Strike it rich', icon: 'res_copper', reward: { coins: 100 },
    when: (g) => done(g) && has(g, 'r_mine_pick'),
    intro: 'Tap a glittering vein on the mountain to mark it. Beavers dig, sacks go to an Ore Shed.',
    steps: [
      { text: 'Mark an ore vein', ev: 'veinMarked', test: (d) => !!d?.on },
      { text: 'Build an Ore Shed (Build > Industry)', ev: 'built', test: (s) => s?.type === 'oreshed' },
      { text: 'Stock 5 sacks of ore', ev: 'oreStocked', count: 5 },
    ],
  },
  {
    id: 'fs_mine', title: 'The Bear Mine', icon: 'mine', reward: { coins: 150 },
    when: (g) => done(g) && has(g, 'r_mine_mine'),
    intro: 'Dig a mine in Flint\'s quarry and hire worker bears. And feed them. Seriously, feed them.',
    steps: [
      { text: 'Dig the mine (tap the quarry wall)', ev: 'mineBuilt' },
      { text: 'Hire a worker bear', ev: 'mineHired' },
      { text: 'Send a lunch run', ev: 'lunchRun' },
    ],
    check: (g) => !!g.state.mining?.mine?.built && (g.state.mining.mine.workers || []).length > 0 && (g.state.mining.mine.meals || 0) > 0,
  },
  {
    id: 'fs_machine', title: 'Heavy machinery', icon: 'drill', reward: { coins: 120 },
    when: (g) => done(g) && has(g, 'r_mine_drill') && !!g.state.mining?.mine?.built,
    intro: 'Big machines dig big holes. Build one at the Bear Mine.',
    steps: [{ text: 'Build a mine machine', ev: 'mineMachine' }],
    check: (g) => Object.keys(g.state.mining?.mine?.machines || {}).length > 0,
  },
];
