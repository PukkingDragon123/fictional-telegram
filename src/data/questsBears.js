// [v31 cine] Bear errands: side quests that the bears themselves bring to Reynard's door, each
// opened by a cinematic talk scene and closed by another (src/game/cine/scenes.js, run by
// src/game/cine/bearQuests.js). Pure data; Quests.js adds them to its side quests.
//
// QUEST { id, title, icon, sceneIn, sceneOut, avail(g), steps, reward, check? }
//   sceneIn / sceneOut   scene ids in src/game/cine/scenes.js (sceneIn starts the quest when it ends)
//   avail(g)        may the intro play today? (one bear errand opens per day, mornings / daytime)
//   when            left undefined: Quests.update never auto-starts these, the scenes do
// Quest ids are saved: never rename one.
const alive = (g) => (g.fish?.list || []).filter((f) => !f.dead);
const has = (g, id) => (g.state.research || []).includes(id);
const built = (g, type) => (g.structures?.list || []).some((s) => s.type === type && s.built && !s.removed);

export const BEAR_QUESTS = [
  {
    id: 'bq_intern', title: 'The Newsletter', icon: 'bear', sceneIn: 'intern_in', sceneOut: 'intern_out',
    avail: (g) => g.state.day >= 2,
    steps: [{ text: 'Serve 10 bears at the 5 PM feast', ev: 'review', count: 10 }],
    reward: { coins: 80 },
  },
  {
    id: 'bq_gym', title: 'Bulk Season', icon: 'food', sceneIn: 'gym_in', sceneOut: 'gym_out',
    avail: (g) => g.state.day >= 3 && g.isOpen('feed'),
    steps: [{ text: 'Feed the fish 25 times (gains!)', ev: 'fed', count: 25 }],
    reward: { coins: 70, food: [{ id: 'clover', n: 1 }] },
  },
  {
    id: 'bq_cub', title: 'Bring Your Cub to Work', icon: 'egg', sceneIn: 'cub_in', sceneOut: 'cub_out',
    avail: (g) => g.state.day >= 3 && alive(g).length >= 2,
    steps: [{ text: 'Hatch 3 baby fish for the cub to name', ev: 'eggHatched', count: 3 }],
    reward: { coins: 60 },
  },
  {
    id: 'bq_critic', title: 'Hard to Please', icon: 'star', sceneIn: 'critic_in', sceneOut: 'critic_out',
    avail: (g) => g.state.day >= 4,
    steps: [{ text: 'Earn a 5-star review at the feast', ev: 'review', test: (r) => (r?.stars || 0) >= 5 }],
    reward: { coins: 120 },
  },
  {
    id: 'bq_boss', title: 'Synergy Monday', icon: 'bear', sceneIn: 'boss_in', sceneOut: 'boss_out',
    avail: (g) => g.state.day >= 5,
    steps: [{ text: 'Get 6 reviews of 4 stars or more', ev: 'review', test: (r) => (r?.stars || 0) >= 4, count: 6 }],
    reward: { coins: 110 },
  },
  {
    id: 'bq_grandma', title: 'Grandma\'s Pie', icon: 'berry', sceneIn: 'grandma_in', sceneOut: 'grandma_out',
    avail: (g) => g.state.day >= 5 && (has(g, 'r_berrybush') || built(g, 'berries')),
    steps: [{ text: 'Plant a Blueberry Bush', ev: 'built', test: (s) => s?.type === 'berries' }],
    check: (g) => built(g, 'berries'),
    reward: { coins: 90, food: [{ id: 'clover', n: 1 }] },
  },
  {
    id: 'bq_ceo', title: 'The Golden Order', icon: 'coins', sceneIn: 'ceo_in', sceneOut: 'ceo_out',
    avail: (g) => g.state.day >= 6,
    steps: [{ text: 'Hatch a golden (or rainbow) fish', ev: 'eggHatched', test: (f) => f?.g?.morph === 'golden' || f?.g?.morph === 'rainbow' }],
    check: (g) => alive(g).some((f) => f.g?.morph === 'golden' || f.g?.morph === 'rainbow'),
    reward: { coins: 300 },
  },
];
export const BEAR_QUEST_BY_ID = Object.fromEntries(BEAR_QUESTS.map((q) => [q.id, q]));
