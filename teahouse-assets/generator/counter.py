"""Foreground furniture layer (v3): the room-1 clay hearth (its arched
firebox is where the talking fire lives), the prep table, and one plain
Japanese serving counter across rooms 2-3: a pale hinoki top over a dark
lattice of vertical slats (tategoshi).

Every piece is a box in its room's perspective: you look down on its top,
whose far edge recedes towards the vanishing point, and see the one side
face that turns towards the middle of the room."""
import math
import random
import numpy as np
from pixel import Canvas, PAL, step
from shapes import crack
import moss
from furn import R, wood_face, knob
from layout import W, H, TABLE, COUNTER, HEARTH, FLOOR, EYE_Y, FURN_CONV, room_of, vp

HEARTH_TOP = (198, 222)                                    # back / front edge of the wooden top
_HC = (HEARTH['x0'] + HEARTH['x1']) // 2
MOUTH = dict(cx=_HC, x0=_HC - 56, x1=_HC + 56, spring=288, top=258, bottom=350)   # arched firebox opening
FIREBOX = dict(cx=_HC, top=MOUTH['top'], w=MOUTH['x1'] - MOUTH['x0'], bottom=MOUTH['bottom'])
BURNERS = [(_HC - 50, 210), (_HC + 48, 210)]               # where pots would stand on the wooden top
DRAWERS = [(1481, 320, 96, 24)]                            # room 3: the one journal drawer (x, y, w, h)
BAYER = [[0.0, 0.5], [0.75, 0.25]]
STONE = ['stone1', 'stone2', 'stone3', 'stone4']
WARM_STONE = ['wood1', 'wood2', 'paper0', 'paper1']


def in_mouth(x, y):
    """Inside the firebox opening (segmental arch over straight jambs)?"""
    m = MOUTH
    rx = (m['x1'] - m['x0']) / 2
    if not (m['x0'] <= x < m['x1']) or y >= m['bottom']:
        return False
    if y >= m['spring']:
        return True
    ry = m['spring'] - m['top']
    dx = (x + 0.5 - m['cx']) / rx
    dy = (y + 0.5 - m['spring']) / ry
    return dx * dx + dy * dy <= 1


def back_x(x, ri=None):
    """Far-edge x of a top whose near edge is at x (eased perspective)."""
    ri = room_of(x) if ri is None else ri
    vx, _ = vp(ri)
    return vx + (x - vx) * FURN_CONV


def back_y(y, y_back_top, y_front_top):
    """Vertical position of the far edge for a point y on the near face,
    using the same ratio as the top (so side faces stay planar)."""
    r = (y_back_top - EYE_Y) / (y_front_top - EYE_Y)
    return EYE_Y + (y - EYE_Y) * r


def _quad(cv, pts, fn):
    """Fill a convex quad; fn(x, y, u, v) -> colour, u/v in 0..1 across it
    (u along the first edge, v along the second)."""
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]

    def inside(x, y):
        s = 0
        for i in range(4):
            ax, ay = pts[i]
            bx, by = pts[(i + 1) % 4]
            c = (bx - ax) * (y - ay) - (by - ay) * (x - ax)
            if c != 0:
                if s == 0:
                    s = 1 if c > 0 else -1
                elif (c > 0) != (s > 0):
                    return False
        return True
    for y in range(int(math.floor(min(ys))), int(math.ceil(max(ys))) + 1):
        for x in range(int(math.floor(min(xs))), int(math.ceil(max(xs))) + 1):
            if inside(x + 0.5, y + 0.5):
                c = fn(x, y)
                if c is not None:
                    cv.px(x, y, c)


def _ring(cv, x, y, rx, ry, c, step_deg=6):
    for a in range(0, 360, step_deg):
        cv.px(int(round(x + math.cos(math.radians(a)) * rx)), int(round(y + math.sin(math.radians(a)) * ry)), c)


# ---------------------------------------------------------------- furnace
def _rock(cv, rng, x, y, w, h, ramp, clip=None, soot=None):
    """One rough stone: a squarish blob with jittered corners, lit from the
    upper left, darker rim at the bottom right."""
    if w < 4 or h < 4:
        return
    cx, cy = x + w / 2, y + h / 2
    rx, ry = w / 2, h / 2
    k = [rng.uniform(0.8, 1.0) for _ in range(4)]            # corner roundness per quadrant
    p = rng.uniform(3.0, 6.0)
    shear = rng.uniform(-0.18, 0.18)
    tone = rng.choice((0, 0, 1, 1, 1, 2))                    # each stone a slightly different value
    speck = rng.random() < 0.5
    for yy in range(int(y), int(y + h) + 1):
        for xx in range(int(x), int(x + w) + 1):
            if clip and not clip(xx, yy):
                continue
            u, v = (xx + 0.5 - cx) / rx, (yy + 0.5 - cy) / ry
            u += shear * v
            q = (0 if u < 0 else 1) + (0 if v < 0 else 2)
            r = (abs(u) ** p + abs(v) ** p) ** (1 / p) / k[q]
            if r > 1:
                continue
            light = -0.62 * u - 0.78 * v
            i = 1 + tone // 2
            if r > 0.78:                                     # bevel
                i += 1 if light > 0.15 else (-1 if light < -0.1 else 0)
            elif light > 0.55:
                i += 1
            elif light < -0.55:
                i -= 1
            if speck and (xx * 7 + yy * 13) % 29 == 0:
                i -= 1
            i = max(0, min(len(ramp) - 1, i))
            c = ramp[i]
            if soot and soot(xx, yy):
                c = step(PAL[c], -1)
            cv.px(xx, yy, c)


def _stone_face(cv, rng, x0, x1, y0, y1, soot=None, skip=None):
    cv.rect(x0, y0, x1 - x0, y1 - y0, 'stone0')              # mortar
    y = y0
    row = 0
    while y < y1:
        rh = min(rng.randint(13, 19), y1 - y)
        if y1 - y - rh < 8:
            rh = y1 - y
        x = x0 - rng.randint(4, 22)
        while x < x1:
            sw = rng.randint(20, 40) if row % 3 else rng.randint(26, 46)
            ramp = WARM_STONE if rng.random() < 0.16 else STONE
            _rock(cv, rng, x + 1, y + 1, sw - 2, rh - 2, ramp,
                  clip=lambda xx, yy: x0 <= xx < x1 and y0 <= yy < y1 and not (skip and skip(xx, yy)), soot=soot)
            x += sw
        y += rh
        row += 1


def _furnace(cv, rng):
    x0, x1 = HEARTH['x0'], HEARTH['x1']
    tb, tf = HEARTH_TOP
    m = MOUTH
    ri = 0
    lip = 8                                                   # thickness of the wooden top
    sy = tf + lip                                             # stone starts under the top
    bx1 = back_x(x1, ri)
    # side face (turned to the room centre): stone in shade, courses in perspective
    yb_bot = back_y(H, tb, tf)
    _quad(cv, [(x1, sy), (bx1, back_y(sy, tb, tf)), (bx1, yb_bot), (x1, H)], lambda x, y: 'stone1')
    for yy in range(sy + 16, H, 16):
        cv.line(x1, yy, int(round(bx1)), int(round(back_y(yy, tb, tf))), 'stone0')
    for k, u in enumerate((0.3, 0.65)):
        for yy in range(sy, H):
            if ((yy - sy) // 16 + k) % 2 == 0:
                cv.px(int(round(x1 + (bx1 - x1) * u)), int(round(yy + (back_y(yy, tb, tf) - yy) * u)), 'stone0')
    cv.vline(x1, sy, H - 1, 'ink')

    def soot(x, y):                                           # smoke-blackened above the mouth
        d = abs(x + 0.5 - m['cx']) / (m['x1'] - m['cx'] + 8)
        reach = 0.42 + (m['top'] + 6 - y) / 70
        return y < m['top'] + 6 and (d < reach - 0.06 or (d < reach and (x + y) % 2 == 0))
    _stone_face(cv, rng, x0, x1, sy, H - 6, soot=soot)
    # plinth: one course of big flat stones
    _stone_face(cv, random.Random(rng.random()), x0 - 2, x1 + 2, H - 6, H)
    # arch: wedge stones (voussoirs) round the mouth, a big keystone on top
    rx = (m['x1'] - m['x0']) / 2
    ry = m['spring'] - m['top']
    band = 13
    n = 9

    def r_in(ang):
        return 1 / math.sqrt((math.cos(ang) / rx) ** 2 + (math.sin(ang) / ry) ** 2)
    for i in range(n):
        key = i == n // 2
        a0 = math.pi + math.pi * i / n + 0.05
        a1 = math.pi + math.pi * (i + 1) / n - 0.05
        out = band + (5 if key else rng.randint(-1, 1))
        pts = []
        for k in range(7):
            ang = a0 + (a1 - a0) * k / 6
            pts.append((m['cx'] + math.cos(ang) * (r_in(ang) + 1), m['spring'] + math.sin(ang) * (r_in(ang) + 1)))
        for k in range(7):
            ang = a1 - (a1 - a0) * k / 6
            pts.append((m['cx'] + math.cos(ang) * (r_in(ang) + out), m['spring'] + math.sin(ang) * (r_in(ang) + out)))
        tmp = Canvas(W, H)
        tmp.poly([(int(round(x)), int(round(y))) for x, y in pts], 'white')
        vm = tmp.a[:, :, 3] > 0
        ring = vm.copy()
        ring[1:] |= vm[:-1]; ring[:-1] |= vm[1:]; ring[:, 1:] |= vm[:, :-1]; ring[:, :-1] |= vm[:, 1:]
        cv.a[ring & ~vm] = (*PAL['stone0'], 255)
        ys, xs = np.nonzero(vm)
        am = (a0 + a1) / 2
        for yy, xx in zip(ys, xs):
            dx, dy = xx + 0.5 - m['cx'], yy + 0.5 - m['spring']
            ang = math.atan2(dy, dx) % (2 * math.pi)
            t = (math.hypot(dx, dy) - r_in(ang)) / out
            side = (ang - am) / ((a1 - a0) / 2)               # -1 .. 1 across the wedge
            if t < 0.16:
                c = 'stone4' if key else 'stone3'             # the inner face catches the fire light
            elif t > 0.84 or side > 0.82:
                c = 'stone1'
            elif side < -0.8:
                c = 'stone3'
            else:
                c = 'stone3' if key else 'stone2'
            if not key and m['top'] - 2 < yy < m['top'] + 10 and abs(xx - m['cx']) < 40:
                c = step(PAL[c], -1)                          # smoke-stained crown of the arch
            cv.px(xx, yy, c)
        if key:                                               # a rune cut into the keystone
            kx, ky = m['cx'] - 1, m['top'] - band + 1
            for (gx, gy) in ((0, 0), (1, 1), (2, 0), (1, 2), (1, 3), (0, 4), (2, 4)):
                cv.px(kx + gx, ky + gy, 'stone1')
    jy = m['spring']
    for k, hgt in enumerate((16, 14, 17, 15, 20)):             # jambs: stacked blocks
        if jy >= m['bottom']:
            break
        hgt = min(hgt, m['bottom'] - jy)
        for s, xj in ((-1, m['x0'] - 1), (1, m['x1'])):
            wd = band - (2 if (k + (s > 0)) % 2 else 0)
            bx = xj - wd + 1 if s < 0 else xj
            cv.rect(bx - 1, jy, wd + 2, hgt, 'stone0')
            _rock(cv, rng, bx, jy + 1, wd - 1, hgt - 2, STONE)
        jy += hgt
    # the dark mouth (the animated fire sprite fills it)
    for yy in range(m['top'], m['bottom']):
        for xx in range(m['x0'], m['x1']):
            if in_mouth(xx, yy):
                cv.px(xx, yy, 'ink')
    # hearth stone in front of the mouth, ash spilled on it
    cv.rect(m['x0'] - 16, m['bottom'], m['x1'] - m['x0'] + 32, 6, 'stone2')
    cv.hline(m['x0'] - 16, m['x1'] + 15, m['bottom'], 'stone4')
    cv.hline(m['x0'] - 16, m['x1'] + 15, m['bottom'] + 5, 'stone0')
    for _ in range(40):
        ax = rng.randint(m['x0'] - 10, m['x1'] + 10)
        cv.px(ax, m['bottom'] + rng.randint(1, 3), rng.choice(('stone3', 'stone4', 'paper2')))
    # wooden top: thick planks, the far edge recedes
    bx0w, bx1w = back_x(x0 - 4, ri), back_x(x1 + 4, ri)

    def top(x, y):
        t = (y - tb) / (tf - tb)
        plank = int(t * 4)
        c = ('wood3', 'wood4', 'wood3', 'wood4')[min(3, plank)]
        if abs(t * 4 - round(t * 4)) < 0.09 and 0.05 < t < 0.95:
            c = 'wood1'
        return c
    _quad(cv, [(x0 - 4, tf), (bx0w, tb), (bx1w, tb), (x1 + 4, tf)], top)
    for _ in range(26):                                       # grain
        gy = rng.randint(tb + 2, tf - 2)
        gx = rng.randint(x0 + 6, x1 - 30)
        ln = rng.randint(10, 34)
        for k in range(ln):
            if cv.get(gx + k, gy)[:3] in (PAL['wood3'], PAL['wood4']):
                cv.px(gx + k, gy, 'wood2' if k % 7 else 'wood5')
    for (sx, sy_, r) in ((m['cx'] - 10, tf - 6, 9), (m['cx'] + 22, tf - 12, 5), (x0 + 30, tb + 8, 4)):  # scorch
        for yy in range(int(sy_ - r / 2), int(sy_ + r / 2) + 1):
            for xx in range(int(sx - r), int(sx + r) + 1):
                if ((xx - sx) / r) ** 2 + ((yy - sy_) / (r / 2)) ** 2 < 1 and (xx + yy) % 3:
                    cv.shift(xx, yy, -2 if ((xx - sx) / r) ** 2 < 0.3 else -1)
    cv.line(int(bx0w), tb - 1, int(bx1w), tb - 1, 'wood0')
    # front edge of the top: plank ends, nails, a charred patch over the mouth
    cv.rect(x0 - 4, tf, x1 - x0 + 8, lip, 'wood3')
    cv.hline(x0 - 4, x1 + 3, tf, 'wood5'); cv.hline(x0 - 4, x1 + 3, tf + 1, 'wood4')
    cv.hline(x0 - 4, x1 + 3, tf + lip - 1, 'wood1'); cv.hline(x0 - 2, x1 + 1, tf + lip, 'ink')
    for nx in range(x0 + 6, x1, 34):
        cv.px(nx, tf + 4, 'stone1'); cv.px(nx, tf + 3, 'stone3')
    for xx in range(m['cx'] - 30, m['cx'] + 31):
        for yy in range(tf + 2, tf + lip):
            if abs(xx - m['cx']) < 18 or (xx + yy) % 2 == 0:
                cv.shift(xx, yy, -2 if abs(xx - m['cx']) < 12 else -1)
    for yy in range(sy, sy + 3):                              # shadow under the overhang
        for xx in range(x0, x1):
            if yy == sy or (xx + yy) % 2 == 0:
                cv.shift(xx, yy, -1)
    cv.vline(x0 - 1, sy, H - 1, 'ink')


# ---------------------------------------------------------------- prep table
def _prep_table(cv, rng):
    x0, x1, tb, tf = TABLE['x0'], TABLE['x1'], TABLE['back'], TABLE['front']
    ri = 0
    bx0, bx1 = back_x(x0, ri), back_x(x1, ri)

    def top(x, y):
        t = (y - tb) / (tf - tb)
        c = 'wood3' if t < 0.12 else 'wood4'
        if (y - tb) in (10, 21):
            c = 'wood3'
        return c
    _quad(cv, [(x0, tf), (bx0, tb), (bx1, tb), (x1, tf)], top)
    for _ in range(14):                                     # a few knife marks
        kx, ky = rng.randint(x0 + 20, x1 - 30), rng.randint(tb + 4, tf - 3)
        for k in range(rng.randint(3, 6)):
            cv.px(kx + k, ky - k // 2, 'wood3')
    for _ in range(3):
        _ring(cv, rng.randint(x0 + 50, x1 - 50), rng.randint(tb + 9, tf - 6), 7, 2.5, 'wood3', 8)
    cv.line(int(bx0), tb, int(bx1), tb, 'wood2')
    fy = tf                                                 # apron
    cv.rect(x0, fy, x1 - x0, 9, 'wood3')
    cv.hline(x0, x1 - 1, fy, 'wood5'); cv.hline(x0, x1 - 1, fy + 1, 'wood4')
    cv.hline(x0, x1 - 1, fy + 8, 'wood1'); cv.hline(x0 + 2, x1 - 3, fy + 9, 'ink')
    cv.rect(x0 + 8, fy + 10, x1 - x0 - 16, 4, 'wood1'); cv.hline(x0 + 8, x1 - 9, fy + 13, 'wood0')
    for lx in (x0 + 8, (x0 + x1) // 2 - 6, x1 - 20):        # legs
        cv.rect(lx, fy + 10, 12, H - fy - 12, 'wood3')
        cv.vline(lx, fy + 10, H - 4, 'wood4'); cv.vline(lx + 1, fy + 10, H - 4, 'wood4')
        cv.vline(lx + 10, fy + 10, H - 4, 'wood2'); cv.vline(lx + 11, fy + 10, H - 4, 'wood1')
        cv.hline(lx - 2, lx + 13, H - 3, 'wood0')
    sy = 336                                                # lower shelf
    cv.rect(x0 + 8, sy, x1 - x0 - 16, 4, 'wood3')
    cv.hline(x0 + 8, x1 - 9, sy, 'wood5')
    cv.rect(x0 + 8, sy + 4, x1 - x0 - 16, 4, 'wood2'); cv.hline(x0 + 8, x1 - 9, sy + 7, 'wood0')


# ---------------------------------------------------------------- serving counter
def _counter(cv, rng):
    x0, x1, tb, tf = COUNTER['x0'], COUNTER['x1'], COUNTER['back'], COUNTER['front']
    bx0, bx1 = back_x(x0, room_of(x0)), back_x(x1, room_of(x1))

    def top(x, y):
        t = (y - tb) / (tf - tb)
        if t < 0.08:
            return 'hinoki1'
        c = 'hinoki3' if 0.45 < t < 0.75 else 'hinoki2'
        return c
    _quad(cv, [(x0, tf), (bx0, tb), (bx1, tb), (x1, tf)], top)
    for _ in range(60):                                    # long, quiet grain
        gy = rng.randint(tb + 3, tf - 3)
        gx = rng.randint(x0 + 30, x1 - 80)
        ln = rng.randint(30, 110)
        for k in range(ln):
            if cv.get(gx + k, gy)[3] and cv.get(gx + k, gy)[:3] != PAL['hinoki1']:
                cv.px(gx + k, gy + (k * 3 // ln), 'hinoki1' if k % 9 else 'hinoki2')
    for _ in range(14):                                     # old tea rings and spills
        rx, ry = rng.randint(x0 + 60, x1 - 40), rng.randint(tb + 7, tf - 6)
        _ring(cv, rx, ry, rng.uniform(5, 8), rng.uniform(1.8, 2.8), 'hinoki1', 8)
    for _ in range(9):
        sx, sy, r = rng.randint(x0 + 50, x1 - 50), rng.randint(tb + 6, tf - 6), rng.uniform(6, 16)
        for yy in range(int(sy - r / 3), int(sy + r / 3) + 1):
            for xx in range(int(sx - r), int(sx + r) + 1):
                d = ((xx - sx) / r) ** 2 + ((yy - sy) / (r / 3)) ** 2
                if d < 1 and cv.get(xx, yy)[3] and ((xx + yy) % 2 == 0 or d < 0.4):
                    cv.shift(xx, yy, -1)
    for (cx0, cx1) in ((880, 1110), (1330, 1520), (1700, 1820)):     # splits along the grain
        y = tb + rng.randint(10, 26)
        for xx in range(cx0, cx1):
            if rng.random() < 0.18:
                y += rng.choice((-1, 1))
            y = max(tb + 4, min(tf - 4, y))
            cv.px(xx, y, 'hinoki0')
            if rng.random() < 0.5:
                cv.px(xx, y + 1, 'hinoki1')
    for yy in range(tb, tb + 6):                            # grime along the far edge
        for xx in range(x0, x1):
            if cv.get(xx, yy)[3] and BAYER[yy % 2][xx % 2] < (tb + 6 - yy) / 6:
                cv.shift(xx, yy, -1)
    # end bevels follow the perspective
    cv.line(x0, tf, int(round(bx0)), tb, 'hinoki4')
    cv.line(x1 - 1, tf, int(round(bx1)), tb, 'hinoki1')
    # slab edge
    fy = tf
    cv.rect(x0, fy, x1 - x0, 7, 'hinoki3')
    cv.hline(x0, x1 - 1, fy, 'hinoki5'); cv.hline(x0, x1 - 1, fy + 1, 'hinoki4')
    cv.hline(x0, x1 - 1, fy + 6, 'hinoki1')
    cv.hline(x0, x1 - 1, fy + 7, 'ink'); cv.hline(x0, x1 - 1, fy + 8, 'wood0')
    for _ in range(22):                                     # chips and dents in the slab edge
        ex = rng.randint(x0 + 4, x1 - 10)
        ew = rng.randint(2, 7)
        for k in range(ew):
            dep = 1 + int(2 * (1 - abs(k - ew / 2) / (ew / 2 + 0.1)))
            for d in range(dep):
                cv.px(ex + k, fy + d, 'hinoki1' if d < dep - 1 else 'hinoki2')
    # lattice front: dark frame, vertical slats over a dark recess
    ly0, ly1 = fy + 9, H - 8
    cv.rect(x0, ly0, x1 - x0, H - ly0, 'wood0')
    stiles = list(range(x0, x1, 152)) + [x1 - 7]
    dcx = DRAWERS[0][0] + DRAWERS[0][2] // 2                 # the drawer fills the panel it sits in
    k = max(i for i in range(len(stiles) - 1) if stiles[i] <= dcx)
    drawer_zone = (stiles[k] + 7, stiles[k + 1])
    for i in range(len(stiles) - 1):
        sx0, sx1 = stiles[i] + 7, stiles[i + 1]
        if sx1 - sx0 < 8:
            continue
        if sx0 < drawer_zone[1] and sx1 > drawer_zone[0]:
            continue
        cv.rect(sx0, ly0, sx1 - sx0, 4, 'wood1'); cv.hline(sx0, sx1 - 1, ly0, 'wood2')
        cv.rect(sx0, ly1 - 4, sx1 - sx0, 4, 'wood1'); cv.hline(sx0, sx1 - 1, ly1 - 4, 'wood2')
        for sx in range(sx0 + 3, sx1 - 2, 6):
            r = rng.random()
            if r < 0.06:                                    # slat gone
                continue
            top = ly0 + 4 + (rng.randint(6, 18) if r < 0.14 else 0)     # snapped slat
            cv.vline(sx, top, ly1 - 5, 'wood2')
            cv.vline(sx + 1, top, ly1 - 5, 'wood3')
            cv.vline(sx + 2, top, ly1 - 5, 'wood2')
            cv.px(sx + 1, top, 'wood4' if top > ly0 + 4 else 'wood1')
            if rng.random() < 0.3:                          # rot at the foot
                cv.vline(sx + 1, ly1 - 5 - rng.randint(2, 7), ly1 - 5, 'wood1')
    for sx in stiles:
        cv.rect(sx, ly0, 7, H - ly0, 'wood1')
        cv.vline(sx, ly0, H - 1, 'wood2'); cv.vline(sx + 6, ly0, H - 1, 'wood0')
    # drawers (the journal lives in the left one)
    dz0, dz1 = drawer_zone
    cv.rect(dz0, ly0, dz1 - dz0, H - ly0, 'wood1')
    for (dx, dy, dw, dh) in DRAWERS:
        cv.rect(dx - 2, dy - 2, dw + 4, dh + 4, 'ink')
        wood_face(cv, dx, dy, dw, dh, rng, 'hinoki', 2, 'h', knots=False)
        cv.hline(dx, dx + dw - 1, dy, 'hinoki4'); cv.vline(dx, dy, dy + dh - 1, 'hinoki3')
        cv.hline(dx, dx + dw - 1, dy + dh - 1, 'hinoki1'); cv.vline(dx + dw - 1, dy, dy + dh - 1, 'hinoki1')
        _ring(cv, dx + dw // 2, dy + dh // 2 + 1, 4, 3, 'stone1', 20)
        cv.px(dx + dw // 2, dy + dh // 2 - 2, 'stone3')
    cv.rect(dz0 + 2, DRAWERS[0][1] + DRAWERS[0][3] + 6, dz1 - dz0 - 4, H - (DRAWERS[0][1] + DRAWERS[0][3] + 6),
            'wood0')
    # plinth
    cv.rect(x0, H - 8, x1 - x0, 8, 'ink')
    cv.hline(x0, x1 - 1, H - 8, 'wood1')


def build_counter(seed=17):
    rng = random.Random(seed)
    cv = Canvas(W, H)
    _furnace(cv, rng)
    _prep_table(cv, rng)
    _counter(cv, rng)
    _moss(cv, random.Random(seed + 9))
    return cv


def _moss(cv, rng):
    """Moss on the cool stones of the furnace (outer piers, side, the foot) and
    along the bottom of the counter, never near the fire or over the drawer."""
    x0, x1 = HEARTH['x0'], HEARTH['x1']
    m = MOUTH

    def away(x, y):
        if m['x0'] - 18 <= x < m['x1'] + 18 and y > m['top'] - 16:
            return False                                   # too hot by the mouth
        for (dx, dy, dw, dh) in DRAWERS:
            if dx - 4 <= x < dx + dw + 4 and dy - 4 <= y < dy + dh + 4:
                return False
        return True
    moss.patches(cv, rng, (x0, 300, x0 + 44, H - 2), 4, size=(8, 18), where=away)
    moss.patches(cv, rng, (x1 - 44, 300, x1, H - 2), 4, size=(8, 18), where=away)
    moss.patches(cv, rng, (x1, 250, x1 + 34, H - 2), 4, size=(8, 16), where=away)
    moss.patches(cv, rng, (x0, HEARTH_TOP[1] + 9, x0 + 30, HEARTH_TOP[1] + 40), 2, size=(6, 12), where=away)
    moss.patches(cv, rng, (x1 - 30, HEARTH_TOP[1] + 9, x1, HEARTH_TOP[1] + 40), 1, size=(6, 12), where=away)
    moss.patches(cv, rng, (COUNTER['x0'], 334, COUNTER['x1'], H - 2), 16, size=(8, 22), mode='creep', where=away)
    moss.patches(cv, rng, (COUNTER['x0'], 318, COUNTER['x0'] + 120, H - 2), 3, size=(8, 16), where=away)
    moss.patches(cv, rng, (COUNTER['x1'] - 120, 318, COUNTER['x1'], H - 2), 3, size=(8, 16), where=away)


def floor_shadows(shell):
    """Shade the floor under the prep table."""
    for yy in range(FLOOR, H):
        for xx in range(TABLE['x0'] + 4, TABLE['x1'] - 4):
            shell.shift(xx, yy, -1)
            if yy > TABLE['front'] + 4 or (xx + yy) % 2 == 0:
                shell.shift(xx, yy, -1)
