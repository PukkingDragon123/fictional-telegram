// [v18 bear events] Defense builds: what keeps the pond standing through BOSS
// days (every 5th day) and the weekly BLOOD MOON (every 7th day).
// Merged into STRUCTURES by src/data/structures.js (import.meta.glob, optional).
// Models: src/entities/extra/defenseModels.js. Behaviour: src/game/Defense.js.
// Research: src/data/researchDefense.js (`unlock` = node id).
//
// `defense` (read by Defense.js):
//   kind 'wall'   blocks bears (blocksBear); thorns = damage dealt back to whoever smashes it
//   kind 'trap'   bears walking over it get stuck `stick` s (bosses x0.4); honey has
//                 `charges` (refilled by a repair), the net re-arms after `rearm` s
//   kind 'scare'  rampaging customers within `radius` turn tail (not blood-moon bears / bosses)
//   kind 'tower'  a beaver throws pinecones: `dmg` every `every` s at range `range`
//   kind 'cannon' water blast: `dmg`, knockback `push` tiles, slows by `slow` for `slowT` s
// Hostile bears = blood-moon bears, bosses, and rampaging customers (towers / cannons
// shoo those home after a few hits). Defenses have hp and are repaired by tapping
// them (or "Repair all" under the clock); cost = 40% of the build price x damage.
export const DEFENSE_CATEGORY = { id: 'defense', name: 'Defense' };

export const STRUCTURES_DEFENSE = {
  barricade: {
    name: 'Spiky Barricade', icon: 'fence', cost: 30, place: 'land', category: 'defense', unlock: 'r_def_basics', builder: 'beaver', buildTime: 3, drag: true,
    desc: 'Sharpened logs. Blocks bears like a fence, and whoever smashes it gets poked (thorns).',
    blocksBear: true, hp: 14, smashable: true, defense: { kind: 'wall', thorns: 3 },
  },
  honeytrap: {
    name: 'Honey Trap', icon: 'honey', cost: 45, place: 'land', category: 'defense', unlock: 'r_def_honeytrap',
    desc: 'A sticky honey puddle. Hostile bears that step in are glued for 4 s (bosses 1.6 s). 3 servings: repair to refill.',
    hp: 6, smashable: true, defense: { kind: 'trap', trap: 'honey', stick: 4, charges: 3, dmg: 1 },
  },
  scarecrow: {
    name: 'Scarecrow', icon: 'gnome', cost: 40, place: 'land', category: 'defense', unlock: 'r_def_scarecrow',
    desc: 'BOO! Rampaging customers within 3 tiles get spooked and go home. Blood-moon bears and bosses just laugh.',
    hp: 6, smashable: true, beauty: 1, defense: { kind: 'scare', radius: 3.2 },
  },
  nettrap: {
    name: 'Net Trap', icon: 'gate', cost: 60, place: 'land', category: 'defense', unlock: 'r_def_net',
    desc: 'A spring-loaded rope net. Bags a hostile bear for 6 s (bosses 2.4 s), then re-arms itself after 25 s.',
    hp: 5, smashable: true, defense: { kind: 'trap', trap: 'net', stick: 6, rearm: 25, dmg: 2 },
  },
  watchtower: {
    name: 'Pinecone Watchtower', icon: 'pinecone', cost: 140, place: 'land', category: 'defense', unlock: 'r_def_tower', builder: 'beaver', buildTime: 8,
    desc: 'A lookout with a beaver on top lobbing pinecones at hostile bears within 6 tiles. BONK.',
    hp: 12, smashable: true, defense: { kind: 'tower', range: 6.5, every: 1.5, dmg: 1.5 },
  },
  sprinklercannon: {
    name: 'Sprinkler Cannon', icon: 'sprinkler', cost: 180, place: 'land', category: 'defense', unlock: 'r_def_cannon', builder: 'beaver', buildTime: 7,
    desc: 'A rain barrel with a brass nozzle: blasts hostile bears back 2 tiles and soaks them (slower for 3 s).',
    hp: 10, smashable: true, defense: { kind: 'cannon', range: 4.6, every: 3.4, dmg: 1, push: 2.4, slow: 0.5, slowT: 3 },
  },
  beargate: {
    name: 'Bear-Proof Gate', icon: 'shield', cost: 70, place: 'land', category: 'defense', unlock: 'r_def_gate', builder: 'beaver', buildTime: 5, drag: true,
    desc: 'Stone pillars and iron-banded oak. A wall that takes a LOT of smashing (32 hp).',
    blocksBear: true, hp: 32, smashable: true, defense: { kind: 'wall', thorns: 0 },
  },
};
