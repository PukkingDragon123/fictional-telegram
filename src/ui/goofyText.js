// Comic words in TBME Goofy (the game font) painted straight from its bitmap
// glyphs (src/ui/goofyFont.js): crisp at any canvas size, no font loading.
// Used by the particle atlas (src/game/fxAtlas.js) and the title scene.
//
//   const { w, h } = comicWordSize('BONK!');            // canvas px incl. the outline
//   paintComicWord(ctx, x, y, 'BONK!', { fill, shade, ink });
//
// style 'split' (default): fill on the top half of the letters, shade below.
// style 'drop': the whole word in fill with a 1 px shade drop to the lower right.
// The ink outline is `pad` px thick all round, plus `drop` px extra underneath.
import { GOOFY_HI, goofyBitmap } from './goofyFont.js';

export function comicWordSize(text, { pad = 2, drop = 1 } = {}) {
  const bm = goofyBitmap(GOOFY_HI, text);
  return { w: bm.w + pad * 2 + 1, h: bm.h + pad * 2 + drop, bm };
}

export function paintComicWord(ctx, x, y, text, { fill = '#fff', shade = '#ccc', ink = '#000', pad = 2, drop = 1, style = 'split', split = 0.55 } = {}) {
  const { bm } = comicWordSize(text, { pad, drop });
  const ox = x + pad, oy = y + pad;
  const px = [];
  bm.rows.forEach((row, v) => { for (let u = 0; u < row.length; u++) if (row[u] === '#') px.push(u, v); });
  ctx.fillStyle = ink;
  for (let i = 0; i < px.length; i += 2) ctx.fillRect(ox + px[i] - pad, oy + px[i + 1] - pad, pad * 2 + 1, pad * 2 + 1 + drop);
  if (style === 'drop') {
    ctx.fillStyle = shade;
    for (let i = 0; i < px.length; i += 2) ctx.fillRect(ox + px[i] + 1, oy + px[i + 1] + 1, 1, 1);
    ctx.fillStyle = fill;
    for (let i = 0; i < px.length; i += 2) ctx.fillRect(ox + px[i], oy + px[i + 1], 1, 1);
    return;
  }
  const cut = 1 + Math.round(14 * split); // GOOFY_HI: caps span rows 1..15
  for (let i = 0; i < px.length; i += 2) {
    ctx.fillStyle = px[i + 1] < cut ? fill : shade;
    ctx.fillRect(ox + px[i], oy + px[i + 1], 1, 1);
  }
}
