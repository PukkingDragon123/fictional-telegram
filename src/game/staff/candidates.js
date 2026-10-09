// [v26 staff] Job seekers: they walk out of the forest and line up at the
// Interview Tent (a pop-up shows how many). Help Wanted Posters raise how many
// come and how good they are; a Recruiter at the tent helps too. They wait a
// couple of days, then give up. Saved as plain profiles in state.staff.cands.
import * as THREE from 'three';
import { angleDiff } from '../../core/rng.js';
import { rollBeaver } from '../../data/staffGen.js';

const WAIT_DAYS = 2;

export class Candidates {
  constructor(sys) {
    this.sys = sys;
    this.agents = new Map(); // profile -> { rig, x, z, y, heading, st, anim, t }
    this.spawnT = 4;
  }
  get game() { return this.sys.game; }
  get list() { return this.sys.S.cands; }

  reset() {
    for (const a of this.agents.values()) this.dropAgent(a);
    this.agents.clear();
  }
  dropAgent(a) { if (a.rig) { a.rig.root.parent?.remove(a.rig.root); a.rig._keep = false; } }

  posters() {
    let n = 0;
    for (const s of this.game.structures.list) if (s.built && !s.removed && s.def.staff?.posters) n += s.def.staff.posters;
    return n;
  }
  capacity() { return 2 + Math.min(4, this.posters()); }
  quality() {
    const t = this.sys.tents()[0];
    const rec = t ? this.sys.boost(t) - 1 : 0; // a Recruiter adds up to ~+1
    return Math.max(0, Math.min(0.95, 0.12 + Math.min(5, this.posters()) * 0.1 + rec * 0.25 + Math.min(0.15, (this.game.state.day || 1) * 0.004)));
  }
  interval() { return 42 / (1 + 0.22 * Math.min(5, this.posters())) / Math.max(1, this.sys.tents().length ? this.sys.boost(this.sys.tents()[0]) : 1); }
  waiting() { return this.list.filter((c) => c.st === 'wait'); }
  queueSpot(t, i) {
    const d = this.sys.door(t);
    return { x: d.x + 0.62 + i * 0.4, z: d.z + 0.36 + (i % 2) * 0.1 };
  }

  update(simDt, dt) {
    const sys = this.sys, game = this.game;
    const st = game.state;
    const tent = sys.tents()[0] || null;
    const day = st.phase === 'day' || st.phase === 'rush';
    // new arrivals during the day
    if (tent && st.phase === 'day' && simDt > 0) {
      this.spawnT -= simDt;
      if (this.spawnT <= 0) {
        this.spawnT = this.interval() * (0.75 + Math.random() * 0.5);
        if (this.list.filter((c) => c.st !== 'leave').length < this.capacity()) this.spawn(tent);
      }
    }
    if (!tent) {
      for (const c of this.list) if (c.st !== 'leave') c.st = 'leave';
    }
    let qi = 0;
    for (const c of [...this.list]) {
      let a = this.agents.get(c);
      if (!a) {
        if (!tent || c.st === 'leave') { this.list.splice(this.list.indexOf(c), 1); continue; }
        a = this.makeAgent(c, tent, qi, true);
      }
      a.t += simDt || 0;
      a.moving = false;
      a.rig.root.visible = day;
      if (!day) continue;
      if (c.st === 'walk' || c.st === 'wait') {
        const p = this.queueSpot(tent, qi);
        if (this.step(a, p.x, p.z, simDt, c.st === 'walk' ? 1.7 : 1.2, 0.06)) {
          if (c.st === 'walk') { c.st = 'wait'; game.audio.play('st_knock', { volume: 0.3 }); }
          a.heading += angleDiff(a.heading, 2.4) * Math.min(1, (simDt || 0) * 4);
        }
        qi++;
      } else if (c.st === 'leave') {
        if (!a.exit) a.exit = this.sys.edgePoint(a.x, a.z);
        if (this.step(a, a.exit.x, a.exit.z, simDt, 2.2, 0.3) || a.t > 25) {
          game.particles?.puff?.(a.x, a.y, a.z, 5, 0.22);
          this.dropAgent(a);
          this.agents.delete(c);
          this.list.splice(this.list.indexOf(c), 1);
        }
      }
    }
  }
  step(a, x, z, dt, speed, stop) {
    const dx = x - a.x, dz = z - a.z, d = Math.hypot(dx, dz);
    if (d <= stop) return true;
    const k = Math.min(d - stop * 0.9, speed * (dt || 0));
    a.x += (dx / d) * k; a.z += (dz / d) * k;
    a.heading += angleDiff(a.heading, Math.atan2(dz, dx)) * Math.min(1, (dt || 0) * 8);
    a.moving = k > 1e-4;
    return false;
  }
  spawn(tent) {
    const q = this.quality();
    const p = rollBeaver({ quality: q });
    p.st = 'walk';
    p.day = this.game.state.day;
    this.list.push(p);
    this.makeAgent(p, tent, this.list.length - 1, false);
    if (!this.sys.S.seen.cand) {
      this.sys.S.seen.cand = 1;
      this.game.notify?.('A job seeker is walking up to the Interview Tent! Tap the tent to interview them.', 'happy');
    }
  }
  makeAgent(c, tent, qi, atQueue) {
    const sys = this.sys;
    const rig = sys.newRig(c, 'tie');
    rig._keep = true;
    sys.group.add(rig.root);
    let x, z;
    if (atQueue) { const p = this.queueSpot(tent, qi); x = p.x; z = p.z; }
    else {
      // from the forest edge, in a random direction from the tent
      const d = sys.door(tent);
      const a = Math.random() * Math.PI * 2;
      const g = this.game.grid;
      x = d.x; z = d.z;
      for (let k = 0; k < 30; k++) {
        x += Math.cos(a); z += Math.sin(a);
        const tx = Math.floor(x), tz = Math.floor(z);
        if (!g.inb(tx, tz)) { x -= Math.cos(a); z -= Math.sin(a); break; }
        if (k > 4 && !g.meadow[tz * g.w + tx] && !g.isWater(tx, tz)) { x += Math.cos(a) * 1.5; z += Math.sin(a) * 1.5; break; }
      }
      x = Math.max(2, Math.min(g.w - 2, x)); z = Math.max(2, Math.min(g.h - 2, z));
    }
    const a = { c, rig, x, z, y: sys.groundAt(x, z).gy, heading: Math.atan2(tent.z - z, tent.x - x), st: c.st, anim: null, t: 0, moving: false };
    this.agents.set(c, a);
    return a;
  }
  /** The tent card hired this one: hand its rig over to the staff. */
  hire(c) {
    const a = this.agents.get(c);
    const i = this.list.indexOf(c);
    if (i < 0) return null;
    this.list.splice(i, 1);
    const profile = { ...c };
    delete profile.st; delete profile.day;
    let rig = null, x, z;
    if (a) { rig = a.rig; rig._keep = false; x = a.x; z = a.z; this.agents.delete(c); rig.setOutfit?.('overalls'); }
    return this.sys.hire(profile, { x, z, rig });
  }
  pass(c) {
    if (c.st === 'leave') return;
    c.st = 'leave';
    const a = this.agents.get(c);
    if (a) a.t = 0;
  }
  onDay(day) {
    for (const c of this.list) if (c.st !== 'leave' && day - (c.day || day) >= WAIT_DAYS) c.st = 'leave';
    // overnight they camped in the forest: back in the queue
    const t = this.sys.tents()[0];
    if (!t) return;
    let i = 0;
    for (const c of this.list) {
      const a = this.agents.get(c);
      if (!a || c.st === 'leave') continue;
      const p = this.queueSpot(t, i++);
      a.x = p.x; a.z = p.z; c.st = 'wait';
    }
  }
  restore() {
    const t = this.sys.tents()[0];
    if (!t) return;
    let i = 0;
    for (const c of this.list) { if (c.st === 'leave') continue; c.st = 'wait'; this.makeAgent(c, t, i++, true); }
  }

  render(dt) {
    const sys = this.sys;
    for (const a of this.agents.values()) {
      const rig = a.rig;
      if (!rig.root.visible) continue;
      const g = sys.groundAt(a.x, a.z);
      a.y += (g.gy - a.y) * Math.min(1, dt * 10);
      rig.root.position.set(a.x, a.y, a.z);
      rig.root.rotation.set(0, Math.PI / 2 - a.heading, 0);
      rig.root.scale.setScalar(a.c.look?.size || 1);
      let want = a.moving ? (g.inWater ? 'swim' : 'walk') : 'idle';
      if (!a.moving && a.c.st === 'wait') {
        const p = a.c.personality, tr = a.c.traits || [];
        const ph = (sys.time * 0.13 + (a.c.seed % 97) / 97) % 1;
        if (tr.includes('lazy') || p === 'chill') want = 'sit';
        else if (tr.includes('nervous') || p === 'shy') want = ph < 0.5 ? 'nervous' : 'idle';
        else if (p === 'bubbly') want = ph < 0.3 ? 'wave' : 'idle';
        else if (p === 'dramatic') want = ph < 0.25 ? 'celebrate' : 'idle';
        else if (p === 'grumpy') want = 'tap_foot';
      }
      if (!rig.anims?.includes(want)) want = a.moving ? 'run' : 'idle';
      if (want !== a.anim) { rig.play?.(want, { loop: true, fade: 0.2 }); a.anim = want; }
      rig.update?.(dt);
    }
  }
}
