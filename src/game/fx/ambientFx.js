// [v31 fx] Ambient 2D pixel-art life over the world, wherever the camera looks.
//
// Everything is a sprite in the pooled `particles.amb` system (one draw call,
// capped, scaled by the particles setting); emitters only spawn around the
// visible part of the world, so the cost stays flat however big the map is.
//
//   pollen + dandelion seeds   drift on the wind by day (more in spring / summer)
//   sun motes                  twinkling dust catching the low sun (morning, golden hour)
//   water glints               4-point star flashes on the pond where the sun hits it
//   morning mist               wind-torn dithered mist rolling over the water at dawn
//                              (a thinner evening mist after dusk)
//   dusk fireflies             along the shore and the reeds as the light goes
//   chimney embers             sparks from the cottage chimney at night
//   spindrift                  snow plumes torn off the high peaks by the wind
//   waterfall spray            mist and droplets where the valley waterfall lands
//   running dust               kicked up behind bears / the fox running on dry land
//
// It also hands the hour's light colour to the unlit particles (lightTint), so
// splashes and dust go golden at sunset and blue at night.
//
//   const fx = new AmbientFx(game);   fx.update(dt);   // Ambient.update calls it
import { WATER_Y } from '../../world/grid.js';
import { HUT } from '../../world/worldgen.js';
import { FX } from '../Particles.js';

const rand = (a, b) => a + Math.random() * (b - a);
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class AmbientFx {
  constructor(game) {
    this.game = game;
    this.acc = Object.create(null); // per-emitter spawn accumulators
    this.light = [1, 1, 1];
    this.crests = null;
    this.prev = new WeakMap(); // runner -> { x, z }
    this.windX = 0.6; this.windZ = 0.2;
    this.ground = this.ground.bind(this);
    this.fogged = this.fogged.bind(this);
    this._view = { cx: 0, cz: 0, rx: 1, rz: 0, fx: 0, fz: -1, ex: 10, ez: 8, cot: 1, cy: 0 };
  }

  // how many to spawn this frame for a rate (per real second): carries the fraction over
  n(key, rate) {
    const dt = this.rdt;
    const a = (this.acc[key] || 0) + rate * dt;
    const k = Math.floor(a);
    this.acc[key] = a - k;
    return Math.min(k, 8);
  }

  // a random ground point inside the view (u, v in -1..1 across / up the screen)
  viewPoint(out, spread = 1) {
    const V = this._view;
    const u = (Math.random() * 2 - 1) * spread, v = (Math.random() * 2 - 1) * spread;
    out.x = V.cx + V.rx * u * V.ex + V.fx * v * V.ez;
    out.z = V.cz + V.rz * u * V.ex + V.fz * v * V.ez;
    return out;
  }

  // y: a raised point shows where the ground point y * cot(pitch) further up the screen is
  inView(x, z, pad = 1.2, y = 0) {
    const V = this._view;
    const dy = y ? y - V.cy : 0;
    const dx = x + V.fx * dy * V.cot - V.cx, dz = z + V.fz * dy * V.cot - V.cz;
    return Math.abs(dx * V.rx + dz * V.rz) < V.ex * pad && Math.abs(dx * V.fx + dz * V.fz) < V.ez * pad * 1.6;
  }

  // ground height anywhere (the map, or the valley ranges round it)
  ground(x, z) {
    const g = this.game.grid;
    return g.inb(Math.floor(x), Math.floor(z)) ? g.groundAt(x, z) : (this.game.world.ring?.heightAt?.(x, z) ?? 0);
  }
  fogged(x, z) { return (this.game.zones?.fogAt?.(Math.floor(x), Math.floor(z)) || 0) > 0.5; }

  // dust kicked up behind something running on dry ground (bears, the fox)
  runner(o, r, dt, q) {
    if (!o || o.visible === false) return;
    const g = this.game.grid, P = this.game.particles;
    const pv = this.prev.get(o);
    if (!pv) { this.prev.set(o, { x: o.x, z: o.z }); return; }
    const dx = o.x - pv.x, dz = o.z - pv.z;
    pv.x = o.x; pv.z = o.z;
    const sp = Math.hypot(dx, dz) / dt;
    if (sp < 1.6 || sp > 30 || o.inWater) return;
    const ix = Math.floor(o.x), iz = Math.floor(o.z);
    if (!g.inb(ix, iz) || g.isWater(ix, iz) || !this.inView(o.x, o.z)) return;
    if (Math.random() < dt * Math.min(9, sp * 1.6) * q) {
      const ux = dx / (sp * dt), uz = dz / (sp * dt);
      const dir = this._dir || (this._dir = { x: 0, z: 0 });
      dir.x = ux; dir.z = uz;
      P.kick(o.x - ux * 0.3 * r, o.y || this.ground(o.x, o.z), o.z - uz * 0.3 * r, 1, dir);
    }
  }

  // high, snowy crests of the valley ranges (spindrift sources), found once
  findCrests() {
    const ring = this.game.world?.ring;
    const out = [];
    if (!ring?.cells || !ring.heightAt) return (this.crests = out);
    for (const c of ring.cells) {
      if (c.wet || c.y < 22 || c.cs > 2) continue;
      if (c.id !== 6 && c.id !== 25) continue; // snow tops / snowy rock
      let top = true;
      for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [3, 3], [-3, -3], [3, -3], [-3, 3]]) if (ring.heightAt(c.cx + dx, c.cz + dz) > c.y + 0.01) { top = false; break; }
      if (top) out.push({ x: c.cx, y: c.y, z: c.cz, ph: Math.random() * 9 });
    }
    return (this.crests = out);
  }

  update(dt) {
    const game = this.game;
    const P = game.particles;
    if (!P?.ambSpawn || game.titleMode || game.overrideScene || !dt) return;
    // spawn rates run on real time (a slow frame still gets its share), capped per frame
    const now = performance.now();
    this.rdt = Math.min(0.25, Math.max(0, (now - (this._now || now)) / 1000)) || dt;
    this._now = now;
    const sky = game.sky, s = sky.state;
    const hour = game.state.hour;
    const q = P.quality ? P.quality() : 1;
    // ---- the light colour for unlit particles: warm at sunrise / sunset, blue at night
    const L = this.light, sc = sky.sun.color, hc = sky.hemi.color;
    const day = s.dayK ?? (1 - s.night);
    const tr = 0.62 + 0.38 * day, warm = (s.golden || 0) * 0.5;
    L[0] = Math.min(1.15, tr * (0.55 + 0.45 * (sc.r * day + hc.r * (1 - day))) + warm * 0.15);
    L[1] = Math.min(1.1, tr * (0.6 + 0.4 * (sc.g * day + hc.g * (1 - day))));
    L[2] = Math.min(1.1, tr * (0.62 + 0.38 * (sc.b * day + hc.b * (1 - day))) + (1 - day) * 0.08);
    P.setLight?.(L);
    // ---- the view: centre, screen axes on the ground, half extents
    const rig = game.rig, V = this._view;
    const R = game.renderer;
    const wupp = rig?.wupp || 0.05;
    V.cx = rig?.target?.x ?? 70; V.cz = rig?.target?.z ?? 40; V.cy = rig?.target?.y || 0;
    const yaw = rig?.yaw || 0;
    V.rx = Math.cos(yaw); V.rz = -Math.sin(yaw); V.fx = -Math.sin(yaw); V.fz = -Math.cos(yaw);
    V.ex = (R?.lowW || 640) * wupp * 0.5;
    const pitch = rig?.pitch || 0.77;
    V.ez = (R?.lowH || 360) * wupp * 0.5 / Math.max(0.4, Math.sin(pitch));
    V.cot = Math.cos(pitch) / Math.max(0.3, Math.sin(pitch));
    const wv = game.seasons?.fx?.windV;
    if (wv) { this.windX += (wv.x * 0.8 + 0.25 - this.windX) * Math.min(1, dt); this.windZ += (wv.y * 0.8 + 0.08 - this.windZ) * Math.min(1, dt); }
    const wet = game.seasons?.weather === 'rain' || game.seasons?.weather === 'storm' || game.seasons?.weather === 'snow';
    const area = Math.min(2.2, (V.ex * V.ez) / 220); // more of the world on screen: a few more
    const g = game.grid;
    const pt = this._pt || (this._pt = { x: 0, z: 0 });
    const ground = this.ground, fogged = this.fogged;

    // ---- pollen and dandelion seeds on the wind (by day, dry weather)
    const season = game.seasons?.season;
    const bloom = season === 'winter' ? 0 : season === 'autumn' ? 0.45 : 1;
    const pollenK = day * bloom * (wet ? 0 : 1) * (1 - sm(18.5, 19.5, hour));
    for (let i = this.n('pollen', 7 * pollenK * area * q); i > 0; i--) {
      this.viewPoint(pt, 1.05);
      if (fogged(pt.x, pt.z)) continue;
      const seed = Math.random() < 0.38;
      const gy = ground(pt.x, pt.z);
      P.ambSpawn(seed ? 'seed' : 'pollen', pt.x, gy + rand(0.3, 1.7), pt.z, {
        vx: this.windX * rand(0.5, 1.1), vy: rand(-0.02, 0.1), vz: this.windZ * rand(0.5, 1.1), drag: 0.05, life: rand(6, 10), fadeIn: 0.8,
        size: seed ? rand(0.07, 0.09) : 0.035, fps: seed ? 1.2 : 0, frame: Math.random() < 0.5 ? 1 : 0, flags: FX.WOBBLE | FX.FADE, rot: rand(-0.4, 0.4),
      });
    }
    // ---- sun motes: twinkling dust in the low sun
    const moteK = day * (0.25 + 1.6 * (s.golden || 0)) * (1 - (s.overcast || 0)) * (wet ? 0.2 : 1);
    for (let i = this.n('mote', 6 * moteK * area * q); i > 0; i--) {
      this.viewPoint(pt, 0.85);
      if (fogged(pt.x, pt.z)) continue;
      const gy = ground(pt.x, pt.z);
      P.ambSpawn('mote', pt.x, gy + rand(0.4, 2.6), pt.z, {
        vx: this.windX * 0.25 + rand(-0.08, 0.08), vy: rand(-0.04, 0.06), vz: this.windZ * 0.25 + rand(-0.08, 0.08), life: rand(2.5, 4.5), fadeIn: 0.6,
        size: 0.1, fps: rand(2.5, 5), flags: FX.WOBBLE | FX.FADE, emissive: 0.7, tint: [1.05, 0.95 + 0.05 * (1 - (s.golden || 0)), 0.78],
      });
    }
    // ---- water glints where the sun (or a bright moon) hits the pond
    const glintK = (day * (0.6 + 0.8 * (s.golden || 0)) + (1 - day) * 0.15 * (1 + (sky.moonlit || 0) * 3)) * (1 - (s.overcast || 0) * 0.85);
    for (let i = this.n('glint', 16 * glintK * area * q); i > 0; i--) {
      let ok = false;
      for (let k = 0; k < 5 && !ok; k++) { this.viewPoint(pt, 0.95); ok = g.inb(Math.floor(pt.x), Math.floor(pt.z)) && g.isWater(Math.floor(pt.x), Math.floor(pt.z)); }
      if (!ok) continue;
      const gt = day > 0.5 ? [1.2 * sc.r, 1.15 * sc.g, 1.05 * sc.b] : [0.8, 0.9, 1.2];
      P.ambSpawn('wglint', pt.x, WATER_Y + 0.04, pt.z, { life: rand(0.35, 0.6), size: rand(0.16, 0.24), fps: 10, flags: FX.ONCE, emissive: 1.1, tint: gt, bright: true });
    }
    // ---- mist rolling over the water at dawn, a thinner veil after dusk
    const mistK = Math.max(sm(4.5, 5.6, hour) * (1 - sm(7.2, 9.0, hour)), 0.45 * sm(19.4, 20.6, hour) * (1 - sm(23, 23.9, hour))) * (wet ? 0.5 : 1);
    for (let i = this.n('mist', 6.5 * mistK * area * q); i > 0; i--) {
      let ok = false;
      for (let k = 0; k < 5 && !ok; k++) { this.viewPoint(pt, 1); ok = g.inb(Math.floor(pt.x), Math.floor(pt.z)) && g.isWater(Math.floor(pt.x), Math.floor(pt.z)); }
      if (!ok) continue;
      const dawn = hour < 12;
      P.ambSpawn('mist', pt.x, WATER_Y + rand(0.12, 0.45), pt.z, {
        vx: this.windX * rand(0.2, 0.45), vz: this.windZ * rand(0.2, 0.45), life: rand(5, 8), fadeIn: 1.6, alpha: dawn ? 0.55 : 0.4,
        size: rand(0.35, 0.95), frame: Math.random() < 0.5 ? 1 : 0, flip: Math.random() < 0.5, flags: FX.FADE | FX.GROW,
        tint: dawn ? [1.05, 0.98, 0.96] : [0.72, 0.78, 0.98],
      });
    }
    // ---- fireflies along the shore as the light goes
    const ffK = sm(18.7, 19.6, hour) * (1 - sm(23.5, 24, hour)) + (hour < 4.5 ? 0.6 : 0);
    for (let i = this.n('ff', 4 * ffK * Math.min(1.5, area) * q); i > 0; i--) {
      let ok = false;
      for (let k = 0; k < 6 && !ok; k++) { this.viewPoint(pt, 0.9); const x = Math.floor(pt.x), z = Math.floor(pt.z); ok = g.inb(x, z) && !g.isWater(x, z) && (k > 3 || g.hasWaterNeighbor(x, z, true)); }
      if (!ok || fogged(pt.x, pt.z)) continue;
      P.firefly(pt.x, ground(pt.x, pt.z) + rand(0.25, 1.1), pt.z);
    }
    // ---- embers from the cottage chimney at night
    if (s.night > 0.3 && this.inView(HUT.x + 0.8, HUT.z + 0.8, 1.4, 3.4)) {
      for (let i = this.n('ember', 2.4 * s.night * q); i > 0; i--)
        P.ambSpawn('ember', HUT.x + 0.8 + rand(-0.08, 0.08), 3.4, HUT.z + 0.8 + rand(-0.08, 0.08), { vx: this.windX * 0.4 + rand(-0.15, 0.15), vy: rand(0.6, 1.1), vz: this.windZ * 0.4 + rand(-0.15, 0.15), drag: 0.4, life: rand(1, 1.9), size: 0.045, frame: Math.random() < 0.5 ? 1 : 0, flags: FX.WOBBLE | FX.FADE | FX.SHRINK, emissive: 1.5, bright: true });
    }
    // ---- spindrift torn off the high peaks
    if (!this.crests) this.findCrests();
    const cr = this.crests;
    if (cr.length) {
      const gust = 0.55 + 0.45 * Math.sin(game.time * 0.37) * Math.sin(game.time * 0.13 + 1.1);
      let seen = 0;
      for (let k = 0; k < cr.length && seen < 7; k++) {
        const c = cr[k];
        if (!this.inView(c.x, c.z, 1.1, c.y)) continue;
        seen++;
        for (let i = this.n('sd' + k, (2.2 + 3.2 * gust) * q); i > 0; i--) {
          const wx = this.windX * 3.2 + 0.6, wz = this.windZ * 3.2;
          P.ambSpawn(Math.random() < 0.65 ? 'spindrift' : 'flake', c.x + rand(-0.6, 0.6), c.y + rand(0.1, 0.5), c.z + rand(-0.6, 0.6), {
            vx: wx * rand(0.7, 1.2), vy: rand(0.15, 0.55), vz: wz * rand(0.7, 1.2), drag: 0.35, grav: 0.12, life: rand(1.4, 2.6), fadeIn: 0.25, alpha: 0.85,
            size: rand(0.35, 0.7), frame: Math.random() < 0.5 ? 1 : 0, flip: wx < 0, flags: FX.FADE | FX.GROW, tint: [1, 1, 1.04],
          });
        }
      }
    }
    // ---- spray where the valley waterfall lands (when that side isn't sunk / hidden)
    const ring = game.world.ring;
    const fa = ring?.waterfallAt;
    // (the waterfall hides when its range is on the camera's side: outerRing's flatK)
    let sunk = 0;
    if (fa) {
      const W = game.grid.w, H = game.grid.h;
      const qx = Math.min(W, Math.max(0, fa[0])), qz = Math.min(H, Math.max(0, fa[2]));
      const dd = Math.hypot(fa[0] - qx, fa[2] - qz) || 1;
      const dot = ((fa[0] - qx) / dd) * Math.sin(yaw) + ((fa[2] - qz) / dd) * Math.cos(yaw);
      sunk = sm(0.15, 0.75, dot) * sm(3, 20, dd);
    }
    if (fa && sunk < 0.3 && this.inView(fa[0], fa[2], 1.3, fa[1])) {
      for (let i = this.n('fall', 9 * q); i > 0; i--) {
        if (Math.random() < 0.45) P.ambSpawn('mist', fa[0] + rand(-0.6, 0.6), fa[1] + rand(-0.1, 0.4), fa[2] + rand(-0.3, 0.5), { vx: rand(-0.3, 0.3), vy: rand(0.25, 0.6), vz: rand(0, 0.4), drag: 0.6, life: rand(1.2, 2), fadeIn: 0.3, alpha: 0.7, size: rand(0.5, 0.9), frame: Math.random() < 0.5 ? 1 : 0, flags: FX.FADE | FX.GROW, bright: true });
        else { const a = Math.random() * Math.PI * 2, sp = rand(0.6, 1.6); P.ambSpawn(Math.random() < 0.5 ? 'spray' : 'drop_s', fa[0] + rand(-0.4, 0.4), fa[1] + 0.1, fa[2] + rand(-0.2, 0.3), { vx: Math.cos(a) * sp, vy: rand(1.6, 3), vz: Math.abs(Math.sin(a)) * sp, grav: 7, life: rand(0.6, 1), size: rand(0.05, 0.08), flags: FX.FADE, bright: true }); }
      }
      // a few glints sparkling down the fall
      const fp = ring.fallPts;
      if (fp?.length && day > 0.3) for (let i = this.n('fallg', 4 * q); i > 0; i--) {
        const p = fp[Math.floor(Math.random() * fp.length)];
        P.ambSpawn('wglint', p[0] + rand(-0.4, 0.4), p[1] + 0.2, p[2] + 0.2, { life: 0.4, size: 0.18, fps: 10, flags: FX.ONCE, emissive: 1, bright: true });
      }
    }
    // ---- dust kicked up behind runners on dry ground
    const bears = game.bears?.list;
    if (bears) for (let i = 0; i < bears.length && i < 40; i++) this.runner(bears[i], bears[i].def?.scale || 1, dt, q);
    this.runner(game.fox, 0.7, dt, q);
  }
}
