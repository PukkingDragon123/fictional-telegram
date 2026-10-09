"""Weathering: makes a finished sprite look old. Deterministic per seed.

  - grime gathers in creases and along edges
  - lacquer and paint wear through to bare wood on the edges; gold tarnishes
  - scratches and scuffs
  - water stains with a darker tide line

Only used on static furniture and wooden or metal things (never on
teaware, plants, food or characters). All colours stay in the palette:
it only steps colours along their ramps or swaps in palette colours."""
import random
import numpy as np
from pixel import PAL, LOOKUP, step

WORN = {
    # room 1
    'apothecary_chest', 'recipe_board', 'drying_pole', 'cutting_board_leaves', 'balance_scale', 'bucket_water',
    'firewood', 'tsubo_jar', 'basket_fresh_leaves', 'basket_dried_flowers', 'sack_big',
    # room 2
    'menu_tags', 'pendulum_clock', 'curtain_rod',
    # room 3
    'corkboard', 'kakejiku_scroll', 'glazed_cabinet', 'teaware_shelf', 'tea_runner', 'daruma_doll',
    'tin_gold_band', 'honey_pot',
    # room 4
    'bookshelf', 'desk_messy', 'straw_kasa_hat',
}
PAINTED = ('red', 'jade', 'indigo', 'teal')
WOODY = ('wood', 'hinoki', 'red', 'jade', 'paper', 'teal', 'indigo', 'copper', 'gold', 'stone')


def _ramp_of(rgb):
    r = LOOKUP.get(tuple(int(v) for v in rgb[:3]))
    return r[0] if r else None


def age(cv, seed=0, amount=1.0):
    rng = random.Random(seed)
    a = cv.a
    h, w = a.shape[:2]
    solid = a[:, :, 3] == 255
    if not solid.any():
        return cv
    edge = np.zeros_like(solid)                     # within 1 px of the silhouette or an outline
    dark = solid & (a[:, :, :3].sum(axis=2) < 110)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nb = np.roll(np.roll(solid & ~dark, dy, 0), dx, 1)
        edge |= solid & ~dark & ~nb
    edge2 = edge.copy()                             # 2 px band
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        edge2 |= np.roll(np.roll(edge, dy, 0), dx, 1) & solid & ~dark
    out = a.copy()
    ys, xs = np.nonzero(edge2 & ~dark)
    for y, x in zip(ys, xs):
        ramp = _ramp_of(a[y, x])
        if ramp is None or ramp not in WOODY:
            continue
        r = rng.random()
        if ramp in PAINTED and r < 0.22 * amount and edge[y, x]:
            out[y, x, :3] = PAL['wood2'] if ramp != 'indigo' else PAL['indigo1']   # worn through
        elif ramp == 'gold' and r < 0.35 * amount:
            out[y, x, :3] = step(tuple(a[y, x, :3]), -1)                          # tarnish
        elif r < 0.3 * amount:
            out[y, x, :3] = step(tuple(a[y, x, :3]), -1)                          # grime
    area = int(solid.sum())
    for _ in range(int(area / 160 * amount)):       # scratches
        x, y = rng.randrange(w), rng.randrange(h)
        ln = rng.randint(2, 6)
        dx = rng.choice((1, 1, 1, 0))
        for k in range(ln):
            X, Y = x + k * dx, y + (k if dx == 0 else (k // 3) * rng.choice((0, 1)))
            if 0 <= X < w and 0 <= Y < h and solid[Y, X] and not dark[Y, X]:
                if _ramp_of(a[Y, X]) in WOODY:
                    out[Y, X, :3] = step(tuple(out[Y, X, :3]), 1)
    for _ in range(max(0, int(area / 1400 * amount))):   # water stains
        cx, cy = rng.randrange(w), rng.randrange(h)
        rx, ry = rng.uniform(3, 9), rng.uniform(2, 6)
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if not (0 <= x < w and 0 <= y < h) or not solid[y, x] or dark[y, x]:
                    continue
                if _ramp_of(a[y, x]) not in WOODY:
                    continue
                d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
                if 0.75 < d <= 1:
                    out[y, x, :3] = step(tuple(out[y, x, :3]), -1)
                elif d <= 0.75 and (x + y) % 2 == 0:
                    out[y, x, :3] = step(tuple(out[y, x, :3]), -1)
    cv.a = out
    return cv
