// e-Buy: the in-game shop, a goofy parody of a 1999 web shop running on
// Reynard's old pixel laptop (a pixel phone on narrow screens). It boots with a
// logo splash + a loading bar full of lies, then shows departments, search,
// filters, item cards with real item art, a detail page with mutation effects,
// a cart drawer with checkout + delivery ETA, order tracking and a printed
// receipt. Closing powers the screen off and folds the laptop shut.
//
//   const shop = openEBuy(root, { listings, coins, icon, sfx, onBuy, onClose, focus?, orders?, ship?, onTrack? })
//   shop.refresh({ coins, listings })   // either field optional
//   shop.close()                        // closes at once (plays the power-off animation on a detached
//                                       // ghost so the caller may remove `root` right away; no onClose)
//   shop.el                             // the overlay element (absolute, fills root)
//
// listing: { id, cat: 'eggs'|'food'|'farm'|'plants'|'decor'|'restaurant'|'gear'|..., title, sub?, price,
//   oldPrice?, rarity?, mutation?: { id, name, color, mult }, image: HTMLCanvasElement | dataURL string,
//   badges?: ['hot','new','last','sale','inseason'], seller?: { name, stars, sold }, stock?, eta?: string,
//   kind?, qty?, locked?: { reason, icon } }
// onBuy(listing, qty) -> boolean | Promise<boolean>   (false = can't afford/failed: the button shakes)
//   The cart's checkout calls onBuy once per cart line.
// icon(name, scale) -> '<img ...>' HTML (e.g. spriteImg). sfx(name) -> plays a sound.
// onClose() is called after the player closes the shop (back at the top level, ✕ or Esc).
// focus: a listing id to open straight away (the tutorial points at its Buy It Now button, `.eb-buy`).
// orders() -> [{ id, label, phase: 'packing'|'riding'|'arriving'|'delivered', eta, progress, count }]
//   (Delivery.tracker()) feeds the Orders drawer and the badge; onTrack(id) = "watch the moose".
// ship() -> { ride: seconds, night: bool } for the cart's delivery estimate.
// [v33 kit] optional extras:
//   onBuy(listing, qty, extra)   extra = { ship: 'std'|'turbo'|'rocket', gift, note, linger } (the delivery choice)
//   onCharge(amount) -> bool     delivery fees / gift wrap (amount > 0) and coupons / club rewards / deal cash back (< 0)
//   store                        a persistent object (saved with the game): the e-Buy Club stamp card, coupons won + used
//   shipTiers                    { std|turbo|rocket: { mult, pack } } the courier's speed per tier (Delivery.SHIP)
// Ads: banners between card rows, a TAP THE FISH skyscraper, one pop-up per session (its X runs away once);
// extras: deal of the day (countdown, 10% back), Moose Express tiers, coupon codes, gift wrap + a note for the
// moose, the Club stamp card (10 orders = a free item), a Mystery Box, "customers also bought", confetti.
//
// The boot splash plays once per page session (shorter when opened on a focus listing); later
// opens skip it. Tap / any key skips it. The cart survives closing the shop.
//
// `root` should be a positioned element with a size; the shop fills it.
import './ebuy.css';
import { px } from './ebuyPx.js';
import { adBanner, adSky, adPopup, adUnder, BANNERS, COUPONS, mysteryArt } from './kit/ebuyAds.js'; // [v33 kit] ads, coupons, the mystery box
import { stkHTML, STK, BEZEL } from './kit/ebuyStickers.js'; // [v33 kit] the sticker bomb

// ---------------------------------------------------------------- helpers
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => Math.round(+n || 0).toLocaleString('en-US');
const fmtK = (n) => {
  n = +n || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(Math.round(n));
};
function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)), (s >>> 0) / 4294967296);
}
function hexRgb(h) {
  let s = String(h || '#ccc').replace('#', '');
  if (s.length < 6) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mixHex = (a, b, t) => {
  const A = hexRgb(a), B = hexRgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

// [v33 kit] the item art's own pixel size (its texel: the gcd of its colour runs), so it can be shown at a whole
// number of CSS px per art pixel: crisp, never the uneven 66%-of-the-box scaling
const TEXEL = new Map();
function texelOf(img) {
  const src = img.currentSrc || img.src;
  if (TEXEL.has(src)) return TEXEL.get(src);
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) return 0;
  let t = 1;
  try {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = new Uint32Array(g.getImageData(0, 0, w, h).data.buffer);
    for (let i = 0; i < d.length; i++) if ((d[i] >>> 24) < 8) d[i] = 0;
    const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
    let q = 0;
    rows: for (let y = 0; y < h; y++) {
      let run = 1;
      for (let x = 1; x < w; x++) { if (d[y * w + x] === d[y * w + x - 1]) run++; else { q = gcd(q, run); run = 1; if (q === 1) break rows; } }
      q = gcd(q, run);
      if (q === 1) break;
    }
    if (q > 1) cols: for (let x = 0; x < w; x++) {
      let run = 1;
      for (let y = 1; y < h; y++) { if (d[y * w + x] === d[(y - 1) * w + x]) run++; else { q = gcd(q, run); run = 1; if (q === 1) break cols; } }
      q = gcd(q, run);
      if (q === 1) break;
    }
    t = Math.max(1, q || 1);
  } catch { t = 1; }
  TEXEL.set(src, t);
  return t;
}

// image -> URL (canvases are converted once and cached)
const imgCache = new WeakMap();
function imgSrc(image) {
  if (!image) return '';
  if (typeof image === 'string') return image;
  if (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) {
    let u = imgCache.get(image);
    if (!u) { try { u = image.toDataURL(); } catch { u = ''; } imgCache.set(image, u); }
    return u;
  }
  return image.src || '';
}

// ---------------------------------------------------------------- data
const CATS = [ // [v33 kit] dpx: the shop's own detailed 16x16 department icons
  { id: 'eggs', name: 'Fish & Eggs', icon: 'egg', dpx: 'd_eggs' },
  { id: 'food', name: 'Fish Food', icon: 'food', dpx: 'd_food' },
  { id: 'farm', name: 'Farm', icon: 'bug', dpx: 'd_farm' },
  { id: 'plants', name: 'Plants', icon: 'berry', dpx: 'd_plants' },
  { id: 'decor', name: 'Decor', icon: 'gnome', dpx: 'd_decor' },
  { id: 'restaurant', name: 'Restaurant', icon: 'chair', dpx: 'd_restaurant' },
  { id: 'gear', name: 'Gear', icon: 'shovel', dpx: 'd_gear' },
];
const RAR = {
  common: { n: 'Common', c: '#a89e86', g: '#ffffff', t: 1 },
  uncommon: { n: 'Uncommon', c: '#6cc04a', g: '#b8ff90', t: 2 },
  rare: { n: 'Rare', c: '#3c8ce0', g: '#9ad4ff', t: 3 },
  epic: { n: 'Epic', c: '#a050e0', g: '#e0a8ff', t: 4 },
  legendary: { n: 'Legendary', c: '#ffb020', g: '#fff0a0', t: 5 },
};
const MUT_ICON = { titan: 'titan', candy: 'candy', hot: 'flame', doublehot: 'flame', doge: 'doge', frozen: 'snow', shiny: 'shiny', rainbow: 'rainbow', zombie: 'skull', galaxy: 'planet', tiny: 'tiny' };
const mutKey = (m) => String(m?.id || m?.name || '').toLowerCase().replace(/[^a-z]/g, '');
const BADGES = {
  hot: { t: 'HOT', ic: 'flame' },
  new: { t: 'NEW', ic: 'spark' },
  last: { t: 'LAST ONE!!', ic: null },
  sale: { t: 'SALE', ic: null },
  inseason: { t: 'IN SEASON', ic: 'sprout' }, // [v26 seasons] spawning-season eggs (15% off)
};
const BADGE_ORDER = ['inseason', 'hot', 'sale', 'last', 'new'];
const REVIEWS = {
  eggs: ['10/10 egg would buy again', 'it hatched. i cried.', 'egg arrived as egg. 5 stars', 'my son is now a fish', 'smells like profit', 'wow. just wow.'],
  food: ['fish ate it. fish ate ME', 'crunchy. the fish say so', 'bag was 40% air. still good', 'smells like the ocean (bad)'],
  farm: ['duck arrived. duck is judging me', 'HONK HONK HONK (5 stars)', 'worms were very worm', 'my geese now run the pond', 'quack.'],
  plants: ['bush is very bush', 'ate it. no regrets', 'grew 2 berries & a dream', 'leafy. green. 10/10'],
  decor: ['my pond is now *aesthetic*', 'gnome stares at me. love it', 'bears said "nice". high praise'],
  restaurant: ['bears sat on it. it held', 'fancy!! like a real restaurant', 'chair 10/10 would sit'],
  gear: ['tool did tool things', 'very sturdy. hit a bear w/ it (sorry)', 'works great, no refunds tho'],
};
const NAMES = ['Gerald B.', 'Linda (bear)', 'Big Doug', 'xX_moose_Xx', 'Mrs. Beaver', 'Kevin', 'Brenda from HR', 'Chad Salmon', 'Deb'];
const TICKER = ['FREE MOOSE SHIPPING', 'ALL SALES FINAL', '0% REFUNDS', 'TRUSTED SELLER (me)', 'DEALS DEALS DEALS', 'NOT A SCAM', 'PRICES SLASHED (then raised)', 'eh?', 'NEW: TURBO MOOSE', 'COUPON CODES HIDDEN EVERYWHERE', 'THE PASSWORD IS NOT A COUPON (or is it)', 'MYSTERY BOXES!!!'];
// [v33 kit] delivery tiers: the fee and the joke here; the real speed comes from Delivery.SHIP (opts.shipTiers)
const SHIPS = [
  { id: 'std', n: 'Moose Express', sub: 'FREE · he walks the bike up the hills', fee: 0, ic: 'van' },
  { id: 'turbo', n: 'TURBO Moose', sub: 'pedals like his rent is due', fee: 12, ic: 'flame' },
  { id: 'rocket', n: 'ROCKET Moose', sub: 'a rocket. on a bike. not legal.', fee: 40, ic: 'rocket' },
];
const SHIP_DEF = { std: { mult: 1, pack: 1 }, turbo: { mult: 2.2, pack: 0.45 }, rocket: { mult: 3.4, pack: 0.12 } };
const GIFT_FEE = 3;
const CLUB_N = 10; // stamps on the e-Buy Club card; a full card = the next order's cheapest item free
const DEAL_BACK = 0.1; // the deal of the day: 10% back
const MYSTERY_PRICE = 35;
const ZIGZAG = (() => {
  const n = 22, pts = ['0 0', '100% 0'];
  for (let i = n; i >= 0; i--) pts.push(`${((i / n) * 100).toFixed(2)}% ${i % 2 ? '100%' : 'calc(100% - 7px)'}`);
  return `polygon(${pts.join(',')})`;
})();
const DOGE = ['wow', 'such egg', 'much rare', 'very buy', 'amaze', 'so fish'];
const BOOT_LINES = [
  'Waking up the moose...', 'Counting your coins (twice)...', 'Inflating original prices...', 'Hiding the refund button...',
  'Polishing eggs...', 'Bribing the search engine...', 'Deleting bad reviews...', 'Untangling antlers...',
  'Dialing up. Please hold...', 'Warming up Buy It Now...', 'Removing the word "used"...', 'Teaching gnomes to smile...',
];
const SORTS = [
  { id: 'best', n: 'Best match' },
  { id: 'low', n: 'Price: low' },
  { id: 'high', n: 'Price: high' },
  { id: 'deal', n: 'Biggest deal' },
];
const FILTERS = [
  { id: 'season', n: 'In season', ic: 'sprout' },
  { id: 'afford', n: 'I can afford', ic: 'coinp' },
  { id: 'locked', n: 'Hide locked', ic: 'lockpad' },
];
const PHASE = { packing: 'Packing...', riding: 'On the road', arriving: 'Almost there!', delivered: 'Delivered!' };
const PHASES = ['packing', 'riding', 'arriving', 'delivered'];

// session memory: the splash plays once per page session, the cart and the
// browsing choices survive closing the shop
const SESSION = { booted: false, cart: [], cat: null, sort: 'best', f: { season: false, afford: false, locked: false },
  ship: 'std', gift: false, note: '', coupon: null, adsOff: {}, popDone: false, store: {} }; // [v33 kit]

// ---------------------------------------------------------------- component
export function openEBuy(root, opts = {}) {
  const shop = new EBuy(root, opts);
  return { refresh: (o) => shop.refresh(o), close: () => shop.close(), el: shop.el, _shop: shop }; // [v33 kit] _shop: dev / tests
}

class EBuy {
  constructor(root, o) {
    this.root = root;
    this.o = o;
    // listings may be a function: then the catalogue (and its item art) is built
    // behind the loading screen instead of before anything shows up
    this._listFn = typeof o.listings === 'function' ? o.listings : null;
    this.listings = Array.isArray(o.listings) ? this._withExtras(o.listings) : [];
    this.coins = +o.coins || 0;
    this.shownCoins = this.coins;
    // [v33 kit] the Club card + coupons live in the save (opts.store); delivery tier speeds from the game
    this.store = o.store || SESSION.store;
    this.store.stamps = +this.store.stamps || 0;
    this.store.used ||= {};
    this.store.won ||= [];
    this.tiers = { ...SHIP_DEF, ...(o.shipTiers || {}) };
    this._A = { icon: (n, sc) => this._icon(n, sc), px, coin: (sc) => this._coin(sc) };
    if (o.focus) SESSION.ship = 'std'; // the tutorial's Buy It Now is always the free moose
    const mode = SESSION.booted ? 'quick' : o.focus ? 'short' : 'full';
    // repeat opens: the art is cached by now (cheap). A focus open (the tutorial) needs its
    // Buy It Now on the page straight away, so it builds up front too.
    if (mode !== 'full') this._loadListings();
    this.cat = this._startCat();
    this.q = '';
    this.cur = null; // id of the open listing
    this.qty = 1;
    this.busy = false;
    this.dead = false;
    this.drawer = null; // 'cart' | 'checkout' | 'orders'
    this.booted = false;
    this._timers = new Set();
    this._build();
    if (mode === 'quick') this.$boot.remove();
    this._applyFocus();
    this._boot(mode);
    SESSION.booted = true;
    if (o.orders) {
      this._ordI = setInterval(() => this._pollOrders(), 500);
      this._pollOrders();
    }
    // [v33 kit] the sidebar's TAP THE FISH game, the deal clock, one pop-up ad a session (never on the tutorial's focus open)
    this._skyI = setInterval(() => this._skyStep(), 280);
    this._cdI = setInterval(() => this._tickDeal(), 1000);
    if (!o.focus && !SESSION.popDone) this._later(() => this._maybePopup(), 24000);
  }

  _loadListings() {
    const fn = this._listFn;
    if (!fn) return;
    this._listFn = null;
    let L = [];
    try { L = fn() || []; } catch (err) { console.error(err); }
    this.listings = this._withExtras(Array.isArray(L) ? L : []);
    if (!this.el || this.dead) return; // still in the constructor
    this.cat = this._startCat();
    this._render();
    this._renderCartCount();
    this._applyFocus();
  }
  // open straight onto one listing (the tutorial points you at its Buy It Now)
  _applyFocus() {
    const f = this.o.focus && !this._focused ? this._byId(this.o.focus) : null;
    if (!f) return;
    this._focused = true;
    this.cat = f.cat;
    this._render();
    this._openDetail(f, true);
  }

  // ------------------------------------------------------------ [v33 kit] extras: the Mystery Box, the deal of the day
  _withExtras(L) {
    if (L.some((l) => l.mystery)) return L;
    return [...L, {
      id: 'mystery_box', cat: 'gear', kind: 'mystery', mystery: true, title: 'MYSTERY BOX ??? could be ANYTHING (even good stuff)',
      sub: 'Mystery Box', desc: 'A random thing from the shelves. Sometimes worth 3x. Sometimes... a bag of pellets.',
      price: MYSTERY_PRICE, oldPrice: 99, badges: ['hot', 'new'], seller: { name: 'definitely_not_reynard', stars: 3.5, sold: 666 }, image: mysteryArt(),
    }];
  }
  // the deepest cut you can actually buy (a different one each day)
  _deal() {
    const open = this.listings.filter((l) => !l.locked && l.stock !== 0 && !l.mystery && this._pct(l) > 0);
    if (!open.length) return null;
    const top = open.sort((a, b) => this._pct(b) - this._pct(a)).slice(0, 4);
    const d = new Date();
    return top[hash(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`) % top.length];
  }
  _countdown() {
    const d = new Date(), end = new Date(d); end.setHours(24, 0, 0, 0);
    let t = Math.max(0, Math.floor((end - d) / 1000));
    const hh = String(Math.floor(t / 3600)).padStart(2, '0'); t %= 3600;
    return `${hh}:${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }
  _tickDeal() {
    if (this.dead) return;
    const txt = this._countdown();
    for (const e of this.el.querySelectorAll('.eb-cd')) e.textContent = txt;
  }
  _dealCard(l) {
    const pct = this._pct(l);
    return `<button class="eb-deal" data-deal="${esc(l.id)}" style="${this._rarVars(l)}">${stkHTML('tapeC', { cls: 'stk-dt' })}
      <span class="dl-kick">${px('flame', 2)}DEAL OF THE DAY${px('flame', 2)}</span>
      <span class="dl-pic"><img class="eb-img" src="${esc(imgSrc(l.image))}" alt="" draggable="false" />${l.cat === 'eggs' && l.kind !== 'fish' ? `<span class="eb-eggm">${this._eggIcon(l, 2)}</span>` : ''}<i class="dl-ped"></i></span>
      <span class="dl-info">
        <b class="dl-t">${esc(this._short(l))}</b>
        <span class="dl-p"><span class="eb-tag">${this._coin(1)}<b>${fmt(l.price)}</b></span><s class="eb-old">${fmt(l.oldPrice)}</s><em class="dl-pct">-${pct}%</em></span>
        <span class="dl-back">+10% back in coins today</span>
        <span class="dl-clock">${px('clock', 2)}ends in <b class="eb-cd">${this._countdown()}</b></span>
      </span>
      <span class="eb-burst"><b>-${pct}%</b></span>
    </button>`;
  }
  _cols() {
    try {
      const n = getComputedStyle(this.$grid).gridTemplateColumns.split(' ').filter((x) => x && x !== 'none').length;
      return Math.max(1, n || 4);
    } catch { return 4; }
  }
  // the banners rotate per department; closed ones stay closed for the session
  _banners(n) {
    const pool = BANNERS.filter((b) => !SESSION.adsOff[b]);
    if (!pool.length) return [];
    const o = hash(this.cat || 'q') % pool.length;
    return Array.from({ length: n }, (_, i) => pool[(o + i) % pool.length]).filter((b, i, a) => a.indexOf(b) === i);
  }

  // ------------------------------------------------------------ utils
  _icon(name, s = 2) { try { return this.o.icon ? String(this.o.icon(name, s) || '') : ''; } catch { return ''; } }
  _sfx(name) { try { this.o.sfx?.(name); } catch { /* ignore */ } }
  _later(fn, ms) {
    const t = setTimeout(() => { this._timers.delete(t); if (!this.dead) fn(); }, ms);
    this._timers.add(t);
    return t;
  }
  _cats() {
    const out = CATS.filter((c) => this.listings.some((l) => l.cat === c.id));
    for (const l of this.listings) {
      if (l.cat && !out.some((c) => c.id === l.cat) && !CATS.some((c) => c.id === l.cat)) out.push({ id: l.cat, name: l.cat[0].toUpperCase() + l.cat.slice(1), icon: 'tag' });
    }
    return out.length ? out : CATS.slice(0, 1);
  }
  _catName(id) { return (CATS.find((c) => c.id === id) || { name: id ? id[0].toUpperCase() + id.slice(1) : '' }).name; }
  _startCat() {
    if (SESSION.cat && this.listings.some((l) => l.cat === SESSION.cat)) return SESSION.cat;
    return this._cats()[0].id;
  }
  _byId(id) { return this.listings.find((l) => String(l.id) === String(id)); }
  _pct(l) { return l.oldPrice > l.price ? Math.round((1 - l.price / l.oldPrice) * 100) : 0; }
  _maxQ(l) { return l.stock > 0 ? Math.min(99, l.stock) : 99; }
  _bump(node, cls = 'bump') { if (!node) return; node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }
  _coin(s = 1) { return this._icon('coin', s) || px('coinp', s * 2); }

  // ------------------------------------------------------------ build
  _build() {
    const el = (this.el = document.createElement('div'));
    el.className = 'ebuy';
    const ticker = TICKER.map((t) => `<span>${esc(t)}</span>${px('spark', 2)}`).join('');
    const logo = (cls) => `<span class="${cls}" aria-label="e-Buy"><span class="l1">e</span><span class="l2">-</span><span class="l3">B</span><span class="l4">u</span><span class="l5">y<i class="eb-antler">${px('antler', 3)}</i></span></span>`;
    el.innerHTML = `
      <div class="eb-dev">
        <div class="eb-bezel">
          <i class="eb-cam"></i>
          <div class="eb-stks"></div>
          <div class="eb-note" aria-label="sticky note: pw money123"></div>
          <div class="eb-screen">
            <div class="eb-app">
              <div class="eb-chrome">
                <button class="eb-nb eb-back" aria-label="back">${px('arrow', 2)}</button>
                <button class="eb-nb eb-fwd" tabindex="-1" aria-hidden="true">${px('arrowR', 2)}</button>
                <button class="eb-nb eb-reload" aria-label="reload">${px('reload', 3)}</button>
                <div class="eb-url"><span class="eb-lock">${px('lockpad', 2)}</span><span class="eb-urlt">www.e-buy.ca<i class="eb-path">/</i></span>${px('starbm', 2, 'eb-bm')}</div>
                <div class="eb-dots"><i></i><i></i><button class="eb-close eb-dclose" aria-label="close">${px('x', 2)}</button></div>
              </div>
              <header class="eb-top">
                <button class="eb-hb eb-back eb-hback" aria-label="back">${px('arrow', 2, 'eb-ia')}${px('x', 3, 'eb-ix')}</button>
                <button class="eb-home" aria-label="e-Buy home">${logo('eb-logo')}</button>
                <label class="eb-search">${px('mag14', 2)}<input class="eb-q" type="text" placeholder="Search eggs, ducks, gnomes..." autocomplete="off" spellcheck="false" enterkeyhint="search" /><button class="eb-qx" aria-label="clear">${px('x', 2)}</button><span class="eb-sgo">Search</span></label>
                <div class="eb-wallet" title="your coins"><span class="eb-coin">${this._coin(2)}</span><b class="eb-bal">${fmt(this.coins)}</b></div>
                ${this.o.orders ? `<button class="eb-hb eb-ordb" aria-label="my orders">${px('box16', 2)}<span class="eb-hbt">Orders</span><i class="eb-ordn"></i></button>` : ''}
                <button class="eb-hb eb-cart" aria-label="cart">${px('cart16', 2)}<span class="eb-hbt">Cart</span><i class="eb-cartn"></i></button>
              </header>
              <div class="eb-ticker"><div class="eb-tick">${ticker}${ticker}</div></div>
              <div class="eb-body">
                <nav class="eb-side">
                  <b class="eb-sideh">Departments</b>
                  <div class="eb-cats"></div>
                  ${adSky(this._A)}
                  <div class="eb-promo">
                    <span class="eb-pmoose">${px('moosec', 2)}</span>
                    <b>FREE Moose Express</b>
                    <span>on every order. He insists.</span>
                    ${this.o.orders ? `<button class="eb-ptrack">${px('box', 2)}<span>Track my orders</span></button>` : ''}
                  </div>
                </nav>
                <main class="eb-main">
                  <div class="eb-bar">
                    <div class="eb-crumb"><b class="eb-h"></b><span class="eb-n"></span></div>
                    <div class="eb-filt"></div>
                  </div>
                  <div class="eb-scroll"><div class="eb-grid"></div><div class="eb-foot">© 1999 e-Buy Inc. · a Reynard company · all sales final</div></div>
                  <div class="eb-det" hidden></div>
                  <div class="eb-popwrap"></div>
                </main>
              </div>
              <div class="eb-shade"></div>
              <aside class="eb-drawer" aria-hidden="true"></aside>
              <div class="eb-rc" hidden></div>
              <div class="eb-fx"></div>
            </div>
            <div class="eb-boot">
              <div class="eb-bootc">
                ${logo('eb-blogo')}
                <div class="eb-btag">the pond's #1 marketplace*</div>
                <div class="eb-bbar"><i class="eb-bfill"></i></div>
                <div class="eb-bline">Connecting...</div>
                <small class="eb-bfine">*only marketplace · coupon NOTASCAM</small>
              </div>
              <div class="eb-bskip">tap to skip</div>
            </div>
            <div class="eb-scan"></div>
          </div>
          <div class="eb-chin"><span class="eb-brand">REYNARD·TOP 3000</span><i class="eb-led"></i></div>
        </div>
        <div class="eb-base"><i></i></div>
      </div>`;
    this.root.appendChild(el);
    const $ = (s) => el.querySelector(s);
    this.$app = $('.eb-app');
    this.$cats = $('.eb-cats');
    this.$grid = $('.eb-grid');
    this.$scroll = $('.eb-scroll');
    this.$h = $('.eb-h');
    this.$n = $('.eb-n');
    this.$filt = $('.eb-filt');
    this.$det = $('.eb-det');
    this.$rc = $('.eb-rc');
    this.$fx = $('.eb-fx');
    this.$bal = $('.eb-bal');
    this.$wallet = $('.eb-wallet');
    this.$path = $('.eb-path');
    this.$q = $('.eb-q');
    this.$cart = $('.eb-cart');
    this.$cartn = $('.eb-cartn');
    this.$ordn = $('.eb-ordn');
    this.$drawer = $('.eb-drawer');
    this.$boot = $('.eb-boot');
    // [v33 kit] checkout inputs: the note for the moose, Enter applies a coupon
    this.$drawer.addEventListener('input', (e) => { if (e.target.classList?.contains('eb-notei')) SESSION.note = e.target.value; });
    this.$drawer.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList?.contains('eb-cpi')) { e.preventDefault(); this._applyCoupon(e.target.value); } });

    this._onClick = (e) => this._click(e);
    el.addEventListener('click', this._onClick);
    let lastHover = 0;
    el.addEventListener('pointerover', (e) => {
      const c = e.target.closest?.('.eb-card,.eb-cat,.eb-buy,.eb-add,.eb-qadd,.eb-pay,.eb-gocheck');
      if (!c || c.contains(e.relatedTarget)) return;
      const now = performance.now();
      if (now - lastHover > 70) { lastHover = now; this._sfx('hover'); }
    });
    let lastType = 0;
    this.$q.addEventListener('input', () => {
      this.q = this.$q.value.trim().toLowerCase();
      const now = performance.now();
      if (now - lastType > 80) { lastType = now; this._sfx('typing'); }
      if (this.cur) this._closeDetail(true);
      this._render(true);
      this.$scroll.scrollTop = 0;
    });
    this.$q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.$q.blur(); return; }
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (this.$q.value) { this.$q.value = ''; this.q = ''; this._render(true); } else this.$q.blur();
    });
    this._onKey = (e) => {
      if (this.dead) return;
      if (!this.booted) { this._finishBoot(); if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); } return; }
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation(); // the game's own Esc would close the whole shop
      this._back();
    };
    document.addEventListener('keydown', this._onKey);
    this._render();
    this._renderCartCount();
  }

  // ------------------------------------------------------------ open / close animation
  // The open animations (CSS keyed on .eb-go) and the splash timers start on the
  // first painted frame, so a slow first frame never eats the splash.
  _boot(mode) {
    const el = this.el;
    el.classList.add('eb-o-' + mode);
    let started = false;
    const go = () => {
      if (started || this.dead) return;
      started = true;
      el.classList.add('eb-go');
      this._startBoot(mode);
      this._later(() => this._fillBezel(), 30); // [v33 kit] the laptop's stickers, painted once the lid is moving
    };
    requestAnimationFrame(() => requestAnimationFrame(go));
    this._later(go, 300); // hidden tab: no frames
  }
  _startBoot(mode) {
    const el = this.el;
    if (mode === 'quick' || reduced()) {
      this._loadListings();
      this.$boot.remove();
      this.booted = true;
      el.classList.add('eb-ready', 'eb-ready-now');
      this._cascade();
      this._later(() => el.classList.remove('eb-o-' + mode, 'eb-ready-now'), 700);
      return;
    }
    if (this.booted) return; // skipped before the first frame
    this.$boot.addEventListener('pointerdown', (e) => { e.stopPropagation(); this._finishBoot(); });
    this._later(() => this._sfx('ebuy_boot'), 260);
    // the logo drops in first; the (one-off) catalogue build runs under it, then the bar
    if (this._listFn) this._later(() => { this._loadListings(); this._runSplash(mode); }, 60);
    else this._runSplash(mode);
  }
  _runSplash(mode) {
    if (this.booted || this.dead) return;
    this.$boot.classList.add('run');
    // whole open < 1.5 s: ~1 s of splash + a 0.3 s wipe (shorter on a tutorial focus open)
    const dur = mode === 'full' ? 940 : 620;
    this.$boot.style.setProperty('--bt', `${dur - 240}ms`);
    const pool = BOOT_LINES.slice();
    const lines = [];
    const n = mode === 'full' ? 3 : 2;
    for (let i = 0; i < n; i++) lines.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    lines.push('Ready. Spend!');
    const $line = this.$boot.querySelector('.eb-bline');
    lines.forEach((t, i) => this._later(() => {
      if (this.booted) return;
      $line.textContent = t;
      this._bump($line, 'bump');
      if (i) this._sfx('tick');
    }, 170 + (i * (dur - 240)) / lines.length));
    this._later(() => this._finishBoot(), dur);
  }
  _finishBoot() {
    if (this.booted || this.dead) return;
    this._loadListings();
    this.booted = true;
    this.el.classList.add('eb-ready');
    this.$boot.classList.add('out');
    this._cascade();
    this._later(() => { this.$boot.remove(); this.el.classList.remove('eb-o-full', 'eb-o-short'); }, 340);
  }

  _back() {
    if (!this.$rc.hidden && this.$rc.classList.contains('show')) return this._closeReceipt();
    if (this.drawer === 'checkout') return this._openDrawer('cart');
    if (this.drawer) return this._closeDrawer();
    if (this.cur) { this._sfx('page'); return this._closeDetail(); }
    if (this.q) { this.q = ''; this.$q.value = ''; this._sfx('click'); return this._render(true); }
    this._userClose();
  }
  _userClose() {
    if (this.dead) return;
    if (this.o.onClose) { try { this.o.onClose(); } catch (err) { console.error(err); } }
    if (!this.dead) { this._sfx('crt_off'); this.close(); }
  }
  // power off: the screen collapses to a line and a dot, the lid folds shut. The
  // element moves to a body-level ghost so the caller can drop its host at once.
  close() {
    if (this.dead) return;
    const el = this.el;
    this.destroy(true);
    if (!el.isConnected || reduced()) { el.remove(); return; }
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) { el.remove(); return; }
    const ghost = document.createElement('div');
    ghost.className = 'ebuy-ghost';
    ghost.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:45;pointer-events:none`;
    document.body.appendChild(ghost);
    ghost.appendChild(el);
    for (const n of el.querySelectorAll('[data-cat],[data-id]')) { n.removeAttribute('data-cat'); n.removeAttribute('data-id'); }
    el.classList.remove('eb-o-full', 'eb-o-short', 'eb-o-quick');
    el.classList.add('eb-go', 'eb-closing');
    setTimeout(() => ghost.remove(), 520);
  }
  destroy(keepEl = false) {
    if (this.dead) return;
    this.dead = true;
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    clearInterval(this._ordI);
    clearInterval(this._skyI);
    clearInterval(this._cdI);
    cancelAnimationFrame(this._coinRaf);
    document.removeEventListener('keydown', this._onKey);
    this.el.removeEventListener('click', this._onClick);
    if (!keepEl) this.el.remove();
  }

  // ------------------------------------------------------------ events
  _click(e) {
    const t = e.target;
    if (!this.booted) return this._finishBoot();
    // [v33 kit] a sticker (on the laptop, the item page, the cart, the club card) plays its gag
    const stkEl = t.closest('[data-stk]');
    if (stkEl && !stkEl.closest('.eb-card, .eb-deal')) { e.stopPropagation(); return this._stkGag(stkEl); }
    // [v33 kit] ads: close buttons first (the pop-up's runs away once), then the ads themselves
    const adx = t.closest('[data-adx]');
    if (adx) { e.stopPropagation(); return this._adClose(adx.dataset.adx, adx); }
    const ad = t.closest('[data-ad]');
    if (ad && ad.dataset.ad !== 'sky') return this._adClick(ad.dataset.ad, ad);
    const dealc = t.closest('.eb-deal');
    if (dealc) { const l = this._byId(dealc.dataset.deal); if (l) { this._sfx('ebuy_tok'); this._openDetail(l); } return; }
    const also = t.closest('[data-also]');
    if (also) { const l = this._byId(also.dataset.also); if (l) { this._sfx('page'); this._openDetail(l); this.$det.scrollTop = 0; } return; }
    if (t.closest('.eb-back')) return this._back();
    if (t.closest('.eb-close')) return this._userClose();
    if (t.closest('.eb-reload')) { this._sfx('click'); this._bump(this.el.querySelector('.eb-reload'), 'spin'); this._render(true); return; }
    if (t.closest('.eb-qx')) { e.preventDefault(); this.$q.value = ''; this.q = ''; this._sfx('click'); this._render(true); return; }
    if (t.closest('.eb-sgo')) { e.preventDefault(); this.$q.blur(); this._sfx('click'); return; }
    if (t.closest('.eb-home')) {
      this._sfx('click');
      this.q = ''; this.$q.value = '';
      if (this.drawer) this._closeDrawer();
      if (this.cur) this._closeDetail(true);
      this.cat = this._cats()[0].id; SESSION.cat = this.cat;
      this._render(true); this.$scroll.scrollTop = 0;
      return;
    }
    if (t.closest('.eb-cart')) return this.drawer === 'cart' ? this._closeDrawer() : this._openDrawer('cart');
    if (t.closest('.eb-ordb, .eb-ptrack')) return this.drawer === 'orders' ? this._closeDrawer() : this._openDrawer('orders');
    if (t.closest('.eb-shade')) return this._closeDrawer();
    // drawer
    if (this.drawer && t.closest('.eb-drawer')) return this._drawerClick(t);
    const cat = t.closest('.eb-cat');
    if (cat) {
      this._sfx('click');
      this.cat = cat.dataset.cat; SESSION.cat = this.cat;
      if (this.q) { this.q = ''; this.$q.value = ''; }
      if (this.cur) this._closeDetail(true);
      this._render(true);
      this.$scroll.scrollTop = 0;
      cat.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      return;
    }
    const chip = t.closest('.eb-chip');
    if (chip) { this._sfx('click'); SESSION.f[chip.dataset.f] = !SESSION.f[chip.dataset.f]; this._render(true); return; }
    if (t.closest('.eb-sortb')) {
      this._sfx('click');
      const i = SORTS.findIndex((s) => s.id === SESSION.sort);
      SESSION.sort = SORTS[(i + 1) % SORTS.length].id;
      this._render(true);
      return;
    }
    if (t.closest('.eb-unfilter')) { this._sfx('click'); SESSION.f = { season: false, afford: false, locked: false }; this.q = ''; this.$q.value = ''; this._render(true); return; }
    const qadd = t.closest('.eb-qadd');
    if (qadd) {
      const card = qadd.closest('.eb-card');
      const l = card && this._byId(card.dataset.id);
      if (l) this._addToCart(l, 1, card.querySelector('.eb-img'));
      return;
    }
    const card = t.closest('.eb-card');
    if (card) {
      const l = this._byId(card.dataset.id);
      if (!l) return;
      if (l.locked || l.stock === 0) {
        this._sfx('error');
        this._bump(card, 'eb-nope');
        return;
      }
      return this._openDetail(l);
    }
    const shipb = t.closest('.eb-shipb');
    if (shipb) return this._pickShip(shipb.dataset.ship, shipb);
    if (t.closest('.eb-minus')) return this._step(-1);
    if (t.closest('.eb-plus')) return this._step(1);
    if (t.closest('.eb-buy')) return this._buy();
    if (t.closest('.eb-add')) {
      const l = this._byId(this.cur);
      if (l) this._addToCart(l, this.qty, this.$det.querySelector('.eb-bigimg'));
      return;
    }
    if (t.closest('.eb-rc')) return this._closeReceipt();
  }

  // ------------------------------------------------------------ [v33 kit] item art at a whole pixel scale
  _fitImgs(root) {
    for (const im of root.querySelectorAll('img.eb-img, img.eb-bigimg')) {
      const go = () => this._fitImg(im);
      if (im.complete && im.naturalWidth) go(); else im.addEventListener('load', go, { once: true });
    }
  }
  _fitImg(im) {
    const box = im.closest('.eb-pic, .eb-well, .dl-pic');
    if (!box || this.dead) return;
    const W = box.clientWidth, H = box.clientHeight;
    if (!W || !H) return;
    const t = texelOf(im) || 1;
    const aw = im.naturalWidth / t, ah = im.naturalHeight / t;
    if (t === 1 && Math.max(aw, ah) > 48) return; // a painting, not pixel art: the CSS fit stays
    const big = im.classList.contains('eb-bigimg');
    const feat = !big && box.classList.contains('dl-pic'); // the deal of the day: a bigger showcase
    const fit = Math.min((W * (big ? 0.6 : 0.7)) / aw, (H * (big ? 0.6 : 0.66)) / ah);
    const k = Math.max(1, Math.min(big ? 6 : feat ? 4 : 3, Math.floor(fit)));
    im.style.width = `${aw * k}px`;
    im.style.height = `${ah * k}px`;
    im.classList.add('fit');
    // the little pedestal goes right under the art
    const ped = Math.round(H / 2 - (ah * k) / 2 - (big ? 12 : 8));
    box.style.setProperty('--pedb', `${Math.max(4, ped)}px`);
    box.style.setProperty('--pedw', `${Math.round(Math.min(W - 12, aw * k * 0.86 + 12))}px`);
  }

  // ------------------------------------------------------------ [v33 kit] ads
  // a coupon won from an ad goes into the coupon wallet (once, ever)
  _win(code) {
    if (!COUPONS[code] || this.store.won.includes(code) || this.store.used[code]) return false;
    this.store.won.push(code);
    return true;
  }
  // the ad flips to its punchline for a moment
  _adSay(el, html, ms = 2800) {
    const t = el.querySelector('.ad-txt') || el;
    if (el._orig == null) el._orig = t.innerHTML;
    t.innerHTML = html;
    this._bump(el, 'ad-hit');
    clearTimeout(el._sayT);
    el._sayT = this._later(() => { if (el.isConnected) t.innerHTML = el._orig; }, ms);
  }
  _adClick(id, el) {
    const code = (c, what) => `Coupon <u class="ad-code">${c}</u>: ${what}. Use it at checkout.`;
    switch (id) {
      case 'visitor': {
        const won = this._win('VISITOR');
        this._sfx(won ? 'coins' : 'error');
        this._adSay(el, won ? `<b class="ad-big">YOU WON!!! (really)</b><span>${code('VISITOR', '15 coins off')}</span>` : '<b class="ad-big">You already won.</b><span>Winning twice is greedy. Even for us.</span>');
        if (won) this._confetti(el, 18);
        return;
      }
      case 'bears': {
        const won = this._win('BEARHUG');
        this._sfx('growl');
        this._adSay(el, `<b class="ad-big">...they are not single.</b><span>They are HUNGRY. ${won ? code('BEARHUG', '10 coins off (sorry)') : 'Buy more fish.'}</span>`);
        return;
      }
      case 'doctors': { const d = this._deal(); this._sfx('ebuy_tok'); if (d) this._openDetail(d); else this._adSay(el, '<b class="ad-big">The trick: buy stuff.</b><span>Doctors are furious.</span>'); return; }
      case 'pond': {
        if (el.classList.contains('dl')) return;
        el.classList.add('dl');
        this._sfx('typing');
        this._later(() => {
          el.classList.remove('dl');
          const won = this._win('PONDEXE');
          this._sfx(won ? 'coins' : 'error');
          this._adSay(el, won ? `<b class="ad-big">ERROR: pond too big.</b><span>${code('PONDEXE', '8 coins off')}</span>` : '<b class="ad-big">ERROR: pond STILL too big.</b><span>Try the shovel. In the game.</span>', 3400);
        }, 1700);
        return;
      }
      case 'moose': {
        const won = this._win('MOOSE');
        SESSION.ship = 'turbo';
        this._sfx('bell');
        this._adSay(el, `<b class="ad-big">TURBO MOOSE: ON</b><span>${won ? code('MOOSE', 'your Turbo delivery is FREE') : 'Turbo is now picked for your next order. Vroom.'}</span>`);
        if (this.cur) { const l = this._byId(this.cur); if (l) this._renderDetail(l, true); }
        return;
      }
      case 'mystery': { const m = this._byId('mystery_box'); if (m) { this._sfx('ebuy_tok'); this._openDetail(m); } return; }
      case 'skyfish': return this._skyTap();
      case 'popyes': {
        this._sfx('pop_in');
        this._popClose(true);
        this.q = ''; this.$q.value = '';
        if (this.cur) this._closeDetail(true);
        this.cat = 'eggs'; SESSION.cat = 'eggs';
        this._render(true);
        this.$scroll.scrollTop = 0;
        this._toast('Hot single eggs, right here. (they are eggs)');
        return;
      }
      default:
    }
  }
  _adClose(id, btn) {
    if (id === 'popup') return this._popClose(false);
    SESSION.adsOff[id] = true;
    this._sfx('click');
    const row = btn.closest('.eb-adrow');
    if (row) { row.classList.add('ad-gone'); this._later(() => row.remove(), 260); }
  }
  // TAP THE FISH: the fish swims back and forth along the lane; tap while it's in the ring
  _skyStep() {
    const sky = this.el?.querySelector('.eb-sky');
    if (!sky || !sky.offsetParent || this.dead) return;
    this._skyP = ((this._skyP || 0) + 1) % 12;
    const pos = this._skyP < 7 ? this._skyP : 12 - this._skyP; // 0..6..0
    this._skyPos = pos;
    sky.style.setProperty('--fx', pos);
    sky.classList.toggle('hot', pos === 3);
  }
  _skyTap() {
    const sky = this.el.querySelector('.eb-sky');
    if (!sky) return;
    const msg = sky.querySelector('.sky-msg');
    if (this._skyPos === 3) {
      const won = this._win('FISHY');
      this._sfx(won ? 'coins' : 'tick');
      msg.innerHTML = won ? 'WINNER!! code <u class="ad-code">FISHY</u> = 15% off' : 'WINNER again! (no more prizes)';
      this._bump(sky, 'ad-hit');
      if (won) this._confetti(sky, 14);
    } else {
      this._sfx('error');
      msg.textContent = ['SO CLOSE!', 'MISS! try again', 'the fish dodged', 'nope!'][(Math.random() * 4) | 0];
      this._bump(sky, 'ad-miss');
    }
  }
  // one pop-up ad a session, only over the item grid (never over a Buy button)
  _maybePopup() {
    if (this.dead || SESSION.popDone) return;
    if (!this.booted || this.cur || this.drawer || !this.$rc.hidden || this.q) { this._later(() => this._maybePopup(), 8000); return; }
    SESSION.popDone = true;
    if (this.$app.clientHeight < 470 || this.$app.clientWidth < 660) return; // phones: no pop-ups (too much screen)
    const wrap = this.el.querySelector('.eb-popwrap');
    wrap.innerHTML = adPopup('lonely', this._A);
    this._popRan = false;
    const pop = wrap.firstElementChild;
    pop.style.setProperty('--px', '14%');
    pop.style.setProperty('--py', '10%');
    void pop.offsetWidth;
    pop.classList.add('on');
    this._sfx('beep');
  }
  _popClose(byYes) {
    const pop = this.el.querySelector('.eb-popad');
    if (!pop) return;
    if (!byYes && !this._popRan) {
      // the classic: the X runs away the first time
      this._popRan = true;
      pop.style.setProperty('--px', '46%');
      pop.style.setProperty('--py', '38%');
      pop.querySelector('.pop-h').textContent = 'Nice try!! Still lonely??';
      this._bump(pop, 'pop-dodge');
      this._sfx('whoosh');
      return;
    }
    pop.classList.remove('on');
    pop.classList.add('off');
    this._sfx(byYes ? 'click' : 'page');
    this._later(() => pop.remove(), 260);
  }
  _popHide() {
    const pop = this.el?.querySelector('.eb-popad');
    if (!pop) return;
    pop.classList.remove('on');
    pop.classList.add('off');
    this._later(() => pop.remove(), 260);
  }
  _toast(text) {
    const t = document.createElement('div');
    t.className = 'eb-toast';
    t.innerHTML = `${px('spark', 2)}<span>${esc(text)}</span>`;
    this.$fx.appendChild(t);
    this._later(() => t.remove(), 2600);
  }
  // paper confetti from an element (or the whole app)
  _confetti(fromEl, n = 30) {
    if (reduced()) return;
    const wr = this.$fx.getBoundingClientRect();
    const r = (fromEl || this.$app).getBoundingClientRect();
    const cols = ['#f0505a', '#ffc22e', '#3a7ae0', '#6cc04a', '#ff9a3a', '#ffffff', '#ff6aa8'];
    let h = '';
    for (let i = 0; i < n; i++) {
      const x = r.left - wr.left + Math.random() * r.width, y = r.top - wr.top + (fromEl ? r.height * 0.3 : 0);
      h += `<i class="eb-conf" style="left:${x | 0}px;top:${y | 0}px;background:${cols[i % cols.length]};--dx:${((Math.random() - 0.5) * 160) | 0}px;--dy:${(80 + Math.random() * 220) | 0}px;--r:${((Math.random() - 0.5) * 900) | 0}deg;animation-delay:${(Math.random() * 0.25).toFixed(2)}s;width:${4 + (i % 3) * 2}px;height:${4 + ((i + 1) % 2) * 4}px"></i>`;
    }
    const box = document.createElement('div');
    box.className = 'eb-burstfx';
    box.innerHTML = h;
    this.$fx.appendChild(box);
    this._later(() => box.remove(), 1700);
  }

  // ------------------------------------------------------------ refresh
  refresh({ coins, listings } = {}) {
    if (this.dead) return;
    if (Array.isArray(listings)) {
      this._listFn = null;
      this.listings = this._withExtras(listings);
      this._rerender();
      this._renderCartCount();
    }
    if (coins != null && +coins !== this.coins) this._setCoins(+coins);
    if (this.cur) {
      const l = this._byId(this.cur);
      if (!l) { if (this.$rc.hidden) this._closeDetail(true); }
      else if (Array.isArray(listings) && !this.busy) this._renderDetail(l, true);
      else this._updateTotal();
    }
    if (this.drawer && !this.busy) this._renderDrawer();
  }
  _setCoins(v) {
    const from = this.shownCoins, to = v, t0 = performance.now(), dur = 550;
    this.coins = v;
    this.$wallet.classList.remove('up', 'down');
    this._bump(this.$wallet, to < from ? 'down' : 'up');
    cancelAnimationFrame(this._coinRaf);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      this.shownCoins = Math.round(from + (to - from) * (1 - (1 - k) ** 3));
      this.$bal.textContent = fmt(this.shownCoins);
      if (k < 1 && !this.dead) this._coinRaf = requestAnimationFrame(step);
    };
    this._coinRaf = requestAnimationFrame(step);
    this._updateTotal();
    if (SESSION.f.afford) this._rerender();
  }

  // ------------------------------------------------------------ list
  _scope() {
    if (!this.q) return this.listings.filter((l) => l.cat === this.cat);
    const words = this.q.split(/\s+/).filter(Boolean);
    return this.listings.filter((l) => {
      const hay = [l.title, l.sub, l.cat, this._catName(l.cat), l.rarity, l.mutation?.name, l.seller?.name, ...(l.badges || []).map((b) => BADGES[b]?.t || b)].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }
  _filtered(scope = this._scope()) {
    let L = scope;
    const f = SESSION.f;
    if (f.season) L = L.filter((l) => l.badges?.includes('inseason'));
    if (f.afford) L = L.filter((l) => !l.locked && l.stock !== 0 && l.price <= this.coins);
    if (f.locked) L = L.filter((l) => !l.locked);
    const rank = (l) => (l.locked ? 2 : l.stock === 0 ? 1 : 0);
    const key = { low: (l) => l.price, high: (l) => -l.price, deal: (l) => -this._pct(l) }[SESSION.sort] || (() => 0);
    return L.map((l, i) => [l, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || key(a[0]) - key(b[0]) || a[1] - b[1]).map((x) => x[0]);
  }
  _render(anim = false) {
    this._renderCats();
    const scope = this._scope();
    const list = this._filtered(scope);
    // [v33 kit] the top sellers in view get a BEST SELLER sticker
    this._best = new Set(list.filter((l) => !l.locked && l.stock !== 0 && l.seller?.sold).sort((a, b) => b.seller.sold - a.seller.sold).slice(0, Math.max(1, Math.round(list.length / 9))).map((l) => l.id));
    // header + filters
    this.$h.textContent = this.q ? `“${this.q}”` : this._catName(this.cat);
    this.$n.textContent = `${list.length} result${list.length === 1 ? '' : 's'}${this.q ? ' in all departments' : ''}`;
    const seasonN = scope.filter((l) => l.badges?.includes('inseason')).length;
    const sort = SORTS.find((s) => s.id === SESSION.sort) || SORTS[0];
    this.$filt.innerHTML = FILTERS.filter((f) => f.id !== 'season' || seasonN || SESSION.f.season)
      .map((f) => `<button class="eb-chip${SESSION.f[f.id] ? ' on' : ''}" data-f="${f.id}" aria-pressed="${!!SESSION.f[f.id]}">${SESSION.f[f.id] ? px('check', 2) : px(f.ic, 2)}<span>${f.n}</span>${f.id === 'season' ? `<i>${seasonN}</i>` : ''}</button>`).join('')
      + `<button class="eb-sortb" title="sort">${px('sort', 2)}<span>${sort.n}</span></button>`;
    this.el.classList.toggle('eb-searching', !!this.q);
    if (!this.cur) this.$path.textContent = this.q ? '/sch?q=' + this.q.replace(/\s+/g, '+') : '/' + this.cat;
    // grid
    if (!list.length) {
      const filtered = scope.length > 0;
      this.$grid.innerHTML = `<div class="eb-empty">${this._icon('fox_worried', 3) || px('mag', 8)}<b>${filtered ? 'Nothing left after those filters' : '0 results'}</b><span>${filtered ? 'Reynard is losing money as we speak.' : 'Try “egg”, “duck” or “gnome”.'}</span><button class="eb-unfilter">${filtered ? 'Clear filters' : 'Clear search'}</button></div>`;
      return;
    }
    const inCart = new Map(SESSION.cart.map((c) => [String(c.id), c.qty]));
    // [v33 kit] the deal of the day up top, banner ads between card rows, UNDER CONSTRUCTION above the locked cards
    const cols = this._cols();
    const deal = !this.q ? this._deal() : null;
    const ads = this._banners(2);
    const out = [];
    if (deal) out.push(this._dealCard(deal));
    // the deal spans 2 columns (the whole row on a narrow shop), so the first row may already be full
    const dealSpan = !deal ? 0 : (this.el?.clientWidth || 999) <= 640 ? cols : Math.min(2, cols);
    let n = dealSpan % cols, adI = 0;
    const firstLocked = list.findIndex((l) => l.locked);
    list.forEach((l, i) => {
      if (i === firstLocked) { out.push(adUnder(this._A, list.length - firstLocked)); n = 0; }
      out.push(this._card(l, i, inCart.get(String(l.id)) || 0));
      n++;
      const lockedZone = firstLocked >= 0 && i >= firstLocked - 1;
      if (adI < ads.length && !lockedZone && n === cols * (adI === 0 ? 1 : 3)) { out.push(`<div class="eb-adrow">${adBanner(ads[adI++], this._A)}</div>`); n = 0; }
    });
    this.$grid.innerHTML = out.join('');
    this._fitImgs(this.$grid);
    if (anim) this._cascade();
  }
  _cascade() {
    if (!this.$grid) return;
    this.$grid.classList.remove('eb-anim');
    void this.$grid.offsetWidth;
    this.$grid.classList.add('eb-anim');
    clearTimeout(this._animT);
    this._animT = this._later(() => this.$grid.classList.remove('eb-anim'), 1000);
  }
  _rerender() {
    const st = this.$scroll.scrollTop;
    this._render();
    this.$scroll.scrollTop = st;
  }
  _renderCats() {
    const cats = this._cats();
    const html = cats.map((c) => {
      const all = this.listings.filter((l) => l.cat === c.id);
      const n = all.filter((l) => !l.locked).length;
      return `<button class="eb-cat${!this.q && c.id === this.cat ? ' on' : ''}" data-cat="${esc(c.id)}"><span class="eb-cati">${c.dpx ? px(c.dpx, 2) : this._icon(c.icon, 2) || px('d_tag', 2)}</span><span class="eb-catn">${esc(c.name)}</span><i class="eb-catc">${n || ''}</i></button>`;
    }).join('');
    if (html !== this._catsHtml) { this.$cats.innerHTML = html; this._catsHtml = html; }
  }
  _rarVars(l) {
    const r = RAR[l.rarity] || null;
    const c = r ? r.c : '#e2c992';
    return `--rc:${c};--rg:${r ? r.g : '#fff'};--rt1:${mixHex(c, '#fffaf0', 0.72)};--rt2:${mixHex(c, '#fffaf0', 0.58)};--rd:${mixHex(c, '#2a1a14', 0.45)}`;
  }
  _stars(n, s = 1) {
    n = Math.max(0, Math.min(5, +n || 0));
    let h = '';
    for (let i = 1; i <= 5; i++) {
      const nm = n >= i - 0.25 ? 'star' : n >= i - 0.75 ? 'star_half' : 'star_empty';
      h += this._icon(nm, s) || `<i class="eb-st ${nm}"></i>`;
    }
    return `<span class="eb-stars" title="${n.toFixed(1)} stars">${h}</span>`;
  }
  _mutChip(m, big = false) {
    if (!m) return '';
    const k = mutKey(m);
    const ic = k === 'doublehot' ? px('flame', big ? 3 : 2) + px('flame', big ? 3 : 2) : px(MUT_ICON[k] || 'spark', big ? 3 : 2);
    return `<span class="eb-mchip mu-${esc(k)}${big ? ' big' : ''}" style="--mc:${esc(m.color || '#ff6ad5')}">${ic}<b>${esc(m.name || m.id)}</b>${m.mult && big ? `<i>×${esc(m.mult)}</i>` : ''}${k === 'doge' ? '<u>wow</u>' : ''}</span>`;
  }
  _badges(l, max = 9) {
    return (l.badges || []).filter((b) => BADGES[b]).sort((a, b) => BADGE_ORDER.indexOf(a) - BADGE_ORDER.indexOf(b)).slice(0, max)
      .map((b) => `<span class="eb-bdg b-${b}">${BADGES[b].ic ? px(BADGES[b].ic, 2) : ''}${BADGES[b].t}</span>`).join('');
  }
  _eggIcon(l, s) { return this._icon(`egg_${RAR[l.rarity] ? l.rarity : 'common'}_0`, s) || this._icon('egg', s); }
  _stock(l) {
    if (l.locked) return '';
    if (l.stock === 0) return '<span class="eb-stock s-out">Sold out</span>';
    if (l.stock > 0 && l.stock <= 3) return `<span class="eb-stock s-low">Only ${l.stock} left!</span>`;
    if (l.stock > 3) return `<span class="eb-stock s-ok">${l.stock} in stock</span>`;
    if (l.badges?.includes('last')) return '<span class="eb-stock s-last">Last one!</span>';
    return '<span class="eb-stock s-ok">In stock</span>';
  }
  _card(l, i, inCart = 0) {
    const r = rng(hash(l.id));
    const m = l.mutation, mk = mutKey(m);
    const pct = this._pct(l);
    const soldout = l.stock === 0;
    const locked = l.locked;
    const poor = !locked && !soldout && l.price > this.coins;
    const rt = RAR[l.rarity]?.t || 1;
    const sp = rt >= 3 ? [0, 1, 2].map(() => `<i class="eb-tw" style="left:${8 + r() * 80}%;top:${8 + r() * 70}%;animation-delay:${(r() * 3).toFixed(2)}s">${px('spark', 2)}</i>`).join('') : '';
    const sel = l.seller;
    const cls = ['eb-card', locked && 'locked', soldout && 'soldout', mk && 'mu-' + mk, poor && 'poor', inCart && 'incart', l.badges?.includes('inseason') && 'inseason'].filter(Boolean).join(' ');
    return `<button class="${cls}" data-id="${esc(l.id)}" style="${this._rarVars(l)};--d:${(Math.min(i, 14) * 0.035).toFixed(3)}s;--bd:${(r() * 2).toFixed(2)}s">
      <span class="eb-pic">
        <img class="eb-img" src="${esc(imgSrc(l.image))}" alt="" draggable="false" />
        ${l.cat === 'eggs' && l.kind !== 'fish' ? `<span class="eb-eggm">${this._eggIcon(l, 2)}</span>` : ''}
        ${sp}<i class="eb-shine"></i>
        <span class="eb-bdgs">${locked ? '' : this._badges(l, 2)}</span>
        ${pct && !locked ? `<span class="eb-burst"><b>-${pct}%</b></span>` : ''}
        ${m ? `<span class="eb-mpos">${this._mutChip(m)}</span>` : ''}
        ${l.rarity && RAR[l.rarity] && !m ? `<span class="eb-rar">${RAR[l.rarity].n}</span>` : ''}
        ${locked ? `<span class="eb-lockov">${this._icon('lock', 3) || px('lockpad', 4)}</span>` : ''}
        ${soldout ? `<span class="eb-soldov">SOLD OUT</span>` : ''}
        ${inCart ? `<span class="eb-inc">${px('cartW', 2)}×${inCart}</span>` : ''}
        ${this._cardStk(l)}
      </span>
      <span class="eb-info">
        <span class="eb-title">${esc(l.title)}</span>
        ${locked ? `<span class="eb-hint">${locked.icon ? this._icon(locked.icon, 1) : ''}${px('lockpad', 1)}<span>${esc(locked.reason || 'locked')}</span></span>` : ''}
        <span class="eb-prow"><span class="eb-tag">${this._coin(1)}<b>${fmt(l.price)}</b></span>${l.oldPrice > l.price ? `<s class="eb-old">${fmt(l.oldPrice)}</s>` : ''}${locked || soldout ? '' : `<span class="eb-qadd" role="button" aria-label="add to cart" title="add to cart">${px('cart', 2)}<i>+</i></span>`}</span>
        <span class="eb-meta">${this._stock(l)}${sel?.sold != null ? `<span class="eb-sold">${fmtK(sel.sold)} sold</span>` : ''}</span>
        ${sel ? `<span class="eb-sel">${this._stars(sel.stars)}<span class="eb-seln">${esc(sel.name || '')}</span></span>` : ''}
      </span>
    </button>`;
  }

  // [v33 kit] a sticker slapped on the product photo, in its free bottom-left corner (never on the price,
  // the title or the badges): BEST SELLER on the top sellers, FRESH! on eggs, Reynard's seal on a few others
  _stkKinds(l) {
    if (l.locked || l.stock === 0) return [];
    const k = [];
    if (this._best?.has(l.id)) k.push('best');
    if (l.cat === 'eggs' && l.kind === 'egg') k.push('fresh');
    if (hash(String(l.id) + 'rey') % 4 === 0) k.push('picked');
    return k;
  }
  _cardStk(l) {
    const k = this._stkKinds(l)[0];
    if (!k) return '';
    // the top-left corner is free unless the HOT / NEW badges live there
    return stkHTML(k, { cls: 'stk-c ' + (this._badges(l, 2).trim() ? 'stk-cbl' : 'stk-ctl') });
  }
  // a sticker gets clicked: its sound, a little hop, its gag line, and the odd special (the fish flips, the
  // googly eyes spin, the smiley winks, the star throws sparks). Touch every laptop sticker for a coupon.
  _stkGag(el) {
    const id = el.dataset.stk, g = STK[id]?.gag;
    if (!g) return;
    this._sfx(g.sfx);
    if (g.sfx !== 'sticker') this._sfx('sticker');
    this._bump(el, 'hit');
    if (g.flip) el.classList.toggle('flip');
    if (g.spin) this._bump(el, 'spin');
    if (STK[id].wink) { el.classList.add('wink'); clearTimeout(el._wT); el._wT = this._later(() => el.classList.remove('wink'), 700); }
    const host = el.closest('.eb-app') ? this.$fx : el.parentElement;
    const r = el.getBoundingClientRect(), hr = host.getBoundingClientRect();
    const cx = Math.round(r.left - hr.left + r.width / 2), cy = Math.round(r.top - hr.top);
    if (g.sparks && !reduced()) {
      for (let i = 0; i < 6; i++) {
        const s = document.createElement('i');
        s.className = 'eb-stkspark';
        const a = (i / 6) * Math.PI * 2;
        s.style.cssText = `left:${cx}px;top:${cy + Math.round(r.height / 2)}px;--dx:${Math.round(Math.cos(a) * 26)}px;--dy:${Math.round(Math.sin(a) * 26)}px`;
        s.innerHTML = px(i % 2 ? 'sparkY' : 'spark', 2);
        host.appendChild(s);
        this._later(() => s.remove(), 600);
      }
    }
    const pop = document.createElement('span');
    pop.className = 'eb-stkpop';
    pop.textContent = g.say;
    pop.style.cssText = `left:${cx}px;top:${Math.max(28, cy)}px`;
    host.appendChild(pop);
    this._later(() => pop.remove(), 1500);
    // every sticker on the laptop touched once: a coupon
    if (el.closest('.eb-stks, .eb-note')) {
      (this._stkSeen ||= new Set()).add(id);
      const shown = [...this.el.querySelectorAll('.eb-stks [data-stk], .eb-note [data-stk]')].filter((x) => x.offsetWidth && !x.classList.contains('stk-tape'));
      if (shown.every((x) => this._stkSeen.has(x.dataset.stk)) && this._win('STICKY')) { this._sfx('coins'); this._toast('You touched every sticker. Coupon STICKY: 5% off'); }
    }
  }
  _fillBezel() {
    if (this._bezelOn || this.dead) return;
    this._bezelOn = true;
    const host = this.el.querySelector('.eb-stks');
    const pos = (b) => ['l', 't', 'r', 'b'].filter((k) => b[k] != null).map((k) => `${{ l: 'left', t: 'top', r: 'right', b: 'bottom' }[k]}:${b[k]}px`).join(';');
    if (host) host.innerHTML = '<i class="eb-screw s1"></i><i class="eb-screw s2"></i><i class="eb-screw s3"></i><i class="eb-screw s4"></i>'
      + BEZEL.map((b, i) => stkHTML(b.id, { cls: b.wide ? 'stk-wide' : '', style: `${pos(b)};z-index:${b.z || 1};--ad:${(i * 0.7) % 4}s` })).join('');
    this.el.querySelector('.eb-chin')?.insertAdjacentHTML('beforeend', '<i class="eb-grl"></i>');
    const note = this.el.querySelector('.eb-note');
    if (note) note.innerHTML = stkHTML('note', { cls: 'stk-note' });
    // the shop's own bits: a smiley on the cart, tape holding up the sidebar promo and the TAP THE FISH ad
    this.$cart?.insertAdjacentHTML('beforeend', stkHTML('smileyS', { cls: 'stk-cart' }));
    this.el.querySelector('.eb-promo')?.insertAdjacentHTML('afterbegin', stkHTML('tapeA', { cls: 'stk-tp' }));
    const sky = this.el.querySelector('.eb-sky');
    sky?.insertAdjacentHTML('afterbegin', stkHTML('tapeC', { cls: 'stk-tl' }) + stkHTML('tapeB', { cls: 'stk-tr' }));
  }

  // ------------------------------------------------------------ detail
  _openDetail(l, instant = false) {
    this._popHide(); // [v33 kit] the pop-up never sits over an item page
    if (!instant) this._sfx('page');
    this.cur = l.id;
    this.qty = 1;
    this._renderDetail(l);
    this.$det.hidden = false;
    this.$det.scrollTop = 0;
    this.$det.classList.remove('show');
    if (!instant) { void this.$det.offsetWidth; this.$det.classList.add('show'); }
    this.el.classList.add('eb-detail');
    this.$path.textContent = '/itm/' + String(l.id).replace(/[^\w-]/g, '').slice(0, 18);
  }
  _closeDetail(instant = false) {
    this.cur = null;
    this.el.classList.remove('eb-detail');
    this.$det.classList.remove('show');
    this.$det.hidden = true;
    this.$det.innerHTML = '';
    this._rerender();
    if (!instant) this.$path.textContent = '/' + this.cat;
  }
  _fx(k, r) {
    const n = (c, f) => Array.from({ length: c }, (_, i) => f(i)).join('');
    const pos = () => `left:${(r() * 92).toFixed(1)}%;top:${(r() * 88).toFixed(1)}%;animation-delay:${(-r() * 3).toFixed(2)}s`;
    switch (k) {
      case 'hot': return n(9, (i) => `<i class="fx-fl" style="left:${(i / 8) * 88 + 2}%;animation-delay:${(-r()).toFixed(2)}s;--s:${(0.7 + r() * 0.7).toFixed(2)}">${px('flame', 4)}</i>`);
      case 'doublehot': return n(14, (i) => `<i class="fx-fl" style="left:${(i / 13) * 90 + 1}%;animation-delay:${(-r()).toFixed(2)}s;--s:${(0.8 + r() * 0.9).toFixed(2)}">${px(i % 2 ? 'blueflame' : 'flame', 4)}</i>`);
      case 'candy': {
        const cols = ['#ff6aa8', '#ffffff', '#7ae0c0', '#ffe060', '#ff9ad0', '#9ad0ff'];
        return n(30, () => `<i class="fx-spr" style="left:${(r() * 96).toFixed(1)}%;background:${cols[(r() * cols.length) | 0]};animation-delay:${(-r() * 2.4).toFixed(2)}s;--rot:${(r() * 360) | 0}deg;animation-duration:${(1.8 + r() * 1.4).toFixed(2)}s"></i>`);
      }
      case 'doge': return n(7, () => `<i class="fx-tw" style="${pos()}">${px('sparkY', 3)}</i>`) + n(5, (i) => `<b class="fx-wow" style="${pos()};color:${['#ff4a8a', '#3a7ae0', '#2aa84a', '#a050e0', '#ff8a20'][i % 5]};animation-delay:${(i * 0.7).toFixed(1)}s">${DOGE[(r() * DOGE.length) | 0]}</b>`);
      case 'frozen': return `<i class="fx-icicles"></i><i class="fx-frost"></i>` + n(12, () => `<i class="fx-snow" style="left:${(r() * 94).toFixed(1)}%;animation-delay:${(-r() * 5).toFixed(2)}s;animation-duration:${(3.5 + r() * 3).toFixed(1)}s">${px('snow', 2)}</i>`);
      case 'galaxy': return n(34, () => `<i class="fx-star" style="${pos()};--z:${(1 + (r() * 3 | 0))}"></i>`) + n(4, () => `<i class="fx-tw" style="${pos()}">${px('sparkP', 3)}</i>`);
      case 'shiny': return n(8, () => `<i class="fx-tw" style="${pos()}">${px('spark', 3)}</i>`) + '<i class="fx-sweep"></i>';
      case 'zombie': return n(10, () => `<i class="fx-bub" style="left:${(r() * 90).toFixed(1)}%;animation-delay:${(-r() * 3).toFixed(2)}s"></i>`);
      case 'rainbow': return '<i class="fx-arc"></i>' + n(5, () => `<i class="fx-tw" style="${pos()}">${px('spark', 3)}</i>`);
      case 'titan': return n(6, () => `<i class="fx-dust" style="left:${(10 + r() * 80).toFixed(1)}%;animation-delay:${(-r() * 0.6).toFixed(2)}s"></i>`);
      case 'tiny': return '<b class="fx-smol">smol</b>';
      default: return n(4, () => `<i class="fx-tw" style="${pos()}">${px('spark', 3)}</i>`);
    }
  }
  _renderDetail(l, keepFx = false) {
    const r = rng(hash(l.id) ^ 0x9e37);
    const m = l.mutation, mk = mutKey(m);
    const rar = RAR[l.rarity];
    const pct = this._pct(l);
    this.qty = Math.max(1, Math.min(this._maxQ(l), this.qty));
    const pool = REVIEWS[l.cat] || REVIEWS.eggs;
    const i0 = (r() * pool.length) | 0, i1 = (i0 + 1 + ((r() * (pool.length - 1)) | 0)) % pool.length;
    const n0 = (r() * NAMES.length) | 0, n1 = (n0 + 1 + ((r() * (NAMES.length - 1)) | 0)) % NAMES.length;
    const reviews = [[pool[i0], NAMES[n0], 5], [pool[i1], NAMES[n1], 4]];
    const watching = 3 + ((r() * 40) | 0);
    const sel = l.seller;
    const prevFx = keepFx ? this.$det.querySelector('.eb-fxl') : null;
    const fxHtml = prevFx ? prevFx.innerHTML : this._fx(mk, r);
    const deal = this._deal();
    const isDeal = deal && deal.id === l.id;
    const specs = l.mystery ? [
      ['Contents', '??? (one random thing from the shelves)'],
      ['Odds', 'Sometimes worth 3x. Sometimes pellets.'],
      ['Seller', `<b class="eb-seln">${esc(l.seller.name)}</b> ${this._stars(l.seller.stars)}`],
      ['Ships from', 'Nobody knows'],
    ] : [
      ['Condition', l.kind === 'egg' ? 'Fresh (probably)' : l.kind === 'fish' || l.kind === 'bird' ? 'Alive. Very alive.' : 'New-ish'],
      rar && ['Rarity', `<span class="eb-gems">${'<i></i>'.repeat(rar.t)}</span> ${rar.n}`],
      m?.mult && ['Resale value', `${this._coin(1)} ×${esc(m.mult)}`],
      ['Stock', this._stock(l) || '-'],
      sel && ['Seller', `<b class="eb-seln">${esc(sel.name)}</b> ${this._stars(sel.stars)} <span class="eb-sold">${fmtK(sel.sold || 0)} sold</span>`],
      ['Ships from', "Reynard's Garage, aisle 3"],
    ].filter(Boolean);
    const inCart = SESSION.cart.find((c) => String(c.id) === String(l.id))?.qty || 0;
    this.$det.innerHTML = `
      <div class="eb-dwrap mu-${esc(mk)}" style="${this._rarVars(l)}">
        <div class="eb-dl">
          <div class="eb-well">
            <i class="eb-rays"></i><i class="eb-halo"></i>
            <img class="eb-bigimg" src="${esc(imgSrc(l.image))}" alt="" draggable="false" />
            ${l.cat === 'eggs' && l.kind !== 'fish' ? `<span class="eb-eggm big">${this._eggIcon(l, 4)}</span>` : ''}
            <div class="eb-fxl">${fxHtml}</div>
            ${pct ? `<span class="eb-burst big"><b>-${pct}%!!</b></span>` : ''}
            <span class="eb-bdgs">${this._badges(l)}</span>
            <span class="eb-watch">${px('eye', 2)}${watching} watching</span>
            ${isDeal ? `<span class="eb-dealtag">${px('flame', 2)}<b>DEAL OF THE DAY</b><span>10% back · ends in <b class="eb-cd">${this._countdown()}</b></span></span>` : ''}
            <i class="eb-ped"></i>
            ${this._stkKinds(l).filter((k) => k !== 'picked').map((k, i) => stkHTML(k, { cls: `stk-d stk-d${i}` })).join('')}
          </div>
          <div class="eb-revs"><b class="eb-revh">Buyer reviews</b>${reviews.map(([t, n, s]) => `<div class="eb-rev">${this._stars(s)}<q>${esc(t)}</q><cite>${esc(n)}</cite></div>`).join('')}</div>
        </div>
        <div class="eb-dr">
          <div class="eb-dcrumb">e-Buy <i>›</i> ${esc(this._catName(l.cat))}</div>
          <h2 class="eb-dt">${esc(l.title)}</h2>
          ${l.sub || l.desc ? `<div class="eb-dsub">${esc(l.sub || '')}${l.desc ? `<span>${esc(l.desc)}</span>` : ''}</div>` : ''}
          <div class="eb-chips">${rar ? `<span class="eb-rchip">${rar.n}</span>` : ''}${this._mutChip(m, true)}</div>
          <div class="eb-buybox">
            ${this._stkKinds(l).includes('picked') ? stkHTML('pickedBig', { cls: 'stk-bb', title: 'Hand-picked by Reynard' }) : ''}
            <div class="eb-dprice"><span class="eb-tag big">${this._coin(2)}<b>${fmt(l.price)}</b></span>${l.oldPrice > l.price ? `<span class="eb-was">was <s class="eb-old">${fmt(l.oldPrice)}</s>${pct ? ` <em>save ${pct}%</em>` : ''}</span>` : ''}</div>
            ${l.locked ? `<div class="eb-dlock">${px('lockpad', 2)}<span>${esc(l.locked.reason || 'Locked')}</span></div>` : ''}
            <div class="eb-qrow">
              <span class="eb-ql">Qty</span>
              <div class="eb-step"><button class="eb-minus" aria-label="less">−</button><b class="eb-qty">${this.qty}</b><button class="eb-plus" aria-label="more">+</button></div>
              <span class="eb-totl">Total <span class="eb-totv">${this._coin(1)}<b class="eb-tot2">${fmt(l.price * this.qty)}</b></span></span>
            </div>
            ${l.locked ? '' : this._shipPick('d')}
            <div class="eb-poor"></div>
            <button class="eb-buy"><span class="eb-buyt">Buy It Now</span><span class="eb-buyc">${this._coin(2)}<b class="eb-tot">${fmt(l.price * this.qty)}</b></span><i class="eb-buyx">${px('bigx', 5)}</i></button>
            <button class="eb-add">${px('cart', 2)}<span>Add to cart</span>${inCart ? `<i>${inCart} in cart</i>` : ''}</button>
            <div class="eb-ship">${px('van', 2)}<span><b class="eb-shipn"></b> · <span class="eb-shipf"></span> · <span class="eb-etad">${esc(this._etaText(this._eta([{ l, qty: this.qty }]), l.eta))}</span></span></div>
          </div>
          <table class="eb-specs"><tbody>${specs.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>
          ${this._alsoBought(l)}
        </div>
      </div>`;
    this._updateTotal();
    this._fitImgs(this.$det);
  }
  _step(d) {
    const l = this._byId(this.cur);
    if (!l) return;
    const q = Math.max(1, Math.min(this._maxQ(l), this.qty + d));
    const qe = this.$det.querySelector('.eb-qty');
    if (q === this.qty) { this._sfx('error'); qe?.classList.remove('bump'); this._bump(qe, 'nope'); return; }
    this.qty = q;
    this._sfx('tick');
    if (qe) { qe.textContent = q; qe.classList.remove('nope'); this._bump(qe, 'bump'); }
    this._updateTotal();
  }
  _updateTotal() {
    const l = this.cur && this._byId(this.cur);
    if (!l) return;
    const q = this._quote([{ l, qty: this.qty }], 'buy');
    const tot = q.gross; // [v33 kit] the item(s) + the delivery tier
    for (const te of this.$det.querySelectorAll('.eb-tot2')) te.textContent = fmt(l.price * this.qty);
    for (const te of this.$det.querySelectorAll('.eb-tot')) te.textContent = fmt(tot);
    const sn = this.$det.querySelector('.eb-shipn'), sf = this.$det.querySelector('.eb-shipf');
    if (sn) sn.textContent = q.tier.n;
    if (sf) sf.innerHTML = q.fee ? `${this._coin(1)}${q.fee}` : 'FREE';
    const poor = tot > this.coins;
    this.$det.querySelector('.eb-buy')?.classList.toggle('poor', poor);
    const pe = this.$det.querySelector('.eb-poor');
    if (pe) pe.innerHTML = poor && !l.locked ? `${this._icon('fox_worried', 1)}<span>You need ${this._coin(1)}<b>${fmt(tot - this.coins)}</b> more. Reynard accepts no IOUs.</span>` : '';
    const et = this.$det.querySelector('.eb-etad');
    if (et) et.textContent = this._etaText(this._eta([{ l, qty: this.qty }]), l.eta);
  }

  // ------------------------------------------------------------ delivery estimate
  _orders() { try { return (this.o.orders?.() || []).filter(Boolean); } catch { return []; } }
  _eta(lines, ship = SESSION.ship) {
    const T = this.tiers[ship] || this.tiers.std || { mult: 1, pack: 1 }; // [v33 kit]
    let info = null;
    try { info = this.o.ship?.() || null; } catch { info = null; }
    if (!info) return null;
    if (info.night) return { night: true };
    let n = 0, fragile = false;
    for (const x of lines) {
      const l = x.l;
      n += x.qty * (l.kind === 'fish' || l.pair ? 2 : l.qty || 1);
      if (l.kind === 'egg' || l.kind === 'fish' || l.kind === 'bird') fragile = true;
    }
    const pack = Math.min(30, 7 + n * 2.5 + (fragile ? 3 : 0) + 1.5) * (T.pack || 1);
    let wait = 0;
    for (const t of this._orders()) if (t.phase !== 'delivered' && t.eta > 0) wait = Math.max(wait, t.eta);
    return { s: Math.max(pack + (+info.ride || 20) / (T.mult || 1), wait + 4) };
  }
  _etaText(e, fallback = 'ships today') {
    if (!e) return fallback && fallback !== 'Moose Express' ? fallback : 'ships today';
    if (e.night) return 'rides at sunrise';
    const s = Math.max(10, Math.round(e.s / 5) * 5);
    return s < 90 ? `arrives in ~${s}s` : `arrives in ~${Math.round(s / 60)} min`;
  }

  // ------------------------------------------------------------ buying
  async _buy() {
    const l = this._byId(this.cur);
    if (!l || this.busy) return;
    const btn = this.$det.querySelector('.eb-buy');
    this.busy = true;
    btn.classList.add('press');
    this._sfx('click');
    let res = { ok: false };
    try { res = await this._purchase([{ l, qty: this.qty }], 'buy'); } catch (err) { console.error(err); }
    const ok = res.ok;
    if (this.dead) return;
    btn.classList.remove('press');
    if (!ok) {
      this.busy = false;
      this._sfx('error');
      this._bump(btn, 'shake');
      this.$wallet.classList.remove('up', 'down');
      this._bump(this.$wallet, 'nope');
      return;
    }
    this._sfx('buy');
    this._coinBurst(btn);
    this._confetti(null, 36);
    this._later(() => { this.busy = false; this._showReceipt(res); }, 520);
  }

  // ------------------------------------------------------------ [v33 kit] the money side of an order
  _cpn() { const c = SESSION.coupon; return c && COUPONS[c] && !this.store.used[c] ? COUPONS[c] : null; }
  // what an order costs: items + delivery tier + gift wrap, minus coupon / club freebie / the deal's 10% back
  _quote(lines, from = 'cart') {
    const ok = lines.filter((x) => !x.l.locked && x.l.stock !== 0);
    const tier = SHIPS.find((t) => t.id === SESSION.ship) || SHIPS[0];
    const cpn = this._cpn();
    const items = ok.reduce((s, x) => s + x.l.price * x.qty, 0);
    const fee = cpn?.ship === tier.id ? 0 : tier.fee;
    const gift = from === 'cart' && SESSION.gift ? GIFT_FEE : 0;
    const coupon = cpn && !cpn.ship ? (cpn.pct ? Math.round((items * cpn.pct) / 100) : Math.min(items, cpn.flat || 0)) : 0;
    const club = this.store.free && ok.length ? Math.min(100, ...ok.map((x) => x.l.price)) : 0;
    const d = this._deal();
    const deal = d ? ok.filter((x) => x.l.id === d.id).reduce((s, x) => s + Math.round(x.l.price * x.qty * DEAL_BACK), 0) : 0;
    const gross = items + fee + gift;
    return { ok, tier, cpn, items, fee, gift, coupon, club, deal, gross, total: Math.max(0, gross - coupon - club - deal) };
  }
  // the Mystery Box: something random off the shelves that fits the budget (now and then a jackpot)
  _mysteryPick(max) {
    const pool = this.listings.filter((l) => !l.locked && l.stock !== 0 && !l.mystery && l.kind !== 'upgrade' && l.price >= 6 && l.price <= max).sort((a, b) => a.price - b.price);
    if (!pool.length) return null;
    if (Math.random() < 0.3) return pool[Math.max(0, pool.length - 1 - ((Math.random() * Math.min(3, pool.length)) | 0))];
    return pool[(Math.random() * pool.length) | 0];
  }
  // place the order: each line through onBuy (with the delivery choice), then the fees / credits once
  async _purchase(lines, from) {
    const q = this._quote(lines, from);
    if (!q.ok.length || q.gross > this.coins) return { ok: false, poor: q.gross > this.coins, q };
    const extra = { ship: q.tier.id, gift: !!q.gift, note: from === 'cart' ? String(SESSION.note || '').trim() : '' };
    const myst = q.ok.some((x) => x.l.mystery);
    extra.linger = myst || this.store.stamps + 1 >= CLUB_N ? 4800 : 3400;
    let budget = this.coins - q.fee - q.gift;
    const done = [], reveals = [];
    const order = [...q.ok.filter((x) => !x.l.mystery), ...q.ok.filter((x) => x.l.mystery)];
    for (const x of order) {
      if (x.l.mystery) {
        let got = 0;
        for (let k = 0; k < x.qty; k++) {
          const pick = this._mysteryPick(budget);
          let ok = false;
          if (pick) { try { ok = !!(await this.o.onBuy?.(pick, 1, extra)); } catch (err) { console.error(err); } }
          if (this.dead) return { ok: false };
          if (!ok) continue;
          got++;
          reveals.push(pick);
          budget -= pick.price;
          // the box costs what it costs: the difference is charged / paid back
          const diff = MYSTERY_PRICE - pick.price;
          if (diff && this.o.onCharge) { try { this.o.onCharge(diff); budget -= diff; } catch (err) { console.error(err); } }
        }
        if (got) done.push({ l: x.l, qty: got });
        continue;
      }
      let ok = false;
      try { ok = !!(await this.o.onBuy?.(x.l, x.qty, extra)); } catch (err) { console.error(err); }
      if (this.dead) return { ok: false };
      if (ok) { done.push(x); budget -= x.l.price * x.qty; }
    }
    if (!done.length) return { ok: false, q };
    const q2 = this._quote(done, from);
    const net = q2.fee + q2.gift - q2.coupon - q2.club - q2.deal;
    if (net && this.o.onCharge) { try { this.o.onCharge(net); } catch (err) { console.error(err); } }
    // the coupon is spent, the club card gets a stamp (a full card makes the next order's cheapest item free)
    const st = this.store, before = st.stamps;
    const code = q2.cpn ? SESSION.coupon : null;
    if (code) { st.used[code] = true; st.won = st.won.filter((c) => c !== code); SESSION.coupon = null; }
    if (q2.club) st.free = false;
    st.orders = (st.orders || 0) + 1;
    st.stamps = before + 1;
    const full = st.stamps >= CLUB_N;
    if (full) { st.stamps = 0; st.free = true; }
    if (from === 'cart') { SESSION.gift = false; SESSION.note = ''; }
    SESSION.ship = 'std'; // the next order starts on the free moose again (no surprise fees)
    return { ok: true, done, reveals, q: q2, code, from, stamps: { before, full } };
  }
  // the delivery picker (detail: compact pills; checkout: rows with the joke and the ETA)
  _shipPick(where, lines = null) {
    const cpn = this._cpn();
    return `<div class="eb-shipp sp-${where}">${where === 'd' ? '<span class="eb-shipl">Delivery</span>' : ''}${SHIPS.map((t) => {
      const free = !t.fee || cpn?.ship === t.id;
      const eta = lines ? this._etaText(this._eta(lines, t.id)) : '';
      return `<button class="eb-shipb sh-${t.id}${SESSION.ship === t.id ? ' on' : ''}" data-ship="${t.id}" aria-pressed="${SESSION.ship === t.id}"><span class="sh-ic">${px(t.ic, 2)}</span><span class="sh-n">${t.n}</span>${where === 'c' ? `<span class="sh-s">${t.sub}</span><span class="sh-e">${esc(eta)}</span>` : ''}<span class="sh-f">${free ? (t.fee ? '<s>' + t.fee + '</s> FREE' : 'FREE') : `${this._coin(1)}${t.fee}`}</span></button>`;
    }).join('')}</div>`;
  }
  // a row of things that sell with this one
  _alsoBought(l) {
    const R = rng(hash(l.id) ^ 0x51ed);
    const pool = this.listings.filter((x) => x !== l && !x.locked && x.stock !== 0);
    if (!pool.length) return '';
    const same = pool.filter((x) => x.cat === l.cat), other = pool.filter((x) => x.cat !== l.cat);
    const pick = [];
    for (const src of [same, other, same, other, same]) { if (!src.length || pick.length >= 4) continue; const x = src[(R() * src.length) | 0]; if (!pick.includes(x)) pick.push(x); }
    return `<div class="eb-also"><b class="eb-alsoh">Customers also bought</b><div class="eb-alsor">${pick.map((x) => `<button class="eb-mcard" data-also="${esc(x.id)}" style="${this._rarVars(x)}"><span class="eb-pic sm"><img class="eb-img" src="${esc(imgSrc(x.image))}" alt="" draggable="false" /></span><span class="mc-t">${esc(this._short(x))}</span><span class="eb-tag">${this._coin(1)}<b>${fmt(x.price)}</b></span></button>`).join('')}</div></div>`;
  }
  // the e-Buy Club card: 10 stamps, the newest one thumps on
  _club(n, fresh = -1) {
    return `<div class="eb-club">${stkHTML('club', { cls: 'stk-club' })}<span class="club-h">${px('stamp', 2)}<b>e-Buy Club</b><span>${this.store.free ? '<em>FREE item on this order!</em>' : `${CLUB_N - n} more for a FREE item`}</span></span><span class="club-row">${Array.from({ length: CLUB_N }, (_, i) => `<i class="${i < n ? 'on' : ''}${i === fresh ? ' new' : ''}">${i < n ? px('stamp', 2) : i + 1}</i>`).join('')}</span></div>`;
  }
  _coinBurst(btn) {
    const wr = this.$fx.getBoundingClientRect(), br = btn.getBoundingClientRect();
    const cx = br.left + br.width / 2 - wr.left, cy = br.top + br.height / 2 - wr.top;
    const coin = this._icon('coin', 2) || '<i class="eb-cdot"></i>';
    let h = '';
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
      const d = 70 + Math.random() * 90;
      h += `<i class="eb-cf" style="left:${cx}px;top:${cy}px;--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;--r:${((Math.random() - 0.5) * 720) | 0}deg;animation-delay:${(Math.random() * 0.08).toFixed(2)}s">${coin}</i>`;
    }
    h += `<i class="eb-pop" style="left:${cx}px;top:${cy}px"></i>`;
    const box = document.createElement('div');
    box.className = 'eb-burstfx';
    box.innerHTML = h;
    this.$fx.appendChild(box);
    this._later(() => box.remove(), 1200);
    this._later(() => this._sfx('coins'), 120);
  }

  // ------------------------------------------------------------ cart
  _cartLines() {
    const out = [];
    SESSION.cart = SESSION.cart.filter((c) => {
      const l = this._byId(c.id);
      if (!l) return false;
      out.push({ l, qty: Math.max(1, Math.min(this._maxQ(l), c.qty)) });
      return true;
    });
    return out;
  }
  _renderCartCount() {
    const n = this._cartLines().reduce((s, x) => s + x.qty, 0);
    this.$cartn.textContent = n ? String(n) : '';
  }
  _addToCart(l, qty, fromImg) {
    if (!l || l.locked || l.stock === 0) { this._sfx('error'); return; }
    const c = SESSION.cart.find((x) => String(x.id) === String(l.id));
    const max = this._maxQ(l);
    if (c && c.qty >= max) { this._sfx('error'); this._bump(this.$cart, 'nope'); return; }
    if (c) c.qty = Math.min(max, c.qty + qty);
    else SESSION.cart.push({ id: l.id, qty: Math.min(max, qty) });
    this._sfx('ebuy_cart');
    this._flyToCart(fromImg, l);
    this._later(() => { this._bump(this.$cart, 'bump'); this._renderCartCount(); }, 380);
    this._renderCartCount();
    if (this.cur && String(this.cur) === String(l.id)) {
      const add = this.$det.querySelector('.eb-add');
      if (add) {
        const n = SESSION.cart.find((x) => String(x.id) === String(l.id))?.qty || 0;
        add.querySelector('i')?.remove();
        add.insertAdjacentHTML('beforeend', `<i>${n} in cart</i>`);
        this._bump(add, 'bump');
      }
    }
    this._markCard(l.id);
    if (this.drawer === 'cart') this._renderDrawer();
  }
  _markCard(id) {
    const card = [...this.$grid.querySelectorAll('.eb-card')].find((c) => c.dataset.id === String(id));
    if (!card) return;
    const n = SESSION.cart.find((x) => String(x.id) === String(id))?.qty || 0;
    card.classList.toggle('incart', !!n);
    card.querySelector('.eb-inc')?.remove();
    if (n) card.querySelector('.eb-pic')?.insertAdjacentHTML('beforeend', `<span class="eb-inc">${px('cartW', 2)}×${n}</span>`);
  }
  _flyToCart(img, l) {
    if (!img || reduced()) return;
    const wr = this.$fx.getBoundingClientRect(), a = img.getBoundingClientRect(), b = this.$cart.getBoundingClientRect();
    if (!a.width || !b.width) return;
    const s = Math.min(64, Math.max(28, a.width * 0.6));
    const f = document.createElement('img');
    f.className = 'eb-fly';
    f.src = imgSrc(l.image);
    f.style.cssText = `left:${a.left + a.width / 2 - wr.left - s / 2}px;top:${a.top + a.height / 2 - wr.top - s / 2}px;width:${s}px;height:${s}px;--dx:${(b.left + b.width / 2 - (a.left + a.width / 2)).toFixed(0)}px;--dy:${(b.top + b.height / 2 - (a.top + a.height / 2)).toFixed(0)}px`;
    this.$fx.appendChild(f);
    this._later(() => f.remove(), 700);
  }

  // ------------------------------------------------------------ drawer: cart / checkout / orders
  _openDrawer(view) {
    if (this.busy) return;
    this._popHide(); // [v33 kit]
    const was = this.drawer;
    this.drawer = view;
    this._renderDrawer();
    this.$drawer.scrollTop = 0;
    this.$drawer.setAttribute('aria-hidden', 'false');
    this.el.classList.add('eb-drawer-on');
    if (!was) this._bump(this.$drawer, 'in');
    this._sfx(was ? 'click' : 'page');
  }
  _closeDrawer() {
    if (!this.drawer || this.busy) return;
    this.drawer = null;
    this.el.classList.remove('eb-drawer-on');
    this.$drawer.setAttribute('aria-hidden', 'true');
    this._sfx('page');
  }
  _drawerClick(t) {
    if (t.closest('.eb-dx')) return this._closeDrawer();
    // [v33 kit] checkout options
    const shipb = t.closest('.eb-shipb');
    if (shipb) return this._pickShip(shipb.dataset.ship, shipb);
    if (t.closest('[data-gift]')) { SESSION.gift = !SESSION.gift; this._sfx(SESSION.gift ? 'ebuy_cart' : 'click'); this._renderDrawer(); this._bump(this.$drawer.querySelector('[data-gift]'), 'bump'); return; }
    if (t.closest('.eb-capply')) return this._applyCoupon(this.$drawer.querySelector('.eb-cpi')?.value);
    const cpn = t.closest('.eb-cpn');
    if (cpn) return this._applyCoupon(cpn.dataset.code);
    if (t.closest('.eb-cpx')) { SESSION.coupon = null; this._sfx('page'); this._renderDrawer(); return; }
    if (t.closest('input')) return;
    if (t.closest('.eb-dback')) return this._openDrawer('cart');
    if (t.closest('.eb-gocheck')) {
      const lines = this._cartLines().filter((x) => !x.l.locked && x.l.stock !== 0);
      if (!lines.length) { this._sfx('error'); this._bump(t.closest('.eb-gocheck'), 'shake'); return; }
      return this._openDrawer('checkout');
    }
    if (t.closest('.eb-pay')) return this._placeOrder();
    if (t.closest('.eb-keep')) return this._closeDrawer();
    const ot = t.closest('.eb-otrack');
    if (ot) { this._sfx('click'); try { this.o.onTrack?.(+ot.dataset.oid || ot.dataset.oid); } catch (err) { console.error(err); } return; }
    const line = t.closest('.eb-line');
    if (!line) return;
    const c = SESSION.cart.find((x) => String(x.id) === line.dataset.lid);
    const l = this._byId(line.dataset.lid);
    if (!c) return;
    if (t.closest('.eb-lrm')) {
      SESSION.cart = SESSION.cart.filter((x) => x !== c);
      this._sfx('page');
      line.classList.add('gone');
      this._later(() => { this._renderDrawer(); this._renderCartCount(); this._markCard(c.id); }, 180);
      return;
    }
    const d = t.closest('.eb-lminus') ? -1 : t.closest('.eb-lplus') ? 1 : 0;
    if (!d) {
      if (t.closest('.eb-lpic, .eb-lt') && l && !l.locked) { this._closeDrawer(); this._openDetail(l); }
      return;
    }
    const q = Math.max(1, Math.min(l ? this._maxQ(l) : 99, c.qty + d));
    if (q === c.qty) { this._sfx('error'); return; }
    c.qty = q;
    this._sfx('tick');
    this._renderDrawer();
    this._renderCartCount();
  }
  // [v33 kit] pick a delivery tier (detail page or checkout)
  _pickShip(id, btn) {
    if (!SHIPS.some((t) => t.id === id)) return;
    if (SESSION.ship === id) { this._bump(btn, 'bump'); return; }
    SESSION.ship = id;
    this._sfx(id === 'rocket' ? 'whoosh' : id === 'turbo' ? 'bell' : 'click');
    if (this.drawer) {
      this._renderDrawer();
      this._bump(this.$drawer.querySelector(`.eb-shipb[data-ship="${id}"]`), 'bump');
    } else {
      for (const b of this.$det.querySelectorAll('.eb-shipb')) { b.classList.toggle('on', b.dataset.ship === id); b.setAttribute('aria-pressed', b.dataset.ship === id); }
      this._bump(this.$det.querySelector(`.eb-shipb[data-ship="${id}"]`), 'bump');
      this._updateTotal();
    }
  }
  _applyCoupon(raw) {
    const code = String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) return;
    const say = (m, bad) => {
      const el = this.$drawer.querySelector('.cp-msg');
      if (el) { el.textContent = m; el.classList.toggle('bad', !!bad); this._bump(el, bad ? 'shake' : 'bump'); }
    };
    if (!COUPONS[code]) { this._sfx('error'); return say('That is not a coupon. That is a typo.', true); }
    if (this.store.used[code]) { this._sfx('error'); return say('Already used. Reynard remembers EVERYTHING.', true); }
    SESSION.coupon = code;
    if (!this.store.won.includes(code)) this.store.won.push(code);
    this._sfx('coins');
    this._renderDrawer();
    say(`${code}: ${COUPONS[code].n}!`);
    this._confetti(this.$drawer.querySelector('.eb-coupon'), 12);
  }
  _sumRows(q) {
    const c = (v) => `${this._coin(1)}${fmt(v)}`;
    return `<div class="eb-sum sm"><span>Items</span><i></i><b>${c(q.items)}</b></div>
      <div class="eb-sum sm"><span>${px(q.tier.ic, 1)} ${q.tier.n}</span><i></i><b class="${q.fee ? '' : 'eb-free'}">${q.fee ? c(q.fee) : 'FREE'}</b></div>
      ${q.gift ? `<div class="eb-sum sm"><span>${px('gift', 1)} Gift wrap</span><i></i><b>${c(q.gift)}</b></div>` : ''}
      ${q.coupon || q.cpn?.ship ? `<div class="eb-sum sm good"><span>${px('ticket', 1)} Coupon ${esc(SESSION.coupon)}</span><i></i><b>${q.coupon ? '-' + c(q.coupon) : 'free Turbo'}</b></div>` : ''}
      ${q.club ? `<div class="eb-sum sm good"><span>${px('stamp', 1)} Club card: 1 item FREE</span><i></i><b>-${c(q.club)}</b></div>` : ''}
      ${q.deal ? `<div class="eb-sum sm good"><span>${px('flame', 1)} Deal of the day</span><i></i><b>-${c(q.deal)}</b></div>` : ''}`;
  }

  _renderDrawer() {
    const v = this.drawer;
    if (!v) return;
    const steps = (k) => `<div class="eb-steps">${['Cart', 'Checkout', 'Done'].map((s, i) => `<span class="${i < k ? 'done' : i === k ? 'on' : ''}"><i>${i < k ? px('checkW', 1) : i + 1}</i>${s}</span>`).join('<b></b>')}</div>`;
    const head = (title, back = false) => `<div class="eb-dhead">${back ? `<button class="eb-dback" aria-label="back to cart">${px('arrow', 2)}</button>` : ''}<b>${title}</b><button class="eb-dx" aria-label="close">${px('x', 2)}</button></div>`;
    if (v === 'orders') {
      const list = this._orders();
      this._ordIds = list.map((o) => String(o.id)).join();
      const rows = list.map((o) => `<div class="eb-ord" data-oid="${esc(o.id)}">
          <span class="eb-oic"></span>
          <span class="eb-oinfo">
            <b class="eb-olab">${esc(o.label || 'Parcel')}${o.count > 1 ? ` <em>${o.count} items</em>` : ''}${o.ship && o.ship !== 'std' ? `<i class="eb-otier t-${esc(o.ship)}">${px(o.ship === 'rocket' ? 'rocket' : 'flame', 1)}${o.ship === 'rocket' ? 'ROCKET' : 'TURBO'}</i>` : ''}</b>
            <span class="eb-ophase"><span class="eb-ophl"></span><span class="eb-oeta"></span></span>
            <span class="eb-oroad"><i class="eb-ofill"></i><em>${px('van', 2)}</em><u></u></span>
            <span class="eb-osteps">${PHASES.map((p) => `<i title="${PHASE[p]}"></i>`).join('')}</span>
          </span>
          ${this.o.onTrack ? `<button class="eb-otrack" data-oid="${esc(o.id)}">${px('eye', 2)}<span>Watch</span></button>` : ''}
        </div>`).join('');
      this.$drawer.innerHTML = `${head('My orders')}
        <div class="eb-dbody">${rows || `<div class="eb-dempty">${this._icon('fox_shocked', 3) || px('box', 6)}<b>No orders yet.</b><span>Reynard is shocked. Shocked!</span><button class="eb-keep">Go shopping</button></div>`}</div>
        <div class="eb-dfoot eb-ofoot">${this._club(this.store.stamps)}<span class="eb-ofoot2">${px('van', 2)}<span>Moose Express delivers to the hut. Tags on the left show the moose live.</span></span></div>`;
      this._fillOrders(list);
      return;
    }
    const lines = this._cartLines();
    const q = this._quote(lines, 'cart'); // [v33 kit]
    const ok = q.ok;
    const total = q.total;
    const after = this.coins - q.gross;
    const n = lines.reduce((s, x) => s + x.qty, 0);
    if (v === 'cart') {
      const body = lines.length ? lines.map((x) => this._line(x, true)).join('') : `<div class="eb-dempty">${this._icon('fox_worried', 3) || px('cart', 6)}<b>Your cart is empty.</b><span>Reynard's wallet is sad. Tap ${px('cart', 1)}+ on anything.</span><button class="eb-keep">Keep shopping</button></div>`;
      this.$drawer.innerHTML = `${head(`Your cart <em>${n ? `(${n})` : ''}</em>`)}${steps(0)}
        <div class="eb-dbody">${body}</div>
        ${lines.length ? `<div class="eb-dfoot">
          ${this._sumRows(q)}
          <div class="eb-sum"><span>Subtotal</span><i></i><b>${this._coin(1)}${fmt(total)}</b></div>
          <div class="eb-sum sm${after < 0 ? ' bad' : ''}"><span>Wallet after</span><i></i><b>${this._coin(1)}${fmt(this.coins - total)}</b></div>
          <button class="eb-gocheck${after < 0 ? ' poor' : ''}"><span>Checkout</span>${px('arrowR', 2)}</button>
        </div>` : ''}`;
      return;
    }
    // checkout
    const eta = this._eta(ok);
    this.$drawer.innerHTML = `${head('Checkout', true)}${steps(1)}
      <div class="eb-dbody">
        <div class="eb-cbox"><span class="eb-cbi">${px('pin', 3)}</span><span><small>Ship to</small><b>The Pond, behind the hut</b><em>the moose knows the way</em></span></div>
        <div class="eb-csec"><small class="eb-csh">Delivery</small>${this._shipPick('c', ok)}</div>
        <button class="eb-cbox eb-giftb${SESSION.gift ? ' on' : ''}" data-gift><span class="eb-cbi">${px('gift', 3)}</span><span><small>Gift wrap · +${GIFT_FEE}</small><b>Pink paper + a bow</b><em>confetti when you unbox it</em></span><span class="eb-tick">${SESSION.gift ? px('check', 2) : ''}</span></button>
        <label class="eb-cnote"><small>A note for the moose (he reads it out loud)</small><input class="eb-notei" type="text" maxlength="60" placeholder="e.g. Leave it by the pond, thanks!" value="${esc(SESSION.note || '')}" autocomplete="off" spellcheck="false" /></label>
        <div class="eb-coupon"><small>Coupon code</small>
          <span class="cp-row"><input class="eb-cpi" type="text" maxlength="12" placeholder="ENTER CODE" autocomplete="off" spellcheck="false" /><button class="eb-capply">Apply</button></span>
          ${SESSION.coupon && this._cpn() ? `<span class="cp-on">${px('ticket', 2)}<b>${esc(SESSION.coupon)}</b><span>${esc(COUPONS[SESSION.coupon].n)}</span><button class="eb-cpx" aria-label="remove coupon">${px('x', 1)}</button></span>` : ''}
          ${this.store.won.filter((c) => c !== SESSION.coupon && !this.store.used[c]).length ? `<span class="cp-won"><small>Your coupons:</small>${this.store.won.filter((c) => c !== SESSION.coupon && !this.store.used[c]).map((c) => `<button class="eb-cpn" data-code="${esc(c)}">${px('ticket', 1)}${esc(c)}</button>`).join('')}</span>` : ''}
          <span class="cp-msg"></span>
        </div>
        ${this._club(this.store.stamps)}
        <div class="eb-csum">${this._sumRows(q)}</div>
        <div class="eb-cbox"><span class="eb-cbi">${px('coinp', 3)}</span><span><small>Pay with</small><b>Coins (all of them)</b><em>${this._coin(1)}${fmt(this.coins)} → <span class="${after < 0 ? 'bad' : ''}">${this._coin(1)}${fmt(after)}</span></em></span></div>
        <div class="eb-clist">${ok.map((x) => this._line(x, false)).join('')}</div>
        ${ok.length < lines.length ? `<div class="eb-cwarn">${px('lockpad', 2)}<span>${lines.length - ok.length} locked item${lines.length - ok.length > 1 ? 's' : ''} stay${lines.length - ok.length > 1 ? '' : 's'} in the cart.</span></div>` : ''}
        <p class="eb-fine">By placing this order you agree to Reynard's 400-page Terms of Sale, including Section 12: “No refunds. Ever. Not even that one.”</p>
      </div>
      <div class="eb-dfoot">
        <div class="eb-sum big"><span>Order total</span><i></i><b>${this._coin(2)}${fmt(total)}</b></div>
        <div class="eb-sum sm"><span>${px(q.tier.ic, 1)} ${esc(q.tier.n)}</span><i></i><b class="eb-ceta">${esc(this._etaText(eta))}</b></div>
        ${after < 0 ? `<div class="eb-poor">${this._icon('fox_worried', 1)}<span>You need ${this._coin(1)}<b>${fmt(-after)}</b> more.</span></div>` : ''}
        <button class="eb-pay${after < 0 ? ' poor' : ''}"><span class="eb-buyt">Place order</span><i class="eb-buyx">${px('bigx', 4)}</i></button>
      </div>`;
  }
  // a short name for cart lines and the receipt ("Candy Bluegill egg", "Classic Pellets ×40")
  _short(l) {
    if (l.kind === 'egg' && l.sub) return `${l.mutation?.name ? l.mutation.name + ' ' : ''}${l.sub} egg`;
    return l.sub || l.title;
  }
  // the live bits of the order rows, updated in place (buttons stay put under the cursor)
  _fillOrders(list) {
    const rows = this.$drawer.querySelectorAll('.eb-ord');
    list.forEach((o, i) => {
      const row = rows[i];
      if (!row) return;
      const k = Math.max(0, PHASES.indexOf(o.phase));
      const prog = `${(Math.max(0.04, Math.min(1, +o.progress || 0)) * 100).toFixed(1)}%`;
      if (row.dataset.ph !== o.phase) {
        row.dataset.ph = o.phase;
        row.className = `eb-ord p-${o.phase}`;
        row.querySelector('.eb-oic').innerHTML = o.phase === 'packing' ? px('box', 3) : this._icon('moose', 2) || px('van', 3);
        row.querySelector('.eb-ophl').textContent = PHASE[o.phase] || o.phase;
        row.querySelectorAll('.eb-osteps i').forEach((n, j) => n.classList.toggle('on', j <= k));
        const tb = row.querySelector('.eb-otrack');
        if (tb) tb.hidden = o.phase === 'delivered';
      }
      row.querySelector('.eb-oeta').textContent = o.phase === 'delivered' ? 'at the hut' : o.eta < 0 ? 'at sunrise' : `~${Math.max(1, Math.ceil(o.eta))}s`;
      row.querySelector('.eb-ofill').style.width = prog;
      row.querySelector('.eb-oroad em').style.left = prog;
    });
  }
  _line(x, edit) {
    const l = x.l;
    const bad = l.locked || l.stock === 0;
    return `<div class="eb-line${bad ? ' bad' : ''}" data-lid="${esc(l.id)}" style="${this._rarVars(l)}">
      <span class="eb-lpic"><img src="${esc(imgSrc(l.image))}" alt="" draggable="false" /></span>
      <span class="eb-linfo">
        <span class="eb-lt">${esc(this._short(l))}</span>
        ${bad ? `<span class="eb-lwarn">${px('lockpad', 1)}${esc(l.locked?.reason || 'Sold out')}</span>` : `<span class="eb-lsub">${this._coin(1)}${fmt(l.price)} each</span>`}
        <span class="eb-lrow">${edit ? `<span class="eb-step sm"><button class="eb-lminus" aria-label="less">−</button><b>${x.qty}</b><button class="eb-lplus" aria-label="more">+</button></span>` : `<span class="eb-lq">×${x.qty}</span>`}<b class="eb-lsum">${this._coin(1)}${fmt(l.price * x.qty)}</b></span>
      </span>
      ${edit ? `<button class="eb-lrm" aria-label="remove">${px('trash', 2)}</button>` : ''}
    </div>`;
  }
  async _placeOrder() {
    if (this.busy) return;
    const btn = this.$drawer.querySelector('.eb-pay');
    const lines = this._cartLines().filter((x) => !x.l.locked && x.l.stock !== 0);
    const total = this._quote(lines, 'cart').gross; // [v33 kit] items + delivery + gift wrap
    if (!lines.length || total > this.coins) {
      this._sfx('error');
      this._bump(btn, 'shake');
      this.$wallet.classList.remove('up', 'down');
      this._bump(this.$wallet, 'nope');
      return;
    }
    this.busy = true;
    btn?.classList.add('press');
    this._sfx('click');
    let res = { ok: false };
    try { res = await this._purchase(lines, 'cart'); } catch (err) { console.error(err); }
    if (this.dead) return;
    const done = res.done || [];
    for (const x of done) SESSION.cart = SESSION.cart.filter((c) => String(c.id) !== String(x.l.id));
    btn?.classList.remove('press');
    this._renderCartCount();
    if (!done.length) {
      this.busy = false;
      this._sfx('error');
      this._bump(btn, 'shake');
      return;
    }
    this._sfx('buy');
    if (btn) this._coinBurst(btn);
    this._confetti(null, 40);
    this._later(() => {
      this.busy = false;
      this.drawer = null;
      this.el.classList.remove('eb-drawer-on');
      this.$drawer.setAttribute('aria-hidden', 'true');
      this._showReceipt(res);
    }, 420);
  }

  // ------------------------------------------------------------ orders badge
  _pollOrders() {
    if (this.dead || !this.$ordn) return;
    const list = this._orders();
    const n = list.filter((o) => o.phase !== 'delivered').length;
    const s = n ? String(n) : '';
    if (this.$ordn.textContent !== s) {
      this.$ordn.textContent = s;
      if (n) this._bump(this.el.querySelector('.eb-ordb'), 'bump');
    }
    if (this.drawer === 'orders') {
      if (list.map((o) => String(o.id)).join() === this._ordIds) return this._fillOrders(list);
      const st = this.$drawer.querySelector('.eb-dbody')?.scrollTop || 0;
      this._renderDrawer();
      const b = this.$drawer.querySelector('.eb-dbody');
      if (b) b.scrollTop = st;
    }
  }

  // ------------------------------------------------------------ receipt
  _showReceipt(res) {
    // [v33 kit] the receipt prints the delivery tier, discounts, the Mystery Box's contents and the Club card
    const R = Array.isArray(res) ? { done: res, q: this._quote(res, 'buy'), reveals: [], stamps: null } : res;
    const lines = R.done;
    const q = R.q;
    const no = String(1000000 + (hash(lines.map((x) => x.l.id).join() + Date.now()) % 8999999));
    const d = new Date();
    const pad = (v) => String(v).padStart(2, '0');
    const total = q ? q.total : lines.reduce((s, x) => s + x.l.price * x.qty, 0);
    const shown = lines.slice(0, 4);
    const tier = q?.tier || SHIPS[0];
    const eta = this._etaText(this._eta(lines, tier.id), lines[0]?.l.eta);
    const pl = (label, v, cls = '') => `<div class="eb-pl ${cls}"><span>${label}</span><i></i><span>${v}</span></div>`;
    const extras = q ? [
      pl(`${px(tier.ic, 1)} ${tier.n}`, q.fee ? `${this._coin(1)}${fmt(q.fee)}` : 'FREE'),
      q.gift ? pl(`${px('gift', 1)} Gift wrap`, `${this._coin(1)}${q.gift}`) : '',
      q.coupon ? pl(`${px('ticket', 1)} ${esc(R.code || 'Coupon')}`, `-${this._coin(1)}${fmt(q.coupon)}`, 'good') : '',
      q.club ? pl(`${px('stamp', 1)} Club freebie`, `-${this._coin(1)}${fmt(q.club)}`, 'good') : '',
      q.deal ? pl(`${px('flame', 1)} Deal 10% back`, `-${this._coin(1)}${fmt(q.deal)}`, 'good') : '',
    ].join('') : '';
    const mys = (R.reveals || []).length ? `<div class="eb-myst"><b>MYSTERY BOX had:</b>${R.reveals.map((x) => `<span class="my-i"><img src="${esc(imgSrc(x.image))}" alt="" /><span>${esc(this._short(x))}</span><em>${x.price > MYSTERY_PRICE ? `worth ${this._coin(1)}${fmt(x.price)}!` : 'a classic.'}</em></span>`).join('')}</div>` : '';
    const club = R.stamps ? (R.stamps.full ? `<div class="eb-clubfull">${px('stamp', 3)}<b>CLUB CARD FULL!</b><span>Your next order's cheapest item is FREE.</span></div>` : this._club(R.stamps.before + 1, R.stamps.before)) : '';
    this.$rc.innerHTML = `
      <div class="eb-slot"><i></i></div>
      <div class="eb-paperw">${stkHTML('tapeB', { cls: 'stk-rt' })}<div class="eb-paper" style="clip-path:${ZIGZAG}">
        <div class="eb-ph"><span class="eb-mini"><i class="l1">e</i><i class="l2">-</i><i class="l3">B</i><i class="l4">u</i><i class="l5">y</i></span><small>order #${no} · ${pad(d.getHours())}:${pad(d.getMinutes())}</small></div>
        ${shown.map((x) => `<div class="eb-pi"><img src="${esc(imgSrc(x.l.image))}" alt="" /><span class="eb-pin">${esc(this._short(x.l))}</span><span class="eb-pq">×${x.qty}</span></div>`).join('')}
        ${lines.length > shown.length ? `<div class="eb-pmore">+ ${lines.length - shown.length} more</div>` : ''}
        ${extras}
        <div class="eb-pl tot"><span>TOTAL</span><i></i><span>${this._coin(1)}${fmt(total)}</span></div>
        ${mys}
        <div class="eb-pbar">${Array.from({ length: 34 }, (_, i) => `<i style="width:${1 + (hash(no + i) % 3)}px"></i>`).join('')}</div>
        <div class="eb-stamp"><b>SOLD!</b><span>Moose Express is on the way</span></div>
        <div class="eb-road sh-${tier.id}"><span class="eb-rider">${px('moosec', 2)}${px('bike', 3)}${tier.id === 'rocket' ? `<i class="eb-flame">${px('flame', 3)}</i>` : ''}</span></div>
        <div class="eb-eta">${px('clock', 2)}${esc(tier.n)} · ${esc(eta)}</div>
        ${club}
        <div class="eb-tap">tap to keep shopping</div>
      </div></div>`;
    this.$rc.hidden = false;
    this.$rc.classList.remove('show', 'hide'); void this.$rc.offsetWidth;
    this.$rc.classList.add('show');
    this._sfx('paper');
    this._later(() => this._sfx('stamp'), 900);
  }
  _closeReceipt() {
    if (!this.$rc.classList.contains('show')) return;
    this._sfx('page');
    this.$rc.classList.remove('show');
    this.$rc.classList.add('hide');
    this._later(() => { this.$rc.hidden = true; this.$rc.classList.remove('hide'); this.$rc.innerHTML = ''; }, 380);
    const l = this.cur && this._byId(this.cur);
    if (l && !(l.stock === 0)) { this.qty = 1; this._renderDetail(l, true); } else if (this.cur) this._closeDetail();
  }
}
