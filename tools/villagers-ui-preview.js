// Preview for src/ui/DeliveryTracker.js, src/ui/VillagerCard.js, src/ui/ZoneBanner.js
// URL: ?sheet=1 (art sheet) | ?card=<npc> | ?banner=<npc> | ?tracker=1 (phase sim) | ?static=1 (all phases at once)
//      ?nohud=1 hides the coin HUD, ?noctl=1 hides the buttons
import { audio } from '../src/audio/audio.js';
import { spriteImg, hasSprite } from '../src/ui/sprites.js';
import { villagerPortrait, VILLAGER_IDS, openVillager } from '../src/ui/VillagerCard.js';
import { injectPaperCSS } from '../src/ui/paper.js';

const MODS = import.meta.glob(['../src/ui/DeliveryTracker.js', '../src/ui/ZoneBanner.js', '../src/ui/Hud.js']);
const load = (n) => MODS[`../src/ui/${n}.js`]?.();

const Q = new URLSearchParams(location.search);
injectPaperCSS(); // the game does this at boot (UI.js)
const ui = document.getElementById('ui');
const ctl = document.getElementById('ctl');
const sheet = document.getElementById('sheet');
window.addEventListener('pointerdown', () => { try { audio.unlock(); } catch { /* */ } }, { once: true, capture: true });
const sfx = (n, o) => { try { audio.play(n, { volume: 0.4, ...(o || {}) }); } catch { /* */ } };
const icon = (n, s = 2) => (hasSprite(n) ? spriteImg(n, s) : '');
window.sfxLog = [];
const sfxL = (n, o) => { window.sfxLog.push(n); sfx(n, o); };

// ---------------------------------------------------------------- art sheet
if (Q.has('sheet')) {
  sheet.classList.add('on');
  const sc = +(Q.get('scale') || 6);
  for (const id of Q.get('sheet') === 'moose' ? [] : VILLAGER_IDS) {
    const row = document.createElement('div');
    row.className = 'row';
    for (let f = 0; f < 3; f++) row.appendChild(villagerPortrait(id, { scale: sc, frame: f }));
    const d = document.createElement('div'); d.className = 'dk';
    d.appendChild(villagerPortrait(id, { scale: 3, frame: 0 }));
    row.appendChild(d);
    sheet.appendChild(row);
  }
  load('DeliveryTracker').then((m) => {
    if (!m?.__trackerArt) return;
    const row = document.createElement('div');
    row.className = 'row';
    for (const c of m.__trackerArt(sc)) row.appendChild(c);
    sheet.appendChild(row);
  });
}

// ---------------------------------------------------------------- villager cards
const CARDS = {
  dale: {
    lines: ["Heyyy, neighbour! Pull up a lawn chair.", "This here's *Daisy Beer*. Coldest can on the pond. {fish}", 'You need anything, you holler. Or don\'t. I\'ll be right here.'],
    offers: [
      { icon: 'chair', title: 'Lawn chair', desc: 'Bears sit, bears stay', tag: 'NEW' },
      { icon: 'campfire', title: 'Campfire night', desc: '+ cozy, + marshmallows', tag: '★' },
      { icon: 'canoe', title: 'Borrow the canoe', desc: 'Reach the far shore', locked: 'Needs 2 hearts' },
    ],
    gift: { ready: true, label: 'A cold one for you' }, hearts: 2.5,
  },
  granny: {
    lines: ['Oh! A visitor! Come in, come in, dearie.', 'Mind the lily pads. They bite. Only a little.', 'I brewed a remedy for your fishies. Take one, it\'s on the house.'],
    offers: [
      { icon: 'lilypad', title: 'Swamp lily seeds', desc: 'Pretty & a little smelly', tag: 'NEW' },
      { icon: 'flask', title: 'Fish tonic', desc: 'Heals sick fish overnight', tag: 'UNLOCKED' },
      { icon: 'mushroom', title: 'Mystery mushroom', desc: "Don't eat it. Probably.", locked: 'Visit 3 days in a row' },
    ],
    gift: { ready: true, label: 'Granny made you cookies' }, hearts: 4,
  },
  hoot: {
    lines: ['Hoo! Professor Hoot, park ranger. Pleasure.', 'This marsh is *protected habitat*. No littering, no bears in canoes.', 'Bring me a rare fish and I shall reward you handsomely.'],
    offers: [
      { icon: 'eye', title: 'Birdwatching tour', desc: 'Spot rare fish in the wild', tag: '★' },
      { icon: 'map', title: 'Trail map', desc: 'Reveals hidden areas', tag: 'NEW' },
      { icon: 'trophy', title: 'Ranger badge', desc: '+10% tourist bears', locked: 'Discover 12 fish' },
    ],
    gift: { ready: false, label: 'Ranger care package' }, hearts: 1,
  },
  rocco: {
    lines: ['Psst. Hey. You. Yeah, you.', 'Lookin\' for somethin\'... *special*? Rocco\'s got it. Don\'t ask where from.', 'All sales final. No refunds. No questions. {coin}'],
    offers: [
      { icon: 'egg', title: '"Totally legal" egg', desc: 'Fell off a truck. Rare?', tag: 'HOT' },
      { icon: 'necktie', title: 'Knock-off necktie', desc: 'Bears think you\'re CEO', tag: '★' },
      { icon: 'briefcase', title: 'The briefcase', desc: "Don't open it.", locked: 'Rocco doesn\'t trust you yet' },
    ],
    gift: null, hearts: 0.5,
  },
  shellby: {
    lines: ['Eh? Speak up, sprout. These ears are 140 years old.', 'Back in my day this whole pond was one big puddle.', 'Sit. Have some tea. Patience grows the biggest fish.'],
    offers: [
      { icon: 'clock', title: 'Old pocket watch', desc: 'Slows the day a little', tag: 'UNLOCKED' },
      { icon: 'seaweed', title: 'Ancient seaweed', desc: 'Fish grow 2x slower, 3x bigger' },
      { icon: 'crown', title: 'Pond deed', desc: 'Grandpa\'s greatest treasure', locked: 'Max friendship' },
    ],
    gift: { ready: true, label: 'A pebble. A nice one.' }, hearts: 5,
  },
};
let card = null;
function openCard(npc) {
  card?.close();
  const c = CARDS[npc];
  const h = (card = openVillager(ui, {
    npc, lines: c.lines, hearts: c.hearts, sfx: sfxL, icon,
    offers: c.offers.map((f) => ({ ...f, onClick: () => { console.log('offer', f.title); } })),
    gift: c.gift ? { ...c.gift, onClaim: () => { console.log('gift claimed'); setTimeout(() => h.update({ hearts: Math.min(5, c.hearts + 1) }), 400); } } : null,
    onClose: () => { console.log('closed', npc); if (card === h) card = null; },
  }));
  window.card = h;
  return h;
}
window.openCard = openCard;

// ---------------------------------------------------------------- coin HUD (to check the tracker sits under it)
if (!Q.has('nohud')) load('Hud').then((m) => {
  const hud = new m.Hud(ui, { icon, sfx });
  hud.set({ coins: 1240, rating: 3.5 });
  hud.setVisible(true);
});

// ---------------------------------------------------------------- delivery tracker sim
let tracker = null;
const trackerReady = load('DeliveryTracker').then((m) => {
  tracker = new m.DeliveryTracker(ui, { icon, sfx: sfxL, onClick: (id) => { console.log('fly to moose', id); window.lastClick = id; } });
  window.tracker = tracker;
  return tracker;
});
const sim = { orders: [], speed: 1, timer: 0 };
window.sim = sim;
const ORDERS = [['Beaver crew', 1], ['Rainbow trout egg', 3], ['Lawn chair', 2], ['Garden gnome', 1], ['Mushroom log', 4], ['Lantern', 2]];
let oid = 1;
function stateOf(o) {
  const [a, b, c] = o.durs, tot = a + b + c, t = o.t;
  const phase = t < a ? 'packing' : t < a + b ? 'riding' : t < tot ? 'arriving' : 'delivered';
  return { id: o.id, label: o.label, count: o.count, phase, eta: Math.max(0, tot - t), progress: Math.min(1, t / tot) };
}
function addOrder(durs = [4, 9, 3]) {
  const [label, count] = ORDERS[(oid - 1) % ORDERS.length];
  sim.orders.push({ id: 'o' + oid++, label, count, t: 0, durs, doneT: 0 });
}
function simTick() {
  for (const o of sim.orders) { o.t += 0.25 * sim.speed; if (stateOf(o).phase === 'delivered') o.doneT += 0.25; }
  sim.orders = sim.orders.filter((o) => o.doneT < 4); // the game drops delivered orders a bit later
  tracker?.update(sim.orders.map(stateOf));
}
function startSim() {
  clearInterval(sim.timer);
  sim.timer = setInterval(simTick, 250);
}
window.trackSim = async () => { await trackerReady; sim.orders = []; addOrder([3, 6, 2.5]); setTimeout(() => addOrder([4, 9, 3]), 1500); startSim(); simTick(); };
// all phases at once, frozen (for screenshots)
window.trackStatic = async (extra = 2) => {
  await trackerReady;
  clearInterval(sim.timer);
  sim.orders = [];
  const at = [[4, 9, 3, 1.5], [4, 9, 3, 7.2], [4, 9, 3, 13.4], [4, 9, 3, 16.5]];
  for (const [a, b, c, t] of at) { addOrder([a, b, c]); sim.orders[sim.orders.length - 1].t = t; }
  for (let i = 0; i < extra; i++) addOrder();
  tracker.update(sim.orders.map(stateOf));
};
window.trackPhases = async (t = [1.5, 7.2, 13.4]) => {
  await trackerReady;
  clearInterval(sim.timer);
  sim.orders = [];
  for (const x of t) { addOrder([4, 9, 3]); sim.orders[sim.orders.length - 1].t = x; }
  tracker.update(sim.orders.map(stateOf));
};
window.trackAdvance = (dt) => { for (const o of sim.orders) o.t += dt; tracker.update(sim.orders.map(stateOf)); };

// ---------------------------------------------------------------- zone banners
const ZONES = {
  dale: ['Lakeside Lawn', 'Dale keeps a cooler here'],
  granny: ['The Murky Swamp', 'Granny Ribbit lives here'],
  hoot: ['Whispering Woods', 'Professor Hoot keeps watch'],
  rocco: ['Back Alley Marsh', 'Rocco does "business" here'],
  shellby: ['Old Turtle Rock', 'Grandpa Shellby naps here'],
};
let bannerMod = null;
load('ZoneBanner').then((m) => { bannerMod = m; window.bannerReady = true; });
window.banner = async (npc = 'granny') => {
  bannerMod = bannerMod || (await load('ZoneBanner'));
  const [title, sub] = ZONES[npc] || ZONES.granny;
  const t0 = performance.now();
  await bannerMod.showZoneBanner(ui, { title, sub, npc, sfx: sfxL });
  window.bannerMs = Math.round(performance.now() - t0);
  console.log('banner done', window.bannerMs, 'ms');
  return window.bannerMs;
};

// ---------------------------------------------------------------- controls
const btn = (label, fn) => {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = label;
  b.onclick = (e) => { e.stopPropagation(); try { audio.unlock(); } catch { /* */ } fn(); };
  ctl.appendChild(b);
};
btn('tracker sim', () => window.trackSim());
btn('+ order', () => { addOrder(); if (!sim.timer) startSim(); });
btn('all phases', () => window.trackStatic());
btn('sim x4', () => { sim.speed = sim.speed === 1 ? 4 : 1; });
for (const id of VILLAGER_IDS) btn(`card ${id}`, () => openCard(id));
for (const id of VILLAGER_IDS) btn(`banner ${id}`, () => window.banner(id));
btn('banner (no npc)', async () => { bannerMod = bannerMod || (await load('ZoneBanner')); bannerMod.showZoneBanner(ui, { title: 'Sunny Meadow', sub: 'Fresh lily pads', color: '#c07a10', sfx: sfxL }); });
if (Q.has('noctl')) ctl.classList.add('hide');
if (Q.get('card')) openCard(Q.get('card'));
if (Q.get('banner')) window.banner(Q.get('banner'));
if (Q.has('tracker')) window.trackSim();
if (Q.has('static')) window.trackStatic();
