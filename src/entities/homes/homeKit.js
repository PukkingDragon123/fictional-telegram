// [v20 npc homes] Shared kit for the neighbours' interior dioramas (HomeMode).
// A home is a cut-away room like Reynard's lab (back wall + two side walls
// that step down towards the open front, viewed from +Z), built from 0.05
// voxels, plus interactive props (separate groups so they can be highlighted
// and animated) and a few ambient updaters.
//
//   const k = new HomeKit();
//   k.room({ w, d, h, floor(x, z), wall(x, y, z, side), base, window: [...] });
//   const p = cupboard(k, { ... });                    // -> Group with userData.parts
//   k.prop('pantry', p, { x, z, rot, label, tap: { anim, lines, sfx, fx, reward, effect } });
//   k.light(0xffc070, 1.2, 4, [x, y, z]);  k.every((dt, t) => ...);  k.finish();
//   ... k.dispose() frees every geometry / texture the home made.
//
// Units: 1 home voxel = 0.05 world units. Room origin = floor centre (floor top at y = 0),
// interior x in [-w/2, w/2), z in [-d/2, d/2) voxels. Materials are shared and cached (never disposed).
import * as THREE from 'three';
import { VoxelModel, shade, mix } from '../../core/voxel.js';
import { buildGeo, matFor, grainMaterial, hash3, tone, rbox, ell, spriteMat, HEART_ROWS, SPARK_ROWS, ZZZ_ROWS } from '../critterKit.js';

export const HV = 0.05;
export const W = (n) => n * HV;
export { shade, mix, hash3, tone, rbox, ell };

let GLOW = null, GLASS = null, WATER = null;
const glowMat = () => (GLOW ||= new THREE.MeshBasicMaterial({ vertexColors: true }));
const glassMat = () => (GLASS ||= new THREE.MeshBasicMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.22, depthWrite: false }));
const waterMat = () => (WATER ||= new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false }));
/** highlight twin of a lit mesh material (same grain, warm emissive) */
export const hiMat = (geo) => grainMaterial(geo.userData.scale || HV, geo.userData.grain || [0, 0, 0], 0.08, 0x4a3414);

// little pixel sprites for effects (palette letters of critterKit's SPRITE_PAL)
export const NOTE_ROWS = ['...kk', '..kyk', '..kk.', '..k..', 'kkk..', 'kyk..', 'kkk..'];
export const COIN_ROWS = ['.kkk.', 'kyYyk', 'kYyyk', 'kyyyk', '.kkk.'];
export const DROP_ROWS = ['..k..', '.kbk.', 'kbwbk', 'kbbBk', '.kkk.'];
export const PUFF_ROWS = ['.kkk.', 'kwwwk', 'kwYwk', 'kwwwk', '.kkk.'];
export const BUBBLE_ROWS = ['.kk.', 'kwbk', 'kbbk', '.kk.'];
const FX_ROWS = { hearts: HEART_ROWS, sparks: SPARK_ROWS, zzz: ZZZ_ROWS, notes: NOTE_ROWS, coins: COIN_ROWS, drops: DROP_ROWS, puff: PUFF_ROWS, bubbles: BUBBLE_ROWS };

export class HomeKit {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'NpcHome';
    this.geos = new Set();
    this.textures = new Set();
    this.props = [];
    this.updaters = [];
    this.tweens = [];
    this.fxList = [];
    this.lights = [];
    this.R = new VoxelModel(); // static room (lit)
    this.G = new VoxelModel(); // static room (glowing: windows, embers)
    this.dims = { w: 120, d: 80, h: 60 };
    this.time = 0;
  }

  v() { return new VoxelModel(); }

  /** Mesh a voxel model. kind: 'lit' | 'glow' | 'glass' | 'water' */
  mesh(model, kind = 'lit', pivot = [0, 0, 0], scale = HV) {
    if (!model || !model.vox.size) return new THREE.Group();
    const geo = kind === 'lit' ? buildGeo(model, pivot, scale) : model.build({ pivot, scale, ao: false });
    this.geos.add(geo);
    const mat = kind === 'glow' ? glowMat() : kind === 'glass' ? glassMat() : kind === 'water' ? waterMat() : matFor(geo, 0.08);
    const m = new THREE.Mesh(geo, mat);
    m.userData.lit = kind === 'lit';
    return m;
  }

  /** Group of body (+ glow) meshes */
  obj(name, body, glow = null, extra = {}) {
    const g = new THREE.Group();
    g.name = name;
    if (body) g.add(this.mesh(body));
    if (glow) g.add(this.mesh(glow, 'glow'));
    for (const [k, m] of Object.entries(extra)) if (m) g.add(this.mesh(m, k.startsWith('glass') ? 'glass' : k.startsWith('water') ? 'water' : k.startsWith('glow') ? 'glow' : 'lit'));
    g.userData.parts = {};
    return g;
  }

  /** a sub-part with its own pivot (voxel coords inside the parent) for hinges / spinning */
  part(parent, name, body, glow, at = [0, 0, 0]) {
    const g = this.obj(name, body, glow);
    g.position.set(W(at[0]), W(at[1]), W(at[2]));
    parent.add(g);
    parent.userData.parts[name] = g;
    return g;
  }

  /** a canvas texture on a plane (signs, charts, TV screens). Returns { mesh, ctx, tex } */
  canvasPlane(cw, ch, ww, wh, draw) {
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    draw?.(ctx, cw, ch);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.add(tex);
    const geo = new THREE.PlaneGeometry(ww, wh);
    this.geos.add(geo);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1 });
    this.textures.add(mat); // disposed with the textures
    const mesh = new THREE.Mesh(geo, mat);
    return { mesh, ctx, tex, canvas: c };
  }

  // ------------------------------------------------------------ the room
  /**
   * o: { w, d, h, floor(x, z) -> hex, wall(x, y, z, side) -> hex (side 'back' | 'left' | 'right'),
   *      base: skirting hex, lowFront: side wall height at the front (voxels), windows: [{ side, a0, a1, y0, y1, sky }],
   *      lip: front lip colour, ground: outside ground colour, round: true for a dome-ish burrow (rounded top corners) }
   */
  room(o = {}) {
    const R = this.R, G = this.G;
    const w = o.w || 120, d = o.d || 80, h = o.h || 60;
    this.dims = { w, d, h };
    const x0 = -w / 2, x1 = w / 2 - 1, z0 = -d / 2, z1 = d / 2 - 1;
    const low = o.lowFront ?? 12;
    const floor = o.floor || ((x, z) => tone(x, 0, z, 0xb88050, 0xa0703f, 0xc89060));
    const wall = o.wall || ((x, y, z) => tone(x, y, z, 0xe8d8b0, 0xd8c8a0, 0xf4e8c8));
    for (let x = x0 - 2; x <= x1 + 2; x++)
      for (let z = z0 - 2; z <= z1 + 1; z++) {
        R.set(x, -1, z, floor(x, z));
        R.set(x, -2, z, shade(floor(x, z), 0.7));
      }
    // front lip: a chunky base under the floor so the diorama reads as a little box
    const lip = o.lip ?? 0x6a4a30;
    for (let x = x0 - 2; x <= x1 + 2; x++) for (let y = -6; y <= -3; y++) for (let z = z0 - 2; z <= z1 + 1; z++) {
      if (z < z1 - 1 && x > x0 - 1 && x < x1 + 1 && y < -3) continue; // hollow: only the visible rim
      R.set(x, y, z, y === -3 ? shade(lip, 1.1) : shade(lip, 0.9 + 0.1 * hash3(x, y, z)));
    }
    const sideH = (z) => {
      const k = (z - z0) / (z1 - z0); // 0 back .. 1 front
      return Math.round(h - (h - low) * Math.min(1, Math.max(0, (k - 0.08) / 0.92)) / 4) * 4;
    };
    const roundCut = (a, y, span) => {
      if (!o.round) return false;
      const r = o.round === true ? 18 : o.round;
      const da = Math.min(a, span - a), dy = h - y;
      if (da >= r || dy >= r) return false;
      return Math.hypot(r - da, r - dy) > r;
    };
    // back wall
    for (let x = x0 - 2; x <= x1 + 2; x++)
      for (let y = 0; y < h; y++) {
        if (roundCut(x - (x0 - 2), y, w + 4)) continue;
        for (let z = z0 - 2; z <= z0 - 1; z++) R.set(x, y, z, z === z0 - 1 ? wall(x, y, z, 'back') : shade(wall(x, y, z, 'back'), 0.75));
      }
    // side walls (step down towards the open front)
    for (let z = z0 - 2; z <= z1; z++) {
      const hh = sideH(z);
      for (let y = 0; y < hh; y++) {
        if (roundCut(z - (z0 - 2), y, d * 2.2)) continue;
        R.set(x0 - 1, y, z, wall(x0 - 1, y, z, 'left')); R.set(x0 - 2, y, z, shade(wall(x0 - 1, y, z, 'left'), 0.75));
        R.set(x1 + 1, y, z, wall(x1 + 1, y, z, 'right')); R.set(x1 + 2, y, z, shade(wall(x1 + 1, y, z, 'right'), 0.75));
      }
      // a trim cap on the stepped wall top
      if (o.cap != null) for (const x of [x0 - 2, x0 - 1, x1 + 1, x1 + 2]) R.set(x, hh, z, o.cap);
    }
    if (o.cap != null) for (let x = x0 - 2; x <= x1 + 2; x++) if (!o.round) { R.set(x, h, z0 - 1, o.cap); R.set(x, h, z0 - 2, o.cap); }
    // skirting board
    if (o.base != null) {
      for (let x = x0; x <= x1; x++) for (let y = 0; y < 3; y++) R.set(x, y, z0, y === 2 ? shade(o.base, 1.12) : o.base);
      for (let z = z0; z <= z1; z++) for (let y = 0; y < Math.min(3, sideH(z)); y++) { R.set(x0, y, z, o.base); R.set(x1, y, z, o.base); }
    }
    // windows (holes with a glowing sky behind)
    for (const win of o.windows || []) this.window(win);
    this.sideH = sideH;
    return this;
  }

  /** window in a wall: { side: 'back'|'left'|'right', a0, a1 (x for back, z for sides), y0, y1, frame, sky(u, v) -> hex, round, bars } */
  window(win) {
    const R = this.R, G = this.G;
    const { w, d } = this.dims;
    const x0 = -w / 2, x1 = w / 2 - 1, z0 = -d / 2;
    const frame = win.frame ?? 0xf4ead0;
    const sky = win.sky || ((u, v) => mix(0x9fd6f0, 0xe8f6ff, v));
    const cx = (win.a0 + win.a1) / 2, cy = (win.y0 + win.y1) / 2, rx = (win.a1 - win.a0) / 2 + 0.5, ry = (win.y1 - win.y0) / 2 + 0.5;
    for (let a = win.a0 - 1; a <= win.a1 + 1; a++)
      for (let y = win.y0 - 1; y <= win.y1 + 1; y++) {
        const inside = a >= win.a0 && a <= win.a1 && y >= win.y0 && y <= win.y1;
        const inRound = win.round ? ((a - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 : inside;
        const ring = win.round ? !inRound && ((a - cx) / (rx + 1.2)) ** 2 + ((y - cy) / (ry + 1.2)) ** 2 <= 1 : !inside;
        const pts = win.side === 'back' ? [[a, y, z0 - 1], [a, y, z0 - 2]] : win.side === 'left' ? [[x0 - 1, y, a], [x0 - 2, y, a]] : [[x1 + 1, y, a], [x1 + 2, y, a]];
        if (inRound) {
          const u = (a - win.a0) / Math.max(1, win.a1 - win.a0), v = (y - win.y0) / Math.max(1, win.y1 - win.y0);
          const bar = win.bars !== false && (Math.round(a) === Math.round(cx) || Math.round(y) === Math.round(cy));
          R.set(...pts[0], null);
          if (bar) R.set(...pts[1], frame);
          else { R.set(...pts[1], null); G.set(...pts[1], sky(u, v, a, y)); }
        } else if (ring) {
          R.set(...pts[0], frame);
          const inward = win.side === 'back' ? [a, y, z0] : win.side === 'left' ? [x0, y, a] : [x1, y, a];
          if (y === win.y0 - 1 && !win.round) R.set(...inward, shade(frame, 0.9)); // little sill
        }
      }
  }

  /** a rug / floor decal merged into the room: fn(x, z) -> hex | null over [x0..x1] x [z0..z1] */
  rug(x0, z0, x1, z1, fn) {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const c = fn(x, z); if (c != null) this.R.set(x, 0, z, c); }
  }

  /** static wall / floor decor straight into the room model (voxel coords) */
  deco(fn) { fn(this.R, this.G); }

  // ------------------------------------------------------------ props
  /**
   * Register an interactive prop. obj = Group; x, z (world units), y, rot.
   * def: { label, stand: [x, z] (where Reynard walks to), tap: {...}, talk: true, npc: true }
   */
  prop(id, obj, def = {}) {
    obj.position.set(def.x || 0, def.y || 0, def.z || 0);
    obj.rotation.y = def.rot || 0;
    obj.name = obj.name || id;
    this.group.add(obj);
    obj.traverse((m) => { if (m.isMesh && m.userData.lit) m.userData.baseMat = m.material; });
    const p = { id, obj, label: def.label || id, tap: def.tap || null, stand: def.stand || null, box: new THREE.Box3(), pad: def.pad ?? 0.06 };
    this.props.push(p);
    return p;
  }

  /** static decor object (not interactive) */
  add(obj, x = 0, y = 0, z = 0, rot = 0) {
    obj.position.set(x, y, z); obj.rotation.y = rot;
    this.group.add(obj);
    return obj;
  }

  light(color, intensity, dist, pos, decay = 1.6) {
    const l = new THREE.PointLight(color, intensity, dist, decay);
    l.position.set(...pos);
    this.group.add(l);
    this.lights.push(l);
    return l;
  }

  every(fn) { this.updaters.push(fn); }
  /** run fn(k 0..1) over dur seconds, then done() */
  tween(dur, fn, done) { this.tweens.push({ t: 0, dur, fn, done }); fn(0); }

  /** pixel sprite burst: kind = hearts | sparks | zzz | notes | coins | drops | puff | bubbles */
  fx(kind, pos, n = 5, { spread = 0.25, rise = 0.9, size = 0.13, life = 1.2 } = {}) {
    const rows = FX_ROWS[kind] || SPARK_ROWS;
    const mat = spriteMat(rows);
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(mat);
      s.scale.setScalar(size);
      s.position.set(pos.x + (Math.random() - 0.5) * spread, pos.y + Math.random() * 0.1, pos.z + (Math.random() - 0.5) * spread * 0.6);
      this.group.add(s);
      this.fxList.push({ s, t: -i * 0.08, life, vx: (Math.random() - 0.5) * 0.3, vy: rise * (0.7 + Math.random() * 0.5), size });
    }
  }

  // ------------------------------------------------------------ finish / camera
  finish(o = {}) {
    const { w, d, h } = this.dims;
    const room = this.mesh(this.R);
    room.name = 'RoomShell';
    this.group.add(room, this.mesh(this.G, 'glow'));
    // lights: warm hemi + a soft fill from the open front (the viewer's side)
    const hemi = new THREE.HemisphereLight(o.sky ?? 0xffe8cc, o.ground ?? 0x5a4636, o.hemi ?? 1.6);
    const fill = new THREE.DirectionalLight(o.fill ?? 0xfff0dc, o.fillI ?? 0.8);
    fill.position.set(1.2, 6, 8); fill.target.position.set(0, 0.8, -1);
    this.group.add(hemi, fill, fill.target);
    this.hemi = hemi; this.fillLight = fill;
    // overview framing (room bounds projected on the view plane, 38 degrees down)
    const pitch = (o.pitch ?? 36) * Math.PI / 180, cu = Math.cos(pitch), su = Math.sin(pitch);
    const bx = W(w / 2 + 3), bz0 = W(-d / 2 - 2), bz1 = W(d / 2 + 1), by0 = W(-6), by1 = W(h);
    let y0 = Infinity, y1 = -Infinity;
    for (const y of [by0, by1]) for (const z of [bz0, bz1]) { const sy = y * cu - z * su; y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
    const cy = (y0 + y1) / 2;
    this.view = { target: new THREE.Vector3(0, cy / cu, 0), fit: { w: bx * 2 * 1.08, h: (y1 - y0) * 1.1 }, yaw: o.yaw ?? 0, pitch };
    this.bounds = { x0: W(-w / 2) + 0.25, x1: W(w / 2) - 0.25, z0: W(-d / 2) + 0.35, z1: W(d / 2) - 0.2 };
    this.refreshBoxes();
    return this;
  }

  refreshBoxes() {
    this.group.updateMatrixWorld(true);
    for (const p of this.props) { p.box.makeEmpty(); p.obj.traverse((m) => { if (m.isMesh) { m.geometry.computeBoundingBox?.(); const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld); p.box.union(b); } }); p.box.expandByScalar(p.pad); }
  }

  highlight(p, on) {
    p?.obj.traverse((m) => { if (m.isMesh && m.userData.baseMat) m.material = on ? hiMat(m.geometry) : m.userData.baseMat; });
  }

  update(dt) {
    this.time += dt;
    for (const f of this.updaters) f(dt, this.time);
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k);
      if (k >= 1) { this.tweens.splice(i, 1); tw.done?.(); }
    }
    for (let i = this.fxList.length - 1; i >= 0; i--) {
      const f = this.fxList[i];
      f.t += dt;
      if (f.t < 0) { f.s.visible = false; continue; }
      f.s.visible = true;
      const k = f.t / f.life;
      f.s.position.x += f.vx * dt; f.s.position.y += f.vy * dt * (1 - k * 0.6);
      f.s.scale.setScalar(f.size * (k < 0.15 ? k / 0.15 : k > 0.75 ? Math.max(0.01, (1 - k) / 0.25) : 1));
      if (k >= 1) { f.s.removeFromParent(); this.fxList.splice(i, 1); }
    }
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const t of this.textures) t.dispose();
    this.geos.clear(); this.textures.clear();
    for (const l of this.lights) l.dispose?.();
    this.hemi?.dispose?.(); this.fillLight?.dispose?.();
    this.group.traverse((o) => { if (o.isLight && o.shadow?.map) { o.shadow.map.dispose(); o.shadow.map = null; } });
    this.group.clear();
    this.group.removeFromParent();
    this.props.length = 0; this.updaters.length = 0; this.tweens.length = 0; this.fxList.length = 0;
  }
}

// ================================================================== prop library
// Every maker takes the kit + options and returns a Group (origin = bottom centre of
// its footprint, front = +Z) with userData.parts for the animated bits.
const WOOD = 0xa8743e, WOOD_D = 0x7e5228, WOOD_L = 0xc48c50;
export const PAL = {
  wood: WOOD, woodD: WOOD_D, woodL: WOOD_L, dark: 0x5a3a22, brass: 0xe8c050, brassD: 0xb88e2a, iron: 0x3e3e48, ironL: 0x6a6a78,
  cream: 0xf4e8c8, white: 0xfaf6ea, red: 0xd8403a, redD: 0xa82a28, green: 0x5aae3c, greenD: 0x3e8a2c, blue: 0x5a9ad8, blueD: 0x3a6aa8,
  yellow: 0xffd84a, pink: 0xf08aa8, purple: 0x8a6ac8, ink: 0x2a2028, glass: 0xcfeeff, stone: 0x9a968c, stoneD: 0x7e7a72, leaf: 0x4f9c44, leafL: 0x6ab852,
};
const wcol = (base) => (x, y, z) => tone(x, y, z, base, shade(base, 0.86), shade(base, 1.1), 0.12, 0.1);

/** box of voxels in a fresh model shortcut */
export function vbox(v, x0, y0, z0, x1, y1, z1, c) { v.box(x0, y0, z0, x1, y1, z1, typeof c === 'number' ? c : c); return v; }

/** Cupboard / pantry / fridge with two hinged doors (parts.doorL / doorR) and shelves with stuff. */
export function cupboard(k, { w = 18, h = 26, d = 10, col = WOOD, door = null, knob = PAL.brass, items = null, legs = 2, single = false, glowInside = null } = {}) {
  const b = k.v(), inner = k.v();
  const hx = w / 2;
  b.box(-hx, legs, -d / 2, hx - 1, h - 1, d / 2 - 2, wcol(col));
  // hollow inside
  b.box(-hx + 1, legs + 1, -d / 2 + 1, hx - 2, h - 2, d / 2 - 2, null);
  for (let x = -hx; x < hx; x++) for (const y of [0, 1].slice(0, legs)) for (const z of [-d / 2, d / 2 - 2]) if (x === -hx || x === hx - 1) b.set(x, y, z, shade(col, 0.7));
  b.box(-hx - 1, h, -d / 2 - 1, hx, h, d / 2 - 1, shade(col, 0.85)); // top lip
  // shelves + stuff inside
  const shelves = [legs + Math.round((h - legs) * 0.38), legs + Math.round((h - legs) * 0.7)];
  for (const sy of shelves) b.box(-hx + 1, sy, -d / 2 + 1, hx - 2, sy, d / 2 - 2, shade(col, 0.9));
  const stuff = items || [0xd8403a, 0xffd84a, 0x5aae3c, 0xf4e8c8, 0x5a9ad8, 0xc87a3a];
  let i = 0;
  for (const sy of [legs + 1, ...shelves.map((s) => s + 1)]) {
    for (let x = -hx + 2; x < hx - 3; x += 3 + (i % 2)) {
      const c = stuff[i++ % stuff.length];
      const th = 2 + ((i * 7) % 3);
      if (sy + th >= h - 2) continue;
      b.box(x, sy, -1, x + 1, sy + th, 0, c);
      b.set(x, sy + th + 1, -1, shade(c, 0.7));
    }
  }
  if (glowInside != null) for (let x = -hx + 1; x < hx - 1; x++) inner.set(x, h - 3, -d / 2 + 1, glowInside);
  const g = k.obj('cupboard', b, inner);
  // doors hinged at the outer edges, front face at z = d/2 - 1
  const dc = door ?? shade(col, 1.06);
  const mkDoor = (wid, side) => {
    const v = k.v();
    for (let x = 0; x < wid; x++) for (let y = 0; y < h - legs - 1; y++) {
      const edge = x === 0 || x === wid - 1 || y === 0 || y === h - legs - 2;
      const xx = side < 0 ? x : -x - 1;
      v.set(xx, y, 0, edge ? shade(dc, 0.85) : tone(x, y, side, dc, shade(dc, 0.93), shade(dc, 1.05)));
    }
    const kx = side < 0 ? wid - 2 : -wid + 1;
    v.set(kx, Math.round((h - legs) / 2), 1, knob);
    return v;
  };
  if (single) {
    k.part(g, 'doorL', mkDoor(w, -1), null, [-hx, legs, d / 2 - 1]);
  } else {
    k.part(g, 'doorL', mkDoor(hx, -1), null, [-hx, legs, d / 2 - 1]);
    k.part(g, 'doorR', mkDoor(hx, 1), null, [hx, legs, d / 2 - 1]);
  }
  return g;
}
/** swing a cupboard's doors open (k = 0..1) */
export function openDoors(g, k) {
  const p = g.userData.parts;
  if (p.doorL) p.doorL.rotation.y = -k * 1.9;
  if (p.doorR) p.doorR.rotation.y = k * 1.9;
}

/** Bookshelf / open shelf with books, jars or custom items fn(v, x, y) */
export function bookshelf(k, { w = 24, h = 34, d = 8, col = WOOD_D, rows = 4, books = null, fill = null } = {}) {
  const b = k.v();
  const hx = w / 2;
  b.box(-hx, 0, -d / 2, hx - 1, h - 1, d / 2 - 1, wcol(col));
  b.box(-hx + 1, 1, -d / 2 + 1, hx - 2, h - 2, d / 2 - 1, null);
  const step = Math.floor((h - 2) / rows);
  const cols = books || [0xc8402a, 0x3a6aa8, 0x5aae3c, 0xe8c050, 0x8a6ac8, 0xf4e8c8, 0xd87a3a, 0x2a5a4a];
  let n = 0;
  for (let r = 0; r < rows; r++) {
    const y = 1 + r * step;
    if (r > 0) b.box(-hx + 1, y - 1, -d / 2 + 1, hx - 2, y - 1, d / 2 - 1, shade(col, 1.1));
    if (fill) { fill(b, y, step - 1, hx, d, r); continue; }
    for (let x = -hx + 1; x < hx - 1; x++) {
      n++;
      if (hash3(x, r, 5) < 0.12) continue;
      const bh = step - 2 - Math.floor(hash3(x, r, 9) * 3);
      const c = cols[Math.floor(hash3(Math.floor(x / 2), r, 3) * cols.length)];
      b.box(x, y, -d / 2 + 2, x, y + bh - 1, d / 2 - 2, (xx, yy) => (yy === y + bh - 2 ? shade(c, 1.2) : c));
    }
  }
  return k.obj('bookshelf', b);
}

export function table(k, { w = 24, d = 16, h = 14, col = WOOD, cloth = null, round = false } = {}) {
  const b = k.v();
  const hx = w / 2, hz = d / 2;
  if (round) ell(b, 0, h, 0, hx, 1, hz, wcol(col)); else b.box(-hx, h - 1, -hz, hx - 1, h, hz - 1, wcol(col));
  if (cloth != null) {
    if (round) ell(b, 0, h + 1, 0, hx * 0.8, 0.6, hz * 0.8, (x, y, z) => ((Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? cloth : PAL.white));
    else b.box(-hx + 2, h + 1, -hz + 2, hx - 3, h + 1, hz - 3, (x, y, z) => ((Math.floor(x / 2) + Math.floor(z / 2)) % 2 ? cloth : PAL.white));
  }
  const legs = round ? [[-1, -1], [0, 0]] : [[-hx + 1, -hz + 1], [hx - 2, -hz + 1], [-hx + 1, hz - 2], [hx - 2, hz - 2]];
  if (round) b.box(-1, 0, -1, 0, h - 2, 0, shade(col, 0.8)), b.box(-4, 0, -4, 3, 0, 3, shade(col, 0.8));
  else for (const [x, z] of legs) b.box(x, 0, z, x, h - 2, z, shade(col, 0.8));
  return k.obj('table', b);
}

export function stool(k, { col = WOOD, h = 9, r = 4, cushion = null } = {}) {
  const b = k.v();
  b.cylinder(-0.5, h - 1, -0.5, r, 2, wcol(col));
  if (cushion != null) b.cylinder(-0.5, h + 1, -0.5, r - 1, 1, cushion);
  for (const [x, z] of [[-r + 1, -r + 1], [r - 2, -r + 1], [-r + 1, r - 2], [r - 2, r - 2]]) b.box(x, 0, z, x, h - 2, z, shade(col, 0.8));
  return k.obj('stool', b);
}

export function armchair(k, { col = 0xb85a4a, wood = WOOD_D, w = 18, d = 16 } = {}) {
  const b = k.v();
  const hx = w / 2, hz = d / 2;
  const c = (x, y, z) => tone(x, y, z, col, shade(col, 0.88), shade(col, 1.08));
  rbox(b, -hx, hx - 1, 2, 8, -hz, hz - 1, 2, c); // seat
  rbox(b, -hx, hx - 1, 2, 22, -hz, -hz + 4, 2, c); // back
  rbox(b, -hx, -hx + 3, 2, 13, -hz, hz - 1, 1, c); rbox(b, hx - 4, hx - 1, 2, 13, -hz, hz - 1, 1, c); // arms
  rbox(b, -hx + 4, hx - 5, 9, 10, -hz + 5, hz - 2, 1, shade(col, 1.15)); // cushion
  for (const [x, z] of [[-hx + 1, -hz + 1], [hx - 2, -hz + 1], [-hx + 1, hz - 2], [hx - 2, hz - 2]]) b.box(x, 0, z, x, 1, z, wood);
  return k.obj('armchair', b);
}

export function bed(k, { w = 26, d = 40, col = WOOD, blanket = 0x5a9ad8, pillow = PAL.white, h = 8, head = 18 } = {}) {
  const b = k.v();
  const hx = w / 2, hz = d / 2;
  b.box(-hx, 2, -hz, hx - 1, h - 3, hz - 1, wcol(col));
  b.box(-hx + 1, h - 2, -hz + 1, hx - 2, h - 1, hz - 2, 0xf4f0e4); // mattress
  b.box(-hx, 0, -hz, hx - 1, head, -hz + 1, wcol(shade(col, 1.05))); // headboard
  b.box(-hx, 0, hz - 2, hx - 1, h + 3, hz - 1, wcol(col)); // footboard
  for (const [x, z] of [[-hx, -hz], [hx - 1, -hz], [-hx, hz - 1], [hx - 1, hz - 1]]) b.box(x, 0, z, x, 1, z, shade(col, 0.7));
  rbox(b, -hx + 3, hx - 4, h, h + 2, -hz + 2, -hz + 8, 1, pillow);
  b.box(-hx, h - 2, -hz + 12, hx - 1, h, hz - 3, (x, y, z) => ((Math.floor(x / 3) + Math.floor(z / 3)) % 2 ? blanket : shade(blanket, 1.18)));
  b.box(-hx, 3, -hz + 12, -hx, h - 2, hz - 3, shade(blanket, 0.9)); b.box(hx - 1, 3, -hz + 12, hx - 1, h - 2, hz - 3, shade(blanket, 0.9));
  return k.obj('bed', b);
}

/** Oven / stove with a fire box (parts.fire: glowing, hidden until lit) and a chimney pipe */
export function stove(k, { w = 22, h = 18, d = 14, col = 0x3e3e48, brick = false, pipe = 30, pot = null } = {}) {
  const b = k.v(), fire = k.v();
  const hx = w / 2, hz = d / 2;
  const c = brick ? (x, y, z) => ((y % 3 === 0) || ((x + (Math.floor(y / 3) % 2) * 2) % 4 === 0) ? 0xd8c8b0 : tone(x, y, z, 0xb8583a, 0x9a4a30, 0xc8684a)) : wcol(col);
  b.box(-hx, 0, -hz, hx - 1, h - 1, hz - 1, c);
  if (brick) for (let x = -hx; x < hx; x++) for (let z = -hz; z < hz; z++) { const dx = x + 0.5, r = Math.sqrt(Math.max(0, hx * hx - dx * dx)); for (let y = h; y < h + r * 0.6; y++) b.set(x, y, z, c(x, y, z)); }
  // fire box opening
  const fy0 = 3, fy1 = Math.round(h * 0.55);
  b.box(-hx + 4, fy0, hz - 2, hx - 5, fy1, hz - 1, null);
  b.box(-hx + 4, fy0, hz - 3, hx - 5, fy0, hz - 3, 0x2a2028);
  b.box(-hx + 3, fy1 + 1, hz, hx - 4, fy1 + 1, hz, PAL.brass);
  for (let x = -hx + 5; x < hx - 5; x++) for (let y = fy0; y <= fy0 + 4; y++) if (hash3(x, y, 1) < 0.85 - (y - fy0) * 0.15) fire.set(x, y, hz - 3, y < fy0 + 2 ? 0xffd040 : hash3(x, y, 2) < 0.5 ? 0xff8a20 : 0xffb030);
  b.box(-hx + 5, fy0, hz - 4, hx - 6, fy0, hz - 4, 0x4a3020); // logs
  if (!brick) {
    b.box(-hx, h, -hz, hx - 1, h, hz - 1, 0x2a2a32);
    for (const x of [-hx + 4, hx - 6]) b.cylinder(x + 0.5, h + 1, -0.5, 2, 1, 0x1a1a22);
    if (pipe) b.box(hx - 6, h + 1, -hz, hx - 3, h + pipe, -hz + 3, 0x4a4a52);
  }
  if (pot) { b.cylinder(-hx + 4.5, h + 1, -0.5, 4, 5, pot); b.cylinder(-hx + 4.5, h + 6, -0.5, 3, 1, shade(pot, 0.7)); }
  const g = k.obj('stove', b);
  const f = k.part(g, 'fire', null, fire, [0, 0, 0]);
  f.visible = false;
  return g;
}

export function lamp(k, { col = 0x6a4a30, shadeCol = 0xf8d890, h = 28, table = false } = {}) {
  const b = k.v(), gl = k.v();
  const hh = table ? 8 : h;
  b.cylinder(-0.5, 0, -0.5, table ? 3 : 4, 1, col);
  b.box(-1, 1, -1, 0, hh, 0, col);
  const sh = k.v();
  for (let y = 0; y < 6; y++) { const r = 5 - y * 0.4; sh.cylinder(-0.5, y, -0.5, r, 1, (x, yy, z) => (Math.hypot(x + 0.5, z + 0.5) > r - 1.2 ? shadeCol : null)); }
  gl.box(-1, hh + 1, -1, 0, hh + 2, 0, 0xfff4c0);
  const g = k.obj('lamp', b, gl);
  const s = k.part(g, 'shade', sh, null, [0, hh + 1, 0]);
  s.userData.col = shadeCol;
  return g;
}

export function plant(k, { pot = 0xc86a3a, leaf = PAL.leaf, flower = null, h = 10, r = 3 } = {}) {
  const b = k.v();
  b.cylinder(-0.5, 0, -0.5, r, 4, (x, y) => (y === 3 ? shade(pot, 1.1) : pot));
  b.cylinder(-0.5, 3, -0.5, r - 1, 1, 0x5a3a22);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, rr = 1 + (i % 3);
    const x = Math.round(Math.cos(a) * rr), z = Math.round(Math.sin(a) * rr);
    const top = 5 + Math.round(h * (0.5 + 0.5 * hash3(i, 1, 1)));
    for (let y = 4; y <= top; y++) b.set(x + (y > top - 2 ? Math.sign(x) : 0), y, z, y > top - 3 ? shade(leaf, 1.15) : leaf);
    if (flower != null && i % 3 === 0) b.set(x + Math.sign(x), top + 1, z, flower);
  }
  return k.obj('plant', b);
}

export function barrel(k, { col = 0x9a6a3a, h = 14, r = 6, lid = true } = {}) {
  const b = k.v();
  b.cylinder(-0.5, 0, -0.5, r, h, (x, y, z) => (y === 2 || y === h - 3 ? PAL.iron : Math.abs(y - h / 2) < 1 ? shade(col, 1.1) : ((Math.round(Math.atan2(z + 0.5, x + 0.5) * 4) % 2) ? col : shade(col, 0.9))));
  if (!lid) b.cylinder(-0.5, h - 1, -0.5, r - 1, 1, null);
  return k.obj('barrel', b);
}

export function crate(k, { w = 12, h = 10, d = 10, col = 0xc89a5a, stuff = null } = {}) {
  const b = k.v();
  const hx = w / 2, hz = d / 2;
  b.box(-hx, 0, -hz, hx - 1, h - 1, hz - 1, (x, y, z) => (x === -hx || x === hx - 1 || y === 0 || y === h - 1 || z === -hz || z === hz - 1) && ((x === -hx || x === hx - 1) + (y === 0 || y === h - 1) + (z === -hz || z === hz - 1) >= 2) ? shade(col, 0.75) : (y % 3 === 0 ? shade(col, 0.9) : col));
  if (stuff) { b.box(-hx + 1, h - 1, -hz + 1, hx - 2, h - 1, hz - 2, null); for (let x = -hx + 1; x < hx - 1; x++) for (let z = -hz + 1; z < hz - 1; z++) b.set(x, h - 1 + (hash3(x, 0, z) < 0.5 ? 1 : 0), z, stuff[Math.floor(hash3(x, 1, z) * stuff.length)]); }
  return k.obj('crate', b);
}

/** grandfather / wall clock with a swinging pendulum (parts.pend) and a little cuckoo door bird (parts.bird) */
export function clock(k, { col = WOOD_D, h = 40, wall = false, cuckoo = false, face = PAL.cream } = {}) {
  const b = k.v();
  const top = h;
  if (!wall) b.box(-5, 0, -3, 4, top - 12, 2, wcol(col));
  const fy = wall ? 6 : top - 11;
  b.box(-6, fy, -3, 5, fy + 11, 2, wcol(col));
  if (cuckoo) for (let y = 0; y < 5; y++) b.box(-7 + y, fy + 12 + y, -3, 6 - y, fy + 12 + y, 3, shade(col, 0.85));
  ell(b, -0.5, fy + 6, 3, 4.2, 4.2, 0.6, face);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; b.set(Math.round(-0.5 + Math.cos(a) * 3.3), Math.round(fy + 6 + Math.sin(a) * 3.3), 4, PAL.ink); }
  b.box(-1, fy + 6, 4, -1, fy + 9, 4, PAL.ink); b.box(-1, fy + 6, 4, 1, fy + 6, 4, PAL.ink);
  if (!wall) b.box(-3, 3, 2, 2, top - 14, 2, 0x2a2028);
  const g = k.obj('clock', b);
  const pv = k.v();
  const len = wall ? 12 : top - 18;
  pv.box(0, -len, 0, 0, 0, 0, PAL.brassD);
  ell(pv, 0.5, -len, 0.5, 2, 2, 1, PAL.brass);
  const pend = k.part(g, 'pend', pv, null, wall ? [-1, fy, 1] : [-1, top - 14, 2]);
  pend.userData.wall = wall;
  if (cuckoo) {
    const bv = k.v();
    ell(bv, 0, 2, 0, 2, 2, 2, 0xa86a3a); bv.set(0, 3, 2, PAL.ink); bv.box(-1, 2, 2, 0, 2, 3, 0xffb030);
    const bird = k.part(g, 'bird', bv, null, [0, fy + 13, 0]);
    bird.visible = false;
  }
  return g;
}

/** wall picture frame: art(v, w, h) paints into a plane at z = 0 */
export function frame(k, { w = 14, h = 10, col = WOOD_D, art = null } = {}) {
  const b = k.v();
  for (let x = -1; x <= w; x++) for (let y = -1; y <= h; y++) {
    const edge = x === -1 || x === w || y === -1 || y === h;
    if (edge) b.set(x - w / 2, y, 0, col);
    else b.set(x - w / 2, y, 0, art ? art(x, y) : mix(0x9fd6f0, 0x6ab852, y < h / 2 ? 1 : 0));
  }
  return k.obj('frame', b);
}

/** Glass fish tank on a stand: parts.fish swims (set userData.swim = false to stop), parts.food for flakes */
export function tank(k, { w = 26, h = 16, d = 12, stand = 10, col = WOOD_D, fish = null } = {}) {
  const b = k.v(), water = k.v(), glass = k.v();
  const hx = w / 2, hz = d / 2;
  b.box(-hx - 1, 0, -hz - 1, hx, stand - 1, hz, wcol(col));
  b.box(-hx - 1, stand, -hz - 1, hx, stand, hz, 0x2a2a32);
  b.box(-hx - 1, stand + h + 1, -hz - 1, hx, stand + h + 1, hz, 0x2a2a32);
  for (const [x, z] of [[-hx - 1, -hz - 1], [hx, -hz - 1], [-hx - 1, hz], [hx, hz]]) b.box(x, stand + 1, z, x, stand + h, z, 0x2a2a32);
  for (let x = -hx; x < hx; x++) for (let z = -hz; z < hz; z++) { b.set(x, stand + 1, z, hash3(x, 0, z) < 0.5 ? 0xe8d8a8 : 0xc8b888); if (hash3(x, 3, z) < 0.05) b.set(x, stand + 2, z, 0x8a8a92); }
  // weeds
  for (const [x, z, t] of [[-hx + 2, -hz + 2, 10], [-hx + 4, -hz + 3, 7], [hx - 3, -hz + 2, 12], [hx - 5, -hz + 4, 6]]) for (let y = 0; y < t; y++) b.set(x + (y % 4 < 2 ? 0 : 1), stand + 2 + y, z, y % 3 ? 0x3e9a4a : 0x5aba5a);
  // a little castle
  b.box(2, stand + 2, -hz + 2, 6, stand + 7, -hz + 5, 0xb8b0a0); b.box(3, stand + 4, -hz + 5, 4, stand + 5, -hz + 5, 0x2a2028);
  water.box(-hx, stand + 2, -hz, hx - 1, stand + h - 2, hz - 1, (x, y) => (y === stand + h - 2 ? 0x9ad8f0 : 0x4a9ad0));
  // glass panes (front + sides)
  glass.box(-hx, stand + 1, hz, hx - 1, stand + h, hz, PAL.glass);
  const g = k.obj('tank', b, null, { water, glass });
  const fv = k.v();
  if (fish) fish(fv); else { ell(fv, 0, 0, 0, 3.5, 2, 1.5, 0xe8a030); fv.box(-6, -2, 0, -4, 2, 0, 0xd88a20); fv.set(2, 1, 1, PAL.ink); fv.set(2, 1, -2, PAL.ink); }
  const f = k.part(g, 'fish', fv, null, [0, stand + 7, 0]);
  f.userData.home = f.position.clone();
  f.userData.swim = true;
  f.userData.hx = W(hx - 6); f.userData.hz = W(hz - 3);
  return g;
}

/** record player / gramophone with a spinning disc (parts.disc) and a brass horn */
export function gramophone(k, { col = WOOD_D, horn = PAL.brass, table = 0 } = {}) {
  const b = k.v();
  b.box(-6, table, -6, 5, table + 4, 5, wcol(col));
  const disc = k.v();
  disc.cylinder(-0.5, 0, -0.5, 5, 1, (x, y, z) => (Math.hypot(x + 0.5, z + 0.5) < 1.6 ? 0xd8403a : (Math.round(Math.hypot(x + 0.5, z + 0.5)) % 2 ? 0x1a1a22 : 0x2a2a32)));
  b.box(3, table + 5, 3, 3, table + 7, 3, PAL.ironL);
  // horn
  for (let i = 0; i < 12; i++) { const r = 1 + i * 0.45; ell(b, -2 - i * 0.2, table + 8 + i, -3 - i * 0.6, r, r * 0.5, r, i > 9 ? shade(horn, 1.1) : horn); }
  for (let i = 0; i < 12; i++) ell(b, -2 - i * 0.2, table + 8.8 + i, -3 - i * 0.6, Math.max(0, 0.6 + i * 0.4), 0.5, Math.max(0, 0.6 + i * 0.4), null);
  b.box(-2, table + 5, -3, -1, table + 8, -2, horn);
  const g = k.obj('gramophone', b);
  k.part(g, 'disc', disc, null, [0, table + 5, 0]);
  return g;
}

/** a desk / shop bell (parts.bell: wobbles when rung) */
export function bell(k, { col = PAL.brass, hang = false } = {}) {
  const g = k.obj('bell', null);
  const bv = k.v();
  for (let y = 0; y < 5; y++) { const r = 3.2 - y * 0.55; bv.cylinder(-0.5, hang ? -y - 1 : y, -0.5, r, 1, y === 0 ? shade(col, 0.85) : col); }
  bv.set(-1, hang ? -6 : 5, -1, shade(col, 1.2));
  if (!hang) { const base = k.v(); base.cylinder(-0.5, -1, -0.5, 4, 1, WOOD_D); g.add(k.mesh(base)); }
  k.part(g, 'bell', bv, null, [0, hang ? 0 : 1, 0]);
  return g;
}

export function chest(k, { w = 16, h = 9, d = 10, col = 0x8a5a2e, band = PAL.brass, gold = true } = {}) {
  const b = k.v(), gl = k.v();
  const hx = w / 2, hz = d / 2;
  b.box(-hx, 0, -hz, hx - 1, h - 1, hz - 1, (x, y, z) => (x === -hx + 2 || x === hx - 3 ? band : wcol(col)(x, y, z)));
  b.box(-hx + 1, h - 1, -hz + 1, hx - 2, h - 1, hz - 2, null);
  if (gold) for (let x = -hx + 1; x < hx - 1; x++) for (let z = -hz + 1; z < hz - 1; z++) gl.set(x, h - 2 + (hash3(x, 2, z) < 0.4 ? 1 : 0), z, hash3(x, 1, z) < 0.3 ? 0xfff0a0 : 0xf0c030);
  b.set(-0.5, h - 3, hz, band); b.set(0, h - 3, hz, band);
  const g = k.obj('chest', b, gold ? gl : null);
  const lid = k.v();
  for (let x = -hx; x < hx; x++) for (let z = 0; z < d; z++) for (let y = 0; y < 4; y++) { const r = Math.hypot(z - d / 2 + 0.5, y * 1.6); if (r < d / 2 + 0.3) lid.set(x, y, z, x === -hx + 2 || x === hx - 3 ? band : wcol(col)(x, y, z)); }
  k.part(g, 'lid', lid, null, [0, h, -hz]);
  return g;
}

export function rugOval(k, cx, cz, rx, rz, cols) {
  k.rug(Math.floor(cx - rx), Math.floor(cz - rz), Math.ceil(cx + rx), Math.ceil(cz + rz), (x, z) => {
    const r = Math.hypot((x + 0.5 - cx) / rx, (z + 0.5 - cz) / rz);
    if (r > 1) return null;
    return cols[Math.min(cols.length - 1, Math.floor(r * cols.length))];
  });
}

/** kettle / teapot (parts.lid hops when it boils) */
export function teapot(k, { col = 0x5a9ad8, at = 0 } = {}) {
  const b = k.v();
  ell(b, 0, at + 3, 0, 4, 3, 3.5, col);
  b.box(3, at + 3, 0, 6, at + 4, 0, col); b.set(6, at + 5, 0, col);
  b.box(-6, at + 2, 0, -4, at + 5, 0, shade(col, 0.85)); b.set(-5, at + 3, 0, null);
  const g = k.obj('teapot', b);
  const lv = k.v(); ell(lv, 0, 0, 0, 2, 1, 2, shade(col, 1.12)); lv.set(0, 1, 0, PAL.white);
  k.part(g, 'lid', lv, null, [0, at + 6, 0]);
  return g;
}

/** steam puffs for cups / pots: call steam.update via k.every */
export function steamer(k, pos, { n = 4, rise = 0.5, rate = 0.3, size = 0.07 } = {}) {
  const mat = spriteMat(PUFF_ROWS);
  const list = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(size);
    s.userData.t = i / n;
    k.group.add(s);
    list.push(s);
  }
  const st = { on: true, list };
  k.every((dt) => {
    for (const s of list) {
      s.userData.t = (s.userData.t + dt * rate) % 1;
      const t = s.userData.t;
      s.visible = st.on;
      s.position.set(pos.x + Math.sin(t * 6 + s.id) * 0.05 * t, pos.y + t * rise, pos.z);
      s.scale.setScalar(size * (0.6 + t) * Math.sin(Math.max(0.05, t) * Math.PI));
    }
  });
  return st;
}

/** generic pixel sign on a plank (canvas), e.g. chalkboards / labels */
export function sign(k, text, { w = 0.7, h = 0.28, bg = '#f4e8c8', fg = '#3a2a1a', border = '#6a4a30', px = 2 } = {}) {
  const cw = Math.round(w * 80), ch = Math.round(h * 80);
  const { mesh } = k.canvasPlane(cw, ch, w, h, (ctx) => {
    ctx.fillStyle = border; ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = bg; ctx.fillRect(px, px, cw - px * 2, ch - px * 2);
    ctx.fillStyle = fg;
    ctx.font = `bold ${Math.round(ch * 0.5)}px "TBME Title", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, cw / 2, ch / 2 + 1);
  });
  return mesh;
}
