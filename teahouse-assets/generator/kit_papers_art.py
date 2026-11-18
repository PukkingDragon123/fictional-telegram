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
def washi_fibres(t, rng, n_dark, n_light, region=None, dark='pap_parch4', light='pap_parch6'):
    """Kozo fibres lying in the sheet: short streaks a shade off the paper."""
    for k in range(n_dark + n_light):
        for _ in range(10):
            x, y = rng.randrange(1, t.w - 4), rng.randrange(1, t.h - 1)
            if region is None or region[y, x]:
                break
        ln = rng.choice((2, 2, 3, 3, 4))
        c = dark if k < n_dark else light
        dy = 0
        for i in range(ln):
            if i == 2 and rng.random() < 0.4:
                dy = rng.choice((-1, 1))
            if region is None or (0 <= y + dy < t.h and region[y + dy, x + i]):
                t.px(x + i, y + dy, c)



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


# ================================================================ THE WORLD MAP
MAP_W, MAP_H = 108, 68

# islands as centre lines with a half-width at each point (x, y, r)
ISLANDS = [
    # the long main island, an S-curve from the south-west up to the north-east
    [(30, 53, 3.0), (37, 51, 4.8), (45, 49.5, 6.0), (53, 47, 7.0), (61, 43, 7.4), (67, 37, 5.6),
     (71, 31, 3.8), (76, 26, 4.4), (82, 22, 4.6), (88, 19.5, 3.4), (92, 19, 2.0)],
    # the home island in the south-west, running off past the frame
    [(4, 44, 3.0), (8, 50, 5.4), (11, 56, 4.6), (13, 61, 2.6)],
    # the north island, running off past the frame
    [(92, 9.5, 3.4), (98, 6.5, 5.6), (106, 5, 5.0)],
    # the small island in the inland sea
    [(37, 59.5, 2.0), (42, 60, 2.6), (47, 59, 1.6)],
]
ISLETS = [(21, 41, 1.5), (24, 62, 1.4), (28, 63, 1.1), (63, 57, 1.6), (68, 53, 1.2), (99, 21, 1.7),
          (94, 28, 1.2), (102, 25, 1.1), (19, 49, 1.2)]
BAYS = [(64, 51.0, 2.4), (75, 31.0, 1.8), (44, 43.0, 1.8), (58, 38.0, 1.6), (84, 26.5, 1.6)]           # bites out of the coasts
CAPES = [(69, 45.5, 2.0), (36, 46.4, 1.6), (6, 41, 1.6), (79, 18.5, 1.6)]                                # little peninsulas

VOLCANO = (61, 46)          # base centre of the snow volcano
TOWNS = {'home': (8, 50), 'port': (14, 55), 'ferry': (30, 53), 'rail': (42, 52), 'tea': (49, 45)}
ROUTE = [(8, 50), (10, 53), (14, 55), (22, 57), (30, 53), (36, 52.5), (42, 52), (45, 51.5), (47, 50)]
LEGS = [(0, 2, 'walk'), (2, 4, 'ferry'), (4, 6, 'rail'), (6, 8, 'walk')]


def _land_mask(seed=7):
    w, h = MAP_W, MAP_H
    yy, xx = np.mgrid[0:h, 0:w] + 0.5
    f = np.full((h, w), 9.0)
    for isl in ISLANDS:
        pts = spline([(x, y) for x, y, r in isl], 400)
        rs = np.interp(np.linspace(0, 1, len(pts)), np.linspace(0, 1, len(isl)), [r for _, _, r in isl])
        for (px, py), r in zip(pts[::2], rs[::2]):
            f = np.minimum(f, np.hypot(xx - px, yy - py) / r)
    for (x, y, r) in CAPES:
        f = np.minimum(f, np.hypot(xx - x, yy - y) / r)
    n1 = vnoise(w, h, 5.5, seed, 1)
    n2 = vnoise(w, h, 2.2, seed + 1, 1)
    land = f < 1.0 + (n1 - 0.5) * 0.5 + (n2 - 0.5) * 0.36
    for (x, y, r) in BAYS:
        land &= np.hypot(xx - x, yy - y) > r
    land = clean_mask(land, 3)
    lab, n = ndimage.label(land)
    sizes = ndimage.sum(land, lab, range(1, n + 1))
    for i, sz in enumerate(sizes):
        if sz < 8:
            land[lab == i + 1] = False
    islets = np.zeros_like(land)
    for (x, y, r) in ISLETS:
        islets |= np.hypot(xx - x, yy - y) <= r
    islets &= ~land
    inside = np.zeros_like(land)
    inside[4:h - 4, 4:w - 4] = True
    return land & inside, islets & inside, inside


def _put(t, x, y, rows, legend, ink=True):
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            c = legend.get(ch)
            if c:
                t.px(x + i, y + j, c, ink)


def _mountain(t, cx, by, hgt):
    """A map mountain: lit face, shaded face, ink on the slopes, no base line."""
    for j in range(hgt):
        y = by - hgt + 1 + j
        for x in range(cx - j, cx + j + 1):
            if x == cx - j:
                c = 'pap_ink1'
            elif x == cx + j:
                c = 'pap_ink0'
            elif x < cx or (x == cx and j < 2):
                c = 'pap_parch6' if j > 0 else 'pap_ink1'
            else:
                c = 'pap_parch4'
            t.px(x, y, c, c.startswith('pap_ink'))
    t.px(cx, by - hgt + 1, 'pap_ink1', True)


def _volcano(t, cx, by, H=11, top=2, base=10):
    """The snow volcano: concave flanks, a flat crater, snow running down in
    streaks (cool where it turns from the light), the shadow side shaded."""
    rows = {}
    for j in range(H + 1):
        f = j / H
        half = top + (base - top) * (f ** 1.75)
        rows[j] = (int(round(cx - half)), int(round(cx + half)))
    drips = {-4: 4, -3: 6, -2: 4, -1: 5, 0: 4, 1: 6, 2: 3, 3: 5, 4: 3}
    for j in range(H + 1):
        y = by - H + j
        x0, x1 = rows[j]
        for x in range(x0 + 1, x1):
            if x < cx - 1:
                c = 'pap_parch6'
            elif x <= cx:
                c = 'pap_parch5'
            else:
                c = 'pap_parch4' if x > cx + j * 0.35 else 'pap_parch5'
            ln = drips.get(x - cx, 2)
            if j <= ln and j > 0:
                c = 'white' if x <= cx else ('pap_sea3' if x > cx + 1 else 'pap_parch6')
            t.px(x, y, c, False)
        t.px(x0, y, 'pap_ink1', True)
        t.px(x1, y, 'pap_ink0', True)
        # the flank steps between rows stay joined
        if j > 0:
            px0, px1 = rows[j - 1]
            for x in range(x0 + 1, px0):
                t.px(x, y, 'pap_ink1', True)
            for x in range(px1 + 1, x1):
                t.px(x, y, 'pap_ink0', True)
    x0, x1 = rows[0]
    t.line(x0, by - H, x1, by - H, 'pap_ink1')
    t.px(cx, by - H, 'pap_ink0')                  # the crater notch
    # smoke curling off to the east
    for (dx, dy, c) in ((0, -1, 'pap_ink2'), (1, -2, 'pap_ink2'), (1, -3, 'pap_parch3'), (2, -4, 'pap_parch3'),
                        (3, -4, 'pap_parch3'), (4, -5, 'pap_parch3'), (5, -5, 'pap_parch4')):
        t.px(cx + dx, by - H + dy, c, False)


TREE = ['.l.', 'lmd', '.t.']


def _trees(t, pts):
    for (x, y) in sorted(pts, key=lambda p: p[1]):
        _put(t, x - 1, y - 1, TREE, {'l': 'pap_moss3', 'm': 'pap_moss2', 'd': 'pap_moss1', 't': 'pap_ink2'}, False)


def _forest(t, cx, cy, n, rng, spread=(4, 2.5)):
    pts = [(cx, cy)]
    for _ in range(n * 6):
        if len(pts) >= n:
            break
        x = cx + int(round(rng.uniform(-spread[0], spread[0])))
        y = cy + int(round(rng.uniform(-spread[1], spread[1])))
        if all(abs(x - a) + abs(y - b) >= 2 for a, b in pts):
            pts.append((x, y))
    _trees(t, pts)


def _compass(t, cx, cy):
    """Compass rose: four long points split light / dark, four short ones, a
    red north, a dotted ring."""
    for a in range(0, 360, 20):
        if a % 90 in (0,):
            continue
        x = cx + 0.5 + 5.6 * math.cos(math.radians(a))
        y = cy + 0.5 + 5.6 * math.sin(math.radians(a))
        t.px(int(math.floor(x)), int(math.floor(y)), 'pap_ink2', True)
    for (dx, dy) in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        for k in range(1, 4):
            t.px(cx + dx * k, cy + dy * k, 'pap_ink1' if k < 3 else 'pap_ink2', True)
    for nm, (dx, dy) in {'N': (0, -1), 'S': (0, 1), 'E': (1, 0), 'W': (-1, 0)}.items():
        L = 8 if nm in 'NS' else 7
        for k in range(1, L + 1):
            hw = 1 if k <= 3 else 0
            x, y = cx + dx * k, cy + dy * k
            for s_ in range(-hw, hw + 1):
                px_, py_ = (x + s_, y) if dy else (x, y + s_)
                lit = s_ < 0
                if nm == 'N':
                    c = 'red4' if lit else ('red2' if s_ > 0 else 'red3')
                else:
                    c = 'pap_parch6' if lit else ('pap_ink1' if s_ > 0 else 'pap_ink0')
                t.px(px_, py_, c, True)
    t.px(cx, cy, 'pap_parch6')
    t.text(cx - 1, cy - 15, 'N', 'red2')


def _waves(t, pts):
    for (x, y) in pts:
        _put(t, x, y, ['.ss..', 's..ss'], {'s': 'pap_sea1'}, False)


def _whale(t, x, y):
    rows = ['.....s.s..',
            '......s...',
            '.k..kkkkk.',
            'kk.kLLLLkk',
            '.kkkkkkkk.']
    _put(t, x, y, rows, {'s': 'pap_sea1', 'k': 'pap_ink1', 'L': 'pap_sea3'})
    t.px(x + 8, y + 3, 'pap_ink0')


def _banner(t, x, y, word, rng):
    """A ribbon cartouche with the map's title."""
    w = text_width(word) + 6
    for i in range(w):
        for j in range(7):
            t.px(x + i, y + j, 'pap_parch6', False)
    t.line(x, y, x + w - 1, y, 'pap_ink1')
    t.line(x, y + 6, x + w - 1, y + 6, 'pap_ink1')
    # rolled ends
    for (ex, sgn) in ((x - 1, -1), (x + w, 1)):
        for j in range(1, 8):
            t.px(ex + sgn * (1 if j > 1 else 0), y + j, 'pap_parch4', False)
        t.px(ex, y, 'pap_ink1', True)
        t.px(ex + sgn, y + 1, 'pap_ink1', True)
        t.px(ex + sgn * 2, y + 2, 'pap_ink1', True)
        t.line(ex + sgn * 2, y + 3, ex + sgn * 2, y + 7, 'pap_ink1')
        t.px(ex + sgn, y + 8, 'pap_ink0', True)
        t.px(ex, y + 7, 'pap_ink1', True)
    t.text(x + 3, y + 1, word, 'pap_ink0')


def route_legs(upto=1.0):
    total = len(ROUTE) - 1
    reach = upto * total
    out = []
    for (a, b, kind) in LEGS:
        if reach <= a:
            break
        seg = spline(ROUTE[a:b + 1], 160)
        pts, ln = resample(seg, 1.0)
        frac = min(1.0, (reach - a) / (b - a))
        out.append((kind, pts, int(round(len(pts) * frac))))
    return out


def draw_route(t, upto=1.0, ink='red3', ink_dark='red2', tie='pap_ink0', offset=(0, 0)):
    """The travel route, drawn stop by stop: dots on foot, dashes over the
    water, a railway (red line, ink sleepers) along the coast."""
    for kind, pts, n in route_legs(upto):
        seen = set()
        q = []
        for (x, y) in pts:
            p = (int(x) + offset[0], int(y) + offset[1])
            if p not in seen:
                seen.add(p)
                q.append(p)
        n = min(n, len(q))
        for i, (x, y) in enumerate(q[:n]):
            if kind == 'walk' and i % 2 == 0:
                t.px(x, y, ink, True)
            elif kind == 'ferry' and i % 4 < 2:
                t.px(x, y, ink, True)
            elif kind == 'rail':
                t.px(x, y, ink, True)
                if i % 3 == 1 and 0 < i < len(q) - 1:
                    (x0, y0), (x1, y1) = q[i - 1], q[i + 1]
                    if abs(x1 - x0) >= abs(y1 - y0):
                        t.px(x, y - 1, tie, True); t.px(x, y + 1, tie, True)
                    else:
                        t.px(x - 1, y, tie, True); t.px(x + 1, y, tie, True)


def _boat(t, x, y):
    _put(t, x, y, ['..s.', '.ss.', 'kkkk', '.kk.'], {'s': 'pap_parch6', 'k': 'pap_ink1'})


def tea_mark(t, cx, cy, pulse=0, c='red3', ring=True, clear=True):
    """Where the tea comes from: a vermilion tea bowl with steam, circled;
    pulse draws a second, widening ring."""
    cl, cd = step(P(c), 1), step(P(c), -1)
    if clear:
        m = ellipse_mask(t.w, t.h, cx + 0.5, cy + 0.5, 5.4, 4.6)
        m &= t.a[..., 3] > 0
        t.a[m, :3] = P('pap_parch6')
        t.ink &= ~m
    bowl = ['..s.s..', '.s.s...', 'LLLLLLL', 'rrrrrrr', '.rrrrr.', '..ddd..']
    for j, row in enumerate(bowl):
        for i, ch in enumerate(row):
            col_ = {'s': 'pap_ink2', 'L': cl, 'r': c, 'd': cd}.get(ch)
            if col_:
                t.px(cx - 3 + i, cy - 3 + j, col_, True)
    for r, on, cc in ((6.0, ring, c), (pulse, pulse > 0, c if pulse < 7.5 else cl)):
        if not on:
            continue
        pts = set()
        for a in range(0, 360, 3):
            x = int(math.floor(cx + 0.5 + r * math.cos(math.radians(a))))
            y = int(math.floor(cy + 0.5 + r * 0.8 * math.sin(math.radians(a))))
            pts.add((x, y))
        for (x, y) in pts:
            t.px(x, y, cc, True)


def _town(t, x, y, big=False):
    if big:
        _put(t, x - 2, y - 2, ['.kkk.', 'kRrrk', 'kr.rk', 'krrRk', '.kkk.'],
             {'k': 'pap_ink0', 'r': 'red3', 'R': 'red4', '.': 'pap_parch6'})
    else:
        _put(t, x - 1, y - 1, ['.k.', 'krk', '.k.'], {'k': 'pap_ink0', 'r': 'red4'})


def map_base(seed=11):
    """The map with everything but the route: paper, washes, coasts, the
    land's furniture, labels, compass, frame."""
    rng = random.Random(seed)
    w, h = MAP_W, MAP_H
    t = Tex(w, h, 'pap_parch5')
    land, islets, inside = _land_mask()
    allland = land | islets
    sea = ~allland
    d_sea = ndimage.distance_transform_edt(~land)
    d_isl = ndimage.distance_transform_edt(~islets)
    wn = vnoise(w, h, 3.0, seed + 5)
    # watercolour wash along the coasts, its outer edge pooled a little darker
    wash = sea & ((d_sea <= 3.0 + wn * 2.6) | (d_isl <= 1.6 + wn)) & inside
    t.a[wash, :3] = P('pap_sea3')
    near = sea & ((d_sea <= 1.5) | (d_isl <= 1.0)) & inside
    t.a[near, :3] = P('pap_sea2')
    pool = wash & ~ndimage.binary_erosion(wash | allland | ~inside) & (d_sea > 2)
    t.a[pool, :3] = P('pap_sea2')
    # land: lighter paper, a shade darker just inside the south-east shores (it stands up off the sea)
    t.a[land, :3] = P('pap_parch6')
    sh = land & ~ndimage.binary_erosion(land, iterations=2)
    se = sh & (np.roll(sea, -1, 1) | np.roll(sea, -1, 0) | np.roll(sea, -2, 1) | np.roll(sea, -2, 0))
    t.a[se & ~(np.roll(sea, 1, 1) | np.roll(sea, 1, 0)), :3] = P('pap_parch5')
    # coastline in uneven ink: heavy where the pen was freshly dipped
    cut = np.zeros_like(land)
    cut[4:h - 4, 4:w - 4] = True
    coast = land & ~ndimage.binary_erosion(land) & ~(~ndimage.binary_erosion(cut))
    inkn = vnoise(w, h, 4.0, seed + 9)
    t.a[coast, :3] = P('pap_ink1')
    t.a[coast & (inkn > 0.64), :3] = P('pap_ink0')
    t.a[coast & (inkn < 0.3), :3] = P('pap_ink2')
    t.ink |= coast
    # rivers from the mountains to the sea
    for pts in ([(70, 33), (71, 35), (70, 37), (71, 39), (72, 41)], [(83, 22), (84, 24), (83, 26), (84, 28)],
                [(56, 38), (55, 40)], [(97, 9), (98, 11), (97, 13)]):
        for i in range(len(pts) - 1):
            for (x, y) in bres(*pts[i], *pts[i + 1]):
                if land[y, x] and not coast[y, x]:
                    t.px(x, y, 'pap_sea1', True)
    # islets: solid ink with a lit pixel
    t.a[islets, :3] = P('pap_ink1')
    t.ink |= islets
    lab, n = ndimage.label(islets)
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        if len(xs) >= 4:
            k = np.argmin(xs + ys)
            t.a[ys[k], xs[k], :3] = P('pap_parch6')
    # forests
    _forest(t, 39, 49, 4, rng, (3, 1.2))
    _forest(t, 6, 47, 3, rng, (2, 1.5))
    _forest(t, 10, 58, 3, rng, (2, 1.5))
    _forest(t, 96, 8, 5, rng, (3.5, 1.5))
    _forest(t, 88, 20, 3, rng, (2, 1))
    _forest(t, 70, 42, 4, rng, (2.5, 1.5))
    _forest(t, 41, 60, 3, rng, (2.5, 0.5))
    # mountains along the spine, the snow volcano
    for (x, y, hg) in ((67, 36, 4), (72, 31, 3), (78, 26, 4), (84, 23, 3), (92, 10, 3), (101, 7, 4),
                       (9, 46, 3), (55, 52, 3)):
        _mountain(t, x, y, hg)
    _volcano(t, *VOLCANO)
    # tea terraces below the bowl on the volcano's foot
    for (x0, y0, n) in ((44, 50, 3), (52, 51, 1), (51, 53, 3)):
        for i in range(n):
            t.px(x0 + i, y0, 'pap_moss2' if i % 2 == 0 else 'pap_moss3', False)
    _waves(t, [(31, 16), (52, 22), (40, 29), (78, 50), (85, 40), (8, 27), (72, 13), (92, 59), (74, 59), (52, 63)])
    _whale(t, 19, 24)
    _banner(t, 8, 7, 'SEKAI', rng)
    for nm in ('home', 'port', 'ferry', 'rail'):
        _town(t, *TOWNS[nm])
    _town(t, 77, 23, big=True)
    _town(t, 97, 11)
    t.text(5, 35, 'AKO', 'pap_ink1', rng, True)
    t.text(62, 16, 'MIYA', 'pap_ink1', rng, True)
    t.text(80, 56, 'KAI', 'pap_sea0', rng, True)
    _compass(t, 94, 47)
    # the hand-ruled frame, overshooting at the corners
    for (x0, y0, x1, y1) in ((2, 3, w - 3, 3), (2, h - 4, w - 3, h - 4), (3, 2, 3, h - 3), (w - 4, 2, w - 4, h - 3)):
        t.line(x0, y0, x1, y1, 'pap_ink1')
    for (x, y) in ((3, 3), (w - 4, 3), (3, h - 4), (w - 4, h - 4)):
        t.px(x, y, 'pap_ink0')
    t.land = land
    return t


_BASE = {}


def map_front(variant='hero', route=1.0, pulse=0, seed=11, mark=None):
    if seed not in _BASE:
        _BASE[seed] = map_base(seed)
    b = _BASE[seed]
    t = Tex(b.w, b.h, 'pap_parch5')
    t.a[:] = b.a
    t.ink = b.ink.copy()
    t.land = b.land
    _boat(t, 20, 58)
    if variant == 'repaired':
        draw_route(t, route, ink='red4', ink_dark='red4', tie='pap_ink2')         # the old route, faded...
        draw_route(t, route, ink='red2', ink_dark='red1', tie='pap_ink0', offset=(1, -1))   # ...gone over again
    elif variant == 'worn':
        draw_route(t, route, ink='red4', ink_dark='red3', tie='pap_ink2')
    else:
        draw_route(t, route)
    if mark is None:
        mark = route >= 1.0
    if mark:
        tea_mark(t, TOWNS['tea'][0], TOWNS['tea'][1] - 1, pulse)
    return t


def map_back(seed=12):
    """The back of the scroll: rougher paper, the coasts showing through
    faintly (mirrored), a pasted title slip, the owner's seal, a few notes."""
    rng = random.Random(seed)
    w, h = MAP_W, MAP_H
    t = Tex(w, h, 'pap_parch5')
    washi_fibres(t, rng, 70, 28)
    land, islets, inside = _land_mask()
    ghost = (land & ~ndimage.binary_erosion(land)) | islets
    ghost = ghost[:, ::-1]
    gm = ghost & (vnoise(w, h, 3, seed + 3) > 0.3)
    shift(t, gm, -1)
    # the title slip
    sx, sy, sw, sh = 14, 20, 30, 15
    for y in range(sy, sy + sh):
        for x in range(sx, sx + sw):
            t.px(x, y, 'pap_cream3', False)
    for x in range(sx, sx + sw):
        t.px(x, sy, 'pap_cream2'); t.px(x, sy + sh - 1, 'pap_cream1')
    for y in range(sy, sy + sh):
        t.px(sx, y, 'pap_cream2'); t.px(sx + sw - 1, y, 'pap_cream1')
    for x in range(sx + 2, sx + sw - 2):
        t.px(x, sy + 2, 'red3', True); t.px(x, sy + sh - 3, 'red3', True)
    t.text(sx + 5, sy + 5, 'SEKAI', 'pap_ink0')
    # owner's seal, square, red
    cx, cy = 34, 42
    for y in range(cy, cy + 7):
        for x in range(cx, cx + 7):
            edge = x in (cx, cx + 6) or y in (cy, cy + 6)
            t.px(x, y, 'pap_seal1' if edge else 'pap_parch5', True)
    for (x, y) in ((2, 2), (3, 2), (4, 2), (3, 3), (2, 4), (4, 4), (3, 4)):
        t.px(cx + x, cy + y, 'pap_seal1', True)
    # the traveller's notes, a column of rune lines
    for k, word in enumerate(('CHA', 'MIZU', 'KISHA', 'FUNE')):
        t.text(64, 14 + k * 8, word, 'pap_ink1', rng, True)
        t.px(60, 16 + k * 8, 'pap_ink2', True)
    t.line(62, 48, 88, 48, 'pap_ink2')
    t.text(66, 51, '1874', 'pap_ink1', rng, True)
    return t


# ================================================================ THE TRAIN TICKET (Edmondson card)
TK_W, TK_H = 48, 28
TK_HOLE = (43, 8)            # where the conductor punches it

LOCO = ['...........sss..',
        '............s...',
        '.kkkkk....kk....',
        '.kL.Lk....kk....',
        '.k...kkkkkkkkkk.',
        '.kkkkkbbbbbbbbkk',
        'kkkkkkkkkkkkkkkK',
        '.kok..kok..kok..']


def card_shape(w, h, clip=1):
    m = np.ones((h, w), bool)
    for (x, y) in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        m[y, x] = False
    return m


def bevel(t, m, lit, dark):
    """The card's own cut edge: a lit lip top-left, a darker one bottom-right."""
    e_top = m & ~np.roll(m, 1, 0)
    e_top[0] |= m[0]
    e_left = m & ~np.roll(m, 1, 1)
    e_left[:, 0] |= m[:, 0]
    e_bot = m & ~np.roll(m, -1, 0)
    e_bot[-1] |= m[-1]
    e_right = m & ~np.roll(m, -1, 1)
    e_right[:, -1] |= m[:, -1]
    t.a[(e_top | e_left), :3] = P(lit)
    t.a[(e_bot | e_right), :3] = P(dark)


def punch_hole(t, x, y, mirror=False):
    """The conductor's star punch: a little cross clean through the card,
    its lip catching the light on the far side."""
    if mirror:
        x = t.w - 1 - x
    hole = [(0, -1), (-1, 0), (0, 0), (1, 0), (0, 1)]
    for dx, dy in hole:
        t.a[y + dy, x + dx, 3] = 0
    for dx, dy in ((-1, -1), (1, -1), (-1, 1), (1, 1), (0, -2), (-2, 0)):
        p = t.cv.get(x + dx, y + dy)
        if p[3]:
            t.cv.px(x + dx, y + dy, step(p[:3], -1))
    for dx, dy in ((2, 0), (0, 2)):
        p = t.cv.get(x + dx, y + dy)
        if p[3]:
            t.cv.px(x + dx, y + dy, step(p[:3], 1))


def ticket_front(punched=True, seed=21):
    rng = random.Random(seed)
    w, h = TK_W, TK_H
    t = Tex(w, h, 'pap_card3')
    m = card_shape(w, h)
    t.a[~m, 3] = 0
    washi_fibres(t, rng, 10, 8, m, 'pap_card2', 'pap_card4')
    bevel(t, m, 'pap_card4', 'pap_card2')
    # the class stripe, printed under everything else, a ring knocked out of it
    for y in range(3, h - 3):
        for x in range(35, 40):
            t.px(x, y, 'red3' if x > 35 else 'red4', True)
    _put(t, 36, 12, ['.c.', 'c.c', '.c.'], {'c': 'pap_card4'}, False)
    # printed double border
    for (x0, y0, x1, y1) in ((2, 2, w - 3, 2), (2, h - 3, w - 3, h - 3), (2, 2, 2, h - 3), (w - 3, 2, w - 3, h - 3)):
        t.line(x0, y0, x1, y1, 'pap_tink1')
    for x in range(4, w - 4, 2):
        if not 34 <= x <= 40:
            t.px(x, 4, 'pap_tink2', True)
    # the locomotive, engraved line art, on its rail
    _put(t, 4, 6, LOCO, {'k': 'pap_tink0', 'L': 'pap_card4', 's': 'pap_tink2', 'o': 'pap_card4', 'K': 'pap_tink1',
                         'b': 'pap_tink2'})
    t.line(3, 14, 20, 14, 'pap_tink1')
    for x in range(4, 20, 3):
        t.px(x, 15, 'pap_tink2', True)
    # from -> to
    t.text(23, 6, 'KAI', 'pap_tink0')
    t.line(23, 13, 31, 13, 'pap_tink1')
    t.px(30, 12, 'pap_tink1', True); t.px(30, 14, 'pap_tink1', True)
    t.text(23, 16, 'TOMO', 'pap_tink0')
    # fare, under the punch
    t.text(42, 16, '2', 'pap_tink0')
    # the dating press: violet, inked unevenly, set a pixel askew
    stamp = Canvas(w, h)
    text(stamp, 5, 18, '18', PAL['pap_violet0'])
    text(stamp, 14, 19, '74', PAL['pap_violet0'])
    sm = (stamp.a[..., 3] > 0) & m
    n = vnoise(w, h, 2.0, seed)
    t.a[sm, :3] = P('pap_violet0')
    t.a[sm & (n > 0.6), :3] = P('pap_violet1')
    t.ink |= sm
    t.px(12, 22, 'pap_violet1', True)
    if punched:
        punch_hole(t, *TK_HOLE)
    return t


def ticket_back(punched=True, seed=22):
    rng = random.Random(seed)
    w, h = TK_W, TK_H
    t = Tex(w, h, 'pap_card3')
    m = card_shape(w, h)
    t.a[~m, 3] = 0
    washi_fibres(t, rng, 14, 6, m, 'pap_card2', 'pap_card4')
    bevel(t, m, 'pap_card4', 'pap_card2')
    # the conditions, small and faded
    t.text(4, 3, '0472', 'pap_tink1')
    for k, y in enumerate((11, 14, 17, 20)):
        x = 4
        while x < w - 6:
            ln = rng.randint(2, 5)
            for i in range(ln):
                if x + i < w - 5:
                    t.px(x + i, y, 'pap_tink2', True)
                    if rng.random() < 0.2:
                        t.px(x + i, y - 1, 'pap_tink2', True)
            x += ln + rng.randint(1, 2)
    t.line(4, 8, w - 6, 8, 'pap_tink2')
    t.text(w - 16, 3, 'KAI', 'pap_tink2')
    if punched:
        punch_hole(t, *TK_HOLE, mirror=True)
    return t


# ================================================================ THE FERRY PASS (a tag)
BP_W, BP_H = 52, 32
BP_EYE = (6, 16)
BP_SEAL = (43, 17)


def pass_shape(w=BP_W, h=BP_H):
    m = np.ones((h, w), bool)
    for y in range(h):
        cut = max(0, 7 - y, y - (h - 8))
        m[y, :cut] = False
    # the conductor's round corner punch, bottom right
    yy, xx = np.mgrid[0:h, 0:w]
    m &= np.hypot(xx + 0.5 - w, yy + 0.5 - h) > 4.2
    return m


def _eyelet(t, x, y, mirror=False):
    if mirror:
        x = t.w - 1 - x
    yy, xx = np.mgrid[0:t.h, 0:t.w]
    d = np.hypot(xx + 0.5 - (x + 0.5), yy + 0.5 - (y + 0.5))
    ring = (d > 1.3) & (d < 2.9)
    hole = d <= 1.3
    ang = np.arctan2(yy + 0.5 - (y + 0.5), xx + 0.5 - (x + 0.5))
    lit = np.cos(ang + 2.3) > 0.2
    t.a[ring & lit, :3] = P('gold3')
    t.a[ring & ~lit, :3] = P('gold1')
    t.a[ring & (np.cos(ang + 2.3) > 0.85), :3] = P('gold4')
    t.a[ring & (np.cos(ang + 2.3) < -0.8), :3] = P('gold0')
    t.a[hole, 3] = 0


def _wave_line(t, y, x0, x1, c):
    for x in range(x0, x1 + 1):
        dy = [0, -1, -1, 0][x % 4]
        t.px(x, y + dy, c, True)


def ship_roundel(t, cx, cy, r=7):
    """The ferry line's crest: a junk under a big battened sail on banded
    waves, in a ring."""
    yy, xx = np.mgrid[0:t.h, 0:t.w]
    d = np.hypot(xx + 0.5 - cx, yy + 0.5 - cy)
    inside = d < r - 0.6
    ring = (d >= r - 0.6) & (d < r + 0.5)
    op = t.a[..., 3] > 0
    t.a[inside & op, :3] = P('pap_aqua4')
    sea = inside & (yy + 0.5 > cy + 2)
    t.a[sea & op, :3] = P('indigo2')
    ix, iy = int(cx), int(cy)
    for row in (iy + 4, iy + 6):
        for x in range(ix - r, ix + r + 1):
            if (x + row // 2) % 4 == 0 and inside[row, x]:
                t.px(x, row, 'pap_aqua3', True)
                if inside[row, x + 1]:
                    t.px(x + 1, row - 1, 'pap_aqua3', True)
    # the junk: a hull riding the waves, a big sail with battens, a red pennant
    _put(t, ix - 4, iy + 1, ['kkkkkkkkk', '.kkkkkkk.'], {'k': 'indigo0'})
    sail = ['...ss..',
            '..ssss.',
            '.SSSSSS',
            '..ssss.',
            '.SSSSSS',
            '..sssss']
    _put(t, ix - 3, iy - 6, sail, {'s': 'white', 'S': 'pap_aqua2'})
    t.px(ix, iy, 'indigo0', True)
    t.px(ix + 1, iy - 7, 'pap_seal1', True)
    t.px(ix + 2, iy - 7, 'pap_seal1', True)
    t.px(ix, iy - 7, 'indigo0', True)
    t.a[ring & op, :3] = P('indigo1')
    t.ink |= ring & op


def seal_mark(t, cx, cy, angle=-0.2, size=9, word='FU', rng=None):
    """The red hanko impression: a square seal frame and two characters,
    pressed a little crooked and inked unevenly."""
    ca, sa = math.cos(angle), math.sin(angle)

    def R(x, y):
        return (cx + x * ca - y * sa, cy + x * sa + y * ca)
    hs = size / 2 - 0.5
    corners = [R(-hs, -hs), R(hs, -hs), R(hs, hs), R(-hs, hs)]
    mask = poly_mask(t.w, t.h, [(x + 0.5, y + 0.5) for x, y in corners])
    inner = poly_mask(t.w, t.h, [(x + 0.5, y + 0.5) for x, y in
                                 [R(-hs + 1.2, -hs + 1.2), R(hs - 1.2, -hs + 1.2), R(hs - 1.2, hs - 1.2), R(-hs + 1.2, hs - 1.2)]])
    frame = mask & ~inner
    glyph = np.zeros_like(mask)
    # the carved strokes, as segments in seal space
    strokes = [(-2.6, -2.2, -0.6, -2.2), (-1.6, -2.2, -1.6, 2.6), (-2.6, 0.2, -0.6, 0.2), (-2.6, 2.6, -0.4, 1.6),
               (0.8, -2.6, 0.8, 2.6), (0.8, -2.6, 2.6, -2.6), (2.6, -2.6, 2.6, 0.0), (0.8, 0.0, 2.6, 0.0),
               (1.6, 0.0, 2.8, 2.6)]
    tmp = Tex(t.w, t.h, (255, 255, 255))
    for (x0, y0, x1, y1) in strokes:
        a, b = R(x0, y0), R(x1, y1)
        for (x, y) in bres(math.floor(a[0]), math.floor(a[1]), math.floor(b[0]), math.floor(b[1])):
            if 0 <= x < t.w and 0 <= y < t.h:
                glyph[y, x] = True
    ink = (frame | glyph) & (t.a[..., 3] > 0)
    n = vnoise(t.w, t.h, 1.6, 31)
    t.a[ink, :3] = P('pap_seal1')
    t.a[ink & (n > 0.66), :3] = P('pap_seal2')
    t.a[ink & (n < 0.2), :3] = P('pap_seal0')
    t.ink |= ink
    return ink


def pass_front(stamped=True, seed=31):
    rng = random.Random(seed)
    w, h = BP_W, BP_H
    t = Tex(w, h, 'pap_aqua3')
    m = pass_shape()
    t.a[~m, 3] = 0
    washi_fibres(t, rng, 10, 10, m, 'pap_aqua2', 'pap_aqua4')
    bevel(t, m, 'pap_aqua4', 'pap_aqua1')
    # wave borders top and bottom
    _wave_line(t, 3, 9, w - 4, 'pap_aqua1')
    _wave_line(t, h - 3, 9, w - 7, 'pap_aqua1')
    # header band
    for y in range(5, 11):
        for x in range(13, w - 3):
            t.px(x, y, 'indigo2' if y > 5 else 'indigo3', True)
    t.text(15, 6, 'FUNE', 'pap_aqua4')
    t.ink[6:11, 15:31] = False
    for x in (36, 39, 42, 45):
        t.px(x, 8, 'gold3', True)
    ship_roundel(t, 20.5, 20.5, 7)
    # route and the stamp box
    t.text(30, 13, 'AKO', 'indigo1')
    t.text(30, 22, 'KAI', 'indigo1')
    for k in range(3):
        t.px(32 + k * 2, 19, 'indigo2', True)
    for x in range(39, 48):
        if x % 2 == 0:
            t.px(x, 13, 'pap_aqua1', True); t.px(x, 21, 'pap_aqua1', True)
    for y in range(13, 22):
        if y % 2 == 1:
            t.px(39, y, 'pap_aqua1', True); t.px(47, y, 'pap_aqua1', True)
    _eyelet(t, *BP_EYE)
    if stamped:
        seal_mark(t, *BP_SEAL)
    return t


def pass_back(seed=32):
    rng = random.Random(seed)
    w, h = BP_W, BP_H
    t = Tex(w, h, 'pap_aqua3')
    m = pass_shape()[:, ::-1]
    t.a[~m, 3] = 0
    washi_fibres(t, rng, 12, 8, m, 'pap_aqua2', 'pap_aqua4')
    bevel(t, m, 'pap_aqua4', 'pap_aqua1')
    # a little timetable: two columns of sailing times under a header rule
    t.text(5, 3, 'TOKI', 'indigo1')
    t.line(4, 9, 36, 9, 'indigo2')
    rows = ['0600', '0930', '1300', '1730']
    for k, r in enumerate(rows[:3]):
        t.text(5, 11 + k * 6, r[:2], 'indigo1')
        t.px(13, 13 + k * 6, 'indigo2', True)
        t.text(15, 11 + k * 6, r[2:], 'indigo1')
        t.text(25, 11 + k * 6, 'FU' if k % 2 else 'KA', 'pap_aqua1')
    t.line(22, 10, 22, 28, 'indigo2')
    _wave_line(t, h - 3, 3, w - 9, 'pap_aqua1')
    _eyelet(t, *BP_EYE, mirror=True)
    return t


# ================================================================ THE POSTCARD
PC_W, PC_H = 64, 44
PC_B = 3                     # the white border


def _band_edge(t, y, x0, x1, c, rng, seed):
    """A stepped, hand-placed boundary between two sky bands: runs of 2-4
    pixels dropping into the band below (no dither)."""
    x = x0
    up = True
    while x <= x1:
        run = rng.choice((2, 3, 3, 4))
        if up:
            for i in range(run):
                t.px(x + i, y, c, False)
        x += run
        up = not up


def postcard_front(seed=41):
    rng = random.Random(seed)
    w, h = PC_W, PC_H
    t = Tex(w, h, 'pap_cream3')
    x0, y0, x1, y1 = PC_B, PC_B, w - PC_B - 1, h - PC_B - 1
    pw, ph = x1 - x0 + 1, y1 - y0 + 1                         # 58 x 38
    HOR = y0 + 23                                             # the far shore / horizon
    # sky in bands, dusk violet at the top to gold at the horizon
    bands = [(0, 'pap_dusk0'), (5, 'pap_dusk1'), (10, 'pap_dusk2'), (14, 'pap_dusk3'), (18, 'pap_dusk4'),
             (21, 'pap_dusk5')]
    for i, (by, c) in enumerate(bands):
        ny = bands[i + 1][0] if i + 1 < len(bands) else HOR - y0
        for y in range(y0 + by, y0 + ny):
            for x in range(x0, x1 + 1):
                t.px(x, y, c)
        if i > 0:
            _band_edge(t, y0 + by, x0, x1, bands[i - 1][1], rng, seed)
    # the sun, low on the right, its lower rim behind the far hills
    sx, sy = x0 + 44, HOR - 3
    t.cv.ellipse(sx, sy, 4.6, 4.6, PAL['pap_dusk6'])
    t.cv.ellipse(sx - 0.6, sy - 0.6, 3.0, 3.0, PAL['white'])
    # streaks of cloud lit from below
    for (cx, cy, ln) in ((x0 + 4, y0 + 7, 15), (x0 + 36, y0 + 12, 18), (x0 + 6, y0 + 15, 9), (x0 + 47, y0 + 17, 10)):
        for i in range(ln):
            t.px(cx + i, cy, 'pap_dusk5' if cy > y0 + 10 else 'pap_dusk4')
            if 1 < i < ln - 2:
                t.px(cx + i, cy - 1, 'pap_dusk3' if cy > y0 + 10 else 'pap_dusk2')
        t.px(cx + ln, cy, 'pap_dusk4' if cy > y0 + 10 else 'pap_dusk3')
    # birds
    for (bx, by) in ((x0 + 14, y0 + 9), (x0 + 18, y0 + 7)):
        _put(t, bx, by, ['k.k', '.k.'], {'k': 'pap_dusk0'}, False)
    # the volcano: concave flanks, a crater, lit warm on the sun side
    vcx, vtop = x0 + 27, y0 + 6
    for y in range(vtop, HOR + 1):
        f = (y - vtop) / (HOR - vtop)
        half = 4 + 18 * f ** 1.6
        xa, xb = int(round(vcx - half)), int(round(vcx + half))
        for x in range(xa, xb + 1):
            u = (x - vcx) / max(half, 1)
            c = 'pap_mtn1' if u < -0.25 else ('pap_mtn2' if u < 0.35 else 'pap_mtn3')
            if x >= xb - 1 and y > vtop + 1:
                c = 'pap_mtn4'                                   # rim light from the sun
            t.px(x, y, c)
    # the snow cap: a crisp cap, then long fingers of snow down the gullies
    fingers = {-7: 1, -6: 3, -5: 5, -4: 4, -3: 7, -2: 5, -1: 8, 0: 6, 1: 9, 2: 4, 3: 7, 4: 5, 5: 6, 6: 3, 7: 2}
    for dx, ln in fingers.items():
        for k in range(ln):
            y = vtop + k
            f = (y - vtop) / (HOR - vtop)
            half = 4 + 18 * f ** 1.6
            if abs(dx) > half - 0.5:
                continue
            if k > 2 and (dx + k) % 5 == 0 and k < ln - 1:
                continue                                         # rock showing between the streaks
            if dx < -1:
                c = 'pap_snow0' if k > 1 else 'pap_snow1'
            elif dx < 2:
                c = 'pap_snow1'
            else:
                c = 'pap_snow2'
            t.px(vcx + dx, y, c)
    t.line(vcx - 3, vtop, vcx + 3, vtop, 'pap_snow1')
    t.px(vcx + 1, vtop, 'pap_snow2'); t.px(vcx + 2, vtop, 'pap_snow2')
    t.px(vcx - 1, vtop - 1, 'pap_mtn3')
    # a wisp of smoke from the crater, lit pink by the sun
    for (dx, dy) in ((0, -1), (1, -2), (2, -2), (3, -3), (5, -3), (6, -4)):
        t.px(vcx + dx, vtop + dy, 'pap_dusk3')
    # far hills along the shore, darker in front of the sun
    for x in range(x0, x1 + 1):
        hh = int(2 + 1.5 * math.sin(x * 0.31) + 1.2 * math.sin(x * 0.13 + 1))
        for y in range(HOR - hh, HOR + 1):
            if not (abs(x - vcx) < 3 + 19 * ((y - vtop) / (HOR - vtop)) ** 1.7 and y < HOR - 1):
                t.px(x, y, 'pap_mtn0' if y > HOR - hh else 'pap_mtn1')
    # the lake: the sky upside down in bands, broken by ripple lines
    for y in range(HOR + 1, y1 + 1):
        k = y - HOR
        c = ['pap_dusk4', 'pap_dusk3', 'pap_dusk3', 'pap_dusk2', 'pap_dusk2', 'pap_dusk1', 'pap_dusk1', 'pap_dusk1',
             'pap_dusk0', 'pap_dusk0', 'pap_dusk0', 'pap_dusk0', 'pap_dusk0', 'pap_dusk0', 'pap_dusk0'][min(14, k - 1)]
        for x in range(x0, x1 + 1):
            t.px(x, y, c)
    # the volcano's reflection, darker, cut by ripples
    for y in range(HOR + 1, y1 + 1):
        d = y - HOR
        yr = HOR - d * 1.15
        if yr < vtop:
            continue
        f = (yr - vtop) / (HOR - vtop)
        half = 3 + 19 * f ** 1.7
        for x in range(int(round(vcx - half)), int(round(vcx + half)) + 1):
            if (y + (x // 5)) % 4 == 0:
                continue
            t.px(x, y, 'pap_lake2' if d < 9 else 'pap_lake1')
        if d < 7:
            for x in range(int(round(vcx - min(half, 6))), int(round(vcx + min(half, 6))) + 1):
                if (x + y) % 3 == 0 and yr < vtop + 7:
                    t.px(x, y, 'pap_snow0')
    # the sun's glitter path
    for y in range(HOR + 1, y1 - 2, 1):
        ln = max(1, 4 - (y - HOR) // 3)
        off = [0, 1, -1, 0, 1][y % 5]
        if y % 2 == 0:
            for i in range(ln):
                t.px(sx - ln // 2 + i + off, y, 'pap_dusk6' if y < HOR + 6 else 'pap_dusk5')
    # ripple lines across the whole lake
    for (ry, rx0, rx1) in ((HOR + 3, x0 + 2, x0 + 14), (HOR + 6, x0 + 30, x0 + 40), (HOR + 9, x0 + 8, x0 + 22),
                           (HOR + 12, x0 + 34, x1 - 2)):
        for x in range(rx0, rx1):
            if (x // 3) % 3 != 2:
                t.px(x, ry, 'pap_dusk3' if ry < HOR + 7 else 'pap_dusk2')
    # the torii standing in the water
    tx, ty = x0 + 47, HOR - 9
    torii = ['kkkkkkkkkkk',
             '.RRRRRRRRR.',
             '..r.....r..',
             'RRRRRRRRRRR',
             '..r.....r..',
             '..r.....r..',
             '..r.....r..',
             '..r.....r..',
             '..r.....r..',
             '..r.....r..',
             '..r.....r..',
             '.wwww.wwww.']
    _put(t, tx - 5, ty, torii, {'k': 'pap_ink0', 'R': 'pap_seal1', 'r': 'pap_seal0', 'w': 'pap_dusk3'}, False)
    t.px(tx - 6, ty, 'pap_ink0'); t.px(tx + 6, ty, 'pap_ink0')
    t.px(tx - 6, ty - 1, 'pap_ink0'); t.px(tx + 6, ty - 1, 'pap_ink0')
    # its reflection
    for k, row in enumerate(['..r.....r..', '..r.....r..', '..r.....r..', '.........r.', 'r.rrrrr..rr', '..r......r.']):
        _put(t, tx - 5, ty + 12 + k * 1, [row], {'r': 'pap_seal0'}, False)
    # black pines on a rocky point, bottom left
    shore = [(x0, y1 - 6), (x0 + 5, y1 - 5), (x0 + 11, y1 - 2), (x0 + 15, y1 + 1), (x0, y1 + 1)]
    m = poly_mask(w, h, shore)
    t.a[m, :3] = P('pap_pine0')
    for (bx, by) in ((x0 + 1, y1 - 6), (x0 + 2, y1 - 6), (x0 + 5, y1 - 5), (x0 + 8, y1 - 4)):
        t.px(bx, by, 'pap_mtn1')
    _pine(t, x0 + 4, y1 - 5, rng)
    return t


def _pine(t, bx, by, rng):
    """A Japanese black pine leaning out over the water: a crooked dark trunk
    and three flat clouds of needles, rim-lit warm along the top by the sunset."""
    trunk = [(0, 0), (0, -1), (1, -2), (1, -3), (2, -4), (3, -5), (3, -6), (4, -7), (5, -8), (6, -9), (7, -9),
             (8, -10), (9, -11), (10, -11)]
    for (dx, dy) in trunk:
        t.px(bx + dx, by + dy, 'pap_pine0')
        t.px(bx + dx - 1, by + dy, 'pap_pine0')
    t.px(bx + 4, by - 8, 'pap_pine0'); t.px(bx + 3, by - 9, 'pap_pine0')        # a branch up to the top pad
    pads = [(bx + 11, by - 13, 6.0, 1.5), (bx + 3, by - 11, 4.0, 1.3), (bx + 15, by - 10, 3.2, 1.1)]
    for (cx, cy, rx, ry) in pads:
        m = ellipse_mask(t.w, t.h, cx + 0.5, cy + 0.5, rx, ry + 0.5)
        m &= t.a[..., 3] > 0
        t.a[m, :3] = P('pap_pine1')
        top = m & ~np.roll(m, 1, 0)
        t.a[top, :3] = P('pap_pine2')
        rim = top & (np.roll(np.arange(t.w)[None, :] > cx - rx * 0.2, 0, 0))
        t.a[rim, :3] = P('pap_dusk3')
        bot = m & ~np.roll(m, -1, 0)
        t.a[bot, :3] = P('pap_pine0')
        ys, xs = np.nonzero(bot)
        for x, y in zip(xs, ys):
            if (x + y) % 3 == 0 and y + 1 < t.h:
                t.px(x, y + 1, 'pap_pine0')


def postcard_back(seed=42):
    rng = random.Random(seed)
    w, h = PC_W, PC_H
    t = Tex(w, h, 'pap_cream3')
    washi_fibres(t, rng, 10, 0, None, 'pap_cream2', 'pap_cream3')
    t.text(4, 3, 'HAGAKI', 'pap_tink2')
    # divider
    for y in range(10, h - 5):
        t.px(33, y, 'pap_tink2', True)
    # the message, in hand
    lines = ['CHA NO', 'KAORI GA', 'SURU YO', 'MATA NE', '  KO']
    for k, ln in enumerate(lines):
        t.text(4, 11 + k * 6, ln.replace(' ', ''), 'pap_tink0' if k != 4 else 'pap_tink1', rng, True)
    # the stamp: a perforated edge, and the volcano from the front in miniature
    sx, sy, sw, sh = 50, 3, 11, 13
    for y in range(sy, sy + sh):
        for x in range(sx, sx + sw):
            edge = x in (sx, sx + sw - 1) or y in (sy, sy + sh - 1)
            if edge and (x + y) % 2 == 1:
                continue
            t.px(x, y, 'white' if not edge else 'pap_cream2', False)
    for y in range(sy + 2, sy + sh - 2):
        for x in range(sx + 2, sx + sw - 2):
            t.px(x, y, 'red4' if y < sy + 5 else ('red3' if y < sy + 8 else 'red2'))
    for j in range(5):
        for x in range(sx + 5 - j, sx + 6 + j):
            t.px(x, sy + 5 + j, 'indigo2' if x <= sx + 5 else 'indigo1')
    t.px(sx + 5, sy + 5, 'white'); t.px(sx + 4, sy + 6, 'white'); t.px(sx + 5, sy + 6, 'white')
    t.px(sx + 7, sy + 3, 'pap_dusk6')
    # the postmark: a broken ring with the date bar, cancel waves running left over the card
    pcx, pcy = 48, 15
    pts = set()
    for a_ in range(0, 360, 5):
        pts.add((int(math.floor(pcx + 0.5 + 5.2 * math.cos(math.radians(a_)))),
                 int(math.floor(pcy + 0.5 + 5.2 * math.sin(math.radians(a_))))))
    n = vnoise(w, h, 2.0, seed)
    for (x, y) in pts:
        if n[y, x] > 0.22:
            t.px(x, y, 'pap_pmark0', True)
    t.line(pcx - 3, pcy, pcx + 3, pcy, 'pap_pmark0')
    for (x, y) in ((pcx - 2, pcy - 2), (pcx, pcy - 2), (pcx + 2, pcy - 2), (pcx - 1, pcy + 2), (pcx + 1, pcy + 2)):
        t.px(x, y, 'pap_pmark0', True)
    for k in range(3):
        for x in range(36, pcx - 6):
            y = pcy - 3 + k * 3 + [0, 0, -1, -1, 0, 0, 1, 1][x % 8]
            if n[y, x] > 0.18:
                t.px(x, y, 'pap_pmark1', True)
    # address lines with the name written on them
    for k, y in enumerate((26, 32, 38)):
        for x in range(36, w - 4):
            t.px(x, y, 'pap_cream1')
    t.text(38, 21, 'KAI', 'pap_tink0', rng, True)
    t.text(38, 27, 'TOMO', 'pap_tink0', rng, True)
    t.text(46, 33, 'SAMA', 'pap_tink0', rng, True)
    return t


# ================================================================ the four states
def thumbprint(t, cx, cy, angle=0.3, rx=3.2, ry=4.2, seed=0):
    """A muddy thumbprint: concentric ridge arcs, heavier at the pad, the
    paper showing between them."""
    yy, xx = np.mgrid[0:t.h, 0:t.w]
    ca, sa = math.cos(angle), math.sin(angle)
    u = (xx + 0.5 - cx) * ca + (yy + 0.5 - cy) * sa
    v = -(xx + 0.5 - cx) * sa + (yy + 0.5 - cy) * ca
    d = np.sqrt((u / rx) ** 2 + (v / ry) ** 2)
    op = t.a[..., 3] > 0
    ridge = (d < 1.0) & (((d * 3.3 + 0.15 * np.sign(u)) % 1.0) < 0.42) & op
    n = vnoise(t.w, t.h, 1.8, seed)
    ridge &= ~((d > 0.75) & (n < 0.35))
    t.a[ridge, :3] = P('pap_mud1')
    t.a[ridge & (v > ry * 0.3), :3] = P('pap_mud0')
    t.a[ridge & (n > 0.72), :3] = P('pap_mud2')
    smudge = (d >= 1.0) & (d < 1.35) & (v > 0) & (n > 0.5) & op
    shift(t, smudge, -1)
    return ridge


def water_damage(t, cx, cy, rx, ry, seed=0):
    """Water got at it: a brown tide-line round an irregular patch, the paper
    inside cockled, the ink inside run downwards."""
    yy, xx = np.mgrid[0:t.h, 0:t.w]
    n = vnoise(t.w, t.h, 4.0, seed)
    d = np.sqrt(((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2)
    m = (d < 0.85 + (n - 0.5) * 0.7) & (t.a[..., 3] > 0)
    m = clean_mask(m, 2)
    inner = ndimage.binary_erosion(m)
    tide = m & ~inner
    ink = t.ink & inner
    ys, xs = np.nonzero(ink)
    src = t.a.copy()
    for y, x in sorted(zip(ys, xs), key=lambda p: -p[0]):
        for k, st in ((1, 1), (2, 2)):
            if y + k < t.h and inner[y + k, x] and not t.ink[y + k, x]:
                c = step(tuple(int(v) for v in src[y, x, :3]), st)
                t.a[y + k, x, :3] = c
    shift(t, ink, 1)
    cockle = inner & (np.sin((yy + n * 6) * 1.3) > 0.55) & ~t.ink
    shift(t, cockle, -1)
    shift(t, tide, -2)
    shift(t, tide & (n > 0.6), 1)
    return m


def abrade(t, cx, cy, r, seed=0):
    """Where folds cross the paper wears through its sizing: paler, ink gone thin."""
    m = ellipse_mask(t.w, t.h, cx + 0.5, cy + 0.5, r, r * 0.8) & (t.a[..., 3] > 0)
    n = vnoise(t.w, t.h, 1.5, seed)
    m &= n > 0.3
    shift(t, m & t.ink, 2)
    shift(t, m & ~t.ink, 1)


def age_edges(t, depth=3, seed=0, k=-1):
    """Paper browns from the edges in: a ragged band a shade darker."""
    op = t.a[..., 3] > 0
    d = edge_dist(op)
    n = vnoise(t.w, t.h, 3.0, seed)
    band = op & (d <= depth * (0.55 + n)) & ~t.ink
    shift(t, band, k)


def _mirror_xy(t, x):
    return t.w - 1 - x


def _crease_v(t, x, strength=1, seed=0, mirror=False):
    if mirror:
        x = t.w - 1 - x
    return crease(t, [(x, 0), (x, t.h - 1)], light_side=(1 if mirror else -1, 0), strength=strength, wobble_seed=seed)


def _crease_h(t, y, strength=1, seed=0, mirror=False):
    return crease(t, [(0, y), (t.w - 1, y)], light_side=(0, -1), strength=strength, wobble_seed=seed)


def _tear(t, pts, mirror=False, gap=False):
    """A healed or open tear line: dark on one lip, a pale torn fibre on the other."""
    if mirror:
        pts = [(t.w - 1 - x, y) for (x, y) in pts]
    path = []
    for i in range(len(pts) - 1):
        seg = bres(*pts[i], *pts[i + 1])
        path += seg if not path else seg[1:]
    for (x, y) in path:
        if gap:
            t.a[y, x, 3] = 0
        else:
            t.px(x, y, 'pap_ink0' if not t.ink[y, x] else 'pap_ink0')
        if 0 <= x + 1 < t.w:
            p = t.cv.get(x + 1, y)
            if p[3]:
                t.cv.px(x + 1, y, step(p[:3], 1))
    return path


def damage(prop, variant, front, back):
    """Age a prop's two faces in place. variant: hero (the traveller's own,
    lightly used), clean, worn, dirty, repaired. Damage that goes through the
    paper (tears, holes, folds, water) shows on both faces, mirrored."""
    rng = random.Random(hash((prop, variant)) & 0xffff)
    f, b = front, back
    W, H = f.w, f.h
    if variant == 'clean':
        return f, b
    if prop == 'map':
        if variant == 'hero':
            for t, mir in ((f, False), (b, True)):
                _crease_v(t, 36, 1, 3, mir); _crease_v(t, 72, 1, 4, mir); _crease_h(t, 34, 1, 5, mir)
            foxing(f, rng, 9); foxing(b, rng, 12)
            tea_ring(f, 40, 21, 6.5, rng, gap=0.35)
            age_edges(f, 2, 7); age_edges(b, 3, 8)
            g, _ = tear_corner(f, 'tr', (9, 6), rng, 'pap_parch6')
            b.a[g[:, ::-1], 3] = 0
        elif variant == 'worn':
            for t, mir in ((f, False), (b, True)):
                _crease_v(t, 27, 1, 3, mir); _crease_v(t, 54, 1, 4, mir); _crease_v(t, 81, 1, 6, mir)
                _crease_h(t, 34, 1, 5, mir)
            for x in (27, 54, 81):
                abrade(f, x, 34, 3.2, x); abrade(b, W - 1 - x, 34, 3.2, x)
            fade_ink(f, 5, 0.6)
            age_edges(f, 4, 7, -1); age_edges(b, 4, 8, -1)
            foxing(f, rng, 6)
            fray(f, rng, 1.0, 9)
            g, _ = tear_corner(f, 'tr', (12, 9), rng, 'pap_parch6')
            g2, _ = tear_corner(f, 'bl', (6, 5), rng, 'pap_parch6')
            b.a[~(f.a[:, ::-1, 3] > 0), 3] = 0
        elif variant == 'dirty':
            tea_ring(f, 30, 20, 7.5, rng, 0.15, 0.8)
            tea_ring(f, 66, 47, 6.0, rng, 0.3, 0.4)
            thumbprint(f, 7, 58, 0.5, seed=2)
            thumbprint(f, 99, 12, -0.4, seed=3)
            thumbprint(b, W - 1 - 7 - 3, 57, -0.5, seed=4)
            water_damage(f, 88, 52, 15, 12, 6)
            water_damage(b, W - 1 - 88, 52, 15, 12, 6)
            foxing(f, rng, 30, big=0.45); foxing(b, rng, 34, big=0.45)
            age_edges(f, 3, 7); age_edges(b, 3, 8)
        elif variant == 'repaired':
            for t, mir in ((f, False), (b, True)):
                _crease_v(t, 36, 1, 3, mir); _crease_h(t, 34, 1, 5, mir)
            # a rip down from the top edge, taped on the back and the front
            rip = [(52, 0), (51, 4), (53, 8), (52, 12), (54, 16)]
            _tear(f, rip); _tear(b, rip, mirror=True)
            tape(f, 52.5, 7, 6, 15, 0.08)
            tape(b, W - 1 - 52 + 0.5, 8, 7, 17, -0.05)
            # a rip up from the bottom, sewn
            rip2 = [(80, H - 1), (82, H - 6), (81, H - 11)]
            stitch(f, rip2); stitch(b, [(W - 1 - x, y) for x, y in rip2])
            # the bottom-left corner replaced with a patch of newer paper
            pm = poly_mask(W, H, [(0, H - 15), (14, H), (0, H)])
            patch(f, pm, 'paper4', rng, 4)
            patch(b, pm[:, ::-1], 'paper3', rng, 5)
            foxing(f, rng, 5)
            age_edges(f, 2, 7); age_edges(b, 3, 8)
    elif prop == 'ticket':
        if variant == 'hero':
            _crease_v(f, 18, 1, 2); _crease_v(b, 18, 1, 2, True)
            foxing(f, rng, 3, big=0.0); foxing(b, rng, 4, big=0.0)
            age_edges(f, 1, 3)
        elif variant == 'worn':
            _crease_h(f, 13, 1, 2); _crease_h(b, 13, 1, 2, True)
            fade_ink(f, 3, 0.62); fade_ink(b, 4, 0.7)
            age_edges(f, 3, 3); age_edges(b, 3, 4)
            fray(f, rng, 0.8, 5)
            tear_corner(f, 'bl', (6, 5), rng, 'pap_card4')
            b.a[~(f.a[:, ::-1, 3] > 0), 3] = 0
        elif variant == 'dirty':
            tea_ring(f, 30, 17, 7.0, rng, 0.2, 0.7)
            thumbprint(f, 7, 21, 0.4, seed=5)
            thumbprint(b, W - 1 - 7, 21, -0.4, seed=6)
            water_damage(f, 40, 3, 10, 6, 7); water_damage(b, W - 1 - 40, 3, 10, 6, 7)
            foxing(f, rng, 8, big=0.3); foxing(b, rng, 8)
            age_edges(f, 2, 3)
        elif variant == 'repaired':
            rip = [(26, 0), (25, 5), (27, 10), (26, 15), (28, 20), (27, 27)]
            _tear(f, rip); _tear(b, rip, mirror=True)
            tape(b, W - 1 - 26.5, 6, 9, 5, 0.1); tape(b, W - 1 - 27, 20, 9, 5, -0.12)
            tape(f, 26.5, 23, 8, 4, 0.06)
            pm = poly_mask(W, H, [(W - 9, 0), (W, 0), (W, 7)])
            patch(f, pm, 'pap_card4', rng, 3)
            patch(b, pm[:, ::-1], 'pap_card4', rng, 4)
            age_edges(f, 1, 3)
    elif prop == 'pass':
        if variant == 'hero':
            _crease_v(f, 30, 1, 2); _crease_v(b, 30, 1, 2, True)
            foxing(f, rng, 3, big=0.0); age_edges(f, 1, 3)
        elif variant == 'worn':
            _crease_v(f, 30, 1, 2); _crease_v(b, 30, 1, 2, True)
            _crease_h(f, 16, 1, 4); _crease_h(b, 16, 1, 4, True)
            abrade(f, 30, 16, 3, 1)
            fade_ink(f, 3, 0.6); fade_ink(b, 4, 0.65)
            age_edges(f, 3, 3); age_edges(b, 3, 4)
            fray(f, rng, 0.8, 6)
            tear_corner(f, 'tr', (8, 6), rng, 'pap_aqua4')
            b.a[~(f.a[:, ::-1, 3] > 0), 3] = 0
        elif variant == 'dirty':
            tea_ring(f, 38, 14, 7, rng, 0.25, 0.6)
            thumbprint(f, 13, 26, 0.6, seed=7)
            water_damage(f, 26, 28, 14, 6, 8); water_damage(b, W - 1 - 26, 28, 14, 6, 8)
            foxing(f, rng, 10); foxing(b, rng, 10)
            age_edges(f, 2, 3)
        elif variant == 'repaired':
            rip = [(9, 15), (12, 13), (15, 14), (18, 12)]
            stitch(f, rip); stitch(b, [(W - 1 - x, y) for x, y in rip])
            rip2 = [(36, H - 1), (37, H - 6), (35, H - 10)]
            _tear(f, rip2); _tear(b, rip2, mirror=True)
            tape(f, 36.5, H - 6, 7, 9, 0.1)
            pm = poly_mask(W, H, [(W - 10, 0), (W, 0), (W, 8)])
            patch(f, pm, 'pap_aqua4', rng, 5); patch(b, pm[:, ::-1], 'pap_aqua4', rng, 6)
            age_edges(f, 1, 3)
    elif prop == 'postcard':
        border = np.zeros((H, W), bool)
        border[:, :] = True
        border[PC_B:H - PC_B, PC_B:W - PC_B] = False
        if variant == 'hero':
            crease(f, [(W - 12, 0), (W - 1, 11)], (-1, 0), 1, 3)
            crease(b, [(11, 0), (0, 11)], (1, 0), 1, 3)
        elif variant == 'worn':
            _crease_v(f, 32, 1, 2); _crease_v(b, 32, 1, 2, True)
            abrade(f, 32, 22, 3, 2)
            fade = vnoise(W, H, 4, 3) > 0.45
            shift(f, fade & ~border, 1)
            age_edges(f, 4, 3); age_edges(b, 4, 4)
            fade_ink(b, 4, 0.6)
            fray(f, rng, 0.8, 7)
            tear_corner(f, 'bl', (7, 6), rng, 'pap_cream3')
            b.a[~(f.a[:, ::-1, 3] > 0), 3] = 0
        elif variant == 'dirty':
            tea_ring(f, 50, 11, 7.5, rng, 0.2, 0.7)
            tea_ring(b, 18, 30, 7.0, rng, 0.3, 0.5)
            thumbprint(f, 4, 33, 0.3, seed=8)
            thumbprint(b, W - 5, 33, -0.3, seed=9)
            water_damage(f, 14, 38, 16, 8, 9); water_damage(b, W - 1 - 14, 38, 16, 8, 9)
            foxing(f, rng, 10, region=border); foxing(b, rng, 14)
        elif variant == 'repaired':
            rip = [(40, 0), (39, 5), (41, 10), (40, 14)]
            _tear(f, rip); _tear(b, rip, mirror=True)
            tape(b, W - 1 - 40, 6, 6, 13, 0.0)
            tape(f, 40.5, 4, 5, 7, 0.1)
            pm = poly_mask(W, H, [(0, H - 10), (11, H), (0, H)])
            patch(f, pm, 'pap_cream2', rng, 4); patch(b, pm[:, ::-1], 'pap_cream2', rng, 5)
            # the message gone over again in fresh ink
            m = b.ink & (b.a[..., :3] == np.array(P('pap_tink0'))).all(-1)
            sh = np.zeros_like(m)
            sh[:, 1:] = m[:, :-1]
            b.a[sh & ~b.ink & (b.a[..., 3] > 0), :3] = P('pap_tink1')
            foxing(f, rng, 3, region=border)
    return f, b
