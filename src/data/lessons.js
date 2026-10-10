// [v26 tutorial] The tiny goals that end Reynard's progressive lessons
// (src/game/ext/lessons.js). They are ordinary notebook quests (pushed onto
// QUESTS by src/game/Quests.js) that never start on their own: a lesson starts
// its goal with game.quests.start(id) when it finishes. Pure data.
const never = () => false;

export const LESSON_QUESTS = [
  {
    id: 'lq_keeper', title: 'Keep the best one', icon: 'tag', reward: { coins: 30 }, when: never,
    intro: 'Tag your most valuable fish DO NOT EAT. It is worth more as a parent.',
    steps: [{ text: 'Tag a fish with 2+ stars DO NOT EAT', ev: 'fishTagged', test: (f) => (f?.g?.stars || 0) >= 2 }],
    check: (g) => g.fish.list.some((f) => !f.dead && f.tagged && f.g?.stars >= 2),
    point: () => 'tool:tag',
  },
  {
    id: 'lq_3star', title: 'Breed up', icon: 'star', reward: { coins: 60 }, when: never,
    intro: 'Breed your best with your best. Hatch a 3-star fish!',
    steps: [{ text: 'Hatch a fish with 3+ stars', ev: 'eggHatched', test: (f) => (f?.g?.stars || 0) >= 3 }],
  },
  {
    id: 'lq_luck', title: 'Lucky dinner', icon: 'clover', reward: { coins: 40, food: [{ id: 'clover', n: 1 }] }, when: never,
    intro: 'Feed a fish lucky food (Royal Pearls, a Clover, a Moonberry...) before it dates.',
    steps: [{ text: 'Feed a fish lucky food', ev: 'fed', test: (d) => ['caviar', 'clover', 'moonberry', 'golden_carrot', 'royal_jelly', 'rainbow_corn', 'goldenberry', 'maple_gem', 'elderberry'].includes(d?.id) }],
  },
  {
    id: 'lq_match', title: 'Matchmaker', icon: 'heart', reward: { coins: 50 }, when: never,
    intro: 'Pick the two best parents yourself in the Matchmaker.',
    steps: [{ text: 'Arrange a date in the Matchmaker', ev: 'matchArranged' }],
    point: () => 'tool:match',
  },
  {
    id: 'lq_rating', title: 'Five stars', icon: 'star', reward: { coins: 40 }, when: never,
    intro: 'Fill a bear up (and serve its side dish) for a 5-star review.',
    steps: [{ text: 'Get a 5-star review', ev: 'review', test: (r) => (r?.stars || 0) >= 5 }],
  },
  {
    id: 'lq_side', title: 'Side dish', icon: 'berry', reward: { coins: 30 }, when: never,
    intro: 'Bears tip for the side dish they want. Stock a Snack Bowl!',
    steps: [{ text: 'Serve a bear a side dish', ev: 'bearSnack' }],
  },
  {
    id: 'lq_section', title: 'Crack a section', icon: 'flask', reward: { coins: 50 }, when: never,
    intro: 'Use a section key: research its node, meet its neighbour, pay the coins.',
    steps: [{ text: 'Decrypt a research section', ev: 'sectionUnlock' }],
    point: () => 'tool:lab',
  },
  {
    id: 'lq_bench', title: 'Busy benches', icon: 'flask', reward: { coins: 30 }, when: never,
    intro: 'An idle bench is a lazy bench. Start a research project.',
    steps: [{ text: 'Start a research project', ev: 'researchStart' }],
    point: () => 'tool:lab',
  },
  {
    id: 'lq_feast', title: 'Event manager', icon: 'bear', reward: { coins: 40 }, when: never,
    intro: 'During the feast, tap an event icon and make a choice.',
    steps: [{ text: 'Handle a feast event', ev: 'feastResolved', test: (e) => e?.choice && e.choice !== 'expired' && e.choice !== 'missed' }],
  },
  {
    id: 'lq_warm', title: 'Warm bears pay', icon: 'heart', reward: { coins: 50 }, when: never,
    intro: 'Build something warm before the snow: a fire pit, a heater, a hot tub...',
    steps: [{ text: 'Build a warm spot', ev: 'built', test: (s) => !!s?.def?.warm }],
    check: (g) => g.structures.list.some((s) => s.built && !s.removed && s.def?.warm),
  },
  {
    id: 'lq_hire', title: 'Now hiring', icon: 'beaver', reward: { coins: 40 }, when: never,
    intro: 'Interview a candidate at the tent and hire a beaver.',
    steps: [{ text: 'Hire a beaver', ev: 'staffHired' }],
  },
  {
    id: 'lq_path', title: 'Yellow brick road', icon: 'flower', reward: { coins: 30 }, when: never,
    intro: 'Paint a path from the trail to your facilities. Bears stick to paths.',
    steps: [{ text: 'Paint a path', ev: 'paths' }],
    check: (g) => !!g.paths?.hasPaths?.(),
  },
  {
    id: 'lq_power', title: 'More power', icon: 'gear', reward: { coins: 40 }, when: never,
    intro: 'Build another power source (or a pole) so every machine gets power.',
    steps: [{ text: 'Build a power source or pole', ev: 'built', test: (s) => !!s?.def?.pw }],
  },
  {
    id: 'lq_store', title: 'Room to spare', icon: 'coins', reward: { coins: 40 }, when: never,
    intro: 'A full store stops production. Build more storage.',
    steps: [{ text: 'Build a storage building', ev: 'built', test: (s) => !!s?.def?.depot }],
  },
];
