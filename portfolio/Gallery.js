// Wall gallery: swaps the classroom's wall posters for pictures of the work and
// opens a simple viewer on click. The "pixel art" pieces are the screenshots
// shrunk to a tiny size and reduced to a few colours per channel (automatic).
import * as THREE from 'three';
import { MEDIA } from './content.js';

const ITEMS = [
  { id: 'dim', slot: 'poster_maple', w: 52, h: 68, src: MEDIA.dimension.src, title: 'Custom dimension', sub: 'Minecraft mod', pixel: 0 },
  { id: 'mob', slot: 'poster_rules', w: 34, h: 40, src: MEDIA.mob.src, title: 'Custom mob', sub: 'Minecraft mod', pixel: 0 },
  { id: 'mud', slot: 'poster_stars', w: 48, h: 42, src: MEDIA.mudkipsShot.src, title: "Mudkip's Garden", sub: 'Pixel art version', pixel: 120 },
  { id: 'shore', slot: 'poster_moose', w: 50, h: 64, src: MEDIA.shoreShot.src, title: 'Sunset Shore', sub: 'Pixel art version', pixel: 110 },
  { id: 'bear', slot: null, w: 0, h: 0, src: MEDIA.tbme.src, title: 'The Bear Must Eat', sub: 'Pixel art version', pixel: 100 },
];

function load(src) { return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }

// shrink to `w` px wide and keep a handful of levels per channel
function pixelate(img, w, levels = 6) {
  const h = Math.round((w * img.naturalHeight) / img.naturalWidth);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h), k = 255 / (levels - 1);
  for (let i = 0; i < d.data.length; i += 4) for (let j = 0; j < 3; j++) d.data[i + j] = Math.round(d.data[i + j] / k) * k;
  g.putImageData(d, 0, 0);
  return c;
}

function cover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height), dw = img.width * s, dh = img.height * s;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

export function buildGallery(group) {
  const pieces = ITEMS.map((it) => ({ ...it, art: null }));
  for (const p of pieces) {
    load(p.src).then((img) => {
      if (!img) return;
      p.art = p.pixel ? pixelate(img, p.pixel) : img;
      const mesh = p.slot && group.getObjectByName(p.slot);
      if (!mesh) return;
      const cv = document.createElement('canvas'); cv.width = p.w; cv.height = p.h;
      const c = cv.getContext('2d');
      c.fillStyle = '#2a1c16'; c.fillRect(0, 0, p.w, p.h);
      c.fillStyle = '#f4ecd8'; c.fillRect(1, 1, p.w - 2, p.h - 2);
      cover(c, p.art, 3, 3, p.w - 6, p.h - 6);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false;
      mesh.material.map = tex; mesh.material.emissiveMap = tex; mesh.material.needsUpdate = true;
    });
  }
  return pieces;
}

let viewer = null;
export function galleryOpen() { return !!viewer; }
export function closeGallery() { viewer?.remove(); viewer = null; }
export function openGallery(pieces, index = 0) {
  if (viewer) return;
  let i = index;
  const el = document.createElement('div');
  el.className = 'pf-gal';
  el.innerHTML = '<button class="pf-gal-x" type="button" aria-label="Close">X</button><button class="pf-gal-n l" type="button" aria-label="Previous">&lt;</button><div class="pf-gal-view"></div><button class="pf-gal-n r" type="button" aria-label="Next">&gt;</button><div class="pf-gal-cap"></div>';
  const view = el.querySelector('.pf-gal-view'), cap = el.querySelector('.pf-gal-cap');
  const show = () => {
    const p = pieces[i];
    view.innerHTML = '';
    if (p.art) {
      const node = p.art instanceof HTMLCanvasElement ? p.art : p.art;
      const out = document.createElement(p.pixel ? 'canvas' : 'img');
      if (p.pixel) { out.width = node.width; out.height = node.height; out.getContext('2d').drawImage(node, 0, 0); out.className = 'pix'; } else { out.src = p.src; }
      view.appendChild(out);
    }
    cap.innerHTML = `<b>${p.title}</b> <i>${p.sub}</i> <span>${i + 1} / ${pieces.length}</span>`;
  };
  const go = (d) => { i = (i + d + pieces.length) % pieces.length; show(); };
  el.querySelector('.l').onclick = () => go(-1);
  el.querySelector('.r').onclick = () => go(1);
  el.querySelector('.pf-gal-x').onclick = closeGallery;
  el.addEventListener('pointerdown', (e) => { if (e.target === el || e.target === view) closeGallery(); });
  el._key = (e) => { if (e.key === 'Escape') closeGallery(); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); else return; e.stopImmediatePropagation(); e.preventDefault(); };
  window.addEventListener('keydown', el._key, true);
  const rm = el.remove.bind(el); el.remove = () => { window.removeEventListener('keydown', el._key, true); rm(); };
  document.body.appendChild(el);
  viewer = el;
  show();
}
