// [v26 world] Water that moves: the streams on high ground (ribbons over the
// block terrain that run along and pour down every step), the tall Mistfall
// curtain into the Deep pond, mist and spray where water lands, and the rocks
// that sit in the river's current. The river surface itself is world/water.js;
// buildWhiteInfo() feeds it the white water (rapids, rock wakes, plunge pool).
import * as THREE from 'three';
import { KIND, WATER_Y } from './grid.js';
import { STREAMS, WATERFALL } from './worldgen.js';
import { hash2, clamp } from '../core/rng.js';
import { SpriteBatch, SPRITE_UNIFORMS } from '../core/spriteBatch.js';

const RES = 4; // texels per tile (same as water.js)

// ------------------------------------------------------------------ white water
// R: white water (rapids, rocks, the falls), G: current speed, per info texel
export function buildWhiteInfo(grid, tex) {
  const { w, h } = grid;
  const W = w * RES, H = h * RES;
  const data = tex && tex.image.width === W && tex.image.height === H ? tex.image.data : new Uint8Array(W * H * 4);
  data.fill(0);
  const S = grid.flowS, Wt = grid.white;
  if (S) {
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const px = (i + 0.5) / RES - 0.5, pz = (j + 0.5) / RES - 0.5;
        const ax = clamp(Math.floor(px), 0, w - 2), az = clamp(Math.floor(pz), 0, h - 2);
        const ux = clamp(px - ax, 0, 1), uz = clamp(pz - az, 0, 1);
        const at = (arr) => (arr[az * w + ax] * (1 - ux) + arr[az * w + ax + 1] * ux) * (1 - uz) + (arr[(az + 1) * w + ax] * (1 - ux) + arr[(az + 1) * w + ax + 1] * ux) * uz;
        const o = (j * W + i) * 4;
        data[o] = Math.round(at(Wt));
        data[o + 1] = Math.round(clamp(at(S) / 2, 0, 1) * 255);
        data[o + 3] = 255;
      }
    // a V of white behind every rock, a bow wave in front
    for (const [rx, rz, size] of grid.riverRocks || []) {
      const tx = Math.floor(rx), tz = Math.floor(rz);
      const ti = tz * w + tx;
      const fx = grid.flowX[ti], fz = grid.flowZ[ti], sp = grid.flowS[ti];
      const L = 3.2 * size;
      for (let j = Math.floor((rz - L) * RES); j <= Math.ceil((rz + L) * RES); j++)
        for (let i = Math.floor((rx - L) * RES); i <= Math.ceil((rx + L) * RES); i++) {
          if (i < 0 || j < 0 || i >= W || j >= H) continue;
          const px = (i + 0.5) / RES - rx, pz = (j + 0.5) / RES - rz;
          const al = px * fx + pz * fz, lat = Math.abs(px * -fz + pz * fx);
          let k = 0;
          if (al > 0 && al < L) { const edge = 0.22 * size + al * 0.32; k = lat < edge ? (1 - al / L) * (lat > edge - 0.18 ? 1 : 0.55) : 0; }
          else if (al <= 0 && al > -0.45 * size && lat < 0.4 * size) k = 0.9;
          if (Math.hypot(px, pz) < 0.22 * size) k = 0; // the rock itself
          if (k <= 0) continue;
          const o = (j * W + i) * 4;
          data[o] = Math.max(data[o], Math.round(k * 255 * clamp(sp, 0.4, 1.2)));
        }
    }
  }
  if (!tex || tex.image.width !== W || tex.image.height !== H) {
    tex?.dispose?.();
    tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  }
  tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------------ shaders
const RIBBON_VERT = /* glsl */ `
attribute vec4 aRib; // along (world units), across (0..1), drop (0 flat .. 1 falling), speed
varying vec4 vRib;
varying vec3 vWP;
void main() {
  vRib = aRib;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const RIBBON_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uSkyTint;
uniform vec3 uFoam;
uniform float uNight;
uniform float uCurtain;
varying vec4 vRib;
varying vec3 vWP;
float hh(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(i), hh(i + vec2(1.0, 0.0)), f.x), mix(hh(i + vec2(0.0, 1.0)), hh(i + vec2(1.0, 1.0)), f.x), f.y); }
float bayer4(vec2 a) {
  ivec2 q = ivec2(mod(floor(a), 4.0));
  int i = q.x + q.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
void main() {
  float along = vRib.x, across = vRib.y, drop = vRib.z, spd = vRib.w;
  float t = uTime;
  // pixel-snapped coordinates: along the flow, across it
  float a = floor(along * 24.0) / 24.0;
  float c = floor(across * 10.0) / 10.0;
  float edge = 1.0 - abs(across * 2.0 - 1.0);
  // streaks running downstream (much faster where it falls)
  float rate = mix(1.6, 5.5, drop) * spd;
  float s1 = vn(vec2(c * 7.0 + 3.0, a * mix(1.1, 0.45, drop) - t * rate));
  float s2 = vn(vec2(c * 13.0, a * 2.6 - t * rate * 1.4));
  vec3 col = mix(uShallow * vec3(0.95, 1.12, 1.08), uDeep, 0.25 + 0.35 * edge);
  col = mix(col, uSkyTint, 0.18);
  float foam = step(0.62 - drop * 0.3 - (1.0 - edge) * 0.25, s1 * 0.7 + s2 * 0.3);
  foam = max(foam, step(edge, 0.22) * step(0.4, s2));
  vec3 foamC = uFoam * (1.0 - uNight * 0.55);
  col = mix(col, foamC, foam * mix(0.75, 0.95, drop));
  col = mix(col, foamC * 0.92, drop * 0.35);
  col *= 1.0 - uNight * 0.35;
  float alpha = mix(0.82, 0.9, drop);
  if (uCurtain > 0.5) {
    // the tall fall: solid ropes of water with slits between them (the house shows through)
    float colk = floor(across * 14.0);
    float rope = hh(vec2(colk, 3.0));
    float sheet = vn(vec2(colk * 1.7 + 11.0, a * 0.5 - t * (2.0 + rope)));
    float gap = step(0.62, rope) * step(0.45, vn(vec2(colk, a * 0.25 - t * 0.7)));
    alpha = (1.0 - gap * 0.85) * smoothstep(0.0, 0.08, edge);
    col = mix(uShallow * vec3(0.9, 1.1, 1.1), foamC, 0.35 + smoothstep(0.45, 0.8, sheet) * 0.55);
    col *= 0.92 + 0.12 * hh(vec2(colk, 7.0));
    col *= 1.0 - uNight * 0.35;
  }
  if (alpha < bayer4(gl_FragCoord.xy) * 0.98) discard;
  gl_FragColor = vec4(col, 1.0);
}`;

// GPU mist + spray: instanced quads whose life runs on uTime
const PART_VERT = /* glsl */ `
attribute vec3 aOrigin;
attribute vec4 aSeed; // phase, kind (0 mist, 1 spray), spread, size
uniform float uTime;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
varying float vA;
varying vec2 vC;
varying float vKind;
float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  float kind = aSeed.y;
  float rate = kind < 0.5 ? 0.14 : 0.85;
  float life = fract(uTime * rate + aSeed.x);
  float cyc = floor(uTime * rate + aSeed.x);
  float r1 = h1(aSeed.x * 91.3 + cyc * 3.7), r2 = h1(aSeed.x * 37.1 + cyc * 5.3), r3 = h1(aSeed.x * 11.7 + cyc * 1.9);
  float ang = r1 * 6.2832;
  vec3 p = aOrigin;
  float size;
  if (kind < 0.5) {
    // mist: billows up and out, slowly
    p += vec3(cos(ang), 0.0, sin(ang)) * aSeed.z * (0.3 + life * 1.1) + vec3(sin(uTime * 0.3 + r2 * 6.0) * 0.3, life * (1.4 + r3 * 1.8), 0.0);
    size = aSeed.w * (0.7 + life * 1.6);
    vA = smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.45, 1.0, life)) * 0.42;
  } else {
    // spray: droplets flung out of the impact in arcs
    float v = 1.6 + r2 * 2.2;
    vec3 dir = normalize(vec3(cos(ang), 0.9 + r3, sin(ang)));
    float tt = life * 0.9;
    p += dir * v * tt * aSeed.z + vec3(0.0, -4.5 * tt * tt, 0.0);
    size = aSeed.w * (1.0 - life * 0.4);
    vA = (1.0 - smoothstep(0.6, 1.0, life)) * step(-0.3, p.y - aOrigin.y);
  }
  vKind = kind;
  vC = position.xy * 2.0 - 1.0;
  vec3 wp = p + uCamRight * (position.x - 0.5) * size + uCamUp * (position.y - 0.5) * size;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const PART_FRAG = /* glsl */ `
uniform vec3 uMistCol;
varying float vA;
varying vec2 vC;
varying float vKind;
float bayer4(vec2 a) {
  ivec2 q = ivec2(mod(floor(a), 4.0));
  int i = q.x + q.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
void main() {
  float d = dot(vC, vC);
  if (d > 1.0) discard;
  float a = vA * (vKind < 0.5 ? (1.0 - d) : 1.0);
  if (a < bayer4(gl_FragCoord.xy)) discard;
  gl_FragColor = vec4(uMistCol * (vKind < 0.5 ? 1.0 : 1.08), 1.0);
}`;

// ------------------------------------------------------------------ geometry
// a stream's ribbon: along the polyline over the terrain, never uphill; where the
// ground steps down the ribbon turns vertical and falls the full step
function ribbonPoints(world, S) {
  const g = world.grid;
  const P = S.pts;
  const pts = [];
  for (let s = 0; s < P.length - 1; s++) {
    const [ax, az] = P[s], [bx, bz] = P[s + 1];
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 0.2));
    for (let k = s ? 1 : 0; k <= n; k++) pts.push([ax + (bx - ax) * (k / n), az + (bz - az) * (k / n)]);
  }
  const out = [];
  let y = 1e9;
  for (const [x, z] of pts) {
    const tx = Math.floor(x), tz = Math.floor(z);
    if (!g.inb(tx, tz)) { if (out.length) out.push([x, Math.max(WATER_Y, y), z, 0]); continue; }
    const i = tz * g.w + tx;
    let gy = g.kind[i] === KIND.WATER ? WATER_Y : (g.cube?.[i] ? g.height[i] : g.surfaceAtVisual(x, z)) + 0.035;
    if (y === 1e9) y = gy;
    if (gy < y - 0.02) {
      // a step: fall straight down here
      out.push([x, y, z, 1]);
      y = gy;
      out.push([x, y, z, 1]);
    } else out.push([x, y, z, 0]);
  }
  return out;
}

function ribbonGeometry(rib, width) {
  const pos = [], att = [], idx = [];
  let along = 0;
  for (let i = 0; i < rib.length; i++) {
    const [x, y, z, drop] = rib[i];
    const a = rib[Math.max(0, i - 1)], b = rib[Math.min(rib.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[2] - a[2];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    if (i) along += Math.hypot(x - rib[i - 1][0], y - rib[i - 1][1], z - rib[i - 1][2]);
    const wv = width * (0.85 + 0.3 * hash2(i, 3, 17));
    // drops lean out a little so the sheet shows from the front
    const lean = drop ? 0.08 : 0;
    pos.push(x - tz * wv * 0.5 + tx * lean, y, z + tx * wv * 0.5 + tz * lean, x + tz * wv * 0.5 + tx * lean, y, z - tx * wv * 0.5 + tz * lean);
    const dropK = drop || (i && rib[i - 1][3] && Math.abs(rib[i - 1][1] - y) > 0.01) ? 1 : 0;
    att.push(along, 0, dropK, 1, along, 1, dropK, 1);
    if (i) { const v = (i - 1) * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aRib', new THREE.Float32BufferAttribute(att, 4));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

// the tall fall: from the lip, arcing out, down to the pond
function curtainGeometry(F) {
  const pos = [], att = [], idx = [];
  const ROWS = 26, COLS = 9;
  const z0 = F.z - 0.05, drop = F.top - F.bottom;
  for (let r = 0; r <= ROWS; r++) {
    const s = r / ROWS;
    const y = F.top - drop * s;
    const z = z0 + (F.land - z0) * Math.sqrt(s) * 0.92 + Math.sin(s * 9) * 0.04;
    const wv = F.w * (0.85 + s * 0.35);
    for (let c = 0; c <= COLS; c++) {
      const u = c / COLS;
      const bulge = Math.sin(u * Math.PI) * 0.12;
      pos.push(F.x - wv / 2 + u * wv, y, z + bulge);
      att.push(s * drop, u, 1, 1.3);
    }
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const a = r * (COLS + 1) + c, b = a + COLS + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aRib', new THREE.Float32BufferAttribute(att, 4));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

// ------------------------------------------------------------------ the system
export class RiverFX {
  constructor(world) {
    this.world = world;
    const g = world.grid;
    const wu = world.waterUniforms;
    this.group = new THREE.Group();
    this.group.name = 'riverFX';
    world.scene.add(this.group);
    const mk = (curtain) => new THREE.ShaderMaterial({
      uniforms: { uTime: wu.uTime, uShallow: wu.uShallow, uDeep: wu.uDeep, uSkyTint: wu.uSkyTint, uFoam: wu.uFoam, uNight: wu.uNight, uCurtain: { value: curtain ? 1 : 0 } },
      vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG, side: THREE.DoubleSide,
    });
    this.ribbonMat = mk(false);
    this.curtainMat = mk(true);
    // streams on high ground
    this.drops = []; // where water lands (mist / spray)
    for (const S of STREAMS) {
      try {
        const rib = ribbonPoints(world, S);
        if (rib.length < 2) continue;
        const m = new THREE.Mesh(ribbonGeometry(rib, S.w * 2), this.ribbonMat);
        m.renderOrder = 9;
        m.name = 'stream:' + S.id;
        this.group.add(m);
        for (let i = 1; i < rib.length; i++) if (rib[i][3] && rib[i - 1][3] && rib[i - 1][1] - rib[i][1] > 0.6) this.drops.push({ x: rib[i][0], y: rib[i][1], z: rib[i][2], k: Math.min(1, (rib[i - 1][1] - rib[i][1]) / 4) });
        const last = rib[rib.length - 1];
        if (!S.fall) this.drops.push({ x: last[0], y: Math.max(WATER_Y, last[1]), z: last[2], k: 0.5 });
      } catch (e) { console.warn('stream', S.id, e); }
    }
    // the Mistfall curtain
    const F = WATERFALL;
    this.curtain = new THREE.Mesh(curtainGeometry(F), this.curtainMat);
    this.curtain.renderOrder = 13;
    this.curtain.name = 'mistfall';
    this.group.add(this.curtain);
    this.drops.push({ x: F.x, y: WATER_Y, z: F.land, k: 1, big: true });
    this.buildParticles();
    this.buildRocks();
  }

  buildParticles() {
    const origin = [], seed = [];
    for (const d of this.drops) {
      const nMist = d.big ? 46 : Math.round(4 + d.k * 8), nSpray = d.big ? 90 : Math.round(3 + d.k * 8);
      for (let k = 0; k < nMist; k++) { origin.push(d.x + (hash2(k, 1, d.x * 7) - 0.5) * (d.big ? 2.4 : 0.4), d.y + 0.05, d.z + (hash2(k, 2, d.z * 7) - 0.5) * (d.big ? 1.2 : 0.3)); seed.push(hash2(k, 3, d.x * 13 + d.z), 0, d.big ? 1.5 : 0.35, d.big ? 1.0 : 0.45); }
      for (let k = 0; k < nSpray; k++) { origin.push(d.x + (hash2(k, 4, d.x * 7) - 0.5) * (d.big ? 2.6 : 0.3), d.y + 0.02, d.z + (hash2(k, 5, d.z * 7) - 0.5) * (d.big ? 0.8 : 0.2)); seed.push(hash2(k, 6, d.x * 17 + d.z), 1, d.big ? 0.75 : 0.22, d.big ? 0.12 : 0.07); }
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(new Float32Array(origin), 3));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seed), 4));
    geo.instanceCount = origin.length / 3;
    this.mistU = { uMistCol: { value: new THREE.Color(0.92, 0.96, 1.0) } };
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.world.waterUniforms.uTime, uCamRight: SPRITE_UNIFORMS.uCamRight, uCamUp: SPRITE_UNIFORMS.uCamUp, ...this.mistU },
      vertexShader: PART_VERT, fragmentShader: PART_FRAG, depthWrite: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = 14;
    m.name = 'mistSpray';
    this.group.add(m);
    this.particles = m;
  }

  // rocks the river runs round (the white water behind them is in the water shader)
  buildRocks() {
    const W = this.world;
    const rocks = W.grid.riverRocks || [];
    if (!rocks.length) return;
    const { tex } = W.natureFrames();
    const B = new SpriteBatch(tex, { max: rocks.length * 2 + 4, lit: true, castShadow: false, receiveShadow: true, renderOrder: 9, name: 'riverRocks' });
    for (const [x, z, s] of rocks) {
      const f = W.frame(`riverrock_${Math.floor(hash2(Math.floor(x * 3), Math.floor(z * 3), 7) * 3)}`) || W.frame('rock_1');
      if (f) B.push(f, x, WATER_Y - 0.08, z, { texels: 24, scale: 0.8 + s * 0.35, flip: hash2(Math.floor(x), Math.floor(z), 9) > 0.5 });
    }
    B.commit();
    this.group.add(B.mesh);
    this.rockBatch = B;
  }

  update(sky) {
    if (sky?.state) {
      const n = sky.state.night || 0;
      this.mistU.uMistCol.value.setRGB(0.94 - n * 0.55, 0.97 - n * 0.5, 1.0 - n * 0.4);
    }
  }
}
