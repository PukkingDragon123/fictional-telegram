// Tiny pixel-exact particles for the title screen: each point is an s x s
// block of low-res pixels addressed in the painted backdrop's own pixel
// coordinates (x right, y down, origin at the top-left of the visible frame),
// so sparks, steam, birds, fireflies and leaves sit on the same grid as the
// pixel-art layers. One draw call per system; positions are written on the CPU.
//
//   const P = new PixelPoints(200, { order: 30 });   scene.add(P.mesh)
//   P.begin(); P.add(x, y, 0xffeeaa, 1); P.end(lw, lh);   // every frame
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec3 aCol;
attribute float aSize;
uniform vec2 uLow;   // visible low-res size (lw, lh)
varying vec3 vCol;
void main() {
  vec2 rt = uLow + 2.0; // the render target keeps a 1 px margin all round
  float s = aSize;
  float tx = floor(position.x) + 1.0;
  float tb = uLow.y - floor(position.y) - s + 1.0;
  gl_Position = vec4((tx + s * 0.5) / rt.x * 2.0 - 1.0, (tb + s * 0.5) / rt.y * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = s;
  vCol = aCol;
}
`;
const FRAG = /* glsl */ `
varying vec3 vCol;
void main() { gl_FragColor = vec4(vCol, 1.0); }
`;

export class PixelPoints {
  constructor(max = 256, { order = 0, additive = false, name = 'pixelPoints' } = {}) {
    this.max = max;
    this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.uniforms = { uLow: { value: new THREE.Vector2(1, 1) } };
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      depthTest: false, depthWrite: false, transparent: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Points(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.mesh.name = name;
    this._c = new THREE.Color();
  }

  begin() { this.n = 0; }

  // colour: hex number (sRGB) or [r, g, b] linear; k scales it (> 1 feeds the bloom)
  add(x, y, color, size = 1, k = 1) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = 0;
    if (typeof color === 'number') { this._c.setHex(color); this.col[i * 3] = this._c.r * k; this.col[i * 3 + 1] = this._c.g * k; this.col[i * 3 + 2] = this._c.b * k; }
    else { this.col[i * 3] = color[0] * k; this.col[i * 3 + 1] = color[1] * k; this.col[i * 3 + 2] = color[2] * k; }
    this.size[i] = size;
  }

  end(lw, lh) {
    this.uniforms.uLow.value.set(lw, lh);
    const g = this.geo;
    g.setDrawRange(0, this.n);
    for (const k of ['position', 'aCol', 'aSize']) g.getAttribute(k).needsUpdate = true;
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}
