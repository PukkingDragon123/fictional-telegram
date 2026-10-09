// Scene presets for the promo renders (see stage.js for what each field does).
// Screen positions (sx, sy) are fractions of the frame, y down.
export const PRESETS = {
  // itch cover: rendered at 1260x1000 (pixel scale 2 = 630x500 low-res, the 1x cover is that exactly)
  thumb: {
    viewport: [1260, 1000], px: 1, masks: ['fox', 'bear'],
    opts: {
      camF: -0.4, fill: 0.5,
      fox: { sx: 0.25, sy: 1.11, scale: 3.2, rot: 0.32, pose: { eyes: 'wide', brow: 'high', calm: true, tail: 1.6, mx: -1.8, my: 9.4, mz: 12, look: [0.8, 0.1] } },
      bear: { type: 'office', sx: 0.69, sy: 0.83, scale: 1.75, sink: 0.7 },
      fish: [
        { id: 'sockeye', sx: 0.5, sy: 0.84, y: 1.6, rot: 0.8 },
        { id: 'rainbow', sx: 0.88, sy: 0.84, y: 1.3, rot: -0.7, dir: -1 },
        { id: 'goldfish', sx: 0.9, sy: 0.95, y: 0.4, rot: -0.3, dir: -1 },
      ],
    },
  },
};

// itch banner: rendered at 1920x480 with pixel density 1.3 -> pixel scale 2 (960x240 low-res)
const npc = (cls, sx, sy, anim, t, extra = {}) => ({ cls, sx, sy, anim, t, ...extra });
PRESETS.banner = {
  viewport: [1920, 480], px: 1.3, masks: ['fox', ['b1', 'b2', 'b3', 'b4']],
  opts: {
    wupp: 0.022, camR: 0.5, camF: 1.4, sun: [-0.1, 0.62], fill: 0.8,
    clear: [[0.3, 0.3, 0.7, 0.63], [0.7, 0.45, 1, 0.95]],
    cast: [
      // party props on the far bank
      { kind: 'prop', type: 'stringlights', sx: 0.44, sy: 0.44 },
      { kind: 'prop', type: 'stringlights', sx: 0.56, sy: 0.44 },
      { kind: 'prop', type: 'jukebox', sx: 0.355, sy: 0.5, rot: 0.4 },
      { kind: 'prop', type: 'tikitorch', sx: 0.325, sy: 0.56 },
      { kind: 'prop', type: 'tikitorch', sx: 0.67, sy: 0.5 },
      // the neighbours dancing (back row on the bank, front row at the water's edge)
      npc('DeerGuy', 0.395, 0.5, 'cheers', 0.9),
      npc('OwlRanger', 0.465, 0.49, 'happy', 0.6),
      npc('TurtleElder', 0.535, 0.49, 'happy', 0.6),
      npc('OtterFisher', 0.605, 0.5, 'happy', 0.6),
      npc('ChipmunkTrader', 0.365, 0.6, 'happy', 0.64),
      npc('FrogGranny', 0.425, 0.58, 'happy', 0.62),
      npc('HedgehogBaker', 0.48, 0.59, 'happy', 0.58),
      npc('RaccoonMerchant', 0.565, 0.58, 'laugh', 0.5),
      npc('BunnyGardener', 0.62, 0.59, 'happy', 0.66),
      npc('WoodpeckerCarpenter', 0.665, 0.58, 'wave', 0.5),
      { kind: 'fox', sx: 0.515, sy: 0.74, h: -0.1, anim: 'cheer', t: 0.42, scale: 1.25, name: 'fox' },
      // the bears crash the party
      { kind: 'prop', type: 'picnictable', sx: 0.725, sy: 0.67, rot: 0.5, tilt: [0.95, -0.55], lift: 0.15 },
      { kind: 'bear', type: 'boss', sx: 0.745, sy: 0.6, rot: -0.55, pose: 'smash', t01: 0.42, scale: 0.85, name: 'b1' },
      { kind: 'bear', type: 'office', sx: 0.84, sy: 0.68, rot: -0.75, pose: 'charge', speed: 3, time: 0.45, scale: 0.85, name: 'b2' },
      { kind: 'bear', type: 'ceo', sx: 0.935, sy: 0.8, rot: -0.45, pose: 'roar', t01: 0.62, scale: 0.9, name: 'b3' },
      { kind: 'bear', type: 'office', seed: 9.1, sx: 0.655, sy: 0.86, h: -0.5, rot: -0.35, pose: 'roar', t01: 0.66, scale: 0.85, name: 'b4' },
    ],
    splashes: [{ sx: 0.655, sy: 0.86, n: 3 }],
    fx: [
      { name: 'confetti', sx: 0.5, sy: 0.5, y: 1.2, args: [70] },
      { name: 'notes', sx: 0.36, sy: 0.5, y: 1.4, args: [4] },
      { name: 'notes', sx: 0.6, sy: 0.5, y: 1.4, args: [4] },
      { name: 'debris', sx: 0.725, sy: 0.67, y: 0.6, args: [40] },
    ],
  },
};

// ------------------------------------------------------------------ animated GIF versions
// 20 frames over a 2 s loop (10 fps). Every animated thing is periodic in that loop (see stage.js).
const LOOP = { frames: 20, period: 2.0, timeAmp: 0.5 };
const clone = (o) => JSON.parse(JSON.stringify(o));
{
  const o = clone(PRESETS.thumb.opts);
  o.loop = LOOP;
  o.bear.loop = { range: [0.05, 1] };
  o.fish = [
    { id: 'sockeye', sx: 0.43, sy: 0.88, arc: [0.57, 0.8, 1.9], rot: 0.8, s: 1.5, off: 0.1 },
    { id: 'rainbow', sx: 0.97, sy: 0.88, arc: [0.83, 0.8, 1.5], dir: -1, s: 1.5, off: 0.55 },
    { id: 'goldfish', sx: 0.95, sy: 0.99, arc: [0.8, 0.95, 0.9], dir: -1, s: 1.5, off: 0.3 },
  ];
  o.loopFx = [
    { type: 'splash', sx: 0.69, sy: 0.84, h: -0.1, n: 50, rate: 2, r0: 1.1, radius: 1.3, height: 1.1, size: 0.11 },
    { type: 'splash', sx: 0.69, sy: 0.84, h: -0.1, n: 30, rate: 1, r0: 1.3, radius: 2.0, height: 1.8, size: 0.13, seed: 3 },
  ];
  PRESETS.thumbAnim = { kind: 'thumb', viewport: PRESETS.thumb.viewport, px: 1, masks: ['fox', 'bear'], opts: o };
}
{
  const o = clone(PRESETS.banner.opts);
  o.loop = LOOP;
  const offs = [0, 0.35, 0.7, 0.15, 0.5, 0.85, 0.25, 0.6, 0.95, 0.4];
  let k = 0;
  for (const a of o.cast) {
    if (a.kind === 'fox') { a.anim = 'dance'; a.loop = { cycles: 1 }; }
    else if (a.kind === 'bear') {
      if (a.pose === 'charge') a.loop = { strides: 2, speed: 3 };
      else a.loop = { range: [0, 1], off: a.name === 'b4' ? 0.5 : a.name === 'b3' ? 0.25 : 0 };
    } else if (a.cls) {
      a.loop = { off: offs[k++ % offs.length] };
      if (a.cls === 'WoodpeckerCarpenter' || a.cls === 'RaccoonMerchant') { a.anim = 'happy'; }
    }
  }
  o.loopFx = [
    { type: 'confetti', sx: 0.5, sy: 0.52, n: 90, rate: 1, top: 2.6, fall: 2.6, spread: 3.2, size: 0.2 },
    { type: 'splash', sx: 0.655, sy: 0.86, h: -0.1, n: 40, rate: 2, r0: 0.55, radius: 1.0, height: 1.0, size: 0.08 },
    { type: 'splash', sx: 0.725, sy: 0.67, n: 24, rate: 1, radius: 1.0, height: 1.2, size: 0.09, color: 0x9a6a40, seed: 11 },
  ];
  o.fx = [];
  PRESETS.bannerAnim = { kind: 'banner', viewport: PRESETS.banner.viewport, px: 1.3, masks: PRESETS.banner.masks, opts: o };
}

// ------------------------------------------------------------------ "Flint & Steel" update (mining + industry)
// Shot in Flint's Quarry (src/world/quarry.js: floor x 42..54, z 10..17, mine at 49.5, 11.1), in daylight.
// Cast placed in world coordinates (wx, wz); ry = absolute yaw (0 = facing the camera, which looks north).
const FS_LOOK = { daylight: true, hour: 16.5, haze: 0.1, fill: 0.35, bloom: 0.65, yaw: 0, skyD: 14, clear: [[0, 0, 1, 3]] };
const PICK = { s: 7, rx: 1.57 };
const quarryCast = (o = {}) => [
  { kind: 'model', make: 'mine.makeMineEntrance', wx: 49.5, wz: 10.6, ry: 0 },
  { kind: 'rail', wx: 49.5, wz: 11.4, wx2: 49.5, wz2: 16.9 },
  { kind: 'cart', wx: 49.5, wz: 11.6, wx2: 49.5, wz2: 15.2, load: 'gold' },
  { kind: 'model', make: 'mine.makeOreBin', wx: 50.55, wz: 16.4, ry: 0, fill: 0.85 },
  { kind: 'model', make: 'mine.makeExcavator', wx: 45.9, wz: 11.7, ry: 0.35, dig: 0.5, digLoop: 1 },
  { kind: 'model', make: 'mine.makeVein', args: ['gold', 3], wx: 47.1, wz: 12.75, ry: 0 },
  { kind: 'model', make: 'mine.makeVein', args: ['iron', 5], wx: 51.4, wz: 13.15, ry: 0 },
  { kind: 'model', make: 'mine.makeVein', args: ['copper', 4], wx: 45.2, wz: 16.0, ry: 0.4 },
  { kind: 'model', make: 'ind.ind_smelter', wx: 53.4, wz: 12.4, ry: 0, st: { on: true, k: 1, lamp: 'on' } },
  { kind: 'belt', wx: 53.0, wz: 13.9, ry: 0, n: 3, per: 2, laps: 1 },
  { kind: 'bear', type: 'construction', wx: 47.1, wz: 12.0, rot: 0, pose: 'smash', t01: 0.55, scale: 0.78, seed: 2.1, pick: PICK, name: 'b1', loop: { range: [0, 1], off: 0 } },
  { kind: 'bear', type: 'construction', wx: 51.4, wz: 12.4, rot: -0.15, pose: 'smash', t01: 0.3, scale: 0.78, seed: 8.2, pick: PICK, name: 'b2', loop: { range: [0, 1], off: 0.5 } },
  { kind: 'badger', wx: 45.0, wz: 14.3, rot: 0.45, name: 'flint', ...(o.flint || {}) },
  { kind: 'beaver', wx: 44.5, wz: 16.6, ry: 2.28, off: 0 },
  { kind: 'beaver', wx: 45.9, wz: 16.6, ry: -2.28, off: 0.5 },
];
const quarryFx = [
  { type: 'sparks', wx: 47.1, wz: 12.75, y: 0.25, n: 26, rate: 1, off: 0.5, radius: 0.7, height: 0.9 },
  { type: 'sparks', wx: 51.4, wz: 13.15, y: 0.25, n: 26, rate: 1, off: 0, radius: 0.7, height: 0.9, seed: 5 },
  { type: 'sparks', wx: 45.35, wz: 14.75, y: 0.1, n: 18, rate: 2, off: 0.743, radius: 0.5, height: 0.7, seed: 9 },
  { type: 'splash', wx: 45.2, wz: 16.0, y: 0, n: 14, rate: 4, r0: 0.1, radius: 0.5, height: 0.6, size: 0.06, color: 0xd0763e, seed: 13 },
  { type: 'smoke', wx: 52.95, wz: 11.9, y: 2.85, n: 9, rate: 1, rise: 1.9, drift: 0.5, size: 0.38, seed: 17 },
  { type: 'smoke', wx: 45.7, wz: 11.4, y: 1.6, n: 6, rate: 1, rise: 1.3, drift: 0.3, size: 0.26, seed: 19 },
];
const LOOP_FS = { frames: 20, period: 2.0, timeAmp: 0.5 };
PRESETS.fsBannerAnim = {
  kind: 'fsbanner', scene: 'banner', viewport: [1920, 480], px: 1.3, masks: ['fox', ['flint']], still: 6,
  opts: { ...FS_LOOK, loop: LOOP_FS, wupp: 0.018, pitch: 20, focusWorld: [47.3, 12.7],
    cast: [...quarryCast(), { kind: 'fox', wx: 48.45, wz: 16.4, scale: 1.3, rot: 0.15, shock: { cheeks: true, expr: 'excited', blush: 1, calm: true }, name: 'fox' }],
    loopFx: quarryFx },
};
PRESETS.fsThumbAnim = {
  kind: 'fsthumb', scene: 'banner', viewport: [1260, 1000], px: 1, masks: ['fox', ['flint']], still: 6,
  opts: { ...FS_LOOK, loop: LOOP_FS, wupp: 0.0145, pitch: 19, focusWorld: [49.7, 12.3],
    cast: [...quarryCast({ flint: { wx: 50.55, wz: 16.3, scale: 1.7, rot: -0.5 } }).filter((a) => a.make !== 'mine.makeOreBin'),
      { kind: 'fox', sx: 0.23, sy: 1.1, front: 6, scale: 3.4, rot: 0.3, shock: { cheeks: true, expr: 'excited', blush: 1, calm: true, look: [0.7, 0] }, name: 'fox' }],
    loopFx: [...quarryFx.slice(0, 2), { type: 'sparks', wx: 49.95, wz: 17.0, y: 0.1, n: 26, rate: 2, off: 0.743, radius: 0.8, height: 1.0, seed: 9 }, ...quarryFx.slice(3)] },
};
