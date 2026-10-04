// Batched 2D pixel sprites living in the 3D world (the "2D" half of the look).
// One draw call per batch: an instanced quad with per-sprite position, size,
// anchor, atlas rect, tint, alpha and behaviour flags. Rendered with a
// MeshLambertMaterial (so sprites are lit and receive shadows), alpha-tested
// (writes depth, so the outline pass draws crisp pixel outlines), with
// ordered-dither fading, wind sway weighted towards the top of the sprite,
// grass/foliage pushed aside by nearby characters, and shadows cast from a
// light-facing copy of each billboard.
//
// Modes: 0 = upright billboard (turns around Y to face the camera, height
// compensated for the camera pitch so pixel art isn't squashed),
//        1 = flat on the ground/water (lily pads, splats, shadows),
//        2 = fully camera-facing (particles, bubbles, text).
import * as THREE from 'three';

export const SPRITE_UNIFORMS = {
  uCamRight: { value: new THREE.Vector3(1, 0, 0) },
  uCamUp: { value: new THREE.Vector3(0, 1, 0) },
  uCamBack: { value: new THREE.Vector3(0, 0, 1) },
  uLightRight: { value: new THREE.Vector3(1, 0, 0) },
  uTime: { value: 0 },
  uWind: { value: 1 },
  uHeightComp: { value: 1.39 },
  uFlatComp: { value: 1.44 },
  uPush: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -99, 0, 0)) },
  // see-through cutout: foliage in front of (x, z) within radius fades (x, z, radius, strength)
  uCut: { value: new THREE.Vector4(0, 0, 0, 0) },
  // [v20 water] the water height field: flat sprites lying on the water (lily pads, duckweed) ride the waves
  uWaterSim: { value: null },
  uWaterRect: { value: new THREE.Vector4(0, 0, 1, 1) },
};

const _v = new THREE.Vector3();
// Call once per frame before rendering.
export function updateSpriteUniforms(camera, { time = 0, wind = 1, sunDir = null, pushers = null, cut = null } = {}) {
  if (cut) SPRITE_UNIFORMS.uCut.value.set(cut.x, cut.z, cut.r, cut.k ?? 1);
  else SPRITE_UNIFORMS.uCut.value.set(0, 0, 0, 0);
  const e = camera.matrixWorld.elements;
  SPRITE_UNIFORMS.uCamRight.value.set(e[0], e[1], e[2]).normalize();
  SPRITE_UNIFORMS.uCamUp.value.set(e[4], e[5], e[6]).normalize();
  SPRITE_UNIFORMS.uCamBack.value.set(e[8], e[9], e[10]).normalize();
  const back = SPRITE_UNIFORMS.uCamBack.value;
  const pitch = Math.asin(Math.min(1, Math.max(-1, back.y)));
  SPRITE_UNIFORMS.uHeightComp.value = 1 / Math.max(0.3, Math.cos(pitch));
  SPRITE_UNIFORMS.uFlatComp.value = 1 / Math.max(0.3, Math.sin(pitch));
  SPRITE_UNIFORMS.uTime.value = time;
  SPRITE_UNIFORMS.uWind.value = wind;
  if (sunDir) {
    // billboard orientation for the shadow pass: perpendicular to the light
    _v.set(sunDir.z, 0, -sunDir.x);
    if (_v.lengthSq() < 1e-6) _v.set(1, 0, 0);
    SPRITE_UNIFORMS.uLightRight.value.copy(_v.normalize());
  }
  const P = SPRITE_UNIFORMS.uPush.value;
  for (let i = 0; i < P.length; i++) {
    const p = pushers && pushers[i];
    if (p) P[i].set(p.x, p.y ?? 0, p.z, p.r ?? 0.8);
    else P[i].set(0, -99, 0, 0);
  }
}

const VERT_PARS = /* glsl */ `
attribute vec3 aPos;
attribute vec2 aSize;
attribute vec2 aAnchor;
attribute vec4 aUV;
attribute vec4 aParams;   // sway, phase, mode, alpha
attribute vec4 aExtra;    // flip, rotation, emissive, bend
attribute vec3 aTint;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamBack;
uniform vec3 uLightRight;
uniform float uTime;
uniform float uWind;
uniform float uHeightComp;
uniform float uFlatComp;
uniform vec4 uPush[8];
uniform vec4 uCut;
uniform sampler2D uWaterSim;
uniform vec4 uWaterRect;
varying vec3 vSTint;
varying float vSAlpha;
varying float vSEmis;
vec3 spriteWorld(vec3 camRight) {
  vec2 corner = position.xy;          // 0..1
  vec2 local = (corner - aAnchor) * aSize;
  float rot = aExtra.y;
  if (rot != 0.0) { float c = cos(rot), s = sin(rot); local = vec2(c * local.x - s * local.y, s * local.x + c * local.y); }
  float mode = aParams.z;
  vec3 right = normalize(vec3(camRight.x, 0.0, camRight.z) + vec3(1e-5, 0.0, 0.0));
  vec3 p;
  if (mode < 0.5) {
    // gentle bend (fish tails, grass) along the sprite's length
    p = aPos + right * local.x + vec3(0.0, local.y * uHeightComp, 0.0);
  } else if (mode < 1.5) {
    vec3 fwd = normalize(vec3(uCamUp.x, 0.0, uCamUp.z) + vec3(0.0, 0.0, 1e-5));
    p = aPos + right * local.x + fwd * local.y * uFlatComp;
  } else {
    p = aPos + uCamRight * local.x + uCamUp * local.y;
  }
  // wind: weighted towards the top of the sprite (trunks/stems stay put)
  float sway = aParams.x;
  if (sway > 0.0) {
    float hw = corner.y * corner.y;
    float t = uTime * 1.25 + aParams.y;
    float gust = 0.6 + 0.4 * sin(uTime * 0.37 + aPos.x * 0.05);
    vec2 w = vec2(sin(t + aPos.x * 0.35) + 0.35 * sin(t * 2.7 + aPos.z * 0.8), 0.45 * cos(t * 0.8 + aPos.z * 0.3));
    p.xz += w * sway * hw * uWind * gust * 0.07 * max(0.35, aSize.y);
    // pushed aside by characters walking through
    for (int i = 0; i < 8; i++) {
      vec4 q = uPush[i];
      if (q.w <= 0.0) continue;
      vec2 d = aPos.xz - q.xz;
      float dd = length(d);
      if (dd < q.w && abs(aPos.y - q.y) < 2.5) {
        float k = 1.0 - dd / q.w;
        p.xz += (d / max(dd, 1e-3)) * k * k * sway * hw * 0.45;
        p.y -= k * sway * hw * 0.12 * aSize.y;
      }
    }
  }
  // tail wiggle for swimming fish: bend increases away from the head (right side of the sprite)
  float bend = aExtra.w;
  if (bend != 0.0 && mode < 0.5) {
    float along = 1.0 - corner.x;
    p.y += sin(uTime * 9.0 + aParams.y) * bend * along * along * aSize.y * 0.18 * uHeightComp;
    p += right * sin(uTime * 9.0 + aParams.y + 1.5) * bend * along * 0.03;
  }
  // [v20 water] floating flat sprites bob with the simulated waves (same lift as the water surface)
  if (mode > 0.5 && mode < 1.5 && abs(aPos.y + 0.07) < 0.045 && uWaterRect.z > 1.0) {
    float wh = (texture2D(uWaterSim, (p.xz - uWaterRect.xy) / uWaterRect.zw).r - 0.502) * 2.55;
    p.y += wh * 0.13;
  }
  return p;
}
`;

const VERT_MAIN = /* glsl */ `
vec3 sprW = spriteWorld(uCamRight);
vec3 transformed = sprW;
`;

const FRAG_PARS = /* glsl */ `
varying vec3 vSTint;
varying float vSAlpha;
varying float vSEmis;
float bayer2s(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2s(0.5 * a) * 0.25 + bayer2s(a) + 0.03; }
`;

function patchVertex(shader, forDepth) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_PARS)
    .replace('#include <beginnormal_vertex>', `
vec3 objectNormal = ${forDepth ? 'vec3(0.0, 1.0, 0.0)' : 'normalize(aParams.z > 0.5 && aParams.z < 1.5 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.75, 0.0) + uCamBack * 0.7)'};
#ifdef USE_TANGENT
vec3 objectTangent = vec3(1.0, 0.0, 0.0);
#endif
`)
    .replace('#include <begin_vertex>', forDepth ? 'vec3 transformed = spriteWorld(uLightRight);' : VERT_MAIN)
    .replace('#include <uv_vertex>', `#include <uv_vertex>
{
  vec2 cuv = position.xy;
  float fu = aExtra.x < 0.0 ? 1.0 - cuv.x : cuv.x;
  vec2 suv = vec2(mix(aUV.x, aUV.z, fu), mix(aUV.w, aUV.y, cuv.y));
  #ifdef USE_MAP
  vMapUv = suv;
  #endif
}
vSTint = aTint;
vSAlpha = aParams.w;
if (uCut.z > 0.0 && aParams.x > 0.0) {
  vec2 cd = aPos.xz - uCut.xy;
  float cdd = length(cd);
  float front = dot(cd, normalize(uCamBack.xz + vec2(1e-5)));
  if (cdd < uCut.z && front > -0.15) vSAlpha *= 1.0 - uCut.w * 0.8 * (1.0 - smoothstep(uCut.z * 0.55, uCut.z, cdd));
}
vSEmis = aExtra.z;
`);
}

function patchFragmentDiscard(src) {
  return src.replace('#include <map_fragment>', `#include <map_fragment>
if (diffuseColor.a < 0.5) discard;
if (vSAlpha < 0.999 && vSAlpha < bayer4(gl_FragCoord.xy)) discard;
diffuseColor.a = 1.0;
`);
}

export function makeSpriteMaterials(texture, { lit = true } = {}) {
  const mat = lit
    ? new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide })
    : new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SPRITE_UNIFORMS);
    patchVertex(shader, false);
    shader.fragmentShader = patchFragmentDiscard(shader.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_PARS))
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vSTint;');
    if (lit) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vSEmis * 1.6;');
    } else {
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight *= 1.0 + vSEmis * 1.6;\n#include <opaque_fragment>');
    }
  };
  mat.customProgramCacheKey = () => 'sprite' + (lit ? 'L' : 'B');
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: texture, side: THREE.DoubleSide });
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SPRITE_UNIFORMS);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', 'vec3 transformed = spriteWorld(uLightRight);')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
{
  vec2 cuv = position.xy;
  float fu = aExtra.x < 0.0 ? 1.0 - cuv.x : cuv.x;
  vec2 suv = vec2(mix(aUV.x, aUV.z, fu), mix(aUV.w, aUV.y, cuv.y));
  #ifdef USE_MAP
  vMapUv = suv;
  #endif
}
vSTint = aTint; vSAlpha = aParams.w; vSEmis = aExtra.z;`);
    shader.fragmentShader = patchFragmentDiscard(shader.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_PARS));
  };
  depth.customProgramCacheKey = () => 'spriteDepth';
  return { mat, depth };
}

const FLOATS = { aPos: 3, aSize: 2, aAnchor: 2, aUV: 4, aParams: 4, aExtra: 4, aTint: 3 };

export class SpriteBatch {
  // texture: THREE.Texture of the atlas (NearestFilter). atlasW/H in px.
  constructor(texture, { max = 1024, lit = true, castShadow = false, receiveShadow = true, renderOrder = 0, name = 'sprites' } = {}) {
    this.max = max;
    this.count = 0;
    this.tex = texture;
    this.aw = texture.image.width;
    this.ah = texture.image.height;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.attr = {};
    for (const [k, n] of Object.entries(FLOATS)) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(k, a);
      this.attr[k] = a;
    }
    g.instanceCount = 0;
    this.geo = g;
    const { mat, depth } = makeSpriteMaterials(texture, { lit });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.customDepthMaterial = depth;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = castShadow;
    this.mesh.receiveShadow = receiveShadow;
    this.mesh.renderOrder = renderOrder;
    this.mesh.name = name;
    this.dirty = true;
  }

  clear() { this.count = 0; this.dirty = true; }

  // frame: { x, y, w, h } px rect in the atlas; opts: world placement and look.
  // Returns the sprite index (or -1 if full).
  push(frame, x, y, z, o = {}) {
    if (this.count >= this.max) return -1;
    const i = this.count++;
    this.write(i, frame, x, y, z, o);
    return i;
  }

  write(i, frame, x, y, z, o = {}) {
    const A = this.attr;
    const tpu = o.texels || 24; // texels per world unit
    const scale = o.scale ?? 1;
    const w = (o.w ?? frame.w / tpu) * scale * (o.sx ?? 1);
    const h = (o.h ?? frame.h / tpu) * scale * (o.sy ?? 1);
    A.aPos.array.set([x, y, z], i * 3);
    A.aSize.array.set([w, h], i * 2);
    (this.baseSize ||= new Float32Array(this.max * 2)).set([w, h], i * 2);
    const ax = o.ax ?? (frame.ax != null ? frame.ax / frame.w : 0.5);
    const ay = o.ay ?? (frame.ay != null ? 1 - frame.ay / frame.h : 0);
    A.aAnchor.array.set([ax, ay], i * 2);
    const inset = 0.001;
    A.aUV.array.set([(frame.x + inset) / this.aw, 1 - (frame.y + inset) / this.ah, (frame.x + frame.w - inset) / this.aw, 1 - (frame.y + frame.h - inset) / this.ah], i * 4);
    A.aParams.array.set([o.sway ?? 0, o.phase ?? 0, o.mode ?? 0, o.alpha ?? 1], i * 4);
    A.aExtra.array.set([o.flip ? -1 : 1, o.rot ?? 0, o.emissive ?? 0, o.bend ?? 0], i * 4);
    const t = o.tint;
    if (t) A.aTint.array.set([t[0], t[1], t[2]], i * 3);
    else A.aTint.array.set([1, 1, 1], i * 3);
    this.dirty = true;
  }

  // recolour one sprite in place (no rebuild)
  setTint(i, t) {
    if (i < 0 || i >= this.count) return;
    this.attr.aTint.array.set([t[0], t[1], t[2]], i * 3);
    this.dirty = true;
  }

  // squash one sprite relative to how it was pushed (no rebuild)
  setScale(i, kx, ky) {
    if (i < 0 || i >= this.count || !this.baseSize) return;
    this.attr.aSize.array[i * 2] = this.baseSize[i * 2] * kx;
    this.attr.aSize.array[i * 2 + 1] = this.baseSize[i * 2 + 1] * ky;
    this.dirty = true;
  }

  setEmissive(i, e) {
    if (i < 0 || i >= this.count) return;
    this.attr.aExtra.array[i * 4 + 2] = e;
    this.dirty = true;
  }

  commit() {
    if (!this.dirty) return;
    this.dirty = false;
    this.geo.instanceCount = this.count;
    for (const [k, a] of Object.entries(this.attr)) {
      a.clearUpdateRanges();
      if (this.count) a.addUpdateRange(0, this.count * FLOATS[k]);
      a.needsUpdate = true;
    }
  }

  dispose() {
    this.geo.dispose();
    this.mesh.material.dispose();
    this.mesh.customDepthMaterial.dispose();
  }
}

// Texture helper for pixel atlases.
export function pixelTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = true;
  t.needsUpdate = true;
  return t;
}
