// [v26 demo] The end of the demo: a wooden board ("Thanks for playing the demo!"),
// Reynard live in a brass frame doing the sales pitch, a parchment list of what the
// full game has, a receipt of your five days, the bears queueing along the bottom,
// and two planks: GET THE FULL GAME (DEMO_STORE_URL) and PLAY AGAIN (a fresh demo).
//
//   const end = showDemoEnd(game, { onRestart, storeUrl, lastDay });   end.close()
import { injectPaperCSS } from '../ui/paper.js';
import { spriteImg, hasSprite, foxPortraitURL } from '../ui/sprites.js';
import { createFoxTalk } from '../ui/FoxTalk3D.js';
import CSS from './endscreen.css?inline';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(+n || 0).toLocaleString('en-US');

// what's waiting in the full game (icon, headline, the small print)
const FULL_GAME = [
  ['fish', 'Trout, salmon, sturgeon', 'Three more fish sections, up to the Sabertooth Salmon.'],
  ['rs_tub', 'The Bear Resort', 'Paths, a ticket booth, hot tubs and a gift shop. Bears pay to relax.'],
  ['pickaxe', 'Flint & Steel', 'Mine ore with Flint the badger, then smelters, power and factories.'],
  ['xp_compass', 'The Deepwood Expedition', 'A rope bridge, the Fallen Giant, and who lives behind the falls.'],
  ['season_winter', 'Four seasons', 'Snow, storms and heat waves. Cold bears huddle by the fire.'],
  ['picnic', 'No day limit', 'The Bear Diner, woodworking, every neighbour and every feast.'],
];

// Reynard's pitch, a line every few seconds
const PITCH = [
  ['proud', 'Five days! Five glorious, profitable days.'],
  ['greedy', 'And the bears are STILL hungry. Do you know what that means?'],
  ['scheming', 'Trout. Salmon. A hot tub. For BEARS. I have plans, partner.'],
  ['wink', 'Get the full game. My retirement depends on it.'],
];

const BEARS = ['office', 'construction', 'grandma', 'cub', 'hipster', 'lumberjack'];

function icon(name, scale = 2) {
  for (const n of [name, 'fish']) if (hasSprite(n)) return spriteImg(n, scale, 'dm-ico');
  return '';
}

export function showDemoEnd(game, { onRestart, storeUrl = '', lastDay = 5 } = {}) {
  injectPaperCSS();
  if (!document.getElementById('dm-css')) {
    const st = document.createElement('style');
    st.id = 'dm-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const st = game.state, stats = game.stats || {};
  const bears = BEARS.map((id, i) => {
    let src = '';
    try { src = game.ui?.icons?.bear?.(id, true) || ''; } catch { src = ''; }
    return src ? `<img class="dm-bear" style="--i:${i}" src="${src}" alt="">` : '';
  }).join('');
  const el = document.createElement('div');
  el.className = 'dm-end';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'End of the demo');
  el.innerHTML = `
    <div class="dm-stage">
      <header class="dm-board paper paper--wood">
        <i class="dm-nail" style="left:10px"></i><i class="dm-nail" style="right:10px"></i>
        <h1>Thanks for playing the demo!</h1>
        <p>${lastDay} days at Reynard's pond, and the bears are still hungry.</p>
      </header>
      <section class="dm-fox">
        <div class="dm-frame"><div class="dm-pic"><img class="dm-fallback" src="${foxPortraitURL('laugh', 4)}" alt="Reynard"></div></div>
        <div class="dm-say paper paper--cream"><b>REYNARD</b><span class="dm-line"></span></div>
      </section>
      <section class="dm-list paper paper--parchment">
        <h2>In the full game</h2>
        <ul>${FULL_GAME.map(([ic, t, s]) => `<li>${icon(ic)}<span><b>${esc(t)}</b><small>${esc(s)}</small></span></li>`).join('')}</ul>
      </section>
      <footer class="dm-foot">
        <div class="dm-receipt paper paper--receipt paper--zig">
          <b>YOUR ${lastDay} DAYS</b>
          <div><span>Bears served</span><i>${fmt(stats.bearsServed)}</i></div>
          <div><span>Fish eaten</span><i>${fmt(stats.fishEaten)}</i></div>
          <div><span>Fry hatched</span><i>${fmt(stats.hatched)}</i></div>
          <div><span>Species found</span><i>${fmt(st.discovered?.length)}</i></div>
          <div class="dm-tot"><span>Coins earned</span><i>${fmt(st.totalEarned)}</i></div>
          <em>Reynard's cut: 100%</em>
        </div>
        <div class="dm-queue">${bears}</div>
        <div class="dm-btns">
          <a class="dm-btn dm-buy" href="${esc(storeUrl || '#')}" target="_blank" rel="noopener">Get the full game</a>
          <button type="button" class="dm-btn dm-again paper paper--wood">Play again</button>
        </div>
      </footer>
    </div>`;
  document.body.appendChild(el);
  const play = (n, v = 0.4) => { try { game.audio?.play(n, { volume: v }); } catch { /* optional */ } };

  // Reynard, live (falls back to his pixel portrait without WebGL)
  let ft = null;
  const pic = el.querySelector('.dm-pic');
  try { ft = createFoxTalk(pic, { outfit: game.fox?.rig?.outfit || 'default', game, turn: 0.22 }); } catch (e) { console.warn('[demo] fox', e); ft = null; }
  if (ft) pic.classList.add('is-live');
  const line = el.querySelector('.dm-line');
  let li = 0, timer = 0, typer = 0;
  const say = () => {
    const [expr, text] = PITCH[li];
    if (++li >= PITCH.length) clearInterval(timer); // the pitch ends on the sales line
    try { ft?.setExpression(expr); ft?.talk(text); } catch { /* optional */ }
    clearInterval(typer);
    const t0 = performance.now();
    line.textContent = '';
    typer = setInterval(() => { const n = Math.ceil((performance.now() - t0) / 28); line.textContent = text.slice(0, n); if (n >= text.length) clearInterval(typer); }, 30);
  };
  setTimeout(() => { if (!el.isConnected) return; say(); timer = setInterval(say, 4600); }, 900);

  el.querySelector('.dm-buy').addEventListener('click', (e) => {
    play('coins', 0.5);
    if (!storeUrl) e.preventDefault();
  });
  el.querySelector('.dm-again').addEventListener('click', () => { play('click'); onRestart?.(); });
  for (const b of el.querySelectorAll('.dm-btn')) b.addEventListener('pointerenter', () => play('hover', 0.25));

  const close = () => {
    clearInterval(timer); clearInterval(typer);
    try { ft?.dispose(); } catch { /* ignore */ }
    el.remove();
  };
  return { el, close };
}
