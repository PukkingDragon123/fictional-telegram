"""Clumps of foliage built from leaves you can see one by one.

grove.Painter.clump and menu_trees.MenuPainter.clump light a rounded clump as one
form and fleck it with a leaf-sized hash. Read from across the screen that is a
sponge. Here the same clump is covered with real leaf shapes instead:

  - a staggered grid of leaves, pinned to the clump so they sway with it;
  - each leaf is a pointed oval (narrow at the stem and the tip), turned outward
    from the clump's middle and drooping a little;
  - each leaf takes one tone from the light on the clump at its own centre;
    its sunlit half is one step lighter and its shaded half one step darker;
  - where no leaf covers the clump, the gap sinks into deep shade;
  - leaves on the rim stick out past the clump's edge, so the silhouette is
    leafy and not a smooth blob.

    import leaf_shapes; leaf_shapes.install()      # patches both painters
"""
import math
import numpy as np
import grove
from grove import noise, _hash, LIGHT

_ORIG = {}
LIGHT2 = np.array([-0.6, -0.8])                 # the light's direction on screen (from the upper left)


def _leaves(Xt, Yt, lcx, lcy, R, flat, gnorm, seed, L, Wd, sx, sy):
    """Leaf cover of a clump in its own (pinned) coordinates.
    Returns (covered, lit at the leaf's centre, side (-1 shaded half, +1 lit half),
    the leaf's own hash, how far along the leaf (0 stem .. 1 tip), the leaf centre's clump radius)."""
    shp = Xt.shape
    best = np.full(shp, -9.0)
    cov = np.zeros(shp, bool)
    litc = np.zeros(shp)
    side = np.zeros(shp)
    hsh = np.zeros(shp)
    tt = np.zeros(shp)
    rc_ = np.zeros(shp)
    rim = np.zeros(shp, bool)
    gy0 = np.floor(Yt / sy)
    for dj in (-1, 0, 1):
        gy = gy0 + dj
        stag = (gy % 2) * 0.5
        gx0 = np.floor(Xt / sx - stag)
        for di in (-1, 0, 1):
            gx = gx0 + di
            h1, h2, h3 = _hash(gx, gy, seed + 11), _hash(gx, gy, seed + 23), _hash(gx, gy, seed + 37)
            ccx = (gx + stag + 0.2 + 0.6 * h1) * sx
            ccy = (gy + 0.2 + 0.6 * h2) * sy
            ox, oy = (ccx - lcx) / R, (ccy - lcy) / (R * flat)
            rc = np.sqrt(ox * ox + oy * oy)
            ang = np.arctan2(oy + 0.55, ox) + (h3 - 0.5) * 1.3      # outward, drooping
            ca, sa = np.cos(ang), np.sin(ang)
            dx, dy = Xt - ccx, Yt - ccy
            a = dx * ca + dy * sa
            b = -dx * sa + dy * ca
            t = a / L + 0.5
            half = Wd * np.sin(np.pi * np.clip(t, 0, 1)) ** 0.8
            inl = (t >= -0.02) & (t <= 1.02) & (np.abs(b) <= half + 0.3) & (rc < 1.08)
            # the light on the clump at the leaf's centre
            q = np.clip(rc, 0, 1)
            nz = np.sqrt(np.clip(1 - q * q, 0, 1))
            n = np.stack([ox * 0.85, oy * 0.85, nz], -1)
            n = n / np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
            n = n * 0.62 + gnorm[None, None, :] * 0.48
            n = n / np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
            lc = np.clip(n @ LIGHT, 0, 1)
            pri = lc + 0.35 * h3                                      # sunlit leaves lie on top
            win = inl & (pri > best)
            best = np.where(win, pri, best)
            cov |= inl
            litc = np.where(win, lc, litc)
            # which half: the side of the midrib that faces the light
            px_, py_ = dx - a * ca, dy - a * sa
            sd = np.where(px_ * LIGHT2[0] + py_ * LIGHT2[1] > 0.0, 1.0, -1.0)
            side = np.where(win, sd, side)
            hsh = np.where(win, h1, hsh)
            tt = np.where(win, t, tt)
            rc_ = np.where(win, oy, rc_)
            rm = ((np.abs(b) > half - 0.75) & (sd < 0)) | (t > 0.93) | (t < 0.06)
            rim = np.where(win, rm, rim)
    return cov, litc, side, hsh, tt, rc_, rim


def _clump(self, c, R, z, gnorm, mat, seed, flat=0.85, base_v=0.0, depth=0.0, holes=0.0, off=(0, 0), cid=None,
           leaf=None, needles=False):
    cx, cy = c
    Rx, Ry = R * 1.3 + 4, R * flat * 1.3 + 4
    x0, x1 = int(max(0, cx - Rx)), int(min(self.w, cx + Rx + 1))
    y0, y1 = int(max(0, cy - Ry)), int(min(self.h, cy + Ry + 1))
    if x1 <= x0 or y1 <= y0:
        return
    X, Y = self.xx[y0:y1, x0:x1] + 0.5, self.yy[y0:y1, x0:x1] + 0.5
    Xt, Yt = X - off[0], Y - off[1]
    lx, ly = (X - cx) / R, (Y - cy) / (R * flat)
    rr = np.sqrt(lx * lx + ly * ly)
    th = np.arctan2(ly, lx)
    edge = 1 + 0.09 * np.sin(th * 4 + seed) + 0.06 * np.sin(th * 7 + seed * 1.3)
    edge = edge + (noise(Xt * 0.3, Yt * 0.3, seed) - 0.5) * 0.2
    core = rr < edge * 0.86
    size = (leaf or 2.6) / 2.6
    L, Wd = 8.6 * size, 2.5 * size
    cov, litc, side, hsh, tt, oyc, edge_ = _leaves(Xt, Yt, cx - off[0], cy - off[1], R, flat, gnorm, seed,
                                                   L, Wd, 5.6 * size, 3.9 * size)
    inside = core | cov
    if holes:
        inside &= ~((noise(Xt * 0.2, Yt * 0.2, seed + 4) < holes) & (rr < 0.82) & (rr > 0.25))
    if not inside.any():
        return
    # a leaf: one tone from the light at its centre, its lit half a step up, its shaded half a step down
    val = 0.06 + 0.94 * litc + base_v - 0.24 * np.clip(oyc, 0, 1) ** 1.4 + (hsh - 0.5) * 0.12
    val = val + np.where(side > 0, 0.1, 0.0)                     # the half facing the sun
    val = val - np.where(edge_, 0.2, 0.0)                         # its shaded rim parts it from the next leaf
    # between the leaves: deep shade, darker toward the clump's underside
    q = np.clip(rr / np.maximum(edge, 0.3), 0, 1)
    nz = np.sqrt(np.clip(1 - q * q, 0, 1))
    n = np.stack([lx * 0.85, ly * 0.85, nz], -1)
    n = n / np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    n = n * 0.62 + gnorm[None, None, :] * 0.48
    n = n / np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
    lit = np.clip(n @ LIGHT, 0, 1)
    gap = 0.06 + 0.94 * lit + base_v - 0.24 * np.clip(ly, 0, 1) ** 1.4 - 0.34
    val = np.where(cov, val, gap) - depth
    zz = z + nz * R * 1.1 + R * 0.5 + cov * 0.5
    win = inside & (zz > self.z[y0:y1, x0:x1])
    self.z[y0:y1, x0:x1][win] = zz[win]
    self.v[y0:y1, x0:x1][win] = val[win]
    self.mat[y0:y1, x0:x1][win] = mat
    if cid is not None and hasattr(self, 'cid'):
        self.cid[y0:y1, x0:x1][win] = cid


def _grove_clump(self, c, R, z, gnorm, mat, seed, flat=0.85, base_v=0.0, depth=0.0, holes=0.0, needles=False):
    if needles:
        return _ORIG['grove'](self, c, R, z, gnorm, mat, seed, flat, base_v, depth, holes, needles)
    return _clump(self, c, R, z, gnorm, mat, seed, flat, base_v, depth, holes, leaf=2.0)


def _menu_clump(self, c, R, z, gnorm, mat, seed, flat=0.85, base_v=0.0, depth=0.0, holes=0.0, off=(0, 0), cid=-1,
                leaf=2.6):
    return _clump(self, c, R, z, gnorm, mat, seed, flat, base_v, depth, holes, off=off, cid=cid, leaf=leaf * 1.1)


def _render(self, ramps, dither=None):
    """Leaves keep their one tone: almost no dither on foliage."""
    d = dict(dither or {})
    for m in ramps:
        if m >= 2:
            d[m] = min(d.get(m, 0.9), 0.12)
    return _ORIG['render'](self, ramps, d)


def install():
    import menu_trees
    if _ORIG:
        return
    _ORIG['grove'] = grove.Painter.clump
    _ORIG['menu'] = menu_trees.MenuPainter.clump
    _ORIG['render'] = grove.Painter.render
    grove.Painter.clump = _grove_clump
    menu_trees.MenuPainter.clump = _menu_clump
    grove.Painter.render = _render
