// Terraform tool icons (20x20, same kit/palette/outlines as foodIcons.js):
//   tf_raise   a grassy mound with an up arrow
//   tf_lower   a dug dip with a down arrow
//   tf_paint   a fat paint brush dripping green
//   tf_dig     a new little pond with a shovel stuck beside it
//   tf_fill    a dirt pile pushed into the water
//   tf_name    a wooden name sign on a post
// Registered through the UI_ICONS hook (sprites.js globs ./icons/*.js).
import { Grid, render } from '../bagArt.js';

const out = (p) => ({ w: p.w, h: p.h, d: p.d });
const art = (fn) => () => { const { g, key } = fn(); return out(render(g, key)); };

// the top `n` filled pixels of every column in `from` become `to` (grass caps)
function cap(g, from, to, n = 2) {
  for (let x = 0; x < g.w; x++) {
    let k = 0;
    for (let y = 0; y < g.h && k < n; y++) if (from.includes(g.get(x, y))) { g.set(x, y, to); k++; }
  }
  return g;
}
const arrow = (g, cx, y0, up, ch) => {
  if (up) { g.poly([[cx, y0 - 0.2], [cx + 4.6, y0 + 4.4], [cx - 4.6, y0 + 4.4]], ch); g.rect(Math.round(cx) - 1, y0 + 4, 2, 3, ch); }
  else { g.rect(Math.round(cx) - 1, y0, 2, 3, ch); g.poly([[cx - 4.6, y0 + 2.6], [cx + 4.6, y0 + 2.6], [cx, y0 + 7.2]], ch); }
  return g;
};

const ICONS = {
  tf_raise: () => {
    const g = new Grid(20, 20);
    g.poly([[1.2, 19], [18.8, 19], [16.4, 14.6], [12.6, 11.8], [7.4, 11.8], [3.6, 14.6]], 'D');
    cap(g, 'D', 'G', 2);
    g.set(6, 16, 'p').set(13, 17, 'p').set(10, 15, 'p');
    arrow(g, 10, 1, true, 'A');
    return { g, key: { D: 'cinnamon.r@d', G: 'leaf.x@g', p: 'cinnamon:1', A: 'gold.r@a' } };
  },
  tf_lower: () => {
    const g = new Grid(20, 20);
    g.rect(1, 12, 18, 7, 'D');
    cap(g, 'D', 'G', 2);
    g.poly([[5, 12], [15, 12], [13, 17], [7, 17]], 'h');
    g.rect(7, 16, 6, 1, 'h');
    arrow(g, 10, 1, false, 'A');
    return { g, key: { D: 'cinnamon.r@d', G: 'leaf.x@g', h: 'dkbear:1', A: 'sky.r@a' } };
  },
  tf_paint: () => {
    const g = new Grid(20, 20);
    g.line(15, 2, 9, 9, 'H').line(16, 3, 10, 10, 'H').line(16, 2, 10, 9, 'H');
    g.rect(6, 9, 5, 3, 'F').set(9, 8, 'F').set(10, 8, 'F');
    g.poly([[4.4, 11.2], [11.6, 11.2], [10.6, 15.2], [8.6, 17.6], [6.4, 17.6], [3.6, 15.4]], 'B');
    g.set(7, 18, 'B').set(3, 18, 'B').set(3, 17, 'B');
    g.rect(13, 16, 6, 3, 'C').set(14, 15, 'C').set(17, 15, 'C');
    return { g, key: { H: 'wood.x@h', F: 'steel.r@f', B: 'leaf.r@b', C: 'leaf:3' } };
  },
  tf_dig: () => {
    const g = new Grid(20, 20);
    g.ellipse(8.5, 13.5, 7.6, 4.6, 'R');
    g.ellipse(8.5, 13.8, 6, 3.3, 'W');
    g.set(5, 12, '*').set(6, 12, '*').set(10, 15, '+');
    g.line(16, 1, 16, 12, 'H').line(17, 1, 17, 12, 'H');
    g.rect(15, 1, 4, 1, 'H');
    g.poly([[13.6, 11.6], [19.4, 11.6], [19.2, 16.4], [16.5, 18.6], [13.8, 16.4]], 'S');
    return { g, key: { R: 'sand.r@r', W: 'water.i@w', H: 'wood.x@h', S: 'steel.r@s' } };
  },
  tf_fill: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 14.4, 8.6, 4.4, 'W');
    g.poly([[2.6, 16.6], [13.8, 16.6], [12, 11.6], [8.6, 7.8], [5.6, 9.6], [3.4, 12.6]], 'D');
    g.set(6, 11, 'p').set(9, 13, 'p').set(5, 14, 'p');
    g.set(15, 13, '*').set(16, 13, '*');
    // a clod flying in
    g.ellipse(15.6, 6, 1.8, 1.6, 'D');
    g.set(13, 9, 'D');
    return { g, key: { W: 'water.i@w', D: 'cinnamon.r@d', p: 'cinnamon:1' } };
  },
  tf_name: () => {
    const g = new Grid(20, 20);
    g.rect(9, 11, 2, 8, 'P');
    g.poly([[1, 3], [19, 2.4], [19, 11.4], [1, 12]], 'B');
    g.line(2, 7, 18, 7, 'k');
    g.rect(4, 4, 7, 1, 'T').rect(4, 9, 11, 1, 'T').rect(12, 4, 4, 1, 'T');
    g.set(2, 4, 'n').set(17, 3, 'n').set(2, 10, 'n').set(17, 10, 'n');
    g.rect(7, 18, 6, 1, 'G').set(6, 17, 'G').set(13, 17, 'G');
    return { g, key: { P: 'dwood.x@p', B: 'lwood.f@b', T: 'dwood:1', n: 'steel:4', G: 'leaf:3' } };
  },
};

export const UI_ICONS = Object.fromEntries(Object.entries(ICONS).map(([k, fn]) => [k, art(fn)]));
