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
//
// The boot splash plays once per page session (shorter when opened on a focus listing); later
// opens skip it. Tap / any key skips it. The cart survives closing the shop.
//
// `root` should be a positioned element with a size; the shop fills it.
import './ebuy.css';
import { px } from './ebuyPx.js';

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
const CATS = [
  { id: 'eggs', name: 'Fish & Eggs', icon: 'egg' },
  { id: 'food', name: 'Fish Food', icon: 'food' },
  { id: 'farm', name: 'Farm', icon: 'bug' },
  { id: 'plants', name: 'Plants', icon: 'berry' },
  { id: 'decor', name: 'Decor', icon: 'gnome' },
  { id: 'restaurant', name: 'Restaurant', icon: 'chair' },
  { id: 'gear', name: 'Gear', icon: 'shovel' },
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
const TICKER = ['FREE MOOSE SHIPPING', 'ALL SALES FINAL', '0% REFUNDS', 'TRUSTED SELLER (me)', 'DEALS DEALS DEALS', 'NOT A SCAM', 'PRICES SLASHED (then raised)', 'eh?'];
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
const SESSION = { booted: false, cart: [], cat: null, sort: 'best', f: { season: false, afford: false, locked: false } };

// ---------------------------------------------------------------- component
export function openEBuy(root, opts = {}) {
  const shop = new EBuy(root, opts);
  return { refresh: (o) => shop.refresh(o), close: () => shop.close(), el: shop.el };
}

class EBuy {
  constructor(root, o) {
    this.root = root;
    this.o = o;
    // listings may be a function: then the catalogue (and its item art) is built
    // behind the loading screen instead of before anything shows up
    this._listFn = typeof o.listings === 'function' ? o.listings : null;
    this.listings = Array.isArray(o.listings) ? o.listings : [];
    this.coins = +o.coins || 0;
    this.shownCoins = this.coins;
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
  }

  _loadListings() {
    const fn = this._listFn;
    if (!fn) return;
    this._listFn = null;
    let L = [];
    try { L = fn() || []; } catch (err) { console.error(err); }
    this.listings = Array.isArray(L) ? L : [];
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
          <div class="eb-note"><b>pw:</b> money<br>money123</div>
          <div class="eb-screen">
            <div class="eb-app">
              <div class="eb-chrome">
                <button class="eb-nb eb-back" aria-label="back">${px('arrow', 3)}</button>
                <button class="eb-nb eb-fwd" tabindex="-1" aria-hidden="true">${px('arrowR', 3)}</button>
                <button class="eb-nb eb-reload" aria-label="reload">${px('reload', 3)}</button>
                <div class="eb-url"><span class="eb-lock">${px('lockpad', 2)}</span><span class="eb-urlt">www.e-buy.ca<i class="eb-path">/</i></span>${px('starbm', 2, 'eb-bm')}</div>
                <div class="eb-dots"><i></i><i></i><button class="eb-close eb-dclose" aria-label="close">${px('x', 2)}</button></div>
              </div>
              <header class="eb-top">
                <button class="eb-hb eb-back eb-hback" aria-label="back">${px('arrow', 3, 'eb-ia')}${px('x', 3, 'eb-ix')}</button>
                <button class="eb-home" aria-label="e-Buy home">${logo('eb-logo')}</button>
                <label class="eb-search">${px('mag', 3)}<input class="eb-q" type="text" placeholder="Search eggs, ducks, gnomes..." autocomplete="off" spellcheck="false" enterkeyhint="search" /><button class="eb-qx" aria-label="clear">${px('x', 2)}</button><span class="eb-sgo">Search</span></label>
                <div class="eb-wallet" title="your coins"><span class="eb-coin">${this._coin(2)}</span><b class="eb-bal">${fmt(this.coins)}</b></div>
                ${this.o.orders ? `<button class="eb-hb eb-ordb" aria-label="my orders">${px('box', 3)}<span class="eb-hbt">Orders</span><i class="eb-ordn"></i></button>` : ''}
                <button class="eb-hb eb-cart" aria-label="cart">${px('cart', 3)}<span class="eb-hbt">Cart</span><i class="eb-cartn"></i></button>
              </header>
              <div class="eb-ticker"><div class="eb-tick">${ticker}${ticker}</div></div>
              <div class="eb-body">
                <nav class="eb-side">
                  <b class="eb-sideh">Departments</b>
                  <div class="eb-cats"></div>
                  <div class="eb-promo">
                    <span class="eb-pmoose">${this._icon('moose', 3) || px('van', 3)}</span>
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
                <small class="eb-bfine">*only marketplace</small>
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
    cancelAnimationFrame(this._coinRaf);
    document.removeEventListener('keydown', this._onKey);
    this.el.removeEventListener('click', this._onClick);
    if (!keepEl) this.el.remove();
  }

  // ------------------------------------------------------------ events
  _click(e) {
    const t = e.target;
    if (!this.booted) return this._finishBoot();
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

  // ------------------------------------------------------------ refresh
  refresh({ coins, listings } = {}) {
    if (this.dead) return;
    if (Array.isArray(listings)) {
      this._listFn = null;
      this.listings = listings;
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
    this.$grid.innerHTML = list.map((l, i) => this._card(l, i, inCart.get(String(l.id)) || 0)).join('');
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
      return `<button class="eb-cat${!this.q && c.id === this.cat ? ' on' : ''}" data-cat="${esc(c.id)}"><span class="eb-cati">${this._icon(c.icon, 2) || px('box', 2)}</span><span class="eb-catn">${esc(c.name)}</span><i class="eb-catc">${n || ''}</i></button>`;
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

  // ------------------------------------------------------------ detail
  _openDetail(l, instant = false) {
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
    const specs = [
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
          </div>
          <div class="eb-revs"><b class="eb-revh">Buyer reviews</b>${reviews.map(([t, n, s]) => `<div class="eb-rev">${this._stars(s)}<q>${esc(t)}</q><cite>${esc(n)}</cite></div>`).join('')}</div>
        </div>
        <div class="eb-dr">
          <div class="eb-dcrumb">e-Buy <i>›</i> ${esc(this._catName(l.cat))}</div>
          <h2 class="eb-dt">${esc(l.title)}</h2>
          ${l.sub || l.desc ? `<div class="eb-dsub">${esc(l.sub || '')}${l.desc ? `<span>${esc(l.desc)}</span>` : ''}</div>` : ''}
          <div class="eb-chips">${rar ? `<span class="eb-rchip">${rar.n}</span>` : ''}${this._mutChip(m, true)}</div>
          <div class="eb-buybox">
            <div class="eb-dprice"><span class="eb-tag big">${this._coin(2)}<b>${fmt(l.price)}</b></span>${l.oldPrice > l.price ? `<span class="eb-was">was <s class="eb-old">${fmt(l.oldPrice)}</s>${pct ? ` <em>save ${pct}%</em>` : ''}</span>` : ''}</div>
            ${l.locked ? `<div class="eb-dlock">${px('lockpad', 2)}<span>${esc(l.locked.reason || 'Locked')}</span></div>` : ''}
            <div class="eb-qrow">
              <span class="eb-ql">Qty</span>
              <div class="eb-step"><button class="eb-minus" aria-label="less">−</button><b class="eb-qty">${this.qty}</b><button class="eb-plus" aria-label="more">+</button></div>
              <span class="eb-totl">Total <span class="eb-totv">${this._coin(1)}<b class="eb-tot2">${fmt(l.price * this.qty)}</b></span></span>
            </div>
            <div class="eb-poor"></div>
            <button class="eb-buy"><span class="eb-buyt">Buy It Now</span><span class="eb-buyc">${this._coin(2)}<b class="eb-tot">${fmt(l.price * this.qty)}</b></span><i class="eb-buyx">${px('bigx', 5)}</i></button>
            <button class="eb-add">${px('cart', 2)}<span>Add to cart</span>${inCart ? `<i>${inCart} in cart</i>` : ''}</button>
            <div class="eb-ship">${px('van', 2)}<span><b>Moose Express</b> · FREE · <span class="eb-etad">${esc(this._etaText(this._eta([{ l, qty: this.qty }]), l.eta))}</span></span></div>
          </div>
          <table class="eb-specs"><tbody>${specs.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>
        </div>
      </div>`;
    this._updateTotal();
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
    const tot = l.price * this.qty;
    for (const te of this.$det.querySelectorAll('.eb-tot, .eb-tot2')) te.textContent = fmt(tot);
    const poor = tot > this.coins;
    this.$det.querySelector('.eb-buy')?.classList.toggle('poor', poor);
    const pe = this.$det.querySelector('.eb-poor');
    if (pe) pe.innerHTML = poor && !l.locked ? `${this._icon('fox_worried', 1)}<span>You need ${this._coin(1)}<b>${fmt(tot - this.coins)}</b> more. Reynard accepts no IOUs.</span>` : '';
    const et = this.$det.querySelector('.eb-etad');
    if (et) et.textContent = this._etaText(this._eta([{ l, qty: this.qty }]), l.eta);
  }

  // ------------------------------------------------------------ delivery estimate
  _orders() { try { return (this.o.orders?.() || []).filter(Boolean); } catch { return []; } }
  _eta(lines) {
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
    const pack = Math.min(30, 7 + n * 2.5 + (fragile ? 3 : 0) + 1.5);
    let wait = 0;
    for (const t of this._orders()) if (t.phase !== 'delivered' && t.eta > 0) wait = Math.max(wait, t.eta);
    return { s: Math.max(pack + (+info.ride || 20), wait + 4) };
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
    let ok = false;
    const qty = this.qty;
    try { ok = !!(await this.o.onBuy?.(l, qty)); } catch (err) { console.error(err); ok = false; }
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
    this._later(() => { this.busy = false; this._showReceipt([{ l, qty }]); }, 520);
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
            <b class="eb-olab">${esc(o.label || 'Parcel')}${o.count > 1 ? ` <em>${o.count} items</em>` : ''}</b>
            <span class="eb-ophase"><span class="eb-ophl"></span><span class="eb-oeta"></span></span>
            <span class="eb-oroad"><i class="eb-ofill"></i><em>${px('van', 2)}</em><u></u></span>
            <span class="eb-osteps">${PHASES.map((p) => `<i title="${PHASE[p]}"></i>`).join('')}</span>
          </span>
          ${this.o.onTrack ? `<button class="eb-otrack" data-oid="${esc(o.id)}">${px('eye', 2)}<span>Watch</span></button>` : ''}
        </div>`).join('');
      this.$drawer.innerHTML = `${head('My orders')}
        <div class="eb-dbody">${rows || `<div class="eb-dempty">${this._icon('fox_shocked', 3) || px('box', 6)}<b>No orders yet.</b><span>Reynard is shocked. Shocked!</span><button class="eb-keep">Go shopping</button></div>`}</div>
        <div class="eb-dfoot eb-ofoot">${px('van', 2)}<span>Moose Express delivers to the hut. Tags on the left show the moose live.</span></div>`;
      this._fillOrders(list);
      return;
    }
    const lines = this._cartLines();
    const ok = lines.filter((x) => !x.l.locked && x.l.stock !== 0);
    const total = ok.reduce((s, x) => s + x.l.price * x.qty, 0);
    const after = this.coins - total;
    const n = lines.reduce((s, x) => s + x.qty, 0);
    if (v === 'cart') {
      const body = lines.length ? lines.map((x) => this._line(x, true)).join('') : `<div class="eb-dempty">${this._icon('fox_worried', 3) || px('cart', 6)}<b>Your cart is empty.</b><span>Reynard's wallet is sad. Tap ${px('cart', 1)}+ on anything.</span><button class="eb-keep">Keep shopping</button></div>`;
      this.$drawer.innerHTML = `${head(`Your cart <em>${n ? `(${n})` : ''}</em>`)}${steps(0)}
        <div class="eb-dbody">${body}</div>
        ${lines.length ? `<div class="eb-dfoot">
          <div class="eb-sum"><span>Subtotal</span><i></i><b>${this._coin(1)}${fmt(total)}</b></div>
          <div class="eb-sum sm"><span>Moose Express</span><i></i><b class="eb-free">FREE</b></div>
          <div class="eb-sum sm${after < 0 ? ' bad' : ''}"><span>Wallet after</span><i></i><b>${this._coin(1)}${fmt(after)}</b></div>
          <button class="eb-gocheck${after < 0 ? ' poor' : ''}"><span>Checkout</span>${px('arrowR', 2)}</button>
        </div>` : ''}`;
      return;
    }
    // checkout
    const eta = this._eta(ok);
    this.$drawer.innerHTML = `${head('Checkout', true)}${steps(1)}
      <div class="eb-dbody">
        <div class="eb-cbox"><span class="eb-cbi">${px('pin', 3)}</span><span><small>Ship to</small><b>The Pond, behind the hut</b><em>the moose knows the way</em></span></div>
        <div class="eb-cbox"><span class="eb-cbi">${this._icon('moose', 2) || px('van', 3)}</span><span><small>Delivery</small><b>Moose Express · FREE</b><em class="eb-ceta">${esc(this._etaText(eta))}</em></span></div>
        <div class="eb-cbox"><span class="eb-cbi">${px('coinp', 3)}</span><span><small>Pay with</small><b>Coins (all of them)</b><em>${this._coin(1)}${fmt(this.coins)} → <span class="${after < 0 ? 'bad' : ''}">${this._coin(1)}${fmt(after)}</span></em></span></div>
        <div class="eb-clist">${ok.map((x) => this._line(x, false)).join('')}</div>
        ${ok.length < lines.length ? `<div class="eb-cwarn">${px('lockpad', 2)}<span>${lines.length - ok.length} locked item${lines.length - ok.length > 1 ? 's' : ''} stay${lines.length - ok.length > 1 ? '' : 's'} in the cart.</span></div>` : ''}
        <p class="eb-fine">By placing this order you agree to Reynard's 400-page Terms of Sale, including Section 12: “No refunds. Ever. Not even that one.”</p>
      </div>
      <div class="eb-dfoot">
        <div class="eb-sum big"><span>Order total</span><i></i><b>${this._coin(2)}${fmt(total)}</b></div>
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
    const total = lines.reduce((s, x) => s + x.l.price * x.qty, 0);
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
    const done = [];
    for (const x of lines) {
      let ok = false;
      try { ok = !!(await this.o.onBuy?.(x.l, x.qty)); } catch (err) { console.error(err); ok = false; }
      if (this.dead) return;
      if (ok) {
        done.push(x);
        SESSION.cart = SESSION.cart.filter((c) => String(c.id) !== String(x.l.id));
      }
    }
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
    this._later(() => {
      this.busy = false;
      this.drawer = null;
      this.el.classList.remove('eb-drawer-on');
      this.$drawer.setAttribute('aria-hidden', 'true');
      this._showReceipt(done);
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
  _showReceipt(lines) {
    const no = String(1000000 + (hash(lines.map((x) => x.l.id).join() + Date.now()) % 8999999));
    const d = new Date();
    const pad = (v) => String(v).padStart(2, '0');
    const total = lines.reduce((s, x) => s + x.l.price * x.qty, 0);
    const shown = lines.slice(0, 4);
    const eta = this._etaText(this._eta(lines), lines[0]?.l.eta);
    this.$rc.innerHTML = `
      <div class="eb-slot"><i></i></div>
      <div class="eb-paperw"><div class="eb-paper" style="clip-path:${ZIGZAG}">
        <div class="eb-ph"><span class="eb-mini"><i class="l1">e</i><i class="l2">-</i><i class="l3">B</i><i class="l4">u</i><i class="l5">y</i></span><small>order #${no} · ${pad(d.getHours())}:${pad(d.getMinutes())}</small></div>
        ${shown.map((x) => `<div class="eb-pi"><img src="${esc(imgSrc(x.l.image))}" alt="" /><span class="eb-pin">${esc(this._short(x.l))}</span><span class="eb-pq">×${x.qty}</span></div>`).join('')}
        ${lines.length > shown.length ? `<div class="eb-pmore">+ ${lines.length - shown.length} more</div>` : ''}
        <div class="eb-pl tot"><span>TOTAL</span><i></i><span>${this._coin(1)}${fmt(total)}</span></div>
        <div class="eb-pbar">${Array.from({ length: 34 }, (_, i) => `<i style="width:${1 + (hash(no + i) % 3)}px"></i>`).join('')}</div>
        <div class="eb-stamp"><b>SOLD!</b><span>Moose Express is on the way</span></div>
        <div class="eb-road"><span class="eb-rider">${this._icon('moose', 3)}${px('bike', 3)}</span></div>
        <div class="eb-eta">${px('clock', 2)}${esc(eta)}</div>
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
