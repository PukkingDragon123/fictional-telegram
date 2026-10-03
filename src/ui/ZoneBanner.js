// ZoneBanner: the moment the fog lifts on a new area. A paper scroll drops in
// at the upper middle of the screen, unrolls between two wooden rods while fog
// wisps blow away, a "NEW AREA!" stamp slams down, the area name pops in, the
// villager who lives there peeks over the edge, then it rolls back up and flies off.
//
//   await showZoneBanner(root, { title: 'The Murky Swamp', sub: 'Granny Ribbit lives here', npc: 'granny', color: '#5c4896', sfx })
//     -> Promise, resolves after the banner has left (~4.2 s). Calls made while one is
//        showing queue up and play one after another.
//   npc    optional villager id ('dale' | 'granny' | 'hoot' | 'rocco' | 'shellby')
//   color  title / accent colour (defaults per npc)
//   sfx(name, opts) optional
//
// Layer: .zb (position absolute; inset 0; z-index 42; pointer-events none) inside `root`.
import './fonts.css';
import './villager.css';
import { paperTexture, injectPaperCSS, PX } from './paper.js';
import { VILLAGERS } from './VillagerCard.js';
import { createNpcTalk } from './NpcTalk3D.js'; // [v19 npc] the peeking villager is their live 3D rig

const REDUCED = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const anim = (el, kf, o) => { try { return el.animate(kf, o); } catch { return null; } };
const COLORS = { dale: '#2e8040', granny: '#6a52a8', hoot: '#9c5a14', rocco: '#3e3460', shellby: '#28699a' };

// ---------------------------------------------------------------- pixel bits (texel canvases)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];
const cache = new Map();
function px(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  paint((i, j, col) => { if (col) { x.fillStyle = col; x.fillRect(i, j, 1, 1); } }, x);
  return c;
}
// a rolled-up paper cylinder with wooden knobs top and bottom (10 x th texels)
function rodURL(th) {
  const key = 'rod' + th;
  if (cache.has(key)) return cache.get(key);
  const P = ['#7a5a34', '#9c7646', '#bb945e', '#d4b078', '#e6c994', '#f1dcae', '#f8eaca'];
  const W = ['#2c190d', '#52301b', '#7a4b2b', '#a56b40', '#c98f55'];
  const col = [1, 3, 5, 6, 5, 4, 4, 3, 2, 1];
  const c = px(12, th, (set) => {
    for (let j = 0; j < th; j++) for (let i = 0; i < 12; i++) {
      const x = i - 1;
      // knobs
      if (j < 5 || j >= th - 5) {
        const jj = j < 5 ? j : th - 1 - j;
        const half = jj === 0 ? 2 : jj === 1 ? 3 : 3;
        if (Math.abs(x - 4.5) > half + 0.5) continue;
        if (jj >= 4 && Math.abs(x - 4.5) > 1.5) continue;
        let t = x < 3 ? 3 : x < 5 ? 4 : x < 7 ? 2 : 1;
        if (jj === 0 || Math.abs(x - 4.5) > half - 0.5) t = 0;
        if (jj === 4) t = 1;
        set(i, j, W[t]);
        continue;
      }
      if (x < 0 || x > 9) continue;
      let t = col[x];
      // paper end caps (the spiral) at both ends
      if (j === 5 || j === th - 6) t = x === 0 || x === 9 ? 0 : x === 4 || x === 5 ? 1 : 5;
      else if (j === 6 || j === th - 7) t = Math.max(0, t - 1);
      if (bay(i, j) < 0.12 && t > 1) t -= 1;
      if (x === 0 || x === 9) t = 0;
      set(i, j, P[t]);
    }
  });
  const u = c.toDataURL();
  cache.set(key, u);
  return u;
}
// soft pixel fog puff (union of circles, dithered rim)
function fogURL(seed) {
  const key = 'fog' + seed;
  if (cache.has(key)) return cache.get(key);
  let s = seed * 9301 + 49297;
  const R = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const W = 44, H = 20, blobs = [];
  for (let k = 0; k < 5; k++) blobs.push([8 + R() * 28, 10 + (R() - 0.5) * 4, 5 + R() * 4]);
  const c = px(W, H, (set) => {
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      let d = 9;
      for (const [bx, by, br] of blobs) d = Math.min(d, Math.hypot(i - bx, (j - by) * 1.25) - br);
      if (d > 1.2) continue;
      if (d > 0 && bay(i, j) > 0.55 - d * 0.3) continue;
      const top = j < 10 - (d < -2 ? 2 : 0);
      set(i, j, d > -1 ? '#d6e0e4d0' : top ? '#f6fafbe8' : '#e4ecefe0');
    }
  });
  const u = c.toDataURL();
  cache.set(key, u);
  return u;
}

// ---------------------------------------------------------------- public
let queue = Promise.resolve();
export function showZoneBanner(root, opts = {}) {
  const run = () => play(root || document.body, opts).catch((e) => { console.error(e); });
  const p = queue.then(run, run);
  queue = p;
  return p;
}

async function play(root, { title = 'New Area', sub = '', npc = null, color, sfx } = {}) {
  injectPaperCSS();
  const S = (n, o) => { try { if (typeof sfx === 'function') sfx(n, o); } catch { /* audio optional */ } };
  const red = REDUCED();
  const vw = root.clientWidth || innerWidth;
  const narrow = vw < 560;
  const W = Math.floor(Math.min(600, vw - 40) / PX) * PX, H = 150;
  const zc = color || COLORS[npc] || '#2f6f4a';
  const hasNpc = !!(npc && VILLAGERS[npc]);

  const el = document.createElement('div');
  el.className = `zb${narrow ? ' zb-narrow' : ''}`;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', `New area: ${title}${sub ? '. ' + sub : ''}`);
  const chars = [...String(title)].map((ch, i) => (ch === ' ' ? '<span class="zb-sp"> </span>' : `<span class="zb-c" style="--i:${i}">${esc(ch)}</span>`)).join('');
  el.innerHTML = `
    <div class="zb-wrap" style="--w:${W}px;--h:${H}px;--zc:${zc}">
      ${hasNpc ? '<div class="zb-peek"></div>' : ''}
      <div class="zb-sh"><div class="zb-paper">
        <div class="zb-in">
          <span class="zb-stamp">NEW AREA!</span>
          <div class="zb-title">${chars}</div>
          <div class="zb-orn"><i></i><b></b><i></i></div>
          ${sub ? `<div class="zb-sub">${esc(sub)}</div>` : ''}
        </div>
      </div></div>
      <img class="zb-rod zb-l" alt="" draggable="false">
      <img class="zb-rod zb-r" alt="" draggable="false">
      <div class="zb-fog"></div>
    </div>`;
  const $ = (s) => el.querySelector(s);
  const wrap = $('.zb-wrap'), paper = $('.zb-paper'), rl = $('.zb-l'), rr = $('.zb-r'), fog = $('.zb-fog'), peek = $('.zb-peek');
  paper.style.backgroundImage = `url(${paperTexture('parchment', W, H, { edge: 0.55, edgeW: 7, seed: 77 + title.length, creases: [0.5] })})`;
  const rodTh = H / PX + 12;
  const rodUrl = rodURL(rodTh);
  for (const r of [rl, rr]) { r.src = rodUrl; r.width = 12 * PX; r.height = rodTh * PX; }

  // villager peeking over the top-right corner
  let p3 = null, talkTimer = 0;
  if (peek) {
    peek.style.setProperty('--ps', `${narrow ? 72 : 104}px`);
    try { p3 = createNpcTalk(peek, { npc, frame: 'bust' }); } catch { p3 = null; }
  }
  const setFrame = () => {};

  // fog wisps around the rolled-up scroll
  const puffs = [];
  const NP = narrow ? 8 : 12;
  for (let i = 0; i < NP; i++) {
    const side = i % 2 ? 1 : -1;
    const p = document.createElement('img');
    p.className = 'zb-puff';
    p.src = fogURL(i + 3);
    const sc = (narrow ? 2 : 3) * (0.8 + ((i * 37) % 10) / 14);
    p.width = Math.round(44 * sc); p.height = Math.round(20 * sc);
    const fx = 50 + side * (6 + ((i * 53) % 34));
    const fy = 12 + ((i * 29) % 70);
    p.style.left = `calc(${fx}% - ${p.width / 2}px)`;
    p.style.top = `calc(${fy}% - ${p.height / 2}px)`;
    fog.appendChild(p);
    puffs.push({ p, side, i });
  }

  root.appendChild(el);
  const T = (ms) => sleep(red ? Math.min(ms, 60) : ms);

  if (red) {
    // calm version: fade in, hold, fade out
    fog.remove();
    el.classList.add('zb-static');
    anim(wrap, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, fill: 'both' });
    S('paper', { volume: 0.4 });
    if (peek) peek.classList.add('zb-up');
    await sleep(3600);
    await (anim(wrap, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' })?.finished.catch(() => {}) || sleep(260));
    p3?.dispose();
    el.remove();
    return;
  }

  // 1) the rolled scroll drops in
  const half = W / 2;
  const rodsIn = [{ transform: `translateX(${half}px)` }, { transform: `translateX(-${half}px)` }];
  rl.style.transform = rodsIn[0].transform; rr.style.transform = rodsIn[1].transform;
  paper.style.clipPath = 'inset(0 50% 0 50%)';
  S('whoosh', { volume: 0.4, pitch: 0.9 });
  anim(wrap, [
    { transform: 'translateY(-140%) rotate(-6deg)' },
    { transform: 'translateY(10px) rotate(2deg)', offset: 0.7 },
    { transform: 'translateY(-3px) rotate(-1deg)', offset: 0.86 },
    { transform: 'none' },
  ], { duration: 400, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'backwards' });
  for (const { p } of puffs) anim(p, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: 300, fill: 'backwards', easing: 'ease-out' });
  await T(400);

  // 2) unroll + fog blows away
  S('paper', { volume: 0.55, pitch: 0.85 });
  const ease = 'cubic-bezier(.25,.9,.3,1.04)';
  anim(paper, [{ clipPath: 'inset(0 50% 0 50%)' }, { clipPath: 'inset(0 0% 0 0%)' }], { duration: 680, easing: ease, fill: 'forwards' });
  anim(rl, [rodsIn[0], { transform: 'none' }], { duration: 680, easing: ease, fill: 'forwards' });
  anim(rr, [rodsIn[1], { transform: 'none' }], { duration: 680, easing: ease, fill: 'forwards' });
  for (const { p, side, i } of puffs) {
    const dx = side * (W * 0.45 + 60 + ((i * 41) % 90)), dy = -10 - ((i * 23) % 40);
    anim(p, [
      { transform: 'none', opacity: 1 },
      { transform: `translate(${(dx * 0.5).toFixed(0)}px, ${(dy * 0.4).toFixed(0)}px) scale(1.1, .95)`, opacity: 0.85, offset: 0.4 },
      { transform: `translate(${dx.toFixed(0)}px, ${dy.toFixed(0)}px) scale(1.25, .7)`, opacity: 0 },
    ], { duration: 1100 + ((i * 97) % 500), delay: 80 + ((i * 31) % 160), easing: 'cubic-bezier(.3,.1,.4,1)', fill: 'forwards' });
  }
  await T(520);

  // 3) stamp + title pops
  el.classList.add('zb-show');
  await T(140);
  S('stamp', { volume: 0.6 });
  anim(wrap, [{ transform: 'none' }, { transform: 'translate(-3px, 2px)' }, { transform: 'translate(3px, -1px)' }, { transform: 'none' }], { duration: 180 });
  await T(160);
  S('discover', { volume: 0.5 });

  // 4) the villager peeks in and says hi
  if (peek) {
    await T(200);
    peek.classList.add('zb-up');
    S('pop_in', { volume: 0.4, pitch: 1.2 });
    await T(380);
    p3?.play('wave');
    setTimeout(() => p3?.talk('Hello, neighbour!'), 500);
  }
  await T(peek ? 1300 : 1800);

  // 5) duck, roll up, fly off
  if (peek) { clearInterval(talkTimer); setFrame(0); peek.classList.remove('zb-up'); peek.classList.add('zb-down'); }
  await T(260);
  el.classList.add('zb-hide');
  S('paper', { volume: 0.45, pitch: 1.2 });
  const e2 = 'cubic-bezier(.6,0,.8,.4)';
  anim(paper, [{ clipPath: 'inset(0 0% 0 0%)' }, { clipPath: 'inset(0 50% 0 50%)' }], { duration: 400, easing: e2, fill: 'forwards' });
  anim(rl, [{ transform: 'none' }, rodsIn[0]], { duration: 400, easing: e2, fill: 'forwards' });
  anim(rr, [{ transform: 'none' }, rodsIn[1]], { duration: 400, easing: e2, fill: 'forwards' });
  await T(400);
  S('whoosh', { volume: 0.4, pitch: 1.2 });
  const fly = anim(wrap, [
    { transform: 'none', opacity: 1 },
    { transform: 'translateY(12px) rotate(3deg)', opacity: 1, offset: 0.25 },
    { transform: 'translateY(-160%) rotate(-14deg)', opacity: 0 },
  ], { duration: 380, easing: 'cubic-bezier(.5,0,.75,.4)', fill: 'forwards' });
  await (fly ? Promise.race([fly.finished.catch(() => {}), sleep(600)]) : sleep(380));
  clearInterval(talkTimer);
  p3?.dispose();
  el.remove();
}
