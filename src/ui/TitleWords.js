// [v27 title] TitleWords: the title as FLOATING WORDS over the pond.
//
// "THE BEAR MUST EAT" in chunky voxel letters extruded from the game's pixel
// title font (GOOFY_HI = TBME Title's own glyphs): warm gold / orange faces,
// burnt-orange extruded sides, an ink outline and a drop shadow (post pass, the
// game's pixel look). Every letter floats on its own: a slow bob, a sway that
// shows its sides, a wave running through the words, now and then a hop-wave.
// Letters squash-bounce and sparkle when hovered / tapped. Pixel butterflies
// flutter around and land on the letters. Every so often a real 3D bear (the
// game's BearRig, see titleWordsBear.js) pops up behind the words and eats a
// bite out of one; the letter grows back voxel by voxel.
//
// One small three.js canvas over the logo area, rendered low-res (whole device
// pixels per art pixel, uiScale.js) and shown pixelated; pointer input only hits
// the letters / butterflies (the canvas itself never takes pointer events).
//
//   const w = createTitleWords(menuEl, { sfx })   // null without WebGL: keep the wooden board
//   w.leave()     -> Promise: letters float up and away, then everything is disposed
//   w.dispose()   immediate
//   window.__titleWords.bite({ letter: 5, kind: 'chomp' | 'nibble' | 'gulp' | 'miss' })   (tests)
//
// Layout: the menu keeps `.tm-sign > h1.tm-logo` as the words' box (the signpost
// sits under it, the demo ribbon hangs from it); this module sizes that box.
import * as THREE from 'three';
import { GOOFY_HI, goofyGlyph } from './goofyFont.js';
import { dpr as devRatio, viewSize } from './uiScale.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const easeOutBack = (t, s = 1.70158) => { t = clamp01(t) - 1; return 1 + t * t * ((s + 1) * t + s); };
const easeOut = (t) => 1 - (1 - clamp01(t)) ** 3;
const easeIn = (t) => clamp01(t) ** 2.4;

const LINES = ['THE BEAR', 'MUST EAT'];
const LH = 17; // line box in voxels (the font's caps hop; a few glyphs hang one row lower)
const GAP = 3; // between the lines
const SPACE = 6;
const CAM_D = 150; // camera distance (voxel units); 1 voxel = V css px on the z = 0 plane
const LINE1_Z = -14; // the first line floats further back (the bear can come up between the lines)
// line palettes: like the old board's text (gold over orange, then orange over deep orange)
const PAL = [
  { hi: '#fff4c6', top: '#ffe08a', low: '#ffb84a', bot: '#f0922e', side: '#d0702c', core: '#fff6d8', bite: '#e8a050' },
  { hi: '#ffe4ae', top: '#ffc070', low: '#ff8a3a', bot: '#e4662a', side: '#c0522a', core: '#ffecc8', bite: '#e88a48' },
];

/** voxel size etc. for the current screen: P device px per art pixel (whole), V css px per voxel (2 art px) */
export function wordsMetrics() {
  const { w, h } = viewSize();
  const small = w < 560 || h < 520;
  const ratio = devRatio();
  const P = Math.max(1, Math.round((small ? 1.34 : 2) * ratio));
  const p = P / ratio;
  return { P, p, V: 2 * p, ratio, small };
}

// ------------------------------------------------------------------ glyphs -> voxel letters
let DATA = null;
function wordsData() {
  if (DATA) return DATA;
  const lines = LINES.map((str, li) => {
    const letters = [];
    let x = 0, inkR = 0;
    for (const ch of str) {
      if (ch === ' ') { x += SPACE; continue; }
      const rows = goofyGlyph(GOOFY_HI, ch);
      const w = rows[0].length;
      const on = (u, v) => v >= 0 && v < rows.length && u >= 0 && u < w && rows[v][u] === '#';
      const vox = [];
      let minU = 99, maxU = -1, minY = 99, maxY = -99;
      rows.forEach((row, v) => {
        for (let u = 0; u < w; u++) {
          if (row[u] !== '#') continue;
          const y = LH - 1 - v;
          // front colour: highlight on top edges (upper half), shade on bottom edges (lower half)
          const upper = v < 9;
          const tone = upper ? (on(u, v - 1) ? 'top' : 'hi') : (on(u, v + 1) ? 'low' : 'bot');
          vox.push({ u, y, tone });
          minU = Math.min(minU, u); maxU = Math.max(maxU, u); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      });
      letters.push({ ch, line: li, x, w, vox, minU, maxU, minY, maxY });
      inkR = x + maxU + 1;
      x += w;
    }
    return { letters, w: inkR };
  });
  const W = Math.max(...lines.map((l) => l.w));
  const H = LH * 2 + GAP;
  const list = [];
  lines.forEach((ln, li) => {
    const left = -W / 2 + Math.floor((W - ln.w) / 2) + li; // line 2 one voxel right, like the board
    const base = li === 0 ? H / 2 - LH : H / 2 - LH * 2 - GAP; // y of the line box's bottom row
    for (const L of ln.letters) {
      const cx = (L.minU + L.maxU + 1) / 2;
      L.bx = left + L.x + cx; // pivot: bottom centre of the ink
      L.by = base + L.minY;
      L.lx = L.vox.map((v) => v.u + 0.5 - cx);
      L.ly = L.vox.map((v) => v.y + 0.5 - L.minY);
      L.hw = (L.maxU - L.minU + 1) / 2; // half width
      L.hh = L.maxY - L.minY + 1; // height
      L.lineBase = base;
      // the lines float at different depths ("THE BEAR" behind "MUST EAT"), sized to look the same
      L.z = li === 0 ? LINE1_Z : 0;
      L.k = (CAM_D - L.z) / CAM_D;
      list.push(L);
    }
  });
  DATA = { list, W, H, lineBase: [H / 2 - LH, H / 2 - LH * 2 - GAP], lineTop: [H / 2, H / 2 - LH - GAP], lineZ: [LINE1_Z, 0] };
  return DATA;
}

// ------------------------------------------------------------------ post: ink outline + creases + drop shadow
const VERT = 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 size; uniform vec3 ink; uniform vec4 shade;
uniform float cNear; uniform float cFar; uniform float crease; uniform vec4 glow;
varying vec2 vUv;
float A(vec2 o) { return texture2D(tColor, vUv + o).a; }
float b2(vec2 q) { return mod(2.0 * q.x + 3.0 * q.y, 4.0); }
float bayer4(vec2 p) { vec2 f = floor(p); return (4.0 * b2(mod(f, 2.0)) + b2(mod(floor(f * 0.5), 2.0)) + 0.5) / 16.0; }
float Z(vec2 o) { return -perspectiveDepthToViewZ(texture2D(tDepth, vUv + o).x, cNear, cFar); }
void main() {
  vec2 px = 1.0 / size;
  vec4 c = texture2D(tColor, vUv);
  if (c.a < 0.5) {
    float n = max(max(A(vec2(px.x, 0.0)), A(vec2(-px.x, 0.0))), max(A(vec2(0.0, px.y)), A(vec2(0.0, -px.y))));
    if (n > 0.5) gl_FragColor = vec4(ink, 1.0);
    else {
      // drop shadow down-right: the outlined shape, 2 px over and 2 px down
      vec2 o = vec2(-2.0 * px.x, 2.0 * px.y);
      float s = max(max(A(o), max(A(o + vec2(px.x, 0.0)), A(o - vec2(px.x, 0.0)))), max(A(o + vec2(0.0, px.y)), A(o - vec2(0.0, px.y))));
      if (s > 0.5) gl_FragColor = shade;
      else {
        // a warm, dithered halo so the words read over the busy pond
        float g = 0.0;
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.7853982;
          vec2 d = vec2(cos(a), sin(a)) * px;
          g += A(d * 3.0) + A(d * 5.5) * 0.7;
        }
        g /= 13.6;
        gl_FragColor = g * glow.a > bayer4(gl_FragCoord.xy) ? vec4(glow.rgb, 0.34) : vec4(0.0);
      }
    }
  } else {
    float z = Z(vec2(0.0));
    float zn = min(min(Z(vec2(px.x, 0.0)), Z(vec2(-px.x, 0.0))), min(Z(vec2(0.0, px.y)), Z(vec2(0.0, -px.y))));
    vec3 col = c.rgb;
    if (z - zn > crease) col = mix(col, ink, 0.75);
    gl_FragColor = vec4(col, 1.0);
  }
  #include <colorspace_fragment>
}`;

// pixel stars as points (drawn after the post pass: no outline), always an odd number of px across
const SPARK_VERT = /* glsl */ `
attribute float aSize; attribute vec3 aColor; varying vec3 vC; varying float vS;
void main() { vC = aColor; vS = aSize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize; }`;
const SPARK_FRAG = /* glsl */ `
varying vec3 vC; varying float vS;
void main() {
  float n = vS; if (n < 1.0) discard;
  float r = floor(n * 0.5);
  vec2 q = abs(floor(gl_PointCoord * n) - r);
  bool on = (q.x < 0.5 && q.y <= r) || (q.y < 0.5 && q.x <= r) || (r >= 2.0 && q.x + q.y < 1.5);
  if (!on) discard;
  gl_FragColor = vec4(q.x + q.y < 0.5 ? vec3(1.0) : vC, 1.0);
  #include <colorspace_fragment>
}`;

// a unit box with baked per-face shading (vertex colours; the instance colour multiplies)
function shadedBox() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const F = [0.8, 0.86, 1.0, 0.62, 1.0, 0.55]; // +x -x +y -y +z -z
  const col = new Float32Array(24 * 3);
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) col.set([F[f], F[f], F[f]], (f * 4 + k) * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ------------------------------------------------------------------ butterfly wings (pixel art)
const BUTTERFLY_PALS = [
  { main: '#ff9a2a', light: '#ffc864', edge: '#2a1418', dot: '#fff4dc', body: '#2a1418' }, // monarch
  { main: '#4aa8ff', light: '#a6e0ff', edge: '#1a2650', dot: '#e8f8ff', body: '#22223a' }, // sky blue
  { main: '#ffe04a', light: '#fff8b0', edge: '#7a5a14', dot: '#ffffff', body: '#3a2a10' }, // lemon
  { main: '#ff7ac4', light: '#ffc6e6', edge: '#5a1648', dot: '#fff0fa', body: '#3a1430' }, // pink
];
function wingTexture(pal) {
  const S = 12, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const inF = (x, y) => { const dx = (x - 5.6) / 5.6, dy = (y - 4.2) / 4.0; const a = -0.35, rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a); return rx * rx + ry * ry; };
  const inH = (x, y) => { const dx = (x - 3.6) / 3.7, dy = (y - 8.6) / 3.2; return dx * dx + dy * dy; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = x + 0.5, py = y + 0.5;
    const f = inF(px, py), h = inH(px, py);
    let col = null;
    if (f < 1) col = f > 0.62 ? pal.edge : f < 0.25 && px < 5 ? pal.light : pal.main;
    else if (h < 1) col = h > 0.6 ? pal.edge : pal.main;
    if (!col) continue;
    // white dots in the dark margins, a vein from the hinge
    if (col === pal.edge && ((x + y * 3) % 5 === 0)) col = pal.dot;
    if (x === 1 && y > 2 && y < 9) col = pal.edge;
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ================================================================== the words
export function createTitleWords(menuEl, { sfx = null, reduced = null } = {}) {
  const sign = menuEl?.querySelector('.tm-sign');
  const logo = menuEl?.querySelector('.tm-logo');
  if (!sign || !logo) return null;
  let r;
  try {
    r = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: false, stencil: false });
    if (!r.getContext()) throw new Error('no gl');
  } catch (e) { console.warn('TitleWords: no WebGL', e); return null; }
  if (reduced == null) reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const play = (n, o) => { try { sfx?.(n, o); } catch { /* audio is optional */ } };
  r.setPixelRatio(1);
  r.setClearColor(0x000000, 0);
  r.autoClear = false;
  const cv = r.domElement;
  cv.className = 'tmw-gl';
  cv.setAttribute('aria-hidden', 'true');
  let lost = false;
  const onLost = (e) => { e.preventDefault(); lost = true; };
  cv.addEventListener('webglcontextlost', onLost);
  menuEl.insertBefore(cv, menuEl.firstChild);

  const D = wordsData();
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xfff2e4, 2.0));
  const key = new THREE.DirectionalLight(0xfff0d8, 1.55); key.position.set(-0.4, 0.62, 1); scene.add(key);
  const cam = new THREE.PerspectiveCamera(20, 1, 40, 320);
  cam.position.set(0, 0, CAM_D);
  cam.updateMatrixWorld();

  const rt = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  rt.depthTexture = new THREE.DepthTexture(4, 4);
  const post = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
    uniforms: {
      tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, size: { value: new THREE.Vector2(4, 4) },
      ink: { value: new THREE.Color('#1e0c10') }, shade: { value: new THREE.Vector4(0.03, 0.006, 0.025, 0.42) },
      cNear: { value: cam.near }, cFar: { value: cam.far }, crease: { value: 2.0 }, glow: { value: new THREE.Vector4(1, 0.82, 0.5, 1.7) },
    },
  });
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const postScene = new THREE.Scene();
  const postMesh = new THREE.Mesh(tri, post); postMesh.frustumCulled = false; postScene.add(postMesh);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // ---------------------------------------------------------------- layout (css px <-> voxel units)
  let M = wordsMetrics(), V = M.V;
  const view = { cx: 0, cy: 0, left: 0, top: 0, w: 1, h: 1, bounds: { x0: -60, x1: 60, y0: -30, y1: 30 } };
  function layout() {
    M = wordsMetrics(); V = M.V;
    const boxW = Math.round((D.W + 6) * V), boxH = Math.round((D.H + 3) * V);
    logo.style.width = `${boxW}px`;
    logo.style.height = `${boxH}px`;
    sign.style.setProperty('--w', `${boxW}px`);
    menuEl.style.setProperty('--bh', `${boxH}px`);
    const bx = sign.offsetLeft + logo.offsetLeft, by = sign.offsetTop + logo.offsetTop; // unaffected by the step-aside translate
    const cx = bx + boxW / 2, cy = by + boxH / 2 + 0.5 * V;
    const { w: vw, h: vh } = viewSize();
    const g = M.p; // css px per art pixel
    let l = Math.max(0, cx - boxW / 2 - 22 * V), rgt = Math.min(vw, cx + boxW / 2 + 22 * V);
    let t = 0, b = Math.min(vh, by + boxH + 20 * V); // from the top of the screen: the bear's head may come up that far
    l = Math.floor(l / g + 1e-6) * g; t = Math.floor(t / g + 1e-6) * g;
    const pw = Math.max(8, Math.ceil((rgt - l) / g - 1e-6)), ph = Math.max(8, Math.ceil((b - t) / g - 1e-6));
    const cw = pw * g, ch = ph * g;
    Object.assign(view, { cx, cy, left: l, top: t, w: cw, h: ch });
    cv.style.left = `${l}px`; cv.style.top = `${t}px`;
    cv.style.width = `${cw}px`; cv.style.height = `${ch}px`;
    if (cv.width !== pw || cv.height !== ph) {
      r.setSize(pw, ph, false);
      rt.setSize(pw, ph);
      post.uniforms.size.value.set(pw, ph);
    }
    // the camera looks straight at the words' centre; the canvas is a window into that view
    const fullW = 2 * Math.max(cx - l, l + cw - cx, 1), fullH = 2 * Math.max(cy - t, t + ch - cy, 1);
    cam.aspect = fullW / fullH;
    cam.fov = (2 * Math.atan(fullH / V / 2 / CAM_D) * 180) / Math.PI;
    cam.setViewOffset(fullW, fullH, l - (cx - fullW / 2), t - (cy - fullH / 2), cw, ch);
    cam.updateProjectionMatrix();
    const B = view.bounds;
    B.x0 = (l - cx) / V + 4; B.x1 = (l + cw - cx) / V - 4;
    B.y1 = (cy - t) / V - 4; B.y0 = (cy - t - ch) / V + 8;
    view.rect = null;
  }
  const canvasRect = () => (view.rect ||= cv.getBoundingClientRect());

  // ---------------------------------------------------------------- letters
  const boxGeo = shadedBox();
  const letterMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  // a shine that sweeps across the words now and then (a crisp diagonal band on the front faces)
  const shineU = { value: 1e4 };
  letterMat.onBeforeCompile = (sh) => {
    sh.uniforms.uShine = shineU;
    sh.vertexShader = 'varying float vSx;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vSx = mvPosition.x + mvPosition.y * 0.6;');
    sh.fragmentShader = 'uniform float uShine;\nvarying float vSx;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
      'float shk = step(abs(vSx - uShine), 1.3) + 0.5 * step(abs(vSx - uShine + 3.2), 0.6);\n  outgoingLight = mix(outgoingLight, vec3(1.0, 0.97, 0.86), min(1.0, shk) * 0.62 * step(0.6, normal.z));\n#include <opaque_fragment>');
  };
  letterMat.customProgramCacheKey = () => 'tmw-shine';
  const _m = new THREE.Matrix4(), _c = new THREE.Color(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
  const letters = D.list.map((d, i) => {
    const n = d.vox.length;
    const mesh = new THREE.InstancedMesh(boxGeo, letterMat, n * 2);
    mesh.frustumCulled = false;
    const pal = PAL[d.line];
    const front = d.vox.map((v) => new THREE.Color(pal[v.tone]));
    const side = new THREE.Color(pal.side);
    for (let j = 0; j < n; j++) { mesh.setColorAt(j, front[j]); mesh.setColorAt(j + n, side); }
    const group = new THREE.Group();
    group.add(mesh);
    group.visible = false;
    scene.add(group);
    const L = {
      i, d, n, mesh, group, front, pal,
      alive: new Uint8Array(n).fill(1), scale: new Float32Array(n).fill(1), grow: new Float32Array(n).fill(-1), edge: new Uint8Array(n),
      delay: 0.12 + i * 0.075, dir: i % 2 ? 1 : -1, tilt: rand(-0.06, 0.06), ph: rand(0, TAU),
      hy: 0, hv: 0, sq: 0, sqv: 0, tw: 0, twv: 0, rz: 0, taps: 0, tapT: 0, missing: 0, regrowAt: 0, regrowing: false,
      eatK: 0, eatTo: new THREE.Vector3(), gone: false, leaveT: -1,
      box: new THREE.Box3(new THREE.Vector3(-d.hw - 1, -1, -4), new THREE.Vector3(d.hw + 1, d.hh + 1, 1)),
    };
    for (let j = 0; j < n; j++) writeVoxel(L, j, 1);
    return L;
  });
  function writeVoxel(L, j, s) {
    const x = L.d.lx[j], y = L.d.ly[j], n = L.n;
    _m.makeScale(s, s, s); _m.elements[12] = x; _m.elements[13] = y; _m.elements[14] = 0;
    L.mesh.setMatrixAt(j, _m);
    _m.makeScale(s, s, s * 3); _m.elements[12] = x; _m.elements[13] = y; _m.elements[14] = -2;
    L.mesh.setMatrixAt(j + n, _m);
    L.scale[j] = s;
    L.mesh.instanceMatrix.needsUpdate = true;
  }
  /** world position of a point in a letter's own space */
  function letterPoint(L, x, y, z, out) { L.group.updateMatrixWorld(); return out.set(x, y, z).applyMatrix4(L.group.matrixWorld); }
  /** a letter's highest alive voxel in column x (local), or -1 */
  function columnTop(L, x) {
    let best = -1, by = -1e9;
    for (let j = 0; j < L.n; j++) if (L.alive[j] && Math.abs(L.d.lx[j] - x) < 0.1 && L.d.ly[j] > by) { by = L.d.ly[j]; best = j; }
    return best;
  }

  // ---------------------------------------------------------------- crumbs (little voxel cubes)
  const NCR = 72;
  const crumbMesh = new THREE.InstancedMesh(boxGeo, letterMat, NCR);
  crumbMesh.frustumCulled = false;
  const CR = { p: new Float32Array(NCR * 3), v: new Float32Array(NCR * 3), rot: new Float32Array(NCR * 2), spin: new Float32Array(NCR * 2), life: new Float32Array(NCR), size: new Float32Array(NCR), next: 0, any: false };
  _m.makeScale(0, 0, 0);
  for (let k = 0; k < NCR; k++) { crumbMesh.setMatrixAt(k, _m); crumbMesh.setColorAt(k, _c.set('#ffb84a')); }
  scene.add(crumbMesh);
  const _e = new THREE.Euler(), _s = new THREE.Vector3();
  function crumb(x, y, z, vx, vy, vz, color, size = 0.8, life = 1.3) {
    const k = CR.next; CR.next = (k + 1) % NCR;
    CR.p[k * 3] = x; CR.p[k * 3 + 1] = y; CR.p[k * 3 + 2] = z;
    CR.v[k * 3] = vx; CR.v[k * 3 + 1] = vy; CR.v[k * 3 + 2] = vz;
    CR.rot[k * 2] = rand(0, TAU); CR.rot[k * 2 + 1] = rand(0, TAU);
    CR.spin[k * 2] = rand(-14, 14); CR.spin[k * 2 + 1] = rand(-14, 14);
    CR.life[k] = life; CR.size[k] = size;
    crumbMesh.setColorAt(k, _c.set(color));
    crumbMesh.instanceColor.needsUpdate = true;
    CR.any = true;
  }
  function updateCrumbs(dt) {
    if (!CR.any) return;
    let any = false;
    for (let k = 0; k < NCR; k++) {
      if (CR.life[k] <= 0) continue;
      CR.life[k] -= dt;
      const o = k * 3;
      CR.v[o + 1] -= 95 * dt;
      CR.v[o] *= 1 - dt * 0.6; CR.v[o + 2] *= 1 - dt * 0.6;
      CR.p[o] += CR.v[o] * dt; CR.p[o + 1] += CR.v[o + 1] * dt; CR.p[o + 2] += CR.v[o + 2] * dt;
      CR.rot[k * 2] += CR.spin[k * 2] * dt; CR.rot[k * 2 + 1] += CR.spin[k * 2 + 1] * dt;
      const s = CR.life[k] > 0 ? CR.size[k] * Math.min(1, CR.life[k] / 0.25) : 0;
      if (CR.life[k] > 0) any = true;
      _e.set(CR.rot[k * 2], CR.rot[k * 2 + 1], 0);
      _q.setFromEuler(_e);
      _v.set(CR.p[o], CR.p[o + 1], CR.p[o + 2]);
      _s.set(s, s, s);
      _m.compose(_v, _q, _s);
      crumbMesh.setMatrixAt(k, _m);
    }
    crumbMesh.instanceMatrix.needsUpdate = true;
    CR.any = any;
  }

  // ---------------------------------------------------------------- sparkles (pixel stars, no outline)
  const NSP = 64;
  const spGeo = new THREE.BufferGeometry();
  const spPos = new Float32Array(NSP * 3), spSize = new Float32Array(NSP), spCol = new Float32Array(NSP * 3);
  spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  spGeo.setAttribute('aSize', new THREE.BufferAttribute(spSize, 1));
  spGeo.setAttribute('aColor', new THREE.BufferAttribute(spCol, 3));
  const spMat = new THREE.ShaderMaterial({ vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, depthTest: false, depthWrite: false });
  const spPts = new THREE.Points(spGeo, spMat);
  spPts.frustumCulled = false;
  const fxScene = new THREE.Scene();
  fxScene.add(spPts);
  const SP = { v: new Float32Array(NSP * 3), life: new Float32Array(NSP), max: new Float32Array(NSP), big: new Float32Array(NSP), next: 0, any: false };
  const SPARK_COLS = ['#ffe08a', '#fff6c8', '#ffc070', '#ffffff'];
  function spark(x, y, z, { n = 4, spread = 3, up = 6, big = 7, cols = SPARK_COLS, life = 0.7 } = {}) {
    for (let i = 0; i < n; i++) {
      const k = SP.next; SP.next = (k + 1) % NSP;
      spPos[k * 3] = x + rand(-spread, spread); spPos[k * 3 + 1] = y + rand(-spread, spread) * 0.7; spPos[k * 3 + 2] = z + rand(0, 3);
      SP.v[k * 3] = rand(-4, 4); SP.v[k * 3 + 1] = up + rand(-2, 4); SP.v[k * 3 + 2] = 0;
      SP.life[k] = SP.max[k] = life * rand(0.7, 1.25);
      SP.big[k] = big * rand(0.75, 1.15);
      _c.set(cols[(Math.random() * cols.length) | 0]);
      spCol[k * 3] = _c.r; spCol[k * 3 + 1] = _c.g; spCol[k * 3 + 2] = _c.b;
    }
    spGeo.attributes.aColor.needsUpdate = true;
    SP.any = true;
  }
  function updateSparks(dt) {
    if (!SP.any) return;
    let any = false;
    for (let k = 0; k < NSP; k++) {
      if (SP.life[k] <= 0) { spSize[k] = 0; continue; }
      SP.life[k] -= dt;
      const o = k * 3;
      spPos[o] += SP.v[o] * dt; spPos[o + 1] += SP.v[o + 1] * dt;
      SP.v[o + 1] *= 1 - dt * 1.5;
      const a = 1 - SP.life[k] / SP.max[k];
      const s = SP.big[k] * Math.sin(Math.PI * clamp01(a)) * (0.75 + 0.25 * Math.sin(a * 40));
      spSize[k] = s < 1 ? 0 : 2 * Math.floor((s - 1) / 2) + 1; // odd px
      if (SP.life[k] > 0) any = true;
    }
    spGeo.attributes.position.needsUpdate = true;
    spGeo.attributes.aSize.needsUpdate = true;
    SP.any = any;
  }

  // ---------------------------------------------------------------- butterflies
  const bfBody = new THREE.BoxGeometry(1, 4.2, 1);
  const WS = 6; // 12 texels: one art pixel each
  const bfWing = new THREE.PlaneGeometry(WS, WS).translate(WS / 2, -WS * 0.12, 0);
  const bfAnt = new THREE.BoxGeometry(0.5, 2.2, 0.5).translate(0, 1.1, 0);
  const bfMats = [];
  const nBf = reduced ? 2 : M.small ? 3 : 4;
  const bugs = [];
  for (let k = 0; k < nBf; k++) {
    const pal = BUTTERFLY_PALS[k % BUTTERFLY_PALS.length];
    const tex = wingTexture(pal);
    const wm = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
    const bm = new THREE.MeshBasicMaterial({ color: pal.body });
    bfMats.push(wm, bm);
    const g = new THREE.Group();
    const body = new THREE.Mesh(bfBody, bm);
    const wr = new THREE.Mesh(bfWing, wm), wl = new THREE.Mesh(bfWing, wm);
    wl.scale.x = -1;
    const a1 = new THREE.Mesh(bfAnt, bm), a2 = new THREE.Mesh(bfAnt, bm);
    a1.position.set(0.3, 1.9, 0); a1.rotation.z = -0.5; a2.position.set(-0.3, 1.9, 0); a2.rotation.z = 0.5;
    g.add(body, wr, wl, a1, a2);
    g.visible = false;
    scene.add(g);
    const b = {
      k, g, wr, wl, pos: new THREE.Vector3(), vel: new THREE.Vector3(), tgt: new THREE.Vector3(), mode: 'away', t: 0, wt: 0,
      awayT: 0.9 + k * 0.7, landAt: 0, sitT: 0, L: null, col: 0, colJ: -1, dir: 1, ph: rand(0, TAU), fold: 0.5, ang: 0, land: 0,
      flee: new THREE.Vector3(), q: new THREE.Quaternion(), slow: 0, rate: rand(22, 28),
    };
    bugs.push(b);
  }
  const _qFly = new THREE.Quaternion(), _qLand = new THREE.Quaternion(), _mb = new THREE.Matrix4();
  const _ax = new THREE.Vector3(), _ay = new THREE.Vector3(), _az = new THREE.Vector3();
  function enterButterfly(b) {
    const B = view.bounds, side = Math.random() < 0.5 ? -1 : 1;
    b.pos.set(side < 0 ? B.x0 - 10 : B.x1 + 10, rand(B.y0 + 6, B.y1 - 2), rand(-2, 6));
    b.vel.set(-side * 14, rand(-2, 4), 0);
    b.mode = 'fly'; b.t = 0; b.wt = 0; b.landAt = rand(2.5, 6);
    b.g.visible = true;
  }
  function takeOff(b, kick = 1) {
    if (b.mode !== 'sit' && b.mode !== 'land') return;
    b.mode = 'fly'; b.L = null; b.wt = 0; b.t = 0; b.landAt = rand(3.5, 8);
    b.vel.set(rand(-8, 8), 16 * kick, rand(0, 6));
  }
  function scatter(x, y, z, all = true) {
    for (const b of bugs) {
      if (b.mode === 'away' || b === protect) continue;
      if (!all && b.pos.distanceTo(_v.set(x, y, z)) > 30) continue;
      b.mode = 'flee'; b.t = 0; b.L = null;
      b.flee.set(x, y, z);
      _v.copy(b.pos).sub(b.flee); _v.z = 0;
      if (_v.lengthSq() < 0.01) _v.set(rand(-1, 1), 1, 0);
      _v.normalize();
      b.vel.set(_v.x * 34, Math.abs(_v.y) * 24 + 16, rand(2, 8));
    }
  }
  let protect = null; // a butterfly the bear is about to miss (it must not scatter early)
  function pickSeat(b) {
    const choices = letters.filter((L) => !L.gone && L.missing === 0 && !L.regrowing && L.leaveT < 0 && !bugs.some((o) => o !== b && o.L === L));
    if (!choices.length) return false;
    const L = choices[(Math.random() * choices.length) | 0];
    // a column near the middle with a flat-ish top
    const xs = [];
    for (let j = 0; j < L.n; j++) if (Math.abs(L.d.lx[j]) < L.d.hw * 0.6 && !xs.includes(L.d.lx[j])) xs.push(L.d.lx[j]);
    if (!xs.length) return false;
    b.L = L; b.col = xs[(Math.random() * xs.length) | 0]; b.colJ = columnTop(L, b.col);
    if (b.colJ < 0) { b.L = null; return false; }
    b.dir = Math.random() < 0.5 ? -1 : 1;
    b.mode = 'land'; b.t = 0;
    return true;
  }
  function seatPos(b, out) { const L = b.L; return letterPoint(L, b.col, L.d.ly[b.colJ] + 0.5 + 0.6, -1.5, out); }
  function updateBug(b, dt) {
    b.t += dt;
    const B = view.bounds;
    if (b.mode === 'away') {
      b.g.visible = false;
      b.awayT -= dt;
      if (b.awayT <= 0 && !leaving) enterButterfly(b);
      return;
    }
    let speed = 15, steerK = 3.2, flap = 1;
    if (b.mode === 'fly') {
      b.wt -= dt;
      if (b.wt <= 0) {
        b.tgt.set(rand(B.x0, B.x1), rand(B.y0 + 4, B.y1), rand(-3, 8));
        b.wt = rand(1.0, 2.4);
      }
      if (b.t > b.landAt && !bear?.busy && !leaving && !reduced2) { if (!pickSeat(b)) b.landAt = b.t + 2; }
      _v.copy(b.tgt);
    } else if (b.mode === 'land') {
      if (!b.L || !b.L.alive[b.colJ] || b.L.gone) { b.mode = 'fly'; b.L = null; return; }
      seatPos(b, _v);
      const d = _v.distanceTo(b.pos);
      speed = Math.max(3, Math.min(16, d * 2.2));
      steerK = 5;
      if (d < 0.5) { b.mode = 'sit'; b.sitT = rand(3.5, 7.5); b.t = 0; b.slow = 0; }
    } else if (b.mode === 'sit') {
      const L = b.L;
      if (!L || !L.alive[b.colJ] || L.gone || L.leaveT >= 0) { b.mode = 'land'; takeOff(b); return; }
      b.sitT -= dt;
      if (b.sitT <= 0) { takeOff(b); return; }
      // a hop of the letter shakes it off
      if (L.hv > 9) { takeOff(b, 1.2); return; }
      seatPos(b, b.pos);
      b.vel.set(0, 0, 0);
    } else if (b.mode === 'flee') {
      b.vel.y += 14 * dt;
      b.vel.multiplyScalar(1 + dt * 0.6);
      if (b.t > 1.6 || b.pos.y > B.y1 + 14 || b.pos.x < B.x0 - 14 || b.pos.x > B.x1 + 14) {
        b.mode = 'away'; b.awayT = rand(2.5, 5); b.g.visible = false; return;
      }
      flap = 1.6;
    } else if (b.mode === 'tease') {
      // circling the bear's head (it missed)
      const T2 = b.t * 4.2;
      _v.set(b.flee.x + Math.cos(T2) * 9, b.flee.y + 4 + Math.sin(T2 * 1.3) * 3, b.flee.z + Math.sin(T2) * 6);
      speed = 26; steerK = 7; flap = 1.3;
    }
    if (b.mode !== 'sit' && b.mode !== 'flee') {
      _v2.copy(_v).sub(b.pos);
      const d = _v2.length();
      if (d > 0.01) _v2.multiplyScalar(speed / d * (b.mode === 'land' ? 1 : Math.min(1, d / 4 + 0.35)));
      b.vel.lerp(_v2, Math.min(1, dt * steerK));
      // the fluttery wobble
      b.vel.y += Math.sin(b.t * 7.3 + b.ph) * 22 * dt;
      b.vel.x += Math.sin(b.t * 4.1 + b.ph * 2) * 12 * dt;
    }
    if (b.mode !== 'sit') b.pos.addScaledVector(b.vel, dt);
    b.g.visible = true;
    // wings
    b.ph += dt * b.rate * flap;
    if (b.mode === 'sit') {
      b.slow += dt;
      const o = Math.max(0, Math.sin(b.slow * 1.6)) ** 3; // a slow open now and then
      b.fold = lerp(b.fold, 1.45 - 1.1 * o, Math.min(1, dt * 8));
    } else b.fold = 0.2 + 1.05 * (0.5 + 0.5 * Math.sin(b.ph));
    b.wr.rotation.y = -b.fold; b.wl.rotation.y = b.fold;
    // body: flying = back to the camera, nose along the flight; sitting = side-on on the letter top
    if (Math.abs(b.vel.x) + Math.abs(b.vel.y) > 0.5) b.ang = angLerp(b.ang, Math.atan2(b.vel.y, b.vel.x) - Math.PI / 2, Math.min(1, dt * 6));
    _e.set(-0.55, 0, b.ang); _qFly.setFromEuler(_e);
    let landK = 0;
    if (b.mode === 'sit') landK = 1;
    else if (b.mode === 'land') { seatPos(b, _v); landK = clamp01(1 - (_v.distanceTo(b.pos) - 0.5) / 5); }
    b.land = lerp(b.land, landK, Math.min(1, dt * 7));
    if (b.land > 0.01 && b.L) {
      // side-on on the letter top, its back tipped towards us so open wings still show
      _ay.set(b.dir, 0, 0); _az.set(0, Math.cos(0.75), Math.sin(0.75)); _ax.crossVectors(_ay, _az);
      _mb.makeBasis(_ax, _ay, _az);
      _qLand.setFromRotationMatrix(_mb).premultiply(b.L.group.quaternion);
      b.q.slerpQuaternions(_qFly, _qLand, b.land);
    } else b.q.copy(_qFly);
    b.g.quaternion.copy(b.q);
    b.g.position.copy(b.pos);
  }
  const angLerp = (a, b2, t) => { let d = (b2 - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d * t; };
  let reduced2 = false; // butterflies stop landing while leaving

  // ---------------------------------------------------------------- bites
  /** remove a bite-shaped chunk (a big circle + two scallops) around a local point; returns voxels removed */
  function biteLetter(L, x, y, rad, { crumbs = true, dir = 1 } = {}) {
    // the big bite, plus two tooth-scallops poking further in (a cartoon bite mark)
    let nx = -x, ny = L.d.hh * 0.45 - y;
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    const sc = (a) => [x + (nx * Math.cos(a) - ny * Math.sin(a)) * rad * 0.82, y + (nx * Math.sin(a) + ny * Math.cos(a)) * rad * 0.82, rad * 0.5];
    const circ = [[x, y, rad], sc(0.95 * dir), sc(-0.95 * dir)];
    const inside = (px, py, grow = 0) => circ.some(([cx, cy, cr]) => (px - cx) ** 2 + (py - cy) ** 2 < (cr + grow) ** 2);
    let removed = 0;
    L.group.updateMatrixWorld();
    for (let j = 0; j < L.n; j++) {
      if (!L.alive[j]) continue;
      const px = L.d.lx[j], py = L.d.ly[j];
      if (!inside(px, py)) continue;
      L.alive[j] = 0; L.grow[j] = -1;
      writeVoxel(L, j, 0);
      removed++;
      if (crumbs && (removed < 6 || Math.random() < 0.45)) {
        _v.set(px, py, 0).applyMatrix4(L.group.matrixWorld);
        crumb(_v.x, _v.y, _v.z + 0.5, (px - x) * 2.2 + rand(-8, 8), rand(6, 24), rand(-2, 10), Math.random() < 0.7 ? L.front[j] : L.pal.side, rand(0.55, 0.95));
      }
    }
    if (!removed) return 0;
    // the bitten rim shows the pale inside (with a darker tooth mark here and there)
    for (let j = 0; j < L.n; j++) if (L.alive[j] && inside(L.d.lx[j], L.d.ly[j], 1.3)) { L.edge[j] = 1; L.mesh.setColorAt(j, _c.set((j * 7) % 5 === 0 ? L.pal.bite : L.pal.core)); }
    L.mesh.instanceColor.needsUpdate = true;
    L.missing += removed;
    L.biteX = x; L.biteY = y;
    L.regrowAt = T + rand(3.0, 4.4);
    // the letter flinches
    L.sq = 0.22; L.twv += 6 * dir; L.hv = Math.max(L.hv, -4);
    for (const b of bugs) if (b.L === L && (b.mode === 'sit' || b.mode === 'land') && !L.alive[b.colJ]) takeOff(b, 1.3);
    return removed;
  }
  /** the whole letter goes (a gulp); it regrows bottom-up */
  function swallowLetter(L) {
    for (let j = 0; j < L.n; j++) { if (L.alive[j]) { L.alive[j] = 0; L.missing++; } writeVoxel(L, j, 0); L.grow[j] = -1; }
    L.gone = true; L.eatK = 0;
    L.biteX = 0; L.biteY = 200; // regrows bottom-up
    L.regrowAt = T + rand(3.2, 4.4);
    for (const b of bugs) if (b.L === L) takeOff(b, 1.3);
  }
  function startRegrow(L) {
    L.regrowing = true; L.gone = false; L.eatK = 0;
    const order = [];
    for (let j = 0; j < L.n; j++) if (!L.alive[j]) order.push(j);
    // from the rim of the bite inwards (a whole letter: bottom up)
    const bx = L.biteX, by = L.biteY;
    order.sort((a, b) => ((L.d.lx[b] - bx) ** 2 + (L.d.ly[b] - by) ** 2) - ((L.d.lx[a] - bx) ** 2 + (L.d.ly[a] - by) ** 2));
    const step = Math.min(0.035, 1.1 / Math.max(1, order.length));
    order.forEach((j, k) => { L.grow[j] = T + 0.1 + k * step + Math.random() * 0.02; });
    play('pop_in', { volume: 0.22, pitch: 1.15 });
  }
  function updateRegrow(L) {
    if (!L.regrowing) return;
    let left = 0;
    for (let j = 0; j < L.n; j++) {
      if (L.alive[j] || L.grow[j] < 0) continue;
      const a = (T - L.grow[j]) / 0.22;
      if (a < 0) { left++; continue; }
      if (a >= 1) {
        L.alive[j] = 1; L.missing--; L.grow[j] = -1;
        writeVoxel(L, j, 1);
        if (Math.random() < 0.12) { letterPoint(L, L.d.lx[j], L.d.ly[j], 1, _v); spark(_v.x, _v.y, _v.z, { n: 1, spread: 0.5, big: 5, up: 3, life: 0.5 }); }
        continue;
      }
      left++;
      writeVoxel(L, j, easeOutBack(a, 3));
    }
    if (!left) {
      L.regrowing = false; L.missing = 0;
      for (let j = 0; j < L.n; j++) if (L.edge[j]) { L.edge[j] = 0; L.mesh.setColorAt(j, L.front[j]); }
      L.mesh.instanceColor.needsUpdate = true;
      L.sq = 0.18; L.hv = 10;
      letterPoint(L, 0, L.d.hh * 0.6, 1, _v);
      spark(_v.x, _v.y, _v.z, { n: 5, spread: L.d.hw, big: 7 });
    }
  }

  // ---------------------------------------------------------------- input: only the letters / butterflies
  const ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _ray = new THREE.Ray(), _inv = new THREE.Matrix4(), _hit = new THREE.Vector3();
  function rayAt(x, y) {
    const R = canvasRect();
    if (x < R.left || x > R.right || y < R.top || y > R.bottom) return false;
    _ndc.set(((x - R.left) / R.width) * 2 - 1, -((y - R.top) / R.height) * 2 + 1);
    ray.setFromCamera(_ndc, cam);
    return true;
  }
  function hitLetter() {
    let best = null, bd = Infinity;
    for (const L of letters) {
      if (!L.group.visible || L.gone || L.leaveT >= 0 || T - L.delay < 0.5) continue;
      L.group.updateMatrixWorld();
      _inv.copy(L.group.matrixWorld).invert();
      _ray.copy(ray.ray).applyMatrix4(_inv);
      if (_ray.intersectBox(L.box, _hit)) {
        const d = _hit.applyMatrix4(L.group.matrixWorld).distanceTo(ray.ray.origin);
        if (d < bd) { bd = d; best = L; }
      }
    }
    return best;
  }
  function hitBug() {
    for (const b of bugs) if (b.g.visible && b.mode !== 'away' && ray.ray.distanceSqToPoint(b.pos) < 12) return b;
    return null;
  }
  const blocked = (t) => !!t?.closest?.('button, a, input, select, textarea, .tm-post, .tbx, .tset, .tm-credit, [role="dialog"]');
  let hoverL = null, pendMove = null, hand = false;
  const setHand = (on) => { if (on !== hand) { hand = on; document.documentElement.classList.toggle('tmw-hand', on); } };
  const onMove = (e) => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') pendMove = blocked(e.target) ? null : { x: e.clientX, y: e.clientY }; if (blocked(e.target)) setHand(false); };
  const onDown = (e) => {
    if (dead || leaving || blocked(e.target) || (e.button != null && e.button > 0)) return;
    if (!rayAt(e.clientX, e.clientY)) return;
    if (bear?.busy && bear.hit(ray.ray)) { bear.bonk(); letterSpark(bear.rig.mawPos(_v2), 5, ['#ffffff', '#fff6c8']); return; }
    const L = hitLetter();
    if (L) { tapLetter(L); return; }
    const b = hitBug();
    if (b) { if (b.mode === 'sit' || b.mode === 'land') takeOff(b, 1.2); else b.vel.y += 20; letterSpark(b.pos, 3, ['#ffffff', BUTTERFLY_PALS[b.k % 4].light]); play('bubble', { volume: 0.18, pitch: 1.6 }); }
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  function letterSpark(p, n, cols) { spark(p.x, p.y, p.z + 1, { n, spread: 2, cols }); }
  function processHover() {
    if (!pendMove) { if (hoverL) { hoverL = null; setHand(false); } return; }
    const { x, y } = pendMove;
    pendMove = null;
    let L = null, b = null, br = false;
    if (rayAt(x, y)) { br = !!(bear?.busy && bear.hit(ray.ray)); if (!br) L = hitLetter(); if (!L && !br) b = hitBug(); }
    setHand(!!(L || b || br));
    if (L && L !== hoverL) {
      L.hv = Math.max(L.hv, 9); L.sq = Math.max(L.sq, 0.1); L.twv += L.dir * 2.5;
      letterPoint(L, rand(-L.d.hw, L.d.hw), L.d.hh, 1, _v);
      spark(_v.x, _v.y, _v.z, { n: 3, spread: 2, big: 7 });
      play('bubble', { volume: 0.1, pitch: 1.5 + L.i * 0.05 });
    }
    hoverL = L;
  }
  function tapLetter(L) {
    L.sq = 0.32; L.hv = 24; L.twv += L.dir * 7;
    letterPoint(L, 0, L.d.hh * 0.55, 1.5, _v);
    spark(_v.x, _v.y, _v.z, { n: 9, spread: L.d.hw * 1.1, big: 9, up: 11, life: 0.8 });
    play('star_pop', { volume: 0.22, pitch: 0.85 + (L.i % 7) * 0.07 });
    // tap a letter a few times and the bear smells a snack
    L.taps = T - L.tapT < 2.5 ? L.taps + 1 : 1;
    L.tapT = T;
    if (L.taps >= 3 && L.missing === 0 && !L.regrowing) { L.taps = 0; summon({ L, kind: Math.random() < 0.35 ? 'gulp' : 'chomp', soon: true }); }
  }

  // ---------------------------------------------------------------- the bear (lazy: src/ui/titleWordsBear.js)
  let bear = null, bearP = null, nextBite = rand(4.5, 5.6), wantBite = null, nBites = 0;
  const host = {
    scene, letters, bugs, view, words: D,
    get T() { return T; }, get reduced() { return reduced; },
    play, spark, crumb, scatter, takeOff, biteLetter, swallowLetter, letterPoint, columnTop,
    protect(b) { protect = b; },
    compile() { r.compile(scene, cam); },
    /** world y of the top of the screen at depth z (the bear keeps its ears below it) */
    topAt(z) { return (view.cy / V) * (CAM_D - z) / CAM_D; },
    /** the top of the screen in z = 0 units (the words' own scale) */
    get topEq() { return view.cy / V; },
    get canvasW() { return cv.width; },
  };
  function loadBear() {
    if (!bearP) {
      bearP = import('./titleWordsBear.js').then(({ WordBear }) => {
        if (dead) return null;
        bear = new WordBear(host);
        bear.warm(); // compile its shaders now, between gags
        return bear;
      }).catch((e) => { console.warn('TitleWords: bear failed', e); return null; });
    }
    return bearP;
  }
  const DECK = ['chomp', 'nibble', 'miss', 'gulp', 'chomp', 'nibble', 'chomp', 'gulp', 'miss'];
  function summon(opts = {}) {
    if (dead || leaving) return false;
    wantBite = opts;
    loadBear();
    return true;
  }
  function updateBear(dt) {
    if (leaving) { bear?.update(dt); return; }
    if (!reduced && T > nextBite && !wantBite && !bear?.busy && T > 1.6) {
      // the pond's own bear gag is on: wait a bit (one bear at a time is funnier)
      if (window.__title?.gag?.kind === 'bear') nextBite = T + 5;
      else { summon({ kind: DECK[nBites % DECK.length] }); }
    }
    if (T > 2.4 && !bearP) loadBear(); // build + warm up the rig before it's needed
    if (wantBite && bear && !bear.busy) {
      const ok = bear.start(wantBite);
      wantBite = null;
      if (ok) { nBites++; }
      nextBite = T + (ok ? rand(15, 25) : 4);
    }
    bear?.update(dt);
  }

  // ---------------------------------------------------------------- per frame
  let T = 0, dead = false, leaving = false, leaveDone = null, raf = 0, last = performance.now();
  let pulseAt = rand(7, 10), pulseT = -10;
  const amp = reduced ? 0.35 : 1;
  let shineAt = 2.2, shineT = -10;
  function updateLetters(dt) {
    if (!reduced && T > pulseAt) { pulseT = T; pulseAt = T + rand(9, 15); }
    if (T > shineAt) { shineT = T; shineAt = T + rand(6.5, 11); }
    const sk = (T - shineT) / 1.0;
    shineU.value = sk >= 0 && sk <= 1 ? lerp(-D.W * 0.5 - 30, D.W * 0.5 + 30, sk) : 1e4;
    for (let i = 0; i < letters.length; i++) {
      const L = letters[i], g = L.group;
      const ti = T - L.delay;
      if (ti < 0) { g.visible = false; continue; }
      g.visible = true;
      // the hop wave (a ripple of little jumps through the words)
      if (pulseT > 0) { const tp = T - pulseT - i * 0.075; if (tp >= 0 && tp < dt + 1e-4) { L.hv = Math.max(L.hv, 11); L.twv += L.dir * 1.5; } }
      // springs: hop (gravity), squash, tilt
      if (L.hy > 0 || L.hv > 0) {
        L.hv -= 150 * dt; L.hy += L.hv * dt;
        if (L.hy <= 0) { if (L.hv < -10) L.sq = Math.max(L.sq, Math.min(0.28, -L.hv * 0.01)); L.hy = 0; L.hv = 0; }
      }
      L.sqv += (-260 * L.sq - 11 * L.sqv) * dt; L.sq += L.sqv * dt;
      L.twv += (-150 * L.tw - 6 * L.twv) * dt; L.tw += L.twv * dt;
      // float in from below, one by one
      const kIn = reduced ? easeOut(ti / 0.6) : easeOutBack(ti / 0.85, 2.0);
      const inY = -46 * (1 - kIn);
      const inS = lerp(reduced ? 0.8 : 0.35, 1, clamp01(kIn));
      // idle float: bob + a wave running through the words + a sway that shows the sides
      const bob = (Math.sin(T * 1.55 - i * 0.6 + 0.3) * 0.95 + Math.sin(T * 0.61 + L.ph) * 0.45) * amp;
      const rz = L.tilt * amp + Math.sin(T * 1.05 + L.ph) * 0.045 * amp + L.tw + (1 - clamp01(kIn)) * 0.9 * L.dir;
      const ry = Math.sin(T * 0.72 - i * 0.42 + L.ph * 0.3) * 0.3 * amp;
      const rx = 0.14 + Math.sin(T * 1.21 + i * 0.7) * 0.08 * amp; // tipped back a little: the tops catch the light
      // squash-and-stretch (stretch while flying up)
      const st = clamp(L.hv * 0.005, -0.1, 0.14);
      const sy = (1 - L.sq + st) * inS, sxz = (1 + L.sq * 0.6 - st * 0.5) * inS;
      let px = L.d.bx, py = L.d.by + bob + L.hy + inY, extraS = L.d.k;
      // leaving: up and away with a spin
      if (L.leaveT >= 0) {
        const tl = T - L.leaveT;
        if (tl > 0) { const k = easeIn(tl / 0.5); py += k * 70; extraS *= 1 - 0.6 * k; }
      }
      px *= L.d.k; py *= L.d.k;
      let pz = L.d.z;
      // being sucked into a bear's maw
      if (L.eatK > 0) {
        const k = easeIn(L.eatK);
        px = lerp(px, L.eatTo.x, k); py = lerp(py, L.eatTo.y, k); pz = lerp(pz, L.eatTo.z, k);
        extraS *= 1 - 0.85 * k;
      }
      g.position.set(px, py, pz);
      g.rotation.set(rx, ry, rz + (L.leaveT >= 0 ? Math.max(0, T - L.leaveT) * 3 * L.dir : 0));
      g.scale.set(sxz * extraS, sy * extraS, sxz * extraS);
      if (ti > 0.85 && ti - dt <= 0.85 && !reduced) { L.sq = 0.16; } // a little landing squish
      if (L.missing > 0 && !L.regrowing && !L.gone && T > L.regrowAt) startRegrow(L);
      if (L.gone && T > L.regrowAt) startRegrow(L);
      updateRegrow(L);
    }
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (dead || lost || document.hidden) return;
    if (!cv.isConnected) { dispose(); return; }
    if (api.paused) { render(); return; }
    const c0 = performance.now();
    processHover();
    if (!step(dt)) return;
    render();
    msAvg += (performance.now() - c0 - msAvg) * 0.05;
  }
  function step(dt) {
    T += dt;
    updateLetters(dt);
    for (const b of bugs) updateBug(b, dt);
    updateBear(dt);
    updateCrumbs(dt);
    updateSparks(dt);
    if (leaving && T > leaving) { dispose(); return false; }
    return true;
  }
  let msAvg = 0;
  function render() {
    r.setRenderTarget(rt);
    r.clear();
    r.render(scene, cam);
    r.setRenderTarget(null);
    r.clear();
    r.render(postScene, postCam);
    if (SP.any) r.render(fxScene, cam);
  }

  // ---------------------------------------------------------------- resize
  let rzRaf = 0;
  const onResize = () => { if (!rzRaf) rzRaf = requestAnimationFrame(() => { rzRaf = 0; if (!dead) layout(); }); };
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);

  layout();
  raf = requestAnimationFrame(frame);

  function dispose() {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(raf); cancelAnimationFrame(rzRaf);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('resize', onResize);
    window.visualViewport?.removeEventListener('resize', onResize);
    cv.removeEventListener('webglcontextlost', onLost);
    setHand(false);
    try { bear?.dispose(); } catch (e) { console.warn(e); }
    for (const L of letters) L.mesh.dispose();
    crumbMesh.dispose();
    boxGeo.dispose(); letterMat.dispose();
    bfBody.dispose(); bfWing.dispose(); bfAnt.dispose();
    for (const m of bfMats) { m.map?.dispose(); m.dispose(); }
    spGeo.dispose(); spMat.dispose();
    post.dispose(); tri.dispose();
    rt.depthTexture.dispose(); rt.dispose();
    r.dispose(); r.forceContextLoss?.();
    cv.remove();
    if (window.__titleWords === api) delete window.__titleWords;
    leaveDone?.();
  }
  const api = {
    el: cv,
    /** float up and away, then dispose (resolves when gone) */
    leave() {
      if (dead) return Promise.resolve();
      if (leaving) return new Promise((res) => { const prev = leaveDone; leaveDone = () => { prev?.(); res(); }; });
      leaving = T + 0.62;
      reduced2 = true;
      letters.forEach((L, i) => { L.leaveT = T + i * 0.022; L.hv = 0; });
      scatter(0, -40, 0);
      bear?.duck?.();
      setHand(false);
      setTimeout(dispose, 1400); // even if no frame runs (hidden tab)
      return new Promise((res) => { leaveDone = res; });
    },
    dispose,
    paused: false, // tests: freeze the clock (still renders)
    /** tests: run the clock forward `sec` seconds in 1/30 s steps (slow headless GPUs) */
    advance(sec) { for (let i = Math.ceil(sec * 30); i > 0 && !dead; i--) if (!step(1 / 30)) return; if (!dead) render(); },
    /** tests: css px of the bear's face on screen (null when it's not up) */
    bearScreen() {
      if (!bear?.busy) return null;
      bear.rig.mawPos(_v2); _v2.y += 5; _v2.project(cam);
      const R = cv.getBoundingClientRect();
      return { x: R.left + (_v2.x + 1) / 2 * R.width, y: R.top + (1 - _v2.y) / 2 * R.height };
    },
    /** tests: css px centre of letter i on screen */
    letterScreen(i) {
      const L = letters[i];
      if (!L) return null;
      letterPoint(L, 0, L.d.hh * 0.5, 0, _v2).project(cam);
      const R = cv.getBoundingClientRect();
      return { x: R.left + (_v2.x + 1) / 2 * R.width, y: R.top + (1 - _v2.y) / 2 * R.height };
    },
    // tests / tools
    bite(opts = {}) {
      const o = { ...opts };
      if (typeof o.letter === 'number') o.L = letters[o.letter];
      return summon(o);
    },
    get state() {
      return {
        T, leaving: !!leaving, bites: nBites, bear: bear ? bear.debug : null,
        letters: letters.map((L) => ({ ch: L.d.ch, missing: L.missing, gone: L.gone, regrowing: L.regrowing })),
        bugs: bugs.map((b) => b.mode), size: [cv.width, cv.height], V, ms: +msAvg.toFixed(2),
      };
    },
    _host: host,
  };
  window.__titleWords = api;
  return api;
}
