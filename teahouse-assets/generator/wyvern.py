"""The old rock wyvern who lives outside the tea-room window, drawn by hand.

The head is drawn the way a painter would build it, and every stage is
kept so the drawing process can be shown:

  1 construction  cranium circle, snout box, head axis, eye line, neck and horn gestures
  2 sketch        loose pencil outlines over the construction, shadow hatching
  3 line art      clean ink outlines of every part and the key inner lines
  4 flats         local colour per material: cool grey stone, old horn, ivory teeth, amber eye
  5 shading       light from the upper left: planes with rounded edges, cast shadows under
                  the brow, the upper jaw, the head and the horns, reflected light below
  6 texture       armoured rock scutes (big on the skull and neck, small on the snout and
                  lips), cracks, pale and orange lichen, moss in the hollows
  7 final         lines folded into the colours (dark only on the shadow side), a wet glint
                  in the eye, worn highlights on teeth and horns, a cool sky rim from behind

The anatomy is a real reptile's: a long heavy skull with a bony brow shelf
over a deep-set eye, a crocodile overbite with irregular interlocking teeth,
nostrils on top of the snout, a banded throat, a thick armoured neck and a
clawed wing-wrist gripping the sill. It rests its chin on the sill, calm and
old, and only its eye, breath and jaw move.
"""
import math
import random
import numpy as np
from PIL import Image, ImageDraw
from pixel import Canvas, PAL, text

W, H = 140, 150
LIGHT = np.array([-0.55, -0.72, 0.42])
LIGHT = LIGHT / np.linalg.norm(LIGHT)

ROCK = ('stone0', 'stone1', 'stone2', 'stone3', 'stone4', 'paper3')
HORN = ('wood0', 'wood1', 'wood3', 'paper1', 'paper2', 'paper3')
TOOTH = ('stone1', 'paper0', 'paper1', 'paper2', 'paper3', 'paper4')
BELLY = ('stone1', 'stone2', 'paper0', 'paper1', 'paper2', 'paper3')
MOUTH = ('ink', 'red0', 'red0', 'red1', 'red2', 'red3')
IRIS = ('copper1', 'copper2', 'gold2', 'gold3', 'gold4', 'gold4')
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
    from pixel import step
    if not m.any():
        return
    cols = rgb[m]
    uniq, inv = np.unique(cols.reshape(-1, 3), axis=0, return_inverse=True)
    new = np.array([step(tuple(int(v) for v in c), n) for c in uniq], np.uint8)
    rgb[m] = new[inv.reshape(-1)]


YY, XX = np.mgrid[0:H, 0:W].astype(float)


# ---------------------------------------------------------------- the anatomy (hand-placed points)
def anatomy(s):
    """All shapes for a pose. s: dict with oy (rise offset), jaw (0..1)."""
    oy = s['oy']
    T = lambda pts: [(x, y + oy) for x, y in pts]
    a = {'oy': oy, 'pts': {}, 'lines': {}}

    def F(name, pts):
        a['pts'][name] = pts
        return fill(pts)

    def TP(name, pts, r0, r1, n=6):
        a['lines'][name] = (pts, r0)
        return taper(pts, r0, r1, n)
    a['horn_far'] = TP('horn_far', T([(95, 80), (101, 66), (110, 55), (121, 48), (131, 46)]), 4.5, 1.2)
    a['neck'] = F('neck', T([(98, 86), (108, 79), (120, 74), (132, 74), (142, 80), (144, 152), (86, 152), (88, 136),
                        (94, 122), (100, 108)]))
    plates = np.zeros((H, W), bool)                                       # dorsal plates along the neck
    for (x, y, r) in ((112, 77, 4.2), (121, 73, 4.6), (131, 72, 4.8), (140, 74, 4.8)):
        plates |= taper(T([(x - 3, y + 3), (x, y - r), (x + 3, y + 3)]), 2.6, 0.8, n=3)
    a['plates'] = plates
    hinge = (96, 114 + oy)                                                # lower jaw opens round its hinge
    ang = -math.radians(16) * s['jaw']

    def R(p):
        x, y = p[0] - hinge[0], p[1] + oy - hinge[1]
        ca, sa = math.cos(ang), math.sin(ang)
        return (hinge[0] + x * ca - y * sa, hinge[1] + x * sa + y * ca)
    jaw_pts = [(29, 121), (26, 126), (29, 132), (38, 137), (52, 141), (68, 142), (82, 140), (92, 134), (99, 124),
               (100, 117), (94, 118), (80, 122), (60, 123), (42, 122)]
    a['jaw'] = F('jaw', [R(p) for p in jaw_pts])
    if s['jaw'] > 0.05:
        a['mouth'] = fill([(26, 117 + oy), (60, 121 + oy), (88, 119 + oy), R((88, 121)), R((60, 123)), R((30, 121))])
    else:
        a['mouth'] = np.zeros((H, W), bool)
    a['head'] = F('head', T([(106, 84), (100, 77), (92, 73), (84, 72), (78, 73), (70, 72), (62, 74), (57, 79), (52, 84),
                        (46, 88), (40, 90), (34, 92), (28, 95), (24, 99), (21, 104), (20, 109), (22, 114), (27, 117),
                        (33, 116), (40, 119), (47, 118), (54, 121), (62, 120), (70, 122), (78, 121), (86, 119),
                        (94, 117), (100, 113), (105, 106), (108, 96)]))
    a['brow'] = F('brow', T([(55, 81), (60, 75), (70, 71), (82, 72), (90, 76), (92, 81), (86, 82), (76, 80), (66, 81),
                        (60, 84)]))
    a['spike'] = TP('spike', T([(87, 80), (93, 76), (100, 73)]), 2.2, 0.5, n=3)      # spike behind the eye
    a['cheek'] = F('cheek', T([(60, 97), (74, 95), (90, 98), (100, 104), (98, 112), (86, 114), (70, 112), (60, 106)]))
    a['eye'] = F('eye', T([(63, 87), (67, 84), (74, 83), (80, 86), (75, 89), (67, 90)]))
    a['socket'] = F('socket', T([(59, 87), (65, 81), (75, 80), (84, 85), (78, 92), (66, 93)]))
    a['nostril'] = F('nostril', T([(28, 101), (31, 99.5), (35, 100), (32, 102)]))
    a['horn_near'] = TP('horn_near', T([(99, 84), (106, 72), (116, 62), (127, 56), (137, 55)]), 5.5, 1.3)
    teeth = []                                                            # upper teeth hang over the jaw: the overbite
    lip = {24: 116, 29: 116.5, 34: 116.5, 39: 118.5, 46: 118, 51: 119.5, 58: 120.5, 64: 120.5, 71: 121.5, 78: 121,
           85: 119.5}
    for (x, ln, r) in ((24, 4, 1.3), (29, 8, 2.0), (34, 3, 1.1), (39, 6, 1.6), (46, 3, 1.1), (51, 5, 1.5),
                       (58, 2, 0.9), (64, 5, 1.4), (71, 3, 1.1), (78, 4, 1.2), (85, 2, 0.9)):
        y0 = lip[x] + oy
        bend = 0.8 if x < 50 else 0.4
        teeth.append(taper([(x, y0 - 1), (x + bend * 0.4, y0 + ln * 0.6), (x + bend, y0 + ln)], r, 0.35, n=3))
    for (x, ln, r) in ((31, 5, 1.3), (43, 3, 1.0)):                             # the front lower teeth interlock
        teeth.append(taper([R((x, 122)), R((x - 0.4, 122 - ln))], r, 0.3, n=2))
    a['teeth'] = teeth
    a['throat'] = a['neck'] & ((~sh(a['neck'], 7, 0) & (YY > 118 + oy)) | ((XX < 104) & (YY > 124 + oy)))
    a['wrist'] = F('wrist', [(106, 132), (114, 126), (124, 127), (130, 134), (126, 142), (112, 143)])
    a['claws'] = [taper([(111, 140), (109, 144), (106, 147.5)], 2.0, 0.4, n=3),
                  taper([(120, 141), (119, 145), (116, 148)], 2.2, 0.4, n=3)]
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
    T = lambda pts: [(x, y + oy) for x, y in pts]
    curves = [T([(144, 70), (122, 72), (104, 82), (82, 74), (60, 76), (40, 90), (20, 106)]),       # top line
              T([(18, 112), (40, 120), (70, 122), (98, 116), (112, 100)]),                          # mouth line
              T([(24, 124), (40, 138), (66, 143), (90, 136), (100, 120)]),                          # jaw sweep
              T([(98, 86), (114, 64), (138, 54)]), T([(94, 82), (110, 58), (132, 46)]),             # horns
              T([(100, 112), (92, 132), (88, 152)]), T([(140, 80), (144, 152)]),                    # neck
              T([(104, 140), (114, 126), (128, 132), (126, 146)])]                                   # wing-wrist
    out = []
    for c in curves:
        out += hand_strokes(c, False, rng, wobble=1.3, overshoot=6, seg=(30, 60), overlap=0)
    return out


def construction_strokes(s, rng):
    oy = s['oy']
    out = []
    circ = [(86 + 19 * math.cos(t), 94 + oy + 19 * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 12, endpoint=False)]
    out += hand_strokes(circ, True, rng, wobble=1.0, overshoot=4, seg=(18, 40))          # cranium
    for c in ([(56, 84), (24, 100), (22, 116), (58, 122)], [(56, 84), (58, 122)],        # snout box
              [(48, 86), (96, 86)], [(110, 98), (66, 100), (18, 110)]):                # eye line, head axis
        out += hand_strokes([(x, y + oy) for x, y in c], False, rng, wobble=0.6, overshoot=5, seg=(20, 50))
    return out


def sketch_strokes(a, rng):
    """Pencil over the construction: every part drawn in short overlapping strokes,
    the important contours gone over twice."""
    out = []
    for key in ('head', 'jaw', 'neck', 'brow', 'cheek', 'eye', 'wrist', 'nostril'):
        pts = a['pts'][key]
        out += hand_strokes(pts, True, rng, wobble=0.8, overshoot=2.5)
        if key in ('head', 'jaw', 'brow'):
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


def hatch_strokes(a, rng):
    """Shadow hatching: short diagonal strokes, each placed by hand."""
    oy = a['oy']
    shade = (a['neck'] & ~sh(a['head'], 0, -4) & (XX > 104)) | (sh(a['brow'], 1, 3) & a['head']) | \
            (a['jaw'] & (YY > 132 + oy)) | (a['head'] & (XX > 92) & (YY > 104 + oy))
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
    m = np.zeros((H, W), bool)
    circ = [(86 + 19 * math.cos(t), 94 + oy + 19 * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 24, endpoint=False)]
    m |= line_mask(circ, closed=True)                                       # cranium
    m |= line_mask([(56, 84 + oy), (24, 100 + oy), (22, 116 + oy), (58, 122 + oy)])        # snout box
    m |= line_mask([(56, 84 + oy), (58, 122 + oy)])
    m |= line_mask([(110, 98 + oy), (66, 100 + oy), (18, 110 + oy)])                       # head axis
    m |= line_mask([(48, 86 + oy), (96, 86 + oy)])                                          # eye line
    m |= line_mask([(26, 124 + oy), (50, 140 + oy), (82, 141 + oy), (98, 120 + oy)])       # jaw
    m |= line_mask([(100, 84 + oy), (124, 72 + oy), (144, 78 + oy)])                       # neck top
    m |= line_mask([(90, 128 + oy), (86, 150 + oy)])                                        # throat
    m |= line_mask([(99, 84 + oy), (118, 60 + oy), (138, 55 + oy)])                        # horn gesture
    m |= line_mask([(108, 136), (124, 128), (128, 144)])                                    # wing-wrist
    return m


def sketch_lines(a, seed=3):
    """Loose pencil: outlines with gaps and the odd doubled stroke."""
    m = np.zeros((H, W), bool)
    for k, key in enumerate(('head', 'jaw', 'neck', 'brow', 'eye', 'cheek', 'wrist', 'horn_near', 'horn_far',
                             'plates')):
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
    oy = a['oy']
    shade = (a['neck'] & ~sh(a['head'], 0, -4) & (XX > 104)) | (sh(a['brow'], 1, 3) & a['head']) | \
            (a['jaw'] & (YY > 132 + oy)) | (a['head'] & (XX > 90) & (YY > 104 + oy))
    return shade & ((XX + YY) % 4 == 0)


def ink_lines(a):
    """Stage 3: clean outlines and the key inner lines."""
    oy = a['oy']
    m = np.zeros((H, W), bool)
    for key in ('head', 'jaw', 'neck', 'brow', 'horn_near', 'horn_far', 'wrist', 'plates', 'spike'):
        m |= edge(a[key])
    m |= edge(a['eye']) | edge(a['nostril'])
    for t in a['teeth'] + a['claws']:
        m |= edge(t)
    m |= line_mask([(62, 98 + oy), (78, 96 + oy), (96, 102 + oy)]) & a['head']             # cheek ridge
    m |= line_mask([(92, 116 + oy), (100, 108 + oy), (104, 96 + oy)]) & a['head']          # jaw muscle
    for k in range(4):                                                                      # throat folds
        m |= line_mask([(90 + k * 2, 126 + oy + k * 6), (100 + k * 2, 125 + oy + k * 6), (112, 128 + oy + k * 6)]) & a['neck']
    return m


def flats(a):
    cv = Canvas(W, H)
    put(cv, a['horn_far'], 'wood1')
    put(cv, a['neck'] | a['plates'], 'stone2')
    put(cv, a['throat'], 'paper0')
    put(cv, a['jaw'], 'stone2')
    put(cv, a['mouth'], 'red1')
    put(cv, a['head'] | a['brow'], 'stone2')
    put(cv, a['horn_near'] | a['spike'], 'wood3')
    for t in a['teeth']:
        put(cv, t, 'paper2')
    put(cv, a['eye'], 'gold2')
    put(cv, a['nostril'], 'stone0')
    put(cv, a['wrist'], 'stone2')
    for c in a['claws']:
        put(cv, c, 'paper1')
    return cv


def shading(a):
    """Stage 5: light the planes, then cast shadows and reflected light."""
    cv = Canvas(W, H)
    oy = a['oy']
    put_ramp(cv, a['horn_far'], HORN, 0.15 + 0.55 * lit(form(a['horn_far'], 3)))
    neck = a['neck'] | a['plates']
    nv = 0.12 + 0.75 * lit(form(a['neck'], 9), (0.25, -0.1))
    nv = nv - 0.22 * (sh(a['head'], 2, 5) & a['neck'])                     # the head's cast shadow
    put_ramp(cv, a['neck'], ROCK, np.clip(nv, 0, 1))
    put_ramp(cv, a['plates'] & ~a['neck'], ROCK, 0.25 + 0.6 * lit(form(a['plates'], 2)))
    bands = ((YY - oy) % 6 < 1)
    put_ramp(cv, a['throat'], BELLY, np.clip(0.1 + 0.7 * lit(form(a['neck'], 9), (0.2, 0.3)) - 0.3 * bands, 0, 1))
    jv = 0.1 + 0.6 * lit(form(a['jaw'], 5), (0.0, 0.35))
    jv = jv - 0.25 * (sh(a['head'], 1, 3) & a['jaw'])                      # under the upper jaw
    bulge = ((XX - 90) / 9) ** 2 + ((YY - 126 - oy) / 7) ** 2 < 1                # jaw muscle
    jv = jv + 0.15 * (bulge & (XX + YY < 90 + 126 + oy + 2)) - 0.1 * (bulge & (XX + YY > 90 + 126 + oy + 6))
    jv = jv - 0.12 * (np.abs(YY - (126 + oy + (XX - 30) * 0.05)) < 0.8) * (XX < 84)   # groove along the lower lip
    put_ramp(cv, a['jaw'], ROCK, np.clip(jv, 0, 1))
    if a['mouth'].any():
        put_ramp(cv, a['mouth'], MOUTH, np.clip(0.2 + 0.5 * (YY - YY[a['mouth']].min()) / 8, 0, 1))
    n = form(a['head'], 8, 2.4)
    v = 0.16 + 0.78 * lit(n)
    v = v + 0.08 * (a['head'] & ~sh(a['head'], 0, 4)) + 0.05 * (a['head'] & ~sh(a['head'], 0, 2))
    v = v - 0.14 * np.clip(dist(a['cheek'], 5) / 4, 0, 1)                    # the cheek turns away, softly
    ridge = np.abs(YY - (96 + oy + (XX - 60) * 0.12)) < 1.5
    under = (YY > 98 + oy + (XX - 60) * 0.12) & (YY < 106 + oy + (XX - 60) * 0.1) & (XX > 58)
    v = v + 0.1 * (ridge & (XX > 58) & (XX < 100)) - 0.12 * under             # cheekbone and its shadow
    v = v - 0.1 * (YY > 108 + oy)                                           # the lower side turns under
    v = v - 0.08 * ((XX < 56) & (YY > 104 + oy))                            # the side of the muzzle
    v = v + 0.06 * (noise(XX / 9.0, (YY - oy) / 9.0, 31) - 0.5) * 2         # broad mottling in the stone
    v = v - 0.3 * (sh(a['brow'], 1, 3) & ~a['brow'])                        # brow shadow over the eye
    v = v - 0.25 * (sh(a['horn_near'], 1, 3) & ~a['horn_near'])
    v = v - 0.22 * a['socket']
    v = v + 0.1 * (~sh(a['head'], 0, -3) & (XX < 90))                       # reflected light on the lip
    put_ramp(cv, a['head'], ROCK, np.clip(v, 0, 1))
    put_ramp(cv, a['brow'], ROCK, np.clip(0.3 + 0.7 * lit(form(a['brow'], 2)), 0, 1))
    put_ramp(cv, a['horn_near'], HORN, np.clip(0.2 + 0.75 * lit(form(a['horn_near'], 3)), 0, 1))
    put_ramp(cv, a['spike'], HORN, np.clip(0.25 + 0.7 * lit(form(a['spike'], 1.5)), 0, 1))
    for t in a['teeth']:
        tv = 0.35 + 0.6 * lit(form(t, 1.5))
        put_ramp(cv, t, TOOTH, np.clip(tv, 0, 1))
    put(cv, a['nostril'], 'ink')
    put(cv, sh(a['nostril'], 0, -1) & ~a['nostril'] & a['head'], 'stone4')
    put_ramp(cv, a['wrist'], ROCK, np.clip(0.18 + 0.75 * lit(form(a['wrist'], 4)), 0, 1))
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


def scutes(a, cv):
    """Scales by region, like a real reptile's: big domed osteoderms over the crown
    and down the neck, a row of knobs along the cheek ridge, and fine granular
    scales on the face, lips and jaw."""
    oy = a['oy']
    rgb = cv.a[..., :3]
    body = (a['head'] | a['neck'] | a['jaw'] | a['brow'] | a['wrist']) & ~a['eye'] & ~a['nostril'] & ~a['throat']
    crown = (a['head'] | a['brow']) & ~sh(a['head'] | a['brow'], 0, 9) & (XX > 50)
    big = body & ((a['neck'] & ~a['head'] & ~a['jaw']) | crown | a['wrist'])
    small = body & ~big
    # big osteoderms: domes with a lit upper-left, shaded lower-right, deep cracks, each its own tone
    v = _voronoi(big, lambda x, y: 7.0 if a['neck'][y, x] and not a['head'][y, x] else 5.6, 9)
    if v:
        S, near, d1, d2 = v
        sp = S[near, 2]
        rx, ry = (XX - S[near, 0]) / sp, (YY - S[near, 1]) / sp
        face = rx * LIGHT[0] + ry * LIGHT[1]
        crack = big & (d2 - d1 < 0.9)
        tone = _hash2(S[near, 0].round(), S[near, 1].round(), 5.0)
        _step(rgb, big & ~crack & (face > 0.1), 1)
        _step(rgb, big & ~crack & (face < -0.25), -1)
        _step(rgb, big & ~crack & (tone > 0.8), 1)
        _step(rgb, big & ~crack & (tone < 0.15), -1)
        _step(rgb, crack, -1)
        _step(rgb, crack & ~sh(crack, 0, 1), -1)
    # cheek ridge: a row of knobby scutes from under the eye back to the jaw
    for k, (x, y) in enumerate(((62, 97), (68, 96), (74, 96), (80, 97), (86, 98), (92, 100), (97, 103))):
        r = 2.2 + 0.25 * k
        m = (((XX - x) / r) ** 2 + ((YY - y - oy) / (r * 0.8)) ** 2 <= 1) & a['head']
        _step(rgb, m & ~sh(m, 1, 1), 1)
        _step(rgb, m & ~sh(m, -1, -1), -1)
    # fine granular scales: only a faint crack pattern, a few lighter grains
    v = _voronoi(small, lambda x, y: 3.6 if x > 40 else 3.0, 12)
    if v:
        S, near, d1, d2 = v
        crack = small & (d2 - d1 < 0.7)
        _step(rgb, crack & ((XX + YY) % 3 != 0), -1)
        grain = small & ~crack & (_hash2(S[near, 0].round(), S[near, 1].round(), 8.0) > 0.85)
        _step(rgb, grain, 1)


def texture(a, cv):
    """Stage 6: scutes, weathering, lichen and moss."""
    oy = a['oy']
    scutes(a, cv)
    rgb = cv.a[..., :3]
    body = a['head'] | a['neck'] | a['jaw'] | a['brow']
    rng = random.Random(4)
    for pts in (((88, 78), (92, 84), (90, 90)), ((112, 90), (116, 98), (114, 108), (118, 116)), ((44, 104), (47, 110)),
                ((124, 96), (128, 104)), ((70, 128), (74, 134))):          # weathering cracks
        m = line_mask([(x, y + oy) for x, y in pts]) & body
        _step(rgb, m, -2)
        _step(rgb, sh(m, 1, 0) & body & ~m, 1)
    for k in range(3):                                                    # wrinkles under the eye
        m = line_mask([(60 - k, 91 + oy + k * 2), (70, 94 + oy + k * 2.4), (82 - k, 91 + oy + k * 2)]) & a['head'] & ~a['eye']
        _step(rgb, m, -1)
    # crustose lichen: pale grey-green blotches with ragged edges on the old upper surfaces
    up = body & ~sh(body, 0, 7)
    lich = up & (noise(XX / 4.0, (YY - oy) / 4.0, 11) > 0.62) & (noise(XX * 0.8, YY * 0.8, 13) > 0.35)
    _step(rgb, lich, 1)
    put(cv, lich & ((XX * 3 + YY * 5) % 7 == 0), 'haze3')
    put(cv, lich & ((XX * 5 + YY * 3) % 9 == 0), 'jade3')
    crown = (a['head'] | a['neck']) & ~sh(a['head'] | a['neck'], 0, 4) & (XX > 70)
    mossy = crown & (noise(XX / 4.0, (YY - oy) / 4.0, 5) > 0.42)
    put(cv, mossy, 'leaf2')
    put(cv, mossy & ~sh(mossy, 0, 1), 'leaf3')
    put(cv, mossy & ~sh(mossy, -1, -1) & (noise(XX, YY, 3) > 0.6), 'leaf4')
    put(cv, mossy & ~sh(mossy, 0, -1), 'leaf1')
    tufts = np.zeros((H, W), bool)
    for x in range(72, 140, 5):
        col = np.nonzero(crown[:, x])[0]
        if len(col) and rng.random() < 0.6:
            for k in range(1, rng.randint(2, 4)):
                if col[0] - k >= 0:
                    tufts[col[0] - k, x] = True
    put(cv, tufts, 'leaf3')
    for k in range(5):                                                    # throat folds
        m = line_mask([(88, 124 + oy + k * 6), (100, 122 + oy + k * 6), (114, 125 + oy + k * 6)]) & a['throat']
        _step(rgb, m, -1)
    for key, ring in (('horn_near', ((104, 76), (111, 67), (118, 61), (126, 57))),
                      ('horn_far', ((101, 68), (108, 58), (116, 52)))):  # growth rings on the horns
        for (x, y) in ring:
            m = line_mask([(x - 3, y + oy - 3), (x + 3, y + oy + 3)]) & a[key]
            _step(rgb, m, -1)


def eye(a, s, cv):
    """Amber iris, vertical pupil, a heavy lid, the wet glint, the third eyelid."""
    oy = a['oy']
    e = a['eye']
    ys, xs = np.nonzero(e)
    if not len(ys):
        return
    y0, y1 = ys.min(), ys.max()
    put_ramp(cv, e, IRIS, np.clip(0.2 + 0.75 * (YY - y0) / max(1, y1 - y0), 0, 1))
    cx, cy = 72 + s['look'] * 3, 86.5 + oy
    pupil = e & (np.abs(XX - cx) < 1.2) & (np.abs(YY - cy) < 3.2)
    put(cv, e & (np.abs(XX - cx) < 2.2) & ~pupil & (np.abs(YY - cy) < 2), 'copper1')
    put(cv, pupil, 'ink')
    if s['membrane'] > 0:                                                 # third eyelid, from the front corner
        film = e & (XX < 63 + 18 * s['membrane'])
        put(cv, film & ((XX + YY) % 2 == 0), 'haze3')
        put(cv, film & ((XX + YY) % 2 == 1), 'haze2')
    lid_y = y0 - 1 + (y1 - y0 + 2) * s['lid']
    lidm = a['socket'] & (YY <= lid_y) & (e | sh(e, 0, -1) | sh(e, 0, 1))
    lv = 0.26 + 0.3 * lit(form(lidm | a['brow'], 2)) + 0.12 * ((YY - y0) < 2)
    put_ramp(cv, lidm, ROCK, np.clip(lv, 0, 1))
    put(cv, lidm & (((XX * 2 + YY) % 5) == 0), 'stone1')                  # fine scales on the lid
    put(cv, sh(lidm, 0, 1) & e & ~lidm, 'stone0')                         # the lid's shadow on the eye
    seam = lidm & ~sh(lidm, 0, -1) & (sh(e, 0, 1) | e)                    # the lid's edge: a dark slit when shut
    put(cv, seam, 'ink' if s['lid'] >= 0.95 else 'stone1')
    if s['lid'] >= 0.95:
        put(cv, sh(seam, 0, 1) & a['head'] & ~seam, 'stone1')
    if s['lid'] < 0.85:
        gx, gy = int(round(cx - 3)), int(round(max(lid_y + 1.5, 85 + oy)))
        if 0 <= gy < H and 0 <= gx < W - 1 and e[gy, gx]:
            cv.a[gy, gx] = (*PAL['white'], 255)                              # wet glint
            if e[gy, gx + 1]:
                cv.a[gy, gx + 1] = (*PAL['paper4'], 255)
    low = sh(e, 0, 1) & ~e & a['head']
    put(cv, low, 'stone3')
    put(cv, sh(low, 0, 1) & ~e & ~low & a['head'], 'stone1')


def final(a, cv):
    """Stage 7: fold the lines into the colours, highlights and the sky rim."""
    solid = cv.a[..., 3] == 255
    rgb = cv.a[..., :3]
    out = edge(solid)
    put(cv, out, 'stone1')
    put(cv, out & (~sh(solid, -1, 0) | ~sh(solid, 0, -1)), 'ink')         # dark only on the shadow side
    for front, back in (('head', 'neck'), ('head', 'jaw'), ('horn_near', 'head'), ('horn_near', 'neck'),
                        ('brow', 'head'), ('wrist', 'neck'), ('jaw', 'neck'), ('spike', 'head')):
        contact = sh(a[front], 1, 1) & ~a[front] & a[back]
        _step(rgb, contact & solid, -2)
    for t in a['teeth']:
        _step(rgb, sh(t, 1, 1) & ~t & (a['jaw'] | a['mouth']), -1)
    for key in ('horn_near', 'plates', 'spike'):                          # worn ridges catch the light
        put(cv, a[key] & ~sh(a[key], 1, 1) & ~edge(a[key]) & (noise(XX * 0.7, YY * 0.7, 2) > 0.45), 'paper3')
    rim = solid & ~sh(solid, -2, 0) & ~sh(solid, -1, 1) & (XX > 96) & ~out  # cool sky light from behind
    put(cv, rim & (a['neck'] | a['plates'] | a['horn_near']), 'haze2')


def _effects(cv, s):
    oy = s['oy']
    if s['breath']:                                                       # breath condensing in the cool air
        k = s['breath']
        for j, (dx, dy, r) in enumerate(((-4, -2, 1.6), (-8, -5, 2.4), (-11, -10, 3.2))):
            if j >= k:
                continue
            cx, cy = 26 + dx - k, 99 + oy + dy
            d = ((XX - cx) / r) ** 2 + ((YY - cy) / (r * 0.8)) ** 2
            cv.a[(d <= 1) & ((XX + YY) % 2 == 0)] = (*PAL['cloud3'], 255)
            cv.a[(d < 0.4) & ((XX + YY) % 2 == 1)] = (*PAL['cloud2'], 255)
    if s['dust']:
        rng = random.Random(s['dust'])
        for _ in range(12):
            x = rng.choice((rng.uniform(26, 90), rng.uniform(104, 128)))
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
    order = ['neck', 'horn_far', 'jaw', 'head', 'brow', 'horn_near', 'wrist']
    done = np.zeros((H, W), bool)
    for key in order:
        done |= a[key]
        if key == 'head':
            for t in a['teeth']:
                done |= t
            done |= a['eye'] | a['nostril']
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
