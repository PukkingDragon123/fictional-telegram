// Pointer / touch / keyboard input: pan, pinch-zoom, rotate, taps that feed
// fish or use the active tool, drag-to-build lines, hover previews.
import * as THREE from 'three';
import { STRUCTURES } from '../data/structures.js';
import { HUT } from '../world/worldgen.js';

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
  isLineTool() {
    const t = this.tool();
    if (t.kind === 'dig') return true;
    return t.kind === 'build' && STRUCTURES[t.type]?.drag;
  }

  onDown(e) {
    this.game.audio.unlock();
    if (this.game.lab?.active) { const q = this.local(e); this.game.lab.onCanvasClick(q.x, q.y); return; }
    if (this.game.inputLocked) { this.game.cine?.onTap?.(); return; }
    this.canvas.setPointerCapture?.(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now(), button: e.button, type: e.pointerType });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      this.drag = null;
      this.game.ghostLine = null;
      return;
    }
    if (e.button === 1 || e.button === 2) { this.drag = { mode: 'pan', x: p.x, y: p.y }; return; }
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
      this.drag = { mode: 'line', start: t, end: t, moved: false };
      this.updateLine();
    } else {
      this.drag = { mode: 'maybe', x: p.x, y: p.y };
    }
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
      this.pinch.d = d; this.pinch.mx = mx; this.pinch.my = my;
      return;
    }
    if (!this.drag) return;
    if (this.drag.mode === 'grab') { this.moveGrab(p); return; }
    if (this.drag.mode === 'pet') { this.drag.x = p.x; this.drag.y = p.y; return; }
    if (this.drag.mode === 'maybe' && Math.hypot(p.x - ptr.sx, p.y - ptr.sy) > TAP_DIST) this.drag.mode = 'pan';
    if (this.drag.mode === 'pan') {
      this.game.rig.panPixels(dx, dy, this.game.renderer);
    } else if (this.drag.mode === 'line') {
      const t = this.pickTile(p.x, p.y);
      if (Math.hypot(p.x - ptr.sx, p.y - ptr.sy) > TAP_DIST) this.drag.moved = true;
      this.drag.end = t;
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
    if (drag && drag.mode === 'grab') { this.dropFish(drag, this.local(e)); return; }
    if (drag && drag.mode === 'pet') return;
    if (cancel || !drag) { this.game.ghostLine = null; return; }
    const p = this.local(e);
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
    this.game.rig.zoom(f);
  }

  onKey(e, down) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if (down) {
      this.game.audio.unlock();
      if (this.keys.has(k)) return;
      this.keys.add(k);
      const ui = this.game.ui;
      if (k === 'q') this.game.rig.rotate(-1);
      else if (k === 'e') this.game.rig.rotate(1);
      else if (k === 'escape') { if (!ui?.closeTop()) this.game.setTool({ kind: 'feed' }); }
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
      const sp = 14 * this.game.rig.wupp / 0.07 * dt;
      this.game.rig.panRelative(f * sp, r * sp);
    }
  }

  // ------------------------------------------------------------ actions
  tap(sx, sy, button = 0) {
    const game = this.game;
    const t = this.pickTile(sx, sy);
    const tool = game.tool;
    const g = game.grid;
    if (!g.inb(t.x, t.z)) return;
    if (tool.kind === 'build') { game.placeStructure(tool.type, t.x, t.z); return; }
    if (tool.kind === 'dig') { game.dig(t.x, t.z); return; }
    if (tool.kind === 'remove') { game.demolishAt(t.x, t.z); return; }
    if (tool.kind === 'tag' || tool.kind === 'nurture' || tool.kind === 'hand') {
      const f = game.ui?.pickFish(sx, sy, 34);
      if (!f) { game.ui?.toast(tool.kind === 'tag' ? 'Tap a fish to tag it DO NOT EAT' : tool.kind === 'hand' ? 'Press and drag a fish to carry it' : 'Tap (or hold) a fish to pet it'); return; }
      if (tool.kind === 'tag') game.tagFish(f);
      else if (tool.kind === 'nurture') game.nurtureFish(f);
      return;
    }
    // default: feed / interact
    const bear = game.ui?.pickBear(sx, sy);
    if (bear) { game.ui.showBearInfo(bear); return; }
    if (t.x >= HUT.x && t.x < HUT.x + 3 && t.z >= HUT.z && t.z < HUT.z + 3) { game.ui?.openPanel('lab'); return; }
    const s = game.structures.structureAtTile(t.x, t.z);
    if (s && game.tapStructure(s)) return;
    if (g.isWater(t.x, t.z) && !(s && (s.def.blocksFish))) {
      const w = this.worldPoint(sx, sy, -0.1);
      game.feedAt(w.x, w.z);
      return;
    }
    if (s) { game.ui?.showStructureInfo(s); return; }
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
    return out.slice(0, 40);
  }

  updateLine() {
    const d = this.drag;
    if (!d || d.mode !== 'line') return;
    this.game.ghostLine = this.lineTiles(d.start, d.end);
  }

  commitLine(drag) {
    const game = this.game;
    const tiles = this.lineTiles(drag.start, drag.end);
    game.ghostLine = null;
    const tool = game.tool;
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
      if (tiles.length === 1) { game.placeStructure(tool.type, tiles[0].x, tiles[0].z); return; }
      let placed = 0;
      for (const t of tiles) {
        if (!game.structures.canPlace(tool.type, t.x, t.z).ok) continue;
        if (!game.canAfford(STRUCTURES[tool.type].cost)) { game.ui?.toast('Out of coins!', 'bad'); break; }
        if (game.placeStructure(tool.type, t.x, t.z)) placed++;
      }
      if (placed > 1) game.ui?.toast(`Placed ${placed} ${STRUCTURES[tool.type].name}s`);
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
