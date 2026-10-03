// [v18 bear events] Voxel models for the defense builds (src/data/structuresDefense.js).
// Loaded by StructureSystem through import.meta.glob('../entities/extra/*.js').
//
//   STRUCTURE_MODELS[type]({ variant, seed, preview }) -> THREE.Group
//     Root at the ground centre of the tile, 1 tile = 1 unit (0.1 voxels), not rotated
//     (StructureSystem sets noRotate for extra models), so local axes = world axes.
//     Lit meshes share voxelMaterial() and carry userData.tintable (damage tint).
//   Extra hooks (read by src/game/Defense.js, all optional):
//     root.userData.update(dt, t)      idle anims (scarecrow sway, beaver bob, nozzle spin-down)
//     honeytrap  .setCharges(n)        puddle size 3 / 2 / 1 / 0 (dry stain)
//     nettrap    .setArmed(bool)       net spread on the ground vs rolled up (re-arming)
//     watchtower .throwAt(angle)       the beaver winds up and lobs a pinecone (yaw, world)
//                .setStunned(bool)     dizzy beaver (after a boss ground slam)
//                .muzzle               Object3D: where pinecones leave the beaver's paw
//     sprinklercannon .aim(angle) .fire() .muzzle
import * as THREE from 'three';
import { VoxelModel, voxelMaterial } from '../../core/voxel.js';

const S = 0.1;
const GEO = new Map();
const geo = (key, fn) => {
  let g = GEO.get(key);
  if (!g) { const v = new VoxelModel(); fn(v); g = v.build({ pivot: [0, 0, 0], scale: S }); GEO.set(key, g); }
  return g;
};
const hash = (x, y, z) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const tone = (arr, x, y, z) => arr[Math.floor(hash(x, y, z) * arr.length) % arr.length];
function mesh(g, shadow = true) {
  const m = new THREE.Mesh(g, voxelMaterial());
  m.castShadow = shadow; m.receiveShadow = true; m.userData.tintable = true;
  return m;
}

const WOOD = [0xa8784a, 0xb48452, 0x9a6a3e];
const WOOD_D = 0x6a4424, WOOD_L = 0xd8b07a, BARK = [0x7a4e2a, 0x8a5a30, 0x6a4424];
const STONE = [0x9a968c, 0x8a867e, 0xaaa69a, 0x7e7a72];
const IRON = 0x3a3a44, IRON_L = 0x5a5a66, BRASS = 0xd8a840, BRASS_D = 0xa87820;
const HONEY = [0xe8a020, 0xf0b030, 0xd89018], HONEY_L = 0xffe080;
const ROPE = [0xd8c090, 0xc8b080, 0xe4cc9c];
const STRAW = [0xe8c860, 0xd8b450, 0xf0d470];

// a 2-voxel-wide line (stake / beam) from a to b; fn(t) -> colour
function stake(v, x0, y0, z0, x1, y1, z1, col, w = 2) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), 1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t), z = Math.round(z0 + (z1 - z0) * t);
    for (let k = 0; k < w; k++) v.set(x + k, y, z, typeof col === 'function' ? col(t, x + k, y, z) : col);
  }
}

// ------------------------------------------------------------------ spiky barricade
function barricade() {
  const root = new THREE.Group();
  root.add(mesh(geo('barricade', (v) => {
    // a log beam along x on two X-shaped trestles, sharpened stakes bristling out front and back
    const col = (t, x, y, z) => (t > 0.86 ? (t > 0.95 ? 0xe8dcc0 : WOOD_L) : tone(WOOD, x, y, z));
    for (const [x0, x1] of [[-5, -1], [1, 4]]) {
      stake(v, x0, 0, -1, x1, 8, -1, col, 1); stake(v, x0, 0, 0, x1, 8, 0, col, 1);
      stake(v, x1, 0, -1, x0, 8, -1, col, 1); stake(v, x1, 0, 0, x0, 8, 0, col, 1);
    }
    for (let x = -5; x <= 4; x++) for (let y = 4; y <= 5; y++) for (let z = -1; z <= 0; z++) v.set(x, y, z, x === -5 || x === 4 ? 0xd8a868 : tone(BARK, x, y, z));
    // horizontal spikes pointing out both ways (tips pale and sharp)
    for (const x of [-4, -1, 2]) for (const dir of [1, -1]) for (let k = 1; k <= 4; k++) {
      const z = dir > 0 ? k : -1 - k, y = 5 + Math.floor(k / 2);
      v.set(x, y, z, k === 4 ? 0xe8dcc0 : k === 3 ? WOOD_L : tone(WOOD, x, y, z));
      if (k <= 2) v.set(x + 1, y, z, tone(WOOD, x + 1, y, z));
    }
    // rope lashings at the crossings
    for (const x of [-3, 2]) { v.set(x, 4, 1, 0xd8c090); v.set(x, 5, 1, 0xc8b080); }
    for (const [x, z] of [[-3, 3], [1, -3], [3, 3]]) { v.set(x, 0, z, 0x6aa040); v.set(x, 1, z, 0x5a9038); }
  })));
  return root;
}

// ------------------------------------------------------------------ honey trap
const PUDDLE = [4.6, 3.6, 2.4];
function honeytrap() {
  const root = new THREE.Group();
  const puddles = PUDDLE.map((r, i) => {
    const m = mesh(geo('honey' + i, (v) => {
      for (let x = -5; x <= 4; x++)
        for (let z = -5; z <= 4; z++) {
          const d = Math.hypot((x + 0.5) / r, (z + 0.5 - 0.6) / (r * 0.85)) + (hash(x, 3, z) - 0.5) * 0.18;
          if (d > 1) continue;
          v.set(x, 0, z, d < 0.45 && hash(x, 1, z) < 0.35 ? HONEY_L : tone(HONEY, x, 0, z));
        }
    }), false);
    root.add(m);
    return m;
  });
  const dry = mesh(geo('honeydry', (v) => {
    for (let x = -3; x <= 2; x++) for (let z = -2; z <= 3; z++) if (hash(x, 9, z) < 0.55) v.set(x, 0, z, 0xb08850);
  }), false);
  root.add(dry);
  // a tipped-over clay honey pot with a dipper
  root.add(mesh(geo('honeypot', (v) => {
    for (let x = -1; x <= 2; x++)
      for (let y = 0; y <= 4; y++)
        for (let z = -5; z <= -2; z++) {
          const d = Math.hypot(x - 0.5, (y - 2) * 0.9, z + 3.5);
          if (d <= 2.4) v.set(x, y, z, y === 4 || z === -2 ? 0xc8783a : tone([0xb86a30, 0xa85e28, 0xc87a3a], x, y, z));
        }
    v.set(0, 2, -1, HONEY[1]); v.set(1, 2, -1, HONEY[0]); v.set(0, 1, -1, HONEY_L);
    stake(v, 3, 1, -4, 4, 5, -1, WOOD_D, 1);
  })));
  root.userData.charges = 3;
  root.userData.setCharges = (n) => {
    root.userData.charges = n;
    puddles.forEach((m, i) => { m.visible = n === 3 - i; });
    dry.visible = n <= 0;
  };
  root.userData.setCharges(3);
  return root;
}

// ------------------------------------------------------------------ scarecrow
function scarecrow() {
  const root = new THREE.Group();
  root.add(mesh(geo('scpost', (v) => {
    for (let y = 0; y <= 12; y++) for (let x = -1; x <= 0; x++) v.set(x, y, 0, tone(WOOD, x, y, 0));
    for (const [x, z] of [[-3, 2], [2, -2], [1, 3]]) { v.set(x, 0, z, 0x6aa040); v.set(x, 1, z, 0x5a9038); }
  })));
  const body = new THREE.Group();
  body.position.y = 0.6;
  root.add(body);
  body.add(mesh(geo('scbody', (v) => {
    const o = -6; // local y offset (body pivot sits at y = 6 voxels)
    // crossbar arms + flannel shirt
    for (let x = -5; x <= 4; x++) v.set(x, 10 + o, 0, tone(WOOD, x, 10, 0));
    for (let x = -3; x <= 2; x++)
      for (let y = 4; y <= 10; y++)
        for (let z = -1; z <= 1; z++) v.set(x, y + o, z, ((x + 10) % 3 === 0 || y === 7) ? 0x7a1a1a : 0xc0302a);
    for (let x = -5; x <= -4; x++) for (let y = 9; y <= 11; y++) v.set(x, y + o, 0, (y === 10) ? 0x7a1a1a : 0xc0302a);
    for (let x = 3; x <= 4; x++) for (let y = 9; y <= 11; y++) v.set(x, y + o, 0, (y === 10) ? 0x7a1a1a : 0xc0302a);
    // straw tufts at the cuffs and the waist
    for (const [x, y] of [[-6, 10], [-6, 9], [5, 10], [5, 11], [-2, 3], [0, 3], [1, 2], [-1, 2]]) v.set(x, y + o, 0, tone(STRAW, x, y, 0));
    // burlap head with a stitched face
    for (let x = -2; x <= 1; x++) for (let y = 11; y <= 15; y++) for (let z = -2; z <= 1; z++) {
      if ((x === -2 || x === 1) && (y === 11 || y === 15)) continue;
      v.set(x, y + o, z, tone([0xd8c49a, 0xccb88e, 0xe0ccA4], x, y, z));
    }
    v.set(-1, 13 + o, 2, 0x2a1a14); v.set(1, 13 + o, 2, 0x2a1a14); // button eyes
    for (let x = -1; x <= 1; x++) v.set(x, 12 + o, 2, x === 0 ? 0x2a1a14 : 0x5a3a24); // stitched grin
    // floppy straw hat
    for (let x = -4; x <= 3; x++) for (let z = -3; z <= 2; z++) v.set(x, 16 + o, z, tone(STRAW, x, 16, z));
    for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) { v.set(x, 17 + o, z, tone(STRAW, x, 17, z)); v.set(x, 18 + o, z, x === -2 || x === 1 ? STRAW[1] : STRAW[0]); }
    for (let x = -2; x <= 1; x++) v.set(x, 17 + o, 2, 0x8a3a2a);
    // a crow friend
    v.set(4, 12 + o, 0, 0x1a1a22); v.set(4, 13 + o, 0, 0x1a1a22); v.set(4, 13 + o, 1, 0xe8a020);
  })));
  root.userData.update = (dt, t) => {
    body.rotation.z = Math.sin(t * 1.3) * 0.05;
    body.rotation.y = Math.sin(t * 0.7) * 0.12;
  };
  return root;
}

// ------------------------------------------------------------------ net trap
function nettrap() {
  const root = new THREE.Group();
  root.add(mesh(geo('netbase', (v) => {
    for (const [x, z] of [[-5, -5], [4, -5], [-5, 4], [4, 4]]) { v.set(x, 0, z, WOOD_D); v.set(x, 1, z, tone(WOOD, x, 1, z)); v.set(x, 2, z, WOOD_L); }
    // trigger plate
    for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) v.set(x, 0, z, 0x8a8a92);
  })));
  const spread = mesh(geo('netspread', (v) => {
    for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) if ((x + 10) % 2 === 0 || (z + 10) % 2 === 0) { if (x >= -1 && x <= 0 && z >= -1 && z <= 0) continue; v.set(x, 0, z, tone(ROPE, x, 0, z)); }
    for (let x = -4; x <= 3; x++) { v.set(x, 0, -5, 0xb89a60); v.set(x, 0, 4, 0xb89a60); }
  }), false);
  const rolled = mesh(geo('netroll', (v) => {
    for (let x = -3; x <= 2; x++) for (let y = 0; y <= 1; y++) for (let z = -5; z <= -4; z++) v.set(x, y, z, tone(ROPE, x, y, z));
    v.set(-4, 0, -5, 0xb89a60); v.set(3, 0, -5, 0xb89a60);
  }));
  root.add(spread, rolled);
  root.userData.setArmed = (on) => { spread.visible = !!on; rolled.visible = !on; };
  root.userData.setArmed(true);
  return root;
}

// ------------------------------------------------------------------ watchtower
function beaverParts() {
  const body = geo('twbeaver', (v) => {
    // sits facing +z at the platform centre (local origin = beaver's seat)
    for (let x = -2; x <= 1; x++) for (let y = 0; y <= 4; y++) for (let z = -2; z <= 1; z++) {
      if ((x === -2 || x === 1) && (z === -2 || z === 1)) continue;
      v.set(x, y, z, z === 1 && y <= 3 && x >= -1 && x <= 0 ? 0xc89868 : tone([0x8a5a32, 0x7a4e2a, 0x9a6a3c], x, y, z));
    }
    for (let x = -2; x <= 1; x++) for (let y = 5; y <= 7; y++) for (let z = -1; z <= 2; z++) {
      if ((x === -2 || x === 1) && (y === 7 || z === 2)) continue;
      v.set(x, y, z, tone([0x8a5a32, 0x9a6a3c], x, y, z));
    }
    v.set(-1, 7, 2, 0x1a1210); v.set(0, 7, 2, 0x1a1210); // eyes
    v.set(-1, 5, 3, 0xf6f2ea); v.set(0, 5, 3, 0xf6f2ea); // teeth
    v.set(-1, 6, 3, 0x2a1a14); v.set(0, 6, 3, 0x2a1a14); // nose
    v.set(-2, 8, 0, 0x6a4424); v.set(1, 8, 0, 0x6a4424); // ears
    // helmet (a little acorn cap)
    for (let x = -2; x <= 1; x++) for (let z = -1; z <= 2; z++) v.set(x, 8, z, (x + z) % 2 ? 0x8a6a30 : 0x6a4a20);
    // flat tail behind
    for (let x = -1; x <= 0; x++) for (let z = -5; z <= -3; z++) v.set(x, 0, z, (x + z) % 2 ? 0x4a3a30 : 0x3a2a24);
  });
  const arm = geo('twarm', (v) => {
    for (let y = -3; y <= 0; y++) v.set(0, y, 0, 0x7a4e2a);
    v.set(0, -4, 0, 0x6a4a20); v.set(0, -4, 1, 0x5a3a18); v.set(1, -4, 0, 0x7a5a24); // pinecone in paw
  });
  return { body, arm };
}

function watchtower() {
  const root = new THREE.Group();
  root.add(mesh(geo('tower', (v) => {
    const H = 18;
    for (const [x, z] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) for (let y = 0; y <= H + 9; y++) {
      if (y > H + 3) break;
      v.set(x, y, z, y === 0 ? tone(STONE, x, y, z) : tone(BARK, x, y, z));
    }
    // diagonal braces
    stake(v, -4, 2, -3, -4, 12, 2, WOOD_D, 1); stake(v, 3, 2, 2, 3, 12, -3, WOOD_D, 1);
    stake(v, -3, 2, -4, 2, 12, -4, WOOD_D, 1);
    // deck
    for (let x = -5; x <= 4; x++) for (let z = -5; z <= 4; z++) v.set(x, H, z, (x + 10) % 3 === 0 ? 0x8a5a32 : tone(WOOD, x, H, z));
    // railing
    for (let x = -5; x <= 4; x++) for (const z of [-5, 4]) { v.set(x, H + 3, z, WOOD_L); if ((x + 10) % 3 === 0) { v.set(x, H + 1, z, WOOD_D); v.set(x, H + 2, z, WOOD_D); } }
    for (let z = -5; z <= 4; z++) for (const x of [-5, 4]) { v.set(x, H + 3, z, WOOD_L); if ((z + 10) % 3 === 0) { v.set(x, H + 1, z, WOOD_D); v.set(x, H + 2, z, WOOD_D); } }
    // a flagpole with a red pennant (no roof: you can see the beaver at work)
    for (let y = H + 1; y <= H + 12; y++) v.set(-5, y, -5, WOOD_D);
    for (let k = 0; k < 4; k++) for (let y = H + 9 + Math.ceil(k / 2); y <= H + 12 - Math.floor(k / 2); y++) v.set(-4 + k, y, -5, k === 3 ? 0xa82a22 : 0xd23a2e);
    // ladder on the front
    for (let y = 1; y < H; y++) { v.set(-2, y, 5, WOOD_D); v.set(1, y, 5, WOOD_D); if (y % 3 === 0) { v.set(-1, y, 5, WOOD_L); v.set(0, y, 5, WOOD_L); } }
    // pinecone basket on the deck
    for (let x = 2; x <= 3; x++) for (let z = -3; z <= -2; z++) { v.set(x, H + 1, z, 0xb08850); v.set(x, H + 2, z, (x + z) % 2 ? 0x6a4a20 : 0x5a3a18); }
  })));
  const P = beaverParts();
  const bv = new THREE.Group();
  bv.position.set(0, 1.9, 0);
  root.add(bv);
  const body = mesh(P.body);
  bv.add(body);
  const armPivot = new THREE.Group();
  armPivot.position.set(0.2, 0.55, 0.05);
  bv.add(armPivot);
  armPivot.add(mesh(P.arm, false));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0.05, 0.4, 0.2);
  armPivot.add(muzzle);
  root.userData.muzzle = muzzle;
  let throwT = 1, stunned = false, aim = 0;
  root.userData.throwAt = (angle) => { aim = angle; throwT = 0; };
  root.userData.setStunned = (on) => { stunned = !!on; };
  root.userData.update = (dt, t) => {
    throwT = Math.min(1, throwT + (dt || 0) / 0.45);
    // face the target, then a quick overhand lob
    const tgt = Math.PI / 2 - aim;
    bv.rotation.y += Math.atan2(Math.sin(tgt - bv.rotation.y), Math.cos(tgt - bv.rotation.y)) * Math.min(1, (dt || 0) * 10);
    const k = throwT < 0.35 ? -throwT / 0.35 * 2.4 : throwT < 0.55 ? -2.4 + (throwT - 0.35) / 0.2 * 3.6 : 1.2 * (1 - (throwT - 0.55) / 0.45);
    armPivot.rotation.x = k;
    bv.position.y = 1.9 + Math.abs(Math.sin(t * 2.2)) * 0.02;
    bv.rotation.z = stunned ? Math.sin(t * 9) * 0.25 : 0;
    body.rotation.x = stunned ? 0.3 : 0;
  };
  return root;
}

// ------------------------------------------------------------------ sprinkler cannon
function sprinklercannon() {
  const root = new THREE.Group();
  root.add(mesh(geo('cannonbase', (v) => {
    // cart
    for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) v.set(x, 2, z, tone(WOOD, x, 2, z));
    for (const x of [-5, 4]) for (const z of [-3, 2]) for (let y = 0; y <= 3; y++) for (let k = 0; k <= 1; k++) v.set(x, y, z + k, y === 0 || y === 3 ? IRON : 0x5a3a20);
    // rain barrel with iron hoops
    for (let y = 3; y <= 10; y++) for (let x = -3; x <= 2; x++) for (let z = -3; z <= 2; z++) {
      const r = Math.hypot(x + 0.5, z + 0.5);
      const R = 3 - Math.abs(y - 6.5) * 0.12;
      if (r > R) continue;
      v.set(x, y, z, y === 4 || y === 9 ? IRON : y === 10 ? 0x4a7ab0 : tone([0x7a5a3a, 0x8a6a42, 0x6a4a2e], x, y, z));
    }
    // brass valve wheel
    v.set(3, 6, 0, BRASS); v.set(4, 6, 0, BRASS_D); v.set(4, 7, 0, BRASS); v.set(4, 5, 0, BRASS);
  })));
  const turret = new THREE.Group();
  turret.position.set(0, 1.1, 0);
  root.add(turret);
  turret.add(mesh(geo('cannonnozzle', (v) => {
    for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) for (let y = 0; y <= 1; y++) v.set(x, y, z, BRASS_D);
    for (let z = 0; z <= 6; z++) for (let x = -1; x <= 0; x++) for (let y = 1; y <= 2; y++) v.set(x, y + Math.floor(z / 4), z, z >= 5 ? BRASS_D : BRASS);
    v.set(-1, 4, 7, 0x2a2a30); v.set(0, 4, 7, 0x2a2a30); v.set(-1, 3, 7, BRASS_D); v.set(0, 3, 7, BRASS_D);
  })));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.35, 0.75);
  turret.add(muzzle);
  root.userData.muzzle = muzzle;
  let want = 0, kick = 0;
  root.userData.aim = (angle) => { want = Math.PI / 2 - angle; };
  root.userData.fire = () => { kick = 1; };
  root.userData.update = (dt) => {
    const d = Math.atan2(Math.sin(want - turret.rotation.y), Math.cos(want - turret.rotation.y));
    turret.rotation.y += d * Math.min(1, (dt || 0) * 8);
    kick = Math.max(0, kick - (dt || 0) * 4);
    turret.position.x = -kick * 0.08 * Math.sin(turret.rotation.y);
    turret.position.z = -kick * 0.08 * Math.cos(turret.rotation.y);
  };
  return root;
}

// ------------------------------------------------------------------ bear-proof gate
function beargate() {
  const root = new THREE.Group();
  root.add(mesh(geo('beargate', (v) => {
    for (const x0 of [-5, 3]) for (let x = x0; x <= x0 + 1; x++) for (let y = 0; y <= 13; y++) for (let z = -2; z <= 1; z++)
      v.set(x, y, z, y === 13 ? 0xb8b4aa : tone(STONE, x, y, z));
    for (let x = -3; x <= 2; x++) for (let y = 1; y <= 11; y++) for (let z = -1; z <= 0; z++) {
      let c = (x + 10) % 2 ? 0x8a5a32 : 0x9a6a3a;
      if (y === 3 || y === 9) c = IRON;
      if ((y === 3 || y === 9) && (x === -2 || x === 1) && z === 0) c = IRON_L;
      v.set(x, y, z, c);
    }
    // spikes on top
    for (let x = -3; x <= 2; x++) { v.set(x, 12, -1, IRON); if ((x + 10) % 2 === 0) { v.set(x, 13, -1, IRON_L); v.set(x, 14, -1, 0xc8c8d0); } }
    // a paw-print "NO BEARS" plaque
    for (let x = -1; x <= 0; x++) for (let y = 5; y <= 7; y++) v.set(x, y, 1, 0xf0e6cc);
    v.set(-1, 6, 2, 0xc0302a); v.set(0, 6, 2, 0xc0302a); v.set(-1, 7, 2, 0xc0302a); v.set(0, 5, 2, 0xc0302a);
  })));
  return root;
}

export const STRUCTURE_MODELS = { barricade, honeytrap, scarecrow, nettrap, watchtower, sprinklercannon, beargate };

// small shared geometries for Defense.js effects
export function pineconeGeometry() {
  return geo('pinecone', (v) => {
    for (let y = 0; y <= 3; y++) for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) v.set(x, y, z, (x + y + z) % 2 ? 0x6a4a20 : 0x8a6030);
    v.set(0, 4, 0, 0x5a3a18);
  });
}
export function netGeometry() {
  return geo('bearnet', (v) => {
    // a dome of rope over a bear (unit size: scaled by the bear's scale)
    for (let x = -8; x <= 7; x++) for (let y = 0; y <= 14; y++) for (let z = -8; z <= 7; z++) {
      const d = Math.hypot((x + 0.5) / 8, y / 14, (z + 0.5) / 8);
      if (d > 1 || d < 0.88) continue;
      if ((x + 20) % 3 === 0 || (y + 20) % 3 === 0 || (z + 20) % 3 === 0) v.set(x, y, z, tone(ROPE, x, y, z));
    }
  });
}
