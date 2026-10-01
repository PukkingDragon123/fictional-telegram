// Moose Express: everything bought on e-Buy arrives by bicycle. The moose
// courier pedals down the bears' mountain trail, skids to a stop in front of
// the hut, tosses the package, waves and rides off. Egg crates burst open and
// the eggs arc into the pond; other parcels go into your inventory.
import * as THREE from 'three';
import { HUT } from '../world/worldgen.js';
import { WATER_Y } from '../world/grid.js';

const mods = import.meta.glob('../entities/critters3d.js', { eager: true });
const C3 = mods['../entities/critters3d.js'] || null;

const SPEED = 6.5;

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
    this.active = null; // the courier run in progress
    this.parcels = []; // packages lying on the ground
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.nextId = 1;
    this.wait = 0;
    this.recent = []; // delivered orders shown briefly in the tracker
  }

  get dropPoint() { return { x: HUT.x + 1.5, z: HUT.z + 4.8 }; }

  // items: [{ kind: 'egg', species, genes, t } | { kind: 'item', type, qty, label }]
  // Every order is first packed at the e-Buy warehouse (a few seconds per
  // item), then the moose rides it over. tracker() reports each order's
  // phase and ETA for the HUD.
  order(items, { label = 'Package', fast = false } = {}) {
    const n = items.reduce((a, it) => a + (it.qty || 1), 0);
    const fragile = items.some((it) => it.kind === 'egg' || it.kind === 'bird');
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

  buildPath() {
    const trail = this.game.world.trail;
    const path = trail.slice(Math.floor(trail.length * 0.5)).map((p) => ({ x: p[0], y: p[1], z: p[2] }));
    const end = path[path.length - 1];
    const d = this.dropPoint;
    path.push({ x: (end.x + d.x) / 2, y: 0, z: (end.z + d.z) / 2 + 1 }, { x: d.x - 1.2, y: 0, z: d.z + 0.6 });
    return path;
  }

  // [{ id, label, phase: packing|riding|arriving|delivered, eta (s, -1 = after sunrise), progress, count }]
  tracker() {
    const out = [];
    const ride = this.routeLength() / SPEED + 3;
    const canRide = this.canRide();
    const a = this.active;
    let wait = 0; // a queued order also waits for the courier that's already out
    if (a) {
      let rem = 0;
      if (a.state === 'ride') {
        for (let i = a.i; i < a.path.length; i++) {
          const p0 = i === a.i ? a : a.path[i - 1];
          rem += Math.hypot(a.path[i].x - p0.x, a.path[i].z - p0.z);
        }
      }
      const eta = a.state === 'ride' ? rem / SPEED + 1.5 : a.state === 'brake' ? 1.2 : 0.6;
      const phase = a.state === 'ride' && rem > 9 ? 'riding' : 'arriving';
      const prog = 0.35 + 0.65 * Math.max(0, Math.min(1, 1 - (eta - 1) / ride));
      if (a.state !== 'leave') for (const o of a.orders) out.push({ id: o.id, label: o.label, phase, eta, progress: prog, count: o.items.length });
      wait = a.state === 'leave' ? rem / SPEED : eta + this.routeLength() / SPEED;
    }
    for (const o of this.queue) {
      const pk = Math.max(0, o.packT);
      const eta = canRide ? Math.max(pk, wait) + ride : -1;
      const prog = 0.35 * (1 - pk / (o.packTotal || 1));
      out.push({ id: o.id, label: o.label, phase: 'packing', eta, progress: prog, count: o.items.length });
    }
    for (const p of this.parcels) out.push({ id: p.order.id, label: p.order.label, phase: 'delivered', eta: 0, progress: 1, count: p.order.items.length });
    for (const d of this.recent) if (!out.some((o) => o.id === d.id)) out.push(d);
    return out;
  }

  makeCourier() {
    if (C3?.MooseCourier) {
      try { return new C3.MooseCourier(); } catch (e) { console.warn('MooseCourier failed', e); }
    }
    return fallbackCourier();
  }

  makePackage(kind) {
    if (C3?.makePackage) {
      try { return C3.makePackage(kind); } catch { /* fall back */ }
    }
    return fallbackPackage(kind);
  }

  canRide() {
    const ph = this.game.state.phase;
    return ph === 'day' || ph === 'morning' || ph === 'evening';
  }

  start() {
    const rig = this.makeCourier();
    this.group.add(rig.root);
    // everything that's packed rides together (up to 3 parcels)
    const orders = [];
    for (let i = 0; i < this.queue.length && orders.length < 3; i++) if (this.queue[i].packT <= 0) orders.push(this.queue[i]);
    this.queue = this.queue.filter((o) => !orders.includes(o));
    const path = this.buildPath();
    this.active = { rig, orders, path, i: 0, x: path[0].x, y: path[0].y, z: path[0].z, state: 'ride', t: 0, heading: 0 };
    rig.play?.('ride', { loop: true });
    // the camera rides along (any manual pan frees it again)
    const ui = this.game.ui;
    const idle = performance.now() - (this.game.rig.userCamT || 0) > 6000; // never yank a camera the player is using
    if (ui && idle && !this.game.cine?.active && !ui.blueprint?.open && !this.game.lab?.active && this.game.state.phase !== 'rush') {
      this.prevCam = { x: this.game.rig.goal.x, z: this.game.rig.goal.z, wupp: this.game.rig.wuppGoal };
      setTimeout(() => { if (this.active && !ui.ebuy) ui.trackEntity(this.active, { label: 'Moose Express', kind: 'moose', zoom: 0.024 }); }, 400);
    }
    this.game.audio.play('bell', { volume: 0.3, pitch: 1.8 });
  }

  update(dt) {
    const game = this.game;
    for (const o of this.queue) o.packT -= dt;
    if (!this.active) {
      this.wait -= dt;
      if (this.wait <= 0 && this.canRide() && this.queue.some((o) => o.packT <= 0)) this.start();
    } else this.updateCourier(dt);
    this.updateParcels(dt);
    for (const d of this.recent) d.t -= dt;
    this.recent = this.recent.filter((d) => d.t > 0);
  }

  updateCourier(dt) {
    const game = this.game;
    const a = this.active;
    const r = a.rig;
    a.t += dt;
    const g = game.grid;
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
          else { this.group.remove(r.root); r.dispose?.(); this.active = null; this.wait = 1; return; }
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
          const kind = o.items.some((it) => it.kind === 'egg' || it.kind === 'bird') ? 'egg_crate' : 'box';
          const obj = this.makePackage(kind);
          this.group.add(obj);
          const tx = d.x + (k - (a.orders.length - 1) / 2) * 0.9, tz = d.z + (Math.random() - 0.5) * 0.5;
          this.parcels.push({ order: o, obj, kind, x: a.x, y: a.y + 1.3, z: a.z, x0: a.x, y0: a.y + 1.3, z0: a.z, x1: tx, z1: tz, t: -k * 0.25, state: 'fly', rot: Math.random() * 6 });
        }
      }
    } else if (a.state === 'toss') {
      if (a.t > 0.9 && !a.waved) { a.waved = true; r.play?.('wave', { loop: false }); game.say?.(this.speaker(), pick(['Sign here! ...nah.', 'Fresh from e-Buy!', 'Handle with care!', 'Have a moose-tastic day!']), { voice: 'moose', mood: 'happy', dur: 2 }); }
      if (a.t > 2.4) {
        a.state = 'leave'; a.t = 0;
        // stop riding along; settle on the parcels
        const ui = game.ui;
        if (ui?.tracking?.kind === 'moose') { ui.stopTracking(); game.rig.lookAt(this.dropPoint.x, this.dropPoint.z); game.rig.wuppGoal = 0.026; }
        r.play?.('ride_away', { loop: false, onDone: () => r.play?.('ride', { loop: true }) });
        a.path = a.path.slice().reverse();
        a.i = 1;
      }
    }
    r.root.position.set(a.x, a.y, a.z);
    r.root.rotation.y = a.heading;
    r.update?.(dt);
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
        const e = game.fish.addBoughtEgg(it.species, it.genes, it.t, w);
        if (e) { game.particles.sparkle(w.x, WATER_Y + 0.2, w.z, 8, 0xfff2a0); game.particles.splash(w.x, w.z, 6, 0.5); }
        game.emit('eggInPond', e);
      }, 350 + k * 160);
    });
  }

  // something the bubble system can follow
  speaker() {
    const a = this.active;
    return { getWorldPos: (v) => (a ? v.set(a.x, a.y + 2.1, a.z) : v.set(0, -99, 0)) };
  }

  updateParcels(dt) {
    const game = this.game;
    for (let i = this.parcels.length - 1; i >= 0; i--) {
      const p = this.parcels[i];
      p.t += dt;
      if (p.state === 'fly') {
        if (p.t < 0) { p.obj.visible = false; continue; }
        p.obj.visible = true;
        const k = Math.min(1, p.t / 0.7);
        p.x = p.x0 + (p.x1 - p.x0) * k;
        p.z = p.z0 + (p.z1 - p.z0) * k;
        const gy = game.grid.groundAt(p.x1, p.z1);
        p.y = p.y0 + (gy - p.y0) * k + Math.sin(k * Math.PI) * 1.4;
        p.rot += dt * 9;
        if (k >= 1) {
          p.state = 'land'; p.t = 0; p.y = gy;
          game.particles.dust(p.x, gy + 0.05, p.z, 8);
          game.audio.play('drop', { volume: 0.5 });
          game.rig.shake = Math.max(game.rig.shake, 0.15);
        }
      } else if (p.state === 'land') {
        // squash bounce then pop open
        const s = 1 + Math.sin(p.t * 18) * 0.25 * Math.max(0, 1 - p.t * 2);
        p.obj.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
        // then it sits there waiting for you to tap it and unbox it
        if (p.t > 0.9) { p.state = 'wait'; p.t = 0; p.obj.scale.set(1, 1, 1); game.emit('parcelLanded', p); }
      } else if (p.state === 'wait') {
        // an impatient little hop every few seconds
        const k = (p.t % 3.2);
        const hop = k < 0.35 ? Math.sin((k / 0.35) * Math.PI) : 0;
        p.obj.position.y = p.y + hop * 0.12;
        p.obj.rotation.z = hop * 0.12 * Math.sin(p.t * 20);
      }
      p.obj.position.set(p.x, p.y, p.z);
      p.obj.rotation.y = p.state === 'fly' ? p.rot : p.obj.rotation.y;
    }
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
    const eggItems = p.order.items.filter((it) => it.kind === 'egg');
    if (eggItems.length) {
      // Reynard picks the egg crate up and carries it down to the water
      if (game.fox?.carryEggs) game.fox.carryEggs(p.x, p.z, eggItems);
      else this.dropEggs(p.x, p.y, p.z, eggItems);
    }
    for (const it of p.order.items) {
      if (it.kind === 'egg') {
        continue;
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
    this.recent.push({ id: p.order.id, label: p.order.label, phase: 'delivered', eta: 0, progress: 1, count: p.order.items.length, t: 2.5 });
    game.emit('delivered', p.order);
  }

  serialize() {
    const all = [...this.queue, ...(this.active ? this.active.orders : []), ...this.parcels.map((p) => p.order)];
    return all.map((o) => ({ items: o.items, label: o.label, packT: Math.max(0, o.packT || 0) }));
  }

  load(list) {
    this.queue = (list || []).map((o) => ({ id: this.nextId++, items: o.items, label: o.label, packT: o.packT || 3, packTotal: Math.max(3, o.packT || 3) }));
    this.wait = 3;
  }
}

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
