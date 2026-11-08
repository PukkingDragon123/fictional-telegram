// [v33 title] The noon sky curtain behind the title cinematic (src/game/title/HeistScene.js).
//
// A painted backdrop hung a few tiles behind the camera's focus, always facing the
// camera: a clear blue noon sky in chunky dithered bands, a few fat cumulus clouds
// (lit white crowns, blue-grey flat bellies) drifting by, a high cirrus streak, a far
// blue range with sunlit snow, a nearer green range, and two tree lines painted from
// the world's own tree sprites (a hazy far one and a sunlit near one). Every layer
// slides with the camera's orbit and pan at its own rate, so crane / dolly / orbit
// moves get real parallax although the game camera is orthographic. Nothing smooth:
// every gradient is banded and ordered-dithered on the low-res pixel grid.
import * as THREE from 'three';
import { natureCanvas } from '../../art/natureArt.js';

const VERT = /* glsl */ `
varying vec3 vL;
void main() { vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uPx;
uniform float uTop;
uniform float uYaw;   // camera yaw relative to the set's base view (radians)
uniform float uPan;   // camera pan along the set's base right vector (world units)
uniform sampler2D uFar;
uniform sampler2D uNear;
uniform vec3 uFarS;   // world width, world height, texel height
uniform vec3 uNearS;
varying vec3 vL;
float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float n11(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h11(i), h11(i + 1.0), f); }
float bayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.x) + int(q.y) * 4;
  float m[16];
  m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0; m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
  m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0; m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
  float b = 0.0;
  for (int k = 0; k < 16; k++) if (k == i) b = m[k];
  return (b + 0.5) / 16.0;
}
// a jagged mountain range: height at x, and whether x is on the face lit from the left
vec2 range(float x, float w, float hmin, float hmax, float seed) {
  float h = 0.0, lit = 0.0;
  for (int k = -1; k <= 1; k++) {
    float c = floor(x / w) + float(k);
    float cx = (c + 0.25 + 0.5 * h11(c * 3.7 + seed)) * w;
    float th = mix(hmin, hmax, h11(c * 9.13 + seed));
    float hw = w * mix(0.75, 1.15, h11(c * 1.9 + seed));
    float d = abs(x - cx) / hw;
    float y = th * (1.0 - d) + (n11(x * 2.6 + seed) - 0.5) * 0.18 * th + (n11(x * 7.0 + seed) - 0.5) * 0.06 * th;
    if (y > h) { h = y; lit = step(x, cx); }
  }
  return vec2(h, lit);
}
// one cumulus: a flat belly and four round puffs. Returns (inside, shade 0 lit .. 1 dark)
vec2 cumulus(vec2 q, vec2 c, float s, float seed) {
  vec2 d = (q - c) / s;
  if (d.y < -0.05 || abs(d.x) > 2.6 || d.y > 2.2) return vec2(0.0);
  float inside = 0.0, shade = 1.0;
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    vec2 pc = vec2(-1.55 + fk * 0.78 + (h11(fk + seed) - 0.5) * 0.3, 0.42 + (k == 2 ? 0.75 : k == 1 || k == 3 ? 0.42 : 0.05) + h11(fk * 3.1 + seed) * 0.2);
    float pr = (k == 2 ? 0.95 : k == 1 || k == 3 ? 0.78 : 0.6) * (0.9 + h11(fk * 5.7 + seed) * 0.2);
    vec2 e = d - pc;
    float l = length(e);
    if (l < pr) {
      inside = 1.0;
      // lit from the upper left: how far round from the light this point sits on its puff
      float lit = dot(e / max(l, 0.001), normalize(vec2(-0.55, 0.85)));
      float sh = clamp(0.5 - lit * 0.55 + (1.0 - l / pr) * -0.15, 0.0, 1.0);
      shade = min(shade, sh);
    }
  }
  if (inside > 0.5) shade = max(shade, smoothstep(0.32, 0.0, d.y) * 0.95); // the flat, shaded belly
  return vec2(inside, shade);
}
vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }
void main() {
  vec2 p = vL.xy;
  vec2 fc = gl_FragCoord.xy;
  float dith = bayer(fc) - 0.5;
  float sk = 11.0 / max(uTop, 0.5); // sky units: 0 = curtain base, 11 = top of the screen
  float Y = p.y * sk;
  float lift = 1.12 * sk - 4.7; // the horizon rides on the tree line (tall screens show more sky)
  // layer x (world units) with parallax: far layers barely pan and swing less on orbits
  float xm = p.x - 9.0 * uYaw + 0.12 * uPan;   // ranges
  float xc = p.x - 7.0 * uYaw + 0.06 * uPan;   // clouds
  float Xm = xm * sk, Xc = xc * sk;
  // --- noon gradient in dithered bands: pale at the horizon, deep blue overhead
  float y = Y - lift + dith * 0.6;
  float yb = floor(y / 0.5) * 0.5;
  vec3 col = vec3(0.80, 0.92, 0.99);
  col = mix(col, vec3(0.64, 0.84, 0.99), smoothstep(4.4, 5.6, yb));
  col = mix(col, vec3(0.50, 0.75, 0.98), smoothstep(5.6, 7.0, yb));
  col = mix(col, vec3(0.38, 0.65, 0.96), smoothstep(7.0, 8.6, yb));
  col = mix(col, vec3(0.30, 0.56, 0.93), smoothstep(8.6, 10.4, yb));
  col = mix(col, vec3(0.24, 0.47, 0.88), smoothstep(10.4, 13.0, yb));
  // the sun is high behind the camera, over the left shoulder: a warm dithered glare in that corner
  float gl = clamp(1.0 - length(vec2(Xc * 0.02 + 0.55, (Y - lift) * 0.06 - 0.75)) * 1.4, 0.0, 1.0);
  col = mix(col, vec3(0.86, 0.95, 1.0), floor((gl + dith * 0.2) * 3.0) / 3.0 * 0.5);
  // --- a high cirrus streak
  float ci = n11(Xc * 0.22 + uTime * 0.012) * n11(Xc * 0.9 + 7.0);
  float cy0 = 9.4 + lift + (n11(Xc * 0.07) - 0.5) * 0.8;
  if (abs(Y - cy0) < ci * 0.32 && ci + dith * 0.25 > 0.42) col = mix(col, vec3(0.9, 0.96, 1.0), 0.55);
  // --- fat cumulus clouds drifting right to left
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float span = 46.0;
    float cx = mod(fk * 11.7 + 6.0 - uTime * (0.16 + 0.04 * fk) - xc * 0.0, span) - span * 0.5;
    float cyy = 6.3 + lift + fk * 0.95 + h11(fk * 4.1) * 0.7;
    float s = 1.0 + h11(fk * 2.3) * 0.55 + (k == 1 ? 0.35 : 0.0);
    vec2 cl = cumulus(vec2(Xc, Y), vec2(cx, cyy), s, fk * 13.0);
    if (cl.x > 0.5) {
      float sh = cl.y + dith * 0.32;
      vec3 cc = sh < 0.3 ? vec3(1.0, 1.0, 1.0) : sh < 0.58 ? vec3(0.92, 0.95, 1.0) : sh < 0.82 ? vec3(0.78, 0.85, 0.95) : vec3(0.64, 0.74, 0.88);
      col = cc;
    }
  }
  // --- birds: a few little v's gliding
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    vec2 b = vec2(mod(uTime * (0.22 + fk * 0.05) + fk * 7.0, 26.0) - 13.0 - 6.0 * uYaw, (7.6 + lift + fk * 0.6 + sin(uTime * 0.6 + fk) * 0.2) / sk);
    vec2 q = (vec2(p.x, p.y) - b) / uPx;
    float flap = step(0.0, sin(uTime * 5.5 + fk * 2.0));
    if (abs(q.y + abs(q.x) * (flap > 0.5 ? -0.7 : 0.25)) < 0.75 && abs(q.x) < 3.2) col = vec3(0.2, 0.27, 0.36);
  }
  // --- far range: hazy blue with sunlit snow
  vec2 m1 = range(Xm, 3.4, 1.4, 2.9, 5.0);
  float mh1 = 4.6 + lift + m1.x;
  if (Y < mh1) {
    float t = clamp((mh1 - Y) / 2.2, 0.0, 1.0);
    vec3 mc = m1.y > 0.5 ? vec3(0.66, 0.76, 0.92) : vec3(0.52, 0.62, 0.82);
    if (m1.x > 2.0 && Y > mh1 - 0.6 + dith * 0.25) mc = m1.y > 0.5 ? vec3(0.98, 0.99, 1.0) : vec3(0.78, 0.84, 0.96);
    mc = mix(mc, vec3(0.78, 0.89, 0.98), floor((smoothstep(0.2, 1.0, t) + dith * 0.2) * 3.0) / 3.0 * 0.7);
    col = mc;
  }
  // --- near range: green-blue hills, ridges in the sun
  vec2 m2 = range(Xm * 1.18 + 7.3, 2.3, 0.6, 1.5, 11.0);
  float mh2 = 4.25 + lift + m2.x;
  if (Y < mh2) {
    float t = clamp((mh2 - Y) / 1.4, 0.0, 1.0);
    vec3 mc = m2.y > 0.5 ? vec3(0.52, 0.7, 0.62) : vec3(0.38, 0.54, 0.58);
    if (Y > mh2 - 0.07) mc = vec3(0.68, 0.82, 0.66);
    mc = mix(mc, vec3(0.7, 0.86, 0.88), floor((smoothstep(0.25, 1.0, t) + dith * 0.2) * 3.0) / 3.0 * 0.55);
    col = mc;
  }
  // --- tree lines from the game's own tree sprites
  float xf = p.x - 4.0 * uYaw + 0.3 * uPan;
  if (p.y < uFarS.y) {
    vec2 uv = vec2(xf / uFarS.x + 0.37, p.y / uFarS.y);
    vec4 tf = texture2D(uFar, uv);
    if (tf.a > 0.5) {
      float l = dot(tf.rgb, vec3(0.3, 0.59, 0.11));
      vec3 c2 = mix(vec3(0.3, 0.48, 0.48), vec3(0.42, 0.6, 0.52), step(0.45, l + dith * 0.2));
      if (texture2D(uFar, uv + vec2(0.0, uFarS.z)).a < 0.5) c2 = vec3(0.6, 0.76, 0.58);
      col = mix(c2, vec3(0.66, 0.82, 0.86), 0.28);
    }
  }
  float xn = p.x - 2.0 * uYaw + 0.55 * uPan;
  if (p.y < uNearS.y) {
    vec2 uv = vec2(xn / uNearS.x + 0.11, p.y / uNearS.y);
    vec4 tn = texture2D(uNear, uv);
    if (tn.a > 0.5) {
      float l = dot(tn.rgb, vec3(0.3, 0.59, 0.11));
      float q = floor(clamp(l * 2.4 + dith * 0.35, 0.0, 2.99));
      vec3 nc = q < 1.0 ? vec3(0.13, 0.3, 0.18) : q < 2.0 ? vec3(0.22, 0.44, 0.22) : vec3(0.38, 0.6, 0.27);
      if (texture2D(uNear, uv + vec2(0.0, uNearS.z)).a < 0.5) nc = vec3(0.62, 0.8, 0.36); // the sun on the crowns
      col = nc;
    }
  }
  gl_FragColor = vec4(srgb(max(col, 0.0)), 1.0);
}
`;

// A repeating strip of the world's real tree sprites (natureArt), packed tight and
// overlapping, with a solid wood floor under them. The sky shader recolours it.
function treeLine({ W, H, units, base, seed, n, minH, maxH, kinds }) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true; // downscaled sprites: averaged, then cut at alpha 0.5 by the shader (clean edges)
  g.imageSmoothingQuality = 'high';
  let r = seed * 9301 + 49297;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const pxU = H / units, floorY = Math.round(H - base * pxU);
  const list = [];
  for (let i = 0; i < n; i++) list.push({ x: (i + rnd() * 0.8) / n * W, h: minH + (maxH - minH) * rnd() * rnd() + (maxH - minH) * 0.3 * rnd(), k: kinds[Math.floor(rnd() * kinds.length)] });
  list.sort((a, b) => b.h - a.h);
  for (const t of list) {
    const sc = natureCanvas(t.k, 0, 1);
    if (!sc || sc.width < 2) continue;
    const h = Math.min(t.h, floorY), w = Math.round(sc.width * h / sc.height), y = floorY - h + Math.round(h * 0.06);
    for (const dx of [0, -W, W]) g.drawImage(sc, Math.round(t.x - w / 2 + dx), y, w, h);
  }
  const small = ['spruce_2', 'sapling', 'spruce_1', 'bush_0', 'bush_1'];
  for (let i = 0; i < n * 3; i++) {
    const sc = natureCanvas(small[Math.floor(rnd() * small.length)], 0, 1);
    if (!sc || sc.width < 2) continue;
    const h = Math.round(minH * (0.35 + 0.35 * rnd())), w = Math.round(sc.width * h / sc.height), x = (i + rnd()) / (n * 3) * W;
    for (const dx of [0, -W, W]) g.drawImage(sc, Math.round(x - w / 2 + dx), floorY - h + Math.round(h * 0.25), w, h);
  }
  g.fillStyle = '#2a4a2e';
  g.fillRect(0, floorY, W, H - floorY);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  return { tex, wu: W / pxU };
}

/**
 * The curtain mesh (add it to the scene; place it with place()).
 *   const sky = makeNoonSky();
 *   sky.place(rig, renderer, { dist, yawRel, pan, time });
 */
export function makeNoonSky() {
  const U = { uTime: { value: 0 }, uPx: { value: 0.02 }, uTop: { value: 3 }, uYaw: { value: 0 }, uPan: { value: 0 } };
  const tpx = 112, npx = 100;
  const far = treeLine({ W: 1024, H: tpx, units: 1.25, base: 0.45, seed: 7, n: 70, minH: 28, maxH: 60, kinds: ['spruce_0', 'spruce_1', 'spruce_2', 'pine_0', 'pine_1', 'spruce_0'] });
  const near = treeLine({ W: 1024, H: npx, units: 1.0, base: 0.05, seed: 19, n: 46, minH: 34, maxH: 86, kinds: ['spruce_0', 'spruce_1', 'pine_0', 'pine_1', 'birch_0', 'maple_orange', 'spruce_2', 'aspen_0'] });
  Object.assign(U, {
    uFar: { value: far.tex }, uFarS: { value: new THREE.Vector3(far.wu, 1.25, 1 / tpx) },
    uNear: { value: near.tex }, uNearS: { value: new THREE.Vector3(near.wu, 1.0, 1 / npx) },
  });
  const geo = new THREE.PlaneGeometry(120, 50, 1, 1);
  geo.translate(0, 50 / 2 - 3, 0);
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: U });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'heistSky';
  m.frustumCulled = false;
  m.renderOrder = -10;
  m.uniforms = U;
  m.place = (rig, renderer, { dist = 6, yawRel = 0, pan = 0, time = 0 } = {}) => {
    const yaw = rig.yaw, cy = Math.cos(yaw), sy = Math.sin(yaw);
    const tx = rig.target.x, tz = rig.target.z;
    m.position.set(tx - sy * dist, 0, tz - cy * dist);
    m.rotation.set(0, yaw, 0);
    const hh = (renderer.rtH || 300) * rig.wupp * 0.5, pitch = rig.pitch;
    const topH = (hh + rig.target.y * Math.cos(pitch) - dist * Math.sin(pitch)) / Math.cos(pitch);
    U.uTop.value = Math.max(0.8, topH);
    U.uPx.value = rig.wupp;
    U.uYaw.value = yawRel;
    U.uPan.value = pan;
    U.uTime.value = time;
  };
  m.dispose = () => { geo.dispose(); mat.dispose(); far.tex.dispose(); near.tex.dispose(); };
  return m;
}
