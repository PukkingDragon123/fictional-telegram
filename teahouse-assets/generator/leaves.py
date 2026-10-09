"""Foliage built from individual leaves.

The organic lobe field (noise-warped ellipses) decides the overall mass and
the light on it; then hundreds of small leaf stamps - pointed leaves, maple
stars, sakura blossoms or pine-needle fans - are laid dark-to-light so the
sunlit leaves sit on top of the shaded ones and the outermost leaves stick
out of the silhouette as spiky tips. One dark outline closes it."""
import math
import numpy as np
from pixel import Canvas, PAL, step

LIGHT_DIR = (-0.6, -0.8)
_STAMPS = {}


def value_noise(w, h, scale, rng):
    gw, gh = int(w / scale) + 3, int(h / scale) + 3
    g = np.array([[rng.random() for _ in range(gw)] for _ in range(gh)])
    ys, xs = np.mgrid[0:h, 0:w]
    xs = xs / scale
    ys = ys / scale
    x0, y0 = xs.astype(int), ys.astype(int)
    fx, fy = xs - x0, ys - y0
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = g[y0, x0] + (g[y0, x0 + 1] - g[y0, x0]) * sx
    b = g[y0 + 1, x0] + (g[y0 + 1, x0 + 1] - g[y0 + 1, x0]) * sx
    return a + (b - a) * sy


def leaf_stamp(angle, L, W):
    """Pointed leaf from its stem at (0, 0) towards `angle`.
    Cells: (dx, dy, side) with side +1 lit half, -1 shaded half, 0 midrib."""
    key = (round(angle, 3), L, W)
    if key in _STAMPS:
        return _STAMPS[key]
    ca, sa = math.cos(angle), math.sin(angle)
    px, py = -sa, ca
    lit_sign = 1 if (px * LIGHT_DIR[0] + py * LIGHT_DIR[1]) > 0 else -1
    out = []
    R = int(L) + 2
    for y in range(-R, R + 1):
        for x in range(-R, R + 1):
            a = x * ca + y * sa
            b = x * px + y * py
            if a < -0.3 or a > L + 0.2:
                continue
            t = max(0.0, a) / L
            half = W * (math.sin(math.pi * min(1.0, 0.12 + t * 0.95)) ** 1.1)
            if abs(b) > half + 0.2:
                continue
            if abs(b) < 0.45 and 0.15 < t < 0.8:
                side = 0
            else:
                side = 1 if b * lit_sign > 0 else -1
            out.append((x, y, side))
    _STAMPS[key] = out
    return out


def needle_stamp(angle, L):
    """Fan of four pine needles."""
    out = []
    for k, da in enumerate((-0.42, -0.14, 0.14, 0.42)):
        ln = L - abs(k - 1.5) * 0.8
        aa = angle + da
        for j in range(1, int(ln) + 1):
            side = 1 if j > ln * 0.6 else (0 if da < 0 else -1)
            out.append((int(round(math.cos(aa) * j)), int(round(math.sin(aa) * j)), side))
    return out


BLOSSOMS = [
    [(0, -1, 1), (-1, 0, 1), (0, 0, 2), (1, 0, -1), (0, 1, -1)],
    [(0, -2, 1), (-1, -1, 1), (1, -1, 1), (-2, 0, 1), (-1, 0, 1), (0, 0, 2), (1, 0, -1), (2, 0, -1),
     (-1, 1, -1), (0, 1, 0), (1, 1, -1), (-1, 2, -1), (1, 2, -1)],
]

_MAPLE_ART = [
    ['...L...',
     '.L.L.L.',
     'LLLLLLD',
     '.LLmLD.',
     'LLLmDDD',
     '...m...',
     '...m...'],
    ['..L.L..',
     'L.LLL.D',
     'LLLLLDD',
     '.LLmDD.',
     '..LmD..',
     '..m....',
     '.m.....'],
]


def maple_cells(i, flip):
    art = _MAPLE_ART[i]
    h, w = len(art), len(art[0])
    out = []
    for y, row in enumerate(art):
        for x, ch in enumerate(row):
            if ch == '.':
                continue
            side = {'L': 1, 'D': -1, 'm': 0}[ch]
            xx = (w - 1 - x) if flip else x
            out.append((xx - w // 2, y - h + 1, side))
    return out


def leafy(rng, lobes, ramp, kind='leaf', dark=0, flowers=None, density=1.0,
          leaf_len=(5, 8), droop=0.35):
    """Build a foliage mass from lobes [(cx, cy, rx, ry), ...] (local frame).
    Returns (canvas, ox, oy, mask): (ox, oy) = canvas pixel of local origin."""
    pad = 10
    x0 = int(min(l[0] - l[2] for l in lobes)) - pad
    x1 = int(max(l[0] + l[2] for l in lobes)) + pad
    y0 = int(min(l[1] - l[3] for l in lobes)) - pad
    y1 = int(max(l[1] + l[3] for l in lobes)) + pad
    w, h = x1 - x0, y1 - y0
    ys, xs = np.mgrid[0:h, 0:w]
    X, Y = xs + x0 + 0.5, ys + y0 + 0.5
    n_big = value_noise(w, h, 7.0, rng) - 0.5
    n_mid = value_noise(w, h, 3.5, rng) - 0.5
    FIELD = np.full((h, w), -9.0)
    V = np.zeros((h, w))
    DIR = np.zeros((h, w))
    order = sorted(range(len(lobes)), key=lambda i: lobes[i][1] + lobes[i][3] * 0.3)
    for i in order:
        cx, cy, rx, ry = lobes[i]
        U, Wv = (X - cx) / rx, (Y - cy) / ry
        field = 1 - U * U - Wv * Wv + 0.38 * n_big + 0.16 * n_mid
        g2 = np.clip(U * U + Wv * Wv, 0, 1)
        v = -0.62 * Wv - 0.3 * U + 0.35 * np.sqrt(1 - g2) + 0.16 * n_mid
        sel = field > -0.25
        FIELD = np.where(sel, np.maximum(field, FIELD), FIELD)
        V = np.where(sel, v, V)
        DIR = np.where(sel, np.arctan2(Wv * ry, U * rx), DIR)
    core = FIELD > 0.2
    bands = ramp[1:]
    nb = len(bands)
    cuts = [0.0, 0.2, 0.4, 0.66][:nb - 1]

    def band_of(v):
        i = 0
        while i < nb - 1 and v > cuts[i]:
            i += 1
        return max(0, i - dark)

    cv = Canvas(w, h)
    for yy, xx in zip(*np.nonzero(core)):
        cv.px(xx, yy, bands[max(0, band_of(V[yy, xx]) - 2)])
    leaves = []
    sp = 2.6 if kind == 'blossom' else 3.0
    gy = 0.0
    row = 0
    while gy < h:
        gx = (row * 1.37 * sp) % sp
        while gx < w:
            xx = int(gx + rng.uniform(-1, 1))
            yy = int(gy + rng.uniform(-1, 1))
            gx += sp / density
            if not (0 <= xx < w and 0 <= yy < h):
                continue
            f = FIELD[yy, xx]
            if f < -0.02:
                continue
            edge = f < 0.3
            v = V[yy, xx] + rng.uniform(-0.06, 0.06)
            out = DIR[yy, xx]
            if kind == 'needle':
                ang = -math.pi / 2 + math.cos(out) * 0.9 + rng.uniform(-0.3, 0.3)
                if math.sin(out) > 0.4:
                    ang = out + rng.uniform(-0.4, 0.4)
            else:
                ang = out + rng.uniform(-0.5, 0.5) if edge else rng.uniform(-math.pi, math.pi)
                ang = math.atan2(math.sin(ang) + droop, math.cos(ang))
            L = rng.uniform(*leaf_len) * (1.15 if edge else 1.0)
            leaves.append((v, xx, yy, ang, L, edge))
        gy += sp * 0.86
        row += 1
    leaves.sort(key=lambda l: l[0])
    for (v, xx, yy, ang, L, edge) in leaves:
        i = band_of(v)
        lit, shd = bands[i], bands[max(0, i - 1)]
        rib = bands[max(0, i - 1)] if i >= 2 else bands[i]
        if kind == 'blossom':
            cells = BLOSSOMS[1 if rng.random() < 0.55 else 0]
            for (dx, dy, sd) in cells:
                c = {1: lit, -1: shd, 0: shd, 2: 'gold3' if i >= 2 else bands[max(0, i - 2)]}[sd]
                cv.px(xx + dx, yy + dy, c)
            continue
        if kind == 'needle':
            cells = needle_stamp(ang, int(L))
            bx, by = xx, yy
        elif kind == 'maple':
            cells = maple_cells(rng.randrange(len(_MAPLE_ART)), rng.random() < 0.5)
            bx, by = xx, yy + 3
        else:
            step_a = math.pi / 12
            cells = leaf_stamp(round(ang / step_a) * step_a, int(round(L)), round(1.3 + L * 0.13, 1))
            bx = int(round(xx - math.cos(ang) * L * 0.35))
            by = int(round(yy - math.sin(ang) * L * 0.35))
        for (dx, dy, sd) in cells:
            cv.px(bx + dx, by + dy, lit if sd > 0 else (rib if sd == 0 else shd))
    if nb >= 5 and dark == 0 and kind in ('leaf', 'maple'):   # sunlit leaf glints
        for (v, xx, yy, ang, L, edge) in leaves[-max(1, len(leaves) // 12):]:
            if rng.random() < 0.6:
                cv.px(int(round(xx + math.cos(ang) * L * 0.2)), int(round(yy + math.sin(ang) * L * 0.2)),
                      bands[-1])
    if flowers:
        ys_, xs_ = np.nonzero(cv.a[:, :, 3])
        for _ in range(int(len(xs_) / 45)):
            k = rng.randrange(len(xs_))
            c = rng.choice(flowers)
            cv.px(xs_[k], ys_[k], c)
            cv.px(xs_[k] + 1, ys_[k], step(PAL[c], -1))
    mask = cv.a[:, :, 3] > 0
    cv.outline(ramp[0], selective=False)
    return cv, -x0, -y0, mask
