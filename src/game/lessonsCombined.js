// The short tutorial uses three combined classroom lessons instead of seven:
//   pondlife  - fish care, feeding and breeding (+ genes, the Matchmaker)
//   builder   - the Build menu, beavers (and paying them), plants & harvests
//   customers - bears, side dishes, DO NOT EAT tags, rampages and stars
// Same step format as Classroom.js LESSONS; merged into it by the Tutorial.
import { measureText } from '../ui/Chalkboard.js';

const T = (text, x, y, o = {}) => ({ text, x, y, ...o });
const D = (doodle, x, y, o = {}) => ({ doodle, x, y, ...o });
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
      { say: 'Babies **inherit** size, colour and traits. Sometimes they **MUTATE**! Rare = **$$$**', tap: 'baby', react: 'wow', expr: 'greedy',
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
  customers: {
    title: 'Customers!', number: 3, doodle: 'bear', color: 'orange',
    steps: [
      { cam: 'wide', say: 'Our customers: **bears in suits**! Every day at **5 PM** from Day 2.', expr: 'greedy', react: 'bang' },
      { cam: 'board', say: 'They eat your **fish**, and love a **side dish** from a **Snack Bowl**.', tap: 'sbowl',
        draw: [TITLE('CUSTOMERS!', 'orange'), D('bear', 34, 50, { scale: 2 }), { arrow: [58, 50, 76, 50] }, D('fish', 96, 50), T('+', 116, 50), D('bowl', 142, 50, { scale: 2, id: 'sbowl' })] },
      { say: 'Tag your best fish **DO NOT EAT**. Bears respect labels. Mostly.', expr: 'wink', react: 'laugh', tap: 'tag',
        draw: [D('fish_star', 50, 86, { scale: 1 }), D('tag', 84, 84, { id: 'tag' }), T('DO NOT EAT!', 146, 86, { color: 'red' })] },
      { erase: true, dim: 1, shake: 1, sfx: 'class_rumble', say: 'Nothing to eat? **RAMPAGE!** And a **0-star review**!', expr: 'shocked', react: 'gasp', cutaway: false,
        draw: [D('bear_shadow', 96, 50, { scale: 3 }), D('smash', 28, 30, { scale: 2 }), D('review', 168, 28), { cross: [168, 28, 7] }] },
      { erase: true, say: 'Happy bears = good **reviews**. Good rating = **more, richer bears**!', expr: 'proud', react: 'cheer', camAfter: 'teacher',
        draw: [TITLE('STARS', 'yellow'), ...[0, 1, 2, 3, 4].map((i) => ({ star: [56 + i * 20, 46, 7] })), { arrow: [96, 62, 96, 74] }, D('coin', 76, 88, { scale: 2 }), D('coin', 116, 88, { scale: 2 })] },
    ],
  },
};

// the old lesson ids now resolve to the short ones
export const LESSON_ALIASES = { condition: 'pondlife', fishlife: 'pondlife', build: 'builder', plants: 'builder', foods: 'builder', bears: 'customers', stars: 'customers' };
