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
