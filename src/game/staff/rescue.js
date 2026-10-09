// [v26 staff] Hurt beavers and the stretcher crew.
//   down     knocked over: lies there with dizzy stars and a pop-up (tap -> rescue card)
//   rescue   paid: two medics run in with a stretcher, load it, carry it to the
//            First-Aid Tent (resort: def.jobs.skill === 'care' / type 'firstaid') or its home
//   limp     nobody paid: at the end of the day it gets up and limps home (mood hit)
//   recover  in bed (inside) for a day or two; a First-Aid Tent with a carer is faster
import * as THREE from 'three';
import { angleDiff } from '../../core/rng.js';
import { rollLook } from '../../data/staffGen.js';
import { mulberry32 } from '../../core/rng.js';
import { firstName } from '../../data/staffGen.js';

const modelMods = import.meta.glob('../../entities/extra/staffModels.js', { eager: true });
const SM = modelMods['../../entities/extra/staffModels.js'] || null;

const WORK = new Set(['day', 'rush']);
const POLE = 0.42; // medic distance from the stretcher centre
const HAND_Y = 0.25;

export class Rescue {
  constructor(sys) {
    this.sys = sys;
    this.teams = [];
  }
  get game() { return this.sys.game; }
  reset() { for (const t of this.teams) this.disposeTeam(t); this.teams = []; }
  forget(r) {
    for (const t of [...this.teams]) if (t.rec === r) { this.disposeTeam(t); this.teams.splice(this.teams.indexOf(t), 1); }
  }

  // ------------------------------------------------------------------ getting hurt
  knock(r, b, cause) {
    const game = this.game;
    const gy = b.y || 0;
    game.particles?.stars?.(b.x, gy + 0.6, b.z, 6);
    game.particles?.dust?.(b.x, gy, b.z, 5);
    game.audio.play('st_ouch', { volume: 0.5, pitch: 0.9 + Math.random() * 0.25 });
    this.sys.bark(r, 'hurt', 2.2, true);
    const why = cause === 'bear' ? 'got flattened by a bear' : cause === 'overwork' ? 'fainted from overwork' : cause === 'fall' ? 'took a tumble' : `got hurt (${cause})`;
    game.notify?.(`${firstName(r)} ${why}! Tap the red cross to send the stretcher crew.`, 'warn');
    b.sx = { st: 'down', t: 0 };
  }
  safetyFor(r) {
    const sys = this.sys;
    const b = r.agent;
    let best = null, bd = Infinity;
    for (const s of sys.firstAids()) {
      const d = Math.hypot(s.x - b.x, s.z - b.z);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) return { s: best, kind: 'firstaid', ...sys.door(best) };
    const h = sys.byKey(r.home);
    if (h) return { s: h, kind: 'home', ...sys.door(h) };
    const p = sys.homeSpot(r);
    return { s: null, kind: 'camp', x: p.x, z: p.z };
  }

  // ------------------------------------------------------------------ the stretcher crew
  start(r) {
    const sys = this.sys, b = r.agent;
    if (!b) return;
    const safe = this.safetyFor(r);
    r.hurt.state = 'rescue';
    r.hurt.at = safe.s ? sys.keyOf(safe.s) : null;
    r.hurt.kind = safe.kind;
    // they come out of the safe place (or from a bit closer when it's far)
    let sx = safe.x, sz = safe.z;
    const d = Math.hypot(sx - b.x, sz - b.z);
    if (d > 16) { sx = b.x + (sx - b.x) * (14 / d); sz = b.z + (sz - b.z) * (14 / d); }
    const rnd = mulberry32((r.id * 7919 + this.game.state.day * 31) >>> 0);
    const medics = [0, 1].map((i) => {
      const rig = sys.newRig({ look: { ...rollLook(rnd), acc: 'none' }, seed: r.id * 13 + i }, 'medic');
      rig._keep = true;
      sys.group.add(rig.root);
      return { rig, anim: null };
    });
    const stretcher = this.makeStretcher();
    sys.group.add(stretcher);
    const team = { rec: r, medics, stretcher, phase: 'run', t: 0, x: sx, z: sz, heading: Math.atan2(b.z - sz, b.x - sx), safe, y: 0 };
    this.teams.push(team);
    this.game.audio.play('st_siren', { volume: 0.45 });
    this.game.particles?.puff?.(sx, this.sys.groundAt(sx, sz).gy, sz, 6, 0.25);
    sys.bark(r, 'rescued', 2, true);
  }
  makeStretcher() {
    let m = null;
    try { m = SM?.makeStretcher?.() || null; } catch { m = null; }
    if (m) return m;
    const g = new THREE.Group();
    const pole = new THREE.MeshLambertMaterial({ color: 0x8a5a32 }), cloth = new THREE.MeshLambertMaterial({ color: 0xf2ece0 });
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.035, 0.035), pole); p.position.set(0, 0, s * 0.13); g.add(p); }
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.02, 0.24), cloth);
    g.add(c);
    const x = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.022, 0.04), new THREE.MeshLambertMaterial({ color: 0xd8302a }));
    const x2 = x.clone(); x2.rotation.y = Math.PI / 2;
    g.add(x, x2);
    return g;
  }
  disposeTeam(t) {
    for (const m of t.medics) { m.rig.root.parent?.remove(m.rig.root); m.rig._keep = false; }
    t.stretcher.parent?.remove(t.stretcher);
  }

  update(dt) {
    const sys = this.sys, game = this.game;
    for (const t of [...this.teams]) {
      const r = t.rec, b = r.agent;
      if (!b || !r.hurt || r.gone) { this.disposeTeam(t); this.teams.splice(this.teams.indexOf(t), 1); continue; }
      t.t += dt;
      const run = 3.0, carry = 2.1;
      if (t.phase === 'run') {
        // stop with the stretcher centre right beside the patient
        const tx = b.x - Math.cos(t.heading) * 0.05, tz = b.z - Math.sin(t.heading) * 0.05;
        if (this.step(t, tx, tz, dt, run, 0.08)) { t.phase = 'load'; t.t = 0; game.audio.play('grab', { volume: 0.35, pitch: 0.9 }); }
      } else if (t.phase === 'load') {
        if (t.t > 0.9) {
          t.phase = 'carry'; t.t = 0;
          b.sx = { st: 'stretcher', t: 0 };
          game.particles?.dust?.(b.x, b.y || 0, b.z, 3);
        }
      } else if (t.phase === 'carry') {
        const s = t.safe.s && !t.safe.s.removed ? t.safe.s : null;
        const p = s ? sys.door(s) : { x: t.safe.x, z: t.safe.z };
        if (this.step(t, p.x, p.z, dt, carry, 0.3)) { t.phase = 'drop'; t.t = 0; }
      } else if (t.phase === 'drop') {
        if (t.t > 0.6) {
          this.sendInside(r);
          game.particles?.puff?.(t.x, t.y, t.z, 8, 0.3);
          game.particles?.hearts?.(t.x, t.y + 0.6, t.z, 2);
          t.phase = 'gone'; t.t = 0;
        }
      } else if (t.phase === 'gone') {
        if (t.t > 0.35) { this.disposeTeam(t); this.teams.splice(this.teams.indexOf(t), 1); }
      }
      // the patient rides the stretcher
      if (t.phase === 'carry' || t.phase === 'drop') {
        b.x = t.x; b.z = t.z; b.heading = t.heading;
      }
    }
  }
  step(t, x, z, dt, speed, stop) {
    const dx = x - t.x, dz = z - t.z, d = Math.hypot(dx, dz);
    if (d <= stop) return true;
    const k = Math.min(d - stop * 0.9, speed * dt);
    t.x += (dx / d) * k; t.z += (dz / d) * k;
    t.heading += angleDiff(t.heading, Math.atan2(dz, dx)) * Math.min(1, dt * 7);
    t.moving = true;
    return false;
  }
  /** Into bed: hidden at the First-Aid Tent / home until recovered. */
  sendInside(r) {
    const sys = this.sys, b = r.agent;
    const st = this.game.state;
    const H = r.hurt || (r.hurt = { cause: 'fall', day: st.day });
    const fa = H.at ? sys.byKey(H.at) : null;
    H.state = 'recover';
    // recovery: 1 day when paid (next morning), 2 when nobody came; a staffed First-Aid Tent can fix it the same day
    H.until = st.day + (H.paid ? 1 : 2);
    H.heal = 0;
    if (b) {
      const p = fa ? sys.door(fa) : sys.homeSpot(r);
      b.x = p.x; b.z = p.z;
      b.sx = { st: 'inside', t: 0 };
      b.rig.root.visible = false;
    }
  }
  restore(r) {
    const H = r.hurt, b = r.agent;
    if (!H || !b) return;
    if (H.state === 'rescue') { this.sendInside(r); return; }
    if (H.state === 'recover') { b.sx = { st: 'inside', t: 0 }; b.rig.root.visible = false; return; }
    b.sx = { st: H.state === 'limp' ? 'limp' : 'down', t: 0 };
  }

  // per-frame behaviour of a hurt beaver (StaffSystem.drive)
  drive(r, b, dt) {
    const sys = this.sys, H = r.hurt, game = this.game;
    H.t = (H.t || 0) + dt;
    const st = game.state;
    if (H.state === 'down') {
      b.rig.root.visible = true;
      // nobody paid by the end of the day: up you get, limp home
      if (!WORK.has(st.phase) && st.phase !== 'gameover') {
        H.state = 'limp'; H.unpaid = true;
        r.mood = Math.max(0, r.mood - 25);
        r.sadDays = (r.sadDays || 0) + 1;
        sys.bark(r, 'sad', 2.2, true);
        b.sx = { st: 'limp', t: 0 };
      }
      return;
    }
    if (H.state === 'rescue') { b.rig.root.visible = true; return; }
    if (H.state === 'limp') {
      const h = sys.byKey(r.home);
      const p = h ? sys.door(h) : sys.homeSpot(r);
      if (sys.move(b, p.x, p.z, dt, 0.75, 0.2) || (st.phase === 'night' || st.phase === 'dawn' || st.phase === 'morning')) {
        H.at = h ? sys.keyOf(h) : null;
        this.sendInside(r);
      }
      return;
    }
    if (H.state === 'recover') {
      b.rig.root.visible = false;
      const fa = H.at ? sys.byKey(H.at) : null;
      if (fa && (fa.type === 'firstaid' || fa.def.firstAid || fa.def.jobs?.skill === 'care')) {
        const k = sys.boost(fa);
        if (k > 1.15 && WORK.has(st.phase)) {
          H.heal = (H.heal || 0) + dt * (k - 1);
          // sparkles over the tent now and then
          b.sx.hT = (b.sx.hT || 0) - dt;
          if (b.sx.hT <= 0) { b.sx.hT = 3; const d = sys.door(fa); if (sys.near(d.x, d.z)) game.particles?.sparkle?.(d.x, sys.groundAt(d.x, d.z).gy + 1, d.z - 0.4, 3, 0xc8ffd8); }
          if (H.heal > 45) {
            r.hurt = null; r.bandage = 1;
            const d = sys.door(fa);
            b.x = d.x; b.z = d.z + 0.1;
            b.rig.root.visible = true;
            b.sx = { st: 'cheer', t: 0 };
            sys.dressFor(r);
            game.notify?.(`${firstName(r)} is patched up and back to work!`, 'happy');
          }
        }
      }
    }
  }
  animFor(r, b) {
    const H = r.hurt;
    if (!H) return 'idle';
    if (H.state === 'down') return b.knock ? 'hurt' : 'dizzy';
    if (H.state === 'rescue') return b.sx?.st === 'stretcher' ? 'lie_stretcher' : 'dizzy';
    if (H.state === 'limp') return b.moving ? 'limp' : 'dizzy';
    return 'sleep';
  }

  render(dt) {
    const sys = this.sys;
    for (const t of this.teams) {
      const g = sys.groundAt(t.x, t.z);
      t.y += (g.gy - t.y) * Math.min(1, dt * 10);
      const cx = Math.cos(t.heading), cz = Math.sin(t.heading);
      const moving = t.moving; t.moving = false;
      t.medics.forEach((m, i) => {
        const side = i === 0 ? 1 : -1;
        const mx = t.x + cx * POLE * side, mz = t.z + cz * POLE * side;
        const gy = sys.groundAt(mx, mz).gy;
        const rig = m.rig;
        rig.root.position.set(mx, gy, mz);
        // the front medic faces forward, the back one too (both walk the same way)
        rig.root.rotation.set(0, Math.PI / 2 - t.heading, 0);
        let want = t.phase === 'gone' ? 'wave' : moving ? 'carry_stretcher' : 'stretcher_idle';
        if (t.phase === 'load') want = 'stretcher_idle';
        if (!rig.anims?.includes(want)) want = moving ? 'run' : 'idle';
        if (want !== m.anim) { rig.play(want, { loop: true, fade: 0.15 }); m.anim = want; }
        const vis = t.phase !== 'gone';
        rig.root.visible = vis || t.t < 0.3;
        rig.root.scale.setScalar(t.phase === 'gone' ? Math.max(0.05, 1 - t.t / 0.3) : 1);
        rig.update(dt);
      });
      const s = t.stretcher;
      s.position.set(t.x, t.y + HAND_Y + (moving ? Math.abs(Math.sin(sys.time * 12)) * 0.015 : 0), t.z);
      s.rotation.set(0, -t.heading, 0);
      s.visible = t.phase !== 'gone';
      // the patient lies on it
      const r = t.rec, b = r.agent;
      if (b && (t.phase === 'carry' || t.phase === 'drop')) {
        b.y = s.position.y + 0.03;
        b._onStretcher = true;
      }
    }
  }
}
