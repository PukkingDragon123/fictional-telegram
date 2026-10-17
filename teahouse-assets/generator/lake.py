"""The lake.

lake_frames(): the water as a mirror. Every row of the lake reflects the
sky, clouds and mountains above the horizon, flipped, broken up by ripples
that run along the rows (each row slides a little, more toward the shore).
Near the horizon the water is almost all reflection; nearer the shore more of
its own deep blue-teal shows through, the way water looks at a steep angle.
On top: bands of light on the ripple crests that drift toward the shore, and
glitter that sparkles on and off. Quantised to the palette with an ordered
dither, NL frames that loop.

What lives on the lake (fish, ducks, birds over it) is in life.py."""
import math
import random
import numpy as np
from pixel import PAL

NL = 12                    # lake loop
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0 - 0.47

WATER_PAL = ['water0', 'water1', 'water2', 'haze0', 'haze1', 'haze2', 'haze3', 'sky0', 'sky1', 'sky2', 'sky3',
             'sky4', 'cloud1', 'cloud2', 'cloud3', 'teal0', 'teal1', 'teal2', 'teal3', 'indigo1', 'indigo2',
             'indigo3']


def _quant(rgb, names, dither=10.0, yy=None, xx=None):
    """Nearest palette colour per pixel (rgb float array (..., 3)), ordered dither."""
    pal = np.array([PAL[n] for n in names], float)
    if yy is not None:
        rgb = rgb + BAYER[yy % 4, xx % 4][..., None] * dither
    d = ((rgb[..., None, :] - pal[None, None, :, :]) ** 2).sum(-1)
    return pal[d.argmin(-1)].astype(np.uint8)


def lake_frames(above, horizon, W, H, season='summer'):
    """above: (H, W, 4) uint8 composite of sky, clouds and mountains. Returns NL
    RGBA arrays (H, W, 4), transparent above the horizon. The season adds what
    floats on it: cherry petals, fallen leaves, or ice along the shore."""
    src = above[..., :3].astype(float)
    rows = H - horizon
    d = np.arange(1, rows + 1, dtype=float)[:, None]                       # distance below the horizon
    xs = np.arange(W)[None, :]
    yy, xx = np.mgrid[0:rows, 0:W]
    deep = np.array(PAL['water0'], float) * 0.6 + np.array(PAL['teal1'], float) * 0.4
    mid = np.array(PAL['water1'], float)
    names = WATER_PAL
    if season == 'winter':                                                 # cold steel water
        deep = np.array(PAL['indigo1'], float) * 0.6 + np.array(PAL['stone1'], float) * 0.4
        mid = np.array(PAL['stone2'], float) * 0.5 + np.array(PAL['water0'], float) * 0.5
        names = WATER_PAL + ['stone1', 'stone2', 'stone3']
    rng = np.random.RandomState(5)
    ph = rng.uniform(0, 6.28, (rows, 1))
    out = []
    for f in range(NL):
        t = 2 * math.pi * f / NL
        amp = 0.4 + d * 0.07
        dx = amp * (np.sin(0.9 * d + t + ph) + 0.6 * np.sin(0.23 * xs * 0.25 + 0.5 * d - 2 * t))
        sx = (xs + np.round(dx)).astype(int) % W
        sy = np.clip(horizon - np.round(d * 1.05).astype(int), 0, horizon - 1)
        sy = np.broadcast_to(sy, (rows, W))
        refl = src[sy, sx]
        fres = np.clip(0.88 - d / 70.0, 0.3, 0.88)                         # mirror near the horizon, deep near shore
        water = mid * np.clip(1 - d / 45.0, 0, 1)[..., None] + deep * np.clip(d / 45.0, 0, 1)[..., None]
        rgb = refl * fres[..., None] + np.broadcast_to(water, (rows, W, 3)) * (1 - fres[..., None])
        rgb = rgb * 0.92                                                   # water darkens what it mirrors
        # light on the ripple crests, drifting toward the shore
        crest = np.sin(d * 1.3 - 2 * t + np.sin(xs * 0.031 + d * 0.2) * 2.2)
        rgb += (crest > 0.86)[..., None] * 34.0 * np.clip(1.1 - d / 60.0, 0.3, 1)[..., None]
        rgb -= (crest < -0.9)[..., None] * 16.0
        q = _quant(rgb, names, 12.0, yy, xx)
        a = np.zeros((H, W, 4), np.uint8)
        a[horizon:, :, :3] = q
        a[horizon:, :, 3] = 255
        _float(a, horizon, rows, W, f, season)
        # glitter: sparkles that come and go, thickest on the lit (left) side of each window's view
        g = random.Random(100 + f)
        for _ in range(60 if season == 'winter' else 260):
            x = g.randrange(W)
            y = horizon + 1 + int(g.random() ** 1.6 * min(rows - 2, 36))
            ln = g.choice((1, 1, 2, 3))
            c = PAL['cloud3'] if g.random() < 0.6 else PAL['sky4']
            for k in range(ln):
                a[y, (x + k) % W, :3] = c
        a[horizon, :, :3] = PAL['haze3']                                   # the far shore's bright waterline
        out.append(a)
    return out


def _float(a, horizon, rows, W, f, season):
    """What floats on the lake this season. Drifting things move on a loop of NL frames."""
    t = 2 * math.pi * f / NL
    if season in ('spring', 'autumn'):
        g = random.Random(7)
        cols = (['pink4', 'pink3', 'white', 'pink4'] if season == 'spring'
                else ['scarlet2', 'fire3', 'gold3', 'copper2'])
        for _ in range(360 if season == 'spring' else 300):
            depth = g.random() ** 0.7
            y = horizon + 2 + int(depth * min(rows - 3, 60))
            x = int(g.uniform(0, W) + 1.5 * math.sin(t + g.uniform(0, 6.3))) % W
            c = PAL[g.choice(cols)]
            a[y, x, :3] = c
            if depth > 0.45 and g.random() < 0.6:                   # nearer ones are bigger
                a[y, (x + 1) % W, :3] = c
    elif season == 'winter':
        g = random.Random(8)
        # ice along the near shore: floes, thin skim ice and snow on the bigger plates
        for _ in range(110):
            y = horizon + 20 + int(g.random() ** 0.6 * min(rows - 22, 40))
            x = g.uniform(0, W)
            ln = g.uniform(6, 30) * (0.5 + (y - horizon) / 60.0)
            for k in range(int(ln)):
                X = int(x + k) % W
                u = k / max(1.0, ln - 1)
                a[y, X, :3] = PAL['white' if 0.1 < u < 0.8 else 'cloud3']
                if ln > 14 and 0.2 < u < 0.7:                              # the bigger plates are two rows deep
                    a[y + 1, X, :3] = PAL['cloud2']
                if (k * 7) % 5 == 0:
                    a[y + 1 + (ln > 14 and 0.2 < u < 0.7), X, :3] = PAL['cloud1']
        # a thin shelf of ice all along the near shore
        for x in range(W):
            y = horizon + rows - 1
            y = min(y, horizon + 58 + int(2 * math.sin(x * 0.05)))
            a[y - 1, x, :3] = PAL['cloud3']
            a[y, x, :3] = PAL['white']
