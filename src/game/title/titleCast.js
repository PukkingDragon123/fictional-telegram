// The title screen's cast (see TitleWorld.js): Reynard on his dock rubbing his
// paws, and the five o'clock rush - the whistle blows, the office doors burst
// open and bears in suits (procedural looks, ties flapping, briefcases swinging)
// pour down the switchback trail. Some trip and roll, some fly off a ledge and
// tumble to the next one; they vanish into the woods, burst out onto the meadow
// and cannonball into the pond. All positions are painted-backdrop pixels
// (x right, y down); bears shrink with distance (forced perspective).
import * as THREE from 'three';
import { FoxRig } from '../../entities/foxRig.js';
import { BearRig } from '../../entities/bearRig.js';
import { BEAR_TYPES } from '../../data/bears.js';
import { makeBearLook, lookDef } from '../../entities/bearLook.js';
import { WUPP, ORDER } from './titleConst.js';

const TILT = 0.34; // the cast is seen a little from above (the layers are flat paintings)
const BEAR_H = 2.0; // world height of a scale-1 bear
const CAST = [['office', 3.2], ['intern', 1.3], ['accountant', 1.3], ['boss', 0.9], ['ceo', 0.45], ['hipster', 0.5], ['janitor', 0.4],
  ['construction', 0.45], ['lumberjack', 0.4], ['tourist', 0.35], ['jogger', 0.5], ['grandma', 0.35], ['critic', 0.3], ['auditor', 0.3]];
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;

function pickType(r) {
  const list = CAST.filter(([id]) => BEAR_TYPES[id]);
  let tot = 0;
  for (const [, w] of list) tot += w;
  let x = r * tot;
  for (const [id, w] of list) { x -= w; if (x <= 0) return id; }
  return list[0][0];
}

// make rig materials draw in render order with the layers (no transparent pass)
function prepRig(root, order) {
  const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh && !o.isSprite) return;
    o.frustumCulled = false;
    o.castShadow = false;
    o.renderOrder = order;
    meshes.push(o);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && m.transparent && m.alphaTest > 0) m.transparent = false;
  });
  return meshes;
}

export class TitleCast {
  constructor(world) {
    this.W = world;
    this.bears = [];
    this.pool = [];
    this.spawnT = 0;
    this.burst = 0;
    this.doorsOpen = 0;
    this.seed = (Math.random() * 1e9) | 0;
    this.buildQ = [];
    this.group = new THREE.Group();
  }

  start() {
    const W = this.W;
    W.scene.add(this.group);
    this.relayout();
    // Reynard
    try {
      const fox = new FoxRig({ shadows: false });
      const holder = new THREE.Group(), tilt = new THREE.Group();
      tilt.rotation.x = 0.06; // Reynard hunches over his paws: barely tilt him, or his face hides under the hat
      holder.add(tilt); tilt.add(fox.root);
      fox.root.rotation.y = -0.5;
      this.foxMeshes = prepRig(fox.root, ORDER.actors);
      fox.play('idle_scheme');
      fox.update(0.016);
      const box = new THREE.Box3().setFromObject(fox.root);
      this.foxH = Math.max(0.5, box.max.y - box.min.y);
      holder.visible = false;
      this.group.add(holder);
      this.fox = { rig: fox, holder, tilt, state: 'hidden', t: 0, anim: 'idle_scheme', next: 6 };
    } catch (e) { console.warn('title fox', e); }
    // bear looks to build progressively (one rig per frame once the intro has settled)
    for (let i = 0; i < 14; i++) {
      const type = pickType(((this.seed + i * 7919) % 1000) / 1000 * 0.999);
      this.buildQ.push({ type, seed: (this.seed + i * 104729) >>> 0 });
    }
  }

  relayout() {
    const L = this.W.L;
    this.L = L;
    // trail polyline with cumulative lengths
    const pts = L.trail || [];
    this.trail = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.total = this.cum[this.cum.length - 1] || 0;
    this.corners = (L.trailPts || []).slice(1, -1);
  }

  _buildOne() {
    const q = this.buildQ.shift();
    if (!q) return;
    try {
      const def0 = BEAR_TYPES[q.type];
      const look = makeBearLook(q.type, def0, q.seed);
      const def = lookDef(def0, look);
      const rig = new BearRig(q.type, def);
      rig.personalize(q.seed % 997);
      const holder = new THREE.Group(), spin = new THREE.Group(), tilt = new THREE.Group();
      tilt.rotation.x = TILT;
      holder.add(spin); spin.add(tilt); tilt.add(rig.root);
      holder.visible = false;
      this.group.add(holder);
      const meshes = prepRig(rig.root, ORDER.trailBears);
      this.pool.push({ rig, holder, spin, tilt, meshes, def, busy: false, order: ORDER.trailBears, speedK: q.type === 'boss' || q.type === 'ceo' || q.type === 'grandma' ? 0.82 : q.type === 'intern' || q.type === 'jogger' ? 1.18 : rand(0.92, 1.08) });
    } catch (e) { console.warn('title bear', e); }
  }

  whistle() {
    const L = this.L, W = this.W;
    if (L.office?.whistle) W.steam(L.office.whistle.x, L.office.whistle.y, 16);
    try { this.W.audio?.play?.('whistle', { volume: 0.32 }); } catch { /* optional */ }
    this.doorsOpen = 1;
    this.burst = 6;
    this.spawnT = 0.4;
    this.rush = true;
    if (this.fox) this._foxAnim('cheer', 1.6);
    this.whistleT = W.t;
    this._spawn(1.6); this._spawn(4.2); // the interns who slipped out at a quarter to five
  }

  // ------------------------------------------------------------ bears
  _spawn(early = false) {
    const b = this.pool.find((p) => !p.busy);
    if (!b || !this.total) return false;
    b.busy = true;
    b.state = 'trail';
    if (early) { // left work early: already in the woods, about to burst out onto the meadow
      b.state = 'woods'; b.t = 0; b.woodsT = early; b.pop = 0; b.spin.rotation.z = 0; b.holder.visible = false;
      this.bears.push(b);
      return true;
    }
    b.s = 0;
    b.t = 0;
    b.v = 30 * (this.L.u || 1) * b.speedK * rand(0.9, 1.1);
    b.trip = Math.random() < 0.16 ? rand(0.12, 0.85) * this.total : -1;
    b.leap = Math.random() < 0.14 ? Math.floor(rand(0, Math.max(1, this.corners.length - 1))) : -1;
    b.legsDone = 0;
    b.pop = 0;
    b.spin.rotation.z = 0;
    b.holder.visible = true;
    this._order(b, ORDER.trailBears);
    this.bears.push(b);
    return true;
  }

  _order(b, o) { if (b.order === o) return; b.order = o; for (const m of b.meshes) m.renderOrder = o; }

  _trailAt(s) {
    const c = this.cum, p = this.trail;
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    const seg = c[hi] - c[lo] || 1, u = clamp((s - c[lo]) / seg, 0, 1);
    return [lerp(p[lo][0], p[hi][0], u), lerp(p[lo][1], p[hi][1], u), Math.sign(p[hi][0] - p[lo][0]) || 1];
  }

  _trailH(y) { const L = this.L; return (L.u || 1) * lerp(L.tall ? 8 : 7.5, L.tall ? 14 : 13, clamp((y - L.mt.plat) / Math.max(1, L.mt.base - L.mt.plat), 0, 1)); }

  _place(b, x, y, hPx, layer, dir, z = 0) {
    const W = this.W, [ox, oy] = W.offOf(layer);
    b.holder.position.set(W.wx(x + ox), W.wy(y + oy), 2 + y * 0.02 + z);
    const k = (hPx * WUPP) / BEAR_H; // rig units -> world
    b.holder.scale.setScalar(k * (b.pop < 1 ? 0.3 + 0.7 * smooth(b.pop) : 1));
    b.rig.root.rotation.y = dir > 0 ? Math.PI / 2 - 0.5 : -Math.PI / 2 + 0.5;
    b.k = k;
  }

  _stepBear(b, dt) {
    const L = this.L, W = this.W;
    b.t += dt;
    b.pop = Math.min(1, b.pop + dt * 5);
    let pose = 'run', o = { speed: 0 };
    if (b.state === 'trail') {
      // a stumble: trip, roll along curled up, get up dizzy
      if (b.trip > 0 && b.s >= b.trip) { b.trip = -1; b.state = 'roll'; b.t = 0; b.rollT = rand(1.1, 2.0); }
      b.s += b.v * dt;
      const [x, y, dir] = this._trailAt(b.s);
      // a leap off the ledge at a switchback: tumble down to the leg below
      const ci = this.corners.findIndex((c) => Math.abs(c[0] - x) < 1.5 && Math.abs(c[1] - y) < 2);
      if (ci >= 0 && ci === b.leap && b.t > 0.5) { this._startFall(b, x, y, dir); return; }
      b.dir = dir;
      if (b.s >= this.total) { b.state = 'woods'; b.t = 0; b.woodsT = rand(1.2, 2.6); b.holder.visible = false; return; }
      this._place(b, x, y, this._trailH(y), 'mountain', dir);
      o.speed = (b.v * WUPP) / b.k;
      b.spin.rotation.z = 0;
    } else if (b.state === 'roll' || b.state === 'dizzy') {
      if (b.state === 'roll') {
        b.s += b.v * 1.7 * dt;
        pose = 'cannonball'; o = { t01: 0.42, flip: 'tuck' };
        if (b.t > b.rollT) { b.state = 'dizzy'; b.t = 0; }
      } else { pose = 'stagger'; o = { t01: clamp(b.t / 0.9, 0, 1) }; if (b.t > 0.9) { b.state = 'trail'; b.t = 0.6; } }
      if (b.s >= this.total) { b.state = 'woods'; b.t = 0; b.woodsT = rand(1, 2); b.holder.visible = false; return; }
      const [x, y, dir] = this._trailAt(b.s);
      b.dir = dir;
      const h = this._trailH(y);
      this._place(b, x, y - (b.state === 'roll' ? Math.abs(Math.sin(b.t * 9)) * 1.5 : 0), h, 'mountain', dir);
      b.spin.rotation.z = b.state === 'roll' ? -dir * b.t * 9 : 0;
    } else if (b.state === 'fall') {
      const f = b.fall, u = clamp(b.t / f.dur, 0, 1);
      const x = lerp(f.x0, f.x1, u), y = lerp(f.y0, f.y1, u) - Math.sin(u * Math.PI) * f.arc - Math.abs(Math.sin(u * Math.PI * 3)) * (1 - u) * 3;
      pose = 'cannonball'; o = { t01: 0.42, flip: 'tuck' };
      b.spin.rotation.z = -f.dir * u * Math.PI * 4;
      this._place(b, x, y, this._trailH(y), 'mountain', f.dir);
      if (u >= 1) { b.s = f.s1; b.state = 'dizzy'; b.t = 0; b.spin.rotation.z = 0; }
    } else if (b.state === 'woods') {
      if (b.t > b.woodsT && L.meadowPath) { b.state = 'meadow'; b.t = 0; b.u = 0; b.pop = 0.4; b.holder.visible = true; this._order(b, ORDER.actors); b.mv = rand(30, 38) * (L.u || 1) * b.speedK; }
      return;
    } else if (b.state === 'meadow') {
      const m = L.meadowPath, len = Math.hypot(m.x1 - m.x0, m.y1 - m.y0);
      b.u += (b.mv * dt) / len;
      const u = clamp(b.u, 0, 1);
      const x = lerp(m.x0, m.x1, smooth(u)), y = lerp(m.y0, m.y1, u);
      const dir = m.x1 < m.x0 ? -1 : 1;
      const h = (L.u || 1) * lerp(L.tall ? 15 : 14, L.tall ? 25 : 23, u);
      this._place(b, x, y, h, 'meadow', u > 0.85 ? 1 : dir);
      o.speed = (b.mv * WUPP) / b.k;
      if (b.u >= 1) {
        const P = L.pond;
        b.state = 'jump'; b.t = 0;
        b.j = { x0: x, y0: y, x1: P.x - P.rx * rand(0.15, 0.55), y1: P.y + rand(-0.35, 0.35) * P.ry, h0: h, dur: rand(0.7, 0.9), arc: rand(14, 22) };
      }
    } else if (b.state === 'jump') {
      const j = b.j, u = clamp(b.t / j.dur, 0, 1);
      const x = lerp(j.x0, j.x1, u), y = lerp(j.y0, j.y1, u) - Math.sin(u * Math.PI) * j.arc;
      pose = 'cannonball'; o = { t01: u };
      this._place(b, x, y, j.h0, 'meadow', 1, 6);
      if (u >= 1) { W.splash(j.x1, j.y1, b.def.scale || 1); b.holder.visible = false; b.busy = false; b.state = 'done'; this._onSplash(); return; }
    }
    if (pose === 'run') o.speed = Math.max(o.speed || 0, 3);
    b.rig.pose(pose, dt, o);
    b.rig.update?.(dt);
  }

  _startFall(b, x, y, dir) {
    // the point on the next leg below this corner
    let best = -1, bd = 1e9;
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      if (p[1] < y + 6 || this.cum[i] <= b.s) continue;
      const d = Math.abs(p[0] - (x + dir * 6)) + Math.abs(p[1] - y) * 0.2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) { b.leap = -1; return; }
    const p = this.trail[best];
    b.state = 'fall'; b.t = 0; b.leap = -1;
    b.fall = { x0: x, y0: y, x1: p[0], y1: p[1], s1: this.cum[best], dir, dur: 0.55 + (p[1] - y) * 0.012, arc: 4 };
  }

  _onSplash() {
    const f = this.fox;
    if (!f || f.state !== 'on') return;
    if (Math.random() < 0.35 && f.lock <= 0) this._foxAnim(Math.random() < 0.5 ? 'greedy' : 'laugh_evil', 2.2);
  }

  // ------------------------------------------------------------ Reynard
  _foxAnim(name, dur) {
    const f = this.fox;
    if (!f) return;
    try { f.rig.play(name); } catch { /* unknown anim */ }
    f.anim = name;
    f.lock = dur;
    f.next = dur;
  }

  _stepFox(dt) {
    const f = this.fox, W = this.W, L = this.L;
    if (!f || !L.dock) return;
    f.t += dt;
    if (f.state === 'hidden' && W.t > 1.0) { f.state = 'pop'; f.t = 0; f.holder.visible = true; }
    const hPx = (L.u || 1) * (L.tall ? 31 : 27);
    const pop = f.state === 'pop' ? (f.t < 0.35 ? smooth(f.t / 0.35) * 1.15 : 1.15 - 0.15 * smooth((f.t - 0.35) / 0.25)) : 1;
    if (f.state === 'pop' && f.t > 0.6) f.state = 'on';
    const [ox, oy] = W.offOf('meadow');
    const x = L.dock.x, y = L.dock.y0 + 4;
    f.holder.position.set(W.wx(x + ox), W.wy(y + oy), 2 + y * 0.02);
    f.holder.scale.setScalar((hPx * WUPP) / this.foxH * Math.max(0.01, pop));
    f.lock = (f.lock || 0) - dt;
    f.next -= dt;
    if (f.next <= 0 && f.state === 'on') {
      const r = Math.random();
      if (!this.rush) this._foxAnim(r < 0.6 ? 'idle_scheme' : r < 0.8 ? 'polish_monocle' : 'think', rand(3, 6));
      else this._foxAnim(r < 0.45 ? 'idle_scheme' : r < 0.65 ? 'greedy' : r < 0.8 ? 'count_coins' : r < 0.9 ? 'point' : 'laugh_evil', rand(2.5, 6));
      if (f.anim === 'idle_scheme') f.lock = 0;
    }
    f.rig.update(dt);
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    const W = this.W;
    this.buildT = (this.buildT || 0) - dt;
    if (W.t > 1.2 && this.buildQ.length && this.buildT <= 0) { this.buildT = 0.18; this._buildOne(); }
    if (this.rush) {
      this.spawnT -= dt;
      const max = this.L.tall ? 13 : 15;
      const active = this.bears.length;
      if (this.spawnT <= 0 && active < max) {
        if (this._spawn()) {
          if (this.burst > 0) { this.burst--; this.spawnT = rand(0.3, 0.55); }
          else this.spawnT = rand(1.0, 2.3);
        } else this.spawnT = 0.3;
      }
      if (W.t - this.whistleT > 28 && Math.random() < dt * 0.04) { this.burst = 3; this.whistleT = W.t; W.steam(this.L.office?.whistle?.x || 0, this.L.office?.whistle?.y || 0, 8); }
      this.doorsOpen = Math.max(this.burst > 0 ? 1 : 0.6, this.doorsOpen - dt * 0.2);
    }
    for (let i = this.bears.length - 1; i >= 0; i--) {
      const b = this.bears[i];
      try { this._stepBear(b, dt); } catch (e) { console.warn('title bear step', e); b.busy = false; b.state = 'done'; b.holder.visible = false; }
      if (b.state === 'done') this.bears.splice(i, 1);
    }
    this._stepFox(dt);
  }

  // the office doors (open during the rush): drawn with the office's pixel points
  drawOffice(P, ox, oy) {
    const d = this.L.office?.doors;
    if (!d || this.doorsOpen <= 0) return;
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      const edge = x === 0 || x === d.w - 1;
      const c = edge ? 0xc08850 : y === d.h - 1 ? 0xffd890 : y > d.h - 3 ? 0x7a4a2a : 0x2a1a20;
      P.add(d.x + x + ox, d.y + y + oy, c, 1, y === d.h - 1 ? 1.3 : 1);
    }
  }

  dispose() {
    for (const b of this.pool) { try { b.rig.dispose(); } catch { /* ignore */ } }
    try { this.fox?.rig.dispose?.(); } catch { /* ignore */ }
    this.group.parent?.remove(this.group);
    this.pool = []; this.bears = [];
  }
}
