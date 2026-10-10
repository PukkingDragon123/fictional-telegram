// [v26 turtle] The Long Talk's timeline. SPEECH (data/longneck.js) is split into
// tokens (words and his spoken "..." pauses); every token gets a start time in
// "units" (a word = 1, a "..." a bit more, a breath after each sentence, a long
// pause between paragraphs). The whole talk is stretched so the last word lands
// exactly LONG_TALK_DAYS in-game days after the first one.
import { SPEECH, LONG_TALK_DAYS } from '../../data/longneck.js';

export const TALK_HOURS = LONG_TALK_DAYS * 24;

function build() {
  const T = [];
  let u = 0;
  SPEECH.forEach((para, p) => {
    for (const w of para.split(/\s+/).filter(Boolean)) {
      T.push({ w, p, at: u, pause: w === '...' });
      u += w === '...' ? 1.5 : 1;
      if (w !== '...' && /[.?!:]$/.test(w)) u += 1.2; // a breath after a sentence
    }
    u += 4; // a long think between paragraphs
  });
  const U = T[T.length - 1].at;
  for (const t of T) t.h = (t.at / U) * TALK_HOURS; // in-game hours after the start
  return T;
}
export const TOKENS = build();
export const N_TOKENS = TOKENS.length;
export const N_WORDS = TOKENS.filter((t) => !t.pause).length;
export const N_PARAS = SPEECH.length;

/** How many tokens he has said after `hours` of talking (0..N_TOKENS). */
export function spokenAt(hours) {
  if (hours < 0) return 0;
  let lo = 0, hi = N_TOKENS;
  while (lo < hi) { const m = (lo + hi) >> 1; if (TOKENS[m].h <= hours + 1e-9) lo = m + 1; else hi = m; }
  return lo;
}
/** Real words (not pauses) among the first n tokens. */
export function wordsIn(n) { let c = 0; for (let i = 0; i < n && i < N_TOKENS; i++) if (!TOKENS[i].pause) c++; return c; }
/** In-game hours until token n lands (Infinity when done). */
export function hoursOf(n) { return n < N_TOKENS ? TOKENS[n].h : Infinity; }

/** What his bubble shows after n tokens: the current paragraph so far, trimmed to the last ~max characters. */
export function bubbleText(n, max = 92) {
  if (n <= 0) return '...';
  const p = TOKENS[n - 1].p;
  const words = [];
  for (let i = 0; i < n; i++) if (TOKENS[i].p === p) words.push(TOKENS[i].w);
  let text = words.join(' ');
  if (text.length > max) {
    // start at the first sentence that lets the rest fit; else cut words off the front
    const end = (w) => w !== '...' && /[.?!:]$/.test(w);
    let k = -1;
    for (let i = 1; i < words.length; i++) if (end(words[i - 1]) && words.slice(i).join(' ').length <= max) { k = i; break; }
    if (k < 0) { k = 0; while (k < words.length - 1 && words.slice(k).join(' ').length > max - 4) k++; }
    text = (k > 0 && !end(words[k - 1]) ? '... ' : '') + words.slice(k).join(' ');
  }
  return text;
}

/** The transcript so far: [[paragraph text], ...] for the first n tokens. */
export function transcript(n) {
  const out = [];
  for (let i = 0; i < n && i < N_TOKENS; i++) {
    const t = TOKENS[i];
    (out[t.p] ||= []).push(t.w);
  }
  return out.map((a) => (a ? a.join(' ') : ''));
}
