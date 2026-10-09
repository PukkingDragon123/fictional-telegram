"""The old rock wyvern who lives outside the tea-room window.

A fat, friendly old giant of a wyvern, drawn at full scene resolution
(one sprite pixel = one scene pixel). Its head is modelled, not outlined:
a set of soft 3D blobs (cranium, jowls, a broad muzzle, a receding chin,
a thick neck) melted together into one height field, lit from the upper
left with a cool sky rim from behind, ambient occlusion in the creases,
then snapped to the palette. Parts that sit in front of others (muzzle
over chin, brows, horns, teeth, ears, fingers) get a contour line where
they overlap.

On top of the shading go the details of an old giant: sleepy kind eyes
with heavy lids and bags, crow's feet and smile lines, forehead wrinkles,
weathered cracks, bushy lichen eyebrows and beard, worn and chipped horns,
moss with tiny flowers and a mushroom on its crown, old blunt fangs
hanging over its lower lip (it still has its overbite), and fat fingers
with worn claws resting on the sill.
"""
import math
import random
import numpy as np
from pixel import Canvas, PAL

W, H = 140, 150
NEG = -1e9

X, Y = np.meshgrid(np.arange(W, dtype=float) + 0.5, np.arange(H, dtype=float) + 0.5)
# The model is built in its own units and drawn at 80% so the whole fat head
# (horns and mossy crown in the window's pointed top, chin on the sill) fits.
S = 0.8
AX, AY, DX = 70.0, 147.0, 3.0
XM = (X - AX - DX) / S + AX
YM = (Y - AY) / S + AY


def to_screen(x, y):
    return AX + DX + (x - AX) * S, AY + (y - AY) * S

RAMP = {
    'rock': ('stone0', 'stone1', 'stone2', 'stone3', 'stone4'),
    'jowl': ('stone0', 'stone1', 'stone2', 'stone3', 'stone4'),
    'plate': ('stone1', 'paper0', 'paper1', 'paper2', 'paper3'),
    'horn': ('wood1', 'wood3', 'paper1', 'paper2', 'paper3'),
    'tooth': ('stone2', 'paper2', 'paper3', 'paper4', 'white'),
    'lichen': ('jade0', 'jade1', 'jade2', 'jade3', 'jade4'),
    'mouth': ('red0', 'red0', 'red1', 'red2', 'red3'),
    'tongue': ('red1', 'red2', 'red3', 'pink2', 'pink3'),
    'claw': ('wood1', 'paper0', 'paper1', 'paper2', 'paper3'),
    'frill': ('stone0', 'stone1', 'stone2', 'stone3', 'stone4'),
}
LIGHT = np.array([-0.5, -0.62, 0.6])
LIGHT = LIGHT / np.linalg.norm(LIGHT)
RIM = np.array([0.75, -0.35, -0.2])
RIM = RIM / np.linalg.norm(RIM)


def _noise(seed, scale):
    """Smooth value noise over the sprite (bilinear on a coarse grid)."""
    rng = np.random.RandomState(seed)
    gw, gh = W // scale + 3, (H + 140) // scale + 3
    g = rng.rand(gh, gw)
    xs = np.arange(W) / scale
    ys = np.arange(H + 140) / scale
    x0 = np.floor(xs).astype(int); fx = xs - x0
    y0 = np.floor(ys).astype(int); fy = ys - y0
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
    a = g[y0][:, x0]; b = g[y0][:, x0 + 1]; c = g[y0 + 1][:, x0]; d = g[y0 + 1][:, x0 + 1]
    top = a * (1 - fx) + b * fx
    bot = c * (1 - fx) + d * fx
    return top * (1 - fy[:, None]) + bot * fy[:, None]


GRAIN = 0.6 * _noise(3, 3) + 0.4 * _noise(8, 9)          # rock grain, scrolls with the head


# ---------------------------------------------------------------- primitives (height fields)
def ell(cx, cy, cz, rx, ry, rz):
    q = 1 - ((XM - cx) / rx) ** 2 - ((YM - cy) / ry) ** 2
    return np.where(q > 0, (cz + rz * np.sqrt(np.clip(q, 0, None))) * S, NEG)


def tube(pts, r0, r1, z0, z1):
    """A tube along a polyline, radius and centre depth easing from one end to the other."""
    out = np.full((H, W), NEG)
    n = len(pts) - 1
    L = [math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(n)]
    tot = sum(L) or 1
    acc = 0
    for i in range(n):
        (ax, ay), (bx, by) = pts[i], pts[i + 1]
        dx, dy = bx - ax, by - ay
        ll = dx * dx + dy * dy or 1
        t = np.clip(((XM - ax) * dx + (YM - ay) * dy) / ll, 0, 1)
        d = np.hypot(XM - (ax + t * dx), YM - (ay + t * dy))
        g = (acc + t * L[i]) / tot
        r = r0 + (r1 - r0) * g
        z = z0 + (z1 - z0) * g
        h = np.where(d < r, (z + np.sqrt(np.clip(r * r - d * d, 0, None))) * S, NEG)
        out = np.maximum(out, h)
        acc += L[i]
    return out


def smooth_union(fields, k=5.0):
    """Melt height fields together (log-sum-exp): fat, soft creases."""
    F = np.stack(fields)
    m = F.max(axis=0)
    ok = m > NEG / 2
    s = np.exp(np.clip((F - m) / k, -60, 0)).sum(axis=0)
    h = np.where(ok, m + k * np.log(np.where(ok, s, 1)), NEG)
    return h, F.argmax(axis=0)


def _blur(a, r):
    k = 2 * r + 1
    p = np.pad(a, r, mode='edge')
    c = np.cumsum(np.cumsum(p, 0), 1)
    c = np.pad(c, ((1, 0), (1, 0)))
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)


# ---------------------------------------------------------------- the model
MUZ = (46, 104, 26, 36, 15, 30)                     # the broad upper jaw (cx, cy, cz, rx, ry, rz)


def _lip_y(x, s):
    """Bottom edge of the upper jaw (where the fangs hang from)."""
    cx, cy, _, rx, ry, _ = MUZ
    cx += s['look'] * 2
    q = 1 - ((x - cx) / rx) ** 2
    return cy + s['oy'] + ry * math.sqrt(max(0.0, q)) - 1.5


def _parts(s):
    """Groups of parts for state s: (name, [(field, material)], smoothness)."""
    oy = s['oy']
    sq = s['squash']
    jaw = s['jaw'] * 15
    lx = s['look'] * 2                      # the head turns a little toward what it looks at
    cx, cy, cz, rx, ry, rz = MUZ
    head = [
        (ell(70 + lx * 0.5, 66 + oy, 0, 40, 33, 36), 'rock'),          # cranium
        (ell(68 + lx * 0.6, 52 + oy, 10, 26, 16, 28), 'rock'),         # brow mound
        (ell(44 + lx, 93 + oy + sq, 14, 24, 21, 27), 'jowl'),          # near jowl (fat)
        (ell(96 + lx * 0.6, 91 + oy + sq, 8, 22, 20, 25), 'jowl'),     # far jowl
        (ell(cx + lx, cy + oy, cz, rx, ry, rz), 'rock'),               # long broad muzzle
        (ell(24 + lx * 1.2, 99 + oy, 44, 14, 11, 14), 'rock'),         # bulbous old nose
    ]
    hh, _ = smooth_union([p[0] for p in head], 6.0)
    ridge = []                                                          # rounded plates up the nose
    for k, (x, y, r) in enumerate(((30, 91, 4.2), (37, 86, 4.6), (44, 80, 0), (52, 70, 4.4), (58, 62, 4.6),
                                    (63, 54, 4.2), (67, 46, 3.6))):
        if not r:
            continue
        x += lx
        y += oy
        sx_, sy_ = to_screen(x, y)
        xi, yi = int(min(W - 1, max(0, sx_))), int(min(H - 1, max(0, sy_)))
        z = hh[yi, xi] / S if hh[yi, xi] > NEG / 2 else 30
        ridge.append((ell(x, y, z - 2.0, r, r * 0.8, 4.0), 'rock'))
    jawg = [
        (ell(56 + lx, 121 + oy + jaw, 18, 24, 9 + sq, 21), 'rock'),    # lower jaw, tucked back: the overbite
        (ell(64 + lx * 0.5, 131 + oy + jaw * 0.7 + sq, 6, 34 + 3 * sq, 13 - sq, 28), 'rock'),   # double chin
        (ell(74, 156 + oy, 0, 52, 32, 42), 'plate'),                    # thick neck, plated throat
    ]
    frill = [(ell(15 + lx * 0.5, 85 + oy, 0, 14, 19, 8), 'frill'), (ell(126 + lx * 0.4, 81 + oy, -4, 12, 17, 7), 'frill')]
    spines = []
    for (root, tips, z) in (((30, 86), ((10, 66), (5, 82), (9, 99)), 12), ((112, 82), ((132, 64), (136, 79), (131, 95)), 6)):
        for t in tips:
            mid = ((root[0] + t[0]) / 2 + lx * 0.5, (root[1] + t[1]) / 2 + oy - 2)
            spines.append((tube([(root[0] + lx * 0.5, root[1] + oy), mid, (t[0] + lx * 0.5, t[1] + oy)], 2.2, 0.8, z + 2, z),
                           'horn'))
    horn = [
        (tube([(50 + lx * 0.5, 50 + oy), (51 + lx * 0.5, 36 + oy), (56 + lx * 0.5, 24 + oy), (65 + lx * 0.5, 16 + oy),
               (75 + lx * 0.5, 14 + oy), (80 + lx * 0.5, 17 + oy)], 7.0, 2.2, -6, -8), 'horn'),
        (tube([(88 + lx * 0.5, 48 + oy), (95 + lx * 0.5, 34 + oy), (104 + lx * 0.5, 25 + oy), (113 + lx * 0.5, 22 + oy),
               (119 + lx * 0.5, 26 + oy)], 6.5, 2.4, -10, -12), 'horn'),
    ]
    brow = [
        (tube([(27 + lx, 68 + oy - s['brow']), (40 + lx, 62 + oy - s['brow'] * 1.5), (55 + lx, 64 + oy - s['brow'])],
              4.0, 3.2, 40, 42), 'lichen'),
        (tube([(77 + lx * 0.7, 62 + oy - s['brow']), (89 + lx * 0.7, 59 + oy - s['brow'] * 1.5),
               (100 + lx * 0.7, 64 + oy - s['brow'])], 3.4, 3.0, 34, 34), 'lichen'),
    ]
    whisk = []
    sw = math.sin(s['t'] * 1.7) * 1.2
    whisk.append((tube([(18 + lx, 104 + oy), (12 + lx + sw * 0.3, 112 + oy), (14 + sw, 124 + oy), (20 + sw, 134 + oy)],
                       2.8, 1.0, 54, 46), 'lichen'))
    whisk.append((tube([(74 + lx, 111 + oy), (82 + lx * 0.6, 118 + oy), (86 + sw, 128 + oy), (83 + sw, 138 + oy)],
                       2.4, 0.9, 44, 40), 'lichen'))
    teeth = []
    for (x, ln, r) in ((30, 11, 3.4), (40, 6, 2.2), (57, 5, 2.0), (64, 9, 3.0)):     # a gap where one fell out
        x += lx
        top = _lip_y(x, s)
        bend = -1.2 if x < 50 else 1.0
        teeth.append((tube([(x, top - 1), (x + bend * 0.3, top + ln * 0.6), (x + bend, top + ln)], r, 0.7, 52, 50),
                      'tooth'))
    beard = []
    for k, (bx, ln, r) in enumerate(((57, 9, 2.0), (62, 15, 2.6), (68, 19, 3.0), (74, 14, 2.4), (79, 8, 1.8))):
        sway = math.sin(s['t'] * 2 + k * 0.7) * 1.0
        y0 = 136 + oy + jaw * 0.7
        ex = 68 + (bx - 68) * 0.35 + sway                             # strands gather to a point: a goatee
        beard.append((tube([(bx + lx * 0.5, y0), ((bx + ex) / 2 + lx * 0.3, y0 + ln * 0.55), (ex, y0 + ln)],
                           r, 0.6, 44 + k % 2, 40), 'lichen'))
    hand = []
    if s['hands']:
        for (hx, flip) in ((24, 1), (115, -1)):
            hy = 141 + s['grip']
            hand.append((ell(hx, hy + 6, 30, 14, 9, 14), 'rock'))
            for j, fx in enumerate((-8, 0, 8)):
                hand.append((ell(hx + fx, hy, 34, 5.0, 5.5, 8), 'rock'))
    mouth = []
    if s['jaw'] > 0.05:
        mouth.append((ell(52 + lx, 119 + oy + jaw * 0.5, 34, 25, 3 + jaw * 0.6, 4), 'mouth'))
        mouth.append((ell(54 + lx, 122 + oy + jaw * 0.85, 36, 14, 2 + jaw * 0.25, 3), 'tongue'))
    return [('neck', jawg, 6.0), ('mouth', mouth, 2.0), ('frill', frill, 2.0), ('spine', spines, 1.0),
            ('horn', horn, 1.5), ('head', head, 6.0), ('ridge', ridge, 1.0), ('brow', brow, 1.5),
            ('beard', beard, 1.0), ('teeth', teeth, 1.0), ('whisker', whisk, 1.0), ('hand', hand, 3.0)]


def _render(s):
    groups = _parts(s)
    h = np.full((H, W), NEG)
    gid = np.full((H, W), -1)
    mat = np.full((H, W), '', dtype=object)
    names = []
    for gi, (name, parts, k) in enumerate(groups):
        names.append(name)
        if not parts:
            continue
        hg, am = smooth_union([p[0] for p in parts], k)
        mats = np.array([p[1] for p in parts], dtype=object)[am]
        front = hg > h
        h = np.where(front, hg, h)
        gid = np.where(front, gi, gid)
        mat = np.where(front, mats, mat)
    solid = h > NEG / 2
    # normals per group (one-sided at group edges)
    hf = np.where(solid, h, 0)
    gx = np.zeros_like(hf); gy = np.zeros_like(hf)
    for (dx, dy) in ((1, 0), (0, 1)):
        nb = np.roll(np.roll(hf, -dy, 0), -dx, 1)
        nb_same = np.roll(np.roll(gid, -dy, 0), -dx, 1) == gid
        pb = np.roll(np.roll(hf, dy, 0), dx, 1)
        pb_same = np.roll(np.roll(gid, dy, 0), dx, 1) == gid
        d = np.where(nb_same & pb_same, (nb - pb) / 2, np.where(nb_same, nb - hf, np.where(pb_same, hf - pb, 0)))
        d = np.where(nb_same | pb_same, d, 0)
        # silhouette: falls off steeply
        out_n = ~(np.roll(np.roll(solid, -dy, 0), -dx, 1))
        out_p = ~(np.roll(np.roll(solid, dy, 0), dx, 1))
        d = np.where(out_n & ~out_p, -4.0, np.where(out_p & ~out_n, 4.0, d))
        if dx:
            gx = np.clip(d, -5, 5)
        else:
            gy = np.clip(d, -5, 5)
    n = np.stack([-gx, -gy, np.ones_like(gx)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    dif = np.clip(n @ LIGHT, 0, 1)
    rim = np.clip(n @ RIM, 0, 1) ** 2 * (1 - n[..., 2])
    # ambient occlusion: lower than the surroundings
    hb = _blur(np.where(solid, h, np.where(solid.any(), h[solid].min() if solid.any() else 0, 0)), 4)
    ao = np.clip((hb - hf) / 7, 0, 1) * solid
    gy_ = np.clip((YM - s['oy']).astype(int) + 70, 0, GRAIN.shape[0] - 1)
    grain = GRAIN[gy_, np.clip(XM.astype(int), 0, W - 1)]
    v = 0.12 + 0.8 * dif - 0.55 * ao + (grain - 0.5) * 0.16
    v = np.where(np.isin(mat, ['tooth', 'claw']), v + 0.1, v)
    v = np.where(mat == 'lichen', v + (grain - 0.5) * 0.25, v)
    cv = Canvas(W, H)
    cuts = (0.2, 0.36, 0.54, 0.74)
    idx = np.zeros((H, W), int)
    for c in cuts:
        idx += (v > c)
    for name, ramp in RAMP.items():
        m = solid & (mat == name)
        if not m.any():
            continue
        for i, cname in enumerate(ramp):
            sel = m & (idx == i)
            cv.a[sel] = (*PAL[cname], 255)
    # sky light from behind: a cool rim on the far edges of the rock
    rimm = solid & (rim > 0.32) & np.isin(mat, ['rock', 'jowl', 'frill', 'plate'])
    cv.a[rimm] = (*PAL['cloud1'], 255)
    # contours where a part sits in front of another
    for (dx, dy) in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        og = np.roll(np.roll(gid, dy, 0), dx, 1)
        oh = np.roll(np.roll(h, dy, 0), dx, 1)
        line = solid & (og != gid) & (og >= 0) & (oh > h + 1.5)
        cv.a[line] = (*PAL['stone0'], 255)
    # neck plates: bands across the throat
    plate = solid & (mat == 'plate')
    band = plate & (((YM - s['oy']) % 7) < 1.25)
    cv.a[band] = (*PAL['stone1'], 255)
    return cv, h, gid, mat, solid, names


# ---------------------------------------------------------------- painted details
def _px(cv, x, y, c):
    x, y = to_screen(x, y)
    x, y = int(round(x)), int(round(y))
    if 0 <= x < W and 0 <= y < H and cv.a[y, x, 3]:
        cv.a[y, x] = (*PAL[c], 255)


def _pxa(cv, x, y, c):
    x, y = to_screen(x, y)
    x, y = int(round(x)), int(round(y))
    if 0 <= x < W and 0 <= y < H:
        cv.a[y, x] = (*PAL[c], 255)


def _line(cv, pts, c, only=None):
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for k in range(n + 1):
            t = k / n
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            _px(cv, x, y, c)


def _arc(cv, cx, cy, rx, ry, a0, a1, c, step=4):
    pts = [(cx + rx * math.cos(math.radians(a)), cy + ry * math.sin(math.radians(a))) for a in range(a0, a1 + 1, step)]
    _line(cv, pts, c)


def _eye(cv, cx, cy, rx, ry, s, near):
    look = s['look']
    if s['eyes'] == 'happy':                                    # ^^ smiling eyes
        for k, c in ((2, 'stone0'), (3, 'stone0'), (4, 'stone0'), (5, 'stone0'), (6.5, 'stone3')):
            _arc(cv, cx, cy + k, rx, ry * 0.95, 200, 340, c, 3)
        _arc(cv, cx, cy + 9, rx * 0.8, ry * 0.5, 30, 150, 'stone3', 5)             # cheeks pushed up
        return
    if s['eyes'] == 'closed':                                   # sleepy, closed
        for k, c in ((-4.5, 'stone3'), (-3, 'stone0'), (-2, 'stone0'), (-1, 'stone0')):
            _arc(cv, cx, cy + k, rx, ry * 0.7, 15, 165, c, 3)
        for k in (-0.6, 0, 0.6):                                                # lashes
            _line(cv, [(cx + k * rx, cy - 1 + ry * 0.7), (cx + k * rx * 1.15, cy + 1.5 + ry * 0.7)], 'stone0')
        return
    # socket shadow, then the glowing amber eye
    for y in range(int(cy - ry - 2), int(cy + ry + 3)):
        for x in range(int(cx - rx - 2), int(cx + rx + 3)):
            d = ((x + 0.5 - cx) / (rx + 1.6)) ** 2 + ((y + 0.5 - cy) / (ry + 1.6)) ** 2
            if d <= 1:
                _px(cv, x, y, 'stone1')
    for y in range(int(cy - ry - 1), int(cy + ry + 2)):
        for x in range(int(cx - rx - 1), int(cx + rx + 2)):
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            d = dx * dx + dy * dy
            if d <= 1:
                c = 'gold1' if d > 0.72 else ('gold2' if d > 0.35 else 'gold3')
                if dx < -0.1 and dy < -0.1 and d < 0.5:
                    c = 'gold4'
                _px(cv, x, y, c)
    # big round pupil (friendly, not a slit)
    px_, py_ = cx + look * rx * 0.32, cy + 0.6
    pr = rx * 0.48
    for y in range(int(py_ - pr - 1), int(py_ + pr + 2)):
        for x in range(int(px_ - pr - 1), int(px_ + pr + 2)):
            if ((x + 0.5 - px_) / pr) ** 2 + ((y + 0.5 - py_) / (pr * 1.05)) ** 2 <= 1:
                _px(cv, x, y, 'ink')
    _px(cv, px_ - pr * 0.45, py_ - pr * 0.5, 'white'); _px(cv, px_ - pr * 0.45 + 1, py_ - pr * 0.5, 'white')
    _px(cv, px_ - pr * 0.45, py_ - pr * 0.5 + 1, 'white')
    _px(cv, px_ + pr * 0.5, py_ + pr * 0.45, 'paper4')
    # heavy old upper lid, drooping over the top of the eye
    lid = s['lid']
    edge = cy - ry + 2 * ry * lid
    for y in range(int(cy - ry - 2), int(edge) + 1):
        for x in range(int(cx - rx - 2), int(cx + rx + 3)):
            d = ((x + 0.5 - cx) / (rx + 1.6)) ** 2 + ((y + 0.5 - cy) / (ry + 1.6)) ** 2
            if d <= 1:
                _px(cv, x, y, 'stone3' if y < edge - 2 else 'stone2')
    for x in range(int(cx - rx - 1), int(cx + rx + 2)):
        t = (x + 0.5 - cx) / (rx + 1)
        if abs(t) <= 1:
            yy = edge + 0.8 * (1 - t * t) - 0.4
            _px(cv, x, yy, 'stone0')
            if abs(t) > 0.55:
                _px(cv, x, yy + 1, 'stone0')                  # lid crease thickens at the corners
    # bags under the eye (old), and crow's feet at the outer corner
    _arc(cv, cx, cy + 1, rx + 1, ry + 2.5, 30, 150, 'stone1', 3)
    _arc(cv, cx, cy + 2, rx + 1, ry + 3.5, 40, 140, 'stone3', 3)
    _arc(cv, cx, cy + 3, rx, ry + 5, 50, 130, 'stone1', 4)
    ox = cx - rx - 2 if near else cx + rx + 2
    sgn = -1 if near else 1
    for k in (-3, 0, 3):
        _line(cv, [(ox, cy + k * 0.6), (ox + sgn * 4, cy + k * 1.3)], 'stone1')


def _details(cv, s, solid):
    oy = s['oy']
    lx = s['look'] * 2
    # weathered cracks and old wrinkles
    for pts in (((50, 41), (54, 47), (52, 52)), ((92, 46), (95, 52), (99, 54)), ((108, 70), (112, 77), (110, 84)),
                ((26, 92), (29, 98)), ((96, 104), (100, 110), (99, 116))):
        P = [(x + lx * 0.6, y + oy) for x, y in pts]
        _line(cv, P, 'stone0')
        _line(cv, [(x + 1, y) for x, y in P], 'stone3')
    for k in range(3):                                         # forehead wrinkles
        _arc(cv, 71 + lx * 0.6, 58 + oy + k * 3.2 - s['brow'] * 0.5, 13 - k * 2, 3, 200, 340, 'stone1', 5)
    # smile lines from nose to mouth corners, deepening with the smile
    sm = s['smile']
    _line(cv, [(36 + lx, 97 + oy), (46 + lx, 103 + oy), (58 + lx, 108 + oy - sm), (66 + lx, 111 + oy - sm * 2)], 'stone1')
    _line(cv, [(80 + lx * 0.6, 99 + oy), (80 + lx * 0.6, 105 + oy - sm), (77 + lx * 0.6, 110 + oy - sm * 2)], 'stone1')
    # the mouth: upper lip overhangs; a smile curls up at the corner
    mx, my = 74 + lx, 114 + oy
    _line(cv, [(mx - 6, my + 1), (mx - 2, my + 1 - sm), (mx + 2, my - sm * 2), (mx + 4, my - 1 - sm * 3)], 'stone0')
    _px(cv, mx + 5, my - 2 - sm * 3, 'stone3')                    # dimple
    # nostrils on the round nose
    for (nx, ny, rr) in ((16, 98, 2.6), (29, 96, 2.2)):
        nx += lx * 1.2
        flare = s['snort']
        for y in range(int(ny - rr - flare + oy), int(ny + rr + flare + oy) + 1):
            for x in range(int(nx - rr - flare), int(nx + rr + flare) + 1):
                if ((x + 0.5 - nx) / (rr + flare)) ** 2 + ((y + 0.5 - ny - oy) / (rr * 0.7 + flare * 0.5)) ** 2 <= 1:
                    _px(cv, x, y, 'stone0')
        _px(cv, nx - rr, ny - rr * 0.6 + oy, 'stone4')
    # eyes
    _eye(cv, 42 + lx, 79 + oy, 9.5, 8.5, s, True)
    _eye(cv, 86 + lx * 0.7, 76 + oy, 7.5, 7.5, s, False)
    # bushy brows: a fringe of lichen hairs hanging down at the outer ends
    for (x, y, ln) in ((28, 71, 4), (31, 70, 5), (34, 69, 3), (98, 66, 4), (95, 66, 3)):
        _line(cv, [(x + lx, y + oy - s['brow']), (x + lx - 1, y + oy - s['brow'] + ln)], 'jade2')
    # rings on the old horns, and the chipped tip of the far one
    for (x0, y0, x1, y1) in ((45, 38, 57, 36), (48, 28, 59, 31), (56, 19, 63, 25), (64, 12, 67, 19),
                             (90, 33, 99, 37), (97, 25, 104, 30), (106, 20, 108, 27)):
        _line(cv, [(x0 + lx * 0.5, y0 + oy), (x1 + lx * 0.5, y1 + oy)], 'wood1')
    # moss on the crown, with tiny flowers and a red mushroom
    import moss
    rng = random.Random(5)
    crown = s['crown']
    top = np.argmax(crown, axis=0)
    tmp = Canvas(W, H)
    tmp.a[...] = cv.a
    for (x0, w_, h_) in ((44, 10, 5), (52, 14, 7), (63, 14, 8), (75, 14, 7), (86, 12, 6), (96, 10, 5), (104, 8, 4)):
        sx0 = int(to_screen(x0 + lx * 0.5, 0)[0])
        w_, h_ = max(4, int(w_ * S)), max(3, int(h_ * S))
        if not (0 <= sx0 + w_ // 2 < W) or not crown[:, sx0 + w_ // 2].any():
            continue
        y0 = int(top[sx0 + w_ // 2]) + 3
        moss.clump(tmp, rng, sx0, y0, w_, h_, 'ledge', opaque_only=False, spores=0.0, shadow=False)
    ok = (crown | ~solid) & (tmp.a[..., 3] > 0)              # never over the horns, brows or eyes
    cv.a[ok] = tmp.a[ok]
    s['mossy'] = ok
    for (x, y, c) in ((58, 34, 'pink3'), (86, 33, 'paper4'), (95, 37, 'pink3'), (50, 39, 'paper4'), (64, 32, 'gold4')):
        _pxa(cv, x + lx * 0.5, y + oy, c)
        _pxa(cv, x + lx * 0.5, y + oy + 1, 'leaf3')
    mx_, my_ = 76 + lx * 0.5, 27 + oy                          # a mushroom in the moss
    for y in range(int(my_), int(my_) + 6):
        _pxa(cv, mx_, y, 'paper3'); _pxa(cv, mx_ + 1, y, 'paper2')
    for y in range(-3, 1):
        for x in range(-4, 6):
            if (x - 0.5) ** 2 / 20 + (y + 0.5) ** 2 / 5 <= 1:
                _pxa(cv, mx_ + x, my_ + y, 'red1' if y == 0 else ('red2' if y > -2 else 'red3'))
    for (x, y) in ((-2, -2), (2, -3), (3, -1)):
        _pxa(cv, mx_ + x, my_ + y, 'paper4')
    for x in range(-5, 7):
        _pxa(cv, mx_ + x, my_ + 1, 'ink') if abs(x - 0.5) > 4.6 else None
    # lichen spots on the cheeks
    for (x, y) in ((22, 88), (26, 86), (104, 98), (107, 101), (60, 47)):
        _px(cv, x + lx, y + oy, 'jade3'); _px(cv, x + 1 + lx, y + oy, 'jade2')
    # rosy rock cheeks when happy
    if s['blush']:
        for (bx, by, r) in ((34, 92, 6), (93, 88, 5)):
            for yy in range(-3, 4):
                for xx in range(-r - 1, r + 2):
                    d = (xx / r) ** 2 + (yy / 2.6) ** 2
                    if d <= 1 and (d < 0.45 or (xx + yy) % 2 == 0):
                        _px(cv, bx + xx + lx, by + yy + oy, 'pink2' if d > 0.3 else 'pink3')
    # claws on the fingers resting on the sill
    if s['hands']:
        for cx in (24, 115):
            for fx in (-8, 0, 8):
                x, y = cx + fx, 141 + s['grip']
                for k in range(3):
                    _px(cv, x - 1 + k, y + 4, 'paper2' if k else 'paper3')
                _px(cv, x, y + 5, 'paper1')


_PRNG = np.random.RandomState(21)
SEEDS = np.stack([_PRNG.uniform(-10, W + 10, 70), _PRNG.uniform(10, H + 20, 70)], axis=1)


def _plates(cv, s, mat, solid):
    """The hide is a mosaic of worn stone plates: thin cracks between cells,
    a light bevel on the upper-left of each crack and a dark one below."""
    lx = s['look'] * 2
    sx = SEEDS[:, 0][:, None, None] + lx * 0.6
    sy = SEEDS[:, 1][:, None, None] + s['oy']
    d = np.hypot(XM[None] - sx, (YM[None] - sy) * 1.15)
    d.sort(axis=0)
    gap = d[1] - d[0]
    rocky = solid & np.isin(mat, ['rock', 'jowl'])
    # keep the face clean: fewer cracks round the eyes and on the muzzle
    face = ((XM - 40 - lx) / 34) ** 2 + ((YM - 92 - s['oy']) / 24) ** 2 < 1
    crack = rocky & (gap < 1.1) & ~face
    below = np.roll(np.roll(crack, 1, 0), 1, 1) & rocky & ~crack
    above = np.roll(np.roll(crack, -1, 0), -1, 1) & rocky & ~crack
    rgb = cv.a[..., :3].astype(int)
    lum = rgb.sum(axis=2)
    cv.a[crack & (lum > 260)] = (*PAL['stone1'], 255)
    cv.a[crack & (lum <= 260)] = (*PAL['stone0'], 255)
    cv.a[above & (lum > 200) & (lum < 480)] = (*PAL['stone3'], 255)
    cv.a[below & (lum > 260)] = (*PAL['stone2'], 255)


def _effects(cv, s):
    oy = s['oy']
    lx = s['look'] * 2
    if s['steam']:                                             # a warm huff from the nostrils
        k = s['steam']
        for j, (dx, dy, r) in enumerate(((-2, -6, 3.2), (-5, -13, 4.4), (-4, -21, 5.4))):
            if j >= k + 1:
                continue
            cx, cy = 22 + lx + dx, 96 + oy + dy - k * 2
            for y in range(int(cy - r - 2), int(cy + r + 3)):
                for x in range(int(cx - r - 2), int(cx + r + 3)):
                    d = ((x + 0.5 - cx) / r) ** 2 + ((y + 0.5 - cy) / (r * 0.85)) ** 2
                    if d <= 1:
                        _pxa(cv, x, y, 'white' if d < 0.3 and y < cy else ('cloud3' if d < 0.7 else 'cloud2'))
                    elif d <= 1.35 and j < 2:
                        _pxa(cv, x, y, 'cloud1')
    if s['dust']:
        rng = random.Random(s['dust'])
        for _ in range(10):
            x = rng.choice((rng.uniform(10, 40), rng.uniform(100, 130)))
            y = 140 + rng.uniform(0, 8)
            _pxa(cv, x, y, 'stone3')
    if s['sparkle']:
        for (x, y) in ((22, 60), (116, 56)):
            for (dx, dy) in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
                _pxa(cv, x + dx / S, y + dy / S, 'gold4' if (dx or dy) else 'white')
    if s['zz']:                                                # dozing: z z z drifting up
        Z = ('####', '..#.', '.#..', '####')
        for j in range(s['zz']):
            x0, y0 = to_screen(96 + j * 7, 36 + oy - j * 8)
            for yy, row in enumerate(Z):
                for xx, ch in enumerate(row):
                    if ch == '#' and 0 <= int(x0) + xx < W and 0 <= int(y0) + yy < H:
                        cv.a[int(y0) + yy, int(x0) + xx] = (*PAL['white'], 255)


def _outline(cv, solid):
    up = np.roll(solid, 1, 0); dn = np.roll(solid, -1, 0)
    lf = np.roll(solid, 1, 1); rt = np.roll(solid, -1, 1)
    edge = solid & ~(up & dn & lf & rt)
    lit = edge & (~up | ~lf)
    cv.a[edge & ~lit] = (*PAL['ink'], 255)
    cv.a[lit] = (*PAL['stone0'], 255)


# ---------------------------------------------------------------- animation
def _state(**kw):
    s = dict(rise=1.0, squash=0, jaw=0, look=0, lid=0.42, eyes='open', smile=1, brow=0, snort=0, steam=0, dust=0,
             hands=True, grip=0, blush=False, sparkle=False, zz=0, t=0.0)
    s.update(kw)
    return s


def _script():
    S = []
    for i, r in enumerate((0.0, 0.08, 0.2, 0.34, 0.5, 0.66, 0.8, 0.9, 0.97)):        # slowly rises, still dozing
        S.append(_state(rise=r, eyes='closed', hands=r > 0.85, smile=0, zz=(i % 3) + 1 if r > 0.5 else 0))
    S.append(_state(squash=2, eyes='closed', dust=1, smile=0, grip=1))              # chin settles on the sill
    S.append(_state(squash=1, eyes='closed', dust=2, smile=0))
    S.append(_state(lid=0.7, smile=0))                                              # eyes creak open
    S.append(_state(lid=0.5, smile=0))
    S.append(_state(lid=0.42, look=-1, smile=0))                                    # looks at the bell
    S.append(_state(lid=0.42, look=-1, smile=1))
    S.append(_state(lid=0.36, look=-1, smile=2, brow=2))                            # a slow, kind smile
    S.append(_state(lid=0.36, look=0, smile=2, brow=2))
    S.append(_state(lid=0.4, look=0, smile=2, snort=1, steam=1))                     # a warm huff
    S.append(_state(lid=0.4, look=0, smile=2, snort=1, steam=2))
    S.append(_state(lid=0.4, look=0, smile=2, steam=3))
    S.append(_state(eyes='closed', jaw=0.4, smile=0, brow=1))                       # a big old yawn
    S.append(_state(eyes='closed', jaw=0.85, smile=0, brow=2))
    S.append(_state(eyes='closed', jaw=1.0, smile=0, brow=2, dust=3))
    S.append(_state(eyes='closed', jaw=0.6, smile=0, brow=1))
    S.append(_state(eyes='closed', jaw=0.15, smile=1))
    S.append(_state(eyes='happy', smile=3, brow=2, blush=True, sparkle=True))       # happy to see you
    S.append(_state(eyes='happy', smile=3, brow=2, blush=True))
    S.append(_state(eyes='happy', smile=3, brow=2, blush=True, sparkle=True))
    S.append(_state(lid=0.4, look=1, smile=2, brow=1))
    S.append(_state(eyes='closed', smile=2))                                        # slow blink
    S.append(_state(lid=0.45, smile=2))
    for i, r in enumerate((0.95, 0.86, 0.72, 0.56, 0.4, 0.24, 0.1, 0.0)):           # sinks back down
        S.append(_state(rise=r, lid=0.55 + i * 0.05, hands=r > 0.85, smile=1, grip=1 if r > 0.85 else 0))
    for i, st in enumerate(S):
        st['t'] = i * 0.35
    return S


SCRIPT = _script()


def frame(s):
    ease = 1 - (1 - s['rise']) ** 2 if s['rise'] < 1 else 1
    s = dict(s)
    s['oy'] = (1 - ease) * 125
    s['oy_px'] = int(round(s['oy']))
    if s['rise'] <= 0:
        return Canvas(W, H)
    cv, h, gid, mat, solid, names = _render(s)
    s['crown'] = np.isin(gid, [names.index('head'), names.index('ridge')])
    _plates(cv, s, mat, solid)
    _details(cv, s, solid)
    _outline(cv, solid)
    _effects(cv, s)
    return cv


def peek_frames():
    return [frame(s) for s in SCRIPT]
