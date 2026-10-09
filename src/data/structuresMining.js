// [F&S mining] Mining builds. Merged into STRUCTURES by src/data/structures.js
// (import.meta.glob, optional), in the 'industry' build tab.
// Models: src/entities/extra/miningModels.js. Behaviour: src/game/Mining.js.
export const STRUCTURES_MINING = {
  oreshed: {
    name: 'Ore Shed', icon: 'oreshed', cost: 140, place: 'land', category: 'industry', unlock: 'r_mine_pick', size: [2, 2], builder: 'beaver', buildTime: 6,
    desc: 'Beavers haul the ore sacks from the mountain veins here. Everything stocked goes into your ore stockpile.', hp: 99, smashable: false,
  },
};
