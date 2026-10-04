// [v20 npc homes] Visiting the neighbours at home. Every villager gets a house
// in the world (a new cottage, their landmark, Pip's mill or Chip's tree house)
// with a mailbox + a bobbing door marker; tapping the door (or "Visit home" on
// their card) zooms in, iris-wipes into a cosy cut-away interior diorama
// (src/entities/homes/*.js) where the neighbour potters about. Reynard walks in
// with you and follows taps; props light up on hover and do things when tapped
// (the neighbour reacts, a few give a small reward once a day). The game is
// paused while inside; Back / Esc leaves. One interior alive at a time, all of
// its GPU resources are freed on exit.
import * as THREE from 'three';
import { CameraRig } from '../core/cameraRig.js';
import { HomeKit } from '../entities/homes/homeKit.js';
import { HOME_BUILDERS } from '../entities/homes/index.js';
import { makeHomeHouse, makeMailbox, makeDoorMarker } from '../entities/homes/homeExteriors.js';
import { LANDMARKS } from '../world/worldgen.js';

const mods = import.meta.glob(['../entities/critters3d.js', '../entities/foxRig.js'], { eager: true });
const C3 = mods['../entities/critters3d.js'] || {};
const FoxMod = mods['../entities/foxRig.js'] || null;

const pick = (a) => (Array.isArray(a) ? a[Math.floor(Math.random() * a.length)] : a);
const hasAnim = (r, n) => { const A = r?.anims; return !!A && (Array.isArray(A) ? A.includes(n) : !!A[n]); };
const firstAnim = (r, list) => (Array.isArray(list) ? list : [list]).find((n) => n && hasAnim(r, n)) || null;
const hasExpr = (r, n) => { const E = r?.expressions; return !!E && (Array.isArray(E) ? E.includes(n) : !!E[n]); };

// where the door is on each landmark home (offset from the footprint's front centre, tiles)
const LANDMARK_DOOR = { firetower: [-0.25, 0.15], lumberhut: [-0.2, 0.2], willowshrine: [0, 0.1], mushhut: [0, 0.1], swampshack: [-0.6, 0.15] };
// where the new cottages go (offset from the villager's spot, tiles)
const HOUSE_AT = { clover: [-1.9, -2.0, 0.15], otis: [-2.0, -1.6, 0.2], hazel: [-1.3, -2.2, 0.05] };
const MAIL = { hoot: [0x869034, 0x6a7a3a], shellby: [0x3c88d8, 0x5a7a5a], dale: [0xf2c83c, 0x3e9e52], granny: [0xa092e0, 0x5a9a4a], rocco: [0xffd23f, 0x4a4068], clover: [0xf08a1a, 0x6cc04a], otis: [0xffd23f, 0x3c88d8], hazel: [0xe04a64, 0xf0c8a0], chip: [0xc8402a, 0xd8b07a], pip: [0xc8402a, 0xb8783a] };

const FOX_LINES = {
  enter: ['Wipe your paws, partner.', 'Ooh, cosy. What does a place like this rent for?', "Don't touch anything. Unless it's shiny."],
  wander: ['Nice place. Needs more gold.', 'I could sell tickets to this.', 'Hm. No fish anywhere. Tragic.'],
};

export class HomeMode {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.state = 'off';
    this.doors = new Map(); // id -> { pos, house, marker, mail }
    this.rig = new CameraRig();
    this.rig.freeBounds = true;
    this.t = 0;
    this.v = null;
    this.ui = null;
    this._ray = new THREE.Ray();
    this._v = new THREE.Vector3();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  get ready() { return !!HOME_BUILDERS; }

  // ------------------------------------------------------------ outside: houses + doors
  /** Villagers.makeProps hook: add the house (if they had none), a mailbox and the door marker. */
  addExterior(v, g, put) {
    try {
      const game = this.game;
      let door = null, house = null;
      const off = HOUSE_AT[v.id];
      if (off) {
        house = makeHomeHouse(v.id);
        if (house) {
          put(house, off[0], off[1], off[2]);
          house.updateMatrixWorld(true);
          door = house.localToWorld(house.userData.door.clone());
        }
      }
      if (!door) {
        // Pip's mill / Chip's tree house carry their own door point
        house = g.children.find((c) => c.userData?.door) || null;
        if (house) { house.updateMatrixWorld(true); door = house.localToWorld(house.userData.door.clone()); }
      }
      if (!door && v.zone.landmark) {
        const L = LANDMARKS.find((l) => l.id === v.zone.landmark);
        if (L) {
          const o = LANDMARK_DOOR[L.id] || [0, 0.1];
          const x = L.x + L.w / 2 + o[0], z = L.z + L.d + o[1];
          door = new THREE.Vector3(x, game.grid.groundAt(x, z), z);
        }
      }
      if (!door) return;
      const col = MAIL[v.id] || [0xd8403a, 0x4a8ad0];
      const mail = makeMailbox(col[0], col[1]);
      put(mail, door.x - v.x + 0.62, door.z - v.z + 0.12, -0.3);
      const marker = makeDoorMarker();
      marker.position.set(door.x, door.y + 1.6, door.z);
      g.add(marker);
      this.doors.set(v.id, { pos: door.clone(), house, marker, mail, y0: door.y + 1.6 });
    } catch (e) { console.warn('home exterior', v.id, e); }
  }

  /** world tap on a door / mailbox -> visit. Returns true when it took the tap. */
  tapDoor(sx, sy) {
    if (this.active) return false;
    const game = this.game;
    let best = null, bd = 34 * 34;
    for (const [id, d] of this.doors) {
      const v = game.villagers?.get(id);
      if (!v?.rig?.root.visible || !game.zones?.isOpen(v.zone.id)) continue;
      for (const y of [0.35, 0.8]) {
        const p = game.rig.worldToScreen(this._v.set(d.pos.x, d.pos.y + y, d.pos.z), game.renderer);
        const dd = (p.x - sx) ** 2 + (p.y - sy) ** 2;
        if (dd < bd) { bd = dd; best = id; }
      }
    }
    if (!best) return false;
    this.enter(best);
    return true;
  }

  /** why a visit can't start right now (null = ok) */
  blocked(v) {
    const g = this.game;
    if (this.active || !v) return 'busy';
    if (g.lab?.active || g.classroom?.active || g.bedtime?.active || g.cutscene?.active || g.cine?.active || g.tutorial?.active || g.npcScenes?.busy || g.titleMode) return 'busy';
    if (g.inputLocked || g.zones?.busy || g.pipVisit?.view || g.workshop?.view) return 'busy';
    const be = g.bearEvents;
    if (be?.boss?.active || be?.moon?.siege) return 'danger';
    const ph = g.state.phase;
    if (ph !== 'day' && ph !== 'morning') return 'closed';
    if (!g.zones?.isOpen(v.zone.id)) return 'busy';
    return null;
  }

  // ------------------------------------------------------------ flow
  enter(id) {
    const game = this.game;
    const v = game.villagers?.get(id);
    if (!v) return false;
    const why = this.blocked(v);
    if (why) {
      if (why === 'closed') game.ui?.toast?.(`${v.name.split(' ').pop()} is asleep. Visit in the daytime!`);
      else if (why === 'danger') game.ui?.toast?.('Not now. Bears!');
      return false;
    }
    // first meeting: their welcome scene comes first
    if (!game.villagers.vstate(v).met) { game.villagers.open(v); return false; }
    const builder = HOME_BUILDERS[id];
    if (!builder) return false;
    game.villagers.card?.close?.();
    this.v = v;
    this.active = true;
    this.state = 'zoom';
    this.t = 0;
    this.wasPaused = game.state.paused;
    game.state.paused = true;
    game.inputLocked = true;
    game.ui?.closePanel?.();
    game.setTool?.({ kind: 'feed' });
    const d = this.doors.get(id);
    this.doorPos = d ? d.pos.clone() : new THREE.Vector3(v.x, v.y, v.z);
    this.saved = { x: game.rig.goal.x, z: game.rig.goal.z, wupp: game.rig.wuppGoal, yaw: game.rig.yawGoal };
    game.rig.goal.set(this.doorPos.x, 0.5, this.doorPos.z);
    game.rig.freeBounds = true;
    game.rig.wuppGoal = 0.012;
    game.audio.play('whoosh', { volume: 0.45 });
    document.body.classList.add('lab-trans');
    // no corner-fox bubbles or quest toasts over the room
    try { game.ui?.bubbles?.clear?.((b) => b.key === 'notify'); } catch { /* ignore */ }
    this.houseDoor = d?.house?.userData?.parts?.door || null;
    return true;
  }

  exit() {
    if (!this.active || this.state === 'leaving' || this.state === 'zoom') return;
    this.game.audio.play('iris', { volume: 0.4 });
    const L = this.spec?.bye;
    if (L) this.npcSay(pick(L));
    this.state = 'leaving';
    this.t = 0;
  }

  // ------------------------------------------------------------ build / tear down the interior
  build() {
    const game = this.game, v = this.v;
    const k = (this.kit = new HomeKit());
    const ctxInfo = { game, v, day: game.state.day | 0, night: game.sky?.state?.night > 0.4 };
    this.spec = HOME_BUILDERS[v.id](k, ctxInfo) || {};
    k.finish(this.spec.light || {});
    const sc = (this.scene = new THREE.Scene());
    sc.background = new THREE.Color(this.spec.bg ?? 0x1e1a24);
    sc.add(k.group);
    // the neighbour (public rig API only: new Cls(), root, play(), update())
    const Cls = C3[v.cast.cls];
    try { this.npc = Cls ? new Cls() : null; } catch (e) { console.warn('home npc rig', e); this.npc = null; }
    const ns = this.spec.npc || { x: 0.8, z: -0.4, rot: 0.3 };
    if (this.npc) {
      this.npc.root.position.set(ns.x, ns.y || 0, ns.z);
      this.npc.root.rotation.y = ns.rot ?? 0.3;
      this.npc.root.scale.setScalar(this.spec.npcScale ?? 0.94);
      sc.add(this.npc.root);
      this.npcHome = { x: ns.x, z: ns.z, rot: ns.rot ?? 0.3 };
      this.npcIdle();
      this.npcProp = { id: 'npc', obj: this.npc.root, label: v.name, tap: { talk: true }, box: new THREE.Box3(), npc: true };
    }
    // Reynard comes in with you
    if (FoxMod?.FoxRig) {
      try {
        this.fox = new FoxMod.FoxRig({ shadows: false });
        const fs = this.spec.fox || { x: -1.6, z: 1.2 };
        this.fox.root.position.set(fs.x, 0, fs.z + 0.6);
        this.fox.root.scale.setScalar(0.8);
        this.fox.root.rotation.y = Math.PI;
        sc.add(this.fox.root);
        this.foxGoal = new THREE.Vector3(fs.x, 0, fs.z);
        this.fox.play('walk', { loop: true, fade: 0 });
      } catch (e) { console.warn('home fox', e); this.fox = null; }
    }
    this.npcT = 4 + Math.random() * 3;
    this.foxIdleT = 9;
    // camera: the whole diorama
    const view = k.view;
    const r = game.renderer;
    const wupp = Math.max(view.fit.w / Math.max(1, r.lowW), view.fit.h / Math.max(1, r.lowH));
    const rig = this.rig;
    rig.goal.copy(view.target); rig.target.copy(view.target);
    rig.wuppGoal = rig.wupp = wupp;
    rig.yawGoal = rig.yaw = view.yaw || 0;
    rig.pitchGoal = rig.pitch = view.pitch;
    rig.minWupp = 0.001; rig.maxWupp = 1;
    this.baseWupp = wupp;
  }

  teardown() {
    try { this.npc?.dispose?.(); } catch (e) { console.warn(e); }
    try { this.fox?.dispose?.(); } catch (e) { console.warn(e); }
    this.kit?.dispose();
    this.kit = null; this.npc = null; this.fox = null; this.scene = null; this.spec = null; this.npcProp = null;
    this.hover = null; this.pending = null; this.foxLook = null;
    clearTimeout(this._npcTO);
  }

  enterInterior() {
    const game = this.game;
    this.build();
    game.overrideScene = this.scene;
    game.overrideRig = this.rig;
    game.audio.setMusic(this.spec.music || 'morning');
    game.audio.play('gate', { volume: 0.35 });
    this.buildUI();
    if (this.houseDoor) this.houseDoor.rotation.y = 0;
    setTimeout(() => {
      if (!this.active || this.state === 'leaving') return;
      const st = game.villagers.vstate(this.v);
      const greet = this.spec.greet ? pick(this.spec.greet) : 'Come in, come in!';
      this.npcReact(['wave', 'happy'], greet);
      if (Math.random() < 0.6) setTimeout(() => { if (this.active && this.state === 'inside') this.foxSay(pick(FOX_LINES.enter)); }, 2200);
      st.homeVisits = (st.homeVisits || 0) + 1;
    }, 650);
  }

  finishExit() {
    const game = this.game;
    game.overrideScene = null;
    game.overrideRig = null;
    game.renderer.setIris(0, 0, -1);
    const s = this.saved;
    game.rig.freeBounds = false;
    game.rig.goal.set(s.x, 0, s.z);
    game.rig.clampGoal?.();
    game.rig.wuppGoal = s.wupp;
    game.rig.yawGoal = s.yaw;
    game.state.paused = this.wasPaused;
    game.inputLocked = false;
    game.audio.setMusic(game.state.phase === 'rush' ? 'feast' : 'day');
    this.removeUI();
    this.teardown();
    this.active = false;
    this.state = 'off';
    this.v = null;
    document.body.classList.remove('lab-mode', 'lab-trans', 'home-mode');
    game.save?.();
  }

  // ------------------------------------------------------------ UI overlay
  buildUI() {
    const game = this.game, v = this.v;
    const root = document.getElementById('ui') || document.body;
    injectCSS();
    const el = document.createElement('div');
    el.className = 'labui homeui';
    el.innerHTML = `
      <div class="lab-top" data-h="top"><span data-h="back"></span><div class="home-name">${esc(this.spec.title || v.zone.name)}</div></div>
      <div class="lab-opts" data-h="opts">
        <button class="lab-ico" data-a="talk" title="Talk">${game.ui?.icon?.('speech', 3) || 'Talk'}</button>
      </div>
      <div class="home-tip hidden" data-h="tip"></div>`;
    root.appendChild(el);
    this.ui = el;
    const back = game.ui?.arrowButton?.('left') || Object.assign(document.createElement('button'), { textContent: '<', className: 'btn small' });
    back.dataset.a = 'exit';
    el.querySelector('[data-h="back"]')?.replaceWith(back);
    document.body.classList.add('lab-mode', 'home-mode');
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      game.audio.play('click', { volume: 0.35 });
      if (a === 'exit') this.exit();
      else if (a === 'talk') this.openTalk();
    });
    const cv = game.renderer?.domElement || document.querySelector('canvas');
    this.canvas = cv;
    this._onMove = (e) => this.onMove(e);
    cv?.addEventListener('pointermove', this._onMove);
  }

  removeUI() {
    this.canvas?.removeEventListener('pointermove', this._onMove);
    this._onMove = null;
    if (this.canvas) this.canvas.style.cursor = '';
    this.ui?.remove();
    this.ui = null;
  }

  tip(text, x, y) {
    const t = this.ui?.querySelector('[data-h="tip"]');
    if (!t) return;
    if (!text) { t.classList.add('hidden'); return; }
    t.textContent = text;
    t.style.left = `${x}px`; t.style.top = `${y}px`;
    t.classList.remove('hidden');
  }

  floatText(text, worldPos, color = '#fff3a0') {
    if (!this.ui) return;
    const p = this.rig.worldToScreen(worldPos, this.game.renderer);
    const d = document.createElement('div');
    d.className = 'home-float';
    d.textContent = text;
    d.style.left = `${p.x}px`; d.style.top = `${p.y}px`; d.style.color = color;
    this.ui.appendChild(d);
    setTimeout(() => d.remove(), 1700);
  }

  // ------------------------------------------------------------ input
  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  pickAt(sx, sy) {
    if (!this.kit) return null;
    const ray = this.rig.screenRay(sx, sy, this.game.renderer, this._ray);
    let best = null, bd = Infinity;
    const hit = new THREE.Vector3();
    const list = this.npcProp ? [this.npcProp, ...this.kit.props] : this.kit.props;
    if (this.npcProp) { this.npcProp.box.setFromObject(this.npc.root).expandByScalar(0.04); }
    for (const p of list) {
      if (p.obj.visible === false) continue;
      if (ray.intersectBox(p.box, hit)) {
        const d = hit.distanceTo(ray.origin) - (p.npc ? 0.6 : 0); // the neighbour wins ties with what's behind them
        if (d < bd) { bd = d; best = p; }
      }
    }
    return best;
  }

  onMove(e) {
    if (!this.active || this.state !== 'inside' || e.pointerType === 'touch') return;
    const q = this.local(e);
    const p = this.pickAt(q.x, q.y);
    if (p !== this.hover) {
      if (this.hover && !this.hover.npc) this.kit.highlight(this.hover, false);
      this.hover = p;
      if (p && !p.npc) { this.kit.highlight(p, true); this.game.audio.play('tick', { volume: 0.12 }); }
    }
    this.canvas.style.cursor = p ? 'pointer' : '';
    this.tip(p ? p.label : null, q.x + 14, q.y - 30);
  }

  /** Input.js hook: every canvas press while visiting comes here */
  onDown(e) {
    if (!this.active) return false;
    if (this.state !== 'inside') return true;
    const q = this.local(e);
    const p = this.pickAt(q.x, q.y);
    if (p) { this.use(p); return true; }
    // tap the floor: Reynard strolls there
    const ray = this.rig.screenRay(q.x, q.y, this.game.renderer, this._ray);
    const hit = ray.intersectPlane(this._plane, this._v);
    if (hit && this.fox) this.walkTo(hit.x, hit.z);
    return true;
  }

  walkTo(x, z, then = null) {
    const b = this.kit.bounds;
    this.foxGoal = new THREE.Vector3(Math.max(b.x0, Math.min(b.x1, x)), 0, Math.max(b.z0, Math.min(b.z1, z)));
    this.pending = then ? { fn: then, t: 0 } : null;
  }

  use(p) {
    const game = this.game;
    if (p.tap?.talk) { this.openTalk(); return; }
    // flash the highlight on touch screens
    if (!p.npc && this.hover !== p) { this.kit.highlight(p, true); setTimeout(() => { if (this.kit && this.hover !== p) this.kit.highlight(p, false); }, 350); }
    game.audio.play('click', { volume: 0.25 });
    const box = p.box;
    const c = box.getCenter(new THREE.Vector3());
    const st = p.stand ? { x: p.stand[0], z: p.stand[1] } : { x: c.x + (c.x > 0 ? -0.35 : 0.35), z: Math.min(this.kit.bounds.z1, box.max.z + 0.3) };
    // the prop reacts at once; Reynard strolls over to have a look
    if (this.fox) this.walkTo(st.x, st.z);
    this.act(p);
    this.lookAtPoint = c;
  }

  // ------------------------------------------------------------ prop actions
  ctx(p) {
    const self = this, k = this.kit, game = this.game;
    const top = p ? new THREE.Vector3((p.box.min.x + p.box.max.x) / 2, p.box.max.y, (p.box.min.z + p.box.max.z) / 2) : new THREE.Vector3();
    return {
      game, kit: k, prop: p, obj: p?.obj, parts: p?.obj?.userData?.parts || {}, top, v: this.v, npc: this.npc, fox: this.fox,
      say: (t, o) => self.npcSay(t, o), foxSay: (t, e) => self.foxSay(t, e),
      anim: (list, expr) => self.npcReact(list, null, expr),
      foxAnim: (n) => self.foxReact(n),
      sfx: (n, vol = 0.4, o = {}) => game.audio.play(n, { volume: vol, ...o }),
      fx: (kind, n, o) => k.fx(kind, top, n, o),
      fxAt: (kind, pos, n, o) => k.fx(kind, pos, n, o),
      tween: (d, fn, done) => k.tween(d, fn, done),
      later: (s, fn) => setTimeout(() => { if (self.active && self.kit === k) fn(); }, s * 1000),
      reward: (r, line) => self.reward(p, r, line),
      once: () => self.claimable(p),
      friend: () => game.villagers.vstate(self.v).friend || 0,
    };
  }

  act(p) {
    if (!this.active || this.state !== 'inside' || !this.kit) return;
    const T = p.tap || {};
    const c = this.ctx(p);
    this.foxFace(c.top);
    let custom = false;
    try { custom = T.effect ? T.effect(c) === true : false; } catch (e) { console.warn('home prop', p.id, e); }
    if (custom) return; // the effect handled lines + reward itself
    if (T.sfx) c.sfx(...[].concat(T.sfx));
    if (T.fx) c.fx(T.fx, T.fxN || 5);
    const gave = T.reward ? this.reward(p, T.reward, T.rewardLine) : false;
    if (!gave) this.npcReact(T.anim || ['talk'], T.lines ? pick(T.lines) : null, T.expr);
    else this.npcReact(T.anim || ['happy'], null, T.expr);
    if (T.fox && Math.random() < 0.5) setTimeout(() => { if (this.active && this.state === 'inside') this.foxSay(pick(T.fox)); }, 1900);
  }

  claimable(p) {
    const st = this.game.villagers.vstate(this.v);
    const H = (st.home ||= {});
    return H[p.id] !== (this.game.state.day | 0);
  }

  /** once-a-day reward for a prop: { coins, wood, food: { id, n }, item, friend }. Returns true when paid out. */
  reward(p, r, line) {
    const game = this.game, v = this.v;
    if (!r || !this.claimable(p)) return false;
    const st = game.villagers.vstate(v);
    st.home[p.id] = game.state.day | 0;
    const out = [];
    if (r.coins) { game.earnMisc?.(r.coins, 'gifts'); out.push(`+${r.coins} coins`); game.audio.play('coins', { volume: 0.45 }); }
    if (r.wood) { game.state.wood = (game.state.wood || 0) + r.wood; game.emit?.('wood', game.state.wood); out.push(`+${r.wood} wood`); }
    if (r.food) { try { game.foodStore?.add?.(r.food.id, r.food.n || 1); } catch { /* ignore */ } out.push(`+${r.food.n || 1} ${game.foodStore?.info?.(r.food.id)?.name || r.food.id}`); }
    if (r.item) { const inv = (game.state.inventory ||= {}); const it = pick(r.item); inv[it] = (inv[it] || 0) + 1; game.emit?.('inventory', inv); out.push('+1 ' + (r.itemName || it)); }
    if (r.friend) { const n = game.villagers.talk.addFriend(v, r.friend); if (n > 0) { out.push('+friendship'); game.audio.play('heart', { volume: 0.4 }); } }
    const c = this.ctx(p);
    this.kit.fx(r.coins ? 'coins' : r.friend && !r.food && !r.wood ? 'hearts' : 'sparks', c.top, 6);
    if (out.length) this.floatText(out.join('  '), c.top.clone().setY(c.top.y + 0.2));
    if (line) this.npcSay(pick(line));
    game.save?.();
    return true;
  }

  // ------------------------------------------------------------ characters
  npcIdle() {
    const r = this.npc;
    if (!r) return;
    const n = firstAnim(r, this.spec?.idle || []) || (hasAnim(r, 'idle') ? 'idle' : null);
    if (n) r.play(n, { loop: true });
  }

  npcReact(list, line = null, expr = null) {
    const r = this.npc;
    if (r) {
      const n = firstAnim(r, list) || firstAnim(r, ['talk', 'happy', 'wave']);
      if (n) { try { r.play(n, { loop: false, restart: true, onDone: () => this.npcIdle() }); } catch (e) { console.warn(e); } }
      if (expr && hasExpr(r, expr)) r.setExpression?.(expr, { hold: 2.5 });
      this.npcBusyT = 3.5;
      // safety: some anims loop forever; settle back after a while
      clearTimeout(this._npcTO);
      this._npcTO = setTimeout(() => { if (this.npc === r && this.npc.current === n && this.state === 'inside') this.npcIdle(); }, 4200);
    }
    if (line) this.npcSay(line);
  }

  npcAnchor() {
    const r = this.npc, s = this.spec?.npcScale ?? 0.94;
    const h = (this.v?.cast?.height || 1.5) * s * 0.78;
    return { getWorldPos: (p) => (r ? p.set(r.root.position.x, r.root.position.y + h, r.root.position.z) : p.set(0, 1.4, 0)) };
  }

  npcSay(text, o = {}) {
    if (!text || !this.v) return null;
    return this.game.say(this.npcAnchor(), text, { voice: this.v.cast.voice || 'fox', mood: 'happy', size: 'm', key: 'home' + this.v.id, dur: Math.min(5, 1.8 + text.length * 0.05), ...o });
  }

  foxAnchor() {
    return { getWorldPos: (v) => { if (this.fox?.headTop) { this.fox.headTop(v); v.y -= 0.05; } else v.set(0, 1.4, 0); return v; } };
  }

  foxSay(text, expr = null) {
    if (!text || !this.fox) return null;
    this.fox.talk?.(text);
    if (expr) this.fox.setExpression?.(expr, { hold: 2.2 });
    return this.game.say(this.foxAnchor(), text, { voice: 'fox', key: 'homefox', size: 's', dur: Math.min(4.5, 1.6 + text.length * 0.05) });
  }

  foxReact(name) {
    if (!this.fox) return;
    try { this.fox.play(name, { loop: false, onDone: () => this.fox?.play('idle', { loop: true }) }); } catch { /* ignore */ }
  }

  foxFace(p) {
    if (!this.fox || !p) return;
    this.foxLook = p.clone();
  }

  openTalk() {
    const game = this.game, v = this.v;
    if (!v || this.state !== 'inside') return;
    this.npcReact(['wave', 'talk'], null);
    // the regular chat card (topics, friendship, gift) on top of the room
    try { game.villagers.open(v); } catch (e) { console.warn('home talk', e); }
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    // door markers bob outside (cheap: only those near the camera are shown)
    if (!this.active) { this.updateMarkers(dt); return; }
    const game = this.game, r = game.renderer;
    this.t += dt;
    const R = Math.hypot(window.innerWidth, window.innerHeight);
    if (this.state === 'zoom') {
      const k = Math.min(1, this.t / 0.9);
      if (this.houseDoor) this.houseDoor.rotation.y = -Math.min(1, k * 1.6) * 1.6;
      const p = game.rig.worldToScreen(this._v.set(this.doorPos.x, this.doorPos.y + 0.5, this.doorPos.z), r);
      r.setIris(p.x, p.y, R * (1 - k * k) + 1);
      if (k >= 1) {
        try { this.enterInterior(); } catch (e) { console.warn('home build failed', e); this.state = 'leaving'; this.t = 1; this.finishExit(); return; }
        this.t = 0; this.state = 'irisin';
      }
      return;
    }
    if (this.state === 'irisin') {
      const k = Math.min(1, this.t / 0.7);
      r.setIris(window.innerWidth / 2, window.innerHeight / 2, R * k * k);
      if (k >= 1) { r.setIris(0, 0, -1); this.state = 'inside'; document.body.classList.remove('lab-trans'); }
    }
    if (this.state === 'leaving') {
      const k = Math.min(1, this.t / 0.8);
      r.setIris(window.innerWidth / 2, window.innerHeight / 2, R * (1 - k) * (1 - k) + 1);
      if (k >= 1) { this.finishExit(); return; }
    }
    if (!this.kit) return;
    this.kit.update(dt);
    this.spec?.update?.(dt, this.kit.time, this);
    // the neighbour potters about: a special now and then, faces whoever is talking
    if (this.npc) {
      this.npcBusyT = Math.max(0, (this.npcBusyT || 0) - dt);
      this.npcT -= dt;
      if (this.npcT <= 0 && this.npcBusyT <= 0 && this.state === 'inside') {
        this.npcT = 7 + Math.random() * 6;
        const sp = (this.spec.specials || this.v.cast.specials || []).filter((n) => hasAnim(this.npc, n));
        if (sp.length) {
          const n = pick(sp);
          this.npc.play(n, { loop: false, onDone: () => this.npcIdle() });
          clearTimeout(this._npcTO);
          this._npcTO = setTimeout(() => { if (this.npc?.current === n && this.state === 'inside') this.npcIdle(); }, 5000);
        }
        if (Math.random() < 0.3 && this.spec.chatter) this.npcSay(pick(this.spec.chatter));
      }
      const nr = this.npc.root, h = this.npcHome;
      let yaw = h.rot;
      if (this.npcBusyT > 0 && this.fox) yaw = Math.atan2(this.fox.root.position.x - nr.position.x, this.fox.root.position.z - nr.position.z);
      let d = yaw - nr.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      nr.rotation.y += d * Math.min(1, dt * 4);
      this.npc.update(dt);
    }
    // Reynard walks to taps, then turns to what he's looking at
    if (this.fox && this.foxGoal) {
      const fr = this.fox.root;
      const dx = this.foxGoal.x - fr.position.x, dz = this.foxGoal.z - fr.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.05) {
        const sp = 1.5 * dt;
        fr.position.x += (dx / dist) * Math.min(sp, dist);
        fr.position.z += (dz / dist) * Math.min(sp, dist);
        this.turnFox(Math.atan2(dx, dz), dt * 10);
        if (this.fox.current !== 'walk') this.fox.play('walk', { loop: true, fade: 0.15 });
        if (this.pending) { this.pending.t += dt; if (this.pending.t > 1.8) { const f = this.pending.fn; this.pending = null; f(); } }
      } else {
        if (this.fox.current === 'walk') this.fox.play('idle', { loop: true, fade: 0.2 });
        if (this.pending) { const f = this.pending.fn; this.pending = null; f(); }
        const L = this.foxLook || (this.npc ? this.npc.root.position : null);
        if (L) this.turnFox(Math.atan2(L.x - fr.position.x, L.z - fr.position.z), dt * 6);
      }
      this.foxIdleT -= dt;
      if (this.foxIdleT <= 0) { this.foxIdleT = 14 + Math.random() * 8; if (Math.random() < 0.35 && !this.pending) this.foxSay(pick(FOX_LINES.wander)); }
      this.fox.update(dt);
    }
    // gentle camera drift following Reynard a little
    if (this.fox && this.kit.view) {
      const t = this.kit.view.target;
      this.rig.goal.set(t.x + this.fox.root.position.x * 0.08, t.y, t.z);
    }
    this.rig.update(dt, r);
  }

  turnFox(yaw, k) {
    const fr = this.fox.root;
    let d = yaw - fr.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    fr.rotation.y += d * Math.min(1, k);
  }

  updateMarkers(dt) {
    if (!this.doors.size) return;
    this.mT = (this.mT || 0) + dt;
    const game = this.game;
    const tx = game.rig.target.x, tz = game.rig.target.z;
    this.flagT = (this.flagT || 0) - dt;
    const flagCheck = this.flagT <= 0;
    if (flagCheck) this.flagT = 0.5;
    const show = !game.overrideScene && !game.cine?.active && game.rig.wupp < 0.05 && (game.state.phase === 'day' || game.state.phase === 'morning');
    for (const [id, d] of this.doors) {
      if (!d.marker) continue;
      const near = show && Math.hypot(d.pos.x - tx, d.pos.z - tz) < 9;
      d.marker.visible = near;
      if (near) d.marker.position.y = d.y0 + Math.sin(this.mT * 3 + id.length) * 0.08;
      // the mailbox flag is up while today's treats still wait inside
      if (d.mail?.userData.flag && flagCheck) {
        const v = game.villagers?.get(id);
        const H = v ? game.villagers.vstate(v).home || {} : {};
        const any = Object.values(H).some((x) => x === (game.state.day | 0));
        d.mail.userData.flag.rotation.z = any ? -1.3 : 0;
      }
    }
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

let cssDone = false;
function injectCSS() {
  if (cssDone) return;
  cssDone = true;
  const s = document.createElement('style');
  s.textContent = `
.homeui .lab-top { display: flex; gap: 12px; align-items: center; transform: none; left: 12px; }
body.home-mode .qn { display: none !important; }
.homeui .home-name { font-family: var(--font-title, "TBME Title"), monospace; font-size: 22px; color: #fff3d8; text-shadow: 2px 2px 0 #1a1420, -1px -1px 0 #1a1420; pointer-events: none; letter-spacing: 1px; }
.homeui .home-tip { position: absolute; padding: 3px 8px; background: #fffbea; border: 3px solid #1a1420; box-shadow: 0 3px 0 #1a1420; font-family: var(--font-title, "TBME Title"), monospace; font-size: 15px; color: #1a1420; pointer-events: none; white-space: nowrap; transform: translate(0, -100%); }
.homeui .home-tip.hidden { display: none; }
.homeui .home-float { position: absolute; transform: translate(-50%, -50%); font-family: var(--font-title, "TBME Title"), monospace; font-size: 20px; font-weight: bold; text-shadow: 2px 2px 0 #1a1420, -2px -2px 0 #1a1420, 2px -2px 0 #1a1420, -2px 2px 0 #1a1420; pointer-events: none; animation: home-float 1.7s ease-out forwards; white-space: nowrap; }
@keyframes home-float { 0% { opacity: 0; margin-top: 10px; } 15% { opacity: 1; } 75% { opacity: 1; } 100% { opacity: 0; margin-top: -50px; } }
`;
  document.head.appendChild(s);
}
