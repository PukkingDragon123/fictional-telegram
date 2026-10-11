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

W, H = 140, 192
H_WIN = 150                # the part above the sill; below it the head can hang into the room
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
POSE_OUT = (0.97, math.radians(-46), (60.0, 59.0))     # resting at the window
POSE_IN = (1.24, math.radians(-52), (54.0, 84.0))      # leaning in: head closer, snout out over the sill


YAW = 0.0                                 # head turned toward the viewer (radians)


def set_pose(lean, yaw=0.0):
    """Blend the head frame between resting at the window and leaning in, and
    turn it toward the viewer by yaw (0..1 of a quarter turn)."""
    global K, ANG, POLL, YAW
    YAW = yaw * math.pi / 2
    e = lean * lean * (3 - 2 * lean)
    K = POSE_OUT[0] + (POSE_IN[0] - POSE_OUT[0]) * e
    ANG = POSE_OUT[1] + (POSE_IN[1] - POSE_OUT[1]) * e
    POLL = (POSE_OUT[2][0] + (POSE_IN[2][0] - POSE_OUT[2][0]) * e, POSE_OUT[2][1] + (POSE_IN[2][1] - POSE_OUT[2][1]) * e)


def follow(pts, oy, w_of_y=None):
    """Points drawn for the resting pose, carried along with the head: moved and
    scaled about the poll. w_of_y: how much each point follows (by its y)."""
    p0 = POSE_OUT[2]
    sc = K / POSE_OUT[0]
    out = []
    for x, y in pts:
        nx, ny = POLL[0] + (x - p0[0]) * sc, POLL[1] + (y - p0[1]) * sc
        w = 1.0 if w_of_y is None else w_of_y(y)
        out.append((x + (nx - x) * w, y + (ny - y) * w + oy))
    return out
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
EYE = [(_EC[0] + (x - _EC[0]) * 1.08, _EC[1] + (y - _EC[1]) * 1.08) for x, y in EYE]
SOCKET = [(_EC[0] + (x - _EC[0]) * 1.1, _EC[1] + (y - _EC[1]) * 1.1) for x, y in SOCKET]
BRIDGE = [(-30, -2.5), (-45, 1.2), (-54, 3.8), (-61, 6.3), (-66.8, 9.5), (-63, 14.5), (-55, 11.5), (-46, 9),
          (-36, 7.5), (-32, 4)]                                                    # dragon scales down the nose
SCALE_FACE = ('teal0', 'teal1', 'teal2', 'stone3', 'stone4', 'cloud2')  # pearly scales with teal edges
PLATE = ('stone1', 'paper0', 'paper1', 'paper2', 'paper3', 'paper4')    # cream belly plates
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
    Gp = lambda pts: follow(pts, oy)                                    # parts that move with the head
    Gn = lambda pts: follow(pts, oy, lambda y: float(np.clip((118 - y) / 56, 0, 1)))   # the neck bends to follow

    def F(name, pts):
        a['pts'][name] = pts
        return fill(pts)

    def TP(name, pts, r0, r1, n=6):
        a['lines'][name] = (pts, r0)
        return taper(pts, r0, r1, n)
    # horns rise from the poll and sweep back, the far one a little behind
    a['horn_far'] = TP('horn_far', Gp([(64, 61), (66, 54), (70, 49), (76, 46.5), (82.5, 48), (87.5, 53), (90.5, 60),
                                      (91.5, 66)]), 5.2, 1.3)
    a['horn_near'] = TP('horn_near', Gp([(58.5, 62), (60, 54), (64, 48.5), (70.5, 45.5), (77.5, 46.5), (83, 51),
                                        (86.5, 57.5), (88, 64)]), 6.6, 1.6)
    # a thick neck under a shaggy mane
    neck_pts = Gn([(56, 62), (70, 59), (84, 63), (98, 72), (110, 87), (122, 110), (132, 138), (134, 152), (70, 152),
                  (73, 136), (77, 118), (78, 104), (74, 94)])
    neck = F('neck', neck_pts)
    mane = tufts(neck & (YY < 118 + oy) & (XX > 64) & ~sh(neck, -2, 2), rng, 70, (3, 7), (1.4, 2.2),
                 lambda x, y: (0.75, 0.66))                                 # top of the neck: locks fall back and down
    a['mane'] = mane & ~neck
    a['neck'] = neck | a['mane']
    plates = np.zeros((H, W), bool)                                       # dragon spines poking through the mane
    for (x, y, dx, dy) in ((70, 58.5, 0.2, -1), (79, 60, 0.4, -1), (88, 65, 0.6, -0.9), (97, 71, 0.75, -0.7),
                           (105, 79, 0.85, -0.55), (112, 89, 0.95, -0.4)):
        n = math.hypot(dx, dy)
        plates |= taper(Gn([(x, y), (x + dx / n * 4, y + dy / n * 4), (x + dx / n * 8.5, y + dy / n * 8.5)]), 2.8, 0.4, n=3)
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
    a['spike'] = F('spike', Gp([(62, 68.5), (71, 70), (80, 74.5), (86.5, 81), (89, 86.5), (85, 87), (77, 83),
                               (69, 78.5), (63, 76)]))
    a['ear_in'] = F('ear_in', Gp([(66, 72), (74, 73.8), (81, 78), (85.5, 83.5), (80.5, 82.5), (73, 78.6), (66.5, 75.5)]))
    # goatee from the chin, hanging straight down
    cx, cy = Rl((-58, 34))
    cy -= oy
    beard = F('beard', G([(cx - 5, cy - 6), (cx + 3, cy - 5), (cx + 11, cy - 6), (cx + 13, cy + 1), (cx + 10, cy + 8),
                          (cx + 6.5, cy + 15), (cx + 3.5, cy + 21), (cx + 1.5, cy + 14), (cx - 3, cy + 6), (cx - 5, cy)]))
    beard |= tufts(beard & (YY > cy + oy + 6), rng, 12, (2, 4), (1.0, 1.5), lambda x, y: (0.1, 1.0))
    a['beard'] = beard
    a['beard_root'] = (cx, cy + oy)
    # two small dragon fangs over the lower lip
    a['teeth'] = [taper(Lp([(-60.5, 25.6), (-61.3, 31.2), (-59.8, 35.6)]), 2.0, 0.35, n=3),    # dragon fangs
                  taper(Lp([(-52.5, 27.0), (-52.9, 30.6), (-52.0, 33.0)]), 1.5, 0.3, n=3),
                  taper([Rl((-64.5, 30.5)), Rl((-64.8, 26.5)), Rl((-63.8, 23.2))], 1.6, 0.3, n=3)]   # lower fang, up
    # dragon parts: scaled nose bridge, a bony brow ridge with spurs, spiked frills at the jaw, belly plates
    a['bridge'] = fill(Lp(BRIDGE)) & head & ~a['muzzle'] & ~a['socket']
    a['lipscale'] = fill(Lp([(-60, 22.6), (-50, 23.6), (-40, 25.2), (-31, 28.5), (-27, 33), (-33, 32), (-42, 29.5),
                             (-52, 27.5), (-60, 26.5)])) & head & ~a['muzzle']
    a['spurs'] = taper(Lp([(-17, -0.5), (-10, -4.5), (-5, -7.5)]), 1.9, 0.3, n=3) | \
        taper(Lp([(-23, -1.5), (-17, -6), (-13, -8.5)]), 1.6, 0.3, n=3)
    a['frills'] = taper(Lp([(-14, 28), (-5, 33), (3, 39)]), 3.2, 0.4, n=4) | \
        taper(Lp([(-19, 32.5), (-12, 39), (-7, 45)]), 2.8, 0.4, n=4) | \
        taper(Lp([(-10, 20), (-1, 23), (7, 26)]), 2.8, 0.4, n=4)
    a['belly'] = fill(Gn([(74, 95), (78.5, 104), (77.5, 118), (73.5, 136), (70.5, 152), (80, 152), (83, 136),
                         (85.5, 118), (85, 104), (80, 95)])) & neck & ~a['beard']
    a['throat'] = a['neck'] & (XX < 86) & (YY > 98 + oy)
    a['wrist'] = np.zeros((H, W), bool)                                   # no arm: just the head and neck
    a['claws'] = []
    a['LX'], a['LY'] = LX, LY
    a['eyes'] = [a['eye']]
    if s.get('yaw', 0) > 0:
        turn_head(a, s)
    return a


# ---------------------------------------------------------------- turning the head (3D)
# For a turned head (yaw), the head is a solid: the profile outline lofted out to
# a width that grows from the muzzle to the cheeks, the jaw the same, and the
# markings (eyes, sockets, nostrils, muzzle, brow, scales) painted onto that
# surface by where they sit on the profile, once on each side. Horns, ears,
# spurs, frills and fangs are placed on both sides. Everything is projected with
# the head's pitch, then turned about the vertical, and the nearest surface wins.
# The resulting masks go through the same shading, fur and eye passes.
LIPS = [(-60, 22.6), (-50, 23.6), (-40, 25.2), (-31, 28.5), (-27, 33), (-33, 32), (-42, 29.5), (-52, 27.5), (-60, 26.5)]
LR_S, LR_X0, LR_Y0 = 4.0, -90.0, -20.0
LR_W, LR_H = int(110 * LR_S), int(75 * LR_S)
_LR = {}


def _lraster(name, poly):
    if name not in _LR:
        im = Image.new('L', (LR_W, LR_H), 0)
        ImageDraw.Draw(im).polygon([((x - LR_X0) * LR_S, (y - LR_Y0) * LR_S) for x, y in spline(poly)], fill=1)
        _LR[name] = np.array(im, bool)
    return _LR[name]


def _look(name, poly, x, y):
    R = _lraster(name, poly)
    i = np.clip(((y - LR_Y0) * LR_S).astype(int), 0, LR_H - 1)
    j = np.clip(((x - LR_X0) * LR_S).astype(int), 0, LR_W - 1)
    return R[i, j]


def _profile(name, poly, xs):
    """Top and bottom of a profile polygon at each x (nan where it has none)."""
    R = _lraster(name, poly)
    j = np.clip(((xs - LR_X0) * LR_S).astype(int), 0, LR_W - 1)
    col = R[:, j]
    has = col.any(axis=0)
    top = np.where(has, col.argmax(axis=0), 0) / LR_S + LR_Y0
    bot = np.where(has, LR_H - 1 - col[::-1].argmax(axis=0), 0) / LR_S + LR_Y0
    return np.where(has, top, np.nan), np.where(has, bot, np.nan)


def head_width(x):
    # narrow muzzle, the orbits bulging out round the eyes, broad cheeks, then the poll
    return np.interp(x, [-71, -64, -50, -38, -30, -24, -16, -8, -2, 3],
                     [6.0, 9.5, 12.0, 14.0, 19.5, 20.5, 18.5, 17.5, 15.0, 9.0])


def project(x, y, z, oy):
    """Head frame -> sprite (X, Y) and depth (bigger is nearer)."""
    c, s = math.cos(ANG), math.sin(ANG)
    xp, yp = x * c - y * s, x * s + y * c
    cy_, sy_ = math.cos(YAW), math.sin(YAW)
    xpp = xp * cy_ + z * sy_
    d = -xp * sy_ + z * cy_
    return POLL[0] + K * xpp, POLL[1] + oy + K * yp, d


def _to_local(X, Y):
    """Sprite point (resting pose, risen) -> head frame."""
    k, a = POSE_OUT[0], POSE_OUT[1]
    c, s = math.cos(a), math.sin(a)
    dX, dY = X - POSE_OUT[2][0], Y - POSE_OUT[2][1]
    return (dX * c + dY * s) / k, (-dX * s + dY * c) / k


def _loft_points(name, poly, x0, x1, wscale, rot=None):
    xs = np.arange(x0, x1, 0.28)
    top, bot = _profile(name, poly, xs)
    ok = ~np.isnan(top)
    xs, top, bot = xs[ok], top[ok], bot[ok]
    phi = np.linspace(0, 2 * math.pi, 300, endpoint=False)[None, :]
    yc, ry = ((top + bot) / 2)[:, None], ((bot - top) / 2 + 0.3)[:, None]
    w = (head_width(xs) * wscale)[:, None]
    sp = np.sin(phi)
    y = yc + ry * sp
    z = w * (0.62 + 0.38 * (1 + sp) / 2) * np.cos(phi)
    x = np.broadcast_to(xs[:, None], y.shape)
    x, y, z = x.ravel(), y.ravel(), z.ravel()
    if rot is not None:
        hx, hy, ang = rot
        ca, sa = math.cos(ang), math.sin(ang)
        x, y = hx + (x - hx) * ca - (y - hy) * sa, hy + (x - hx) * sa + (y - hy) * ca
    return x, y, z


def _splat(x, y, z, ids, oy):
    X, Y, D = project(x, y, z, oy)
    xi, yi = np.round(X - 0.5).astype(int), np.round(Y - 0.5).astype(int)
    ok = (xi >= 0) & (xi < W) & (yi >= 0) & (yi < H)
    xi, yi, D, ids, x, y, z = xi[ok], yi[ok], D[ok], ids[ok], x[ok], y[ok], z[ok]
    key = yi * W + xi
    order = np.lexsort((D, key))
    ks = key[order]
    last = np.r_[ks[1:] != ks[:-1], True]
    sel = order[last]
    depth = np.full(H * W, -1e9)
    part = np.zeros(H * W, int)
    lx, ly, lz = (np.zeros(H * W) for _ in range(3))
    depth[key[sel]] = D[sel]
    part[key[sel]] = ids[sel]
    lx[key[sel]], ly[key[sel]], lz[key[sel]] = x[sel], y[sel], z[sel]
    sh_ = (H, W)
    return depth.reshape(sh_), part.reshape(sh_), lx.reshape(sh_), ly.reshape(sh_), lz.reshape(sh_)


def _poly3(pts3, n=16):
    """Densify a 3D polyline (Catmull-Rom on each coordinate)."""
    P = np.array(pts3, float)
    xy = spline([(p[0], p[1]) for p in P], closed=False, n=n)
    xz = spline([(p[0], p[2]) for p in P], closed=False, n=n)
    return np.array([(a[0], a[1], b[1]) for a, b in zip(xy, xz)])


def _tube(pts3, r0, r1, oy):
    """A tapering tube (horn, spur, fang) along a 3D line: mask and depth."""
    Q = _poly3(pts3)
    X, Y, D = project(Q[:, 0], Q[:, 1], Q[:, 2], oy)
    m = taper(list(zip(X, Y)), r0 * K, r1 * K, n=2)
    dep = np.full((H, W), -1e9)
    ys, xs = np.nonzero(m)
    if len(ys):
        d2 = (xs[:, None] + 0.5 - X[None, :]) ** 2 + (ys[:, None] + 0.5 - Y[None, :]) ** 2
        dep[ys, xs] = D[d2.argmin(1)] + 0.6
    return m, dep, list(zip(X, Y))


def _sheet(base, dirL, dirW, length, hw_of_u, oy, u0=0.0, u1=1.0):
    """A leaf-shaped sheet (an ear) in 3D: mask and depth."""
    us = np.linspace(u0, u1, 24)
    left = [base + dirL * length * u + dirW * hw_of_u(u) for u in us]
    right = [base + dirL * length * u - dirW * hw_of_u(u) for u in us[::-1]]
    P = np.array(left + right)
    X, Y, D = project(P[:, 0], P[:, 1], P[:, 2], oy)
    im = Image.new('L', (W, H), 0)
    ImageDraw.Draw(im).polygon(list(zip(X, Y)), fill=1)
    m = np.array(im, bool)
    dep = np.full((H, W), -1e9)
    ys, xs = np.nonzero(m)
    if len(ys):
        d2 = (xs[:, None] + 0.5 - X[None, :]) ** 2 + (ys[:, None] + 0.5 - Y[None, :]) ** 2
        dep[ys, xs] = D[d2.argmin(1)] + 0.4
    return m, dep


def turn_head(a, s):
    """Replace the head's masks with the turned (yawed) solid head."""
    oy = a['oy']
    ang = -math.radians(8) * s['jaw']
    hx, hy = HINGE
    pts = []
    x, y, z = _loft_points('head', HEAD, -71.5, 3.5, 1.0)
    pts.append((x, y, z, np.full(len(x), 1)))
    x, y, z = _loft_points('jaw', JAW, -66.5, -23.5, 0.82, rot=(hx, hy, ang))
    pts.append((x, y, z, np.full(len(x), 2)))
    if s['jaw'] > 0.05:                                         # the inside of the open mouth
        xs = np.arange(-65, -44, 0.3)
        lt = np.interp(xs, [p[0] for p in LIP], [p[1] for p in LIP])
        mx, my, mz = [], [], []
        for zz in np.linspace(-0.62, 0.62, 13):
            for t in np.linspace(0, 1, 7):
                yy = lt + 0.3 + t * 4.5
                ca, sa = math.cos(ang * t), math.sin(ang * t)
                rx_, ry_ = hx + (xs - hx) * ca - (yy - hy) * sa, hy + (xs - hx) * sa + (yy - hy) * ca
                mx.append(rx_); my.append(ry_); mz.append(head_width(xs) * zz)
        mx, my, mz = np.concatenate(mx), np.concatenate(my), np.concatenate(mz)
        pts.append((mx, my, mz, np.full(len(mx), 3)))
    x = np.concatenate([p[0] for p in pts]); y = np.concatenate([p[1] for p in pts])
    z = np.concatenate([p[2] for p in pts]); ids = np.concatenate([p[3] for p in pts])
    dep, part, LXs, LYs, LZs = _splat(x, y, z, ids, oy)
    # parts on both sides
    layers = {}
    near_horn = [(*_to_local(X, Y), 0) for X, Y in [(58.5, 62), (60, 54), (64, 48.5), (70.5, 45.5), (77.5, 46.5),
                                                     (83, 51), (86.5, 57.5), (88, 64)]]
    lines = {}
    for side, key in ((1, 'horn_near'), (-1, 'horn_far')):
        h3 = [(p[0], p[1], side * (4.5 + 7.0 * k / 7)) for k, p in enumerate(near_horn)]
        m, d, cl = _tube(h3, 6.6 / POSE_OUT[0], 1.6 / POSE_OUT[0], oy)
        layers[key] = (m, d)
        lines[key] = (cl, 6.6 * K / POSE_OUT[0])
    for nm, pl, r0, r1 in (('spurs', [(-17, -0.5), (-10, -4.5), (-5, -7.5)], 1.9, 0.3),
                           ('spurs', [(-23, -1.5), (-17, -6), (-13, -8.5)], 1.6, 0.3),
                           ('frills', [(-14, 28), (-5, 33), (3, 39)], 3.2, 0.4),
                           ('frills', [(-19, 32.5), (-12, 39), (-7, 45)], 2.8, 0.4),
                           ('frills', [(-10, 20), (-1, 23), (7, 26)], 2.8, 0.4),
                           ('teeth', [(-60.5, 25.6), (-61.3, 31.2), (-59.8, 35.6)], 2.0, 0.35),
                           ('teeth', [(-52.5, 27.0), (-52.9, 30.6), (-52.0, 33.0)], 1.5, 0.3),
                           ('teeth_low', [(-64.5, 30.5), (-64.8, 26.5), (-63.8, 23.2)], 1.6, 0.3)):
        for side in (1, -1):
            p3 = []
            for k, (px_, py_) in enumerate(pl):
                if nm == 'teeth_low':
                    ca, sa = math.cos(ang), math.sin(ang)
                    px_, py_ = hx + (px_ - hx) * ca - (py_ - hy) * sa, hy + (px_ - hx) * sa + (py_ - hy) * ca
                wz = head_width(px_)
                zz = {'spurs': 0.7 * wz, 'frills': 0.85 * wz + 2.5 * k, 'teeth': 0.62 * wz,
                      'teeth_low': 0.55 * wz}[nm]
                p3.append((px_, py_, side * zz))
            m, d, _ = _tube(p3, r0, r1, oy)
            key = 'teeth' if nm.startswith('teeth') else nm
            if key in layers:
                om, od = layers[key]
                layers[key] = (om | m, np.maximum(od, d))
            else:
                layers[key] = (m, d)
    # ears: leaves sticking out to each side, back and down
    bx, by = _to_local(62.5, 70)
    tx_, ty_ = _to_local(88.0, 86.0)
    v2 = np.array([tx_ - bx, ty_ - by])
    ln2 = np.linalg.norm(v2)
    for side in (1, -1):
        dL = np.array([v2[0] / ln2, v2[1] / ln2, side * 0.95])
        dL /= np.linalg.norm(dL)
        dW = np.array([math.sin(ANG), math.cos(ANG), 0.0])          # the leaf's width runs up and down on screen
        base = np.array([bx, by, side * 13.0])
        length = ln2 / math.hypot(dL[0], dL[1])
        hw = lambda u: 4.6 * math.sin(math.pi * min(1, u) ** 0.75) * (1 - 0.25 * u) + 0.6
        m, d = _sheet(base, dL, dW, length, hw, oy)
        mi, di = _sheet(base + dW * 0.2, dL, dW, length, lambda u: hw(u) * 0.5, oy, 0.15, 0.9)
        for key, mm, dd in (('spike', m, d), ('ear_in', mi, di + 0.05)):
            if key in layers:
                om, od = layers[key]
                layers[key] = (om | mm, np.maximum(od, dd))
            else:
                layers[key] = (mm, dd)
    # nearest wins
    names = ['surface'] + list(layers)
    stack = np.stack([dep] + [layers[k][1] for k in layers])
    win = stack.argmax(0)
    any_ = stack.max(0) > -1e8
    surf = any_ & (win == 0)
    head = surf & (part == 1)
    jaw = surf & (part == 2)
    a['head'], a['jaw'] = head, jaw
    a['mouth'] = surf & (part == 3)
    for k in layers:
        i = names.index(k)
        a[k] = any_ & (win == i)
    a['spike'] = a['spike'] | a['ear_in']
    a['teeth'] = [a.pop('teeth')]
    hs = head | jaw
    w_ = head_width(LXs)
    side_n, side_f = LZs > 0, LZs < 0
    eye_r = _look('eye', EYE, LXs, LYs) & head
    a['eyes'] = [m for m in (eye_r & side_n, eye_r & side_f) if m.sum() > 2]
    a['eye'] = eye_r if a['eyes'] else np.zeros((H, W), bool)
    a['socket'] = _look('socket', SOCKET, LXs, LYs) & head
    a['brow'] = _look('brow', BROW, LXs, LYs) & head
    a['cheek'] = _look('cheek', CHEEK, LXs, LYs) & head
    a['muzzle'] = _look('muzzle', MUZZLE, LXs, LYs) & head
    a['nostril'] = _look('nostril', NOSTRIL, LXs, LYs) & head & (np.abs(LZs) > 0.6)
    a['bridge'] = _look('bridge', BRIDGE, LXs, LYs) & head & (np.abs(LZs) < 0.34 * w_) & ~a['muzzle'] & ~a['socket']
    a['lipscale'] = _look('lips', LIPS, LXs, LYs) & head & ~a['muzzle']
    # the goatee hangs straight down from the chin
    ca, sa = math.cos(ang), math.sin(ang)
    chx, chy = hx + (-58 - hx) * ca - (34 - hy) * sa, hy + (-58 - hx) * sa + (34 - hy) * ca
    cx, cy, _ = project(chx, chy, 0.0, oy)
    cy -= oy
    G = lambda pts_: [(px_, py_ + oy) for px_, py_ in pts_]
    beard = fill(G([(cx - 5, cy - 6), (cx + 3, cy - 5), (cx + 11, cy - 6), (cx + 13, cy + 1), (cx + 10, cy + 8),
                    (cx + 6.5, cy + 15), (cx + 3.5, cy + 21), (cx + 1.5, cy + 14), (cx - 3, cy + 6), (cx - 5, cy)]))
    a['beard'] = beard
    a['lines'] = dict(a['lines'], **lines)
    LX0, LY0 = a['LX'], a['LY']
    a['LX'] = np.where(hs, LXs, LX0)
    a['LY'] = np.where(hs, LYs, LY0)
    a['LZ'] = np.where(hs, LZs, 0.0)
    a['belly'] = a['belly'] & ~hs & ~beard
    a['throat'] = a['throat'] & ~hs
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
    far_v = 0.1 + 0.5 * lit(form(a['horn_far'], 3)) if YAW < 0.5 else 0.2 + 0.7 * lit(form(a['horn_far'], 3))
    put_ramp(cv, a['horn_far'], HORN, np.clip(far_v, 0, 1))
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
    for key in ('spurs', 'frills'):                                         # bony dragon spurs and frill spikes
        put_ramp(cv, a[key], HORN, np.clip(0.25 + 0.7 * lit(form(a[key], 1.6)), 0, 1))
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
        ~a['nostril'] & ~a['muzzle'] & ~a['ear_in'] & ~a['bridge'] & ~a['lipscale'] & ~a['belly'] & ~a['spurs'] & ~a['frills']
    LY = a['LY']
    c, s = math.cos(ANG), math.sin(ANG)
    face = ((-1 * c - 0.3 * s) * math.cos(YAW), -1 * s + 0.3 * c)   # head frame (-1, 0.3): toward the nose
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
    rgb = cv.a[..., :3]
    furc = [tuple(PAL[c]) for c in FUR]
    idx = np.full((H, W), 3)
    for i, c in enumerate(furc):                                            # light on the fur before texture
        idx[(rgb[..., 0] == c[0]) & (rgb[..., 1] == c[1]) & (rgb[..., 2] == c[2])] = i
    fur(a, cv)
    LX, LY = a['LX'], a['LY']
    # overlapping scales down the nose bridge: rows across the face, each scale a rounded plate with a
    # lit upper edge and a dark curved rim where it overlaps the next
    su, sv = 3.8, 2.7
    row = np.floor(LY / sv)
    u = -LX / su + 0.5 * (row % 2)
    fu, fv = u - np.floor(u), LY / sv - row
    rim = np.abs(fv - (0.8 - 0.6 * (2 * fu - 1) ** 2)) < 0.2
    top = (fv < 0.3) & (fu > 0.2) & (fu < 0.65)
    tone = _hash2(np.floor(u), row, 4.0)
    base_i = np.where(a['lipscale'], np.clip(idx + 1, 3, 4), np.minimum(idx, 4))     # the lip band stays pale
    sc = base_i - np.where(a['lipscale'], 2, 3) * rim + 1 * (top & ~rim) - 1 * ((tone < 0.25) & ~rim)
    m = a['bridge'] | a['lipscale']
    put_ramp(cv, m, SCALE_FACE, np.clip((sc + 0.5) / len(SCALE_FACE), 0, 0.999))
    # small scales round the eye and along the brow
    ring = (sh(a['socket'], 1, 0) | sh(a['socket'], -1, 0) | sh(a['socket'], 0, 2)) & a['head'] & ~a['socket'] & \
        ~a['bridge'] & ~a['eye']
    cell = _hash2(np.floor(XX / 2), np.floor(YY / 2), 6.0)
    put_ramp(cv, ring, SCALE_FACE, np.clip((idx - 1 + (cell > 0.5) + 0.5) / len(SCALE_FACE), 0, 0.999))
    # cream belly plates down the throat, with dark seams
    bm = a['belly']
    seam = ((YY - a['oy'] + (XX - 78) * 0.25) % 4.5) < 1.0
    pv = idx + 0 - 2 * seam + 1 * (((YY - a['oy'] + (XX - 78) * 0.25) % 4.5) < 2.0) * ~seam
    put_ramp(cv, bm, PLATE, np.clip((pv + 0.5) / len(PLATE), 0, 0.999))
    put(cv, edge(bm) & bm & (XX < 80), 'paper0')
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
    """Each visible eye (one in profile, two when the head turns to you)."""
    for e in a.get('eyes', [a['eye']]):
        _one_eye(a, s, cv, e)


def _one_eye(a, s, cv, e):
    """A goat-dragon eye, kept clean: a dark rim all round, an amber iris that is
    deeper at the top and glows at the bottom, a crisp horizontal bar pupil with a
    thin gold edge, one window glint, a soft furry upper lid with a black lash
    line, and when shut, a curved crease with a few lashes."""
    ys, xs = np.nonzero(e)
    if len(ys) < 3:
        return
    y0, y1 = ys.min(), ys.max()
    x0, x1 = xs.min(), xs.max()
    ecx, ecy = (x0 + x1) / 2, (y0 + y1) / 2
    rx, ry = max(1.0, (x1 - x0 + 1) / 2), max(1.0, (y1 - y0 + 1) / 2)
    ring = (sh(e, 1, 0) | sh(e, -1, 0) | sh(e, 0, 1) | sh(e, 0, -1)) & ~e
    lid = 1.0 if s['lid'] >= 0.95 else float(np.clip((s['lid'] - 0.45) / 0.55, 0, 1))
    if lid >= 0.99:                                                       # shut: fur over it, a curved crease
        put_ramp(cv, e | ring, FUR, np.clip(0.55 + 0.3 * lit(form(e | ring | a['brow'], 2)), 0, 0.999))
        crease = e & (np.abs(YY - (ecy + 0.35 * ry - 0.45 * ry * (1 - ((XX - ecx) / rx) ** 2))) < 0.6)
        put(cv, crease, 'stone0')
        put(cv, sh(crease, 0, 1) & e & ~crease, 'stone2')
        for k in (-0.5, 0.0, 0.45):                                        # lashes
            lx_ = int(round(ecx + k * rx))
            col = np.nonzero(crease[:, lx_])[0] if 0 <= lx_ < W else []
            if len(col) and col[-1] + 1 < H:
                cv.a[col[-1] + 1, lx_] = (*PAL['stone1'], 255)
        return
    cx, cy = ecx + s['look'] * 1.2, ecy + 0.2
    r = np.sqrt(((XX - cx) / rx) ** 2 + ((YY - cy) / ry) ** 2)
    v = 0.25 + 0.75 * np.clip((YY - y0) / max(1, y1 - y0), 0, 1) - 0.25 * (r > 0.75)
    put_ramp(cv, e, IRIS, np.clip(v, 0, 0.999))
    pw = max(1.6, rx * 0.5)
    pupil = e & (np.abs(XX + 0.5 - cx) < pw) & (np.abs(YY + 0.5 - cy) < 1.0)
    put(cv, (sh(pupil, 0, 1) & e & ~pupil), 'gold4')                      # thin gold edge below the pupil
    put(cv, pupil, 'ink')
    if s['membrane'] > 0:                                                 # third eyelid, from the front corner
        film = e & (XX < x0 + (x1 - x0 + 1) * s['membrane'])
        put(cv, film & ((XX + YY) % 2 == 0), 'cloud2')
        put(cv, film & ((XX + YY) % 2 == 1), 'cloud1')
    put(cv, ring, 'stone1')                                               # dark rim all round
    put(cv, ring & (YY > ecy + 0.5), 'stone2')
    lid_y = y0 - 0.5 + (y1 - y0 + 1.5) * lid
    lidm = (e | (ring & (YY < ecy))) & (YY <= lid_y)
    put_ramp(cv, lidm, FUR, np.clip(0.55 + 0.3 * lit(form(lidm | a['brow'], 2)), 0, 0.999))
    seam = (lidm & ~sh(lidm, 0, -1)) | (ring & (YY < ecy) & ~lidm)          # black lash line over the eye
    put(cv, seam & (e | ring), 'ink')
    if s['lid'] < 0.85:
        gx, gy = int(round(cx - rx * 0.45)), int(round(max(lid_y + 1, cy - ry * 0.45)))
        if 0 <= gy < H and 0 <= gx < W and e[gy, gx] and not lidm[gy, gx] and not pupil[gy, gx]:
            cv.a[gy, gx] = (*PAL['white'], 255)                              # window glint


def final(a, cv):
    """Stage 7: fold the lines into the colours, contact shadows, highlights, the sky rim."""
    solid = cv.a[..., 3] == 255
    rgb = cv.a[..., :3]
    out = edge(solid)
    put(cv, out, 'stone2')
    put(cv, out & (~sh(solid, -1, 0) | ~sh(solid, 0, -1)), 'stone1')      # darker only on the shadow side
    for front, back, k in (('head', 'neck', -1), ('jaw', 'neck', -1), ('horn_near', 'head', -2), ('horn_near', 'neck', -2),
                           ('spike', 'neck', -1), ('spike', 'head', -1), ('beard', 'neck', -1), ('jaw', 'beard', -1),
                           ('wrist', 'neck', -2), ('horn_near', 'horn_far', -1), ('frills', 'neck', -2),
                           ('spurs', 'head', -1), ('bridge', 'head', 0)):
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
        nx, ny, _ = project(-66.0, 15.0, 0.0, oy)
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
        if s.get('lean', 0) <= 0:
            _effects(cv, s)
            return cv
        # leaning in: the head (and its outline) also goes on a front canvas, drawn over the sill
        hg = a['head'] | a['jaw'] | a['brow'] | a['horn_near'] | a['horn_far'] | a['spike'] | a['beard'] | \
            a['muzzle'] | a['spurs'] | a['frills'] | a['mouth'] | a['eye']
        for t in a['teeth']:
            hg |= t
        hg = (hg | sh(hg, 1, 0) | sh(hg, -1, 0) | sh(hg, 0, 1) | sh(hg, 0, -1)) & (cv.a[..., 3] > 0)
        front = Canvas(W, H)
        front.a[hg] = cv.a[hg]
        _effects(cv, s)
        _effects(front, dict(s, dust=0))
        return cv, front
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
    s = dict(rise=1.0, jaw=0.0, look=0.0, lid=0.55, membrane=0.0, breath=0, dust=0, lean=0.0, yaw=0.0)
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
    S += [_state(lid=0.5, look=-1, lean=v) for v in (0.2, 0.45, 0.7, 0.9, 1.0)]   # leans in over the sill
    S += [_state(lid=0.5, look=-1, lean=1, breath=1), _state(lid=0.5, look=-1, lean=1, breath=2),
          _state(lid=0.52, look=-1, lean=1, breath=3), _state(lid=0.55, look=-0.5, lean=1)]   # a long breath out
    S += [_state(lid=0.55, lean=1, yaw=v) for v in (0.2, 0.45, 0.75, 1.0)]       # turns to face you
    S += [_state(lid=0.55, lean=1, yaw=1), _state(lid=0.55, lean=1, yaw=1), _state(lid=0.8, lean=1, yaw=1),
          _state(lid=1.0, lean=1, yaw=1), _state(lid=0.7, lean=1, yaw=1), _state(lid=0.55, lean=1, yaw=1),
          _state(lid=0.55, lean=1, yaw=1, breath=1), _state(lid=0.55, lean=1, yaw=1, breath=2),
          _state(lid=0.55, lean=1, yaw=1, breath=3), _state(lid=0.55, lean=1, yaw=1)]   # looks at you, blinks, huffs
    S += [_state(lid=0.55, lean=1, yaw=v) for v in (0.75, 0.45, 0.2)]            # turns back
    S += [_state(lid=0.6, jaw=0.35, lean=1), _state(lid=0.7, jaw=0.8, lean=1), _state(lid=0.8, jaw=1.0, lean=1),
          _state(lid=0.75, jaw=0.6, lean=1), _state(lid=0.6, jaw=0.15, lean=1)]   # the jaw parts with a sigh
    S += [_state(lid=0.55, look=0.5, lean=1), _state(lid=0.55, look=0.5, lean=1)]
    S += [_state(lid=0.55, look=0.5, lean=v) for v in (0.8, 0.5, 0.2)]          # leans back out
    for r in (0.94, 0.84, 0.7, 0.54, 0.38, 0.22, 0.08, 0.0):                # sinks back down
        S.append(_state(rise=r, lid=0.7 + 0.3 * (1 - r)))
    return S


SCRIPT = _script()


def _rest_script():
    """A seamless loop for a wyvern that stays at the window: it breathes, blinks
    slowly (the third eyelid follows the lid) and glances at the bell."""
    L = dict(lean=1.0)                                                    # head in over the sill
    S = [_state(**L) for _ in range(3)]
    S += [_state(breath=1, **L), _state(breath=2, **L), _state(breath=3, **L), _state(**L)]
    S += [_state(lid=0.8, **L), _state(lid=1.0, **L), _state(lid=1.0, membrane=0.6, **L),
          _state(lid=0.72, membrane=0.3, **L), _state(**L)]
    S += [_state(yaw=v, **L) for v in (0.25, 0.55, 0.85, 1.0)]                  # turns to look at you
    S += [_state(yaw=1, **L), _state(yaw=1, **L), _state(yaw=1, lid=0.85, **L), _state(yaw=1, lid=1.0, **L),
          _state(yaw=1, lid=0.7, **L), _state(yaw=1, **L), _state(yaw=1, breath=1, **L), _state(yaw=1, breath=2, **L),
          _state(yaw=1, breath=3, **L), _state(yaw=1, **L)]
    S += [_state(yaw=v, **L) for v in (0.85, 0.55, 0.25)]                       # and back
    S += [_state(look=-0.5, **L), _state(look=-1, **L), _state(look=-1, **L), _state(look=-1, lid=0.5, **L)]
    S += [_state(**L), _state(jaw=0.2, **L), _state(jaw=0.3, **L), _state(jaw=0.15, **L)]
    return S


REST = _rest_script()


def frame(s):
    """(outside, front): the goat behind the window, and the part of its head that
    leans in over the sill (empty unless it is leaning in)."""
    s = dict(s)
    if s['rise'] <= 0:
        return Canvas(W, H), Canvas(W, H)
    ease = 1 - (1 - s['rise']) ** 2
    s['oy'] = int(round((1 - ease) * 110))
    set_pose(s.get('lean', 0.0), s.get('yaw', 0.0))
    try:
        out = draw(s)
    finally:
        set_pose(0.0)
    return out if isinstance(out, tuple) else (out, Canvas(W, H))


_CACHE = {}


def _pairs(name):
    if name not in _CACHE:
        _CACHE[name] = [frame(s) for s in (SCRIPT if name == 'peek' else REST)]
    return _CACHE[name]


def peek_frames():
    return [b for b, _ in _pairs('peek')]


def rest_frames():
    return [b for b, _ in _pairs('rest')]


def peek_front_frames():
    return [f for _, f in _pairs('peek')]


def rest_front_frames():
    return [f for _, f in _pairs('rest')]


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
