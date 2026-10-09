"""NPCs (v3). Customers sit on the far side of the serving counter. A
sprite's body stops at the counter's back edge (sprite row CE); only the
forearms, hands and their shadows reach onto the counter top. That is why
NPCs are drawn after the counter layer.

Style: chunky and simple, like hand-pixelled game NPCs. Clean shapes,
three or four tones per material and a dark outline round every part. A
warm rim of window light catches them from behind, and they cast soft
shadows on the counter. Every mood is a looping 12-frame sheet.

Uncle Pong is an old warrior elephant crossed with the Siamese fireback,
Thailand's national bird:
  - feathered fur in the bird's slate blue, with fine barring
  - the fireback's scarlet face skin round his eyes
  - two glossy black crest-plume ponytails in gold rings
  - Thai warrior dress: gold diadem, pointed forehead plate and spire,
    a krong kor collar over a purple ruffle, a red-and-gold caparison
    vest, flared gold shoulder guards, gold armbands and cuffs, and
    gold-banded tusks."""
import math
import numpy as np
from pixel import Canvas, PAL, col, step
from shade import paint, ellipse_mask, poly_mask

W_, H_ = 150, 184
CE = 152                     # counter's back edge, in sprite rows
NF = 12                      # frames per mood
FUR = ['pong1', 'pong2', 'pong3', 'pong4']
FUR_EAR = ['pong0', 'pong1', 'pong2', 'pong3']
SKIN = ['scarlet1', 'scarlet2', 'scarlet3']
GOLD = ['gold0', 'gold1', 'gold2', 'gold3']
RED = ['red1', 'red2', 'red3', 'red4']
PURP = ['purp0', 'purp1', 'purp2', 'purp3']
IVORY = ['paper2', 'paper3', 'paper4']
PLUME = ['ink', 'pong0', 'indigo1', 'indigo2']
SHADOW = (24, 12, 22)
_L = np.array([-0.55, -0.7, 0.55])
LIGHT_P = _L / np.linalg.norm(_L)
HX0, HY0 = 75, 84            # head centre at rest
BX0 = 75                     # body centre


# ---------------------------------------------------------------- mask helpers
def _clamp_slice(a, b, n):
    return max(0, a), min(n, b)


def _dil(m, n=1):
    out = m.copy()
    for _ in range(n):
        d = out.copy()
        d[1:] |= out[:-1]
        d[:-1] |= out[1:]
        d[:, 1:] |= out[:, :-1]
        d[:, :-1] |= out[:, 1:]
        out = d
    return out


def _shift(m, dx, dy):
    out = np.zeros_like(m)
    h, w = m.shape
    ys0, ys1 = max(0, dy), h + min(0, dy)
    xs0, xs1 = max(0, dx), w + min(0, dx)
    out[ys0:ys1, xs0:xs1] = m[ys0 - dy:ys1 - dy, xs0 - dx:xs1 - dx]
    return out


def E(cx, cy, rx, ry, wob=0.05):
    return ellipse_mask(W_, H_, cx, cy, rx, ry, wobble=wob)


def P(pts):
    return poly_mask(W_, H_, [(int(round(x)), int(round(y))) for x, y in pts])


def _cr(pts, n):
    """Catmull-Rom samples through pts."""
    pts = [pts[0]] + [tuple(p) for p in pts] + [pts[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = (np.array(p, float) for p in pts[i - 1:i + 3])
        for k in range(n):
            t = k / n
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(np.array(pts[-2], float))
    return np.array(out)


def S(pts, r0, r1, n=10):
    """Tapered stroke through control points -> (mask, samples, radii)."""
    c = _cr(pts, n)
    m = np.zeros((H_, W_), bool)
    L = len(c)
    radii = []
    for i, (x, y) in enumerate(c):
        r = r0 + (r1 - r0) * i / max(1, L - 1)
        radii.append(r)
        x0, x1 = _clamp_slice(int(x - r - 1), int(x + r + 2), W_)
        y0, y1 = _clamp_slice(int(y - r - 1), int(y + r + 2), H_)
        if x1 <= x0 or y1 <= y0:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1]
        m[y0:y1, x0:x1] |= (xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= r * r
    return m, c, radii


def _scallop(m, cx, cy, n, depth=1.6, phase=0.0):
    """Cut a feathery, scalloped fringe into the outer edge of a mask."""
    inner = m.copy()
    for _ in range(int(math.ceil(depth))):
        inner = inner & _shift(inner, 1, 0) & _shift(inner, -1, 0) & _shift(inner, 0, 1) & _shift(inner, 0, -1)
    edge = m & ~inner
    yy, xx = np.mgrid[0:H_, 0:W_]
    ang = np.arctan2(yy + 0.5 - cy, xx + 0.5 - cx)
    cut = edge & (np.sin(ang * n + phase) > 0.45)
    return m & ~cut


# ---------------------------------------------------------------- the canvas we build a frame on
class Rig:
    def __init__(self):
        self.cv = Canvas(W_, H_)
        self.solid = np.zeros((H_, W_), bool)

    def part(self, m, ramp, out='ink', R=None, cuts=None, spec=0.0, spec_col=None, amb=0.28, outline=True):
        if not m.any():
            return
        if outline:
            o = _dil(m) & ~m
            self.cv.a[o] = col(out)
            self.solid |= o
        sh = paint(m, ramp, R=R, cuts=cuts, spec=spec, spec_col=spec_col, light=LIGHT_P, amb=amb)
        ma = sh.a[:, :, 3] > 0
        self.cv.a[ma] = sh.a[ma]
        self.solid |= m

    def flat(self, m, c):
        self.cv.a[m] = col(c)
        self.solid |= m

    def darken(self, m, n=1):
        ys, xs = np.nonzero(m & self.solid)
        for y, x in zip(ys, xs):
            self.cv.a[y, x, :3] = step(tuple(self.cv.a[y, x, :3]), -n)

    def lighten(self, m, n=1):
        ys, xs = np.nonzero(m & self.solid)
        for y, x in zip(ys, xs):
            self.cv.a[y, x, :3] = step(tuple(self.cv.a[y, x, :3]), n)

    def px(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < W_ and 0 <= y < H_:
            self.cv.a[y, x] = col(c)
            self.solid[y, x] = True

    def line(self, pts, c, w=1):
        for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
            n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
            for k in range(n + 1):
                t = k / n
                x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
                self.px(x, y, c)
                if w > 1:
                    self.px(x, y + 1, c)

    def shadow(self, cx, cy, rx, ry, alpha):
        """Soft semi-transparent shadow (drawn first, under the body)."""
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if not (0 <= x < W_ and 0 <= y < H_):
                    continue
                d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
                if d <= 1:
                    al = alpha if d < 0.5 else int(alpha * (0.72 if d < 0.8 else 0.45))
                    if self.cv.a[y, x, 3] < al:
                        self.cv.a[y, x] = (*SHADOW, al)


# ---------------------------------------------------------------- poses
TRUNK = {
    'hang':  [(0, 8), (1, 19), (2, 30), (4, 39), (9, 45), (14, 43)],
    'lift':  [(0, 8), (3, 17), (10, 23), (18, 25), (24, 21), (25, 15)],
    'curl':  [(0, 8), (6, 16), (16, 20), (27, 16), (33, 6), (30, -2)],
    'S':     [(0, 8), (-3, 18), (0, 27), (8, 31), (15, 27), (17, 20)],
    'up':    [(0, 8), (4, 16), (13, 18), (23, 12), (30, 1), (33, -9)],
    'droop': [(0, 8), (0, 20), (0, 32), (-1, 43), (-3, 52), (-1, 56)],
}


def _mix(a, b, t):
    return [(xa + (xb - xa) * t, ya + (yb - ya) * t) for (xa, ya), (xb, yb) in zip(TRUNK[a], TRUNK[b])]


def _ease(t):
    return 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, t)))


def pose(mood, f):
    """All the animation parameters of one frame."""
    t = f / NF
    s1 = math.sin(2 * math.pi * t)
    c1 = math.cos(2 * math.pi * t)
    p = dict(by=0, hx=0, hy=0, ear=1.0, ear_drop=0, trunk=list(TRUNK['hang']), sway=0.0,
             mouth=('smile', 0), eyes='open', look=(0, 0), lid=0.0, slant=0.0,
             brow=(0, 0), tail_sway=0.0, tail_lift=0, tail_droop=0,
             hands=(('rest', 0, 0), ('rest', 0, 0)), blush=False, sparkle=None, vein=0, tear=None,
             sweat=False, shock=0)
    breath = 0.5 - 0.5 * c1
    p['by'] = int(round(breath))
    p['hy'] = int(round(0.5 - 0.5 * math.cos(2 * math.pi * (t - 0.08))))
    p['sway'] = s1
    p['tail_sway'] = math.sin(2 * math.pi * (t - 0.18))
    p['ear'] = 1.0 + 0.05 * math.sin(2 * math.pi * (t - 0.1))
    if mood == 'idle':
        tr = [(x + s1 * 1.5 * (y - 8) / 45, y) for x, y in TRUNK['hang']]
        p['trunk'] = tr
        p['look'] = (1, 0) if f < 6 else (-1, 0)
        p['lid'] = 0.16
        p['brow'] = (-1, 1)
        if f == 8 or f == 10:
            p['eyes'], p['lid'] = 'open', 0.6
        elif f == 9:
            p['eyes'] = 'closed'
    elif mood == 'talk':
        opens = [0.2, 0.9, 0.5, 1.0, 0.3, 0.8, 0.0, 0.7, 1.0, 0.4, 0.8, 0.1]
        o = opens[f]
        p['mouth'] = ('open', o)
        tr = _mix('hang', 'lift', 0.75 + 0.25 * o)
        p['trunk'] = [(x + s1, y) for x, y in tr]
        p['hy'] = int(round(o * 1.2))
        p['brow'] = (-3, -1) if o > 0.85 else (-1, 1)
        p['look'] = (0, 0)
        p['lid'] = 0.22
        if f == 6:
            p['lid'] = 0.6
        p['hands'] = (('rest', 0, 0), ('open', 2, -7 if 2 <= f <= 7 else -3))
    elif mood == 'happy':
        p['eyes'] = 'happy'
        p['mouth'] = ('laugh', 1.0 if f % 4 < 2 else 0.75)
        bounce = abs(math.sin(2 * math.pi * t * 2))
        p['by'] = -int(round(bounce * 2))
        p['hy'] = -int(round(bounce * 3))
        p['trunk'] = [(x + s1 * 2 * (y + 2) / 20, y) for x, y in TRUNK['curl']]
        p['ear'] = 1.08 + 0.14 * math.sin(2 * math.pi * t * 2)
        p['brow'] = (-3, -2)
        p['tail_lift'] = -int(round(bounce * 4))
        p['tail_sway'] = math.sin(2 * math.pi * (t * 2 - 0.15))
        p['blush'] = True
        p['sparkle'] = f % 6
        clap = f % 6
        hx = [0, 6, 12, 6, 0, 0][clap]
        p['hands'] = (('open', hx, -4 - hx // 3), ('open', -hx, -4 - hx // 3))
    elif mood == 'angry':
        p['eyes'] = 'angry'
        p['lid'] = 0.32
        p['slant'] = 1.0
        p['mouth'] = ('grit', 0)
        p['trunk'] = [(x + (1 if f % 2 else -1) * 0.6 * (y - 8) / 30, y) for x, y in TRUNK['S']]
        p['ear'] = 1.28 + 0.03 * (1 if f % 2 else -1)
        p['brow'] = (7, -5)
        p['hx'] = (1 if f % 2 else -1) if f in (5, 6, 7, 8) else 0
        p['vein'] = 1 + (f % 4 < 2)
        p['tail_sway'] = 0.3 * math.sin(2 * math.pi * t * 3)
        p['tail_lift'] = -3
        slam = {5: -8, 6: 0, 7: 0}.get(f, -2 if f in (3, 4) else 0)
        p['hands'] = (('fist', 0, 0), ('fist', 0, slam))
        p['look'] = (0, 1)
    elif mood == 'surprised':
        p['eyes'] = 'wide'
        k = _ease(f / 3) if f < 3 else 1.0
        p['mouth'] = ('O', k)
        p['trunk'] = _mix('hang', 'up', k)
        p['trunk'] = [(x + (0.6 if f % 2 else -0.6), y) for x, y in p['trunk']]
        p['ear'] = 1.0 + 0.25 * k
        p['brow'] = (-int(round(5 * k)), -int(round(4 * k)))
        p['hy'] = -int(round(3 * k))
        p['by'] = -int(round(2 * k))
        p['tail_lift'] = -int(round(8 * k))
        p['tail_sway'] = 0.6 * math.sin(2 * math.pi * t * 3) * (1 - 0.5 * k)
        p['sweat'] = f >= 3
        p['shock'] = 1 if f >= 2 and f % 2 == 0 else (2 if f >= 2 else 0)
        p['hands'] = (('open', 2, -int(round(10 * k))), ('open', -2, -int(round(10 * k))))
    elif mood == 'sad':
        p['eyes'] = 'open'
        p['lid'] = 0.42
        p['slant'] = -1.0
        p['look'] = (0, 2)
        if f == 9:
            p['eyes'] = 'closed'
        p['mouth'] = ('frown', 0)
        p['trunk'] = [(x + s1 * 0.8 * (y - 8) / 50, y) for x, y in TRUNK['droop']]
        p['ear'] = 0.86
        p['ear_drop'] = 6
        p['brow'] = (-4, 3)
        p['hy'] = 2 + int(round(breath))
        p['tail_droop'] = 10
        p['tail_sway'] = 0.4 * math.sin(2 * math.pi * (t - 0.2))
        p['tear'] = f
        p['hands'] = (('rest', 2, 1), ('rest', -2, 1))
    elif mood == 'sip':
        k = [0, 0.15, 0.45, 0.8, 1, 1, 1, 1, 0.8, 0.45, 0.15, 0][f]
        k = _ease(k)
        p['trunk'] = [(x + s1 * 0.6, y) for x, y in _mix('hang', 'curl', min(1.0, k * 1.3))]
        p['lid'] = 0.2
        p['brow'] = (-1, 1)
        if k > 0.95:
            p['eyes'] = 'closed'
        elif f in (8, 9):
            p['eyes'] = 'happy'
            p['blush'] = True
        p['look'] = (-1, 1)
        tx, ty = (HX0 + 3) - (BX0 + 23), (HY0 + 34) - (CE + 11)      # cup up to the mouth
        p['hands'] = (('rest', 0, 0), ('cup', int(round(tx * k)), int(round(ty * k))))
        p['steam'] = f
    return p


# ---------------------------------------------------------------- face features
def _eye(rig, cx, cy, kind, look, side, lid, slant):
    if kind == 'closed':
        for dx in range(-4, 5):
            y = cy + 1 + int(round(1.2 * (1 - (dx / 4.5) ** 2)))
            rig.px(cx + dx, y, 'ink')
        rig.px(cx + side * 5, cy + 1, 'ink')                 # lash at the outer corner
        return
    if kind == 'happy':
        for dx in range(-4, 5):
            y = cy + 1 - int(round(2.4 * (1 - (dx / 4.5) ** 2)))
            rig.px(cx + dx, y, 'ink')
            rig.px(cx + dx, y + 1, 'ink')
        return
    rx, ry = (5.0, 6.2) if kind == 'wide' else (4.2, 5.2)
    white = E(cx, cy, rx, ry, wob=0.0)
    ring = _dil(white) & ~white
    rig.flat(ring, 'ink')
    rig.flat(white, 'cloud3')
    rig.flat(white & _shift(white, 0, -2) & ~_shift(white, 0, 2), 'cloud2')   # shade under the lid
    pw, ph = (2, 3) if kind in ('wide', 'angry') else (3, 4)
    px0 = cx - pw // 2 + look[0] + (0 if kind != 'wide' else 0)
    py0 = cy - ph // 2 + look[1]
    pupil = np.zeros_like(white)
    pupil[max(0, py0):py0 + ph, max(0, px0):px0 + pw] = True
    pupil &= white
    rig.flat(pupil, 'ink')
    rig.px(px0, py0, 'white')
    if kind != 'wide':
        rig.px(px0 + pw - 1, py0 + ph - 1, 'pong3')
    # upper lid (skin) and lash line; slant > 0 = angry (inner side low)
    if lid > 0 or slant:
        yy, xx = np.mgrid[0:H_, 0:W_]
        inner = -side                                       # towards the face centre
        edge = cy - ry + lid * 2 * ry + slant * 2.2 * (xx + 0.5 - cx) * inner / rx
        cover = white & (yy + 0.5 < edge)
        rig.flat(cover, 'scarlet2')
        lash = white & ~cover & _shift(cover, 0, 1)
        rig.flat(lash, 'ink')
        rig.flat(_shift(lash, 0, -1) & cover, 'scarlet1')
    top = ring & (np.mgrid[0:H_, 0:W_][0] < cy - ry * 0.4)
    rig.flat(_shift(top, 0, -1) & ~white, 'ink')              # heavier upper lash line
    rig.px(cx + side * (rx + 1), cy - ry * 0.5, 'ink')       # wing of the lash


def _brow(rig, hx, hy, side, brow):
    inner, outer = brow
    pts = [(hx + side * 4, hy - 8 + inner), (hx + side * 11, hy - 10 + (inner + outer) / 2 - 1),
           (hx + side * 19, hy - 8 + outer)]
    m, _, _ = S(pts, 3.0, 1.5, n=6)
    rig.flat(m, 'ink')
    rig.flat(m & ~_shift(m, 0, 1), 'pong1')                  # a lit top edge so it reads on dark fur
    tip = pts[-1]
    rig.px(tip[0] + side, tip[1] + 1, 'ink')                  # feathered tip
    rig.px(tip[0] + side * 2, tip[1] + 2, 'pong0')


def _mouth(rig, mx, my, kind, o):
    hw = 13
    if kind == 'smile':
        for dx in range(-hw, hw + 1):
            y = my + 1 - int(round(2.6 * (dx / hw) ** 2))
            rig.px(mx + dx, y, 'ink')
        for s in (-1, 1):
            rig.px(mx + s * (hw + 1), my - 2, 'ink')
        return
    if kind == 'frown':
        for dx in range(-hw + 2, hw - 1):
            y = my + 2 + int(round(2.4 * (dx / hw) ** 2)) - 2 + (1 if dx % 5 == 0 else 0)
            rig.px(mx + dx, y - 1, 'ink')
        return
    if kind == 'grit':
        top, bot = my - 2, my + 4
        for dx in range(-hw + 1, hw):
            curve = int(round(1.5 * (dx / hw) ** 2))
            for y in range(top + curve, bot - curve + 1):
                rig.px(mx + dx, y, 'paper4' if y < (top + bot) // 2 + 1 else 'paper3')
            rig.px(mx + dx, top + curve - 1, 'ink'); rig.px(mx + dx, bot - curve + 1, 'ink')
            if (dx + hw) % 4 == 0:
                for y in range(top + curve, bot - curve + 1):
                    rig.px(mx + dx, y, 'paper1')
        for s in (-1, 1):
            rig.px(mx + s * hw, my + 1, 'ink'); rig.px(mx + s * (hw + 1), my + 3, 'ink')
        rig.line([(mx - hw + 1, my + 1), (mx + hw - 1, my + 1)], 'paper1')
        return
    if kind == 'O':
        rx, ry = 4 + 2 * o, 3 + 4 * o
        m = E(mx, my + 3 + 2 * o, rx, ry, wob=0.0)
        rig.flat(_dil(m) & ~m, 'ink')
        rig.flat(m, 'red0')
        rig.flat(m & ~_shift(m, 0, -2), 'scarlet2')
        return
    # open / laugh: top edge a smile, a dark mouth with a tongue
    depth = 2 + 9 * o if kind == 'open' else 6 + 8 * o
    hw2 = hw + (2 if kind == 'laugh' else 0)
    m = np.zeros((H_, W_), bool)
    for dx in range(-hw2, hw2 + 1):
        u = dx / hw2
        y0 = my - int(round((2.6 if kind == 'open' else 1.2) * u * u))
        y1 = y0 + int(round(depth * (1 - u * u) ** 0.8))
        for y in range(y0, y1 + 1):
            if 0 <= mx + dx < W_ and 0 <= y < H_:
                m[y, mx + dx] = True
    rig.flat(_dil(m) & ~m, 'ink')
    rig.flat(m, 'red0')
    tongue = m & E(mx + 2, my + depth * 0.8 + 1, hw2 * 0.55, depth * 0.45, wob=0.0)
    rig.flat(tongue, 'scarlet3')
    rig.flat(tongue & _shift(tongue, 0, 1) & ~_shift(tongue, 0, -1), 'scarlet2')
    if kind == 'laugh':
        rig.flat(m & ~_shift(m, 0, 2) & (np.mgrid[0:H_, 0:W_][0] < my + 2), 'paper4')   # upper gum shine


# ---------------------------------------------------------------- Uncle Pong
def uncle_pong(mood, f):
    p = pose(mood, f)
    rig = Rig()
    by = p['by']
    hx, hy = HX0 + p['hx'], HY0 + p['hy'] + max(0, by)
    if by < 0:
        hy += by
    bx = BX0 + p['hx'] // 2
    yy, xx = np.mgrid[0:H_, 0:W_]
    above = yy < CE

    # -------- soft shadows on the counter top (window light from behind)
    rig.shadow(bx, CE + 2, 50, 7, 92)
    hand_pos = []
    for i, s in enumerate((-1, 1)):
        kind, dx, dy = p['hands'][i]
        hpx, hpy = bx + s * 23 + dx, CE + 11 + dy
        hand_pos.append((kind, hpx, hpy))
        lift = max(0, -dy)
        if lift < 30:
            rig.shadow(hpx + 2 - dx * 0.3, CE + 18, 12 - lift * 0.2, 3.6, int(120 * (1 - lift / 30)))

    # -------- crest-plume ponytails (behind everything)
    tails = np.zeros((H_, W_), bool)
    rings = []
    quills, tufts = [], []
    for s in (-1, 1):
        base = (hx + s * 10, hy - 31)
        rings.append(base)
        lift = p['tail_lift']
        droop = p['tail_droop']
        knot = (hx + s * 19, hy - 47 + lift * 0.5)
        m, _, _ = S([base, (hx + s * 13, hy - 41 + lift * 0.3), knot], 4.6, 3.6, n=6)   # the tied bundle
        tails |= m
        for j in range(5):                                  # quills fanning out, tufted tips
            sw = p['tail_sway'] * (2.4 + j * 0.9) * s
            ang = math.radians(-78 + j * 26)                 # from up to out-and-down
            L = 24 + (3 - abs(j - 2)) * 5
            ex_ = knot[0] + s * math.cos(ang) * L * 1.15 + sw
            ey_ = knot[1] + math.sin(ang) * L * 0.85 + droop * (0.5 + j * 0.2) + lift * 0.4 + abs(sw) * 0.3
            mid = (knot[0] + s * math.cos(ang - 0.35) * L * 0.55 + sw * 0.4,
                   knot[1] + math.sin(ang - 0.35) * L * 0.5 + lift * 0.2)
            q, qc, _ = S([knot, mid, (ex_, ey_)], 1.5, 1.2, n=9)
            quills.append(q)
            dx, dy = qc[-1] - qc[-4]
            n = math.hypot(dx, dy) or 1
            tcx, tcy = ex_ + dx / n * 2.5, ey_ + dy / n * 2.5
            tm, _, _ = S([(ex_ - dx / n, ey_ - dy / n), (tcx, tcy), (tcx + dx / n * 3.5, tcy + dy / n * 3.5)],
                         2.2, 3.4, n=4)
            tm |= S([(tcx, tcy), (tcx + dx / n * 5, tcy + dy / n * 5)], 3.4, 0.8, n=4)[0]
            tufts.append(tm)
    allq = tails.copy()
    for q in quills:
        allq |= q
    for t_ in tufts:
        allq |= t_
    rig.flat(_dil(allq) & ~allq, 'ink')
    for q in quills:
        rig.flat(q, 'pong0')
    rig.part(tails, PLUME, outline=False, R=4, spec=0.14, spec_col='indigo3', amb=0.38)
    for t_ in tufts:
        rig.part(t_, PLUME, outline=False, R=3, spec=0.2, spec_col='indigo3', amb=0.4)
    tails = allq

    # -------- ears (fanned, with a feathered fringe)
    ears = []
    for s in (-1, 1):
        sp = p['ear']
        dr = p['ear_drop']
        pts = [(hx + s * 18, hy - 19), (hx + s * 32, hy - 26), (hx + s * 47 * sp, hy - 23 + dr * 0.2),
               (hx + s * 57 * sp, hy - 8 + dr * 0.4), (hx + s * 56 * sp, hy + 8 + dr * 0.6),
               (hx + s * 48 * sp, hy + 22 + dr), (hx + s * 36 * sp, hy + 31 + dr), (hx + s * 24, hy + 20)]
        m = P(pts) | E(hx + s * 45 * sp, hy - 8 + dr * 0.4, 13 * sp, 16, wob=0.05)
        m &= (xx - hx) * s > 14
        m = _scallop(m, hx + s * 30, hy + 2, 26, depth=1.6, phase=1.0 + s)
        ears.append(m)
        rig.part(m, FUR, out='ink', R=10, amb=0.3)
        ipts = [(hx + s * 24, hy - 13), (hx + s * 34, hy - 18), (hx + s * 45 * sp, hy - 15 + dr * 0.2),
                (hx + s * 51 * sp, hy - 4 + dr * 0.4), (hx + s * 49 * sp, hy + 9 + dr * 0.6),
                (hx + s * 42 * sp, hy + 19 + dr), (hx + s * 33 * sp, hy + 23 + dr), (hx + s * 25, hy + 14)]
        inner = P(ipts) & m
        rig.part(inner, ['pong1', 'pong2', 'pong2'], outline=False, R=6, amb=0.3)
        rig.flat(_dil(inner) & ~inner & m & ((xx - hx) * s > 26), 'pong1')
        for k in range(4):                                  # barring, like the bird's plumage
            ey = hy - 8 + k * 8 + dr * 0.5
            for dx in range(-2, 3):
                x = hx + s * (42 + dx) * sp
                y = ey + abs(dx) * 0.6
                if inner[int(y), int(x)]:
                    rig.px(x, y, 'pong2')
        # gold chain tassel off the ear
        tx, ty = hx + s * 27 * sp, hy + 27 + dr
        for k in range(6):
            rig.px(tx + s * (k % 2), ty + k * 2, 'gold3' if k % 2 else 'gold1')
        rig.px(tx, ty + 13, 'scarlet3'); rig.px(tx + s, ty + 13, 'scarlet2'); rig.px(tx, ty + 14, 'scarlet1')

    # -------- body: caparison vest cut at the counter edge
    top = CE - 34 + by
    torso = P([(bx - 34, top), (bx + 34, top), (bx + 44, top + 14), (bx + 46, CE + 2), (bx - 46, CE + 2),
               (bx - 44, top + 14)]) & above
    rig.part(torso, RED, out='red0', R=14, amb=0.3)
    band_y = CE - 11
    band = torso & (yy >= band_y) & (yy < band_y + 7)
    rig.part(band, GOLD, out='wood0', R=3, outline=False)
    rig.flat(torso & (yy == band_y - 1), 'wood0')
    for k in range(-44, 45, 8):                              # diamonds on the band
        cx_ = bx + k
        for d in range(3):
            for ddx in range(-d, d + 1):
                if band[band_y + 1 + d, cx_ + ddx] if 0 <= cx_ + ddx < W_ else False:
                    rig.px(cx_ + ddx, band_y + 1 + d, 'scarlet2' if d < 2 else 'gold3')
                    rig.px(cx_ + ddx, band_y + 5 - d, 'scarlet2' if d < 2 else 'gold3')
    for s in (-1, 1):                                        # gold trim down the front edges
        rig.line([(bx + s * 18, top + 6), (bx + s * 21, band_y - 1)], 'gold2')
        rig.line([(bx + s * 19, top + 6), (bx + s * 22, band_y - 1)], 'gold1')
    # upper arms
    arms = []
    for s in (-1, 1):
        m, _, _ = S([(bx + s * 36, top + 6), (bx + s * 42, top + 18), (bx + s * 43, CE)], 9, 8, n=6)
        m &= above
        arms.append(m)
        rig.part(m, FUR, out='pong0', R=9)
        band = m & (yy >= top + 22) & (yy < top + 26)
        rig.part(band, GOLD, outline=False, R=2)
        rig.flat(m & (yy == top + 26), 'wood0')
    # purple ruffle + gold collar (krong kor)
    ruff = E(bx, top + 6, 31, 12, wob=0.0)
    ruff = _scallop(ruff, bx, top - 4, 28, depth=1.5)
    rig.part(ruff, PURP, out='purp0', R=6)
    collar = E(bx, top + 1, 23, 8, wob=0.0)
    rig.part(collar, GOLD, out='wood0', R=6, spec=0.08, spec_col='gold4')
    for k in range(-18, 19, 6):                              # petals with gems
        px_, py_ = bx + k, top + 1 + int(8 * math.sqrt(max(0, 1 - (k / 23) ** 2)))
        rig.px(px_, py_ + 1, 'gold2'); rig.px(px_ - 1, py_, 'gold2'); rig.px(px_ + 1, py_, 'gold2')
        rig.px(px_, py_ + 2, 'wood0')
        rig.px(px_, py_ - 3, 'scarlet3' if k % 12 == 0 else 'gold3')
    # flared shoulder guards with curled tips
    for s in (-1, 1):
        plate = P([(bx + s * 27, top), (bx + s * 42, top - 2), (bx + s * 50, top + 4), (bx + s * 47, top + 12),
                   (bx + s * 30, top + 9)])
        curl, _, _ = S([(bx + s * 47, top + 1), (bx + s * 53, top - 4), (bx + s * 54, top - 10),
                        (bx + s * 50, top - 13)], 2.4, 1.5, n=6)
        g = plate | curl
        rig.part(g, GOLD, out='wood0', R=4, spec=0.1, spec_col='gold4')
        rig.px(bx + s * 39, top + 4, 'scarlet3'); rig.px(bx + s * 40, top + 4, 'scarlet2')
        rig.px(bx + s * 39, top + 5, 'scarlet1'); rig.px(bx + s * 40, top + 5, 'scarlet1')
        rig.line([(bx + s * 30, top + 8), (bx + s * 46, top + 11)], 'gold1')

    # -------- head
    head = (E(hx, hy - 2, 31, 26) | E(hx - 11, hy - 19, 16, 12) | E(hx + 11, hy - 19, 16, 12) |
            E(hx - 16, hy + 11, 16, 13) | E(hx + 16, hy + 11, 16, 13) | E(hx, hy + 19, 15, 9))
    body_now = rig.solid.copy()
    rig.part(head, FUR, out='pong0', R=20, spec=0.04, spec_col='pong5', amb=0.3)
    rig.darken(_shift(head, 0, 4) & ~head & body_now & ~tails)            # head shadow on collar + vest
    for (dx, dy) in ((-22, -6), (-14, -19), (-3, -26), (9, -24), (21, -12), (25, 3), (-26, 6), (0, -14),
                     (14, -10), (-12, -8), (-25, 16), (26, 15)):        # plumage barring
        x, y = hx + dx, hy + dy
        rig.px(x - 1, y - 1, 'pong2'); rig.px(x, y, 'pong2'); rig.px(x + 1, y - 1, 'pong2')
    # spire (chada) between the plume rings
    spire = P([(hx, hy - 55), (hx + 3, hy - 47), (hx + 7, hy - 33), (hx - 7, hy - 33), (hx - 3, hy - 47)])
    rig.part(spire, GOLD, out='wood0', R=3, spec=0.15, spec_col='gold4')
    for ty in (hy - 47, hy - 41, hy - 36):
        rig.line([(hx - 5 + (hy - 33 - ty) // 3, ty), (hx + 5 - (hy - 33 - ty) // 3, ty)], 'gold0')
    rig.px(hx, hy - 39, 'scarlet3'); rig.px(hx, hy - 38, 'scarlet1')
    for (rx_, ry_) in rings:                                 # gold rings binding the plumes
        r = E(rx_, ry_ - 1, 3.6, 3.0, wob=0.0)
        rig.part(r, GOLD, out='wood0', R=2, spec=0.2, spec_col='gold4')
    # diadem across the forehead + pointed forehead plate
    for x in range(hx - 29, hx + 30):
        u = (x - hx) / 29
        y = int(round(hy - 20 + 4 * (1 - u * u)))
        if head[y, x]:
            rig.px(x, y - 1, 'wood0'); rig.px(x, y, 'gold3'); rig.px(x, y + 1, 'gold2'); rig.px(x, y + 2, 'gold1')
            rig.px(x, y + 3, 'wood0')
            if (x - hx) % 4 == 0:
                rig.px(x, y + 1, 'gold4')
    plate = P([(hx - 7, hy - 16), (hx + 7, hy - 16), (hx, hy - 4)])
    rig.part(plate, GOLD, out='wood0', R=3, spec=0.2, spec_col='gold4')
    rig.px(hx, hy - 12, 'scarlet3'); rig.px(hx - 1, hy - 12, 'scarlet2'); rig.px(hx, hy - 11, 'scarlet1')
    rig.px(hx - 1, hy - 11, 'scarlet1')

    # -------- the fireback's scarlet face skin round the eyes
    ex = 14
    ey = hy + 2
    for s in (-1, 1):
        patch = E(hx + s * (ex + 1), ey, 9.5, 8, wob=0.08) | E(hx + s * (ex + 8), ey + 2, 5.5, 4.5, wob=0.0)
        rig.part(patch, SKIN, out='scarlet0', R=5, spec=0.12, spec_col='scarlet4', amb=0.35)
    # mouth (under the trunk) and tusks
    mx, my = hx, hy + 21
    kind, o = p['mouth']
    _mouth(rig, mx, my, kind, o)
    for s in (-1, 1):
        tm, tc, _ = S([(mx + s * 9, my + 1), (mx + s * 13, my + 6), (mx + s * 15, my + 11), (mx + s * 14, my + 14)],
                      2.4, 1.2, n=5)
        rig.part(tm, IVORY, out='paper0', R=2)
        rig.px(mx + s * 13, my + 6, 'gold2'); rig.px(mx + s * 14, my + 6, 'gold1'); rig.px(mx + s * 12, my + 6, 'gold3')
        rig.px(mx + s * 14, my + 14, 'gold3')
    # eyes + brows
    for s in (-1, 1):
        _eye(rig, hx + s * ex, ey, p['eyes'], p['look'], s, p['lid'], p['slant'])
        _brow(rig, hx, ey - 3, s, p['brow'])

    # -------- trunk (in front of the mouth)
    pts = [(hx + x, hy + y) for x, y in p['trunk']]
    tm, tc, tr = S(pts, 7.0, 3.3, n=8)
    rig.part(tm, FUR, out='pong0', R=6, amb=0.32)
    for i in range(4, len(tc) - 3, 4):                       # wrinkles across the trunk
        (x0, y0), (x1, y1) = tc[i - 1], tc[i + 1]
        dx, dy = x1 - x0, y1 - y0
        n = math.hypot(dx, dy) or 1
        nx, ny = -dy / n, dx / n
        r = tr[i] * 0.7
        for k in np.linspace(-r, r, int(r * 2) + 1):
            x, y = tc[i][0] + nx * k, tc[i][1] + ny * k + 0.6
            if tm[int(y), int(x)]:
                rig.px(x, y, 'pong1')
    tip = tc[-1]
    rig.px(tip[0], tip[1], 'pong0'); rig.px(tip[0] + 1, tip[1], 'pong0')        # nostril
    rig.px(tip[0], tip[1] + 1, 'scarlet1')

    # -------- forearms + hands on the counter
    cup_keep = np.zeros((H_, W_), bool)
    for i, s in enumerate((-1, 1)):
        kind, hpx, hpy = hand_pos[i]
        fa, _, _ = S([(bx + s * 43, CE - 4), (bx + s * 38, CE + 5), (hpx + s * 4, hpy - 2)], 8, 6.8, n=6)
        rig.part(fa, FUR, out='pong0', R=7)
        if kind == 'cup':
            import teaware as TW
            cup = TW.yunomi('matcha', w=16, h=21, seed=7)
            cx0, cy0 = hpx - cup.w // 2 + 1, hpy - cup.h + 4
            ca = cup.a[:, :, 3] > 0
            ys, xs = np.nonzero(ca)
            for y, x in zip(ys, xs):
                X, Y = cx0 + x, cy0 + y
                if 0 <= X < W_ and 0 <= Y < H_:
                    rig.cv.a[Y, X] = cup.a[y, x]
                    rig.solid[Y, X] = True
                    cup_keep[Y, X] = True
            if p.get('steam') is not None and hpy > CE - 5:
                st = p['steam']
                for j in range(7):                          # a thin curl of steam
                    sx = cx0 + cup.w // 2 + int(round(1.5 * math.sin(j * 0.9 + st * 0.8)))
                    sy = cy0 - 2 - j * 2
                    if (j + st) % 3:
                        rig.px(sx, sy, 'cloud3' if j < 4 else 'cloud2')
            kind = 'open'
        cuff = fa & E(hpx + s * 6, hpy - 3, 8, 7, wob=0.0) & ~E(hpx, hpy, 9, 7, wob=0.0)
        rig.part(cuff, GOLD, outline=False, R=2, spec=0.2, spec_col='gold4')
        if kind == 'fist':
            hm = E(hpx, hpy, 8.5, 7, wob=0.04)
        elif kind == 'open':
            hm = E(hpx, hpy, 9.5, 6.5, wob=0.04) | E(hpx - s * 7, hpy - 3, 3.2, 3.6, wob=0.0)
        else:
            hm = E(hpx, hpy + 1, 10, 6, wob=0.04)
        rig.part(hm, FUR, out='pong0', R=5)
        for k in (-1, 0, 1):                                 # fingers + ivory nails
            fx_ = hpx + k * 4 + s
            fy_ = hpy + (4 if kind != 'fist' else 3)
            rig.px(fx_ - 2, fy_ - 2, 'pong1')
            rig.px(fx_, fy_, 'paper4'); rig.px(fx_ + 1, fy_, 'paper3')
            rig.px(fx_, fy_ + 1, 'paper0')
        if kind == 'fist':
            rig.line([(hpx - 6, hpy - 1), (hpx + 6, hpy - 1)], 'pong1')

    # -------- mood marks
    if p['blush']:
        for s in (-1, 1):
            for k in range(3):
                bx0, by0 = hx + s * 21 + k * 2, hy + 13
                rig.px(bx0, by0, 'pink3'); rig.px(bx0 + 1, by0 - 1, 'pink2')
    if p['sparkle'] is not None:
        k = p['sparkle']
        for (sx, sy, ph) in ((hx - 44, hy - 30, 0), (hx + 46, hy - 22, 3), (hx + 30, hy - 58, 1)):
            r = [0, 1, 2, 1, 0, 0][(k + ph) % 6]
            if r:
                for d in range(-r, r + 1):
                    rig.px(sx + d, sy, 'gold4'); rig.px(sx, sy + d, 'gold4')
                rig.px(sx, sy, 'white')
    if p['vein']:                                           # anger mark, pulsing
        vx, vy = hx + 19, hy - 25
        big = p['vein'] > 1
        mark = ['..X.X..', '.XX.XX.', 'XX...XX', '.......', 'XX...XX', '.XX.XX.', '..X.X..'] if big else \
            ['.X.X.', 'XX.XX', '.....', 'XX.XX', '.X.X.']
        o = len(mark) // 2
        for j, row in enumerate(mark):
            for i, ch in enumerate(row):
                if ch == 'X':
                    rig.px(vx + i - o, vy + j - o, 'scarlet3' if (i + j) % 3 else 'scarlet4')
    if p['tear'] is not None:
        tf_ = p['tear']
        tx = hx - ex + 2
        ty = ey + 7 + tf_ * 2
        if tf_ < 10:
            for (dx, dy, c) in ((0, 0, 'sky4'), (0, 1, 'sky3'), (-1, 1, 'sky3'), (1, 1, 'sky2'), (0, 2, 'sky2'),
                                (0, -1, 'white')):
                rig.px(tx + dx, ty + dy, c)
        rig.px(hx + ex - 2, ey + 5, 'sky4'); rig.px(hx + ex - 1, ey + 5, 'sky3')      # welling up
        rig.px(hx + ex - 2, ey + 6, 'sky2')
    if p['sweat']:
        sx, sy = hx + 30, hy - 20
        for (dx, dy, c) in ((0, 0, 'sky4'), (0, 1, 'sky3'), (-1, 2, 'sky3'), (0, 2, 'sky3'), (1, 2, 'sky2'),
                            (-1, 3, 'sky2'), (0, 3, 'sky2'), (1, 3, 'sky1'), (0, 4, 'sky1')):
            rig.px(sx + dx, sy + dy, c)
        rig.px(sx - 1, sy + 1, 'white')
    if p['shock']:
        r0 = 40 + p['shock'] * 2
        for a in (-2.5, -2.0, -1.2, -0.6):
            for k in range(4):
                rig.px(hx + math.cos(a) * (r0 + k), hy - 18 + math.sin(a) * (r0 * 0.8 + k), 'paper4')

    # -------- rim light from the window behind (top edges of the silhouette)
    sol = rig.cv.a[:, :, 3] == 255
    rim = sol & ~_shift(sol, 0, 1) & (yy < CE - 20)
    rig.lighten(rim, 1)
    rig.lighten(rim & ~_shift(sol, 0, 2), 1)
    # nothing of the body below the counter edge except arms, hands and shadow
    keep = np.zeros((H_, W_), bool)
    for i, s in enumerate((-1, 1)):
        kind, hpx, hpy = hand_pos[i]
        fa, _, _ = S([(bx + s * 43, CE - 4), (bx + s * 38, CE + 5), (hpx + s * 4, hpy - 2)], 9.5, 8.3, n=6)
        keep |= fa | E(hpx, hpy, 12, 9, wob=0.0)
    keep |= cup_keep | _dil(cup_keep)
    kill = (yy >= CE) & sol & ~keep
    rig.cv.a[kill] = 0
    return rig.cv


MOODS = ['idle', 'talk', 'happy', 'angry', 'surprised', 'sad', 'sip']


def sheets():
    return {m: [uncle_pong(m, f) for f in range(NF)] for m in MOODS}


# ---------------------------------------------------------------- registration
from propkit import prop                                    # noqa: E402
from layout import COUNTER                                  # noqa: E402


@prop('uncle_pong', 2, 'npc', 960 - W_ // 2, COUNTER['back'] - CE,
      'Uncle Pong, warrior elephant x Siamese fireback. Moods: idle (blinks), talk, happy, angry, surprised, sad, '
      'sip (12 frames each). Draw after the counter layer; his body stops at the counter edge.',
      fps=8, shadow='none')
def uncle_pong_prop():
    return sheets()
