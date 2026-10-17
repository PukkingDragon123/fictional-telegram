// [v26 class2] The classroom's two corner buttons, SKIP and x3 FAST, as hand-made pixel art.
// Each button is a little wooden sign with a slate inset (the chalkboard's own colours), brass
// nails and a notched ink outline. All art is painted once, pixel by pixel, at 1x into canvases
// and shown at an integer scale (--s: 3 on desktop, 2 on phones) with image-rendering: pixelated,
// so nothing is ever stretched or blurred. Labels are HTML text in the game font.
//
//   el.innerHTML = classButtonsHTML(ff); paintClassButtons(el);   // el = the .cls-ui root

const INK = '#1d1410';
const WOOD = '#8a5430', WOOD_L = '#b47442', WOOD_H = '#c98a52', WOOD_D = '#5e3519', WOOD_DD = '#43240f', GRAIN = '#7a4828';
const SLATE = '#2a4335', SLATE_D = '#17261d', SLATE_L = '#3a5a45';
const LIT = '#4f9a3c', LIT_D = '#2c6224', LIT_L = '#8ad46a';
const BRASS = '#f2c230', BRASS_D = '#9a6a14', GLOW = '#ffd23a';
const CHALK = '#f3f0e2', CHALK_Y = '#f7e07a';

export const BTN_H = 18; // art px, incl. a 1 px margin for the "on" glow ring
export const FF_W = 38, SKIP_W = 44, PANEL_W = { ff: 14, skip: 13 };

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

/** a wooden sign button, W x BTN_H art px. kind 'ff' | 'skip', on = lit (x3 active) */
function paintButton(W, kind, on) {
  const H = BTN_H, c = canvas(W, H), x = c.getContext('2d');
  const P = (px, py, col) => { x.fillStyle = col; x.fillRect(px, py, 1, 1); };
  const R = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px, py, w, h); };
  // the glow ring (on), notched like the outline
  if (on) { R(2, 0, W - 4, 1, GLOW); R(2, H - 1, W - 4, 1, GLOW); R(0, 2, 1, H - 4, GLOW); R(W - 1, 2, 1, H - 4, GLOW); P(1, 1, GLOW); P(W - 2, 1, GLOW); P(1, H - 2, GLOW); P(W - 2, H - 2, GLOW); }
  // ink outline with notched corners
  R(2, 1, W - 4, 1, INK); R(2, H - 2, W - 4, 1, INK); R(1, 2, 1, H - 4, INK); R(W - 2, 2, 1, H - 4, INK);
  // wood face + plank grain
  R(2, 2, W - 4, H - 4, on ? '#9a6236' : WOOD);
  for (let yy = 4; yy < H - 4; yy++) for (let xx = 3; xx < W - 3; xx++) if (hash(xx >> 2, yy, 7) > 0.78 && hash(xx, yy, 3) > 0.35) P(xx, yy, GRAIN);
  R(2, 2, W - 4, 1, WOOD_H); R(2, 3, W - 4, 1, WOOD_L); R(2, 2, 1, H - 4, WOOD_L);
  R(2, H - 3, W - 4, 1, WOOD_DD); R(2, H - 4, W - 4, 1, WOOD_D); R(W - 3, 3, 1, H - 5, WOOD_D);
  for (const [px, py] of [[2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3]]) P(px, py, INK); // rounder corners
  // brass nails on the right
  for (const py of [4, H - 6]) { P(W - 5, py, BRASS); P(W - 4, py + 1, BRASS_D); P(W - 5, py + 1, '#c99a22'); }
  // the slate inset (chalk icon lives here)
  const pw = PANEL_W[kind], px0 = 4, py0 = 4, ph = H - 8;
  R(px0, py0, pw, ph, on ? LIT : SLATE);
  R(px0, py0, pw, 1, on ? LIT_D : SLATE_D); R(px0, py0, 1, ph, on ? LIT_D : SLATE_D); // inset shadow
  R(px0 + 1, py0 + ph - 1, pw - 1, 1, WOOD_H); R(px0 + pw - 1, py0 + 1, 1, ph - 1, WOOD_L); // lip
  if (on) { R(px0 + 1, py0 + 1, pw - 2, 1, LIT_L); }
  else for (let i = 0; i < 6; i++) P(px0 + 2 + Math.floor(hash(i, 1, 9) * (pw - 4)), py0 + 2 + Math.floor(hash(i, 2, 9) * (ph - 4)), SLATE_L); // chalk dust
  // a carved divider between icon and label
  R(px0 + pw + 1, 5, 1, H - 10, WOOD_D);
  return c.toDataURL();
}

const ICONS = {
  // one fast-forward chevron (+ ink drop shadow)
  chev: ['X....', 'XX...', 'XXX..', 'XXXX.', 'XXX..', 'XX...', 'X....'],
  // a doorway with light behind it
  // an open doorway: warm light inside, the door slab swung in on the left
  door: ['XXXXXX', 'X#;;;X', 'X#;;;X', 'X##;;X', 'X##;;X', 'X#;;;X', 'X#;;;X', 'XXXXXX'],
  arrow: ['..X..', '...X.', 'XXXXX', '...X.', '..X..'],
};
function paintIcon(rows, col, inner = null) {
  const h = rows.length, w = rows[0].length, c = canvas(w + 1, h + 1), x = c.getContext('2d');
  const draw = (dx, dy, map) => rows.forEach((r, y) => [...r].forEach((ch, xx) => { const k = map(ch); if (k) { x.fillStyle = k; x.fillRect(xx + dx, y + dy, 1, 1); } }));
  draw(1, 1, (ch) => (ch === 'X' ? INK : null)); // shadow first
  draw(0, 0, (ch) => (ch === 'X' ? col : ch === ';' ? inner : ch === '#' ? '#6a3c1c' : null));
  return c.toDataURL();
}

let _art = null;
function art() {
  if (_art) return _art;
  _art = {
    ff: paintButton(FF_W, 'ff', false), ffOn: paintButton(FF_W, 'ff', true),
    skip: paintButton(SKIP_W, 'skip', false),
    chev: paintIcon(ICONS.chev, CHALK), chevOn: paintIcon(ICONS.chev, CHALK_Y),
    door: paintIcon(ICONS.door, CHALK, '#f0c860'), arrow: paintIcon(ICONS.arrow, CHALK),
  };
  return _art;
}

export function classButtonsHTML(ff) {
  return `<div class="cls-btns">
    <button class="cls-out cls-pbtn" data-h="out" type="button" title="Skip this class (Esc)" aria-label="Skip class"><i class="cls-pico cls-door"></i><i class="cls-pico cls-exit"></i><span class="cls-plbl">SKIP</span></button>
    <button class="cls-skip cls-pbtn${ff ? ' on' : ''}" data-h="skip" type="button" title="Fast forward x3" aria-label="Fast forward x3" aria-pressed="${ff ? 'true' : 'false'}"><i class="cls-pico cls-chev a"></i><i class="cls-pico cls-chev b"></i><span class="cls-plbl">x3</span></button>
  </div>`;
}

/** hand the painted art to the CSS (custom properties on the .cls-ui root) */
export function paintClassButtons(root) {
  try {
    const a = art();
    const st = root.style;
    st.setProperty('--a-ff', `url(${a.ff})`); st.setProperty('--a-ff-on', `url(${a.ffOn})`);
    st.setProperty('--a-skip', `url(${a.skip})`);
    st.setProperty('--a-chev', `url(${a.chev})`); st.setProperty('--a-chev-on', `url(${a.chevOn})`);
    st.setProperty('--a-door', `url(${a.door})`); st.setProperty('--a-arrow', `url(${a.arrow})`);
  } catch { /* no canvas: the CSS fallbacks still draw plain buttons */ }
}

/** a squashy press, also on quick touch taps where :active never shows */
export function boop(el) { if (!el) return; el.classList.remove('boop'); void el.offsetWidth; el.classList.add('boop'); }
