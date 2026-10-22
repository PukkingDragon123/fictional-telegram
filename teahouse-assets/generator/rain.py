"""The rainy season (tsuyu): early summer under a low grey sky, raining.

    sky        an even overcast, darker overhead and pale toward the horizon,
               with soft cloud texture
    clouds     low heavy banks, darker underneath, with grey curtains of rain
               hanging from them
    mountains  half lost in the weather: washed grey, a band of mist across
               them, and rain curtains drawn over the far range
    the land   the summer garden soaked: leaves a shade deeper, rain glinting
               on them, hydrangeas out in blue and purple, mist lying along
               the far shore
    lake       grey-green, mirroring the cloud, pocked with rain rings
    rain       streaks falling at a slant, near ones longer and brighter,
               splashing in the flower bed (08_rain, 12 fps)
    life       swallows skimming low, a grey heron, ducks out in it

all_layers() returns the same layers as outside.all_layers()."""
import math
import random
import numpy as np
from pixel import Canvas, PAL, RAMPS, LOOKUP
from layout import H
import bloodmoon as BM

OUT_W = 1280
HORIZON = 150
SKY_SET = ['smoke0', 'smoke1', 'smoke2', 'fgrey1', 'fgrey2', 'fgrey3', 'stone2', 'stone3', 'cloud0', 'cloud1',
           'haze1', 'haze2', 'fgrey4']
FOG = np.array([166, 172, 188], float)                      # the colour of the mist and the far rain


def _soft(xx, yy, s):
    """Soft cloud texture that wraps round the tile, about -2.4..2.4."""
    k = 2 * math.pi / OUT_W
    return (np.sin(xx * k * 7 + yy * 0.05 + s) + 0.7 * np.sin(xx * k * 17 - yy * 0.08 + 2 * s)
            + 0.45 * np.sin(xx * k * 41 + yy * 0.13 + 3 * s) + 0.3 * np.sin(xx * k * 89 - yy * 0.21 + s))


def sky():
    cv = Canvas(OUT_W, H, wrap=True)
    yy, xx = np.mgrid[0:H, 0:OUT_W]
    stops = [0, 40, 95, 135, 150, H]
    cols = np.array([[70, 76, 92], [86, 92, 108], [112, 118, 134], [146, 152, 168], [162, 168, 182],
                     [162, 168, 182]], float)
    rgb = np.stack([np.interp(yy, stops, cols[:, c]) for c in range(3)], -1)
    rgb += (_soft(xx, yy, 1.3) * 7 * np.clip(1 - yy / 170.0, 0.2, 1))[..., None]
    cv.a[..., :3] = BM._quant(rgb, SKY_SET, 12.0, yy, xx)
    cv.a[..., 3] = 255
    return cv


def clouds():
    """Low rain cloud: dark ragged scud drifting under the overcast, soft-edged,
    with grey curtains of rain hanging from the heavier pieces."""
    cv = Canvas(OUT_W, H, wrap=True)
    rng = random.Random(91)
    a = cv.a
    yy, xx = np.mgrid[0:H, 0:OUT_W]
    k = 2 * math.pi / OUT_W
    for (cx, cy, w, h, curtain) in ((140, 58, 420, 13, True), (600, 44, 340, 10, False), (930, 70, 460, 15, True),
                                    (1210, 52, 280, 9, False), (380, 86, 320, 8, True), (760, 96, 380, 7, False)):
        dx = (xx - cx + OUT_W / 2) % OUT_W - OUT_W / 2
        across = np.clip(1 - (dx / (w / 2)) ** 2, 0, 1)
        thick = h * across ** 0.5 * (0.7 + 0.3 * np.sin(xx * k * 23 + cx) + 0.25 * np.sin(xx * k * 61 + cx * 2))
        body = 1 - np.abs(yy - cy - np.sin(xx * k * 9 + cx) * 3) / np.maximum(thick, 0.1)
        dens = np.clip(body, 0, 1) + _soft(xx, yy, cx * 0.02) * 0.12
        m = dens + BM.BAYER[yy % 4, xx % 4] * 0.5 > 0.35
        dark = np.where(dens > 0.75, 'smoke1', np.where(dens > 0.5, 'smoke2', 'fgrey2'))
        for c in ('fgrey2', 'smoke2', 'smoke1'):
            a[m & (dark == c)] = (*PAL[c], 255)
        if curtain:                                                  # rain hanging from it
            for c in range(int(cx - w * 0.35), int(cx + w * 0.35)):
                cc = c % OUT_W
                y0 = int(cy + h * 0.6)
                ln = int(30 + 22 * math.sin(c * 0.05 + cx) ** 2)
                for y in range(y0, min(H, y0 + ln)):
                    u = (y - y0) / ln
                    if ((c + int(y * 0.3)) % 3 == 0) and rng.random() > u * 0.95:
                        a[y, cc] = (*PAL['fgrey2' if u < 0.5 else 'fgrey3'], 255)
    return cv


def _range(cv, prof, cols, mist_from, mist_to, shade=True):
    """One range of mountains in the rain: a flat tone, a touch lighter on the slopes
    that face the light, its foot dissolving into the mist."""
    a = cv.a
    yy, xx = np.mgrid[0:H, 0:OUT_W]
    top = np.round(prof).astype(int)
    m = yy >= top[None, :]
    slope = np.gradient(prof)
    v = np.where(slope[None, :] < -0.25, 1, 0) * shade + np.where(yy - top[None, :] < 2, 1, 0)
    rgb = np.array([PAL[c] for c in cols], float)[np.clip(v, 0, len(cols) - 1)]
    t = np.clip((yy - mist_from) / max(1.0, mist_to - mist_from), 0, 1) ** 1.2
    rgb = rgb * (1 - t[..., None] * 0.9) + FOG * t[..., None] * 0.9
    sel = m & (yy < HORIZON + 2)
    ys, xs = np.nonzero(sel)
    a[ys, xs, :3] = BM._quant(rgb[ys, xs], SKY_SET + ['jade0', 'leaf1', 'jade1', 'teal1'], 10.0, ys, xs)
    a[ys, xs, 3] = 255


def mountains():
    """Three ranges, each paler with distance, their feet lost in the mist, and the
    rain drawn across the far one."""
    import outside
    cv = Canvas(OUT_W, H, wrap=True)
    rng = random.Random(21)                                          # the same ridges as the other seasons
    far = outside._ridge(rng, 122, 40, [(2, 10), (5, 6), (9, 3.5), (19, 1.6), (37, 0.7), (71, 0.3)])
    mid = outside._ridge(rng, 134, 22, [(3, 7), (6, 5), (11, 3), (23, 1.2), (47, 0.5)])
    near = outside._ridge(rng, 146, 10, [(4, 6), (9, 4), (17, 2), (41, 0.8)])
    _range(cv, far, ['fgrey3', 'cloud0', 'fgrey4'], far.min() + 14, 134)
    _range(cv, mid, ['fgrey2', 'smoke2', 'fgrey3'], mid.min() + 8, 146)
    _range(cv, near - np.abs(np.sin(np.arange(OUT_W) * 0.9)) * 1.5, ['teal1', 'jade1', 'teal2'], near.min() + 2,
           HORIZON + 2, shade=False)
    yy, xx = np.mgrid[0:H, 0:OUT_W]
    curt = np.zeros((H, OUT_W))
    for c0 in (150, 470, 820, 1100):
        across = np.clip(1 - np.abs(((xx - c0 + OUT_W / 2) % OUT_W) - OUT_W / 2) / 70.0, 0, 1)
        streak = ((xx + (yy * 0.3).astype(int)) % 3 == 0) * 0.3
        curt = np.maximum(curt, across * streak * np.clip((yy - 80) / 30.0, 0, 1))
    return fog(cv, curt)


# what the weather does to the colours: washed toward grey, greens deeper and wet
FAMILY = dict(leaf='green', jade='green', alien='green', teal='green',
              sky='grey', haze='grey', water='grey', indigo='grey', gloss='grey', pong='grey', smoke='grey',
              stone='grey', fgrey='grey', purp='grey', lilac='grey', ink='grey', cloud='pale', paper='pale',
              hinoki='wood', wood='wood', bark='wood', copper='wood', gold='wood')
RAMPS_ = dict(green=['leaf0', 'jade0', 'leaf1', 'jade1', 'teal1', 'jade2'],
              grey=['smoke0', 'fgrey1', 'smoke2', 'fgrey2', 'fgrey3', 'cloud1'],
              pale=['fgrey2', 'fgrey3', 'cloud1', 'fgrey4', 'cloud2', 'cloud2'],
              wood=['ink', 'wood0', 'bark0', 'wood1', 'bark1', 'wood2'])
DISTANT = BM.scheme(FAMILY, RAMPS_, gamma=0.9, rim=None, rim2=None, fallback=((0.6, 0.62, 0.66), (40, 42, 50)))
# near things: only the greens and the bark change - flowers keep their colour in the rain
NEAR = BM.scheme(dict(leaf='green', jade='green', alien='green', teal='green', bark='wood', wood='wood'),
                 dict(green=['leaf0', 'jade0', 'leaf1', 'jade1', 'leaf2', 'jade2', 'jade3'],
                      wood=['ink', 'wood0', 'bark0', 'wood1', 'bark1', 'wood2', 'bark2']),
                 gamma=0.8, rim=None, rim2=None)

WET = ('leaf', 'jade', 'alien', 'teal')


def _wet_map():
    """Each leaf colour a shade deeper, as soaked leaves look under cloud."""
    out = {}
    for rgb, (ramp, i) in LOOKUP.items():
        if ramp in WET and i > 0:
            out[rgb] = RAMPS[ramp][i - 1]
    return out


WET_MAP = _wet_map()


def wet(cv, glints=0.003, seed=0):
    """Soak a canvas in place: greens a shade deeper, a few raindrops glinting on
    the leaves that face the sky."""
    a = cv.a
    solid = a[..., 3] > 0
    rgb = a[..., :3]
    codes = (rgb[..., 0].astype(np.int64) << 16) | (rgb[..., 1].astype(np.int64) << 8) | rgb[..., 2]
    out = rgb.copy()
    leaf = np.zeros(solid.shape, bool)
    for c in np.unique(codes[solid]):
        t = (int(c) >> 16, (int(c) >> 8) & 255, int(c) & 255)
        if t in WET_MAP:
            m = solid & (codes == c)
            out[m] = WET_MAP[t]
            leaf |= m
    a[..., :3] = out
    if glints:
        yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
        h = np.sin(xx * 127.1 + yy * 311.7 + seed * 74.7) * 43758.5453
        h -= np.floor(h)
        up = np.roll(leaf, 1, 0)
        g = leaf & ~up & (h < glints * 8)
        a[g, :3] = PAL['cloud2']
    return cv


def fog(cv, alpha, names=None):
    """Lay mist over a canvas in place: alpha (H, W) 0..1, dithered to the palette."""
    a = cv.a
    m = (a[..., 3] > 0) & (alpha > 0.02)
    if not m.any():
        return cv
    yy, xx = np.nonzero(m)
    src = a[m][:, :3].astype(float)
    al = alpha[m][:, None]
    mix = src * (1 - al) + FOG * al
    names = names or (SKY_SET + ['leaf0', 'jade0', 'leaf1', 'jade1', 'teal1', 'jade2', 'teal2', 'wood0', 'bark0',
                                 'wood1', 'bark1', 'wood2', 'smoke0'])
    a[yy, xx, :3] = BM._quant(mix, names, 10.0, yy, xx)
    return cv


def hills():
    import outside
    cv = BM._as_summer(outside.hills)
    wet(cv, glints=0)
    BM.grade(cv, rim=False, look=DISTANT)
    yy, xx = np.mgrid[0:H, 0:OUT_W]
    band = np.clip(1 - np.abs(yy - (176 + 4 * np.sin(xx * 2 * math.pi / OUT_W * 4))) / 10.0, 0, 1)
    return fog(cv, band * 0.55)


def trees():
    import outside
    import grove
    keep = grove.garden_life
    grove.garden_life = lambda frames, rng, ground: frames      # the butterflies are sheltering
    try:
        frames = BM._as_summer(outside.trees)
    finally:
        grove.garden_life = keep
    return [wet(BM.grade(f, rim=False, look=NEAR), seed=i) for i, f in enumerate(frames)]


def flowers_close():
    """The bed under the window in the rain: hydrangeas, bellflowers, wet grass."""
    import meadow
    rng = random.Random(51)
    rows = [(-3, 12, 7, 1, 7), (1, 16, 8, 0, 9), (6, 20, 9, 0, 10)]
    fr = BM._as_summer(lambda: meadow.meadow(OUT_W, 214, rng, rows,
                                             ['hydrangea_blue', 'hydrangea_purple', 'bellflower', 'hydrangea_blue'],
                                             flower_rate=0.16, susuki_rate=0.0, height=H))
    return [BM.grade(f, rim=False, look=NEAR) for f in fr]


RAIN_N = 24


def rain(n=RAIN_N):
    """Rain on the wind, in front of the garden: slanting streaks, far ones short
    and faint, near ones long and bright, each falling the height of the view once
    or twice per loop, and splashes in the flower bed. Runs at 12 fps."""
    rng = random.Random(81)
    frames = [Canvas(OUT_W, H, wrap=True) for _ in range(n)]
    slant = 0.22
    for i in range(1300):
        near = rng.random() < 0.2
        k = 2 if near else 1
        ln = rng.randint(8, 12) if near else rng.randint(3, 6)
        x0, y0 = rng.uniform(0, OUT_W), rng.uniform(0, H)
        col = PAL['cloud2'] if near else PAL[rng.choice(('fgrey4', 'cloud1'))]
        al = rng.randint(120, 175) if near else rng.randint(55, 105)
        for f in range(n):
            y = (y0 + k * H * f / n) % H
            x = x0 + slant * y
            a = frames[f].a
            for j in range(ln):
                Y, X = int(y) - j, int(x - slant * j) % OUT_W
                if 0 <= Y < H:
                    al_j = int(al * (1 - 0.55 * j / ln))
                    if a[Y, X, 3] < al_j:
                        a[Y, X] = (*col, al_j)
    for i in range(170):                                        # splashes in the flower bed
        x, y, f0 = rng.uniform(0, OUT_W), rng.uniform(206, 236), rng.randrange(n)
        for k, cells in enumerate(([(0, 0)], [(-1, -1), (1, -1), (0, 0)], [(-2, -1), (2, -1)])):
            a = frames[(f0 + k) % n].a
            for dx, dy in cells:
                X, Y = int(x + dx) % OUT_W, int(y + dy)
                if 0 <= Y < H:
                    a[Y, X] = (*PAL['cloud2'], 170 - 40 * k)
    return frames


def all_layers():
    import lake
    import life
    sk, cl, mt = sky(), clouds(), mountains()
    above = sk.a.copy()
    for L in (cl, mt):
        m = L.a[..., 3] > 0
        above[m] = L.a[m]
    water = []
    for arr in lake.lake_frames(above, HORIZON, OUT_W, H, 'rain'):
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
    fish, (fx, fy) = life.lake('rain')
    birds, (bx_, by_) = life.birds('rain')
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
        ('08_rain', rain(), 0.75),
    ]
