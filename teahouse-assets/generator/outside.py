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
import life
import season
from layout import H

OUT_W = 1280
HORIZON = 150          # lake line in scene coordinates
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




SKY = dict(summer=['sky0', 'sky1', 'sky2', 'sky3', 'sky4'],
           spring=['sky1', 'sky2', 'sky3', 'sky4', 'pink4'],
           autumn=['sky0', 'sky1', 'sky2', 'sky3', 'paper4'],
           winter=['haze1', 'haze2', 'haze3', 'cloud2', 'cloud3'])


def sky():
    """Smooth sky: five tones blended with a fine ordered dither, a pale haze
    at the horizon and a few thin high clouds."""
    cv = Canvas(OUT_W, H, wrap=True)
    stops = [(0, 0), (60, 1), (108, 2), (140, 3), (162, 4)]
    cols = SKY[season.current]
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
                cv.px(x + k, yy, cols[3] if y > 50 else cols[2])
            if 6 < k < ln - 8 and rng.random() < 0.5:
                cv.px(x + k, yy + 1, cols[4] if y > 50 else cols[3])
    return cv


def clouds():
    cv = Canvas(OUT_W, H, wrap=True)
    rng = random.Random(11)
    se = season.current
    if se == 'winter':                                   # a low soft deck of snow cloud
        for (x, base, w, h) in ((120, 70, 420, 34), (560, 58, 380, 30), (980, 74, 440, 36), (330, 104, 360, 24),
                                (800, 112, 400, 26), (1180, 98, 300, 22)):
            _cumulus(cv, rng, x, base, w, h, ramp=['cloud0', 'cloud1', 'cloud2', 'cloud2'], dither=0.08)
        return cv
    for (x, base, w, h) in ((140, 138, 170, 66), (470, 110, 90, 30), (700, 146, 130, 44), (980, 140, 200, 76),
                            (1200, 96, 80, 24)):
        if se == 'spring':                               # small and soft
            w, h = int(w * 0.75), int(h * 0.6)
        elif se == 'autumn':                             # flat, high and clear
            w, h, base = int(w * 1.2), int(h * 0.38), base - 30
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


def _ragged_snow(cv, far, slope, snowline, rng, full=False):
    """Snow on the far range that follows the mountain: thick on the peaks,
    running down the gullies in long fingers, ragged at its lower edge, with
    dark rock showing on the steep faces."""
    n1 = periodic_noise(OUT_W, [(9, 1), (23, 0.6), (51, 0.35)], rng, 1.0)
    n1 = (n1 - n1.min()) / (np.ptp(n1) or 1)
    k = np.ones(7) / 7.0
    sm = np.convolve(np.concatenate([slope[-3:], slope, slope[:3]]), k, 'valid')     # smoothed, wraps
    for x in range(OUT_W):
        top = int(round(far[x]))
        reach = (snowline - far[x]) * 1.1 + 4
        if full:
            reach = HORIZON - top
        if reach <= 0:
            continue
        fingers = 6 * max(0.0, math.sin(x * 0.37) * math.sin(x * 0.11 + 1.3)) ** 2
        depth = int(reach * (0.55 + 0.6 * n1[x]) + fingers)
        for d in range(min(depth, HORIZON - top)):
            y = top + d
            if full and d > 3 and (math.sin(x * 0.21 + y * 0.6) + math.sin(x * 0.05 - y * 0.13)) > 1.35:
                cv.px(x, y, 'haze2')                     # bare rock streaks in the gullies
                continue
            if d > 2 and (x * 7 + d * 5) % 13 == 0 and d > depth - 4:
                continue
            lit = sm[(x - int(d * 0.7)) % OUT_W] < 0.12              # faces lean with the light, not straight down
            cv.px(x, y, ('white' if d < 3 else 'cloud3') if lit else ('cloud2' if d < 4 else 'cloud1'))


def mountains():
    cv = Canvas(OUT_W, H, wrap=True)
    rng = random.Random(21)
    far = _ridge(rng, 122, 40, [(2, 10), (5, 6), (9, 3.5), (19, 1.6), (37, 0.7), (71, 0.3)])
    mid = _ridge(rng, 134, 22, [(3, 7), (6, 5), (11, 3), (23, 1.2), (47, 0.5)])
    near = _ridge(rng, 146, 10, [(4, 6), (9, 4), (17, 2), (41, 0.8)])
    se = season.current
    _paint_range(cv, far, ['haze2', 'haze3', 'cloud2'], rng, HORIZON, tex=0.25)
    # snow on the high peaks: bright on the sunlit side, blue in shade
    slope = np.gradient(far)
    snowline = np.percentile(far, dict(summer=30, spring=45, autumn=22, winter=97)[se])
    if se == 'summer':
        for x in range(OUT_W):
            top = int(round(far[x]))
            if far[x] < snowline:
                depth = int((snowline - far[x]) * 0.7) + 2
                for d in range(depth):
                    if (x * 7 + d * 3) % 11 == 0 and d > depth - 3:
                        continue
                    cv.px(x, top + d, 'cloud3' if slope[x] < 0.1 else 'cloud1')
    else:
        _ragged_snow(cv, far, slope, snowline, rng, full=se == 'winter')
    if se == 'winter':
        _paint_range(cv, mid, ['haze2', 'cloud1', 'cloud2'], rng, HORIZON, tex=0.4)
        mslope = np.gradient(mid)
        for x in range(OUT_W):                           # the middle range white to its foot, gullies in blue
            top = int(round(mid[x]))
            for y in range(top, HORIZON):
                if (math.sin(x * 0.21 + y * 0.6) + math.sin(x * 0.05 - y * 0.13)) > 1.2:
                    cv.px(x, y, 'haze2')
                elif y - top < 3:
                    cv.px(x, y, 'cloud3' if mslope[x] < 0.1 else 'cloud2')
    else:
        _paint_range(cv, mid, ['haze0', 'haze1', 'haze2'], rng, HORIZON, tex=0.4)
    # the near range is forested: dark teal with a bumpy canopy edge and tree texture
    autumn = ['teal1', 'copper1', 'red1', 'copper2', 'gold1', 'teal0']
    for x in range(OUT_W):
        top = int(round(near[x] - abs(math.sin(x * 0.9)) * 1.5))
        for y in range(top, HORIZON):
            d = y - top
            c = 'teal2' if d < 2 else ('teal1' if (x * 3 + y * 5) % 7 else 'teal0')
            h_ = (x * 7919 + y * 104729) % 97
            if se == 'autumn':                           # the forest turned: rust, red and gold among the pines
                patch = int((math.sin(x * 0.11) + math.sin(x * 0.037 + 2) + 2) * 1.4) % len(autumn)
                c = autumn[patch] if d >= 2 or h_ % 3 else ('copper3' if patch else 'teal2')
                if (x * 3 + y * 5) % 7 == 0:
                    c = 'red0' if patch in (1, 2) else 'teal0'
            elif se == 'winter':                         # snow lying on the forest
                c = 'cloud3' if d < 2 else ('cloud1' if h_ % 4 == 0 else ('teal1' if h_ % 3 else 'stone1'))
            elif se == 'spring' and h_ < 4 and d > 1:   # wild cherry dotted through it
                c = 'pink3' if h_ < 2 else 'pink2'
            cv.px(x, y, c)
    return cv


def hills():
    """Rolling wooded hills along the far shore: a canopy of many small tree
    crowns, each lit from the upper left, darker down in the folds."""
    cv = Canvas(OUT_W, H, wrap=True)
    rng = random.Random(31)
    # the near bank: wooded points and a little island, with open water between them
    prof = 200 - periodic_noise(OUT_W, [(2, 1), (4, 0.7), (7, 0.4), (13, 0.15)], rng, 34)
    yy = np.arange(H)[:, None]
    ground = yy >= prof[None, :]
    a = cv.a
    base = np.zeros((H, OUT_W), int)
    crowns = []
    for _ in range(900):                                 # tree crowns along the hill tops and slopes
        x = rng.uniform(0, OUT_W)
        top = prof[int(x) % OUT_W]
        if top > GROUND - 2:
            continue
        y = top + rng.uniform(-1, 14) ** 1.0
        r = rng.uniform(2.6, 5.2) * (1.0 - min(0.4, (y - top) / 60))
        crowns.append((x, y, r))
    crowns.sort(key=lambda c: c[1])
    cols = ['jade0', 'leaf1', 'jade1', 'leaf2', 'leaf3']
    sets = HILL_SETS[season.current]
    which = np.zeros((H, OUT_W), int)
    pick = random.Random(37)
    canopy = np.zeros((H, OUT_W), bool)
    for (x, y, r) in crowns:
        si = pick.choices(range(len(sets)), weights=[w_ for w_, _ in sets])[0]
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
                    which[Y, Xw] = si
                    canopy[Y, Xw] = True
    fill = ground | canopy
    for si, (_, cs) in enumerate(sets):
        for k, c in enumerate(cs):
            m = fill & (base == k) & canopy & (which == si)
            a[m] = (*PAL[c], 255)
    rest = ground & ~canopy
    a[rest] = (*PAL[HILL_GROUND[season.current]], 255)
    return cv


# crown colours on the far shore: [(weight, five tones dark..light)]
HILL_SETS = dict(
    summer=[(1, ['jade0', 'leaf1', 'jade1', 'leaf2', 'leaf3'])],
    spring=[(4, ['leaf0', 'leaf1', 'leaf2', 'leaf3', 'leaf4']), (1, ['pink0', 'pink1', 'pink2', 'pink3', 'pink4']),
            (1, ['jade0', 'leaf1', 'jade1', 'leaf2', 'leaf3'])],
    autumn=[(3, ['red0', 'red1', 'scarlet2', 'scarlet3', 'fire3']), (3, ['red0', 'copper1', 'copper2', 'fire3', 'gold3']),
            (2, ['wood1', 'gold0', 'gold1', 'gold2', 'gold3']), (2, ['jade0', 'leaf1', 'jade1', 'leaf2', 'leaf3'])],
    winter=[(3, ['teal0', 'stone1', 'haze2', 'cloud2', 'cloud3']), (2, ['stone0', 'stone1', 'stone2', 'cloud1', 'cloud3'])])
HILL_GROUND = dict(summer='jade0', spring='leaf0', autumn='wood1', winter='cloud1')


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
    se = season.current
    prof = GROUND - periodic_noise(OUT_W, [(2, 1), (5, 0.5), (12, 0.25)], rng, 4)
    base = Canvas(OUT_W, H, wrap=True)
    g_fill, g_top, g_top2 = GROUND_COLS[se]
    for x in range(OUT_W):
        top = int(prof[x])
        base.vline(x, top, H - 1, g_fill)
        base.px(x, top, g_top)
        base.px(x, top + 1, g_top2)
        if se == 'winter' and (x * 37) % 23 < 3:                 # blue hollows in the snow
            base.vline(x, top + 3, top + 5, 'cloud1')
        if se == 'autumn' and (x * 53) % 17 < 3:                 # fallen leaves in the grass
            base.px(x, top + 2 + (x % 3), ('scarlet2', 'fire3', 'gold3')[x % 3])
    for i, x in enumerate(range(380, 460, 12)):
        y = int(prof[x]) + 4 + i % 2
        base.ellipse(x, y, 3.5, 1.4, 'stone3')
        base.hline(x - 2, x + 1, y - 1, 'white' if se == 'winter' else 'stone4')
    # grown trees (grove.py): a back row, hazed, then the big ones
    back = [(grove.oak(21, k=0.62, ramp=grove.LEAF_RICH), 40), (grove.cypress(22, k=0.7), 250),
            (grove.oak(23, k=0.66), 470), (grove.zelkova(24, k=0.58), 790), (grove.cypress(25, k=0.66), 1010),
            (grove.oak(26, k=0.62), 1140)]
    front = [(grove.black_pine(2, k=0.95), 130), (grove.zelkova(3, k=0.92), 365), (grove.birch(9, k=0.85), 560),
             (grove.willow(7, k=0.95), 690), (grove.oak(4, k=0.95), 910), (grove.cypress(11, k=0.88), 1065),
             (grove.birch(19, k=0.78), 1205)]
    tree_frames = []
    gust = lambda x: -2 * math.pi * x / (OUT_W / 4.0)               # the wind reaches trees further right later
    for T, x in back:
        frs = T.frames(wind_phase=gust(x), wind=0.8)
        for fr in frs:
            _haze(fr, 1)
        tree_frames.append((frs, x - T.base[0], int(prof[x % OUT_W]) + 2 - T.base[1], T.h + 1000))
    for T, x in front:
        frs = T.frames(wind_phase=gust(x), wind=1.0)
        tree_frames.append((frs, x - T.base[0], int(prof[x % OUT_W]) + 4 - T.base[1], T.h))
    tree_frames.sort(key=lambda t: -t[3])        # tallest drawn first (behind)
    bushes = []
    for (sd, x, rx, ry, kind) in ((11, 240, 14, 8, 'hyd'), (12, 760, 12, 7, 'green'), (13, 1080, 12, 7, 'green'),
                                  (14, 620, 10, 6, 'green'), (15, 40, 13, 8, 'hyd'), (16, 1230, 11, 6, 'green')):
        if kind == 'hyd' and se == 'summer':
            spr = _hydrangea_bush(sd, rx, ry)
            bushes.append((spr, x - spr.w // 2, int(prof[x % OUT_W]) + 4 - spr.h))
        else:
            S = grove.shrub(sd, rx * 3, ry * 3)
            frs = S.frames()
            bushes.append((frs, x - S.w // 2, int(prof[x % OUT_W]) + 4 - S.h))
    if se == 'summer':
        grass = meadow.meadow(OUT_W, GROUND, random.Random(42),
                              [(2, 5, 5, 1, 7), (5, 7, 6, 1, 9)], ['daisy'],
                              flower_rate=0.05, height=H, fill=False)
    elif se == 'spring':
        grass = meadow.meadow(OUT_W, GROUND, random.Random(42),
                              [(2, 5, 5, 1, 7), (5, 7, 6, 1, 9)], ['daisy', 'cosmos_white'],
                              flower_rate=0.09, height=H, fill=False)
    elif se == 'autumn':
        grass = meadow.meadow(OUT_W, GROUND, random.Random(42),
                              [(2, 5, 5, 1, 7), (5, 7, 6, 1, 9)], ['spider_lily'],
                              flower_rate=0.05, susuki_rate=0.05, height=H, fill=False)
    else:
        grass = meadow.meadow(OUT_W, GROUND, random.Random(42),
                              [(4, 5, 4, 1, 26)], [], flower_rate=0.0, susuki_rate=0.1, height=H, fill=False)
    _season_grass(grass)
    frames = []
    for f in range(grove.F):
        cv = base.copy()
        for (fr, x, y, _) in tree_frames:
            cv.blit(fr[f], x, y)
        for (spr, x, y) in bushes:
            cv.blit(spr[f % len(spr)] if isinstance(spr, list) else spr, x, y)
        cv.blit(grass[f % len(grass)], 0, 0)
        if se == 'winter':                                         # snow drifted against the stalks
            for x in range(OUT_W):
                top = int(prof[x]) + 3 + int(1.5 * math.sin(x * 0.13) + math.sin(x * 0.041))
                cv.vline(x, top, top + 2, 'cloud3')
                cv.px(x, top, 'white')
        frames.append(cv)
    # leaves or petals coming off the trees, and lying under them
    boxes = []
    for (fr, x, y, _) in tree_frames:
        a = fr[0].a
        turned = sum(int(((a[..., :3] == PAL[c]).all(-1) & (a[..., 3] > 0)).sum())
                     for c in ('pink3', 'pink4', 'scarlet2', 'fire3', 'gold3', 'copper2'))
        boxes.append((x, y, fr[0].w, fr[0].h * 0.6, turned > 120))
    life.garden_fall(frames, boxes, lambda x: prof[int(x) % OUT_W] + 3, se)
    return grove.garden_life(frames, random.Random(43), GROUND)


GROUND_COLS = dict(summer=('leaf1', 'leaf3', 'leaf2'), spring=('leaf2', 'leaf4', 'leaf3'),
                   autumn=('gold1', 'gold3', 'gold2'), winter=('cloud2', 'white', 'cloud3'))


def _season_grass(frames):
    """Grass and plant leaves turned for the season (summer stays green)."""
    se = season.current
    if se == 'summer':
        return frames
    for fr in frames:
        if se == 'autumn':                                         # mostly gold, some still green
            xx = np.arange(fr.w)[None, :]
            green = np.broadcast_to((np.sin(xx * 0.023) + np.sin(xx * 0.071 + 1.3)) > 1.1, fr.a.shape[:2])
            season.remap(fr, season.GRASS_AUTUMN_GREEN, green)
            season.remap(fr, season.GRASS['autumn'], ~green)
        else:
            season.remap(fr, season.GRASS[se])
    return frames


def flowers_close():
    """Just outside the glass: a green bed - tall grass, ferny tufts, a few
    white and blue flowers, pampas. F frames."""
    rng = random.Random(51)
    se = season.current
    rows = [(-3, 12, 7, 1, 7), (1, 16, 8, 0, 9), (6, 20, 9, 0, 10)]
    if se == 'summer':
        return meadow.meadow(OUT_W, 214, rng, rows, ['daisy', 'bellflower', 'cosmos_white', 'lavender'],
                             flower_rate=0.16, susuki_rate=0.06, height=H)
    if se == 'spring':
        fr = meadow.meadow(OUT_W, 214, rng, rows, ['daisy', 'cosmos', 'cosmos_white', 'bellflower'],
                           flower_rate=0.22, susuki_rate=0.0, height=H)
    elif se == 'autumn':
        fr = meadow.meadow(OUT_W, 214, rng, rows, ['spider_lily', 'marigold', 'cosmos'],
                           flower_rate=0.13, susuki_rate=0.16, height=H)
    else:
        fr = meadow.meadow(OUT_W, 214, rng, [(0, 14, 6, 0, 16), (5, 18, 7, 0, 22)], [],
                           flower_rate=0.0, susuki_rate=0.12, height=H)
    _season_grass(fr)
    if se == 'autumn':                                     # the soil under the bed: one even colour
        for cv in fr:
            band = cv.a[215:]
            m = (band[..., 3] > 0) & (((band[..., :3] == PAL['leaf1']).all(-1)) | ((band[..., :3] == PAL['copper1']).all(-1)))
            band[m, :3] = PAL['gold1']
    if se == 'winter':                                     # deep snow over the bed, dry stalks poking through
        for f, cv in enumerate(fr):
            for x in range(OUT_W):
                top = int(206 + 2.5 * math.sin(x * 0.045) + 1.6 * math.sin(x * 0.13 + 1) + math.sin(x * 0.31))
                cv.vline(x, top, H - 1, 'cloud3')
                cv.px(x, top, 'white')
                cv.px(x, top + 1, 'white')
                if (x * 29) % 37 < 4:
                    cv.vline(x, top + 3, top + 6, 'cloud2')
    return fr


PARTICLES_N = 24


def particles():
    """Things on the wind, in front of the garden: cherry petals in spring,
    leaves in autumn, snow in winter. PARTICLES_N frames that loop: each piece
    fades in, drifts down and across, tumbling, and fades out. None in summer."""
    se = season.current
    rng = random.Random(61)
    frames = [Canvas(OUT_W, H, wrap=True) for _ in range(PARTICLES_N)]
    count = dict(spring=230, autumn=150, winter=620, summer=40)[se]
    for i in range(count):
        x0, y0 = rng.uniform(0, OUT_W), rng.uniform(-30, H - 40)
        if se == 'winter':
            near = rng.random() < 0.25
            fall, drift, amp = rng.uniform(50, 90) * (1.5 if near else 1), rng.uniform(10, 40), rng.uniform(1, 3)
        else:
            near = rng.random() < 0.3
            fall, drift, amp = rng.uniform(30, 70), rng.uniform(50, 120), rng.uniform(2, 6)
        ph0, sw = rng.randrange(PARTICLES_N), rng.uniform(0, 6.28)
        kind = rng.randrange(3)
        for f in range(PARTICLES_N):
            u = ((f - ph0) % PARTICLES_N) / PARTICLES_N
            x = x0 + drift * u + amp * math.sin(4 * math.pi * u + sw)
            y = y0 + fall * u
            al = 255 if 0.12 < u < 0.88 else 110
            cv = frames[f]
            tumble = (f + i) % 4
            if se == 'winter':
                cells = [(0, 0, 'white')] if not near else [(0, 0, 'white'), (1, 0, 'cloud3'), (0, 1, 'cloud3'),
                                                            (1, 1, 'cloud2')]
            elif se == 'summer':                                 # dandelion seeds floating by
                cells = [(0, 0, 'white'), (0, 1, 'cloud2')] if tumble % 2 else [(0, 0, 'cloud3'), (1, 0, 'white')]
            elif se == 'spring':
                c1, c2 = ('pink4', 'pink3') if kind else ('white', 'pink4')
                cells = ([(0, 0, c1), (1, 0, c2)], [(0, 0, c1), (1, 1, c2)], [(0, 0, c1), (0, 1, c2)],
                         [(0, 0, c2)])[tumble]
                if near and tumble != 3:
                    cells = cells + [(1, 1, c1)]
            else:
                c1, c2 = (('scarlet3', 'scarlet1'), ('fire3', 'copper2'), ('gold3', 'gold1'))[kind]
                cells = ([(0, 0, c1), (1, 0, c1), (1, 1, c2), (2, 1, c2)], [(0, 0, c1), (0, 1, c2), (1, 1, c1)],
                         [(0, 0, c2), (1, 0, c1), (2, 0, c2)], [(1, 0, c1), (0, 1, c1), (1, 1, c2), (1, 2, c2)])[tumble]
            for dx, dy, c in cells:
                X, Y = int(x) + dx, int(y) + dy
                if 0 <= Y < H:
                    cv.a[Y, X % OUT_W] = (*PAL[c], al)
    if se != 'winter':
        life.wind_streaks(frames, se)
    return frames


def all_layers():
    """(name, frames, parallax[, (x, y) crop offset]) back to front."""
    import lake
    if season.current in ('bloodmoon', 'rain', 'eclipse'):          # the weather draws its own view
        import importlib
        return importlib.import_module(season.current).all_layers()
    sk, cl, mt = sky(), clouds(), mountains()
    above = sk.a.copy()
    for L in (cl, mt):
        m = L.a[..., 3] > 0
        above[m] = L.a[m]
    water = []
    for arr in lake.lake_frames(above, HORIZON, OUT_W, H, season.current):
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
    fish, (fx, fy) = life.lake(season.current)
    birds, (bx_, by_) = life.birds(season.current)
    out = [
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
    pt = particles()
    if pt:
        out.append(('08_' + PARTICLE_NAME[season.current], pt, 0.75))
    return out


PARTICLE_NAME = dict(spring='petals', autumn='leaves', winter='snowfall', summer='wind')
LIFE_LAYERS = ('04_lake_life', '04_birds', '04_bats', '08_rain')         # these run at life.FPS
