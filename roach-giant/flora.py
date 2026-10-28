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
    """One tree in its own frame (y up, base at 0): segments, leaf clumps (each
    with a yaw, so sprays can lie along their branch) and, later, its leaves."""

    def __init__(self):
        self.A, self.B, self.r = [], [], []
        self.C, self.R, self.Y = [], [], []

    def seg(self, a, b, r):
        self.A.append(np.array(a, float))
        self.B.append(np.array(b, float))
        self.r.append(float(r))

    def clump(self, c, rx, ry=None, rz=None, yaw=0.0):
        self.C.append(np.array(c, float))
        self.R.append((rx, rx if ry is None else ry, rx if rz is None else rz))
        self.Y.append(float(yaw))

    def limb(self, p, d, L, r0, r1, n, rng, bend=0.0, up=0.0):
        """A wobbly branch of n segments; returns the end and its direction."""
        d = _unit(np.array(d, float))
        for k in range(n):
            d = _unit(d + rng.normal(0, bend, 3) + np.array([0, up, 0]))
            q = p + d * L / n
            self.seg(p, q, r0 + (r1 - r0) * (k + 0.5) / n)
            p = q
        return p, d

    def roots(self, r0, rng, n=5):
        """The trunk flaring into roots as it meets the ground."""
        for k in range(n):
            a = 2 * math.pi * k / n + rng.uniform(-0.3, 0.3)
            d = np.array([math.cos(a), -0.35, math.sin(a)])
            self.seg([0, r0 * 1.6, 0], d * r0 * 3.2 + [0, r0 * 1.6, 0], r0 * 0.55)

    def arrays(self):
        return (np.array(self.A).reshape(-1, 3), np.array(self.B).reshape(-1, 3), np.array(self.r),
                np.array(self.C).reshape(-1, 3), np.array(self.R).reshape(-1, 3), np.array(self.Y))


def grow(kind, H, seed):
    rng = np.random.RandomState(seed)
    s = Shape()
    if kind == 'sugi':
        r0 = 0.018 * H + 0.15
        top = np.array([rng.normal(0, 0.012 * H), H, rng.normal(0, 0.012 * H)])
        n = 8
        pts = [top * k / n + np.r_[rng.normal(0, 0.06, 1), 0, rng.normal(0, 0.06, 1)] * (0 < k < n) for k in range(n + 1)]
        for k in range(n):
            s.seg(pts[k], pts[k + 1], r0 * (1 - k / n) ** 0.8 + 0.04)
        s.roots(r0, rng)
        y = 0.22 * H
        while y < 0.97 * H:
            f = (y - 0.22 * H) / (0.75 * H)
            p = top * y / H
            L = (1 - f) ** 0.85 * 0.28 * H + 0.6
            for j in range(rng.randint(4, 7)):
                a = rng.uniform(0, 2 * math.pi)
                d = np.array([math.cos(a), -0.3 + 0.15 * rng.rand(), math.sin(a)])
                e, _ = s.limb(p, d, L, r0 * 0.2 * (1 - f) + 0.03, 0.03, 3, rng, 0.06, 0.1)
                for k in range(3):                                 # a drooping spray along the branch
                    u = 0.35 + 0.3 * k
                    c = p + (e - p) * u + [0, 0.08 * L - 0.12 * L * u * u, 0]
                    rr = (0.22 + 0.12 * (1 - u)) * L + 0.35
                    s.clump(c, rr, 0.38 * rr, 0.6 * rr, yaw=-a)
            y += H / rng.uniform(12, 15)
        for k in range(3):
            s.clump(top - [0, 0.5 + k * 0.9, 0], 0.7 + 0.015 * H, 1.1 + 0.02 * H, 0.7 + 0.015 * H)
    elif kind == 'keyaki':
        r0 = 0.03 * H + 0.12
        h0 = H * rng.uniform(0.26, 0.34)
        p, _ = s.limb(np.zeros(3), [0, 1, 0], h0, r0, r0 * 0.8, 3, rng, 0.03)
        s.roots(r0, rng)
        nl = rng.randint(4, 6)
        for j in range(nl):
            a = 2 * math.pi * j / nl + rng.normal(0, 0.3)
            tilt = rng.uniform(0.32, 0.58)
            d = np.array([math.sin(tilt) * math.cos(a), math.cos(tilt), math.sin(tilt) * math.sin(a)])
            e, d2 = s.limb(p, d, (H - h0) * rng.uniform(0.48, 0.62), r0 * 0.5, r0 * 0.22, 3, rng, 0.08, 0.04)
            for k in range(rng.randint(3, 5)):
                dd = _unit(d2 + _perp(d2, rng.uniform(0, 6.3)) * 0.9 + [0, 0.15, 0])
                e2, d3 = s.limb(e, dd, (H - h0) * rng.uniform(0.2, 0.32), r0 * 0.16, 0.05, 2, rng, 0.15)
                for m in range(rng.randint(2, 4)):                 # twigs, each ending in leaves
                    d4 = _unit(d3 + _perp(d3, rng.uniform(0, 6.3)) * 1.0)
                    e3, _ = s.limb(e2, d4, H * rng.uniform(0.05, 0.09), 0.05, 0.025, 1, rng, 0.2)
                    rr = H * rng.uniform(0.06, 0.085)
                    s.clump(e3 + [0, rr * 0.25, 0], rr, rr * 0.75, rr, yaw=rng.uniform(0, 6.3))
        for k in range(10):
            c = np.array([rng.normal(0, 0.14 * H), H * rng.uniform(0.6, 0.9), rng.normal(0, 0.14 * H)])
            s.clump(c, H * 0.08, H * 0.065, H * 0.08)
    elif kind == 'momiji':
        r0 = 0.03 * H + 0.08
        h0 = H * rng.uniform(0.2, 0.28)
        p, _ = s.limb(np.zeros(3), [rng.normal(0, 0.1), 1, rng.normal(0, 0.1)], h0, r0, r0 * 0.8, 2, rng, 0.05)
        s.roots(r0, rng, 4)
        for j in range(rng.randint(5, 8)):
            a = rng.uniform(0, 2 * math.pi)
            tilt = rng.uniform(0.75, 1.1)
            d = np.array([math.sin(tilt) * math.cos(a), math.cos(tilt), math.sin(tilt) * math.sin(a)])
            e, d2 = s.limb(p, d, H * rng.uniform(0.38, 0.55), r0 * 0.45, 0.04, 3, rng, 0.12, 0.08)
            for k in range(5):                                     # tiers of leaves along the limb
                rr = H * rng.uniform(0.08, 0.11)
                c = p + (e - p) * (0.3 + 0.17 * k) + [rng.normal(0, rr * 0.4), rr * 0.5 + 0.05 * H * k,
                                                       rng.normal(0, rr * 0.4)]
                s.clump(c, rr, rr * 0.5, rr, yaw=-a)
        for k in range(4):
            s.clump([rng.normal(0, 0.1 * H), H * rng.uniform(0.75, 0.9), rng.normal(0, 0.1 * H)], H * 0.12, H * 0.08,
                    H * 0.12)
    else:   # matsu
        r0 = 0.032 * H + 0.15
        lean = rng.uniform(0, 2 * math.pi)
        ld = np.array([math.cos(lean), 0, math.sin(lean)])
        pts = [np.zeros(3)]
        for k in range(1, 9):
            f = k / 8
            off = ld * (0.32 * H * math.sin(f * 2.4)) + _perp(np.array([0, 1.0, 0]), lean + 1.6) * 0.08 * H * \
                math.sin(f * 5.0)
            pts.append(np.array([0, f * H * 0.92, 0]) + off)
        for k in range(8):
            s.seg(pts[k], pts[k + 1], r0 * (1 - k / 9) ** 0.7 + 0.05)
        s.roots(r0, rng)
        for j in range(rng.randint(6, 9)):
            f = rng.uniform(0.35, 0.95)
            i0 = int(f * 8)
            p = pts[i0] + (pts[min(8, i0 + 1)] - pts[i0]) * (f * 8 % 1)
            a = rng.uniform(0, 2 * math.pi)
            d = np.array([math.cos(a), rng.uniform(-0.15, 0.25), math.sin(a)])
            L = H * rng.uniform(0.2, 0.42) * (1.25 - f * 0.6)
            e, d2 = s.limb(p, d, L, r0 * 0.3, 0.05, 3, rng, 0.18, -0.02)
            pr = H * rng.uniform(0.09, 0.13)                       # a flat cloud of needles, built of tufts
            for k in range(rng.randint(7, 12)):
                o = np.array([rng.normal(0, pr * 0.55), rng.normal(0.1, 0.08) * pr, rng.normal(0, pr * 0.55)])
                rr = pr * rng.uniform(0.35, 0.55)
                s.clump(e + o, rr, rr * 0.45, rr, yaw=rng.uniform(0, 6.3))
            for k in range(2):                                     # side twigs to the pad
                d3 = _unit(d2 + _perp(d2, rng.uniform(0, 6.3)) * 0.8)
                s.limb(e - d2 * L * 0.25, d3, pr * 0.8, 0.08, 0.04, 1, rng)
        top = pts[-1]
        pr = H * 0.12
        for k in range(8):
            rr = pr * rng.uniform(0.35, 0.55)
            s.clump(top + [rng.normal(0, pr * 0.5), pr * 0.15, rng.normal(0, pr * 0.5)], rr, rr * 0.45, rr,
                    yaw=rng.uniform(0, 6.3))
    return s.arrays()


LEAF_SIZE = dict(sugi=(0.55, (1.0, 0.18, 0.38)), keyaki=(0.42, (1.0, 0.1, 0.72)), momiji=(0.4, (1.0, 0.1, 0.9)),
                 matsu=(0.5, (1.0, 0.25, 0.32)))


def leaves(kind, C, R, Y, rng, density=1.0):
    """Leaves inside each clump: mostly near its surface, each turned its own
    way (outward, with a scatter), with how deep in the crown it sits."""
    s, shape = LEAF_SIZE[kind]
    P, Rm, sz, ao, cl = [], [], [], [], []
    centre = C.mean(0)
    crown = np.linalg.norm(C - centre, axis=1).max() + R.max()
    for i, (c, r, yaw) in enumerate(zip(C, R, Y)):
        area = 4 * (r[0] * r[2] + r[0] * r[1] + r[1] * r[2])
        n = int(np.clip(area / (s * s * 0.32) * density, 12, 160))
        d = rng.normal(size=(n, 3))
        d /= np.linalg.norm(d, axis=1, keepdims=True)
        rr = 0.55 + 0.45 * rng.rand(n) ** 0.5
        cy, sy = math.cos(yaw), math.sin(yaw)
        Ry = np.array([[cy, 0, -sy], [0, 1, 0], [sy, 0, cy]])
        loc = d * np.array(r) * rr[:, None]
        p = c + loc @ Ry.T
        nrm = _n_arr((d / np.array(r)) @ Ry.T + rng.normal(0, 0.55, (n, 3)) + np.array([0, 0.35, 0]))
        # an orthonormal frame per leaf, its thin axis along the normal
        t1 = _n_arr(np.cross(nrm, rng.normal(size=(n, 3))))
        t2 = np.cross(nrm, t1)
        Rm.append(np.stack([t1, nrm, t2], 2))
        P.append(p)
        sz.append(s * rng.uniform(0.75, 1.25, n))
        depth = np.linalg.norm(p - centre, axis=1) / crown
        ao.append(np.clip(0.3 + 0.75 * depth ** 1.3 + 0.15 * (rr - 0.75), 0.28, 1.0))
        cl.append(np.full(n, i))
    return (np.concatenate(P), np.concatenate(Rm), np.concatenate(sz), np.concatenate(ao), np.concatenate(cl),
            np.array(shape))


def _n_arr(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)


LEAF_COL = {   # alive leaf colours per species: (dark, mid, light) RGB
    'sugi': [(22, 46, 42), (32, 62, 52), (48, 82, 62)],
    'keyaki': [(36, 66, 38), (54, 92, 44), (82, 120, 54)],
    'momiji': [(150, 36, 30), (196, 74, 34), (222, 150, 52)],
    'matsu': [(26, 54, 40), (40, 74, 48), (62, 98, 58)],
}
LEAF_DEAD = [(70, 58, 48), (92, 76, 58), (112, 96, 72)]
LEAF_ASH = [(52, 50, 52), (70, 68, 68), (88, 86, 84)]
H0 = dict(sugi=28.0, keyaki=18.0, momiji=9.0, matsu=16.0)


def smooth(a, b, x):
    u = np.clip((x - a) / (b - a), 0, 1)
    return u * u * (3 - 2 * u)


class Trees:
    """All the trees of the valley. A handful of shapes per kind, grown once,
    scaled and turned for each tree; drawn three ways by how big they are on
    screen: leaf by leaf, clump by clump, or as a few clumps on a stick."""

    def __init__(self, land, spots, seed=1, n_shapes=10):
        self.land = land
        r = np.random.RandomState(seed)
        self.shapes = []
        key_of = {}
        for k, kind in enumerate(SPECIES):
            for j in range(n_shapes):
                a, b, rr, c, rc, yw = grow(kind, H0[kind], k * 7919 + j * 31 + 5)
                lv = leaves(kind, c, rc, yw, np.random.RandomState(k * 100 + j))
                big = np.argsort(-(rc[:, 0] * rc[:, 1] * rc[:, 2]))
                pick = big[:: max(1, len(big) // 9)][:9]
                centre = c.mean(0)
                crown = np.linalg.norm(c - centre, axis=1).max() + rc.max()
                cao = np.clip(0.38 + 0.7 * (np.linalg.norm(c - centre, axis=1) / crown) ** 1.2, 0.35, 1.0)
                key_of[(kind, j)] = len(self.shapes)
                self.shapes.append(dict(kind=kind, A=a, B=b, r=rr, C=c, R=rc, Y=yw, leaves=lv, imp=pick, cao=cao))
        n = len(spots)
        self.pos = np.zeros((n, 3))
        self.H = np.zeros(n)
        self.kind = np.zeros(n, int)
        self.shape = np.zeros(n, int)
        self.rot = r.uniform(0, 2 * math.pi, n)
        self.phase = r.uniform(0, 6.3, n)
        self.lag = r.uniform(0.2, 1.6, n)
        for i, (x, z, kind, Ht) in enumerate(spots):
            y = float(land.height(np.array([x]), np.array([z]))[0])
            self.pos[i] = (x, y - 0.3, z)
            self.H[i] = Ht
            self.kind[i] = SPECIES.index(kind)
            self.shape[i] = key_of[(kind, r.randint(n_shapes))]
        self.scale = self.H / np.array([H0[SPECIES[k]] for k in self.kind])
        # every clump and limb of every tree, placed (for the middle distance and the shadows)
        A, B, Rr, Ta, Hfa, C, Rc, Rm, Tc, Hfc, Cao, IC, IR, IRm, Ti = ([] for _ in range(15))
        for i in range(n):
            sh = self.shapes[self.shape[i]]
            Rot = self._rot(self.rot[i])
            s = self.scale[i]
            A.append(sh['A'] * s @ Rot.T + self.pos[i])
            B.append(sh['B'] * s @ Rot.T + self.pos[i])
            Rr.append(sh['r'] * s)
            Ta.append(np.full(len(sh['A']), i))
            Hfa.append(np.maximum(sh['B'][:, 1], 0) / H0[sh['kind']])
            C.append(sh['C'] * s @ Rot.T + self.pos[i])
            Rc.append(sh['R'] * s)
            Rm.append(np.einsum('ij,njk->nik', Rot, np.stack([self._rot(y) for y in sh['Y']])))
            Tc.append(np.full(len(sh['C']), i))
            Hfc.append(np.clip(sh['C'][:, 1] / H0[sh['kind']], 0, 1.2))
            Cao.append(sh['cao'])
            p = sh['imp']
            IC.append(sh['C'][p] * s @ Rot.T + self.pos[i])
            IR.append(sh['R'][p] * s * 1.45)
            IRm.append(np.einsum('ij,njk->nik', Rot, np.stack([self._rot(y) for y in sh['Y'][p]])))
            Ti.append(np.full(len(p), i))
        cat = np.concatenate
        self.A, self.B, self.Rr, self.Ta, self.Hfa = cat(A), cat(B), cat(Rr), cat(Ta), cat(Hfa)
        self.C, self.Rc, self.Rm, self.Tc, self.Hfc, self.Cao = cat(C), cat(Rc), cat(Rm), cat(Tc), cat(Hfc), cat(Cao)
        self.IC, self.IR, self.IRm, self.Ti = cat(IC), cat(IR), cat(IRm), cat(Ti)
        self.cvar = r.rand(len(self.C)).astype(np.float32)
        self.ivar = r.rand(len(self.IC)).astype(np.float32)
        self.n = n
        self.override = {}          # tree index -> fn(t) giving how dead it is
        self.tilt = None            # fn(t) -> per-tree lean (footstep shakes, the pine's fall), radians
        self.tilt_axis = np.stack([np.cos(self.rot + 1.0), np.zeros(n), np.sin(self.rot + 1.0)], 1)

    @staticmethod
    def _rot(a):
        ca, sa = math.cos(a), math.sin(a)
        return np.array([[ca, 0, -sa], [0, 1, 0], [sa, 0, ca]])

    def deadness(self, t, dead_at):
        d = np.zeros(self.n) if dead_at is None else np.clip(dead_at(self.pos[:, 0], self.pos[:, 2], t - self.lag),
                                                              0, 1)
        for i, fn in self.override.items():
            d[i] = fn(t)
        return d

    def _bend(self, P, ti, hf, sway, lean):
        """Wind sway (more toward the top), and any lean of the whole tree about its foot."""
        wdir = np.array([0.9, 0, 0.43])
        out = P + (sway[ti] * hf ** 2)[:, None] * wdir
        if lean is not None:
            L = lean[ti]
            if np.any(L != 0):
                rel = out - self.pos[ti]
                ax = self.tilt_axis[ti]
                c, s = np.cos(L)[:, None], np.sin(L)[:, None]
                rel = rel * c + np.cross(ax, rel) * s + ax * (ax * rel).sum(1, keepdims=True) * (1 - c)
                out = self.pos[ti] + rel
        return out

    def draw(self, g, cam, t, dead_at=None, shadow=False, wind=1.0, leaf_px=75, clump_px=22):
        d = np.linalg.norm(self.pos - cam.eye, axis=1)
        top = self.pos + np.c_[np.zeros(self.n), self.H * 0.6, np.zeros(self.n)]
        c = cam.to_cam(top)
        rad = self.H * 0.75
        vis = c[:, 2] > -rad
        zz = np.maximum(c[:, 2], 1e-3)
        vis &= np.abs(c[:, 0]) - rad < cam.W / 2 / cam.focal * zz + rad
        vis &= np.abs(c[:, 1]) - rad < cam.H / 2 / cam.focal * zz + rad
        px = self.H * cam.focal / np.maximum(d, 1)
        if shadow:
            mode = np.where(vis, 1, 0)
        else:
            mode = np.where(~vis, 0, np.where(px > leaf_px, 2, np.where(px > clump_px, 1, 3)))
        dead = self.deadness(t, dead_at)
        sway = wind * 0.012 * self.H * np.sin(t * 0.9 + self.phase) + wind * 0.006 * self.H * np.sin(t * 2.3 +
                                                                                                    self.phase * 2)
        lean = self.tilt(t) if self.tilt is not None else None
        # limbs of every tree drawn whole or in clumps
        ma = (mode[self.Ta] == 1) | (mode[self.Ta] == 2)
        if ma.any():
            ta = self.Ta[ma]
            hfa = self.Hfa[ma]
            K.draw_capsules(g, cam, self._bend(self.A[ma], ta, hfa * 0.8, sway, lean),
                            self._bend(self.B[ma], ta, hfa, sway, lean), self.Rr[ma], BARK,
                            (100000 + ta).astype(np.int32), self.kind[ta].astype(np.float32),
                            aux=dead[ta].astype(np.float32), widen=not shadow, ao=0.85)
        mc = mode[self.Tc] == 1
        if mc.any():
            tc = self.Tc[mc]
            leaf = np.clip(dead[tc] * 1.05 - 0.05, 0, 0.97) if not shadow else np.clip(dead[tc] - 0.2, 0, 0.97)
            K.draw_ellipsoids(g, cam, self._bend(self.C[mc], tc, self.Hfc[mc], sway, lean), self.Rc[mc], LEAF,
                              (100000 + tc).astype(np.int32), self.kind[tc] + self.cvar[mc] * 0.99,
                              leaf=leaf.astype(np.float32), aux=dead[tc].astype(np.float32), widen=not shadow,
                              Rm=self.Rm[mc], ao=self.Cao[mc].astype(np.float32))
        for i in np.where(mode == 2)[0]:                      # leaf by leaf
            sh = self.shapes[self.shape[i]]
            P, Rm, sz, ao, cl, shape = sh['leaves']
            s = self.scale[i]
            Rot = self._rot(self.rot[i])
            hsh = (np.arange(len(P)) * 2654435761 % 1000) / 1000.0
            keep = hsh >= dead[i] * 0.97
            if not keep.any():
                continue
            Pw = P[keep] * s @ Rot.T + self.pos[i]
            hf = np.clip(P[keep][:, 1] / H0[sh['kind']], 0, 1.2)
            flutter = 0.06 * np.sin(t * 5 + hsh[keep] * 40)[:, None] * np.array([1, 0.4, 0.7])
            Pw = self._bend(Pw, np.full(len(Pw), i), hf, sway, lean) + flutter
            Rw = np.einsum('ij,njk->nik', Rot, Rm[keep])
            rad = (sz[keep] * s ** 0.5)[:, None] * shape[None]
            K.draw_ellipsoids(g, cam, Pw, rad, LEAF, np.int32(100000 + i), self.kind[i] + hsh[keep] * 0.99, Rm=Rw,
                              aux=np.float32(dead[i]), ao=ao[keep].astype(np.float32))
        mi = mode[self.Ti] == 3
        if mi.any():
            ti = self.Ti[mi]
            K.draw_capsules(g, cam, self.pos[ti], self.pos[ti] + np.c_[0 * ti, self.H[ti] * 0.45, 0 * ti],
                            self.H[ti] * 0.02 + 0.1, BARK, (100000 + ti).astype(np.int32),
                            self.kind[ti].astype(np.float32), aux=dead[ti].astype(np.float32), ao=0.8)
            leaf = np.clip(dead[ti] * 1.05 - 0.05, 0, 0.97)
            K.draw_ellipsoids(g, cam, self._bend(self.IC[mi], ti, 0.6, sway, lean), self.IR[mi], LEAF,
                              (100000 + ti).astype(np.int32), self.kind[ti] + self.ivar[mi] * 0.99,
                              leaf=leaf.astype(np.float32), aux=dead[ti].astype(np.float32), Rm=self.IRm[mi], ao=0.8)
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


def grass(cam, land, meadow_fn, t, dead_fn=None, density=1.0, parted=None, short=None, height=None):
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
    y = land.height(x, z) if height is None else height(x, z)
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
