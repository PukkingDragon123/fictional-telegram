// [v33 kit] e-Buy's ads: a parody of 1999 web banners, in the old shop's own look (src/ui/ebuy.css).
// Stepped pixel animation only (steps() in CSS), the game's sprites, the game's jokes, no real brands.
//
//   adBanner(id, A) -> HTML   a 468x60-ish banner that spans the card grid (between card rows)
//   adSky(A)        -> HTML   the sidebar skyscraper: "TAP THE FISH, WIN A PRIZE" (a tiny reflex game)
//   adPopup(id, A)  -> HTML   a fake pop-up window (its close button runs away once)
//   adUnder(A, n)   -> HTML   the "UNDER CONSTRUCTION" divider above the locked (coming soon) cards
//   BANNERS                   the banner ids, in rotation order
//   COUPONS                   every coupon code: { pct | flat | ship, n: what it does, from: where it hides }
//   mysteryArt()    -> dataURL  the Mystery Box listing's pixel art
//
// A = { icon(name, scale) -> html, px(name, scale) -> svg html, coin(scale) -> html }.
// Clicks are wired by EBuy.js through data-ad="<id>" (the ad) and data-adx="<id>" (its close button).

export const COUPONS = {
  MONEY123: { pct: 10, n: '10% off everything', from: 'the sticky note on the laptop' },
  VISITOR: { flat: 15, n: '15 coins off', from: 'the 1,000,000th visitor ad' },
  FISHY: { pct: 15, n: '15% off', from: 'TAP THE FISH' },
  BEARHUG: { flat: 10, n: '10 coins off', from: 'the hot single bears' },
  PONDEXE: { flat: 8, n: '8 coins off', from: 'Download more pond' },
  MOOSE: { ship: 'turbo', n: 'free TURBO shipping', from: 'the Moose Express ad' },
  NOTASCAM: { pct: 5, n: '5% off (this is not a scam)', from: 'the boot screen' },
};

export const BANNERS = ['visitor', 'bears', 'doctors', 'pond', 'moose', 'mystery'];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const blink = (t) => `<b class="ad-blink">${t}</b>`;
const close = (id) => `<span class="ad-tag">Sponsored</span><button class="ad-x" data-adx="${id}" aria-label="close ad">x</button>`;

export function adBanner(id, A) {
  const I = (n, s = 2) => A.icon(n, s) || '';
  switch (id) {
    case 'visitor':
      return `<div class="eb-ad ad-visitor" data-ad="visitor" role="button" tabindex="0">${close('visitor')}
        <span class="ad-coin">${A.coin(3)}</span>
        <span class="ad-txt"><b class="ad-big">!! YOU ARE THE <u>1,000,000th</u> VISITOR !!</b><span>You have been selected to receive a FREE PRIZE. ${blink('CLICK HERE')} to claim.</span></span>
        <span class="ad-coin r">${A.coin(3)}</span></div>`;
    case 'bears':
      return `<div class="eb-ad ad-bears" data-ad="bears" role="button" tabindex="0">${close('bears')}
        <span class="ad-hearts"><i>${A.px('heart', 2)}</i><i>${A.px('heart', 2)}</i><i>${A.px('heart', 2)}</i></span>
        <span class="ad-face">${I('bear', 3) || I('heart', 3)}</span>
        <span class="ad-txt"><b class="ad-big">HOT SINGLE BEARS IN YOUR AREA</b><span>They want to <s>EAT</s> MEET you. ${blink('Chat now!')}</span></span>
        <span class="ad-face r">${I('bear', 3) || I('heart', 3)}</span></div>`;
    case 'doctors':
      return `<div class="eb-ad ad-doctors" data-ad="doctors" role="button" tabindex="0">${close('doctors')}
        <span class="ad-face fox">${I('fox_smug', 2) || I('question', 3)}</span>
        <span class="ad-txt"><b class="ad-big">Doctors HATE this fox!</b><span>One weird trick to save <b class="ad-red">87%</b> on eggs. Bears don't want you to know. ${blink('See the trick')}</span></span>
        <span class="ad-docs">${I('question', 2)}${I('bang', 2)}${I('question', 2)}</span></div>`;
    case 'pond':
      return `<div class="eb-ad ad-pond" data-ad="pond" role="button" tabindex="0">${close('pond')}
        <span class="ad-face">${I('pond', 3) || I('drop', 3)}</span>
        <span class="ad-txt"><b class="ad-big">DOWNLOAD MORE POND</b><span class="ad-bar"><i></i></span><span class="ad-dl">pond.exe · 56k modem · <em>4 hours left</em></span></span>
        <span class="ad-btn">FREE!!</span></div>`;
    case 'moose':
      return `<div class="eb-ad ad-moose" data-ad="moose" role="button" tabindex="0">${close('moose')}
        <span class="ad-road"><span class="ad-rider">${I('moose', 2)}${A.px('bike', 3)}</span><i class="ad-lines"></i></span>
        <span class="ad-txt"><b class="ad-big">MOOSE EXPRESS <em>TURBO</em></b><span>2x FASTER delivery! He pedals like his rent is due. ${blink('Try it FREE')}</span></span></div>`;
    case 'mystery':
      return `<div class="eb-ad ad-mystery" data-ad="mystery" role="button" tabindex="0">${close('mystery')}
        <span class="ad-box"><img src="${mysteryArt()}" alt="" draggable="false"></span>
        <span class="ad-txt"><b class="ad-big">MYSTERY BOX ???</b><span>What's inside? Even Reynard doesn't know. Could be worth 3x! ${blink('Open it')}</span></span>
        <span class="ad-qs"><i>?</i><i>?</i><i>?</i></span></div>`;
    default: return '';
  }
}

export function adSky(A) {
  return `<div class="eb-sky" data-ad="sky">
    <span class="ad-tag">Sponsored</span>
    <b class="sky-h">TAP THE FISH!</b>
    <span class="sky-sub">and WIN a prize</span>
    <span class="sky-lane"><i class="sky-ring"></i><span class="sky-fish">${A.icon('fish', 2) || A.px('spark', 3)}</span></span>
    <button class="sky-go" data-ad="skyfish">TAP!</button>
    <span class="sky-msg">every 1,000th tap wins!*</span>
    <small class="sky-fine">*or so</small>
  </div>`;
}

export function adPopup(id, A) {
  return `<div class="eb-pop" data-pop="${id}" role="dialog" aria-label="advertisement">
    <div class="pop-bar"><span>${A.px('box', 1)} Pond_Lonely.exe</span><button class="pop-x" data-adx="popup" aria-label="close">${A.px('x', 2)}</button></div>
    <div class="pop-body">
      <span class="pop-fish">${A.icon('fish', 2)}${A.icon('heart', 1)}${A.icon('fish_gold', 2) || A.icon('fish', 2)}</span>
      <b class="pop-h">Is your pond LONELY??</b>
      <span>Hot single <b>eggs</b> are waiting to hatch near YOU.</span>
      <span class="pop-btns"><button class="pop-yes" data-ad="popyes">YES!!!</button><button class="pop-no" data-adx="popup">no thanks</button></span>
    </div>
  </div>`;
}

export function adUnder(A, n) {
  return `<div class="eb-under"><span class="und-stripes"></span>
    <span class="und-sign"><span class="und-ic">${A.icon('hammer', 2) || A.px('box', 2)}</span><b>UNDER CONSTRUCTION</b><span class="und-ic r">${A.icon('shovel', 2) || A.px('box', 2)}</span></span>
    <span class="und-sub">${n} more thing${n === 1 ? '' : 's'} coming soon. The beavers are on it (they are on break).</span>
    <span class="und-stripes"></span></div>`;
}

// the Mystery Box's pixel art: a taped cardboard box with a big gold "?"
let MYST = null;
export function mysteryArt() {
  if (MYST) return MYST;
  const rows = [
    '................',
    '...kkkkkkkkkk...',
    '..kbbbbttbbbbk..',
    '.kbBBBBttBBBBbk.',
    'kkkkkkkttkkkkkkk',
    'kccccccttcccccdk',
    'kcCCyyyyyyCCccdk',
    'kcCyykkkkyyCccdk',
    'kcCkkCCCCkyyccdk',
    'kcCCCCCCyykCccdk',
    'kcCCCCCyykCCccdk',
    'kcCCCCyykCCCccdk',
    'kcCCCCkkCCCCccdk',
    'kcCCCCyyCCCCccdk',
    'kcCCCCkkCCCCcddk',
    'kkkkkkkkkkkkkkkk',
  ];
  const pal = { k: '#2a1a14', b: '#e2b070', B: '#f0c890', t: '#d9453b', c: '#c88a4c', C: '#d89a5a', d: '#a86a34', y: '#ffd23f' };
  const s = 4, c = document.createElement('canvas');
  c.width = 16 * s; c.height = 16 * s;
  const g = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x * s, y * s, s, s); } }));
  MYST = c.toDataURL();
  return MYST;
}
