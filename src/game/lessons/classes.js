// [v26 tutorial] Professor Reynard's classes after day 1 (src/game/Classroom.js).
// [v32 class] Rewritten to be genuinely educational: each class teaches the game rule AND the real
// idea behind it in a few punchy chalk steps (some with real 3D demos on the science table:
// `show3d`, src/game/classroom/demos.js), then a TEST PAPER (`test`, src/ui/testpaper/TestPaper.js)
// replaces the old pop quizzes. `steps(game)` / `test(game)` build the class when it starts, so the
// numbers are the player's own (src/game/lessons/econ.js). Real facts are short, accurate and
// kid-friendly. 'genetics' is part of 'breeding' (the id still works).
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
// a Punnett square for one gene: B (blue chalk) = plain, dominant; G (yellow chalk) = gold, recessive
const PUNNETT = (x, y) => [
  { grid: [x, y, 2, 2, 20, 14], color: 'white' },
  T('B', x + 10, y - 7, { color: 'blue' }), T('G', x + 30, y - 7, { color: 'yellow' }),
  T('B', x - 7, y + 7, { color: 'blue' }), T('G', x - 7, y + 21, { color: 'yellow' }),
  S('BB', x + 10, y + 7, 'blue'), S('BG', x + 30, y + 7, 'blue'), S('BG', x + 10, y + 21, 'blue'), S('GG', x + 30, y + 21, 'yellow', { id: 'gg' }),
];

export const CLASS_LESSONS = {
  // ------------------------------------------------------------------ MONEY 101: what sets the price
  money101: {
    title: 'Money 101', number: 4, doodle: 'coin', color: 'yellow', testTitle: 'Money 101',
    steps: (game) => {
      const gal = mutX('galaxy', 8);
      const best = bestFish(game, (f) => f.adult);
      return [
        { cam: 'board', say: `Three things set a fish's price. **Size** is small change: XL is only **+40%**. **Colour** is big: Golden is **x5**. **Mutations** too: Galaxy is **x${gal}**.`, expr: 'greedy', react: 'bang',
          draw: [TITLE('WHAT SETS THE PRICE'), D('fish', 40, 46, { scale: 2 }), S('XL  X1.4', 40, 66, 'blue'), D('fish_gold', 100, 46, { scale: 2 }), S('GOLDEN  X5', 100, 66, 'yellow'), D('galaxy', 160, 46, { scale: 2 }), S(`GALAXY  X${gal}`, 160, 66, 'lilac')] },
        { say: `And they **multiply**: a Golden Galaxy fish is x5 times x${gal}: **x${5 * gal}**. One fish!`, expr: 'magnifique', react: 'wow',
          draw: [T(`X5 X X${gal} = X${5 * gal}`, 96, 88, { color: 'yellow', id: 'mul' }), { underline: 'mul', color: 'pink', wavy: true }] },
        { erase: true, say: 'Why does colour pay so much? **Scarcity.** Things that are **rare** and **wanted** cost more. Gold coins, diamonds, a Golden fish.', expr: 'scheming',
          draw: [TITLE('RARE = PRICEY', 'yellow'), D('rock', 34, 50, { scale: 2 }), S('EVERYWHERE', 34, 70, 'blue'), S('CHEAP', 34, 80, 'blue'), D('pearl', 96, 50, { scale: 2 }), S('RARE', 96, 70, 'yellow'), S('PRICEY', 96, 80, 'yellow'),
            D('fish_gold', 156, 50, { scale: 2 }), S('RARE + WANTED', 156, 70, 'yellow'), S('$$$', 156, 80, 'yellow')] },
        { erase: true, say: 'A **fry** pays only about a **third** of an adult. Let it grow up first. And a full, happy bear tips up to **+' + Math.round(TIP_5 * 100) + '%** on top.', expr: 'teacher',
          draw: [TITLE('GROW, THEN SELL', 'orange'), D('minifish', 40, 50, { scale: 2 }), S('FRY: 1/3', 40, 70, 'blue'), { arrow: [62, 50, 92, 50] }, D('fish', 120, 50, { scale: 2 }), S('ADULT: FULL', 120, 70, 'green'), D('coin', 168, 50, { scale: 2 }), S(`+${Math.round(TIP_5 * 100)}% TIP`, 168, 70, 'yellow')] },
        { show3d: 'happyBears', cam: 'demo', hold: 2, expr: best ? 'greedy' : 'proud', react: 'cheer',
          say: best ? `Your best right now is a ${fishLabel(best)}: **${fishPrice(game, best)}** coins a bite. Breed more like it!` : 'Breed for colour, grow them big, keep the bears full. Off you go!' },
      ];
    },
    test: (game) => {
      const xl = priceOf(game, 'bluegill', plain(1.4)), gS = priceOf(game, 'bluegill', { ...plain(0.9), morph: 'golden' });
      return [
        { type: 'choice', q: 'Which pays more?', opts: ['a plain XL Bluegill', 'a small Golden Bluegill'], a: 1, why: `Golden! ${gS} vs ${xl}` },
        { type: 'match', q: 'Match each to its price boost.', pairs: [['Golden', `x5`], ['Galaxy', `x${mutX('galaxy', 8)}`], ['Size XL', 'x1.4']] },
        { type: 'tf', q: 'True or false?', items: [['A fry pays full price.', false], ['Rare things usually cost more.', true], ['Price boosts multiply together.', true]], why: ['Only a third!', null, null] },
      ];
    },
  },

  // ------------------------------------------------------------------ GENES & BREEDING (was Genetics + Selective Breeding)
  breeding: {
    title: 'Genes & Breeding', number: 5, doodle: 'dna', color: 'pink', testTitle: 'Genes & Breeding',
    steps: (game) => {
      const gg = goldenBaby(game, true, true), ww = goldenBaby(game, false, false);
      return [
        { cam: 'board', say: 'Every living thing carries **genes**: tiny instructions for size, colour, everything. They come in **pairs**: one copy from **mum**, one from **dad**.', expr: 'teacher', react: 'bang',
          draw: [TITLE('GENES', 'pink'), D('fish_f', 32, 44, { scale: 2 }), D('fish_m', 32, 78, { scale: 2 }), { arrow: [56, 46, 82, 56] }, { arrow: [56, 76, 82, 66] }, D('dna', 100, 61, { scale: 2 }), { arrow: [118, 61, 138, 61] }, D('minifish', 162, 61, { scale: 2 }), S('ONE FROM EACH', 160, 80, 'yellow')] },
        { erase: true, say: 'A **dominant** gene shows even if you have just one copy. A **recessive** gene hides unless you have **two**. In real guppies, **gold** colour is recessive.', expr: 'focused',
          draw: [TITLE('DOMINANT VS RECESSIVE', 'yellow'), S('B = PLAIN (DOMINANT)', 52, 34, 'blue'), S('G = GOLD (RECESSIVE)', 52, 46, 'yellow'), D('fish', 30, 76, { scale: 2 }), S('BG = PLAIN!', 30, 96, 'blue'), D('fish_gold', 96, 76, { scale: 2 }), S('GG = GOLD', 96, 96, 'yellow'), D('question', 150, 76, { scale: 2 }), S('HIDDEN GOLD', 158, 96, 'pink')] },
        { erase: true, say: 'Two plain parents can both secretly carry gold. Fill in the square: **one baby in four** gets two gold genes. Surprise, a Golden baby!', expr: 'excited', react: 'wow', tap: 'gg', highlight: 'circle',
          draw: [TITLE('PUNNETT SQUARE', 'pink'), S('MUM BG', 120, 26, 'pink'), S('DAD BG', 40, 54, 'blue'), ...PUNNETT(100, 40), S('1 IN 4 = GOLD', 150, 90, 'yellow')] },
        { show3d: 'courtship', cam: 'demo', labels: ['dad'], hold: 2, expr: 'love',
          say: `Our pond keeps it simpler. Each **Golden** parent passes gold on about **38%** of the time. Two Golden parents: **${pct(gg)}**. Two plain: just **${pct(ww)}**.` },
        { show3d: 'hatch', cam: 'demoClose', hold: 2.5, expr: 'teacher', react: 'cheer',
          say: 'A baby\'s **size** lands near the **average** of its parents. Big with big makes big babies. Keep the best, tag them **DO NOT EAT**, breed again!' },
        { erase: true, say: 'That\'s **selective breeding**: farmers have done it for thousands of years. It\'s how wild wolves became dogs and wild cabbage became broccoli!', expr: 'magnifique',
          draw: [TITLE('SELECTIVE BREEDING', 'green'), D('fish', 30, 50), D('fish', 30, 64), { arrow: [44, 57, 62, 57] }, D('fish_star', 84, 57, { scale: 2 }), { arrow: [104, 57, 122, 57] }, D('fish_star', 140, 50), D('fish_star', 160, 64), D('crown', 176, 40), S('BEST X BEST', 96, 84, 'yellow')] },
        { cam: 'teacher', say: 'Pro tip: **pet** both parents before the date. Happy fish, luckier babies.', expr: 'wink' },
      ];
    },
    test: (game) => {
      const gg = goldenBaby(game, true, true), ww = goldenBaby(game, false, false);
      return [
        { type: 'choice', q: 'A baby gets its genes from...', opts: ['mum only', 'dad only', 'both parents'], a: 2, why: 'One copy from each!' },
        { type: 'match', q: 'Match each word to its meaning.', pairs: [['Dominant', 'shows with one copy'], ['Recessive', 'needs two copies'], ['Gene', 'a tiny instruction']] },
        { type: 'tf', q: 'True or false?', items: [['Two plain fish can have a gold baby.', true], [`Two Golden parents give the best odds.`, gg > ww], ['A baby is always bigger than both parents.', false]], why: [null, null, 'About the average!'] },
        { type: 'order', q: 'Number the selective breeding steps.', steps: ['Pick the best', 'Breed them', 'Keep the best babies', 'Repeat'], why: 'Pick, breed, keep, repeat!' },
      ];
    },
  },

  // ------------------------------------------------------------------ MUTATIONS
  mutations: {
    title: 'Mutations!', number: 6, doodle: 'sparkle', color: 'lilac', testTitle: 'Mutations',
    steps: (game) => {
      const o0 = mutationOdds(game), o3 = mutationOdds(game, { arranged: true, food: 1 });
      return [
        { cam: 'board', say: 'A **mutation** is a random change in a gene, like a typo when the instructions are copied. Most do nothing. Some cause trouble. A few are **amazing**.', expr: 'excited', react: 'wow',
          draw: [TITLE('MUTATIONS', 'lilac'), D('dna', 40, 52, { scale: 2 }), T('TYPO!', 40, 76, { color: 'red' }), { arrow: [62, 52, 84, 52] }, D('question', 104, 52, { scale: 2 }), { arrow: [122, 52, 140, 52] }, D('galaxy', 162, 52, { scale: 2 }), S('NEW!', 162, 74, 'yellow')] },
        { say: 'Every new colour and shape in nature started out as a mutation. Without them there would be nothing new to breed for!', expr: 'magnifique',
          draw: [S('EVERY NEW KIND STARTS HERE', 96, 92, 'yellow', { id: 'all' }), { underline: 'all', color: 'pink', wavy: true }] },
        { erase: true, say: `In our pond most mutations **multiply** the bill: Shiny **x${mutX('shiny', 3)}**, Doge **x${mutX('doge', 4)}**, Galaxy **x${mutX('galaxy', 8)}**. But **Tiny** is **x${mutX('tiny', 0.9)}**: it loses money!`, expr: 'greedy',
          draw: [TITLE('IN OUR POND', 'lilac'), D('sparkle', 28, 46, { scale: 2 }), S(`X${mutX('shiny', 3)}`, 28, 66, 'yellow'), D('doge', 74, 46, { scale: 2 }), S(`X${mutX('doge', 4)}`, 74, 66, 'yellow'), D('galaxy', 120, 46, { scale: 2 }), S(`X${mutX('galaxy', 8)}`, 120, 66, 'yellow'), D('tiny', 166, 48, { scale: 2 }), S(`X${mutX('tiny', 0.9)}`, 166, 66, 'red'), { cross: [166, 82, 5] }] },
        { erase: true, say: `**Lucky food** raises the odds: Royal Pearls, Clovers, Moonberries. Feed both parents before the date: **${pct(o0.any)}** goes up to **${pct(o3.any)}** with the Matchmaker. A mutant parent passes its mutation on **30%** of the time.`, expr: 'scheming',
          draw: [TITLE('LUCK UP', 'green'), D('pearl', 40, 50, { scale: 2 }), D('clover', 96, 50, { scale: 2 }), D('moonberry', 152, 50, { scale: 2 }), S(`${pct(o0.any)} > ${pct(o3.any)}`, 96, 78, 'yellow')] },
        { show3d: 'hatch', cam: 'demoClose', hold: 2, expr: 'excited', react: 'cheer', say: 'Every egg is a roll of the dice. Collect every new morph in your **Encyclopedia**!' },
      ];
    },
    test: () => [
      { type: 'choice', q: 'A mutation is...', opts: ['a random change in a gene', 'a kind of fish food', 'a disease'], a: 0, why: 'A gene "typo"!' },
      { type: 'match', q: 'Match each mutation to its price.', pairs: [['Galaxy', `x${mutX('galaxy', 8)}`], ['Shiny', `x${mutX('shiny', 3)}`], ['Tiny', `x${mutX('tiny', 0.9)}`]] },
      { type: 'tf', q: 'True or false?', items: [['Most mutations are amazing.', false], ['Lucky food raises the odds.', true], ['New kinds of living things start with mutations.', true]], why: ['Most do nothing!', null, null] },
    ],
  },

  // ------------------------------------------------------------------ UNLOCKING (research = science)
  unlocking: {
    title: 'Research Lab', number: 7, doodle: 'flask', color: 'green', testTitle: 'Research',
    steps: (game) => {
      const next = (() => { try { return game.researchSections?.().find((k) => k && !k.open); } catch { return null; } })();
      const rush60 = researchRushPrice({ tier: 0 }, 60);
      return [
        { cam: 'board', say: 'Real science runs on the **scientific method**: ask a **question**, make a **guess**, **test** it, and **learn** from what happens. Then do it again!', expr: 'teacher', react: 'bang',
          draw: [TITLE('SCIENCE!', 'green'), D('question', 24, 50, { scale: 2 }), S('ASK', 24, 70, 'yellow'), { arrow: [38, 50, 54, 50] }, D('magnifier', 72, 50, { scale: 2 }), S('GUESS', 72, 70, 'blue'), { arrow: [86, 50, 102, 50] },
            D('flask', 120, 50, { scale: 2 }), S('TEST', 120, 70, 'pink'), { arrow: [134, 50, 150, 50] }, D('book', 168, 50, { scale: 2 }), S('LEARN', 168, 70, 'green')] },
        { erase: true, say: `Tests take **time**. In my lab, research is **free**: you just wait, one project per bench. Rushing costs coins, about **${rush60}** a minute. Never leave a bench empty!`, expr: 'smug',
          draw: [TITLE('RESEARCH', 'green'), D('flask', 40, 50, { scale: 2 }), T('+', 70, 50, { scale: 2 }), D('timer', 96, 50, { scale: 2 }), T('= FREE', 150, 50, { scale: 2, color: 'yellow' }), S(`RUSH: ${rush60} A MINUTE`, 96, 80, 'orange')] },
        { erase: true, say: 'Locked sections of the tree need a **key**: a research node, a neighbour, and some coins.', expr: 'teacher',
          draw: [TITLE('SECTIONS', 'yellow'), D('lock', 40, 50, { scale: 2 }), { arrow: [60, 50, 80, 50] }, D('key', 104, 50, { scale: 2 }), S('NODE + NEIGHBOUR + COINS', 96, 80, 'yellow')] },
        { cam: 'teacher', say: next ? `Your next one, **${next.name}**, needs: ${next.needs.map((n) => n.text).join(', ')}. Neighbours live in the fog: clear trees toward it.` : 'Neighbours live in the fog. Clear trees toward it and you\'ll meet them.', expr: 'proud' },
      ];
    },
    test: () => [
      { type: 'order', q: 'Number the scientific method.', steps: ['Ask a question', 'Make a guess', 'Test it', 'Learn'], why: 'Ask, guess, test, learn!' },
      { type: 'choice', q: 'If you just wait, research in the lab costs...', opts: ['coins', 'time', 'fish'], a: 1, why: 'Only time!' },
      { type: 'tf', q: 'True or false?', items: [['A good scientist tests their guess.', true], ['A locked section needs a key.', true], ['An empty bench is fine.', false]], why: [null, null, 'Keep benches busy!'] },
    ],
  },

  // ------------------------------------------------------------------ WEATHER
  weather: {
    title: 'Weather Report', number: 8, doodle: 'snowflake', color: 'blue', testTitle: 'Weather',
    steps: () => [
      { cam: 'board', say: 'Wild bears stay warm with **thick fur** that traps warm air and a layer of **fat**, like a built-in blanket.', expr: 'teacher', react: 'bang',
        draw: [TITLE('STAYING WARM', 'blue'), D('bear', 50, 52, { scale: 2 }), S('THICK FUR', 50, 74, 'orange'), S('+ FAT', 50, 84, 'yellow'), D('snowflake', 120, 40), D('snowflake', 150, 56), D('snowflake', 132, 72)] },
      { erase: true, say: 'Our bears wear **suits**, not winter coats. Below about **6°C** they get cold, lose patience and **leave without paying**. Fire pits, heaters and hot tubs warm them up.', expr: 'worried', react: 'gasp',
        draw: [TITLE('COLD BEARS', 'blue'), D('thermo', 30, 50, { scale: 2 }), S('UNDER 6', 30, 72, 'blue'), D('fire', 96, 50, { scale: 2 }), D('tub', 150, 52, { scale: 2 }), S('WARM SPOTS', 122, 72, 'orange')] },
      { erase: true, say: '**Frost**: water inside a plant freezes into sharp ice crystals that burst its cells. A **greenhouse** lets sunlight in and traps the heat, so crops keep growing.', expr: 'focused',
        draw: [TITLE('FROST', 'blue'), D('sprout', 36, 50, { scale: 2 }), { cross: [36, 50, 10] }, D('snowflake', 60, 34), { arrow: [72, 50, 104, 50] }, D('sun', 128, 30), D('shop', 146, 50, { scale: 2 }), S('GREENHOUSE', 146, 72, 'green')] },
      { cam: 'teacher', say: 'The clock shows the **forecast**, so you can see winter coming. Plan ahead!', expr: 'wink' },
    ],
    test: () => [
      { type: 'choice', q: 'A wild bear stays warm thanks to...', opts: ['a scarf', 'thick fur and fat', 'hot soup'], a: 1, why: 'Fur and fat!' },
      { type: 'match', q: 'Match the problem to the fix.', pairs: [['A cold bear', 'a fire pit'], ['Frost on crops', 'a greenhouse'], ['Winter coming', 'the forecast']] },
      { type: 'tf', q: 'True or false?', items: [['Cold bears leave without paying.', true], ['Ice crystals can burst plant cells.', true], ['A greenhouse keeps the sun out.', false]], why: [null, null, 'It lets sun in!'] },
    ],
  },

  // ------------------------------------------------------------------ RESORT & STAFF
  resortStaff: {
    title: 'Resort & Staff', number: 9, doodle: 'beaver', color: 'orange', testTitle: 'Resort & Staff',
    steps: () => [
      { cam: 'board', say: 'Bears also pay to **visit facilities**, and each picks by **need**: cold goes to the **hot tub**, wet goes to the **towels**, bored goes to the **photo spot**.', expr: 'scheming', react: 'bang',
        draw: [TITLE('FACILITIES', 'blue'), S('COLD > HOT TUB', 60, 44, 'orange'), S('WET > TOWELS', 60, 60, 'green'), S('BORED > PHOTO SPOT', 60, 76, 'pink'), D('coin', 160, 58, { scale: 2 }), S('EACH VISIT PAYS', 160, 80, 'yellow')] },
      { erase: true, say: 'Nature splits jobs too. In a **beehive**, some bees clean, some feed the babies, some guard the door, some fetch food. Teamwork!', expr: 'happy',
        draw: [TITLE('TEAMWORK', 'yellow'), D('honey', 40, 50, { scale: 2 }), S('CLEAN', 96, 36, 'white'), S('FEED BABIES', 96, 48, 'pink'), S('GUARD', 96, 60, 'red'), S('FETCH FOOD', 96, 72, 'green'), D('beaver', 160, 54, { scale: 2 })] },
      { erase: true, say: 'Some buildings need **staff** to run at all: a Ticket Booth with no clerk sells **nothing**. Hire beavers at the **Interview Tent**. Skilled, happy beavers work up to twice as fast.', expr: 'teacher',
        draw: [TITLE('STAFF', 'orange'), D('tent', 40, 50, { scale: 2 }), { arrow: [62, 50, 84, 50] }, D('beaver', 108, 50, { scale: 2 }), D('shop', 160, 50, { scale: 2 }), S('NEEDS A CLERK', 160, 72, 'red')] },
    ],
    test: () => [
      { type: 'match', q: 'Where does each bear go?', pairs: [['A cold bear', 'the hot tub'], ['A wet bear', 'the towels'], ['A bored bear', 'the photo spot']] },
      { type: 'choice', q: 'A Ticket Booth with no clerk sells...', opts: ['nothing', 'half', 'everything'], a: 0, why: 'Hire a clerk!' },
      { type: 'tf', q: 'True or false?', items: [['Bees in a hive split up the jobs.', true], ['Happy, skilled beavers work faster.', true]] },
    ],
  },

  // ------------------------------------------------------------------ POWER & STORAGE
  industry: {
    title: 'Power & Storage', number: 10, doodle: 'gear', color: 'yellow', testTitle: 'Power & Storage',
    steps: () => [
      { cam: 'board', say: 'Electricity can come from the **sun** (solar panels), the **wind** (turbines) and moving **water** (water wheels). These never run out: they\'re **renewable**.', expr: 'teacher', react: 'bang',
        draw: [TITLE('POWER', 'yellow'), D('sun', 36, 48, { scale: 2 }), S('SUN', 36, 68, 'yellow'), D('gear', 96, 48, { scale: 2 }), S('WIND', 96, 68, 'white'), D('tank', 156, 48, { scale: 2 }), S('WATER', 156, 68, 'blue'), D('bolt', 96, 88, { scale: 2 })] },
      { erase: true, say: 'If machines want more power than you make, you get a **brownout**: the power gets weak and everything runs **slow**. No power at all, they stop.', expr: 'worried',
        draw: [TITLE('BROWNOUT', 'yellow'), { line: [40, 84, 150, 84] }, { bar: [56, 84, 22, 40], color: 'green' }, S('SUPPLY', 67, 92), { bar: [112, 84, 22, 60], color: 'red' }, S('DEMAND', 123, 92), T('SLOW!', 170, 50, { color: 'red' })] },
      { erase: true, say: 'Power only flows through a complete path, a **circuit**. Here **poles** carry it: one feeds machines **4 tiles** around it and links to the next pole up to **8 tiles** away.', expr: 'focused',
        draw: [TITLE('CIRCUITS', 'yellow'), { line: [30, 60, 160, 60] }, D('bolt', 30, 54), D('bolt', 96, 54), D('bolt', 160, 54), S('8 TILES', 64, 72, 'yellow'), S('8 TILES', 128, 72, 'yellow')] },
      { cam: 'teacher', say: 'And when **storage** fills up, production stops. Build more sheds, or sell!', expr: 'smug' },
    ],
    test: () => [
      { type: 'match', q: 'Match the power source.', pairs: [['Sunlight', 'solar panel'], ['Wind', 'turbine'], ['A river', 'water wheel']] },
      { type: 'choice', q: 'Machines want more power than you make. They run...', opts: ['faster', 'slower', 'the same'], a: 1, why: 'A brownout: slower!' },
      { type: 'tf', q: 'True or false?', items: [['Power needs a complete circuit.', true], ['Sun and wind run out.', false], ['Full storage stops production.', true]], why: [null, 'They\'re renewable!', null] },
    ],
  },

  // ------------------------------------------------------------------ THE FEAST
  feastClass: {
    title: 'The Feast', number: 11, doodle: 'bear', color: 'orange', testTitle: 'The Feast',
    steps: () => [
      { cam: 'board', say: 'During the feast, **icons** pop up over bears and beavers. Tap one, watch, pick a choice. Leave it about **24 seconds** and it picks the **worst** choice itself.', expr: 'excited', react: 'bang',
        draw: [TITLE('THE FEAST', 'orange'), D('bang', 40, 40, { scale: 2 }), { arrow: [60, 46, 84, 46] }, D('magnifier', 104, 46, { scale: 2 }), { arrow: [124, 46, 144, 46] }, T('A  B', 166, 46, { color: 'green' }), D('timer', 96, 84), S('24 S > WORST', 140, 84, 'red')] },
      { erase: true, say: 'Doctors have a word for this: **triage**. When everything happens at once, handle the most **urgent** problem first.', expr: 'teacher',
        draw: [TITLE('TRIAGE', 'red'), S('1. URGENT', 60, 40, 'red'), S('2. SOON', 60, 56, 'orange'), S('3. LATER', 60, 72, 'green'), D('bang', 150, 56, { scale: 2 })] },
      { show3d: 'bears', cam: 'demoTop', hold: 3, expr: 'excited', say: 'Auto-cam and x3 help, but the money is in those **icons**. Ready for five o\'clock?' },
    ],
    test: () => [
      { type: 'choice', q: 'Ignore a feast icon for about 24 seconds and...', opts: ['it goes away', 'it picks the worst choice', 'you get a bonus'], a: 1, why: 'The worst choice!' },
      { type: 'choice', q: 'Triage means handling first...', opts: ['the easiest thing', 'the most urgent thing', 'the cheapest thing'], a: 1, why: 'Most urgent first!' },
      { type: 'order', q: 'Number what to do with an icon.', steps: ['Spot it', 'Tap it', 'Watch', 'Pick a choice'], why: 'Spot, tap, watch, pick!' },
    ],
  },
};
// old saves / lessons that still ask for Genetics get Genes & Breeding
CLASS_LESSONS.genetics = CLASS_LESSONS.breeding;

export const CLASS_ORDER = ['money101', 'breeding', 'mutations', 'unlocking', 'weather', 'resortStaff', 'industry', 'feastClass'];
