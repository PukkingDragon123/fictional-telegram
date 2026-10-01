// Access to the pixel-art fish atlas (src/art/fishArt.js) with a simple
// placeholder generator so the game keeps running if the art is missing.
import { SPECIES, SPECIES_BY_ID } from '../data/species.js';

const mods = import.meta.glob('../art/fishArt.js', { eager: true });
const art = mods['../art/fishArt.js'] || null;

export const HAS_FISH_ART = !!(art && art.buildFishAtlas);
export const FISH_TPU = (art && art.FISH_TEXELS_PER_UNIT) || 26;

function hex(c) { return '#' + (c >>> 0).toString(16).padStart(6, '0'); }

// ---------------------------------------------------------------- placeholder
let ph = null;
function placeholderAtlas() {
  if (ph) return ph;
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 512;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const rects = new Map();
  let x = 1, y = 1, rowH = 0;
  const alloc = (w, h) => {
    if (x + w + 1 > cv.width) { x = 1; y += rowH + 1; rowH = 0; }
    const r = { x, y, w, h }; x += w + 1; rowH = Math.max(rowH, h); return r;
  };
  const drawFish = (sp, w, h, f, r) => {
    const c = sp.colors || { back: 0x3a5f9c, side: 0x5b86c9, belly: 0xe8a34c, fin: 0x3f6aa8 };
    const cx = r.x + w * 0.55, cy = r.y + h / 2;
    const tail = Math.sin(f * Math.PI / 2) * h * 0.18;
    ctx.fillStyle = hex(c.fin);
    ctx.beginPath(); ctx.moveTo(r.x + w * 0.2, cy); ctx.lineTo(r.x + 1, cy - h * 0.4 + tail); ctx.lineTo(r.x + 1, cy + h * 0.4 + tail); ctx.fill();
    ctx.fillStyle = hex(c.side);
    ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.38, h * 0.36, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hex(c.back);
    ctx.fillRect(Math.round(cx - w * 0.3), Math.round(cy - h * 0.34), Math.round(w * 0.6), Math.max(1, Math.round(h * 0.14)));
    ctx.fillStyle = hex(c.belly);
    ctx.fillRect(Math.round(cx - w * 0.25), Math.round(cy + h * 0.14), Math.round(w * 0.5), Math.max(1, Math.round(h * 0.14)));
    ctx.fillStyle = '#101418';
    ctx.fillRect(Math.round(cx + w * 0.24), Math.round(cy - h * 0.1), 2, 2);
  };
  for (const sp of SPECIES) {
    const w = Math.round(sp.size * 26), h = Math.max(8, Math.round(w * 0.42));
    for (let f = 0; f < 5; f++) { const r = alloc(w, h); drawFish(sp, w, h, f, r); rects.set(`${sp.id}|normal|${f}|0`, r); }
    const fw = Math.max(8, Math.round(w * 0.42)), fh = Math.max(5, Math.round(fw * 0.5));
    for (let f = 0; f < 2; f++) { const r = alloc(fw, fh); drawFish(sp, fw, fh, f, r); rects.set(`${sp.id}|normal|${f}|1`, r); }
  }
  const extra = {};
  for (const [name, w, h] of [['bones_s', 14, 6], ['bones_m', 24, 9], ['bones_l', 36, 12], ['eggs', 10, 8]]) {
    const r = alloc(w, h);
    ctx.fillStyle = name === 'eggs' ? '#ffa860' : '#f4ecd8';
    if (name === 'eggs') for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(r.x + 2 + (i % 3) * 3, r.y + 2 + Math.floor(i / 3) * 3, 1.5, 0, 7); ctx.fill(); }
    else { ctx.fillRect(r.x + 2, r.y + h / 2 - 1, w - 4, 2); for (let i = 3; i < w - 6; i += 3) ctx.fillRect(r.x + i, r.y + 2, 1, h - 4); ctx.fillRect(r.x + w - 6, r.y + 1, 5, h - 2); }
    extra[name] = r;
  }
  ph = {
    canvas: cv,
    frame(id, morph = 'normal', frame = 0, fry = false) {
      const sid = SPECIES_BY_ID[id] ? id : 'bluegill';
      return rects.get(`${sid}|normal|${fry ? frame % 2 : frame % 5}|${fry ? 1 : 0}`);
    },
    extra(name) { return extra[name] || extra.bones_m; },
  };
  return ph;
}

// ---------------------------------------------------------------- public
export function fishAtlas() {
  if (HAS_FISH_ART) {
    try { return art.buildFishAtlas(); } catch (e) { console.warn('fishArt failed, using placeholder', e); }
  }
  return placeholderAtlas();
}

const urlCache = new Map();
export function fishIconURL(id, { morph = 'normal', frame = 0, fry = false, scale = 2 } = {}) {
  const key = `${id}|${morph}|${frame}|${fry}|${scale}`;
  let u = urlCache.get(key);
  if (u) return u;
  if (HAS_FISH_ART && art.fishDataURL) {
    try { u = art.fishDataURL(id, { morph, frame, fry, scale }); } catch { u = null; }
  }
  if (!u) {
    const a = placeholderAtlas();
    const r = a.frame(id, morph, frame, fry);
    const cv = document.createElement('canvas');
    cv.width = r.w * scale; cv.height = r.h * scale;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(a.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w * scale, r.h * scale);
    u = cv.toDataURL();
  }
  urlCache.set(key, u);
  return u;
}

export function fishCanvasFor(id, opts = {}) {
  if (HAS_FISH_ART && art.fishCanvas) {
    try { return art.fishCanvas(id, opts); } catch { /* fall through */ }
  }
  const a = placeholderAtlas();
  const r = a.frame(id, opts.morph, opts.frame || 0, opts.fry);
  const s = opts.scale || 1;
  const cv = document.createElement('canvas');
  cv.width = r.w * s; cv.height = r.h * s;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(a.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w * s, r.h * s);
  return cv;
}

export function fishImg(id, { morph = 'normal', scale = 2, frame = 0, cls = '' } = {}) {
  return `<img class="px ${cls}" src="${fishIconURL(id, { morph, scale, frame })}" alt="" draggable="false" style="image-rendering:pixelated">`;
}
