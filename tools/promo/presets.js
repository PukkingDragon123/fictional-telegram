// Scene presets for the promo renders (see stage.js for what each field does).
// Screen positions (sx, sy) are fractions of the frame, y down.
export const PRESETS = {
  // itch cover: rendered at 1260x1000 (pixel scale 2 = 630x500 low-res, the 1x cover is that exactly)
  thumb: {
    viewport: [1260, 1000], px: 1, masks: ['fox', 'bear'],
    opts: {
      camF: -0.4,
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
  viewport: [1920, 480], px: 1.3, masks: [],
  opts: {
    wupp: 0.025, camR: 0.5, camF: -0.8, sun: [-0.36, 0.62],
    cast: [
      // party props on the far bank
      { kind: 'prop', type: 'stringlights', sx: 0.43, sy: 0.4, rot: 0 },
      { kind: 'prop', type: 'stringlights', sx: 0.57, sy: 0.4, rot: 0 },
      { kind: 'prop', type: 'jukebox', sx: 0.35, sy: 0.43, rot: 0.3 },
      { kind: 'prop', type: 'tikitorch', sx: 0.31, sy: 0.47 },
      { kind: 'prop', type: 'tikitorch', sx: 0.66, sy: 0.43 },
      // the neighbours dancing
      npc('DeerGuy', 0.38, 0.46, 'cheers', 0.9),
      npc('FrogGranny', 0.42, 0.5, 'happy', 0.62),
      npc('OwlRanger', 0.46, 0.44, 'happy', 0.6),
      npc('RaccoonMerchant', 0.5, 0.5, 'laugh', 0.5),
      npc('TurtleElder', 0.55, 0.44, 'happy', 0.6),
      npc('BunnyGardener', 0.585, 0.5, 'happy', 0.66),
      npc('OtterFisher', 0.62, 0.45, 'happy', 0.6),
      npc('ChipmunkTrader', 0.335, 0.52, 'happy', 0.64),
      npc('WoodpeckerCarpenter', 0.645, 0.52, 'wave', 0.5),
      npc('HedgehogBaker', 0.47, 0.54, 'happy', 0.58),
      { kind: 'fox', sx: 0.515, sy: 0.6, h: -0.1, anim: 'dance', t: 1.25, scale: 1.0, name: 'fox' },
      // the bears crash the party
      { kind: 'prop', type: 'picnictable', sx: 0.72, sy: 0.5, rot: 0.6, tilt: [0.5, -0.9] },
      { kind: 'bear', type: 'boss', sx: 0.75, sy: 0.5, rot: -1.1, pose: 'smash', t01: 0.55, scale: 1.1 },
      { kind: 'bear', type: 'office', sx: 0.86, sy: 0.62, rot: -1.3, pose: 'charge', speed: 3, time: 0.4, scale: 1.1 },
      { kind: 'bear', type: 'ceo', sx: 0.95, sy: 0.75, rot: -1.25, pose: 'charge', speed: 3, time: 0.7, scale: 1.1 },
      { kind: 'bear', type: 'accountant', sx: 0.79, sy: 0.78, h: 0.4, rot: -1.0, pose: 'cannonball', t01: 0.35, scale: 1.0 },
    ],
    splashes: [{ sx: 0.79, sy: 0.86, n: 3 }],
    fx: [
      { name: 'confetti', sx: 0.48, sy: 0.4, y: 1.2, args: [60] },
      { name: 'notes', sx: 0.35, sy: 0.4, y: 1.4, args: [4] },
      { name: 'notes', sx: 0.6, sy: 0.4, y: 1.4, args: [4] },
      { name: 'debris', sx: 0.72, sy: 0.5, y: 0.5, args: [30] },
    ],
  },
};
