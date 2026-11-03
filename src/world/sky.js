// Sky backdrop (gradient, stars, aurora borealis) and time-of-day lighting.
//
// [v31 light] The day has a real arc: a warm peach morning with long shadows,
// a bright clean noon, a strong golden hour (low orange sun, long warm
// shadows, cool blue-violet shade), a blue-violet dusk and a deep blue,
// moonlit night where lamps and windows glow. Besides the lights and the sky,
// each key carries the colour grade for the post pass (split toning: a lift
// into the shadows, a tint on the highlights, saturation, contrast), how much
// drifting cloud shadow and how many dithered light shafts the renderer draws,
// and how strongly lamps bloom. The renderer picks `sky.post` up every frame
// it is fresh (see PixelRenderer.render). The sky gradient is banded and
// ordered-dithered (never a smooth ramp), with a warm horizon glow at dawn
// and dusk.
import * as THREE from 'three';

const skyVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }
`;
const skyFrag = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uBottom;
uniform vec3 uGlow;
uniform float uNight;
uniform float uAurora;
uniform float uTime;
uniform float uYaw;
varying vec2 vUv;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float bay2(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float bay4(vec2 a) { return bay2(0.5 * a) * 0.25 + bay2(a); }
void main() {
  float y = vUv.y;
  vec2 cell = floor(gl_FragCoord.xy);
  float d = bay4(cell);
  // [v31 light] 9 bands, ordered-dithered seams (no smooth ramp)
  float t = clamp((y - 0.05) / 0.9, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  t = floor(t * 9.0 + d) / 9.0;
  vec3 col = mix(uBottom, uTop, t);
  // horizon glow (dawn / golden hour / dusk), 3 dithered steps
  float g = clamp(1.0 - y * 2.2, 0.0, 1.0);
  g = floor(g * 3.0 + d) / 3.0;
  col += uGlow * g * 0.55;
  float h = h21(cell + vec2(floor(uYaw * 40.0), 0.0));
  float tw = 0.55 + 0.45 * sin(uTime * 2.3 + h * 91.0);
  col += step(0.9975, h) * uNight * step(0.5, tw) * vec3(0.9, 0.95, 1.0);
  col += step(0.99935, h) * uNight * vec3(0.6);
  float x = vUv.x + uYaw * 0.3;
  float band = 0.5 + 0.5 * sin(x * 5.0 + uTime * 0.18 + sin(x * 11.0 + uTime * 0.31) * 0.9);
  float y0 = 0.58 + 0.1 * sin(x * 3.5 + uTime * 0.09);
  float a = smoothstep(y0 - 0.12, y0 + 0.02, y) * smoothstep(y0 + 0.34, y0 + 0.02, y) * band;
  float rays = 0.55 + 0.45 * sin(floor(x * 140.0) * 0.9 + uTime * 0.6);
  a *= rays;
  a = floor(a * 4.0 + d) / 4.0;
  col += uAurora * a * mix(vec3(0.08, 0.85, 0.45), vec3(0.55, 0.2, 0.75), step(y0 + 0.16, y)) * 0.55;
  gl_FragColor = vec4(col, 1.0);
}
`;

// keyframes over the day (hour -> look)
//  sun/sunI     the sun (or moon) colour / intensity
//  sky/gnd/hemiI  hemisphere light (sky = the colour of the shade, gnd = bounce)
//  top/bot/glow the sky gradient and its horizon glow
//  sh/dp/tint   water shallow / deep / reflected sky
//  aur          aurora
//  gm           post grade multiplier, shd = lift into the shadows, hi = highlight tint
//  sat/con      saturation / contrast, cl = cloud shadows, sf = light shafts, gl = lamp bloom
const KEYS = [
  { h: 0, sun: 0x9ab8ff, sunI: 0.95, sky: 0x2c4688, gnd: 0x10162a, hemiI: 0.7, top: 0x03081a, bot: 0x0e1a44, glow: 0x000000, sh: 0x15405e, dp: 0x0a1c3c, tint: 0x1c2e62, aur: 1,
    gm: [0.86, 0.96, 1.2], shd: 0x0a1850, hi: 0xc4d8ff, sat: 0.86, con: 1.1, cl: 0.25, sf: 0, gl: 1 },
  { h: 5.2, sun: 0x9a90d8, sunI: 0.7, sky: 0x4a4a8c, gnd: 0x221c30, hemiI: 0.72, top: 0x141a46, bot: 0x5a3e70, glow: 0x3a1830, sh: 0x2a5a74, dp: 0x163052, tint: 0x6a5080, aur: 0.3,
    gm: [0.98, 0.95, 1.1], shd: 0x1c0c40, hi: 0xe0c8ff, sat: 0.92, con: 1.1, cl: 0.2, sf: 0, gl: 0.7 },
  { h: 6.4, sun: 0xffa676, sunI: 2.3, sky: 0x8e98d8, gnd: 0x4a4440, hemiI: 0.86, top: 0x5a70c0, bot: 0xffb08a, glow: 0xff7a4a, sh: 0x3a8088, dp: 0x2a4a78, tint: 0xf0a890, aur: 0,
    gm: [1.06, 0.99, 0.94], shd: 0x241048, hi: 0xffd0a8, sat: 1.08, con: 1.07, cl: 0.55, sf: 1, gl: 0.25 },
  { h: 8, sun: 0xffd6a4, sunI: 2.65, sky: 0xa4bcf0, gnd: 0x5a5a3a, hemiI: 0.95, top: 0x6aa0e0, bot: 0xffe2c4, glow: 0xffb070, sh: 0x3a9494, dp: 0x2a5a8a, tint: 0xd8e4f0, aur: 0,
    gm: [1.06, 1.0, 0.94], shd: 0x101c48, hi: 0xfff0d4, sat: 1.12, con: 1.07, cl: 0.75, sf: 0.75, gl: 0 },
  { h: 10.5, sun: 0xfff2dc, sunI: 2.65, sky: 0xb0ccff, gnd: 0x687044, hemiI: 1.0, top: 0x5a9ce6, bot: 0xd4ecfa, glow: 0x000000, sh: 0x3a9894, dp: 0x2a5a8a, tint: 0xc8e0f0, aur: 0,
    gm: [1.03, 0.99, 0.97], shd: 0x0c1840, hi: 0xfff4e2, sat: 1.03, con: 1.08, cl: 1, sf: 0.25, gl: 0 },
  { h: 12.8, sun: 0xfff8ec, sunI: 2.6, sky: 0xb8d4ff, gnd: 0x6a7044, hemiI: 1.02, top: 0x4c96e6, bot: 0xc8e6fa, glow: 0x000000, sh: 0x3a9c96, dp: 0x2a5c8e, tint: 0xd0e8f8, aur: 0,
    gm: [1.02, 0.99, 0.98], shd: 0x0c1840, hi: 0xfff6e8, sat: 1.0, con: 1.08, cl: 1, sf: 0.15, gl: 0 },
  { h: 15.6, sun: 0xffeccc, sunI: 2.7, sky: 0xb0c6f4, gnd: 0x6e6a44, hemiI: 0.98, top: 0x5a9ae0, bot: 0xe6e4d8, glow: 0x402010, sh: 0x3a9890, dp: 0x2a5a8a, tint: 0xe0e0e0, aur: 0,
    gm: [1.05, 0.99, 0.95], shd: 0x101640, hi: 0xfff0d8, sat: 1.06, con: 1.08, cl: 0.95, sf: 0.45, gl: 0 },
  { h: 17.3, sun: 0xffc272, sunI: 3.3, sky: 0x8a94d8, gnd: 0x5a4a3a, hemiI: 0.98, top: 0x5a6ab8, bot: 0xffc47c, glow: 0xff8a3a, sh: 0x3a8a8a, dp: 0x2a4a80, tint: 0xffb070, aur: 0,
    gm: [1.07, 1.0, 0.9], shd: 0x26104c, hi: 0xffdc9a, sat: 1.12, con: 1.08, cl: 0.85, sf: 1, gl: 0.1 },
  { h: 18.6, sun: 0xff8a58, sunI: 2.6, sky: 0x847ac8, gnd: 0x40304a, hemiI: 0.95, top: 0x3a3a88, bot: 0xff7a58, glow: 0xff5a3a, sh: 0x3c747e, dp: 0x2e4072, tint: 0xff8060, aur: 0,
    gm: [1.08, 0.96, 0.96], shd: 0x2c0e50, hi: 0xffb48a, sat: 1.14, con: 1.08, cl: 0.5, sf: 0.85, gl: 0.35 },
  { h: 19.6, sun: 0xa88ae8, sunI: 0.9, sky: 0x8a84d8, gnd: 0x3a3060, hemiI: 1.02, top: 0x1c2262, bot: 0x8a5a9c, glow: 0x6a2a6a, sh: 0x2f5c76, dp: 0x1c3662, tint: 0x6a5aa0, aur: 0.15,
    gm: [0.95, 0.94, 1.14], shd: 0x1c0c48, hi: 0xd8c0ff, sat: 1.06, con: 1.06, cl: 0.2, sf: 0, gl: 0.75 },
  { h: 21, sun: 0x9ab8ff, sunI: 0.95, sky: 0x2e4a8c, gnd: 0x10162a, hemiI: 0.72, top: 0x060c28, bot: 0x14225a, glow: 0x000000, sh: 0x1a4a68, dp: 0x0e264a, tint: 0x203868, aur: 1,
    gm: [0.86, 0.96, 1.2], shd: 0x0a1850, hi: 0xc4d8ff, sat: 0.86, con: 1.1, cl: 0.25, sf: 0, gl: 1 },
  { h: 24, sun: 0x9ab8ff, sunI: 0.95, sky: 0x2c4688, gnd: 0x10162a, hemiI: 0.7, top: 0x03081a, bot: 0x0e1a44, glow: 0x000000, sh: 0x15405e, dp: 0x0a1c3c, tint: 0x1c2e62, aur: 1,
    gm: [0.86, 0.96, 1.2], shd: 0x0a1850, hi: 0xc4d8ff, sat: 0.86, con: 1.1, cl: 0.25, sf: 0, gl: 1 },
];
// day arc of the sun (hours): rises / sets here; the moon takes over in between
const RISE = 6.0, SET = 19.6;
const MOON = new THREE.Vector3(0.45, 0.85, 0.55).normalize();

const cA = new THREE.Color(), cB = new THREE.Color();
function lerpHex(a, b, t, out) {
  cA.setHex(a); cB.setHex(b);
  return out.copy(cA).lerp(cB, t);
}
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Sky {
  constructor(scene) {
    this.uniforms = {
      uTop: { value: new THREE.Color() },
      uBottom: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uNight: { value: 0 },
      uAurora: { value: 0 },
      uTime: { value: 0 },
      uYaw: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);

    this.sun = new THREE.DirectionalLight(0xffffff, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.near = 1; sc.far = 220;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xc4dcff, 0x5b6a3a, 1.1);
    scene.add(this.hemi);

    this.state = {
      night: 0,
      aurora: 0,
      waterShallow: new THREE.Color(),
      waterDeep: new THREE.Color(),
      skyTint: new THREE.Color(),
      sunDir: new THREE.Vector3(),
      golden: 0, // [v31 light] 0..1: how golden the light is (dawn / golden hour)
      dayK: 1, // [v31 light] 0..1: the sun is up and shining
      overcast: 0, // [v31 light] 0..1: how much the weather dimmed the sun this frame
    };
    // [v31 light] the colour grade + atmosphere for the renderer's post pass
    this.post = {
      fresh: false,
      mul: new THREE.Vector3(1, 1, 1),
      shadow: new THREE.Vector3(0, 0, 0),
      high: new THREE.Vector3(1, 1, 1),
      sat: 1, con: 1, glow: 0,
      cloud: 0, shaft: 0,
      cloudCol: new THREE.Vector3(0.72, 0.76, 0.92),
      shaftCol: new THREE.Vector3(1, 0.9, 0.7),
      sunDir: this.state.sunDir,
      wind: new THREE.Vector2(0.55, 0.22),
      haze: new THREE.Vector3(1, 0.88, 0.76), // tilt-shift haze colour (the horizon)
    };
    scene.userData.skyPost = this.post;
    this._tmp = new THREE.Color();
    this._c2 = new THREE.Color();
    this._d1 = new THREE.Vector3();
  }

  // hour in [0,24)
  update(hour, time, focus, yaw) {
    const u = this.uniforms;
    u.uTime.value = time;
    u.uYaw.value = yaw;
    let a = KEYS[0], b = KEYS[1];
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (hour >= KEYS[i].h && hour <= KEYS[i + 1].h) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    }
    const t = (hour - a.h) / Math.max(0.0001, b.h - a.h);
    const s = this.state;
    lerpHex(a.sun, b.sun, t, this.sun.color);
    this.sun.intensity = a.sunI + (b.sunI - a.sunI) * t;
    lerpHex(a.sky, b.sky, t, this.hemi.color);
    lerpHex(a.gnd, b.gnd, t, this.hemi.groundColor);
    this.hemi.intensity = a.hemiI + (b.hemiI - a.hemiI) * t;
    lerpHex(a.top, b.top, t, u.uTop.value);
    lerpHex(a.bot, b.bot, t, u.uBottom.value);
    lerpHex(a.glow, b.glow, t, u.uGlow.value);
    lerpHex(a.sh, b.sh, t, s.waterShallow);
    lerpHex(a.dp, b.dp, t, s.waterDeep);
    lerpHex(a.tint, b.tint, t, s.skyTint);
    s.aurora = a.aur + (b.aur - a.aur) * t;
    // [v31 light] the post grade for this hour
    const P = this.post;
    const L = (x, y) => x + (y - x) * t;
    P.mul.set(L(a.gm[0], b.gm[0]), L(a.gm[1], b.gm[1]), L(a.gm[2], b.gm[2]));
    lerpHex(a.shd, b.shd, t, this._tmp);
    P.shadow.set(this._tmp.r * 0.32, this._tmp.g * 0.32, this._tmp.b * 0.32);
    lerpHex(a.hi, b.hi, t, this._tmp);
    P.high.set(1 + (this._tmp.r - 1) * 0.4, 1 + (this._tmp.g - 1) * 0.4, 1 + (this._tmp.b - 1) * 0.4);
    P.sat = L(a.sat, b.sat); P.con = L(a.con, b.con); P.glow = L(a.gl, b.gl);
    P.cloud = L(a.cl, b.cl); P.shaft = L(a.sf, b.sf);
    if (s.aurora > 0.01) {
      // northern lights wash the landscape in slowly shifting green / violet
      const k = 0.5 + 0.5 * Math.sin(time * 0.23) * Math.sin(time * 0.071 + 1.3);
      this._tmp.setRGB(0.25 + 0.35 * (1 - k), 0.95, 0.55 + 0.45 * (1 - k));
      this.hemi.color.lerp(this._tmp, 0.22 * s.aurora);
      this.hemi.intensity += 0.18 * s.aurora;
    }
    let night = hour < 6 ? 1 : hour < 7.5 ? 1 - (hour - 6) / 1.5 : hour > 19.5 ? Math.min(1, (hour - 19.5) / 1.5) : 0;
    // `moonlit` (0..1, set by the night tour): a bright, silvery full moon so the
    // camera can actually show the pond at night
    const ml = this.moonlit || 0;
    if (ml > 0.001) {
      this.sun.intensity += 0.75 * ml;
      this.hemi.intensity += 0.45 * ml;
      this._tmp.setHex(0xbcd0ff);
      this.sun.color.lerp(this._tmp, 0.5 * ml);
      night *= 1 - 0.4 * ml;
      P.sat += (1 - P.sat) * 0.5 * ml;
    }
    // [v18 bear events] `bloodMoon` (0..1, set by src/game/BloodMoon.js): the sky, sun, water
    // and light all turn a deep, eerie red; no aurora
    const bm = this.bloodMoon || 0;
    if (bm > 0.001) {
      const c = this._tmp;
      this.sun.color.lerp(c.setHex(0xff3a2a), 0.85 * bm);
      this.sun.intensity = this.sun.intensity * (1 - bm) + (0.95 + 0.25 * (1 - night)) * bm;
      this.hemi.color.lerp(c.setHex(0xb02a3a), 0.8 * bm);
      this.hemi.groundColor.lerp(c.setHex(0x3a0a10), 0.8 * bm);
      this.hemi.intensity = this.hemi.intensity * (1 - bm) + 0.95 * bm;
      u.uTop.value.lerp(c.setHex(0x1a0206), 0.85 * bm);
      u.uBottom.value.lerp(c.setHex(0xa0141e), 0.85 * bm);
      u.uGlow.value.lerp(c.setHex(0x600008), 0.85 * bm);
      s.waterShallow.lerp(c.setHex(0x7a1820), 0.75 * bm);
      s.waterDeep.lerp(c.setHex(0x3a0610), 0.75 * bm);
      s.skyTint.lerp(c.setHex(0xd02030), 0.8 * bm);
      s.aurora *= 1 - bm;
      night *= 1 - 0.35 * bm; // the blood moon is bright: you can see them coming
      // the grade goes red too (a lift of blood into the shadows), no shafts
      P.mul.lerp(this._d1.set(1.12, 0.9, 0.88), bm);
      P.shadow.lerp(this._d1.set(0.1, 0.0, 0.02), bm);
      P.high.lerp(this._d1.set(1.05, 0.92, 0.9), bm);
      P.sat += (1.15 - P.sat) * bm; P.shaft *= 1 - bm; P.cloud *= 1 - bm;
    }
    s.night = night;
    u.uNight.value = night;
    u.uAurora.value = s.aurora;
    // [v26 seasons] weather: overcast, fog, heat glare, lightning (src/world/weatherFx.js)
    const sunBefore = this.sun.intensity;
    if (this.weather) { try { this.weather(this, hour, time, night); } catch (e) { this.weather = null; console.warn('[sky weather]', e); } }
    // [v31 light] overcast (the weather dims the sun): no cloud shadows / shafts through a grey lid
    const ov = sunBefore > 0.05 ? Math.min(1, Math.max(0, (1 - this.sun.intensity / sunBefore) / 0.6)) : 0;
    s.overcast = ov;
    P.cloud *= 1 - ov; P.shaft *= 1 - ov;

    // Sun path: rises in the east, sets in the west (south-facing arc).
    // [v31 light] low in the morning and at golden hour (long shadows), high at
    // noon; the moon takes over just after sunset (and before sunrise) with a
    // quick blend, so the shadows swing round instead of jumping.
    const k = Math.min(1, Math.max(0, (hour - RISE) / (SET - RISE)));
    const az = Math.PI * (0.15 + 0.7 * k);
    const el = Math.max(0.22, 0.1 + 0.82 * Math.pow(Math.sin(k * Math.PI), 1.5));
    let hx = Math.cos(az), hz = Math.sin(az) * 0.8 + 0.25;
    const hl = Math.hypot(hx, hz) || 1;
    hx /= hl; hz /= hl;
    const dir = this._d1.set(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el));
    const mw = hour >= 12 ? sm(SET, SET + 0.7, hour) : 1 - sm(RISE - 0.7, RISE, hour);
    if (mw > 0) dir.lerp(MOON, mw).normalize();
    // the swing happens in the dim gap between sun and moon
    this.sun.intensity *= 1 - 0.6 * Math.sin(Math.min(1, mw) * Math.PI);
    s.sunDir.copy(dir);
    s.dayK = (1 - mw) * (1 - night * 0.9);
    s.golden = Math.max(sm(5.8, 6.6, hour) * (1 - sm(7.6, 9.4, hour)), sm(15.6, 17.2, hour) * (1 - sm(18.9, 19.7, hour))) * (1 - ov);
    // light shafts and cloud shadows take the sun's colour
    P.shaftCol.set(this.sun.color.r, this.sun.color.g * 0.92, this.sun.color.b * 0.78);
    this._c2.copy(this.hemi.color);
    P.cloudCol.set(0.54 + this._c2.r * 0.14, 0.57 + this._c2.g * 0.15, 0.66 + this._c2.b * 0.22);
    if (night > 0.5) P.cloudCol.set(0.7, 0.74, 0.86);
    this._c2.copy(u.uBottom.value).lerp(u.uGlow.value, 0.3);
    P.haze.set(this._c2.r * 0.85 + 0.12 * (1 - night), this._c2.g * 0.85 + 0.12 * (1 - night), this._c2.b * 0.85 + 0.12 * (1 - night));
    // (the title screen patches sky.update with its own light: it keeps its own grade)
    P.fresh = !Object.prototype.hasOwnProperty.call(this, 'update');

    // shadow camera follows focus, snapped to shadow texels in light space
    const sc = this.sun.shadow.camera;
    const texel = (sc.right - sc.left) / this.sun.shadow.mapSize.x;
    const o = this._basis || (this._basis = new THREE.Object3D());
    o.position.set(0, 0, 0);
    o.up.set(0, 1, 0);
    o.lookAt(-dir.x, -dir.y, -dir.z);
    o.updateMatrixWorld(true);
    const e = o.matrixWorld.elements;
    const R = this._R || (this._R = new THREE.Vector3());
    const U = this._U || (this._U = new THREE.Vector3());
    R.set(e[0], e[1], e[2]);
    U.set(e[4], e[5], e[6]);
    const p = this._p || (this._p = new THREE.Vector3());
    p.set(focus.x, 0, focus.z);
    const ra = p.dot(R), ua = p.dot(U);
    p.addScaledVector(R, Math.round(ra / texel) * texel - ra).addScaledVector(U, Math.round(ua / texel) * texel - ua);
    this.sun.target.position.copy(p);
    this.sun.position.set(p.x + dir.x * 90, p.y + dir.y * 90, p.z + dir.z * 90);
    this.sun.target.updateMatrixWorld();
  }

  setShadowExtent(ext) {
    const sc = this.sun.shadow.camera;
    const e = Math.max(18, Math.min(60, ext));
    if (Math.abs(sc.right - e) > 0.5) {
      sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e;
      sc.updateProjectionMatrix();
    }
  }
}
