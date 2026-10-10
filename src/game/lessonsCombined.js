// The short tutorial uses three combined classroom lessons instead of seven:
//   pondlife  - fish care, feeding and breeding (+ genes, the Matchmaker)
//   builder   - the Build menu, beavers (and paying them), plants & harvests
//   customers - bears, side dishes, DO NOT EAT tags, rampages and stars
// Same step format as Classroom.js LESSONS; merged into it by the Tutorial.
import { measureText } from '../ui/Chalkboard.js';
import { priceOf, plain } from './lessons/econ.js'; // [v26 tutorial]

const T = (text, x, y, o = {}) => ({ text, x, y, ...o });
const D = (doodle, x, y, o = {}) => ({ doodle, x, y, ...o });
const S = (t, x, y, color = 'white') => ({ text: t, x, y, font: 'small', color }); // [v26 tutorial]
const TITLE = (text, color = 'yellow', o = {}) => ({ text, x: 96, y: 9, scale: measureText(text, 2).w <= 184 ? 2 : 1, color, id: 'title', ...o });

export const COMBINED_LESSONS = {
  pondlife: {
    title: 'Pond Life 101', number: 1, doodle: 'fish', color: 'yellow',
    steps: [
      { cam: 'board', say: 'Class! Today: **fish**. Feeding, love and babies. Fast!', expr: 'teacher', react: 'bang',
        draw: [TITLE('POND LIFE 101'), D('fish', 42, 50, { scale: 2, id: 'fish' }),
          T('HUNGER', 82, 42, { align: 'left', color: 'orange' }), { meter: [132, 38, 50, 8], value: 0.3, color: 'orange', id: 'hunger' },
          T('WELL FED', 82, 60, { align: 'left', color: 'pink' }), { meter: [132, 56, 50, 8], value: 0.9, color: 'pink', id: 'fed' }] }, // [v18 font] meters moved right: WELL FED is wider in TBME Goofy
      { say: 'Hungry? Pick the **Food tool** and **tap the water**. Yum!', tap: 'hunger', react: { kind: 'heart', who: ['pip', 'chub'] },
        draw: [D('bag', 26, 90, { scale: 2 }), D('pellet', 54, 82), { arrow: [64, 90, 90, 90] }, D('fish_full', 122, 90, { scale: 2 }), T('YUM!', 170, 88, { color: 'yellow' })] },
      { erase: true, say: 'RULE: only **WELL FED** grown-ups fall in love. A boy ♂ and a girl ♀!', expr: 'shocked', react: 'bang', tap: ['dad', 'mum'],
        draw: [TITLE('LOVE RULES', 'pink'), D('fish_m', 40, 46, { scale: 2, id: 'dad' }), T('+', 96, 46, { scale: 2 }), D('fish_f', 152, 46, { scale: 2, id: 'mum' }), T('ADULT + WELL FED', 96, 76, { color: 'yellow' })] },
      { erase: true, say: '**Date**, mum **lays**, dad **fertilizes**, **wait**... then **TAP** to hatch!', tap: 's5', highlight: 'circle', react: 'cheer', speed: 1.5,
        draw: [['fish_heart', '1 DATE', 'pink'], ['clutch', '2 LAY', 'orange'], ['fish_m', '3 DAD', 'blue'], ['egg_glow', '4 WAIT', 'yellow'], ['egg', '5 TAP!', 'green']]
          .flatMap(([d, w, c], i) => [D(d, 21 + i * 37.5, 30, { id: 's' + (i + 1) }), T(w, 21 + i * 37.5, 48, { color: c })]) },
      { say: 'Babies get mum and dad\'s **average size**, their colour, traits... and sometimes **MUTATE**! Big + rare = **$$$**', tap: 'baby', react: 'wow', expr: 'greedy', // [v26 tutorial]
        draw: [D('dna', 22, 84, { id: 'dna' }), { arrow: [36, 84, 56, 84] }, D('fish_rainbow', 80, 82, { id: 'baby' }), D('galaxy', 116, 82), T('=', 140, 84, { scale: 2 }), D('coin', 166, 82, { scale: 2 })] },
      { cam: 'teacher', say: 'Pro tip: the **Matchmaker** lets YOU pick the parents. Perfect genes!', expr: 'wink', react: 'heart' },
    ],
  },
  builder: {
    title: 'Builder Beavers', number: 2, doodle: 'hammer', color: 'blue',
    steps: [
      { at: 'desk', cam: 'desk', say: 'Hard hats on! Today: **building**, **beavers** and **plants**.', expr: 'determined', sfx: 'class_bell', react: 'bang' },
      { cam: 'board', say: 'Small things pop in **instantly**. Big builds? The **beavers** build them!', tap: 'lodge', react: 'wow',
        draw: [TITLE('BUILDER BEAVERS', 'blue'), D('flower', 22, 46, { scale: 2 }), T('POP!', 48, 46, { color: 'yellow' }), D('lodge', 108, 44, { scale: 2, id: 'lodge' }), D('beaver', 156, 48), D('hammer', 178, 42)] },
      { say: 'But beavers only work when **PAID**. In food. At their **Snack Bar**!', expr: 'smug', react: 'laugh', tap: 'bv',
        draw: [D('beaver', 36, 84, { scale: 1, id: 'bv' }), T('+', 60, 84), D('bowl', 84, 84), D('carrot', 108, 82), T('NO PAY, NO WORK!', 156, 84, { color: 'orange', font: 'small' })] },
      { erase: true, say: 'Where does food come from? **Plant seeds**! Seed, sprout... **ripe**!', tap: 'ready', react: 'heart',
        draw: [TITLE('GREEN THUMB', 'green'), D('seed', 24, 48, { scale: 2 }), { arrow: [40, 52, 54, 52] }, D('sprout', 72, 48, { scale: 2 }), { arrow: [90, 52, 104, 52] }, D('growing', 120, 48, { scale: 2 }), { arrow: [136, 52, 148, 52] }, D('ready', 166, 48, { scale: 2, id: 'ready' })] },
      { say: '**Tap** ripe plants to harvest. Food for **fish**, **bears** AND **beavers**!', react: 'cheer', tap: 'basket',
        draw: [D('basket', 40, 86, { id: 'basket' }), { arrow: [58, 86, 76, 86] }, D('fish', 96, 86), D('bear', 128, 86), D('beaver', 160, 86)] },
      { erase: true, say: 'Need room? **DESTROY**: drag a box over trees, **pay the crew right there**, they chop. **Land + wood!**', tap: 'zone', highlight: 'pulse', camAfter: 'teacher',
        draw: [D('tree', 22, 40, { scale: 2 }), D('tree', 58, 40), D('rock', 80, 52), { box: [6, 14, 92, 48], color: 'yellow', id: 'zone' }, { arrow: [104, 40, 124, 40] }, D('logs', 150, 38, { scale: 2 }), T('+LAND +$', 150, 70, { color: 'green' })] },
    ],
  },
  // [v26 tutorial] the money loop, with the game's real numbers (src/game/lessons/econ.js)
  customers: {
    title: 'Customers = Money', number: 3, doodle: 'bear', color: 'orange',
    steps: (game) => {
      const b = priceOf(game, 'bluegill', plain(1));
      return [
        { cam: 'wide', say: 'Our customers: **bears in suits**! Every day at **5 PM**, from Day 2.', expr: 'greedy', react: 'bang' },
        { cam: 'board', say: `Every fish a bear eats = a **bill**. A plain Bluegill: **${b} coins**.`, tap: 'bill',
          draw: [TITLE('CUSTOMERS = MONEY', 'orange'), D('bear', 30, 48, { scale: 2 }), { arrow: [52, 48, 70, 48] }, D('fish', 90, 48), T('=', 112, 48, { scale: 2 }), T(`${b}`, 136, 48, { scale: 2, color: 'yellow', id: 'bill' }), D('coin', 162, 48, { scale: 2 })] },
        { say: `Bigger and rarer pays MORE: size XL **${Math.round(b * 1.4)}**, Golden **${b * 5}**, Galaxy mutant **${b * 8}**!`, tap: 'gold', react: 'wow', expr: 'greedy',
          draw: [D('fish', 30, 86, { scale: 2 }), S('XL', 30, 100, 'blue'), D('fish_gold', 96, 86, { scale: 2, id: 'gold' }), S('GOLDEN X5', 96, 100, 'yellow'), D('galaxy', 160, 86, { scale: 2 }), S('GALAXY X8', 160, 100, 'lilac')] },
        { erase: true, say: 'Full, happy bears **TIP**: up to **+25%**. A **side dish** from a Snack Bowl adds a bonus!', tap: 'sbowl', react: 'cheer',
          draw: [TITLE('TIPS', 'green'), D('review', 30, 46), ...[0, 1, 2, 3, 4].map((i) => ({ star: [52 + i * 13, 46, 5] })), T('+25%', 150, 46, { color: 'yellow' }), D('bowl', 60, 80, { scale: 2, id: 'sbowl' }), T('+BONUS', 130, 80, { color: 'green' })] },
        { erase: true, dim: 1, shake: 1, sfx: 'class_rumble', say: 'Not enough fish? **RAMPAGE!** No bill, and a **0-star review**!', expr: 'shocked', react: 'gasp', cutaway: false,
          draw: [D('bear_shadow', 96, 50, { scale: 3 }), D('smash', 28, 30, { scale: 2 }), D('review', 168, 28), { cross: [168, 28, 7] }] },
        { erase: true, say: 'Good **rating** = **more bears** tomorrow. More bears, more bills. That\'s the loop!', expr: 'proud', react: 'cheer', camAfter: 'teacher',
          draw: [TITLE('THE MONEY LOOP', 'yellow'), D('fish_heart', 30, 50, { scale: 2 }), S('BREED', 30, 68, 'pink'), { arrow: [48, 50, 66, 50] }, D('bear', 84, 50, { scale: 2 }), S('5 PM', 84, 68, 'orange'),
            { arrow: [102, 50, 120, 50] }, D('coin', 138, 50, { scale: 2 }), S('BILLS + TIPS', 138, 68, 'yellow'), { arrow: [154, 58, 160, 80] }, { star: [150, 90, 6] }, S('RATING', 120, 92, 'yellow'), { arrow: [132, 90, 50, 82] }, S('MORE BEARS', 70, 98, 'green')] },
      ];
    },
  },
};

// the old lesson ids now resolve to the short ones
export const LESSON_ALIASES = { condition: 'pondlife', fishlife: 'pondlife', build: 'builder', plants: 'builder', foods: 'builder', bears: 'customers', stars: 'customers' };
