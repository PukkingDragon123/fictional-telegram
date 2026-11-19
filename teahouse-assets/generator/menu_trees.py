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

    def segment(self, a, b, ra, rb, za, zb, tex_seed, mat=1, off=(0, 0), grain=1.0, ridges=False):
        """grove.Painter.segment with the texture pinned to the branch (off), `grain` < 1
        for broader bark plates, and on old wood (ridges) long twisting ridges with dark
        furrows between them, catching the light on the lit side."""
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
        if ridges:
            ang = np.arcsin(s) / math.pi + 0.5
            nr = max(3.0, float(np.mean(r)) * 0.42)
            q = ang * nr + u * 0.03 + 0.7 * noise(u * 0.035, ang * 1.5, tex_seed + 9)
            fr = q - np.floor(q)
            val = np.where(fr < 0.15, val * 0.6, val)                           # the furrows
            val = np.where((fr > 0.42) & (fr < 0.62) & (s < 0.35), val + 0.09, val)   # ridge tops in the light
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


# ---------------------------------------------------------------- the big tree
HX0, HW, HH = 268, W - 268, 386          # the big tree's painting box: screen x 268..640, y 0..386 (cropped to 360)
LEAF = grove.LEAF_RICH
LEAF_DEEP = tuple([LEAF[0]] + list(LEAF[:-1]))          # grove's summer variation: some clumps a shade deeper
BLOOM_LIT = ((0, 0, 'pink3'), (-1, 0, 'white'), (1, 0, 'white'), (0, -1, 'white'), (0, 1, 'pink4'))
BLOOM_MID = ((0, 0, 'pink2'), (-1, 0, 'pink4'), (1, 0, 'pink3'), (0, -1, 'pink4'))
BLOOM_SHD = ((0, 0, 'pink1'), (1, 0, 'pink2'))

# screen coords (x, y, radius): the trunk, then the big limbs, drawn by hand for the composition
TRUNK = [(592, 386, 30), (589, 366, 25), (582, 338, 21.5), (574, 306, 19), (575, 274, 17.5), (582, 248, 16.5),
         (586, 232, 16)]
LIMBS = [
    # the long branch, reaching left across the sky toward the middle (it leaves the trunk on the left)
    [(578, 240, 12.5), (556, 216, 10.8), (530, 198, 9.4), (504, 186, 8.2), (478, 170, 7.0), (450, 154, 5.9),
     (420, 140, 4.8), (392, 130, 3.8), (366, 124, 2.9), (342, 121, 2.0), (322, 122, 1.4)],
    # the leader going up and a little left
    [(584, 230, 12.5), (578, 200, 11.2), (566, 166, 9.6), (554, 128, 8.1), (542, 90, 6.6), (532, 52, 5.2),
     (524, 14, 4.0), (520, -24, 3)],
    # the leader going up on the right
    [(592, 232, 13), (606, 200, 12), (614, 162, 10.4), (620, 122, 8.6), (626, 80, 7), (632, 38, 5.4),
     (636, -14, 4.2)],
    # a limb out to the right edge
    [(606, 204, 8.8), (622, 192, 7.6), (642, 184, 6.4), (668, 178, 5.2)],
    # a secondary limb off the left leader, out over the long branch
    [(562, 158, 6.4), (538, 138, 5.4), (512, 118, 4.4), (486, 100, 3.4), (462, 86, 2.5)],
    # a low limb from the long branch, dipping and rising again
    [(474, 168, 4.2), (450, 174, 3.4), (424, 172, 2.6), (402, 164, 2.0)],
]
# where the crown is (screen x, y, rx, ry, rz, points): the masses the twigs grow into
MASSES = [(604, 16, 62, 46, 30, 420), (520, 30, 50, 36, 28, 300), (470, 80, 38, 28, 24, 200),
          (578, 92, 50, 34, 30, 300), (632, 136, 34, 42, 26, 220), (530, 128, 34, 22, 22, 140),
          (470, 136, 30, 17, 18, 110), (424, 122, 28, 15, 16, 90), (380, 112, 22, 12, 13, 60),
          (346, 110, 15, 9, 10, 30), (420, 158, 22, 10, 12, 50), (642, 188, 22, 16, 16, 60), (560, 160, 24, 14, 16, 60)]
CROWN_C, CROWN_R = (540, 80), (160, 110, 60)
KNOTS = [(569, 296, 4.5, 6.5), (592, 252, 2.6, 3.4), (514, 182, 2.4, 2.0)]


def _l(p):
    """screen -> painting box coords"""
    return (p[0] - HX0, p[1])


class Hero:
    """The big tree, grown once; frame(f) paints it leaning in the wind at frame f."""

    def __init__(self, seed=5):
        rng = random.Random(seed)
        self.rng = rng
        nodes, parent, rdes, grow = [], [], [], []

        def nearest(x, y):
            Nn = np.array(nodes)
            return int(np.argmin((Nn[:, 0] - x) ** 2 + (Nn[:, 1] - y) ** 2))

        # trunk
        z = 0.0
        for i, (x, y, r) in enumerate(limb_path([(*_l(p), p[2]) for p in TRUNK])):
            nodes.append((x, y, z))
            parent.append(len(nodes) - 2 if i else -1)
            rdes.append(r)
            grow.append(y < 200)
        self.n_trunk = len(nodes)
        self.limb_of = [0] * len(nodes)
        for li, ctrl in enumerate(LIMBS):
            path = limb_path([(*_l(p), p[2]) for p in ctrl])
            j = nearest(*path[0][:2])
            z = rng.uniform(-3, 3)
            dz = rng.uniform(-0.25, 0.25)
            for k, (x, y, r) in enumerate(path[1:]):
                z += dz + rng.gauss(0, 0.15)
                nodes.append((x, y, z))
                parent.append(j if k == 0 else len(nodes) - 2)
                rdes.append(r)
                grow.append(y < 200)
                self.limb_of.append(li + 1)
        self.n_design = len(nodes)
        # the twigs, grown into the crown masses
        pts = []
        for (cx, cy, rx, ry, rz, n) in MASSES:
            lc = _l((cx, cy))
            pts += grove.ellipsoid_points(rng, n, lc, (rx, ry, rz), lump=0.28, seed=cx * 0.1)
        pts = [p for p in pts if p[1] > -30]
        nodes, parent = colonise_from(rng, nodes, parent, pts, step=2.6, influence=30, kill=5, up=0.08,
                                      can_grow=grow)
        self.limb_of += [-1] * (len(nodes) - len(self.limb_of))
        r = grove.radii(parent, r_tip=0.5, e=2.3)
        rdes = np.array(rdes + [0.0] * (len(nodes) - len(rdes)))
        self.r = np.maximum(r * 0.85, rdes)
        self.nodes, self.parent = nodes, parent
        self._wind_setup(rng)
        self._leaves(rng)
        self._extras(rng)
        self._moss(random.Random(seed + 40))

    # -- wind: how far each node gives (beam compliance from the foot up), and when
    def _wind_setup(self, rng):
        n = len(self.nodes)
        c = np.zeros(n)
        for i in range(1, n):
            j = self.parent[i]
            if j < 0:
                continue
            L = math.hypot(*(self.nodes[i][:2] - self.nodes[j][:2]))
            c[i] = c[j] + L / (self.r[i] + 2.0) ** 1.6
        self.flex = c / np.percentile(c, 98)
        self.twig = np.clip(1 - self.r / 3.5, 0, 1)

    def offsets(self, f):
        """Integer (dx, dy) of every node on frame f."""
        X = self.nodes[:, 0] + HX0
        slow = np.array([lean(x, f, 30, 0.28) for x in X[::1]])
        fast = np.array([lean(x, f, 11, 0.22) for x in X])
        dx = 7.0 * self.flex * slow + 2.2 * self.twig * self.flex * fast
        dy = -0.35 * np.abs(dx) * (X < 520)
        return np.round(dx).astype(int), np.round(dy).astype(int)

    # -- leaves
    def _leaves(self, rng):
        nodes, parent, r = self.nodes, self.parent, self.r
        kids = np.bincount(parent[parent >= 0], minlength=len(parent))
        clusters = []
        for i in range(self.n_design, len(nodes)):
            if r[i] > 2.0 or (kids[i] > 0 and rng.random() < 0.35):
                continue
            x, y, z = nodes[i]
            if noise(x / 15.0, y / 15.0, 11.3) < 0.2 and rng.random() < 0.7:      # holes in the crown
                continue
            clusters.append((x + rng.uniform(-1.5, 1.5), y + rng.uniform(-1.5, 1.0), z, rng.uniform(3.4, 5.2), i))
        Pc = np.array([(c_[0], c_[1]) for c_ in clusters])
        T = 11.0
        kc = int(len(clusters) / 7)
        cen, lab = grove._kmeans(Pc, kc, rng, iters=18)
        clumps = []
        for j in range(len(cen)):
            idx = np.nonzero(lab == j)[0]
            if not len(idx):
                continue
            mem = [clusters[i] for i in idx]
            d = np.hypot(*(np.array([(m_[0], m_[1]) for m_ in mem]) - cen[j]).T)
            Rc = float(np.clip(np.percentile(d, 85) + np.mean([m_[3] for m_ in mem]) * 1.2 + 2, T * 0.7, T * 1.35))
            zc = float(np.percentile([m_[2] for m_ in mem], 88))
            anchor = int(min(mem, key=lambda m_: math.hypot(m_[0] - cen[j][0], m_[1] - cen[j][1]))[4])
            clumps.append([cen[j][0], cen[j][1], zc, Rc, rng.random() * 9, anchor, False])
        for (x, y, z, rad, i) in clusters:                     # the leafy fringe round the outside
            dmin = min(math.hypot(x - c_[0], y - c_[1]) / c_[3] for c_ in clumps)
            if dmin > 0.85 and rng.random() < 0.45:
                clumps.append([x, y, z + 2, rad * 1.2, rng.random() * 9, i, True])
        self.clumps = clumps
        self.mat_of = [10 if rng.random() < 0.72 else 11 for _ in clumps]
        self.cl_period = [rng.choice((8, 9, 10, 12, 13)) for _ in clumps]

    def _gnorm(self, x, y, z):
        best = min(MASSES, key=lambda m: ((x + HX0 - m[0]) / m[2]) ** 2 + ((y - m[1]) / m[3]) ** 2)
        gm = np.array([(x + HX0 - best[0]) / best[2], (y - best[1]) / best[3], z / best[4]])
        gg = np.array([(x + HX0 - CROWN_C[0]) / CROWN_R[0], (y - CROWN_C[1]) / CROWN_R[1], z / CROWN_R[2]])
        g = 0.55 * gm / (np.linalg.norm(gm) + 1e-6) + 0.45 * gg / (np.linalg.norm(gg) + 1e-6)
        inner = float(np.clip(1 - np.linalg.norm(gg), 0, 1))
        return g / (np.linalg.norm(g) + 1e-6), inner

    def _extras(self, rng):
        """blossom clusters and flip-leaf spots, pinned to their clumps"""
        self.blooms = []                       # (clump, x, y, [(dx, dy)])
        for ci, (x, y, z, R, sd, anchor, fringe) in enumerate(self.clumps):
            if rng.random() > (0.62 if not fringe else 0.3):
                continue
            for _ in range(rng.choice((1, 2, 2, 3))):
                hang = rng.random() < 0.2
                a = rng.uniform(0.3, 2.6) if hang else rng.uniform(-math.pi * 0.92, -0.25)
                rr = R * (rng.uniform(0.7, 0.95) if hang else rng.uniform(0.3, 0.8))
                bx, by = x + math.cos(a) * rr, y + math.sin(a) * rr * 0.85
                n = rng.randint(6, 12)
                fl = [(rng.gauss(0, 1.6), rng.gauss(0, 1.15)) for _ in range(n)]
                self.blooms.append((ci, bx, by, fl, hang))
        self.flips = []                        # (clump, x, y, threshold, phase)
        for ci, (x, y, z, R, sd, anchor, fringe) in enumerate(self.clumps):
            for _ in range(rng.randint(2, 6)):
                a = rng.uniform(-math.pi * 0.95, 0.1)
                rr = R * rng.uniform(0.35, 0.95)
                self.flips.append((ci, x + math.cos(a) * rr, y + math.sin(a) * rr * 0.85, rng.uniform(0.5, 0.92),
                                   rng.uniform(0, 6.28), rng.random() < 0.5))

    def _bark_only(self):
        P = MenuPainter(HW, HH)
        nodes, parent, r = self.nodes, self.parent, self.r
        for i in range(1, len(nodes)):
            j = parent[i]
            if j >= 0:
                a, b = nodes[j], nodes[i]
                P.segment(a[:2], b[:2], r[j], r[i], a[2] * 3, b[2] * 3, 5.7, grain=0.7 if r[j] > 6 else 1.0,
                          ridges=r[j] > 5)
        return P.render({1: grove.BARK})

    def _moss(self, rng):
        """Moss (moss.py) on the tops of the big limbs, in the fork and in patches low on
        the trunk, grown on the tree at rest; each patch then rides with its branch."""
        from scipy import ndimage
        bare = self._bark_only()
        cv = bare.copy()
        # moss clinging along the upper side of the long branch, inside its outline so it reads on the bark
        path = limb_path([(*_l(p), p[2]) for p in LIMBS[0]], 1.0)
        x = _l((420, 0))[0]
        while x < _l((572, 0))[0]:
            p = min(path, key=lambda q: abs(q[0] - x))
            w_ = rng.randint(8, 15) if p[2] > 6 else rng.randint(5, 8)
            if p[2] > 3.4:
                ytop = int(round(p[1] - p[2] * 1.0))
                moss.clump(cv, rng, int(x) - 1, ytop, w_, max(3, int(p[2] * rng.uniform(0.6, 0.9))), 'wall')
            x += w_ + rng.choice((0, 2, 4, 8, 14))
        moss.sprout_tops(cv, rng, n=5, size=(5, 9), height=(2, 3), region=(_l((540, 0))[0], 190, HW, 250))
        trunk = np.zeros((HH, HW), bool)
        for (x, y, rr) in limb_path([(*_l(p), p[2]) for p in TRUNK]):
            yy, xx = np.ogrid[0:HH, 0:HW]
            trunk |= (xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= (rr - 1.5) ** 2
        moss.patches(cv, rng, (_l((556, 0))[0], 296, _l((584, 0))[0], 366), 3, size=(12, 20), mode='wall',
                     where=lambda x, y: trunk[min(HH - 1, y), min(HW - 1, x)])
        moss.patches(cv, rng, (_l((568, 0))[0], 234, _l((596, 0))[0], 262), 2, size=(9, 14), mode='wall',
                     where=lambda x, y: trunk[min(HH - 1, y), min(HW - 1, x)])
        diff = (cv.a != bare.a).any(-1) & (cv.a[..., 3] > 0)
        lab, n = ndimage.label(diff, structure=np.ones((3, 3)))
        self.moss = []
        for k in range(1, n + 1):
            ys, xs = np.nonzero(lab == k)
            cx, cy = xs.mean(), ys.mean()
            d = (self.nodes[:, 0] - cx) ** 2 + (self.nodes[:, 1] - cy) ** 2 + (self.r < 2) * 1e6
            self.moss.append((int(np.argmin(d)), ys, xs, cv.a[ys, xs].copy()))

    def frame(self, f):
        nodes, parent, r = self.nodes, self.parent, self.r
        ox, oy = self.offsets(f)
        P = MenuPainter(HW, HH)
        for i in range(1, len(nodes)):
            j = parent[i]
            if j < 0:
                continue
            a, b = nodes[j], nodes[i]
            big = r[j] > 6
            P.segment((a[0] + ox[j], a[1] + oy[j]), (b[0] + ox[i], b[1] + oy[i]), r[j], r[i], a[2] * 3, b[2] * 3,
                      5.7, off=(ox[j], oy[j]), grain=0.7 if big else 1.0, ridges=r[j] > 5)
        cl_off = []
        for ci, (x, y, z, R, sd, anchor, fringe) in enumerate(self.clumps):
            fl = lean(x + HX0, f, self.cl_period[ci], 0.2) * (1.6 if fringe else 0.9)
            dx = int(round(ox[anchor] + fl))
            dy = int(oy[anchor])
            cl_off.append((dx, dy))
            g, inner = self._gnorm(x, y, z)
            P.clump((x + dx, y + dy), R, z * 3, g, self.mat_of[ci], sd, base_v=0.06 - 0.15 * inner,
                    depth=0.07 * np.clip(-z / 30.0, 0, 1), holes=0.22 if R > 8 else 0.0, off=(dx, dy), cid=ci)
        cv = P.render({1: grove.BARK, 10: LEAF, 11: LEAF_DEEP}, {10: 0.3, 11: 0.3})
        self._paint_extras(cv, P, f, cl_off, ox, oy)
        return cv.a[:H]

    def _paint_extras(self, cv, P, f, cl_off, ox, oy):
        a = cv.a
        for (anc, ys, xs, cols) in self.moss:              # moss, riding with its branch, behind any leaves
            Y, X = ys + oy[anc], xs + ox[anc]
            ok = (Y >= 0) & (Y < HH) & (X >= 0) & (X < HW)
            Y, X, c = Y[ok], X[ok], cols[ok]
            ok = P.mat[Y, X] <= 1
            a[Y[ok], X[ok]] = c[ok]
        for (kx, ky, rx, ry) in KNOTS:                     # knots: a dark hole, its far wall lit, a raised lip
            kx -= HX0
            j = int(np.argmin((self.nodes[:, 0] - kx) ** 2 + (self.nodes[:, 1] - ky) ** 2))
            kx, ky = kx + ox[j], ky + oy[j]
            for Y in range(int(ky - ry - 4), int(ky + ry + 5)):
                for X in range(int(kx - rx - 4), int(kx + rx + 5)):
                    if not (0 <= X < HW and 0 <= Y < HH) or P.mat[Y, X] != 1:
                        continue
                    u, v = (X + 0.5 - kx) / rx, (Y + 0.5 - ky) / ry
                    d = math.sqrt(u * u + v * v)
                    side = -0.6 * u - 0.8 * v                      # > 0 toward the light
                    if d <= 1.0:
                        c = 'wood2' if (side < -0.35 and d > 0.45) else ('wood0' if d > 0.8 and side < 0 else 'ink')
                    elif d <= 1.0 + 1.6 / min(rx, ry):
                        c = 'paper0' if side > 0.25 else ('wood2' if side > -0.3 else 'wood0')
                    elif abs(d - 1.9) < 0.75 / min(rx, ry) and side < 0.5:
                        c = 'wood0'                                # the bark folding round it
                    else:
                        continue
                    a[Y, X, :3] = PAL[c]
        for (ci, bx, by, fl, hang) in self.blooms:
            dx, dy = cl_off[ci]
            for (fx, fy) in fl:
                x, y = int(round(bx + fx + dx)), int(round(by + fy + dy))
                if not (0 <= x < HW and 0 <= y < HH) or P.cid[y, x] != ci:
                    continue
                v = P.v[y, x]
                if v < 0.3 and not hang:
                    continue
                cells = BLOOM_LIT if v > 0.55 else BLOOM_MID
                vis = [(x + cx, y + cy, c) for (cx, cy, c) in cells
                       if 0 <= x + cx < HW and 0 <= y + cy < HH and P.cid[y + cy, x + cx] == ci]
                if len(vis) < 3:                                   # a flower cut down to a speck: leave it out
                    continue
                for (X, Y, c) in vis:
                    a[Y, X, :3] = PAL[c]
        for (ci, sx, sy, thr, ph, horiz) in self.flips:
            dx, dy = cl_off[ci]
            x, y = int(round(sx + dx)), int(round(sy + dy))
            if not (0 <= x < HW - 1 and 0 <= y < HH - 1) or P.cid[y, x] != ci:
                continue
            g = gust(x + HX0, f)
            if g < thr or math.sin(2 * math.pi * f * 6 / N + ph) < -0.2:
                continue
            for (cx, cy, c) in (((0, 0, 'jade5'), (1, 0, 'jade4')) if horiz else ((0, 0, 'jade5'), (0, 1, 'jade4'))):
                if P.cid[y + cy, x + cx] == ci:
                    a[y + cy, x + cx, :3] = PAL[c]


_HERO = []


def hero():
    """The big tree, grown once per run (big_tree and falling share it)."""
    if not _HERO:
        _HERO.append(Hero())
    return _HERO[0]


def big_tree():
    T = hero()
    out = []
    for f in range(N):
        fr = np.zeros((H, W, 4), np.uint8)
        fr[:, HX0:] = T.frame(f)
        out.append(fr)
    return out


# ---------------------------------------------------------------- meadow.py over the menu loop
@contextmanager
def meadow_wind(x, tip, period=9):
    """Draw meadow.py plants over the menu loop at screen x: its frame count becomes
    N and its sway (_sw, the lean at the tip) follows the gust at x through a quick
    spring, `tip` px at the strongest, each blade adding a little flutter of its own."""
    def sw(f, ph, amp=1.0):
        g = gust(x, f)
        return amp * (tip * lean(x, f, period, 0.35) / 1.3 + 0.35 * tip * g * math.sin(2 * math.pi * f * 8 / N + ph) / 1.3)
    with patched(meadow, F=N, _sw=sw):
        yield


# ---------------------------------------------------------------- the far trees
# far crowns in the style of outside.hills(), a step further into the haze than the window view's
LINE_SETS = [(3, ('teal0', 'jade1', 'teal1', 'jade2', 'jade3')), (2, ('jade0', 'jade1', 'leaf2', 'jade2', 'jade3')),
             (1, ('teal0', 'teal1', 'jade2', 'teal2', 'jade3'))]
LINE_BACK = ('jade1', 'teal1', 'jade2', 'teal2', 'teal2')
# the grown trees in the middle distance: (kind, seed, k, screen x of the foot, y of the foot, haze steps)
MID_TREES = [('oak', 23, 0.5, 32, 216, 1), ('pine', 2, 0.64, 84, 231, 1), ('cypress', 22, 0.7, 120, 233, 1),
             ('cypress', 25, 0.58, 134, 224, 1), ('willow', 7, 0.46, 424, 262, 0)]


def _grove_frames(T, x_screen, amp=1.4, period=16):
    """A grove.py tree drawn over the menu loop: its own _sway (the bend growing up the
    tree) driven by the menu wind at the tree's x instead of grove's sine."""
    def sway(f, y, base_y, h, amp_=1.6, phase=0.0):
        k = min(1.0, max(0.0, (base_y - y) / h)) ** 1.6
        return round(amp_ * amp * k * lean(x_screen, f, period, 0.3))
    with patched(grove, _sway=sway):
        return [T._draw(f) for f in range(N)]


def _treeline(rng):
    """Crowns along the far meadow edge: groves and gaps, a back row lighter and
    lower in contrast, now and then a tall spire."""
    crowns = []
    for row, (dy, rs, step_, thr) in enumerate(((-2.0, (1.5, 2.6), (1.4, 2.4), 0.3), (0.0, (1.8, 3.4), (1.5, 2.8), 0.4))):
        x = rng.uniform(0, 2)
        while x < W + 4:
            dens = noise(x / 34.0, 0.5 + row * 3, 3.1)
            if dens > thr:
                r = rng.uniform(*rs) + 2.2 * (dens - thr)
                y = ML.HORIZON - r * rng.uniform(0.45, 0.85) + dy + rng.uniform(-0.6, 0.8)
                tall = row == 1 and rng.random() < 0.07
                crowns.append((x, y - (r * 0.9 if tall else 0), r * (0.7 if tall else 1), (1.9 if tall else 0.9), row))
            x += rng.uniform(*step_)
    crowns.sort(key=lambda c: (c[4], c[1]))
    sets = [s for _, s in LINE_SETS]
    pick = random.Random(7)
    return [(x, y, r, sq, row, pick.choices(range(len(sets)), weights=[w_ for w_, _ in LINE_SETS])[0],
             pick.uniform(-0.25, 0.25)) for (x, y, r, sq, row) in crowns], sets


def _treeline_frame(crowns, sets, f):
    a = np.zeros((H, W, 4), np.uint8)
    for (x, y, r, sq, row, si, jit) in crowns:
        cols = LINE_BACK if row == 0 else sets[si]
        s = 1 if (r > 2.2 and lean(x, f, 12, 0.3) + jit > 0.42) else 0     # the gust bends the tops over
        ry = r * sq
        for Y in range(int(y - ry - 1), int(y + ry + 2)):
            if not 0 <= Y < H:
                continue
            sh = s if Y < y - ry * 0.2 else 0
            for X in range(int(x - r - 1), int(x + r + 2)):
                dx, dy = (X - sh + 0.5 - x) / r, (Y + 0.5 - y) / ry
                d = dx * dx + dy * dy
                if d > 1 or not 0 <= X < W:
                    continue
                lit = -dx * 0.55 - dy * 0.8
                k = 3 if lit > 0.35 else (2 if lit > -0.1 else 1)
                if lit > 0.75 and d < 0.5:
                    k = 4
                if Y > ML.HORIZON - 1:
                    k = max(0, k - 1)
                a[Y, X, :3] = PAL[cols[k]]
                a[Y, X, 3] = 255
    return a


def far_trees():
    import outside
    rng = random.Random(61)
    crowns, sets = _treeline(rng)
    makers = dict(oak=lambda s, k: grove.oak(s, k=k, ramp=grove.LEAF_RICH), pine=lambda s, k: grove.black_pine(s, k=k),
                  cypress=lambda s, k: grove.cypress(s, k=k), willow=lambda s, k: grove.willow(s, k=k),
                  zelkova=lambda s, k: grove.zelkova(s, k=k))
    mids = []
    for (kind, seed, k, x, y, hz) in MID_TREES:
        T = makers[kind](seed, k)
        frs = _grove_frames(T, x, amp=1.2 if kind != 'willow' else 1.5)
        for fr in frs:
            if hz:
                outside._haze(fr, hz)
        mids.append((y, frs, x - T.base[0], y - T.base[1]))
    # grass at their feet (meadow.tuft), as in the window view, so they stand in the meadow
    grass = []
    grng = random.Random(62)
    for (kind, seed, k, x, y, hz) in MID_TREES:
        for _ in range(7):
            gx = x + grng.uniform(-12, 12) * k * 1.6
            with meadow_wind(gx, 3):
                t = meadow.tuft(grng, grng.randint(3, 6), grng.randint(4, 7), dark=1)
            grass.append((y + grng.randint(1, 3), gx, t))
    grass.sort(key=lambda g: g[0])
    mids.sort(key=lambda m: m[0])
    out = []
    for f in range(N):
        cv = Canvas(W, H)
        cv.a = _treeline_frame(crowns, sets, f)
        for (_, frs, x, y) in mids:
            cv.blit(frs[f], x, y)
        for (gy, gx, t) in grass:
            cv.blit(t[f], int(gx - t[f].w / 2), gy - t[f].h + 1)
        out.append(cv.a)
    return out


# ---------------------------------------------------------------- foreground plants
GREEN = meadow.GREEN                      # leaf0..leaf5, the meadow's blades
# Japanese irises, hand-pixelled: upright standards, three falls drooping, a gold signal on each fall.
# S/s standard light/shade, F/f fall light/shade, d dark, y gold
IRIS_ART = ['''
...S...
..SSs..
.F.S.F.
FFFyFff
Ff.y.fd
.d...d.
''', '''
..S..
.FSF.
FfyfD
.d.d.
''', '''
.S.
FyF
d.d
''']
IRIS = [('purp3', 'purp2', 'purp1', 'purp0'), ('lilac3', 'lilac2', 'lilac1', 'lilac0'),
        ('white', 'cloud2', 'stone2', 'stone1'), ('purp2', 'purp1', 'purp0', 'gloss1')]


def iris_head(size, pal):
    lit, mid, dk, ol = pal
    art = IRIS_ART[size]
    spr = Canvas.from_ascii(art, {'S': lit, 's': mid, 'F': lit, 'f': mid, 'd': dk, 'D': dk, 'y': 'gold3'})
    spr = spr.padded(1)
    spr.outline(ol, selective=False)
    return spr


def _blade(cv, x0, y0, hb, lean_, bend, sway_, cols, wide=0.6, width2=False):
    """One blade or stalk the meadow way (meadow.tuft): 2 px at the root, 1 px at the
    tip, lit on its left edge; returns the tip."""
    n = max(1, int(hb))
    tip = (x0, y0)
    for j in range(n + 1):
        t = j / n
        x = x0 + lean_ * n * t * 0.55 + bend * t * t + sway_ * t * t
        y = y0 - j
        k = 0 if t < 0.25 else (1 if t < 0.55 else (2 if t < 0.85 else 3))
        xi = int(round(x))
        if t < wide or width2:
            cv.px(xi, y, cols[min(4, k + 1)])
            cv.px(xi + 1, y, cols[k])
        else:
            cv.px(xi, y, cols[min(4, k + 1)] if t > 0.9 else cols[k])
        tip = (xi, y)
    return tip


def reeds(rng, h, n, x_screen, iris=False):
    """A clump of reeds at the water's edge (meadow.tuft's blades, taller and straighter),
    some with a brown cattail; or, with iris=True, sword leaves and one to three iris
    flowers (meadow.radial_head: three falls and a standard). N frames."""
    width = max(5, int(n * (1.5 if iris else 1.1)))
    w, H_ = width + 26, h + 12
    specs = []
    for b in range(n):
        off = (b / max(1, n - 1) - 0.5) * width
        specs.append(dict(x=w / 2 + off * 0.55 + rng.uniform(-1, 1), hb=rng.uniform(0.55, 1.0) * h,
                          lean=off / width * (0.7 if iris else 0.45) + rng.uniform(-0.12, 0.12),
                          bend=rng.uniform(-1.5, 1.5), ph=rng.uniform(0, 6.28), front=rng.random() < 0.5,
                          flex=rng.uniform(0.8, 1.2)))
    specs.sort(key=lambda s_: (s_['front'], -s_['hb']))
    cats = [] if iris else [i for i in range(n) if rng.random() < 0.3 and specs[i]['hb'] > h * 0.7]
    heads = []
    if iris:
        size = 0 if h > 30 else (1 if h > 14 else 2)
        for k in range(rng.choice((1, 1, 2, 2, 3))):
            pal = IRIS[rng.choices(range(4), weights=(5, 3, 2, 2))[0]]
            heads.append(dict(x=w / 2 + rng.uniform(-width * 0.3, width * 0.3), hb=h * rng.uniform(0.95, 1.2),
                              lean=rng.uniform(-0.15, 0.15), ph=rng.uniform(0, 6.28), spr=iris_head(size, pal),
                              pal=pal))
    tipmax = h * 0.16
    out = []
    for f in range(N):
        cv = Canvas(w, H_)
        sw = tipmax * lean(x_screen, f, 9, 0.35)
        g = gust(x_screen, f)
        for i, s_ in enumerate(specs):
            d = 0 if s_['front'] else 1
            cols = [GREEN[max(1, i_ - d)] for i_ in (1, 2, 3, 4, 5)]
            flut = 0.3 * tipmax * g * math.sin(2 * math.pi * f * 8 / N + s_['ph'])
            tip = _blade(cv, s_['x'], H_ - 1, s_['hb'], s_['lean'], s_['bend'], (sw + flut) * s_['flex'], cols,
                         wide=0.75 if iris else 0.45)
            if i in cats:                                     # a cattail: brown club and a thin spike
                tx, ty = tip
                ln = max(3, int(h * 0.12))
                for k in range(ln):
                    cv.px(tx, ty + 2 + k, 'wood2' if k < ln - 1 else 'wood1')
                    cv.px(tx + 1, ty + 2 + k, 'wood1' if k else 'wood2')
                cv.px(tx, ty + 2, 'wood3')
        for hd in heads:
            stem_sw = sw * 1.05 + 0.3 * tipmax * g * math.sin(2 * math.pi * f * 8 / N + hd['ph'])
            tx, ty = _blade(cv, hd['x'], H_ - 1, hd['hb'], hd['lean'], 0.0, stem_sw, ['leaf2'] * 2 + ['leaf3'] * 3,
                            wide=0.0)
            cv.blit(hd['spr'], tx - hd['spr'].w // 2, ty - hd['spr'].h + 3)
        cv.outline('leaf0', selective=False)
        for x in range(w):                                    # no outline under the roots
            if cv.get(x, H_ - 1)[:3] == PAL['leaf0']:
                cv.px(x, H_ - 1, None)
        out.append(cv)
    return out


def fern(rng, size, x_screen, dark=0):
    """A fern: fronds fanning from one crown and arching over. Each frond is drawn as a
    feather the way a pixel artist would: a tapering blade, lit on its upper half, a
    darker midrib, notched into pinnae that sweep toward the tip. The fronds behind are a
    step darker; the tips nod in the gust. N frames."""
    nf = rng.randint(5, 7)
    fronds = []
    for k in range(nf):
        u = k / (nf - 1) - 0.5
        a = -math.pi / 2 + u * 1.9 + rng.uniform(-0.1, 0.1)
        fronds.append(dict(a=a, L=size * rng.uniform(0.82, 1.0) * (1 - 0.2 * abs(u)), droop=0.25 + 0.9 * abs(u),
                           ph=rng.uniform(0, 6.3), back=abs(u) < 0.3 and rng.random() < 0.7, wd=rng.uniform(0.85, 1.1)))
    fronds.sort(key=lambda fr_: (not fr_['back'], -abs(fr_['a'] + math.pi / 2)))
    w, h = int(size * 2.4) + 14, int(size * 1.05) + 8
    bx, by = w / 2, h - 2
    out = []
    for f in range(N):
        cv = Canvas(w, h)
        sw = size * 0.14 * lean(x_screen, f, 10, 0.3)
        g = gust(x_screen, f)
        for fr_ in fronds:
            d = dark + (1 if fr_['back'] else 0)
            hi, lit, mid, rib = GREEN[max(1, 5 - d)], GREEN[max(1, 4 - d)], GREEN[max(1, 3 - d)], GREEN[max(1, 2 - d)]
            ca, sa = math.cos(fr_['a']), math.sin(fr_['a'])
            L = fr_['L']
            flut = 0.3 * size * 0.14 * g * math.sin(2 * math.pi * f * 6 / N + fr_['ph'])
            n = int(L * 2)
            tt = np.linspace(0, 1, n + 1)
            P = np.stack([bx + ca * L * tt + (sw + flut) * tt ** 2, by + sa * L * tt + fr_['droop'] * L * 0.7 * tt ** 2], 1)
            seg = np.hypot(*np.diff(P, axis=0).T)
            arcs = np.concatenate([[0], np.cumsum(seg)])
            Tn = np.gradient(P, axis=0)
            Tn /= np.maximum(np.linalg.norm(Tn, axis=1, keepdims=True), 1e-6)
            Nn = np.stack([-Tn[:, 1], Tn[:, 0]], 1)
            Nn[Nn[:, 1] > 0] *= -1                                 # o < 0 is always the upper side
            wmax = size * 0.13 * fr_['wd']
            hw = wmax * np.minimum(1.0, tt / 0.15) ** 0.6 * (1 - tt) ** 0.8
            x0, x1 = int(P[:, 0].min() - wmax - 2), int(P[:, 0].max() + wmax + 3)
            y0, y1 = int(P[:, 1].min() - wmax - 2), int(P[:, 1].max() + wmax + 3)
            YY, XX = np.mgrid[y0:y1, x0:x1]
            Q = np.stack([XX.ravel() + 0.5, YY.ravel() + 0.5], 1)
            D = ((Q[:, None, :] - P[None, :, :]) ** 2).sum(-1)
            j = D.argmin(1)
            o = ((Q - P[j]) * (-Nn[j])).sum(1) * -1                # signed offset across the frond
            along = ((Q - P[j]) * Tn[j]).sum(1)
            inside = (np.abs(o) <= hw[j]) & (np.abs(along) <= 0.75) & (j > 0)
            q = (arcs[j] + along + np.abs(o) * 0.9) / 2.8
            gap = (q - np.floor(q) < 0.36) & (np.abs(o) > 0.9)
            for k in np.nonzero(inside & ~gap)[0]:
                oo, t = o[k], tt[j[k]]
                if abs(oo) < 0.7:
                    c = rib
                elif oo < 0:
                    c = hi if (abs(oo) > hw[j[k]] - 1.1 and t < 0.75) else lit
                else:
                    c = mid
                cv.px(Q[k, 0], Q[k, 1], c)
        cv.outline('leaf0', selective=False)
        out.append(cv)
    return out


def lush_tuft(rng, h, n, x_screen, width):
    """A big clump of grass close to the camera: meadow.tuft twice, a darker one behind
    and a lit one in front, leaning together in the gust. N frames."""
    with meadow_wind(x_screen - 2, h * 0.12):
        back = meadow.tuft(rng, int(h * 0.85), int(n * 0.8), dark=1, width=int(width * 1.2))
    with meadow_wind(x_screen, h * 0.15):
        front = meadow.tuft(rng, h, n, dark=0, width=width)
    out = []
    for f in range(N):
        w_, h_ = max(back[f].w, front[f].w), max(back[f].h, front[f].h)
        cv = Canvas(w_, h_)
        cv.blit(back[f], (w_ - back[f].w) // 2 - 2, h_ - back[f].h)
        cv.blit(front[f], (w_ - front[f].w) // 2 + 1, h_ - front[f].h)
        out.append(cv)
    return out


def hydrangea(seed, rx, ry, x_screen):
    """outside._hydrangea_bush, animated: the leafy bush (trees.bush) stands, its blue and
    purple mopheads (meadow.head) nod and its top leaves lean as the gust goes by."""
    import trees
    rng = random.Random(seed)
    b = trees.bush(seed, rx, ry)
    w, h = b.w + 12, b.h + 10
    heads = []
    for _ in range(int(rx * ry / 20)):
        hd = meadow.hydrangea_head(rng, rng.choice((['sky0', 'sky1', 'sky2', 'sky3', 'sky4'],
                                                   ['purp0', 'purp1', 'purp2', 'purp3', 'pink4'],
                                                   ['sky0', 'sky1', 'sky2', 'sky3', 'sky4'])), rng.uniform(4.5, 6.5))
        x = rng.randint(4, w - hd.w - 4)
        y = rng.randint(3, int(h * 0.55))
        if b.opaque(x + hd.w // 2 - 6, y + hd.h // 2 + 3 - 7):
            heads.append((hd, x, y, rng.uniform(0.6, 1.2)))
    heads.sort(key=lambda q: q[2])
    out = []
    for f in range(N):
        cv = Canvas(w, h)
        s = lean(x_screen, f, 12, 0.3)
        top = int(round(1.4 * s))
        body = b.copy()
        if top:                                              # the top of the bush leans over a pixel
            cut = int(b.h * 0.4)
            up = b.a[:cut].copy()
            body.a[:cut] = 0
            body.a[:cut, max(0, top):b.w + min(0, top)] = up[:, max(0, -top):b.w - max(0, top)]
        cv.blit(body, 6, 7)
        for (hd, x, y, k) in heads:
            cv.blit(hd, x + int(round(2.2 * s * k)), y)
        out.append(cv)
    return out


def _bank_spots(rng):
    """Where the reeds and irises stand: along both banks, nearer = bigger."""
    spots = []
    y = ML.HORIZON + 40.0
    while y < H + 6:
        t = (y - ML.HORIZON) / (H - ML.HORIZON)
        for side in (-1, 1):
            # the left bank runs nearly straight down the screen: fewer clumps there, some set back from
            # the water, so they don't stack into a wall
            if rng.random() < (0.35 + 0.4 * t if side > 0 else 0.22 + 0.3 * t):
                yy = int(y + rng.uniform(-2, 2))
                xc, hw = ML.river_centre(min(H - 1, yy)), ML.river_half(min(H - 1, yy))
                back = rng.uniform(4, 16) * (0.4 + t) if (side < 0 and rng.random() < 0.4) else 0.0
                x = xc + side * (hw + rng.uniform(-3, 5) * (0.5 + t) + back)
                if side > 0 and x > 546 and yy > 320:                # the fern bed at the tree's foot
                    continue
                spots.append((yy, x, t * rng.uniform(0.8, 1.1), side))
        y += 4 + 8 * (1 - t)
    return spots


def foliage():
    rng = random.Random(71)
    items = []                                               # (y of the foot, x, frames)
    for (y, x, t, side) in _bank_spots(rng):
        h = int(4 + 48 * t ** 1.4)
        r = rng.random()
        if r < 0.3 and t > 0.25:
            fr = reeds(rng, int(h * 0.85), rng.randint(5, 8), x, iris=True)
        elif r < 0.85:
            fr = reeds(rng, h, rng.randint(5, 10) + int(6 * t), x)
        else:
            with meadow_wind(x, h * 0.15):
                fr = meadow.tuft(rng, max(3, int(h * 0.55)), rng.randint(5, 9), dark=0 if t > 0.5 else 1)
        items.append((y, x, fr))
    # the foot of the big tree: ferns either side, a hydrangea against the trunk on the right
    for (x, y, size, dark) in ((556, 346, 32, 1), (578, 360, 44, 0), (542, 362, 36, 0), (616, 362, 30, 1)):
        items.append((y, x, fern(rng, size, x, dark)))
    items.append((362, 634, hydrangea(5, 26, 17, 630)))
    # tall grass in the bottom-left corner, keeping the menu clear
    for (x, y, h, nb, wd) in ((2, 366, 84, 26, 26), (-10, 366, 60, 20, 20), (24, 366, 34, 14, 16), (190, 366, 46, 18, 20),
                              (206, 368, 28, 12, 14), (64, 366, 13, 9, 12), (112, 367, 11, 8, 10), (152, 366, 14, 9, 12)):
        items.append((y, x, lush_tuft(rng, h, nb, x, wd)))
    items.sort(key=lambda it: it[0])
    out = []
    for f in range(N):
        cv = Canvas(W, H)
        for (y, x, fr) in items:
            s = fr[f]
            cv.blit(s, int(round(x - s.w / 2)), int(y - s.h + 1))
        out.append(cv.a)
    return out


# ---------------------------------------------------------------- falling petals and leaves
PETALS = life.FALL['spring']                     # (light face, dark face) pairs, as in life.garden_fall
LEAVES = life.FALL['summer'] + (('leaf4', 'leaf2'),)


def _petal_cells(pose, c1, c2, leaf):
    """The tumbling sprite: face on, edge on, the other face, end on (life.garden_fall's
    two cells, a third for a leaf)."""
    if pose == 0:
        cells = [(0, 0, c1), (1, 0, c1 if leaf else c2)]
    elif pose == 1:
        cells = [(0, 0, c2)]
    elif pose == 2:
        cells = [(0, 0, c2), (1, 0, c1)]
    else:
        cells = [(0, 0, c1), (0, 1, c2)]
    if leaf and pose != 1:
        cells.append((1, 1, c2) if pose != 3 else (1, 1, c1))
    return cells


def _fly(rng, x, y, s, leaf):
    """One petal or leaf from where it lets go (x, y on frame s) until it leaves the
    screen: it is dragged toward the air's speed (the breeze plus menu_layout.wind at
    its x), lifted a little in the gust, falls at its own slow terminal speed, swings
    from side to side and tumbles. Returns [(frame, x, y, pose, alpha)]."""
    fall = rng.uniform(1.7, 2.4) if leaf else rng.uniform(1.15, 1.8)
    k = rng.uniform(0.07, 0.1) if leaf else rng.uniform(0.1, 0.15)
    vx, vy = 0.3, 0.2
    eddy = [(rng.uniform(0, 6.3), rng.choice((1, 2, 3)), rng.uniform(0.25, 0.6)) for _ in range(2)]
    th = rng.uniform(0, 6.3)
    spin = rng.choice((-1, 1)) * rng.uniform(0.25, 0.55)
    swing, sph, sfreq = rng.uniform(0.7, 1.5), rng.uniform(0, 6.3), rng.uniform(0.16, 0.28)
    track = []
    life_ = N - 1
    for age in range(life_):
        f = (s + age) % N
        w = gust(x, f)
        ax = 3.0 * max(0.0, w - 0.14) + sum(a * math.sin(2 * math.pi * f * kk / N + p) for (p, kk, a) in eddy)
        ay = fall - 1.3 * max(0.0, w - 0.4)
        vx += (ax - vx) * k
        vy += (ay - vy) * k
        sph += sfreq
        x += vx + swing * math.cos(sph) * 0.6
        y += vy * (0.75 + 0.45 * abs(math.sin(sph)))       # quicker at the bottom of each swing
        th += spin * (0.7 + w)
        if x > W + 3 or y > H + 3 or x < -4:
            break
        left = life_ - age
        track.append((f, x, y, int((th % (2 * math.pi)) / (math.pi / 2)) % 4, 255 if left > 8 else int(255 * left / 9)))
    return track


def falling():
    """Petals and a few leaves shed from the big tree, most of them when the gust
    reaches their part of the crown; each loops once round the N frames."""
    T = hero()
    rng = random.Random(81)
    petal_src = [(T.clumps[ci], bx, by) for (ci, bx, by, fl, hang) in T.blooms]
    leaf_src = [(c_, c_[0] + math.cos(a) * c_[3] * 0.9, c_[1] + math.sin(a) * c_[3] * 0.8)
                for c_ in T.clumps for a in (rng.uniform(-3.1, 0.3),) if c_[6] or rng.random() < 0.4]
    tracks = []
    for (src, n, leaf) in ((petal_src, 96, False), (leaf_src, 26, True)):
        xs = np.array([p[1] + HX0 for p in src])
        wts = np.array([[gust(x, f) ** 3 for f in range(N)] for x in xs])
        flat = (wts / wts.sum()).ravel()
        for i in range(n):
            if rng.random() < 0.75:
                j = int(np.searchsorted(np.cumsum(flat), rng.random()))
                si, s = divmod(min(j, len(flat) - 1), N)
            else:
                si, s = rng.randrange(len(src)), rng.randrange(N)
            c_, bx, by = src[si]
            ox, oy = T.offsets(s)
            anc = c_[5]
            x, y = bx + HX0 + ox[anc] + rng.uniform(-1.5, 1.5), by + oy[anc] + rng.uniform(-1, 1)
            if y >= H:
                continue
            pal = (LEAVES if leaf else PETALS)[rng.randrange(len(LEAVES if leaf else PETALS))]
            tracks.append((_fly(rng, x, y, s, leaf), pal, leaf))
    out = [np.zeros((H, W, 4), np.uint8) for _ in range(N)]
    for (track, (c1, c2), leaf) in tracks:
        for (f, x, y, pose, al) in track:
            for (dx, dy, c) in _petal_cells(pose, c1, c2, leaf):
                X, Y = int(x) + dx, int(y) + dy
                if 0 <= X < W and 0 <= Y < H:
                    out[f][Y, X] = (*PAL[c], al)
    return out


# ---------------------------------------------------------------- export
LAYERS = (('far_trees', far_trees), ('big_tree', big_tree), ('foliage', foliage), ('falling', falling))
NOTES = dict(
    far_trees='the tree line on the far meadow edge and the trees in the middle distance (black pine, two '
              'hinoki cypresses, an oak, a willow at the river bend): draw over the meadow, under the teahouse',
    big_tree='the old flowering tree in the right foreground: draw over the river and the meadow',
    foliage='reeds and irises on the banks, ferns and a hydrangea at the big tree\'s foot, tall grass in the '
            'bottom-left corner: draw over the big tree',
    falling='petals and leaves shed from the big tree on the gust: draw over everything but the menu')


def _backdrop(w, h, x0, y0):
    """A plain sky over plain grass, only for the previews."""
    a = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        sy = y + y0
        if sy < ML.HORIZON:
            c = PAL[('sky2', 'sky3', 'sky4')[min(2, sy * 3 // ML.HORIZON)]]
        else:
            c = PAL['leaf2']
        a[y, :, :3] = c
    a[..., 3] = 255
    return a


def _over(dst, src):
    al = src[..., 3:4].astype(np.float32) / 255.0
    out = dst.copy()
    out[..., :3] = (dst[..., :3] * (1 - al) + src[..., :3] * al).astype(np.uint8)
    return out


def export(name, frames, out_dir=OUT):
    """main_menu/layers/<name>/: <name>_sheet.png (a grid, row by row), <name>.png (frame 0),
    <name>.json and <name>_preview_3x.png. Frames are cropped to what they ever cover."""
    d = os.path.join(out_dir, name)
    os.makedirs(d, exist_ok=True)
    cover = np.zeros((H, W), bool)
    for fr in frames:
        cover |= fr[..., 3] > 0
    ys, xs = np.nonzero(cover)
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
    fw, fh = x1 - x0, y1 - y0
    cols = max(1, int(math.ceil(len(frames) * fh / 15000.0)))
    rows = int(math.ceil(len(frames) / cols))
    sheet = np.zeros((rows * fh, cols * fw, 4), np.uint8)
    for i, fr in enumerate(frames):
        r, c = divmod(i, cols)
        sheet[r * fh:(r + 1) * fh, c * fw:(c + 1) * fw] = fr[y0:y1, x0:x1]
    Image.fromarray(sheet, 'RGBA').save(os.path.join(d, name + '_sheet.png'), optimize=True)
    Image.fromarray(frames[0][y0:y1, x0:x1], 'RGBA').save(os.path.join(d, name + '.png'), optimize=True)
    prev = _over(_backdrop(W, H, 0, 0), frames[0])
    Image.fromarray(prev, 'RGBA').resize((W * 3, H * 3), Image.NEAREST).save(os.path.join(d, name + '_preview_3x.png'))
    rec = dict(name=name, frames=len(frames), fps=FPS, x=x0, y=y0, w=fw, h=fh, screen=[W, H],
               sheet=name + '_sheet.png', sheet_columns=cols, sheet_rows=rows,
               sheet_order='row by row, left to right: frame i is at column i % sheet_columns, row i // sheet_columns',
               frame0=name + '.png', preview=name + '_preview_3x.png', loops=True,
               wind='leans with menu_layout.wind at its own x (one gust left to right per loop)',
               note=NOTES.get(name, ''))
    with open(os.path.join(d, name + '.json'), 'w') as fh_:
        json.dump(rec, fh_, indent=1)
    return rec


def main(names=None):
    recs = []
    for name, fn in LAYERS:
        if names and name not in names:
            continue
        frames = fn()
        recs.append(export(name, frames))
        print(name, {k: recs[-1][k] for k in ('x', 'y', 'w', 'h', 'sheet_columns', 'sheet_rows')})
    return recs


if __name__ == '__main__':
    main(sys.argv[1:] or None)
