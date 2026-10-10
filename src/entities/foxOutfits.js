// [v26 evening] Reynard's wardrobe: extra outfits, unlocked by trophies (src/data/achievements.js).
// Real voxel body parts in the foxProps.js format (hat in hat-seat space, torso pivoted at the
// waist, sleeves at the shoulder / elbow, optional trousers), built lazily and cached.
//
//   WARDROBE              [{ id, name, trophy, swatch: [main, trim, hat] }]  (order = the rail)
//   extraOutfitParts(id)  -> parts | null   (foxProps.outfitParts calls this first)
//
// Hat-seat space: origin on the head top, +y up, +z = his front. His face is the plane z ~ 6.5,
// eyes at y ~ -5.3, x ~ +-3.6 (his right eye, the monocle one, is -x).
import { VoxelModel } from '../core/voxel.js';

const VS = 0.05;

export const WARDROBE = [
  { id: 'default', name: 'Tycoon', trophy: null, swatch: ['#6c3b90', '#ffdc4a', '#221c2a'] },
  { id: 'chef', name: 'Head Chef', trophy: 'a_first', swatch: ['#f6f4ee', '#e03a32', '#ffffff'] },
  { id: 'hawaiian', name: 'Aloha Shirt', trophy: 'a_love', swatch: ['#f07a3a', '#3ac0b0', '#2a2a32'] },
  { id: 'captain', name: 'Ship Captain', trophy: 'a_full', swatch: ['#1e2c5a', '#ffd23f', '#f4f4f4'] },
  { id: 'tuxedo', name: 'Tuxedo', trophy: 'a_happy10', swatch: ['#1a1820', '#ffffff', '#1a1820'] },
  { id: 'astronaut', name: 'Astronaut', trophy: 'a_research5', swatch: ['#eef0f4', '#d84a3a', '#c8ccd8'] },
  { id: 'wizard', name: 'Pond Wizard', trophy: 'a_hybrid', swatch: ['#5a2a9a', '#ffd23f', '#3a1a6a'] },
  { id: 'lumberjack', name: 'Lumberjack', trophy: 'a_dams', swatch: ['#c8282a', '#1a1418', '#d8402a'] },
  { id: 'pirate', name: 'Pirate', trophy: 'a_big', swatch: ['#3a1a20', '#e0b040', '#1a1418'] },
  { id: 'spa', name: 'Spa Day', trophy: 'a_rating', swatch: ['#f8f6f2', '#f4b8c8', '#7ac85a'] },
  { id: 'hockey', name: 'Hockey Star', trophy: 'a_week', swatch: ['#d8262e', '#f4f4f4', '#202028'] },
  { id: 'onesie', name: 'Bear Onesie', trophy: 'a_ceo', swatch: ['#7a4a2a', '#e8c89a', '#6a3e22'] },
  { id: 'prospector', name: 'Prospector', trophy: 'a_rich', swatch: ['#6a4a2a', '#e8c040', '#f0c020'] },
  { id: 'royal', name: 'Royal Robe', trophy: 'a_golden', swatch: ['#a81a2a', '#f8f4ee', '#ffd23f'] },
  { id: 'mountie', name: 'Mountie', trophy: 'a_month', swatch: ['#c8202a', '#1a2a5a', '#8a6a3a'] },
  { id: 'ranger', name: 'Park Ranger', trophy: 'a_dex', swatch: ['#b8a070', '#3a6a3a', '#8a7048'] },
];
export const EXTRA_OUTFIT_IDS = WARDROBE.map((o) => o.id).filter((id) => id !== 'default' && id !== 'chef');

// ------------------------------------------------------------------ helpers
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const tone = (x, y, z, base, dark, light, pd = 0.1, pl = 0.09) => { const h = hash3(x, y, z); return h < pd ? dark : h > 1 - pl ? light : base; };
function rbox(v, x0, x1, y0, y1, z0, z1, r, col) {
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, cz = (z0 + z1 + 1) / 2;
  const hx = (x1 - x0 + 1) / 2, hy = (y1 - y0 + 1) / 2, hz = (z1 - z0 + 1) / 2;
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
    const qx = Math.abs(x + 0.5 - cx) - (hx - r), qy = Math.abs(y + 0.5 - cy) - (hy - r), qz = Math.abs(z + 0.5 - cz) - (hz - r);
    const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
    if (d <= 0.02) v.set(x, y, z, typeof col === 'function' ? col(x, y, z) : col);
  }
}
const FUR = [0xe0662a, 0xd35c25, 0xea7431], CREAM = [0xf8eedc, 0xecdcc4, 0xf8eedc], SOCK = [0x302634, 0x241c28, 0x46394e];
const furT = (x, y, z) => tone(x, y, z, ...FUR);
const creamT = (x, y, z) => tone(x, y, z, ...CREAM);
const T = (base, dark, light, pd = 0.12, pl = 0.1) => (x, y, z) => tone(x, y, z, base, dark, light, pd, pl);
const vIn = (x, y, z, k = 0.75) => z >= 1 && y >= 1 && Math.abs(x + 0.5) <= (y - 0.6) * k;
const vEdge = (x, y, z, k = 0.75) => z >= 1 && y >= 1 && Math.abs(x + 0.5) <= (y - 0.6) * k + 1;

// torso: the waistcoat silhouette (pivot at the waist) + ruff; col(x, y, z) paints it
function torso(col, { ruff = null, skirt = null, belly = true } = {}) {
  const v = new VoxelModel();
  rbox(v, -5, 4, -2, 5, -4, 3, 1.7, col);
  if (belly) rbox(v, -4, 3, -2, 3, 0, 4, 2.1, col);
  rbox(v, -4, 3, 5, 8, -3, 3, 1.4, ruff || ((x, y, z) => (z >= 1 ? creamT(x, y, z) : furT(x, y, z))));
  if (skirt) rbox(v, -5, 4, -4, -3, -4, 3, 1.3, skirt);
  return v;
}
function upper(col) { const v = new VoxelModel(); rbox(v, -1, 1, -4, 1, -1, 1, 0.9, col); return v; }
function fore(col, cuff) { const v = new VoxelModel(); rbox(v, -1, 1, -3, 0, -1, 1, 0.8, (x, y, z) => (y === -3 && cuff ? (typeof cuff === 'function' ? cuff(x, y, z) : cuff) : col(x, y, z))); return v; }
function thigh(col) { const v = new VoxelModel(); rbox(v, -2, 1, -3, 1, -2, 1, 1.2, col); return v; }
function shin(col, boot = null) {
  const v = new VoxelModel();
  const S = boot || ((x, y, z) => tone(x, y, z, ...SOCK));
  rbox(v, -2, 1, -2, 0, -2, 1, 1.0, col);
  rbox(v, -2, 1, -3, -2, -2, 3, 0.8, S);
  return v;
}
function disc(v, cx, y, cz, r, col, { ry = 1 } = {}) {
  for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) for (let z = Math.floor(cz - r - 1); z <= cz + r + 1; z++) {
    const d = Math.hypot(x + 0.5 - cx, (z + 0.5 - cz) / ry);
    if (d <= r) v.set(x, y, z, typeof col === 'function' ? col(x, y, z, d) : col);
  }
}
// a shell over the top / back / sides of the head (helmets, hoods): y from y0 up, leaves the face free
function shell(v, y0, y1, col, { front = 4, pad = 1 } = {}) {
  for (let x = -7 - pad; x <= 6 + pad; x++) for (let y = y0; y <= y1; y++) for (let z = -6 - pad; z <= front; z++) {
    const dx = (x + 0.5) / (7 + pad), dz = (z + 0.5) / (6 + pad), dy = Math.max(0, y - y1 + 3) / 4;
    if (dx * dx + dz * dz + dy * dy > 1.02) continue;
    if (y < 0 && Math.abs(x + 0.5) < 6.5 && z > -5 && dx * dx + dz * dz < 0.7) continue; // hollow where the head is
    v.set(x, y, z, typeof col === 'function' ? col(x, y, z) : col);
  }
}
// eyewear on the face plane (z = 6), centred on the eyes
function shades(v, lens, frame) {
  for (const ex of [-4, 3]) for (let x = ex - 1; x <= ex + 2; x++) for (let y = -6; y <= -5; y++) v.set(x, y, 6, (x === ex - 1 || x === ex + 2) && y === -5 ? frame : lens);
  v.set(-1, -5, 6, frame); v.set(0, -5, 6, frame);
  for (const sx of [-7, 6]) { v.set(sx, -5, 5, frame); v.set(sx, -5, 4, frame); }
  v.set(-4, -5, 7, 0xffffff); v.set(3, -5, 7, 0xffffff);
}
const gold = (v, x, y, z) => v.set(x, y, z, 0xffd23f);

// ------------------------------------------------------------------ the outfits
const B = {};

B.hawaiian = () => {
  const O = 0xf07a3a, OD = 0xd8602a, OL = 0xff9a5a;
  const pat = (x, y, z) => {
    const h = hash3(x * 7 + 1, y * 5 + 2, z * 3 + 3);
    if ((x * 3 + y * 5 + z * 2) % 11 === 0) return 0xfff2f0;
    if (h < 0.12) return 0x3ac0b0; if (h < 0.2) return 0xf04a8a; if (h < 0.26) return 0x2a8a5a;
    return tone(x, y, z, O, OD, OL);
  };
  const col = (x, y, z) => (vIn(x, y, z, 0.9) ? creamT(x, y, z) : vEdge(x, y, z, 0.9) ? 0xfff2e0 : pat(x, y, z));
  const hat = new VoxelModel();
  shades(hat, 0x24242e, 0x3a3a44);
  // a little hibiscus behind his ear
  for (const [x, y, z] of [[5, -1, 2], [6, -1, 2], [5, 0, 2], [6, 0, 1], [5, -1, 1]]) hat.set(x, y, z, 0xf04a8a);
  hat.set(5, -1, 3, 0xffd23f);
  return { hat, hatTop: 1, torso: torso(col), up: upper(pat), fo: fore(pat, 0xfff2e0), noMonocle: true, earSpread: 0 };
};

B.captain = () => {
  const N = T(0x1e2c5a, 0x162248, 0x2a3c74);
  const col = (x, y, z) => (vIn(x, y, z) ? (Math.abs(x + 0.5) < 1 && y < 5 ? 0x1a1a24 : 0xf6f4ee) : vEdge(x, y, z) ? 0x162248 : N(x, y, z));
  const t = torso(col, { skirt: N });
  for (const y of [2, 0, -2]) { gold(t, -3, y, 4); gold(t, 2, y, 4); }
  for (const x of [-5, 4]) for (const z of [-1, 0, 1]) t.set(x, 5, z, 0xffd23f); // epaulettes
  const hat = new VoxelModel();
  disc(hat, 0, 0, 0, 4.6, 0x1a1a24);
  for (let y = 1; y <= 3; y++) disc(hat, 0, y, -0.3, y === 3 ? 5.2 : 4.6, y === 3 ? 0xf8f8f8 : y === 1 ? 0x1a1a24 : 0xf0f0f0);
  for (let x = -4; x <= 3; x++) for (let z = 4; z <= 6; z++) hat.set(x, 0, z, z === 6 ? 0x0e0e14 : 0x1a1a24); // peak
  for (const [x, y] of [[-1, 1], [0, 1], [-1, 2], [0, 2]]) hat.set(x, y, 5, 0xffd23f);
  hat.set(-2, 2, 5, 0xffd23f); hat.set(1, 2, 5, 0xffd23f);
  return { hat, hatTop: 4.5, hatTilt: [0, 0, 0.06], torso: t, up: upper((x, y, z) => (y === 1 ? 0xffd23f : N(x, y, z))), fo: fore(N, 0xffd23f), earSpread: 0.5 };
};

B.tuxedo = () => {
  const K = T(0x1a1820, 0x121016, 0x2a2834);
  const col = (x, y, z) => {
    if (vIn(x, y, z, 0.7)) return 0xfbfbf8;
    if (vEdge(x, y, z, 0.7) || (z >= 1 && y >= 1 && Math.abs(x + 0.5) <= (y - 0.6) * 0.7 + 2)) return 0x2e2a38; // satin lapels
    return K(x, y, z);
  };
  const t = torso(col);
  for (let y = 4; y <= 5; y++) for (const x of [-3, -2, -1, 0, 1, 2]) t.set(x, y, 5, x === -1 || x === 0 ? 0x0e0c12 : 0x1a1820);
  t.set(-1, 1, 5, 0x0e0c12); t.set(-1, -1, 5, 0x0e0c12); // studs
  t.set(3, 2, 4, 0xf04a5a); t.set(3, 3, 4, 0xd8303a); // a carnation
  const hat = new VoxelModel(); // bowler
  for (let y = 0; y <= 4; y++) disc(hat, 0, y, 0, y === 0 ? 5.6 : 3.8 - Math.max(0, y - 2) * 0.7, y === 1 ? 0x5a1a2a : y === 0 ? 0x121016 : 0x1a1820);
  return { hat, hatTop: 5, hatTilt: [0, 0, -0.08], torso: t, up: upper(K), fo: fore(K, 0xfbfbf8), earSpread: 0.3 };
};

B.astronaut = () => {
  const W = T(0xeef0f4, 0xd4d8e0, 0xffffff, 0.15, 0.08);
  const col = (x, y, z) => {
    if (z >= 3 && y >= 0 && y <= 2 && x >= -2 && x <= 1) return (x + y) & 1 ? 0x5a6a8a : 0x3a4a6a; // chest pack
    if (y === -1) return 0x9aa2b0;
    return W(x, y, z);
  };
  const t = torso(col, { ruff: (x, y, z) => (y >= 7 ? 0xc8ccd8 : W(x, y, z)) });
  t.set(-1, 1, 5, 0xd84a3a); t.set(0, 1, 5, 0x3a8ad8); t.set(-1, 0, 5, 0xffd23f);
  for (const [x, y] of [[2, 3], [3, 3], [2, 4], [3, 4]]) t.set(x, y, 4, (x + y) & 1 ? 0xd84a3a : 0xf4f4f4); // flag patch
  const hat = new VoxelModel();
  shell(hat, -4, 4, (x, y) => (y === -4 ? 0x9aa2b0 : W(x, y, 0)), { front: 3 });
  for (let y = 5; y <= 9; y++) hat.set(3, y, -2, 0xc8ccd8);
  hat.set(3, 10, -2, 0xd84a3a); hat.set(3, 11, -2, 0xff6a5a);
  for (let x = -6; x <= 5; x++) hat.set(x, 4, 3, 0xffd23f); // gold visor edge (pushed up)
  const leg = (x, y, z) => W(x, y, z);
  return { hat, hatTop: 6, torso: t, up: upper(W), fo: fore(W, 0x9aa2b0), thigh: thigh(leg), shin: shin(leg, (x, y, z) => (y <= -3 ? 0x6a7280 : 0xdcdfe6)), earSpread: 0.9, noMonocle: true };
};

B.wizard = () => {
  const P = T(0x5a2a9a, 0x48207e, 0x6c38b0);
  const star = (x, y, z) => ((x * 5 + y * 3 + z * 7) % 13 === 0 ? 0xffd23f : (x * 2 + y * 7 + z) % 17 === 0 ? 0xf4f0ff : P(x, y, z));
  const col = (x, y, z) => (y === -1 ? 0xe8b84a : vIn(x, y, z, 0.6) ? creamT(x, y, z) : star(x, y, z));
  const t = torso(col, { skirt: star });
  const hat = new VoxelModel();
  disc(hat, 0, 0, 0, 7.2, (x, y, z, d) => (d > 6.4 ? 0x3a1a6a : 0x48207e));
  for (let y = 1; y <= 12; y++) {
    const r = 4.2 * (1 - (y - 1) / 13);
    disc(hat, Math.max(0, y - 8) * 0.7, y, -Math.max(0, y - 9) * 0.5, r, (x, yy, z) => (yy === 2 ? 0xe8b84a : star(x, yy, z)));
  }
  return { hat, hatTop: 13, hatTilt: [-0.05, 0, 0.12], torso: t, up: upper(star), fo: fore(star, 0xe8b84a), earSpread: 0.85 };
};

B.lumberjack = () => {
  const plaid = (x, y, z) => {
    const a = Math.floor((x + 8) / 2) % 2, b = Math.floor((y + 8) / 2) % 2;
    return a && b ? 0x1a1418 : a || b ? (hash3(x, y, z) < 0.15 ? 0x8a1a1e : 0xa8222a) : 0xd02a2c;
  };
  const col = (x, y, z) => (vIn(x, y, z, 0.6) ? creamT(x, y, z) : plaid(x, y, z));
  const hat = new VoxelModel(); // toque with a pompom
  for (let y = 0; y <= 4; y++) disc(hat, 0, y, 0, y <= 1 ? 5 : 5 - (y - 1) * 0.9, (x, yy) => (yy <= 1 ? ((x & 1) ? 0xf4f0e8 : 0xe0d8c8) : yy === 3 ? 0x1a1418 : 0xd8402a));
  for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) for (let y = 5; y <= 6; y++) hat.set(x, y, z, y === 6 && x === -1 ? 0xffffff : 0xf0ece0);
  return { hat, hatTop: 7, hatTilt: [0, 0, 0.08], torso: torso(col), up: upper(plaid), fo: fore(plaid, 0x1a1418), earSpread: 0.6,
    thigh: thigh(T(0x3a5a8a, 0x2a4a78, 0x4a6aa0)), shin: shin(T(0x3a5a8a, 0x2a4a78, 0x4a6aa0), (x, y, z) => (y <= -3 ? 0x3a2414 : 0x6a4424)) };
};

B.pirate = () => {
  const C = T(0x3a1a20, 0x2a1016, 0x4a2430);
  const col = (x, y, z) => {
    if (vIn(x, y, z, 0.8)) return (y + x) & 1 ? 0xfbf6ea : 0xe8dcc4; // ruffled shirt
    if (y === -1) return 0xc8282a; // sash
    if (z >= 2 && (x === -4 || x === 3)) return 0xe0b040; // gold trim
    return C(x, y, z);
  };
  const t = torso(col, { skirt: C });
  t.set(4, -1, 2, 0xc8282a); t.set(4, -2, 2, 0xa81a20);
  const hat = new VoxelModel(); // tricorn
  for (let y = 0; y <= 3; y++) {
    const r = y === 0 ? 6.2 : 4.2 - (y - 1) * 0.6;
    disc(hat, 0, y, 0, r, (x, yy, z) => (yy === 0 && Math.hypot(x + 0.5, z + 0.5) > 5.4 ? 0xe0b040 : 0x1a1418));
  }
  for (const [x, z] of [[-6, -3], [5, -3], [-1, 6], [0, 6]]) { hat.set(x, 1, z, 0x1a1418); hat.set(x, 2, z, 0xe0b040); }
  for (const [x, y] of [[-1, 2], [0, 2], [-1, 1], [0, 1]]) hat.set(x, y, 5, 0xf4f0e8); // skull
  hat.set(-1, 1, 6, 0x1a1418); hat.set(0, 1, 6, 0x1a1418);
  // eyepatch over his left eye (the monocle keeps the right one)
  for (let x = 2; x <= 5; x++) for (let y = -6; y <= -5; y++) hat.set(x, y, 6, 0x141016);
  for (const [x, y, z] of [[1, -4, 6], [0, -3, 6], [-1, -2, 6], [-2, -1, 6], [6, -6, 5], [6, -6, 4], [6, -7, 3]]) hat.set(x, y, z, 0x141016);
  return { hat, hatTop: 4, hatTilt: [0, 0, -0.1], torso: t, up: upper(C), fo: fore(C, 0xe0b040), earSpread: 0.7 };
};

B.spa = () => {
  const W = (x, y, z) => ((x + y + z) & 1 ? 0xf8f6f2 : hash3(x, y, z) < 0.3 ? 0xe8e4dc : 0xfdfcfa);
  const col = (x, y, z) => {
    if (vIn(x, y, z, 0.6)) return creamT(x, y, z);
    if (vEdge(x, y, z, 0.6) || (z >= 2 && x === -1 + Math.floor(-y * 0.3))) return 0xe8e0d4; // crossed collar
    if (y === -1) return 0xf4b8c8; // belt
    return W(x, y, z);
  };
  const t = torso(col, { skirt: W });
  t.set(-3, -1, 5, 0xf4b8c8); t.set(-3, -2, 5, 0xf4b8c8); t.set(-4, -2, 4, 0xf09ab0);
  const hat = new VoxelModel(); // towel turban + cucumber eyes
  for (let y = 0; y <= 4; y++) disc(hat, -0.3, y, 0, y === 4 ? 3.4 : 5.4 - y * 0.25, (x, yy, z) => ((x + z + yy * 2) % 5 === 0 ? 0xf4b8c8 : 0xfbf4f6));
  for (const [x, y] of [[-1, 5], [0, 5], [0, 6], [1, 6]]) hat.set(x, y, 0, 0xfbf4f6);
  for (const ex of [-4, 3]) for (let x = ex - 1; x <= ex + 2; x++) for (let y = -7; y <= -4; y++) {
    const d = Math.hypot(x - ex - 0.5, y + 5.5);
    if (d > 2) continue;
    hat.set(x, y, 6, d > 1.4 ? 0x3a8a3a : (x + y) & 1 ? 0xbce88a : 0xa8d878);
  }
  return { hat, hatTop: 6, torso: t, up: upper(W), fo: fore(W, 0xe8e0d4), noMonocle: true, earSpread: 0.9 };
};

B.hockey = () => {
  const R = T(0xd8262e, 0xb81c24, 0xe8404a);
  const jersey = (x, y, z) => (y === 2 || y === 3 ? 0xf4f4f4 : y === -2 ? 0x202028 : R(x, y, z));
  const col = (x, y, z) => (z >= 1 && y >= 4 && Math.abs(x + 0.5) <= 1.5 ? 0x202028 : jersey(x, y, z));
  const t = torso(col);
  const seven = [[-2, 1], [-1, 1], [0, 1], [0, 0], [-1, -1], [-1, -2]];
  for (const [x, y] of seven) { t.set(x, y, -5, 0xf4f4f4); t.set(x + 1, y + 1, 5, 0xf4f4f4); }
  const hat = new VoxelModel();
  shell(hat, -3, 3, (x, y) => (y === -3 ? 0x101018 : (x & 1) && y === 2 ? 0x2a2a34 : 0x202028), { front: 4 });
  for (let x = -4; x <= 3; x++) hat.set(x, 0, 5, 0x9aa2b0); // visor brim
  const slv = (x, y, z) => (y === -2 || y === -3 ? 0xf4f4f4 : R(x, y, z));
  return { hat, hatTop: 4, torso: t, up: upper(slv), fo: fore(R, 0x202028), earSpread: 0.8,
    thigh: thigh(T(0x202028, 0x141418, 0x30303a)), shin: shin((x, y, z) => (y === 0 ? 0xd8262e : 0xf4f4f4)) };
};

B.onesie = () => {
  const Br = T(0x7a4a2a, 0x6a3e22, 0x8a5a36, 0.2, 0.15);
  const col = (x, y, z) => (z >= 2 && y <= 4 && Math.abs(x + 0.5) <= 3 - Math.max(0, y - 1) * 0.4 ? T(0xe8c89a, 0xd8b888, 0xf4d8aa)(x, y, z) : Br(x, y, z));
  const t = torso(col);
  t.set(-1, 3, 5, 0x3a2414); t.set(-1, 0, 5, 0x3a2414); // buttons
  const hat = new VoxelModel(); // the hood, with round bear ears
  shell(hat, -6, 2, Br, { front: 3 });
  for (const ex of [-6, 5]) for (let x = ex - 1; x <= ex + 1; x++) for (let y = 2; y <= 4; y++) hat.set(x, y, -1, y === 3 && x === ex ? 0xe8c89a : 0x6a3e22);
  for (let x = -3; x <= 2; x++) hat.set(x, 2, 4, 0xe8c89a); // fuzzy hood rim
  return { hat, hatTop: 4.5, torso: t, up: upper(Br), fo: fore(Br, 0xe8c89a), thigh: thigh(Br), shin: shin(Br, (x, y, z) => (y <= -3 ? 0xe8c89a : 0x6a3e22)), earSpread: 0.95 };
};

B.prospector = () => {
  const plaid = (x, y, z) => ((Math.floor((x + 8) / 2) + Math.floor((y + 8) / 2)) % 2 ? 0x2a5a8a : 0x3a7ab0);
  const vest = T(0x6a4a2a, 0x543820, 0x7c5a36);
  const col = (x, y, z) => {
    if (vIn(x, y, z, 0.7)) return plaid(x, y, z);
    if (z >= 2 && Math.abs(x + 0.5) <= 1.2 && y < 1) return plaid(x, y, z);
    if (z >= 1 && (x === -3 || x === 2) && y >= 3) return 0x3a2414; // suspenders
    return vest(x, y, z);
  };
  const t = torso(col);
  t.set(2, 1, 4, 0xe8c040); t.set(3, 0, 4, 0xe8c040); // a gold nugget watch chain
  const hat = new VoxelModel(); // miner's hard hat + lamp
  for (let y = 0; y <= 4; y++) disc(hat, 0, y, 0, y === 0 ? 6 : 4.6 - Math.max(0, y - 2) * 0.9, (x, yy) => (yy === 0 ? 0xd0a018 : (x + yy) % 4 === 0 ? 0xffe060 : 0xf0c020));
  for (let x = -1; x <= 0; x++) for (let y = 1; y <= 3; y++) hat.set(x, y, 5, y === 2 ? 0xfffbe0 : 0x6a6a74);
  hat.set(-1, 2, 6, 0xffffff); hat.set(0, 2, 6, 0xfff0a0);
  const leg = T(0x5a6a8a, 0x4a5a78, 0x6a7a9a);
  return { hat, hatTop: 5, torso: t, up: upper(plaid), fo: fore(plaid, 0x2a5a8a), thigh: thigh(leg), shin: shin(leg, (x, y, z) => (y <= -3 ? 0x2a1a10 : 0x5a3a20)), earSpread: 0.5 };
};

B.royal = () => {
  const Rv = T(0xa81a2a, 0x8a1020, 0xc02838, 0.15, 0.1);
  const ermine = (x, y, z) => ((x * 3 + y * 5 + z) % 7 === 0 ? 0x1a1418 : 0xf8f4ee);
  const col = (x, y, z) => {
    if (vIn(x, y, z, 0.7)) return creamT(x, y, z);
    if (y >= 4 || (z >= 2 && Math.abs(x + 0.5) <= 1.2)) return ermine(x, y, z);
    return Rv(x, y, z);
  };
  const t = torso(col, { skirt: ermine });
  for (const [x, y] of [[-3, 3], [-2, 2], [-1, 1], [0, 1], [1, 2], [2, 3]]) t.set(x, y, 5, 0xffd23f); // chain of office
  t.set(-1, 0, 5, 0xd83a32); t.set(0, 0, 5, 0xffd23f);
  const hat = new VoxelModel(); // crown
  for (let y = 0; y <= 2; y++) for (let a = 0; a < 40; a++) {
    const ang = (a / 40) * Math.PI * 2, x = Math.round(Math.cos(ang) * 4.2 - 0.5), z = Math.round(Math.sin(ang) * 4.2 - 0.5);
    hat.set(x, y, z, y === 1 && a % 8 === 0 ? (a % 16 ? 0x3a6ad8 : 0xd83a32) : y === 0 ? 0xd8a020 : 0xffd23f);
  }
  for (let k = 0; k < 5; k++) {
    const ang = (k / 5) * Math.PI * 2 + Math.PI / 2, x = Math.round(Math.cos(ang) * 4.2 - 0.5), z = Math.round(Math.sin(ang) * 4.2 - 0.5);
    for (let y = 3; y <= 5; y++) hat.set(x, y, z, y === 5 ? 0xfff6c4 : 0xffd23f);
  }
  disc(hat, 0, 1, 0, 3.4, 0xa81a2a);
  return { hat, hatTop: 5.5, hatTilt: [0, 0, 0.1], torso: t, up: upper(Rv), fo: fore(Rv, ermine), earSpread: 0.4 };
};

function campaignHat(crown, band, brim) {
  const hat = new VoxelModel();
  disc(hat, 0, 0, 0, 7.4, (x, y, z, d) => (d > 6.8 ? brim : crown));
  for (let y = 1; y <= 6; y++) {
    const r = y === 1 ? 4 : 3.8 - (y - 2) * 0.35;
    disc(hat, 0, y, 0, r, (x, yy, z) => {
      if (yy === 1) return band;
      const a = Math.atan2(z + 0.5, x + 0.5);
      return Math.cos(a * 2) > 0.85 && yy >= 4 ? 0x5a4428 : crown; // the four "lemon squeezer" dents
    });
  }
  return hat;
}

B.mountie = () => {
  const S = T(0xc8202a, 0xa81820, 0xd83a40);
  const col = (x, y, z) => {
    if (z >= 1 && y >= 4) return 0x1a2a5a; // high navy collar
    if (y === -1) return 0x6a4424; // Sam Browne belt
    if (z >= 1 && (x + 0.5) * 0.8 + 1.2 === y) return 0x6a4424;
    return S(x, y, z);
  };
  const t = torso(col);
  for (let y = 0; y <= 3; y++) { const x = Math.round(-3 + y * 1.2); t.set(x, y, 4, 0x6a4424); } // cross strap
  for (const y of [3, 1, -2]) gold(t, -1, y, 4);
  t.set(-1, -1, 4, 0xd8a020);
  const legs = (x, y, z) => (x === -2 ? 0xffd23f : T(0x1a2a5a, 0x121e46, 0x24346a)(x, y, z));
  return { hat: campaignHat(0x8a6a3a, 0x3a2414, 0x7a5a2e), hatTop: 7, torso: t, up: upper(S), fo: fore(S, 0x1a2a5a), thigh: thigh(legs), shin: shin(legs, (x, y, z) => (y <= -3 ? 0x1a1014 : 0x3a2414)), earSpread: 0.95 };
};

B.ranger = () => {
  const K = T(0xb8a070, 0xa08a5c, 0xc8b484);
  const col = (x, y, z) => {
    if (vIn(x, y, z, 0.5)) return creamT(x, y, z);
    if (z >= 3 && y >= 1 && y <= 3 && (x === -4 || x === -3 || x === 2 || x === 3)) return 0xa08a5c; // pockets
    if (y === -2) return 0x5a4428;
    return K(x, y, z);
  };
  const t = torso(col);
  t.set(2, 3, 5, 0xffd23f); t.set(3, 3, 5, 0xe0b030); t.set(2, 4, 5, 0xe0b030); // badge
  for (let y = 0; y <= 3; y++) t.set(-1, y, 5, 0x3a6a3a); // green tie
  const slv = (x, y, z) => (y <= -3 ? 0xa08a5c : K(x, y, z));
  return { hat: campaignHat(0x8a7048, 0x3a6a3a, 0x7a6038), hatTop: 7, torso: t, up: upper(slv), fo: fore(K, 0xc8b484), earSpread: 0.95,
    thigh: thigh(T(0x5a6a3a, 0x4a5a2e, 0x6a7a48)), shin: shin(T(0x5a6a3a, 0x4a5a2e, 0x6a7a48), (x, y, z) => (y <= -3 ? 0x2a1a10 : 0x5a3a20)) };
};

// ------------------------------------------------------------------ cached parts
const GEO = new Map();
const g = (key, model, pivot) => { let x = GEO.get(key); if (!x) { x = model.build({ pivot, scale: VS }); GEO.set(key, x); } return x; };
const PARTS = new Map();

/** foxProps.outfitParts hook: body-part geometry for a wardrobe outfit (null for unknown ids). */
export function extraOutfitParts(id) {
  if (!B[id]) return null;
  let p = PARTS.get(id);
  if (p) return p;
  const m = B[id]();
  const up = g(id + '_up', m.up, [0.5, 0, 0.5]), fo = g(id + '_fo', m.fo, [0.5, 0, 0.5]);
  p = {
    hat: g(id + '_hat', m.hat, [0, 0, 0]), hatTop: m.hatTop ?? 5, hatTilt: m.hatTilt || [0, 0, 0], earSpread: m.earSpread ?? 0,
    torso: g(id + '_torso', m.torso, [0, 0, 0]), upperL: up, upperR: up, foreL: fo, foreR: fo,
    thigh: m.thigh ? g(id + '_th', m.thigh, [0, 0, 0]) : null, shin: m.shin ? g(id + '_sh', m.shin, [0, 0, 0]) : null,
    noMonocle: !!m.noMonocle, tassel: null,
  };
  PARTS.set(id, p);
  return p;
}
