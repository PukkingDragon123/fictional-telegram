// Bedtime: a full-screen cutscene in Reynard's bedroom (src/entities/bedroomScene.js).
// He yawns, brushes his teeth (foam, a sparkly "ding"), poofs into his pajamas,
// hops into bed, pulls up the quilt, clicks off the lamp... then the cute sleep
// effect (big chunky Zzz, a snore bubble, a dream cloud of coins / fish / a bear
// in a suit, twinkling stars, moonbeam) and a slow iris down to black.
//
//   const bed = new Bedtime(game);
//   await bed.play({ skippable: true });   // resolves with the screen fully BLACK
//   ...run the night tour behind the black...
//   await bed.reveal({ dur: 1.2 });         // fade the black away
//   bed.active; bed.skip(); bed.update(realDt)  // update is optional (else it self-drives)
//
// While it plays it owns game.overrideScene / overrideRig, pauses the game, locks
// input and adds body.bedtime-mode (hides the HUD); everything is restored, behind
// the black, before play() resolves. Works with a minimal fake `game`
// (tools/bedtime-preview.js): only `renderer` and `state` are really needed.
import * as THREE from 'three';
import { CameraRig } from '../core/cameraRig.js';
import { Transition } from '../ui/Transition.js';
import { spriteCanvas, hasSprite } from '../ui/sprites.js';
import { buildBedroom } from '../entities/bedroomScene.js';
import '../ui/bedtime.css';

const mods = import.meta.glob(['../entities/foxRig.js'], { eager: true });
const FoxMod = mods['../entities/foxRig.js'] || null;

const WALK_SPEED = 1.3;
const SKIP = Symbol('skip');

// ------------------------------------------------------------------ pixel textures for the sleep effect
function pixTex(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function rowsCanvas(rows, pal, scale = 1) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const cv = document.createElement('canvas');
  cv.width = w * scale; cv.height = h * scale;
  const g = cv.getContext('2d');
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (pal[r[x]]) { g.fillStyle = pal[r[x]]; g.fillRect(x * scale, y * scale, scale, scale); } });
  return cv;
}
const ZPAL = { k: '#2a1a40', w: '#ffffff', l: '#d8ccff', L: '#a898e8' };
const Z_ROWS = [
  'kkkkkkkkkk',
  'kwwwwwwwwk',
  'kwlllllwwk',
  'kkkkklwwkk',
  '...klwwk..',
  '..klwwk...',
  '.klwwkkkkk',
  'kwwwwwwwwk',
  'kwLLLLLLLk',
  'kkkkkkkkkk',
];
const CLOUD = [
  '.......kkkkk....kkkk.........',
  '.....kkwwwwwkkkkwwwwkk.......',
  '...kkwwwwwwwwwwwwwwwwwkkk....',
  '..kwwwwwwwwwwwwwwwwwwwwwwk...',
  '.kwwwwwwwwwwwwwwwwwwwwwwwwkk.',
  'kwwwwwwwwwwwwwwwwwwwwwwwwwwwk',
  'kwwwwwwwwwwwwwwwwwwwwwwwwwwwk',
  'kwwwwwwwwwwwwwwwwwwwwwwwwwwwk',
  'kwwwwwwwwwwwwwwwwwwwwwwwwwwwk',
  'kwwwwwwwwwwwwwwwwwwwwwwwwwwlk',
  '.kwwwwwwwwwwwwwwwwwwwwwwwwlk.',
  '.kwwwwwwwwwwwwwwwwwwwwwwwllk.',
  '..kllwwwwwwwwwwwwwwwwwwlllk..',
  '...kkllwwwwkkkkkwwwwwlllkk...',
  '.....kkkkkk.....kkkkkkkk.....',
];
const CPAL = { k: '#3a2a5a', w: '#fbf8ff', l: '#d8d0f0' };
// Reynard dreams of a bear in a business suit (with a fork!)
const BEAR = [
  '.bb......bb..',
  'bBBb....bBBb.',
  'bBBBbbbbBBBb.',
  '.bBBBBBBBBb..',
  '.bBkBBBBkBb..',
  '.bBBBnnBBBb..',
  '..bBBnnBBb...',
  '...bbbbbb....',
  '..sswRRwss...',
  '.ssssRRssss..',
  '.sssssRsssse.',
  '.sssssssssse.',
  '..ssss.ssss..',
  '..kk....kk...',
];
const BPAL = { b: '#4a2a18', B: '#8a5a38', k: '#1a1010', n: '#d8b088', s: '#2a3a6a', w: '#ffffff', R: '#d83a32', e: '#c8ccd8' };
const BUB = ['.kkk.', 'kwwwk', 'kwwlk', 'kwllk', '.kkk.'];

export class Bedtime {
  constructor(game) {
    this.game = game;
    this._active = false;
    this.room = null; this.scene = null; this.fox = null;
    this.rig = new CameraRig();
    this.rig.freeBounds = true;
    this.clock = 0;
    this._timers = [];
    this._chain = Promise.resolve();
    this._ext = 0; this._raf = 0;
    this.selfDrive = true;
    this.black = null;
    this.fx = { zs: [], cloud: null, bubs: [], on: false, t: 0, dream: -1 };
  }

  get active() { return this._active; }

  /** Build the room + fox ahead of time (avoids a hitch when night falls). */
  preload() { this._build(); return this; }

  /** Play the whole bedtime sequence. Resolves { completed, skipped } with the screen BLACK. */
  play({ skippable = true } = {}) {
    const run = this._chain.then(() => this._run({ skippable }));
    this._chain = run.catch(() => {});
    return run;
  }

  /** Fade the black (left over by play) away. */
  reveal({ dur = 1.2 } = {}) {
    const el = this.black;
    if (!el) return Promise.resolve();
    this.black = null;
    el.style.transition = `opacity ${Math.max(0, dur)}s ease`;
    void el.offsetWidth;
    el.style.opacity = '0';
    return new Promise((res) => setTimeout(() => { el.remove(); res(); }, Math.max(0, dur) * 1000 + 30));
  }

  /** Jump straight to the black. */
  skip() {
    if (!this._active || this._skip) return;
    this._skip = true;
    const fr = this.walk?.res;
    if (fr) { this.walk.res = null; this.walk.goal = null; fr(); }
    for (const t of this._timers.splice(0)) t.res();
  }

  /** Call every frame with the real dt (optional: it drives itself otherwise). */
  update(dt) {
    if (!this._active) return;
    this._ext = performance.now();
    this._tick(dt);
  }

  dispose() {
    this.skip();
    this.room?.dispose();
    this.fox?.dispose?.();
    this.black?.remove(); this.black = null;
    this.room = null; this.fox = null; this.scene = null;
  }

  // ---------------------------------------------------------------- build
  _build() {
    if (this.room) return;
    this.room = buildBedroom();
    const sc = new THREE.Scene();
    sc.background = new THREE.Color(this.room.background);
    sc.add(this.room.group);
    this.scene = sc;
    if (FoxMod?.FoxRig) {
      try {
        const fox = new FoxMod.FoxRig({ shadows: true });
        sc.add(fox.root);
        fox.onEvent = (name) => this._foxEvent(name);
        this.fox = fox;
      } catch (e) { console.warn('Bedtime: FoxRig failed', e); this.fox = null; }
    }
    this.walk = { goal: null, yaw: 0, res: null };
    this._buildFx();
  }

  _buildFx() {
    const sc = this.scene;
    const mk = (cv, w) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pixTex(cv), alphaTest: 0.5, transparent: false, depthTest: true }));
      s.userData.aspect = cv.height / cv.width; s.userData.w = w;
      s.visible = false; s.renderOrder = 10;
      sc.add(s);
      return s;
    };
    const zcv = rowsCanvas(Z_ROWS, ZPAL);
    for (let i = 0; i < 6; i++) this.fx.zs.push({ s: mk(zcv, 0.1), on: false, t: 0 });
    for (let i = 0; i < 3; i++) this.fx.bubs.push(mk(rowsCanvas(BUB, CPAL), 0.05));
    this.fx.cloudCv = document.createElement('canvas');
    this.fx.cloudCv.width = CLOUD[0].length * 2; this.fx.cloudCv.height = CLOUD.length * 2;
    this.fx.cloud = mk(this.fx.cloudCv, 0.42);
    this._drawDream(0);
  }

  // dream cloud: coins, then a fish, then a bear in a suit (cycling)
  _drawDream(i) {
    const cv = this.fx.cloudCv, g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = false;
    g.drawImage(rowsCanvas(CLOUD, CPAL, 2), 0, 0);
    const icon = (name, x, y, s = 1) => { if (hasSprite(name)) { const c = spriteCanvas(name, 1); g.drawImage(c, x, y, c.width * s, c.height * s); } };
    const k = i % 3;
    if (k === 0) { icon('coin', 12, 6); icon('coin', 24, 10); icon('coin', 36, 5); }
    else if (k === 1) { icon('fish_gold', 16, 5, 1); icon('heart', 38, 6); }
    else g.drawImage(rowsCanvas(BEAR, BPAL, 2), 16, 1);
    this.fx.cloud.material.map.needsUpdate = true;
  }

  // ---------------------------------------------------------------- timing
  wait(sec) {
    if (this._skip) return Promise.reject(SKIP);
    return new Promise((res, rej) => { this._timers.push({ t: this.clock + sec, res: () => (this._skip ? rej(SKIP) : res()) }); });
  }
  _check() { if (this._skip) throw SKIP; }

  _sfx(name, o = {}) {
    const a = this.game.audio;
    try { if (a?.play) a.play(name, o); } catch (e) { /* audio is optional */ }
  }

  // ---------------------------------------------------------------- flow
  async _run({ skippable }) {
    const game = this.game;
    this._skip = false;
    this._active = true;
    this.clock = 0;
    this._build();
    const result = { completed: false, skipped: false };
    this.saved = {
      overrideScene: game.overrideScene ?? null, overrideRig: game.overrideRig ?? null,
      paused: game.state ? game.state.paused : undefined, inputLocked: game.inputLocked,
    };
    this._selfDrive();
    try {
      await this._wipe(() => this._enter(skippable));
      this._check();
      await this._sequence();
      result.completed = true;
    } catch (e) {
      if (e !== SKIP) console.warn('Bedtime error', e);
      result.skipped = e === SKIP;
    }
    // to black (quickly when skipped), then restore everything behind it
    this._skip = false;
    await this._toBlack(result.skipped ? 0.25 : 0);
    this._leave();
    this._active = false;
    cancelAnimationFrame(this._raf); this._raf = 0;
    return result;
  }

  _wipe(mid) {
    const ui = this.game.ui;
    if (ui?.wipeTransition) return ui.wipeTransition('iris', mid);
    try { this._trans ||= new Transition(); return this._trans.wipe('iris', mid); } catch { mid(); return Promise.resolve(); }
  }

  _enter(skippable) {
    const game = this.game, room = this.room, f = this.fox;
    game.overrideScene = this.scene;
    game.overrideRig = this.rig;
    if (game.state) game.state.paused = true;
    game.inputLocked = true;
    document.body.classList.add('bedtime-mode');
    room.setLamp(true, true); room.setQuilt(0, true); room.setPajamasHung(true); room.setMonocle(false);
    if (f) {
      f.setOutfit('default'); f.holdProp(null); f.holdBoth(null); f.setAim(null); f.setExpression(null);
      const a = room.anchors.start;
      f.root.position.copy(a.position);
      f.root.rotation.y = this.walk.yaw = a.rotationY;
      f.play('yawn_big', { fade: 0, restart: true });
    }
    this._fxOff();
    this.cam('wide', true);
    this._buildUI(skippable);
    this._tick(0);
  }

  _leave() {
    const game = this.game, s = this.saved || {};
    game.overrideScene = s.overrideScene ?? null;
    game.overrideRig = s.overrideRig ?? null;
    if (game.state && s.paused !== undefined) game.state.paused = s.paused;
    game.inputLocked = s.inputLocked ?? false;
    document.body.classList.remove('bedtime-mode');
    this.skipBtn?.remove(); this.skipBtn = null;
    this.iris?.remove(); this.iris = null;
    this._fxOff();
    this.fox?.stopTalking?.();
  }

  _buildUI(skippable) {
    this.skipBtn?.remove();
    this.black?.remove();
    const b = document.createElement('div');
    b.className = 'bt-black';
    document.body.appendChild(b);
    this.black = b;
    if (skippable) {
      const s = document.createElement('button');
      s.className = 'bt-skip';
      s.textContent = 'SKIP ▸▸';
      s.onclick = (e) => { e.stopPropagation(); this.skip(); };
      document.body.appendChild(s);
      this.skipBtn = s;
    }
    const c = document.createElement('canvas');
    c.className = 'bt-iris';
    document.body.appendChild(c);
    this.iris = c;
    this._irisK = 0;
  }

  async _sequence() {
    const room = this.room, A = room.anchors, f = this.fox;
    this._sfx('bed_yawn', { volume: 0.5 });
    await this.wait(1.7);
    // to the sink, brush brush brush
    await this.walkTo(A.sink.position, A.sink.rotationY);
    this.cam('sink');
    f?.holdProp('toothbrush');
    f?.play('brush_teeth', { fade: 0.2 });
    await this.wait(2.0);
    // sparkly clean teeth: ding!
    f?.play('idle', { fade: 0.25 });
    f?.holdProp(null);
    f?.setExpression('happy', { hold: 0.9 });
    if (f) {
      const m = f.root.worldToLocal(f.headTop(new THREE.Vector3()));
      for (let i = 0; i < 4; i++) f.puff('star', new THREE.Vector3(m.x + (i - 1.5) * 0.06, m.y - 0.33 + (i % 2) * 0.04, m.z + 0.3), { vel: new THREE.Vector3((i - 1.5) * 0.15, 0.25, 0.1), life: 0.7, size: 0.06, delay: i * 0.05 });
    }
    this._sfx('bed_ding', { volume: 0.55 });
    await this.wait(0.65);
    // behind the screen... poof! pajamas
    this.cam('wide');
    await this.walkTo(A.screen.position, A.screen.rotationY);
    this.cam('screen');
    if (f) {
      const ch = f.changeInto('pajamas');
      await Promise.race([ch, this.wait(1.75)]);
    } else await this.wait(1.6);
    this._check();
    // hop into bed
    this.cam('bed');
    await this.walkTo(A.bed.position, Math.PI);
    if (f) { f.root.rotation.y = this.walk.yaw = A.bed.rotationY; f.play('climb_bed', { fade: 0, restart: true }); }
    await this.wait(2.15);
    await this.wait(0.35);
    // lamp off: click
    this._sfx('bed_click', { volume: 0.6 });
    room.setLamp(false);
    await this.wait(0.7);
    // the cute sleep effect, slowly pushing in
    this.cam('close');
    this._fxOn();
    this._sfx('bed_lullaby', { volume: 0.45 });
    await this.wait(4.2);
    // iris close
    this._irisGoal = 1; this._irisDur = 1.6;
    await this.wait(1.7);
  }

  // ---------------------------------------------------------------- fox events -> sounds + room
  _foxEvent(name) {
    const room = this.room;
    switch (name) {
      case 'scrub': this._sfx('bed_scrub', { volume: 0.35 }); break;
      case 'foam': this._sfx('bed_foam', { volume: 0.3 }); break;
      case 'gargle': this._sfx('bed_gargle', { volume: 0.4 }); break;
      case 'poof': this._sfx('bed_poof', { volume: 0.55 }); room?.setPajamasHung(false); room?.setMonocle(true); break;
      case 'step': this._sfx('step', { volume: 0.12 }); break;
      case 'creak': this._sfx('bed_creak', { volume: 0.5 }); break;
      case 'flop': this._sfx('bed_creak', { volume: 0.4, pitch: 0.8 }); break;
      case 'quilt': this._sfx('bed_quilt', { volume: 0.45 }); room?.setQuilt(1); break;
      case 'snore': if (this.fx.on) this._sfx('bed_snore', { volume: 0.35 }); break;
      case 'mumble': this._sfx('bed_mumble', { volume: 0.35 }); break;
      case 'pop': this._sfx('bed_foam', { volume: 0.25, pitch: 0.7 }); break;
      default:
    }
  }

  // ---------------------------------------------------------------- walking
  walkTo(pos, yaw = null) {
    const f = this.fox;
    if (!f) return this.wait(0.6);
    if (this._skip) return Promise.reject(SKIP);
    return new Promise((res, rej) => {
      this.walk.goal = pos.clone(); this.walk.goalYaw = yaw;
      this.walk.res = () => (this._skip ? rej(SKIP) : res());
      f.play('walk', { fade: 0.18 });
    });
  }

  _tickFox(dt) {
    const f = this.fox;
    if (!f) return;
    const w = this.walk, root = f.root;
    if (w.goal) {
      const d = new THREE.Vector3().subVectors(w.goal, root.position).setY(0);
      const L = d.length();
      if (L > 0.03) {
        root.position.addScaledVector(d, Math.min(L, WALK_SPEED * dt) / L);
        w.yaw = Math.atan2(d.x, d.z);
      } else {
        root.position.copy(w.goal);
        w.goal = null;
        if (w.goalYaw != null) w.yaw = w.goalYaw;
        f.play('idle', { fade: 0.2 });
        const r = w.res; w.res = null; r?.();
      }
    }
    // turn smoothly toward the walking direction
    let dy = w.yaw - root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    root.rotation.y += dy * Math.min(1, dt * 10);
    f.update(dt);
  }

  // ---------------------------------------------------------------- camera
  cam(name, instant = false) {
    const a = this.room.anchors['cam' + name[0].toUpperCase() + name.slice(1)] || this.room.anchors.camWide;
    this._camA = a; this._camName = name;
    const rig = this.rig, r = this.game.renderer;
    const wupp = Math.max(a.fit.w / Math.max(1, r?.lowW || 640), a.fit.h / Math.max(1, r?.lowH || 360));
    rig.goal.copy(a.target);
    rig.wuppGoal = wupp;
    rig.yawGoal = a.yaw || 0;
    rig.pitchGoal = a.pitch;
    rig.minWupp = 0.0003; rig.maxWupp = 1;
    // cuts are cuts: jump there
    rig.target.copy(a.target); rig.wupp = wupp; rig.yaw = rig.yawGoal; rig.pitch = rig.pitchGoal;
    void instant;
    this._push = name === 'close' ? { w0: wupp, t: 0 } : null;
  }

  // ---------------------------------------------------------------- sleep effect
  _fxOn() { this.fx.on = true; this.fx.t = 0; this.fx.nextZ = 0.2; this.fx.dream = -1; }
  _fxOff() {
    this.fx.on = false;
    for (const z of this.fx.zs) { z.on = false; z.s.visible = false; }
    for (const b of this.fx.bubs) b.visible = false;
    if (this.fx.cloud) this.fx.cloud.visible = false;
  }

  _tickFx(dt) {
    const F = this.fx, f = this.fox;
    if (!F.on || !f) return;
    F.t += dt;
    // his face (head pivot -> face centre), whatever pose he's in
    f.head.updateWorldMatrix(true, false);
    const head = f.head.localToWorld(new THREE.Vector3(0, 0.3, 0.3)).add(new THREE.Vector3(0, 0.12, 0));
    // big chunky Z z z floating up and to the side, swaying, growing then popping away
    F.nextZ -= dt;
    if (F.nextZ <= 0) {
      F.nextZ = 0.85;
      const z = F.zs.find((q) => !q.on);
      if (z) { z.on = true; z.t = 0; z.size = 0.06 + Math.random() * 0.02; z.o = head.clone().add(new THREE.Vector3(0.12, 0.05, 0.08)); }
    }
    for (const z of F.zs) {
      if (!z.on) continue;
      z.t += dt;
      const u = z.t / 2.6;
      if (u >= 1) { z.on = false; z.s.visible = false; continue; }
      const k = u < 0.12 ? (u / 0.12) * 1.2 : u < 0.2 ? 1.2 - (u - 0.12) / 0.08 * 0.2 : u > 0.82 ? 1 - (u - 0.82) / 0.18 : 1;
      z.s.visible = true;
      z.s.position.set(z.o.x + u * 0.3 + Math.sin(z.t * 3) * 0.04, z.o.y + u * 0.45, z.o.z);
      const s = z.size * (1 + u * 1.3) * k;
      z.s.scale.set(s, s, 1);
      z.s.material.rotation = Math.sin(z.t * 2.5) * 0.25;
    }
    // dream cloud: trail of little bubbles, then the cloud bobs in; the dream changes every 1.2 s
    const cl = F.cloud, appear = Math.min(1, Math.max(0, (F.t - 0.6) / 0.35));
    const base = head.clone().add(new THREE.Vector3(-0.32, 0.3, -0.05));
    F.bubs.forEach((b, i) => {
      const k = Math.min(1, Math.max(0, (F.t - 0.15 - i * 0.15) / 0.2));
      b.visible = k > 0;
      b.position.lerpVectors(head.clone().add(new THREE.Vector3(-0.05, -0.02, 0.05)), base, (i + 1) / 4);
      b.position.y += Math.sin(F.t * 2 + i) * 0.008;
      const s = (0.025 + i * 0.012) * (k < 1 ? k * 1.2 : 1);
      b.scale.set(s, s, 1);
    });
    cl.visible = appear > 0;
    if (cl.visible) {
      const d = Math.floor(Math.max(0, F.t - 0.6) / 1.2);
      if (d !== F.dream) { F.dream = d; this._drawDream(d); F.popT = 0; }
      F.popT = (F.popT || 0) + dt;
      const pop = F.popT < 0.15 ? 1 + Math.sin(F.popT / 0.15 * Math.PI) * 0.08 : 1;
      const w = cl.userData.w * (appear < 1 ? 0.3 + appear * 0.9 : 1) * pop;
      cl.scale.set(w, w * cl.userData.aspect, 1);
      cl.position.copy(base).add(new THREE.Vector3(-0.08, 0.1 + Math.sin(F.t * 1.6) * 0.012, 0));
    }
    // a few twinkles drifting in the moonlight
    F.tw = (F.tw || 0) - dt;
    if (F.tw <= 0) {
      F.tw = 0.45;
      const p = f.root.worldToLocal(head.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.9, (Math.random() - 0.2) * 0.5, 0.15)));
      f.puff('star', p, { vel: new THREE.Vector3(0, 0.05, 0), life: 0.9, size: 0.035 + Math.random() * 0.02 });
    }
  }

  // ---------------------------------------------------------------- iris + black
  _tickIris(dt) {
    const c = this.iris;
    if (!c) return;
    if (this._irisGoal) this._irisK = Math.min(1, this._irisK + dt / (this._irisDur || 1.6));
    const k = this._irisK;
    if (k <= 0) { if (c.width) { c.width = 0; c.height = 0; } return; }
    const S = 4; // chunky pixels
    const w = Math.ceil(innerWidth / S), h = Math.ceil(innerHeight / S);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    // circle around his sleepy face, shrinking (ease in), with a ring of dither at the edge
    let cx = w / 2, cy = h / 2;
    if (this.fox && this.game.renderer) {
      this.fox.head.updateWorldMatrix(true, false);
      const p = this.rig.worldToScreen(this.fox.head.localToWorld(new THREE.Vector3(0, 0.3, 0.3)), this.game.renderer);
      cx = p.x / S; cy = p.y / S;
    }
    const R0 = Math.hypot(w, h), e = k * k * (3 - 2 * k);
    const r = R0 * (1 - e) * (1 - e) + (k < 1 ? 0 : -1);
    if (r > 0) {
      const img = g.getImageData(0, 0, w, h), d = img.data;
      const x0 = Math.max(0, Math.floor(cx - r - 2)), x1 = Math.min(w, Math.ceil(cx + r + 2));
      const y0 = Math.max(0, Math.floor(cy - r - 2)), y1 = Math.min(h, Math.ceil(cy + r + 2));
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          const open = dd < r - 1 || (dd < r + 1 && ((x + y) & 1));
          if (open) d[(y * w + x) * 4 + 3] = 0;
        }
      g.putImageData(img, 0, 0);
    }
    if (k >= 1 && this.black) this.black.style.opacity = '1';
  }

  _toBlack(dur) {
    const b = this.black;
    if (!b) return Promise.resolve();
    if (b.style.opacity === '1') return Promise.resolve();
    b.style.transition = `opacity ${dur}s ease`;
    void b.offsetWidth;
    b.style.opacity = '1';
    return dur > 0 ? this._sleep(dur * 1000 + 30) : Promise.resolve();
  }
  _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // ---------------------------------------------------------------- per frame
  _selfDrive() {
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!this._active) { this._raf = 0; return; }
      if (this.selfDrive && now - this._ext > 250) this._tick(dt);
      this._raf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(loop);
  }

  _tick(dt) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    this.clock += dt;
    for (let i = this._timers.length - 1; i >= 0; i--) {
      const t = this._timers[i];
      if (this.clock >= t.t) { this._timers.splice(i, 1); t.res(); }
    }
    if (!this.room) return;
    this._tickFox(dt);
    this.room.update(dt, this.clock);
    this._tickFx(dt);
    // slow push-in on the sleeping face
    if (this._push) { this._push.t += dt; this.rig.wuppGoal = this.rig.wupp = this._push.w0 * (1 - Math.min(0.12, this._push.t * 0.025)); }
    if (this.game.renderer) this.rig.update(dt, this.game.renderer);
    this._tickIris(dt);
  }
}
