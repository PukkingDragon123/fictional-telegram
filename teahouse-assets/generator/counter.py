"""Foreground furniture layer: room-1 prep table and the rooms 2-3 serving
counter (seen from the keeper's side, so the drawers face the player)."""
import math
import random
from pixel import Canvas, PAL, step
from shapes import wood_grain_h, wood_grain_v, chip
from room import W, H, TABLE, COUNTER, FLOOR

DRAWERS = [(1186, 241, 66, 16), (1262, 241, 66, 16)]   # room 3, (x, y, w, h)


def _tea_ring(cv, x, y, rx=5, ry=2, c='wood2'):
    for a in range(0, 360, 8):
        cv.px(int(round(x + math.cos(math.radians(a)) * rx)),
              int(round(y + math.sin(math.radians(a)) * ry)), c)


def _prep_table(cv, rng):
    x0, x1, top = TABLE['x0'], TABLE['x1'], TABLE['top']
    # top surface (scrubbed pale wood, two boards)
    for (yy, hh) in ((top, 4), (top + 4, 4)):
        wood_grain_h(cv, x0, yy, x1 - x0, hh, 'wood4', rng, dark='wood3', light='wood5')
    cv.hline(x0, x1 - 1, top, 'wood3')
    cv.hline(x0, x1 - 1, top + 4, 'wood3')
    # knife marks, herb stains, a scorched ring where the stove sits
    for _ in range(70):
        kx, ky = rng.randint(x0 + 70, x1 - 6), rng.randint(top + 1, top + 7)
        ln = rng.randint(2, 4)
        for k in range(ln):
            cv.px(kx + k, ky - (k // 2), 'wood3')
        cv.px(kx + ln, ky - ln // 2, 'wood5')
    for _ in range(14):
        sx, sy = rng.randint(x0 + 80, x1 - 10), rng.randint(top + 2, top + 6)
        cv.px(sx, sy, 'leaf2')
        cv.px(sx + 1, sy, 'leaf1')
    _tea_ring(cv, 44, top + 4, 22, 3, 'wood1')
    _tea_ring(cv, 44, top + 4, 20, 2.4, 'wood2')
    for xx in range(26, 64):
        if (xx * 7) % 5 < 2:
            cv.px(xx, top + 3 + (xx % 3), 'wood2')
    # front edge
    fy = top + 8
    wood_grain_h(cv, x0, fy, x1 - x0, 6, 'wood3', rng, dark='wood2', light='wood4')
    cv.hline(x0, x1 - 1, fy, 'wood5')
    cv.hline(x0, x1 - 1, fy + 5, 'wood1')
    cv.hline(x0 + 2, x1 - 3, fy + 6, 'wood0')
    # dents along the edge
    for _ in range(14):
        dx = rng.randint(x0 + 4, x1 - 8)
        cv.hline(dx, dx + rng.randint(2, 5), fy + 1, 'wood2')
    # legs + lower shelf
    legs = [x0 + 6, 156, 300, x1 - 15]
    for lx in legs:
        wood_grain_v(cv, lx, fy + 6, 9, H - fy - 10, 'wood3', rng, dark='wood2', light='wood4', knots=False)
        cv.vline(lx, fy + 6, H - 5, 'wood4')
        cv.vline(lx + 1, fy + 6, H - 5, 'wood4')
        cv.vline(lx + 8, fy + 6, H - 5, 'wood1')
        cv.hline(lx - 1, lx + 9, H - 4, 'wood1')   # foot
        cv.hline(lx - 2, lx + 10, H - 3, 'wood0')
    sy = 246
    wood_grain_h(cv, x0 + 6, sy, x1 - x0 - 12, 3, 'wood3', rng, dark='wood2', light='wood4')
    cv.hline(x0 + 6, x1 - 7, sy, 'wood4')
    cv.rect(x0 + 6, sy + 3, x1 - x0 - 12, 3, 'wood2')
    cv.hline(x0 + 6, x1 - 7, sy + 5, 'wood0')
    # stretcher rail just below the top (darker, in shadow)
    cv.rect(x0 + 6, fy + 7, x1 - x0 - 12, 3, 'wood1')
    cv.hline(x0 + 6, x1 - 7, fy + 9, 'wood0')


def _counter(cv, rng):
    x0, x1, top = COUNTER['x0'], COUNTER['x1'] + 12, COUNTER['top']
    depth = 20
    r = 18  # radius of the rounded left end
    def left_edge(y):
        t = (y - top) / depth          # 0 at back, 1 at front
        return x0 + int(r * (1 - math.sqrt(max(0.0, 1 - (1 - t) ** 2))))
    # top surface: three long boards, varnish worn off where elbows rest
    boards = [(top, 6), (top + 6, 7), (top + 13, depth - 13)]
    for (yy, hh) in boards:
        wood_grain_h(cv, x0, yy, x1 - x0, hh, 'wood3', rng, dark='wood2', light='wood4')
        cv.hline(x0, x1, yy, 'wood2')
        cv.hline(x0, x1, yy + 1, 'wood4')
    # glossy band near the front edge (window light on old varnish)
    for yy in range(top + 14, top + depth):
        for xx in range(x0, x1):
            if (yy == top + 15 and xx % 3) or (yy == top + 16 and (xx + yy) % 2 == 0):
                cv.px(xx, yy, 'wood4')
    # stains, rings, scratches, a burn, carved initials
    for _ in range(26):
        _tea_ring(cv, rng.randint(x0 + 30, x1 - 20), rng.randint(top + 4, top + depth - 4),
                  rng.randint(3, 6), rng.uniform(1.4, 2.2), rng.choice(('wood2', 'wood2', 'wood1')))
    for _ in range(80):
        sx, sy = rng.randint(x0 + 10, x1 - 10), rng.randint(top + 2, top + depth - 2)
        ln = rng.randint(3, 9)
        for k in range(ln):
            cv.px(sx + k, sy + (k * 2 // ln), 'wood4' if k % 2 else 'wood5')
    for (bx, by) in ((760, top + 8), (1350, top + 11)):
        cv.ellipse(bx, by, 4, 1.6, 'wood1')
        cv.px(bx - 1, by, 'ink')
    # initials "R+M" scratched in
    ix, iy = 1080, top + 9
    for (dx, dy) in ((0, 0), (0, 1), (0, 2), (1, 0), (2, 1), (1, 1), (2, 2),
                     (4, 1), (5, 0), (5, 1), (5, 2), (6, 1),
                     (8, 0), (8, 1), (8, 2), (9, 0), (10, 1), (11, 0), (12, 0), (12, 1), (12, 2)):
        cv.px(ix + dx, iy + dy, 'wood1')
        cv.px(ix + dx + 1, iy + dy + 1, 'wood4') if dy == 2 else None
    # rounded left end: carve the silhouette
    for yy in range(top, top + depth):
        le = left_edge(yy)
        for xx in range(x0 - 2, le):
            cv.px(xx, yy, None)
        cv.px(le, yy, 'wood5')
        cv.px(le + 1, yy, 'wood4')
    # front edge (lip)
    fy = top + depth
    cv.rect(x0, fy, x1 - x0, 5, 'wood3')
    cv.hline(x0, x1, fy, 'wood5')
    cv.hline(x0, x1, fy + 1, 'wood4')
    cv.hline(x0, x1, fy + 4, 'wood1')
    cv.hline(x0, x1, fy + 5, 'ink')
    for _ in range(20):
        dx = rng.randint(x0 + 4, x1 - 8)
        cv.hline(dx, dx + rng.randint(2, 6), fy + 2, 'wood2')
    # cabinet front
    cy0 = fy + 6
    cv.rect(x0, cy0, x1 - x0, H - cy0, 'wood1')
    cv.hline(x0, x1, cy0, 'wood0')
    # rounded end column shading (cylinder)
    for k in range(r):
        c = ['wood1', 'wood1', 'wood2', 'wood2', 'wood3', 'wood3', 'wood3', 'wood2'][min(7, k // 2)]
        cv.vline(x0 + k, fy, H - 1, c if k > 0 else 'wood0')
    cv.vline(x0 + 5, fy, H - 1, 'wood4')
    # panels along the front
    stiles = list(range(x0 + r + 4, x1 - 20, 74))
    for i, sx in enumerate(stiles):
        pw = min(66, x1 - 12 - sx)
        if pw < 20:
            continue
        in_drawer_zone = any(sx <= d[0] < sx + pw + 8 for d in DRAWERS)
        if in_drawer_zone:
            continue
        py0, py1 = cy0 + 5, H - 6
        # stile/rail frame
        cv.rect(sx - 4, cy0 + 1, 4, H - cy0 - 1, 'wood2')
        cv.vline(sx - 4, cy0 + 1, H - 1, 'wood3')
        # inset panel: faded jade paint on the room-2 side, bare wood in room 3
        jade = sx < 960
        base = 'jade1' if jade else 'wood2'
        cv.rect(sx + 1, py0, pw - 2, py1 - py0, base)
        cv.hline(sx + 1, sx + pw - 2, py0, 'wood0')
        cv.vline(sx + 1, py0, py1 - 1, 'wood0')
        cv.hline(sx + 2, sx + pw - 2, py1 - 1, 'wood3')
        cv.vline(sx + pw - 2, py0 + 1, py1 - 1, 'wood3')
        # raised centre field
        cv.rect(sx + 6, py0 + 5, pw - 12, py1 - py0 - 10, step(PAL[base], 1))
        cv.hline(sx + 6, sx + pw - 7, py0 + 5, step(PAL[base], 2))
        cv.hline(sx + 6, sx + pw - 7, py1 - 6, step(PAL[base], -1))
        if jade:
            for _ in range(2):
                chip(cv, sx + rng.randint(4, pw - 16), py0 + rng.randint(2, 12), rng.randint(6, 12),
                     rng.randint(6, 12), rng, under='wood2', under_dark='wood1', n=3, elong=1.2)
        # kick marks at the bottom
        for _ in range(3):
            kx = rng.randint(sx + 4, sx + pw - 8)
            cv.hline(kx, kx + rng.randint(2, 5), H - 8 + rng.randint(0, 2), 'wood3')
    # drawers (room 3) - the journal lives in the left one
    for (dx, dy, dw, dh) in DRAWERS:
        cv.rect(dx - 3, dy - 3, dw + 6, dh + 6, 'wood0')
        cv.rect(dx, dy, dw, dh, 'wood3')
        wood_grain_h(cv, dx + 1, dy + 1, dw - 2, dh - 2, 'wood3', rng, dark='wood2', light='wood4')
        cv.hline(dx, dx + dw - 1, dy, 'wood4')
        cv.vline(dx, dy, dy + dh - 1, 'wood4')
        cv.hline(dx, dx + dw - 1, dy + dh - 1, 'wood1')
        cv.vline(dx + dw - 1, dy, dy + dh - 1, 'wood1')
        # brass pull
        px_, py_ = dx + dw // 2 - 5, dy + dh // 2 - 1
        cv.rect(px_, py_, 10, 3, 'gold1')
        cv.hline(px_, px_ + 9, py_, 'gold3')
        cv.px(px_ + 1, py_ + 1, 'gold2')
        cv.px(px_ + 8, py_ + 1, 'teal2')
        cv.hline(px_ + 1, px_ + 8, py_ + 3, 'wood1')
        # tiny paper label slot
        cv.rect(dx + 4, dy + 3, 8, 5, 'paper2')
        cv.hline(dx + 5, dx + 10, dy + 5, 'wood2')
    cv.rect(DRAWERS[0][0] - 3, DRAWERS[0][1] + DRAWERS[0][3] + 4, 150, H - DRAWERS[0][1] - DRAWERS[0][3] - 4, 'wood1')
    # cupboard below the drawers, door hanging off one hinge
    ddx, ddy = DRAWERS[0][0], DRAWERS[0][1] + DRAWERS[0][3] + 6
    cv.rect(ddx, ddy, 142, H - ddy - 1, 'wood0')
    for k in range(0, 66):
        sag = k // 22
        cv.vline(ddx + k, ddy + sag, H - 2, 'wood2' if k > 1 else 'wood3')
    cv.hline(ddx, ddx + 65, ddy, 'wood3')
    cv.px(ddx + 60, ddy + 6, 'gold2')
    # right end side face
    cv.rect(x1 - 4, top, 4, H - top, 'wood1')
    cv.vline(x1 - 4, top, H, 'wood2')


def build_counter(seed=17):
    rng = random.Random(seed)
    cv = Canvas(W, H)
    _prep_table(cv, rng)
    _counter(cv, rng)
    return cv


def floor_shadows(shell):
    """Darken the floor under the prep table (palette steps, not alpha)."""
    x0, x1 = TABLE['x0'], TABLE['x1']
    for yy in range(FLOOR, H):
        for xx in range(x0, x1):
            shell.shift(xx, yy, -1)
            if yy < FLOOR + 30 or (xx + yy) % 2 == 0 and yy < FLOOR + 44:
                shell.shift(xx, yy, -1)
