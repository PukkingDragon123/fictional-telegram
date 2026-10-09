// [v26 seasons] Two extra bear face expressions, drawn with the BearFace kit:
//   cold  worried brows with frost on them, icy blue cheeks, a red nose glow and
//         chattering teeth (the frames alternate clenched / apart)
//   hot   droopy half-closed eyes, flushed cheeks, sweat running down the temple
//         and the tongue hanging out (panting)
// Registered at import time into FACE_INFO / FACE_DRAW (src/entities/bearFace.js).
import { FACE_INFO, FACE_EXPRESSIONS, FACE_DRAW } from '../../entities/bearFace.js';

const EYE_HALF = ['KKKKK', 'KKKKK', '.KKK.'];

function cold(F, st) {
  F.lensUnder();
  if (st.blink) F.blinkEyes(st);
  else {
    F.openEyes(st, { pupil: true });
    // shivery little pupils: the highlight jumps between frames
    if (!st.cub && st.frame % 2) { F.px(6, 6, 'W'); F.px(19, 6, 'W'); }
  }
  // worried brows, frosted on top
  F.pair(['....BB.', '..BBB..', 'BBB....'], 2, 1);
  F.pair(['....LL.', '..L....'], 2, 0);
  // icy cheeks
  F.pair(['.cc', 'cCc', '.c.'], 0, 10);
  F.eyewear('sad');
  // red nose: the muzzle around the nose glows
  F.u(3, 1, 'R'); F.u(10, 1, 'R'); F.u(4, 2, 'R'); F.u(5, 2, 'R'); F.u(8, 2, 'R'); F.u(9, 2, 'R');
  F.u(3, 0, 'r'); F.u(10, 0, 'r');
  // chattering teeth
  const apart = st.frame % 2 === 0;
  for (let x = 2; x <= 11; x++) F.u(x, 5, 'H');
  F.u(2, 4, 'M'); F.u(11, 4, 'M'); F.u(6, 4, 'M'); F.u(7, 4, 'M');
  for (let x = 1; x <= 8; x++) F.l(x, 0, apart ? 'I' : 'H');
  if (apart) for (let x = 2; x <= 7; x++) F.l(x, 1, 'H');
  for (const x of [4, 9]) F.u(x, 5, 'M');
  F.l2(0, 0, 'M');
  if (!apart) { F.l(3, 0, 'M'); F.l(6, 0, 'M'); }
}

function hot(F, st) {
  F.lensUnder();
  if (st.blink) F.blinkEyes(st);
  else {
    F.spr(EYE_HALF, 4, 6); F.spr(EYE_HALF, 17, 6, true);
    F.px(5, 6, 'W'); F.px(18, 6, 'W');
  }
  // tired brows
  F.pair(['BBBB...', '....BB.'], 2, 3);
  F.blush(true);
  F.eyewear('sleepy');
  // sweat drop running down the temple
  const f = st.frame % 6;
  F.e(23, 1 + f, 'c'); F.e(23, 2 + f, 'C'); F.e(22, 3 + f, 'C'); F.e(24, 3 + f, 'C'); F.e(23, 3 + f, 'C');
  F.e(2, 2 + ((f + 3) % 6), 'C'); F.e(2, 3 + ((f + 3) % 6), 'c');
  // panting, tongue out
  F.openTop({ fangs: false });
  F.lowerLip({ tongue: true });
  const sw = st.frame % 4 < 2 ? 0 : 1;
  F.l(4 + sw, 1, 'T'); F.l(5 + sw, 1, 'T'); F.l(4 + sw, 2, 'T'); F.l(5 + sw, 2, 't'); F.l(4 + sw, 3, 't'); F.l(5 + sw, 3, 'T');
}

FACE_INFO.cold = { jaw: 0.1, blink: true, anim: true };
FACE_INFO.hot = { jaw: 0.5, blink: true, anim: true };
if (FACE_DRAW) { FACE_DRAW.cold = cold; FACE_DRAW.hot = hot; }
for (const k of ['cold', 'hot']) if (!FACE_EXPRESSIONS.includes(k)) FACE_EXPRESSIONS.push(k);

export const SEASON_FACES = ['cold', 'hot'];
