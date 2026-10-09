// Shared constants of the title diorama (TitleWorld + TitleCast).
export const WUPP = 1 / 24; // world units per low-res pixel (the game's own sprite scale)

// render order slots, back to front (layers never depth test; the cast does)
export const ORDER = {
  sky: 0, cloudsHigh: 1, rangeFar: 2, cloudsLow: 3, birds: 4, rangeNear: 5, horizon: 6, mountain: 8, office: 9, trailBears: 10,
  mistBase: 11, forestFar: 12, rays: 13, mistFar: 14, forestNear: 15, mistNear: 16, water: 17, meadow: 18, low: 20, actors: 21,
  splash: 22, front: 23, top: 24,
};
