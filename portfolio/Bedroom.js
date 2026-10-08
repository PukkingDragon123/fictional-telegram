// Reynard's bedroom (the game's own buildBedroom) with the fox asleep in bed.
// Click him to wake him up: he changes into his teacher suit behind the screen.
import * as THREE from 'three';
import { CameraRig } from '../src/core/cameraRig.js';
import { buildBedroom } from '../src/entities/bedroomScene.js';
import { FoxRig } from '../src/entities/foxRig.js';

const WALK = 1.3;

export class Bedroom {
  constructor(game) {
    this.game = game;
    this.rig = new CameraRig();
    this.rig.freeBounds = true;
    this.room = buildBedroom();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.room.background);
    this.scene.add(this.room.group);
    this.fox = new FoxRig({ shadows: true });
    this.scene.add(this.fox.root);
    this.fox.onEvent = (n) => this.onEvent(n);
    this.walk = { goal: null, yaw: 0, res: null, goalYaw: null };
    this.clock = 0;
    this.sleeping = true;
  }

  sfx(n, o) { try { this.game.audio.play(n, o); } catch { /* optional */ } }

  onEvent(n) {
    if (n === 'poof') { this.sfx('bed_poof', { volume: 0.55 }); this.room.setPajamasHung(false); this.room.setMonocle(true); }
    else if (n === 'step') this.sfx('step', { volume: 0.1 });
    else if (n === 'snore' && this.sleeping) this.sfx('bed_snore', { volume: 0.25 });
  }

  /** asleep in bed, lamp off, moonlit */
  start() {
    const A = this.room.anchors, f = this.fox;
    this.room.setLamp(false, true);
    this.room.setQuilt(1, true);
    this.room.setPajamasHung(true);
    this.room.setMonocle(false);
    f.setOutfit('pajamas');
    f.root.position.copy(A.bed.position);
    f.root.rotation.y = this.walk.yaw = A.bed.rotationY;
    f.play('sleep_bed', { fade: 0, restart: true });
    this.cam('wide', true);
  }

  cam(name, instant = false) {
    const A = this.room.anchors;
    const a = A['cam' + name[0].toUpperCase() + name.slice(1)] || A.camWide;
    if (a === this._camA && !instant) return;
    this._camA = a; this._camName = name;
    const r = this.game.renderer;
    const wupp = Math.max(a.fit.w / Math.max(1, r.lowW || 640), a.fit.h / Math.max(1, r.lowH || 360));
    const rig = this.rig;
    rig.goal.copy(a.target); rig.wuppGoal = wupp; rig.yawGoal = a.yaw || 0; rig.pitchGoal = a.pitch;
    rig.minWupp = 0.0005; rig.maxWupp = 1;
    if (instant) { rig.target.copy(a.target); rig.wupp = wupp; rig.yaw = rig.yawGoal; rig.pitch = rig.pitchGoal; }
  }
  refit() { if (this._camName) { this._camA = null; this.cam(this._camName, true); } }

  wait(s) { return new Promise((r) => setTimeout(r, s * 1000)); }
  walkTo(pos, yaw = null) {
    return new Promise((res) => { this.walk.goal = pos.clone(); this.walk.goalYaw = yaw; this.walk.res = res; this.fox.play('walk', { fade: 0.18 }); });
  }

  /** wake up, get dressed in the teacher suit, resolve when he is ready to go */
  async wake(say) {
    const A = this.room.anchors, f = this.fox;
    this.sleeping = false;
    this.room.setLamp(true);
    f.setExpression('shocked', { hold: 1.5 });
    f.play('wake_startle', { fade: 0.1, restart: true });
    this.sfx('bed_creak', { volume: 0.5 });
    say('Gah! Who... what time is it?', 'shocked', 2200);
    this.cam('bed');
    await this.wait(2.2);
    this.room.setQuilt(0);
    await this.walkTo(A.screen.position, A.screen.rotationY);
    this.cam('screen');
    await Promise.race([f.changeInto('teacher'), this.wait(1.9)]);
    f.setOutfit('teacher');
    f.holdProp?.('pointer');
    say('Right. Class. Follow me.', 'proud', 2000);
    this.cam('wide');
    await this.walkTo(A.start.position, A.start.rotationY);
    await this.wait(1.6);
  }

  update(dt) {
    this.clock += dt;
    const f = this.fox, w = this.walk, root = f.root;
    if (w.goal) {
      const d = new THREE.Vector3().subVectors(w.goal, root.position).setY(0);
      const L = d.length();
      if (L > 0.03) { root.position.addScaledVector(d, Math.min(L, WALK * dt) / L); w.yaw = Math.atan2(d.x, d.z); }
      else {
        root.position.copy(w.goal); w.goal = null;
        if (w.goalYaw != null) w.yaw = w.goalYaw;
        f.play('idle', { fade: 0.2 });
        const r = w.res; w.res = null; r?.();
      }
      let dy = w.yaw - root.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      root.rotation.y += dy * Math.min(1, dt * 10);
    }
    f.update(dt);
    this.room.update(dt, this.clock, this.rig.camera);
    this.rig.update(dt, this.game.renderer);
  }
}
