// Ducks & geese you raise at the pond. They eat bugs (and pellets that float
// by), hens lay eggs in nests, eggs either hatch into ducklings/goslings or
// get collected and sold. Geese also charge at rampaging bears.
export const BREEDS = {
  mallard: { kind: 'duck', name: 'Mallard', price: 45, eggValue: 8, unlock: 'start', desc: 'The classic green-headed pond duck. Quacks on schedule.' },
  pekin: { kind: 'duck', name: 'Pekin Duck', price: 60, eggValue: 12, unlock: 'day:3', desc: 'Big, white, and lays like a champion.' },
  wood: { kind: 'duck', name: 'Wood Duck', price: 140, eggValue: 22, unlock: 'zone_tower', desc: 'The fanciest duck in Canada. Professor Hoot approves.' },
  canada: { kind: 'goose', name: 'Canada Goose', price: 90, eggValue: 18, unlock: 'day:2', desc: 'Loud. Proud. Chases bears. Perfect.' },
  snow: { kind: 'goose', name: 'Snow Goose', price: 180, eggValue: 30, unlock: 'zone_willow', desc: 'A white goose from the far north. Grandpa Shellby\'s old friend.' },
};
export const KIND_INFO = {
  duck: { name: 'Duck', baby: 'Duckling', grow: 150, incubate: 55, layEvery: 85, speed: 0.75, swim: 0.85, nest: 'duck_nest' },
  goose: { name: 'Goose', baby: 'Gosling', grow: 190, incubate: 75, layEvery: 110, speed: 0.95, swim: 0.95, nest: 'goose_nest' },
};
export const HUNGER_TIME = 210; // seconds from full to starving
export const GOLDEN_EGG = { chance: 0.02, mult: 8 };
export const DUCK_NAMES = ['Puddles', 'Waddles', 'Quackers', 'Nugget', 'Pickle', 'Muffin', 'Bean', 'Sir Quacks', 'Daisy', 'Mochi', 'Butterscotch', 'Gerald', 'Tofu', 'Pancake', 'Ducky McDuckface', 'Biscuit'];
export const GOOSE_NAMES = ['Honk', 'Gus', 'Loose Goose', 'Maverick', 'Agatha', 'Sergeant Honk', 'Goosifer', 'Brenda', 'Chaos', 'Big Steve', 'Margaret', 'Goosebumps'];
