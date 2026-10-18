// IG-reel style vertical video (rendered at 720x1280, delivered 1080x1920): the dev shows off
// the new NPC, Pip. Creator captions are added in post (titles.js 'caption' items via
// make_edl_reel.py -> edl_reel.json -> build2.py). In-game speech bubbles are fine here.
import * as THREE from 'three';
import { setCam, camAt, lerp, smooth, D2R } from './director.js';
import { prep, clearDecos, stockPond, addRig, addFox, once, bearParade } from './shots_promo.js';
import { PIP_CART_SPEED } from '../../src/entities/critters3d.js';

export const SHOTS = {};

function path(c, keys, rig = null) { c.every((t) => setCam(rig || c.g.rig, camAt(keys, t))); }

// the mill zone opened: Pip lives at his lumber mill. Returns the game's own villager record.
async function openMill(c) {
  const g = c.g;
  const { ZONE_BY_ID } = await import('../../src/data/zones.js');
  try { await g.zones.reveal(ZONE_BY_ID.mill, null, { quiet: true }); } catch (e) { console.warn('[dir] reveal mill', e); }
  c.presim(0.6);
  const v = g.villagers.get('pip');
  v.t = 1e9;
  try { g.villagers.vstate(v).met = true; } catch { /* ignore */ }
  const d = g.homes?.doors?.get('pip');
  if (d?.marker) d.marker.visible = false;
  c.every(() => { v.t = 1e9; if (d?.marker) d.marker.visible = false; });
  return v;
}
function reelPrep(c, o) { prep(c, o); c.bubbles(3); }

// 1. hook: from the whole valley straight down to Pip
SHOTS.r_hook = {
  dur: 3.8,
  async setup(c) {
    const g = c.g;
    reelPrep(c, { hour: 10.5 });
    stockPond(g, 20);
    const v = await openMill(c);
    v.rig.play('idle', { loop: true });
    const p = { x: v.x, z: v.z };
    c.at(2.7, () => once(v.rig, 'wave', 'idle'));
    path(c, [
      { t: 0, x: 72.0, z: 52.0, y: 0, yaw: -0.35, pitch: 62, wupp: 0.075 },
      { t: 2.2, x: p.x - 0.2, z: p.z + 0.4, y: 0.5, yaw: 0.25, pitch: 38, wupp: 0.016, ease: 'expo' },
      { t: 3.8, x: p.x, z: p.z + 0.3, y: 0.7, yaw: 0.1, pitch: 30, wupp: 0.0085, ease: 'out' },
    ]);
  },
};

// 2. "PIP!": the intro pose, confetti
SHOTS.r_pip = {
  dur: 2.2,
  async setup(c) {
    const g = c.g;
    reelPrep(c, { hour: 10.5 });
    const v = await openMill(c);
    c.at(0.0, () => { v.rig.play('wave', { fade: 0.05, loop: false, restart: true, onDone: () => v.rig.play('happy', { loop: true }) }); g.particles.confetti(v.x, v.y + 1.6, v.z, 50); });
    path(c, [
      { t: 0, x: v.x, z: v.z + 0.2, y: 0.75, yaw: 0.15, pitch: 26, wupp: 0.0058 },
      { t: 2.2, x: v.x, z: v.z + 0.2, y: 0.72, yaw: -0.05, pitch: 24, wupp: 0.0052, ease: 'linear' },
    ]);
  },
};

// 3. Pip's house: the lumber mill, slow orbit (water wheel turning)
SHOTS.r_mill = {
  dur: 3.8,
  async setup(c) {
    const g = c.g;
    reelPrep(c, { hour: 11 });
    const v = await openMill(c);
    v.rig.play('idle', { loop: true });
    const m = { x: v.x + 0.45, z: v.z - 0.7 };
    path(c, [
      { t: 0, x: m.x, z: m.z + 0.2, y: 0.6, yaw: -0.55, pitch: 30, wupp: 0.0118 },
      { t: 3.8, x: m.x + 0.1, z: m.z + 0.2, y: 0.6, yaw: 0.35, pitch: 26, wupp: 0.0108, ease: 'linear' },
    ]);
  },
};

// the mill office interior (src/entities/homes/pip.js) as the scene; Pip is HomeMode's own rig
async function interior(c) {
  const g = c.g;
  const v = await openMill(c);
  const H = g.homes;
  H.v = v;
  H.build();
  if (H.fox) H.fox.root.visible = false;
  g.overrideScene = H.scene; g.overrideRig = H.rig;
  g.state.paused = true;
  c.every((t, dt) => { H.kit?.update?.(dt); H.npc?.update?.(dt); });
  return { H, pip: H.npc, kit: H.kit };
}

// 4. inside: Pip at the cash register, haggling (coins)
SHOTS.r_inside = {
  dur: 3.8,
  async setup(c) {
    const g = c.g;
    reelPrep(c, { hour: 11 });
    const { H, pip, kit } = await interior(c);
    pip.root.position.set(1.05, 0, -0.95);
    pip.root.rotation.y = 0.55;
    pip.play('haggle', { loop: true, fade: 0 });
    for (const t of [0.5, 1.7, 2.9]) c.at(t, () => { try { kit.fx('coins', new THREE.Vector3(1.55, 1.0, -1.45), 5); } catch { /* ignore */ } g.audio.play('coins', { volume: 0.35 }); });
    const V = H.spec?.view || kit.view;
    path(c, [
      { t: 0, x: 1.1, z: -1.0, y: 0.75, yaw: 0.25, pitch: 30, wupp: 0.0062 },
      { t: 3.8, x: 1.2, z: -1.1, y: 0.75, yaw: 0.05, pitch: 28, wupp: 0.0052, ease: 'linear' },
    ], H.rig);
  },
};

// 5. inside: the acorn jar (emergency snacks: stuffed cheeks)
SHOTS.r_acorn = {
  dur: 2.2,
  async setup(c) {
    const g = c.g;
    reelPrep(c, { hour: 11 });
    const { H, pip } = await interior(c);
    pip.root.position.set(-1.85, 0, -0.55);
    pip.root.rotation.y = -0.35;
    c.at(0.05, () => { pip.play('stuff_cheeks', { loop: true, fade: 0, restart: true }); g.audio.play('nibble', { volume: 0.45 }); });
    c.at(1.0, () => g.audio.play('nibble', { volume: 0.45, pitch: 1.2 }));
    path(c, [
      { t: 0, x: -2.0, z: -0.7, y: 0.7, yaw: -0.2, pitch: 24, wupp: 0.0048 },
      { t: 2.2, x: -2.0, z: -0.7, y: 0.7, yaw: -0.05, pitch: 22, wupp: 0.0042, ease: 'linear' },
    ], H.rig);
  },
};

// 6. Pip pushes the lumber cart along the shore (buys your logs)
SHOTS.r_cart = {
  dur: 3.8,
  async setup(c) {
    const g = c.g;
    reelPrep(c, { hour: 15.5 });
    stockPond(g, 24);
    clearDecos(g, 56, 36, 82, 52);
    const pip = addRig(c, 'ChipmunkTrader', 63.6, 39.0, { ry: Math.PI / 2, anim: 'push_cart' });
    const sp = PIP_CART_SPEED || 0.6;
    c.every((t, dt) => { pip.root.position.x += sp * dt; pip.root.position.y = c.ground(pip.root.position.x, pip.root.position.z); });
    c.at(1.2, () => g.audio.play('footsteps', { volume: 0.25 }));
    path(c, [
      { t: 0, x: 63.9, z: 38.9, y: 0.5, yaw: 0.35, pitch: 28, wupp: 0.0092 },
      { t: 3.8, x: 63.9 + sp * 3.8, z: 38.9, y: 0.5, yaw: 0.2, pitch: 28, wupp: 0.0092, ease: 'linear' },
    ]);
  },
};

// 7. Pip says hi to Reynard
SHOTS.r_wave = {
  dur: 2.2,
  async setup(c) {
    const g = c.g;
    reelPrep(c, { hour: 12 });
    stockPond(g, 20);
    clearDecos(g, 56, 36, 82, 52);
    const pip = addRig(c, 'ChipmunkTrader', 67.0, 39.2, { ry: 0.6 });
    const fox = addFox(c, 68.4, 39.5, { ry: -0.7, anim: 'idle' });
    c.at(0.05, () => { pip.play('wave', { loop: true, fade: 0.05 }); c.say(c.above(pip, 1.6), 'Howdy, partner!', { voice: 'cub', mood: 'excited', dur: 2.0, size: 's' }); });
    c.at(0.7, () => fox.play('wave_hello', { fade: 0.1 }));
    path(c, [
      { t: 0, x: 67.7, z: 39.0, y: 0.7, yaw: 0.1, pitch: 26, wupp: 0.0072 },
      { t: 2.2, x: 67.7, z: 39.2, y: 0.7, yaw: 0.0, pitch: 25, wupp: 0.0066, ease: 'linear' },
    ]);
  },
};

// 8. counting the logs at the mill (digits pop over his head)
SHOTS.r_count = {
  dur: 2.2,
  async setup(c) {
    const g = c.g;
    reelPrep(c, { hour: 13 });
    const v = await openMill(c);
    c.at(0.0, () => v.rig.play('count_logs', { loop: true, fade: 0, restart: true }));
    path(c, [
      { t: 0, x: v.x, z: v.z + 0.1, y: 0.8, yaw: -0.25, pitch: 24, wupp: 0.0058 },
      { t: 2.2, x: v.x, z: v.z + 0.1, y: 0.8, yaw: -0.1, pitch: 24, wupp: 0.0052, ease: 'linear' },
    ]);
  },
};

// 9. not scared of bears (mostly): the 5 PM parade walks past him
SHOTS.r_bears = {
  dur: 2.2,
  async setup(c) {
    const g = c.g;
    reelPrep(c, { hour: 16.95 });
    clearDecos(g, 58, 12, 86, 34);
    bearParade(c, { x: 71.4, z0: 22.0, speed: 1.1, n: 7 });
    c.presim(0.2);
    const pip = addRig(c, 'ChipmunkTrader', 69.4, 25.2, { ry: 0.5, anim: 'happy' });
    c.at(1.2, () => once(pip, 'stuff_cheeks', 'happy'));
    path(c, [
      { t: 0, x: 70.4, z: 24.4, y: 0.7, yaw: 0.2, pitch: 24, wupp: 0.0098 },
      { t: 2.2, x: 70.4, z: 24.8, y: 0.7, yaw: 0.1, pitch: 24, wupp: 0.0092, ease: 'linear' },
    ]);
  },
};

// 10. end card: golden hour, Pip + Reynard wave; a follower's comment pops up (the game's own bubble)
SHOTS.r_end = {
  dur: 7.6,
  async setup(c) {
    const g = c.g;
    reelPrep(c, { hour: 18.0 });
    stockPond(g, 26);
    clearDecos(g, 56, 36, 84, 56);
    const pip = addRig(c, 'ChipmunkTrader', 67.7, 39.0, { ry: 0.1 });
    const fox = addFox(c, 69.0, 39.3, { ry: -0.2, anim: 'idle' });
    c.at(0.05, () => { pip.play('wave', { loop: true }); fox.play('wave_hello', { fade: 0.1 }); });
    const W = window.innerWidth, Hh = window.innerHeight;
    c.at(1.7, () => c.say(() => ({ x: W * 0.5, y: Hh * 0.27, visible: true }), '@pond_fan: add a raccoon! ♥', { voice: 'cub', mood: 'happy', dur: 9, size: 'm' }));
    path(c, [
      { t: 0, x: 68.3, z: 38.4, y: 0.6, yaw: 0.05, pitch: 26, wupp: 0.0102 },
      { t: 7.6, x: 68.3, z: 38.9, y: 0.6, yaw: -0.03, pitch: 24, wupp: 0.0094, ease: 'linear' },
    ]);
  },
};
