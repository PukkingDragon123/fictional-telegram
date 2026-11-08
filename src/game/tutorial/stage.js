// [v33 tut] Reynard in the world during the tour: he walks to what he talks about, points at it
// (his right arm IK'd onto it + a bouncing pixel arrow and a ring on the thing), holds things up in
// both paws (real voxel props, src/game/tutorial/props3d.js), and the camera goes in close: low,
// over his shoulder, nearly first person.
//
// Outside a cutscene (while you do things):  guide.walkNear(target) · guide.point(target) -> stop
//   · guide.hold('pellets' | 'egg' | 'fish' | 'tag' | 'coins' | 'scope') / guide.drop() · guide.bark(text) (a line in the box)
//   · guide.mark(target, o) -> stop
// Inside a Director scene, Tutorial.cine() adds the same as c.* (see extend()):
//   c.walkNear(target) · c.point(target, { label, color }) · c.unpoint() · c.hold(name, o) · c.drop()
//   · c.mark(target, o) · c.low(target, { zoom, pitch, lift }) · c.ots(subject, o) · c.expr(name)
import * as THREE from 'three';
import { TourMarks, worldOf } from './marks.js';
import { makeProp, disposeProp } from './props3d.js';

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const PI4 = Math.PI / 4;

// [v33 tut2] the Fish Scope eyepiece overlay (lens) is cut with the other gimmicks: the tour uses the real Scope

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
    if (name === 'scope') {
      // the Fish Scope: the scientist's own 3D magnifier (foxProps), peered through like in the Scope
      try { f?.rig?.holdProp?.('magnifier'); } catch { /* ignore */ }
      this.propName = 'scope';
      this.game.audio?.play?.('grab', { volume: 0.4 });
      return true;
    }
    const p = makeProp(name, o);
    if (!p || !f?.rig?.holdBoth) return null;
    if (o.y != null) p.position.y = o.y;
    f.rig.holdBoth(p);
    this.prop = p;
    this.game.audio?.play?.('grab', { volume: 0.4 });
    return p;
  }
  drop() {
    if (this.propName === 'scope') { this.propName = null; try { this.fox?.rig?.holdProp?.(null); } catch { /* ignore */ } }
    const p = this.prop;
    if (!p) return;
    this.prop = null;
    try { this.fox?.rig?.holdBoth?.(null); } catch { /* ignore */ }
    p.removeFromParent();
    disposeProp(p);
  }

  /** a short line that doesn't wait (while you play). [v33 tut2] It goes in the tour's dialogue box, not a bubble */
  bark(text, { mood = 'happy' } = {}) {
    return this.T.line ? this.T.line(text, { mood }) : null;
  }

  clear() { this.unpoint(); this.drop(); this.marks.clear(); }
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
    /** a low, close shot on a thing: zoom = world units per px (smaller = closer), pitch in radians */
    c.low = (t, { zoom = 0.0125, pitch = 0.42, dur = 1.1, lift = null, dx = 0, dz = 0 } = {}) => {
      const p = worldOf(game, t) || { x: rig.goal.x, y: 0, z: rig.goal.z };
      rig.pitchGoal = pitch;
      return c.shot([p.x + dx, p.z + dz], { zoom, dur, lift: lift ?? p.y + 0.35 });
    };
    /** over Reynard's shoulder toward `subject`: the camera swings round behind him and goes low */
    // (Reynard already stands on the camera side of what he looks at, so the default keeps the view's yaw;
    // turn: true swings the camera round behind him, snapped to the game's 45-degree views)
    c.ots = (subject, { zoom = 0.0105, pitch = 0.4, dur = 1.3, bias = 0.7, turn = false } = {}) => {
      const f = G.fox, p = worldOf(game, subject);
      if (!f || !p) return Promise.resolve();
      const yaw = turn ? Math.round(Math.atan2(f.x - p.x, f.z - p.z) / PI4) * PI4 : undefined;
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
