// TitleMenu: the cozy title-screen overlay. A hand-painted wooden sign with
// the logo swings in on two ropes (with a Daisy Beer bottle-cap sticker), a
// couple of kraft paper tag buttons, a tiny sound stamp and the font credit.
// Compact so the sunset diorama (TitleScene) shows through.
//
//   const m = showTitleMenu(root, {
//     hasSave,                       // show "Continue"
//     onStart(choice),               // 'continue' | 'new' (called after the exit animation, ~0.4 s)
//     sfx(name, opts),               // optional: audio.play-style ('hover', 'click', 'paper', 'sticker')
//     icon(name, scale) -> html,     // optional: sprite icon html (e.g. spriteImg); falls back to pixel SVGs
//     onSound(on) -> void,           // optional: sound toggled (on = true means sound ON)
//     isMuted() -> bool,             // optional: initial state of the sound toggle
//   });
//   m.close();                       // remove (animated); idempotent
import './titlemenu.css';
import { paperTexture, injectPaperCSS } from './paper.js';

const PXS = 3; // CSS px per art pixel

function px(rows, pal, scale = PXS) {
  const h = rows.length, w = rows[0].length;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = rows[y][x];
      if (c === '.' || !pal[c]) continue;
      ctx.fillStyle = pal[c];
      ctx.fillRect(x, y, 1, 1);
    }
  return `<img class="tm-px" src="${cv.toDataURL()}" width="${w * scale}" height="${h * scale}" alt="">`;
}

// Daisy Beer bottle cap (crimped yellow edge, white daisy, orange heart)
const CAP = [
  '....k.kk.k....',
  '..kkyykkyykk..',
  '.kyyYYYYYYyyk.',
  '.kyYYwwYwwYyk.',
  'kyYwwwwwwwwYyk',
  'kyYYwwwwwwYYyk',
  '.kYwwwoowwwYk.',
  '.kYwwwoowwwYk.',
  'kyYYwwwwwwYYyk',
  'kyYwwwwwwwwYyk',
  '.kyYYwwYwwYyk.',
  '.kyyYYYYYYyyk.',
  '..kkyykkyykk..',
  '....k.kk.k....',
];
const CAP_PAL = { k: '#7a4a12', y: '#e6a81c', Y: '#ffd22e', w: '#fdfbf2', o: '#f08a1a' };
const SPEAKER = ['...k....', '..kk.k..', 'kkkk..k.', 'kwkk.k.k', 'kwkk.k.k', 'kkkk..k.', '..kk.k..', '...k....'];
const SPEAKER_OFF = ['...k....', '..kk....', 'kkkk.r.r', 'kwkk..r.', 'kwkk..r.', 'kkkk.r.r', '..kk....', '...k....'];
const PLAY = ['k...', 'kk..', 'kkk.', 'kkkk', 'kkk.', 'kk..', 'k...'];
const SPARK = ['.k.', 'kwk', '.k.'];
const LEAF = ['..gg', '.gGg', 'gGg.', 'gg..'];

export function showTitleMenu(root, { hasSave = false, onStart, sfx, icon, onSound, isMuted } = {}) {
  injectPaperCSS();
  root = root || document.body;
  const play = (name, o) => { try { sfx?.(name, o); } catch { /* optional */ } };
  let soundOn = !(isMuted?.() ?? false);

  const el = document.createElement('div');
  el.className = 'tm';
  const wood = paperTexture('wood', 306, 138, { edge: 2, seed: 41 });
  const kraft = (w, s) => paperTexture('kraft', w, 54, { seed: s, edge: 1 });
  const playIco = (icon && icon('play', 2)) || px(PLAY, { k: '#2a1a10' }, 3);
  el.innerHTML = `
    <div class="tm-col">
      <div class="tm-sign">
        <i class="tm-rope tm-rope--l"></i><i class="tm-rope tm-rope--r"></i>
        <div class="tm-board" style="background-image:url(${wood})">
          <i class="tm-nail tm-nail--l"></i><i class="tm-nail tm-nail--r"></i>
          <div class="tm-logo" aria-label="The Bear Must Eat">
            <span class="tm-l1">THE BEAR</span>
            <span class="tm-l2">MUST EAT</span>
          </div>
          <span class="tm-leaf">${px(LEAF, { g: '#4f8a34', G: '#7cc04a' })}</span>
          <span class="tm-cap" title="Daisy Beer">${px(CAP, CAP_PAL)}</span>
          <span class="tm-spark tm-spark--a">${px(SPARK, { k: '#fff2a0', w: '#ffffff' })}</span>
          <span class="tm-spark tm-spark--b">${px(SPARK, { k: '#fff2a0', w: '#ffffff' })}</span>
        </div>
      </div>
      <div class="tm-btns">
        ${hasSave ? `<button class="tm-btn tm-btn--go" data-c="continue" style="--r:-1.5deg;background-image:url(${kraft(220, 3)})"><span class="tm-ico">${playIco}</span>Continue</button>` : ''}
        <button class="tm-btn ${hasSave ? '' : 'tm-btn--go'}" data-c="new" style="--r:${hasSave ? 1.2 : -1.2}deg;background-image:url(${kraft(220, 7)})">${hasSave ? '' : `<span class="tm-ico">${playIco}</span>`}<span class="tm-lbl">New game</span></button>
      </div>
      <button class="tm-snd" aria-label="Sound" title="Sound"></button>
    </div>
    <div class="tm-credit">Font: Galmuri11 by Lee Minseo (quiple), SIL OFL 1.1</div>`;
  root.appendChild(el);

  const snd = el.querySelector('.tm-snd');
  const paintSnd = () => {
    snd.innerHTML = px(soundOn ? SPEAKER : SPEAKER_OFF, { k: '#2a1a10', w: '#fdf4d8', r: '#c0392b' }, 3);
    snd.classList.toggle('is-off', !soundOn);
  };
  paintSnd();
  snd.addEventListener('click', (e) => {
    e.stopPropagation();
    soundOn = !soundOn;
    paintSnd();
    snd.classList.remove('tm-pop'); void snd.offsetWidth; snd.classList.add('tm-pop');
    try { onSound?.(soundOn); } catch { /* optional */ }
    if (soundOn) play('click');
  });

  let closed = false, armed = null;
  const choose = (choice) => {
    if (closed) return;
    play('click');
    close();
    setTimeout(() => onStart?.(choice), 380);
  };
  for (const b of el.querySelectorAll('.tm-btn')) {
    b.addEventListener('pointerenter', () => play('hover', { volume: 0.6 }));
    b.addEventListener('click', () => {
      const c = b.dataset.c;
      if (c === 'new' && hasSave && armed !== b) {
        // overwriting a save: ask once, right on the tag
        armed = b;
        play('paper');
        b.classList.add('is-armed');
        b.querySelector('.tm-lbl').textContent = 'Sure? Tap again';
        setTimeout(() => {
          if (armed !== b || closed) return;
          armed = null;
          b.classList.remove('is-armed');
          b.querySelector('.tm-lbl').textContent = 'New game';
        }, 3000);
        return;
      }
      choose(c);
    });
  }
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { const b = el.querySelector('.tm-btn'); if (b && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); b.click(); } }
  };
  window.addEventListener('keydown', onKey);
  setTimeout(() => play('paper', { volume: 0.5 }), 250);

  function close() {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey);
    el.classList.add('tm--out');
    setTimeout(() => el.remove(), 420);
  }
  return { close, el };
}
