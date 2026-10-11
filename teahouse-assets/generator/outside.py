"""The view through the windows: six horizontally tileable parallax layers,
OUT_W wide and the full scene height. Green trees only - grown branch by
branch and leaf cluster by leaf cluster (grove.py), big and close so the
garden fills the windows, swaying, with butterflies and dragonflies."""
import math
import random
import numpy as np
from pixel import Canvas, PAL, col, step, periodic_noise
from shapes import shade_puffs, flower, small_leaf
from trees import (F, GREEN, DEEP, JADE, tree_pine, tree_oak, tree_bushy, tree_windswept, tree_willow,
                   bush, small_tree)
import meadow
import grove
from layout import H

OUT_W = 1280
HORIZON = 168          # lake line in scene coordinates
GROUND = 190           # far garden ground, just in front of the lake

CLOUD = ['cloud0', 'cloud1', 'cloud2', 'cloud3']
STORM = ['smoke0', 'smoke1', 'smoke2', 'cloud1']


BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def dither_seam(cv, y0, rows, upper, lower, x0=0, x1=None):
    """Ordered-dither hand-off from `upper` to `lower` over `rows` rows."""
    x1 = cv.w if x1 is None else x1
    for r in range(rows):
        t = (r + 0.5) / rows
        for x in range(x0, x1):
            cv.px(x, y0 + r, lower if BAYER4[(y0 + r) % 4][x % 4] / 16 < t else upper)


def _cumulus(cv, rng, cx, base, width, height, ramp=CLOUD, dither=0.05):
    circles = []
    n = max(4, int(width / 9))
    for i in range(n):
        t = i / (n - 1)
        x = cx - width / 2 + t * width + rng.uniform(-3, 3)
        hump = math.sin(math.pi * t) ** 0.8
        r = 6 + hump * height * rng.uniform(0.55, 0.8)
        circles.append((x, base - r * 0.55 + rng.uniform(-2, 2), r))
    # extra top towers
    for _ in range(max(1, n // 3)):
        x = cx + rng.uniform(-width * 0.25, width * 0.25)
        r = height * rng.uniform(0.4, 0.6)
        circles.append((x, base - height * rng.uniform(0.7, 1.0), r))
    shade_puffs(cv, circles, ramp, clip_bottom=base, dither=dither,
                cuts=[-0.05, 0.25, 0.52])
    # flat lit underside line + shadowed belly
    for x in range(int(cx - width / 2 - 8), int(cx + width / 2 + 8)):
        if cv.get(x, base - 1)[3]:
            cv.px(x, base - 1, ramp[1] if (x // 3) % 3 else ramp[0])


def _faceted(cv, top, fill, shade, rim, rng, lean=0.55):
    """Ridge with lit left faces and shadowed right faces split by jagged
    spurs running down from each peak."""
    for x in range(OUT_W):
        t = int(top[x])
        cv.vline(x, t, HORIZON, fill)
    # peaks / valleys (y small = high)
    peaks, valleys = [], []
    for x in range(OUT_W):
        win = [top[(x + d) % OUT_W] for d in range(-10, 11)]
        if top[x] == min(win):
            peaks.append(x)
        if top[x] == max(win):
            valleys.append(x)
    for p in peaks:
        nxt = [v for v in valleys if v > p] or [valleys[0] + OUT_W]
        v = nxt[0]
        jit = 0
        for y in range(int(top[p]), HORIZON):
            depth = y - top[p]
            if rng.random() < 0.3:
                jit = max(-2, min(2, jit + rng.choice((-1, 1))))
            xa = int(p + depth * lean * 0.5 + jit)
            xb = int(v + (y - top[v % OUT_W]) * 0.15) if y >= top[v % OUT_W] else int(v)
            for x in range(xa, max(xa, xb) + 1):
                if y >= top[x % OUT_W]:
                    cv.px(x, y, shade)
    for x in range(OUT_W):
        t = int(top[x])
        if top[(x + 1) % OUT_W] >= top[x] - 0.2:
            cv.px(x, t, rim)


def _tree_band(cv, rng, y, c, c2, h=4):
    x = 0
    while x < OUT_W + 6:
        r = rng.uniform(1.6, 3.2)
        cv.ellipse(x, y - r * 0.4, r, r * 0.9, c)
        cv.px(int(x - r * 0.4), int(y - r), c2)
        x += rng.uniform(2, 4)
    cv.rect(0, y, OUT_W, 3, c)


def _tower(cv, x, ground):
    """Distant tiered bathhouse-like tower (original design): red walls,
    jade roofs, gold finial."""
    # rock island
    for k in range(-30, 34):
        hgt = int(3 - abs(k) / 11) + (1 if k % 7 == 0 else 0)
        if hgt <= 0:
            continue
        cv.vline(x + k, ground - hgt, ground, 'haze0' if k > 10 else 'stone1')
        cv.px(x + k, ground - hgt, 'leaf1' if k % 3 else 'leaf2')
    bush = Canvas.from_ascii('''
.aab.
abbbc
abccc
.cdd.
''', {'a': 'leaf3', 'b': 'leaf2', 'c': 'leaf1', 'd': 'leaf0'})
    for k in (-25, -20, 21, 26):
        cv.blit(bush, x + k - 2, ground - 6)
    cv.rect(x - 11, ground - 6, 23, 5, 'red1')       # stone/wood base
    for sx in range(x - 10, x + 12, 3):
        cv.vline(sx, ground - 5, ground - 2, 'red0')
    tiers = [(11, 9), (9, 8), (8, 7), (5, 6)]
    y = ground - 6
    for i, (hw, th) in enumerate(tiers):
        cv.rect(x - hw + 1, y - th, 2 * hw - 1, th, 'red2')
        cv.vline(x - hw + 1, y - th, y - 1, 'red3')
        for wx in range(x - hw + 3, x + hw - 1, 2):
            cv.px(wx, y - th + 2, 'gold3' if (wx + i) % 4 == 1 else 'paper3')
            cv.px(wx, y - th + 3, 'red0')
        cv.hline(x - hw + 1, x + hw - 1, y - 1, 'red1')
        ry = y - th
        rw = hw + 3
        cv.hline(x - rw + 1, x + rw - 1, ry, 'jade1')
        cv.hline(x - rw + 2, x + rw - 2, ry - 1, 'jade3')
        cv.hline(x - rw + 3, x + rw - 4, ry - 2, 'jade2')
        cv.px(x - rw, ry - 1, 'jade4')
        cv.px(x + rw, ry - 1, 'jade2')
        cv.hline(x - rw + 1, x + rw - 1, ry + 1, 'jade0')
        cv.px(x, ry - 2, 'gold3')
        y = ry - 2
    cv.vline(x, y - 4, y, 'gold2')
    cv.px(x, y - 5, 'gold4')


def _stone_lantern(cv, x, ground):
    s = ['stone1', 'stone2', 'stone3', 'stone4']
    cv.rect(x - 5, ground - 4, 11, 4, s[1]); cv.hline(x - 5, x + 5, ground - 4, s[2])
    cv.rect(x - 2, ground - 16, 5, 12, s[1]); cv.vline(x - 2, ground - 16, ground - 5, s[2])
    cv.rect(x - 6, ground - 19, 13, 3, s[2]); cv.hline(x - 6, x + 6, ground - 19, s[3])
    cv.rect(x - 4, ground - 27, 9, 8, s[1]); cv.rect(x - 2, ground - 25, 4, 4, 'fire4')
    cv.px(x - 1, ground - 24, 'fire5'); cv.vline(x - 4, ground - 27, ground - 20, s[2])
    cv.poly([(x - 9, ground - 27), (x + 10, ground - 27), (x + 4, ground - 33), (x - 3, ground - 33)], s[2])
    cv.hline(x - 9, x + 9, ground - 28, s[3])
    cv.hline(x - 8, x + 9, ground - 27, s[0])
    cv.rect(x - 1, ground - 36, 3, 3, s[2]); cv.px(x - 1, ground - 36, s[3])
    for k in range(6):  # moss
        cv.px(x - 8 + k * 3, ground - 29, 'leaf3')


def _hydrangea_bush(seed, rx, ry, kinds=('hydrangea_blue', 'hydrangea_purple')):
    rng = random.Random(seed)
    b = bush(seed, rx, ry)
    cv = Canvas(b.w + 8, b.h + 8)
    cv.blit(b, 4, 6)
    for _ in range(int(rx * ry / 22)):
        hd = meadow.head(rng.choice(kinds), rng)
        x = rng.randint(2, cv.w - hd.w - 2)
        y = rng.randint(2, int(cv.h * 0.55))
        if cv.opaque(x + hd.w // 2, y + hd.h // 2 + 3):
            cv.blit(hd, x, y)
    return cv




def sky():
    """Smooth sky: five tones blended with a fine ordered dither, a pale haze
    at the horizon and a few thin high clouds."""
    cv = Canvas(OUT_W, H, wrap=True)
    stops = [(0, 0), (60, 1), (108, 2), (140, 3), (162, 4)]
    cols = ['sky0', 'sky1', 'sky2', 'sky3', 'sky4']
    for y in range(H):
        v = stops[-1][1]
        for (y0, a), (y1, b) in zip(stops, stops[1:]):
            if y0 <= y < y1:
                v = a + (y - y0) / (y1 - y0) * (b - a)
                break
        lo = int(v)
        fr = v - lo
        for x in range(OUT_W):
            k = lo + (1 if fr > (BAYER4[y % 4][x % 4] + 0.5) / 16 else 0)
            cv.px(x, y, cols[min(4, k)])
    rng = random.Random(3)
    for _ in range(9):                                   # thin high cirrus, wispy and broken
        x, y = rng.randint(0, OUT_W), rng.randint(24, 80)
        ln = rng.randint(40, 110)
        for k in range(ln):
            yy = y + int(math.sin(k * 0.06 + x) * 2)
            if rng.random() < 0.8:
                cv.px(x + k, yy, 'sky3' if y > 50 else 'sky2')
            if 6 < k < ln - 8 and rng.random() < 0.5:
                cv.px(x + k, yy + 1, 'sky4' if y > 50 else 'sky3')
    return cv


def clouds():
    cv = Canvas(OUT_W, H, wrap=True)
    rng = random.Random(11)
    for (x, base, w, h) in ((140, 138, 170, 66), (470, 110, 90, 30), (700, 146, 130, 44), (980, 140, 200, 76),
                            (1200, 96, 80, 24)):
        _cumulus(cv, rng, x, base, w, h)
    return cv


def _tree_band(cv, rng, y, c, c2):
    x = 0
    while x < OUT_W + 6:
        r = rng.uniform(1.8, 3.6)
        cv.ellipse(x, y - r * 0.4, r, r * 0.9, c)
        cv.px(int(x - r * 0.4), int(y - r), c2)
        x += rng.uniform(2, 4)
    cv.rect(0, y, OUT_W, 3, c)


def _ridge(rng, base, amp, octaves):
    """A natural ridge line: layered noise plus sharpened crests."""
    n = periodic_noise(OUT_W, octaves, rng, 1.0)
    n = n - n.min()
    n = n / (n.max() or 1)
    crest = 1 - np.abs(np.sin(np.linspace(0, math.pi * 7, OUT_W) + rng.uniform(0, 6)))
    return base - amp * (0.75 * n + 0.25 * crest * n)


def _paint_range(cv, prof, ramp, rng, floor_y, lit_side=True, tex=0.0):
    """Fill a mountain range under prof: lighter near the crest, shaded on slopes
    that face away from the light, a few gullies, fading toward the foot."""
    slope = np.gradient(prof)
    for x in range(OUT_W):
        top = int(round(prof[x]))
        for y in range(top, floor_y):
            d = y - top
            k = 2 if d < 3 else (1 if d < 14 else 0)
            if slope[x] > 0.35 and d < 30:              # this slope faces right, away from the light
                k = max(0, k - 1)
            if slope[x] < -0.35 and d < 6:
                k = min(len(ramp) - 1, k + 1)           # sunlit crest
            if tex and (math.sin(x * 0.21 + y * 0.6) + math.sin(x * 0.05 - y * 0.13)) > 1.55 - tex:
                k = max(0, k - 1)                        # gullies
            cv.px(x, y, ramp[k])


def mountains():
    cv = Canvas(OUT_W, H, wrap=True)
    rng = random.Random(21)
    far = _ridge(rng, 138, 40, [(2, 10), (5, 6), (9, 3.5), (19, 1.6), (37, 0.7), (71, 0.3)])
    mid = _ridge(rng, 150, 24, [(3, 7), (6, 5), (11, 3), (23, 1.2), (47, 0.5)])
    near = _ridge(rng, 162, 12, [(4, 6), (9, 4), (17, 2), (41, 0.8)])
    _paint_range(cv, far, ['haze2', 'haze3', 'cloud2'], rng, HORIZON, tex=0.25)
    # snow on the high peaks: bright on the sunlit side, blue in shade
    slope = np.gradient(far)
    snowline = np.percentile(far, 30)
    for x in range(OUT_W):
        top = int(round(far[x]))
        if far[x] < snowline:
            depth = int((snowline - far[x]) * 0.7) + 2
            for d in range(depth):
                if (x * 7 + d * 3) % 11 == 0 and d > depth - 3:
                    continue
                cv.px(x, top + d, 'cloud3' if slope[x] < 0.1 else 'cloud1')
    _paint_range(cv, mid, ['haze0', 'haze1', 'haze2'], rng, HORIZON, tex=0.4)
    # the near range is forested: dark teal with a bumpy canopy edge and tree texture
    for x in range(OUT_W):
        top = int(round(near[x] - abs(math.sin(x * 0.9)) * 1.5))
        for y in range(top, HORIZON):
            d = y - top
            c = 'teal2' if d < 2 else ('teal1' if (x * 3 + y * 5) % 7 else 'teal0')
            cv.px(x, y, c)
    near = np.minimum(near, mid)
    # lake: calm, with a faint upside-down reflection of the near ridge
    for y in range(HORIZON, H):
        cv.hline(0, OUT_W - 1, y, 'water1' if y < HORIZON + 12 else 'water0')
    dither_seam(cv, HORIZON + 10, 6, 'water1', 'water0')
    for x in range(OUT_W):
        depth = int((HORIZON - near[x]) * 0.45)
        for d in range(1, depth):
            if (x + d) % 2 == 0 or d < 3:
                cv.px(x, HORIZON + d, 'haze1' if d < depth * 0.6 else 'water1')
    cv.hline(0, OUT_W - 1, HORIZON, 'haze3')
    rng = random.Random(8)
    for _ in range(70):                                  # a few soft glints
        x, y = rng.randint(0, OUT_W), rng.randint(HORIZON + 4, HORIZON + 30)
        cv.hline(x, x + rng.randint(2, 5), y, 'water2')
    return cv


def hills():
    """Rolling wooded hills along the far shore: a canopy of many small tree
    crowns, each lit from the upper left, darker down in the folds."""
    cv = Canvas(OUT_W, H, wrap=True)
    rng = random.Random(31)
    prof = 184 - periodic_noise(OUT_W, [(2, 1), (4, 0.7), (7, 0.4), (13, 0.15)], rng, 16)
    yy = np.arange(H)[:, None]
    ground = yy >= prof[None, :]
    a = cv.a
    base = np.zeros((H, OUT_W), int)
    crowns = []
    for _ in range(900):                                 # tree crowns along the hill tops and slopes
        x = rng.uniform(0, OUT_W)
        top = prof[int(x) % OUT_W]
        y = top + rng.uniform(-1, 18) ** 1.0
        r = rng.uniform(2.6, 5.2) * (1.0 - min(0.4, (y - top) / 60))
        crowns.append((x, y, r))
    crowns.sort(key=lambda c: c[1])
    cols = ['jade0', 'leaf1', 'jade1', 'leaf2', 'leaf3']
    canopy = np.zeros((H, OUT_W), bool)
    for (x, y, r) in crowns:
        x0, x1 = int(x - r - 1), int(x + r + 2)
        y0, y1 = max(0, int(y - r - 1)), min(H, int(y + r + 2))
        for X in range(x0, x1):
            Xw = X % OUT_W
            for Y in range(y0, y1):
                dx, dy = (X + 0.5 - x) / r, (Y + 0.5 - y) / (r * 0.9)
                d = dx * dx + dy * dy
                if d <= 1:
                    lit = -dx * 0.55 - dy * 0.8
                    k = 3 if lit > 0.35 else (2 if lit > -0.1 else 1)
                    if lit > 0.75 and d < 0.5:
                        k = 4
                    if Y > prof[Xw] + 14:
                        k = max(0, k - 1)
                    base[Y, Xw] = k
                    canopy[Y, Xw] = True
    fill = ground | canopy
    for k, c in enumerate(cols):
        m = fill & (base == k) & canopy
        a[m] = (*PAL[c], 255)
    rest = ground & ~canopy
    a[rest] = (*PAL['jade0'], 255)
    a[(yy >= HORIZON + 20) & np.ones((1, OUT_W), bool)] = (*PAL['jade0'], 255)
    return cv


def _haze(cv, steps=1):
    """Atmospheric perspective: distant things step up their ramps (lighter,
    lower contrast)."""
    a = cv.a
    for y, x in zip(*np.nonzero(a[:, :, 3])):
        cv.shift(x, y, steps, only=('leaf', 'jade', 'bark', 'wood', 'stone', 'paper', 'red', 'sky', 'purp',
                                    'pink', 'gold'))


def trees():
    """Garden in the distance: green trees standing back by the lake, with a
    touch of atmospheric haze, bushes, lanterns and grass. F frames."""
    rng = random.Random(41)
    prof = GROUND - periodic_noise(OUT_W, [(2, 1), (5, 0.5), (12, 0.25)], rng, 4)
    base = Canvas(OUT_W, H, wrap=True)
    for x in range(OUT_W):
        top = int(prof[x])
        base.vline(x, top, H - 1, 'leaf1')
        base.px(x, top, 'leaf3')
        base.px(x, top + 1, 'leaf2')
    for i, x in enumerate(range(380, 460, 12)):
        y = int(prof[x]) + 4 + i % 2
        base.ellipse(x, y, 3.5, 1.4, 'stone3')
        base.hline(x - 2, x + 1, y - 1, 'stone4')
    # grown trees (grove.py): a back row, hazed, then the big ones
    back = [(grove.oak(21, k=0.62, ramp=grove.LEAF_RICH), 40), (grove.cypress(22, k=0.7), 250),
            (grove.oak(23, k=0.66), 470), (grove.zelkova(24, k=0.58), 790), (grove.cypress(25, k=0.66), 1010),
            (grove.oak(26, k=0.62), 1140)]
    front = [(grove.black_pine(2, k=0.95), 130), (grove.zelkova(3, k=0.92), 365), (grove.birch(9, k=0.85), 560),
             (grove.willow(7, k=0.95), 690), (grove.oak(4, k=0.95), 910), (grove.cypress(11, k=0.88), 1065),
             (grove.birch(19, k=0.78), 1205)]
    tree_frames = []
    for T, x in back:
        frs = T.frames()
        for fr in frs:
            _haze(fr, 1)
        tree_frames.append((frs, x - T.base[0], int(prof[x % OUT_W]) + 2 - T.base[1], T.h + 1000))
    for T, x in front:
        frs = T.frames()
        tree_frames.append((frs, x - T.base[0], int(prof[x % OUT_W]) + 4 - T.base[1], T.h))
    tree_frames.sort(key=lambda t: -t[3])        # tallest drawn first (behind)
    bushes = []
    for (sd, x, rx, ry, kind) in ((11, 240, 14, 8, 'hyd'), (12, 760, 12, 7, 'green'), (13, 1080, 12, 7, 'green'),
                                  (14, 620, 10, 6, 'green'), (15, 40, 13, 8, 'hyd'), (16, 1230, 11, 6, 'green')):
        if kind == 'hyd':
            spr = _hydrangea_bush(sd, rx, ry)
            bushes.append((spr, x - spr.w // 2, int(prof[x % OUT_W]) + 4 - spr.h))
        else:
            S = grove.shrub(sd, rx * 3, ry * 3)
            frs = S.frames()
            bushes.append((frs, x - S.w // 2, int(prof[x % OUT_W]) + 4 - S.h))
    grass = meadow.meadow(OUT_W, GROUND, random.Random(42),
                          [(2, 5, 5, 1, 7), (5, 7, 6, 1, 9)], ['daisy'],
                          flower_rate=0.05, height=H, fill=False)
    frames = []
    for f in range(F):
        cv = base.copy()
        for (fr, x, y, _) in tree_frames:
            cv.blit(fr[f], x, y)
        for (spr, x, y) in bushes:
            cv.blit(spr[f] if isinstance(spr, list) else spr, x, y)
        cv.blit(grass[f], 0, 0)
        frames.append(cv)
    return grove.garden_life(frames, random.Random(43), GROUND)


def flowers_close():
    """Just outside the glass: a green bed - tall grass, ferny tufts, a few
    white and blue flowers, pampas. F frames."""
    rng = random.Random(51)
    return meadow.meadow(OUT_W, 214, rng,
                         [(-3, 12, 7, 1, 7), (1, 16, 8, 0, 9), (6, 20, 9, 0, 10)],
                         ['daisy', 'bellflower', 'cosmos_white', 'lavender'],
                         flower_rate=0.16, susuki_rate=0.06, height=H)


def all_layers():
    return [
        ('00_sky', [sky()], 0.04),
        ('01_clouds', [clouds()], 0.08),
        ('02_mountains_lake', [mountains()], 0.12),
        ('03_hills_trees', [hills()], 0.22),
        ('04_garden_trees', trees(), 0.34),
        ('05_flowers_close', flowers_close(), 0.62),
    ]
