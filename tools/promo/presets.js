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
