// Felling trees: the physics and the show. While the beavers gnaw, the tile's
// tree sprites are lifted out of the world's static tree batch into their own
// quads (same atlas frame, tint and size) so they can shake, lean and get a
// notch bitten into them. When the cut is done the tree tips over AWAY from
// the beaver, swinging round its base with real angular acceleration
// (a rod pivoting on the ground: alpha = 3g / 2L * sin(theta)), crashes with
// dust, a leaf burst in the tree's own colours, a camera nudge and TIMBER!,
// bounces, wobbles and settles, then pops apart into 2-3 logs. Logs lie on the
// ground as pickup items until a beaver hauls them to a Wood Garage
// (BeaverSystem does the hauling; this file owns the logs themselves).
//
// The tree falls sideways on screen (along the camera's right axis, a little
// randomised), so the billboard keeps facing the camera and still reads as the
// same pixel-art tree all the way down.
//
// Logs on the ground are kept in game.state.groundLogs ([[x, z, rot, variant]])
// so they save and load with the rest of the state.
import * as THREE from 'three';
import { SPRITE_UNIFORMS } from '../core/spriteBatch.js';
import { voxelMaterial } from '../core/voxel.js';
import { makeLogGeometry } from '../entities/extra/woodGarageModel.js';

// ---- tuning
export const FALL = {
  gravity: 15, // "g" for the tipping rod (bigger = snappier fall)
  startAngle: 0.05, // rad of lean when the last fibres snap
  bounce: 0.28, // angular velocity kept on the crash rebound
  lieTime: 1.1, // s the trunk lies there before splitting
  logLen: 0.62, logR: 2.6, // ground log size (length in units, radius in 0.05 voxels)
  logsTree: 2, logsForest: 3,
  shakeMax: 0.075, // rad of trunk wobble at the end of the chop
};

const _v = new THREE.Vector3();
const LEAFY = [0x2b5634, 0x3a6b3c, 0x4f8a44];

let quadMat = null;
function spriteQuad(tex, d) {
  // corners like SpriteBatch: (corner - anchor) * size, uv from the atlas rect
  const [w, h] = d.size, [ax, ay] = d.anchor;
  let [u0, vt, u1, vb] = d.uv;
  if (d.flip) [u0, u1] = [u1, u0];
  const geo = new THREE.BufferGeometry();
  const P = [], U = [];
  for (const [cx, cy] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    P.push((cx - ax) * w, (cy - ay) * h, 0);
    U.push(cx ? u1 : u0, cy ? vt : vb);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0.6, 0.8, 0, 0.6, 0.8, 0, 0.6, 0.8, 0, 0.6, 0.8], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  if (!quadMat) quadMat = new Map();
  const key = tex.uuid + (d.emissive ? 'e' : '');
  let base = quadMat.get(key);
  if (!base) {
    base = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
    quadMat.set(key, base);
  }
  const mat = base.clone();
  mat.color.setRGB(d.tint[0], d.tint[1], d.tint[2]);
  if (d.emissive) { mat.emissive.setRGB(d.tint[0], d.tint[1], d.tint[2]); mat.emissiveIntensity = d.emissive; mat.emissiveMap = tex; }
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  // the shadow pass needs the same cut-out
  m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
  return m;
}

// the pale bitten notch: a little hourglass of light wood with dark edges
let notchGeo = null, notchMat = null;
function notchMesh() {
  if (!notchGeo) {
    const cv = document.createElement('canvas');
    cv.width = 8; cv.height = 6;
    const c = cv.getContext('2d');
    const rows = ['DDDDDDDD', '.DLLLLD.', '..DLLD..', '..DLLD..', '.DLLLLD.', 'DDDDDDDD'];
    rows.forEach((r, y) => { for (let x = 0; x < 8; x++) { if (r[x] === '.') continue; c.fillStyle = r[x] === 'D' ? '#5a3418' : '#f0d49a'; c.fillRect(x, y, 1, 1); } });
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    notchGeo = new THREE.PlaneGeometry(1, 1);
    notchMat = new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide });
  }
  return new THREE.Mesh(notchGeo, notchMat);
}

export class TreeFall {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'treeFall';
    game.scene.add(this.group);
    this.trees = new Map(); // tile -> lifted tree (standing, falling, lying)
    this.logs = [];
    this.logId = 1;
    this.time = 0;
    this._tiles = null;
  }

  get world() { return this.game.world; }

  clear() {
    for (const t of this.trees.values()) this.dropTree(t);
    this.trees.clear();
    for (const l of this.logs) this.group.remove(l.mesh);
    this.logs.length = 0;
  }

  // ------------------------------------------------------------ lifting sprites
  // read the tile's sprites out of the static batch and hide them there
  grab(i) {
    const w = this.world, B = w.treeBatch;
    const l = w.treeTiles?.get(i);
    if (!B || !l?.length) return [];
    const A = B.attr;
    const out = [];
    for (const [bi, tint, em] of l) {
      if (bi < 0 || bi >= B.count) continue;
      const base = B.baseSize ? [B.baseSize[bi * 2], B.baseSize[bi * 2 + 1]] : [A.aSize.array[bi * 2], A.aSize.array[bi * 2 + 1]];
      if (base[1] < 0.05) continue;
      out.push({
        bi, pos: [...A.aPos.array.slice(bi * 3, bi * 3 + 3)], size: base, anchor: [...A.aAnchor.array.slice(bi * 2, bi * 2 + 2)],
        uv: [...A.aUV.array.slice(bi * 4, bi * 4 + 4)], flip: A.aExtra.array[bi * 4] < 0, tint: tint || [1, 1, 1], emissive: em || 0,
      });
      B.setScale(bi, 0, 0);
    }
    B.commit();
    return out;
  }

  // a beaver starts gnawing: swap the batch sprites for our own quads
  lift(i) {
    let t = this.trees.get(i);
    if (t) return t;
    const sprites = this.grab(i);
    const g = this.game.grid;
    const x = i % g.w, z = Math.floor(i / g.w);
    t = { i, x: x + 0.5, z: z + 0.5, state: 'stand', parts: [], progress: 0, shake: 0, kick: 0, tilt: 0, creakT: 0, sign: 1, colors: null };
    const tex = this.world.natureFrames().tex;
    for (const s of sprites) {
      const pivot = new THREE.Group();
      pivot.position.set(s.pos[0], s.pos[1], s.pos[2]);
      const mesh = spriteQuad(tex, s);
      pivot.add(mesh);
      this.group.add(pivot);
      t.parts.push({ s, pivot, mesh, theta: 0, omega: 0, y0: s.pos[1], h: s.size[1], w: s.size[0], seed: Math.random() * 6 });
    }
    // the tallest one is "the" tree (it gets the notch and makes the logs)
    t.parts.sort((a, b) => b.h - a.h);
    if (t.parts[0]) {
      const p = t.parts[0];
      p.notch = notchMesh();
      p.notch.position.set(0, Math.min(0.22, p.h * 0.1), 0.02);
      p.notch.scale.setScalar(0.001);
      p.mesh.add(p.notch);
      t.colors = this.leafColors(p.s);
    }
    this.trees.set(i, t);
    this._tiles = this.world.treeTiles;
    return t;
  }

  // cancelled before it came down: put the sprites back
  unlift(i) {
    const t = this.trees.get(i);
    if (!t || t.state !== 'stand') return;
    const B = this.world.treeBatch;
    for (const p of t.parts) B?.setScale(p.s.bi, 1, 1);
    B?.commit();
    this.dropTree(t);
    this.trees.delete(i);
  }

  dropTree(t) {
    for (const p of t.parts) {
      this.group.remove(p.pivot);
      p.mesh.material.dispose();
      p.mesh.customDepthMaterial?.dispose();
      p.mesh.geometry.dispose();
    }
    t.parts.length = 0;
  }

  // the tree's own leaf colours (sampled once from the atlas) for the burst
  leafColors(s) {
    try {
      const img = this.world.natureFrames().tex.image;
      const ctx = img.getContext?.('2d', { willReadFrequently: true });
      if (!ctx) return LEAFY;
      const W = img.width, H = img.height;
      const x0 = Math.round(Math.min(s.uv[0], s.uv[2]) * W), x1 = Math.round(Math.max(s.uv[0], s.uv[2]) * W);
      const y0 = Math.round((1 - s.uv[1]) * H), y1 = Math.round((1 - s.uv[3]) * H);
      const hgt = Math.max(1, Math.floor((y1 - y0) * 0.6));
      const d = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), hgt).data;
      const counts = new Map();
      for (let k = 0; k < d.length; k += 4) {
        if (d[k + 3] < 128) continue;
        const r = d[k], gg = d[k + 1], b = d[k + 2];
        if (r + gg + b < 90) continue; // outline
        const c = (r << 16) | (gg << 8) | b;
        counts.set(c, (counts.get(c) || 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map((e) => e[0]);
      return top.length ? top : LEAFY;
    } catch { return LEAFY; }
  }

  // ------------------------------------------------------------ chopping feedback
  // progress 0..1 from BeaverSystem; `from` = the beaver's position
  setProgress(i, k, from) {
    const t = this.lift(i);
    if (t.state !== 'stand') return t;
    t.progress = k;
    if (from) this.aim(t, from);
    return t;
  }

  // fall direction: along the camera's right axis, away from the beaver
  aim(t, from) {
    const cam = this.game.rig?.camera;
    let rx = 1, rz = 0;
    if (cam) { const e = cam.matrixWorld.elements; rx = e[0]; rz = e[2]; const n = Math.hypot(rx, rz) || 1; rx /= n; rz /= n; }
    const side = (t.x - from.x) * rx + (t.z - from.z) * rz;
    if (Math.abs(side) > 0.05 || !t.signSet) { t.sign = side < 0 ? -1 : 1; t.signSet = true; }
    t.rx = rx; t.rz = rz;
  }

  // one bite of the teeth: a kick to the wobble
  bite(i, power = 1) {
    const t = this.trees.get(i);
    if (!t || t.state !== 'stand') return;
    t.kick = Math.min(1.5, t.kick + 0.6 * power);
  }

  // ------------------------------------------------------------ the fall
  // nLogs: how many logs the trunk splits into; returns false if nothing to drop
  fell(i, from, nLogs) {
    const t = this.lift(i);
    if (from) this.aim(t, from);
    t.state = 'fall';
    t.nLogs = nLogs;
    t.t = 0;
    t.hits = 0;
    if (t.rx == null) { t.rx = 1; t.rz = 0; }
    // the fall plane: x along the fall direction (jittered a little), y up
    const jit = (Math.random() - 0.5) * 0.35;
    const dx = t.rx * Math.cos(jit) - t.rz * Math.sin(jit), dz = t.rx * Math.sin(jit) + t.rz * Math.cos(jit);
    t.dir = [dx * t.sign, dz * t.sign];
    for (const p of t.parts) {
      p.pivot.rotation.set(0, Math.atan2(-dz, dx), 0); // local +x = camera right (unsigned)
      p.theta = FALL.startAngle + t.tilt + Math.random() * 0.02;
      p.omega = 0.25 + Math.random() * 0.15;
      p.delay = p === t.parts[0] ? 0 : 0.15 + Math.random() * 0.35; // the smaller trees go a beat later
    }
    const game = this.game;
    game.audio.play('bed_creak', { volume: 0.55, pitch: 0.45 });
    game.audio.play('whoosh', { volume: 0.35, pitch: 0.6, delay: 0.5 });
    if (!t.parts.length) this.split(t); // a treeless forest tile: logs straight away
    return true;
  }

  // ------------------------------------------------------------ update
  update(dt) {
    this.time += dt;
    const game = this.game;
    // the world rebuilt its tree batch: hide our lifted sprites again
    if (this.world.treeTiles && this._tiles !== this.world.treeTiles) {
      this._tiles = this.world.treeTiles;
      const B = this.world.treeBatch;
      for (const t of this.trees.values()) {
        if (t.state !== 'stand') continue;
        const l = this.world.treeTiles.get(t.i) || [];
        t.parts.forEach((p, k) => { if (l[k]) p.s.bi = l[k][0]; });
        for (const [bi] of l) B.setScale(bi, 0, 0);
      }
      B?.commit();
    }
    const comp = SPRITE_UNIFORMS.uHeightComp.value;
    for (const t of [...this.trees.values()]) {
      if (t.state === 'stand') {
        // cancelled? put it back
        const c = game.beavers?.clears.get(t.i);
        if (!c) { this.unlift(t.i); continue; }
        const k = t.progress;
        t.kick = Math.max(0, t.kick - dt * 4);
        // creaks and a slow lean in the last stretch
        t.tilt = k > 0.82 ? ((k - 0.82) / 0.18) ** 2 * 0.05 : 0;
        t.creakT -= dt;
        if (k > 0.7 && t.creakT <= 0) {
          t.creakT = 1.6 + Math.random() * 1.6 - k;
          game.audio.play('bed_creak', { volume: 0.3 + k * 0.25, pitch: 0.4 + Math.random() * 0.15 });
          const top = t.parts[0];
          if (top) for (let n = 0; n < 2; n++) game.particles.leaf(t.x + (Math.random() - 0.5) * 0.6, top.y0 + top.h * 0.8, t.z, t.colors[n % t.colors.length]);
        }
        const amp = FALL.shakeMax * (k * k * 0.6 + t.kick * 0.45);
        for (const p of t.parts) {
          const wob = Math.sin(this.time * 31 + p.seed) * amp + Math.sin(this.time * 13 + p.seed) * amp * 0.4;
          p.pivot.rotation.set(0, Math.atan2(-(t.rz ?? 0), t.rx ?? 1), 0);
          p.mesh.rotation.z = -(wob + t.tilt * t.sign) * (p === t.parts[0] ? 1 : 0.5);
          p.mesh.scale.set(1, comp, 1);
          if (p.notch) {
            const n = Math.min(1, k * 1.1);
            p.notch.scale.set(0.05 + n * 0.12, 0.04 + n * 0.08, 1);
            p.notch.visible = k > 0.03;
          }
        }
        continue;
      }
      t.t += dt;
      if (t.state === 'fall') this.stepFall(t, dt, comp);
      else if (t.state === 'lie') {
        for (const p of t.parts) this.settle(p, dt, comp);
        if (t.t > FALL.lieTime) this.split(t);
      } else if (t.state === 'pop') {
        const k = Math.min(1, t.t / 0.22);
        for (const p of t.parts) { const s = 1 + Math.sin(k * Math.PI) * 0.2; p.pivot.scale.set(s * (1 - k), s * (1 - k) + 0.001, 1); }
        if (k >= 1) { this.dropTree(t); this.trees.delete(t.i); }
      }
    }
    this.updateLogs(dt);
  }

  pose(p, comp) {
    // the billboard is height-compensated while upright, not once it lies flat
    p.mesh.rotation.z = -p.theta * p.sgn;
    p.mesh.scale.set(1, 1 + (comp - 1) * Math.max(0, Math.cos(p.theta)), 1);
    // the crown can't sink into the ground: lift the pivot as it comes down,
    // and the butt end kicks back a touch
    const s = Math.sin(Math.min(Math.PI / 2, Math.max(0, p.theta)));
    p.pivot.position.y = p.y0 + s * p.w * 0.28;
  }

  stepFall(t, dt, comp) {
    const game = this.game;
    let allDown = true;
    for (const p of t.parts) {
      p.sgn = t.sign;
      if (p.delay > 0) { p.delay -= dt; allDown = false; this.pose(p, comp); continue; }
      const L = Math.max(0.6, p.h);
      // rod pivoting on its base, sub-stepped for a steady crash
      const n = 4, h = Math.min(0.05, dt) / n;
      for (let k = 0; k < n; k++) {
        if (p.down) break;
        const alpha = (3 * FALL.gravity / (2 * L)) * Math.sin(p.theta);
        p.omega += alpha * h;
        p.theta += p.omega * h;
        if (p.theta >= Math.PI / 2) {
          p.theta = Math.PI / 2;
          p.hits = (p.hits || 0) + 1;
          if (p.hits === 1) this.crash(t, p);
          else if (p.hits === 2) game.audio.play('drop', { volume: 0.3, pitch: 0.6 });
          p.omega = -p.omega * FALL.bounce;
          if (Math.abs(p.omega) < 0.5) { p.down = true; p.omega = 0; p.wob = 0.06; }
        }
      }
      this.pose(p, comp);
      if (!p.down) allDown = false;
    }
    if (allDown) { t.state = 'lie'; t.t = 0; }
  }

  settle(p, dt, comp) {
    // a last little wobble as the branches settle
    p.wob = (p.wob || 0) * Math.exp(-dt * 5);
    p.theta = Math.PI / 2 - Math.abs(Math.sin(this.time * 18 + p.seed)) * p.wob;
    this.pose(p, comp);
  }

  crash(t, p) {
    const game = this.game;
    const P = game.particles;
    const main = p === t.parts[0];
    const [dx, dz] = t.dir;
    const L = p.h;
    const bx = p.pivot.position.x, bz = p.pivot.position.z;
    const gy = game.grid.surfaceAt ? game.grid.surfaceAt(bx, bz) : p.y0;
    // dust all along the trunk, leaves where the crown hits
    for (let k = 1; k <= 4; k++) {
      const f = k / 4;
      P.puff(bx + dx * L * f * 0.9, (gy ?? p.y0) + 0.12, bz + dz * L * f * 0.9, main ? 6 : 3, 0.32 + f * 0.1);
    }
    const cx = bx + dx * L * 0.7, cz = bz + dz * L * 0.7;
    const cols = t.colors || LEAFY;
    P.debris(cx, p.y0 + 0.3, cz, main ? 22 : 10, [...cols, 0x6b4a2f]);
    for (let n = 0; n < (main ? 9 : 4); n++) P.leaf(cx + (Math.random() - 0.5) * 1.2, p.y0 + 0.4 + Math.random() * 0.8, cz + (Math.random() - 0.5) * 0.6, cols[n % cols.length]);
    if (!main) return;
    P.word?.('timber', cx, p.y0 + 1.3, cz, { size: 0.42, life: 1.4, vy: 1.4 });
    P.dust(bx, p.y0, bz, 6);
    game.audio.play('demolish', { volume: 0.6, pitch: 0.65 + Math.random() * 0.1 });
    game.audio.play('smash', { volume: 0.25, pitch: 0.5 });
    if (game.rig) game.rig.shake = Math.max(game.rig.shake || 0, 0.42);
    this.scatterBirds(cx, cz, cols);
  }

  // songbirds nearby take off, and a couple burst out of the crown
  scatterBirds(x, z) {
    const A = this.game.ambient;
    if (!A?.birds) return;
    for (const b of A.birds) {
      if (b.state === 'away' || b.state === 'in' || b.state === 'out') continue;
      if (Math.hypot(b.x - x, b.z - z) > 6) continue;
      const a = Math.atan2(b.z - z, b.x - x) + (Math.random() - 0.5);
      b.state = 'out'; b.vx = Math.cos(a) * 4; b.vz = Math.sin(a) * 4; b.vy = 2.5; b.face = b.vx < 0 ? -1 : 1;
    }
    if (A.birds.length < 22 && A.pickBird) {
      for (let k = 0; k < 2; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = A.pickBird(false);
        A.birds.push({ sp, x: x + Math.cos(a) * 0.3, z: z + Math.sin(a) * 0.3, y: 1.2, state: 'out', t: 0, vx: Math.cos(a) * 3.5, vz: Math.sin(a) * 2 - 1, vy: 2.8, face: Math.cos(a) < 0 ? -1 : 1, seed: Math.random() * 9, hop: 0, placed: true });
      }
      this.game.audio.play('bird_chirp', { volume: 0.35, pitch: 1.3 });
      this.game.particles.feathers?.(x, 1.2, z, 3);
    }
  }

  // the trunk pops apart into logs
  split(t) {
    const game = this.game;
    t.state = 'pop';
    t.t = 0;
    const p = t.parts[0];
    const [dx, dz] = t.dir || [1, 0];
    const bx = p ? p.pivot.position.x : t.x, bz = p ? p.pivot.position.z : t.z;
    const L = p ? Math.min(2.4, p.h * 0.85) : 0.6;
    const n = t.nLogs || FALL.logsTree;
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n;
      let x = bx + dx * L * f, z = bz + dz * L * f;
      if (!this.groundOk(x, z)) { x = t.x + (Math.random() - 0.5) * 0.5; z = t.z + (Math.random() - 0.5) * 0.5; }
      const log = this.addLog(x, z, Math.atan2(-dz, dx) + (Math.random() - 0.5) * 0.5, Math.floor(Math.random() * 3), true);
      log.vy = 2.2 + Math.random() * 1.2; log.vx = (Math.random() - 0.5) * 0.8; log.vz = (Math.random() - 0.5) * 0.8;
      game.particles.puff(x, log.gy + 0.15, z, 5, 0.28);
    }
    game.particles.word?.('pow', bx + dx * L * 0.5, (p?.y0 ?? 0) + 0.9, bz + dz * L * 0.5, { size: 0.26, life: 0.7 });
    game.particles.debris(bx + dx * L * 0.5, (p?.y0 ?? 0) + 0.3, bz + dz * L * 0.5, 10, [0xc8a06a, 0x8a6a44, 0xe0c090]);
    game.audio.play('pop_in', { volume: 0.45, pitch: 0.8 });
    game.audio.play('chip', { volume: 0.4, pitch: 0.7 });
    game.emit?.('logsDropped', { n, x: bx, z: bz });
  }

  groundOk(x, z) {
    const g = this.game.grid;
    const tx = Math.floor(x), tz = Math.floor(z);
    if (!g.inb(tx, tz) || g.isWater(tx, tz)) return false;
    const s = g.occ[tz * g.w + tx];
    return s < 0 && s !== -2;
  }

  groundY(x, z) {
    const g = this.game.grid;
    return g.surfaceAtVisual ? g.surfaceAtVisual(x, z) : g.surfaceY(Math.floor(x), Math.floor(z));
  }

  // ------------------------------------------------------------ logs
  addLog(x, z, rot = 0, variant = 0, fresh = false) {
    const mesh = new THREE.Mesh(makeLogGeometry({ len: FALL.logLen, r: FALL.logR, variant }), voxelMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const gy = this.groundY(x, z);
    const log = { id: this.logId++, x, z, rot, variant, gy, y: gy, vx: 0, vy: 0, vz: 0, mesh, claim: null, spin: 0, landed: !fresh };
    mesh.position.set(x, gy + FALL.logR * 0.05, z);
    mesh.rotation.set(0, rot, 0);
    this.group.add(mesh);
    this.logs.push(log);
    this.saveLogs();
    return log;
  }

  // a beaver lifts it: gone from the ground (the rig shows its own log)
  takeLog(log) {
    const k = this.logs.indexOf(log);
    if (k < 0) return false;
    this.logs.splice(k, 1);
    this.group.remove(log.mesh);
    this.saveLogs();
    return true;
  }

  // dropped back on the ground (no garage with room, job cancelled...)
  putLog(x, z, rot = Math.random() * 6.28) {
    if (!this.groundOk(x, z)) { x = Math.floor(x) + 0.5; z = Math.floor(z) + 0.5; }
    const l = this.addLog(x, z, rot, Math.floor(Math.random() * 3), true);
    l.vy = 1.4;
    return l;
  }

  updateLogs(dt) {
    const R = FALL.logR * 0.05;
    for (const l of this.logs) {
      if (l.landed) continue;
      // hop out of the trunk, bounce once or twice, roll to a stop
      l.vy -= 14 * dt;
      l.x += l.vx * dt; l.z += l.vz * dt; l.y += l.vy * dt;
      l.spin += dt * 9;
      const gy = this.groundY(l.x, l.z);
      if (l.y <= gy) {
        l.y = gy;
        if (Math.abs(l.vy) > 1.2) { l.vy = -l.vy * 0.35; l.vx *= 0.5; l.vz *= 0.5; this.game.particles.dust(l.x, gy, l.z, 2); }
        else { l.vy = 0; l.landed = true; l.gy = gy; l.spin = 0; this.game.audio.play('drop', { volume: 0.25, pitch: 0.7 + Math.random() * 0.2 }); this.saveLogs(); }
      }
      l.mesh.position.set(l.x, l.y + R, l.z);
      l.mesh.rotation.set(l.landed ? 0 : Math.sin(l.spin) * 0.3, l.rot, l.landed ? 0 : Math.sin(l.spin * 0.7) * 0.25);
    }
  }

  // nearest log nobody has claimed
  nearestLog(x, z, ok = () => true) {
    let best = null, bd = Infinity;
    for (const l of this.logs) {
      if (l.claim || !l.landed || !ok(l)) continue;
      const d = Math.hypot(l.x - x, l.z - z);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }

  waiting() { return this.logs.filter((l) => !l.claim).length; }

  // ------------------------------------------------------------ save / load (via game.state)
  saveLogs() {
    this.game.state.groundLogs = this.logs.map((l) => [+l.x.toFixed(2), +l.z.toFixed(2), +l.rot.toFixed(2), l.variant]);
  }

  loadLogs() {
    for (const l of this.logs) this.group.remove(l.mesh);
    this.logs.length = 0;
    for (const [x, z, rot, v] of this.game.state.groundLogs || []) this.addLog(x, z, rot || 0, v || 0);
    this.saveLogs();
  }
}
