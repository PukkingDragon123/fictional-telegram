"""Drawing the giant as pixel art, so it belongs in the painted world: the 3D
pose is rendered at twice the art resolution, each art pixel takes the
material most of its block shows, shaded with that material's ramp from the
blood-moon night palette (ordered dither where tones meet), then the pixel
artist's finishing: dark contour lines where one part passes in front of
another, the red rim of moonlight along every edge that faces the sky, the
small eyes burning, and the pack's selective outline round the whole shape."""
import numpy as np

import look
from pixel import Canvas, PAL
from objects import outline
from raster3d import render_smooth

RAMPS = {1: ('night2', 'night4', 'pink0', 'pink1', 'pink2'),                     # skin: pale under the red moon
         2: ('night3', 'pink0', 'pink1', 'pink2', 'pink3'),                      # bone: ribs, knees, knuckles, jaw
         3: ('ink', 'night0', 'night1', 'night2', 'night3'),                     # chitin plates, spines, antennae
         4: ('blood3', 'blood4', 'fire4', 'fire5'),                              # the eyes, burning
         5: ('ink', 'blood0', 'blood1', 'blood2'),                               # the mouth
         6: ('ink', 'ink', 'night0'),                                            # the eye sockets
         7: ('ink', 'night0', 'night1'),                                         # claws and teeth
         8: ('night2', 'night4', 'pink0', 'pink1')}                              # tendons
RGB = {k: np.array([PAL[c] for c in v], np.float32) for k, v in RAMPS.items()}
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0 - 0.47
FILL = np.array([0.3, 0.7, -0.65])
FILL = FILL / np.linalg.norm(FILL)
RIM, RIM2 = np.array(PAL['blood2'], np.float32), np.array(PAL['blood1'], np.float32)


def draw(cam, meshes, k=2, bright=0.0, warm=None):
    """Returns (rgba art uint8 (H/k, W/k, 4) in RGB order, depth per art pixel).
    bright lifts the tones (a lit close-up); warm: (art mask fn) unused."""
    d, ids, n, a = render_smooth(cam, meshes)
    H, W = ids.shape
    h, w = H // k, W // k
    m = ids > 0
    V = -look.rays(cam)
    N = look._n(n)
    flip = (N * V).sum(-1) < 0
    N[flip] *= -1
    fill = np.clip(N @ FILL, 0, 1)
    top = N[..., 1] * 0.5 + 0.5
    v = (0.1 + 0.62 * fill + 0.28 * top + bright) * (0.75 + 0.25 * a[..., 0] / 200.0)
    blk = lambda x: x[:h * k, :w * k].reshape(h, k, w, k).swapaxes(1, 2).reshape(h, w, k * k)
    I, Vb, D = blk(ids), blk(v), blk(d)
    cnt = np.stack([(I == q).sum(-1) for q in range(1, 9)], -1)
    mat = cnt.argmax(-1) + 1
    solid = (I > 0).sum(-1) >= (k * k) / 2
    sel = I == mat[..., None]
    val = (Vb * sel).sum(-1) / np.maximum(sel.sum(-1), 1)
    dep = np.where(sel, D, 1e30).min(-1)
    yy, xx = np.mgrid[0:h, 0:w]
    out = np.zeros((h, w, 4), np.uint8)
    for q, ramp in RGB.items():
        sm = solid & (mat == q)
        if not sm.any():
            continue
        nr = len(ramp)
        x = np.clip(val[sm], 0, 0.999) * nr + BAYER[yy[sm] % 4, xx[sm] % 4] * 0.3
        if q == 4:
            x = x * 0 + nr - 1 - (BAYER[yy[sm] % 4, xx[sm] % 4] > 0.3)
        out[sm, :3] = ramp[np.clip(x.astype(int), 0, nr - 1)]
        out[sm, 3] = 255
    # contour lines where a part passes in front of another
    dark = np.zeros((h, w), bool)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        nd = np.roll(dep, (dy, dx), (0, 1))
        ns = np.roll(solid, (dy, dx), (0, 1))
        dark |= solid & ns & (dep > nd * 1.012 + 0.5)
    first = {q: RGB[q][0] for q in RGB}
    for q in RGB:
        sm = dark & (mat == q) & (q != 4)
        out[sm, :3] = (out[sm, :3] * 0.3 + first[q] * 0.7).astype(np.uint8)
    # the moon's rim on edges that face the sky
    up = np.vstack([np.zeros((1, w), bool), solid[:-1]])
    edge = solid & ~up & (mat != 4)
    out[edge, :3] = RIM.astype(np.uint8)
    edge2 = solid & up & ~np.vstack([np.zeros((2, w), bool), solid[:-2]]) & (mat != 4) & ~edge
    out[edge2, :3] = (out[edge2, :3] * 0.4 + RIM2 * 0.6).astype(np.uint8)
    side = solid & (~np.roll(solid, 1, 1) | ~np.roll(solid, -1, 1)) & ~edge & (mat != 4)
    out[side, :3] = (out[side, :3] * 0.55 + RIM2 * 0.45).astype(np.uint8)
    # the eyes glow a pixel out into the dark round them
    eye = solid & (mat == 4)
    ring = np.zeros((h, w), bool)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        ring |= np.roll(eye, (dy, dx), (0, 1))
    ring &= ~eye & solid
    out[ring, :3] = (out[ring, :3] * 0.4 + np.array(PAL['blood3'], np.float32) * 0.6).astype(np.uint8)
    # the pack's selective outline
    cv = Canvas(w, h)
    cv.a = out
    o = outline(cv).a[1:-1, 1:-1]
    grown = o[..., 3] > 0
    depo = dep.copy()
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        depo = np.minimum(depo, np.roll(dep, (dy, dx), (0, 1)))
    depo = np.where(solid, dep, np.where(grown, depo, 1e30))
    return np.ascontiguousarray(o), depo
