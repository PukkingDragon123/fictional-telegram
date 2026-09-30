// Renders the 3D scene into a small render target, then upscales it with
// nearest-neighbour filtering and a depth-based outline pass. This gives the
// crisp "3D pixel art" look. The render target has a 1px margin so the camera
// can be snapped to whole pixels and the leftover sub-pixel offset applied
// when blitting (smooth camera motion without pixel crawl).
import * as THREE from 'three';

const POST_VERT = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const POST_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 rtSize;
uniform vec2 subpixel;
uniform float pixelScale;
uniform float depthRange;
uniform float outlineAmt;
uniform float highlightAmt;
uniform vec2 screenSize;
uniform float vignette;
uniform float saturation;
uniform vec3 grade;
uniform float flash;
uniform vec3 flashColor;

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
  float nearest = min(min(dl, dr), min(db, dt));
  float edge = smoothstep(0.18, 0.4, lap);
  float crease = smoothstep(0.012, 0.05, lap) * (1.0 - edge);
  // Darken pixels on the near side of a depth jump (inner outline).
  col *= 1.0 - outlineAmt * edge;
  col *= 1.0 + highlightAmt * crease;
  // light colour grade
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, saturation) * grade;
  vec2 uv = gl_FragCoord.xy / screenSize;
  float v = smoothstep(0.95, 0.35, length((uv - 0.5) * vec2(1.0, 0.9)));
  col *= mix(1.0 - vignette, 1.0, v);
  col = mix(col, flashColor, flash);
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

    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postMat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        rtSize: { value: new THREE.Vector2(1, 1) },
        subpixel: { value: new THREE.Vector2() },
        pixelScale: { value: 3 },
        depthRange: { value: 1 },
        outlineAmt: { value: 0.42 },
        highlightAmt: { value: 0.12 },
        screenSize: { value: new THREE.Vector2(1, 1) },
        vignette: { value: 0.28 },
        saturation: { value: 1.08 },
        grade: { value: new THREE.Vector3(1, 1, 1) },
        flash: { value: 0 },
        flashColor: { value: new THREE.Color(1, 1, 1) },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat);
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
    }
    const depthTexture = new THREE.DepthTexture(this.rtW, this.rtH);
    depthTexture.type = THREE.UnsignedIntType;
    depthTexture.minFilter = depthTexture.magFilter = THREE.NearestFilter;
    this.rt = new THREE.WebGLRenderTarget(this.rtW, this.rtH, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      depthTexture,
    });
    const u = this.postMat.uniforms;
    u.tColor.value = this.rt.texture;
    u.tDepth.value = this.rt.depthTexture;
    u.rtSize.value.set(this.rtW, this.rtH);
    u.pixelScale.value = this.pixelScale;
    u.screenSize.value.set(W, H);
  }

  render(scene, cameraRig) {
    const r = this.renderer;
    const cam = cameraRig.camera;
    const u = this.postMat.uniforms;
    u.subpixel.value.copy(cameraRig.subpixel);
    u.depthRange.value = cam.far - cam.near;
    r.setRenderTarget(this.rt);
    r.render(scene, cam);
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCam);
  }
}
