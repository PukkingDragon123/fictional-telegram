// Terraform preview: the extra paint tiles (tiled 3x3 at 3x) and the tool icons.
import { buildPaintAtlas, PAINT_TILES } from '../src/art/paintArt.js';
import { spriteImg } from '../src/ui/sprites.js';

const A = buildPaintAtlas();
for (const name of PAINT_TILES) {
  const r = A.tiles[name], cv = document.createElement('canvas');
  cv.width = cv.height = r.w * 3 * 3;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) c.drawImage(A.canvas, r.x, r.y, r.w, r.h, x * r.w * 3, y * r.h * 3, r.w * 3, r.h * 3);
  const box = document.createElement('div');
  box.append(cv, Object.assign(document.createElement('div'), { textContent: name }));
  document.getElementById('tiles').append(box);
}
document.getElementById('icons').innerHTML = ['tf_raise', 'tf_lower', 'tf_paint', 'tf_dig', 'tf_fill', 'tf_name'].map((n) => spriteImg(n, 4)).join('');
