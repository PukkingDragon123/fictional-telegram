// Nests + eggs for the pond livestock: a cosy woven straw-and-reed ring on the
// ground, lined with down, room for up to 6 eggs. Fine 0.025 voxels, Lambert + grain.
// Nest geometry is shared (ref counted) per kind; egg geometry is memoised per kind / colour.
//
//   const n = makeNest('duck' | 'goose');  scene.add(n.root);   // origin at the ground centre
//   n.setEggs(4, { colors: [0xc8e0f0, null, ...] })  // 0..6 eggs, neatly arranged; colours optional (per egg or one hex)
//   n.setBrooding(true)   // puffed-up down around the rim + a few drifting down feathers
//   n.setGolden(i, true)  // egg i turns golden and twinkles
//   n.setHatching(i, true) // egg i rocks in little bursts (about to hatch)
//   n.eggPosition(i, out) // world position of egg i (its centre), e.g. to spawn a chick
//   n.update(dt); n.dispose();   // update drives the drifting down, egg wobble and gold twinkle (optional)
//   makeEggMesh('duck' | 'goose', { color, golden, upright }) -> THREE.Mesh, origin at the bottom centre
//
// A brooding Duck / Goose plays 'brood' with its root at the nest root (same position + yaw).
// Duck nest ~0.62 wide, rim 0.11 high; goose nest ~0.86 wide, rim 0.145 high (NEST_SIZE).
import * as THREE from 'three';
import { FV, VoxelModel, ell, tone, hash3, buildGeo, geoCache, matFor, grainMaterial, spriteMat, SPARK_ROWS, sin, cos, abs, max, min, PI, TAU, clamp, smooth } from './critterKit.js';

export const NEST_KINDS = ['duck', 'goose'];
export const NEST_SIZE = {
  duck: { radius: 0.31, rim: 0.11, eggs: 6 },
  goose: { radius: 0.43, rim: 0.145, eggs: 6 },
};
// eggs use half-size voxels (EV) so they come out properly egg-shaped; egg radii in EV units
const EV = FV / 2;
const NK = {
  duck: { R: 8.4, tube: 3.6, tubeY: 2.3, cy: 2.1, egg: [3.4, 3.0, 4.5], ring: 3.7 },
  goose: { R: 11.9, tube: 4.9, tubeY: 3.0, cy: 2.8, egg: [4.5, 4.1, 5.9], ring: 5.0 },
};
const COL = {
  straw: 0xdcb562, strawD: 0xb88c3c, strawL: 0xf0d27e, reed: 0xa8a454, reedD: 0x86843e, twig: 0x8a6438, twigD: 0x6a4a2a,
  floor: 0xb08a48, floorD: 0x94743a, down: 0xf6f2ea, downD: 0xdcd6cc, downL: 0xffffff,
};
const EGG = {
  duck: [0xe4ead0, 0xccd2b4, 0xf6f8e8], // pale green-cream
  goose: [0xf8f6ee, 0xe0dcd0, 0xffffff], // big white
  gold: [0xffcc30, 0xe0a018, 0xfff0a0],
};

// ------------------------------------------------------------------ models
function nestModel(k) {
  const v = new VoxelModel();
  const { R, tube, tubeY, cy } = k;
  const E = Math.ceil(R + tube + 1);
  for (let x = -E; x < E; x++)
    for (let z = -E; z < E; z++) {
      const r = Math.hypot(x + 0.5, z + 0.5);
      const th = Math.atan2(z + 0.5, x + 0.5);
      for (let y = 0; y <= cy + tubeY + 1; y++) {
        const dr = r - R, dy = (y + 0.5 - cy) * (tube / tubeY);
        const inRim = Math.hypot(dr, dy) <= tube;
        const inBase = y === 0 && r <= R + tube * 0.55;
        const inLining = y === 1 && r <= R - tube * 0.35;
        if (!inRim && !inBase && !inLining) continue;
        const h = hash3(x, y, z);
        let c;
        if (inRim) {
          // woven: diagonal bands of straw winding round the ring, a few reeds and twigs
          const band = Math.floor(th * R / 1.7 + y * 0.9 + dr * 0.5 + 99);
          c = (band & 1) ? COL.straw : COL.strawD;
          if (((band >> 1) & 3) === 0 && h < 0.5) c = COL.strawL;
          if (h < 0.07) c = COL.twig;
          else if (h > 0.93) c = COL.reed;
          else if (h > 0.9) c = COL.reedD;
          // down feathers tucked into the inner lip
          if (dr < -tube * 0.3 && dy > -tube * 0.2 && hash3(x * 3, y, z * 3) < 0.32) c = hash3(x, y, z * 7) < 0.3 ? COL.downD : COL.down;
        } else if (inLining) {
          c = h < 0.35 ? COL.down : h < 0.55 ? COL.downD : tone(x, y, z, COL.floor, COL.floorD, COL.straw, 0.2, 0.2);
        } else c = tone(x, y, z, COL.floor, COL.floorD, COL.strawD, 0.25, 0.1);
        v.set(x, y, z, c);
      }
    }
  // stray straws poking out of the rim
  for (let i = 0; i < Math.round(R * 1.4); i++) {
    const a = hash3(i, 3, 9) * TAU, up = hash3(i, 5, 1);
    const r0 = R + tube * 0.75;
    const n = 2 + Math.floor(hash3(i, 7, 7) * 3);
    const c = hash3(i, 1, 2) < 0.25 ? COL.reed : hash3(i, 1, 3) < 0.5 ? COL.strawL : COL.straw;
    for (let j = 0; j < n; j++) {
      const rr = r0 + j * 0.9, yy = Math.round(cy + tubeY * (0.2 + up * 0.6) + j * up * 0.7);
      v.set(Math.floor(cos(a + j * 0.05) * rr), yy, Math.floor(sin(a + j * 0.05) * rr), c);
    }
  }
  // a few straws laid across the top of the rim
  for (let i = 0; i < Math.round(R * 0.8); i++) {
    const a = hash3(i, 9, 4) * TAU, ty = Math.round(cy + tubeY);
    const da = 0.9 / R;
    for (let j = -1; j <= 1; j++) v.set(Math.floor(cos(a + j * da * 1.5) * R), ty, Math.floor(sin(a + j * da * 1.5) * R), (i & 1) ? COL.strawL : COL.straw);
  }
  return v;
}
// brooding: extra fluffed-up down around the inner lip of the rim
function puffModel(k) {
  const v = new VoxelModel();
  const { R, tube, tubeY, cy } = k;
  const rIn = R - tube * 0.55, top = Math.round(cy + tubeY);
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * TAU + hash3(i, 2, 2) * 0.05;
    if (hash3(i, 4, 4) < 0.35) continue;
    const r = rIn + hash3(i, 6, 1) * tube * 0.5;
    const x = Math.floor(cos(a) * r), z = Math.floor(sin(a) * r);
    const n = 1 + Math.floor(hash3(i, 8, 3) * 2);
    for (let j = 0; j < n; j++) v.set(x, top + j, z, hash3(i, j, 5) < 0.3 ? COL.downD : hash3(i, j, 6) < 0.3 ? COL.downL : COL.down);
    if (hash3(i, 9, 9) < 0.4) v.set(x + (hash3(i, 1, 1) < 0.5 ? 1 : -1), top, z, COL.down);
  }
  return v;
}
function featherModel() {
  const v = new VoxelModel();
  v.set(0, 0, 0, COL.downL); v.set(0, 1, 0, COL.down); v.set(1, 1, 0, COL.downD);
  return v;
}
/** Lying egg (long axis z) or upright egg, bottom at y = 0, centred on x / z. */
function eggModel([rx, ry, rz], [base, dark, light], upright) {
  const v = new VoxelModel();
  const RY = upright ? rz : ry, RZ = upright ? rx : rz;
  ell(v, 0, RY, 0, rx, RY, RZ, (x, y, z) => {
    // taper the pointed end (top when upright, +z when lying)
    const X = x + 0.5, Y = y + 0.5 - RY, Z = z + 0.5;
    const s = 1 - 0.16 * max(0, upright ? Y / RY : Z / RZ);
    const d = upright ? (X / (rx * s)) ** 2 + (Y / RY) ** 2 + (Z / (RZ * s)) ** 2 : (X / (rx * s)) ** 2 + (Y / (RY * s)) ** 2 + (Z / RZ) ** 2;
    if (d > 1.04) return null;
    if (Y < -RY * 0.45) return dark;
    if (Y > RY * 0.45 && X < 0.5 && Z >= -1) return light;
    return base;
  });
  return v;
}

// ------------------------------------------------------------------ geometry caches
const nestCaches = {};
function nestCache(kind) {
  return nestCaches[kind] || (nestCaches[kind] = geoCache(() => ({
    nest: buildGeo(nestModel(NK[kind]), [0, 0, 0], FV),
    puff: buildGeo(puffModel(NK[kind]), [0, 0, 0], FV),
    feather: buildGeo(featherModel(), [0.5, 0, 0.5], FV),
  })));
}
const eggMemo = new Map();
function eggGeo(kind, color, golden, upright = false) {
  const key = `${kind}|${golden ? 'gold' : color ?? 'def'}|${upright ? 1 : 0}`;
  let g = eggMemo.get(key);
  if (!g) {
    let pal = golden ? EGG.gold : EGG[kind];
    if (!golden && color != null) {
      const c = new THREE.Color(color), d = c.clone().multiplyScalar(0.86), l = c.clone().lerp(new THREE.Color(0xffffff), 0.5);
      pal = [c.getHex(), d.getHex(), l.getHex()];
    }
    g = buildGeo(eggModel(NK[kind].egg, pal, upright), [0, 0, 0], EV);
    eggMemo.set(key, g);
  }
  return g;
}
const goldMat = (geo) => grainMaterial(geo.userData.scale, geo.userData.grain, 0.06, 0x4a3000);

/** A single egg: THREE.Mesh, origin at the bottom centre (shared geometry: don't dispose it). */
export function makeEggMesh(kind = 'duck', { color = null, golden = false, upright = false, shadows = true } = {}) {
  kind = kind === 'goose' ? 'goose' : 'duck';
  const geo = eggGeo(kind, color, golden, upright);
  const m = new THREE.Mesh(geo, golden ? goldMat(geo) : matFor(geo, 0.05));
  m.name = 'Egg_' + kind;
  m.castShadow = shadows; m.receiveShadow = true;
  return m;
}

// egg layouts [x, z, yaw] in fine voxels (r = ring radius), for 1..6 eggs
function layout(n, r) {
  const ringN = n <= 4 ? n : n - 1;
  const out = [];
  if (n === 1) return [[0, 0, 0.4]];
  const rr = n === 2 ? r * 0.55 : n === 3 ? r * 0.7 : n === 4 ? r * 0.8 : r;
  for (let i = 0; i < ringN; i++) {
    const a = (i / ringN) * TAU + (n === 2 ? 0 : 0.35);
    out.push([cos(a) * rr, sin(a) * rr, -a + PI / 2 + (i & 1 ? 0.25 : -0.15)]);
  }
  if (n >= 5) out.push([0.3, -0.2, 1.1]);
  return out;
}

export function makeNest(kind = 'duck', { shadows = true } = {}) {
  kind = kind === 'goose' ? 'goose' : 'duck';
  const k = NK[kind];
  const cache = nestCache(kind);
  const G = cache.get();
  const root = new THREE.Group();
  root.name = 'Nest_' + kind;
  const nest = new THREE.Mesh(G.nest, matFor(G.nest, 0.1));
  nest.castShadow = shadows; nest.receiveShadow = true;
  root.add(nest);
  const puff = new THREE.Mesh(G.puff, matFor(G.puff, 0.06));
  puff.castShadow = shadows; puff.receiveShadow = true; puff.visible = false;
  root.add(puff);
  const feathers = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(G.feather, matFor(G.feather, 0.04));
    m.visible = false; m.castShadow = false;
    root.add(m);
    return { m, ph: i / 3, a: hash3(i, 3, kind.length) * TAU };
  });
  const eggsG = new THREE.Group();
  root.add(eggsG);
  const eggs = [];
  for (let i = 0; i < 6; i++) {
    const pivot = new THREE.Group(); // rocks about the egg's bottom
    const m = makeEggMesh(kind, { shadows });
    pivot.add(m); pivot.visible = false;
    eggsG.add(pivot);
    eggs.push({ pivot, m, golden: false, hatching: false, color: null, ht: hash3(i, 1, 9) * 3 });
  }
  const spark = new THREE.Sprite(spriteMat(SPARK_ROWS));
  spark.visible = false;
  root.add(spark);
  const floorY = 2 * FV - 0.004;
  let count = 0, brooding = false, time = 0;

  function refresh(i) {
    const e = eggs[i];
    const geo = eggGeo(kind, e.color, e.golden);
    e.m.geometry = geo;
    e.m.material = e.golden ? goldMat(geo) : matFor(geo, 0.05);
  }
  const api = {
    root, kind, eggs: eggs.map((e) => e.pivot),
    get count() { return count; },
    get brooding() { return brooding; },
    setEggs(n, { colors } = {}) {
      count = clamp(Math.round(n || 0), 0, 6);
      const L = count ? layout(count, k.ring) : [];
      eggs.forEach((e, i) => {
        e.pivot.visible = i < count;
        if (i >= count) return;
        const [x, z, yaw] = L[i];
        e.pivot.position.set(x * FV, floorY, z * FV);
        e.pivot.rotation.set(0, yaw, 0);
        // lean against the slope of the cup a little
        const r = Math.hypot(x, z);
        e.m.rotation.set(r > k.ring * 0.8 ? -0.12 : 0, 0, 0);
        const c = colors == null ? null : Array.isArray(colors) ? colors[i] ?? null : colors;
        if (colors !== undefined && c !== e.color) { e.color = c; refresh(i); }
      });
      api.update(0);
      return api;
    },
    setBrooding(on) { brooding = !!on; puff.visible = brooding; for (const f of feathers) f.m.visible = brooding; api.update(0); return api; },
    setGolden(i, on = true) { const e = eggs[i]; if (e && e.golden !== !!on) { e.golden = !!on; refresh(i); } api.update(0); return api; },
    setHatching(i, on = true) { const e = eggs[i]; if (e) { e.hatching = !!on; if (!on) e.pivot.rotation.z = e.pivot.rotation.x = 0; } return api; },
    eggPosition(i, out = new THREE.Vector3()) {
      const e = eggs[i];
      if (!e) return out.set(0, 0, 0);
      root.updateWorldMatrix(true, false);
      return out.set(e.pivot.position.x, e.pivot.position.y + k.egg[1] * EV, e.pivot.position.z).applyMatrix4(root.matrixWorld);
    },
    update(dt) {
      dt = dt || 0;
      time += dt;
      // brooding: down feathers drift up off the rim
      if (brooding) {
        for (const f of feathers) {
          const u = (time * 0.22 + f.ph) % 1;
          const a = f.a + u * 0.8, r = (k.R - k.tube * 0.2) * FV;
          f.m.position.set(cos(a) * r + sin(u * 9) * 0.02, (k.cy + k.tubeY) * FV + u * 0.28, sin(a) * r);
          f.m.rotation.set(sin(u * 11) * 0.6, u * 6, sin(u * 7) * 0.5);
          f.m.scale.setScalar(u < 0.15 ? u / 0.15 : u > 0.75 ? max(0.01, (1 - u) / 0.25) : 1);
        }
        puff.scale.set(1, 1 + sin(time * 1.6) * 0.04, 1);
      }
      // hatching eggs rock in little bursts
      for (let i = 0; i < count; i++) {
        const e = eggs[i];
        if (!e.hatching) continue;
        const u = (time + e.ht) % 1.6;
        const burst = u < 0.5 ? sin((u / 0.5) * PI) : 0;
        e.pivot.rotation.z = sin(time * 30) * 0.22 * burst;
        e.pivot.rotation.x = sin(time * 23 + 1) * 0.08 * burst;
      }
      // golden eggs twinkle
      let gi = -1, ng = 0;
      for (let i = 0; i < count; i++) if (eggs[i].golden) ng++;
      if (ng) {
        const slot = Math.floor(time / 1.1) % ng;
        for (let i = 0, c = 0; i < count; i++) if (eggs[i].golden) { if (c === slot) gi = i; c++; }
      }
      spark.visible = gi >= 0;
      if (gi >= 0) {
        const u = (time / 1.1) % 1, e = eggs[gi];
        spark.position.set(e.pivot.position.x - 0.012, e.pivot.position.y + k.egg[1] * 2 * EV + 0.012, e.pivot.position.z + 0.01);
        spark.scale.setScalar(0.055 * sin(smooth(u) * PI) * (kind === 'goose' ? 1.2 : 1));
      }
    },
    dispose() {
      if (root.parent) root.parent.remove(root);
      cache.release();
    },
  };
  api.update(0);
  return api;
}
