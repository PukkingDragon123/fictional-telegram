// Plain-HTML version of the portfolio for browsers without WebGL (or when the
// 3D classroom fails to start). It is generated from content.js, so the words
// and media stay in sync with the classroom.
import { SITE, CHAPTERS, MEDIA } from './content.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plain = (s) => esc(String(s).replace(/\*\*/g, ''));

function mediaHTML(id) {
  const m = MEDIA[id];
  if (!m) return '';
  const cap = m.caption ? `<p class="note">${esc(m.caption)}${m.href ? ` · <a href="${esc(m.href)}" target="_blank" rel="noopener">itch.io</a>` : ''}</p>` : '';
  if (m.type === 'video') {
    return `<video controls muted loop playsinline preload="metadata" poster="${esc(m.poster || '')}">${m.sources.map(([s, t]) => `<source src="${esc(s)}" type="${esc(t)}">`).join('')}</video>${cap}`;
  }
  return `<img src="${esc(m.src)}" alt="${esc(m.caption || '')}" loading="lazy">${cap}`;
}

export function showFallback(why = '') {
  document.getElementById('pf-loading')?.remove();
  const shown = new Set();
  const body = CHAPTERS.map((c) => {
    const parts = [`<h2>${esc(c.title)}</h2>`];
    for (const st of c.steps) {
      if (st.say) parts.push(`<p>${plain(st.say)}</p>`);
      if (st.screen && st.screen !== 'hide' && !shown.has(st.screen)) { shown.add(st.screen); parts.push(mediaHTML(st.screen)); }
    }
    return parts.join('');
  }).join('');
  const el = document.createElement('div');
  el.className = 'pf-fallback';
  el.innerHTML = `<main>
    <h1>${esc(SITE.name.toUpperCase())}</h1>
    <p>${esc(SITE.tagline)} · ${esc(SITE.pill)}</p>
    <p class="note">The 3D classroom needs WebGL, which this browser could not start${why ? ` (${esc(why)})` : ''}. Here is the plain version.</p>
    <p><a href="${esc(SITE.contact.itch)}" target="_blank" rel="noopener">See my games on itch.io</a></p>
    ${body}
    <h2>Contact</h2>
    <p><a href="${esc(SITE.contact.itch)}" target="_blank" rel="noopener">${esc(SITE.contact.itch)}</a></p>
    ${SITE.contact.email ? `<p><a href="mailto:${esc(SITE.contact.email)}">${esc(SITE.contact.email)}</a></p>` : ''}
  </main>`;
  document.body.appendChild(el);
}
