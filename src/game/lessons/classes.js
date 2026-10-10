// [v26 tutorial] Professor Reynard's SMART classes: the full chalkboard lessons
// (src/game/Classroom.js) about money, genes, mutations, selective breeding,
// unlocking, and short ones for the v26 systems. `steps(game)` builds the
// lesson when it starts, so every number on the board is the player's own
// (their mods, their fish) via src/game/lessons/econ.js. Diagrams are drawn
// with the chalkboard's own strokes: bar charts (`bar`), a Punnett-style
// square (`grid`), a family tree (lines + doodles).
import { measureText } from '../../ui/Chalkboard.js';
import {
  priceOf, plain, mutationOdds, goldenBaby, morphOdds, pct, starParts, bestFish, fishPrice, fishLabel,
  TIP_4, TIP_5, MORPHS, MUTATIONS, SPECIES_BY_ID,
} from './econ.js';
import { researchRushPrice } from '../../data/research.js';

const T = (text, x, y, o = {}) => ({ text, x, y, ...o });
const D = (doodle, x, y, o = {}) => ({ doodle, x, y, ...o });
const TITLE = (text, color = 'yellow', o = {}) => ({ text, x: 96, y: 9, scale: measureText(text, 2).w <= 184 ? 2 : 1, color, id: 'title', ...o });
const S = (t, x, y, color = 'white', o = {}) => T(t, x, y, { font: 'small', color, ...o });
const up = (s) => String(s).toUpperCase();

// the cheapest fish you can show prices with (always a Bluegill)
const base = (game) => priceOf(game, 'bluegill', plain(1));

export const CLASS_LESSONS = {
  // ------------------------------------------------------------------ MONEY 101
  money101: {
    title: 'Money 101', number: 1, doodle: 'coin', color: 'yellow',
    steps: (game) => {
      const b = base(game);
      const chart = [['normal', 'WILD'], ['albino', 'ALBINO'], ['calico', 'CALICO'], ['ghost', 'GHOST'], ['golden', 'GOLD'], ['rainbow', 'PRISM']];
      const best = bestFish(game, (f) => f.adult);
      return [
        { cam: 'board', say: 'Class! My favourite subject: **MONEY**. Where does it come from?', expr: 'greedy', react: 'bang',
          draw: [TITLE('MONEY 101'), D('fish', 36, 44, { scale: 2 }), { arrow: [58, 44, 78, 44] }, D('bear', 100, 44, { scale: 2 }), { arrow: [122, 44, 142, 44] }, D('coin', 164, 44, { scale: 2, id: 'coin' }),
            S('YOU BREED', 36, 64, 'blue'), S('5 PM FEAST', 100, 64, 'orange'), S('ONE BILL', 164, 64, 'yellow')] },
        { say: `ONE thing pays: bears eating **fish** at 5. A plain Bluegill = **${b} coins** a bite.`, tap: 'coin',
          draw: [D('fish', 70, 88), T('=', 92, 88, { scale: 2 }), T(`${b}`, 112, 88, { scale: 2, color: 'yellow', id: 'b' }), D('coin', 134, 88)] },
        { erase: true, say: 'Now the fun part: what **MULTIPLIES** the bill. Colour **morphs**!', react: 'wow',
          draw: [TITLE('WHAT PAYS MORE'), { line: [8, 90, 186, 90] },
            ...chart.flatMap(([m, lbl], i) => {
              const v = MORPHS[m].value, h = Math.max(3, Math.round((v / 8) * 50)), x = 12 + i * 30;
              return [{ bar: [x, 90, 16, h], color: v >= 5 ? 'yellow' : v >= 2 ? 'lilac' : 'blue', id: 'b' + i }, S(lbl, x + 8, 98), T(`${Math.round(b * v)}`, x + 8, 90 - h - 6, { color: v >= 5 ? 'yellow' : 'white' })];
            })] },
        { say: `Golden pays **x5** (${b * 5}). Prismatic **x8** (${b * 8}). Same fish, same bite!`, tap: ['b4', 'b5'], highlight: 'circle', expr: 'greedy', react: 'wow' },
        { erase: true, say: '**Size** and **mutations** multiply too. Size is a plain multiplier: XL 1.4 = **+40%**.',
          draw: [TITLE('SIZE + MUTATIONS', 'blue'), D('tiny', 24, 40), S('S 0.9', 24, 52), D('fish', 62, 40), S('M 1.0', 62, 52), D('fish', 112, 38, { scale: 2, id: 'xl' }), S('XL 1.4', 112, 56, 'yellow'),
            S(`${Math.round(b * 0.9)}`, 24, 60, 'yellow'), S(`${b}`, 62, 60, 'yellow'), S(`${Math.round(b * 1.4)}`, 150, 40, 'yellow'),
            D('sparkle', 26, 82), S('SHINY X3', 26, 94, 'yellow'), D('doge', 72, 82), S('DOGE X4', 72, 94, 'orange'), D('galaxy', 120, 82, { id: 'gal' }), S('GALAXY X8', 120, 94, 'lilac'), S('CHONKY +35%', 168, 82, 'green')] },
        { say: 'Stack them! A Golden Galaxy XL: 5 x 8 x 1.4 = **x56**. One bite. Imagine.', tap: 'gal', expr: 'love', react: 'wow',
          draw: [] },
        { erase: true, say: 'And **STARS**? Stars are just the **label**. Size, colour and mutation ARE the price.', expr: 'wink',
          draw: [TITLE('STARS = LABEL', 'pink'), ...[0, 1, 2, 3, 4].map((i) => ({ star: [60 + i * 18, 38, 6] })), T('JUST THE LABEL', 96, 54, { color: 'pink', id: 'lbl' }),
            T('SIZE X MORPH X MUTATION', 96, 76, { color: 'yellow' }), T('= THE PRICE', 96, 90, { color: 'yellow', id: 'price' }), { underline: 'price', color: 'yellow' }] },
        { erase: true, say: `Full bears **TIP**: a 4-star review adds **+${TIP_4 * 100}%**, 5 stars **+${TIP_5 * 100}%** of the bill.`, react: 'cheer',
          draw: [TITLE('TIPS', 'green'), D('review', 26, 40), ...[0, 1, 2, 3].map((i) => ({ star: [48 + i * 13, 40, 5] })), T(`+${TIP_4 * 100}%`, 150, 40, { color: 'green' }),
            D('review', 26, 62), ...[0, 1, 2, 3, 4].map((i) => ({ star: [48 + i * 13, 62, 5] })), T(`+${TIP_5 * 100}%`, 150, 62, { color: 'yellow', id: 't5' })] },
        { say: 'Bears rate how **full** they got, plus the **side dish** they wanted. Honey, syrup: up to 12 coins bonus!', tap: 't5',
          draw: [D('honey', 40, 90), D('syrup', 64, 90), D('mushroom', 88, 90), T('+BONUS TIP', 146, 90, { color: 'green' })] },
        { erase: true, say: 'Good **rating** = MORE bears. 4.5 stars brings **+25%** bears. Under 2? Only **70%**.', expr: 'proud',
          draw: [TITLE('RATING = MORE BEARS'), { line: [16, 90, 176, 90] },
            ...[['1', 0.7], ['2', 0.85], ['3', 1], ['4', 1.1], ['4.5', 1.25]].flatMap(([r, k], i) => {
              const x = 20 + i * 32, h = Math.round(k * 40);
              return [{ bar: [x, 90, 18, h], color: k >= 1.1 ? 'green' : k < 1 ? 'red' : 'blue' }, S(`${r} STAR`, x + 9, 98), S(`X${k}`, x + 9, 90 - h - 5, 'yellow')];
            })] },
        { erase: true, dim: 0.5, say: 'Money **WASTERS**: fry pay a **third**, hungry fish **never breed**, and **rampages** get 0 stars.', expr: 'angry', react: 'gasp', cutaway: false,
          draw: [TITLE('MONEY WASTERS', 'red'), D('minifish', 34, 44, { scale: 2 }), S('FRY PAY 1/3', 34, 62, 'orange'), D('fish_hungry', 96, 44, { scale: 2 }), S('NO BABIES', 96, 62, 'orange'),
            D('smash', 158, 44, { scale: 2 }), S('0 STARS', 158, 62, 'red'), T('LET THEM GROW UP!', 96, 86, { color: 'yellow' })] },
        best
          ? { cam: 'teacher', say: `Your best right now: a ${fishLabel(best)}, **${best.g.stars}** stars: **${fishPrice(game, best)}** coins a bite. Make MORE of those!`, expr: 'greedy', react: 'cheer' }
          : { cam: 'teacher', say: 'Homework: breed big, breed rare, keep bears full. Class dismissed!', expr: 'proud', react: 'cheer' },
      ];
    },
  },

  // ------------------------------------------------------------------ GENETICS
  genetics: {
    title: 'Genetics', number: 2, doodle: 'dna', color: 'blue',
    steps: (game) => {
      const gg = goldenBaby(game, true, true), gw = goldenBaby(game, true, false), ww = goldenBaby(game, false, false);
      const best = bestFish(game);
      const sp = best ? starParts(best.sp.id, best.g) : null;
      return [
        { cam: 'board', say: 'Every fish carries **genes**: sex, size, colour, traits and maybe a mutation.', expr: 'teacher', react: 'bang',
          draw: [TITLE('GENETICS', 'blue'), D('fish_f', 32, 40, { id: 'mum' }), D('fish_m', 32, 72, { id: 'dad' }), { arrow: [50, 44, 76, 54] }, { arrow: [50, 70, 76, 60] },
            D('dna', 96, 56, { scale: 2, id: 'dna' }), { arrow: [114, 56, 138, 56] }, D('minifish', 162, 56, { scale: 2, id: 'baby' })] },
        { erase: true, say: 'SIZE: baby = the **average** of mum and dad, nudged a tiny bit (about 0.07).', tap: 'avg',
          draw: [TITLE('SIZE', 'blue'), D('fish_f', 40, 40, { scale: 2 }), T('1.00', 40, 60, { color: 'pink' }), D('fish_m', 150, 40, { scale: 2 }), T('1.20', 150, 60, { color: 'blue' }),
            { arrow: [62, 70, 88, 84] }, { arrow: [128, 70, 104, 84] }, T('BABY ~1.10', 96, 94, { color: 'yellow', id: 'avg' })] },
        { say: 'So big parents make big babies. Small parents? Small. Genes do not lie.', expr: 'smug' },
        { erase: true, say: 'COLOUR: each parent with a **morph** passes it on **38%** of the time.',
          draw: [TITLE('GOLDEN ODDS', 'yellow'), S('DAD', 52, 26, 'blue'), S('MUM', 26, 62, 'pink'), { grid: [72, 36, 2, 2, 46, 26], id: 'sq' },
            D('fish_gold', 95, 27), D('fish', 141, 27), D('fish_gold', 56, 49), D('fish', 56, 75),
            T(pct(gg), 95, 49, { color: 'yellow', id: 'gg' }), T(pct(gw), 141, 49, { color: 'orange' }), T(pct(gw), 95, 75, { color: 'orange' }), T(pct(ww), 141, 75, { id: 'ww' }),
            S('CHANCE OF A GOLDEN BABY', 118, 98, 'white')] },
        { say: `Two Golden parents: **${pct(gg)}** Golden babies. Two plain ones: **${pct(ww)}**. Breed gold to get gold!`, tap: ['gg', 'ww'], highlight: 'circle', expr: 'greedy', react: 'wow' },
        { erase: true, say: 'TRAITS pass **45%** each. Good ones add stars, bad ones cost a little.',
          draw: [TITLE('TRAITS', 'green'), ...[['FERTILE', 'pink'], ['CHONKY', 'orange'], ['SPEEDY', 'blue'], ['LUCKY', 'green'], ['SPARKLY', 'yellow'], ['HARDY', 'white']]
            .map(([w, c], i) => T(w, 34 + (i % 3) * 62, 38 + Math.floor(i / 3) * 14, { color: c })), T('+0.8 STAR', 96, 70, { color: 'green' }),
            T('GLUTTON', 60, 88, { color: 'red' }), T('SHY', 120, 88, { color: 'lilac' }), S('-0.4', 156, 88, 'red')] },
        { erase: true, say: 'STARS just add it all up: species, size, colour, mutation, traits.',
          draw: [TITLE('STARS ADD UP', 'yellow'), T('1 + SPECIES + SIZE X5', 96, 36, { color: 'white' }), T('+ MORPH + MUTATION', 96, 52, { color: 'lilac' }), T('+ TRAITS = STARS', 96, 68, { color: 'yellow', id: 'sum' }),
            ...(sp ? [S(`YOURS: ${up(fishLabel(best))}`, 96, 84, 'green'), S(sp.parts.map((p) => (p.k === 'base' ? '1' : `${p.v >= 0 ? '+' : ''}${p.v.toFixed(1)}`)).join(' ') + ` = ${sp.stars}`, 96, 96, 'green')] : [])] },
        { cam: 'teacher', say: 'Pro tip: **pet** both parents. Nurtured parents roll everything with **x1.6 luck**!', expr: 'wink', react: 'heart' },
      ];
    },
  },

  // ------------------------------------------------------------------ MUTATIONS
  mutations: {
    title: 'Mutations!', number: 3, doodle: 'sparkle', color: 'lilac',
    steps: (game) => {
      const o0 = mutationOdds(game), o1 = mutationOdds(game, { nurtured: true }), o2 = mutationOdds(game, { arranged: true }), o3 = mutationOdds(game, { arranged: true, food: 1 });
      const rows = ['tiny', 'hot', 'shiny', 'doge', 'galaxy'];
      return [
        { cam: 'board', say: 'Sometimes genes **MUTATE**. Rare mutations multiply the bill!', expr: 'excited', react: 'wow',
          draw: [TITLE('MUTATIONS!', 'lilac'), { grid: [20, 22, 3, 5, 52, 16] },
            ...rows.flatMap((id, i) => {
              const m = MUTATIONS[id], y = 30 + i * 16;
              return [T(up(m.name), 46, y, { color: id === 'tiny' ? 'red' : id === 'galaxy' ? 'lilac' : 'white', id: 'r' + id }), T(pct(m.chance), 98, y), T(`X${m.value}`, 150, y, { color: m.value >= 3 ? 'yellow' : m.value < 1 ? 'red' : 'white' })];
            })] },
        { say: 'Galaxy: **x8**! Doge: **x4**. But the most common one, **Tiny**, is worth LESS. Boo!', tap: ['rgalaxy', 'rtiny'], highlight: 'circle', expr: 'shocked', react: 'gasp' },
        { erase: true, say: `Odds a **bred** egg mutates: plain parents **${pct(o0.any)}**. Pet them: **${pct(o1.any)}**.`,
          draw: [TITLE('MUTATION LUCK', 'green'),
            ...[['PLAIN', o0.any, 'white'], ['PETTED', o1.any, 'pink'], ['MATCHMADE', o2.any, 'blue'], ['+ LUCKY FOOD', o3.any, 'yellow']].flatMap(([lbl, p, c], i) => {
              const y = 32 + i * 18;
              return [T(lbl, 12, y, { align: 'left', color: c }), { meter: [86, y - 4, 70, 8], value: p, color: c, id: 'm' + i }, T(pct(p), 176, y, { color: c })];
            })] },
        { say: `Arrange it in my **Matchmaker**: **${pct(o2.any)}**. Lucky food in BOTH parents: **${pct(o3.any)}**!`, tap: ['m2', 'm3'], expr: 'greedy', react: 'wow' },
        { erase: true, say: 'Lucky food: **Royal Pearls**, **Clovers**, **Moonberries**, Golden Carrots. Feed BOTH parents first.', tap: ['pearl', 'clover', 'berry'],
          draw: [TITLE('LUCKY FOOD', 'green'), D('pearl', 34, 46, { scale: 2, id: 'pearl' }), D('clover', 80, 46, { scale: 2, id: 'clover' }), D('moonberry', 124, 46, { scale: 2, id: 'berry' }), D('golden_carrot', 166, 46, { scale: 2 }),
            S('PEARLS', 34, 68, 'lilac'), S('CLOVER', 80, 68, 'green'), S('MOONBERRY', 124, 68, 'blue'), S('GOLD CARROT', 166, 68, 'yellow'), T('LUCK IS USED UP AT THE DATE', 96, 90, { color: 'orange' })] },
        { erase: true, say: 'And a mutant parent passes its mutation on **30%** of the time. Breed your mutants!',
          draw: [D('galaxy', 40, 50, { scale: 2 }), T('+', 70, 50, { scale: 2 }), D('fish', 100, 50, { scale: 2 }), { arrow: [124, 50, 144, 50] }, D('galaxy', 166, 50, { scale: 2 }), T('30%', 166, 74, { color: 'yellow' })] },
        { cam: 'teacher', say: 'Want more? Find the **Swamp Shack** in the woods: mutations **x1.6**. Old Longneck knows even more...', expr: 'scheming', react: 'heart' },
      ];
    },
  },

  // ------------------------------------------------------------------ SELECTIVE BREEDING
  breeding: {
    title: 'Selective Breeding', number: 4, doodle: 'heart', color: 'pink',
    steps: (game) => {
      const b = base(game);
      const p = (s) => priceOf(game, 'bluegill', plain(s));
      return [
        { cam: 'board', say: 'Rich fish don\'t come from luck. They come from **CHOOSING** the parents.', expr: 'scheming', react: 'bang',
          draw: [TITLE('SELECTIVE BREEDING', 'pink'), D('fish_m', 50, 50, { scale: 2 }), D('heart', 96, 46, { scale: 2 }), D('fish_f', 142, 50, { scale: 2 }), T('PICK THE BEST PAIR', 96, 80, { color: 'yellow' })] },
        { erase: true, say: 'Watch. Generation 1: two OK fish. Size **1.00** and **1.10**.',
          draw: [S('GEN 1', 16, 22, 'white'), D('fish_m', 70, 20), S('1.00', 70, 32, 'blue'), D('fish_f', 122, 20), S('1.10', 122, 32, 'pink'), D('heart', 96, 20),
            { line: [70, 38, 96, 44] }, { line: [122, 38, 96, 44] }] },
        { say: 'Their babies land near the **average**. Some a bit bigger, some a bit smaller.',
          draw: [S('GEN 2', 16, 58, 'white'), { line: [96, 44, 46, 52] }, { line: [96, 44, 96, 52] }, { line: [96, 44, 146, 52] },
            D('minifish', 46, 58, { id: 'k1' }), S('1.02', 46, 68), D('minifish', 96, 58, { id: 'keep' }), S('1.12', 96, 68, 'yellow'), D('minifish', 146, 58, { id: 'k3' }), S('0.99', 146, 68)] },
        { say: 'KEEP the best baby. The rest? **Dinner**. For the bears. That\'s profit too!', expr: 'greedy', react: 'laugh',
          draw: [{ circle: 'keep', color: 'yellow' }, { cross: [46, 58, 6] }, { cross: [146, 58, 6] }, S('BEAR FOOD', 46, 76, 'red'), S('BEAR FOOD', 146, 76, 'red')] },
        { say: 'Breed the best with the best again. Every generation **creeps up**.', react: 'wow',
          draw: [S('GEN 3', 16, 92, 'white'), { arrow: [96, 74, 96, 84] }, D('fish_star', 96, 94, { id: 'g3' }), S('1.18 AND CLIMBING', 150, 94, 'yellow')] },
        { say: `Size alone: a Bluegill at 1.0 pays **${b}**, at 1.4 pays **${p(1.4)}**. Add a morph and it's a feast!`, tap: 'g3', expr: 'proud' },
        { erase: true, say: 'The recipe. Copy it down. There WILL be a test. (There won\'t.)',
          draw: [TITLE('THE RECIPE', 'green'), ...['1 PICK THE BEST PAIR', '2 FEED THEM WELL', '3 PET THEM + LUCKY FOOD', '4 KEEP THE BEST BABY', '5 TAG IT: DO NOT EAT', '6 BEARS EAT THE REST']
            .map((t, i) => T(t, 22, 30 + i * 13, { align: 'left', color: i === 4 ? 'red' : 'white', id: 'rc' + i }))] },
        { cam: 'teacher', say: 'Tag keepers **DO NOT EAT**, or a bear eats your future. With mustard.', expr: 'wink', react: 'laugh' },
      ];
    },
  },

  // ------------------------------------------------------------------ UNLOCKING
  unlocking: {
    title: 'Unlocking Stuff', number: 5, doodle: 'key', color: 'green',
    steps: (game) => {
      const next = (() => { try { return game.researchSections?.().find((k) => k && !k.open); } catch { return null; } })();
      const rush60 = researchRushPrice({ tier: 0 }, 60), rush180 = researchRushPrice({ tier: 0 }, 180);
      return [
        { cam: 'board', say: 'Everything NEW starts in my **LAB**. Research is **FREE**. It only costs **TIME**.', expr: 'teacher', react: 'bang',
          draw: [TITLE('UNLOCKING', 'green'), D('flask', 40, 50, { scale: 2 }), T('+', 70, 50, { scale: 2 }), D('timer', 96, 50, { scale: 2 }), T('= FREE!', 150, 50, { scale: 2, color: 'yellow' })] },
        { say: 'One project per **bench**. Research more benches to run two or three at once.',
          draw: [D('flask', 40, 86), D('flask', 70, 86), D('flask', 100, 86), S('BENCHES', 70, 98, 'blue'), D('timer', 150, 86), S('ALL RUN AT ONCE', 150, 98, 'green')] },
        { erase: true, say: `In a hurry? **Rush** it with coins: 1 minute left costs ~**${rush60}**, 3 minutes ~**${rush180}**.`, expr: 'scheming',
          draw: [TITLE('RUSH = COINS', 'orange'), D('timer', 50, 50, { scale: 2 }), { arrow: [70, 50, 96, 50] }, D('coin', 120, 50, { scale: 2 }), T(`1 MIN ${rush60}`, 96, 78, { color: 'yellow' }), T(`3 MIN ${rush180}`, 96, 92, { color: 'orange' })] },
        { say: 'Rushing early = burning money. Keep the benches **busy** instead. Waiting is free.', expr: 'smug' },
        { erase: true, say: 'The tree has **SECTIONS**. A locked one needs its **KEY**:',
          draw: [TITLE('SECTIONS', 'yellow'), D('lock', 30, 52, { scale: 2, id: 'lock' }), { arrow: [48, 52, 64, 52] }, D('key', 90, 52, { scale: 2 }),
            S('1 RESEARCH A NODE', 150, 40, 'blue'), S('2 MEET A NEIGHBOUR', 150, 52, 'green'), S('3 PAY THE COINS', 150, 64, 'yellow')] },
        next
          ? { say: `Next one for you: **${next.name}**. Needs: ${next.needs.map((n) => n.text).join(', ')}.`, tap: 'lock',
            draw: [T(up(next.name).slice(0, 30), 96, 88, { color: 'yellow' })] }
          : { say: 'You\'ve opened every section! Show-off.', tap: 'lock' },
        { erase: true, say: 'Neighbours live in the **fog**. Clear trees toward a fog bank to meet them.', react: 'wow',
          draw: [D('tree', 30, 50, { scale: 2 }), D('axe', 58, 46), { arrow: [72, 50, 98, 50] }, D('question', 124, 50, { scale: 2 }), T('NEIGHBOUR!', 160, 74, { color: 'green' }), T('MORE TREE', 60, 80, { color: 'yellow' })] },
        { cam: 'teacher', say: 'Homework: never leave a bench **empty**. An idle bench is a lazy bench.', expr: 'proud', react: 'cheer' },
      ];
    },
  },

  // ------------------------------------------------------------------ the v26 systems (short)
  weather: {
    title: 'Weather Report', number: 6, doodle: 'snowflake', color: 'blue',
    steps: () => [
      { cam: 'board', say: 'The year: **4 seasons**, **7 days** each. Spring, summer, autumn, WINTER.', expr: 'teacher', react: 'bang',
        draw: [TITLE('WEATHER REPORT', 'blue'), D('flower', 30, 50, { scale: 2 }), D('sun', 76, 50, { scale: 2 }), D('tree', 120, 50, { scale: 2, tint: 'orange' }), D('snowflake', 166, 50, { scale: 2, id: 'snow' }),
          S('BREED X1.5', 30, 72, 'pink'), S('LIVELY', 76, 72, 'yellow'), S('EAT X1.45', 120, 72, 'orange'), S('BREED X0.25', 166, 72, 'blue')] },
      { say: 'Fish follow the seasons: spring love, autumn **hunger**, winter **sulking**. Trout LOVE winter.', tap: 'snow' },
      { erase: true, say: 'Bears feel the cold under about **6°C**. Cold bears lose patience and **leave**. No bill!', expr: 'worried', react: 'gasp',
        draw: [TITLE('COLD BEARS', 'blue'), D('thermo', 36, 54, { scale: 2 }), T('UNDER 6', 36, 82, { color: 'blue' }), D('bear', 96, 54, { scale: 2 }), D('snowflake', 120, 36), { arrow: [118, 60, 150, 60] }, T('BYE', 168, 60, { color: 'red' })] },
      { say: 'Warm them: **fire pits**, heaters, hot tubs. A fire burns 1 wood a cold day.', expr: 'happy',
        draw: [D('fire', 40, 94), D('tub', 80, 94), S('WARM BEAR = TIPS', 140, 94, 'yellow')] },
      { erase: true, say: 'Frost kills tender crops in winter. A **Greenhouse** keeps them growing.',
        draw: [D('sprout', 50, 50, { scale: 2 }), { cross: [50, 50, 10] }, D('snowflake', 80, 36), { arrow: [92, 50, 116, 50] }, D('shop', 146, 48, { scale: 2 }), T('GREENHOUSE', 146, 76, { color: 'green' })] },
      { cam: 'teacher', say: 'The clock shows today\'s weather and the **forecast**. Check it every morning!', expr: 'wink' },
    ],
  },
  resortStaff: {
    title: 'Resort & Staff', number: 7, doodle: 'beaver', color: 'orange',
    steps: () => [
      { cam: 'board', say: 'Bears pay for fish. But a smart fox sells them a **SPA DAY** too.', expr: 'scheming', react: 'bang',
        draw: [TITLE('RESORT', 'blue'), D('bear', 40, 50, { scale: 2 }), { arrow: [62, 50, 84, 50] }, D('tub', 110, 50, { scale: 2 }), { arrow: [132, 50, 150, 50] }, D('coin', 170, 50, { scale: 2 }),
          S('EACH VISIT PAYS', 110, 74, 'yellow')] },
      { say: 'Bears pick a facility by **need**: cold = hot tub, wet = towels, tired = spa. Each visit pays.',
        draw: [S('COLD > TUB', 30, 92, 'blue'), S('WET > TOWELS', 96, 92, 'green'), S('FUN > PHOTOS', 160, 92, 'pink')] },
      { erase: true, say: 'Paint **paths**! Once any path exists, bears stick to them. Off-path they trample flowers.',
        draw: [TITLE('PATHS', 'yellow'), { line: [20, 60, 170, 60], width: 2, color: 'orange' }, D('bear', 60, 50), D('bear', 120, 50), D('flower', 90, 84), { cross: [150, 84, 6] }, S('NO PATH = GRUMPY', 150, 96, 'red')] },
      { erase: true, say: 'STAFF: hire beavers at the **Interview Tent**. Skills go 1 to 5.', expr: 'teacher',
        draw: [TITLE('STAFF', 'orange'), D('tent', 40, 50, { scale: 2 }), { arrow: [62, 50, 84, 50] }, D('beaver', 108, 50, { scale: 2 }), ...[0, 1, 2, 3, 4].map((i) => ({ star: [140 + i * 10, 50, 4] }))] },
      { say: 'A skilled, happy beaver makes a job up to **x2** faster. Some jobs are **required**: no clerk, no tickets!',
        draw: [S('JOB BOOST UP TO X2', 96, 76, 'green'), S('WAGES EVERY MORNING', 96, 88, 'yellow'), S('A BED EACH', 96, 98, 'blue')] },
      { cam: 'teacher', say: 'And keep them away from rampaging bears. A **rescue** costs a LOT of coins.', expr: 'worried', react: 'gasp' },
    ],
  },
  industry: {
    title: 'Power & Storage', number: 8, doodle: 'gear', color: 'yellow',
    steps: () => [
      { cam: 'board', say: 'Machines need **POWER**. Sun, water, wind, or burning coal.', expr: 'teacher', react: 'bang',
        draw: [TITLE('POWER', 'yellow'), D('sun', 30, 46, { scale: 2 }), S('SOLAR 3', 30, 66, 'yellow'), D('maple', 76, 46, { scale: 2 }), S('WIND 3.5', 76, 66, 'blue'), D('gear', 122, 46, { scale: 2 }), S('WATER WHEEL', 122, 66, 'blue'), D('bolt', 166, 46, { scale: 2 }), S('COAL', 166, 66, 'orange')] },
      { say: '**Poles** carry it: one powers machines **4 tiles** around, and links to the next pole **8 tiles** away.',
        draw: [{ line: [30, 92, 160, 92] }, D('bolt', 30, 86), D('bolt', 96, 86), D('bolt', 160, 86), S('8 TILES', 64, 100, 'yellow'), S('8 TILES', 128, 100, 'yellow')] },
      { erase: true, say: 'Demand above supply? **Brownout**: everything runs slow. No power at all? It **stops**.', expr: 'shocked', react: 'gasp',
        draw: [TITLE('SUPPLY VS DEMAND', 'orange'), { bar: [50, 90, 22, 54], color: 'green' }, S('SUPPLY', 61, 98), { bar: [120, 90, 22, 70], color: 'red' }, S('DEMAND', 131, 98), T('= SLOW', 166, 40, { color: 'red' })] },
      { erase: true, say: 'Ore, ingots and parts live in **storage** buildings. Full storage = production **stops**.',
        draw: [TITLE('STORAGE', 'blue'), D('crate', 40, 50, { scale: 2 }), D('crate', 64, 50, { scale: 2 }), { arrow: [86, 50, 110, 50] }, T('FULL', 140, 50, { scale: 2, color: 'red' }), T('BUILD MORE OR SELL', 96, 82, { color: 'yellow' })] },
      { cam: 'teacher', say: 'Batteries save daytime sun for the night. Clever! Like me.', expr: 'smug' },
    ],
  },
  feastClass: {
    title: 'The Feast', number: 9, doodle: 'bear', color: 'orange',
    steps: () => [
      { cam: 'board', say: 'At **5 PM** the feast starts and the camera is **YOURS**. Drag to look around!', expr: 'excited', react: 'bang',
        draw: [TITLE('THE FEAST', 'orange'), D('clock5', 40, 50, { scale: 2 }), { arrow: [62, 50, 84, 50] }, D('bear', 110, 50, { scale: 2 }), D('bear', 150, 50, { scale: 2 }), T('DRAG + ZOOM', 96, 80, { color: 'yellow' })] },
      { say: 'Little **icons** pop up over bears and beavers: trouble, or a chance to earn more.',
        draw: [D('bang', 110, 30), D('question', 150, 30)] },
      { erase: true, say: '**Tap** an icon, watch the scene, pick a **choice**. Some cost coins, some save your rating.',
        draw: [TITLE('EVENTS', 'yellow'), D('bang', 30, 50, { scale: 2 }), { arrow: [46, 50, 66, 50] }, D('magnifier', 84, 50, { scale: 2 }), { arrow: [102, 50, 120, 50] }, T('A', 136, 42, { color: 'green' }), T('B', 156, 42, { color: 'orange' }), T('C', 176, 42, { color: 'red' })] },
      { say: 'Ignore an icon too long (about **24 seconds**) and it picks the **worst** choice for you!', expr: 'angry', react: 'gasp',
        draw: [D('timer', 60, 84, { scale: 2 }), { arrow: [80, 84, 104, 84] }, T('WORST', 140, 84, { color: 'red' })] },
      { cam: 'teacher', say: '**Auto-cam** films it for you, **x3** speeds it up. But the money is in the icons.', expr: 'wink' },
    ],
  },
};

export const CLASS_ORDER = ['money101', 'genetics', 'mutations', 'breeding', 'unlocking', 'weather', 'resortStaff', 'industry', 'feastClass'];
void SPECIES_BY_ID; void morphOdds;
