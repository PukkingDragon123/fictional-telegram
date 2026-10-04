// Fog of the unexplored: thick fog sits over each villager's area until your
// land reaches its edge. Then it lifts (a wave rolling out from where you
// arrived), the area's name drops in, the villager says hi and unlocks stuff.
// The fog itself is drawn by the PixelRenderer post pass from `this.tex`.
import * as THREE from 'three';
import { ZONES, ZONE_BY_ID } from '../data/zones.js';
import { LANDMARKS } from '../world/worldgen.js';
const NT3 = import.meta.glob('../ui/NpcTalk3D.js', { eager: true })['../ui/NpcTalk3D.js'] || {};
// a dark silhouette of the neighbour's head (who lives behind the fog?)
const SIL = new Map();
function silhouette(id) {
  if (!id || !NT3.npcSnapshot) return null;
  if (SIL.has(id)) return SIL.get(id);
  let url = null;
  try { const cv = NT3.npcSnapshot(id, { w: 48, h: 48, frame: 'bust', turn: 0.15 }); url = cv ? cv.toDataURL() : null; } catch { url = null; }
  SIL.set(id, url);
  return url;
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const IN = 1.2, OUT = 1.8; // legacy circle falloff (still used for the lift wave size)
const FADE = 3.2; // tiles of soft fringe outside an area's outline
const BIOME_REACH = 2.1; // a themed biome is covered up to this many radii out

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
    this.buildFields();
    this.rebuild();
    game.renderer.setFog(this.tex, g.w, g.h);
  }

  isOpen(id) { return (this.game.state.zones || []).includes(id); }

  // Every area's footprint: its circle plus its whole themed biome (the giant
  // mushrooms, the swamp, the willow hill), never your meadow. Stored as a
  // distance field in tiles: 0 inside, growing outwards (soft fringe).
  buildFields() {
    const g = this.game.grid;
    const W = this.w, H = this.h;
    for (const Z of ZONES) {
      const R = Z.r * (Z.biome != null ? BIOME_REACH : 1) + FADE + 2;
      const x0 = Math.max(0, Math.floor(Z.cx - R)), x1 = Math.min(W - 1, Math.ceil(Z.cx + R));
      const z0 = Math.max(0, Math.floor(Z.cz - R)), z1 = Math.min(H - 1, Math.ceil(Z.cz + R));
      const bw = x1 - x0 + 1, bh = z1 - z0 + 1;
      const D = new Float32Array(bw * bh).fill(99);
      const L = LANDMARKS.find((l) => l.id === Z.landmark);
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          const i = z * W + x;
          if (g.meadow[i]) continue;
          const d = Math.hypot(x + 0.5 - Z.cx, z + 0.5 - Z.cz);
          let inside = d < Z.r;
          if (!inside && Z.biome != null && g.biome && g.biome[i] === Z.biome && d < Z.r * BIOME_REACH) inside = true;
          // the landmark (and a tile around it) always hides inside the fog
          if (!inside && L && x >= L.x - 1 && x <= L.x + L.w && z >= L.z - 1 && z <= L.z + L.d) inside = true;
          if (inside) D[(z - z0) * bw + (x - x0)] = 0;
        }
      // two-pass chamfer distance transform
      const S = 1.4142;
      for (let z = 0; z < bh; z++)
        for (let x = 0; x < bw; x++) {
          const k = z * bw + x;
          let v = D[k];
          if (x > 0) v = Math.min(v, D[k - 1] + 1);
          if (z > 0) { v = Math.min(v, D[k - bw] + 1); if (x > 0) v = Math.min(v, D[k - bw - 1] + S); if (x < bw - 1) v = Math.min(v, D[k - bw + 1] + S); }
          D[k] = v;
        }
      for (let z = bh - 1; z >= 0; z--)
        for (let x = bw - 1; x >= 0; x--) {
          const k = z * bw + x;
          let v = D[k];
          if (x < bw - 1) v = Math.min(v, D[k + 1] + 1);
          if (z < bh - 1) { v = Math.min(v, D[k + bw] + 1); if (x < bw - 1) v = Math.min(v, D[k + bw + 1] + S); if (x > 0) v = Math.min(v, D[k + bw - 1] + S); }
          D[k] = v;
        }
      Z._field = { x0, z0, x1, z1, bw, D };
    }
  }

  // distance (tiles) from an area's outline; 0 = inside, 99 = far away
  dist(Z, x, z) {
    const F = Z._field;
    if (!F || x < F.x0 || x > F.x1 || z < F.z0 || z > F.z1) return 99;
    return F.D[(z - F.z0) * F.bw + (x - F.x0)];
  }

  density(Z, x, z) {
    const d = this.dist(Z, x, z);
    // full inside, then a soft fringe that the shader turns into wisps
    return d <= 0 ? 1 : smooth(FADE, 0, d) * 0.92;
  }

  rebuild(only = null) {
    const m = this.mask;
    const W = this.w;
    const zones = only ? [only] : ZONES;
    // clear the region(s) we redraw, then stamp every zone overlapping it
    const boxes = zones.map((Z) => { const F = Z._field; return [F.x0, F.x1, F.z0, F.z1]; });
    if (!only) { m.fill(0); for (let i = 0; i < m.length; i++) this.data[i * 2] = 0; }
    for (const [x0, x1, z0, z1] of boxes) {
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          let v = 0;
          const meadow = this.game.grid.meadow[z * W + x];
          for (const Z of ZONES) {
            const lift = this.lifts.find((l) => l.zone === Z);
            if (this.isOpen(Z.id) && !lift) continue;
            let d = this.density(Z, x, z);
            if (d <= 0) continue;
            if (meadow) d = Math.min(d, 0.35); // your own land only gets a thin mist
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
    for (const Z of ZONES) if (this.dist(Z, Math.floor(x), Math.floor(z)) <= 0) return Z;
    return null;
  }

  // has your land touched the edge of a fogged area?
  checkReach() {
    const g = this.game.grid;
    const homes = this.game.villagers?.homeTiles;
    for (const Z of ZONES) {
      if (this.isOpen(Z.id) || !Z._field) continue;
      const F = Z._field;
      let best = null, bd = 1e9;
      for (let z = F.z0; z <= F.z1; z++)
        for (let x = F.x0; x <= F.x1; x++) {
          if (!g.meadow[z * g.w + x]) continue;
          // a villager's own garden clearing doesn't count as reaching the next fog
          if (homes?.has(z * g.w + x)) continue;
          const d = F.D[(z - F.z0) * F.bw + (x - F.x0)];
          // your land reaches the fog's edge (beavers clear up to ~2 tiles out)
          if (d <= 2.5 && d < bd) { bd = d; best = { x: x + 0.5, z: z + 0.5 }; }
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
    const F = Z._field;
    const maxD = F ? Math.max(...[[F.x0, F.z0], [F.x1, F.z0], [F.x0, F.z1], [F.x1, F.z1]].map(([x, z]) => Math.hypot(x - at.x, z - at.z))) : Math.hypot(Z.r + OUT, Z.r + OUT) + Math.hypot(at.x - Z.cx, at.z - Z.cz);
    this.lifts.push({ zone: Z, x: at.x, z: at.z, t: 0, dur: quiet ? 0.01 : 3.6, maxD });
    const L = LANDMARKS.find((l) => l.id === Z.landmark);
    if (quiet) { if (L && !game.state.landmarks.includes(L.id)) game.discoverLandmark(L, { quiet: true }); game.refreshMods?.(); return; }
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
    game.refreshMods?.();
    game.emit('zone', Z);
    game.save();
  }

  // a bobbing paper tag over every closed fog bank: someone lives in there!
  updateTags() {
    const game = this.game;
    const ui = game.ui;
    if (!ui?.screenOf) return;
    const hide = game.titleMode || game.cutscene?.active || game.lab?.active || game.classroom?.active || game.tutorial?.active || game.state.phase === 'night';
    this.tags ||= new Map();
    for (const Z of ZONES) {
      let el = this.tags.get(Z.id);
      const open = this.isOpen(Z.id);
      if (open || hide) { if (el) el.style.display = 'none'; if (open && el) { el.remove(); this.tags.delete(Z.id); } continue; }
      if (!el) {
        el = document.createElement('div');
        el.className = 'fogtag' + (Z.near ? ' near' : '');
        const sil = silhouette(Z.npc?.id);
        el.innerHTML = sil ? `<img class="fogsil" src="${sil}" alt=""><b>?</b>` : '<b>?</b>';
        if (sil) el.classList.add('sil');
        el.addEventListener('click', (ev) => { ev.stopPropagation(); this.showHint(Z); });
        (ui.overlay || document.body).appendChild(el);
        this.tags.set(Z.id, el);
      }
      const q = ui.screenOf(Z.cx, (game.grid.groundAt(Z.cx, Z.cz) || 0) + 4.5, Z.cz);
      const W = window.innerWidth, H = window.innerHeight;
      const vis = q.visible !== false && q.x > -60 && q.y > -60 && q.x < W + 60 && q.y < H + 60;
      el.style.display = vis ? '' : 'none';
      if (vis) el.style.transform = `translate(${Math.round(q.x)}px, ${Math.round(q.y)}px) translate(-50%, -100%)`;
    }
  }

  // tap a fog tag (or the friend quest): a quick look at the fog bank
  async showHint(Z) {
    const game = this.game;
    if (!Z || this.isOpen(Z.id) || game.cutscene?.active) return;
    const g = game.grid;
    // where your land is closest to the fog: that's where to clear
    let best = null, bd = 1e9;
    const F = Z._field;
    if (F) for (let z = F.z0; z <= F.z1; z++) for (let x = F.x0; x <= F.x1; x++) {
      if (!g.meadow[z * g.w + x]) continue;
      const d = F.D[(z - F.z0) * F.bw + (x - F.x0)];
      if (d < bd) { bd = d; best = { x: x + 0.5, z: z + 0.5 }; }
    }
    const trees = best ? Math.max(1, Math.ceil(bd - 2.5)) : null;
    await game.cutscene.play({
      shots: [
        { at: { x: Z.cx, z: Z.cz + 2 }, wupp: 0.05, dur: 1.8, caption: 'Who lives in the fog?', sub: Z.near ? 'A neighbour, just past the trees!' : 'Someone far out in the forest...' },
        ...(best ? [{ at: best, wupp: 0.03, dur: 2, caption: `Clear about ${trees} tile${trees > 1 ? 's' : ''} of forest here`, sub: 'Destroy tool → drag a box → beavers chop!' }] : []),
      ],
    });
  }

  update(dt) {
    const game = this.game;
    this.updateTags();
    for (const l of this.lifts) {
      l.t += dt;
      // puffs of fog blowing off the clearing wave
      if (l.t < l.dur && Math.random() < dt * 14) {
        const a = Math.random() * Math.PI * 2;
        const R = (l.t / l.dur) * (l.maxD + 6);
        const x = l.x + Math.cos(a) * R, z = l.z + Math.sin(a) * R;
        if (this.dist(l.zone, Math.floor(x), Math.floor(z)) < 1.5) game.particles.puff?.(x, game.grid.groundAt(x, z) + 1 + Math.random() * 2, z, 2, 0.6);
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
      if (!game.titleMode && ZONES.some((Z) => !this.isOpen(Z.id) && this.dist(Z, Math.floor(t.x), Math.floor(t.z)) < 4)) game.ui?.tipOnce?.('fog', 'Thick fog! Someone lives in there... Clear the forest up to it.', 'thinking');
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
