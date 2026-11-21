// Main menu light pass (WebGL1 / GLSL ES 1.00), two passes over the composited 640x360 frame.
// Everything is worked out per screen pixel and the light is dithered into steps, so the
// result is still pixel art at any integer scale.
//
// uScene  the composited frame (sky ... front), NEAREST
// uSky    alpha = 1 where the open sky shows (nothing stands in front of it)
// uLake   alpha = 1 where the lake's water shows
// uHot    pass 1's output: how much bright warm light each 4x4 cell holds, LINEAR
// uRes    (640, 360)    uSun  the sun's centre, pixels, y down
// uHorizon  the lake's far line (y, pixels)    uTime  seconds

// ==== pass 1: hot (renders into a 160x90 target)
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uScene, uSky;
uniform vec2 uRes;
uniform float uGlowT, uSkyGlowT;
float lum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
void main() {
  vec2 cell = floor(gl_FragCoord.xy) * 4.0;
  float hot = 0.0;
  for (int j = 0; j < 4; j++)
    for (int i = 0; i < 4; i++) {
      vec2 uv = (cell + vec2(float(i), float(j)) + 0.5) / uRes;
      vec3 c = texture2D(uScene, uv).rgb;
      float L = lum(c) * 255.0;
      hot += (c.r > c.b + 0.08) ? clamp((L - uGlowT) / 55.0, 0.0, 1.0) : 0.0;
      hot += texture2D(uSky, uv).a > 0.5 ? clamp((L - uSkyGlowT) / 20.0, 0.0, 1.0) : 0.0;
    }
  gl_FragColor = vec4(hot / 16.0, 0.0, 0.0, 1.0);
}

// ==== pass 2: light (renders the 640x360 screen)
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uScene, uSky, uLake, uHot;
uniform vec2 uRes, uSun;
uniform float uHorizon, uTime;
uniform float uRayT, uLightK, uVigK;
uniform vec3 uLight, uVig, uTint, uGlint;

vec2 tex(vec2 px) { return (clamp(px, vec2(0.0), uRes - 1.0) + 0.5) / uRes; }   // pixel (y down) -> uv
vec3 scene(vec2 px) { return texture2D(uScene, tex(px)).rgb; }
float lum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
float b2(vec2 q) { return 2.0 * abs(q.x - q.y) + q.y; }                   // 2x2 Bayer of bits
float bayer4(vec2 p) {                                                  // 4x4 ordered dither, 0..15/16
  vec2 lo = mod(p, 2.0), hi = mod(floor(p / 2.0), 2.0);
  return (4.0 * b2(lo) + b2(hi)) / 16.0;
}
float hotAt(vec2 px) { return texture2D(uHot, px / uRes).r; }

void main() {
  // canvas y is up; the art's y is down. Textures are uploaded unflipped, so uv.y = px.y / H.
  vec2 px = vec2(floor(gl_FragCoord.x), uRes.y - 1.0 - floor(gl_FragCoord.y));
  vec3 col = scene(px);

  // 1 the lake mirrors what stands above it, broken by ripples that grow toward you
  if (texture2D(uLake, tex(px)).a > 0.5) {
    float depth = px.y - uHorizon;
    float amp = clamp(depth * 0.12, 0.0, 3.0);
    float rip = floor(sin(px.y * 0.9 + uTime * 3.1) * amp + sin(px.y * 2.3 - uTime * 4.7) * amp * 0.4 + 0.5);
    vec3 refl = scene(vec2(px.x + rip, 2.0 * uHorizon - px.y - 1.0)) * uTint;
    col = mix(col, refl, clamp(0.62 - depth * 0.006, 0.25, 0.62));
    // the sun's road: short glinting dashes on the water under the sun
    float road = exp(-pow((px.x - uSun.x) / (8.0 + depth * 1.4), 2.0));
    float cell = floor(px.x / 3.0);
    float sp = sin(cell * 2.1 + px.y * 5.3 + uTime * 6.0) * sin(cell * 0.9 - px.y * 3.1 - uTime * 4.4);
    if (sp > 0.8 - 0.45 * road && road > 0.2 && mod(px.y, 2.0) < 0.5 && mod(px.x, 3.0) < 1.5)
      col = uGlint;
  }

  // 2 sun rays: the bright open sky smeared out from the sun, fanning past the peaks and leaves
  vec2 d = uSun - px;
  float acc = 0.0;
  for (int i = 0; i < 28; i++) {
    float s = float(i) / 28.0;
    vec2 q = floor(px + d * s);
    float b = texture2D(uSky, tex(q)).a * clamp((lum(scene(q)) * 255.0 - uRayT) / 90.0, 0.0, 1.0);
    acc += b * (1.0 - s * 0.6);
  }
  float rays = acc / 28.0 * clamp(1.0 - length(d) / 560.0, 0.0, 1.0) * 1.5;

  // 3 glow round bright warm things (the sun, lanterns, the window, glints): pass 1, spread
  float glow = hotAt(px) * 2.0;
  for (int a = 0; a < 8; a++) {
    float ang = float(a) * 0.785398;
    vec2 o = vec2(cos(ang), sin(ang));
    glow += hotAt(px + o * 6.0) + hotAt(px + o * 13.0) * 0.8;
  }
  glow /= 16.4;

  // dithered into steps so the light lands as pixel clusters
  float light = clamp(rays + glow, 0.0, 1.0);
  light = floor(light * 6.0 + bayer4(px)) / 6.0;
  col += (uLight - col * 0.5) * light * uLightK;

  // 4 a warm vignette
  float v = length(vec2((px.x - uRes.x * 0.5) / (uRes.x * 0.62), (px.y - uRes.y * 0.45) / (uRes.y * 0.75)));
  col = mix(col, uVig, pow(clamp(v - 0.55, 0.0, 1.0), 1.5) * uVigK);
  gl_FragColor = vec4(col, 1.0);
}
