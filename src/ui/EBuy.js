// e-Buy: the in-game shop, a cute parody of eBay running on Reynard's old
// pixel laptop. Chunky browser window, clickbait product cards, a detail view
// with mutation effects, a juicy "Buy It Now" button and a printed receipt.
//
//   const shop = openEBuy(root, { listings, coins, icon, sfx, onBuy, onClose })
//   shop.refresh({ coins, listings })   // either field optional
//   shop.close()                        // remove at once (does NOT call onClose)
//   shop.el                             // the overlay element (absolute, fills root)
//
// listing: { id, cat: 'eggs'|'plants'|'decor'|'restaurant'|'gear', title, sub?, price, oldPrice?, rarity?,
//   mutation?: { id, name, color, mult }, image: HTMLCanvasElement | dataURL string,
//   badges?: ['hot','new','last','sale'], seller?: { name, stars, sold }, stock?, eta?: string,
//   locked?: { reason, icon } }
// onBuy(listing, qty) -> boolean | Promise<boolean>   (false = can't afford/failed: the button shakes)
// icon(name, scale) -> '<img ...>' HTML (e.g. spriteImg). sfx(name) -> plays a sound.
// onClose() is called after the player closes the shop (back arrow at the top level, tab ✕ or Esc).
//
// `root` should be a positioned element with a size; the shop fills it.
import './ebuy.css';

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

// Pixel-grid SVGs (own little icon set so the shop never depends on sprites
// that might not exist). Strings are built once and cached.
const PX = {
  arrow: [['...a....', '..aa....', '.aaaaaaa', 'aabbbbba', '.aaaaaaa', '..aa....', '...a....'], { a: '#2a1a14', b: '#fff4dc' }],
  arrowR: [['....a...', '....aa..', 'aaaaaaa.', 'abbbbbaa', 'aaaaaaa.', '....aa..', '....a...'], { a: '#2a1a14', b: '#fff4dc' }],
  reload: [['..aaaa.', '.a....a', 'a....aaa', 'a.....a.', 'a.......', '.a....a.', '..aaaa..'], { a: '#2a1a14' }],
  x: [['aa...aa', 'aaa.aaa', '.aaaaa.', '..aaa..', '.aaaaa.', 'aaa.aaa', 'aa...aa'], { a: '#2a1a14' }],
  bigx: [['.aa.....aa.', 'abba...abba', 'abbba.abbba', '.abbbabbba.', '..abbbbba..', '...abbba...', '..abbbbba..', '.abbbabbba.', 'abbba.abbba', 'abba...abba', '.aa.....aa.'], { a: '#5a0e14', b: '#ff3b3b' }],
  flame: [['...a...', '..aa...', '..aba..', '.abba.a', '.abbbaa', 'abbcbba', 'abccbba', 'abcccba', '.abcba.'], { a: '#d9453b', b: '#ffa030', c: '#ffe478' }],
  blueflame: [['...a...', '..aa...', '..aba..', '.abba.a', '.abbbaa', 'abbcbba', 'abccbba', 'abcccba', '.abcba.'], { a: '#3a6ae0', b: '#7ad0ff', c: '#ffffff' }],
  snow: [['...a...', '.a.a.a.', '..aaa..', 'aaabaaa', '..aaa..', '.a.a.a.', '...a...'], { a: '#e8f8ff', b: '#7ad0ff' }],
  spark: [['...a...', '...a...', '..aba..', 'aabbbaa', '..aba..', '...a...', '...a...'], { a: '#fff6b0', b: '#ffffff' }],
  sparkY: [['...a...', '...a...', '..aba..', 'aabbbaa', '..aba..', '...a...', '...a...'], { a: '#ffb020', b: '#fff2a0' }],
  sparkP: [['..a..', '..a..', 'aabaa', '..a..', '..a..'], { a: '#c9a0ff', b: '#ffffff' }],
  candy: [['a..bbb..a', 'aabcbcbaa', 'aabbcbbaa', 'a..bbb..a'], { a: '#ff7ab0', b: '#ff4f8f', c: '#fff' }],
  titan: [['...a...', '..aba..', '.abbba.', 'abbbbba', '..aba..', '..aba..', '..aaa..'], { a: '#2a1a14', b: '#ffd23f' }],
  doge: [['.a.....a.', 'aba...aba', 'abbaaabba', 'abbbbbbba', 'abkbbbkba', 'abbwwwbba', '.abwkwba.', '..aaaaa..'], { a: '#6a3a10', b: '#f0a838', w: '#fff4dc', k: '#2a1a14' }],
  skull: [['.aaaaa.', 'abbbbba', 'abkbkba', 'abbbbba', '.abkba.', '..aaa..'], { a: '#1f3f2c', b: '#9ee07a', k: '#1f3f2c' }],
  planet: [['...aaa...', '..abbba..', 'cabbbbbac', '.ccbbbcc.', '..accca..', '...aaa...'], { a: '#3a1a6a', b: '#a070ff', c: '#ffd2ff' }],
  rainbow: [['..rrrrr..', '.rooooor.', 'royyyyyor', 'oyg...gyo', 'yg.....gy'], { r: '#ff4a4a', o: '#ffa030', y: '#ffe040', g: '#5ad06a' }],
  shiny: [['...a...', '..aba..', '.abcba.', 'abcccba', '.abcba.', '..aba..', '...a...'], { a: '#c08010', b: '#ffd23f', c: '#fffbe0' }],
  tiny: [['.a.aa', 'aaaaa', '.a.aa'], { a: '#2a1a14' }],
  dot: [['aa', 'aa'], { a: '#ffffff' }],
  cart: [['aa.........', '.a.........', '.aaaaaaaaaa', '.abbbbbbbba', '.abbbbbbba.', '..abbbbbba.', '..aaaaaaaa.', '...a....a..', '..aaa..aaa.'], { a: '#2a1a14', b: '#ffd23f' }],
  antler: [['k.k.k....', 'kbkbk.k..', 'kbbbbkbk.', '.kbbbbbbk', '..kkbbkk.', '....kbk..', '....kk...'], { k: '#2a1a14', b: '#d8a060' }],
  lockpad: [['..aaa..', '.a...a.', '.a...a.', 'aaaaaaa', 'abbbbba', 'abbabba', 'abbabba', 'aaaaaaa'], { a: '#2a1a14', b: '#b8b0a0' }],
  bike: [['..........aa...', '.....aaaaaa....', '....a....a.....', '.aaa.a..a.aaa..', 'a...a.aa.a...a.', 'a.a.a....a.a.a.', 'a...a....a...a.', '.aaa......aaa..'], { a: '#2a1a14' }],
  eye: [['..aaa..', '.abbba.', 'abbkbba', '.abbba.', '..aaa..'], { a: '#2a1a14', b: '#fff', k: '#2a1a14' }],
  clock: [['.aaaaa.', 'abbbbba', 'abbabba', 'abbaaba', 'abbbbba', '.aaaaa.'], { a: '#2a1a14', b: '#fff4dc' }],
  box: [['.aaaaaa.', 'abbbbbba', 'aaaaaaaa', 'acccccca', 'accddcca', 'acccccca', 'aaaaaaaa'], { a: '#2a1a14', b: '#e2b070', c: '#c88a4c', d: '#fff4dc' }],
  mag: [['.aaa...', 'abbba..', 'abbba..', 'abbba..', '.aaaa..', '....aa.', '.....aa'], { a: '#2a1a14', b: '#bfe8ff' }],
  starbm: [['...a...', '..aba..', 'aabbbaa', '.abbba.', '.ab.ba.', 'aa...aa'], { a: '#2a1a14', b: '#ffd23f' }],
  plus: [['.aa.', 'aaaa', 'aaaa', '.aa.'], { a: '#2a1a14' }],
};
const pxCache = new Map();
function px(name, s = 3, cls = '') {
  const k = name + '|' + s + '|' + cls;
  let out = pxCache.get(k);
  if (out) return out;
  const [rows, pal] = PX[name] || PX.dot;
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  let r = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = pal[row[x]];
      if (!c) { x++; continue; }
      let n = 1;
      while (row[x + n] === row[x]) n++;
      r += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${c}"/>`;
      x += n;
    }
  });
  out = `<svg class="eb-px ${cls}" viewBox="0 0 ${w} ${h}" width="${w * s}" height="${h * s}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
  pxCache.set(k, out);
  return out;
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
const CATS = [
  { id: 'eggs', name: 'Eggs', icon: 'egg' },
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
};
const REVIEWS = {
  eggs: ['10/10 egg would buy again', 'it hatched. i cried.', 'egg arrived as egg. 5 stars', 'my son is now a fish', 'smells like profit', 'wow. just wow.'],
  farm: ['duck arrived. duck is judging me', 'HONK HONK HONK (5 stars)', 'worms were very worm', 'my geese now run the pond', 'quack.'],
  plants: ['bush is very bush', 'ate it. no regrets', 'grew 2 berries & a dream', 'leafy. green. 10/10'],
  decor: ['my pond is now *aesthetic*', 'gnome stares at me. love it', 'bears said "nice". high praise'],
  restaurant: ['bears sat on it. it held', 'fancy!! like a real restaurant', 'chair 10/10 would sit'],
  gear: ['tool did tool things', 'very sturdy. hit a bear w/ it (sorry)', 'works great, no refunds tho'],
};
const NAMES = ['Gerald B.', 'Linda (bear)', 'Big Doug', 'xX_moose_Xx', 'Mrs. Beaver', 'Kevin', 'Brenda from HR', 'Chad Salmon', 'Deb'];
const TICKER = ['FREE MOOSE SHIPPING', 'ALL SALES FINAL', '0% REFUNDS', 'TRUSTED SELLER (me)', 'DEALS DEALS DEALS', 'NOT A SCAM', 'eh?'];
const ZIGZAG = (() => {
  const n = 22, pts = ['0 0', '100% 0'];
  for (let i = n; i >= 0; i--) pts.push(`${((i / n) * 100).toFixed(2)}% ${i % 2 ? '100%' : 'calc(100% - 7px)'}`);
  return `polygon(${pts.join(',')})`;
})();
const DOGE = ['wow', 'such egg', 'much rare', 'very buy', 'amaze', 'so fish'];

// ---------------------------------------------------------------- component
export function openEBuy(root, opts = {}) {
  const shop = new EBuy(root, opts);
  return { refresh: (o) => shop.refresh(o), close: () => shop.destroy(), el: shop.el };
}

class EBuy {
  constructor(root, o) {
    this.root = root;
    this.o = o;
    this.listings = Array.isArray(o.listings) ? o.listings : [];
    this.coins = +o.coins || 0;
    this.shownCoins = this.coins;
    this.cat = this._firstCat();
    this.q = '';
    this.cur = null; // id of the open listing
    this.qty = 1;
    this.cartN = 0;
    this.busy = false;
    this.dead = false;
    this._timers = new Set();
    this._build();
    this._sfx('crt_on');
    // open straight onto one listing (the tutorial points you at it)
    if (o.focus) {
      const l = this._byId(o.focus);
      if (l) {
        this.cat = l.cat;
        this._renderGrid();
        this._later(() => this._openDetail(l), 450);
      }
    }
  }

  // ------------------------------------------------------------ utils
  _icon(name, s = 2) { try { return this.o.icon ? String(this.o.icon(name, s) || '') : ''; } catch { return ''; } }
  _sfx(name) { try { this.o.sfx?.(name); } catch { /* ignore */ } }
  _later(fn, ms) {
    const t = setTimeout(() => { this._timers.delete(t); if (!this.dead) fn(); }, ms);
    this._timers.add(t);
    return t;
  }
  _firstCat() {
    const c = CATS.find((c) => this.listings.some((l) => l.cat === c.id));
    return (c || CATS[0]).id;
  }
  _byId(id) { return this.listings.find((l) => String(l.id) === String(id)); }

  // ------------------------------------------------------------ build
  _build() {
    const el = (this.el = document.createElement('div'));
    el.className = 'ebuy eb-in';
    const ticker = TICKER.map((t) => `<span>${esc(t)}</span>${px('spark', 2)}`).join('');
    el.innerHTML = `
      <div class="eb-laptop">
        <div class="eb-bezel">
          <div class="eb-note"><b>pw:</b> money<br>money123</div>
          <div class="eb-screen">
            <div class="eb-win">
              <div class="eb-tabs">
                <div class="eb-tab"><span class="eb-fav">${px('cart', 2)}</span><span class="eb-tabt">e-Buy — Buy It Now!</span><button class="eb-tabx eb-close" aria-label="close">${px('x', 2)}</button></div>
                <div class="eb-tab2">${px('plus', 2)}</div>
                <div class="eb-dots"><i></i><i></i><i></i></div>
              </div>
              <div class="eb-nav">
                <button class="eb-nb eb-back" aria-label="back">${px('arrow', 3)}</button>
                <button class="eb-nb eb-fwd" tabindex="-1" aria-hidden="true">${px('arrowR', 3)}</button>
                <button class="eb-nb eb-reload" tabindex="-1" aria-hidden="true">${px('reload', 3)}</button>
                <div class="eb-url"><span class="eb-lock">${px('lockpad', 2)}</span><span class="eb-urlt">www.e-buy.ca<i class="eb-path">/deals</i></span>${px('starbm', 2, 'eb-bm')}</div>
                <div class="eb-wallet" title="coins"><span class="eb-coin">${this._icon('coin', 2)}</span><b class="eb-bal">${fmt(this.coins)}</b></div>
                <div class="eb-cart" title="cart">${px('cart', 3)}<i class="eb-cartn"></i></div>
              </div>
              <div class="eb-page">
                <div class="eb-head">
                  <div class="eb-logo" aria-label="e-Buy"><span class="l1">e</span><span class="l2">-</span><span class="l3">B</span><span class="l4">u</span><span class="l5">y<i class="eb-antler">${px('antler', 3)}</i></span></div>
                  <label class="eb-search">${px('mag', 3)}<input class="eb-q" type="text" placeholder="search for anything" autocomplete="off" spellcheck="false" /><button class="eb-qx" aria-label="clear">${px('x', 2)}</button></label>
                </div>
                <div class="eb-cats">${CATS.map((c) => `<button class="eb-cat" data-cat="${c.id}"><span class="eb-cati">${this._icon(c.icon, 2)}</span><span class="eb-catn">${c.name}</span><i class="eb-catc"></i></button>`).join('')}</div>
                <div class="eb-ticker"><div class="eb-tick">${ticker}${ticker}</div></div>
                <div class="eb-scroll"><div class="eb-grid"></div><div class="eb-foot">© 1999 e-Buy Inc. • a Reynard company</div></div>
                <div class="eb-det" hidden></div>
                <div class="eb-rc" hidden></div>
              </div>
              <div class="eb-fx"></div>
            </div>
            <div class="eb-scan"></div>
          </div>
          <div class="eb-chin"><span class="eb-brand">REYNARD·TOP 3000</span><i class="eb-led"></i></div>
        </div>
        <div class="eb-base"><i></i></div>
      </div>`;
    this.root.appendChild(el);
    const $ = (s) => el.querySelector(s);
    this.$grid = $('.eb-grid');
    this.$scroll = $('.eb-scroll');
    this.$det = $('.eb-det');
    this.$rc = $('.eb-rc');
    this.$fx = $('.eb-fx');
    this.$bal = $('.eb-bal');
    this.$wallet = $('.eb-wallet');
    this.$path = $('.eb-path');
    this.$q = $('.eb-q');
    this.$cartn = $('.eb-cartn');

    this._onClick = (e) => this._click(e);
    el.addEventListener('click', this._onClick);
    let lastHover = 0;
    el.addEventListener('pointerover', (e) => {
      const c = e.target.closest?.('.eb-card,.eb-cat,.eb-buy');
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
      this._renderGrid();
    });
    this.$q.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); if (this.$q.value) { this.$q.value = ''; this.q = ''; this._renderGrid(); } else this.$q.blur(); } });
    this._onKey = (e) => {
      if (e.key !== 'Escape' || this.dead) return;
      e.preventDefault();
      this._back();
    };
    document.addEventListener('keydown', this._onKey);
    this._renderGrid();
    this._later(() => el.classList.remove('eb-in'), 900);
  }

  // ------------------------------------------------------------ events
  _click(e) {
    const t = e.target;
    if (t.closest('.eb-back')) return this._back();
    if (t.closest('.eb-close')) return this._userClose();
    if (t.closest('.eb-reload')) { this._sfx('click'); this.el.querySelector('.eb-reload').classList.remove('spin'); void this.el.offsetWidth; this.el.querySelector('.eb-reload').classList.add('spin'); return; }
    if (t.closest('.eb-qx')) { e.preventDefault(); this.$q.value = ''; this.q = ''; this._sfx('click'); this._renderGrid(); return; }
    const cat = t.closest('.eb-cat');
    if (cat) {
      this._sfx('click');
      this.cat = cat.dataset.cat;
      if (this.q) { this.q = ''; this.$q.value = ''; }
      if (this.cur) this._closeDetail(true);
      this._renderGrid();
      this.$scroll.scrollTop = 0;
      return;
    }
    const card = t.closest('.eb-card');
    if (card) {
      const l = this._byId(card.dataset.id);
      if (!l) return;
      if (l.locked || l.stock === 0) {
        this._sfx('error');
        card.classList.remove('eb-nope'); void card.offsetWidth; card.classList.add('eb-nope');
        return;
      }
      return this._openDetail(l);
    }
    if (t.closest('.eb-minus')) return this._step(-1);
    if (t.closest('.eb-plus')) return this._step(1);
    if (t.closest('.eb-buy')) return this._buy();
    if (t.closest('.eb-rc')) return this._closeReceipt();
  }
  _back() {
    if (this.$rc.classList.contains('show')) return this._closeReceipt();
    if (this.cur) { this._sfx('page'); return this._closeDetail(); }
    if (this.q) { this.q = ''; this.$q.value = ''; this._sfx('click'); return this._renderGrid(); }
    this._userClose();
  }
  _userClose() {
    if (this.dead || this.el.classList.contains('eb-out')) return;
    this._sfx('crt_off');
    this.el.classList.add('eb-out');
    this._later(() => { this.destroy(); try { this.o.onClose?.(); } catch (err) { console.error(err); } }, 420);
  }
  destroy() {
    if (this.dead) return;
    this.dead = true;
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    cancelAnimationFrame(this._coinRaf);
    document.removeEventListener('keydown', this._onKey);
    this.el.remove();
  }

  // ------------------------------------------------------------ refresh
  refresh({ coins, listings } = {}) {
    if (this.dead) return;
    if (Array.isArray(listings)) { this.listings = listings; this._renderGrid(); }
    if (coins != null && +coins !== this.coins) this._setCoins(+coins);
    if (this.cur) {
      const l = this._byId(this.cur);
      if (!l) this._closeDetail(true);
      else if (Array.isArray(listings) && !this.busy) this._renderDetail(l, true);
      else this._updateTotal();
    }
  }
  _setCoins(v) {
    const from = this.shownCoins, to = v, t0 = performance.now(), dur = 550;
    this.coins = v;
    this.$wallet.classList.remove('up', 'down'); void this.$wallet.offsetWidth;
    this.$wallet.classList.add(to < from ? 'down' : 'up');
    cancelAnimationFrame(this._coinRaf);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      this.shownCoins = Math.round(from + (to - from) * (1 - (1 - k) ** 3));
      this.$bal.textContent = fmt(this.shownCoins);
      if (k < 1 && !this.dead) this._coinRaf = requestAnimationFrame(step);
    };
    this._coinRaf = requestAnimationFrame(step);
    this._updateTotal();
  }

  // ------------------------------------------------------------ grid
  _filtered() {
    if (!this.q) return this.listings.filter((l) => l.cat === this.cat);
    const words = this.q.split(/\s+/).filter(Boolean);
    return this.listings.filter((l) => {
      const hay = [l.title, l.sub, l.cat, l.rarity, l.mutation?.name, l.seller?.name, ...(l.badges || [])].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }
  _renderGrid() {
    for (const b of this.el.querySelectorAll('.eb-cat')) {
      const n = this.listings.filter((l) => l.cat === b.dataset.cat).length;
      b.classList.toggle('on', !this.q && b.dataset.cat === this.cat);
      b.querySelector('.eb-catc').textContent = n || '';
    }
    this.el.classList.toggle('eb-searching', !!this.q);
    if (!this.cur) this.$path.textContent = this.q ? '/sch?q=' + this.q.replace(/\s+/g, '+') : '/' + this.cat;
    const list = this._filtered();
    if (!list.length) {
      this.$grid.innerHTML = `<div class="eb-empty">${this._icon('fox_worried', 3) || px('mag', 8)}<b>0 results</b><span>${px('arrow', 2)} try “egg”</span></div>`;
      return;
    }
    this.$grid.innerHTML = list.map((l, i) => this._card(l, i)).join('');
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
    return `<span class="eb-stars" title="${n.toFixed(1)}">${h}</span>`;
  }
  _mutChip(m, big = false) {
    if (!m) return '';
    const k = mutKey(m);
    const ic = k === 'doublehot' ? px('flame', big ? 3 : 2) + px('flame', big ? 3 : 2) : px(MUT_ICON[k] || 'spark', big ? 3 : 2);
    return `<span class="eb-mchip mu-${esc(k)}${big ? ' big' : ''}" style="--mc:${esc(m.color || '#ff6ad5')}">${ic}<b>${esc(m.name || m.id)}</b>${m.mult && big ? `<i>×${esc(m.mult)}</i>` : ''}${k === 'doge' ? '<u>wow</u>' : ''}</span>`;
  }
  _eggIcon(l, s) { return this._icon(`egg_${RAR[l.rarity] ? l.rarity : 'common'}_0`, s) || this._icon('egg', s); }
  _pct(l) { return l.oldPrice > l.price ? Math.round((1 - l.price / l.oldPrice) * 100) : 0; }
  _card(l, i) {
    const r = rng(hash(l.id));
    const m = l.mutation, mk = mutKey(m);
    const pct = this._pct(l);
    const badges = (l.badges || []).filter((b) => BADGES[b]).map((b) => `<span class="eb-bdg b-${b}">${BADGES[b].ic ? px(BADGES[b].ic, 2) : ''}${BADGES[b].t}</span>`).join('');
    const left = l.stock > 0 && l.stock <= 3 ? `<span class="eb-left">Only ${l.stock} left!</span>` : '';
    const soldout = l.stock === 0;
    const locked = l.locked;
    const sp = [0, 1, 2].map(() => `<i class="eb-tw" style="left:${8 + r() * 80}%;top:${8 + r() * 70}%;animation-delay:${(r() * 3).toFixed(2)}s">${px('spark', 2)}</i>`).join('');
    const sel = l.seller;
    return `<button class="eb-card${locked ? ' locked' : ''}${soldout ? ' soldout' : ''}${mk ? ' mu-' + mk : ''}" data-id="${esc(l.id)}" style="${this._rarVars(l)};--d:${(i % 12) * 0.06}s;--bd:${(r() * 2).toFixed(2)}s">
      <span class="eb-pic">
        <img class="eb-img" src="${esc(imgSrc(l.image))}" alt="" draggable="false" />
        ${l.cat === 'eggs' ? `<span class="eb-eggm">${this._eggIcon(l, 2)}</span>` : ''}
        ${sp}<i class="eb-shine"></i>
        <span class="eb-bdgs">${badges}</span>
        ${pct ? `<span class="eb-burst"><b>-${pct}%!!</b></span>` : ''}
        ${m ? `<span class="eb-mpos">${this._mutChip(m)}</span>` : ''}
        ${l.rarity && RAR[l.rarity] ? `<span class="eb-rar">${RAR[l.rarity].n}</span>` : ''}
        ${locked ? `<span class="eb-lockov">${this._icon('lock', 3) || px('lockpad', 4)}</span>` : ''}
        ${soldout ? `<span class="eb-soldov">SOLD OUT</span>` : ''}
      </span>
      <span class="eb-info">
        <span class="eb-title">${esc(l.title)}</span>
        ${locked ? `<span class="eb-hint">${locked.icon ? this._icon(locked.icon, 1) : px('lockpad', 1)}<span>${esc(locked.reason || 'locked')}</span></span>` : ''}
        <span class="eb-prow">${l.oldPrice > l.price ? `<s class="eb-old">${fmt(l.oldPrice)}</s>` : ''}<span class="eb-tag">${this._icon('coin', 1)}<b>${fmt(l.price)}</b></span></span>
        <span class="eb-meta">${sel ? this._stars(sel.stars) : ''}${sel?.sold != null ? `<span class="eb-sold">${fmtK(sel.sold)} sold</span>` : ''}</span>
        ${sel?.name || left ? `<span class="eb-sel">${sel?.name ? `<span class="eb-seln">${esc(sel.name)}</span>` : ''}${left}</span>` : ''}
      </span>
    </button>`;
  }

  // ------------------------------------------------------------ detail
  _openDetail(l) {
    this._sfx('page');
    this.cur = l.id;
    this.qty = 1;
    this._renderDetail(l);
    this.$det.hidden = false;
    this.$det.classList.remove('show'); void this.$det.offsetWidth;
    this.$det.classList.add('show');
    this.el.classList.add('eb-detail');
    this.$path.textContent = '/itm/' + String(l.id).replace(/[^\w-]/g, '').slice(0, 18);
  }
  _closeDetail(instant = false) {
    this.cur = null;
    this.el.classList.remove('eb-detail');
    this.$det.classList.remove('show');
    const done = () => { if (!this.cur) { this.$det.hidden = true; this.$det.innerHTML = ''; } };
    if (instant) done(); else this._later(done, 260);
    this._renderGrid();
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
    const maxQ = l.stock > 0 ? Math.min(99, l.stock) : 99;
    this.qty = Math.max(1, Math.min(maxQ, this.qty));
    const pool = REVIEWS[l.cat] || REVIEWS.eggs;
    const i0 = (r() * pool.length) | 0, i1 = (i0 + 1 + ((r() * (pool.length - 1)) | 0)) % pool.length;
    const n0 = (r() * NAMES.length) | 0, n1 = (n0 + 1 + ((r() * (NAMES.length - 1)) | 0)) % NAMES.length;
    const reviews = [[pool[i0], NAMES[n0], 5], [pool[i1], NAMES[n1], 4]];
    const stats = [];
    if (rar) stats.push(`<span class="eb-stat" title="${rar.n}"><span class="eb-gems">${'<i></i>'.repeat(rar.t)}</span></span>`);
    if (m?.mult) stats.push(`<span class="eb-stat" title="value">${this._icon('coin', 1)}<b>×${esc(m.mult)}</b></span>`);
    stats.push(`<span class="eb-stat" title="delivery">${px('clock', 2)}<b>${esc(l.eta || '1 day')}</b></span>`);
    if (l.stock != null) stats.push(`<span class="eb-stat${l.stock <= 3 ? ' low' : ''}" title="stock">${px('box', 2)}<b>${l.stock}</b></span>`);
    stats.push(`<span class="eb-stat" title="watching">${px('eye', 2)}<b>${3 + ((r() * 40) | 0)}</b></span>`);
    const sel = l.seller;
    const fxHtml = keepFx && this.$det.querySelector('.eb-fxl') ? this.$det.querySelector('.eb-fxl').innerHTML : this._fx(mk, r);
    const badges = (l.badges || []).filter((b) => BADGES[b]).map((b) => `<span class="eb-bdg b-${b}">${BADGES[b].ic ? px(BADGES[b].ic, 2) : ''}${BADGES[b].t}</span>`).join('');
    this.$det.innerHTML = `
      <div class="eb-dwrap mu-${esc(mk)}" style="${this._rarVars(l)}">
        <div class="eb-dl">
          <div class="eb-well">
            <i class="eb-rays"></i><i class="eb-halo"></i>
            <img class="eb-bigimg" src="${esc(imgSrc(l.image))}" alt="" draggable="false" />
            ${l.cat === 'eggs' ? `<span class="eb-eggm big">${this._eggIcon(l, 4)}</span>` : ''}
            <div class="eb-fxl">${fxHtml}</div>
            ${pct ? `<span class="eb-burst big"><b>-${pct}%!!</b></span>` : ''}
            <span class="eb-bdgs">${badges}</span>
          </div>
        </div>
        <div class="eb-dr">
          <h2 class="eb-dt">${esc(l.title)}</h2>
          ${l.sub ? `<div class="eb-dsub">${esc(l.sub)}</div>` : ''}
          <div class="eb-chips">${rar ? `<span class="eb-rchip">${rar.n}</span>` : ''}${this._mutChip(m, true)}</div>
          <div class="eb-stats">${stats.join('')}</div>
          ${sel ? `<div class="eb-dsel"><span class="eb-ava">${this._icon('fox_smug', 1) || px('doge', 2)}</span><b>${esc(sel.name)}</b>${this._stars(sel.stars)}<span class="eb-sold">${fmtK(sel.sold || 0)} sold</span></div>` : ''}
          <div class="eb-revs">${reviews.map(([t, n, s]) => `<div class="eb-rev">${this._stars(s)}<q>${esc(t)}</q><cite>— ${esc(n)}</cite></div>`).join('')}</div>
          <div class="eb-buyrow">
            <div class="eb-dprice">${l.oldPrice > l.price ? `<s class="eb-old">${fmt(l.oldPrice)}</s>` : ''}<span class="eb-tag big">${this._icon('coin', 2)}<b>${fmt(l.price)}</b></span></div>
            <div class="eb-step"><button class="eb-minus" aria-label="less">−</button><b class="eb-qty">${this.qty}</b><button class="eb-plus" aria-label="more">+</button></div>
          </div>
          <button class="eb-buy"><span class="eb-buyt">Buy It Now</span><span class="eb-buyc">${this._icon('coin', 2)}<b class="eb-tot">${fmt(l.price * this.qty)}</b></span><i class="eb-buyx">${px('bigx', 5)}</i></button>
          <div class="eb-ship">${this._icon('moose', 1)}${px('bike', 2)}<span>Moose Express</span></div>
        </div>
      </div>`;
    this._updateTotal();
  }
  _step(d) {
    const l = this._byId(this.cur);
    if (!l) return;
    const maxQ = l.stock > 0 ? Math.min(99, l.stock) : 99;
    const q = Math.max(1, Math.min(maxQ, this.qty + d));
    const qe = this.$det.querySelector('.eb-qty');
    if (q === this.qty) { this._sfx('error'); qe?.classList.remove('bump', 'nope'); void qe?.offsetWidth; qe?.classList.add('nope'); return; }
    this.qty = q;
    this._sfx('tick');
    if (qe) { qe.textContent = q; qe.classList.remove('bump', 'nope'); void qe.offsetWidth; qe.classList.add('bump'); }
    this._updateTotal();
  }
  _updateTotal() {
    const l = this.cur && this._byId(this.cur);
    if (!l) return;
    const tot = l.price * this.qty;
    const te = this.$det.querySelector('.eb-tot');
    if (te) te.textContent = fmt(tot);
    this.$det.querySelector('.eb-buy')?.classList.toggle('poor', tot > this.coins);
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
    try { ok = !!(await this.o.onBuy?.(l, this.qty)); } catch (err) { console.error(err); ok = false; }
    if (this.dead) return;
    btn.classList.remove('press');
    if (!ok) {
      this.busy = false;
      this._sfx('error');
      btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake');
      this.$wallet.classList.remove('up', 'down', 'nope'); void this.$wallet.offsetWidth; this.$wallet.classList.add('nope');
      return;
    }
    this._sfx('buy');
    this._coinBurst(btn);
    this.cartN += this.qty;
    this.$cartn.textContent = this.cartN;
    const cart = this.el.querySelector('.eb-cart');
    cart.classList.remove('bump'); void cart.offsetWidth; cart.classList.add('bump');
    const qty = this.qty;
    this._later(() => { this.busy = false; this._showReceipt(l, qty); }, 520);
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
  _showReceipt(l, qty) {
    const no = String(1000000 + (hash(l.id + Date.now()) % 8999999));
    const d = new Date();
    const pad = (v) => String(v).padStart(2, '0');
    this.$rc.innerHTML = `
      <div class="eb-slot"><i></i></div>
      <div class="eb-paperw"><div class="eb-paper" style="clip-path:${ZIGZAG}">
        <div class="eb-ph"><span class="eb-mini"><i class="l1">e</i><i class="l2">-</i><i class="l3">B</i><i class="l4">u</i><i class="l5">y</i></span><small>#${no} · ${pad(d.getHours())}:${pad(d.getMinutes())}</small></div>
        <div class="eb-pi"><img src="${esc(imgSrc(l.image))}" alt="" /><span class="eb-pin">${esc(l.title)}</span></div>
        <div class="eb-pl"><span>×${qty}</span><i></i><span>${this._icon('coin', 1)}${fmt(l.price)}</span></div>
        <div class="eb-pl tot"><span>TOTAL</span><i></i><span>${this._icon('coin', 1)}${fmt(l.price * qty)}</span></div>
        <div class="eb-pbar">${Array.from({ length: 34 }, (_, i) => `<i style="width:${1 + (hash(no + i) % 3)}px"></i>`).join('')}</div>
        <div class="eb-stamp"><b>SOLD!</b><span>Moose Express is on the way</span></div>
        <div class="eb-road"><span class="eb-rider">${this._icon('moose', 3)}${px('bike', 3)}</span></div>
        ${l.eta ? `<div class="eb-eta">${px('clock', 2)}${esc(l.eta)}</div>` : ''}
        <div class="eb-tap">${px('arrow', 2)}</div>
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
