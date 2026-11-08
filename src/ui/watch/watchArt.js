// [v33 watch] Reynard's pocket watch: the pixel art. Everything is drawn at art resolution into
// little Uint32 buffers (1 buffer px = 1 art px) and shown at 2 CSS px per art px (BigClock.js).
// The static pieces (the case ring, the enamel dial, the lid's two faces) are painted once per
// size / schedule and cached; the moving pieces (hands, crown, chain, fob, tag, weather window,
// countdown plaque, glints) are drawn every frame by BigClock.js from the helpers here.
//
// Style: the game's cute HUD look (bold dark outline, bright gold, cream enamel, candy-coloured
// schedule inlays), chunky but detailed. No anti-aliasing: every pixel is a palette colour, glass
// glints lighten the pixel under them by a fixed step.

// ---------------------------------------------------------------- colours (packed little-endian RGBA)
export const hex = (h, a = 255) => {
  const n = parseInt(h.slice(1), 16);
  return (((a & 255) << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
};
const unpack = (c) => [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, c >>> 24];
const pack = (r, g, b, a = 255) => (((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
/** lighten a pixel toward white by t (glass glints) */
export const lighten = (c, t) => { const [r, g, b, a] = unpack(c); return pack(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t, a); };
/** darken a pixel by t (hand shadows on the dial) */
export const darken = (c, t) => { const [r, g, b, a] = unpack(c); return pack(r * (1 - t), g * (1 - t), b * (1 - t), a); };
/** tint toward a colour (night glass, blood moon) */
export const tint = (c, to, t) => { const [r, g, b, a] = unpack(c); const [R, G, B] = unpack(to); return pack(r + (R - r) * t, g + (G - g) * t, b + (B - b) * t, a); };

export const P = {
  ink: hex('#2a1a14'), inkSoft: hex('#5a3a26'),
  // bright cartoon gold, darkest -> brightest
  g0: hex('#6b3a10'), g1: hex('#a8621a'), g2: hex('#d8922a'), g3: hex('#f4bd40'), g4: hex('#ffdb6c'), g5: hex('#fff3b4'), w: hex('#ffffff'),
  // cream enamel
  e0: hex('#fffdf4'), e1: hex('#fff2d2'), e2: hex('#f4deaa'), e3: hex('#e0c48c'),
  k: hex('#3a2418'), kl: hex('#b8946a'), hair: hex('#7a5232'),
  // blued steel
  b0: hex('#141c5e'), b1: hex('#2c4ad0'), b2: hex('#7ea2ff'),
  // red enamel
  r0: hex('#8a1820'), r1: hex('#ec3b3a'), r2: hex('#ff9070'),
  // bear
  fur: hex('#9a5a34'), furD: hex('#5e3018'), snout: hex('#f0c08e'),
  // paper
  paper: hex('#fffaea'), paperSh: hex('#eadcb6'),
  shadow: hex('#2a1a14', 72),
  sky: hex('#8edaff'), skyL: hex('#c8f0ff'),
};
// the schedule inlays: [main, inner shade]
export const KIND = {
  work: [hex('#7ad460'), hex('#4ea840')], lunch: [hex('#ffb33c'), hex('#e0861c')], rush: [hex('#ff5a4e'), hex('#cc2e2e')],
  night: [hex('#5262c8'), hex('#36469e')], off: [hex('#8ad6ff'), hex('#52b0ea')],
};
// the sky in the weather window: [top, horizon]
const SKY = {
  day: [hex('#7cd2ff'), hex('#c4eeff')], dawn: [hex('#ffa4a0'), hex('#ffe0a8')], dusk: [hex('#ff8f78'), hex('#ffcf80')], night: [hex('#262c6e'), hex('#3a4294')],
};
const HILLS = {
  spring: [hex('#7ed866'), hex('#56b44a'), hex('#ff9ad2')], summer: [hex('#4cc44a'), hex('#329a38'), hex('#ffe14a')],
  autumn: [hex('#ee9a3e'), hex('#c06a28'), hex('#d6402a')], winter: [hex('#f4f9ff'), hex('#b8d2f0'), hex('#ffffff')],
};

// ---------------------------------------------------------------- a tiny pixel buffer
export class Buf {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint32Array(w * h); }
  clear() { this.d.fill(0); }
  set(x, y, c) {
    x = Math.floor(x); y = Math.floor(y);
    if (c && x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c;
  }
  get(x, y) { x = Math.floor(x); y = Math.floor(y); return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : 0; }
  // draw every opaque pixel of src at (ox, oy)
  blit(src, ox = 0, oy = 0) {
    ox = Math.round(ox); oy = Math.round(oy);
    const sw = src.w, sd = src.d, dw = this.w, dd = this.d;
    const y0 = Math.max(0, -oy), y1 = Math.min(src.h, this.h - oy), x0 = Math.max(0, -ox), x1 = Math.min(sw, dw - ox);
    for (let y = y0; y < y1; y++) {
      const so = y * sw, doff = (y + oy) * dw + ox;
      for (let x = x0; x < x1; x++) { const c = sd[so + x]; if (c) dd[doff + x] = c; }
    }
  }
  fill(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  // a sprite given as rows of chars + a palette { char: colour }
  rows(rows, ox, oy, pal, flipX = false) {
    for (let y = 0; y < rows.length; y++) {
      const r = rows[y], n = r.length;
      for (let x = 0; x < n; x++) { const c = pal[r[flipX ? n - 1 - x : x]]; if (c) this.set(ox + x, oy + y, c); }
    }
  }
}

// a cheap stable hash for hand-placed-looking speckle
export const hsh = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const BAYER = [0, 0.5, 0.75, 0.25];
const bay = (x, y) => BAYER[(x & 1) + ((y & 1) << 1)];
const TAU = Math.PI * 2;
const mod24 = (h) => ((h % 24) + 24) % 24;
/** dial angle of an hour on the 24-hour day dial: noon at the top, midnight at the bottom */
export const hourAngle = (h) => ((h - 12) / 24) * TAU;

// ---------------------------------------------------------------- glyphs
// 3x5 engraved caps + digits (proportional)
const TF = {
  0: ['kkk', 'k.k', 'k.k', 'k.k', 'kkk'], 1: ['.k', 'kk', '.k', '.k', '.k'], 2: ['kkk', '..k', 'kkk', 'k..', 'kkk'], 3: ['kkk', '..k', '.kk', '..k', 'kkk'],
  4: ['k.k', 'k.k', 'kkk', '..k', '..k'], 5: ['kkk', 'k..', 'kkk', '..k', 'kkk'], 6: ['kkk', 'k..', 'kkk', 'k.k', 'kkk'], 7: ['kkk', '..k', '.k.', '.k.', '.k.'],
  8: ['kkk', 'k.k', 'kkk', 'k.k', 'kkk'], 9: ['kkk', 'k.k', 'kkk', '..k', 'kkk'],
  A: ['.k.', 'k.k', 'kkk', 'k.k', 'k.k'], D: ['kk.', 'k.k', 'k.k', 'k.k', 'kk.'], E: ['kkk', 'k..', 'kk.', 'k..', 'kkk'], F: ['kkk', 'k..', 'kk.', 'k..', 'k..'],
  G: ['kkk', 'k..', 'k.k', 'k.k', 'kkk'], H: ['k.k', 'k.k', 'kkk', 'k.k', 'k.k'], I: ['kkk', '.k.', '.k.', '.k.', 'kkk'], M: ['k...k', 'kk.kk', 'k.k.k', 'k...k', 'k...k'],
  N: ['k..k', 'kk.k', 'k.kk', 'k..k', 'k..k'], O: ['kkk', 'k.k', 'k.k', 'k.k', 'kkk'], R: ['kk.', 'k.k', 'kk.', 'k.k', 'k.k'], S: ['kkk', 'k..', 'kkk', '..k', 'kkk'],
  T: ['kkk', '.k.', '.k.', '.k.', '.k.'], U: ['k.k', 'k.k', 'k.k', 'k.k', 'kkk'], W: ['k...k', 'k...k', 'k.k.k', 'kk.kk', 'k...k'], '!': ['k', 'k', 'k', '.', 'k'],
  ':': ['.', 'k', '.', 'k', '.'], Z: ['kkk', '..k', '.k.', 'k..', 'kkk'],
  // lowercase units for the countdown ("1h30", "45m")
  h: ['k..', 'k..', 'kkk', 'k.k', 'k.k'], m: ['.....', 'kkkk.', 'k.k.k', 'k.k.k', 'k.k.k'],
};
// 5x7 chunky date digits (the calendar card)
const BIG = {
  0: ['.kkk.', 'kk.kk', 'kk.kk', 'kk.kk', 'kk.kk', 'kk.kk', '.kkk.'], 1: ['.kk', 'kkk', '.kk', '.kk', '.kk', '.kk', '.kk'],
  2: ['.kkk.', 'kk.kk', '...kk', '..kk.', '.kk..', 'kk...', 'kkkkk'], 3: ['kkkk.', '...kk', '...kk', '.kkk.', '...kk', '...kk', 'kkkk.'],
  4: ['...kk', '..kkk', '.k.kk', 'k..kk', 'kkkkk', '...kk', '...kk'], 5: ['kkkkk', 'kk...', 'kkkk.', '...kk', '...kk', 'kk.kk', '.kkk.'],
  6: ['.kkk.', 'kk...', 'kk...', 'kkkk.', 'kk.kk', 'kk.kk', '.kkk.'], 7: ['kkkkk', '...kk', '...kk', '..kk.', '..kk.', '.kk..', '.kk..'],
  8: ['.kkk.', 'kk.kk', 'kk.kk', '.kkk.', 'kk.kk', 'kk.kk', '.kkk.'], 9: ['.kkk.', 'kk.kk', 'kk.kk', '.kkkk', '...kk', '...kk', '.kkk.'],
};
const glyphW = (font, ch) => (font[ch] ? font[ch][0].length : 2);
export function textW(s, font = TF) { let w = 0; for (const ch of String(s)) w += (ch === ' ' ? 2 : glyphW(font, ch)) + 1; return Math.max(0, w - 1); }
export function drawText(b, s, x, y, col, font = TF) {
  let ox = Math.round(x);
  for (const ch of String(s)) {
    if (ch === ' ') { ox += 3; continue; }
    const g = font[ch];
    if (!g) { ox += 3; continue; }
    for (let r = 0; r < g.length; r++) for (let i = 0; i < g[r].length; i++) if (g[r][i] === 'k') b.set(ox + i, y + r, col);
    ox += g[0].length + 1;
  }
}
export { TF, BIG };

// ---------------------------------------------------------------- little sprites
export const SPR = {
  // a tiny bear head (the feast pip, the countdown plaque)
  bear: ['oo.oo', 'ofFfo', 'fkfkf', 'ffsff', '.fff.'],
  bearPip: ['.oo.oo.', 'oFfofFo', 'offfffo', 'ofkfkfo', 'offsffo', '.ofsfo.', '..ooo..'],
  bearL: ['.oo..oo.', 'oFfoofFo', 'offffffo', 'ofkffkfo', 'offssffo', '.ofsSfo.', '..oooo..'],
  bearChomp: ['.oo..oo.', 'oFfoofFo', 'offffffo', 'ofkffkfo', 'ofsoosfo', '.ofooffo.', '..oooo..'],
  bearS: ['f.f', 'fff', '.f.'],
  moon: ['.mm', 'mm.', 'm..', 'mm.', '.mm'],
  moonS: ['.m', 'm.', '.m'],
  sun: ['.y.', 'yYy', '.y.'],
  // speed chevron
  chev: ['k..', 'kk.', 'kkk', 'kk.', 'k..'],
  pause: ['kk.kk', 'kk.kk', 'kk.kk', 'kk.kk', 'kk.kk'],
  // chain links (vertical): face-on and edge-on
  linkF: ['.ooo.', 'ohllo', 'ol.lo', 'ol.mo', 'om.mo', 'ommdo', '.ooo.'],
  linkE: ['.o.', 'oho', 'olo', 'olo', 'omo', 'odo', '.o.'],
  linkFS: ['.oo.', 'ohlo', 'o..o', 'omdo', '.oo.'],
  linkES: ['o', 'h', 'l', 'm', 'o'],
  // the bell charm on the fob chain
  bell: ['..ooo..', '..o.o..', '.ooooo.', '.ohllo.', '.ohlmo.', 'ohllmdo', 'ohlmmdo', 'ooooooo', '...oo..'],
  bellS: ['.ooo.', '.o.o.', 'ooooo', 'ohlmo', 'ohlmo', 'ooooo', '..o..'],
  // sparkle (4-point star)
  spark: ['..w..', '..w..', 'ww.ww', '..w..', '..w..'],
  sparkS: ['.w.', 'w.w', '.w.'],
  zS: ['kk', '.k', 'kk'], zM: ['kkk', '..k', '.k.', 'kkk'], zL: ['kkkk', '...k', '..k.', '.k..', 'kkkk'],
};
const GOLD_PAL = () => ({ o: P.ink, h: P.g5, l: P.g4, m: P.g3, d: P.g2, D: P.g1, w: P.w });

// weather icons, 7x5: y sun, Y sun core, o ray, w cloud, g cloud shade, b rain, l bolt, s snow, f fog, m moon, r heat
export const WX = {
  clear: ['..yyy..', '.yYYYy.', 'oyYYYyo', '.yYYYy.', '..yyy..'],
  heat: ['o.o.o.o', '.rrrrr.', 'orYYYro', '.rrrrr.', 'o.o.o.o'],
  rain: ['..www..', '.wwwww.', 'wwgggww', '.b..b..', 'b..b..b'],
  storm: ['..ggg..', '.ggwgg.', 'ggggggg', '...ll..', '..ll...'],
  snow: ['..www..', '.wwwww.', 'wwgggww', '.s.s.s.', 's.s.s.s'],
  fog: ['fffff..', '.......', '..fffff', '.......', 'fffff..'],
  wind: ['wwww.w.', '....w..', 'wwwwww.', '.......', 'www..w.'],
  moon: ['..mm...', '.mm....', '.mm....', '.mm....', '..mm...'],
  cloud: ['..www..', '.wwwww.', 'wwgggww', '.......', '.......'],
};
const WXPAL = { y: hex('#ffd23f'), Y: hex('#fff3a0'), o: hex('#ff9f1a'), w: hex('#ffffff'), g: hex('#c8d4e8'), b: hex('#3a7ae8'), l: hex('#ffd21a'), s: hex('#ffffff'), f: hex('#eef4ff'), m: hex('#fff2a0'), r: hex('#ff5a2a') };

// ---------------------------------------------------------------- sizes
// L: desktop (208 css px square at 2x), S: phones (150 x 148 css px)
export function geometry(size) {
  if (size === 'S') {
    return {
      size: 'S', W: 75, H: 74, cx: 45, cy: 41, R: 21, band: 3, knurl: 1, rd: 15.5,
      trk: 2, tickR: 11.5, lidA: 10, rw: 7,
      ap: { w: 11, h: 7, y: -9 }, pl: { y: 2, h: 7 },
      hands: { hour: 8, min: 12, sec: 12 },
      chainTop: 0, bowY: 14, bowRx: 6, bowRy: 5, legY: 18, crown: { w: 9, y0: 13, y1: 17 }, pend: { w: 5, y0: 18, y1: 19 },
      tag: { w: 13, h: 7 }, card: { w: 16, h: 19 }, bell: SPR.bellS, link: [SPR.linkFS, SPR.linkES], swivelY: 7,
    };
  }
  return {
    size: 'L', W: 104, H: 104, cx: 62, cy: 60, R: 32, band: 4, knurl: 2, rd: 24.5,
    trk: 3, tickR: 20, lidA: 13, rw: 11,
    ap: { w: 15, h: 9, y: -13 }, pl: { y: 5, h: 7 },
    hands: { hour: 13, min: 19, sec: 20 },
    chainTop: 0, bowY: 20, bowRx: 8, bowRy: 7, legY: 25, crown: { w: 11, y0: 18, y1: 24 }, pend: { w: 7, y0: 25, y1: 27 },
    tag: { w: 15, h: 8 }, card: { w: 17, h: 25 }, bell: SPR.bell, link: [SPR.linkF, SPR.linkE], swivelY: 10,
  };
}

// light from the top left
const LX = -0.55, LY = -0.83;
// quantise a brightness (-1..1) to the five golds, dithered on the band edges
function goldOf(b, x, y) {
  b += (bay(x, y) - 0.375) * 0.14;
  return b > 0.66 ? P.g5 : b > 0.3 ? P.g4 : b > -0.06 ? P.g3 : b > -0.42 ? P.g2 : P.g1;
}

// ---------------------------------------------------------------- the case: rim, coin-edge bezel, inner lip, hinge
export function buildCase(G) {
  const b = new Buf(G.W, G.H);
  const { cx, cy, R, band, knurl, rd } = G;
  const rBand = R - 0.5 - band, rKn = rBand - knurl;
  const nKn = G.size === 'L' ? 72 : 48;
  for (let y = Math.floor(cy - R - 1); y <= cy + R + 1; y++) for (let x = Math.floor(cx - R - 1); x <= cx + R + 1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy);
    if (r > R + 0.5 || r <= rd) continue;
    if (r > R - 0.5) { b.set(x, y, P.ink); continue; }
    const nx = dx / r, ny = dy / r, lit = nx * LX + ny * LY;
    const ang = (Math.atan2(dx, -dy) + TAU) % TAU;
    if (r > rBand) {
      // a rounded rim: the outer half faces out, the top faces you, the inner half faces in
      const u = (R - 0.5 - r) / band;
      let br = u < 0.34 ? lit * 0.95 : u < 0.72 ? 0.22 + lit * 0.42 : -lit * 0.55 - 0.05;
      // a little hand-placed wear: a few brighter rubs and darker nicks
      const hh = hsh(x, y);
      if (hh < 0.03) br += 0.35; else if (hh > 0.975) br -= 0.4;
      let c = goldOf(br, x, y);
      // the specular streak on the top-left shoulder
      const sa = Math.abs(((ang - 5.55 + Math.PI) % TAU + TAU) % TAU - Math.PI);
      if (u > 0.3 && u < 0.62 && sa < 0.22) c = sa < 0.08 ? P.w : P.g5;
      b.set(x, y, c); continue;
    }
    if (r > rKn) {
      // coin edge: ridges round the bezel
      const ridge = Math.floor((ang / TAU) * nKn) % 2 === 0;
      const br = lit * 0.8 + (ridge ? 0.25 : -0.3);
      b.set(x, y, ridge ? goldOf(br, x, y) : (lit > 0.2 ? P.g2 : P.g1)); continue;
    }
    // the inner lip: its top-left wall is in shadow, the bottom-right catches the light
    b.set(x, y, -lit > 0.35 ? P.g4 : -lit > -0.2 ? P.g2 : P.g0);
  }
  return b;
}

// the hinge on the left edge (always on top of the case and the lid edge)
export function drawHinge(b, G, ox = 0, oy = 0) {
  const x0 = G.cx - G.R - 1 + ox, y0 = G.cy + oy;
  const n = G.size === 'L' ? 3 : 2, kh = G.size === 'L' ? 3 : 3;
  const top = y0 - Math.floor((n * kh + (n - 1)) / 2);
  for (let i = 0; i < n; i++) {
    const ty = top + i * (kh + 1);
    b.rows(G.size === 'L' ? ['.oo.', 'ohlo', 'olmo'].slice(0, kh) : ['.o.', 'ohl', 'olm'], x0 - 1, ty, GOLD_PAL());
    b.set(x0 - 1, ty + kh, P.ink); b.set(x0, ty + kh, P.ink); b.set(x0 + 1, ty + kh, P.ink); if (G.size === 'L') b.set(x0 + 2, ty + kh, P.ink);
  }
}

// ---------------------------------------------------------------- the enamel dial (cached per schedule)
function secAt(sections, h) {
  for (const s of sections) { const a = s.from, b = s.to; if (a <= b ? h >= a && h < b : h >= a || h < b) return s; }
  return null;
}
export { secAt };

export function buildDial(G, sections, dayOff) {
  const b = new Buf(G.W, G.H);
  const { cx, cy, rd, trk, size } = G;
  const L = size === 'L';
  const tr0 = rd - trk; // inner edge of the schedule track
  const bounds = dayOff ? [] : sections.flatMap((s) => [s.from, s.to]);
  for (let y = Math.floor(cy - rd - 1); y <= cy + rd + 1; y++) for (let x = Math.floor(cx - rd - 1); x <= cx + rd + 1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy);
    if (r > rd) continue;
    const ang = (Math.atan2(dx, -dy) + TAU) % TAU;
    const lit = (dx * LX + dy * LY) / rd;
    if (r > tr0) {
      // the day's schedule as candy enamel inlays, a dark seam between sections
      const hr = mod24((ang / TAU) * 24 + 12);
      const sec = dayOff ? { kind: 'off' } : secAt(sections, hr);
      const k = KIND[sec?.kind] || [P.e2, P.e3];
      let seam = false;
      for (const hb of bounds) {
        let da = Math.abs(((hourAngle(hb) - ang + Math.PI) % TAU + TAU) % TAU - Math.PI);
        if (da * r < 0.55) { seam = true; break; }
      }
      const u = (rd - r) / trk;
      // the bezel's shadow falls on the top-left of the track
      let c = seam ? P.inkSoft : u > 0.62 ? k[1] : k[0];
      if (!seam && r > rd - 1 && lit > 0.25) c = k[1];
      b.set(x, y, c); continue;
    }
    if (r > tr0 - 1) { b.set(x, y, P.hair); continue; }
    // the cream enamel, a soft dome of light on the top left (dithered), shade on the bottom right
    let c = P.e1;
    if (lit > 0.42 + (bay(x, y) - 0.5) * 0.12) c = P.e0;
    else if (lit < -0.55 + (bay(x, y) - 0.5) * 0.14) c = P.e2;
    b.set(x, y, c);
  }
  // hour ticks round the inside of the track
  for (let h = 0; h < 24; h++) {
    const a = hourAngle(h), major = h % 3 === 0, quarter = h % 6 === 0;
    if (!L && !major) continue;
    if (!L && (h === 3 || h === 21)) continue; // the countdown plaque's corners live there
    const len = L ? (quarter ? 3 : major ? 2 : 1) : (quarter ? 2 : 1);
    for (let k2 = 0; k2 < len; k2++) {
      const rr = G.tickR - k2;
      b.set(cx + Math.sin(a) * rr - 0.5 + 0.5, cy - Math.cos(a) * rr - 0.5 + 0.5, major ? P.k : P.kl);
    }
    if (L && quarter) { // a second pixel so the quarters read bold
      const rr = G.tickR - 0.5, px = Math.cos(a), py = Math.sin(a);
      b.set(cx + Math.sin(a) * rr + px * 0.9, cy - Math.cos(a) * rr + py * 0.9, P.k);
    }
  }
  // numerals: noon at the top, 6 on either side, a little moon for midnight
  if (L) {
    const num = (s, h, rr) => {
      const a = hourAngle(h), w = textW(s);
      drawText(b, s, Math.round(cx + Math.sin(a) * rr - w / 2), Math.round(cy - Math.cos(a) * rr - 2.5), P.k);
    };
    num('12', 12, 16); num('6', 18, 16); num('6', 6, 16);
    b.rows(SPR.moon, cx - 1, cy + 14, { m: P.b1 });
  }
  // pips on the track: a bear head where the feast starts
  if (!dayOff) {
    const rush = sections.find((q) => q.kind === 'rush');
    if (rush) {
      const a = hourAngle(rush.from), rr = rd - trk / 2;
      const bx = Math.round(cx + Math.sin(a) * rr), by = Math.round(cy - Math.cos(a) * rr);
      if (L) b.rows(SPR.bearPip, bx - 3, by - 3, { o: P.ink, f: hex('#c07a44'), F: P.snout, k: P.ink, s: P.snout });
      else b.rows(['o.o', 'ooo', '.o.'], bx - 1, by - 1, { o: P.ink });
    }
  }
  // the window frames (the weather aperture and the countdown plaque): a dark cut with a gold bevel
  apertureFrame(b, G);
  plaqueFrame(b, G, plaqueW(G));
  return b;
}

// the weather window: an arch, cut into the enamel
export function apertureMask(G) {
  const { w, h } = G.ap, cut = G.size === 'L' ? [3, 1, 1] : [2, 1];
  const m = [];
  for (let y = 0; y < h; y++) {
    const c = cut[y] || 0;
    m.push([c, w - 1 - c]);
  }
  return m; // per row [x0, x1] inclusive (frame included)
}
function apertureFrame(b, G) {
  const { cx, cy } = G, { w, y: ay } = G.ap;
  const m = apertureMask(G), x0 = cx - (w >> 1);
  for (let y = 0; y < m.length; y++) {
    const [a, c] = m[y];
    for (let x = a; x <= c; x++) {
      const edge = y === 0 || y === m.length - 1 || x === a || x === c || (y > 0 && (x < m[y - 1][0] || x > m[y - 1][1]));
      if (edge) b.set(x0 + x, cy + ay + y, P.ink);
    }
  }
  // gold bevel just outside the cut, lit on the bottom right (it's a hole)
  for (let y = -1; y <= m.length; y++) {
    const row = m[Math.max(0, Math.min(m.length - 1, y))];
    for (let x = row[0] - 1; x <= row[1] + 1; x++) {
      const inside = y >= 0 && y < m.length && x >= m[y][0] && x <= m[y][1];
      if (inside) continue;
      const px = x0 + x, py = cy + ay + y;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const yy = y + dy, xx = x + dx; return yy >= 0 && yy < m.length && xx >= m[yy][0] && xx <= m[yy][1]; });
      if (near && b.get(px, py) !== P.ink) b.set(px, py, y >= m.length - 1 || x > row[1] ? P.g4 : P.g2);
    }
  }
}
export function plaqueW(G) { return G.size === 'L' ? 25 : 16; }
function plaqueFrame(b, G, w) {
  const { cx, cy } = G, { y: py, h } = G.pl;
  const x0 = cx - (w >> 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const corner = (x === 0 || x === w - 1) && (y === 0 || y === h - 1);
    if (corner) continue;
    const edge = x === 0 || x === w - 1 || y === 0 || y === h - 1;
    if (edge) b.set(x0 + x, cy + py + y, P.ink);
  }
  for (let x = 1; x < w - 1; x++) b.set(x0 + x, cy + py + h, P.g2); // a lit lower bevel
  b.set(x0, cy + py + h - 1, P.g2); b.set(x0 + w - 1, cy + py + h - 1, P.g2);
}

// ---------------------------------------------------------------- the weather window's painted disc
// scene: { sky: 'day'|'dawn'|'dusk'|'night', wx, season, blood, t }
export function drawAperture(b, G, scene, slide = 0, prev = null) {
  const { cx, cy } = G, { w, y: ay } = G.ap;
  const m = apertureMask(G), x0 = cx - (w >> 1);
  const iw = w - 2;
  const paint = (sc, offX) => {
    const sk = SKY[sc.sky] || SKY.day, hl = HILLS[sc.season] || HILLS.summer;
    const ih = m.length - 2;
    for (let y = 1; y < m.length - 1; y++) for (let x = m[y][0] + 1; x <= m[y][1] - 1; x++) {
      const lx = x - 1 - offX;
      if (lx < -1 || lx > iw) continue;
      const yy = y - 1;
      // sky, a dithered step to the horizon colour, then two rows of rolling hills
      let c = yy >= ih - 2 - (bay(x, y) > 0.5 ? 1 : 0) ? sk[1] : sk[0];
      const hillH = Math.round(1.6 + Math.sin((lx + 1.5) * 0.9) * 0.7 + (G.size === 'L' ? 0.4 : -0.2));
      if (yy >= ih - hillH) c = (lx + yy) % 5 === 0 && yy === ih - hillH ? hl[2] : yy === ih - hillH ? hl[0] : hl[1];
      b.set(x0 + x, cy + ay + y, c);
    }
    // stars at night
    if (sc.sky === 'night') for (const [sx, sy] of [[2, 1], [iw - 3, 2], [Math.floor(iw / 2) + 3, 1], [1, 3]]) {
      const tw = Math.floor((sc.t || 0) * 2 + sx) % 3 !== 0;
      if (tw && sy < ih - 2) setIn(sx + 1 + offX, sy + 1, P.w);
    }
    // the weather icon (the moon at night when it's clear)
    let key = sc.wx || 'clear';
    if (sc.sky === 'night' && (key === 'clear' || key === 'heat')) key = 'moon';
    const ic = WX[key] || WX.clear;
    const pal = { ...WXPAL };
    if (key === 'moon' && sc.blood) { pal.m = P.r1; }
    if (sc.sky === 'night') { pal.w = hex('#c8d0f0'); pal.g = hex('#8a94c0'); }
    const iy = G.size === 'L' ? 1 : 0, ix = Math.floor((iw - 7) / 2) + 1;
    for (let y = 0; y < 5; y++) for (let x = 0; x < 7; x++) {
      const c = pal[ic[y][x]];
      if (c) setIn(ix + x + offX, iy + y + (G.size === 'L' ? 0 : 1), c);
    }
  };
  const setIn = (x, y, c) => {
    if (y < 1 || y >= m.length - 1) return;
    if (x < m[y][0] + 1 || x > m[y][1] - 1) return;
    b.set(x0 + x, cy + ay + y, c);
  };
  if (prev && slide > 0 && slide < 1) {
    // the disc turns: yesterday's scene slides out to the left, today's comes in from the right
    const off = Math.round(slide * (iw + 1));
    paint(prev, -off);
    paint(scene, iw + 1 - off);
    // the gap between two scenes on the disc is brass
    for (let y = 1; y < m.length - 1; y++) setIn(iw + 1 - off, y, P.g2);
  } else paint(scene, 0);
}

// ---------------------------------------------------------------- the countdown plaque
// p: { kind: 'count'|'feast'|'night'|'off', text, red, blink, chomp }
export function drawPlaque(b, G, p, t = 0) {
  const w = plaqueW(G), { cx, cy } = G, { y: py, h } = G.pl, L = G.size === 'L';
  const x0 = cx - (w >> 1), y0 = cy + py;
  let bg = P.e0, fg = P.k;
  if (p.kind === 'feast') { const on = Math.floor(t * 4) % 2 === 0; bg = on ? P.r1 : P.r0; fg = P.w; }
  else if (p.kind === 'off') { bg = KIND.off[0]; fg = P.ink; }
  else if (p.kind === 'night') { bg = KIND.night[1]; fg = hex('#fff2a0'); }
  else if (p.red) fg = P.r1;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) b.set(x0 + x, y0 + y, y === 1 && p.kind === 'count' ? P.w : bg);
  let tx = x0 + 2;
  if (L) {
    // the icon: a bear (chomping at the feast), a moon at night, a sun on a day off
    if (p.kind === 'night') b.rows(SPR.moon, tx + 1, y0 + 1, { m: hex('#fff2a0') });
    else if (p.kind === 'off') b.rows(['.y.y.', 'yyyyy', '.yYy.', 'yyyyy', '.y.y.'].map((r) => r), tx, y0 + 1, { y: hex('#ff9f1a'), Y: hex('#fff3a0') });
    else {
      const chomp = p.kind === 'feast' && Math.floor(t * 6) % 2 === 0;
      const bear = chomp ? ['oo.oo', 'ofFfo', 'fkfkf', 'fsoof', '.fff.'] : SPR.bear;
      const hop = p.blink && Math.floor(t * 2.4) % 2 === 0 ? -1 : 0;
      b.rows(bear, tx, y0 + 1 + hop, { o: P.ink, f: P.fur, F: P.furD, k: P.ink, s: P.snout });
    }
    tx += 6;
  }
  if (p.blink && p.kind === 'count' && Math.floor(t * 2.4) % 2 === 1 && p.red) fg = P.r0;
  const tw = textW(p.text);
  const room = x0 + w - 2 - tx;
  drawText(b, p.text, tx + Math.max(0, Math.floor((room - tw) / 2)), y0 + 1, fg);
}

// ---------------------------------------------------------------- the lid (outside: closed / inside: open)
export function buildLidOut(G) {
  const R = G.R, n = 2 * R + 1, b = new Buf(n + 1, n + 1);
  const c0 = R + 0.5, rw = G.rw, L = G.size === 'L';
  const ringO = rw + (L ? 5 : 3.5), beadR = R - (L ? 4.5 : 3.5), rimR = R - 0.5 - (L ? 3 : 3);
  const rays = L ? 44 : 32;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x + 0.5 - c0, dy = y + 0.5 - c0, r = Math.hypot(dx, dy);
    if (r > R + 0.5 || r <= rw) continue;
    const ang = (Math.atan2(dx, -dy) + TAU) % TAU;
    const nx = dx / (r || 1), ny = dy / (r || 1), lit = nx * LX + ny * LY;
    if (r > R - 0.5) { b.set(x, y, P.ink); continue; }
    if (r > rimR) { // the rounded rim, like the case
      const u = (R - 0.5 - r) / (R - 0.5 - rimR);
      const br = u < 0.4 ? lit * 0.95 : u < 0.75 ? 0.25 + lit * 0.4 : -lit * 0.5;
      b.set(x, y, goldOf(br, x, y)); continue;
    }
    if (r > beadR - 1) { // a beaded ring
      const k = Math.floor((ang / TAU) * (L ? 56 : 40));
      const bead = k % 2 === 0;
      b.set(x, y, bead ? (lit > 0 ? P.g5 : P.g3) : P.g1); continue;
    }
    if (r > ringO + 1) {
      // the domed lid: engine-turned sunburst rays, shaded as a gentle dome
      const dome = (dx * LX + dy * LY) / R;
      const ray = Math.floor((ang / TAU) * rays) % 2 === 0;
      b.set(x, y, goldOf(dome * 0.9 + (ray ? 0.2 : -0.12), x, y)); continue;
    }
    if (r > ringO) { b.set(x, y, P.g1); continue; } // a cut line round the chapter ring
    if (r > rw + 1) {
      // blue enamel chapter ring of the half-hunter window, with gold markers
      let c = lit > 0.45 ? P.b2 : lit < -0.5 ? P.b0 : P.b1;
      if (r > ringO - 0.8 && lit < 0.2) c = P.b0;
      b.set(x, y, c); continue;
    }
    b.set(x, y, P.ink); // the window's edge
  }
  // markers on the chapter ring every 3 hours: gold dots, a sun at noon, a moon at midnight
  const rm = rw + (L ? 3 : 2.25);
  for (let h = 0; h < 24; h += 3) {
    const a = hourAngle(h), mx = Math.round(c0 + Math.sin(a) * rm - 0.5), my = Math.round(c0 - Math.cos(a) * rm - 0.5);
    if (h === 12 && L) b.rows(['.y.', 'yYy', '.y.'], mx - 1, my - 1, { y: hex('#ffcf3a'), Y: P.w });
    else if (h === 0 && L) b.rows(['mm', 'm.'], mx, my - 1, { m: hex('#fff2a0') });
    else { b.set(mx, my, h % 6 === 0 ? P.g5 : P.g4); if (L && h % 6 === 0) b.set(mx + 1, my, P.g3); }
  }
  // four engraved sparkles on the sunburst
  if (L) for (const a of [0.8, 2.35, 3.95, 5.5]) {
    const rr = (ringO + beadR) / 2, sx = Math.round(c0 + Math.sin(a) * rr - 0.5), sy = Math.round(c0 - Math.cos(a) * rr - 0.5);
    b.rows(['.l.', 'lhl', '.l.'], sx - 1, sy - 1, { l: P.g1, h: P.g5 });
  }
  return b;
}

// the inside of the open lid, seen at its resting angle: a polished concave dish (an ellipse
// G.lidA wide), with Reynard's little tear-off calendar card tucked in it
export function buildLidIn(G, day, weekday, dayOff, tomorrowWx) {
  const a = G.lidA, R = G.R, W = 2 * a + 4, H = 2 * R + 1, b = new Buf(W, H);
  const tcx = a + 2, tcy = R + 0.5, L = G.size === 'L';
  const inside = (x, y, sh = 0) => { const ex = (x + 0.5 - tcx - sh) / a, ey = (y + 0.5 - tcy) / R; return ex * ex + ey * ey; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ex = (x + 0.5 - tcx) / a, ey = (y + 0.5 - tcy) / R, e = Math.hypot(ex, ey);
    const grad = Math.hypot(ex / a, ey / R) / (e || 1), dist = (1 - e) / (grad || 1); // ~px inside the edge
    if (dist < 0) {
      // the lid's rim, seen beyond the dish on the far (left) side
      if (inside(x, y, -1.6) <= 1) b.set(x, y, inside(x, y, -1.6) > 0.86 || x === 0 ? P.ink : P.g1);
      continue;
    }
    if (dist < 1) { b.set(x, y, P.ink); continue; }
    if (dist < 2.2) { b.set(x, y, ex < -0.2 ? P.g4 : ey < -0.6 ? P.g3 : P.g2); continue; } // the rim's lip
    // concave: the far (bottom right) wall faces the light
    let br = (ex * 0.55 + ey * 0.83) * 0.85 + 0.1;
    if (Math.abs(e - 0.8) < 0.035 * (1 + Math.abs(ex))) br -= 0.45; // an engraved ring
    let c = goldOf(br, x, y);
    // a crescent of reflected light on the far wall, a hot spot near the top
    if (e > 0.6 && e < 0.73 && ex > 0.05 && ey > 0.1) c = e > 0.645 && e < 0.69 && ey > 0.3 && ey < 0.62 ? P.w : P.g5;
    if (e > 0.5 && e < 0.64 && ex < -0.1 && ey < -0.45 && ey > -0.7) c = P.g5;
    b.set(x, y, c);
  }
  // the calendar card
  const cw = G.card.w, ch = G.card.h;
  const kx = Math.round(tcx - cw / 2), ky = Math.round(tcy - ch / 2) - (L ? 1 : 0);
  const head = L ? 8 : 7;
  const headC = dayOff ? KIND.off[1] : P.r1, headH = dayOff ? KIND.off[0] : P.r2;
  // its crisp shadow on the gold (down right)
  for (let y = 1; y <= ch; y++) b.set(kx + cw, ky + y, P.g1);
  for (let x = 1; x <= cw; x++) b.set(kx + x, ky + ch, P.g1);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const corner = (x === 0 || x === cw - 1) && (y === 0 || y === ch - 1);
    if (corner) continue;
    const edge = x === 0 || x === cw - 1 || y === 0 || y === ch - 1;
    let c = edge ? P.ink : y < head ? (y === 1 ? headH : headC) : y === head ? (dayOff ? KIND.off[1] : P.r0) : y === ch - 2 ? P.paperSh : P.paper;
    if (!edge && y > head + 1 && (x * 7 + y * 3) % 23 === 0) c = P.paperSh; // paper grain
    b.set(kx + x, ky + y, c);
  }
  // binder rings over the top edge
  for (const rx of L ? [4, cw - 5] : [3, cw - 4]) b.rows(['o.o', 'ooo'], kx + rx - 1, ky - 1, { o: P.ink });
  // the weekday on the header, the date big below
  const wd = String(weekday || '').slice(0, 3).toUpperCase();
  drawText(b, wd, kx + Math.round((cw - textW(wd)) / 2), ky + (L ? 2 : 1), P.w);
  const ds = String(day ?? '');
  if (ds.length <= 2) drawText(b, ds, kx + Math.round((cw - textW(ds, BIG)) / 2), ky + head + 2, dayOff ? KIND.off[1] : P.ink, BIG);
  else drawText(b, ds, kx + Math.round((cw - textW(ds)) / 2), ky + head + 3, P.ink);
  // tomorrow's weather, a small arrow then the icon
  if (L && tomorrowWx && WX[tomorrowWx]) {
    const fy = ky + head + 11;
    b.rows(['k.', 'kk', 'k.'], kx + 3, fy + 1, { k: P.kl });
    const pal = { ...WXPAL, w: hex('#a8b8d8'), s: hex('#a8c8f0'), f: hex('#b8c4d8') };
    b.rows(WX[tomorrowWx], kx + 6, fy - 1, pal);
  }
  // gold photo corners holding it
  b.rows(['oooo', 'ohlo', 'olo.', 'oo..'], kx - 1, ky + head - 1, { o: P.ink, h: P.g5, l: P.g3 });
  b.rows(['..oo', '.olo', 'olmo', 'oooo'], kx + cw - 3, ky + ch - 3, { o: P.ink, l: P.g4, m: P.g2 });
  return { buf: b, cx: tcx, cy: tcy };
}

// ---------------------------------------------------------------- hands
// a tapered hand from the centre: t along it from t0 (tail) to len, width w(t); left side lit
export function drawHand(b, cx, cy, ang, t0, len, wFn, cols) {
  const dx = Math.sin(ang), dy = -Math.cos(ang), px = Math.cos(ang), py = Math.sin(ang);
  const ext = Math.max(Math.abs(t0), len) + 3;
  for (let y = Math.floor(cy - ext); y <= cy + ext; y++) for (let x = Math.floor(cx - ext); x <= cx + ext; x++) {
    const qx = x + 0.5 - cx, qy = y + 0.5 - cy;
    const t = qx * dx + qy * dy, s = qx * px + qy * py;
    if (t < t0 || t > len) continue;
    const hw = wFn(t) / 2;
    if (Math.abs(s) > hw) continue;
    b.set(x, y, s < -hw * 0.34 ? cols[2] : s > hw * 0.34 ? cols[0] : cols[1]);
  }
}
// a ring (the Breguet moon on the hour hand, the counterweight of the seconds hand)
export function drawRing(b, x, y, r0, r1, col, fill = 0) {
  for (let j = Math.floor(y - r1 - 1); j <= y + r1 + 1; j++) for (let i = Math.floor(x - r1 - 1); i <= x + r1 + 1; i++) {
    const d = Math.hypot(i + 0.5 - x, j + 0.5 - y);
    if (d <= r1 && d > r0) b.set(i, j, col); else if (fill && d <= r0) b.set(i, j, fill);
  }
}
// a 1-px line (Bresenham)
export function line(b, x0, y0, x1, y1, col) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (let n = 0; n < 400; n++) {
    b.set(x0, y0, col);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}

// ---------------------------------------------------------------- bow, crown, pendant
export function drawBow(b, G, ox = 0, oy = 0) {
  const cx = G.cx + ox, by = G.bowY + oy, rx = G.bowRx, ry = G.bowRy, th = G.size === 'L' ? 2.6 : 2.2, leg = G.legY + oy;
  const m = new Map();
  for (let y = by - ry - 1; y <= leg + 1; y++) for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
    const dx = x + 0.5 - (cx + 0.5), dy = y + 0.5 - by;
    let on = false;
    if (dy <= 0) {
      const eo = (dx / (rx + 0.5)) ** 2 + (dy / (ry + 0.5)) ** 2, ei = (dx / (rx + 0.5 - th)) ** 2 + (dy / (ry + 0.5 - th)) ** 2;
      on = eo <= 1 && ei > 1;
    } else on = Math.abs(dx) <= rx + 0.5 && Math.abs(dx) > rx + 0.5 - th && y <= leg;
    if (on) m.set(x + ',' + y, 1);
  }
  for (const k of m.keys()) {
    const [x, y] = k.split(',').map(Number);
    const out = !m.has(x - 1 + ',' + y) || !m.has(x + 1 + ',' + y) || !m.has(x + ',' + (y - 1)) || (!m.has(x + ',' + (y + 1)) && y < leg);
    const dx = x - cx, dy = y - by;
    b.set(x, y, out ? P.ink : dy < -ry + 2 && dx < 0 ? P.g5 : dx < 0 ? P.g4 : dy < -ry + 2 ? P.g3 : P.g2);
  }
  // pivot knobs where the bow meets the pendant
  for (const s of [-1, 1]) b.rows(['.o.', 'olo', '.o.'], cx + s * rx - 1, leg - 1, { o: P.ink, l: s < 0 ? P.g4 : P.g2 });
}
// the fluted winding crown; squash > 0 pushes it down into the pendant (pressed), < 0 stretches it
export function drawCrown(b, G, squash = 0, ox = 0, oy = 0) {
  const { w, y0, y1 } = G.crown, cx = G.cx + ox;
  const top = y0 + oy + Math.round(squash), ww = w + (squash > 0.5 ? 2 : 0);
  const x0 = cx - (ww >> 1);
  for (let y = top; y <= y1 + oy; y++) for (let x = 0; x < ww; x++) {
    const corner = (x === 0 || x === ww - 1) && y === top;
    if (corner) continue;
    const edge = x === 0 || x === ww - 1 || y === top || y === y1 + oy;
    const flute = x % 2 === 1;
    const lit = x < ww * 0.4;
    b.set(x0 + x, y, edge ? P.ink : y === top + 1 ? (lit ? P.g5 : P.g4) : flute ? (lit ? P.g4 : P.g3) : lit ? P.g3 : P.g1);
  }
  // a little ruby cabochon on top of the crown
  if (G.size === 'L') b.rows(['.o.', 'oro'], cx - 1, top - 2, { o: P.ink, r: P.r1 });
  else b.set(cx, top - 1, P.ink);
}
export function drawPendant(b, G, ox = 0, oy = 0) {
  const { w, y0, y1 } = G.pend, cx = G.cx + ox, x0 = cx - (w >> 1);
  for (let y = y0 + oy; y <= y1 + oy + 1; y++) for (let x = 0; x < w; x++) {
    const edge = x === 0 || x === w - 1;
    b.set(x0 + x, y, edge ? P.ink : y === y0 + oy ? P.ink : x === 1 ? P.g5 : x === w - 2 ? P.g1 : (y - y0) % 2 ? P.g3 : P.g4);
  }
}

// ---------------------------------------------------------------- chains
// the strand from the top of the screen down to the bow
export function drawChainUp(b, G, ox = 0, oy = 0) {
  const [F, E] = G.link, pal = GOLD_PAL();
  const endY = G.swivelY + oy, cx = G.cx + ox;
  const links = [];
  let y = endY - F.length + 1, i = 0;
  while (y + F.length > -2) { links.push([i % 2 === 0 ? F : E, y]); y -= F.length - 2; i++; }
  for (let j = links.length - 1; j >= 0; j--) { const [s, ly] = links[j]; b.rows(s, cx - (s[0].length >> 1), ly, pal); }
  // the swivel ring onto the bow
  const sy = endY + 1;
  b.rows(G.size === 'L' ? ['.ooo.', 'oh.lo', 'olmmo', '.ooo.'] : ['.o.', 'olo', '.o.'], cx - (G.size === 'L' ? 2 : 1), sy, pal);
}
// the loose swag from the bow to the bell charm; returns the hook point
export function drawSwag(b, G, x0, y0, x1, y1, sag, ox = 0, oy = 0) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.4);
  let lx = null, ly = null, k = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t + ox, y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag + oy;
    const rx = Math.round(x), ry = Math.round(y);
    if (rx === lx && ry === ly) continue;
    lx = rx; ly = ry; k++;
    // little links: a lit bead, a dark gap, with an ink edge underneath
    b.set(rx, ry + 1, P.ink);
    b.set(rx, ry, k % 3 === 0 ? P.g1 : k % 3 === 1 ? P.g4 : P.g3);
    b.set(rx, ry - 1, P.ink);
  }
}
export function drawBell(b, G, x, y, ang = 0) {
  // the charm hangs from (x, y): rotate a few pixels by snapping its whole sprite sideways
  const s = G.bell, w = s[0].length;
  const shift = Math.round(Math.sin(ang) * (s.length - 2));
  const pal = { ...GOLD_PAL() };
  for (let r = 0; r < s.length; r++) {
    const off = Math.round((shift * r) / (s.length - 1));
    for (let c = 0; c < w; c++) { const col = pal[s[r][c]]; if (col) b.set(x - (w >> 1) + c + off, y + r, col); }
  }
}

// the speed tag hanging under the case: 1-3 red chevrons (paused: two blue bars)
export function drawTag(b, G, speed, paused, ang = 0, glow = 0, ox = 0, oy = 0) {
  const { w, h } = G.tag, L = G.size === 'L';
  const cx = G.cx + ox, top = G.cy + G.R + oy;
  // the ring through the bottom of the case
  b.rows(L ? ['.o.', 'olo', 'o.o', '.o.'] : ['.o.', 'olo', '.o.'], cx - 1, top - 1, { o: P.ink, l: P.g4 });
  const ry = top + (L ? 3 : 2);
  const shift = Math.round(Math.sin(ang) * 3);
  const x0 = cx - (w >> 1) + shift;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const corner = (x === 0 || x === w - 1) && (y === 0 || y === h - 1);
    if (corner) continue;
    const edge = x === 0 || x === w - 1 || y === 0 || y === h - 1;
    b.set(x0 + x, ry + y, edge ? P.ink : y === 1 ? P.g5 : y === h - 2 ? P.g2 : x < 3 ? P.g4 : P.g3);
  }
  if (L) { b.set(x0 + 1, ry + 1, P.g5); b.set(x0 + w - 2, ry + h - 2, P.g1); }
  const cy0 = ry + Math.floor((h - 5) / 2);
  if (paused) {
    b.rows(SPR.pause, cx - 2 + shift, cy0, { k: P.b1 });
    return;
  }
  const sp = Math.max(1, Math.min(3, speed | 0));
  const cx0 = cx - 5 + shift;
  for (let i = 0; i < 3; i++) {
    const on = i < sp;
    const col = on ? (glow > 0 && i === sp - 1 ? P.r2 : P.r1) : P.g1;
    b.rows(SPR.chev, cx0 + i * 4, cy0, { k: col });
    if (on) b.set(cx0 + i * 4, cy0, P.r2);
  }
}
