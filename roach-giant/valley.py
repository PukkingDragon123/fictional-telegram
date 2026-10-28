"""The valley assembled: the world, its trees, flowers, stones and grass, and
the masks that say where each kind of ground is."""
import numpy as np

import flora as FL
import hd2d as K
import world as WD
from terrain import lake_e, WATER


class Valley:
    def __init__(self, F, path, flower_spots=()):
        self.F = np.asarray(F, float)
        self.world = W = WD.World()
        self.land = W.land
        self.trees = FL.Trees(self.land, FL.place_trees(self.land, self.F, path))
        self.flowers = FL.Flowers(self.land, self.meadow, self.F, spots=flower_spots)
        self.rocks = FL.Rocks(self.land, self.meadow, self.F)
        W.extra.append(self._draw)
        W.shadows(statics=[self._shadow_static])

    # where things are
    def woods(self, x, z):
        return FL.forest_mask(x, z)

    def near_forest(self, x, z):
        return np.hypot(x - self.F[0], z - self.F[2]) < 3300

    def meadow(self, x, z):
        inval = ((x / 2600) ** 2 + ((z - 1000) / 2050) ** 2) < 1.0
        return inval & ~FL.forest_mask(x, z) & (lake_e(x, z) > 1.55)

    def ctx(self, dead=None, dead_t=None):
        c = dict(woods=self.woods, near_forest=self.near_forest)
        if dead is not None:
            c['dead'] = dead
            c['dead_t'] = dead_t
        return c

    def _shadow_static(self, g, cam):
        self.trees.draw(g, cam, 0.0, shadow=True)
        self.rocks.draw(g, cam, maxd=1e9)

    def _draw(self, g, cam, t, ctx, mirror):
        dead_t = ctx.get('dead_t')
        dead = ctx.get('dead')
        if mirror:
            return
        self.trees.draw(g, cam, t, dead_t)
        self.rocks.draw(g, cam)
        self.flowers.draw(g, cam, t, dead)
        FL.draw_grass(g, cam, FL.grass(cam, self.land, self.meadow, t, dead, short=self.short))

    def short(self, x, z):
        d = np.hypot(x - self.F[0], z - self.F[2])
        return 0.3 + 0.7 * np.clip((d - 6) / 30, 0, 1)
