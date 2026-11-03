// Renders the 3D scene into a small render target, then upscales it with
// nearest-neighbour filtering and a depth-based outline pass. This gives the
// crisp "3D pixel art" look. The render target has a 1px margin so the camera
// can be snapped to whole pixels and the leftover sub-pixel offset applied
// when blitting (smooth camera motion without pixel crawl).
//
// Cozy extras: a bloom (bright-pass at half resolution, separable blur),
// a warm colour grade with lifted purple shadows, tinted outlines, a gentle
// tilt-shift haze at the screen edges, a vignette and an iris wipe used for
// scene transitions.
//
// [v31 light] Everything soft is quantised and ordered-dithered on the low-res
// pixel grid (bloom halos, vignette, tilt-shift haze), so nothing smooth ever
// lands between the pixels. The time of day (world/sky.js `post`) adds a split
// tone grade (a coloured lift into the shadows, a tint on the highlights,
// saturation, contrast) and a low-res atmosphere pass: drifting cloud shadows
// projected along the sun onto the valley, and crepuscular light shafts (the
// gaps between those clouds, seen through the air above the ground), both in
// dithered steps. At night lamps and windows bloom harder.
import * as THREE from 'three';
import { fitShadowScissor } from './shadowFit.js'; // [v26 perf]

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform float threshold;
uniform float thrOff; // [v31 light] night: lamps and windows bloom harder
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  float l = max(max(c.r, c.g), c.b);
  float th = threshold - thrOff;
  float k = smoothstep(th, th + 0.6, l);
  gl_FragColor = vec4(c * k, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 dir;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tSrc, vUv).rgb * 0.2270270270;
  s += texture2D(tSrc, vUv + dir * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(tSrc, vUv - dir * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(tSrc, vUv + dir * 3.2307692308).rgb * 0.0702702703;
  s += texture2D(tSrc, vUv - dir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(s, 1.0);
}
`;

const POST_VERT = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const POST_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tBloom;
uniform vec2 rtSize;
uniform vec2 subpixel;
uniform float pixelScale;
uniform float depthRange;
uniform float outlineAmt;
uniform vec3 outlineTint;
uniform float highlightAmt;
uniform vec2 screenSize;
uniform float vignette;
uniform vec3 vignetteColor;
uniform float saturation;
uniform vec3 grade;
uniform vec3 lift;
uniform float contrast;
uniform float bloomAmt;
uniform float haze;
uniform vec3 hazeColor;
uniform float flash;
uniform vec3 flashColor;
uniform vec3 iris; // x, y (screen px), radius (px); radius < 0 = off
uniform float time;
uniform float blueprint;
// thick fog of the unexplored: drawn by its own low-res pass (FOG_FRAG)
uniform float fogOn;
uniform sampler2D tFog;
// [v31 light] time-of-day grade + atmosphere (neutral unless the sky drives them)
uniform vec3 todMul;
uniform vec3 todShadow;
uniform vec3 todHigh;
uniform float todSat;
uniform float todCon;
uniform float atmoOn;
uniform sampler2D tAtmo;
uniform vec3 cloudCol;
uniform vec3 shaftCol;
uniform float cloudAmt;
uniform float shaftAmt;
uniform vec4 todHaze; // rgb = the hour's horizon, a = how much it replaces hazeColor

float pbay2(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float pbay4(vec2 a) { return pbay2(0.5 * a) * 0.25 + pbay2(a); }

float D(vec2 p) { return texture2D(tDepth, (p + 0.5) / rtSize).x * depthRange; }
vec3 C(vec2 p) { return texture2D(tColor, (p + 0.5) / rtSize).rgb; }

void main() {
  vec2 lp = floor(gl_FragCoord.xy / pixelScale + subpixel) + 1.0;
  vec3 col = C(lp);
  float bay = pbay4(lp);
  float d = D(lp);
  float dl = D(lp + vec2(-1.0, 0.0));
  float dr = D(lp + vec2(1.0, 0.0));
  float db = D(lp + vec2(0.0, -1.0));
  float dt = D(lp + vec2(0.0, 1.0));
  // Laplacian of depth: planar ramps cancel out, silhouettes and creases don't.
  float lap = (dl + dr + db + dt) - 4.0 * d;
  float edge = smoothstep(0.18, 0.4, lap);
  float crease = smoothstep(0.012, 0.05, lap) * (1.0 - edge);
  // Tinted inner outline (darker, slightly purple, never flat black)
  col = mix(col, col * outlineTint, outlineAmt * edge);
  col *= 1.0 + highlightAmt * crease;
  // bloom, quantised into dithered steps (pixel-art halos, never a smooth glow)
  vec2 buv = (lp - 0.5) / rtSize;
  vec3 bl = texture2D(tBloom, buv).rgb;
  float bm = max(bl.r, max(bl.g, bl.b));
  bl *= bm > 0.002 ? (floor(bm * 7.0 + bay) / 7.0) / bm : 0.0;
  col += bl * bloomAmt;
  // [v31 light] drifting cloud shadows and light shafts (low-res atmosphere pass)
  if (atmoOn > 0.5) {
    vec4 at = texture2D(tAtmo, (lp + 0.5) / rtSize);
    col *= mix(vec3(1.0), cloudCol, at.r * cloudAmt);
    col += shaftCol * at.g * shaftAmt * (0.6 + 0.4 * at.r);
  }
  if (fogOn > 0.5) {
    vec4 fg = texture2D(tFog, (lp + 0.5) / rtSize);
    col = mix(col, fg.rgb, fg.a);
    bl *= 1.0 - fg.a;
  }
  // cozy grade: lifted cool shadows, warm gain, gentle contrast
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, saturation * todSat);
  col = col * grade * todMul + lift * (1.0 - clamp(l * 1.6, 0.0, 1.0));
  // [v31 light] split tone: coloured shade, tinted light
  col += todShadow * (1.0 - clamp(l * 2.2, 0.0, 1.0));
  col *= mix(vec3(1.0), todHigh, clamp((l - 0.25) * 1.7, 0.0, 1.0));
  col = mix(vec3(0.5), col, contrast * todCon);
  col = max(col, 0.0);
  // screen position of this low-res pixel (the haze / vignette step on the pixel grid)
  vec2 uv = (lp - 0.5) / max(rtSize - 2.0, vec2(1.0));
  // tilt-shift haze towards the top and bottom (miniature diorama feel), 4 dithered steps
  float ts = smoothstep(0.28, 0.5, abs(uv.y - 0.46));
  ts = floor(ts * 4.0 + bay) / 4.0;
  col = mix(col, mix(col, mix(hazeColor, todHaze.rgb, todHaze.a), 0.35) + bl * 0.4, ts * haze);
  float v = smoothstep(0.95, 0.35, length((uv - 0.5) * vec2(1.0, 0.9)));
  v = floor(v * 5.0 + bay) / 5.0;
  col = mix(col * mix(vignetteColor, vec3(1.0), 0.35), col, mix(1.0 - vignette, 1.0, v));
  col = mix(col, flashColor, flash);
  if (iris.z >= 0.0) {
    // chunky pixel edge for the iris
    float px = pixelScale * 2.0;
    vec2 q = floor(gl_FragCoord.xy / px) * px + px * 0.5;
    float dq = length(q - iris.xy);
    col *= step(dq, iris.z);
  }
  if (blueprint > 0.001) {
    // blueprint paper: everything washed into cyanotype blues
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 bp = mix(vec3(0.07, 0.2, 0.45), vec3(0.78, 0.92, 1.0), smoothstep(0.05, 0.95, lum));
    col = mix(col, bp, blueprint * 0.55);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

// The fog runs once per low-res pixel into its own small target (rather than
// once per screen fragment inside the post pass): pixelScale^2 times cheaper.
const FOG_FRAG = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 rtSize;
uniform float time;
// thick fog over the unexplored areas: a world-space mask (1 texel = 1 tile)
// grows a heightfield of billowing cloud-bank tops; each pixel's view ray is
// marched down through it (coarse steps + bisection), then the hit is shaded
// in 4 chunky tones with ordered dithering. A blurred mip of the mask feeds
// the low ground mist that creeps past the edge.
uniform sampler2D fogTex;
uniform sampler2D fogNoise; // 4 independent tiling smooth value noises (rgba)
uniform vec2 fogSize;
uniform float fogTop;
uniform mat4 invVP;
uniform vec3 camDir;
uniform vec3 fogSun; // world direction towards the light (screen top-left)
uniform vec3 fogLight;
uniform vec3 fogShade;
uniform vec3 fogRim;

// one tap = noise at 1 feature per unit (period 16 features)
vec4 fN(vec2 p) { return textureLod(fogNoise, p * 0.0625, 0.0); }
float fbayer2(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float fbayer(vec2 a) { return fbayer2(0.5 * a) * 0.25 + fbayer2(a); }
// x = cloud-top height (world y), y = coverage 0..1, z = ground height
// fogTex: r = density, g = ground height / 25.5 (the fog hugs hills)
vec3 fogField(vec2 xz) {
  vec4 nw = fN((xz + time * vec2(0.09, 0.05)) * 0.11);
  // a slightly blurred mip: the banks roll over terrace cliffs instead of
  // stepping with them
  vec2 t = textureLod(fogTex, (xz + (nw.rg - 0.5) * 4.0) / fogSize, 1.6).rg;
  float g = t.g * 25.5;
  if (t.r < 0.003) return vec3(g - 9.0, 0.0, g);
  // two scales of puffs drifting different ways, so the banks roll and churn
  vec4 nb = fN((xz + time * vec2(0.12, 0.05)) * 0.17 + 3.7);
  float sm = fN((xz - time * vec2(0.07, -0.17)) * 0.42 + vec2(9.1, 5.3)).a;
  // big domes rise out of a rolling bank (value noise fills the gaps)
  float big = max(nb.b, 0.3 + 0.35 * nb.g);
  // puffs bulge the outline too, so the edge is a row of round billows
  float c = smoothstep(0.08, 0.5, t.r + (big - 0.45) * 0.35 + (sm - 0.5) * 0.25);
  float p = big * 0.8 + sm * 0.28;
  float h = fogTop * sqrt(c) * (0.38 + 0.7 * p);
  return vec3(g + h - (1.0 - c) * 0.9, c, g);
}
vec4 fogAt(vec2 lp, vec2 uv) {
  float z = textureLod(tDepth, uv, 0.0).x;
  if (z > 0.99999) return vec4(0.0);
  vec4 wp = invVP * vec4(uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
  vec3 P = wp.xyz / wp.w;
  vec3 V = -camDir; // towards the camera (ortho: same for every pixel)
  float cy = max(0.08, V.y);
  float hTop = fogTop * 1.3;
  vec2 gP = textureLod(fogTex, P.xz / fogSize, 0.0).rg;
  float g0 = gP.g * 25.5;
  // cheap reject: a coarse mip covers this pixel and the slab above it
  vec2 far = P.xz + V.xz * max(0.0, (g0 + hTop - P.y) / cy);
  vec2 mid = mix(P.xz, far, 0.5);
  if (textureLod(fogTex, P.xz / fogSize, 3.0).r + textureLod(fogTex, mid / fogSize, 3.0).r + textureLod(fogTex, far / fogSize, 3.0).r < 0.002) return vec4(0.0);
  // slab bounds from the ground under the whole ray (hills, ridges)
  float g1 = textureLod(fogTex, far / fogSize, 1.0).g * 25.5;
  float g2 = textureLod(fogTex, mid / fogSize, 1.0).g * 25.5;
  float gHi = max(max(g0, g1), g2), gLo = min(min(g0, g1), g2);
  float tTop = (gHi + hTop + 0.6 - P.y) / cy;
  float tBot = (gLo - 1.0 - P.y) / cy;
  // march top-down (camera side first); runs on past P so the bank surface
  // stays whole behind anything standing in the fog
  const int N = 12;
  float st = (tTop - tBot) / float(N);
  float tHit = -1e5, tPrev = tTop;
  vec3 F = vec3(0.0);
  for (int i = 1; i <= N; i++) {
    float t = tTop - float(i) * st;
    vec3 q = P + V * t;
    vec3 f = fogField(q.xz);
    if (f.y > 0.01 && q.y < f.x) { tHit = t; F = f; break; }
    tPrev = t;
  }
  float dith = fbayer(lp);
  // anything standing inside a fogged area is swallowed whole, however tall
  vec4 nwP = fN((P.xz + time * vec2(0.09, 0.05)) * 0.11);
  vec2 pw = P.xz + (nwP.rg - 0.5) * 4.0;
  float cover = smoothstep(0.5, 0.8, textureLod(fogTex, pw / fogSize, 0.0).r);
  // low ground mist: blurred mask spills a few tiles past the edge, torn into
  // wind-stretched wisps, hugging the terrain
  float spill = textureLod(fogTex, pw / fogSize, 2.6).r;
  vec2 wd = P.xz + time * vec2(0.3, 0.1);
  float wisp = fN(vec2(wd.x * 0.32 + wd.y * 0.12, wd.y * 0.75 - wd.x * 0.1) + 1.3).g;
  float hAbove = P.y - g0;
  float mist = clamp(spill * 3.2 - 0.06, 0.0, 1.0) * smoothstep(1.2 + 2.6 * wisp, 0.0, hAbove) * smoothstep(0.3, 0.7, wisp + spill * 0.5);
  // a thin veil drifts over whatever stands just outside (tree tops too)
  float veil = clamp(spill * 2.4 - 0.05, 0.0, 1.0) * smoothstep(0.5, 0.85, wisp) * smoothstep(fogTop * 1.2, 0.0, hAbove) * 0.6;
  mist = min(max(mist, veil), 0.8);
  bool front = tHit > -0.15, fake = false;
  if (tHit < -1e4 || (!front && cover < 0.01)) {
    if (mist < 0.02 && cover < 0.01) return vec4(0.0);
    if (cover < 0.01) {
      // just mist: dithered transparency, pale tones
      float ma = floor(mist * 4.0 + dith * 0.999) / 4.0;
      float mt = floor((0.45 + 0.5 * wisp) * 2.0 + dith) / 2.0;
      return vec4(mix(fogShade, fogLight, mt), ma);
    }
    // inside, but the ray behind this tall thing leaves the fog: show the
    // bank's crown right under it instead
    if (tHit < -1e4) fake = true;
  }
  vec3 H;
  if (fake) {
    F = fogField(P.xz);
    H = vec3(P.x, F.x, P.z);
  } else {
    // refine the crossing: 3 bisection steps
    float ta = tPrev, tb = tHit;
    for (int k = 0; k < 3; k++) {
      float tm = 0.5 * (ta + tb);
      vec3 q = P + V * tm;
      vec3 f = fogField(q.xz);
      if (f.y > 0.01 && q.y < f.x) { tb = tm; F = f; } else ta = tm;
    }
    H = P + V * tb;
  }
  // shading: normal from the heightfield, light from the top-left
  const float e = 0.55;
  float hx = fogField(H.xz + vec2(e, 0.0)).x - F.x;
  float hz = fogField(H.xz + vec2(0.0, e)).x - F.x;
  vec3 nrm = normalize(vec3(-hx, e, -hz));
  float dif = clamp(dot(nrm, fogSun) * 0.8 + 0.2, 0.0, 1.0);
  // self-shadow: a taller bank between us and the light
  vec2 sh2 = normalize(fogSun.xz);
  float slope = fogSun.y / max(0.2, length(fogSun.xz));
  float occ = fogField(H.xz + sh2 * 2.4).x - (H.y + 2.4 * slope);
  float shadow = smoothstep(0.0, 1.6, occ);
  float hy = clamp((H.y - F.z) / fogTop, 0.0, 1.0);
  float v = 0.85 * dif + 0.5 * hy - 0.6 * shadow - (1.0 - F.y) * 0.2 - 0.26;
  // a silver lining where the bank thins out towards the light
  v += 0.25 * smoothstep(0.55, 0.2, F.y) * smoothstep(0.3, 0.8, dif);
  // 5 flat bands (deep, shade, mid, light, rim); dither only along the seams
  float tone = clamp(floor(v * 4.2 + 0.3 + (dith - 0.5) * 0.5), 0.0, 4.0);
  vec3 deep = mix(fogShade * vec3(0.8, 0.78, 0.9), vec3(0.3, 0.27, 0.45), 0.2);
  vec3 col = tone < 0.5 ? deep : tone < 1.5 ? fogShade : tone < 2.5 ? mix(fogShade, fogLight, 0.45) : tone < 3.5 ? mix(fogLight, fogShade, 0.1) : fogRim;
  // thin fringe: dithered see-through, plus the ground mist under it
  float a = smoothstep(0.03, 0.4, F.y);
  a = floor(a * 4.0 + dith * 0.999) / 4.0;
  if (!front) a = 0.0;
  a = max(a, cover > 0.01 ? clamp(floor(cover * 4.0 + dith * 0.999) / 4.0, 0.0, 1.0) : 0.0);
  float ma = floor(mist * 4.0 + dith * 0.999) / 4.0;
  vec3 mc = mix(fogShade, fogLight, floor((0.45 + 0.5 * wisp) * 2.0 + dith) / 2.0);
  float ao = a + ma * (1.0 - a);
  col = ao > 0.0 ? (col * a + mc * ma * (1.0 - a)) / ao : col;
  return vec4(col, ao);
}

void main() {
  vec2 lp = floor(gl_FragCoord.xy);
  gl_FragColor = fogAt(lp, (lp + 0.5) / rtSize);
}
`;

// [v31 light] The atmosphere, once per low-res pixel: r = cloud shadow (0 / .5 / 1),
// g = light shafts (0..1 in thirds). Clouds are a drifting value-noise sheet
// high above the valley; a pixel is in shadow when the sun ray through it
// crosses a cloud. Shafts: the same test a few steps up the view ray, through
// the air above the ground, so the gaps between the clouds hang in the air as
// slanted rays that follow the sun.
const ATMO_FRAG = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 rtSize;
uniform float time;
uniform mat4 invVP;
uniform vec3 camDir;
uniform sampler2D fogNoise;
uniform vec3 atmoSun;
uniform vec4 atmoK; // cloud on, shafts on, coverage threshold, cloud scale (1 / world units)
uniform vec2 atmoWind;
float abay2(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
float abay4(vec2 a) { return abay2(0.5 * a) * 0.25 + abay2(a); }
float cloudN(vec2 xz) {
  vec2 p = (xz + atmoWind * time) * atmoK.w;
  float a = textureLod(fogNoise, p * 0.0625, 0.0).r;
  float b = textureLod(fogNoise, p * 0.17 + vec2(0.31, 0.77), 0.0).g;
  return a * 0.72 + b * 0.28;
}
float shadeAt(vec3 P) {
  float t = max(0.0, 34.0 - P.y) / max(atmoSun.y, 0.2);
  return smoothstep(atmoK.z, atmoK.z + 0.06, cloudN(P.xz + atmoSun.xz * t));
}
void main() {
  vec2 lp = floor(gl_FragCoord.xy);
  vec2 uv = (lp + 0.5) / rtSize;
  float z = textureLod(tDepth, uv, 0.0).x;
  if (z > 0.99999) { gl_FragColor = vec4(0.0); return; }
  vec4 wp = invVP * vec4(uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
  vec3 P = wp.xyz / wp.w;
  float d = abay4(lp);
  float cs = 0.0, sf = 0.0;
  if (atmoK.x > 0.001) cs = floor(shadeAt(P) * 2.0 + d * 0.999) / 2.0;
  if (atmoK.y > 0.001) {
    vec3 V = -camDir;
    float st = 1.6 / max(V.y, 0.25);
    float lit = 0.0;
    for (int i = 1; i <= 5; i++) lit += 1.0 - shadeAt(P + V * (st * float(i)));
    lit /= 5.0;
    // only the air that is (almost) all lit makes a ray: solid bands with dithered edges
    sf = floor(smoothstep(0.5, 0.95, lit) * 2.0 + d * 0.999) / 2.0;
  }
  gl_FragColor = vec4(cs, sf, 0.0, 1.0);
}
`;

// 128x128 RGBA fog tile, so the fog pays one texture tap per octave:
// r, g = smooth value noise (8 texels per feature, wraps every 16 features),
// b, a = big / small piles of round cauliflower domes (the cloud puffs).
let _fogNoise = null;
function fogNoiseTexture() {
  if (_fogNoise) return _fogNoise;
  const S = 128, C = 8, P = S / C, d = new Uint8Array(S * S * 4);
  const hash = (x, z, k) => { let h = (x * 374761393 + z * 668265263 + k * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const q = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  for (let k = 0; k < 2; k++)
    for (let z = 0; z < S; z++)
      for (let x = 0; x < S; x++) {
        const gx = Math.floor(x / C), gz = Math.floor(z / C), u = q((x % C) / C), v = q((z % C) / C);
        const h = (i, j) => hash((gx + i) % P, (gz + j) % P, k + 1);
        const n = (h(0, 0) * (1 - u) + h(1, 0) * u) * (1 - v) + (h(0, 1) * (1 - u) + h(1, 1) * u) * v;
        d[(z * S + x) * 4 + k] = Math.round(n * 255);
      }
  // domes: overlapping hemispheres (wrapped), tallest wins
  const domes = (k, count, r0, r1) => {
    const hf = new Float32Array(S * S);
    let seed = k * 7919 + 13;
    const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
    for (let i = 0; i < count; i++) {
      const cx = rnd() * S, cz = rnd() * S, r = r0 + (r1 - r0) * rnd() * rnd(), top = 0.55 + 0.45 * (r - r0) / (r1 - r0);
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const dd = ((x - cx) ** 2 + (z - cz) ** 2) / (r * r);
          if (dd >= 1) continue;
          const j = ((z + S) % S) * S + ((x + S) % S);
          hf[j] = Math.max(hf[j], top * Math.sqrt(1 - dd));
        }
    }
    for (let j = 0; j < S * S; j++) d[j * 4 + k] = Math.round(Math.min(1, hf[j]) * 255);
  };
  domes(2, 70, 7, 18);
  domes(3, 260, 3.5, 8);
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return (_fogNoise = t);
}

export class PixelRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    }));
    r.setPixelRatio(1);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.BasicShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.autoClear = true;

    this.pixelScale = 3;
    this.pixelDensity = 1; // user setting: 0.75 = chunkier, 1.35 = finer
    this.lowW = 1; this.lowH = 1; // visible low-res size
    this.rtW = 3; this.rtH = 3; // including margin
    this.rt = null;
    this.bloomOn = true;
    this.bloomStrength = 0.42;

    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadGeo = new THREE.PlaneGeometry(2, 2);
    const mkPass = (frag, uniforms) => {
      const mat = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
      const scene = new THREE.Scene();
      const q = new THREE.Mesh(quadGeo, mat);
      q.frustumCulled = false;
      scene.add(q);
      return { mat, scene };
    };
    this.brightPass = mkPass(BRIGHT_FRAG, { tColor: { value: null }, threshold: { value: 0.92 }, thrOff: { value: 0 } });
    this.blurPass = mkPass(BLUR_FRAG, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });

    this.postScene = new THREE.Scene();
    this.postMat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        tBloom: { value: null },
        rtSize: { value: new THREE.Vector2(1, 1) },
        subpixel: { value: new THREE.Vector2() },
        pixelScale: { value: 3 },
        depthRange: { value: 1 },
        outlineAmt: { value: 0.55 },
        outlineTint: { value: new THREE.Vector3(0.36, 0.3, 0.42) },
        highlightAmt: { value: 0.12 },
        screenSize: { value: new THREE.Vector2(1, 1) },
        blueprint: { value: 0 },
        vignette: { value: 0.3 },
        vignetteColor: { value: new THREE.Vector3(0.55, 0.42, 0.62) },
        saturation: { value: 1.1 },
        grade: { value: new THREE.Vector3(1.03, 1.0, 0.95) },
        lift: { value: new THREE.Vector3(0.018, 0.01, 0.045) },
        contrast: { value: 1.04 },
        bloomAmt: { value: 0.42 },
        haze: { value: 0.22 },
        hazeColor: { value: new THREE.Vector3(1.0, 0.88, 0.76) },
        flash: { value: 0 },
        flashColor: { value: new THREE.Color(1, 1, 1) },
        iris: { value: new THREE.Vector3(0, 0, -1) },
        time: { value: 0 },
        fogTex: { value: null },
        fogSize: { value: new THREE.Vector2(1, 1) },
        fogOn: { value: 0 },
        fogTop: { value: 7.6 },
        invVP: { value: new THREE.Matrix4() },
        camDir: { value: new THREE.Vector3(0, -1, 0) },
        fogLight: { value: new THREE.Vector3(0.95, 0.94, 0.9) },
        fogShade: { value: new THREE.Vector3(0.62, 0.64, 0.74) },
        fogRim: { value: new THREE.Vector3(1, 1, 1) },
        fogNoise: { value: null },
        fogSun: { value: new THREE.Vector3(0, 1, 0) },
        tFog: { value: null },
        // [v31 light]
        todMul: { value: new THREE.Vector3(1, 1, 1) },
        todShadow: { value: new THREE.Vector3(0, 0, 0) },
        todHigh: { value: new THREE.Vector3(1, 1, 1) },
        todSat: { value: 1 },
        todCon: { value: 1 },
        atmoOn: { value: 0 },
        tAtmo: { value: null },
        cloudCol: { value: new THREE.Vector3(0.75, 0.78, 0.9) },
        shaftCol: { value: new THREE.Vector3(1, 0.9, 0.7) },
        cloudAmt: { value: 0 },
        shaftAmt: { value: 0 },
        todHaze: { value: new THREE.Vector4(1, 0.88, 0.76, 0) },
        atmoSun: { value: new THREE.Vector3(0, 1, 0) },
        atmoK: { value: new THREE.Vector4(0, 0, 0.56, 1 / 15) },
        atmoWind: { value: new THREE.Vector2(0.55, 0.22) },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(quadGeo, this.postMat);
    quad.frustumCulled = false;
    this.postScene.add(quad);
    // fog pass: shares the post pass's uniform objects
    const pu = this.postMat.uniforms, fu = {};
    for (const k of ['tDepth', 'rtSize', 'time', 'fogTex', 'fogNoise', 'fogSize', 'fogTop', 'invVP', 'camDir', 'fogSun', 'fogLight', 'fogShade', 'fogRim']) fu[k] = pu[k];
    this.fogPass = { mat: new THREE.ShaderMaterial({ vertexShader: POST_VERT, fragmentShader: FOG_FRAG, uniforms: fu, depthTest: false, depthWrite: false }), scene: new THREE.Scene(), rt: null };
    const fq = new THREE.Mesh(quadGeo, this.fogPass.mat);
    fq.frustumCulled = false;
    this.fogPass.scene.add(fq);
    // [v31 light] atmosphere pass (cloud shadows + light shafts), same uniform objects
    const au = {};
    for (const k of ['tDepth', 'rtSize', 'time', 'invVP', 'camDir', 'fogNoise', 'atmoSun', 'atmoK', 'atmoWind']) au[k] = pu[k];
    this.atmoPass = { mat: new THREE.ShaderMaterial({ vertexShader: POST_VERT, fragmentShader: ATMO_FRAG, uniforms: au, depthTest: false, depthWrite: false }), scene: new THREE.Scene(), rt: null };
    const aq = new THREE.Mesh(quadGeo, this.atmoPass.mat);
    aq.frustumCulled = false;
    this.atmoPass.scene.add(aq);
    this.atmoEnabled = true; // [v31 light] cloud shadows + shafts (off: neutral)
  }

  // [v31 light] the sky's time-of-day grade + atmosphere for this frame (neutral when absent / stale)
  applySkyPost(sp) {
    const u = this.postMat.uniforms;
    if (sp && sp.fresh) {
      sp.fresh = false;
      u.todMul.value.copy(sp.mul);
      u.todShadow.value.copy(sp.shadow);
      u.todHigh.value.copy(sp.high);
      u.todSat.value = sp.sat; u.todCon.value = sp.con;
      u.cloudCol.value.copy(sp.cloudCol); u.shaftCol.value.copy(sp.shaftCol);
      u.cloudAmt.value = sp.cloud * 0.9; u.shaftAmt.value = sp.shaft * 0.16;
      u.atmoSun.value.copy(sp.sunDir);
      u.atmoWind.value.copy(sp.wind);
      u.todHaze.value.set(sp.haze.x, sp.haze.y, sp.haze.z, 1);
      this.brightPass.mat.uniforms.thrOff.value = sp.glow * 0.42;
      this._glowBoost = sp.glow * 0.5;
    } else {
      u.todMul.value.set(1, 1, 1); u.todShadow.value.set(0, 0, 0); u.todHigh.value.set(1, 1, 1);
      u.todSat.value = 1; u.todCon.value = 1; u.cloudAmt.value = 0; u.shaftAmt.value = 0; u.todHaze.value.w = 0;
      this.brightPass.mat.uniforms.thrOff.value = 0;
      this._glowBoost = 0;
    }
    const on = this.atmoEnabled && (u.cloudAmt.value > 0.01 || u.shaftAmt.value > 0.002);
    u.atmoK.value.x = u.cloudAmt.value > 0.01 ? 1 : 0;
    u.atmoK.value.y = u.shaftAmt.value > 0.002 ? 1 : 0;
    u.atmoOn.value = on ? 1 : 0;
    return on;
  }

  resize(cssW, cssH, dpr) {
    const W = Math.max(1, Math.floor(cssW * dpr));
    const H = Math.max(1, Math.floor(cssH * dpr));
    this.W = W; this.H = H; this.dpr = dpr;
    this.renderer.setSize(W, H, false);
    const diag = Math.sqrt(W * W + H * H);
    const target = 760 * this.pixelDensity; // low-res diagonal we aim for
    this.pixelScale = Math.max(1, Math.round(diag / target));
    this.lowW = Math.ceil(W / this.pixelScale);
    this.lowH = Math.ceil(H / this.pixelScale);
    this.rtW = this.lowW + 2;
    this.rtH = this.lowH + 2;
    if (this.rt) {
      this.rt.depthTexture.dispose();
      this.rt.dispose();
      this.bloomA.dispose();
      this.bloomB.dispose();
    }
    const depthTexture = new THREE.DepthTexture(this.rtW, this.rtH);
    depthTexture.type = THREE.UnsignedIntType;
    depthTexture.minFilter = depthTexture.magFilter = THREE.NearestFilter;
    this.rt = new THREE.WebGLRenderTarget(this.rtW, this.rtH, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: true,
      depthTexture,
    });
    const bw = Math.max(1, Math.ceil(this.rtW / 2)), bh = Math.max(1, Math.ceil(this.rtH / 2));
    const bopt = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: false };
    this.bloomA = new THREE.WebGLRenderTarget(bw, bh, bopt);
    this.bloomB = new THREE.WebGLRenderTarget(bw, bh, bopt);
    this.bloomTexel = new THREE.Vector2(1 / bw, 1 / bh);
    const u = this.postMat.uniforms;
    u.tColor.value = this.rt.texture;
    u.tDepth.value = this.rt.depthTexture;
    u.tBloom.value = this.bloomA.texture;
    u.rtSize.value.set(this.rtW, this.rtH);
    u.pixelScale.value = this.pixelScale;
    u.screenSize.value.set(W, H);
  }

  // Iris wipe: radius in CSS px around a CSS-px point (null/negative = off)
  setBlueprint(k) { this.postMat.uniforms.blueprint.value = k; }

  // fog of the unexplored: a DataTexture mask over the w x h tile grid (null = off).
  // The mask gets mipmaps: a coarse level is the cheap "any fog near?" reject
  // and the blurred spill for the ground mist.
  setFog(tex, w, h) {
    const u = this.postMat.uniforms;
    if (tex && !tex.generateMipmaps) {
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.needsUpdate = true;
    }
    if (tex && !u.fogNoise.value) u.fogNoise.value = fogNoiseTexture();
    u.fogTex.value = tex;
    u.fogSize.value.set(w || 1, h || 1);
    u.fogOn.value = tex ? 1 : 0;
  }
  // light / shade tones of the banks; rim = the brightest crowns and silver
  // linings (defaults to a lifted light: white by day, moonlit blue at night)
  setFogColors(light, shade, rim = null) {
    const u = this.postMat.uniforms;
    u.fogLight.value.set(light[0], light[1], light[2]);
    u.fogShade.value.set(shade[0], shade[1], shade[2]);
    const r = rim || light.map((c) => Math.min(1, c * 1.2 + 0.05));
    u.fogRim.value.set(r[0], r[1], r[2]);
  }
  setFogEnabled(on) { const u = this.postMat.uniforms; u.fogOn.value = on && u.fogTex.value ? 1 : 0; }

  setIris(cssX, cssY, radius) {
    const u = this.postMat.uniforms.iris.value;
    if (radius == null || radius < 0) { u.z = -1; return; }
    const dpr = this.dpr || 1;
    u.set(cssX * dpr, this.H - cssY * dpr, radius * dpr);
  }

  render(scene, cameraRig) {
    const r = this.renderer;
    const cam = cameraRig.camera;
    const u = this.postMat.uniforms;
    u.subpixel.value.copy(cameraRig.subpixel);
    u.depthRange.value = cam.far - cam.near;
    u.time.value = performance.now() / 1000;
    const atmo = this.applySkyPost(scene.userData?.skyPost); // [v31 light]
    if (u.fogOn.value || atmo) {
      u.invVP.value.multiplyMatrices(cam.matrixWorld, cam.projectionMatrixInverse);
      u.camDir.value.set(0, 0, -1).transformDirection(cam.matrixWorld);
      if (!u.fogNoise.value) u.fogNoise.value = fogNoiseTexture();
    }
    if (u.fogOn.value) {
      // light from the screen's top-left, lifted high above the banks
      const e = cam.matrixWorld.elements, sun = u.fogSun.value;
      const fx = -e[8], fz = -e[10], fl = Math.hypot(fx, fz) || 1; // screen-up on the ground
      sun.set(-e[0] * 0.75 + (fx / fl) * 0.65, 1.1, -e[2] * 0.75 + (fz / fl) * 0.65).normalize();
    }
    r.setRenderTarget(this.rt);
    // [v26 perf] only redraw the shadow-map texels that visible receivers can sample (see shadowFit.js)
    const fit = this.shadowFit !== false ? fitShadowScissor(r, scene, cam) : null;
    if (fit) scene.matrixWorldAutoUpdate = false; // fitShadowScissor just updated it
    this.shadowFitFrac = fit ? (fit.shadow.map.scissor.z * fit.shadow.map.scissor.w) / (fit.shadow.map.width * fit.shadow.map.height) : 1;
    try { r.render(scene, cam); } finally { if (fit) { scene.matrixWorldAutoUpdate = true; fit.shadow.map.scissorTest = false; } }
    if (u.fogOn.value) {
      // the fog, once per low-res pixel
      const F = this.fogPass;
      if (!F.rt || F.rt.width !== this.rtW || F.rt.height !== this.rtH) {
        F.rt?.dispose();
        F.rt = new THREE.WebGLRenderTarget(this.rtW, this.rtH, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: false });
        u.tFog.value = F.rt.texture;
      }
      r.setRenderTarget(F.rt);
      r.render(F.scene, this.fsCam);
    }
    if (atmo) {
      // [v31 light] cloud shadows + shafts, once per low-res pixel
      const A = this.atmoPass;
      if (!A.rt || A.rt.width !== this.rtW || A.rt.height !== this.rtH) {
        A.rt?.dispose();
        A.rt = new THREE.WebGLRenderTarget(this.rtW, this.rtH, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: false });
        u.tAtmo.value = A.rt.texture;
      }
      r.setRenderTarget(A.rt);
      r.render(A.scene, this.fsCam);
    }
    if (this.bloomOn) {
      this.brightPass.mat.uniforms.tColor.value = this.rt.texture;
      r.setRenderTarget(this.bloomA);
      r.render(this.brightPass.scene, this.fsCam);
      const bu = this.blurPass.mat.uniforms;
      for (let i = 0; i < 2; i++) {
        bu.tSrc.value = this.bloomA.texture; bu.dir.value.set(this.bloomTexel.x * (1 + i), 0);
        r.setRenderTarget(this.bloomB); r.render(this.blurPass.scene, this.fsCam);
        bu.tSrc.value = this.bloomB.texture; bu.dir.value.set(0, this.bloomTexel.y * (1 + i));
        r.setRenderTarget(this.bloomA); r.render(this.blurPass.scene, this.fsCam);
      }
      u.bloomAmt.value = this.bloomStrength + (this._glowBoost || 0);
    } else {
      u.bloomAmt.value = 0;
    }
    r.setRenderTarget(null);
    r.render(this.postScene, this.fsCam);
  }
}
