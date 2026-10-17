"""What lives and moves out in the view, season by season.

birds(season): a cropped layer of the sky over the lake, NB frames at FPS.
    spring   swallows swooping and darting low over the water
    summer   swallows, and a white egret flapping slowly across
    autumn   a skein of geese in a V crossing the sky, calling, and a little
             flock of sparrows
    winter   a pair of red-crowned cranes gliding across, and crows
Flocks that cross go the whole way round the 1280 px tile once per loop, so
the layer loops seamlessly; swallows fly closed loops.

lake(season): a cropped layer on the lake, NL frames at FPS.
    fish gliding under the surface (dark shapes, a few orange ones), a fish
    jumping now and then with a splash and rings, and a pair of ducks
    paddling with a V of ripples behind them (swans in winter)

garden_fall(frames, trees, season): leaves or petals coming off the trees in
the garden layer and turning as they fall, and a carpet of them on the
ground under each tree.

wind_streaks(frames): faint gusts drawn on the wind layer."""
import math
import random
import numpy as np
from pixel import PAL

FPS = 12
NB = 144                     # birds: 12 s
NL = 96                      # lake life: 8 s
TILE = 1280
BIRDS_Y, BIRDS_H = 24, 128   # crop of the sky band (layer y)
LAKE_Y, LAKE_H = 148, 64     # crop of the lake band


def _px(a, x, y, c, al=255):
    h, w = a.shape[:2]
    x, y = int(x) % w, int(y)
    if 0 <= y < h:
        a[y, x] = (*PAL[c], al)


# ---------------------------------------------------------------- birds
# Hand-drawn flight poses, the way birds read at a distance: wings raised in a V,
# spread in a gull's M, level, and pulled down. 'w' wing, 't' wing tip, 'b' body.
BIG = dict(
    up=['t.........t', '.w.......w.', '..ww...ww..', '....wbw....', '.....b.....'],
    high=['...........', 'tw.......wt', '..www.www..', '....wbw....', '.....b.....'],
    level=['...........', '...........', 'ttwwwbwwwtt', '....bbb....', '...........'],
    down=['...........', '....wbw....', '..ww.b.ww..', '.w.......w.', 't.........t'])
SMALL = dict(
    up=['.w...w.', '..w.w..', '...b...'],
    high=['w.....w', '.ww.ww.', '...b...'],
    level=['.......', 'wwwbwww', '..b.b..'],
    down=['...b...', '.ww.ww.', 'w.....w'])
CYCLE = ['up', 'high', 'level', 'down', 'level', 'high']        # one wingbeat, six poses
GLIDE = ['high', 'high', 'high', 'level', 'level', 'high']      # big birds sailing between beats

# colours: (wing, tip, body)
KINDS = dict(sparrow=('wood1', 'wood0', 'wood0'), starling=('gloss1', 'ink', 'ink'),
             swallow=('indigo1', 'indigo0', 'indigo0'), crow=('gloss0', 'ink', 'ink'),
             goose=('wood2', 'wood0', 'wood1'), crane=('white', 'ink', 'cloud3'),
             egret=('white', 'cloud2', 'cloud3'), gull=('cloud3', 'stone1', 'white'))


def _bird(a, x, y, pose, kind, big=False):
    rows = (BIG if big else SMALL)[pose]
    wing, tip, body = KINDS[kind]
    ox, oy = len(rows[0]) // 2, len(rows) // 2
    for r, row in enumerate(rows):
        for c, ch in enumerate(row):
            if ch != '.':
                _px(a, x + c - ox, y + r - oy, {'w': wing, 't': tip, 'b': body}[ch])


def _flock(frames, rng, kind, n, x0, y0, spread, big=False, vx=1.0, path=None, beat=6, glide=False, shape='cloud'):
    """A flock flying together. Each bird keeps its place in the group (with a
    little drift of its own) and beats its wings in its own time.
    path(f) -> (x, y) of the flock's centre; default: straight across the tile,
    once round per loop, with a gentle rise and fall."""
    N = len(frames)
    if shape == 'v':                                                # a skein: two arms behind a leader
        offs = []
        for k in range(n):
            arm, side = (k + 1) // 2, (1 if k % 2 else -1)
            offs.append((-arm * spread - rng.uniform(0, 1.5), side * arm * spread * 0.45 + rng.uniform(-0.6, 0.6)))
    elif shape == 'line':                                           # a loose line, wingtip to wingtip
        offs = [(-k * spread + rng.uniform(-2, 2), rng.uniform(-2, 2) + k * 0.6) for k in range(n)]
    else:                                                           # a loose cloud, denser in the middle,
        offs = []                                                   # no two birds on top of each other
        gap = 9 if big else 6
        tries = 0
        while len(offs) < n and tries < n * 200:
            tries += 1
            o = (rng.gauss(0, spread), rng.gauss(0, spread * 0.45))
            if all((o[0] - q[0]) ** 2 + ((o[1] - q[1]) * 1.6) ** 2 >= gap * gap for q in offs):
                offs.append(o)
    ph = [rng.randrange(beat * 6) for _ in range(n)]
    wob = [(rng.uniform(0, 6.3), rng.uniform(0.6, 1.8)) for _ in range(n)]
    for f in range(N):
        if path:
            cx, cy = path(f)
        else:
            cx = x0 + vx * TILE * f / N
            cy = y0 + 4 * math.sin(2 * math.pi * f / N * 2 + x0)
        breathe = 1 + 0.18 * math.sin(2 * math.pi * f / N * 3 + x0)      # the flock opening and closing
        for k, (dx, dy) in enumerate(offs):
            w0, wa = wob[k]
            x = cx + dx * (breathe if shape == 'cloud' else 1) + wa * math.sin(2 * math.pi * f / 24 + w0)
            y = cy + dy * (breathe if shape == 'cloud' else 1) + wa * 0.7 * math.cos(2 * math.pi * f / 30 + w0)
            seq = GLIDE if glide else CYCLE
            pose = seq[((f + ph[k]) // max(1, beat // 2)) % len(seq)]
            _bird(frames[f], x, y, pose, kind, big)


def birds(season):
    """Birds in flocks over the lake, by season. Crossing flocks go once round the
    tile per loop; the starling murmuration and the swallows wheel in place."""
    w, h = TILE, BIRDS_H
    frames = [np.zeros((h, w, 4), np.uint8) for _ in range(NB)]
    rng = random.Random({'spring': 1, 'summer': 2, 'autumn': 3, 'winter': 4}[season])

    def wheel(cx, cy, rx, ry, turns=1, phase=0.0):
        return lambda f: (cx + rx * math.sin(2 * math.pi * f / NB * turns + phase),
                          cy + ry * math.sin(4 * math.pi * f / NB * turns + phase) * 0.6)
    if season == 'spring':
        for k in range(4):                                          # swallows, wheeling low over the water
            _flock(frames, rng, 'swallow', rng.randint(6, 10), 0, 0, 12,
                   path=wheel(k * w / 4 + rng.uniform(0, 200), h - 30 - rng.uniform(0, 20), rng.uniform(50, 110),
                              rng.uniform(8, 16), turns=2, phase=k), beat=4)
        for k in range(3):                                          # small birds crossing in little flocks
            _flock(frames, rng, 'sparrow', rng.randint(8, 14), k * w / 3, rng.uniform(22, 60), 12, vx=1)
        _flock(frames, rng, 'gull', 5, w * 0.6, 40, 10, big=True, vx=1, beat=10, glide=True, shape='line')
    elif season == 'summer':
        for k in range(3):
            _flock(frames, rng, 'swallow', rng.randint(6, 9), 0, 0, 12,
                   path=wheel(k * w / 3 + 100, h - 34, rng.uniform(60, 110), 12, turns=2, phase=k * 2), beat=4)
        _flock(frames, rng, 'egret', 6, w * 0.15, 46, 11, big=True, vx=1, beat=10, glide=True, shape='line')
        for k in range(2):
            _flock(frames, rng, 'sparrow', rng.randint(10, 16), k * w / 2 + 300, rng.uniform(24, 50), 13, vx=1)
    elif season == 'autumn':
        _flock(frames, rng, 'goose', 13, w * 0.1, 30, 9, big=True, vx=1, beat=8, shape='v')
        _flock(frames, rng, 'goose', 9, w * 0.62, 56, 9, big=True, vx=1, beat=8, shape='v')
        # a starling murmuration: a big swirling cloud over the far shore
        for k in range(2):
            cx = w * (0.3 + 0.45 * k)
            _flock(frames, rng, 'starling', 60, 0, 0, 24,
                   path=wheel(cx, h - 50, 70, 18, turns=1, phase=k * 3), beat=3)
    else:                                                           # winter
        _flock(frames, rng, 'crane', 7, w * 0.2, 36, 13, big=True, vx=-1, beat=12, glide=True, shape='line')
        _flock(frames, rng, 'crane', 4, w * 0.7, 60, 13, big=True, vx=-1, beat=12, glide=True, shape='line')
        for k in range(3):
            _flock(frames, rng, 'crow', rng.randint(7, 12), k * w / 3, rng.uniform(24, 70), 14, vx=1, beat=5)
    return frames, (0, BIRDS_Y)


# ---------------------------------------------------------------- the lake
def lake(season):
    w, h = TILE, LAKE_H
    frames = [np.zeros((h, w, 4), np.uint8) for _ in range(NL)]
    rng = random.Random({'spring': 11, 'summer': 12, 'autumn': 13, 'winter': 14}[season])
    yy, xx = np.mgrid[0:h, 0:w]
    # fish gliding under the surface: closed loops, tails beating; dark carp and bright koi
    n_fish = dict(spring=26, summer=30, autumn=22, winter=10)[season]
    for i in range(n_fish):
        cx, cy = rng.uniform(0, w), rng.uniform(10, h - 14)
        rx, ry = rng.uniform(14, 44), rng.uniform(2, 6)
        ph, dirn = rng.uniform(0, 6.3), rng.choice((1, -1))
        koi = season != 'winter' and rng.random() < 0.4
        ln = rng.choice((6, 7, 8))
        for f in range(NL):
            t = dirn * 2 * math.pi * f / NL + ph
            x, y = cx + rx * math.cos(t), cy + ry * math.sin(t)
            vx = -dirn * rx * math.sin(t)
            d = 1 if vx > 0 else -1
            a = frames[f]
            for k in range(ln):
                if koi:
                    c = 'white' if k in (1, 2) or (k == 4 and i % 2) else 'fire3'
                    _px(a, x - k * d, y, c, 190)
                    if 0 < k < ln - 2:
                        _px(a, x - k * d, y + 1, 'fire2', 150)
                else:
                    _px(a, x - k * d, y, 'indigo0', 170)
                    if 0 < k < ln - 2:
                        _px(a, x - k * d, y + 1, 'indigo0', 120)
            wag = 1 if (f // 2) % 2 else -1                          # the tail beating
            _px(a, x - ln * d, y + wag, 'fire2' if koi else 'indigo0', 150)
            _px(a, x - (ln + 1) * d, y + 2 * wag, 'fire2' if koi else 'indigo0', 110)
    # a fish jumping now and then: an arc, a splash, rings
    n_jump = dict(spring=12, summer=14, autumn=9, winter=3)[season]
    for i in range(n_jump):
        jx, jy = (i + rng.uniform(0.1, 0.9)) * w / n_jump, rng.uniform(14, h - 16)
        t0, d = rng.randrange(NL), rng.choice((1, -1))
        span, high = rng.uniform(12, 18), rng.uniform(10, 15)
        for k in range(30):
            f = (t0 + k) % NL
            a = frames[f]
            if k < 9:                                                 # out and back in, bending
                u = k / 8.0
                x = jx + d * u * span
                y = jy - high * 4 * u * (1 - u)
                tilt = 1 if u > 0.55 else (-1 if u < 0.45 else 0)
                for q in range(5):
                    _px(a, x - q * d, y + (q * tilt) // 2, ('white', 'cloud3', 'cloud2', 'stone3', 'stone2')[q])
                _px(a, x - 1 * d, y + 1 + tilt // 2, 'stone3')
                _px(a, x - 5 * d, y + (5 * tilt) // 2 - 1, 'stone2')
                _px(a, x - 5 * d, y + (5 * tilt) // 2 + 1, 'stone2')
            if k in (0, 1, 2, 8, 9, 10):                              # splashes where it leaves and lands
                sx = jx if k < 4 else jx + d * span
                kk = k if k < 4 else k - 8
                for q in range(-3, 4):
                    _px(a, sx + q, jy - max(0, (3 - abs(q)) * (2 - kk)) - 1, 'white')
            if k >= 2:                                                # rings spreading
                for (sx, k0) in ((jx, 2), (jx + d * span, 10)):
                    if k >= k0:
                        rr = 1.5 + (k - k0) * 0.9
                        al = int(200 * (1 - (k - k0) / 20.0))
                        if al > 0:
                            m = np.abs(np.hypot((xx - sx) / rr, (yy - jy) / (rr * 0.28)) - 1) < 0.09
                            a[m & (a[..., 3] == 0)] = (*PAL['haze3'], al)
    # ducks paddling (swans in winter), a V of ripples behind them
    pairs = dict(spring=2, summer=2, autumn=2, winter=1)[season]
    for i in range(pairs):
        cx, cy = rng.uniform(0, w), rng.uniform(16, h - 18)
        rx, ry = rng.uniform(40, 80), rng.uniform(3, 6)
        for f in range(NL):
            t = 2 * math.pi * f / NL + i * 2
            for k, lag in enumerate((0.0, 0.18)):
                tt = t - lag
                x, y = cx + rx * math.cos(tt), cy + ry * math.sin(tt)
                d = -1 if math.sin(tt) > 0 else 1
                a = frames[f]
                for j in range(1, 7):                                  # the wake
                    _px(a, x - (j + 2) * d, y + 1 + j // 2, 'haze3', 150 - j * 18)
                    _px(a, x - (j + 2) * d, y + 1 - j // 3, 'haze3', 110 - j * 14)
                if season == 'winter':                                 # a swan
                    for q in range(4):
                        _px(a, x - q * d, y, 'white')
                    _px(a, x - 1 * d, y - 1, 'cloud3')
                    _px(a, x + 1 * d, y - 1, 'white'); _px(a, x + 1 * d, y - 2, 'white')
                    _px(a, x + 2 * d, y - 3, 'white'); _px(a, x + 3 * d, y - 3, 'fire3')
                elif k == 0:                                           # mandarin drake
                    for q, c in enumerate(('copper3', 'copper2', 'wood1', 'wood1')):
                        _px(a, x - q * d, y, c)
                    _px(a, x - 2 * d, y - 1, 'fire3'); _px(a, x + 1 * d, y - 1, 'cloud3')
                    _px(a, x + 1 * d, y - 2, 'jade2'); _px(a, x + 2 * d, y - 1, 'scarlet2')
                else:                                                  # the duck, plain brown
                    for q in range(4):
                        _px(a, x - q * d, y, 'wood2' if q < 2 else 'wood1')
                    _px(a, x + 1 * d, y - 1, 'stone2'); _px(a, x + 2 * d, y - 1, 'wood0')
    return frames, (0, LAKE_Y)


# ---------------------------------------------------------------- the garden
FALL = dict(spring=(('pink4', 'pink3'), ('white', 'pink4'), ('pink3', 'pink2')),
            autumn=(('scarlet3', 'scarlet1'), ('fire3', 'copper2'), ('gold3', 'gold1'), ('copper3', 'copper1')),
            summer=(('leaf3', 'leaf1'),))


def garden_fall(frames, trees, ground, season):
    """trees: [(x0, y0, w, h, blossom_or_turned)] boxes of the crowns in layer
    coordinates. Leaves or petals come off them and fall turning to the ground,
    and lie in a carpet under the tree. Loops over len(frames)."""
    if season == 'winter':
        return frames
    n = len(frames)
    rng = random.Random(77)
    W = frames[0].w
    for (x0, y0, w, h, rich) in trees:
        if season == 'summer':                                       # now and then a green leaf
            count, pal = 2, FALL['summer']
        elif rich:                                                   # blossom or turned leaves
            count, pal = 26, FALL[season]
        else:
            continue
        # the carpet under the tree
        if season in ('spring', 'autumn'):
            cx = x0 + w / 2
            for _ in range(int(w * 1.2)):
                x = cx + rng.gauss(0, w * 0.32)
                y = ground(x) + rng.uniform(0, 4)
                c = rng.choice(pal)[0 if rng.random() < 0.7 else 1]
                for fr in frames:
                    if 0 <= int(y) < fr.h and fr.a[int(y), int(x) % W, 3]:
                        fr.a[int(y), int(x) % W, :3] = PAL[c]
        for i in range(count):
            sx = x0 + rng.uniform(0.1, 0.9) * w
            sy = y0 + rng.uniform(0.25, 0.75) * h
            fall = rng.uniform(22, 46)
            drift = rng.uniform(4, 16)
            ph = rng.randrange(n)
            c1, c2 = rng.choice(pal)
            for f in range(n):
                u = ((f - ph) % n) / n
                x = sx + drift * u + 2.5 * math.sin(2 * math.pi * u * 2 + i)
                y = sy + fall * u
                if y > ground(x):
                    continue
                tumble = (f + i) % 4
                cells = ((0, 0, c1), (1, 0, c2)) if tumble in (0, 2) else ((0, 0, c1), (0, 1, c2))
                if tumble == 1 and season == 'autumn':
                    cells = cells + ((1, 1, c2),)
                for dx, dy, c in cells:
                    X, Y = int(x) + dx, int(y) + dy
                    if 0 <= Y < frames[f].h:
                        frames[f].a[Y, X % W] = (*PAL[c], 255 if 0.08 < u < 0.92 else 140)
    return frames


def wind_streaks(frames, season):
    """Gusts made visible: long faint curving strokes that sweep across and
    thin out, as in a painted scroll. Seamless over the loop."""
    n = len(frames)
    W, H = frames[0].w, frames[0].h
    rng = random.Random(5)
    col = 'white' if season != 'autumn' else 'paper4'
    for i in range(10):
        y0 = rng.uniform(70, 200)
        x0 = rng.uniform(0, W)
        ln = rng.uniform(40, 90)
        amp = rng.uniform(2, 5)
        ph = rng.randrange(n)
        for f in range(n):
            u = ((f - ph) % n) / n
            if u > 0.5:
                continue
            k = u / 0.5                                            # the stroke grows, then thins out
            head = x0 + k * 160
            for j in range(int(ln)):
                t = j / ln
                if t > k * 1.6 or (t < k - 0.4):
                    continue
                x = head - j
                y = y0 + amp * math.sin(t * 5 + i) - j * 0.05
                al = int(70 * math.sin(math.pi * t) * (1 - abs(2 * k - 1)) + 10)
                X, Y = int(x) % W, int(y)
                if 0 <= Y < H:
                    frames[f].a[Y, X] = (*PAL[col], max(int(frames[f].a[Y, X, 3]), al))
    return frames
