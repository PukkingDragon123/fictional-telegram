// [v33 kit] Pixel art for Reynard's leather tool roll (the hotbar, src/ui/kit/ToolKit.js).
//
// Everything is painted at ART resolution (1 canvas px = 1 art px) and shown with
// image-rendering: pixelated at a whole number of device px per art px (--k).
//
//   KIT          geometry in art px (slot pitch, heights, where the pocket mouth is)
//   toolFrames(id)       -> [canvas x5]  rest, tilt left, tilt right, squash, stretch (TOOL_W x TOOL_H)
//   sleeveCanvas(digit)  -> canvas      the stitched leather pocket front (SLOT_W x SLEEVE_H)
//   sewnCanvas()         -> canvas      the same pocket stitched shut with a brass padlock (locked)
//   mouthCanvas()        -> canvas      the dark pocket opening behind the tool
//   glowCanvas()         -> canvas      a dithered lamp glow behind the lifted (active) tool
//   sheetURL()           -> data URL    the leather backing, a SLOT_W wide repeat-x tile
//   rollCanvas()         -> canvas      the rolled-up left end of the roll
//   strapCanvas()        -> canvas      the tie strap + brass buckle on the right end
//   pxSprite(name)       -> canvas      tiny particle sprites (heart, star, bubble, pellet, dust, coin)
//
// Tools are authored as character grids and shaded with the ramp renderer from
// src/ui/bagArt.js (hand-placed clusters, top-left light, tinted inner lines).
import { Grid, render, RAMPS, rgb, mix, rng, pixCanvas } from '../bagArt.js';

export const KIT = {
  SLOT_W: 28, // pocket pitch
  H: 44, // the roll's full height (room for a lifted tool + the leather)
  SHEET_Y: 17, // the leather backing starts here
  SLEEVE_Y: 27, // pocket front top
  SLEEVE_H: 15,
  TOOL_W: 26, TOOL_H: 36,
  TOOL_X: 1, TOOL_Y: 8, // tool canvas offset inside the slot (its row 19 sits at the pocket mouth)
  LIFT: 7, // art px the active tool rises
  ROLL_W: 11, STRAP_W: 26,
};

const INKC = '#2a1a14';
const hexc = (h) => rgb(h);
const R = (name, t) => RAMPS[name][t];

// ---------------------------------------------------------------- tiny canvas helpers
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function painter(w, h) {
  const c = cv(w, h), g = c.getContext('2d');
  const put = (x, y, col) => { if (!col) return; g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  const rect = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); };
  return { c, g, put, rect };
}
const hash2 = (x, y, s = 0) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// exterior-only outline: interior holes (net mesh, the hammer claw) stay open
function outlineOut(p, f = 0.78) {
  const W = p.w, H = p.h, ext = new Uint8Array(W * H);
  const st = [];
  for (let x = 0; x < W; x++) { st.push(x, 0, x, H - 1); }
  for (let y = 0; y < H; y++) { st.push(0, y, W - 1, y); }
  while (st.length) {
    const y = st.pop(), x = st.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = y * W + x;
    if (ext[i] || p.a(x, y)) continue;
    ext[i] = 1;
    st.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  const add = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!ext[y * W + x]) continue;
    let best = null;
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      if (!p.a(x + dx, y + dy)) continue;
      const c = mix(p.get(x + dx, y + dy), hexc(INKC), f);
      if (!best || c[0] + c[1] + c[2] < best[0] + best[1] + best[2]) best = c;
    }
    if (best) add.push([x, y, best]);
  }
  for (const [x, y, c] of add) p.put(x, y, c);
  return p;
}

// ================================================================ THE TOOLS
// 26 x 36 grids. Row 19 is the pocket mouth: rows 0-18 stick out at rest,
// the rest hides in the pocket (and shows when the tool is lifted).
const TW = 26, TH = 36;
const PAD = (rows) => {
  const out = rows.map((r) => (r + '.'.repeat(TW)).slice(0, TW));
  while (out.length < TH) out.push('.'.repeat(TW));
  return out.slice(0, TH);
};
// a straight wooden handle from row y0 (cols x..x+w-1), light on the left
function handle(rows, y0, x, ch = 'vWwu', grip = null) {
  const out = rows.slice();
  for (let y = y0; y < TH; y++) {
    const r = (out[y] || '').padEnd(TW, '.').split('');
    for (let i = 0; i < ch.length; i++) r[x + i] = grip && grip(y) ? grip(y)[i] : ch[i];
    out[y] = r.join('');
  }
  return out;
}
// the feather: a curved quill with barbs combed diagonally, a couple of split tufts
function featherRows() {
  const g = Array.from({ length: TH }, () => Array(TW).fill('.'));
  const qx = (y) => 9 + Math.round(7.2 * Math.pow(Math.max(0, 19 - y) / 19, 1.25)); // rachis curves up and right
  for (let y = 0; y < 20; y++) {
    const xr = qx(y);
    const t = y / 19;
    const half = Math.max(0, Math.round(5.2 * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)) - (y > 16 ? (y - 16) * 1.2 : 0)));
    for (let dx = -half - 1; dx <= half; dx++) {
      const x = xr + dx;
      if (x < 1 || x >= TW - 1 || dx === 0) continue;
      const left = dx < 0;
      const barb = Math.floor((y + (left ? -dx : dx) * 0.9) / 2);
      if ((y === 6 && left && dx < -2) || (y === 11 && !left && dx > 2) || (y === 14 && left && dx < -3)) continue; // split tufts
      const edge = Math.abs(dx) >= (left ? half + 1 : half);
      let ch = left ? (barb % 2 ? 'e' : 'd') : (barb % 2 ? 'c' : 'd');
      if (edge) ch = left ? 'e' : 'b';
      if (!left && dx === half - 1 && barb % 3 === 0) ch = 'b';
      g[y][x] = ch;
    }
    g[y][xr] = y < 2 ? 'w' : 'q';
  }
  g[0][qx(0) + 1] = 'w';
  for (let y = 20; y < TH; y++) { g[y][9] = 'q'; g[y][10] = 'z'; }
  g[19][9] = 'q'; g[19][10] = 'Q';
  return g.map((r) => r.join(''));
}

const TOOLS = {
  // the Food scoop: a dented tin scoop heaped with Reynard's pellets
  feed: {
    key: { a: 'steel:1', b: 'steel:2', c: 'steel:3', d: 'steel:4', e: 'steel:5', q: 'honey:1', p: 'honey:2', P: 'honey:3', Q: 'honey:4', S: 'honey:5', g: 'lime:3', G: 'lime:4', r: 'red:3', R: 'red:4', w: 'lwood:2', W: 'lwood:3', v: 'lwood:4', u: 'lwood:1', f: 'brass:3', F: 'brass:5', h: 'brass:2' },
    rows: () => handle(PAD([
      '..........................',
      '...........SQ.............',
      '.........QPSPq.R..........',
      '.......qPQPpQPrRQ.........',
      '.....qPQPgPQSPpPqQS.......',
      '....pQPgGPQSPpPQPpPQq.....',
      '...pPpQPGPqPQPrPpQPSPq....',
      '..qPpQrPpPQPpqPPpQPpqPp...',
      '..eddddddddddddddddddddc..',
      '..dccceecccccccccccccbba..',
      '...dcceecccccccccbcccbba..',
      '...dcceccccccccccccccbaa..',
      '....dcecccccccccccccbbaa..',
      '....dccccccccccccccbbaa...',
      '.....dccccccccccccbbbaa...',
      '......dccccccccccbbaa.....',
      '.......bbccccccccbba......',
      '.........bbccccbbaa.......',
      '...........hFFfh..........',
      '...........hFFfh..........',
    ]), 20, 11, 'vWwu'),
  },
  // Carry: a landing net with a goldfish flapping in it
  hand: {
    key: { u: 'lwood:1', W: 'lwood:3', V: 'lwood:4', w: 'lwood:2', m: 'cream:4', n: 'cream:2', o: 'orange:3', O: 'orange:4', y: 'orange:5', z: 'orange:2', e: '#2a1a14', f: 'brass:3', F: 'brass:5' },
    rows: () => handle(PAD([
      '..........................',
      '........uWWWWWWWWu........',
      '......uWVm.n.m.n.mWu......',
      '....uWm.n.m.n.m.n.m.Wu....',
      '...Wm.n.m.n.m.n.m.n.m.W...',
      '..W.n.m.n.m.ooOO.n.m.n.W..',
      '..Wm.n.m.n.oOyyOOm.n.m.W..',
      '..W.n.m.zzoOOyOOOOe.m.nW..',
      '..Wm.n.zzzoOOOOOOOOm.n.W..',
      '..W.n.m.zzoOOOOOOOz.m.nW..',
      '..Wm.n.zz.m.zoOz.m.n.m.W..',
      '...W.n.m.n.m.n.m.n.m.nW...',
      '....uWm.n.m.n.m.n.m.Wu....',
      '......uWWn.m.n.m.WWu......',
      '........uWWWWWWWWu........',
      '...........uWWu...........',
      '...........fFFf...........',
      '...........fFFf...........',
    ]), 18, 11, 'VWwu'),
  },
  // DO NOT EAT: a paper luggage tag on a string, red NO band, EAT underneath
  tag: {
    key: { s: 'tan:3', t: 'tan:2', p: 'parch:4', P: 'parch:5', q: 'parch:3', Q: 'parch:2', R: 'red:3', r: 'red:2', W: 'cream:5', o: 'brass:3', O: 'brass:5', k: 'ink:3', h: '#2a1a14' },
    rows: () => PAD([
      '............st............',
      '...........s..t...........',
      '............ts............',
      '.........PPPPsPPPP........',
      '........PPPPoOoPPPPq......',
      '.......PPPPPohoPPPPPq.....',
      '.......PPPPPPoPPPPPPq.....',
      '.......RRRRRRRRRRRRRRr....',
      '.......RWRRRWRRWWWWRRr....',
      '.......RWWRRWRRWRRWRRr....',
      '.......RWRWRWRRWRRWRRr....',
      '.......RWRRWWRRWRRWRRr....',
      '.......RWRRRWRRWWWWRRr....',
      '.......rrrrrrrrrrrrrrr....',
      '.......ppppppppppppppq....',
      '.......pkkkpkkkpkkkppq....',
      '.......pkpppkpkppkpppq....',
      '.......pkkppkkkppkpppq....',
      '.......pkpppkpkppkpppq....',
      '.......pkkkpkpkppkpppq....',
      '.......ppppppppppppppq....',
      '.......pppppppppppppqq....',
      '.......ppppppppppppqqQ....',
      '.......pppppppppppqqQQ....',
      '.......qqqqqqqqqqqqqQQ....',
    ]),
  },
  // Pet: a fluffy pink plume
  pet: {
    key: { a: 'pink:1', b: 'pink:2', c: 'pink:3', d: 'pink:4', e: 'pink:5', w: 'white:5', q: 'bone:5', Q: 'bone:3', z: 'bone:2' },
    rows: featherRows,
  },
  // e-Buy: a glossy mail-order catalogue, dog-eared, a SALE sticker
  ebuy: {
    key: { W: 'white:5', w: 'white:4', v: 'white:3', f: 'white:2', e: 'red:3', o: 'orange:4', B: 'blue:3', u: 'yellow:3', y: 'green:4', s: 'sky:4', S: 'sky:3', t: 'sky:5', O: 'orange:4', N: 'orange:3', Y: 'orange:5', K: '#2a1a14', r: 'red:3', R: 'red:4', p: 'parch:4', P: 'parch:3', k: 'ink:4', g: 'leaf:3', G: 'leaf:4' },
    rows: () => PAD([
      '..........................',
      '...WWWWWWWWWWWWWWWWfw.....',
      '...WeeWoWBBWuuWyWyWWfw....',
      '...WeWWWWBBWuWuWyyWWvfp...',
      '...WeeWoWBBWuuWWyWWWvvp...',
      '...WWWWWWWWWWWWWWWWWvvpP..',
      '...WtttttttttttttttWvvpP..',
      '...WtsssssssssrrssSWvvpP..',
      '...WtssssssssrRRrsSWvvpP..',
      '...WtsssONNNsrRWRrSWvvpP..',
      '...WtssONYONNsrRrsSWvvpP..',
      '...WtsNOOOKONNssssSWvvpP..',
      '...WtssONOONNsssssSWvvpP..',
      '...WtsssNNNsssssssSWvvpP..',
      '...WtggGgggGggGgggSWvvpP..',
      '...WSSSSSSSSSSSSSSSWvvpP..',
      '...WWWWWWWWWWWWWWWWWvvpP..',
      '...WkkkkkWkkkkWWWWWWvvpP..',
      '...WWWWWWWWWWWWWWWWWvvpP..',
      '...WkkkWWkkkkkWkkWWWvvpP..',
      '...WWWWWWWWWWWWWWWWWvvpP..',
      '...WkkkkWWWkkkWWWWWWvvpP..',
      '...WWWWWWWWWWWWWWWWWvvpP..',
      '...WWWWWWWWWWWWWWWWWvvpP..',
      '...vvvvvvvvvvvvvvvvvvvpP..',
    ]),
  },
  // Build: a claw hammer, leather grip
  build: {
    key: { a: 'steel:1', b: 'steel:2', c: 'steel:3', d: 'steel:4', e: 'steel:5', w: 'honey:3', W: 'honey:4', v: 'honey:5', u: 'honey:2', r: 'leather:3', R: 'leather:4', s: 'leather:2' },
    rows: () => handle(PAD([
      '..........................',
      '.................deeed....',
      '..........ddddddeeeeeedc..',
      '......dddeeeeeeeeedddddcc.',
      '...bcdccccccccccccccccccc.',
      '..bc.dccccccccccccccccccb.',
      '.bc...bcccccccccccccccbbb.',
      '.b.....bbbbcvWwubbbbbbbba.',
      'ab.........vWwu.......aa..',
      'a..........vWwu...........',
      '...........vWwu...........',
      '...........vWwu...........',
      '...........vWwu...........',
      '...........vWwu...........',
    ]), 14, 11, 'vWwu', (y) => (y >= 17 && y <= 30 ? (y % 2 ? 'RrRs' : 'rRrs') : null)),
  },
  // Destroy (beaver crew): a red-painted felling axe, bright steel bit
  clear: {
    key: { a: 'steel:1', b: 'steel:3', c: 'steel:4', e: 'steel:5', R: 'red:3', r: 'red:2', q: 'red:1', S: 'red:4', T: 'red:5', w: 'wood:3', W: 'wood:4', v: 'wood:5', u: 'wood:2', K: '#2a1a14' },
    rows: () => handle(PAD([
      '........vWwu..............',
      '........vWwu.........ce...',
      '........vWwu......rRbce...',
      '...aqrRRvWwuRRRRSSRRbce...',
      '..abqRRRvWwuRRRRSTTSRbce..',
      '..abrRRRvWwuRRRRRSSRRbce..',
      '..abrRRRvWwuRRRRRRRRRbce..',
      '...aqrRRvWwuRRRRRRRRRRbce.',
      '........vWwurRRRRRRRRRbce.',
      '........vWwu..qrRRRRRRbce.',
      '........vWwu....qrRRRRbce.',
      '........vWwu......qrRRbc..',
      '........vWwu........qrbc..',
      '........vWwu..........a...',
]), 14, 8, 'vWwu'),
  },
  // Lab: a corked round flask, green and fizzing, a paper label
  lab: {
    key: { c: 'cinnamon:3', C: 'cinnamon:4', d: 'cinnamon:2', g: 'glass:3', G: 'glass:5', h: 'glass:2', l: 'lime:3', L: 'lime:4', M: 'lime:5', m: 'lime:2', n: 'lime:1', W: 'white:5', p: 'parch:4', P: 'parch:3', k: 'ink:4', r: 'red:3' },
    rows: () => PAD([
      '..........................',
      '...........CCcd...........',
      '..........CCcCdd..........',
      '..........CcCcdd..........',
      '..........hGGgGh..........',
      '...........GgWg...........',
      '...........GgLg...........',
      '...........GgMg...........',
      '.........hGGgLgGh.........',
      '......hhGgllMlLlgGhh......',
      '.....hGlLlMlLlllWlmgh.....',
      '....hGWlLMllWlLllllmgh....',
      '....GWlLlllMlLlllMlmmg....',
      '...hGWlLlMlllllLllllmgh...',
      '...hgllLlllllMllllLlmmg...',
      '...hgpppppppppppppppplmg..',
      '...hgpPrrrrrrrrrrrrPplmg..',
      '...hgpPkkkkkkkkkkkkPplmg..',
      '...hgpPPPPPPPPPPPPPPplmg..',
      '...hglllLllllllllllllmng..',
      '...hgllllllllllllllllmng..',
      '....hglllllllllllllmmng...',
      '....hgmmmmmmmmmmmmmmmnng..',
      '.....hgnnnnnnnnnnnnnnng...',
      '......hggggggggggggggg....',
    ]),
  },
  // Matchmaker: Cupid's arrow, a heart for a tip, white fletching
  match: {
    key: { r: 'rose:2', R: 'rose:3', S: 'rose:4', T: 'rose:5', w: 'white:5', f: 'white:4', F: 'white:3', p: 'pink:3', P: 'pink:4', t: 'lwood:3', u: 'lwood:1', y: 'gold:4', Y: 'gold:5' },
    rows: () => PAD([
      '..........................',
      '.......rRRR....RRRr.......',
      '......rRSSSR..RSSRRr......',
      '.....rRSTwSSRRSSRRRRr.....',
      '.....RSTwSSSRRSRRRRRr.....',
      '.....RSwSSRRRRRRRRRRr.....',
      '.....rRSSRRRRRRRRRRrr.....',
      '......rRRRRRRRRRRRRr......',
      '.......rRRRRRRRRRRr.......',
      '........rRRRRRRRRr........',
      '.........rRRRRRRr.........',
      '..........rRRRRr..........',
      '...........rRRr...........',
      '...........yYyy...........',
      '............tu............',
      '............tu............',
      '............tu............',
      '............tu............',
      '............tu............',
      '............tu............',
      '............tu............',
      '............tu............',
      '...........ptuP...........',
      '..........pPtuPp..........',
      '.........pPPtuPPp.........',
      '.........pPftufPp.........',
      '..........pftufp..........',
      '..........ftuuff..........',
      '...........ftuf...........',
      '............tu............',
    ]),
  },
  // Encyclopedia: a cloth-bound field guide, brass corners, a ribbon
  dex: {
    key: { a: 'teal:1', b: 'teal:2', c: 'teal:3', d: 'teal:4', e: 'teal:5', y: 'gold:3', Y: 'gold:4', z: 'gold:2', Z: 'gold:5', p: 'parch:4', P: 'parch:5', q: 'parch:3', r: 'red:3', R: 'red:2', k: 'teal:0', o: 'orange:4', O: 'orange:3' },
    rows: () => PAD([
      '...............r..........',
      '....YYbbbbbbbbbrbbYYpp....',
      '...YZdcccccccccrcccYPp....',
      '...bdeccccccccccRcccbPq...',
      '...bdcyyyyyyyyyyyyccbPq...',
      '...bdcykkkkkkkkkkyccbPq...',
      '...bdcykkkkOOOkkkyccbPq...',
      '...bdcykkkOooOOOkyccbPq...',
      '...bdcykkOoYoOOOOycbbPq...',
      '...bdcykkkOooOOOkyccbPq...',
      '...bdcykkkkOOOkkkyccbPq...',
      '...bdcyyyyyyyyyyyyccbPq...',
      '...bdccccccccccccccbbPq...',
      '...bdcczzzzzzzzzzcccbPq...',
      '...bdccccccccccccccbbPq...',
      '...bdccccczzzzzzcccbbPq...',
      '...bdccccccccccccccbbPq...',
      '...bdccccccccccccccbbPq...',
      '...bdccccccccccccccbbPq...',
      '...bdccccccccccccccbbPq...',
      '...bdccccccccccccccbbPq...',
      '...bdccccccccccccccbbPq...',
      '...bdccccccccccccccbbPq...',
      '...YzbbbbbbbbbbbbbbbYqq...',
    ]),
  },
  // Restaurant: a fork and a knife with brass-riveted handles
  reviews: {
    key: { a: 'steel:2', b: 'steel:3', c: 'steel:4', e: 'steel:5', w: 'honey:3', W: 'honey:4', v: 'honey:2', y: 'gold:4', Y: 'gold:5' },
    rows: () => PAD([
      '..........................',
      '.....c.c.c.c......eb......',
      '.....c.c.c.c.....ecb......',
      '.....e.e.e.e.....ecb......',
      '.....e.e.e.e.....ecb......',
      '.....e.e.e.e.....ecb......',
      '.....cecececb....ecb......',
      '.....cccccccb....ecba.....',
      '......ccccbb.....ecba.....',
      '.......ecb.......ecba.....',
      '.......ecb.......ecba.....',
      '.......ecb.......ecba.....',
      '.......ecb.......ecb......',
      '.......ecb.......ecb......',
      '.......ecb.......eb.......',
      '.......ecb.......ab.......',
      '.......ecb......WWWv......',
      '......WWWWv.....WYWv......',
      '......WYWWv.....WWWv......',
      '......WWWWv.....WWWv......',
      '......WWWWv.....WWWv......',
      '......WWWWv.....WWWv......',
      '......WWWWv.....WWWv......',
      '......WYWWv.....WYWv......',
      '......WWWWv.....WWWv......',
      '......WWWWv.....WWWv......',
      '......vvvvv.....vvvv......',
    ]),
  },
  // Staff: the beaver crew's clipboard, ticked roster, a pencil
  staff: {
    key: { a: 'wood:2', b: 'wood:3', c: 'wood:4', s: 'steel:3', S: 'steel:4', T: 'steel:5', t: 'steel:2', p: 'white:5', P: 'white:4', q: 'white:3', k: 'ink:4', g: 'green:4', y: 'yellow:4', Y: 'yellow:3', e: 'pink:4', n: 'ink:3', B: 'beaver:3', D: 'beaver:4' },
    rows: () => PAD([
      '..........................',
      '..........tSTTSt..........',
      '...bbbbbbtSSSSSStbbbbb.yn.',
      '...bccccsSTTTTTSsccccbYy..',
      '...bcpppppppppppppppcYy...',
      '...bcpgkkkkkkkkkpPPcYYy...',
      '...bcpppppppppppPPPYyb....',
      '...bcpgkkkkkkkkpPPYyccb...',
      '...bcpppppppppppPYyPccb...',
      '...bcpgkkkkkkkpPPeePccb...',
      '...bcpppppppppppPPPPccb...',
      '...bcppkkkkkkkkkpPPPccb...',
      '...bcpppppppppppPPPPccb...',
      '...bcpppppppppDDBpPPccb...',
      '...bcpkkkkkkpDBBBDPPccb...',
      '...bcpppppppppDBBpPPccb...',
      '...bcpppppppppppppPPccb...',
      '...bcqqqqqqqqqqqqqqqccb...',
      '...bccccccccccccccccccb...',
      '...bccccccccccccccccccb...',
      '...bccccccccccccccccccb...',
      '...bccccccccccccccccccb...',
      '...bccccccccccccccccccb...',
      '...abbbbbbbbbbbbbbbbbba...',
    ]),
  },
};

// alias the feature names the toolbar uses
const TOOL_OF = { feed: 'feed', hand: 'hand', tag: 'tag', pet: 'pet', nurture: 'pet', ebuy: 'ebuy', build: 'build', clear: 'clear', lab: 'lab', match: 'match', dex: 'dex', reviews: 'reviews', staff: 'staff' };
export const KIT_TOOL_IDS = Object.keys(TOOLS);

const pixCache = new Map();
function toolPix(id) {
  const k = TOOL_OF[id] || id;
  if (pixCache.has(k)) return pixCache.get(k);
  const T = TOOLS[k];
  if (!T) return null;
  const g = Grid.from(T.rows());
  let p = render(g, T.key, { ol: false });
  p = outlineOut(p);
  pixCache.set(k, p);
  return p;
}

// nearest-neighbour transform at art resolution (pivot = the pocket mouth)
function warp(p, { rot = 0, sx = 1, sy = 1, px = 13, py = 19 } = {}) {
  const W = p.w, H = p.h;
  const c = Math.cos(-rot), s = Math.sin(-rot);
  const out = painter(W, H);
  const d = out.g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - px, dy = y + 0.5 - py;
    const ux = (dx * c - dy * s) / sx, uy = (dx * s + dy * c) / sy;
    const X = Math.floor(ux + px), Y = Math.floor(uy + py);
    if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    const i = (Y * W + X) * 4, j = (y * W + x) * 4;
    if (p.d[i + 3] < 128) continue;
    d.data[j] = p.d[i]; d.data[j + 1] = p.d[i + 1]; d.data[j + 2] = p.d[i + 2]; d.data[j + 3] = 255;
  }
  out.g.putImageData(d, 0, 0);
  return out.c;
}

const frameCache = new Map();
/** [rest, tiltL, tiltR, squash, stretch] canvases, TOOL_W x TOOL_H (26 x 36) */
export function toolFrames(id) {
  const k = TOOL_OF[id] || id;
  if (frameCache.has(k)) return frameCache.get(k);
  const p = toolPix(k);
  if (!p) return null;
  const rest = pixCanvas(p, 1);
  const fr = [rest, warp(p, { rot: -0.2 }), warp(p, { rot: 0.2 }), warp(p, { sx: 1.14, sy: 0.84, py: 26 }), warp(p, { sx: 0.9, sy: 1.12, py: 26 })];
  frameCache.set(k, fr);
  return fr;
}

// ================================================================ LEATHER
// the roll's backing (darker, oiled) and the pocket fronts (lighter, stiffer hide)
const LB = ['#24140c', '#3a2214', '#4e2e1a', '#643c22', '#7a4c2c', '#94603a']; // backing
const LP = ['#3a2010', '#5c3418', '#7e4a24', '#9a5e30', '#b87842', '#d49a5e']; // pocket hide
const THREAD = '#f2deb0', THREAD_SH = '#3a2214';

/** the leather backing tile: SLOT_W x (H - SHEET_Y), repeat-x */
let SHEET = null;
export function sheetURL() {
  if (SHEET) return SHEET;
  const W = KIT.SLOT_W, H = KIT.H - KIT.SHEET_Y;
  const { c, put, rect } = painter(W, H);
  rect(0, 0, W, H, LB[3]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = hash2(x, y, 11);
    if (n < 0.09) put(x, y, LB[2]);
    else if (n > 0.95) put(x, y, LB[4]);
    // long soft creases
    if ((y === 7 || y === 15) && hash2(x >> 2, y, 3) < 0.5) put(x, y, LB[2]);
  }
  rect(0, 0, W, 1, INKC);
  rect(0, 1, W, 1, LB[5]);
  rect(0, 2, W, 1, LB[4]);
  // top stitch line
  for (let x = 1; x < W; x += 3) { put(x, 4, THREAD); put(x + 1, 4, THREAD); put(x, 5, LB[1]); }
  // bottom: stitches, rolled edge, ink
  for (let x = 0; x < W; x += 3) { put(x, H - 6, THREAD); put(x + 1, H - 6, THREAD); put(x + 1, H - 5, LB[1]); }
  rect(0, H - 3, W, 1, LB[4]);
  rect(0, H - 2, W, 1, LB[1]);
  rect(0, H - 1, W, 1, INKC);
  // the seam between two pockets
  for (let y = 6; y < H - 6; y += 2) put(0, y, LB[1]);
  SHEET = c.toDataURL();
  return SHEET;
}

/** the pocket front: stitched sides, rolled hem, brass rivets, the hotkey debossed */
const DIG = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '011', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
};
function sleeveBase(seed, hide = LP) {
  const W = KIT.SLOT_W, H = KIT.SLEEVE_H;
  const P = painter(W, H);
  const { put, rect } = P;
  const x0 = 1, x1 = W - 2;
  // body
  rect(x0, 2, x1 - x0 + 1, H - 2, hide[3]);
  for (let y = 2; y < H; y++) for (let x = x0; x <= x1; x++) {
    const n = hash2(x, y, seed);
    if (n < 0.08) put(x, y, hide[2]);
    else if (n > 0.93) put(x, y, hide[4]);
  }
  // the opening: a little smile-shaped dip in the middle, rolled hem
  for (let x = x0; x <= x1; x++) {
    const mid = x >= 8 && x <= 19;
    const top = mid ? 1 : 0;
    put(x, top, hide[5]);
    put(x, top + 1, hide[4]);
    put(x, top + 2, hide[1]);
    if (!mid) put(x, 1, hide[4]);
  }
  // shade: right side darker, left lit
  for (let y = 3; y < H - 1; y++) { put(x0, y, hide[4]); put(x1, y, hide[2]); put(x1 - 1, y, hide[2]); }
  // side stitches
  for (let y = 4; y < H - 2; y += 2) { put(x0 + 1, y, THREAD); put(x0 + 1, y + 1, hide[1]); put(x1 - 2, y, THREAD); put(x1 - 2, y + 1, hide[1]); }
  // bottom: stitches + shadowed fold
  for (let x = x0 + 2; x <= x1 - 2; x += 2) { put(x, H - 3, THREAD); put(x, H - 2, hide[1]); }
  rect(x0, H - 1, x1 - x0 + 1, 1, hide[0]);
  // outline sides
  for (let y = 0; y < H; y++) { put(x0 - 1, y, INKC); put(x1 + 1, y, INKC); }
  return P;
}
function rivet(put, x, y) {
  put(x, y, R('brass', 5)); put(x + 1, y, R('brass', 3));
  put(x, y + 1, R('brass', 3)); put(x + 1, y + 1, R('brass', 1));
}
const sleeveCache = new Map();
export function sleeveCanvas(digit = null) {
  const key = String(digit);
  if (sleeveCache.has(key)) return sleeveCache.get(key);
  const P = sleeveBase(digit == null ? 7 : 30 + (+digit || 0));
  const { put } = P;
  rivet(put, 2, 1); rivet(put, KIT.SLOT_W - 4, 1);
  if (digit != null && DIG[digit]) {
    const g = DIG[digit], ox = Math.floor(KIT.SLOT_W / 2) - 1, oy = 7;
    g.forEach((row, y) => [...row].forEach((b, x) => { if (b === '1') { put(ox + x, oy + y, LP[1]); if (!+((g[y + 1] || '000')[x])) put(ox + x, oy + y + 1, LP[5]); } }));
  }
  sleeveCache.set(key, P.c);
  return P.c;
}

/** a locked pocket: flattened, cross-stitched shut, a brass padlock hangs from it */
let SEWN = null;
export function sewnCanvas() {
  if (SEWN) return SEWN;
  const hide = ['#2e1c12', '#4a3020', '#5e4030', '#76563e', '#8e6c50', '#a88566'];
  const W = KIT.SLOT_W, H = KIT.SLEEVE_H + 6;
  const P = painter(W, H);
  const base = sleeveBase(99, hide);
  P.g.drawImage(base.c, 0, 6);
  const { put } = P;
  // flatten the mouth: the flap folded down over it
  for (let x = 1; x < W - 1; x++) { put(x, 6, hide[5]); put(x, 7, hide[4]); put(x, 8, hide[4]); put(x, 9, hide[1]); }
  // cross stitches across the opening
  for (let x = 3; x < W - 3; x += 3) {
    put(x, 7, THREAD); put(x + 1, 8, THREAD); put(x + 1, 7, THREAD); put(x, 8, THREAD);
    put(x + 1, 9, THREAD_SH);
  }
  // padlock: shackle through a ring at the middle, body below
  const lx = Math.floor((KIT.SLOT_W - 8) / 2);
  const L = [
    '..kkkk..',
    '.k.ss.k.',
    '.k.ss.k.',
    'kkkkkkkk',
    'kabbbbck',
    'kabhhbck',
    'kabbhbck',
    'kabhhbck',
    'kaccccck',
    'kkkkkkkk',
  ];
  const pal = { k: INKC, a: R('brass', 5), b: R('brass', 4), c: R('brass', 2), h: R('brass', 1), s: R('steel', 4) };
  L.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) put(lx + x, 3 + y, pal[ch]); }));
  SEWN = P.c;
  return SEWN;
}

/** the dark pocket opening behind the tool */
let MOUTH = null;
export function mouthCanvas() {
  if (MOUTH) return MOUTH;
  const W = KIT.SLOT_W, H = 5;
  const { c, put } = painter(W, H);
  // an irregular dark slot: wider in the middle, a lip of shadow at the edges
  const span = [[4, W - 5], [2, W - 3], [1, W - 2], [1, W - 2], [2, W - 3]];
  span.forEach(([a, b], y) => { for (let x = a; x <= b; x++) put(x, y, x === a || x === b || y === 0 || y === H - 1 ? LB[1] : hash2(x, y, 4) < 0.15 ? '#22140c' : '#160c08'); });
  MOUTH = c;
  return c;
}

/** a dithered warm glow behind the active tool (hard pixels, three density bands) */
let GLOW = null;
export function glowCanvas() {
  if (GLOW) return GLOW;
  const W = KIT.SLOT_W, H = 30;
  const { c, put } = painter(W, H);
  const cx = W / 2, cy = H * 0.5;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot((x + 0.5 - cx) / (W * 0.5), (y + 0.5 - cy) / (H * 0.5));
    const chk = (x + y) % 2 === 0, q = x % 2 === 0 && y % 2 === 0;
    if (d < 0.38) { if (chk) put(x, y, '#fff3b0'); }
    else if (d < 0.68) { if (q) put(x, y, '#ffd860'); }
    else if (d < 0.96) { if (x % 4 === 0 && y % 2 === 0) put(x, y, '#ffcc40'); }
  }
  GLOW = c;
  return c;
}

/** the rolled-up left end: a fat leather cylinder seen end-on at the top */
let ROLL = null;
export function rollCanvas() {
  if (ROLL) return ROLL;
  const W = KIT.ROLL_W, H = KIT.H - KIT.SHEET_Y + 4;
  const { c, put, rect } = painter(W, H);
  // body: cylinder shading across x
  const tone = [LB[1], LB[2], LB[3], LB[4], LB[5], LB[4], LB[4], LB[3], LB[3], LB[2], LB[1]];
  for (let y = 3; y < H - 2; y++) for (let x = 0; x < W; x++) {
    let col = tone[x];
    if (hash2(x, y, 5) < 0.07) col = LB[2];
    put(x, y, col);
  }
  // the spiral end on top: rings of hide
  const top = ['..kkkkkkk..', '.kPQkPPQPk.', 'kPkkQkkPQkk', 'kQkPkdkQkPk', '.kPkkkkkPk.', '..kkkkkkk..'];
  const pal = { k: INKC, P: LP[4], Q: LP[5], d: '#160c08' };
  top.forEach((r, y) => [...r].forEach((ch, x) => put(x, y, pal[ch] || null)));
  // stitched band around the roll + a pull strap
  for (let x = 1; x < W - 1; x++) { put(x, 14, LB[1]); put(x, 15, LP[3]); put(x, 16, LP[4]); put(x, 17, LP[2]); put(x, 18, LB[1]); }
  for (let x = 2; x < W - 2; x += 2) put(x, 16, THREAD);
  rivet(put, 4, 15);
  // outline sides + bottom
  for (let y = 3; y < H - 1; y++) { put(0, y, INKC); put(W - 1, y, INKC); }
  rect(1, H - 2, W - 2, 1, LB[0]);
  rect(1, H - 1, W - 2, 1, INKC);
  ROLL = c;
  return c;
}

/** the tie strap: a long thong with a brass buckle, trailing off the right end */
let STRAP = null;
export function strapCanvas() {
  if (STRAP) return STRAP;
  const W = KIT.STRAP_W, H = 14;
  const { c, put, rect } = painter(W, H);
  // the strap (rows 4..9), slight droop at the tail
  for (let x = 0; x < W; x++) {
    const droop = x > W - 9 ? 1 : 0, tip = x >= W - 3;
    const y0 = 4 + droop + (tip ? x - (W - 3) : 0), y1 = 9 + droop - (tip ? x - (W - 3) : 0);
    if (y1 <= y0) continue;
    put(x, y0 - 1, INKC); put(x, y1, INKC);
    for (let y = y0; y < y1; y++) put(x, y, y === y0 ? LP[5] : y === y1 - 1 ? LP[2] : hash2(x, y, 9) < 0.1 ? LP[2] : LP[3]);
    if (x > 12 && x < W - 4 && x % 4 === 0) { put(x, 6 + droop, '#160c08'); put(x, 7 + droop, LP[1]); } // punched holes
  }
  // buckle frame
  const B = [
    'kkkkkkkk',
    'kabbbbck',
    'kab..bck',
    'kab..bck',
    'kab..bck',
    'kab..bck',
    'kab..bck',
    'kab..bck',
    'kaccccck',
    'kkkkkkkk',
  ];
  const pal = { k: INKC, a: R('brass', 5), b: R('brass', 4), c: R('brass', 2) };
  B.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) put(3 + x, 2 + y, pal[ch]); }));
  rect(6, 6, 2, 2, R('steel', 4)); // the prong
  put(6, 6, R('steel', 5));
  STRAP = c;
  return c;
}

/** tiny particle sprites */
const SPR = {
  heart: [['.rr.rr.', 'rRRrRRr', 'rRWRRRr', '.rRRRr.', '..rRr..', '...r...'], { r: '#a03c68', R: '#f08aa8', W: '#ffffff' }],
  star: [['...y...', '...y...', '..yYy..', 'yyYWYyy', '..yYy..', '...y...', '...y...'], { y: '#e5a320', Y: '#ffe98a', W: '#ffffff' }],
  spark: [['.y.', 'yWy', '.y.'], { y: '#ffe98a', W: '#ffffff' }],
  bubble: [['.gg.', 'gWlg', 'gllg', '.gg.'], { g: '#46963c', l: '#c2e274', W: '#ffffff' }],
  pellet: [['pP', 'qp'], { p: '#e8921a', P: '#ffdc80', q: '#8e420a' }],
  dust: [['.dd.', 'dDDd', 'dDDd', '.dd.'], { d: '#a88a6a', D: '#d4b894' }],
  dust2: [['dd', 'dD'], { d: '#a88a6a', D: '#d4b894' }],
  coin: [['.cc.', 'cCDc', 'cCCc', '.cc.'], { c: '#b0661a', C: '#ffd23f', D: '#fffbe0' }],
  thread: [['t'], { t: THREAD }],
  leaf: [['.gG', 'gGg', 'Gg.'], { g: '#2a723e', G: '#7cbe46' }],
  chip: [['ww', 'Ww'], { w: '#a86d38', W: '#dcaa6a' }],
};
const sprCache = new Map();
export function pxSprite(name) {
  if (sprCache.has(name)) return sprCache.get(name);
  const [rows, pal] = SPR[name] || SPR.spark;
  const { c, put } = painter(rows[0].length, rows.length);
  rows.forEach((r, y) => [...r].forEach((ch, x) => put(x, y, pal[ch] || null)));
  sprCache.set(name, c);
  return c;
}

/** a whole-roll preview for dev (all tools in pockets) */
export function __kitSheetPreview(ids = KIT_TOOL_IDS) {
  const W = KIT.ROLL_W + ids.length * KIT.SLOT_W + KIT.STRAP_W, H = KIT.H + 4;
  const { c, g } = painter(W, H);
  const sh = new Image();
  sh.src = sheetURL();
  return new Promise((res) => {
    sh.onload = () => {
      for (let i = 0; i < ids.length; i++) g.drawImage(sh, KIT.ROLL_W + i * KIT.SLOT_W, KIT.SHEET_Y);
      g.drawImage(rollCanvas(), 0, KIT.SHEET_Y - 4);
      g.drawImage(strapCanvas(), KIT.ROLL_W + ids.length * KIT.SLOT_W, KIT.SHEET_Y + 6);
      ids.forEach((id, i) => {
        const x = KIT.ROLL_W + i * KIT.SLOT_W;
        g.drawImage(mouthCanvas(), x, KIT.SLEEVE_Y - 2);
        g.drawImage(toolFrames(id)[0], x + KIT.TOOL_X, KIT.TOOL_Y);
        g.drawImage(sleeveCanvas((i + 1) % 10), x, KIT.SLEEVE_Y);
      });
      res(c);
    };
  });
}
export const __rng = rng;
