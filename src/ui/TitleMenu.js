// TitleMenu: the title screen's menu, made of things that live in the valley.
// A wooden logo board hangs on two ropes (somebody took a bite out of its
// corner), and a little trail signpost holds arrow planks: Continue (the last
// save played, with its day), New game (opens the three save boxes, see
// SaveBoxes.js) and Settings (a whole page, SettingsScreen.js), plus a tin sound
// tag nailed to the post. A pointing paw follows the plank you're on.
// Everything is pixel art painted on canvases (labels straight from the TBME
// Goofy bitmap glyphs: crisp, no font loading, there on the first frame).
//
//   const m = showTitleMenu(root, {
//     onStart({ slot, mode }),      // mode 'continue' | 'new' (after the exit animation, ~0.35 s)
//     sfx(name, opts),              // optional: audio.play-style
//     onSound(on), isMuted(),       // optional: the sound tag
//   });
//   m.close();                      // animated, idempotent
import './titlemenu.css';
import { anySave, lastSlot, slotMeta, slotInfo } from '../game/saveSlots.js';
import { INK, cv, scaleEl, wood, arrowPlank, board, WOOD } from './titleArt.js';

function soundTag(on) {
  const c = cv(15, 15), g = c.getContext('2d');
  // a tin plate with a rolled rim
  g.fillStyle = INK; g.fillRect(1, 0, 13, 15); g.fillRect(0, 1, 15, 13);
  g.fillStyle = '#9aa6b4'; g.fillRect(1, 1, 13, 13);
  g.fillStyle = '#c8d2dc'; g.fillRect(2, 2, 11, 1); g.fillRect(2, 2, 1, 10);
  g.fillStyle = '#6a7686'; g.fillRect(2, 12, 11, 1); g.fillRect(12, 3, 1, 10);
  const SP = on ? ['...k.....', '..kk..k..', 'kkkk...k.', 'kkkk.k..k', 'kkkk.k..k', 'kkkk...k.', '..kk..k..', '...k.....']
    : ['...k.....', '..kk.....', 'kkkk.r.r.', 'kkkk..r..', 'kkkk..r..', 'kkkk.r.r.', '..kk.....', '...k.....'];
  SP.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.') { g.fillStyle = row[x] === 'r' ? '#d8402e' : INK; g.fillRect(3 + x, 4 + y, 1, 1); } });
  return c;
}

function postTile() {
  const c = cv(7, 24), g = c.getContext('2d');
  wood(g, 0, 0, 7, 24, 9, { base: [138, 88, 50], dark: [98, 60, 34], light: [176, 120, 70] });
  g.fillStyle = INK; g.fillRect(0, 0, 1, 24); g.fillRect(6, 0, 1, 24);
  g.fillStyle = 'rgba(255,200,140,0.45)'; g.fillRect(5, 0, 1, 24); // the sun on its right side
  return c;
}

// Reynard's paw (black sock, orange fur) pointing at the plank you're on
function pawPointer() {
  const rows = ['....kkkk....', '..kkoooOkkkk', '.koooooooook', 'kssoookkkkkk', 'ksssooook...', 'kssssooook..', '.kssssook...', '..kkkkkk....'];
  const P = { k: INK, o: '#ee7a36', O: '#ffb070', s: '#3a2c40' };
  const c = cv(12, 8), g = c.getContext('2d');
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (P[r[x]]) { g.fillStyle = P[r[x]]; g.fillRect(x, y, 1, 1); } });
  return c;
}

// a tiny gear for the settings plank
function gearIcon() {
  const rows = ['...k.k...', '..kskskk.', '.kssssssk', 'kssk.kssk', '.ks...sk.', 'kssk.kssk', '.kssssssk', '..kskskk.', '...k.k...'];
  const P = { k: INK, s: '#d8dde6' };
  const c = cv(9, 9), g = c.getContext('2d');
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (P[r[x]]) { g.fillStyle = P[r[x]]; g.fillRect(x, y, 1, 1); } });
  return c;
}

export function showTitleMenu(root, { onStart, sfx, onSound, isMuted } = {}) {
  root = root || document.body;
  const play = (name, o) => { try { sfx?.(name, o); } catch { /* optional */ } };
  let soundOn = !(isMuted?.() ?? false);
  let closed = false, away = false, sub = null;
  const S = window.innerWidth < 560 || window.innerHeight < 520 ? 2 : 3;

  const logo = board(['THE BEAR', 'MUST EAT'], { bite: true, pad: 11 });
  const el = document.createElement('div');
  el.className = 'tm';
  el.style.setProperty('--s', `${S}px`);
  el.style.setProperty('--bh', `${logo.height * S}px`);
  scaleEl(logo, S);
  el.innerHTML = `
    <div class="tm-sign" style="--w:${logo.width * S}px">
      <i class="tm-rope tm-rope--l"></i><i class="tm-rope tm-rope--r"></i>
      <h1 class="tm-logo" aria-label="The Bear Must Eat"></h1>
    </div>
    <nav class="tm-post" aria-label="Menu">
      <i class="tm-pole"></i>
      <div class="tm-planks"></div>
      <i class="tm-paw" aria-hidden="true"></i>
      <button class="tm-snd" aria-label="Sound" title="Sound"></button>
    </nav>
    <div class="tm-credit">Font: TBME Goofy, made from Chewy by Font Diner / Sideshow (Apache 2.0)</div>`;
  el.querySelector('.tm-logo').appendChild(logo);
  el.querySelector('.tm-pole').style.backgroundImage = `url(${postTile().toDataURL()})`;
  el.querySelector('.tm-paw').appendChild(scaleEl(pawPointer(), S));
  const planks = el.querySelector('.tm-planks');
  const btn = (choice, label, sub, seed, tint, icon) => {
    const b = document.createElement('button');
    b.className = 'tm-btn';
    b.dataset.c = choice;
    b.setAttribute('aria-label', label + (sub ? ` (${sub})` : ''));
    const paint = (lb, sb, tn) => {
      const c = arrowPlank(lb, sb, { seed, tint: tn, icon, minW: 64 });
      scaleEl(c, S);
      b.replaceChildren(c);
      b.setAttribute('aria-label', lb + (sb ? ` (${sb})` : ''));
    };
    paint(label, sub, tint);
    b.repaint = paint;
    b.style.setProperty('--d', `${1.05 + planks.children.length * 0.13}s`);
    b.style.setProperty('--ph', `${planks.children.length * 1.7}s`);
    planks.appendChild(b);
    return b;
  };
  const has = anySave();
  const last = lastSlot();
  const contSub = (m) => `SAVE ${last}${m ? ` - DAY ${m.day}` : ''}`;
  const contBtn = has ? btn('continue', 'CONTINUE', contSub(slotMeta(last)), 4, WOOD.green) : null;
  if (contBtn && !slotMeta(last)) slotInfo(last).then((i) => { if (!closed && i.meta) contBtn.repaint('CONTINUE', contSub(i.meta), WOOD.green); });
  btn('new', 'NEW GAME', has ? 'PICK A BOX' : null, 7, has ? null : WOOD.green);
  btn('settings', 'SETTINGS', null, 11, WOOD.dark, gearIcon());
  root.appendChild(el);

  const snd = el.querySelector('.tm-snd');
  const paintSnd = () => {
    snd.replaceChildren(scaleEl(soundTag(soundOn), S));
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

  // the paw follows the plank under the pointer / in focus
  const paw = el.querySelector('.tm-paw');
  const pointAt = (b) => {
    if (!b) { paw.classList.remove('is-on'); return; }
    paw.style.setProperty('--py', `${b.offsetTop + planks.offsetTop + b.offsetHeight / 2}px`);
    paw.style.setProperty('--px', `${planks.offsetLeft + b.offsetWidth}px`);
    paw.classList.add('is-on');
  };

  const choose = (choice) => {
    if (closed) return;
    play('click');
    close();
    setTimeout(() => onStart?.(choice), 340);
  };
  // the boxes / settings slide in over the pond; the signpost steps aside meanwhile
  const stepAside = (on) => { away = on; el.classList.toggle('tm--away', on); if (on) pointAt(null); };
  function openBoxes() {
    stepAside(true);
    import('./SaveBoxes.js').then(({ openSaveBoxes }) => {
      if (closed) return;
      sub = openSaveBoxes(document.body, {
        sfx: play,
        onPick: (pick) => { sub = null; choose(pick); },
        onBack: () => { sub = null; stepAside(false); refocus('new'); },
      });
    }).catch((e) => { console.warn('save boxes failed', e); stepAside(false); });
  }
  function openSettingsPage() {
    stepAside(true);
    import('./SettingsScreen.js').then(({ openSettings }) => {
      if (closed) return;
      sub = openSettings({
        sfx: play,
        onClose: () => {
          sub = null;
          stepAside(false);
          soundOn = !(isMuted?.() ?? false); paintSnd();
          // saves may be gone ("delete all saves")
          if (contBtn && !anySave()) { contBtn.remove(); planks.querySelector('[data-c="new"]').repaint('NEW GAME', null, WOOD.green); }
          refocus('settings');
        },
      });
    }).catch((e) => { console.warn('settings failed', e); stepAside(false); });
  }
  const refocus = (c) => { const b = planks.querySelector(`[data-c="${c}"]`); b?.focus({ preventScroll: true }); pointAt(b); };

  for (const b of el.querySelectorAll('.tm-btn')) {
    b.addEventListener('pointerenter', () => { if (away) return; play('hover', { volume: 0.6 }); pointAt(b); });
    b.addEventListener('focus', () => { if (!away) pointAt(b); });
    b.addEventListener('click', () => {
      if (away || closed) return;
      const c = b.dataset.c;
      b.classList.remove('is-hit'); void b.offsetWidth; b.classList.add('is-hit');
      if (c === 'continue') choose({ slot: last, mode: 'continue' });
      else if (c === 'new') { play('click'); openBoxes(); }
      else if (c === 'settings') { play('click'); openSettingsPage(); }
    });
  }
  planks.addEventListener('pointerleave', () => { if (!planks.contains(document.activeElement)) pointAt(null); });
  const onKey = (e) => {
    if (away || closed) return;
    const list = [...planks.querySelectorAll('.tm-btn')];
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = i < 0 ? 0 : (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
      list[n].focus({ preventScroll: true });
      play('hover', { volume: 0.5 });
    } else if ((e.key === 'Enter' || e.key === ' ') && i < 0 && document.activeElement?.tagName !== 'BUTTON') {
      e.preventDefault();
      list[0]?.click();
    }
  };
  window.addEventListener('keydown', onKey);

  function close() {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey);
    sub?.close?.();
    el.classList.add('tm--out');
    setTimeout(() => el.remove(), 420);
  }
  return { close, el };
}
