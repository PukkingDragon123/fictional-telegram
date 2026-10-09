// [v26 resort] Building-breaking physics for rampages (game.breakage).
//
// When a bear smashes a build (StructureSystem.damage), chunks break off: voxel
// cubes, planks and shingles sampled from the build's own mesh (positions and
// vertex colours), so a red booth sheds red-and-white bits and a cedar tub cedar
// staves. They fly with gravity, spin, bounce, skid to a stop, lie around for a
// few seconds and then sink away. One pooled InstancedMesh draws them all.
// A destroyed build also throws its named parts as rigid pieces (the booth's
// roof flies off, doors spin away), with dust, a SMASH! and a big screen shake;
// the hot tub bursts in a wave of water.
// Damaged builds look broken until repaired: chipped holes, dark cracks, a lean,
// a skewed roof and a sign hanging by one nail (brokenMat / pose, from tint()).
import * as THREE from 'three';
import { addGrain } from '../core/voxel.js';
import { KIND, WATER_Y } from '../world/grid.js';

const MAX = 720;
const G = 12;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Color(), _ax = new THREE.Vector3();
const FALLBACK = [0x8f5b2e, 0x6b4a2f, 0xc49060, 0x5a8a3a];

export class Breakage {
  constructor(game) {
    this.game = game;
    const mat = addGrain(new THREE.MeshLambertMaterial({ color: 0xffffff }));
    mat.customProgramCacheKey = () => 'grain0.13+chunks';
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this.mesh.name = 'debris';
    game.scene.add(this.mesh);
    this.n = 0;
    const F = (k) => new Float32Array(MAX * k);
    this.p = F(3); this.v = F(3); this.q = F(4); this.ax = F(3); this.w = F(1); this.sz = F(3); this.col = F(3); this.life = F(1); this.st = new Uint8Array(MAX);
    this.rigid = [];
    this.mats = [];
  }

  // ------------------------------------------------------------ spawning
  // world-space samples { x, y, z, r, g, b, k } from a build's lit meshes (k = height 0..1)
  sample(s, n, from = null, side = 0) {
    const out = [];
    const obj = s.obj;
    const meshes = [];
    let total = 0;
    obj?.updateMatrixWorld(true);
    obj?.traverse((o) => {
      if (!o.isMesh || !o.visible || o.userData.glass || !o.geometry?.attributes?.position) return;
      const c = o.geometry.attributes.color;
      if (!c) return;
      const n0 = o.geometry.attributes.position.count;
      meshes.push({ o, n0 }); total += n0;
    });
    const by = this.game.structures.baseY(s);
    const [fw, fd] = s.def.size || [1, 1];
    let top = by + 0.6;
    if (meshes.length) { const bb = new THREE.Box3().setFromObject(obj); top = Math.max(by + 0.2, bb.max.y); }
    for (let k = 0; k < n * 3 && out.length < n; k++) {
      if (!total) {
        out.push({ x: s.x + Math.random() * fw, y: by + 0.1 + Math.random() * 0.5, z: s.z + Math.random() * fd, ...rgbOf(FALLBACK[k % FALLBACK.length]), k: Math.random() });
        continue;
      }
      let r = Math.random() * total, m = meshes[0];
      for (const q of meshes) { r -= q.n0; if (r <= 0) { m = q; break; } }
      const a = m.o.geometry.attributes, i = Math.floor(Math.random() * m.n0);
      _v.fromBufferAttribute(a.position, i).applyMatrix4(m.o.matrixWorld);
      // prefer the side the bear hit
      if (from && side > 0 && k < n * 2) {
        const dx = _v.x - (s.x + fw / 2), dz = _v.z - (s.z + fd / 2), fx = from.x - (s.x + fw / 2), fz = from.z - (s.z + fd / 2);
        if (dx * fx + dz * fz < 0 && Math.random() < side) continue;
      }
      out.push({ x: _v.x, y: _v.y, z: _v.z, r: a.color.getX(i), g: a.color.getY(i), b: a.color.getZ(i), k: (_v.y - by) / Math.max(0.2, top - by) });
    }
    return out;
  }

  spawn(x, y, z, vx, vy, vz, sx, sy, sz, r, g, b, life = 7) {
    if (this.n >= MAX) this.kill(0);
    const i = this.n++;
    const p = this.p, v = this.v, q = this.q;
    p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
    v[i * 3] = vx; v[i * 3 + 1] = vy; v[i * 3 + 2] = vz;
    _q.setFromEuler(new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28));
    q[i * 4] = _q.x; q[i * 4 + 1] = _q.y; q[i * 4 + 2] = _q.z; q[i * 4 + 3] = _q.w;
    _ax.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    this.ax[i * 3] = _ax.x; this.ax[i * 3 + 1] = _ax.y; this.ax[i * 3 + 2] = _ax.z;
    this.w[i] = 6 + Math.random() * 14;
    this.sz[i * 3] = sx; this.sz[i * 3 + 1] = sy; this.sz[i * 3 + 2] = sz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.life[i] = life + Math.random() * 3;
    this.st[i] = 0;
    return i;
  }

  kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (const [a, k] of [[this.p, 3], [this.v, 3], [this.q, 4], [this.ax, 3], [this.sz, 3], [this.col, 3]]) for (let c = 0; c < k; c++) a[i * k + c] = a[j * k + c];
    this.w[i] = this.w[j]; this.life[i] = this.life[j]; this.st[i] = this.st[j];
  }

  // chunks from samples: shingles off the top, planks from woody bits, cubes otherwise
  burst(samples, from, power = 1) {
    for (const q of samples) {
      let dx = q.x - from.x, dz = q.z - from.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d; dz /= d;
      const sp = (1.4 + Math.random() * 2.6) * power;
      const woody = q.r > q.g * 1.05 && q.g > q.b * 1.05 && q.r < 0.75;
      let sx, sy, sz;
      if (q.k > 0.72 && Math.random() < 0.6) { sx = 0.14 + Math.random() * 0.08; sy = 0.03; sz = 0.1 + Math.random() * 0.06; }
      else if (woody && Math.random() < 0.55) { sx = 0.26 + Math.random() * 0.22; sy = 0.045; sz = 0.08; }
      else { const c = 0.05 + Math.random() * 0.09; sx = c; sy = c * (0.7 + Math.random() * 0.6); sz = c; }
      this.spawn(q.x, q.y, q.z, dx * sp + (Math.random() - 0.5), 2.2 + Math.random() * 3.6 * power, dz * sp + (Math.random() - 0.5), sx, sy, sz, q.r, q.g, q.b);
    }
  }

  // a bear's blow: bits fly off the side it hit, the build shows its wounds
  hit(s, amt = 1, from = null) {
    if (!s || s.removed) return;
    const game = this.game;
    from ||= this.attacker(s);
    const n = Math.min(18, 6 + Math.round(amt * 3));
    this.burst(this.sample(s, n, from, 0.8), from, 0.8);
    const [fw, fd] = s.def.size || [1, 1];
    game.particles.puff(s.x + fw / 2, game.structures.baseY(s) + 0.25, s.z + fd / 2, 6, 0.32);
    game.audio.play('rs_crack', { volume: 0.45, pitch: 0.8 + Math.random() * 0.3 });
  }

  // destroyed: the whole build comes apart
  shatter(s, from = null) {
    if (!s) return;
    const game = this.game;
    from ||= this.attacker(s);
    const [fw, fd] = s.def.size || [1, 1];
    const cx = s.x + fw / 2, cz = s.z + fd / 2, by = game.structures.baseY(s);
    const n = Math.min(90, 28 + fw * fd * 12);
    this.burst(this.sample(s, n), { x: from.x * 0.4 + cx * 0.6, z: from.z * 0.4 + cz * 0.6 }, 1.25);
    // named parts fly off whole (roof, sign, door, turnstile...)
    const parts = s.extraModel?.userData?.rs?.parts || {};
    for (const [name, part] of Object.entries(parts)) {
      if (!part || name === 'closed' || name === 'clerk' || !part.parent) continue;
      if (!['roof', 'sign', 'door', 'door2', 'turnstile', 'top', 'curtain', 'flash', 'line'].includes(name)) continue;
      this.throwRigid(part, from, name === 'roof' ? 1.35 : 1);
    }
    // dust ring, comic word, shake
    for (let k = 0; k < 2; k++) game.particles.puff(cx, by + 0.2 + k * 0.4, cz, 10, 0.45 + k * 0.15);
    game.particles.dust(cx, by + 0.1, cz, 6);
    game.particles.word?.(Math.random() < 0.5 ? 'smash' : 'bam', cx, by + 1.6, cz, { size: 0.42, life: 1.1 });
    game.rig.shake = Math.max(game.rig.shake, 0.9 + fw * fd * 0.1);
    game.audio.play('rs_crash', { volume: 0.7, pitch: 0.85 + Math.random() * 0.2 });
    // special effects for the big ones
    if (s.type === 'rs_hottub') {
      game.particles.bigSplash?.(cx, cz);
      for (let k = 0; k < 4; k++) game.particles.splash(cx + (Math.random() - 0.5) * 1.4, cz + (Math.random() - 0.5) * 1.4, 14, 1.2);
      for (let k = 0; k < 26; k++) {
        const a = Math.random() * 6.28, sp = 1.5 + Math.random() * 2.5;
        game.particles.fx.spawn('drop', cx + Math.cos(a) * 0.6, by + 0.6, cz + Math.sin(a) * 0.6, { vx: Math.cos(a) * sp, vy: 2 + Math.random() * 3, vz: Math.sin(a) * sp, grav: 9, life: 1.4, size: 0.09, flags: 1, bright: true });
      }
      for (let k = 0; k < 6; k++) game.particles.smoke(cx + (Math.random() - 0.5), by + 0.6, cz + (Math.random() - 0.5));
      game.audio.play('bigsplash', { volume: 0.6 });
    }
    if (s.def.warm || s.type === 'rs_campfire') for (let k = 0; k < 5; k++) game.particles.smoke(cx + (Math.random() - 0.5) * 0.8, by + 0.4, cz + (Math.random() - 0.5) * 0.8);
  }

  throwRigid(obj, from, k = 1) {
    const game = this.game;
    obj.updateMatrixWorld(true);
    game.scene.attach(obj);
    obj.visible = true;
    let dx = obj.position.x - from.x, dz = obj.position.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    const sp = (1.6 + Math.random() * 1.6) * k;
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    this.rigid.push({ obj, vx: dx * sp, vy: (4.5 + Math.random() * 2.5) * k, vz: dz * sp, wx: (Math.random() - 0.5) * 9, wy: (Math.random() - 0.5) * 7, wz: (Math.random() - 0.5) * 9, life: 9 + Math.random() * 3, settled: false, s0: obj.scale.x });
  }

  attacker(s) {
    const [fw, fd] = s.def.size || [1, 1];
    const cx = s.x + fw / 2, cz = s.z + fd / 2;
    let best = null, bd = 9;
    for (const b of this.game.bears.list) {
      if (!b.visible) continue;
      const d = (b.x - cx) ** 2 + (b.z - cz) ** 2;
      if (d < bd && (b.angry || b.hostile || b.state === 'smash')) { bd = d; best = b; }
    }
    return best ? { x: best.x, z: best.z } : { x: cx + (Math.random() - 0.5), z: cz + 1 };
  }

  groundAt(x, z) {
    const g = this.game.grid;
    const tx = Math.floor(x), tz = Math.floor(z);
    if (!g.inb(tx, tz)) return { y: 0, water: false };
    const i = tz * g.w + tx;
    if (g.kind[i] === KIND.WATER && !this.game.paths?.isDeck?.(tx, tz)) return { y: WATER_Y, water: true };
    const dk = this.game.paths?.deckY?.(tx, tz);
    return { y: dk ?? g.surfaceAtVisual(x, z), water: false };
  }

  // ------------------------------------------------------------ simulation
  update(dt) {
    if (!dt) { this.draw(); return; }
    dt = Math.min(dt, 0.05);
    const p = this.p, v = this.v, q = this.q;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); i--; continue; }
      if (this.st[i] === 1) continue;
      v[i * 3 + 1] -= G * dt;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      // tumble round the spin axis
      _q.set(q[i * 4], q[i * 4 + 1], q[i * 4 + 2], q[i * 4 + 3]);
      _ax.set(this.ax[i * 3], this.ax[i * 3 + 1], this.ax[i * 3 + 2]);
      _q2.setFromAxisAngle(_ax, this.w[i] * dt);
      _q.premultiply(_q2);
      q[i * 4] = _q.x; q[i * 4 + 1] = _q.y; q[i * 4 + 2] = _q.z; q[i * 4 + 3] = _q.w;
      const gr = this.groundAt(p[i * 3], p[i * 3 + 2]);
      const half = this.sz[i * 3 + 1] * 0.5 + 0.01;
      if (p[i * 3 + 1] < gr.y + half && v[i * 3 + 1] < 0) {
        if (gr.water) {
          if (Math.random() < 0.5) this.game.particles.splash(p[i * 3], p[i * 3 + 2], 3, 0.35);
          this.game.world?.sim?.disturb?.(p[i * 3], p[i * 3 + 2], 0.2, 0.1);
          this.kill(i); i--; continue;
        }
        p[i * 3 + 1] = gr.y + half;
        v[i * 3 + 1] *= -0.32;
        v[i * 3] *= 0.55; v[i * 3 + 2] *= 0.55;
        this.w[i] *= 0.55;
        if (Math.abs(v[i * 3 + 1]) < 0.7 && Math.hypot(v[i * 3], v[i * 3 + 2]) < 0.5) {
          // settle: lie flat, keep a random yaw
          this.st[i] = 1;
          _q.setFromAxisAngle(_v.set(0, 1, 0), Math.random() * 6.28);
          q[i * 4] = _q.x; q[i * 4 + 1] = _q.y; q[i * 4 + 2] = _q.z; q[i * 4 + 3] = _q.w;
          this.life[i] = Math.min(this.life[i], 4 + Math.random() * 3);
        }
      }
    }
    for (let k = this.rigid.length - 1; k >= 0; k--) {
      const r = this.rigid[k], o = r.obj;
      r.life -= dt;
      if (r.life <= 0) { o.parent?.remove(o); this.rigid.splice(k, 1); continue; }
      if (r.life < 1) { o.scale.setScalar(r.s0 * Math.max(0.01, r.life)); o.position.y -= dt * 0.15; }
      if (r.settled) continue;
      r.vy -= G * dt;
      o.position.x += r.vx * dt; o.position.y += r.vy * dt; o.position.z += r.vz * dt;
      o.rotation.x += r.wx * dt; o.rotation.y += r.wy * dt; o.rotation.z += r.wz * dt;
      const gr = this.groundAt(o.position.x, o.position.z);
      if (o.position.y < gr.y && r.vy < 0) {
        if (gr.water) { this.game.particles.splash(o.position.x, o.position.z, 12, 0.9); r.life = Math.min(r.life, 0.6); r.vx *= 0.2; r.vz *= 0.2; r.vy = -0.4; r.settled = true; continue; }
        o.position.y = gr.y;
        r.vy *= -0.3; r.vx *= 0.5; r.vz *= 0.5; r.wx *= 0.4; r.wy *= 0.4; r.wz *= 0.4;
        this.game.particles.dust(o.position.x, gr.y, o.position.z, 3);
        if (Math.abs(r.vy) < 1) { r.settled = true; r.life = Math.min(r.life, 5 + Math.random() * 2); o.rotation.x *= 0.2; o.rotation.z *= 0.2; }
      }
    }
    this.draw();
  }

  draw() {
    const m = this.mesh, col = m.instanceColor.array;
    for (let i = 0; i < this.n; i++) {
      const t = this.life[i];
      const k = this.st[i] === 1 && t < 1 ? Math.max(0.02, t) : 1; // settled bits shrink away at the end
      _p.set(this.p[i * 3], this.p[i * 3 + 1] - (1 - k) * 0.05, this.p[i * 3 + 2]);
      _q.set(this.q[i * 4], this.q[i * 4 + 1], this.q[i * 4 + 2], this.q[i * 4 + 3]);
      _s.set(this.sz[i * 3] * k, this.sz[i * 3 + 1] * k, this.sz[i * 3 + 2] * k);
      _m.compose(_p, _q, _s);
      m.setMatrixAt(i, _m);
      col[i * 3] = this.col[i * 3]; col[i * 3 + 1] = this.col[i * 3 + 1]; col[i * 3 + 2] = this.col[i * 3 + 2];
    }
    m.count = this.n;
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------ the broken look
  level(s) {
    if (!s || s.maxHp >= 90 || s.hp >= s.maxHp * 0.99) return 0;
    const d = 1 - s.hp / s.maxHp;
    return d < 0.34 ? 1 : d < 0.67 ? 2 : 3;
  }

  // chipped (holes), cracked, slightly red: replaces the plain damaged tint
  brokenMat(s) {
    const lv = this.level(s);
    if (!lv) return null;
    if (this.mats[lv]) return this.mats[lv];
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, color: new THREE.Color(1, 0.84 - lv * 0.06, 0.8 - lv * 0.07) });
    const hole = [0, 0.07, 0.14, 0.22][lv], crack = [0, 0.018, 0.03, 0.045][lv];
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vBrkW;\nvarying vec3 vBrkN;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBrkW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvBrkN = normalize(mat3(modelMatrix) * objectNormal);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vBrkW;
varying vec3 vBrkN;
float brkH(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 cell = floor(vBrkW * 6.0 - vBrkN * 0.02);
  float h = brkH(cell);
  if (h < ${hole.toFixed(3)} && vBrkW.y > 0.12) discard;
  if (h < ${(hole + 0.1).toFixed(3)}) diffuseColor.rgb *= 0.62;
  vec3 q = floor(vBrkW * 20.0) / 20.0;
  float c1 = abs(fract(q.y * 1.7 + sin(q.x * 6.0 + q.z * 5.0) * 0.32) - 0.5);
  float c2 = abs(fract((q.x + q.z) * 1.3 + sin(q.y * 7.0) * 0.3) - 0.5);
  if (min(c1, c2) < ${crack.toFixed(3)}) diffuseColor.rgb *= 0.42;
}`);
    };
    addGrain(mat);
    mat.customProgramCacheKey = () => 'grain0.13+brk' + lv;
    this.mats[lv] = mat;
    return mat;
  }

  // lean + skewed parts by damage level (called from StructureSystem.tint)
  pose(s, dmg) {
    const o = s.obj;
    if (!o) return;
    const lv = dmg ? this.level(s) : 0;
    const h = ((s.seed || 1) * 2654435761 >>> 0) / 4294967296;
    const tilt = lv >= 2 ? 0.035 * (lv - 1) : 0;
    o.rotation.x = Math.cos(h * 6.28) * tilt;
    o.rotation.z = Math.sin(h * 6.28) * tilt;
    const parts = s.extraModel?.userData?.rs?.parts;
    if (!parts) return;
    const sg = h < 0.5 ? -1 : 1;
    if (parts.roof) { parts.roof.userData.rs0 ||= { y: parts.roof.position.y }; parts.roof.rotation.z = lv >= 2 ? sg * 0.09 * (lv - 1) : 0; parts.roof.rotation.x = lv >= 3 ? 0.08 : 0; parts.roof.position.y = parts.roof.userData.rs0.y - (lv >= 3 ? 0.06 : 0); }
    if (parts.sign) parts.sign.rotation.z = lv >= 1 ? -sg * (0.25 + 0.2 * lv) : 0;
    if (parts.door && !parts.door.userData.open) parts.door.rotation.y = lv >= 2 ? 0.5 : 0;
  }
}

function rgbOf(hex) { _c.setHex(hex); return { r: _c.r, g: _c.g, b: _c.b }; }
