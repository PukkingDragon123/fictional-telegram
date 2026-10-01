// Reynard's secret lab: tapping LAB zooms the camera into the fox's hut,
// iris-wipes into a separate interior diorama (src/entities/labScene.js)
// where Reynard is dozing at his desk. Click him to wake him up (he startles,
// hat flies), he chats with the player, and his CRT computer runs the
// research skill tree (src/ui/LabTree.js).
import * as THREE from 'three';
import { CameraRig } from '../core/cameraRig.js';
import { HUT } from '../world/worldgen.js';

const mods = import.meta.glob(['../entities/labScene.js', '../entities/foxRig.js'], { eager: true });
const LabScene = mods['../entities/labScene.js'] || null;
const FoxMod = mods['../entities/foxRig.js'] || null;

const LINES = {
  wake: [
    "Wha-?! I wasn't sleeping! I was... running simulations. Heh.",
    'GAH! Oh, it\'s you. Don\'t sneak up on a genius like that!',
    'Mmf... five more minutes... WAIT. Is that money I smell?',
    "Huh? Oh! Welcome to my lair. I mean, my perfectly legal laboratory.",
  ],
  greet: [
    'What shall we invent today, partner? Something PROFITABLE, I hope.',
    'The computer is warmed up. Let\'s spend some coins to make MORE coins.',
    'Science! Greed! Science funded by greed! My favourite.',
  ],
  chat: [
    'Did you know bears can smell a trout from three kilometres away? Great for business.',
    'This ramen is from Tuesday. Or last Tuesday. Still good, probably.',
    'My fish tank buddy here is named Gerald. He knows too much.',
    'Energy drink number four... or is it five? The room is vibrating.',
    'Blueberries are the secret. Bears fill up on sides and our fish survive. Genius.',
    'Beauty sells! Decorate the pond and more bears come to dinner. Mwahaha.',
    'Tag your best breeders "DO NOT EAT". Bears respect labels. Mostly.',
    'Cross a male and a female of different species... and you might get something LEGENDARY.',
  ],
  research: ['MWAHAHA! Science!', 'Brilliant! As expected of me.', 'Another step towards total pond domination!', 'Ka-ching! Research complete.'],
  poor: ["We're broke! Go feed some bears and come back.", 'Not enough coins. Sell more fish. Heh.'],
  bye: ['Off you go. Make me rich!', "Don't touch anything on the way out.", 'Back to work! I mean, back to YOUR work.'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class LabMode {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.ready = !!(LabScene?.buildLab);
    this.lab = null;
    this.scene = null;
    this.fox = null;
    this.rig = new CameraRig();
    this.rig.freeBounds = true;
    this.rig.pitch = THREE.MathUtils.degToRad(40);
    this.state = 'off';
    this.time = 0;
    this.ui = null;
    game.on('research', (r) => { if (this.tree) this.onResearched(r); });
  }

  onResearched(r) {
    this.fox?.play('sit_laugh', { loop: false, onDone: () => this.fox?.play('sit_type', { loop: true }) });
    this.fox?.setExpression('laugh', { hold: 1.8 });
    this.game.audio.play('fox_laugh', { volume: 0.5 });
    this.lastR = r;
  }

  get open() { return this.ready ? () => this.enter() : null; }

  build() {
    if (this.lab) return;
    this.lab = LabScene.buildLab();
    const sc = new THREE.Scene();
    sc.background = new THREE.Color(LabScene.LAB_BACKGROUND ?? 0x16111d);
    sc.add(this.lab.group);
    this.scene = sc;
    if (FoxMod?.FoxRig) {
      try {
        this.fox = new FoxMod.FoxRig({ shadows: false });
        const seat = this.lab.anchors.foxSeat;
        this.fox.root.position.copy(seat.position);
        this.fox.root.rotation.y = this.seatYaw = seat.rotationY || 0;
        this.fox.root.scale.setScalar(0.8);
        sc.add(this.fox.root);
      } catch (e) { console.warn('FoxRig failed', e); this.fox = null; }
    }
  }

  frame(anchor, instant = false) {
    const rig = this.rig;
    const r = this.game.renderer;
    const fit = anchor.fit || { w: 8, h: 5 };
    const wupp = Math.max(fit.w / Math.max(1, r.lowW), fit.h / Math.max(1, r.lowH));
    rig.goal.copy(anchor.target);
    rig.wuppGoal = wupp;
    rig.yawGoal = anchor.yaw || 0;
    rig.pitchGoal = anchor.pitch ?? THREE.MathUtils.degToRad(44);
    rig.minWupp = 0.001; rig.maxWupp = 1;
    if (instant) { rig.target.copy(anchor.target); rig.wupp = wupp; rig.yaw = rig.yawGoal; rig.pitch = rig.pitchGoal; }
  }

  setBeams(on) {
    this.lab?.group.traverse((o) => { if (o.name === 'windowBeams') o.visible = on; });
  }

  // medium shot on Reynard standing in front of his chair
  frameFox() {
    const seat = this.lab.anchors.foxSeat.position;
    const ov = this.lab.anchors.camOverview;
    const target = new THREE.Vector3(seat.x - 0.7, 0.45, seat.z + 0.75);
    this.frame({ target, fit: { w: 4.8, h: 3.0 }, yaw: ov.yaw || 0, pitch: THREE.MathUtils.degToRad(28) });
    this.setBeams(false);
  }

  // ------------------------------------------------------------ flow
  enter() {
    const game = this.game;
    if (this.active || game.inputLocked || !this.ready) return;
    const ph = game.state.phase;
    if (ph !== 'day' && ph !== 'morning') { game.ui?.toast('The lab is closed right now. Come back in the morning!'); return; }
    this.build();
    this.active = true;
    this.state = 'zoom';
    this.t = 0;
    this.wasPaused = game.state.paused;
    game.state.paused = true;
    game.inputLocked = true;
    game.ui?.closePanel();
    game.setTool({ kind: 'feed' });
    this.saved = { x: game.rig.goal.x, z: game.rig.goal.z, wupp: game.rig.wuppGoal, yaw: game.rig.yawGoal };
    game.rig.goal.set(HUT.x + 1.5, 0.6, HUT.z + 1.8);
    game.rig.freeBounds = true;
    game.rig.wuppGoal = 0.014;
    game.audio.play('whoosh', { volume: 0.5 });
    document.body.classList.add('lab-trans');
  }

  enterInterior() {
    const game = this.game;
    this.frame(this.lab.anchors.camOverview, true);
    game.overrideScene = this.scene;
    game.overrideRig = this.rig;
    this.lab.setNight?.(game.sky.state.night > 0.4);
    this.standing = false;
    this.setBeams(true);
    if (this.fox) { this.fox.play('sit_doze', { loop: true, fade: 0 }); this.fox.setExpression('asleep'); }
    game.audio.setMusic('lab');
    game.audio.play('fox_snore', { volume: 0.35 });
    this.buildUI();
    this.state = 'doze';
    this.snoreT = 2;
  }

  exit() {
    if (!this.active) return;
    this.game.audio.play('iris', { volume: 0.4 });
    this.say(pick(LINES.bye));
    this.state = 'leaving';
    this.t = 0;
    this.closeTree();
  }

  finishExit() {
    const game = this.game;
    game.overrideScene = null;
    game.overrideRig = null;
    game.renderer.setIris(0, 0, -1);
    const s = this.saved;
    game.rig.freeBounds = false;
    game.rig.goal.set(s.x, 0, s.z);
    game.rig.clampGoal();
    game.rig.wuppGoal = s.wupp;
    game.rig.yawGoal = s.yaw;
    game.state.paused = this.wasPaused;
    game.inputLocked = false;
    game.audio.setMusic(game.state.phase === 'rush' ? 'feast' : 'day');
    this.ui?.remove();
    this.ui = null;
    this.active = false;
    this.state = 'off';
    document.body.classList.remove('lab-mode', 'lab-trans');
  }

  // ------------------------------------------------------------ UI overlay
  buildUI() {
    const root = document.getElementById('ui');
    const el = document.createElement('div');
    el.className = 'labui';
    el.innerHTML = `
      <div class="lab-top"><div class="lab-title f-ribbon_green">REYNARD'S SECRET LAB</div><button class="btn red small" data-a="exit">Leave</button></div>
      <div class="lab-hint" data-h="hint">Click Reynard to wake him up</div>
      <div class="lab-say f-parchment hidden" data-h="say"><b>Reynard</b><p></p></div>
      <div class="lab-opts hidden" data-h="opts">
        <button class="btn big" data-a="research">Research</button>
        <button class="btn" data-a="chat">Chat</button>
        <button class="btn red" data-a="exit">Leave</button>
      </div>
      <div class="lab-tree hidden" data-h="tree"></div>`;
    root.appendChild(el);
    this.ui = el;
    document.body.classList.add('lab-mode');
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      this.game.audio.play('click', { volume: 0.35 });
      if (a === 'exit') this.exit();
      else if (a === 'chat') this.chat();
      else if (a === 'research') this.openTree();
    });
  }

  q(h) { return this.ui?.querySelector(`[data-h="${h}"]`); }

  say(text, expr = null) {
    const box = this.q('say');
    if (!box) return;
    box.classList.remove('hidden');
    const p = box.querySelector('p');
    p.textContent = '';
    this.sayText = text;
    this.sayShown = 0;
    this.sayT = 0;
    if (this.fox) {
      this.fox.talk?.(text);
      if (expr) this.fox.setExpression(expr, { hold: 2.5 });
    }
    this.game.audio.babble?.('fox', text, { volume: 0.35 });
  }

  chat() {
    const expr = pick(['smug', 'scheming', 'wink', 'greedy', 'proud']);
    this.fox?.play(pick(['talk', 'shrug', 'point', 'laugh_evil', 'idle_scheme', 'count_coins']), { loop: false, onDone: () => this.fox?.play('idle', { loop: true }) });
    this.say(pick(LINES.chat), expr);
  }

  wake() {
    if (this.state !== 'doze') return;
    this.state = 'waking';
    this.t = 0;
    this.q('hint')?.classList.add('hidden');
    this.game.audio.play('fox_startle', { volume: 0.6 });
    if (this.fox) {
      this.fox.play('wake_startle', { loop: false, onDone: () => { this.standing = true; this.fox?.play('idle', { loop: true }); this.fox?.setExpression('embarrassed', { hold: 1.5 }); } });
    }
  }

  openTree() {
    const host = this.q('tree');
    if (!host || this.tree) return;
    const ui = this.game.ui;
    host.classList.remove('hidden');
    this.q('opts')?.classList.add('hidden');
    this.q('say')?.classList.add('hidden');
    this.frame(this.lab.anchors.camScreen);
    this.game.audio.play('crt_on', { volume: 0.4 });
    this.standing = false;
    this.setBeams(true);
    this.fox?.play('sit_type', { loop: true });
    this.fox?.setExpression('scheming');
    this.tree = ui.makeLabTree(host, () => this.closeTree());
    if (!this.tree) {
      ui.labFallback = true;
      ui.openPanel('lab');
      this.closeTree();
      return;
    }
  }

  closeTree() {
    if (!this.tree) return;
    try { this.tree.destroy?.(); } catch { /* ignore */ }
    this.tree = null;
    this.q('tree')?.classList.add('hidden');
    if (this.state !== 'leaving') {
      this.q('opts')?.classList.remove('hidden');
      this.game.audio.play('crt_off', { volume: 0.35 });
      this.standing = true;
      this.fox?.play('idle', { loop: true });
      this.frameFox();
      if (this.lastR) { this.say(pick(LINES.research), 'proud'); this.lastR = null; }
    }
  }

  refresh() { try { this.tree?.refresh?.(); } catch { /* ignore */ } }

  // clicks on the 3D fox while dozing
  onCanvasClick(sx, sy) {
    if (this.state !== 'doze' || !this.fox) return false;
    const p = this.fox.headTop?.(new THREE.Vector3()) || this.fox.root.position;
    const s = this.rig.worldToScreen(p, this.game.renderer);
    const d = Math.hypot(s.x - sx, s.y - sy + 30);
    if (d < 140) { this.wake(); return true; }
    return false;
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    if (!this.active) return;
    const game = this.game;
    this.time += dt;
    this.t += dt;
    const r = game.renderer;
    if (this.state === 'zoom') {
      // iris closes on the hut
      const k = Math.min(1, this.t / 0.9);
      const hut = game.rig.worldToScreen(new THREE.Vector3(HUT.x + 1.5, 1, HUT.z + 1.5), r);
      const R = Math.hypot(window.innerWidth, window.innerHeight);
      r.setIris(hut.x, hut.y, R * (1 - k * k) + 1);
      if (k >= 1) { this.enterInterior(); this.t = 0; this.state = 'irisin'; }
      return;
    }
    if (this.state === 'irisin') {
      const k = Math.min(1, this.t / 0.7);
      const R = Math.hypot(window.innerWidth, window.innerHeight);
      r.setIris(window.innerWidth / 2, window.innerHeight / 2, R * k * k);
      if (k >= 1) { r.setIris(0, 0, -1); this.state = 'doze'; document.body.classList.remove('lab-trans'); }
    }
    if (this.state === 'leaving') {
      const k = Math.min(1, this.t / 0.8);
      const R = Math.hypot(window.innerWidth, window.innerHeight);
      r.setIris(window.innerWidth / 2, window.innerHeight / 2, R * (1 - k) * (1 - k) + 1);
      if (k >= 1) this.finishExit();
    }
    if (this.state === 'doze') {
      this.snoreT -= dt;
      if (this.snoreT <= 0) { this.snoreT = 2.4 + Math.random(); game.audio.play('fox_snore', { volume: 0.2 }); }
    }
    if (this.state === 'waking' && this.t > 1.5) {
      this.state = 'awake';
      if (!this.standing) { this.standing = true; this.fox?.play('idle', { loop: true, fade: 0.25 }); }
      this.frameFox();
      this.say(pick(LINES.wake) + ' ' + pick(LINES.greet), 'embarrassed');
      this.q('opts')?.classList.remove('hidden');
    }
    // typewriter text
    const box = this.q('say');
    if (box && this.sayText && this.sayShown < this.sayText.length) {
      this.sayT += dt * 45;
      const n = Math.min(this.sayText.length, Math.floor(this.sayT));
      if (n !== this.sayShown) { this.sayShown = n; box.querySelector('p').textContent = this.sayText.slice(0, n); }
    }
    this.lab?.update(dt, this.time);
    if (this.lab?.drawIdleScreen && !this.tree) this.lab.drawIdleScreen(this.time);
    // awake: hop off the chair and stand in front of it facing the visitor;
    // back to the desk for research
    if (this.fox) {
      const fr = this.fox.root;
      const seat = this.lab.anchors.foxSeat.position;
      let yaw = this.seatYaw || 0, tx = seat.x, tz = seat.z;
      if (this.standing && !this.tree) {
        const cam = this.rig.camera.position;
        const dx = cam.x - seat.x, dz = cam.z - seat.z, d = Math.hypot(dx, dz) || 1;
        tx = seat.x - 0.7 + (dx / d) * 0.75; tz = seat.z + (dz / d) * 0.75;
        yaw = Math.atan2(dx, dz);
      }
      const k = Math.min(1, dt * 6);
      fr.position.x += (tx - fr.position.x) * k;
      fr.position.z += (tz - fr.position.z) * k;
      let d = yaw - fr.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      fr.rotation.y += d * k;
    }
    this.fox?.update(dt);
    this.rig.update(dt, r);
  }
}
