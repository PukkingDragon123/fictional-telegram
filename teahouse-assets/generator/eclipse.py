"""The eclipse: a total eclipse of the sun in the middle of the day.

    sky        dark blue overhead with the brightest stars and a planet out,
               and all round the horizon a sunset glow, orange to gold; the
               sun a black disc in a silver-white corona, its streamers
               reaching out along the equator and fine rays round it, pink
               prominences at the edge and the diamond ring flashing on one
               side
    clouds     thin wisps, dark above and lit orange underneath by the glow
    the land   the summer garden in the strange light of totality: dark,
               blue, and against the glowing horizon the ranges and the far
               shore stand as silhouettes with a warm edge
    lake       the corona and the horizon glow in the water
    life       starlings swirling home to roost, crows crossing; the fish
               still

all_layers() returns the same layers as outside.all_layers()."""
import math
import random
import numpy as np
from pixel import Canvas, PAL
from layout import H
import bloodmoon as BM

OUT_W = 1280
HORIZON = 150
SUN_X, SUN_Y, SUN_R = BM.MOON_X, BM.MOON_Y + 2, 15         # where the moon is on the blood moon night: clear of the trees
SKY_SET = ['gloss0', 'gloss1', 'indigo0', 'indigo1', 'gloss2', 'indigo2', 'purp0', 'purp1', 'lilac1', 'pink1',
           'copper2', 'copper3', 'fire3', 'fire4', 'gold3', 'gold4', 'scarlet3']
CORONA = ['indigo2', 'indigo3', 'indigo4', 'haze3', 'cloud2', 'cloud3']


def sky():
    cv = Canvas(OUT_W, H, wrap=True)
    yy, xx = np.mgrid[0:H, 0:OUT_W]
    # dark overhead, the glow all round the horizon: indigo, violet, rose, orange, gold at the line
    stops = [0, 40, 70, 90, 102, 112, 124, 150, H]                # the glow rises just above the ridges
    cols = np.array([[14, 16, 40], [22, 28, 62], [40, 44, 92], [92, 70, 126], [176, 100, 100], [226, 140, 70],
                     [242, 186, 98], [246, 206, 120], [246, 206, 120]], float)
    rgb = np.stack([np.interp(yy, stops, cols[:, c]) for c in range(3)], -1)
    dx = (xx - SUN_X + OUT_W / 2) % OUT_W - OUT_W / 2
    dy = yy - SUN_Y
    r = np.hypot(dx, dy)
    ang = np.arctan2(dy, dx)
    # the corona: bright close in, streamers along a tilted equator, fine rays all round
    tilt = 0.35
    streamer = np.abs(np.cos(ang - tilt)) ** 4 + 0.35 * np.abs(np.cos(ang - tilt - 1.3)) ** 10
    rays = 0.5 + 0.5 * np.sin(ang * 26) * np.sin(ang * 9 + 1.3)
    fall = np.exp(-np.maximum(r - SUN_R, 0) / (6.0 + 24 * streamer))
    corona = np.clip(fall * (0.7 + 0.3 * rays) * 1.15 * (r >= SUN_R), 0, 1)
    glow = np.exp(-np.maximum(r - SUN_R, 0) / 46.0) * 0.5
    rgb = rgb + (glow * 40)[..., None] * np.array([0.6, 0.7, 1.0])
    pal = np.array([PAL[c] for c in CORONA], float)
    cval = np.clip(corona * (len(CORONA) - 0.01) + BM.BAYER[yy % 4, xx % 4] * 0.6, 0, len(CORONA) - 0.01)
    lit = corona > 0.12
    base = BM._quant(rgb, SKY_SET, 12.0, yy, xx)
    cv.a[..., :3] = base
    cv.a[..., 3] = 255
    cv.a[lit, :3] = pal[cval[lit].astype(int)].astype(np.uint8)
    # stars and a bright planet in the dark part of the sky
    rng = random.Random(61)
    for _ in range(70):
        x, y = rng.randrange(OUT_W), int(80 * rng.random() ** 1.3)
        if r[y, x] < 70:
            continue
        cv.px(x, y, 'cloud2' if rng.random() < 0.6 else 'indigo4')
    vx, vy = SUN_X + 150, SUN_Y + 34                               # Venus, low and bright beside the sun
    cv.px(vx, vy, 'white')
    for ddx, ddy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        cv.px(vx + ddx, vy + ddy, 'haze3')
    _sun(cv)
    return cv


def _sun(cv):
    """The moon's black disc over the sun, a thin bright edge, pink prominences and
    the diamond ring."""
    R = SUN_R
    for y in range(-R - 2, R + 3):
        for x in range(-R - 2, R + 3):
            d = math.hypot(x + 0.5, y + 0.5)
            X, Y = SUN_X + x, SUN_Y + y
            if d <= R:
                cv.px(X, Y, 'gloss0' if d < R - 1 else 'ink')
            elif d <= R + 1:
                cv.px(X, Y, 'white' if (x + y) % 3 else 'cloud3')          # the chromosphere, a hair-thin ring
    for ang, n in ((2.4, 3), (4.1, 2), (5.5, 4), (0.9, 2)):                # prominences, little pink flames
        for k in range(n):
            a = ang + (k - n / 2) * 0.05
            for rr in range(R + 1, R + 2 + k % 2 + 1):
                cv.px(int(SUN_X + math.cos(a) * rr), int(SUN_Y + math.sin(a) * rr), 'pink3' if rr < R + 2 else 'scarlet3')
    ang = -2.2                                                              # the diamond ring
    bx, by = int(SUN_X + math.cos(ang) * (R + 1)), int(SUN_Y + math.sin(ang) * (R + 1))
    for k in range(-6, 7):
        c = 'white' if abs(k) < 3 else ('cloud3' if abs(k) < 5 else 'haze3')
        cv.px(bx + k, by, c)
        cv.px(bx, by + k, c)
    for k in range(-3, 4):
        cv.px(bx + k, by + k, 'cloud2' if abs(k) > 1 else 'white')
        cv.px(bx + k, by - k, 'cloud2' if abs(k) > 1 else 'white')
    for ddx in (-1, 0, 1):
        for ddy in (-1, 0, 1):
            cv.px(bx + ddx, by + ddy, 'white')


def clouds():
    """Thin wisps across the glow: dark on top, lit orange underneath."""
    cv = Canvas(OUT_W, H, wrap=True)
    rng = random.Random(62)
    for (cx, cy, ln, th) in ((150, 118, 300, 3), (520, 128, 260, 2.5), (860, 112, 380, 3.5), (1150, 124, 240, 2.5),
                             (700, 70, 300, 2), (40, 60, 220, 2)):
        ph = rng.uniform(0, 6.3)
        for i in range(int(ln)):
            u = i / ln
            x = int(cx - ln / 2 + i)
            half = th * math.sin(math.pi * u) ** 0.6 * (0.7 + 0.3 * math.sin(i * 0.11 + ph))
            if half < 0.6:
                continue
            y0 = int(round(cy - half * 0.5 + 1.2 * math.sin(i * 0.03 + ph)))
            y1 = int(round(cy + half * 0.5 + 1.2 * math.sin(i * 0.03 + ph)))
            low = cy > 100
            for y in range(y0, y1 + 1):
                if y == y1:
                    c = 'fire3' if low else 'pink1'
                elif y == y0:
                    c = 'indigo1' if low else 'gloss2'
                else:
                    c = 'purp1' if low else 'indigo1'
                cv.px(x, y, c)
    return cv


# totality: everything blue and dark, warm things a dull copper
FAMILY = dict(BM.FAMILY, red='red', scarlet='red', fire='red', pink='red')
RAMPS_ = dict(night=['gloss0', 'gloss1', 'indigo1', 'gloss2', 'indigo2', 'indigo3'],
              nleaf=['gloss0', 'nleaf0', 'nleaf1', 'nleaf2', 'nleaf3', 'indigo3'],
              pale=['indigo1', 'indigo2', 'indigo3', 'indigo4', 'fgrey4', 'cloud2'],
              rose=['purp0', 'purp1', 'pink1', 'pink2', 'pink3'],
              red=['red0', 'red1', 'red2', 'pink1', 'pink2', 'pink3'],
              blood=['red0', 'red1', 'red2', 'pink1', 'pink2', 'pink3'],
              dusk=['ink', 'bark0', 'wood1', 'bark1', 'copper1', 'copper2'])
FAR = BM.scheme(FAMILY, RAMPS_, sink=('night', 'nleaf'), sink_pow=1.25, rim='copper2', rim2='copper1',
                fallback=((0.3, 0.32, 0.5), (8, 10, 30)))
NEAR = BM.scheme(FAMILY, RAMPS_, sink=('night', 'nleaf'), sink_pow=1.15, rim='indigo3', rim2=None,
                 fallback=((0.3, 0.32, 0.5), (8, 10, 30)))


def mountains():
    import outside
    return BM.grade(BM._as_summer(outside.mountains), look=FAR)


def hills():
    import outside
    return BM.grade(BM._as_summer(outside.hills), look=FAR)


def trees():
    import outside
    import grove
    keep = grove.garden_life
    grove.garden_life = lambda frames, rng, ground: frames      # the butterflies have gone to ground
    try:
        frames = BM._as_summer(outside.trees)
    finally:
        grove.garden_life = keep
    return BM.grade_frames(frames, look=NEAR)


def flowers_close():
    import outside
    return BM.grade_frames(BM._as_summer(outside.flowers_close), look=NEAR)


def all_layers():
    import lake
    import life
    sk, cl, mt = sky(), clouds(), mountains()
    above = sk.a.copy()
    for L in (cl, mt):
        m = L.a[..., 3] > 0
        above[m] = L.a[m]
    above = np.roll(above, BM.GLADE_SHIFT, 1)                      # the corona's reflection under the sun
    water = []
    for arr in lake.lake_frames(above, HORIZON, OUT_W, H, 'eclipse'):
        c = Canvas(OUT_W, H)
        c.a = arr
        water.append(c)

    def crop_layer(arrs):
        out = []
        for arr in arrs:
            c = Canvas(arr.shape[1], arr.shape[0])
            c.a = arr
            out.append(c)
        return out
    fish, (fx, fy) = life.lake('eclipse')
    birds, (bx_, by_) = life.birds('eclipse')
    return [
        ('00_sky', [sk], 0.04),
        ('01_clouds', [cl], 0.08),
        ('02_mountains', [mt], 0.12),
        ('03_lake', water, 0.12),
        ('04_lake_life', crop_layer(fish), 0.12, (fx, fy)),
        ('04_birds', crop_layer(birds), 0.14, (bx_, by_)),
        ('05_hills_trees', [hills()], 0.22),
        ('06_garden_trees', trees(), 0.34),
        ('07_flowers_close', flowers_close(), 0.62),
    ]
