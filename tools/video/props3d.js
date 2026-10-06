// 3D props + per-frame animation for the gig video's own scenes, built with the game's
// VoxelModel (pixel-textured voxels: every voxel gets its own shade, like the game's
// models) and staged in the title-pond diorama by tools/promo/stage.js, so they go
// through the game's pixel renderer (outlines, light, bloom). 2D pixel sprites (fish,
// icons, notes) float among the 3D models, the way the game mixes them.
//   const P = await import('/tools/video/props3d.js'); P.register();
//   ... stage setup with cast kinds 'globe' | 'jar' | 'coin' | 'books' | 'parcel' | ...
//   window.__v3d.tick(t)   (called from the clip's per-frame hook)
import * as THREE from 'three';
import { VoxelModel as VM, voxelMaterial } from '../../src/core/voxel.js';
import { registerProps, makeDragon, makeGrassBlock, fishSprite } from '../promo/stage.js';
import { ICONS, PAL } from '../../portfolio/icons.js';

const hsh = (x, y, z) => { let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const shade = (c, k) => { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255, f = (v) => Math.max(0, Math.min(255, Math.round(v * k))); return (f(r) << 16) | (f(g) << 8) | f(b); };
// pixel texture: a little per-voxel jitter in brightness
const tex = (c, x, y, z, amt = 0.12) => shade(c, 1 - amt / 2 + hsh(x, y, z) * amt);
function mesh(v, scale, glow = false) {
  const m = new THREE.Mesh(v.build({ pivot: [0, 0, 0], scale, ao: !glow }), glow ? new THREE.MeshBasicMaterial({ vertexColors: true }) : voxelMaterial());
  m.castShadow = !glow;
  return m;
}
const ease = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
const back = (u) => { u = Math.max(0, Math.min(1, u)); const c = 1.9, v = u - 1; return 1 + (c + 1) * v * v * v + c * v * v; };

// ---------------------------------------------------------------- the globe
// rough continents as ellipses in (lat, lon) degrees
const LAND = [
  [48, -100, 20, 32], [62, -150, 8, 18], [66, -95, 10, 30], [17, -93, 8, 10], [-15, -60, 22, 14], [-40, -68, 12, 6],
  [52, 15, 11, 24], [58, 80, 16, 60], [40, 95, 14, 30], [22, 78, 9, 8], [15, 102, 7, 5], [8, 100, 6, 2.5], [-3, 113, 4, 14], [-6, 140, 4, 8],
  [5, 20, 26, 18], [22, 10, 10, 25], [-25, 134, 10, 17], [72, -40, 8, 14], [36, 138, 6, 3], [54, -3, 4, 3], [64, 16, 6, 8], [-20, 47, 6, 3], [13, 44, 6, 6],
];
const isLand = (lat, lon) => lat < -68 || LAND.some(([a, o, ra, ro]) => { let d = lon - o; d = ((d + 540) % 360) - 180; return (((lat - a) / ra) ** 2 + (d / ro) ** 2) < 1; });
const DEG = Math.PI / 180;
export const latLon = (lat, lon, r = 1) => new THREE.Vector3(Math.cos(lat * DEG) * Math.sin(lon * DEG), Math.sin(lat * DEG), Math.cos(lat * DEG) * Math.cos(lon * DEG)).multiplyScalar(r);

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
function pinModel(c = 0xe84a3a) {
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
export function makeGlobe() {
  const R = 25, v = new VM();
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
  const S = 0.055, rad = R * S;
  const tilt = new THREE.Group(), spin = new THREE.Group();
  tilt.add(spin);
  spin.add(mesh(v, S));
  // clouds drifting round on their own shell
  const clouds = new THREE.Group();
  for (let k = 0; k < 9; k++) {
    const cv = new VM(), n = 3 + Math.floor(hsh(k, 1, 2) * 4);
    for (let i = 0; i < n; i++) cv.ellipsoid(i * 2.2 - n, hsh(k, i, 3) * 1.5, hsh(k, i, 4) * 2 - 1, 2.2, 1.4, 1.8, 0xffffff);
    const m = mesh(cv, S * 0.9);
    const p = latLon(hsh(k, 5, 6) * 120 - 60, hsh(k, 7, 8) * 360, rad + 0.18);
    m.position.copy(p); m.lookAt(p.clone().multiplyScalar(2));
    clouds.add(m);
  }
  spin.add(clouds);
  const TH = [15, 101], VAN = [49.3, -123.1];
  const pins = [TH, VAN].map(([a, o], i) => {
    const g = new THREE.Group(), p = latLon(a, o, rad);
    g.position.copy(p); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().normalize());
    const pm = pinModel(i ? 0xe84a3a : 0xffd23a); g.add(pm);
    const f = flag(i ? 'ca' : 'th'); f.position.set(0.12, 0, 0); g.add(f);
    g.scale.setScalar(0.001);
    spin.add(g);
    return g;
  });
  const plane = planeModel();
  spin.add(plane);
  const dots = [];
  for (let k = 0; k < 34; k++) { const d = new VM(); d.set(0, 0, 0, 0xffffff); const m = mesh(d, 0.045, true); m.visible = false; spin.add(m); dots.push(m); }
  const a = latLon(TH[0], TH[1]), b = latLon(VAN[0], VAN[1]);
  const along = (u) => { const q = new THREE.Vector3().copy(a).lerp(b, u).normalize(); return q.multiplyScalar(rad + 0.12 + Math.sin(u * Math.PI) * 0.55); };
  tilt.userData = {
    // t seconds: spin from Thailand to Vancouver, pins pop, the plane flies
    tick(t) {
      const u = ease((t - 0.6) / 3.4);
      const lon = 101 + (236.9 - 101) * u, lat = 15 + (49 - 15) * u;
      spin.rotation.y = -lon * DEG + Math.sin(t * 0.7) * 0.02;
      tilt.rotation.x = lat * DEG * 0.85 + 0.25;
      clouds.rotation.y = t * 0.06;
      pins[0].scale.setScalar(Math.max(0.001, back((t - 0.2) / 0.4)));
      pins[1].scale.setScalar(Math.max(0.001, back((t - 3.9) / 0.4)));
      const p = ease((t - 0.7) / 3.2);
      plane.visible = t > 0.7 && t < 4.4;
      const pos = along(p), nxt = along(Math.min(1, p + 0.02));
      plane.position.copy(pos);
      plane.up.copy(pos).normalize();
      plane.lookAt(nxt);
      dots.forEach((d, k) => { const w = k / dots.length; d.visible = w < p; d.position.copy(along(w)); });
    },
  };
  return tilt;
}

// ---------------------------------------------------------------- coin jar, coins, books
export function makeCoin() {
  const v = new VM();
  for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
    const d = Math.hypot(x, z);
    if (d > 5.4) continue;
    const rim = d > 4.2;
    v.set(x, 0, z, rim ? 0xc89020 : tex(0xffd23a, x, 0, z));
    v.set(x, 1, z, rim ? 0xe0a828 : (Math.abs(x) <= 1 && Math.abs(z) <= 2) || (Math.abs(z) <= 1 && Math.abs(x) <= 2 && x !== 0) ? 0xfff2a0 : tex(0xffc82a, x, 1, z));
  }
  return mesh(v, 0.03);
}
export function makeJar() {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.05, 14, 1, true), new THREE.MeshLambertMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
  glass.position.y = 0.55; glass.renderOrder = 20;
  g.add(glass);
  const v = new VM();
  for (let x = -15; x <= 15; x++) for (let z = -15; z <= 15; z++) {
    const d = Math.hypot(x, z);
    if (d <= 14.5) v.set(x, 0, z, tex(0xcfeaff, x, 0, z));
    if (d <= 15 && d > 12.5) { v.set(x, 35, z, 0xe8f6ff); v.set(x, 36, z, 0xcfe6f6); }
  }
  // the label: a pink paper band with a heart
  for (let a = -0.9; a <= 0.9; a += 0.06) for (let y = 12; y <= 20; y++) {
    const x = Math.round(Math.sin(a) * 15.2), z = Math.round(Math.cos(a) * 15.2);
    const heart = Math.abs(a) < 0.25 && y >= 14 && y <= 18 && (y < 17 || Math.abs(a) > 0.06);
    v.set(x, y, z, heart ? 0xe84a3a : y === 12 || y === 20 ? 0xd85a88 : 0xffb0c8);
  }
  g.add(mesh(v, 0.028));
  // cork lid leaning on the side
  const lid = new VM();
  for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) if (Math.hypot(x, z) <= 12) for (let y = 0; y < 4; y++) lid.set(x, y, z, tex(0xc89060, x, y, z, 0.2));
  const lm = mesh(lid, 0.028); lm.position.set(0.62, 0.32, 0.05); lm.rotation.z = 1.25; g.add(lm);
  // coins piling up inside
  const pile = new THREE.Group(); g.add(pile);
  g.userData = { pile, n: 0 };
  return g;
}
export function makeBooks() {
  const g = new THREE.Group();
  [[0x2f4ca8, 0], [0xe84a3a, 0.3], [0x4cc05a, -0.2]].forEach(([c, r], i) => {
    const v = new VM();
    for (let x = -9; x <= 9; x++) for (let y = 0; y < 4; y++) for (let z = -6; z <= 6; z++) {
      const page = x === 9 || z === 6 || z === -6 ? y > 0 && y < 3 && x > -9 : false;
      v.set(x, y, z, page ? 0xfff6e0 : tex(c, x, y, z));
    }
    const m = mesh(v, 0.035); m.position.y = i * 0.14; m.rotation.y = r; g.add(m);
  });
  // graduation cap
  const cap = new VM();
  for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) cap.set(x, 4, z, tex(0x1e1a2e, x, 4, z, 0.1));
  cap.box(-4, 0, -4, 4, 3, 4, 0x1e1a2e);
  for (let k = 0; k < 7; k++) cap.set(8, 4 - k, 8, 0xffd23a);
  cap.set(8, -3, 8, 0xfff2a0);
  const cm = mesh(cap, 0.035); cm.position.y = 0.45; cm.rotation.y = 0.4; cm.rotation.z = 0.12; g.add(cm);
  return g;
}
export function makeTable() {
  const v = new VM();
  for (let x = -26; x <= 26; x++) for (let z = -14; z <= 14; z++) for (let y = 18; y <= 20; y++) v.set(x, y, z, z % 5 === 0 ? 0x7a4a2a : tex(0xa86a3a, x, y, z, 0.18));
  for (const [x, z] of [[-23, -11], [23, -11], [-23, 11], [23, 11]]) v.box(x - 1, 0, z - 1, x + 1, 17, z + 1, 0x7a4a2a);
  return mesh(v, 0.035);
}

// ---------------------------------------------------------------- parcel with hinged flaps
export function makeParcel() {
  const W = 13, D = 10, H = 12, S = 0.07;
  const card = (x, y, z) => tex(0xc8955a, x, y, z, 0.16);
  const body = new VM();
  for (let x = -W; x <= W; x++) for (let y = 0; y <= H; y++) for (let z = -D; z <= D; z++) {
    if (!(Math.abs(x) === W || Math.abs(z) === D || y === 0)) continue;
    let c = Math.abs(x) === W || Math.abs(z) === D ? card(x, y, z) : 0x6a4422;
    if (z === D && x >= 3 && x <= 10 && y >= 3 && y <= 8) c = y === 3 || y === 8 ? 0x3b2414 : x < 6 && y > 5 ? 0x3b2414 : 0xfbf6ea;
    if (z === D && Math.abs(x) <= 1) c = 0xffd22e;
    body.set(x, y, z, c);
  }
  for (let x = -W + 1; x < W; x++) for (let z = -D + 1; z < D; z++) body.set(x, 1, z, 0x4a2e18);
  const g = new THREE.Group();
  g.add(mesh(body, S));
  // a glow inside, seen once the flaps open
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 * S, D * 2 * S), new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0 }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = (H - 0.5) * S; g.add(glow);
  const flaps = [];
  const flap = (w, d, axis, sign, px, pz) => {
    const v = new VM();
    for (let i = 0; i <= w; i++) for (let j = -d; j <= d; j++) {
      const tape = Math.abs(j) <= 1 && axis === 'x';
      v.set(axis === 'x' ? j : i * sign, 0, axis === 'x' ? i * sign : j, tape && i > w - 3 ? 0xffd22e : card(i, j, axis === 'x' ? 1 : 2));
    }
    const pivot = new THREE.Group(); pivot.position.set(px * S, (H + 0.5) * S, pz * S);
    pivot.add(mesh(v, S)); g.add(pivot);
    flaps.push({ pivot, axis, sign });
  };
  flap(D, W, 'x', -1, 0, D); flap(D, W, 'x', 1, 0, -D);
  flap(W, D, 'z', -1, W, 0); flap(W, D, 'z', 1, -W, 0);
  g.userData = {
    // 0 closed .. 1 wide open; shake before opening
    open(k, t) {
      for (const f of flaps) {
        const a = k * 2.3;
        if (f.axis === 'x') f.pivot.rotation.x = -f.sign * a; else f.pivot.rotation.z = f.sign * a;
      }
      glow.material.opacity = Math.max(0, k) * 0.9;
      g.rotation.z = k <= 0 ? Math.sin(t * 40) * 0.03 * Math.min(1, t) : 0;
    },
  };
  g.userData.open(0, 0);
  return g;
}

// ---------------------------------------------------------------- what-you-get items
function canvasSprite(cv, h) {
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, alphaTest: 0.5 }));
  s.scale.set((h * cv.width) / cv.height, h, 1);
  s.renderOrder = 12;
  return s;
}
function iconCanvas(name) {
  const rows = ICONS[name](), cv = document.createElement('canvas');
  cv.width = rows[0].length; cv.height = rows.length;
  const g = cv.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (PAL[ch]) { g.fillStyle = PAL[ch]; g.fillRect(x, y, 1, 1); } }));
  return cv;
}
function noteCanvas(c) {
  const rows = ['..kkkk', '..kaak', '..kk..', '..k...', 'kkk...', 'kaak..', 'kkk...'];
  const cv = document.createElement('canvas'); cv.width = 6; cv.height = 7;
  const g = cv.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') { g.fillStyle = ch === 'k' ? '#2a1a10' : c; g.fillRect(x, y, 1, 1); } }));
  return cv;
}
// 2D pixel art living in the 3D world: fish + icons orbiting
export function makePixelArt() {
  const g = new THREE.Group(), items = [];
  ['sockeye', 'goldfish', 'rainbow'].forEach((id) => { const s = fishSprite(id, 0.9, 0, 1); g.add(s); items.push(s); });
  ['heart', 'star', 'gamepad', 'bell', 'fox'].forEach((n) => { const s = canvasSprite(iconCanvas(n), 0.42); g.add(s); items.push(s); });
  g.userData.tick = (t) => items.forEach((s, k) => { const a = t * 0.9 + (k / items.length) * Math.PI * 2; s.position.set(Math.cos(a) * 0.95, 0.35 + Math.sin(a * 2) * 0.12 + (k % 2) * 0.25, Math.sin(a) * 0.5); });
  return g;
}
export function makeSpeaker() {
  const v = new VM();
  v.box(-7, 0, -6, 7, 20, 6, (x, y, z) => tex(0x3a3248, x, y, z, 0.1));
  for (const [cy, r] of [[7, 5], [16, 2.6]]) for (let x = -7; x <= 7; x++) for (let y = 0; y <= 20; y++) { const d = Math.hypot(x, y - cy); if (d <= r) v.set(x, y, 7, d > r - 1 ? 0x1e1a2e : d < 1.5 ? 0x2a2238 : tex(0x7a6aa0, x, y, 7)); }
  const g = new THREE.Group(), m = mesh(v, 0.04); g.add(m);
  const notes = [0xffd23a, 0xff7aa8, 0x8ad8ff].map((c) => { const cv = noteCanvas('#' + c.toString(16).padStart(6, '0')); const s = canvasSprite(cv, 0.32); g.add(s); return s; });
  g.userData.tick = (t) => {
    const beat = Math.max(0, Math.sin(t * Math.PI * 4)) ** 4;
    m.scale.set(1 + beat * 0.06, 1 - beat * 0.04, 1 + beat * 0.06);
    notes.forEach((s, k) => { const u = (t * 0.55 + k / 3) % 1; s.position.set(0.45 + Math.sin(u * 7 + k) * 0.18, 0.5 + u * 1.1, 0.2); s.material.opacity = 1 - u; });
  };
  return g;
}
export function makeMonitor() {
  const v = new VM();
  v.box(-14, 6, -2, 14, 26, 2, (x, y, z) => tex(0xd8d0c0, x, y, z, 0.1));
  v.box(-3, 2, -2, 3, 5, 2, 0x9a9088); v.box(-8, 0, -4, 8, 1, 4, 0xb0a898);
  for (let x = -12; x <= 12; x++) for (let y = 8; y <= 24; y++) v.set(x, y, 3, 0x1e1a2e);
  const g = new THREE.Group(); g.add(mesh(v, 0.04));
  const cv = document.createElement('canvas'); cv.width = 50; cv.height = 34;
  const ctx = cv.getContext('2d'), tx = new THREE.CanvasTexture(cv);
  tx.magFilter = tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false; tx.colorSpace = THREE.SRGBColorSpace;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(25 * 0.04, 17 * 0.04), new THREE.MeshBasicMaterial({ map: tx }));
  scr.position.set(0, 16 * 0.04, 3.6 * 0.04); g.add(scr);
  const L = [[['#c792ea', 6], ['#fff6e0', 8], ['#c3e88d', 7]], [['#c792ea', 5], ['#fff6e0', 5], ['#82aaff', 4], ['#ffcb6b', 5]], [['#fff6e0', 3], ['#82aaff', 6], ['#c3e88d', 8]], [['#c792ea', 3], ['#fff6e0', 9], ['#f78c6c', 3]], [['#fff6e0', 4], ['#82aaff', 7], ['#fff6e0', 4]], [['#c792ea', 6], ['#ffcb6b', 9]]];
  g.userData.tick = (t) => {
    ctx.fillStyle = '#1e1a2e'; ctx.fillRect(0, 0, 50, 34);
    let n = Math.floor((t % 4.5) * 34), cx = 2, cy = 2;
    L.forEach((ln, j) => { let x = 3 + (j % 3 === 2 ? 3 : 0); for (const [c, k] of ln) for (let i = 0; i < k; i++) { if (n-- <= 0) return; ctx.fillStyle = c; if (i % 6 !== 5) ctx.fillRect(x, 3 + j * 5, 1, 3); x++; cx = x; cy = 3 + j * 5; } });
    if (Math.floor(t * 3) % 2) { ctx.fillStyle = '#fff'; ctx.fillRect(cx + 1, cy, 2, 3); }
    tx.needsUpdate = true;
  };
  return g;
}

// ---------------------------------------------------------------- registration + driver
const ticks = [];
export function register() {
  registerProps({
    globe: () => makeGlobe(), jar: () => makeJar(), books: () => makeBooks(), table: () => makeTable(), parcel: () => makeParcel(),
    pixelart: () => makePixelArt(), speaker: () => makeSpeaker(), monitor: () => makeMonitor(), coin: () => makeCoin(),
    dragonS: () => makeDragon({ breath: 0.6 }), grass: () => makeGrassBlock(),
  });
}
window.__v3d = { tick(t, i) { for (const f of ticks) f(t, i); }, add(f) { ticks.push(f); }, ease, back };
export { THREE };
