// [v33 tut] Reynard in the world during the tour: he walks to what he talks about, points at it
// (his right arm IK'd onto it + a bouncing pixel arrow and a ring on the thing), holds things up in
// both paws (real voxel props, src/game/tutorial/props3d.js), and the camera goes in close: low,
// over his shoulder, nearly first person.
//
// Outside a cutscene (while you do things):  guide.walkNear(target) · guide.point(target) -> stop
//   · guide.hold('pellets') / guide.drop() · guide.bark(text) · guide.mark(target, o) -> stop
// Inside a Director scene, Tutorial.cine() adds the same as c.* (see extend()):
//   c.walkNear(target) · c.point(target, { label, color }) · c.unpoint() · c.hold(name, o) · c.drop()
//   · c.mark(target, o) · c.low(target, { zoom, pitch, lift }) · c.ots(subject, o) · c.expr(name)
import * as THREE from 'three';
import { TourMarks, worldOf } from './marks.js';
import { makeProp, disposeProp } from './props3d.js';

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const PI4 = Math.PI / 4;

// ------------------------------------------------------------------ the Fish Scope's eyepiece
// A near-first-person look through Reynard's Fish Scope: everything outside a circle goes dark
// (dithered at the edge), a brass ring with a highlight arc, a crosshair and tick marks. Drawn at
// 3 CSS px per art px, under the HUD / bubbles, over the world. lens(true) irises it in, lens(false) out.
const LS = 3;
let lensCv = null, lensT = 0;
function paintLens(k) {
  const cv = lensCv, W = Math.ceil(innerWidth / LS), H = Math.ceil(innerHeight / LS);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; cv.style.width = W * LS + 'px'; cv.style.height = H * LS + 'px'; }
  const x = cv.getContext('2d');
  x.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H * 0.47, R = Math.round(H * 0.36 + (1 - k) * Math.max(W, H) * 0.7);
  const img = x.createImageData(W, H), d = img.data;
  const set = (i, r, g, b, a = 255) => { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; };
  for (let y = 0; y < H; y++) for (let X = 0; X < W; X++) {
    const dx = X + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy), i = (y * W + X) * 4;
    if (r > R + 5) { if (r < R + 9 && (X + y) & 1) continue; set(i, 18, 12, 22); continue; } // the dark (dithered edge)
    if (r > R + 4) { set(i, 26, 20, 32); continue; } // ink outline
    if (r > R) {
      const a = Math.atan2(dy, dx); // brass: a bright arc top-left, a dark one bottom-right
      const lit = Math.cos(a + 2.35);
      set(i, ...(lit > 0.55 ? [255, 240, 160] : lit > -0.2 ? [232, 176, 64] : [176, 122, 26]));
      continue;
    }
    if (r > R - 1) { set(i, 26, 20, 32); continue; }
    // the glass: a faint cyan tint at the rim (dithered), clear in the middle
    if (r > R - 4 && (X + y) % 2 === 0) set(i, 120, 220, 232, 70);
  }
  x.putImageData(img, 0, 0);
  if (k < 1) return;
  // crosshair + ticks (ink with a light edge)
  x.fillStyle = 'rgba(26,20,32,0.85)';
  const gap = 6, Lh = Math.round(R * 0.35);
  x.fillRect(Math.round(cx - gap - Lh), Math.round(cy), Lh, 1); x.fillRect(Math.round(cx + gap), Math.round(cy), Lh, 1);
  x.fillRect(Math.round(cx), Math.round(cy - gap - Lh), 1, Lh); x.fillRect(Math.round(cx), Math.round(cy + gap), 1, Lh);
  for (let t = 0; t < 24; t++) {
    const a = (t / 24) * Math.PI * 2, L = t % 6 === 0 ? 5 : 2;
    for (let j = 0; j < L; j++) x.fillRect(Math.round(cx + Math.cos(a) * (R - 2 - j)), Math.round(cy + Math.sin(a) * (R - 2 - j)), 1, 1);
  }
  x.fillStyle = '#ffd23a';
  x.fillRect(Math.round(cx) - 1, Math.round(cy) - 1, 3, 3);
}
export function lens(on, game = null) {
  if (on) {
    if (!lensCv) { lensCv = document.createElement('canvas'); lensCv.className = 'tut-lens'; document.body.appendChild(lensCv); }
    const t = ++lensT;
    game?.audio?.play?.('crt_on', { volume: 0.3 });
    let k = 0;
    const step = () => { if (t !== lensT || !lensCv) return; k = Math.min(1, k + 0.2); paintLens(k); if (k < 1) setTimeout(step, 60); };
    step();
  } else if (lensCv) {
    const t = ++lensT, cv = lensCv;
    let k = 1;
    const step = () => { if (t !== lensT) return; k -= 0.25; if (k <= 0) { cv.remove(); if (lensCv === cv) lensCv = null; return; } paintLens(k); setTimeout(step, 50); };
    step();
  }
}

export class Guide {
  constructor(T) {
    this.T = T;
    this.game = T.game;
    this.marks = new TourMarks(this.game);
    this.prop = null;
    this._aim = null;
    this._sceneMarks = [];
  }

  get fox() { return this.game.fox; }

  /** keep Reynard where the tour puts him (no drifting home, no routine) */
  keep() { const f = this.fox; if (f && !f.cine) f.cine = { anim: null, face: null }; return f; }
  release() { const f = this.fox; if (f) { f.cine = null; } this.unpoint(); this.drop(); }

  anim(name) { const f = this.keep(); if (f) f.cine.anim = name || null; }
  face(x, z) { const f = this.keep(); if (f) f.cine.face = Math.atan2(z - f.z, x - f.x); }
  expr(name, hold = 2.5) { try { this.fox?.rig?.setExpression?.(name, { hold }); } catch { /* ignore */ } }

  /** a land spot next to the water by `target` (on Reynard's side of it), or null */
  standNear(target, { dist = 0.7 } = {}) {
    const game = this.game, f = this.fox;
    const p = worldOf(game, target);
    if (!p) return null;
    const g = game.grid;
    const tx = Math.floor(p.x), tz = Math.floor(p.z);
    if (!g.isWater?.(tx, tz)) {
      // a land thing: stand a little in front of it (toward the camera)
      return { x: p.x + 0.2, z: p.z + 1.1 };
    }
    let best = null, bd = Infinity;
    for (let dz = -7; dz <= 7; dz++) for (let dx = -7; dx <= 7; dx++) {
      const x = tx + dx, z = tz + dz;
      if (!g.inb(x, z) || g.isWater(x, z) || !g.hasWaterNeighbor?.(x, z)) continue;
      if (g.deco?.[z * g.w + x] >= 0) continue;
      const occ = g.occ?.[z * g.w + x];
      if (occ != null && occ !== -1 && occ !== -2) continue;
      const d = Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) + Math.hypot(x + 0.5 - f.x, z + 0.5 - f.z) * 0.25 - (z > tz ? 0.6 : 0); // prefer the camera side
      if (d < bd) { bd = d; best = { x: x + 0.5, z: z + 0.5 }; }
    }
    if (!best) return null;
    // step toward the water a bit (the shore edge, not the middle of the tile)
    const vx = p.x - best.x, vz = p.z - best.z, L = Math.hypot(vx, vz) || 1;
    const k = Math.min(0.3, dist * 0.4);
    const sx = best.x + (vx / L) * k, sz = best.z + (vz / L) * k;
    return g.isWater(Math.floor(sx), Math.floor(sz)) ? best : { x: sx, z: sz };
  }

  /** walk over next to `target` and face it. Resolves on arrival (or after `timeout` s) */
  async walkNear(target, { timeout = null } = {}) {
    const f = this.keep();
    const s = this.standNear(target);
    if (!f || !s) return false;
    f.cine.anim = null;
    const d0 = Math.hypot(s.x - f.x, s.z - f.z);
    if (d0 > 0.25) {
      f.target = { x: s.x, z: s.z };
      const t0 = performance.now();
      const T = (timeout ?? 2 + d0 / 2.5) * 1000; // he runs 4.2 tiles/s: plenty of slack
      while (f.target && performance.now() - t0 < T) {
        if (this.game.director?.skipped || this.T.skipping) break;
        await wait(0.06);
      }
      // still far (cut short by water, or a slow frame rate): he hops the rest in a puff
      if (Math.hypot(s.x - f.x, s.z - f.z) > 0.9) {
        try { this.game.particles?.puff?.(f.x, f.y + 0.3, f.z, 6, 0.25); } catch { /* ignore */ }
        f.x = s.x; f.z = s.z;
        try { this.game.particles?.puff?.(f.x, f.y + 0.3, f.z, 6, 0.25); } catch { /* ignore */ }
      }
      f.target = null;
    }
    const p = worldOf(this.game, target);
    if (p) this.face(p.x, p.z);
    return true;
  }

  /** point at something: his arm reaches for it, a ring + arrow sit on it. Returns stop() */
  point(target, { label = null, color = 'gold', ring = true, arrow = true, r } = {}) {
    this.unpoint();
    const f = this.keep();
    const v = new THREE.Vector3();
    const h = (ring || arrow) ? this.marks._add(target, { ring, arrow, label, color, r }) : null;
    let on = true;
    const tick = () => {
      if (!on) return;
      const p = worldOf(this.game, target);
      if (p && f) {
        v.set(p.x, p.y + 0.15, p.z);
        f.cine.face = Math.atan2(p.z - f.z, p.x - f.x);
      }
      requestAnimationFrame(tick);
    };
    tick();
    try { f?.rig?.setAim?.(v, { weight: 1 }); } catch { /* ignore */ }
    // the gesture: a jab of the finger (a line he says next takes over the body, the arm keeps pointing)
    if (f?.cine && !f.cine.anim) { f.cine.anim = 'point'; setTimeout(() => { if (f.cine?.anim === 'point') f.cine.anim = null; }, 1400); }
    this.game.audio?.play?.('whoosh', { volume: 0.15, pitch: 1.6 });
    const stop = () => { if (!on) return; on = false; h?.stop(); try { f?.rig?.setAim?.(null); } catch { /* ignore */ } if (this._aim === stop) this._aim = null; };
    this._aim = stop;
    return stop;
  }
  unpoint() { this._aim?.(); this._aim = null; }

  /** a mark without pointing (ring + arrow + tag). Returns stop() */
  mark(target, o = {}) { const h = this.marks.spot(target, o); return () => h.stop(); }

  /** hold a prop up in both paws ('fish' | 'egg' | 'pellets' | 'scope' | 'tag' | 'coins') */
  hold(name, o = {}) {
    this.drop();
    const f = this.fox;
    const p = makeProp(name, o);
    if (!p || !f?.rig?.holdBoth) return null;
    if (o.y != null) p.position.y = o.y;
    f.rig.holdBoth(p);
    this.prop = p;
    this.game.audio?.play?.('grab', { volume: 0.4 });
    return p;
  }
  drop() {
    const p = this.prop;
    if (!p) return;
    this.prop = null;
    try { this.fox?.rig?.holdBoth?.(null); } catch { /* ignore */ }
    p.removeFromParent();
    disposeProp(p);
  }

  /** a short line over his head that doesn't wait (while you play) */
  bark(text, { mood = 'happy', dur = 3.2 } = {}) {
    const f = this.fox;
    if (!f) return null;
    return this.game.say({ getWorldPos: (v) => v.set(f.x, f.y + 1.75, f.z) }, text, { voice: 'fox', mood, dur, key: 'tutbark', size: 's' });
  }

  clear() { this.unpoint(); this.drop(); this.marks.clear(); lens(false); }
  dispose() { this.clear(); this.marks.dispose(); }

  // ---------------------------------------------------------------- scene helpers
  /** add the tour's helpers to a Director scene context */
  extend(c) {
    const G = this, game = this.game, rig = game.rig;
    c.walkNear = (t, o) => G.walkNear(t, o);
    c.point = (t, o) => G.point(t, o);
    c.unpoint = () => G.unpoint();
    /** turn to the camera (to show something off) */
    c.faceCam = () => { const f = G.fox, y = rig.yawGoal ?? rig.yaw ?? 0; if (f) G.face(f.x + Math.sin(y) * 6, f.z + Math.cos(y) * 6); };
    c.hold = (n, o) => { const p = G.hold(n, o); c.faceCam(); return p; };
    c.drop = () => G.drop();
    c.mark = (t, o) => G.mark(t, o);
    c.expr = (n, h) => G.expr(n, h);
    /** look through the Fish Scope: the eyepiece on screen + the camera pushes in low and close */
    c.lens = (t, { zoom = 0.0075, pitch = 0.55 } = {}) => {
      if (!t) { lens(false); return Promise.resolve(); }
      lens(true, game);
      return c.low(t, { zoom, pitch, dur: 0.9 });
    };
    /** a low, close shot on a thing: zoom = world units per px (smaller = closer), pitch in radians */
    c.low = (t, { zoom = 0.0125, pitch = 0.42, dur = 1.1, lift = null, dx = 0, dz = 0 } = {}) => {
      const p = worldOf(game, t) || { x: rig.goal.x, y: 0, z: rig.goal.z };
      rig.pitchGoal = pitch;
      return c.shot([p.x + dx, p.z + dz], { zoom, dur, lift: lift ?? p.y + 0.35 });
    };
    /** over Reynard's shoulder toward `subject`: the camera swings round behind him and goes low */
    c.ots = (subject, { zoom = 0.0125, pitch = 0.4, dur = 1.3, bias = 0.62, snap = true } = {}) => {
      const f = G.fox, p = worldOf(game, subject);
      if (!f || !p) return Promise.resolve();
      let yaw = Math.atan2(f.x - p.x, f.z - p.z);
      if (snap) yaw = Math.round(yaw / PI4) * PI4;
      rig.pitchGoal = pitch;
      const mx = f.x + (p.x - f.x) * bias, mz = f.z + (p.z - f.z) * bias;
      return c.shot([mx, mz], { zoom, dur, yaw, lift: (f.y + p.y) / 2 + 0.4 });
    };
    /** the normal top-down game view again (44 degrees) */
    c.wide = (t, { zoom = 0.022, dur = 1 } = {}) => {
      rig.pitchGoal = (44 * Math.PI) / 180;
      const p = t ? worldOf(game, t) : null;
      return c.shot(p ? [p.x, p.z] : null, { zoom, dur, yaw: 0 });
    };
    return c;
  }
}
