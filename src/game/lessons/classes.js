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
        { cam: 'board', say: `Three things set a fish's price. **Size** is small change: XL is only **+40%**. **Colour** is big: Golden is **x5**.`, expr: 'greedy', react: 'bang',
          draw: [TITLE('WHAT SETS THE PRICE'), D('fish', 40, 46, { scale: 2 }), S('XL  X1.4', 40, 66, 'blue'), D('fish_gold', 100, 46, { scale: 2 }), S('GOLDEN  X5', 100, 66, 'yellow'), D('galaxy', 160, 46, { scale: 2 }), S(`GALAXY  X${gal}`, 160, 66, 'lilac')] },
        { say: `And **mutations**. Galaxy is **x${gal}**. They all multiply together.` },
        { erase: true, say: 'So: a plain **XL** Bluegill, or a small **Golden** one. Which pays more?',
          draw: [TITLE('WHICH PAYS MORE?'), D('fish', 50, 54, { scale: 2, id: 'xl' }), S('PLAIN, XL', 50, 74, 'blue', { id: 'xl_l' }), T('VS', 96, 54, { color: 'yellow' }), D('fish_gold', 142, 54, { id: 'gold' }), S('GOLDEN, SMALL', 142, 74, 'yellow', { id: 'gold_l' })],
          quiz: { id: 'hl', opts: ['xl', 'gold'], ok: 'gold',
            no: `Size only adds 40%: **${xl}**. Golden multiplies by five: **${gS}**, even small.`,
            yes: `Golden. **${gS}** against **${xl}**. Colour beats size every time.`,
            show: [T(`${xl}`, 50, 90), T(`${gS}`, 142, 90, { color: 'yellow' })] } },
        { erase: true, say: `A plain Bluegill pays **${b}**. Same fish, Galaxy mutant, **x${gal}**. What's the bill?`, expr: 'scheming',
          draw: [TITLE('WORK IT OUT', 'lilac'), T(`${b} X ${gal} =`, 46, 50, { scale: 2 }), T(`${b * 2}`, 112, 50, { scale: 2, id: 'g1' }), T(`${gX}`, 146, 50, { scale: 2, id: 'g2' }), T(`${b * 30}`, 178, 50, { scale: 1, id: 'g3' })],
          quiz: { id: 'galaxy', opts: ['g1', 'g2', 'g3'], ok: 'g2',
            no: `${b} times ${gal}. Do the sum, partner.`,
            yes: `**${gX}**. Make it Golden too and it's x${5 * gal}. That's one fish.` } },
        { erase: true, say: 'One more. A **fry** pays only a **third** of an adult. Drag the one you serve tonight onto the plate.',
          draw: [TITLE('WHO GETS SERVED?', 'orange'), D('minifish', 34, 52, { scale: 2, id: 'fry' }), S('FRY', 34, 72, 'blue', { id: 'fry_l' }), D('fish', 86, 52, { scale: 2, id: 'adult' }), S('ADULT', 86, 72, 'green', { id: 'adult_l' }), D('plate', 154, 64, { scale: 2, id: 'plate' })],
          quiz: { id: 'fry', opts: ['fry', 'adult'], ok: 'adult', drop: 'plate',
            no: 'A fry pays a third. Let it grow, sell it later for full price.',
            yes: `The adult. And a full bear tips up to **+${Math.round(TIP_5 * 100)}%** on top.` } },
        best
          ? { cam: 'teacher', say: `Your ${fishLabel(best)} pays **${fishPrice(game, best)}** a bite. I want more of those.`, expr: 'greedy' }
          : { cam: 'teacher', say: 'Breed for colour, feed the bears well. Off you go.', expr: 'proud' },
      ];
    },
  },

  // ------------------------------------------------------------------ SMART BREEDING (was Genetics + Selective Breeding)
  breeding: {
    title: 'Smart Breeding', number: 2, doodle: 'heart', color: 'pink',
    steps: (game) => {
      const gg = goldenBaby(game, true, true), ww = goldenBaby(game, false, false);
      return [
        { cam: 'board', say: 'A baby\'s size is about the **average** of its parents. Mum 1.0, dad 1.2: baby around 1.1.', expr: 'teacher', react: 'bang',
          draw: [TITLE('SIZE', 'pink'), D('fish_f', 40, 46, { scale: 2 }), S('1.0', 40, 64, 'pink'), D('fish_m', 150, 46, { scale: 2 }), S('1.2', 150, 64, 'blue'), { arrow: [60, 70, 86, 84] }, { arrow: [130, 70, 106, 84] }, T('BABY ~1.1', 96, 94, { color: 'yellow' })] },
        { erase: true, say: 'So which pair gives you the bigger babies?',
          draw: [TITLE('PICK A PAIR', 'pink'), D('fish_m', 30, 46), D('fish_f', 62, 46), S('1.00 + 1.10', 46, 62), { box: [12, 32, 68, 38], color: 'blue', id: 'pa' },
            D('fish_m', 128, 46, { scale: 2 }), D('fish_f', 172, 46), S('1.30 + 1.20', 150, 62), { box: [110, 30, 78, 40], color: 'pink', id: 'pb' }],
          quiz: { id: 'pair', opts: ['pa', 'pb'], ok: 'pb',
            no: 'Average of 1.0 and 1.1 is about 1.05. The other pair averages 1.25.',
            yes: 'About 1.25 against 1.05. Breed big with big.',
            show: [S('BABY ~1.05', 46, 82, 'blue'), S('BABY ~1.25', 148, 82, 'yellow')] } },
        { erase: true, say: `Colour: each **Golden** parent passes it on **38%** of the time. Two Golden parents: **${pct(gg)}**. Two plain ones: **${pct(ww)}**.`, expr: 'scheming',
          draw: [TITLE('GOLDEN ODDS', 'yellow'), D('fish_gold', 40, 46), D('fish_gold', 66, 46), S(pct(gg), 53, 64, 'yellow'), D('fish', 126, 46), D('fish', 152, 46), S(pct(ww), 139, 64)] },
        { erase: true, say: 'You want a Golden baby. Which parents do you pair up?',
          draw: [TITLE('PICK THE PARENTS', 'yellow'), D('fish', 30, 50), D('fish', 62, 50), { box: [14, 38, 64, 24], color: 'blue', id: 'q1' }, D('fish_gold', 128, 50), D('fish_gold', 160, 50), { box: [112, 38, 64, 24], color: 'yellow', id: 'q2' }],
          quiz: { id: 'gold', opts: ['q1', 'q2'], ok: 'q2',
            no: `Plain parents give a Golden baby only ${pct(ww)} of the time. Gold makes gold.`,
            yes: `Two Golden: **${pct(gg)}** instead of **${pct(ww)}**.` } },
        { erase: true, say: 'Three babies hatched. Keep the biggest for breeding and tag it **DO NOT EAT**. Which one?',
          draw: [TITLE('KEEP THE BEST', 'green'), D('minifish', 40, 50, { scale: 2, id: 'k1' }), S('0.99', 40, 70, 'white', { id: 'k1_l' }), D('minifish', 96, 50, { scale: 2, id: 'k2' }), S('1.02', 96, 70, 'white', { id: 'k2_l' }), D('minifish', 152, 50, { scale: 2, id: 'k3' }), S('1.14', 152, 70, 'white', { id: 'k3_l' })],
          quiz: { id: 'keep', opts: ['k1', 'k2', 'k3'], ok: 'k3',
            no: 'Smaller than its sibling at 1.14. That one becomes dinner.',
            yes: 'The 1.14. Tag it, and feed the other two to the bears.',
            show: [S('DINNER', 40, 84, 'red'), S('DINNER', 96, 84, 'red'), S('DO NOT EAT', 152, 84, 'green')] } },
        { cam: 'teacher', say: 'One more trick: **pet** both parents before the date. Better luck on every roll.', expr: 'wink' },
      ];
    },
  },

  // ------------------------------------------------------------------ MUTATIONS
  mutations: {
    title: 'Mutations!', number: 3, doodle: 'sparkle', color: 'lilac',
    steps: (game) => {
      const o0 = mutationOdds(game), o3 = mutationOdds(game, { arranged: true, food: 1 });
      return [
        { cam: 'board', say: `Most mutations multiply the bill: Shiny **x${mutX('shiny', 3)}**, Doge **x${mutX('doge', 4)}**, Galaxy **x${mutX('galaxy', 8)}**. Except **Tiny**: **x${mutX('tiny', 0.9)}**, and it's the most common.`, expr: 'excited', react: 'wow',
          draw: [TITLE('MUTATIONS', 'lilac'), D('sparkle', 28, 46, { scale: 2 }), S(`X${mutX('shiny', 3)}`, 28, 66, 'yellow'), D('doge', 74, 46, { scale: 2 }), S(`X${mutX('doge', 4)}`, 74, 66, 'yellow'), D('galaxy', 120, 46, { scale: 2 }), S(`X${mutX('galaxy', 8)}`, 120, 66, 'yellow'), D('tiny', 166, 48, { scale: 2 }), S(`X${mutX('tiny', 0.9)}`, 166, 66, 'red')] },
        { erase: true, say: 'Which of these makes a fish worth **less**?',
          draw: [TITLE('WHICH ONE LOSES MONEY?', 'lilac'), D('galaxy', 28, 50, { scale: 2, id: 'galaxy' }), D('doge', 74, 50, { scale: 2, id: 'doge' }), D('tiny', 120, 52, { scale: 2, id: 'tiny' }), D('sparkle', 166, 50, { scale: 2, id: 'shiny' })],
          quiz: { id: 'tiny', opts: ['galaxy', 'doge', 'tiny', 'shiny'], ok: 'tiny',
            no: 'That one multiplies the bill. Look for the one under x1.',
            yes: `Tiny, **x${mutX('tiny', 0.9)}**. Don't breed from Tiny fish.` } },
        { erase: true, say: `**Lucky food** raises the odds: Royal Pearls, Clovers, Moonberries. Feed both parents before the date and **${pct(o0.any)}** goes up to **${pct(o3.any)}** with the Matchmaker.`,
          draw: [TITLE('LUCKY FOOD', 'green'), D('pearl', 40, 50, { scale: 2 }), D('clover', 96, 50, { scale: 2 }), D('moonberry', 152, 50, { scale: 2 }), S(`${pct(o0.any)} > ${pct(o3.any)}`, 96, 80, 'yellow')] },
        { erase: true, say: 'Tap every food that raises mutation luck.',
          draw: [TITLE('LUCKY FOOD', 'green'), D('pearl', 22, 52, { scale: 2, id: 'pearl' }), D('pellet', 58, 54, { scale: 2, id: 'pellet' }), D('clover', 96, 52, { scale: 2, id: 'clover' }), D('worm', 134, 54, { scale: 2, id: 'worm' }), D('moonberry', 170, 52, { scale: 2, id: 'berry' })],
          quiz: { id: 'luck', opts: ['pearl', 'pellet', 'clover', 'worm', 'berry'], ok: ['pearl', 'clover', 'berry'], all: true,
            no: { pellet: 'Pellets just fill bellies.', worm: 'Worms feed fast. No luck in them.' },
            yes: 'Pearls, Clovers, Moonberries. And a mutant parent passes its mutation on **30%** of the time.' } },
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
        { cam: 'board', say: `Research in my lab is **free**. It only takes **time**, one project per bench. Rushing costs coins, about **${rush60}** a minute.`, expr: 'teacher', react: 'bang',
          draw: [TITLE('RESEARCH', 'green'), D('flask', 40, 50, { scale: 2 }), T('+', 70, 50, { scale: 2 }), D('timer', 96, 50, { scale: 2 }), T('= FREE', 150, 50, { scale: 2, color: 'yellow' })] },
        { erase: true, say: 'So what does a research project cost you if you just wait?',
          draw: [TITLE('IT COSTS...', 'green'), D('coin', 36, 50, { scale: 2, id: 'c' }), S('COINS', 36, 70, 'yellow', { id: 'c_l' }), D('timer', 96, 50, { scale: 2, id: 't' }), S('TIME', 96, 70, 'blue', { id: 't_l' }), D('fish', 156, 50, { scale: 2, id: 'f' }), S('FISH', 156, 70, 'pink', { id: 'f_l' })],
          quiz: { id: 'cost', opts: ['c', 't', 'f'], ok: 't',
            no: { c: 'Coins only if you rush. Waiting is free.', f: 'I don\'t take fish. I take time.' },
            yes: 'Time. So never leave a bench empty.' } },
        { erase: true, say: 'Locked sections of the tree need a **key**: a research node, a neighbour, and coins.',
          draw: [TITLE('SECTIONS', 'yellow'), D('lock', 40, 50, { scale: 2 }), { arrow: [60, 50, 80, 50] }, D('key', 104, 50, { scale: 2 }), S('NODE + NEIGHBOUR + COINS', 96, 80, 'yellow')] },
        { erase: true, say: 'A section is locked. What do you need?',
          draw: [TITLE('LOCKED', 'yellow'), D('lock', 30, 52, { scale: 2 }), { arrow: [50, 52, 66, 52] }, D('hammer', 88, 52, { scale: 2, id: 'h' }), D('key', 128, 52, { scale: 2, id: 'k' }), D('axe', 166, 52, { scale: 2, id: 'a' })],
          quiz: { id: 'key', opts: ['h', 'k', 'a'], ok: 'k',
            no: 'You don\'t break into my lab. You earn the key.',
            yes: next ? `The key. Yours for **${next.name}**: ${next.needs.map((n) => n.text).join(', ')}.` : 'The key. You\'ve opened them all already.' } },
        { cam: 'teacher', say: 'Neighbours live in the fog. Clear trees toward it and you\'ll meet them.', expr: 'proud' },
      ];
    },
  },

  // ------------------------------------------------------------------ the v26 systems
  weather: {
    title: 'Weather Report', number: 5, doodle: 'snowflake', color: 'blue',
    steps: () => [
      { cam: 'board', say: 'Below about **6°C** bears get cold. A cold bear loses patience and **leaves without paying**. Fire pits, heaters and hot tubs warm them up.', expr: 'worried', react: 'gasp',
        draw: [TITLE('COLD BEARS', 'blue'), D('thermo', 30, 50, { scale: 2 }), S('UNDER 6', 30, 72, 'blue'), D('fire', 96, 50, { scale: 2 }), D('tub', 150, 52, { scale: 2 }), S('WARM SPOTS', 122, 72, 'orange')] },
      { erase: true, say: 'This bear is freezing. Tap something that warms it.',
        draw: [TITLE('COLD BEAR', 'blue'), D('bear', 30, 52, { scale: 2 }), D('snowflake', 50, 34), D('fire', 80, 54, { scale: 2, id: 'fire' }), D('flower', 116, 54, { scale: 2, id: 'flower' }), D('tub', 152, 56, { scale: 2, id: 'tub' }), D('fence', 180, 58, { id: 'fence' })],
        quiz: { id: 'cold', opts: ['fire', 'flower', 'tub', 'fence'], ok: ['fire', 'tub'],
          no: 'That doesn\'t give off heat. Fire pit or hot tub.',
          yes: 'Put warm spots near where bears queue, and they stay to pay.' } },
      { erase: true, say: 'Winter frost kills tender crops outside. A **Greenhouse** keeps them growing.',
        draw: [TITLE('FROST', 'blue'), D('sprout', 40, 50, { scale: 2 }), { cross: [40, 50, 10] }, D('snowflake', 64, 34), { arrow: [76, 50, 110, 50] }, D('shop', 146, 48, { scale: 2 }), S('GREENHOUSE', 146, 72, 'green')] },
      { erase: true, say: 'Frost is coming for your carrots. What saves them?',
        draw: [TITLE('FROST', 'blue'), D('sprinkler', 40, 54, { scale: 2, id: 'sp' }), D('shop', 96, 52, { scale: 2, id: 'gh' }), S('GREENHOUSE', 96, 74, 'green', { id: 'gh_l' }), D('bunny', 152, 54, { scale: 2, id: 'bun' })],
        quiz: { id: 'frost', opts: ['sp', 'gh', 'bun'], ok: 'gh',
          no: 'That helps plants grow, not survive frost. Greenhouse.',
          yes: 'Greenhouse. The clock shows the forecast, so you see winter coming.' } },
    ],
  },
  resortStaff: {
    title: 'Resort & Staff', number: 6, doodle: 'beaver', color: 'orange',
    steps: () => [
      { cam: 'board', say: 'Bears also pay to **visit facilities**, and each one picks by need: cold goes to the **hot tub**, wet goes to the **towels**.', expr: 'scheming', react: 'bang',
        draw: [TITLE('FACILITIES', 'blue'), S('COLD > HOT TUB', 60, 44, 'orange'), S('WET > TOWELS', 60, 60, 'green'), S('BORED > PHOTO SPOT', 60, 76, 'pink'), D('coin', 160, 58, { scale: 2 }), S('EACH VISIT PAYS', 160, 80, 'yellow')] },
      { erase: true, say: 'This bear is soaked. Where does it go?',
        draw: [TITLE('WET BEAR', 'blue'), D('bear', 30, 50, { scale: 2 }), S('WET', 30, 72, 'blue'), T('HOT TUB', 120, 34, { id: 'r1' }), T('TOWELS', 120, 56, { id: 'r2' }), T('PHOTO SPOT', 120, 78, { id: 'r3' })],
        quiz: { id: 'wet', opts: ['r1', 'r2', 'r3'], ok: 'r2',
          no: 'Wet bears want towels. The hot tub is for cold ones.',
          yes: 'Towels. Build what your bears actually need and every visit pays.' } },
      { erase: true, say: 'Some buildings **need staff** to run at all. A Ticket Booth with no clerk sells nothing. Hire beavers at the **Interview Tent**.',
        draw: [TITLE('STAFF', 'orange'), D('tent', 40, 50, { scale: 2 }), { arrow: [62, 50, 84, 50] }, D('beaver', 108, 50, { scale: 2 }), D('shop', 160, 50, { scale: 2 }), S('NEEDS A CLERK', 160, 72, 'red')] },
      { erase: true, say: 'The Ticket Booth has no clerk. How many tickets does it sell?',
        draw: [TITLE('NO CLERK', 'orange'), D('shop', 40, 50, { scale: 2 }), { cross: [56, 36, 5] }, T('NONE', 110, 52, { id: 'n0' }), T('HALF', 146, 52, { id: 'n1' }), T('ALL', 178, 52, { id: 'n2' })],
        quiz: { id: 'clerk', opts: ['n0', 'n1', 'n2'], ok: 'n0',
          no: 'Nobody at the window, nobody buying. None.',
          yes: 'None. Hire, and a skilled, happy beaver works up to twice as fast.' } },
    ],
  },
  industry: {
    title: 'Power & Storage', number: 7, doodle: 'gear', color: 'yellow',
    steps: () => [
      { cam: 'board', say: 'Machines run on **power**. If they want more than you make, you get a **brownout**: everything runs slow. No power at all, they stop.', expr: 'teacher', react: 'bang',
        draw: [TITLE('POWER', 'yellow'), { line: [40, 84, 150, 84] }, { bar: [56, 84, 22, 40], color: 'green' }, S('SUPPLY', 67, 92), { bar: [112, 84, 22, 60], color: 'red' }, S('DEMAND', 123, 92)] },
      { erase: true, say: 'Your machines want more power than you make. What happens?',
        draw: [TITLE('DEMAND > SUPPLY', 'yellow'), T('FASTER', 96, 36, { id: 'p1' }), T('SLOWER', 96, 58, { id: 'p2' }), T('NOTHING', 96, 80, { id: 'p3' })],
        quiz: { id: 'brown', opts: ['p1', 'p2', 'p3'], ok: 'p2',
          no: 'Short on power means a brownout. Slower.',
          yes: 'Slower. Build more sun, wind or water wheels to fix it.' } },
      { erase: true, say: '**Poles** carry the power: one feeds machines **4 tiles** around it and links to the next pole up to **8 tiles** away.',
        draw: [TITLE('POLES', 'yellow'), { line: [30, 60, 160, 60] }, D('bolt', 30, 54), D('bolt', 96, 54), D('bolt', 160, 54), S('8 TILES', 64, 72, 'yellow'), S('8 TILES', 128, 72, 'yellow')] },
      { erase: true, say: 'This machine is too far from the power. Drag in what connects it.',
        draw: [TITLE('CONNECT IT', 'yellow'), D('bolt', 26, 54, { scale: 2 }), S('POWER', 26, 74, 'yellow'), { box: [76, 38, 30, 32], color: 'blue', id: 'gap' }, D('gear', 160, 54, { scale: 2 }), S('MACHINE', 160, 74, 'blue'),
          D('crate', 66, 94, { id: 'crate' }), D('bolt', 96, 94, { id: 'pole' }), D('flower', 126, 94, { id: 'flw' })],
        quiz: { id: 'pole', opts: ['crate', 'pole', 'flw'], ok: 'pole', drop: 'gap',
          no: 'Only a pole carries power.',
          yes: 'A pole. And when storage fills up, production stops, so build more sheds or sell.' } },
    ],
  },
  feastClass: {
    title: 'The Feast', number: 8, doodle: 'bear', color: 'orange',
    steps: () => [
      { cam: 'board', say: 'During the feast, **icons** pop up over bears and beavers. Tap one, watch, pick a choice. Leave it about **24 seconds** and it picks the **worst** choice itself.', expr: 'excited', react: 'bang',
        draw: [TITLE('THE FEAST', 'orange'), D('bang', 40, 40, { scale: 2 }), { arrow: [60, 46, 84, 46] }, D('magnifier', 104, 46, { scale: 2 }), { arrow: [124, 46, 144, 46] }, T('A  B', 166, 46, { color: 'green' }), D('timer', 96, 84), S('24 S > WORST', 140, 84, 'red')] },
      { erase: true, say: 'Three icons just popped up. Get to them before the clock runs out.',
        draw: [TITLE('ICONS!', 'orange'), D('bear', 30, 64, { scale: 2 }), D('bang', 30, 38, { id: 'i1' }), D('bear', 80, 64, { scale: 2 }), D('bear', 130, 64, { scale: 2 }), D('question', 130, 38, { id: 'i2' }), D('beaver', 172, 68, { scale: 2 }), D('bang', 172, 44, { id: 'i3' })],
        quiz: { id: 'icons', opts: ['i1', 'i2', 'i3'], ok: ['i1', 'i2', 'i3'], all: true, timer: 8,
          yes: 'That\'s the job at 5 PM. Auto-cam and x3 help, but the money is in those icons.' } },
    ],
  },
};
// old saves / lessons that still ask for Genetics get Smart Breeding
CLASS_LESSONS.genetics = CLASS_LESSONS.breeding;

export const CLASS_ORDER = ['money101', 'breeding', 'mutations', 'unlocking', 'weather', 'resortStaff', 'industry', 'feastClass'];
