// Hand-drawn pixel art for the gig video, drawn in code one pixel at a time (no image
// files): little animated scenes on small canvases, shown big with crisp pixels.
// Each scene: SCENES[name] = { w, h, draw(P, t) } where P is a pixel painter on the
// scene canvas and t the seconds since it appeared.
const INK = '#2a1a10';
const C = {
  ink: INK, cream: '#fdf3dc', paper: '#f3e2bd', paperD: '#e0c896', line: '#9ac0e8',
  sea: '#3f8fd8', seaL: '#6cb4f0', seaD: '#2f6cc0', foam: '#d8f0ff',
  grass: '#5cb84c', grassL: '#8cd86a', grassD: '#3c8a3a', sand: '#ecd58c', sandD: '#c9ad62',
  rock: '#8a90a0', rockL: '#b8bcc8', snow: '#f4f8ff', pine: '#2f7a46', pineD: '#1f5a34',
  red: '#e84a3a', redD: '#a82a2a', white: '#fdfbf2', blue: '#2f4ca8', gold: '#ffd23a', goldD: '#c89020', goldL: '#fff2a0',
  orange: '#f08a1a', orangeD: '#c0581a', orangeL: '#ffb070', brown: '#8a5a2e', brownD: '#5a3418', brownL: '#b8804a',
  green: '#4cc05a', purple: '#7a4ac8', purpleD: '#4a2a88', pink: '#ff7aa8', sky: '#bfe4ff', skyD: '#8cc8f0',
  dark: '#1e1a2e', dark2: '#2c2644', code1: '#c792ea', code2: '#82aaff', code3: '#c3e88d', code4: '#ffcb6b', code5: '#f78c6c',
};
export const PAL = C;

// ---------------------------------------------------------------- painter
export function painter(ctx) {
  const P = {
    ctx,
    px(x, y, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); },
    rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); },
    ell(cx, cy, rx, ry, c) {
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) P.px(x, y, c);
      }
    },
    line(x0, y0, x1, y1, c) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let e = dx + dy;
      for (;;) { P.px(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
    },
    poly(pts, c) {
      const ys = pts.map((p) => p[1]), y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys));
      for (let y = y0; y <= y1; y++) for (let x = Math.floor(Math.min(...pts.map((p) => p[0]))); x <= Math.max(...pts.map((p) => p[0])); x++) {
        let ins = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) ins = !ins; }
        if (ins) P.px(x, y, c);
      }
    },
    dith(x, y, w, h, a, b) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) P.px(x + i, y + j, (i + j) % 2 ? a : b); },
    // a sprite from rows of palette letters, '.' = clear
    rows(x, y, rows, pal, flip = false) {
      rows.forEach((r, j) => [...r].forEach((ch, i) => { const c = pal[ch]; if (c) P.px(x + (flip ? r.length - 1 - i : i), y + j, c); }));
    },
    // dark outline around everything drawn inside the box (call after drawing a sprite)
    outline(x, y, w, h, c = INK) {
      const d = ctx.getImageData(x - 1, y - 1, w + 2, h + 2), W = w + 2, H = h + 2, a = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? 0 : d.data[(j * W + i) * 4 + 3]);
      const out = [];
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (!a(i, j) && (a(i - 1, j) || a(i + 1, j) || a(i, j - 1) || a(i, j + 1))) out.push([i, j]);
      for (const [i, j] of out) P.px(x - 1 + i, y - 1 + j, c);
    },
  };
  return P;
}
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
const pop = (u) => { u = clamp(u); const c = 1.9; const v = u - 1; return 1 + (c + 1) * v * v * v + c * v * v; };
const hash = (i) => { let h = Math.imul(i ^ 0x5bd1e995, 2654435761); h ^= h >>> 15; return ((h >>> 0) % 1000) / 1000; };

// ---------------------------------------------------------------- shared sprites
// a map pin
function pin(P, x, y, c = C.red) {
  P.ell(x, y - 5, 3, 3, c); P.px(x - 1, y - 6, C.white);
  P.line(x, y - 2, x, y, INK); P.px(x - 2, y - 7, INK);
}
function heart(P, x, y, c = C.red) {
  P.rows(x, y, ['.kk.kk.', 'krrkrrk', 'krrrrrk', '.krrrk.', '..krk..', '...k...'], { k: INK, r: c });
  P.px(x + 1, y + 1, C.pink);
}
function coin(P, x, y, f = 0) {
  const w = [3, 2, 1, 2][f % 4];
  P.ell(x, y, w, 3, C.goldD); P.ell(x, y, Math.max(1, w - 1), 2, C.gold); if (w > 1) P.px(x - 1, y - 1, C.goldL);
}
function note(P, x, y, c = C.gold) {
  P.rows(x, y, ['..kkk', '..kak', '..k..', '..k..', 'kkk..', 'kak..', 'kkk..'], { k: INK, a: c });
}
// a little side-view fox (Reynard) walking, 16x14, frame 0..3
export function foxSprite(P, x, y, f = 0, hat = true) {
  const legs = [['.k...k', '.k...k'], ['k....k.', '.k..k..'], ['.k...k', '.k...k'], ['..k.k..', '.k....k']][f % 4];
  const pal = { k: INK, o: C.orange, d: C.orangeD, l: C.orangeL, w: C.white, b: '#2a2238', g: C.gold, h: '#1e1a2e', r: C.red };
  const body = [
    '.....hhh........',
    '....hhhhh.......',
    '...hrrrrrh......',
    '..k.kkkkk.k.....',
    '..kok...kok.....',
    '..koooooook.....',
    '.koowoooowok....',
    '.kowkooookwk...k',
    '..kwwwwwwwk...kok',
    '...kkbbbkk...kook',
    '....kbbbbkkkkdook',
    '....kbbbbbooddok.',
    '....kbbbbbbookk..',
    '.....kkkkkkkk....',
  ];
  P.rows(x, y, hat ? body : body.slice(3).map(() => '').concat(body.slice(3)), pal);
  const [l1, l2] = legs;
  P.rows(x + 4, y + 14, [l1.replace(/k/g, 'k'), l2], { k: INK });
}

// ---------------------------------------------------------------- scenes
export const SCENES = {};

// Thailand -> Vancouver: the flight on a paper map
SCENES.map = {
  w: 168, h: 100,
  draw(P, t) {
    // sea with moving wave glints
    P.rect(0, 0, 168, 100, C.sea);
    for (let j = 0; j < 100; j += 6) for (let i = 0; i < 168; i += 14) { const x = (i + j * 3 + Math.floor(t * 6)) % 176 - 4; P.rect(x, j + 2, 3, 1, C.seaL); }
    P.dith(0, 0, 168, 3, C.seaD, C.sea);
    // Thailand (bottom left): coast, beach, temple, palm, flag
    const th = (x, y) => ((x - 30) / 24) ** 2 + ((y - 72) / 22) ** 2 < 1 || ((x - 40) / 8) ** 2 + ((y - 94) / 12) ** 2 < 1;
    for (let y = 44; y < 100; y++) for (let x = 2; x < 64; x++) if (th(x, y)) P.px(x, y, th(x - 2, y) && th(x + 2, y) && th(x, y - 2) && th(x, y + 2) ? ((x + y) % 7 ? C.grass : C.grassL) : C.sand);
    // golden temple
    P.rect(22, 70, 12, 6, C.goldD); P.rect(23, 66, 10, 5, C.gold); P.rect(25, 62, 6, 5, C.gold);
    for (let k = 0; k < 8; k++) P.rect(27 + (k % 2 ? 0 : 0), 54 + k, 2, 1, k % 3 ? C.gold : C.goldL);
    P.px(28, 52, C.goldL); P.rect(26, 72, 4, 4, C.red); P.outline(22, 52, 13, 24);
    // palm tree
    P.rect(44, 62, 2, 12, C.brown); for (const [dx, dy] of [[-5, 0], [-3, -1], [3, -1], [5, 0], [0, -2]]) P.line(45, 61, 45 + dx, 61 + dy + 2, C.grassD);
    // Thai flag
    const fx = 12, fy = 52, wave = (i) => Math.round(Math.sin(t * 6 + i * 0.6) * 0.8);
    P.rect(fx - 1, fy, 1, 20, C.brownD);
    for (let i = 0; i < 12; i++) { const s = ['r', 'w', 'b', 'b', 'w', 'r']; s.forEach((c, j) => P.px(fx + i, fy + j + wave(i), c === 'r' ? C.red : c === 'w' ? C.white : C.blue)); }
    // Canada (top right): coast, mountains with snow, pines, city, flag
    const ca = (x, y) => y < 30 + Math.sin(x * 0.13) * 4 + (x < 110 ? (110 - x) * 0.6 : 0);
    for (let y = 0; y < 60; y++) for (let x = 96; x < 168; x++) if (ca(x, y)) P.px(x, y, ca(x, y + 2) ? ((x * 3 + y) % 9 ? C.grass : C.grassD) : C.sand);
    for (const [mx, mh] of [[128, 18], [146, 22], [160, 15]]) for (let k = 0; k < mh; k++) { const w = Math.round(k * 0.9); P.rect(mx - w, 2 + k, w * 2 + 1, 1, k < 5 ? C.snow : k % 3 ? C.rock : C.rockL); }
    for (const px of [116, 122, 136, 152]) for (let k = 0; k < 7; k++) P.rect(px - (k >> 1), 18 + k, (k >> 1) * 2 + 1, 1, k % 2 ? C.pine : C.pineD);
    // little Vancouver skyline
    for (const [bx, bh] of [[132, 8], [136, 12], [140, 9], [144, 14], [148, 7]]) { P.rect(bx, 30 - bh, 3, bh, C.rockL); for (let k = 2; k < bh; k += 3) P.px(bx + 1, 30 - k, C.goldL); }
    // Canada flag
    const cx = 104, cy = 6;
    P.rect(cx - 1, cy, 1, 20, C.brownD);
    for (let i = 0; i < 14; i++) for (let j = 0; j < 7; j++) { const c = i < 3 || i > 10 ? C.red : C.white; P.px(cx + i, cy + j + wave(i), c); }
    P.rows(cx + 4, cy + 1 + wave(6), ['..r..', 'r.r.r', 'rrrrr', '.rrr.', '..r..'], { r: C.red });
    // the flight: dotted arc + plane
    const A = [40, 64], B = [134, 32], M = [80, 4];
    const at = (u) => [(1 - u) ** 2 * A[0] + 2 * (1 - u) * u * M[0] + u * u * B[0], (1 - u) ** 2 * A[1] + 2 * (1 - u) * u * M[1] + u * u * B[1]];
    const p = ease((t - 0.8) / 2.6);
    for (let u = 0; u < p; u += 0.035) { const [x, y] = at(u); P.px(x, y, C.white); P.px(x + 1, y, C.white); }
    if (t > 0.8) {
      const [x, y] = at(p), [x2, y2] = at(Math.min(1, p + 0.02));
      const up = y2 < y - 0.2, down = y2 > y + 0.2;
      P.rows(x - 5, y - 3, up ? ['.....kk', '....kwk', 'kkkkwwk.', 'kwwwwk..', '.kkwk...', '..kk....'] : down ? ['..kk....', '.kkwk...', 'kwwwwk..', 'kkkkwwk.', '....kwk', '.....kk'] : ['....k...', 'k...kk..', 'kwkkwwkk', 'kwwwwwwk', 'k..kwk..', '...kk...'], { k: INK, w: C.white });
    }
    // pins pop in
    if (t > 0.2) { const s = pop((t - 0.2) / 0.3); pin(P, 40, 64 - Math.round((1 - s) * 6)); }
    if (t > 3.3) { const s = pop((t - 3.3) / 0.3); pin(P, 134, 32 - Math.round((1 - s) * 6)); }
    if (t > 3.6) for (let k = 0; k < 3; k++) { const u = ((t - 3.6) * 0.6 + k / 3) % 1; heart(P, 140 + k * 6 - 3, 26 - u * 22, k === 1 ? C.pink : C.red); }
    // paper border
    P.rect(0, 0, 168, 1, INK); P.rect(0, 99, 168, 1, INK); P.rect(0, 0, 1, 100, INK); P.rect(167, 0, 1, 100, INK);
  },
};

// a kid's sketchbook: a little game doodled in crayon, then it comes alive
SCENES.kid = {
  w: 112, h: 76,
  draw(P, t) {
    P.rect(0, 0, 112, 76, C.cream);
    for (let y = 10; y < 76; y += 7) P.rect(4, y, 104, 1, C.line);
    P.rect(12, 0, 1, 76, '#f0a0a0');
    for (let y = 6; y < 76; y += 10) { P.ell(4, y, 2, 2, '#c8b898'); }
    // strokes revealed over time: sun, hills, ground, a cloud, a flag, a coin
    const strokes = [];
    const S = (pts, c) => strokes.push({ pts, c });
    S(Array.from({ length: 24 }, (_, i) => [92 + Math.cos(i / 23 * 6.28) * 7, 18 + Math.sin(i / 23 * 6.28) * 7]), C.orange);
    S(Array.from({ length: 40 }, (_, i) => [16 + i * 2.3, 54 - Math.abs(Math.sin(i / 39 * 3.14 * 2)) * 14]), C.green);
    S([[16, 62], [108, 62]], C.brown);
    S(Array.from({ length: 16 }, (_, i) => [30 + i * 1.5, 20 - Math.abs(Math.sin(i / 15 * 3.14 * 3)) * 4]), C.skyD);
    S([[96, 62], [96, 40], [104, 44], [96, 48]], C.red);
    const total = strokes.reduce((a, s) => a + s.pts.length, 0);
    let left = Math.floor(clamp(t / 2.4) * total), tip = null;
    for (const s of strokes) {
      for (let i = 1; i < s.pts.length && left > 0; i++, left--) { const [a, b] = [s.pts[i - 1], s.pts[i]]; P.line(a[0], a[1], b[0], b[1], s.c); P.line(a[0], a[1] + 1, b[0], b[1] + 1, s.c); tip = b; }
    }
    if (t > 1.0) for (let i = 0; i < 4; i++) { const ux = 40 + i * 14; if (t > 1.2 + i * 0.25) coin(P, ux, 38 - Math.abs(Math.sin(t * 4 + i)) * 2, Math.floor(t * 8 + i)); }
    // the crayon (draws while there are strokes left)
    if (t < 2.5 && tip) { P.rows(tip[0], tip[1] - 9, ['....kk', '...kok', '..kook.', '.kook..', 'kook...', 'kok....', 'kk.....', 'k......'], { k: INK, o: C.red }); }
    // then the hero hops across: the doodle is a game now
    if (t > 2.4) {
      const u = ((t - 2.4) * 0.35) % 1, x = 14 + u * 84, hop = Math.abs(Math.sin((t - 2.4) * 7)) * 8;
      foxSprite(P, x, 34 - hop, Math.floor(t * 8), true);
      P.outline(Math.max(1, x - 1), 30, 20, 34);
    }
  },
};

// every order helps: school books + a coin jar filling up
SCENES.study = {
  w: 112, h: 76,
  draw(P, t) {
    P.rect(0, 0, 112, 76, '#fbe8c2'); P.dith(0, 60, 112, 16, '#e8c896', '#f0d6a8');
    // books + grad cap
    const bk = [[C.red, 18], [C.blue, 16], [C.green, 19]];
    bk.forEach(([c, w], i) => { P.rect(14 + (i % 2) * 2, 56 - i * 6, w, 6, c); P.rect(14 + (i % 2) * 2, 57 - i * 6, w, 1, 'rgba(255,255,255,.35)'); P.rect(14 + (i % 2) * 2 + w - 3, 56 - i * 6, 2, 6, C.cream); });
    const cy = 34 + Math.round(Math.sin(t * 3) * 1);
    P.rect(12, cy, 26, 3, INK); P.rect(18, cy + 3, 14, 4, INK); P.px(37, cy + 1, C.gold); P.line(37, cy + 2, 39, cy + 9, C.gold); P.px(39, cy + 10, C.goldL);
    P.outline(12, 32, 30, 30);
    // jar
    P.rect(62, 22, 30, 3, C.brownL); P.rect(60, 25, 34, 38, 'rgba(200,236,255,.55)');
    const n = Math.min(14, Math.floor(t * 4));
    for (let k = 0; k < n; k++) coin(P, 66 + (k % 4) * 7 + (Math.floor(k / 4) % 2) * 3, 59 - Math.floor(k / 4) * 6, k);
    P.rect(60, 25, 1, 38, INK); P.rect(93, 25, 1, 38, INK); P.rect(60, 62, 34, 1, INK); P.rect(61, 27, 2, 30, 'rgba(255,255,255,.6)');
    // falling coin + hearts
    const u = (t * 4) % 1; coin(P, 77, 4 + u * 30, Math.floor(t * 12));
    for (let k = 0; k < 3; k++) { const v = (t * 0.5 + k / 3) % 1; heart(P, 40 + k * 18, 70 - v * 60, k % 2 ? C.pink : C.red); }
  },
};

// ---------------------------------------------------------------- what you get
// 3D models: voxel cubes dropping into an isometric little house + tree
function cube(P, x, y, c, cL, cD, a = 8) {
  // iso cube, (x, y) = top corner, half-width a
  const h = a, k = a / 2;
  P.poly([[x - a, y + k + 0.5], [x, y + a + 0.5], [x, y + a + h + 0.5], [x - a, y + k + h + 0.5]], c);
  P.poly([[x, y + a + 0.5], [x + a, y + k + 0.5], [x + a, y + k + h + 0.5], [x, y + a + h + 0.5]], cD);
  P.poly([[x, y], [x + a, y + k], [x, y + a], [x - a, y + k]], cL);
  P.line(x - a, y + k, x, y + a, INK); P.line(x, y + a, x + a, y + k, INK); P.line(x, y + a, x, y + a + h, INK);
  P.line(x - a, y + k, x, y, INK); P.line(x, y, x + a, y + k, INK); P.line(x - a, y + k, x - a, y + k + h, INK); P.line(x + a, y + k, x + a, y + k + h, INK);
  P.line(x - a, y + k + h, x, y + a + h, INK); P.line(x, y + a + h, x + a, y + k + h, INK);
  P.px(x - 1, y + 2, 'rgba(255,255,255,.6)');
}
SCENES.models = {
  w: 96, h: 72,
  draw(P, t) {
    P.rect(0, 0, 96, 72, '#2a2448'); for (let k = 0; k < 30; k++) P.px(hash(k) * 96, hash(k + 9) * 40, hash(k + 3) > 0.5 ? '#ffffff' : '#8a80c8');
    // iso grid floor
    for (let i = -6; i <= 6; i++) { P.line(48 + i * 6 - 30, 50 + i * 3 + 15, 48 + i * 6 + 30, 50 + i * 3 - 15, '#3c3664'); P.line(48 + i * 6 - 30, 50 - i * 3 - 15, 48 + i * 6 + 30, 50 - i * 3 + 15, '#3c3664'); }
    const iso = (gx, gy, gz) => [44 + (gx - gy) * 8, 30 + (gx + gy) * 4 - gz * 8];
    const blocks = [];
    for (let gx = 0; gx < 3; gx++) for (let gy = 0; gy < 2; gy++) blocks.push([gx - 1, gy - 1, 0, 'brick']);
    for (let gx = 0; gx < 3; gx++) for (let gy = 0; gy < 2; gy++) blocks.push([gx - 1, gy - 1, 1, gx === 1 && gy === 1 ? 'door' : 'brick']);
    for (let gx = 0; gx < 3; gx++) blocks.push([gx - 1, -0.5, 2, 'roof']);
    blocks.push([2.2, 1.6, 0, 'wood'], [2.2, 1.6, 1, 'wood'], [2.2, 1.6, 2, 'leaf'], [1.2, 1.6, 2, 'leaf'], [2.2, 0.6, 2, 'leaf'], [2.2, 1.6, 3, 'leaf']);
    const col = { brick: [C.red, '#ff7a6a', C.redD], door: [C.brown, C.brownL, C.brownD], roof: [C.blue, '#6a8ae8', '#1f2c78'], wood: [C.brown, C.brownL, C.brownD], leaf: [C.grass, C.grassL, C.grassD] };
    const per = 0.22, cyc = blocks.length * per + 1.6, tt = t % cyc;
    blocks.forEach((b, i) => {
      const t0 = i * per;
      if (tt < t0) return;
      const fall = Math.max(0, 1 - (tt - t0) / 0.18) * 30;
      const [x, y] = iso(b[0], b[1], b[2]);
      cube(P, x, y - fall, ...col[b[3]]);
    });
    if (tt > blocks.length * per) for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28 + t; P.px(48 + Math.cos(a) * 30, 30 + Math.sin(a) * 12, C.goldL); }
  },
};

// animated characters: Reynard walking past, a bear waving, scrolling scenery
SCENES.chars = {
  w: 96, h: 72,
  draw(P, t) {
    P.rect(0, 0, 96, 72, C.sky); P.rect(0, 30, 96, 10, C.skyD);
    for (let k = 0; k < 3; k++) { const x = ((k * 40 - t * 6) % 120 + 120) % 120 - 20; P.ell(x, 12 + k * 5, 8, 3, C.white); P.ell(x + 5, 10 + k * 5, 5, 3, C.white); }
    for (let i = 0; i < 96; i++) { const h = 6 + Math.round(Math.sin((i + t * 10) * 0.12) * 3); P.rect(i, 44 - h, 1, h, C.grassD); }
    P.rect(0, 44, 96, 28, C.grass); for (let i = 0; i < 96; i += 4) P.px((i + Math.floor(t * 20)) % 96, 46 + (i % 3), C.grassL);
    P.rect(0, 58, 96, 14, C.sand); for (let i = 0; i < 96; i += 6) P.rect((i - Math.floor(t * 20) % 6 + 96) % 96, 64, 3, 1, C.sandD);
    // the fox walks on the spot (the world scrolls), a bear waves on the right
    const f = Math.floor(t * 8) % 4;
    foxSprite(P, 22, 40 + (f % 2), f, true);
    P.outline(20, 38, 22, 34);
    const bx = 64, by = 36, wv = Math.round(Math.sin(t * 8) * 2);
    P.rows(bx, by, [
      '..kk......kk..', '.kbbk....kbbk.', '.kbbbkkkkbbbk.', '..kbbbbbbbbk..', '.kbbwkbbkwbbk.', '.kbbkkbbkkbbk.', '.kbbbbllbbbbk.', '..kbbbkkbbbk..', '...kbbllbbk...',
      '..kssswwsssk..', '.ksssswrsssk..', '.kssssrrsssk..', '.ksssssssssk..', '..kkkkkkkkkk..', '..kbbk..kbbk..', '..kkk....kkk..',
    ], { k: INK, b: C.brown, l: C.brownL, w: C.white, s: '#2a2a3a', r: C.red });
    P.rows(bx + 12, by + 6 + wv, ['.kk', 'kbk', 'kbk', 'kk.'], { k: INK, b: C.brown });
    if (Math.floor(t * 2) % 3 === 0) P.rows(bx + 2, by - 9, ['kkkkkkkk', 'kwwwwwwk', 'kw.ww.wk', 'kwwwwwwk', 'kkkk.kkk', '...kk...'], { k: INK, w: C.white });
  },
};

// 2D pixel art: a sprite painted pixel by pixel next to a palette
SCENES.pixels = {
  w: 96, h: 72,
  draw(P, t) {
    P.rect(0, 0, 96, 72, '#ece0ff'); P.dith(0, 0, 96, 72, '#ece0ff', '#e2d4fa');
    const art = [
      '....kkkkkk....', '..kkrrrrrrkk..', '.krrwwrrrrrrk.', '.krwwrrrrwwrk.', 'krrrrrrrrwwrrk', 'krrwwrrrrrrrrk', 'kkkkkkkkkkkkkk',
      '...kccccccck..', '...kcckcckck..', '...kccccccck..', '...kcccccccck.', '....kkkkkkkk..',
    ];
    const pal = { k: INK, r: C.red, w: C.white, c: '#f4e0c8' };
    const S = 3, ox = 8, oy = 10;
    P.rect(ox - 2, oy - 2, 14 * S + 4, 12 * S + 4, C.white);
    for (let j = 0; j < 12; j++) for (let i = 0; i < 14; i++) P.rect(ox + i * S, oy + j * S, S, S, (i + j) % 2 ? '#f4f0fa' : '#e8e2f2');
    const cells = []; art.forEach((r, j) => [...r].forEach((ch, i) => { if (pal[ch]) cells.push([i, j, pal[ch]]); }));
    const n = Math.floor(((t * 26) % (cells.length + 30)));
    let last = null;
    cells.slice(0, n).forEach(([i, j, c]) => { P.rect(ox + i * S, oy + j * S, S, S, c); last = [i, j]; });
    P.rect(ox - 2, oy - 2, 14 * S + 4, 1, INK); P.rect(ox - 2, oy + 12 * S + 1, 14 * S + 4, 1, INK); P.rect(ox - 2, oy - 2, 1, 12 * S + 4, INK); P.rect(ox + 14 * S + 1, oy - 2, 1, 12 * S + 4, INK);
    // the pencil
    if (last && n < cells.length) { const x = ox + last[0] * S + 2, y = oy + last[1] * S + 2; P.rows(x, y - 8, ['.....kk', '....kyk', '...kyyk', '..kyyk.', '.kppk..', 'kwwk...', 'kk.....'], { k: INK, y: C.gold, p: C.pink, w: C.cream }); }
    if (n >= cells.length) for (let k = 0; k < 5; k++) { const a = t * 3 + k * 1.3; P.px(ox + 21 + Math.cos(a) * 26, oy + 18 + Math.sin(a) * 20, C.gold); }
    // palette
    [C.red, C.orange, C.gold, C.green, C.blue, C.purple, C.pink, C.white].forEach((c, k) => { const x = 62 + (k % 2) * 14, y = 10 + Math.floor(k / 2) * 13; P.rect(x, y, 11, 10, INK); P.rect(x + 1, y + 1, 9, 8, c); });
  },
};

// sound + music: a speaker thumping, waves, an equaliser and notes floating up
SCENES.sound = {
  w: 96, h: 72,
  draw(P, t) {
    P.rect(0, 0, 96, 72, C.dark2);
    const beat = Math.max(0, Math.sin(t * Math.PI * 4)) ** 4;
    P.rect(10, 18, 30, 38, INK); P.rect(12, 20, 26, 34, '#4a4060');
    P.ell(25, 44, 9 + beat * 1.5, 9 + beat * 1.5, INK); P.ell(25, 44, 7 + beat, 7 + beat, '#7a6aa0'); P.ell(25, 44, 3, 3, INK);
    P.ell(25, 28, 4, 4, INK); P.ell(25, 28, 2, 2, '#7a6aa0');
    for (let k = 0; k < 3; k++) { const r = 12 + k * 7 + ((t * 18) % 7); for (let a = -0.9; a <= 0.9; a += 0.05) P.px(40 + Math.cos(a) * r - 10, 37 + Math.sin(a) * r, k === 0 ? C.gold : k === 1 ? C.orange : C.pink); }
    for (let b = 0; b < 8; b++) { const h = 3 + Math.round((Math.sin(t * 7 + b * 1.7) * 0.5 + 0.5) * 16 * (0.6 + beat * 0.4)); for (let k = 0; k < h; k += 2) P.rect(58 + b * 4, 62 - k, 3, 1, k > 12 ? C.red : k > 7 ? C.gold : C.green); }
    for (let k = 0; k < 3; k++) { const u = (t * 0.6 + k / 3) % 1; note(P, 50 + k * 14 + Math.sin(u * 8) * 2, 34 - u * 30, [C.gold, C.pink, '#8ad8ff'][k]); }
  },
};

// source code: a monitor typing code, then a tiny game window running it
SCENES.code = {
  w: 96, h: 72,
  draw(P, t) {
    P.rect(0, 0, 96, 72, '#d8c8b0');
    P.rect(6, 4, 84, 54, INK); P.rect(9, 7, 78, 46, C.dark);
    P.rect(40, 58, 16, 5, '#6a6a7a'); P.rect(30, 63, 36, 4, '#8a8a9a'); P.rect(30, 63, 36, 1, INK);
    const lines = [[[C.code1, 6], [C.white, 8], [C.code3, 7]], [[C.code1, 5], [C.white, 5], [C.code2, 4], [C.code4, 5]], [[C.white, 3], [C.code2, 6], [C.code3, 8]], [[C.code1, 3], [C.white, 9], [C.code5, 3]], [[C.white, 4], [C.code2, 7], [C.white, 4]], [[C.code1, 6], [C.code4, 9]]];
    const cyc = 4.2, tt = t % cyc;
    let chars = Math.floor(tt * 30), cur = null;
    lines.forEach((ln, j) => {
      let x = 12 + (j % 3 === 2 ? 4 : 0);
      for (const [c, n] of ln) for (let k = 0; k < n; k++) { if (chars-- <= 0) return; if (k % 6 !== 5) P.rect(x, 10 + j * 6, 1, 3, c); P.rect(x, 10 + j * 6, 1, 3, c); x += 1; cur = [x, 10 + j * 6]; }
    });
    if (cur && Math.floor(t * 3) % 2) P.rect(cur[0] + 1, cur[1], 2, 4, C.white);
    // the game window pops when the code is done
    if (tt > 2.6) {
      const s = pop((tt - 2.6) / 0.3), w = Math.round(40 * s), h = Math.round(26 * s), x = 44, y = 24;
      P.rect(x - 1, y - 1, w + 2, h + 2, INK); P.rect(x, y, w, h, C.sky); P.rect(x, y + h - 6, w, 6, C.grass);
      if (s > 0.9) { const hx = x + 6 + ((tt - 2.9) * 20) % 26, hy = y + h - 12 - Math.abs(Math.sin((tt - 2.9) * 8)) * 6; P.rect(hx, hy, 5, 6, C.orange); P.rect(hx + 3, hy + 1, 1, 1, INK); coin(P, x + 30, y + 8, Math.floor(t * 10)); }
      P.rect(x, y, w, 3, '#5a5a7a'); P.px(x + 1, y + 1, C.red); P.px(x + 3, y + 1, C.gold);
    }
  },
};

// ---------------------------------------------------------------- tier portraits (48x48)
function portraitBg(P, c1, c2, t) {
  P.rect(0, 0, 48, 48, c1);
  for (let k = 0; k < 12; k++) { const a = k / 12 * 6.28 + t * 0.5; P.line(24, 26, 24 + Math.cos(a) * 40, 26 + Math.sin(a) * 40, c2); }
}
SCENES.duck = {
  w: 48, h: 48,
  draw(P, t) {
    portraitBg(P, '#3aa8e0', '#5ac0f0', t);
    const b = Math.round(Math.sin(t * 4) * 1), blink = (t % 3) > 2.85;
    P.ell(24, 46, 16, 10, '#8a6a4a'); P.ell(24, 44, 14, 8, '#a8845a'); P.rect(12, 34, 24, 2, C.white);
    P.ell(24, 22 + b, 13, 13, '#2f8a4a'); P.ell(21, 18 + b, 6, 5, '#4cb064');
    P.rows(28, 22 + b, ['kkkkkkkkk.', 'kyyyyyyyyk', 'kyyyyyyyyk', '.kkkkkkkk.'], { k: INK, y: C.gold });
    if (!blink) { P.rect(25, 16 + b, 3, 3, INK); P.px(25, 16 + b, C.white); } else P.rect(25, 17 + b, 3, 1, INK);
    P.outline(9, 8, 32, 40);
  },
};
SCENES.fox = {
  w: 48, h: 48,
  draw(P, t) {
    portraitBg(P, '#ff8a2a', '#ffa850', t);
    const b = Math.round(Math.sin(t * 4 + 1) * 1), blink = (t % 3.4) > 3.25;
    P.ell(24, 47, 16, 9, '#4a2a6a'); P.rect(20, 38, 8, 6, C.white); P.rows(22, 40, ['krrk', '.kk.'], { k: INK, r: C.red });
    P.rows(9, 11 + b, ['k...', 'kok.', 'kook'], { k: INK, o: C.orangeD }); P.rows(35, 11 + b, ['...k', '.kok', 'kook'], { k: INK, o: C.orangeD });
    P.rect(12, 14 + b, 24, 20, C.orange); P.rect(12, 26 + b, 24, 8, C.white); P.rect(21, 24 + b, 6, 4, C.white); P.rect(22, 28 + b, 4, 2, INK);
    P.rect(10, 4 + b, 28, 3, INK); P.rect(15, -6 + b, 18, 11, '#1e1a2e'); P.rect(15, 1 + b, 18, 2, C.red);
    if (!blink) { P.rect(16, 20 + b, 3, 3, INK); P.rect(29, 20 + b, 3, 3, INK); P.px(16, 20 + b, C.white); P.px(29, 20 + b, C.white); } else { P.rect(16, 21 + b, 3, 1, INK); P.rect(29, 21 + b, 3, 1, INK); }
    P.ell(30, 21 + b, 4, 4, C.gold); P.ell(30, 21 + b, 3, 3, 'rgba(255,255,255,.35)'); P.line(33, 24 + b, 35, 34 + b, C.gold);
    P.outline(9, 0, 30, 48);
  },
};
SCENES.bear = {
  w: 48, h: 48,
  draw(P, t) {
    portraitBg(P, '#b04ad8', '#c46ae8', t);
    const b = Math.round(Math.sin(t * 4 + 2) * 1), blink = (t % 2.8) > 2.66;
    P.ell(24, 48, 18, 10, '#2a2a3a'); P.rect(21, 38, 6, 10, C.white); P.rows(22, 39, ['.rr.', 'rrrr', '.rr.', '.rr.', '.rr.'], { r: C.red });
    P.ell(12, 12 + b, 5, 5, C.brownD); P.ell(36, 12 + b, 5, 5, C.brownD); P.ell(12, 12 + b, 2, 2, C.brownL); P.ell(36, 12 + b, 2, 2, C.brownL);
    P.ell(24, 24 + b, 15, 14, C.brown); P.ell(24, 30 + b, 7, 5, C.brownL); P.rect(22, 27 + b, 4, 3, INK);
    if (!blink) { P.rect(16, 20 + b, 3, 3, INK); P.rect(29, 20 + b, 3, 3, INK); P.px(16, 20 + b, C.white); P.px(29, 20 + b, C.white); } else { P.rect(16, 21 + b, 3, 1, INK); P.rect(29, 21 + b, 3, 1, INK); }
    P.rect(21, 33 + b, 6, 1, INK);
    P.outline(6, 6, 36, 42);
  },
};
// a voxel block icon for the extra level
SCENES.level = {
  w: 48, h: 48,
  draw(P, t) {
    portraitBg(P, '#4cc05a', '#6ad878', t);
    const y = 8 + Math.round(Math.sin(t * 3) * 2);
    cube(P, 24, y, C.brown, C.grass, C.brownD, 14);
    for (let k = 0; k < 5; k++) P.px(16 + k * 4, y + 18 + (k % 2) * 3, C.brownL);
    P.rows(30, 6, ['..k..', '.kyk.', 'kyyyk', '.kyk.', '..k..'], { k: INK, y: C.gold });
  },
};
// a little clock with spinning hands (extra-fast delivery)
SCENES.fast = {
  w: 48, h: 48,
  draw(P, t) {
    portraitBg(P, '#ff4d6d', '#ff7088', t);
    P.ell(24, 26, 15, 15, INK); P.ell(24, 26, 13, 13, C.white);
    for (let k = 0; k < 12; k++) { const a = k / 12 * 6.28; P.px(24 + Math.cos(a) * 11, 26 + Math.sin(a) * 11, INK); }
    const a1 = t * 9, a2 = t * 0.8;
    P.line(24, 26, 24 + Math.cos(a1) * 10, 26 + Math.sin(a1) * 10, C.red); P.line(24, 26, 24 + Math.cos(a2) * 6, 26 + Math.sin(a2) * 6, INK);
    P.rect(21, 8, 6, 3, INK);
    for (let k = 0; k < 3; k++) P.rect(2 + ((t * 40 + k * 7) % 10), 18 + k * 7, 6, 1, C.white);
  },
};
