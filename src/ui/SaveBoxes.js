// [v26 menu] The save-slot screen: three moving boxes floating over Reynard's porch,
// one per save. The boxes, their stuff and the napping boss are real 3D voxels in
// one small pixelated scene (BoxStage3D.js); this file keeps the layout, the hit
// areas and the tags hanging on strings (2D painted boxes if WebGL is missing). A box holds that save's stuff (more the further along it is) and a kraft
// tag with its completion %, money and day; an empty box starts a new game. Toss a
// save: the box gets taped shut and kicked off the porch, a fresh one drops in.
// Reynard naps next to them in his pajamas on a box of his own (the real 3D rig,
// src/ui/SleepyFox3D.js).
//
//   const tbx = openSaveBoxes(root, { sfx, onPick({ slot, mode: 'continue' | 'new' }), onBack() });
//   tbx.close();
import { SLOTS, slotInfo, deleteSlot, boxItems } from '../game/saveSlots.js';
import { createBoxStage } from './BoxStage3D.js';
import { ynPair } from './ynButtons.js'; // [v27 knobs] painted YES / NO planks
import { INK, FONTS, cv, scaleEl, text, measure, wood, arrowPlank, board, paintBox, coinIcon, BOX_W, BOX_H } from './titleArt.js';

const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function floorTile() {
  const c = cv(64, 24), g = c.getContext('2d');
  for (let i = 0; i < 3; i++) {
    wood(g, 0, i * 8, 64, 8, 20 + i * 7, { base: [122, 78, 46], dark: [92, 56, 32], light: [150, 100, 60] });
    g.fillStyle = INK; g.fillRect(0, i * 8 + 7, 64, 1);
    g.fillRect((i * 23 + 11) % 64, i * 8, 1, 8); // board ends
    g.fillStyle = '#d8dde6'; g.fillRect((i * 23 + 13) % 64, i * 8 + 3, 1, 1); g.fillRect((i * 23 + 8) % 64, i * 8 + 3, 1, 1); // nail heads
  }
  return c;
}
function tossSticker() {
  const c = cv(11, 11), g = c.getContext('2d');
  g.fillStyle = INK; g.fillRect(1, 0, 9, 11); g.fillRect(0, 1, 11, 9);
  g.fillStyle = '#d8402e'; g.fillRect(1, 1, 9, 9);
  g.fillStyle = '#f26a52'; g.fillRect(1, 1, 9, 1); g.fillRect(1, 1, 1, 8);
  g.fillStyle = '#fff4dc';
  for (let i = 0; i < 5; i++) { g.fillRect(3 + i, 3 + i, 1, 1); g.fillRect(7 - i, 3 + i, 1, 1); }
  return c;
}
function napSign() {
  const l1 = 'SHH!', l2 = 'BOSS NAPPING';
  const b1 = measure(FONTS.small, l1), b2 = measure(FONTS.small, l2);
  const W = Math.max(b1.w, b2.w) + 8, H = b1.h + b2.h + 8;
  const c = cv(W, H + 12), g = c.getContext('2d');
  g.fillStyle = INK; g.fillRect(Math.floor(W / 2) - 1, H - 1, 3, 13);
  g.fillStyle = '#a8743e'; g.fillRect(Math.floor(W / 2), H, 1, 11);
  g.fillStyle = INK; g.fillRect(0, 0, W, H);
  g.fillStyle = '#f4e6c4'; g.fillRect(1, 1, W - 2, H - 2);
  g.fillStyle = '#e2cfa0'; g.fillRect(1, H - 2, W - 2, 1);
  text(g, FONTS.small, l1, Math.round((W - b1.w) / 2), 3, { fill: '#c0392b', shade: '#c0392b', outline: false, drop: 0 });
  text(g, FONTS.small, l2, Math.round((W - b2.w) / 2), 4 + b1.h, { fill: INK, shade: INK, outline: false, drop: 0 });
  return c;
}

export function openSaveBoxes(root, { sfx, onPick, onBack } = {}) {
  root = root || document.body;
  const play = (n, o) => { try { sfx?.(n, o); } catch { /* optional */ } };
  let closed = false, picking = false;
  const el = document.createElement('div');
  el.className = 'tbx';
  el.innerHTML = `
    <div class="tbx-dim"></div>
    <div class="tbx-floor"></div>
    <button class="tbx-back" aria-label="Back"></button>
    <div class="tbx-head"></div>
    <div class="tbx-stage">
      <div class="tbx-row"></div>
      <div class="tbx-nap" title="Reynard">
        <div class="tbx-fox"></div><div class="tbx-sign"></div>
      </div>
    </div>`;
  root.appendChild(el);
  const floor = floorTile();
  el.querySelector('.tbx-floor').style.backgroundImage = `url(${floor.toDataURL()})`;
  const back = arrowPlank('BACK', null, { dir: -1, minW: 44, seed: 5 });
  el.querySelector('.tbx-back').appendChild(back);
  const head = board(['PICK A BOX'], { font: FONTS.big, pad: 10, seed: 8 });
  el.querySelector('.tbx-head').appendChild(head);
  const sign = napSign(); el.querySelector('.tbx-sign').appendChild(sign);
  const coin = coinIcon().toDataURL();
  const toss = tossSticker().toDataURL();

  const row = el.querySelector('.tbx-row');
  const slots = [];
  for (let n = 1; n <= SLOTS; n++) {
    const s = document.createElement('div');
    s.className = 'tbx-slot is-loading';
    s.style.setProperty('--i', n - 1);
    s.innerHTML = `
      <div class="tbx-bw"><button class="tbx-box" aria-label="Save ${n}"><canvas class="tm-px"></canvas></button>
      <button class="tbx-toss" aria-label="Toss save ${n}" title="Toss this save"><img class="tm-px" src="${toss}" alt=""></button></div>
      <div class="tbx-tag"></div>`;
    row.appendChild(s);
    const slot = { n, el: s, bw: s.querySelector('.tbx-bw'), box: s.querySelector('.tbx-box'), canvas: s.querySelector('canvas'), tag: s.querySelector('.tbx-tag'), info: null, busy: false };
    slots.push(slot);
    paintBox(slot.canvas, { state: 'closed', label: `SAVE ${n}`, seed: n });
  }

  // ---- scale: crisp art pixels (whole device pixels), boxes in a row or a column
  function layout() {
    const W = window.innerWidth, H = window.innerHeight, dpr = window.devicePixelRatio || 1;
    const tall = W / H < 0.85;
    el.classList.toggle('tbx--tall', tall);
    let s = tall ? Math.min((W - 210) / BOX_W, (H - 330) / (3 * BOX_H)) : Math.min((W - 48) / (3 * BOX_W + 150), (H - 250) / BOX_H);
    s = Math.max(1, Math.min(3, Math.floor(s * dpr) / dpr));
    el.style.setProperty('--b', `${s}px`);
    const ui = Math.max(2, Math.min(3, Math.round(s)));
    el.style.setProperty('--u', `${ui}px`);
    scaleEl(back, ui); scaleEl(head, ui);
    scaleEl(sign, el.classList.contains('tbx--3d') ? Math.max(1.5, Math.round(s * 0.67 * 2) / 2) : s);
    for (const sl of slots) scaleEl(sl.canvas, s);
    return s;
  }
  let S = layout();
  const onResize = () => { S = layout(); };
  window.addEventListener('resize', onResize);
  // the 3D stage: one renderer for the three boxes and Reynard
  let stage = null;
  try {
    // the same pixel size as the game's own renderer (PixelRenderer: ~760 px diagonal, Settings > Pixel size)
    const dpr = window.devicePixelRatio || 1;
    let dens = 1; try { dens = +localStorage.getItem('tbme.px') || 1; } catch { /* default */ }
    const gps = Math.max(1, Math.round(Math.hypot(window.innerWidth, window.innerHeight) * dpr / (760 * dens))) / dpr;
    stage = createBoxStage(el, { ps: gps, sfx: (n, o) => { if (!closed) play(n, o); }, slots: slots.map((sl) => sl.bw), nap: el.querySelector('.tbx-nap') });
  } catch (e) { console.warn('box stage', e); stage = null; }
  if (stage) {
    el.classList.add('tbx--3d');
    S = layout();
    el.insertBefore(stage.el, el.querySelector('.tbx-back'));
    slots.forEach((sl, i) => stage.setBox(i, { empty: true, label: `SAVE ${sl.n}` }));
  }

  // ---- fill the boxes
  function tagHTML(info) {
    const m = info.meta;
    if (info.empty) return '<b class="tbx-big">EMPTY</b><span class="tbx-sub">New game</span>';
    if (m.broken) return '<b class="tbx-big">???</b><span class="tbx-sub">Soggy save</span>';
    return `<b class="tbx-big">${m.pct}%</b><i class="tbx-bar" role="presentation"><i style="width:${Math.max(2, m.pct)}%"></i></i>
      <span class="tbx-money"><img class="tm-px" src="${coin}" alt="coins">${esc(fmt(m.coins))}</span><span class="tbx-day">Day ${m.day}</span>`;
  }
  function paint(slot) {
    const info = slot.info;
    if (stage) stage.setBox(slot.n - 1, { empty: info.empty, items: boxItems(info.meta), label: `SAVE ${slot.n}` });
    else {
      paintBox(slot.canvas, { state: info.empty ? 'empty' : 'open', items: boxItems(info.meta), label: `SAVE ${slot.n}`, seed: slot.n });
      scaleEl(slot.canvas, S);
    }
    slot.el.classList.toggle('is-empty', info.empty);
    slot.el.classList.remove('is-loading');
    slot.tag.innerHTML = tagHTML(info);
    const m = info.meta;
    slot.box.setAttribute('aria-label', info.empty ? `Save ${slot.n}: empty, start a new game` : `Save ${slot.n}: continue, ${m.pct}% done, ${fmt(m.coins)} coins, day ${m.day}`);
  }
  Promise.all(slots.map((sl) => slotInfo(sl.n))).then((infos) => {
    if (closed) return;
    infos.forEach((info, i) => { slots[i].info = info; paint(slots[i]); });
  });

  // ---- the napping boss
  let fox = null;
  const foxEl = el.querySelector('.tbx-fox');
  if (!stage) import('./SleepyFox3D.js').then(({ createSleepyFox }) => {
    if (closed) return;
    fox = createSleepyFox(foxEl, { ps: S, sfx: (n, o) => { if (!closed) play(n, o); } });
  }).catch((e) => console.warn('sleepy fox', e));
  el.querySelector('.tbx-nap').addEventListener('click', () => {
    fox?.poke(); stage?.poke();
    const nap = el.querySelector('.tbx-nap');
    nap.classList.remove('is-poked'); void nap.offsetWidth; nap.classList.add('is-poked');
  });

  // ---- interaction
  const confirmTag = (slot) => {
    slot.tag.innerHTML = `<b class="tbx-ask">Toss it?</b><span class="tbx-yn"><button class="tbx-yes">YES</button><button class="tbx-no">NO</button></span>`;
    slot.el.classList.add('is-asking');
    play('paper');
    slot.tag.querySelector('.tbx-no').onclick = (e) => { e.stopPropagation(); play('click'); slot.el.classList.remove('is-asking'); slot.tag.innerHTML = tagHTML(slot.info); };
    slot.tag.querySelector('.tbx-yes').onclick = (e) => { e.stopPropagation(); tossIt(slot); };
    try { ynPair(slot.tag.querySelector('.tbx-yes'), slot.tag.querySelector('.tbx-no'), { size: 's', keys: true, enter: false, esc: false, fit: false }); } catch (err) { console.warn('yn', err); } // [v27 knobs] Y / N keys
    slot.tag.querySelector('.tbx-no').focus({ preventScroll: true });
  };
  function tossIt(slot) {
    if (slot.busy) return;
    slot.busy = true;
    slot.el.classList.remove('is-asking');
    slot.tag.innerHTML = '<b class="tbx-ask">Bye!</b>';
    if (stage) {
      // gone for real right away (the show below can be cut short by leaving)
      deleteSlot(slot.n);
      slot.info = { n: slot.n, empty: true, meta: null };
      // flaps shut, tape wraps, the boot; a fresh box drops in
      stage.toss(slot.n - 1, () => paint(slot)).then(() => { slot.busy = false; });
      return;
    }
    // flaps shut, tape, boot
    paintBox(slot.canvas, { state: 'closed', label: `SAVE ${slot.n}`, seed: slot.n });
    scaleEl(slot.canvas, S);
    play('box_flap');
    slot.el.classList.add('is-taping');
    setTimeout(() => play('box_tape'), 160);
    setTimeout(() => { play('box_kick'); slot.el.classList.add('is-kicked'); }, 760);
    setTimeout(() => {
      deleteSlot(slot.n);
      slot.info = { n: slot.n, empty: true, meta: null };
      slot.el.classList.remove('is-taping', 'is-kicked');
      paint(slot);
      slot.el.classList.add('is-drop');
      setTimeout(() => play('box_land'), 260);
      setTimeout(() => { slot.el.classList.remove('is-drop'); slot.busy = false; }, 700);
    }, 1350);
  }
  for (const slot of slots) {
    const hov = (on) => { if (!picking && !slot.busy && slot.info) { stage?.hover(slot.n - 1, on); if (on) play('box_flap', { volume: 0.25 }); } };
    slot.box.addEventListener('pointerenter', () => hov(true));
    slot.box.addEventListener('pointerleave', () => hov(false));
    slot.box.addEventListener('focus', () => hov(true));
    slot.box.addEventListener('blur', () => hov(false));
    slot.box.addEventListener('click', () => {
      if (picking || slot.busy || !slot.info || closed) return;
      if (slot.el.classList.contains('is-asking')) { slot.el.classList.remove('is-asking'); slot.tag.innerHTML = tagHTML(slot.info); }
      picking = true;
      play('box_thump');
      play('click', { delay: 0.05 });
      slot.el.classList.add('is-picked');
      el.classList.add('tbx--picked');
      const mode = slot.info.empty ? 'new' : 'continue';
      const go = () => { close(); onPick?.({ slot: slot.n, mode }); };
      if (stage) stage.pick(slot.n - 1).then(go); else setTimeout(go, 520);
    });
    slot.el.querySelector('.tbx-toss').addEventListener('click', (e) => {
      e.stopPropagation();
      if (picking || slot.busy || !slot.info || slot.info.empty) return;
      confirmTag(slot);
    });
  }
  const goBack = () => { if (closed || picking) return; play('click'); close(); onBack?.(); };
  el.querySelector('.tbx-back').addEventListener('click', goBack);
  el.querySelector('.tbx-back').addEventListener('pointerenter', () => play('hover', { volume: 0.5 }));
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); goBack(); } };
  window.addEventListener('keydown', onKey);
  el.tabIndex = -1;
  requestAnimationFrame(() => { el.classList.add('tbx--in'); el.focus({ preventScroll: true }); });
  play('box_land', { volume: 0.6 });

  function close() {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    el.classList.add('tbx--out');
    setTimeout(() => { fox?.dispose(); stage?.dispose(); el.remove(); }, 420);
  }
  return { el, close, slots, get fox() { return fox; }, get stage() { return stage; } };
}
