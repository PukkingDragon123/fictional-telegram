// [v18 bear events] Defense builds in action (src/data/structuresDefense.js):
// pinecone watchtowers, sprinkler cannons, honey / net traps, scarecrows and
// thorny walls vs. HOSTILE bears (blood-moon bears, bosses, rampaging customers).
//
// Also owns the bear status effects every hostile bear can be under, applied
// from BearSystem.step() through BearEvents.preStep():
//   b.trapT / b.trapKind ('honey' | 'net')  glued in place (pose: struggle / sit in a net)
//   b.knock {vx, vz, t}                       knocked back by a water blast (pose: stagger)
//   b.slowT / b.slowAmt                       soaked: slower (b.slowK is read by BearSystem.moveToward)
//   b.flashT                                  white hit-flash
// Damage: hit(b, dmg) -> blood bears lose hp (calm down at 0), bosses lose hunger
// (resisted), rampaging customers get shooed home after 3 hits.
import * as THREE from 'three';
import { voxelMaterial } from '../core/voxel.js';
import { pineconeGeometry, netGeometry } from '../entities/extra/defenseModels.js';

const TRAP_STATES = new Set(['walk', 'hunt', 'search', 'walkDirect']);
const KNOCK_STATES = new Set(['walk', 'hunt', 'search', 'smash', 'stomp', 'walkDirect']);
const BOSS_RESIST = 0.15; // bosses take 15% of defense damage (as hunger)

export class Defense {
  constructor(game, ev) {
    this.game = game;
    this.ev = ev;
    this.shots = [];
    this.group = new THREE.Group();
    this.group.name = 'defenseFx';
    game.scene.add(this.group);
    this.list = [];
    this.listT = 0;
    this.scareT = 0;
  }

  get bears() { return this.game.bears; }
  dmgMult() { return 1 + (this.game.mods.defenseDmg || 0); }

  isHostile(b) {
    if (!b.visible || b.calmed || b.removed || b.jump) return false;
    if (b.state === 'queued' || b.state === 'commute' || b.state === 'commuteUp' || b.goal?.kind === 'leave') return false;
    if (b.bossFight) return !b.bossDone;
    return !!(b.blood || (b.angry && !b.def.boss));
  }

  // defenses on the map (refreshed a few times a second)
  defenses() {
    if (this.listT <= 0) {
      this.listT = 0.5;
      this.list = this.game.structures.list.filter((s) => s.def.defense);
    }
    return this.list;
  }

  center(s) { return { x: s.x + 0.5, y: this.game.structures.baseY(s), z: s.z + 0.5 }; }

  nearestHostile(x, z, range) {
    let best = null, bd = range * range;
    for (const b of this.bears.list) {
      if (!this.isHostile(b)) continue;
      const d = (b.x - x) ** 2 + (b.z - z) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    if (dt <= 0) return;
    this.listT -= dt;
    const game = this.game;
    const phase = game.state.phase;
    const live = phase === 'rush' || phase === 'evening' || phase === 'day';
    for (const s of this.defenses()) {
      if (s.removed || !s.built) continue;
      const d = s.def.defense;
      const m = s.extraModel?.userData;
      if (d.kind === 'trap') this.updateTrap(s, d, m, dt);
      if (!live) continue;
      if (s.stunT > 0) {
        s.stunT -= dt;
        m?.setStunned?.(s.stunT > 0);
        if (Math.random() < dt * 4) { const c = this.center(s); game.particles.sprite('star', c.x + (Math.random() - 0.5) * 0.5, c.y + (d.kind === 'tower' ? 2.8 : 1.4), c.z + (Math.random() - 0.5) * 0.5, { vy: 0.4, life: 0.6, size: 0.2 }); }
        continue;
      }
      if (d.kind === 'tower') this.updateTower(s, d, m, dt);
      else if (d.kind === 'cannon') this.updateCannon(s, d, m, dt);
    }
    this.scareT -= dt;
    if (this.scareT <= 0) { this.scareT = 0.4; this.updateScarecrows(); }
    this.updateShots(dt);
  }

  updateTrap(s, d, m, dt) {
    if (d.trap === 'honey') {
      const left = Math.max(0, d.charges - (s.stock | 0));
      if (m && m.charges !== left) m.setCharges?.(left);
      if (left <= 0) return;
    } else if (d.trap === 'net') {
      if (s.stock > 0) { s.stock = Math.max(0, s.stock - dt); m?.setArmed?.(s.stock <= 0); return; }
      m?.setArmed?.(true);
    }
    const cx = s.x + 0.5, cz = s.z + 0.5;
    for (const b of this.bears.list) {
      if (!this.isHostile(b) || b.trapT > 0 || b.inWater || !TRAP_STATES.has(b.state)) continue;
      const r = 0.5 + 0.22 * b.def.scale;
      if ((b.x - cx) ** 2 + (b.z - cz) ** 2 > r * r) continue;
      this.trapBear(b, s, d);
      break;
    }
  }

  trapBear(b, s, d) {
    const game = this.game;
    const boss = !!(b.bossFight || b.def.boss);
    b.trapT = d.stick * (boss ? 0.4 : 1) * (1 + (game.mods.defenseDmg || 0) * 0.5);
    b.trapMax = b.trapT;
    b.trapKind = d.trap;
    b.trapX = b.x; b.trapZ = b.z;
    if (d.trap === 'honey') {
      s.stock = (s.stock | 0) + 1;
      game.audio.play('honey_squish', { volume: 0.6 });
      game.particles.word('snap', b.x, b.y + 1.6 * b.def.scale, b.z, { size: 0.3 });
      this.bears.say(b, b.blood ? 'GRRK?! STICKY!' : boss ? 'MY PAWS!' : 'Ew, sticky!', null, 'honey', 1.6);
    } else {
      s.stock = d.rearm;
      s.extraModel?.userData?.setArmed?.(false);
      game.audio.play('net_snap', { volume: 0.6 });
      game.particles.word('snap', b.x, b.y + 1.6 * b.def.scale, b.z, { size: 0.34 });
      const net = new THREE.Mesh(netGeometry(), voxelMaterial());
      net.scale.setScalar(Math.max(0.8, b.def.scale * 0.95));
      net.castShadow = true;
      net.position.set(b.x, b.y, b.z);
      this.group.add(net);
      b.netMesh = net;
      this.bears.say(b, boss ? 'A NET?! HOW DARE YOU' : 'HEY! LET ME OUT!', 'emo_anger', null, 1.6);
    }
    this.hit(b, d.dmg || 0, s, { quiet: true });
  }

  updateTower(s, d, m, dt) {
    s.cd = (s.cd ?? Math.random()) - dt;
    if (s.cd > 0) return;
    const c = this.center(s);
    const b = this.nearestHostile(c.x, c.z, d.range);
    if (!b) { s.cd = 0.3; return; }
    s.cd = d.every;
    const ang = Math.atan2(b.z - c.z, b.x - c.x);
    m?.throwAt?.(ang);
    const game = this.game;
    game.audio.play('pinecone_throw', { volume: 0.35, pitch: 0.9 + Math.random() * 0.3 });
    const mesh = new THREE.Mesh(pineconeGeometry(), voxelMaterial());
    mesh.castShadow = false;
    const y0 = c.y + 2.55;
    mesh.position.set(c.x, y0, c.z);
    this.group.add(mesh);
    const dist = Math.hypot(b.x - c.x, b.z - c.z);
    this.shots.push({ mesh, x0: c.x + Math.cos(ang) * 0.3, y0, z0: c.z + Math.sin(ang) * 0.3, b, t: -0.12, dur: 0.45 + dist * 0.05, h: 0.9 + dist * 0.08, dmg: d.dmg, src: s });
  }

  updateCannon(s, d, m, dt) {
    s.cd = (s.cd ?? Math.random()) - dt;
    const c = this.center(s);
    if (s.aimB) {
      // wind-up: aim for a moment, then fire
      const b = s.aimB;
      m?.aim?.(Math.atan2(b.z - c.z, b.x - c.x));
      s.aimT -= dt;
      if (s.aimT > 0) return;
      s.aimB = null;
      if (this.isHostile(b) && Math.hypot(b.x - c.x, b.z - c.z) < d.range + 1) this.blast(s, d, b, c, m);
      return;
    }
    if (s.cd > 0) return;
    const b = this.nearestHostile(c.x, c.z, d.range);
    if (!b) { s.cd = 0.3; return; }
    s.cd = d.every;
    s.aimB = b; s.aimT = 0.3;
  }

  blast(s, d, b, c, m) {
    const game = this.game;
    m?.fire?.();
    game.audio.play('water_blast', { volume: 0.55 });
    const dx = b.x - c.x, dz = b.z - c.z, L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L;
    // a fat stream of droplets from the nozzle to the bear
    const y0 = c.y + 1.45;
    for (let i = 0; i < 26; i++) {
      const k = Math.random();
      game.particles.spawnFx(Math.random() < 0.6 ? 'drop' : 'drop_s', c.x + ux * (0.7 + k * (L - 0.7)), y0 + Math.sin(k * Math.PI) * 0.35 - k * 0.4, c.z + uz * (0.7 + k * (L - 0.7)), {
        vx: ux * 3 + (Math.random() - 0.5), vy: 0.6 + Math.random() * 1.2, vz: uz * 3 + (Math.random() - 0.5), grav: 8, drag: 0.4, life: 0.5 + Math.random() * 0.3, size: 0.1 + Math.random() * 0.06, bright: true,
      });
    }
    game.particles.word('splash', b.x, b.y + 1.5 * b.def.scale, b.z, { size: 0.3 });
    const boss = !!(b.bossFight || b.def.boss);
    if (KNOCK_STATES.has(b.state) && !(b.trapT > 0)) {
      const push = d.push * (boss ? 0.35 : b.def.scale > 1.4 ? 0.6 : 1);
      const T = 0.45;
      b.knock = { vx: (ux * push) / T, vz: (uz * push) / T, t: T, T };
      if (b.state === 'smash') b.smashed = true; // the swing is interrupted
    }
    b.slowT = d.slowT; b.slowAmt = d.slow * (boss ? 0.5 : 1);
    this.hit(b, d.dmg, s);
  }

  updateScarecrows() {
    const game = this.game;
    for (const s of this.defenses()) {
      if (!s.built || s.removed || s.def.defense.kind !== 'scare') continue;
      const r = s.def.defense.radius, cx = s.x + 0.5, cz = s.z + 0.5;
      for (const b of this.bears.list) {
        if (!b.visible || (b.x - cx) ** 2 + (b.z - cz) ** 2 > r * r) continue;
        if (b.blood || b.bossFight || b.def.boss) {
          if (!b.laughedAt && !b.calmed && b.state !== 'commute') { b.laughedAt = true; this.bears.say(b, b.blood ? 'HEH. STRAW.' : 'A SCARECROW? CUTE.', null, null, 1.6); }
          continue;
        }
        if (!b.angry) continue;
        if (this.bears.scareOff(b)) {
          this.bears.say(b, 'EEK! A SCARECROW!', 'emo_sweat', null, 1.8);
          game.particles.word('wow', cx, 1.8, cz, { size: 0.3 });
          s.extraModel && (s.popT = 0.45);
        }
      }
    }
  }

  updateShots(dt) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const p = this.shots[i];
      p.t += dt / p.dur;
      if (p.t < 0) { p.mesh.visible = false; continue; }
      p.mesh.visible = true;
      const b = p.b;
      const tx = b.x, ty = b.y + 1.15 * b.def.scale, tz = b.z;
      const t = Math.min(1, p.t);
      p.mesh.position.set(p.x0 + (tx - p.x0) * t, p.y0 + (ty - p.y0) * t + Math.sin(t * Math.PI) * p.h, p.z0 + (tz - p.z0) * t);
      p.mesh.rotation.x += dt * 14; p.mesh.rotation.z += dt * 9;
      if (p.t >= 1) {
        this.group.remove(p.mesh);
        this.shots.splice(i, 1);
        if (this.isHostile(b) || (b.visible && b.trapT > 0)) {
          this.game.audio.play('bonk', { volume: 0.4, pitch: 0.9 + Math.random() * 0.25 });
          this.game.particles.word('bonk', tx, ty + 0.5, tz, { size: 0.28 });
          this.game.particles.debris(tx, ty, tz, 4, [0x6a4a20, 0x8a6030, 0x5a3a18]);
          this.hit(b, p.dmg, p.src);
        } else this.game.particles.dust(tx, b.y, tz, 3);
      }
    }
  }

  // ------------------------------------------------------------ damage
  hit(b, dmg, src = null, { quiet = false } = {}) {
    if (!b || b.removed) return;
    const amt = dmg * this.dmgMult();
    if (amt > 0 && b.rig && !quiet) { b.rig.setMaterial('flash'); b.flashT = 0.1; }
    if (b.bossFight) { this.ev.boss.hit(b, amt * BOSS_RESIST, src); return; }
    if (b.blood) {
      if (b.calmed) return;
      b.bhp -= amt;
      if (b.bhp <= 0) this.ev.moon.calm(b, src);
      return;
    }
    if (b.angry && !b.def.boss) {
      b.shoo = (b.shoo || 0) + 1;
      if (b.shoo >= 3 && this.bears.scareOff(b)) this.bears.say(b, 'OW! OK OK, I\'M LEAVING!', 'emo_sweat', null, 1.8);
    }
  }

  // a bear smashed structure s (BearSystem 'smash' state): thorns + boss bonus damage
  onSmash(b, s) {
    const d = s?.def?.defense;
    if (d?.thorns && !s.removed) {
      this.game.particles.word('pow', b.x, b.y + 1.5 * b.def.scale, b.z, { size: 0.3 });
      this.game.audio.play('bonk', { volume: 0.35, pitch: 0.7 });
      if (!(b.bloodTold > 0)) { b.bloodTold = 1; this.bears.say(b, 'OW! SPIKY!', 'emo_anger', null, 1.4); }
      this.hit(b, d.thorns, s);
    }
  }

  restoreMat(b) {
    if (!b.rig) return;
    b.rig.setMaterial((b.blood && !b.calmed) || b.matHold ? 'angry' : 'normal');
  }

  // status effects; true = skip the normal BearSystem step this frame
  preStep(b, dt) {
    if (b.flashT > 0) { b.flashT -= dt; if (b.flashT <= 0) this.restoreMat(b); }
    if (b.netMesh) b.netMesh.position.set(b.x, b.y, b.z);
    if (b.knock) {
      const k = b.knock;
      k.t -= dt;
      const g = this.game.grid;
      const nx = b.x + k.vx * dt, nz = b.z + k.vz * dt;
      if (g.bearPassable(Math.floor(nx), Math.floor(nz))) { b.x = nx; b.z = nz; } else k.t = Math.min(k.t, 0.05);
      b.y += (this.bears.groundY(b) - b.y) * Math.min(1, dt * 12);
      b.poseOverride = 'stagger'; b.poseT01 = 1 - Math.max(0, k.t) / k.T;
      b.moving = false;
      if (k.t <= 0) { b.knock = null; b.poseOverride = null; b.poseT01 = null; if (!b.trapT) this.bears.decide(b); }
      return true;
    }
    if (b.trapT > 0) {
      b.trapT -= dt;
      b.x = b.trapX; b.z = b.trapZ;
      b.moving = false;
      b.poseOverride = b.trapKind === 'net' ? 'sit' : 'angry_stomp';
      if (b.trapKind === 'honey' && Math.random() < dt * 6) this.game.particles.lit.spawn(b.x + (Math.random() - 0.5) * 0.6 * b.def.scale, b.y + 0.15, b.z + (Math.random() - 0.5) * 0.6 * b.def.scale, 0, 0.6, 0, 0.6, 0.05, Math.random() < 0.5 ? 0xf0b030 : 0xe8a020, 3, 0.5, 0);
      if (b.trapT <= 0) this.release(b);
      return true;
    }
    if (b.slowT > 0) b.slowT -= dt;
    const blood = b.blood && !b.calmed ? 1 - (this.game.mods.bloodSlow || 0) : 1;
    b.slowK = (b.speedK || 1) * (b.slowT > 0 ? 1 - (b.slowAmt || 0) : 1) * blood;
    return false;
  }

  release(b) {
    b.trapT = 0;
    if (b.netMesh) { this.group.remove(b.netMesh); b.netMesh = null; this.game.particles.debris(b.x, b.y + 0.6, b.z, 8, [0xd8c090, 0xc8b080]); }
    b.poseOverride = null;
    if (!b.removed && b.visible) this.bears.decide(b);
  }

  // a bear left the scene: drop any attached fx
  forget(b) {
    if (b.netMesh) { this.group.remove(b.netMesh); b.netMesh = null; }
    b.trapT = 0; b.knock = null;
  }

  // ------------------------------------------------------------ repair
  needsRepair(s) {
    const d = s.def.defense;
    if (!d || !s.built || s.removed) return false;
    return s.hp < s.maxHp - 0.01 || (d.trap === 'honey' && (s.stock | 0) > 0);
  }
  repairCost(s) {
    const d = s.def.defense;
    const missing = Math.max(0, 1 - s.hp / s.maxHp) + (d.trap === 'honey' ? ((s.stock | 0) / d.charges) * 0.5 : 0);
    const k = 1 - (this.game.mods.repairDiscount || 0);
    return Math.max(1, Math.ceil(s.def.cost * 0.4 * missing * k));
  }
  repair(s, { free = false } = {}) {
    if (!this.needsRepair(s)) return false;
    const game = this.game;
    const c = this.repairCost(s);
    if (!free && !game.spend(c, 'builds')) return false;
    game.structures.repair(s, s.maxHp);
    if (s.def.defense.trap === 'honey') s.stock = 0;
    game.particles.buildCloud(s.x + 0.5, game.structures.baseY(s), s.z + 0.5, 0.8);
    game.particles.sparkle(s.x + 0.5, game.structures.baseY(s) + 0.6, s.z + 0.5, 6);
    game.audio.play('build', { volume: 0.45 });
    return c;
  }
  damaged() { return this.game.structures.list.filter((s) => this.needsRepair(s)); }
  repairAllCost() { return this.damaged().reduce((a, s) => a + this.repairCost(s), 0); }
  repairAll() {
    const list = this.damaged();
    const cost = list.reduce((a, s) => a + this.repairCost(s), 0);
    if (!list.length) return false;
    if (!this.game.spend(cost, 'builds')) return false;
    for (const s of list) this.repair(s, { free: true });
    this.game.notify(`Patched up ${list.length} defense${list.length > 1 ? 's' : ''} for ${cost} coins.`, 'info', { dur: 2.5 });
    return true;
  }
  // Quick Repairs research: the beavers patch everything up a bit each morning
  morningPatch() {
    if (!(this.game.mods.repairDiscount > 0)) return;
    for (const s of this.game.structures.list) if (s.def.defense && s.built && s.hp < s.maxHp) this.game.structures.repair(s, Math.ceil(s.maxHp * 0.25));
  }

  clearFx() {
    for (const p of this.shots) this.group.remove(p.mesh);
    this.shots.length = 0;
  }
}
