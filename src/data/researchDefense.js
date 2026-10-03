// [v18 bear events] The "Defense" research section: everything you need for
// boss days (every 5th day) and the weekly blood moon (every 7th day).
// Imported by src/data/research.js (import.meta.glob, optional). Same node
// format as research.js: id, branch, col, name, icon, time (s), req, build, desc,
// mods (additive; read by src/game/Defense.js as game.mods.<key> || 0).
// Node ids are referenced by saves: never rename one.
export const DEFENSE_BRANCH = { id: 'defense', name: 'Defense', icon: 'shield', color: '#c0303a' };

export const DEFENSE_RESEARCH = [
  { id: 'r_def_basics', branch: 'defense', col: 0, name: 'Bear Defense 101', icon: 'fence', time: 30, req: [], build: 'barricade',
    desc: 'Spiky barricades: a fence that pokes back. Boss bears every 5th day, the blood moon every 7th... get ready.' },
  { id: 'r_def_honeytrap', branch: 'defense', col: 1, name: 'Honey Traps', icon: 'honey', time: 45, req: ['r_def_basics'], build: 'honeytrap',
    desc: 'Sticky honey puddles glue hostile bears in place for a few seconds.' },
  { id: 'r_def_scarecrow', branch: 'defense', col: 1, name: 'Scarecrows', icon: 'gnome', time: 40, req: ['r_def_basics'], build: 'scarecrow',
    desc: 'Spooks rampaging customers into going home. (Blood-moon bears are not impressed.)' },
  { id: 'r_def_repair', branch: 'defense', col: 1, name: 'Quick Repairs', icon: 'hammer', time: 60, req: ['r_def_basics'], mods: { repairDiscount: 0.5 },
    desc: 'Repairs cost 50% less, and the beavers patch every defense up a little each morning.' },
  { id: 'r_def_tower', branch: 'defense', col: 2, name: 'Pinecone Watchtower', icon: 'pinecone', time: 90, req: ['r_def_honeytrap'], build: 'watchtower',
    desc: 'A beaver on a lookout lobs pinecones at hostile bears. Surprisingly accurate.' },
  { id: 'r_def_net', branch: 'defense', col: 2, name: 'Net Traps', icon: 'gate', time: 70, req: ['r_def_scarecrow'], build: 'nettrap',
    desc: 'Spring-loaded rope nets that bag a bear, then re-arm themselves.' },
  { id: 'r_def_cannon', branch: 'defense', col: 3, name: 'Sprinkler Cannon', icon: 'sprinkler', time: 140, req: ['r_def_tower'], build: 'sprinklercannon',
    desc: 'A brass water cannon: knocks bears back and soaks them so they slow down.' },
  { id: 'r_def_gate', branch: 'defense', col: 3, name: 'Bear-Proof Gate', icon: 'shield', time: 120, req: ['r_def_net'], build: 'beargate',
    desc: 'Stone and iron-banded oak. The toughest wall in the valley.' },
  { id: 'r_def_pinecones', branch: 'defense', col: 4, name: 'Sharp Pinecones', icon: 'pinecone', time: 200, req: ['r_def_cannon'], mods: { defenseDmg: 0.5 },
    desc: 'Pointier pinecones, colder water, stickier honey: all defenses deal +50% damage.' },
  { id: 'r_def_moonward', branch: 'defense', col: 4, name: 'Moon Wards', icon: 'moon', time: 240, req: ['r_def_gate'], mods: { bloodSlow: 0.25 },
    desc: 'Lavender charms on every post. Blood-moon bears move 25% slower and calm down sooner.' },
];
