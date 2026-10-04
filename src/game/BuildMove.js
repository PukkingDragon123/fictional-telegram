// [v19 buildings] Your builds are never deleted by a tap any more:
//  - tap a build (Destroy / Remove tool, or a plain tap nothing else wants) -> a little
//    action card pops next to it: MOVE · STORE (back to Build ▸ Parcels) · SELL (asks first) · INFO
//  - press & HOLD a build (~0.45 s) with any tool -> it lifts off (wobble, shadow, dust), a
//    green/red ghost follows your finger, let go to drop it (bad spot = it snaps back)
//  - Destroy tool: tap trees one at a time. Picks glow red with a little traffic cone over
//    them until you pay the beaver contract once for the lot.
import * as THREE from 'three';
import '../ui/buildmove.css';

export const HOLD_MS = 450;

// ---------------------------------------------------------------- tiny pixel icons
const PAL = { k: '#2a1a14', o: '#ff7a1a', O: '#c8501a', w: '#fff6e0', y: '#ffd23a', Y: '#d89a1a', b: '#a86a3a', B: '#7a4a24', l: '#d8a060', g: '#6ad04a', G: '#3a8a2a', s: '#7ac8ff', S: '#3a7ac8', r: '#ff5a4a' };
const ART = {
  move: [
    '....k....',
    '...kwk...',
    '..kwwwk..',
    '....w....',
    'kk..w..kk',
    'kwwwwwwwk',
    'kk..w..kk',
    '....w....',
    '..kwwwk..',
    '...kwk...',
    '....k....',
  ],
  rotate: [
    '...kkkkk...',
    '..kwwwwwk..',
    '.kwkkkkkwk.',
    'kwk.....kwk',
    'kwk...kkwwk',
    'kwk...kwwwk',
    'kwk....kkk.',
    'kwk........',
    '.kwk.....k.',
    '..kwkkkkwk.',
    '...kwwwwk..',
  ],
  store: [
    '.kkkkkkkkk.',
    'klllllllllk',
    'kbbbbbbbbbk',
    'kkkkkkkkkkk',
    '.kbbbbbbbk.',
    '.kblkkklbk.',
    '.kbbbbbbbk.',
    '.kBBBBBBBk.',
    '.kkkkkkkkk.',
  ],
  sell: [
    '..kkkkk..',
    '.kyyyyyk.',
    'kyywwyyYk',
    'kywyyyyYk',
    'kyyyyyyYk',
    'kyyyyyyYk',
    'kyyyyyYYk',
    '.kYYYYYk.',
    '..kkkkk..',
  ],
  info: [
    '..kkkkk..',
    '.ksswssk.',
    'ksssssssk',
    'ksswwwssk',
    'kssswsssk',
    'kssswsssk',
    'ksswwwssk',
    '.kSSSSSk.',
    '..kkkkk..',
  ],
  cone: [
    '.....k.....',
    '....kok....',
    '....kok....',
    '...kwwwk...',
    '...kwwwk...',
    '..kooooOk..',
    '..kooooOk..',
    '.kwwwwwwwk.',
    '.kwwwwwwwk.',
    'kooooooooOk',
    'kooooooooOk',
    'kkkkkkkkkkk',
  ],
};
const urlCache = new Map();
export function pixIcon(name, scale = 3) {
  const key = name + scale;
  if (urlCache.has(key)) return urlCache.get(key);
  const rows = ART[name];
  const cv = document.createElement('canvas');
  cv.width = rows[0].length * scale; cv.height = rows.length * scale;
  const c = cv.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (PAL[ch]) { c.fillStyle = PAL[ch]; c.fillRect(x * scale, y * scale, scale, scale); } }));
  const url = cv.toDataURL();
  urlCache.set(key, url);
  return url;
}
const img = (n, s = 3) => `<img class="bm-px" src="${pixIcon(n, s)}" alt="">`;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class BuildMove {
  constructor(game) {
    this.game = game;
    this.card = null; // {el, s}
    this.moving = null; // {s, held, tx, tz, ok, reason}
    this.hold = null; // {s, t0, x, y} pending press-and-hold
    this.time = 0;
    this.cones = new Map(); // tile index -> el
    this.pulseT = 0;
    this.hoverT = 0;
  }

  get ui() { return this.game.ui; }
  overlay() { return this.ui?.overlay || document.body; }

  // ------------------------------------------------------------ rules
  movable(s) {
    if (!s || s.removed) return { ok: false, reason: 'Gone!' };
    if (s.def.noMove) return { ok: false, reason: `${s.def.name} is fixed in place` };
    return { ok: true };
  }

  refund(s) { return Math.floor((s.paid || s.def.cost || 0) * 0.5); }

  // ------------------------------------------------------------ action card
  openCard(s, { sell = false } = {}) {
    const game = this.game;
    if (!s || s.removed) return;
    this.closeCard(true);
    const el = document.createElement('div');
    el.className = 'bm-card';
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    this.overlay().appendChild(el);
    this.card = { el, s };
    this.renderCard(sell ? 'sell' : 'main');
    this.placeCard();
    game.audio.play('page', { volume: 0.35, pitch: 1.15 });
    // the build does a little hop so you know which one the card is about
    s.popT = 0.45;
    game.emit?.('buildCard', s);
  }

  renderCard(view = 'main') {
    const c = this.card;
    if (!c) return;
    const { el, s } = c;
    const game = this.game;
    const d = s.def;
    const mv = this.movable(s);
    const lodge = d.beavers ? game.beavers.list.filter((b) => b.lodge === s).length : 0;
    c.view = view;
    if (view === 'sell') {
      const r = this.refund(s);
      el.innerHTML = `<div class="bm-head"><b>Sell ${esc(d.name)}?</b></div>
        <div class="bm-body">You get ${img('sell', 2)}<b>${r}</b> back${lodge ? `<br><span class="bm-warn">The ${lodge} beaver${lodge > 1 ? 's' : ''} inside move out!</span>` : ''}${s.store && Object.keys(s.store).length ? '<br><span class="bm-dim">Food inside goes back to your bag.</span>' : ''}</div>
        <div class="bm-btns two"><button class="bm-b sell" data-a="sellyes">${img('sell', 2)} SELL</button><button class="bm-b" data-a="back">KEEP</button></div>`;
    } else {
      el.innerHTML = `<div class="bm-head"><b>${esc(d.name)}</b><button class="bm-x" data-a="close" title="Close">✕</button></div>
        <div class="bm-btns">
          <button class="bm-b move" data-a="move" ${mv.ok ? '' : 'disabled'} title="${mv.ok ? 'Move it' : esc(mv.reason)}">${img('move')}<span>MOVE</span></button>
          <button class="bm-b rot" data-a="rotate" ${game.structures.canRotate(s) ? '' : 'disabled'} title="Turn it">${img('rotate')}<span>TURN</span></button>
          <button class="bm-b store" data-a="store" title="To Build ▸ Parcels (place again for free)">${img('store')}<span>STORE</span></button>
          <button class="bm-b sell" data-a="sell" title="Sell">${img('sell')}<span>SELL</span><i>+${this.refund(s)}</i></button>
          <button class="bm-b info" data-a="info" title="Details">${img('info')}<span>INFO</span></button>
        </div>
        <div class="bm-tip">${mv.ok ? '<b>Hold</b> a build to drag it' : esc(mv.reason)}</div>`;
    }
    el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.act(b.dataset.a); }));
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }

  act(a) {
    const c = this.card;
    if (!c) return;
    const game = this.game;
    const s = c.s;
    game.audio.play('click', { volume: 0.35 });
    if (a === 'close') { this.closeCard(); return; }
    if (a === 'back') { this.renderCard('main'); return; }
    if (a === 'move') { this.closeCard(true); this.startMove(s, { held: false }); return; }
    if (a === 'rotate') { game.structures.rotate(s); return; }
    if (a === 'store') { this.closeCard(true); this.store(s); return; }
    if (a === 'sell') { this.renderCard('sell'); game.audio.play('coins', { volume: 0.15, pitch: 1.4 }); return; }
    if (a === 'sellyes') { this.closeCard(true); this.sell(s); return; }
    if (a === 'info') { this.closeCard(true); this.ui?.showStructureInfo?.(s); }
  }

  placeCard() {
    const c = this.card;
    if (!c) return;
    const s = c.s;
    const [fw, fd] = s.def.size || [1, 1];
    const q = this.ui.screenOf(s.x + fw / 2, this.game.structures.baseY(s) + 1.15, s.z + fd / 2);
    const W = window.innerWidth, H = window.innerHeight;
    const w = c.el.offsetWidth || 240, h = c.el.offsetHeight || 120;
    const x = Math.max(w / 2 + 6, Math.min(W - w / 2 - 6, q.x));
    const y = Math.max(h + 8, Math.min(H - 10, q.y));
    c.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
  }

  closeCard(silent = false) {
    const c = this.card;
    if (!c) return false;
    this.card = null;
    this.lastCardS = c.s;
    c.el.classList.add('bye');
    setTimeout(() => c.el.remove(), 200);
    if (!silent) this.game.audio.play('close', { volume: 0.25 });
    return true;
  }

  // ------------------------------------------------------------ store / sell
  takeOut(s) {
    const game = this.game;
    // stored food goes back into the bag
    if (s.store) for (const [id, n] of Object.entries(s.store)) if (n >= 1) game.foodStore?.add?.(id, Math.floor(n));
    if (s.def.beavers) game.beavers.removeForLodge(s);
    game.structures.remove(s, { silent: true });
    const [fw, fd] = s.def.size || [1, 1];
    const cx = s.x + fw / 2, cz = s.z + fd / 2, y = game.structures.baseY(s);
    game.particles.puff(cx, y + 0.2, cz, 10, 0.35);
    game.particles.dust(cx, y + 0.1, cz, 6);
    return { cx, cz, y };
  }

  store(s) {
    const game = this.game;
    if (!s || s.removed) return false;
    const { cx, cz, y } = this.takeOut(s);
    const inv = game.state.inventory || (game.state.inventory = {});
    inv[s.type] = (inv[s.type] || 0) + 1;
    game.emit('inventory', inv);
    game.particles.stars?.(cx, y + 0.8, cz, 6);
    game.audio.play('crate_drop', { volume: 0.4 });
    game.audio.play('pop_in', { volume: 0.3, pitch: 0.8 });
    this.ui?.floatTextAt?.(cx, y + 1.2, cz, 'Stored! Build ▸ Parcels', '#c8f0ff');
    this.ui?.refreshPanelSoon?.();
    if (this.ui?.blueprint?.open) this.ui.blueprint.render();
    return true;
  }

  sell(s) {
    const game = this.game;
    if (!s || s.removed) return false;
    const r = this.refund(s);
    const { cx, cz, y } = this.takeOut(s);
    if (r) {
      game.state.coins += r;
      if (game.day?.income) game.day.income.refunds = (game.day.income.refunds || 0) + r;
      game.emit('coins', { delta: r });
      game.particles.coins?.(cx, y + 0.6, cz, 6);
    }
    game.audio.play('coins', { volume: 0.45 });
    game.audio.play('demolish', { volume: 0.35, pitch: 1.2 });
    this.ui?.floatTextAt?.(cx, y + 1.1, cz, r ? `Sold! +${r}` : 'Sold!', '#ffe9a0');
    return true;
  }

  // ------------------------------------------------------------ move mode
  startMove(s, { held = false } = {}) {
    const game = this.game;
    const mv = this.movable(s);
    if (!mv.ok) { game.notify(mv.reason, 'no'); game.audio.play('error', { volume: 0.4 }); return false; }
    this.cancelMove(true);
    this.closeCard(true);
    this.moving = { s, held, tx: s.x, tz: s.z, ok: true, reason: '', t: 0, rotY: s.obj?.rotation.y ?? 0, y0: s.obj?.position.y ?? 0 };
    const [fw, fd] = s.def.size || [1, 1];
    const cx = s.x + fw / 2, cz = s.z + fd / 2, y = game.structures.baseY(s);
    game.particles.dust(cx, y + 0.1, cz, 10);
    game.particles.puff(cx, y + 0.05, cz, 8, 0.3);
    game.audio.play('grab', { volume: 0.5 });
    game.audio.play('pop_in', { volume: 0.25, pitch: 1.4 });
    if (navigator.vibrate) try { navigator.vibrate(18); } catch { /* ignore */ }
    this.ensureShadow();
    this.hint(held ? 'Drag it, let go to drop' : 'Tap a spot to drop it · Esc / right-click to cancel');
    document.body.classList.add('bm-moving');
    game.emit?.('moveStart', s);
    return true;
  }

  // pointer (screen) -> target tile
  aim(sx, sy) {
    const m = this.moving;
    if (!m) return;
    const t = this.game.input.pickTile(sx, sy);
    const [fw, fd] = m.s.def.size || [1, 1];
    // multi-tile builds: aim at their middle
    const x = t.x - Math.floor((fw - 1) / 2), z = t.z - Math.floor((fd - 1) / 2);
    if (x === m.tx && z === m.tz && m.aimed) return;
    m.aimed = true;
    m.tx = x; m.tz = z;
    const r = this.game.structures.canMove(m.s, x, z);
    m.ok = r.ok; m.reason = r.reason || '';
    if (Math.random() < 0.5) this.game.audio.play('click', { volume: 0.12, pitch: r.ok ? 1.5 : 0.8 });
  }

  // drop at the aimed tile (held: release; tap mode: the tapped tile)
  drop(sx, sy) {
    const m = this.moving;
    if (!m) return false;
    const game = this.game;
    if (sx != null) { m.aimed = false; this.aim(sx, sy); }
    const s = m.s;
    if (!m.aimed || (m.tx === s.x && m.tz === s.z)) {
      if (!m.held && m.aimed) { this.cancelMove(); return false; }
      this.cancelMove(true);
      this.settleFx(s, true);
      return false;
    }
    if (!m.ok) {
      game.notify(m.reason || 'Can\'t go there', 'no');
      game.audio.play('error', { volume: 0.4 });
      if (m.held) { this.cancelMove(true); this.settleFx(s, true); }
      return false; // tap mode: keep moving, pick another spot
    }
    this.endLift();
    const r = game.structures.moveTo(s, m.tx, m.tz);
    this.moving = null;
    this.clearGhost();
    if (!r.ok) { game.notify(r.reason || 'Can\'t go there', 'no'); return false; }
    game.placeFx?.(s);
    this.ui?.floatTextAt?.(s.x + 0.5, game.structures.baseY(s) + 1.3, s.z + 0.5, 'Moved!', '#c8ff9a');
    game.emit?.('moved', s);
    game.state.tips && (game.state.tips.movedOnce = 1);
    return true;
  }

  cancelMove(silent = false) {
    const m = this.moving;
    if (!m) return false;
    this.endLift();
    this.moving = null;
    this.clearGhost();
    if (!silent) { this.game.audio.play('close', { volume: 0.3 }); this.settleFx(m.s, true); }
    return true;
  }

  settleFx(s, back) {
    if (!s || s.removed) return;
    const game = this.game;
    s.popT = 0.45;
    const y = game.structures.baseY(s);
    game.particles.dust(s.x + 0.5, y + 0.1, s.z + 0.5, 5);
    if (back) game.audio.play('drop', { volume: 0.35, pitch: 0.9 });
  }

  endLift() {
    const m = this.moving;
    if (!m) return;
    const s = m.s;
    s.lift = 0;
    if (s.obj && !s.removed) { s.obj.position.y = m.y0; s.obj.rotation.z = 0; s.obj.rotation.x = 0; s.obj.rotation.y = m.rotY; s.obj.scale.set(1, 1, 1); }
    this.game.structures.spritesDirty = true;
    if (this.shadow) this.shadow.visible = false;
    document.body.classList.remove('bm-moving');
    this.hint(null);
  }

  ensureShadow() {
    if (this.shadow) return;
    const geo = new THREE.CircleGeometry(0.42, 20);
    geo.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    this.shadow.renderOrder = 29;
    this.game.scene.add(this.shadow);
  }

  clearGhost() { this.game.ghost?.clear(); }

  drawGhost() {
    const m = this.moving;
    const ghost = this.game.ghost;
    if (!m || !ghost) return;
    if (!m.aimed) { ghost.clear(); return; }
    const tiles = this.game.structures.footprint(m.s.type, m.tx, m.tz).map(([x, z]) => ({ x, z, ok: m.ok }));
    ghost.showTiles(tiles);
    ghost.showModels(m.s.type, [{ x: m.tx, z: m.tz, ok: m.ok }]);
  }

  hint(text) {
    if (!text) { this.hintEl?.classList.add('hidden'); return; }
    if (!this.hintEl) { this.hintEl = document.createElement('div'); this.hintEl.className = 'bm-hint'; this.overlay().appendChild(this.hintEl); }
    this.hintEl.innerHTML = `${img('move', 2)} ${esc(text)}`;
    this.hintEl.classList.remove('hidden');
  }

  // ------------------------------------------------------------ press & hold
  pressStart(s, sx, sy, pointerId) {
    if (!this.movable(s).ok || this.moving) return;
    this.hold = { s, t0: performance.now(), x: sx, y: sy, id: pointerId };
  }

  pressCancel() {
    this.hold = null;
    this.ring?.classList.add('hidden');
  }

  // called each frame by Input: true when the hold just turned into a lift
  pressTick() {
    const h = this.hold;
    if (!h) return false;
    const k = (performance.now() - h.t0) / HOLD_MS;
    if (!this.ring) { this.ring = document.createElement('div'); this.ring.className = 'bm-ring hidden'; this.overlay().appendChild(this.ring); }
    if (k > 0.25) {
      this.ring.classList.remove('hidden');
      this.ring.style.transform = `translate(${h.x}px, ${h.y}px) translate(-50%, -50%)`;
      this.ring.style.setProperty('--k', Math.min(1, (k - 0.25) / 0.75).toFixed(3));
    }
    if (k < 1) return false;
    this.pressCancel();
    return this.startMove(h.s, { held: true });
  }

  // ------------------------------------------------------------ Destroy tool: tree by tree
  // a single tap on a tree / rock / weed: add it to (or take it out of) the unpaid pick list
  tapClear(x, z) {
    const game = this.game;
    const st = game.structures.structureAtTile(x, z);
    if (st) { this.openCard(st); return true; }
    const B = game.beavers;
    const g = game.grid;
    if (!g.inb(x, z)) return false;
    const i = z * g.w + x;
    if (!B.count()) { game.notify('Need beavers first!', 'no'); return false; }
    const ui = this.ui;
    const pend = ui?.contract?.tiles || [];
    if (B.clears.has(i)) {
      B.cancelClear(x, z);
      game.audio.play('close', { volume: 0.3, pitch: 1.1 });
      this.dropCone(i, true);
      if (pend.includes(i)) this.reContract(pend.filter((t) => t !== i));
      return true;
    }
    const r = B.queueClear(x, z);
    if (!r.ok) {
      if (r.reason === 'far') game.notify('Too far! Start from the edge of your land.', 'no');
      else if (r.reason === 'fog') game.notify('Too foggy! Clear right up to the fog and it lifts.', 'no');
      else if (r.reason === 'level') game.notify(`Need Lv${r.need} beaver tools! Upgrade on e-Buy.`, 'no');
      else if (r.reason === 'nothing') { game.notify('Nothing to clear here. Tap a tree, rock or weed!', 'no'); }
      game.audio.play('error', { volume: 0.3 });
      return false;
    }
    const n = pend.length;
    game.audio.play('paper', { volume: 0.3, pitch: 1.1 + Math.min(0.6, n * 0.05) });
    game.audio.play('pop_in', { volume: 0.2, pitch: 1.3 + Math.min(0.6, n * 0.05) });
    game.particles.puff?.(x + 0.5, g.height[i] + 0.4, z + 0.5, 4, 0.25);
    this.reContract([...pend, i]);
    game.emit('clearArea', { n: 1 });
    return true;
  }

  // (re)open the beaver contract for these picks without cancelling the earlier ones
  reContract(tiles) {
    const ui = this.ui;
    const g = this.game.grid;
    if (!ui?.beaverContract) return;
    if (!tiles.length) { ui.beaverContract({ tiles, x: 0, z: 0, keep: true }); return; }
    let sx = 0, zmax = 0;
    for (const t of tiles) { sx += t % g.w; zmax = Math.max(zmax, (t / g.w) | 0); }
    const x = sx / tiles.length + 0.5;
    ui.beaverContract({ tiles, x, z: zmax + 0.5, keep: true });
    // hang the contract UNDER the picks so it never covers the next tree you want to tap
    const c = ui.contract;
    if (c?.el) {
      c.el.classList.add('bm-below');
      c.place = () => { const q = ui.screenOf(x, 0, zmax + 1.2); c.el.style.transform = `translate(${Math.round(q.x)}px, ${Math.round(Math.min(window.innerHeight - 140, q.y))}px) translate(-50%, 12px)`; };
      c.place();
    }
    this.game.beavers.renderMarkers?.();
  }

  // ------------------------------------------------------------ per-frame
  update(dt) {
    const game = this.game;
    this.time += dt;
    if (this.card) { if (this.card.s.removed) this.closeCard(true); else this.placeCard(); }
    const m = this.moving;
    if (m) {
      const s = m.s;
      if (s.removed) { this.moving = null; this.endLift(); this.clearGhost(); }
      else {
        m.t += dt;
        const lift = 0.45 * Math.min(1, m.t / 0.18) + Math.sin(this.time * 7) * 0.05;
        s.lift = lift;
        game.structures.spritesDirty = true;
        if (s.obj) {
          s.obj.position.y = m.y0 + lift;
          s.obj.rotation.z = Math.sin(this.time * 9) * 0.07;
          s.obj.rotation.x = Math.cos(this.time * 7.3) * 0.04;
          const sq = 1 + Math.sin(this.time * 14) * 0.03;
          s.obj.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
        }
        if (this.shadow) {
          const [fw, fd] = s.def.size || [1, 1];
          this.shadow.visible = true;
          this.shadow.position.set(s.x + fw / 2, game.structures.baseY(s) + 0.03, s.z + fd / 2);
          const k = 1 - lift * 0.5;
          this.shadow.scale.set(k * Math.max(fw, 1), 1, k * Math.max(fd, 1));
        }
        if (Math.random() < dt * 6) game.particles.dust(s.x + 0.5, game.structures.baseY(s) + 0.05, s.z + 0.5, 1);
        // tap mode on desktop: the ghost follows the mouse
        if (!m.held && game.input.hover && !game.input.drag) this.aim(game.input.hover.x, game.input.hover.y);
        this.drawGhost();
      }
    }
    this.updateMarks(dt);
    this.updateHoverHint(dt);
    // first time with the Destroy tool: explain tree-by-tree picking
    if (game.tool?.kind === 'clear' && game.state?.tips && !game.state.tips.clearTap && !game.tutorial?.active) {
      this.ui?.tipOnce?.('clearTap', 'Tap trees (or drag a box) to mark them red. Then pay the beavers once for the lot!');
    }
  }

  // desktop: hovering a build for a moment shows "hold to move"
  updateHoverHint(dt) {
    const game = this.game;
    const inp = game.input;
    this.hoverT -= dt;
    if (this.hoverT > 0) return;
    this.hoverT = 0.15;
    if (!this.tipEl) { this.tipEl = document.createElement('div'); this.tipEl.className = 'bm-hovertip hidden'; this.overlay().appendChild(this.tipEl); }
    let s = null;
    if (inp?.hover && !inp.drag && !this.moving && !this.card && !game.inputLocked && !game.lab?.active && game.state.phase !== 'title') {
      const t = inp.pickTile(inp.hover.x, inp.hover.y);
      s = game.grid.inb(t.x, t.z) ? game.structures.structureAtTile(t.x, t.z) : null;
    }
    if (s && s === this.hoverS) this.hoverK = (this.hoverK || 0) + 0.15; else this.hoverK = 0;
    this.hoverS = s;
    if (!s || this.hoverK < 0.6 || game.tool.kind === 'build') { this.tipEl.classList.add('hidden'); return; }
    this.tipEl.innerHTML = `<b>${esc(s.def.name)}</b> · tap: options · <b>hold: move</b>`;
    this.tipEl.style.transform = `translate(${Math.round(inp.hover.x + 14)}px, ${Math.round(inp.hover.y + 18)}px)`;
    this.tipEl.classList.remove('hidden');
  }

  // red pulse on picked trees + a little traffic cone over every marked tile
  updateMarks(dt) {
    const game = this.game;
    const B = game.beavers;
    const W = game.world;
    const g = game.grid;
    const pend = new Set(this.ui?.contract?.tiles || []);
    // pulse the red glow of everything still marked (unpaid picks + fresh marks)
    this.pulseT -= dt;
    if (W?.marked?.size && this.pulseT <= 0) {
      this.pulseT = 0.08;
      const k = 0.5 + 0.5 * Math.sin(this.time * 6.5);
      const tint = [1.7 + 0.7 * k, 0.32 + 0.12 * k, 0.28 + 0.1 * k];
      for (const [batch, map] of [[W.treeBatch, W.treeTiles], [W.clutterBatch, W.clutterTiles], [W.flatBatch, W.flatTiles]]) {
        if (!batch || !map) continue;
        let any = false;
        for (const t of W.marked) for (const [bi] of map.get(t) || []) { batch.setTint(bi, tint); batch.setEmissive(bi, 0.12 + 0.32 * k); any = true; }
        if (any) batch.commit();
      }
    }
    // cones
    const hide = game.lab?.active || game.cine?.active || game.overrideScene || game.inputLocked;
    const live = new Set();
    let n = 0;
    for (const c of B?.clears?.values() || []) {
      if (n >= 160) break;
      const top = c.kind === 'tree' || c.kind === 'forest' ? 2.5 : c.kind === 'boulder' ? 1.3 : 0.8;
      const q = this.ui.screenOf(c.x + 0.5, g.height[c.i] + top, c.z + 0.5);
      if (q.visible === false || q.x < -40 || q.y < -40 || q.x > window.innerWidth + 40 || q.y > window.innerHeight + 40) continue;
      n++;
      live.add(c.i);
      let el = this.cones.get(c.i);
      if (!el) {
        el = document.createElement('div');
        el.className = 'bm-cone';
        el.innerHTML = `<img src="${pixIcon('cone', 3)}" alt="">`;
        el.style.setProperty('--d', `${-(c.i % 7) * 0.13}s`);
        this.overlay().appendChild(el);
        this.cones.set(c.i, el);
      }
      el.classList.toggle('pend', pend.has(c.i));
      el.classList.toggle('work', !!c.assigned);
      el.style.display = hide ? 'none' : '';
      el.style.transform = `translate(${Math.round(q.x)}px, ${Math.round(q.y)}px) translate(-50%, -100%)`;
    }
    for (const [i, el] of this.cones) if (!live.has(i)) this.dropCone(i, !B.clears.has(i) ? false : null);
  }

  dropCone(i, poof = false) {
    const el = this.cones.get(i);
    if (!el) return;
    this.cones.delete(i);
    if (poof) { el.classList.add('bye'); setTimeout(() => el.remove(), 220); } else el.remove();
  }

  escape() {
    if (this.moving) { this.cancelMove(); return true; }
    if (this.card) { this.closeCard(); return true; }
    return false;
  }
}
