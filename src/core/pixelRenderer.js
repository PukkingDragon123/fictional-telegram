// Renders the 3D scene into a small render target, then upscales it with
// nearest-neighbour filtering and a depth-based outline pass. This gives the
// crisp "3D pixel art" look. The render target has a 1px margin so the camera
// can be snapped to whole pixels and the leftover sub-pixel offset applied
// when blitting (smooth camera motion without pixel crawl).
//
// Cozy extras: a soft bloom (bright-pass at half resolution, separable blur),
// a warm colour grade with lifted purple shadows, tinted outlines, a gentle
// tilt-shift haze at the screen edges, a vignette and an iris wipe used for
// scene transitions.
import * as THREE from 'three';

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform float threshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  float l = max(max(c.r, c.g), c.b);
  float k = smoothstep(threshold, threshold + 0.6, l);
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
// thick fog over the unexplored areas: a world-space mask (1 texel = 1 tile),
// marched along each pixel's view ray through a billowy slab of cloud
uniform sampler2D fogTex;
uniform vec2 fogSize;
uniform float fogOn;
uniform float fogTop;
uniform mat4 invVP;
uniform vec3 camDir;
uniform vec3 fogLight;
uniform vec3 fogShade;

float fhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fhash(i), fhash(i + vec2(1.0, 0.0)), u.x), mix(fhash(i + vec2(0.0, 1.0)), fhash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float ffbm(vec2 p) { return fnoise(p) * 0.55 + fnoise(p * 2.03 + 7.1) * 0.3 + fnoise(p * 4.1 + 3.3) * 0.15; }
// fogTex: r = density, g = ground height / 25.5 (the fog hugs hills)
float fogDensity(vec3 q) {
  // domain-warp the lookup so area outlines aren't perfect circles
  vec2 wq = q.xz + (vec2(fnoise(q.xz * 0.075 + vec2(time * 0.01, 0.0)), fnoise(q.xz * 0.075 + 5.2)) - 0.5) * 7.0;
  vec2 t = texture2D(fogTex, wq / fogSize).rg;
  float m = t.r;
  if (m < 0.004) return 0.0;
  float n = ffbm(q.xz * 0.17 + vec2(time * 0.018, time * 0.011));
  float edge = smoothstep(0.12, 0.75, m + (n - 0.5) * 0.6);
  float top = t.g * 25.5 + fogTop * (0.72 + 0.45 * n) * (0.35 + 0.65 * smoothstep(0.15, 0.85, m));
  return edge * smoothstep(top, top - 1.2, q.y);
}
vec4 fogAt(vec2 lp, vec2 uv) {
  float z = texture2D(tDepth, uv).x;
  if (z > 0.99999) return vec4(0.0);
  vec4 wp = invVP * vec4(uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
  vec3 P = wp.xyz / wp.w;
  float cy = max(0.08, -camDir.y);
  float gh = texture2D(fogTex, P.xz / fogSize).g * 25.5;
  float tTop = clamp((gh + fogTop * 1.25 - P.y) / cy, 0.0, 30.0);
  if (tTop <= 0.0) return vec4(0.0);
  // cheap reject: no fog anywhere near this ray
  vec3 qa = P - camDir * tTop;
  if (texture2D(fogTex, P.xz / fogSize).r + texture2D(fogTex, qa.xz / fogSize).r + texture2D(fogTex, mix(P.xz, qa.xz, 0.5) / fogSize).r < 0.003) return vec4(0.0);
  float tau = 0.0, hitY = -99.0;
  vec2 hitXZ = P.xz;
  const int N = 10;
  float st = tTop / float(N);
  for (int i = 0; i < N; i++) {
    float t = tTop - (float(i) + 0.5) * st;
    vec3 q = P - camDir * t;
    float d = fogDensity(q);
    if (d > 0.3 && hitY < -90.0) { hitY = q.y; hitXZ = q.xz; }
    tau += d * st;
  }
  // anything standing inside a fogged area is swallowed whole, however tall
  vec2 pw = P.xz + (vec2(fnoise(P.xz * 0.075 + vec2(time * 0.01, 0.0)), fnoise(P.xz * 0.075 + 5.2)) - 0.5) * 7.0;
  float cover = smoothstep(0.55, 0.95, texture2D(fogTex, pw / fogSize).r);
  if (tau < 0.002 && cover < 0.01) return vec4(0.0);
  if (hitY < -90.0 && cover > 0.01) { hitY = P.y; hitXZ = P.xz; }
  float dith = fract(52.9829189 * fract(dot(lp, vec2(0.06711056, 0.00583715))));
  float a = max(1.0 - exp(-tau * 2.2), cover);
  a = clamp(floor(a * 4.0 + dith * 0.999) / 4.0, 0.0, 1.0);
  // billows: lit tops, a light from the top-left, chunky 4-tone shading
  vec2 dr = vec2(time * 0.018, time * 0.011);
  float hg = texture2D(fogTex, hitXZ / fogSize).g * 25.5;
  float s = hitY > -90.0 ? clamp((hitY - hg + 0.6) / fogTop, 0.0, 1.0) : 0.3;
  float g = ffbm(hitXZ * 0.17 + dr + vec2(-0.35, -0.35)) - ffbm(hitXZ * 0.17 + dr);
  float big = ffbm(hitXZ * 0.06 + dr * 0.5);
  float sh = clamp(0.18 + 0.5 * s + g * 3.4 + (big - 0.5) * 0.5, 0.0, 1.0);
  sh = floor(sh * 4.0 + dith * 0.85) / 4.0;
  return vec4(mix(fogShade, fogLight, sh), a);
}

float D(vec2 p) { return texture2D(tDepth, (p + 0.5) / rtSize).x * depthRange; }
vec3 C(vec2 p) { return texture2D(tColor, (p + 0.5) / rtSize).rgb; }

void main() {
  vec2 lp = floor(gl_FragCoord.xy / pixelScale + subpixel) + 1.0;
  vec3 col = C(lp);
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
  // soft bloom
  vec2 buv = (lp - 0.5) / rtSize;
  vec3 bl = texture2D(tBloom, buv).rgb;
  col += bl * bloomAmt;
  if (fogOn > 0.5) {
    vec4 fg = fogAt(lp, (lp + 0.5) / rtSize);
    col = mix(col, fg.rgb, fg.a);
    bl *= 1.0 - fg.a;
  }
  // cozy grade: lifted cool shadows, warm gain, gentle contrast
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, saturation);
  col = col * grade + lift * (1.0 - clamp(l * 1.6, 0.0, 1.0));
  col = mix(vec3(0.5), col, contrast);
  col = max(col, 0.0);
  vec2 uv = gl_FragCoord.xy / screenSize;
  // tilt-shift haze towards the top and bottom (miniature diorama feel)
  float ts = smoothstep(0.28, 0.5, abs(uv.y - 0.46));
  col = mix(col, mix(col, hazeColor, 0.35) + bl * 0.4, ts * haze);
  float v = smoothstep(0.95, 0.35, length((uv - 0.5) * vec2(1.0, 0.9)));
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
    this.brightPass = mkPass(BRIGHT_FRAG, { tColor: { value: null }, threshold: { value: 0.92 } });
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
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(quadGeo, this.postMat);
    quad.frustumCulled = false;
    this.postScene.add(quad);
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

  // fog of the unexplored: a DataTexture mask over the w x h tile grid (null = off)
  setFog(tex, w, h) {
    const u = this.postMat.uniforms;
    u.fogTex.value = tex;
    u.fogSize.value.set(w || 1, h || 1);
    u.fogOn.value = tex ? 1 : 0;
  }
  setFogColors(light, shade) {
    const u = this.postMat.uniforms;
    u.fogLight.value.set(light[0], light[1], light[2]);
    u.fogShade.value.set(shade[0], shade[1], shade[2]);
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
    if (u.fogOn.value) {
      u.invVP.value.multiplyMatrices(cam.matrixWorld, cam.projectionMatrixInverse);
      u.camDir.value.set(0, 0, -1).transformDirection(cam.matrixWorld);
    }
    r.setRenderTarget(this.rt);
    r.render(scene, cam);
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
      u.bloomAmt.value = this.bloomStrength;
    } else {
      u.bloomAmt.value = 0;
    }
    r.setRenderTarget(null);
    r.render(this.postScene, this.fsCam);
  }
}
