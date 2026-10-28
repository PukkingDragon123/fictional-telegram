"""The valley assembled: the 3D land and its trees, stones and grass blades,
with the teahouse pack's own pixel-art flowers and pampas standing in it as
billboards; and the masks that say where each kind of ground is."""
import math

import numpy as np

import flora as FL
import sprites2d as S2
import world as WD
from terrain import lake_e, in_paddies, dike_dist, dike_x, dike_z, PADDY, PLOT_W, PLOT_D, WATER
import hd2d as K

DIKE_R = 0.55
# the pack flower sprites for each kind of flower patch (indices into the atlas's flowers)
FLOWER_SPRITES = {0: (0, 1, 2), 1: (3,), 2: (4, 5, 6)}


class Valley:
    def __init__(self, F, path, flower_spots=(), bare=None, bare_r=1.6):
        self.F = np.asarray(F, float)
        self.bare = bare
        self.bare_r = bare_r
        self.world = W = WD.World()
        self.land = W.land
        self.atlas = S2.make_atlas(S2.build())
        r = np.random.RandomState(2)
        self.trees = FL.Trees(self.land, FL.place_trees(self.land, self.F, path))
        self.pine_index = self.trees.n - 1
        # the meadow's own plants from the pack: flowers in patches, pampas in stands
        fl = FL.Flowers(self.land, self.meadow, self.F, spots=flower_spots)
        fk = np.array([r.choice(FLOWER_SPRITES[k]) for k in fl.kind])
        Pf = np.stack([fl.x, fl.y - 0.03, fl.z], 1)
        self.flowers = S2.Billboards(self.atlas, 'flowers', Pf, fl.h * 1.2, np.array(self.atlas.texh_flowers)[fk], fk,
                                     r.rand(len(Pf)), 6000000, period=2.6)
        cx = self.F[0] + r.uniform(-800, 800, 160)
        cz = self.F[2] + r.uniform(-700, 400, 160)
        Xs = np.concatenate([c + r.normal(0, 4, 14) for c in cx])
        Zs = np.concatenate([c + r.normal(0, 4, 14) for c in cz])
        ok = self.meadow(Xs, Zs) & (np.hypot(Xs - self.F[0], Zs - self.F[2]) > 30)
        Xs, Zs = Xs[ok], Zs[ok]
        sk = r.randint(0, len(self.atlas.texh_susuki), len(Xs))
        Ps = np.stack([Xs, self.land.height(Xs, Zs) - 0.02, Zs], 1)
        self.susuki = S2.Billboards(self.atlas, 'susuki', Ps, r.uniform(1.1, 1.7, len(Xs)),
                                    np.array(self.atlas.texh_susuki)[sk], sk, r.rand(len(Xs)), 6800000, period=3.0)
        self.rocks = FL.Rocks(self.land, self.meadow, self.F)
        self._dikes()
        W.extra.append(self._draw)
        W.shadows(statics=[self._shadow_static])

    # where things are
    def woods(self, x, z):
        return FL.forest_mask(x, z)

    def near_forest(self, x, z):
        return np.hypot(x - self.F[0], z - self.F[2]) < 3300

    def meadow(self, x, z):
        inval = ((x / 2600) ** 2 + ((z - 1000) / 2050) ** 2) < 1.0
        ok = inval & ~FL.forest_mask(x, z) & (lake_e(x, z) > 1.55)
        ok &= ~(in_paddies(x, z, 3.0) & (dike_dist(x, z) > 0.45))          # in the rice fields: only on the dikes
        if self.bare is not None:                                            # trodden bare where the first roach sits
            ok &= np.hypot(x - self.bare[0], z - self.bare[2]) > self.bare_r
        return ok

    def ground_y(self, x, z):
        """The ground's height, with the dikes' rounded tops in the rice fields."""
        y = self.land.height(x, z)
        d = dike_dist(x, z)
        on = in_paddies(x, z, 3.0) & (d < DIKE_R)
        return np.where(on, WATER - 0.1 + np.sqrt(np.clip(DIKE_R ** 2 - d * d, 0, None)), y)

    def _dikes(self):
        """The earth banks between the fields: long rounded ridges."""
        x0, x1, z0, z1 = PADDY
        A, B = [], []
        for i in range(int((x1 - x0) / PLOT_W) + 1):
            zs = np.arange(z0, z1 + 0.1, 4.0)
            xs = dike_x(i, zs)
            P = np.stack([xs, np.full(len(zs), WATER - 0.1), zs], 1)
            A.append(P[:-1])
            B.append(P[1:])
        for j in range(int((z1 - z0) / PLOT_D) + 1):
            xs = np.arange(x0, x1 + 0.1, 4.0)
            zs = dike_z(j, xs)
            P = np.stack([xs, np.full(len(xs), WATER - 0.1), zs], 1)
            A.append(P[:-1])
            B.append(P[1:])
        self.dA = np.concatenate(A)
        self.dB = np.concatenate(B)
        self.dvar = np.random.RandomState(4).rand(len(self.dA)).astype(np.float32)

    def ctx(self, dead=None, dead_t=None):
        c = dict(woods=self.woods, near_forest=self.near_forest)
        if dead is not None:
            c['dead'] = dead
            c['dead_t'] = dead_t
        return c

    def _shadow_static(self, g, cam):
        self.trees.draw(g, cam, 0.0, shadow=True)
        self.rocks.draw(g, cam, maxd=1e9)

    def rice(self, g, cam, t, dead=None, maxd=42.0):
        """Young rice in rows, clump by clump, round the camera."""
        e = cam.eye
        x0, x1, z0, z1 = PADDY
        i0 = int(max(0, (e[0] - maxd - x0) / 0.6))
        i1 = int(min((x1 - x0) / 0.6, (e[0] + maxd - x0) / 0.6))
        j0 = int(max(0, (e[2] - maxd - z0) / 0.45))
        j1 = int(min((z1 - z0) / 0.45, (e[2] + maxd - z0) / 0.45))
        if i1 <= i0 or j1 <= j0:
            return
        I, J = np.meshgrid(np.arange(i0, i1), np.arange(j0, j1))
        x = x0 + (I.ravel() + 0.5) * 0.6
        z = z0 + (J.ravel() + 0.5) * 0.45
        dx, dz = x - e[0], z - e[2]
        d = np.sqrt(dx * dx + dz * dz + (e[1] - WATER) ** 2)
        f = cam.R[2]
        ok = (d < maxd) & (dx * f[0] + dz * f[2] > -1.5) & (dike_dist(x, z) > 0.8)
        x, z, d = x[ok], z[ok], d[ok]
        if not len(x):
            return
        dd = dead(x, z) if dead is not None else np.zeros(len(x))
        nb = np.where(d < 10, 5, np.where(d < 22, 3, 1))
        rep = np.repeat(np.arange(len(x)), nb)
        k = np.concatenate([np.arange(n) for n in nb])
        h = (0.32 + 0.12 * ((x * 7.3 + z * 3.1) % 1))[rep]
        a = (k / np.maximum(nb[rep], 1)) * 2 * math.pi + x[rep] * 1.7
        spread = np.where(nb[rep] > 1, 0.12, 0.0)
        sway = 0.04 * np.sin(t * 1.8 + x[rep] * 0.4)
        droop = dd[rep]
        A = np.stack([x[rep], np.full(len(rep), WATER - 0.12), z[rep]], 1)
        tip = A + np.stack([np.cos(a) * spread * h * (1 + 2 * droop) + sway, h * (1 - 0.6 * droop),
                            np.sin(a) * spread * h * (1 + 2 * droop)], 1)
        n = len(A)
        K.draw_capsules(g, cam, A, tip, np.where(nb[rep] > 1, 0.006, 0.012), WD.GRASS, np.full(n, 5100000, np.int32),
                        np.zeros(n, np.float32), np.full(n, 0.25), np.ones(n), aux=droop.astype(np.float32))

    def _draw(self, g, cam, t, ctx, mirror):
        if mirror:
            return
        dead = ctx.get('dead')
        self.trees.draw(g, cam, t, ctx.get('dead_t'))
        self.rocks.draw(g, cam)
        near = np.linalg.norm((self.dA + self.dB) / 2 - cam.eye, axis=1) < 2500
        if near.any():
            dv = dead(*(((self.dA + self.dB) / 2)[near][:, [0, 2]].T)) if dead is not None else 0.0
            K.draw_capsules(g, cam, self.dA[near], self.dB[near], DIKE_R, WD.DIKE, np.int32(5200000), self.dvar[near],
                            aux=np.asarray(dv, np.float32), ao=0.9)
        self.rice(g, cam, t, dead)
        near = 160.0
        for bb in (self.flowers, self.susuki):
            sel = np.abs(bb.P[:, 0] - cam.eye[0]) + np.abs(bb.P[:, 2] - cam.eye[2]) < near * 1.5
            dd = None
            if dead is not None:
                dd = np.zeros(bb.n)
                dd[sel] = dead(bb.P[sel, 0], bb.P[sel, 2])
            bb.draw(g, cam, t, dead=dd, maxd=near, sel=sel)
        FL.draw_grass(g, cam, FL.grass(cam, self.land, self.meadow, t, dead, short=self.short, density=0.85,
                                       height=self.ground_y))

    def short(self, x, z):
        d = np.hypot(x - self.F[0], z - self.F[2])
        return 0.3 + 0.7 * np.clip((d - 6) / 30, 0, 1)
