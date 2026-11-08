// [v33 title] The credits roll, played over the title cinematic from the menu's CREDITS plank.
//
// The menu steps aside, the game's letterbox bars slide in, and the title scene cuts to a quiet
// shot: Reynard sitting on his crate by the pond, counting coins (HeistScene listens for the
// 'tbme-title-credits' window event). The credits float in one card at a time in the game's own
// title-card style (src/ui/kinetic/floatText.js floatTitle: a small kicker, the name in Alagard,
// a line in the marker hand), the same cards chapters, bosses and secrets use. A tap anywhere,
// Esc / Enter / Space or the BACK plank ends it and the menu comes back.
//
//   const c = playCredits({ sfx, onClose });   c.close();
import { floatTitle, clearFloats } from '../../ui/kinetic/floatText.js';
import { arrowPlank, scaleEl } from '../../ui/titleArt.js';

// the cards: content from the Settings credits page and src/assets/fonts/FONTS_LICENSE.txt
export const CREDIT_CARDS = [
  { kicker: 'A Reynard production', title: 'The Bear Must Eat', sub: 'Produced, directed and owned by Reynard. Mostly.', style: 'gold', ms: 4200 },
  { kicker: 'Design and art', title: 'Made in Code', sub: 'Every voxel, sprite and sound. No bought art.', ms: 3800 },
  { kicker: 'Music and sound', title: 'Live Synth', sub: 'Played live in your browser.', ms: 3400 },
  { kicker: 'Built with', title: 'three.js + Vite', sub: 'Both MIT licensed.', ms: 3400 },
  { kicker: 'Game font', title: 'TBME Goofy', sub: 'From Chewy by Font Diner / Sideshow, Apache 2.0', ms: 4200 },
  { kicker: 'Title letters', title: 'Alagard', sub: 'By Hewett Tsoi, free to use with credit', ms: 3800 },
  { kicker: 'Lab letters', title: 'Silkscreen + Pixelify', sub: 'By their authors, SIL Open Font License 1.1', ms: 4000 },
  { kicker: 'Special thanks', title: 'The Bears', sub: 'For eating everything. Even the cameras.', style: 'happy', ms: 3600 },
  { kicker: 'Special thanks', title: 'Moose Express', sub: 'He pedals like his rent is due.', style: 'happy', ms: 3400 },
  { kicker: 'Special thanks', title: 'Gerald', sub: "The lure. Don't look at him.", style: 'happy', ms: 3400 },
  { kicker: 'Legal', title: 'No Fish Were Harmed', sub: 'Several were eaten. Different thing.', ms: 3800 },
  { kicker: 'And most of all', title: 'You', sub: 'Now go feed a bear.', style: 'gold', ms: 4400 },
];

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));

export function playCredits({ sfx, onClose } = {}) {
  const play = (n, o) => { try { sfx?.(n, o); } catch { /* optional */ } };
  let done = false;
  const S = window.innerWidth < 560 || window.innerHeight < 520 ? 2 : 3;
  // a full-screen catcher (a tap anywhere ends the roll) with the BACK plank
  const el = document.createElement('div');
  el.className = 'tcr';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Credits');
  el.innerHTML = '<button class="tcr-back" aria-label="Back to the menu"></button>';
  const back = el.querySelector('.tcr-back');
  back.appendChild(scaleEl(arrowPlank('BACK', null, { dir: -1, minW: 44, seed: 5 }), S));
  back.style.setProperty('--u', `${S}px`);
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('tcr--in'));
  document.body.classList.add('cine'); // the game's letterbox bars
  window.dispatchEvent(new CustomEvent('tbme-title-credits', { detail: { on: true } }));

  const close = () => {
    if (done) return;
    done = true;
    el.style.pointerEvents = 'none';
    window.removeEventListener('keydown', onKey, true);
    clearFloats((it) => it.cine);
    document.body.classList.remove('cine');
    window.dispatchEvent(new CustomEvent('tbme-title-credits', { detail: { on: false } }));
    el.classList.remove('tcr--in');
    setTimeout(() => el.remove(), 380);
    try { onClose?.(); } catch (e) { console.warn(e); }
  };
  const onKey = (e) => {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); play('click'); close(); }
  };
  window.addEventListener('keydown', onKey, true);
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); play('click'); close(); });
  back.addEventListener('pointerenter', () => play('hover', { volume: 0.5 }));

  // the roll: one card at a time, the scene breathing behind
  (async () => {
    await wait(0.9);
    for (const c of CREDIT_CARDS) {
      if (done) return;
      const h = floatTitle({ force: true, cine: true, kicker: c.kicker, title: c.title, sub: c.sub, style: c.style || 'say', y: 0.14, ms: c.ms });
      if (c.style === 'gold') play('coin', { volume: 0.25, pitch: 1.3 });
      // one card at a time: wait until it has floated away (a slow device just takes longer)
      await Promise.race([h.done, wait(c.ms / 1000 * 3 + 4)]);
      if (done) return;
      clearFloats((it) => it.cine);
      await wait(0.4);
    }
    await wait(0.8);
    close();
  })();
  return { close, el };
}
