// [v33 watch] The little paper tag that drops under the pocket watch on hover (or for a moment
// after a tap on a phone): the exact time, the feast countdown, the weather and the speed, in the
// game's bitmap pixel font. A luggage-tag shape with an eyelet and a string up to the watch.
import { pxTextBuf, hex } from '../kinetic/pxfont.js';
import { Buf, P } from './watchArt.js';

export const TAGC = { ink: '#3a2418', red: '#d0282a', blue: '#2c4ad0', green: '#2f8a2a', gold: '#a8621a', grey: '#8a7a6a' };

// lines: [[{ text, color }], ...] -> a Buf
export function buildTagBuf(lines) {
  const runs = [];
  lines.forEach((L, i) => {
    for (const r of L) runs.push({ text: r.text, color: hex(r.color || TAGC.ink) });
    if (i < lines.length - 1) runs.push({ text: '\n', color: hex(TAGC.ink) });
  });
  const txt = pxTextBuf(runs, { font: 'body', lineH: 9 });
  const padX = 5, padTop = 9, padB = 4, str = 6;
  const W = txt.w + padX * 2, Hp = txt.h + padTop + padB, H = Hp + str + 2;
  const b = new Buf(W, H);
  const top = str, cx = W >> 1, cut = 3;
  // the paper: a luggage tag, its top corners clipped
  for (let y = 0; y < Hp; y++) for (let x = 0; x < W; x++) {
    const c0 = y < cut ? cut - y : 0;
    if (x < c0 || x > W - 1 - c0) continue;
    const edge = y === 0 || y === Hp - 1 || x === c0 || x === W - 1 - c0;
    b.set(x, top + y, edge ? P.ink : y >= Hp - 3 ? P.paperSh : P.paper);
  }
  // a crisp shadow under it
  for (let x = 2; x < W; x++) { b.set(x, top + Hp, P.shadow); b.set(x, top + Hp + 1, P.shadow); }
  // the eyelet and the string up to the watch
  b.rows(['.ooo.', 'olllo', 'ol.lo', 'olllo', '.ooo.'], cx - 2, top + 1, { o: P.ink, l: P.g4 });
  for (let y = 0; y < top + 2; y++) b.set(cx, y, P.inkSoft);
  // the text
  for (let y = 0; y < txt.h; y++) for (let x = 0; x < txt.w; x++) {
    const c = txt.data[y * txt.w + x];
    if (c) b.set(padX + x, top + padTop + y - 2, c);
  }
  return b;
}

export function paintBuf(cv, b) {
  if (cv.width !== b.w) cv.width = b.w;
  if (cv.height !== b.h) cv.height = b.h;
  const ctx = cv.getContext('2d');
  const id = new ImageData(new Uint8ClampedArray(b.d.buffer.slice(0)), b.w, b.h);
  ctx.putImageData(id, 0, 0);
}
