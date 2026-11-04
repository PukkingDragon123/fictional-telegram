// [v32 dive] Diving under Loon Lake. Like the homes (HomeMode.js), the dive swaps in its own
// scene and camera through game.overrideScene / game.overrideRig: the main camera glides to
// the dive flag, an iris closes on a splash, the underwater diorama (src/entities/diveScene.js)
// is built, the iris opens on Reynard sinking in through a cloud of bubbles. The world is
// paused down there; Back / Esc / the SURFACE button / holding W at the surface comes up.
//
// Down there: Reynard in his dive gear (snorkel mask + his top hat, yellow flippers, the brass
// helmet, twin tanks) swims where you tap or with WASD / arrows (Q / E: nearer / further), the
// AIR gauge runs down (gear decides how long), the plants part around him, fish scatter. Chief
// Buff swims along during lessons and barks orders. The farms (src/game/dive/farms.js) stand on
// the sand: tap one for its card, the build kit at the bottom places new ones.
//
//   mode.enter({ instant })  mode.exit()  mode.active  mode.state ('zoom' | 'irisout' | 'dive' | 'leaving')
import * as THREE from 'three';
import { CameraRig } from '../../core/cameraRig.js';
import { FoxRig } from '../../entities/foxRig.js';
import { ChiefBuff } from '../../entities/critterDuck2.js';
import { buildDiveScene, SURF, X0, X1, DEEP_X, FARM_AREA, uwMat } from '../../entities/diveScene.js';
import { diveGeo, gearModel, farmModel, whistleModel, litterModel, hoopModel } from '../../entities/diveModels.js';
import { DiveLife, FishPack } from './life.js';
import { DiveUI, ico, esc } from '../../ui/dive/diveUI.js';
import { FARMS, FARM_ORDER, GEAR, LAKE } from '../../data/dive.js';
import { SPECIES_BY_ID } from '../../data/species.js';
import { fishIconURL } from '../fishSprites.js';
import { VS, FV, spriteMat, SPARK_ROWS } from '../../entities/critterKit.js';
import { WATER_Y } from '../../world/grid.js';

const { sin, cos, abs, max, min, PI, hypot, atan2 } = Math;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const angTo = (a, b) => atan2(sin(b - a), cos(b - a));
const _v = new THREE.Vector3(), _e = new THREE.Euler(), _q = new THREE.Quaternion();

const FOX_LINES = {
  enter: ['Blub. I mean: magnificent.', 'Cold! COLD! ...Refreshing. Very refreshing.', 'Look at all these free fish.', 'My hat is staying ON, thank you.'],
  lowAir: ['Air... getting... thin...', 'I should head up. Soon. Now. NOW.', 'Running low on bubbles!'],
  gasp: ['GASP! Air! Glorious air!', 'Pfaah! I could have stayed longer. Probably.'],
  deep: ['Too deep and dark for a snorkel. I need a proper helmet.', 'Nope. Not without the brass hat.', 'The Deep Hole. Chief said: helmet first.'],
  surfaceHint: ['Hold W (or up) at the surface to climb out.'],
  litter: ['Litter! On MY future farmland?', 'Got it. The lake thanks me. Where is my reward, lake?', 'Who throws a boot in a lake?'],
  wreck: ['A wreck! Treasure? ...Mostly planks. Promising planks.', 'Good bones, Chief said. I see a hatchery.'],
  whiskers: ['That catfish is GOLD. And the size of a canoe.', 'Old Whiskers. He\'s looking at me. He\'s judging my hat.'],
};
const CHIEF = {
  lesson1: {
    start: ['Chin down, bubbles up, recruit! Swim with WASD or tap where you want to go.', 'First: touch the bottom. Show me you can get DOWN there.'],
    bed: ['Outstanding! Now, I dropped my whistle off the dock. It\'s shiny. Near the old log. FIND IT.'],
    find: ['MY WHISTLE! Good work, recruit.', 'Now SURFACE. Watch that air gauge. Top left button, or hold W at the top.'],
  },
  lesson2: {
    start: ['Flippers on! Three hoops, recruit. Kick through every one!', 'Hoops first. Then the litter. Leave my lake cleaner than you found it.'],
    hoop: ['That\'s ONE!', 'That\'s TWO!', 'THREE! Squared away!'],
    litter: ['Good! Bag it.', 'That\'s the way.', 'Outstanding. My lake thanks you.'],
    litterGo: ['Now: three bits of litter on the bottom. A can, a boot, a bottle... MOVE!'],
    done: ['Lesson complete! Surface, recruit. Smartly now.'],
  },
  farm: {
    start: ['Farm lesson, recruit. See the open sand? That\'s the farm ground.', 'Pick a Net Pen from the build kit and set it down out there.'],
    built: ['Good pen! Now tap it and stock it with fingerlings.'],
    stocked: ['Now we wait. Fish grow while you work up top. Kelp and feeders make them grow faster.', 'Come back when the tag says READY and harvest.'],
  },
  helmet: {
    start: ['The brass hat suits you, recruit. The Deep Hole is east. Follow the slope down.', 'There\'s an old barge down there. Find it.'],
    deep: ['Steady breathing. Slow kicks. You\'re in the deep now.'],
    wreck: ['THAT\'S the barge. Good bones. Fix her up one day and she\'ll be a fine hatchery.'],
  },
  idle: ['Buddy check! ...You see me? I see you. Good.', 'Kick from the hips, not the knees!', 'Breathe slow, recruit.', 'Eyes on your air.'],
};

export class DiveMode {
  constructor(sys) {
    this.sys = sys;
    this.game = sys.game;
    this.active = false;
    this.state = 'off';
    this.rig = new CameraRig();
    this.rig.freeBounds = true;
    this.t = 0;
    this._ray = new THREE.Ray();
    this.keys = new Set();
    this._onKey = (e) => this.onKey(e, true);
    this._onKeyUp = (e) => this.onKey(e, false);
    this._onDown = (e) => this.onDown(e);
    this._onMove = (e) => this.onMove(e);
    this._onWheel = (e) => this.onWheel(e);
  }

  get S() { return this.sys.S; }
  gear() { return this.sys.gear(); }

  // ------------------------------------------------------------------ flow
  blocked() {
    const g = this.game;
    if (this.active) return 'busy';
    if (g.lab?.active || g.homes?.active || g.homePC?.roomActive || g.classroom?.active || g.bedtime?.active || g.cutscene?.active || g.cine?.active || g.tutorial?.active || g.titleMode) return 'busy';
    if (g.director?.active || g.zones?.busy || g.npcScenes?.busy) return 'busy';
    const be = g.bearEvents;
    if (be?.boss?.active || be?.moon?.siege) return 'danger';
    const ph = g.state.phase;
    if (ph !== 'day' && ph !== 'morning') return 'closed';
    return null;
  }

  enter({ instant = false } = {}) {
    const g = this.game;
    const why = this.blocked();
    if (why) {
      if (why === 'closed') g.notify?.('Too dark to dive now. Come back in the morning!', 'no');
      else if (why === 'danger') g.notify?.('Not now. Bears!', 'no');
      return false;
    }
    if (!this.gear()) { g.notify?.('Chief Buff won\'t let anyone dive without gear. Talk to him!', 'no'); return false; }
    this.active = true;
    this.t = 0;
    this.wasPaused = g.state.paused;
    g.state.paused = true;
    g.inputLocked = true;
    g.ui?.closePanel?.();
    g.villagers?.card?.close?.();
    g.setTool?.({ kind: 'feed' });
    try { g.ui?.bubbles?.clear?.((b) => b.key === 'notify'); } catch { /* ignore */ }
    this.saved = { x: g.rig.goal.x, z: g.rig.goal.z, wupp: g.rig.wuppGoal, yaw: g.rig.yawGoal, free: g.rig.freeBounds };
    this.buoy = new THREE.Vector3(LAKE.buoy.x, WATER_Y, LAKE.buoy.z);
    document.body.classList.add('lab-trans');
    window.addEventListener('keydown', this._onKey, true);
    window.addEventListener('keyup', this._onKeyUp, true);
    if (instant) { this.state = 'irisout'; this.t = 1; return true; }
    this.state = 'zoom';
    g.rig.freeBounds = true;
    g.rig.goal.set(this.buoy.x, 0, this.buoy.z);
    g.rig.wuppGoal = 0.014;
    g.audio?.play?.('whoosh', { volume: 0.4 });
    return true;
  }

  exit({ gasp = false } = {}) {
    if (!this.active || this.state !== 'dive') return;
    const g = this.game;
    this.gasp = gasp;
    if (!gasp && this.air > 0 && (!this.sys.questActive('dv_lesson1') || this.sys.stepDone('dv_lesson1', 2))) g.emit('diveSurface', { air: this.air });
    g.audio?.play?.(gasp ? 'dv_gulp' : 'bigsplash', { volume: 0.45, pitch: gasp ? 1 : 1.3 });
    this.bubbleBurst(10);
    this.state = 'leaving';
    this.t = 0;
    this.ui?.card(null);
  }

  finishExit() {
    const g = this.game;
    g.overrideScene = null;
    g.overrideRig = null;
    g.renderer.setIris(0, 0, -1);
    const s = this.saved;
    g.rig.freeBounds = s.free;
    g.rig.goal.set(LAKE.view.x, 0, LAKE.view.z);
    g.rig.clampGoal?.();
    g.rig.wuppGoal = 0.03;
    g.state.paused = this.wasPaused;
    g.inputLocked = false;
    g.audio?.setMusic?.(g.state.phase === 'rush' ? 'feast' : 'day');
    window.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('keyup', this._onKeyUp, true);
    this.removeInput();
    this.teardown();
    this.active = false;
    this.state = 'off';
    document.body.classList.remove('lab-mode', 'lab-trans', 'dive-mode');
    // a splash at the buoy as he climbs out
    try { g.particles?.splash?.(LAKE.buoy.x, LAKE.buoy.z, 14, 1); } catch { /* ignore */ }
    if (this.gasp) setTimeout(() => g.notify?.(pick(FOX_LINES.gasp), 'shocked'), 600);
    this.sys.onSurfaced?.();
    g.save?.();
  }

  // ------------------------------------------------------------------ build / tear down
  build() {
    const g = this.game, S = this.S;
    const G = this.gear();
    this.G = G;
    const restored = S.farms.some((f) => f.type === 'hatchery');
    const sc = (this.sc = buildDiveScene({ wreck: restored ? 'restored' : 'old' }));
    this.scene = sc.scene;
    this.life = new DiveLife(sc, { whiskers: this.sys.whiskersHere() });
    // Reynard in his gear
    this.diverG = new THREE.Group();
    this.fox = new FoxRig({ shadows: false });
    this.fox.setOutfit?.('default');
    this.fox.root.scale.setScalar(0.8);
    this.fox.root.position.set(0, -6 * VS * 0.8, 0);
    this.diverG.add(this.fox.root);
    this.scene.add(this.diverG);
    this.fox.play('idle', { loop: true, fade: 0 });
    this.addGear(G);
    const E = sc.anchors.entry;
    this.p = new THREE.Vector3(E.x, SURF - 0.2, E.z);
    this.v = new THREE.Vector3(0, -1.2, 0);
    this.facing = 1; this.yaw = PI / 2; this.pitch = 0.4; this.swim = 0;
    this.target = null;
    this.air = this.airMax = G.air;
    this.exhaleT = 0.5;
    this.atSurfT = 0;
    this.barkT = {};
    this.flags = { bed: false, deep: false, wreck: false, whiskers: false };
    // the farms
    this.farmVis = new Map();
    for (const f of S.farms) this.addFarmVis(f);
    // lesson props + Chief
    this.lesson = this.sys.lessonNow();
    this.items = [];
    this.setupLesson();
    // camera
    const r = g.renderer;
    const rig = this.rig;
    rig.pitch = rig.pitchGoal = 0.21;
    rig.yaw = rig.yawGoal = 0;
    rig.dist = 30;
    rig.minWupp = 0.001; rig.maxWupp = 1;
    rig.wupp = rig.wuppGoal = 19 / Math.max(1, r.lowW);
    this.camY = 2.7;
    rig.goal.set(this.camX(), this.camY, -0.8); rig.target.copy(rig.goal);
    this.buildTarget = null;
    S.dives = (S.dives || 0) + 1;
  }

  addGear(G) {
    const F = this.fox;
    const mk = (kind) => { const geo = diveGeo('gear_' + kind, () => gearModel(kind), { scale: FV }); const m = new THREE.Mesh(geo, uwMat(geo)); return m; };
    const head = F.head;
    this.gearMeshes = [];
    const helmet = G.deep;
    if (!helmet) {
      const mask = mk('mask'); mask.position.set(0, 6.9 * VS, 8.2 * VS); mask.scale.setScalar(1.1); head.add(mask);
      const sn = mk('snorkel'); sn.position.set(7.4 * VS, 4.0 * VS, 2.6 * VS); sn.rotation.set(0.15, 0, -0.1); head.add(sn);
      this.snorkelTip = new THREE.Object3D(); this.snorkelTip.position.set(0.5 * FV, 27 * FV, 0.5 * FV); sn.add(this.snorkelTip);
      this.gearMeshes.push(mask, sn);
    } else {
      const hm = mk('helmet'); hm.position.set(0, 6.4 * VS, 1.0 * VS); hm.scale.setScalar(1.22); head.add(hm);
      this.snorkelTip = new THREE.Object3D(); this.snorkelTip.position.set(0, 20 * FV, -6 * FV); hm.add(this.snorkelTip);
      this.gearMeshes.push(hm);
      if (this.S.gear.includes('tanks') || G === GEAR.tanks) { const tk = mk('tanks'); tk.position.set(0, -1 * VS, -6.4 * VS); F.chest.add(tk); this.gearMeshes.push(tk); }
    }
    this.helmetOn = helmet;
    if (G.speed > 1.2) for (const L of [F.legL, F.legR]) { const fl = mk('flipper'); fl.position.set(0, -3.1 * VS, 0.4 * VS); L.kn.add(fl); this.gearMeshes.push(fl); }
  }

  addFarmVis(f) {
    const d = FARMS[f.type];
    if (!d) return;
    const sc = this.sc;
    const grp = new THREE.Group();
    let x = f.x, z = f.z;
    if (d.fixed) { const b = sc.anchors.barge; x = b.x; z = b.z; }
    if (!d.fixed) {
      const geo = diveGeo('farm_' + f.type, () => farmModel(f.type), { scale: VS });
      const m = new THREE.Mesh(geo, uwMat(geo, { emissive: f.type === 'feeder' ? 0x110a00 : 0 }));
      grp.add(m);
      grp.position.set(x, sc.bedH(x, z) - 0.04, z);
    } else grp.position.set(x, sc.anchors.barge.y - 1.2, z);
    this.scene.add(grp);
    const vis = { f, grp, x, z, box: new THREE.Box3(), fish: null, sp: null, t: Math.random() * 10 };
    this.farmVis.set(f.id, vis);
    this.refreshFarmFish(vis);
  }
  refreshFarmFish(vis) {
    const f = vis.f, d = FARMS[f.type];
    if (d.kind !== 'pen') return;
    const sp = f.stock?.sp || null;
    if (vis.sp === sp && vis.fish) return;
    vis.fish?.dispose();
    vis.fish = null; vis.sp = sp;
    if (!sp) return;
    vis.fish = new FishPack(this.scene, sp, f.stock.n, { scale: 1 });
    vis.fishPh = Array.from({ length: f.stock.n }, (_, i) => ({ a: i / f.stock.n * PI * 2, r: 0.4 + (i % 3) * 0.22, y: 0.5 + (i % 4) * 0.35, sp: 0.35 + (i % 5) * 0.06, ph: i }));
  }
  removeFarmVis(id) {
    const vis = this.farmVis.get(id);
    if (!vis) return;
    vis.fish?.dispose();
    vis.grp.removeFromParent();
    this.farmVis.delete(id);
  }

  setupLesson() {
    const L = this.lesson, sc = this.sc;
    const S = this.S;
    if (L === 'lesson1' && !this.sys.stepDone('dv_lesson1', 2)) {
      const lg = sc.anchors.log;
      const geo = diveGeo('whistle_item', whistleModel, { scale: FV * 1.4 });
      const m = new THREE.Mesh(geo, uwMat(geo, { emissive: 0x2a2000 }));
      const x = lg.x + 1.0, z = lg.z + 0.9;
      m.position.set(x, sc.bedH(x, z) + 0.06, z);
      m.rotation.set(0.2, 0.6, 0.1);
      this.scene.add(m);
      // a glint so it can be found in the weeds
      const gl = new THREE.Sprite(spriteMat(SPARK_ROWS)); gl.scale.setScalar(0.16); gl.position.set(x, m.position.y + 0.22, z); this.scene.add(gl);
      this.items.push({ kind: 'whistle', mesh: m, glint: gl, x, y: m.position.y, z, r: 0.9 });
    }
    if (L === 'lesson2' && !(S.hoops || []).every(Boolean)) {
      const H = S.hoops ||= [false, false, false];
      [[-9.2, 0.0], [-2.6, -0.8], [3.8, 0.4]].forEach(([x, z], i) => {
        if (H[i]) return;
        const geo = diveGeo('hoop', hoopModel, { scale: VS });
        const m = new THREE.Mesh(geo, uwMat(geo));
        const by = sc.bedH(x, z);
        m.position.set(x, by, z);
        m.rotation.y = PI / 2 - 0.55;
        this.scene.add(m);
        this.items.push({ kind: 'hoop', i, mesh: m, x, y: by + 0.9, z, r: 0.62 });
      });
    }
    this.spawnLitter();
    // Chief swims along during his lessons
    this.setupChief(L);
  }

  /** lesson 2's litter: on the bottom once the hoops are done (or for free dives after the lesson) */
  spawnLitter() {
    const S = this.S, sc = this.sc, L = this.lesson;
    const hoopsDone = (S.hoops || []).length >= 3 && S.hoops.every(Boolean);
    if (!((L === 'lesson2' && hoopsDone) || this.sys.questDone('dv_lesson2'))) return;
    if (this.items.some((it) => it.kind === 'litter')) return;
    {
      const got = S.litter ||= [];
      [['can', -15.6, 1.4], ['boot', -5.2, 1.0], ['bottle', 6.9, 1.1], ['tire', -0.6, -3.0]].forEach(([kind, x, z]) => {
        if (got.includes(kind)) return;
        const geo = diveGeo('litter_' + kind, () => litterModel(kind), { scale: FV * 1.3 });
        const m = new THREE.Mesh(geo, uwMat(geo));
        m.position.set(x, sc.bedH(x, z) + 0.03, z);
        m.rotation.set(kind === 'boot' ? 0 : 0.1, x, kind === 'can' || kind === 'bottle' ? 0.25 : 0);
        this.scene.add(m);
        this.items.push({ kind: 'litter', id: kind, mesh: m, x, y: m.position.y, z, r: 0.85 });
      });
    }
  }

  setupChief(L) {
    if (L && L !== 'free') {
      try {
        this.chief = new ChiefBuff({ shadows: false });
        this.chief.root.scale.setScalar(0.85);
        this.chief.play('swim', { loop: true, fade: 0 });
        this.chiefG = new THREE.Group();
        this.chiefG.add(this.chief.root);
        this.chief.root.position.set(0, -0.3, 0);
        this.scene.add(this.chiefG);
        this.cp = new THREE.Vector3(this.p.x + 1.6, this.p.y - 0.4, this.p.z - 0.8);
        this.chiefTalkT = 2.5;
        this.chiefQueue = [...(CHIEF[L]?.start || [])];
      } catch (e) { console.warn('[dive] chief', e); this.chief = null; }
    }
  }

  teardown() {
    for (const vis of this.farmVis?.values() || []) vis.fish?.dispose();
    this.farmVis?.clear();
    try { this.life?.dispose(); } catch { /* ignore */ }
    try { this.fox?.dispose?.(); } catch { /* ignore */ }
    try { this.chief?.dispose?.(); } catch { /* ignore */ }
    try { this.sc?.dispose(); } catch { /* ignore */ }
    this.ui?.dispose();
    this.ui = null;
    this.sc = null; this.scene = null; this.life = null; this.fox = null; this.chief = null; this.items = [];
    this.game.ui?.bubbles?.clear?.((b) => String(b.key || '').startsWith('dive'));
  }

  // ------------------------------------------------------------------ UI + input
  mountUI() {
    const g = this.game;
    this.ui = new DiveUI({
      click: (a, ds) => {
        g.audio?.play?.('click', { volume: 0.35 });
        if (a === 'surface') this.exit();
        else if (a === 'kit') this.pickKit(ds.type);
        else if (a === 'cardx') this.closeCard();
        else this.cardAction(a, ds);
      },
    });
    this.ui.setGear(this.G);
    this.refreshKit();
    this.refreshLesson();
    document.body.classList.add('lab-mode', 'dive-mode');
    const cv = g.renderer?.domElement || document.querySelector('canvas');
    this.canvas = cv;
    cv?.addEventListener('pointerdown', this._onDown);
    cv?.addEventListener('pointermove', this._onMove);
    window.addEventListener('wheel', this._onWheel, { capture: true, passive: false });
  }
  removeInput() {
    this.canvas?.removeEventListener('pointerdown', this._onDown);
    this.canvas?.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('wheel', this._onWheel, { capture: true });
    if (this.canvas) this.canvas.style.cursor = '';
    this.canvas = null;
    this.keys.clear();
  }
  local(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  onKey(e, down) {
    if (!this.active) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (this.game.director?.active) return; // a scene owns the keys
    const k = e.key.toLowerCase();
    const mine = ['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'escape', ' ', 'shift', 'z', 'x', '+', '-', 'b', 'f', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    if (!mine.includes(k)) return;
    e.stopPropagation();
    if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
    if (!down) { this.keys.delete(k); return; }
    if (this.keys.has(k)) return;
    this.keys.add(k);
    if (this.state !== 'dive') return;
    if (k === 'escape') {
      if (this.buildType) { this.pickKit(null); return; }
      if (this.ui?.cardOpen) { this.closeCard(); return; }
      this.exit();
    }
    if (/^[1-6]$/.test(k)) { const it = this.kitItems?.[+k - 1]; if (it && !it.locked) this.pickKit(it.type); }
  }

  /** mouse wheel: zoom in / out a little (the lake stays framed) */
  onWheel(e) {
    if (!this.active || this.state !== 'dive' || e.target?.closest?.('.diveui .dv-card, .diveui .dv-kit')) return;
    e.preventDefault(); e.stopPropagation();
    const lw = Math.max(1, this.game.renderer.lowW);
    this.rig.wuppGoal = clamp(this.rig.wuppGoal * (e.deltaY > 0 ? 1.12 : 1 / 1.12), 11 / lw, 26 / lw);
  }

  ray(sx, sy) { return this.rig.screenRay(sx, sy, this.game.renderer, this._ray); }
  /** the first point where a screen ray meets the lake bed */
  bedHit(sx, sy) {
    const r = this.ray(sx, sy), o = r.origin, d = r.direction, sc = this.sc;
    // start where the ray drops under the surface, march down to the bed
    let t = Math.max(0, (SURF + 0.5 - o.y) / d.y);
    const p = _v;
    for (let i = 0; i < 900; i++, t += 0.06) {
      p.copy(o).addScaledVector(d, t);
      if (p.z < -14 || p.y < -6) return null;
      if (p.y <= sc.bedH(p.x, p.z)) return { x: p.x, y: p.y, z: p.z };
    }
    return null;
  }
  pickFarm(sx, sy) {
    const r = this.ray(sx, sy);
    let best = null, bd = Infinity;
    const hit = new THREE.Vector3();
    for (const vis of this.farmVis.values()) {
      vis.box.setFromObject(vis.grp).expandByScalar(0.1);
      if (r.intersectBox(vis.box, hit)) { const dd = hit.distanceTo(r.origin); if (dd < bd) { bd = dd; best = vis; } }
    }
    return best;
  }
  screenOf(x, y, z) { return this.rig.worldToScreen(_v.set(x, y, z), this.game.renderer); }

  onDown(e) {
    if (!this.active || this.state !== 'dive' || this.game.director?.active) return;
    const q = this.local(e);
    if (this.buildType) {
      if (e.button === 2) { this.pickKit(null); return; }
      const h = this.bedHit(q.x, q.y);
      if (h) this.placeBuild(h.x, h.z);
      return;
    }
    const vis = this.pickFarm(q.x, q.y);
    if (vis) { this.openCard(vis); this.swimTo(vis.x, vis.grp.position.y + 1.4, clamp(vis.z + 1.2, -4.6, 3)); return; }
    this.closeCard();
    // tap an item: swim right to it
    for (const it of this.items) {
      const s = this.screenOf(it.x, it.y + 0.2, it.z);
      if (hypot(s.x - q.x, s.y - q.y) < 36) { this.swimTo(it.x, it.y + 0.35, it.z); return; }
    }
    // swim to the tapped point (on the diver's own depth plane)
    const r = this.ray(q.x, q.y);
    const t = (this.p.z - r.origin.z) / r.direction.z;
    if (Number.isFinite(t)) { const p = r.origin.clone().addScaledVector(r.direction, t); this.swimTo(p.x, p.y, this.p.z); }
  }
  onMove(e) {
    if (!this.active || this.state !== 'dive') return;
    const q = this.local(e);
    if (this.buildType) {
      const h = this.bedHit(q.x, q.y);
      this.buildTarget = h ? { x: h.x, z: h.z } : null;
      return;
    }
    if (e.pointerType === 'touch') return;
    const vis = this.pickFarm(q.x, q.y);
    this.canvas.style.cursor = vis ? 'pointer' : '';
  }
  swimTo(x, y, z) { this.target = new THREE.Vector3(x, y, z); }

  // ------------------------------------------------------------------ build kit
  refreshKit() {
    const fa = this.sys.farms;
    const items = FARM_ORDER.filter((t) => fa.unlocked(t) || (FARMS[t].research && this.sys.sectionOpen())).map((type) => {
      const d = FARMS[type];
      const unlocked = fa.unlocked(type);
      const restored = d.fixed && fa.count(type) > 0;
      const short = { pen: 'Net Pen', nursery: 'Kelp', mussels: 'Mussels', feeder: 'Feeder', cage: 'Cage', hatchery: 'Barge' }[type];
      return { type, icon: d.icon, short, cost: d.cost, locked: !unlocked || restored || (d.fixed && !this.G.deep), tip: restored ? 'The barge is already a hatchery' : !unlocked ? `Research ${d.name} in the Lab` : d.fixed && !this.G.deep ? 'Needs the brass helmet (the Deep Hole)' : `${d.name}: ${d.desc}` };
    });
    this.kitItems = items.filter((x) => !x.locked || this.sys.farms.unlocked(x.type) || true);
    const any = items.some((x) => this.sys.farms.unlocked(x.type));
    this.ui?.setKit(any ? items : [], this.buildType);
  }
  pickKit(type) {
    const g = this.game;
    if (!type || this.buildType === type) { this.buildType = null; this.ghost?.removeFromParent(); this.ghost = null; this.refreshKit(); this.ui?.hint(null); return; }
    const d = FARMS[type];
    if (d.fixed) {
      // the hatchery is the barge itself: restore it in place
      if (!g.canAfford?.(d.cost)) { g.notify?.(`Restoring the barge costs ${d.cost} coins.`, 'no'); return; }
      const f = this.sys.farms.build(type, 0, 0, { scene: this.sc });
      if (f) { this.sys.onBuilt(f); this.ui.float('Hatchery restored!', innerWidth / 2, innerHeight * 0.4, '#ffe070'); this.rebuildBarge(); this.addFarmVis(f); this.refreshKit(); }
      return;
    }
    if (!g.canAfford?.(d.cost)) { g.notify?.(`${d.name} costs ${d.cost} coins.`, 'no'); g.audio?.play?.('error', { volume: 0.4 }); return; }
    this.buildType = type;
    this.closeCard();
    this.ghost?.removeFromParent();
    const geo = diveGeo('farm_' + type, () => farmModel(type), { scale: VS });
    this.ghost = new THREE.Group();
    this.ghost.add(new THREE.Mesh(geo, uwMat(geo, { emissive: 0x1a2a10 })));
    // a dashed pixel ring on the sand under it
    const ring = new THREE.Mesh(new THREE.RingGeometry(d.r * 0.96, d.r * 1.06, 24, 1), new THREE.MeshBasicMaterial({ color: 0x7ad04a, side: THREE.DoubleSide, fog: false }));
    ring.rotation.x = -PI / 2; ring.position.y = 0.04;
    this.ghost.add(ring);
    this.ghostRing = ring;
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.refreshKit();
    this.ui?.hint(`Tap the sand to place the <b>${esc(d.name)}</b> &middot; <kbd>Esc</kbd> cancel`);
    // swim over to the farm sands
    if (this.p.x > FARM_AREA.x1 || this.p.x < FARM_AREA.x0) this.swimTo(clamp(this.p.x, FARM_AREA.x0 + 1, FARM_AREA.x1 - 1), 2.6, 0);
  }
  placeBuild(x, z) {
    const f = this.sys.farms.build(this.buildType, x, z, { scene: this.sc });
    if (!f) return;
    this.addFarmVis(f);
    this.sys.onBuilt(f);
    const s = this.screenOf(x, this.sc.bedH(x, z) + 1.2, z);
    this.ui.float(`${FARMS[f.type].name}!`, s.x, s.y);
    this.life.bubble(x, this.sc.bedH(x, z) + 0.2, z, 12, 2);
    this.game.audio?.play?.('build', { volume: 0.5 });
    this.pickKit(null);
    this.chiefEvent('built');
  }
  rebuildBarge() {
    // swap the old wreck for the restored one (rebuild the whole scene is overkill: just re-skin it)
    const old = this.sc.root.children.find((o) => o.userData?.barge);
    if (!old) return;
    const geo = diveGeo('barge_r', () => farmModel('hatchery'), { scale: 0.12 });
    old.geometry = geo;
    old.material = uwMat(geo, { emissive: 0x221a08 });
    this.life.bubble(old.position.x, old.position.y + 1, old.position.z, 20, 2);
  }

  // ------------------------------------------------------------------ farm cards
  openCard(vis) {
    this.cardVis = vis;
    this.renderCard();
    this.game.audio?.play?.('paper', { volume: 0.3 });
  }
  closeCard() { this.cardVis = null; this.ui?.card(null); }
  renderCard() {
    const vis = this.cardVis;
    if (!vis || !this.ui) return;
    const fa = this.sys.farms, f = vis.f, d = FARMS[f.type];
    let body = `<h4>${ico(d.icon, 1)}${esc(d.name)}</h4>`;
    const meter = (k, n = 10) => `<div class="meter">${Array.from({ length: n }, (_, i) => `<i class="${i < Math.floor(k * n) ? 'on' : ''}"></i>`).join('')}</div>`;
    if (d.kind === 'pen') {
      if (!f.stock) {
        body += `<p>Empty. Stock it with ${d.cap} fingerlings:</p><div class="row">` + d.stock.map(([sp, p]) => {
          const price = p * d.cap, S = SPECIES_BY_ID[sp];
          const url = fishIconURL(sp, { scale: 1 });
          return `<button data-a="stock" data-sp="${sp}" ${this.game.state.coins < price ? 'disabled' : ''}>${url ? `<img class="fish" src="${url}" height="14">` : ''}${esc(S?.name || sp)} ${ico('dv_coin', 1)}${price}</button>`;
        }).join('') + '</div>';
      } else {
        const S = SPECIES_BY_ID[f.stock.sp], k = fa.progress(f), rate = fa.rate(f);
        if (fa.ready(f)) {
          body += `<p>${f.stock.n} grown ${esc(S?.name || '')}. Ready!</p><div class="row"><button class="act go" data-a="harvest" data-mode="pond">${ico('fish', 1)}To my pond</button><button class="act sell" data-a="harvest" data-mode="sell">${ico('dv_coin', 1)}Sell ${fa.harvestValue(f)}</button></div>`;
        } else {
          const left = Math.ceil((f.stock.need - f.stock.t) / rate);
          body += `<p>${f.stock.n} young ${esc(S?.name || '')} growing${rate > 1.01 ? ` (x${rate.toFixed(2)} speed)` : ''}.</p>${meter(k)}<p>About ${left < 200 ? `${left} s` : `${(left / 180).toFixed(1)} days`} of work time to go. They grow while you're up top.</p>`;
        }
      }
    } else if (d.kind === 'boost') {
      const n = [...this.farmVis.values()].filter((o) => FARMS[o.f.type].kind === 'pen' && hypot(o.f.x - f.x, o.f.z - f.z) <= d.radius).length;
      body += `<p>${esc(d.desc)}</p><p><b>${n}</b> pen${n === 1 ? '' : 's'} in range (+${Math.round(d.boost * 100)}% growth).</p>`;
    } else if (d.kind === 'pearl') {
      body += f.pearl ? `<p>${f.pearl} pearl${f.pearl > 1 ? 's' : ''} waiting!</p><div class="row"><button class="act sell" data-a="pearl">${ico('dv_pearl', 1)}Collect pearls</button></div>` : `<p>The mussels are working on a pearl.</p>${meter(f.pearlT / d.pearlT)}`;
    } else if (d.kind === 'eggs') {
      body += f.eggs ? `<p>${f.eggs} rare egg${f.eggs > 1 ? 's' : ''} in the racks!</p><div class="row"><button class="act go" data-a="egg">${ico('egg', 1)}Take an egg</button></div>` : `<p>Something rare is laying in the dark.</p>${meter(f.eggT / d.eggT)}`;
    }
    if (!d.fixed) body += `<div class="row"><button class="act rm" data-a="remove">Remove (+${Math.floor(d.cost / 2)})</button></div>`;
    // beside the farm (Chief's orders float above it)
    const s = this.screenOf(vis.x, vis.grp.position.y + 1.2, vis.z);
    const right = s.x < innerWidth - 330;
    this.ui.card(body, s.x + (right ? 175 : -175), s.y + 90);
  }
  cardAction(a, ds) {
    const vis = this.cardVis, fa = this.sys.farms;
    if (!vis) return;
    const f = vis.f;
    const s = this.screenOf(vis.x, vis.grp.position.y + 1.8, vis.z);
    if (a === 'stock') {
      if (fa.stock(f, ds.sp)) { this.refreshFarmFish(vis); this.ui.float(`+${f.stock.n} ${SPECIES_BY_ID[ds.sp]?.name || ''}`, s.x, s.y, '#bff0ff'); this.life.bubble(vis.x, vis.grp.position.y + 1.6, vis.z, 10, 1); this.chiefEvent('stocked'); }
    } else if (a === 'harvest') {
      const r = fa.harvest(f, ds.mode);
      if (r) { this.refreshFarmFish(vis); this.ui.float(r.coins ? `+${r.coins} coins` : `${r.sent} fish to the pond!`, s.x, s.y, r.coins ? '#ffe070' : '#bff0ff'); if (r.sent && r.coins) setTimeout(() => this.ui?.float(`${r.sent} to the pond`, s.x, s.y + 24, '#bff0ff'), 400); this.life.bubble(vis.x, vis.grp.position.y + 1.4, vis.z, 14, 2); }
    } else if (a === 'pearl') {
      const c = fa.collectPearl(f);
      if (c) this.ui.float(`Pearl! +${c} coins`, s.x, s.y, '#fff6ff');
    } else if (a === 'egg') {
      const r = fa.collectEgg(f);
      if (r) this.ui.float(`${SPECIES_BY_ID[r.sp]?.name || 'Rare'} egg!`, s.x, s.y, '#ffe070');
    } else if (a === 'remove') {
      fa.remove(f);
      this.removeFarmVis(f.id);
      this.closeCard();
      this.refreshKit();
      return;
    }
    this.renderCard();
  }

  // ------------------------------------------------------------------ lessons
  refreshLesson() {
    const L = this.sys.lessonCard();
    this.ui?.setLesson(L);
  }
  chiefSay(text, mood = 'shout') {
    if (!this.chief || !text) return;
    this.chiefSaid = this.game.say({ getWorldPos: (v) => v.set(this.cp.x, this.cp.y + 0.7, this.cp.z) }, text, { voice: 'duck', mood, size: 'm', key: 'divechief', dur: Math.min(5.5, 2 + text.length * 0.05) });
    this.chiefTalkT = Math.min(6, 2.4 + text.length * 0.05);
  }
  chiefEvent(ev, i = 0) {
    const L = this.lesson;
    const C = CHIEF[L === 'lesson1' ? 'lesson1' : L === 'lesson2' ? 'lesson2' : L === 'farm' ? 'farm' : L === 'helmet' ? 'helmet' : ''];
    if (!C || !this.chief) return;
    const lines = C[ev];
    if (!lines) return;
    if (ev === 'hoop' || ev === 'litter') this.chiefQueue = [lines[Math.min(i, lines.length - 1)]];
    else this.chiefQueue = [...lines];
    this.chiefTalkT = 0.2;
  }
  foxSay(text, mood = 'happy') {
    if (!text || !this.fox) return;
    this.fox.talk?.(text);
    this.game.say({ getWorldPos: (v) => v.set(this.p.x, this.p.y + 0.9, this.p.z) }, text, { voice: 'fox', mood, size: 's', key: 'divefox', dur: Math.min(4.5, 1.6 + text.length * 0.05) });
  }
  bark(key, lines, cool = 8) {
    const now = this.t;
    if ((this.barkT[key] || -99) + cool > now) return;
    this.barkT[key] = now;
    this.foxSay(pick(lines));
  }

  // ------------------------------------------------------------------ per frame
  camX() { return clamp(this.p ? this.p.x : 0, X0 + 9.6, X1 - 9.6); }

  update(dt) {
    if (!this.active) return;
    const g = this.game, r = g.renderer;
    this.t += dt;
    const R = Math.hypot(window.innerWidth, window.innerHeight);
    if (this.state === 'zoom') {
      const k = Math.min(1, this.t / 0.9);
      const p = g.rig.worldToScreen(_v.copy(this.buoy), r);
      if (this.t > 0.35 && !this._splashed) { this._splashed = true; g.particles?.bigSplash?.(this.buoy.x, this.buoy.z); g.audio?.play?.('bigsplash', { volume: 0.45 }); }
      r.setIris(p.x, p.y, R * (1 - k * k) + 1);
      if (k >= 1) { this.state = 'irisout'; this.t = 1; }
      return;
    }
    if (this.state === 'irisout') {
      this._splashed = false;
      try { this.build(); } catch (e) { console.error('[dive] build failed', e); this.teardown(); this.active = false; this.state = 'off'; g.overrideScene = null; g.overrideRig = null; g.state.paused = this.wasPaused; g.inputLocked = false; r.setIris(0, 0, -1); document.body.classList.remove('lab-trans'); return; }
      g.overrideScene = this.scene;
      g.overrideRig = this.rig;
      this.mountUI();
      g.audio?.setMusic?.('night');
      g.audio?.play?.('dv_plunge', { volume: 0.55 });
      this.bubbleBurst(18);
      this.state = 'irisin';
      this.t = 0;
      g.emit('diveEnter', { gear: this.G.name });
      setTimeout(() => { if (this.state === 'dive' && !this.chief && Math.random() < 0.7) this.foxSay(pick(FOX_LINES.enter)); }, 1600);
    }
    if (this.state === 'irisin') {
      const k = Math.min(1, this.t / 0.7);
      r.setIris(window.innerWidth / 2, window.innerHeight / 2, R * k * k);
      if (k >= 1) {
        r.setIris(0, 0, -1); this.state = 'dive'; document.body.classList.remove('lab-trans');
        if ((this.S.dives || 0) <= 2 || this.lesson === 'lesson1') { this.ui?.hint('Swim: <kbd>WASD</kbd> or tap &middot; <kbd>Q</kbd><kbd>E</kbd> nearer / further &middot; hold <kbd>W</kbd> at the top to climb out'); setTimeout(() => { if (!this.buildType) this.ui?.hint(null); }, 7000); }
      }
    }
    if (this.state === 'leaving') {
      const k = Math.min(1, this.t / 0.75);
      r.setIris(window.innerWidth / 2, window.innerHeight * 0.3, R * (1 - k) * (1 - k) + 1);
      this.p.y += dt * 2.5;
      if (k >= 1) { this.finishExit(); return; }
    }
    if (!this.sc) return;
    const scene = g.director?.active ? 0 : 1;
    if (this.state === 'dive' && scene) this.steer(dt);
    this.animateDiver(dt);
    this.updateChief(dt);
    this.updateItems(dt);
    this.updateFarms(dt);
    this.sc.update(dt, this.t, this.p);
    this.life.update(dt, this.t, this.p);
    // air
    if (this.state === 'dive' && scene) {
      this.air -= dt;
      if (this.air < this.airMax * 0.3) this.bark('lowAir', FOX_LINES.lowAir, 9);
      if (this.air <= 0) { this.air = 0; this.exit({ gasp: true }); }
    }
    this.ui?.setAir(this.air / this.airMax);
    this.ui?.setDepth(Math.max(0, (SURF - this.p.y) * 1.6));
    // the camera follows (x, a little y), the surface band stays in shot unless he's deep
    const rig = this.rig;
    this.camY = lerp(this.camY, clamp(this.p.y + 0.9, -1.4, 2.8), Math.min(1, dt * 1.5));
    rig.goal.set(this.camX(), this.camY, -0.8 + clamp(this.p.z, -2, 2) * 0.15);
    rig.update(dt, r);
    if (this.cardVis) this.renderCardPos();
    this._lessonT = (this._lessonT || 0) - dt;
    if (this._lessonT <= 0) { this._lessonT = 1; this.refreshLesson(); }
  }
  renderCardPos() {
    this._cardT = (this._cardT || 0) + 1;
    if (this._cardT % 20 === 0) this.renderCard();
  }

  steer(dt) {
    const K = this.keys, G = this.G, sc = this.sc;
    let ix = 0, iy = 0, iz = 0;
    if (K.has('a') || K.has('arrowleft')) ix -= 1;
    if (K.has('d') || K.has('arrowright')) ix += 1;
    if (K.has('w') || K.has('arrowup')) iy += 1;
    if (K.has('s') || K.has('arrowdown')) iy -= 1;
    if (K.has('q')) iz -= 1;
    if (K.has('e')) iz += 1;
    const sp = 2.0 * G.speed * (K.has('shift') ? 1.35 : 1);
    const want = new THREE.Vector3();
    if (ix || iy || iz) { want.set(ix, iy, iz).normalize().multiplyScalar(sp); this.target = null; }
    else if (this.target) {
      const d = _v.subVectors(this.target, this.p), dl = d.length();
      if (dl < 0.08) this.target = null;
      else want.copy(d).multiplyScalar(sp * Math.min(1, dl / 0.8) / dl);
    }
    this.v.lerp(want, Math.min(1, dt * 2.6));
    this.p.addScaledVector(this.v, dt);
    // bounds: the bed, the surface, the scene, rocks
    const bed = sc.bedH(this.p.x, this.p.z);
    this.p.x = clamp(this.p.x, X0 + 1.5, X1 - 1.5);
    this.p.z = clamp(this.p.z, -2.2, 3.2);
    if (this.p.z < -0.3 && this.p.y > SURF - 1.0) this.p.z += (-0.3 - this.p.z) * Math.min(1, dt * 4); // never up behind the surface band
    if (this.p.y < bed + 0.45) { this.p.y = bed + 0.45; this.v.y = Math.max(0, this.v.y); }
    for (const o of sc.obstacles) {
      const dx = this.p.x - o.x, dz = this.p.z - o.z, d = Math.hypot(dx, dz);
      if (d < o.r * 0.8 && this.p.y < bed + o.r * 1.3) { const k = (o.r * 0.8 - d) / Math.max(0.01, d); this.p.x += dx * k * 0.5; this.p.z += dz * k * 0.5; this.p.y += dt * 1.2; }
    }
    if (this.p.y > SURF - 0.32) {
      this.p.y = SURF - 0.32;
      this.v.y = Math.min(0, this.v.y);
      if (iy > 0) { this.atSurfT += dt; if (this.atSurfT > 0.9) { this.atSurfT = 0; this.exit(); return; } }
      else if (this.v.length() > 0.2 && this.target && this.target.y > SURF - 0.4) this.bark('surf', FOX_LINES.surfaceHint, 14);
    } else this.atSurfT = 0;
    // the Deep Hole needs the helmet
    if (!G.deep && this.p.x > DEEP_X - 1.2) { this.p.x = DEEP_X - 1.2; this.v.x = Math.min(0, this.v.x); this.target = null; this.bark('deep', FOX_LINES.deep, 7); }
    // milestones
    const g = this.game;
    if (!this.flags.bed && this.p.y < bed + 0.62) { this.flags.bed = true; g.emit('diveBed', {}); this.chiefEvent('bed'); }
    if (!this.flags.deep && G.deep && this.p.x > DEEP_X + 1 && this.p.y < 0.4) { this.flags.deep = true; g.emit('diveDeep', {}); this.chiefEvent('deep'); }
    const B = sc.anchors.barge;
    if (!this.flags.wreck && hypot(this.p.x - B.x, this.p.y - B.y) < 3.6) { this.flags.wreck = true; this.S.seenWreck = true; g.emit('diveWreck', {}); this.chiefEvent('wreck'); if (!this.chief) this.bark('wreck', FOX_LINES.wreck, 30); }
    if (!this.flags.whiskers && this.life.whiskersNear(this.p)) { this.flags.whiskers = true; this.S.seenWhiskers = true; g.emit('diveWhiskers', {}); this.bark('whiskers', FOX_LINES.whiskers, 30); }
  }

  animateDiver(dt) {
    const F = this.fox;
    if (!F) return;
    const spd = this.v.length();
    this.swim = lerp(this.swim, clamp(spd / 1.6, 0, 1), Math.min(1, dt * 4));
    if (abs(this.v.x) > 0.15) this.facing = this.v.x > 0 ? 1 : -1;
    const wantYaw = this.facing > 0 ? PI / 2 - 0.42 * (1 - this.swim * 0.6) : -PI / 2 + 0.42 * (1 - this.swim * 0.6);
    this.yaw += angTo(this.yaw, wantYaw) * Math.min(1, dt * 5);
    const vyK = clamp(this.v.y / 2, -1, 1);
    const wantPitch = lerp(0.18, 1.2, this.swim) - vyK * 0.55 * this.swim;
    this.pitch = lerp(this.pitch, wantPitch, Math.min(1, dt * 4));
    const bob = sin(this.t * 1.8) * 0.05 * (1 - this.swim);
    this.diverG.position.set(this.p.x, this.p.y + bob, this.p.z);
    this.diverG.rotation.set(this.pitch, this.yaw, sin(this.t * 2.4) * 0.05, 'YXZ');
    F.update(dt);
    // the swim pose on top of the idle (legs kick, arms paddle or tuck, head looks ahead, tail sculls)
    const t = this.t, fl = this.G.speed > 1.2;
    const kf = fl ? 7.5 : 10, amp = lerp(0.25, fl ? 0.55 : 0.45, this.swim);
    const set = (grp, x, y, z, o = 'XYZ') => { _e.set(x, y, z, o); grp.quaternion.setFromEuler(_e); };
    set(F.legL.th, sin(t * kf) * amp + 0.15, 0, 0.12); set(F.legR.th, sin(t * kf + PI) * amp + 0.15, 0, -0.12);
    set(F.legL.kn, 0.25 + Math.max(0, sin(t * kf + 0.9)) * 0.55, 0, 0); set(F.legR.kn, 0.25 + Math.max(0, sin(t * kf + PI + 0.9)) * 0.55, 0, 0);
    if (fl && this.swim > 0.4) {
      // streamlined: arms back along the body
      set(F.armL.sh, 0.35, 0, 0.25); set(F.armR.sh, 0.35, 0, -0.25);
      set(F.armL.el, -0.2, 0, 0); set(F.armR.el, -0.2, 0, 0);
    } else {
      // doggy paddle / sculling
      const a = t * (fl ? 3 : 8);
      set(F.armL.sh, -1.3 + sin(a) * 0.7 * (0.4 + this.swim), 0, 0.35 + cos(a) * 0.2); set(F.armR.sh, -1.3 + sin(a + PI) * 0.7 * (0.4 + this.swim), 0, -0.35 - cos(a + PI) * 0.2);
      set(F.armL.el, -0.6 - Math.max(0, cos(a)) * 0.6, 0, 0); set(F.armR.el, -0.6 - Math.max(0, cos(a + PI)) * 0.6, 0, 0);
    }
    set(F.head, -this.pitch * 0.85 + 0.1, 0, 0);
    F.tail.forEach((s, i) => set(s, 0.25 - this.pitch * 0.2, sin(t * 4 - i * 0.9) * (0.25 + this.swim * 0.25), 0, 'YXZ'));
    // the hat stays on with the snorkel (of course); the helmet replaces hat, ears and monocle
    if (this.helmetOn) { F.hat.visible = false; F.earL.visible = F.earR.visible = false; }
    F.monocle.visible = false; F.chainGroup.visible = false; // the mask / porthole goes where the monocle was
    // exhale: bubbles from the snorkel / helmet valve
    this.exhaleT -= dt;
    if (this.exhaleT <= 0 && this.life) {
      this.exhaleT = 1.4 + Math.random() * 1.4;
      this.diverG.updateMatrixWorld(true);
      const p = this.snorkelTip ? this.snorkelTip.getWorldPosition(_v) : _v.copy(this.p);
      this.life.bubble(p.x, p.y, p.z, 2 + Math.floor(Math.random() * 3), 1);
      if (Math.random() < 0.45) this.game.audio?.play?.('dv_bubbles', { volume: 0.18, pitch: 0.9 + Math.random() * 0.4 });
    }
    if (spd > 1.2 && Math.random() < dt * 3) this.life?.bubble(this.p.x - this.facing * 0.5, this.p.y - 0.2, this.p.z, 1, 0);
  }
  bubbleBurst(n) { if (this.life && this.p) this.life.bubble(this.p.x, this.p.y, this.p.z, n, 2); }

  updateChief(dt) {
    const C = this.chief;
    if (!C) return;
    // swims along a little behind and above, faces the way he's going
    const side = -this.facing;
    const want = _v.set(this.p.x + side * 1.5, Math.min(SURF - 0.5, this.p.y + 0.5), clamp(this.p.z - 0.9, -4.6, 2.6));
    const prev = this.cp.clone();
    this.cp.lerp(want, Math.min(1, dt * 1.4));
    const vx = this.cp.x - prev.x;
    const yaw = abs(vx) > 0.002 ? (vx > 0 ? PI / 2 : -PI / 2) : (this.p.x > this.cp.x ? PI / 2 - 0.5 : -PI / 2 + 0.5);
    this.chiefYaw = (this.chiefYaw ?? yaw) + angTo(this.chiefYaw ?? yaw, yaw) * Math.min(1, dt * 4);
    this.chiefG.position.copy(this.cp);
    this.chiefG.position.y += sin(this.t * 2) * 0.06;
    this.chiefG.rotation.set(0, this.chiefYaw, 0);
    C.update(dt);
    // his orders, one at a time
    this.chiefTalkT -= dt;
    if (this.chiefTalkT <= 0 && this.state === 'dive') {
      if (this.chiefQueue?.length) this.chiefSay(this.chiefQueue.shift());
      else { this.chiefTalkT = 16 + Math.random() * 10; if (Math.random() < 0.5) this.chiefSay(pick(CHIEF.idle), 'normal'); }
    }
    if (Math.random() < dt * 0.5) this.life?.bubble(this.cp.x, this.cp.y + 0.5, this.cp.z, 1, 0);
  }

  updateItems(dt) {
    const g = this.game;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.mesh.rotation.y += it.kind === 'whistle' ? dt * 1.5 : 0;
      if (it.glint) { const k = (Math.sin(this.t * 5) + 1) / 2; it.glint.visible = k > 0.25; it.glint.scale.setScalar(0.1 + k * 0.1); }
      if (it.kind === 'whistle' && Math.random() < dt * 2) this.life?.bubble(it.x, it.y + 0.1, it.z, 1, 0);
      if (it.kind === 'hoop') {
        // swum through: the hoop's centre within reach and he crossed its x
        const near = hypot(this.p.y - it.y, (this.p.z - it.z) * 0.8) < it.r;
        const side = Math.sign(this.p.x - it.x);
        if (it.side && side !== it.side && near && this.state === 'dive') {
          this.items.splice(i, 1);
          const H = this.S.hoops; H[it.i] = true;
          const n = H.filter(Boolean).length;
          g.emit('diveHoop', { i: it.i });
          g.audio?.play?.('star_pop', { volume: 0.5 });
          this.life?.bubble(it.x, it.y, it.z, 16, 2);
          const s = this.screenOf(it.x, it.y + 1, it.z);
          this.ui?.float(`HOOP ${n}/3!`, s.x, s.y, '#ffe070');
          it.mesh.removeFromParent();
          this.chiefEvent('hoop', n - 1);
          if (n >= 3) { this.spawnLitter(); setTimeout(() => this.chiefEvent('litterGo'), 2600); }
          continue;
        }
        it.side = near || !it.side ? side : it.side;
        it.mesh.position.y = this.sc.bedH(it.x, it.z) + sin(this.t * 1.2 + it.i) * 0.05;
        continue;
      }
      if (hypot(this.p.x - it.x, this.p.y - it.y, (this.p.z - it.z) * 0.7) < it.r && this.state === 'dive') {
        this.items.splice(i, 1);
        it.mesh.removeFromParent();
        it.glint?.removeFromParent();
        const s = this.screenOf(it.x, it.y + 0.6, it.z);
        this.life?.bubble(it.x, it.y + 0.2, it.z, 10, 1);
        g.audio?.play?.('grab', { volume: 0.5 });
        if (it.kind === 'whistle') {
          this.ui?.float('Chief\'s whistle!', s.x, s.y, '#ffe070');
          g.emit('diveFind', { kind: 'whistle' });
          this.chiefEvent('find');
        } else if (it.kind === 'litter') {
          (this.S.litter ||= []).push(it.id);
          this.ui?.float({ can: 'Old can', boot: 'A soggy boot', bottle: 'A bottle', tire: 'A tire!' }[it.id] || 'Litter', s.x, s.y, '#d8f0c8');
          g.emit('diveLitter', { kind: it.id });
          g.earnMisc?.(3, 'tips');
          const n = this.S.litter.length;
          if (this.chief) this.chiefEvent('litter', n - 1); else this.bark('litter', FOX_LINES.litter, 6);
          if (n >= 3) this.chiefEvent('done');
        }
        setTimeout(() => this.refreshLesson(), 300);
      }
    }
  }

  updateFarms(dt) {
    const tags = [];
    const fa = this.sys.farms;
    for (const vis of this.farmVis.values()) {
      vis.t += dt;
      const f = vis.f, d = FARMS[f.type];
      // pen fish circle inside, growing with the stock
      if (vis.fish && f.stock) {
        const k = 0.35 + fa.progress(f) * 0.65;
        vis.fish.scale = k;
        const by = vis.grp.position.y;
        vis.fishPh.forEach((q, i) => {
          if (i >= f.stock.n) return;
          q.a += dt * q.sp * (1.2 - k * 0.5);
          const R = q.r * (d.r / 1.3) * 0.85;
          const x = vis.x + cos(q.a) * R, z = vis.z + sin(q.a) * R * 0.8, y = by + q.y * (d.r / 1.3) + sin(vis.t * 1.3 + i) * 0.06;
          vis.fish.set(i, x, y, z, q.a + PI / 2, 0, vis.t * 8 + i, 0.03);
        });
        vis.fish.flush();
      }
      if (f.type === 'feeder' && Math.random() < dt * 1.2) this.life?.bubble(vis.x + 0.4, vis.grp.position.y + 1.8, vis.z, 1, 1);
      if (f.type === 'mussels' && f.pearl && Math.random() < dt * 1.5) this.life?.bubble(vis.x, vis.grp.position.y + 0.4, vis.z, 1, 0);
      // status tag
      const ty = vis.grp.position.y + (d.fixed ? 3.4 : d.kind === 'pen' ? 2.5 : 2.0);
      const s = this.screenOf(vis.x, ty, vis.z);
      const vis2 = s.visible && s.x > -40 && s.x < innerWidth + 40 && s.y > 40 && s.y < innerHeight;
      const vis3 = vis2 && this.cardVis !== vis;
      if (d.kind === 'pen') tags.push({ id: f.id, x: s.x, y: s.y, visible: vis3 && !!f.stock, k: fa.progress(f), ready: fa.ready(f), label: 'READY!' });
      else if (d.kind === 'pearl') tags.push({ id: f.id, x: s.x, y: s.y, visible: vis3 && f.pearl > 0, ready: true, gold: true, label: `PEARL x${f.pearl}` });
      else if (d.kind === 'eggs') tags.push({ id: f.id, x: s.x, y: s.y, visible: vis3, k: f.eggs ? null : f.eggT / d.eggT, ready: f.eggs > 0, gold: true, label: `EGG x${f.eggs}` });
    }
    this.ui?.setTags(tags);
    // the build ghost
    if (this.ghost) {
      const T = this.buildTarget;
      this.ghost.visible = !!T;
      if (T) {
        const ok = !this.sys.farms.canPlace(this.buildType, T.x, T.z, this.sc);
        this.ghost.position.set(T.x, this.sc.bedH(T.x, T.z), T.z);
        this.ghostRing.material.color.setHex(ok ? 0x7ad04a : 0xe0403a);
        this.ghost.children[0].visible = Math.floor(this.t * 4) % 2 === 0 || ok;
      }
    }
  }
}
