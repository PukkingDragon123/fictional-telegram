// [v26 faces3d] Character faces are never 2D: every Reynard / bear / beaver face the
// UI shows is a render of the real 3D rig. src/ui/faces3d.js installs itself here at
// import time; the light 2D modules (sprites.js, Chalkboard.js, bagArt.js...) only
// import this tiny registry, so they don't pull three.js + the rigs in.
//
//   FACE3D.test(name)                 -> true for a character-face sprite name
//   FACE3D.sprite(name, w, h)         -> { canvas, url } (cached) or null (no WebGL)
//   FACE3D.canvas(spec, w, h)         -> <canvas> (cached) or null; spec: see faces3d.js
//   FACE3D.chalk(name, rows)          -> chalk doodle rows traced from a 3D render, or null
export const FACE3D = { test: null, sprite: null, canvas: null, chalk: null };

/** True once the 3D face renderer is installed (and WebGL works). */
export const face3dReady = () => !!FACE3D.canvas;
