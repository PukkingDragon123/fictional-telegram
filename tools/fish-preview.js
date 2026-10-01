// Preview for src/art/fishArt.js (imports only the art module + species data).
//   /tools/fish-preview.html                 full sheet (animated, from the atlas)
//   ?dev=bluegill,pike&s=8&f=0,4&morph=gold  zoom on individual frames
//   ?slots=bluegill&f=0&s=16                 false-colour semantic slot view
import * as FA from '/src/art/fishArt.js';
import { SPECIES, MORPH_IDS } from '/src/data/species.js';

const q = new URLSearchParams(location.search);
const app = document.getElementById('app');
const errEl = document.getElementById('err');
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
window.addEventListener('error', (e) => { errEl.textContent += e.message + '\n'; });

// fishCanvas() returns cached canvases, so copy before placing in the DOM
function copy(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  c.className = 'px';
  return c;
}
function cell(cv, label) {
  const c = el('div', 'cell');
  c.appendChild(cv);
  if (label) c.appendChild(el('div', 'lbl', label));
  return c;
}

// ---------------------------------------------------------------- dev modes
if (q.get('dev')) {
  const ids = q.get('dev').split(',');
  const s = +(q.get('s') || 6);
  const morph = q.get('morph') || 'normal';
  const fry = q.get('fry') === '1';
  const frames = (q.get('f') || (fry ? '0,1' : '0,1,2,3,4')).split(',').map(Number);
  for (const bg of (q.get('bg') || 'water,paper').split(',')) {
    const p = el('div', 'panel ' + bg);
    for (const id of ids) {
      const row = el('div', 'row');
      for (const f of frames) row.appendChild(cell(copy(FA.fishCanvas(id, { morph, frame: f, fry, scale: s })), `${id} f${f}`));
      p.appendChild(row);
    }
    app.appendChild(p);
  }
} else if (q.get('slots')) {
  const p = el('div', 'panel paper');
  for (const id of q.get('slots').split(',')) p.appendChild(cell(FA._debugSlots(id, +(q.get('f') || 0), q.get('fry') === '1', +(q.get('s') || 16)), id));
  app.appendChild(p);
} else {
  sheet();
}

// ---------------------------------------------------------------- full sheet
function sheet() {
  const t0 = performance.now();
  const atlas = FA.buildFishAtlas();
  const ms = performance.now() - t0;
  const ids = SPECIES.map((s) => s.id);
  document.getElementById('sub').innerHTML =
    `${ids.length} species &middot; ${MORPH_IDS.length} morphs &middot; ${FA.FISH_FRAMES} adult frames + 2 fry frames &middot; ` +
    `atlas ${atlas.canvas.width}&times;${atlas.canvas.height} built in ${ms.toFixed(0)} ms &middot; ${FA.FISH_TEXELS_PER_UNIT} texels / unit`;

  const anim = []; // { cv, id, morph, fry, frames, scale }
  const animCell = (id, morph, scale, fry = false, frames = fry ? [0, 1] : [0, 1, 2, 3], label = id) => {
    const r = atlas.frame(id, morph, 0, fry);
    // size the canvas to the largest frame so nothing jumps
    let w = 0, h = 0;
    for (const f of frames) { const rr = atlas.frame(id, morph, f, fry); w = Math.max(w, rr.w); h = Math.max(h, rr.h); }
    const cv = document.createElement('canvas');
    cv.width = w * scale; cv.height = h * scale; cv.className = 'px';
    anim.push({ cv, id, morph, fry, frames, scale, w, h, r });
    return cell(cv, label);
  };

  const section = (title, cls, fill) => {
    app.appendChild(el('h2', null, title));
    const p = el('div', 'panel ' + cls);
    fill(p);
    app.appendChild(p);
  };

  for (const bg of ['water', 'paper']) {
    section(`Swim cycle &middot; ${bg === 'water' ? 'underwater' : 'parchment'} (3x)`, bg, (p) => {
      const g = el('div', 'grid');
      for (const id of ids) g.appendChild(animCell(id, 'normal', 3));
      p.appendChild(g);
    });
  }

  const MORPH_SPECIES = ['bluegill', 'perch', 'rainbow', 'pike', 'mapleKoi'];
  section('Morphs (3x)', 'water', (p) => {
    for (const id of MORPH_SPECIES) {
      const row = el('div', 'mrow');
      row.appendChild(el('div', 'rl', id));
      for (const m of MORPH_IDS) row.appendChild(animCell(id, m, 3, false, [0, 1, 2, 3], m));
      p.appendChild(row);
    }
  });
  section('Morphs on parchment (3x)', 'paper', (p) => {
    for (const id of ['sturgeon', 'grayling']) {
      const row = el('div', 'mrow');
      row.appendChild(el('div', 'rl', id));
      for (const m of MORPH_IDS) row.appendChild(animCell(id, m, 3, false, [0, 1, 2, 3], m));
      p.appendChild(row);
    }
  });

  section('Fry (4x)', 'water', (p) => {
    const g = el('div', 'grid');
    for (const id of ids) g.appendChild(animCell(id, 'normal', 4, true));
    p.appendChild(g);
  });
  section('Fry morphs (4x)', 'paper', (p) => {
    for (const id of ['bluegill', 'grayling', 'mapleKoi']) {
      const row = el('div', 'mrow');
      row.appendChild(el('div', 'rl', id));
      for (const m of MORPH_IDS) row.appendChild(animCell(id, m, 4, true, [0, 1], m));
      p.appendChild(row);
    }
  });

  section('Flop &middot; held up (frame 4, 3x)', 'paper', (p) => {
    const g = el('div', 'grid');
    for (const id of ids) {
      const r = atlas.frame(id, 'normal', 4);
      const cv = document.createElement('canvas');
      cv.width = r.w * 3; cv.height = r.h * 3; cv.className = 'px';
      const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(atlas.canvas, r.x, r.y, r.w, r.h, 0, 0, cv.width, cv.height);
      g.appendChild(cell(cv, id));
    }
    p.appendChild(g);
  });

  for (const bg of ['water', 'paper']) {
    section(`Extras (4x, ${bg})`, bg, (p) => {
      const g = el('div', 'grid');
      for (const name of ['bones_s', 'bones_m', 'bones_l', 'eggs']) {
        const r = atlas.extra(name);
        const cv = document.createElement('canvas');
        cv.width = r.w * 4; cv.height = r.h * 4; cv.className = 'px';
        const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
        ctx.drawImage(atlas.canvas, r.x, r.y, r.w, r.h, 0, 0, cv.width, cv.height);
        g.appendChild(cell(cv, `${name} ${r.w}&times;${r.h}`));
      }
      p.appendChild(g);
    });
  }

  section('Detail (6x): swim frames 0-3 + flop', 'paper', (p) => {
    for (const id of ['bluegill', 'brook', 'walleye', 'sturgeon']) {
      const row = el('div', 'row');
      for (let f = 0; f < 5; f++) row.appendChild(cell(copy(FA.fishCanvas(id, { frame: f, scale: 6 })), `${id} f${f}`));
      p.appendChild(row);
    }
  });

  section('Atlas (1x)', 'water', (p) => {
    const cv = copy(atlas.canvas);
    cv.className = 'atlas';
    p.appendChild(cv);
  });

  // animate at ~7 fps straight from the atlas
  let last = 0, tick = 0;
  const draw = () => {
    for (const a of anim) {
      const f = a.frames[tick % a.frames.length];
      const r = atlas.frame(a.id, a.morph, f, a.fry);
      const ctx = a.cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, a.cv.width, a.cv.height);
      // frames share one box, anchored bottom-right like the art
      const dx = (a.w - r.w) * a.scale, dy = Math.round((a.h - r.h) / 2) * a.scale;
      ctx.drawImage(atlas.canvas, r.x, r.y, r.w, r.h, dx, dy, r.w * a.scale, r.h * a.scale);
    }
  };
  draw();
  const loop = (t) => {
    if (t - last > 140) { last = t; tick++; draw(); }
    requestAnimationFrame(loop);
  };
  if (q.get('still') !== '1') requestAnimationFrame(loop);
}
