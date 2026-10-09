// Phosphor icons for the lab computer: the game's pixel sprites (src/ui/sprites.js)
// and fish frames re-inked in 4 shades of CRT green (a monochrome terminal can't
// show colour). Each tinted canvas is built once and cached; DOM code gets a
// cached data: URL at an integer scale.
import { hasSprite, spriteCanvas } from '../sprites.js';

// dark -> light. 'on' = normal, 'dim' = locked, 'mid' = needs a neighbour, 'amber' = coins / warnings
export const RAMPS = {
  on: ['#03160b', '#1f7d3d', '#52e47e', '#d0ffd8'],
  done: ['#03160b', '#1b6c36', '#47c86f', '#b2f7c2'],
  mid: ['#020f07', '#123d21', '#2b7442', '#4ea468'],
  dim: ['#020a05', '#0c2a17', '#174a2b', '#22603a'],
  ink: ['#d0ffd8', '#7cf29e', '#1d6a36', '#03160b'], // dark art on a bright fill
  amber: ['#1c1003', '#7c4c10', '#e8a030', '#ffe6a8'],
};

const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const RGB = Object.fromEntries(Object.entries(RAMPS).map(([k, v]) => [k, v.map(rgb)]));

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

/** a copy of `src` with every opaque pixel mapped to one of the ramp's 4 shades by (normalised) brightness */
export function tintCanvas(src, ramp = 'on') {
  const R = RGB[ramp] || RGB.on;
  const w = src.width, h = src.height;
  const c = mk(w, h);
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0);
  let img;
  try { img = x.getImageData(0, 0, w, h); } catch { return c; }
  const d = img.data;
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 48) continue;
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (l < lo) lo = l;
    if (l > hi) hi = l;
  }
  const span = Math.max(24, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 48) { d[i + 3] = 0; continue; }
    const t = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] - lo) / span;
    const k = t < 0.16 ? 0 : t < 0.46 ? 1 : t < 0.76 ? 2 : 3;
    const p = R[k];
    d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

function scaled(src, s) {
  if (s <= 1) return src;
  const c = mk(src.width * s, src.height * s);
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingEnabled = false;
  x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export class IconBank {
  /** @param {{ fishCanvas?: (species, { frame, scale }) => HTMLCanvasElement }} [o] */
  constructor(o = {}) {
    this.fishFn = o.fishCanvas || null;
    this._c = new Map();
    this._u = new Map();
  }

  /** tinted 1x canvas of a UI sprite (null when the game has no such sprite) */
  icon(name, ramp = 'on') {
    if (!name) return null;
    const k = name + '|' + ramp;
    let c = this._c.get(k);
    if (c !== undefined) return c;
    c = null;
    try { if (hasSprite(name)) c = tintCanvas(spriteCanvas(name, 1), ramp); } catch { c = null; }
    this._c.set(k, c);
    return c;
  }

  /** tinted fish frame (0..3) */
  fish(species, frame = 0, ramp = 'on') {
    if (!species || !this.fishFn) return null;
    const k = '~' + species + '#' + frame + '|' + ramp;
    let c = this._c.get(k);
    if (c !== undefined) return c;
    c = null;
    try {
      let f = this.fishFn(species, { frame, scale: 1 });
      if (f && !f.getContext && f.canvas) f = f.canvas;
      if (f && f.width && f.getContext) c = tintCanvas(f, ramp);
    } catch { c = null; }
    this._c.set(k, c);
    return c;
  }

  /** the art for a research node: its fish when it unlocks one, else its icon (fallback: flask) */
  node(d, ramp = 'on') {
    if (d?.species) { const f = this.fish(d.species, 0, ramp); if (f) return f; }
    return this.icon(d?.icon, ramp) || this.icon('flask', ramp);
  }

  /** data: URL of a tinted canvas scaled to fit `box` css px (integer scale) */
  url(c, box = 32, key = '') {
    if (!c) return '';
    const s = Math.max(1, Math.floor(box / Math.max(c.width, c.height, 1)));
    const k = (key || '') + '@' + s;
    if (key && this._u.has(k)) return this._u.get(k);
    let u = '';
    try { u = scaled(c, s).toDataURL(); } catch { u = ''; }
    const out = u ? `<img class="lt-ic" src="${u}" width="${c.width * s}" height="${c.height * s}" alt="" draggable="false">` : '';
    if (key) this._u.set(k, out);
    return out;
  }

  iconHTML(name, box = 32, ramp = 'on') { return this.url(this.icon(name, ramp) || this.icon('flask', ramp), box, 'i:' + name + '|' + ramp + '|' + box); }
  nodeHTML(d, box = 32, ramp = 'on') { return this.url(this.node(d, ramp), box, 'n:' + (d?.species ? '~' + d.species : d?.icon) + '|' + ramp + '|' + box); }
}
