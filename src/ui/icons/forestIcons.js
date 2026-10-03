// Forest UI icons (20x20, the same pixel kit, ramps and outlines as
// foodIcons.js / sprites.js):
//   forage      fiddlehead ramps morel wildberry pinecone resin logpile (wood)
//   crops       tomato cabbage
//   ruins       ruin_chair ruin_table ruin_clock ruin_lamp ruin_cart
// Registered through the UI_ICONS hook (sprites.js globs ./icons/*.js).
// Nothing is drawn until an icon is first used.
import { Grid, render } from '../bagArt.js';

const out = (p) => ({ w: p.w, h: p.h, d: p.d });
const art = (fn) => () => { const { g, key } = fn(); return out(render(g, key)); };
const sparkle = (g, x, y, ch = 's') => g.set(x, y, ch).set(x - 1, y, ch).set(x + 1, y, ch).set(x, y - 1, ch).set(x, y + 1, ch);
// the dark spiral groove of a fern coil (inner line 'k') round (cx, cy)
function groove(g, cx, cy, r0, turns, dir = 1) {
  for (let a = 0; a < Math.PI * 2 * turns; a += 0.06) {
    const r = r0 - (a / (Math.PI * 2)) * 2.1;
    if (r < 0.6) break;
    g.set(Math.floor(cx + Math.cos(a) * r * dir), Math.floor(cy + Math.sin(a) * r), 'k');
  }
}

const ICONS = {
  // a big fern crosier and a small one, coiled tight
  fiddlehead: () => {
    const g = new Grid(20, 20);
    g.line(14, 19, 14, 11, 'S').line(15, 19, 15, 12, 'S');
    g.ellipse(10, 7, 6.2, 6, 'C');
    groove(g, 10, 7, 5.2, 2.3);
    g.line(5, 19, 5, 15, 'T');
    g.ellipse(4.4, 12.6, 3.2, 3, 'D');
    groove(g, 4.4, 12.6, 2.4, 1.2, -1);
    g.set(9, 4, 'h').set(8, 5, 'h');
    return { g, key: { S: 'leaf.x@s', T: 'leaf.x@t', C: 'lime.R@c', D: 'lime.R@d', h: 'lime:5' } };
  },
  // wild leeks: broad glossy leaves, wine-red stems, white bulbs
  ramps: () => {
    const g = new Grid(20, 20);
    g.poly([[4, 13], [2, 6], [4, 1.6], [7, 6], [7.4, 13]], 'A');
    g.poly([[8.4, 13], [8, 4], [11, 0.6], [13.4, 5], [11.8, 13]], 'B');
    g.poly([[12.6, 13], [14, 6], [17.6, 2.6], [18, 8], [15.6, 13]], 'C');
    g.line(5, 3, 5, 12, 'v').line(10, 2, 10, 12, 'v').line(16, 5, 14, 12, 'v');
    g.rect(5, 13, 2, 3, 'R').rect(9, 13, 2, 3, 'R').rect(13, 13, 2, 3, 'R');
    g.ellipse(6, 17.4, 2, 1.8, 'W').ellipse(10, 17.6, 2, 1.8, 'W').ellipse(14, 17.4, 2, 1.8, 'W');
    return { g, key: { A: 'leaf.r@a', B: 'lime.R@b', C: 'leaf.r@c', v: 'lime:5', R: 'plum.x@r', W: 'cream.R@w' } };
  },
  // a morel: tall honeycomb cap on a pale stem
  morel: () => {
    const g = new Grid(20, 20);
    g.poly([[10, 1], [15.4, 8], [15.6, 13.4], [4.4, 13.4], [4.6, 8]], 'M');
    for (let y = 3; y < 13; y += 2) for (let x = 4 + ((y >> 1) & 1); x < 16; x += 2) if (g.get(x, y) === 'M') g.set(x, y, 'p');
    g.rect(7, 13, 6, 5, 'S');
    g.rect(6, 18, 8, 1, 'S');
    g.set(8, 4, 'h').set(7, 6, 'h');
    return { g, key: { M: 'tan.r@cap', p: 'dkbear:1', S: 'cream.x@stem', h: 'sand:5' } };
  },
  // blackberries on a bramble twig with a leaf
  wildberry: () => {
    const g = new Grid(20, 20);
    g.line(2, 3, 9, 8, 'T').line(9, 8, 15, 5, 'T');
    g.poly([[13, 5], [19, 1], [18.6, 7], [15, 8]], 'L');
    g.line(15, 6, 18, 3, 'v');
    for (const [cx, cy, ch] of [[7, 13.4, 'B'], [13.4, 13, 'C']]) {
      g.ellipse(cx, cy, 4.2, 5, ch);
      for (let y = Math.round(cy - 4); y <= cy + 4; y += 2) for (let x = Math.round(cx - 3) + ((y >> 1) & 1); x <= cx + 3; x += 2) if (g.get(x, y) === ch) g.set(x, y, ch === 'B' ? 'b' : 'c');
    }
    g.set(5, 11, 'w').set(11, 10, 'w');
    return { g, key: { T: 'cinnamon:2', L: 'leaf.r@l', v: 'leaf:4', B: 'plum.R@b', C: 'purple.R@c', b: 'plum:4', c: 'lilac:3', w: '#ffffff' } };
  },
  // a pinecone: rows of chevron scales, lit tips
  pinecone: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 10.6, 6.2, 8.4, 'P');
    for (let y = 3; y < 19; y += 3) for (let x = 3; x < 17; x++) {
      const off = ((y / 3) & 1) ? 1 : 0;
      if (g.get(x, y) !== 'P') continue;
      if ((x + off) % 3 === 0) g.set(x, y, 'k');
      else if ((x + off) % 3 === 1 && g.get(x, y - 1) === 'P') g.set(x, y - 1, 't');
    }
    g.line(10, 0, 10, 2, 'S');
    return { g, key: { P: 'cinnamon.r@pc', t: 'cinnamon:5', S: 'dwood:3' } };
  },
  // a lump of glowing amber resin with a drip and a trapped bubble
  resin: () => {
    const g = new Grid(20, 20);
    g.rect(1, 1, 7, 18, 'W');
    g.line(3, 2, 3, 17, 'w').line(6, 4, 6, 14, 'w');
    g.ellipse(12.6, 11.4, 6.4, 6.6, 'A');
    g.ellipse(10, 5.4, 2.6, 3, 'A');
    g.line(8, 4, 8, 9, 'A');
    g.ellipse(14, 17.6, 1.6, 1.6, 'A');
    g.set(10, 9, 'h').set(9, 10, 'h').set(10, 4, 'h').set(15, 13, 'o');
    sparkle(g, 17, 4);
    return { g, key: { W: 'dwood.x@bark', w: 'wood:1', A: 'honey.R@amb', h: '#fffbe0', o: 'yellow:5', s: '#fff4c0' } };
  },
  // a little stack of logs, ring ends out
  logpile: () => {
    const g = new Grid(20, 20);
    for (const [x, y] of [[5, 14], [14, 14], [9.5, 6.6]]) {
      g.ellipse(x, y, 4.6, 4.6, 'B');
      g.ellipse(x, y, 3.4, 3.4, 'R');
      g.ellipse(x, y, 1.6, 1.6, 'r');
      g.set(Math.round(x), Math.round(y), 'k');
    }
    g.line(2, 14, 4, 13, 'k').line(15, 12, 16, 15, 'k');
    return { g, key: { B: 'wood.r@bark', R: 'lwood.r@ring', r: 'parch.r@core' } };
  },
  // a glossy red tomato with a green star calyx
  tomato: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 11.6, 8.2, 7.4, 'T');
    g.line(6, 6, 8, 9, 'k').line(14, 6, 12, 9, 'k');
    g.stamp(5, 2, ['..L...L..', '...LCL...', 'LLLLCLLLL', '...LLL...', '..L...L..']);
    g.set(9, 1, 'C').set(10, 1, 'C');
    g.set(6, 10, 'h').set(5, 11, 'h').set(6, 11, 'h');
    return { g, key: { T: 'red.R@t', L: 'leaf.r@cal', C: 'leaf:2', h: '#fff0e0' } };
  },
  // a cabbage: veined wrapper leaves round a pale heart
  cabbage: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 11.4, 9.2, 7.6, 'A');
    g.ellipse(4.6, 9, 4, 4.6, 'B').ellipse(15.4, 9, 4, 4.6, 'B');
    g.ellipse(10, 9.6, 5, 4.6, 'C');
    g.line(10, 13, 10, 6, 'v').line(10, 11, 7, 7, 'v').line(10, 11, 13, 7, 'v');
    g.line(4, 7, 6, 13, 'w').line(16, 7, 14, 13, 'w');
    for (const x of [2, 6, 14, 18]) g.set(x, 17, 'k');
    return { g, key: { A: 'green.r@a', B: 'green.r@b', C: 'lime.R@c', v: 'lime:5', w: 'green:5' } };
  },
  // ---- ruins: the broken pieces you find in the forest
  ruin_chair: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 6, 6, 5.4, 'V');
    g.rect(4, 6, 12, 6, 'V');
    g.rect(1, 9, 4, 5, 'A').rect(15, 9, 4, 5, 'A');
    g.rect(3, 12, 14, 3, 'S');
    g.ellipse(8, 13, 2.4, 1.2, 'F');
    g.rect(3, 15, 14, 1, 'O');
    g.line(4, 16, 4, 19, 'O').line(15, 16, 16, 18, 'O');
    g.line(9, 4, 12, 9, 'k').line(12, 9, 11, 11, 'k');
    g.set(16, 4, 'm').set(17, 5, 'm').set(15, 3, 'm');
    return { g, key: { V: 'rose.r@back', A: 'wood.x@arm', S: 'red.x@seat', F: 'cream.r@stuff', O: 'dwood.x@leg', m: 'moss:4' } };
  },
  ruin_table: () => {
    const g = new Grid(20, 20);
    g.poly([[1, 5], [13, 3], [19, 10], [7, 12]], 'T');
    g.poly([[7, 12], [19, 10], [19, 12], [7, 14]], 'E');
    g.line(5, 6, 15, 10, 'k');
    g.line(8, 14, 8, 19, 'L').line(17, 12, 17, 15, 'L');
    g.line(2, 8, 2, 16, 'L');
    g.line(12, 18, 17, 19, 'B');
    g.set(4, 6, 'm').set(5, 5, 'm').set(11, 5, 'm');
    return { g, key: { T: 'lwood.f@top', E: 'wood:1', L: 'dwood.x@leg', B: 'wood:3', m: 'moss:4' } };
  },
  ruin_clock: () => {
    const g = new Grid(20, 20);
    g.poly([[6, 2], [14, 2], [15, 4], [5, 4]], 'R');
    g.rect(5, 4, 10, 7, 'H');
    g.ellipse(10, 7.4, 3.2, 3, 'D');
    g.line(10, 7, 10, 5, 'k').line(10, 7, 12, 8, 'k');
    g.line(8, 5, 12, 10, 'c');
    g.rect(6, 11, 8, 7, 'B');
    g.rect(8, 12, 4, 5, 'G');
    g.line(10, 12, 10, 15, 'P').set(10, 16, 'P');
    g.rect(5, 18, 10, 2, 'R');
    g.set(6, 3, 'm').set(13, 3, 'm');
    return { g, key: { R: 'dwood.y@roof', H: 'wood.x@hood', D: 'cream.r@dial', c: 'tan:2', B: 'wood.x@body', G: 'dwood:1', P: 'brass:4', m: 'moss:4' } };
  },
  ruin_lamp: () => {
    const g = new Grid(20, 20);
    g.line(8, 1, 12, 1, 'H').set(7, 2, 'H').set(13, 2, 'H');
    g.poly([[6, 3], [14, 3], [16, 6], [4, 6]], 'C');
    g.rect(5, 6, 10, 9, 'G');
    g.line(5, 6, 5, 14, 'I').line(14, 6, 14, 14, 'I').line(10, 6, 10, 14, 'I');
    g.rect(4, 15, 12, 3, 'C');
    g.rect(7, 10, 2, 4, 'W').set(7, 9, 'f');
    g.line(11, 7, 13, 11, 'k');
    g.set(15, 8, 'r').set(15, 12, 'r').set(3, 16, 'r');
    return { g, key: { H: 'copper:2', C: 'copper.x@cap', G: 'glass.r@gl', I: 'copper:1', W: 'cream:4', f: 'fire:4', r: 'copper:3' } };
  },
  ruin_cart: () => {
    const g = new Grid(20, 20);
    g.line(0, 15, 6, 10, 'H').line(0, 16, 6, 11, 'H');
    g.rect(5, 6, 14, 6, 'B');
    g.line(5, 8, 18, 8, 'k');
    g.rect(12, 6, 3, 2, '.');
    g.ellipse(12, 14.4, 4.8, 4.8, 'W');
    g.ellipse(12, 14.4, 3.4, 3.4, '.');
    g.line(12, 11, 12, 18, 'S').line(9, 14, 15, 14, 'S');
    g.set(12, 14, 'X');
    g.set(7, 5, 'f').set(10, 4, 'y').set(16, 5, 'f').set(7, 4, 'g').set(16, 4, 'g');
    return { g, key: { H: 'wood:2', B: 'lwood.x@bed', W: 'wood.r@wheel', S: 'wood:2', X: 'copper:3', f: 'pink:4', y: 'yellow:4', g: 'leaf:4' } };
  },
};

export const UI_ICONS = {};
for (const [name, fn] of Object.entries(ICONS)) UI_ICONS[name] = art(fn);
