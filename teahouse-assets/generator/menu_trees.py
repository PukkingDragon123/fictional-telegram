"""The main menu's trees and foliage, drawn the way the pack draws its garden.

Everything here is grown and painted with the pack's own tools and colours, so it
sits with the trees in the teahouse window view:

  - trees come from grove.py: branches by space colonisation, pipe-model
    thickness, bark lit across its width, leaves painted as lit clumps with
    leafy edges (grove.Painter), the pack's LEAF_RICH / LEAF_COOL / BARK /
    SAKURA ramps; the distant ones are hazed with outside._haze
  - plants come from meadow.py (tuft, flower_plant, susuki, heads) and trees.bush,
    moss from moss.py, the falling bits use life.FALL's pairs and the
    tumbling-cell sprites of life.garden_fall / grove.drifting_leaf

What is new is the arrangement for this scene and the wind: every part leans with
menu_layout.wind at its own x, through a spring (heavy limbs slow and late, twigs and
leaves quick), so the gust is seen travelling across the screen and the loop is
seamless (the spring's response is taken in its steady periodic state).

Layers (N frames of 640 x 360 RGBA each, transparent elsewhere):
    big_tree    the old flowering tree in the right foreground
    falling     petals and leaves shed from it on the gust
    far_trees   the tree line at the horizon and the trees in the middle distance
    foliage     reeds and irises on the banks, ferns and a hydrangea at the tree's foot,
                tall grass in the bottom-left corner

Run as a script: writes main_menu/layers/<name>/ (sheet, frame 0, json, 3x preview)."""
import json
import math
import os
import random
import sys
from contextlib import contextmanager

import numpy as np
from PIL import Image

import menu_layout as ML
import grove
import meadow
import moss
import life
from grove import noise, _hash, LIGHT
from pixel import Canvas, PAL, step
from trees import _catmull

W, H, N, FPS = ML.W, ML.H, ML.N, ML.FPS
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.join(ROOT, 'main_menu', 'layers')


# ---------------------------------------------------------------- wind
_XB = np.arange(-96, W + 97, 4, dtype=float)                 # x bins the wind is sampled on
_WIND = np.array([[ML.wind(x, f) for f in range(N)] for x in _XB])
_RESP = {}


def _spring(period, zeta=0.32, sub=6, loops=5):
    """How something with its own natural period (frames) and damping leans when
    menu_layout.wind pushes on it: a spring driven by the gust at each x bin, run
    until it settles into its periodic state so the loop has no seam. Returned
    centred (0 = its rest pose, + = pushed right)."""
    key = (period, zeta)
    if key in _RESP:
        return _RESP[key]
    w0 = 2 * math.pi / period
    F = _WIND
    u = F[:, 0].copy()
    v = np.zeros_like(u)
    out = np.zeros_like(F)
    dt = 1.0 / sub
    for loop in range(loops):
        for f in range(N):
            if loop == loops - 1:
                out[:, f] = u
            f0, f1 = F[:, f], F[:, (f + 1) % N]
            for s in range(sub):
                force = f0 + (f1 - f0) * (s / sub)
                v += (w0 * w0 * (force - u) - 2 * zeta * w0 * v) * dt
                u += v * dt
    out -= out.mean(axis=1, keepdims=True)
    _RESP[key] = out
    return out


def lean(x, f, period=18, zeta=0.32):
    """Signed lean (about -0.3 .. +0.9) of something at screen x with natural period
    `period` frames, on frame f."""
    R = _spring(period, zeta)
    i = (x - _XB[0]) / 4.0
    i0 = int(np.clip(math.floor(i), 0, len(_XB) - 2))
    t = min(1.0, max(0.0, i - i0))
    f = f % N
    return float(R[i0, f] * (1 - t) + R[i0 + 1, f] * t)


def gust(x, f):
    """menu_layout.wind, read from the table (same numbers, cheaper)."""
    i = (x - _XB[0]) / 4.0
    i0 = int(np.clip(math.floor(i), 0, len(_XB) - 2))
    t = min(1.0, max(0.0, i - i0))
    f = f % N
    return float(_WIND[i0, f] * (1 - t) + _WIND[i0 + 1, f] * t)


@contextmanager
def patched(mod, **attrs):
    """Borrow a module's code with a few of its globals swapped (e.g. meadow's frame
    count and sway), restoring them afterwards. Nothing on disk is touched."""
    old = {k: getattr(mod, k) for k in attrs}
    for k, v in attrs.items():
        setattr(mod, k, v)
    try:
        yield
    finally:
        for k, v in old.items():
            setattr(mod, k, v)


# ---------------------------------------------------------------- painter
class MenuPainter(grove.Painter):
    """grove.Painter whose bark and leaf textures ride with the part (an integer
    offset), so a swaying clump moves as one piece instead of its leaves swimming
    through a fixed pattern; it also records which clump owns each pixel."""

    def __init__(self, w, h):
        super().__init__(w, h)
        self.cid = np.full((h, w), -1, int)

    def segment(self, a, b, ra, rb, za, zb, tex_seed, mat=1, off=(0, 0), grain=1.0):
        """grove.Painter.segment with the texture pinned to the branch (off) and
        `grain` < 1 for broader bark plates on the big trunk."""
        x0 = int(max(0, math.floor(min(a[0] - ra, b[0] - rb)) - 1))
        x1 = int(min(self.w, math.ceil(max(a[0] + ra, b[0] + rb)) + 2))
        y0 = int(max(0, math.floor(min(a[1] - ra, b[1] - rb)) - 1))
        y1 = int(min(self.h, math.ceil(max(a[1] + ra, b[1] + rb)) + 2))
        if x1 <= x0 or y1 <= y0:
            return
        X, Y = self.xx[y0:y1, x0:x1] + 0.5, self.yy[y0:y1, x0:x1] + 0.5
        dx, dy = b[0] - a[0], b[1] - a[1]
        L2 = dx * dx + dy * dy + 1e-9
        t = np.clip(((X - a[0]) * dx + (Y - a[1]) * dy) / L2, 0, 1)
        cx, cy = a[0] + t * dx, a[1] + t * dy
        r = ra + (rb - ra) * t
        d = np.hypot(X - cx, Y - cy)
        inside = d <= np.maximum(r, 0.5)
        if not inside.any():
            return
        L = math.sqrt(L2)
        nx, ny = -dy / L, dx / L
        s = np.clip(((X - cx) * nx + (Y - cy) * ny) / np.maximum(r, 0.5), -1, 1)
        nz = np.sqrt(np.clip(1 - s * s, 0, 1))
        lit = np.clip(s * nx * LIGHT[0] + s * ny * LIGHT[1] + nz * LIGHT[2], 0, 1)
        z = za + (zb - za) * t + nz * r * 0.05
        Xt, Yt = X - off[0], Y - off[1]
        u = (Xt * dx + Yt * dy) / L
        vv = Xt * nx + Yt * ny
        tex = noise(vv * 0.85 * grain, u * 0.13 * grain, tex_seed)
        val = 0.2 + 0.72 * lit + 0.28 * (tex - 0.5)
        val = np.where((tex < 0.24) & (r > 1.6), val * 0.45, val)  # fissures
        val = val - 0.12 * np.clip(-z / 30.0, 0, 1)
        win = inside & (z > self.z[y0:y1, x0:x1])
        self.z[y0:y1, x0:x1][win] = z[win]
        self.v[y0:y1, x0:x1][win] = val[win]
        self.mat[y0:y1, x0:x1][win] = mat
        self.cid[y0:y1, x0:x1][win] = -1

    def clump(self, c, R, z, gnorm, mat, seed, flat=0.85, base_v=0.0, depth=0.0, holes=0.0, off=(0, 0), cid=-1,
              leaf=2.6):
        """grove.Painter.clump with its edge, holes and leaf shapes pinned to the
        clump (off), and `leaf` the size of the little leaf shapes."""
        cx, cy = c
        Rx, Ry = R * 1.3 + 2, R * flat * 1.3 + 2
        x0, x1 = int(max(0, cx - Rx)), int(min(self.w, cx + Rx + 1))
        y0, y1 = int(max(0, cy - Ry)), int(min(self.h, cy + Ry + 1))
        if x1 <= x0 or y1 <= y0:
            return
        X, Y = self.xx[y0:y1, x0:x1] + 0.5, self.yy[y0:y1, x0:x1] + 0.5
        Xt, Yt = X - off[0], Y - off[1]
        lx, ly = (X - cx) / R, (Y - cy) / (R * flat)
        rr = np.sqrt(lx * lx + ly * ly)
        th = np.arctan2(ly, lx)
        edge = 1 + 0.09 * np.sin(th * 4 + seed) + 0.06 * np.sin(th * 7 + seed * 1.3) + 0.04 * np.sin(th * 11 + seed * 0.7)
        edge = edge + (noise(Xt * 0.55, Yt * 0.55, seed) - 0.5) * (0.34 if R > 6 else 0.2)
        inside = rr < edge
        if holes:
            inside &= ~((noise(Xt * 0.2, Yt * 0.2, seed + 4) < holes) & (rr < 0.82) & (rr > 0.25))
        if not inside.any():
            return
        q = np.clip(rr / np.maximum(edge, 0.3), 0, 1)
        nz = np.sqrt(np.clip(1 - q * q, 0, 1))
        n = np.stack([lx * 0.85, ly * 0.85, nz], axis=-1)
        n = n / np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
        n = n * 0.62 + gnorm[None, None, :] * 0.48
        n = n / np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)
        lit = np.clip(n @ LIGHT, 0, 1)
        val = 0.06 + 0.94 * lit + base_v
        val = val - 0.24 * np.clip(ly, 0, 1) ** 1.4                  # the underside in its own shade
        gx, gy = np.floor((Xt + (np.floor(Yt / 2) % 2) * 1.3) / leaf), np.floor(Yt / 2.0)
        g = _hash(gx, gy, seed + 2)
        val = val + np.where((g > 0.76) & (lit > 0.3), 0.14, 0.0) - np.where((g < 0.24) & (lit < 0.8), 0.14, 0.0)
        rim = inside & ~np.roll(np.roll(inside, 1, 0), 1, 1)         # a sunlit rim along the upper-left edge
        val = val + np.where(rim & (lit > 0.45), 0.16, 0.0)
        val = val - depth
        zz = z + nz * R * 1.1 + R * 0.5
        win = inside & (zz > self.z[y0:y1, x0:x1])
        self.z[y0:y1, x0:x1][win] = zz[win]
        self.v[y0:y1, x0:x1][win] = val[win]
        self.mat[y0:y1, x0:x1][win] = mat
        self.cid[y0:y1, x0:x1][win] = cid


# ---------------------------------------------------------------- growth helpers
def colonise_from(rng, nodes, parent, points, step=2.6, influence=30.0, kill=5.0, up=0.1, iters=320,
                  can_grow=None):
    """grove.colonise, but growing out of a skeleton that is already there (the
    trunk and the big limbs, drawn by hand), into the attraction points."""
    nodes = [np.array(p, float) for p in nodes]
    parent = list(parent)
    grow_ok = list(can_grow) if can_grow is not None else [True] * len(nodes)
    P = np.array(points, float)
    alive = np.ones(len(P), bool)
    for _ in range(iters):
        if not alive.any():
            break
        Nn = np.array(nodes)
        ok_nodes = np.array(grow_ok)
        Pa = P[alive]
        d = np.linalg.norm(Pa[:, None, :] - Nn[None, :, :], axis=2)
        d[:, ~ok_nodes] = 1e9
        near = d.argmin(axis=1)
        dmin = d[np.arange(len(Pa)), near]
        ok = dmin < influence
        if not ok.any():
            break
        grow = {}
        for pi in np.nonzero(ok)[0]:
            ni = near[pi]
            v = Pa[pi] - Nn[ni]
            v = v / (np.linalg.norm(v) + 1e-6)
            grow[ni] = grow.get(ni, 0) + v
        added = 0
        for ni, v in grow.items():
            v = v / (np.linalg.norm(v) + 1e-6) + np.array([0, -up, 0])
            v = v / (np.linalg.norm(v) + 1e-6)
            q = Nn[ni] + v * step
            if np.min(np.linalg.norm(Nn - q, axis=1)) < step * 0.45:
                continue
            nodes.append(q)
            parent.append(ni)
            grow_ok.append(True)
            added += 1
        if not added:
            break
        Nn = np.array(nodes)
        dk = np.linalg.norm(P[:, None, :] - Nn[None, -added:, :], axis=2).min(axis=1)
        alive &= dk > kill
    return np.array(nodes), np.array(parent)


def limb_path(ctrl, step_len=2.6):
    """A hand-placed limb: control points (x, y, r) -> sampled (x, y, r) along a
    Catmull-Rom curve through them."""
    pts = _catmull([(p[0], p[1]) for p in ctrl], 0.35)
    arc = [0.0]
    for i in range(1, len(pts)):
        arc.append(arc[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    carc = [0.0]
    for i in range(1, len(ctrl)):
        carc.append(carc[-1] + math.hypot(ctrl[i][0] - ctrl[i - 1][0], ctrl[i][1] - ctrl[i - 1][1]))
    out = []
    total = arc[-1]
    s = 0.0
    j = 0
    while s <= total:
        while j < len(arc) - 2 and arc[j + 1] < s:
            j += 1
        x, y = pts[j]
        q = s / total * carc[-1]
        k = min(len(ctrl) - 2, max(0, int(np.searchsorted(carc, q) - 1)))
        tt = (q - carc[k]) / max(1e-6, carc[k + 1] - carc[k])
        r = ctrl[k][2] + (ctrl[k + 1][2] - ctrl[k][2]) * min(1.0, max(0.0, tt))
        out.append((x, y, r))
        s += step_len
    return out
