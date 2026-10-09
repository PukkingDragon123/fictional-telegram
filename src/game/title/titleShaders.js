// Shader layers for the title diorama, all on the painted backdrop's pixel
// grid (1 texel = 1 low-res pixel; dithered, never blurry):
//   waterMaterial  - the painted pond, rows wobbling by whole pixels, glitter
//                    twinkling under the sun, splash ripple rings
//   mistMaterial   - a drifting band of dithered mist (lit warm towards the sun)
//   raysMaterial   - additive god rays fanning out from the low sun
// Every material is unlit and takes the canvas texture / pixel size it covers.
import * as THREE from 'three';

const COMMON = /* glsl */ `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float b = q.x * 4.0 + q.y;
  // 4x4 ordered dither (indexed 0..15)
  float m = 0.0;
  if (b < 0.5) m = 0.0; else if (b < 1.5) m = 12.0; else if (b < 2.5) m = 3.0; else if (b < 3.5) m = 15.0;
  else if (b < 4.5) m = 8.0; else if (b < 5.5) m = 4.0; else if (b < 6.5) m = 11.0; else if (b < 7.5) m = 7.0;
  else if (b < 8.5) m = 2.0; else if (b < 9.5) m = 14.0; else if (b < 10.5) m = 1.0; else if (b < 11.5) m = 13.0;
  else if (b < 12.5) m = 10.0; else if (b < 13.5) m = 6.0; else if (b < 14.5) m = 9.0; else m = 5.0;
  return (m + 0.5) / 16.0;
}
`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

// ------------------------------------------------------------------ water
export const RINGS = 8;
export function waterMaterial(tex, w, h) {
  const uniforms = {
    map: { value: tex }, uSize: { value: new THREE.Vector2(w, h) }, uTime: { value: 0 },
    uSunX: { value: 0 }, uRings: { value: Array.from({ length: RINGS }, () => new THREE.Vector4(0, 0, -99, 0)) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, depthTest: false, depthWrite: true,
    fragmentShader: /* glsl */ `
uniform sampler2D map;
uniform vec2 uSize;
uniform float uTime;
uniform float uSunX;
uniform vec4 uRings[${RINGS}];
varying vec2 vUv;
${COMMON}
void main() {
  vec2 p = floor(vUv * uSize);          // texel (y up from the bottom of the strip)
  float row = uSize.y - 1.0 - p.y;      // texel row from the top
  // whole-pixel row wobble, slower and smaller near the far bank
  float k = clamp(row / uSize.y, 0.0, 1.0);
  float wob = sin(row * 1.37 + uTime * (1.2 + k) + sin(row * 0.29 - uTime * 0.7) * 2.0) * (0.35 + k * 0.9);
  float dx = floor(wob + 0.5);
  vec4 c = texture2D(map, (p + vec2(dx, 0.0) + 0.5) / uSize);
  vec4 c0 = texture2D(map, (p + 0.5) / uSize);
  if (c0.a < 0.5) discard;
  if (c.a < 0.5) c = c0;
  vec3 col = c.rgb;
  // glitter under the sun: pixels flicker on and off
  float gx = abs(p.x - uSunX) - row * 0.18;
  float tw = h21(p + floor(uTime * 5.0 + h21(p) * 7.0));
  if (gx < 3.0 + k * 9.0 && tw > 0.86 && row > 3.0) col = mix(col, vec3(1.0, 0.93, 0.74), 0.85) * 1.25;
  else if (tw > 0.995) col += vec3(0.35, 0.3, 0.2);
  // ripple rings from splashes (x, y in strip texels, t0, strength)
  for (int i = 0; i < ${RINGS}; i++) {
    vec4 R = uRings[i];
    float age = uTime - R.z;
    if (age < 0.0 || age > 2.6) continue;
    vec2 d = (vec2(p.x, row) - R.xy) * vec2(1.0, 2.4);
    float r = age * 11.0 * R.w + 1.0;
    float e = abs(length(d) - r);
    float fade = (1.0 - age / 2.6);
    if (e < 0.75) col = mix(col, vec3(1.0, 0.95, 0.85), 0.55 * fade);
    else if (e < 1.6 && bayer4(p) < 0.4 * fade) col = mix(col, vec3(0.2, 0.18, 0.35), 0.3);
  }
  gl_FragColor = vec4(col, 1.0);
}
`,
  });
  return mat;
}

// ------------------------------------------------------------------ mist
// a band of mist `h` texels tall; uDensity scales it (0 = gone), uWarm = 0..1 along x (towards the sun)
export function mistMaterial(w, h, { color = 0xffc8a0, shade = 0xd88a8a, seed = 1, speed = 1 } = {}) {
  const uniforms = {
    uSize: { value: new THREE.Vector2(w, h) }, uTime: { value: 0 }, uDensity: { value: 1 }, uSeed: { value: seed }, uSpeed: { value: speed },
    uCol: { value: new THREE.Color(color) }, uShade: { value: new THREE.Color(shade) }, uSunX: { value: w * 0.8 }, uOff: { value: 0 },
  };
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, depthTest: false, depthWrite: false,
    fragmentShader: /* glsl */ `
uniform vec2 uSize;
uniform float uTime;
uniform float uDensity;
uniform float uSeed;
uniform float uSpeed;
uniform vec3 uCol;
uniform vec3 uShade;
uniform float uSunX;
uniform float uOff;
varying vec2 vUv;
${COMMON}
void main() {
  vec2 p = floor(vUv * uSize);
  float v = p.y / uSize.y;                 // 0 bottom .. 1 top
  float band = smoothstep(0.0, 0.35, v) * (1.0 - smoothstep(0.55, 1.0, v));
  vec2 q = vec2((p.x + uOff) * 0.035 + uTime * 0.05 * uSpeed + uSeed * 7.0, p.y * 0.16 + uSeed);
  float n = vn(q) * 0.62 + vn(q * 2.3 + vec2(-uTime * 0.07 * uSpeed, 3.1)) * 0.38;
  float d = band * (0.25 + n * 0.95) * uDensity;
  if (d < bayer4(p) * 0.9 + 0.12) discard;
  float warm = clamp(1.0 - abs(p.x - uSunX) / (uSize.x * 0.6), 0.0, 1.0);
  vec3 c = mix(uShade, uCol, clamp(warm * 0.8 + (d > 0.75 ? 0.35 : 0.0), 0.0, 1.0));
  gl_FragColor = vec4(c, 1.0);
}
`,
  });
}

// ------------------------------------------------------------------ god rays
// additive, quantised shafts fanning out from the sun (sun position in this plane's texels, y down)
export function raysMaterial(w, h, { color = 0xffc890, strength = 0.16 } = {}) {
  const uniforms = {
    uSize: { value: new THREE.Vector2(w, h) }, uTime: { value: 0 }, uSun: { value: new THREE.Vector2(w * 0.8, h * 0.3) },
    uCol: { value: new THREE.Color(color) }, uK: { value: strength }, uReach: { value: Math.hypot(w, h) * 0.75 },
  };
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, depthTest: false, depthWrite: false, transparent: true,
    blending: THREE.AdditiveBlending,
    fragmentShader: /* glsl */ `
uniform vec2 uSize;
uniform float uTime;
uniform vec2 uSun;
uniform vec3 uCol;
uniform float uK;
uniform float uReach;
varying vec2 vUv;
${COMMON}
void main() {
  vec2 p = floor(vUv * uSize);
  vec2 d = vec2(p.x, uSize.y - 1.0 - p.y) - uSun; // y down
  float r = length(d);
  float a = atan(d.y, d.x);
  // rays fan down and to the left of the sun
  float fan = smoothstep(0.15, 0.6, a) * (1.0 - smoothstep(2.4, 2.95, a));
  float s = vn(vec2(a * 9.0, uTime * 0.12)) * 0.7 + vn(vec2(a * 23.0 + 4.0, uTime * 0.21)) * 0.3;
  s = smoothstep(0.48, 0.8, s);
  float fall = (1.0 - smoothstep(uReach * 0.15, uReach, r)) * smoothstep(4.0, 26.0, r);
  float k = s * fan * fall * uK;
  // three flat steps, dithered between them
  float q = k * 3.0;
  float lv = floor(q) + step(bayer4(p), fract(q));
  if (lv < 0.5) discard;
  gl_FragColor = vec4(uCol * lv / 3.0 * 0.5, 1.0);
}
`,
  });
}
