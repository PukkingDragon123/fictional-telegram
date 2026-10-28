"""Everything that grows: trees, grass, flowers - and what the drain does to them.

Trees are grown as real skeletons (trunk, limbs, branches as capsules) with
leaf clumps (ellipsoids with a leafy pixel edge) at the twigs, so when life is
drained out of them the leaves thin out, brown and fall and the bare limbs
are left. Four kinds of the valley:

  sugi    Japanese cedar: straight, tall, a dark cone of whorled branches
  keyaki  zelkova: a vase of limbs under a round crown
  momiji  maple in autumn: low and spreading, red, orange and gold
  matsu   black pine: a leaning, twisting trunk and flat clouds of needles

Far off, a tree is drawn as a few clumps on a stick (the impostor); close, as
the whole thing. Grass is grown fresh each frame round the camera, in rings
that get coarser with distance, so it is everywhere and costs little.
"""
import math

import numpy as np

import hd2d as K
from world import BARK, LEAF, GRASS, PETAL, STEM, ROCK
from terrain import lake_e, WATER

SPECIES = ('sugi', 'keyaki', 'momiji', 'matsu')


def _unit(v):
    return v / (np.linalg.norm(v) + 1e-12)


def _perp(d, ang):
    ref = np.array([0, 1.0, 0]) if abs(d[1]) < 0.9 else np.array([1.0, 0, 0])
    a = _unit(np.cross(d, ref))
    b = np.cross(d, a)
    return a * math.cos(ang) + b * math.sin(ang)


class Shape:
    """One tree in its own frame (y up, base at 0): segments and clumps."""

    def __init__(self):
        self.A, self.B, self.r = [], [], []
        self.C, self.R = [], []

    def seg(self, a, b, r):
        self.A.append(np.array(a, float))
        self.B.append(np.array(b, float))
        self.r.append(float(r))

    def clump(self, c, rx, ry=None, rz=None):
        self.C.append(np.array(c, float))
        self.R.append((rx, rx if ry is None else ry, rx if rz is None else rz))

    def limb(self, p, d, L, r0, r1, n, rng, bend=0.0, up=0.0):
        """A wobbly branch of n segments; returns the end and its direction."""
        d = _unit(np.array(d, float))
        for k in range(n):
            d = _unit(d + rng.normal(0, bend, 3) + np.array([0, up, 0]))
            q = p + d * L / n
            self.seg(p, q, r0 + (r1 - r0) * (k + 0.5) / n)
            p = q
        return p, d

    def arrays(self):
        return (np.array(self.A).reshape(-1, 3), np.array(self.B).reshape(-1, 3), np.array(self.r),
                np.array(self.C).reshape(-1, 3), np.array(self.R).reshape(-1, 3))


def grow(kind, H, seed):
    rng = np.random.RandomState(seed)
    s = Shape()
    if kind == 'sugi':
        r0 = 0.018 * H + 0.15
        top = np.array([rng.normal(0, 0.015 * H), H, rng.normal(0, 0.015 * H)])
        n = 7
        pts = [top * k / n + np.r_[rng.normal(0, 0.08, 1), 0, rng.normal(0, 0.08, 1)] * (0 < k < n) for k in range(n + 1)]
        for k in range(n):
            s.seg(pts[k], pts[k + 1], r0 * (1 - k / n) ** 0.8 + 0.04)
        y = 0.24 * H
        while y < 0.97 * H:
            f = (y - 0.24 * H) / (0.73 * H)
            p = top * y / H
            L = (1 - f) ** 0.9 * 0.27 * H + 0.5
            for j in range(rng.randint(3, 6)):
                a = rng.uniform(0, 2 * math.pi)
                d = np.array([math.cos(a), -0.25 + 0.2 * rng.rand(), math.sin(a)])
                e, _ = s.limb(p, d, L, r0 * 0.22 * (1 - f) + 0.03, 0.03, 2, rng, 0.08, 0.06)
                rr = 0.42 * L + 0.55
                s.clump(e * 0.8 + p * 0.2 + [0, 0.15 * rr, 0], rr, 0.62 * rr, rr)
                s.clump(e * 0.45 + p * 0.55 + [0, 0.2 * rr, 0], rr * 0.9, 0.6 * rr, rr * 0.9)
            y += H / rng.uniform(11, 14)
        s.clump(top - [0, 0.6, 0], 0.9 + 0.02 * H, 1.4 + 0.03 * H, 0.9 + 0.02 * H)
    elif kind == 'keyaki':
        r0 = 0.03 * H + 0.12
        h0 = H * rng.uniform(0.28, 0.38)
        base = np.zeros(3)
        p, _ = s.limb(base, [0, 1, 0], h0, r0, r0 * 0.8, 3, rng, 0.03)
        nl = rng.randint(4, 6)
        for j in range(nl):
            a = 2 * math.pi * j / nl + rng.normal(0, 0.3)
            tilt = rng.uniform(0.35, 0.6)
            d = np.array([math.sin(tilt) * math.cos(a), math.cos(tilt), math.sin(tilt) * math.sin(a)])
            e, d2 = s.limb(p, d, (H - h0) * rng.uniform(0.5, 0.65), r0 * 0.5, r0 * 0.22, 3, rng, 0.08, 0.04)
            for k in range(rng.randint(2, 4)):
                dd = _unit(d2 + _perp(d2, rng.uniform(0, 6.3)) * 0.8 + [0, 0.2, 0])
                e2, _ = s.limb(e, dd, (H - h0) * rng.uniform(0.22, 0.34), r0 * 0.18, 0.04, 2, rng, 0.15)
                rr = H * rng.uniform(0.11, 0.15)
                s.clump(e2 + [0, rr * 0.2, 0], rr, rr * 0.8, rr)
            rr = H * 0.12
            s.clump(e + [0, rr * 0.3, 0], rr, rr * 0.85, rr)
        for k in range(5):
            c = np.array([rng.normal(0, 0.12 * H), H * rng.uniform(0.62, 0.85), rng.normal(0, 0.12 * H)])
            s.clump(c, H * 0.14, H * 0.11, H * 0.14)
    elif kind == 'momiji':
        r0 = 0.03 * H + 0.08
        h0 = H * rng.uniform(0.22, 0.3)
        p, _ = s.limb(np.zeros(3), [rng.normal(0, 0.1), 1, rng.normal(0, 0.1)], h0, r0, r0 * 0.8, 2, rng, 0.05)
        for j in range(rng.randint(5, 7)):
            a = rng.uniform(0, 2 * math.pi)
            tilt = rng.uniform(0.7, 1.05)
            d = np.array([math.sin(tilt) * math.cos(a), math.cos(tilt), math.sin(tilt) * math.sin(a)])
            e, d2 = s.limb(p, d, H * rng.uniform(0.4, 0.55), r0 * 0.45, 0.04, 3, rng, 0.12, 0.08)
            for k in range(3):
                rr = H * rng.uniform(0.12, 0.16)
                c = p + (e - p) * (0.5 + 0.25 * k) + [0, rr * 0.4 + 0.08 * H * k, 0]
                s.clump(c, rr, rr * 0.62, rr)
        s.clump([0, H * 0.82, 0], H * 0.2, H * 0.14, H * 0.2)
    else:   # matsu
        r0 = 0.032 * H + 0.15
        lean = rng.uniform(0, 2 * math.pi)
        ld = np.array([math.cos(lean), 0, math.sin(lean)])
        pts = [np.zeros(3)]
        for k in range(1, 8):
            f = k / 7
            off = ld * (0.32 * H * math.sin(f * 2.4)) + _perp(np.array([0, 1.0, 0]), lean + 1.6) * 0.08 * H * \
                math.sin(f * 5.0)
            pts.append(np.array([0, f * H * 0.92, 0]) + off)
        for k in range(7):
            s.seg(pts[k], pts[k + 1], r0 * (1 - k / 8) ** 0.7 + 0.05)
        for j in range(rng.randint(5, 8)):
            f = rng.uniform(0.38, 0.95)
            p = pts[int(f * 7)] + (pts[min(7, int(f * 7) + 1)] - pts[int(f * 7)]) * (f * 7 % 1)
            a = rng.uniform(0, 2 * math.pi)
            d = np.array([math.cos(a), rng.uniform(-0.15, 0.25), math.sin(a)])
            L = H * rng.uniform(0.2, 0.42) * (1.25 - f * 0.6)
            e, _ = s.limb(p, d, L, r0 * 0.3, 0.05, 3, rng, 0.18, -0.02)
            pr = H * rng.uniform(0.09, 0.13)                       # a flat cloud of needles
            for k in range(rng.randint(3, 6)):
                o = np.array([rng.normal(0, pr * 0.6), rng.normal(0.15, 0.08) * pr, rng.normal(0, pr * 0.6)])
                s.clump(e + o, pr * rng.uniform(0.75, 1.05), pr * 0.36, pr * rng.uniform(0.75, 1.05))
        top = pts[-1]
        pr = H * 0.12
        for k in range(4):
            s.clump(top + [rng.normal(0, pr * 0.5), pr * 0.2, rng.normal(0, pr * 0.5)], pr, pr * 0.4, pr)
    return s.arrays()


def impostor(kind, H, A, C, R):
    """A cheap stand-in: a trunk and the crown as a few clumps."""
    lo = C.min(0) - R.max() * 0.4
    hi = C.max(0) + R.max() * 0.4
    mid = (lo + hi) / 2
    ext = (hi - lo) / 2
    if kind == 'sugi':
        cl = [(mid + [0, -ext[1] * 0.55, 0], (ext[0] * 0.9, ext[1] * 0.4, ext[2] * 0.9)),
              (mid + [0, -ext[1] * 0.1, 0], (ext[0] * 0.75, ext[1] * 0.38, ext[2] * 0.75)),
              (mid + [0, ext[1] * 0.35, 0], (ext[0] * 0.52, ext[1] * 0.34, ext[2] * 0.52)),
              (mid + [0, ext[1] * 0.75, 0], (ext[0] * 0.28, ext[1] * 0.28, ext[2] * 0.28))]
    elif kind == 'matsu':
        cl = [(C[i], R[i] * 1.4) for i in np.argsort(-R[:, 0])[:6]]
    else:
        e = ext * [1.0, 0.9, 1.0]
        cl = [(mid + [0, -e[1] * 0.25, 0], e * [0.85, 0.6, 0.85])]
        for k in range(4):
            a = k * 1.5708 + 0.4
            cl.append((mid + [math.cos(a) * e[0] * 0.42, e[1] * 0.05, math.sin(a) * e[2] * 0.42], e * [0.55, 0.6, 0.55]))
        cl.append((mid + [0, e[1] * 0.45, 0], e * [0.55, 0.45, 0.55]))
    return np.array([c for c, _ in cl]), np.array([r for _, r in cl], float)


LEAF_COL = {   # alive leaf colours per species: (dark, mid, light) RGB
    'sugi': [(26, 52, 46), (36, 68, 56), (52, 88, 66)],
    'keyaki': [(40, 74, 40), (58, 98, 46), (84, 124, 56)],
    'momiji': [(150, 36, 30), (196, 74, 34), (222, 150, 52)],
    'matsu': [(30, 60, 44), (44, 80, 52), (66, 104, 62)],
}
LEAF_DEAD = [(70, 58, 48), (92, 76, 58), (112, 96, 72)]
LEAF_ASH = [(52, 50, 52), (70, 68, 68), (88, 86, 84)]


def smooth(a, b, x):
    u = np.clip((x - a) / (b - a), 0, 1)
    return u * u * (3 - 2 * u)


class Trees:
    """All the trees of the valley, placed, with both their whole and cheap selves."""

    def __init__(self, land, spots, seed=1):
        """spots: list of (x, z, kind, H)."""
        self.land = land
        r = np.random.RandomState(seed)
        cache = {}
        A, B, Rr, Ta, Hf_a = [], [], [], [], []
        C, Rc, Tc, Hf_c = [], [], [], []
        IC, IR, Ti = [], [], []
        self.pos, self.H, self.kind, self.phase, self.lag = [], [], [], [], []
        for i, (x, z, kind, Ht) in enumerate(spots):
            key = (kind, int(Ht * 2), (i * 7) % 23)
            if key not in cache:
                a, b, rr, c, rc = grow(kind, int(Ht * 2) / 2, SPECIES.index(kind) * 7919 + key[1] * 31 + key[2])
                ic, ir = impostor(kind, Ht, a, c, rc)
                cache[key] = (a, b, rr, c, rc, ic, ir)
            a, b, rr, c, rc, ic, ir = cache[key]
            y = float(land.height(np.array([x]), np.array([z]))[0])
            ang = r.uniform(0, 2 * math.pi)
            ca, sa = math.cos(ang), math.sin(ang)
            Rot = np.array([[ca, 0, -sa], [0, 1, 0], [sa, 0, ca]])
            base = np.array([x, y - 0.3, z])
            A.append(a @ Rot.T + base)
            B.append(b @ Rot.T + base)
            Rr.append(rr)
            Ta.append(np.full(len(a), i))
            Hf_a.append(np.maximum(b[:, 1], 0) / Ht)
            C.append(c @ Rot.T + base)
            Rc.append(rc)
            Tc.append(np.full(len(c), i))
            Hf_c.append(np.clip(c[:, 1] / Ht, 0, 1.2))
            IC.append(ic @ Rot.T + base)
            IR.append(ir)
            Ti.append(np.full(len(ic), i))
            self.pos.append(base)
            self.H.append(Ht)
            self.kind.append(SPECIES.index(kind))
            self.phase.append(r.uniform(0, 6.3))
            self.lag.append(r.uniform(0.2, 1.6))
        cat = np.concatenate
        self.A, self.B, self.Rr, self.Ta, self.Hfa = cat(A), cat(B), cat(Rr), cat(Ta), cat(Hf_a)
        self.C, self.Rc, self.Tc, self.Hfc = cat(C), cat(Rc), cat(Tc), cat(Hf_c)
        self.IC, self.IR, self.Ti = cat(IC), cat(IR), cat(Ti)
        self.pos = np.array(self.pos)
        self.H = np.array(self.H)
        self.kind = np.array(self.kind)
        self.phase = np.array(self.phase)
        self.lag = np.array(self.lag)
        self.cvar = r.rand(len(self.C)).astype(np.float32)
        self.ivar = r.rand(len(self.IC)).astype(np.float32)
        self.n = len(self.pos)
        self.oid_c = (1000000 + np.arange(len(self.C))).astype(np.int32)
        self.oid_i = (3000000 + np.arange(len(self.IC))).astype(np.int32)
        self.oid_t = (100000 + self.Ta).astype(np.int32)
        self.override = {}          # tree index -> fn(t) giving (dead, extra offset for clumps)

    def deadness(self, t, dead_at):
        if dead_at is None:
            return np.zeros(self.n)
        return np.clip(dead_at(self.pos[:, 0], self.pos[:, 2], t - self.lag), 0, 1)

    def draw(self, g, cam, t, dead_at=None, shadow=False, wind=1.0, full_px=30):
        d = np.linalg.norm(self.pos - cam.eye, axis=1)
        top = self.pos + np.c_[np.zeros(self.n), self.H * 0.6, np.zeros(self.n)]
        c = cam.to_cam(top)
        rad = self.H * 0.7
        vis = c[:, 2] > -rad
        lim_x = cam.W / 2 / cam.focal
        lim_y = cam.H / 2 / cam.focal
        zz = np.maximum(c[:, 2], 1e-3)
        vis &= np.abs(c[:, 0]) - rad < lim_x * zz + rad
        vis &= np.abs(c[:, 1]) - rad < lim_y * zz + rad
        px = self.H * cam.focal / np.maximum(d, 1)
        full = vis & ((px > full_px) | shadow)
        imp = vis & ~full
        dead = self.deadness(t, dead_at)
        for i, fn in self.override.items():
            dead[i] = fn(t)
        sway = wind * 0.012 * self.H * np.sin(t * 0.9 + self.phase) + wind * 0.006 * self.H * np.sin(t * 2.3 +
                                                                                                    self.phase * 2)
        wdir = np.array([0.9, 0, 0.43])
        # whole trees: limbs, then leaves
        ma = full[self.Ta]
        if ma.any():
            ta = self.Ta[ma]
            off = (sway[ta] * self.Hfa[ma] ** 2)[:, None] * wdir * 0.6
            K.draw_capsules(g, cam, self.A[ma] + off * 0.7, self.B[ma] + off, self.Rr[ma], BARK, self.oid_t[ma],
                            self.kind[ta].astype(np.float32), aux=dead[ta].astype(np.float32), widen=not shadow)
        mc = full[self.Tc]
        if mc.any():
            tc = self.Tc[mc]
            off = (sway[tc] * self.Hfc[mc] ** 2)[:, None] * wdir
            leaf = np.clip(dead[tc] * 1.05 - 0.05, 0, 0.97) if not shadow else np.clip(dead[tc] - 0.2, 0, 0.97)
            K.draw_ellipsoids(g, cam, self.C[mc] + off, self.Rc[mc], LEAF, self.oid_c[mc],
                              self.kind[tc] + self.cvar[mc] * 0.99, leaf=leaf.astype(np.float32),
                              aux=dead[tc].astype(np.float32), widen=not shadow)
        mi = imp[self.Ti]
        if mi.any():
            ti = self.Ti[mi]
            K.draw_capsules(g, cam, self.pos[ti] - [0, 0.0, 0], self.pos[ti] + np.c_[0 * ti, self.H[ti] * 0.5, 0 * ti],
                            self.H[ti] * 0.02 + 0.1, BARK, self.oid_t[0] * 0 + 99999, self.kind[ti].astype(np.float32),
                            aux=dead[ti].astype(np.float32))
            off = (sway[ti] * 0.5)[:, None] * wdir
            leaf = np.clip(dead[ti] * 1.05 - 0.05, 0, 0.97)
            K.draw_ellipsoids(g, cam, self.IC[mi] + off, self.IR[mi], LEAF, self.oid_i[mi],
                              self.kind[ti] + self.ivar[mi] * 0.99, leaf=leaf.astype(np.float32),
                              aux=dead[ti].astype(np.float32))
        return dead


# ---------------------------------------------------------------- where the trees stand
def forest_mask(x, z):
    """The forest: a belt across the north of the valley, woods up its sides,
    and a few groves."""
    from hd2d import fbm
    x = np.asarray(x, float)
    z = np.asarray(z, float)
    edge = 960 + 160 * fbm(x / 420.0, np.zeros_like(x) + 3.3, 3, 71) * 2
    m = z > edge
    m |= (x > 1500 + 200 * fbm(z / 400.0, np.zeros_like(z), 3, 73)) | (x < -1550 + 200 * fbm(z / 400.0, z * 0 + 1, 3, 75))
    m |= z < -900 + 150 * fbm(x / 380.0, x * 0 + 5, 3, 77)
    for (gx, gz, gr) in GROVES:
        m |= np.hypot(x - gx, z - gz) < gr * (1 + 0.3 * fbm(x / 60.0, z / 60.0, 2, 79))
    m &= lake_e(x, z) > 1.6
    return m


GROVES = [(-380, 1080, 140), (480, 900, 110), (-1280, 640, 130), (620, 120, 90), (-180, -120, 70), (900, 520, 120)]
OLD_PINE = (230.0, 260.0, 'matsu', 34.0)


def place_trees(land, F, path, seed=3):
    """Spots for every tree: dense near the film, sparser far off, none on the
    path the giant walks or round the crack."""
    r = np.random.RandomState(seed)
    spots = []
    step = 12.0
    xs = np.arange(-2600, 2600, step)
    zs = np.arange(-1500, 2700, step)
    X, Z = np.meshgrid(xs, zs)
    X = X + r.uniform(-0.45, 0.45, X.shape) * step
    Z = Z + r.uniform(-0.45, 0.45, Z.shape) * step
    X, Z = X.ravel(), Z.ravel()
    dF = np.hypot(X - F[0], Z - F[2])
    keep = forest_mask(X, Z)
    # thinner the further from the film
    p = np.clip(1.25 - dF / 1700, 0.0, 1.0) ** 1.5
    keep &= r.rand(len(X)) < p
    keep &= dF < 2400
    keep &= dF > 150
    X, Z = X[keep], Z[keep]
    for x, z in zip(X, Z):
        u = r.rand()
        north = z > 900
        if north and u < 0.55:
            kind, Ht = 'sugi', r.uniform(22, 34)
        elif u < 0.78:
            kind, Ht = 'keyaki', r.uniform(14, 22)
        elif u < 0.9:
            kind, Ht = 'momiji', r.uniform(7, 11)
        else:
            kind, Ht = 'matsu', r.uniform(12, 18)
        spots.append((x, z, kind, Ht))
    # lone trees out in the meadow
    for k in range(70):
        for _ in range(20):
            x, z = r.uniform(-1300, 1300), r.uniform(-500, 1000)
            if lake_e(x, z) < 1.7 or np.hypot(x - F[0], z - F[2]) < 180:
                continue
            if min(np.hypot(x - px, z - pz) for (px, pz) in path) < 70:
                continue
            kind = ['keyaki', 'momiji', 'matsu', 'momiji'][k % 4]
            spots.append((x, z, kind, {'keyaki': r.uniform(13, 19), 'momiji': r.uniform(7, 10),
                                       'matsu': r.uniform(10, 16)}[kind]))
            break
    spots.append(OLD_PINE)
    return spots


# ---------------------------------------------------------------- grass
RINGS = [(0.0, 3.5, 0.11), (3.5, 9.0, 0.22), (9.0, 22.0, 0.45), (22.0, 55.0, 0.95), (55.0, 140.0, 2.0)]


def grass(cam, land, meadow_fn, t, dead_fn=None, density=1.0, parted=None, short=None):
    """Blades round the camera: (A, B, C) points of two-segment blades, radius,
    variation, and how dead each is. Rings of cells, coarser further out."""
    eye = cam.eye
    out = []
    gy = float(land.height(np.array([eye[0]]), np.array([eye[2]]))[0])
    hcam = max(eye[1] - gy, 0.3)
    f2 = cam.R[2].copy()
    for (d0, d1, s) in RINGS:
        if d1 < hcam * 0.9:
            continue
        n = int(2 * d1 / s) + 1
        cx = math.floor(eye[0] / s)
        cz = math.floor(eye[2] / s)
        ii, jj = np.meshgrid(np.arange(cx - n // 2, cx + n // 2 + 1), np.arange(cz - n // 2, cz + n // 2 + 1))
        ii, jj = ii.ravel(), jj.ravel()
        for k in range(2):
            h1 = _h(ii, jj, 11 + k)
            h2 = _h(ii, jj, 23 + k)
            x = (ii + h1) * s
            z = (jj + h2) * s
            dx, dz = x - eye[0], z - eye[2]
            dist = np.sqrt(dx * dx + dz * dz + hcam * hcam)
            sel = (dist >= d0) & (dist < d1)
            # in front of the camera only
            fwd = dx * f2[0] + dz * f2[2]
            sel &= fwd > -2.0
            if not sel.any():
                continue
            x, z, dist = x[sel], z[sel], dist[sel]
            hv = _h(ii[sel], jj[sel], 37 + k)
            # fade between rings by dropping some
            fade = np.clip((d1 - dist) / (0.25 * (d1 - d0)), 0, 1) * np.clip((dist - d0) / (0.25 * (d1 - d0)) + 0.2, 0, 1)
            sel2 = hv < fade * density
            sel2 &= meadow_fn(x, z)
            if not sel2.any():
                continue
            x, z, hv, dist = x[sel2], z[sel2], hv[sel2], dist[sel2]
            out.append((x, z, hv, np.full(len(x), s)))
    if not out:
        return None
    x = np.concatenate([o[0] for o in out])
    z = np.concatenate([o[1] for o in out])
    hv = np.concatenate([o[2] for o in out])
    s = np.concatenate([o[3] for o in out])
    y = land.height(x, z)
    dead = dead_fn(x, z) if dead_fn is not None else np.zeros(len(x))
    ht = (0.4 + 0.7 * _h(x * 7.1, z * 3.3, 5)) * (0.75 + 0.5 * (s / 0.11) ** 0.25) * (1 - 0.45 * dead)
    if short is not None:
        ht = ht * short(x, z)
    lean = _h(x * 3.7, z * 9.1, 7) * 2 * math.pi
    wind = 0.25 * np.sin(t * 2.1 + x * 0.35 + z * 0.12) + 0.12 * np.sin(t * 3.7 + x * 1.3)
    lx = np.cos(lean) * 0.18 + 0.9 * wind
    lz = np.sin(lean) * 0.18 + 0.43 * wind
    droop = dead * 0.9
    if parted is not None:
        px_, pz_ = parted(x, z)
        lx = lx + px_
        lz = lz + pz_
    A = np.stack([x, y, z], 1)
    Bm = A + np.stack([lx * 0.35 * ht, ht * 0.55 * (1 - droop * 0.4), lz * 0.35 * ht], 1)
    Ct = A + np.stack([lx * ht * (1 + droop), ht * (1 - droop * 0.75), lz * ht * (1 + droop)], 1)
    r = 0.0032 * (s / 0.11) ** 0.5
    var = _h(x * 1.7, z * 2.9, 9).astype(np.float32)
    return A, Bm, Ct, r, var, dead


def _h(a, b, s):
    a = np.asarray(a, np.int64) if np.asarray(a).dtype.kind in 'iu' else np.floor(np.asarray(a) * 1000).astype(np.int64)
    b = np.asarray(b, np.int64) if np.asarray(b).dtype.kind in 'iu' else np.floor(np.asarray(b) * 1000).astype(np.int64)
    h = (a * 374761393 + b * 668265263 + s * 1442695041 + 0x9E3779B9) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = h ^ (h >> 16)
    return h / 4294967296.0


def draw_grass(g, cam, blades, oid0=5000000):
    if blades is None:
        return
    A, Bm, Ct, r, var, dead = blades
    n = len(A)
    oid = np.full(n, oid0, np.int32)
    K.draw_capsules(g, cam, A, Bm, r, GRASS, oid, var, np.zeros(n), np.full(n, 0.55), aux=dead.astype(np.float32))
    K.draw_capsules(g, cam, Bm, Ct, r * 0.55, GRASS, oid, var, np.full(n, 0.55), np.ones(n),
                    aux=dead.astype(np.float32))


# ---------------------------------------------------------------- flowers
class Flowers:
    """Patches of spider lilies (red), bellflowers (blue-violet) and white
    cosmos: stems and heads, fixed in the world."""

    def __init__(self, land, meadow_fn, F, seed=8, n_patch=260, spots=()):
        r = np.random.RandomState(seed)
        X, Z, kind = [], [], []
        for k in range(n_patch + len(spots)):
            cx = r.uniform(-900, 900) + F[0]
            cz = r.uniform(-700, 450) + F[2]
            if k < 40:                                         # many close round the crack
                cx = F[0] + r.normal(0, 40)
                cz = F[2] + r.normal(0, 40)
            if k >= n_patch:                                   # and where the film opens
                cx, cz = spots[k - n_patch]
            kd = r.choice(3, p=[0.5, 0.25, 0.25])
            m = r.randint(6, 26)
            X.append(cx + r.normal(0, 2.5, m))
            Z.append(cz + r.normal(0, 2.5, m))
            kind.append(np.full(m, kd))
        X, Z, kind = np.concatenate(X), np.concatenate(Z), np.concatenate(kind)
        ok = meadow_fn(X, Z)
        self.x, self.z, self.kind = X[ok], Z[ok], kind[ok]
        self.y = land.height(self.x, self.z)
        self.h = r.uniform(0.35, 0.65, len(self.x)) * np.where(self.kind == 0, 1.0, 0.8)
        self.ph = r.uniform(0, 6.3, len(self.x))
        self.n = len(self.x)

    def draw(self, g, cam, t, dead_fn=None, maxd=90.0):
        d = np.sqrt((self.x - cam.eye[0]) ** 2 + (self.z - cam.eye[2]) ** 2)
        s = d < maxd
        if not s.any():
            return
        x, y, z, h, ph, kd = self.x[s], self.y[s], self.z[s], self.h[s], self.ph[s], self.kind[s]
        dead = dead_fn(x, z) if dead_fn is not None else np.zeros(len(x))
        sw = 0.06 * np.sin(t * 1.9 + ph)
        droop = dead * 0.8
        A = np.stack([x, y, z], 1)
        top = A + np.stack([sw + droop * 0.25 * h, h * (1 - droop * 0.6), sw * 0.4], 1)
        n = len(x)
        K.draw_capsules(g, cam, A, top, np.full(n, 0.008), STEM, np.full(n, 6000000, np.int32), np.zeros(n),
                        aux=dead.astype(np.float32))
        oid = (6100000 + np.arange(n)).astype(np.int32)
        if (kd == 0).any():                                    # spider lilies: curled petals all round
            k0 = np.where(kd == 0)[0]
            pa, pb, pv, po, pdd = [], [], [], [], []
            for j in range(7):
                a = j / 7 * 2 * math.pi + ph[k0]
                dvec = np.stack([np.cos(a), 0.35 + 0.0 * a, np.sin(a)], 1)
                pa.append(top[k0])
                pb.append(top[k0] + dvec * 0.075 * (1 - dead[k0, None] * 0.6) + [0, -0.01, 0])
                pv.append(np.full(len(k0), 0.0))
                po.append(oid[k0])
                pdd.append(dead[k0])
            for j in range(5):                                 # long stamens
                a = j / 5 * 2 * math.pi + ph[k0] + 0.3
                dvec = np.stack([np.cos(a) * 0.8, 1.0 + 0 * a, np.sin(a) * 0.8], 1)
                pa.append(top[k0])
                pb.append(top[k0] + dvec * 0.09 * (1 - dead[k0, None]))
                pv.append(np.full(len(k0), 0.05))
                po.append(oid[k0])
                pdd.append(dead[k0])
            K.draw_capsules(g, cam, np.concatenate(pa), np.concatenate(pb), np.full(len(k0) * 12, 0.009), PETAL,
                            np.concatenate(po), np.concatenate(pv), aux=np.concatenate(pdd).astype(np.float32))
        k1 = np.where(kd > 0)[0]
        if len(k1):
            rr = np.where(kd[k1] == 1, 0.035, 0.045) * (1 - dead[k1] * 0.5)
            K.draw_ellipsoids(g, cam, top[k1], np.stack([rr, rr * 0.55, rr], 1), PETAL, oid[k1],
                              kd[k1].astype(np.float32) * 0.5 + 0.01, aux=dead[k1].astype(np.float32))


# ---------------------------------------------------------------- stones
class Rocks:
    def __init__(self, land, meadow_fn, F, seed=12, n=180):
        r = np.random.RandomState(seed)
        X = F[0] + r.uniform(-1200, 1200, n * 3)
        Z = F[2] + r.uniform(-800, 800, n * 3)
        ok = meadow_fn(X, Z) & (np.hypot(X - F[0], Z - F[2]) > 25)
        X, Z = X[ok][:n], Z[ok][:n]
        sz = r.uniform(0.4, 2.2, len(X)) ** 1.6
        self.C, self.R, self.Rm = [], [], []
        for x, z, s in zip(X, Z, sz):
            y = float(land.height(np.array([x]), np.array([z]))[0])
            for k in range(r.randint(1, 4)):
                o = r.normal(0, s * 0.5, 3) * [1, 0, 1]
                rr = s * r.uniform(0.5, 1.0)
                self.C.append([x + o[0], y + rr * 0.25, z + o[2]])
                self.R.append([rr, rr * r.uniform(0.45, 0.7), rr * r.uniform(0.7, 1.0)])
                a = r.uniform(0, 6.3)
                self.Rm.append([[math.cos(a), 0, -math.sin(a)], [0, 1, 0], [math.sin(a), 0, math.cos(a)]])
        self.C = np.array(self.C)
        self.R = np.array(self.R)
        self.Rm = np.array(self.Rm)
        self.oid = (7000000 + np.arange(len(self.C))).astype(np.int32)
        self.var = r.rand(len(self.C)).astype(np.float32)

    def draw(self, g, cam, maxd=1500):
        s = np.linalg.norm(self.C - cam.eye, axis=1) < maxd
        if s.any():
            K.draw_ellipsoids(g, cam, self.C[s], self.R[s], ROCK, self.oid[s], self.var[s], Rm=self.Rm[s])
