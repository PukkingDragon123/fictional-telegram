// [v32 dive] THE DIVE: Loon Lake, Noodles the otter, Chief Buff the diving duck,
// the underwater scene and the fish farms down there. Pure data (no three.js).
//
//   DIVE_ZONES      two fog pockets on the north shore of the Broadwater basin:
//                   'lake' (Loon Lake, Noodles' camp) and 'diveschool' (Chief Buff's
//                   dive school at the end of the shore). Both open by story, not by
//                   clearing (noReach): the Lake Trail research opens Loon Lake, Noodles'
//                   first catch brings the Chief.
//   DIVE_CAST       villager cast entries (rig class, voice, idle specials)
//   DIVE_DIALOGUE   chat card topics (merged into npcDialogue.js DIALOGUE)
//   CATCHES         Noodles' fishing service tiers
//   FARMS           the underwater farm structures
//   GEAR            dive gear (snorkel, flippers, helmet, tanks)
//   DIVE_QUESTS     the questline (side quests, started by the story in game/ext/dive.js)
// Ids are saved: never rename one.

const has = (g, id) => (g.state.research || []).includes(id);
const D = (g) => g.state.dive || {};

// ---------------------------------------------------------------- the lake on the map
// Loon Lake: the wide basin where the Daisy River pours into the Broadwater (tiles
// x 81-103, z 149-165). The camp sits on the north-west shore, the dive school on the
// little point to the east. Tile coordinates.
export const LAKE = {
  cx: 85.5, cz: 154.5, r: 8,
  noodles: { x: 81.6, z: 154.4 }, // on the shore, the water starts a tile to the south / east
  buff: { x: 89.6, z: 152.6 }, // on the point, his dock runs south into the basin
  dock: { x: 89.6, z: 153.9, len: 4.2 }, // dock root (on the bank) and length (tiles, +z)
  buoy: { x: 91.2, z: 159.4 }, // the dive flag buoy off the end of the dock
  view: { x: 86.5, z: 157.5 }, // a good camera spot for the whole lake
};

export const DIVE_ZONES = [
  {
    id: 'lake', landmark: null, name: 'Loon Lake', cx: LAKE.cx, cz: LAKE.cz, r: LAKE.r, noReach: true,
    npc: { id: 'noodles', name: 'Noodles', title: 'Catfish noodler & lake legend', x: LAKE.noodles.x, z: LAKE.noodles.z, color: '#6e4a2e' },
    sub: 'Noodles the otter catches fish with his bare paws',
    intro: ['Well, well. A fox in a top hat. Don\'t see that every day.', 'Name\'s Noodles. I catch fish. With my arm.', 'Need fish? I got a lake full of \'em, slick.'],
    lines: ['Catfish hide in holes. I put my arm in the hole. Simple.', 'Old Whiskers is down there somewhere. Bigger than a canoe.', 'Loons call at dawn. Best alarm clock there is.', 'Mm-hm. Water\'s just right today.'],
    unlocks: [
      { kind: 'perk', title: 'Noodles\' catch: wild fish for your pond', icon: 'dv_catch' },
      { kind: 'perk', title: 'Loon Lake research (Lab)', icon: 'dv_lake' },
    ],
    hint: 'Somebody is fishing way down south, where the river meets the Broadwater. Research the Lake Trail in the Lab.',
    mods: {},
    gift: { coins: 35, egg: true, eggPool: ['perch', 'walleye', 'catfish', 'bullhead', 'whitefish'] },
  },
  {
    id: 'diveschool', landmark: null, name: 'Chief Buff\'s Dive School', cx: LAKE.buff.x + 0.4, cz: LAKE.buff.z + 0.6, r: 2.6, noReach: true,
    npc: { id: 'buff', name: 'Chief Buff', title: 'Retired Navy diver & instructor', x: LAKE.buff.x, z: LAKE.buff.z, color: '#2a3a6a' },
    sub: 'Chief Buff teaches diving. Loudly.',
    intro: ['ATTEN-SHUN!', 'Chief Petty Officer Buffington Bufflehead, retired. You may call me Chief.', 'You want to go under, recruit? You go under MY way.'],
    lines: ['Bubbles up, chin down!', 'A clean diver is a living diver. Rinse your mask!', 'I did twenty years under the ice, recruit. This lake is a bathtub.', 'Buddy check! ...Fine, I\'m your buddy.'],
    unlocks: [
      { kind: 'perk', title: 'Dive lessons: snorkel, flippers, the brass helmet', icon: 'dv_mask' },
      { kind: 'perk', title: 'Underwater fish farms', icon: 'dv_pen' },
    ],
    hint: 'A shack on the point, with a dive flag out front. Nobody is home... yet.',
    mods: {},
    gift: { coins: 30 },
  },
];

export const DIVE_CAST = {
  noodles: { cls: 'NoodlesOtter', voice: 'otter', specials: ['noodle', 'tall_tale', 'toothpick', 'stretch_arms'], height: 1.5, sign: 'BAIT' },
  buff: { cls: 'ChiefBuff', voice: 'duck', specials: ['whistle', 'pushups', 'clipboard', 'salute'], height: 1.45, sign: 'DIVE' },
};

// ---------------------------------------------------------------- dialogue (chat cards)
export const DIVE_DIALOGUE = {
  noodles: {
    topics: {
      about: {
        label: 'About you',
        lines: ['Forty summers on this lake, slick. Never owned a rod.', 'Rods are for folks who like waiting. I like reaching.'],
        choices: [
          { t: 'You catch fish with your ARM?', r: ['Mm-hm. Catfish live in holes. You reach in, they bite, you pull.', 'The fish does most of the work, really.'], f: 1, anim: 'noodle' },
          { t: 'What happened to your other arm?', r: ['Bandage? Old Whiskers. We had a disagreement.', 'He won. I got a story. Fair trade.'], unlock: 'whiskers', mood: 'smug' },
          { t: 'Why "Noodles"?', r: ['Noodling. That\'s the sport, slick. Hand fishing.', 'My real name is Wendell. Nobody calls me Wendell.'], anim: 'laugh' },
        ],
      },
      home: {
        label: 'Loon Lake',
        lines: ['Loon Lake. River comes in hot and fast, spreads out and slows down.', 'Slow water, big fish. Big fish, happy otter.'],
        choices: [
          { t: 'Where are the loons?', r: ['Out on the water. Listen at sunrise. Spooky, pretty, both.'], f: 1 },
          { t: 'Is it deep?', r: ['Deep hole on the east side. Deep enough nobody\'s seen the bottom.', 'Except Chief. Chief\'s seen everything. Ask him.'], mood: 'think' },
        ],
      },
      tips: {
        label: 'Tips',
        lines: ['Hire me in the morning, I\'ll send the catch up with the moose.', 'Bucket is cheap. Creel gets you walleye. The Big Noodle gets you... the big ones.', 'Wild fish mix good blood into your pond. Breeders love \'em.'],
      },
      gossip: {
        label: 'Gossip',
        lines: ['Chief makes me do a buddy check before I go swimming.', 'I\'ve been swimming since I was two days old.'],
        choices: [
          { t: 'He just cares about you.', r: ['...Yeah. Don\'t tell him I said that. Here, found these in a catfish.'], coins: 15, f: 1 },
          { t: 'Does he check your teeth too?', r: ['Once. With a flashlight.'], anim: 'laugh' },
        ],
      },
      whiskers: {
        label: 'Old Whiskers', hidden: true,
        lines: ['Biggest channel cat in Canada. Gold as a coin, old as the lake.', 'Lives in the Deep Hole. Took a bite of me in \'09.'],
        choices: [
          { t: 'Can we catch him?', r: ['Catch him? Slick. You don\'t catch Old Whiskers.', '...You BORROW him. If he lets you.'], f: 1, anim: 'tall_tale' },
          { t: 'Gold? Like, worth money?', r: ['Ha! You and every bear on the mountain.', 'Here, for the dreaming.'], coins: 20, mood: 'smug' },
        ],
      },
    },
    daily: [
      'Perch are thick by the weeds. Good day for a bucket.',
      'Something big bumped my leg at dawn. Something BIG.',
      'Loons are fighting over a cisco. Loudest breakfast on the lake.',
      'Lost my toothpick. Found a better toothpick. Life goes on.',
      'Water\'s cold. Fish are lazy. So am I.',
      'Chief did push-ups on the dock at five a.m. Again.',
      'Caught a catfish wearing a hat. Long story. Let it go.',
    ],
    ms: {
      3: { lines: ['Slick! Saved you something from the deep hole.', 'Shiny coins. Fish swallow the strangest things.'], gift: { coins: 40 } },
      6: { lines: ['You\'re alright, for a land fox.', 'Here. My second-best toothpick. And some coins.'], gift: { coins: 80 } },
      10: { lines: ['Lake crew, slick. Lifetime. Even Chief says so.', 'Tackle box of coins. Don\'t ask where they\'ve been.'], gift: { coins: 150 } },
    },
    visit: { lines: ['Walked up the whole river, slick. Feet are dry. Weird feeling.', 'Your fish look tame. Want some WILD ones?'], gift: { coins: 25 } },
  },
  buff: {
    topics: {
      about: {
        label: 'About you',
        lines: ['Twenty years Navy, recruit. Salvage diver. Under the ice.', 'Now I teach. Nobody drowns on my watch. NOBODY.'],
        choices: [
          { t: 'Thank you for your service, Chief.', r: ['...At ease. That\'s... at ease, recruit.', 'Here. Diving money. Don\'t spend it on candy.'], coins: 15, f: 1, mood: 'proud' },
          { t: 'Why are you so loud?', r: ['I AM NOT LOUD. I AM CLEAR.', 'Underwater, nobody hears you. On land, EVERYBODY hears me.'], anim: 'whistle' },
          { t: 'A duck that dives?', r: ['Bufflehead, recruit. We are DIVING ducks.', 'Dabblers tip their tails up. We go DOWN.'], unlock: 'ducks', mood: 'smug' },
        ],
      },
      home: {
        label: 'The dive school',
        lines: ['One dock, one flag, one shack, one Chief.', 'Red flag with a white stripe: diver down. Respect the flag.'],
        choices: [
          { t: 'What\'s down there?', r: ['Weeds, rocks, logs, fish. And a wreck in the Deep Hole.', 'Barge went down in a storm. Good bones. Could be useful.'], f: 1 },
          { t: 'Can I go down now?', r: ['You go when I SAY you go. Gear check first.'], anim: 'clipboard' },
        ],
      },
      tips: {
        label: 'Tips',
        lines: ['Watch your AIR. When the bubbles run out, you come up. No arguments.', 'Flippers make you fast. A helmet keeps you down long.', 'Pens grow fish. Kelp and feeders grow them FASTER. Build smart.'],
      },
      gossip: {
        label: 'Gossip',
        lines: ['That otter goes swimming with no buddy check.', 'Every day. Every single day. I\'m going to get gray feathers.'],
        choices: [
          { t: 'I can be his buddy.', r: ['...Outstanding, recruit. That\'s a good recruit.'], f: 1, mood: 'proud' },
          { t: 'He seems fine.', r: ['FINE is how it starts.'], mood: 'angry' },
        ],
      },
      ducks: {
        label: 'Diving ducks', hidden: true,
        lines: ['Canvasback, scaup, goldeneye, bufflehead. The diving corps.', 'Mallards? Dabblers. Nice folks. Can\'t hold their breath for beans.'],
        choices: [
          { t: 'How long can you hold yours?', r: ['Long enough to finish this conversation underwater. Twice.', 'Here. A coin I found on the bottom.'], coins: 12, f: 1, anim: 'salute' },
          { t: 'My ducks are mallards.', r: ['...They are lovely mallards. I am sure.'], mood: 'tsk' },
        ],
      },
    },
    daily: [
      'Water temp fourteen degrees. Visibility six meters. Outstanding.',
      'Two hundred push-ups before breakfast. Then breakfast. Then two hundred more.',
      'Somebody left litter on the bottom. Not on my lake. Not today.',
      'Rinse your mask in lake water. Spit works too. Don\'t tell anyone.',
      'The otter skipped his buddy check again.',
      'Saw the old catfish at dawn. Gold as a sunrise. Big as a canoe.',
      'Fair winds, recruit. Calm water. Good day to go down.',
    ],
    ms: {
      3: { lines: ['Recruit. You\'re shaping up.', 'A small bonus. From the dive school fund.'], gift: { coins: 40 } },
      6: { lines: ['I have trained a lot of divers, recruit.', 'You are... above average. Do not let it go to your hat.'], gift: { coins: 80 } },
      10: { lines: ['I\'m putting your name on the wall in the shack.', 'Right next to mine. Here. Pension money. Spend it wisely.'], gift: { coins: 160 } },
    },
    visit: { lines: ['Morning inspection, recruit! Pond looks... squared away.', 'Carry on. And take this. Morale bonus.'], gift: { coins: 25 } },
  },
};
export const DIVE_BICKER = [
  { a: 'noodles', b: 'buff', lines: [
    { by: 'b', t: 'Otter! You went swimming at dawn. No buddy check!' },
    { by: 'a', t: 'Chief. I live in the lake. The lake is my house.', anim: 'toothpick' },
    { by: 'b', t: 'Then your HOUSE needs a buddy check!', anim: 'whistle' },
    { by: 'a', t: '...Fine. Buddy check. You see me? I see you. Done.', anim: 'laugh' },
  ], fox: 'They are going to be like this forever, aren\'t they.' },
  { a: 'otis', b: 'noodles', lines: [
    { by: 'a', t: 'Cousin! Still sticking your arm in holes?', anim: 'hold_fish' },
    { by: 'b', t: 'Still waving a stick at the water, Otis?', anim: 'noodle' },
    { by: 'a', t: 'A ROD. It\'s called a rod.' },
    { by: 'b', t: 'Mm-hm. My arm is called "dinner".', anim: 'tall_tale' },
  ], fox: 'Two otters. One argument. Zero fish caught. Classic.' },
];

// ---------------------------------------------------------------- Noodles' catch (fishing service)
// One catch a day. The catch goes up the river by Moose Express (a parcel at the hut).
//   pool: [species, weight]; n: fish in the catch; luck: gene roll luck (morphs, size)
export const CATCHES = [
  {
    id: 'bucket', name: 'Bucket o\' Bites', icon: 'dv_bucket', price: 35, n: 3, luck: 1.1,
    desc: '3 lake fish: perch, crappie, bullhead and friends.',
    pool: [['perch', 5], ['crappie', 4], ['rockbass', 3], ['pumpkinseed', 3], ['bullhead', 3], ['cisco', 2], ['whitefish', 2]],
  },
  {
    id: 'creel', name: 'Full Creel', icon: 'dv_catch', price: 95, n: 4, luck: 1.6,
    desc: '4 bigger fish: walleye, bass, catfish, lake trout...',
    pool: [['walleye', 4], ['smallmouth', 3], ['catfish', 3], ['laketrout', 2], ['whitefish', 2], ['burbot', 2], ['drum', 2], ['goldeye', 1], ['pike', 1]],
  },
  {
    id: 'noodle', name: 'The Big Noodle', icon: 'dv_whiskers', price: 240, n: 2, luck: 2.6, research: 'r_dv_bignoodle',
    desc: '2 monsters from the Deep Hole. Muskie, sturgeon, big cats... and maybe Old Whiskers.',
    pool: [['catfish', 4], ['muskie', 2], ['pike', 3], ['bowfin', 2], ['sturgeon', 1], ['laketrout', 2]],
    whiskers: 0.08, // chance of Old Whiskers (a golden XL channel catfish)
  },
];
export const CATCH_BY_ID = Object.fromEntries(CATCHES.map((c) => [c.id, c]));

// ---------------------------------------------------------------- dive gear
//   air: seconds of air down there; speed: swim speed multiplier; deep: may enter the Deep Hole
export const GEAR = {
  snorkel: { name: 'Snorkel Mask', icon: 'dv_mask', air: 40, speed: 1, deep: false, desc: 'A rubber mask and a bent tube. Short dives in the shallows.' },
  flippers: { name: 'Flippers', icon: 'dv_flippers', air: 40, speed: 1.6, deep: false, desc: 'Big yellow fins. Kick, recruit, kick!' },
  helmet: { name: 'Brass Diving Helmet', icon: 'dv_helmet', air: 130, speed: 1.6, deep: true, research: 'r_dv_helmet', desc: 'Twelve bolts of Navy brass and a porthole. Long dives, all the way down to the Deep Hole.' },
  tanks: { name: 'Twin Air Tanks', icon: 'dv_tanks', air: 260, speed: 1.75, deep: true, research: 'r_dv_tanks', desc: 'Two tanks on your back. Very long dives.' },
};
export const GEAR_ORDER = ['snorkel', 'flippers', 'helmet', 'tanks'];

// ---------------------------------------------------------------- underwater farms
// Built on the lake bed in the dive scene. Times are seconds of game time (a work day
// is about 180 s; the night adds NIGHT_GROW).
//   kind 'pen'   : stock it with fingerlings, they grow, harvest them (to the pond or sold)
//   kind 'boost' : speeds up every pen / cage within `radius`
//   kind 'pearl' : makes pearls (coins) on its own; also a small boost
//   kind 'eggs'  : the hatchery: a rare egg every cycle (to your egg tray)
export const NIGHT_GROW = 150;
export const FARMS = {
  pen: {
    name: 'Net Pen', icon: 'dv_pen', kind: 'pen', cost: 120, research: 'r_dv_pen', r: 1.3, cap: 6, grow: 260,
    stock: [['perch', 18], ['crappie', 16], ['cisco', 22], ['whitefish', 26], ['smallmouth', 34]],
    desc: 'Cedar posts, a rope net and cork floats. Stock it with fingerlings; they grow up safe from bears.',
  },
  nursery: {
    name: 'Kelp Nursery', icon: 'dv_kelp', kind: 'boost', cost: 90, research: 'r_dv_nursery', r: 1.1, radius: 5, boost: 0.35, beauty: 1,
    desc: 'Kelp ropes on a frame. Fish love hiding in it: pens nearby grow 35% faster.',
  },
  mussels: {
    name: 'Mussel Bed', icon: 'dv_mussel', kind: 'pearl', cost: 110, research: 'r_dv_mussels', r: 1.0, radius: 4, boost: 0.15, pearlT: 200, pearl: [18, 45],
    desc: 'Freshwater mussels filter the water (pens nearby +15%) and now and then grow a pearl.',
  },
  feeder: {
    name: 'Bubble Feeder', icon: 'dv_feeder', kind: 'boost', cost: 150, research: 'r_dv_feeder', r: 0.9, radius: 6, boost: 0.5,
    desc: 'A brass bell that puffs bubbles and food pellets. Pens nearby grow 50% faster.',
  },
  cage: {
    name: 'Predator Cage', icon: 'dv_cage', kind: 'pen', cost: 280, research: 'r_dv_cage', r: 1.3, cap: 3, grow: 420,
    stock: [['walleye', 60], ['pike', 75], ['laketrout', 70], ['muskie', 140]],
    desc: 'An iron-banded cage for the big biters: walleye, pike, muskie. Slow, but worth a fortune.',
  },
  hatchery: {
    name: 'Sunken-Ship Hatchery', icon: 'dv_wreck', kind: 'eggs', cost: 400, research: 'r_dv_hatchery', r: 2.2, fixed: true, eggT: 320,
    eggs: [['sturgeon', 1], ['muskie', 2], ['bowfin', 2], ['catfish', 3], ['laketrout', 3], ['walleye', 3]],
    desc: 'Restore the old barge in the Deep Hole: dark, still and safe. A rare egg every cycle, straight to your egg tray.',
  },
};
export const FARM_ORDER = ['pen', 'nursery', 'mussels', 'feeder', 'cage', 'hatchery'];

// ---------------------------------------------------------------- the questline
// Side quests (game.quests) started by the story (game/ext/dive.js), never by Quests.update.
// Events: diveCatch { tier }, diveCatchHome, diveGear { id }, diveEnter, diveBed, diveFind,
// diveSurface, diveHoop, diveLitter, diveBuild { type }, diveStock, diveHarvest, diveDeep,
// diveWreck, diveWhiskers (+ the game's own 'research' and 'sectionUnlock').
export const DIVE_QUESTS = [
  {
    id: 'dv_bottle', title: 'A Bottle from Loon Lake', icon: 'dv_lake', reward: { coins: 60 },
    intro: 'A note in a bottle: "Biggest catfish in Canada lives in Loon Lake. Come see. - N." Decrypt Loon Lake in the Lab.',
    steps: [
      { text: 'Decrypt the Loon Lake section (Lab)', ev: 'sectionUnlock', test: (d) => d?.id === 'dive' },
      { text: 'Research the Lake Trail', ev: 'research', test: (r) => r?.id === 'r_dv_trail' },
    ],
    check: (g) => has(g, 'r_dv_trail'),
    point: () => 'tool:lab',
  },
  {
    id: 'dv_catch', title: 'Noodles\' Catch', icon: 'dv_catch', reward: { coins: 50 },
    intro: 'Noodles catches fish with his bare paws. Hire him for a catch, then unbox it at the hut.',
    steps: [
      { text: 'Hire Noodles for a catch (tap him at Loon Lake)', ev: 'diveCatch' },
      { text: 'Unbox the catch at your hut', ev: 'diveCatchHome' },
    ],
  },
  {
    id: 'dv_lesson1', title: 'Bubbles Up, Chin Down', icon: 'dv_mask', reward: { coins: 70 },
    intro: 'Chief Buff\'s first lesson. Snorkel on, recruit. Tap the dive flag off his dock.',
    steps: [
      { text: 'Dive in at Chief\'s dock', ev: 'diveEnter' },
      { text: 'Touch the lake bed', ev: 'diveBed' },
      { text: 'Find the Chief\'s lost whistle', ev: 'diveFind' },
      { text: 'Surface before your air runs out', ev: 'diveSurface' },
    ],
  },
  {
    id: 'dv_lesson2', title: 'Kick, Recruit, Kick!', icon: 'dv_flippers', reward: { coins: 90 },
    intro: 'Flippers on. Swim the training hoops, and leave the lake cleaner than you found it.',
    steps: [
      { text: 'Swim through 3 training hoops', ev: 'diveHoop', count: 3 },
      { text: 'Pick up 3 bits of litter on the bottom', ev: 'diveLitter', count: 3 },
    ],
  },
  {
    id: 'dv_farm', title: 'Down on the Farm', icon: 'dv_pen', reward: { coins: 160 },
    intro: 'Chief\'s farm lesson: a net pen on the lake bed grows fish where no bear can reach.',
    steps: [
      { text: 'Research Net Pens (Lab)', ev: 'research', test: (r) => r?.id === 'r_dv_pen' },
      { text: 'Build a Net Pen on the lake bed', ev: 'diveBuild', test: (d) => d?.type === 'pen' },
      { text: 'Stock it with fingerlings', ev: 'diveStock' },
      { text: 'Harvest the grown fish', ev: 'diveHarvest' },
    ],
    check: (g) => (D(g).harvests || 0) > 0,
  },
  {
    id: 'dv_helmet', title: 'The Brass Hat', icon: 'dv_helmet', reward: { coins: 220 },
    intro: 'Only a proper helmet goes down to the Deep Hole. Research it, then find the old barge.',
    steps: [
      { text: 'Research the Brass Diving Helmet (Lab)', ev: 'research', test: (r) => r?.id === 'r_dv_helmet' },
      { text: 'Dive down into the Deep Hole', ev: 'diveDeep' },
      { text: 'Find the sunken barge', ev: 'diveWreck' },
    ],
  },
  {
    id: 'dv_whiskers', title: 'Old Whiskers', icon: 'dv_whiskers', reward: { coins: 260 },
    intro: 'Noodles swears the golden catfish lives in the Deep Hole. Go look. Then hire the Big Noodle.',
    steps: [
      { text: 'Spot Old Whiskers in the Deep Hole', ev: 'diveWhiskers' },
      { text: 'Research the Big Noodle (Lab)', ev: 'research', test: (r) => r?.id === 'r_dv_bignoodle' },
      { text: 'Hire Noodles for the Big Noodle', ev: 'diveCatch', test: (d) => d?.tier === 'noodle' },
    ],
  },
];
export const DIVE_QUEST_IDS = DIVE_QUESTS.map((q) => q.id);
