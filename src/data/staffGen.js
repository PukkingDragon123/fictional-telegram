// [v26 staff] Procedural beaver staff: names, looks, traits, personalities,
// skills, wages and the goofy things they say in interviews.
//
//   rollBeaver({ seed, quality, origin }) -> a plain profile (JSON-safe):
//     { seed, name, look, traits, personality, skills, wage, answer: { q, a } }
//   outfitFor(job skill / building def jobs) -> outfit id for beaverChibi.js
//   staffLine(profile, kind) -> a short line in their voice ('hire', 'hurt', 'rescued', 'work', 'lunch', 'sad', 'quit', 'idle', 'levelup', 'tired')
//
// Pure data: imports nothing from the game (src/data/ext/staff.js holds the buildings).
import { mulberry32 } from '../core/rng.js';

export const SKILLS = ['build', 'chop', 'haul', 'serve', 'fab', 'mine', 'care'];
export const SKILL_INFO = {
  build: { name: 'Build', icon: 'st_build', verb: 'builds' },
  chop: { name: 'Chop', icon: 'st_chop', verb: 'chops' },
  haul: { name: 'Haul', icon: 'st_haul', verb: 'hauls' },
  serve: { name: 'Serve', icon: 'st_serve', verb: 'serves' },
  fab: { name: 'Fab', icon: 'st_fab', verb: 'fabricates' },
  mine: { name: 'Mine', icon: 'st_mine', verb: 'mines' },
  care: { name: 'Care', icon: 'st_care', verb: 'cares' },
};

// boost: output multiplier while working; energy: energy use multiplier; breaks: how often they slack off;
// hurt: chance multiplier of getting knocked over; skill: +1 to a skill; mood: daily mood drift
export const TRAITS = {
  hardworker: { name: 'Hard Worker', good: 1, desc: 'Fewer breaks, more output.', boost: 1.12, breaks: 0.5 },
  lazy: { name: 'Lazy', good: -1, desc: 'Breaks. Long ones.', boost: 0.86, breaks: 2.2 },
  nightowl: { name: 'Night Owl', good: 0, desc: 'Slow mornings, a machine at the feast.', morning: 0.75, evening: 1.25 },
  clumsy: { name: 'Clumsy', good: -1, desc: 'Gets knocked over twice as often.', hurt: 2, boost: 0.95 },
  charming: { name: 'Charming', good: 1, desc: 'Great with customers. +1 Serve.', skill: 'serve' },
  neatfreak: { name: 'Neat Freak', good: 0, desc: 'Loves a cozy home, hates a messy one.', comfort: 1.6 },
  strong: { name: 'Strong', good: 1, desc: 'Hauls like a moose. +1 Haul.', skill: 'haul', carry: 1.2 },
  speedy: { name: 'Speedy', good: 1, desc: 'Walks everywhere at a jog.', speed: 1.3 },
  nervous: { name: 'Nervous', good: -1, desc: 'Bears make them jumpy. Mood drops faster.', mood: -1.5 },
  foodie: { name: 'Foodie', good: 0, desc: 'Long lunches. Happy when the snack bar is full.', lunch: 1.6 },
  cheerful: { name: 'Cheerful', good: 1, desc: 'Mood recovers fast. Hums at work.', mood: 1.5 },
  brave: { name: 'Brave', good: 1, desc: 'Rarely gets hurt. Waves at angry bears.', hurt: 0.5 },
  tinker: { name: 'Tinkerer', good: 1, desc: 'Takes things apart. +1 Fab.', skill: 'fab' },
  greenpaw: { name: 'Green Paw', good: 1, desc: 'Gentle with patients. +1 Care.', skill: 'care' },
};
export const TRAIT_IDS = Object.keys(TRAITS);

// voice: interview chatter pitch; punct: how they end sentences
export const PERSONALITIES = {
  shy: { name: 'Shy', voice: 1.25, desc: 'Quiet, polite, blushes a lot.' },
  bubbly: { name: 'Bubbly', voice: 1.4, desc: 'LOUD enthusiasm. About everything.' },
  grumpy: { name: 'Grumpy', voice: 0.8, desc: 'Works fine. Talks less. Sighs more.' },
  dramatic: { name: 'Dramatic', voice: 1.05, desc: 'Every log is a saga.' },
  chill: { name: 'Chill', voice: 0.95, desc: 'Nothing is a problem. Ever.' },
};
export const PERSONALITY_IDS = Object.keys(PERSONALITIES);

const FIRST = [
  'Bucky', 'Nibbles', 'Twiggy', 'Paddles', 'Woodrow', 'Timber', 'Cedar', 'Aspen', 'Alder', 'Buckley', 'Knotty', 'Barkley',
  'Stumpy', 'Sawyer', 'Logan', 'Pinecone', 'Dusty', 'Mabel', 'Gerty', 'Bea', 'Dottie', 'Ruby', 'Juniper', 'Olive',
  'Pickles', 'Biscuit', 'Noodle', 'Waffles', 'Muffin', 'Tater', 'Gus', 'Huxley', 'Norbert', 'Bernard', 'Dolores',
  'Marge', 'Wanda', 'Doris', 'Lou', 'Sal', 'Vinnie', 'Benny', 'Ziggy', 'Moe', 'Patty', 'Peggy', 'Chompsky', 'Splash',
  'Birdie', 'Hank', 'Opal', 'Wilma', 'Roscoe', 'Elmer', 'Clem', 'Lottie', 'Mo', 'Fitz', 'Toots', 'Bertie', 'Ida',
  'Mitzi', 'Rudy', 'Skip', 'Tilly', 'Walt', 'Yvette', 'Nell', 'Archie', 'Fern', 'Gilbert', 'Hattie', 'Iggy', 'June',
];
const LAST = [
  'Chompworth', 'Gnawsworth', 'Twiggs', 'Stumpington', 'McSplash', 'Paddleton', 'Damsworth', 'Logsdon', 'Branchley',
  'Splinters', 'Lodgepole', 'Toothaker', 'Bucktooth', 'Woodley', 'Barkman', 'Sawdust', 'Timbers', 'Puddleby',
  'Mudflap', 'Riverton', 'Cattail', 'Birchwood', 'Acorn', 'Nibbleton', 'Flatstail', 'Chewbank', 'Slapwater', 'Underdam',
];

// fur colours (base hex; the rig derives shades). Rare ones at the end.
export const FURS = [
  { id: 'chestnut', c: 0x8c5530, w: 10 }, { id: 'cocoa', c: 0x6a3f24, w: 9 }, { id: 'honey', c: 0xae7840, w: 8 },
  { id: 'ginger', c: 0xb05c2c, w: 6 }, { id: 'ash', c: 0x7c7068, w: 5 }, { id: 'midnight', c: 0x40302a, w: 4 },
  { id: 'cream', c: 0xc8a47e, w: 4 }, { id: 'rust', c: 0x98482a, w: 5 }, { id: 'mocha', c: 0x7c5844, w: 6 },
  { id: 'blonde', c: 0xd0a45c, w: 2 }, { id: 'silver', c: 0xa8a29c, w: 1.2 }, { id: 'snow', c: 0xece2d6, w: 0.6 },
];
export const BELLIES = [0xe8c592, 0xf2dcb4, 0xdcae7c, 0xf6eee0, 0xe8b8a0, 0xc89a6a];
export const CLOTH = [0xd8453b, 0x3c88d8, 0x46963c, 0xee7e2a, 0xf08aa8, 0x6a5ab8, 0xe0a01e, 0x30ad9c, 0x8a5a3a, 0x3a3e4a];
export const ACCS = ['none', 'none', 'none', 'glasses', 'bow', 'scarf', 'pencil', 'earring', 'none', 'glasses', 'bow'];

// outfits (beaverChibi.js draws them): by skill, or a building def's jobs.outfit
export const OUTFITS = ['overalls', 'hardhat', 'apron', 'robe', 'chef', 'labcoat', 'hivis', 'toolbelt', 'bandana', 'medic'];
const SKILL_OUTFIT = { build: 'hardhat', chop: 'bandana', haul: 'hivis', serve: 'apron', fab: 'labcoat', mine: 'hardhat', care: 'robe' };
/** outfit for a job: a building def's jobs ({ skill, outfit? }), 'crew' / null (the crew), or a skill id. */
export function outfitFor(jobs) {
  if (!jobs || jobs === 'crew') return 'overalls';
  if (typeof jobs === 'string') return SKILL_OUTFIT[jobs] || 'toolbelt';
  if (jobs.outfit && OUTFITS.includes(jobs.outfit)) return jobs.outfit;
  const t = String(jobs.title || '').toLowerCase();
  if (/cook|chef|kitchen|grill|bak/.test(t)) return 'chef';
  if (/medic|nurse|doctor|first/.test(t)) return 'medic';
  if (/lab|scien|research|engineer/.test(t)) return 'labcoat';
  if (/spa|towel|sauna|massage|bath/.test(t)) return 'robe';
  if (/clerk|ticket|waiter|server|barista|host/.test(t)) return 'apron';
  if (/weld|fab|smith|machin|mechanic/.test(t)) return 'hivis';
  return SKILL_OUTFIT[jobs.skill] || 'toolbelt';
}

// ------------------------------------------------------------------ interview copy
// Reynard asks one question; the candidate answers in their own voice.
export const QUESTIONS = [
  'Why should I hire you?',
  'Your greatest weakness?',
  'Where do you see yourself in five years?',
  'Tell me about your last job.',
  'What would you do if a bear sat on you?',
  'How do you feel about unpaid overtime?',
  'Describe yourself in one word.',
];
const ANSWERS = {
  shy: [
    'I... I can carry four logs. Five if nobody is watching.',
    'My greatest weakness is, um. This. Talking.',
    'Five years? Maybe... here? If that is okay?',
    'I built a dam once. It was very small. It was mine.',
    'I would apologize to the bear. Probably a lot.',
    'Overtime is fine. Please do not make eye contact.',
    'Quiet. Sorry. That was two words.',
  ],
  bubbly: [
    'I chewed through a whole birch before breakfast! Ask me how! Please ask me how!',
    'I care TOO much! About logs! And you! And logs!',
    'Running this place! Or the gift shop! Or BOTH!',
    'I was Employee of the Month at the dam! Twice! There were two of us!',
    'Make friends with it! Bears are just big hugs!',
    'More hours, more FUN! Right? Right!',
    'Sparkly!',
  ],
  grumpy: [
    'Because I show up. That is more than most.',
    'Weakness? Other beavers.',
    'Retired. In a bigger lodge than yours.',
    'Same as this one. Logs. Noise. Fox.',
    'Bite it. Politely.',
    'I feel about it how you would expect.',
    'Fine.',
  ],
  dramatic: [
    'I was BORN in a flood. The river named me. I have never once been late. Spiritually.',
    'I feel everything. Every splinter. Every sunrise. Every lunch.',
    'On a stage. Or a very tall stump. Lit from below.',
    'The dam broke. My heart broke. Only one of them was rebuilt.',
    'I would collapse. Beautifully. Then sue.',
    'Art does not watch the clock, darling.',
    'Legendary.',
  ],
  chill: [
    'I am pretty good at stuff. Stuff gets done.',
    'Naps. Is that a weakness? Feels like a strength.',
    'Floating on my back in your pond, probably.',
    'Logs. Vibes. Mostly vibes.',
    'Just wait. Bears get bored.',
    'Sure, whatever flows.',
    'Floaty.',
  ],
};
const TRAIT_ANSWERS = {
  lazy: ['I am very good at resting. It is a skill. You can look it up.', 'I work hard at hardly working.'],
  clumsy: ['I have only broken... most things. Recently.', 'Is that table load-bearing? Was it?'],
  nightowl: ['Mornings are a rumour.', 'I do my best work after five. And before never.'],
  foodie: ['Is there a snack bar? Asking for me.', 'Lunch is the most important meal. All of them are.'],
  neatfreak: ['Your lab is dusty. I noticed. I am sorry. I noticed.', 'I alphabetized the forest once.'],
  strong: ['I once carried a canoe. With a moose in it.', 'Point me at something heavy.'],
  speedy: ['I finished this interview already. In my head.', 'Fast question, fast answer: yes.'],
  nervous: ['Is that bear behind me? Is it? Do not look.', 'Sorry. Sorry. What was the question. Sorry.'],
  charming: ['You have a lovely pond. And a lovely tail. Hire me.', 'Customers just like me. Even the ones that bite.'],
  hardworker: ['I sleep in my hard hat. In case.', 'Give me the job nobody wants. Then the next one.'],
  cheerful: ['Every day is a good day! Even Mondays! Especially Mondays!', 'I hum while I work. You will love it. Eventually.'],
  brave: ['I have stared down a grizzly. It blinked first.', 'Bears? I eat bears for breakfast. Not literally. Bark.'],
  tinker: ['I took apart my lodge to see how it works. It mostly does.', 'Give me a wrench and a weekend.'],
  greenpaw: ['I can splint a tail in under a minute.', 'Bandages, tea, a good blanket. That is medicine.'],
};

// barks in the world (speech bubbles), by personality then kind
const BARKS = {
  hire: { shy: ['Oh! Thank you. I will try.'], bubbly: ['YES! Best day EVER!'], grumpy: ['Fine. When do I start.'], dramatic: ['At last, a stage worthy of me!'], chill: ['Cool cool cool.'] },
  hurt: { shy: ['Ow... sorry...'], bubbly: ['OW! Stars! Pretty stars!'], grumpy: ['Typical.'], dramatic: ['Tell my lodge... I loved it!'], chill: ['Whoa. Floor time.'] },
  rescued: { shy: ['Thank you for the ride...'], bubbly: ['Wheee! Stretcher!'], grumpy: ['About time.'], dramatic: ['I shall live! Barely!'], chill: ['Nice, a nap with wheels.'] },
  work: { shy: ['Working, working...'], bubbly: ['Love this job!'], grumpy: ['Hmph.'], dramatic: ['Behold, my craft!'], chill: ['In the flow.'] },
  lunch: { shy: ['Lunch...'], bubbly: ['LUNCH!'], grumpy: ['Finally.'], dramatic: ['A feast, at last!'], chill: ['Snack o\'clock.'] },
  sad: { shy: ['I am not okay...'], bubbly: ['I am... fine! Fine.'], grumpy: ['This place.'], dramatic: ['Nobody understands me!'], chill: ['Bit of a bummer, ngl.'] },
  quit: { shy: ['I have to go. Sorry.'], bubbly: ['Bye bye, I guess!'], grumpy: ['I quit. Obviously.'], dramatic: ['I QUIT! Farewell, cruel pond!'], chill: ['Gonna float on, man.'] },
  idle: { shy: ['Nice weather...'], bubbly: ['Hi! Hi! Hi!'], grumpy: ['What.'], dramatic: ['Such light today.'], chill: ['Sup.'] },
  levelup: { shy: ['I got better!'], bubbly: ['LEVEL UP!!'], grumpy: ['Raise?'], dramatic: ['I have ASCENDED.'], chill: ['Neat.'] },
  tired: { shy: ['So sleepy...'], bubbly: ['Need... nap...'], grumpy: ['I am done.'], dramatic: ['I am WILTING.'], chill: ['Yawn.'] },
  bear: { shy: ['Eep!'], bubbly: ['Big hug!'], grumpy: ['Watch it, furball.'], dramatic: ['A MONSTER!'], chill: ['Easy, big guy.'] },
};

// ------------------------------------------------------------------ generator
const pickW = (rnd, arr, w) => {
  let t = 0;
  for (const it of arr) t += w(it);
  let x = rnd() * t;
  for (const it of arr) { x -= w(it); if (x <= 0) return it; }
  return arr[arr.length - 1];
};
const pickR = (rnd, arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
const clampI = (v, a, b) => Math.max(a, Math.min(b, Math.round(v)));

/** A random look. All fields are small ints / ids (the rig turns them into colours and shapes). */
export function rollLook(rnd) {
  const fur = FURS.indexOf(pickW(rnd, FURS, (f) => f.w));
  return {
    fur, belly: Math.floor(rnd() * BELLIES.length), bellyShape: Math.floor(rnd() * 4),
    blush: Math.floor(rnd() * 3), brow: Math.floor(rnd() * 6), tuft: Math.floor(rnd() * 5),
    freckles: rnd() < 0.3 ? 1 : 0, eye: Math.floor(rnd() * 5), gap: rnd() < 0.35 ? 1 : 0, teeth: rnd() < 0.5 ? 1 : 0,
    acc: pickR(rnd, ACCS), accCol: Math.floor(rnd() * CLOTH.length), cloth: Math.floor(rnd() * CLOTH.length),
    chubby: rnd() < 0.35 ? 1 : 0, ear: rnd() < 0.25 ? 1 : 0, size: +(0.94 + rnd() * 0.12).toFixed(3),
  };
}

/** Skills 1..5. quality 0..1 raises them; one or two specialties stand out. */
export function rollSkills(rnd, quality = 0.3) {
  const sk = {};
  for (const k of SKILLS) sk[k] = clampI(1 + rnd() * (1.2 + quality * 1.6), 1, 3);
  const spec = [pickR(rnd, SKILLS)];
  if (rnd() < 0.45 + quality * 0.3) spec.push(pickR(rnd, SKILLS.filter((k) => k !== spec[0])));
  for (const k of spec) sk[k] = clampI(2.2 + rnd() * 1.6 + quality * 1.8, 2, 5);
  return sk;
}

export function wageFor(p) {
  let tot = 0;
  for (const k of SKILLS) tot += p.skills[k] || 1;
  let w = 4 + (tot - 7) * 1.1 + Math.max(...SKILLS.map((k) => p.skills[k] || 1)) * 1.5;
  for (const t of p.traits) w *= TRAITS[t]?.good > 0 ? 1.1 : TRAITS[t]?.good < 0 ? 0.88 : 1;
  return Math.max(4, Math.round(w));
}

/**
 * A full profile. quality 0..1 (posters, tent upgrades), origin 'hire' | 'lodge'.
 * Lodge starters are a little plainer and are paid in snacks (wage 0).
 */
export function rollBeaver({ seed = (Math.random() * 2 ** 31) | 0, quality = 0.3, origin = 'hire' } = {}) {
  const rnd = mulberry32(seed);
  const name = `${pickR(rnd, FIRST)} ${pickR(rnd, LAST)}`;
  const look = rollLook(rnd);
  const personality = pickR(rnd, PERSONALITY_IDS);
  const traits = [];
  const nT = rnd() < 0.25 + quality * 0.2 ? 2 : 1;
  while (traits.length < nT) {
    // better posters attract more good traits
    const t = pickW(rnd, TRAIT_IDS, (id) => (TRAITS[id].good > 0 ? 1 + quality : TRAITS[id].good < 0 ? 1.2 - quality * 0.7 : 1));
    if (traits.includes(t)) continue;
    if ((t === 'lazy' && traits.includes('hardworker')) || (t === 'hardworker' && traits.includes('lazy'))) continue;
    if ((t === 'brave' && traits.includes('nervous')) || (t === 'nervous' && traits.includes('brave'))) continue;
    traits.push(t);
  }
  const skills = rollSkills(rnd, quality);
  for (const t of traits) if (TRAITS[t].skill) skills[TRAITS[t].skill] = Math.min(5, skills[TRAITS[t].skill] + 1);
  const p = { seed, name, look, traits, personality, skills };
  p.wage = origin === 'lodge' ? 0 : wageFor(p);
  // the interview answer: a trait line now and then, else the personality's answer to the question
  const qi = Math.floor(rnd() * QUESTIONS.length);
  const tl = traits.map((t) => TRAIT_ANSWERS[t]).filter(Boolean);
  if (tl.length && rnd() < 0.45) p.answer = { q: QUESTIONS[0], a: pickR(rnd, pickR(rnd, tl)) };
  else p.answer = { q: QUESTIONS[qi], a: ANSWERS[personality][qi] || ANSWERS[personality][0] };
  return p;
}

/** A short line in their voice. */
export function staffLine(p, kind) {
  const B = BARKS[kind];
  if (!B) return '';
  const arr = B[p?.personality] || B.chill;
  return arr[Math.floor(Math.random() * arr.length)];
}

/** "Bucky" from "Bucky Chompworth". */
export const firstName = (p) => String(p?.name || 'Beaver').split(' ')[0];
