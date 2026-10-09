"""NPCs (v3.2). Customers sit on the far side of the serving counter. The
body stops at the counter's back edge; only forearms, hands and their
shadows reach onto the counter top, so NPCs are drawn after the counter
layer.

Style: chunky. Each NPC is drawn on a small grid (56 x 64) and scaled up
3x with nearest neighbour, so the pixels are big. Flat colours, a black
outline round every part, three tones per material (a light rim top-left,
the base, a shade band bottom-right), and simple dot eyes with a shine.

Uncle Pong is a big, bare-chested uncle: an elephant crossed with the
Siamese fireback. He has the bird's slate-blue fur and scarlet skin
round the eyes, and its crest as a little topknot ponytail. He wears
nothing but a checked pha khao ma (ผ้าขาวม้า) tied round his waist."""
import math
import numpy as np
from pixel import Canvas, PAL, col

OY = 8                       # headroom above the design coordinates (crest)
GW, GH = 56, 64 + OY         # drawing grid
K = 3                        # scale into the scene
CE = 53                      # counter back edge, in design rows (grid row CE + OY)
EDGE_PX = (CE + OY) * K      # counter edge, in sprite pixels
NF = 12
W_, H_ = GW * K, GH * K
SHADOW = (24, 12, 22)
FUR = ('fgrey4', 'fgrey3', 'fgrey2', 'fgrey1')        # light, base, shade, deep: the bird's silver-grey
GLOSS = ('gloss4', 'gloss2', 'gloss1', 'gloss0')       # glossy blue-black underparts
FIRE = ('gold3', 'gold2', 'copper2', 'copper1')        # the golden 'fire back' feathers
SKIN = ('scarlet3', 'scarlet2', 'scarlet1', 'scarlet0')
IVORY = ('paper4', 'paper4', 'paper2', 'paper1')
HAIR = ('gloss4', 'gloss1', 'gloss0', 'ink')
CLOTH_RED = ('red4', 'red3', 'red1', 'red0')
HX0, HY0, BX0 = 28, 16, 28

TRUNK = {
    'hang':  [(0, 3), (0, 7), (0, 10), (1, 13), (3, 14), (4, 12)],
    'lift':  [(0, 3), (1, 6), (4, 8), (7, 7), (8, 5), (7, 3)],
    'curl':  [(0, 3), (2, 6), (6, 7), (9, 5), (9, 2), (7, 1)],
    'S':     [(0, 3), (-1, 7), (1, 10), (4, 10), (6, 8), (6, 6)],
    'up':    [(0, 3), (2, 6), (6, 5), (9, 2), (10, -2), (10, -4)],
    'droop': [(0, 3), (0, 8), (0, 12), (-1, 15), (-1, 18), (0, 19)],
    'sip':   [(0, 3), (3, 5), (7, 5), (10, 3), (10, 0), (8, -1)],
}

# --------------------------------------------------------------- pixel templates
# '.' none  'o' outline  'h' light  'F' base  'f' shade  (fur colours)
HANDS = {
    'fist': ['..oooooo..',
             '.ohhFFFFo.',
             'ohFFFFFFfo',
             'oFdFFdFFdo',
             'oFFFFFFFfo',
             'ohFFFFFffo',
             '.offffffo.',
             '..oooooo..'],
    'palm': ['..o.o.o...',
             '.ohohohoo.',
             '.oFoFoFoFo',
             '.oFoFoFoFo',
             'oooFFFFFFo',
             'ohFFFFFFFo',
             'oFFFFFFFfo',
             'oFFFFFFFfo',
             '.oFFFFFffo',
             '..offfffo.',
             '...ooooo..'],
    'thumb': ['...ooo...',
              '..ohFo...',
              '..oFFo...',
              '..oFFo...',
              '.ooFFoooo',
              'ohFFFFFFo',
              'oFdFFFFfo',
              'oFFdFFFfo',
              'oFFFdFFfo',
              '.offfffo.',
              '..ooooo..'],
}
EYES = {          # 'k' black, 'w' shine
    'open':  ['wk', 'kk', 'kk'],
    'half':  ['..', 'kk', 'kk'],
    'shut':  ['...', 'kkk'],
    'happy': ['.k.', 'k.k'],
    'wide':  ['wkk', 'kkk', 'kkk'],
    'down':  ['..', 'kk', 'wk'],
}
BROWS = {         # left brow (viewer's left); mirrored for the right
    'neutral': ['kkkkk', 'kkkkk'],
    'raised':  ['.kkk.', 'kkkkk', 'k...k'],
    'angry':   ['kk...', 'kkkk.', '.kkkk', '...kk'],
    'sad':     ['...kk', '.kkkk', 'kkkk.', 'kk...'],
    'high':    ['.kkk.', 'kk.kk', 'k...k'],
}
MOUTHS = {        # drawn under the trunk; 'r' mouth, 't' tongue, 'w' teeth
    'smile': ['k.......k', '.kkkkkkk.'],
    'grin':  ['kkkkkkkkk', 'kwwwwwwwk', '.kkkkkkk.'],
    'open1': ['.kkkkkkk.', 'krrrrrrrk', '.kkkkkkk.'],
    'open2': ['.kkkkkkk.', 'krrrrrrrk', 'krrtttrrk', '.kkkkkkk.'],
    'laugh': ['kkkkkkkkk', 'kwwwwwwwk', 'krrrrrrrk', 'krrtttrrk', '.kkkkkkk.'],
    'grit':  ['kkkkkkkkk', 'kwkwkwkwk', 'kkkkkkkkk'],
    'O':     ['..kkk..', '.krrrk.', '.krtrk.', '..kkk..'],
    'frown': ['.kkkkkkk.', 'k.......k'],
}


# --------------------------------------------------------------- grid helpers
def _sh(m, dx, dy):
    """out[y, x] = m[y + dy, x + dx] (False outside)."""
    out = np.zeros_like(m)
    h, w = m.shape
    ys0, ys1 = max(0, -dy), h - max(0, dy)
    xs0, xs1 = max(0, -dx), w - max(0, dx)
    out[ys0:ys1, xs0:xs1] = m[ys0 + dy:ys1 + dy, xs0 + dx:xs1 + dx]
    return out


def _dil(m):
    return m | _sh(m, 1, 0) | _sh(m, -1, 0) | _sh(m, 0, 1) | _sh(m, 0, -1)


def E(cx, cy, rx, ry):
    yy, xx = np.mgrid[0:GH, 0:GW]
    yy = yy - OY
    return ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2 <= 1


def P(pts):
    c = Canvas(GW, GH)
    c.poly([(int(round(x)), int(round(y + OY))) for x, y in pts], 'white')
    return c.a[:, :, 3] > 0


def S(pts, r0, r1, n=8):
    """Tapered stroke through points (Catmull-Rom)."""
    p = [pts[0]] + list(pts) + [pts[-1]]
    samples = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = (np.array(q, float) for q in p[i - 1:i + 3])
        for k in range(n):
            t = k / n
            samples.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                                  + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    samples.append(np.array(pts[-1], float))
    yy, xx = np.mgrid[0:GH, 0:GW]
    yy = yy - OY
    m = np.zeros((GH, GW), bool)
    L = len(samples)
    for i, (x, y) in enumerate(samples):
        r = r0 + (r1 - r0) * i / max(1, L - 1)
        m |= (xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= r * r
    return m, samples


class Grid:
    def __init__(self):
        self.a = np.zeros((GH, GW, 4), np.uint8)

    def set(self, m, c):
        self.a[m] = col(c)

    def px(self, x, y, c):
        x, y = int(round(x)), int(round(y)) + OY
        if 0 <= x < GW and 0 <= y < GH:
            self.a[y, x] = col(c)

    def part(self, m, tones=FUR, outline=True, light=True, line='ink'):
        """Flat cel shading: light rim top-left, base, shade band bottom-right.
        line: colour of the outline (muscles inside the body use a dark fur
        tone; the silhouette gets black at the end)."""
        if not m.any():
            return
        if outline:
            self.set(_dil(m) & ~m, line)
        lt, base, shade, deep = tones
        self.set(m, base)
        sh = m & ~_sh(m, 2, 2)
        self.set(sh, shade)
        self.set(m & ~_sh(m, 1, 1) & sh & ~_sh(m, 0, 1), deep)
        if light:
            self.set(m & ~_sh(m, -1, -1) & ~sh, lt)

    def stamp(self, rows, x, y, tones=FUR, flip=False, colours=None):
        lt, base, shade, deep = tones
        cmap = {'o': 'ink', 'h': lt, 'F': base, 'f': shade, 'd': deep}
        if colours:
            cmap.update(colours)
        for j, row in enumerate(rows):
            r = row[::-1] if flip else row
            for i, ch in enumerate(r):
                if ch in cmap:
                    self.px(x + i, y + j, cmap[ch])

    def shadow(self, cx, cy, rx, ry, alpha):
        yy, xx = np.mgrid[0:GH, 0:GW]
        yy = yy - OY
        d = ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2
        for lim, al in ((1.0, alpha * 0.55), (0.55, alpha)):
            m = (d <= lim) & (self.a[:, :, 3] < al)
            self.a[m] = (*SHADOW, int(al))


# --------------------------------------------------------------- poses
def _ease(t):
    return 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, t)))


def _mix(a, b, t):
    return [(xa + (xb - xa) * t, ya + (yb - ya) * t) for (xa, ya), (xb, yb) in zip(TRUNK[a], TRUNK[b])]


def pose(mood, f):
    t = f / NF
    c1 = math.cos(2 * math.pi * t)
    p = dict(by=0, hy=0, hx=0, trunk=list(TRUNK['hang']), eyes='open', look=0, brow='neutral', mouth='smile',
             hands=[('fist', -5, 57), ('fist', 5, 57)], ear=0, tuft=0.0, tuft_lift=0, marks=None, tear=None,
             flex=0.0, pump=0)
    p['by'] = -1 if c1 < -0.3 else 0                       # breathing: chest rises
    p['hy'] = p['by']
    p['tuft'] = math.sin(2 * math.pi * (t - 0.15))
    if mood == 'idle':
        p['trunk'] = [(x + (1 if (f // 3) % 4 == 1 else (-1 if (f // 3) % 4 == 3 else 0)) * (y - 3) / 14, y)
                      for x, y in TRUNK['hang']]
        p['look'] = 1 if f < 6 else 0
        if f == 9:
            p['eyes'] = 'shut'
        elif f in (8, 10):
            p['eyes'] = 'half'
    elif mood == 'talk':
        seq = ['open1', 'open2', 'smile', 'open2', 'open1', 'grin', 'open2', 'open1', 'smile', 'open2', 'grin', 'open1']
        p['mouth'] = seq[f]
        p['trunk'] = _mix('hang', 'lift', 0.85)
        p['brow'] = 'raised' if f in (1, 3, 6, 9) else 'neutral'
        p['hy'] += 1 if p['mouth'] == 'open2' else 0
        up = f in (2, 3, 4, 5, 6)
        p['hands'] = [('fist', -6, 57), ('palm', 23, 36 if up else 39)]
        if f == 7:
            p['eyes'] = 'half'
    elif mood == 'happy':
        p['eyes'] = 'happy'
        p['brow'] = 'raised'
        p['mouth'] = 'laugh' if f % 4 < 2 else 'grin'
        b = abs(math.sin(2 * math.pi * t * 2))
        p['by'] = -int(round(b))
        p['hy'] = -int(round(b * 1.6))
        p['trunk'] = _mix('hang', 'curl', 1.0)
        p['tuft_lift'] = -int(round(b * 2))
        p['hands'] = [('fist', -6, 57), ('thumb', 23, 34 - int(round(b)))]
        p['marks'] = ('sparkle', f)
    elif mood == 'angry':
        p['brow'] = 'angry'
        p['mouth'] = 'grit'
        p['trunk'] = [(x + (0.5 if f % 2 else -0.5) * (y - 3) / 10, y) for x, y in TRUNK['S']]
        p['ear'] = 1
        p['tuft_lift'] = -1
        slam = {3: -7, 4: -8, 5: 0}.get(f, 0)
        p['hands'] = [('fist', -6, 57), ('fist', 9, 57 + slam)]
        p['hx'] = (1 if f % 2 else -1) if f in (5, 6) else 0
        p['marks'] = ('vein', f) if f >= 5 else ('vein_small', f)
    elif mood == 'surprised':
        k = _ease(f / 3) if f < 3 else 1.0
        p['eyes'] = 'wide'
        p['brow'] = 'high'
        p['mouth'] = 'O'
        p['trunk'] = _mix('hang', 'up', k)
        p['hy'] = -int(round(2 * k))
        p['by'] = -int(round(k))
        p['ear'] = 1 if k > 0.5 else 0
        p['tuft_lift'] = -int(round(3 * k))
        p['hands'] = [('palm', -int(round(10 + 13 * k)), int(round(57 - 21 * k))),
                      ('palm', int(round(10 + 13 * k)), int(round(57 - 21 * k)))]
        p['marks'] = ('shock', f) if f >= 2 else None
    elif mood == 'sad':
        p['eyes'] = 'down' if f != 9 else 'shut'
        p['brow'] = 'sad'
        p['mouth'] = 'frown'
        p['trunk'] = list(TRUNK['droop'])
        p['hy'] = 1
        p['ear'] = -1
        p['tuft_lift'] = 2
        p['tear'] = f
    elif mood == 'sip':
        k = _ease([0, 0.2, 0.55, 0.85, 1, 1, 1, 1, 0.85, 0.55, 0.2, 0][f])
        p['trunk'] = _mix('hang', 'sip', min(1.0, k * 1.4))
        p['hands'] = [('fist', -6, 57), ('cup', int(round(10 - 7 * k)), int(round(57 - 25 * k)))]
        if k > 0.95:
            p['eyes'] = 'shut'
        elif f in (8, 9):
            p['eyes'] = 'happy'
    elif mood == 'flex':
        k = _ease(f / 3) if f < 3 else 1.0
        pump = 1 if f in (5, 6, 9, 10) else 0
        p['flex'] = max(0.01, k)
        p['pump'] = pump
        p['eyes'] = 'shut' if pump else 'open'
        p['brow'] = 'angry' if pump else 'raised'
        p['mouth'] = 'grin'
        p['trunk'] = _mix('hang', 'curl', k)
        p['by'] = -pump
        p['hy'] = -pump
        p['marks'] = ('sparkle', f) if pump else None
    return p


# --------------------------------------------------------------- Uncle Pong
def _render(mood, f):
    p = pose(mood, f)
    g = Grid()
    by, hx, hy = p['by'], HX0 + p['hx'], HY0 + p['hy']
    bx = BX0 + p['hx']
    yy, xx = np.mgrid[0:GH, 0:GW]
    yy = yy - OY
    above = yy < CE
    flex = p['flex']

    # shadows on the counter (light from the window behind him)
    g.shadow(bx, CE + 1.5, 18, 2.2, 110)
    if not flex:
        for s, (kind, hx_, hy_) in zip((-1, 1), p['hands']):
            if hy_ > 50:                                     # forearm lying on the counter
                g.shadow(bx + (s * 21 + hx_) / 2 + 1, hy_ + 3, abs(hx_ - s * 21) / 2 + 4, 2.4, 120)

    tl = p['tuft_lift']
    sw = p['tuft']
    # topknot: the fireback's crest, tied up like an old ponytail
    knot = (hx + 1, hy - 12 + tl * 0.3)
    hair = np.zeros((GH, GW), bool)
    for j, (reach, drop, r0) in enumerate(((10, 3, 2.6), (13, 0, 2.2), (8, 6, 2.0))):   # three locks
        tip = (hx + 4 + reach + sw * (1 + j * 0.4), hy - 15 + drop + tl * 0.5 + abs(sw) * 0.5)
        m, _ = S([knot, (hx + 2, hy - 17 + tl), (hx + 5 + reach * 0.4, hy - 20 + tl + j),
                  (hx + 3 + reach * 0.8 + sw * 0.6, hy - 19 + drop * 0.5 + tl), tip], r0, 0.6)
        hair |= m
    g.part(hair, HAIR)
    for (x, y) in ((hx + 3, hy - 17 + tl), (hx + 6, hy - 19 + tl), (hx + 9 + sw * 0.4, hy - 19 + tl)):
        g.px(x, y, 'gloss4')                                 # glossy sheen like the bird's crest

    # ears, flared a little when he's worked up, flat when sad
    e = p['ear']
    for s in (-1, 1):
        ear = E(hx + s * (13 + e), hy + 1 + (2 if e < 0 else 0), 6.5 + max(0, e), 8.5) | E(hx + s * (11 + e), hy + 8, 4, 4)
        ear &= (xx - hx) * s > 5
        g.part(ear)
        inner = E(hx + s * (13 + e), hy + 1, 3.6, 5.8) & ear & ((xx - hx) * s > 10)
        g.set(inner, 'fgrey2')
        g.set(inner & ~_sh(inner, 0, 1), 'fgrey1')

    # body: thick neck and traps, a V-shaped torso, then each muscle as its own outlined shape
    traps = P([(bx - 8, 22 + by), (bx + 8, 22 + by), (bx + 20, 31 + by), (bx - 20, 31 + by)])
    torso = P([(bx - 19, 30 + by), (bx + 19, 30 + by), (bx + 16, 43), (bx + 12, CE + 1), (bx - 12, CE + 1),
               (bx - 16, 43)]) & above
    g.part(traps | torso, GLOSS)
    if not flex:
        for s in (-1, 1):                                    # biceps hang at the sides (grey wing colour)
            g.part(E(bx + s * 21, 42 + by * 0.5, 5.8, 7.4) & above)
    for s in (-1, 1):                                        # pecs: glossy black, the sheen shows the muscle
        g.part(E(bx + s * 7.5, 35.5 + by, 7.6, 5.0), GLOSS, line='ink')
        g.px(bx + s * 5, 33 + by, 'gloss4'); g.px(bx + s * 6, 33 + by, 'gloss4')
    for row, y in enumerate((41.5, 45.5)):                   # six-pack (the bottom pair hides under the cloth)
        for s in (-1, 1):
            g.part(E(bx + s * 2.6, y, 2.6, 2.0), GLOSS, line='ink')
    for s in (-1, 1):                                        # obliques / serratus notches
        g.px(bx + s * 10, 40, 'gloss3'); g.px(bx + s * 11, 42, 'gloss3'); g.px(bx + s * 10, 44, 'gloss3')
    for s in (-1, 1):                                        # deltoids cap the shoulders
        g.part(E(bx + s * 19.5, 32.5 + by, 6.6, 5.6), line='fgrey1')
    # feather collar round the neck: golden 'fire' feathers flare out behind, a ruff of glossy
    # blue-black scallops, and short silver hackles on top (the chin covers the middle)
    nk = 27 + by
    for k in range(8):
        a = math.pi * (1.06 + 0.88 * k / 7)
        root = (bx + math.cos(a) * 12, nk - 2 + math.sin(a) * 4)
        tip = (bx + math.cos(a) * 23, nk - 3 + math.sin(a) * 9)
        fm, _ = S([root, tip], 2.8, 0.8, n=5)
        g.part(fm, FIRE, line='copper0')
    for k in range(9):
        u = (k - 4) / 4
        x = bx + u * 16
        y = nk + 1.5 + 1.5 * u * u
        g.part(E(x, y, 3.0, 3.6), GLOSS, line='ink')
        g.px(x - 1, y - 2, 'gloss3'); g.px(x, y + 2, 'gloss4')
    for k in range(7):
        u = (k - 3) / 3
        x = bx + u * 11
        y = nk - 1 + u * u
        hm = E(x, y, 2.5, 3.0)
        g.part(hm, FUR, line='fgrey1')
        g.set(hm & (yy >= y + 1.5), 'fgrey1')                # dark tips

    # pha khao ma round the waist: checked cotton, knot at the hip
    cloth = torso & (yy >= 48) & above
    for y, x in zip(*np.nonzero(cloth)):
        y -= OY                                              # grid row -> design row
        u, v = (x - bx + 40) % 6, (y - 48) % 6
        if u in (0, 1) and v in (0, 1):
            c = 'red1'
        elif u in (0, 1) or v in (0, 1):
            c = 'paper4' if (u + v) % 2 == 0 else 'red4'
        elif u == 4:
            c = 'indigo2'
        else:
            c = 'red3'
        g.px(x, y, c)
    top_edge = cloth & ~_sh(cloth, 0, -1)
    g.set(top_edge, 'red4')
    g.set(_sh(top_edge, 0, 1) & torso & ~cloth, 'ink')      # rolled top edge
    kx, ky = bx + 9, 49
    g.part(E(kx, ky, 2.4, 2.0), CLOTH_RED)
    g.px(kx - 1, ky - 1, 'paper4')
    g.part(P([(kx, ky + 1), (kx + 3, ky + 1), (kx + 4, CE), (kx + 1, CE)]) & above, CLOTH_RED)

    # flexing arms
    if flex:
        up = flex
        for s in (-1, 1):
            g.part(E(bx + s * (22 + 2 * up), 40 - 12 * up + by, 5.6 + 0.9 * p['pump'], 6.6 - up) & above,
                   line='fgrey1')
            fore, _ = S([(bx + s * (24 + 2 * up), 36 - 8 * up + by), (bx + s * (25 + up), 30 - 10 * up),
                         (bx + s * (22 + up), 24 - 9 * up)], 3.4, 3.0)
            g.part(fore & above)
            g.stamp(HANDS['fist'], int(bx + s * (22 + up) - 3), int(24 - 9 * up) - 3, flip=s > 0)
            g.part(E(bx + s * 19.5, 32.5 + by, 6.6, 5.6), line='fgrey1')

    # head
    head = E(hx, hy - 1, 11.2, 10.0) | E(hx - 4.5, hy - 7.5, 6.6, 5) | E(hx + 4.5, hy - 7.5, 6.6, 5) | E(hx, hy + 5, 9, 5.5)
    g.part(head)
    for (dx, dy) in ((-6, -4), (5, -5), (-1, -8), (8, 1), (-8, 2)):          # barring in the plumage
        g.px(hx + dx, hy + dy, 'fgrey2'); g.px(hx + dx + 1, hy + dy + 1, 'fgrey2')
    g.part(E(hx + 1, hy - 11 + tl * 0.3, 1.8, 1.4), CLOTH_RED)              # tie of the topknot
    for s in (-1, 1):                                                        # the fireback's scarlet skin
        g.part(E(hx + s * 5, hy + 0.5, 3.5, 2.6), ('scarlet3', 'scarlet2', 'scarlet1', 'scarlet0'), line='fgrey1')
    # mouth (under the trunk) + tusks
    mx, my = hx, hy + 6
    mrows = MOUTHS[p['mouth']]
    cmap = {'k': 'ink', 'r': 'red0', 't': 'scarlet3', 'w': 'paper4'}
    w = len(mrows[0])
    for j, row in enumerate(mrows):
        for i, ch in enumerate(row):
            if ch in cmap:
                g.px(mx - w // 2 + i, my + j, cmap[ch])
    for s in (-1, 1):
        tm, _ = S([(mx + s * 3, my + 1), (mx + s * 5, my + 3), (mx + s * 5.5, my + 5)], 1.2, 0.8, n=4)
        g.part(tm, IVORY, light=False)
    # eyes + brows
    for s in (-1, 1):
        rows = EYES[p['eyes']]
        ex = hx + s * 5 - len(rows[0]) // 2 + (p['look'] if p['eyes'] in ('open', 'half') else 0)
        ey = hy - 1 + (1 if p['eyes'] in ('shut', 'happy') else 0)
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch == 'k':
                    g.px(ex + i, ey + j, 'ink')
                elif ch == 'w':
                    g.px(ex + i, ey + j, 'white')
        brow = BROWS[p['brow']]
        bw = len(brow[0])
        byy = hy - 5 - (1 if p['brow'] in ('raised', 'high') else 0) - (1 if p['brow'] == 'high' else 0)
        for j, row in enumerate(brow):
            r = row if s < 0 else row[::-1]
            for i, ch in enumerate(r):
                if ch == 'k':
                    g.px(hx + s * 5 - bw // 2 + i + (0 if s < 0 else 1), byy + j, 'ink')
    # trunk
    tm, samples = S([(hx + x, hy + y) for x, y in p['trunk']], 2.7, 1.3)
    g.part(tm)
    for i in range(6, len(samples) - 4, 5):                  # wrinkles
        x, y = samples[i]
        g.px(x - 1, y, 'fgrey2'); g.px(x, y, 'fgrey2')
    g.px(samples[-1][0], samples[-1][1], 'fgrey1')

    # forearms + hands
    if not flex:
        for s, (kind, hx_, hy_) in zip((-1, 1), p['hands']):
            hpx, hpy = bx + hx_, hy_
            elbow = (bx + s * 21, 48)
            if hpy > 50:                                     # resting on the counter, angled in to the hands
                fa, _ = S([elbow, ((elbow[0] + hpx) / 2, (elbow[1] + hpy) / 2 + 1), (hpx, hpy)], 4.0, 3.4)
            else:                                            # raised
                mid = ((elbow[0] + hpx) / 2 + s * 3, (elbow[1] + hpy) / 2)
                fa, _ = S([elbow, mid, (hpx, hpy + 2)], 3.8, 3.2)
            g.part(fa)
            if kind == 'cup':
                cx0, cy0 = int(hpx - 2), int(hpy - 7)
                for j, row in enumerate(['oooooo', 'ogggGo', 'ohwwwo', 'ohwwfo', 'ohwwfo', '.oooo.']):
                    for i, ch in enumerate(row):
                        c = {'o': 'ink', 'g': 'leaf3', 'G': 'leaf4', 'h': 'white', 'w': 'paper3', 'f': 'paper1'}.get(ch)
                        if c:
                            g.px(cx0 + i, cy0 + j, c)
                g.stamp(HANDS['fist'], int(hpx - 3), int(hpy - 2), flip=s > 0)
                if f % 4 < 2 and hpy > 50:
                    g.px(cx0 + 2, cy0 - 2, 'cloud3'); g.px(cx0 + 3, cy0 - 3, 'cloud2')
                continue
            rows = HANDS[kind]
            g.stamp(rows, int(hpx - len(rows[0]) // 2), int(hpy - len(rows) // 2), flip=s > 0)

    # mood marks
    mk = p['marks']
    if mk:
        kind, k = mk
        if kind == 'sparkle':
            for (sx, sy, ph) in ((hx - 15, hy - 12, 0), (hx + 16, hy - 9, 2), (hx + 12, hy - 20, 4)):
                r = [0, 1, 2, 1, 0, 0][(k + ph) % 6]
                if r:
                    for d in range(-r, r + 1):
                        g.px(sx + d, sy, 'gold4'); g.px(sx, sy + d, 'gold4')
                    g.px(sx, sy, 'white')
        elif kind in ('vein', 'vein_small'):
            vx, vy = hx + 7, hy - 8
            rows = ['k.k', 'kkk', 'k.k'] if kind == 'vein_small' else ['.k.k.', 'kk.kk', '.....', 'kk.kk', '.k.k.']
            o = len(rows) // 2
            for j, row in enumerate(rows):
                for i, ch in enumerate(row):
                    if ch == 'k':
                        g.px(vx + i - o, vy + j - o, 'scarlet3')
            if kind == 'vein' and k in (5, 6):
                for (dx, dy) in ((-6, 0), (6, 0), (-5, -2), (5, -2)):     # impact lines at the slam
                    g.px(bx + 10 + dx, 57 + dy, 'paper4')
        elif kind == 'shock':
            for (dx, dy) in ((-13, -12), (-15, -9), (13, -12), (15, -9), (0, -17)):
                g.px(hx + dx, hy + dy, 'paper4')
                g.px(hx + dx + (1 if dx > 0 else -1 if dx < 0 else 0), hy + dy - 1, 'paper4')
    if p['tear'] is not None:
        tx_, ty_ = hx - 6, hy + 2 + (p['tear'] % 6)
        g.px(tx_, ty_, 'sky4'); g.px(tx_, ty_ + 1, 'sky2')

    # fine wavy barring on the grey plumage (the fireback's vermiculation)
    base = np.all(g.a[:, :, :3] == np.array(PAL['fgrey3'], np.uint8), axis=2)
    xg, yg = np.mgrid[0:GW, 0:GH][0].T, np.mgrid[0:GW, 0:GH][1].T
    bars = ((xg + (yg // 4) * 3) % 6 < 2) & (yg % 4 == 1)
    g.a[base & bars] = col('fgrey2')
    # one clean black silhouette round the whole figure
    solid = g.a[:, :, 3] == 255
    rim = solid & ~(_sh(solid, 1, 0) & _sh(solid, -1, 0) & _sh(solid, 0, 1) & _sh(solid, 0, -1))
    g.set(rim, 'ink')
    # nothing of the body below the counter edge except forearms, hands, cup and shadow
    solid = g.a[:, :, 3] == 255
    keep = np.zeros_like(solid)
    if not flex:
        for s, (kind, hx_, hy_) in zip((-1, 1), p['hands']):
            hpx, hpy = bx + hx_, hy_
            elbow = (bx + s * 21, 48)
            if hpy > 50:
                fa, _ = S([elbow, ((elbow[0] + hpx) / 2, (elbow[1] + hpy) / 2 + 1), (hpx, hpy)], 5.0, 4.4)
            else:
                mid = ((elbow[0] + hpx) / 2 + s * 3, (elbow[1] + hpy) / 2)
                fa, _ = S([elbow, mid, (hpx, hpy + 2)], 4.8, 4.2)
            keep |= fa | E(hpx, hpy, 6, 5.5)
    g.a[(yy >= CE) & solid & ~keep] = 0
    return g


def uncle_pong(mood, f):
    g = _render(mood, f)
    cv = Canvas(W_, H_)
    cv.a = np.repeat(np.repeat(g.a, K, axis=0), K, axis=1)
    return cv


MOODS = ['idle', 'talk', 'happy', 'angry', 'surprised', 'sad', 'sip', 'flex']


def sheets():
    return {m: [uncle_pong(m, f) for f in range(NF)] for m in MOODS}


# ---------------------------------------------------------------- registration
from propkit import prop                                    # noqa: E402
from layout import COUNTER                                  # noqa: E402


@prop('uncle_pong', 2, 'npc', 960 - W_ // 2, COUNTER['back'] - EDGE_PX,
      'Uncle Pong: big bare-chested elephant x fireback uncle in a checked pha khao ma, chunky 3x pixels. '
      'Moods: idle (blinks), talk, happy (thumbs up), angry (fist slam), surprised, sad, sip, flex '
      '(12 frames each). Draw after the counter layer; his body stops at the counter edge.',
      fps=8, shadow='none')
def uncle_pong_prop():
    return sheets()
