// [v26 feast] Crew beavers: temporary helpers that run into a feast scene (medic,
// diver, pushers, waiters...), do their bit and run back home. They are their
// own little rigs (not the BeaverSystem's workers), so they never steal a job.
import * as THREE from 'three';
import { BeaverRig } from '../../entities/critters3d.js';
import { WATER_Y } from '../../world/grid.js';
import { angleDiff, damp } from '../../core/rng.js';
import { HUT } from '../../world/worldgen.js';

export class CrewBeaver {
  constructor(ctx, { x, z, hat = 'yellow', name = null } = {}) {
    this.ctx = ctx;
    const game = (this.game = ctx.game);
    this.rig = new BeaverRig({ hat });
    this.rig.root.scale.setScalar(1.15);
    game.scene.add(this.rig.root);
    this.home = { x, z };
    this.x = x; this.z = z;
    this.y = this.groundY();
    this.heading = Math.random() * 6.28;
    this.target = null;
    this.anim = null;
    this.want = 'idle';
    this.carried = null;
    this.name = name;
    this.dead = false;
    this.play('idle');
    game.particles.puff(x, this.y + 0.2, z, 8, 0.3);
  }

  // world point above the head (for bubbles / words)
  top(out = new THREE.Vector3()) { return out.set(this.x, this.y + 0.95, this.z); }

  groundY(x = this.x, z = this.z) {
    const g = this.game.grid;
    const tx = Math.floor(x), tz = Math.floor(z);
    if (g.isWater(tx, tz)) return WATER_Y - 0.42;
    const s = g.structAt(tx, tz);
    if (s && s.type === 'platform' && s.built) return 0.62;
    return g.surfaceY(tx, tz);
  }

  get inWater() { return this.game.grid.isWater(Math.floor(this.x), Math.floor(this.z)); }

  play(name, opts = {}) {
    this.want = name;
    if (this.anim !== name || opts.restart) { this.rig.play(name, { loop: opts.loop ?? true, fade: 0.15, ...opts }); this.anim = name; }
  }

  // run somewhere: resolves on arrival (stopAt = how close is close enough)
  go(x, z, { speed = 3.4, stopAt = 0.15 } = {}) {
    return new Promise((resolve) => { this.target = { x, z, speed, stopAt, resolve }; });
  }

  face(who) { const p = this.ctx.at(who, 0); this.faceH = Math.atan2(p.z - this.z, p.x - this.x); }

  // carry a prop over the head (the 'carry_log' arms, without the log)
  carry(obj) {
    this.drop();
    if (!obj) return;
    const o = obj.obj || obj;
    o.position.set(0, 0, 0);
    this.rig.logJ.add(o);
    this.carried = o;
  }

  // hold a prop in a paw
  hand(obj, side = 'R') {
    const o = obj.obj || obj;
    o.position.set(0, 0, 0);
    (side === 'L' ? this.rig.gripL : this.rig.gripR).add(o);
    return o;
  }

  drop() {
    if (this.carried) { this.carried.parent?.remove(this.carried); this.carried = null; }
  }

  say(text, opts = {}) { return this.ctx.say(this, text, { voice: 'beaver', ...opts }); }

  async leave() {
    this.drop();
    await this.go(this.home.x, this.home.z, { speed: 3.8 });
    this.dispose(true);
  }

  tick(dt) {
    if (this.dead) return;
    const t = this.target;
    let moving = false;
    if (t) {
      const dx = t.x - this.x, dz = t.z - this.z, d = Math.hypot(dx, dz);
      if (d <= t.stopAt) { this.target = null; t.resolve(); }
      else {
        const sp = t.speed * (this.inWater ? 0.8 : 1);
        const st = Math.min(d, sp * dt);
        this.x += (dx / d) * st; this.z += (dz / d) * st;
        this.heading += angleDiff(this.heading, Math.atan2(dz, dx)) * Math.min(1, dt * 9);
        moving = true;
      }
    } else if (this.faceH != null) {
      this.heading += angleDiff(this.heading, this.faceH) * Math.min(1, dt * 7);
    }
    this.y = damp(this.y, this.groundY(), 10, dt);
    let anim = this.want;
    if (moving) anim = this.carried ? 'carry_log' : this.inWater ? 'swim' : 'run';
    else if (this.carried && (anim === 'idle' || anim === 'run')) anim = 'carry_log';
    if (anim !== this.anim) { this.rig.play(anim, { loop: true, fade: 0.15 }); this.anim = anim; }
    const r = this.rig;
    r.root.position.set(this.x, this.y, this.z);
    r.root.rotation.set(0, Math.PI / 2 - this.heading, 0);
    r.update(dt);
    if (this.carried && r.props?.log) r.props.log.visible = false;
    if (moving && this.inWater && Math.random() < dt * 4) this.game.particles.ripple(this.x, this.z, 0.35, 0.8, 0.25);
    if (moving && !this.inWater && Math.random() < dt * 3) this.game.particles.dust(this.x, this.y, this.z, 1);
  }

  dispose(poof = false) {
    if (this.dead) return;
    this.dead = true;
    if (this.target) { this.target.resolve(); this.target = null; }
    if (poof) this.game.particles.puff(this.x, this.y + 0.2, this.z, 6, 0.25);
    this.drop();
    this.rig.root.parent?.remove(this.rig.root);
    try { this.rig.dispose(); } catch { /* shared geometry */ }
  }
}

// where crew comes from: the nearest beaver lodge, else the fox's hut
export function crewHome(game, x, z) {
  let best = null, bd = Infinity;
  for (const s of game.structures.list) {
    if (!s.built || s.type !== 'lodge') continue;
    const d = Math.hypot(s.x + 0.5 - x, s.z + 0.5 - z);
    if (d < bd) { bd = d; best = { x: s.x + 0.5, z: s.z + 1.6 }; }
  }
  if (!best || bd > 26) {
    // nothing close: they come running from a few tiles away (towards the hut)
    const hx = HUT.x + 1.5, hz = HUT.z + 3.6;
    const d = Math.hypot(hx - x, hz - z) || 1;
    const k = Math.min(1, 9 / d);
    best = { x: x + (hx - x) * k, z: z + (hz - z) * k };
  }
  return best;
}
