// Juicy fish eating: the gulp animation (mouth stretches forward, SNAP shut,
// a cheek bulge that travels down the body as the bite is swallowed), plus
// the eat moment's effects: crumbs in the food's colour, bubbles, a surface
// ring, a tiny comic word, hearts / sparkles for fancy food and throttled
// slurp / munch / gulp sounds pitched by fish size. Particles go through the
// pooled FX batch (Particles.fx), so a feeding frenzy of 60+ fish stays cheap.
import { FX } from './Particles.js';
import { WATER_Y } from '../world/grid.js';
import { FOOD_ITEMS } from '../data/foods.js';
import { SPRITE_UNIFORMS } from '../core/spriteBatch.js';

const LUNGE_T = 0.25;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];

// food colours as bright 0..1 tints (cached per item)
const TINTS = new Map();
function foodTints(item) {
  let t = TINTS.get(item);
  if (!t) {
    const list = FOOD_ITEMS[item]?.pellet || [0xb8742e];
    t = list.map((h) => [((h >> 16) & 255) / 255 * 1.15, ((h >> 8) & 255) / 255 * 1.15, (h & 255) / 255 * 1.15]);
    TINTS.set(item, t);
  }
  return t;
}
const WEED_TINTS = [[0.42, 0.85, 0.3], [0.3, 0.66, 0.24], [0.62, 0.95, 0.4]];
const BUG_TINTS = [[0.3, 0.6, 1.0], [0.88, 0.96, 1.05], [0.25, 0.4, 0.8]];

// how big the fish looks (1 = a normal adult bluegill)
export function fishBulk(f) {
  const grow = f.adult ? 1 : 0.45 + 0.4 * Math.min(1, (f.age || 0) / 70);
  return (f.sp.size || 1) * (f.g?.size || 1) * grow;
}

// ------------------------------------------------------------ gulp animation
// kind: 'bite' (pellets), 'nibble' (seaweed), 'snap' (bug at the top of a jump)
export function startGulp(f, kind = 'bite', k = 1) {
  const bulk = fishBulk(f);
  const dur = kind === 'nibble' ? 0.24 : (0.36 + 0.1 * Math.min(2, bulk)) * (kind === 'snap' ? 1.15 : 1);
  f.gulp = { t: 0, dur, k, kind };
}

export function tickGulp(f, dt) {
  const g = f.gulp;
  g.t += dt;
  if (g.t >= g.dur) f.gulp = null;
}

export function startLunge(f) { f.lungeT = LUNGE_T; }

// body shape at this moment of the gulp:
// sx/sy = squash-stretch, shift = forward offset (fraction of body length),
// c = where the bulge sits (0 tail .. 1 head), A = bulge height
const _pose = { sx: 1, sy: 1, shift: 0, c: 0.9, A: 0 };
export function gulpPose(g, out = _pose) {
  const u = Math.min(1, g.t / g.dur), k = g.k;
  if (u < 0.2) {
    // mouth reaches forward: long and thin, the head leads
    const e = Math.sin((u / 0.2) * Math.PI * 0.5);
    out.sx = 1 + 0.26 * k * e; out.sy = 1 - 0.12 * k * e;
    out.shift = 0.5 * (out.sx - 1); out.c = 0.95; out.A = 0.1 * k * e;
  } else if (u < 0.3) {
    // SNAP shut: short, fat, cheeks puffed
    const e = (u - 0.2) / 0.1;
    out.sx = 1 + 0.26 * k - 0.42 * k * e; out.sy = 1 - 0.12 * k + 0.24 * k * e;
    out.shift = 0.13 * k * (1 - e) - 0.03 * k * e; out.c = 0.95 - 0.1 * e; out.A = 0.1 * k + 0.32 * k * e;
  } else {
    // swallow: the lump travels to the tail while the body wobbles back
    const v = (u - 0.3) / 0.7, d = 1 - v, w = Math.cos(v * Math.PI * 3);
    out.sx = 1 - 0.16 * k * d * w; out.sy = 1 + 0.12 * k * d * w;
    out.shift = -0.03 * k * d; out.c = 0.85 - 0.7 * v; out.A = 0.42 * k * Math.pow(d, 0.7);
  }
  return out;
}

// Push a gulping fish into the sprite batch as a few vertical slices so the
// bulge can travel along the body. All slices share the fish's pivot (via
// per-slice anchors), so rotation and squash keep them seamless.
const _sub = { x: 0, y: 0, w: 0, h: 0 };
const _so = {};
export function pushGulp(B, fr, x, y, z, o, f, rx, rz) {
  const p = gulpPose(f.gulp);
  const W = fr.w;
  const dir = o.flip ? -1 : 1;
  const bodyW = (W / (o.texels || 24)) * (o.scale ?? 1);
  // forward shift (rotated with the sprite) so the mouth leads and the tail stays
  const s = p.shift * bodyW * dir, rot = o.rot || 0;
  const len = Math.hypot(rx, rz) || 1;
  const sxw = s * Math.cos(rot);
  x += (rx / len) * sxw; z += (rz / len) * sxw;
  y += s * Math.sin(rot) * SPRITE_UNIFORMS.uHeightComp.value;
  Object.assign(_so, o);
  _so.bend = 0; _so.sway = 0; _so.w = undefined; _so.h = undefined; _so.sx = p.sx;
  const n = Math.max(3, Math.min(7, Math.round(W / 5)));
  const ax0 = o.ax ?? 0.5;
  for (let i = 0; i < n; i++) {
    const c0 = Math.round((i * W) / n), c1 = Math.round(((i + 1) * W) / n);
    if (c1 <= c0) continue;
    const u = (c0 + c1) / (2 * W);
    const bz = (u - p.c) / 0.2;
    _so.sy = p.sy * (1 + p.A * Math.exp(-bz * bz));
    // where this slice's left edge sits relative to the pivot (in texels)
    const gl = (o.flip ? W - c1 : c0) - W * ax0;
    _so.ax = -gl / (c1 - c0);
    _sub.x = fr.x + c0; _sub.y = fr.y; _sub.w = c1 - c0; _sub.h = fr.h;
    B.push(_sub, x, y, z, _so);
  }
}

// a fish mid-lunge: stretched along its swim direction
export function lungeScale(f, o) {
  const k = Math.max(0, f.lungeT) / LUNGE_T;
  o.sx = 1 + 0.18 * k; o.sy = 1 - 0.1 * k;
  o.bend = Math.max(o.bend || 0, 1.3 * k);
}

// ------------------------------------------------------------ effects
export class FishEatFx {
  constructor(game) {
    this.game = game;
    this.noise = 0; // recent eat sounds (leaky): keeps a frenzy from getting loud
    this.sfxCd = 0;
    this.wordCd = 0;
    this.busy = 0; // recent eat effects (leaky): fewer particles when lots happen
  }

  update(dt) {
    this.noise = Math.max(0, this.noise - dt * 2.5);
    this.busy = Math.max(0, this.busy - dt * 4);
    this.sfxCd -= dt;
    this.wordCd -= dt;
  }

  // world position of the fish's mouth (on screen the head points left/right)
  mouth(f, out = {}) {
    const e = this.game.rig.camera.matrixWorld.elements;
    const len = Math.hypot(e[0], e[2]) || 1;
    const dir = f.flip ? -1 : 1;
    const half = 0.32 * fishBulk(f);
    const rot = f.jump ? (f.flip ? 1 : -1) * Math.cos(Math.min(1, f.jump.t) * Math.PI) * 0.9 : 0;
    out.x = f.x + (e[0] / len) * dir * half * Math.cos(rot);
    out.z = f.z + (e[2] / len) * dir * half * Math.cos(rot);
    out.y = f.y + dir * half * Math.sin(rot);
    return out;
  }

  sound(f, kind) {
    if (this.sfxCd > 0 || this.noise > 4) return;
    const bulk = fishBulk(f);
    let name;
    if (kind === 'nibble') name = 'fish_nibble';
    else if (kind === 'snap') name = 'fish_snap';
    else if (!f.adult && bulk < 0.75) name = 'fish_pip';
    else if (bulk > 1.35) name = Math.random() < 0.75 ? 'fish_gulp' : 'fish_nom';
    else name = Math.random() < 0.55 ? 'fish_nom' : 'fish_slurp';
    const pitch = Math.max(0.55, Math.min(2, 1.25 / Math.sqrt(Math.max(0.3, bulk)))) * rnd(0.92, 1.08);
    const vol = (kind === 'snap' ? 0.5 : kind === 'nibble' ? 0.22 : 0.34) / (1 + this.noise * 0.55);
    this.game.audio.play(name, { volume: vol, pitch });
    this.noise += 1;
    this.sfxCd = kind === 'nibble' ? 0.1 : 0.06;
  }

  word(id, x, z, size, force = false) {
    if (!force && this.wordCd > 0) return;
    this.wordCd = 0.3;
    this.game.particles.word(id, x, WATER_Y + 0.28, z, { size, life: 0.85, vy: 0.9 });
  }

  // a ring on the surface above the bite, plus a couple of tiny hops
  surface(x, z, size, n = 1) {
    const P = this.game.particles;
    const F = P.fx;
    F.spawn('ring_l', x, WATER_Y + 0.012, z, { life: 0.6, size: 0.26 * size, flags: FX.FLAT | FX.FADE | FX.GROW, tint: [0.92, 0.98, 1.05], bright: true });
    F.spawn('ring', x, WATER_Y + 0.014, z, { life: 0.42, size: 0.13 * size, flags: FX.FLAT | FX.FADE | FX.GROW, tint: [1, 1, 1], bright: true });
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      F.spawn('drop_s', x, WATER_Y + 0.04, z, { vx: Math.cos(a) * 0.5, vy: 1.1 + Math.random() * 0.6, vz: Math.sin(a) * 0.5, grav: 8, life: 0.6, size: 0.045, flags: FX.WATER, bright: true });
    }
    P.sim?.disturb(x, z, 0.12 + 0.06 * size, 0.06 * size);
  }

  crumbs(x, y, z, tints, n, power = 1) {
    const F = this.game.particles.fx;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rnd(0.35, 0.9) * power;
      F.spawn('crumb', x, y, z, {
        vx: Math.cos(a) * sp, vy: rnd(0.2, 0.9) * power, vz: Math.sin(a) * sp, grav: 1.2, drag: 3.2,
        life: rnd(0.45, 0.8), size: rnd(0.045, 0.065), frame: (Math.random() * 3) | 0, spin: rnd(-8, 8),
        flags: FX.FADE | FX.SHRINK, tint: pick(tints), bright: true,
      });
    }
  }

  bubbles(x, y, z, n) {
    const F = this.game.particles.fx;
    for (let i = 0; i < n; i++)
      F.spawn(Math.random() < 0.35 ? 'bubble_l' : 'bubble', x + rnd(-0.06, 0.06), y + 0.02, z + rnd(-0.06, 0.06), {
        vy: rnd(0.45, 0.8), life: Math.max(0.25, (WATER_Y + 0.02 - y) / 0.55), size: rnd(0.05, 0.08), flags: FX.WOBBLE, bright: true,
      });
  }

  // ---- a pellet / flake / produce bite
  eat(f, item = 'pellets') {
    const F = FOOD_ITEMS[item]?.fish || FOOD_ITEMS.pellets.fish;
    const def = FOOD_ITEMS[item];
    const bulk = fishBulk(f);
    const fancy = def?.kind === 'special' || (F.happy || 0) >= 0.1 || (F.luck || 0) > 0;
    const loving = (F.love || 0) >= 0.5;
    startGulp(f, 'bite', fancy ? 1.15 : 1);
    f.speed *= 0.45; // brake to gulp
    const m = this.mouth(f);
    const calm = 1 / (1 + this.busy * 0.35);
    const sz = Math.min(1.6, 0.6 + bulk * 0.45);
    this.crumbs(m.x, m.y + 0.03, m.z, foodTints(item), Math.max(2, Math.round((3 + bulk * 2) * calm)), sz);
    this.bubbles(m.x, m.y, m.z, Math.max(1, Math.round(2 * calm)));
    this.surface(m.x, m.z, sz, calm > 0.5 ? 1 : 0);
    const P = this.game.particles;
    if (fancy) {
      const t = foodTints(item);
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        P.fx.spawn('sparkle', m.x, WATER_Y + 0.12, m.z, { vx: Math.cos(a) * 0.5, vy: rnd(0.6, 1.1), vz: Math.sin(a) * 0.5, grav: 1.2, drag: 1.8, life: rnd(0.5, 0.8), size: 0.1, fps: 8, flags: FX.FADE | FX.POP, tint: pick(t), emissive: 0.8, bright: true });
      }
    }
    if (loving || (fancy && Math.random() < 0.5)) {
      P.fx.spawn('heart_s', m.x + rnd(-0.08, 0.08), WATER_Y + 0.15, m.z, { vy: 0.65, drag: 0.8, life: 1.0, size: 0.1, flags: FX.POP | FX.FADE | FX.WOBBLE, bright: true });
    }
    // the comic word: bigger fish say bigger things
    const words = !f.adult ? ['nom', 'nom', 'slurp'] : bulk > 1.35 ? ['chomp', 'gulp', 'munch', 'crunch'] : ['nom', 'slurp', 'munch', 'nomnom'];
    if (this.wordCd <= 0 && Math.random() < (fancy ? 0.9 : 0.6) * calm) this.word(pick(words), m.x, m.z, 0.12 + 0.05 * Math.min(1.6, bulk));
    this.sound(f, 'bite');
    this.busy += 1;
  }

  // ---- one seaweed nibble (a fish takes a few in a row)
  nibble(f, weed, last = false) {
    startGulp(f, 'nibble', 0.5);
    const m = this.mouth(f);
    this.crumbs(m.x, m.y + 0.02, m.z, WEED_TINTS, 2 + (Math.random() < 0.5 ? 1 : 0), 0.7);
    if (Math.random() < 0.6) this.bubbles(m.x, m.y, m.z, 1);
    if (last) this.surface(m.x, m.z, 0.7, 0);
    if (this.wordCd <= 0 && Math.random() < 0.3) this.word(Math.random() < 0.6 ? 'nibble' : 'munch', m.x, m.z, 0.12);
    this.sound(f, 'nibble');
    this.busy += 0.5;
  }

  // ---- SNAP! at the top of a bug jump
  snap(f) {
    startGulp(f, 'snap', 1.35);
    const m = this.mouth(f);
    const P = this.game.particles;
    this.crumbs(m.x, m.y, m.z, BUG_TINTS, 6, 1.4);
    // impact flash: a burst of little stars around the jaws
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rnd(-0.2, 0.2);
      P.fx.spawn(i % 2 ? 'sparkle' : 'star', m.x, m.y + 0.05, m.z, { vx: Math.cos(a) * 1.3, vy: Math.sin(a) * 1.3 + 0.4, grav: 2, drag: 3, life: 0.45, size: i % 2 ? 0.1 : 0.11, fps: 10, spin: 6, flags: FX.POP | FX.FADE, bright: true, emissive: 0.5 });
    }
    P.fx.spawn('glow', m.x, m.y + 0.03, m.z, { life: 0.16, size: 0.3, flags: FX.POP | FX.FADE, bright: true, emissive: 1 });
    this.wordCd = 0;
    this.game.particles.word('chomp', m.x, m.y + 0.28, m.z, { size: 0.22, life: 1.0, vy: 0.8 });
    this.wordCd = 0.4;
    this.sound(f, 'snap');
  }
}
