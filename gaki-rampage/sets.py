"""The 2D sets, painted as pixel art in the teahouse pack's palette and style,
one set of layers per camera set-up, like the backgrounds of a 2D film.

Everything on land is painted by day with the pack's tools - its palette, its
grove trees, its meadow of grass, pampas and spider lilies - then re-lit for
the blood moon night with bloodmoon.grade (night ramps, a red rim of moonlight
on every edge that faces the sky, lantern fire left burning). The sky, the
moon, the lake and the mist are painted at night directly.

A set is a camera (focal f, height cy, horizon row y_h) and layers, each at a
depth Z: art pixel (u, v) is at world X = (u - w/2) * 2Z/f, Y = cy - (v - y_h)
* 2Z/f. One art pixel is two screen pixels.

New art for the film: a torii, a shrine hall (nagare roof, shimenawa rope
with paper shide, a bell), stone lanterns with fire in them, the shrine torn
out of the ground with its roots, the hole it leaves, and debris.
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
    amp = tot = 0.0
    amp = 1.0
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


def frames_of(x):
    return x if isinstance(x, list) else [x]


# ---------------------------------------------------------------- sky
def sky(w, h, horizon, moon, seed=71, n_stars=None, top_pad=0):
    """Night sky: deep violet to a dull red glow on the horizon, stars, and the
    blood moon with its halo (the pack's moon, painted at any size)."""
    mx, my, mr = moon
    my = my + top_pad
    horizon = horizon + top_pad
    cv = Canvas(w, h + top_pad)
    H = h + top_pad
    yy, xx = np.mgrid[0:H, 0:w]
    stops = [0, top_pad + (horizon - top_pad) * 0.35, horizon * 0.72 + top_pad * 0.28, horizon * 0.92, horizon, H + 1]
    top = np.array([[8, 6, 18], [14, 10, 28], [30, 20, 50], [56, 28, 64], [76, 24, 46], [76, 24, 46]], float)
    rgb = np.stack([np.interp(yy, stops, top[:, c]) for c in range(3)], -1)
    dist = np.hypot(xx - mx, yy - my)
    halo = np.clip(1 - (dist - mr) / (mr * 5.5), 0, 1)
    corona = np.clip(1 - (dist - mr) / (mr * 0.45), 0, 1)
    rgb += (halo ** 2.6)[..., None] * np.array([52, 6, 4]) + (corona ** 1.5)[..., None] * np.array([48, 0, 0])
    cv.a[..., :3] = BM._quant(rgb, BM.SKY_SET, 18.0, yy, xx)
    cv.a[..., 3] = 255
    rng = random.Random(seed)
    for _ in range(n_stars or int(w * min(horizon, H) / 300)):
        x, y = rng.randrange(w), int(min(horizon, H - 1) * 0.92 * rng.random() ** 1.6)
        if halo[y, x] > 0.02:
            continue
        r = rng.random()
        cv.px(x, y, 'night5' if r < 0.55 else ('cloud1' if r < 0.8 else ('pink3' if r < 0.9 else 'fire5')))
    for _ in range(n_stars and n_stars // 16 or int(w * min(horizon, H) / 4800)):
        x, y = rng.randrange(w), int(min(horizon, H - 1) * 0.8 * rng.random() ** 1.5)
        if halo[y, x] > 0:
            continue
        cv.px(x, y, 'white')
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            cv.px(x + dx, y + dy, 'night5')
    BM.MOON_X, BM.MOON_Y, BM.MOON_R = mx, my, mr
    BM._moon(cv)
    if mr > 40:                                                         # a big moon: mottled maria and small craters
        ramp = [PAL[c] for c in ('blood1', 'blood2', 'blood3', 'blood4', 'blood5', 'blood6')]
        n = fbm(2 * mr + 3, 2 * mr + 3, seed + 5, 6) - 0.5
        rr = np.random.RandomState(seed)
        cr = [(rr.uniform(-0.8, 0.8), rr.uniform(-0.8, 0.8), rr.uniform(0.015, 0.05)) for _ in range(16)]
        for y in range(-mr, mr + 1):
            for x in range(-mr, mr + 1):
                if x * x + y * y > mr * mr:
                    continue
                X, Y = mx + x, my + y
                if not (0 <= X < w and 0 <= Y < H):
                    continue
                c = tuple(int(v) for v in cv.a[Y, X, :3])
                k = next((i for i, rgb in enumerate(ramp) if tuple(rgb) == c), None)
                if k is None:
                    continue
                dk = n[y + mr, x + mr] * 2.6
                for (cx_, cy_, r_) in cr:
                    d = math.hypot(x / mr - cx_, y / mr - cy_)
                    if d < r_:
                        dk -= 1
                    elif d < r_ + 0.02 and y / mr > cy_:
                        dk += 1
                k = int(np.clip(round(k + dk + BAYER[Y % 4, X % 4]), 0, len(ramp) - 1))
                cv.a[Y, X, :3] = ramp[k]
    return cv


def cloud_bands(w, h, moon, bands, seed=73, top_pad=0):
    """Thin bands of night cloud, lit red underneath near the moon (the pack's
    blood moon clouds, placed for this set)."""
    mx, my, mr = moon
    my += top_pad
    cv = Canvas(w, h + top_pad)
    rng = random.Random(seed)
    md = lambda x, y: math.hypot(x - mx, y - my)
    reach = mr * 7
    for (cx, cy, ln, th) in bands:
        cy += top_pad
        ph = rng.uniform(0, 6.3)
        for i in range(int(ln)):
            u = i / ln
            x = int(cx - ln / 2 + i)
            half = th * math.sin(math.pi * u) ** 0.7 * (0.65 + 0.2 * math.sin(i * 0.09 + ph) + 0.15 * math.sin(i * 0.31))
            if half < 0.6:
                continue
            y0 = int(round(cy - half * 0.45 + 1.5 * math.sin(i * 0.02 + ph)))
            y1 = int(round(cy + half * 0.55 + 1.5 * math.sin(i * 0.02 + ph)))
            lit = max(0.0, 1 - md(x, (y0 + y1) / 2) / reach)
            for y in range(y0, y1 + 1):
                over = md(x, y) <= mr + 1
                if y == y1:
                    c = 'blood4' if lit > 0.75 else ('blood2' if lit > 0.45 else ('blood0' if lit > 0.2 else 'night2'))
                elif y == y0:
                    c = 'blood3' if (over or lit > 0.8) else ('night4' if lit < 0.4 else 'blood1')
                else:
                    c = 'night1' if over else ('night2' if lit < 0.5 else 'night3')
                cv.px(x, y, c)
    return cv


# ---------------------------------------------------------------- land
def ridge(w, seed, base, amp, scales=((2, 1.0), (5, 0.5), (11, 0.25), (23, 0.12), (53, 0.05)), peaks=()):
    """A ridge line (row of the crest per column): layered noise, sharpened
    crests, plus hand-placed peaks/saddles (x, row, width)."""
    rng = np.random.RandomState(seed)
    x = np.arange(w)
    out = np.zeros(w)
    for k, a in scales:
        out += a * np.sin(2 * math.pi * k * x / w + rng.uniform(0, 6.3))
    out = (out - out.min()) / (np.ptp(out) + 1e-9)
    prof = base - amp * out
    for (px_, row, wd) in peaks:
        g = np.exp(-((x - px_) / wd) ** 2)
        prof = prof * (1 - g) + row * g
    return prof


def mountain(w, h, prof, seed, snow=0.0, ramp=('stone0', 'stone1', 'stone2', 'haze1', 'haze2', 'haze3'),
             strata=0.5):
    """A rock mountain painted by day: lit on the faces that turn to the upper
    left, dark on the others, gullies and strata, snow in the high gullies."""
    cv = Canvas(w, h)
    yy, xx = np.mgrid[0:h, 0:w]
    top = prof[None, :]
    inside = yy >= np.floor(top)
    d = yy - top
    sm = np.convolve(np.concatenate([prof[:6], prof, prof[-6:]]), np.ones(13) / 13, 'same')[6:-6]
    sl = np.gradient(sm)[None, :]
    tex = fbm(h, w, seed, 10)
    fine = fbm(h, w, seed + 1, 40)
    # faces: each column of rock leans with the slope above it, light from the upper left
    face = np.clip(-sl * 1.4, -1, 1) * np.exp(-d / 90.0) + (tex - 0.5) * 0.9
    v = 0.48 + 0.3 * face + 0.18 * (fine - 0.5) - 0.22 * np.clip(d / (h * 0.7), 0, 1)
    gully = np.sin(xx * 0.19 + yy * 0.55 + tex * 9) + np.sin(xx * 0.047 - yy * 0.12 + tex * 4)
    v -= 0.16 * (gully > 1.35)
    v -= 0.08 * strata * (np.sin(yy * 0.7 + xx * 0.05 + tex * 14 + fine * 6) > 0.9)
    v += 0.18 * (d < 1.5)
    rgb = quant(np.clip(v, 0, 0.999), ramp)
    if snow > 0:
        high = np.clip((prof.max() - top) / (prof.max() - prof.min() + 1e-6), 0, 1) ** 1.5
        depth = snow * (25 + 70 * tex) * high
        patchy = fbm(h, w, seed + 2, 24)
        sn = (d < depth) & (patchy > 0.45 - 0.2 * snow) & inside
        sv = np.clip(0.45 + 0.45 * face + 0.15 * (fine - 0.5), 0, 0.999)
        rgb = np.where(sn[..., None], quant(sv, ('haze2', 'haze3', 'cloud0', 'cloud1')), rgb)
    cv.a[..., :3] = rgb
    cv.a[..., 3] = np.where(inside, 255, 0)
    return cv


_TREES = {}


def tree_kinds(sizes, seed=100):
    """A small nursery of the pack's grove trees at a size, with their sway frames."""
    key = (tuple(sizes), seed)
    if key not in _TREES:
        out = []
        for i, k in enumerate(sizes):
            fn = (grove.cypress, grove.black_pine, grove.oak, grove.cypress, grove.zelkova)[i % 5]
            T = fn(seed + i, k=k)
            out.append((T.frames(wind_phase=i * 0.7, wind=0.7), T.base))
        _TREES[key] = out
    return _TREES[key]


def forest(w, h, top, base, seed, sizes, rows=3, step=6, ground='jade0', animate=False, gap=None):
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
        cv.a[g] = PAL[ground] + (255,)
        for (y, x, k) in items:
            fr, (bx, by) = kinds[k]
            cv.blit(fr[f % len(fr)], int(x) - bx, y - by)
        out.append(night(cv))
    return out if animate else out[0]


def mist(w, h, y0, y1, seed, colour=(150, 60, 70), alpha=0.55, top_pad=0):
    """A soft bank of mist (not pixel-art: drawn soft, like a painted overlay)."""
    a = np.zeros((h + top_pad, w), np.float32)
    yy = np.arange(h + top_pad)[:, None] - top_pad
    band = np.clip((yy - y0) / 12.0, 0, 1) * np.clip((y1 - yy) / ((y1 - y0) * 0.6), 0, 1)
    n = fbm(h + top_pad, w, seed, 6) * 0.7 + fbm(h + top_pad, w, seed + 1, 20) * 0.3
    a = band * np.clip(n * 1.6 - 0.25, 0, 1) * alpha
    out = np.zeros((h + top_pad, w, 4), np.uint8)
    out[..., :3] = colour
    out[..., 3] = (a * 255).astype(np.uint8)
    return out


def lake(w, h, y0, y1, moon_x, seed, frames=8, shore='night0'):
    """Still night water: the far shore's dark reflection, faint ripple lines,
    and the moon's broken red road coming toward you."""
    out = []
    rng = np.random.RandomState(seed)
    for f in range(frames):
        cv = Canvas(w, h)
        yy, xx = np.mgrid[0:h, 0:w]
        d = np.clip((yy - y0) / max(1, y1 - y0), 0, 1)
        v = 0.35 - 0.2 * d + 0.08 * fbm(h, w, seed, 12)
        rgb = quant(np.clip(v, 0, 0.999), ('night0', 'night1', 'night2', 'night3'))
        water = (yy >= y0) & (yy < y1)
        cv.a[..., :3] = rgb
        cv.a[..., 3] = np.where(water, 255, 0)
        for y in range(y0, y1):                                         # ripple lines, longer near you
            dd = (y - y0) / max(1, y1 - y0)
            for k in range(int(w / 40 * (0.6 + dd))):
                L = int(2 + 10 * dd * rng.rand() + 1)
                x = int((rng.rand() * w + f * (3 + dd * 6) * (1 if y % 2 else -1)) % w)
                for i in range(L):
                    cv.px((x + i) % w, y, 'night3' if dd < 0.5 else 'night4')
            half = 3 + dd * 22                                          # the moon's road
            for k in range(int(4 + 10 * dd)):
                x = int(moon_x + rng.randn() * half * 0.6 + math.sin(f * 0.8 + y) * 2)
                L = int(2 + rng.rand() * (4 + 8 * dd))
                c = ('blood2', 'blood3', 'blood4', 'blood5')[min(3, int(rng.rand() * 4 * (1 - dd * 0.5)))]
                for i in range(L):
                    cv.px(x + i, y, c)
        for x in range(w):                                              # the far shore's reflection
            for y in range(y0, y0 + 2 + (x * 7 % 3)):
                cv.px(x, y, shore)
        out.append(cv)
    return out


# ---------------------------------------------------------------- the shrine
def torii(h):
    """A vermilion torii: two pillars leaning in a little, black feet, the tie
    beam through them, the plaque, and the two top beams curving up at the
    ends with their black cap."""
    w = int(h * 1.2) + 6
    cv = Canvas(w, h + 2)
    cx = w // 2
    base = h + 1
    pw = max(2.0, h * 0.075)
    span = h * 0.34
    top_k = int(h * 0.14)
    for s in (-1, 1):
        for y in range(top_k, base):
            u = (y - top_k) / (base - top_k)
            half = pw / 2 * (0.88 + 0.24 * u)
            xc = cx + s * (span + u * h * 0.025)
            for x in range(int(math.floor(xc - half)), int(math.ceil(xc + half)) + 1):
                rel = (x - (xc - half)) / (2 * half)
                c = 'scarlet3' if rel < 0.3 else ('scarlet2' if rel < 0.72 else 'scarlet1')
                if y > base - max(2, h * 0.07):
                    c = 'ink' if rel > 0.3 else 'stone1'
                cv.px(x, y, c)
    nk = int(h * 0.3)
    tn = max(2, int(h * 0.05))
    ext = h * 0.13
    for y in range(nk, nk + tn):
        for x in range(int(cx - span - ext), int(cx + span + ext) + 1):
            c = 'scarlet3' if y == nk else ('scarlet1' if y == nk + tn - 1 else 'scarlet2')
            cv.px(x, y, c)
    gw = max(2, int(h * 0.09))                                         # the plaque on its strut
    for y in range(top_k, nk):
        for x in range(cx - gw // 2, cx + gw // 2 + 1):
            cv.px(x, y, 'ink' if (x in (cx - gw // 2, cx + gw // 2) or y in (top_k, nk - 1)) else 'gold2')
    L = span + h * 0.3
    tk = max(3, int(h * 0.09))
    for x in range(int(cx - L), int(cx + L) + 1):
        u = abs(x - cx) / L
        lift = h * 0.07 * u ** 2.4
        yb = top_k - lift
        for i in range(tk + int(tk * 0.4)):
            y = int(round(yb - i))
            if i < tk * 0.45:
                c = 'scarlet1' if i == 0 else 'scarlet2'
            else:
                c = 'ink' if i < tk + int(tk * 0.4) - 1 else 'stone2'
            cv.px(x, y, c)
    return outline(cv)


def honden(h, rng=None):
    """A small shrine hall: a stone platform, plank walls and lattice doors, a
    deep copper roof gone green with chigi and katsuogi on the ridge, a thick
    shimenawa rope with zigzag paper shide, and a bell on a red-and-white rope."""
    rng = rng or random.Random(5)
    w = int(h * 1.3) + 8
    H = h + 6
    cv = Canvas(w, H)
    cx = w // 2
    base = H - 2
    ph = max(2, int(h * 0.09))
    for t, (wd, c_top, c_face) in enumerate(((h * 0.62, 'stone3', 'stone2'), (h * 0.52, 'stone4', 'stone2'))):
        yb = base - t * ph
        for y in range(yb - ph, yb):
            for x in range(int(cx - wd), int(cx + wd) + 1):
                c = c_top if y == yb - ph else (c_face if (x + y) % 9 else 'stone1')
                if x < cx - wd + 2:
                    c = 'stone3'
                cv.px(x, y, c)
    plat = base - 2 * ph
    wall_top = plat - int(h * 0.4)
    ww = h * 0.36
    for y in range(wall_top, plat):
        for x in range(int(cx - ww), int(cx + ww) + 1):
            plank = (x - int(cx - ww)) % 4
            c = 'wood3' if plank == 0 else ('wood2' if plank < 3 else 'wood1')
            if abs(x - cx) < ww * 0.55 and y > wall_top + h * 0.06:      # lattice doors
                c = 'wood0' if ((x - cx) % 3 == 0 or (y - wall_top) % 3 == 0) else 'wood1'
                if abs(x - cx) < 1:
                    c = 'ink'
            if abs(abs(x - cx) - ww) < 1.5:                             # corner posts
                c = 'wood1' if x > cx else 'wood3'
            cv.px(x, y, c)
    for y in range(wall_top, wall_top + max(2, int(h * 0.05))):          # dark under the eaves
        for x in range(int(cx - ww), int(cx + ww) + 1):
            cv.px(x, y, 'ink' if y == wall_top else 'wood0')
    # the roof: a gable with deep eaves, copper gone green
    re = h * 0.68
    ridge_y = wall_top - h * 0.36
    eave_y = wall_top + h * 0.02
    th = max(2, h * 0.075)
    for x in range(int(cx - re), int(cx + re) + 1):
        u = abs(x - cx) / re
        y_top = ridge_y + (eave_y - ridge_y) * (u ** 0.8) - h * 0.03 * math.sin(math.pi * u)
        for i in range(int(th) + 1):
            y = int(round(y_top + i))
            c = 'teal3' if i == 0 else ('teal2' if i < th * 0.5 else ('teal1' if i < th else 'teal0'))
            if (x * 3 + y) % 7 == 0 and i > 0:
                c = 'teal1'
            cv.px(x, y, c)
        if u < 0.62:                                                    # the gable face under it
            y_g0 = int(round(y_top + th + 1))
            for y in range(y_g0, wall_top):
                cv.px(x, y, 'wood1' if abs(x - cx) > 1 else 'wood0')
    for s in (-1, 1):                                                   # chigi: crossed boards at the ridge
        for i in range(int(h * 0.16)):
            cv.px(int(cx + s * (i * 0.55 - 1)), int(ridge_y - i * 0.9), 'ink' if i % 4 else 'wood1')
    for k in (-1, 0, 1):                                                # katsuogi: logs on the ridge, gold-capped
        x = int(cx + k * h * 0.12)
        cv.rect(x - 1, int(ridge_y - 2), 3, 2, 'wood1')
        cv.px(x, int(ridge_y - 2), 'gold3')
    # shimenawa: thick twisted straw rope sagging across the front, with shide
    rt = max(2, int(h * 0.055))
    ry = wall_top + h * 0.06
    for x in range(int(cx - ww - 2), int(cx + ww + 3)):
        u = (x - cx) / (ww + 2)
        y0 = ry + h * 0.05 * (1 - u * u)
        for i in range(rt):
            cv.px(x, int(round(y0 + i)), 'hinoki4' if (x + i) % 4 < 2 else 'hinoki3')
    for k in (-0.6, -0.2, 0.2, 0.6):                                    # paper shide, zigzag
        x0 = int(cx + k * ww)
        y0 = int(ry + h * 0.05 * (1 - k * k)) + rt
        for i in range(int(h * 0.14)):
            cv.px(x0 + (1 if (i // 2) % 2 else 0), y0 + i, 'white' if i % 2 else 'cloud2')
    bx, by = cx, int(ry + rt + h * 0.02)                                 # the bell and its rope
    cv.ellipse(bx, by + 1, max(1, h * 0.035), max(1, h * 0.03), 'gold3')
    cv.px(bx - 1, by, 'gold4')
    for i in range(int(h * 0.22)):
        cv.px(bx, by + 3 + i, 'scarlet2' if (i // 2) % 2 else 'white')
    for _ in range(int(h * 0.5)):                                       # moss on the roof and the stones
        x = rng.randrange(w)
        y = rng.randrange(H)
        if cv.opaque(x, y) and rng.random() < 0.5:
            r, g, b, a = cv.get(x, y)
            if (r, g, b) in (PAL['teal2'], PAL['teal3'], PAL['stone2'], PAL['stone3']):
                cv.px(x, y, 'leaf2' if rng.random() < 0.5 else 'leaf1')
    return outline(cv)


def lantern(h, lit=True):
    """A stone lantern (toro) with a fire in its window."""
    w = int(h * 0.62) + 6
    cv = Canvas(w, h + 2)
    cx = w // 2
    y = h + 1
    parts = [(0.1, 0.24, 'base'), (0.33, 0.07, 'post'), (0.07, 0.2, 'shelf'), (0.19, 0.15, 'fire'),
             (0.12, 0.29, 'roof'), (0.09, 0.05, 'top')]
    for frac, half, kind in parts:
        ph = max(1, int(round(h * frac)))
        for i in range(ph):
            yy = y - 1 - i
            if kind == 'roof':
                hw = h * (0.08 + 0.21 * (1 - i / ph) ** 1.4) + (1 if i == 0 else 0)
            elif kind == 'top':
                hw = h * 0.05 * math.sin(math.pi * (i + 0.5) / ph) + 0.5
            else:
                hw = h * half
            for x in range(int(cx - hw), int(cx + hw) + 1):
                rel = (x - (cx - hw)) / (2 * hw + 1e-6)
                c = 'stone4' if rel < 0.3 else ('stone3' if rel < 0.7 else 'stone2')
                if kind == 'fire' and abs(x - cx) < hw * 0.62 and 0 < i < ph - 1:
                    c = ('fire5' if abs(x - cx) < hw * 0.25 else 'fire4') if lit else 'ink'
                    if abs(x - cx) < 0.6:
                        c = 'stone2'
                if kind == 'roof' and i == 0:
                    c = 'stone1'
                cv.px(x, yy, c)
        y -= ph
    return outline(cv)


def uprooted(sprite, rng=None):
    """The shrine torn out of the ground: under its platform, a clod of earth
    and stones with roots hanging out of it."""
    rng = rng or random.Random(9)
    w, h = sprite.w, sprite.h
    dh = int(h * 0.55)
    cv = Canvas(w, h + dh)
    cv.blit(sprite, 0, 0)
    cx = w // 2
    for y in range(h - 2, h + int(dh * 0.5)):                           # the clod, tapering down
        u = (y - h + 2) / (dh * 0.5)
        half = w * 0.42 * (1 - u ** 1.6) + rng.uniform(-1.5, 1.5)
        for x in range(int(cx - half), int(cx + half) + 1):
            r = rng.random()
            c = 'wood1' if r < 0.55 else ('wood0' if r < 0.85 else ('stone2' if r < 0.95 else 'leaf1'))
            cv.px(x, y, c)
    for k in range(int(w * 0.35)):                                      # roots
        x, y = cx + rng.uniform(-w * 0.35, w * 0.35), h + rng.uniform(0, dh * 0.4)
        a = math.pi / 2 + rng.uniform(-0.8, 0.8)
        for i in range(rng.randint(4, int(dh * 0.9))):
            a += rng.uniform(-0.35, 0.35)
            x += math.cos(a) * 0.9
            y += max(0.3, math.sin(a)) * 0.9
            cv.px(int(x), int(y), 'bark2' if i < 3 else 'bark1')
    return outline(cv)


def hole(w, h, rng=None):
    """Where it stood: a torn crater, broken stones round its rim."""
    rng = rng or random.Random(10)
    cv = Canvas(w, h)
    cx, cy = w / 2, h / 2
    for y in range(h):
        for x in range(w):
            d = ((x - cx) / (w * 0.5)) ** 2 + ((y - cy) / (h * 0.5)) ** 2
            d += rng.uniform(-0.12, 0.12)
            if d < 0.55:
                cv.px(x, y, 'ink' if y > cy - h * 0.15 else 'wood0')
            elif d < 1.0:
                cv.px(x, y, 'wood1' if rng.random() < 0.7 else ('stone2' if rng.random() < 0.6 else 'bark1'))
    return cv


def debris_sprites(rng=None):
    """Small things that fly: stones, clods, splinters of the hall, paper charms."""
    rng = rng or random.Random(11)
    out = dict(stone=[], clod=[], splinter=[], paper=[])
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
        cv = Canvas(6, 9)
        cv.rect(1, 1, 4, 7, 'white')
        cv.vline(3, 2, 6, 'scarlet2')
        out['paper'].append(night(cv))
    return out


# ---------------------------------------------------------------- the sets
VALLEY = dict(f=1000.0, cy=60.0, y_h=214, w=900)
SADDLE = (470, 112)            # where it comes over the ridge (valley art)
MOON_V = (470, 86, 30)


def _ground_row(s, Z):
    return s['y_h'] + s['cy'] * (s['f'] / 2) / Z


def valley():
    s = dict(VALLEY)
    w, h = s['w'], 360
    L = []
    L.append(dict(name='sky', Z=1e7, frames=[sky(w, h, s['y_h'], MOON_V, top_pad=60).a], y=-60))
    L.append(dict(name='clouds', Z=2e5, frames=[cloud_bands(w, h, MOON_V, [(MOON_V[0] + 40, 104, 300, 4.5),
                  (180, 40, 260, 4), (760, 58, 300, 5), (330, 150, 260, 3.5), (640, 132, 240, 4)], top_pad=60).a],
                  y=-60))
    far = ridge(w, 3, 200, 34, peaks=((120, 168, 60), (820, 172, 70)))
    cv = Canvas(w, h)
    for x in range(w):
        for y in range(int(far[x]), h):
            d = y - far[x]
            c = 'night4' if d < 1 else ('night3' if (d < 6 and (x + y) % 2) else 'night2')
            if d < 1 and abs(x - MOON_V[0]) < 160:
                c = 'blood1'
            cv.px(x, y, c)
    L.append(dict(name='range', Z=9000, frames=[cv.a]))
    prof = ridge(w, 7, 205, 70, peaks=((300, 40, 70), (SADDLE[0], SADDLE[1], 55), (610, 96, 50), (40, 150, 60),
                                        (860, 140, 50)))
    L.append(dict(name='mountain', Z=3200, frames=[night(mountain(w, h, prof, 7, snow=0.5)).a]))
    L.append(dict(name='mist_far', Z=2700, frames=[mist(w, h, 180, 236, 21)]))
    hills = ridge(w, 11, 226, 18)
    L.append(dict(name='hills', Z=1800, frames=[forest(w, h, hills, int(_ground_row(s, 1800)) + 2, 12,
                                                        (0.14, 0.12, 0.16, 0.13, 0.11), rows=3, step=5).a]))
    L.append(dict(name='lake', Z=1100, frames=[f.a for f in lake(w, h, int(_ground_row(s, 1800)) + 1,
                                                                 int(_ground_row(s, 600)) + 1, MOON_V[0], 31)],
                  fps=6))
    near = np.full(w, _ground_row(s, 600) - 3) + 2 * np.sin(np.arange(w) * 0.05)
    nf = forest(w, h, near, int(_ground_row(s, 600)) + 4, 13, (0.55, 0.48, 0.6, 0.5, 0.45), rows=2, step=16,
                animate=True, gap=(290, 650))                           # the lake left open in the middle
    L.append(dict(name='shore', Z=600, frames=[f.a for f in nf], fps=8))
    L.append(dict(name='mist_near', Z=500, frames=[mist(w, h, 246, 272, 22, colour=(110, 40, 60), alpha=0.25)]))
    # the shrine on its knoll, on the right
    kn = Canvas(w, h)
    top = np.array([300 - 46 * math.exp(-((x - 720) / 120.0) ** 2) - 10 * math.exp(-((x - 560) / 60.0) ** 2)
                    for x in range(w)])
    for x in range(w):
        for y in range(int(top[x]), h):
            kn.px(x, y, 'leaf2' if y - top[x] < 1 else ('leaf1' if (x * 7 + y * 3) % 11 else 'jade0'))
    rng = random.Random(14)
    sx, sy = 720, int(top[720])
    gm = meadow.meadow(w, 0, random.Random(16), [(0, 5, 4, 0, 4)], [], flower_rate=0, height=h, fill=False)[0]
    for x in range(0, w, 3):                                            # grass over the knoll's face
        for k in range(3):
            y = int(top[x]) + 4 + k * 14 + (x * 13 % 9)
            if y < h - 2:
                for i in range(rng.randint(2, 5)):
                    kn.px(x + rng.randint(-1, 1), y - i, 'leaf3' if i > 2 else 'leaf2')
    for k in range(60):                                                 # the path up to it, stone by stone
        u = k / 59
        x = int(560 + (sx - 40 - 560) * u + 6 * math.sin(u * 5))
        y = int(top[x] + (1 - u) * 50 + 2)
        kn.rect(x - 2, y, 4, 2, 'stone2' if k % 2 else 'stone3')
    del gm
    for (k, x) in ((0.22, 640), (0.26, 668), (0.2, 790), (0.25, 812), (0.18, 840), (0.3, 880), (0.24, 610),
                   (0.34, 760)):
        T = grove.cypress(rng.randrange(999), k=k)
        fr = T.frames()[0]
        kn.blit(fr, x - T.base[0], int(top[x]) + 2 - T.base[1])
    hd = honden(14)
    kn.blit(hd, sx - hd.w // 2, sy - hd.h + 1)
    lt = lantern(7)
    for dx in (-14, 14):
        kn.blit(lt, sx + dx - lt.w // 2, sy - lt.h + 2)
    tr = torii(18)
    kn.blit(tr, sx - 34 - tr.w // 2, int(top[sx - 34]) - tr.h + 2)
    for k in range(30):                                                 # spider lilies on the slope
        x = rng.randrange(600, 860)
        y = int(top[x]) + rng.randint(1, 18)
        kn.px(x, y, 'red4')
        kn.px(x, y - 1, 'red3')
    L.append(dict(name='knoll', Z=350, frames=[night(kn).a], lights=[(sx + dx, sy - 5) for dx in (-14, 14)]))
    fg = meadow.meadow(w, 338, random.Random(15), [(0, 10, 6, 1, 7), (8, 14, 7, 1, 9), (16, 18, 8, 1, 11)],
                       ['spider_lily'], flower_rate=0.12, height=h, susuki_rate=0.18)
    L.append(dict(name='grass', Z=150, frames=[night(f).a for f in fg], fps=8))
    s['layers'] = L
    s['knoll'] = (sx, sy)
    s['prof'] = prof
    return s


def ridge_set():
    """The ridge close, on a long lens: a moon six times as big behind it."""
    s = dict(f=6000.0, cy=60.0, w=760, cx0=None)
    w, h = s['w'], 360
    sad_row = 214
    s['y_h'] = sad_row + (713 - 60) * 3000 / 3200                      # the horizon is far below the frame
    L = []
    moon = (w // 2 - 30, sad_row - 150, 175)
    L.append(dict(name='sky', Z=1e7, frames=[sky(w, h, h + 140, moon, n_stars=260).a]))
    L.append(dict(name='clouds', Z=2e5, frames=[cloud_bands(w, h, moon, [(w // 2 + 90, 120, 560, 9),
                                                                          (150, 40, 420, 8), (600, 290, 400, 7)]).a]))
    prof = ridge(w, 41, 240, 38, scales=((1, 1.0), (3, 0.6), (7, 0.35), (17, 0.2), (41, 0.12), (89, 0.06)),
                 peaks=((w // 2, sad_row, 120), (60, 120, 90), (w - 40, 170, 80)))
    rk = mountain(w, h, prof, 41, snow=0.35, strata=1.4)
    rng = random.Random(42)
    for _ in range(26):                                                 # boulders along the crest
        x = rng.randrange(w)
        r = rng.randint(3, 8)
        y = int(prof[x]) - r // 2
        rk.ellipse(x, y, r, r * 0.7, 'stone2')
        rk.ellipse(x - r * 0.3, y - r * 0.3, r * 0.5, r * 0.35, 'haze2')
    L.append(dict(name='ridge', Z=3200, frames=[night(outline(rk)).a]))
    L.append(dict(name='mist', Z=3000, frames=[mist(w, h, 250, 360, 43, alpha=0.5)]))
    s['layers'] = L
    s['prof'] = prof
    s['sad_row'] = sad_row
    return s


def lake_set(v):
    """Down at the water's edge: the same mountain and hills, the lake all the
    way to your feet, pampas at the edge of frame."""
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
    L.append(dict(name='lake', Z=900, frames=[f.a for f in lk], fps=8, water=True))
    fg = meadow.meadow(w, 350, random.Random(62), [(0, 22, 8, 2, 30), (4, 28, 9, 2, 40)], [], flower_rate=0,
                       height=h, susuki_rate=0.55, fill=False)
    for f in fg:                                                        # pampas only at the edges of frame
        f.a[:, 230:670] = 0
    L.append(dict(name='reeds', Z=10, frames=[night(f).a for f in fg], fps=8))
    s['layers'] = L
    return s


def shrine_set(v):
    """At the foot of the shrine: the torii over you, lanterns down the path,
    the hall between the pillars, the trees behind, the mountain far off."""
    s = dict(f=1000.0, cy=1.6, y_h=250, w=760)
    w, h = s['w'], 360
    pad = 300                                                           # sky above, for tilting up
    L = []
    off = lambda Z: _ground_row(s, Z) - _ground_row(VALLEY, Z)
    moon = (MOON_V[0] - 70, MOON_V[1] + (s['y_h'] - VALLEY['y_h']) - 40, 30)
    L.append(dict(name='sky', Z=1e7, frames=[sky(w, h, s['y_h'], moon, top_pad=pad).a], y=-pad))
    L.append(dict(name='clouds', Z=2e5, frames=[cloud_bands(w, h, moon, [(moon[0] + 50, moon[1] + 22, 300, 4.5),
                  (150, 80, 300, 5), (600, 20, 340, 4), (300, -150, 400, 5), (620, -230, 300, 4)], top_pad=pad).a],
                  y=-pad))
    for lay in v['layers']:
        if lay['name'] in ('range', 'mountain', 'mist_far', 'hills'):
            d = dict(lay)
            d['y'] = off(lay['Z'])
            d['x'] = -70
            L.append(d)
    base_trees = int(_ground_row(s, 110))
    top = np.full(w, base_trees - 4.0)
    L.append(dict(name='trees', Z=110, frames=[f.a for f in forest(w, h, top, base_trees + 2, 71,
                                                                    (0.75, 0.9, 0.7, 0.85, 0.65), rows=1, step=70,
                                                                    animate=True)], fps=8))
    L.append(dict(name='mist', Z=90, frames=[mist(w, h, base_trees - 30, base_trees + 6, 72, alpha=0.35)]))
    # the ground, from the hall to your feet: a gravel path between grass and spider lilies
    g = Canvas(w, h)
    y0 = int(_ground_row(s, 60))
    rng = random.Random(73)
    cx = w // 2
    for y in range(y0 - 2, h):
        u = max(0.0, (y - y0) / (h - y0))
        half = 26 + 230 * u ** 1.15
        for x in range(w):
            if abs(x - cx) < half:
                r = rng.random()
                c = 'stone1' if r < 0.5 else ('stone2' if r < 0.88 else ('stone0' if r < 0.95 else 'stone3'))
                band = (y - y0) / max(1.0, 3 + 22 * u)                 # stepping stones up the middle
                if abs(x - cx) < half * 0.42 and (band % 1.0) < 0.72:
                    c = 'stone3' if (band % 1.0) < 0.12 else ('stone2' if (x + y) % 5 else 'stone3')
                if abs(abs(x - cx) - half) < 1 + 2 * u:
                    c = 'stone0'
            else:
                c = 'leaf1' if (x * 5 + y * 3) % 7 else 'jade0'
            g.px(x, y, c)
    gm = meadow.meadow(w, h, random.Random(74), [(-80, 6, 5, 0, 5), (-50, 9, 6, 0, 6), (-20, 13, 7, 1, 8)],
                       ['spider_lily'], flower_rate=0.45, height=h, fill=False)
    gframes = []
    for f in gm:
        f.a[:, :][np.abs(np.arange(w) - cx)[None, :] < (26 + 230 * np.clip((np.arange(h)[:, None] - y0) /
                                                                            (h - y0), 0, 1) ** 1.15)] = 0
        f.a[:y0 - 4] = 0
        cv = Canvas(w, h)
        cv.a = g.a.copy()
        cv.blit(f, 0, 0)
        gframes.append(night(cv).a)
    L.append(dict(name='ground', Z=40, frames=gframes, fps=8))
    hd = honden(100)
    shrine = Canvas(w, h)
    sx, sy = cx, y0 + 2
    shrine.blit(hd, sx - hd.w // 2, sy - hd.h + 1)
    L.append(dict(name='shrine', Z=60, frames=[night(shrine).a]))
    s['shrine_px'] = (sx, sy, hd.w, hd.h)
    s['uprooted'] = night(uprooted(hd)).a
    s['hole'] = night(hole(int(hd.w * 0.9), 14)).a
    lights = []
    lt = Canvas(w, h)
    for (dx, Z, hh) in ((-170, 22, 96), (170, 22, 96), (-95, 40, 54), (95, 40, 54)):
        sp = lantern(hh)
        yb = int(_ground_row(s, Z))
        x = int(cx + dx * (25 / Z) ** 0.4)
        lt.blit(sp, x - sp.w // 2, yb - sp.h + 1)
        lights.append((x, yb - int(hh * 0.6)))
    L.append(dict(name='lanterns', Z=30, frames=[night(lt).a], lights=lights))
    tr = torii(250)
    tc = Canvas(w, h + 100)
    yb = int(_ground_row(s, 18)) + 100
    tc.blit(tr, cx - tr.w // 2, yb - tr.h + 1)
    L.append(dict(name='torii', Z=18, frames=[night(tc).a], y=-100))
    fg = meadow.meadow(w, h, random.Random(75), [(-6, 30, 9, 1, 40), (0, 38, 10, 1, 50)], ['spider_lily'],
                       flower_rate=0.4, height=h, susuki_rate=0.3, fill=False)
    for f in fg:
        f.a[:, 160:600] = 0
    L.append(dict(name='fg', Z=6, frames=[night(f).a for f in fg], fps=8))
    s['layers'] = L
    s['debris'] = {k: [c.a for c in v_] for k, v_ in debris_sprites().items()}
    return s


def build_all(path):
    v = valley()
    sets = dict(valley=v, ridge=ridge_set(), lake=lake_set(v), shrine=shrine_set(v))
    for k, s in sets.items():
        s.pop('prof', None) if k != 'valley' else None
    with open(path, 'wb') as fh:
        pickle.dump(sets, fh, protocol=4)
    return sets


def load(path):
    if not os.path.exists(path):
        return build_all(path)
    with open(path, 'rb') as fh:
        return pickle.load(fh)
