// The opening of the portfolio: a pool of voxel cubes that flies in and snaps together into a
// chunky 3D "PUKKING" logo, then bursts apart and rebuilds into a new voxel model for every intro
// card (who I am, where I'm from, what I make, my goals). The models are the site's own pixel
// icons (icons.js) extruded into cubes; spare cubes drift around as a voxel snowfall. Rendered
// through the game's PixelRenderer + CameraRig, so it gets the same outlined pixel-art look.
//
//   const intro = new VoxelIntro(game, { steps, onDone, sfx });
//   intro.start();  per frame: intro.update(dt); renderer.render(intro.scene, intro.rig);
//   intro.go(i) / next() / prev(); intro.poke() bursts the model (it springs back)
import * as THREE from 'three';
import { CameraRig } from '../src/core/cameraRig.js';
import { ICONS, PAL } from './icons.js';

const N = 900; // cubes in the pool
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (u) => { u = clamp(u, 0, 1); return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2; };
const backOut = (u) => { u = clamp(u, 0, 1); const c = 1.4; return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2; };

// 5x7 block letters for the logo
const GLYPH = {
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#.#.#', '#..##', '#...#'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
};
const C = (hex) => new THREE.Color(hex);

// voxel model: [{ p: Vector3, c: Color }], centred on the origin
function logoModel(word) {
  const out = [];
  let x0 = 0;
  const cols = [];
  for (const ch of word) { const g = GLYPH[ch]; cols.push([g, x0]); x0 += g[0].length + 1; }
  const W = x0 - 1, H = 7, top = C('#ffe27a'), mid = C('#f7a531'), bot = C('#e8743b'), side = C('#7a3a16'), back = C('#4a2410');
  for (const [g, ox] of cols) g.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch !== '#') return;
    const y = H - 1 - j;
    const k = j / (H - 1);
    const face = k < 0.5 ? top.clone().lerp(mid, k * 2) : mid.clone().lerp(bot, (k - 0.5) * 2);
    for (let z = 0; z < 3; z++) out.push({ p: new THREE.Vector3(ox + i - (W - 1) / 2, y - (H - 1) / 2, 1 - z), c: z === 0 ? face : z === 1 ? side : back });
  }));
  return out;
}
function iconModel(name, depth = 3) {
  const rows = ICONS[name]();
  const out = [], h = rows.length, w = rows[0].length;
  rows.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch === '.' || !PAL[ch]) return;
    const base = C(PAL[ch]);
    for (let z = 0; z < depth; z++) {
      const c = z === 0 ? base : base.clone().multiplyScalar(ch === 'k' ? 1 : 0.8);
      out.push({ p: new THREE.Vector3(i - (w - 1) / 2, (h - 1) / 2 - j, (depth - 1) / 2 - z), c });
    }
  }));
  return out;
}

export class VoxelIntro {
  constructor(game, { steps, sfx = () => {} }) {
    this.game = game;
    this.steps = steps;
    this.sfx = sfx;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#16111d');
    this.scene.add(new THREE.HemisphereLight(0xfff0dc, 0x3a2a4a, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-6, 10, 12); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffb070, 1.3); rim.position.set(8, 4, -10); this.scene.add(rim);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    const geo = new THREE.BoxGeometry(0.94, 0.94, 0.94);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, N);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    // a voxel island under the model
    const isl = new THREE.Group();
    const igeo = new THREE.BoxGeometry(1, 1, 1);
    const grass = new THREE.MeshLambertMaterial({ color: 0x5cb84c }), dirt = new THREE.MeshLambertMaterial({ color: 0x6b4220 });
    for (let x = -6; x <= 6; x++) for (let z = -3; z <= 3; z++) {
      if ((x / 6.5) ** 2 + (z / 3.5) ** 2 > 1) continue;
      const g = new THREE.Mesh(igeo, grass); g.position.set(x, 0, z); isl.add(g);
      const depth = 1 + Math.round(2.5 * (1 - Math.hypot(x / 6.5, z / 3.5)));
      for (let d = 1; d <= depth; d++) { const m = new THREE.Mesh(igeo, dirt); m.position.set(x, -d, z); isl.add(m); }
    }
    this.island = isl;
    this.scene.add(isl);
    // cube state
    this.cubes = Array.from({ length: N }, (_, i) => {
      const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 30;
      return {
        p: new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 50, Math.sin(a) * r - 20),
        from: new THREE.Vector3(), to: new THREE.Vector3(), mid: new THREE.Vector3(),
        c: C('#3a2a4a'), cFrom: C('#3a2a4a'), cTo: C('#3a2a4a'),
        s: 0, sFrom: 0, sTo: 0, t0: 0, dur: 1, spin: new THREE.Vector3(), q: new THREE.Quaternion(),
        off: new THREE.Vector3(), vel: new THREE.Vector3(), free: true, seed: Math.random() * 100, i,
      };
    });
    this.models = steps.map((s) => (s.logo ? logoModel(s.logo) : iconModel(s.icon)));
    this.rig = new CameraRig();
    this.rig.freeBounds = true;
    this.rig.minWupp = 0.001; this.rig.maxWupp = 10;
    this.rig.pitch = this.rig.pitchGoal = THREE.MathUtils.degToRad(18);
    this.rig.dist = 120;
    this.time = 0;
    this.step = -1;
    this.pointer = { x: 0, y: 0 };
    this._m = new THREE.Matrix4(); this._e = new THREE.Euler(); this._sv = new THREE.Vector3();
  }

  start() { this.go(0); }

  // where on screen the model sits: left half on wide screens, upper half on tall ones
  layout() {
    const r = this.game.renderer, W = r.rtW || 320, H = r.rtH || 180;
    const wide = W / H > 1.15;
    const m = this.models[this.step] || this.models[0];
    let w = 1, h = 1;
    for (const v of m) { w = Math.max(w, Math.abs(v.p.x) * 2 + 2); h = Math.max(h, Math.abs(v.p.y) * 2 + 2); }
    h += 7; // the island
    const fitW = wide ? W * 0.44 : W * 0.86, fitH = wide ? H * 0.62 : H * 0.36;
    const wupp = Math.max(w / fitW, h / fitH);
    // shift the view so the model lands in its half of the screen
    const sx = wide ? 0.25 * W * wupp : 0, sy = wide ? 0 : -0.24 * H * wupp;
    return { wupp, sx, sy, wide };
  }

  go(i) {
    i = clamp(i, 0, this.steps.length - 1);
    if (i === this.step) return;
    const first = this.step < 0;
    this.step = i;
    const model = this.models[i];
    const now = this.time;
    // match cubes to voxels by height so the stream flows bottom-up
    const order = this.cubes.slice().sort((a, b) => (a.p.y - b.p.y) || (a.p.x - b.p.x));
    const targets = model.slice().sort((a, b) => (a.p.y - b.p.y) || (a.p.x - b.p.x));
    order.forEach((c, k) => {
      c.from.copy(c.p); c.cFrom.copy(c.c); c.sFrom = c.s;
      c.t0 = now + (first ? 0.15 + Math.random() * 1.1 : 0.05 + (k / order.length) * 0.55 + Math.random() * 0.25);
      c.dur = first ? 1.1 + Math.random() * 0.5 : 0.85 + Math.random() * 0.35;
      c.spin.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
      if (k < targets.length) {
        const v = targets[k];
        c.free = false;
        c.to.copy(v.p).add(new THREE.Vector3(0, 6.5, 0));
        c.cTo.copy(v.c); c.sTo = 1;
      } else {
        // spare cube: drift around as a slow voxel snowfall
        c.free = true;
        const a = Math.random() * Math.PI * 2, r = 16 + Math.random() * 22;
        c.to.set(Math.cos(a) * r, (Math.random() - 0.3) * 30, Math.sin(a) * r - 6);
        c.cTo.copy(C(['#ffe27a', '#f08a1a', '#9ad8ff', '#a77ad8', '#ff7aa8'][k % 5])).multiplyScalar(0.55);
        c.sTo = 0.22 + Math.random() * 0.25;
      }
      // the path bows outwards: an explosion that re-forms
      c.mid.copy(c.from).lerp(c.to, 0.5).add(new THREE.Vector3((Math.random() - 0.5) * 22, 6 + Math.random() * 14, (Math.random() - 0.5) * 22));
    });
    this.sfx(first ? 'whoosh' : 'build_cloud', { volume: 0.4 });
    setTimeout(() => this.sfx('place', { volume: 0.35, pitch: 1.2 }), first ? 1200 : 750);
    this._lay = this.layout();
  }
  next() { this.go(this.step + 1); }
  prev() { this.go(this.step - 1); }

  // burst the model outwards; the springs pull every cube back
  poke(strength = 1) {
    for (const c of this.cubes) {
      if (c.free) continue;
      const d = this._sv.copy(c.to).sub(new THREE.Vector3(0, 6.5, 0));
      const l = d.length() || 1;
      c.vel.add(d.multiplyScalar((18 * strength) / l)).add(new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 10, (Math.random() - 0.5) * 8));
    }
    this.sfx('pop_in', { volume: 0.4, pitch: 0.8 });
  }

  setPointer(nx, ny) { this.pointer.x = nx; this.pointer.y = ny; }

  update(dt) {
    this.time += dt;
    const t = this.time, m = this._m, e = this._e;
    const col = this.mesh.instanceColor;
    for (const c of this.cubes) {
      const u = (t - c.t0) / c.dur;
      if (u >= 0) {
        const k = ease(u), a = 1 - k;
        // quadratic bezier through the bowed midpoint
        c.p.set(a * a * c.from.x + 2 * a * k * c.mid.x + k * k * c.to.x, a * a * c.from.y + 2 * a * k * c.mid.y + k * k * c.to.y, a * a * c.from.z + 2 * a * k * c.mid.z + k * k * c.to.z);
        c.c.copy(c.cFrom).lerp(c.cTo, clamp(u * 1.4, 0, 1));
        c.s = c.sFrom + (c.sTo - c.sFrom) * (c.free ? k : backOut(u));
      }
      // springy offset (pokes), and a gentle idle wave once settled
      c.vel.addScaledVector(c.off, -60 * dt);
      c.vel.multiplyScalar(Math.exp(-5 * dt));
      c.off.addScaledVector(c.vel, dt);
      const settled = u >= 1;
      let wx = c.p.x + c.off.x, wy = c.p.y + c.off.y, wz = c.p.z + c.off.z;
      if (settled && !c.free) wy += Math.sin(t * 2.2 + c.to.x * 0.35) * 0.18;
      if (c.free) { wy += Math.sin(t * 0.5 + c.seed) * 1.5; wx += Math.cos(t * 0.3 + c.seed) * 1.2; }
      const r = settled && !c.free ? 0 : 1 - clamp(u, 0, 1);
      e.set(c.spin.x * r + (c.free ? t * 0.6 + c.seed : 0), c.spin.y * r + (c.free ? t * 0.4 : 0), c.spin.z * r);
      c.q.setFromEuler(e);
      const s = Math.max(0.0001, c.s);
      m.compose(this._sv.set(wx, wy, wz), c.q, new THREE.Vector3(s, s, s));
      this.mesh.setMatrixAt(c.i, m);
      col.setXYZ(c.i, c.c.r, c.c.g, c.c.b);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    col.needsUpdate = true;
    // the model (and its island) turns slowly, leaning towards the pointer
    const turn = Math.sin(t * 0.45) * 0.38 + this.pointer.x * 0.35;
    this.group.rotation.y = turn;
    this.island.rotation.y = turn;
    this.island.position.y = -0.5 + Math.sin(t * 1.1) * 0.25;
    this.group.position.y = Math.sin(t * 1.1) * 0.25;
    // camera
    const L = this._lay || this.layout();
    const rig = this.rig;
    rig.wuppGoal = L.wupp;
    if (rig.wupp > 1 || this._snap !== true) { rig.wupp = L.wupp; this._snap = true; }
    const yaw = -0.18 + this.pointer.x * 0.06;
    rig.yawGoal = yaw;
    rig.pitchGoal = THREE.MathUtils.degToRad(16 + this.pointer.y * 6);
    // screen-right in world units for the current yaw
    const cy = Math.cos(rig.yaw), sy = Math.sin(rig.yaw);
    rig.goal.set(cy * L.sx, 4 + L.sy, -sy * L.sx);
    if (!this._placed) { rig.target.copy(rig.goal); rig.yaw = yaw; this._placed = true; }
    rig.update(dt, this.game.renderer);
  }

  refit() { this._lay = this.layout(); }
}
