// Moose Express delivery van: the chunky little box van that brings the big
// orders. Courier-vest blue with the yellow reflective band, cream roof,
// rounded hood with a tiny antler ornament, big whitewall wheels, an open-top
// cab so you can see the moose drive, a roof rack piled with parcels, back
// doors that swing open and a roller ramp that folds down for unloading.
//
//   const van = new DeliveryVan();  scene.add(van.root);   // exhaust puffs live in van.fx (auto-added next to root)
//   van.setDriver(new MooseCourier());  // seats him (bike hidden) + teaches drive / drive_honk / drive_wave / drive_look
//   // each frame: move + turn van.root yourself (root.rotation.y = heading), then
//   van.update(dt);   // measures the motion: wheels roll true, front wheels steer, suspension bobs, exhaust puffs, driver
//   van.snap();       // after teleporting the root (no fake speed from the jump)
//   van.openBack(); van.closeBack();   // doors, then the ramp (and back again); van.backReady = ramp is down
//   van.honk();                        // beep-beep: the moose presses the horn, the van hops
//   van.unloadPoint(t, tx, tz, out)    // world point along the unload slide (t 0..1, ends at local (tx, 0, tz))
//   van.onEvent = (name, van, data) => {}  // 'honk', 'door_open', 'door_shut', 'ramp_down', 'ramp_up', 'puff' {position}
//   makeBigCrate('live' | 'eggs')      // big wooden crate for livestock / lots of eggs (origin at the bottom centre)
//
// Units: 1 voxel = 0.05 (wheels, wheel and lettering 0.025). Root on the
// ground midway between the axles, facing +Z. ~2.65 long, 1.3 wide, 2.2 tall
// (2.6 with the roof rack).
import * as THREE from 'three';
import {
  VS, FV, VoxelModel, rbox, ell, tone, hash3, buildGeo, geoCache, matFor,
  sin, cos, abs, max, min, PI, clamp, lerp, smooth, K, pulse, beat, win,
} from './critterKit.js';

const C = {
  body: 0x2f62c8, bodyD: 0x244ea8, bodyL: 0x4a80e0, bodyDD: 0x1c3c88,
  navy: 0x26325e, navyD: 0x1a2244, navyL: 0x3a4a80,
  cream: 0xf4ead2, creamD: 0xdccdb0, creamL: 0xfffbea,
  band: 0xffd22e, bandD: 0xe6a81c, bandL: 0xffe680,
  red: 0xe0402e, redD: 0xa82a1e, redL: 0xff6a50,
  chrome: 0xd8dce4, chromeD: 0xa0a6b2, chromeL: 0xf6f8fc,
  tire: 0x2a2428, tireL: 0x3e3840, tireD: 0x1c181c,
  glass: 0x9ad4f4, glassL: 0xe8f8ff, glassD: 0x4a78a8,
  lamp: 0xfff6c0, lampD: 0xffd860, tail: 0xff3a30, tailL: 0xff9070, amber: 0xffa020,
  wood: 0xd8ad78, woodD: 0xb88c5a, woodL: 0xe8c490, woodDD: 0x8a6438,
  seat: 0x8a5a30, seatD: 0x6a4020, seatL: 0xa8743e,
  dash: 0x3a3440, dashD: 0x2a2430, dashL: 0x4e4858,
  kraft: 0xc8955a, kraftD: 0xa8763e, kraftL: 0xdcac70, tape: 0xe8c890, tapeL: 0xf6dcaa,
  moose: 0x7a4a2a, mooseD: 0x4a2a18, muz: 0xa87850, muzD: 0x8e6240, ant: 0xeedcae, antD: 0xcdb486,
  white: 0xfaf6ea, ink: 0x2a2430, fox: 0xf07a28, foxD: 0xc85a18,
  puff: 0xf4f0e8, puffD: 0xd6d0c6, puffL: 0xffffff,
  mat: 0x2e3448, straw: 0xf0d070, strawD: 0xd0a840, egg: 0xf8eedc, eggD: 0xe8d8bc, speck: 0x9a6a3a,
  bill: 0xf0a020, billD: 0xc87a10, feather: 0xfafaf2,
};

// ------------------------------------------------------------------ layout (voxels, VS)
const X0 = -13, X1 = 12; // body sides
const ZB = -25, ZC = -1, ZW = 14, ZH = 23; // rear face, bulkhead (cab back), cab front, hood front
const YB = 5, YF = 9, YS = 21, YH = 18, YR = 43; // body bottom, floor top, cab sill, hood top, roof top
const WS_TOP = 32; // windshield frame top
const WR = 0.35, WY = 7, WZF = 17, WZR = -16; // wheel radius (units), centre y / front z / rear z (voxels)
const ARCH = 8.6;
const SEAT_Z = 3; // the driver's root (voxels)
const RAMP_LEN = 16;

/** Van layout in world units (van space: root on the ground between the axles, facing +Z). */
export const VAN = {
  length: 2.65, width: 1.3, height: 2.2,
  wheelR: WR, wheelbase: (WZF - WZR) * VS, wheelX: 0.525, frontZ: WZF * VS, rearZ: WZR * VS,
  floorY: YF * VS, backZ: ZB * VS, rampLen: RAMP_LEN * VS,
  seat: { x: 0, y: YF * VS - 0.2, z: SEAT_Z * VS }, // where the driver's root sits
  exhaust: { x: -0.475, y: 0.175, z: (ZB - 3) * VS },
};
VAN.rampAngle = Math.asin(clamp((VAN.floorY - 0.012) / VAN.rampLen, 0, 1));
VAN.rampEndZ = VAN.backZ - VAN.rampLen * Math.cos(VAN.rampAngle);
// steering wheel, relative to the driver's root (voxels, same space as the rig's mover)
const SWV = { y: 16, z: 5.5, r: 3.4, tilt: 0.7 };

// ------------------------------------------------------------------ colours
function livery(x, y, z) {
  if (y <= YB + 1) return tone(x, y, z, C.navy, C.navyD, C.navyL, 0.12, 0.06);
  if (y === 15 || y === 16) return (x + z + y * 3) % 7 === 0 ? C.bandD : (x + z) % 9 === 4 ? C.bandL : C.band;
  if (y >= YR - 2) return tone(x, y, z, C.cream, C.creamD, C.creamL, 0.12, 0.1);
  return tone(x, y, z, C.body, C.bodyD, C.bodyL, 0.12, 0.08);
}
const inBay = (x, y, z) => x >= X0 + 2 && x <= X1 - 2 && y >= YF && y <= YR - 2 && z >= ZB - 1 && z <= ZC - 2;
const inCab = (x, y, z) => x >= X0 + 2 && x <= X1 - 2 && y >= YF && y <= YS && z >= ZC + 1 && z <= ZW - 2;
const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

function kraftBox(v, x0, x1, y0, y1, z0, z1, { tapeX = true, label = null } = {}) {
  const mx = Math.round((x0 + x1) / 2), mz = Math.round((z0 + z1) / 2);
  rbox(v, x0, x1, y0, y1, z0, z1, 0.6, (x, y, z) => {
    if (y === y1 && (tapeX ? x === mx : z === mz)) return C.tape;
    if ((x === x0 || x === x1) && z === mz && y > y1 - 2) return C.tape;
    return tone(x, y, z, C.kraft, C.kraftD, C.kraftL, 0.14, 0.1);
  });
  if (label) for (let y = y0 + 1; y <= y0 + 2; y++) for (let x = mx - 1; x <= mx; x++) v.set(x, y, z1, label);
}

// ------------------------------------------------------------------ body
function bodyModel() {
  const v = new VoxelModel();
  // 1) solids: the tall cargo box, the open cab tub, the rounded hood
  rbox(v, X0, X1, YB, YR, ZB, ZC, 2, livery);
  rbox(v, X0, X1, YB, YS, ZC - 3, ZW, 2, livery);
  rbox(v, X0, X1, YB, YH, ZW - 4, ZH, 4, livery);
  // 2) cavities: the cargo bay (open at the back) and the open-top cab
  for (let x = X0 + 2; x <= X1 - 2; x++) {
    for (let y = YF; y <= YR - 2; y++) for (let z = ZB; z <= ZC - 2; z++) v.set(x, y, z, null);
    for (let y = YF; y <= YS + 1; y++) for (let z = ZC + 1; z <= ZW - 2; z++) v.set(x, y, z, null);
  }
  // 3) lining: plywood bay, cream cab with a rubber mat, cream piping on the sill
  v.paint((x, y, z, c) => {
    let bay = false, cab = false;
    for (const [dx, dy, dz] of N6) {
      if (inBay(x + dx, y + dy, z + dz)) bay = true;
      else if (inCab(x + dx, y + dy, z + dz)) cab = true;
    }
    if (bay) {
      if (y === YF - 1) return x % 4 === 0 ? C.woodD : tone(x, y, z, C.wood, C.woodD, C.woodL, 0.06, 0.08);
      if (y === YR - 1) return C.creamD;
      if (y === YF + 11 && z < ZC - 2) return C.chromeD; // tie-down rail
      if (z === ZC - 1) return x % 5 === 0 ? C.woodD : C.wood;
      return (y - YF) % 6 === 5 ? C.woodD : tone(x, y, z, C.wood, C.woodD, C.woodL, 0.06, 0.08);
    }
    if (cab) {
      if (y === YF - 1) return z % 2 ? C.mat : C.navyD;
      return tone(x, y, z, C.creamD, C.woodD, C.cream, 0.05, 0.2);
    }
    if (y === YS && z > ZC && z <= ZW) return z === ZW ? C.creamD : C.cream; // sill piping
    return c;
  });
  // door seams + handles on the cab sides
  for (const x of [X0, X1]) {
    for (let y = YF; y <= YS - 1; y++) { v.set(x, y, ZC + 2, C.bodyDD); v.set(x, y, ZW - 2, C.bodyDD); }
    v.set(x, 18, ZW - 4, C.chrome); v.set(x, 18, ZW - 5, C.chromeD);
  }
  // 4) hood: cream racing stripe + a tiny antler ornament
  for (let z = ZW - 3; z <= ZH - 2; z++) for (let x = -2; x <= 1; x++) if (v.has(x, YH, z)) v.set(x, YH, z, x === -2 || x === 1 ? C.creamD : C.cream);
  const oz = ZH - 3;
  v.set(-1, YH + 1, oz, C.antD); v.set(0, YH + 1, oz, C.antD);
  for (const s of [-1, 1]) {
    const bx = s > 0 ? 1 : -2;
    v.set(bx, YH + 2, oz, C.ant); v.set(bx + s, YH + 2, oz, C.ant); v.set(bx + s * 2, YH + 3, oz, C.ant);
    v.set(bx + s, YH + 3, oz, C.ant); v.set(bx, YH + 3, oz, C.antD);
  }
  // grille, headlights, bumper, plate
  for (let x = -4; x <= 3; x++)
    for (let y = 8; y <= 13; y++) {
      const edge = x === -4 || x === 3 || y === 8 || y === 13;
      v.set(x, y, ZH + 1, edge ? C.chrome : y % 2 ? C.navyD : C.chromeD);
    }
  for (const cx of [-9, 6]) {
    for (let x = cx; x <= cx + 3; x++)
      for (let y = 11; y <= 14; y++) {
        const ex = x === cx || x === cx + 3, ey = y === 11 || y === 14;
        if (ex && ey) continue; // rounded
        v.set(x, y, ZH + 1, ex || ey ? C.chrome : x === cx + 1 && y === 13 ? C.white : C.lamp);
      }
    v.set(cx + 1, 9, ZH + 1, C.amber); v.set(cx + 2, 9, ZH + 1, C.amber); // turn signal
  }
  rbox(v, X0 + 1, X1 - 1, 3, 7, ZH + 1, ZH + 2, 1, (x, y, z) => (y === 7 ? C.chromeL : y === 3 ? C.chromeD : C.chrome));
  for (let x = -3; x <= 2; x++) for (let y = 4; y <= 6; y++) v.set(x, y, ZH + 3, y === 6 ? C.body : (x === -2 || x === 0 || x === 1) && y === 5 ? C.navy : C.white);
  // 5) windshield frame (raked) with a couple of glints, mirrors
  const zAt = (y) => ZW - Math.floor((y - YS - 1) / 5);
  for (let y = YS + 1; y <= WS_TOP; y++) for (const x of [X0 + 1, X0 + 2, X1 - 2, X1 - 1]) v.set(x, y, zAt(y), x === X0 + 1 || x === X1 - 1 ? C.cream : C.creamD);
  for (let x = X0 + 1; x <= X1 - 1; x++) { v.set(x, WS_TOP, zAt(WS_TOP), C.cream); v.set(x, WS_TOP - 1, zAt(WS_TOP), x <= X0 + 2 || x >= X1 - 2 ? C.cream : C.creamD); }
  v.set(X0 + 3, WS_TOP - 2, zAt(WS_TOP - 2), C.glassL); v.set(X0 + 4, WS_TOP - 2, zAt(WS_TOP - 2), C.glass); v.set(X0 + 3, WS_TOP - 3, zAt(WS_TOP - 3), C.glass);
  v.set(X1 - 3, YS + 2, zAt(YS + 2), C.glass);
  for (const [sx, ox] of [[-1, X0], [1, X1]]) {
    v.set(ox + sx, YS + 2, ZW - 1, C.chromeD);
    for (let y = YS + 2; y <= YS + 4; y++) { v.set(ox + sx * 2, y, ZW - 1, C.navy); v.set(ox + sx * 3, y, ZW - 1, C.navy); v.set(ox + sx * 2, y, ZW - 2, C.glass); v.set(ox + sx * 3, y, ZW - 2, y === YS + 4 ? C.glassL : C.glass); }
  }
  // 6) cab interior: dashboard (gauges + a Reynard bobblehead), bench seat
  rbox(v, X0 + 2, X1 - 2, 14, 18, ZW - 3, ZW - 1, 1, (x, y, z) => (y === 18 ? C.dashL : tone(x, y, z, C.dash, C.dashD, C.dashL)));
  for (const gx of [-4, 1]) { v.set(gx, 16, ZW - 4, C.cream); v.set(gx + 1, 16, ZW - 4, C.cream); v.set(gx + 1, 17, ZW - 4, C.red); }
  v.set(6, 19, ZW - 2, C.navy); v.set(7, 19, ZW - 2, C.navy); // bobblehead: coat
  v.set(6, 20, ZW - 2, C.fox); v.set(7, 20, ZW - 2, C.fox); v.set(6, 21, ZW - 2, C.fox); v.set(7, 21, ZW - 2, C.foxD);
  v.set(6, 20, ZW - 3, C.white); v.set(6, 22, ZW - 2, C.ink); v.set(7, 22, ZW - 2, C.ink); v.set(6, 23, ZW - 2, C.ink); v.set(7, 23, ZW - 2, C.red);
  rbox(v, -6, 5, YF, 14, SEAT_Z - 2, SEAT_Z + 4, 1, (x, y, z) => (y === 14 && z % 3 === 0 ? C.seatL : tone(x, y, z, C.seat, C.seatD, C.seatL)));
  rbox(v, -6, 5, YF, 27, ZC + 1, ZC + 2, 1, (x, y, z) => (y % 4 === 0 ? C.seatD : tone(x, y, z, C.seat, C.seatD, C.seatL)));
  // 7) rear: tail lights on the corner posts, step bumper, exhaust, brake light
  for (const x of [X0, X0 + 1, X1 - 1, X1])
    for (let y = 10; y <= 14; y++) v.set(x, y, x === X0 || x === X1 ? ZB : ZB - 1, y === 14 ? C.tailL : y === 10 ? C.amber : C.tail);
  rbox(v, X0, X1, 2, 5, ZB - 2, ZB - 1, 1, (x, y, z) => (y === 5 ? (abs(x + 0.5) < 4 ? C.chromeL : C.chrome) : y === 2 ? C.navyD : C.navy));
  for (let z = ZB - 3; z <= ZB - 1; z++) for (const x of [-10, -9]) for (const y of [3, 4]) v.set(x, y, z, z === ZB - 3 ? (y === 4 ? C.chromeL : C.chrome) : C.dashD);
  for (let x = -2; x <= 1; x++) v.set(x, YR - 1, ZB - 1, C.tail); // third brake light
  // chassis rail (so you don't see daylight under the body)
  for (let z = ZB + 1; z <= ZH - 1; z++) for (let x = -7; x <= 6; x++) v.set(x, 4, z, C.navyD);
  // 8) roof rack + parcels, a spare tyre and a strap
  for (const x of [X0 + 2, X1 - 2]) for (let z = ZB + 2; z <= ZC - 2; z++) { v.set(x, YR + 2, z, z % 6 === 0 ? C.chromeL : C.chrome); if (z % 7 === 0) v.set(x, YR + 1, z, C.chromeD); }
  for (const z of [ZB + 3, -13, ZC - 3]) for (let x = X0 + 2; x <= X1 - 2; x++) v.set(x, YR + 1, z, C.chromeD);
  kraftBox(v, -10, -3, YR + 2, YR + 8, -23, -16, { tapeX: true, label: C.red });
  kraftBox(v, -1, 8, YR + 2, YR + 6, -22, -16, { tapeX: false });
  kraftBox(v, 0, 6, YR + 7, YR + 10, -21, -17, { tapeX: true, label: C.body });
  rbox(v, 1, 9, YR + 2, YR + 6, -12, -5, 1, (x, y, z) => (y === YR + 6 ? C.bodyD : (y + z) % 3 === 0 ? C.bodyDD : C.body)); // blue ME crate
  for (const [x, y] of [[4, YR + 4], [5, YR + 4], [4, YR + 5], [5, YR + 5]]) v.set(x, y, -4, x === 4 && y === YR + 5 ? C.red : C.band);
  for (let x = -9; x <= -2; x++) for (let z = -12; z <= -5; z++) {
    const r = Math.hypot(x + 5.5, z + 8.5);
    if (r > 4.2) continue;
    const c = r < 1.6 ? C.cream : r < 2.4 ? C.creamD : r < 3.3 ? C.tireL : C.tire;
    v.set(x, YR + 2, z, c); if (r >= 1.6) v.set(x, YR + 3, z, r < 2.4 ? C.tireD : c);
  }
  for (let x = -11; x <= 9; x++) {
    let top = -1;
    for (let y = YR + 12; y >= YR + 2; y--) if (v.has(x, y, -19)) { top = y; break; }
    if (top > 0) v.set(x, top, -19, C.red);
  }
  // 9) bay decor: stacked parcels + a mail sack along the walls (the aisle stays clear for the slide)
  kraftBox(v, 4, 10, YF, YF + 6, -9, -3, { tapeX: false });
  kraftBox(v, 5, 9, YF + 7, YF + 11, -8, -4, { tapeX: true, label: C.red });
  kraftBox(v, -11, -5, YF, YF + 8, -8, -3, { tapeX: true });
  rbox(v, -10, -6, YF + 9, YF + 12, -7, -3, 1, (x, y, z) => ((y + z) % 3 === 0 ? C.bodyDD : C.body));
  ell(v, -7.5, YF + 2.5, -15, 3.2, 3, 3.6, (x, y, z) => (y >= YF + 4 && abs(x + 7.5) < 1 ? C.seatD : tone(x, y, z, C.cream, C.creamD, C.white, 0.2, 0.06)));
  v.set(-8, YF + 5, -15, C.seatD); v.set(-7, YF + 5, -15, C.seatD); v.set(-8, YF + 6, -15, C.white);
  // 10) wheel arches with dark wells and navy fender lips; humps inside the bay
  for (const wz of [WZF, WZR]) {
    for (let y = 0; y <= WY + ARCH + 1; y++)
      for (let z = wz - 11; z <= wz + 11; z++) {
        const r = Math.hypot(y + 0.5 - WY, z + 0.5 - wz);
        if (r <= ARCH) {
          for (let x = X0; x <= X0 + 4; x++) v.set(x, y, z, null);
          for (let x = X1 - 4; x <= X1; x++) v.set(x, y, z, null);
          if (y >= YB) {
            const inside = y >= YF ? (z <= ZC - 2 ? C.woodD : C.creamD) : C.navyD;
            v.set(X0 + 5, y, z, C.navyD); v.set(X1 - 5, y, z, C.navyD);
            v.set(X0 + 6, y, z, inside); v.set(X1 - 6, y, z, inside);
          }
        } else if (r <= ARCH + 1.2 && y >= YB - 1) {
          for (const x of [X0, X0 + 1, X1 - 1, X1]) if (v.has(x, y, z)) v.set(x, y, z, C.navy);
          if (y >= YF && z >= ZB && z <= ZC - 2) for (let x = X0 + 2; x <= X0 + 6; x++) v.set(x, y, z, (y + z) % 4 ? C.wood : C.woodD);
          if (y >= YF && z >= ZB && z <= ZC - 2) for (let x = X1 - 6; x <= X1 - 2; x++) v.set(x, y, z, (y + z) % 4 ? C.wood : C.woodD);
        }
      }
  }
  return v;
}

// ------------------------------------------------------------------ side livery (fine voxels, a raised sticker)
// Pixel font (3x5), just the letters we need.
const FONT = {
  M: ['x.x', 'xxx', 'xxx', 'x.x', 'x.x'], O: ['xxx', 'x.x', 'x.x', 'x.x', 'xxx'], S: ['xxx', 'x..', 'xxx', '..x', 'xxx'],
  E: ['xxx', 'x..', 'xx.', 'x..', 'xxx'], X: ['x.x', 'x.x', '.x.', 'x.x', 'x.x'], P: ['xxx', 'x.x', 'xxx', 'x..', 'x..'],
  R: ['xx.', 'x.x', 'xx.', 'x.x', 'x.x'],
};
// The emblem: a moose face with big antlers (22 x 18, top row first).
const EMBLEM = [
  'aa.a..............a.aa',
  'aaaa.a..........a.aaaa',
  '.aaaaa..........aaaaa.',
  '.aaaaaa........aaaaaa.',
  '..aaaaaaa....aaaaaaa..',
  '....aaaaFFFFFFaaaa....',
  '.......FFFFFFFF.......',
  '......FFFFFFFFFF......',
  '......FFkFFFFkFF......',
  '......FFkFFFFkFF......',
  '.......FFFFFFFF.......',
  '.......mmmmmmmm.......',
  '......mmmmmmmmmm......',
  '......mmnnmmnnmm......',
  '......mmmmmmmmmm......',
  '.......mmmmmmmm.......',
  '.........FFFF.........',
  '..........FF..........',
];
const EMB_C = { a: 0xcf9f5f, F: C.moose, k: C.ink, m: C.muz, n: C.mooseD };
function sideDecalModel(linesBack) {
  const v = new VoxelModel();
  const put = (u, y, c) => v.set(0, y, u, c);
  // badge: cream disc, navy ring, the emblem
  const cu = -linesBack * 4, cy = 64, R = 15; // nudged toward the cab, the speed lines trail behind
  for (let u = cu - R - 1; u <= cu + R; u++)
    for (let y = cy - R - 1; y <= cy + R; y++) {
      const r = Math.hypot(u + 0.5 - cu, y + 0.5 - cy);
      if (r > R) continue;
      put(u, y, r > R - 1.6 ? C.navy : r > R - 2.4 ? C.band : C.cream);
    }
  EMBLEM.forEach((row, i) => {
    for (let j = 0; j < row.length; j++) {
      const c = EMB_C[row[j]];
      if (c) put(cu - 11 + j, cy + 9 - i, c);
    }
  });
  // speed lines streaming toward the back of the van
  const s = linesBack;
  for (const [y, a, b] of [[72, 13, 21], [64, 14, 23], [56, 13, 20]]) for (let k = a; k <= b; k++) put(s * k, y, k > b - 2 ? C.creamD : C.cream);
  // MOOSE / EXPRESS
  const word = (txt, y0) => {
    const w = txt.length * 4 - 1;
    let u = cu - Math.floor(w / 2);
    for (const ch of txt) {
      const g = FONT[ch];
      for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (g[r][q] === 'x') put(u + q, y0 + 4 - r, C.cream);
      u += 4;
    }
  };
  word('MOOSE', 42);
  word('EXPRESS', 35);
  return v;
}

// ------------------------------------------------------------------ doors, ramp, wheels, steering wheel
function doorModel() {
  // right-hand door, hinge at x = 0, closing toward +x; z = -1 sits just behind the rear frame
  const v = new VoxelModel();
  for (let x = 0; x <= 10; x++)
    for (let y = YF; y <= YR - 2; y++) {
      let c = livery(x, y, -1);
      if (x === 0 || x === 10) c = y >= YR - 4 ? C.creamD : C.bodyD; // seams
      if (x >= 2 && x <= 8 && y >= 28 && y <= 37) {
        const fr = x === 2 || x === 8 || y === 28 || y === 37;
        c = fr ? C.creamD : (x + y) % 7 === 0 || (x + y) % 7 === 1 ? C.glass : y === 36 ? C.glass : C.glassD;
      }
      v.set(x, y, -1, c);
    }
  // ME sticker (yellow badge, red envelope) + handle
  for (let x = 3; x <= 6; x++) for (let y = 20; y <= 23; y++) v.set(x, y, -1, y === 21 && x > 3 && x < 6 ? C.red : C.band);
  v.set(4, 22, -1, C.redD); v.set(5, 22, -1, C.white);
  v.set(9, 22, -2, C.chrome); v.set(9, 23, -2, C.chromeL); v.set(10, 22, -2, C.chromeD);
  return v;
}
function mirrorDoor(m) {
  const out = new VoxelModel();
  for (const [k, c] of m.vox) {
    const x = (k & 1023) - 512, y = ((k >> 10) & 1023) - 512, z = ((k >> 20) & 1023) - 512;
    out.set(-1 - x, y, z, c);
  }
  return out;
}
function rampModel() {
  // extends along -z from the hinge (the floor's back edge); top surface at y = 0
  const v = new VoxelModel();
  for (let z = -RAMP_LEN; z <= -1; z++)
    for (let x = -8; x <= 7; x++) {
      let c = z % 3 === 0 ? C.chromeL : z % 3 === -1 ? C.chrome : C.chromeD;
      if (z === -RAMP_LEN) c = C.navy;
      v.set(x, -1, z, c);
      if (x === -8 || x === 7) v.set(x, 0, z, ((z + 40) >> 1) % 2 ? C.band : C.ink); // hazard rails
    }
  return v;
}
function wheelModel() {
  const v = new VoxelModel();
  const R = Math.round(WR / FV); // 14
  for (let y = -R; y < R; y++)
    for (let z = -R; z < R; z++) {
      const r = Math.hypot(y + 0.5, z + 0.5);
      if (r > R) continue;
      const a = Math.atan2(y + 0.5, z + 0.5);
      for (let x = -5; x <= 4; x++) {
        const side = x === -5 || x === 4;
        let c = null;
        if (r > R - 3.2) {
          if (r > R - 1.1) c = ((a / (PI * 2)) * 12 + 12) % 1 < 0.5 ? C.tire : C.tireL; // tread blocks
          else c = side && r < R - 2 ? C.creamD : C.tire;
          if (side && r > R - 2.2 && r <= R - 1.1) c = C.cream; // whitewall
        } else if (x >= -3 && x <= 2) {
          // recessed hubcap: cream dish, chrome lugs, red cap
          if (r < 2.4) c = x === -3 || x === 2 ? C.red : C.redD;
          else if (abs(r - 5.4) < 0.9 && ((a / (PI * 2)) * 5 + 5) % 1 < 0.28) c = C.chromeL;
          else c = r > R - 4.2 ? C.creamD : C.cream;
        }
        if (c != null) v.set(x, y, z, c);
      }
    }
  return v;
}
function steerModel() {
  // in the XY plane facing -z (the driver); column along +z toward the dash
  const v = new VoxelModel();
  const R = SWV.r * 2; // fine voxels
  for (let x = -8; x <= 7; x++)
    for (let y = -8; y <= 7; y++) {
      const r = Math.hypot(x + 0.5, y + 0.5);
      if (r > R - 1.4 && r <= R + 0.2) v.set(x, y, 0, (x + y) % 4 === 0 ? C.dashL : C.dash);
      else if (r < 2.2) { v.set(x, y, 0, C.red); v.set(x, y, -1, r < 1.2 ? C.band : C.red); }
      else if (r < R - 1.4) {
        const a = Math.atan2(y + 0.5, x + 0.5);
        for (const s of [-PI / 2, PI / 6 - 0.1, (5 * PI) / 6 + 0.1]) if (abs(Math.atan2(sin(a - s), cos(a - s))) * r < 0.8) v.set(x, y, 0, C.dashD);
      }
    }
  for (let z = 1; z <= 7; z++) { v.set(-1, -1, z, C.dashD); v.set(0, -1, z, C.dash); v.set(-1, 0, z, C.dash); v.set(0, 0, z, C.dashD); }
  return v;
}
function puffModel() {
  const v = new VoxelModel();
  ell(v, 0, 0, 0, 2.6, 2.3, 2.6, (x, y, z) => (y >= 1 && x <= 0 ? C.puffL : tone(x, y, z, C.puff, C.puffD, C.puffL, 0.25, 0.1)));
  return v;
}

// ------------------------------------------------------------------ big crates
function liveCrateModel() {
  // slatted wooden crate with air gaps (straw inside) and a curious bill poking out
  const v = new VoxelModel();
  const W = 6, H = 10, D = 5;
  for (let x = -W; x < W; x++)
    for (let y = 0; y < H; y++)
      for (let z = -D; z < D; z++) {
        const wx = x === -W || x === W - 1, wz = z === -D || z === D - 1;
        const shell = wx || wz || y === 0 || y === H - 1;
        if (!shell) { if (y <= 3) v.set(x, y, z, hash3(x, y, z) < 0.4 ? C.strawD : C.straw); continue; }
        const post = (wx && wz) || ((wx || wz) && (y === 0 || y === H - 1));
        if (!post && (y === 3 || y === 6) && (wx || wz)) continue; // air gaps between the slats
        v.set(x, y, z, post ? C.woodDD : y === H - 1 && (x + z) % 4 === 0 ? C.woodD : tone(x, y, z, C.wood, C.woodD, C.woodL, 0.16, 0.08));
      }
  // diagonal brace on the front + ME stencil + air holes on the side
  for (let k = 0; k < 8; k++) v.set(-W + 2 + k, 1 + Math.round(k * 0.9), D, C.woodD);
  v.set(2, 7, D, C.body); v.set(3, 7, D, C.body); v.set(2, 8, D, C.band); v.set(3, 8, D, C.red);
  for (const z of [-2, 1]) { v.set(W, 4, z, C.woodDD); v.set(-W - 1, 4, z, C.woodDD); }
  // a bill and a feather
  v.set(-2, 6, D, C.bill); v.set(-1, 6, D, C.bill); v.set(-2, 6, D + 1, C.billD); v.set(-1, 6, D + 1, C.bill);
  v.set(1, H, -1, C.feather); v.set(2, H + 1, -1, C.feather); v.set(1, H, 0, C.straw); v.set(-3, H, 2, C.straw);
  return v;
}
function eggCrateModel() {
  // open crate packed with straw and lots of speckled eggs
  const v = new VoxelModel();
  const W = 6, H = 6, D = 5;
  for (let x = -W; x < W; x++)
    for (let y = 0; y < H; y++)
      for (let z = -D; z < D; z++) {
        const wall = x === -W || x === W - 1 || z === -D || z === D - 1 || y === 0;
        if (!wall) { if (y >= H - 2) v.set(x, y, z, hash3(x, 5, z) < 0.35 ? C.strawD : C.straw); continue; }
        const post = (x === -W || x === W - 1) && (z === -D || z === D - 1);
        if (y === 2 && !post) { v.set(x, y, z, C.woodD); continue; }
        v.set(x, y, z, post ? C.woodDD : tone(x, y, z, C.wood, C.woodD, C.woodL, 0.18, 0.08));
      }
  for (const [x, z] of [[-W, 0], [W - 1, -2], [3, -D], [-3, D - 1]]) v.set(x, H, z, C.straw);
  for (const [ex, ez, k] of [[-3.4, -2.2, 0], [0, -2.6, 1], [3.4, -2, 2], [-3, 1.6, 3], [0.4, 1.4, 4], [3.5, 2, 5]]) {
    ell(v, ex, H + 1.4, ez, 1.7, 2.3, 1.7, (x, y, z) => (hash3(x * 3 + k, y, z) < 0.16 ? C.speck : y >= H + 2 && x < ex ? 0xfffaf0 : y < H + 1 ? C.eggD : C.egg));
  }
  // red FRAGILE tag with a white crack
  for (let x = -2; x <= 1; x++) for (let y = 1; y <= 3; y++) v.set(x, y, D, C.red);
  v.set(-1, 3, D, C.white); v.set(0, 2, D, C.white); v.set(-1, 1, D, C.white);
  return v;
}

const crateGeo = new Map();
/** Big Moose Express crate: 'live' (ducks / geese) or 'eggs'. THREE.Group, origin at the bottom centre. */
export function makeBigCrate(kind = 'live') {
  const k = kind === 'eggs' ? 'eggs' : 'live';
  let geo = crateGeo.get(k);
  if (!geo) { geo = buildGeo(k === 'eggs' ? eggCrateModel() : liveCrateModel(), [0, 0, 0], VS); crateGeo.set(k, geo); }
  const g = new THREE.Group();
  g.name = 'BigCrate_' + k;
  const m = new THREE.Mesh(geo, matFor(geo));
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  g.userData.kind = 'crate_' + k;
  g.userData.size = [0.6, k === 'eggs' ? 0.42 : 0.55, 0.5];
  return g;
}

const cache = geoCache(() => ({
  body: buildGeo(bodyModel(), [0, 0, 0], VS),
  decalR: buildGeo(sideDecalModel(-1), [0, 0, 0], FV),
  decalL: buildGeo(sideDecalModel(1), [0, 0, 0], FV),
  doorR: buildGeo(doorModel(), [0, 0, 0], VS),
  doorL: buildGeo(mirrorDoor(doorModel()), [0, 0, 0], VS),
  ramp: buildGeo(rampModel(), [0, 0, 0], VS),
  wheel: buildGeo(wheelModel(), [0, 0, 0], FV),
  steer: buildGeo(steerModel(), [0, 0, 0], FV),
  puff: buildGeo(puffModel(), [0, 0, 0], VS),
}));

// ------------------------------------------------------------------ the driver's poses
// Added per rig instance (rig._ANIMS), so MooseCourier itself stays untouched.
const _c = [0, 0], _g = [0, 0, 0];
function gripPoint(side, spin, out) {
  const a = side * 1.1 + spin;
  const ly = cos(a) * SWV.r;
  out[0] = sin(a) * SWV.r; out[1] = SWV.y + ly * cos(SWV.tilt); out[2] = SWV.z + ly * sin(SWV.tilt);
  return out;
}
/** Seated in the cab, hands on the wheel (handsL / handsR blend them off it). */
function seated(p, rig, t, { lean = 0.1, handsL = 1, handsR = 1 } = {}) {
  const van = rig._van;
  p.k.kick = 1; // the bike isn't here; keep its kickstand tucked anyway
  p.hips.rx = -0.04;
  p.chest.rx = lean; p.head.rx = -lean * 0.7 + 0.04;
  rig.legTo(p, 1, 4, 8); rig.legTo(p, -1, 4, 8);
  p.thighL.rz = 0.14; p.thighR.rz = -0.14;
  const spin = van ? van.wheelSpin : 0;
  for (const [side, w] of [[1, handsL], [-1, handsR]]) {
    if (w <= 0) continue;
    gripPoint(side, spin, _g);
    rig.toChest(p, _g[1] + 1.0, _g[2] - 0.5, _c);
    rig.reach(p, side, side * _g[0], _c[0], _c[1], [1, -0.3, -0.8], w);
    const n = side > 0 ? 'L' : 'R';
    p['wrist' + n].rx = -0.5 * w;
    p['hand' + n] = 'fist';
  }
  // lean into the corners a little; the springs do the rest
  if (van) { p.chest.rz = -van.roll * 2.2; p.head.rz = van.roll * 1.2; }
  rig.life(t, p, 0.5);
}
const DRIVE_ANIMS = {
  drive: {
    loop: true, expr: 'neutral',
    fn(t, p, f, s, rig) {
      seated(p, rig, t);
      const sp = rig._van ? clamp(abs(rig._van.speed) / 5, 0, 1) : 0;
      p.head.ry = K(t % 9, [[0, 0], [3.2, 0], [3.5, 0.35], [4.6, 0.35], [4.9, -0.3], [6, -0.3], [6.3, 0]]) * (1 - sp * 0.5);
      f.look = [p.head.ry * 1.4, 0];
      p.earL.rx = p.earR.rx = 0.45 * sp; // ears back in the wind
      if (sp > 0.4 && (t % 6) > 3.8) f.mouth = 'grin';
      if (sp > 0.6) f.expr = 'happy';
    },
  },
  drive_honk: {
    dur: 1.15, expr: 'happy', next: 'drive',
    fn(t, p, f, s, rig) {
      seated(p, rig, t, { handsR: 0 });
      // right paw slaps the horn pad twice
      const press = pulse(t, 0.12, 0.2) + pulse(t, 0.48, 0.2);
      const there = win(t, 0.02, 0.85, 0.1, 0.25);
      gripPoint(-1, rig._van ? rig._van.wheelSpin : 0, _g);
      const hy = lerp(_g[1] + 1.0, SWV.y + 1.3 - press * 0.9, there), hz = lerp(_g[2] - 0.5, SWV.z - 0.6 + press * 0.7, there);
      rig.toChest(p, hy, hz, _c);
      rig.reach(p, -1, lerp(-_g[0], 0.6, there), _c[0], _c[1], [1, -0.4, -0.6]);
      p.wristR.rx = -0.9 * there; p.handR = 'open';
      p.head.rx -= 0.1 + press * 0.08; p.head.rz += sin(t * 9) * 0.05;
      p.chest.s = 1 + press * 0.03;
      f.mouth = 'open'; f.eyes = press > 0.3 ? 'happy' : null;
    },
  },
  drive_wave: {
    dur: 2.4, expr: 'happy', next: 'drive',
    fn(t, p, f, s, rig) {
      seated(p, rig, t, { handsR: 0 });
      const up = win(t, 0.05, 2.0, 0.3, 0.35), wv = sin(t * 10);
      rig.reach(p, -1, lerp(6, 9.2 + wv * 1.1, up), lerp(-2, 12.4, up), lerp(3, 1.8, up), [1, -0.6, -0.3], 1);
      p.wristR.rz = -wv * 0.4 * up; p.handR = up > 0.5 ? 'open' : 'relax';
      p.head.ry = -0.55 * up; p.head.rz += 0.08 * up; p.chest.ry = -0.12 * up;
      f.look = [-0.8 * up, 0]; f.mouth = 'grin';
    },
  },
  drive_look: {
    loop: true, expr: 'happy',
    fn(t, p, f, s, rig) {
      seated(p, rig, t, { handsR: 0 });
      // twisted round in the seat, arm over the door: watching the parcels slide out
      const tw = smooth(t / 0.5);
      p.chest.ry = -0.35 * tw; p.head.ry = -1.15 * tw + sin(t * 1.3) * 0.08; p.head.rx += 0.12 * tw;
      rig.reach(p, -1, lerp(6, 10.5, tw), lerp(-2, 0.5, tw), lerp(3, -1.5, tw), [1, -0.4, 0.2], 1);
      p.handR = 'relax';
      f.look = [-1, -0.3];
      if ((t % 2.6) < 0.3) f.eyes = 'happy';
    },
  },
};

// ------------------------------------------------------------------ the van
const _v = new THREE.Vector3();
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class DeliveryVan {
  constructor({ shadows = true } = {}) {
    const G = (this._G = cache.get());
    const mk = (geo, parent, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, matFor(geo));
      m.castShadow = shadows;
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    this.root = new THREE.Group();
    this.root.name = 'DeliveryVan';
    this.body = grp(this.root); // everything on the springs
    this.bodyMesh = mk(G.body, this.body);
    const zc = ((ZB + ZC + 1) / 2) * VS;
    mk(G.decalR, this.body, X0 * VS - FV, 0, zc);
    const dl = mk(G.decalL, this.body, (X1 + 1) * VS + FV, 0, zc);
    dl.rotation.y = PI;
    this.doorR = grp(this.body, (X0 + 2) * VS, 0, ZB * VS); mk(G.doorR, this.doorR);
    this.doorL = grp(this.body, (X1 - 1) * VS, 0, ZB * VS); mk(G.doorL, this.doorL);
    this.ramp = grp(this.body, 0, YF * VS - 0.012, ZB * VS); mk(G.ramp, this.ramp);
    this.ramp.visible = false;
    this.seat = grp(this.body, VAN.seat.x, VAN.seat.y, VAN.seat.z);
    this.steerJ = grp(this.seat, 0, SWV.y * VS, SWV.z * VS);
    this.steerJ.rotation.x = SWV.tilt;
    this.steerMesh = mk(G.steer, this.steerJ);
    // wheels (unsprung): front ones turn
    this.wheels = [];
    for (const [z, front] of [[WZF * VS, true], [WZR * VS, false]])
      for (const s of [-1, 1]) {
        const turn = grp(this.root, s * VAN.wheelX, WR, z);
        const spin = grp(turn);
        const m = mk(G.wheel, spin);
        if (s > 0) m.rotation.y = PI; // whitewall faces out on both sides
        this.wheels.push({ turn, spin, front, side: s });
      }
    // exhaust puffs live in world space
    this.fx = new THREE.Group();
    this.fx.name = 'DeliveryVanFx';
    this.puffs = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(G.puff, matFor(G.puff));
      m.visible = false;
      this.fx.add(m);
      this.puffs.push({ m, life: 0, age: 1, vx: 0, vy: 0, vz: 0, size: 1 });
    }
    // state
    this.driver = null;
    this.onEvent = null;
    this.engine = true; // idle shimmy + puffs
    this.speed = 0; // measured ground speed (units/s along +Z)
    this.roll = 0; this.pitch = 0;
    this.wheelSpin = 0; // steering wheel spin (rad), the driver's hands follow it
    this.steer = 0; // front wheel angle
    this.backOpen = false;
    this.doorT = 0; this._doorV = 0; this.rampT = 0;
    this.time = 0;
    this._roll = 0; this._heave = 0; this._heaveV = 0; this._pitchV = 0; this._rollV = 0;
    this._honk = []; this._squash = 0; this._squashV = 0;
    this._puffT = 0; this._init = false; this._lp = new THREE.Vector3(); this._ly = 0; this._accel = 0;
    this._doorShut = true; this._rampDown = false;
  }

  /** Seat a MooseCourier (or any BipedRig with the same proportions). */
  setDriver(rig) {
    this.driver = rig;
    if (!rig) return this;
    this.seat.add(rig.root);
    rig.root.position.set(0, 0, 0);
    rig.root.rotation.set(0, 0, 0);
    if (rig.bike?.group) rig.bike.group.visible = false;
    if (rig.sparks) for (const s of rig.sparks) s.visible = false;
    rig._van = this;
    if (rig._ANIMS && rig.reach && !rig._ANIMS.drive) {
      rig._ANIMS = { ...rig._ANIMS, ...DRIVE_ANIMS };
      rig.anims = Object.keys(rig._ANIMS);
    }
    rig.play?.('drive', { fade: 0 });
    return this;
  }

  /** Forget the motion history (after teleporting the root). */
  snap() { this._init = false; return this; }

  openBack() { if (!this.backOpen) { this.backOpen = true; } return this; }
  closeBack() { this.backOpen = false; return this; }
  /** True once the ramp is all the way down. */
  get backReady() { return this.backOpen && this.rampT >= 0.999; }
  get backShut() { return !this.backOpen && this.doorT <= 0.02 && this.rampT <= 0.001; }

  honk() {
    this._honk.push(0.18, 0.54);
    if (this.driver?._ANIMS?.drive_honk) this.driver.play('drive_honk', { restart: true, fade: 0.12 });
    return this;
  }

  /** World point along the unload slide: out of the bay, down the ramp, skid to local (tx, 0, tz). */
  unloadPoint(t, tx, tz, out = new THREE.Vector3()) {
    const fy = YF * VS, bz = VAN.backZ, ez = VAN.rampEndZ;
    const k = clamp(t, 0, 1);
    let x, y, z;
    if (k < 0.3) { const u = smooth(k / 0.3); x = 0; y = fy; z = lerp(bz + 0.55, bz, u * u); } // slide to the lip
    else if (k < 0.62) { const u = (k - 0.3) / 0.32; x = tx * 0.25 * u; y = lerp(fy, 0, u); z = lerp(bz, ez, u); } // down the rollers
    else { const u = 1 - (1 - (k - 0.62) / 0.38) ** 2; x = lerp(tx * 0.25, tx, u); y = sin(u * PI) * 0.05; z = lerp(ez, tz, u); } // skid out
    out.set(x, y, z);
    this.root.updateWorldMatrix(true, false);
    return out.applyMatrix4(this.root.matrixWorld);
  }

  /** Where the exhaust pipe is (world). */
  exhaustWorld(out = new THREE.Vector3()) {
    this.body.updateWorldMatrix(true, false);
    return out.set(VAN.exhaust.x, VAN.exhaust.y, VAN.exhaust.z).applyMatrix4(this.body.matrixWorld);
  }

  /** World position of a wheel's contact patch (i: 0/1 front, 2/3 rear). */
  wheelWorld(i, out = new THREE.Vector3()) {
    const w = this.wheels[i];
    this.root.updateWorldMatrix(true, false);
    return out.set(w.side * VAN.wheelX, 0.02, w.front ? VAN.frontZ : VAN.rearZ).applyMatrix4(this.root.matrixWorld);
  }

  _emit(name, data) { if (this.onEvent) this.onEvent(name, this, data); }

  update(dt) {
    dt = clamp(dt || 0, 0, 0.1);
    this.time += dt;
    if (!this.fx.parent && this.root.parent) this.root.parent.add(this.fx);
    // --- measure the motion the caller gave the root
    const P = this.root.position, yaw = this.root.rotation.y;
    if (!this._init) { this._lp.copy(P); this._ly = yaw; this._init = true; }
    let v = 0, yawRate = 0, dy = 0;
    if (dt > 0) {
      const dx = P.x - this._lp.x, dz = P.z - this._lp.z;
      dy = P.y - this._lp.y;
      v = (dx * sin(yaw) + dz * cos(yaw)) / dt;
      yawRate = wrapA(yaw - this._ly) / dt;
      if (abs(v) > 40) { v = this.speed; dy = 0; yawRate = 0; } // a teleport, not a drive
    }
    this._lp.copy(P); this._ly = yaw;
    const accel = dt > 0 ? clamp((v - this.speed) / dt, -30, 30) : 0;
    this._accel += (accel - this._accel) * min(1, dt * 12);
    this.speed = v;
    // --- wheels roll true; front wheels + steering wheel follow the curvature
    this._roll += (v * dt) / WR;
    const kappa = abs(v) > 0.25 ? yawRate / v : 0;
    const steer = clamp(Math.atan(kappa * VAN.wheelbase), -0.55, 0.55);
    this.steer += (steer - this.steer) * min(1, dt * 8);
    this.wheelSpin = this.steer * 2.6;
    for (const w of this.wheels) {
      w.spin.rotation.x = this._roll;
      w.turn.rotation.y = w.front ? this.steer : 0;
    }
    this.steerMesh.rotation.z = -this.wheelSpin;
    // --- suspension: pitch from braking / accelerating, roll from cornering, heave from bumps
    const sub = dt > 1 / 50 ? Math.ceil(dt * 60) : 1, h = dt / sub;
    const pT = clamp(this._accel * 0.006, -0.06, 0.06), rT = clamp(yawRate * v * 0.008, -0.06, 0.06);
    if (abs(dy) > 0.001) this._heaveV -= clamp(dy, -0.5, 0.5) * 9;
    for (let i = 0; i < sub; i++) {
      this._pitchV += ((pT - this.pitch) * 120 - this._pitchV * 9) * h; this.pitch += this._pitchV * h;
      this._rollV += ((rT - this.roll) * 110 - this._rollV * 8) * h; this.roll += this._rollV * h;
      this._heaveV += (-this._heave * 160 - this._heaveV * 10) * h; this._heave += this._heaveV * h;
      this._squashV += (-this._squash * 260 - this._squashV * 11) * h; this._squash += this._squashV * h;
    }
    this._heave = clamp(this._heave, -0.08, 0.08);
    // --- horn: each beep squashes the van and pops it up a touch
    for (let i = this._honk.length - 1; i >= 0; i--) {
      this._honk[i] -= dt;
      if (this._honk[i] <= 0) { this._honk.splice(i, 1); this._squashV -= 2.6; this._heaveV += 0.9; this._emit('honk'); }
    }
    const idle = this.engine ? sin(this.time * 47) * 0.004 + sin(this.time * 23) * 0.003 : 0;
    const s = 1 + clamp(this._squash, -0.12, 0.12);
    this.body.position.y = this._heave + idle + max(0, -this._squash) * 0.25;
    this.body.rotation.set(this.pitch, 0, this.roll + (this.engine ? sin(this.time * 31) * 0.0025 : 0));
    this.body.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    // --- back doors (springy swing), then the ramp
    const doorGoal = this.backOpen ? 1 : this.rampT > 0.02 ? this.doorT : 0;
    const sd = dt > 1 / 50 ? Math.ceil(dt * 60) : 1, hd = dt / sd;
    for (let i = 0; i < sd; i++) { this._doorV += ((doorGoal - this.doorT) * 90 - this._doorV * (this.backOpen ? 7 : 12)) * hd; this.doorT += this._doorV * hd; }
    if (!this.backOpen && this.doorT < 0) { this.doorT = 0; this._doorV = 0; }
    if (this.backOpen && this._doorShut) { this._doorShut = false; this._emit('door_open'); }
    if (!this.backOpen && !this._doorShut && this.doorT < 0.04 && this.rampT <= 0.001) { this._doorShut = true; this._heaveV -= 0.5; this._emit('door_shut'); }
    const da = clamp(this.doorT, -0.05, 1.12) * 1.85;
    this.doorR.rotation.y = da; this.doorL.rotation.y = -da;
    const rampGoal = this.backOpen && this.doorT > 0.8 ? 1 : 0;
    const wasDown = this.rampT >= 0.999;
    this.rampT = clamp(this.rampT + (rampGoal ? 1 : -1) * dt / 0.9, 0, 1);
    if (this.rampT >= 0.999 && !this._rampDown) { this._rampDown = true; this._heaveV -= 0.4; this._emit('ramp_down'); }
    if (wasDown && this.rampT < 0.999) { this._rampDown = false; this._emit('ramp_up'); }
    const ra = smooth(this.rampT / 0.45), rb = this.rampT < 0.45 ? 0 : (this.rampT - 0.45) / 0.55;
    this.ramp.visible = this.rampT > 0.005;
    this.ramp.position.z = ZB * VS + (1 - ra) * VAN.rampLen;
    // tilt down with a little bounce when the lip hits the ground
    const tilt = rb <= 0 ? 0 : rb < 0.8 ? smooth(rb / 0.8) * 1.04 : 1.04 - 0.04 * smooth((rb - 0.8) / 0.2);
    this.ramp.rotation.x = -VAN.rampAngle * tilt;
    // --- exhaust: a lazy putt-putt at idle, chuffs when pulling away
    this._puffT -= dt;
    const throttle = clamp(this._accel / 3, 0, 1);
    if (this.engine && this._puffT <= 0) {
      this._puffT = lerp(0.75, 0.16, throttle) * (0.8 + Math.random() * 0.4);
      this.spawnPuff(0.75 + throttle * 0.6 + Math.random() * 0.25);
    }
    for (const pf of this.puffs) {
      if (pf.age >= pf.life) continue;
      pf.age += dt;
      const k = pf.age / pf.life;
      if (k >= 1) { pf.m.visible = false; continue; }
      pf.m.position.x += pf.vx * dt; pf.m.position.y += pf.vy * dt; pf.m.position.z += pf.vz * dt;
      pf.vx *= 1 - dt * 2.5; pf.vz *= 1 - dt * 2.5; pf.vy += dt * 0.25;
      const sc = pf.size * Math.sin(PI * Math.pow(k, 0.55));
      pf.m.scale.setScalar(max(0.001, sc));
    }
    // --- the driver rides along
    if (this.driver) { this.driver._van = this; this.driver.update(dt); }
  }

  spawnPuff(size = 1) {
    const pf = this.puffs.find((q) => q.age >= q.life);
    if (!pf) return;
    this.exhaustWorld(pf.m.position);
    const yaw = this.root.rotation.y;
    const back = -0.9 - Math.max(0, this.speed) * 0.15;
    pf.vx = sin(yaw) * back + (Math.random() - 0.5) * 0.3;
    pf.vz = cos(yaw) * back + (Math.random() - 0.5) * 0.3;
    pf.vy = 0.35 + Math.random() * 0.2;
    pf.age = 0; pf.life = 0.75 + Math.random() * 0.3; pf.size = size;
    pf.m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    pf.m.visible = true;
    pf.m.scale.setScalar(0.001);
    this._emit('puff', { position: pf.m.position });
  }

  dispose() {
    if (this.root.parent) this.root.parent.remove(this.root);
    if (this.fx.parent) this.fx.parent.remove(this.fx);
    if (this.driver) { this.driver._van = null; this.driver = null; }
    cache.release();
  }
}

void beat; void hash3;
