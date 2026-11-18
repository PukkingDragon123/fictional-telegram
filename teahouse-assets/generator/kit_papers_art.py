"""The hand-drawn faces of the traveller's papers (kit_papers.py lays them
onto 3D sheets): the world map, the train ticket, the ferry pass and the
postcard, front and back, and the four states each one can be in (clean,
worn, dirty, repaired).

Everything is drawn at 1:1 in the pack's palette plus a few pap_ ramps
registered below. Writing is always the pack's rune script."""
import math
import random
import numpy as np
from scipy import ndimage
import pixel
from pixel import Canvas, PAL, RAMPS, LOOKUP, step, text, text_width, RUNES
import kit_papers_render as KR

# ---------------------------------------------------------------- colours (dark -> light, hue-shifted)
KR.add_ramps({
    # washi / parchment: plum-brown shadows, butter-yellow lights
    'pap_parch': [(62, 38, 40), (100, 64, 52), (142, 98, 70), (182, 138, 94), (210, 172, 120), (230, 202, 152),
                  (244, 226, 184)],
    # iron-gall / sepia ink, heavy -> thin
    'pap_ink': [(46, 28, 36), (78, 46, 46), (116, 76, 62)],
    # watercolour washes on the map
    'pap_sea': [(62, 94, 108), (90, 126, 128), (128, 158, 146), (170, 188, 160)],
    'pap_moss': [(44, 64, 50), (68, 94, 58), (106, 128, 70), (148, 158, 92)],
    # the train ticket: salmon-buff Edmondson card, blue-black printing, violet dating ink
    'pap_card': [(112, 62, 62), (160, 98, 84), (204, 140, 112), (230, 178, 142), (246, 210, 176)],
    'pap_tink': [(30, 30, 52), (50, 52, 82), (80, 84, 114)],
    'pap_violet': [(70, 46, 100), (102, 72, 134), (140, 110, 166)],
    # the ferry pass: sea-glass card, brass eyelet, jute string, vermilion seal ink
    'pap_aqua': [(42, 82, 98), (68, 122, 134), (108, 164, 164), (158, 202, 190), (206, 230, 214)],
    'pap_jute': [(104, 74, 52), (150, 114, 76), (196, 160, 110), (228, 204, 150)],
    'pap_seal': [(140, 26, 38), (192, 42, 46), (228, 82, 66)],
    # the postcard: a dusk sky, the volcano, snow, the lake, black pines, card white
    'pap_dusk': [(40, 34, 74), (70, 48, 102), (112, 62, 120), (168, 82, 124), (216, 112, 112), (242, 156, 104),
                 (252, 206, 128)],
    'pap_mtn': [(32, 28, 60), (52, 44, 86), (80, 62, 110), (120, 84, 130), (168, 110, 138)],
    'pap_snow': [(148, 138, 184), (204, 186, 212), (250, 226, 220)],
    'pap_lake': [(24, 28, 58), (42, 44, 86), (64, 58, 104), (100, 76, 122)],
    'pap_pine': [(16, 22, 32), (26, 38, 44), (40, 58, 54), (66, 82, 62)],
    'pap_cream': [(152, 140, 132), (198, 186, 170), (232, 224, 206), (248, 244, 230)],
    'pap_pmark': [(56, 52, 70), (90, 86, 104)],
    # damage
    'pap_fox': [(128, 72, 48), (164, 102, 64), (196, 140, 90)],
    'pap_mud': [(70, 50, 40), (100, 74, 54), (134, 104, 74)],
    'pap_tape': [(196, 182, 128), (226, 216, 164), (246, 240, 206)],
    'pap_thread': [(44, 40, 78), (70, 66, 116), (110, 106, 156)],
})

VARIANTS = ('clean', 'worn', 'dirty', 'repaired')


def P(name):
    return PAL[name]


# ---------------------------------------------------------------- small helpers
class Tex:
    """A face being drawn: an RGBA Canvas plus bookkeeping masks."""

    def __init__(self, w, h, base):
        self.cv = Canvas(w, h, base)
        self.w, self.h = w, h
        self.ink = np.zeros((h, w), bool)        # printed / inked pixels (fade, smear)

    @property
    def a(self):
        return self.cv.a

    def px(self, x, y, c, ink=False):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h and self.cv.a[y, x, 3]:
            self.cv.px(x, y, c)
            if ink:
                self.ink[y, x] = True

    def text(self, x, y, s, c, rng=None, wobble=False):
        tmp = Canvas(self.w, self.h)
        text(tmp, x, y, s, c, rng, wobble)
        m = tmp.a[..., 3] > 0
        m &= self.cv.a[..., 3] > 0
        self.cv.a[m] = tmp.a[m]
        self.ink |= m
        return m

    def line(self, x0, y0, x1, y1, c, ink=True):
        for (x, y) in bres(x0, y0, x1, y1):
            self.px(x, y, c, ink)


def bres(x0, y0, x1, y1):
    x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    out = []
    while True:
        out.append((x0, y0))
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy
    return out


def vnoise(w, h, scale, seed, octaves=2):
    """Smooth value noise in 0..1 (clusters, not speckle)."""
    rs = np.random.RandomState(seed)
    out = np.zeros((h, w))
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        s = scale / (2 ** o)
        gw, gh = int(w / s) + 3, int(h / s) + 3
        grid = rs.rand(gh, gw)
        yy, xx = np.mgrid[0:h, 0:w] / s
        x0, y0 = np.floor(xx).astype(int), np.floor(yy).astype(int)
        fx, fy = xx - x0, yy - y0
        fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
        a = grid[y0, x0] * (1 - fx) + grid[y0, x0 + 1] * fx
        b = grid[y0 + 1, x0] * (1 - fx) + grid[y0 + 1, x0 + 1] * fx
        out += amp * (a * (1 - fy) + b * fy)
        tot += amp
        amp *= 0.5
    return out / tot


def edge_dist(alpha):
    """Distance (px, chessboard-ish) of each opaque pixel from the edge."""
    return ndimage.distance_transform_cdt(np.pad(alpha, 1), metric='taxicab')[1:-1, 1:-1]


def shift(t, mask, k):
    rgb = t.a[..., :3].copy()
    KR.ramp_shift(rgb, mask & (t.a[..., 3] > 0), k)
    t.a[..., :3] = rgb


def clean_mask(m, passes=2):
    """No lone pixels on a mask's edge: drop spurs, fill pits."""
    m = m.copy()
    for _ in range(passes):
        p = np.pad(m, 1)
        n4 = p[:-2, 1:-1].astype(int) + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:]
        m = np.where(m & (n4 <= 1), False, m)
        m = np.where(~m & (n4 >= 3), True, m)
    return m


def spline(pts, n=200):
    """Catmull-Rom through pts -> dense list of (x, y)."""
    pts = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = [np.array(p, float) for p in pts[i - 1:i + 3]]
        for k in range(n // (len(pts) - 3)):
            t = k / (n // (len(pts) - 3))
            t2, t3 = t * t, t * t * t
            q = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append(q)
    out.append(np.array(pts[-2], float))
    return np.array(out)


def resample(path, spacing):
    """Points every `spacing` px along a polyline."""
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(path, axis=0).T))]
    s = np.arange(0, d[-1] + 1e-6, spacing)
    return np.stack([np.interp(s, d, path[:, 0]), np.interp(s, d, path[:, 1])], 1), d[-1]


def poly_mask(w, h, pts):
    cv = Canvas(w, h)
    cv.poly(pts, (255, 255, 255))
    return cv.a[..., 3] > 0


def ellipse_mask(w, h, cx, cy, rx, ry):
    yy, xx = np.mgrid[0:h, 0:w]
    return ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2 <= 1


# ---------------------------------------------------------------- shared paper treatments
def crease(t, pts, light_side=(-1, 0), strength=1, wobble_seed=0):
    """A fold line through pts: a dark valley pixel with a lit ridge beside it,
    stepped along each pixel's own ramp so ink and paint fold with the paper."""
    rng = random.Random(wobble_seed)
    path = []
    for i in range(len(pts) - 1):
        seg = bres(*pts[i], *pts[i + 1])
        path += seg if not path else seg[1:]
    dark = np.zeros((t.h, t.w), bool)
    lit = np.zeros((t.h, t.w), bool)
    off = 0
    for i, (x, y) in enumerate(path):
        if i % 9 == 0 and rng.random() < 0.35:
            off = max(-1, min(1, off + rng.choice((-1, 1))))
        xx, yy = x + (off if light_side[0] else 0), y + (off if light_side[1] else 0)
        if 0 <= xx < t.w and 0 <= yy < t.h:
            dark[yy, xx] = True
        lx, ly = xx + light_side[0], yy + light_side[1]
        if 0 <= lx < t.w and 0 <= ly < t.h:
            lit[ly, lx] = True
    lit &= ~dark
    shift(t, dark, -strength)
    shift(t, lit, 1)
    return dark | lit


def foxing(t, rng, n, region=None, big=0.3):
    """Rust-brown foxing: small clustered spots, a dark heart and a soft rim."""
    h, w = t.h, t.w
    op = t.a[..., 3] > 0
    for _ in range(n):
        for _try in range(20):
            x, y = rng.randrange(2, w - 2), rng.randrange(2, h - 2)
            if region is None or region[y, x]:
                break
        if not op[y, x]:
            continue
        if rng.random() < big:
            shape = [(0, 0), (1, 0), (0, 1), (1, 1), (-1, 0), (2, 1)]
            heart = [(0, 0), (1, 1)]
        else:
            shape = [(0, 0), (1, 0)] if rng.random() < 0.5 else [(0, 0), (0, 1)]
            heart = [(0, 0)]
        for dx, dy in shape:
            if 0 <= x + dx < w and 0 <= y + dy < h and op[y + dy, x + dx]:
                c = 'pap_fox1' if (dx, dy) in heart else 'pap_fox2'
                t.cv.px(x + dx, y + dy, c)


def tea_ring(t, cx, cy, r, rng, gap=0.25, heavy=0.4):
    """The ring a wet cup leaves: a broken dark rim, heavier on one side, the
    paper inside a shade darker in patches."""
    h, w = t.h, t.w
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.hypot(xx + 0.5 - cx, (yy + 0.5 - cy) * 1.08)
    ang = np.arctan2(yy + 0.5 - cy, xx + 0.5 - cx)
    a0 = rng.uniform(0, 2 * np.pi)
    thick = 0.6 + heavy * (np.cos(ang - a0) > 0.3)
    rim = (np.abs(d - r) < thick)
    brk = np.cos(ang * 3 + rng.uniform(0, 6)) > 1 - gap * 2
    rim &= ~brk
    inside = (d < r - 1) & (vnoise(w, h, 4, rng.randrange(1 << 20)) > 0.62)
    shift(t, inside, -1)
    shift(t, rim, -2)
    return rim | inside


# ---------------------------------------------------------------- variant damage (generic)
def fade_ink(t, seed, amount=0.5):
    """Ink worn thin: clusters of the printing step lighter, a few go to paper."""
    n = vnoise(t.w, t.h, 3.0, seed)
    m = t.ink & (n < amount)
    shift(t, m, 1)
    m2 = t.ink & (n < amount * 0.45)
    shift(t, m2, 1)


def fray(t, rng, depth=1.0, seed=0):
    """Frayed edges: small irregular bites out of the outline, a light fibre
    line along the torn edge."""
    op = t.a[..., 3] > 0
    d = edge_dist(op)
    n = vnoise(t.w, t.h, 2.0, seed, 1)
    bite = op & (d <= 1) & (n > 1 - 0.28 * depth)
    bite |= op & (d == 2) & (n > 1 - 0.1 * depth)
    t.a[bite, 3] = 0
    op2 = clean_mask(t.a[..., 3] > 0, 1)
    t.a[~op2, 3] = 0
    t.a[op2 & (t.a[..., 3] == 0)] = (*P('pap_parch5'), 255)
    return op2


def tear_corner(t, corner, size, rng, fibre=None):
    """Tear a corner off along a jagged line; the fresh tear shows a pale
    fibrous edge."""
    w, h = t.w, t.h
    sx, sy = size
    pts = []
    n = 7
    for i in range(n + 1):
        f = i / n
        j = rng.uniform(-1.2, 1.2) if 0 < i < n else 0
        pts.append((sx * (1 - f) + j, sy * f + j))
    yy, xx = np.mgrid[0:h, 0:w]
    if corner in ('tr', 'br'):
        xx = w - 1 - xx
    if corner in ('bl', 'br'):
        yy = h - 1 - yy
    # inside the corner triangle (below the jagged line from (sx,0) to (0,sy))
    gone = np.zeros((h, w), bool)
    path = np.array(pts)
    for y in range(h):
        for x in range(min(w, sx + 3)):
            pass
    lx = np.interp(yy + 0.5, path[:, 1], path[:, 0], left=sx, right=-1)
    gone = (xx + 0.5 < lx) & (yy < sy + 1)
    gone = clean_mask(gone, 2)
    t.a[gone, 3] = 0
    op = t.a[..., 3] > 0
    edge = op & ndimage.binary_dilation(gone, structure=np.ones((3, 3))) & ~gone
    if fibre:
        t.a[edge, :3] = P(fibre)
    return gone, edge


def tape(t, x, y, w, h, angle=0.0, seed=0):
    """Old sticky tape: the paper under it a step lighter (gloss), yellowed
    edges, a little crease and a glint."""
    W, H = t.w, t.h
    yy, xx = np.mgrid[0:H, 0:W]
    ca, sa = math.cos(angle), math.sin(angle)
    u = (xx + 0.5 - x) * ca + (yy + 0.5 - y) * sa
    v = -(xx + 0.5 - x) * sa + (yy + 0.5 - y) * ca
    m = (np.abs(u) <= w / 2) & (np.abs(v) <= h / 2)
    m &= t.a[..., 3] > 0
    edge = m & ~ndimage.binary_erosion(m)
    inner = m & ~edge
    shift(t, inner, 1)
    rgb = t.a[..., :3]
    t.a[edge & (t.a[..., 3] > 0), :3] = P('pap_tape0')
    # ragged cut ends
    ends = m & (np.abs(u) > w / 2 - 1) & (((xx + yy) % 2) == 0)
    t.a[ends, :3] = P('pap_tape1')
    glint = inner & (np.abs(u + w * 0.2) < 0.7) & (np.abs(v) < h / 2 - 1)
    t.a[glint, :3] = P('pap_tape2')
    return m


def stitch(t, pts, thread='pap_thread', rip_col='pap_ink0', every=3):
    """A rip sewn shut: the rip as a dark crack, cross stitches over it."""
    path = []
    for i in range(len(pts) - 1):
        seg = bres(*pts[i], *pts[i + 1])
        path += seg if not path else seg[1:]
    for (x, y) in path:
        t.px(x, y, rip_col)
    for i in range(1, len(path) - 1, every):
        x, y = path[i]
        (x0, y0), (x1, y1) = path[i - 1], path[i + 1]
        nx, ny = -(y1 - y0), (x1 - x0)
        ln = max(1e-6, math.hypot(nx, ny))
        nx, ny = nx / ln, ny / ln
        a = (round(x - nx * 2), round(y - ny * 2))
        b = (round(x + nx * 2), round(y + ny * 2))
        for k, (px, py) in enumerate(bres(*a, *b)):
            t.px(px, py, f'{thread}{2 if k == 0 else 1}')
        t.px(a[0], a[1], f'{thread}0')
        t.px(b[0], b[1], f'{thread}0')
    return path


def patch(t, mask, base, rng, seed=0):
    """A patch of other paper glued over a corner: its own colour, a soft glue
    stain round it, a lifted edge."""
    m = mask & (t.a[..., 3] > 0) | mask
    t.a[m] = (*P(base), 255)
    n = vnoise(t.w, t.h, 3, seed)
    shift(t, m & (n > 0.6), -1)
    edge = m & ~ndimage.binary_erosion(m)
    shift(t, edge, -1)
    glue = ndimage.binary_dilation(m, iterations=2) & ~m & (t.a[..., 3] > 0)
    shift(t, glue & (n > 0.35), -1)
    return m
