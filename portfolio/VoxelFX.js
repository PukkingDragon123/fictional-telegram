// Voxel particles for the rooms, at the rooms' own voxel scale (0.05 units): little cubes that
// burst out of whatever you click, tumble, bounce on the floor and shrink away; gold-and-rainbow
// voxel confetti; chalk dust while the fox writes; voxel "Z"s floating up from a sleeping fox;
// and slow voxel dust drifting through the light. One InstancedMesh per room, drawn by the game's
// PixelRenderer like the rest of the room (so the cubes get the same ink outline).
//
//   const fx = new VoxelFX(room.group, { bounds: { x0: -4.5, x1: 4.5, z0: -2.8, z1: 2.5, y1: 2.9 } });
//   fx.burst(worldPos, { colors: ['#f08a1a', '#ffe27a'], n: 24 });  fx.confetti(worldPos);
//   fx.glyph(worldPos, ['###', '.#.', '###'], { color: '#cfc6ff' });   fx.setDust(colors)
//   per frame: fx.update(dt)
import * as THREE from 'three';

const V = 0.05; // the rooms' voxel size
export const RAINBOW = ['#ffe27a', '#e6a81c', '#f08a1a', '#e84a3a', '#ff7aa8', '#a77ad8', '#4aa0e8', '#5cb84c'];
const pick = (a) => a[(Math.random() * a.length) | 0];

export class VoxelFX {
  constructor(parent, { bounds = { x0: -4.5, x1: 4.5, z0: -2.8, z1: 2.5, y1: 2.9 }, dust = 48, dustColors = ['#fff2c8', '#ffe27a', '#ffd6a0', '#f6e8ff'], pool = 520 } = {}) {
    this.B = bounds;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x3a2a1a });
    this.N = pool + dust;
    this.mesh = new THREE.InstancedMesh(geo, mat, this.N);
    this.mesh.name = 'voxelFX';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.N * 3), 3);
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
    this.parts = Array.from({ length: pool }, () => ({
      alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), spin: new THREE.Vector3(), rot: new THREE.Euler(),
      s: V, age: 0, life: 1, c: new THREE.Color(), grounded: 0, g: 9, floor: true, sway: 0, seed: 0, drag: 0,
    }));
    this.next = 0;
    // dust: tiny cubes floating in the light
    const b = this.B;
    this.dust = Array.from({ length: dust }, (_, i) => ({
      p: new THREE.Vector3(b.x0 + Math.random() * (b.x1 - b.x0), 0.25 + Math.random() * (b.y1 - 0.4), b.z0 + Math.random() * (b.z1 - b.z0 - 0.3)),
      seed: i * 1.7 + Math.random() * 10, s: V * (0.5 + Math.random() * 0.35), c: new THREE.Color(),
    }));
    this.setDust(dustColors);
    this.dustOn = true;
    this.t = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._sv = new THREE.Vector3(); this._pv = new THREE.Vector3();
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  setDust(colors) { this.dust.forEach((d, i) => d.c.set(colors[i % colors.length])); }

  _spawn() { const q = this.parts[this.next]; this.next = (this.next + 1) % this.parts.length; return q; }

  /** cubes pop out of `pos` (world), tumble, bounce on the floor and shrink away */
  burst(pos, { colors = RAINBOW, n = 22, speed = 1.5, up = 2.0, size = [1, 2], life = [1.2, 2.0], spread = 0.08, gravity = 9, floor = true, sway = 0, drag = 0 } = {}) {
    for (let k = 0; k < n; k++) {
      const q = this._spawn();
      const a = Math.random() * Math.PI * 2, sp = speed * (0.35 + Math.random() * 0.75);
      q.alive = true;
      q.p.set(pos.x + (Math.random() - 0.5) * spread, pos.y + (Math.random() - 0.5) * spread, pos.z + (Math.random() - 0.5) * spread);
      q.v.set(Math.cos(a) * sp, up * (0.55 + Math.random() * 0.7), Math.sin(a) * sp * 0.8 + 0.25 * Math.min(1, speed));
      q.spin.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
      q.rot.set(Math.random() * 3, Math.random() * 3, 0);
      const s0 = size[0], s1 = size[1];
      q.s = V * (Number.isInteger(s0) && Number.isInteger(s1) ? s0 + Math.floor(Math.random() * (s1 - s0 + 1)) : s0 + Math.random() * (s1 - s0));
      q.age = 0;
      q.life = life[0] + Math.random() * (life[1] - life[0]);
      q.grounded = 0; q.g = gravity; q.floor = floor; q.sway = sway; q.drag = drag; q.seed = Math.random() * 10;
      q.c.set(pick(colors));
    }
  }

  /** a celebration: a tall fountain of gold + rainbow voxels */
  confetti(pos, n = 70) {
    this.burst(pos, { colors: ['#ffe27a', '#ffe27a', '#e6a81c', ...RAINBOW], n, speed: 1.9, up: 3.6, size: [1, 2], life: [1.8, 2.8], spread: 0.2 });
  }

  /** a tiny letter made of cubes that floats up and fades (rows: '#' = cube), e.g. a sleepy Z */
  glyph(pos, rows, { color = '#d8d0ff', vel = [0.06, 0.32, 0], life = 2.6, scale = 1 } = {}) {
    const h = rows.length;
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch !== '#') return;
      const q = this._spawn();
      q.alive = true;
      q.p.set(pos.x + (i - (row.length - 1) / 2) * V * scale, pos.y + (h - 1 - j) * V * scale, pos.z);
      q.v.set(vel[0], vel[1], vel[2]);
      q.spin.set(0, 0, 0); q.rot.set(0, 0, 0);
      q.s = V * scale * 0.96; q.age = 0; q.life = life; q.grounded = 0; q.g = 0; q.floor = false; q.sway = 0.18; q.drag = 0; q.seed = 0;
      q.c.set(color);
    }));
  }

  update(dt) {
    this.t += dt;
    const m = this._m, q4 = this._q, S = this._sv, B = this.B;
    const col = this.mesh.instanceColor;
    let i = 0;
    for (const q of this.parts) {
      if (!q.alive) { this.mesh.setMatrixAt(i++, this._zero); continue; }
      q.age += dt;
      if (q.age >= q.life) q.alive = false;
      q.v.y -= q.g * dt;
      if (q.drag) q.v.multiplyScalar(Math.exp(-q.drag * dt));
      q.p.addScaledVector(q.v, dt);
      if (q.sway) q.p.x += Math.cos(q.age * 3 + q.seed) * q.sway * dt;
      const h = q.s / 2;
      if (q.floor) {
        if (q.p.y < h) { // bounce on the floor, losing energy and spin each time
          q.p.y = h;
          if (q.v.y < 0) q.v.y *= -0.42;
          q.v.x *= 0.72; q.v.z *= 0.72; q.spin.multiplyScalar(0.55);
          if (Math.abs(q.v.y) < 0.25) { q.v.y = 0; q.grounded = 1; }
        }
        if (q.p.x < B.x0 || q.p.x > B.x1) { q.p.x = Math.min(B.x1, Math.max(B.x0, q.p.x)); q.v.x *= -0.5; }
        if (q.p.z < B.z0 || q.p.z > B.z1) { q.p.z = Math.min(B.z1, Math.max(B.z0, q.p.z)); q.v.z *= -0.5; }
      }
      if (q.grounded) { q.rot.x = Math.round(q.rot.x / (Math.PI / 2)) * (Math.PI / 2); q.rot.z = Math.round(q.rot.z / (Math.PI / 2)) * (Math.PI / 2); }
      else { q.rot.x += q.spin.x * dt; q.rot.y += q.spin.y * dt; q.rot.z += q.spin.z * dt; }
      // pop in, then shrink away at the end of its life
      const k = Math.min(1, q.age / 0.08) * Math.min(1, (q.life - q.age) / 0.35);
      const s = Math.max(0.0001, q.s * k);
      q4.setFromEuler(q.rot);
      m.compose(q.p, q4, S.set(s, s, s));
      this.mesh.setMatrixAt(i, m);
      col.setXYZ(i, q.c.r, q.c.g, q.c.b);
      i++;
    }
    for (const d of this.dust) {
      if (!this.dustOn) { this.mesh.setMatrixAt(i++, this._zero); continue; }
      d.p.y += dt * 0.06;
      if (d.p.y > B.y1) d.p.y = 0.25;
      const t = this.t + d.seed;
      const P = this._pv.set(d.p.x + Math.sin(t * 0.4) * 0.25, d.p.y + Math.sin(t * 0.9) * 0.05, d.p.z + Math.cos(t * 0.33) * 0.2);
      const tw = 0.6 + 0.4 * Math.sin(t * 2.3); // twinkle
      q4.setFromEuler(this._e.set(t * 0.7, t * 0.5, 0));
      const s = d.s * tw;
      m.compose(P, q4, S.set(s, s, s));
      this.mesh.setMatrixAt(i, m);
      col.setXYZ(i, d.c.r, d.c.g, d.c.b);
      i++;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    col.needsUpdate = true;
  }
}
