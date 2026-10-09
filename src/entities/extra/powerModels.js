// [v26 power] Voxel models for the power grid builds (src/data/ext/power.js), in the
// industry kit (src/entities/extra/industryModels.js: fine 0.05 voxels, named parts,
// root.userData.st = { on, k, lamp } driven by src/game/ext/power.js).
//
//   pw_solar      tilted blue panel on a post.            userData.setSun(k 0..1.1): glints
//   pw_waterwheel paddle wheel on two posts in the river. userData.setFlow(speed, yaw, depth)
//                 turns the wheel (the axle across the current) and spins it with the water
//   pw_wind       tall white tower, three blades.         userData.setWind(k): blade speed
//   pw_battery    steel cabinet with four glass cells.    userData.setCharge(k 0..1, dir -1|0|1)
//   pw_pole       wooden pole, crossarm, insulators, lamp. userData.setLive(on, flicker, night)
// userData.plug = [x, y, z]: where the cable plugs in (local, above the root).
import * as THREE from 'three';
import { IND_KIT, IND_PAL } from './industryModels.js';
import { text } from './facilityModels.js';
import { shade } from '../../core/voxel.js';

const { machine, at, cylY, cylX, cylZ, wheelX, slab, grassTufts, hv, pickT, VF } = IND_KIT;
const { STONE, CONC, IRON, IRON_L, IRON_D, STEEL, STEEL_L, STEEL_D, COPPER, COPPER_L, BRASS, BRASS_D, HAZ_Y, HAZ_K, RED, RED_D, WHITE, WOOD, WOOD_D, BLUE, BLUE_D, BLUE_L, GLASS_TINT } = IND_PAL;
const TAU = Math.PI * 2;
const INSUL = [0x5ab09a, 0x8ad8c4];

// ================================================================ SOLAR PANEL (1x1)
function buildSolar(R) {
  const f = R.f;
  slab(f, -8, 7, -8, 7, 0, CONC);
  // post + junction box
  f.box(-1, 1, -1, 0, 9, 0, STEEL_D);
  f.box(-3, 2, 1, 2, 5, 2, 0xd8d4c4); f.box(-2, 3, 3, 1, 4, 3, 0x9a968c);
  // the panel: a frame tilted toward the camera (+z), blue cells in a silver grid
  const panel = R.part('panel', at(-0.5, 10, -0.5));
  for (let i = -9; i <= 8; i++) for (let j = -7; j <= 7; j++) {
    const y = 10 + Math.round(j * 0.62), z = Math.round(j * 0.78);
    const edge = i === -9 || i === 8 || j === -7 || j === 7;
    const grid = !edge && ((i + 9) % 6 === 0 || (j + 7) % 5 === 0);
    panel.f.set(i, y, z, edge ? STEEL_L : grid ? 0xa8b0c4 : ((i + j) & 1 ? BLUE_D : 0x24407a));
    panel.f.set(i, y - 1, z, STEEL_D);
  }
  // a sparkle that sweeps the glass when the sun is out
  const shine = R.part('shine', at(0, 12, 2));
  for (const [i, j] of [[-5, 3], [-4, 3], [-4, 4], [-3, 4], [-3, 5], [2, -2], [3, -2], [3, -1]]) shine.g.set(i, 10 + Math.round(j * 0.62) + 1, Math.round(j * 0.78) + 1, 0xd8f0ff);
  grassTufts(f, 5, -8, 7, -8, 7, 21, (x, z) => Math.abs(x) < 5 && Math.abs(z) < 5);
}
function solarAnim(n, clock, vel, dt, t, st) {
  const k = st.sun ?? 0;
  if (n.shine) { n.shine.visible = k > 0.25 && Math.sin(t * 0.9 + 1) > -0.2; n.shine.position.x = n.shine.userData.base.x + Math.sin(t * 0.45) * 0.08; }
  if (n.panel) n.panel.rotation.x = -0.04 + (1 - Math.min(1, k)) * 0.06;
}

// ================================================================ WATER WHEEL (1x1, in the river)
// Built with the wheel in the y-z plane (axle along x) so the current runs along z; the
// 'rig' part turns to the flow. Root = the river bed; 'rig' sits at the water line.
function buildWater(R) {
  const rig = R.part('rig', at(-0.5, 0, -0.5));
  const f = rig.f;
  // two A-frame posts on the banks of the wheel, standing on piles
  for (const x of [-9, 8]) {
    f.box(x, -14, -2, x, 10, -1, WOOD_D);
    f.line(x, -14, -7, x, 8, -2, WOOD[0]); f.line(x, -14, 5, x, 8, -1, WOOD[0]);
    f.box(x, 9, -3, x, 10, 0, WOOD[1]);
  }
  // axle
  cylX(f, 9.5, -1.5, 0.9, -9, 8, IRON);
  // the generator box on the right post, with a brass plate + lamp
  f.box(9, 6, -4, 13, 12, 1, RED); f.box(10, 13, -3, 12, 13, 0, RED_D);
  f.box(9, 8, 2, 13, 10, 2, BRASS); cylX(f, 9.5, -1.5, 1.4, 8, 9, BRASS_D);
  f.box(11, 14, -2, 11, 17, -2, STEEL_D); f.box(10, 17, -3, 12, 17, -1, 0x5ab09a); // a little insulator
  // the wheel (spins round x)
  const wheel = R.part('wheel', at(-0.5, 9.5, -1.5));
  wheelX(wheel.f, -6, -5, 9.5, -1.5, 9.5, WOOD[0], { spokes: 8, rim: 1.4, hub: IRON });
  wheelX(wheel.f, 4, 5, 9.5, -1.5, 9.5, WOOD[0], { spokes: 8, rim: 1.4, hub: IRON });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, y = 9.5 + Math.sin(a) * 8.8, z = -1.5 + Math.cos(a) * 8.8;
    for (let x = -6; x <= 5; x++) for (let w = -1; w <= 1; w++) wheel.f.set(x, Math.round(y + Math.sin(a) * w), Math.round(z + Math.cos(a) * w), w === 1 ? WOOD[2] : WOOD_D);
  }
  // white water where the paddles dip in
  const foam = R.part('foam', at(-0.5, 7, -1.5));
  for (let x = -7; x <= 6; x++) for (const z of [-12, -11, -10, 7, 8, 9]) if (hv(x, 7, z) < 0.55) foam.g.set(x, 7, z, 0xeef8ff);
}
function waterAnim(n, clock, vel, dt, t, st) {
  if (n.wheel) n.wheel.rotation.x = -(st.spin || 0);
  if (n.foam) n.foam.visible = (st.speed || 0) > 0.05 && Math.sin(t * 9) > -0.6;
}

// ================================================================ WIND TURBINE (1x1)
function buildWind(R) {
  const f = R.f;
  slab(f, -8, 7, -8, 7, 0, CONC);
  f.box(-5, 1, -5, 4, 2, 4, STEEL_D);
  // the tapered tower (white, a red band near the top), a door
  for (let y = 3; y <= 58; y++) {
    const r = 3.2 - (y / 58) * 1.4;
    cylY(f, -0.5, -0.5, r, y, y, (x, yy) => (yy >= 50 && yy <= 52 ? RED : yy % 12 === 0 ? 0xdedcd6 : WHITE));
  }
  f.box(-2, 3, 2, 0, 8, 2, 0x5a6a7a); f.set(0, 6, 3, BRASS);
  f.box(1, 3, 3, 1, 3, 3, STEEL);
  // nacelle (faces +z)
  f.box(-3, 59, -6, 2, 63, 3, WHITE); f.box(-2, 64, -5, 1, 64, 2, 0xdedcd6);
  f.box(-2, 60, -7, 1, 62, -7, STEEL_L);
  // the rotor: hub + three blades (spin round z)
  const rotor = R.part('rotor', at(-0.5, 61, 4.5));
  cylZ(rotor.f, -0.5, 61, 1.8, 4, 6, RED);
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * TAU + 0.3;
    for (let i = 2; i <= 22; i++) {
      const w = i < 5 ? 1.4 : 1.2 - i * 0.03;
      for (let j = -1; j <= 1; j++) {
        if (Math.abs(j) > w) continue;
        const x = -0.5 + Math.cos(a) * i - Math.sin(a) * j * 0.8, y = 61 + Math.sin(a) * i + Math.cos(a) * j * 0.8;
        rotor.f.set(x, y, 5, i > 19 ? RED : j === 1 ? 0xdedcd6 : WHITE);
      }
    }
  }
}
function windAnim(n, clock, vel, dt, t, st) {
  if (n.rotor) n.rotor.rotation.z = -(st.spin || 0);
}

// ================================================================ BATTERY BANK (1x1)
function buildBattery(R) {
  const f = R.f, g = R.g;
  slab(f, -9, 8, -9, 8, 0, CONC);
  // the cabinet: steel, hazard foot, vents
  f.box(-8, 1, -7, 7, 2, 4, (x) => ((x + 20) >> 1) & 1 ? HAZ_Y : HAZ_K);
  f.box(-8, 3, -7, 7, 17, 4, (x, y, z) => (z === 4 && y % 4 === 0 ? STEEL_D : STEEL));
  f.box(-8, 18, -7, 7, 18, 4, STEEL_L);
  // four glass cells on the front, each with a glow column (charge)
  for (let i = 0; i < 4; i++) {
    const x0 = -7 + i * 4;
    f.box(x0, 4, 5, x0 + 2, 16, 5, IRON_D);
    for (let y = 5; y <= 15; y++) R.gl.set(x0 + 1, y, 6, GLASS_TINT);
    f.box(x0, 16, 5, x0 + 2, 16, 6, STEEL_L); f.box(x0, 4, 5, x0 + 2, 4, 6, STEEL_L);
  }
  for (let k = 0; k < 5; k++) {
    const lvl = R.part('lvl' + k, at(0, 5 + k * 2, 6));
    for (let i = 0; i < 4; i++) lvl.g.box(-7 + i * 4 + 1, 5 + k * 2, 6, -7 + i * 4 + 1, 6 + k * 2, 6, k < 1 ? 0xff7a3a : 0x6aff6a);
  }
  // terminals on top (+ red, - black) with a cable stub, a lightning sticker
  f.box(-6, 19, -3, -5, 21, -2, RED_D); f.box(4, 19, -3, 5, 21, -2, 0x2a2a30);
  f.box(-1, 19, -5, 0, 24, -4, STEEL_D); f.box(-2, 24, -6, 1, 24, -3, INSUL[0]);
  f.box(-3, 10, -8, 2, 15, -8, HAZ_Y);
  // charge / discharge arrows (glow) on the side
  const up = R.part('up', at(8, 12, 0));
  for (const [y, w] of [[14, 0], [13, 1], [12, 2]]) up.g.box(8, y, -w, 8, y, w, 0x6aff6a);
  const dn = R.part('dn', at(8, 12, 0));
  for (const [y, w] of [[10, 0], [11, 1], [12, 2]]) dn.g.box(8, y, -w, 8, y, w, 0xffb040);
  void g;
}
function batteryAnim(n, clock, vel, dt, t, st) {
  const k = st.charge ?? 0, dir = st.dir || 0;
  for (let i = 0; i < 5; i++) if (n['lvl' + i]) n['lvl' + i].visible = k > i / 5 + 0.02 || (i === 0 && k > 0.01);
  if (n.up) n.up.visible = dir > 0 && Math.sin(t * 5) > 0;
  if (n.dn) n.dn.visible = dir < 0 && Math.sin(t * 5) > 0;
}

// ================================================================ POWER POLE (1x1)
function buildPole(R) {
  const f = R.f;
  // a stony foot, the pole, a crossarm with two insulators + one on top
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; f.box(Math.round(Math.cos(a) * 3) - 1, 0, Math.round(Math.sin(a) * 3) - 1, Math.round(Math.cos(a) * 3), 1, Math.round(Math.sin(a) * 3), pickT(STONE, i, 0, 1)); }
  f.box(-1, 1, -1, 0, 35, 0, (x, y, z) => (y % 7 === 0 ? 0x5a3a20 : pickT([0x7a5230, 0x6a4628, 0x86603a], x, y >> 2, z)));
  f.box(-7, 32, -1, 6, 33, 0, WOOD[1]);
  f.line(-5, 32, 0, -1, 27, 0, WOOD_D); f.line(4, 32, 0, 0, 27, 0, WOOD_D);
  for (const x of [-6, 5]) { f.box(x, 34, -1, x, 34, 0, IRON); f.box(x, 35, -1, x, 36, 0, INSUL[0]); f.set(x, 37, -1, INSUL[1]); f.set(x, 37, 0, INSUL[1]); }
  // a danger sign + the lamp under the crossarm
  f.box(-2, 18, 1, 1, 21, 1, HAZ_Y); f.set(0, 20, 2, HAZ_K); f.set(-1, 19, 2, HAZ_K);
  f.box(-1, 29, 1, 0, 29, 3, IRON); f.box(-2, 27, 3, 1, 28, 4, IRON_L);
  const lamp = R.part('lamp', at(-0.5, 26, 3.5));
  lamp.g.box(-1, 26, 3, 0, 26, 4, 0xfff0b0);
  const spark = R.part('spark', at(5, 38, -0.5));
  for (const [x, y] of [[5, 38], [4, 39], [6, 39], [5, 40], [-6, 38], [-7, 39], [-5, 39]]) spark.g.set(x, y, -1, 0xbff0ff);
}
function poleAnim(n, clock, vel, dt, t, st) {
  if (n.lamp) n.lamp.visible = !!st.live && (st.night || 0) > 0.25;
  if (n.spark) n.spark.visible = !!st.flick && Math.sin(t * 29) > 0.4;
}

// ---------------------------------------------------------------- factories (+ the hooks power.js calls)
function withState(root, extra) { Object.assign(root.userData, extra); return root; }
export const STRUCTURE_MODELS = {
  pw_solar: () => {
    const root = machine('pw_solar', buildSolar, { lamp: [0.06, 0.3, 0.16], anim: solarAnim });
    const st = root.userData.st;
    return withState(root, { plug: [0, 0.3, 0.1], setSun: (k) => { st.sun = k; } });
  },
  pw_waterwheel: () => {
    const root = machine('pw_waterwheel', buildWater, { anim: waterAnim });
    const st = root.userData.st, n = root.userData.parts;
    let spin = 0, last = performance.now();
    return withState(root, {
      plug: [0.55, 1.0, -0.1],
      setFlow: (speed, yaw, depth) => {
        const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        st.speed = speed;
        spin += dt * speed * 3.2;
        st.spin = spin;
        if (n.rig) { n.rig.rotation.y = yaw || 0; if (depth != null) n.rig.position.y = depth - 0.26; }
      },
    });
  },
  pw_wind: () => {
    const root = machine('pw_wind', buildWind, { lamp: [0.05, 0.3, 0.2], anim: windAnim });
    const st = root.userData.st;
    let spin = 0, last = performance.now();
    return withState(root, {
      plug: [0, 0.4, 0.2],
      setWind: (k) => { const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; spin += dt * (0.6 + 3.4 * Math.min(2, k)); st.spin = spin; },
    });
  },
  pw_battery: () => {
    const root = machine('pw_battery', buildBattery, { lamp: [0.36, 0.95, 0.1], anim: batteryAnim });
    const st = root.userData.st;
    return withState(root, { plug: [0, 1.25, -0.22], setCharge: (k, dir) => { st.charge = k; st.dir = dir; } });
  },
  pw_pole: () => {
    const root = machine('pw_pole', buildPole, { anim: poleAnim });
    const st = root.userData.st;
    return withState(root, { setLive: (on, flick, night) => { st.live = on; st.flick = flick; st.night = night; } });
  },
};
export const POWER_MODEL_TYPES = Object.keys(STRUCTURE_MODELS);
void THREE; void text; void shade; void VF; void COPPER; void COPPER_L; void BLUE; void BLUE_L; void STEEL_L; void IRON_L; void at;
