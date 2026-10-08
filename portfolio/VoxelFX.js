// Voxel effects inside the classroom, at the room's own voxel scale (0.05 units): little cubes that
// burst out of whatever you click, tumble, bounce on the floor and shrink away; a shower of
// gold-and-rainbow voxel confetti when a lesson is finished; and slow voxel dust drifting through
// the window light. One InstancedMesh for everything, drawn by the game's PixelRenderer like the
// rest of the room (so the cubes get the same ink outline).
//
//   const fx = new VoxelFX(room.room.group);
//   fx.burst(worldPos, { colors: ['#f08a1a', '#ffe27a'], n: 24 });  fx.confetti(worldPos);
//   per frame: fx.update(dt)
import * as THREE from 'three';

const N = 520; // cubes in the pool (bursts + dust)
const V = 0.05; // the classroom's voxel size
const DUST = 48;
// interior of the room (classroomScene.js): x -4.6..4.6, z -2.9..2.6, floor top at y = 0
const X0 = -4.5, X1 = 4.5, Z0 = -2.8, Z1 = 2.5;
export const RAINBOW = ['#ffe27a', '#e6a81c', '#f08a1a', '#e84a3a', '#ff7aa8', '#a77ad8', '#4aa0e8', '#5cb84c'];

export class VoxelFX {
  constructor(parent) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x3a2a1a });
    this.mesh = new THREE.InstancedMesh(geo, mat, N);
    this.mesh.name = 'voxelFX';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
    this.parts = Array.from({ length: N - DUST }, () => ({
      alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), spin: new THREE.Vector3(), rot: new THREE.Euler(),
      s: V, age: 0, life: 1, c: new THREE.Color(), grounded: 0,
    }));
    this.next = 0;
    // dust: tiny warm cubes floating in the light from the windows
    this.dust = Array.from({ length: DUST }, (_, i) => ({
      p: new THREE.Vector3(X0 + Math.random() * (X1 - X0), 0.3 + Math.random() * 2.6, Z0 + Math.random() * (Z1 - Z0 - 0.4)),
      seed: i * 1.7 + Math.random() * 10, s: V * (0.55 + Math.random() * 0.35),
      c: new THREE.Color(['#fff2c8', '#ffe27a', '#ffd6a0', '#f6e8ff'][i % 4]),
    }));
    this.dustOn = true;
    this.t = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._sv = new THREE.Vector3(); this._pv = new THREE.Vector3();
  }

  /** cubes pop out of `pos` (world), tumble, bounce on the floor and shrink away */
  burst(pos, { colors = RAINBOW, n = 22, speed = 1.5, up = 2.0, size = [1, 2], life = [1.2, 2.0], spread = 0.08 } = {}) {
    for (let k = 0; k < n; k++) {
      const q = this.parts[this.next];
      this.next = (this.next + 1) % this.parts.length;
      const a = Math.random() * Math.PI * 2, sp = speed * (0.35 + Math.random() * 0.75);
      q.alive = true;
      q.p.set(pos.x + (Math.random() - 0.5) * spread, pos.y + (Math.random() - 0.5) * spread, pos.z + (Math.random() - 0.5) * spread);
      q.v.set(Math.cos(a) * sp, up * (0.55 + Math.random() * 0.7), Math.sin(a) * sp * 0.8 + 0.25);
      q.spin.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
      q.rot.set(Math.random() * 3, Math.random() * 3, 0);
      q.s = V * (size[0] + Math.floor(Math.random() * (size[1] - size[0] + 1)));
      q.age = 0;
      q.life = life[0] + Math.random() * (life[1] - life[0]);
      q.grounded = 0;
      q.c.set(colors[(Math.random() * colors.length) | 0]);
    }
  }

  /** a celebration: a tall fountain of gold + rainbow voxels */
  confetti(pos, n = 70) {
    this.burst(pos, { colors: ['#ffe27a', '#ffe27a', '#e6a81c', ...RAINBOW], n, speed: 1.9, up: 3.6, size: [1, 2], life: [1.8, 2.8], spread: 0.2 });
  }

  update(dt) {
    this.t += dt;
    const m = this._m, q4 = this._q, S = this._sv;
    const col = this.mesh.instanceColor;
    let i = 0;
    for (const q of this.parts) {
      if (!q.alive) { m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, m); i++; continue; }
      q.age += dt;
      if (q.age >= q.life) q.alive = false;
      q.v.y -= 9 * dt;
      q.p.addScaledVector(q.v, dt);
      const h = q.s / 2;
      if (q.p.y < h) { // bounce on the floor, losing energy and spin each time
        q.p.y = h;
        if (q.v.y < 0) q.v.y *= -0.42;
        q.v.x *= 0.72; q.v.z *= 0.72; q.spin.multiplyScalar(0.55);
        if (Math.abs(q.v.y) < 0.25) { q.v.y = 0; q.grounded = 1; }
      }
      if (q.p.x < X0 || q.p.x > X1) { q.p.x = Math.min(X1, Math.max(X0, q.p.x)); q.v.x *= -0.5; }
      if (q.p.z < Z0 || q.p.z > Z1) { q.p.z = Math.min(Z1, Math.max(Z0, q.p.z)); q.v.z *= -0.5; }
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
      if (!this.dustOn) { m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, m); i++; continue; }
      d.p.y += dt * 0.06;
      if (d.p.y > 2.95) d.p.y = 0.25;
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
