"""The blood moon: one night of the year, the moon rises full and red over the
lake and everything outside is lit by it.

    sky        violet night, deepening to the top, a red glow along the
               horizon, stars, and the moon itself - copper-red, brighter on
               its lower edge, its seas and craters showing - with a halo
    clouds     thin bands of cloud; the one passing low across the moon is
               dark against it with a bright red edge
    the land   the summer garden at night: leaves dark blue-green, pale things
               dim rose, red things (the spider lilies in the bed, the
               susuki plumes) glowing; every top edge facing the sky catches
               a line of red moonlight
    lake       the night sky in the water and a path of broken red light
               running from the moon toward the shore
    life       bats flitting past the moon, fish rings, fireflies over the
               garden

all_layers() returns the same layers as outside.all_layers(), with bats in
place of birds and fireflies on the wind layer."""
import math
import random
import numpy as np
from pixel import Canvas, PAL
from layout import H
import season

OUT_W = 1280
HORIZON = 150
MOON_X, MOON_Y, MOON_R = 308, 78, 21          # in the sky layer: clear of the trees in the seating-room window
GLADE_SHIFT = 51                               # the lake moves faster than the sky: line the reflection up
                                               # under the moon for the seating-room window
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0 - 0.47


def _quant(rgb, names, dither, yy, xx):
    pal = np.array([PAL[n] for n in names], float)
    if dither:
        rgb = rgb + BAYER[yy % 4, xx % 4][..., None] * dither
    d = ((rgb[..., None, :] - pal[(None,) * (rgb.ndim - 1)]) ** 2).sum(-1)
    return pal[d.argmin(-1)].astype(np.uint8)


def _moon_dist(xx, yy, x0=MOON_X, y0=MOON_Y):
    dx = (xx - x0 + OUT_W / 2) % OUT_W - OUT_W / 2
    return np.hypot(dx, yy - y0)


# ---------------------------------------------------------------- the sky
SKY_SET = ['night0', 'night1', 'night2', 'night3', 'bark0', 'red0', 'blood0', 'blood1', 'bark1']


def sky():
    cv = Canvas(OUT_W, H, wrap=True)
    yy, xx = np.mgrid[0:H, 0:OUT_W]
    stops_y = [0, 60, 112, 138, 150, H]
    top = np.array([[8, 6, 18], [18, 13, 32], [34, 22, 54], [56, 28, 64], [74, 24, 46], [74, 24, 46]], float)
    rgb = np.stack([np.interp(yy, stops_y, top[:, c]) for c in range(3)], -1)
    dist = _moon_dist(xx, yy)
    halo = np.clip(1 - (dist - MOON_R) / 120.0, 0, 1)
    corona = np.clip(1 - (dist - MOON_R) / 9.0, 0, 1)
    rgb += (halo ** 2.6)[..., None] * np.array([46, 6, 4]) + (corona ** 1.5)[..., None] * np.array([44, 0, 0])
    cv.a[..., :3] = _quant(rgb, SKY_SET, 18.0, yy, xx)
    cv.a[..., 3] = 255
    # stars: thick near the top, none in the moon's glare or the horizon glow
    rng = random.Random(71)
    for _ in range(420):
        x, y = rng.randrange(OUT_W), int(132 * rng.random() ** 1.7)
        if halo[y, x] > 0.02 or (y > 110 and rng.random() < 0.7):
            continue
        r = rng.random()
        c = 'night5' if r < 0.55 else ('cloud1' if r < 0.8 else ('pink3' if r < 0.9 else 'fire5'))
        cv.px(x, y, c)
    for _ in range(26):                                   # a few bright ones, with little crosses
        x, y = rng.randrange(OUT_W), int(110 * rng.random() ** 1.5)
        if halo[y, x] > 0:
            continue
        cv.px(x, y, 'white')
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            cv.px(x + dx, y + dy, 'night5')
    _moon(cv)
    return cv


def _moon(cv):
    R = MOON_R
    rng = random.Random(72)
    ys, xs = np.mgrid[-R - 1:R + 2, -R - 1:R + 2]
    nx, ny = (xs + 0.5) / R, (ys + 0.5) / R
    r2 = nx * nx + ny * ny
    inside = r2 <= 1
    nz = np.sqrt(np.clip(1 - r2, 0, 1))
    b = 0.5 * (0.62 + 0.38 * nz)                          # the limb darkens
    b += 0.5 * np.clip(-nx * 0.55 + ny * 0.85 - 0.15, 0, 1) ** 1.4      # bright lower edge
    for (cx, cy, rx, ry, k) in ((-0.32, -0.28, 0.34, 0.24, 0.17), (0.16, -0.4, 0.22, 0.17, 0.14),
                                (0.24, 0.08, 0.3, 0.26, 0.16), (-0.12, 0.3, 0.2, 0.15, 0.12),
                                (0.48, -0.08, 0.12, 0.22, 0.1), (-0.52, 0.05, 0.12, 0.18, 0.1)):    # the seas
        e = ((nx - cx) / rx) ** 2 + ((ny - cy) / ry) ** 2
        b -= k * np.clip(1.3 - e, 0, 1)
    for _ in range(9):                                    # craters: a dark bowl with a lit far rim
        a_, rr = rng.uniform(0, 6.3), rng.uniform(0.1, 0.8)
        cx, cy, cr = math.cos(a_) * rr, math.sin(a_) * rr, rng.uniform(0.06, 0.12)
        d = np.hypot(nx - cx, ny - cy)
        b -= 0.12 * (d < cr)
        b += 0.1 * ((d >= cr) & (d < cr + 0.07) & (ny - cy > 0))
    ramp = ['blood2', 'blood3', 'blood4', 'blood5', 'blood6']
    k = np.clip((b + BAYER[(ys % 4), (xs % 4)] * 0.12) * len(ramp) * 1.1 - 0.9, 0, len(ramp) - 1).astype(int)
    for (y, x) in zip(*np.nonzero(inside)):
        cv.px(MOON_X + int(xs[y, x]), MOON_Y + int(ys[y, x]), ramp[k[y, x]])


def clouds():
    """Thin bands of night cloud, lit red where they pass near the moon."""
    cv = Canvas(OUT_W, H, wrap=True)
    rng = random.Random(73)
    bands = ((MOON_X + 30, MOON_Y + 18, 290, 4.5), (900, 52, 380, 5), (110, 38, 260, 4), (650, 128, 420, 5),
             (1150, 116, 300, 4), (560, 24, 200, 3), (60, 122, 240, 4))
    for (cx, cy, ln, th) in bands:
        ph = rng.uniform(0, 6.3)
        for i in range(int(ln)):
            u = i / ln
            x = int(cx - ln / 2 + i)
            half = th * math.sin(math.pi * u) ** 0.7 * (0.65 + 0.2 * math.sin(i * 0.09 + ph) + 0.15 * math.sin(i * 0.31))
            if half < 0.6:
                continue
            y0 = int(round(cy - half * 0.45 + 1.5 * math.sin(i * 0.02 + ph)))
            y1 = int(round(cy + half * 0.55 + 1.5 * math.sin(i * 0.02 + ph)))
            lit = max(0.0, 1 - float(_moon_dist(np.array(x), np.array((y0 + y1) / 2))) / 150.0)
            for y in range(y0, y1 + 1):
                over = float(_moon_dist(np.array(x), np.array(y))) <= MOON_R + 1
                if y == y1:                                      # the underside, toward the moon
                    c = 'blood4' if lit > 0.75 else ('blood2' if lit > 0.45 else ('blood0' if lit > 0.2 else 'night2'))
                elif y == y0:
                    c = 'blood3' if (over or lit > 0.8) else ('night4' if lit < 0.4 else 'blood1')
                else:
                    c = 'night1' if over else ('night2' if lit < 0.5 else 'night3')
                cv.px(x, y, c)
    return cv


# ---------------------------------------------------------------- the land at night
# each family of colours goes onto a night ramp by how light it was by day
FAMILY = dict(leaf='nleaf', jade='nleaf', alien='nleaf', teal='nleaf',
              sky='night', haze='night', water='night', indigo='night', gloss='night', pong='night', smoke='night',
              stone='night', fgrey='night', purp='night', lilac='night', ink='night', night='night',
              cloud='pale', paper='pale', hinoki='dusk', pink='rose', red='blood', scarlet='blood', fire='blood',
              blood='blood', wood='dusk', bark='dusk', copper='dusk', gold='dusk')
NIGHT_RAMPS = dict(night=['night0', 'night1', 'night2', 'night3', 'night4', 'night5'],
                   nleaf=['night0', 'nleaf0', 'nleaf1', 'nleaf2', 'nleaf3', 'nleaf4'],
                   pale=['night2', 'night3', 'night4', 'pink0', 'pink1', 'pink2'],
                   rose=['night2', 'pink0', 'pink1', 'pink2', 'blood5'],
                   blood=['blood0', 'blood1', 'blood2', 'blood3', 'blood4', 'blood5'],
                   dusk=['ink', 'bark0', 'night2', 'bark1', 'night4', 'blood2'])
EMISSIVE = ('fire3', 'fire4', 'fire5')


def scheme(family, ramps, boost=None, sink=(), sink_pow=1.35, gamma=0.85, rim='blood2', rim2='blood1',
           emissive=EMISSIVE, fallback=((0.5, 0.32, 0.4), (4, 2, 10))):
    """A way of re-lighting the day: each family of colours goes onto one of `ramps`
    by how light it was by day. boost: {ramp: factor} for things the light picks
    out; sink: ramps pushed darker."""
    of = {}
    for name, rgb in PAL.items():
        fam = ''.join(ch for ch in name if not ch.isdigit())
        if name in emissive or fam not in family:
            continue
        ramp = ramps[family[fam]]
        y = (0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2]) / 255.0
        if family[fam] in (boost or {}):
            y = min(1.0, y * boost[family[fam]])
        elif family[fam] in sink:
            y = y ** sink_pow
        of[tuple(rgb)] = (family[fam], int(min(len(ramp) - 1, (y ** gamma) * len(ramp))))
    return dict(of=of, ramps=ramps, rim=rim, rim2=rim2, emissive=emissive, fallback=fallback)


PAL_RGB = {tuple(v) for v in PAL.values()}
# red things glow under a red moon, everything else sinks into the dark
BLOOD = scheme(FAMILY, NIGHT_RAMPS, boost={'blood': 1.35}, sink=('night', 'nleaf'))
NIGHT_OF = BLOOD['of']


def grade(cv, rim=True, rim_col=None, wrap=True, look=None):
    """Re-light a daytime canvas, in place: for the blood moon night unless another
    look (scheme()) is given. Every top edge facing the sky catches a line of the
    look's rim light (red moonlight by default)."""
    S = look or BLOOD
    NIGHT_OF, NIGHT_RAMPS, EMISSIVE = S['of'], S['ramps'], S['emissive']
    a = cv.a
    solid = a[..., 3] > 0
    rgb = a[..., :3]
    out = rgb.copy()
    lvl = np.full(solid.shape, -1, int)
    keys = {}
    flat = rgb.reshape(-1, 3)
    codes = (flat[:, 0].astype(np.int64) << 16) | (flat[:, 1].astype(np.int64) << 8) | flat[:, 2]
    codes = codes.reshape(solid.shape)
    for c in np.unique(codes[solid]):
        t = (int(c) >> 16, (int(c) >> 8) & 255, int(c) & 255)
        if t in NIGHT_OF:
            keys[int(c)] = NIGHT_OF[t]
        elif t in PAL_RGB:                                     # a palette colour this look leaves alone
            lvl[solid & (codes == c)] = 0
    for c, (f, k) in keys.items():
        m = solid & (codes == c)
        out[m] = PAL[NIGHT_RAMPS[f][k]]
        lvl[m] = k
    # colours not in the palette (blended): nearest night colour
    left = solid & (lvl < 0)
    emis = np.zeros(solid.shape, bool)
    for e in EMISSIVE:
        emis |= solid & (rgb == np.array(PAL[e], np.uint8)).all(-1)
    left &= ~emis
    if left.any():
        names = sorted({n for r in NIGHT_RAMPS.values() for n in r})
        pal = np.array([PAL[n] for n in names], float)
        mul, add = S['fallback']
        px = rgb[left].astype(float) * np.array(mul) + np.array(add)
        d = ((px[:, None, :] - pal[None]) ** 2).sum(-1)
        out[left] = pal[d.argmin(-1)].astype(np.uint8)
    if rim:
        up = np.roll(solid, 1, 0) if wrap else np.vstack([np.zeros((1, solid.shape[1]), bool), solid[:-1]])
        up[0] = False
        upl = np.roll(up, 1, 1) if wrap else up
        edge = solid & ~emis & ~up
        edge2 = solid & ~emis & up & ~upl & ~edge                  # a second step on the upper-left
        if rim_col or S['rim']:
            out[edge] = PAL[rim_col or S['rim']]
        if S['rim2']:
            out[edge2 & (lvl >= 2)] = PAL[S['rim2']]
    a[..., :3] = np.where(solid[..., None], out, rgb)
    return cv


def grade_frames(frames, **kw):
    return [grade(f, **kw) for f in frames]


NIGHT_DIM = 0.68                    # as dark as the rooms are (fx.night_light)


def dim(cv, where=None, colour=None, amount=None):
    """A copy of a sprite sunk into the night the way the rooms are (so something
    outside a window matches its part that comes into the room), kept to the
    palette. where: only these pixels (a mask the size of the sprite). colour,
    amount: another season's dark (fx.MOODS)."""
    from fx import NIGHT
    colour = NIGHT if colour is None else colour
    amount = NIGHT_DIM if amount is None else amount
    out = cv.copy()
    a = out.a
    m = a[..., 3] > 0
    if where is not None:
        m &= where
    if not m.any():
        return out
    names = [n for n in PAL if n not in ('ink', 'white')]
    pal = np.array([PAL[n] for n in names], float)
    src = a[m][:, :3].astype(float) * (1 - amount) + np.array(colour, float) * amount
    codes, inv = np.unique(src.round().astype(int), axis=0, return_inverse=True)
    d = ((codes[:, None, :] - pal[None]) ** 2).sum(-1)
    a[m, :3] = pal[d.argmin(-1)][inv.ravel()].astype(np.uint8)
    return out


# ---------------------------------------------------------------- the layers
def _as_summer(fn):
    s = season.current
    season.current = 'summer'
    try:
        return fn()
    finally:
        season.current = s


def mountains():
    import outside
    cv = _as_summer(outside.mountains)
    return grade(cv)


def hills():
    import outside
    return grade(_as_summer(outside.hills))


def trees():
    import outside
    import grove
    keep = grove.garden_life
    grove.garden_life = lambda frames, rng, ground: frames      # no butterflies at night
    try:
        frames = _as_summer(outside.trees)
    finally:
        grove.garden_life = keep
    return grade_frames(frames)


def flowers_close():
    """The bed under the window: red spider lilies and susuki grass for moon viewing."""
    import meadow
    rng = random.Random(51)
    rows = [(-3, 12, 7, 1, 7), (1, 16, 8, 0, 9), (6, 20, 9, 0, 10)]
    fr = _as_summer(lambda: meadow.meadow(OUT_W, 214, rng, rows, ['spider_lily', 'spider_lily', 'cosmos_white'],
                                          flower_rate=0.15, susuki_rate=0.16, height=H))
    return grade_frames(fr)


def fireflies(n=24):
    """Fireflies over the garden and the bed: each drifts on a slow loop and glows
    up and fades, out of step with the others."""
    rng = random.Random(74)
    frames = [Canvas(OUT_W, H, wrap=True) for _ in range(n)]
    for i in range(150):
        x0, y0 = rng.uniform(0, OUT_W), rng.uniform(150, 236)
        rx, ry = rng.uniform(3, 12), rng.uniform(2, 6)
        ph, on = rng.uniform(0, 6.3), rng.randrange(n)
        for f in range(n):
            t = 2 * math.pi * f / n
            x = int(x0 + rx * math.sin(t + ph))
            y = int(y0 + ry * math.sin(2 * t + ph))
            g = ((f - on) % n) / n                              # glows for a third of the loop
            if g > 0.34:
                continue
            k = math.sin(math.pi * g / 0.34)
            if not 0 <= y < H:
                continue
            frames[f].a[y, x % OUT_W] = (*PAL['alien4' if k > 0.5 else 'alien3'], int(150 + 105 * k))
            if k > 0.6:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if 0 <= y + dy < H:
                        frames[f].a[y + dy, (x + dx) % OUT_W] = (*PAL['alien2'], int(110 * k))
    return frames


def all_layers():
    import lake
    import life
    sk, cl, mt = sky(), clouds(), mountains()
    above = sk.a.copy()
    for L in (cl, mt):
        m = L.a[..., 3] > 0
        above[m] = L.a[m]
    above = np.roll(above, GLADE_SHIFT, 1)
    water = []
    for arr in lake.lake_frames(above, HORIZON, OUT_W, H, 'bloodmoon'):
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
    fish, (fx, fy) = life.lake('bloodmoon')
    bats, (bx_, by_) = life.bats()
    return [
        ('00_sky', [sk], 0.04),
        ('01_clouds', [cl], 0.08),
        ('02_mountains', [mt], 0.12),
        ('03_lake', water, 0.12),
        ('04_lake_life', crop_layer(fish), 0.12, (fx, fy)),
        ('04_bats', crop_layer(bats), 0.14, (bx_, by_)),
        ('05_hills_trees', [hills()], 0.22),
        ('06_garden_trees', trees(), 0.34),
        ('07_flowers_close', flowers_close(), 0.62),
        ('08_fireflies', fireflies(), 0.75),
    ]
