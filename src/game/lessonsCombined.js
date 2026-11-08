// The tour's three day-1 classes (merged into Classroom.js LESSONS):
//   pondlife  - fish eat and get hungry (cold-blooded), breathe with gills, float with a swim bladder;
//               spawning, incubation and temperature, fry with yolk sacs; the game's feed / breed / hatch rules
//   builder   - beavers are ecosystem engineers (a dam turns a stream into a wetland), what beavers eat,
//               photosynthesis; the game's beaver crews, Snack Bar pay, ripe harvests, clearing land
//   customers - bears are omnivores and fatten up for winter, hungry animals get aggressive, supply and
//               demand (rarer fish pay more); the game's 5 PM rush, bills, rampages and reviews
// [v32 class] No pop quizzes: each class teaches in a few punchy chalk + 3D steps (`show3d`, see
// src/game/classroom/demos.js) and ends with a TEST PAPER (`test`, src/ui/testpaper/TestPaper.js).
// Same step format as Classroom.js LESSONS. Real facts are kept short, accurate and kid-friendly.
import { measureText } from '../ui/Chalkboard.js';
import { priceOf, plain } from './lessons/econ.js'; // [v26 tutorial]

const T = (text, x, y, o = {}) => ({ text, x, y, ...o });
const D = (doodle, x, y, o = {}) => ({ doodle, x, y, ...o });
const S = (t, x, y, color = 'white', o = {}) => ({ text: t, x, y, font: 'small', color, ...o });
const TITLE = (text, color = 'yellow', o = {}) => ({ text, x: 96, y: 9, scale: measureText(text, 2).w <= 184 ? 2 : 1, color, id: 'title', ...o });

export const COMBINED_LESSONS = {
  // ------------------------------------------------------------------ 1. POND LIFE
  pondlife: {
    title: 'Pond Life 101', number: 1, doodle: 'fish', color: 'yellow', testTitle: 'Pond Life',
    steps: [
      { cam: 'board', say: 'Class! Today: what a fish **eats**, how it **breathes**, and where **babies** come from.', expr: 'teacher', react: 'bang',
        draw: [TITLE('POND LIFE 101'), D('bag', 40, 50, { scale: 2 }), S('EAT', 40, 72, 'orange'), D('gills', 96, 50, { scale: 2, id: 'gills' }), S('BREATHE', 96, 72, 'blue'), D('egg_eye', 154, 50, { scale: 2 }), S('BABIES', 154, 72, 'pink')] },
      { show3d: 'fishParts', cam: 'orbit', labels: ['mouth', 'eye', 'fins', 'tail'], hold: 2.5, expr: 'excited',
        say: 'Meet a real **bluegill**. A **mouth**, big **eyes**, **fins** to steer and brake, and a **tail** that pushes it along.' },
      { show3d: 'gills', cam: 'demoHead', labels: ['gills'], hold: 2.5, expr: 'teacher',
        say: 'Fish need **oxygen** too, but they take it from the **water**. In through the mouth, over the red **gills**, out under the gill cover.' },
      { show3d: 'bladder', cam: 'demo', labels: ['bladder'], hold: 3, expr: 'excited', react: 'wow',
        say: 'X-ray! Inside is a **swim bladder**, a little bag of gas. More gas: the fish rises. Less gas: it sinks. Floating for free!' },
      { erase: true, say: 'Fish need **food** to live and grow, and they get **hungry** again and again. In our pond: pick the **Food tool** and tap the water.', expr: 'teacher', tap: 'full',
        draw: [TITLE('FOOD!', 'orange'), D('fish_hungry', 30, 48, { scale: 2 }), S('HUNGRY', 30, 68, 'blue'), D('bag', 80, 48, { scale: 2 }), D('pellet', 98, 40), { arrow: [104, 48, 122, 48] }, D('fish_full', 150, 48, { scale: 2, id: 'full' }), S('WELL FED', 150, 68, 'orange')] },
      { say: 'Fish are **cold-blooded**: as warm as the water around them. Warm water, they burn food faster and get hungry **sooner**.', expr: 'focused',
        draw: [D('thermo', 22, 92, { scale: 1 }), S('WARM WATER', 62, 92, 'orange'), { arrow: [92, 92, 108, 92] }, S('HUNGRY SOONER', 148, 92, 'red')] },
      { erase: true, say: 'Babies need two **grown-ups**, a boy and a girl, both **well fed**. A hungry fish won\'t date, and a fry is too young.', expr: 'love',
        draw: [TITLE('LOVE RULES', 'pink'), D('fish_m', 50, 48, { scale: 2 }), T('+', 96, 48, { scale: 2 }), D('fish_f', 142, 48, { scale: 2 }), S('ADULT + WELL FED', 96, 74, 'yellow'), { check: [96, 88, 4] }] },
      { show3d: 'courtship', cam: 'demo', labels: ['nest', 'dad'], hold: 2.5, expr: 'love', react: 'heart',
        say: 'Real bluegill dads sweep a round **nest** in the gravel with their tails. Then the date: lots of romantic circling.' },
      { show3d: 'spawn', cam: 'demoClose', labels: ['egg'], hold: 3, expr: 'teacher',
        say: 'Mum lays her **eggs** in the nest, and dad fertilizes them right there in the water. That\'s called **spawning**.' },
      { show3d: 'develop', cam: 'demoClose', labels: ['thermo', 'dad'], hold: 2.5, expr: 'focused',
        say: 'Now the eggs **incubate** while dad fans them fresh water. Warm water: they hatch in a few **days**. Cold water: it can take **weeks**.' },
      { show3d: 'hatch', cam: 'demoClose', labels: ['yolk'], hold: 3, expr: 'excited', react: 'cheer',
        say: 'Pop! Baby fish, called **fry**. Each one carries a **yolk sac**: a packed lunch for its first few days.' },
      { erase: true, say: 'In our pond, ready eggs **glow**. **Tap** them to hatch, then feed the fry until they grow up.', expr: 'teacher', tap: 'egg', highlight: 'circle',
        draw: [TITLE('HATCH TIME', 'green'), D('egg_glow', 34, 50, { scale: 2, id: 'egg' }), { arrow: [56, 50, 74, 50] }, D('fry_yolk', 98, 50, { scale: 2 }), { arrow: [122, 50, 140, 50] }, D('fish', 164, 50, { scale: 2 }),
          S('TAP', 34, 72, 'yellow'), S('FEED', 98, 72, 'orange'), S('GROWN UP', 164, 72, 'green')] },
    ],
    test: [
      { type: 'choice', q: 'Fish get their oxygen from...', opts: ['the air', 'the water', 'their food'], a: 1, why: 'The water, via the gills!' },
      { type: 'label', q: 'Label the fish.', art: 'fish', slots: ['gills', 'fin', 'tail'] },
      { type: 'tf', q: 'True or false?', items: [['A swim bladder helps a fish float.', true], ['Eggs hatch faster in cold water.', false], ['A hungry fish is ready to breed.', false]],
        why: [null, 'Warm is faster!', 'Feed it first!'] },
      { type: 'order', q: 'Number the steps in order.', steps: ['Feed', 'Date', 'Lay eggs', 'Hatch'], why: 'Feed, date, eggs, hatch!' },
    ],
  },

  // ------------------------------------------------------------------ 2. BUILDER BEAVERS
  builder: {
    title: 'Builder Beavers', number: 2, doodle: 'beaver', color: 'blue', testTitle: 'Builder Beavers',
    steps: [
      { cam: 'board', say: 'Hard hats on! Small things like flowers **pop** in the moment you place them. The big builds? **Beavers.**', expr: 'determined', sfx: 'class_bell', react: 'bang', tap: 'lodge',
        draw: [TITLE('BUILDER BEAVERS', 'blue'), D('flower', 26, 50, { scale: 2 }), T('POP!', 56, 48, { color: 'yellow' }), D('lodge', 116, 48, { scale: 2, id: 'lodge' }), D('beaver', 160, 54), D('hammer', 180, 46)] },
      { show3d: 'stream', cam: 'demoTop', labels: ['stream'], hold: 1.5, expr: 'teacher',
        say: 'Real beavers are master builders. Here is a plain little **stream** in a meadow. Watch what ONE beaver does to it.' },
      { show3d: 'dam', cam: 'demoHigh', labels: ['dam'], hold: 6, expr: 'excited',
        say: 'Logs, sticks and mud: a **dam**! The water backs up behind it, and the stream starts turning into a **pond**.' },
      { show3d: 'wetland', cam: 'orbit', orbit: [0.4, 0.95, 24, 1.85, 0.95], labels: ['pond', 'wetland'], hold: 3, expr: 'magnifique', react: 'wow',
        say: 'A whole new **wetland**: cattails, lilies, frogs, ducks, fish. Scientists call beavers **ecosystem engineers**: they build homes for everyone.' },
      { erase: true, say: 'Beavers eat **bark**, leaves and water plants. Their front teeth **never stop growing**, so they chew all day. Iron makes them orange and tough!', expr: 'happy',
        draw: [TITLE('BEAVER FACTS', 'orange'), D('beaver', 40, 50, { scale: 2 }), { arrow: [64, 50, 84, 50] }, D('tree', 108, 46, { scale: 2 }), D('logs', 160, 54, { scale: 2 }), S('BARK + LEAVES', 108, 74, 'green'), S('TEETH KEEP GROWING', 96, 90, 'orange')] },
      { erase: true, say: 'Our beavers don\'t take coins. They work for **food**, served at their **Snack Bar**. No food, no work!', expr: 'smug', react: 'laugh', tap: 'bowl',
        draw: [TITLE('BEAVER PAY', 'orange'), D('beaver', 36, 50, { scale: 2 }), T('+', 70, 50, { scale: 2 }), D('bowl', 104, 52, { scale: 2, id: 'bowl' }), D('carrot', 136, 46), D('honey', 160, 48), { cross: [168, 26, 5] }, D('coin', 152, 26),
          T('NO FOOD, NO WORK!', 96, 80, { color: 'orange', id: 'nopay' }), { underline: 'nopay', color: 'red', wavy: true }] },
      { erase: true, say: 'That food grows in the garden. Plants make their own food from **sunlight**, water and air: **photosynthesis**. Only **ripe** plants can be harvested.', expr: 'teacher', tap: 'ripe', highlight: 'circle',
        draw: [TITLE('GREEN THUMB', 'green'), D('sun', 18, 34), { arrow: [26, 40, 34, 48] }, D('seed', 46, 56, { scale: 2 }), { arrow: [58, 56, 68, 56] }, D('sprout', 82, 54, { scale: 2 }), { arrow: [96, 56, 106, 56] },
          D('growing', 120, 54, { scale: 2 }), { arrow: [134, 56, 144, 56] }, D('ready', 162, 52, { scale: 2, id: 'ripe' }), S('SEED', 46, 76), S('SPROUT', 82, 76), S('GROWING', 120, 76), S('RIPE!', 162, 76, 'yellow')] },
      { erase: true, say: 'Out of room? The **Destroy** tool: drag a box over trees, pay the crew, they chop. You get the **land** and the **wood**.', expr: 'excited', camAfter: 'teacher',
        draw: [TITLE('CLEAR THE LAND', 'yellow'), D('tree', 26, 50, { scale: 2 }), D('tree', 58, 48, { scale: 2 }), D('rock', 86, 58), { box: [8, 26, 92, 44], color: 'yellow' }, { arrow: [108, 50, 128, 50] }, D('logs', 156, 50, { scale: 2 }), S('+LAND  +WOOD', 150, 72, 'green')] },
    ],
    test: [
      { type: 'label', q: 'Label the beaver\'s work.', art: 'dam', slots: ['pond', 'dam', 'stream'] },
      { type: 'choice', q: 'Beavers are "ecosystem engineers" because they...', opts: ['make wetlands', 'fix machines', 'eat fish'], a: 0, why: 'Dams make wetlands!' },
      { type: 'tf', q: 'True or false?', items: [['A beaver\'s front teeth never stop growing.', true], ['Our beavers work for coins.', false], ['Plants make food from sunlight.', true]],
        why: [null, 'Food, not coins!', null] },
      { type: 'order', q: 'Number the stages of a plant.', steps: ['Seed', 'Sprout', 'Growing', 'Ripe'], why: 'Seed, sprout, grow, ripe!' },
    ],
  },

  // ------------------------------------------------------------------ 3. CUSTOMERS = MONEY (the game's real numbers, src/game/lessons/econ.js)
  customers: {
    title: 'Customers = Money', number: 3, doodle: 'bear', color: 'orange', testTitle: 'Customers',
    steps: (game) => {
      const b = priceOf(game, 'bluegill', plain(1));
      return [
        { cam: 'wide', say: 'Our customers: **bears in suits**. From **tomorrow**, at **5 PM**, they come down that mountain. Hungry.', expr: 'greedy', react: 'bang' },
        { show3d: 'bears', cam: 'demoHigh', labels: ['office'], hold: 5, expr: 'excited',
          say: 'The whistle blows at **Bear St. Holdings**, and down the trail they run. Straight into our pond. Splash!' },
        { show3d: 'omnivore', cam: 'orbit', orbit: [0.4, 0.95, 24, 1.85, 0.95], labels: ['berries', 'honey', 'fish'], hold: 3, expr: 'teacher',
          say: 'Real bears are **omnivores**: they eat plants AND animals. Berries, honey, roots, bugs... and fish.' },
        { erase: true, say: 'Before winter a wild bear can eat about **20,000 calories a day** to fatten up. That\'s like forty cheeseburgers. Every. Day.', expr: 'shocked', react: 'gasp',
          draw: [TITLE('BEAR APPETITE', 'orange'), D('bear', 36, 52, { scale: 2 }), T('=', 70, 52, { scale: 2 }), D('berries', 96, 50, { scale: 2 }), D('honey', 128, 50), D('fish', 156, 50), S('20,000 CALORIES A DAY', 96, 80, 'yellow')] },
        { erase: true, say: `Here, every fish a bear eats is a **bill**. A plain Bluegill pays **${b}**. A **Golden** Bluegill pays **${b * 5}**.`, expr: 'greedy', tap: 'gold',
          draw: [TITLE('WHAT PAYS?', 'orange'), D('fish', 50, 48, { scale: 2 }), S(`${b}`, 50, 70, 'white'), D('fish_gold', 142, 48, { scale: 2, id: 'gold' }), S(`${b * 5}`, 142, 70, 'yellow'), T('X5', 96, 48, { color: 'yellow' })] },
        { erase: true, say: 'Why? **Supply and demand.** Golden fish are **rare**, and every bear wants one. Few of them plus lots of wanting means a **high price**.', expr: 'scheming', react: 'wow',
          draw: [TITLE('SUPPLY & DEMAND', 'yellow'), D('fish', 22, 40), D('fish', 46, 40), D('fish', 22, 54), D('fish', 46, 54), S('LOTS = CHEAP', 34, 72, 'blue'),
            D('scale', 96, 50, { scale: 2 }), D('fish_gold', 156, 46, { scale: 2 }), S('RARE = $$$', 156, 72, 'yellow'), { bar: [138, 98, 10, 12], color: 'blue' }, { bar: [156, 98, 10, 24], color: 'yellow' }] },
        { show3d: 'rampage', cam: 'demo', dim: 0.6, shake: 0.5, hold: 2.5, expr: 'worried', react: 'gasp',
          say: 'Now the scary part. A hungry bear that finds **no fish** goes on a **rampage**. Smash, stomp, and **zero stars**.' },
        { erase: true, say: 'That\'s real biology: a **hungry** animal takes bigger risks and gets **aggressive**. So keep enough fish for everyone. And never feed a wild bear!', expr: 'teacher',
          draw: [TITLE('HUNGRY = GRUMPY', 'red'), D('bear_shadow', 50, 54, { scale: 2 }), D('smash', 96, 44, { scale: 2 }), D('review', 150, 46), { cross: [150, 46, 7] }, S('EMPTY POND = RAMPAGE', 96, 82, 'red')] },
        { show3d: 'happyBears', cam: 'demo', hold: 2.5, expr: 'proud', react: 'cheer',
          say: 'Full bears pay **bills and tips** and leave good **reviews**. Good reviews bring **more bears** tomorrow. That\'s the whole business!' },
      ];
    },
    test: (game) => {
      const b = priceOf(game, 'bluegill', plain(1));
      return [
        { type: 'choice', q: 'Real bears eat plants AND animals. They are...', opts: ['herbivores', 'carnivores', 'omnivores'], a: 2, why: 'Omnivores!' },
        { type: 'match', q: 'Match what happens.', pairs: [['A rare fish', 'a high price'], ['An empty pond', 'a rampage'], ['Full bears', 'good reviews']] },
        { type: 'tf', q: 'True or false?', items: [['Hungry animals stay calm.', false], ['Bears come down at 5 PM.', true], ['Lots of something makes it cheap.', true]],
          why: ['They get grumpy!', null, null] },
        { type: 'choice', q: `A plain Bluegill pays ${b}. A Golden one pays...`, opts: [`${b}`, `${b * 2}`, `${b * 5}`], a: 2, why: 'Five times more!' },
      ];
    },
  },
};

// the old lesson ids now resolve to the short ones
export const LESSON_ALIASES = { condition: 'pondlife', fishlife: 'pondlife', build: 'builder', plants: 'builder', foods: 'builder', bears: 'customers', stars: 'customers' };
