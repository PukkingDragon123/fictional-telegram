"""Moss: soft cushions that sit on ledges, curtains that hang from beams,
patches that cling to damp walls, and creeping carpets along the floor.

Each clump is a mask shaded like a little pillow: lit top-left rim, mid
body with bumpy texture, darker bottom-right rim and a contact shadow on
whatever it grows on. Some cushions put up spore stalks with copper
capsules. Moss only grows on opaque pixels (never over the sky in a
window) unless told otherwise. Deterministic per rng."""
import math
import numpy as np
from pixel import step

LIT, MID, BODY, SHADE, DEEP = 'leaf3', 'leaf3', 'leaf2', 'leaf1', 'leaf0'
SPARK = 'leaf4'


def _sh(m, dy, dx):
    out = np.zeros_like(m)
    h, w = m.shape
    out[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)] = m[max(0, -dy):h - max(0, dy), max(0, -dx):w - max(0, dx)]
    return out


def _ellipses(rng, w, h, items):
    yy, xx = np.mgrid[0:h, 0:w]
    m = np.zeros((h, w), bool)
    for (cx, cy, rx, ry) in items:
        m |= ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2 <= 1
    return m


def _mask(rng, w, h, mode):
    """Local mask (h x w) and the row that touches the surface."""
    if mode == 'ledge':                       # cushions sitting on a ledge: baseline = last row
        items = []
        x = rng.uniform(0, 3)
        while x < w - 1:
            rx = rng.uniform(2.0, 4.5)
            items.append((x + rx * 0.7, h, rx, rng.uniform(h * 0.45, h)))
            x += rx * rng.uniform(0.9, 1.5)
        m = _ellipses(rng, w, h + 1, items)[:h]
        m[h - 1, 1:w - 1] = True              # thin carpet joining them
        return m
    if mode == 'hang':                        # hanging from a beam: anchor = first row
        items = []
        x = rng.uniform(0, 2)
        while x < w - 1:
            rx = rng.uniform(1.6, 3.6)
            items.append((x + rx * 0.7, 0, rx, rng.uniform(h * 0.3, h * 0.75)))
            x += rx * rng.uniform(0.9, 1.4)
        m = _ellipses(rng, w, h, items)
        m[0, 1:w - 1] = True
        for _ in range(max(1, w // 6)):        # strands
            sx = rng.randrange(1, w - 1)
            ln = rng.randint(h // 2, h - 1)
            m[:ln, sx] = True
        return m
    if mode == 'creep':                       # low carpet on a floor: flat and wide
        items = [(rng.uniform(0, w), rng.uniform(h * 0.3, h * 0.7), rng.uniform(2, 5), rng.uniform(0.8, h / 2))
                 for _ in range(max(2, w // 4))]
        return _ellipses(rng, w, h, items)
    # 'wall': an irregular clinging patch
    items = [(w / 2 + rng.uniform(-w / 3, w / 3), h / 2 + rng.uniform(-h / 3, h / 3),
              rng.uniform(1.5, max(2, w / 3.5)), rng.uniform(1.2, max(1.5, h / 3.5))) for _ in range(max(3, (w * h) // 30))]
    return _ellipses(rng, w, h, items)


def clump(cv, rng, x, y, w, h, mode='ledge', opaque_only=True, spores=0.25, shadow=True):
    """Grow one clump. (x, y): for 'ledge' the left end of the ledge line the
    cushions sit on; for 'hang' the left end of the beam edge they hang from;
    otherwise the top-left of the patch."""
    w, h = max(3, int(w)), max(2, int(h))
    m = _mask(rng, w, h, mode)
    if mode == 'ledge':
        ox, oy = x, y - h
    else:
        ox, oy = x, y
    H, W = cv.a.shape[:2]
    # clip to the canvas and (optionally) to what is already painted
    ys, xs = np.nonzero(m)
    gy, gx = ys + oy, xs + ox
    ok = (gy >= 0) & (gy < H) & (gx >= 0) & (gx < W)
    ys, xs, gy, gx = ys[ok], xs[ok], gy[ok], gx[ok]
    if opaque_only:
        if mode == 'ledge':                   # cushions may rise above the ledge, but must stand on it
            col_ok = {}
            for lx in set(xs.tolist()):
                X, Y = lx + ox, y
                col_ok[lx] = 0 <= X < W and 0 <= Y < H and cv.a[min(H - 1, Y), X, 3] == 255
            keep = np.array([col_ok[v] for v in xs.tolist()], bool) if len(xs) else np.zeros(0, bool)
        else:
            keep = cv.a[gy, gx, 3] == 255
        ys, xs, gy, gx = ys[keep], xs[keep], gy[keep], gx[keep]
    if not len(ys):
        return
    mm = np.zeros_like(m)
    mm[ys, xs] = True
    # contact shadow on the surface below / right
    if shadow:
        sh = (_sh(mm, 1, 1) | _sh(mm, 1, 0)) & ~mm
        for (yy, xx) in zip(*np.nonzero(sh)):
            Y, X = yy + oy, xx + ox
            if 0 <= Y < H and 0 <= X < W and cv.a[Y, X, 3] == 255:
                cv.a[Y, X, :3] = step(tuple(int(v) for v in cv.a[Y, X, :3]), -1)
    lit = mm & ~_sh(mm, 1, 1)                                  # nothing up-left: lit rim
    lit2 = mm & ~lit & ~_sh(mm, 2, 2) & ~_sh(mm, 2, 0)
    dark = mm & ~_sh(mm, -1, -1)                               # nothing down-right
    deep = mm & ~_sh(mm, -1, 0) & dark
    for (yy, xx) in zip(*np.nonzero(mm)):
        c = BODY
        r = rng.random()
        if deep[yy, xx]:
            c = DEEP if mode != 'hang' or r < 0.5 else SHADE
        elif dark[yy, xx]:
            c = SHADE
        elif lit[yy, xx]:
            c = SPARK if r < 0.18 else LIT
        elif lit2[yy, xx]:
            c = MID if r < 0.5 else BODY
        elif r < 0.1:
            c = MID                                            # bumpy texture
        elif r < 0.22:
            c = SHADE
        cv.px(xx + ox, yy + oy, c)
    if mode in ('wall', 'creep'):                             # loose specks round the edge
        ring_ = _sh(mm, 1, 0) | _sh(mm, -1, 0) | _sh(mm, 0, 1) | _sh(mm, 0, -1)
        ring_ = (ring_ | _sh(ring_, 1, 1)) & ~mm
        for (yy, xx) in zip(*np.nonzero(ring_)):
            Y, X = yy + oy, xx + ox
            if rng.random() < 0.22 and 0 <= Y < H and 0 <= X < W and cv.a[Y, X, 3] == 255:
                cv.px(X, Y, SHADE if rng.random() < 0.6 else BODY)
    if mode == 'ledge' and rng.random() < spores:            # spore stalks with capsules
        for _ in range(rng.randint(1, 3)):
            sx = rng.randrange(1, w - 1)
            col = np.nonzero(mm[:, sx])[0]
            if not len(col):
                continue
            top = col[0] + oy
            ln = rng.randint(2, 4)
            for k in range(1, ln + 1):
                cv.px(sx + ox, top - k, 'gold2' if k < ln else 'copper3')
            cv.px(sx + ox, top - ln - 1, 'copper2')


def along(cv, rng, x0, x1, y, mode='ledge', every=(30, 70), size=(6, 18), height=(2, 5), **kw):
    """Scatter clumps along a horizontal line."""
    x = x0 + rng.randint(0, every[0])
    while x < x1 - size[0]:
        w = rng.randint(*size)
        w = min(w, x1 - x)
        clump(cv, rng, x, y, w, rng.randint(*height), mode, **kw)
        x += w + rng.randint(*every)


def sprout_tops(cv, rng, n=3, size=(4, 9), height=(2, 3), y_max=None, region=None):
    """Grow a few cushions on the upward-facing edges of a sprite (rims, lids,
    ledges): opaque pixels with transparency above them."""
    a = cv.a[:, :, 3] == 255
    top = a & ~_sh(a, 1, 0)
    wide = top.copy()                                    # only ledges at least 7 px wide
    for d in range(1, 4):
        wide &= _sh(top, 0, d) & _sh(top, 0, -d)
    ys, xs = np.nonzero(wide)
    if region is not None:
        x0, y0, x1, y1 = region
        k = (xs >= x0) & (xs < x1) & (ys >= y0) & (ys < y1)
        ys, xs = ys[k], xs[k]
    if y_max is not None:
        k = ys < y_max
        ys, xs = ys[k], xs[k]
    if not len(ys):
        return cv
    for _ in range(n):
        i = rng.randrange(len(ys))
        clump(cv, rng, int(xs[i]) - 2, int(ys[i]) + 1, rng.randint(*size), rng.randint(*height), 'ledge',
              spores=0.15, shadow=False)
    return cv


def patches(cv, rng, region, n, size=(5, 14), mode='wall', where=None):
    """n clinging patches inside region (x0, y0, x1, y1); where(x, y) may veto a spot."""
    x0, y0, x1, y1 = region
    tries = 0
    while n > 0 and tries < n * 20:
        tries += 1
        w = rng.randint(*size)
        h = max(3, int(w * rng.uniform(0.5, 0.9)))
        x, y = rng.randint(x0, max(x0, x1 - w)), rng.randint(y0, max(y0, y1 - h))
        if where is not None and not where(x + w // 2, y + h // 2):
            continue
        clump(cv, rng, x, y, w, h, mode)
        n -= 1


def hang_curtain(cv, rng, x0, x1, y, depth=(4, 12), **kw):
    along(cv, rng, x0, x1, y, mode='hang', every=(12, 44), size=(8, 26), height=depth, **kw)


def ring(cv, rng, cx, cy, r, a0, a1, n, size=(5, 10)):
    """Patches hugging an arc (e.g. under a round window)."""
    for k in range(n):
        a = math.radians(a0 + (a1 - a0) * (k + rng.uniform(0.2, 0.8)) / n)
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r
        w = rng.randint(*size)
        clump(cv, rng, int(x - w / 2), int(y - 2), w, max(3, w // 2), 'wall')
