// [v26 turtle] Old Longneck, the Old Wise Long-Neck Turtle of Mistfall Hollow:
// his Long Talk (one conversation = 3 in-game days, game/ext/longneck.js),
// the lines around it, his chat-card topics (pushed onto DIALOGUE) and the
// story quests that point the way to him (pushed onto QUESTS by Quests.js).
// Pure data + one side effect: DIALOGUE.longneck. No emoji.
import { DIALOGUE } from './npcDialogue.js';

// ------------------------------------------------------------------ the Long Talk
// One paragraph per string. A lone "..." is a pause he actually says (it takes a
// word's worth of time too). Timing: game/longneck/speech.js spreads the whole
// thing over exactly LONG_TALK_DAYS in-game days.
export const LONG_TALK_DAYS = 3;
export const SPEECH = [
  'Ah. ... So. ... You came ... to hear ... the Old Ways. ... Sit, ... young fox. ... This will not take ... long.',
  'First, ... the fish. ... A fish is not made ... in a day. ... Feed them until they are full, ... and only then ... let them court. ... Breed the biggest ... with the brightest. ... Sweet food ... makes lucky eggs: ... pearls, ... clover, ... moonberries. ... Spring is for courting. ... Winter ... is for napping.',
  'Second, ... coins. ... Pour them out ... all at once ... and the pond is dry ... by Thursday. ... Keep the lab busy. ... Thinking is free. ... It only costs ... time.',
  'Third, ... the bears. ... Feed them ... before they ask. ... A hungry bear ... is a loud bear. ... A full bear ... leaves a tip ... and fewer ... teeth marks.',
  'Fourth, ... the beavers. ... They build your world ... one log at a time. ... Give them a lodge. ... Give them rest. ... A tired beaver ... falls off ladders.',
  'Fifth, ... the seasons. ... Bears get cold ... in winter. ... Build them something warm ... before the snow, ... not after. ... In autumn ... everything is hungry.',
  'And the last lesson, ... the most important ... of all. ... Listen closely, ... young fox. ... ... ... Be ... brief.',
];

// what he gives you when the last word lands
export const OLD_WAYS = {
  name: 'The Old Ways',
  desc: 'Mutations 2.5x as often, more good traits and rare colours. Forever.',
  mods: { mutationMult: 1.5, traitMult: 0.5, morphMult: 0.5 },
  coins: 400,
  eggs: ['sturgeon', 'paddlefish'], // ancient fish eggs, rolled lucky
  eggLuck: 3,
};

// ------------------------------------------------------------------ lines
export const LN = {
  // the arrival cutscene (game/longneck/scenes.js)
  arrive: {
    first: '...',
    hello: 'Ah.',
    welcome: 'Welcome... ... to... ... Mistfall... ... Hollow.',
    fox1: 'Hello? Sir? Is he... done?',
    fox2: '...He\'s not done.',
    last: 'Come... ... closer. ... I have... ... something... ... to tell you.',
    fox3: 'Great. How long could it take?',
    caption: 'Old Longneck',
    sub: 'The Old Wise Long-Neck Turtle · Mistfall Hollow',
    hint: 'Tap him to hear the Old Ways. Clear your schedule.',
  },
  // the first tap: the Long Talk begins
  begin: { npc: 'Sit.', fox: 'Okay. I\'m sitting. Go.' },
  // Reynard, impatient (taps during the talk, new mornings)
  fox: [
    'Is he... done?',
    'Sir? Is that a comma or a full stop?',
    'I have aged. Visibly.',
    'At this rate I could build a second pond.',
    'He said "the". I think. It was a long "the".',
    'Is it rude to bring a snack? I brought a snack.',
    'Somebody wake me up for the punchline.',
    'Time is money. This is a LOT of money.',
  ],
  // the audience (a napping beaver / bear), when Reynard asks
  answer: ['...He\'s not done.', 'Shh. He\'s on a good bit.', 'Zzz... not done... zzz.', '...Still not done.'],
  // the corner fox on a new morning while the talk goes on: {n} words said, {N} in total, {d} = day of the talk
  morning: [
    'Day {d} of Old Longneck\'s talk. He has said {n} words. Out of {N}.',
    'Old Longneck is still talking. Word {n} of {N}. I timed it.',
    'Morning! Old Longneck is on word {n}. He paused for an hour on "the".',
  ],
  // idle mutters when he is NOT in the middle of his talk (very slow)
  idle: ['...Hm.', '...', '...Mist.', '...Tea.', '...Yes.'],
  // after the talk (he says it all again if you ask; no, he doesn't)
  after: ['...Did you... ... listen?', '...Be brief. ... ... Yes.', '...I have... another talk. ... ... Later.'],
  // the finale (the last word just landed)
  finale: {
    fox1: '...That\'s it? THREE DAYS for "be brief"?',
    npc1: '...Yes.',
    npc2: 'Take these. ... ... The Old Ways... ... are yours.',
    fox2: 'Worth it. Barely. Okay, completely.',
    caption: 'The Old Ways',
  },
};

// ------------------------------------------------------------------ chat card (NpcDialogue)
DIALOGUE.longneck = {
  topics: {
    about: {
      label: 'About you',
      lines: ['I am... ... ... old.', '...Older than the falls. ... The falls... ... are also old.'],
      choices: [
        { t: 'How old exactly?', r: ['...I stopped counting... ... at a very large number.'], f: 1, anim: 'nod' },
        { t: 'Why do you talk so slowly?', r: ['...Why... ... ... do you... talk so fast?'], mood: 'smug' },
        { t: 'Nice spectacles.', r: ['...Reading glasses. ... ... I read one book. ... For ninety years.', '...Here. ... Bookmark money.'], coins: 25, unlock: 'book' },
      ],
    },
    home: {
      label: 'The falls',
      lines: ['The water... ... never stops talking.', '...We get on... ... very well.'],
      choices: [
        { t: 'Isn\'t it loud behind the falls?', r: ['...What?'], anim: 'laugh' },
        { t: 'Can I visit?', r: ['...The door... ... is behind the water.', '...You will... get wet. ... Everyone does.'], f: 1 },
      ],
    },
    tips: {
      label: 'Tips',
      lines: ['...Ask me... properly. ... It takes... ... three days.', '...I have... a whole talk... ... about tips.'],
    },
    gossip: {
      label: 'Gossip',
      lines: ['...The heron... on the steps... ... owes me... a fish.', '...Since... ... the spring... of the great flood.'],
      choices: [
        { t: 'Which flood?', r: ['...The big one. ... ... There was... a medium one... too.'], f: 1, anim: 'nod' },
        { t: 'Want me to collect?', r: ['...No. ... ... Interest... is building.'], mood: 'smug' },
      ],
    },
    book: {
      label: 'The one book', hidden: true,
      lines: ['...It is about... ... a turtle.', '...I am... on page... ... four.'],
      choices: [
        { t: 'How does it end?', r: ['...Do not... ... spoil it.'], f: 1, anim: 'retract' },
        { t: 'Who wrote it?', r: ['...Me. ... ... I am... also on page four... ... of writing it.'], anim: 'laugh' },
      ],
    },
  },
  daily: [
    '...Good... ... morning.',
    '...The mist... is thick... today. ... Like soup.',
    '...A snail... passed me... this morning. ... Show-off.',
    '...I had... a thought. ... ... It will... come back.',
    '...The falls... ... said hello. ... I said... ... it back.',
    '...Tea. ... ... Is... a verb.',
  ],
  ms: {
    3: { lines: ['...You came... ... back.', '...Most do not. ... ... It is the stairs.'], gift: { coins: 60 } },
    6: { lines: ['...You listen... ... well. ... For a fox.', '...A coin... from the bottom... of the pond. ... ... Very old.'], gift: { coins: 120 } },
    10: { lines: ['...Friend.', '...That word... ... took me... ... a hundred years... to say.'], gift: { coins: 250 } },
  },
  // he does come to the pond some mornings. He left last month.
  visit: { lines: ['...I was... ... in the neighbourhood.', '...I set off... ... in the spring.'], gift: { coins: 50 } },
};

// ------------------------------------------------------------------ quests (Quests.js)
const has = (g, id) => (g.state.research || []).includes(id);
const done = (g) => (g.state.tutorialDone || g.skipTutorial);
const zone = (g, id) => (g.state.zones || []).includes(id);
const barrier = (g, id) => !!g.expedition?.isOpen?.(id);

export const LONGNECK_QUESTS = [
  {
    id: 'ln_rumor', title: 'The old one behind the falls', icon: 'xp_compass', reward: { coins: 80 },
    when: (g) => done(g) && (zone(g, 'tower') || zone(g, 'river')) && g.state.day >= 6 && !zone(g, 'deep'),
    intro: 'A note from Professor Hoot: "Somebody VERY old lives behind the falls, far south. Bring ropes. And patience." Old things are worth money. Decrypt the Deepwood Expedition in the lab!',
    steps: [
      { text: 'Decrypt the Deepwood Expedition (Lab)', ev: 'sectionUnlock', test: (d) => d?.id === 'expedition' },
      { text: 'Research a Rope Bridge', ev: 'research', test: (r) => r?.id === 'r_xp_bridge' },
    ],
    check: (g) => has(g, 'r_xp_bridge'),
    point: () => 'tool:lab',
  },
  {
    id: 'ln_road', title: 'The road to Mistfall Hollow', icon: 'xp_bridge', reward: { coins: 160 },
    when: (g) => done(g) && has(g, 'r_xp_bridge') && !zone(g, 'deep'),
    intro: 'Four things stand between us and the falls: a river, thorns, a fallen giant and a cliff. One at a time.',
    steps: [
      { text: 'Cross the Broadwater', ev: 'barrier', test: (B) => B?.id === 'bridge' },
      { text: 'Clear the Bramblewall', ev: 'barrier', test: (B) => B?.id === 'thorns' },
      { text: 'Saw up the Fallen Giant', ev: 'barrier', test: (B) => B?.id === 'log' },
      { text: 'Rope down Heron Steps', ev: 'barrier', test: (B) => B?.id === 'cliff' },
    ],
    check: (g) => barrier(g, 'cliff'),
    point: () => 'tool:lab',
  },
  {
    id: 'ln_listen', title: 'The Long Talk', icon: 'speech', reward: { coins: 120 },
    when: (g) => done(g) && zone(g, 'deep'),
    intro: 'Old Longneck has something to tell us. He says it will not take long.',
    steps: [
      { text: 'Tap Old Longneck', ev: 'longneckStart' },
      { text: 'Let him finish (3 days)', ev: 'longneckDone' },
    ],
    check: (g) => !!g.state.longneck?.done,
    point: () => null,
  },
];
