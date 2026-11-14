// Professor Reynard's Fish Scope: tapping a fish brings in Reynard in his lab
// coat (goggles, clipboard, magnifier) who studies it. [v33 scope] It is a naturalist's
// field kit, not a hologram: a brass magnifier sits over the real fish in the pond with a
// boxwood ruler under it, manila luggage tags hang off both sides on twine pinned to the
// fish (face, belly, fins, tail...), a museum specimen label with an ink rarity stamp and a
// price tag sits on top, and his field notes + the action buttons lie on a wooden board at
// the bottom. Tap a tag to turn it over (details); the buttons keep Tag / Pet / Tank /
// Match / Vial / Close. The game runs in slow motion while it's open and the camera glides
// onto the fish. All art is painted pixel by pixel in fishScopeArt.js.
//
//   import { openFishScope, closeFishScope, isFishScopeOpen } from './FishScope.js';
//   openFishScope(game, fish);   // -> handle { close(), refresh(), fish, el } or null
//   closeFishScope();
//   createScopeFox(el, opts);    // the scientist bust on its own (preview / reuse)
//
// Tutorial hooks (src/game/tutorial/fishCourse.js) kept: .fsc .fsc-say .fsc-line
// .fsc-call[data-k] (hunger mood sex morph size mut, + age breed) .fsc-worth .fsc-btns .fsc-x,
// handle.open[k] / toggle(k) / renderCalls() / speak() / poseT / tipKey.
//
// Nothing is built at import time.
import * as THREE from 'three';
import { createFoxTalk } from './FoxTalk3D.js';
import { propParts } from '../entities/foxProps.js';
import { spriteImg, hasSprite } from './sprites.js';
import { fishIconURL } from '../game/fishSprites.js';
import { RARITIES, MORPHS, MUTATIONS, TRAITS, SPECIES_BY_ID } from '../data/species.js';
import { sizeLabel, valueMult } from '../game/genes.js';
import { frameStyle } from './frames.js';
import { deco, stamp as inkStamp } from './paper.js';
import { pxTextCanvas } from './kinetic/pxfont.js';
import { artPx } from './physical/pix.js';
import { scopeArtCSS, eyeletURL, gaugeURL, heartsURL, swatchURL, tickURL, paintVignette, drawLens } from './fishScopeArt.js';
import './fishscope.css';

const GROW_TIME = 70; // FishSystem GROW_TIME (fry -> adult, sim seconds)
const SLOWMO = 0.25;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ico = (n, s = 2) => (hasSprite(n) ? spriteImg(n, s) : '');
// a painted piece (art w x h) shown at P CSS px per art px
const pimg = (url, w, h, P, cls = '') => `<img class="px ${cls}" src="${url}" width="${Math.round(w * P)}" height="${Math.round(h * P)}" alt="" draggable="false">`;
// rarity ink for the stamp (the RARITIES colours are made for dark panels; these read on paper)
const RAR_INK = ['#6b5a44', '#2f7a3a', '#2e64b0', '#7a3ab0', '#c06a10'];
// value ink on paper (morph / mutation colours are pale: they go on the paint swatch instead)
const INKC = { ink: '#2a1a0c', blue: '#2e5aa0', pink: '#b8365e', green: '#2f6f4a', red: '#b0303a', brown: '#7a4a12', grey: '#6a5a46' };
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
    breed: breedInfo(f),
    born: f.born || 1,
    days: Math.max(0, ((game.state?.day || 1) - (f.born || 1))),
    vmult: valueMult(g),
  };
}

// FishSystem.eligibleForLove: adult, well-fed meter full, not starving, love cooldown over, calm
function breedInfo(f) {
  const checks = [
    { k: 'adult', ok: !!f.adult, label: 'Grown' },
    { k: 'fed', ok: (f.fed || 0) >= 0.9, label: 'Well fed' },
    { k: 'hunger', ok: (f.hunger || 0) < 0.75, label: 'Not starving' },
    { k: 'rest', ok: (f.loveT || 0) <= 0, label: 'Rested' },
  ];
  const dating = f.state === 'court' || f.dateT > 0;
  const ready = checks.every((c) => c.ok) && f.state !== 'flee';
  let word;
  if (dating) word = 'On a date!';
  else if (!f.adult) word = 'Too young';
  else if (ready) word = 'Ready!';
  else if ((f.hunger || 0) >= 0.75) word = 'Starving';
  else if ((f.fed || 0) < 0.9) word = 'Needs food';
  else if ((f.loveT || 0) > 0) word = 'Resting';
  else word = 'Scared';
  return { checks, ready: ready || dating, dating, word, rest: Math.max(0, Math.ceil(f.loveT || 0)) };
}

// [v33 tut2] Reynard's lines in the Scope are plain observations about THIS fish right now (its name,
// numbers and state), the way you'd point things out to a friend: no jokes, nothing he could say anytime.
const heOf = (f) => (f.g?.sex === 'M' ? 'he' : 'she');
const himOf = (f) => (f.g?.sex === 'M' ? 'him' : 'her');
const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1);
/** what's missing before it can breed, in words ('' when ready) */
function breedLine(F, f) {
  const n = fishName(f), B = F.breed, he = heOf(f);
  if (B.dating) return `${n} is on a date right now. Eggs soon.`;
  if (!f.adult) return `${n} is a fry, ${pct(F.grow)}% grown. Fry can't breed until they're grown.`;
  if (B.ready) return `${n} is ready to breed. ${cap1(he)} needs a ${f.g.sex === 'M' ? 'girl' : 'boy'} who's ready too.`;
  const [, fed, hunger, rest] = B.checks;
  if (fed.ok && hunger.ok && !rest.ok) return `${n}'s full and grown. ${cap1(he)} just needs rest before ${he} can breed${B.rest ? `, about ${B.rest} more seconds` : ''}.`;
  if (!hunger.ok) return `${n} is starving. Feed ${himOf(f)} before anything else.`;
  if (!fed.ok) return `${n}'s well-fed heart is at ${pct(f.fed)}%. Feed ${himOf(f)} until it's full.`;
  return `${n} is too scared to breed right now.`;
}
// what Reynard says first (expression, line)
function reaction(F, f) {
  const n = fishName(f);
  if ((f.hunger || 0) > 0.75) return { expr: 'worried', line: `${n} is ${pct(f.hunger)}% hungry. Feed ${himOf(f)} soon.` };
  if (F.mu) return { expr: 'excited', line: `${n} has the ${F.mu.name} mutation. That multiplies ${F.g.sex === 'M' ? 'his' : 'her'} worth by ${F.mu.value}.` };
  if (F.g.morph !== 'normal') return { expr: 'excited', line: `${n} is ${F.mo.name}. That colour is worth x${F.mo.value}.` };
  if (!f.adult) return { expr: 'happy', line: `${n} is a fry, ${pct(F.grow)}% grown.` };
  return { expr: 'focused', line: `${n}: a ${F.g.sex === 'M' ? 'boy' : 'girl'} ${F.sp.name}, ${pct(f.hunger)}% hungry, ${pct(f.love)}% happy.` };
}
// then he rambles on, one short fact at a time
function chatter(F, f) {
  const out = [];
  const n = fishName(f), he = heOf(f), him = himOf(f);
  out.push({ expr: F.breed.ready ? 'love' : 'teacher', line: breedLine(F, f) });
  out.push({ expr: 'greedy', line: `A bear would pay ${F.worth} coins to eat ${n}.` });
  if (f.tagged) out.push({ expr: 'smug', line: `${n} has a DO NOT EAT tag. The bears leave ${him} alone.` });
  else if (f.tank) out.push({ expr: 'smug', line: `${n} is in a glass tank, out of the bears' reach.` });
  else out.push({ expr: 'teacher', line: `${n} isn't tagged, so a bear could eat ${him} at 5 PM.` });
  if (F.g.traits.length) for (const t of F.g.traits) out.push({ expr: TRAITS[t]?.good ? 'happy' : 'tsk', line: `${n} has the ${TRAITS[t]?.name} trait: ${TRAITS[t]?.desc}` });
  if (F.match) out.push({ expr: 'love', line: `${n} is matched with ${fishName(F.match)}. ${cap1(he)} only dates ${fishName(F.match)}.` });
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

// ------------------------------------------------------------------ the tags
// u: along the body (head = +1), v: down (+1): where each tag's twine is pinned on the fish.
// Each tag hangs on the head or the tail side; slot = its row (0 top .. 3 bottom).
const CALLS = [
  { k: 'mut', side: 'head', slot: 0, label: 'MUTATION', icon: 'dna', at: [0.12, -0.62] },
  { k: 'mood', side: 'head', slot: 1, label: 'MOOD', icon: 'heart', at: [0.62, -0.18] },
  { k: 'hunger', side: 'head', slot: 2, label: 'HUNGER', icon: 'food', at: [0.3, 0.42] },
  { k: 'breed', side: 'head', slot: 3, label: 'BREEDING', icon: 'egg', at: [-0.05, 0.5] },
  { k: 'sex', side: 'tail', slot: 0, label: 'SEX', icon: null, at: [-0.3, -0.5] },
  { k: 'morph', side: 'tail', slot: 1, label: 'COLOUR', icon: 'palette', at: [-0.15, 0.02] },
  { k: 'age', side: 'tail', slot: 2, label: 'AGE', icon: 'hourglass', at: [-0.78, 0.0] },
  { k: 'size', side: 'tail', slot: 3, label: 'SIZE', icon: 'chart', at: [0, 'ruler'] },
];
const SLOTS = 4;

function callValue(k, F, f, P) {
  const g = F.g;
  switch (k) {
    case 'mut': return F.mu
      ? { v: F.mu.name, c: INKC.ink, swatch: F.mu.color, sub: `x${F.mu.value} value${F.mu.stars ? `, +${F.mu.stars} star${F.mu.stars > 1 ? 's' : ''}` : ''}` }
      : { v: 'None', c: INKC.grey, sub: 'No glow' };
    case 'mood': return { v: F.mood, c: F.mood === 'Terrified' ? INKC.red : INKC.pink, gauge: [gaugeURL(f.love || 0, 'pink', 50, P), 50], sub: `Happy ${pct(f.love)}%` };
    case 'hunger': {
      const fed = F.fedFull ? 4 : Math.floor((f.fed || 0) * 4);
      const h = f.hunger || 0;
      return { v: F.hunger, c: h > 0.75 ? INKC.red : h > 0.5 ? INKC.brown : INKC.green, hearts: fed, gauge: [gaugeURL(h, h > 0.75 ? 'red' : h > 0.5 ? 'orange' : 'green', 36, P), 36],
        sub: !f.adult ? 'Too young to breed' : F.fedFull ? 'Well fed!' : 'Well-fed meter' };
    }
    case 'breed': {
      const B = F.breed;
      return { v: B.word, c: B.ready ? INKC.green : !f.adult ? INKC.grey : INKC.brown, checks: B.checks,
        sub: B.dating ? 'Eggs soon' : F.match ? `Engaged: ${fishName(F.match)}` : !f.adult ? `${pct(F.grow)}% grown` : B.ready ? 'Looking for a mate' : B.rest && F.fedFull ? `Rests ~${B.rest}s` : `Fed ${pct(f.fed)}%` };
    }
    case 'sex': return { v: g.sex === 'M' ? 'Male' : 'Female', c: g.sex === 'M' ? INKC.blue : INKC.pink, glyph: g.sex === 'M' ? '♂' : '♀', sub: g.sex === 'M' ? 'Fertilizes the eggs' : 'Lays the eggs' };
    case 'morph': return { v: F.mo.name, c: INKC.ink, morphPic: true, sub: `x${F.mo.value} value` };
    case 'age': return { v: f.adult ? 'Adult' : `Fry ${pct(F.grow)}%`, c: f.adult ? INKC.ink : INKC.green, gauge: f.adult ? null : [gaugeURL(F.grow, 'green', 50, P), 50], sub: `Born day ${F.born}${F.days ? `, ${F.days} day${F.days > 1 ? 's' : ''} old` : ', today'}` };
    case 'size': return { v: `${F.size}  x${g.size.toFixed(2)}`, c: INKC.ink, sub: F.grow < 1 ? `${pct(F.grow)}% grown` : 'Full grown' };
    default: return { v: '?' };
  }
}
function callInfo(k, F, f) {
  const g = F.g, n = fishName(f), he = heOf(f), him = himOf(f);
  switch (k) {
    case 'mut': return F.mu ? `${n} has the ${F.mu.name} mutation: worth x${F.mu.value}, and +${F.mu.stars} star${F.mu.stars === 1 ? '' : 's'} of rarity.` : `${n} has no mutation. Most fish don't; about one fresh egg in five rolls one.`;
    case 'mood': return `${n} is ${pct(f.love)}% happy. ${f.love >= 0.9 ? 'Happy fish breed sooner and have luckier babies.' : `Pet ${him} to raise it.`}`;
    case 'hunger': return `${n} is ${pct(f.hunger)}% hungry, and ${he === 'he' ? 'his' : 'her'} well-fed heart is at ${pct(f.fed)}%.${(f.fed || 0) < 0.9 ? ` Feed ${him} to fill it.` : ''}`;
    case 'breed': return breedLine(F, f);
    case 'sex': return g.sex === 'M' ? `${n} is a boy. After a date, he fertilizes the eggs the girl lays.` : `${n} is a girl. After a date, she lays the eggs.`;
    case 'morph': return g.morph === 'normal' ? `${n} has the normal wild colours: x1 value.` : `${n} is ${F.mo.name}: worth x${F.mo.value}. ${F.mo.desc || ''}`;
    case 'age': return f.adult ? `${n} is grown, born on day ${F.born}.` : `${n} is a fry, ${pct(F.grow)}% grown. Fry are worth about a third until they grow up.`;
    case 'size': return `${n} is ${F.size}, x${g.size.toFixed(2)}. Bigger fish are worth more and fill a bear more.`;
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

let btnCSS = '';
function injectButtonCSS(P) {
  const key = String(P);
  if (btnCSS === key || typeof document === 'undefined') return;
  btnCSS = key;
  const s = Math.max(1, Math.round(P));
  const css = [
    `.fsc-console{${frameStyle('wood', s)}}`,
    `.fsc-btn{${frameStyle('button_gold', s)}}`,
    `.fsc-btn.red{${frameStyle('button_red', s)}}`,
    `.fsc-btn.vial{${frameStyle('button_green', s)}}`,
    `.fsc-btn:disabled{${frameStyle('button_disabled', s)}}`,
    `.fsc-btn.close,.fsc-x{${frameStyle('wood_dark', s)}}`,
  ].join('\n');
  let st = document.getElementById('fsc-btn-css');
  if (!st) { st = document.createElement('style'); st.id = 'fsc-btn-css'; document.head.appendChild(st); }
  st.textContent = css;
}

class Scope {
  constructor(game, fish) {
    this.game = game;
    this.fish = null;
    this.open = {}; // turned-over tags
    this.flip = null;
    this.t = 0;
    this.dead = false;
    this.P = artPx();
    scopeArtCSS(this.P);
    injectButtonCSS(this.P);
    const el = (this.el = document.createElement('div'));
    el.className = 'fsc';
    el.setAttribute('role', 'dialog');
    el.innerHTML = `
      <div class="fsc-dim"></div>
      <canvas class="fsc-art"></canvas>
      <div class="fsc-hit" title="Pet"></div>
      <div class="fsc-fx"></div>
      ${CALLS.map((c, i) => `<div class="fsc-call fsc-tagR" data-k="${c.k}" style="--i:${i}"></div>`).join('')}
      <div class="fsc-title fsc-card"></div>
      <div class="fsc-console">
        <div class="fsc-foxbox"><div class="fsc-fox"></div></div>
        <div class="fsc-main fsc-sheet">
          <div class="fsc-say"><b>REYNARD</b><span class="fsc-line"></span></div>
          <div class="fsc-chips"></div>
        </div>
        <div class="fsc-btns"></div>
      </div>
      <button class="fsc-x" title="Close (Esc)">${ico('cross', 2) || 'X'}</button>`;
    (document.body || game.ui?.root).appendChild(el);
    this.$ = (s) => el.querySelector(s);
    this.art = this.$('.fsc-art');
    this.calls = CALLS.map((c) => ({ ...c, el: el.querySelector(`.fsc-call[data-k="${c.k}"]`), right: true }));
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
    this.onResize = () => { this.P = artPx(); scopeArtCSS(this.P); injectButtonCSS(this.P); this.render(); this.layout(); };
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
    game.audio?.play('paper', { volume: 0.4, pitch: 0.9 });
    setTimeout(() => { if (!this.dead) game.audio?.play('stamp', { volume: 0.25 }); }, 380);
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
    const swap = !!this.fish && this.fish !== f;
    this.fish = f;
    this.open = {};
    this.tipKey = null;
    this.flip = null;
    this.lens = null;
    // glide onto the fish: zoom so it's ~140 css px wide, in the free band between label and board
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
    if (swap) { this.el.classList.remove('swap'); void this.el.offsetWidth; this.el.classList.add('swap'); }
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

  // world offset that puts the fish in the middle of the free band between the label and the board
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
    const game = this.game, f = this.fish, P = this.P;
    const F = (this.F = facts(game, f));
    const small = window.innerWidth < 900 || window.innerHeight < 650;
    let stars = '';
    for (let i = 1; i <= 5; i++) stars += ico(i <= F.g.stars ? 'star' : 'star_empty', small ? 1 : 2);
    const rarI = clamp(F.g.stars - 1, 0, 4);
    this.$('.fsc-title').innerHTML = `
      ${deco('tape', { variant: 'yellow', w: 22, h: 8, seed: 3 + (f.id % 5), px: P, cls: 'fsc-tape a' })}
      ${deco('tape', { variant: 'yellow', w: 22, h: 8, seed: 7 + (f.id % 3), px: P, cls: 'fsc-tape b' })}
      <div class="fsc-pic"><img class="px" src="${fishIconURL(f.sp.id, { morph: F.g.morph, scale: 2, fry: !f.adult })}" alt=""><span class="fsc-no"></span></div>
      <div class="fsc-tx">
        <div class="fsc-name">${f.name ? `<span>${esc(f.name)}</span><small> the ${esc(F.sp.name)}</small>` : `<span>${esc(F.sp.name)}</span>`}<button class="fsc-ren" title="Rename">${ico('pen', 2) || '&#9998;'}</button></div>
        <div class="fsc-latin"></div>
        <div class="fsc-stars">${stars}${inkStamp(F.rar.name, RAR_INK[rarI], -6, { anim: true, cls: 'fsc-rar' })}</div>
      </div>
      <div class="fsc-worth fsc-tagL" title="What a bear pays for it">${pimg(eyeletURL('L', P), 11, 11, P, 'fsc-eye')}${ico('coin', 2)}<b>${F.worth}</b><small>COINS</small><em>x${F.vmult.toFixed(2)}</em></div>`;
    // pencil notes: the latin name and the specimen number, in the pixel script hand
    const pen = (t, maxW) => pxTextCanvas(t, { font: 'script', color: '#4a4858', bleed: '#8a8698', scale: P, maxW });
    if (F.sp.latin || !f.adult) this.$('.fsc-latin').appendChild(pen(`${F.sp.latin || ''}${f.adult ? '' : '  (fry)'}`));
    this.$('.fsc-no').appendChild(pen(`No.${f.id}`));
    this.$('.fsc-ren').addEventListener('click', (e) => { e.stopPropagation(); this.rename(); });
    this.renderCalls();
    this.renderChips();
    this.renderButtons();
  }

  renderCalls() {
    const F = this.F, f = this.fish, P = this.P;
    for (const c of this.calls) {
      const v = callValue(c.k, F, f, P);
      const open = !!this.open[c.k];
      const icon = v.glyph ? `<span class="fsc-glyph" style="color:${v.c}">${v.glyph}</span>` : ico(c.icon, 2);
      let extra = '';
      if (v.hearts != null) extra += `<span class="fsc-pips" title="Well-fed meter">${pimg(heartsURL(v.hearts, 4, P), 36, 7, P)}</span>`;
      if (v.gauge) extra += `<span class="fsc-meter">${pimg(v.gauge[0], v.gauge[1], 9, P)}</span>`;
      if (v.swatch) extra += `<span class="fsc-sw">${pimg(swatchURL(v.swatch, P), 12, 8, P)}</span>`;
      if (v.morphPic) extra += `<span class="fsc-mpic"><img class="px" src="${fishIconURL(f.sp.id, { morph: F.g.morph, scale: Math.max(1, Math.round(P)), fry: !f.adult })}" alt=""></span>`;
      const checks = v.checks ? `<div class="fsc-checks">${v.checks.map((x) => `<span class="${x.ok ? 'ok' : ''}">${pimg(tickURL(x.ok, P), 12, 11, P)}${esc(x.label)}</span>`).join('')}</div>` : '';
      c.el.classList.toggle('open', open);
      c.el.classList.toggle('fsc-tagR', c.right);
      c.el.classList.toggle('fsc-tagL', !c.right);
      c.el.innerHTML = `${pimg(eyeletURL(c.right ? 'R' : 'L', P), 11, 11, P, 'fsc-eye')}
        <div class="fsc-ic">${icon}</div><div class="fsc-cv"><div class="fsc-lb">${c.label}<em>${open ? '-' : '+'}</em></div>
        <div class="fsc-val" style="color:${v.c || INKC.ink}">${esc(v.v)}</div>${extra ? `<div class="fsc-ex">${extra}</div>` : ''}${v.sub ? `<div class="fsc-sub">${esc(v.sub)}</div>` : ''}
        ${checks}${open ? `<div class="fsc-info">${esc(callInfo(c.k, F, f))}</div>` : ''}</div>`;
    }
  }

  renderChips() {
    const F = this.F, f = this.fish;
    const chip = (key, icon, text, cls = '') => `<button class="fsc-chip fsc-lbl ${cls}${this.tipKey === key ? ' sel' : ''}" data-tip="${key}">${icon}<span>${esc(text)}</span></button>`;
    const out = [];
    for (const t of F.g.traits) { const T = TRAITS[t]; if (T) out.push(chip('trait:' + t, ico(T.icon, 2), T.name, T.good ? 'good' : 'bad')); }
    if (!F.g.traits.length) out.push(chip('notraits', ico('question', 2), 'No traits', 'dim'));
    out.push(chip('tag', ico('tag', 2), f.tagged ? 'DO NOT EAT' : 'On the menu', f.tagged ? 'warn' : 'dim'));
    out.push(chip('home', ico(f.tank ? 'tank' : 'pond', 2), f.tank ? 'In a tank' : 'In the pond'));
    if (F.match) out.push(chip('match', ico('heart', 2), `Engaged: ${fishName(F.match)}`, 'love'));
    else if (f.dateT > 0 || f.state === 'court') out.push(chip('date', ico('heart', 2), 'On a date!', 'love'));
    if (f.luck > 0.01) out.push(chip('luck', ico('clover', 2), `Luck +${Math.round(f.luck * 100)}%`, 'good'));
    if (F.parents?.length) out.push(chip('parents', ico('egg', 2), `Parents: ${F.parents.join(' x ')}`));
    const box = this.$('.fsc-chips');
    box.innerHTML = out.join('');
    box.querySelectorAll('[data-tip]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.tip(b.dataset.tip); }));
  }

  tipText(key) {
    const F = this.F, f = this.fish, n = fishName(f), him = himOf(f);
    if (key.startsWith('trait:')) { const T = TRAITS[key.slice(6)]; return T ? `${n} has the ${T.name} trait: ${T.desc}` : ''; }
    return {
      notraits: `${n} has no traits. Babies can inherit traits from their parents.`,
      age: f.adult ? `${n} is grown: ${heOf(f)} can breed and be served.` : `${n} is a fry, ${pct(F.grow)}% grown.`,
      tag: f.tagged ? `${n} is tagged DO NOT EAT. The bears leave ${him} alone.` : `${n} isn't tagged. A bear could eat ${him} at 5 PM.`,
      home: f.tank ? `${n} is in a glass tank: safe from bears, fed for you, breeds with tank mates only.` : `${n} is in the pond with the others.`,
      match: `${n} is matched by the Matchmaker: this pair only dates each other.`,
      date: `${n} is on a date right now. Eggs soon.`,
      luck: `Fancy food raised ${n}'s luck for the next babies.`,
      parents: `${n}'s parents: ${(F.parents || []).join(' and ')}. Babies get size, colour and traits from them.`,
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
    if (T && f.tank) {
      if (f.tank) tankBtn = `<button class="fsc-btn" data-a="tank">${ico('pond', 2)}<span>To pond</span></button>`;
      else {
        const s = T.nearestWithRoom?.(f.x, f.z);
        tankBtn = `<button class="fsc-btn" data-a="tank" ${s ? '' : `disabled title="${T.list?.().length ? 'All tanks are full' : 'Build a glass tank first'}"`}>${ico('tank', 2)}<span>To tank</span></button>`;
      }
    }
    // [v33 bubble] Tag and Pet live here now (they left the hotbar); they appear once the feature is unlocked.
    // Tag shows the tags left; Pet can be held to keep petting.
    const open = (k) => (typeof game.isOpen === 'function' ? game.isOpen(k) : true);
    const left = Math.max(0, (game.tagLimit?.() ?? 1) - (game.tagsUsed?.() ?? 0));
    this.$('.fsc-btns').innerHTML = `
      ${open('tag') ? `<button class="fsc-btn ${f.tagged ? '' : 'red'}" data-a="tag" data-feature="tag" title="DO NOT EAT tag: ${left} left">${ico('tag', 2)}<span>${f.tagged ? 'Untag' : `Tag <em class="fsc-left">${left}</em>`}</span></button>` : ''}
      ${open('pet') ? `<button class="fsc-btn pink" data-a="pet" data-feature="pet" title="Pet (hold to keep petting)">${ico('nurture', 2)}<span>Pet</span></button>` : ''}
      ${tankBtn}
      ${game.ui?.openMatchmaker ? `<button class="fsc-btn" data-a="match">${ico('heart', 2)}<span>Match</span></button>` : ''}
      ${game.digsite?.scopeButton?.(f) || ''}
      <button class="fsc-btn close" data-a="close" title="Close">${ico('cross', 2)}<span>Close</span></button>`;
    this.$('.fsc-btns').querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); if (b.dataset.a === 'pet' && this._petHeld) { this._petHeld = false; return; } this.act(b.dataset.a); }));
    // [v33 bubble] hold Pet: a pat every ~0.4 s while held (Game.nurtureFish has its own 0.35 s cooldown)
    const pb = this.$('.fsc-btns [data-a="pet"]');
    if (pb) {
      const stop = () => { clearInterval(this._petIv); this._petIv = 0; };
      pb.addEventListener('pointerdown', () => {
        stop();
        this._petHeld = false;
        this._petIv = setInterval(() => {
          if (this.dead || !pb.isConnected) { stop(); return; }
          this._petHeld = true;
          this.pat();
        }, 420);
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) pb.addEventListener(ev, stop);
    }
  }

  act(a) {
    const game = this.game, f = this.fish;
    if (a === 'close') { this.close(); return; }
    if (a === 'tag') {
      const ok = game.tagFish(f);
      if (ok) {
        this.speak(f.tagged ? 'Tagged! DO NOT EAT. Hands off, bears.' : 'Tag off. Back on the menu... heh.', f.tagged ? 'proud' : 'scheming');
        if (f.tagged) game.audio?.play('stamp', { volume: 0.3 });
        this.tagFx(f.tagged); // [v33 bubble]
      } else if (!f.tagged) this.speak(`All ${game.tagLimit?.() ?? 1} tags are in use. Untag a fish first, or research the Label Maker.`, 'worried'); // [v33 bubble]
    } else if (a === 'pet') {
      this.pat(); // [v33 bubble] the same Game.nurtureFish the old Pet tool used (+love, -hunger, hearts)
      return;
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
    } else if (a === 'vial') { // [v32 dig] the Primordial Vial: the fish wakes up prehistoric (src/game/ext/digsite.js)
      this.close(true);
      game.digsite?.feedVial?.(f);
      return;
    }
    this.render();
    this.layout();
  }

  // [v33 bubble] one pat (button tap, hold, or a tap on the fish): Game.nurtureFish, then the hearts + a line
  pat() {
    const game = this.game, f = this.fish;
    if (!f || f.dead) return false;
    if (!game.nurtureFish(f)) return false;
    const full = (f.love || 0) >= 1;
    if (full || (this.tipKey !== '__tut' && Math.random() < 0.4)) this.speak(full ? 'Fully nurtured! Look at that smile.' : `Pat pat. ${Math.round((f.love || 0) * 100)}% happy.`, 'love');
    this.petFx();
    try { this.F = facts(game, f); this.renderCalls(); this.renderChips(); this.layout(); } catch { /* ignore */ } // the MOOD call-out fills up (buttons stay, so a hold keeps going)
    return true;
  }

  // [v33 bubble] the Tag button: a stamped tag hops off the button (stepped)
  tagFx(on) {
    const b = this.$('.fsc-btns [data-a="tag"]');
    if (!b) return;
    b.classList.remove('fsc-stamp'); void b.offsetWidth; b.classList.add('fsc-stamp');
    setTimeout(() => b.classList.remove('fsc-stamp'), 500);
    void on;
  }

  // little painted hearts hop up off the fish (stepped, no glow)
  petFx() {
    const fx = this.$('.fsc-fx'), c = this.lastC;
    if (!fx || !c) return;
    for (let i = 0; i < 4; i++) {
      const h = document.createElement('span');
      h.className = 'fsc-heart';
      h.innerHTML = ico('heart', 2);
      h.style.left = Math.round(c.x + (i - 1.5) * 22) + 'px';
      h.style.top = Math.round(c.y - 10 - (i % 2) * 10) + 'px';
      h.style.animationDelay = i * 70 + 'ms';
      fx.appendChild(h);
      setTimeout(() => h.remove(), 900 + i * 70);
    }
  }

  toggle(k) {
    this.open[k] = !this.open[k];
    this.game.audio?.play('paper', { volume: 0.25, pitch: this.open[k] ? 1.35 : 1.15 });
    this.renderCalls();
    this.place(true);
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
        if (v) { this.speak(`${v}! A fine scientific name.`, 'proud'); this.game.audio?.play('pen', { volume: 0.3 }); }
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
    const title = this.$('.fsc-title'), con = this.$('.fsc-console'), x = this.$('.fsc-x');
    const m = small ? 8 : 12;
    this.colW = Math.round(clamp(W * 0.235, small ? 188 : 196, 300));
    // the label sits between the tag columns, so the tags can use the full height
    title.style.maxWidth = Math.max(260, W - 2 * (m + this.colW + 8)) + 'px';
    const tr = title.getBoundingClientRect();
    const conTop = H - con.offsetHeight - (small ? 6 : 10);
    // the X hangs off the label's bottom-right corner like a tab
    const xl = Math.round(tr.right - x.offsetWidth - (small ? 6 : 12)), xt = Math.round(tr.bottom - (small ? 8 : 10));
    x.style.left = xl + 'px';
    x.style.top = xt + 'px';
    const top = tr.bottom + 6;
    this.band = { top, bot: conTop - 6, cy: (top + conTop - 6) / 2 };
    const clash = tr.left < m + this.colW + 4 || tr.right > W - m - this.colW - 4;
    this.colTop = clash ? tr.bottom + 8 : m;
    this.colBot = conTop - (small ? 4 : 8);
    this.place(true);
  }

  // hang the tag columns on the head / tail side of the fish
  place(force) {
    const f = this.fish;
    const flip = !!f.flip;
    if (!force && flip === this.flip) return;
    const flipped = this.flip !== null && flip !== this.flip;
    this.flip = flip;
    const W = window.innerWidth;
    const top = this.colTop ?? 12, bot = this.colBot ?? window.innerHeight - 200;
    const m = this.el.classList.contains('small') ? 8 : 12;
    const headRight = !flip;
    const h = (bot - top) / SLOTS;
    let changed = false;
    for (const c of this.calls) {
      const right = (c.side === 'head') === headRight;
      if (right !== c.right) { c.right = right; changed = true; }
      c.el.style.width = this.colW + 'px';
      c.el.style.left = (right ? W - m - this.colW : m) + 'px';
      c.el.style.top = Math.round(top + h * c.slot + Math.max(0, (h - c.el.offsetHeight) * 0.5)) + 'px';
    }
    if (changed) this.renderCalls();
    if (flipped) this.game.audio?.play('paper', { volume: 0.18, pitch: 1.5 });
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
        try { this.lines = chatter(facts(this.game, this.fish), this.fish); } catch { /* keep the last */ } // [v33 tut2] today's numbers, not the ones from when it opened
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
    this.draw(dt);
  }

  // the lens layer: one art-resolution canvas (magnifier, ruler, twine, pins, light vignette)
  draw(dt = 0) {
    const game = this.game, f = this.fish, P = this.P;
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
    this.lastC = { x: cx, y: cy };
    // hit area for petting
    const hit = this.$('.fsc-hit');
    hit.style.transform = `translate(${cx - hw - 10}px, ${cy - hh - 10}px)`;
    hit.style.width = (hw * 2 + 20) + 'px'; hit.style.height = (hh * 2 + 20) + 'px';
    // ---- art space
    const aw = Math.ceil(W / P), ah = Math.ceil(H / P);
    const cv = this.art;
    if (cv.width !== aw || cv.height !== ah || !this.img) {
      cv.width = aw; cv.height = ah;
      cv.style.width = aw * P + 'px'; cv.style.height = ah * P + 'px';
      this.ctx = cv.getContext('2d');
      this.img = this.ctx.createImageData(aw, ah);
      this.buf = { w: aw, h: ah, d: new Uint32Array(this.img.data.buffer) };
      this.vig = null; this.key = '';
    }
    // the lens eases after the fish (no jitter), sized to the fish, kept inside the free band
    const L = (this.lens ||= { x: c.x, y: c.y });
    const k = 1 - Math.exp(-dt * 7);
    L.x += (c.x - L.x) * k; L.y += (c.y - L.y) * k;
    const lx = Math.round(L.x / P), ly = Math.round(L.y / P);
    const band = this.band || { top: 0, bot: H };
    const gap = (W - 2 * ((this.colW || 200) + 12)) / 2;
    const maxR = Math.floor(Math.min((band.bot - band.top) / 2, gap) / P) - 7;
    const R = clamp(Math.round(Math.max(hw * 1.06, hh * 1.6) / P) + 6, 16, Math.max(16, maxR));
    // anchor points on the fish (art px)
    const A = (u, v) => [Math.round((cx + s * u * hw) / P), Math.round((cy + v * hh) / P)];
    // boxwood ruler under the fish, inside the glass
    let ry = Math.round((cy + hh) / P) + 3;
    if (ry + 6 > ly + R - 2) ry = ly + R - 8;
    const half = Math.max(6, Math.floor(Math.sqrt(Math.max(0, R * R - (ry + 6 - ly) ** 2))) - 4);
    const rx0 = Math.max(Math.round((cx - hw) / P), lx - half), rx1 = Math.min(Math.round((cx + hw) / P), lx + half);
    const ruler = { x0: rx0, x1: rx1, y: ry };
    const strings = [];
    for (const t of this.calls) {
      const eye = t.el.firstElementChild;
      if (!eye) continue;
      const r = eye.getBoundingClientRect();
      if (!r.width) continue;
      const [ax, ay] = t.at[1] === 'ruler' ? [Math.round((rx0 + rx1) / 2), ry + 1] : A(t.at[0], t.at[1]);
      strings.push({ x0: Math.round((r.left + r.width / 2) / P), y0: Math.round((r.top + r.height / 2) / P), x1: ax, y1: ay, hot: !!this.open[t.k] });
    }
    const key = `${lx},${ly},${R},${rx0},${rx1},${ry}|` + strings.map((q) => `${q.x0},${q.y0},${q.x1},${q.y1},${q.hot ? 1 : 0}`).join(';');
    if (key === this.key) return;
    this.key = key;
    const vk = `${lx},${ly},${R}`;
    if (this.vigKey !== vk || !this.vig) {
      this.vigKey = vk;
      const vb = { w: aw, h: ah, d: this.vig || new Uint32Array(aw * ah) };
      vb.d.fill(0);
      paintVignette(vb, lx, ly, R);
      this.vig = vb.d;
    }
    this.buf.d.set(this.vig);
    drawLens(this.buf, { cx: lx, cy: ly, R, ruler, strings });
    this.ctx.putImageData(this.img, 0, 0);
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
    if (!quick) game.audio?.play('paper', { volume: 0.3, pitch: 1.2 });
    const el = this.el;
    el.classList.remove('on');
    el.classList.add('off');
    setTimeout(() => { this.fox?.dispose(); el.remove(); }, quick ? 0 : 260);
  }
}

if (typeof window !== 'undefined') window.__fishScope = { open: openFishScope, close: closeFishScope, get current() { return current; } };
