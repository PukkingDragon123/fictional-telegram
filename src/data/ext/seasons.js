// [v26 seasons] Weather gear: builds for cold, wet and hot days, researched in
// the "Weather Gear" section of the lab (cheap to decrypt, ready before the
// first winter on day 22). Pure data: merged by structures.js / research.js.
//
// Def fields read by src/game/seasons/*:
//   warm: radius (tiles)      cold bears beeline here and huddle (game.seasons.warmSpots())
//   fuel: true                burns 1 wood (or coal) on each cold evening; unlit without it
//                             (an electric one: game.power.powered(s) -> no fuel needed)
//   dry: radius               bears stand under it in the rain (and in the shade in summer)
//   cool: radius              hot bears cool off here
//   greenhouse: { radius }    crops in range grow all winter and shrug off frost

export const CATEGORIES = [{ id: 'weather', name: 'Weather Gear' }];

export const STRUCTURES = {
  firepit: {
    name: 'Campfire Pit', icon: 'b_firepit', cost: 45, place: 'land', category: 'weather', unlock: 'w_firepit',
    desc: 'A ring of stones and a crackling fire. Cold bears huddle round it. Burns 1 wood on a cold evening.',
    warm: 2.6, fuel: true, light: true, beauty: 2, comfort: 1, hp: 4, smashable: true,
  },
  patioheater: {
    name: 'Patio Heater', icon: 'b_heater', cost: 90, place: 'landOrPlatform', category: 'weather', unlock: 'w_heater',
    desc: 'A tall brass mushroom of heat for the dining area. Burns 1 wood or coal on a cold evening.',
    warm: 2.4, fuel: true, light: true, beauty: 1.5, comfort: 1.5, hp: 3, smashable: true,
  },
  rainshelter: {
    name: 'Rain Shelter', icon: 'b_shelter', cost: 70, place: 'land', category: 'weather', unlock: 'w_shelter', size: [2, 2],
    desc: 'A red tin roof on four posts. Wet bears duck under it, shady bears nap under it.',
    dry: 1.7, shade: true, beauty: 1, comfort: 1, hp: 5, smashable: true,
  },
  mistfan: {
    name: 'Misting Fan', icon: 'b_mistfan', cost: 80, place: 'landOrPlatform', category: 'weather', unlock: 'w_mistfan',
    desc: 'A big fan that sprays a fine, cool mist. Hot bears stand in front of it and sigh.',
    cool: 2.4, beauty: 1, comfort: 1, hp: 3, smashable: true,
  },
  greenhouse: {
    name: 'Greenhouse', icon: 'b_greenhouse', cost: 160, place: 'land', category: 'weather', unlock: 'w_greenhouse', size: [2, 2],
    desc: 'Glass walls and a little stove. Crops within 2 tiles keep growing in winter and laugh at frost.',
    greenhouse: { radius: 2.6 }, beauty: 2, hp: 99, smashable: false, blocksBear: true,
  },
};

export const BRANCHES = [
  { id: 'weather', name: 'Weather Gear', icon: 'wx_storm', color: '#7cc2ee', key: { coins: 30 } },
];

export const RESEARCH = [
  { id: 'w_shelter', branch: 'weather', name: 'Rain Shelter', icon: 'b_shelter', time: 20, req: [], build: 'rainshelter', desc: 'A tin roof on posts. Bears stay dry in the rain and shady in a heat wave.' },
  { id: 'w_firepit', branch: 'weather', name: 'Campfire Pit', icon: 'b_firepit', time: 25, req: [], build: 'firepit', desc: 'Stones, logs, fire. Cold bears huddle round it instead of leaving. Burns wood.' },
  { id: 'w_heater', branch: 'weather', name: 'Patio Heater', icon: 'b_heater', time: 40, req: ['w_firepit'], build: 'patioheater', desc: 'A brass heater for the tables. Burns wood or coal on cold evenings.' },
  { id: 'w_radio', branch: 'weather', name: 'Weather Radio', icon: 'wx_radio', time: 30, req: ['w_shelter'], feature: 'forecast3', desc: 'Crackly forecasts from the fire tower: see 3 days ahead on the clock.' },
  { id: 'w_mistfan', branch: 'weather', name: 'Misting Fan', icon: 'b_mistfan', time: 45, req: ['w_shelter'], build: 'mistfan', desc: 'A fan that sprays cool mist. Heat-wave bears queue up for it.' },
  { id: 'w_greenhouse', branch: 'weather', name: 'Greenhouse', icon: 'b_greenhouse', time: 90, req: ['w_heater'], build: 'greenhouse', desc: 'Crops nearby grow all winter. Frost? Never heard of her.' },
];
