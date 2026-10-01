// Fog of the unexplored: thick fog sits over each villager's area until your
// land reaches its edge. Then it lifts (a wave rolling out from where you
// arrived), the area's name drops in, the villager says hi and unlocks stuff.
// The fog itself is drawn by the PixelRenderer post pass from `this.tex`.
import * as THREE from 'three';
import { ZONES, ZONE_BY_ID } from '../data/zones.js';
import { LANDMARKS } from '../world/worldgen.js';

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const IN = 1.2, OUT = 1.8; // fog thickens from r+OUT (none) to r-IN (full)

export class ZoneSystem {
  constructor(game) {
    this.game = game;
    const g = game.grid;
    this.w = g.w; this.h = g.h;
    this.mask = new Uint8Array(g.w * g.h);
    this.data = new Uint8Array(g.w * g.h * 2); // r = fog, g = ground height
    for (let z = 0; z < g.h; z++)
      for (let x = 0; x < g.w; x++) this.data[(z * g.w + x) * 2 + 1] = Math.max(0, Math.min(255, Math.round(Math.max(0, g.groundAt(x + 0.5, z + 0.5)) * 10)));
    this.tex = new THREE.DataTexture(this.data, g.w, g.h, THREE.RGFormat, THREE.UnsignedByteType);
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.unpackAlignment = 1;
    this.tex.flipY = false;
    this.lifts = []; // { zone, x, z, t, dur, maxD }
    this.checkT = 1;
    this.rebuild();
    game.renderer.setFog(this.tex, g.w, g.h);
  }

  isOpen(id) { return (this.game.state.zones || []).includes(id); }

  density(Z, x, z) {
    const d = Math.hypot(x + 0.5 - Z.cx, z + 0.5 - Z.cz);
    return smooth(Z.r + OUT, Z.r - IN, d);
  }

  rebuild(only = null) {
    const m = this.mask;
    const W = this.w;
    const zones = only ? [only] : ZONES;
    // clear the region(s) we redraw, then stamp every zone overlapping it
    const boxes = zones.map((Z) => [Math.max(0, Math.floor(Z.cx - Z.r - OUT - 1)), Math.min(this.w - 1, Math.ceil(Z.cx + Z.r + OUT + 1)), Math.max(0, Math.floor(Z.cz - Z.r - OUT - 1)), Math.min(this.h - 1, Math.ceil(Z.cz + Z.r + OUT + 1))]);
    if (!only) { m.fill(0); for (let i = 0; i < m.length; i++) this.data[i * 2] = 0; }
    for (const [x0, x1, z0, z1] of boxes) {
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          let v = 0;
          for (const Z of ZONES) {
            const lift = this.lifts.find((l) => l.zone === Z);
            if (this.isOpen(Z.id) && !lift) continue;
            let d = this.density(Z, x, z);
            if (d <= 0) continue;
            if (lift) {
              // the clearing wave rolls out from where you arrived
              const R = (lift.t / lift.dur) * (lift.maxD + 6);
              const dd = Math.hypot(x + 0.5 - lift.x, z + 0.5 - lift.z);
              d *= 1 - Math.max(0, Math.min(1, (R - dd) / 6));
            }
            v = Math.max(v, d);
          }
          m[z * W + x] = Math.round(v * 255);
          this.data[(z * W + x) * 2] = m[z * W + x];
        }
    }
    this.tex.needsUpdate = true;
  }

  fogAt(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    if (x < 0 || z < 0 || x >= this.w || z >= this.h) return 0;
    return this.mask[z * this.w + x] / 255;
  }

  zoneAt(x, z) {
    for (const Z of ZONES) if (Math.hypot(x - Z.cx, z - Z.cz) < Z.r) return Z;
    return null;
  }

  // has your land touched the edge of a fogged area?
  checkReach() {
    const g = this.game.grid;
    for (const Z of ZONES) {
      if (this.isOpen(Z.id)) continue;
      const R = Z.r + IN + 0.1;
      let best = null, bd = 1e9;
      for (let z = Math.max(0, Math.floor(Z.cz - R)); z <= Math.min(g.h - 1, Math.ceil(Z.cz + R)); z++)
        for (let x = Math.max(0, Math.floor(Z.cx - R)); x <= Math.min(g.w - 1, Math.ceil(Z.cx + R)); x++) {
          if (!g.meadow[z * g.w + x]) continue;
          const d = Math.hypot(x + 0.5 - Z.cx, z + 0.5 - Z.cz);
          if (d <= R && d < bd) { bd = d; best = { x: x + 0.5, z: z + 0.5 }; }
        }
      if (best) { this.reveal(Z, best); return; }
    }
  }

  // ------------------------------------------------------------ the big moment
  async reveal(Z, at = null, { quiet = false } = {}) {
    const game = this.game;
    if (!Z?.id || this.isOpen(Z.id)) return;
    game.state.zones.push(Z.id);
    at = at || { x: Z.cx, z: Z.cz };
    const maxD = Math.hypot(Z.r + OUT, Z.r + OUT) + Math.hypot(at.x - Z.cx, at.z - Z.cz);
    this.lifts.push({ zone: Z, x: at.x, z: at.z, t: 0, dur: quiet ? 0.01 : 3.6, maxD });
    const L = LANDMARKS.find((l) => l.id === Z.landmark);
    if (quiet) { if (L && !game.state.landmarks.includes(L.id)) game.discoverLandmark(L, { quiet: true }); return; }
    this.busy = true;
    // carve the villager's homestead now so the land rebuilds while the banner shows
    const vv = game.villagers?.list.find((x) => x.zone === Z);
    if (vv) game.villagers.homestead(vv);
    game.audio.play('discover', { volume: 0.6 });
    game.audio.play('whoosh', { volume: 0.5, pitch: 0.6 });
    game.ui?.stopTracking?.();
    game.rig.lookAt(Z.cx, Z.cz + 2);
    game.rig.wuppGoal = Math.max(game.rig.wuppGoal, 0.05);
    game.ui?.flashTransition?.('iris', { dur: 0.7, color: '#f3f1ea', peak: 0.5 });
    await wait(1.4);
    const ZB = game.ui?.comp?.('ZoneBanner');
    const banner = ZB?.showZoneBanner ? ZB.showZoneBanner(game.ui.root, { title: Z.name, sub: Z.sub, npc: Z.npc.id, color: Z.npc.color, sfx: (n, o) => game.audio.play(n, { volume: 0.4, ...(o || {}) }) }) : null;
    if (!banner) game.notify(`${Z.name}! ${Z.sub}`, 'excited', { dur: 4 });
    if (L && !game.state.landmarks.includes(L.id)) game.discoverLandmark(L, { quiet: true });
    try { await (banner || wait(3)); } catch { /* ignore */ }
    game.villagers?.revealed(Z);
    const v = game.villagers?.get(Z.npc.id);
    if (v) {
      game.rig.lookAt(v.x, v.z + 1);
      game.rig.wuppGoal = 0.026;
      await game.villagers.intro(v);
    }
    for (const u of Z.unlocks) game.notify(`Unlocked: ${u.title}!`, 'excited', { dur: 3.2 });
    this.busy = false;
    game.emit('zone', Z);
    game.save();
  }

  update(dt) {
    const game = this.game;
    for (const l of this.lifts) {
      l.t += dt;
      // puffs of fog blowing off the clearing wave
      if (l.t < l.dur && Math.random() < dt * 14) {
        const a = Math.random() * Math.PI * 2;
        const R = (l.t / l.dur) * (l.maxD + 6);
        const x = l.x + Math.cos(a) * R, z = l.z + Math.sin(a) * R;
        if (Math.hypot(x - l.zone.cx, z - l.zone.cz) < l.zone.r + 1) game.particles.puff?.(x, game.grid.groundAt(x, z) + 1 + Math.random() * 2, z, 2, 0.6);
      }
    }
    if (this.lifts.length) {
      const done = this.lifts.filter((l) => l.t >= l.dur);
      for (const l of this.lifts) this.rebuild(l.zone);
      this.lifts = this.lifts.filter((l) => l.t < l.dur);
      for (const l of done) this.rebuild(l.zone);
    }
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 1;
      // first time the camera wanders up to a fog bank: explain it
      const t = game.rig.target;
      if (!game.titleMode && ZONES.some((Z) => !this.isOpen(Z.id) && Math.hypot(t.x - Z.cx, t.z - Z.cz) < Z.r + 4)) game.ui?.tipOnce?.('fog', 'Thick fog! Someone lives in there... Clear the forest up to it.', 'thinking');
      if (!this.busy && (game.state.tutorialDone || game.skipTutorial) && !game.titleMode && !game.cine?.active) this.checkReach();
    }
    // fog colour follows the sky
    const sky = game.sky?.state;
    if (sky) {
      const n = sky.night ? 1 : 0;
      const dusk = Math.max(0, Math.min(1, (game.state.hour - 17) / 3)) * (1 - n);
      const light = [0.9 - 0.48 * n + 0.06 * dusk, 0.9 - 0.44 * n - 0.04 * dusk, 0.88 - 0.28 * n - 0.12 * dusk];
      const shade = [0.52 - 0.3 * n + 0.08 * dusk, 0.56 - 0.31 * n - 0.04 * dusk, 0.68 - 0.28 * n - 0.08 * dusk];
      game.renderer.setFogColors(light, shade);
    }
  }

  // old saves: areas whose landmark you already found are open
  onLoad() {
    const st = this.game.state;
    st.zones ||= [];
    for (const Z of ZONES) if (st.landmarks.includes(Z.landmark) && !st.zones.includes(Z.id)) st.zones.push(Z.id);
    this.lifts.length = 0;
    this.rebuild();
  }
}

export { ZONES, ZONE_BY_ID };
