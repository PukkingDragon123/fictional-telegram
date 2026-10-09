// [v26 world] The Deepwood Expedition: the research section that gets you to
// the Deepest Zone (Mistfall Hollow). One node per natural barrier on the way
// (world/worldgen.js BARRIERS: their `research` ids). Late: the section key
// needs Drill Helmets (Flint & Steel) and Dale's river camp, and the nodes are
// long. The zone itself (data/zones.js 'deep') requires the last node AND your
// land reaching it. Node ids are referenced by saves: never rename one.
export const BRANCHES = [
  { id: 'expedition', name: 'Deepwood Expedition', icon: 'xp_compass', color: '#5f8a5a', key: { node: 'r_mine_helmet', zone: 'river', coins: 350 } },
];

export const RESEARCH = [
  { id: 'r_xp_bridge', branch: 'expedition', name: 'Rope Bridge', icon: 'xp_bridge', time: 360, req: [], feature: 'xp_bridge', featureName: 'Bridge over the Broadwater',
    desc: 'The Broadwater is too wide to wade. Clear the forest to its north bank and the beavers string a rope bridge across.' },
  { id: 'r_xp_thorns', branch: 'expedition', name: 'Bramble Hooks', icon: 'xp_hooks', time: 480, req: ['r_xp_bridge'], feature: 'xp_thorns', featureName: 'Clear the Bramblewall',
    desc: 'Long hooked poles and very thick gloves. The beavers will finally chop through the Bramblewall on the Highland.' },
  { id: 'r_xp_saw', branch: 'expedition', name: 'Crosscut Saw', icon: 'xp_saw', time: 600, req: ['r_xp_thorns'], feature: 'xp_saw', featureName: 'Cut up the Fallen Giant',
    desc: 'A two-beaver saw as long as a canoe. Clear up to the Fallen Giant and it comes apart in an afternoon.' },
  { id: 'r_xp_ropes', branch: 'expedition', name: 'Climbing Ropes', icon: 'xp_rope', time: 780, req: ['r_xp_saw'], feature: 'xp_ropes', featureName: 'Down Heron Steps',
    desc: 'Ropes and pitons down Heron Steps, the goat path off the cliff. At the bottom: Mistfall Hollow, and whoever lives behind the falls.' },
];
