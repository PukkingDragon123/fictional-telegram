"""Organic pass: no ruler-straight lines or perfect boxes.

  warp()       bends a whole sprite through a smooth noise field, so long
               straight edges (boards, frames, posts, the counter) sag and
               wander by a pixel or so, like old timber drawn by hand
  wear_corners() knocks the hard corners off a sprite's silhouette and nibbles
               its edges a little, so outlines read worn rather than cut

Both only move or remove existing pixels, so every colour stays in the palette.
The field depends on scene position, so neighbouring layers bend together."""
import numpy as np


def _hash(ix, iy, s):
    h = np.sin(ix * 127.1 + iy * 311.7 + s * 74.7) * 43758.5453
    return h - np.floor(h)


def _noise(x, y, s):
    ix, iy = np.floor(x), np.floor(y)
    fx, fy = x - ix, y - iy
    ux, uy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = _hash(ix, iy, s), _hash(ix + 1, iy, s)
    c, d = _hash(ix, iy + 1, s), _hash(ix + 1, iy + 1, s)
    return a + (b - a) * ux + (c - a + (a - b - c + d) * ux) * uy


def warp(cv, amp=1.2, scale=46.0, ox=0, oy=0, seed=3.0):
    """Displace every pixel by a smooth field (nearest sampling, palette-safe).
    (ox, oy): where the sprite sits in the scene, so the field is shared."""
    a = cv.a
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    X, Y = xx + ox, yy + oy
    dx = (_noise(X / scale, Y / scale, seed) - 0.5) * 2 * amp + (_noise(X / 13, Y / 13, seed + 5) - 0.5) * 0.6 * amp
    dy = (_noise(X / scale, Y / scale, seed + 9) - 0.5) * 2 * amp + (_noise(X / 13, Y / 13, seed + 7) - 0.5) * 0.6 * amp
    sx = np.clip(np.round(xx + dx).astype(int), 0, w - 1)
    sy = np.clip(np.round(yy + dy).astype(int), 0, h - 1)
    cv.a = a[sy, sx].copy()
    return cv


def wear_corners(cv, seed=1.0, nibble=0.08):
    """Remove convex corner pixels (and a few edge pixels) of the silhouette."""
    a = cv.a
    solid = a[..., 3] > 0
    if not solid.any():
        return cv

    def sh(m, dx, dy):
        o = np.zeros_like(m)
        H, W = m.shape
        o[max(0, dy):H + min(0, dy), max(0, dx):W + min(0, dx)] = m[max(0, -dy):H - max(0, dy), max(0, -dx):W - max(0, dx)]
        return o
    up, dn, lf, rt = sh(solid, 0, 1), sh(solid, 0, -1), sh(solid, 1, 0), sh(solid, -1, 0)
    n = up.astype(int) + dn + lf + rt
    yy, xx = np.mgrid[0:solid.shape[0], 0:solid.shape[1]]
    r = _hash(xx.astype(float), yy.astype(float), seed)
    corner = solid & (n <= 2) & ((~up & ~lf) | (~up & ~rt) | (~dn & ~lf) | (~dn & ~rt))
    edge = solid & (n == 3) & (r < nibble)
    kill = (corner & (r < 0.85)) | edge
    out = a.copy()
    out[kill] = 0
    # the pixel now on the edge takes the outline colour of its neighbour, so the line stays closed
    cv.a = out
    return cv


def organic_prop(frames, x, y, seed):
    """Same bend for every frame of a prop (so animation doesn't shimmer)."""
    out = []
    for f in frames:
        g = f.copy()
        if min(g.a.shape[:2]) >= 12:
            warp(g, amp=0.9, scale=30.0, ox=x, oy=y, seed=seed)
            wear_corners(g, seed=seed)
        out.append(g)
    return out
