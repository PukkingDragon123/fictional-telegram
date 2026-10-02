// Land animals: rabbits, hares and rodents wander in from the woods. They're
// drawn to things you've built (crops, feeders, tall grass...), nibble ripe
// crops, raid snack bowls, and bolt when a bear or the fox comes close. Tap one
// to spot it (encyclopedia + a small bounty); tap again to shoo it away.
// Tame bunnies live in a Bunny Hutch: they hop around the garden (crops nearby
// grow faster, see Harvest.js) and have babies while the hutch has room.
import { SpriteBatch, SPRITE_UNIFORMS } from '../core/spriteBatch.js';
import { MEADOW } from '../world/worldgen.js';
import { LAND_ANIMALS, LAND_BY_ID, LAND_RARITY_WEIGHT, LAND_BOUNTY, TAME_BUNNIES, HUTCH, BUNNY_NAMES } from '../data/landAnimals.js';
import { CROPS } from '../data/crops.js';
import { STORAGE } from '../data/foods.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const FPS = { idle: 4, move: 10, eat: 7, look: 3 };
const SPEED = { hop: 1.5, scurry: 2.1, waddle: 0.75 };
const MAX_WILD = 6;

export class LandAnimals {
  constructor(game) {
    this.game = game;
    this.wild = [];
    this.tame = [];
    this.time = 0;
    this.spawnT = rand(8, 16);
    this.batch = null;
    this.frames = null;
  }

  all() { return [...this.wild, ...this.tame]; }

  sprites() {
    if (!this.batch) {
      const nat = this.game.world.natureFrames();
      this.frames = nat.frames;
      this.batch = new SpriteBatch(nat.tex, { max: 128, lit: true, castShadow: true, receiveShadow: true, renderOrder: 13, name: 'landanimals' });
      this.game.scene.add(this.batch.mesh);
    }
    return this.batch;
  }

  hasArt(id) { this.sprites(); return !!this.frames[`${id}_idle`]?.length; }

  // ------------------------------------------------------------ spawning
  pickSpecies() {
    const game = this.game;
    const night = game.sky.state.night > 0.5;
    const have = new Set(game.structures.list.filter((s) => s.built && !s.removed).map((s) => s.type));
    let tot = 0;
    const ws = [];
    for (const a of LAND_ANIMALS) {
      if (!this.hasArt(a.id)) continue;
      if (!!a.night !== night && (a.night || Math.random() < 0.7)) continue; // day animals sometimes stay up late
      let w = LAND_RARITY_WEIGHT[a.rarity];
      if (a.like.some((t) => have.has(t))) w *= 3;
      ws.push([a, w]); tot += w;
    }
    if (!ws.length) return null;
    let x = Math.random() * tot;
    for (const [a, w] of ws) { x -= w; if (x <= 0) return a; }
    return ws[0][0];
  }

  // a land tile at the edge of your meadow (where the woods begin)
  edgePoint() {
    const g = this.game.grid;
    for (let k = 0; k < 60; k++) {
      const x = Math.floor(rand(MEADOW.x0 - 6, MEADOW.x1 + 6)), z = Math.floor(rand(MEADOW.z0 - 6, MEADOW.z1 + 6));
      if (!g.inb(x, z)) continue;
      const i = z * g.w + x;
      if (!g.meadow[i] || g.isWater(x, z) || g.occ[i] >= 0) continue;
      let edge = false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (g.inb(x + dx, z + dz) && !g.meadow[(z + dz) * g.w + x + dx]) edge = true;
      if (edge) return { x: x + 0.5, z: z + 0.5 };
    }
    return null;
  }

  landPointNear(x, z, r) {
    const g = this.game.grid;
    for (let k = 0; k < 14; k++) {
      const px = x + rand(-r, r), pz = z + rand(-r, r);
      const tx = Math.floor(px), tz = Math.floor(pz);
      if (!g.inb(tx, tz)) continue;
      const i = tz * g.w + tx;
      if (!g.meadow[i] || g.isWater(tx, tz) || g.deco[i] >= 0) continue;
      const s = this.game.structures.structureAtTile(tx, tz);
      if (s && s.def.blocksBear) continue;
      return { x: px, z: pz };
    }
    return null;
  }

  spawnWild() {
    const sp = this.pickSpecies();
    const p = sp && this.edgePoint();
    if (!p) return null;
    const a = this.make(sp.id, p.x, p.z);
    a.sp = sp;
    a.state = 'enter';
    a.home = p;
    a.life = rand(60, 120);
    const inside = this.landPointNear((MEADOW.x0 + MEADOW.x1) / 2 * 0.3 + p.x * 0.7, (MEADOW.z0 + MEADOW.z1) / 2 * 0.3 + p.z * 0.7, 2);
    if (inside) { a.tx = inside.x; a.tz = inside.z; } else { a.tx = p.x; a.tz = p.z; }
    this.wild.push(a);
    return a;
  }

  make(art, x, z) {
    return { art, x, z, y: 0, hopY: 0, state: 'idle', t: rand(0.5, 2), tx: x, tz: z, face: 1, anim: 'idle', at: 0, seed: Math.random() * 9, target: null, mischief: 0, scale: 1 };
  }

  // ------------------------------------------------------------ tame bunnies
  hutches() { return this.game.structures.list.filter((s) => s.built && !s.removed && s.def.hutch); }
  bunniesOf(s) { return this.tame.filter((b) => b.hutch === s); }

  addBunny(s, { breed = pick(TAME_BUNNIES).id, name = pick(BUNNY_NAMES), baby = false } = {}) {
    const p = this.landPointNear(s.x + 0.5, s.z + 0.5, 1.2) || { x: s.x + 0.5, z: s.z + 1.2 };
    const b = this.make(`bunny_${breed}`, p.x, p.z);
    b.tame = true; b.hutch = s; b.breed = breed; b.name = name;
    b.age = baby ? 0 : 999; b.scale = baby ? 0.55 : 1;
    b.sp = { id: `bunny_${breed}`, name: TAME_BUNNIES.find((t) => t.id === breed)?.name || 'Bunny', move: 'hop' };
    this.tame.push(b);
    this.game.structures.updateVisual(s);
    return b;
  }

  // ------------------------------------------------------------ taps
  spot(a) {
    const game = this.game;
    const anchor = { getWorldPos: (v) => v.set(a.x, a.y + 0.8, a.z) };
    if (a.tame) {
      game.particles.hearts(a.x, a.y + 0.5, a.z, 3);
      game.audio.play('pet', { volume: 0.4, pitch: 1.4 });
      game.say(anchor, `${a.name} the ${a.sp.name} ♥`, { mood: 'happy', dur: 1.8, size: 's', key: 'bunny' });
      a.state = 'idle'; a.t = 1.2; a.anim = 'look';
      return;
    }
    const info = LAND_BY_ID[a.sp.id];
    const list = (game.state.landSpotted ||= []);
    game.audio.play('pet', { volume: 0.3, pitch: 1.6 });
    if (list.includes(info.id)) {
      game.say(anchor, `${info.name}! Shoo!`, { mood: 'happy', dur: 1.4, size: 's', key: 'landanimal' });
      this.flee(a);
      return;
    }
    list.push(info.id);
    const pay = LAND_BOUNTY[info.rarity];
    game.earnMisc(pay, 'tips');
    game.particles.sparkle(a.x, a.y + 0.4, a.z, 8, 0xfff2a0);
    game.say(anchor, `NEW ANIMAL! ${info.name}`, { mood: 'excited', dur: 2.4, size: 'm', key: 'landanimal' });
    game.notify(`Animal log ${list.length}/${LAND_ANIMALS.length}! +${pay}`, 'happy');
    game.emit('landSpotted', info);
    a.state = 'look'; a.t = 1.4; a.anim = 'look';
  }

  flee(a) {
    if (a.tame) return;
    a.state = 'flee';
    const p = a.home || this.edgePoint() || { x: a.x, z: a.z };
    a.tx = p.x; a.tz = p.z;
    a.t = 7;
  }

  threat(x, z) {
    const game = this.game;
    let d = Math.hypot(game.fox.x - x, game.fox.z - z);
    for (const b of game.bears.list) if (b.visible) d = Math.min(d, Math.hypot(b.x - x, b.z - z) - 0.5);
    return d;
  }

  // something it likes nearby: a crop, a bowl, a feeder...
  findTarget(a) {
    const game = this.game;
    const like = new Set(LAND_BY_ID[a.sp.id]?.like || ['carrot', 'lettuce']);
    let best = null, bd = 12 * 12;
    for (const s of game.structures.list) {
      if (!s.built || s.removed || !like.has(s.type)) continue;
      const d = (s.x + 0.5 - a.x) ** 2 + (s.z + 0.5 - a.z) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // ------------------------------------------------------------ mischief
  mischief(a, s) {
    const game = this.game;
    const kind = LAND_BY_ID[a.sp.id]?.mischief;
    if (!kind || a.mischief >= 2 || s.removed) return;
    const y = game.structures.baseY(s) + 0.5;
    if (kind === 'nibble' && s.crop?.stage === 3 && s.crop.batch && s.crop.batch.n > 1) {
      s.crop.batch.n--;
      a.mischief++;
      game.particles.word('nom', s.x + 0.5, y + 0.4, s.z + 0.5, { size: 0.22, life: 0.8 });
      game.particles.leaf?.(s.x + 0.5, y, s.z + 0.5, 0x7ad04a);
      game.emit('landMischief', { a, s, kind });
    } else if (kind === 'steal' && STORAGE[s.type] && game.foodStore.stored(s) > 0) {
      game.foodStore.takeFrom(s);
      a.mischief++;
      game.particles.word('nom', s.x + 0.5, y + 0.4, s.z + 0.5, { size: 0.22, life: 0.8 });
      game.emit('landMischief', { a, s, kind });
      this.flee(a);
    } else if (kind === 'stash' && s.crop && s.crop.stage < 3) {
      s.crop.t = Math.max(0, s.crop.t - 4);
      a.mischief++;
    }
  }

  // ------------------------------------------------------------ update
  update(dt) {
    const game = this.game;
    this.time += dt;
    const phase = game.state.phase;
    const quiet = phase === 'rush' || phase === 'report' || phase === 'gameover';
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = rand(14, 30);
      if (!quiet && this.wild.length < MAX_WILD) this.spawnWild();
    }
    // tame bunnies: two move in with a new hutch; babies when there's room
    for (const s of this.hutches()) {
      if (!s.bunnyInit) { s.bunnyInit = true; if (!this.bunniesOf(s).length) { this.addBunny(s); this.addBunny(s); } }
      s.babyT = (s.babyT ?? HUTCH.babyEvery) - dt;
      if (s.babyT <= 0) {
        s.babyT = HUTCH.babyEvery * rand(0.8, 1.3);
        const n = this.bunniesOf(s).length;
        if (n >= 2 && n < HUTCH.cap) {
          const mum = pick(this.bunniesOf(s));
          const b = this.addBunny(s, { breed: mum.breed, baby: true });
          game.particles.hearts(b.x, 0.5, b.z, 4);
          game.ui?.floatTextAt?.(b.x, 0.9, b.z, 'New bunny!', '#ffd0e8');
          game.emit('bunnyBorn', b);
        }
      }
    }
    for (const b of this.tame) if (b.hutch.removed) b.gone = true;
    this.tame = this.tame.filter((b) => !b.gone);
    for (const a of this.wild) this.step(a, dt);
    for (const a of this.tame) this.step(a, dt);
    this.wild = this.wild.filter((a) => !a.gone);
    this.render(dt);
  }

  step(a, dt) {
    const game = this.game;
    const g = game.grid;
    const sp = LAND_BY_ID[a.sp.id] || a.sp;
    const speed = SPEED[sp.move] || 1.2;
    a.t -= dt;
    if (a.tame && a.age < 60) { a.age += dt; a.scale = 0.55 + 0.45 * Math.min(1, a.age / 60); }
    if (!a.tame) {
      a.life -= dt;
      if (a.state !== 'flee' && this.threat(a.x, a.z) < 1.7) this.flee(a);
      if (a.life <= 0 && a.state !== 'flee') this.flee(a);
    }
    let moving = false, run = 1;
    switch (a.state) {
      case 'enter':
      case 'goto': {
        moving = true;
        if (Math.hypot(a.tx - a.x, a.tz - a.z) < 0.35) {
          if (a.state === 'goto' && a.target && !a.target.removed) { a.state = 'eat'; a.t = rand(2.5, 4.5); a.eatS = a.target; }
          else { a.state = 'idle'; a.t = rand(0.8, 2); }
        }
        break;
      }
      case 'eat': {
        a.anim = 'eat';
        if (Math.random() < dt * 1.5) game.particles.leaf?.(a.x, a.y + 0.2, a.z, 0x8ad050);
        if (a.t <= 0) {
          if (!a.tame && a.eatS) this.mischief(a, a.eatS);
          else if (a.tame && a.eatS?.crop) game.particles.sparkle(a.x, a.y + 0.3, a.z, 2, 0xc8ff9a); // fertilizing!
          a.eatS = null; a.target = null;
          a.state = 'idle'; a.t = rand(1, 2.5);
        }
        break;
      }
      case 'flee': {
        moving = true; run = 1.8;
        if (Math.hypot(a.tx - a.x, a.tz - a.z) < 0.4 || a.t <= 0) a.gone = true;
        break;
      }
      case 'look': a.anim = 'look'; if (a.t <= 0) { a.state = 'idle'; a.t = rand(0.5, 1.5); } break;
      default: {
        // idle: think about what to do next
        a.anim = a.t > 0.6 && Math.sin(this.time * 0.7 + a.seed) > 0.85 ? 'look' : 'idle';
        if (a.t > 0) break;
        const r = Math.random();
        const cx = a.tame ? a.hutch.x + 0.5 : a.x, cz = a.tame ? a.hutch.z + 0.5 : a.z;
        if (r < 0.4) {
          const tgt = a.tame ? this.nearCrop(a) : this.findTarget(a);
          if (tgt) {
            const p = this.landPointNear(tgt.x + 0.5, tgt.z + 0.5, 0.7) || { x: tgt.x + 0.5, z: tgt.z + 1 };
            a.target = tgt; a.tx = p.x; a.tz = p.z; a.state = 'goto'; break;
          }
        }
        if (r < 0.85) {
          const p = this.landPointNear(cx, cz, a.tame ? 2.4 : 3);
          if (p) { a.tx = p.x; a.tz = p.z; a.state = 'enter'; break; }
        }
        a.t = rand(1, 3);
        break;
      }
    }
    if (moving) {
      const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
      if (d > 0.01) {
        // rabbits move in hops: fast in the air, a pause on landing
        let sp2 = speed * run;
        if (sp.move === 'hop') { const ph = (this.time * 2.4 * run + a.seed) % 1; a.hopY = Math.sin(Math.min(1, ph / 0.7) * Math.PI) * 0.16 * (ph < 0.7 ? 1 : 0); sp2 *= ph < 0.7 ? 1.4 : 0.1; }
        else a.hopY = 0;
        const step = Math.min(d, sp2 * dt);
        a.x += (dx / d) * step; a.z += (dz / d) * step;
        a.face = this.faceOf(dx, dz, a.face);
      }
      a.anim = 'move';
    } else a.hopY *= 0.8;
    const tx = Math.floor(a.x), tz = Math.floor(a.z);
    a.y = g.inb(tx, tz) ? g.surfaceY(tx, tz) : 0;
  }

  nearCrop(a) {
    const L = this.game.structures.list.filter((s) => s.built && !s.removed && CROPS[s.type] && Math.abs(s.x - a.hutch.x) <= 3 && Math.abs(s.z - a.hutch.z) <= 3);
    return L.length ? pick(L) : null;
  }

  faceOf(vx, vz, prev) {
    const r = SPRITE_UNIFORMS.uCamRight.value;
    const d = vx * r.x + vz * r.z;
    if (Math.abs(d) < 1e-3) return prev;
    return d > 0 ? 1 : -1;
  }

  render() {
    const B = this.sprites();
    B.clear();
    const F = this.frames;
    for (const a of [...this.wild, ...this.tame]) {
      const name = `${a.art}_${a.anim}`;
      const fr = F[name] || F[`${a.art}_idle`];
      if (!fr?.length) continue;
      if (a.anim !== a.lastAnim) { a.lastAnim = a.anim; a.at = 0; }
      a.at += 1 / 60;
      const idx = Math.floor((this.time + a.seed) * (FPS[a.anim] || 5)) % fr.length;
      const sz = (LAND_BY_ID[a.sp.id]?.size ? 1 : 1) * a.scale;
      B.push(fr[idx], a.x, a.y + a.hopY, a.z, { texels: 24, scale: sz, flip: a.face < 0 });
    }
    B.commit();
  }

  // ------------------------------------------------------------ save
  serialize() { return { tame: this.tame.map((b) => [b.hutch.x, b.hutch.z, b.breed, b.name, +Math.min(999, b.age).toFixed(0)]) }; }

  load(d) {
    this.wild.length = 0;
    this.tame.length = 0;
    const hs = this.hutches();
    for (const [hx, hz, breed, name, age] of d?.tame || []) {
      const s = hs.find((h) => h.x === hx && h.z === hz);
      if (!s) continue;
      s.bunnyInit = true;
      const b = this.addBunny(s, { breed, name, baby: age < 60 });
      b.age = age;
    }
  }

  clear() { this.wild.length = 0; this.tame.length = 0; }
}
