"""The 2D sets, painted as pixel art in the teahouse pack's palette and style,
one set of layers per camera set-up, like the backgrounds of a 2D film.

Everything is drawn the way a painter would: the moon a flat disc with soft
painted seas and a few small craters; the clouds long flat bands with round
ends, lit red underneath near the moon; the mountains a drawn ridge line with
spurs running down from every peak, each spur a lit face and a shadow face in
flat tones, snow running down the crests in fingers, a few hand strokes. The
land is painted by day with the pack's own trees, grass, pampas and spider
lilies, then re-lit for the blood moon night with bloodmoon.grade (night
ramps and a red rim of moonlight on every edge that faces the sky).

A set is a camera (focal f, height cy, horizon row y_h) and layers, each at a
depth Z: art pixel (u, v) is at world X = (u - w/2) * 2Z/f, Y = cy - (v - y_h)
* 2Z/f. One art pixel is two screen pixels.
"""
import math
import os
import pickle
import random
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'teahouse-assets', 'generator'))
from pixel import Canvas, PAL                                                    # noqa: E402
import bloodmoon as BM                                                           # noqa: E402
import grove                                                                     # noqa: E402
import meadow                                                                    # noqa: E402
from objects import outline                                                      # noqa: E402

BAYER = BM.BAYER


def fbm(h, w, seed, scale, octaves=4, gain=0.5):
    rng = np.random.RandomState(seed)
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        s = max(2, int(scale * 2 ** o))
        g = rng.rand(int(h / w * s) + 3, s + 3).astype(np.float32)
        out += amp * cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC)
        tot += amp
        amp *= gain
    out /= tot
    return (out - out.min()) / (np.ptp(out) + 1e-6)


def quant(v, ramp, dither=0.7):
    """Values 0..1 -> colours of a ramp, with the pack's 4x4 ordered dither."""
    h, w = v.shape
    yy, xx = np.mgrid[0:h, 0:w]
    n = len(ramp)
    k = np.clip((v * n + BAYER[yy % 4, xx % 4] * dither).astype(int), 0, n - 1)
    return np.array([PAL[c] for c in ramp], np.uint8)[k]


def night(cv):
    """Re-light a day-painted canvas for the blood moon (in place)."""
    return BM.grade(cv, wrap=False)


def catmull(pts, w):
    """A hand-placed line: a smooth curve through (x, row) points, one row per column."""
    P = [np.array(p, float) for p in pts]
    P = [P[0]] + P + [P[-1]]
    xs, ys = [], []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1:i + 3]
        for t in np.linspace(0, 1, 40, endpoint=False):
            q = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)
            xs.append(q[0])
            ys.append(q[1])
    xs.append(P[-2][0])
    ys.append(P[-2][1])
    order = np.argsort(xs)
    return np.interp(np.arange(w), np.array(xs)[order], np.array(ys)[order])


# ---------------------------------------------------------------- sky
def moon(cv, mx, my, R, seed=5):
    """The blood moon painted by hand: a flat disc with a darker rim and a bright
    lower edge, big soft seas with a shadowed edge, a handful of small craters
    and a few bright strokes along the limb."""
    rng = np.random.RandomState(seed)
    ramp = [PAL[c] for c in ('blood1', 'blood2', 'blood3', 'blood4', 'blood5', 'blood6')]
    n = int(R) + 2
    yy, xx = np.mgrid[-n:n + 1, -n:n + 1].astype(float)
    nx, ny = (xx + 0.5) / R, (yy + 0.5) / R
    d = np.hypot(nx, ny)
    inside = d <= 1
    tone = np.full(d.shape, 3)
    ang = np.arctan2(ny, nx)
    rim = max(1.0, R * 0.05) / R
    tone[d > 1 - rim] = 2
    lit = (-nx * 0.5 + ny * 0.86)                                    # bright lower edge
    tone[(d > 1 - 1.6 * rim) & (d <= 1 - rim) & (lit > 0.45)] = 4
    seas = np.zeros(d.shape, bool)
    for (cx, cy, r) in ((-0.36, -0.26, 0.3), (0.12, -0.32, 0.2), (0.33, -0.04, 0.22), (-0.52, 0.16, 0.24),
                        (-0.1, 0.36, 0.17), (0.16, 0.18, 0.13)):
        for _ in range(3):                                          # each sea a few overlapping lobes
            ox, oy, rr = rng.uniform(-0.6, 0.6) * r, rng.uniform(-0.5, 0.5) * r, r * rng.uniform(0.55, 0.85)
            wob = 1 + 0.12 * np.sin(ang * 3 + rng.uniform(0, 6.3)) + 0.06 * np.sin(ang * 7 + rng.uniform(0, 6.3))
            seas |= np.hypot(nx - cx - ox, (ny - cy - oy) * 1.15) < rr * wob
    seas &= d < 1 - 1.5 * rim
    tone[seas] = 2
    edge = seas & ~np.roll(np.roll(seas, 1, 0), 1, 1)                # a darker edge on the upper left of each sea
    tone[edge] = 1
    for k in range(int(5 + R / 40)):                                 # a few small craters: a dark bowl, a lit lip
        a, rr = rng.uniform(0, 6.3), rng.uniform(0.1, 0.85) ** 0.7
        cx, cy = math.cos(a) * rr, math.sin(a) * rr
        cr = max(1.6 / R, rng.uniform(0.015, 0.04))
        dd = np.hypot(nx - cx, ny - cy)
        bowl = (dd < cr) & inside
        tone[bowl & (ny - cy < 0.3 * cr)] = np.minimum(tone[bowl & (ny - cy < 0.3 * cr)], 1)
        lip = (dd >= cr) & (dd < cr + 1.0 / R) & (ny - cy > 0.5 * cr) & inside
        tone[lip] = np.minimum(tone[lip] + 1, 4)
    for k in range(int(3 + R / 25)):                                 # bright strokes along the lit limb
        a0 = rng.uniform(0.35, 2.4)
        L = rng.uniform(0.2, 0.5)
        for t in np.linspace(0, L, int(R * L) + 2):
            r_ = 1 - rng.uniform(0.05, 0.12)
            x, y = int(round(math.cos(a0 + t) * r_ * R)) + n, int(round(math.sin(a0 + t) * r_ * R)) + n
            if 0 <= y < tone.shape[0] and 0 <= x < tone.shape[1] and inside[y, x]:
                tone[y, x] = 5
    H_, W_ = cv.a.shape[:2]
    for (y, x) in zip(*np.nonzero(inside)):
        X, Y = int(mx + x - n), int(my + y - n)
        if 0 <= X < W_ and 0 <= Y < H_:
            cv.a[Y, X, :3] = ramp[tone[y, x]]
            cv.a[Y, X, 3] = 255


def sky(w, h, horizon, moon_, seed=71, n_stars=None, top_pad=0):
    """Night sky: deep violet down to a dull red glow on the horizon, a soft
    dithered halo round the moon, stars, and the moon."""
    mx, my, mr = moon_
    my = my + top_pad
    horizon = horizon + top_pad
    H = h + top_pad
    cv = Canvas(w, H)
    yy, xx = np.mgrid[0:H, 0:w]
    stops = [0, top_pad + (horizon - top_pad) * 0.35, horizon * 0.72 + top_pad * 0.28, horizon * 0.92, horizon, H + 1]
    top = np.array([[8, 6, 18], [14, 10, 28], [30, 20, 50], [56, 28, 64], [76, 24, 46], [76, 24, 46]], float)
    rgb = np.stack([np.interp(yy, stops, top[:, c]) for c in range(3)], -1)
    dist = np.hypot(xx - mx, yy - my)
    halo = np.clip(1 - (dist - mr) / (mr * 4.5), 0, 1)
    rgb += (halo ** 2.4)[..., None] * np.array([54, 8, 6])
    cv.a[..., :3] = BM._quant(rgb, BM.SKY_SET, 18.0, yy, xx)
    cv.a[..., 3] = 255
    rng = random.Random(seed)
    for _ in range(n_stars or int(w * min(horizon, H) / 300)):
        x, y = rng.randrange(w), int(min(horizon, H - 1) * 0.92 * rng.random() ** 1.6)
        if halo[y, x] > 0.02:
            continue
        r = rng.random()
        cv.px(x, y, 'night5' if r < 0.55 else ('cloud1' if r < 0.8 else ('pink3' if r < 0.9 else 'fire5')))
    for _ in range(int(w * min(horizon, H) / 4800) + 2):
        x, y = rng.randrange(w), int(min(horizon, H - 1) * 0.8 * rng.random() ** 1.5)
        if halo[y, x] > 0:
            continue
        cv.px(x, y, 'white')
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            cv.px(x + dx, y + dy, 'night5')
    moon(cv, mx, my, mr, seed)
    return cv


def clouds(w, h, moon_, bands, top_pad=0):
    """Long flat bands of cloud as in old paintings: round-ended, in two tiers,
    dark on top, lit red along the underside near the moon."""
    mx, my, mr = moon_
    my += top_pad
    H = h + top_pad
    cv = Canvas(w, H)
    yy, xx = np.mgrid[0:H, 0:w].astype(float)
    mask = np.zeros((H, w), bool)
    for (cx, cy, ln, th) in bands:
        cy += top_pad
        for (dx, dy, k) in ((0, 0, 1.0), (ln * 0.18, -th * 0.75, 0.55), (-ln * 0.22, th * 0.6, 0.4)):
            L, t = ln * k, th * (0.8 if k < 1 else 1)
            a, b = cx + dx - L / 2 + t / 2, cx + dx + L / 2 - t / 2
            px = np.clip(xx, a, b)
            mask |= np.hypot(xx - px, yy - (cy + dy)) < t / 2
    near = np.clip(1 - np.hypot(xx - mx, yy - my) / (mr * 6), 0, 1)
    top = mask & ~np.roll(mask, 1, 0)
    bot = mask & ~np.roll(mask, -1, 0)
    cv.a[mask, :3] = np.where(near[mask, None] > 0.35, PAL['night3'], PAL['night2'])
    cv.a[top, :3] = PAL['night4']
    bl = bot & (near > 0.2)
    cv.a[bot & ~bl, :3] = PAL['night1']
    cv.a[bl, :3] = np.where(near[bl, None] > 0.6, PAL['blood4'], PAL['blood2'])
    cv.a[..., 3] = np.where(mask, 255, 0)
    return cv


# ---------------------------------------------------------------- the land
def mountain(w, h, ridge_pts, seed, base=None, snow=0.35, spurs_every=26,
             tones=('stone0', 'stone1', 'haze1', 'haze2'), snow_tones=('haze1', 'haze3', 'cloud0', 'cloud1'),
             strokes=1.0, rocks=0):
    """A mountain drawn by hand: the ridge line through the given points, spurs
    running down from it (fanning out from each peak), each spur a lit face on
    its left and a shadow face on its right in flat tones, dark gullies between,
    snow down the crests in fingers, a few short strokes."""
    rng = np.random.RandomState(seed)
    prof = catmull(ridge_pts, w)
    base = h if base is None else base
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    inside = yy >= np.floor(prof)[None, :]
    peaks = [i for i in range(1, w - 1) if prof[i] <= prof[i - 1] and prof[i] < prof[i + 1]]
    starts = list(peaks)
    x = rng.uniform(0, spurs_every)
    while x < w:
        starts.append(int(x))
        x += spurs_every * rng.uniform(0.6, 1.4)
    hf = np.full((h, w), -1e9)
    crest = np.full((h, w), 1e9)
    for x0 in starts:
        y0 = prof[x0]
        pk = min(peaks, key=lambda p: abs(p - x0)) if peaks else x0
        side = np.sign(x0 - pk) if x0 != pk else rng.choice([-1, 1])
        for sd in ([side] if x0 not in peaks else [-1, 1]):
            slant = sd * rng.uniform(0.18, 0.6)
            ph, amp = rng.uniform(0, 6.3), rng.uniform(1.5, 4)
            depth = yy - y0
            sx = x0 + slant * depth + amp * np.sin(depth * 0.06 + ph) + 1.5 * np.sin(depth * 0.21 + ph * 2)
            k = rng.uniform(0.5, 0.9)
            tent = (base - y0) * 0.6 - np.abs(xx - sx) * k - depth * 0.15
            tent[depth < 0] = -1e9
            hf = np.maximum(hf, tent)
            crest = np.where(depth >= 0, np.minimum(crest, np.abs(xx - sx)), crest)
    ridge_h = -(yy - prof[None, :]) * 0.5 + 40
    hf = np.maximum(hf, ridge_h)
    gx = np.zeros_like(hf)
    gx[:, 1:-1] = hf[:, 2:] - hf[:, :-2]
    lit = gx > 0
    tone = np.where(lit, 2, 1)
    upper = ((yy - prof[None, :]) / np.maximum(base - prof[None, :], 1)) < 0.35
    tone[lit & (crest < 1.2) & upper] = 3                            # high crests catch the light
    gully = (np.roll(gx, 1, 1) < 0) & (np.roll(gx, -1, 1) > 0)
    gully |= np.roll(gully, 1, 1) & (rng.rand(h, w) < 0.5)
    tone[gully] = 0
    low = (yy - prof[None, :]) / np.maximum(base - prof[None, :], 1)
    dark_band = low > 0.72 + 0.06 * np.sin(xx * 0.05)
    tone[dark_band & ~lit] = 0
    tone[dark_band & lit] = np.minimum(tone[dark_band & lit], 1)
    cols = np.array([PAL[c] for c in tones], np.uint8)
    rgb = cols[tone]
    if snow > 0:                                                     # snow: a cap, and fingers down the crests
        cap = (yy - prof[None, :]) < snow * (base - prof[None, :]) * (0.25 + 0.15 * np.sin(xx * 0.09))
        hi = (prof.max() - prof) / (prof.max() - prof.min() + 1e-6)
        cap &= hi[None, :] > 0.35
        sn = cap & inside
        stone = np.where(lit, np.where(crest < 1.6, 3, 2), np.where(gully, 0, 1))
        rgb = np.where(sn[..., None], np.array([PAL[c] for c in snow_tones], np.uint8)[stone], rgb)
    cv = Canvas(w, h)
    cv.a[..., :3] = rgb
    cv.a[..., 3] = np.where(inside, 255, 0)
    for _ in range(int(w * h / 900 * strokes)):                      # a few short strokes, down the slope
        x0, y0 = rng.randint(w), rng.randint(h)
        if not inside[y0, x0] or y0 - prof[x0] < 3:
            continue
        L = rng.randint(3, 7)
        slope = 0.5 * (1 if lit[y0, x0] else -1)
        c = tones[max(0, tone[y0, x0] - 1)] if lit[y0, x0] else tones[min(3, tone[y0, x0] + 1)]
        for i in range(L):
            x, y = int(round(x0 + slope * i * 0.6)), y0 + i
            if 0 <= x < w and y < h and inside[y, x]:
                cv.px(x, y, c)
    for _ in range(rocks):                                           # boulders along the crest
        x = rng.randint(w)
        r = rng.randint(3, 7)
        y = int(prof[x]) - r // 3
        cv.ellipse(x, y, r, r * 0.7, 'haze1')
        cv.ellipse(x - r * 0.35, y - r * 0.3, r * 0.45, r * 0.3, 'haze2')
        cv.hline(int(x - r * 0.6), int(x + r * 0.6), int(y + r * 0.55), 'stone1')
    return cv, prof


_TREES = {}
_DISK = os.path.join(HERE, '.trees')


def grown(fn, seed, k, wind=1.0, phase=0.0):
    """A grove tree's sway frames and base, kept on disk (the big ones take a while)."""
    os.makedirs(_DISK, exist_ok=True)
    path = os.path.join(_DISK, '%s_%d_%.3f_%.2f_%.2f.pkl' % (fn.__name__, seed, k, wind, phase))
    if os.path.exists(path):
        with open(path, 'rb') as fh:
            return pickle.load(fh)
    T = fn(seed, k=k)
    out = (T.frames(wind_phase=phase, wind=wind), T.base)
    with open(path, 'wb') as fh:
        pickle.dump(out, fh, protocol=4)
    return out


def tree_kinds(sizes, seed=100):
    """A small nursery of the pack's grove trees at a size, with their sway frames."""
    key = (tuple(sizes), seed)
    if key not in _TREES:
        out = []
        for i, k in enumerate(sizes):
            fn = (grove.cypress, grove.black_pine, grove.oak, grove.cypress, grove.zelkova)[i % 5]
            out.append(grown(fn, seed + i, k, 0.7, i * 0.7))
        _TREES[key] = out
    return _TREES[key]


def forest(w, h, top, base, seed, sizes, rows=3, step=6, ground='jade0', animate=False, gap=None, fill=True):
    """A forest band: rows of the pack's trees, back to front, on dark ground
    from `top` (a row per column) down."""
    rng = random.Random(seed)
    kinds = tree_kinds(sizes, seed)
    items = []
    for r in range(rows):
        x = rng.uniform(-10, step)
        while x < w + 10:
            xi = int(x) % w
            y = int(top[min(max(xi, 0), w - 1)] + (base - top[min(max(xi, 0), w - 1)]) * (r + 0.5) / rows)
            k = rng.randrange(len(kinds))
            if gap is None or not (gap[0] < x < gap[1]):
                items.append((y, x, k))
            x += step * rng.uniform(0.6, 1.3)
    items.sort()
    nf = len(kinds[0][0]) if animate else 1
    out = []
    for f in range(nf):
        cv = Canvas(w, h)
        yy = np.arange(h)[:, None]
        g = yy >= top[None, :] + 4
        if gap is not None:
            g &= ~((np.arange(w)[None, :] > gap[0] + 30) & (np.arange(w)[None, :] < gap[1] - 30))
        if fill:
            cv.a[g] = PAL[ground] + (255,)
        for (y, x, k) in items:
            fr, (bx, by) = kinds[k]
            cv.blit(fr[f % len(fr)], int(x) - bx, y - by)
        out.append(night(cv))
    return out if animate else out[0]


def mist(w, h, y0, y1, seed, colour=(140, 56, 72), alpha=0.4, top_pad=0):
    """A bank of mist drawn in two flat, wavy-edged tiers (painted, not noise)."""
    rng = np.random.RandomState(seed)
    H = h + top_pad
    out = np.zeros((H, w, 4), np.uint8)
    out[..., :3] = colour
    xx = np.arange(w)
    a = np.zeros((H, w), np.float32)
    for k, (f0, f1, al) in enumerate(((0.0, 1.0, alpha * 0.55), (0.35, 0.9, alpha * 0.45))):
        top = y0 + (y1 - y0) * f0 + 4 * np.sin(xx * 0.021 + rng.uniform(0, 6)) + 2.5 * np.sin(xx * 0.067 + rng.uniform(0, 6))
        bot = y0 + (y1 - y0) * f1 + 3 * np.sin(xx * 0.03 + rng.uniform(0, 6))
        yy = np.arange(H)[:, None] - top_pad
        band = np.clip(yy - top[None, :] + 1, 0, 1) * np.clip(bot[None, :] - yy, 0, 1)
        a = 1 - (1 - a) * (1 - band * al)
    out[..., 3] = (a * 255).astype(np.uint8)
    return out


def lake(w, h, y0, y1, moon_x, seed, frames=8, shore='night0'):
    """Still night water: the far shore's dark reflection, ripple lines, and
    the moon's broken red road coming toward you."""
    out = []
    rng = np.random.RandomState(seed)
    for f in range(frames):
        cv = Canvas(w, h)
        yy, xx = np.mgrid[0:h, 0:w]
        d = np.clip((yy - y0) / max(1, y1 - y0), 0, 1)
        tone = np.where(d < 0.25, 1, np.where(d < 0.6, 2, 1))
        cv.a[..., :3] = np.array([PAL[c] for c in ('night0', 'night1', 'night2')], np.uint8)[tone]
        cv.a[..., 3] = np.where((yy >= y0) & (yy < y1), 255, 0)
        for y in range(y0, y1):
            dd = (y - y0) / max(1, y1 - y0)
            for k in range(int(w / 40 * (0.6 + dd))):
                L = int(2 + 10 * dd * rng.rand() + 1)
                x = int((rng.rand() * w + f * (3 + dd * 6) * (1 if y % 2 else -1)) % w)
                for i in range(L):
                    cv.px((x + i) % w, y, 'night3' if dd < 0.5 else 'night4')
            half = 3 + dd * 22
            for k in range(int(4 + 10 * dd)):
                x = int(moon_x + rng.randn() * half * 0.6 + math.sin(f * 0.8 + y) * 2)
                L = int(2 + rng.rand() * (4 + 8 * dd))
                c = ('blood2', 'blood3', 'blood4', 'blood5')[min(3, int(rng.rand() * 4 * (1 - dd * 0.5)))]
                for i in range(L):
                    cv.px(x + i, y, c)
        for x in range(w):
            for y in range(y0, y0 + 2 + (x * 7 % 3)):
                cv.px(x, y, shore)
        out.append(cv)
    return out


# ---------------------------------------------------------------- the old tree, and what flies
def uprooted(sprite, base, rng=None):
    """The old tree torn out of the ground: a clod of earth and stones at its
    foot with roots hanging out of it."""
    rng = rng or random.Random(9)
    w, h = sprite.w, sprite.h
    bx, by = base
    dh = int(h * 0.4)
    cv = Canvas(w, h + dh)
    cv.blit(sprite, 0, 0)
    rw = w * 0.22
    for y in range(by - 3, by + int(dh * 0.45)):
        u = (y - by + 3) / (dh * 0.45)
        half = rw * (1 - u ** 1.7) + rng.uniform(-1.5, 1.5)
        for x in range(int(bx - half), int(bx + half) + 1):
            r = rng.random()
            cv.px(x, y, 'wood1' if r < 0.55 else ('wood0' if r < 0.85 else ('stone2' if r < 0.95 else 'leaf1')))
    for k in range(int(w * 0.3)):
        x, y = bx + rng.uniform(-rw, rw), by + rng.uniform(0, dh * 0.3)
        a = math.pi / 2 + rng.uniform(-0.9, 0.9)
        for i in range(rng.randint(5, int(dh * 0.95))):
            a += rng.uniform(-0.35, 0.35)
            x += math.cos(a) * 0.9
            y += max(0.3, math.sin(a)) * 0.9
            cv.px(int(x), int(y), 'bark2' if i < 3 else 'bark1')
    return outline(cv)


def hole(w, h, rng=None):
    """Where it stood: a torn crater, broken earth and roots round its rim."""
    rng = rng or random.Random(10)
    cv = Canvas(w, h)
    cx, cy = w / 2, h / 2
    for y in range(h):
        for x in range(w):
            d = ((x - cx) / (w * 0.5)) ** 2 + ((y - cy) / (h * 0.5)) ** 2 + rng.uniform(-0.12, 0.12)
            if d < 0.55:
                cv.px(x, y, 'ink' if y > cy - h * 0.15 else 'wood0')
            elif d < 1.0:
                cv.px(x, y, 'wood1' if rng.random() < 0.7 else ('stone2' if rng.random() < 0.6 else 'bark1'))
    return cv


def debris_sprites(rng=None):
    """Small things that fly: stones, clods, splinters, torn branches of needles."""
    rng = rng or random.Random(11)
    out = dict(stone=[], clod=[], splinter=[], leaf=[])
    for k in range(6):
        s = rng.randint(3, 7)
        cv = Canvas(s + 2, s + 2)
        cv.ellipse(s / 2 + 1, s / 2 + 1, s / 2, s / 2.4, 'stone3')
        cv.px(int(s / 2), int(s / 2), 'stone4')
        out['stone'].append(night(outline(cv)))
        cv = Canvas(s + 2, s + 2)
        cv.ellipse(s / 2 + 1, s / 2 + 1, s / 2, s / 2, 'wood1')
        cv.px(int(s / 2) + 1, int(s / 2), 'wood2')
        out['clod'].append(night(cv))
        L = rng.randint(5, 12)
        cv = Canvas(L + 2, 4)
        cv.hline(1, L, 1, 'wood3')
        cv.hline(1, L - 2, 2, 'wood1')
        out['splinter'].append(night(outline(cv)))
        cv = Canvas(9, 7)
        cv.line(1, 5, 7, 1, 'wood1')
        for i in range(5):
            cv.px(2 + i, 4 - i // 2, 'leaf3')
            cv.px(2 + i, 2 - i // 3, 'leaf2')
        out['leaf'].append(night(cv))
    return out


def bats(w):
    """The pack's blood-moon bats (a flight of them crossing the window), as frames."""
    from PIL import Image
    sh = np.asarray(Image.open(os.path.join(HERE, '..', 'teahouse-assets', 'seasons', 'bloodmoon', 'layers', 'outside',
                                            '04_bats_sheet.png')).convert('RGBA'))
    out = []
    for i in range(0, 144, 2):
        r, c = divmod(i, 2)
        out.append(np.ascontiguousarray(sh[r * 128:(r + 1) * 128, c * 1280:(c + 1) * 1280][:, :w]))
    return out


# ---------------------------------------------------------------- the sets
VALLEY = dict(f=1000.0, cy=60.0, y_h=214, w=900)
SADDLE = (470, 112)            # where it comes over the ridge (valley art)
MOON_V = (470, 84, 30)


def _ground_row(s, Z):
    return s['y_h'] + s['cy'] * (s['f'] / 2) / Z


def valley():
    s = dict(VALLEY)
    w, h = s['w'], 360
    L = []
    L.append(dict(name='sky', Z=1e7, frames=[sky(w, h, s['y_h'], MOON_V, top_pad=60).a], y=-60))
    L.append(dict(name='clouds', Z=2e5, frames=[clouds(w, h, MOON_V, [(MOON_V[0] + 30, 106, 260, 7), (170, 46, 220, 6),
                                                                       (760, 60, 260, 7)], top_pad=60).a], y=-60))
    far, _ = mountain(w, h, [(-20, 186), (90, 166), (200, 184), (330, 172), (600, 180), (760, 164), (920, 182)], 3,
                      snow=0.0, spurs_every=34, tones=('night1', 'night2', 'night2', 'night3'), strokes=0.3)
    L.append(dict(name='range', Z=9000, frames=[far.a]))
    m, prof = mountain(w, h, [(-30, 160), (40, 150), (150, 96), (300, 40), (390, 92), (SADDLE[0], SADDLE[1]),
                              (540, 100), (610, 92), (700, 130), (800, 128), (870, 150), (930, 162)], 7,
                       base=int(_ground_row(s, 3200)) + 2, snow=0.32, spurs_every=44, strokes=0.6)
    L.append(dict(name='mountain', Z=3200, frames=[night(m).a]))
    L.append(dict(name='mist_far', Z=2700, frames=[mist(w, h, 196, 232, 21)]))
    hills = catmull([(-10, 214), (120, 206), (260, 213), (400, 205), (560, 212), (720, 204), (910, 210)], w)
    L.append(dict(name='hills', Z=1800, frames=[forest(w, h, hills, int(_ground_row(s, 1800)) + 2, 12,
                                                        (0.14, 0.12, 0.16, 0.13, 0.11), rows=3, step=5).a]))
    L.append(dict(name='lake', Z=1100, frames=[f.a for f in lake(w, h, int(_ground_row(s, 1800)) + 1,
                                                                 int(_ground_row(s, 600)) + 1, MOON_V[0], 31)], fps=6))
    near = np.full(w, _ground_row(s, 600) - 3) + 2 * np.sin(np.arange(w) * 0.05)
    nf = forest(w, h, near, int(_ground_row(s, 600)) + 4, 13, (0.55, 0.48, 0.6, 0.5, 0.45), rows=2, step=16,
                animate=True, gap=(290, 650))
    L.append(dict(name='shore', Z=600, frames=[f.a for f in nf], fps=8))
    L.append(dict(name='mist_near', Z=500, frames=[mist(w, h, 248, 270, 22, colour=(110, 40, 60), alpha=0.3)]))
    kn = Canvas(w, h)                                                 # a grassy rise on the right, a few pines
    top = np.array([300 - 40 * math.exp(-((x - 740) / 120.0) ** 2) - 8 * math.exp(-((x - 560) / 60.0) ** 2)
                    for x in range(w)])
    for x in range(w):
        for y in range(int(top[x]), h):
            kn.px(x, y, 'leaf2' if y - top[x] < 1 else ('leaf1' if (x * 7 + y * 3) % 11 else 'jade0'))
    rng = random.Random(14)
    for x in range(0, w, 3):
        for k in range(3):
            y = int(top[x]) + 4 + k * 14 + (x * 13 % 9)
            if y < h - 2:
                for i in range(rng.randint(2, 5)):
                    kn.px(x + rng.randint(-1, 1), y - i, 'leaf3' if i > 2 else 'leaf2')
    for (k, x) in ((0.3, 640), (0.42, 700), (0.36, 780), (0.5, 830), (0.28, 880), (0.33, 600)):
        T = grove.black_pine(rng.randrange(999), k=k) if k > 0.4 else grove.cypress(rng.randrange(999), k=k)
        fr = T.frames()[0]
        kn.blit(fr, x - T.base[0], int(top[x]) + 2 - T.base[1])
    for k in range(40):
        x = rng.randrange(600, 880)
        y = int(top[x]) + rng.randint(1, 18)
        kn.px(x, y, 'red4')
        kn.px(x, y - 1, 'red3')
    L.append(dict(name='knoll', Z=350, frames=[night(kn).a]))
    fg = meadow.meadow(w, 338, random.Random(15), [(0, 10, 6, 1, 7), (8, 14, 7, 1, 9), (16, 18, 8, 1, 11)],
                       ['spider_lily'], flower_rate=0.12, height=h, susuki_rate=0.18)
    L.append(dict(name='grass', Z=150, frames=[night(f).a for f in fg], fps=8))
    s['layers'] = L
    return s


def ridge_set():
    """The ridge close, on a long lens: a moon six times as big behind it."""
    s = dict(f=6000.0, cy=60.0, w=760)
    w, h = s['w'], 360
    sad_row = 214
    s['y_h'] = sad_row + (713 - 60) * 3000 / 3200                      # the horizon is far below the frame
    moon_ = (w // 2 - 30, sad_row - 150, 175)
    L = [dict(name='sky', Z=1e7, frames=[sky(w, h, h + 140, moon_, n_stars=300, top_pad=220).a], y=-220),
         dict(name='clouds', Z=2e5, frames=[clouds(w, h, moon_, [(w // 2 + 150, 150, 420, 16), (120, 30, 300, 13),
                                                                 (640, -80, 300, 12)], top_pad=220).a], y=-220)]
    rk, prof = mountain(w, h, [(-30, 110), (40, 120), (150, 170), (260, 205), (w // 2, sad_row), (480, 206),
                               (580, 186), (680, 168), (790, 150)], 41, snow=0.25, spurs_every=52, strokes=1.0, rocks=26)
    L.append(dict(name='ridge', Z=3200, frames=[night(outline(rk)).a]))
    L.append(dict(name='mist', Z=3000, frames=[mist(w, h, 262, 360, 43, alpha=0.4)]))
    s['layers'] = L
    s['sad_row'] = sad_row
    return s


def lake_set(v):
    """Down at the water's edge: the same mountain and hills, the lake all the
    way to your feet, pampas at the edge of frame, fireflies."""
    s = dict(f=1000.0, cy=6.0, y_h=196, w=900)
    w, h = s['w'], 360
    L = []
    off = lambda Z: _ground_row(s, Z) - _ground_row(VALLEY, Z)
    for lay in v['layers']:
        if lay['name'] in ('sky', 'clouds', 'range', 'mountain', 'mist_far', 'hills'):
            d = dict(lay)
            d['y'] = lay.get('y', 0) + (s['y_h'] - VALLEY['y_h'] if lay['name'] in ('sky', 'clouds') else off(lay['Z']))
            L.append(d)
    lk = lake(w, h, int(_ground_row(s, 1800)), h, MOON_V[0], 61)
    L.append(dict(name='lake', Z=900, frames=[f.a for f in lk], fps=8))
    fg = meadow.meadow(w, 350, random.Random(62), [(0, 22, 8, 2, 30), (4, 28, 9, 2, 40)], [], flower_rate=0,
                       height=h, susuki_rate=0.55, fill=False)
    for f in fg:
        f.a[:, 230:670] = 0
    L.append(dict(name='reeds', Z=10, frames=[night(f).a for f in fg], fps=8))
    s['layers'] = L
    return s


def forest_set(v):
    """A clearing at the forest's edge: big trees close on either side, an old
    black pine standing alone in the middle, the tree line behind it, the
    mountain far off. It comes for the pine."""
    s = dict(f=1000.0, cy=1.6, y_h=250, w=760)
    w, h = s['w'], 360
    pad = 300
    L = []
    off = lambda Z: _ground_row(s, Z) - _ground_row(VALLEY, Z)
    moon_ = (MOON_V[0] - 70, MOON_V[1] + (s['y_h'] - VALLEY['y_h']) - 40, 30)
    L.append(dict(name='sky', Z=1e7, frames=[sky(w, h, s['y_h'], moon_, top_pad=pad).a], y=-pad))
    L.append(dict(name='clouds', Z=2e5, frames=[clouds(w, h, moon_, [(moon_[0] + 40, moon_[1] + 24, 250, 8),
                  (150, 70, 260, 7), (620, 10, 280, 7), (300, -160, 360, 9), (620, -240, 300, 8)], top_pad=pad).a],
                  y=-pad))
    for lay in v['layers']:
        if lay['name'] in ('range', 'mountain', 'mist_far', 'hills'):
            d = dict(lay)
            d['y'] = off(lay['Z'])
            d['x'] = -70
            L.append(d)
    base_trees = int(_ground_row(s, 260))
    top = np.full(w, base_trees - 4.0)
    L.append(dict(name='treeline', Z=260, frames=[f.a for f in forest(w, h, top, base_trees + 2, 71,
                                                                       (0.62, 0.75, 0.58, 0.7, 0.55), rows=2, step=48,
                                                                       animate=True, gap=(300, 460))], fps=8))
    L.append(dict(name='mist', Z=220, frames=[mist(w, h, base_trees - 26, base_trees + 6, 72, alpha=0.32)]))
    y0 = int(_ground_row(s, 150))
    g = Canvas(w, h)                                                   # the clearing: grass and spider lilies
    for y in range(y0 - 2, h):
        for x in range(w):
            g.px(x, y, 'leaf1' if (x * 5 + y * 3) % 7 else 'jade0')
    gm = meadow.meadow(w, h, random.Random(74), [(-90, 5, 5, 0, 5), (-60, 8, 6, 0, 6), (-30, 12, 7, 1, 8),
                                                 (0, 16, 8, 1, 10)], ['spider_lily'], flower_rate=0.35, height=h,
                       fill=False, susuki_rate=0.1)
    gframes = []
    for f in gm:
        f.a[:y0 - 4] = 0
        cv = Canvas(w, h)
        cv.a = g.a.copy()
        cv.blit(f, 0, 0)
        gframes.append(night(cv).a)
    L.append(dict(name='ground', Z=40, frames=gframes, fps=8))
    fr, tb = grown(grove.black_pine, 907, 1.25, 0.5)                   # the old pine
    cx = w // 2
    tree = []
    for f in fr:
        cv = Canvas(w, h)
        cv.blit(f, cx - tb[0], y0 + 2 - tb[1])
        tree.append(night(cv).a)
    L.append(dict(name='oldtree', Z=150, frames=tree, fps=8))
    s['tree_px'] = (cx, y0 + 2)
    s['uprooted'] = night(uprooted(fr[0], tb)).a
    s['uprooted_base'] = tb
    s['hole'] = night(hole(70, 12)).a
    big = []
    for f_i in range(16):
        cv = Canvas(w, h + 200)
        for (fn, seed, k, x) in ((grove.zelkova, 31, 1.7, 40), (grove.oak, 32, 1.8, 720)):
            frb, bb = grown(fn, seed, k, 0.6)
            cv.blit(frb[f_i], x - bb[0], h + 200 - 6 - bb[1])
        big.append(night(cv).a)
    L.append(dict(name='near_trees', Z=25, frames=big, fps=8, y=-200))
    fg = meadow.meadow(w, h, random.Random(75), [(-6, 30, 9, 1, 40), (0, 38, 10, 1, 50)], ['spider_lily'],
                       flower_rate=0.4, height=h, susuki_rate=0.3, fill=False)
    for f in fg:
        f.a[:, 180:580] = 0
    L.append(dict(name='fg', Z=6, frames=[night(f).a for f in fg], fps=8))
    s['layers'] = L
    s['debris'] = {k: [c.a for c in v_] for k, v_ in debris_sprites().items()}
    return s


def face_set():
    """Looking up from the clearing: sky and moon, the tops of the trees."""
    s = dict(f=1000.0, cy=1.6, y_h=450, w=760)
    w, h = s['w'], 360
    moon_ = (470, 120, 46)
    L = [dict(name='sky', Z=1e7, frames=[sky(w, h, 470, moon_, n_stars=520, top_pad=200).a], y=-200),
         dict(name='clouds', Z=2e5, frames=[clouds(w, h, moon_, [(540, 150, 330, 12), (160, 60, 280, 10),
                                                                 (650, 30, 240, 9), (300, 250, 360, 11),
                                                                 (420, -120, 300, 10)], top_pad=200).a], y=-200)]
    top = np.full(w, 300.0) + 25 * np.sin(np.arange(w) * 0.013)
    fr = forest(w, h + 160, top, 470, 81, (1.1, 1.3, 1.0, 1.2, 0.95), rows=1, step=110, animate=True, gap=(240, 520),
                fill=False)
    L.append(dict(name='trees', Z=60, frames=[f.a[:h] for f in fr], fps=8))
    s['layers'] = L
    return s


def build_all(path):
    v = valley()
    fo = forest_set(v)
    sets = dict(valley=v, ridge=ridge_set(), lake=lake_set(v), forest=fo, face=face_set())
    bt = bats(900)
    for k, z, y in (('valley', 900, 20), ('lake', 900, 10), ('forest', 400, -10)):
        sets[k]['layers'].append(dict(name='bats', Z=z, frames=bt, fps=12, y=y))
    with open(path, 'wb') as fh:
        pickle.dump(sets, fh, protocol=4)
    return sets


def load(path):
    if not os.path.exists(path):
        return build_all(path)
    with open(path, 'rb') as fh:
        return pickle.load(fh)
