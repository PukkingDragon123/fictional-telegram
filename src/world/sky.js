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
  { h: 0, sun: 0x7f9ae8, sunI: 0.45, sky: 0x323d6e, gnd: 0x151a26, hemiI: 0.62, top: 0x050a22, bot: 0x14204a, sh: 0x1a4560, dp: 0x0e2442, tint: 0x203060, aur: 1 },
  { h: 5.5, sun: 0x9a8ad0, sunI: 0.6, sky: 0x4a4a80, gnd: 0x252030, hemiI: 0.62, top: 0x1a2250, bot: 0x6a4a78, sh: 0x2a5a70, dp: 0x163050, tint: 0x6a5080, aur: 0.3 },
  { h: 7, sun: 0xffb48a, sunI: 1.5, sky: 0xb0c0e8, gnd: 0x4a4a3a, hemiI: 0.95, top: 0x6a8ad0, bot: 0xf2c0a0, sh: 0x2f8082, dp: 0x244a78, tint: 0xf0b8a0, aur: 0 },
  { h: 9, sun: 0xfff0d8, sunI: 2.3, sky: 0xc4dcff, gnd: 0x5b6a3a, hemiI: 1.1, top: 0x74ade6, bot: 0xd8ecf6, sh: 0x2f8a88, dp: 0x24507e, tint: 0xc8e0f0, aur: 0 },
  { h: 12.5, sun: 0xffffff, sunI: 2.6, sky: 0xd0e4ff, gnd: 0x5e6e3b, hemiI: 1.2, top: 0x62a4ea, bot: 0xcfe8f8, sh: 0x2f8e8a, dp: 0x245282, tint: 0xd0e8f8, aur: 0 },
  { h: 15.5, sun: 0xfff0d2, sunI: 2.45, sky: 0xd8dcf0, gnd: 0x5e6a3a, hemiI: 1.1, top: 0x6aa2e0, bot: 0xe8e4d8, sh: 0x2f8a86, dp: 0x244f80, tint: 0xe0e0e0, aur: 0 },
  { h: 17, sun: 0xffbc72, sunI: 2.35, sky: 0xf0cca8, gnd: 0x60583a, hemiI: 1.0, top: 0xe6996a, bot: 0xffd9a0, sh: 0x3a8a80, dp: 0x2e4a78, tint: 0xffc890, aur: 0 },
  { h: 18.4, sun: 0xff8458, sunI: 1.7, sky: 0xc89ab2, gnd: 0x4a3e3a, hemiI: 0.85, top: 0x7c5aa6, bot: 0xff9468, sh: 0x356e78, dp: 0x2c3c6e, tint: 0xff9a80, aur: 0 },
  { h: 19.6, sun: 0x9c7cd4, sunI: 0.8, sky: 0x6a6aa8, gnd: 0x2c2c40, hemiI: 0.7, top: 0x262c66, bot: 0x8a5a8c, sh: 0x2f5a72, dp: 0x1c3460, tint: 0x7060a0, aur: 0.2 },
  { h: 21, sun: 0x8aa8ff, sunI: 0.55, sky: 0x3a4a82, gnd: 0x1a1f2c, hemiI: 0.62, top: 0x0a1030, bot: 0x1c2a58, sh: 0x1e4a66, dp: 0x10284a, tint: 0x203868, aur: 1 },
  { h: 24, sun: 0x7f9ae8, sunI: 0.45, sky: 0x323d6e, gnd: 0x151a26, hemiI: 0.62, top: 0x050a22, bot: 0x14204a, sh: 0x1a4560, dp: 0x0e2442, tint: 0x203060, aur: 1 },
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
    const night = hour < 6 ? 1 : hour < 7.5 ? 1 - (hour - 6) / 1.5 : hour > 19.5 ? Math.min(1, (hour - 19.5) / 1.5) : 0;
    s.night = night;
    u.uNight.value = night;
    u.uAurora.value = s.aurora;

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
