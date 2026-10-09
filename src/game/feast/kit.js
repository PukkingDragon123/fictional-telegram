// [v26 feast] Small shared helpers for the feast events (src/game/feastEvents/*).
import { headAnchor, isBear } from './ctx.js';
import { WATER_Y } from '../../world/grid.js';

export { isBear };
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const chance = (p) => Math.random() < p;

// the restaurant's going rate for a refund / a comp, grows a little with the days
export const price = (game, base, perDay = 1) => Math.round(Math.min(base * 4, base + game.state.day * perDay));

// a bear with no hat and a normal size (for wigs, party hats...)
export const plainBear = (b) => !b.def.hat && b.def.scale >= 0.8 && b.def.scale <= 1.2 && !b.def.boss;

// turn a customer into Karen: blond bob, big shades, the name
export function karenify(ctx, b) {
  if (b.karen) return;
  b.karen = true;
  b.name = 'Karen';
  const f = b.rig?.face;
  if (f) { f.o.shades = 0x16121a; f.key = ''; }
  const wig = ctx.prop('wig_bob', { keep: true });
  if (wig && b.rig) headAnchor(b.rig).add(wig.obj);
}

// put on a disguise (the incognito critic): a fake moustache + a monocle on the face
export function disguise(ctx, b) {
  if (b.disguised) return;
  b.disguised = true;
  const f = b.rig?.face;
  if (f) { f.o.monocle = 0xe8c040; f.key = ''; }
  const st = ctx.prop('stache', { keep: true });
  if (st && b.rig) headAnchor(b.rig).add(st.obj);
}

// is this tile dry land a bear can stand on?
export function standable(game, x, z) {
  const g = game.grid;
  const tx = Math.floor(x), tz = Math.floor(z);
  return g.bearPassable(tx, tz) && !g.isWater(tx, tz) && !g.structAt(tx, tz);
}

// a dry spot next to the bear (r tiles away), facing direction a (radians) if possible
export function spotNear(game, b, r = 1.3, a = null) {
  const base = a ?? Math.random() * Math.PI * 2;
  for (let i = 0; i < 12; i++) {
    const ang = base + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.55;
    const x = b.x + Math.cos(ang) * r, z = b.z + Math.sin(ang) * r;
    if (standable(game, x, z)) return { x, z };
  }
  return { x: b.x + Math.cos(base) * r, z: b.z + Math.sin(base) * r };
}

// the nearest water tile centre (for dives, splashes)
export function nearestWater(game, x, z, r = 8) {
  const g = game.grid;
  let best = null, bd = Infinity;
  for (let dz = -r; dz <= r; dz++)
    for (let dx = -r; dx <= r; dx++) {
      const tx = Math.floor(x) + dx, tz = Math.floor(z) + dz;
      if (!g.isWater(tx, tz)) continue;
      const d = Math.hypot(tx + 0.5 - x, tz + 0.5 - z);
      if (d < bd) { bd = d; best = { x: tx + 0.5, z: tz + 0.5, y: WATER_Y, d }; }
    }
  return best;
}

// a dry shore tile next to water near (x, z)
export function shoreNear(game, x, z, r = 8) {
  const g = game.grid;
  let best = null, bd = Infinity;
  for (let dz = -r; dz <= r; dz++)
    for (let dx = -r; dx <= r; dx++) {
      const tx = Math.floor(x) + dx, tz = Math.floor(z) + dz;
      if (!standable(game, tx + 0.5, tz + 0.5) || !g.hasWaterNeighbor(tx, tz)) continue;
      const d = Math.hypot(tx + 0.5 - x, tz + 0.5 - z);
      if (d < bd) { bd = d; best = { x: tx + 0.5, z: tz + 0.5, d }; }
    }
  return best;
}

export const onShore = (game, b) => !game.grid.isWater(Math.floor(b.x), Math.floor(b.z)) && game.grid.hasWaterNeighbor(Math.floor(b.x), Math.floor(b.z));
export const inWater = (game, b) => game.grid.isWater(Math.floor(b.x), Math.floor(b.z));

// throw a prop along an arc on the event clock, resolves on landing
export function toss(ctx, h, from, to, { dur = 0.7, height = 1.4, spin = 9 } = {}) {
  const o = h.obj || h;
  if (!o.parent) ctx.game.scene.add(o);
  return ctx.anim((dt, t) => {
    const u = Math.min(1, t / dur);
    o.position.set(from.x + (to.x - from.x) * u, from.y + (to.y - from.y) * u + Math.sin(u * Math.PI) * height, from.z + (to.z - from.z) * u);
    o.rotation.z = u * spin;
    return u < 1;
  });
}

// glide a prop between two points over dur seconds of the event clock
export function glide(ctx, h, to, { dur = 1, from = null, bob = 0 } = {}) {
  const o = h.obj || h;
  const a = from || { x: o.position.x, y: o.position.y, z: o.position.z };
  return ctx.anim((dt, t) => {
    const u = Math.min(1, t / dur);
    const e = u * u * (3 - 2 * u);
    o.position.set(a.x + (to.x - a.x) * e, a.y + (to.y - a.y) * e + Math.sin(u * Math.PI * 6) * bob, a.z + (to.z - a.z) * e);
    return u < 1;
  });
}

// heading from a to b (bear heading convention: atan2(dz, dx))
export const headingTo = (a, b) => Math.atan2(b.z - a.z, b.x - a.x);
