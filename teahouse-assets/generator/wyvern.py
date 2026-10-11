"""The old goat-dragon who lives outside the tea-room window, drawn by hand.

The head is drawn the way a painter would build it, and every stage is
kept so the drawing process can be shown:

  1 construction  cranium circle, muzzle box, head axis, eye line, neck and horn gestures
  2 sketch        loose pencil outlines over the construction, shadow hatching
  3 line art      clean ink outlines of every part and the key inner lines
  4 flats         local colour per material: white fur, a creamy beard, old horn, a bare
                  pink nose, grey dragon scales, an amber eye
  5 shading       light from the upper left: planes with rounded edges, the round cheek,
                  cast shadows under the brow, the horns, the head and the ear
  6 texture       long fur strokes that follow the lie of the hair, beard strands, growth
                  rings across the horns, fine scales on the dragon parts
  7 final         lines folded into the colours (darker only on the shadow side), contact
                  shadows, worn highlights on the horns, a cool sky rim from behind

Half goat, half dragon. The head is a goat's, held nose-down: a long face with
a gently roman nose, a bare pink muzzle with slit nostrils, a round cheek, a
floppy ear, ridged horns rising from the poll and sweeping back, a goatee, and
a goat's eye - pale amber with a wide horizontal bar pupil. Thick white fur and
a shaggy mane. The dragon shows in a small fang over the lip and grey spines
poking through the mane. Only the head and neck show at the window. It
rests at the window, calm and old, and only its eye, breath and jaw move.
"""
import math
import random
import numpy as np
from PIL import Image, ImageDraw
from pixel import Canvas, PAL, text

W, H = 140, 150
LIGHT = np.array([-0.55, -0.72, 0.42])
LIGHT = LIGHT / np.linalg.norm(LIGHT)

FUR = ('stone1', 'stone2', 'stone3', 'stone4', 'cloud2', 'cloud3')      # white fur, cool grey shadows
BEARD = ('stone1', 'stone2', 'stone3', 'stone4', 'cloud2', 'cloud3')    # white goatee
HORN = ('stone1', 'stone2', 'stone3', 'paper1', 'paper2', 'paper3')
NOSE = ('stone1', 'stone2', 'pink2', 'pink3', 'pink4')
SCALE = ('stone1', 'stone2', 'stone3', 'stone4', 'cloud2')               # the dragon's grey scales
TOOTH = ('stone2', 'stone4', 'cloud2', 'cloud3')
MOUTH = ('ink', 'ink', 'red0', 'red0', 'red1', 'pink2')
IRIS = ('copper1', 'gold1', 'gold2', 'gold3', 'gold4')
INK = 'wood0'


# ---------------------------------------------------------------- drawing tools
def spline(pts, closed=True, n=6):
    """Catmull-Rom through the points: hand-placed points, smooth hand-drawn curves."""
    P = list(pts)
    P = ([P[-1]] + P + [P[0], P[1]]) if closed else ([P[0]] + P + [P[-1]])
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = (np.array(q, float) for q in P[i - 1:i + 3])
        for k in range(n):
            t = k / n
            out.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    if not closed:
        out.append(np.array(P[-2], float))
    return [tuple(p) for p in out]


def fill(pts):
    im = Image.new('L', (W, H), 0)
    ImageDraw.Draw(im).polygon(spline(pts), fill=1)
    return np.array(im, bool)


def taper(pts, r0, r1, n=6):
    """A tapering stroke (horn, tooth, claw) as a filled outline."""
    c = spline(pts, closed=False, n=n)
    left, right = [], []
    L = len(c)
    for i, p in enumerate(c):
        q0, q1 = c[max(0, i - 1)], c[min(L - 1, i + 1)]
        dx, dy = q1[0] - q0[0], q1[1] - q0[1]
        ln = math.hypot(dx, dy) or 1
        nx, ny = -dy / ln, dx / ln
        r = r0 + (r1 - r0) * i / max(1, L - 1)
        left.append((p[0] + nx * r, p[1] + ny * r))
        right.append((p[0] - nx * r, p[1] - ny * r))
    im = Image.new('L', (W, H), 0)
    ImageDraw.Draw(im).polygon(left + right[::-1], fill=1)
    return np.array(im, bool)


def line_mask(pts, width=1, closed=False):
    c = spline(pts, closed=closed)
    im = Image.new('L', (W, H), 0)
    ImageDraw.Draw(im).line(c + ([c[0]] if closed else []), fill=1, width=width)
    return np.array(im, bool)


def sh(m, dx, dy):
    out = np.zeros_like(m)
    h, w = m.shape
    out[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)] = m[max(0, -dy):h - max(0, dy), max(0, -dx):w - max(0, dx)]
    return out


def edge(m):
    return m & ~(sh(m, 1, 0) & sh(m, -1, 0) & sh(m, 0, 1) & sh(m, 0, -1))


def dist(m, maxd=14):
    d = np.zeros(m.shape, float)
    cur = m.copy()
    for _ in range(maxd):
        cur = cur & sh(cur, 1, 0) & sh(cur, -1, 0) & sh(cur, 0, 1) & sh(cur, 0, -1)
        if not cur.any():
            break
        d += cur
    return d


def form(m, r=7.0, round_=2.0):
    """Normals of a part seen as a slab with rounded edges (flat planes, not balloons)."""
    d = dist(m, int(r) + 2)
    t = np.clip(d / r, 0, 1)
    hgt = (1 - (1 - t) ** round_) * r
    gy, gx = np.gradient(hgt)
    n = np.stack([-gx, -gy, np.full_like(gx, 0.9)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n


def lit(n, tilt=(0.0, 0.0)):
    """Lambert with a plane tilt (dx, dy) so whole planes face toward or away from the light."""
    nn = n + np.array([tilt[0], tilt[1], 0.0])
    nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
    return np.clip(nn @ LIGHT, 0, 1)


def put(cv, m, c):
    cv.a[m] = (*PAL[c], 255)


def put_ramp(cv, m, ramp, v):
    """Snap a light value 0..1 to a ramp."""
    v = np.broadcast_to(v, m.shape)
    idx = np.clip((v * (len(ramp) - 0.01)).astype(int), 0, len(ramp) - 1)
    for i, c in enumerate(ramp):
        sel = m & (idx == i)
        if sel.any():
            cv.a[sel] = (*PAL[c], 255)


def _hash2(x, y, s):
    h = np.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453
    return h - np.floor(h)


def noise(x, y, s=0.0):
    ix, iy = np.floor(x), np.floor(y)
    fx, fy = x - ix, y - iy
    ux, uy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = _hash2(ix, iy, s), _hash2(ix + 1, iy, s)
    c, d = _hash2(ix, iy + 1, s), _hash2(ix + 1, iy + 1, s)
    return a + (b - a) * ux + (c - a + (a - b - c + d) * ux) * uy


def _step(rgb, m, n):
    """Lighten / darken along each colour's ramp; the white fur steps along FUR."""
    from pixel import step
    if not m.any():
        return
    cols = rgb[m]
    uniq, inv = np.unique(cols.reshape(-1, 3), axis=0, return_inverse=True)
    fur = [tuple(PAL[c]) for c in FUR]
    new = []
    for c in uniq:
        t = tuple(int(v) for v in c)
        if t in fur:
            new.append(fur[int(np.clip(fur.index(t) + n, 0, len(fur) - 1))])
        else:
            new.append(step(t, n))
    rgb[m] = np.array(new, np.uint8)[inv.reshape(-1)]


YY, XX = np.mgrid[0:H, 0:W].astype(float)


# ---------------------------------------------------------------- the anatomy (hand-placed points)
# The head is drawn in its own frame - nose to the left, the poll (top of the
# skull, between the horns) at the origin - then scaled, tipped nose-down the
# way a goat holds its head, and set in the window.
K = 0.97                                  # scale of the head frame
ANG = math.radians(-46)                   # nose tipped down
POLL = (60.0, 59.0)
HINGE = (-24.0, 26.0)                     # the lower jaw opens round this point


def LP(p, oy=0):
    """Head frame -> sprite pixels."""
    x, y = p[0] * K, p[1] * K
    c, s = math.cos(ANG), math.sin(ANG)
    return (POLL[0] + x * c - y * s, POLL[1] + oy + x * s + y * c)


def local_xy(oy):
    """Head-frame coordinates of every sprite pixel (for shading by region)."""
    c, s = math.cos(-ANG), math.sin(-ANG)
    gx, gy = XX - POLL[0], YY - POLL[1] - oy
    return (gx * c - gy * s) / K, (gx * s + gy * c) / K


HEAD = [(3, 3), (-3, -3), (-11, -4.5), (-20, -4), (-28, -2), (-36, 0), (-45, 2), (-54, 4.5), (-61, 7), (-66, 10),
        (-69.5, 14), (-70.5, 19), (-69, 23.5), (-65, 26), (-58, 26.5), (-50, 27.5), (-42, 29), (-34, 32), (-26, 36),
        (-17, 38), (-9, 35), (-3.5, 26), (-0.5, 14)]
JAW = [(-66, 26), (-65, 29.5), (-61, 33), (-54, 34.5), (-46, 34.5), (-38, 35.5), (-30, 37.5), (-24, 36), (-30, 32),
       (-42, 29.5), (-54, 27.8), (-62, 26.5)]
LIP = [(-66, 26), (-60, 26.6), (-52, 27.6), (-44, 28.8)]
MUZZLE = [(-60, 7.5), (-65, 9.5), (-69, 13.5), (-70.3, 18.5), (-69, 23), (-64.5, 25.5), (-62, 21), (-60.5, 15), (-59.5, 11)]
NOSTRIL = [(-68.5, 13.5), (-66, 13), (-64.5, 14.5), (-66.5, 16.3)]
EYE = [(-33.5, 9.5), (-30, 5.6), (-24.5, 4.6), (-19, 7), (-20, 11), (-26.5, 12.8)]
SOCKET = [(-36.5, 9.5), (-31, 3.2), (-24, 2.2), (-16, 6.2), (-17.5, 13.2), (-27, 15.6)]
_EC = (-26.3, 8.7)
EYE = [(_EC[0] + (x - _EC[0]) * 1.25, _EC[1] + (y - _EC[1]) * 1.25) for x, y in EYE]          # a little bigger
SOCKET = [(_EC[0] + (x - _EC[0]) * 1.2, _EC[1] + (y - _EC[1]) * 1.2) for x, y in SOCKET]
BROW = [(-38, 1.6), (-31, -2.2), (-21, -2.4), (-13.5, 1.2), (-20, 2.2), (-30, 1.8)]
CHEEK = [(-42, 17), (-31, 13), (-18, 15), (-10, 23), (-16, 33), (-29, 33), (-40, 26)]


def tufts(base, rng, n, ln=(3, 6), r=(1.5, 2.2), dirf=None, inside=1.0):
    """Shaggy tufts of hair standing off an outline: little tapering locks
    whose roots sit just inside the edge."""
    out = np.zeros((H, W), bool)
    e = edge(base)
    ys, xs = np.nonzero(e)
    if not len(ys):
        return out
    idx = list(range(len(ys)))
    rng.shuffle(idx)
    for i in idx[:n]:
        x, y = float(xs[i]), float(ys[i])
        dx, dy = dirf(x, y)
        L = rng.uniform(*ln)
        bend = rng.uniform(-0.25, 0.25)
        pts = [(x - dx * inside, y - dy * inside), (x + dx * L * 0.5 - dy * bend * L * 0.3, y + dy * L * 0.5 + dx * bend * L * 0.3),
               (x + dx * L, y + dy * L)]
        out |= taper(pts, rng.uniform(*r), 0.3, n=3)
    return out


def anatomy(s):
    """All shapes for a pose. s: dict with oy (rise offset), jaw (0..1)."""
    oy = s['oy']
    P = (POLL[0], POLL[1] + oy)
    G = lambda pts: [(x, y + oy) for x, y in pts]                       # sprite coords, risen
    Lp = lambda pts: [LP(p, oy) for p in pts]                           # head frame
    ang = -math.radians(8) * s['jaw']

    def Rl(p):                                                          # lower jaw, opened
        x, y = p[0] - HINGE[0], p[1] - HINGE[1]
        ca, sa = math.cos(ang), math.sin(ang)
        return LP((HINGE[0] + x * ca - y * sa, HINGE[1] + x * sa + y * ca), oy)
    a = {'oy': oy, 'pts': {}, 'lines': {}}
    rng = random.Random(41)

    def F(name, pts):
        a['pts'][name] = pts
        return fill(pts)

    def TP(name, pts, r0, r1, n=6):
        a['lines'][name] = (pts, r0)
        return taper(pts, r0, r1, n)
    # horns rise from the poll and sweep back, the far one a little behind
    a['horn_far'] = TP('horn_far', G([(64, 61), (66, 54), (70, 49), (76, 46.5), (82.5, 48), (87.5, 53), (90.5, 60),
                                      (91.5, 66)]), 5.2, 1.3)
    a['horn_near'] = TP('horn_near', G([(58.5, 62), (60, 54), (64, 48.5), (70.5, 45.5), (77.5, 46.5), (83, 51),
                                        (86.5, 57.5), (88, 64)]), 6.6, 1.6)
    # a thick neck under a shaggy mane
    neck_pts = G([(56, 62), (70, 59), (84, 63), (98, 72), (110, 87), (122, 110), (132, 138), (134, 152), (70, 152),
                  (73, 136), (77, 118), (78, 104), (74, 94)])
    neck = F('neck', neck_pts)
    mane = tufts(neck & (YY < 118 + oy) & (XX > 64) & ~sh(neck, -2, 2), rng, 70, (3, 7), (1.4, 2.2),
                 lambda x, y: (0.75, 0.66))                                 # top of the neck: locks fall back and down
    a['mane'] = mane & ~neck
    a['neck'] = neck | a['mane']
    plates = np.zeros((H, W), bool)                                       # dragon spines poking through the mane
    for (x, y, dx, dy) in ((77, 60, 0.35, -1), (88, 65, 0.6, -0.9), (98, 72, 0.75, -0.7), (107, 82, 0.9, -0.5)):
        n = math.hypot(dx, dy)
        plates |= taper(G([(x, y), (x + dx / n * 3, y + dy / n * 3), (x + dx / n * 6, y + dy / n * 6)]), 2.2, 0.4, n=3)
    a['plates'] = plates
    # head, lower jaw, mouth
    a['jaw'] = F('jaw', [Rl(p) for p in JAW])
    if s['jaw'] > 0.05:
        a['mouth'] = fill(Lp(LIP) + [Rl(p) for p in LIP[::-1]])
    else:
        a['mouth'] = np.zeros((H, W), bool)
    head = F('head', Lp(HEAD))
    LX, LY = local_xy(oy)
    cheekfluff = tufts(head & (LY > 30) & (LX > -36), rng, 18, (2, 4), (1.2, 1.7),
                       lambda x, y: (0.2, 1.0))                             # fluff under the cheek
    a['head'] = head | (cheekfluff & ~a['neck'])
    a['brow'] = F('brow', Lp(BROW))
    a['cheek'] = F('cheek', Lp(CHEEK))
    a['eye'] = F('eye', Lp(EYE))
    a['socket'] = F('socket', Lp(SOCKET))
    a['muzzle'] = F('muzzle', Lp(MUZZLE))
    a['nostril'] = F('nostril', Lp(NOSTRIL))
    # a floppy goat ear, sticking out behind the eye
    a['spike'] = F('spike', G([(62, 68.5), (71, 70), (80, 74.5), (86.5, 81), (89, 86.5), (85, 87), (77, 83),
                               (69, 78.5), (63, 76)]))
    a['ear_in'] = F('ear_in', G([(66, 72), (74, 73.8), (81, 78), (85.5, 83.5), (80.5, 82.5), (73, 78.6), (66.5, 75.5)]))
    # goatee from the chin, hanging straight down
    cx, cy = Rl((-58, 34))
    cy -= oy
    beard = F('beard', G([(cx - 5, cy - 6), (cx + 3, cy - 5), (cx + 11, cy - 6), (cx + 13, cy + 1), (cx + 10, cy + 8),
                          (cx + 6.5, cy + 15), (cx + 3.5, cy + 21), (cx + 1.5, cy + 14), (cx - 3, cy + 6), (cx - 5, cy)]))
    beard |= tufts(beard & (YY > cy + oy + 6), rng, 12, (2, 4), (1.0, 1.5), lambda x, y: (0.1, 1.0))
    a['beard'] = beard
    a['beard_root'] = (cx, cy + oy)
    # two small dragon fangs over the lower lip
    a['teeth'] = [taper(Lp([(-59, 26), (-59.6, 30.5), (-58.3, 34)]), 1.8, 0.35, n=3)]   # one dragon fang
    a['throat'] = a['neck'] & (XX < 86) & (YY > 98 + oy)
    a['wrist'] = np.zeros((H, W), bool)                                   # no arm: just the head and neck
    a['claws'] = []
    a['LX'], a['LY'] = LX, LY
    return a


# ---------------------------------------------------------------- the stages
def _dense(c, step=1.0):
    out = [c[0]]
    for p in c[1:]:
        q = out[-1]
        d = math.hypot(p[0] - q[0], p[1] - q[1])
        k = max(1, int(d / step))
        for i in range(1, k + 1):
            out.append((q[0] + (p[0] - q[0]) * i / k, q[1] + (p[1] - q[1]) * i / k))
    return out


def hand_strokes(pts, closed, rng, wobble=0.7, overshoot=3.0, seg=(10, 26), overlap=3):
    """Pencil strokes along a curve the way a hand draws it: broken into strokes
    that overlap, each bowing a little off the true line, ends overshooting."""
    c = _dense(spline(pts, closed=closed) + ([spline(pts, closed=True)[0]] if closed else []))
    strokes = []
    i = 0
    L = len(c)
    while i < L - 2:
        n = rng.randint(*seg)
        j = min(L - 1, i + n)
        part = c[max(0, i - overlap):j + 1]
        if len(part) < 3:
            break
        amp = rng.uniform(-wobble, wobble)
        ph = rng.uniform(0, math.pi)
        pts2 = []
        m = len(part)
        for k, (x, y) in enumerate(part):
            q0, q1 = part[max(0, k - 1)], part[min(m - 1, k + 1)]
            dx, dy = q1[0] - q0[0], q1[1] - q0[1]
            ln = math.hypot(dx, dy) or 1
            off = amp * math.sin(math.pi * k / (m - 1) + ph * 0.3)
            pts2.append((x - dy / ln * off, y + dx / ln * off))
        for end, nb in ((0, 1), (-1, -2)):                                 # overshoot past the ends
            ex, ey = pts2[end]
            nx, ny = pts2[nb]
            dx, dy = ex - nx, ey - ny
            ln = math.hypot(dx, dy) or 1
            o = rng.uniform(0.5, overshoot)
            pts2.insert(0 if end == 0 else len(pts2), (ex + dx / ln * o, ey + dy / ln * o))
        im = Image.new('L', (W, H), 0)
        ImageDraw.Draw(im).line(pts2, fill=1, width=1)
        strokes.append(np.array(im, bool))
        i = j
    return strokes


def gesture_strokes(s, rng):
    """The first loose lines: the action of the head and neck in a few sweeps."""
    oy = s['oy']
    G = lambda pts: [(x, y + oy) for x, y in pts]
    Lp = lambda pts: [LP(p, oy) for p in pts]
    curves = [G([(132, 140), (110, 87), (84, 63), (62, 59)]) + Lp([(-11, -4.5), (-45, 2), (-66, 10), (-71, 19)]),  # top line
              Lp([(-68, 25), (-52, 27.5), (-34, 32), (-12, 37)]),                                                # mouth, jaw
              Lp([(-65, 30), (-50, 35), (-30, 38), (-8, 34), (0, 14)]),
              G([(58, 64), (61, 48), (72, 43), (80, 58)]), G([(65, 62), (69, 48), (79, 45), (85, 58)]),          # horns
              G([(74, 94), (78, 118), (72, 150)]), G([(122, 110), (134, 152)]),                                  # neck
              G([(64, 69), (84, 80)])]                                                                           # ear
    out = []
    for c in curves:
        out += hand_strokes(c, False, rng, wobble=1.3, overshoot=6, seg=(30, 60), overlap=0)
    return out


def _cranium(oy, n):
    cx, cy = LP((-14, 15), oy)
    r = 19 * K
    return [(cx + r * math.cos(t), cy + r * math.sin(t)) for t in np.linspace(0, 2 * math.pi, n, endpoint=False)]


def _construction_lines(oy):
    Lp = lambda pts: [LP(p, oy) for p in pts]
    return [Lp([(-46, 2), (-71, 11), (-70, 27), (-46, 29)]), Lp([(-46, 2), (-46, 29)]),       # muzzle box
            Lp([(-44, 8.5), (-8, 8.5)]), Lp([(10, 12), (-76, 20)])]                                # eye line, head axis


def construction_strokes(s, rng):
    oy = s['oy']
    out = hand_strokes(_cranium(oy, 12), True, rng, wobble=1.0, overshoot=4, seg=(18, 40))      # cranium
    for c in _construction_lines(oy):
        out += hand_strokes(c, False, rng, wobble=0.6, overshoot=5, seg=(20, 50))
    return out


def sketch_strokes(a, rng):
    """Pencil over the construction: every part drawn in short overlapping strokes,
    the important contours gone over twice."""
    out = []
    for key in ('head', 'jaw', 'neck', 'brow', 'cheek', 'eye', 'nostril', 'muzzle', 'beard'):
        pts = a['pts'][key]
        out += hand_strokes(pts, True, rng, wobble=0.8, overshoot=2.5)
        if key in ('head', 'jaw', 'beard'):
            out += hand_strokes(pts, True, rng, wobble=1.1, overshoot=3.5, seg=(14, 34))
    for key, (pts, r) in a['lines'].items():
        for side in (-1, 1):
            off = []
            c = spline(pts, closed=False)
            for k, (x, y) in enumerate(c):
                q0, q1 = c[max(0, k - 1)], c[min(len(c) - 1, k + 1)]
                dx, dy = q1[0] - q0[0], q1[1] - q0[1]
                ln = math.hypot(dx, dy) or 1
                rr = r * (1 - 0.75 * k / max(1, len(c) - 1))
                off.append((x - dy / ln * rr * side, y + dx / ln * rr * side))
            out += hand_strokes(off, False, rng, wobble=0.5, overshoot=2)
    for t in a['teeth'] + a['claws']:
        out.append(edge(t) & (np.random.RandomState(len(out)).rand(H, W) < 0.8))
    return out


def _shade_region(a):
    oy = a['oy']
    return (a['neck'] & ~a['head'] & (XX > 86)) | (sh(a['brow'], 1, 2) & a['head'] & ~a['brow']) | a['jaw'] | \
        (a['head'] & (a['LY'] > 24)) | (sh(a['head'] | a['jaw'], 2, 4) & a['neck'] & ~a['head'] & ~a['jaw'])


def hatch_strokes(a, rng):
    """Shadow hatching: short diagonal strokes, each placed by hand."""
    shade = _shade_region(a)
    out = []
    ys, xs = np.nonzero(shade)
    if not len(ys):
        return out
    order = list(range(len(ys)))
    rng.shuffle(order)
    taken = np.zeros((H, W), bool)
    for i in order[:400]:
        x, y = xs[i], ys[i]
        if taken[max(0, y - 2):y + 3, max(0, x - 2):x + 3].any():
            continue
        ln = rng.uniform(3, 6)
        im = Image.new('L', (W, H), 0)
        ImageDraw.Draw(im).line([(x - ln * 0.5, y + ln * 0.5), (x + ln * 0.5, y - ln * 0.5)], fill=1)
        m = np.array(im, bool) & shade
        taken |= m
        out.append(m)
    return out


def ink_weighted(a):
    """Clean ink with line weight: one pixel on the lit side, two on the shadow side."""
    m = ink_lines(a)
    for key in ('head', 'jaw', 'neck', 'horn_near', 'wrist'):
        e = edge(a[key])
        shadow = e & (~sh(a[key], -1, 0) | ~sh(a[key], 0, -1))
        m |= (sh(shadow, 1, 0) | sh(shadow, 0, 1)) & ~a[key] & ~a['head'] if key != 'head' else \
            (sh(shadow, 1, 0) | sh(shadow, 0, 1)) & ~a[key]
    return m


def construction(s):
    """Stage 1: the construction lines an artist starts from."""
    oy = s['oy']
    m = line_mask(_cranium(oy, 24), closed=True)
    for c in _construction_lines(oy):
        m |= line_mask(c)
    m |= line_mask([(62, 59 + oy), (90, 66 + oy), (120, 104 + oy)])                       # neck top
    m |= line_mask([(74, 94 + oy), (72, 150 + oy)])                                        # throat
    m |= line_mask([(59, 63 + oy), (64, 46 + oy), (78, 46 + oy)])                          # horn gesture
    return m


def sketch_lines(a, seed=3):
    """Loose pencil: outlines with gaps and the odd doubled stroke."""
    m = np.zeros((H, W), bool)
    for k, key in enumerate(('head', 'jaw', 'neck', 'brow', 'eye', 'cheek', 'wrist', 'horn_near', 'horn_far',
                             'plates', 'beard', 'spike')):
        e = edge(a[key])
        ys, xs = np.nonzero(e)
        rng = random.Random(seed + k)
        for y, x in zip(ys, xs):
            if rng.random() < 0.82:
                m[y, x] = True
            if rng.random() < 0.25:
                yy, xx = y + rng.choice((-1, 0, 1)), x + rng.choice((-1, 0, 1))
                if 0 <= yy < H and 0 <= xx < W:
                    m[yy, xx] = True
    for t in a['teeth'] + a['claws']:
        m |= edge(t)
    return m


def hatching(a):
    """Diagonal pencil hatching where the big shadows will go."""
    return _shade_region(a) & ((XX + YY) % 4 == 0)


def ink_lines(a):
    """Stage 3: clean outlines and the key inner lines."""
    oy = a['oy']
    Lp = lambda pts: [LP(p, oy) for p in pts]
    m = np.zeros((H, W), bool)
    for key in ('head', 'jaw', 'neck', 'horn_near', 'horn_far', 'wrist', 'plates', 'spike', 'beard'):
        m |= edge(a[key])
    m |= edge(a['eye']) | edge(a['nostril'])
    for t in a['teeth'] + a['claws']:
        m |= edge(t)
    m |= line_mask(Lp(LIP)) & a['head']                                                     # the lips
    m |= line_mask(Lp([(-40, 26), (-29, 33), (-16, 33), (-10, 23)])) & a['head']          # back of the cheek
    m |= line_mask(Lp([(-35, 3), (-28, 0.5), (-18, 1.5)])) & a['head']                      # brow
    m |= line_mask(Lp([(-60, 8), (-61, 16), (-64, 25)])) & a['head']                      # edge of the bare nose
    return m


def flats(a):
    cv = Canvas(W, H)
    put(cv, a['horn_far'], 'paper0')
    put(cv, a['neck'], 'stone4')
    put(cv, a['plates'], 'stone2')
    put(cv, a['beard'], 'cloud2')
    put(cv, a['jaw'], 'stone4')
    put(cv, a['mouth'], 'red0')
    put(cv, a['head'] | a['brow'], 'stone4')
    put(cv, a['muzzle'], 'pink3')
    put(cv, a['horn_near'], 'paper1')
    put(cv, a['spike'], 'stone4')
    put(cv, a['ear_in'], 'pink3')
    for t in a['teeth']:
        put(cv, t, 'paper3')
    put(cv, a['eye'], 'gold3')
    put(cv, a['nostril'], 'stone0')
    put(cv, a['wrist'], 'stone3')
    for c in a['claws']:
        put(cv, c, 'paper1')
    return cv


def shading(a):
    """Stage 5: light the planes, then cast shadows and reflected light."""
    cv = Canvas(W, H)
    LX, LY = a['LX'], a['LY']
    put_ramp(cv, a['horn_far'], HORN, np.clip(0.1 + 0.5 * lit(form(a['horn_far'], 3)), 0, 1))
    nv = 0.32 + 0.68 * lit(form(a['neck'], 10), (0.2, -0.1))
    nv = nv - 0.2 * (sh(a['head'] | a['jaw'] | a['beard'], 2, 4) & ~a['head'] & ~a['jaw'])   # the head's cast shadow
    nv = nv - 0.3 * (sh(a['spike'], 1, 3) & ~a['spike'])                                   # the ear's
    nv = nv - 0.1 * (XX > 98)                                                               # the neck turns away
    put_ramp(cv, a['neck'], FUR, np.clip(nv, 0, 1))
    put_ramp(cv, a['plates'], SCALE, np.clip(0.25 + 0.7 * lit(form(a['plates'], 2)), 0, 1))
    put_ramp(cv, a['beard'], BEARD, np.clip(0.45 + 0.6 * lit(form(a['beard'], 3)) - 0.3 * (sh(a['jaw'], 0, 2) & ~a['jaw']), 0, 1))
    jv = 0.28 + 0.6 * lit(form(a['jaw'], 4), (0.0, 0.3)) - 0.32 * (sh(a['head'], 1, 2) & a['jaw'] & ~a['head'])
    put_ramp(cv, a['jaw'], FUR, np.clip(jv, 0, 1))
    if a['mouth'].any():
        put_ramp(cv, a['mouth'], MOUTH, np.clip(0.2 + 0.5 * (YY - YY[a['mouth']].min()) / 6, 0, 1))
    v = 0.3 + 0.72 * lit(form(a['head'], 8, 2.4))
    v = v + 0.2 * (lit(form(a['cheek'], 5)) - 0.45) * a['cheek']                            # the round cheek
    v = v - 0.12 * (LY > 24) - 0.06 * (LY > 29)                                             # the underside turns away
    v = v - 0.3 * (sh(a['brow'], 1, 2) & ~a['brow'])                                        # brow shadow over the eye
    v = v - 0.28 * (sh(a['horn_near'], 1, 3) & ~a['horn_near'])
    v = v - 0.16 * a['socket'] - 0.3 * (sh(a['spike'], 1, 3) & ~a['spike'])
    v = v + 0.06 * (noise(XX / 7.0, YY / 7.0, 31) - 0.5) * 2
    put_ramp(cv, a['head'], FUR, np.clip(v, 0, 1))
    put_ramp(cv, a['brow'], FUR, np.clip(0.45 + 0.6 * lit(form(a['brow'], 2)), 0, 1))
    put_ramp(cv, a['muzzle'], NOSE, np.clip(0.25 + 0.7 * lit(form(a['muzzle'], 3)) - 0.15 * (LY > 18), 0, 1))
    put_ramp(cv, a['horn_near'], HORN, np.clip(0.2 + 0.75 * lit(form(a['horn_near'], 3)), 0, 1))
    ev = 0.35 + 0.6 * lit(form(a['spike'], 2), (0.0, -0.2))
    put_ramp(cv, a['spike'], FUR, np.clip(ev, 0, 1))                                        # drooping goat ear
    iv = (YY - YY[a['ear_in']].min()) / 6.0 if a['ear_in'].any() else 0
    put_ramp(cv, a['ear_in'], ('bark4', 'pink2', 'pink3'), np.clip(0.95 - 0.12 * iv - 0.4 * (XX > 83), 0, 1))
    put(cv, sh(a['ear_in'], 0, -1) & a['ear_in'] & ~sh(a['ear_in'], 0, 1), 'bark3')      # the fold at the bottom
    for t in a['teeth']:
        put_ramp(cv, t, TOOTH, np.clip(0.4 + 0.6 * lit(form(t, 1.5)), 0, 1))
    put(cv, a['nostril'], 'ink')
    put(cv, sh(a['nostril'], 0, -1) & ~a['nostril'] & a['muzzle'], 'pink4')
    put_ramp(cv, a['wrist'], SCALE, np.clip(0.2 + 0.75 * lit(form(a['wrist'], 4)), 0, 1))
    for c in a['claws']:
        put_ramp(cv, c, HORN, np.clip(0.3 + 0.6 * lit(form(c, 1.2)), 0, 1))
    return cv


def _voronoi(mask, spacing, seed):
    """Poisson-disc seeds inside mask (spacing may be a function), and per-pixel
    nearest / second-nearest distances and the owning seed."""
    rng = random.Random(seed)
    cands = [(x + rng.uniform(0, 2), y + rng.uniform(0, 2)) for y in range(0, H - 1, 2) for x in range(0, W - 1, 2)]
    rng.shuffle(cands)
    seeds = []
    for (x, y) in cands:
        yi, xi = int(y), int(x)
        if not mask[yi, xi]:
            continue
        sp = spacing(xi, yi) if callable(spacing) else spacing
        if all((sx - x) ** 2 + (sy - y) ** 2 >= (min(sp, ss) * 0.92) ** 2 for (sx, sy, ss) in seeds):
            seeds.append((x, y, sp))
    if len(seeds) < 2:
        return None
    S = np.array(seeds)
    d = np.hypot(XX[None] - S[:, 0, None, None], YY[None] - S[:, 1, None, None])
    order = np.argsort(d, axis=0)[:2]
    d1 = np.take_along_axis(d, order[:1], 0)[0]
    d2 = np.take_along_axis(d, order[1:2], 0)[0]
    return S, order[0], d1, d2


def fur(a, cv):
    """Long white fur: strokes that follow the lie of the hair - down the face
    toward the nose, down the cheek, jaw and neck, long in the beard - each
    lock with a darker root and a lighter tip."""
    body = (a['head'] | a['neck'] | a['jaw'] | a['brow'] | a['beard'] | a['spike']) & ~a['eye'] & \
        ~a['nostril'] & ~a['muzzle'] & ~a['ear_in']
    LY = a['LY']
    c, s = math.cos(ANG), math.sin(ANG)
    face = (-1 * c - 0.3 * s, -1 * s + 0.3 * c)                     # head frame (-1, 0.3): toward the nose
    rgb = cv.a[..., :3]
    rng = random.Random(23)
    hi = np.zeros((H, W), bool)
    lo = np.zeros((H, W), bool)
    for y in range(0, H, 3):
        for x in range(0, W, 2):
            X, Y = x + rng.uniform(0, 2), y + rng.uniform(0, 3)
            yi, xi = int(Y), int(X)
            if yi >= H or not body[yi, xi]:
                continue
            if a['beard'][yi, xi]:
                (dx, dy), ln = (0.1, 1.0), rng.randint(4, 7)
            elif a['spike'][yi, xi]:
                (dx, dy), ln = (0.85, 0.5), rng.randint(2, 3)
            elif a['neck'][yi, xi] and not a['head'][yi, xi] and not a['jaw'][yi, xi]:
                (dx, dy), ln = (0.4, 1.0), rng.randint(4, 8)        # the mane falls down the neck
            elif a['jaw'][yi, xi] or LY[yi, xi] > 21:
                (dx, dy), ln = (0.2, 1.0), rng.randint(2, 4)
            else:
                (dx, dy), ln = face, rng.randint(3, 5)
            n = math.hypot(dx, dy)
            dx, dy = dx / n, dy / n
            light = rng.random() < 0.62
            if not light:
                ln = max(2, ln // 2)
            for k in range(ln):
                px, py = int(X + dx * k), int(Y + dy * k)
                if 0 <= px < W and 0 <= py < H and body[py, px]:
                    (lo if (not light or k == 0) else hi)[py, px] = True
    furc = [tuple(PAL[c]) for c in FUR]
    idx = np.full((H, W), -1)
    for i, c in enumerate(furc):
        idx[(rgb[..., 0] == c[0]) & (rgb[..., 1] == c[1]) & (rgb[..., 2] == c[2])] = i
    _step(rgb, hi & ~lo, 1)
    _step(rgb, lo & ~hi & ((idx <= 3) | (idx > 3) & (np.asarray(_hash2(XX, YY, 3.0)) < 0.3)), -1)


def texture(a, cv):
    """Stage 6: fur, the growth ridges of the horns, the dragon's scales."""
    fur(a, cv)
    rgb = cv.a[..., :3]
    for key in ('horn_near', 'horn_far'):                 # ridged like a goat's horn: rings across the curve
        pts, r0 = a['lines'][key]
        dense = spline(pts, closed=False, n=12)
        for k in range(3, len(dense) - 3, 3):
            (x0, y0), (x1, y1) = dense[k - 1], dense[k + 1]
            tx, ty = x1 - x0, y1 - y0
            n = math.hypot(tx, ty) or 1
            nx, ny = -ty / n * (r0 + 1), tx / n * (r0 + 1)
            x, y = dense[k]
            m = line_mask([(x - nx, y - ny), (x + nx, y + ny)]) & a[key]
            _step(rgb, m, -1)
            _step(rgb, sh(m, 1, 1) & a[key] & ~m, 1)
    # beard: long strands, dark partings with light hair either side
    bd = a['beard']
    _step(rgb, bd & (XX % 3 == 0) & ((YY + XX // 3) % 7 != 0), -1)
    _step(rgb, bd & (XX % 3 == 1) & ((YY + XX) % 5 == 0), 1)
    # fine scales on the dragon's wrist and spines
    sc = a['wrist'] | a['plates']
    v = _voronoi(sc, 2.6, 12)
    if v:
        S, near, d1, d2 = v
        crack = sc & (d2 - d1 < 0.7)
        _step(rgb, crack, -1)
        _step(rgb, sc & ~crack & (_hash2(S[near, 0].round(), S[near, 1].round(), 8.0) > 0.8), 1)


def eye(a, s, cv):
    """A goat's eye: pale amber iris, a wide horizontal bar pupil, a soft upper
    lid with a dark lash line, bare grey skin round it, a wet glint."""
    e = a['eye']
    ys, xs = np.nonzero(e)
    if not len(ys):
        return
    y0, y1 = ys.min(), ys.max()
    x0, x1 = xs.min(), xs.max()
    ecx, ecy = (x0 + x1) / 2, (y0 + y1) / 2
    ring = sh(e, 1, 0) | sh(e, -1, 0) | sh(e, 0, 1) | sh(e, 0, -1)
    put(cv, ring & ~e, 'stone2')                                           # bare skin round the eye
    put(cv, sh(ring, 0, 1) & ~ring & ~e & a['head'] & (YY > ecy), 'stone3')
    t = (YY - y0) / max(1, y1 - y0)
    put_ramp(cv, e, IRIS, np.clip(0.15 + 0.85 * t, 0, 1))                  # darker under the lid, glowing low
    cx, cy = ecx + s['look'] * 1.5, ecy + 0.3
    pupil = e & (np.abs(XX - cx) < 3.8) & (YY >= np.floor(cy)) & (YY <= np.floor(cy) + 1)   # the bar pupil
    pupil &= ~((np.abs(XX - cx) >= 3.2) & (YY == np.floor(cy) + 1))        # softened ends
    put(cv, pupil, 'ink')
    put(cv, sh(pupil, 0, -1) & e & ~pupil & (YY > ecy), 'gold4')           # the iris glows under the pupil
    if s['membrane'] > 0:                                                 # third eyelid, from the front corner
        film = e & (XX < x0 + (x1 - x0 + 1) * s['membrane'])
        put(cv, film & ((XX + YY) % 2 == 0), 'cloud2')
        put(cv, film & ((XX + YY) % 2 == 1), 'cloud1')
    lid = 1.0 if s['lid'] >= 0.95 else float(np.clip((s['lid'] - 0.45) / 0.55, 0, 1))
    lid_y = y0 - 0.5 + (y1 - y0 + 1.5) * lid
    lidm = (e | (ring & (YY < ecy))) & (YY <= lid_y)
    lv = 0.55 + 0.35 * lit(form(lidm | a['brow'], 2))
    put_ramp(cv, lidm, FUR, np.clip(lv, 0, 1))
    seam = lidm & ~sh(lidm, 0, -1)                                        # the lash line along the lid's edge
    put(cv, seam & (e | sh(e, 0, 1)), 'stone0' if s['lid'] < 0.95 else 'stone1')
    put(cv, sh(seam, 0, 1) & e & ~lidm & ~pupil, 'gold1')                 # the lid's shadow on the eye
    if s['lid'] < 0.85:
        gx, gy = int(round(cx - 2)), int(round(max(lid_y + 1.5, cy - 1)))
        if 0 <= gy < H and 0 <= gx < W and e[gy, gx]:
            cv.a[gy, gx] = (*PAL['white'], 255)                              # wet glint


def final(a, cv):
    """Stage 7: fold the lines into the colours, contact shadows, highlights, the sky rim."""
    solid = cv.a[..., 3] == 255
    rgb = cv.a[..., :3]
    out = edge(solid)
    put(cv, out, 'stone2')
    put(cv, out & (~sh(solid, -1, 0) | ~sh(solid, 0, -1)), 'stone1')      # darker only on the shadow side
    for front, back, k in (('head', 'neck', -1), ('jaw', 'neck', -1), ('horn_near', 'head', -2), ('horn_near', 'neck', -2),
                           ('spike', 'neck', -1), ('spike', 'head', -1), ('beard', 'neck', -1), ('jaw', 'beard', -1),
                           ('wrist', 'neck', -2), ('horn_near', 'horn_far', -1)):
        contact = sh(a[front], 1, 1) & ~a[front] & a[back]
        _step(rgb, contact & solid, k)
    for t in a['teeth']:
        _step(rgb, sh(t, 1, 1) & ~t & (a['jaw'] | a['mouth']), -1)
    ear = edge(a['spike']) & solid & ~out
    put(cv, ear, 'stone2')
    put(cv, ear & ~sh(a['spike'], 0, -1), 'stone1')
    back = edge(a['head'] | a['jaw']) & (sh(a['neck'] & ~a['head'] & ~a['jaw'], -1, 0) | sh(a['neck'] & ~a['head'] & ~a['jaw'], 0, -1)) & ~out
    put(cv, back & (XX > 60), 'stone3')
    for key in ('horn_near',):                                            # worn ridges catch the light
        m = a[key]
        put(cv, m & ~sh(m, 1, 1) & ~edge(m) & (noise(XX * 0.7, YY * 0.7, 2) > 0.45), 'paper3')
    rim = solid & ~sh(solid, -2, 0) & ~sh(solid, -1, 1) & (XX > 70) & ~out  # cool sky light from behind
    put(cv, rim & (a['neck'] | a['plates'] | a['horn_near'] | a['horn_far']), 'cloud3')


def _effects(cv, s):
    oy = s['oy']
    if s['breath']:                                                       # breath condensing in the cool air
        k = s['breath']
        nx, ny = LP((-66, 15), oy)
        for j, (dx, dy, r) in enumerate(((-1, 3, 1.6), (-2, 7, 2.3), (-1, 12, 3.0))):
            if j >= k:
                continue
            cx, cy = nx + dx, ny + dy + k * 0.5
            d = ((XX - cx) / r) ** 2 + ((YY - cy) / (r * 0.8)) ** 2
            cv.a[(d <= 1) & ((XX + YY) % 2 == 0) & (cv.a[..., 3] == 0)] = (*PAL['cloud3'], 255)
            cv.a[(d < 0.4) & ((XX + YY) % 2 == 1) & (cv.a[..., 3] == 0)] = (*PAL['cloud2'], 255)
    if s['dust']:
        rng = random.Random(s['dust'])
        for _ in range(12):
            x = rng.choice((rng.uniform(28, 60), rng.uniform(72, 108)))
            y = 143 + rng.uniform(0, 6)
            if 0 <= int(y) < H and 0 <= int(x) < W:
                cv.a[int(y), int(x)] = (*PAL['stone3'], 255)


def draw(s, stages=False):
    """Draw one pose. With stages=True return the whole process: each stage's
    canvas, and the strokes/regions in the order they were put down."""
    a = anatomy(s)
    if not stages:
        cv = shading(a)
        eye(a, s, cv)
        texture(a, cv)
        eye(a, s, cv)
        final(a, cv)
        _effects(cv, s)
        return cv
    rng = random.Random(17)
    P = {}
    P['gesture'] = gesture_strokes(s, rng)
    P['construction'] = construction_strokes(s, rng)
    P['sketch'] = sketch_strokes(a, rng)
    P['hatch'] = hatch_strokes(a, rng)
    P['ink'] = ink_weighted(a)
    fl = flats(a)
    sh_cv = shading(a)
    eye(a, s, sh_cv)
    # two-tone shadow shapes: wherever the render is darker than the flat colour
    two = fl.copy()
    lum = lambda c: c.a[..., :3].astype(int).sum(axis=2)
    dark = (lum(sh_cv) < lum(fl) - 30) & (fl.a[..., 3] == 255)
    _step(two.a[..., :3], dark, -1)
    tex = sh_cv.copy()
    texture(a, tex)
    eye(a, s, tex)
    fin = tex.copy()
    final(a, fin)
    P.update(a=a, flats=fl, two=two, render=sh_cv, texture=tex, final=fin)
    return P


def _union(ms):
    out = np.zeros((H, W), bool)
    for m in ms:
        out |= m
    return out


def _count(ms):
    out = np.zeros((H, W), int)
    for m in ms:
        out += m
    return out


def _paper():
    return Canvas(W, H, fill='paper3')


def stage_canvases(P):
    """The canvas after each stage, the way it looks in the artist's file: earlier
    layers fade under the new one, the way a sketch layer is turned down."""
    a = P['a']
    G, C = _union(P['gesture']), _union(P['construction'])
    SK, HT = _count(P['sketch']), _union(P['hatch'])
    ink = P['ink']
    out = []
    c = _paper(); put(c, G, 'haze2'); out.append(('1 GESTURE', c))
    c = _paper(); put(c, G, 'haze3'); put(c, C, 'haze2'); out.append(('2 CONSTRUCTION', c))
    c = _paper(); put(c, G | C, 'haze3'); put(c, HT, 'stone3'); put(c, SK >= 1, 'stone2'); put(c, SK >= 2, 'stone1')
    out.append(('3 SKETCH', c))
    c = _paper(); put(c, SK >= 1, 'paper1'); put(c, ink, INK); out.append(('4 INK', c))
    c = _paper(); c.blit(P['flats'], 0, 0); put(c, ink, INK); out.append(('5 FLATS', c))
    c = _paper(); c.blit(P['two'], 0, 0); put(c, ink, INK); out.append(('6 SHADOW SHAPES', c))
    c = _paper(); c.blit(P['render'], 0, 0); put(c, ink, INK); out.append(('7 RENDER', c))
    c = _paper(); c.blit(P['texture'], 0, 0); put(c, ink & edge(P['texture'].a[..., 3] == 255), INK)
    out.append(('8 TEXTURE', c))
    c = Canvas(W, H, fill='sky3'); c.blit(P['final'], 0, 0); out.append(('9 FINAL', c))
    return out


def timelapse(P):
    """Frames of the drawing being made: strokes appear one after another, colour
    goes on part by part, shading sweeps in from the light, texture in patches."""
    a = P['a']
    frames = []
    base = _paper()

    def snap(c, label):
        frames.append((label, c.copy()))

    # gesture, then construction, a few strokes per frame
    c = base.copy()
    for k, m in enumerate(P['gesture']):
        put(c, m, 'haze2')
        if k % 2 == 1:
            snap(c, '1 GESTURE')
    snap(c, '1 GESTURE')
    for k, m in enumerate(P['construction']):
        put(c, m, 'haze2')
        if k % 3 == 2:
            snap(c, '2 CONSTRUCTION')
    snap(c, '2 CONSTRUCTION')
    # turn the construction down, pencil over it
    c2 = base.copy(); put(c2, c.a[..., 3] > 0 if False else (c.a[..., :3] != np.array(PAL['paper3'])).any(axis=2), 'haze3')
    c = c2
    cnt = np.zeros((H, W), int)
    sk = P['sketch']
    per = max(1, len(sk) // 9)
    for k, m in enumerate(sk):
        cnt += m
        put(c, m, 'stone2')
        put(c, m & (cnt >= 2), 'stone1')
        if k % per == per - 1:
            snap(c, '3 SKETCH')
    ht = P['hatch']
    per = max(1, len(ht) // 3)
    for k, m in enumerate(ht):
        put(c, m & (cnt == 0), 'stone3')
        if k % per == per - 1:
            snap(c, '3 SKETCH')
    # ink over the turned-down sketch, part by part, left to right
    c = base.copy(); put(c, cnt >= 1, 'paper1')
    ink = P['ink']
    for x0 in range(0, W, 24):
        put(c, ink & (XX < x0 + 24), INK)
        snap(c, '4 INK')
    # flats part by part
    order = ['neck', 'horn_far', 'jaw', 'head', 'brow', 'spike', 'beard', 'horn_near', 'wrist']
    done = np.zeros((H, W), bool)
    for key in order:
        done |= a[key]
        if key == 'head':
            for t in a['teeth']:
                done |= t
            done |= a['eye'] | a['nostril'] | a['muzzle']
        m = done & (P['flats'].a[..., 3] == 255)
        c.a[m] = P['flats'].a[m]
        put(c, ink, INK)
        snap(c, '5 FLATS')
    # shadow shapes, then the render, sweeping in from the light (upper left)
    for src, label in ((P['two'], '6 SHADOW SHAPES'), (P['render'], '7 RENDER')):
        for k in range(1, 6):
            m = ((XX + YY) < k * (W + H) / 5) & (src.a[..., 3] == 255)
            c.a[m] = src.a[m]
            put(c, ink, INK)
            snap(c, label)
    # texture in patches
    tex = P['texture']
    rnd = noise(XX / 9.0, YY / 9.0, 7)
    for k in range(1, 6):
        m = (rnd < k / 5 + 0.01) & (tex.a[..., 3] == 255)
        c.a[m] = tex.a[m]
        put(c, ink & edge(tex.a[..., 3] == 255), INK)
        snap(c, '8 TEXTURE')
    fin = Canvas(W, H, fill='sky3'); fin.blit(P['final'], 0, 0)
    for _ in range(3):
        snap(fin, '9 FINAL')
    return frames


# ---------------------------------------------------------------- animation
def _state(**kw):
    s = dict(rise=1.0, jaw=0.0, look=0.0, lid=0.55, membrane=0.0, breath=0, dust=0)
    s.update(kw)
    return s


def _script():
    S = []
    for r in (0.0, 0.06, 0.16, 0.3, 0.46, 0.62, 0.77, 0.88, 0.96):         # rises slowly, eyes shut
        S.append(_state(rise=r, lid=1.0))
    S += [_state(lid=1.0, dust=1), _state(lid=1.0, dust=2), _state(lid=1.0)]  # settles its chin on the sill
    S += [_state(lid=0.9, membrane=1.0), _state(lid=0.72, membrane=0.8), _state(lid=0.6, membrane=0.4),
          _state(lid=0.55)]                                                    # the eye opens, the film slides back
    S += [_state(lid=0.55, look=-1), _state(lid=0.5, look=-1), _state(lid=0.5, look=-1)]   # looks at the bell
    S += [_state(lid=0.5, look=-1, breath=1), _state(lid=0.5, look=-1, breath=2), _state(lid=0.52, look=-1, breath=3),
          _state(lid=0.55, look=-0.5)]                                        # a long breath out
    S += [_state(lid=0.8), _state(lid=1.0), _state(lid=1.0, membrane=0.6), _state(lid=0.7, membrane=0.3),
          _state(lid=0.55)]                                                   # slow blink
    S += [_state(lid=0.6, jaw=0.35), _state(lid=0.7, jaw=0.8), _state(lid=0.8, jaw=1.0), _state(lid=0.75, jaw=0.6),
          _state(lid=0.6, jaw=0.15)]                                          # the jaw parts with a sigh
    S += [_state(lid=0.55, look=0.5), _state(lid=0.55, look=0.5)]
    for r in (0.94, 0.84, 0.7, 0.54, 0.38, 0.22, 0.08, 0.0):                # sinks back down
        S.append(_state(rise=r, lid=0.7 + 0.3 * (1 - r)))
    return S


SCRIPT = _script()


def _rest_script():
    """A seamless loop for a wyvern that stays at the window: it breathes, blinks
    slowly (the third eyelid follows the lid) and glances at the bell."""
    S = [_state() for _ in range(4)]
    S += [_state(breath=1), _state(breath=2), _state(breath=3), _state()]
    S += [_state(lid=0.8), _state(lid=1.0), _state(lid=1.0, membrane=0.6), _state(lid=0.72, membrane=0.3), _state()]
    S += [_state(look=-0.5), _state(look=-1), _state(look=-1), _state(look=-1, lid=0.5)]
    S += [_state(look=-1, breath=1), _state(look=-1, breath=2), _state(look=-1, breath=3), _state(look=-0.5)]
    S += [_state(), _state(jaw=0.2), _state(jaw=0.3), _state(jaw=0.15)]
    return S


REST = _rest_script()


def frame(s):
    s = dict(s)
    if s['rise'] <= 0:
        return Canvas(W, H)
    ease = 1 - (1 - s['rise']) ** 2
    s['oy'] = int(round((1 - ease) * 110))
    return draw(s)


def peek_frames():
    return [frame(s) for s in SCRIPT]


def rest_frames():
    return [frame(s) for s in REST]


def process_sheet():
    """The drawing process: a sheet of the stages, and a timelapse of it being drawn."""
    s = _state(lid=0.5, look=-1)
    s['oy'] = 0
    P = draw(s, stages=True)
    stages = stage_canvases(P)
    pad, lab = 6, 12
    sheet = Canvas((W + pad) * len(stages) + pad, H + pad * 2 + lab, fill='paper4')
    for i, (label, c) in enumerate(stages):
        x = pad + i * (W + pad)
        sheet.blit(c, x, pad)
        text(sheet, x + 2, pad + H + 4, label, 'wood0', script='latin')
    frames = []
    for label, c in timelapse(P):
        f = Canvas(W, H + lab, fill='paper4')
        f.blit(c, 0, 0)
        text(f, 2, H + 3, label, 'wood0', script='latin')
        frames.append(f)
    return sheet, frames
