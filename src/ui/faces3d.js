// [v26 faces3d] 3D faces for the whole UI: "when using a character face never use 2D".
// Every Reynard / bear / beaver face icon or portrait is a small render of the real rig
// (FoxRig in the current wardrobe outfit, BearRig + its type look, BeaverChibi), ink
// outlined like NpcTalk3D / FoxTalk3D, at exactly the pixel size of the frame it fills
// (1 rendered px per output px: crisp, no resampling). Renders are cached; the rigs are
// built once and re-posed per snapshot; one shared offscreen WebGL context that lingers
// a few seconds after the last snapshot, so a burst of icons costs one context.
//
//   import { faceCanvas, faceURL, faceImg } from './faces3d.js';
//   faceCanvas({ who: 'fox', expr: 'greedy', frame: 'bust' }, 64, 64) -> <canvas> | null
//   faceCanvas({ who: 'bear', type: 'office', def?, expr: 'happy' }, 40, 40)
//   faceCanvas({ who: 'beaver', outfit: 'hardhat', look?, seed? }, 40, 40)
//   faceCanvas({ who: 'npc', npc: 'pip' }, 36, 36)          (NpcTalk3D.npcSnapshot)
//     frame: 'head' (the head, hat and ears, tight) | 'bust' (+ collar / shoulders)
//     turn:  yaw of the rig (+ = toward the viewer's left), default 0.3
//   faceImg(spec, w, h, cls) -> '<img ...>' HTML (hi-dpi aware, pixelated), '' without WebGL
//
// It also installs itself into src/ui/faceHook.js at import, which is how sprites.js
// turns every character-face sprite ('fox', 'fox_<expr>', 'bear', 'bear_<type>',
// 'beaver', 'staff', ...) into a 3D render, and how the bag art / notebook / lesson slate
// doodles get theirs.
import * as THREE from 'three';
import { FoxRig } from '../entities/foxRig.js';
import { FOX_STYLE } from '../entities/foxProps.js';
import { BearRig } from '../entities/bearRig.js';
import { BEAR_TYPES } from '../data/bears.js';
import { BeaverChibi } from '../entities/beaverChibi.js';
import { npcSnapshot, NPC_RIGS } from './NpcTalk3D.js';
import { FACE3D } from './faceHook.js';

// ------------------------------------------------------------------ outline post pass
const POST_VERT = `varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FRAG = `#include <packing>
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 size; uniform vec3 ink; uniform float cNear; uniform float cFar; uniform float crease;
varying vec2 vUv;
float A(vec2 o) { return texture2D(tColor, vUv + o).a; }
float Z(vec2 o) { return -perspectiveDepthToViewZ(texture2D(tDepth, vUv + o).x, cNear, cFar); }
void main() {
  vec2 px = 1.0 / size;
  vec4 c = texture2D(tColor, vUv);
  if (c.a < 0.5) {
    float n = max(max(A(vec2(px.x, 0.0)), A(vec2(-px.x, 0.0))), max(A(vec2(0.0, px.y)), A(vec2(0.0, -px.y))));
    gl_FragColor = n > 0.5 ? vec4(ink, 1.0) : vec4(0.0);
  } else {
    float z = Z(vec2(0.0));
    float zn = min(min(Z(vec2(px.x, 0.0)), Z(vec2(-px.x, 0.0))), min(Z(vec2(0.0, px.y)), Z(vec2(0.0, -px.y))));
    vec3 col = c.rgb;
    if (z - zn > crease) col = mix(col, ink, 0.6);
    gl_FragColor = vec4(col, 1.0);
  }
  #include <colorspace_fragment>
}`;

const POOL = { r: null, failed: false, post: null, scene: null, cam: null, relT: 0, rigs: new Map() };
function pool() {
  if (POOL.r) return POOL;
  if (POOL.failed || typeof document === 'undefined') return null;
  try {
    const r = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
    if (!r.getContext()) throw new Error('no gl');
    r.setPixelRatio(1);
    r.setClearColor(0x000000, 0);
    if (!POOL.post) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
        uniforms: { tColor: { value: null }, tDepth: { value: null }, size: { value: new THREE.Vector2(2, 2) }, ink: { value: new THREE.Color(0x1c0f0a) }, cNear: { value: 0.1 }, cFar: { value: 30 }, crease: { value: 0.09 } },
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
      POOL.post = new THREE.Mesh(g, mat); POOL.post.frustumCulled = false;
      POOL.scene = new THREE.Scene(); POOL.scene.add(POOL.post);
      POOL.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      POOL.stage = new THREE.Scene();
      lights(POOL.stage);
      POOL.pivot = new THREE.Group();
      POOL.stage.add(POOL.pivot);
      POOL.view = new THREE.PerspectiveCamera(18, 1, 0.1, 30);
    }
    r.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
    POOL.r = r;
    return POOL;
  } catch (e) {
    console.warn('faces3d: WebGL unavailable', e);
    POOL.failed = true;
    return null;
  }
}
// keep the context (and the posed rigs) a few seconds: panels open bursts of faces
function release() {
  clearTimeout(POOL.relT);
  POOL.relT = setTimeout(() => {
    if (!POOL.r) return;
    for (const rig of POOL.rigs.values()) { try { rig.root.parent?.remove(rig.root); rig.dispose?.(); } catch { /* ignore */ } }
    POOL.rigs.clear();
    POOL.r.dispose(); POOL.r.forceContextLoss?.(); POOL.r = null;
  }, 5000);
}

function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xffe8cc, 0x6a4a7a, 1.45));
  const key = new THREE.DirectionalLight(0xfff0d6, 2.2); key.position.set(-1.6, 2.6, 3.2); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffc6a0, 0.6); fill.position.set(2.5, 0.4, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffd27a, 2.2); rim.position.set(2.4, 1.8, -2.6); scene.add(rim);
}

// ------------------------------------------------------------------ rigs (built once, re-posed)
const BEAR_BY_ICON = {};
for (const [id, d] of Object.entries(BEAR_TYPES)) if (d.icon && !BEAR_BY_ICON[d.icon]) BEAR_BY_ICON[d.icon] = id;

function foxRig() {
  let r = POOL.rigs.get('fox');
  if (!r) { r = new FoxRig({ shadows: false }); POOL.rigs.set('fox', r); }
  return r;
}
function bearRig(type, def) {
  const k = 'bear:' + type + ':' + (def?.look?.seed ?? '');
  let r = POOL.rigs.get(k);
  if (!r) {
    r = new BearRig(type, def?.look ? def : BEAR_TYPES[type]);
    r.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    r.setLegsVisible?.(false);
    POOL.rigs.set(k, r);
  }
  return r;
}
function beaverRig(outfit, look, seed) {
  const k = 'beaver:' + outfit + ':' + seed + ':' + JSON.stringify(look || {});
  let r = POOL.rigs.get(k);
  if (!r) { r = new BeaverChibi({ look: look || {}, outfit, seed, shadows: false }); POOL.rigs.set(k, r); }
  return r;
}

const _b = new THREE.Box3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
// world box of a skinned mesh's vertices that mostly follow the named bones (the head,
// ears, jaw and hat of a one-mesh rig), in the current pose
function skinnedBox(mesh, names, box) {
  box.makeEmpty();
  const bones = mesh.skeleton.bones, want = new Set();
  bones.forEach((b, i) => { if (names.includes(b.name)) want.add(i); });
  const g = mesh.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, n = g.attributes.position.count;
  mesh.updateMatrixWorld(true);
  mesh.skeleton.update();
  for (let i = 0; i < n; i++) {
    let bi = -1, bw = 0;
    for (let c = 0; c < 4; c++) { const w = sw.getComponent(i, c); if (w > bw) { bw = w; bi = si.getComponent(i, c); } }
    if (!want.has(bi)) continue;
    mesh.getVertexPosition(i, _v);
    box.expandByPoint(_v.applyMatrix4(mesh.matrixWorld));
  }
  return box;
}
// pose a rig; returns { rig, box (world box of the head with hat + ears), below (bust: how far
// below the chin the frame reaches, world units: about half a skull = collar + shoulders) }
const LOOK_AT = new THREE.Vector3(0.1, 1.15, 6);
function poseFox(spec) {
  const r = foxRig();
  r.setOutfit(spec.outfit && spec.outfit !== 'wardrobe' ? spec.outfit : 'default'); // 'default' follows the wardrobe pick
  r.root.rotation.y = spec.turn ?? 0.3;
  r.play(spec.anim && r.anims.includes(spec.anim) ? spec.anim : 'idle', { fade: 0, restart: true });
  r.setExpression(spec.expr && r.expressions.includes(spec.expr) ? spec.expr : 'smug');
  r.lookAt(LOOK_AT);
  for (let i = 0; i < 6; i++) { r._blinkT = 99; r._blinkPh = -1; r.update(0.12); } // no mid-blink snapshots
  r.root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  r.head.traverse((o) => { if (o.isMesh && o.visible) box.expandByObject(o); });
  // his top hat is half a head tall: tiny icons keep only its lower part so the face reads
  const sk = new THREE.Box3().setFromObject(r.headMesh);
  const keep = spec.hat ?? (spec.small ? 0.45 : 1);
  if (keep < 1 && box.max.y > sk.max.y) box.max.y = sk.max.y + (box.max.y - sk.max.y) * keep;
  return { rig: r, box, below: (sk.max.y - sk.min.y) * 0.5 };
}
function poseBear(spec) {
  const type = BEAR_TYPES[spec.type] ? spec.type : spec.def?.id && BEAR_TYPES[spec.def.id] ? spec.def.id : 'office';
  const r = bearRig(type, spec.def);
  r.root.rotation.y = spec.turn ?? 0.3;
  r.setFace(spec.expr || 'neutral', { hold: 0 });
  for (let i = 0; i < 6; i++) { r.blinkT = 99; r.blinking = 0; r.pose('idle', 0.1); }
  r.root.updateMatrixWorld(true);
  const box = skinnedBox(r.body, ['head', 'jaw', 'earL', 'earR', 'hat'], new THREE.Box3());
  const sk = skinnedBox(r.body, ['head', 'jaw'], new THREE.Box3());
  return { rig: r, box, below: (sk.max.y - sk.min.y) * 0.5 };
}
function poseBeaver(spec) {
  const r = beaverRig(spec.outfit || 'overalls', spec.look, spec.seed ?? 3);
  r.root.rotation.y = spec.turn ?? 0.3;
  if (r.anims.includes('idle')) r.play('idle', { fade: 0, restart: true });
  try { r.setExpression(spec.expr && r.expressions.includes(spec.expr) ? spec.expr : null); } catch { /* ignore */ }
  r._blinkT = 99; r._blinkPh = -1;
  r.update(0.5);
  r.root.updateMatrixWorld(true);
  const box = skinnedBox(r.body, ['head', 'earL', 'earR', 'hatG'], new THREE.Box3());
  const sk = skinnedBox(r.body, ['head'], new THREE.Box3());
  return { rig: r, box, below: (sk.max.y - sk.min.y) * 0.55 };
}

// ------------------------------------------------------------------ render
const _sz = new THREE.Vector2();
function render(P, F, spec, w, h) {
  const B = F.box;
  const top = B.max.y, bot = spec.frame === 'bust' ? B.min.y - F.below : B.min.y;
  const cx = (B.min.x + B.max.x) / 2, cz = (B.min.z + B.max.z) / 2;
  const cam = P.view;
  cam.aspect = w / h;
  // fit the height, or the width when the head is wider than the frame's aspect
  const span = Math.max(top - bot, (B.max.x - B.min.x) / cam.aspect) * (spec.pad ?? 1.04);
  const cy = (top + bot) / 2 + (spec.dy || 0) * span;
  const fov = (cam.fov * Math.PI) / 180;
  const vis = cam.aspect < 1 ? span / cam.aspect : span;
  const d = vis / 2 / Math.tan(fov / 2) + (B.max.z - cz);
  cam.position.set(cx + 0.02, cy + d * 0.05, cz + d);
  cam.lookAt(cx, cy, cz);
  cam.near = Math.max(0.05, d - 3); cam.far = d + 3;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  const rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  rt.depthTexture = new THREE.DepthTexture(w, h);
  const r = P.r;
  r.getSize(_sz);
  if (_sz.x < w || _sz.y < h) r.setSize(Math.max(w, _sz.x), Math.max(h, _sz.y), false);
  r.setRenderTarget(rt);
  r.clear();
  r.render(P.stage, cam);
  r.setRenderTarget(null);
  const U = P.post.material.uniforms;
  U.tColor.value = rt.texture; U.tDepth.value = rt.depthTexture;
  U.size.value.set(w, h); U.cNear.value = cam.near; U.cFar.value = cam.far;
  U.crease.value = spec.crease ?? 0.06 * (d / 3);
  r.setViewport(0, r.getSize(_sz).y - h, w, h);
  r.clear();
  r.render(P.scene, P.cam);
  r.setViewport(0, 0, _sz.x, _sz.y);
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  out.getContext('2d').drawImage(r.domElement, 0, 0, w, h, 0, 0, w, h);
  out.style.imageRendering = 'pixelated';
  rt.depthTexture.dispose(); rt.dispose();
  return out;
}

const CACHE = new Map();
function keyOf(spec, w, h) {
  const out = spec.who === 'fox' ? (spec.outfit && spec.outfit !== 'wardrobe' ? spec.outfit : 'w:' + FOX_STYLE.outfit) : spec.outfit || '';
  return [spec.who, spec.type || spec.npc || '', spec.def?.look?.seed ?? '', spec.expr || '', out, spec.seed ?? '', JSON.stringify(spec.look || ''), spec.frame || 'head', spec.turn ?? '', spec.pad ?? '', spec.dy ?? '', spec.sticker ? 's' : '', spec.crease ?? '', spec.hat ?? '', spec.anim || '', w, h].join('|');
}

/** A 3D face (transparent canvas, w x h px, ink outlined), cached. Null without WebGL. */
export function faceCanvas(spec, w = 40, h = w) {
  w = Math.max(4, Math.round(w)); h = Math.max(4, Math.round(h));
  const key = keyOf(spec, w, h);
  if (CACHE.has(key)) return CACHE.get(key);
  let out = null;
  if (spec.who === 'npc') {
    out = NPC_RIGS[spec.npc] ? npcSnapshot(spec.npc, { w, h, frame: spec.frame === 'head' ? 'bust' : spec.frame || 'bust' }) : null;
  } else {
    const P = pool();
    if (!P) return null;
    let F = null;
    try {
      const sw = spec.sticker ? w - 4 : w, sh = spec.sticker ? h - 4 : h;
      if (spec.small == null && Math.min(sw, sh) <= 26) spec = { ...spec, small: true };
      F = spec.who === 'fox' ? poseFox(spec) : spec.who === 'bear' ? poseBear(spec) : spec.who === 'beaver' ? poseBeaver(spec) : null;
      if (F) {
        P.pivot.add(F.rig.root);
        out = render(P, F, spec, sw, sh);
        if (spec.sticker) out = stickerize(out, w, h);
      }
    } catch (e) { console.warn('faces3d', spec.who, e); out = null; }
    if (F) P.pivot.remove(F.rig.root);
    release();
  }
  if (CACHE.size > 400) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, out);
  return out;
}

// a die-cut sticker: 2px white border + ink edge around the render
function stickerize(src, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const a = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
  const img = x.createImageData(w, h), d = img.data;
  const A = (i, j) => { i -= 2; j -= 2; return i >= 0 && j >= 0 && i < src.width && j < src.height && a[(j * src.width + i) * 4 + 3] > 100; };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let near = 0;
    for (let v = -2; v <= 2 && near < 2; v++) for (let u = -2; u <= 2; u++) if (Math.abs(u) + Math.abs(v) <= 3 && A(i + u, j + v)) { near = Math.abs(u) + Math.abs(v) <= 2 ? 2 : 1; if (near === 2) break; }
    const k = (j * w + i) * 4;
    if (near === 2) { d[k] = 255; d[k + 1] = 253; d[k + 2] = 246; d[k + 3] = 255; } else if (near === 1) { d[k] = 42; d[k + 1] = 26; d[k + 2] = 20; d[k + 3] = 255; }
  }
  x.putImageData(img, 0, 0);
  x.drawImage(src, 2, 2);
  c.style.imageRendering = 'pixelated';
  return c;
}

const URLS = new Map();
/** data: URL of faceCanvas (cached). Null without WebGL. */
export function faceURL(spec, w = 40, h = w) {
  const cv = faceCanvas(spec, w, h);
  if (!cv) return null;
  let u = URLS.get(cv);
  if (!u) { u = cv.toDataURL('image/png'); URLS.set(cv, u); if (URLS.size > 400) URLS.delete(URLS.keys().next().value); }
  return u;
}

const dprK = () => Math.max(1, Math.min(3, Math.round((typeof window !== 'undefined' && window.devicePixelRatio) || 1)));
/** '<img>' of a 3D face shown at w x h CSS px (rendered at the device pixel size). '' without WebGL. */
export function faceImg(spec, w = 40, h = w, cls = '', style = '') {
  const k = dprK();
  const u = faceURL(spec, w * k, h * k);
  return u ? `<img class="px f3d ${cls}" src="${u}" width="${w}" height="${h}" alt="" draggable="false" style="image-rendering:pixelated;${style}">` : '';
}

// ------------------------------------------------------------------ sprite names -> specs
const FOX_SPRITE_EXPR = { smug: 'smug', greedy: 'greedy', shocked: 'shocked', laugh: 'laugh', wink: 'wink', angry: 'angry', worried: 'worried', sleepy: 'sleepy', happy: 'happy', proud: 'proud', teacher: 'teacher', horror: 'horror' };
const EXTRA = {
  bear: { who: 'bear', type: 'office', expr: 'neutral' },
  bear_happy: { who: 'bear', type: 'office', expr: 'happy' },
  bear_angry: { who: 'bear', type: 'office', expr: 'angry' },
  sticker_bear: { who: 'bear', type: 'office', expr: 'happy', sticker: true },
  fe_karen: { who: 'bear', type: 'office', expr: 'furious' },
  fe_sleep: { who: 'bear', type: 'office', expr: 'sleepy' },
  fe_tear: { who: 'bear', type: 'cub', expr: 'sad' },
  beaver: { who: 'beaver', outfit: 'toolbelt' },
  staff: { who: 'beaver', outfit: 'hardhat' },
  ind_worker: { who: 'beaver', outfit: 'hardhat' },
  fox: { who: 'fox', expr: 'smug', frame: 'head' },
};
export function spriteFaceSpec(name) {
  if (!name) return null;
  if (EXTRA[name]) return EXTRA[name];
  if (name.startsWith('fox_') && FOX_SPRITE_EXPR[name.slice(4)]) return { who: 'fox', expr: FOX_SPRITE_EXPR[name.slice(4)], frame: 'bust' };
  if (BEAR_BY_ICON[name]) return { who: 'bear', type: BEAR_BY_ICON[name], expr: 'neutral' };
  return null;
}

// ------------------------------------------------------------------ install
FACE3D.test = (name) => !!spriteFaceSpec(name);
FACE3D.sprite = (name, w, h) => {
  const spec = spriteFaceSpec(name);
  if (!spec) return null;
  const canvas = faceCanvas(spec, w, h);
  return canvas ? { canvas, url: faceURL(spec, w, h) } : null;
};
FACE3D.canvas = faceCanvas;
FACE3D.url = faceURL;
FACE3D.img = faceImg;

if (typeof window !== 'undefined') window.__faces3d = { faceCanvas, faceURL, faceImg, spriteFaceSpec, CACHE, POOL };
