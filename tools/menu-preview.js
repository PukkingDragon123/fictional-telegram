// Preview for src/ui/RestaurantMenu.js (+ trophyModels.js, menuSfx.js).
// URL: ?sheet=trophies         all trophy models, earned + locked
//      ?section=rating|reviews|trophies  open straight away (default: rating)
//      &rating=0.9             override the rating (warning ribbon below 1.8)
//      &manual=1               no rAF: drive with window.__step(dt, n)
//      &present=a_golden       fetch + present a trophy once open
//      &empty=1                no reviews / trophies;  &noctl=1 hides the buttons
// window.__menu, window.__step(dt = 1/30, n = 1), window.__ready
import * as THREE from 'three';
import { makeTrophy, TROPHY_LOOKS, TROPHY_SHAPES } from '../src/entities/trophyModels.js';
import { RestaurantMenu } from '../src/ui/RestaurantMenu.js';
import { Icons3D } from '../src/ui/icons3d.js';
import { audio } from '../src/audio/audio.js';

const Q = new URLSearchParams(location.search);

if (Q.get('sheet') === 'trophies') trophySheet();
else menuPreview();

function fakeGame() {
  const R = [
    [5, 'Best fish this side of Hudson Bay!', 'Gary', 'Accounts Payable', 'office', 9, 1],
    [5, 'Chef\'s kiss. Well, bear\'s kiss.', 'Brenda', 'The Bear Street Journal', 'critic', 9, 4],
    [4, 'A lovely end to a long day of spreadsheets.', 'Doug', 'Synergy', 'accountant', 9, 1],
    [3, 'It was... fine.', 'Kevin', 'IT', 'intern', 9, 1],
    [4, 'Good eats, bit pricey. Classic fox.', 'Marge', 'Legal', 'grandma', 8, 1],
    [2, 'Barely a snack. Do better, fox.', 'Chad', 'Sales', 'jogger', 8, 1],
    [5, 'Came for the fish, stayed for the fish.', 'Theo', 'Q3 Projections', 'hipster', 8, 1],
    [0, 'RAWR!!! NO FISH?! ZERO STARS!', 'Bruno', 'Site Foreman', 'construction', 7, 1],
    [3, 'Average pond, average fish, average fox.', 'Sheila', 'HR', 'office', 7, 1],
    [4, 'Solid catch. Would dive again.', 'Lorne', 'Forestry Division', 'lumberjack', 7, 1],
    [1, 'Where were the FISH?!', 'Rhonda', 'Payroll', 'boss', 6, 1],
    [4, 'Tasty! Needs more napkins.', 'Otis', 'Mailroom', 'janitor', 6, 1],
  ].map(([stars, text, name, dept, type, day, weight]) => ({ stars, text, name, dept, type, day, weight }));
  const empty = Q.has('empty');
  const r = Q.has('rating') ? +Q.get('rating') : 3.7;
  let icons = null;
  try { icons = new Icons3D({ renderer: new THREE.WebGLRenderer({ alpha: true, antialias: false }) }); } catch { /* placeholder portraits */ }
  return {
    state: {
      rating: r, bestRating: Math.max(r, 4.2), day: 9,
      reviews: empty ? [] : R,
      achievements: empty ? [] : ['a_first', 'a_love', 'a_happy10', 'a_golden', 'a_rating', 'a_week'],
      achievementDays: { a_first: 1, a_love: 2, a_happy10: 5, a_golden: 6, a_rating: 7, a_week: 8 },
    },
    audio,
    ui: { icons },
    on() {},
  };
}

function menuPreview() {
  const game = (window.__game = fakeGame());
  const manual = Q.has('manual');
  const menu = (window.__menu = new RestaurantMenu({ game, root: document.getElementById('ui'), autoUpdate: !manual, seed: 7 }));
  window.addEventListener('pointerdown', () => { try { audio.unlock(); } catch { /* */ } }, { once: true, capture: true });
  window.__step = (dt = 1 / 30, n = 1) => {
    menu._skipRender = true;
    for (let i = 0; i < n; i++) { if (i === n - 1) menu._skipRender = false; menu.update(dt); }
    return menu.stage.f.x;
  };
  const ctl = document.getElementById('ctl');
  if (Q.has('noctl')) ctl.classList.add('hide');
  const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; ctl.appendChild(b); };
  btn('Rating', () => menu.open({ section: 'rating' }));
  btn('Reviews', () => menu.open({ section: 'reviews' }));
  btn('Trophies', () => menu.open({ section: 'trophies' }));
  btn('Close', () => menu.close());
  btn('Present gold', () => menu.present('a_golden'));
  btn('Present locked', () => menu.present('a_dex'));
  btn('Low rating', () => { game.state.rating = 1.2; menu.refresh(); });
  btn('+review', () => { game.state.reviews.unshift({ stars: 5, text: 'Magnifique!', name: 'Pam', dept: 'Risk', type: 'office', day: 9, weight: 1 }); menu.refresh(); });
  if (Q.get('section') !== 'none') menu.open({ section: Q.get('section') || 'rating' });
  if (Q.get('present')) setTimeout(() => menu.present(Q.get('present')), 50);
  window.__ready = true;
}

function trophySheet() {
  const sheet = document.getElementById('sheet');
  sheet.classList.add('on');
  document.getElementById('ctl').classList.add('hide');
  const ids = Object.keys(TROPHY_LOOKS);
  const cols = 8, cell = 64, px = +(Q.get('px') || 3);
  const rows = Math.ceil((ids.length * 2) / cols);
  const W = cols * cell, H = rows * cell;
  const r = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
  r.setPixelRatio(1);
  r.setSize(W, H, false);
  r.setClearColor(0x2c1a12, 1);
  r.domElement.style.width = W * px + 'px';
  r.domElement.style.height = H * px + 'px';
  sheet.appendChild(r.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffe8c8, 0x4a3050, 1.3));
  const key = new THREE.DirectionalLight(0xfff0d6, 2.4); key.position.set(-1.5, 2.5, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd27a, 2.0); rim.position.set(2.4, 1.8, -2.6); scene.add(rim);
  const cam = new THREE.OrthographicCamera(0, W / 80, H / 80, 0, -20, 20);
  cam.position.set(0, 0, 10);
  const tilt = new THREE.Group(); scene.add(tilt);
  let i = 0;
  for (const locked of [false, true])
    for (const id of ids) {
      const t = makeTrophy({ id, locked });
      const cx = (i % cols) * cell + cell / 2, cy = Math.floor(i / cols) * cell + cell - 10;
      t.position.set(cx / 80, (H - cy) / 80, 0);
      t.rotation.set(0.32, -0.45, 0);
      tilt.add(t);
      i++;
    }
  r.render(scene, cam);
  window.__ready = true;
  window.__shapes = TROPHY_SHAPES;
}
