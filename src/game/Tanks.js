// Glass tanks: keep fish apart from the pond. Fish in a tank are safe from
// bears, fed automatically, and only breed with their tank mates (great for
// controlled pairings). Breeding in a tank goes through the same stages as
// the pond: a date, mum lays, dad fertilizes, the eggs incubate, you tap.
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);
const DATE_TIME = 6;
const FERT_TIME = 6;

export class Tanks {
  constructor(game) {
    this.game = game;
    this.checkT = 1;
  }

  list() { return this.game.structures.list.filter((s) => !s.removed && s.built && s.def.tank); }
  fishIn(s) { return this.game.fish.list.filter((f) => f.tank === s && !f.dead); }
  room(s) { return s.def.tank.cap - this.fishIn(s).length; }

  // local interior box of the tank model, in world space
  box(s) {
    const I = s.tankRig?.interior || { x0: -0.36, x1: 0.36, y0: 0.42, y1: 0.78, z0: -0.22, z1: 0.22 };
    const by = this.game.structures.baseY(s);
    return { x0: s.x + 0.5 + I.x0 + 0.06, x1: s.x + 0.5 + I.x1 - 0.06, z0: s.z + 0.5 + I.z0 + 0.04, z1: s.z + 0.5 + I.z1 - 0.04, y0: by + I.y0 + 0.08, y1: by + I.y1 - 0.06 };
  }

  floorY(s) { return this.box(s).y0 - 0.04; }

  nearestWithRoom(x, z) {
    let best = null, bd = 1e9;
    for (const s of this.list()) {
      if (this.room(s) <= 0) continue;
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  put(f, s, { quiet = false } = {}) {
    const game = this.game;
    if (!s || (this.room(s) <= 0 && f.tank !== s)) { if (!quiet) game.notify('That tank is full!', 'no'); return false; }
    if (f.mate) { f.mate.mate = null; if (f.mate.state === 'court') f.mate.state = 'wander'; f.mate = null; }
    f.state = 'wander'; f.target = null; f.dateT = 0; f.eggs = null;
    f.tank = s;
    f.region = -1;
    const b = this.box(s);
    f.x = rand(b.x0, b.x1); f.z = rand(b.z0, b.z1); f.y = rand(b.y0, b.y1);
    f.tx = f.x; f.tz = f.z; f.ty = f.y;
    this.visual(s);
    if (!quiet) {
      game.particles.splash(s.x + 0.5, s.z + 0.5, 6, 0.4);
      game.audio.play('splash', { volume: 0.4, pitch: 1.5 });
      game.ui?.floatTextAt?.(s.x + 0.5, b.y1 + 0.4, s.z + 0.5, 'In the tank!', '#bfe8ff');
      game.emit('tankPut', { fish: f, tank: s });
    }
    return true;
  }

  // back to the pond: dropped in the nearest water
  release(f) {
    const game = this.game;
    const s = f.tank;
    if (!s) return false;
    const q = game.fish.nearestWater(s.x + 0.5, s.z + 0.5) || game.fish.randomWaterPoint();
    if (!q) return false;
    f.tank = null;
    f.state = 'wander'; f.dateT = 0; f.eggs = null;
    f.x = q.x; f.z = q.z; f.y = -0.3;
    f.region = game.grid.regionAt(q.x, q.z);
    f.fleeT = 0.5; f.state = 'flee';
    game.particles.splash(q.x, q.z, 10, 0.7);
    game.audio.play('splash', { volume: 0.45, pitch: 1.2 });
    this.visual(s);
    game.emit('tankRelease', { fish: f, tank: s });
    return true;
  }

  visual(s) { try { s.tankRig?.setFishCount?.(this.fishIn(s).length); } catch { /* ignore */ } }

  // per-fish, called from the fish loop instead of pond swimming
  updateFish(f, dt) {
    const s = f.tank;
    if (!s) return;
    if (s.removed) { this.release(f); return; }
    const b = this.box(s);
    f.hunger = Math.max(0.05, f.hunger - dt * 0.004); // the tank feeds them
    // dad on egg duty
    if (f.state === 'fertilize' && f.eggs && f.eggs.stage === 'laid' && !f.eggs.dead) {
      f.tx = f.eggs.x; f.tz = f.eggs.z; f.ty = b.y0 + 0.02;
      f.eggs.fertP = (f.eggs.fertP || 0) + dt;
      if (Math.random() < dt * 4) this.game.particles.bubbles(f.eggs.x, f.eggs.y + 0.1, f.eggs.z, 1);
      if (f.eggs.fertP >= FERT_TIME) this.game.fish.fertilize(f.eggs, f);
    } else if (f.state === 'fertilize') f.state = 'wander';
    if (f.dateT > 0) {
      f.dateT -= dt;
      const m = f.mate;
      if (m) { f.tx = m.x + Math.cos(this.game.time * 3 + f.seed) * 0.12; f.tz = m.z + Math.sin(this.game.time * 3 + f.seed) * 0.12; }
      if (Math.random() < dt * 1.5) this.game.particles.hearts(f.x, f.y + 0.2, f.z, 1);
      if (f.dateT <= 0 && m && f.id < m.id && !m.dead && m.tank === s) {
        const before = this.game.fish.eggs.length;
        this.game.fish.mate(f, m);
        for (const e of this.game.fish.eggs.slice(before)) { e.tank = s; e.region = -1; e.y = this.floorY(s); e.x = Math.max(b.x0, Math.min(b.x1, e.x)); e.z = Math.max(b.z0, Math.min(b.z1, e.z)); }
      }
    }
    if (f.dateT <= 0 && Math.hypot(f.tx - f.x, f.tz - f.z) < 0.04) {
      f.tx = rand(b.x0, b.x1); f.tz = rand(b.z0, b.z1); f.ty = rand(b.y0, b.y1);
    }
    f.tx = Math.max(b.x0, Math.min(b.x1, f.tx)); f.tz = Math.max(b.z0, Math.min(b.z1, f.tz));
    const dx = f.tx - f.x, dz = f.tz - f.z, d = Math.hypot(dx, dz);
    if (d > 0.005) {
      const h = Math.atan2(dz, dx);
      let dh = h - f.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      f.heading += dh * Math.min(1, dt * 4);
      const sp = Math.min(d, dt * 0.22 * f.sp.speed);
      f.x += Math.cos(f.heading) * sp; f.z += Math.sin(f.heading) * sp;
      f.speed = 0.25;
    } else f.speed = 0;
    f.x = Math.max(b.x0, Math.min(b.x1, f.x)); f.z = Math.max(b.z0, Math.min(b.z1, f.z));
    f.y += ((f.ty ?? b.y0) - f.y) * Math.min(1, dt * 1.5);
    f.phase += dt * (4 + f.speed * 9);
  }

  update(dt) {
    const fish = this.game.fish;
    for (const s of this.list()) s.tankRig?.update?.(dt);
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 1;
    // tank mates who are ready go on a date (stage 1)
    for (const s of this.list()) {
      const inTank = this.fishIn(s);
      if (inTank.length < 2) continue;
      if (fish.eggs.some((e) => e.tank === s && e.stage === 'laid')) continue;
      if (inTank.some((f) => f.dateT > 0)) continue;
      const ok = inTank.filter((f) => f.adult && f.loveT <= 0 && f.state !== 'fertilize');
      for (const a of ok) {
        const b = ok.find((o) => o !== a && fish.compatible(a, o));
        if (!b) continue;
        a.mate = b; b.mate = a;
        a.dateT = b.dateT = DATE_TIME;
        this.game.audio.play('heart', { volume: 0.3 });
        break;
      }
    }
  }

  // freshly hatched tank babies stay in their tank if there's room
  adopt(born, s) {
    for (const f of born) {
      if (s && !s.removed && this.room(s) > 0) this.put(f, s, { quiet: true });
      else {
        const q = this.game.fish.nearestWater(s.x + 0.5, s.z + 0.5);
        if (q) { f.x = q.x; f.z = q.z; f.region = this.game.grid.regionAt(q.x, q.z); }
      }
    }
  }

  onRemoved(s) {
    for (const f of this.fishIn(s)) this.release(f);
    for (const e of this.game.fish.eggs) if (e.tank === s) {
      const q = this.game.fish.nearestWater(s.x + 0.5, s.z + 0.5);
      e.tank = null;
      if (q) { e.x = q.x; e.z = q.z; e.y = this.game.grid.groundAt(q.x, q.z) + 0.02; e.region = this.game.grid.regionAt(q.x, q.z); }
    }
  }
}

// a simple glass box until the nicer model is available
export function fallbackTank() {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x8a5a34 });
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.36, 0.6), wood);
  stand.position.y = 0.18; stand.castShadow = true; stand.receiveShadow = true;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.46, 0.56), new THREE.MeshLambertMaterial({ color: 0xbfe8f4, transparent: true, opacity: 0.32, depthWrite: false }));
  glass.position.y = 0.62;
  const water = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.36, 0.52), new THREE.MeshLambertMaterial({ color: 0x4aa0c8, transparent: true, opacity: 0.35, depthWrite: false }));
  water.position.y = 0.58;
  const gravel = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.04, 0.52), new THREE.MeshLambertMaterial({ color: 0xc8b888 }));
  gravel.position.y = 0.4;
  const rim = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.04, 0.62), wood);
  rim.position.y = 0.86;
  g.add(stand, gravel, water, glass, rim);
  return { root: g, water, interior: { x0: -0.4, x1: 0.4, y0: 0.42, y1: 0.78, z0: -0.25, z1: 0.25 }, setFishCount() {}, update() {}, dispose() {} };
}
