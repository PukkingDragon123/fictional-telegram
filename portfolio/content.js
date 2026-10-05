// Everything the portfolio says, shows and links to lives in this one file.
// Edit the words, links and media here; the engine (PortfolioRoom.js) never
// needs to change.
//
// A chapter is a "lesson script" for the game's Classroom (src/game/Classroom.js):
//   { say, expr, react, draw, tap, erase, cam, at, anim, speed, wait }   <- the game's own step keys
//   + screen: 'mediaId' | 'hide'   roll the projector screen down over the chalkboard
//   + link:   { label, href } | null   show / hide the call-to-action tag
//   + contact: true                 open the "hire me" card
// `say` supports **bold** words (they turn yellow). Chalk coordinates are board
// pixels on a 192 x 108 slate (x right, y down), items are centred on x / y.
import { measureText } from '../src/ui/Chalkboard.js';

import mudkipMp4 from './media/mudkips-garden.mp4';
import mudkipWebm from './media/mudkips-garden.webm';
import mudkipPoster from './media/mudkips-garden-poster.jpg';
import shoreMp4 from './media/sunset-shore.mp4';
import shoreWebm from './media/sunset-shore.webm';
import shorePoster from './media/sunset-shore-poster.jpg';
import tbmeThumb from './media/tbme-thumb.jpg';
import mcDimension from './media/mc-dimension.jpg';
import mcMob from './media/mc-mob.jpg';

// ------------------------------------------------------------------ about + links
export const SITE = {
  name: 'Pukking',
  title: 'Pukking · Game Developer Portfolio',
  tagline: 'JavaScript & Three.js game developer',
  pill: 'pixel art · cozy games · minecraft mods',
  // Set any of these to show a button on the "hire me" card.
  contact: {
    itch: 'https://pukkingdragon123.itch.io/',
    email: '', // e.g. 'hello@example.com'
    discord: '', // e.g. 'https://discord.gg/...' or a profile link
    other: [], // e.g. [{ label: 'FIVERR', href: 'https://...' }]
  },
};

export const LINKS = {
  itch: 'https://pukkingdragon123.itch.io/',
  mudkips: 'https://pukkingdragon123.itch.io/mudkips-garden',
};

// ------------------------------------------------------------------ media shown on the projector screen
// type: 'video' (muted loop; list mp4 first, webm as fallback) | 'image'
export const MEDIA = {
  mudkips: {
    type: 'video', sources: [[mudkipMp4, 'video/mp4'], [mudkipWebm, 'video/webm']], poster: mudkipPoster,
    caption: "MUDKIP'S GARDEN", sub: 'MY LATEST GAME', href: LINKS.mudkips,
  },
  mudkipsShot: { type: 'image', src: mudkipPoster, caption: "MUDKIP'S GARDEN", sub: 'PIXEL ART', href: LINKS.mudkips },
  shore: {
    type: 'video', sources: [[shoreMp4, 'video/mp4'], [shoreWebm, 'video/webm']], poster: shorePoster,
    caption: 'SUNSET SHORE', sub: 'PIXEL ADVENTURE', href: LINKS.itch,
  },
  shoreShot: { type: 'image', src: shorePoster, caption: 'SUNSET SHORE', sub: 'LIGHT AND ATMOSPHERE', href: LINKS.itch },
  tbme: { type: 'image', src: tbmeThumb, caption: 'THE BEAR MUST EAT', sub: 'COZY INCREMENTAL / TYCOON', href: LINKS.itch, bg: '#3a1a4a' },
  dimension: { type: 'image', src: mcDimension, caption: 'CUSTOM DIMENSION', sub: 'MINECRAFT MOD' },
  mob: { type: 'image', src: mcMob, caption: 'CUSTOM MOB', sub: 'MINECRAFT MOD', bg: 'auto' },
};

// ------------------------------------------------------------------ chalk helpers
const T = (text, x, y, o = {}) => ({ text, x, y, ...o });
const D = (doodle, x, y, o = {}) => ({ doodle, x, y, ...o });
const TITLE = (text, color = 'yellow', o = {}) => ({ text, x: 96, y: 9, scale: measureText(text, 2).w <= 184 ? 2 : 1, color, id: 'title', ...o });
const LIST = (rows, x = 84, y0 = 34, dy = 16, color = 'white') => rows.flatMap((txt, i) => [
  { check: [x - 8, y0 + i * dy + 1, 4] },
  T(txt, x, y0 + i * dy, { align: 'left', color: typeof color === 'function' ? color(i) : color, id: 'li' + i }),
]);

// ------------------------------------------------------------------ chapters
export const CHAPTERS = [
  // ---------------------------------------------------------------- 1
  {
    id: 'hello', short: 'HELLO', title: 'Hello!', number: 1, doodle: 'fox', color: 'yellow',
    blurb: 'Who is Pukking?',
    stamp: ['NICE TO MEET YOU!', 'Gold star for you!'],
    steps: [
      { cam: 'board', expr: 'happy', react: 'heart',
        say: "Hi, I'm **Pukking**! Welcome to my little classroom. Don't mind the fish, they're very keen.",
        draw: [TITLE("HI, I'M PUKKING"), D('fox', 96, 58, { scale: 3, id: 'me' }), D('sparkle', 46, 40), D('sparkle', 148, 38), D('sparkle', 54, 80), D('heart', 142, 78)] },
      { erase: true, expr: 'teacher', tap: ['js', 'three'],
        say: "I'm a **game developer** who builds polished, cozy games with **JavaScript** and **Three.js**.",
        draw: [TITLE('GAME DEV', 'blue'), D('brackets', 46, 50, { scale: 2, id: 'js' }), T('JAVASCRIPT', 46, 78, { color: 'green' }), T('+', 96, 52, { scale: 2 }), D('cube', 146, 48, { scale: 2, id: 'three' }), T('THREE.JS', 146, 78, { color: 'yellow' })] },
      { cam: 'wide', at: 'teacher', expr: 'smug', react: 'laugh',
        say: 'Yes, even this classroom is a live **Three.js** scene. The desk, the chalk, the fish... and **me**!' },
      { erase: true, react: 'wow', tap: ['px', 'cozy', 'dim', 'mc'], speed: 1.3,
        say: 'My focus: **pixel art**, **cozy games**, **2D & 3D** experiences and **Minecraft mods**.',
        draw: [TITLE('WHAT I DO', 'pink'), D('palette', 26, 50, { scale: 2, id: 'px' }), D('heart_big', 74, 50, { scale: 2, id: 'cozy' }), D('cube', 122, 50, { scale: 2, id: 'dim' }), D('block', 168, 50, { scale: 2, id: 'mc' }),
          T('PIXEL ART', 26, 80, { font: 'small', color: 'orange' }), T('COZY', 74, 80, { font: 'small', color: 'pink' }), T('2D / 3D', 122, 80, { font: 'small', color: 'yellow' }), T('MC MODS', 168, 80, { font: 'small', color: 'green' })] },
      { expr: 'proud', react: 'cheer',
        say: 'I care about polished **art, animations and gameplay**... and I keep my prices **friendly**.',
        draw: [{ check: [16, 98, 4] }, T('POLISHED', 24, 98, { font: 'small', align: 'left', color: 'yellow' }), { check: [78, 98, 4] }, T('UNIQUE', 86, 98, { font: 'small', align: 'left', color: 'pink' }), { check: [132, 98, 4] }, T('AFFORDABLE', 140, 98, { font: 'small', align: 'left', color: 'green' })] },
      { cam: 'teacher', at: 'teacher', anim: 'wave_hello', expr: 'wink',
        say: "Pick a lesson from the **class schedule** to see more, or poke around the room. Lots of things are clickable!" },
    ],
  },

  // ---------------------------------------------------------------- 2
  {
    id: 'toolkit', short: 'TOOLKIT', title: 'My Toolkit', number: 2, doodle: 'gear', color: 'green',
    blurb: 'Code, art, sound',
    stamp: ['SKILLS UNLOCKED!', 'Gold star for you!'],
    steps: [
      { cam: 'board', expr: 'determined', tap: 'js',
        say: 'First, **code**. JavaScript and Three.js, custom shaders and render pipelines, and all the game systems around them.',
        draw: [TITLE('CODE', 'green'), D('brackets', 38, 56, { scale: 3, id: 'js' }), ...LIST(['JAVASCRIPT', 'THREE.JS', 'SHADERS', 'GAME SYSTEMS'], 90, 36, 17, 'white')] },
      { erase: true, expr: 'happy', react: 'heart', tap: 'spr',
        say: '**Pixel art** is where I shine: sprites, tilesets, UI and animation, with a tight palette that keeps everything cohesive.',
        draw: [TITLE('PIXEL ART', 'pink'), D('pxfox', 42, 58, { scale: 3, id: 'spr' }), ...LIST(['SPRITES', 'TILES + UI', 'ANIMATION', 'PALETTES'], 90, 36, 17, 'white')] },
      { erase: true, expr: 'smug', react: 'wow',
        say: 'I mix **3D voxels with 2D pixel art**: a crunchy, cozy look. In The Bear Must Eat, every model is procedural voxels!',
        draw: [TITLE('2D + 3D', 'yellow'), D('pxfox', 34, 56, { scale: 2 }), T('+', 70, 54, { scale: 2 }), D('cube', 96, 54, { scale: 2 }), T('=', 126, 54, { scale: 2 }), D('fox', 158, 54, { scale: 2 }),
          T('PIXELS', 34, 82, { font: 'small', color: 'orange' }), T('VOXELS', 96, 82, { font: 'small', color: 'blue' }), T('COZY!', 158, 82, { font: 'small', color: 'pink' })] },
      { erase: true, expr: 'excited', react: 'note', sfx: 'class_star',
        say: 'I even **synthesize the music and sound effects** with the Web Audio API. No audio files at all!',
        draw: [TITLE('SOUND', 'lilac'), D('note', 54, 58, { scale: 4 }), D('note', 96, 44, { scale: 2 }), D('note', 134, 66, { scale: 3 }), T('WEB AUDIO', 96, 90, { color: 'lilac' }), D('sparkle', 160, 44)] },
      { erase: true, expr: 'greedy', react: 'laugh',
        say: 'And **game design**: cozy loops, incremental progression and all the tiny details that make a game feel good.',
        draw: [TITLE('DESIGN', 'orange'), D('timer', 34, 54, { scale: 2 }), D('coin', 96, 54, { scale: 2 }), D('sparkle', 158, 54, { scale: 2 }),
          T('LOOPS', 34, 82, { font: 'small', color: 'blue' }), T('PROGRESS', 96, 82, { font: 'small', color: 'yellow' }), T('POLISH', 158, 82, { font: 'small', color: 'pink' })] },
      { cam: 'teacher', at: 'teacher', expr: 'wink', anim: 'cheer', react: 'cheer',
        say: 'Oh, and **Minecraft modding**! That one gets its own lesson. Pick another when you are ready.' },
    ],
  },

  // ---------------------------------------------------------------- 3
  {
    id: 'games', short: 'GAMES', title: 'My Games', number: 3, doodle: 'controller', color: 'blue',
    blurb: "Mudkip's Garden",
    stamp: ['GAME ON!', 'Gold star for you!'],
    steps: [
      { cam: 'board', expr: 'excited', react: 'bang', tap: 'g1',
        say: 'Show and tell! Here are some of my games, **newest first**.',
        draw: [TITLE('MY GAMES', 'blue'),
          T('NEW!', 32, 24, { font: 'small', color: 'yellow' }), D('mudkip', 32, 52, { scale: 2, id: 'g1' }), T("MUDKIP'S", 32, 78, { font: 'small', color: 'blue' }), T('GARDEN', 32, 85, { font: 'small', color: 'blue' }),
          D('bear', 96, 52, { scale: 2, id: 'g2' }), T('THE BEAR', 96, 78, { font: 'small', color: 'orange' }), T('MUST EAT', 96, 85, { font: 'small', color: 'orange' }),
          D('crab', 160, 52, { scale: 2, id: 'g3' }), T('SUNSET', 160, 78, { font: 'small', color: 'red' }), T('SHORE', 160, 85, { font: 'small', color: 'red' })] },
      { screen: 'mudkips', expr: 'proud', react: 'heart', link: { label: "PLAY MUDKIP'S GARDEN", href: LINKS.mudkips },
        say: "**Mudkip's Garden** is my latest: a pixel-art adventure around a sunny bay. Dive off the dock, explore and finish quests for the locals!" },
      { screen: 'mudkips', expr: 'happy', react: 'star',
        say: 'Coins, levels, quests and a photo **SNAP** button, with pixel-art water that sparkles in the sun.' },
      { screen: 'tbme', expr: 'greedy', react: 'laugh', link: { label: 'MORE ON ITCH.IO', href: LINKS.itch },
        say: "**The Bear Must Eat** is a cozy incremental tycoon. I'm a greedy fox with an all-you-can-eat fish pond, and bears in suits are VERY hungry." },
      { erase: true, expr: 'scheming', react: 'wow', tap: 'bear',
        say: 'Breed fish, feed hungry bears and get **rich**. It is 3D voxels mixed with 2D pixel art!',
        draw: [TITLE('BEAR MUST EAT', 'orange'), D('fish', 32, 56, { scale: 2 }), T('BREED', 32, 82, { font: 'small', color: 'blue' }), { arrow: [54, 56, 70, 56] },
          D('bear', 96, 54, { scale: 2, id: 'bear' }), T('FEED', 96, 82, { font: 'small', color: 'orange' }), { arrow: [118, 56, 134, 56] }, D('coin', 158, 54, { scale: 2 }), T('GET RICH', 158, 82, { font: 'small', color: 'yellow' })] },
      { screen: 'shore', expr: 'teacher', react: 'wow', link: null,
        say: 'And a moody **sunset shore** scene: a pixel-art side-scrolling adventure with atmospheric lighting.' },
      { erase: true, expr: 'happy', react: 'cheer', anim: 'cheer', link: { label: 'VIEW MY GAMES ON ITCH.IO', href: LINKS.itch },
        say: 'There is more on my **itch.io** page. Go play something!',
        draw: [TITLE('MORE ON ITCH.IO', 'pink'), D('controller', 96, 60, { scale: 4 }), D('sparkle', 44, 50), D('sparkle', 148, 70), D('heart', 150, 42)] },
    ],
  },

  // ---------------------------------------------------------------- 4
  {
    id: 'pixelart', short: 'PIXEL ART', title: 'Pixel Art', number: 4, doodle: 'palette', color: 'pink',
    blurb: 'Pixels, palettes',
    stamp: ['PIXEL PERFECT!', 'Gold star for you!'],
    steps: [
      { cam: 'board', expr: 'excited', react: 'heart',
        say: 'Pixel art is my favourite part of making games. Let me show you how a **sprite is born**!',
        draw: [TITLE('PIXEL ART', 'pink'), D('palette', 96, 58, { scale: 4 }), D('sparkle', 40, 44), D('sparkle', 154, 74), D('sparkle', 46, 82)] },
      { erase: true, expr: 'focused', tap: 'spr', speed: 0.9,
        say: 'Start with a **silhouette**, add **colours**, then shading and a few shiny highlights. Every pixel is a decision!',
        draw: [D('pxfox', 54, 54, { scale: 5, id: 'spr' }), T('1 SHAPE', 112, 26, { align: 'left', color: 'white' }), T('2 COLOUR', 112, 46, { align: 'left', color: 'orange' }), T('3 SHADE', 112, 66, { align: 'left', color: 'blue' }), T('4 SHINE', 112, 86, { align: 'left', color: 'yellow' })] },
      { erase: true, expr: 'teacher', react: 'wow',
        say: 'A small, tight **palette** keeps everything cohesive and cozy.',
        draw: [TITLE('PALETTE', 'yellow'),
          ...['pink', 'orange', 'yellow', 'green', 'blue', 'lilac'].map((c, i) => ({ meter: [14 + i * 29, 34, 24, 24], value: 1, color: c, id: 'sw' + i })),
          T('SMALL + CHOSEN', 96, 74, { color: 'white', id: 'pal' }), { underline: 'pal', color: 'pink', wavy: true }, D('sparkle', 170, 86)] },
      { erase: true, expr: 'happy', react: 'cheer',
        say: 'Then comes **animation**: squash, stretch and bounce bring sprites to life, in 2D and in 3D!',
        draw: [TITLE('ANIMATE!', 'green'), D('heart_big', 34, 56, { scale: 2 }), D('heart_big', 96, 50, { scale: 3 }), D('heart_big', 158, 56, { scale: 2 }),
          T('FRAME 1', 34, 90, { font: 'small', color: 'blue' }), T('FRAME 2', 96, 90, { font: 'small', color: 'pink' }), T('FRAME 3', 158, 90, { font: 'small', color: 'blue' }), { arrow: [54, 56, 70, 54] }, { arrow: [124, 54, 140, 56] }] },
      { screen: 'mudkipsShot', expr: 'proud', react: 'heart',
        say: 'Here it is in action: sparkling water, parallax skies, tiny details everywhere.' },
      { screen: 'shoreShot', expr: 'magnifique', react: 'wow',
        say: 'And **atmosphere**: sunsets, silhouettes and glowing reflections. Lighting is half the art.' },
      { screen: 'tbme', expr: 'smug', react: 'cheer',
        say: 'I paint the **UI** too: wooden signs, paper tags, chalkboards... even the very room you are standing in!' },
      { cam: 'wide', at: 'teacher', screen: 'hide', expr: 'proud', react: 'cheer',
        say: 'This classroom, this chalkboard and even my portrait were all made for **The Bear Must Eat**. Cozy, right?' },
    ],
  },

  // ---------------------------------------------------------------- 5
  {
    id: 'mods', short: 'MC MODS', title: 'Minecraft Mods', number: 5, doodle: 'block', color: 'green',
    blurb: 'Mobs, dimensions',
    stamp: ['MOD MASTER!', 'Gold star for you!'],
    steps: [
      { cam: 'board', expr: 'excited', react: 'wow', tap: 'blk',
        say: 'I also make **Minecraft mods**: new mechanics, mobs, items and even whole dimensions!',
        draw: [TITLE('MINECRAFT MODS', 'green'), D('block', 44, 60, { scale: 3, id: 'blk' }), D('pickaxe', 96, 58, { scale: 3 }), D('island', 150, 58, { scale: 2 })] },
      { screen: 'dimension', expr: 'magnifique', react: 'wow',
        say: 'A custom **dimension**! Floating islands, glowing skies, new terrain and trees, all with its own atmosphere.' },
      { screen: 'mob', expr: 'proud', react: 'heart',
        say: 'Custom **mobs** with models and animations built from scratch. Meet this glowing, bone-plated critter!' },
      { erase: true, expr: 'happy', react: 'cheer', tap: 'li0',
        say: 'Mobs, dimensions, custom mechanics and features: tell me your idea and we will mod it into reality!',
        draw: [TITLE('I CAN ADD', 'green'), D('crawler', 40, 62, { scale: 2 }), ...LIST(['NEW MOBS', 'NEW DIMENSIONS', 'CUSTOM MECHANICS', 'ITEMS + FEATURES'], 90, 36, 17, 'white')] },
    ],
  },

  // ---------------------------------------------------------------- 6
  {
    id: 'hire', short: 'HIRE ME', title: 'Hire Me!', number: 6, doodle: 'tag', color: 'orange',
    blurb: 'Work with me',
    stamp: ["LET'S BUILD IT!", 'Gold star for you!'],
    steps: [
      { cam: 'board', expr: 'greedy', react: 'bang',
        say: 'Want a game built, polished or expanded? Here is what I offer.',
        draw: [TITLE('HIRE ME!', 'orange'), ...LIST(['POLISHED ART + ANIMATION', 'CUSTOM MECHANICS', 'MINECRAFT MODS', 'AFFORDABLE PRICING'], 28, 34, 17, (i) => ['yellow', 'blue', 'green', 'pink'][i]), D('coin', 168, 94)] },
      { erase: true, expr: 'teacher', react: 'wow', tap: 'sys',
        say: 'Already have a game? I can **expand it** with extra features and custom systems, depending on what you need.',
        draw: [TITLE('EXPAND YOUR GAME', 'blue'), D('controller', 34, 56, { scale: 2 }), T('+', 70, 54, { scale: 2 }), D('gear', 100, 54, { scale: 3, id: 'sys' }), T('=', 130, 54, { scale: 2 }), D('trophy', 160, 54, { scale: 2 }),
          T('YOUR GAME', 34, 86, { font: 'small', color: 'white' }), T('MY SYSTEMS', 100, 86, { font: 'small', color: 'blue' }), T('SHINY!', 160, 86, { font: 'small', color: 'yellow' })] },
      { erase: true, expr: 'greedy', react: 'laugh',
        say: 'Bigger additions can cost a little extra, but I always keep it **affordable**. (Shh, do not tell the bears.)',
        draw: [TITLE('FRIENDLY PRICES', 'yellow'), D('coin', 54, 56, { scale: 2 }), D('coin', 96, 50, { scale: 3 }), D('coin', 138, 56, { scale: 2 }), T('BIG ADD-ONS MAY COST EXTRA', 96, 88, { font: 'small', color: 'white', id: 'xtra' }), { underline: 'xtra', color: 'orange' }] },
      { cam: 'teacher', at: 'teacher', expr: 'proud', anim: 'bow_fancy', react: 'cheer', contact: true, link: { label: 'VIEW MY GAMES ON ITCH.IO', href: LINKS.itch },
        say: 'Ready? Ring the **bell** on my desk or use the buttons below. I cannot wait to build something with you!' },
    ],
  },
];

// What the chalkboard says while nobody is giving a lesson (free-roam).
export const IDLE_BOARD = [
  T('PUKKING', 96, 11, { scale: 2, color: 'yellow', id: 'name' }),
  T('GAME DEVELOPER', 96, 29, { color: 'white' }),
  D('palette', 30, 56, { scale: 2 }), D('heart_big', 78, 56, { scale: 2 }), D('cube', 126, 56, { scale: 2 }), D('block', 168, 56, { scale: 2 }),
  T('PICK A LESSON!', 96, 88, { color: 'pink', id: 'pick' }), { underline: 'pick', color: 'pink', wavy: true },
  { arrow: [96, 94, 96, 104], color: 'pink' },
];

export const CHAPTER_BY_ID = Object.fromEntries(CHAPTERS.map((c) => [c.id, c]));

// ------------------------------------------------------------------ free-roam lines (click the fox)
export const QUIPS = [
  { say: 'Psst! Try ringing the **bell** on my desk.', expr: 'wink' },
  { say: 'The fish are taking notes. Very keen.', expr: 'smug' },
  { say: 'Pixel art, Three.js, Minecraft mods... I do it all!', expr: 'proud' },
  { say: 'Did someone say **commission**?', expr: 'greedy' },
  { say: 'I run on chalk dust and fish snacks.', expr: 'happy' },
  { say: 'Click the **window** to change the time of day!', expr: 'excited' },
  { say: 'Every voxel in this room was placed by code. Fancy!', expr: 'magnifique' },
];
