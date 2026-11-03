// [v31 kinetic] Quest toasts (src/game/Quests.js calls showQuestToast): no boxes, the notebook's
// news floats over the pond in the kinetic pixel text (src/ui/kinetic/floatText.js).
//
//   kind 'new'          NEW QUEST + the quest title + the first step
//   kind 'side'         an ERRAND from a neighbour + its intro line
//   kind 'quest'        QUEST COMPLETE! (a shout) + the title + the reward in gold
//   kind 'chapter'      a big title card: CHAPTER N / the chapter's name / its tagline
//   kind 'chapterDone'  CHAPTER N COMPLETE in gold + the reward
//   kind 'daily'        TODAY'S GOALS + the three goals
//   kind 'dailyDone'    a goal ticked + its coins
// Toasts queue up so two never talk over each other.
import { floatAt, floatTitle, floatSize } from './kinetic/floatText.js';
import { noticePanel } from './kinetic/dialogue.js'; // [v31 dialogue]

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
let chain = Promise.resolve();
let queued = 0;

function rewardText(game, R) {
  try { return game.quests?.rewardText?.(R) || ''; } catch { return ''; }
}

function play(game, t) {
  const R = t.reward;
  switch (t.kind) {
    case 'new':
      game.audio?.play?.('stamp', { volume: 0.35 });
      return centred([
        { text: 'NEW QUEST', font: 'tiny', k: 2, fill: '#ffe066' },
        { text: t.title, font: 'bold', k: 2, style: 'excited', delay: 0.2 },
        { text: t.line, font: 'body', delay: 0.6 },
      ], 3600);
    case 'side':
      game.audio?.play?.('paper', { volume: 0.35 });
      return centred([
        { text: 'ERRAND', font: 'tiny', k: 2, fill: '#9de8ff' },
        { text: t.title, font: 'bold', k: 2, style: 'happy', delay: 0.2 },
        { text: t.line, font: 'body', delay: 0.6 },
      ], 3800);
    case 'quest': {
      const rw = rewardText(game, R);
      game.audio?.play?.('stamp', { volume: 0.45 });
      return centred([
        { text: 'QUEST COMPLETE!', font: 'bold', k: 2, style: 'shout' },
        { text: t.title, font: 'body', delay: 0.35 },
        rw ? { text: '+ ' + rw, font: 'bold', style: 'gold', delay: 0.7 } : null,
      ], 3400);
    }
    case 'dailyDone': {
      const rw = rewardText(game, R);
      return centred([
        { text: '✓ ' + t.title, font: 'body', style: 'happy' },
        rw ? { text: '+ ' + rw, font: 'bold', style: 'gold', delay: 0.3 } : null,
      ], 2600, 0.2);
    }
    case 'daily':
      return centred([
        { text: t.title, font: 'tiny', k: 2, fill: '#ffe066' },
        ...(t.lines || []).map((l, i) => ({ text: '• ' + l, font: 'body', delay: 0.3 + i * 0.25 })),
      ], 4200);
    case 'chapter': {
      const h = floatTitle({ kicker: `CHAPTER ${t.n}`, title: t.title, sub: t.line, style: 'shout', y: 0.24, ms: 3600 });
      return Promise.race([h.done, wait(6)]);
    }
    case 'chapterDone': {
      const rw = R?.text || rewardText(game, R);
      const h = floatTitle({ kicker: `CHAPTER ${t.n} COMPLETE`, title: t.title, sub: rw ? 'Unlocked: ' + rw : '', style: 'gold', y: 0.24, ms: 3200 });
      game.particles?.confetti?.(game.fox?.x || 0, (game.fox?.y || 0) + 1.6, game.fox?.z || 0, 50);
      return Promise.race([h.done, wait(6)]);
    }
    default:
      return centred([{ text: t.title, font: 'bold', k: 2 }, { text: t.line, font: 'body', delay: 0.3 }], 3000);
  }
}

// lines centred under each other near the top of the screen
async function centred(lines, ms, y = 0.13) {
  const { W, H } = floatSize();
  const L = lines.filter((x) => x && x.text);
  let top = Math.round(H * y);
  const hs = [];
  for (const l of L) {
    const k = l.k || 1;
    const maxW = Math.min(280, W - 24);
    const look = { font: l.font || 'body', k, ...(l.fill ? { fill: l.fill } : {}), maxW };
    const yy = top;
    const h = floatAt({ text: l.text, style: l.style || 'say', k, ms: ms - (l.delay || 0) * 1000, delay: l.delay || 0, look, fixed: (it) => [Math.round(W / 2 - it.W / 2), yy] });
    hs.push(h);
    top += h.height + 3;
  }
  // [v31 dialogue] the news sits on a pixel panel, never as loose words on the world
  const top0 = Math.round(H * y), boxW = Math.max(...hs.map((h) => h.width || 0)) + 22, boxH = top - top0 + 10;
  const off = noticePanel(() => ({ x: Math.round(W / 2 - boxW / 2), y: top0 - 8, w: boxW, h: boxH }));
  await Promise.race([Promise.all(hs.map((h) => h.done)), wait(ms / 1000 + 1.6)]);
  off();
}

/** a toast is playing or waiting (the director holds its scenes until they're done) */
export function questToastBusy() { return queued > 0; }

// never over a cinematic: wait (up to a minute) for the director's scene to end
async function idle(game) {
  for (let i = 0; i < 600 && (game.director?.active || game.cutscene?.active); i++) await wait(0.1);
}

export function showQuestToast(game, t) {
  if (!t) return;
  if (queued > 6) return; // a flood (old saves catching up): drop the rest
  queued++;
  chain = chain.then(() => idle(game)).then(() => play(game, t)).catch((e) => console.warn('[questToast]', e)).then(() => { queued--; return wait(0.15); });
}

