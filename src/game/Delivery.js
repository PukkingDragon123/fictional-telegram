// Moose Express: everything bought on e-Buy is brought by the moose courier.
// Small orders come by bicycle: he pedals down the bears' mountain trail,
// rings the bell, skids to a stop in front of the hut, tosses the parcel,
// waves and rides back up the trail. Big orders (3+ items, or livestock)
// come in the Moose Express van: it drives down, swings round beside the
// hut, opens its back doors and rolls 2-4 parcels (or one big crate) down
// the ramp, honks and drives back up the trail. Parcels then sit quietly
// (a soft glint now and then) until you tap them: eggs and live fish go to
// the pond, everything else into your inventory / food bag.
import * as THREE from 'three';
import { HUT } from '../world/worldgen.js';
import { WATER_Y } from '../world/grid.js';

const mods = import.meta.glob('../entities/critters3d.js', { eager: true });
const C3 = mods['../entities/critters3d.js'] || null;
const vanMods = import.meta.glob('../entities/deliveryVan.js', { eager: true });
const VANM = vanMods['../entities/deliveryVan.js'] || null;

const SPEED = 6.5; // bike
const VAN_SPEED = 6; // van cruising speed
const VAN_SLOW = 2.6; // round the hairpins
const VAN_ACCEL = 3.2, VAN_BRAKE = 4.2;
const VAN_ITEMS = 3; // this many things (or any livestock) and the van comes
const VAN_MAX_ORDERS = 6;
const VAN_PARCEL_SCALE = 1.6; // van-sized boxes

const FRAGILE = (it) => it.kind === 'egg' || it.kind === 'fish';
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _v = new THREE.Vector3();

// "Pellets ×3" -> 3
const labelQty = (label) => Math.max(1, +(/×(\d+)\s*$/.exec(label || '')?.[1] || 1));
// how many things an order is (a ×3 food bag counts 3)
function unitsOf(o) {
  let n = 0;
  for (const it of o.items) n += it.kind === 'item' ? it.qty || 1 : it.kind === 'food' ? labelQty(o.label) : 1;
  return n;
}
// one entry per thing, so a big box can be split over several parcels
function splitUnits(items, label) {
  const out = [];
  const xN = labelQty(label);
  for (const it of items) {
    if (it.kind === 'item' && (it.qty || 1) > 1) for (let k = 0; k < it.qty; k++) out.push({ ...it, qty: 1 });
    else if (it.kind === 'food' && xN > 1 && (it.n || 1) >= xN) {
      const each = Math.floor(it.n / xN);
      for (let k = 0; k < xN; k++) out.push({ ...it, n: k === xN - 1 ? it.n - each * (xN - 1) : each });
    } else out.push({ ...it });
  }
  return out;
}
function mergeUnits(units) {
  const out = [];
  for (const u of units) {
    const same = out.find((o) => o.kind === u.kind && ((u.kind === 'item' && o.type === u.type) || (u.kind === 'food' && o.id === u.id)));
    if (same && u.kind === 'item') same.qty = (same.qty || 1) + (u.qty || 1);
    else if (same && u.kind === 'food') same.n = (same.n || 0) + (u.n || 0);
    else out.push({ ...u });
  }
  return out;
}

// A polyline with arc length: pointAt(s), length.
function polyPath(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return {
    pts, cum, length: cum[cum.length - 1],
    pointAt(s, out = { x: 0, z: 0 }) {
      s = clamp(s, 0, this.length);
      let lo = 0, hi = cum.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
      const L = cum[hi] - cum[lo] || 1, k = (s - cum[lo]) / L;
      out.x = pts[lo].x + (pts[hi].x - pts[lo].x) * k;
      out.z = pts[lo].z + (pts[hi].z - pts[lo].z) * k;
      return out;
    },
  };
}

function fallbackPackage(kind) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.36), new THREE.MeshLambertMaterial({ color: kind === 'egg_crate' ? 0xd8b070 : 0xb8865a }));
  box.position.y = 0.15;
  box.castShadow = true;
  const tape = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.08), new THREE.MeshLambertMaterial({ color: 0xe8d8a0 }));
  tape.position.y = 0.31;
  g.add(box, tape);
  return g;
}

function fallbackCourier() {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.9), new THREE.MeshLambertMaterial({ color: 0x7a5434 }));
  body.position.y = 0.9;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.4, 0.6), new THREE.MeshLambertMaterial({ color: 0x3a6ad0 }));
  vest.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.5), new THREE.MeshLambertMaterial({ color: 0x8a6040 }));
  head.position.set(0, 1.45, 0.3);
  const bike = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 12), new THREE.MeshLambertMaterial({ color: 0x303030 }));
  bike.position.set(0, 0.3, 0.45); bike.rotation.y = Math.PI / 2;
  const bike2 = bike.clone(); bike2.position.z = -0.45;
  root.add(body, vest, head, bike, bike2);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, play() {}, update() {}, hold() {}, current: 'ride' };
}

export class Delivery {
  constructor(game) {
    this.game = game;
    this.queue = []; // orders waiting for a courier
    this.active = null; // the courier run in progress (bike or van)
    this.parcels = []; // packages lying on the ground
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.nextId = 1;
    this.wait = 0;
    this.recent = []; // delivered orders shown briefly in the tracker
  }

  get dropPoint() { return { x: HUT.x + 1.5, z: HUT.z + 4.8 }; }
  // the van parks beside the hut facing east, back doors toward the drop point
  get vanPark() { return { x: HUT.x + 3.7, z: HUT.z + 5.4 }; }

  // items: [{ kind: 'egg', species, genes, t } | { kind: 'item', type, qty, label }]
  // Every order is first packed at the e-Buy warehouse (a few seconds per
  // item), then the moose brings it over. tracker() reports each order's
  // phase and ETA for the HUD.
  order(items, { label = 'Package', fast = false } = {}) {
    const n = items.reduce((a, it) => a + (it.qty || 1), 0);
    const fragile = items.some((it) => it.kind === 'egg' || it.kind === 'bird' || it.kind === 'fish');
    const packT = fast ? 2 : Math.min(30, 7 + n * 2.5 + (fragile ? 3 : 0) + Math.random() * 3);
    const o = { id: this.nextId++, items, label, packT, packTotal: packT };
    this.queue.push(o);
    this.game.emit('ordered', o);
    return o;
  }

  pending() { return this.queue.length + (this.active ? this.active.orders.length : 0); }

  // length of the courier's route (cached), for ETAs
  routeLength() {
    if (this._routeLen) return this._routeLen;
    const path = this.buildPath();
    let L = 0;
    for (let i = 1; i < path.length; i++) L += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    this._routeLen = L;
    return L;
  }

  // the upper half of the bears' trail, top first
  trailTop() {
    const trail = this.game.world.trail;
    return trail.slice(Math.floor(trail.length * 0.5)).map((p) => ({ x: p[0], y: p[1], z: p[2] }));
  }

  buildPath() {
    const path = this.trailTop();
    const end = path[path.length - 1];
    const d = this.dropPoint;
    path.push({ x: (end.x + d.x) / 2, y: 0, z: (end.z + d.z) / 2 + 1 }, { x: d.x - 1.2, y: 0, z: d.z + 0.6 });
    return path;
  }

  // The van's routes: down the trail, past the pond and the hut's west wall,
  // round to the parking spot; out east of the hut, behind it, back up the trail.
  vanRoute(dir) {
    const H = HUT, P = this.vanPark;
    const top = this.trailTop();
    if (dir === 'in') {
      return polyPath([...top, { x: H.x - 1.5, z: H.z - 11 }, { x: H.x - 1.4, z: H.z - 4 }, { x: H.x - 1.3, z: H.z + 1.5 }, { x: H.x - 0.7, z: H.z + 4.8 }, { x: H.x + 0.6, z: P.z }, { x: P.x - 1.2, z: P.z }, { x: P.x, z: P.z }]);
    }
    return polyPath([{ x: P.x, z: P.z }, { x: P.x + 1.4, z: P.z - 0.1 }, { x: H.x + 5.7, z: H.z + 4.2 }, { x: H.x + 5.8, z: H.z + 0.5 }, { x: H.x + 5, z: H.z - 2.4 }, { x: H.x + 2, z: H.z - 3.8 }, { x: H.x - 1.4, z: H.z - 6 }, { x: H.x - 1.5, z: H.z - 11 }, ...top.reverse()]);
  }

  vanRouteLength() {
    if (!this._vanLen) this._vanLen = this.vanRoute('in').length;
    return this._vanLen;
  }

  // [{ id, label, phase: packing|riding|arriving|delivered, eta (s, -1 = after sunrise), progress, count }]
  tracker() {
    const out = [];
    const seen = new Set();
    const push = (o) => { if (!seen.has(o.id)) { seen.add(o.id); out.push(o); } };
    const ride = this.routeLength() / SPEED + 3;
    const canRide = this.canRide();
    const a = this.active;
    let wait = 0; // a queued order also waits for the courier that's already out
    if (a) {
      const rem = this.remaining(a);
      const van = a.kind === 'van';
      const coming = van ? a.state === 'drive' || a.state === 'park' || a.state === 'open' || a.state === 'unload' : a.state === 'ride' || a.state === 'brake' || a.state === 'toss';
      const sp = van ? VAN_SPEED : SPEED;
      let eta = 0.6;
      if (van) eta = a.state === 'drive' ? rem / sp + 3 : a.state === 'park' || a.state === 'open' ? 2.5 : 1;
      else eta = a.state === 'ride' ? rem / sp + 1.5 : a.state === 'brake' ? 1.2 : 0.6;
      const moving = van ? a.state === 'drive' : a.state === 'ride';
      const phase = moving && rem > 9 ? 'riding' : 'arriving';
      const prog = 0.35 + 0.65 * Math.max(0, Math.min(1, 1 - (eta - 1) / ride));
      if (coming) for (const o of a.orders) push({ id: o.id, label: o.label, phase, eta, progress: prog, count: o.items.length });
      wait = coming ? eta + 6 + (van ? this.vanRouteLength() : this.routeLength()) / sp : rem / sp + 1;
    }
    for (const o of this.queue) {
      const pk = Math.max(0, o.packT);
      const eta = canRide ? Math.max(pk, wait) + ride : -1;
      const prog = 0.35 * (1 - pk / (o.packTotal || 1));
      push({ id: o.id, label: o.label, phase: 'packing', eta, progress: prog, count: o.items.length });
    }
    for (const p of this.parcels) push({ id: p.order.id, label: p.order.parent?.label || p.order.label, phase: 'delivered', eta: 0, progress: 1, count: (p.order.parent || p.order).items.length });
    for (const d of this.recent) push(d);
    return out;
  }

  // distance left on the courier's current path
  remaining(a) {
    if (a.kind === 'van') return a.path ? Math.max(0, a.path.length - a.s) : 0;
    if (a.state !== 'ride' && a.state !== 'leave') return 0;
    let rem = 0;
    for (let i = a.i; i < a.path.length; i++) {
      const p0 = i === a.i ? a : a.path[i - 1];
      rem += Math.hypot(a.path[i].x - p0.x, a.path[i].z - p0.z);
    }
    return rem;
  }

  makeCourier() {
    if (C3?.MooseCourier) {
      try { return new C3.MooseCourier(); } catch (e) { console.warn('MooseCourier failed', e); }
    }
    return fallbackCourier();
  }

  makePackage(kind) {
    if (kind === 'crate_live' || kind === 'crate_eggs') {
      if (VANM?.makeBigCrate) { try { return VANM.makeBigCrate(kind === 'crate_eggs' ? 'eggs' : 'live'); } catch { /* fall back */ } }
      const g = fallbackPackage('egg_crate');
      g.scale.setScalar(1.4);
      return g;
    }
    if (C3?.makePackage) {
      try { return C3.makePackage(kind); } catch { /* fall back */ }
    }
    return fallbackPackage(kind);
  }

  canRide() {
    const ph = this.game.state.phase;
    return ph === 'day' || ph === 'morning' || ph === 'evening';
  }

  // what's packed goes out next: a big load (or any livestock) by van, the rest by bike
  start() {
    const ready = this.queue.filter((o) => o.packT <= 0);
    if (!ready.length) return;
    const units = ready.slice(0, VAN_MAX_ORDERS).reduce((n, o) => n + unitsOf(o), 0);
    const heavy = ready.some((o) => o.items.some((it) => it.kind === 'bird'));
    if (VANM?.DeliveryVan && (units >= VAN_ITEMS || heavy)) {
      const orders = ready.slice(0, VAN_MAX_ORDERS);
      try { this.startVan(orders); return; } catch (e) { console.warn('Moose Express van failed, sending the bike', e); this.active = null; }
    }
    this.startBike(ready.slice(0, 3));
  }

  takeOrders(orders) { this.queue = this.queue.filter((o) => !orders.includes(o)); }

  // the camera rides along (any manual pan frees it again)
  followCam(zoom) {
    const game = this.game, ui = game.ui;
    const idle = performance.now() - (game.rig.userCamT || 0) > 6000; // never yank a camera the player is using
    if (ui && idle && !game.cine?.active && !ui.blueprint?.open && !game.lab?.active && game.state.phase !== 'rush') {
      this.prevCam = { x: game.rig.goal.x, z: game.rig.goal.z, wupp: game.rig.wuppGoal };
      const a = this.active;
      setTimeout(() => { if (this.active === a && a && !ui.ebuy) ui.trackEntity(a, { label: 'Moose Express', kind: 'moose', zoom }); }, 400);
    }
  }

  // the courier is done: settle the camera on the parcels
  releaseCam(x, z) {
    const game = this.game, ui = game.ui;
    if (ui?.tracking?.kind === 'moose') { ui.stopTracking(); game.rig.lookAt(x, z); game.rig.wuppGoal = 0.026; }
  }

  startBike(orders) {
    const rig = this.makeCourier();
    this.group.add(rig.root);
    this.takeOrders(orders);
    const path = this.buildPath();
    this.active = { kind: 'bike', rig, orders, path, i: 0, x: path[0].x, y: path[0].y, z: path[0].z, state: 'ride', t: 0, heading: 0, pop: 0 };
    rig.root.scale.setScalar(0.01);
    rig.play?.('ride', { loop: true });
    this.followCam(0.024);
    this.game.audio.play('bell', { volume: 0.3, pitch: 1.8 });
  }

  startVan(orders) {
    const van = new VANM.DeliveryVan();
    const rig = this.makeCourier();
    try {
      van.setDriver(rig.reach ? rig : null);
      if (!rig.reach) { van.seat.add(rig.root); rig.root.scale.setScalar(0.8); }
      van.onEvent = (name) => this.onVanEvent(name);
      this.group.add(van.root);
      van.root.rotation.order = 'YXZ'; // yaw, then pitch along the slope
      const path = this.vanRoute('in');
      const a = { kind: 'van', van, rig, orders, lots: this.packLots(orders), path, s: 0, v: VAN_SPEED * 0.8, x: 0, y: 0, z: 0, heading: 0, pitch: 0, state: 'drive', t: 0, pop: 0 };
      this.active = a;
      this.placeVan(a, 0, true);
      van.root.scale.setScalar(0.01);
      van.snap();
      this.takeOrders(orders);
      this.followCam(0.028);
      this.game.audio.play('van_start', { volume: 0.4 });
      this.game.audio.play('van_horn', { volume: 0.18, pitch: 1.05 });
    } catch (e) {
      van.dispose?.(); rig.dispose?.();
      throw e;
    }
  }

  // What comes out of the van: livestock in one big crate, eggs / live fish in
  // a crate, everything else in boxes (split up so there's a little pile).
  // Each parcel carries its own slice of the order (same id) for the unboxing.
  packLots(orders) {
    const lots = [];
    for (const o of orders) {
      const birds = o.items.filter((it) => it.kind === 'bird');
      const fragile = o.items.filter(FRAGILE);
      const rest = o.items.filter((it) => it.kind !== 'bird' && !FRAGILE(it));
      if (birds.length) lots.push({ order: o, kind: 'crate_live', units: birds });
      if (fragile.length) lots.push({ order: o, kind: fragile.length >= 3 ? 'crate_eggs' : 'egg_crate', units: fragile });
      if (rest.length) lots.push({ order: o, kind: 'box', units: splitUnits(rest, o.label), split: true });
    }
    for (let guard = 0; guard < 8 && lots.length < 4; guard++) {
      const big = lots.filter((l) => l.split && l.units.length > 1).sort((p, q) => q.units.length - p.units.length)[0];
      if (!big) break;
      const other = { order: big.order, kind: 'box', units: big.units.splice(Math.ceil(big.units.length / 2)), split: true };
      lots.splice(lots.indexOf(big) + 1, 0, other);
    }
    for (const l of lots) {
      const o = l.order;
      const parts = lots.filter((q) => q.order === o);
      const items = l.split ? mergeUnits(l.units) : l.units;
      const k = parts.indexOf(l);
      l.sub = { id: o.id, label: parts.length > 1 ? `${o.label} (${k + 1}/${parts.length})` : o.label, items, parent: o };
    }
    return lots;
  }

  update(dt) {
    for (const o of this.queue) o.packT -= dt;
    if (!this.active) {
      this.wait -= dt;
      if (this.wait <= 0 && this.canRide() && this.queue.some((o) => o.packT <= 0)) this.start();
    } else if (this.active.kind === 'van') this.updateVan(dt);
    else this.updateCourier(dt);
    this.updateParcels(dt);
    for (const d of this.recent) d.t -= dt;
    this.recent = this.recent.filter((d) => d.t > 0);
  }

  // shrink away with a puff of dust, then gone for good
  vanish(a, dt) {
    a.t += dt;
    const root = a.kind === 'van' ? a.van.root : a.rig.root;
    root.scale.setScalar(Math.max(0.001, 1 - (a.t / 0.45) ** 2));
    if (a.t < 0.45) return false;
    if (a.kind === 'van') { a.van.dispose(); a.rig.dispose?.(); }
    else { this.group.remove(a.rig.root); a.rig.dispose?.(); }
    this.active = null;
    this.wait = 1;
    return true;
  }

  updateCourier(dt) {
    const game = this.game;
    const a = this.active;
    const r = a.rig;
    a.t += dt;
    if (a.state === 'gone') { if (this.vanish(a, dt)) return; }
    const g = game.grid;
    // pop in at the top of the trail
    if (a.pop < 1) { a.pop = Math.min(1, a.pop + dt / 0.35); r.root.scale.setScalar(Math.max(0.01, a.pop)); }
    if (a.state === 'ride' || a.state === 'leave') {
      const tgt = a.path[a.i];
      const dx = tgt.x - a.x, dz = tgt.z - a.z;
      const dist = Math.hypot(dx, dz);
      const step = SPEED * dt;
      if (dist <= step) {
        a.x = tgt.x; a.z = tgt.z;
        a.i += 1;
        if (a.i >= a.path.length) {
          if (a.state === 'ride') { a.state = 'brake'; a.t = 0; r.play?.('brake', { loop: false }); game.audio.play('whoosh', { volume: 0.3, pitch: 0.7 }); game.particles.dust(a.x, 0.1, a.z, 6); }
          else {
            // back at the top of the trail: off he goes
            a.state = 'gone'; a.t = 0;
            game.particles.puff(a.x, a.y + 0.3, a.z, 8, 0.3);
          }
        }
      } else {
        a.x += (dx / dist) * step; a.z += (dz / dist) * step;
        a.heading = Math.atan2(dx, dz);
        if (Math.random() < dt * 6) game.particles.dust(a.x, a.y + 0.05, a.z, 1);
      }
      const ix = Math.floor(a.x), iz = Math.floor(a.z);
      const gy = g.inb(ix, iz) ? Math.max(g.surfaceY(ix, iz), WATER_Y) : 0;
      a.y += (gy - a.y) * Math.min(1, dt * 10);
      if (a.state === 'ride' && a.i === a.path.length - 1 && dist < 6 && !a.rang) { a.rang = true; r.play?.('ring_bell', { loop: false, onDone: () => r.play?.('ride', { loop: true }) }); game.audio.play('bell', { volume: 0.45, pitch: 1.8 }); game.say?.(this.speaker(), 'Moose Express!', { voice: 'moose', mood: 'excited', dur: 1.8 }); }
    } else if (a.state === 'brake') {
      if (a.t > 0.6) {
        a.state = 'toss'; a.t = 0;
        r.play?.('toss_package', { loop: false });
        game.audio.play('whoosh', { volume: 0.4 });
        const d = this.dropPoint;
        for (const [k, o] of a.orders.entries()) {
          const kind = o.items.some((it) => it.kind === 'egg' || it.kind === 'bird' || it.kind === 'fish') ? 'egg_crate' : 'box';
          const obj = this.makePackage(kind);
          this.group.add(obj);
          const tx = d.x + (k - (a.orders.length - 1) / 2) * 0.9, tz = d.z + (Math.random() - 0.5) * 0.5;
          this.parcels.push({ order: o, obj, kind, base: obj.scale.x, x: a.x, y: a.y + 1.3, z: a.z, x0: a.x, y0: a.y + 1.3, z0: a.z, x1: tx, z1: tz, t: -k * 0.25, state: 'fly', rot: Math.random() * 6 });
        }
      }
    } else if (a.state === 'toss') {
      if (a.t > 0.9 && !a.waved) { a.waved = true; r.play?.('wave', { loop: false }); game.say?.(this.speaker(), pick(['Sign here! ...nah.', 'Fresh from e-Buy!', 'Handle with care!', 'Have a moose-tastic day!']), { voice: 'moose', mood: 'happy', dur: 2 }); }
      if (a.t > 2.4) {
        // ride back up the trail (the camera stays with the parcels)
        a.state = 'leave'; a.t = 0;
        this.releaseCam(this.dropPoint.x, this.dropPoint.z);
        r.play?.('ride_away', { loop: true });
        a.path = a.path.slice().reverse();
        a.i = 1;
        game.particles.dust(a.x, a.y + 0.05, a.z, 4);
      }
    }
    r.root.position.set(a.x, a.y, a.z);
    r.root.rotation.y = a.heading;
    r.update?.(dt);
  }

  // ---------------------------------------------------------------- the van
  groundY(x, z) {
    const g = this.game.grid;
    const h = g.surfaceAtVisual ? g.surfaceAtVisual(x, z) : g.groundAt(x, z);
    return Math.max(Number.isFinite(h) ? h : 0, WATER_Y);
  }

  // put the van on its path at arc length a.s: heading from a look-ahead, height + pitch from the ground under the axles
  placeVan(a, dt, snap = false) {
    const P = a.path, van = a.van, V = VANM.VAN;
    const p = P.pointAt(a.s), f = P.pointAt(a.s + 1.2), b = P.pointAt(a.s - 0.4);
    a.x = p.x; a.z = p.z;
    if (Math.hypot(f.x - b.x, f.z - b.z) > 1e-3) {
      const hd = Math.atan2(f.x - b.x, f.z - b.z);
      a.heading = snap ? hd : a.heading + wrapA(hd - a.heading) * Math.min(1, dt * 7);
    }
    const sx = Math.sin(a.heading), cz = Math.cos(a.heading);
    const yf = this.groundY(a.x + sx * V.frontZ, a.z + cz * V.frontZ), yr = this.groundY(a.x + sx * V.rearZ, a.z + cz * V.rearZ);
    const gy = (yf + yr) / 2, pitch = clamp(-Math.atan2(yf - yr, V.wheelbase), -0.32, 0.32);
    if (snap) { a.y = gy; a.pitch = pitch; } else { a.y += (gy - a.y) * Math.min(1, dt * 10); a.pitch += (pitch - a.pitch) * Math.min(1, dt * 8); }
    van.root.position.set(a.x, a.y, a.z);
    van.root.rotation.set(a.pitch, a.heading, 0);
  }

  // drive along the path: cruise, ease off for the hairpins, brake for the end
  driveVan(a, dt) {
    const P = a.path;
    const rem = P.length - a.s;
    const p0 = P.pointAt(a.s), p1 = P.pointAt(a.s + 1.5), p2 = P.pointAt(a.s + 4);
    const turn = Math.abs(wrapA(Math.atan2(p2.x - p1.x, p2.z - p1.z) - Math.atan2(p1.x - p0.x, p1.z - p0.z)));
    let target = Math.min(VAN_SPEED, Math.max(VAN_SLOW, VAN_SPEED - turn * 4.5));
    target = Math.min(target, Math.sqrt(2 * VAN_BRAKE * rem) + 0.15); // creeps the last bit, never stalls
    a.v += clamp(target - a.v, -VAN_BRAKE * 1.6 * dt, VAN_ACCEL * dt);
    a.s = Math.min(P.length, a.s + Math.max(0.15, a.v) * dt);
    this.placeVan(a, dt);
    // dust from the back wheels
    if (a.v > 1 && Math.random() < dt * 9 * (a.v / VAN_SPEED)) {
      a.van.wheelWorld(2 + (Math.random() < 0.5 ? 0 : 1), _v);
      this.game.particles.dust(_v.x, _v.y, _v.z, 1);
    }
    if (P.length - a.s > 0.01) return false;
    a.v = 0;
    return true;
  }

  onVanEvent(name) {
    const game = this.game, a = this.active;
    if (!a || a.kind !== 'van') return;
    if (name === 'honk') {
      game.audio.play('van_horn', { volume: 0.4 });
      // a couple of little notes pop out of the cab
      const fx = Math.sin(a.heading) * 0.5, fz = Math.cos(a.heading) * 0.5;
      game.particles.notes?.(a.x + fx, a.y + 2.1, a.z + fz, 1);
    }
    else if (name === 'door_open') game.audio.play('van_door', { volume: 0.35 });
    else if (name === 'ramp_down') { game.audio.play('van_ramp', { volume: 0.4 }); const v = a.van; v.unloadPoint(0.62, 0, 0, _v); game.particles.dust(_v.x, _v.y, _v.z, 3); }
    else if (name === 'door_shut') game.audio.play('van_shut', { volume: 0.4 });
  }

  updateVan(dt) {
    const game = this.game;
    const a = this.active, van = a.van, r = a.rig;
    a.t += dt;
    if (a.pop < 1) { a.pop = Math.min(1, a.pop + dt / 0.4); van.root.scale.setScalar(Math.max(0.01, 1 - (1 - a.pop) ** 2)); }
    if (a.state === 'drive') {
      if (!a.honked && a.path.length - a.s < 9) {
        a.honked = true; van.honk();
        game.say?.(this.speaker(), pick(['Moose Express! Big one today!', 'Beep beep! Moose Express!', 'Special delivery!']), { voice: 'moose', mood: 'excited', dur: 2 });
      }
      if (this.driveVan(a, dt)) { a.state = 'park'; a.t = 0; game.particles.dust(a.x, a.y + 0.05, a.z, 4); }
    } else if (a.state === 'park') {
      if (a.t > 0.55) { a.state = 'open'; a.t = 0; van.openBack(); r.play?.('drive_look', { fade: 0.3 }); }
    } else if (a.state === 'open') {
      if (van.backReady || a.t > 4) { a.state = 'unload'; a.t = 0; a.next = 0.15; a.out = 0; }
    } else if (a.state === 'unload') {
      // roll the parcels out one at a time, fanned out behind the ramp
      const n = a.lots.length;
      if (a.out < n && a.t >= a.next) {
        const lot = a.lots[a.out];
        const k = a.out++;
        const big = lot.kind === 'crate_live' || lot.kind === 'crate_eggs';
        const obj = this.makePackage(lot.kind);
        if (!big) obj.scale.multiplyScalar(VAN_PARCEL_SCALE);
        obj.rotation.order = 'YXZ';
        obj.visible = false;
        this.group.add(obj);
        // a staggered little pile trailing back from the ramp (so the TAP! tags don't all stack up)
        const spread = n > 1 ? (k % 2 ? 0.42 : -0.42) + (Math.random() - 0.5) * 0.12 : 0;
        const tz = VANM.VAN.rampEndZ - (big ? 0.55 : 0.35) - k * 0.62 - Math.random() * 0.08;
        this.parcels.push({ order: lot.sub, obj, kind: lot.kind, base: obj.scale.x, van, tx: spread, tz, x: a.x, y: a.y, z: a.z, t: 0, dur: (big ? 1.35 : 1.0) + k * 0.28, state: 'slide', rot: 0 });
        a.next = a.t + (big ? 1.0 : 0.62);
        if (k === 0) game.say?.(this.speaker(), pick(['Comin\' through!', 'Watch your toes!', 'Wheee, parcels!', 'Fresh from e-Buy!']), { voice: 'moose', mood: 'happy', dur: 1.8 });
      }
      const sliding = this.parcels.some((p) => p.van === van && p.state === 'slide');
      if (a.out >= n && !sliding) {
        a.closeT = (a.closeT || 0) + dt;
        if (a.closeT > 0.45) { a.state = 'close'; a.t = 0; van.closeBack(); r.play?.('drive', { fade: 0.3 }); }
      }
    } else if (a.state === 'close') {
      if (van.backShut || a.t > 4) {
        a.state = 'bye'; a.t = 0; van.honk();
        game.say?.(this.speaker(), pick(['Have a moose-tastic day!', 'Sign here! ...nah.', 'Handle with care!', 'Toot toot! See ya!']), { voice: 'moose', mood: 'happy', dur: 2.2 });
      }
    } else if (a.state === 'bye') {
      if (a.t > 0.75 && !a.waved) { a.waved = true; r.play?.('drive_wave', { fade: 0.2 }); }
      if (a.t > 1.9) {
        // back up the trail; the camera stays on the parcels
        a.state = 'leave'; a.t = 0;
        const mine = this.parcels.filter((p) => p.van === van);
        const cx = mine.length ? mine.reduce((s, p) => s + p.x, 0) / mine.length : this.dropPoint.x;
        const cz = mine.length ? mine.reduce((s, p) => s + p.z, 0) / mine.length : this.dropPoint.z;
        this.releaseCam(cx, cz);
        a.path = this.vanRoute('out'); a.s = 0; a.v = 0;
        game.audio.play('van_start', { volume: 0.3, pitch: 1.1 });
      }
    } else if (a.state === 'leave') {
      if (this.driveVan(a, dt)) { a.state = 'gone'; a.t = 0; game.particles.puff(a.x, a.y + 0.4, a.z, 10, 0.4); }
    } else if (a.state === 'gone') {
      if (this.vanish(a, dt)) return;
    }
    van.update(dt);
  }

  // eggs hop out of (x,y,z) and arc into the pond
  dropEggs(x, y, z, items, near = null) {
    const game = this.game;
    const g = game.grid;
    items.forEach((it, k) => {
      let w = null;
      if (near) {
        for (let n = 0; n < 8 && !w; n++) {
          const qx = near.x + (Math.random() - 0.5) * 2.4, qz = near.z + (Math.random() - 0.5) * 2.4;
          if (g.isWater(Math.floor(qx), Math.floor(qz)) && g.meadow[Math.floor(qz) * g.w + Math.floor(qx)]) w = { x: qx, z: qz };
        }
      }
      w ||= game.fish.randomWaterPoint();
      if (!w) return;
      game.particles.spawnArc?.(x, y + 0.4, z, w.x, WATER_Y, w.z);
      setTimeout(() => {
        if (it.kind === 'fish') {
          // a live fish plops out of the bag into its new home
          const f = game.fish.spawn(it.species, w.x, w.z, { adult: true, hunger: 0.55, g: it.genes, splash: true });
          if (f) {
            f.fed = 0; f.loveT = 4 + Math.random() * 3;
            const st = game.state;
            if (!st.discovered.includes(it.species)) st.discovered.push(it.species);
            game.particles.hearts(w.x, WATER_Y + 0.3, w.z, 3);
            game.ui?.floatTextAt?.(w.x, 0.7, w.z, it.genes?.sex === 'F' ? '♀ Hello!' : '♂ Hello!', it.genes?.sex === 'F' ? '#ffb0d8' : '#9ad4ff');
            game.emit('fishArrived', f);
          }
          return;
        }
        const e = game.fish.addBoughtEgg(it.species, it.genes, it.t, w);
        if (e) { game.particles.sparkle(w.x, WATER_Y + 0.2, w.z, 8, 0xfff2a0); game.particles.splash(w.x, w.z, 6, 0.5); }
        game.emit('eggInPond', e);
      }, 350 + k * 160);
    });
  }

  // something the bubble system can follow
  speaker() {
    const a = this.active;
    const h = a?.kind === 'van' ? 2.6 : 2.1;
    return { getWorldPos: (v) => (a && this.active === a ? v.set(a.x, a.y + h, a.z) : v.set(0, -99, 0)) };
  }

  updateParcels(dt) {
    const game = this.game;
    for (let i = this.parcels.length - 1; i >= 0; i--) {
      const p = this.parcels[i];
      p.t += dt;
      const b = p.base || 1;
      if (p.state === 'fly') {
        if (p.t < 0) { p.obj.visible = false; continue; }
        p.obj.visible = true;
        const k = Math.min(1, p.t / 0.7);
        p.x = p.x0 + (p.x1 - p.x0) * k;
        p.z = p.z0 + (p.z1 - p.z0) * k;
        const gy = game.grid.groundAt(p.x1, p.z1);
        p.y = p.y0 + (gy - p.y0) * k + Math.sin(k * Math.PI) * 1.4;
        p.rot += dt * 9;
        if (k >= 1) this.landParcel(p, gy);
      } else if (p.state === 'slide') {
        // out of the van, down the roller ramp, a little skid on the grass
        const k = Math.min(1, p.t / p.dur);
        p.obj.visible = true;
        p.van.unloadPoint(k, p.tx, p.tz, _v);
        p.x = _v.x; p.y = _v.y; p.z = _v.z;
        const ramp = k > 0.3 && k < 0.62 ? 1 : 0;
        p.tilt = (p.tilt || 0) + (-VANM.VAN.rampAngle * ramp - (p.tilt || 0)) * Math.min(1, dt * 18);
        p.obj.rotation.set(p.tilt, p.van.root.rotation.y + Math.sin(k * Math.PI) * 0.25 * Math.sign(p.tx || 0.5), 0);
        if (!p.rolled && k > 0.3) { p.rolled = true; game.audio.play('van_roll', { volume: 0.3, pitch: 0.9 + Math.random() * 0.2 }); }
        if (k >= 1) { p.obj.rotation.x = 0; p.van = null; this.landParcel(p, p.y); }
      } else if (p.state === 'land') {
        // a soft squash as it settles
        const s = 1 + Math.sin(p.t * 18) * 0.22 * Math.max(0, 1 - p.t * 2.2);
        p.obj.scale.set(b / Math.sqrt(s), b * s, b / Math.sqrt(s));
        // then it sits there waiting for you to tap it and unbox it
        if (p.t > 0.7) { p.state = 'wait'; p.t = 0; p.obj.scale.setScalar(b); p.glint = 0.8 + Math.random() * 1.5; game.emit('parcelLanded', p); }
      } else if (p.state === 'wait') {
        // no knocking about: just a little glint now and then so you can spot it
        p.glint -= dt;
        if (p.glint <= 0) {
          p.glint = 3.2 + Math.random() * 2.4;
          const big = p.kind === 'crate_live' || p.kind === 'crate_eggs';
          const top = big ? 0.5 : (p.kind === 'box' ? 0.18 : 0.16) * b;
          const ox = (Math.random() - 0.5) * 0.12 * b, oz = (Math.random() - 0.5) * 0.12 * b;
          game.particles.sparkle(p.x + ox, p.y + top, p.z + oz, 1, 0xfff6c8);
        }
      }
      p.obj.position.set(p.x, p.y, p.z);
      if (p.state === 'fly') p.obj.rotation.y = p.rot;
    }
  }

  landParcel(p, gy) {
    const game = this.game;
    const big = p.kind === 'crate_live' || p.kind === 'crate_eggs';
    p.state = 'land'; p.t = 0; p.y = gy;
    game.particles.dust(p.x, gy + 0.05, p.z, big ? 7 : 4);
    if (big) game.audio.play('crate_drop', { volume: 0.5 });
    else game.audio.play('drop', { volume: 0.35 });
  }

  // tapped + unboxed: what's inside comes out (eggs go to the fox, who carries them to the pond)
  unbox(p) {
    const i = this.parcels.indexOf(p);
    if (i < 0 || p.opened) return false;
    p.opened = true;
    this.openParcel(p, i);
    return true;
  }

  waiting() { return this.parcels.filter((p) => p.state === 'wait' && !p.opened); }

  openParcel(p, i) {
    const game = this.game;
    this.parcels.splice(i, 1);
    this.group.remove(p.obj);
    game.particles.puff(p.x, p.y + 0.3, p.z, 12, 0.4);
    game.particles.confetti(p.x, p.y + 0.4, p.z, 18);
    game.audio.play('pop_in', { volume: 0.5 });
    // eggs and live fish: Reynard carries them down to the water
    const eggItems = p.order.items.filter((it) => it.kind === 'egg' || it.kind === 'fish');
    if (eggItems.length) {
      // Reynard picks the egg crate up and carries it down to the water
      if (game.fox?.carryEggs) game.fox.carryEggs(p.x, p.z, eggItems);
      else this.dropEggs(p.x, p.y, p.z, eggItems);
    }
    for (const it of p.order.items) {
      if (it.kind === 'egg' || it.kind === 'fish') {
        continue;
      } else if (it.kind === 'food') {
        game.foodStore.add(it.id, it.n || 1);
        game.particles.sparkle(p.x, p.y + 0.5, p.z, 8, 0xfff2a0);
        game.ui?.floatTextAt?.(p.x, p.y + 1, p.z, `+${it.n} ${game.foodStore.info(it.id)?.name || ''}`, '#fff3a0');
        game.emit('foodDelivered', it);
      } else if (it.kind === 'bird') {
        // the crate flaps open and out waddles your new duck/goose
        game.livestock?.spawnBought(it.breed, it.sex);
      } else if (it.kind === 'upgrade') {
        game.state.beaverLevel = Math.max(game.state.beaverLevel || 1, it.level);
        game.particles.confetti(p.x, p.y + 0.6, p.z, 30);
        game.audio.play('levelup', { volume: 0.5 });
        game.notify(`Beaver tools Lv${it.level}! They can tear down more now.`, 'excited');
        for (const b of game.beavers.list) b.cheerT = 1.2;
        game.emit('beavers', game.beavers.count());
      } else {
        const inv = (game.state.inventory ||= {});
        inv[it.type] = (inv[it.type] || 0) + (it.qty || 1);
        game.particles.sparkle(p.x, p.y + 0.5, p.z, 8, 0xfff2a0);
        game.emit('inventory', inv);
      }
    }
    const whole = p.order.parent || p.order;
    if (!this.parcels.some((q) => q.order.id === p.order.id)) this.recent.push({ id: whole.id, label: whole.label, phase: 'delivered', eta: 0, progress: 1, count: whole.items.length, t: 2.5 });
    game.emit('delivered', p.order);
  }

  serialize() {
    // queued orders, what the courier still carries, and the parcels on the ground (each counted once)
    const a = this.active;
    const out = (o) => this.parcels.some((p) => (p.order.parent || p.order) === o);
    const all = [...this.queue];
    if (a) {
      for (const o of a.orders) if (!out(o)) all.push(o);
      // a van that's mid-unload: what's still inside goes back on the list
      if (a.kind === 'van' && a.out) for (const l of a.lots.slice(a.out)) if (out(l.order)) all.push(l.sub);
    }
    all.push(...this.parcels.map((p) => p.order));
    return all.map((o) => ({ items: o.items, label: o.label, packT: Math.max(0, o.packT || 0) }));
  }

  load(list) {
    this.queue = (list || []).map((o) => ({ id: this.nextId++, items: o.items, label: o.label, packT: o.packT || 3, packTotal: Math.max(3, o.packT || 3) }));
    this.wait = 3;
  }
}

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
