"""Realistic wood grain for pixel art.

A board is a flat cut through a log, so its grain is the log's growth
rings sliced by a plane. For every pixel we know how far along the board
it is (u, the grain direction) and where it is across the board (v). The
distance to the pith gives a ring phase; where the cut runs close to the
pith the rings open into the arches of flat-sawn ("cathedral") grain,
further out they run as near-straight lines. On top of that:

  - rings wobble, and the pith wanders along the board
  - knots: the rings swirl round them, and the knot shows its own rings
  - latewood is a dark 1 px line with a darker band after it
  - long sheen streaks and dark streaks, and scattered pores
  - every board has its own pith, depth and tone, so neighbours differ

levels() returns a tone offset per pixel (-3 .. +1) to add to a ramp index.
Everything is vectorised and deterministic per seed."""
import numpy as np
from pixel import PAL, RAMPS, LOOKUP


def _hash(ix, iy, seed):
    h = np.sin(ix * 127.1 + iy * 311.7 + seed * 74.7 + 0.5) * 43758.5453
    return h - np.floor(h)


def noise2(x, y, seed=0.0):
    ix, iy = np.floor(x), np.floor(y)
    fx, fy = x - ix, y - iy
    ux, uy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = _hash(ix, iy, seed)
    b = _hash(ix + 1, iy, seed)
    c = _hash(ix, iy + 1, seed)
    d = _hash(ix + 1, iy + 1, seed)
    return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uy


def levels(u, v, seed, width, ring=3.2, knots=True, contrast=1.0, pores=True):
    """u, v: 2D arrays (grain direction, across the board, in px). seed: number
    or array (one per board). width: board width in px (scalar or array)."""
    u = np.asarray(u, float)
    v = np.asarray(v, float)
    seed = np.asarray(seed, float) + np.zeros_like(u)
    width = np.asarray(width, float) + np.zeros_like(u)
    # where the pith is (across) and how deep below the surface, both drifting along the board
    v0 = width * (0.2 + 0.6 * noise2(u / 90.0, seed * 3.1, seed))
    d = 1.0 + 9.0 * noise2(u / 120.0, seed * 1.7 + 5.0, seed + 1.0) ** 1.5
    r = np.sqrt((v - v0) ** 2 + d * d)
    r += (noise2(u / 28.0, v / 5.0, seed + 9.0) - 0.5) * ring * 1.1           # ring wobble
    knot_core = np.zeros(u.shape, bool)
    knot_ring = np.zeros(u.shape, bool)
    if knots:
        period = 150.0
        ku = np.floor(u / period)
        has = _hash(ku, seed, 3.0) < 0.38
        uk = (ku + 0.2 + 0.6 * _hash(ku, seed, 4.0)) * period
        vk = width * (0.2 + 0.6 * _hash(ku, seed, 5.0))
        sk = 1.4 + 2.4 * _hash(ku, seed, 6.0)
        dist = np.sqrt(((u - uk) / (sk * 1.7)) ** 2 + ((v - vk) / sk) ** 2)
        r += np.where(has, np.exp(-0.5 * (dist / 1.6) ** 2) * ring * 2.4, 0)      # rings swirl round the knot
        knot_core = has & (dist < 1.0)
        knot_ring = has & (dist >= 1.0) & (dist < 1.35)
    phase = r / ring
    fl = np.floor(phase)
    line = np.zeros(u.shape, bool)
    line[1:, :] |= fl[1:, :] != fl[:-1, :]
    line[:, 1:] |= fl[:, 1:] != fl[:, :-1]
    fr = phase - fl
    out = np.zeros(u.shape, int)
    out[fr < 0.32] = -1                                                      # latewood band
    st = noise2(u / 55.0, v / 2.2, seed + 21.0)
    out[(st > 0.72) & (out == 0)] = 1                                        # sheen streaks
    out[(st < 0.12)] = np.minimum(out[(st < 0.12)], -1)                      # dark streaks
    out[line] = -2
    if pores:
        pz = _hash(np.floor(u / 2.0), np.floor(v), seed + 33.0) > 0.965
        out[pz & (out > -2)] -= 1
    out[knot_ring] = -3
    out[knot_core] = np.where(_hash(np.floor(u[knot_core]), np.floor(v[knot_core]), 7.0) > 0.5, -2, -1)
    if contrast != 1.0:
        out = np.round(out * contrast).astype(int)
    return out


def ramp_of(name_or_rgb):
    if isinstance(name_or_rgb, str):
        rgb = PAL[name_or_rgb]
    else:
        rgb = tuple(int(c) for c in name_or_rgb[:3])
    return LOOKUP.get(rgb, (None, None))


def paint(cv, x, y, lv, ramp, base, mask=None):
    """Write levels lv (h x w) onto cv at (x, y) using ramp[base + level]."""
    cols = RAMPS[ramp]
    h, w = lv.shape
    H, W = cv.a.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0:
        return
    sub = lv[y0 - y:y1 - y, x0 - x:x1 - x]
    idx = np.clip(base + sub, 0, len(cols) - 1)
    pal = np.array(cols, np.uint8)
    rgb = pal[idx]
    if mask is None:
        cv.a[y0:y1, x0:x1, :3] = rgb
        cv.a[y0:y1, x0:x1, 3] = 255
    else:
        m = mask[y0 - y:y1 - y, x0 - x:x1 - x]
        reg = cv.a[y0:y1, x0:x1]
        reg[m, :3] = rgb[m]
        reg[m, 3] = 255


def board(cv, x, y, w, h, ramp, base, seed, along='h', ring=3.2, knots=True, contrast=1.0):
    """One board filling the rectangle, grain running along 'h' or 'v'."""
    if w <= 0 or h <= 0:
        return
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    if along == 'h':
        lv = levels(xx + seed * 37.0, yy, seed, h, ring, knots and w > 20, contrast)
    else:
        lv = levels(yy + seed * 37.0, xx, seed, w, ring, knots and h > 20, contrast)
    paint(cv, x, y, lv, ramp, base)


def boards(cv, x, y, w, h, ramp, base, seed, along='h', size=12, ring=3.2, seams=True, contrast=1.0, vary=True):
    """A run of boards with seams; each board gets its own grain and tone."""
    rng = np.random.RandomState(int(seed * 1000) % (2 ** 31))
    pos = 0
    total = h if along == 'h' else w
    k = 0
    while pos < total:
        s = min(total - pos, size + (rng.randint(-2, 3) if vary else 0))
        b = base + (rng.choice((0, 0, 0, -1, 1)) if vary else 0)
        if along == 'h':
            board(cv, x, y + pos, w, s, ramp, b, seed + k * 1.37, 'h', ring, True, contrast)
            if seams and pos > 0:
                cv.hline(x, x + w - 1, y + pos, RAMPS[ramp][max(0, base - 2)])
        else:
            board(cv, x + pos, y, s, h, ramp, b, seed + k * 1.37, 'v', ring, True, contrast)
            if seams and pos > 0:
                cv.vline(x + pos, y, y + h - 1, RAMPS[ramp][max(0, base - 2)])
        pos += s
        k += 1


def apply_levels(rgb, mask, q, ramps=('wood', 'hinoki'), keep_dark=True, lo_cap=None):
    """Shift each masked pixel of an RGB array along its own ramp by q (int array).
    Pixels in other ramps are left alone; with keep_dark the darkest tone of a
    ramp (seams, outlines) stays put and nothing is pushed down into it."""
    if not mask.any():
        return
    cols = rgb[mask]
    qq = q[mask]
    uniq, inv = np.unique(cols.reshape(-1, 3), axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    newc = cols.copy()
    for ui, c in enumerate(uniq):
        r = LOOKUP.get(tuple(int(v) for v in c))
        if not r or r[0] not in ramps:
            continue
        ramp, i = r
        if keep_dark and i == 0:
            continue
        sel = inv == ui
        n = len(RAMPS[ramp])
        lo = 1 if keep_dark else 0
        if lo_cap is not None:
            lo = max(lo, i - lo_cap)
        ni = np.clip(i + qq[sel], lo, n - 1)
        newc[sel] = np.array(RAMPS[ramp], np.uint8)[ni]
    rgb[mask] = newc


def grain_pass(cv, x0, y0, x1, y1, along='h', seed=0.0, board=12, contrast=1.0, ramps=('wood', 'hinoki'),
               ring=3.2, keep_dark=True, knots=True, lo_cap=None):
    """Re-shade the wooden pixels of a rectangle of cv with grain running along
    'h' or 'v'; the rectangle is split into boards 'board' px wide."""
    H, W = cv.a.shape[:2]
    x0, y0, x1, y1 = max(0, int(x0)), max(0, int(y0)), min(W, int(x1)), min(H, int(y1))
    if x1 <= x0 or y1 <= y0:
        return
    reg = cv.a[y0:y1, x0:x1]
    h, w = reg.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    if along == 'h':
        u, v = xx + x0, yy
    else:
        u, v = yy + y0, xx
    bid = np.floor(v / board)
    vin = v - bid * board
    lv = levels(u + bid * 53.0, vin, seed + bid * 1.37, board, ring, knots)
    q = np.round(lv * contrast).astype(int)
    rgb = reg[..., :3]
    apply_levels(rgb, reg[..., 3] == 255, q, ramps, keep_dark, lo_cap)
