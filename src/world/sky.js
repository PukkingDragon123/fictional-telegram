// Sky backdrop (gradient, stars, aurora borealis) and time-of-day lighting.
import * as THREE from 'three';

const skyVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }
`;
const skyFrag = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uBottom;
uniform float uNight;
uniform float uAurora;
uniform float uTime;
uniform float uYaw;
varying vec2 vUv;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  float y = vUv.y;
  vec3 col = mix(uBottom, uTop, smoothstep(0.05, 0.95, y));
  vec2 cell = floor(gl_FragCoord.xy);
  float h = h21(cell + vec2(floor(uYaw * 40.0), 0.0));
  float tw = 0.55 + 0.45 * sin(uTime * 2.3 + h * 91.0);
  col += step(0.9975, h) * uNight * tw * vec3(0.9, 0.95, 1.0);
  col += step(0.99935, h) * uNight * vec3(0.6);
  float x = vUv.x + uYaw * 0.3;
  float band = 0.5 + 0.5 * sin(x * 5.0 + uTime * 0.18 + sin(x * 11.0 + uTime * 0.31) * 0.9);
  float y0 = 0.58 + 0.1 * sin(x * 3.5 + uTime * 0.09);
  float a = smoothstep(y0 - 0.12, y0 + 0.02, y) * smoothstep(y0 + 0.34, y0 + 0.02, y) * band;
  float rays = 0.55 + 0.45 * sin(floor(x * 140.0) * 0.9 + uTime * 0.6);
  a *= rays;
  col += uAurora * a * mix(vec3(0.08, 0.85, 0.45), vec3(0.55, 0.2, 0.75), smoothstep(y0, y0 + 0.32, y)) * 0.55;
  gl_FragColor = vec4(col, 1.0);
}
`;

// keyframes over the day (hour -> look)
const KEYS = [
  { h: 0, sun: 0x8fa8ff, sunI: 0.55, sky: 0x40508a, gnd: 0x1e2232, hemiI: 0.8, top: 0x050a22, bot: 0x14204a, sh: 0x1a4a66, dp: 0x0e2644, tint: 0x203060, aur: 1 },
  { h: 5.5, sun: 0xa890d8, sunI: 0.7, sky: 0x5a5290, gnd: 0x2a2436, hemiI: 0.8, top: 0x1a2250, bot: 0x6a4a78, sh: 0x2a5a74, dp: 0x163052, tint: 0x6a5080, aur: 0.3 },
  { h: 7, sun: 0xffb488, sunI: 1.45, sky: 0xc4b8ea, gnd: 0x5c4c3c, hemiI: 1.15, top: 0x6a8ad0, bot: 0xf2c0a0, sh: 0x3a8c8a, dp: 0x285480, tint: 0xf0b8a0, aur: 0 },
  { h: 9, sun: 0xfff0d2, sunI: 1.85, sky: 0xbcd6ff, gnd: 0x6c7a46, hemiI: 1.5, top: 0x74ade6, bot: 0xd8ecf6, sh: 0x3a9894, dp: 0x2a5a8a, tint: 0xc8e0f0, aur: 0 },
  { h: 12.5, sun: 0xfff7e6, sunI: 2.0, sky: 0xc4dcff, gnd: 0x707e48, hemiI: 1.55, top: 0x62a4ea, bot: 0xcfe8f8, sh: 0x3a9c96, dp: 0x2a5c8e, tint: 0xd0e8f8, aur: 0 },
  { h: 15.5, sun: 0xffe8c4, sunI: 2.0, sky: 0xd2d6f2, gnd: 0x76724a, hemiI: 1.48, top: 0x6aa2e0, bot: 0xe8e4d8, sh: 0x3a9890, dp: 0x2a5a8a, tint: 0xe0e0e0, aur: 0 },
  { h: 17, sun: 0xffc47e, sunI: 2.1, sky: 0xf0c8cc, gnd: 0x7c6646, hemiI: 1.38, top: 0xe6996a, bot: 0xffd9a0, sh: 0x48968a, dp: 0x345282, tint: 0xffc890, aur: 0 },
  { h: 18.4, sun: 0xff8c60, sunI: 1.8, sky: 0xcaa2cc, gnd: 0x5c4842, hemiI: 1.2, top: 0x7c5aa6, bot: 0xff9468, sh: 0x3c747e, dp: 0x2e4072, tint: 0xff9a80, aur: 0 },
  { h: 19.6, sun: 0xa080d8, sunI: 0.9, sky: 0x6e6cac, gnd: 0x302e44, hemiI: 0.9, top: 0x262c66, bot: 0x8a5a8c, sh: 0x2f5c76, dp: 0x1c3662, tint: 0x7060a0, aur: 0.2 },
  { h: 21, sun: 0x8fa8ff, sunI: 0.6, sky: 0x40508a, gnd: 0x1e2232, hemiI: 0.8, top: 0x0a1030, bot: 0x1c2a58, sh: 0x1e4c68, dp: 0x10284c, tint: 0x203868, aur: 1 },
  { h: 24, sun: 0x8fa8ff, sunI: 0.55, sky: 0x40508a, gnd: 0x1e2232, hemiI: 0.8, top: 0x050a22, bot: 0x14204a, sh: 0x1a4a66, dp: 0x0e2644, tint: 0x203060, aur: 1 },
];

const cA = new THREE.Color(), cB = new THREE.Color();
function lerpHex(a, b, t, out) {
  cA.setHex(a); cB.setHex(b);
  return out.copy(cA).lerp(cB, t);
}

export class Sky {
  constructor(scene) {
    this.uniforms = {
      uTop: { value: new THREE.Color() },
      uBottom: { value: new THREE.Color() },
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
    };
    this._tmp = new THREE.Color();
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
    lerpHex(a.sh, b.sh, t, s.waterShallow);
    lerpHex(a.dp, b.dp, t, s.waterDeep);
    lerpHex(a.tint, b.tint, t, s.skyTint);
    s.aurora = a.aur + (b.aur - a.aur) * t;
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
      s.waterShallow.lerp(c.setHex(0x7a1820), 0.75 * bm);
      s.waterDeep.lerp(c.setHex(0x3a0610), 0.75 * bm);
      s.skyTint.lerp(c.setHex(0xd02030), 0.8 * bm);
      s.aurora *= 1 - bm;
      night *= 1 - 0.35 * bm; // the blood moon is bright: you can see them coming
    }
    s.night = night;
    u.uNight.value = night;
    u.uAurora.value = s.aurora;
    // [v26 seasons] weather: overcast, fog, heat glare, lightning (src/world/weatherFx.js)
    if (this.weather) { try { this.weather(this, hour, time, night); } catch (e) { this.weather = null; console.warn('[sky weather]', e); } }

    // Sun path: rises in the east, sets in the west (south-facing arc).
    let dir;
    if (hour >= 6.5 && hour <= 19.8) {
      const k = (hour - 6.5) / (19.8 - 6.5); // 0..1
      const az = Math.PI * (0.15 + 0.7 * k); // from east-ish to west-ish via south
      const el = Math.sin(k * Math.PI) * 1.05 + 0.18;
      dir = new THREE.Vector3(Math.cos(az), Math.sin(el), Math.sin(az) * 0.8 + 0.25).normalize();
    } else {
      // moonlight from high south-east
      dir = new THREE.Vector3(0.45, 0.85, 0.55).normalize();
    }
    s.sunDir.copy(dir);

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
