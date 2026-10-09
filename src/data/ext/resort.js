// [v26 resort] Bear Resort: facilities bears visit before / after dinner (ticket
// booth, spa, hot tub, towels, sauna, restrooms...), the "Resort" build tab and
// the "Bear Resort" research section. Pure data (merged by structures.js and
// research.js through their src/data/ext/*.js globs). Behaviour lives in
// src/game/ext/resort.js (visits) and src/game/ext/paths.js (the Path tool);
// models in src/entities/extra/resortModels.js.
//
// Facility fields (on top of the usual structure fields):
//   visit: { need, dur, pay, cap, use, joy, tip, after }
//     need   what the bear wants: 'ticket' | 'warm' | 'dry' | 'relax' | 'clean' | 'fun' | 'cool' | 'care'
//     dur    seconds of use (staff speed it up)      pay  coins per visit (0 = free)
//     cap    bears at once (the rest queue in front)  joy  happiness it gives (reviews, tips)
//     use    how it is used: 'counter' (stand at the front), 'seat' (sit on a model seat),
//            'tub' (sit in the water), 'lie' (lie on a table), 'inside' (go in, door shuts)
//     after  what the bear leaves with: 'wet' | 'dry' | 'robe' | 'towel' | 'cone' | 'hat' | 'photo' | 'steamy' | 'mallow'
//   warm: radius   a warm spot (seasons: cold bears seek these)
//   jobs: { slots, skill, title, required }   staff (game.staff); required = CLOSED without a worker
export const CATEGORIES = [{ id: 'resort', name: 'Resort', icon: 'rs_tab' }];

export const BRANCHES = [
  { id: 'resort', name: 'Bear Resort', icon: 'rs_tub', color: '#4fb8c0', key: { node: 'r_snackbar', coins: 80 } },
];

export const RESEARCH = [
  { id: 'r_rs_paths', branch: 'resort', name: 'Bear Paths', icon: 'rs_path', time: 15, req: [], feature: 'paths',
    desc: 'Paint dirt and gravel paths. Once you have paths, bears stick to them. Mostly.' },
  { id: 'r_rs_ticket', branch: 'resort', name: 'Ticket Booth', icon: 'rs_ticket', time: 30, req: ['r_rs_paths'], build: 'rs_ticket',
    desc: 'A booth at the trail head. Every bear queues up and buys an entry ticket. Needs a beaver clerk.' },
  { id: 'r_rs_comfort', branch: 'resort', name: 'Bear Necessities', icon: 'rs_restroom', time: 45, req: ['r_rs_ticket'], build: ['rs_restroom', 'rs_bench', 'rs_infoboard'],
    desc: 'Restrooms, benches and a map board. Basic dignity, for a small fee.' },
  { id: 'r_rs_paths2', branch: 'resort', name: 'Stone & Boardwalk', icon: 'rs_boardwalk', time: 50, req: ['r_rs_paths'], feature: 'paths2',
    desc: 'Stone slab paths, and plank boardwalks out over shallow water.' },
  { id: 'r_rs_gifts', branch: 'resort', name: 'Gift Shop', icon: 'rs_souvenir', time: 70, req: ['r_rs_ticket'], build: ['rs_souvenir', 'rs_photo'],
    desc: 'A souvenir stand and a photo booth. Bears pay good money for proof they had fun.' },
  { id: 'r_rs_shade', branch: 'resort', name: 'Shade & Ice Cream', icon: 'rs_icecream', time: 60, req: ['r_rs_comfort'], build: ['rs_umbrella', 'rs_icecream'],
    desc: 'Beach umbrellas and an ice cream cart. Hot bears cool off instead of boiling over.' },
  { id: 'r_rs_campfire', branch: 'resort', name: 'Campfire Pit', icon: 'rs_campfire', time: 75, req: ['r_rs_comfort'], build: 'rs_campfire',
    desc: 'Log seats round a crackling fire, marshmallows on sticks. Cold bears warm up here.' },
  { id: 'r_rs_firstaid', branch: 'resort', name: 'First-Aid Tent', icon: 'rs_firstaid', time: 90, req: ['r_rs_comfort'], build: 'rs_firstaid',
    desc: 'Hurt beavers and bruised bears recover here twice as fast. Needs a nurse.' },
  { id: 'r_rs_towels', branch: 'resort', name: 'Towel Service', icon: 'rs_towel', time: 100, req: ['r_rs_comfort'], build: ['rs_towels', 'rs_lockers'],
    desc: 'A towel room and changing huts. Wet bears dry off instead of dripping and shivering.' },
  { id: 'r_rs_hottub', branch: 'resort', name: 'Hot Tub', icon: 'rs_tub', time: 140, req: ['r_rs_towels'], build: 'rs_hottub',
    desc: 'A bubbling cedar tub for four. Bears soak, then go looking for a towel.' },
  { id: 'r_rs_sauna', branch: 'resort', name: 'Sauna', icon: 'rs_sauna', time: 160, req: ['r_rs_hottub'], build: 'rs_sauna',
    desc: 'Hot rocks, cedar benches, a LOT of steam. Cold bears love it.' },
  { id: 'r_rs_spa', branch: 'resort', name: 'Spa Room', icon: 'rs_spa', time: 200, req: ['r_rs_hottub'], build: ['rs_spa', 'rs_massagechair'],
    desc: 'Massage tables, cucumber eye masks and fluffy robes. Pricey. Worth every coin.' },
];

const base = { category: 'resort', place: 'land', smashable: true, resort: true };

export const STRUCTURES = {
  rs_ticket: {
    ...base, name: 'Ticket Booth', icon: 'rs_ticket', cost: 140, builder: 'beaver', buildTime: 6, hp: 6, beauty: 1, blocksBear: true,
    visit: { need: 'ticket', dur: 2.2, pay: 6, cap: 1, use: 'counter', joy: 0 },
    jobs: { slots: 1, skill: 'serve', title: 'Ticket Clerk', required: true },
    desc: 'Bears queue at the trail head and buy an entry ticket (6 coins each). Needs a beaver clerk.',
  },
  rs_restroom: {
    ...base, name: 'Bear Necessities', icon: 'rs_restroom', cost: 90, builder: 'beaver', buildTime: 5, hp: 5, blocksBear: true,
    visit: { need: 'clean', dur: 4, pay: 1, cap: 1, use: 'inside', joy: 0.3 },
    desc: 'A restroom with a moon on the door. After three fish, a bear has needs.',
  },
  rs_bench: {
    ...base, name: 'Park Bench', icon: 'rs_bench', cost: 40, size: [2, 1], hp: 3, comfort: 1,
    visit: { need: 'relax', dur: 6, pay: 0, cap: 2, use: 'seat', joy: 0.4 },
    desc: 'A cast-iron bench. Tired office bears sit and stare at the pond.',
  },
  rs_infoboard: {
    ...base, name: 'Info Board', icon: 'rs_infoboard', cost: 60, hp: 2, beauty: 1, facility: { mods: { patienceMult: 0.1 } },
    visit: { need: 'fun', dur: 2.5, pay: 0, cap: 2, use: 'counter', joy: 0.2 },
    desc: 'A map of the resort. Bears find their way: +10% patience, fewer "where is the path?" complaints.',
  },
  rs_umbrella: {
    ...base, name: 'Beach Umbrella', icon: 'rs_umbrella', cost: 50, hp: 2, beauty: 1, comfort: 1,
    visit: { need: 'cool', dur: 7, pay: 1, cap: 1, use: 'seat', joy: 0.5 },
    desc: 'A striped parasol over a deck chair. Hot bears cool off in the shade.',
  },
  rs_icecream: {
    ...base, name: 'Ice Cream Cart', icon: 'rs_icecream', cost: 120, hp: 3, beauty: 1,
    visit: { need: 'cool', dur: 2.5, pay: 5, cap: 2, use: 'counter', joy: 0.6, after: 'cone' },
    jobs: { slots: 1, skill: 'serve', title: 'Scooper' },
    desc: 'Three flavours, all fish-free. Hot days sell twice as many.',
  },
  rs_souvenir: {
    ...base, name: 'Souvenir Stand', icon: 'rs_souvenir', cost: 160, builder: 'beaver', buildTime: 5, hp: 4, beauty: 2, blocksBear: true,
    visit: { need: 'fun', dur: 3, pay: 8, cap: 2, use: 'counter', joy: 0.6, after: 'hat' },
    jobs: { slots: 1, skill: 'serve', title: 'Shopkeeper', required: true },
    desc: 'Foam fish hats, mugs, "I SURVIVED THE FEAST" shirts. Needs a shopkeeper.',
  },
  rs_photo: {
    ...base, name: 'Photo Booth', icon: 'rs_photo', cost: 150, builder: 'beaver', buildTime: 5, hp: 4, beauty: 1, blocksBear: true,
    visit: { need: 'fun', dur: 3.5, pay: 6, cap: 1, use: 'inside', joy: 0.7, after: 'photo' },
    desc: 'FLASH! Four goofy photos on a strip, 6 coins. Bears always buy the strip.',
  },
  rs_campfire: {
    ...base, name: 'Campfire Pit', icon: 'rs_campfire', cost: 110, size: [2, 2], hp: 4, beauty: 2, warm: 3, light: true,
    visit: { need: 'warm', dur: 8, pay: 2, cap: 4, use: 'seat', joy: 0.7, after: 'mallow' },
    desc: 'Logs round a crackling fire. Marshmallows 2 coins. Cold bears warm up here.',
  },
  rs_firstaid: {
    ...base, name: 'First-Aid Tent', icon: 'rs_firstaid', cost: 180, builder: 'beaver', buildTime: 6, size: [2, 2], hp: 4, blocksBear: true,
    visit: { need: 'care', dur: 7, pay: 0, cap: 2, use: 'lie', joy: 0.3 },
    jobs: { slots: 1, skill: 'care', title: 'Nurse' },
    desc: 'Cots and bandages. Hurt beavers and bruised bears recover here twice as fast.',
  },
  rs_towels: {
    ...base, name: 'Towel Room', icon: 'rs_towel', cost: 130, builder: 'beaver', buildTime: 6, hp: 4, blocksBear: true,
    visit: { need: 'dry', dur: 3, pay: 2, cap: 2, use: 'counter', joy: 0.5, after: 'towel' },
    jobs: { slots: 1, skill: 'serve', title: 'Towel Attendant' },
    desc: 'Stacks of fluffy towels. Wet bears dry off here instead of dripping and shivering.',
  },
  rs_lockers: {
    ...base, name: 'Changing Huts', icon: 'rs_lockers', cost: 120, builder: 'beaver', buildTime: 5, size: [2, 1], hp: 4, beauty: 1, blocksBear: true,
    visit: { need: 'dry', dur: 4, pay: 2, cap: 2, use: 'inside', joy: 0.4, after: 'dry' },
    desc: 'Two striped beach huts with lockers. Wet bears change into dry clothes.',
  },
  rs_hottub: {
    ...base, name: 'Hot Tub', icon: 'rs_tub', cost: 320, builder: 'beaver', buildTime: 9, size: [2, 2], hp: 6, beauty: 3, warm: 3, blocksBear: true,
    visit: { need: 'warm', dur: 10, pay: 8, cap: 4, use: 'tub', joy: 1.2, tip: 2, after: 'wet' },
    desc: 'A bubbling cedar tub for four. 8 coins a soak. Bears come out wet and want a towel.',
  },
  rs_sauna: {
    ...base, name: 'Sauna', icon: 'rs_sauna', cost: 360, builder: 'beaver', buildTime: 10, size: [2, 1], hp: 6, beauty: 2, warm: 4, blocksBear: true,
    visit: { need: 'warm', dur: 9, pay: 9, cap: 3, use: 'inside', joy: 1.1, tip: 2, after: 'steamy' },
    desc: 'Hot rocks, cedar benches, a LOT of steam. Cold bears come out pink and happy.',
  },
  rs_spa: {
    ...base, name: 'Spa Room', icon: 'rs_spa', cost: 480, builder: 'beaver', buildTime: 12, size: [2, 2], hp: 7, beauty: 4, warm: 3, comfort: 2, blocksBear: true,
    visit: { need: 'relax', dur: 10, pay: 16, cap: 2, use: 'lie', joy: 1.6, tip: 4, after: 'robe' },
    jobs: { slots: 2, skill: 'care', title: 'Masseur', required: true },
    desc: 'Massage tables, cucumber eye masks, fluffy robes. 16 coins a session. Needs masseurs.',
  },
  rs_massagechair: {
    ...base, name: 'Massage Chair', icon: 'rs_massage', cost: 140, hp: 3, comfort: 1,
    visit: { need: 'relax', dur: 6, pay: 4, cap: 1, use: 'seat', joy: 0.8 },
    desc: 'Coin-operated. Vrrrrrr. Office backs unknot in seconds.',
  },
};
