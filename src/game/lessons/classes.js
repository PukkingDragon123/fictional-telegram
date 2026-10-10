// [v26 tutorial] Professor Reynard's classes after day 1 (src/game/Classroom.js).
// [v26 class2] Rewritten short and interactive: each class teaches 2-3 things that change how you
// play, and almost every one is a pop quiz the player answers on the chalkboard (tap / drag /
// guess, src/game/lessons/quiz.js) with a small coin reward. `steps(game)` builds the class when it
// starts, so the numbers are the player's own (src/game/lessons/econ.js).
// Merged: 'genetics' is now part of 'breeding' (Smart Breeding); the id still works.
import { measureText } from '../../ui/Chalkboard.js';
import { priceOf, plain, mutationOdds, goldenBaby, pct, bestFish, fishPrice, fishLabel, TIP_5, MUTATIONS } from './econ.js';
import { researchRushPrice } from '../../data/research.js';

const T = (text, x, y, o = {}) => ({ text, x, y, ...o });
const D = (doodle, x, y, o = {}) => ({ doodle, x, y, ...o });
const TITLE = (text, color = 'yellow', o = {}) => ({ text, x: 96, y: 9, scale: measureText(text, 2).w <= 184 ? 2 : 1, color, id: 'title', ...o });
const S = (t, x, y, color = 'white', o = {}) => T(t, x, y, { font: 'small', color, ...o });

// the cheapest fish you can show prices with (always a Bluegill)
const base = (game) => priceOf(game, 'bluegill', plain(1));
const mutX = (id, d) => MUTATIONS[id]?.value ?? d;

export const CLASS_LESSONS = {
  // ------------------------------------------------------------------ MONEY 101: what multiplies the bill
  money101: {
    title: 'Money 101', number: 1, doodle: 'coin', color: 'yellow',
    steps: (game) => {
      const b = base(game), xl = priceOf(game, 'bluegill', plain(1.4)), gal = mutX('galaxy', 8);
      const gS = priceOf(game, 'bluegill', { ...plain(0.9), morph: 'golden' }), gX = priceOf(game, 'bluegill', { ...plain(1), mut: 'galaxy' });
      const best = bestFish(game, (f) => f.adult);
      return [
        { cam: 'board', say: 'Higher or lower! A plain **XL** Bluegill, or a small **GOLDEN** one. Which pays more? **Tap it!**', expr: 'greedy', react: 'bang',
          draw: [TITLE('HIGHER OR LOWER?'), D('fish', 50, 54, { scale: 2, id: 'xl' }), S('SIZE XL', 50, 74, 'blue', { id: 'xl_l' }), T('VS', 96, 54, { color: 'yellow' }), D('fish_gold', 142, 54, { id: 'gold' }), S('GOLDEN, SIZE S', 142, 74, 'yellow', { id: 'gold_l' })],
          quiz: { id: 'hl', opts: ['xl', 'gold'], ok: 'gold',
            no: `Size is a small multiplier: XL is only **+40%** (**${xl}**). Colour is the BIG one!`,
            yes: `Golden is **x5**: **${gS}** even when small. XL plain: **${xl}**. Colour beats size!`,
            show: [T(`${xl}`, 50, 90, { color: 'white' }), T(`${gS}`, 142, 90, { color: 'yellow' })] } },
        { erase: true, say: `Guess the bill! A plain Bluegill pays **${b}**. The same fish, **Galaxy** mutant?`, expr: 'scheming',
          draw: [TITLE('GUESS THE BILL', 'lilac'), D('galaxy', 34, 50, { scale: 2 }), T('=', 62, 50, { scale: 2 }), T(`${b * 2}`, 92, 50, { scale: 2, id: 'g1' }), T(`${gX}`, 132, 50, { scale: 2, id: 'g2' }), T(`${b * 30}`, 172, 50, { scale: 2, id: 'g3' })],
          quiz: { id: 'galaxy', opts: ['g1', 'g2', 'g3'], ok: 'g2',
            no: { g1: 'Too modest! You\'re not a pessimist, you\'re a fox.', g3: 'Greedy! I like it. But no.' },
            yes: `**x${gal}**! Mutations stack with colour: a Golden Galaxy is **x${5 * gal}**. One bite!` } },
        { erase: true, say: 'One must be served tonight. **Drag** the right one onto the plate!',
          draw: [TITLE('WHO GOES ON THE PLATE?', 'orange'), D('minifish', 34, 52, { scale: 2, id: 'fry' }), S('FRY', 34, 72, 'blue', { id: 'fry_l' }), D('fish', 86, 52, { scale: 2, id: 'adult' }), S('ADULT', 86, 72, 'green', { id: 'adult_l' }), D('plate', 154, 64, { scale: 2, id: 'plate' })],
          quiz: { id: 'fry', opts: ['fry', 'adult'], ok: 'adult', drop: 'plate',
            no: 'A **fry** pays only a **THIRD**! Let it grow up first.',
            yes: `Adults pay full price. Full bears **tip** too: up to **+${Math.round(TIP_5 * 100)}%**, more with their side dish.` } },
        best
          ? { cam: 'teacher', say: `Homework: your ${fishLabel(best)} pays **${fishPrice(game, best)}** a bite. Breed MORE of those!`, expr: 'greedy', react: 'cheer' }
          : { cam: 'teacher', say: 'Homework: breed **colourful**, keep bears **full**. Class dismissed!', expr: 'proud', react: 'cheer' },
      ];
    },
  },

  // ------------------------------------------------------------------ SMART BREEDING (was Genetics + Selective Breeding)
  breeding: {
    title: 'Smart Breeding', number: 2, doodle: 'heart', color: 'pink',
    steps: (game) => {
      const gg = goldenBaby(game, true, true), ww = goldenBaby(game, false, false);
      return [
        { cam: 'board', say: 'Babies are about the **average** of their parents. Pick the pair with **BIGGER** babies. **Tap it!**', expr: 'teacher', react: 'bang',
          draw: [TITLE('PICK A PAIR', 'pink'), D('fish_m', 30, 46), D('fish_f', 62, 46), S('1.00 + 1.10', 46, 62, 'white'), { box: [12, 32, 68, 38], color: 'blue', id: 'pa' },
            D('fish_m', 128, 46, { scale: 2 }), D('fish_f', 172, 46), S('1.30 + 1.20', 150, 62, 'white'), { box: [110, 30, 78, 40], color: 'pink', id: 'pb' }],
          quiz: { id: 'pair', opts: ['pa', 'pb'], ok: 'pb',
            no: 'Those two? Small parents, **small** babies. Genes do not lie.',
            yes: 'Babies land near **1.25**! Big parents, big babies, bigger bills.',
            show: [S('BABY ~1.05', 46, 82, 'blue'), S('BABY ~1.25', 148, 82, 'yellow')] } },
        { erase: true, say: 'Two **GOLDEN** parents. What are the odds of a golden baby? **Guess!**', expr: 'scheming',
          draw: [TITLE('GOLDEN ODDS', 'yellow'), D('fish_gold', 60, 40, { scale: 2 }), T('+', 96, 40, { scale: 2 }), D('fish_gold', 132, 40, { scale: 2 }),
            T(pct(ww), 40, 76, { scale: 2, id: 'o1' }), T(pct(gg), 96, 76, { scale: 2, id: 'o2' }), T('100%', 156, 76, { scale: 2, id: 'o3' })],
          quiz: { id: 'gold', opts: ['o1', 'o2', 'o3'], ok: 'o2',
            no: { o1: `That's for **plain** parents: ${pct(ww)}. Gold makes gold!`, o3: 'Genes aren\'t THAT generous. Nice try.' },
            yes: `**${pct(gg)}**! Plain parents: only **${pct(ww)}**. Each morph parent passes it on **38%** of the time.` } },
        { erase: true, say: 'Three babies hatched. Which one do you **KEEP** for breeding? **Tap it!**',
          draw: [TITLE('KEEP THE BEST', 'green'), D('minifish', 40, 50, { scale: 2, id: 'k1' }), S('0.99', 40, 70, 'white', { id: 'k1_l' }), D('minifish', 96, 50, { scale: 2, id: 'k2' }), S('1.02', 96, 70, 'white', { id: 'k2_l' }), D('minifish', 152, 50, { scale: 2, id: 'k3' }), S('1.14', 152, 70, 'yellow', { id: 'k3_l' })],
          quiz: { id: 'keep', opts: ['k1', 'k2', 'k3'], ok: 'k3',
            no: 'Cute. But **small**. That one\'s bear food.',
            yes: 'Keep the best, tag it **DO NOT EAT**. The rest? Dinner. For bears. **Profit!**',
            show: [S('BEAR FOOD', 40, 84, 'red'), S('BEAR FOOD', 96, 84, 'red'), S('DO NOT EAT!', 152, 84, 'green')] } },
        { cam: 'teacher', say: 'Pro tip: **pet** both parents before the date: **x1.6 luck** on every gene roll.', expr: 'wink', react: 'heart' },
      ];
    },
  },

  // ------------------------------------------------------------------ MUTATIONS
  mutations: {
    title: 'Mutations!', number: 3, doodle: 'sparkle', color: 'lilac',
    steps: (game) => {
      const o0 = mutationOdds(game), o3 = mutationOdds(game, { arranged: true, food: 1 });
      return [
        { cam: 'board', say: 'Mutations multiply the bill... **mostly**. Which one do you NOT want? **Tap it!**', expr: 'excited', react: 'wow',
          draw: [TITLE('MUTATIONS!', 'lilac'), D('galaxy', 28, 50, { scale: 2, id: 'galaxy' }), D('doge', 74, 50, { scale: 2, id: 'doge' }), D('tiny', 120, 52, { scale: 2, id: 'tiny' }), D('sparkle', 166, 50, { scale: 2, id: 'shiny' })],
          quiz: { id: 'tiny', opts: ['galaxy', 'doge', 'tiny', 'shiny'], ok: 'tiny',
            no: { galaxy: 'GALAXY? That\'s **x8**! Bite your tongue.', doge: 'Doge pays **x4**. Much coin. Wow.', shiny: 'Shiny pays **x3**! Sparkles sell.' },
            yes: `**Tiny**: the most common one, and worth **LESS**. Boo! Galaxy x${mutX('galaxy', 8)}, Doge x${mutX('doge', 4)}.`,
            show: [S(`X${mutX('galaxy', 8)}`, 28, 76, 'yellow'), S(`X${mutX('doge', 4)}`, 74, 76, 'yellow'), S(`X${mutX('tiny', 0.7)}`, 120, 76, 'red'), S(`X${mutX('shiny', 3)}`, 166, 76, 'yellow')] } },
        { erase: true, say: 'Lucky food makes mutants. **Tap ALL the lucky foods!**',
          draw: [TITLE('LUCKY FOOD', 'green'), D('pearl', 22, 52, { scale: 2, id: 'pearl' }), D('pellet', 58, 54, { scale: 2, id: 'pellet' }), D('clover', 96, 52, { scale: 2, id: 'clover' }), D('worm', 134, 54, { scale: 2, id: 'worm' }), D('moonberry', 170, 52, { scale: 2, id: 'berry' })],
          quiz: { id: 'luck', opts: ['pearl', 'pellet', 'clover', 'worm', 'berry'], ok: ['pearl', 'clover', 'berry'], all: true,
            no: { pellet: 'Pellets? Lucky for **nobody**.', worm: 'Worms fill bellies, not luck. Ew, also.' },
            yes: `Pearls, Clovers, Moonberries! Feed BOTH parents, use my **Matchmaker**: **${pct(o0.any)}** becomes **${pct(o3.any)}**.` } },
        { cam: 'teacher', say: 'And a mutant parent passes its mutation on **30%** of the time. Breed your mutants!', expr: 'scheming', react: 'heart' },
      ];
    },
  },

  // ------------------------------------------------------------------ UNLOCKING
  unlocking: {
    title: 'Unlocking Stuff', number: 4, doodle: 'key', color: 'green',
    steps: (game) => {
      const next = (() => { try { return game.researchSections?.().find((k) => k && !k.open); } catch { return null; } })();
      const rush60 = researchRushPrice({ tier: 0 }, 60);
      return [
        { cam: 'board', say: 'Everything new starts in my **LAB**. What does research cost? **Tap it!**', expr: 'teacher', react: 'bang',
          draw: [TITLE('RESEARCH COSTS...', 'green'), D('coin', 36, 50, { scale: 2, id: 'c' }), S('COINS', 36, 70, 'yellow', { id: 'c_l' }), D('timer', 96, 50, { scale: 2, id: 't' }), S('TIME', 96, 70, 'blue', { id: 't_l' }), D('fish', 156, 50, { scale: 2, id: 'f' }), S('FISH', 156, 70, 'pink', { id: 'f_l' })],
          quiz: { id: 'cost', opts: ['c', 't', 'f'], ok: 't',
            no: { c: `Only if you **rush** it: ~**${rush60}** coins a minute. Waiting is FREE.`, f: 'FISH?! I\'m a scientist, not a monster.' },
            yes: 'Only **TIME**! One project per **bench**. Never leave a bench idle.' } },
        { erase: true, say: 'A research section is **LOCKED**. What opens it? **Tap it!**',
          draw: [TITLE('SECTIONS', 'yellow'), D('lock', 30, 52, { scale: 2 }), { arrow: [50, 52, 66, 52] }, D('hammer', 88, 52, { scale: 2, id: 'h' }), D('key', 128, 52, { scale: 2, id: 'k' }), D('axe', 166, 52, { scale: 2, id: 'a' })],
          quiz: { id: 'key', opts: ['h', 'k', 'a'], ok: 'k',
            no: 'Violence! No. Locks in MY lab open with a **key**.',
            yes: next ? `Its **key**! Next for you, **${next.name}**: ${next.needs.map((n) => n.text).join(', ')}.` : 'Its **key**: a research node, a neighbour, coins. You\'ve opened them all, show-off!',
            show: [S('1 RESEARCH A NODE', 96, 80, 'blue'), S('2 MEET A NEIGHBOUR', 96, 90, 'green'), S('3 PAY THE COINS', 96, 100, 'yellow')] } },
        { cam: 'teacher', say: 'Neighbours live in the **fog**. Clear trees toward a fog bank to meet them!', expr: 'proud', react: 'cheer' },
      ];
    },
  },

  // ------------------------------------------------------------------ the v26 systems
  weather: {
    title: 'Weather Report', number: 5, doodle: 'snowflake', color: 'blue',
    steps: () => [
      { cam: 'board', say: 'Brr! Under **6°C** bears get cold and **leave without paying**. Which builds fix a cold bear? **Tap one!**', expr: 'worried', react: 'gasp',
        draw: [TITLE('COLD BEAR', 'blue'), D('bear', 30, 52, { scale: 2 }), D('snowflake', 50, 34), D('fire', 80, 54, { scale: 2, id: 'fire' }), D('flower', 116, 54, { scale: 2, id: 'flower' }), D('tub', 152, 56, { scale: 2, id: 'tub' }), D('fence', 180, 58, { id: 'fence' })],
        quiz: { id: 'cold', opts: ['fire', 'flower', 'tub', 'fence'], ok: ['fire', 'tub'],
          no: { flower: 'A flower. For a FREEZING bear. Romantic, but no.', fence: 'A fence keeps the wind... no. It doesn\'t.' },
          yes: 'Warm spots: **fire pits**, heaters, **hot tubs**. A warm bear stays, eats AND tips.' } },
      { erase: true, say: 'Winter **frost** kills tender crops. What keeps them growing? **Tap it!**',
        draw: [TITLE('FROST', 'blue'), D('sprout', 26, 52, { scale: 2 }), D('snowflake', 46, 36), D('sprinkler', 84, 54, { scale: 2, id: 'sp' }), D('shop', 128, 52, { scale: 2, id: 'gh' }), S('GREENHOUSE', 128, 74, 'green', { id: 'gh_l' }), D('bunny', 170, 54, { scale: 2, id: 'bun' })],
        quiz: { id: 'frost', opts: ['sp', 'gh', 'bun'], ok: 'gh',
          no: { sp: 'Water. On frozen plants. Now you have ICE plants.', bun: 'Bunnies speed up growing. They do NOT knit sweaters.' },
          yes: 'A **Greenhouse**! And check the clock\'s **forecast** every morning.' } },
    ],
  },
  resortStaff: {
    title: 'Resort & Staff', number: 6, doodle: 'beaver', color: 'orange',
    steps: () => [
      { cam: 'board', say: 'Bears pay for **facility visits** by need. This bear is **SOAKED**. Send it to...? **Tap it!**', expr: 'scheming', react: 'bang',
        draw: [TITLE('WHAT DOES IT NEED?', 'blue'), D('bear', 30, 50, { scale: 2 }), S('WET!', 30, 72, 'blue'), T('HOT TUB', 104, 34, { color: 'orange', id: 'r1' }), T('TOWELS', 104, 56, { color: 'green', id: 'r2' }), T('PHOTO SPOT', 104, 78, { color: 'pink', id: 'r3' })],
        quiz: { id: 'wet', opts: ['r1', 'r2', 'r3'], ok: 'r2',
          no: { r1: 'Wetter? Bold. Hot tubs are for **COLD** bears.', r3: 'A soggy selfie. No.' },
          yes: '**Towels**! Cold = hot tub, wet = towels, bored = fun. Every visit **pays**.' } },
      { erase: true, say: 'A Ticket Booth with **NO clerk**. How many tickets does it sell? **Guess!**',
        draw: [TITLE('STAFF', 'orange'), D('shop', 40, 50, { scale: 2 }), { cross: [56, 36, 5] }, T('0', 104, 52, { scale: 2, id: 'n0' }), T('HALF', 140, 52, { scale: 1, id: 'n1' }), T('ALL', 176, 52, { scale: 1, id: 'n2' })],
        quiz: { id: 'clerk', opts: ['n0', 'n1', 'n2'], ok: 'n0',
          no: 'Who sells them, the booth? **Zero**. Some jobs are **required**.',
          yes: '**Zero!** Hire beavers at the **Interview Tent**. Skilled, happy staff work up to **x2** faster.' } },
      { cam: 'teacher', say: 'Keep staff away from **rampages**: a rescue costs a LOT. And paint **paths**: bears stick to them.', expr: 'worried' },
    ],
  },
  industry: {
    title: 'Power & Storage', number: 7, doodle: 'gear', color: 'yellow',
    steps: () => [
      { cam: 'board', say: '**Demand** beats **supply**. What happens to your machines? **Tap it!**', expr: 'teacher', react: 'bang',
        draw: [TITLE('POWER', 'yellow'), { line: [12, 84, 90, 84] }, { bar: [20, 84, 20, 40], color: 'green' }, S('SUPPLY', 30, 92), { bar: [56, 84, 20, 56], color: 'red' }, S('DEMAND', 66, 92),
          T('FASTER', 140, 36, { color: 'green', id: 'p1' }), T('SLOW', 140, 58, { color: 'orange', id: 'p2' }), T('KABOOM', 140, 80, { color: 'red', id: 'p3' })],
        quiz: { id: 'brown', opts: ['p1', 'p2', 'p3'], ok: 'p2',
          no: { p1: 'Faster?! Electricity is not coffee.', p3: 'Ha! Dramatic. No: a **brownout**.' },
          yes: 'A **brownout**: everything runs **slow**. No power at all: it **stops**. Add sun, wind or water.' } },
      { erase: true, say: 'This machine is out of reach. **Drag** what connects it!',
        draw: [TITLE('POLES', 'yellow'), D('bolt', 26, 54, { scale: 2 }), S('POWER', 26, 74, 'yellow'), { box: [76, 38, 30, 32], color: 'blue', id: 'gap' }, D('gear', 160, 54, { scale: 2 }), S('MACHINE', 160, 74, 'blue'),
          D('crate', 66, 94, { id: 'crate' }), D('bolt', 96, 94, { id: 'pole' }), D('flower', 126, 94, { id: 'flw' })],
        quiz: { id: 'pole', opts: ['crate', 'pole', 'flw'], ok: 'pole', drop: 'gap',
          no: { crate: 'A crate stores stuff. It does not **zap** stuff.', flw: 'Flower power is a different thing.' },
          yes: 'A **pole**! It powers machines **4 tiles** around and links to the next one **8 tiles** away.' } },
      { cam: 'teacher', say: 'Last thing: **full storage** = production **stops**. Build more sheds, or sell!', expr: 'smug' },
    ],
  },
  feastClass: {
    title: 'The Feast', number: 8, doodle: 'bear', color: 'orange',
    steps: () => [
      { cam: 'board', say: 'At **5 PM** the camera is yours and **icons** pop over bears. Quick, **tap ALL the icons**!', expr: 'excited', react: 'bang',
        draw: [TITLE('THE FEAST', 'orange'), D('bear', 30, 64, { scale: 2 }), D('bang', 30, 38, { id: 'i1' }), D('bear', 80, 64, { scale: 2 }), D('bear', 130, 64, { scale: 2 }), D('question', 130, 38, { id: 'i2' }), D('beaver', 172, 68, { scale: 2 }), D('bang', 172, 44, { id: 'i3' })],
        quiz: { id: 'icons', opts: ['i1', 'i2', 'i3'], ok: ['i1', 'i2', 'i3'], all: true, timer: 8,
          yes: 'Each icon: watch the scene, pick a **choice**. Ignore one ~**24 s** and it picks the **WORST** one!' } },
      { cam: 'teacher', say: '**Auto-cam** films it, **x3** speeds it up. But the money is in the icons!', expr: 'wink', react: 'cheer' },
    ],
  },
};
// old saves / lessons that still ask for Genetics get Smart Breeding
CLASS_LESSONS.genetics = CLASS_LESSONS.breeding;

export const CLASS_ORDER = ['money101', 'breeding', 'mutations', 'unlocking', 'weather', 'resortStaff', 'industry', 'feastClass'];
