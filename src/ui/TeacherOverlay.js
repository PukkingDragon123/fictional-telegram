// TeacherOverlay: Professor Reynard, in his teacher outfit, RUNS around the
// screen and the UI, hops onto toolbars, points at things with his finger-tipped
// pointer stick, draws chalk marks right on the screen and explains in comic
// speech bubbles. Replaces the tutorial's bouncing arrow (ui.pointAt) and the
// in-world fox bubbles.
//
//   import { TeacherOverlay } from './TeacherOverlay.js';
//   const t = new TeacherOverlay({ game, root: document.body });
//   await t.show();                    // runs in from the screen edge and waves: class is in session!
//   await t.goTo('tool:ebuy');         // runs there (hopping onto the toolbar) and points at it
//   t.circle('tool:ebuy');             // a chalk circle draws itself around the button
//   await t.say('Buy <b>2 fish</b> on e-Buy!', { wait: false, dur: 4 });
//   await t.hide();                    // bows and runs off, the chalk smudges away
//   t.dispose();
//
// TARGETS (goTo, aim, circle, underline, tick, cross, star, pulse, arrow ends, doodle spots)
//   Element | 'tool:<name>' (#toolbar .tool[data-tool=name] or [data-panel=name]) | 'clock'
//   | 'sel:<css>' or any CSS selector | { x, y } screen point | { left, top, width, height } rect
//   | THREE.Vector3 or { getWorldPos(v) } world point (projected through game.rig)
//   | () => any of the above (re-evaluated every frame: he follows it, marks stick to it)
//
// API (every Promise resolves, never rejects; calls are safe while hidden or disposed)
//   show({ from, at, greet }) -> Promise        from: 'left'|'right'; at: target to run to; greet: text | false
//   hide({ to, clear = true }) -> Promise       bows, runs off to 'left'|'right' (nearest edge), chalk fades
//   goTo(target, { side, speed }) -> Promise    resolves on arrival; side: 'auto'|'top'|'left'|'right'|'below'|'above'
//   aim(target | null)                          point at something from where he stands (null: stop)
//   say(html, { wait = true, dur, mood, expr }) -> Promise   resolves when the bubble closes
//       mood: normal | happy | excited | smug | wink | proud | shout | angry | scared | think | whisper
//       wait: tap anywhere (or Space / Enter) to continue; the bubble shows a bouncing ▼
//   circle(target, o) | underline(target, o) | tick(target, o) | cross(target, o) | star(target, o) -> Promise
//   arrow(from, to, o) -> Promise               from may be null: starts at Reynard
//   doodle(name, at, o) -> Promise              heart | fish | egg | sparkle | exclamation | question
//       o = { color: white|yellow|pink|blue|green|orange, dur, delay, pad, size, dx, dy, follow }
//       Promises resolve when the mark is fully drawn.
//   pulse(target, { color, period, times }) -> stop()   soft chalk rings around a target
//   clearChalk({ instant }) -> Promise          marks are wiped (smudge + fade)
//   skip()                                      tests: finish typing + close the bubble, finish drawings, snap to goal
//   step(seconds, dt = 1/30)                    tests: advance in fixed steps, render once
//   update(dt)                                  driven by its own rAF loop unless { autoUpdate: false }
//   busy | visible | waiting                    getters
//   dispose()
//
// RENDERING: three layers fixed over the whole viewport, all pointer-events: none
// (the UI under them stays clickable):
//   1. chalk canvas (2D, 1 px = 2 CSS px): chalk marks, pulses, dust, his blob shadow
//   2. fox canvas (WebGL, full viewport, rendered at 1/pixelScale, 1px outline, upscaled
//      with image-rendering: pixelated). Orthographic camera: world x = screen x / ppu,
//      world y = -screen y / ppu, so he can stand on any screen pixel. Only a scissor box
//      around him is rendered; nothing at all is rendered while he is hidden.
//   3. bubble layer (DOM, B&W pixel comic bubble like src/ui/Bubbles.js)
// While a bubble waits for a tap, a transparent catcher above everything takes the tap.
// Nothing is built until first use; the rAF loop only runs while something is on screen.
import * as THREE from 'three';
import { FoxRig } from '../entities/foxRig.js';
import defaultAudio from '../audio/audio.js';
import './fonts.css';
import './teacher.css';

const TAU = Math.PI * 2;
const { abs, min, max, sin, cos, hypot, sqrt, floor, round, ceil, PI } = Math;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- tuning
const CS = 2; // chalk canvas: CSS px per chalk pixel (matches the UI's 2x pixel art)
const BS = 2; // bubble: CSS px per art pixel
const FOX_H = 1.885; // rig height to the top of the hat (world units, FoxRig.headTop at rest)
const PITCH = 0.16; // we look down on him a little
const YAW_RUN = 0.8; // running sideways, turned toward us so we see his face
const YAW_PT_L = -0.32; // target on the screen-left: faces us, pointer arm stretched out sideways
const YAW_PT_R = 0.82; // target on the screen-right: turned toward it, near arm reaching forward
const RUN_SPEED = 660; // CSS px / s
const AIM_Z = 0.3; // world z of aim points (a little in front of him, so the arm stays visible)

const INK = [22, 17, 20];
const CHALK = {
  white: [[255, 253, 244], [238, 233, 218], [204, 197, 178]],
  yellow: [[255, 247, 190], [255, 224, 106], [228, 180, 62]],
  pink: [[255, 220, 232], [255, 160, 194], [226, 112, 148]],
  blue: [[222, 244, 255], [160, 214, 255], [104, 164, 228]],
  green: [[228, 255, 212], [164, 236, 136], [100, 186, 88]],
  orange: [[255, 226, 200], [255, 168, 112], [232, 112, 64]],
};

const MOODS = {
  normal: { variant: 'normal', expr: null },
  happy: { variant: 'normal', expr: 'happy' },
  excited: { variant: 'normal', expr: 'excited' },
  smug: { variant: 'normal', expr: 'smug' },
  wink: { variant: 'normal', expr: 'wink' },
  proud: { variant: 'normal', expr: 'proud' },
  shout: { variant: 'shout', expr: 'shocked' },
  angry: { variant: 'shout', expr: 'angry' },
  scared: { variant: 'normal', expr: 'worried' },
  worried: { variant: 'normal', expr: 'worried' },
  think: { variant: 'think', expr: 'confused' },
  whisper: { variant: 'normal', expr: 'scheming' },
};
const PAUSE = { '.': 0.16, '!': 0.16, '?': 0.16, ',': 0.08, '…': 0.2 };

function hash2(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = max(1, w); c.height = max(1, h); return c; };
const pick = (r, a) => a[floor(r() * a.length) % a.length];

// ================================================================= fox outline post pass
const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
// 1px outline, tinted toward the colour it borders; darker inner lines at depth steps
const POST_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 size;
uniform vec3 ink;
uniform float cNear;
uniform float cFar;
varying vec2 vUv;
float Z(vec2 o) { return -orthographicDepthToViewZ(texture2D(tDepth, vUv + o).x, cNear, cFar); }
void main() {
  vec2 px = 1.0 / size;
  vec4 c = texture2D(tColor, vUv);
  if (c.a < 0.5) {
    vec4 a = texture2D(tColor, vUv + vec2(px.x, 0.0));
    vec4 b = texture2D(tColor, vUv - vec2(px.x, 0.0));
    vec4 d = texture2D(tColor, vUv + vec2(0.0, px.y));
    vec4 e = texture2D(tColor, vUv - vec2(0.0, px.y));
    float n = max(max(a.a, b.a), max(d.a, e.a));
    if (n < 0.5) { gl_FragColor = vec4(0.0); return; }
    vec3 nb = (a.rgb * step(0.5, a.a) + b.rgb * step(0.5, b.a) + d.rgb * step(0.5, d.a) + e.rgb * step(0.5, e.a))
      / max(1.0, step(0.5, a.a) + step(0.5, b.a) + step(0.5, d.a) + step(0.5, e.a));
    gl_FragColor = vec4(mix(ink, nb * 0.3, 0.28), 1.0);
  } else {
    float z = Z(vec2(0.0));
    float zn = min(min(Z(vec2(px.x, 0.0)), Z(vec2(-px.x, 0.0))), min(Z(vec2(0.0, px.y)), Z(vec2(0.0, -px.y))));
    vec3 col = c.rgb;
    if (z - zn > 0.09) col = mix(col, ink, 0.6);
    gl_FragColor = vec4(col, 1.0);
  }
  #include <colorspace_fragment>
}
`;

// ================================================================= small pixel art (DOM)
const _urls = new Map();
function pixURL(key, rows, pal, S) {
  let u = _urls.get(key);
  if (u) return u;
  const h = rows.length, w = rows[0].length;
  const c = mkCanvas(w * S, h * S);
  const x = c.getContext('2d');
  for (let y = 0; y < h; y++)
    for (let i = 0; i < w; i++) {
      const k = rows[y][i];
      if (k === '.' || !pal[k]) continue;
      x.fillStyle = pal[k];
      x.fillRect(i * S, y * S, S, S);
    }
  u = c.toDataURL();
  _urls.set(key, u);
  return u;
}
const PAL = { k: 'rgb(22,17,20)', w: '#fff', g: '#c9c9d2' };
const ARROW_DOWN = ['wwwwwwwww', 'wkkkkkkkw', 'wwkkkkkww', '.wwkkkww.', '..wwkww..', '...www...'];
function puffRows(r) {
  const n = r * 2 + 3, rows = [];
  for (let y = 0; y < n; y++) {
    let s = '';
    for (let x = 0; x < n; x++) {
      const dx = x - n / 2 + 0.5, dy = y - n / 2 + 0.5, dd = dx * dx + dy * dy;
      s += dd <= r * r ? (dx + dy > r * 0.6 && (x + y) % 2 ? 'g' : 'w') : dd <= (r + 1.2) * (r + 1.2) ? 'k' : '.';
    }
    rows.push(s);
  }
  return rows;
}

// ================================================================= bubble art (canvas mask)
const BB_M = 9; // art px around the body (outline, shadow)
function inRR(px, py, bw, bh, R) {
  if (px < 0 || px > bw || py < 0 || py > bh) return false;
  const dx = max(R - px, 0, px - (bw - R)), dy = max(R - py, 0, py - (bh - R));
  return dx * dx + dy * dy <= R * R + 0.3;
}
function spikePoly(bw, bh, seed) {
  const a = bw / 2, b = bh / 2, r = rng(seed);
  const n = max(9, round((PI * (a + b)) / 10)), pts = [], off = r() * 0.5;
  for (let i = 0; i < n * 2; i++) {
    const th = ((i + off) / (n * 2)) * TAU, c = cos(th), s = sin(th);
    const x = a * Math.sign(c) * sqrt(abs(c)), y = b * Math.sign(s) * sqrt(abs(s));
    if (i % 2 === 0) {
      const L = 3.5 + r() * 3.5, nx = x / (a * a), ny = y / (b * b), nl = hypot(nx, ny) || 1;
      pts.push([a + x + (nx / nl) * L, b + y + (ny / nl) * L]);
    } else pts.push([a + x * 0.97, b + y * 0.95]);
  }
  return pts;
}
function inPoly(p, x, y) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function cloudCircles(bw, bh, seed) {
  const r = rng(seed), c = 6, out = [];
  const side = (x0, y0, x1, y1) => {
    const n = max(1, round(hypot(x1 - x0, y1 - y0) / 10));
    for (let i = 0; i < n; i++) out.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, 6 + r() * 1.8]);
  };
  side(c, c, bw - c, c); side(bw - c, c, bw - c, bh - c); side(bw - c, bh - c, c, bh - c); side(c, bh - c, c, c);
  return out;
}
// tail: a tapered quadratic curve from the body edge (base b, normal n) to the tip t
function tailSamples(g) {
  const T = g.tail;
  if (!T) return null;
  const L = hypot(T.tx - T.bx, T.ty - T.by);
  if (L < 2) return null;
  const cx = T.bx + T.nx * L * 0.55, cy = T.by + T.ny * L * 0.55;
  const HW = g.variant === 'shout' ? 5 : 4, N = 18, s = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    s.push([a * T.bx + b * cx + c * T.tx, a * T.by + b * cy + c * T.ty, HW * Math.pow(1 - u, 1.15) + 0.5, u]);
  }
  return s;
}
function drawBubbleArt(cv, g) {
  const { bw, bh, variant } = g;
  const tail = tailSamples(g);
  let x0 = 0, y0 = 0, x1 = bw, y1 = bh;
  if (tail) for (const [x, y, w] of tail) { x0 = min(x0, x - w); y0 = min(y0, y - w); x1 = max(x1, x + w); y1 = max(y1, y + w); }
  const M = BB_M;
  const ox = ceil(M - x0), oy = ceil(M - y0);
  const W = ceil(x1 - x0 + M * 2), H = ceil(y1 - y0 + M * 2);
  if (cv.width !== W) cv.width = W;
  if (cv.height !== H) cv.height = H;
  const R = min(5, floor(bh / 2));
  let body;
  if (variant === 'shout') { const p = spikePoly(bw, bh, g.seed); body = (px, py) => inPoly(p, px, py); }
  else if (variant === 'think') {
    const circ = cloudCircles(bw, bh, g.seed), c = 6;
    body = (px, py) => {
      if (px > c && px < bw - c && py > c && py < bh - c) return true;
      for (const k of circ) { const dx = px - k[0], dy = py - k[1]; if (dx * dx + dy * dy <= k[2] * k[2]) return true; }
      return false;
    };
  } else body = (px, py) => inRR(px, py, bw, bh, R);
  let inTail = () => false;
  if (tail && variant === 'think') {
    // three little thought bubbles drifting toward his head
    const dots = [[0.3, 3.2], [0.64, 2.3], [0.95, 1.5]].map(([u, r]) => {
      const s = tail[round(u * (tail.length - 1))];
      return [s[0], s[1], r];
    });
    inTail = (px, py) => dots.some((d) => (px - d[0]) ** 2 + (py - d[1]) ** 2 <= d[2] * d[2]);
  } else if (tail) {
    inTail = (px, py) => {
      for (const s of tail) { const dx = px - s[0], dy = py - s[1]; if (dx * dx + dy * dy <= s[2] * s[2]) return true; }
      return false;
    };
  }
  const N = W * H, mask = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    const py = y - oy + 0.5;
    for (let x = 0; x < W; x++) {
      const px = x - ox + 0.5;
      if (body(px, py) || inTail(px, py)) mask[y * W + x] = 1;
    }
  }
  const O = 2, offs = [];
  for (let dy = -O; dy <= O; dy++) for (let dx = -O; dx <= O; dx++) if ((dx || dy) && dx * dx + dy * dy <= O * O + 0.5) offs.push([dx, dy]);
  const line = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (mask[i]) continue;
      for (const [dx, dy] of offs) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && mask[yy * W + xx]) { line[i] = 1; break; }
      }
    }
  const img = new ImageData(W, H), d = img.data;
  const solid = (i) => mask[i] || line[i];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x, o = i * 4;
      let c = null, a = 255;
      if (line[i]) c = INK;
      else if (mask[i]) {
        c = [255, 255, 255];
        const j = (y + 2) * W + x + 1; // soft dithered inner shade along the lower-right inside edge
        if (y + 2 < H && x + 1 < W && line[j] && !line[(y + 1) * W + x] && ((x + y) & 1) === 0) c = [214, 214, 222];
      } else if (x >= 1 && y >= 2 && solid((y - 2) * W + x - 1) && ((x + y) & 1) === 0) { c = INK; a = 200; }
      if (c) { d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = a; }
    }
  if (variant === 'normal') {
    // gloss tick in the top-left: the classic cartoon shine
    for (const [tx, ty] of [[1, 0], [2, 0], [3, 0], [0, 1], [0, 2]]) {
      const i = (oy + 2 + ty) * W + ox + 3 + tx;
      if (mask[i] && !line[i]) { d[i * 4] = INK[0]; d[i * 4 + 1] = INK[1]; d[i * 4 + 2] = INK[2]; d[i * 4 + 3] = 255; }
    }
  }
  cv.getContext('2d').putImageData(img, 0, 0);
  return { W, H, ox, oy };
}

// ================================================================= chalk shapes
// Shapes are lists of strokes; a stroke is a dense polyline in CSS px relative to the
// mark's anchor point. Wobble makes them look hand drawn.
function resample(pts, step = 1.5) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = hypot(b[0] - a[0], b[1] - a[1]);
    let s = step - carry;
    while (s <= L) { const u = s / L; out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); s += step; }
    carry = L - (s - step);
  }
  const last = pts[pts.length - 1], o = out[out.length - 1];
  if (hypot(last[0] - o[0], last[1] - o[1]) > 0.3) out.push(last);
  return out;
}
function wobble(pts, amp, r) {
  if (amp <= 0 || pts.length < 3) return pts;
  const p1 = r() * TAU, p2 = r() * TAU, f1 = 1 / (16 + r() * 10), f2 = 1 / (6 + r() * 4);
  let s = 0;
  return pts.map((p, i) => {
    if (i) s += hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const a = pts[max(0, i - 1)], b = pts[min(pts.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const nl = hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    const w = amp * (sin(s * f1 + p1) * 0.65 + sin(s * f2 + p2) * 0.35);
    return [p[0] + nx * w, p[1] + ny * w];
  });
}
const curve = (n, f) => { const o = []; for (let i = 0; i <= n; i++) o.push(f(i / n)); return o; };
function quadPts(a, c, b, n = 24) {
  return curve(n, (u) => { const k0 = (1 - u) * (1 - u), k1 = 2 * u * (1 - u), k2 = u * u; return [k0 * a[0] + k1 * c[0] + k2 * b[0], k0 * a[1] + k1 * c[1] + k2 * b[1]]; });
}
const dot = (x, y, r = 1.6) => curve(10, (u) => [x + cos(u * TAU) * r, y + sin(u * TAU) * r]);

const DOODLES = {
  heart(s) {
    const k = s / 34;
    return [curve(56, (u) => { const t = u * TAU; return [16 * sin(t) ** 3 * k, -(13 * cos(t) - 5 * cos(2 * t) - 2 * cos(3 * t) - cos(4 * t)) * k]; })];
  },
  fish(s) {
    const k = s / 34;
    const body = [...quadPts([16 * k, 0], [2 * k, -15 * k], [-10 * k, 1 * k], 18), ...quadPts([-10 * k, 1 * k], [2 * k, 14 * k], [16 * k, 0], 18).slice(1)];
    const tail = [[-9 * k, 1 * k], [-19 * k, -7 * k], [-17 * k, 1 * k], [-19 * k, 8 * k], [-9 * k, 1 * k]];
    return [body, tail, dot(8 * k, -3 * k, 1.4)];
  },
  egg(s) {
    const k = s / 34;
    const shell = curve(48, (u) => { const t = -PI / 2 + u * TAU * 1.04, sy = sin(t); return [cos(t) * 11 * k * (1 + 0.12 * sy), sy * (sy < 0 ? 16 : 12.5) * k]; });
    const crack = [[-10 * k, 1 * k], [-6 * k, -3 * k], [-2 * k, 2 * k], [2 * k, -3 * k], [6 * k, 2 * k], [10 * k, -1 * k]]; // about to hatch
    return [shell, crack];
  },
  sparkle(s) {
    const R = s * 0.5;
    const star = curve(64, (u) => { const t = u * TAU + 0.02; return [R * cos(t) ** 3, R * sin(t) ** 3]; });
    return [star, dot(R * 0.85, -R * 0.75, 1.2), dot(-R * 0.8, R * 0.7, 1)];
  },
  exclamation(s) {
    return [[[0, -s * 0.5], [-1, -s * 0.15], [0, s * 0.17]], dot(0, s * 0.42, 1.8)];
  },
  question(s) {
    const r = s * 0.27, cy = -s * 0.22;
    const hook = curve(28, (u) => { const a = PI * 1.12 + u * PI * 1.25; return [cos(a) * r, cy + sin(a) * r]; });
    const last = hook[hook.length - 1];
    hook.push([last[0] * 0.3, last[1] + s * 0.14], [0, s * 0.16]);
    return [hook, dot(0, s * 0.42, 1.8)];
  },
};

// ================================================================= the overlay
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

export class TeacherOverlay {
  /**
   * @param {object} o
   *   game        the Game (optional): game.audio, game.rig.worldToScreen for world targets
   *   root        element the fixed layers are appended to (default document.body)
   *   audio       { play(name, o), babble(voice, text, o) } (default game.audio, else src/audio/audio.js)
   *   size        his height in CSS px, hat included (default 132; phoneSize below 600 px wide: 100)
   *   pixelScale  CSS px per fox pixel (default 2)
   *   zIndex      base z-index: chalk, fox +1, bubble +2, tap catcher +3 (default 56)
   *   autoUpdate  run its own rAF loop (default true); false: call update(dt) every frame
   *   project     (vec3) -> { x, y, visible } for world targets (default game.rig.worldToScreen)
   */
  constructor({ game = null, root = null, audio = null, size = 132, phoneSize = 100, pixelScale = 2, zIndex = 56, autoUpdate = true, project = null } = {}) {
    this.game = game;
    this.root = root || (typeof document !== 'undefined' ? document.body : null);
    this.audio = audio || game?.audio || defaultAudio;
    this.opts = { size, phoneSize, zIndex };
    this.ps = max(1, round(pixelScale));
    this.autoUpdate = autoUpdate;
    this.project = project;
    this.speed = RUN_SPEED;
    this.time = 0;
    this._built = false;
    this._disposed = false;
    this._raf = 0;
    this._last = 0;
    this._tick = this._tick.bind(this);
    this._onResize = () => { this._needResize = true; this._wake(); };
    this._onKey = (e) => this._key(e);
    // fox state (screen px; y = feet)
    this.f = { mode: 'hidden', x: -200, y: 0, hop: 0, yaw: 0, yawV: 0, sq: 1, sqV: 0, lean: 0, leanV: 0, face: 1, speed: 0 };
    this.legs = []; // queued trip legs
    this.trip = null;
    this._tgt = null; // { target, side, opts, R, spot, resolve }
    this._aimT = null; // target he points at
    this._shot = null; // one-shot animation playing
    this._tapT = 3;
    this.marks = [];
    this.pulses = [];
    this.parts = [];
    this.bub = null;
    this._enterRes = []; this._leaveRes = [];
    this._rc = new Map(); // per-frame target cache
    this._lastBox = null;
    this._shadow = { a: 0 };
    this._dirty2D = false;
  }

  // ---------------------------------------------------------------- getters
  get visible() { return this.f.mode !== 'hidden'; }
  get waiting() { return !!(this.bub && this.bub.wait && !this.bub.closing); }
  get busy() {
    const f = this.f;
    return !!(this.trip || this.legs.length || f.mode === 'enter' || f.mode === 'exit' || (this.bub && !this.bub.closing) || this.marks.some((m) => !m.done));
  }

  // ---------------------------------------------------------------- public API
  show({ from = null, at = null, greet = 'Class is in session!', side = 'auto' } = {}) {
    if (this._disposed) return Promise.resolve();
    this._build();
    const f = this.f;
    if (f.mode === 'enter') {
      if (at) this._setTarget(at, { side });
      return new Promise((r) => this._enterRes.push(r));
    }
    if (f.mode === 'stand') return at ? this.goTo(at, { side }) : Promise.resolve();
    const wasLeaving = f.mode === 'exit';
    this._resizeIfNeeded();
    const p = new Promise((r) => this._enterRes.push(r));
    this._tgt = null;
    this._aimT = null;
    if (at) this._setTarget(at, { side });
    const home = this._home();
    // the entrance re-reads its goal every frame: a goTo() meanwhile redirects him
    const goal = () => (this._tgt && this._resolve(this._tgt.target) ? this._spotFor(this._tgt, true) : home);
    const spot = goal();
    const from2 = from || (spot.x < this.W / 2 ? 'left' : 'right');
    if (!wasLeaving) {
      f.x = from2 === 'left' ? -this.ppu * 1.4 : this.W + this.ppu * 1.4;
      f.y = spot.y;
      f.hop = 0;
      f.yaw = from2 === 'left' ? YAW_RUN : -YAW_RUN;
      f.yawV = 0;
      f.face = from2 === 'left' ? 1 : -1;
      this.rig.setExpression(null);
      this.rig.play(this._pick('run'), { fade: 0 });
      this.rig.update(0.3);
    }
    this._resolveAll(this._leaveRes);
    this._shot = null;
    f.mode = 'enter';
    this._greet = greet;
    this._plan(goal, { onArrive: () => this._arriveEnter() });
    this.foxCv.classList.remove('tch-off');
    this.chalkCv.classList.remove('tch-off');
    this._wake();
    return p;
  }

  hide({ to = null, clear = true } = {}) {
    const f = this.f;
    if (this._disposed || f.mode === 'hidden') return Promise.resolve();
    const p = new Promise((r) => this._leaveRes.push(r));
    if (f.mode === 'exit') return p;
    this._closeBubble(false);
    if (clear) this.clearChalk();
    for (const q of this.pulses) q.stopping = true;
    this._resolveAll(this._enterRes);
    if (this._tgt?.resolve) this._resolveAll([this._tgt.resolve]);
    this._tgt = null;
    this._aimT = null;
    this.legs = [];
    this.trip = null;
    f.mode = 'exit';
    const side = to || (f.x < this.W / 2 ? 'left' : 'right');
    const run = () => {
      if (f.mode !== 'exit') return;
      this._shot = null;
      const x = side === 'left' ? -this.ppu * 1.6 : this.W + this.ppu * 1.6;
      const y = f.y;
      this._plan(() => ({ x, y }), { onArrive: () => this._arriveExit(), skid: false });
      this._sfx('teach_swish', { volume: 0.25 });
    };
    // a fancy bow first (sped up: the classic bow is long)
    const bow = this._pick('bow_fancy', 'bow');
    this._oneShot(bow, { speed: bow === 'bow' ? 1.7 : 1, onDone: run });
    this.rig.setExpression('proud', { hold: 1.2 });
    this._wake();
    return p;
  }

  goTo(target, { side = 'auto', speed = null } = {}) {
    if (this._disposed || target == null) return Promise.resolve();
    this._build();
    const f = this.f;
    // hidden: run in straight to the target
    if (f.mode === 'hidden' || f.mode === 'exit') return this.show({ at: target, greet: false, side });
    if (this._tgt?.resolve) { const r = this._tgt.resolve; this._tgt.resolve = null; r(); }
    const p = new Promise((r) => this._setTarget(target, { side, speed, resolve: r }));
    if (f.mode === 'enter') return p; // the entrance leg re-reads the goal every frame
    if (!this._resolve(target)) { this._tgt.pending = true; this._wake(); return p; } // runs there once it exists
    this._plan(() => this._spotFor(this._tgt, true), { speed, onArrive: () => this._arriveTarget() });
    this._wake();
    return p;
  }

  aim(target) {
    this._aimT = target == null ? null : target;
    if (this._aimT != null) this._tapT = 1.2 + Math.random();
    this._wake();
  }

  say(html, { wait = true, dur = null, mood = 'normal', expr = null } = {}) {
    if (this._disposed) return Promise.resolve();
    this._build();
    if (this.f.mode === 'hidden' || this.f.mode === 'exit') this.show({ greet: false });
    this._closeBubble(true);
    return this._openBubble(String(html ?? ''), { wait, dur, mood: MOODS[mood] ? mood : 'normal', expr });
  }

  circle(target, o = {}) {
    return this._mark('circle', target, o, (R, r) => {
      const pad = o.pad ?? 9;
      const rx = max(14, R.w / 2 + pad), ry = max(12, R.h / 2 + pad * 0.85);
      const a0 = -2.25 + (r() - 0.5) * 0.4, sweep = TAU + 0.5 + r() * 0.25, ph = r() * TAU;
      const n = ceil((rx + ry) * 0.9);
      return [curve(n, (u) => {
        const a = a0 + u * sweep, k = 1 + 0.045 * sin(a * 2 + ph) + u * 0.07;
        return [cos(a) * rx * k, sin(a) * ry * k];
      })];
    }, { dur: o.dur ?? 0.6, color: o.color ?? 'yellow', brush: 1.7 });
  }

  underline(target, o = {}) {
    return this._mark('underline', target, o, (R, r) => {
      const x0 = -R.w / 2 - 4, x1 = R.w / 2 + 6, y = R.h / 2 + (o.pad ?? 6);
      const L = x1 - x0, ph = r() * TAU;
      const line = curve(ceil(L / 3), (u) => [x0 + u * L, y + sin(u * 3 + ph) * 1.2 - (u > 0.86 ? ((u - 0.86) / 0.14) ** 2 * 5 : 0)]);
      if (!o.double) return [line];
      return [line, curve(ceil(L / 3), (u) => [x0 + 8 + u * (L - 14), y + 6 + sin(u * 2.6 + ph + 1) * 1.1])];
    }, { dur: o.dur ?? 0.36, color: o.color ?? 'white', brush: 1.6 });
  }

  tick(target, o = {}) {
    return this._mark('tick', target, o, (R) => {
      const s = clamp(min(R.w, R.h) * 0.6, 20, 36);
      const cx = o.center ? 0 : R.w / 2 - s * 0.15, cy = o.center ? 0 : -R.h / 2 + s * 0.1;
      return [[[cx - s * 0.45, cy - s * 0.02], [cx - s * 0.28, cy + s * 0.16], [cx - s * 0.08, cy + s * 0.4], [cx + s * 0.18, cy - s * 0.02], [cx + s * 0.55, cy - s * 0.52]]];
    }, { dur: o.dur ?? 0.32, color: o.color ?? 'green', brush: 2.0 });
  }

  cross(target, o = {}) {
    return this._mark('cross', target, o, (R) => {
      const s = clamp(min(R.w, R.h) * 0.75, 22, 44) / 2;
      return [[[-s, -s], [s * 0.1, s * 0.05], [s, s * 1.02]], [[s * 0.95, -s * 1.05], [0, s * 0.02], [-s * 0.98, s * 0.95]]];
    }, { dur: o.dur ?? 0.36, color: o.color ?? 'pink', brush: 1.9 });
  }

  star(target, o = {}) {
    return this._mark('star', target, o, (R) => {
      const s = o.size ?? clamp(min(R.w, R.h) * 0.5, 16, 26);
      const cx = o.center ? 0 : R.w / 2 + 2, cy = o.center ? 0 : -R.h / 2 - 2;
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const a = -PI / 2 + (i * TAU * 2) / 5 + (i === 10 ? 0.08 : 0);
        pts.push([cx + cos(a) * s, cy + sin(a) * s]);
      }
      return [pts];
    }, { dur: o.dur ?? 0.55, color: o.color ?? 'yellow', brush: 1.5 });
  }

  arrow(from, to, o = {}) {
    if (this._disposed) return Promise.resolve();
    this._build();
    const src = from == null ? () => this._foxChest() : from;
    // anchored to the destination; the start is read once when drawing begins
    return this._mark('arrow', to, { ...o, _need: src }, (R, r) => {
      const S = this._resolve(src);
      if (!S) return null;
      const b = R, aC = { x: S.x + S.w / 2, y: S.y + S.h / 2 };
      const bC = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      const end = b.pt ? toward(bC, aC, 14) : sideMid(b, aC, 7);
      const start = S.pt ? toward(aC, bC, 6) : sideMid(S, bC, 6);
      // relative to the destination centre
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const A = [start.x - cx, start.y - cy], B = [end.x - cx, end.y - cy];
      const dx = B[0] - A[0], dy = B[1] - A[1], L = hypot(dx, dy) || 1;
      const bend = (o.bend ?? (dx >= 0 ? -1 : 1)) * min(60, L * 0.2);
      const C = [(A[0] + B[0]) / 2 - (dy / L) * bend, (A[1] + B[1]) / 2 + (dx / L) * bend];
      const shaft = quadPts(A, C, B, max(10, ceil(L / 6)));
      // head from the curve's end tangent
      const tx = B[0] - C[0], ty = B[1] - C[1], tl = hypot(tx, ty) || 1;
      const ux = tx / tl, uy = ty / tl, hl = clamp(L * 0.16, 10, 16), sp = 0.5 + r() * 0.08;
      const h1 = [B[0] - (ux * cos(sp) - uy * sin(sp)) * hl, B[1] - (uy * cos(sp) + ux * sin(sp)) * hl];
      const h2 = [B[0] - (ux * cos(-sp) - uy * sin(-sp)) * hl, B[1] - (uy * cos(-sp) + ux * sin(-sp)) * hl];
      return [shaft, [h1, B], [B, h2]];
    }, { dur: o.dur ?? 0.62, color: o.color ?? 'white', brush: 1.6 });
  }

  doodle(name, at, o = {}) {
    const fn = DOODLES[name];
    if (!fn) { console.warn('TeacherOverlay: unknown doodle', name); return Promise.resolve(); }
    const color = o.color ?? { heart: 'pink', fish: 'blue', egg: 'white', sparkle: 'yellow', exclamation: 'orange', question: 'white' }[name];
    return this._mark('doodle', at, o, () => fn(o.size ?? 44), { dur: o.dur ?? 0.7, color, brush: 1.45 });
  }

  pulse(target, { color = 'yellow', period = 1.5, times = Infinity } = {}) {
    if (this._disposed || target == null) return () => {};
    this._build();
    const q = { target, color, period, times, t: 0, stopping: false };
    this.pulses.push(q);
    this._wake();
    return () => { q.stopping = true; };
  }

  clearChalk({ instant = false } = {}) {
    const live = this.marks.filter((m) => !m.fade);
    if (!live.length) return Promise.resolve();
    if (instant) {
      for (const m of live) { this._finishMark(m); m.fade = { t: 1, T: 1 }; }
      this.marks = this.marks.filter((m) => !m.fade);
      this._dirty2D = true;
      this._wake();
      return Promise.resolve();
    }
    this._sfx('chalk_erase', { volume: 0.35 });
    const ps = live.map((m, i) => {
      if (!m.done) this._finishMark(m);
      m.fade = { t: -i * 0.06, T: 0.85 };
      return new Promise((r) => (m.fade.resolve = r));
    });
    this._wake();
    return Promise.all(ps).then(() => {});
  }

  skip() {
    if (!this._built) return;
    if (this.bub && !this.bub.closing) this._closeBubble(true);
    for (const m of this.marks) if (!m.done) this._finishMark(m);
    for (const m of this.marks) if (m.fade) m.fade.t = m.fade.T;
    this._finishTrips();
    if (this._shot) { const s = this._shot; this._shot = null; s.onDone?.(); }
    this._finishTrips(); // a one-shot may have started a trip (hide: bow, then run off)
    this._wake();
  }

  _finishTrips() {
    for (let guard = 0; (this.trip || this.legs.length) && guard < 8; guard++) {
      if (!this.trip) this._nextLeg();
      const tr = this.trip;
      if (!tr) break;
      tr.t = tr.T;
      this._stepTrip(0);
    }
  }

  step(seconds, dt = 1 / 30) {
    this._skipRender = true;
    for (let t = 0; t < seconds - 1e-6; t += dt) this.update(dt);
    this._skipRender = false;
    this.update(0);
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    cancelAnimationFrame(this._raf); this._raf = 0;
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKey);
    this._resolveAll(this._enterRes); this._resolveAll(this._leaveRes);
    if (this._tgt?.resolve) this._tgt.resolve();
    if (this.bub) this.bub.resolve();
    for (const m of this.marks) { m.resolve?.(); m.fade?.resolve?.(); }
    if (!this._built) return;
    this.rig.dispose();
    this._propDispose?.();
    this.rt.dispose(); this.rt.depthTexture.dispose();
    this.post.material.dispose(); this.post.geometry.dispose();
    this.renderer.dispose();
    for (const el of [this.chalkCv, this.foxCv, this.bubLayer, this.catcher]) el.remove();
    this._built = false;
  }

  // ---------------------------------------------------------------- build
  _build() {
    if (this._built || this._disposed) return;
    this._built = true;
    const z = this.opts.zIndex;
    const root = this.root;
    // chalk + fx (2D, low res)
    const cc = (this.chalkCv = mkCanvas(2, 2));
    cc.className = 'tch-layer tch-chalk tch-off';
    cc.style.zIndex = String(z);
    this.cx = cc.getContext('2d');
    // fox (WebGL)
    const renderer = (this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' }));
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;
    const fc = (this.foxCv = renderer.domElement);
    fc.className = 'tch-layer tch-fox tch-off';
    fc.style.zIndex = String(z + 1);
    // bubble layer + tap catcher
    const bl = (this.bubLayer = document.createElement('div'));
    bl.className = 'tch-bubbles';
    bl.style.zIndex = String(z + 2);
    bl.style.setProperty('--px', BS + 'px');
    bl.style.setProperty('--tch-more', `url(${pixURL('more' + BS, ARROW_DOWN, PAL, BS)})`);
    const ct = (this.catcher = document.createElement('div'));
    ct.className = 'tch-catch';
    ct.style.zIndex = String(z + 3);
    ct.addEventListener('pointerdown', (e) => { if (!this.waiting) return; e.preventDefault(); e.stopPropagation(); this._downAt = performance.now(); });
    ct.addEventListener('pointerup', (e) => { if (!this.waiting) return; e.preventDefault(); e.stopPropagation(); this._advance(); });
    ct.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    root.appendChild(cc); root.appendChild(fc); root.appendChild(bl); root.appendChild(ct);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('keydown', this._onKey);
    if (document.fonts?.load) {
      Promise.all([document.fonts.load(`32px 'TBME Body'`), document.fonts.load(`36px 'TBME Title'`)])
        .then(() => { if (this.bub && !this.bub.closing) this._measureBubble(this.bub); })
        .catch(() => {});
    }

    // scene: same lights as the corner notifier
    const scene = (this.scene = new THREE.Scene());
    scene.add(new THREE.HemisphereLight(0xffe4c4, 0x6a4a7a, 1.35));
    const key = new THREE.DirectionalLight(0xfff0d6, 2.3); key.position.set(-1.6, 2.6, 3.2); scene.add(key);
    const fill = new THREE.DirectionalLight(0xffc6a0, 0.55); fill.position.set(2.5, 0.4, 2); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd27a, 2.6); rim.position.set(2.4, 1.8, -2.6); scene.add(rim);
    const rim2 = new THREE.DirectionalLight(0xff9fd0, 1.4); rim2.position.set(-2.6, 1.2, -2.2); scene.add(rim2);
    // stage (feet position + tilt) > squash > rig.root (yaw)
    this.stage = new THREE.Group();
    this.stage.rotation.x = PITCH;
    this.squash = new THREE.Group();
    this.stage.add(this.squash);
    scene.add(this.stage);
    const rig = (this.rig = new FoxRig({ shadows: false }));
    rig.setOutfit?.('teacher');
    if (rig.holdProp) rig.holdProp('pointer');
    else this._fallbackPointer();
    // his real height in this outfit (the mortarboard is flatter than the top hat)
    rig.update(0);
    this.foxH = clamp(rig.headTop(new THREE.Vector3()).y, 1.2, 2.4) || FOX_H;
    this.squash.add(rig.root);
    rig.onEvent = (n) => this._rigEvent(n);
    this._lookV = new THREE.Vector3();
    this._aimV = new THREE.Vector3();
    // camera: orthographic, 1 world unit = ppu CSS px, screen top-left = world (0, 0)
    this.camera = new THREE.OrthographicCamera(0, 1, 0, -1, 1, 60);
    this.camera.position.set(0, 0, 30);
    this.camera.updateMatrixWorld();
    // post: outline + upscale
    this.rt = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.rt.depthTexture = new THREE.DepthTexture(2, 2);
    this.rt.scissorTest = true;
    const mat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG,
      uniforms: {
        tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture },
        size: { value: new THREE.Vector2(2, 2) }, ink: { value: new THREE.Color(0x150910) },
        cNear: { value: this.camera.near }, cFar: { value: this.camera.far },
      },
      depthTest: false, depthWrite: false, transparent: false,
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.post = new THREE.Mesh(g, mat);
    this.post.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(this.post);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._needResize = true;
    this._resizeIfNeeded();
  }

  // a plain stick with a pointing glove, only while FoxRig has no holdProp('pointer')
  _fallbackPointer() {
    const grp = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x8a5a2a });
    const glove = new THREE.MeshLambertMaterial({ color: 0xfff6e8 });
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.56, 0.03), wood);
    stick.position.set(0, -0.26, 0.02);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.06), glove);
    hand.position.set(0, -0.56, 0.02);
    const finger = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.025), glove);
    finger.position.set(0, -0.62, 0.02);
    grp.add(stick, hand, finger);
    this.rig.hold?.(grp);
    this._propDispose = () => { stick.geometry.dispose(); hand.geometry.dispose(); finger.geometry.dispose(); wood.dispose(); glove.dispose(); };
  }

  _resizeIfNeeded() {
    if (!this._needResize || !this._built) return;
    this._needResize = false;
    const W = (this.W = max(1, window.innerWidth)), H = (this.H = max(1, window.innerHeight));
    const ps = this.ps;
    const size = W < 600 ? this.opts.phoneSize : this.opts.size;
    this.ppu = size / (this.foxH || FOX_H);
    const rw = (this.rw = ceil(W / ps)), rh = (this.rh = ceil(H / ps));
    this.renderer.setSize(rw, rh, false);
    this.foxCv.style.width = rw * ps + 'px';
    this.foxCv.style.height = rh * ps + 'px';
    this.rt.setSize(rw, rh);
    this.post.material.uniforms.size.value.set(rw, rh);
    const cam = this.camera;
    cam.left = 0; cam.right = (rw * ps) / this.ppu; cam.top = 0; cam.bottom = -(rh * ps) / this.ppu;
    cam.updateProjectionMatrix();
    const cw = ceil(W / CS), ch = ceil(H / CS);
    this.chalkCv.width = cw; this.chalkCv.height = ch;
    this.chalkCv.style.width = cw * CS + 'px';
    this.chalkCv.style.height = ch * CS + 'px';
    this.cx.imageSmoothingEnabled = false;
    this.bubLayer.style.setProperty('--tch-maxw', min(240, W - 56) + 'px');
    this._lastBox = null;
    this._dirty2D = true;
    if (this.bub) this._measureBubble(this.bub);
  }

  // ---------------------------------------------------------------- loop
  _wake() {
    if (!this.autoUpdate || this._raf || this._disposed || !this._built) return;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }

  _tick(now) {
    this._raf = 0;
    const dt = min(0.1, max(0, (now - this._last) / 1000));
    this._last = now;
    this.update(dt);
    if (this._alive()) this._raf = requestAnimationFrame(this._tick);
  }

  _alive() {
    return this.f.mode !== 'hidden' || !!this.bub || this.parts.length > 0 || this.pulses.length > 0
      || this.marks.some((m) => !m.done || m.fade || m.live);
  }

  update(dt) {
    if (!this._built || this._disposed) return;
    dt = clamp(+dt || 0, 0, 0.1);
    this.time += dt;
    this._rc.clear();
    this._inUpdate = true;
    this._resizeIfNeeded();
    if (this.f.mode !== 'hidden') this._updateFox(dt);
    this._updateMarks(dt);
    this._updatePulses(dt);
    this._updateParts(dt);
    this._updateBubble(dt);
    if (!this._skipRender) {
      if (this.f.mode !== 'hidden') this._renderFox();
      if (this._dirty2D) this._draw2D();
    }
    this._inUpdate = false;
  }

  // ---------------------------------------------------------------- targets
  // -> { x, y, w, h, el, bar, pt } in viewport CSS px, or null. Cached for one update().
  _resolve(t) {
    if (t == null) return null;
    if (this._inUpdate) { const c = this._rc.get(t); if (c !== undefined) return c; }
    let r = null;
    try { r = this._resolve1(typeof t === 'function' ? t() : t); } catch (e) { r = null; }
    if (this._inUpdate) this._rc.set(t, r);
    return r;
  }

  _resolve1(t) {
    if (t == null) return null;
    if (typeof t === 'string') {
      let el = null;
      if (t.startsWith('tool:')) {
        const k = t.slice(5);
        el = document.querySelector(`#toolbar .tool[data-tool="${k}"], #toolbar [data-panel="${k}"], .tool[data-tool="${k}"], [data-panel="${k}"]`);
      } else if (t === 'clock') el = document.querySelector('#clockwrap, .bigclock-host, .clock');
      else el = document.querySelector(t.startsWith('sel:') ? t.slice(4) : t);
      return el ? this._resolve1(el) : null;
    }
    if (typeof Element !== 'undefined' && t instanceof Element) {
      if (!t.isConnected) return null;
      const b = t.getBoundingClientRect();
      if (b.width <= 0 && b.height <= 0) return null;
      const bar = this._barOf(t, b);
      return { x: b.left, y: b.top, w: b.width, h: b.height, el: t, bar };
    }
    if (t.isVector3 || typeof t.getWorldPos === 'function') {
      const v = t.isVector3 ? t : t.getWorldPos(_v1);
      const p = this._project(v || _v1);
      if (!p || p.visible === false) return null;
      return { x: p.x - 12, y: p.y - 12, w: 24, h: 24, pt: true };
    }
    if (typeof t.x === 'number' && typeof t.y === 'number' && t.w == null && t.width == null) return { x: t.x - 12, y: t.y - 12, w: 24, h: 24, pt: true };
    const x = t.left ?? t.x, y = t.top ?? t.y, w = t.width ?? t.w ?? 0, h = t.height ?? t.h ?? 0;
    if (typeof x === 'number' && typeof y === 'number') return { x, y, w, h };
    return null;
  }

  _project(v) {
    if (this.project) return this.project(v);
    const g = this.game, rig = g && (g.overrideRig || g.rig);
    if (rig?.worldToScreen && g.renderer) return rig.worldToScreen(v, g.renderer);
    return null;
  }

  // the bar the element sits in, if any (he can stand on its top edge)
  _barOf(el, b) {
    const bar = el.closest?.('[data-teach-bar], #toolbar, .toolbar');
    if (bar && bar !== el) { const r = bar.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
    if (b.width > b.height * 2.5 && b.height < 140) return { x: b.left, y: b.top, w: b.width, h: b.height };
    return null;
  }

  _setTarget(target, { side = 'auto', speed = null, resolve = null } = {}) {
    this._tgt = { target, side, speed, resolve, spot: null, cur: null };
    this._aimT = target;
    this._tapT = 2.6 + Math.random();
  }

  // where to stand for a target: beside it, on top of its bar, below or above it.
  // lock: keep the side chosen before (while running there, so the goal doesn't flip)
  _spotFor(T, lock = false) {
    const f = this.f;
    if (!T) return { x: f.x, y: f.y };
    const R = this._resolve(T.target);
    if (!R) return T.spot || { x: f.x, y: f.y };
    const W = this.W, H = this.H, ppu = this.ppu;
    const hw = ppu * 0.5, fh = ppu * this.foxH * 1.04, gap = 8;
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    let cands = [];
    const bar = R.bar;
    if (bar && bar.y > H * 0.4) {
      for (const s of [1, -1]) cands.push({ side: s > 0 ? 'top' : 'top-l', x: cx + s * (hw + 12), y: bar.y + 4, pref: s > 0 ? 0 : 3 });
    }
    const fy = R.h > fh * 0.8 ? cy + fh * 0.45 : R.y + R.h;
    cands.push({ side: 'right', x: R.x + R.w + gap + hw, y: fy, pref: R.pt ? 1 : 5 });
    cands.push({ side: 'left', x: R.x - gap - hw, y: fy, pref: R.pt ? 3 : 7 });
    const below = cy < H * 0.45;
    // below: off to the side, so the raised pointer reads clearly against the background
    const bsd = cx > W * 0.5 ? -1 : 1;
    cands.push({ side: 'below', x: bsd > 0 ? max(cx + hw * 1.5, R.x + R.w + hw * 1.5) : min(cx - hw * 1.5, R.x - hw * 1.5), y: R.y + R.h + fh * 0.8 + gap, pref: below ? 4 : 40 });
    cands.push({ side: 'above', x: cx + (cx > W * 0.5 ? -1 : 1) * hw * 1.4, y: R.y + 3, pref: R.w > 160 && R.h > 80 ? 9 : 45 });
    if (lock && T.cur) { const k = cands.filter((c) => c.side === T.cur); if (k.length) cands = k; }
    const want = T.side && T.side !== 'auto' ? T.side : null;
    let best = null, bs = Infinity;
    for (const c of cands) {
      let s = c.pref;
      if (want) s += c.side.startsWith(want) ? -100 : 0;
      // stay on screen
      const l = c.x - hw, r = c.x + hw, t = c.y - fh, b = c.y;
      s += (max(0, 6 - l) + max(0, r - (W - 6)) + max(0, 6 - t) + max(0, b - (H - 2))) * 0.6;
      // don't cover the thing he's pointing at
      const ox = max(0, min(r, R.x + R.w) - max(l, R.x)), oy = max(0, min(b, R.y + R.h) - max(t, R.y));
      s += ((ox * oy) / (hw * 2 * fh)) * 50;
      // hysteresis + less running
      if (T.cur === c.side) s -= 6;
      s += hypot(c.x - f.x, c.y - f.y) * 0.004;
      if (s < bs) { bs = s; best = c; }
    }
    T.cur = best.side;
    const spot = { x: clamp(best.x, hw + 4, W - hw - 4), y: clamp(best.y, fh + 4, H - 2), side: best.side };
    T.spot = spot;
    T.R = R;
    return spot;
  }

  _home() {
    const tb = document.querySelector('#toolbar:not(.empty)');
    const r = tb?.getBoundingClientRect();
    if (r && r.width > 0 && r.top > this.H * 0.5) return { x: clamp(r.left + this.ppu * 0.9, this.ppu, this.W - this.ppu), y: r.top + 4 };
    return { x: clamp(this.W * 0.22, this.ppu, this.W - this.ppu), y: this.H - this.ppu * 0.6 };
  }

  // aim point on a target (where the stick tip goes)
  _aimPoint(t) {
    const R = this._resolve(t);
    if (!R) return null;
    const f = this.f;
    const top = this._tgt && this._tgt.target === t && this._tgt.cur && this._tgt.cur.startsWith('top');
    if (top && R.w < 90) return { x: R.x + R.w / 2, y: R.y + R.h * 0.32 };
    if (R.pt || (R.w < 70 && R.h < 70)) return { x: R.x + R.w / 2, y: R.y + R.h / 2 };
    // halfway between the point of the rect closest to his shoulder and its centre
    const sx = f.x, sy = f.y - f.hop - this.ppu * 0.7;
    const px = clamp(sx, R.x + 8, R.x + R.w - 8), py = clamp(sy, R.y + 8, R.y + R.h - 8);
    return { x: lerp(px, R.x + R.w / 2, 0.45), y: lerp(py, R.y + R.h / 2, 0.45) };
  }

  _foxChest() { const f = this.f; return { x: f.x + f.face * this.ppu * 0.35, y: f.y - f.hop - this.ppu * 0.9 }; }

  // ---------------------------------------------------------------- movement
  // queue the legs of a trip to a (live) goal: run, and hop where the level changes
  _plan(goalFn, { speed = null, onArrive = null, skid = true } = {}) {
    const f = this.f;
    if (this._shot) { const s = this._shot; this._shot = null; s.onDone?.(); }
    const g = goalFn();
    const dx = g.x - f.x, dy = g.y - f.y;
    const legs = [];
    const sp = speed || this.speed;
    if (abs(dy) > 28 && abs(dx) > 200) {
      // long way + a level change: run along this level, then jump (going up) or jump first (going down)
      const dir = Math.sign(dx);
      if (dy < 0) {
        legs.push({ to: () => { const q = goalFn(); return { x: q.x - dir * min(110, abs(q.x - f.x) * 0.5), y: f.y }; }, kind: 'run', sp, keep: true });
        legs.push({ to: goalFn, kind: 'jump', sp, onArrive, skid: false });
      } else {
        const x0 = f.x + dir * 90, y0 = g.y;
        legs.push({ to: () => ({ x: x0, y: y0 }), kind: 'jump', sp, keep: true });
        legs.push({ to: goalFn, kind: 'run', sp, onArrive, skid });
      }
    } else {
      legs.push({ to: goalFn, kind: abs(dy) > 28 ? 'jump' : 'run', sp, onArrive, skid: skid && abs(dy) <= 28 });
    }
    // the first leg's start y is frozen at plan time
    if (legs[0].keep) { const y = f.y, to0 = legs[0].to; legs[0].to = () => ({ x: to0().x, y }); }
    this.legs = legs;
    this.trip = null;
    this._nextLeg();
  }

  _nextLeg() {
    const L = this.legs.shift();
    if (!L) { this.trip = null; return; }
    const f = this.f;
    const g = L.to();
    const d = hypot(g.x - f.x, g.y - f.y);
    const jump = L.kind === 'jump';
    const T = jump ? clamp(0.28 + d / (L.sp * 1.25), 0.42, 1.1) : clamp(0.1 + d / L.sp, 0.22, 2.4);
    const up = f.y - g.y;
    const hopH = jump ? clamp(up > 0 ? up * 0.45 + 34 : 26, 20, 220) : d > 360 ? 10 : 0;
    this.trip = { ...L, from: { x: f.x, y: f.y }, t: jump ? -0.1 : 0, T, hopH, d, jumped: false };
    if (d < 3) { this.trip.t = T; }
  }

  _stepTrip(dt) {
    const f = this.f, tr = this.trip;
    tr.t += dt;
    const g = tr.to();
    if (tr.t < 0) {
      // anticipation crouch before a jump
      f.sq += (0.84 - f.sq) * min(1, dt * 22);
      return;
    }
    if (tr.kind === 'jump' && !tr.jumped) {
      tr.jumped = true;
      f.sqV += 7; f.sq = max(f.sq, 1);
      this._puffs(f.x, f.y, 3, 0.7);
      this._sfx('teach_hop', { volume: 0.3 });
    }
    const u = clamp01(tr.t / tr.T);
    let e;
    if (tr.kind === 'jump') e = u;
    else {
      // trapezoid speed profile: quick start, cruise, ease into the stop
      const a = 0.16;
      e = u < a ? (u * u) / (2 * a * (1 - a)) : u > 1 - a ? 1 - ((1 - u) * (1 - u)) / (2 * a * (1 - a)) : (u - a / 2) / (1 - a);
    }
    const px = f.x, py = f.y;
    f.x = lerp(tr.from.x, g.x, e);
    f.y = lerp(tr.from.y, g.y, e);
    f.hop = tr.hopH > 0 ? (tr.kind === 'jump' ? 4 * tr.hopH * u * (1 - u) : 4 * tr.hopH * smooth((u - 0.38) / 0.24) * (1 - smooth((u - 0.38) / 0.24))) : 0;
    f.speed = dt > 0 ? hypot(f.x - px, f.y - py) / dt : 0;
    if (abs(g.x - tr.from.x) > 6) f.face = g.x > tr.from.x ? 1 : -1;
    // speed lines + kicked-up dust
    if (f.speed > 380 && tr.kind === 'run' && Math.random() < dt * 22) this._speedLine();
    if (u >= 1) {
      f.hop = 0;
      if (tr.kind === 'jump') {
        f.sqV -= 9; this._puffs(f.x, f.y, 5, 1);
        this._sfx('teach_land', { volume: 0.32 });
      } else if (tr.skid && tr.d > 120) {
        f.leanV -= f.face * 5;
        f.sqV -= 3;
        this._puffs(f.x + f.face * 10, f.y, 4, 0.9, f.face);
        this._sfx('teach_skid', { volume: 0.26 });
      }
      const done = tr.onArrive;
      this.trip = null;
      if (this.legs.length) this._nextLeg();
      else done?.();
    }
  }

  _arriveEnter() {
    const f = this.f;
    f.mode = 'stand';
    f.speed = 0;
    this._sfx('school_bell', { volume: 0.3 });
    const wave = this._pick('wave_hello', 'wave');
    this.rig.setExpression('happy', { hold: 1.4 });
    this._twinkles(4);
    if (this._greet && !this.bub) this._openBubble(this._greet, { wait: false, dur: 1.9, mood: 'happy' });
    let done = false;
    const T0 = this._tgt;
    const finish = () => {
      if (done) return;
      done = true;
      this._resolveAll(this._enterRes);
      if (T0 && this._tgt === T0) {
        if (this._resolve(T0.target) && hypot(this._spotFor(T0).x - this.f.x, this._spotFor(T0).y - this.f.y) < 46) this._arriveTarget();
        else T0.pending = true; // not there yet (or it moved): the stand loop runs him over when it can
      }
    };
    this._oneShot(wave, { onDone: finish });
    setTimeout(finish, 1300); // resolve on time even when the loop is slow
  }

  _arriveExit() {
    const f = this.f;
    f.mode = 'hidden';
    this.trip = null; this.legs = [];
    this.rig.setAim?.(null);
    this.foxCv.classList.add('tch-off');
    this._lastBox = null;
    this._dirty2D = true;
    this._resolveAll(this._leaveRes);
  }

  _arriveTarget() {
    const T = this._tgt;
    if (!T) return;
    if (this.f.mode === 'enter') this.f.mode = 'stand';
    this._aimT = T.target;
    if (!T.arrived) {
      T.arrived = true;
      this._tapT = 2.2 + Math.random() * 1.2;
      this._sfx('teach_ding', { volume: 0.2 });
      this._sfx('teach_swish', { volume: 0.2 });
    }
    if (T.resolve) { const r = T.resolve; T.resolve = null; r(); }
  }

  _updateFox(dt) {
    const f = this.f, rig = this.rig;
    if (this._shot && this.time > this._shot.until) { const s = this._shot; this._shot = null; s.onDone?.(); }
    // live goal: re-plan when the target moved far, follow small moves
    if (this.trip) this._stepTrip(dt);
    else if (this._tgt && f.mode === 'stand' && !this._shot && !this._resolve(this._tgt.target)) {
      this._tgt.pending = true; // not on screen (yet): wait where he is, it may appear any moment
    } else if (this._tgt && f.mode === 'stand' && !this._shot && this._tgt.pending) {
      this._tgt.pending = false;
      this._plan(() => this._spotFor(this._tgt, true), { onArrive: () => this._arriveTarget() });
    } else if (this._tgt && f.mode === 'stand' && !this._shot) {
      const g = this._spotFor(this._tgt);
      const d = hypot(g.x - f.x, g.y - f.y);
      if (d > 46) this._plan(() => this._spotFor(this._tgt, true), { onArrive: () => this._arriveTarget() });
      else if (d > 0.5) { const k = 1 - Math.exp(-dt * 7); f.x += (g.x - f.x) * k; f.y += (g.y - f.y) * k; }
    }
    // pointing / drawing (not while running)
    const drawTip = this.trip ? null : this._drawTip;
    const aimPt = drawTip || (this._aimT != null && !this.trip && f.mode === 'stand' ? this._aimPoint(this._aimT) : null);
    const runPointing = this.trip && this._tgt && f.mode === 'stand';
    // facing
    let yawT;
    if (this.trip) yawT = f.face * YAW_RUN;
    else if (aimPt) { const s = aimPt.x < f.x - 4 ? -1 : aimPt.x > f.x + 4 ? 1 : f.face; f.face = s; yawT = s > 0 ? YAW_PT_R : YAW_PT_L; }
    else yawT = f.face * 0.18 + sin(this.time * 0.7) * 0.06;
    const n = max(1, ceil(dt / (1 / 60))), h = dt / n;
    for (let i = 0; i < n; i++) {
      f.yawV += ((yawT - f.yaw) * 150 - f.yawV * 15) * h;
      f.yaw += f.yawV * h;
      f.sqV += ((1 - f.sq) * 260 - f.sqV * 13) * h;
      f.sq += f.sqV * h;
      f.leanV += ((0 - f.lean) * 120 - f.leanV * 11) * h;
      f.lean += f.leanV * h;
    }
    f.sq = clamp(f.sq, 0.7, 1.3);
    f.lean = clamp(f.lean, -0.4, 0.4);
    // animation
    if (!this._shot) {
      let name;
      const talking = this.bub && !this.bub.closing && !this.bub.typed;
      if (this.trip) name = runPointing ? this._pick('run_point', 'run') : this._pick('run');
      else if (aimPt) name = this._pick('teach_point', 'idle');
      else if (talking) name = this._pick('teach_explain', 'talk');
      else name = 'idle';
      if (rig.current !== name) rig.play(name, { fade: this.trip ? 0.12 : 0.22 });
      // fallback when there is no pointing pose: the classic point now and then
      if (aimPt && !this.trip && name === 'idle' && !drawTip) {
        this._tapT -= dt;
        if (this._tapT <= 0) { this._tapT = 3 + Math.random() * 1.5; this._oneShot('point'); }
      }
    }
    // taps while pointing (not while talking or drawing)
    if (aimPt && !drawTip && !this.trip && !this._shot && this._has('teach_tap') && !(this.bub && !this.bub.typed)) {
      this._tapT -= dt;
      if (this._tapT <= 0) { this._tapT = 3.4 + Math.random() * 1.6; this._oneShot('teach_tap'); this._tapAt = aimPt; }
    }
    // aim + look
    if (rig.setAim) {
      if (aimPt) rig.setAim(this._toWorld(aimPt.x, aimPt.y, AIM_Z, this._aimV));
      else rig.setAim(null);
    }
    const talkingNow = this.bub && !this.bub.closing;
    if (talkingNow || (!aimPt && !this.trip)) {
      // look at the viewer while explaining
      const hx = f.x + (aimPt ? (aimPt.x - f.x) * 0.25 : 0);
      rig.lookAt(this._toWorld(hx, f.y - this.ppu * 1.6, 8, this._lookV));
    } else if (aimPt) rig.lookAt(this._toWorld(aimPt.x, aimPt.y, 1.2, this._lookV));
    else rig.lookAt(null);
    rig.update(dt);
    // place him
    const ps = this.ps, ppu = this.ppu;
    const sx = round(f.x / ps) * ps, sy = round((f.y - f.hop) / ps) * ps;
    this.stage.position.set(sx / ppu, -sy / ppu, 0);
    this.squash.scale.set(1 / sqrt(f.sq), f.sq, 1 / sqrt(f.sq));
    this.squash.rotation.z = f.lean * 0.6;
    rig.root.rotation.y = f.yaw;
    this._dirty2D = true; // blob shadow moves with him
  }

  _oneShot(name, { speed = 1, onDone = null } = {}) {
    if (!this._has(name)) { onDone?.(); return; }
    const shot = { name, onDone, until: this.time + 5 };
    this._shot = shot;
    this.rig.play(name, {
      fade: 0.18, speed, restart: true,
      onDone: () => {
        if (this._shot !== shot) return;
        this._shot = null;
        onDone?.();
      },
    });
  }

  _rigEvent(n) {
    const f = this.f;
    if (n === 'step') {
      if (this.trip && this.trip.kind === 'run') {
        this._sfx('teach_step', { volume: 0.16, pitch: 0.9 + Math.random() * 0.3 });
        if (Math.random() < 0.7) this._puffs(f.x - f.face * 8, f.y, 1, 0.55, -f.face);
      }
    } else if (n === 'tap' || n === 'teach_tap' || n === 'poke') {
      this._sfx('chalk_tap', { volume: 0.35 });
      const p = this._tapAt || (this._aimT != null ? this._aimPoint(this._aimT) : null);
      if (p) this._ripple(p.x, p.y);
    } else if (n === 'land') this._sfx('teach_land', { volume: 0.25 });
  }

  _has(name) { return !!this.rig && this.rig.anims.includes(name); }
  _pick(...names) { for (const n of names) if (this._has(n)) return n; return 'idle'; }

  _toWorld(x, y, z, out) { return out.set(x / this.ppu, -y / this.ppu, z); }

  // fox screen-space box (CSS px)
  _foxBox() {
    const f = this.f, u = this.ppu;
    let h = u * this.foxH * 1.04;
    if (this.rig) h = clamp(f.y - this._headScreen().y + 4, u * 0.8, h); // live pose (crouches, bows)
    return { x: f.x - u * 0.55, y: f.y - f.hop - h, w: u * 1.1, h };
  }

  _headScreen() {
    const v = this.rig.headTop(_v2);
    return { x: v.x * this.ppu, y: -v.y * this.ppu };
  }

  // ---------------------------------------------------------------- fox render (scissored)
  _renderFox() {
    const r = this.renderer, f = this.f, ps = this.ps, u = this.ppu / ps;
    const cx = f.x / ps, cy = (f.y - f.hop) / ps;
    const box = { x0: floor(cx - u * 1.9), x1: ceil(cx + u * 1.9), y0: floor(cy - u * 2.85), y1: ceil(cy + u * 0.5) };
    const L = this._lastBox || box;
    const U = { x0: min(box.x0, L.x0), x1: max(box.x1, L.x1), y0: min(box.y0, L.y0), y1: max(box.y1, L.y1) };
    this._lastBox = box;
    const gl = (b, pad) => {
      const x0 = clamp(b.x0 - pad, 0, this.rw), x1 = clamp(b.x1 + pad, 0, this.rw);
      const y0 = clamp(b.y0 - pad, 0, this.rh), y1 = clamp(b.y1 + pad, 0, this.rh);
      return [x0, this.rh - y1, max(0, x1 - x0), max(0, y1 - y0)];
    };
    const [ax, ay, aw, ah] = gl(U, 3);
    if (aw <= 0 || ah <= 0) return;
    this.rt.scissor.set(ax, ay, aw, ah);
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(this.scene, this.camera);
    const [bx, by, bw, bh] = gl(U, 2);
    r.setScissor(bx, by, bw, bh);
    r.setScissorTest(true);
    r.setRenderTarget(null);
    r.clear();
    r.render(this.postScene, this.postCam);
  }

  // ---------------------------------------------------------------- chalk marks
  _mark(kind, target, o, shapeFn, def) {
    if (this._disposed) return Promise.resolve();
    this._build();
    this._resizeIfNeeded();
    const R0 = this._resolve(target); // may be null: the mark waits (up to o.timeout s) for it to appear
    const seed = (Math.random() * 1e9) | 0, r = rng(seed);
    const live = o.follow ?? (typeof target === 'function' || (typeof Element !== 'undefined' && target instanceof Element) || typeof target === 'string' || !!target?.getWorldPos);
    const m = {
      kind, target, live, seed, color: CHALK[o.color ?? def.color] ? o.color ?? def.color : 'white',
      brush: def.brush * (o.thick ?? 1), dur: max(0.05, o.dur ?? def.dur), t: -(o.delay ?? 0),
      dx: o.dx ?? 0, dy: o.dy ?? 0, now: !!o.now, built: false, done: false, fade: null, shape: shapeFn, r,
      ax: R0 ? R0.x + R0.w / 2 : 0, ay: R0 ? R0.y + R0.h / 2 : 0, R0, need: o._need || null,
      waitUntil: this.time + (o.timeout ?? 30),
    };
    const p = new Promise((res) => (m.resolve = res));
    this.marks.push(m);
    this._wake();
    return p;
  }

  // build strokes + canvases when the mark starts drawing
  _buildMark(m) {
    m.built = true;
    const R = this._resolve(m.target) || m.R0;
    let strokes = R ? m.shape(R, m.r) : null;
    if (!strokes || !strokes.length) { m.done = true; m.strokes = []; m.resolve(); return; }
    m.ax = R.x + R.w / 2; m.ay = R.y + R.h / 2;
    const amp = m.kind === 'tick' || m.kind === 'cross' ? 0.6 : 1.1;
    strokes = strokes.map((s) => wobble(resample(s.map(([x, y]) => [x + m.dx, y + m.dy]), 1.5), s.length > 6 ? amp : 0, m.r));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of strokes) for (const [x, y] of s) { x0 = min(x0, x); y0 = min(y0, y); x1 = max(x1, x); y1 = max(y1, y); }
    const pad = 6;
    m.ox = floor(x0 / CS) - pad; m.oy = floor(y0 / CS) - pad;
    m.w = ceil(x1 / CS) - m.ox + pad; m.h = ceil(y1 / CS) - m.oy + pad;
    m.ink = mkCanvas(m.w, m.h); m.chalk = mkCanvas(m.w, m.h);
    m.inkImg = new ImageData(m.w, m.h); m.chImg = new ImageData(m.w, m.h);
    m.inner = new Uint8Array(m.w * m.h);
    // per-stroke timing (proportional to length, with a short lift between strokes)
    let tot = 0;
    m.strokes = strokes.map((pts) => {
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const L = cum[cum.length - 1];
      tot += max(L, 6);
      return { pts, cum, L, drawn: 0, ph: m.r() * TAU };
    });
    const lift = 0.07 * (m.strokes.length - 1);
    const draw = max(0.05, m.dur - lift);
    let t = 0;
    for (const s of m.strokes) {
      s.t0 = t;
      s.t1 = t + (draw * max(s.L, 6)) / tot;
      t = s.t1 + 0.07;
    }
    m.sndT = 0;
  }

  _finishMark(m) {
    if (!m.built) this._buildMark(m);
    if (m.done) return;
    for (const s of m.strokes) this._drawStroke(m, s, s.L);
    this._flushMark(m);
    m.done = true;
    m.resolve();
  }

  _updateMarks(dt) {
    let tip = null;
    for (const m of this.marks) {
      if (m.live && (m.done || m.built)) {
        const R = this._resolve(m.target);
        if (R) {
          const ax = R.x + R.w / 2, ay = R.y + R.h / 2;
          if (abs(ax - m.ax) > 0.25 || abs(ay - m.ay) > 0.25) { m.ax = ax; m.ay = ay; this._dirty2D = true; }
        }
      }
      if (m.fade) {
        m.fade.t += dt;
        this._dirty2D = true;
        if (m.fade.t > 0 && m.fade.t < m.fade.T * 0.6 && Math.random() < dt * 30) {
          const u = clamp01(m.fade.t / (m.fade.T * 0.55));
          const x = (m.ax / CS + m.ox + u * m.w) * CS, y = (m.ay / CS + m.oy + Math.random() * m.h) * CS;
          this._speck(x, y, m.color);
          if (Math.random() < 0.15) this._puffs(x, y, 1, 0.3);
        }
        continue;
      }
      if (m.done) continue;
      // he draws it: wait until he has stopped running
      const fm = this.f.mode;
      if (!m.built && !m.now && (this.trip || this.legs.length || fm === 'enter' || fm === 'exit')) continue;
      m.t += dt;
      if (m.t < 0) continue;
      if (!m.built) {
        // its target (or an arrow's start) may not exist yet: retry every frame, give up after the timeout
        if (!this._resolve(m.target) || (m.need && !this._resolve(m.need))) {
          m.t = min(m.t, 0);
          if (this.time > m.waitUntil) { m.done = true; m.strokes = []; m.resolve(); }
          continue;
        }
        this._buildMark(m);
        if (m.done) continue;
        this._sfx('chalk_tick', { volume: 0.3 });
      }
      let any = false, cur = null;
      for (const s of m.strokes) {
        if (m.t < s.t0) break;
        const u = clamp01((m.t - s.t0) / (s.t1 - s.t0));
        const e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
        const want = s.L * (0.15 * u + 0.85 * e);
        if (want > s.drawn) { this._drawStroke(m, s, want); any = true; }
        if (u < 1) cur = s;
      }
      if (any) this._flushMark(m);
      if (cur) {
        const p = strokePoint(cur, cur.drawn);
        tip = { x: m.ax + p[0], y: m.ay + p[1] };
        m.sndT -= dt;
        if (m.sndT <= 0) { m.sndT = 0.085 + Math.random() * 0.03; this._sfx('chalk_draw', { volume: 0.22, pitch: 0.92 + Math.random() * 0.2 }); }
        if (Math.random() < dt * 14) this._speck(tip.x, tip.y, m.color);
      }
      const last = m.strokes[m.strokes.length - 1];
      if (m.t >= last.t1) { m.done = true; m.resolve(); }
    }
    this._drawTip = tip;
    // drop faded marks
    const before = this.marks.length;
    this.marks = this.marks.filter((m) => {
      if (m.fade && m.fade.t >= m.fade.T) { m.fade.resolve?.(); return false; }
      return !(m.done && !m.strokes?.length); // gave up waiting for its target
    });
    if (this.marks.length !== before) this._dirty2D = true;
  }

  _drawStroke(m, s, to) {
    const from = s.drawn;
    if (to <= from) return;
    const step = 0.6 * CS;
    for (let d = from === 0 ? 0 : from + step; d <= to + 1e-6; d += step) {
      const [x, y] = strokePoint(s, d);
      // pressure: a little thinner at the ends, slow wobble in between
      const endk = min(1, d / 6, (s.L - d) / 5 + 0.35);
      const r = m.brush * (0.82 + 0.18 * sin(d * 0.09 + s.ph)) * (0.7 + 0.3 * clamp01(endk));
      this._stamp(m, x / CS - m.ox, y / CS - m.oy, r, d, s);
    }
    s.drawn = to;
  }

  // One brush dab. Under the chalk lies a strip of translucent "blackboard" (the ink layer):
  // darker at the rim, lighter where chalk lands, so the grain holes read as chalk on a board
  // and the strokes stay legible on bright and dark backgrounds alike.
  _stamp(m, cx, cy, r, d, s) {
    const W = m.w, H = m.h, ink = m.inkImg.data, ch = m.chImg.data, inner = m.inner, pal = CHALK[m.color];
    const R = r + 1.1, R2 = R * R, r2 = r * r;
    const gap = 0.05 + 0.1 * (0.5 + 0.5 * sin(d * 0.13 + s.ph * 2));
    const xa = max(0, floor(cx - R - 1)), xb = min(W - 1, ceil(cx + R + 1));
    const ya = max(0, floor(cy - R - 1)), yb = min(H - 1, ceil(cy + R + 1.6));
    for (let y = ya; y <= yb; y++)
      for (let x = xa; x <= xb; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d2 = dx * dx + dy * dy;
        const j = y * W + x, i = j * 4;
        if (d2 <= r2) {
          if (!inner[j]) { inner[j] = 1; ink[i] = INK[0]; ink[i + 1] = INK[1]; ink[i + 2] = INK[2]; ink[i + 3] = 105; }
        } else if (!inner[j] && (d2 <= R2 || dx * dx + (dy - 0.75) * (dy - 0.75) <= R2) && ink[i + 3] < 170) {
          ink[i] = INK[0]; ink[i + 1] = INK[1]; ink[i + 2] = INK[2]; ink[i + 3] = 170; // rim, a bit heavier below
        }
        if (d2 > r2) continue;
        const h = hash2(x, y, m.seed);
        const edge = d2 > (r - 0.6) * (r - 0.6) ? 0.38 : 0; // ragged edges
        if (h < gap + edge) continue; // the board shows through the grain
        const h2 = hash2(y + 31, x - 17, m.seed + 7);
        const c = h2 < 0.24 ? pal[0] : h2 > 0.8 ? pal[2] : pal[1];
        ch[i] = c[0]; ch[i + 1] = c[1]; ch[i + 2] = c[2]; ch[i + 3] = 255;
      }
  }

  _flushMark(m) {
    m.ink.getContext('2d').putImageData(m.inkImg, 0, 0);
    m.chalk.getContext('2d').putImageData(m.chImg, 0, 0);
    this._dirty2D = true;
  }

  // ---------------------------------------------------------------- pulses, particles
  _updatePulses(dt) {
    if (!this.pulses.length) return;
    for (const q of this.pulses) {
      const prev = floor(q.t / q.period);
      q.t += dt;
      const k = floor(q.t / q.period);
      if (k !== prev && (q.stopping || k >= q.times)) q.dead = true;
    }
    this.pulses = this.pulses.filter((q) => !q.dead);
    this._dirty2D = true;
  }

  _puffs(x, y, n = 3, big = 1, dir = 0) {
    for (let i = 0; i < n; i++) {
      const a = PI + (Math.random() - 0.5) * 1.6 + (dir ? (dir > 0 ? 0.4 : -0.4) : 0);
      const sp = (20 + Math.random() * 40) * big;
      this.parts.push({ k: 0, x: x + (Math.random() - 0.5) * 10, y: y - 2, vx: dir ? dir * sp * 0.9 : cos(a) * sp * (i % 2 ? 1 : -1), vy: -8 - Math.random() * 22 * big, t: 0, life: 0.38 + Math.random() * 0.25, r0: 1 + Math.random() * big * 1.5, r1: 2.5 + big * 3 * Math.random() + big });
    }
    this._dirty2D = true;
  }

  _speck(x, y, color) {
    this.parts.push({ k: 1, x, y, vx: (Math.random() - 0.5) * 40, vy: -10 - Math.random() * 30, t: 0, life: 0.5 + Math.random() * 0.5, c: CHALK[color] || CHALK.white });
  }

  _speedLine() {
    const f = this.f;
    this.parts.push({ k: 2, x: f.x - f.face * (this.ppu * 0.7 + Math.random() * 10), y: f.y - f.hop - this.ppu * (0.25 + Math.random() * 1.2), vx: -f.face * 60, vy: 0, t: 0, life: 0.14, len: 6 + Math.random() * 10, face: f.face });
  }

  _twinkles(n) {
    const h = this._headScreen(), x0 = h.x, y0 = h.y;
    for (let i = 0; i < n; i++) {
      const a = -PI / 2 + (i - (n - 1) / 2) * 0.75;
      this.parts.push({ k: 3, x: x0 + cos(a) * 26, y: y0 + 10 + sin(a) * 22, vx: cos(a) * 18, vy: sin(a) * 18 - 10, t: -i * 0.08, life: 0.75, c: i % 2 ? CHALK.yellow : CHALK.white });
    }
  }

  _ripple(x, y) {
    this.parts.push({ k: 4, x, y, vx: 0, vy: 0, t: 0, life: 0.45, c: CHALK.white });
  }

  _updateParts(dt) {
    if (!this.parts.length) return;
    for (const p of this.parts) {
      p.t += dt;
      if (p.t < 0) continue;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.k === 0) { p.vx *= 1 - min(1, dt * 5); p.vy *= 1 - min(1, dt * 4); }
      else if (p.k === 1) { p.vy += 260 * dt; p.vx *= 1 - min(1, dt * 2); }
      else if (p.k === 3) { p.vx *= 1 - min(1, dt * 4); p.vy *= 1 - min(1, dt * 4); }
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    this._dirty2D = true;
  }

  // ---------------------------------------------------------------- 2D composite
  _draw2D() {
    this._dirty2D = false;
    const g = this.cx, cv = this.chalkCv;
    g.clearRect(0, 0, cv.width, cv.height);
    const f = this.f;
    // blob shadow under his feet (stays on the ground while he hops)
    if (f.mode !== 'hidden') {
      const k = 1 - clamp01(f.hop / 90) * 0.55;
      const w = round((this.ppu * 0.62 * k) / CS), h = max(2, round((this.ppu * 0.12 * k) / CS));
      const x = round(f.x / CS), y = round(f.y / CS);
      g.fillStyle = 'rgba(22,17,20,0.28)';
      for (let j = 0; j < h; j++) {
        const yy = (j + 0.5) / h * 2 - 1, half = round(w * sqrt(max(0, 1 - yy * yy)));
        g.fillRect(x - half, y - h + j + 1, half * 2, 1);
      }
    }
    // marks: every rim first, then every chalk body (strokes never hide each other)
    const pos = (m) => [round(m.ax / CS) + m.ox, round(m.ay / CS) + m.oy];
    for (const pass of ['ink', 'chalk']) {
      for (const m of this.marks) {
        if (!m.built || !m.strokes?.length) continue;
        const [x, y] = pos(m);
        const img = m[pass];
        if (!m.fade || m.fade.t <= 0) { g.drawImage(img, x, y); continue; }
        // eraser: wipe left to right, leaving a smudge that fades
        const u = clamp01(m.fade.t / m.fade.T), wipe = clamp01(u / 0.55), fadeK = 1 - smooth((u - 0.5) / 0.5);
        const wx = round(m.w * wipe);
        if (wx < m.w) g.drawImage(img, wx, 0, m.w - wx, m.h, x + wx, y, m.w - wx, m.h);
        if (wx > 0) {
          g.globalAlpha = (pass === 'ink' ? 0.12 : 0.3) * fadeK;
          g.drawImage(img, 0, 0, wx, m.h, x + 1, y, wx, m.h);
          g.drawImage(img, 0, 0, wx, m.h, x + 2, y + 1, wx, m.h);
          g.globalAlpha = 1;
        }
      }
    }
    // pulse rings
    for (const q of this.pulses) this._drawPulse(g, q);
    // particles
    for (const p of this.parts) if (p.t >= 0) this._drawPart(g, p);
  }

  _drawPulse(g, q) {
    const R = this._resolve(q.target);
    if (!R) return;
    const cx = (R.x + R.w / 2) / CS, cy = (R.y + R.h / 2) / CS;
    const pal = CHALK[q.color] || CHALK.yellow;
    for (const off of [0, 0.5]) {
      const u = ((q.t / q.period) + off) % 1;
      if (q.stopping && off) continue;
      const a = min(1, u * 5) * (1 - u) ** 1.4;
      if (a < 0.03) continue;
      const rx = (R.w / 2 + 5 + u * 15) / CS, ry = (R.h / 2 + 5 + u * 15) / CS;
      const n = max(12, round((rx + ry) * 1.3));
      g.globalAlpha = a;
      for (let i = 0; i < n; i++) {
        if ((i + floor(q.t * 8)) % 3 === 2) continue; // marching dashes
        const t = (i / n) * TAU;
        const x = round(cx + cos(t) * rx), y = round(cy + sin(t) * ry);
        g.fillStyle = 'rgba(22,17,20,0.75)';
        g.fillRect(x - 1, y - 1, 4, 4);
        g.fillStyle = `rgb(${pal[1]})`;
        g.fillRect(x, y, 2, 2);
        g.fillStyle = `rgb(${pal[0]})`;
        g.fillRect(x, y, 1, 1);
      }
      g.globalAlpha = 1;
    }
  }

  _drawPart(g, p) {
    const u = p.t / p.life;
    const x = round(p.x / CS), y = round(p.y / CS);
    if (p.k === 0) {
      const r = round(lerp(p.r0, p.r1, 1 - (1 - u) * (1 - u)));
      const img = puffSprite(clamp(r, 1, 7));
      g.globalAlpha = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
      g.drawImage(img, x - (img.width >> 1), y - (img.height >> 1));
      g.globalAlpha = 1;
    } else if (p.k === 1) {
      g.globalAlpha = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      g.fillStyle = 'rgb(22,17,20)';
      g.fillRect(x, y + 1, 1, 1);
      g.fillStyle = `rgb(${p.c[1]})`;
      g.fillRect(x, y, 1, 1);
      g.globalAlpha = 1;
    } else if (p.k === 2) {
      const L = round(p.len / CS);
      g.globalAlpha = 1 - u;
      g.fillStyle = 'rgb(22,17,20)';
      g.fillRect(p.face > 0 ? x - L : x, y + 1, L, 1);
      g.fillStyle = '#fff';
      g.fillRect(p.face > 0 ? x - L : x, y, L, 1);
      g.globalAlpha = 1;
    } else if (p.k === 3) {
      // twinkle: a tiny 4-point star that pops and shrinks
      const s = u < 0.3 ? 2 : u < 0.7 ? 1 : 0;
      g.fillStyle = 'rgb(22,17,20)';
      g.fillRect(x - s - 1, y - 1, s * 2 + 3, 3);
      g.fillRect(x - 1, y - s - 1, 3, s * 2 + 3);
      g.fillStyle = `rgb(${p.c[1]})`;
      g.fillRect(x - s, y, s * 2 + 1, 1);
      g.fillRect(x, y - s, 1, s * 2 + 1);
      g.fillStyle = `rgb(${p.c[0]})`;
      g.fillRect(x, y, 1, 1);
    } else if (p.k === 4) {
      // tap ripple: a dotted chalk ring
      const r = 2 + u * 7, n = 10;
      g.globalAlpha = 1 - u;
      for (let i = 0; i < n; i++) {
        const t = (i / n) * TAU, xx = round(x + cos(t) * r), yy = round(y + sin(t) * r);
        g.fillStyle = 'rgb(22,17,20)';
        g.fillRect(xx, yy + 1, 1, 1);
        g.fillStyle = `rgb(${p.c[1]})`;
        g.fillRect(xx, yy, 1, 1);
      }
      g.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- speech bubble
  _openBubble(html, { wait, dur, mood, expr }) {
    const M = MOODS[mood] || MOODS.normal;
    const b = {
      wait: !!wait, mood, variant: M.variant, seed: (Math.random() * 1e9) | 0,
      t: 0, shown: 0, revealed: 0, typed: false, closing: false, init: false,
      x: 0, y: 0, bw: 20, bh: 12, side: null, geomKey: '',
    };
    const p = new Promise((r) => (b.resolve = r));
    const el = document.createElement('div');
    el.className = `tch-bb tch-v-${b.variant} tch-m-${mood}` + (b.wait ? ' tch-wait' : '');
    el.innerHTML = `<div class="tch-bb-bob"><div class="tch-bb-pop"><canvas class="tch-bb-bg"></canvas><div class="tch-bb-body"><div class="tch-bb-content"><div class="tch-text"></div></div></div>${b.wait ? '<i class="tch-more"></i>' : ''}</div></div>`;
    b.el = el;
    b.bob = el.querySelector('.tch-bb-bob');
    b.pop = el.querySelector('.tch-bb-pop');
    b.cv = el.querySelector('.tch-bb-bg');
    b.body = el.querySelector('.tch-bb-body');
    b.content = el.querySelector('.tch-bb-content');
    b.textEl = el.querySelector('.tch-text');
    if (REDUCED) el.classList.add('tch-reduced');
    this.bubLayer.appendChild(el);
    const { chars, plain } = buildText(b.textEl, html);
    b.chars = chars;
    b.plain = plain;
    // typing speed follows his voice
    let cps = mood === 'whisper' ? 22 : mood === 'shout' || mood === 'excited' ? 40 : 30;
    const n = chars.length;
    if (plain.trim()) {
      let secs = 0;
      try { secs = +this.audio?.babble?.('fox', plain, { volume: 0.3 }) || 0; } catch (e) { secs = 0; }
      if (secs > 0.05) cps = clamp(n / secs, 14, 70);
      this.rig?.talk(plain, { cps: clamp(cps, 10, 30) });
    }
    if (REDUCED) cps = 1e4;
    b.cps = cps;
    b.dur = dur != null ? dur : 1.4 + 0.055 * n;
    b.dur = max(b.dur, n / cps + 0.8);
    const e = expr || M.expr;
    if (e && this.rig) this.rig.setExpression(e, { hold: min(6, b.dur) });
    this._sfx('pop_in', { volume: mood === 'whisper' ? 0.3 : 0.5, pitch: 1 + Math.random() * 0.15 });
    this.bub = b;
    this._measureBubble(b);
    this._placeBubble(b, 0, true);
    this.catcher.classList.toggle('on', b.wait);
    this._wake();
    return p;
  }

  _measureBubble(b) {
    if (b.closing) return;
    const cw = b.content.offsetWidth, ch = b.content.offsetHeight;
    if (!cw || !ch) return;
    const ax = ceil(cw / BS), ay = ceil(ch / BS);
    let bw, bh;
    if (b.variant === 'shout') { bw = round(ax * 1.22 + 10); bh = round(ay * 1.3 + 9); }
    else if (b.variant === 'think') { bw = ax + 16; bh = ay + 12; }
    else { bw = ax + 10; bh = ay + 6; }
    bh = max(bh, 11);
    bw = max(bw, bh + 4);
    b.bw = bw; b.bh = bh;
    b.body.style.width = bw * BS + 'px';
    b.body.style.height = bh * BS + 'px';
    b.content.style.left = floor((bw - ax) / 2) * BS + 'px';
    b.content.style.top = floor((bh - ay) / 2) * BS + 'px';
    b.geomKey = '';
  }

  _updateBubble(dt) {
    const b = this.bub;
    if (!b || b.closing) return;
    b.t += dt;
    const n = b.chars.length;
    if (b.shown < n) {
      b.shown += dt * b.cps;
      while (b.revealed < min(n, floor(b.shown))) {
        const c = b.chars[b.revealed++];
        if (c.el) c.el.classList.add('on');
        const p = PAUSE[c.ch];
        if (p && b.revealed < n && !REDUCED) b.shown -= p * b.cps;
      }
    } else while (b.revealed < n) b.chars[b.revealed++].el?.classList.add('on');
    if (!b.typed && b.revealed >= n) { b.typed = true; b.el.classList.add('tch-ready'); }
    if (!b.wait && b.typed && b.t >= b.dur) { this._closeBubble(false); return; }
    this._placeBubble(b, dt, false);
  }

  _placeBubble(b, dt, first) {
    const S = BS, W = this.W, H = this.H;
    const w = b.bw * S, h = b.bh * S;
    const f = this.f;
    const visible = f.mode !== 'hidden' && f.x > -this.ppu && f.x < W + this.ppu;
    const fb = this._foxBox();
    const head = this.rig ? this._headScreen() : { x: f.x, y: fb.y };
    // the thing he points at should stay visible
    const T = this._aimT != null ? this._resolve(this._aimT) : null;
    const gap = 14;
    const sideShift = clamp((W / 2 - head.x) * 0.25, -w * 0.3, w * 0.3);
    // tail anchors: the top of his head, or his muzzle when the bubble is beside him
    const A = {
      above: { x: head.x, y: head.y - 2 },
      right: { x: head.x + 10, y: head.y + this.ppu * 0.45 },
      left: { x: head.x - 10, y: head.y + this.ppu * 0.45 },
      below: { x: f.x, y: fb.y + fb.h - this.ppu * 0.25 },
    };
    const cands = [
      { side: 'above', x: head.x - w / 2 + sideShift, y: head.y - gap - h, pref: 0 },
      { side: 'right', x: fb.x + fb.w + gap, y: A.right.y - h / 2, pref: 6 },
      { side: 'left', x: fb.x - gap - w, y: A.left.y - h / 2, pref: 7 },
      { side: 'below', x: head.x - w / 2 + sideShift, y: fb.y + fb.h + gap, pref: 30 },
    ];
    let best = null, bs = Infinity;
    for (const c of cands) {
      let s = c.pref;
      s += (max(0, 4 - c.x) + max(0, c.x + w - (W - 4)) + max(0, 4 - c.y) + max(0, c.y + h - (H - 4))) * 0.5;
      const ov = (r) => r ? max(0, min(c.x + w, r.x + r.w) - max(c.x, r.x)) * max(0, min(c.y + h, r.y + r.h) - max(c.y, r.y)) : 0;
      s += (ov(T) / max(1, w * h)) * 40;
      s += (ov(fb) / max(1, w * h)) * 60;
      if (b.side === c.side) s -= 8;
      if (s < bs) { bs = s; best = c; }
    }
    b.side = best.side;
    const tx = clamp(best.x, 4, max(4, W - w - 4)), ty = clamp(best.y, 4, max(4, H - h - 4));
    if (first || !b.init) { b.x = tx; b.y = ty; b.init = true; }
    else { const k = 1 - Math.exp(-dt * 14); b.x += (tx - b.x) * k; b.y += (ty - b.y) * k; }
    const x = round(b.x / S) * S, y = round(b.y / S) * S;
    const tail = visible ? this._tailGeom(b, x, y, A[b.side]) : null;
    const key = `${b.bw},${b.bh},${tail ? [tail.bx, tail.by, tail.tx, tail.ty].map(round).join(',') : '-'}`;
    if (key !== b.geomKey) {
      b.geomKey = key;
      const g = drawBubbleArt(b.cv, { variant: b.variant, bw: b.bw, bh: b.bh, tail, seed: b.seed });
      b.cv.style.width = g.W * S + 'px';
      b.cv.style.height = g.H * S + 'px';
      b.cv.style.left = -g.ox * S + 'px';
      b.cv.style.top = -g.oy * S + 'px';
      const o = tail ? `${tail.tx * S}px ${tail.ty * S}px` : '50% 100%';
      b.pop.style.transformOrigin = o;
      b.bob.style.transformOrigin = o;
    }
    b.el.style.transform = `translate3d(${x}px,${y}px,0)`;
    b.el.style.opacity = visible ? '1' : '0';
  }

  // tail from the body edge facing the anchor, in art px relative to the body
  _tailGeom(b, x, y, a) {
    const S = BS, bw = b.bw, bh = b.bh;
    let tx = (a.x - x) / S, ty = (a.y - y) / S;
    let bx, by, nx = 0, ny = 0;
    const R = 5, lim = (v, lo, hi) => clamp(v, lo, max(lo, hi));
    if (ty > bh + 2) { by = bh - 1; bx = lim(bw / 2 + (tx - bw / 2) * 0.45, R + 3, bw - R - 3); ny = 1; }
    else if (ty < -2) { by = 1; bx = lim(bw / 2 + (tx - bw / 2) * 0.45, R + 3, bw - R - 3); ny = -1; }
    else if (tx > bw) { bx = bw - 1; by = lim(bh / 2 + (ty - bh / 2) * 0.4, R, bh - R); nx = 1; }
    else if (tx < 0) { bx = 1; by = lim(bh / 2 + (ty - bh / 2) * 0.4, R, bh - R); nx = -1; }
    else return null; // anchor inside the bubble: no tail
    const L = hypot(tx - bx, ty - by), MAXL = 22;
    if (L > MAXL) { tx = bx + ((tx - bx) / L) * MAXL; ty = by + ((ty - by) / L) * MAXL; }
    if (hypot(tx - bx, ty - by) < 4) return null;
    return { bx, by, tx: round(tx), ty: round(ty), nx, ny };
  }

  _advance() {
    const b = this.bub;
    if (!b || b.closing) return;
    if (!b.typed) { b.shown = b.chars.length; return; }
    this._sfx('click', { volume: 0.4 });
    this._closeBubble(false);
  }

  _closeBubble(instant) {
    const b = this.bub;
    if (!b || b.closing) return;
    b.closing = true;
    this.bub = null;
    this.catcher.classList.remove('on');
    this.rig?.stopTalking?.();
    b.resolve();
    const el = b.el;
    if (instant || REDUCED) { el.remove(); return; }
    el.classList.add('tch-out');
    this._sfx('plop', { volume: 0.3, pitch: 1.3 });
    setTimeout(() => {
      // poof
      const cx = b.x + (b.bw * BS) / 2, cy = b.y + (b.bh * BS) / 2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + Math.random() * 0.5, big = i % 2 === 0, S = BS;
        const p = document.createElement('i');
        p.className = 'tch-puff';
        const sz = (big ? 15 : 11) * S, rx = ((b.bw * S) / 2) * 0.55, ry = ((b.bh * S) / 2) * 0.55;
        const url = pixURL('puff' + (big ? 6 : 4) + S, puffRows(big ? 6 : 4), { k: PAL.k, w: '#fff', g: '#c9c9d2' }, S);
        p.style.cssText = `left:${round(cx + cos(a) * rx - sz / 2)}px;top:${round(cy + sin(a) * ry - sz / 2)}px;width:${sz}px;height:${sz}px;background-image:url(${url});--dx:${round(cos(a) * 7) * S}px;--dy:${round(sin(a) * 5 - 3) * S}px`;
        this.bubLayer.appendChild(p);
        setTimeout(() => p.remove(), 520);
      }
      el.remove();
    }, 150);
  }

  _key(e) {
    if (!this.waiting) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); this._advance(); }
  }

  // ---------------------------------------------------------------- misc
  _sfx(name, o = {}) {
    const a = this.audio;
    if (!a?.play) return;
    const pan = this.W ? clamp((this.f.x / this.W) * 2 - 1, -1, 1) * 0.5 : 0;
    try { a.play(name, { pan, ...o }); } catch (e) { /* audio is optional */ }
  }

  _resolveAll(list) { const l = list.splice(0); for (const r of l) r(); }
}

// ---------------------------------------------------------------- helpers
function strokePoint(s, d) {
  const { pts, cum } = s;
  if (d <= 0) return pts[0];
  if (d >= s.L) return pts[pts.length - 1];
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < d) lo = mid; else hi = mid; }
  const u = (d - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * u, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * u];
}

// a point d px from a toward b
function toward(a, b, d) {
  const dx = b.x - a.x, dy = b.y - a.y, L = hypot(dx, dy) || 1;
  return { x: a.x + (dx / L) * d, y: a.y + (dy / L) * d };
}

// middle of the side of rect r that faces p (a bit toward p along that side), pushed out by `out` px
function sideMid(r, p, out = 0) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const dx = p.x - cx, dy = p.y - cy;
  if (abs(dx) / max(1, r.w) > abs(dy) / max(1, r.h)) {
    const sx = dx > 0 ? 1 : -1;
    return { x: cx + sx * (r.w / 2 + out), y: clamp(cy + dy * 0.15, r.y + r.h * 0.25, r.y + r.h * 0.75) };
  }
  const sy = dy > 0 ? 1 : -1;
  return { x: clamp(cx + dx * 0.15, r.x + r.w * 0.25, r.x + r.w * 0.75), y: cy + sy * (r.h / 2 + out) };
}

// point on rect r's border toward p, pushed out by `out` px
function edgePoint(r, p, out = 0) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const dx = p.x - cx, dy = p.y - cy;
  if (abs(dx) < 1e-6 && abs(dy) < 1e-6) return { x: cx, y: cy };
  const sx = r.w / 2 / (abs(dx) || 1e-6), sy = r.h / 2 / (abs(dy) || 1e-6);
  const k = min(sx, sy);
  const L = hypot(dx, dy);
  return { x: cx + dx * k + (dx / L) * out, y: cy + dy * k + (dy / L) * out };
}

const _puffCache = new Map();
function puffSprite(r) {
  let c = _puffCache.get(r);
  if (c) return c;
  const rows = puffRows(r);
  const n = rows.length;
  c = mkCanvas(n, n);
  const g = c.getContext('2d');
  const pal = { k: 'rgba(22,17,20,0.85)', w: '#fffaf0', g: '#d8d0c4' };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const k = rows[y][x]; if (pal[k]) { g.fillStyle = pal[k]; g.fillRect(x, y, 1, 1); } }
  _puffCache.set(r, c);
  return c;
}

// typewriter text from (trusted) HTML: words stay together, tags keep their styling
function buildText(textEl, html) {
  const chars = [];
  let i = 0;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const walk = (src, dst) => {
    for (const n of [...src.childNodes]) {
      if (n.nodeType === 3) {
        for (const w of n.nodeValue.split(/(\s+)/)) {
          if (!w) continue;
          if (/^\s+$/.test(w)) { dst.appendChild(document.createTextNode(' ')); chars.push({ el: null, ch: ' ' }); continue; }
          const wEl = document.createElement('span');
          wEl.className = 'tch-w';
          for (const ch of w) {
            const c = document.createElement('span');
            c.className = 'tch-ch';
            c.style.setProperty('--i', i++);
            const s = document.createElement('span');
            s.textContent = ch;
            c.appendChild(s);
            wEl.appendChild(c);
            chars.push({ el: c, ch });
          }
          dst.appendChild(wEl);
        }
      } else if (n.nodeType === 1) {
        if (n.tagName === 'BR') { dst.appendChild(document.createElement('br')); continue; }
        if (n.tagName === 'IMG' || n.tagName === 'CANVAS' || !n.childNodes.length) {
          const c = document.createElement('span');
          c.className = 'tch-ch tch-ico';
          const s = document.createElement('span');
          s.appendChild(n.cloneNode(true));
          c.appendChild(s);
          dst.appendChild(c);
          chars.push({ el: c, ch: '' });
          continue;
        }
        const e = n.cloneNode(false);
        dst.appendChild(e);
        walk(n, e);
      }
    }
  };
  walk(tpl.content, textEl);
  return { chars, plain: tpl.content.textContent || '' };
}

export default TeacherOverlay;
