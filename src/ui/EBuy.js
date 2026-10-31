// e-Buy: the in-game shop, a goofy parody of a 1999 web shop running on
// Reynard's chunky pixel laptop. [v30 ebuy] Remade: sparse cards (big crisp item
// art, a short name, the price, one Add button), the jokes live in the item's
// detail view (big art, one funny line, the stats that matter, quantity, Buy It
// Now), no round UI anywhere (square / pixel-chamfered frames, all painted at
// whole device pixels), a one-step cart drawer and a tidy orders drawer.
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
//   kind?, qty?, n?, pair?, level?, locked?: { reason, icon } }
// listings may also be a function returning that array (built behind the loading screen).
// onBuy(listing, qty) -> boolean | Promise<boolean>   (false = can't afford/failed: the button shakes)
//   The cart's Place order calls onBuy once per cart line.
// icon(name, scale) -> '<img ...>' HTML (e.g. spriteImg). sfx(name) -> plays a sound.
// onClose() is called after the player closes the shop (back at the top level, close button or Esc).
// focus: a listing id to open straight away (the tutorial points at its Buy It Now button, `.eb-buy`).
// orders() -> [{ id, label, phase: 'packing'|'riding'|'arriving'|'delivered', eta, progress, count }]
//   (Delivery.tracker()) feeds the Orders drawer and the badge; onTrack(id) = "watch the moose".
// ship() -> { ride: seconds, night: bool } for the delivery estimate.
//
// Stable selectors (the tutorial points at them): .eb-buy (Buy It Now in the detail view),
// .eb-cat[data-cat] (department tabs), .eb-grid, .eb-card[data-id] (item cards).
//
// The boot splash plays once per page session (shorter when opened on a focus listing); later
// opens skip it. Tap / any key skips it. The cart survives closing the shop.
import './ebuy.css';
import { px } from './ebuyPx.js';
import { loadArt, artNow, paintWell, paintThumb, paintBezel, tiles } from './ebuyArt.js';
import { dpr } from './uiScale.js';

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
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

// ---------------------------------------------------------------- data
const CATS = [
  { id: 'eggs', name: 'Fish & Eggs', icon: 'd_eggs' },
  { id: 'food', name: 'Fish Food', icon: 'd_food' },
  { id: 'farm', name: 'Farm', icon: 'd_farm' },
  { id: 'plants', name: 'Plants', icon: 'd_plants' },
  { id: 'decor', name: 'Decor', icon: 'd_decor' },
  { id: 'restaurant', name: 'Restaurant', icon: 'd_restaurant' },
  { id: 'gear', name: 'Gear', icon: 'd_gear' },
];
const RAR = {
  common: { n: 'Common', c: '#b8ac90', t: 1 },
  uncommon: { n: 'Uncommon', c: '#5cb83a', t: 2 },
  rare: { n: 'Rare', c: '#3c8ce0', t: 3 },
  epic: { n: 'Epic', c: '#a050e0', t: 4 },
  legendary: { n: 'Legendary', c: '#f0a010', t: 5 },
};
const MUT_ICON = { titan: 'titan', candy: 'candy', hot: 'flame', doublehot: 'flame', doge: 'doge', frozen: 'snow', shiny: 'shiny', rainbow: 'rainbow', zombie: 'skull', galaxy: 'planet', tiny: 'tiny' };
const MUT_TONE = new Set(['hot', 'doublehot', 'frozen', 'candy', 'doge', 'zombie', 'galaxy', 'shiny', 'rainbow']);
const mutKey = (m) => String(m?.id || m?.name || '').toLowerCase().replace(/[^a-z]/g, '');
const BADGES = {
  inseason: { t: 'SEASON', ic: 'sprout' }, // [v26 seasons] spawning-season eggs (15% off)
  hot: { t: 'HOT', ic: 'flame' },
  sale: { t: 'SALE', ic: null },
  last: { t: 'LAST ONE', ic: null },
  new: { t: 'NEW', ic: 'spark' },
};
const BADGE_ORDER = ['inseason', 'hot', 'sale', 'last', 'new'];
const TICKER = ['DEALS DEALS DEALS', 'FREE MOOSE SHIPPING', 'NOT A SCAM', 'ALL SALES FINAL', 'PRICES SLASHED (then raised)', 'TRUSTED SELLER (me)'];
const ZIGZAG = (() => {
  const n = 22, pts = ['0 0', '100% 0'];
  for (let i = n; i >= 0; i--) pts.push(`${((i / n) * 100).toFixed(2)}% ${i % 2 ? '100%' : 'calc(100% - 6px)'}`);
  return `polygon(${pts.join(',')})`;
})();
const DOGE = ['wow', 'such egg', 'much rare', 'very buy', 'amaze', 'so fish'];
const BOOT_LINES = ['Waking up the moose...', 'Counting your coins (twice)...', 'Inflating original prices...', 'Hiding the refund button...', 'Polishing eggs...', 'Untangling antlers...', 'Dialing up. Please hold...'];
const SORTS = [
  { id: 'best', n: 'Best' },
  { id: 'low', n: 'Price ▲' },
  { id: 'high', n: 'Price ▼' },
  { id: 'deal', n: 'Deals' },
];
const FILTERS = [
  { id: 'season', n: 'In season', ic: 'sprout' },
  { id: 'afford', n: 'Affordable', ic: 'coinp' },
  { id: 'locked', n: 'Hide locked', ic: 'lockpad' },
];
const PHASE = { packing: 'Packing', riding: 'On the road', arriving: 'Almost there', delivered: 'Delivered' };
const PHASES = ['packing', 'riding', 'arriving', 'delivered'];
const LOCK_IC = { flask: 'flask', map: 'map', clock: 'clock', beaver: 'beav', lock: 'lockpad' };

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
    this._listFn = typeof o.listings === 'function' ? o.listings : null;
    this.listings = Array.isArray(o.listings) ? o.listings : [];
    this.coins = +o.coins || 0;
    this.shownCoins = this.coins;
    const mode = SESSION.booted ? 'quick' : o.focus ? 'short' : 'full';
    if (mode !== 'full') this._loadListings();
    this.cat = this._startCat();
    this.q = '';
    this.cur = null; // id of the open listing
    this.qty = 1;
    this.busy = false;
    this.dead = false;
    this.drawer = null; // 'cart' | 'orders'
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
    for (const l of this.listings) loadArt(l.image); // decode the art behind the splash
    if (!this.el || this.dead) return; // still in the constructor
    this.cat = this._startCat();
    this._render();
    this._renderCartCount();
    this._applyFocus();
  }
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
      if (l.cat && !out.some((c) => c.id === l.cat) && !CATS.some((c) => c.id === l.cat)) out.push({ id: l.cat, name: l.cat[0].toUpperCase() + l.cat.slice(1), icon: 'd_tag' });
    }
    return out.length ? out : CATS.slice(0, 1);
  }
  _catOf(id) { return CATS.find((c) => c.id === id) || { id, name: id ? id[0].toUpperCase() + id.slice(1) : '', icon: 'd_tag' }; }
  _catName(id) { return this._catOf(id).name; }
  _startCat() {
    if (SESSION.cat && this.listings.some((l) => l.cat === SESSION.cat)) return SESSION.cat;
    return this._cats()[0].id;
  }
  _byId(id) { return this.listings.find((l) => String(l.id) === String(id)); }
  _pct(l) { return l.oldPrice > l.price ? Math.round((1 - l.price / l.oldPrice) * 100) : 0; }
  _maxQ(l) { return l.stock > 0 ? Math.min(99, l.stock) : 99; }
  _bump(node, cls = 'bump') { if (!node) return; node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }
  _coin(s = 1) { return this._icon('coin', s) || px('coinp', s * 2); }
  // a short name ("Candy Bluegill egg", "Classic Pellets ×40")
  _short(l) {
    if (l.kind === 'egg' && l.sub) return `${l.sub} egg`;
    return l.sub || l.title;
  }
  // the listing's joke, as one line
  _joke(l) {
    const t = String(l.title || '').trim();
    if (l.desc) return l.desc;
    let m = t.match(/\s[-–]\s(.+)$/);
    if (m) return m[1];
    m = t.match(/\(([^()]{4,})\)\s*$/);
    if (m) return m[1];
    if (t && t.toLowerCase() !== String(l.sub || '').toLowerCase()) return t;
    return '';
  }
  // the unlock, short: "Research Perch", "Decrypt Pond & Bugs", "Meet Hoot", "Day 3"
  _why(l) {
    const r = String(l.locked?.reason || 'Locked');
    let m = r.match(/^Research in the Lab: (.+)$/);
    if (m) return 'Research ' + m[1];
    m = r.match(/^Decrypt the (.+?) section/);
    if (m) return 'Decrypt ' + m[1];
    m = r.match(/^Meet ([^,]+)/);
    if (m) return 'Meet ' + m[1];
    return r;
  }
  _lockIc(l, s = 2) { return px(LOCK_IC[l.locked?.icon] || 'lockpad', s); }
  _tone(l) {
    if (l.locked) return 'locked';
    const mk = mutKey(l.mutation);
    if (MUT_TONE.has(mk)) return mk;
    return RAR[l.rarity] ? l.rarity : 'none';
  }

  // ------------------------------------------------------------ build
  _build() {
    const el = (this.el = document.createElement('div'));
    el.className = 'ebuy';
    const T = tiles();
    el.style.cssText = `--tx-wood:${T.wood.url};--tx-wood-s:${T.wood.size};--tx-dwood:${T.woodDark.url};--tx-dwood-s:${T.woodDark.size};--tx-rail:${T.rail.url};--tx-rail-s:${T.rail.size};--tx-paper:${T.paper.url};--tx-paper-s:${T.paper.size}`;
    const tick = TICKER.map((t) => `<span>${esc(t)}</span>${px('spark', 2)}`).join('');
    const logo = (cls) => `<span class="${cls}" aria-label="e-Buy"><i class="l1">e</i><i class="l2">-</i><i class="l3">B</i><i class="l4">u</i><i class="l5">y</i></span>`;
    el.innerHTML = `
      <div class="eb-dev">
        <div class="eb-bezel">
          <canvas class="eb-bezc" aria-hidden="true"></canvas>
          <div class="eb-note"><b>pw:</b> money<br>money123</div>
          <div class="eb-screen">
            <div class="eb-app">
              <div class="eb-chrome">
                <button class="eb-nb eb-back" aria-label="back">${px('back', 2)}</button>
                <div class="eb-url">${px('lockpad', 2)}<span class="eb-urlt">www.e-buy.ca<i class="eb-path">/</i></span></div>
                <span class="eb-ctitle">e-Buy Navigator 3.0</span>
                <button class="eb-nb eb-close eb-dclose" aria-label="close">${px('x', 2)}</button>
              </div>
              <header class="eb-top">
                <button class="eb-hb eb-back eb-hback" aria-label="back">${px('back', 2, 'eb-ia')}${px('x', 3, 'eb-ix')}</button>
                <button class="eb-home" aria-label="e-Buy home">${logo('eb-logo')}</button>
                <label class="eb-search">${px('mag', 3)}<input class="eb-q" type="text" placeholder="Search" autocomplete="off" spellcheck="false" enterkeyhint="search" /><button class="eb-qx" aria-label="clear">${px('x', 2)}</button></label>
                <div class="eb-wallet" title="your coins"><span class="eb-coin">${this._coin(2)}</span><b class="eb-bal">${fmt(this.coins)}</b></div>
                ${this.o.orders ? `<button class="eb-hb eb-ordb" aria-label="my orders">${px('box', 3)}<span class="eb-hbt">Orders</span><i class="eb-ordn"></i></button>` : ''}
                <button class="eb-hb eb-cart" aria-label="cart">${px('cart', 3)}<span class="eb-hbt">Cart</span><i class="eb-cartn"></i></button>
              </header>
              <div class="eb-ticker"><div class="eb-tick">${tick}${tick}</div></div>
              <div class="eb-body">
                <nav class="eb-side">
                  <div class="eb-cats"></div>
                  <div class="eb-promo">
                    <span class="eb-pmoose">${this._icon('moose', 2) || px('van', 3)}</span>
                    <span class="eb-ptxt"><b>Moose Express</b><span>Free. He insists.</span></span>
                    ${this.o.orders ? `<button class="eb-ptrack">${px('box', 2)}<span>Track</span></button>` : ''}
                  </div>
                </nav>
                <main class="eb-main">
                  <div class="eb-bar">
                    <div class="eb-crumb"><span class="eb-hi"></span><b class="eb-h"></b><span class="eb-n"></span></div>
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
                <div class="eb-bbar">${'<i></i>'.repeat(12)}</div>
                <div class="eb-bline">Connecting...</div>
              </div>
              <div class="eb-bskip">tap to skip</div>
            </div>
          </div>
          <div class="eb-chin"><span class="eb-brand">REYNARD·TOP 3000</span><i class="eb-led"></i></div>
        </div>
      </div>`;
    this.root.appendChild(el);
    const $ = (s) => el.querySelector(s);
    this.$app = $('.eb-app');
    this.$bezel = $('.eb-bezel');
    this.$bezc = $('.eb-bezc');
    this.$cats = $('.eb-cats');
    this.$grid = $('.eb-grid');
    this.$scroll = $('.eb-scroll');
    this.$h = $('.eb-h');
    this.$hi = $('.eb-hi');
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
    this.$ordb = $('.eb-ordb');
    this.$cartn = $('.eb-cartn');
    this.$ordn = $('.eb-ordn');
    this.$drawer = $('.eb-drawer');
    this.$boot = $('.eb-boot');

    // every item well and the laptop body repaint at device resolution when their box changes
    this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((ents) => {
      for (const e of ents) {
        const t = e.target, w = e.contentRect.width, h = e.contentRect.height;
        if (t === this.$bezel) this._paintBezel(w, h);
        else this._paintWell(t, w, h);
      }
    }) : null;
    this._ro?.observe(this.$bezel);
    this._onDpr = () => { this._paintBezel(); for (const w of this.el.querySelectorAll('.eb-well')) this._paintWell(w); };
    window.addEventListener('resize', this._onDpr);

    this._onClick = (e) => this._click(e);
    el.addEventListener('click', this._onClick);
    let lastHover = 0;
    el.addEventListener('pointerover', (e) => {
      if (e.pointerType === 'touch') return;
      const c = e.target.closest?.('.eb-card,.eb-cat,.eb-buy,.eb-add,.eb-qadd,.eb-pay');
      if (!c || c.contains(e.relatedTarget)) return;
      const now = performance.now();
      if (now - lastHover > 70) { lastHover = now; this._sfx('hover'); }
    });
    // pressed look for touch (iPad has no :hover); cleared on release
    el.addEventListener('pointerdown', (e) => {
      const c = e.target.closest?.('.eb-card, .eb-cat, .eb-hb, .eb-nb, .eb-chip, .eb-sortb, .eb-buy, .eb-add, .eb-qadd, .eb-pay, .eb-otrack, .eb-ptrack, .eb-dback, .eb-step button, .eb-keep');
      if (!c) return;
      c.classList.add('eb-press');
      const up = () => { c.classList.remove('eb-press'); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true); };
      addEventListener('pointerup', up, true);
      addEventListener('pointercancel', up, true);
    });
    el.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('eb-card')) { e.preventDefault(); e.target.click(); }
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

  _paintBezel(w, h) {
    const b = this.$bezel;
    if (!b) return;
    if (w == null) { w = b.clientWidth; h = b.clientHeight; }
    const phone = w < 900 && h < 480;
    paintBezel(this.$bezc, w, h, { texel: phone ? 2 : 3, chamfer: phone ? 2 : 3, vents: !phone, screwsBottom: !phone });
  }
  _paintWell(well, w, h) {
    const cv = well.querySelector('canvas.eb-art');
    if (!cv) return;
    if (w == null) { w = well.clientWidth; h = well.clientHeight; }
    const l = this._byId(well.dataset.wid);
    if (!l) return;
    const art = artNow(l.image);
    if (!art && l.image && !well._wait) {
      well._wait = true;
      loadArt(l.image).then((a) => { well._wait = false; if (a && well.isConnected && !this.dead) this._paintWell(well); });
    }
    const big = well.classList.contains('eb-dwell');
    const mk = mutKey(l.mutation);
    const rt = RAR[l.rarity]?.t || 0;
    well._box = paintWell(cv, w, h, {
      art, tone: this._tone(l), locked: !!l.locked, big,
      egg: l.kind === 'egg' && !l.locked ? (RAR[l.rarity] ? l.rarity : 'common') : null,
      fill: big ? 0.7 : 0.76, maxCss: big ? 8 : 4, seed: hash(l.id),
      sparkle: l.locked ? 0 : rt >= 3 ? rt - 1 : mk === 'shiny' ? 3 : 0,
      scale: mk === 'tiny' ? 0.5 : mk === 'titan' ? 1.3 : 1,
    });
  }
  _observeWells(root) {
    for (const w of root.querySelectorAll('.eb-well')) {
      if (this._ro) this._ro.observe(w);
      else this._paintWell(w);
    }
  }
  _thumbs(root, css) {
    for (const cv of root.querySelectorAll('canvas.eb-thumb')) {
      const l = this._byId(cv.dataset.tid) || this._rcLines?.find((x) => String(x.l.id) === cv.dataset.tid)?.l;
      if (!l) continue;
      const egg = l.kind === 'egg' ? (RAR[l.rarity] ? l.rarity : 'common') : null;
      const size = +cv.dataset.sz || css;
      const art = artNow(l.image);
      if (art) paintThumb(cv, art, size, { egg });
      else loadArt(l.image).then((a) => { if (a && cv.isConnected) paintThumb(cv, a, size, { egg }); });
    }
  }

  // ------------------------------------------------------------ open / close animation
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
    if (this._listFn) this._later(() => { this._loadListings(); this._runSplash(mode); }, 60);
    else this._runSplash(mode);
  }
  _runSplash(mode) {
    if (this.booted || this.dead) return;
    this.$boot.classList.add('run');
    const dur = mode === 'full' ? 1000 : 640;
    this.$boot.style.setProperty('--bt', `${dur - 260}ms`);
    const pool = BOOT_LINES.slice();
    const lines = [];
    const n = mode === 'full' ? 2 : 1;
    for (let i = 0; i < n; i++) lines.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    lines.push('Ready. Spend!');
    const $line = this.$boot.querySelector('.eb-bline');
    lines.forEach((t, i) => this._later(() => {
      if (this.booted) return;
      $line.textContent = t;
      this._bump($line, 'bump');
      if (i) this._sfx('tick');
    }, 160 + (i * (dur - 260)) / lines.length));
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
    if (this.drawer) return this._closeDrawer();
    if (this.cur) { this._sfx('page'); return this._closeDetail(); }
    if (this.q) { this.q = ''; this.$q.value = ''; this._sfx('click'); return this._render(true); }
    this._userClose();
  }
  _deep() { this.el.classList.toggle('eb-deep', !!(this.cur || this.drawer || this.q)); }
  _userClose() {
    if (this.dead) return;
    if (this.o.onClose) { try { this.o.onClose(); } catch (err) { console.error(err); } }
    if (!this.dead) { this._sfx('crt_off'); this.close(); }
  }
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
    this._ro?.disconnect();
    window.removeEventListener('resize', this._onDpr);
    document.removeEventListener('keydown', this._onKey);
    this.el.removeEventListener('click', this._onClick);
    if (!keepEl) this.el.remove();
  }

  // ------------------------------------------------------------ events
  _click(e) {
    const t = e.target;
    if (!this.booted) return this._finishBoot();
    if (t.closest('.eb-rc')) return this._closeReceipt();
    if (t.closest('.eb-back')) return this._back();
    if (t.closest('.eb-close')) return this._userClose();
    if (t.closest('.eb-qx')) { e.preventDefault(); this.$q.value = ''; this.q = ''; this._sfx('click'); this._render(true); return; }
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
    if (this.drawer && t.closest('.eb-drawer')) return this._drawerClick(t);
    const cat = t.closest('.eb-cat');
    if (cat) {
      if (cat.dataset.cat === this.cat && !this.q && !this.cur) return;
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
      if (l) this._addToCart(l, 1, card.querySelector('.eb-well'));
      return;
    }
    const card = t.closest('.eb-card');
    if (card) {
      const l = this._byId(card.dataset.id);
      if (!l) return;
      this._sfx('ebuy_tok');
      return this._openDetail(l);
    }
    if (t.closest('.eb-minus')) return this._step(-1);
    if (t.closest('.eb-plus')) return this._step(1);
    if (t.closest('.eb-buy')) return this._buy();
    if (t.closest('.eb-add')) {
      const l = this._byId(this.cur);
      if (l) this._addToCart(l, this.qty, this.$det.querySelector('.eb-well'));
      return;
    }
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
      else if (Array.isArray(listings) && !this.busy && this.$rc.hidden) this._renderDetail(l, true);
      else this._updateTotal();
    }
    if (this.drawer && !this.busy) this._renderDrawer();
  }
  _setCoins(v) {
    const from = this.shownCoins, to = v, t0 = performance.now(), dur = 600;
    this.coins = v;
    this.$wallet.classList.remove('up', 'down');
    this._bump(this.$wallet, to < from ? 'down' : 'up');
    // coin tick: the counter clicks as it rolls, a "-40" drops off the wallet
    if (to !== from && !reduced()) {
      const n = Math.min(7, Math.max(2, Math.round(Math.log2(Math.abs(to - from) + 1))));
      for (let i = 0; i < n; i++) this._later(() => this._sfx('ebuy_tick'), 40 + i * 70);
      const f = document.createElement('b');
      f.className = 'eb-dcoin ' + (to < from ? 'neg' : 'pos');
      f.textContent = (to < from ? '-' : '+') + fmt(Math.abs(to - from));
      this.$wallet.appendChild(f);
      this._later(() => f.remove(), 1100);
    }
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
    else for (const c of this.$grid.querySelectorAll('.eb-card')) {
      const l = this._byId(c.dataset.id);
      if (l) c.classList.toggle('poor', !l.locked && l.stock !== 0 && l.price > this.coins);
    }
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
    const c = this._catOf(this.cat);
    this.$h.textContent = this.q ? `“${this.q}”` : c.name;
    this.$hi.innerHTML = this.q ? px('mag', 3) : px(c.icon, 2);
    this.$n.textContent = `${list.length} item${list.length === 1 ? '' : 's'}`;
    const seasonN = scope.filter((l) => l.badges?.includes('inseason')).length;
    const sort = SORTS.find((s) => s.id === SESSION.sort) || SORTS[0];
    this.$filt.innerHTML = FILTERS.filter((f) => f.id !== 'season' || seasonN || SESSION.f.season)
      .map((f) => `<button class="eb-chip${SESSION.f[f.id] ? ' on' : ''}" data-f="${f.id}" aria-pressed="${!!SESSION.f[f.id]}" title="${f.n}"><span class="eb-cbox">${SESSION.f[f.id] ? px('check', 2) : ''}</span>${px(f.ic, 2)}<span class="eb-chipt">${f.n}</span></button>`).join('')
      + `<button class="eb-sortb" title="sort">${px('sort', 2)}<span>${sort.n}</span></button>`;
    this.el.classList.toggle('eb-searching', !!this.q);
    this._deep();
    if (!this.cur) this.$path.textContent = this.q ? '/search?q=' + this.q.replace(/\s+/g, '+') : '/' + this.cat;
    if (!list.length) {
      const filtered = scope.length > 0;
      this.$grid.innerHTML = `<div class="eb-empty">${this._icon('fox_worried', 3) || px('mag', 8)}<b>${filtered ? 'Nothing left after those filters' : 'Nothing found'}</b><button class="eb-unfilter">${filtered ? 'Clear filters' : 'Clear search'}</button></div>`;
      return;
    }
    const inCart = new Map(SESSION.cart.map((x) => [String(x.id), x.qty]));
    this.$grid.innerHTML = list.map((l, i) => this._card(l, i, inCart.get(String(l.id)) || 0)).join('');
    this._observeWells(this.$grid);
    if (anim) this._cascade();
  }
  _cascade() {
    if (!this.$grid) return;
    this.$grid.classList.remove('eb-anim');
    void this.$grid.offsetWidth;
    this.$grid.classList.add('eb-anim');
    clearTimeout(this._animT);
    this._animT = this._later(() => this.$grid.classList.remove('eb-anim'), 900);
  }
  _rerender() {
    const st = this.$scroll.scrollTop;
    this._render();
    this.$scroll.scrollTop = st;
  }
  _renderCats() {
    const cats = this._cats();
    const html = cats.map((c) => {
      const n = this.listings.filter((l) => l.cat === c.id && !l.locked).length;
      return `<button class="eb-cat${!this.q && c.id === this.cat ? ' on' : ''}" data-cat="${esc(c.id)}" title="${esc(c.name)}"><span class="eb-cati">${px(c.icon, 2)}</span><span class="eb-catn">${esc(c.name)}</span><i class="eb-catc">${n || ''}</i></button>`;
    }).join('');
    if (html !== this._catsHtml) { this.$cats.innerHTML = html; this._catsHtml = html; }
  }
  _pips(l) {
    const r = RAR[l.rarity];
    if (!r || l.locked) return '';
    return `<span class="eb-pips" title="${r.n}" style="--pc:${r.c}">${'<i></i>'.repeat(r.t)}</span>`;
  }
  _mutChip(m, big = false) {
    if (!m) return '';
    const k = mutKey(m);
    const ic = px(MUT_ICON[k] || 'spark', 2);
    return `<span class="eb-mchip mu-${esc(k)}${big ? ' big' : ''}" style="--mc:${esc(m.color || '#ff6ad5')}">${ic}<b>${esc(m.name || m.id)}</b>${m.mult && big ? `<i>×${esc(m.mult)}</i>` : ''}</span>`;
  }
  _badge(l) {
    const b = (l.badges || []).filter((x) => BADGES[x]).sort((a, c) => BADGE_ORDER.indexOf(a) - BADGE_ORDER.indexOf(c))[0];
    if (!b) return '';
    return `<span class="eb-bdg b-${b}">${BADGES[b].ic ? px(BADGES[b].ic, 2) : ''}<b>${BADGES[b].t}</b></span>`;
  }
  _card(l, i, inCart = 0) {
    const mk = mutKey(l.mutation);
    const soldout = l.stock === 0;
    const locked = l.locked;
    const poor = !locked && !soldout && l.price > this.coins;
    const cls = ['eb-card', locked && 'locked', soldout && 'soldout', mk && 'mu-' + mk, poor && 'poor', inCart && 'incart', RAR[l.rarity] && 'r-' + l.rarity].filter(Boolean).join(' ');
    const row = locked
      ? `<span class="eb-why">${this._lockIc(l, 2)}<span>${esc(this._why(l))}</span></span>`
      : `<span class="eb-tag">${this._coin(1)}<b>${fmt(l.price)}</b></span>${soldout ? '<span class="eb-out">Sold out</span>' : `<button class="eb-qadd" aria-label="add to cart" title="add to cart">${px('cart', 2)}<i>${px('plus', 2)}</i></button>`}`;
    return `<div class="${cls}" data-id="${esc(l.id)}" role="button" tabindex="0" aria-label="${esc(this._short(l))}" style="--d:${(Math.min(i, 14) * 0.03).toFixed(2)}s">
      <span class="eb-well" data-wid="${esc(l.id)}"><canvas class="eb-art" aria-hidden="true"></canvas>
        ${this._pips(l)}
        ${locked ? `<span class="eb-lk">${px('lockpad', 3)}</span>` : this._badge(l)}
        ${l.mutation && !locked ? `<span class="eb-mpos">${this._mutChip(l.mutation)}</span>` : ''}
        ${inCart ? `<span class="eb-inc">${px('cartW', 2)}<b>${inCart}</b></span>` : ''}
      </span>
      <span class="eb-nm">${esc(this._short(l))}</span>
      <span class="eb-row">${row}</span>
    </div>`;
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
    this._deep();
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
    const pos = () => `left:${(r() * 88 + 4).toFixed(1)}%;top:${(r() * 80 + 4).toFixed(1)}%;animation-delay:${(-r() * 3).toFixed(2)}s`;
    switch (k) {
      case 'hot': return n(7, (i) => `<i class="fx-fl" style="left:${(i / 6) * 84 + 4}%;animation-delay:${(-r()).toFixed(2)}s">${px('flame', 4)}</i>`);
      case 'doublehot': return n(10, (i) => `<i class="fx-fl" style="left:${(i / 9) * 86 + 3}%;animation-delay:${(-r()).toFixed(2)}s">${px(i % 2 ? 'blueflame' : 'flame', 4)}</i>`);
      case 'candy': {
        const cols = ['#ff6aa8', '#ffffff', '#7ae0c0', '#ffe060', '#ff9ad0', '#9ad0ff'];
        return n(22, () => `<i class="fx-spr" style="left:${(r() * 94).toFixed(1)}%;background:${cols[(r() * cols.length) | 0]};animation-delay:${(-r() * 2.4).toFixed(2)}s;animation-duration:${(2 + r() * 1.4).toFixed(2)}s"></i>`);
      }
      case 'doge': return n(4, (i) => `<b class="fx-wow" style="${pos()};color:${['#ff4a8a', '#3a7ae0', '#2aa84a', '#a050e0'][i % 4]};animation-delay:${(i * 0.9).toFixed(1)}s">${DOGE[(r() * DOGE.length) | 0]}</b>`);
      case 'frozen': return n(10, () => `<i class="fx-snow" style="left:${(r() * 94).toFixed(1)}%;animation-delay:${(-r() * 5).toFixed(2)}s;animation-duration:${(4 + r() * 3).toFixed(1)}s">${px('snow', 2)}</i>`);
      case 'galaxy': return n(5, () => `<i class="fx-tw" style="${pos()}">${px('sparkP', 3)}</i>`);
      case 'shiny': return n(6, () => `<i class="fx-tw" style="${pos()}">${px('spark', 3)}</i>`);
      case 'zombie': return n(8, () => `<i class="fx-bub" style="left:${(r() * 90).toFixed(1)}%;animation-delay:${(-r() * 3).toFixed(2)}s"></i>`);
      case 'rainbow': return n(5, () => `<i class="fx-tw" style="${pos()}">${px('spark', 3)}</i>`);
      case 'tiny': return '<b class="fx-smol">smol</b>';
      default: return '';
    }
  }
  _stats(l) {
    const out = [];
    const rar = RAR[l.rarity];
    const m = l.mutation;
    if (rar) out.push(['Rarity', `<span class="eb-pips big" style="--pc:${rar.c}">${'<i></i>'.repeat(rar.t)}</span><b>${rar.n}</b>`]);
    if (m) out.push(['Mutation', `${this._mutChip(m)}${m.mult ? `<b class="eb-mult">×${esc(m.mult)}</b>` : ''}`]);
    let box = '';
    if (l.kind === 'egg') box = '1 egg';
    else if (l.kind === 'fish') box = '♂ + ♀ adults';
    else if (l.kind === 'bird') box = l.pair || /pair/i.test(l.sub || '') ? 'a pair (♂ + ♀)' : '1 hen';
    else if (l.kind === 'food') box = /scoop/i.test(l.title || '') ? `${l.n || 1} scoops` : `${l.n || 1} in a crate`;
    else if (l.kind === 'upgrade') box = `Tools Lv${l.level || ''}`;
    else box = (l.qty || 1) > 1 ? `${l.qty} to build` : '1 to build';
    out.push(['In the box', `<b>${esc(box)}</b>`]);
    if (l.stock > 0 && l.stock <= 5) out.push(['Stock', `<b class="eb-low">Only ${l.stock} left</b>`]);
    return out.map(([k, v]) => `<div class="eb-stat"><small>${k}</small><span>${v}</span></div>`).join('');
  }
  _renderDetail(l, keepFx = false) {
    const r = rng(hash(l.id) ^ 0x9e37);
    const mk = mutKey(l.mutation);
    const pct = this._pct(l);
    this.qty = Math.max(1, Math.min(this._maxQ(l), this.qty));
    const prevFx = keepFx ? this.$det.querySelector('.eb-fxl') : null;
    const fxHtml = l.locked ? '' : prevFx ? prevFx.innerHTML : this._fx(mk, r);
    const joke = this._joke(l);
    const sel = l.seller;
    const c = this._catOf(l.cat);
    const inCart = SESSION.cart.find((x) => String(x.id) === String(l.id))?.qty || 0;
    const badges = (l.badges || []).filter((b) => BADGES[b]).sort((a, b) => BADGE_ORDER.indexOf(a) - BADGE_ORDER.indexOf(b)).slice(0, 2)
      .map((b) => `<span class="eb-bdg b-${b}">${BADGES[b].ic ? px(BADGES[b].ic, 2) : ''}<b>${BADGES[b].t}</b></span>`).join('');
    const buy = l.locked
      ? `<div class="eb-dlock">${px('lockpad', 4)}<span><b>Locked</b><span>${esc(l.locked.reason || 'Not yet')}</span></span></div>`
      : `<div class="eb-dprice"><span class="eb-tag big">${this._coin(2)}<b>${fmt(l.price)}</b></span>${pct ? `<span class="eb-was"><s>${fmt(l.oldPrice)}</s><em>-${pct}%</em></span>` : ''}</div>
         <div class="eb-qrow">
           <div class="eb-step"><button class="eb-minus" aria-label="less">${px('minus', 2)}</button><b class="eb-qty">${this.qty}</b><button class="eb-plus" aria-label="more">${px('plusb', 2)}</button></div>
           <button class="eb-add" aria-label="add to cart">${px('cart', 3)}<span>Add</span>${inCart ? `<i>${inCart}</i>` : ''}</button>
         </div>
         <button class="eb-buy"><span class="eb-buyt">Buy It Now</span><span class="eb-buyc">${this._coin(2)}<b class="eb-tot">${fmt(l.price * this.qty)}</b></span></button>
         <div class="eb-poor"></div>
         <div class="eb-ship">${this._icon('moose', 1) || px('van', 2)}<span><b>Moose Express</b> · free · <span class="eb-etad">${esc(this._etaText(this._eta([{ l, qty: this.qty }]), l.eta))}</span></span></div>`;
    this.$det.innerHTML = `
      <div class="eb-dwrap mu-${esc(mk)}${l.locked ? ' locked' : ''}">
        <div class="eb-dl">
          <div class="eb-well eb-dwell" data-wid="${esc(l.id)}"><canvas class="eb-art" aria-hidden="true"></canvas>
            <div class="eb-fxl">${fxHtml}</div>
            <span class="eb-dbdgs">${l.locked ? '' : badges}</span>
            ${l.locked ? `<span class="eb-lk big">${px('lockpad', 5)}</span>` : ''}
          </div>
        </div>
        <div class="eb-dr">
          <div class="eb-dtop"><button class="eb-dback eb-back" aria-label="back">${px('back', 2)}<span>Back</span></button><span class="eb-dcat">${px(c.icon, 1)}${esc(c.name)}</span></div>
          <h2 class="eb-dt">${esc(this._short(l))}</h2>
          ${joke ? `<p class="eb-joke">“${esc(joke)}”${sel?.name ? `<cite>${esc(sel.name)} ${px('starbm', 1)}${(+sel.stars || 4.5).toFixed(1)}</cite>` : ''}</p>` : ''}
          <div class="eb-stats">${this._stats(l)}</div>
          <div class="eb-buybox">${buy}</div>
        </div>
      </div>`;
    this._observeWells(this.$det);
    this._updateTotal();
  }
  _step(d) {
    const l = this._byId(this.cur);
    if (!l || l.locked) return;
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
    if (!l || l.locked) return;
    const tot = l.price * this.qty;
    for (const te of this.$det.querySelectorAll('.eb-tot')) te.textContent = fmt(tot);
    const poor = tot > this.coins;
    this.$det.querySelector('.eb-buy')?.classList.toggle('poor', poor);
    const pe = this.$det.querySelector('.eb-poor');
    if (pe) pe.innerHTML = poor ? `${this._icon('fox_worried', 1)}<span>Need ${this._coin(1)}<b>${fmt(tot - this.coins)}</b> more</span>` : '';
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
    return s < 90 ? `~${s}s` : `~${Math.round(s / 60)} min`;
  }

  // ------------------------------------------------------------ buying
  async _buy() {
    const l = this._byId(this.cur);
    if (!l || this.busy || l.locked) return;
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
    // the parcel flies off to the orders box
    this._fly(this.$det.querySelector('.eb-well'), l, this.$ordb || this.$cart, () => this.$ordb && this._bump(this.$ordb, 'bump'));
    this._later(() => { this.busy = false; this._showReceipt([{ l, qty }]); }, 620);
  }
  _coinBurst(btn) {
    if (reduced()) return;
    const wr = this.$fx.getBoundingClientRect(), br = btn.getBoundingClientRect();
    const cx = br.left + br.width / 2 - wr.left, cy = br.top + br.height / 2 - wr.top;
    const coin = px('coinp', 3);
    let h = '';
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
      const d = 60 + Math.random() * 80;
      h += `<i class="eb-cf" style="left:${cx | 0}px;top:${cy | 0}px;--dx:${(Math.cos(a) * d) | 0}px;--dy:${(Math.sin(a) * d) | 0}px;animation-delay:${(Math.random() * 0.08).toFixed(2)}s">${coin}</i>`;
    }
    const box = document.createElement('div');
    box.className = 'eb-burstfx';
    box.innerHTML = h;
    this.$fx.appendChild(box);
    this._later(() => box.remove(), 1100);
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
  _addToCart(l, qty, fromWell) {
    if (!l || l.locked || l.stock === 0) { this._sfx('error'); return; }
    const c = SESSION.cart.find((x) => String(x.id) === String(l.id));
    const max = this._maxQ(l);
    if (c && c.qty >= max) { this._sfx('error'); this._bump(this.$cart, 'nope'); return; }
    if (c) c.qty = Math.min(max, c.qty + qty);
    else SESSION.cart.push({ id: l.id, qty: Math.min(max, qty) });
    this._sfx('ebuy_cart');
    const land = () => { this._bump(this.$cart, 'bump'); this._renderCartCount(); this._bump(this.$cartn, 'pop'); };
    if (!this._fly(fromWell, l, this.$cart, land)) land();
    if (this.cur && String(this.cur) === String(l.id)) {
      const add = this.$det.querySelector('.eb-add');
      if (add) {
        const n = SESSION.cart.find((x) => String(x.id) === String(l.id))?.qty || 0;
        add.querySelector('i')?.remove();
        add.insertAdjacentHTML('beforeend', `<i>${n}</i>`);
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
    if (n) card.querySelector('.eb-well')?.insertAdjacentHTML('beforeend', `<span class="eb-inc">${px('cartW', 2)}<b>${n}</b></span>`);
    this._bump(card, 'added');
  }
  // the item's art hops in an arc onto a header button; returns false when it can't fly
  _fly(well, l, target, onLand) {
    if (!well || !target || reduced()) return false;
    const art = artNow(l.image);
    const wr = this.$fx.getBoundingClientRect(), a = well.getBoundingClientRect(), b = target.getBoundingClientRect();
    if (!art || !a.width || !b.width) return false;
    const box = well._box || { x: a.width * 0.2, y: a.height * 0.2, w: a.width * 0.6, h: a.height * 0.6 };
    const S = 56;
    const cv = document.createElement('canvas');
    cv.className = 'eb-thumb';
    paintThumb(cv, art, S, { egg: l.kind === 'egg' ? (RAR[l.rarity] ? l.rarity : 'common') : null });
    const sx = a.left + box.x + box.w / 2 - wr.left, sy = a.top + box.y + box.h / 2 - wr.top;
    const tx = b.left + b.width / 2 - wr.left, ty = b.top + b.height / 2 - wr.top;
    const f = document.createElement('div');
    f.className = 'eb-fly';
    f.style.cssText = `left:${Math.round(sx - S / 2)}px;top:${Math.round(sy - S / 2)}px;--dx:${Math.round(tx - sx)}px;--dy:${Math.round(ty - sy)}px`;
    const inner = document.createElement('div');
    inner.className = 'eb-flyi';
    inner.appendChild(cv);
    f.appendChild(inner);
    this.$fx.appendChild(f);
    this._later(() => { f.remove(); onLand?.(); }, 560);
    return true;
  }

  // ------------------------------------------------------------ drawers: cart / orders
  _openDrawer(view) {
    if (this.busy) return;
    const was = this.drawer;
    this.drawer = view;
    this._renderDrawer();
    this.$drawer.scrollTop = 0;
    this.$drawer.setAttribute('aria-hidden', 'false');
    this.el.classList.add('eb-drawer-on');
    this._deep();
    if (!was) this._bump(this.$drawer, 'in');
    this._sfx(was ? 'click' : 'page');
  }
  _closeDrawer() {
    if (!this.drawer || this.busy) return;
    this.drawer = null;
    this.el.classList.remove('eb-drawer-on');
    this.$drawer.setAttribute('aria-hidden', 'true');
    this._deep();
    this._sfx('page');
  }
  _drawerClick(t) {
    if (t.closest('.eb-dx')) return this._closeDrawer();
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
      if (t.closest('.eb-lpic, .eb-lt') && l) { this._closeDrawer(); this._openDetail(l); }
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
    const head = (ic, title) => `<div class="eb-dhead">${ic}<b>${title}</b><button class="eb-dx" aria-label="close">${px('x', 2)}</button></div>`;
    if (v === 'orders') {
      const list = this._orders();
      this._ordIds = list.map((o) => String(o.id)).join();
      const rows = list.map((o) => `<div class="eb-ord" data-oid="${esc(o.id)}">
          <span class="eb-oic"></span>
          <span class="eb-oinfo">
            <span class="eb-otop"><b class="eb-olab">${esc(o.label || 'Parcel')}</b><span class="eb-oeta"></span></span>
            <span class="eb-oroad"><i class="eb-ofill"></i><em>${px('van', 2)}</em><u>${px('pin', 2)}</u></span>
            <span class="eb-ophl"></span>
          </span>
          ${this.o.onTrack ? `<button class="eb-otrack" data-oid="${esc(o.id)}" aria-label="watch the moose">${px('eye', 3)}</button>` : ''}
        </div>`).join('');
      this.$drawer.innerHTML = `${head(px('box', 3), 'My orders')}
        <div class="eb-dbody">${rows || `<div class="eb-dempty">${this._icon('fox_shocked', 3) || px('box', 6)}<b>No orders yet.</b><button class="eb-keep">Go shopping</button></div>`}</div>
        <div class="eb-dfoot eb-ofoot">${this._icon('moose', 1) || px('van', 2)}<span>Moose Express rides to the hut.</span></div>`;
      this._fillOrders(list);
      return;
    }
    const lines = this._cartLines();
    const ok = lines.filter((x) => !x.l.locked && x.l.stock !== 0);
    const total = ok.reduce((s, x) => s + x.l.price * x.qty, 0);
    const after = this.coins - total;
    const n = lines.reduce((s, x) => s + x.qty, 0);
    const body = lines.length ? lines.map((x) => this._line(x)).join('') : `<div class="eb-dempty">${this._icon('fox_worried', 3) || px('cart', 6)}<b>Your cart is empty.</b><button class="eb-keep">Keep shopping</button></div>`;
    this.$drawer.innerHTML = `${head(px('cart', 3), `Cart${n ? ` <em>${n}</em>` : ''}`)}
      <div class="eb-dbody">${body}</div>
      ${lines.length ? `<div class="eb-dfoot">
        <div class="eb-sum"><span>Total</span><i></i><b>${this._coin(1)}${fmt(total)}</b></div>
        <div class="eb-sum sm${after < 0 ? ' bad' : ''}"><span>Wallet after</span><i></i><b>${this._coin(1)}${fmt(after)}</b></div>
        <div class="eb-sum sm"><span>${this._icon('moose', 1) || px('van', 1)} Moose Express</span><i></i><b class="eb-free">FREE · ${esc(this._etaText(this._eta(ok)))}</b></div>
        ${ok.length < lines.length ? `<div class="eb-cwarn">${px('lockpad', 2)}<span>Locked items stay in the cart.</span></div>` : ''}
        <button class="eb-pay${after < 0 || !ok.length ? ' poor' : ''}"><span class="eb-buyt">Place order</span></button>
      </div>` : ''}`;
    this._thumbs(this.$drawer, 44);
  }
  _fillOrders(list) {
    const rows = this.$drawer.querySelectorAll('.eb-ord');
    list.forEach((o, i) => {
      const row = rows[i];
      if (!row) return;
      const prog = `${(Math.max(0.04, Math.min(1, +o.progress || 0)) * 100).toFixed(1)}%`;
      if (row.dataset.ph !== o.phase) {
        row.dataset.ph = o.phase;
        row.className = `eb-ord p-${o.phase}`;
        row.querySelector('.eb-oic').innerHTML = o.phase === 'packing' ? px('box', 3) : this._icon('moose', 2) || px('van', 3);
        row.querySelector('.eb-ophl').innerHTML = PHASES.map((p, j) => `<i class="${j <= PHASES.indexOf(o.phase) ? 'on' : ''}"></i>`).join('') + `<span>${PHASE[o.phase] || o.phase}</span>`;
        const tb = row.querySelector('.eb-otrack');
        if (tb) tb.hidden = o.phase === 'delivered';
      }
      row.querySelector('.eb-oeta').textContent = o.phase === 'delivered' ? 'at the hut' : o.eta < 0 ? 'at sunrise' : `~${Math.max(1, Math.ceil(o.eta))}s`;
      row.querySelector('.eb-ofill').style.width = prog;
      row.querySelector('.eb-oroad em').style.left = prog;
    });
  }
  _line(x) {
    const l = x.l;
    const bad = l.locked || l.stock === 0;
    return `<div class="eb-line${bad ? ' bad' : ''}" data-lid="${esc(l.id)}">
      <span class="eb-lpic"><canvas class="eb-thumb" data-tid="${esc(l.id)}"></canvas></span>
      <span class="eb-linfo">
        <span class="eb-lt">${esc(this._short(l))}</span>
        ${bad ? `<span class="eb-lwarn">${px('lockpad', 1)}${esc(this._why(l))}</span>` : `<span class="eb-step sm"><button class="eb-lminus" aria-label="less">${px('minus', 1)}</button><b>${x.qty}</b><button class="eb-lplus" aria-label="more">${px('plusb', 1)}</button></span>`}
      </span>
      <b class="eb-lsum">${this._coin(1)}${fmt(l.price * x.qty)}</b>
      <button class="eb-lrm" aria-label="remove">${px('trash', 2)}</button>
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
      this._deep();
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
      if (n) this._bump(this.$ordb, 'bump');
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
    this._rcLines = lines;
    const eta = this._etaText(this._eta(lines), lines[0]?.l.eta);
    this.$rc.innerHTML = `
      <div class="eb-slot"><i></i></div>
      <div class="eb-paperw"><div class="eb-paper" style="clip-path:${ZIGZAG}">
        <div class="eb-ph"><span class="eb-mini"><i class="l1">e</i><i class="l2">-</i><i class="l3">B</i><i class="l4">u</i><i class="l5">y</i></span><small>#${no} · ${pad(d.getHours())}:${pad(d.getMinutes())}</small></div>
        ${shown.map((x) => `<div class="eb-pi"><canvas class="eb-thumb" data-tid="${esc(x.l.id)}" data-sz="28"></canvas><span class="eb-pin">${esc(this._short(x.l))}</span><span class="eb-pq">×${x.qty}</span></div>`).join('')}
        ${lines.length > shown.length ? `<div class="eb-pmore">+ ${lines.length - shown.length} more</div>` : ''}
        <div class="eb-pl tot"><span>TOTAL</span><i></i><span>${this._coin(1)}${fmt(total)}</span></div>
        <div class="eb-pbar">${Array.from({ length: 30 }, (_, i) => `<i style="width:${1 + (hash(no + i) % 3)}px"></i>`).join('')}</div>
        <div class="eb-stamp"><b>SOLD!</b></div>
        <div class="eb-road"><span class="eb-rider">${this._icon('moose', 2)}${px('bike', 3)}</span></div>
        <div class="eb-eta">${px('clock', 2)}Moose Express · ${esc(eta)}</div>
      </div></div>`;
    this._thumbs(this.$rc, 28);
    this.$rc.hidden = false;
    this.$rc.classList.remove('show', 'hide'); void this.$rc.offsetWidth;
    this.$rc.classList.add('show');
    this._sfx('paper');
    this._later(() => this._sfx('stamp'), 800);
  }
  _closeReceipt() {
    if (!this.$rc.classList.contains('show')) return;
    this._sfx('page');
    this.$rc.classList.remove('show');
    this.$rc.classList.add('hide');
    this._later(() => { this.$rc.hidden = true; this.$rc.classList.remove('hide'); this.$rc.innerHTML = ''; }, 320);
    const l = this.cur && this._byId(this.cur);
    if (l && !(l.stock === 0)) { this.qty = 1; this._renderDetail(l, true); } else if (this.cur) this._closeDetail();
  }
}

export const __ebuyDev = { dpr };
