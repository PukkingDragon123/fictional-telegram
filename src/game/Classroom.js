// Professor Reynard's classroom: full-screen 3D lesson cutscenes for the
// tutorial. The fox (teacher outfit, pointer stick) walks between his desk
// and a big chalkboard, draws chalk doodles by hand (src/ui/Chalkboard.js),
// taps them with his pointer while explaining, and a class of fish students
// in fishbowls reacts (src/entities/classroomScene.js).
//
//   const cls = new Classroom(game);
//   await cls.lesson('breeding');          // built-in: condition, breeding, genes, mutations, foods, plants
//   await cls.lesson({ title: 'My Lesson', doodle: 'fish', steps: [
//     { say: 'Hello **class**!', cam: 'wide', expr: 'happy', react: 'heart' },
//     { say: 'A fish!', draw: [{ doodle: 'fish', x: 96, y: 54, scale: 2, id: 'f' }], tap: 'f' },
//     { erase: true, say: 'All gone.' },
//   ] });
//   cls.active; cls.skip(); cls.update(realDt)   // call update every frame (else it self-drives)
//
// While a lesson runs it owns game.overrideScene / overrideRig, pauses the
// game, locks input and adds body.class-mode; every previous value is saved
// and restored on the way out. Works with a minimal fake `game` (see
// tools/classroom-preview.js): only `renderer` (PixelRenderer-like: lowW,
// lowH, rtW, rtH...) and `state` are really needed.
import * as THREE from 'three';
import { CameraRig } from '../core/cameraRig.js';
import { Transition } from '../ui/Transition.js';
import { Chalkboard, measureText, slateURL } from '../ui/Chalkboard.js';
import { spriteImg, hasSprite } from '../ui/sprites.js';
import { buildClassroom, BOARD } from '../entities/classroomScene.js';
import '../ui/classroom.css';

const mods = import.meta.glob(['../entities/foxRig.js'], { eager: true });
const FoxMod = mods['../entities/foxRig.js'] || null;

const FOX_SCALE = 1.3;
const WALK_SPEED = 1.35;
const SKIP = Symbol('skip');

// ------------------------------------------------------------------ lesson helpers
const T = (text, x, y, o = {}) => ({ text, x, y, ...o });
const D = (doodle, x, y, o = {}) => ({ doodle, x, y, ...o });
const TITLE = (text, color = 'yellow', o = {}) => ({ text, x: 96, y: 9, scale: measureText(text, 2).w <= 184 ? 2 : 1, color, id: 'title', ...o });

// Built-in lessons. Facts follow the game (FishSystem, genes.js, data/foods.js, data/crops.js).
export const LESSONS = {
  condition: {
    title: "How's my fish?", number: 1, doodle: 'magnifier', color: 'yellow',
    steps: [
      { cam: 'board', say: 'Class! Is your fish **happy and healthy**? Let\'s check!', expr: 'teacher', react: 'bang',
        draw: [TITLE("HOW'S MY FISH?"), D('fish', 42, 54, { scale: 2, id: 'fish' })] },
      { say: 'Every fish has two meters: **Hunger** and **Happiness**.', tap: 'hunger',
        draw: [T('HUNGER', 82, 42, { align: 'left', color: 'orange' }), { meter: [124, 38, 56, 8], value: 0.3, color: 'orange', id: 'hunger' },
          T('HAPPY', 82, 60, { align: 'left', color: 'pink' }), { meter: [124, 56, 56, 8], value: 0.85, color: 'pink', id: 'happy' }] },
      { say: 'Hungry? Pick the **Food tool** and tap the water. Pellets!', tap: 'bag', react: { kind: 'heart', who: ['pip', 'chub'] },
        draw: [D('bag', 26, 88, { scale: 2, id: 'bag' }), D('pellet', 54, 80), { arrow: [64, 88, 90, 88] }, D('fish_full', 122, 88, { scale: 2, id: 'full' }), T('YUM!', 170, 86, { color: 'yellow' })] },
      { erase: true, say: '**Pet** them and **decorate** the pond. Happy fish, happy bears!', react: 'heart', tap: 'pet',
        draw: [D('hand', 34, 34, { scale: 2, id: 'pet' }), D('heart', 58, 22), T('PET', 34, 60, { color: 'pink' }),
          D('flower', 104, 32, { scale: 2 }), D('lilypad', 144, 36, { scale: 2 }), T('PRETTY POND', 124, 60, { color: 'green' })] },
      { say: 'Little **fry** grow up into big adults.', tap: 'adult',
        draw: [D('minifish', 34, 88, { scale: 2, id: 'fry' }), { arrow: [54, 88, 82, 88] }, D('fish', 116, 88, { scale: 2, id: 'adult' }), T('GROW!', 166, 88, { color: 'yellow' })] },
      { erase: true, say: 'NEW RULE! A fish must be **WELL FED** before it can breed!', expr: 'shocked', react: 'bang', tap: 'fed', highlight: 'circle',
        draw: [TITLE('NEW RULE!', 'pink'), D('heart_big', 40, 54, { scale: 2, id: 'heart' }), T('WELL FED', 124, 40, { color: 'yellow' }), { meter: [84, 52, 82, 10], value: 1, color: 'pink', id: 'fed' }, T('= LOVE TIME', 126, 78, { color: 'pink' })] },
      { erase: true, say: 'At a glance: **hungry**... **fed**... **ready ♥**!', tap: ['hungry', 'fed2', 'ready'],
        draw: [D('fish_hungry', 32, 48, { scale: 2, id: 'hungry' }), D('fish_full', 96, 48, { scale: 2, id: 'fed2' }), D('fish_heart', 160, 44, { scale: 2, id: 'ready' }),
          T('HUNGRY', 32, 80, { color: 'blue' }), T('FED', 96, 80, { color: 'orange' }), T('READY', 160, 80, { color: 'pink' })] },
      { say: 'Hungry? Feed it. Ready? Time for **love**! Got it, class?', react: 'cheer', expr: 'happy',
        draw: [{ cross: [32, 96, 5] }, { check: [96, 96, 5] }, { check: [160, 96, 5] }, D('heart', 176, 95)] },
    ],
  },
  breeding: {
    title: 'Love & Eggs', number: 2, doodle: 'heart', color: 'pink',
    steps: [
      { cam: 'board', say: 'Today: how fish make **babies**!', expr: 'love', react: 'heart',
        draw: [TITLE('LOVE & EGGS', 'pink'), D('fish_m', 42, 46, { scale: 2, id: 'dad' }), T('+', 96, 46, { scale: 2 }), D('fish_f', 150, 46, { scale: 2, id: 'mum' })] },
      { say: 'You need an adult **boy ♂** and **girl ♀**. Both **well fed** and happy!', tap: ['dad', 'mum'],
        draw: [T('ADULT + FED', 96, 72, { color: 'yellow' }), { check: [42, 74, 5] }, { check: [150, 74, 5] }] },
      { say: 'Same species... or mix two for a surprise **HYBRID**!', react: 'wow',
        draw: [T('SAME KIND', 46, 94), T('OR', 96, 94, { color: 'yellow' }), T('HYBRID?!', 146, 94, { color: 'lilac', id: 'hybrid' }), D('question', 180, 92)] },
      { erase: true, say: 'Stage 1: a **date**! They swim together with hearts.', tap: 's1',
        draw: [TITLE('5 STAGES', 'yellow'), D('fish_heart', 21, 42, { id: 's1' }), T('1 DATE', 21, 64, { color: 'pink' })] },
      { say: 'Stage 2: mum **lays** a clutch of eggs.', tap: 's2',
        draw: [D('clutch', 59, 44, { id: 's2' }), T('2 LAY', 59, 64, { color: 'orange' })] },
      { say: 'Stage 3: dad **guards** the eggs and fertilizes them.', tap: 's3',
        draw: [D('fish_m', 97, 42, { id: 's3' }), T('3 DAD', 97, 64, { color: 'blue' })] },
      { say: 'Stage 4: **incubate**! A timer runs. Eggs glow when ready.', tap: 's4',
        draw: [D('egg_glow', 135, 42, { id: 's4' }), D('timer', 135, 26), T('4 WAIT', 135, 64, { color: 'yellow' })] },
      { say: 'Stage 5: **TAP** the eggs to hatch them!', react: 'cheer', tap: 's5', highlight: 'circle',
        draw: [D('hand', 172, 32, { id: 'tap' }), D('egg', 172, 48, { id: 's5' }), T('5 TAP!', 172, 64, { color: 'green' })] },
      { say: 'After breeding they\'re hungry: **feed them again**!',
        draw: [D('bag', 22, 92), { arrow: [32, 92, 44, 92] }, T('FEED AGAIN', 76, 92, { color: 'orange' })] },
      { say: 'Pro tip: a **glass tank** keeps a pair private. And bear-proof!', react: 'laugh', tap: 'tank',
        draw: [D('tank', 138, 92, { id: 'tank' }), D('bear', 174, 92, { id: 'bear' }), { cross: [174, 92, 7] }] },
    ],
  },
  genes: {
    title: 'Genes 101', number: 3, doodle: 'dna', color: 'blue',
    steps: [
      { cam: 'board', say: 'Babies **inherit** genes from mum and dad!', expr: 'teacher', react: 'bang',
        draw: [TITLE('GENES 101', 'blue'), D('fish_f', 32, 40, { id: 'mum' }), D('fish_m', 32, 72, { id: 'dad' }), { arrow: [50, 44, 76, 54] }, { arrow: [50, 70, 76, 60] },
          D('dna', 96, 56, { scale: 2, id: 'dna' }), { arrow: [114, 56, 138, 56] }, D('minifish', 162, 56, { scale: 2, id: 'baby' })] },
      { erase: true, say: '**Size**: S, M, L or XL. Big parents, big babies!', tap: 'xl',
        draw: [T('SIZE', 20, 14, { color: 'yellow' }), T('S', 50, 14), T('M', 66, 14), T('L', 86, 13, { scale: 2 }), T('XL', 112, 13, { scale: 2, id: 'xl' }), D('tiny', 148, 14), D('fish', 174, 13)] },
      { say: 'Colour **morphs**: Wild, Albino, Melanistic, Calico, Ghost, Golden... and **Prismatic**!', tap: 'prism', react: 'wow',
        draw: ['fish', 'fish_albino', 'fish_dark', 'fish_calico', 'fish_ghost', 'fish_gold', 'fish_rainbow'].map((n, i) => D(n, 18 + i * 26, 38, { id: n === 'fish_rainbow' ? 'prism' : undefined })) },
      { say: '**Traits**: Fertile, Chonky, Speedy, Lucky, Sparkly, Hardy... or Glutton and Shy.',
        draw: [['FERTILE', 'pink'], ['CHONKY', 'orange'], ['SPEEDY', 'blue'], ['LUCKY', 'green'], ['SPARKLY', 'yellow'], ['HARDY', 'white'], ['GLUTTON', 'red'], ['SHY', 'lilac']]
          .map(([w, c], i) => T(w, 26 + (i % 4) * 47, 62 + Math.floor(i / 4) * 12, { color: c, id: 't' + i })) },
      { say: 'And a **star rating**: Common up to **Legendary**!', tap: 'stars',
        draw: [...[0, 1, 2, 3, 4].map((i) => ({ star: [24 + i * 15, 96, 5], id: i === 4 ? 'stars' : undefined })), T('RARE = $$$', 146, 96, { color: 'yellow' })] },
      { erase: true, say: 'Better parents make **better babies**. Breed your best!', react: 'cheer', expr: 'proud',
        draw: [D('fish_star', 44, 46, { scale: 2 }), T('+', 96, 50, { scale: 2 }), D('fish_star', 150, 46, { scale: 2, flip: true }), T('= SUPER BABY!', 96, 88, { color: 'yellow', id: 'super' }), { underline: 'super', wavy: true, color: 'pink' }] },
    ],
  },
  mutations: {
    title: 'Mutations!', number: 4, doodle: 'sparkle', color: 'lilac',
    steps: [
      { cam: 'board', say: 'Sometimes genes **MUTATE**! Flashy extras!', expr: 'excited', react: 'wow',
        draw: [TITLE('MUTATIONS!', 'lilac'), D('sparkle', 16, 9), D('sparkle', 176, 9)] },
      { say: '**Tiny**, **Frozen**, **Candy**, **Hot**, **Zombie**...', tap: 'zombie',
        draw: [['tiny', 'TINY', 'blue'], ['snowflake', 'FROZEN', 'blue'], ['candy', 'CANDY', 'pink'], ['flame', 'HOT', 'orange'], ['zombie', 'ZOMBIE', 'green']]
          .flatMap(([d, w, c], i) => [D(d, 22 + i * 37, 36, { id: d }), T(w, 22 + i * 37, 52, { font: 'small', color: c })]) },
      { say: '...**Shiny**, **Titan**, **Doge**, **Double Hot** and **Galaxy**!', tap: 'galaxy', react: 'laugh',
        draw: [['sparkle', 'SHINY', 'yellow'], ['titan', 'TITAN', 'blue'], ['doge', 'DOGE', 'orange'], ['flame2', 'DOUBLE HOT', 'red'], ['galaxy', 'GALAXY', 'lilac']]
          .flatMap(([d, w, c], i) => [D(d, 22 + i * 37, 72, { id: d }), T(w, 22 + i * 37, 90, { font: 'small', color: c })]) },
      { erase: true, say: 'Rarer mutation = **way more coins**!', react: 'wow', tap: 'galaxy2',
        draw: [D('galaxy', 36, 34, { scale: 2, id: 'galaxy2' }), T('=', 72, 34, { scale: 2 }), D('coin', 102, 34, { scale: 2 }), D('coin', 128, 34, { scale: 2 }), D('coin', 154, 34, { scale: 2 }), T('$$$', 182, 34, { color: 'yellow' })] },
      { say: 'Boost **mutation luck**: Royal Pearls, Four-Leaf Clovers, Moonberries, and the **Lucky** trait!', tap: ['pearl', 'clover', 'berry'],
        draw: [D('pearl', 26, 74, { scale: 2, id: 'pearl' }), D('clover', 70, 74, { scale: 2, id: 'clover' }), D('moonberry', 114, 74, { scale: 2, id: 'berry' }), T('LUCKY', 162, 74, { color: 'green' }), T('= LUCK UP!', 96, 100, { color: 'yellow' })] },
      { erase: true, say: 'Every new morph goes in your **Encyclopedia**. Collect them all!', react: 'cheer', expr: 'proud',
        draw: [D('book', 96, 42, { scale: 2, id: 'book' }), D('star', 52, 40), D('star', 140, 40), T('COLLECT THEM ALL!', 96, 78, { color: 'yellow', id: 'all' }), { underline: 'all', color: 'pink' }] },
    ],
  },
  foods: {
    title: 'Snack Time', number: 5, doodle: 'bag', color: 'orange',
    steps: [
      { cam: 'board', say: 'Snack time! Fish food comes in **bags**. Buy them on **e-Buy**!', expr: 'yum', react: 'heart',
        draw: [TITLE('SNACK TIME', 'orange'), ...[['orange', 'PELLETS'], ['blue', 'FLAKES'], ['pink', 'WORMS'], ['red', 'KRILL'], ['yellow', 'MAPLE'], ['lilac', 'PEARLS']]
          .flatMap(([c, w], i) => [D('bag', 18 + i * 31, 38, { tint: c, id: 'b' + i }), T(w, 18 + i * 31, 54, { font: 'small', color: c })])] },
      { say: '**Classic Pellets**: the basics. They even refill a little by themselves!', tap: 'b0',
        draw: [D('pellet', 18, 70), { text: '+', x: 18, y: 84, color: 'orange' }] },
      { say: '**Rainbow Flakes** make fish happy. **Wiggle Worms**: well fed twice as fast!', tap: ['b1', 'b2'],
        draw: [D('happy', 49, 72), D('heart', 80, 70), T('X2', 80, 84, { color: 'pink' })] },
      { say: '**Krill Thrill**: fry grow up fast. **Maple Munchies**: a bit of everything!', tap: ['b3', 'b4'],
        draw: [D('minifish', 111, 70), T('GROW', 111, 84, { font: 'small', color: 'red' }), D('star', 142, 70), T('ALL', 142, 84, { font: 'small', color: 'yellow' })] },
      { say: '**Royal Pearls**: fancy! They give **mutation luck**.', tap: 'b5', react: 'wow',
        draw: [D('sparkle', 173, 70), T('LUCK', 173, 84, { font: 'small', color: 'lilac' })] },
      { erase: true, say: '**Bug Bites** are FREE: a **Bug Grinder** turns bugs into food!', react: 'laugh', tap: 'grinder',
        draw: [D('bug', 28, 40, { scale: 2 }), { arrow: [46, 40, 66, 40] }, D('grinder', 90, 40, { scale: 2, id: 'grinder' }), { arrow: [114, 40, 134, 40] }, D('bag', 158, 40, { scale: 2, tint: 'green' }), T('FREE!', 158, 68, { color: 'green' })] },
      { say: '**Garden veggies** work too!',
        draw: [D('carrot', 30, 90, { scale: 1 }), D('bush', 62, 90), D('golden_carrot', 94, 90), T('YUM!', 132, 90, { color: 'yellow' })] },
      { say: 'Pick a bag with the **Food tool**, then **tap the water**!', react: 'cheer', tap: 'tapw',
        draw: [D('hand', 168, 82, { id: 'tapw' }), { line: [152, 100, 184, 100], color: 'blue' }, D('pellet', 168, 96)] },
    ],
  },
  plants: {
    title: 'Green Thumb', number: 6, doodle: 'sprout', color: 'green',
    steps: [
      { cam: 'board', say: 'Plants grow from a **SEED**!', expr: 'happy', react: 'bang',
        draw: [TITLE('GREEN THUMB', 'green'), D('seed', 24, 48, { scale: 2, id: 'seed' }), T('SEED', 24, 72, { font: 'small' })] },
      { say: 'Seed, **sprout**, **growing**... **ready**!', tap: 'ready',
        draw: [{ arrow: [40, 52, 50, 52] }, D('sprout', 66, 48, { scale: 2 }), T('SPROUT', 66, 72, { font: 'small' }),
          { arrow: [82, 52, 92, 52] }, D('growing', 108, 48, { scale: 2 }), T('GROWING', 108, 72, { font: 'small' }),
          { arrow: [124, 52, 134, 52] }, D('ready', 150, 48, { scale: 2, id: 'ready' }), T('READY!', 150, 72, { font: 'small', color: 'yellow' })] },
      { say: 'Tap a ready plant to **HARVEST** its batch!', react: 'heart', tap: 'ready', highlight: 'circle',
        draw: [D('basket', 180, 90, { id: 'basket' }), { arrow: [160, 86, 170, 88] }] },
      { erase: true, say: 'Batches have **rarity**, like eggs. Lucky ones hide **specials**!', tap: 'gold', react: 'wow',
        draw: [...[0, 1, 2, 3, 4].map((i) => ({ star: [26 + i * 14, 16, 5] })), T('RARITY', 130, 16, { color: 'yellow' }),
          D('golden_carrot', 96, 52, { scale: 2, id: 'gold' }), T('GOLDEN CARROT!', 96, 84, { color: 'yellow' })] },
      { erase: true, say: 'Produce feeds **fish** and fills **Snack Bowls** and the **Pantry** for bears...',
        draw: [D('carrot', 96, 16), { arrow: [86, 22, 46, 40] }, { arrow: [96, 28, 96, 40] }, { arrow: [106, 22, 146, 40] },
          D('fish', 40, 56, { id: 'f' }), D('bowl', 96, 56, { scale: 2, id: 'bowl' }), T('FISH', 40, 76), T('BEARS', 96, 76)] },
      { say: '...and it **PAYS the beavers** at the Snack Bar. No pay, no work!', react: 'laugh', tap: 'beaver', expr: 'smug',
        draw: [D('beaver', 152, 54, { scale: 2, id: 'beaver' }), T('BEAVERS', 152, 76), T('NO PAY, NO WORK!', 96, 96, { color: 'orange' })] },
      { erase: true, say: 'Water plants! **Seaweed**: fish graze. **Lily pads**: fish hide from bears.', tap: ['weed', 'lily'],
        draw: [D('seaweed', 30, 42, { scale: 2, id: 'weed' }), T('SNACK', 30, 76, { color: 'green' }), D('lilypad', 96, 46, { scale: 2, id: 'lily' }), T('HIDE', 96, 76, { color: 'green' })] },
      { say: '**Cattails** bring bugs: a **breeding boost**!', react: 'heart', tap: 'cat',
        draw: [D('cattail', 160, 42, { scale: 2, id: 'cat' }), T('LOVE +', 160, 76, { color: 'pink' })] },
      { say: '**Sprinklers** and **bunnies** make plants grow faster!', react: 'cheer', tap: 'bun',
        draw: [D('sprinkler', 44, 96), T('+', 66, 96), D('bunny', 86, 96, { id: 'bun' }), T('= FASTER!', 138, 96, { color: 'yellow' })] },
    ],
  },
};
export const LESSON_IDS = Object.keys(LESSONS);

// portrait sprite for a rig expression
const PORTRAIT = { smug: 'smug', greedy: 'greedy', shocked: 'shocked', laugh: 'laugh', wink: 'wink', angry: 'angry', worried: 'worried', sleepy: 'sleepy',
  happy: 'laugh', excited: 'laugh', proud: 'smug', teacher: 'smug', love: 'wink', yum: 'greedy', scheming: 'greedy', alarmed: 'shocked', confused: 'worried', focused: 'smug', magnifique: 'wink' };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class Classroom {
  constructor(game) {
    this.game = game;
    this._active = false;
    this.room = null;
    this.scene = null;
    this.fox = null;
    this.rig = new CameraRig();
    this.rig.freeBounds = true;
    this.clock = 0;
    this._timers = [];
    this._chain = Promise.resolve();
    this._ext = 0;
    this._raf = 0;
    this.ui = null;
    this.selfDrive = true; // drive itself from rAF when update() isn't being called
  }

  get active() { return this._active; }

  /** Build the room + fox ahead of time (avoids a hitch on the first lesson). */
  preload() { this._build(); return this; }

  /** Play a lesson (id or script). Resolves { completed, skipped } after the room is gone. */
  lesson(idOrScript, opts = {}) {
    const script = typeof idOrScript === 'string' ? LESSONS[idOrScript] : idOrScript;
    if (!script || !Array.isArray(script.steps)) { console.warn('Classroom: unknown lesson', idOrScript); return Promise.resolve({ completed: false, skipped: false }); }
    const run = this._chain.then(() => this._run(script, opts));
    this._chain = run.catch(() => {});
    return run;
  }

  /** End the current lesson early (goes straight to the exit). */
  skip() {
    if (!this._active || this._skip) return;
    this._skip = true;
    this.board?.finish();
    this.titleBoard?.finish();
    this._finishType();
    const fr = this.foxState?.res;
    if (fr) { this.foxState.res = null; this.foxState.goal = null; fr(); }
    this.game.audio?.stopBabble?.();
    for (const t of this._timers.splice(0)) t.res();
    this._clickRes?.();
  }

  /** Call every frame with the real dt (Game.update). */
  update(dt) {
    if (!this._active) return;
    this._ext = performance.now();
    this._tick(dt);
  }

  dispose() {
    this.skip();
    this.room?.dispose();
    this.fox?.dispose?.();
    this.room = null; this.fox = null; this.scene = null;
  }

  // ---------------------------------------------------------------- build
  _build() {
    if (this.room) return;
    this.room = buildClassroom();
    this.board = this.room.board.chalk;
    this.board.onSound = (name, o) => {
      const map = { chalk_down: 'class_chalk_down', chalk: 'class_chalk', erase: 'class_erase' };
      this._sfx(map[name] || name, o);
    };
    const sc = new THREE.Scene();
    sc.background = new THREE.Color(this.room.background);
    sc.add(this.room.group);
    this.scene = sc;
    if (FoxMod?.FoxRig) {
      try {
        const fox = new FoxMod.FoxRig({ shadows: true });
        fox.setOutfit?.('teacher');
        fox.root.scale.setScalar(FOX_SCALE);
        sc.add(fox.root);
        fox.onEvent = (name) => this._foxEvent(name);
        this.fox = fox;
      } catch (e) { console.warn('Classroom: FoxRig failed', e); this.fox = null; }
    }
    this.aimV = new THREE.Vector3();
    this.foxState = { goal: null, yaw: 0, follow: null, res: null };
  }

  // ---------------------------------------------------------------- timing
  wait(sec) {
    if (this._skip) return Promise.reject(SKIP);
    return new Promise((res, rej) => { this._timers.push({ t: this.clock + sec, res: () => (this._skip ? rej(SKIP) : res()) }); });
  }
  _check() { if (this._skip) throw SKIP; }
  // resolve once the condition holds (polled every tick)
  until(fn, max = 30) {
    return new Promise((res, rej) => {
      const t0 = this.clock;
      const poll = { t: 0, poll: () => fn() || this.clock - t0 > max, res: () => (this._skip ? rej(SKIP) : res()) };
      this._timers.push(poll);
    });
  }

  // ---------------------------------------------------------------- flow
  async _run(script, opts) {
    const game = this.game;
    this._skip = false;
    this._active = true;
    this.clock = 0;
    this._build();
    const result = { completed: false, skipped: false };
    // remember everything we touch, restore it exactly on the way out
    this.saved = {
      overrideScene: game.overrideScene ?? null, overrideRig: game.overrideRig ?? null,
      paused: game.state ? game.state.paused : undefined, inputLocked: game.inputLocked,
      music: game.audio?.getMusic?.() ?? null,
    };
    this._selfDrive();
    try {
      await this._wipe(opts.transition || 'iris', () => this._enterScene(script));
      this._check();
      await this._intro(script);
      for (const st of script.steps) { this._check(); await this._step(st); }
      this._check();
      await this._outro(script);
      result.completed = true;
    } catch (e) {
      if (e !== SKIP) console.warn('Classroom lesson error', e);
      result.skipped = e === SKIP;
    }
    this._skip = false;
    await this._wipe('blocks', () => this._leaveScene());
    this._active = false;
    cancelAnimationFrame(this._raf); this._raf = 0;
    return result;
  }

  _wipe(kind, mid) {
    const ui = this.game.ui;
    if (ui?.wipeTransition) return ui.wipeTransition(kind, mid);
    try { this._trans ||= new Transition(); return this._trans.wipe(kind, mid); } catch { mid(); return Promise.resolve(); }
  }

  _enterScene(script) {
    const game = this.game;
    game.overrideScene = this.scene;
    game.overrideRig = this.rig;
    if (game.state) game.state.paused = true;
    game.inputLocked = true;
    document.body.classList.add('class-mode');
    game.audio?.setMusic?.(script.music || 'morning');
    this._sfx('class_bell', { volume: 0.5 });
    this.room.setNight(!!(game.sky?.state?.night > 0.5));
    if (game.state?.hour != null) this.room.setClock(game.state.hour);
    this.board.clear();
    this._buildUI();
    // fox at his desk, camera wide
    const f = this.fox;
    if (f) {
      const a = this.room.anchors.deskSpot;
      f.root.position.copy(a.position);
      f.root.rotation.y = this.foxState.yaw = a.rotationY;
      f.setAim?.(null);
      f.holdProp?.('pointer');
      f.play(this._anim('wave_hello', 'wave'), { loop: false, fade: 0 });
    }
    this.room.students.setSleepy(true);
    this.room.students.lookAtX(this.room.anchors.teacherSpot.position.x);
    this.cam('wide', true);
    this._tick(0);
  }

  _leaveScene() {
    const game = this.game, s = this.saved || {};
    game.overrideScene = s.overrideScene ?? null;
    game.overrideRig = s.overrideRig ?? null;
    if (game.state && s.paused !== undefined) game.state.paused = s.paused;
    game.inputLocked = s.inputLocked ?? false;
    if (game.audio?.setMusic && s.music !== undefined) game.audio.setMusic(s.music);
    game.audio?.stopBabble?.();
    document.body.classList.remove('class-mode');
    this.fox?.setAim?.(null);
    this._removeUI();
  }

  async _intro(script) {
    const f = this.fox;
    await this._titleCard(script);
    this.room.students.react('bang', { stagger: 0.08 });
    if (f) f.setExpression?.('happy', { hold: 1.5 });
    await this.wait(0.3);
    await this.walkTo(this.room.anchors.teacherSpot.position, this.room.anchors.teacherSpot.rotationY);
    this._idle();
  }

  async _outro() {
    this.cam('wide');
    this.fox?.setAim?.(null);
    await this.walkTo(this.room.anchors.teacherSpot.position, 0.15);
    this.fox?.play(this._anim('bow_fancy', 'bow'), { loop: false, onDone: () => this._idle() });
    this.fox?.setExpression?.('proud', { hold: 3 });
    this.room.students.react('cheer', { stagger: 0.1 });
    this._sfx('class_cheer', { volume: 0.5 });
    this._hideSay();
    await this.wait(0.5);
    this._stamp();
    await Promise.race([this.wait(4.5), this._click(0.8)]);
  }

  async _step(st) {
    const room = this.room;
    if (st.erase) {
      this._hideSay();
      await this._erase();
    }
    this._check();
    if (st.cam) this.cam(st.cam);
    else if (st.draw || st.tap) this.cam('board');
    this._busy = true;
    const line = this._say(st.say || '', st.expr);
    if (st.react && !st.draw) this._react(st.react);
    if (st.anim && this.fox) this.fox.play(this._anim(st.anim, 'talk'), { loop: false, onDone: () => this._idle() });
    if (st.draw) {
      await this._draw(st.draw, st.speed || 1);
      if (st.react) this._react(st.react);
    }
    if (st.tap) for (const id of [].concat(st.tap)) { this._check(); await this._tap(id, st.highlight); }
    if (!st.draw && !st.tap) { this._idle(true); }
    await line.typed;
    this._busy = false;
    this._check();
    if (st.wait != null) await Promise.race([this.wait(st.wait), this._click()]);
    else await this._click();
    room.board.chalk.finish();
    this._sfx('class_pop', { volume: 0.25, pitch: 1.3 });
  }

  // ---------------------------------------------------------------- fox choreography
  _anim(name, fallback = 'idle') {
    const list = this.fox?.anims || [];
    return list.includes(name) ? name : list.includes(fallback) ? fallback : 'idle';
  }
  _expr(name) {
    const f = this.fox;
    if (!f || !name) return;
    if (!f.expressions || f.expressions.includes(name)) f.setExpression(name, { hold: 2.5 });
  }
  _idle(explain = false) {
    const f = this.fox;
    if (!f) return;
    f.setAim?.(null);
    if (this.foxState.goal) return;
    f.play(explain ? this._anim('teach_explain', 'talk') : this._anim('teach_point', 'idle'), { loop: true, fade: 0.3 });
    if (!explain) f.setAim?.(null);
    this.foxState.faceCam = true;
  }

  walkTo(pos, yaw = null) {
    const f = this.fox;
    if (!f) return Promise.resolve();
    return new Promise((res) => {
      const fs = this.foxState;
      fs.res?.();
      fs.goal = pos.clone(); fs.goalYaw = yaw; fs.res = res; fs.follow = null; fs.faceCam = false;
      if (f.root.position.distanceTo(pos) > 0.06) f.play('walk', { loop: true, fade: 0.2 });
    });
  }

  // where to stand to touch the board at world point p with the chalk / pointer
  _standFor(p, tool) {
    const off = tool === 'chalk' ? { x: -0.34, z: 0.5 } : { x: 0.95, z: 0.74 };
    const x = Math.max(BOARD.cx - BOARD.w / 2 - 0.2, Math.min(BOARD.cx + BOARD.w / 2 + 1.0, p.x + off.x));
    return new THREE.Vector3(x, 0, BOARD.z + off.z);
  }

  async _draw(items, speed = 1) {
    const f = this.fox, room = this.room;
    const list = [].concat(items);
    const first = list.find((it) => it && (it.x != null || Array.isArray(it.arrow) || Array.isArray(it.line)));
    if (f) {
      f.holdProp?.('chalk');
      let x0 = 96, y0 = 54;
      if (first) { const a = first.arrow || first.line; x0 = a ? a[0] : first.x; y0 = a ? a[1] : first.y; }
      const p = room.board.pxToWorld(x0, y0, new THREE.Vector3());
      await this.walkTo(this._standFor(p, 'chalk'), Math.PI - 0.3);
      this._check();
      f.play(this._anim('chalk_draw', 'idle'), { loop: true, fade: 0.25 });
      this.aimV.copy(p);
      f.setAim?.(this.aimV);
      this.foxState.follow = 'chalk';
    }
    await this.board.draw(list, { speed });
    this.foxState.follow = null;
    if (f) {
      f.setAim?.(null);
      f.holdProp?.('pointer');
      f.play(this._anim('teach_explain', 'talk'), { loop: true, fade: 0.3 });
    }
  }

  async _tap(id, mode = 'pulse') {
    const f = this.fox, room = this.room;
    const p = room.board.itemWorld(id);
    if (!p) return;
    if (f) {
      f.holdProp?.('pointer');
      const stand = this._standFor(p, 'pointer');
      if (f.root.position.distanceTo(stand) > 0.3) await this.walkTo(stand, -Math.PI / 2 - 0.5);
      this._check();
      this.aimV.copy(p);
      f.setAim?.(this.aimV);
      this._tapId = id; this._tapMode = mode; this._tapped = false;
      f.play(this._anim('teach_tap', 'point'), { loop: false, fade: 0.2 });
      // fallback: if the rig never emits 'tap', highlight anyway
      await this.wait(0.55);
      if (!this._tapped) this._foxEvent('tap');
      await this.wait(this._busy ? 0.8 : 0.4);
    } else {
      this.board.highlight(id, { mode: mode === 'circle' ? 'circle' : 'pulse' });
      await this.wait(1);
    }
  }

  async _erase() {
    const f = this.fox, room = this.room;
    this.cam('board');
    if (f) {
      f.holdProp?.(null);
      const p = room.board.pxToWorld(20, 54, new THREE.Vector3());
      await this.walkTo(this._standFor(p, 'chalk'), Math.PI - 0.3);
      this._check();
      f.play(this._anim('chalk_draw', 'idle'), { loop: true, fade: 0.2 });
      this.aimV.copy(p);
      f.setAim?.(this.aimV);
      this.foxState.follow = 'chalk';
    }
    await this.board.erase({ animated: true, speed: 1.15 });
    this.board.clear();
    this.foxState.follow = null;
    f?.setAim?.(null);
    f?.holdProp?.('pointer');
    this._check();
  }

  _foxEvent(name) {
    if (name === 'tap' && this._tapId && !this._tapped) {
      this._tapped = true;
      this._sfx('class_tap', { volume: 0.55 });
      this.board.highlight(this._tapId, { mode: this._tapMode === 'circle' ? 'circle' : 'pulse' });
    } else if (name === 'tap') this._sfx('class_tap', { volume: 0.35, pitch: 1.1 });
    else if (name === 'step') this._sfx('footsteps', { volume: 0.12, pitch: 1.4 });
  }

  _react(r) {
    if (!r) return;
    const o = typeof r === 'string' ? { kind: r } : r;
    if (o.kind === 'bang') this.room.students.setSleepy(false);
    this.room.students.react(o.kind, { who: o.who ?? null });
    if (o.kind === 'cheer') this._sfx('class_cheer', { volume: 0.4 });
    else this._sfx('class_pop', { volume: 0.3, pitch: o.kind === 'heart' ? 1.4 : 1 });
  }

  // ---------------------------------------------------------------- camera
  cam(name, instant = false) {
    const a = typeof name === 'object' ? name : this.room.anchors['cam' + name[0].toUpperCase() + name.slice(1)] || this.room.anchors.camWide;
    if (a === this._camA && !instant) return;
    this._camA = a;
    const rig = this.rig, r = this.game.renderer;
    const wupp = Math.max(a.fit.w / Math.max(1, r.lowW || 640), a.fit.h / Math.max(1, r.lowH || 360));
    rig.goal.copy(a.target);
    rig.wuppGoal = wupp;
    rig.yawGoal = a.yaw || 0;
    rig.pitchGoal = a.pitch ?? THREE.MathUtils.degToRad(30);
    rig.minWupp = 0.0005; rig.maxWupp = 1;
    if (instant) { rig.target.copy(a.target); rig.wupp = wupp; rig.yaw = rig.yawGoal; rig.pitch = rig.pitchGoal; }
  }

  // ---------------------------------------------------------------- per frame
  _selfDrive() {
    // if nobody calls update() (e.g. the game loop isn't hooked up yet), drive ourselves
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!this._active) { this._raf = 0; return; }
      if (this.selfDrive && now - this._ext > 250) this._tick(dt);
      this._raf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(loop);
  }

  _tick(dt) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    this.clock += dt;
    // timers / polls
    for (let i = this._timers.length - 1; i >= 0; i--) {
      const t = this._timers[i];
      if ((t.poll && t.poll()) || (!t.poll && this.clock >= t.t)) { this._timers.splice(i, 1); t.res(); }
    }
    if (!this.room) return;
    this._tickFox(dt);
    this._tickUI(dt);
    this.room.update(dt, this.clock, this.rig.camera);
    if (this.game.renderer) this.rig.update(dt, this.game.renderer);
  }

  _tickFox(dt) {
    const f = this.fox;
    if (!f) return;
    const fs = this.foxState, root = f.root;
    if (fs.goal) {
      const d = new THREE.Vector3().subVectors(fs.goal, root.position).setY(0);
      const L = d.length();
      if (L > 0.03) {
        const step = Math.min(L, WALK_SPEED * dt);
        root.position.addScaledVector(d, step / L);
        fs.yaw = Math.atan2(d.x, d.z);
      } else {
        root.position.copy(fs.goal);
        fs.goal = null;
        if (fs.goalYaw != null) fs.yaw = fs.goalYaw;
        if (f.current === 'walk') f.play(this._anim('teach_point', 'idle'), { loop: true, fade: 0.2 });
        const r = fs.res; fs.res = null; r?.();
      }
    } else if (fs.follow === 'chalk') {
      // the chalk follows the board's stroke tip; shuffle along to keep it in reach
      const tip = this.board.tipPos();
      const w = this.room.board.pxToWorld(tip.x, tip.y, new THREE.Vector3(), 0.01);
      this.aimV.lerp(w, 1 - Math.exp(-dt * 22));
      const stand = this._standFor(w, 'chalk');
      const dx = stand.x - root.position.x;
      if (Math.abs(dx) > 0.12) root.position.x += Math.sign(dx) * Math.min(Math.abs(dx) - 0.1, dt * 1.6);
      root.position.z += (stand.z - root.position.z) * Math.min(1, dt * 4);
      fs.yaw = Math.PI - 0.3;
      // up on tiptoes for the top of the board
      const lift = Math.max(0, Math.min(0.1, (w.y - 1.3) * 0.4));
      root.position.y += (lift - root.position.y) * Math.min(1, dt * 8);
    } else if (fs.faceCam) {
      fs.yaw = this.room.anchors.teacherSpot.rotationY;
    }
    if (!fs.follow && root.position.y > 0) root.position.y = Math.max(0, root.position.y - dt * 0.6);
    let dy = fs.yaw - root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    root.rotation.y += dy * Math.min(1, dt * 7);
    f.update(dt);
  }

  // ---------------------------------------------------------------- UI overlay
  _buildUI() {
    this._removeUI();
    const el = document.createElement('div');
    el.className = 'cls-ui';
    el.innerHTML = `
      <div class="cls-bars"><i></i><i></i></div>
      <div class="cls-hit" data-h="hit"></div>
      <button class="cls-skip" data-h="skip" type="button">SKIP <b>▸▸</b></button>
      <div class="cls-title hidden" data-h="title"><div class="cls-title-wood"><canvas data-h="tcv"></canvas></div><i class="cls-title-nail l"></i><i class="cls-title-nail r"></i></div>
      <div class="cls-say hidden" data-h="say">
        <div class="cls-portrait" data-h="portrait"></div>
        <div class="cls-body"><div class="cls-name">PROF. REYNARD</div><div class="cls-text" data-h="text"></div></div>
        <div class="cls-next" data-h="next">▼</div>
      </div>
      <div class="cls-stamp hidden" data-h="stamp"></div>`;
    document.body.appendChild(el);
    this.ui = el;
    try { this.q('say').style.backgroundImage = `url(${slateURL(96, 40, 9)})`; } catch { /* no canvas */ }
    const adv = (e) => { e.preventDefault(); e.stopPropagation(); this.game.audio?.unlock?.(); this._advance(); };
    this.q('hit').addEventListener('pointerdown', adv);
    this.q('say').addEventListener('pointerdown', adv);
    this.q('title').addEventListener('pointerdown', adv);
    this.q('skip').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this._sfx('class_pop', { volume: 0.3 }); this.skip(); });
    this._onKey = (e) => {
      if (!this._active) return;
      const k = e.key;
      if (k === ' ' || k === 'Enter' || k === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) this._advance(); }
      else if (k === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.skip(); }
    };
    window.addEventListener('keydown', this._onKey, true);
    this.type = null;
  }
  _removeUI() {
    if (this._onKey) window.removeEventListener('keydown', this._onKey, true);
    this._onKey = null;
    this.ui?.remove();
    this.ui = null;
    this.titleBoard = null;
  }
  q(h) { return this.ui?.querySelector(`[data-h="${h}"]`); }

  _advance() {
    if (this._clickRes && this.clock - this._clickT >= this._clickMin) { const r = this._clickRes; this._clickRes = null; r(); return; }
    // still busy: finish the line + drawing now
    if (this.type && !this.type.done) this._finishType();
    if (this.board?.busy) this.board.hurry(8);
    if (this.titleBoard?.busy) this.titleBoard.finish();
    this._hurryT = 0.4;
  }
  _click(min = 0.15) {
    if (this._skip) return Promise.reject(SKIP);
    this.q('next')?.classList.add('on');
    return new Promise((res, rej) => {
      this._clickT = this.clock; this._clickMin = min;
      this._clickRes = () => { this.q('next')?.classList.remove('on'); this._skip ? rej(SKIP) : res(); };
    });
  }

  // typewriter line in the chalk box
  _say(text, expr) {
    const box = this.q('say');
    if (!box) return { typed: Promise.resolve() };
    box.classList.remove('hidden');
    const ex = expr || 'teacher';
    this._expr(ex);
    const port = PORTRAIT[ex] || 'smug';
    const pEl = this.q('portrait');
    pEl.innerHTML = hasSprite('fox_' + port) ? spriteImg('fox_' + port, 3) : '';
    pEl.classList.remove('bop'); void pEl.offsetWidth; pEl.classList.add('bop');
    // **bold** keywords and [[icon]] sprites, every char its own span
    const host = this.q('text');
    host.innerHTML = '';
    const atoms = [];
    const parts = String(text).split(/(\*\*[^*]+\*\*|\[\[[a-z0-9_]+\]\])/g);
    for (const part of parts) {
      if (!part) continue;
      const icon = part.match(/^\[\[([a-z0-9_]+)\]\]$/);
      if (icon) {
        const s = document.createElement('span');
        s.className = 'cls-ch cls-ico';
        s.innerHTML = hasSprite(icon[1]) ? spriteImg(icon[1], 2) : '';
        host.appendChild(s); atoms.push(s);
        continue;
      }
      const bold = part.startsWith('**');
      const str = bold ? part.slice(2, -2) : part;
      const wrap = bold ? document.createElement('b') : host;
      if (bold) host.appendChild(wrap);
      for (const word of str.split(/( )/)) {
        if (!word) continue;
        const w = document.createElement('span');
        w.className = word === ' ' ? 'cls-sp' : 'cls-w';
        for (const ch of word) {
          const s = document.createElement('span');
          s.className = 'cls-ch';
          s.innerHTML = esc(ch);
          w.appendChild(s); atoms.push(s);
        }
        wrap.appendChild(w);
      }
    }
    let res;
    const typed = new Promise((r) => { res = r; });
    this.type = { atoms, i: 0, acc: 0, done: atoms.length === 0, res, cps: 42 };
    if (this.type.done) res();
    const plain = String(text).replace(/\*\*|\[\[[a-z0-9_]+\]\]/g, '');
    this.game.audio?.babble?.('fox', plain);
    this.fox?.talk?.(plain);
    return { typed };
  }
  _finishType() {
    const t = this.type;
    if (!t || t.done) return;
    for (const a of t.atoms) a.classList.add('on');
    t.i = t.atoms.length; t.done = true; t.res();
  }
  _hideSay() { this.q('say')?.classList.add('hidden'); }

  _tickUI(dt) {
    const t = this.type;
    if (t && !t.done) {
      t.acc += dt * t.cps;
      while (t.acc >= 1 && t.i < t.atoms.length) { t.atoms[t.i++].classList.add('on'); t.acc -= 1; }
      if (t.i >= t.atoms.length) { t.done = true; t.res(); }
    }
    if (this.titleBoard) {
      this.titleBoard.update(dt);
    }
  }

  // lesson title card: a little slate on a wooden frame, chalk-written live
  async _titleCard(script) {
    const host = this.q('title');
    if (!host) return;
    const cv = this.q('tcv');
    const b = new Chalkboard({ w: 176, h: 56, canvas: cv, seed: 5 + (script.number || 0), ghosts: false });
    b.onSound = (n, o) => this._sfx(n === 'chalk' ? 'class_chalk' : 'class_chalk_down', { ...o, volume: (o?.volume || 0.4) * 0.6 });
    this.titleBoard = b;
    host.classList.remove('hidden', 'out');
    host.classList.add('in');
    this._sfx('class_whoosh', { volume: 0.4 });
    const title = String(script.title || 'Lesson').toUpperCase();
    const sc = measureText(title, 2).w <= 168 ? 2 : 1;
    const items = [
      { text: script.number ? `LESSON ${script.number}` : 'LESSON', x: 88, y: 8, color: script.color || 'yellow' },
      { text: title, x: 88, y: 26, scale: sc, id: 't' },
      { underline: 't', color: script.color || 'yellow', wavy: true },
    ];
    if (script.doodle) items.push({ doodle: script.doodle, x: 88, y: 46 });
    await this.wait(0.35);
    await Promise.race([b.draw(items, { speed: 1.6 }), this.wait(5)]);
    await Promise.race([this.wait(1.1), this._click(0.1)]);
    host.classList.remove('in'); host.classList.add('out');
    this._sfx('class_whoosh', { volume: 0.3, pitch: 1.2 });
    await this.wait(0.45);
    host.classList.add('hidden');
    this.titleBoard = null;
  }

  // gold-star "Lesson complete!" stamp
  _stamp() {
    const el = this.q('stamp');
    if (!el) return;
    el.innerHTML = `<canvas width="40" height="40"></canvas><b>LESSON COMPLETE!</b><i>Gold star for you!</i>`;
    drawGoldStar(el.querySelector('canvas'));
    el.classList.remove('hidden');
    void el.offsetWidth;
    el.classList.add('slam');
    this._sfx('class_stamp', { volume: 0.6 });
    setTimeout(() => this._sfx('class_star', { volume: 0.5 }), 260);
  }

  _sfx(name, o) { try { this.game.audio?.play?.(name, o); } catch { /* ignore */ } }
}

// a smiling gold star sticker (pixel art)
function drawGoldStar(cv) {
  const ctx = cv.getContext('2d');
  const W = 40, cx = 20, cy = 21;
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 8 : 18.5; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  const inside = (x, y) => {
    let ins = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  };
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = inside(x + 0.5, y + 0.5);
    if (!i) {
      if (inside(x + 1.5, y + 0.5) || inside(x - 0.5, y + 0.5) || inside(x + 0.5, y + 1.5) || inside(x + 0.5, y - 0.5)) { ctx.fillStyle = '#8a4a10'; ctx.fillRect(x, y, 1, 1); }
      continue;
    }
    const lit = (x - cx) * -0.6 + (y - cy) * -0.8;
    ctx.fillStyle = lit > 6 ? '#fff4a0' : lit > 1 ? '#ffd23a' : lit > -5 ? '#f4b020' : '#d88a14';
    ctx.fillRect(x, y, 1, 1);
  }
  // face
  ctx.fillStyle = '#5a2a0a';
  ctx.fillRect(16, 19, 2, 3); ctx.fillRect(23, 19, 2, 3);
  ctx.fillRect(17, 25, 1, 1); ctx.fillRect(18, 26, 5, 1); ctx.fillRect(23, 25, 1, 1);
  ctx.fillStyle = '#ff8a8a'; ctx.fillRect(13, 23, 2, 1); ctx.fillRect(26, 23, 2, 1);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(16, 19, 1, 1); ctx.fillRect(23, 19, 1, 1); ctx.fillRect(19, 9, 1, 2);
}
