// [v32 dive] The Loon Lake research section: the trail to the lake, the underwater
// fish farms (built in the dive scene, src/game/dive/farms.js), the brass helmet and
// Noodles' Big Noodle catch. Merged by data/research.js (ext/*.js). The structures are
// not grid structures (they live underwater), so the nodes carry `feature` tags.
// Node ids are referenced by saves: never rename one.
export const BRANCHES = [
  { id: 'dive', name: 'Loon Lake & Diving', icon: 'dv_lake', color: '#3c8ccf', key: { coins: 60 } },
];

export const RESEARCH = [
  { id: 'r_dv_trail', branch: 'dive', name: 'Lake Trail', icon: 'dv_lake', time: 45, req: [], feature: 'dv_trail', featureName: 'The way to Loon Lake',
    desc: 'Blaze a deer path south through the Old Wood to Loon Lake, where the river meets the Broadwater. Somebody there catches fish with his bare paws.' },
  { id: 'r_dv_bignoodle', branch: 'dive', name: 'The Big Noodle', icon: 'dv_whiskers', time: 200, req: ['r_dv_trail'], zone: 'lake', feature: 'dv_bignoodle', featureName: 'Noodles\' Big Noodle catch',
    desc: 'Noodles goes down into the Deep Hole for the monsters: muskie, sturgeon, giant catfish. Maybe even Old Whiskers.' },
  { id: 'r_dv_pen', branch: 'dive', name: 'Net Pens', icon: 'dv_pen', time: 90, req: ['r_dv_trail'], zone: 'diveschool', feature: 'dv_pen', featureName: 'Net Pen (underwater)',
    desc: 'Cedar posts, rope netting and cork floats on the lake bed. Stock fingerlings, harvest grown fish for your pond or the market.' },
  { id: 'r_dv_nursery', branch: 'dive', name: 'Kelp Nursery', icon: 'dv_kelp', time: 120, req: ['r_dv_pen'], feature: 'dv_nursery', featureName: 'Kelp Nursery (underwater)',
    desc: 'Kelp grown on ropes. Little fish hide in it and grow up calm: pens nearby grow 35% faster.' },
  { id: 'r_dv_mussels', branch: 'dive', name: 'Mussel Beds', icon: 'dv_mussel', time: 150, req: ['r_dv_pen'], feature: 'dv_mussels', featureName: 'Mussel Bed (underwater)',
    desc: 'Freshwater mussels clean the water around your pens and, once in a while, grow a pearl worth good coin.' },
  { id: 'r_dv_feeder', branch: 'dive', name: 'Bubble Feeder', icon: 'dv_feeder', time: 180, req: ['r_dv_nursery'], feature: 'dv_feeder', featureName: 'Bubble Feeder (underwater)',
    desc: 'A brass diving bell that puffs air and fish food on a timer. Pens nearby grow 50% faster.' },
  { id: 'r_dv_helmet', branch: 'dive', name: 'Brass Diving Helmet', icon: 'dv_helmet', time: 240, req: ['r_dv_pen'], zone: 'diveschool', feature: 'dv_helmet', featureName: 'Long dives + the Deep Hole',
    desc: 'Chief Buff\'s old Navy pattern: twelve bolts, three portholes. Over three times the air, and you can go down into the Deep Hole.' },
  { id: 'r_dv_cage', branch: 'dive', name: 'Predator Cage', icon: 'dv_cage', time: 300, req: ['r_dv_feeder', 'r_dv_helmet'], feature: 'dv_cage', featureName: 'Predator Cage (underwater)',
    desc: 'An iron-banded cage for walleye, pike, lake trout and muskie. Slow to grow, worth a fortune.' },
  { id: 'r_dv_tanks', branch: 'dive', name: 'Twin Air Tanks', icon: 'dv_tanks', time: 220, req: ['r_dv_helmet'], feature: 'dv_tanks', featureName: 'Very long dives',
    desc: 'Two steel tanks and a regulator. Twice the time down there, and a little faster too.' },
  { id: 'r_dv_hatchery', branch: 'dive', name: 'Sunken-Ship Hatchery', icon: 'dv_wreck', time: 420, req: ['r_dv_cage'], feature: 'dv_hatchery', featureName: 'Restore the barge as a hatchery',
    desc: 'Patch up the old barge in the Deep Hole. Dark, still water: rare fish lay their eggs there, and you get one every cycle.' },
];
