"""The view through the windows (v2): six horizontally tileable parallax
layers, OUT_W wide and the full scene height. Green trees only - big,
close and animated so the garden fills the windows."""
import math
import random
import numpy as np
from pixel import Canvas, PAL, col, step, periodic_noise
from shapes import shade_puffs, flower, small_leaf
from trees import (F, GREEN, DEEP, JADE, tree_pine, tree_oak, tree_bushy, tree_windswept, tree_willow,
                   bush, small_tree)
import meadow
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
    cv = Canvas(OUT_W, H, wrap=True)
    bands = [(0, 'sky1'), (96, 'sky2'), (124, 'sky3'), (148, 'sky4')]
    for i, (y0, c) in enumerate(bands):
        y1 = bands[i + 1][0] if i + 1 < len(bands) else H
        cv.rect(0, y0, OUT_W, y1 - y0, c)
    for i in range(1, len(bands)):
        dither_seam(cv, bands[i][0] - 5, 10, bands[i - 1][1], bands[i][1])
    rng = random.Random(3)
    for _ in range(18):
        x = rng.randint(0, OUT_W)
        y = rng.randint(30, 130)
        ln = rng.randint(14, 50)
        c = step(cv.get(x, y)[:3], 1)
        cv.hline(x, x + ln, y, c)
        cv.hline(x + 5, x + ln - 8, y + 1, c)
    return cv


def clouds():
    cv = Canvas(OUT_W, H, wrap=True)
    rng = random.Random(11)
    storm = []
    for i in range(26):
        t = i / 25
        storm.append((760 + i * 12 + rng.uniform(-4, 4), 128 - math.sin(math.pi * t) * 24 + rng.uniform(-4, 4),
                      rng.uniform(8, 15) + math.sin(math.pi * t) * 8))
    shade_puffs(cv, storm, STORM, clip_bottom=150, dither=0.04, cuts=[-0.05, 0.35, 0.8])
    for (x, base, w, h) in ((140, 138, 170, 66), (430, 108, 90, 30), (600, 146, 120, 40), (920, 140, 200, 76),
                            (1180, 92, 80, 24)):
        _cumulus(cv, rng, x, base, w, h)
    for (x, y, w) in ((300, 66, 34), (560, 56, 24), (1040, 50, 40), (60, 40, 26), (800, 30, 30)):
        for k in range(w):
            cv.px(x + k, y, 'cloud3' if k % 7 else 'cloud2')
            if 3 < k < w - 4:
                cv.px(x + k, y + 1, 'cloud2')
    return cv


def _tree_band(cv, rng, y, c, c2):
    x = 0
    while x < OUT_W + 6:
        r = rng.uniform(1.8, 3.6)
        cv.ellipse(x, y - r * 0.4, r, r * 0.9, c)
        cv.px(int(x - r * 0.4), int(y - r), c2)
        x += rng.uniform(2, 4)
    cv.rect(0, y, OUT_W, 3, c)


def mountains():
    cv = Canvas(OUT_W, H, wrap=True)
    rng = random.Random(21)
    far = 128 - periodic_noise(OUT_W, [(2, 10), (5, 6), (9, 3.5), (19, 1.6), (37, 0.7)], rng, 1.0)
    near = 148 - periodic_noise(OUT_W, [(3, 7), (7, 5), (13, 3), (29, 1.2)], rng, 1.0)
    _faceted(cv, far, 'haze3', 'haze2', 'cloud2', rng)
    _faceted(cv, near, 'haze2', 'haze1', 'haze3', rng)
    _tree_band(cv, rng, HORIZON - 3, 'haze1', 'haze2')
    for y in range(HORIZON, H):
        cv.hline(0, OUT_W - 1, y, 'water1' if y < HORIZON + 10 else 'water0')
    dither_seam(cv, HORIZON + 8, 5, 'water1', 'water0')
    cv.hline(0, OUT_W - 1, HORIZON, 'haze2')
    for x in range(OUT_W):
        depth = int((HORIZON - near[x]) * 0.3)
        for d in range(1, depth, 2):
            if (x // 4 + d) % 3:
                cv.px(x, HORIZON + 1 + d, 'haze0')
    tx = 520
    _tower(cv, tx, HORIZON)
    for d in range(2, 24, 2):
        for xx in range(tx - 8 + d // 4, tx + 9 - d // 4):
            if (xx // 2 + d) % 3:
                cv.px(xx, HORIZON + 2 + d, 'red1')
    rng = random.Random(8)
    for _ in range(140):
        x, y = rng.randint(0, OUT_W), rng.randint(HORIZON + 2, HORIZON + 34)
        cv.hline(x, x + rng.randint(2, 8), y, 'cloud3' if rng.random() < 0.35 else 'water2')
    return cv


def hills():
    """Mid-distance green shore with medium trees (static, softer outline)."""
    cv = Canvas(OUT_W, H, wrap=True)
    rng = random.Random(31)
    prof = 182 - periodic_noise(OUT_W, [(3, 1), (5, 0.6), (9, 0.3)], rng, 12)
    for x in range(OUT_W):
        top = int(prof[x])
        if top > HORIZON + 12:
            top = H
        for y in range(top, H):
            cv.px(x, y, 'leaf2' if y < top + 3 else 'leaf1')
        if top < H:
            cv.px(x, top, 'leaf3')
    for x in range(OUT_W):
        if not cv.get(x, HORIZON + 16)[3]:
            for y in range(HORIZON + 16, H):
                cv.px(x, y, 'leaf1')
    # red footbridge (the one warm accent out there)
    bx0, bx1, by = 900, 1010, HORIZON + 10
    for x in range(bx0, bx1 + 1):
        t = (x - bx0) / (bx1 - bx0)
        arch = int(math.sin(math.pi * t) * 7)
        cv.px(x, by - arch, 'red3'); cv.px(x, by - arch + 1, 'red1'); cv.px(x, by - arch - 5, 'red4')
        if (x - bx0) % 6 == 0:
            cv.vline(x, by - arch - 5, by - arch, 'red2')
        if (x - bx0) % 18 == 0:
            cv.vline(x, by - arch + 1, by + 7, 'red1')
    hazy = ['leaf1', 'leaf1', 'leaf2', 'leaf3', 'leaf4']
    hazy_j = ['jade1', 'jade1', 'jade2', 'jade3', 'jade4']
    for i in range(34):
        x = rng.randint(0, OUT_W)
        ground = int(prof[x % OUT_W])
        if ground > HORIZON + 12:
            continue
        T = small_tree(rng.randint(0, 9999), hazy if i % 3 else hazy_j, scale=rng.uniform(0.45, 0.8))
        cv.blit(T.frame(0), x - T.base[0], ground + 3 - T.base[1])
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
    specs = [(tree_pine(2, k=0.72), 140), (tree_oak(4, k=0.8), 330), (tree_willow(7, k=0.75), 560),
             (tree_windswept(6, JADE, k=0.78), 800), (tree_bushy(5, k=0.72), 1010),
             (tree_bushy(9, JADE, k=0.6), 450), (tree_oak(12, JADE, k=0.65), 1190), (tree_bushy(13, k=0.55), 690),
             (tree_pine(14, k=0.55), 920)]
    tree_frames = []
    for T, x in specs:
        frs = T.frames()
        for fr in frs:
            _haze(fr, 1)
        tree_frames.append((frs, x - T.base[0], int(prof[x % OUT_W]) + 3 - T.base[1], T.h))
    tree_frames.sort(key=lambda t: -t[3])        # tallest drawn first (behind)
    bushes = []
    for (sd, x, rx, ry, kind) in ((11, 240, 14, 8, 'hyd'), (12, 760, 12, 7, 'hyd'), (13, 1080, 12, 7, 'green'),
                                  (14, 620, 10, 6, 'green'), (15, 40, 13, 8, 'hyd'), (16, 1230, 11, 6, 'green')):
        spr = _hydrangea_bush(sd, rx, ry) if kind == 'hyd' else bush(sd, rx, ry)
        _haze(spr, 1)
        bushes.append((spr, x - spr.w // 2, int(prof[x % OUT_W]) + 4 - spr.h))
    grass = meadow.meadow(OUT_W, GROUND, random.Random(42),
                          [(2, 5, 5, 1, 7), (5, 7, 6, 1, 9)], ['daisy'],
                          flower_rate=0.05, height=H, fill=False)
    frames = []
    for f in range(F):
        cv = base.copy()
        for (fr, x, y, _) in tree_frames:
            cv.blit(fr[f], x, y)
        for (spr, x, y) in bushes:
            cv.blit(spr, x, y)
        cv.blit(grass[f], 0, 0)
        frames.append(cv)
    return frames


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
