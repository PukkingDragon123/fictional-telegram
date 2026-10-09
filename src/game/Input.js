// Pointer / touch / keyboard input: pan, pinch-zoom, rotate, taps that feed
// fish or use the active tool, drag-to-build lines, hover previews.
import * as THREE from 'three';
import { STRUCTURES } from '../data/structures.js';
import { HUT } from '../world/worldgen.js';
import { BuildMove } from './BuildMove.js'; // [v19 buildings]

const TAP_DIST = 8;

export class Input {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas;
    this.pointers = new Map();
    this.keys = new Set();
    this.drag = null; // {mode: 'pan'|'line', ...}
    this.pinch = null;
    this.hover = null;
    this.lastHoverTile = null;
    game.buildMove = new BuildMove(game); // [v19 buildings] tap card, hold-to-move, tree-by-tree destroy
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e, true));
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.keys.clear());
  }

  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ray-march to find the tile under the cursor, accounting for tall objects
  pickTile(sx, sy) {
    const game = this.game;
    const ray = game.rig.screenRay(sx, sy, game.renderer);
    const g = game.grid;
    const o = ray.origin, d = ray.direction;
    // start where ray is at y = 7, march down to y = -1.2
    let t = (7 - o.y) / d.y;
    const tEnd = (-1.2 - o.y) / d.y;
    const step = 0.08 / Math.max(0.2, -d.y);
    const p = new THREE.Vector3();
    for (; t < tEnd; t += step) {
      p.copy(o).addScaledVector(d, t);
      const tx = Math.floor(p.x), tz = Math.floor(p.z);
      if (!g.inb(tx, tz)) continue;
      const top = this.tileTop(tx, tz);
      if (p.y <= top) return { x: tx, z: tz, wx: p.x, wz: p.z, y: p.y };
    }
    const q = game.rig.screenToGround(sx, sy, game.renderer, 0);
    return { x: Math.floor(q.x), z: Math.floor(q.z), wx: q.x, wz: q.z, y: 0 };
  }

  tileTop(x, z) {
    const g = this.game.grid;
    const i = z * g.w + x;
    let h = g.height[i];
    if (g.kind[i] === 3) h = -0.1;
    if (g.occ[i] === -2) return 2.6;
    const s = g.structAt(x, z);
    if (s) {
      const tall = { willow: 2.6, maple: 3.2, lodge: 0.9, fence: 1.2, platform: 0.7, feeder: 1.5, bughotel: 1, lantern: 1.1, beehive: 1.1, dam: 0.3, gate: 0.9, chair: 0.8, picnic: 0.5, flag: 2.3 };
      h = Math.max(h, (tall[s.type] ?? 0.2) + (g.kind[i] === 3 && s.type !== 'platform' ? -0.1 : 0));
      if (s.type === 'platform') h = 0.7;
    }
    return h;
  }

  worldPoint(sx, sy, y = -0.1) {
    return this.game.rig.screenToGround(sx, sy, this.game.renderer, y);
  }

  tool() { return this.game.tool; }
  // [v26 resort] the system a live brush stroke belongs to (the Path tool, or Terraform)
  stroker(d) { return d?.stroker || this.game.terraform; }
  isLineTool() {
    const t = this.tool();
    return t.kind === 'dig' || t.kind === 'clear' || t.kind === 'build' || t.kind === 'remove' || t.kind === 'terraform' || t.kind === 'path'; // [v26 resort] path tool
  }

  onDown(e) {
    this.game.audio.unlock();
    if (this.game.homes?.active) { this.game.ui?.advanceBubble?.(); this.game.homes.onDown(e); return; } // [v20 npc homes] taps go to the room
    // in the fox room / cutscenes there's no camera to drag: any press advances the bubble
    if ((this.game.lab?.active || this.game.inputLocked) && this.game.ui?.advanceBubble?.()) return;
    if (this.game.lab?.active) { const q = this.local(e); this.game.lab.onCanvasClick(q.x, q.y); return; }
    if (this.game.inputLocked) { this.game.cine?.onTap?.(); return; }
    if (this.game.feast?.active) { this.feastDown(e); return; } // [v26 feast] free camera, no tools
    this.canvas.setPointerCapture?.(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now(), button: e.button, type: e.pointerType });
    const bm = this.game.buildMove; // [v19 buildings]
    if (this.pointers.size === 2) {
      bm.pressCancel(); if (bm.moving?.held) bm.cancelMove(); // [v19 buildings]
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      if (this.drag?.terra) this.stroker(this.drag)?.strokeEnd(true); // [v26 resort] stroker: terraform or paths
      this.drag = null;
      this.game.ghostLine = null;
      return;
    }
    // [v19 buildings] moving a build (from its card): right-click cancels, a tap drops it, a drag pans
    if (bm.moving && !bm.moving.held) { if (e.button === 2) { bm.cancelMove(); return; } this.drag = { mode: 'maybe', x: p.x, y: p.y }; return; }
    if (e.button === 1 || e.button === 2) { this.drag = { mode: 'pan', x: p.x, y: p.y }; return; }
    // a talking bubble is waiting: a tap advances it, a drag still moves the camera
    if (this.game.ui?.bubbleWaiting?.()) { this.drag = { mode: 'maybe', x: p.x, y: p.y, bubble: true }; return; }
    // [v19 buildings] press & hold a build (any tool) to pick it up
    if (e.button === 0 && this.tool().kind !== 'terraform' && this.tool().kind !== 'path') { // [v26 resort] painting paths never lifts builds
      const ht = this.pickTile(p.x, p.y);
      const hs = this.game.grid.inb(ht.x, ht.z) ? this.game.structures.structureAtTile(ht.x, ht.z) : null;
      if (hs) bm.pressStart(hs, p.x, p.y, e.pointerId);
    }
    const tk = this.tool().kind;
    if (tk === 'hand' || tk === 'nurture') {
      const f = this.game.ui?.pickFish(p.x, p.y, 34);
      if (f) {
        if (tk === 'hand') this.grabFish(f, p);
        else { this.drag = { mode: 'pet', fish: f, x: p.x, y: p.y }; this.game.nurtureFish(f); }
        return;
      }
    }
    if (this.isLineTool()) {
      const t = this.pickTile(p.x, p.y);
      const tk2 = this.tool();
      // builds (except walls like dams/fences) and clearing paint along the drag path
      const paint = (tk2.kind === 'build' && !STRUCTURES[tk2.type]?.drag) || tk2.kind === 'remove' || tk2.kind === 'terraform' || tk2.kind === 'path'; // [v26 resort]
      // the Destroy tool selects a whole box of trees / rocks / weeds
      const rect = tk2.kind === 'clear';
      this.drag = { mode: 'line', start: t, end: t, moved: false, paint, rect, path: [t], seen: new Set([t.x + ',' + t.z]) };
      // Terraform: the brush works live along the drag path
      if (tk2.kind === 'terraform') { this.drag.terra = true; this.game.terraform?.strokeStart(t); }
      if (tk2.kind === 'path' && this.game.paths) { this.drag.terra = true; this.drag.stroker = this.game.paths; this.game.paths.strokeStart(t); } // [v26 resort] paths paint live along the drag
      this.updateLine();
    } else {
      this.drag = { mode: 'maybe', x: p.x, y: p.y };
    }
  }

  // [v26 feast] the feast's free camera: drag pans, pinch zooms + twists, a tap goes to game.feast.onTap
  feastDown(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now(), button: e.button, type: e.pointerType });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, ang: Math.atan2(b.y - a.y, b.x - a.x), twist: 0 };
      this.drag = null;
      return;
    }
    this.drag = { mode: e.button === 1 || e.button === 2 ? 'pan' : 'maybe', x: p.x, y: p.y };
  }

  onMove(e) {
    const p = this.local(e);
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) { if (e.pointerType === 'mouse') this.onHover(p.x, p.y); return; }
    const dx = p.x - ptr.x, dy = p.y - ptr.y;
    ptr.x = p.x; ptr.y = p.y;
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (this.pinch.d > 0) this.game.rig.zoom(this.pinch.d / d);
      this.game.rig.panPixels(mx - this.pinch.mx, my - this.pinch.my, this.game.renderer);
      if (this.pinch.ang != null) { // [v26 feast] a two-finger twist turns the view (45-degree steps)
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        this.pinch.twist += Math.atan2(Math.sin(ang - this.pinch.ang), Math.cos(ang - this.pinch.ang));
        this.pinch.ang = ang;
        if (Math.abs(this.pinch.twist) > 0.5) { this.game.rig.rotate(this.pinch.twist > 0 ? 1 : -1); this.pinch.twist = 0; }
      }
      this.game.rig.userCamT = performance.now();
      this.pinch.d = d; this.pinch.mx = mx; this.pinch.my = my;
      return;
    }
    const bm = this.game.buildMove; // [v19 buildings]
    if (bm.hold && Math.hypot(p.x - ptr.sx, p.y - ptr.sy) > TAP_DIST) bm.pressCancel();
    if (this.drag?.mode === 'move') { bm.aim(p.x, p.y); return; }
    if (!this.drag) return;
    if (this.drag.mode === 'grab') { this.moveGrab(p); return; }
    if (this.drag.mode === 'pet') { this.drag.x = p.x; this.drag.y = p.y; return; }
    if (this.drag.mode === 'maybe' && Math.hypot(p.x - ptr.sx, p.y - ptr.sy) > TAP_DIST) this.drag.mode = 'pan';
    if (this.drag.mode === 'pan') {
      this.game.rig.panPixels(dx, dy, this.game.renderer);
      this.game.rig.userCamT = performance.now();
    } else if (this.drag.mode === 'line') {
      const t = this.pickTile(p.x, p.y);
      if (Math.hypot(p.x - ptr.sx, p.y - ptr.sy) > TAP_DIST) this.drag.moved = true;
      const d = this.drag;
      if (d.paint) {
        // walk tile by tile from the last painted tile so fast drags leave no gaps
        let last = d.path[d.path.length - 1];
        let guard = 0;
        while ((last.x !== t.x || last.z !== t.z) && guard++ < 60) {
          const nx = last.x + Math.sign(t.x - last.x), nz = last.z + Math.sign(t.z - last.z);
          last = { x: nx, z: nz };
          const key = nx + ',' + nz;
          if (!d.seen.has(key)) { d.seen.add(key); d.path.push(last); }
        }
      }
      d.end = t;
      if (d.terra) this.stroker(d)?.strokePath(d.path); // [v26 resort]
      this.updateLine();
    }
    if (e.pointerType === 'mouse') this.onHover(p.x, p.y, true);
  }

  onUp(e, cancel = false) {
    const ptr = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!ptr) return;
    if (this.pinch) { if (this.pointers.size < 2) this.pinch = null; this.drag = null; return; }
    const drag = this.drag;
    this.drag = null;
    this.game.buildMove.pressCancel(); // [v19 buildings]
    if (drag && drag.mode === 'move') { if (cancel) this.game.buildMove.cancelMove(); else this.game.buildMove.drop(); return; }
    if (drag && drag.mode === 'grab') { this.dropFish(drag, this.local(e)); return; }
    if (drag && drag.mode === 'pet') return;
    if (drag?.terra && (cancel || drag.mode !== 'line')) this.stroker(drag)?.strokeEnd(true); // [v26 resort]
    if (cancel || !drag) { this.game.ghostLine = null; return; }
    const p = this.local(e);
    if (drag.bubble) { if (drag.mode === 'maybe') this.game.ui?.advanceBubble?.(); return; }
    if (drag.mode === 'maybe' && performance.now() - ptr.t < 900) this.tap(p.x, p.y, ptr.button);
    else if (drag.mode === 'line') this.commitLine(drag);
  }

  // ---- hand tool: pick a fish up, carry it, drop it anywhere in the pond
  grabFish(f, p) {
    const game = this.game;
    f.held = true;
    f.state = 'wander';
    if (f.mate) { f.mate.mate = null; f.mate.state = 'wander'; f.mate = null; }
    this.drag = { mode: 'grab', fish: f, x: p.x, y: p.y };
    game.particles.splash(f.x, f.z, 8, 0.7);
    game.audio.play('grab', { volume: 0.5 });
    game.audio.play('fish_flop', { volume: 0.4 });
    this.moveGrab(p);
  }

  moveGrab(p) {
    const d = this.drag;
    const f = d.fish;
    if (!f || f.dead) { this.drag = null; return; }
    const w = this.worldPoint(p.x, p.y, 0.7);
    f.x = w.x; f.z = w.z; f.y = 0.7 + Math.sin(performance.now() / 90) * 0.05;
    d.x = p.x; d.y = p.y;
    if (Math.random() < 0.12) this.game.particles.fx.spawn('drop', f.x, f.y - 0.1, f.z, { vy: -0.5, grav: 9, life: 1, size: 0.07, flags: 2, bright: true });
    if (Math.random() < 0.03) this.game.audio.play('fish_flop', { volume: 0.25, pitch: 0.9 + Math.random() * 0.3 });
  }

  dropFish(d, p) {
    const game = this.game;
    const f = d.fish;
    if (!f || f.dead) return;
    const w = this.worldPoint(p.x, p.y, -0.1);
    const g = game.grid;
    let x = w.x, z = w.z;
    // dropped onto a glass tank: in it goes
    const ts = game.structures.structureAtTile(Math.floor(x), Math.floor(z));
    if (ts?.def.tank && ts.built) {
      f.held = false;
      if (game.tanks.put(f, ts)) return;
    }
    if (f.tank) {
      // carried out of a tank: into the pond if dropped on water, otherwise back home
      const tank = f.tank;
      if (g.fishPassable(Math.floor(x), Math.floor(z))) { f.tank = null; game.tanks.visual(tank); }
      else { f.held = false; game.tanks.put(f, tank, { quiet: true }); return; }
    }
    if (!g.fishPassable(Math.floor(x), Math.floor(z))) {
      const q = game.fish.nearestWater(x, z);
      if (q) { x = q.x; z = q.z; }
      game.ui?.floatTextAt(x, 0.6, z, 'Plop!', '#bfe8ff');
    }
    f.held = false;
    f.x = x; f.z = z; f.y = -0.3;
    f.region = g.regionAt(x, z);
    f.fleeT = 0.6; f.state = 'flee';
    game.particles.splash(x, z, 12, 0.8);
    game.audio.play('splash', { volume: 0.5, pitch: 1.2 });
    game.audio.play('drop', { volume: 0.4 });
  }

  // continuous petting while the pointer is held on a fish
  update(dt) {
    // [v19 buildings] a long press on a build lifts it
    const bm = this.game.buildMove;
    if (bm.hold) {
      const dm = this.drag?.mode;
      if (this.pinch || this.pointers.size !== 1 || dm === 'grab' || dm === 'pet' || dm === 'pan' || this.game.inputLocked) bm.pressCancel();
      else if (bm.pressTick()) {
        if (this.drag?.terra) this.stroker(this.drag)?.strokeEnd(true); // [v26 resort]
        this.game.ghostLine = null;
        this.drag = { mode: 'move' };
        const ptr = [...this.pointers.values()][0];
        if (ptr) bm.aim(ptr.x, ptr.y);
      }
    }
    bm.update(dt);
    const d = this.drag;
    if (d && d.mode === 'pet') {
      const f = d.fish;
      if (!f || f.dead) { this.drag = null; return; }
      const near = this.game.ui?.pickFish(d.x, d.y, 40);
      if (near === f) this.game.nurtureFish(f);
    }
  }

  onWheel(e) {
    e.preventDefault();
    if (this.game.inputLocked) return;
    const f = Math.exp(Math.sign(e.deltaY) * Math.min(0.25, Math.abs(e.deltaY) * 0.0022));
    const p = this.local(e);
    this.game.rig.zoomAt(f, p.x, p.y, this.game.renderer);
    this.game.rig.userCamT = performance.now();
  }

  onKey(e, down) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (down && !this.game.inputLocked) {
      const k = e.key;
      if (k === 'z' || k === 'Z' || k === 'PageUp') this.game.rig.zoom(0.8);
      else if (k === 'x' || k === 'X' || k === 'PageDown') this.game.rig.zoom(1.25);
    }
    const k = e.key.toLowerCase();
    if (down) {
      this.game.audio.unlock();
      if (this.keys.has(k)) return;
      this.keys.add(k);
      if (this.game.feast?.active && this.game.feast.onKey?.(k, e)) return; // [v26 feast] camera keys only
      const ui = this.game.ui;
      if (k === 'q') { this.game.rig.rotate(-1); this.game.rig.userCamT = performance.now(); }
      else if (k === 'e') { this.game.rig.rotate(1); this.game.rig.userCamT = performance.now(); }
      else if (k === 'escape') { if (this.game.buildMove.escape()) { /* [v19 buildings] */ } else if (!ui?.closeTop()) this.game.setTool({ kind: 'feed' }); }
      else if (k === ' ') { e.preventDefault(); ui?.togglePause(); }
      else if (k === '+' || k === '=') this.game.rig.zoom(0.8);
      else if (k === '-' || k === '_') this.game.rig.zoom(1.25);
      else if (/^[1-9]$/.test(k)) ui?.hotkey(+k);
      else if (k === 'b') this.game.ringBell();
      else if (k === 'f') ui?.followBear();
    } else this.keys.delete(k);
  }

  updateKeys(dt) {
    this.update(dt);
    if (this.game.inputLocked) return;
    const k = this.keys;
    let f = 0, r = 0;
    if (k.has('w') || k.has('arrowup')) f += 1;
    if (k.has('s') || k.has('arrowdown')) f -= 1;
    if (k.has('d') || k.has('arrowright')) r += 1;
    if (k.has('a') || k.has('arrowleft')) r -= 1;
    if (f || r) {
      const sp = 14 * this.game.rig.wupp / 0.07 * dt * (k.has('shift') ? 2.2 : 1);
      this.game.rig.panRelative(f * sp, r * sp);
      this.game.rig.userCamT = performance.now();
    }
  }

  // ------------------------------------------------------------ actions
  tap(sx, sy, button = 0) {
    const game = this.game;
    if (game.feast?.active) { game.feast.onTap?.(sx, sy); return; } // [v26 feast] no tools during the feast
    const t = this.pickTile(sx, sy);
    const tool = game.tool;
    const g = game.grid;
    const bm = game.buildMove; // [v19 buildings]
    if (bm.moving) { bm.drop(sx, sy); return; }
    const hadCard = bm.closeCard();
    if (!g.inb(t.x, t.z)) return;
    if (tool.kind === 'build') { game.placeStructure(tool.type, t.x, t.z, { free: !!tool.free }); return; }
    if (tool.kind === 'dig') { game.dig(t.x, t.z); return; }
    // [v19 buildings] a tap never deletes a build: it opens its card; trees get picked one by one
    if (tool.kind === 'clear') { bm.tapClear(t.x, t.z); return; }
    if (tool.kind === 'remove') { const st = game.structures.structureAtTile(t.x, t.z); if (st) bm.openCard(st); else game.demolishAt(t.x, t.z); return; }
    if (tool.kind === 'land') {
      const [px, pz] = game.land.plotOf(t.x, t.z);
      const I = game.land.info(px, pz);
      if (I.forSale) game.ui?.confirmLand?.(I);
      else game.notify(I.owned ? 'This plot is yours! Clear its trees with the Destroy tool.' : `Not for sale: ${I.reason}.`, I.owned ? 'happy' : 'no');
      return;
    }
    if (tool.kind === 'tank') {
      // tank tool: a fish in a tank goes back to the pond, a pond fish goes into the nearest tank
      const ts = game.structures.structureAtTile(t.x, t.z);
      const f = game.ui?.pickFish(sx, sy, 34);
      if (f) {
        if (f.tank) game.tanks.release(f);
        else {
          const s = game.tanks.nearestWithRoom(f.x, f.z);
          if (!s) { game.notify(game.tanks.list().length ? 'All tanks are full!' : 'Build a Glass Tank first! (Build ▸ Gadgets)', 'no'); return; }
          game.tanks.put(f, s);
        }
        return;
      }
      if (ts?.def.tank) { game.ui?.showTankCard?.(ts); return; }
      game.ui?.toast('Tap a fish to move it into a tank (or back out)');
      return;
    }
    if (tool.kind === 'tag' || tool.kind === 'nurture' || tool.kind === 'hand') {
      const f = game.ui?.pickFish(sx, sy, 34);
      if (!f) { game.ui?.toast(tool.kind === 'tag' ? 'Tap a fish to tag it DO NOT EAT' : tool.kind === 'hand' ? 'Press and drag a fish to carry it' : 'Tap (or hold) a fish to pet it'); return; }
      if (tool.kind === 'tag') game.tagFish(f);
      else if (tool.kind === 'nurture') game.nurtureFish(f);
      return;
    }
    // parcels on the ground: tap to unbox
    const parcel = game.ui?.pickParcel?.(sx, sy);
    if (parcel && game.tool.kind === 'feed') { game.ui.unboxParcel(parcel); return; }
    // pond eggs: tap to check / hatch
    const egg = game.ui?.pickPondEgg?.(sx, sy);
    if (egg && game.tool.kind === 'feed') { game.ui.tapPondEgg(egg); return; }
    // forest finds: logs, mushrooms, wild plants, ruins (the fox fetches them)
    if (game.tool.kind === 'feed' && game.forage?.tapAt(sx, sy)) return;
    if (game.tool.kind === 'feed' && game.mining?.tapAt(sx, sy)) return; // [F&S mining] ore veins, the Bear Mine
    // default: feed / interact. Tapping a creature zooms in and tracks it.
    const cr = game.ui?.pickCreature?.(sx, sy);
    if (cr && cr.kind === 'npc') { game.villagers.open(cr.ent); return; }
    if (game.tool.kind === 'feed' && game.homes?.tapDoor?.(sx, sy)) return; // [v20 npc homes] tap a neighbour's door to visit
    if (cr && cr.kind === 'songbird') { game.spotBird(cr.ent); return; }
    if (cr && cr.kind === 'land') { game.landAnimals.spot(cr.ent); return; }
    if (cr && game.tool.kind === 'feed') {
      game.ui.trackEntity(cr.ent, cr);
      if (cr.kind === 'livestock') game.ui.showLivestockInfo?.(cr.ent);
      if (cr.kind === 'bear') game.ui.showBearInfo?.(cr.ent);
      else if (cr.kind === 'fish') game.ui.showFishInfo?.(cr.ent);
      return;
    }
    if (t.x >= HUT.x && t.x < HUT.x + 3 && t.z >= HUT.z && t.z < HUT.z + 3) { game.ui?.openPanel('lab'); return; }
    const s = game.structures.structureAtTile(t.x, t.z);
    if (s && game.tapStructure(s)) return;
    if (g.isWater(t.x, t.z) && !(s && (s.def.blocksFish))) {
      const w = this.worldPoint(sx, sy, -0.1);
      game.feedAt(w.x, w.z);
      return;
    }
    if (s) { if (!hadCard || bm.lastCardS !== s) bm.openCard(s); return; } // [v19 buildings] move · store · sell · info
    const fish = game.ui?.pickFish(sx, sy);
    if (fish) game.ui.showFishInfo(fish);
  }

  lineTiles(a, b) {
    const out = [];
    const dx = b.x - a.x, dz = b.z - a.z;
    if (Math.abs(dx) >= Math.abs(dz)) {
      const s = Math.sign(dx) || 1;
      for (let i = 0; i <= Math.abs(dx); i++) out.push({ x: a.x + i * s, z: a.z });
    } else {
      const s = Math.sign(dz) || 1;
      for (let i = 0; i <= Math.abs(dz); i++) out.push({ x: a.x, z: a.z + i * s });
    }
    return out.slice(0, 40).filter((t) => this.game.grid.inb(t.x, t.z)); // [v20 map] nothing past the map edge
  }

  rectTiles(a, b) {
    const out = [];
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
    for (let z = z0; z <= z1 && z - z0 < 16; z++) for (let x = x0; x <= x1 && x - x0 < 16; x++) if (this.game.grid.inb(x, z)) out.push({ x, z }); // [v20 map]
    return out;
  }

  updateLine() {
    const d = this.drag;
    if (!d || d.mode !== 'line') return;
    this.game.ghostLine = d.rect ? this.rectTiles(d.start, d.end) : d.paint ? d.path.slice(-80) : this.lineTiles(d.start, d.end);
  }

  commitLine(drag) {
    const game = this.game;
    const tiles = drag.rect ? this.rectTiles(drag.start, drag.end) : drag.paint ? drag.path.slice(0, 80) : this.lineTiles(drag.start, drag.end);
    game.ghostLine = null;
    if (drag.terra) { this.stroker(drag)?.strokeEnd(drag.moved); return; } // [v26 resort]
    // [v19 buildings] taps never delete builds: a tap opens the build's card, drags only clear nature
    const bm = game.buildMove;
    if (game.tool.kind === 'remove') {
      const st0 = tiles.length === 1 ? game.structures.structureAtTile(tiles[0].x, tiles[0].z) : null;
      if (st0) { bm.openCard(st0); return; }
      bm.closeCard();
      for (const t of tiles) if (!game.structures.structureAtTile(t.x, t.z)) game.demolishAt(t.x, t.z);
      return;
    }
    const tool = game.tool;
    if (tool.kind === 'clear') {
      if (tiles.length === 1) {
        // tap tree after tree: each tap adds it to (or takes it out of) the unpaid pick list
        bm.closeCard();
        bm.tapClear(tiles[0].x, tiles[0].z);
        return;
      }
      bm.closeCard();
      // queue outward from your land so the inside of a deep box joins up too
      let n = 0;
      const before = new Set(game.beavers.clears.keys());
      for (let pass = 0; pass < 18; pass++) {
        let got = 0;
        for (const t of tiles) if (game.beavers.queueClear(t.x, t.z).ok) got++;
        n += got;
        if (!got) break;
      }
      if (n) {
        game.audio.play('paper', { volume: 0.3 });
        // pay the crew right there for this chunk (a little contract pops up)
        const fresh = [...game.beavers.clears.keys()].filter((k) => !before.has(k));
        bm.reContract([...(game.ui?.contract?.tiles || []), ...fresh]); // [v19 buildings] joins earlier taps, hangs below the picks
        game.emit('clearArea', { n });
      }
      else game.notify('Nothing to clear there (or it\'s too far from your land).', 'no');
      return;
    }
    if (tool.kind === 'dig') {
      if (tiles.length === 1) { game.dig(tiles[0].x, tiles[0].z); return; }
      let n = 0;
      // repeat passes so tiles further from the water become diggable as the line grows
      for (let pass = 0; pass < 3; pass++)
        for (const t of tiles) {
          if (game.canDig(t.x, t.z)) continue;
          if (!game.canAfford(game.digCost())) { if (!n) game.ui?.toast('Not enough coins!', 'bad'); break; }
          if (game.dig(t.x, t.z, true)) n++;
        }
      game.applyDigs();
      if (n > 1) game.ui?.toast(`Dug ${n} tiles`);
      return;
    }
    if (tool.kind === 'build') {
      const free = !!tool.free;
      if (tiles.length === 1) { game.placeStructure(tool.type, tiles[0].x, tiles[0].z, { free }); return; }
      let placed = 0;
      const [fw, fd] = STRUCTURES[tool.type].size || [1, 1];
      for (const t of tiles) {
        if (free && !(game.state.inventory[tool.type] > 0)) break;
        if (!game.structures.canPlace(tool.type, t.x, t.z).ok) continue;
        if (!free && !game.canAfford(STRUCTURES[tool.type].cost)) { game.notify('Out of coins!', 'no'); break; }
        if (game.placeStructure(tool.type, t.x, t.z, { free, quiet: true })) placed++;
        if (fw > 1 || fd > 1) continue;
      }
      if (placed > 1) { game.audio.play('coins', { volume: 0.3 }); game.ui?.floatTextAt(tiles[tiles.length - 1].x + 0.5, 1.2, tiles[tiles.length - 1].z + 0.5, `×${placed}`, '#fff3a0'); }
    }
  }

  onHover(sx, sy, dragging = false) {
    this.hover = { x: sx, y: sy };
    if (!dragging) this.game.ui?.hover(sx, sy);
  }

  // hovered tile for ghost previews (desktop) — called each frame
  currentHoverTile() {
    if (!this.hover) return null;
    return this.pickTile(this.hover.x, this.hover.y);
  }
}
