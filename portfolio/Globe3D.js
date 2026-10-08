// A voxel Earth for the intro's "Thailand -> Vancouver" card (adapted from the gig video's globe,
// tools/video/props3d.js): pixel-textured voxel continents, clouds on their own shell, a gold pin
// with the Thai flag and a red pin with the Canadian flag, and a little voxel plane that flies the
// dotted great-circle route between them, over and over. It turns from Thailand to face the
// middle of the route, so both pins stay in view.
//
//   const g = new Globe3D(); scene.add(g.root); g.root.scale.setScalar(6);
//   g.show(); per frame: g.update(dt, camera yaw, camera pitch);  g.hide();
//   g.markers(camera) -> [{ id, label, world: Vector3, front: bool }]
import * as THREE from 'three';
import { VoxelModel as VM, voxelMaterial } from '../src/core/voxel.js';

const DEG = Math.PI / 180;
const hsh = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const shade = (c, k) => { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255, f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return (f(r) << 16) | (f(g) << 8) | f(b); };
const tex = (c, x, y, z, amt = 0.12) => shade(c, 1 - amt / 2 + hsh(x, y, z) * amt);
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const ease = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const backOut = (u) => { u = clamp01(u); const c = 1.9, v = u - 1; return 1 + (c + 1) * v * v * v + c * v * v; };
export const latLon = (lat, lon, r = 1) => new THREE.Vector3(Math.cos(lat * DEG) * Math.sin(lon * DEG), Math.sin(lat * DEG), Math.cos(lat * DEG) * Math.cos(lon * DEG)).multiplyScalar(r);

// rough continents as ellipses in (lat, lon) degrees
const LAND = [
  [48, -100, 20, 32], [62, -150, 8, 18], [66, -95, 10, 30], [17, -93, 8, 10], [-15, -60, 22, 14], [-40, -68, 12, 6],
  [52, 15, 11, 24], [58, 80, 16, 60], [40, 95, 14, 30], [22, 78, 9, 8], [15, 102, 7, 5], [8, 100, 6, 2.5], [-3, 113, 4, 14], [-6, 140, 4, 8],
  [5, 20, 26, 18], [22, 10, 10, 25], [-25, 134, 10, 17], [72, -40, 8, 14], [36, 138, 6, 3], [54, -3, 4, 3], [64, 16, 6, 8], [-20, 47, 6, 3], [13, 44, 6, 6],
];
const isLand = (lat, lon) => lat < -68 || LAND.some(([a, o, ra, ro]) => { let d = lon - o; d = ((d + 540) % 360) - 180; return (((lat - a) / ra) ** 2 + (d / ro) ** 2) < 1; });

function mesh(v, scale, glow = false) {
  return new THREE.Mesh(v.build({ pivot: [0, 0, 0], scale, ao: !glow }), glow ? new THREE.MeshBasicMaterial({ vertexColors: true }) : voxelMaterial());
}
function flag(kind) {
  const v = new VM();
  for (let y = 0; y < 14; y++) v.set(0, y, 0, 0x5a3418);
  for (let x = 1; x <= 9; x++) for (let y = 8; y < 14; y++) {
    let c;
    if (kind === 'th') { const s = 13 - y; c = s === 0 || s === 5 ? 0xd8322a : s === 1 || s === 4 ? 0xfdfbf2 : 0x2f3c98; }
    else { c = x <= 2 || x >= 8 ? 0xd8322a : (x >= 4 && x <= 6 && y >= 9 && y <= 12) || (x === 5 && y === 13) ? 0xd8322a : 0xfdfbf2; }
    v.set(x, y, 0, c);
  }
  return mesh(v, 0.035);
}
function pinModel(c) {
  const v = new VM();
  v.ellipsoid(0, 8, 0, 3, 3, 3, (x, y, z) => (x === -1 && y === 9 && z === 2 ? 0xffffff : tex(c, x, y, z)));
  for (let y = 0; y < 5; y++) v.set(0, y, 0, 0x2a1a10);
  return mesh(v, 0.035);
}
function planeModel() {
  const v = new VM();
  for (let z = -6; z <= 6; z++) v.ellipsoid(0, 0, z, 1.6, 1.6, 0.6, (x, y) => (y > 0 && Math.abs(z) < 4 && z % 2 === 0 ? 0x5ab0e8 : 0xf4f6fa));
  v.set(0, 0, 7, 0xe84a3a);
  for (let x = -7; x <= 7; x++) for (let z = -1; z <= 1; z++) v.set(x, 0, z, Math.abs(x) > 5 ? 0xe84a3a : 0xdfe4ec);
  for (let x = -3; x <= 3; x++) v.set(x, 0, -6, 0xdfe4ec);
  for (let y = 1; y <= 4; y++) v.set(0, y, -6, 0xe84a3a);
  return mesh(v, 0.03);
}

const TH = [15, 101], VAN = [49.3, -123.1];
const START = { lat: 15, lon: 101 }, MID = { lat: 38, lon: 152 }; // faces Thailand, then the middle of the route
const DOTS = 30;

export class Globe3D {
  constructor() {
    const R = 25, S = 0.055, v = new VM();
    for (let x = -R; x <= R; x++) for (let y = -R; y <= R; y++) for (let z = -R; z <= R; z++) {
      const d = Math.hypot(x, y, z);
      if (d > R + 0.5 || d < R - 1.5) continue;
      const lat = Math.asin(y / d) / DEG, lon = Math.atan2(x, z) / DEG;
      let c;
      if (lat > 72 || lat < -66) c = tex(0xf2f6ff, x, y, z, 0.08);
      else if (isLand(lat, lon)) {
        const desert = (lat > 14 && lat < 32 && lon > -12 && lon < 55) || (lat < -20 && lat > -32 && lon > 118 && lon < 145);
        const snow = lat > 58 || (lat > 48 && lon > -128 && lon < -115);
        c = desert ? tex(0xe0c070, x, y, z) : snow && hsh(x, y, z) > 0.4 ? 0xf2f6ff : hsh(x, y, z) < 0.25 ? 0x3c8a3a : tex(0x5cb84c, x, y, z, 0.2);
      } else c = hsh(x, y, z) < 0.08 ? 0x6cb4f0 : tex(0x3f8fd8, x, y, z, 0.1);
      v.set(x, y, z, c);
    }
    this.radius = R * S;
    const rad = this.radius;
    this.root = new THREE.Group(); this.root.name = 'globe';
    this.pop = new THREE.Group(); // show / hide scale
    this.tilt = new THREE.Group();
    this.spin = new THREE.Group();
    this.root.add(this.pop); this.pop.add(this.tilt); this.tilt.add(this.spin);
    this.spin.add(mesh(v, S));
    // clouds drifting round on their own shell
    this.clouds = new THREE.Group();
    for (let k = 0; k < 9; k++) {
      const cv = new VM(), n = 3 + Math.floor(hsh(k, 1, 2) * 4);
      for (let i = 0; i < n; i++) cv.ellipsoid(i * 2.2 - n, hsh(k, i, 3) * 1.5, hsh(k, i, 4) * 2 - 1, 2.2, 1.4, 1.8, 0xffffff);
      const m = mesh(cv, S * 0.9);
      const p = latLon(hsh(k, 5, 6) * 120 - 60, hsh(k, 7, 8) * 360, rad + 0.18);
      m.position.copy(p); m.lookAt(p.clone().multiplyScalar(2));
      this.clouds.add(m);
    }
    this.spin.add(this.clouds);
    this.pins = [TH, VAN].map(([a, o], i) => {
      const g = new THREE.Group(), p = latLon(a, o, rad);
      g.position.copy(p); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().normalize());
      g.add(pinModel(i ? 0xe84a3a : 0xffd23a));
      const f = flag(i ? 'ca' : 'th'); f.position.set(0.12, 0, 0); g.add(f);
      g.scale.setScalar(0.001);
      this.spin.add(g);
      return g;
    });
    this.plane = planeModel();
    this.spin.add(this.plane);
    // the dotted route: chunky glowing dots, gold and white, so it reads at intro size
    const dotGeo = (c) => { const d = new VM(); d.set(0, 0, 0, c); return d.build({ pivot: [0.5, 0.5, 0.5], scale: 0.085, ao: false }); };
    const dotMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const geos = [dotGeo(0xffe27a), dotGeo(0xfff8e0)];
    this.dots = Array.from({ length: DOTS }, (_, i) => { const m = new THREE.Mesh(geos[i % 2], dotMat); m.visible = false; this.spin.add(m); return m; });
    const a = latLon(TH[0], TH[1]), b = latLon(VAN[0], VAN[1]);
    this._along = (u, out) => out.copy(a).lerp(b, u).normalize().multiplyScalar(rad + 0.12 + Math.sin(u * Math.PI) * 0.55);
    this._p = new THREE.Vector3(); this._n = new THREE.Vector3(); this._c = new THREE.Vector3(); this._d = new THREE.Vector3();
    this.t = 0;
    this.k = 0; // shown amount (0..1)
    this.on = false;
    this.root.visible = false;
  }

  show() { this.on = true; this.t = 0; this.root.visible = true; }
  hide() { this.on = false; }

  update(dt, camYaw = 0, camPitch = 0.3) {
    if (!this.root.visible) return;
    this.t += dt;
    const t = this.t;
    // pop in with a little overshoot, shrink away when hidden
    this.k = this.on ? backOut(Math.min(1, t / 0.7)) : Math.max(0, this.k - dt * 3.2);
    this.pop.scale.setScalar(Math.max(0.0001, this.k));
    if (!this.on && this.k <= 0) { this.root.visible = false; return; }
    // turn from Thailand to the middle of the route, then sway gently
    const u = ease((t - 0.5) / 3.4);
    const lat = START.lat + (MID.lat - START.lat) * u, lon = START.lon + (MID.lon - START.lon) * u + Math.sin(t * 0.5) * 4 * u;
    this.root.rotation.y = camYaw;
    this.tilt.rotation.x = lat * DEG - camPitch;
    this.spin.rotation.y = -lon * DEG;
    this.clouds.rotation.y = t * 0.05;
    this.pins[0].scale.setScalar(Math.max(0.001, backOut((t - 0.3) / 0.45)));
    this.pins[1].scale.setScalar(Math.max(0.001, backOut((t - 3.5) / 0.45)));
    // the plane: first flight 0.8..4.0 s, then again every 6 s
    const first = t < 4.6;
    const local = first ? t - 0.8 : (t - 4.6) % 6;
    const fly = first ? ease(local / 3.2) : ease(local / 3.4);
    const p = this._along(Math.min(1, fly), this._p), nx = this._along(Math.min(1, fly + 0.02), this._n);
    this.plane.visible = local > 0 && fly < 1;
    this.plane.position.copy(p);
    // nose along the route, belly to the ground (lookAt works in world space)
    this.root.updateMatrixWorld(true);
    const pw = this.spin.localToWorld(p.clone()), nw = this.spin.localToWorld(nx.clone());
    this.spin.getWorldPosition(this._c);
    this.plane.up.copy(pw).sub(this._c).normalize();
    this.plane.lookAt(nw);
    const trail = first ? fly : (local < 0.15 ? 1 : fly); // the trail stays drawn between flights
    this.dots.forEach((d, i) => { const w = i / DOTS; d.visible = w < trail; this._along(w, d.position); });
  }

  /** the two pins: world position, and whether they face the camera */
  markers(camera) {
    if (!this.root.visible || this.k < 0.5) return [];
    this.root.getWorldPosition(this._c);
    camera.getWorldDirection(this._d).negate();
    return this.pins.map((g, i) => {
      const w = new THREE.Vector3();
      g.getWorldPosition(w);
      const n = w.clone().sub(this._c).normalize();
      return { id: i ? 'van' : 'th', label: i ? 'Vancouver, Canada' : 'Thailand', world: w, front: n.dot(this._d) > 0.12 && g.scale.x > 0.6 };
    });
  }
}
