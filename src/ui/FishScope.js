// Professor Reynard's Fish Scope: tapping a fish brings in Reynard in his lab
// coat (goggles, clipboard, magnifier) who studies it, while a cyan hologram
// overlay locks onto the real fish in the pond: corner brackets, a scan sweep,
// a length ruler and leader-line arrows from big readable labels to the fish's
// face, belly, body, tail and glow. Tap a label to expand it; the action bar
// keeps Tag / Pet / Tank / Matchmaker / Close. The game runs in slow motion
// while it's open and the camera glides onto the fish.
//
//   import { openFishScope, closeFishScope, isFishScopeOpen } from './FishScope.js';
//   openFishScope(game, fish);   // -> handle { close(), refresh(), fish, el } or null
//   closeFishScope();
//   createScopeFox(el, opts);    // the scientist bust on its own (preview / reuse)
//
// Nothing is built at import time.
import * as THREE from 'three';
import { createFoxTalk } from './FoxTalk3D.js';
import { propParts } from '../entities/foxProps.js';
import { spriteImg, hasSprite } from './sprites.js';
import { fishIconURL } from '../game/fishSprites.js';
import { RARITIES, MORPHS, MUTATIONS, TRAITS, SPECIES_BY_ID } from '../data/species.js';
import { sizeLabel } from '../game/genes.js';
import './fishscope.css';

const GROW_TIME = 70; // FishSystem GROW_TIME (fry -> adult, sim seconds)
const SLOWMO = 0.25;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ico = (n, s = 2) => (hasSprite(n) ? spriteImg(n, s) : '');
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pct = (v) => Math.round(clamp(v || 0, 0, 1) * 100);
const _v = new THREE.Vector3();

// ------------------------------------------------------------------ fish facts
function hungerWord(h) { return h < 0.25 ? 'Stuffed' : h < 0.5 ? 'Content' : h < 0.75 ? 'Peckish' : 'Starving!'; }
function moodWord(f) {
  if (f.state === 'court' || f.dateT > 0) return 'In love';
  if (f.state === 'flee') return 'Terrified';
  if (f.love > 0.2) return 'Nurtured';
  if (f.adult && f.fed >= 0.9 && f.loveT <= 0) return 'Wants love';
  return 'Chill';
}
function fishName(f) { return f.name || f.sp?.name || 'Fish'; }
function speciesName(id) { return SPECIES_BY_ID[id]?.name || id; }

function facts(game, f) {
  const g = f.g;
  const sp = SPECIES_BY_ID[f.sp.id] || f.sp;
  const rar = RARITIES[clamp(g.stars - 1, 0, 4)];
  const mu = g.mut ? MUTATIONS[g.mut] : null;
  const mo = MORPHS[g.morph] || MORPHS.normal;
  let worth = 0;
  try { worth = Math.round(game.fish.coinValue(f) * 7 * (game.mods?.fishValueMult || 1) * (game.mods?.payMult || 1)); } catch { /* ignore */ }
  const parents = Array.isArray(f.parents) ? f.parents.map((p) => (typeof p === 'string' ? speciesName(p) : p?.name || speciesName(p?.sp))).filter(Boolean) : null;
  return {
    g, sp, rar, mu, mo, worth, parents,
    size: sizeLabel(g.size),
    grow: f.adult ? 1 : clamp((f.age || 0) / GROW_TIME, 0, 1),
    hunger: hungerWord(f.hunger || 0),
    mood: moodWord(f),
    fedFull: (f.fed || 0) >= 0.9,
    match: f.match && !f.match.dead ? f.match : null,
  };
}

// what Reynard says first (expression, line, magnifier pose first?)
function reaction(F, f) {
  const n = fishName(f);
  if (!f.adult) return { expr: 'love', fx: 'hearts', line: `A tiny fry! ${pct(F.grow)}% grown. Adorable... and someday, delicious.` };
  if (F.g.stars >= 5) return { expr: 'shocked', then: 'magnifique', line: `LEGENDARY?! ${n}... this is the find of my career!` };
  if (F.mu && F.mu.stars >= 2) return { expr: 'excited', line: `A ${F.mu.name.toUpperCase()} mutation! Fetch my good monocle!` };
  if (F.mu) return { expr: 'excited', line: `Ooh! A ${F.mu.name} mutation. Worth ${F.mu.value}x the coins!` };
  if (F.g.morph !== 'normal') return { expr: 'excited', line: `${F.mo.name} colouring! You don't see that every day.` };
  if (F.g.stars >= 3) return { expr: 'proud', line: `A ${F.rar.name.toLowerCase()} specimen. Fine genes indeed.` };
  if ((f.hunger || 0) > 0.75) return { expr: 'worried', line: `${n} is STARVING! Feed the pond, quick!` };
  return { expr: 'focused', fx: 'question', line: `Hmm. A plain ${F.sp.name}. Solid... ordinary... edible.` };
}
// then he rambles on, one short fact at a time
function chatter(F, f) {
  const out = [];
  if (F.g.traits.length) for (const t of F.g.traits) out.push({ expr: TRAITS[t]?.good ? 'happy' : 'tsk', line: `Trait: ${TRAITS[t]?.name}. ${TRAITS[t]?.desc}` });
  out.push({ expr: 'greedy', line: `Worth ${F.worth} coins to a hungry bear. Heh heh.` });
  if (f.tagged) out.push({ expr: 'smug', line: 'Tagged DO NOT EAT. The bears keep their paws off.' });
  else out.push({ expr: 'scheming', line: 'Not tagged... so it is on the menu at 5 PM.' });
  if (!f.adult) out.push({ expr: 'happy', line: 'Fry grow up on their own. Keep them fed!' });
  else if (F.fedFull) out.push({ expr: 'love', line: 'Well fed and ready for love. Romance is in the water!' });
  else out.push({ expr: 'teacher', line: 'Fill the heart meter with food and it will fall in love.' });
  if (F.match) out.push({ expr: 'love', line: `Engaged to ${fishName(F.match)}! I booked the date myself.` });
  out.push({ expr: 'teacher', line: `${F.sp.name}: ${F.sp.latin || 'species unknown'}. I wrote the textbook.` });
  return out;
}

// ------------------------------------------------------------------ scientist fox
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3();
const BOARD_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.85, 0.3, 0.1)); // root space: paper up + toward the viewer
const BOARD_OFF = new THREE.Vector3(-0.15, 0.04, -0.01); // board centre from the left paw (board space)
/** Hang the clipboard in `rig`'s left paw. It keeps a steady tilt (paper toward the viewer) whatever the wrist does. */
export function attachClipboard(rig) {
  try {
    const P = propParts('clipboard');
    const board = new THREE.Mesh(P.geo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x100800 }));
    board.name = 'clipboard';
    board.frustumCulled = false;
    const grip = rig.armL.grip;
    grip.add(board);
    board.onBeforeRender = () => {
      // world orientation = root * BOARD_Q, expressed in the grip's space
      rig.root.getWorldQuaternion(_q).multiply(BOARD_Q);
      grip.getWorldQuaternion(_q2).invert();
      board.quaternion.copy(_q2).multiply(_q);
      _p.copy(BOARD_OFF).applyQuaternion(board.quaternion);
      board.position.copy(_p);
      board.updateMatrix();
      board.matrixWorld.multiplyMatrices(grip.matrixWorld, board.matrix);
    };
    return board;
  } catch (e) { console.warn('FishScope clipboard', e); return null; }
}

/**
 * Reynard's scientist bust (FoxTalk3D) with a clipboard in his left paw.
 * pose('scribble' | 'peer'); say(text, expr, fx); returns null without WebGL.
 */
export function createScopeFox(el, { game = null, turn = 0.5 } = {}) {
  const ft = createFoxTalk(el, { outfit: 'scientist', game, turn });
  if (!ft) return null;
  const rig = ft.rig;
  const board = attachClipboard(rig);
  let want = 'sci_peer';
  const api = {
    ft, rig,
    pose(name) {
      want = name === 'scribble' ? 'sci_scribble' : 'sci_peer';
      rig.holdProp(name === 'scribble' ? 'pencil' : 'magnifier');
      rig.play(want, { fade: 0.3 });
    },
    // FoxTalk falls back to idle / talk after a line: keep our study pose on
    keep() { if (rig.current !== want) rig.play(want, { fade: 0.25 }); },
    say(text, expr, fx) {
      if (expr) ft.setExpression(expr);
      if (fx) ft.fx(fx);
      const d = ft.talk(text);
      api.keep();
      return d;
    },
    dispose() {
      if (board) { board.removeFromParent(); board.material.dispose(); }
      ft.dispose();
    },
  };
  api.pose('peer');
  return api;
}

// ------------------------------------------------------------------ callouts
// u: along the body (head = +1), v: down (+1). Each label sits on the head or tail side.
const CALLS = [
  { k: 'mut', side: 'head', slot: 0, label: 'MUTATION', icon: 'dna', at: [0.05, -1.35] },
  { k: 'mood', side: 'head', slot: 1, label: 'MOOD', icon: 'heart', at: [0.62, -0.18] },
  { k: 'hunger', side: 'head', slot: 2, label: 'HUNGER', icon: 'food', at: [0.2, 0.6] },
  { k: 'sex', side: 'tail', slot: 0, label: 'SEX', icon: null, at: [-0.68, -0.25] },
  { k: 'morph', side: 'tail', slot: 1, label: 'COLOUR', icon: 'palette', at: [-0.12, 0.0] },
  { k: 'size', side: 'tail', slot: 2, label: 'SIZE', icon: 'chart', at: [0, 'ruler'] },
];

function callValue(k, F, f) {
  const g = F.g;
  switch (k) {
    case 'mut': return F.mu ? { v: F.mu.name, c: F.mu.color, sub: `x${F.mu.value} value` } : { v: 'None', c: '#9adfe6', sub: 'no glow' };
    case 'mood': return { v: F.mood, c: F.mood === 'Terrified' ? '#ffb060' : '#ff9ad0', meter: f.love || 0, mc: '#ff8ad0', sub: `Happy ${pct(f.love)}%` };
    case 'hunger': {
      const fed = F.fedFull ? 4 : Math.floor((f.fed || 0) * 4);
      return { v: F.hunger, c: (f.hunger || 0) > 0.75 ? '#ff7a6a' : '#b8ffb0', pips: fed, sub: !f.adult ? 'Too young to breed' : F.fedFull ? 'Well fed!' : 'Well-fed meter' };
    }
    case 'sex': return { v: g.sex === 'M' ? 'Male' : 'Female', c: g.sex === 'M' ? '#7ccfff' : '#ff8ad0', glyph: g.sex === 'M' ? '♂' : '♀' };
    case 'morph': return { v: F.mo.name, c: g.morph === 'normal' ? '#e8ffff' : '#ffe27a', sub: `x${F.mo.value} value` };
    case 'size': return { v: `${F.size}  x${g.size.toFixed(2)}`, c: '#e8ffff', sub: F.grow < 1 ? `${pct(F.grow)}% grown` : 'full grown' };
    default: return { v: '?' };
  }
}
function callInfo(k, F, f) {
  const g = F.g;
  switch (k) {
    case 'mut': return F.mu ? `${F.mu.name}: a rare egg-roll bonus. Worth x${F.mu.value} coins, +${F.mu.stars} star${F.mu.stars === 1 ? '' : 's'}. It trails ${F.mu.fx === 'none' ? 'no' : F.mu.fx} fx.` : 'No mutation. Fancy food and the Matchmaker raise the odds for the babies.';
    case 'mood': return `Happiness ${pct(f.love)}%. Pet fish to nurture them: nurtured parents make better babies.`;
    case 'hunger': return `Hunger ${pct(f.hunger)}%. Feed the pond until the 4 hearts are full: a well-fed adult falls in love.`;
    case 'sex': return g.sex === 'M' ? 'A boy. He fertilizes the eggs a girl lays after their date.' : 'A girl. After a date she lays the eggs; a boy fertilizes them.';
    case 'morph': return g.morph === 'normal' ? 'Wild Type: natural colours. Rare morphs (Albino, Golden, Prismatic...) sell for much more.' : `${F.mo.name}: ${F.mo.desc || ''} Worth x${F.mo.value}.`;
    case 'size': return `Size ${F.size} = ${g.size.toFixed(2)}x normal. Bigger fish feed bears more and sell higher. Big parents, big babies.`;
    default: return '';
  }
}

// ------------------------------------------------------------------ the scope
let current = null;

export function isFishScopeOpen() { return !!current; }
export function closeFishScope() { current?.close(); }

/** Open the Fish Scope on `fish` (switches fish if already open). Returns a handle or null. */
export function openFishScope(game, fish) {
  if (!game || !fish || fish.dead) return null;
  if (current && current.game === game) { current.setFish(fish); return current; }
  current?.close(true);
  try { current = new Scope(game, fish); } catch (e) { console.warn('FishScope failed', e); current = null; }
  return current;
}

class Scope {
  constructor(game, fish) {
    this.game = game;
    this.fish = null;
    this.open = {}; // expanded callouts
    this.flip = null;
    this.t = 0;
    this.dead = false;
    const el = (this.el = document.createElement('div'));
    el.className = 'fsc';
    el.setAttribute('role', 'dialog');
    el.innerHTML = `
      <div class="fsc-dim"></div>
      <svg class="fsc-svg" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"></svg>
      <div class="fsc-hit" title="Pet"></div>
      <div class="fsc-title fsc-holo"></div>
      ${CALLS.map((c) => `<div class="fsc-call fsc-holo" data-k="${c.k}"></div>`).join('')}
      <div class="fsc-console fsc-holo">
        <div class="fsc-foxbox"><div class="fsc-fox"></div></div>
        <div class="fsc-main">
          <div class="fsc-say"><b>PROF. REYNARD</b><span class="fsc-line"></span></div>
          <div class="fsc-chips"></div>
          <div class="fsc-btns"></div>
        </div>
      </div>
      <button class="fsc-x" title="Close (Esc)">✕</button>`;
    (document.body || game.ui?.root).appendChild(el);
    this.$ = (s) => el.querySelector(s);
    this.svg = this.$('.fsc-svg');
    this.calls = CALLS.map((c) => ({ ...c, el: el.querySelector(`.fsc-call[data-k="${c.k}"]`) }));
    // interaction
    this.$('.fsc-dim').addEventListener('click', () => this.close());
    this.$('.fsc-x').addEventListener('click', () => this.close());
    this.$('.fsc-hit').addEventListener('click', () => this.act('pet'));
    for (const c of this.calls) c.el.addEventListener('click', () => this.toggle(c.k));
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (document.activeElement?.classList?.contains('fsc-name-in')) { this.render(); return; }
      this.close();
    };
    window.addEventListener('keydown', this.onKey, true);
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
    // camera + slow motion
    const rig = game.rig;
    this.saved = { follow: rig.follow, wupp: rig.wuppGoal, ts: game.timeScale };
    game.timeScale = SLOWMO;
    // the fox
    try { this.fox = createScopeFox(this.$('.fsc-fox'), { game }); } catch (e) { console.warn('FishScope fox', e); this.fox = null; }
    if (!this.fox) el.classList.add('nofox');
    this.setFish(fish);
    requestAnimationFrame(() => el.classList.add('on'));
    game.audio?.play('crt_on', { volume: 0.35 });
    this.last = performance.now();
    const loop = () => {
      if (this.dead) return;
      const now = performance.now();
      const dt = clamp((now - this.last) / 1000, 0, 0.1);
      this.last = now;
      this.update(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  setFish(f) {
    const game = this.game, rig = game.rig;
    this.fish = f;
    this.open = {};
    this.tipKey = null;
    this.flip = null;
    // glide onto the fish: zoom so it's ~140 css px wide, a little above centre (clear of the console)
    const R = game.renderer;
    const ws = this.worldSize();
    const target = clamp(window.innerWidth * 0.13, 90, 190);
    const wuppCss = ws.w / target;
    rig.wuppGoal = clamp(wuppCss * (R?.pixelScale || 3) / (R?.dpr || 1), rig.minWupp, rig.maxWupp);
    const self = this;
    rig.follow = {
      get x() { return self.fish.x + self.camOff().x; },
      get z() { return self.fish.z + self.camOff().z; },
    };
    this.render();
    this.layout();
    // Reynard's take
    const F = facts(game, f);
    this.lines = chatter(F, f);
    this.lineI = 0;
    const r = reaction(F, f);
    this.lineT = 0;
    this.fox?.pose('peer');
    this.poseT = 3.2;
    this.speak(r.line, r.expr, r.fx);
    if (r.then) setTimeout(() => { if (!this.dead && this.fish === f) this.fox?.ft.setExpression(r.then); }, 1600);
    game.audio?.play(F.mu || F.g.stars >= 3 || F.g.morph !== 'normal' ? 'reveal_rare' : 'beep', { volume: 0.3 });
  }

  refresh() { if (!this.dead) { this.render(); this.layout(); } }

  worldSize() {
    const f = this.fish;
    let w = 0.5, h = 0.3;
    try { const s = this.game.fish.worldSize(f); w = s.w; h = s.h; } catch { /* ignore */ }
    const mu = f.g.mut ? MUTATIONS[f.g.mut] : null;
    const k = (mu ? mu.scale : 1) * (f.tank ? 0.36 : 1);
    return { w: Math.max(0.05, w * k), h: Math.max(0.03, h * k) };
  }

  // world offset that puts the fish in the middle of the free band between title and console
  camOff() {
    const rig = this.game.rig, R = this.game.renderer;
    const band = this.band || { cy: window.innerHeight / 2 };
    const D = window.innerHeight / 2 - band.cy;
    const wuppCss = rig.wupp * (R?.dpr || 1) / (R?.pixelScale || 3);
    const g = (-D * wuppCss) / Math.sin(rig.pitch || 0.77);
    const fx = -Math.sin(rig.yaw || 0), fz = -Math.cos(rig.yaw || 0);
    return { x: fx * g, z: fz * g };
  }

  speak(text, expr, fx) {
    this.text = text; this.typed = 0;
    this.$('.fsc-line').textContent = '';
    this.fox?.say(text, expr, fx);
    try { this.game.audio?.babble?.('fox', text); } catch { /* optional */ }
  }

  // ---------------------------------------------------------------- DOM
  render() {
    const game = this.game, f = this.fish;
    const F = (this.F = facts(game, f));
    const rarC = F.rar.color;
    let stars = '';
    for (let i = 1; i <= 5; i++) stars += ico(i <= F.g.stars ? 'star' : 'star_empty', 2);
    this.$('.fsc-title').innerHTML = `
      <div class="fsc-pic"><img class="px" src="${fishIconURL(f.sp.id, { morph: F.g.morph, scale: 3, fry: !f.adult })}" alt=""></div>
      <div class="fsc-tx">
        <div class="fsc-name">${f.name ? `<span>${esc(f.name)}</span><small> the ${esc(F.sp.name)}</small>` : `<span>${esc(F.sp.name)}</span>`}<button class="fsc-ren" title="Rename">${ico('pen', 2) || '✎'}</button></div>
        <div class="fsc-latin">${esc(F.sp.latin || '')}${f.adult ? '' : ' · FRY'}</div>
        <div class="fsc-stars">${stars}<i style="--rc:${rarC}">${esc(F.rar.name.toUpperCase())}</i></div>
      </div>
      <div class="fsc-worth" title="What a bear pays for it">${ico('coin', 3)}<b>${F.worth}</b><small>WORTH</small></div>`;
    this.$('.fsc-ren').addEventListener('click', (e) => { e.stopPropagation(); this.rename(); });
    this.renderCalls();
    this.renderChips();
    this.renderButtons();
  }

  renderCalls() {
    const F = this.F, f = this.fish;
    for (const c of this.calls) {
      const v = callValue(c.k, F, f);
      const icon = v.glyph ? `<span class="fsc-glyph" style="color:${v.c}">${v.glyph}</span>` : ico(c.icon, 2);
      let extra = '';
      if (v.pips != null) extra = `<div class="fsc-pips">${[0, 1, 2, 3].map((i) => `<i class="${i < v.pips ? 'on' : ''}"></i>`).join('')}</div>`;
      else if (v.meter != null) extra = `<div class="fsc-meter"><i style="width:${pct(v.meter)}%;background:${v.mc}"></i></div>`;
      c.el.classList.toggle('open', !!this.open[c.k]);
      c.el.innerHTML = `<div class="fsc-ic">${icon}</div><div class="fsc-cv"><div class="fsc-lb">${c.label}<em>${this.open[c.k] ? '−' : '+'}</em></div>
        <div class="fsc-val" style="color:${v.c || '#e8ffff'}">${esc(v.v)}</div>${extra}${v.sub ? `<div class="fsc-sub">${esc(v.sub)}</div>` : ''}
        ${this.open[c.k] ? `<div class="fsc-info">${esc(callInfo(c.k, F, f))}</div>` : ''}</div>`;
    }
  }

  renderChips() {
    const F = this.F, f = this.fish;
    const chip = (key, icon, text, cls = '', style = '') => `<button class="fsc-chip ${cls}${this.tipKey === key ? ' sel' : ''}" data-tip="${key}" style="${style}">${icon}<span>${esc(text)}</span></button>`;
    const out = [];
    for (const t of F.g.traits) { const T = TRAITS[t]; if (T) out.push(chip('trait:' + t, ico(T.icon, 2), T.name, T.good ? 'good' : 'bad')); }
    if (!F.g.traits.length) out.push(chip('notraits', ico('question', 2), 'No traits', 'dim'));
    out.push(chip('age', ico(f.adult ? 'fish' : 'egg', 2), f.adult ? 'Adult' : `Fry ${pct(F.grow)}%`));
    out.push(chip('tag', ico('tag', 2), f.tagged ? 'DO NOT EAT' : 'On the menu', f.tagged ? 'warn' : 'dim'));
    out.push(chip('home', ico(f.tank ? 'tank' : 'pond', 2), f.tank ? 'In a tank' : 'In the pond'));
    if (F.match) out.push(chip('match', ico('heart', 2), `Engaged: ${fishName(F.match)}`, 'love'));
    else if (f.dateT > 0 || f.state === 'court') out.push(chip('date', ico('heart', 2), 'On a date!', 'love'));
    if (f.luck > 0.01) out.push(chip('luck', ico('clover', 2), `Luck +${Math.round(f.luck * 100)}%`, 'good'));
    if (F.parents?.length) out.push(chip('parents', ico('egg', 2), F.parents.join(' x ')));
    const box = this.$('.fsc-chips');
    box.innerHTML = out.join('');
    box.querySelectorAll('[data-tip]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.tip(b.dataset.tip); }));
  }

  tipText(key) {
    const F = this.F, f = this.fish;
    if (key.startsWith('trait:')) { const T = TRAITS[key.slice(6)]; return T ? `${T.name}: ${T.desc}` : ''; }
    return {
      notraits: 'No personality traits. Traits are inherited: breed fish that have good ones.',
      age: f.adult ? 'Grown up: can date, breed and be served.' : `A fry: ${pct(F.grow)}% grown. Fry can't breed and are worth less.`,
      tag: f.tagged ? 'Tagged DO NOT EAT: bears leave it alone.' : 'Untagged: any bear may eat it at dinner time.',
      home: f.tank ? 'In a glass tank: safe from bears, fed for you, breeds with tank mates only.' : 'Swimming in the pond with everyone else.',
      match: 'The Matchmaker engaged this pair: they only date each other.',
      date: 'On a date right now. Eggs soon!',
      luck: 'Fancy food raised its mutation luck for the next babies.',
      parents: 'Its parents.',
    }[key] || '';
  }
  tip(key) {
    this.tipKey = this.tipKey === key ? null : key;
    this.game.audio?.play('click', { volume: 0.3, pitch: 1.3 });
    this.renderChips();
    // Reynard reads the chip out (the speech line is the explanation)
    if (this.tipKey) { this.speak(this.tipText(key), key.startsWith('trait:') ? 'teacher' : 'smug'); this.poseT = Math.max(this.poseT, 5); }
  }

  renderButtons() {
    const game = this.game, f = this.fish;
    const T = game.tanks;
    let tankBtn = '';
    if (T) {
      if (f.tank) tankBtn = `<button class="fsc-btn" data-a="tank">${ico('pond', 2)}<span>To pond</span></button>`;
      else {
        const s = T.nearestWithRoom?.(f.x, f.z);
        tankBtn = `<button class="fsc-btn" data-a="tank" ${s ? '' : `disabled title="${T.list?.().length ? 'All tanks are full' : 'Build a glass tank first'}"`}>${ico('tank', 2)}<span>To tank</span></button>`;
      }
    }
    this.$('.fsc-btns').innerHTML = `
      <button class="fsc-btn ${f.tagged ? '' : 'red'}" data-a="tag">${ico('tag', 2)}<span>${f.tagged ? 'Untag' : 'Tag'}</span></button>
      <button class="fsc-btn pink" data-a="pet">${ico('nurture', 2)}<span>Pet</span></button>
      ${tankBtn}
      ${game.ui?.openMatchmaker ? `<button class="fsc-btn" data-a="match">${ico('heart', 2)}<span>Match</span></button>` : ''}
      <button class="fsc-btn close" data-a="close">${ico('cross', 2)}<span>Close</span></button>`;
    this.$('.fsc-btns').querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.act(b.dataset.a); }));
  }

  act(a) {
    const game = this.game, f = this.fish;
    if (a === 'close') { this.close(); return; }
    if (a === 'tag') {
      const ok = game.tagFish(f);
      if (ok) this.speak(f.tagged ? 'Tagged! DO NOT EAT. Hands off, bears.' : 'Tag off. Back on the menu... heh.', f.tagged ? 'proud' : 'scheming');
    } else if (a === 'pet') {
      if (game.nurtureFish(f)) {
        if (Math.random() < 0.5 || (f.love || 0) >= 1) this.speak((f.love || 0) >= 1 ? 'Fully nurtured! Look at that smile.' : 'Pat pat. Happy fish, better babies.', 'love');
        this.$('.fsc-hit').classList.remove('pet'); void this.$('.fsc-hit').offsetWidth; this.$('.fsc-hit').classList.add('pet');
      }
    } else if (a === 'tank') {
      const T = game.tanks;
      if (f.tank) { if (T.release(f)) this.speak('Back to the pond you go!', 'happy'); }
      else {
        const s = T.nearestWithRoom(f.x, f.z);
        if (s && T.put(f, s)) this.speak('Into the tank: safe and sound.', 'proud');
      }
    } else if (a === 'match') {
      const id = f.id;
      this.close(true);
      game.ui.openMatchmaker(id);
      return;
    }
    this.render();
    this.layout();
  }

  toggle(k) {
    this.open[k] = !this.open[k];
    this.game.audio?.play('click', { volume: 0.3, pitch: this.open[k] ? 1.4 : 1.1 });
    this.renderCalls();
    if (this.open[k]) { this.speak(callInfo(k, this.F, this.fish), 'teacher'); this.poseT = Math.max(this.poseT, 5); }
  }

  rename() {
    const box = this.$('.fsc-name');
    const f = this.fish;
    box.innerHTML = `<input class="fsc-name-in" maxlength="16" placeholder="${esc(f.sp.name)}" value="${esc(f.name || '')}">`;
    const inp = box.querySelector('input');
    inp.focus(); inp.select();
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      const v = inp.value.trim().slice(0, 16);
      if (v !== (f.name || '')) {
        f.name = v || null;
        try { this.game.save?.(); } catch { /* ignore */ }
        if (v) this.speak(`${v}! A fine scientific name.`, 'proud');
      }
      if (!this.dead) { this.render(); this.layout(); }
    };
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation(); // keep WASD / tool hotkeys out of the game
      if (e.key === 'Enter') commit();
    });
    inp.addEventListener('blur', commit);
  }

  // ---------------------------------------------------------------- layout
  layout() {
    const W = window.innerWidth, H = window.innerHeight;
    const small = W < 900 || H < 650;
    this.el.classList.toggle('small', small);
    const title = this.$('.fsc-title'), con = this.$('.fsc-console');
    const tb = title.offsetHeight + 12, cb = con.offsetHeight + 12;
    const top = tb + 8, bot = H - cb - 8;
    this.band = { top, bot, cy: (top + bot) / 2 };
    this.colW = clamp(W * 0.235, 196, 300);
    this.place(true);
  }

  // put the callout columns on the head / tail side of the fish
  place(force) {
    const f = this.fish;
    const flip = !!f.flip;
    if (!force && flip === this.flip) return;
    this.flip = flip;
    const W = window.innerWidth;
    const { top, bot } = this.band;
    const headRight = !flip;
    for (const c of this.calls) {
      const right = (c.side === 'head') === headRight;
      const n = 3, h = (bot - top) / n;
      c.el.style.width = this.colW + 'px';
      c.el.style.left = (right ? W - 14 - this.colW : 14) + 'px';
      c.el.style.top = Math.round(top + h * c.slot + Math.max(0, (h - c.el.offsetHeight) * 0.5)) + 'px';
      c.right = right;
    }
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    const f = this.fish, game = this.game;
    if (!f || f.dead || f.held) { this.close(); return; }
    this.t += dt;
    // keep the camera on our follower (other systems may grab it)
    this.fox?.keep();
    // typewriter
    if (this.text && this.typed < this.text.length) {
      this.typed = Math.min(this.text.length, this.typed + dt * 42);
      this.$('.fsc-line').textContent = this.text.slice(0, Math.ceil(this.typed));
    }
    // Reynard alternates: peer through the magnifier, scribble notes, say the next fact
    this.poseT -= dt;
    if (this.poseT <= 0) {
      const scrib = this.fox?.rig.current !== 'sci_scribble';
      this.fox?.pose(scrib ? 'scribble' : 'peer');
      this.poseT = scrib ? 6 : 3.5;
      if (scrib) game.audio?.play('pen', { volume: 0.2 });
      else if (this.lines?.length && !this.tipKey) {
        const L = this.lines[this.lineI++ % this.lines.length];
        this.speak(L.line, L.expr);
      }
    }
    // live values
    this.refreshT = (this.refreshT || 0) - dt;
    if (this.refreshT <= 0) {
      this.refreshT = 0.5;
      this.F = facts(game, f);
      this.renderCalls();
    }
    this.place(false);
    this.draw();
  }

  draw() {
    const game = this.game, f = this.fish;
    const W = window.innerWidth, H = window.innerHeight;
    const ui = game.ui;
    const c = ui.screenOf(f.x, f.y, f.z);
    // sprite size on screen: project half a body length along the camera's ground-right axis
    const ws = this.worldSize();
    const m = game.rig.camera.matrixWorld.elements;
    const rl = Math.hypot(m[0], m[2]) || 1;
    _v.set(f.x + (m[0] / rl) * ws.w * 0.5, f.y, f.z + (m[2] / rl) * ws.w * 0.5);
    const e = game.rig.worldToScreen(_v, game.renderer);
    const hw = Math.max(26, Math.abs(e.x - c.x) * 0.86), hh = Math.max(16, hw * (ws.h / ws.w) * 0.9);
    const s = f.flip ? -1 : 1;
    const cx = Math.round(c.x), cy = Math.round(c.y);
    const P = (u, v) => [Math.round(cx + s * u * hw), Math.round(cy + v * hh)];
    // hit area for petting
    const hit = this.$('.fsc-hit');
    hit.style.transform = `translate(${cx - hw - 10}px, ${cy - hh - 10}px)`;
    hit.style.width = (hw * 2 + 20) + 'px'; hit.style.height = (hh * 2 + 20) + 'px';
    const pad = 16;
    const x0 = cx - hw - pad, x1 = cx + hw + pad, y0 = cy - hh - pad, y1 = cy + hh + pad;
    const L = 14;
    const flick = (Math.floor(this.t * 12) % 23 === 0) ? 0.55 : 1;
    let o = `<g class="fsc-g" opacity="${flick}">`;
    // corner brackets
    const brD = `M${x0} ${y0 + L}V${y0}H${x0 + L}M${x1 - L} ${y0}H${x1}V${y0 + L}M${x1} ${y1 - L}V${y1}H${x1 - L}M${x0 + L} ${y1}H${x0}V${y1 - L}`;
    o += `<path class="gl" d="${brD}"/><path class="br" d="M${x0} ${y0 + L}V${y0}H${x0 + L}M${x1 - L} ${y0}H${x1}V${y0 + L}M${x1} ${y1 - L}V${y1}H${x1 - L}M${x0 + L} ${y1}H${x0}V${y1 - L}"/>`;
    // scan sweep
    const sw = y0 + ((this.t * 0.7) % 1) * (y1 - y0);
    o += `<rect class="sweep" x="${x0 + 2}" y="${Math.round(sw)}" width="${x1 - x0 - 4}" height="2"/><rect class="sweepg" x="${x0 + 2}" y="${Math.round(sw) - 8}" width="${x1 - x0 - 4}" height="8"/>`;
    // ruler under the fish
    const ry = y1 + 12, rx0 = cx - Math.round(hw), rx1 = cx + Math.round(hw);
    o += `<path class="ru" d="M${rx0} ${ry}H${rx1}M${rx0} ${ry - 6}V${ry + 6}M${rx1} ${ry - 6}V${ry + 6}`;
    for (let i = 1; i < 10; i++) { const x = Math.round(rx0 + (rx1 - rx0) * i / 10); o += `M${x} ${ry}V${ry + (i === 5 ? 6 : 3)}`; }
    o += '"/>';
    // mutation glow ring
    const mu = f.g.mut ? MUTATIONS[f.g.mut] : null;
    if (mu) o += `<ellipse class="glow" cx="${cx}" cy="${cy}" rx="${Math.round(hw + 8)}" ry="${Math.round(hh + 8)}" stroke="${mu.color}" stroke-dashoffset="${Math.round(this.t * 20)}"/>`;
    // face reticle
    const [ex, ey] = P(0.62, -0.18);
    o += `<rect class="ret" x="${ex - 5}" y="${ey - 5}" width="10" height="10"/>`;
    // leader lines + arrowheads
    for (const k of this.calls) {
      const r = k.el.getBoundingClientRect();
      if (!r.width) continue;
      const [ax, ay] = k.at[1] === 'ruler' ? [cx, ry + 2] : P(k.at[0], k.at[1]);
      const sx = k.right ? Math.round(r.left) : Math.round(r.right);
      const sy = Math.round(r.top + Math.min(34, r.height / 2));
      const knee = k.right ? Math.min(sx - 18, Math.max(ax + 30, x1 + 22)) : Math.max(sx + 18, Math.min(ax - 30, x0 - 22));
      const kx = Math.round(knee);
      const dx = ax - kx, dy = ay - sy, d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      const bx = Math.round(ax - ux * 4), by = Math.round(ay - uy * 4);
      const hot = this.open[k.k] ? ' hot' : '';
      o += `<path class="gl" d="M${sx} ${sy}H${kx}L${bx} ${by}"/><path class="ld${hot}" d="M${sx} ${sy}H${kx}L${bx} ${by}"/>`;
      const px = -uy, py = ux;
      o += `<path class="ah${hot}" d="M${ax} ${ay}L${Math.round(bx - ux * 8 + px * 7)} ${Math.round(by - uy * 8 + py * 7)}L${Math.round(bx - ux * 8 - px * 7)} ${Math.round(by - uy * 8 - py * 7)}Z"/>`;
      o += `<rect class="dot${hot}" x="${sx + (k.right ? -4 : 0)}" y="${sy - 2}" width="4" height="4"/>`;
    }
    o += '</g>';
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.svg.innerHTML = o;
  }

  close(quick = false) {
    if (this.dead) return;
    this.dead = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.onResize);
    const game = this.game, rig = game.rig;
    // camera back: keep following the fish only if something was tracking it before
    rig.follow = this.saved.follow || null;
    rig.wuppGoal = this.saved.wupp;
    if (game.timeScale === SLOWMO) game.timeScale = this.saved.ts === SLOWMO ? 1 : this.saved.ts;
    if (current === this) current = null;
    if (!quick) game.audio?.play('crt_off', { volume: 0.3 });
    const el = this.el;
    el.classList.remove('on');
    el.classList.add('off');
    setTimeout(() => { this.fox?.dispose(); el.remove(); }, quick ? 0 : 220);
  }
}

if (typeof window !== 'undefined') window.__fishScope = { open: openFishScope, close: closeFishScope, get current() { return current; } };
