// Bugs: grown in bug farms (and turning up wild), eaten by ducks, geese and
// leaping fish. While a farm has bugs it gives everything inside its circle a
// boost (growth, breeding, size, luck, hatching, charm) and you can see that
// circle when placing or tapping the farm.
import * as THREE from 'three';
import { SpriteBatch, SPRITE_UNIFORMS } from '../core/spriteBatch.js';
import { WATER_Y } from '../world/grid.js';
import { MEADOW } from '../world/worldgen.js';
import { BUGS, BUG_BY_ID, BUG_FARMS, EFFECTS, WILD_DAY, WILD_NIGHT } from '../data/bugs.js';

const bugArtMods = import.meta.glob('../art/extra/bugArt.js', { eager: true });
const BUG_ART = bugArtMods['../art/extra/bugArt.js']?.BUG_ART || {};
const KEYS = Object.keys(EFFECTS);
const BUG_TEXELS = 32; // bug art is drawn chunky; shrink it next to the ducks
const FALLBACK = { dragonfly: 'dragonfly', damselfly: 'dragonfly', mayfly: 'dragonfly', monarch: 'monarch', bumblebee: 'bee', firefly: 'firefly_big', lunamoth: 'monarch', mosquito: 'bee', junebug: 'bee' };
const rand = (a, b) => a + Math.random() * (b - a);

function pickWeighted(w, filter = null) {
  let tot = 0;
  for (const [k, v] of Object.entries(w)) if (!filter || filter(k)) tot += v;
  if (tot <= 0) return null;
  let x = Math.random() * tot;
  for (const [k, v] of Object.entries(w)) {
    if (filter && !filter(k)) continue;
    x -= v;
    if (x <= 0) return k;
  }
  return null;
}

export class BugSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.time = 0;
    this.wildT = 4;
    const nat = game.world.natureFrames();
    this.frames = nat.frames;
    this.batch = new SpriteBatch(nat.tex, { max: 420, lit: true, castShadow: false, receiveShadow: true, renderOrder: 14, name: 'bugs' });
    game.scene.add(this.batch.mesh);
    const g = game.grid;
    this.aura = {};
    for (const k of KEYS) this.aura[k] = new Float32Array(g.w * g.h);
    this.auraT = 0;
    this._out = {};
    this.rings = new THREE.Group();
    this.rings.renderOrder = 30;
    game.scene.add(this.rings);
    this.ringPool = [];
    this.shown = new Map(); // structure -> seconds left
    this.hoverRing = null;
    this.seen = new Set(); // bug ids the player has met (for the bug log)
  }

  farmDef(s) { return BUG_FARMS[s.type] || null; }

  // ------------------------------------------------------------ spawning
  spawnFrom(s) {
    const d = this.farmDef(s);
    if (!d) return null;
    const night = this.game.sky.state.night;
    const id = pickWeighted(d.kinds, (k) => {
      const b = BUG_BY_ID[k];
      if (!b) return false;
      if (b.night && !night) return false;
      return true;
    });
    if (!id) return null;
    return this.spawn(id, s.x + 0.5 + rand(-0.6, 0.6), s.z + 0.5 + rand(-0.6, 0.6), { source: s, radius: Math.min(d.radius * 0.65, 2.6) });
  }

  spawn(id, x, z, { source = null, radius = 2, life = Infinity } = {}) {
    const sp = BUG_BY_ID[id];
    if (!sp) return null;
    const g = this.game.grid;
    const b = {
      sp, source, hx: x, hz: z, x, z, y: g.groundAt(x, z) + (sp.move === 'fly' ? 0.6 : 0.02),
      radius, life, ang: Math.random() * 6.28, spd: rand(0.7, 1.3) * (Math.random() < 0.5 ? 1 : -1),
      t: rand(0.5, 3), tx: x, tz: z, dipT: rand(3, 9), dipping: 0, hop: 0, face: 1, seed: Math.random() * 10,
      dead: false, targeted: null, landed: 0,
    };
    this.list.push(b);
    if (source) source.bugCount = (source.bugCount || 0) + 1;
    return b;
  }

  wildSpawn() {
    const game = this.game;
    const wild = this.list.filter((b) => !b.source).length;
    if (wild >= 14) return;
    const night = game.sky.state.night;
    const id = pickWeighted(night ? WILD_NIGHT : WILD_DAY);
    if (!id) return;
    const g = game.grid;
    for (let k = 0; k < 12; k++) {
      const x = rand(MEADOW.x0 + 3, MEADOW.x1 - 3), z = rand(MEADOW.z0 + 3, MEADOW.z1 - 2);
      const ix = Math.floor(x), iz = Math.floor(z);
      if (!g.inb(ix, iz) || !g.meadow[iz * g.w + ix]) continue;
      const water = g.isWater(ix, iz);
      const sp = BUG_BY_ID[id];
      if (water && sp.move !== 'fly' && sp.move !== 'skate') continue;
      if (!water && sp.move === 'skate') continue;
      this.spawn(id, x, z, { radius: 3, life: rand(70, 130) });
      return;
    }
  }

  alive(s) { return s.bugCount || 0; }

  // ------------------------------------------------------------ eating
  // fish leap at flying bugs that dip to the water
  nearestDipping(x, z, r, region) {
    let best = null, bd = r * r;
    const g = this.game.grid;
    for (const b of this.list) {
      if (b.dead || b.targeted || b.dipping <= 0 || b.y > WATER_Y + 0.5) continue;
      if (g.regionAt(b.x, b.z) !== region) continue;
      const d = (b.x - x) ** 2 + (b.z - z) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ducks & geese: bugs they can reach (on the ground, on the water, or flying low)
  nearestFor(x, z, r, { swimming = false } = {}) {
    let best = null, bd = r * r;
    const g = this.game.grid;
    for (const b of this.list) {
      if (b.dead || b.targeted) continue;
      const low = b.sp.move !== 'fly' || b.dipping > 0 || b.landed > 0;
      if (!low) continue;
      const wet = g.isWater(Math.floor(b.x), Math.floor(b.z));
      if (wet !== swimming && b.sp.move !== 'fly') continue;
      const d = (b.x - x) ** 2 + (b.z - z) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  eat(b, who = null) {
    if (!b || b.dead) return null;
    b.dead = true;
    if (b.source) b.source.bugCount = Math.max(0, (b.source.bugCount || 1) - 1);
    this.game.stats.bugsEaten = (this.game.stats.bugsEaten || 0) + 1;
    this.game.particles.puff?.(b.x, b.y + 0.05, b.z, 3, 0.12);
    if (!this.seen.has(b.sp.id)) { this.seen.add(b.sp.id); this.game.emit('bugSeen', b.sp); }
    this.game.emit('bugEaten', { bug: b.sp, who });
    return b.sp;
  }

  // ------------------------------------------------------------ aura
  // boosts at a world point: { growth, breed, size, luck, hatch, charm } (0 = none)
  auraAt(x, z) {
    const g = this.game.grid;
    const ix = Math.floor(x), iz = Math.floor(z);
    const o = this._out;
    if (!g.inb(ix, iz)) { for (const k of KEYS) o[k] = 0; return o; }
    const i = iz * g.w + ix;
    for (const k of KEYS) o[k] = this.aura[k][i];
    return o;
  }

  farmStrength(s) {
    const d = this.farmDef(s);
    if (!d || !s.built) return 0;
    const n = this.alive(s);
    if (!n) return 0;
    return 0.5 + 0.5 * Math.min(1, n / d.max);
  }

  rebuildAura() {
    const g = this.game.grid;
    for (const k of KEYS) this.aura[k].fill(0);
    let charm = 0;
    for (const s of this.game.structures.list) {
      if (s.removed) continue;
      const d = this.farmDef(s);
      if (!d) continue;
      const k = this.farmStrength(s);
      if (!k) continue;
      const cx = s.x + 0.5, cz = s.z + 0.5, R = d.radius;
      for (let z = Math.floor(cz - R); z <= Math.ceil(cz + R); z++)
        for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
          if (!g.inb(x, z)) continue;
          if ((x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2 > R * R) continue;
          const i = z * g.w + x;
          for (const [key, v] of Object.entries(d.aura)) this.aura[key][i] = Math.min(1.2, this.aura[key][i] + v * k);
        }
      charm += (d.aura.charm || 0) * k * 6;
    }
    this.charmBonus = charm;
  }

  // ------------------------------------------------------------ circles
  ringMesh() {
    let r = this.ringPool.pop();
    if (r) return r;
    const geo = new THREE.RingGeometry(0.94, 1, 64, 1);
    geo.rotateX(-Math.PI / 2);
    const disc = new THREE.CircleGeometry(1, 48);
    disc.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
    const dmat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.13, depthTest: false, depthWrite: false });
    r = new THREE.Group();
    const ring = new THREE.Mesh(geo, mat);
    const fill = new THREE.Mesh(disc, dmat);
    ring.renderOrder = 31; fill.renderOrder = 30;
    r.add(fill, ring);
    r.userData = { ring, fill };
    return r;
  }

  colorFor(d) {
    const keys = Object.keys(d.aura || {});
    keys.sort((a, b) => d.aura[b] - d.aura[a]);
    return new THREE.Color(EFFECTS[keys[0]]?.color || '#ffffff');
  }

  setRing(r, x, z, R, col, k) {
    const g = this.game.grid;
    r.position.set(x, g.groundAt(x, z) + 0.08, z);
    r.scale.setScalar(R);
    r.userData.ring.material.color.copy(col);
    r.userData.fill.material.color.copy(col);
    r.userData.ring.material.opacity = 0.9 * k;
    r.userData.fill.material.opacity = 0.14 * k;
    r.visible = k > 0.01;
  }

  // show a farm's circle for a few seconds (tap / just built)
  showRing(s, dur = 5) { if (this.farmDef(s)) this.shown.set(s, dur); }

  // ghost preview while placing a farm
  previewRing(type, x, z) {
    const d = BUG_FARMS[type];
    if (!d) { if (this.hoverRing) this.hoverRing.visible = false; return; }
    if (!this.hoverRing) { this.hoverRing = this.ringMesh(); this.rings.add(this.hoverRing); }
    this.setRing(this.hoverRing, x + 0.5, z + 0.5, d.radius, this.colorFor(d), 0.9);
  }

  updateRings(dt) {
    const game = this.game;
    const tool = game.tool;
    const showAll = (tool.kind === 'build' && (BUG_FARMS[tool.type] || STRUCT_NEST.has(tool.type))) || game.ui?.blueprint?.tab === 'farm';
    if (!(tool.kind === 'build' && BUG_FARMS[tool.type]) && this.hoverRing) this.hoverRing.visible = false;
    for (const [s, t] of this.shown) { if (t - dt <= 0 || s.removed) this.shown.delete(s); else this.shown.set(s, t - dt); }
    let used = 0;
    const kids = this.rings.children.filter((c) => c !== this.hoverRing);
    for (const s of game.structures.list) {
      if (s.removed) continue;
      const d = this.farmDef(s);
      if (!d || !Object.keys(d.aura).length) continue;
      const t = this.shown.get(s) || 0;
      if (!showAll && t <= 0) continue;
      let r = kids[used];
      if (!r) { r = this.ringMesh(); this.rings.add(r); kids.push(r); }
      used++;
      const pulse = 0.85 + 0.15 * Math.sin(this.time * 4);
      const k = (showAll ? 0.75 : Math.min(1, t)) * (this.farmStrength(s) ? 1 : 0.45) * pulse;
      this.setRing(r, s.x + 0.5, s.z + 0.5, d.radius, this.colorFor(d), k);
    }
    for (let i = used; i < kids.length; i++) kids[i].visible = false;
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const game = this.game;
    this.time += dt;
    const g = game.grid;
    const night = game.sky.state.night;
    const mods = game.mods;
    // farms grow bugs
    for (const s of game.structures.list) {
      if (s.removed || !s.built) continue;
      const d = this.farmDef(s);
      if (!d) continue;
      if (d.night && !night) { s.bugT = Math.min(s.bugT ?? 2, 2); continue; }
      s.bugT = (s.bugT ?? rand(1, d.every)) - dt * (mods.bugMult || 1) * (night && !d.night ? 0.5 : 1);
      if (s.bugT <= 0) {
        s.bugT = d.every * rand(0.8, 1.2);
        if (this.alive(s) < d.max + (mods.bugBonus || 0) && this.list.length < 380) this.spawnFrom(s);
      }
    }
    this.wildT -= dt;
    if (this.wildT <= 0) { this.wildT = rand(4, 8); if (game.state.phase !== 'title') this.wildSpawn(); }

    for (const b of this.list) {
      if (b.dead) continue;
      if (b.source && b.source.removed) { b.dead = true; continue; }
      if (b.life !== Infinity) { b.life -= dt; if (b.life <= 0) { b.dead = true; continue; } }
      // night bugs fade out at sunrise
      if (b.sp.night && !night && Math.random() < dt * 0.05) { b.dead = true; if (b.source) b.source.bugCount = Math.max(0, b.source.bugCount - 1); continue; }
      this.move(b, dt, g);
    }
    let n = 0;
    for (const b of this.list) if (!b.dead) this.list[n++] = b;
    this.list.length = n;

    this.auraT -= dt;
    if (this.auraT <= 0) { this.auraT = 1.2; this.rebuildAura(); }
    this.updateRings(dt);
    this.render();
  }

  move(b, dt, g) {
    const T = this.time;
    const parts = this.game.particles;
    const mv = b.sp.move;
    const ground = g.groundAt(b.x, b.z);
    if (mv === 'fly') {
      b.ang += b.spd * dt * 0.9;
      const tx = b.hx + Math.cos(b.ang) * b.radius + Math.sin(T * 1.7 + b.seed) * 0.35;
      const tz = b.hz + Math.sin(b.ang) * b.radius * 0.8 + Math.cos(T * 1.3 + b.seed) * 0.35;
      let ty = ground + 0.6 + Math.sin(T * 2 + b.seed) * 0.18;
      b.dipT -= dt;
      if (b.dipT <= 0 && b.landed <= 0 && b.dipping <= 0) {
        b.dipT = rand(4, 10);
        if (g.isWater(Math.floor(b.x), Math.floor(b.z))) b.dipping = 1.6;
        else if (Math.random() < 0.5) b.landed = rand(1.5, 3.5);
      }
      if (b.dipping > 0) {
        b.dipping -= dt;
        ty = WATER_Y + 0.12;
        if (Math.random() < dt * 2) parts.ripple(b.x, b.z, 0.2, 0.6, 0.3);
      } else if (b.landed > 0) {
        b.landed -= dt;
        ty = ground + 0.05;
      } else b.targeted = null;
      const dx = tx - b.x, dz = tz - b.z;
      const k = Math.min(1, dt * (b.landed > 0 ? 0.3 : 2.5));
      if (Math.abs(dx) > 1e-3) b.vxs = dx;
      b.x += dx * k; b.z += dz * k;
      b.y += (ty - b.y) * Math.min(1, dt * 3);
      if (b.sp.glow && Math.random() < dt * 1.5) parts.sparkle?.(b.x, b.y, b.z, 1, b.sp.id === 'lunamoth' ? 0xc8ffd0 : 0xfff2a0);
    } else {
      // crawl / hop / skate: wander between random points near home
      b.t -= dt;
      if (b.t <= 0) {
        b.t = rand(1.2, 3.5);
        for (let k = 0; k < 6; k++) {
          const a = Math.random() * 6.28, r = Math.random() * b.radius;
          const x = b.hx + Math.cos(a) * r, z = b.hz + Math.sin(a) * r;
          const wet = g.isWater(Math.floor(x), Math.floor(z));
          if ((mv === 'skate') === wet) { b.tx = x; b.tz = z; break; }
        }
        if (mv === 'hop') b.hop = 0.35;
      }
      const sp = mv === 'skate' ? 1.1 : mv === 'hop' ? (b.hop > 0 ? 2.2 : 0) : 0.28;
      const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
      if (d > 0.02 && sp > 0) {
        const st = Math.min(d, sp * dt);
        b.x += (dx / d) * st; b.z += (dz / d) * st;
        b.vxs = dx;
      }
      if (b.hop > 0) b.hop -= dt;
      const base = mv === 'skate' ? WATER_Y + 0.01 : ground + 0.01;
      b.y = base + (b.hop > 0 ? Math.sin((b.hop / 0.35) * Math.PI) * 0.25 : 0);
      if (mv === 'skate' && Math.random() < dt * 0.8) parts.ripple(b.x, b.z, 0.12, 0.5, 0.2);
    }
  }

  render() {
    const B = this.batch;
    B.clear();
    const T = this.time;
    const r = SPRITE_UNIFORMS.uCamRight.value;
    for (const b of this.list) {
      if (b.dead) continue;
      let name = `bug_${b.sp.id}`;
      let fr = this.frames[name];
      if (!fr || !fr.length) { name = FALLBACK[b.sp.id] || 'bee'; fr = this.frames[name]; }
      if (!fr || !fr.length) continue;
      const A = BUG_ART[b.sp.id]?.anim;
      let seq = null;
      if (A) {
        if (A.hop && b.hop > 0) seq = A.hop;
        else if (A.ball && (b.targeted || b.curl > 0)) seq = A.ball;
        else seq = A.fly || A.walk || null;
        if (b.sp.id === 'monarch' && fr.length >= 3) seq = [0, 1, 2, 1];
      }
      const moving = b.sp.move === 'fly' ? b.landed <= 0 : (b.sp.move === 'hop' ? true : Math.hypot(b.tx - b.x, b.tz - b.z) > 0.03);
      const k = Math.floor(T * (b.sp.move === 'fly' ? 14 : 6) + b.seed);
      const fi = seq ? seq[(moving ? k : 0) % seq.length] % fr.length : moving ? k % fr.length : 0;
      B.push(fr[fi], b.x, b.y, b.z, { texels: FALLBACK[b.sp.id] === name ? 24 : BUG_TEXELS, flip: this.flipFor(b, r), emissive: b.sp.glow && this.game.sky.state.night ? 0.9 : 0 });
    }
    B.commit();
  }

  // art faces right: mirror when the bug heads left on screen
  flipFor(b, r) {
    if (b.vxs == null) return false;
    const vx = b.vxs, vz = (b.tz ?? b.hz) - b.z;
    const d = vx * r.x + (b.sp.move === 'fly' ? 0 : vz * r.z);
    if (Math.abs(d) > 1e-3) b.flip = d < 0;
    return !!b.flip;
  }

  // ------------------------------------------------------------ info
  farmInfo(s) {
    const d = this.farmDef(s);
    if (!d) return null;
    const kinds = Object.keys(d.kinds).map((k) => BUG_BY_ID[k]).filter(Boolean);
    return { def: d, kinds, alive: this.alive(s), strength: this.farmStrength(s) };
  }

  serialize() { return { seen: [...this.seen] }; }
  load(d) {
    this.seen = new Set(d?.seen || []);
    for (const b of this.list) b.dead = true;
    this.list.length = 0;
    for (const s of this.game.structures.list) s.bugCount = 0;
  }
}

const STRUCT_NEST = new Set(['duck_nest', 'goose_nest']);
export { BUGS, EFFECTS, BUG_FARMS };
