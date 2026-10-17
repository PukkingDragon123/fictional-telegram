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
def _small_bird(a, x, y, flap, body='ink', wing='gloss1', belly=None, tail=False, d=1):
    """A swallow-size bird seen against the sky: wings up in a V, level, or down."""
    _px(a, x, y, body)
    _px(a, x + d, y, body)
    if belly:
        _px(a, x, y + 1, belly)
    if tail:                                                       # a forked tail
        _px(a, x - d, y + 1, body)
        _px(a, x - 2 * d, y + 2, body)
    if flap == 0:                                                  # up
        for k in (1, 2):
            _px(a, x - k + (d > 0), y - k, wing)
            _px(a, x + k + (d > 0), y - k, wing)
    elif flap == 1:                                                # level
        for k in (1, 2, 3):
            _px(a, x - k, y, wing)
            _px(a, x + 1 + k, y, wing)
    else:                                                          # down
        for k in (1, 2):
            _px(a, x - k, y + (1 if k == 2 else 0), wing)
            _px(a, x + 1 + k, y + (1 if k == 2 else 0), wing)


def _big_bird(a, x, y, flap, kind, d=1, al=255):
    """A bird seen side on, flying (d=1 right, -1 left): goose, egret or crane.
    flap in 0..1 round the wingbeat."""
    if kind == 'goose':
        body, neck, head, wing, wtip, bill = 'wood1', 'ink', 'ink', 'wood2', 'wood0', 'ink'
        blen, nlen, span = 4, 3, 6
    elif kind == 'egret':
        body, neck, head, wing, wtip, bill = 'cloud3', 'cloud3', 'white', 'white', 'cloud2', 'gold3'
        blen, nlen, span = 4, 2, 8
    else:                                                          # red-crowned crane
        body, neck, head, wing, wtip, bill = 'white', 'ink', 'scarlet2', 'white', 'ink', 'paper2'
        blen, nlen, span = 5, 5, 10
    for k in range(-blen // 2, blen - blen // 2):                 # body
        _px(a, x + k * d, y, body, al)
        _px(a, x + k * d, y + 1, body if kind != 'goose' else 'paper1', al)
    for k in range(1, nlen + 1):                                   # neck stretched out ahead
        _px(a, x + (blen // 2 + k) * d, y - (1 if kind == 'egret' and k > 1 else 0), neck, al)
    hx = x + (blen // 2 + nlen + 1) * d
    hy = y - (1 if kind == 'egret' else 0)
    _px(a, hx, hy, head, al)
    _px(a, hx + d, hy, bill, al)
    if kind != 'goose':
        _px(a, hx + 2 * d, hy, bill, al)
    if kind in ('crane', 'egret'):                                 # legs trailing behind
        for k in range(1, 4):
            _px(a, x - (blen // 2 + k) * d, y + 1, 'ink' if kind == 'crane' else 'stone2', al)
    ang = math.sin(2 * math.pi * flap) * 1.1                       # wing: up on + , down on -
    for k in range(1, span + 1):
        t = k / span
        wx = x - int(t * 2) * d
        wy = y - int(round(math.sin(ang) * k * 0.9))
        c = wtip if t > 0.7 else wing
        if kind == 'crane' and t <= 0.7:
            c = 'white'
        _px(a, wx, wy, c, al)
        if t < 0.6:
            _px(a, wx - d, wy, c, al)                              # the inner wing is broad


def birds(season):
    w, h = TILE, BIRDS_H
    frames = [np.zeros((h, w, 4), np.uint8) for _ in range(NB)]
    rng = random.Random({'spring': 1, 'summer': 2, 'autumn': 3, 'winter': 4}[season])
    # swallows: quick loops low over the water, now and then a dive
    n_sw = dict(spring=9, summer=7, autumn=0, winter=0)[season]
    for i in range(n_sw):
        cx, cy = rng.uniform(0, w), rng.uniform(h - 50, h - 14)
        rx, ry = rng.uniform(30, 90), rng.uniform(6, 18)
        ph, rev = rng.uniform(0, 6.3), rng.choice((2, 3))
        for f in range(NB):
            t = 2 * math.pi * f / NB * rev + ph
            x = cx + rx * math.sin(t)
            y = cy + ry * math.sin(2 * t) * 0.6 - 4 * math.sin(t * 3) ** 2
            d = 1 if math.cos(t) > 0 else -1
            _small_bird(frames[f], x, y, (f // 2 + i) % 3, 'indigo0', 'indigo1', belly='cloud3', tail=True, d=d)
    # flocks that cross the whole tile once per loop
    if season == 'autumn':                                         # a skein of geese in a V
        for g in range(2):
            x0, y0 = rng.uniform(0, w), 22 + g * 30
            n = 9 if g == 0 else 6
            for f in range(NB):
                xl = x0 + w * f / NB
                for k in range(n):
                    arm = (k + 1) // 2
                    side = 1 if k % 2 else -1
                    x = xl - arm * 9
                    y = y0 + side * arm * 4
                    _big_bird(frames[f], x, y, (f / 14.0 + k * 0.13) % 1, 'goose')
        for i in range(14):                                         # sparrows, bobbing as they fly
            x0, y0 = rng.uniform(0, w), rng.uniform(h - 60, h - 30)
            for f in range(NB):
                x = x0 + w * f / NB * 1.0 + 6 * math.sin(i)
                y = y0 + 3 * math.sin(2 * math.pi * f / 12 + i)
                _small_bird(frames[f], x, y, (f // 2 + i) % 3, 'wood0', 'wood1')
    elif season == 'summer':                                       # an egret, slow wingbeats
        x0, y0 = rng.uniform(0, w), h - 46
        for f in range(NB):
            _big_bird(frames[f], x0 + w * f / NB, y0 + 2 * math.sin(2 * math.pi * f / 24), (f / 24.0) % 1, 'egret')
    elif season == 'winter':                                       # a pair of cranes, crows
        x0, y0 = rng.uniform(0, w), 40
        for f in range(NB):
            for k, (dx, dy) in enumerate(((0, 0), (-16, 7))):
                _big_bird(frames[f], x0 - w * f / NB + dx * -1, y0 + dy + 2 * math.sin(2 * math.pi * f / 36 + k),
                          (f / 30.0 + k * 0.3) % 1, 'crane', d=-1)
        for i in range(6):
            x0, y0 = rng.uniform(0, w), rng.uniform(20, h - 50)
            for f in range(NB):
                _small_bird(frames[f], x0 + w * f / NB * 2 % w, y0 + 2 * math.sin(f / 5 + i), (f // 3 + i) % 3,
                            'ink', 'gloss0')
    elif season == 'spring':                                       # a few small birds crossing
        for i in range(5):
            x0, y0 = rng.uniform(0, w), rng.uniform(20, 60)
            for f in range(NB):
                _small_bird(frames[f], x0 + w * f / NB, y0 + 3 * math.sin(2 * math.pi * f / 14 + i),
                            (f // 2 + i) % 3, 'wood0', 'wood2')
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
