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
