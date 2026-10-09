"""The bell and the window wyvern (room 3).

Ring the brass call bell on the counter and something answers. A rock
wyvern rises behind the bell-shaped window: glowing slit eyes under heavy
brow ridges, horns of stone, a massive overbite of fangs, magma glowing
in the cracks of its hide. It hooks its wing-claws over the sill (dust
trickles down), snorts smoke, opens its jaws in a roar with its throat
glowing, glares at the bell, then sinks back down.

The wyvern lives just outside the window (layer 'outside': after the
parallax garden, before the room shell), so the window frame hides the
rest of it. It is drawn like Uncle Pong: a small grid scaled up 3x, flat
colours, a black silhouette outline and three tones per material.

  dragon_bell  anims: idle (1 frame), ring (10 frames, 12 fps)
  dragon_peek  anims: hidden (1 empty frame), peek (32 frames, 10 fps)
"""
import math
import numpy as np
from pixel import Canvas, PAL, col
from shade import lathe_shade
from objects import outline
from propkit import prop
from layout import WIN_BELL, COUNTER_Y

# ---------------------------------------------------------------- grid helpers (like npc.py)
GW, GH, K = 44, 52, 3
ROCK = ('stone4', 'stone3', 'stone2', 'stone1')       # light, base, shade, deep
DARK = ('stone3', 'stone2', 'stone1', 'stone0')
FANG = ('white', 'paper4', 'paper2', 'paper1')
FULL = 30                                             # grid rows between hidden and fully up
TOP = 30                                              # how high it actually comes up


def _sh(m, dx, dy):
    out = np.zeros_like(m)
    h, w = m.shape
    ys0, ys1 = max(0, -dy), h - max(0, dy)
    xs0, xs1 = max(0, -dx), w - max(0, dx)
    out[ys0:ys1, xs0:xs1] = m[ys0 + dy:ys1 + dy, xs0 + dx:xs1 + dx]
    return out


def _dil(m):
    return m | _sh(m, 1, 0) | _sh(m, -1, 0) | _sh(m, 0, 1) | _sh(m, 0, -1)


class _G:
    def __init__(self, oy):
        self.a = np.zeros((GH, GW, 4), np.uint8)
        self.oy = oy                                      # vertical offset (sinking)
        self.yy, self.xx = np.mgrid[0:GH, 0:GW]
        self.yy = self.yy - oy

    def E(self, cx, cy, rx, ry):
        return ((self.xx + 0.5 - cx) / rx) ** 2 + ((self.yy + 0.5 - cy) / ry) ** 2 <= 1

    def set(self, m, c):
        self.a[m] = col(c)

    def px(self, x, y, c):
        x, y = int(round(x)), int(round(y + self.oy))
        if 0 <= x < GW and 0 <= y < GH:
            self.a[y, x] = col(c)

    def part(self, m, tones=ROCK, line='ink'):
        if not m.any():
            return
        self.set(_dil(m) & ~m, line)
        lt, base, shade, deep = tones
        self.set(m, base)
        sh = m & ~_sh(m, 2, 2)
        self.set(sh, shade)
        self.set(m & ~_sh(m, 1, 1) & sh & ~_sh(m, 0, 1), deep)
        self.set(m & ~_sh(m, -1, -1) & ~sh, lt)

    def rows(self, rows, x, y, cmap):
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch in cmap:
                    self.px(x + i, y + j, cmap[ch])


# rise, eyes, look, jaw (0 shut .. 1 wide), claws, extra
SCRIPT = [
    (0, 'glow', 0, 0, 0, None), (3, 'glow', 0, 0, 0, None), (7, 'glow', 0, 0, 0, None),
    (10, 'glow', 0, 0, 0, None), (11, 'glow', -1, 0, 0, None), (11, 'glow', 1, 0, 0, None),
    (11, 'narrow', 0, 0, 0, None), (12, 'narrow', 0, 0, 0, None), (17, 'glow', 0, 0, 0, None),
    (23, 'glow', 0, 0, 0, None), (28, 'glow', 0, 0, 1, 'dust'), (30, 'glow', 0, 0, 1, 'dust'),
    (30, 'glow', 0, 0, 1, 'snort'), (30, 'narrow', 0, 0, 1, 'snort'), (30, 'wide', 0, 0.3, 1, None),
    (30, 'wide', 0, 0.7, 1, 'roar'), (30, 'wide', 0, 1.0, 1, 'roar'), (30, 'wide', 0, 1.0, 1, 'roar'),
    (30, 'wide', 0, 1.0, 1, 'roar'), (30, 'wide', 0, 0.6, 1, None), (30, 'glow', 0, 0.2, 1, None),
    (30, 'narrow', 0, 0, 1, 'snort'), (30, 'narrow', 0, 0, 1, 'smoke'), (30, 'narrow', 0, 0, 1, None),
    (30, 'glow', -1, 0, 1, None), (30, 'narrow', -1, 0, 1, None), (29, 'glow', 0, 0, 1, None),
    (25, 'glow', 0, 0, 1, 'dust'), (18, 'glow', 0, 0, 0, None), (11, 'narrow', 0, 0, 0, None),
    (5, 'glow', 0, 0, 0, None), (0, 'glow', 0, 0, 0, None),
]


def _poly(g, pts):
    c = Canvas(GW, GH)
    c.poly([(int(round(x)), int(round(y + g.oy))) for x, y in pts], 'white')
    return c.a[:, :, 3] > 0


def _stroke(g, pts, r0, r1, n=8):
    p = [pts[0]] + list(pts) + [pts[-1]]
    samples = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = (np.array(q, float) for q in p[i - 1:i + 3])
        for k in range(n):
            t = k / n
            samples.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                                  + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    samples.append(np.array(pts[-1], float))
    m = np.zeros((GH, GW), bool)
    L = len(samples)
    for i, (x, y) in enumerate(samples):
        r = r0 + (r1 - r0) * i / max(1, L - 1)
        m |= (g.xx + 0.5 - x) ** 2 + (g.yy + 0.5 - y) ** 2 <= r * r
    return m, samples


def _rot(p, c, a):
    ca, sa = math.cos(a), math.sin(a)
    x, y = p[0] - c[0], p[1] - c[1]
    return (c[0] + x * ca - y * sa, c[1] + x * sa + y * ca)


def _line(g, pts, c):
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for k in range(n + 1):
            t = k / n
            g.px(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, c)


def _dragon(step):
    """One frame of the wyvern, in profile, facing left toward the bell.
    Shape coordinates are grid rows when it is fully up."""
    rise, eyes, look, jaw, claws, extra = SCRIPT[step]
    rise = int(round(rise * TOP / 30))
    g = _G(FULL - rise)
    if rise <= 0:
        return g
    shake = (1 if step % 2 else -1) if extra == 'roar' else 0
    hx, hy = 2 + look + shake, abs(look)                  # head offset (look = dip toward the bell)
    heat = 1.0 if extra == 'roar' else (0.6 if jaw > 0 else 0.35)
    H = lambda pts: [(x + hx, y + hy) for x, y in pts]

    # far horn, behind everything, in shadow
    m, _ = _stroke(g, H([(23, 17), (28, 13), (34, 11), (39, 13), (41, 17)]), 2.4, 0.7)
    g.part(m, DARK)
    # neck: thick and rising out of the bottom, plated throat at the front
    neck = _poly(g, [(15 + hx, 33), (12, 42), (11, 52), (35, 52), (35, 40), (33 + hx, 24 + hy), (24 + hx, 26 + hy)])
    g.part(neck, ROCK)
    for y in range(36, 52, 3):                            # throat plates
        x0 = 15 - (y - 36) * 0.25
        band = neck & (g.yy >= y) & (g.yy < y + 2) & (g.xx >= x0) & (g.xx < x0 + 5)
        g.set(band, 'paper2')
        g.set(band & (g.yy == y + 1), 'paper1')
        _line(g, [(x0, y + 2), (x0 + 5, y + 2)], 'stone1')
    for k, (sx, sy) in enumerate(((33, 27), (35, 33), (36, 39), (37, 45))):   # dorsal spikes
        ln = 5 - k * 0.5
        g.part(_poly(g, [(sx - 1 + hx * (k == 0), sy - 2), (sx + ln + hx * (k == 0), sy + 1),
                         (sx - 1 + hx * (k == 0), sy + 3)]), DARK)
    for (pts, c) in (([(17, 34), (21, 33), (25, 35), (29, 34)], 'stone2'), ([(16, 41), (20, 40), (24, 42), (29, 41),
                                                                        (33, 42)], 'stone2'),
                     ([(15, 48), (19, 47), (24, 49), (30, 48), (35, 49)], 'stone2'), ([(21, 34), (22, 40)], 'stone2'),
                     ([(27, 35), (26, 41)], 'stone2'), ([(19, 40), (20, 47)], 'stone2'), ([(28, 41), (27, 48)], 'stone2')):
        _line(g, pts, c)                                  # plates of the hide
    g.set(neck & (g.yy >= 47) & (g.xx > 14), 'stone2')   # sinking into the shadow below the sill
    g.set(neck & (g.yy >= 50) & (g.xx > 13), 'stone1')
    for (pts, hot) in (([(25, 38), (27, 41), (26, 44), (28, 47)], True), ([(30, 32), (29, 36)], False),
                       ([(20, 46), (22, 49)], False)):                # cracks in the neck
        _line(g, pts, ('fire3' if heat > 0.8 else 'fire2') if hot and heat > 0.5 else 'stone1')
    for (x, y) in ((31, 30), (32, 30), (33, 31), (30, 43), (31, 43)):  # moss
        g.px(x, y, 'leaf2' if x % 2 else 'leaf1')

    # mouth: lower jaw hinged at the back, opening downward
    hinge = (27 + hx, 29 + hy)
    ang = -math.radians(42) * jaw
    lj_top = [(9, 30), (27, 30)]
    lj = H([(9, 30), (26, 29.5), (30, 31), (29.5, 35), (23, 37.5), (13, 36.5), (9, 33.5)])
    lj = [_rot(p, hinge, ang) for p in lj]
    if jaw > 0:
        tip = _rot((9 + hx, 30 + hy), hinge, ang)
        mouth = _poly(g, [(6 + hx, 29 + hy), hinge, tip])
        g.set(mouth, 'red0')
        g.set(mouth & _sh(mouth, 1, 0) & _sh(mouth, -1, 0) & _sh(mouth, 0, 1), 'red1')
        throat = mouth & g.E(hinge[0] - 4, hinge[1] + 1 + 2.5 * jaw, 4 + 4 * jaw, 1.5 + 2.5 * jaw)
        g.set(throat, 'fire2' if heat > 0.8 else 'red2')
        g.set(throat & g.E(hinge[0] - 3, hinge[1] + 1 + 2.5 * jaw, 2 + 2.5 * jaw, 0.8 + 1.2 * jaw),
              'fire4' if heat > 0.8 else 'fire2')
        tongue = _poly(g, [_rot((12 + hx, 31 + hy), hinge, ang * 0.8), _rot((22 + hx, 31 + hy), hinge, ang * 0.7),
                           _rot((22 + hx, 33 + hy), hinge, ang * 0.7), _rot((13 + hx, 32.5 + hy), hinge, ang * 0.8)])
        g.set(tongue & mouth, 'red3')
        g.set(tongue & mouth & ~_sh(tongue, 0, -1), 'red4')
    g.part(_poly(g, lj), ROCK)
    g.set(_poly(g, lj) & ~_sh(_poly(g, lj), 0, -2) & ~_dil(~_poly(g, lj)), 'stone1')
    for x in (12, 16, 20, 24):                            # lower teeth, pointing up from the jaw
        b = _rot((x + hx, 30 + hy), hinge, ang)
        t = _rot((x + hx + 0.3, 27.6 + hy), hinge, ang)
        m, _ = _stroke(g, [b, t], 0.9, 0.4, n=3)
        g.part(m, FANG)
    _line(g, [_rot((11 + hx, 34 + hy), hinge, ang), _rot((25 + hx, 34.5 + hy), hinge, ang)], 'stone1')
    _line(g, [_rot((18 + hx, 34.2 + hy), hinge, ang), _rot((20 + hx, 36.5 + hy), hinge, ang)], 'stone1')
    if jaw >= 0.6:                                        # strings of drool between the jaws
        for x in (13, 21):
            _line(g, [(x + hx, 29.6 + hy), _rot((x + hx - 0.5, 30.2 + hy), hinge, ang * 0.55),
                      _rot((x + hx, 30 + hy), hinge, ang)], 'cloud2')

    # skull and the long upper jaw: a wedge that ends in a hooked overbite
    skull = _poly(g, H([(6, 29), (3, 27), (2, 25), (4, 23), (9, 21.5), (14, 19), (19, 16), (25, 14.5), (30, 16),
                        (33, 20), (33, 25), (30, 29), (26, 30)]))
    g.part(skull, ROCK)
    hook = _poly(g, H([(2.5, 25), (5, 27), (5.5, 30), (4, 33), (2.5, 30)]))
    g.part(hook, ROCK)
    g.set(_dil(hook) & ~hook & ~skull & (g.yy > 27 + hy), 'ink')
    # jaw muscle and the plates of the face
    _line(g, H([(24, 21), (27, 24), (26, 28)]), 'stone1')
    _line(g, H([(8, 24), (13, 23), (18, 23.5)]), 'stone2')
    _line(g, H([(15, 26), (21, 26.5)]), 'stone2')
    _line(g, H([(28, 18), (30, 22), (31, 26)]), 'stone1')
    for (pts, hot) in (([(20, 24), (22, 25), (21, 27)], True), ([(10, 21.5), (11, 23)], False)):
        _line(g, H(pts), ('fire3' if heat > 0.8 else 'fire2') if hot and heat > 0.5 else 'stone1')
    for (x, y) in ((22, 15), (23, 15), (24, 14.5), (26, 15), (17, 17), (18, 17)):   # moss on the crown
        g.px(x + hx, y + hy, 'leaf2' if x % 2 else 'leaf3')
    g.px(5 + hx, 24 + hy, 'ink'); g.px(6 + hx, 24 + hy, 'ink')                       # nostril
    g.px(6 + hx, 23 + hy, 'stone1')
    # fangs of the upper jaw, hanging down over the lower jaw
    for (x, ln, w0) in ((7.5, 6.5, 1.5), (11, 4.5, 1.2), (14.5, 3.2, 1.0), (18, 3.0, 1.0), (22, 2.4, 0.9)):
        m, _ = _stroke(g, H([(x, 28.5), (x - 0.4, 28.5 + ln * 0.6), (x - 1.0, 28.5 + ln)]), w0, 0.35, n=4)
        g.part(m, FANG)
    # near horn: from the back of the skull, sweeping back and curling down
    m, smp = _stroke(g, H([(24, 18), (30, 16), (36, 16.5), (40, 20), (41, 25), (39, 28)]), 2.8, 0.7)
    g.part(m, ROCK)
    for i in range(3, len(smp) - 4, 4):
        g.px(smp[i][0], smp[i][1] - 1, 'stone1'); g.px(smp[i][0], smp[i][1], 'stone1')
    # cheek spikes behind the jaw
    for (y0, ln) in ((23, 6), (27, 4)):
        g.part(_poly(g, H([(31, y0 - 1.5), (31 + ln, y0 + 1), (31, y0 + 2)])), DARK)
    # heavy brow ridge, slanting down into a scowl, with the eye glowing beneath it
    bm, _ = _stroke(g, H([(12.5, 21), (16, 19.5), (20, 18.3), (23, 18.5)]), 1.4, 1.0, n=4)
    g.part(bm, DARK)
    ex, ey = 17 + hx, 21 + hy
    rows = {'narrow': ['.fff', 'ff..'], 'wide': ['.ffff', 'fWWff', '.fff.'],
            'glow': ['..fff', 'fWWf.', '.ff..']}[eyes]
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            c = {'f': 'fire3', 'W': 'fire5'}.get(ch)
            if c:
                g.px(ex - 2 + i, ey + j, c)
    if eyes != 'narrow':
        g.px(ex, ey + 1, 'ink'); g.px(ex, ey, 'ink')       # slit pupil
    else:
        g.px(ex - 1, ey + 1, 'fire5')

    # wing-claws hooked over the sill
    if claws:
        for (cx, s) in ((7, -1), (38, 1)):
            arm, _ = _stroke(g, [(cx + 2 * s, 52), (cx + s, 47), (cx, 45.5)], 2.2, 2.6, n=4)
            g.part(arm, DARK)
            knuckle = g.E(cx, 46, 3.6, 2.6)
            g.part(knuckle, ROCK)
            for k in (-2, 0, 2):
                tm, _ = _stroke(g, [(cx + k, 47.5), (cx + k + 0.3 * s, 50), (cx + k - 0.4 * s, 51.8)], 1.1, 0.4, n=4)
                g.part(tm, ('paper3', 'paper2', 'paper1', 'wood1'))
            thumb, _ = _stroke(g, [(cx - s * 2, 44), (cx - s * 4, 41.5), (cx - s * 4.5, 39.5)], 1.2, 0.4, n=4)
            g.part(thumb, ('paper3', 'paper2', 'paper1', 'wood1'))
    # smoke from the nostril, dust, roar
    if extra in ('snort', 'smoke'):
        k = step % 3
        for j, (dx, dy, r) in enumerate(((1, -2 - k, 1.4), (4, -5 - k * 1.5, 1.9), (8, -7 - k * 2, 2.5))):
            if extra == 'smoke' and j == 0:
                continue
            m = g.E(5 + hx + dx, 24 + hy + dy, r, r * 0.8)
            g.part(m, ('cloud3', 'cloud2', 'cloud1', 'cloud1') if j < 2 else ('cloud2', 'cloud1', 'stone3', 'stone3'),
                   line='stone1')
    if extra in ('dust', 'roar'):
        for (dx, dy) in ((4, 50), (11, 51), (36, 51), (42, 50), (5, 47 + step % 4), (40, 46 + (step + 2) % 4)):
            g.px(dx, dy, 'stone3')
    if extra == 'roar':
        for (x, y) in ((1, 33), (0, 37), (2, 40), (3, 21), (1, 17)):
            g.px(x, y, 'paper4'); g.px(x - 1, y + (1 if y > 30 else -1), 'paper4')
    # one clean black silhouette
    solid = g.a[:, :, 3] == 255
    rim = solid & ~(_sh(solid, 1, 0) & _sh(solid, -1, 0) & _sh(solid, 0, 1) & _sh(solid, 0, -1))
    g.set(rim, 'ink')
    return g


def _scale(g):
    cv = Canvas(GW * K, GH * K)
    cv.a = np.repeat(np.repeat(g.a, K, axis=0), K, axis=1)
    return cv


def peek_frames():
    return [_scale(_dragon(i)) for i in range(len(SCRIPT))]


# ---------------------------------------------------------------- the bell
BW, BH = 48, 36


def _bell(press=0, wobble=0, rings=0):
    cv = Canvas(BW, BH)
    cx, base_y = BW // 2, BH - 6
    # wooden base, an oval seen from above
    for y in range(base_y - 2, base_y + 4):
        for x in range(cx - 14, cx + 15):
            d = ((x + 0.5 - cx) / 14.5) ** 2 + ((y + 0.5 - base_y - 0.5) / 3.6) ** 2
            if d <= 1:
                cv.px(x, y, 'wood3' if y < base_y else ('wood1' if y > base_y + 1 else 'wood2'))
    cv.hline(cx - 12, cx + 12, base_y - 2, 'wood4')
    # brass dome
    dome = lathe_shade(24, 13, lambda t: 12 * math.sqrt(max(0, 1 - (1 - t) ** 2)), ['gold0', 'gold1', 'gold2', 'gold3', 'gold4'],
                       spec=0.2, spec_col='white', wobble=0)
    cv.blit(dome, cx - 12 + wobble, base_y - 14 + press)
    cv.hline(cx - 12 + wobble, cx + 11 + wobble, base_y - 2 + press, 'gold0')
    # plunger and knob
    cv.vline(cx + wobble, base_y - 18 + press * 2, base_y - 14 + press, 'stone2')
    cv.rect(cx - 2 + wobble, base_y - 20 + press * 2, 5, 3, 'gold3')
    cv.hline(cx - 2 + wobble, cx + 2 + wobble, base_y - 20 + press * 2, 'gold4')
    cv.px(cx - 2 + wobble, base_y - 18 + press * 2, 'gold1')
    # sound: curved lines spreading out
    for r in range(rings):
        rad = 15 + r * 4
        for a in range(-50, 51, 10):
            for s in (-1, 1):
                x = cx + s * rad * math.cos(math.radians(a)) * 0.9
                y = base_y - 9 + rad * math.sin(math.radians(a)) * 0.55
                if 0 <= x < BW and 0 <= y < BH:
                    cv.px(int(x), int(y), 'paper4' if r < 2 else 'gold3')
    return outline(cv)


def bell_frames():
    seq = [(1, 0, 0), (1, 0, 1), (0, 1, 1), (0, -1, 2), (0, 1, 2), (0, -1, 3), (0, 1, 3), (0, 0, 2), (0, 0, 1), (0, 0, 0)]
    return [_bell(p, w, r) for (p, w, r) in seq]


PEEK_X = WIN_BELL['cx'] - GW * K // 2
PEEK_Y = WIN_BELL['bottom'] + 4 - GH * K


@prop('dragon_bell', 3, 'counter', WIN_BELL['cx'] - BW // 2 - 40, COUNTER_Y - BH + 1,
      'Brass call bell. Click it: it rings, and a rock wyvern rises behind the window and roars', fps=12,
      meta=dict(on_click=[dict(prop='dragon_bell', play='ring', then='idle'),
                          dict(prop='dragon_peek', play='peek', then='hidden', fps=10)]))
def dragon_bell():
    return {'idle': [_bell()], 'ring': bell_frames()}


@prop('dragon_peek', 3, 'outside', PEEK_X, PEEK_Y,
      'Rock wyvern that rises behind the bell window when the bell rings: glowing eyes, a massive overbite, '
      'magma cracks, snorts and roars (32 frames)', drag=False,
      fps=10, shadow='none')
def dragon_peek():
    empty = Canvas(GW * K, GH * K)
    return {'hidden': [empty], 'peek': peek_frames()}
