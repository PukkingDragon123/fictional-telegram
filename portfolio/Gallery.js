// Wall gallery with its own frames: the classroom's wall posters are hidden and
// replaced by wooden frames holding pictures of the work. Every picture is first
// drawn by code (so a frame is never empty) and swapped for the real image once
// it has loaded. The "pixel art" pieces are the screenshots shrunk to a tiny size
// and reduced to a few colours per channel (automatic).
import * as THREE from 'three';
import { MEDIA } from './content.js';

const ITEMS = [
  { id: 'dim', slot: 'poster_maple', src: MEDIA.dimension.src, title: 'Custom dimension', sub: 'Minecraft mod', pixel: 0, sky: ['#1b1740', '#7a3d9a', '#e88ac0'], ground: '#4a9ab0' },
  { id: 'mob', slot: 'poster_rules', src: MEDIA.mob.src, title: 'Custom mob', sub: 'Minecraft mod', pixel: 0, crop: [0.02, 0, 0.26, 1], sky: ['#2a2a4a', '#2a2a4a', '#2a2a4a'], ground: '#cfd8c0' },
  { id: 'mud', slot: 'poster_stars', src: MEDIA.mudkipsShot.src, title: "Mudkip's Garden", sub: 'Gameplay screenshot', pixel: 120, sky: ['#7ac0f0', '#a8dcf8', '#e8f6ff'], ground: '#3a8ad8' },
  { id: 'shore', slot: 'poster_moose', src: MEDIA.shoreShot.src, title: 'Sunset Shore', sub: 'Scene capture', pixel: 110, sky: ['#f0804a', '#f8b070', '#4a7a88'], ground: '#2a5a68' },
  { id: 'bear', slot: null, src: MEDIA.tbme.src, title: 'The Bear Must Eat', sub: 'Key art', pixel: 100, sky: ['#5a2a7a', '#e8506a', '#ffb060'], ground: '#4a8a3a' },
];

function load(src) { return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }

// shrink to `w` px wide and keep a handful of levels per channel
function pixelate(img, w, levels = 6) {
  const h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, w, h);
  try {
    const d = g.getImageData(0, 0, w, h), k = 255 / (levels - 1);
    for (let i = 0; i < d.data.length; i += 4) for (let j = 0; j < 3; j++) d.data[i + j] = Math.round(d.data[i + j] / k) * k;
    g.putImageData(d, 0, 0);
  } catch { /* keep the plain shrink */ }
  return c;
}

// a small pixel scene made in code: sky bands, far hills, ground, a few stars
function codeArt(p, w = 96, h = 72) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const bands = p.sky.length;
  p.sky.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, Math.floor((i * h * 0.7) / bands), w, Math.ceil((h * 0.7) / bands) + 1); });
  g.fillStyle = 'rgba(0,0,0,.25)';
  for (let x = 0; x < w; x++) g.fillRect(x, Math.floor(h * 0.55 - Math.abs(Math.sin(x * 0.12 + p.id.length) * 10) - (x % 7)), 1, h);
  g.fillStyle = p.ground; g.fillRect(0, Math.floor(h * 0.72), w, h);
  g.fillStyle = '#fff';
  for (let i = 0; i < 14; i++) g.fillRect((i * 37 + p.id.charCodeAt(0)) % w, (i * 11) % Math.floor(h * 0.45), 1, 1);
  // bright title strip so the stand-in never reads as a black square
  g.fillStyle = 'rgba(255,248,230,.92)'; g.fillRect(0, h - 16, w, 16);
  g.fillStyle = '#2a1c16'; g.font = '9px monospace'; g.textBaseline = 'middle'; g.fillText(p.title.toUpperCase().slice(0, 18), 4, h - 8);
  return c;
}

function drawFrameArt(p, art, w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  // p.crop = [x, y, w, h] as fractions of the picture (e.g. one view of a wide strip)
  const [cx, cy, cw, ch] = p.crop || [0, 0, 1, 1];
  const sx = cx * art.width, sy = cy * art.height, sw = cw * art.width, sh = ch * art.height;
  const s = Math.max(w / sw, h / sh);
  c.drawImage(art, sx, sy, sw, sh, (w - sw * s) / 2, (h - sh * s) / 2, sw * s, sh * s);
  return cv;
}

function makeFrame(src, pos, w, h) {
  const grp = new THREE.Group();
  grp.position.copy(pos);
  const T = 0.045, wood = new THREE.MeshLambertMaterial({ color: 0x7a4a2a }), dark = new THREE.MeshLambertMaterial({ color: 0x4a2a16 });
  const bar = (bw, bh, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.05), wood); m.position.set(x, y, 0.02); grp.add(m); };
  bar(w + T * 2, T, 0, h / 2 + T / 2); bar(w + T * 2, T, 0, -h / 2 - T / 2); bar(T, h, -w / 2 - T / 2, 0); bar(T, h, w / 2 + T / 2, 0);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.01, h + 0.01), dark); back.position.z = 0.001; grp.add(back);
  const tex = new THREE.CanvasTexture(src);
  tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  pic.position.z = 0.005; grp.add(pic);
  return { grp, tex, pic };
}

export function buildGallery(group) {
  const pieces = ITEMS.map((it) => ({ ...it, art: codeArt(it) }));
  for (const p of pieces) {
    const old = p.slot && group.getObjectByName(p.slot);
    if (old) {
      const big = p.id === 'mob' ? 1.6 : 1.35; // bigger than the old posters so the art is readable
      const gw = (old.geometry.parameters?.width || 0.6) * big, gh = (old.geometry.parameters?.height || 0.7) * big;
      old.visible = false;
      const px = Math.round(gw * 110), py = Math.round(gh * 110);
      const pos = old.position.clone(); pos.z += 0.008;
      const f = makeFrame(drawFrameArt(p, p.art, px, py), pos, gw, gh);
      group.add(f.grp);
      p.frame = f; p.px = px; p.py = py;
    }
    load(p.src).then((img) => {
      if (!img) return;
      p.art = img; // the viewer always shows the original picture
      p.real = true;
      if (p.frame) {
        const cv = drawFrameArt(p, p.pixel ? pixelate(img, p.pixel) : img, p.px, p.py); // only the wall copy is pixelated
        p.frame.tex.image = cv; p.frame.tex.needsUpdate = true;
      }
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
    // always a canvas: the real picture when loaded, the code-drawn one otherwise
    const out = document.createElement('canvas');
    const src = p.art;
    out.width = src.width || src.naturalWidth; out.height = src.height || src.naturalHeight;
    out.getContext('2d').drawImage(src, 0, 0);
    if (!p.real) out.className = 'pix'; // only the code-drawn stand-in is chunky
    view.appendChild(out);
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
