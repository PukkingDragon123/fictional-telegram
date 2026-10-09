// [v26 seasons] Weather, season and weather-gear icons (20x20, the bagArt kit
// like foodIcons.js / terraformIcons.js). Registered through the UI_ICONS hook
// (sprites.js globs ./icons/*.js).
//   wx_clear wx_rain wx_storm wx_snow wx_fog wx_heat wx_wind   (forecast: game.seasons.icon(weather))
//   season_spring season_summer season_autumn season_winter   (game.seasons.seasonIcon(season))
//   wx_cold wx_hot (thermometers), wx_radio
//   b_firepit b_heater b_shelter b_mistfan b_greenhouse        (builds / research)
import { Grid, render } from '../bagArt.js';

const out = (p) => ({ w: p.w, h: p.h, d: p.d });
const art = (fn) => () => { const { g, key } = fn(); return out(render(g, key)); };

// a puffy cloud filling the top of the icon
function cloud(g, ch, y = 0) {
  g.ellipse(6.6, 9.4 + y, 4.4, 3.4, ch);
  g.ellipse(11.4, 7.2 + y, 5.2, 4.6, ch);
  g.ellipse(15.2, 9.8 + y, 3.6, 3.0, ch);
  g.rect(4, 9 + y, 13, 4, ch);
  return g;
}
function sun(g, cx, cy, r, ch, rays, rch) {
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + 0.2;
    g.line(cx + Math.cos(a) * (r + 1.6), cy + Math.sin(a) * (r + 1.6), cx + Math.cos(a) * (r + 3.4), cy + Math.sin(a) * (r + 3.4), rch);
  }
  g.ellipse(cx, cy, r, r, ch);
  return g;
}
function flake(g, cx, cy, ch, big = false) {
  g.set(cx, cy, ch).set(cx - 1, cy, ch).set(cx + 1, cy, ch).set(cx, cy - 1, ch).set(cx, cy + 1, ch);
  if (big) g.set(cx - 1, cy - 1, ch).set(cx + 1, cy + 1, ch).set(cx - 1, cy + 1, ch).set(cx + 1, cy - 1, ch);
  return g;
}

const ICONS = {
  wx_clear: () => {
    const g = new Grid(20, 20);
    sun(g, 10, 10, 4.8, 'S', 8, 'R');
    g.set(8, 8, '+').set(9, 8, '+').set(8, 9, '+');
    return { g, key: { S: 'gold.r@s', R: 'yellow:3' } };
  },
  wx_rain: () => {
    const g = new Grid(20, 20);
    cloud(g, 'C', -1);
    for (const [x, y] of [[5, 15], [9, 16], [13, 15], [16, 17], [7, 18]]) g.line(x, y, x - 1, y + 2, 'D');
    return { g, key: { C: 'steel.r@c', D: 'sky:3' } };
  },
  wx_storm: () => {
    const g = new Grid(20, 20);
    cloud(g, 'C', -1);
    g.poly([[11.5, 9.5], [7.6, 15], [10.4, 15], [8.2, 19.6], [14.2, 12.6], [11.4, 12.6], [13.6, 9.5]], 'B');
    g.line(4, 15, 3, 17, 'D').line(16, 15, 15, 17, 'D');
    return { g, key: { C: 'slate.r@c', B: 'yellow.r@b', D: 'sky:3' } };
  },
  wx_snow: () => {
    const g = new Grid(20, 20);
    cloud(g, 'C', -1);
    flake(g, 5, 16, 'F'); flake(g, 10, 17, 'F', true); flake(g, 15, 15, 'F');
    return { g, key: { C: 'white.r@c', F: 'ice:4' } };
  },
  wx_fog: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 6.5, 6.5, 3.4, 'C');
    for (const [y, x0, x1] of [[9, 2, 15], [12, 5, 18], [15, 1, 13], [18, 6, 17]]) { g.rect(x0, y, x1 - x0, 2, 'F'); g.set(x0 - 1, y + 1, 'F'); g.set(x1, y, 'F'); }
    return { g, key: { C: 'white.r@c', F: 'steel:4' } };
  },
  wx_heat: () => {
    const g = new Grid(20, 20);
    sun(g, 10, 7.5, 4.2, 'S', 8, 'R');
    for (const x of [4, 10, 16]) for (let y = 14; y <= 19; y++) g.set(x + ((y >> 1) % 2 ? 1 : 0), y, 'W');
    return { g, key: { S: 'fire.r@s', R: 'orange:3', W: 'orange:4' } };
  },
  wx_wind: () => {
    const g = new Grid(20, 20);
    g.line(1, 6, 12, 6, 'W').set(13, 5, 'W').set(14, 4, 'W').set(13, 3, 'W').set(12, 3, 'W');
    g.line(3, 10, 16, 10, 'W').set(17, 11, 'W').set(18, 12, 'W').set(17, 13, 'W').set(16, 13, 'W');
    g.line(1, 14, 10, 14, 'W').set(11, 13, 'W').set(12, 12, 'W').set(11, 11, 'W');
    g.set(6, 17, 'L').set(7, 17, 'L').set(7, 16, 'L').set(14, 16, 'L').set(15, 17, 'L');
    return { g, key: { W: 'sky:4', L: 'orange:3' } };
  },
  wx_cold: () => {
    const g = new Grid(20, 20);
    g.rect(8, 2, 4, 12, 'T');
    g.ellipse(10, 15.5, 3.4, 3.4, 'B');
    g.rect(9, 7, 2, 8, 'B');
    flake(g, 16, 4, 'F', true); flake(g, 3, 8, 'F');
    return { g, key: { T: 'white.r@t', B: 'sky.r@b', F: 'ice:4' } };
  },
  wx_hot: () => {
    const g = new Grid(20, 20);
    g.rect(8, 2, 4, 12, 'T');
    g.ellipse(10, 15.5, 3.4, 3.4, 'B');
    g.rect(9, 4, 2, 11, 'B');
    for (let y = 3; y <= 9; y++) { g.set(15 + ((y >> 1) % 2), y, 'W'); g.set(3 + ((y >> 1) % 2), y + 2, 'W'); }
    return { g, key: { T: 'white.r@t', B: 'red.r@b', W: 'orange:4' } };
  },
  wx_radio: () => {
    const g = new Grid(20, 20);
    g.line(14, 1, 11, 7, 'A');
    g.rect(2, 7, 16, 10, 'R');
    g.ellipse(7, 12, 3.2, 3.2, 'G');
    g.rect(12, 9, 4, 2, 'D').rect(12, 13, 4, 1, 'K').rect(12, 15, 4, 1, 'K');
    g.rect(3, 17, 2, 2, 'K').rect(15, 17, 2, 2, 'K');
    return { g, key: { A: 'steel:2', R: 'red.r@r', G: 'brass.i@g', D: 'mint:4', K: 'dwood:1' } };
  },
  season_spring: () => {
    const g = new Grid(20, 20);
    g.line(10, 13, 12, 19, 'S');
    g.ellipse(15, 16, 2.6, 1.4, 'L');
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; g.ellipse(10 + Math.cos(a) * 3.6, 9 + Math.sin(a) * 3.6, 2.8, 2.8, 'P'); }
    g.ellipse(10, 9, 1.8, 1.8, 'Y');
    return { g, key: { P: 'pink.r@p', Y: 'yellow:4', S: 'leaf:2', L: 'leaf.r@l' } };
  },
  season_summer: () => {
    const g = new Grid(20, 20);
    sun(g, 10, 10, 5.4, 'S', 12, 'R');
    g.set(8, 8, '+').set(9, 8, '+').set(8, 9, '+');
    return { g, key: { S: 'yellow.r@s', R: 'orange:3' } };
  },
  season_autumn: () => {
    const g = new Grid(20, 20);
    // a maple leaf
    g.poly([[10, 1], [12, 5.5], [15, 4], [14.2, 8], [18.6, 7.4], [16.4, 11], [18, 12.4], [12.6, 14.2], [11, 15.4], [10, 14], [9, 15.4], [7.4, 14.2], [2, 12.4], [3.6, 11], [1.4, 7.4], [5.8, 8], [5, 4], [8, 5.5]], 'L');
    g.line(10, 14, 10, 19, 'S');
    g.line(10, 5, 10, 13, 'V');
    return { g, key: { L: 'orange.r@l', S: 'wood:2', V: 'red:2' } };
  },
  season_winter: () => {
    const g = new Grid(20, 20);
    g.line(10, 1, 10, 19, 'I');
    g.line(2, 5, 18, 15, 'I');
    g.line(2, 15, 18, 5, 'I');
    for (const [x, y, dx, dy] of [[10, 3, 1, 1], [10, 17, 1, -1], [4, 6, 1, -1], [16, 14, -1, 1], [4, 14, 1, 1], [16, 6, -1, -1]]) { g.set(x + dx, y + dy, 'I'); g.set(x - dx, y + dy, 'I'); }
    g.ellipse(10, 10, 2, 2, 'C');
    return { g, key: { I: 'ice.r@i', C: 'white:5' } };
  },
  b_firepit: () => {
    const g = new Grid(20, 20);
    g.ellipse(10, 16, 8.6, 3.2, 'R');
    g.ellipse(10, 15.6, 6, 2, 'A');
    g.line(5, 15, 15, 12, 'W').line(5, 14, 15, 11, 'W').line(5, 12, 15, 15, 'W').line(5, 11, 15, 14, 'W');
    g.poly([[10, 1.6], [13.6, 7.4], [13.4, 11.6], [10, 13.4], [6.6, 11.6], [6.6, 7.6], [8.4, 5.4], [8.8, 7.6]], 'F');
    g.poly([[10, 6.6], [12, 9.6], [11.4, 12], [10, 12.6], [8.6, 12], [8.4, 9.6]], 'Y');
    return { g, key: { R: 'stone.r@r', A: 'dwood:1', W: 'wood.x@w', F: 'fire.r@f', Y: 'yellow:5!' } };
  },
  b_heater: () => {
    const g = new Grid(20, 20);
    g.poly([[3, 4], [17, 4], [14.6, 1.4], [5.4, 1.4]], 'H');
    g.rect(4, 4, 12, 1, 'h');
    g.rect(8, 5, 4, 3, 'G');
    g.rect(9, 8, 2, 9, 'P');
    g.ellipse(10, 18, 5, 1.6, 'B');
    for (const x of [6, 10, 14]) { g.set(x, 6, 'W').set(x + (x === 10 ? 0 : x < 10 ? -1 : 1), 7, 'W'); }
    return { g, key: { H: 'brass.r@h', h: 'brass:1', G: 'fire.r@g', P: 'brass.x@p', B: 'iron.r@b', W: 'orange:4' } };
  },
  b_shelter: () => {
    const g = new Grid(20, 20);
    g.poly([[1, 8], [10, 2], [19, 8], [17.4, 9.4], [2.6, 9.4]], 'R');
    g.line(2, 9, 18, 9, 'r');
    g.rect(4, 10, 2, 9, 'P').rect(14, 10, 2, 9, 'P');
    g.rect(7, 15, 6, 2, 'B');
    for (const [x, y] of [[1, 12], [18, 13], [1, 16], [18, 17]]) g.line(x, y, x, y + 1, 'D');
    return { g, key: { R: 'red.r@r', r: 'red:1', P: 'wood.x@p', B: 'lwood.f@b', D: 'sky:3' } };
  },
  b_mistfan: () => {
    const g = new Grid(20, 20);
    g.ellipse(9, 8, 6.6, 6.6, 'O');
    g.ellipse(9, 8, 5.2, 5.2, 'I');
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.4; g.ellipse(9 + Math.cos(a) * 2.6, 8 + Math.sin(a) * 2.6, 2.2, 1.6, 'V'); }
    g.ellipse(9, 8, 1.2, 1.2, 'H');
    g.rect(8, 14, 2, 4, 'P');
    g.rect(5, 18, 8, 1, 'P');
    for (const [x, y] of [[17, 4], [18, 7], [16, 9], [18, 11], [17, 13]]) g.set(x, y, 'M');
    return { g, key: { O: 'steel.r@o', I: 'sky:5', V: 'steel:3', H: 'iron:2', P: 'steel.x@p', M: 'sky:4' } };
  },
  b_greenhouse: () => {
    const g = new Grid(20, 20);
    g.poly([[1, 9], [10, 2], [19, 9]], 'G');
    g.rect(2, 9, 16, 10, 'G');
    for (const x of [2, 6, 10, 14, 17]) g.line(x, 9, x, 18, 'F');
    g.line(1, 9, 10, 2, 'F').line(19, 9, 10, 2, 'F').line(2, 9, 17, 9, 'F').line(2, 18, 17, 18, 'F');
    g.ellipse(5, 16, 2, 2.4, 'L').ellipse(12, 15.6, 2.4, 2.8, 'L');
    g.set(12, 14, 'T').set(5, 15, 'T');
    return { g, key: { G: 'glass:3', F: 'white:4', L: 'leaf.r@l', T: 'red:3' } };
  },
};

export const UI_ICONS = Object.fromEntries(Object.entries(ICONS).map(([k, fn]) => [k, art(fn)]));
