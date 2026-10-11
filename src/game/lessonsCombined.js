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
      { cam: 'board', say: 'Feeding. Pick the **Food tool**, tap the water, the pellets sink, the fish eat.', expr: 'teacher', react: 'bang', tap: 'full',
        draw: [TITLE('POND LIFE 101'), D('bag', 30, 50, { scale: 2 }), D('pellet', 58, 42), { arrow: [66, 50, 90, 50] }, D('fish_full', 120, 50, { scale: 2, id: 'full' }), S('FOOD TOOL, TAP THE WATER', 96, 78, 'orange')] },
      { erase: true, say: 'Babies need two **grown-ups**, a boy and a girl, and both **well fed**. A hungry fish won\'t date. A fry is too young.',
        draw: [TITLE('LOVE RULES', 'pink'), D('fish_m', 50, 50, { scale: 2 }), T('+', 96, 50, { scale: 2 }), D('fish_f', 142, 50, { scale: 2 }), S('ADULT + WELL FED', 96, 78, 'yellow')] },
      { erase: true, say: 'So. Which of these can breed right now?',
        draw: [TITLE('WHO CAN BREED?', 'pink'), D('fish_hungry', 34, 52, { scale: 2, id: 'hungry' }), D('minifish', 96, 54, { scale: 2, id: 'fry' }), D('fish_heart', 158, 50, { scale: 2, id: 'ready' })],
        quiz: { id: 'breed', opts: ['hungry', 'fry', 'ready'], ok: 'ready',
          no: { hungry: 'That one\'s hungry. Feed it first, then we talk romance.', fry: 'That\'s a fry. It has to grow up first.' },
          yes: 'The grown-up with the full belly. Feed a pair until they\'re well fed and they find each other.',
          show: [S('HUNGRY', 34, 78, 'blue'), S('TOO YOUNG', 96, 78, 'orange'), S('READY', 158, 78, 'pink')] } },
      { erase: true, say: 'Eggs take time. When they **glow**, they\'re ready, and you tap them to hatch. Tap all the ready ones.',
        draw: [TITLE('HATCH TIME', 'green'), D('egg_glow', 28, 52, { scale: 2, id: 'e1' }), D('egg', 74, 52, { scale: 2, id: 'e0' }), D('egg_glow', 120, 52, { scale: 2, id: 'e2' }), D('egg_glow', 166, 52, { scale: 2, id: 'e3' })],
        quiz: { id: 'hatch', opts: ['e1', 'e0', 'e2', 'e3'], ok: ['e1', 'e2', 'e3'], all: true,
          no: 'Not glowing, not ready. Leave it.',
          yes: 'Three fry. Each one gets about the **average size** of its parents. Bigger fish, bigger bills.' } },
    ],
  },
  builder: {
    title: 'Builder Beavers', number: 2, doodle: 'hammer', color: 'blue',
    steps: [
      { cam: 'board', say: 'Small things like flowers appear the moment you place them. Big buildings, the **beavers** build.', expr: 'determined', sfx: 'class_bell', react: 'bang', tap: 'lodge',
        draw: [TITLE('BUILDER BEAVERS', 'blue'), D('flower', 26, 50, { scale: 2 }), T('POP!', 56, 48, { color: 'yellow' }), D('lodge', 116, 48, { scale: 2, id: 'lodge' }), D('beaver', 160, 54), D('hammer', 180, 46)] },
      { erase: true, say: 'Beavers don\'t take coins. They take **food**, served at their **Snack Bar**. No food, no work. What do you pay them with?', expr: 'smug',
        draw: [TITLE('BEAVER PAY', 'orange'), D('beaver', 30, 54, { scale: 2 }), D('coin', 82, 54, { scale: 2, id: 'coin' }), D('bowl', 128, 58, { scale: 2, id: 'food' }), D('carrot', 128, 40, { id: 'food_l' }), D('gnome', 170, 54, { scale: 2, id: 'gnome' })],
        quiz: { id: 'pay', opts: ['coin', 'food', 'gnome'], ok: 'food',
          no: { coin: 'Coins mean nothing to a beaver. Food.', gnome: 'Decor makes bears happy. Beavers want dinner.' },
          yes: 'Food. Keep the Snack Bar stocked or the hammers stop.' } },
      { erase: true, say: 'That food comes from the garden. Seed, sprout, growing, and then **ripe**: only ripe plants can be harvested. Which one?',
        draw: [TITLE('GREEN THUMB', 'green'), D('sprout', 30, 54, { scale: 2, id: 'p1' }), D('ready', 76, 52, { scale: 2, id: 'p2' }), D('growing', 122, 52, { scale: 2, id: 'p3' }), D('seed', 166, 56, { scale: 2, id: 'p4' })],
        quiz: { id: 'ripe', opts: ['p1', 'p2', 'p3', 'p4'], ok: 'p2',
          no: 'Not ripe yet. Tapping it now gets you nothing.',
          yes: 'The ripe one. Tap it in the garden and the harvest goes to the fish, the bears and the beavers.' } },
      { erase: true, say: 'Out of room? The **Destroy** tool. Drag a box over trees, pay the crew, they chop. You get the land and the wood. Mark the trees.', expr: 'excited',
        draw: [TITLE('CLEAR THE LAND', 'yellow'), D('tree', 28, 52, { scale: 2, id: 't1' }), D('tree', 70, 50, { scale: 2, id: 't2' }), D('lodge', 116, 54, { scale: 2, id: 'home' }), D('tree', 162, 52, { scale: 2, id: 't3' })],
        quiz: { id: 'clear', opts: ['t1', 't2', 'home', 't3'], ok: ['t1', 't2', 't3'], all: true,
          no: 'That\'s the lodge. The beavers sleep there.',
          yes: 'Trees go, logs come. Logs are wood, and wood is money.' } },
    ],
  },
  // [v26 tutorial] the money loop, with the game's real numbers (src/game/lessons/econ.js)
  customers: {
    title: 'Customers = Money', number: 3, doodle: 'bear', color: 'orange',
    steps: (game) => {
      const b = priceOf(game, 'bluegill', plain(1));
      return [
        { cam: 'wide', say: 'Our customers. Bears, in suits. From **tomorrow**, every day at **5 PM**.', expr: 'greedy', react: 'bang' },
        { cam: 'board', say: `Each fish a bear eats is a **bill**. A plain Bluegill pays **${b}**. A **Golden** one pays five times that.`, tap: 'gold',
          draw: [TITLE('WHAT PAYS?', 'orange'), D('fish', 50, 50, { scale: 2 }), S(`${b}`, 50, 72, 'white'), D('fish_gold', 142, 50, { scale: 2, id: 'gold' }), S(`${b * 5}`, 142, 72, 'yellow')] },
        { erase: true, say: 'One fish for this bear. Drag the one that makes us more money onto the plate.',
          draw: [TITLE('SERVE IT', 'orange'), D('fish', 34, 50, { scale: 2, id: 'plain' }), D('fish_gold', 86, 50, { scale: 2, id: 'gold' }), D('bear', 154, 46, { scale: 2 }), D('plate', 154, 80, { scale: 2, id: 'plate' })],
          quiz: { id: 'bill', opts: ['plain', 'gold'], ok: 'gold', drop: 'plate',
            no: `That's the plain one, **${b}**. The Golden pays **${b * 5}**.`,
            yes: `Golden: **${b * 5}** instead of **${b}**. Same bite, five times the bill.` } },
        { erase: true, dim: 0.8, shake: 0.7, say: 'Now the bad part. A hungry bear that finds **no fish** goes on a **rampage**: smashes things, pays nothing, leaves **zero stars**.', expr: 'worried', react: 'gasp',
          draw: [D('bear_shadow', 96, 40, { scale: 2 }), D('smash', 30, 30, { scale: 2 }), D('review', 166, 30), { cross: [166, 30, 7] }] },
        { erase: true, say: 'So. 5 PM, the pond is empty. What happens?',
          draw: [D('bear', 96, 34, { scale: 2 }), T('THEY LEAVE', 34, 80, { color: 'blue', id: 'a1' }), T('RAMPAGE', 96, 80, { color: 'red', id: 'a2' }), T('THEY WAIT', 158, 80, { color: 'green', id: 'a3' })],
          quiz: { id: 'empty', opts: ['a1', 'a2', 'a3'], ok: 'a2',
            no: 'Bears don\'t leave quietly and they don\'t wait. Rampage.',
            yes: 'Rampage. Keep enough fish in the pond for everyone who comes.' } },
        { erase: true, say: 'Full bears leave good reviews. Good reviews bring **more bears** tomorrow. That\'s the whole business.', expr: 'proud', react: 'cheer', camAfter: 'teacher',
          draw: [TITLE('THE MONEY LOOP', 'yellow'), D('fish_heart', 30, 50, { scale: 2 }), S('BREED', 30, 68, 'pink'), { arrow: [48, 50, 66, 50] }, D('bear', 84, 50, { scale: 2 }), S('5 PM', 84, 68, 'orange'),
            { arrow: [102, 50, 120, 50] }, D('coin', 138, 50, { scale: 2 }), S('BILLS + TIPS', 138, 68, 'yellow'), { arrow: [150, 76, 120, 90] }, { star: [108, 92, 6] }, S('MORE BEARS', 70, 94, 'green')] },
      ];
    },
  },
};

// the old lesson ids now resolve to the short ones
export const LESSON_ALIASES = { condition: 'pondlife', fishlife: 'pondlife', build: 'builder', plants: 'builder', foods: 'builder', bears: 'customers', stars: 'customers' };
