// The short tutorial's three day-1 classes (merged into Classroom.js LESSONS by the Tutorial):
//   pondlife  - feed, who can breed, hatching
//   builder   - beavers build (and want food as pay), harvesting, clearing land
//   customers - bigger/rarer fish pay more, empty pond = rampage, rating = more bears
// [v26 class2] Each class is ~1 minute: 2-3 rules, each one a pop quiz the player answers on the
// chalkboard (src/game/lessons/quiz.js). Same step format as Classroom.js LESSONS.
import { measureText } from '../ui/Chalkboard.js';
import { priceOf, plain } from './lessons/econ.js'; // [v26 tutorial]

const T = (text, x, y, o = {}) => ({ text, x, y, ...o });
const D = (doodle, x, y, o = {}) => ({ doodle, x, y, ...o });
const S = (t, x, y, color = 'white', o = {}) => ({ text: t, x, y, font: 'small', color, ...o });
const TITLE = (text, color = 'yellow', o = {}) => ({ text, x: 96, y: 9, scale: measureText(text, 2).w <= 184 ? 2 : 1, color, id: 'title', ...o });

export const COMBINED_LESSONS = {
  pondlife: {
    title: 'Pond Life 101', number: 1, doodle: 'fish', color: 'yellow',
    steps: [
      { cam: 'board', say: 'Fish rules, with **pop quizzes**! Rule 1: hungry fish? **Food tool**, then **tap the water**.', expr: 'teacher', react: 'bang', tap: 'full',
        draw: [TITLE('POND LIFE 101'), D('bag', 30, 50, { scale: 2 }), D('pellet', 58, 42), { arrow: [66, 50, 90, 50] }, D('fish_full', 120, 50, { scale: 2, id: 'full' }), T('YUM!', 164, 48, { color: 'yellow' }),
          S('FOOD TOOL + TAP THE WATER', 96, 78, 'orange')] },
      { erase: true, say: 'Rule 2: only **WELL FED** grown-ups fall in love. Which one is ready? **Tap it!**',
        draw: [TITLE('WHO CAN BREED?', 'pink'), D('fish_hungry', 34, 52, { scale: 2, id: 'hungry' }), D('minifish', 96, 54, { scale: 2, id: 'fry' }), D('fish_heart', 158, 50, { scale: 2, id: 'ready' })],
        quiz: { id: 'breed', opts: ['hungry', 'fry', 'ready'], ok: 'ready', coins: 10,
          no: { hungry: 'That one\'s **starving**. Nobody dates on an empty stomach!', fry: 'A **baby**! Let it grow up first. Scandalous.' },
          yes: 'Full belly, big heart! A boy ♂ + a girl ♀ like that = **eggs**.',
          show: [S('HUNGRY', 34, 78, 'blue'), S('BABY', 96, 78, 'orange'), S('READY', 158, 78, 'pink')] } },
      { erase: true, say: 'Rule 3: eggs **glow** when ready. Hatch them! **Tap ALL the glowing eggs!**',
        draw: [TITLE('HATCH TIME', 'green'), D('egg_glow', 28, 52, { scale: 2, id: 'e1' }), D('egg', 74, 52, { scale: 2, id: 'e0' }), D('egg_glow', 120, 52, { scale: 2, id: 'e2' }), D('egg_glow', 166, 52, { scale: 2, id: 'e3' })],
        quiz: { id: 'hatch', opts: ['e1', 'e0', 'e2', 'e3'], ok: ['e1', 'e2', 'e3'], all: true, coins: 10,
          no: 'Not that one! It\'s not **glowing** yet. Patience.',
          yes: 'Hatched! Babies get mum and dad\'s **size** and **colour**... and sometimes **MUTATE**. Rare = **$$$**.' } },
    ],
  },
  builder: {
    title: 'Builder Beavers', number: 2, doodle: 'hammer', color: 'blue',
    steps: [
      { cam: 'board', say: 'Small stuff pops in **instantly**. Big builds? The **beavers** build them.', expr: 'determined', sfx: 'class_bell', react: 'bang', tap: 'lodge',
        draw: [TITLE('BUILDER BEAVERS', 'blue'), D('flower', 26, 50, { scale: 2 }), T('POP!', 56, 48, { color: 'yellow' }), D('lodge', 116, 48, { scale: 2, id: 'lodge' }), D('beaver', 160, 54), D('hammer', 180, 46)] },
      { erase: true, say: 'But beavers only work when **PAID**. What do they want? **Tap it!**', expr: 'smug',
        draw: [TITLE('BEAVER PAY', 'orange'), D('beaver', 30, 54, { scale: 2 }), D('coin', 82, 54, { scale: 2, id: 'coin' }), D('bowl', 128, 58, { scale: 2, id: 'food' }), D('carrot', 128, 40, { id: 'food_l' }), D('gnome', 170, 54, { scale: 2, id: 'gnome' })],
        quiz: { id: 'pay', opts: ['coin', 'food', 'gnome'], ok: 'food', coins: 10,
          no: { coin: 'Coins? They\'re **beavers**! They eat their wages. Literally.', gnome: 'A garden gnome. As PAY. Bold strategy.' },
          yes: '**Food**, at their **Snack Bar**. No pay, no work!', show: [T('NO PAY, NO WORK!', 96, 86, { color: 'orange' })] } },
      { erase: true, say: 'Food grows from **seeds**. Which plant can you harvest? **Tap it!**',
        draw: [TITLE('GREEN THUMB', 'green'), D('sprout', 30, 54, { scale: 2, id: 'p1' }), D('ready', 76, 52, { scale: 2, id: 'p2' }), D('growing', 122, 52, { scale: 2, id: 'p3' }), D('seed', 166, 56, { scale: 2, id: 'p4' })],
        quiz: { id: 'ripe', opts: ['p1', 'p2', 'p3', 'p4'], ok: 'p2', coins: 10,
          no: 'Still growing. Patience, grasshopper.',
          yes: 'Ripe! **Tap** ripe plants to harvest: food for **fish**, **bears** AND **beavers**.' } },
      { erase: true, say: 'Need room? The **Destroy** tool clears trees: **land + wood**! **Tap ALL the trees!**', expr: 'excited',
        draw: [TITLE('CLEAR THE LAND', 'yellow'), D('tree', 28, 52, { scale: 2, id: 't1' }), D('tree', 70, 50, { scale: 2, id: 't2' }), D('lodge', 116, 54, { scale: 2, id: 'home' }), D('tree', 162, 52, { scale: 2, id: 't3' })],
        quiz: { id: 'clear', opts: ['t1', 't2', 'home', 't3'], ok: ['t1', 't2', 't3'], all: true, coins: 10,
          no: 'NOT the lodge! The beavers **live** there!',
          yes: 'TIMBER! Drag a box with **Destroy**, pay the crew, they chop. Land AND wood money.' } },
    ],
  },
  // [v26 tutorial] the money loop, with the game's real numbers (src/game/lessons/econ.js)
  customers: {
    title: 'Customers = Money', number: 3, doodle: 'bear', color: 'orange',
    steps: (game) => {
      const b = priceOf(game, 'bluegill', plain(1));
      return [
        { cam: 'wide', say: 'Our customers: **bears in suits**. Every day at **5 PM**, starting **tomorrow**.', expr: 'greedy', react: 'bang' },
        { cam: 'board', say: 'Every fish a bear eats = a **bill**. **Drag** the fish that pays MORE onto the plate!',
          draw: [TITLE('WHAT PAYS?', 'orange'), D('fish', 34, 50, { scale: 2, id: 'plain' }), D('fish_gold', 86, 50, { scale: 2, id: 'gold' }), D('bear', 154, 46, { scale: 2 }), D('plate', 154, 80, { scale: 2, id: 'plate' })],
          quiz: { id: 'bill', opts: ['plain', 'gold'], ok: 'gold', drop: 'plate', coins: 10,
            no: `Cheapskate! That one pays **${b}**. Look at the SHINY one!`,
            yes: `Golden pays **x5**: **${b * 5}** coins vs **${b}**. Bigger and rarer = bigger bill!`,
            show: [T(`${b}`, 34, 74, { color: 'white' }), T(`${b * 5}`, 86, 74, { color: 'yellow' })] } },
        { erase: true, dim: 0.8, shake: 0.7, say: '5 PM. The pond is **EMPTY**. What happens? **Tap it!**', expr: 'worried',
          draw: [D('bear_shadow', 96, 34, { scale: 2 }), T('NOTHING', 34, 80, { color: 'blue', id: 'a1' }), T('RAMPAGE', 96, 80, { color: 'red', id: 'a2' }), T('THEY TIP', 158, 80, { color: 'green', id: 'a3' })],
          quiz: { id: 'empty', opts: ['a1', 'a2', 'a3'], ok: 'a2', coins: 10,
            no: { a1: 'Ha! I wish. Bears don\'t do polite.', a3: 'Tip? For an EMPTY pond? Sweet summer child.' },
            yes: '**RAMPAGE!** No bill, smashed stuff, a **0-star review**. Always keep fish ready.' } },
        { erase: true, say: 'Good **reviews** = **more bears** tomorrow. Full bears **tip**. That\'s the loop!', expr: 'proud', react: 'cheer', camAfter: 'teacher',
          draw: [TITLE('THE MONEY LOOP', 'yellow'), D('fish_heart', 30, 50, { scale: 2 }), S('BREED', 30, 68, 'pink'), { arrow: [48, 50, 66, 50] }, D('bear', 84, 50, { scale: 2 }), S('5 PM', 84, 68, 'orange'),
            { arrow: [102, 50, 120, 50] }, D('coin', 138, 50, { scale: 2 }), S('BILLS + TIPS', 138, 68, 'yellow'), { arrow: [150, 76, 120, 90] }, { star: [108, 92, 6] }, S('MORE BEARS', 70, 94, 'green')] },
      ];
    },
  },
};

// the old lesson ids now resolve to the short ones
export const LESSON_ALIASES = { condition: 'pondlife', fishlife: 'pondlife', build: 'builder', plants: 'builder', foods: 'builder', bears: 'customers', stars: 'customers' };
