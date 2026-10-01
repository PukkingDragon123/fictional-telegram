// Preview harness for src/ui/EBuy.js with mock listings and a mock wallet.
// URL flags: ?phone=1 &coins=1234 &cat=eggs|plants|decor|restaurant|gear &q=text
//            &open=<listing id> (open detail) &buy=1 (also buy it) &fail=1 (onBuy returns false) &nodev=1
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-700.css';
import { spriteImg, spriteCanvas, hasSprite } from '../src/ui/sprites.js';
import { openEBuy } from '../src/ui/EBuy.js';

const P = new URLSearchParams(location.search);
if (P.get('phone')) document.body.classList.add('phone');
if (P.get('nodev')) document.getElementById('dev').style.display = 'none';
const state = { coins: +(P.get('coins') ?? 2500), fail: !!P.get('fail') };

// ---------------------------------------------------------------- pixel art
const INK = '#2a1a14';
function outline(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h), a = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d.data[(y * w + x) * 4 + 3] > 0;
  const pts = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!a(x, y) && (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1))) pts.push([x, y]);
  ctx.fillStyle = INK;
  for (const [x, y] of pts) ctx.fillRect(x, y, 1, 1);
}
function fish({ body, belly, back, fin, stripe, spots, long = false, eyeR = false }) {
  const W = long ? 32 : 26, H = 16, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const cx = long ? 17 : 14, cy = 8, rx = long ? 11 : 8, ry = long ? 3.6 : 4.6;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy <= 1) {
      g.fillStyle = dy > 0.35 ? belly : dy < -0.45 ? back : body;
      if (stripe && Math.abs(((x - cx + 40) % 4)) < 1 && dy < 0.5) g.fillStyle = stripe;
      if (spots && (x * 7 + y * 13) % 11 === 0 && dy < 0.4) g.fillStyle = spots;
      g.fillRect(x, y, 1, 1);
    }
  }
  // tail
  g.fillStyle = fin;
  const tx = cx - rx;
  for (let i = 0; i < 5; i++) { g.fillRect(tx - i - 1, cy - 1 - i, 1, 2 + i * 2); }
  // dorsal + pelvic fins
  g.fillRect(cx - 3, cy - ry - 1, 5, 1); g.fillRect(cx - 2, cy - ry - 2, 3, 1);
  g.fillRect(cx - 1, cy + ry, 3, 1);
  // highlight + eye
  g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(cx - 2, cy - 3, 4, 1);
  const ex = cx + rx - 3;
  g.fillStyle = '#fff'; g.fillRect(ex, cy - 2, 2, 2);
  g.fillStyle = eyeR ? '#d02a2a' : INK; g.fillRect(ex + 1, cy - 2, 1, 1);
  g.fillStyle = INK; g.fillRect(cx + rx - 1, cy + 1, 1, 1);
  outline(g, W, H);
  return c;
}
const FISH = {
  bluegill: { body: '#4a9ab0', belly: '#f0a040', back: '#2e6a80', fin: '#2e6a80', stripe: '#3a8098' },
  pumpkinseed: { body: '#e8a040', belly: '#ffd060', back: '#3a8ab0', fin: '#c87a20', spots: '#3a8ab0' },
  goldfish: { body: '#ff8a20', belly: '#ffc060', back: '#e05a10', fin: '#ff6a30' },
  perch: { body: '#e0c040', belly: '#fff0a0', back: '#7a8a30', fin: '#f07030', stripe: '#5a6a20' },
  bass: { body: '#6a9a4a', belly: '#e8e0b0', back: '#3a5a2a', fin: '#4a7a3a', spots: '#2a4a1a' },
  rainbow: { body: '#a8c0b0', belly: '#ff90b0', back: '#5a7a6a', fin: '#7a9a8a', spots: '#2a3a2a' },
  sturgeon: { body: '#7a8090', belly: '#c8ccd8', back: '#4a5060', fin: '#5a6070', long: true },
  koi: { body: '#fff4e8', belly: '#ffffff', back: '#e83a2a', fin: '#ffd0c0', spots: '#e83a2a' },
  pike: { body: '#6a8a3a', belly: '#e0e8b0', back: '#3a5a20', fin: '#c87a30', spots: '#d8e8a0', long: true },
  char: { body: '#5a7a8a', belly: '#ff5a3a', back: '#3a4a5a', fin: '#ff7a5a', spots: '#ffb0a0' },
  aurora: { body: '#7a5ae0', belly: '#6ae0c0', back: '#3a2a8a', fin: '#a07aff', stripe: '#5ad0e0' },
  walleye: { body: '#c8a040', belly: '#f0e0a0', back: '#6a5a20', fin: '#a08030', eyeR: true },
};
const fishC = Object.fromEntries(Object.entries(FISH).map(([k, v]) => [k, fish(v)]));
function sprite(n) { return hasSprite(n) ? spriteCanvas(n, 1) : fishC.goldfish; }

// ---------------------------------------------------------------- listings
const M = {
  titan: { id: 'titan', name: 'Titan', color: '#8a5a2a', mult: 4 },
  candy: { id: 'candy', name: 'Candy', color: '#ff6aa8', mult: 2 },
  hot: { id: 'hot', name: 'Hot', color: '#ff5a2a', mult: 2 },
  doublehot: { id: 'double_hot', name: 'Double Hot', color: '#e02a2a', mult: 5 },
  doge: { id: 'doge', name: 'Doge', color: '#f0a838', mult: 7 },
  frozen: { id: 'frozen', name: 'Frozen', color: '#8ad8ff', mult: 3 },
  shiny: { id: 'shiny', name: 'Shiny', color: '#ffc22e', mult: 3 },
  rainbow: { id: 'rainbow', name: 'Rainbow', color: '#ff4a8a', mult: 6 },
  zombie: { id: 'zombie', name: 'Zombie', color: '#5aa848', mult: 2 },
  galaxy: { id: 'galaxy', name: 'Galaxy', color: '#6a3ac0', mult: 10 },
  tiny: { id: 'tiny', name: 'Tiny', color: '#9a8a74', mult: 1.5 },
};
const S = (name, stars, sold) => ({ name, stars, sold });
const BASE = [
  { id: 'egg_bluegill', cat: 'eggs', title: 'RARE?!? Bluegill egg (NOT CLICKBAIT) 🔥', sub: 'Bluegill', price: 12, oldPrice: 400, rarity: 'common', image: fishC.bluegill, badges: ['hot'], seller: S('reynard_deals', 4.5, 1200), eta: '1 day', stock: 9 },
  { id: 'egg_goldfish_doge', cat: 'eggs', title: 'Doge mutation omg', sub: 'Pond Goldfish', price: 350, oldPrice: 9999, rarity: 'uncommon', mutation: M.doge, image: fishC.goldfish, badges: ['new', 'hot'], seller: S('such_seller', 5, 420), eta: '1 day', stock: 2 },
  { id: 'egg_perch_hot', cat: 'eggs', title: 'u won\'t BELIEVE what hatches', sub: 'Yellow Perch', price: 180, oldPrice: 600, rarity: 'uncommon', mutation: M.hot, image: fishC.perch, badges: ['sale'], seller: S('spicy_pete', 4, 88), eta: '1 day' },
  { id: 'egg_bass_titan', cat: 'eggs', title: 'ABSOLUTE UNIT bass egg 💪', sub: 'Largemouth Bass', price: 900, oldPrice: 2400, rarity: 'rare', mutation: M.titan, image: fishC.bass, badges: ['hot'], seller: S('big_doug', 3.5, 61), eta: '2 days', stock: 4 },
  { id: 'egg_koi_candy', cat: 'eggs', title: 'sweet sweet koi egg 🍬', sub: 'Maple Leaf Koi', price: 2200, oldPrice: 7000, rarity: 'legendary', mutation: M.candy, image: fishC.koi, badges: ['new'], seller: S('sugar_mtn', 5, 12), eta: '3 days', stock: 1 },
  { id: 'egg_char_frozen', cat: 'eggs', title: 'found in a glacier (legit)', sub: 'Arctic Char', price: 640, oldPrice: 1900, rarity: 'epic', mutation: M.frozen, image: fishC.char, seller: S('ice_ice_bb', 4.5, 230), eta: '2 days' },
  { id: 'egg_aurora_galaxy', cat: 'eggs', title: 'egg from SPACE?!?! 🌌', sub: 'Aurora Salmon', price: 4800, oldPrice: 160000, rarity: 'legendary', mutation: M.galaxy, image: fishC.aurora, badges: ['last'], seller: S('nasa_official', 2, 3), eta: '4 days', stock: 1 },
  { id: 'egg_pumpkin_shiny', cat: 'eggs', title: 'shiny pumpkinseed!! LAST ONE!!', sub: 'Pumpkinseed', price: 95, oldPrice: 300, rarity: 'common', mutation: M.shiny, image: fishC.pumpkinseed, badges: ['last'], seller: S('reynard_deals', 4.5, 1200), stock: 1 },
  { id: 'egg_rainbow_rainbow', cat: 'eggs', title: 'Rainbow Rainbow Trout (double rainbow)', sub: 'Rainbow Trout', price: 1300, oldPrice: 4000, rarity: 'rare', mutation: M.rainbow, image: fishC.rainbow, badges: ['hot', 'new'], seller: S('all_the_way', 5, 777), eta: '2 days' },
  { id: 'egg_walleye_zombie', cat: 'eggs', title: 'it\'s fine. it\'s totally fine.', sub: 'Walleye', price: 66, oldPrice: 666, rarity: 'rare', mutation: M.zombie, image: fishC.walleye, badges: ['sale'], seller: S('brainz4u', 1.5, 13), eta: '1 day' },
  { id: 'egg_pike_dhot', cat: 'eggs', title: 'DOUBLE HOT pike 🔥🔥 do NOT touch', sub: 'Northern Pike', price: 1750, oldPrice: 3500, rarity: 'epic', mutation: M.doublehot, image: fishC.pike, badges: ['hot'], seller: S('spicy_pete', 4, 88), eta: '2 days', stock: 3 },
  { id: 'egg_bluegill_tiny', cat: 'eggs', title: 'smol egg. v smol.', sub: 'Bluegill', price: 8, oldPrice: 10, rarity: 'common', mutation: M.tiny, image: fishC.bluegill, seller: S('lil_shop', 5, 9000), eta: '1 day' },
  { id: 'egg_sturgeon', cat: 'eggs', title: 'ANCIENT DINOSAUR FISH egg', sub: 'Lake Sturgeon', price: 9000, oldPrice: 300000, rarity: 'legendary', image: fishC.sturgeon, badges: ['new'], seller: S('museum_leftovers', 3, 2), locked: { reason: 'needs Lab upgrade', icon: 'flask' } },
  { id: 'egg_pike_locked', cat: 'eggs', title: 'pike egg (bitey)', sub: 'Northern Pike', price: 500, rarity: 'rare', image: fishC.pike, seller: S('big_doug', 3.5, 61), locked: { reason: 'pond level 3', icon: 'pond' } },
  { id: 'pl_berry', cat: 'plants', title: 'BERRY BUSH (berries NOT included)', price: 40, oldPrice: 120, image: sprite('berry'), badges: ['hot'], seller: S('bush_bros', 4.5, 3400), eta: '1 day' },
  { id: 'pl_flower', cat: 'plants', title: 'flower. it smells nice. that\'s it', price: 15, oldPrice: 20, image: sprite('flower'), seller: S('petal_pusher', 5, 820) },
  { id: 'pl_lily', cat: 'plants', title: 'lily pad (frog sold separately)', price: 25, oldPrice: 900, image: sprite('lilypad'), badges: ['sale'], seller: S('frogless', 4, 150), stock: 2 },
  { id: 'pl_mush', cat: 'plants', title: 'mushroom 🍄 (do not eat?)', price: 30, image: sprite('mushroom'), badges: ['new'], seller: S('fungi_guy', 3, 44) },
  { id: 'pl_willow', cat: 'plants', title: 'SAD TREE (willow) very emotional', price: 220, oldPrice: 500, image: sprite('willow'), seller: S('bush_bros', 4.5, 3400), locked: { reason: 'needs Lab upgrade', icon: 'flask' } },
  { id: 'pl_rice', cat: 'plants', title: 'wild rice 4 bears', price: 60, image: sprite('wildrice'), seller: S('grainz', 4, 300), stock: 0 },
  { id: 'dc_gnome', cat: 'decor', title: 'gnome that WATCHES you 👀', price: 75, oldPrice: 250, image: sprite('gnome'), badges: ['hot'], seller: S('gnome_depot', 4.5, 9100) },
  { id: 'dc_lantern', cat: 'decor', title: 'cozy lantern (very cozy)', price: 55, image: sprite('lantern'), badges: ['new'], seller: S('glowup', 5, 1100) },
  { id: 'dc_fountain', cat: 'decor', title: 'FANCY FOUNTAIN like rich ppl', price: 800, oldPrice: 3000, image: sprite('fountain'), seller: S('rich_ppl', 4, 40), stock: 2 },
  { id: 'dc_canoe', cat: 'decor', title: 'canoe (has hole) (decor only)', price: 120, oldPrice: 4000, image: sprite('canoe'), badges: ['sale', 'last'], seller: S('hole_lotta', 2.5, 7), stock: 1 },
  { id: 'dc_lighthouse', cat: 'decor', title: 'tiny lighthouse for tiny boats', price: 1500, image: sprite('lighthouse'), seller: S('glowup', 5, 1100), locked: { reason: 'beauty 50', icon: 'beauty' } },
  { id: 'rs_chair', cat: 'restaurant', title: 'chair. for sitting. by bears.', price: 45, oldPrice: 90, image: sprite('chair'), badges: ['hot'], seller: S('ikeya', 4.5, 22000), eta: '1 day' },
  { id: 'rs_picnic', cat: 'restaurant', title: 'PICNIC TABLE seats 4 (or 1 big bear)', price: 160, image: sprite('picnic'), badges: ['new'], seller: S('ikeya', 4.5, 22000) },
  { id: 'rs_lights', cat: 'restaurant', title: 'string lights = 5 star restaurant', price: 90, oldPrice: 400, image: sprite('stringlights'), seller: S('glowup', 5, 1100), stock: 3 },
  { id: 'rs_bench', cat: 'restaurant', title: 'bench (fancy) (wood)', price: 70, image: sprite('bench'), seller: S('woody', 4, 320), locked: { reason: '10 bears served', icon: 'bear' } },
  { id: 'gr_shovel', cat: 'gear', title: 'SHOVEL 3000 digs holes FAST', price: 110, oldPrice: 300, image: sprite('shovel'), badges: ['hot'], seller: S('tool_time', 4.5, 640) },
  { id: 'gr_feeder', cat: 'gear', title: 'auto fish feeder (fish love it)', price: 260, image: sprite('feeder'), badges: ['new'], seller: S('fishy_tech', 4, 210), eta: '2 days' },
  { id: 'gr_aerator', cat: 'gear', title: 'bubble machine 🫧 for pond', price: 340, oldPrice: 999, image: sprite('aerator'), seller: S('fishy_tech', 4, 210), stock: 2 },
  { id: 'gr_net', cat: 'gear', title: 'magnifying glass (see fish good)', price: 50, image: sprite('magnifier'), seller: S('tool_time', 4.5, 640), locked: { reason: 'needs Lab upgrade', icon: 'flask' } },
];
let listings = BASE.map((l) => ({ ...l }));

// ---------------------------------------------------------------- sfx
let actx = null, soundOn = false;
const logEl = document.getElementById('log');
const counts = {};
function sfx(name) {
  counts[name] = (counts[name] || 0) + 1;
  logEl.textContent = Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join('\n');
  if (!soundOn) return;
  actx ||= new AudioContext();
  const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  const sp = { click: [900, 0.03, 'square'], hover: [1400, 0.015, 'square'], error: [140, 0.2, 'square'], buy: [660, 0.3, 'triangle'], coins: [1600, 0.2, 'square'], stamp: [90, 0.12, 'square'], typing: [2200, 0.01, 'square'], tick: [1200, 0.03, 'square'], paper: [400, 0.2, 'sawtooth'], page: [700, 0.05, 'triangle'] }[name] || [500, 0.05, 'sine'];
  o.type = sp[2]; o.frequency.setValueAtTime(sp[0], t);
  g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + sp[1]);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + sp[1] + 0.02);
}

// ---------------------------------------------------------------- shop
const wrap = document.getElementById('wrap');
const cv = document.getElementById('cv');
let shop = null;
function open() {
  document.getElementById('closed').style.display = 'none';
  shop = openEBuy(wrap, {
    listings, coins: state.coins, sfx,
    icon: (n, s) => (hasSprite(n) ? spriteImg(n, s) : ''),
    onBuy: async (l, qty) => {
      await new Promise((r) => setTimeout(r, 120));
      const cost = l.price * qty;
      if (state.fail || cost > state.coins) return false;
      state.coins -= cost;
      listings = listings.map((x) => (x.id === l.id && x.stock != null ? { ...x, stock: Math.max(0, x.stock - qty) } : x));
      shop.refresh({ coins: state.coins, listings });
      cv.textContent = state.coins;
      return true;
    },
    onClose: () => { shop = null; document.getElementById('closed').style.display = 'flex'; },
  });
  window.shop = shop;
}
open();
cv.textContent = state.coins;

// URL-driven scenario for screenshots
const root = () => wrap.querySelector('.ebuy');
setTimeout(() => {
  if (P.get('cat')) root().querySelector(`.eb-cat[data-cat="${P.get('cat')}"]`)?.click();
  if (P.get('q')) { const q = root().querySelector('.eb-q'); q.value = P.get('q'); q.dispatchEvent(new Event('input')); }
  if (P.get('open')) {
    const id = P.get('open');
    const l = listings.find((x) => x.id === id);
    if (l && !root().querySelector(`.eb-card[data-id="${id}"]`)) root().querySelector(`.eb-cat[data-cat="${l.cat}"]`)?.click();
    root().querySelector(`.eb-card[data-id="${id}"]`)?.click();
    if (P.get('buy')) setTimeout(() => root().querySelector('.eb-buy')?.click(), 500);
  }
}, 950);

document.getElementById('reopen').onclick = open;
document.querySelector('#dev .t').onclick = () => document.getElementById('dev').classList.toggle('min');
document.getElementById('dev').addEventListener('click', (e) => {
  const a = e.target.dataset?.a;
  if (!a) return;
  if (a === 'c+') state.coins += 500;
  if (a === 'c-') state.coins = Math.max(0, state.coins - 500);
  if (a === 'c0') state.coins = 0;
  if (a === 'cbig') state.coins = 99999;
  if (a === 'phone') document.body.classList.toggle('phone');
  if (a === 'fail') { state.fail = !state.fail; e.target.textContent = 'force fail: ' + (state.fail ? 'on' : 'off'); }
  if (a === 'sound') { soundOn = !soundOn; e.target.textContent = 'sound: ' + (soundOn ? 'on' : 'off'); }
  if (a === 'restock') { listings = BASE.map((l) => ({ ...l })); shop?.refresh({ listings }); }
  if (a === 'unlock') { listings = listings.map((l) => ({ ...l, locked: undefined })); shop?.refresh({ listings }); }
  if (a === 'close') { shop?.close(); shop = null; document.getElementById('closed').style.display = 'flex'; }
  cv.textContent = state.coins;
  shop?.refresh({ coins: state.coins });
});
