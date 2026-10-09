"""The view through the windows: six horizontally tileable parallax layers.
Each is OUT_W wide and the full scene height so it lines up with the room."""
import math
import random
import numpy as np
from pixel import Canvas, PAL, col, step, periodic_noise
from shapes import shade_puffs, flower, small_leaf, canopy
from trees import (F, tree_pine, tree_sakura, tree_maple, tree_wisteria, tree_bushy, bush,
                   small_tree)
import meadow

OUT_W = 960
H = 270
HORIZON = 118          # lake surface line in scene coordinates

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


def sky():
    cv = Canvas(OUT_W, H, wrap=True)
    bands = [(0, 'sky1'), (58, 'sky2'), (80, 'sky3'), (100, 'sky4')]
    for i, (y0, c) in enumerate(bands):
        y1 = bands[i + 1][0] if i + 1 < len(bands) else H
        cv.rect(0, y0, OUT_W, y1 - y0, c)
    for i in range(1, len(bands)):
        dither_seam(cv, bands[i][0] - 4, 8, bands[i - 1][1], bands[i][1])
    # thin high streaks
    rng = random.Random(3)
    for _ in range(14):
        x = rng.randint(0, OUT_W)
        y = rng.randint(30, 90)
        ln = rng.randint(10, 40)
        c = step(cv.get(x, y)[:3], 1)
        cv.hline(x, x + ln, y, c)
        cv.hline(x + 4, x + ln - 6, y + 1, c)
    return cv


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


def clouds():
    cv = Canvas(OUT_W, H, wrap=True)
    rng = random.Random(11)
    # distant storm bank (Ghibli: bright cumulus against a dark smoky mass)
    storm = []
    for i in range(22):
        t = i / 21
        storm.append((540 + i * 11 + rng.uniform(-4, 4), 84 - math.sin(math.pi * t) * 18 + rng.uniform(-4, 4),
                      rng.uniform(7, 13) + math.sin(math.pi * t) * 6))
    shade_puffs(cv, storm, STORM, clip_bottom=100, dither=0.04, cuts=[-0.05, 0.35, 0.8])
    _cumulus(cv, rng, 110, 92, 120, 46)
    _cumulus(cv, rng, 330, 72, 70, 24)
    _cumulus(cv, rng, 470, 100, 90, 30)
    _cumulus(cv, rng, 690, 98, 150, 56)
    _cumulus(cv, rng, 880, 60, 60, 18)
    # small wisps
    for (x, y, w) in ((230, 48, 26), (420, 40, 18), (780, 36, 30), (40, 30, 20)):
        for k in range(w):
            cv.px(x + k, y, 'cloud3' if k % 7 else 'cloud2')
            if 3 < k < w - 4:
                cv.px(x + k, y + 1, 'cloud2')
    return cv


def _ridge(rng, octaves, base, amp):
    return base - periodic_noise(OUT_W, octaves, rng, amp)


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
    jade roofs, gold finial, a boiler chimney with a smoke trail."""
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
    # chimney rising from the island
    cx = x + 16
    cv.rect(cx, ground - 40, 2, 38, 'stone2')
    cv.vline(cx, ground - 40, ground - 2, 'stone3')
    cv.hline(cx - 1, cx + 2, ground - 40, 'stone1')
    rng = random.Random(4)
    for k in range(9):
        px_ = cx + 2 + k * 3.4 + rng.uniform(-0.5, 0.5)
        py_ = ground - 42 - k * 1.7 - k * k * 0.08
        r = 1.6 + k * 0.7
        cv.ellipse(px_, py_, r, r * 0.85, 'smoke0' if k < 3 else 'smoke1')
        cv.ellipse(px_ - r * 0.3, py_ - r * 0.3, r * 0.6, r * 0.5, 'smoke1' if k < 3 else 'smoke2')


def mountains():
    cv = Canvas(OUT_W, H, wrap=True)
    rng = random.Random(21)
    far = 90 - periodic_noise(OUT_W, [(2, 8), (5, 5), (9, 3), (19, 1.4), (37, 0.6)], rng, 1.0)
    near = 104 - periodic_noise(OUT_W, [(3, 6), (7, 4), (13, 2.5), (29, 1.0)], rng, 1.0)
    _faceted(cv, far, 'haze3', 'haze2', 'cloud2', rng)
    _faceted(cv, near, 'haze2', 'haze1', 'haze3', rng)
    _tree_band(cv, rng, HORIZON - 3, 'haze1', 'haze2')
    # lake
    for y in range(HORIZON, H):
        cv.hline(0, OUT_W - 1, y, 'water1' if y < HORIZON + 8 else 'water0')
    dither_seam(cv, HORIZON + 6, 4, 'water1', 'water0')
    cv.hline(0, OUT_W - 1, HORIZON, 'haze2')
    # mirrored ridge, broken into ripples
    for x in range(OUT_W):
        depth = int((HORIZON - near[x]) * 0.3)
        for d in range(1, depth, 2):
            if (x // 4 + d) % 3:
                cv.px(x, HORIZON + 1 + d, 'haze0')
    tx = 300
    _tower(cv, tx, HORIZON)
    for d in range(2, 22, 2):
        for xx in range(tx - 8 + d // 4, tx + 9 - d // 4):
            if (xx // 2 + d) % 3:
                cv.px(xx, HORIZON + 2 + d, 'red1')
    for d in range(2, 30, 3):
        cv.px(tx + 17 + (d % 2), HORIZON + 2 + d, 'stone1')
    rng = random.Random(8)
    for _ in range(90):
        x, y = rng.randint(0, OUT_W), rng.randint(HORIZON + 2, HORIZON + 26)
        ln = rng.randint(2, 7)
        cv.hline(x, x + ln, y, 'cloud3' if rng.random() < 0.35 else 'water2')
    return cv


def _puff_tree(cv, rng, x, ground, h, r, ramp, trunk='wood1', n=7):
    """Distant tree made with the same leaf recipe, softer outline."""
    hazy = [ramp[0]] + list(ramp)
    T = small_tree(rng.randint(0, 9999), hazy, scale=max(0.35, r / 16))
    fr = T.frame(0)
    cv.blit(fr, x - T.base[0], ground - T.base[1])


def _pine_small(cv, x, ground, h, ramp):
    cv.vline(x, ground - h, ground, 'wood1')
    for i in range(0, h - 2, 3):
        w = int((h - i) * 0.35) + 1
        y = ground - i - 3
        cv.hline(x - w, x + w, y, ramp[1])
        cv.hline(x - w + 1, x + w - 1, y - 1, ramp[2])
        cv.px(x - w + 1, y - 1, ramp[3])


def hills():
    cv = Canvas(OUT_W, H, wrap=True)
    rng = random.Random(31)
    prof = 126 - periodic_noise(OUT_W, [(3, 1), (5, 0.6), (9, 0.3)], rng, 9)
    # islands of hill, leaving gaps where the lake shows through
    for x in range(OUT_W):
        top = int(prof[x])
        if top > HORIZON + 6:
            top = H  # gap
        for y in range(top, H):
            cv.px(x, y, 'leaf2' if y < top + 3 else 'leaf1')
        if top < H:
            cv.px(x, top, 'leaf3')
            if (x // 2) % 3 == 0:
                cv.px(x, top - 1, 'leaf3')
    # shoreline below hills
    for x in range(OUT_W):
        if cv.get(x, HORIZON + 10)[3]:
            continue
        for y in range(HORIZON + 10, H):
            cv.px(x, y, 'leaf1')
    # red footbridge over a gap
    bx0, bx1, by = 470, 560, HORIZON + 6
    for x in range(bx0, bx1 + 1):
        t = (x - bx0) / (bx1 - bx0)
        arch = int(math.sin(math.pi * t) * 6)
        cv.px(x, by - arch, 'red3')
        cv.px(x, by - arch + 1, 'red1')
        cv.px(x, by - arch - 4, 'red4')
        if (x - bx0) % 6 == 0:
            cv.vline(x, by - arch - 4, by - arch, 'red2')
        if (x - bx0) % 15 == 0:
            cv.vline(x, by - arch + 1, by + 6, 'red1')
        if (x + 1) % 3 and x % 2 == 0:
            cv.px(x, by + 8 + arch // 2, 'red0')  # reflection
    # tree clumps
    for i in range(26):
        x = rng.randint(0, OUT_W)
        ground = int(prof[x % OUT_W])
        if ground > HORIZON + 6:
            continue
        if rng.random() < 0.35:
            _pine_small(cv, x, ground + 2, rng.randint(10, 18), ['leaf0', 'leaf1', 'leaf2', 'leaf3'])
        else:
            ramp = ['leaf1', 'leaf2', 'leaf3', 'leaf4']
            if rng.random() < 0.25:
                ramp = ['pink0', 'pink1', 'pink2', 'pink3']
            _puff_tree(cv, rng, x, ground + 2, rng.randint(6, 12), rng.uniform(5, 9), ramp, n=5)
    # tiny houses with jade roofs on the right hill
    for hx in (760, 782, 805):
        g = int(prof[hx]) + 3
        if g > HORIZON + 8:
            continue
        cv.rect(hx - 4, g - 6, 9, 6, 'paper3')
        cv.vline(hx - 4, g - 6, g, 'paper4')
        cv.px(hx, g - 3, 'wood1')
        cv.hline(hx - 6, hx + 6, g - 7, 'jade2')
        cv.hline(hx - 5, hx + 5, g - 8, 'jade3')
        cv.hline(hx - 3, hx + 3, g - 9, 'jade3')
        cv.hline(hx - 6, hx + 6, g - 6, 'jade0')
    return cv


def _stone_lantern(cv, x, ground):
    s = ['stone1', 'stone2', 'stone3', 'stone4']
    cv.rect(x - 5, ground - 4, 11, 4, s[1]); cv.hline(x - 5, x + 5, ground - 4, s[2])
    cv.rect(x - 2, ground - 16, 5, 12, s[1]); cv.vline(x - 2, ground - 16, ground - 5, s[2])
    cv.rect(x - 6, ground - 19, 13, 3, s[2]); cv.hline(x - 6, x + 6, ground - 19, s[3])
    cv.rect(x - 4, ground - 27, 9, 8, s[1]); cv.rect(x - 2, ground - 25, 4, 4, 'fire2')
    cv.px(x - 1, ground - 24, 'fire3'); cv.vline(x - 4, ground - 27, ground - 20, s[2])
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


def trees():
    """Garden just outside: big animated trees, hydrangea / azalea bushes,
    stone lanterns, stepping stones and grass. Returns F frames."""
    rng = random.Random(41)
    ground = 144
    prof = ground - periodic_noise(OUT_W, [(2, 1), (5, 0.5), (12, 0.25)], rng, 4)
    base = Canvas(OUT_W, H, wrap=True)
    for x in range(OUT_W):
        top = int(prof[x])
        base.vline(x, top, H - 1, 'leaf1')
        base.px(x, top, 'leaf3')
        base.px(x, top + 1, 'leaf2')
    _stone_lantern(base, 330, int(prof[330]) + 3)
    _stone_lantern(base, 706, int(prof[706]) + 3)
    for i, x in enumerate(range(380, 470, 14)):
        y = int(prof[x]) + 4 + i % 2
        base.ellipse(x, y, 4, 1.6, 'stone2')
        base.hline(x - 2, x + 1, y - 1, 'stone3')
    # trees: (builder, x of trunk base)
    specs = [(tree_pine(2), 120), (tree_sakura(1), 410), (tree_maple(3), 600), (tree_wisteria(8), 800),
             (tree_bushy(5), 268)]
    tree_frames = []
    for T, x in specs:
        tree_frames.append((T.frames(), x - T.base[0], int(prof[x % OUT_W]) + 3 - T.base[1]))
    tree_frames.sort(key=lambda t: t[0][0].h)          # small/tall ordering: tall ones behind
    bushes = []
    for (sd, x, rx, ry, kind) in ((11, 200, 18, 11, 'hyd'), (12, 500, 16, 10, 'hyd'), (13, 690, 14, 9, 'azalea'),
                                  (14, 900, 18, 11, 'hyd'), (15, 350, 12, 8, 'azalea'), (16, 30, 14, 9, 'hyd')):
        if kind == 'hyd':
            spr = _hydrangea_bush(sd, rx, ry)
        else:
            spr = bush(sd, rx, ry, ['pink0', 'pink1', 'pink2', 'pink3', 'pink4', 'white'])
        bushes.append((spr, x - spr.w // 2, int(prof[x % OUT_W]) + 4 - spr.h))
    grass = meadow.meadow(OUT_W, ground, random.Random(42),
                          [(2, 7, 5, 1, 7), (5, 9, 6, 1, 9)], ['daisy', 'cosmos', 'bellflower'],
                          flower_rate=0.15, height=H, fill=False)
    frames = []
    for f in range(F):
        cv = base.copy()
        for (fr, x, y) in tree_frames:
            cv.blit(fr[f], x, y)
        for (spr, x, y) in bushes:
            cv.blit(spr, x, y)
        cv.blit(grass[f], 0, 0)
        frames.append(cv)
    return frames


def flowers_close():
    """Just outside the glass: flower bed with pampas grass. F frames."""
    rng = random.Random(51)
    return meadow.meadow(OUT_W, 152, rng,
                         [(-3, 10, 6, 1, 6), (1, 13, 7, 0, 8), (6, 16, 8, 0, 9)],
                         ['daisy', 'cosmos', 'cosmos_white', 'bellflower', 'spider_lily', 'lavender',
                          'marigold'],
                         flower_rate=0.32, susuki_rate=0.05, height=H)


def all_layers():
    """[(name, frames, parallax factor)] back to front. Animated layers have
    F frames, static ones a single frame."""
    return [
        ('00_sky', [sky()], 0.04),
        ('01_clouds', [clouds()], 0.08),
        ('02_mountains_lake', [mountains()], 0.16),
        ('03_hills_bridge', [hills()], 0.30),
        ('04_trees_garden', trees(), 0.50),
        ('05_flowers_close', flowers_close(), 0.72),
    ]
