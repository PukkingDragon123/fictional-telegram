// Pukking's portfolio: boots the game's pixel renderer, then the fox's bedroom (wake him up)
// and the classroom (PortfolioRoom.js), where every object opens a lesson. The hello lesson is
// the introduction: who I am, Thailand -> Vancouver (a voxel Earth pops up above the board,
// Globe3D.js), what I make and my goals. Voxel particles everywhere (VoxelFX.js): bursts out of
// whatever you click, floorboard pops, chalk dust, confetti, sleepy Zs, dust in the light;
// floating 3D icons over the clickable things (Icons3D.js) that grow and spin when hovered.
//
// Dev helpers: ?chapter=games jumps straight into a chapter, ?idle=1 skips the title and the
// bedroom, ?debug=1 shows renderer info and errors; window.__pf exposes the rooms for tests.
import * as THREE from 'three';
import '../src/ui/fonts.css';
import './portfolio.css';
import { PixelRenderer } from '../src/core/pixelRenderer.js';
import audio from '../src/audio/audio.js';
import { showTitleMenu } from '../src/ui/TitleMenu.js';
import { openPaper, paperTexture, injectPaperCSS, setPaperSfx } from '../src/ui/paper.js';
import { registerPortfolioDoodles } from './doodles.js';
import { PortfolioRoom } from './PortfolioRoom.js';
import { iconImg } from './icons.js';
import { showFallback } from './fallback.js';
import { SITE, LINKS, MEDIA, CHAPTERS, CHAPTER_BY_ID, QUIPS, IDLE_BOARD } from './content.js';
import { BOARD } from '../src/entities/classroomScene.js';
import { Game } from '../src/game/Game.js';
import { TitleScene } from '../src/game/TitleScene.js';
import { Transition } from '../src/ui/Transition.js';
import { Bedroom } from './Bedroom.js';
import { buildGallery, openGallery, galleryOpen } from './Gallery.js';
import { Icons3D } from './Icons3D.js';
import { VoxelFX, RAINBOW } from './VoxelFX.js';
import { ICONS, PAL } from './icons.js';
import { CHALK_COLORS } from '../src/ui/Chalkboard.js';

const params = new URLSearchParams(location.search);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const sfx = (n, o) => { try { audio.play(n, o); } catch { /* optional */ } };

const state = { mode: 'loading', done: new Set(), night: false, bubbleT: 0, quip: 0, media: null, idleGag: 8 };
try { for (const id of JSON.parse(localStorage.getItem('pukking.done') || '[]')) state.done.add(id); } catch { /* storage unavailable */ }
const saveDone = () => { try { localStorage.setItem('pukking.done', JSON.stringify([...state.done])); } catch { /* ignore */ } };

let icons = null, gallery = [], pr = null, game = null, room = null, bed = null, g0 = null, pond = null, scene = 'bed';
let fx = null, bedFx = null; // voxel particles in the classroom / the bedroom
const CHALK = [null, ...Object.values(CHALK_COLORS)]; // the chalkboard's colour indices
// the colours an icon is painted in (its voxel bursts use them)
const iconColors = (name) => {
  const set = new Set();
  try { for (const row of ICONS[name]()) for (const ch of row) if (PAL[ch] && ch !== 'k') set.add(PAL[ch]); } catch { /* not a pixel icon (e.g. the 3D block) */ }
  return set.size ? [...set] : name === 'block' ? ['#5cab3c', '#6fbf4a', '#8a6340', '#7b5636'] : RAINBOW;
};
const trans = new Transition();
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const curFox = () => (scene === 'bed' ? bed.fox : scene === 'pond' ? pond?.fox : room.fox);
const curCam = () => (scene === 'bed' ? bed.rig.camera : room.rig.camera);
let pinTags = null; // labels on the globe's two pins (Thailand, Vancouver)
let rootEl, bubbleEl;
const paintSound = () => {};

function setMode(m) {
  state.mode = m;
  document.body.classList.remove('pf-title', 'pf-idle', 'pf-chapter', 'pf-loading', 'pf-bed', 'pf-pond');
  document.body.classList.add('pf-' + m);
}

// ------------------------------------------------------------------ boot
async function boot() {
  registerPortfolioDoodles();
  setMode('loading');
  const canvas = document.getElementById('game');
  try {
    g0 = new Game(canvas); // the real game: its renderer, and its pond for the title scene
    pr = g0.renderer;
  } catch (e) { console.warn('Game/WebGL unavailable', e); showFallback('no WebGL'); return; }
  game = { renderer: pr, audio, ui: null, state: { paused: false, hour: 10.5, phase: 'day' }, inputLocked: false, overrideScene: null, overrideRig: null };
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    pr.resize(window.innerWidth, window.innerHeight, dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    room?.refitCamera(); bed?.refit();
  };
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();
  await nextFrame(); await nextFrame();
  try { await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]); } catch { /* ignore */ }

  try {
    room = new PortfolioRoom(game, { media: MEDIA, hooks: { onContact: openContact, onChapterStart: () => {}, onGlobe } });
    room.start();
    gallery = buildGallery(room.room.group);
    icons = new Icons3D(room.room.group);
    bed = new Bedroom(game);
    bed.start();
    fx = new VoxelFX(room.room.group);
    bedFx = new VoxelFX(bed.room.group, { bounds: { x0: -2.0, x1: 2.0, z0: -1.5, z1: 1.1, y1: 2.1 }, dust: 30, pool: 300, dustColors: ['#cfd8ff', '#b8c4ff', '#e8e4ff', '#9fb0e8'] });
  } catch (e) { console.warn('Classroom failed to start', e); showFallback('the classroom could not start'); return; }
  resize();

  injectPaperCSS();
  setPaperSfx(sfx);
  buildUI();
  setupKeys();
  const loading = document.getElementById('pf-loading');
  if (loading) { loading.classList.add('out'); setTimeout(() => loading.remove(), 500); }

  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    try {
      audio.update?.(dt);
      if (scene === 'pond' && pond) {
        g0.state.phase = 'day';
        pond.update(dt); g0.structures.update(dt); g0.food.update(dt); g0.fox.update(dt); g0.ambient.update(dt); g0.particles.update(dt);
        g0.time += dt;
        g0.render(dt);
      } else if (scene === 'bed') { bed.update(dt); tickBed(dt); bedFx.update(dt); pr.render(bed.scene, bed.rig); }
      else { room.update(dt); tickClass(dt); fx.update(dt); pr.render(room.scene, room.rig); }
      frames++;
      badFrames = 0;
    } catch (e) { badFrames++; report(e, badFrames > 30); }
    try { tickUI(dt); } catch (e) { report(e); }
    if (debug) showDebug();
    requestAnimationFrame(frame); // never stop the loop because of one bad frame
  };
  requestAnimationFrame(frame);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); report(new Error('The browser lost the WebGL context (GPU reset). Reload the page.')); });

  document.body.classList.add('pf-hot-ok');
  const first = params.get('chapter');
  if (first && CHAPTER_BY_ID[first]) { scene = 'class'; setMode('idle'); startChapter(first); }
  else if (params.get('idle') === '1') { scene = 'class'; setMode('idle'); drawIdleBoard(); }
  else { drawIdleBoard(); showTitle(); }

  window.__pf = { gal: (i) => openGallery(gallery, i), room, bed, fx, bedFx, g0, goPond, goClass, wakeFox, pr, state, startChapter, openContact, setMode, say, spots, CHAPTERS, MEDIA };
}

// ------------------------------------------------------------------ UI (almost none)
let tipEl, hot = null;
function buildUI() {
  rootEl = document.getElementById('pf-root');
  bubbleEl = el('div', 'pf-bubble'); rootEl.appendChild(bubbleEl);
  tipEl = el('div', 'pf-tip'); document.body.appendChild(tipEl);
  const inBtn = el('button', 'pf-wood pf-in', 'Come inside');
  inBtn.type = 'button';
  inBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  inBtn.addEventListener('click', () => { sfx('click'); goClass(); });
  document.body.appendChild(inBtn);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerdown', onDown, true);
}
const _up = new THREE.Vector3(0, 0.22, 0), _v = new THREE.Vector3(), _w = new THREE.Vector3();

// things you can click: [label, world position, half-size in px (at 720p), action]
function spots() {
  if (scene === 'bed') { const p = bed.fox.root.position; return [{ tip: 'Pukking', lab: 'Wake him up', p: _s(p.x, p.y + 0.35, p.z), rx: 220, ry: 170, go: wakeFox }]; }
  if (scene === 'pond') { const p = pond.fox.root.position; return [{ tip: 'Back to class', lab: 'Back to class', p: _s(p.x, p.y + 0.5, p.z), rx: 110, ry: 130, go: goClass }]; }
  const f = room.fox.root.position, st = room.room.students.list;
  return [
    { tip: 'Pukking', lab: 'Meet Pukking', icon: 'fox', iy: 0.55, p: _s(f.x, f.y + 0.65, f.z), rx: 70, ry: 90, go: () => startChapter('hello') },
    { tip: 'Chalkboard', lab: 'Skills', icon: 'brackets', iy: 0.95, p: _s(-0.35, 1.1, -2.8), rx: 300, ry: 160, go: () => startChapter('toolkit') },
    { tip: 'Globe', lab: 'My games', icon: 'gamepad', iy: 0.4, p: _s(3.45, 1.3, -2.55), rx: 34, ry: 40, go: () => startChapter('games') },
    { tip: 'Bookshelf', lab: 'Pixel art', icon: 'heart', iy: 0.55, p: _s(-3.6, 0.5, -2.5), rx: 90, ry: 70, go: () => startChapter('pixelart') },
    { tip: 'Minecraft dimension', lab: 'Gallery', icon: 'frame', iy: gallery[0].size[1] / 2 + 0.12, p: galP(0), rx: gallery[0].size[0] * 50, ry: gallery[0].size[1] * 50, go: () => openGallery(gallery, 0) },
    { tip: 'Minecraft mob', lab: 'Gallery', icon: 'frame', iy: gallery[1].size[1] / 2 + 0.12, p: galP(1), rx: gallery[1].size[0] * 50, ry: gallery[1].size[1] * 50, go: () => openGallery(gallery, 1) },
    { tip: "Mudkip's Garden", lab: 'Gallery', icon: 'frame', iy: gallery[2].size[1] / 2 + 0.12, p: galP(2), rx: gallery[2].size[0] * 50, ry: gallery[2].size[1] * 50, go: () => openGallery(gallery, 2) },
    { tip: 'Sunset Shore', lab: 'Gallery', icon: 'frame', iy: gallery[3].size[1] / 2 + 0.12, p: galP(3), rx: gallery[3].size[0] * 50, ry: gallery[3].size[1] * 50, go: () => openGallery(gallery, 3) },
    { tip: 'Desk', lab: 'Minecraft mods', icon: 'block', iy: 0.45, p: _s(1.85, 0.65, -1.8), rx: 70, ry: 50, go: () => startChapter('mods') },
    { tip: 'Bell', lab: 'Hire me', icon: 'bell', iy: 0.35, p: _s(3.35, 0.9, -2.25), rx: 30, ry: 30, go: ringBell },
    { tip: 'Outside', lab: 'Go outside', icon: 'tree', iy: 0.5, p: _s(4.35, 0.9, 0.3), rx: 60, ry: 130, go: goPond },
    { tip: 'Window', lab: 'Day / night', icon: 'sun', iy: 0.55, p: _s(-3.78, 1.7, -2.9), rx: 70, ry: 90, go: toggleNight },
    ...st.map((s) => ({ tip: 'Fish', p: _s(s.world.x, s.world.y, s.world.z), rx: 36, ry: 40, go: waveClass })),
  ];
}
const _s = (x, y, z) => new THREE.Vector3(x, y, z);
const galP = (i) => (gallery[i]?.frame ? gallery[i].frame.grp.position.clone() : _s(0, 1.5, -2.9));
function pick(e) {
  if (!['idle', 'bed', 'pond'].includes(state.mode) || trans.runs.length || galleryOpen() || document.querySelector('.pp-ov')) return null;
  const W = innerWidth, H = innerHeight, k = Math.max(0.6, Math.min(1.5, H / 720));
  let best = null, bd = 1;
  for (const sp of spots()) {
    _v.copy(sp.p).project(scene === 'bed' ? bed.rig.camera : room.rig.camera);
    const dx = e.clientX - (_v.x * 0.5 + 0.5) * W, dy = e.clientY - (-_v.y * 0.5 + 0.5) * H;
    let d = Math.hypot(dx / (sp.rx * k), dy / (sp.ry * k));
    if (sp.icon) { // the floating icon is clickable too
      _w.copy(sp.p); _w.y += sp.iy; _w.project(scene === 'bed' ? bed.rig.camera : room.rig.camera);
      d = Math.min(d, Math.hypot((e.clientX - (_w.x * 0.5 + 0.5) * W) / (36 * k), (e.clientY - (-_w.y * 0.5 + 0.5) * H) / (36 * k)));
    }
    if (d < bd) { bd = d; best = sp; }
  }
  return best;
}
function onMove(e) {
  state.px = (e.clientX / innerWidth) * 2 - 1; state.py = (e.clientY / innerHeight) * 2 - 1;
  hot = pick(e);
  document.body.classList.toggle('pf-hot', !!hot);
  tipEl.textContent = hot ? hot.tip : '';
  tipEl.classList.toggle('on', !!hot);
  if (hot) tipEl.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 16}px)`;
}
function onDown(e) {
  if (e.target.closest?.('.pp-ov, .tm')) return;
  if (state.mode === 'chapter' && room.screen?.on && room.screen.def?.href) {
    const B = BOARD, W = innerWidth, H = innerHeight, c = room.rig.camera;
    const pt = (x, y) => { _v.set(x, y, B.z + 0.12).project(c); return [(_v.x * 0.5 + 0.5) * W, (-_v.y * 0.5 + 0.5) * H]; };
    const [x0, y0] = pt(B.cx - B.w / 2, B.cy + B.h / 2), [x1, y1] = pt(B.cx + B.w / 2, B.cy - B.h / 2);
    if (e.clientX > x0 && e.clientX < x1 && e.clientY > y0 && e.clientY < y1) {
      e.stopImmediatePropagation(); e.preventDefault();
      window.open(room.screen.def.href, '_blank', 'noopener');
    }
    return;
  }
  const h = pick(e);
  if (h) { audio.unlock(); closeBubble(); burstAt(h); h.go(); }
  else popFloor(e);
}

// ------------------------------------------------------------------ voxel particles
const _cw = new THREE.Vector3(), _ray = new THREE.Raycaster(), _floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _ndc = new THREE.Vector2();
const sceneFx = () => (scene === 'class' ? fx : scene === 'bed' ? bedFx : null);
// a burst of voxels out of the thing you clicked, in its icon's colours
function burstAt(sp) {
  const f = sceneFx();
  if (!f) return;
  _cw.copy(sp.p); if (sp.icon) _cw.y += sp.iy + 0.15;
  f.burst(_cw, { colors: sp.icon ? iconColors(sp.icon) : RAINBOW, n: 26 });
  icons?.punch(sp);
  sfx('pop_in', { volume: 0.35, pitch: 1.05 + Math.random() * 0.2 });
}
// click the floor: a little pop of floorboard voxels where you clicked
const FLOOR_COLORS = { class: ['#c98c4e', '#bd8046', '#d29656', '#e6a81c', '#ffe27a'], bed: ['#8a5a3a', '#a06a44', '#c08050', '#cfd8ff', '#ffe27a'] };
function popFloor(e) {
  const f = sceneFx();
  if (!f || galleryOpen() || document.querySelector('.pp-ov') || trans.runs.length) return;
  if (!((scene === 'class' && state.mode === 'idle') || (scene === 'bed' && state.mode === 'bed' && !state.waking))) return;
  _ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  _ray.setFromCamera(_ndc, curCam());
  if (!_ray.ray.intersectPlane(_floor, _cw)) return;
  const B = f.B;
  if (_cw.x < B.x0 || _cw.x > B.x1 || _cw.z < B.z0 || _cw.z > B.z1) return;
  audio.unlock();
  f.burst(_cw.setY(0.06), { colors: FLOOR_COLORS[scene], n: 16, speed: 1.1, up: 1.8, size: [1, 2], life: [1.0, 1.6] });
  sfx('pop_in', { volume: 0.25, pitch: 1.3 + Math.random() * 0.3 });
}
// classroom: chalk dust while the fox writes, sparkles round the hovered icon, a little 3D parallax
function tickClass(dt) {
  if (state.mode === 'chapter') {
    const tip = room.board?.tipPos?.();
    if (tip?.down) {
      state.chalkT = (state.chalkT || 0) - dt;
      if (state.chalkT <= 0) {
        state.chalkT = 0.05;
        const w = room.room.board.pxToWorld(tip.x, tip.y, _cw, 0.03);
        const erase = tip.tool && tip.tool !== 'chalk';
        fx.burst(w, { colors: erase ? ['#d8d4cc', '#bdb8b0', '#f3f0e2'] : [CHALK[tip.color] || CHALK[1]], n: erase ? 2 : 1, speed: 0.3, up: 0.2, size: [0.5, 0.9], life: [0.7, 1.2], gravity: 1.4, drag: 1.2, spread: 0.03 });
      }
    }
  }
  if (state.mode === 'idle') {
    // the camera leans a little towards the pointer: the room reads as 3D
    const a = room.room.anchors.camWide;
    if (room._camA === a) room.rig.yawGoal = (a.yaw || 0) + (state.px || 0) * 0.025;
    hoverSparkles(dt, fx);
  }
}
// the voxel Earth above the board (hello lesson): sparkles when it pops up, labels on its pins
function onGlobe(on, pos) {
  if (on) {
    fx.burst(pos, { colors: ['#ffe27a', '#fff6d8', '#9ad8ff', '#5cb84c', '#f08a1a'], n: 46, speed: 2.4, up: 1.6, size: [1, 2], life: [1.0, 1.8], gravity: 1.2, drag: 1.4, spread: 0.6 });
    sfx('pop_in', { volume: 0.4, pitch: 0.9 });
  } else fx.burst(pos, { colors: ['#ffe27a', '#fff6d8'], n: 18, speed: 1.6, up: 0.8, size: [1, 1], life: [0.6, 1.0], gravity: 2, drag: 1.4, spread: 0.5 });
}
function tickGlobePins() {
  if (!pinTags) {
    pinTags = ['th', 'van'].map((id) => { const e = el('div', `pf-gpin ${id}`, `<i></i>${id === 'th' ? 'Thailand' : 'Vancouver, Canada'}`); e.dataset.id = id; document.body.appendChild(e); return e; });
  }
  const ms = scene === 'class' && room.globe?.root.visible ? room.globe.markers(room.rig.camera) : [];
  const W = innerWidth, H = innerHeight;
  for (const tag of pinTags) {
    const m = ms.find((x) => x.id === tag.dataset.id);
    const on = !!m && m.front;
    tag.classList.toggle('on', on);
    if (on) { _v.copy(m.world).project(room.rig.camera); tag.style.transform = `translate(${((_v.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-_v.y * 0.5 + 0.5) * H).toFixed(1)}px) translate(-50%, calc(-100% - 12px))`; }
  }
}

// the sleeping fox's face, just above the pillow (headTop points backwards while he lies down)
const _bh = new THREE.Vector3(0.12, 0.26, 0.22);
const bedHead = (out) => { const a = bed.room.anchors.bedPillow; return out.copy(a.isVector3 ? a : a.position).add(_bh); };
// bedroom: sleepy voxel Zs float up from the fox
function tickBed(dt) {
  if (bed.sleeping) {
    state.zT = (state.zT ?? 0.6) - dt;
    if (state.zT <= 0) {
      state.zT = 1.4;
      bedHead(_cw);
      const big = (state.zN = ((state.zN || 0) + 1) % 3);
      const Z = big === 2 ? ['####', '...#', '..#.', '.#..', '####'] : ['###', '..#', '.#.', '###'];
      bedFx.glyph(_cw.add(new THREE.Vector3(big * 0.05, 0, 0)), Z, { color: ['#d8d0ff', '#bfe0ff', '#fff6d8'][big], scale: 0.6 + big * 0.2 });
    }
    const a = bed.room.anchors.camWide;
    if (bed._camA === a && state.mode === 'bed' && !state.waking) bed.rig.yawGoal = (a.yaw || 0) + (state.px || 0) * 0.025;
    hoverSparkles(dt, bedFx);
  }
}
function hoverSparkles(dt, f) {
  if (!hot || !hot.p) return;
  state.sparkT = (state.sparkT || 0) - dt;
  if (state.sparkT > 0) return;
  state.sparkT = 0.09;
  _cw.copy(hot.p); if (hot.icon) _cw.y += hot.iy + 0.12;
  f.burst(_cw, { colors: ['#ffe27a', '#fff6d8', '#ffd05a'], n: 1, speed: 0.5, up: 0.5, size: [0.5, 0.8], life: [0.5, 0.9], gravity: -0.4, floor: false, spread: 0.3 });
}

// ------------------------------------------------------------------ title
function showTitle() {
  setMode('title');
  const menu = showTitleMenu(document.body, {
    hasSave: false, sfx,
    onSound: (on) => { audio.setMuted(!on); paintSound(); },
    isMuted: () => audio.isMuted(),
    onStart: () => enterClass(),
  });
  const t = menu.el;
  const q = (s) => t.querySelector(s);
  q('.tm-l1').textContent = 'PUKKING';
  q('.tm-l2').textContent = 'PORTFOLIO';
  q('.tm-logo').setAttribute('aria-label', 'Pukking Portfolio');
  q('.tm-cap')?.remove();
  const lbl = q('.tm-lbl');
  if (lbl) lbl.textContent = 'Start';
  const credit = q('.tm-credit');
  if (credit) credit.innerHTML = 'A cozy 3D portfolio built with JavaScript + Three.js · Font: TBME Goofy, made from Chewy by Font Diner / Sideshow (Apache 2.0)';
}

function enterClass() {
  audio.unlock();
  audio.setMusic('sleep');
  setMode('bed');
  say('Zzz... (poke me)', 'asleep', 600000);
}

async function wakeFox() {
  if (state.waking) return;
  state.waking = true;
  closeBubble();
  audio.unlock();
  audio.setMusic('morning');
  bedHead(_cw);
  bedFx.burst(_cw, { colors: ['#ffe27a', '#fff6d8', '#f6a8c4', '#9ad8ff'], n: 30, speed: 1.4, up: 2.2, size: [1, 2], life: [1.0, 1.8] });
  bedFx.setDust(['#fff2c8', '#ffe27a', '#ffd6a0', '#f6e8ff']); // the lamp is on now
  await bed.wake(say);
  await wipe(() => { scene = 'class'; hot = null; closeBubble(); room.fox.play('wave_hello', { loop: false, onDone: () => room._idle() }); });
  state.waking = false;
  setMode('idle');
  room.fox.headTop(_cw); fx.confetti(_cw.add(_up), 60);
  sfx('class_cheer', { volume: 0.4 });
  if (!state.done.has('hello')) startChapter('hello'); else sayHi();
}

const wipe = (mid) => trans.wipe('iris', mid);

async function goPond() {
  if (state.mode !== 'idle') return;
  closeBubble();
  setMode('pond');
  await wipe(() => {
    if (!pond) {
      for (let i = 0; i < 10; i++) { const p = g0.fish.randomWaterPoint(); if (p) g0.fish.spawn(['bluegill', 'perch', 'brook', 'sockeye', 'aurora'][i % 5], p.x, p.z, { adult: true }); }
      pond = new TitleScene(g0);
    }
    g0.titleMode = true;
    pond.start();
    scene = 'pond'; hot = null;
    audio.setMusic('title');
  });
}
async function goClass() {
  if (state.mode !== 'pond') return;
  closeBubble();
  setMode('idle');
  await wipe(() => {
    pond.stop(); g0.titleMode = false; scene = 'class'; hot = null;
    audio.setMusic(state.night ? 'night' : 'morning');
    say('Back inside. Click something.', 'happy', 2400);
  });
}

// ------------------------------------------------------------------ chapters
function drawIdleBoard() {
  const b = room.board;
  b.clear();
  b.draw(IDLE_BOARD, { speed: 2.2 });
}

async function startChapter(id) {
  const script = CHAPTER_BY_ID[id];
  if (!script || state.mode === 'chapter' || !room) return;
  audio.unlock();
  closeBubble();
  hot = null; tipEl.classList.remove('on'); document.body.classList.remove('pf-hot');
  setMode('chapter');
  room.rig.yawGoal = room.room.anchors.camWide.yaw || 0; // undo the pointer lean
  const res = await room.runChapter(script);
  setMode('idle');
  if (res.completed) {
    state.done.add(id); saveDone(); say('Click something else.', 'happy');
    room.fox.headTop(_cw); fx.confetti(_cw.add(_up)); // voxel confetti for a finished lesson
  }
  drawIdleBoard();
  state.idleGag = 6;
}


// ------------------------------------------------------------------ free roam: bubble, pins, gags
function say(text, expr = 'happy', ms = null) {
  const fx = curFox();
  if (!fx) return;
  const plainText = String(text).replace(/\*\*/g, '');
  fx.setExpression?.(expr, { hold: 3 });
  fx.talk?.(plainText);
  try { audio.babble?.('fox', plainText); } catch { /* optional */ }
  bubbleEl.innerHTML = esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  bubbleEl.classList.add('on');
  state.bubbleT = ms != null ? ms / 1000 : 2.4 + plainText.length * 0.045;
}
function closeBubble() { state.bubbleT = 0; bubbleEl?.classList.remove('on'); }

function sayHi() {
  const q = QUIPS[state.quip++ % QUIPS.length];
  room._idle(true);
  say(q.say, q.expr);
}
function ringBell() {
  sfx('class_bell', { volume: 0.7 });
  room.room.students.react('bang', { stagger: 0.05 });
  room.fox.play(room._anim('cheer', 'wave'), { loop: false, onDone: () => room._idle() });
  say('Oh, a customer.', 'greedy', 2200);
  setTimeout(() => { if (state.mode === 'idle') openContact(); }, 900);
}
function toggleNight() {
  state.night = !state.night;
  room.room.setNight(state.night);
  audio.setMusic(state.night ? 'night' : 'morning');
  say(state.night ? 'Lights out.' : 'Morning again.', state.night ? 'sleepy' : 'happy', 2200);
}
function waveClass() {
  room.room.students.setSleepy(false);
  room.room.students.react('cheer');
  sfx('class_cheer', { volume: 0.5 });
  say('Class, say hi.', 'happy', 2200);
}

// ------------------------------------------------------------------ per-frame UI
const labs = new Map();
function tickLabels() {
  const on = ['idle', 'bed', 'pond'].includes(state.mode) && !galleryOpen() && !document.querySelector('.pp-ov') && !trans.runs.length && state.bubbleT <= 0;
  const W = innerWidth, H = innerHeight, k = Math.max(0.6, Math.min(1.5, H / 720));
  const seen = new Set();
  const shown = new Set();
  const all = on ? spots() : [];
  if (icons) { if (on && scene === 'class') icons.sync(all, state.dt || 1 / 60, hot ? `${hot.tip}|${hot.lab}` : null); else icons.hideAll(); }
  all.filter((s) => s.lab).forEach((s, i) => {
    if (shown.has(s.lab)) return; // one label per kind (e.g. a single "Gallery")
    _w.copy(s.p); if (s.icon) _w.y += s.iy + 0.3;
    _v.copy(_w).project(scene === 'bed' ? bed.rig.camera : room.rig.camera);
    const x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H - (s.icon ? 0 : s.ry * k * 0.75);
    if (x < 50 || x > W - 50 || y < 20 || y > H - 20) return;
    shown.add(s.lab);
    const key = scene + s.lab; seen.add(key);
    let e = labs.get(key);
    if (!e) { e = el('div', 'pf-lab on', `${esc(s.lab)}<i>v</i>`); document.body.appendChild(e); labs.set(key, e); }
    e.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  });
  for (const [key, e] of labs) if (!seen.has(key)) { e.remove(); labs.delete(key); }
}

function tickUI(dt) {
  state.dt = dt;
  tickLabels();
  tickGlobePins();
  const idle = state.mode === 'idle';
  const W = window.innerWidth, H = window.innerHeight;
  if (state.bubbleT > 0) {
    state.bubbleT -= dt;
    curFox().headTop(_w);
    _v.copy(_w).add(_up).project(curCam());
    const x = Math.max(12, Math.min(W - 12, (_v.x * 0.5 + 0.5) * W));
    const y = (-_v.y * 0.5 + 0.5) * H - 54;
    bubbleEl.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    if (state.bubbleT <= 0) { bubbleEl.classList.remove('on'); if (state.mode === 'idle' && scene === 'class') room._idle(); }
  }
  // free-roam gags: the fox fidgets and a fish waves now and then
  if (idle && !state.media && !document.querySelector('.pp-ov')) {
    state.idleGag -= dt;
    if (state.idleGag <= 0) {
      state.idleGag = 9 + Math.random() * 8;
      if (!room.foxState.goal && state.bubbleT <= 0) {
        const g = ['wave_hello', 'shrug', 'polish_monocle', 'stretch', 'think'][(Math.random() * 5) | 0];
        room.fox.play(room._anim(g, 'idle'), { loop: false, onDone: () => room._idle() });
        if (Math.random() < 0.6) room.room.students.react(['heart', 'note', 'sparkle', 'star'][(Math.random() * 4) | 0], { who: (Math.random() * 6) | 0 });
      }
    }
  }
}

function closeMedia() {}

// ------------------------------------------------------------------ hire-me letter
function openContact() {
  if (document.querySelector('.pp-ov')) return;
  const c = SITE.contact;
  const btn = (href, icon, label, alt, r) => `<a class="pf-link-btn${alt ? ' alt' : ''}" href="${esc(href)}" target="_blank" rel="noopener" style="--r:${r}deg">${iconImg(icon, 2)}<span>${esc(label)}</span></a>`;
  const links = [btn(c.itch, 'play', 'MY GAMES ON ITCH.IO', false, -1.5)];
  if (c.email) links.push(btn(`mailto:${c.email}`, 'mail', 'EMAIL ME', true, 1.2));
  if (c.discord) links.push(btn(c.discord, 'chat', 'DISCORD', true, -1));
  for (const o of c.other || []) links.push(btn(o.href, 'star', o.label, true, 1));
  const html = `<div class="pf-letter">
    <p>I'm <b>Pukking</b>. I make games in JavaScript and Three.js: pixel art, 2D, 3D and Minecraft mods.</p>
    <ul><li>Art, animation and gameplay</li><li>Custom mechanics and features</li><li>Minecraft mods</li><li>Low prices</li></ul>
    <p>Already have a game? I can add features to it. Bigger additions cost extra.</p>
    <div class="pf-links">${links.join('')}</div>
  </div>`;
  openPaper({ kind: 'mail', title: 'Hire me', html, width: 470, sfx });
}

// ------------------------------------------------------------------ keys
function setupKeys() {
  window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.mode === 'pond') { goClass(); return; }
    if (e.key === 'm' || e.key === 'M') { audio.unlock(); audio.toggleMute(); paintSound(); return; }
  }, true);
}

// ------------------------------------------------------------------ errors + ?debug=1
const debug = params.get('debug') === '1';
let frames = 0, badFrames = 0, errBox = null, lastErr = '';
// harmless browser noise that must never put an error box in front of a visitor
const BENIGN = /ResizeObserver loop|NotAllowedError|AbortError|play\(\) (request|failed)|The user aborted|AudioContext|autoplay/i;
function report(e, fatal = false) {
  const msg = String(e?.stack || e?.message || e).split('\n').slice(0, 4).join('\n');
  if (msg === lastErr && !fatal) return;
  lastErr = msg;
  if (BENIGN.test(msg)) { console.warn(e); return; }
  console.error(e);
  if (!debug && !fatal) return; // visitors only see a message if the 3D view itself keeps failing
  if (!errBox) { errBox = el('pre', 'pf-err'); document.body.appendChild(errBox); }
  errBox.textContent = (fatal ? 'Sorry, the 3D view stopped working. Reloading the page usually fixes it.\n\n' : 'Something went wrong (screenshot this):\n') + msg;
}
window.addEventListener('error', (ev) => report(ev.error || ev.message));
window.addEventListener('unhandledrejection', (ev) => report(ev.reason));
function showDebug() {
  if (!errBox) { errBox = el('pre', 'pf-err'); document.body.appendChild(errBox); }
  if (frames % 30) return;
  let gl = '';
  try { const c = pr.renderer.getContext(), x = c.getExtension('WEBGL_debug_renderer_info'); gl = x ? c.getParameter(x.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER); } catch { /* ignore */ }
  errBox.textContent = `debug: scene=${scene} mode=${state.mode} frames=${frames}\nsize=${innerWidth}x${innerHeight} dpr=${devicePixelRatio} low=${pr.lowW}x${pr.lowH}\ngl=${gl}\nframes drawn=${gallery.map((p) => (p.real ? 'img' : 'code')).join(',')}\n${lastErr}`;
}

boot().catch((e) => { console.error(e); report(e); showFallback('startup error'); });
