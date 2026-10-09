"""Foreground furniture layer (v2): the room-1 clay hearth (its arched
firebox is where the talking fire lives), the prep table, and the long
serving counter of rooms 2-3 seen from the keeper's side."""
import math
import random
from pixel import Canvas, PAL, step
from shapes import wood_grain_h, wood_grain_v, chip, crack
from furn import R, wood_face, inset, bar_pull, ring_pull, knob
from layout import W, H, TABLE, COUNTER, HEARTH, FLOOR

FIREBOX = dict(cx=111, top=262, w=92, bottom=350)          # arched opening in the hearth
HEARTH_TOP = (212, 244)                                    # back / front edge of the hearth top
BURNERS = [(66, 228), (158, 228)]                          # burner holes (centre x, y)
DRAWERS = [(1548, 322, 96, 24), (1656, 322, 96, 24)]       # room 3 (x, y, w, h)


def _ring(cv, x, y, rx, ry, c, step_deg=6):
    for a in range(0, 360, step_deg):
        cv.px(int(round(x + math.cos(math.radians(a)) * rx)), int(round(y + math.sin(math.radians(a)) * ry)), c)


# ---------------------------------------------------------------- hearth
def _hearth(cv, rng):
    x0, x1 = HEARTH['x0'], HEARTH['x1']
    tb, tf = HEARTH_TOP
    # body: lime-plastered clay over brick, slightly bulging front
    for y in range(tf, H):
        for x in range(x0, x1):
            u = (x - x0) / (x1 - x0)
            c = 'paper2' if 0.1 < u < 0.7 else ('paper3' if u <= 0.1 else 'paper1')
            if u > 0.88:
                c = 'paper0'
            cv.px(x, y, c)
    for _ in range(140):                        # mottled lime
        bx, by = rng.randint(x0 + 2, x1 - 4), rng.randint(tf + 2, H - 4)
        c = rng.choice(('paper3', 'paper1', 'paper1'))
        cv.px(bx, by, c); cv.px(bx + 1, by, c)
    # top slab (we look down onto it): dark fired tiles with two burners
    for y in range(tb, tf):
        t = (y - tb) / (tf - tb)
        for x in range(x0 - 2, x1 + 2):
            c = 'stone1' if t < 0.25 else 'stone2'
            if (x // 14 + (y - tb) // 8) % 2 == 0:
                c = step(PAL[c], -1) if t < 0.6 else c
            cv.px(x, y, c)
        if (y - tb) % 8 == 0:
            cv.hline(x0 - 2, x1 + 1, y, 'stone0')
    for x in range(x0 - 2, x1 + 2, 14):
        cv.vline(x, tb, tf - 1, 'stone0')
    cv.hline(x0 - 2, x1 + 1, tf - 1, 'stone3')
    cv.hline(x0 - 2, x1 + 1, tf, 'stone4')
    cv.hline(x0 - 2, x1 + 1, tf + 1, 'stone1')
    for (bx, by) in BURNERS:
        cv.ellipse(bx, by, 30, 9, 'ink')
        _ring(cv, bx, by, 31, 10, 'stone3')
        _ring(cv, bx, by + 1, 31, 10, 'stone0')
        for k in range(-24, 25, 3):            # glow inside the burner
            cv.px(bx + k, by + 5, 'fire1' if abs(k) % 6 else 'fire2')
    # soot halo above and around the firebox
    fx, ft, fw, fb = FIREBOX['cx'], FIREBOX['top'], FIREBOX['w'], FIREBOX['bottom']
    for y in range(tf + 2, fb):
        for x in range(x0, x1):
            d = math.hypot((x - fx) / (fw * 0.85), (y - ft - 10) / 50)
            if d < 1.0 and (x + y) % 2 == 0:
                cv.shift(x, y, -1)
            if d < 0.75:
                cv.shift(x, y, -1)
    # firebox: brick arch around a dark mouth
    for y in range(ft - 10, fb + 1):
        for x in range(fx - fw // 2 - 10, fx + fw // 2 + 11):
            ax = (x - fx) / (fw / 2 + 10)
            arch_top = ft - 10 + (fw / 2 + 10) * (1 - math.sqrt(max(0, 1 - ax * ax))) * 0.55
            if y < arch_top or abs(ax) > 1:
                continue
            ix = (x - fx) / (fw / 2)
            inner_top = ft + (fw / 2) * (1 - math.sqrt(max(0, 1 - ix * ix))) * 0.55 if abs(ix) <= 1 else 1e9
            if abs(ix) <= 1 and y >= inner_top:
                depth = min(1.0, (y - inner_top) / 30)
                cv.px(x, y, 'ink' if depth < 0.7 or abs(ix) > 0.8 else 'wood0')
            else:
                # voussoir bricks
                ang = math.atan2(y - (ft + 30), x - fx)
                k = int((ang + math.pi) / (math.pi / 11))
                c = ('red1', 'copper1', 'red2', 'copper2')[k % 4]
                if int((ang + math.pi) / (math.pi / 11) * 10) % 10 == 0:
                    c = 'stone0'
                cv.px(x, y, c)
    # warm glow on the firebox floor and inner walls (the spirit lights it)
    for y in range(fb - 14, fb):
        for x in range(fx - fw // 2 + 6, fx + fw // 2 - 6):
            if (x * 3 + y) % 4 == 0:
                cv.px(x, y, 'fire0')
    cv.rect(fx - fw // 2 - 12, fb, fw + 24, 6, 'stone2')     # hearth stone sill
    cv.hline(fx - fw // 2 - 12, fx + fw // 2 + 11, fb, 'stone4')
    cv.hline(fx - fw // 2 - 12, fx + fw // 2 + 11, fb + 5, 'stone0')
    # iron fire door, hanging off one hinge to the left
    dx_, dy_ = fx - fw // 2 - 34, ft + 8
    for k in range(22):
        sk = k // 6
        cv.vline(dx_ + k, dy_ + sk, dy_ + 52 + sk, 'stone1' if k > 2 else 'stone2')
    for yy in range(dy_ + 6, dy_ + 52, 10):
        cv.hline(dx_ + 2, dx_ + 20, yy + 2, 'stone0')
        cv.px(dx_ + 4, yy, 'stone3'); cv.px(dx_ + 17, yy + 3, 'stone3')
    cv.rect(dx_ + 20, dy_ + 22, 4, 6, 'stone2')
    for _ in range(12):                                   # rust
        cv.px(dx_ + rng.randint(2, 20), dy_ + rng.randint(3, 52), 'copper1')
    # ash-pit slot and cracks / chips in the plaster
    cv.rect(x1 - 52, H - 26, 32, 10, 'ink'); cv.hline(x1 - 52, x1 - 21, H - 27, 'paper0')
    for k in range(5):
        cv.px(x1 - 48 + k * 6, H - 18, 'fire1')
    for _ in range(7):
        crack(cv, rng, rng.randint(x0 + 6, x1 - 6), rng.randint(tf + 6, H - 30), rng.randint(10, 26),
              'paper0', 'paper3', dirx=rng.uniform(-0.5, 0.5))
    for _ in range(4):
        chip(cv, rng.randint(x0 + 4, x1 - 20), rng.randint(tf + 8, H - 24), rng.randint(8, 16), rng.randint(6, 12),
             rng, under='red1', under_dark='red0', n=3, elong=0.8)
    # outline
    cv.vline(x0 - 1, tf, H - 1, 'wood0'); cv.vline(x1, tf, H - 1, 'wood0')
    cv.hline(x0 - 3, x1 + 2, tb - 1, 'ink')


# ---------------------------------------------------------------- prep table
def _tea_ring(cv, x, y, rx=5, ry=2, c='wood2'):
    _ring(cv, x, y, rx, ry, c, 8)


def _prep_table(cv, rng):
    x0, x1, tb, tf = TABLE['x0'], TABLE['x1'], TABLE['back'], TABLE['front']
    depth = tf - tb
    for i, (yy, hh) in enumerate(((tb, depth // 3), (tb + depth // 3, depth // 3),
                                  (tb + 2 * (depth // 3), depth - 2 * (depth // 3)))):
        wood_grain_h(cv, x0, yy, x1 - x0, hh, R('wood', 4), rng, dark=R('wood', 3), light=R('wood', 5))
        cv.hline(x0, x1 - 1, yy, 'wood3')
        cv.hline(x0, x1 - 1, yy + 1, 'wood5' if i else 'wood4')
    for y in range(tb, tb + 4):                              # far edge falls into shade
        for x in range(x0, x1):
            if y < tb + 2 or (x + y) % 2 == 0:
                cv.shift(x, y, -1)
    for _ in range(110):                                    # knife marks
        kx, ky = rng.randint(x0 + 10, x1 - 8), rng.randint(tb + 3, tf - 3)
        ln = rng.randint(2, 6)
        for k in range(ln):
            cv.px(kx + k, ky - k // 2, 'wood3')
        cv.px(kx + ln, ky - ln // 2, 'wood5')
    for _ in range(20):
        sx, sy = rng.randint(x0 + 20, x1 - 10), rng.randint(tb + 3, tf - 3)
        cv.px(sx, sy, 'leaf2'); cv.px(sx + 1, sy, 'leaf1')
    for _ in range(6):
        _tea_ring(cv, rng.randint(x0 + 30, x1 - 30), rng.randint(tb + 8, tf - 6), rng.randint(6, 9), 2.5, 'wood3')
    fy = tf
    wood_grain_h(cv, x0, fy, x1 - x0, 9, R('wood', 3), rng, dark=R('wood', 2), light=R('wood', 4))
    cv.hline(x0, x1 - 1, fy, 'wood5'); cv.hline(x0, x1 - 1, fy + 1, 'wood4')
    cv.hline(x0, x1 - 1, fy + 8, 'wood1'); cv.hline(x0 + 2, x1 - 3, fy + 9, 'ink')
    for _ in range(18):
        dx = rng.randint(x0 + 4, x1 - 10)
        cv.hline(dx, dx + rng.randint(2, 7), fy + 2, 'wood2')
    cv.rect(x0 + 8, fy + 10, x1 - x0 - 16, 4, 'wood1'); cv.hline(x0 + 8, x1 - 9, fy + 13, 'wood0')
    for lx in (x0 + 8, (x0 + x1) // 2 - 6, x1 - 20):
        wood_grain_v(cv, lx, fy + 10, 12, H - fy - 12, R('wood', 3), rng, dark=R('wood', 2), light=R('wood', 4),
                     knots=False)
        cv.vline(lx, fy + 10, H - 4, 'wood4'); cv.vline(lx + 1, fy + 10, H - 4, 'wood4')
        cv.vline(lx + 11, fy + 10, H - 4, 'wood1')
        cv.hline(lx - 2, lx + 13, H - 3, 'wood0')
    sy = 336
    wood_grain_h(cv, x0 + 8, sy, x1 - x0 - 16, 4, R('wood', 3), rng, dark=R('wood', 2), light=R('wood', 4))
    cv.hline(x0 + 8, x1 - 9, sy, 'wood5')
    cv.rect(x0 + 8, sy + 4, x1 - x0 - 16, 4, 'wood2'); cv.hline(x0 + 8, x1 - 9, sy + 7, 'wood0')


# ---------------------------------------------------------------- counter
def _counter(cv, rng):
    x0, x1, tb, tf = COUNTER['x0'], COUNTER['x1'] + 14, COUNTER['back'], COUNTER['front']
    depth = tf - tb
    r = 24

    def left_edge(y):
        t = (y - tb) / depth
        return x0 + int(r * (1 - math.sqrt(max(0.0, 1 - (1 - t) ** 2))))

    bounds = [0, 9, 20, depth]
    for i in range(3):
        yy, hh = tb + bounds[i], bounds[i + 1] - bounds[i]
        wood_grain_h(cv, x0, yy, x1 - x0, hh, R('wood', 3), rng, dark=R('wood', 2), light=R('wood', 4))
        cv.hline(x0, x1, yy, 'wood1' if i else 'wood2')
        cv.hline(x0, x1, yy + 1, 'wood4')
    for y in range(tb, tb + 5):
        for x in range(x0, x1):
            if y < tb + 2 or (x + y) % 2 == 0:
                cv.shift(x, y, -1)
    for yy in range(tb + 26, tf):                           # glossy band (window light)
        for xx in range(x0, x1):
            if (yy == tb + 27 and xx % 3) or (yy == tb + 28 and (xx + yy) % 2 == 0):
                cv.px(xx, yy, 'wood4')
    for _ in range(34):
        _tea_ring(cv, rng.randint(x0 + 30, x1 - 20), rng.randint(tb + 6, tf - 5), rng.randint(4, 8),
                  rng.uniform(1.6, 2.6), rng.choice(('wood2', 'wood2', 'wood1')))
    for _ in range(120):
        sx, sy = rng.randint(x0 + 10, x1 - 10), rng.randint(tb + 3, tf - 3)
        ln = rng.randint(3, 12)
        for k in range(ln):
            cv.px(sx + k, sy + (k * 2 // ln), 'wood4' if k % 2 else 'wood5')
    for (bx, by) in ((1010, tb + 14), (1830, tb + 18)):
        cv.ellipse(bx, by, 6, 2.2, 'wood1'); cv.px(bx - 1, by, 'ink'); cv.px(bx + 1, by, 'ink')
    ix, iy = 1460, tb + 16                                   # carved initials R+M
    for (dx, dy) in ((0, 0), (0, 1), (0, 2), (0, 3), (1, 0), (2, 1), (1, 2), (2, 3), (5, 1), (6, 0), (6, 1), (6, 2),
                     (7, 1), (9, 0), (9, 1), (9, 2), (9, 3), (10, 1), (11, 2), (12, 1), (13, 0), (13, 1), (13, 2), (13, 3)):
        cv.px(ix + dx, iy + dy, 'wood1')
    for yy in range(tb, tf):
        le = left_edge(yy)
        for xx in range(x0 - 2, le):
            cv.px(xx, yy, None)
        cv.px(le, yy, 'wood5'); cv.px(le + 1, yy, 'wood4')
    fy = tf
    cv.rect(x0, fy, x1 - x0, 7, 'wood3')
    cv.hline(x0, x1, fy, 'wood5'); cv.hline(x0, x1, fy + 1, 'wood4')
    cv.hline(x0, x1, fy + 6, 'wood1'); cv.hline(x0, x1, fy + 7, 'ink')
    for _ in range(26):
        dx = rng.randint(x0 + 4, x1 - 8)
        cv.hline(dx, dx + rng.randint(2, 8), fy + 3, 'wood2')
    cy0 = fy + 8
    cv.rect(x0, cy0, x1 - x0, H - cy0, 'wood1')
    for k in range(r):                                       # rounded end column
        c = ['wood1', 'wood2', 'wood2', 'wood3', 'wood3', 'wood4', 'wood3', 'wood3', 'wood2', 'wood2', 'wood1',
             'wood1'][min(11, k // 2)]
        cv.vline(x0 + k, fy, H - 1, c if k else 'ink')
    stiles = list(range(x0 + r + 6, x1 - 24, 92))
    for sx in stiles:
        pw = min(84, x1 - 14 - sx)
        if pw < 24:
            continue
        if any(sx - 10 <= d[0] < sx + pw + 10 or d[0] <= sx < d[0] + d[2] + 10 for d in DRAWERS):
            continue
        cv.rect(sx - 6, cy0 + 1, 6, H - cy0 - 1, 'wood2'); cv.vline(sx - 6, cy0 + 1, H - 1, 'wood3')
        jade = sx < 1280
        ramp = 'jade' if jade else 'wood'
        inset(cv, sx + 1, cy0 + 6, pw - 2, H - cy0 - 13, ramp, 2 if jade else 3, raised=True)
        if jade:
            for _ in range(3):
                chip(cv, sx + rng.randint(6, pw - 18), cy0 + rng.randint(6, 26), rng.randint(6, 14),
                     rng.randint(6, 14), rng, under='wood2', under_dark='wood1', n=3, elong=1.2)
        for _ in range(4):
            kx = rng.randint(sx + 4, sx + pw - 10)
            cv.hline(kx, kx + rng.randint(2, 6), H - 10 + rng.randint(0, 3), 'wood3')
    for (dx, dy, dw, dh) in DRAWERS:                          # drawers (journal in the left one)
        cv.rect(dx - 4, dy - 4, dw + 8, dh + 8, 'ink')
        wood_face(cv, dx, dy, dw, dh, rng, 'wood', 3, 'h')
        cv.hline(dx, dx + dw - 1, dy, 'wood5'); cv.vline(dx, dy, dy + dh - 1, 'wood4')
        cv.hline(dx, dx + dw - 1, dy + dh - 1, 'wood1'); cv.vline(dx + dw - 1, dy, dy + dh - 1, 'wood1')
        bar_pull(cv, dx + dw // 2, dy + dh // 2 - 1, 14)
        cv.rect(dx + 6, dy + 5, 12, 7, 'gold1'); cv.rect(dx + 7, dy + 6, 10, 5, 'paper3')
        cv.hline(dx + 8, dx + 15, dy + 8, 'wood2')
    ddx, ddy = DRAWERS[0][0] - 4, DRAWERS[0][1] + DRAWERS[0][3] + 6
    cv.rect(ddx, ddy, 212, H - ddy, 'wood0')
    for k in range(100):                                      # cupboard door sagging off a hinge
        sag = k // 30
        cv.vline(ddx + k, ddy + sag, H - 1, 'wood2' if k > 1 else 'wood3')
    cv.hline(ddx, ddx + 99, ddy, 'wood3')
    knob(cv, ddx + 92, ddy + 10)
    cv.rect(x1 - 5, tb, 5, H - tb, 'wood1'); cv.vline(x1 - 5, tb, H, 'wood2')


def build_counter(seed=17):
    rng = random.Random(seed)
    cv = Canvas(W, H)
    _hearth(cv, rng)
    _prep_table(cv, rng)
    _counter(cv, rng)
    return cv


def floor_shadows(shell):
    for yy in range(FLOOR, H):
        for xx in range(TABLE['x0'], TABLE['x1']):
            shell.shift(xx, yy, -1)
            if yy < FLOOR + 36 or ((xx + yy) % 2 == 0 and yy < FLOOR + 52):
                shell.shift(xx, yy, -1)
