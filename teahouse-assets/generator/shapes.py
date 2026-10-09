"""Shared drawing recipes: lit puffs (clouds, foliage), wood, peeling paint,
cracks, cobwebs, torn paper. All results snap to the palette."""
import math
import numpy as np
from pixel import Canvas, PAL, RAMPS, col, step, blob_mask, jag, scribble


def _rgb(c):
    return PAL[c] if isinstance(c, str) else tuple(c[:3])

BAYER = [[0, 2], [3, 1]]


def shade_puffs(cv, circles, ramp, light=(-0.45, -0.75, 0.5), cuts=None,
                clip_bottom=None, dither=0.06, bottom_dark=0.0, rim=True):
    """Fill a union of circles (cx, cy, r) and light each puff like a ball.
    `ramp` is a list of palette names dark -> light. Produces the clustered
    banded shading you see in hand-pixelled clouds and tree canopies."""
    L = np.array(light, float)
    L /= np.linalg.norm(L)
    n = len(ramp)
    if cuts is None:
        cuts = [(-0.2 + 1.1 * (i + 1) / n) for i in range(n - 1)]
    x0 = int(min(c[0] - c[2] for c in circles)) - 1
    x1 = int(max(c[0] + c[2] for c in circles)) + 2
    y0 = int(min(c[1] - c[2] for c in circles)) - 1
    y1 = int(max(c[1] + c[2] for c in circles)) + 2
    if clip_bottom is not None:
        y1 = min(y1, clip_bottom)
    mask = {}
    for y in range(y0, y1):
        for x in range(x0, x1):
            best = None
            for (cx, cy, r) in circles:
                dx = (x + 0.5 - cx) / r
                dy = (y + 0.5 - cy) / r
                d2 = dx * dx + dy * dy
                if d2 <= 1:
                    nz = math.sqrt(1 - d2)
                    v = dx * L[0] + dy * L[1] + nz * L[2]
                    if best is None or v > best:
                        best = v
            if best is not None:
                if bottom_dark and clip_bottom is not None:
                    best -= bottom_dark * max(0, (y - (clip_bottom - 6)) / 6)
                mask[(x, y)] = best
    for (x, y), v in mask.items():
        v += (BAYER[y % 2][x % 2] - 1.5) * dither
        i = 0
        while i < n - 1 and v > cuts[i]:
            i += 1
        cv.px(x, y, ramp[i])
    if rim:
        # bright rim on the top-left silhouette edge
        for (x, y) in mask:
            if (x, y - 1) not in mask and (x - 1, y) in mask and mask[(x, y)] > cuts[-1] - 0.25:
                cv.px(x, y, ramp[-1])
    return mask


def wood_grain_v(cv, x, y, w, h, base, rng, dark=None, light=None, knots=True):
    """Vertical plank grain: long broken lines, an occasional knot."""
    dark = dark or step(_rgb(base), -1)
    light = light or step(_rgb(base), 1)
    cv.rect(x, y, w, h, base)
    lines = max(1, w // 4)
    for _ in range(lines):
        gx = x + rng.randint(1, max(1, w - 2))
        yy = y + rng.randint(0, 6)
        while yy < y + h:
            seg = rng.randint(6, 26)
            for k in range(seg):
                if yy + k < y + h:
                    cv.px(gx, yy + k, dark)
            yy += seg + rng.randint(3, 14)
            if rng.random() < 0.3:
                gx = min(x + w - 2, max(x + 1, gx + rng.choice((-1, 1))))
    if knots and h > 20 and rng.random() < 0.5:
        kx = x + rng.randint(2, max(2, w - 4))
        ky = y + rng.randint(4, h - 6)
        cv.px(kx, ky, dark)
        cv.px(kx + 1, ky, dark)
        cv.px(kx, ky + 1, step(_rgb(base), -2))
        cv.px(kx + 1, ky + 1, dark)
        cv.px(kx, ky - 1, light)


def wood_grain_h(cv, x, y, w, h, base, rng, dark=None, light=None, knots=True):
    dark = dark or step(_rgb(base), -1)
    light = light or step(_rgb(base), 1)
    cv.rect(x, y, w, h, base)
    for _ in range(max(1, h // 3)):
        gy = y + rng.randint(0, max(0, h - 1))
        xx = x + rng.randint(0, 8)
        while xx < x + w:
            seg = rng.randint(8, 34)
            for k in range(seg):
                if xx + k < x + w:
                    cv.px(xx + k, gy, dark)
            xx += seg + rng.randint(4, 18)
            if rng.random() < 0.25:
                gy = min(y + h - 1, max(y, gy + rng.choice((-1, 1))))
    if knots and w > 24 and h >= 4 and rng.random() < 0.6:
        kx = x + rng.randint(3, w - 5)
        ky = y + rng.randint(1, max(1, h - 2))
        cv.px(kx, ky, step(_rgb(base), -2))
        cv.px(kx + 1, ky, dark)
        cv.px(kx - 1, ky, dark)
        cv.px(kx, ky - 1, light)


def peel(cv, x, y, w, h, rng, under='wood1', curl=None, shadow=None, n=6, rmin=1.5, rmax=4):
    """Peeled paint patch: clustered hole showing the wood underneath, with a
    lit curl on the upper/left edge and a shadow lip on the lower/right."""
    m = blob_mask(rng, w, h, n=n, rmin=rmin, rmax=rmax)
    hh, ww = m.shape
    for yy in range(hh):
        for xx in range(ww):
            if m[yy, xx]:
                cv.px(x + xx, y + yy, under)
    for yy in range(hh):
        for xx in range(ww):
            if m[yy, xx]:
                continue
            up = yy + 1 < hh and m[yy + 1, xx]
            lf = xx + 1 < ww and m[yy, xx + 1]
            dn = yy - 1 >= 0 and m[yy - 1, xx]
            rt = xx - 1 >= 0 and m[yy, xx - 1]
            p = cv.get(x + xx, y + yy)
            if p[3] == 0:
                continue
            if (up or lf) and curl is not None:
                cv.px(x + xx, y + yy, curl)
            elif (up or lf):
                cv.px(x + xx, y + yy, step(p[:3], 1))
            elif (dn or rt):
                cv.px(x + xx, y + yy, shadow or step(p[:3], -1))
    return m


def crack(cv, rng, x, y, length, c, hi=None, dirx=0.3, diry=1.0, branch=0.15):
    """Hairline crack (random walk) with a 1px highlight under it."""
    pts = []
    fx, fy = float(x), float(y)
    for i in range(length):
        pts.append((int(fx), int(fy)))
        fx += dirx + rng.uniform(-0.8, 0.8)
        fy += diry * rng.uniform(0.4, 1.0)
        if branch and rng.random() < branch and length - i > 4:
            crack(cv, rng, fx, fy, (length - i) // 2, c, hi, -dirx + rng.uniform(-0.5, 0.5), diry, 0)
    s = set(pts)
    for (px_, py_) in pts:
        cv.px(px_, py_, c)
    if hi:
        for (px_, py_) in pts:
            if (px_ + 1, py_) not in s and cv.opaque(px_ + 1, py_):
                cv.px(px_ + 1, py_, hi)


def cobweb(cv, x, y, size, c='stone3', c2='stone2', corner='tl'):
    """Corner cobweb: radial threads + sagging arcs."""
    sx = 1 if corner in ('tl', 'bl') else -1
    sy = 1 if corner in ('tl', 'tr') else -1
    angles = [0.05, 0.4, 0.8, 1.2, 1.5]
    for a in angles:
        ex = x + sx * math.cos(a) * size
        ey = y + sy * math.sin(a) * size
        cv.line(x, y, ex, ey, c2)
    for r in range(4, size, max(3, size // 4)):
        prev = None
        for i in range(0, 21):
            a = 0.05 + 1.45 * i / 20
            rr = r - 1.2 * math.sin(a * 2.2) if i % 5 else r
            px_ = x + sx * math.cos(a) * rr
            py_ = y + sy * math.sin(a) * rr
            if prev:
                cv.line(prev[0], prev[1], px_, py_, c)
            prev = (px_, py_)


def torn_paper(rng, w, h, base='paper3', light='paper4', dark='paper2',
               edge='paper1', lines=True, stain=True, curl=True, burnt=False,
               holes=True, fold=True, age=0.72):
    """Worn paper scrap: jagged torn edges, a curled corner, coffee/tea
    stains and handwriting. Returns a Canvas sized (w, h)."""
    cv = Canvas(w, h)
    top = jag(rng, w, 1)
    bot = jag(rng, w, 1)
    lef = jag(rng, h, 1)
    rig = jag(rng, h, 1)
    for y in range(h):
        for x in range(w):
            if y < 1 + top[x] or y > h - 2 + bot[x]:
                continue
            if x < 1 + lef[y] or x > w - 2 + rig[y]:
                continue
            cv.px(x, y, base)
    # a torn bite out of one edge
    if rng.random() < 0.7:
        side = rng.choice(('t', 'b', 'r'))
        bw = rng.randint(3, max(4, w // 3))
        bx = rng.randint(1, max(1, w - bw - 1))
        by = rng.randint(1, max(1, h - bw - 1))
        for i in range(bw):
            depth = int(math.sin(math.pi * i / bw) * rng.uniform(2, 4))
            for d in range(depth):
                if side == 't':
                    cv.px(bx + i, d, None)
                elif side == 'b':
                    cv.px(bx + i, h - 1 - d, None)
                else:
                    cv.px(w - 1 - d, by + i, None)
    # aged gradient: darker toward the bottom, sun-bleached top
    for y in range(h):
        for x in range(w):
            if cv.opaque(x, y) and y > h * age and (x + y) % 2 == 0:
                cv.px(x, y, dark)
    # folds
    if fold and h > 14 and rng.random() < 0.6:
        fy = rng.randint(h // 3, 2 * h // 3)
        for x in range(w):
            if cv.opaque(x, fy):
                cv.px(x, fy, dark)
            if cv.opaque(x, fy - 1):
                cv.px(x, fy - 1, light)
    if lines:
        ly = 4
        while ly < h - 4:
            scribble(cv, rng, 3, ly, w - 6, 'wood1' if rng.random() < 0.8 else 'red1')
            ly += rng.choice((3, 3, 4))
        # erase scribbles that fell into torn-out holes
    if stain:
        sx = rng.randint(2, max(2, w - 8))
        sy = rng.randint(2, max(2, h - 8))
        r = rng.randint(2, 4)
        for a in range(0, 360, 12):
            px_ = sx + r + int(round(math.cos(math.radians(a)) * r))
            py_ = sy + r + int(round(math.sin(math.radians(a)) * r * 0.8))
            if cv.opaque(px_, py_) and rng.random() < 0.8:
                cv.px(px_, py_, edge)
    # dark outline pass on the edge (paper fibres)
    m = cv.a[:, :, 3] > 0
    for y in range(h):
        for x in range(w):
            if not m[y, x]:
                continue
            if y + 1 >= h or not m[y + 1, x] or x + 1 >= w or not m[y, x + 1]:
                cv.px(x, y, edge)
            elif y == 0 or not m[y - 1, x] or x == 0 or not m[y, x - 1]:
                cv.px(x, y, light)
    if curl:
        # curled bottom-right corner showing the back of the sheet
        cs = rng.randint(3, 5)
        for i in range(cs):
            for j in range(cs - i):
                cv.px(w - 1 - j, h - 1 - i, None)
        for i in range(cs):
            for j in range(i + 1):
                x_, y_ = w - cs + j - 1, h - 1 - i + j - 1
                if 0 <= x_ < w and 0 <= y_ < h:
                    cv.px(x_, y_, dark if j < i else edge)
    if burnt:
        for x in range(w):
            for y in range(h - 4, h):
                if cv.opaque(x, y) and rng.random() < 0.5:
                    cv.px(x, y, 'wood1')
    if holes and rng.random() < 0.4:
        hx, hy = rng.randint(3, w - 4), rng.randint(3, h - 4)
        cv.px(hx, hy, None)
        cv.px(hx + 1, hy, edge)
        cv.px(hx, hy + 1, edge)
    return cv


def pin(cv, x, y, c='red3'):
    """Push-pin head with highlight and shadow."""
    cv.px(x, y, c)
    cv.px(x + 1, y, step(PAL[c], -1))
    cv.px(x, y + 1, step(PAL[c], -1))
    cv.px(x + 1, y + 1, step(PAL[c], -2))
    cv.px(x - 1, y, step(PAL[c], 1))


def vine(cv, rng, path, leaf=('leaf1', 'leaf2', 'leaf3', 'leaf4'), stem='leaf1',
         flowers=None, density=0.45, flower_rate=0.12):
    """Creeping vine along a list of points with alternating leaves and the
    odd flower. flowers: list of (petal, centre) palette names."""
    pts = []
    for i in range(len(path) - 1):
        x0, y0 = path[i]
        x1, y1 = path[i + 1]
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for k in range(n):
            t = k / max(1, n - 1)
            pts.append((int(round(x0 + (x1 - x0) * t)), int(round(y0 + (y1 - y0) * t))))
    for (x, y) in pts:
        cv.px(x, y, stem)
    side = 1
    for idx in range(0, len(pts), 3):
        if rng.random() > density:
            continue
        x, y = pts[idx]
        side = -side
        if flowers and rng.random() < flower_rate:
            petal, centre = rng.choice(flowers)
            flower(cv, x + side, y + rng.choice((-1, 1)), petal, centre)
            continue
        small_leaf(cv, rng, x, y, side, leaf)


def small_leaf(cv, rng, x, y, side, leaf=('leaf1', 'leaf2', 'leaf3', 'leaf4')):
    big = rng.random() < 0.5
    if big:
        cv.px(x + side, y, leaf[2])
        cv.px(x + 2 * side, y, leaf[2])
        cv.px(x + side, y - 1, leaf[3])
        cv.px(x + 2 * side, y + 1, leaf[1])
        cv.px(x + 3 * side, y, leaf[1])
        cv.px(x + 2 * side, y - 1, leaf[3])
    else:
        cv.px(x + side, y, leaf[2])
        cv.px(x + side, y - 1, leaf[3])
        cv.px(x + 2 * side, y, leaf[1])


def flower(cv, x, y, petal='pink3', centre='gold3', size=1):
    p_dark = step(PAL[petal], -1)
    if size == 1:
        cv.px(x, y - 1, petal)
        cv.px(x - 1, y, petal)
        cv.px(x + 1, y, p_dark)
        cv.px(x, y + 1, p_dark)
        cv.px(x, y, centre)
    else:
        for dx, dy in ((0, -2), (-1, -2), (-2, 0), (-2, -1), (2, 0), (2, 1), (0, 2), (1, 2),
                       (-1, -1), (1, -1), (-1, 1), (1, 1), (0, -1), (-1, 0), (1, 0), (0, 1)):
            cv.px(x + dx, y + dy, petal if dy <= 0 and dx <= 0 else p_dark)
        cv.px(x, y, centre)
        cv.px(x + 1, y - 2, petal)
        cv.px(x - 2, y + 1, p_dark)


def canopy(cv, rng, cx, cy, rx, ry, ramp, n=None, rmin=3.0, rmax=5.5, gw=0.62,
           light=(-0.5, -0.75, 0.45), cuts=None, holes=0.0, hole_c=None):
    """Tree canopy: bumpy silhouette from many small clumps, lit as one big
    ellipsoid (global) mixed with each clump's own roundness (local)."""
    L = np.array(light, float)
    L /= np.linalg.norm(L)
    if n is None:
        n = int(rx * ry / 9) + 6
    clumps = []
    for _ in range(n):
        a = rng.uniform(0, 2 * math.pi)
        rr = rng.uniform(0, 1) ** 0.55
        r = rng.uniform(rmin, rmax)
        clumps.append((cx + math.cos(a) * rr * (rx - r * 0.6), cy + math.sin(a) * rr * (ry - r * 0.6), r))
    k = len(ramp)
    if cuts is None:
        cuts = [(-0.35 + 1.15 * (i + 1) / k) for i in range(k - 1)]
    pts = {}
    for (x0, y0, r) in clumps:
        for y in range(int(y0 - r) - 1, int(y0 + r) + 2):
            for x in range(int(x0 - r) - 1, int(x0 + r) + 2):
                dx, dy = (x + 0.5 - x0) / r, (y + 0.5 - y0) / r
                d2 = dx * dx + dy * dy
                if d2 > 1:
                    continue
                loc = dx * L[0] + dy * L[1] + math.sqrt(1 - d2) * L[2]
                gx, gy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
                g2 = min(1.0, gx * gx + gy * gy)
                glob = gx * L[0] + gy * L[1] + math.sqrt(1 - g2) * L[2]
                v = gw * glob + (1 - gw) * loc
                if (x, y) not in pts or v > pts[(x, y)]:
                    pts[(x, y)] = v
    for (x, y), v in pts.items():
        v += (BAYER[y % 2][x % 2] - 1.5) * 0.05
        i = 0
        while i < k - 1 and v > cuts[i]:
            i += 1
        cv.px(x, y, ramp[i])
    if holes and hole_c:
        for (x, y), v in pts.items():
            if v < cuts[0] - 0.05 and rng.random() < holes:
                cv.px(x, y, hole_c)
    return pts


def chip(cv, x, y, w, h, rng, under='wood3', under_dark='wood1', lit=None, n=4,
         rmin=1.0, rmax=2.6, elong=2.2):
    """Chipped paint flake (v2): the hole shows bare wood with the paint's
    shadow along its upper-left lip, and the paint's lit thickness along the
    lower-right lip. Flakes are stretched along the grain."""
    m = np.zeros((h, w), bool)
    yy, xx = np.mgrid[0:h, 0:w]
    for _ in range(n):
        r = rng.uniform(rmin, rmax)
        cx = rng.uniform(w * 0.25, w * 0.75)
        cy = rng.uniform(h * 0.2, h * 0.8)
        m |= ((xx + 0.5 - cx) / r) ** 2 + ((yy + 0.5 - cy) / (r * elong)) ** 2 <= 1
    # ragged: nibble a few edge pixels
    for _ in range(int(m.sum() * 0.08)):
        ys, xs = np.nonzero(m)
        if len(xs) == 0:
            break
        i = rng.randrange(len(xs))
        m[ys[i], xs[i]] = False
    for j in range(h):
        for i in range(w):
            if not m[j, i]:
                continue
            up = j == 0 or not m[j - 1, i]
            lf = i == 0 or not m[j, i - 1]
            cv.px(x + i, y + j, under_dark if (up or lf) else under)
            if not up and not lf and (i + j * 3) % 7 == 0:
                cv.px(x + i, y + j, under_dark)
    for j in range(h):
        for i in range(w):
            if m[j, i]:
                continue
            if (j > 0 and m[j - 1, i]) or (i > 0 and m[j, i - 1]):
                p = cv.get(x + i, y + j)
                if p[3]:
                    cv.px(x + i, y + j, lit or step(p[:3], 1))
    return m
