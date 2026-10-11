"""Detailed garden trees for the view through the windows.

Every tree is grown, not stamped. The branches come from space colonisation
in 3D: a cloud of attraction points fills the crown, and the trunk grows up
into it, forking toward the points until they are used up. Branch thickness
follows the pipe model (a branch is as thick as all its twigs together), so
the trunk flares and the limbs taper naturally.

Then the tree is painted with a depth buffer:

  - bark: each segment is lit across its width from the upper left, with
    fissures stretched along the grain and darker toward the back
  - leaves: hundreds of small irregular clusters on the twigs. Each is lit as
    a little ball, blended with the light on the crown as a whole (bright top
    left, dark underside and interior), darker the further back it sits,
    with leafy scalloped edges, single leaves glinting and gaps between
  - gaps in the crown show the inner limbs and the sky
  - the same tree is drawn in F frames, the crown swaying more toward the top

Species (green only): a broad zelkova, a round oak, a weeping willow with
hanging strands, a Japanese black pine with flat needle pads, a white birch
and a conical hinoki cypress. Small bushes use the same leaf clusters.

The garden extras live here too: butterflies with flapping wings flying
looping paths, dragonflies hovering by the lake; all loop seamlessly over F frames."""
import math
import random
import numpy as np
from pixel import Canvas, PAL

F = 8
LIGHT = np.array([-0.5, -0.72, 0.48])
LIGHT = LIGHT / np.linalg.norm(LIGHT)
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0 - 0.47

LEAF_RICH = ('jade0', 'leaf0', 'leaf1', 'leaf2', 'leaf3', 'leaf4', 'leaf5')
LEAF_COOL = ('jade0', 'jade1', 'jade2', 'jade3', 'jade4', 'leaf4', 'jade5')
LEAF_SPRING = ('leaf0', 'leaf1', 'leaf2', 'leaf3', 'leaf4', 'leaf5', 'alien4')
LEAF_PINE = ('ink', 'jade0', 'jade1', 'leaf1', 'jade2', 'leaf2', 'jade3', 'leaf3')
LEAF_CYPRESS = ('jade0', 'leaf0', 'jade1', 'jade2', 'jade3', 'leaf3')
BARK = ('ink', 'wood0', 'wood1', 'wood2', 'paper0', 'stone2', 'stone3')
BARK_BIRCH = ('stone0', 'stone1', 'stone2', 'stone3', 'stone4', 'cloud2', 'cloud3')


def _hash(x, y, s):
    h = np.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453
    return h - np.floor(h)


def noise(x, y, s=0.0):
    ix, iy = np.floor(x), np.floor(y)
    fx, fy = x - ix, y - iy
    ux, uy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = _hash(ix, iy, s), _hash(ix + 1, iy, s)
    c, d = _hash(ix, iy + 1, s), _hash(ix + 1, iy + 1, s)
    return a + (b - a) * ux + (c - a + (a - b - c + d) * ux) * uy


def _ramp_rgb(ramp):
    return np.array([PAL[c] for c in ramp], np.uint8)


# ---------------------------------------------------------------- growth
def colonise(rng, base, trunk_top, points, step=2.6, influence=24.0, kill=5.0, lean=0.0, up=0.12, iters=300,
             limbs=()):
    """Space colonisation. base, trunk_top: (x, y) of the trunk; points: (N, 3)
    attraction points. Returns node positions (M, 3) and parent indices."""
    nodes = [np.array([base[0], base[1], 0.0])]
    parent = [-1]
    # the trunk first, with a little bend, straight up to the crown
    n = max(2, int(math.hypot(trunk_top[0] - base[0], trunk_top[1] - base[1]) / step))
    for i in range(1, n + 1):
        t = i / n
        bend = math.sin(t * math.pi) * lean
        x = base[0] + (trunk_top[0] - base[0]) * t + bend
        y = base[1] + (trunk_top[1] - base[1]) * t
        nodes.append(np.array([x, y, rng.uniform(-0.3, 0.3)]))
        parent.append(len(nodes) - 2)
    top = len(nodes) - 1
    for (deg, ln) in limbs:                                   # the big limbs fork from the top of the trunk
        a = math.radians(deg + rng.uniform(-6, 6)) - math.pi / 2
        prev = top
        x, y = nodes[top][0], nodes[top][1]
        z = rng.uniform(-6, 6)
        for k in range(max(1, int(ln / step))):
            a += rng.gauss(0, 0.06) + (-math.pi / 2 - a) * 0.03
            x, y = x + math.cos(a) * step, y + math.sin(a) * step
            nodes.append(np.array([x, y, z * (k + 1) / max(1, ln / step)]))
            parent.append(prev)
            prev = len(nodes) - 1
    P = np.array(points, float)
    alive = np.ones(len(P), bool)
    for _ in range(iters):
        if not alive.any():
            break
        N = np.array(nodes)
        Pa = P[alive]
        d = np.linalg.norm(Pa[:, None, :] - N[None, :, :], axis=2)
        near = d.argmin(axis=1)
        dmin = d[np.arange(len(Pa)), near]
        ok = dmin < influence
        if not ok.any():                                      # nothing in reach yet: the trunk keeps climbing
            q = nodes[top] + np.array([0, -step, 0])
            nodes.append(q)
            parent.append(top)
            top = len(nodes) - 1
            continue
        grow = {}
        for pi in np.nonzero(ok)[0]:
            ni = near[pi]
            v = Pa[pi] - N[ni]
            v = v / (np.linalg.norm(v) + 1e-6)
            grow[ni] = grow.get(ni, 0) + v
        added = 0
        for ni, v in grow.items():
            v = v / (np.linalg.norm(v) + 1e-6) + np.array([0, -up, 0])
            v = v / (np.linalg.norm(v) + 1e-6)
            q = N[ni] + v * step
            if np.min(np.linalg.norm(N - q, axis=1)) < step * 0.45:
                continue
            nodes.append(q)
            parent.append(ni)
            added += 1
        if not added:
            break
        N = np.array(nodes)
        dk = np.linalg.norm(P[:, None, :] - N[None, -added:, :], axis=2).min(axis=1)
        alive &= dk > kill
    return np.array(nodes), np.array(parent)


def radii(parent, r_tip=0.45, e=2.3, r_max=None):
    """Pipe model: each branch carries all the twigs above it."""
    n = len(parent)
    acc = np.zeros(n)
    r = np.zeros(n)
    for i in range(n - 1, -1, -1):
        r[i] = r_tip if acc[i] == 0 else acc[i] ** (1 / e)
        if parent[i] >= 0:
            acc[parent[i]] += r[i] ** e
    if r_max:
        r = np.minimum(r, r_max)
    return r


def ellipsoid_points(rng, n, c, rad, lump=0.25, cut=None, seed=0.0):
    """n points inside a lumpy ellipsoid; cut(x, y, z) may veto a point."""
    pts = []
    tries = 0
    while len(pts) < n and tries < n * 60:
        tries += 1
        x, y, z = (rng.uniform(-1, 1) for _ in range(3))
        r = math.sqrt(x * x + y * y + z * z)
        ang = math.atan2(y, x)
        edge = 1 - lump * (0.5 + 0.5 * math.sin(ang * 5 + seed) * math.cos(ang * 3 - seed * 0.7))
        if r > edge:
            continue
        p = (c[0] + x * rad[0], c[1] + y * rad[1], z * rad[2])
        if cut and not cut(*p):
            continue
        pts.append(p)
    return pts


# ---------------------------------------------------------------- painting
class Painter:
    """Depth-buffered painter: value (0..1) and material per pixel."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.z = np.full((h, w), -1e9)
        self.v = np.zeros((h, w))
        self.mat = np.zeros((h, w), int)          # 0 empty, 1 bark, 2.. leaf ramps by index
        self.yy, self.xx = np.mgrid[0:h, 0:w].astype(float)

    def segment(self, a, b, ra, rb, za, zb, tex_seed, mat=1, birch=False):
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
        u = (X * dx + Y * dy) / L                                   # along the grain
        vv = X * nx + Y * ny                                        # across it
        if birch:
            tex = noise(vv * 0.9, u * 0.35, tex_seed)
            val = 0.35 + 0.65 * lit
            val = np.where((tex < 0.2) & (r > 1.2), 0.05, val)        # black lenticel marks
        else:
            tex = noise(vv * 0.85, u * 0.13, tex_seed)
            val = 0.2 + 0.72 * lit + 0.28 * (tex - 0.5)
            val = np.where((tex < 0.24) & (r > 1.6), val * 0.45, val)  # fissures
        val = val - 0.12 * np.clip(-z / 30.0, 0, 1)
        win = inside & (z > self.z[y0:y1, x0:x1])
        self.z[y0:y1, x0:x1][win] = z[win]
        self.v[y0:y1, x0:x1][win] = val[win]
        self.mat[y0:y1, x0:x1][win] = mat

    def blob(self, c, R, z, gnorm, mat, seed, flat=1.0, base_v=0.0, depth=0.0, needles=False, squash_top=False):
        """One leaf cluster. gnorm: normal of the crown at this cluster (3,)."""
        x0, x1 = int(max(0, c[0] - R * 1.4 - 2)), int(min(self.w, c[0] + R * 1.4 + 3))
        y0, y1 = int(max(0, c[1] - R * flat - 2)), int(min(self.h, c[1] + R * flat + 3))
        if x1 <= x0 or y1 <= y0:
            return
        X, Y = self.xx[y0:y1, x0:x1] + 0.5, self.yy[y0:y1, x0:x1] + 0.5
        lx, ly = (X - c[0]) / R, (Y - c[1]) / (R * flat)
        rr = np.sqrt(lx * lx + ly * ly)
        scal = noise(X * 0.8 + seed, Y * 0.8, seed) * 0.4 + noise(X * 1.9, Y * 1.9 + seed, seed + 3) * 0.32 \
            + (_hash(np.floor(X), np.floor(Y), seed) - 0.5) * 0.3
        inside = rr + scal - 0.36 < 1.0
        if squash_top:
            inside &= ly > -0.75
        if not inside.any():
            return
        nz = np.sqrt(np.clip(1 - np.minimum(rr, 1) ** 2, 0, 1))
        n = np.stack([lx * 0.8, ly * 0.8, nz], axis=-1)
        n = n * 0.4 + gnorm[None, None, :] * 0.85
        n = n / np.linalg.norm(n, axis=-1, keepdims=True)
        lit = np.clip(n @ LIGHT, 0, 1)
        val = 0.1 + 0.85 * lit + base_v
        val = val - 0.22 * np.clip(rr - 0.55, 0, 1) * (lx + ly > 0)      # the shaded side of the clump
        leaf = noise(X * 1.3, Y * 1.3, seed + 7)
        val = val + 0.16 * (leaf - 0.5)                                # leaf by leaf
        if needles:
            stroke = ((X + Y * 0.6 + seed * 3).astype(int) % 3 == 0) & (noise(X * 0.5, Y * 2.1, seed) > 0.45)
            val = np.where(stroke, val - 0.18, val)
        zz = z + nz * R * 0.6
        win = inside & (zz > self.z[y0:y1, x0:x1])
        self.z[y0:y1, x0:x1][win] = zz[win]
        self.v[y0:y1, x0:x1][win] = val[win] - depth
        self.mat[y0:y1, x0:x1][win] = mat

    def render(self, ramps):
        """ramps: {mat: ramp tuple}. Ordered dither between tones."""
        cv = Canvas(self.w, self.h)
        th = BAYER[(self.yy.astype(int) % 4), (self.xx.astype(int) % 4)] * 0.9
        for mat, ramp in ramps.items():
            m = self.mat == mat
            if not m.any():
                continue
            rgb = _ramp_rgb(ramp)
            n = len(ramp)
            idx = np.clip(np.floor(self.v * (n - 1) + 0.5 + th * (mat != 1)), 0, n - 1).astype(int)
            cv.a[m, :3] = rgb[idx[m]]
            cv.a[m, 3] = 255
        # the silhouette: one darker step along the underside and the shaded side of the leaves
        solid = self.mat > 0
        under = solid & ~np.roll(solid, -1, axis=0)
        right = solid & ~np.roll(solid, -1, axis=1)
        for mat, ramp in ramps.items():
            if mat == 1:
                continue
            rgb = _ramp_rgb(ramp)
            m = (under | right) & (self.mat == mat)
            n = len(ramp)
            idx = np.clip(np.floor(self.v * (n - 1) + 0.5) - 1, 0, n - 1).astype(int)
            cv.a[m, :3] = rgb[idx[m]]
        return cv


# ---------------------------------------------------------------- trees
class Tree:
    """frames(): F canvases; base: trunk foot in sprite coords; h: height."""

    def __init__(self, w, h, base, draw):
        self.w, self.h, self.base = w, h, base
        self._draw = draw

    def frames(self):
        return [self._draw(f) for f in range(F)]


def _sway(f, y, base_y, h, amp=1.3, phase=0.0):
    k = np.clip((base_y - y) / h, 0, 1) ** 1.6
    return amp * k * math.sin(2 * math.pi * f / F + phase + y * 0.02)


def broadleaf(seed=1, w=200, h=180, crown=(0.5, 0.36, 0.42, 0.3), ramp=LEAF_RICH, bark=BARK, n_points=520,
              trunk_frac=0.5, lean=4.0, cluster=(3.4, 5.2), umbrella=False, birch=False, stems=1,
              holes=0.32, weeping=False, conical=False, r_max=9.0, limbs=(), fork=0.5):
    """A broadleaf tree grown into the crown ellipse (fractions of w and h)."""
    rng = random.Random(seed)
    bx, by = w * 0.5 + rng.uniform(-3, 3), h - 4
    C = (w * crown[0], h * crown[1])
    R = (w * crown[2], h * crown[3], min(w, h) * 0.28)

    def cut(x, y, z):
        if umbrella and y > C[1] + R[1] * 0.25:                  # a vase: the crown's underside is flat
            return False
        if conical:
            t = (y - (C[1] - R[1])) / (2 * R[1])
            return abs(x - C[0]) < R[0] * (0.12 + 0.88 * t)
        return True
    pts = ellipsoid_points(rng, n_points, C, R, lump=0.28, cut=cut, seed=seed)
    crown_low = C[1] + R[1] * (0.55 if not conical else 0.9) * trunk_frac * 1.6
    trunk_top = (C[0] + rng.uniform(-4, 4), by - (by - crown_low) * (fork if limbs else 1.0))
    skel = []
    for k in range(stems):
        off = (k - (stems - 1) / 2) * 6
        sub = [p for p in pts if (stems == 1 or (p[0] - C[0]) * (k - (stems - 1) / 2) >= -3)]
        nodes, parent = colonise(rng, (bx + off * 0.4, by), (trunk_top[0] + off * 1.6, trunk_top[1]), sub,
                                 lean=lean * (1 if k % 2 == 0 else -1), up=0.1 if not weeping else 0.02,
                                 limbs=limbs if stems == 1 else (), influence=46 if limbs else 26)
        r = radii(parent, r_tip=0.5, r_max=r_max if stems == 1 else r_max * 0.6)
        skel.append((nodes, parent, r))
    # prune limbs that never reached the crown, so no bare sticks poke out below it
    cutoff = C[1] + R[1] * (0.45 if umbrella else 1.0)
    pruned = []
    for nodes, parent, r in skel:
        keep = nodes[:, 1] < cutoff
        for i in range(len(nodes) - 1, 0, -1):
            if keep[i] and parent[i] >= 0:
                keep[parent[i]] = True
        trunk_n = int(np.argmax(parent < 0)) + 1
        keep[:trunk_n] = True
        keep[0] = True
        pruned.append((nodes, parent, r, keep))
    skel = pruned
    # leaf clusters on the twigs, thinned by a noise field so the crown has holes
    clusters = []
    for nodes, parent, r, keep in skel:
        kids = np.bincount(parent[parent >= 0], minlength=len(parent))
        for i in range(len(nodes)):
            if r[i] > 2.0 or (kids[i] > 0 and rng.random() < 0.35):
                continue
            x, y, z = nodes[i]
            if y > cutoff or not keep[i]:                     # no leaves down on the trunk and limbs
                continue
            if noise(x / 14.0, y / 14.0, seed + 11) < holes * 0.8 and rng.random() < 0.7:
                continue
            rad = rng.uniform(*cluster)
            clusters.append((x + rng.uniform(-1.5, 1.5), y + rng.uniform(-1.5, 1.0), z, rad, rng.random() * 9))
    roots = []
    for sgn, ln in ((-1, 1.0), (1, 0.75)):
        roots.append(((bx + sgn * 1.5, by - 3), (bx + sgn * (4 + 4 * ln), by + 1), 0.3))
    strands = []
    if weeping:
        for (x, y, z, rad, sd) in clusters:
            if rng.random() < 0.55:
                strands.append((x, y, z, rng.uniform(16, 46) * (0.6 + 0.4 * (y - C[1] + R[1]) / (2 * R[1])), sd))
    mats = {1: bark, 2: ramp}

    def draw(f):
        P = Painter(w, h)
        for nodes, parent, r, keep in skel:
            for i in range(1, len(nodes)):
                j = parent[i]
                if j < 0 or not keep[i]:
                    continue
                a, b = nodes[j], nodes[i]
                sa = _sway(f, a[1], by, h)
                sb = _sway(f, b[1], by, h)
                P.segment((a[0] + sa, a[1]), (b[0] + sb, b[1]), r[j] * 1.0, r[i] * 1.0, a[2] * 3, b[2] * 3,
                          seed + 1.7, birch=birch)
        rt = skel[0][2][0] if skel else 3
        for (a, b, _) in roots:
            P.segment(a, b, rt * 0.7, 1.0, -1, -1, seed + 2.3, birch=birch)
        P.segment((bx, by + 1), (bx, by - 9), rt * 1.35, rt * 1.0, -0.5, -0.5, seed + 1.7, birch=birch)   # flare
        for (x, y, z, rad, sd) in clusters:
            g = np.array([(x - C[0]) / R[0], (y - C[1]) / R[1], z / R[2]])
            gl = np.linalg.norm(g)
            g = g / (gl + 1e-6)
            inner = np.clip(1 - gl, 0, 1)
            P.blob((x + _sway(f, y, by, h), y), rad, z * 3, g, 2, sd, base_v=0.05 - 0.28 * inner,
                   depth=0.1 * np.clip(-z / R[2], 0, 1), flat=0.85 if not conical else 0.7)
        for (x, y, z, ln, sd) in strands:                         # weeping strands, swaying more at the tips
            n = int(ln)
            for k in range(n):
                t = k / max(1, n - 1)
                yy = y + k
                xx = x + _sway(f, y, by, h) + 1.8 * t * math.sin(2 * math.pi * f / F + sd) + (t ** 2) * 2
                if 0 <= int(yy) < h and 0 <= int(xx) < w:
                    zz = z * 3 + 1
                    if zz > P.z[int(yy), int(xx)]:
                        P.z[int(yy), int(xx)] = zz
                        P.v[int(yy), int(xx)] = 0.45 + 0.35 * (1 - t) * (xx < C[0]) + 0.12 * math.sin(k + sd) \
                            - 0.15 * (z < 0)
                        P.mat[int(yy), int(xx)] = 2
                    if k % 3 == 1 and 0 <= int(xx) + 1 < w and zz > P.z[int(yy), int(xx) + 1]:   # little leaves
                        P.z[int(yy), int(xx) + 1] = zz
                        P.v[int(yy), int(xx) + 1] = 0.35 + 0.2 * (1 - t)
                        P.mat[int(yy), int(xx) + 1] = 2
        return P.render(mats)
    return Tree(w, h, (int(bx), int(by)), draw)


def black_pine(seed=2, k=1.0):
    """Japanese black pine: a leaning, twisting trunk and flat clouds of needles."""
    rng = random.Random(seed)
    w, h = _k(190, k), _k(170, k)
    bx, by = w * 0.42, h - 4
    pads = [(w * 0.30, h * 0.40, 32, 10), (w * 0.62, h * 0.30, 36, 11), (w * 0.45, h * 0.17, 28, 9),
            (w * 0.80, h * 0.48, 26, 9), (w * 0.17, h * 0.58, 24, 8), (w * 0.56, h * 0.50, 22, 8),
            (w * 0.40, h * 0.29, 18, 7), (w * 0.75, h * 0.18, 18, 7)]
    pts = []
    for (cx, cy, rx, ry) in pads:
        pts += ellipsoid_points(rng, _k(80, k), (cx, cy), (rx * k, ry * k, 14 * k), lump=0.2, seed=cx)
    nodes, parent = colonise(rng, (bx, by), (bx + 12 * k, h * 0.62), pts, lean=-10 * k, up=0.02, influence=30)
    r = radii(parent, r_tip=0.5, r_max=7.5 * k)
    clusters = []
    kids = np.bincount(parent[parent >= 0], minlength=len(parent))
    for i in range(len(nodes)):
        if r[i] > 1.3 or kids[i] > 1:
            continue
        x, y, z = nodes[i]
        if min(((x - p[0]) / (p[2] * k)) ** 2 + ((y - p[1]) / (p[3] * k)) ** 2 for p in pads) > 1.6:
            continue
        clusters.append((x, y - 1, z, rng.uniform(3.4, 5.2), rng.random() * 9))
    mats = {1: BARK, 2: LEAF_PINE}

    def draw(f):
        P = Painter(w, h)
        for i in range(1, len(nodes)):
            j = parent[i]
            a, b = nodes[j], nodes[i]
            P.segment((a[0] + _sway(f, a[1], by, h, 0.8), a[1]), (b[0] + _sway(f, b[1], by, h, 0.8), b[1]),
                      r[j] * 1.1, r[i] * 1.1, a[2] * 3, b[2] * 3, seed + 0.9)
        for (x, y, z, rad, sd) in clusters:
            pad = min(pads, key=lambda p: ((x - p[0]) / p[2]) ** 2 + ((y - p[1]) / p[3]) ** 2)
            g = np.array([(x - pad[0]) / (pad[2] * k) * 0.6, (y - pad[1]) / (pad[3] * k), 0.5])
            g = g / np.linalg.norm(g)
            P.blob((x + _sway(f, y, by, h, 0.8), y), rad * 1.35, z * 3, g, 2, sd, flat=0.55, needles=True,
                   base_v=0.16, depth=0.05 * (z < 0), squash_top=True)
        return P.render(mats)
    return Tree(w, h, (int(bx), int(by)), draw)


def _k(v, k):
    return int(round(v * k))


def zelkova(seed=3, k=1.0):
    return broadleaf(seed, _k(230, k), _k(186, k), (0.5, 0.33, 0.45, 0.3), LEAF_RICH, umbrella=True,
                     n_points=_k(640, k), lean=3 * k, cluster=(3.2, 5.2), trunk_frac=0.62,
                     limbs=((-48, 34 * k), (-16, 30 * k), (14, 32 * k), (44, 34 * k)), fork=0.42, r_max=9 * k)


def oak(seed=4, k=1.0, ramp=LEAF_COOL):
    return broadleaf(seed, _k(200, k), _k(168, k), (0.5, 0.38, 0.42, 0.31), ramp, n_points=_k(560, k),
                     lean=5 * k, cluster=(3.2, 5.2), holes=0.28, limbs=((-55, 30 * k), (-8, 22 * k), (40, 30 * k)),
                     fork=0.55, r_max=8 * k)


def willow(seed=7, k=1.0):
    return broadleaf(seed, _k(200, k), _k(172, k), (0.5, 0.3, 0.38, 0.22), LEAF_SPRING, n_points=_k(380, k),
                     lean=7 * k, cluster=(2.6, 3.8), weeping=True, holes=0.42,
                     limbs=((-50, 26 * k), (-5, 20 * k), (45, 26 * k)), fork=0.6, r_max=7 * k)


def birch(seed=9, k=1.0):
    return broadleaf(seed, _k(130, k), _k(176, k), (0.5, 0.3, 0.36, 0.26), LEAF_SPRING, BARK_BIRCH,
                     n_points=_k(360, k), lean=3 * k, cluster=(2.4, 3.6), birch=True, stems=2, holes=0.42,
                     r_max=4.5 * k)


def cypress(seed=11, k=1.0):
    return broadleaf(seed, _k(90, k), _k(176, k), (0.5, 0.45, 0.42, 0.4), LEAF_CYPRESS, n_points=_k(360, k),
                     lean=1, cluster=(2.4, 3.6), conical=True, holes=0.18, trunk_frac=0.25, r_max=4 * k)


def shrub(seed, w=44, h=26, ramp=LEAF_RICH):
    rng = random.Random(seed)
    C, R = (w / 2, h * 0.55), (w * 0.46, h * 0.45, 10)
    cl = [(C[0] + x, C[1] + y, z, rng.uniform(3, 4.6), rng.random() * 9)
          for (x, y, z) in [(p[0] - C[0], p[1] - C[1], p[2]) for p in ellipsoid_points(rng, 34, C, R, seed=seed)]]

    def draw(f):
        P = Painter(w, h)
        for (x, y, z, rad, sd) in cl:
            g = np.array([(x - C[0]) / R[0], (y - C[1]) / R[1], z / R[2]])
            g = g / (np.linalg.norm(g) + 1e-6)
            P.blob((x + 0.5 * math.sin(2 * math.pi * f / F + sd), min(y, h - rad * 0.7)), rad, z, g, 2, sd,
                   base_v=0.02, depth=0.1 * (z < 0))
        return P.render({2: ramp})
    return Tree(w, h, (w // 2, h - 1), draw)


# ---------------------------------------------------------------- garden life
BUTTERFLIES = {
    'white': ('stone2', 'cloud3', 'cloud2', 'stone1'),       # body/edge, wing, wing shade, tip mark
    'yellow': ('wood0', 'gold4', 'gold3', 'ink'),
    'blue': ('indigo1', 'sky3', 'sky2', 'indigo0'),
    'orange': ('ink', 'copper4', 'copper3', 'ink'),
}


def butterfly(cv, x, y, kind, flap):
    """flap 0 open, 1 half, 2 closed (wings up, edge-on)."""
    body, wing, shade, mark = (PAL[c] for c in BUTTERFLIES[kind])

    def p(dx, dy, c):
        X, Y = int(x + dx), int(y + dy)
        if 0 <= X < cv.w and 0 <= Y < cv.h:
            cv.a[Y, X] = (*c, 255)
    if flap == 0:
        for dx, dy, c in ((-3, -2, mark), (-2, -2, wing), (-1, -1, wing), (-2, -1, wing), (-3, -1, wing),
                          (-2, 0, shade), (-1, 0, shade), (-1, 1, shade),
                          (3, -2, mark), (2, -2, wing), (1, -1, wing), (2, -1, wing), (3, -1, wing),
                          (2, 0, shade), (1, 0, shade), (1, 1, shade)):
            p(dx, dy, c)
    elif flap == 1:
        for dx, dy, c in ((-2, -2, mark), (-1, -2, wing), (-1, -1, wing), (-2, -1, shade), (-1, 0, shade),
                          (2, -2, mark), (1, -2, wing), (1, -1, wing), (2, -1, shade), (1, 0, shade)):
            p(dx, dy, c)
    else:
        for dx, dy, c in ((0, -3, mark), (0, -2, wing), (1, -2, shade), (1, -1, shade)):
            p(dx, dy, c)
    for dy in (-1, 0, 1):
        p(0, dy, body)


def dragonfly(cv, x, y, f):
    body, wing = PAL['teal1'], PAL['cloud3']
    for k in range(6):
        X, Y = int(x + k), int(y)
        if 0 <= X < cv.w and 0 <= Y < cv.h:
            cv.a[Y, X] = (*(PAL['ink'] if k == 0 else body), 255)
    up = f % 2 == 0
    for dx in (1, 2):
        for dy in ((-1, -2) if up else (1,)):
            X, Y = int(x + dx), int(y + dy)
            if 0 <= X < cv.w and 0 <= Y < cv.h:
                a = cv.a[Y, X]
                cv.a[Y, X] = ((int(a[0]) + wing[0]) // 2, (int(a[1]) + wing[1]) // 2, (int(a[2]) + wing[2]) // 2, 255) \
                    if a[3] else (*wing, 150)


def drifting_leaf(cv, x, y, f, ramp=LEAF_RICH):
    c1, c2 = PAL[ramp[4]], PAL[ramp[2]]
    flip = f % 4
    cells = [(0, 0, c1), (1, 0, c2)] if flip in (0, 2) else [(0, 0, c1), (0, 1, c2)]
    if flip == 1:
        cells.append((1, 1, c2))
    for dx, dy, c in cells:
        X, Y = int(x + dx), int(y + dy)
        if 0 <= X < cv.w and 0 <= Y < cv.h:
            cv.a[Y, X] = (*c, 255)


def garden_life(frames, rng, ground):
    """Butterflies over the flowers and dragonflies by the lake.
    Every path is periodic over F frames, so the layer loops."""
    W = frames[0].w
    flyers = []
    kinds = list(BUTTERFLIES)
    for i in range(26):
        x0 = rng.uniform(0, W)
        y0 = rng.uniform(ground - 44, ground - 6)
        flyers.append(('b', x0, y0, rng.uniform(5, 11), rng.uniform(3, 7), rng.random() * 6.3, kinds[i % 4],
                       rng.choice((1, 1, -1))))
    for i in range(6):
        flyers.append(('d', rng.uniform(0, W), rng.uniform(ground - 30, ground - 18), rng.uniform(6, 14), 2,
                       rng.random() * 6.3, None, rng.choice((1, -1))))
    for f, cv in enumerate(frames):
        t = 2 * math.pi * f / F
        for (kind, x0, y0, ax, ay, ph, sp, dr) in flyers:
            if kind == 'b':                                   # a fluttering figure of eight
                x = x0 + ax * math.sin(t * dr + ph)
                y = y0 + ay * math.sin(2 * (t * dr + ph)) * 0.6 - 1.5 * abs(math.sin(4 * t + ph))
                butterfly(cv, x, y, sp, (f + int(ph * 3)) % 3)
            elif kind == 'd':                                 # darts and hovers
                k = (f + int(ph * 2)) % F
                x = x0 + ax * (0 if k < 3 else (k - 3) / 4.0) * dr
                y = y0 + (1 if k in (2, 6) else 0)
                dragonfly(cv, x, y, f)
    return frames
