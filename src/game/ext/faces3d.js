// [v26 faces3d] "When using a character face never use 2D": installs the 3D face renderer
// (src/ui/faces3d.js) behind every character-face sprite, chalk doodle and notebook doodle.
// Importing it is the install; game.faces3d exposes the helpers for other systems:
//   game.faces3d.img({ who: 'bear', type: 'critic', expr: 'happy' }, 40) -> '<img>' HTML
//   game.faces3d.canvas(spec, w, h) / game.faces3d.url(spec, w, h)
import { faceCanvas, faceURL, faceImg, spriteFaceSpec } from '../../ui/faces3d.js';

export function install() {
  return { canvas: faceCanvas, url: faceURL, img: faceImg, specOf: spriteFaceSpec };
}
