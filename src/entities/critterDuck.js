// Duck: small, cheap voxel ducks in three breeds.
//   mallard  drake: green head, white collar, chestnut breast; hen: brown speckles (title scene)
//   pekin    white farm duck with an orange bill (both sexes; the drake has the curl)
//   wood     drake: glossy green/purple crest, red eye, bold white bridle; hen: grey-brown, white eye-ring
// Fine 0.025 voxels, shared geometry per breed + sex, no canvases: the eyes are
// tiny voxel meshes swapped for expressions.
//
//   const d = new Duck({ sex: 'm' | 'f', breed: 'mallard' | 'pekin' | 'wood', fx: true });  scene.add(d.root);
//   d.play('waddle');  d.update(dt);
//   loops:     idle waddle peck quack (= honk) flap swim dive chase_flee sit sleep brood
//   one-shots: eat happy (return to idle; pass { loop: true } to repeat them)
//   idle peck quack/honk flap dive also play a single cycle with { loop: false } (then idle + onDone)
//   events:    'step', 'quack', 'peck', 'gulp', 'flap', 'paddle', 'splash', 'turn_egg' (brood)
//
// Root at the feet (or the water surface for 'swim' / 'dive'; the nest root for 'brood'),
// facing +Z. ~0.39 to the crown. fx: tiny Zzz / heart sprites on sleep / happy.
import {
  VS, FV, VoxelModel, ell, tone, hash3, buildGeo, geoCache, mirrorX, CritterRig, K, pulse, beat, win,
  sin, cos, abs, max, min, PI, TAU, smooth, ZZZ_ROWS, HEART_ROWS,
} from './critterKit.js';

const F = FV / VS; // joint offsets are in 0.05 units; duck parts are drawn in fine voxels

const PAL = {
  m: {
    head: 0x2e8a4a, headD: 0x1f6a3a, headL: 0x4cb46a, collar: 0xf4f4ec, breast: 0x8a4632, breastD: 0x6e3424,
    body: 0xc4c0b8, bodyD: 0xa8a49c, bodyL: 0xdcd8d0, back: 0x8a7e72, backD: 0x6e6458, tail: 0x26262e, tailW: 0xeeeee6,
    bill: 0xf2d040, billD: 0xc8a42a, nail: 0x3a3a2a, wing: 0x9a9088, wingD: 0x7e766e, spec: 0x3a5ad8, specW: 0xf4f4ec,
    foot: 0xf28a2a, footD: 0xd06a1a,
  },
  f: {
    head: 0x9a7048, headD: 0x6a4a2c, headL: 0xb88a5c, collar: 0x9a7048, breast: 0xa8784a, breastD: 0x6a4626,
    body: 0xa8784a, bodyD: 0x6a4626, bodyL: 0xc89a68, back: 0x8a6038, backD: 0x5a3a20, tail: 0x8a6038, tailW: 0xc8a070,
    bill: 0xe8903a, billD: 0x6a4a2a, nail: 0x3a2a1a, wing: 0x8a6038, wingD: 0x5a3a20, spec: 0x3a5ad8, specW: 0xf4f4ec,
    foot: 0xf28a2a, footD: 0xd06a1a, stripe: 0x4a3018,
  },
};
const PEKIN = {
  m: {
    head: 0xfaf8f0, headD: 0xe4e0d2, headL: 0xffffff, breast: 0xf6f3e8, breastD: 0xe2dccc,
    body: 0xf8f6ee, bodyD: 0xe8e4d8, bodyL: 0xffffff, back: 0xf1ede0, backD: 0xe0dacb, tail: 0xf3f0e4, tailW: 0xffffff,
    bill: 0xf8a634, billD: 0xe0862a, nail: 0xf6c890, wing: 0xf2eee2, wingD: 0xd8d2c2, spec: 0xe8e2d2, specW: 0xfbf9f2,
    foot: 0xf8902a, footD: 0xd8701a,
  },
};
PEKIN.f = { ...PEKIN.m, head: 0xf8f4e6, body: 0xf6f2e4, breast: 0xf4efe0, back: 0xeee8d8, bill: 0xf6a23c };
const WOOD = {
  m: {
    head: 0x1f7048, headD: 0x174a3a, headL: 0x3a9a62, purple: 0x5e3c8a, purpleD: 0x40286a, white: 0xf6f4ee, ring: 0xe0342a,
    breast: 0x7e2e2a, breastD: 0x5e2220, speck: 0xf2e8dc, barW: 0xf8f6f0, barK: 0x1e1c24,
    body: 0xd8b878, bodyD: 0xb8965c, bodyL: 0xe8d09a, back: 0x4a4c3e, backD: 0x36382e, backL: 0x5e6450,
    rump: 0x3a2e48, chest: 0xa8461e, belly: 0xeee8dc, tail: 0x2e2c38, tailW: 0x3e3a4c,
    bill: 0xdc3a2c, billD: 0x2a2224, billW: 0xf4eee6, billY: 0xf2c43a, nail: 0x1a1618,
    wing: 0x4c5476, wingD: 0x30324a, wingL: 0x5e6a94, spec: 0x3a5ad8, specW: 0xf4f4ec, foot: 0xeaa83a, footD: 0xc8862a,
  },
  f: {
    head: 0x857a70, headD: 0x655a52, headL: 0x9c9288, crown: 0x5c524a, white: 0xf4f0e8,
    breast: 0x8c6c50, breastD: 0x6a5038, speck: 0xdccab0,
    body: 0x7e644c, bodyD: 0x5e4834, bodyL: 0x98785a, back: 0x6a5a48, backD: 0x52463a, backL: 0x7c6c58,
    belly: 0xe2dacb, tail: 0x4a4036, tailW: 0x5a4e42,
    bill: 0x423e3e, billD: 0x2e2a2a, nail: 0x1e1a1a,
    wing: 0x7a6656, wingD: 0x584a3e, spec: 0x3a5ad8, specW: 0xf4f4ec, foot: 0xbca452, footD: 0x988238,
  },
};

// body: pivot at the hip centre (fine voxels). Belly y -3.., length z -7..6
function bodyModel(c, hen) {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    if (hen) {
      const h = hash3(x, y, z);
      const base = z > 3 && y < 3 ? c.breast : c.body;
      return h < 0.22 ? c.bodyD : h > 0.86 ? c.bodyL : base;
    }
    if (z >= 3 && y <= 4) return tone(x, y, z, c.breast, c.breastD, c.breast, 0.15, 0);
    if (y >= 3 && z < 3) return tone(x, y, z, c.back, c.backD, c.back);
    return tone(x, y, z, c.body, c.bodyD, c.bodyL);
  };
  ell(v, 0, 1.5, 0, 4.6, 3.6, 6.4, col);
  ell(v, 0, 2.2, 3.4, 3.6, 3.2, 3.4, col);
  // tail, tipped up (drake: black with a white fringe and a curl)
  for (let z = -9; z <= -6; z++) {
    const d = -6 - z;
    for (let x = -2 + (d > 1 ? 1 : 0); x <= 1 - (d > 1 ? 1 : 0); x++) {
      v.set(x, 2 + d, z, hen ? (hash3(x, d, z) < 0.3 ? c.bodyD : c.tail) : d >= 2 ? c.tailW : c.tail);
      if (d <= 1) v.set(x, 3 + d, z, hen ? c.tail : c.tail);
    }
  }
  if (!hen) { v.set(-1, 6, -7, c.tail); v.set(-1, 7, -6, c.tail); } // drake curl
  return v;
}
function headModel(c, hen) {
  const v = new VoxelModel();
  // neck (pivot at the neck base), head ball, collar ring
  for (let y = 0; y <= 3; y++) for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) v.set(x, y, z, y === 1 && !hen ? c.collar : y < 1 ? c.breast : c.head);
  ell(v, 0, 5, 0.4, 3.1, 3.0, 3.3, (x, y, z) => {
    if (hen && y === 5 && abs(x + 0.5) > 1.5) return c.stripe;
    return tone(x, y, z, c.head, c.headD, c.headL, 0.12, hen ? 0.08 : 0.2);
  });
  return v;
}
function billModel(c, lower) {
  const v = new VoxelModel();
  if (lower) {
    for (let x = -1; x <= 0; x++) for (let z = 0; z <= 3; z++) v.set(x, 0, z, c.billD);
    return v;
  }
  for (let x = -2; x <= 1; x++)
    for (let z = 0; z <= 3; z++) {
      if (z === 3 && (x === -2 || x === 1)) continue;
      v.set(x, 0, z, c.bill);
      if (z <= 1 && x >= -1 && x <= 0) v.set(x, 1, z, c.bill);
    }
  v.set(-1, 0, 4, c.nail); v.set(0, 0, 4, c.nail);
  if (c.stripe) { v.set(-1, 1, 1, c.billD); v.set(0, 1, 1, c.billD); }
  return v;
}
// wing (left side): flat, pivot at the shoulder, trailing back (-z)
function wingModel(c) {
  const v = new VoxelModel();
  for (let y = -4; y <= 0; y++)
    for (let z = -9; z <= 1; z++) {
      const r = ((y + 2) / 2.8) ** 2 + ((z + 4) / 5.6) ** 2;
      if (r > 1) continue;
      let col = tone(0, y, z, c.wing, c.wingD, c.wing, 0.2, 0);
      if (y === -3 && z >= -6 && z <= -2) col = c.spec;
      if (y === -3 && (z === -7 || z === -1)) col = c.specW;
      if (y <= -4 || z <= -8) col = c.wingD;
      v.set(0, y, z, col);
      if (r < 0.5) v.set(-1, y, z, c.wingD);
    }
  return v;
}
function legModel(c) {
  const v = new VoxelModel();
  for (let y = -3; y <= 0; y++) v.set(0, y, 0, c.foot);
  for (let x = -1; x <= 1; x++) for (let z = 0; z <= 2; z++) if (!(z === 2 && x === 0)) v.set(x, -4, z, z === 2 ? c.footD : c.foot);
  v.set(0, -4, -1, c.foot);
  return v;
}
function eyeModel(kind) {
  const v = new VoxelModel();
  if (kind === 'dot') v.set(0, 0, 0, 0x14101a);
  else if (kind === 'wide') { v.set(0, 0, 0, 0xffffff); v.set(0, 1, 0, 0xffffff); v.set(0, 0, 1, 0xffffff); v.set(0, 1, 1, 0x14101a); }
  else { v.set(0, 0, 0, 0x14101a); v.set(0, 0, 1, 0x14101a); } // closed: a little line
  return v;
}

// ------------------------------------------------------------------ pekin + wood duck models
// Same skeleton and silhouette as the mallard so every animation fits every breed.
/** Upturned tail wedge (z -9..-6), optional drake curl. */
function tailWedge(v, c, { curl = false, long = false, speck = false } = {}) {
  for (let z = long ? -10 : -9; z <= -6; z++) {
    const d = -6 - z;
    for (let x = -2 + (d > 1 ? 1 : 0); x <= 1 - (d > 1 ? 1 : 0); x++) {
      const tc = speck && hash3(x, d, z) < 0.3 ? c.bodyD : d >= 2 ? c.tailW : c.tail;
      v.set(x, 2 + min(d, 3), z, tc);
      if (d <= 1) v.set(x, 3 + d, z, c.tail);
    }
  }
  if (curl) { v.set(-1, 6, -7, c.tailW); v.set(-1, 7, -6, c.tailW); v.set(-1, 7, -7, c.tailW); }
}
function pekinBodyModel(c, drake) {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    if (y >= 3 && z < 2) return tone(x, y, z, c.back, c.backD, c.bodyL, 0.12, 0.08);
    if (z >= 3) return tone(x, y, z, c.breast, c.breastD, c.bodyL, 0.1, 0.12);
    return tone(x, y, z, c.body, c.bodyD, c.bodyL, 0.12, 0.1);
  };
  // plumper than a mallard, with a high round breast (farm ducks stand proud)
  ell(v, 0, 1.6, 0, 4.8, 3.8, 6.4, col);
  ell(v, 0, 2.5, 3.4, 3.9, 3.5, 3.5, col);
  tailWedge(v, c, { curl: drake });
  return v;
}
function pekinHeadModel(c) {
  const v = new VoxelModel();
  for (let y = 0; y <= 3; y++) for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) v.set(x, y, z, tone(x, y, z, c.head, c.headD, c.headL, 0.1, 0.1));
  ell(v, 0, 5.1, 0.3, 3.2, 3.1, 3.3, (x, y, z) => tone(x, y, z, c.head, c.headD, c.headL, 0.1, 0.12));
  v.set(-1, 8, 0, c.head); v.set(0, 8, 0, c.headL); v.set(-1, 8, 1, c.head); // round crown tuft
  return v;
}
// wood duck: eye centre in head voxel-centre coords (y, z)
const EYE_Y = 5.9, EYE_Z = 2.1;
const eyeD = (y, z, back = 1) => { const dz = z + 0.5 - EYE_Z; return Math.hypot(y + 0.5 - EYE_Y, dz < 0 ? dz * back : dz); };
function woodBodyModel(c, drake) {
  const v = new VoxelModel();
  const col = (x, y, z) => {
    const h = hash3(x, y, z), side = abs(x + 0.5);
    if (drake) {
      if (y <= -2 && z > -5) return c.belly;
      if (z >= 3 && y <= 4) return h < 0.1 ? c.speck : tone(x, y, z, c.breast, c.breastD, c.breast, 0.15, 0); // speckled chestnut breast
      if (y <= 2 && z === 2) return c.barW; // white then black shoulder bars
      if (y <= 2 && z === 1) return c.barK;
      if (y >= 3 && z < 3) return y === 3 && side >= 3.5 ? ((z & 1) ? c.barW : c.barK) : tone(x, y, z, c.back, c.backD, c.backL, 0.15, 0.12);
      if (z <= -5) return y >= 0 && y <= 1 && side >= 2.5 ? c.chest : c.rump;
      // golden flanks with fine dark vermiculation
      return (y + z * 2 + 99) % 3 === 0 && h < 0.55 ? c.bodyD : tone(x, y, z, c.body, c.bodyD, c.bodyL, 0.06, 0.12);
    }
    if (y <= -2 && z > -5) return c.belly;
    if (z >= 3 && y <= 4) return h < 0.16 ? c.speck : tone(x, y, z, c.breast, c.breastD, c.breast, 0.15, 0);
    if (y >= 3 && z < 3) return tone(x, y, z, c.back, c.backD, c.backL, 0.15, 0.1);
    return h < 0.2 ? c.bodyD : h > 0.84 ? c.bodyL : c.body;
  };
  ell(v, 0, 1.5, 0, 4.6, 3.6, 6.4, col);
  ell(v, 0, 2.2, 3.4, 3.6, 3.2, 3.4, col);
  tailWedge(v, c, { long: drake });
  return v;
}
function woodHeadModel(c, drake) {
  const v = new VoxelModel();
  // neck: chestnut base, a white throat finger in front, dark nape
  for (let y = 0; y <= 3; y++)
    for (let x = -2; x <= 1; x++)
      for (let z = -2; z <= 1; z++) {
        const side = abs(x + 0.5);
        let k;
        if (drake) k = y <= 1 ? (z >= 0 ? c.breast : c.headD) : y === 2 ? (z >= 1 || (side >= 1.5 && z >= -1) ? c.white : c.headD) : z >= 1 && side < 1.5 ? c.white : c.headD;
        else k = y === 0 ? c.breast : z >= 1 && side < 1.5 ? c.white : tone(x, y, z, c.head, c.headD, c.head, 0.2, 0);
        v.set(x, y, z, k);
      }
  const col = (x, y, z) => {
    const side = abs(x + 0.5), h = hash3(x, y, z);
    if (drake) {
      if (side >= 1.5 && eyeD(y, z) < 0.8) return c.ring; // red eye-ring
      if (y <= 3 && z >= 1 && side < 2.5) return c.white; // throat
      if (y === 4 && z >= 2 && side < 1.5) return c.white; // chin under the bill
      if ((y === 3 || y === 4) && z === -1 && side >= 2) return c.white; // chin-strap finger up the cheek
      if (y === 7 && side >= 1.5 && z <= 1) return c.white; // bridle over the eye
      if (y === 6 && z === 2 && side >= 1.5 && side < 2.5) return c.white;
      if (y === 5 && z <= -1 && side >= 2.5) return c.white; // lower bridle behind the eye
      if (y <= 5 && side >= 1.5) return h < 0.3 ? c.purpleD : c.purple; // purple cheeks
      return h < 0.12 ? c.purple : tone(x, y, z, c.head, c.headD, c.headL, 0.12, 0.2);
    }
    if (side >= 1.5 && eyeD(y, z, 0.55) < 1.0) return c.white; // white teardrop eye-ring
    if (y <= 3 && z >= 1 && side < 2.5) return c.white; // throat
    if (y === 4 && z >= 2 && side < 1.5) return c.white;
    if (y >= 7) return tone(x, y, z, c.crown, c.headD, c.crown, 0.2, 0);
    return tone(x, y, z, c.head, c.headD, c.headL, 0.14, 0.1);
  };
  ell(v, 0, 5, 0.4, 3.1, 3.0, 3.3, col);
  // swept-back crest (drake: long drooping mane with white edge lines)
  const crest = drake
    ? [[-4, 4, 7, 2], [-5, 4, 7, 1], [-6, 3, 6, 1], [-7, 3, 5, 1], [-8, 3, 4, 1]]
    : [[-4, 5, 7, 1], [-5, 5, 6, 1]];
  for (const [z, y0, y1, w] of crest)
    for (let y = y0; y <= y1; y++)
      for (let x = -w; x <= w - 1; x++) {
        let k;
        if (drake) k = y === y1 - 1 && z <= -5 ? c.white : y === y0 && z <= -6 ? c.white : hash3(x, y, z) < 0.4 ? c.purple : tone(x, y, z, c.head, c.headD, c.headL, 0.15, 0.15);
        else k = tone(x, y, z, c.crown, c.headD, c.head, 0.2, 0.1);
        v.set(x, y, z, k);
      }
  return v;
}
/** Wood duck wing: shorter than the mallard's so the golden / brown flank shows below it. */
function woodWingModel(c, drake) {
  const v = new VoxelModel();
  for (let y = -3; y <= 0; y++)
    for (let z = -10; z <= 1; z++) {
      const r = ((y + 1.5) / 2.3) ** 2 + ((z + 4.5) / 5.9) ** 2;
      if (r > 1) continue;
      let col = tone(0, y, z, c.wing, c.wingD, c.wingL || c.wing, 0.18, 0.12);
      if (y === -2 && z >= -6 && z <= -3) col = c.spec;
      if (y === -2 && (z === -7 || z === -2)) col = c.specW;
      if (z <= -8) col = c.wingD;
      if (drake && z >= -7) {
        // the golden flank feathers overlap the folded wing, edged with a fine black-and-white line
        if (y <= -2) col = (y + z * 2 + 99) % 3 === 0 && hash3(y, z, 5) < 0.55 ? c.bodyD : tone(1, y, z, c.body, c.bodyD, c.bodyL, 0.06, 0.12);
        else if (y === -1) col = (z & 1) ? c.barW : c.barK;
      }
      v.set(0, y, z, col);
      if (r < 0.5) v.set(-1, y, z, c.wingD);
    }
  return v;
}
function woodBillModel(c, drake, lower) {
  const v = new VoxelModel();
  if (lower) {
    for (let x = -1; x <= 0; x++) for (let z = 0; z <= 3; z++) v.set(x, 0, z, drake ? (z < 2 ? c.bill : c.billD) : c.billD);
    return v;
  }
  for (let x = -2; x <= 1; x++)
    for (let z = 0; z <= 3; z++) {
      if (z === 3 && (x === -2 || x === 1)) continue;
      const mid = x >= -1 && x <= 0;
      let k = c.bill;
      if (drake) k = z === 0 ? c.billY : mid && z >= 2 ? c.billW : c.bill;
      v.set(x, 0, z, k);
      if (z <= 1 && mid) v.set(x, 1, z, drake ? (z === 0 ? c.billY : c.billD) : c.bill);
    }
  v.set(-1, 0, 4, c.nail); v.set(0, 0, 4, c.nail);
  return v;
}

export const DUCK_BREEDS = ['mallard', 'pekin', 'wood'];
const caches = {};
function cacheFor(breed, sex) {
  const key = breed + '_' + sex;
  if (caches[key]) return caches[key];
  const drake = sex !== 'f';
  let c, body, head, billU, billL, wing = () => wingModel(c);
  if (breed === 'pekin') {
    c = PEKIN[sex];
    body = () => pekinBodyModel(c, drake); head = () => pekinHeadModel(c);
    billU = () => billModel(c, false); billL = () => billModel(c, true);
  } else if (breed === 'wood') {
    c = WOOD[sex];
    body = () => woodBodyModel(c, drake); head = () => woodHeadModel(c, drake);
    billU = () => woodBillModel(c, drake, false); billL = () => woodBillModel(c, drake, true);
    wing = () => woodWingModel(c, drake);
  } else {
    c = PAL[sex];
    body = () => bodyModel(c, !drake); head = () => headModel(c, !drake);
    billU = () => billModel(c, false); billL = () => billModel(c, true);
  }
  caches[key] = geoCache(() => {
    const b = (m, p = [0, 0, 0]) => buildGeo(m, p, FV);
    return {
      body: b(body()), head: b(head()),
      billU: b(billU(), [0.0, 0, 0]), billL: b(billL()),
      wingL: b(wing()), wingR: b(mirrorX(wing())),
      leg: b(legModel(c), [0, 0, 0]),
      eyeDot: b(eyeModel('dot'), [0, 0, 0]), eyeWide: b(eyeModel('wide'), [0, 0.5, 0.5]), eyeShut: b(eyeModel('shut'), [0, 0, 0.5]),
    };
  });
  return caches[key];
}

const EXPRS = { neutral: { eye: 'dot' }, panic: { eye: 'wide' }, sleepy: { eye: 'shut' }, happy: { eye: 'shut' } };

export class Duck extends CritterRig {
  constructor({ sex = 'm', breed = 'mallard', shadows = true, fx = true } = {}) {
    sex = sex === 'f' ? 'f' : 'm';
    breed = DUCK_BREEDS.includes(breed) ? breed : 'mallard';
    super(breed === 'mallard' ? (sex === 'f' ? 'DuckHen' : 'DuckDrake') : `Duck_${breed}_${sex}`, { shadows });
    this.sex = sex;
    this.breed = breed;
    const cache = (this._geoCache = cacheFor(breed, sex));
    const G = cache.get();
    this.joint('mover', this.root);
    this.joint('body', this.mover, 0, 5 * F, 0);
    this.mesh(G.body, this.body);
    this.joint('head', this.body, 0, 2.5 * F, 4.2 * F);
    this.mesh(G.head, this.head);
    this.joint('bill', this.head, 0, 4.2 * F, 3.4 * F);
    this.mesh(G.billU, this.bill);
    this.joint('jaw', this.head, 0, 4.2 * F, 3.4 * F);
    this.mesh(G.billL, this.jaw, { y: -FV * 0.9 });
    this.eyes = {};
    for (const s of [1, -1]) {
      const n = s > 0 ? 'L' : 'R';
      const x = s > 0 ? 3 : -4;
      const eg = { dot: this.mesh(G.eyeDot, this.head), wide: this.mesh(G.eyeWide, this.head), shut: this.mesh(G.eyeShut, this.head) };
      for (const k in eg) { eg[k].position.set(x * FV + (s > 0 ? 0.0006 : -0.0006), 5.4 * FV, 1.6 * FV); eg[k].castShadow = false; }
      this.eyes[n] = eg;
      const w = this.joint('wing' + n, this.body, s * 4.1 * F, 3.6 * F, 1 * F);
      this.mesh(s > 0 ? G.wingL : G.wingR, w, { x: s > 0 ? 0 : 0 });
      const l = this.joint('leg' + n, this.body, s * 1.6 * F, -1.0 * F, 0.5 * F);
      this.mesh(G.leg, l, { x: -FV * 0.5 + 0 });
    }
    this.fx = fx;
    if (fx) {
      this.zzz = [0, 1].map(() => this.sprite(ZZZ_ROWS, 0.04, this.root));
      this.hearts = [this.sprite(HEART_ROWS, 0.05, this.root)];
    }
    this.scalar('zzz', 0);
    this.scalar('hearts', 0);
    this.jiggle('head', 'rx', { k: 200, c: 10, az: 0.02, ay: -0.012, max: 0.4, probe: 'body' });
    this.jiggle('body', 's', { k: 280, c: 12, ay: 0.004, max: 0.1, probe: 'mover' });
    this.jiggle('wingL', 'rz', { k: 220, c: 12, ay: -0.01, max: 0.3, probe: 'body' });
    this.jiggle('wingR', 'rz', { k: 220, c: 12, ay: 0.01, max: 0.3, probe: 'body' });
    this._init(ANIMS, EXPRS, 'idle');
    this.anims = keyed(this.anims);
  }
  _updateFace(dt, f, def) {
    const ex = this._EXPRS[this._userExpr || f.expr || def.expr || 'neutral'] || EXPRS.neutral;
    this._blinkT -= dt;
    if (this._blinkT < -0.12) this._blinkT = 1.5 + hash3(floor10(this.time), 1, 2) * 3;
    let e = f.eyes || ex.eye;
    if (e === 'dot' && this._blinkT < 0) e = 'shut';
    for (const n of ['L', 'R']) for (const k in this.eyes[n]) this.eyes[n][k].visible = k === e;
  }
  _post() { if (this.fx) birdFx(this, 0.33, -0.04); }
}
const floor10 = (t) => Math.floor(t * 10);

/** rig.anims stays an array of names; named keys too, so both anims.includes(n) and anims[n] work. */
export function keyed(list) { for (const n of list) list[n] = true; return list; }

/** Zzz / heart sprites shared by the bird rigs (scalars zzz, hearts; h = head height, z = head z). */
export function birdFx(rig, h, z) {
  const tz = rig.time, k = rig.k;
  rig.zzz.forEach((s, i) => {
    const u = (tz * 0.4 + i / 2) % 1;
    s.visible = k.zzz > 0.5;
    s.position.set(0.05 + u * 0.07 + sin(u * 9) * 0.012, h * 0.8 + u * h * 0.6, z);
    s.scale.setScalar((0.022 + u * 0.03) * (u < 0.85 ? 1 : (1 - u) / 0.15) * (h / 0.33) ** 0.5);
  });
  rig.hearts.forEach((s) => {
    const u = k.hearts;
    s.visible = u > 0.02 && u < 0.98;
    s.position.set(sin(u * 8) * 0.02, h * 1.05 + u * h * 0.5, z + 0.05);
    s.scale.setScalar(0.05 * (h / 0.33) ** 0.5 * min(1, u * 6) * (u < 0.75 ? 1 : (1 - u) / 0.25));
  });
}

// ------------------------------------------------------------------ animations
const ANIMS = {};
const def = (name, o) => { ANIMS[name] = o; };
function rest(p) { p.wingL.rz = -0.05; p.wingR.rz = 0.05; }
function steps(s, ph, rig) {
  const k = Math.floor(ph / PI + 0.5);
  if (s.step !== undefined && k !== s.step) rig._emit('step');
  s.step = k;
}
function legs(p, ph, amp) {
  const sn = sin(ph);
  p.legL.rx = -sn * amp; p.legR.rx = sn * amp;
  p.legL.y = max(0, cos(ph)) * 0.35; p.legR.y = max(0, -cos(ph)) * 0.35;
}
/** Settled on the belly, legs tucked. y: mover height (fine voxels). */
function settle(p, y) {
  p.mover.y = y * F;
  p.legL.rx = p.legR.rx = 1.4; p.legL.y = p.legR.y = 1.8 * F;
}

def('idle', {
  loop: true, dur: 5,
  fn(t, p, f, s, rig) {
    rest(p);
    const br = sin(t * 2);
    p.body.s = 1 + br * 0.02; p.body.rx = -0.05;
    p.head.ry = K(t % 5, [[0, 0], [1.5, 0], [1.7, 0.6], [2.8, 0.6], [3.0, -0.4], [4.2, -0.4], [4.4, 0]]);
    p.head.rx = sin(t * 1.3) * 0.06;
    const sh = pulse(t % 7, 5.5, 0.4); // little feather ruffle
    p.mover.rz = sin(t * 40) * 0.06 * sh; p.wingL.rz += sh * 0.3; p.wingR.rz -= sh * 0.3;
  },
});

def('waddle', {
  loop: true,
  fn(t, p, f, s, rig) {
    const ph = (t / 0.46) * TAU, sn = sin(ph), cs = cos(ph);
    legs(p, ph, 0.6);
    rest(p);
    p.mover.rz = sn * 0.16; p.mover.ry = sn * 0.08;
    p.mover.y = abs(cs) * 0.25;
    p.body.rx = -0.08;
    p.head.z = abs(sn) * 0.15; p.head.rx = 0.08 - abs(cs) * 0.08; p.head.rz = -sn * 0.1;
    p.wingL.rz += abs(sn) * 0.12; p.wingR.rz -= abs(sn) * 0.12;
    steps(s, ph, rig);
  },
});

def('peck', {
  loop: true, dur: 1.2,
  fn(t, p, f, s, rig) {
    const T = 1.2, u = t % T;
    rest(p);
    const dip = K(u, [[0, 0], [0.3, 0], [0.42, 1, 'in'], [0.5, 0.85], [0.58, 1, 'in'], [0.75, 0, 'out'], [T, 0]]);
    p.body.rx = 0.55 * dip; p.head.rx = 0.95 * dip; p.head.z = dip * 0.4;
    p.body.y = -dip * 0.1; p.mover.z = 0;
    p.legL.rx = -0.4 * dip; p.legR.rx = -0.4 * dip;
    p.mover.y = 0;
    p.head.ry = K(u, [[0, 0], [0.15, 0.4], [0.28, 0], [0.8, 0], [1.0, -0.35], [T, 0]]);
    p.jaw.rx = pulse(u, 0.44, 0.08) * 0.5 + pulse(u, 0.6, 0.08) * 0.4;
    if (beat(s, 'pk', t, T, 0.42) || beat(s, 'pk2', t, T, 0.58)) rig._emit('peck');
  },
});

def('quack', {
  loop: true, dur: 0.9,
  fn(t, p, f, s, rig) {
    const T = 0.9, u = t % T;
    rest(p);
    const q = pulse(u, 0.1, 0.26);
    p.head.rx = -0.35 * q; p.head.z = q * 0.35; p.head.y = q * 0.2;
    p.jaw.rx = q * 0.75; p.bill.rx = -q * 0.18;
    p.body.rx = -0.12 * q; p.body.s = 1 + q * 0.08;
    p.mover.y = q * 0.3;
    p.wingL.rz += q * 0.35; p.wingR.rz -= q * 0.35;
    p.mover.rz = sin(t * 3) * 0.03;
    if (beat(s, 'q', t, T, 0.12)) rig._emit('quack');
  },
});
ANIMS.honk = ANIMS.quack; // same call, so 'honk' works on every bird

def('flap', {
  loop: true, dur: (TAU / 26) * 3,
  fn(t, p, f, s, rig) {
    const fl = sin(t * 26);
    p.wingL.rz = 1.2 + fl * 0.8; p.wingR.rz = -1.2 - fl * 0.8;
    p.wingL.rx = p.wingR.rx = -0.4;
    p.body.rx = -0.5; p.head.rx = 0.4; p.head.z = -0.1;
    p.mover.y = 0.3 + abs(sin(t * 6)) * 1.0;
    p.legL.rx = p.legR.rx = 0.4;
    p.jaw.rx = 0.3 + sin(t * 9) * 0.15;
    f.eyes = 'dot';
    if (beat(s, 'fl', t, TAU / 26, 0)) rig._emit('flap');
  },
});

function swimPose(t, p) {
  const ph = (t / 0.7) * TAU, sn = sin(ph);
  rest(p);
  p.mover.y = -2.2 * F + sin(t * 2.2) * 0.12;
  p.mover.rx = sin(t * 2.2 + 1) * 0.04; p.mover.rz = sin(t * 1.4) * 0.05;
  p.body.rx = -0.05;
  p.legL.rx = 0.7 + sn * 0.6; p.legR.rx = 0.7 - sn * 0.6;
  p.head.rx = 0.05 + sin(t * 2.2) * 0.04; p.head.ry = sin(t * 0.7) * 0.3;
  p.head.z = -0.05;
}
def('swim', {
  loop: true,
  fn(t, p, f, s, rig) {
    // root = water surface: the body floats a little submerged
    swimPose(t, p);
    if (beat(s, 'pd', t, 0.7, 0)) rig._emit('paddle');
  },
});

def('dive', {
  loop: true, dur: 3.4,
  fn(t, p, f, s, rig) {
    // dabbling: bottoms up, tail to the sky, feet kicking, then pop back up and shake
    const T = 3.4, u = t % T;
    swimPose(t, p);
    const w = smooth((u - 0.5) / 0.28) * (1 - smooth((u - 2.05) / 0.3));
    p.mover.y = p.mover.y * (1 - w) - 4.6 * F * w;
    p.mover.rx *= 1 - w; p.mover.rz *= 1 - w;
    p.body.rx = -0.05 + 1.42 * w + sin(t * 5) * 0.05 * w;
    p.head.rx = p.head.rx * (1 - w) + 0.45 * w; p.head.ry *= 1 - w; p.head.z += 0.5 * w;
    const kick = sin(t * 15);
    p.legL.rx = p.legL.rx * (1 - w) + (0.2 + kick * 0.7) * w; p.legR.rx = p.legR.rx * (1 - w) + (0.2 - kick * 0.7) * w;
    p.legL.rz = 0.3 * w; p.legR.rz = -0.3 * w;
    p.wingL.rz += 0.12 * w; p.wingR.rz -= 0.12 * w;
    // back up: a shake and a waggle of the tail
    const sh = pulse(u, 2.45, 0.45);
    p.mover.rz += sin(t * 38) * 0.09 * sh; p.head.ry += sin(t * 30) * 0.5 * sh;
    p.wingL.rz += sh * 0.35; p.wingR.rz -= sh * 0.35; p.body.ry = sin(t * 30) * 0.08 * sh;
    f.eyes = w > 0.3 ? 'shut' : null;
    if (beat(s, 'in', t, T, 0.6) || beat(s, 'out', t, T, 2.2)) rig._emit('splash');
    if (w > 0.6 && beat(s, 'pd', t, TAU / 15, 0)) rig._emit('paddle');
  },
});

def('chase_flee', {
  loop: true,
  fn(t, p, f, s, rig) {
    const ph = (t / 0.22) * TAU, sn = sin(ph), cs = cos(ph);
    legs(p, ph, 1.1);
    const fl = sin(t * 30);
    p.wingL.rz = 1.0 + fl * 0.75; p.wingR.rz = -1.0 - fl * 0.75;
    p.mover.y = abs(cs) * 0.5;
    p.mover.rz = sn * 0.12; p.mover.ry = sin(t * 5) * 0.15;
    p.body.rx = 0.25; p.head.rx = -0.2; p.head.z = 0.4 + abs(sn) * 0.1;
    p.jaw.rx = 0.6 + sin(t * 14) * 0.2;
    f.eyes = 'wide';
    steps(s, ph, rig);
    if (beat(s, 'q', t, 0.5, 0)) rig._emit('quack');
  },
});

def('sit', {
  loop: true,
  fn(t, p, f, s, rig) {
    rest(p);
    const br = sin(t * 1.8);
    p.mover.y = -3.2 * F; p.body.s = 1 + br * 0.02;
    p.legL.rx = p.legR.rx = 1.4; p.legL.y = p.legR.y = 1.8 * F;
    p.head.y = -0.6 * F; p.head.z = -0.6 * F;
    p.head.ry = K(t % 6, [[0, 0], [2, 0], [2.3, 0.5], [3.5, 0.5], [3.8, 0]]);
    p.head.rx = 0.1;
    p.mover.rz = br * 0.02;
    if ((t % 9) > 6) f.eyes = 'shut';
  },
});

def('sleep', {
  loop: true, expr: 'sleepy',
  fn(t, p, f, s, rig) {
    // belly down, head swung round and tucked into the back feathers
    rest(p);
    const br = sin(t * 1.3);
    settle(p, -3.3);
    p.body.s = 1 + br * 0.03; p.body.rx = 0.03;
    p.head.ry = 2.55 + sin(t * 0.5) * 0.03; p.head.rx = 0.5; p.head.rz = -0.12;
    p.head.z = -4.4 * F; p.head.y = -1.5 * F + br * 0.04; p.head.x = 0.6 * F;
    p.wingL.rz = 0.1 + br * 0.02; p.wingR.rz = -0.1 - br * 0.02; // feathers fluffed
    p.mover.rz = 0.02;
    p.k.zzz = 1;
    f.eyes = 'shut';
  },
});

def('brood', {
  loop: true,
  fn(t, p, f, s, rig) {
    // sat deep in the nest cup (nest root = duck root), the rim hides the belly
    const T = 7, u = t % T;
    rest(p);
    const br = sin(t * 1.6);
    settle(p, 0.6);
    p.body.s = 1.03 + br * 0.025; p.body.rx = 0.02;
    p.wingL.rz = 0.12; p.wingR.rz = -0.12; // puffed up over the eggs
    // settle-wiggle: shuffle the eggs under the breast
    const wg = win(u, 1.6, 2.6, 0.15, 0.2);
    p.mover.rz += sin(t * 20) * 0.07 * wg; p.mover.ry = sin(t * 10) * 0.08 * wg; p.mover.y += -0.15 * wg;
    p.wingL.rz += wg * 0.15 * (1 + sin(t * 20)); p.wingR.rz -= wg * 0.15 * (1 + sin(t * 20));
    // turn an egg: dip the bill under the breast
    const tu = win(u, 4.2, 5.3, 0.3, 0.3);
    p.head.rx = 0.05 + tu * 1.05; p.head.z = tu * 0.6; p.head.y = -tu * 0.5;
    p.jaw.rx = pulse(u, 4.75, 0.12) * 0.4;
    p.head.ry = K(u, [[0, 0], [0.6, 0.55], [1.3, 0.55], [1.5, 0], [3.2, 0], [3.5, -0.5], [4.0, -0.5], [4.2, 0], [T, 0]]);
    if (u > 5.6 && u < 6.6) f.eyes = 'shut';
    if (beat(s, 'pk', t, T, 4.75)) rig._emit('turn_egg');
  },
});

def('eat', {
  dur: 1.15, next: 'idle',
  fn(t, p, f, s, rig) {
    // eye the bug, snap it up, toss the head back and gulp it down
    const T = 1.15, u = t % T;
    rest(p);
    const dip = K(u, [[0, 0], [0.16, 0.2], [0.3, 1, 'in'], [0.4, 0.9], [0.5, 0, 'out'], [T, 0]]);
    const up = K(u, [[0, 0], [0.42, 0], [0.56, 1, 'out'], [0.88, 1], [1.08, 0], [T, 0]]);
    p.body.rx = 0.5 * dip - 0.1 * up; p.body.y = -dip * 0.1;
    p.head.rx = 0.95 * dip - 0.55 * up; p.head.z = 0.42 * dip - 0.1 * up; p.head.y = 0.3 * up;
    p.head.rz = K(u, [[0, 0], [0.12, 0.35], [0.26, 0], [T, 0]]);
    p.legL.rx = p.legR.rx = -0.4 * dip;
    p.jaw.rx = pulse(u, 0.28, 0.1) * 0.6 + pulse(u, 0.6, 0.08) * 0.45 + pulse(u, 0.72, 0.08) * 0.35;
    p.head.s = 1 + pulse(u, 0.68, 0.2) * 0.08; // gulp
    p.mover.y = up * 0.15;
    if (beat(s, 'pk', t, T, 0.3)) rig._emit('peck');
    if (beat(s, 'g', t, T, 0.7)) rig._emit('gulp');
  },
});

def('happy', {
  dur: 1.5, next: 'idle',
  fn(t, p, f, s, rig) {
    // crouch, a wing-fluttering hop with a quack, a smaller hop, a proud shake
    const T = 1.5, u = t % T;
    rest(p);
    const hop = K(u, [[0, 0], [0.14, -0.35], [0.36, 1.5, 'out'], [0.56, 0, 'in'], [0.62, -0.25], [0.78, 0.8, 'out'], [0.94, 0, 'in'], [1.0, -0.15], [1.12, 0], [T, 0]]);
    const air = max(0, hop) / 1.5;
    p.mover.y = hop;
    p.body.s = 1 - min(0, hop) * 0.25 + air * 0.06;
    p.body.rx = -0.25 * air - 0.05;
    const fl = sin(t * 30) * smooth(air * 3);
    p.wingL.rz = 0.3 * smooth(air * 4) + 0.9 * air + fl * 0.5 * (air > 0.05 ? 1 : 0); p.wingR.rz = -p.wingL.rz;
    p.legL.rx = p.legR.rx = 0.3 * air;
    const q = pulse(u, 0.24, 0.24) + pulse(u, 0.72, 0.18) * 0.7;
    p.jaw.rx = q * 0.7; p.head.rx = -0.3 * q; p.head.z = 0.2 * q;
    const sh = pulse(u, 1.12, 0.3);
    p.mover.rz = sin(t * 40) * 0.07 * sh; p.head.ry = sin(t * 26) * 0.25 * sh;
    p.k.hearts = u / T;
    f.eyes = 'shut';
    if (beat(s, 'q', t, T, 0.26)) rig._emit('quack');
    if (air > 0.05 && beat(s, 'fl', t, TAU / 30, 0)) rig._emit('flap');
    if (beat(s, 'l1', t, T, 0.56) || beat(s, 'l2', t, T, 0.94)) rig._emit('step');
  },
});

export { ANIMS as DUCK_ANIMS };
