"""Organic pixel trees in the classic hand-pixelled style:

* foliage = irregular masses built from overlapping lobes, each lobe a dome
  lit from the upper left; lobes are painted top to bottom so every tier's
  light crown sits against the dark belly of the tier behind it
* band edges are zig-zagged into rows of leaf points, silhouettes are
  nibbled into leaf clusters, then the whole mass gets a 1px dark outline
* trunks are thick, twisting, flared at the roots, with long bark strands
  following the wood and a dark outline
* each mass is a separate sprite that sways 1px on its own phase -> F frames
"""
import math
import random
import numpy as np
from pixel import Canvas, PAL, step

F = 8
GREEN = ['leaf0', 'leaf1', 'leaf2', 'leaf3', 'leaf4', 'leaf5']
DEEP = ['ink', 'leaf0', 'leaf1', 'leaf2', 'leaf3', 'leaf4']     # pine
PINK = ['pink0', 'pink1', 'pink2', 'pink3', 'pink4', 'white']
JADE = ['leaf0', 'jade1', 'jade2', 'jade3', 'jade4', 'jade5']
MAPLE = ['red0', 'red1', 'red2', 'red3', 'red4', 'red5']
BARK = ['bark0', 'bark1', 'bark2', 'bark3', 'bark4', 'bark5']


from leaves import leafy, value_noise, leaf_stamp


# ---------------------------------------------------------------- trunks
def _catmull(pts, step_len=0.35):
    out = []
    P = [pts[0]] + list(pts) + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        seg = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
        n = max(2, int(seg / step_len))
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(tuple(
                0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                       + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    out.append(tuple(pts[-1]))
    return out


def limbs_draw(cv, limbs, rng, ramp=BARK, outline=True):
    """limbs: list of (points, r_start, r_end[, flare]). Cylinder shading lit
    from the upper left, long twisting bark strands, flared bases."""
    o, dk, md, lt, hi, sp = ramp
    mask = np.zeros((cv.h, cv.w), bool)
    for limb in limbs:
        pts, r0, r1 = limb[0], limb[1], limb[2]
        flare = limb[3] if len(limb) > 3 else 0
        S = _catmull(pts)
        n = len(S)
        arc = [0.0]
        for i in range(1, n):
            arc.append(arc[-1] + math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]))
        best = {}
        ph = rng.uniform(0, 6.28)
        for i, (x, y) in enumerate(S):
            t = i / max(1, n - 1)
            r = r0 + (r1 - r0) * t + flare * (1 - t) ** 6
            a, b = S[max(0, i - 3)], S[min(n - 1, i + 3)]
            dx, dy = b[0] - a[0], b[1] - a[1]
            ln = math.hypot(dx, dy) or 1
            dx, dy = dx / ln, dy / ln
            nx, ny = dy, -dx
            if nx > 0 or (nx == 0 and ny > 0):
                nx, ny = -nx, -ny
            for yy in range(int(y - r) - 1, int(y + r) + 2):
                for xx in range(int(x - r) - 1, int(x + r) + 2):
                    px_, py_ = xx + 0.5 - x, yy + 0.5 - y
                    d2 = px_ * px_ + py_ * py_
                    if d2 > r * r:
                        continue
                    s = (px_ * nx + py_ * ny) / max(r, 0.6)
                    if (xx, yy) not in best or d2 < best[(xx, yy)][0]:
                        best[(xx, yy)] = (d2, s, arc[i], r)
        for (xx, yy), (d2, s, u, r) in best.items():
            if not cv.inb(xx, yy):
                continue
            # light comes from the upper left: left half lit
            if s > 0.5:
                c = hi
            elif s > 0.05:
                c = lt
            elif s > -0.55:
                c = md
            else:
                c = dk
            if r > 1.8:
                strands = 0.8 + r * 0.13
                q = s * strands + 0.45 * math.sin(u * 0.07 + ph) + 0.15 * math.sin(u * 0.19 + ph * 2)
                fr = q - math.floor(q)
                if fr < 0.12:                       # crevice
                    c = step(PAL[c], -1) if c != dk else o
                elif 0.48 < fr < 0.6 and s > 0.0:   # raised strand catching light
                    c = step(PAL[c], 1)
            cv.px(xx, yy, c)
            mask[yy, xx] = True
    if outline:
        h, w = mask.shape
        for yy in range(h):
            for xx in range(w):
                if mask[yy, xx]:
                    continue
                if ((xx > 0 and mask[yy, xx - 1]) or (xx < w - 1 and mask[yy, xx + 1]) or
                        (yy > 0 and mask[yy - 1, xx]) or (yy < h - 1 and mask[yy + 1, xx])):
                    cv.px(xx, yy, o)
    return mask


def roots(bx, by, rng, spread=1.0, r=3.4):
    """Thick root claws that leave the trunk well above the ground and
    splay down into it."""
    out = []
    for side, ln, rr, top in ((-1, 15, 1.0, 16), (1, 16, 1.0, 15), (-1, 8, 0.85, 10), (1, 9, 0.8, 9)):
        L = ln * spread * rng.uniform(0.85, 1.15)
        out.append(([(bx + side * 1.0, by - top), (bx + side * L * 0.35, by - top * 0.45),
                     (bx + side * L * 0.75, by - 1.5), (bx + side * L, by - 0.5)], r * rr * 1.25, 1.2))
    return out


# ---------------------------------------------------------------- tree
class Tree:
    """Species code works in a logical frame (base = lbase); k scales the
    whole tree up into pixels, so big trees get more leaves, not fatter ones."""

    def __init__(self, w, h, base, k=1.0):
        self.k = k
        self.lbase = base
        self.w, self.h = int(w * k), int(h * k)
        self.base = (int(base[0] * k), int(base[1] * k))
        self.trunk = Canvas(self.w, self.h)
        self.masses = []   # dicts: sprite, x, y, behind, phase, amp
        self.extra = []

    def map(self, x, y):
        return (self.base[0] + (x - self.lbase[0]) * self.k, self.base[1] + (y - self.lbase[1]) * self.k)

    def limbs(self, L, rng):
        k = self.k
        out = []
        for limb in L:
            pts = [self.map(x, y) for (x, y) in limb[0]]
            rest = [max(0.7, limb[1] * k), max(0.7, limb[2] * k)] + ([limb[3] * k] if len(limb) > 3 else [])
            out.append((pts, *rest))
        return limbs_draw(self.trunk, out, rng)

    def add_mass(self, rng, cx, cy, lobes, ramp, behind=False, amp=1, kind='leaf', flowers=None,
                 leaf_len=(5, 8), **_):
        k = self.k
        cx, cy = self.map(cx, cy)
        lobes = [(a * k, b * k, c * k, d * k) for (a, b, c, d) in lobes]
        ll = (leaf_len[0] * k ** 0.45, leaf_len[1] * k ** 0.45)
        spr, ox, oy, m = leafy(rng, lobes, ramp, kind=kind, dark=1 if behind else 0,
                               flowers=flowers, leaf_len=ll)
        self.masses.append(dict(s=spr, x=int(cx) - ox, y=int(cy) - oy, behind=behind,
                                ph=rng.uniform(0, 6.28), amp=amp, mask=m))

    def shade_trunk(self):
        """Foliage casts shade on the wood just under it."""
        cover = np.zeros((self.h, self.w), bool)
        for m in self.masses:
            ys, xs = np.nonzero(m['mask'])
            for yy, xx in zip(ys + m['y'], xs + m['x']):
                if 0 <= yy < self.h and 0 <= xx < self.w:
                    cover[yy, xx] = True
        sh = np.zeros_like(cover)
        for d in range(1, 7):
            sh[d:] |= cover[:-d]
        a = self.trunk.a
        for yy, xx in zip(*np.nonzero(sh & ~cover)):
            if a[yy, xx, 3]:
                self.trunk.shift(xx, yy, -1, only=('bark',))

    def frame(self, f):
        cv = Canvas(self.w, self.h)
        for m in self.masses:
            if m['behind']:
                cv.blit(m['s'], m['x'] + sway(f, m['ph'], m['amp']), m['y'])
        cv.blit(self.trunk, 0, 0)
        for m in self.masses:
            if not m['behind']:
                cv.blit(m['s'], m['x'] + sway(f, m['ph'], m['amp']), m['y'])
        for fn in self.extra:
            fn(cv, f)
        return cv

    def frames(self):
        return [self.frame(f) for f in range(F)]


def sway(f, phase, amp=1):
    return int(round(amp * math.sin(2 * math.pi * f / F + phase)))


def _jit(rng, lobes, j=1.5):
    return [(x + rng.uniform(-j, j), y + rng.uniform(-j, j), rx * rng.uniform(0.92, 1.08),
             ry * rng.uniform(0.92, 1.08)) for (x, y, rx, ry) in lobes]


# ---------------------------------------------------------------- species
def tree_oak(seed=4, ramp=GREEN, kind='leaf', flowers=None, w=170, h=160, k=1.0):
    """Big gnarled tree: twisted trunk splitting into three limbs, separate
    foliage masses with sky between them (reference 'old oak')."""
    rng = random.Random(seed)
    T = Tree(w, h, (w // 2 - 4, h - 4), k)
    bx, by = T.lbase
    L = []
    L.append(([(bx - 2, by - 58), (bx - 18, by - 70), (bx - 34, by - 84), (bx - 48, by - 92)], 4.2, 1.2))
    L.append(([(bx + 2, by - 54), (bx + 18, by - 66), (bx + 34, by - 82), (bx + 50, by - 94)], 4.2, 1.2))
    L.append(([(bx + 3, by - 70), (bx + 6, by - 92), (bx + 2, by - 112), (bx - 4, by - 128)], 4, 1.2))
    L.append(([(bx - 30, by - 80), (bx - 36, by - 96), (bx - 34, by - 108)], 2.2, 0.8))
    L.append(([(bx + 28, by - 78), (bx + 22, by - 94), (bx + 16, by - 104)], 2, 0.8))
    L.append(([(bx + 34, by - 82), (bx + 48, by - 80), (bx + 58, by - 74)], 1.8, 0.7))
    L.append(([(bx - 20, by - 72), (bx - 34, by - 66), (bx - 44, by - 62)], 1.8, 0.7))
    L += roots(bx, by, rng, 1.3, 4)
    L.append(([(bx, by), (bx - 5, by - 22), (bx + 4, by - 44), (bx - 2, by - 62), (bx + 3, by - 76)], 7.5, 4.2, 6))
    T.limbs(L, rng)
    kw = dict(kind=kind, flowers=flowers)
    T.add_mass(rng, bx - 2, by - 120, _jit(rng, [(-16, -6, 22, 13), (10, -10, 20, 14), (0, 6, 18, 9)]),
               ramp, behind=True, **kw)
    T.add_mass(rng, bx - 48, by - 98, _jit(rng, [(-6, -6, 18, 11), (8, 2, 15, 9), (-14, 6, 10, 7)]), ramp, **kw)
    T.add_mass(rng, bx + 48, by - 100, _jit(rng, [(4, -6, 18, 11), (-8, 3, 14, 9), (14, 6, 10, 7)]), ramp, **kw)
    T.add_mass(rng, bx - 2, by - 134, _jit(rng, [(-8, -2, 18, 10), (10, 0, 15, 9), (0, 8, 13, 7)]), ramp, **kw)
    T.add_mass(rng, bx + 52, by - 72, _jit(rng, [(0, 0, 12, 7), (8, 4, 7, 5)]), ramp, **kw)
    T.add_mass(rng, bx - 46, by - 64, _jit(rng, [(0, 0, 11, 7), (-7, 4, 7, 5)]), ramp, **kw)
    T.add_mass(rng, bx + 16, by - 108, _jit(rng, [(0, 0, 12, 8)]), ramp, **kw)
    T.shade_trunk()
    return T


def tree_bushy(seed=5, ramp=GREEN, w=110, h=150, k=1.0):
    """Tall dense tree: one big stacked mass, trunk + roots below
    (reference 'tall bushy')."""
    rng = random.Random(seed)
    T = Tree(w, h, (w // 2, h - 4), k)
    bx, by = T.lbase
    L = [([(bx, by - 30), (bx + 12, by - 44), (bx + 18, by - 52)], 3, 1)]
    L += roots(bx, by, rng, 1.1, 3.6)
    L.append(([(bx, by), (bx - 4, by - 16), (bx + 3, by - 32), (bx, by - 48)], 6.5, 3.5, 5))
    T.limbs(L, rng)
    lobes = []
    y = -8
    side = 1
    for k in range(6):
        rw = 25 - abs(k - 2.2) * 3.4
        lobes.append((side * rng.uniform(2, 7), y, rw * rng.uniform(0.8, 1.0), rng.uniform(10, 13)))
        lobes.append((-side * rw * 0.62, y + rng.uniform(2, 6), rw * 0.5, rng.uniform(7, 9)))
        side = -side
        y -= rng.uniform(11, 15)
    T.add_mass(rng, bx, by - 44, lobes, ramp)
    T.shade_trunk()
    return T


def tree_windswept(seed=6, ramp=GREEN, w=150, h=140, flowers=None, kind='leaf', k=1.0):
    """Leaning trunk, foliage blown into separate drifts (reference #1)."""
    rng = random.Random(seed)
    T = Tree(w, h, (w // 2 - 16, h - 4), k)
    bx, by = T.lbase
    L = [([(bx + 10, by - 50), (bx + 26, by - 66), (bx + 44, by - 76)], 3.4, 1),
         ([(bx + 6, by - 58), (bx - 4, by - 76), (bx - 22, by - 86)], 3.2, 1),
         ([(bx + 26, by - 66), (bx + 34, by - 86), (bx + 30, by - 98)], 2, 0.8)]
    L += roots(bx, by, rng, 1.1, 3.6)
    L.append(([(bx, by), (bx + 6, by - 20), (bx + 14, by - 40), (bx + 8, by - 58)], 6.5, 3.4, 5))
    T.limbs(L, rng)
    T.add_mass(rng, bx - 20, by - 92, _jit(rng, [(-8, -2, 20, 12), (10, 4, 14, 9), (-18, 6, 11, 7)]), ramp,
               flowers=flowers, kind=kind)
    T.add_mass(rng, bx + 36, by - 100, _jit(rng, [(0, -4, 18, 12), (12, 4, 13, 8), (-10, 6, 10, 7)]), ramp,
               flowers=flowers, kind=kind)
    T.add_mass(rng, bx + 50, by - 72, _jit(rng, [(0, 0, 14, 9), (-8, 5, 9, 6)]), ramp, flowers=flowers, kind=kind)
    T.add_mass(rng, bx + 10, by - 104, _jit(rng, [(0, 0, 14, 9)]), ramp, behind=True, flowers=flowers, kind=kind)
    T.shade_trunk()
    return T


def tree_sakura(seed=1):
    return tree_oak(seed, PINK, kind='blossom', w=176, h=160)


def tree_maple(seed=3):
    return tree_windswept(seed, MAPLE, kind='maple')


def tree_pine(seed=2, k=1.0):
    """Japanese black pine: S-curved trunk, flat layered needle pads."""
    rng = random.Random(seed)
    w, h = 236, 190
    T = Tree(w, h, (100, h - 4), k)
    bx, by = T.lbase
    trunk = [(bx, by), (bx - 9, by - 30), (bx + 8, by - 62), (bx - 4, by - 98), (bx + 12, by - 130), (bx + 18, by - 150)]
    pads = [(-48, -54, 32, 8), (44, -82, 36, 9), (-38, -108, 30, 8), (38, -130, 28, 8),
            (6, -156, 22, 7), (72, -106, 18, 6), (-72, -70, 16, 6)]
    L = []
    for (dx, dy, rx, ry) in pads:
        tp = min(trunk, key=lambda p: abs(p[1] - (by + dy + 10)))
        L.append(([tp, ((tp[0] + bx + dx) / 2, (tp[1] + by + dy) / 2 + 6), (bx + dx * 0.8, by + dy + 5)], 3.2, 1))
        L.append(([(bx + dx * 0.55, by + dy + 6), (bx + dx * 0.95 + 6, by + dy + 3)], 1.5, 0.7))
    L += roots(bx, by, rng, 1.4, 4)
    L.append((trunk, 8, 3, 6))
    T.limbs(L, rng)
    for (dx, dy, rx, ry) in pads:
        lob = [(-rx * 0.45, 0, rx * 0.6, ry), (rx * 0.4, -1, rx * 0.6, ry), (0, -ry * 0.4, rx * 0.5, ry * 0.8)]
        T.add_mass(rng, bx + dx + 5, by + dy - 4, _jit(rng, [(a, b - 2, c * 0.9, d) for (a, b, c, d) in lob]),
                   DEEP, behind=True, kind='needle')
        T.add_mass(rng, bx + dx, by + dy, _jit(rng, lob), DEEP, kind='needle')
    T.shade_trunk()
    return T


def tree_willow(seed=7, ramp=GREEN, racemes=None, w=170, h=150, k=1.0):
    """Weeping tree: domed crown with hanging curtains that swing. With
    racemes=(ramp...) the curtains become wisteria flower chains."""
    rng = random.Random(seed)
    T = Tree(w, h, (w // 2, h - 4), k)
    bx, by = T.lbase
    L = [([(bx, by - 46), (bx - 24, by - 70), (bx - 50, by - 80)], 3.8, 1),
         ([(bx + 2, by - 50), (bx + 28, by - 70), (bx + 54, by - 76)], 3.8, 1)]
    L += roots(bx, by, rng, 1.2, 4)
    L.append(([(bx, by), (bx + 6, by - 16), (bx - 6, by - 34), (bx + 3, by - 52), (bx, by - 66)], 7, 3.8, 6))
    T.limbs(L, rng)
    crown = _jit(rng, [(-40, 4, 24, 12), (-14, -6, 24, 15), (14, -8, 24, 15), (42, 4, 22, 12),
                       (0, -20, 20, 12), (0, 8, 30, 9)])
    T.add_mass(rng, bx, by - 92, crown, ramp, leaf_len=(6, 9))
    curtains = []
    for ci in range(int(32 * T.k)):
        x = bx - 68 + ci * 4.4 / T.k + rng.uniform(-1.5, 1.5)
        top = by - 92 + 2 + abs(x - bx) * 0.06 + rng.uniform(0, 5)
        ln = (rng.randint(14, 34) if racemes is None else rng.randint(14, 28)) * T.k
        px_, py_ = T.map(x, top)
        curtains.append((px_, py_, int(ln), rng.uniform(0, 6.28)))
    curtains.sort(key=lambda c: c[2])
    cols = racemes or ('leaf0', 'leaf1', 'leaf2', 'leaf3', 'leaf4')

    def draw_curtains(cv, f):
        layer = Canvas(cv.w, cv.h)
        for (x, top, ln, ph) in curtains:
            sw = math.sin(2 * math.pi * f / F + ph)
            for j in range(0, ln):
                t = j / ln
                xx = int(round(x + sw * 1.8 * t * t))
                yy = int(top + j)
                if racemes is None:
                    layer.px(xx, yy, cols[1])           # hanging twig
                    if j % 2 == 0:                      # leaf pairs, pointing down and out
                        side = -1 if (j // 2) % 2 == 0 else 1
                        c_lit = cols[3] if t > 0.25 else cols[2]
                        c_shd = cols[2] if t > 0.25 else cols[1]
                        for (dx, dy, sd) in leaf_stamp(math.atan2(1.6, side * 1.0), 3, 1.2):
                            layer.px(xx + dx, yy + dy, c_lit if sd > 0 else c_shd)
                        if t > 0.5 and j % 6 == 0:
                            layer.px(xx + side, yy + 1, cols[4])
                else:
                    wdt = 2 if t < 0.25 else (1 if t < 0.7 else 0)
                    for d in range(-wdt, wdt + 1):
                        floret = (j + d * 2) % 3
                        c = cols[3] if floret == 0 else (cols[2] if floret == 1 else cols[1])
                        if d > 0 and floret == 0:
                            c = cols[2]
                        layer.px(xx + d, yy, c)
                    if j % 3 == 0 and wdt:
                        layer.px(xx - wdt, yy, cols[4] if t < 0.5 else cols[3])
            if racemes is not None:
                layer.px(int(round(x + sw * 1.8)), int(top + ln), cols[2])
        layer.outline(cols[0], selective=False)
        cv.blit(layer, 0, 0)
    T.extra.append(draw_curtains)
    T.shade_trunk()
    return T


def tree_wisteria(seed=8):
    return tree_willow(seed, GREEN, racemes=('purp0', 'purp1', 'purp2', 'purp3', 'pink4'))


def bush(seed, rx=16, ry=10, ramp=GREEN, flowers=None):
    rng = random.Random(seed)
    lobes = _jit(rng, [(-rx * 0.4, 0, rx * 0.7, ry), (rx * 0.4, 1, rx * 0.65, ry * 0.9),
                       (0, -ry * 0.4, rx * 0.6, ry * 0.8)])
    spr, ox, oy, m = leafy(rng, lobes, ramp, flowers=flowers, leaf_len=(4, 6))
    return spr


def small_tree(seed, ramp=GREEN, scale=0.5, outline=True):
    """Distant tree for the hills: same recipe, few lobes."""
    rng = random.Random(seed)
    w, h = int(40 * scale) + 10, int(60 * scale) + 8
    T = Tree(w, h, (w // 2, h - 2))
    bx, by = T.lbase
    limbs_draw(T.trunk, [([(bx, by), (bx + 1, by - 20 * scale)], 2.0 * scale + 0.6, 1)], rng)
    T.add_mass(rng, bx, by - 30 * scale,
               _jit(rng, [(-6 * scale, 0, 12 * scale, 10 * scale), (6 * scale, -4 * scale, 11 * scale, 10 * scale)], 1),
               ramp, leaf_len=(3, 4))
    return T
