// [F&S mining] Flint's Quarry: the fog pocket up on the north mountain where
// Flint the badger prospector lives. Pushed onto ZONES by src/data/zones.js.
// Its fog lifts when you clear up to it, or when the Mountain Survey research
// finishes (src/game/Mining.js). Layout: src/world/quarry.js.
import { QUARRY } from '../world/quarry.js';

export const QUARRY_ZONE = {
  id: 'quarry', landmark: null, name: 'Flint\'s Quarry', cx: QUARRY.cx, cz: QUARRY.cz, r: QUARRY.r,
  npc: { id: 'flint', name: 'Flint', title: 'Prospector & rock licker', x: QUARRY.flint.x, z: QUARRY.flint.z, color: '#7a7a8a' },
  sub: 'Flint the badger has dug this mountain for forty years',
  intro: ['Hrmph. Visitors. Mind the dynamite.', 'Name\'s Flint. I dig. Been diggin\' since the rocks were soft.', 'This mountain\'s full of ore. Want some? Then work for it.'],
  lines: ['Every rock has a story. Most are boring.', 'Lick it. That\'s how you know it\'s copper.', 'Gold\'s up high. Coal\'s down low. Life\'s in the middle.', 'My dynamite is gentle. Mostly.'],
  unlocks: [
    { kind: 'perk', title: 'Flint & Steel research (Lab)', icon: 'pickaxe' },
    { kind: 'perk', title: 'Ore veins all over the mountain', icon: 'res_gold' },
    { kind: 'perk', title: 'The Bear Mine site', icon: 'mine' },
  ],
  noReach: true, // the fog only lifts with the Mountain Survey research (Mining.js)
  hint: 'Someone digs up there... Research the Mountain Survey in the Lab to find out who.',
  mods: {},
  gift: { coins: 45, wood: 2 },
};
