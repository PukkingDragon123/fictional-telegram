"""The teahouse seen from the meadow, for the main menu (menu_layout.py).

The same old teahouse as the four rooms, now from outside: faded vermilion
lacquered plank walls with the jade rail and the wooden wainscot, the big
lattice window glowing with the seating room's lanterns, room 4's moon window
on the side, an indigo noren with a white mon over the door, a gilt rune
signboard, two red paper lanterns and a glass wind chime under the eaves, an
irimoya (hipped-and-gabled) roof of weathered dark tiles with copper ridge
caps, onigawara and upturned corners, a plastered gable, a grey engawa on
stone footings, the furnace's stone chimney, a stone lantern, stepping
stones to the meadow path, ferns, grass and moss.

The view is oblique 3/4 from the front left: the front is flat to the
screen and depth runs up and to the left at 2:1, so receding edges are clean
2-pixel stairs. The walls, veranda and posts are flat textures painted in
their own coordinates with the pack's recipes (room.py's plank wall, its
ageing, rail and wainscot, beams and posts; woodgrain.grain_pass; shapes.chip;
counter._rock; moss.clump) and laid on with an exact affine map. The roof is
a small ray-marched heightfield with the concave Japanese profile and swept
corners, so its tile courses, moss and fascia follow the curve. The eaves'
shade on the walls is found by tracing toward the sun. Only the pack's
palette ramps are used.

Animated over menu_layout.N frames, looping exactly, with the scene's wind
(menu_layout.wind / sway, read round the loop): the noren lifts, billows and
its panels swing apart, the lanterns swing behind the gust and warm the wall,
the chime's strip flutters, a thin curl of smoke leans off the chimney, roof
grass nods and the window light breathes. The grass at the footings is the
meadow's own tufts (meadow.tuft, in step with the scene's meadow).

teahouse_frames() returns the frames; run as a script to write
main_menu/layers/teahouse/."""
import math
import os
import json
import random
import numpy as np
from PIL import Image
from numba import njit
from scipy import ndimage
from pixel import Canvas, PAL, step, text, blob_mask
import woodgrain as WG
import moss as MOSS
from shapes import chip
import room as ROOM
import counter as CT
import objects as OBJ
import meadow as MD
import menu_layout as L
from menu_layout import N, FPS, W, H
from menu_layout import wind as _wind_raw


def wind(x, f):
    """menu_layout.wind with the frame taken round the loop, so lags and the smoke's
    drift history that reach back past frame 0 read the end of the loop."""
    return _wind_raw(x, f % N)


def sway(x, f, amp=1.0, lag=0.0):
    """menu_layout.sway (same formula), on the looped wind."""
    w0 = wind(x, f - lag)
    w1 = wind(x, f - lag - 3)
    return amp * (w0 * 1.6 + (w0 - w1) * 2.2 - 0.3)

BAYER4 = ROOM.BAYER4

# ---------------------------------------------------------------- scale
# The whole building can be drawn bigger at the same pixel density: every geometric
# measure and position is multiplied by S, while texture detail (plank widths, tile
# courses, grain, moss, dither) stays in pixels, so a bigger wall gets more planks and
# tiles - a real redraw, never an upscale. S = 1 is the original, pixel for pixel.
S = float(os.environ.get('TEAHOUSE_SCALE', '1'))
_JIT = dict(cache=(S == 1.0))      # numba freezes module globals: only cache the default build


def si(v):
    """An integer world measure, scaled."""
    return int(round(v * S))


def sf(v):
    """A float world measure, scaled."""
    return v * S


# ---------------------------------------------------------------- projection
A, B = 0.5, 0.25          # one unit of depth (z, away from you) = half a pixel left, a quarter up
SX00, SY00 = 194, 242     # the original (S = 1) screen position of the world origin
# the screen position of the world origin (front-left corner of the floor plan): scaled about the
# ground centre, and moved down a little when bigger so the chimney's smoke stays on the canvas
SX0 = SX00 if S == 1.0 else int(round(L.TEAHOUSE[0] + S * (SX00 - L.TEAHOUSE[0])))
SY0 = SY00 if S == 1.0 else int(round(L.TEAHOUSE[1] + S * (SY00 - L.TEAHOUSE[1]) + 46 * (S - 1)))


def T(x, y):
    """A screen point placed for the original (S = 1) teahouse -> where it goes on the scaled one."""
    if S == 1.0:
        return x, y
    return int(round(SX0 + (x - SX00) * S)), int(round(SY0 + (y - SY00) * S))


def P(x, y, z):
    """World (x right along the front, y up, z back) -> screen (float)."""
    return SX0 + x - A * z, SY0 - y - B * z


# ---------------------------------------------------------------- the building's measures (world units ~ px)
BX0, BX1 = 0, si(112)      # body, along the front
BZ0, BZ1 = 0, 4 * si(11)   # body, front to back (a multiple of 4: the side wall's texels are 2 deep)
FLOOR = si(10)             # floor / veranda height
WALL_TOP = si(66)
EAVE = si(70)              # roof surface height at the eave edge (before the corners sweep up)
EAVE_T = si(6)             # eave thickness: tile ends, fascia board, rafter ends
EZ0, EZ1 = si(-20), si(60)  # eaves, front and back
EX0, EX1 = si(-16), si(128)  # eaves, left and right
RIDGE_Z = (EZ0 + EZ1) / 2  # 20
GX0, GX1 = si(2), si(110)  # the two gables (irimoya): hips below them, gables above
BARGE = si(3)              # the upper roof overhangs each gable by this much
BARGE_T = si(3)            # thickness of the barge board
KICK, KICK_R = sf(6.0), sf(26.0)   # how far the eave corners sweep up, and over what reach
RIDGE_W, RIDGE_H = sf(2.0), sf(4.0)
CHIM = (si(20), si(32), si(24), si(32), si(130))   # chimney x0, x1, z0, z1, top


def prof(d):
    """Height of the roof above its eave at plan distance d in from the eave edge: a
    concave Japanese curve, shallow (0.5) at the eave and steep (1.6) at the ridge
    (scaled with the building: S * prof1(d / S))."""
    d = max(0.0, d)
    return 0.5 * d + 0.01375 * d * d / S


RIDGE_Y = EAVE + prof(RIDGE_Z - EZ0)          # 112
HG = prof(GX0 - EX0)                          # gable base, above the eave
GABLE_Y = EAVE + HG
VZ0 = -4 * si(4)           # veranda front edge (a multiple of 4: its boards are one screen row per 4 deep)
VX0, VX1 = si(-4), BX1 + si(4)   # veranda, left and right
VT = si(3)                 # thickness of the veranda boards
DOOR = (si(23), si(43))    # door opening (x), up to y = DOOR_TOP
DOOR_TOP = si(52)
WIN = (si(54), si(102), si(27), si(52))    # big lattice window x0, x1, y0 (sill), y1 (head)
POSTS_FRONT = [(0, si(3)), (DOOR[0] - si(3), DOOR[0]), (DOOR[1], DOOR[1] + si(3)), (BX1 - si(3), BX1)]


# ---------------------------------------------------------------- warping a flat face onto the building
def warp(dst, tex, O, U, V):
    """Lay canvas `tex` onto the plane through O spanned by U (one texel across)
    and V (one texel down): texel (i, j) covers O + [i, i+1) U + [j, j+1) V.
    Every screen pixel takes the texel under its centre (exact, so straight
    texture lines come out as clean stairs)."""
    s0 = np.array(P(*O))
    pu = np.array([U[0] - A * U[2], -U[1] - B * U[2]])
    pv = np.array([V[0] - A * V[2], -V[1] - B * V[2]])
    M = np.array([[pu[0], pv[0]], [pu[1], pv[1]]])
    Mi = np.linalg.inv(M)
    tw, th = tex.w, tex.h
    cs = [s0, s0 + pu * tw, s0 + pv * th, s0 + pu * tw + pv * th]
    x0 = int(math.floor(min(c[0] for c in cs))) - 1
    x1 = int(math.ceil(max(c[0] for c in cs))) + 1
    y0 = int(math.floor(min(c[1] for c in cs))) - 1
    y1 = int(math.ceil(max(c[1] for c in cs))) + 1
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(dst.w, x1), min(dst.h, y1)
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1]
    dx = xx + 0.5 - s0[0]
    dy = yy + 0.5 - s0[1]
    u = Mi[0, 0] * dx + Mi[0, 1] * dy
    v = Mi[1, 0] * dx + Mi[1, 1] * dy
    i = np.floor(u + 1e-7).astype(int)
    j = np.floor(v + 1e-7).astype(int)
    ok = (i >= 0) & (i < tw) & (j >= 0) & (j < th)
    ii, jj = np.where(ok, i, 0), np.where(ok, j, 0)
    ok &= tex.a[jj, ii, 3] > 0
    dst.a[yy[ok], xx[ok]] = tex.a[jj[ok], ii[ok]]


# ---------------------------------------------------------------- wall recipes (the rooms', at outdoor scale)
def planks(cv, rng, x0, x1, y0, y1, base=('red2', 'red1'), widths=(4, 5, 5, 6), seam='red0', lit_edge=True,
           fade=0.3, seed=0.0):
    """room._plank_wall at a quarter of the size: lacquered vertical boards, some
    sun-faded from the top (Bayer hand-off), the pack's grain pass, a dark seam
    and a lit edge, nail heads top and bottom."""
    x = x0
    while x < x1:
        pw = min(rng.choice(widths), x1 - x)
        b = base[0] if rng.random() < 0.78 else base[1]
        cv.rect(x, y0, pw, y1 - y0, b)
        if rng.random() < fade:
            f_y = rng.randint(y0 + (y1 - y0) // 4, y0 + (y1 - y0) * 3 // 4)
            lite = step(PAL[b], 1)
            cv.rect(x, y0, pw, f_y - y0 - 2, lite)
            for yy in range(f_y - 2, f_y + 2):
                for xx in range(x, x + pw):
                    if BAYER4[yy % 4][xx % 4] / 16 > (yy - f_y + 2) / 4:
                        cv.px(xx, yy, lite)
        WG.grain_pass(cv, x + 1, y0, x + pw, y1, 'v', seed=seed + x * 0.37, board=pw, contrast=0.55, ramps=('red',))
        cv.vline(x, y0, y1 - 1, seam)
        if lit_edge and pw > 3:
            cv.vline(x + 1, y0, y1 - 1, step(PAL[b], 1))
        x += pw


def age_planks(cv, rng, x0, x1, y0, y1, n_peel=3, keep=None):
    """room._age_planks at outdoor scale: lacquer peeled back to grey bare wood
    with a curled lip, rain run-off from the eaves, grime at top and bottom."""
    for _ in range(n_peel):
        pw, ph = rng.randint(3, 7), rng.randint(4, 10)
        px_, py_ = rng.randint(x0, x1 - pw), rng.randint(y0 + 2, y1 - ph - 1)
        m = blob_mask(rng, pw, ph, n=rng.randint(3, 5), rmin=1.0, rmax=min(pw, ph) * 0.45)
        for yy in range(ph):
            for xx in range(pw):
                X, Y = px_ + xx, py_ + yy
                if not (x0 <= X < x1) or (keep is not None and not keep(X, Y)):
                    continue
                if m[yy, xx]:
                    old = cv.get(X, Y)[:3]
                    cv.px(X, Y, 'wood0' if old == PAL['red0'] else ('wood3' if (xx + yy) % 5 else 'wood2'))
                else:
                    up = yy + 1 < ph and m[yy + 1, xx]
                    lf = xx + 1 < pw and m[yy, xx + 1]
                    dn = yy > 0 and m[yy - 1, xx]
                    if up or lf:
                        cv.px(X, Y, 'red3')
                    elif dn:
                        cv.px(X, Y, 'red0')
    for _ in range(max(1, (x1 - x0) // 22)):          # rain run-off from the roof
        sx = rng.randint(x0 + 1, x1 - 3)
        ln = rng.randint(6, max(7, (y1 - y0) * 2 // 3))
        w = rng.randint(1, 2)
        for k in range(ln):
            for d in range(w):
                if (keep is None or keep(sx + d, y0 + k)) and (k < ln * 0.6 or (d + k) % 2 == 0):
                    cv.shift(sx + d, y0 + k, -1)
    for yy in list(range(y1 - 4, y1)):                 # grime above the rail
        t = (y1 - yy) / 4
        for xx in range(x0, x1):
            if BAYER4[yy % 4][xx % 4] / 16 > t and (keep is None or keep(xx, yy)):
                cv.shift(xx, yy, -1)


def rail_and_wainscot(cv, rng, x0, x1, rail_y, wains_y1, base_y1, seed=0.0):
    """room._rail_wains_base at outdoor scale: the jade rail, three courses of
    wainscot boards with the grain pass, and the sill beam."""
    cv.rect(x0, rail_y, x1 - x0, 3, 'jade2')
    cv.hline(x0, x1 - 1, rail_y, 'jade4')
    cv.hline(x0, x1 - 1, rail_y + 2, 'jade0')
    for _ in range(max(1, (x1 - x0) // 40)):
        cx = rng.randint(x0, max(x0, x1 - 6))
        for k in range(rng.randint(2, 4)):
            cv.px(cx + k, rail_y + 1, 'wood2')
        cv.px(cx, rail_y, 'jade0')
    y0 = rail_y + 3
    hh = max(2, (wains_y1 - y0) // 3)
    yy = y0
    k = 0
    while yy < wains_y1:
        h_ = min(hh, wains_y1 - yy) if k < 2 else wains_y1 - yy
        cv.rect(x0, yy, x1 - x0, h_, 'wood2')
        cv.hline(x0, x1 - 1, yy, 'wood3')
        cv.hline(x0, x1 - 1, yy + h_ - 1, 'wood0')
        x = x0 - rng.randint(0, 20)
        while x < x1:
            if x > x0:
                cv.vline(x, yy, yy + h_ - 1, 'wood0')
            x += rng.randint(26, 48)
        yy += h_
        k += 1
    WG.grain_pass(cv, x0, y0 + 1, x1, wains_y1 - 1, 'h', seed=seed + 1, board=hh, contrast=1.0)
    cv.rect(x0, wains_y1, x1 - x0, base_y1 - wains_y1, 'wood1')
    cv.hline(x0, x1 - 1, wains_y1, 'wood3')
    cv.hline(x0, x1 - 1, base_y1 - 1, 'wood0')
    for xx in range(x0, x1):                           # rot creeping up from the footings
        h = int(1 + 2 * abs(math.sin(xx * 0.13)) + 1.5 * abs(math.sin(xx * 0.41)))
        for yy in range(wains_y1 - h, wains_y1):
            if (xx + yy) % 2 == 0 or yy > wains_y1 - 2:
                cv.shift(xx, yy, -1)


def post(cv, x0, x1, y0, y1, seed=0.0):
    """A square timber post like room._corner_post: lit left face, dark right edge."""
    w = x1 - x0
    for k in range(w):
        c = 'wood3' if k == 0 else ('wood1' if k == w - 1 else 'wood2')
        cv.vline(x0 + k, y0, y1 - 1, c)
    WG.grain_pass(cv, x0 + 1, y0, x1 - 1, y1, 'v', seed=seed, board=max(1, w - 2), contrast=0.8)


def beam(cv, x0, x1, y0, y1, seed=0.0):
    """room._girder: a beam with a lit top, dark under-edge and a shade below."""
    cv.rect(x0, y0, x1 - x0, y1 - y0, 'wood2')
    cv.hline(x0, x1 - 1, y0, 'wood3')
    cv.hline(x0, x1 - 1, y1 - 1, 'wood0')
    WG.grain_pass(cv, x0, y0 + 1, x1, y1 - 1, 'h', seed=seed, board=max(1, y1 - y0 - 2), contrast=1.0)


# ---------------------------------------------------------------- the front wall
def front_wall(rng):
    """Texture of the front wall: x = world x (0..112), row = WALL_TOP - y."""
    w, h = BX1 - BX0, WALL_TOP - FLOOR
    cv = Canvas(w, h)
    r = lambda y: WALL_TOP - y                       # world height -> texture row
    rail = r(si(25))
    planks(cv, rng, 0, w, 0, rail, seed=1.0)
    age_planks(cv, rng, 0, w, r(si(58)), rail, n_peel=si(6 * S))
    beam(cv, 0, w, r(si(62)), r(si(57)), seed=3.0)          # the head beam under the eaves
    rail_and_wainscot(cv, rng, 0, w, rail, r(si(13)), r(FLOOR), seed=2.0)
    # door: a dark warm room behind the noren, the floor boards catching lantern light
    x0, x1 = DOOR
    cv.rect(x0, r(DOOR_TOP), x1 - x0, r(FLOOR) - r(DOOR_TOP), 'wood0')
    for yy in range(r(si(22)), r(FLOOR)):
        t = (yy - r(si(22))) / (r(FLOOR) - r(si(22)))
        for xx in range(x0, x1):
            c = 'wood1' if t < 0.45 else ('wood2' if t < 0.8 else 'wood3')
            if BAYER4[yy % 4][xx % 4] / 16 < t * 1.4:
                cv.px(xx, yy, c)
    i3 = si(3)
    cv.rect(x0 + i3, r(si(34)), x1 - x0 - 2 * i3, 2, 'hinoki2')           # the counter's edge inside
    cv.hline(x0 + i3, x1 - i3 - 1, r(si(34)), 'hinoki4')
    cv.rect(x0 + i3, r(si(32)), x1 - x0 - 2 * i3, r(FLOOR) - r(si(32)) - si(4), 'wood0')
    lt = si(2)                                                            # lintel
    cv.rect(x0 - 1, r(DOOR_TOP + lt), x1 - x0 + 2, lt, 'wood2')
    cv.hline(x0 - 1, x1, r(DOOR_TOP + lt), 'wood3')
    cv.hline(x0 - 1, x1, r(DOOR_TOP + 1), 'wood0')
    cv.rect(x0 - 1, r(FLOOR + 1), x1 - x0 + 2, 1, 'wood3')               # threshold, worn pale
    cv.hline(x0 + si(4), x1 - si(5), r(FLOOR + 1), 'wood4')
    # the big lattice window
    window(cv, rng, *WIN, r)
    # posts
    for (a, b) in POSTS_FRONT:
        post(cv, a, b, r(WALL_TOP), r(FLOOR), seed=a * 0.3)
    return cv


def window(cv, rng, x0, x1, y0, y1, r):
    """room._main_window at outdoor scale: lacquer frame ring, deep sill, four
    sashes with a small-pane transom, and the warm room behind the glass."""
    ty0, ty1 = r(y1), r(y0)
    ring = ['wood0', 'red1', 'red3', 'wood0']
    for i, c in enumerate(ring):
        cv.frame(x0 - 2 + i, ty0 - 2 + i, x1 - x0 + 4 - 2 * i, ty1 - ty0 + 4 - 2 * i, c)
    gx0, gy0, gx1, gy1 = x0 + 2, ty0 + 2, x1 - 2, ty1 - 2         # glass
    inside(cv, gx0, gy0, gx1, gy1)
    fw = gx1 - gx0
    cols = [gx0 + fw * k // 4 for k in range(1, 4)]
    tr = gy0 + si(6)
    for cx in cols:
        cv.vline(cx, gy0, gy1 - 1, 'wood2')
        cv.vline(cx - 1, gy0, gy1 - 1, 'wood3')
        cv.vline(cx + 1, gy0, gy1 - 1, 'wood0')
    cv.hline(gx0, gx1 - 1, tr, 'wood3')
    cv.hline(gx0, gx1 - 1, tr + 1, 'wood0')
    npane = si(12)
    for k in range(1, npane):
        mx = gx0 + fw * k // npane
        if any(abs(mx - c) < 2 for c in cols):
            continue
        cv.vline(mx, gy0, tr - 1, 'wood1')
    # deep sill, its top showing
    sy = ty1 + 2
    so = si(4)
    cv.rect(x0 - so, sy, x1 - x0 + 2 * so, 3, 'wood3')
    cv.hline(x0 - so, x1 + so - 1, sy, 'wood4')
    cv.hline(x0 - so, x1 + so - 1, sy + 2, 'wood0')
    for bx in (x0 + si(4), x1 - si(6)):
        cv.px(bx, sy + 3, 'wood2'); cv.px(bx + 1, sy + 3, 'wood1')
        cv.px(bx, sy + 4, 'wood1')
    for _ in range(si(3)):
        chip(cv, rng.randint(x0, x1 - 6), ty0 - 2, rng.randint(3, 5), 2, rng, under='wood2', under_dark='wood0',
             n=2, rmin=0.8, rmax=1.4, elong=0.6)


def inside(cv, x0, y0, x1, y1):
    """What you see through the window: the seating room, lantern-lit. Dark
    beams overhead, the warm glow of the two red lanterns, the jade drapes at the
    sides, the hinoki counter catching the light, and the sky glinting on the glass."""
    w, h = x1 - x0, y1 - y0
    lamps = [(x0 + int(w * 0.3), y0 + si(4)), (x0 + int(w * 0.7), y0 + si(4))]
    for yy in range(y0, y1):
        for xx in range(x0, x1):
            g = 0.0
            for (lx, ly) in lamps:
                d = math.hypot((xx - lx) / 1.3, yy - ly - sf(2))
                g = max(g, 1.0 - d / sf(12.0))
            t = (yy - y0) / max(1, h - 1)
            v = 0.3 + 0.75 * g + 0.15 * t + (BAYER4[yy % 4][xx % 4] / 16 - 0.5) * 0.16
            c = ('wood0' if v < 0.36 else 'red0' if v < 0.48 else 'red1' if v < 0.6 else 'copper2' if v < 0.74
                 else 'copper3' if v < 0.88 else 'gold3')
            if yy == y0:
                c = 'wood0'
            cv.px(xx, yy, c)
    dw = si(4)
    for xx in list(range(x0, x0 + dw)) + list(range(x1 - dw, x1)):        # jade drapes
        k = (xx - x0) if xx < x0 + dw else (x1 - 1 - xx)
        for yy in range(y0 + 1, y1):
            cv.px(xx, yy, ['jade1', 'jade3', 'jade2', 'jade1'][k * 4 // dw])
    cy = y0 + h - si(5)                                                     # the counter
    cv.hline(x0 + dw, x1 - dw - 1, cy, 'hinoki4')
    cv.hline(x0 + dw, x1 - dw - 1, cy + 1, 'hinoki2')
    cv.rect(x0 + dw, cy + 2, w - 2 * dw, h - (cy + 2 - y0), 'wood1')
    for (lx, ly) in lamps:                                                  # the lanterns inside
        cv.vline(lx, y0, ly - 1, 'wood0')
        for (dx, dy, c) in ((-1, 0, 'red3'), (0, 0, 'fire4'), (1, 0, 'red3'), (-1, 1, 'fire3'), (0, 1, 'fire5'),
                            (1, 1, 'fire3'), (-1, 2, 'red3'), (0, 2, 'fire4'), (1, 2, 'red2'), (0, 3, 'wood0')):
            cv.px(lx + dx, ly + dy, c)
    for k in range(si(4)):                                                  # sky on the glass
        cv.px(x0 + si(6) + k, y0 + si(9) - k, 'paper3')
        cv.px(x0 + si(8) + k, y0 + si(9) - k, 'paper2')


# ---------------------------------------------------------------- the side wall (x = 0, seen at 2:1)
def side_wall(rng):
    """Texture of the left (gable-end) wall, lit by the sun. Columns are half
    units of depth from the back (z = 44) to the front corner (z = 0)."""
    w, h = (BZ1 - BZ0) // 2, WALL_TOP - FLOOR
    cv = Canvas(w, h)
    r = lambda y: WALL_TOP - y
    rail = r(si(25))
    planks(cv, rng, 0, w, 0, rail, base=('red3', 'red2'), widths=(3, 3, 2), seam='red1', lit_edge=False, fade=0.4,
           seed=5.0)
    age_planks(cv, rng, 0, w, r(si(60)), rail, n_peel=si(2 * S))
    beam(cv, 0, w, r(si(62)), r(si(57)), seed=7.0)
    rail_and_wainscot(cv, rng, 0, w, rail, r(si(13)), r(FLOOR), seed=6.0)
    for yy in range(r(si(25)), r(FLOOR)):             # the lit side: lift the wood one step
        for xx in range(w):
            cv.shift(xx, yy, 1, only=('wood', 'jade'))
    post(cv, 0, si(2), r(WALL_TOP), r(FLOOR), seed=8.0)   # back corner post
    return cv


def moon_window(cv):
    """Room 4's moon window on the side wall, drawn the way you would by hand:
    an upright ellipse (the circle seen at an angle), a lacquered ring lit on its
    upper left, a gilt bead, warm lamplight behind a cross of bamboo bars."""
    cx, cy = P(0, sf(41), sf(21))
    rx, ry = sf(5.0), sf(9.5)
    for yy in range(int(cy - ry) - 3, int(cy + ry) + 4):
        for xx in range(int(cx - rx) - 3, int(cx + rx) + 4):
            u, v = (xx + 0.5 - cx) / rx, (yy + 0.5 - cy) / ry
            d = math.hypot(u, v)
            lit = -0.6 * u - 0.8 * v
            if d < 0.72:
                c = 'red0' if v < -0.35 else ('red1' if v < 0.15 else 'copper2')
                if abs(xx + 0.5 - cx) < 0.6 or abs(yy - int(cy) + 1) < 0.6:
                    c = 'hinoki2' if v < 0 else 'hinoki1'
                cv.px(xx, yy, c)
            elif d < 0.86:
                cv.px(xx, yy, 'gold2' if lit > 0.2 else 'gold1')
            elif d < 1.08:
                cv.px(xx, yy, 'wood4' if lit > 0.35 else ('wood3' if lit > -0.3 else 'wood2'))
            elif d < 1.22:
                cv.px(xx, yy, 'wood0')


# ---------------------------------------------------------------- the roof: a ray-marched heightfield
# Faces the march can report (what the eye ray hits first)
F_FRONT, F_HIP, F_BACK, F_RHIP = 1, 2, 3, 4
F_FASCIA, F_SFASCIA, F_RFASCIA = 10, 11, 12
F_BARGE, F_BARGE_U, F_GABLE = 20, 21, 25
F_RIDGE, F_RIDGE_TOP, F_RIDGE_END = 30, 31, 32
F_CHIM, F_CHIM_L, F_CHIM_TOP = 40, 41, 42
F_HIPR = 50


@njit(**_JIT)
def _prof(d):
    if d < 0.0:
        d = 0.0
    return 0.5 * d + 0.01375 * d * d / S


@njit(**_JIT)
def _kick(x, z):
    k = 0.0
    for cx, cz in ((EX0, EZ0), (EX1, EZ0), (EX0, EZ1), (EX1, EZ1)):
        r = math.sqrt((x - cx) ** 2 + (z - cz) ** 2)
        if r < KICK_R:
            t = 1.0 - r / KICK_R
            v = KICK * t * t * t
            if v > k:
                k = v
    return k


@njit(**_JIT)
def _roof(x, z):
    """(top height, thickness, part) of the roof shell over plan point (x, z).
    part: 0 the long slopes (front / back), 1 the hips (left / right), 2 the upper roof
    over a gable's overhang."""
    dF, dB, dL, dR = z - EZ0, EZ1 - z, x - EX0, EX1 - x
    df = min(dF, dB)
    ds = min(dL, dR)
    hf = _prof(df)
    hs = _prof(ds)
    k = _kick(x, z)
    if GX0 - BARGE <= x <= GX1 + BARGE and hf >= HG:
        t = EAVE_T
        if x < GX0 or x > GX1:
            t = BARGE_T
        return EAVE + hf + k, t, 2 if (x < GX0 or x > GX1) else 0
    if hf <= hs:
        return EAVE + hf + k, EAVE_T, 0
    return EAVE + hs + k, EAVE_T, 1


ONI_E, ONI_H, ONI_H1 = sf(5.0), sf(4.0), sf(1.0)   # the onigawara: reach along the ridge, rise, step


@njit(**_JIT)
def _ridge_top(x):
    """Ridge height along x; the ends rise into onigawara."""
    x0, x1 = GX0 - BARGE - 1.0, GX1 + BARGE + 1.0
    top = EAVE + _prof(RIDGE_Z - EZ0) + RIDGE_H
    e = min(x - x0, x1 - x)
    if e < ONI_E:
        top += ONI_H * (1.0 - e / ONI_E) ** 1.5 + ONI_H1
    return top


RIDGE_D = sf(3.0)                      # how far the ridge's noshi stack sinks into the slopes
HIPR_W, HIPR_H = sf(1.6), sf(2.2)      # hip ridges: half width, height
GABLE_D, GABLE_E = sf(2.0), sf(0.5)    # the attic behind the gables: how far below the gable base, and slack


@njit(**_JIT)
def _inside(x, y, z):
    """Which solid (x, y, z) is in: 0 none, 1 roof shell, 2 attic behind the gables,
    3 ridge, 4 chimney, 5 hip ridge."""
    cx0, cx1, cz0, cz1, ctop = CHIM
    if cx0 <= x <= cx1 and cz0 <= z <= cz1 and y <= ctop and y >= EAVE:
        return 4
    if cx0 - 1 <= x <= cx1 + 1 and cz0 - 1 <= z <= cz1 + 1 and ctop <= y <= ctop + 2:
        return 4
    if GX0 - BARGE - 1.0 <= x <= GX1 + BARGE + 1.0 and abs(z - RIDGE_Z) <= RIDGE_W:
        if EAVE + _prof(RIDGE_Z - EZ0) - RIDGE_D <= y <= _ridge_top(x):
            return 3
    if not (EX0 <= x <= EX1 and EZ0 <= z <= EZ1):
        return 0
    top, t, part = _roof(x, z)
    if part == 1 or (part == 0 and _prof(min(z - EZ0, EZ1 - z)) < HG):
        # hip ridges: where the long slope meets a hip, below the gables
        dF, dB, dL, dR = z - EZ0, EZ1 - z, x - EX0, EX1 - x
        g = min(abs(min(dF, dB) - min(dL, dR)), 9.0)
        if g < HIPR_W and min(min(dF, dB), min(dL, dR)) < GX0 - EX0:
            bump = HIPR_H * (1.0 - (g / HIPR_W) ** 2)
            if top - t <= y <= top + bump:
                return 5
    if top - t <= y <= top:
        return 1
    if GX0 <= x <= GX1 and y <= top and y >= EAVE + HG - GABLE_D:
        if _prof(min(z - EZ0, EZ1 - z)) >= HG - GABLE_E:
            return 2
    return 0


MARCH_PAD = sf(4.0)


@njit(**_JIT)
def _march(sx0, sy0, w, h, dz):
    """For every screen pixel in the box, march the eye ray front to back and
    report what it hits: solid, face and the world point."""
    out_s = np.zeros((h, w), np.int32)
    out_f = np.zeros((h, w), np.int32)
    out_p = np.zeros((h, w, 3))
    nz = int((EZ1 - EZ0 + MARCH_PAD * 2.0) / dz)
    for j in range(h):
        for i in range(w):
            X0 = sx0 + i + 0.5 - SX0
            Y0 = SY0 - (sy0 + j + 0.5)
            px, py, pz = 0.0, 0.0, 0.0
            for k in range(nz):
                z = EZ0 - MARCH_PAD + k * dz
                x = X0 + A * z
                y = Y0 - B * z
                s = _inside(x, y, z)
                if s != 0:
                    f = 0
                    if s == 4:
                        cx0, cx1, cz0, cz1, ctop = CHIM
                        if py > ctop - 0.05 or y > ctop:
                            f = F_CHIM_TOP
                        elif px < cx0 - 0.0 and pz >= cz0 - 1:
                            f = F_CHIM_L
                        else:
                            f = F_CHIM
                    elif s == 3:
                        if py > _ridge_top(px):
                            f = F_RIDGE_TOP
                        elif px < GX0 - BARGE - 1.0:
                            f = F_RIDGE_END
                        else:
                            f = F_RIDGE
                    elif s == 5:
                        f = F_HIPR
                    elif s == 2:
                        f = F_GABLE if x < GX1 else F_RHIP
                    else:
                        top, t, part = _roof(x, z)
                        ptop, pt, ppart = _roof(px, pz) if k > 0 else (top, t, part)
                        above = k > 0 and EX0 <= px <= EX1 and EZ0 <= pz <= EZ1 and py > ptop and ppart == part
                        if part == 2 and abs(x - (GX0 - BARGE)) < 0.35 and y < top - 0.35:
                            f = F_BARGE
                        elif part == 2 and y < top - BARGE_T + 0.4:
                            f = F_BARGE_U
                        elif above or y > top - 0.35:
                            if part == 1:
                                f = F_HIP if x < (EX0 + EX1) / 2 else F_RHIP
                            else:
                                f = F_FRONT if z < RIDGE_Z else F_BACK
                        elif pz < EZ0:
                            f = F_FASCIA
                        elif px < EX0:
                            f = F_SFASCIA
                        elif part == 2:
                            f = F_BARGE
                        elif abs(x - GX0) < 0.35 and _prof(min(z - EZ0, EZ1 - z)) >= HG:
                            f = F_GABLE
                        elif abs(x - GX1) < 0.35:
                            f = F_RHIP
                        else:
                            f = F_RFASCIA
                    out_s[j, i] = s
                    out_f[j, i] = f
                    out_p[j, i, 0] = x
                    out_p[j, i, 1] = y
                    out_p[j, i, 2] = z
                    break
                px, py, pz = x, y, z
    return out_s, out_f, out_p


def march(box=None, dz=0.05):
    box = MARCH_BOX if box is None else box
    x0, y0, x1, y1 = box
    return _march(float(x0), float(y0), x1 - x0, y1 - y0, dz)

# ---------------------------------------------------------------- shading the roof
TILE = ['fgrey0', 'fgrey1', 'fgrey2', 'fgrey3', 'fgrey4']
CH = 5.0                   # tile channel spacing on the long slopes (px)
CHZ = 8.0                  # ... on the hips (z units: 4 px along a course)
COURSE = 6.0               # rows per course
VPROF = np.vectorize(prof)


def _hash2(a, b, salt=0):
    h = (np.asarray(a, np.int64) * 73856093) ^ (np.asarray(b, np.int64) * 19349663) ^ (salt * 83492791)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0xffff) / 65535.0


def _tile_idx(k, r, lift):
    """Tone index of a hongawara pixel: k = place across the channel (0..4: the
    round tile's lit flank, crown and shaded flank, the dark gap, the pan), r =
    row in the course (0 the lit tile ends .. COURSE-1 the shadow under the ends
    of the course above)."""
    body = np.array([2, 2, 1, 0, 1])
    ends = np.array([3, 3, 2, 0, 1])
    under = np.array([1, 1, 0, 0, 0])
    t = np.where(r == 0, ends[k], np.where(r == int(COURSE) - 1, under[k], body[k]))
    return t + lift


def _weather(idx, ci, qi, k, salt):
    """Old roof: rain streaks darken a channel down a few courses, the odd tile
    sits darker or was replaced with a paler one."""
    h = _hash2(ci, qi, salt)
    idx = np.where((h < 0.025) & (k < 3), idx - 1, idx)
    idx = np.where((h > 0.985) & (k < 3), idx + 1, idx)
    streak = _hash2(ci, 7, salt + 1)
    start = (_hash2(ci, 8, salt + 3) * 7).astype(int)
    run = (_hash2(ci, 9, salt + 2) * 3).astype(int) + 2
    idx = np.where((streak < 0.22) & (qi >= start) & (qi < start + run) & (k >= 1), idx - 1, idx)
    return idx


def _moss_on(names, m, U, V, d, k, r, salt, blobs=()):
    """Moss grown into the tiles where the damp sits: a ragged band along the
    lowest courses and a few cushions further up. Its ragged edge creeps along
    the pans first; each cushion is shaded like moss.clump's (lit upper-left rim,
    bumpy body, dark lower-right rim)."""
    n = WG.noise2(U / 6.0, V / 4.0, 3.0 + salt) * 0.7 + WG.noise2(U / 2.5, V / 2.0, 9.0 + salt) * 0.3
    dens = n + 0.62 * np.clip(1 - d / 11.0, 0, 1) ** 1.5 - 0.7
    for (bu, bv, ru, rv) in blobs:
        dens = np.maximum(dens, n * 0.6 + 0.62 - np.hypot((U - bu) / ru, (V - bv) / rv) - 0.3)
    hh, ww = m.shape
    def sh(a, dy, dx):
        o = np.zeros_like(a)
        o[max(0, dy):hh + min(0, dy), max(0, dx):ww + min(0, dx)] = a[max(0, -dy):hh - max(0, dy), max(0, -dx):ww - max(0, dx)]
        return o
    pan = (k >= 3) | (r == int(COURSE) - 1)
    grow = m & ((dens > 0.07) | ((dens > 0.0) & pan))
    grow = ndimage.binary_closing(grow, np.ones((2, 3), bool)) & m          # cushions, not threads
    grow &= (sh(grow, 1, 0) | sh(grow, -1, 0)) & (sh(grow, 0, 1) | sh(grow, 0, -1))
    lab, nl = ndimage.label(grow)
    if nl:
        size = ndimage.sum(grow, lab, np.arange(1, nl + 1))
        grow &= np.isin(lab, np.nonzero(size >= 14)[0] + 1)          # no specks
    hsh = _hash2(np.arange(hh)[:, None] * 3 + np.arange(ww)[None, :] * 0, np.arange(ww)[None, :], 17 + salt)
    names[grow] = 'leaf2'
    names[grow & (hsh < 0.16)] = 'leaf3'
    names[grow & (hsh > 0.9)] = 'leaf1'
    lit = grow & ~sh(grow, 1, 1)
    names[lit] = 'leaf3'
    names[lit & ~sh(grow, 1, 0) & (hsh < 0.5)] = 'leaf4'
    dark = grow & ~sh(grow, -1, -1)
    names[dark] = 'leaf1'
    names[grow & ~sh(grow, -1, 0)] = 'leaf0'


# moss cushions on the slopes: (u, v) where they sit (scaled with the roof), (ru, rv) their size (px)
MOSS_FRONT = ((sf(92), sf(-10), 9, 4), (sf(18), sf(-9), 6, 3), (sf(62), sf(0), 5, 2.5))
MOSS_HIP = ((sf(14), sf(-8), 6, 3),)
if S != 1.0:                     # a bigger roof holds a few more
    MOSS_FRONT += ((sf(40), sf(-12), 6, 3), (sf(110), sf(-3), 5, 2.5))
    MOSS_HIP += ((sf(30), sf(-12), 5, 2.5),)


def shade_roof(s, f, p, rng):
    """Turn the march result into pixels (RGBA, the march box's size)."""
    h, w = f.shape
    out = np.zeros((h, w, 4), np.uint8)
    X, Y, Z = p[..., 0], p[..., 1], p[..., 2]
    names = np.full((h, w), '', object)

    def put(m, idx, ramp):
        idx = np.clip(idx, 0, len(ramp) - 1)
        for i, c in enumerate(ramp):
            mm = m & (idx == i)
            names[mm] = c

    # the long front slope
    m = f == F_FRONT
    d = Z - EZ0
    q = VPROF(d) + 0.25 * d
    r = np.floor(np.mod(q, COURSE)).astype(int)
    qi = np.floor(q / COURSE).astype(int)
    ph = np.mod(X - EX0, CH)
    k = np.floor(ph).astype(int).clip(0, 4)
    ci = np.floor((X - EX0) / CH).astype(int)
    idx = _tile_idx(k, r, 0)
    idx = _weather(idx, ci, qi, k, 1)
    near_ridge = (RIDGE_Y - (EAVE + VPROF(d) + 0)) < 4.0
    idx = np.where(near_ridge & (k < 3), idx - 1, idx)
    # whole tiles drift lighter toward the sunny left end and darker to the right
    tone = 0.55 - 0.75 * (X - EX0) / (EX1 - EX0) + 0.5 * (_hash2(ci, qi, 11) - 0.5)
    idx = np.where((tone > 0.42) & (k < 3) & (r > 0), idx + 1, idx)
    idx = np.where((tone < -0.32) & (k < 3) & (r > 0), idx - 1, idx)
    put(m, idx, TILE)
    _moss_on(names, m, X, Z, d, k, r, 1, blobs=MOSS_FRONT)
    # the left hip: lit by the sun
    m = f == F_HIP
    d = X - EX0
    q = VPROF(d)
    r = np.floor(np.mod(q, COURSE)).astype(int)
    qi = np.floor(q / COURSE).astype(int)
    ph = np.mod(EZ1 - Z, CHZ) / (CHZ / 4)
    k = np.floor(ph).astype(int).clip(0, 3)
    k = np.array([0, 1, 2, 4])[k]
    ci = np.floor((EZ1 - Z) / CHZ).astype(int)
    idx = _tile_idx(k, r, 1)
    idx = _weather(idx, ci, qi, k, 2)
    put(m, idx, TILE)
    _moss_on(names, m, Z * 0.7, X * 1.4, d * 1.4, k, r, 2, blobs=MOSS_HIP)
    # the eave fascias: round tile ends, a dark gap, the fascia board, rafter ends
    for face, along, lit in ((F_FASCIA, X - EX0, 0), (F_SFASCIA, (EZ1 - Z) / (CHZ / CH), 1), (F_RFASCIA, X, -1)):
        m = f == face
        if not m.any():
            continue
        tops = np.zeros((h, w))
        ys, xs = np.nonzero(m)
        for yy, xx in zip(ys, xs):
            tops[yy, xx] = _roof(X[yy, xx], Z[yy, xx])[0]
        t = tops - Y
        k = np.floor(np.mod(along, CH)).astype(int).clip(0, 4)
        row0 = np.array([3, 4, 2, 1, 1])[k] + lit
        row1 = np.array([2, 3, 1, 0, 0])[k] + lit
        tile_part = m & (t < 2.2)
        put(tile_part & (t < 1.2), row0, TILE)
        put(tile_part & (t >= 1.2), row1, TILE)
        names[m & (t >= 2.2) & (t < 3.0)] = 'wood0'
        names[m & (t >= 3.0) & (t < 3.8)] = ['wood3', 'wood4', 'wood2'][lit + 1 if lit >= 0 else 2]
        names[m & (t >= 3.8) & (t < 4.6)] = ['wood2', 'wood3', 'wood1'][lit + 1 if lit >= 0 else 2]
        rk = np.mod(along, 3.0)
        raf = m & (t >= 4.6)
        names[raf] = 'wood0'
        names[raf & (rk < 1.0)] = 'wood3' if lit > 0 else 'wood2'
        names[raf & (rk >= 1.0) & (rk < 2.0)] = 'wood2' if lit > 0 else 'wood1'
    # the barge boards over the gable, with gilt studs
    m = f == F_BARGE
    if m.any():
        tops = np.zeros((h, w))
        for yy, xx in zip(*np.nonzero(m)):
            tops[yy, xx] = _roof(X[yy, xx], Z[yy, xx])[0]
        t = tops - Y
        names[m] = 'wood3'
        names[m & (t < 1.0)] = 'fgrey3'
        names[m & (t >= 1.0) & (t < 1.8)] = 'wood4'
        names[m & (t >= 2.4)] = 'wood1'
        stud = m & (np.mod(Z - GZ0f() + 2.0, 8.0) < 1.6) & (t >= 1.0) & (t < 2.4)
        names[stud] = 'gold3'
    m = f == F_BARGE_U                       # under the verge: the rafter ends in shade
    names[m] = 'wood0'
    names[m & (np.mod(Z, 4.0) < 1.6)] = 'wood1'
    # the gable: old plaster under the barge boards, a tie beam, a gilt gegyo at the apex
    m = f == F_GABLE
    if m.any():
        under = np.zeros((h, w))
        for yy, xx in zip(*np.nonzero(m)):
            under[yy, xx] = _roof(GX0 - 0.5, Z[yy, xx])[0] - BARGE_T - Y[yy, xx]
        base = EAVE + HG
        names[m] = 'paper3'
        stain = m & (_hash2(np.floor(Z / 3), np.floor(Y / 2), 5) < 0.18)
        names[stain] = 'paper2'
        names[m & (under < 1.6)] = 'paper1'
        names[m & (under < 0.7)] = 'wood0'
        names[m & (Y < base + 1.5)] = 'wood1'
        names[m & (Y >= base + 1.5) & (Y < base + 2.6)] = 'wood3'
        names[m & (Y >= base + 2.6) & (Y < base + 3.4)] = 'wood1'
        kp = m & (np.abs(Z - RIDGE_Z) < 1.7) & (Y >= base + 2.6)
        names[kp] = 'wood2'
        names[kp & (Z < RIDGE_Z - 0.6)] = 'wood3'
        names[kp & (Z > RIDGE_Z + 0.9)] = 'wood1'
        apex = m & (np.abs(Z - RIDGE_Z) < sf(2.6)) & (under < sf(4.0)) & (under >= 0.7)
        names[apex] = 'gold2'
        names[apex & (Z < RIDGE_Z - sf(0.4))] = 'gold3'
        names[apex & (np.abs(Z - RIDGE_Z) > sf(1.8))] = 'gold1'
    # the ridge: stacked noshi tiles under a green copper cap; onigawara at the ends
    m = (f == F_RIDGE) | (f == F_RIDGE_END)
    if m.any():
        rt = np.zeros((h, w))
        for yy, xx in zip(*np.nonzero(m)):
            rt[yy, xx] = _ridge_top(X[yy, xx])
        t = rt - Y
        end = m & (np.minimum(X - (GX0 - BARGE - 1), (GX1 + BARGE + 1) - X) < ONI_E)
        nl = np.floor((t - 2.0) / 1.25).astype(int)
        names[m] = np.where(nl % 2 == 0, 'fgrey3', 'fgrey1')[m]
        names[m & (t >= 2.0 + 1.25 * 4 * S)] = 'fgrey0'
        names[m & (t < 2.0)] = 'teal2'
        names[m & (t < 0.9)] = 'teal3'
        names[m & (t >= 2.0) & (t < 2.6)] = 'teal1'
        names[end & (t >= 2.0)] = 'fgrey2'
        names[end & (t >= 2.0) & (np.mod(t, 3.0) < 0.9)] = 'fgrey3'
        names[m & (f == F_RIDGE_END)] = 'teal1'
    names[f == F_RIDGE_TOP] = 'teal3'
    # hip ridges, copper capped like the ridge
    m = f == F_HIPR
    if m.any():
        dF, dB, dL, dR = Z - EZ0, EZ1 - Z, X - EX0, EX1 - X
        g = np.minimum(dF, dB) - np.minimum(dL, dR)
        names[m] = 'teal2'
        names[m & (g > 0.35)] = 'teal3'
        names[m & (np.abs(g) <= 0.35)] = 'teal3'
        names[m & (g < -0.9)] = 'teal1'
    # the chimney: rough stones, sooty at the top, a cap slab
    for face in (F_CHIM, F_CHIM_L, F_CHIM_TOP):
        m = f == face
        if not m.any():
            continue
        if face == F_CHIM_TOP:
            names[m] = 'stone3'
            hole = m & (np.abs(X - (CHIM[0] + CHIM[1]) / 2) < sf(3)) & (np.abs(Z - (CHIM[2] + CHIM[3]) / 2) < sf(2.5))
            names[hole] = 'ink'
            continue
        tex = CHIM_TEX[0] if face == F_CHIM else CHIM_TEX[1]
        u = (X - CHIM[0]) if face == F_CHIM else (CHIM[3] - Z) / 2.0
        v = CHIM[4] + 2 - Y
        ui = np.clip(np.floor(u).astype(int), 0, tex.w - 1)
        vi = np.clip(np.floor(v).astype(int), 0, tex.h - 1)
        ys, xs = np.nonzero(m)
        for yy, xx in zip(ys, xs):
            c = tuple(int(cc) for cc in tex.a[vi[yy, xx], ui[yy, xx], :3])
            out[yy, xx, :3] = c
            out[yy, xx, 3] = 255
    for nm in set(names[names != ''].tolist()):
        mm = names == nm
        out[mm, :3] = PAL[nm]
        out[mm, 3] = 255
    return out


def GZ0f():
    """z where the long slope reaches the gable base (the hips are 45 degrees in plan)."""
    return EZ0 + (GX0 - EX0)


def stone(cv, rng, x, y, w, h, ramp=None, tone=None):
    """A small rough stone in the furnace's manner (counter._rock, which needs
    4 px or more): clipped corners, lit top-left bevel, dark lower-right."""
    if w >= 4 and h >= 4:
        CT._rock(cv, rng, x, y, w, h, ramp or CT.STONE)
        return
    ramp = ramp or CT.STONE
    t = rng.choice((0, 1, 1)) if tone is None else tone
    for yy in range(h):
        for xx in range(w):
            corner = (xx in (0, w - 1)) and (yy in (0, h - 1)) and w > 2 and h > 2
            if corner:
                continue
            i = t + 1
            if yy == 0 or xx == 0:
                i += 1
            if yy == h - 1 or xx == w - 1:
                i -= 1
            cv.px(x + xx, y + yy, ramp[max(0, min(len(ramp) - 1, i))])


def chimney_textures(rng):
    """Front and side faces of the furnace chimney, built rock by rock like the
    furnace (counter._rock), at outdoor scale; soot toward the top."""
    cx0, cx1, cz0, cz1, top = CHIM
    hgt = int(top + 2 - EAVE)
    out = []
    for wdt, ramp_lift in ((cx1 - cx0 + 1, 0), ((cz1 - cz0) // 2 + 1, 1)):
        cv = Canvas(int(wdt), hgt)
        cv.rect(0, 0, cv.w, cv.h, 'stone0')
        y = 2
        row = 0
        while y < hgt:
            rh = rng.randint(3, 4)
            x = -rng.randint(0, 3)
            while x < cv.w:
                sw = rng.randint(4, 6) if ramp_lift == 0 else rng.randint(2, 3)
                ramp = CT.WARM_STONE if rng.random() < 0.15 else CT.STONE
                if ramp_lift:
                    ramp = ramp[1:] + ramp[-1:]
                stone(cv, rng, x, y, sw - 1, rh - 1, ramp)
                x += sw
            y += rh
            row += 1
        cv.rect(0, 0, cv.w, 2, 'stone2' if ramp_lift == 0 else 'stone3')     # cap slab edge
        cv.hline(0, cv.w - 1, 0, 'stone4')
        cv.hline(0, cv.w - 1, 2, 'stone0')
        for yy in range(3, 8):                                          # soot from the flue
            for xx in range(cv.w):
                if BAYER4[yy % 4][xx % 4] / 16 > (yy - 3) / 5:
                    cv.shift(xx, yy, -1)
        out.append(cv)
    return out


CHIM_TEX = chimney_textures(random.Random(5))

# ---------------------------------------------------------------- sunlight
SUN = np.array([-0.75, 0.85, -1.0])
SUN = SUN / np.linalg.norm(SUN)       # toward the sun: from the upper left, in front
_vp = (VZ0 + si(1), VZ0 + si(1) + si(2))
VPOSTS = ((float(VX0), float(VX0 + si(2)), float(_vp[0]), float(_vp[1])),
          (float(BX1 + si(2)), float(BX1 + 2 * si(2)), float(_vp[0]), float(_vp[1])))   # veranda posts x0, x1, z0, z1


BODY_UP = sf(14.0)                     # the body as a sun blocker reaches up into the roof
SHADOW_T, SHADOW_Y = sf(160.0), sf(140.0)   # how far to trace toward the sun, and to what height


@njit(**_JIT)
def _solid_all(x, y, z):
    if _inside(x, y, z) != 0:
        return True
    if BX0 <= x <= BX1 and BZ0 <= z <= BZ1 and 0.0 <= y <= WALL_TOP + BODY_UP:
        return True
    if VX0 <= x <= VX1 and VZ0 <= z <= 0.0 and FLOOR - VT <= y <= FLOOR:
        return True
    for (a, b, c, d) in VPOSTS:
        if a <= x <= b and c <= z <= d and FLOOR <= y <= EAVE:
            return True
    return False


@njit(**_JIT)
def _shadowed(pts, lx, ly, lz):
    n = pts.shape[0]
    out = np.zeros(n, np.bool_)
    for i in range(n):
        x, y, z = pts[i, 0], pts[i, 1], pts[i, 2]
        t = 0.7
        while t < SHADOW_T:
            yy = y + ly * t
            if yy > SHADOW_Y:
                break
            if _solid_all(x + lx * t, yy, z + lz * t):
                out[i] = True
                break
            t += 0.5
    return out


def shadowed(pts, sun=None):
    sun = SUN if sun is None else sun
    pts = np.ascontiguousarray(np.asarray(pts, float).reshape(-1, 3))
    return _shadowed(pts, sun[0], sun[1], sun[2])


GROUND_SUN = np.array([-0.55, 1.5, -0.45])
GROUND_SUN = GROUND_SUN / np.linalg.norm(GROUND_SUN)   # the shade on the grass is drawn short and close


# ---------------------------------------------------------------- the veranda and the footings
def veranda_top(rng):
    """The engawa's boards (grey, weathered), texels = 4 units deep (one screen row)."""
    w = VX1 - VX0
    nr = -VZ0 // 4
    cv = Canvas(w, nr)
    for row in range(nr):
        cv.hline(0, w - 1, row, 'stone2' if (row // 2) % 2 == 0 else 'stone3')
    for k, row in enumerate(range(0, nr, 2)):
        x = rng.randint(4, 30)
        while x < w:
            cv.vline(x, row, row + 1, 'stone1')
            x += rng.randint(26, 44)
    WG.grain_pass(cv, 0, 0, w, nr, 'h', seed=4.0, board=2, contrast=0.8, ramps=('stone',))
    for xx in range(DOOR[0] - VX0 - si(1), DOOR[1] - VX0 + si(3)):   # worn pale in front of the door
        if (xx * 7) % 5:
            cv.px(xx, nr - 1, 'stone4')
    return cv


def veranda_front(rng):
    w = VX1 - VX0
    cv = Canvas(w, FLOOR)
    cv.hline(0, w - 1, 0, 'stone4')
    cv.hline(0, w - 1, 1, 'stone2')
    for row in range(2, VT):
        cv.hline(0, w - 1, row, 'stone1')
    WG.grain_pass(cv, 0, 1, w, VT, 'h', seed=9.0, board=2, contrast=0.8, ramps=('stone',))
    cv.rect(0, VT, w, FLOOR - VT, 'wood0')                         # dark under the floor
    cv.hline(0, w - 1, VT, 'ink')
    for x in range(si(6), w, si(26)):                              # the footings further in
        for (dx, dy, c) in ((0, 7, 'stone1'), (1, 7, 'stone1'), (2, 7, 'stone0'), (0, 6, 'stone1'), (1, 6, 'stone2')):
            cv.px(x + dx, dy + 1 + FLOOR - 10, c)
    return cv


def side_foundation(rng):
    w = (BZ1 - BZ0) // 2
    cv = Canvas(w, FLOOR)
    cv.rect(0, 0, w, FLOOR, 'wood0')
    cv.hline(0, w - 1, 0, 'wood2')
    cv.hline(0, w - 1, 1, 'ink')
    return cv


def post3d(cv, x0, x1, z0, z1, y0, y1):
    """A square post: its front face and its lit left face (one px at 2:1)."""
    fx = Canvas(int(x1 - x0), int(y1 - y0))
    post(fx, 0, fx.w, 0, fx.h, seed=x0)
    warp(cv, fx, (x0, y1, z0), (1, 0, 0), (0, -1, 0))
    sd = Canvas(1, int(y1 - y0))
    sd.vline(0, 0, sd.h - 1, 'wood3')
    warp(cv, sd, (x0, y1, z1), (0, 0, -(z1 - z0)), (0, -1, 0))


def footings(cv, rng):
    """Tsuka-ishi under the posts and along the front, half sunk in the ground."""
    big, small, side = (si(7), si(5)), (si(6), si(4)), (si(5), si(4))
    spots = [(VPOSTS[0][0] + 1, VZ0 + 1) + big, (VPOSTS[1][0] + 1, VZ0 + 1) + big, (sf(30), VZ0 + 2) + small,
             (sf(70), VZ0 + 2) + small, (sf(96), VZ0 + 2) + small, (-1, 2) + side, (-1, sf(22)) + side,
             (-1, sf(42)) + side]
    for (x, z, w, h) in spots:
        sx, sy = P(x, 0, z)
        stone(cv, rng, int(sx - w / 2), int(sy - h + 1), w, h)


# ---------------------------------------------------------------- putting it together
MARCH_BOX = T(120, 90) + T(360, 200)


def build_static(seed=11):
    """Everything that does not move, as one 640x360 canvas."""
    rng = random.Random(seed)
    cv = Canvas(W, H)
    walls = Canvas(W, H)
    warp(walls, side_foundation(rng), (0, FLOOR, BZ1), (0, 0, -2), (0, -1, 0))
    warp(walls, side_wall(rng), (BX0, WALL_TOP, BZ1), (0, 0, -2), (0, -1, 0))
    warp(walls, front_wall(rng), (BX0, WALL_TOP, 0), (1, 0, 0), (0, -1, 0))
    # light and shade on the walls: what the eaves and posts keep from the sun
    ys, xs = np.nonzero(walls.a[..., 3] > 0)
    wx = xs + 0.5 - SX0
    wy = SY0 - (ys + 0.5)
    on_front = wx >= 0
    wz = np.where(on_front, 0.01, 2 * (SX0 - (xs + 0.5)))
    wx = np.where(on_front, wx, -0.01)
    wy = np.where(on_front, wy, SY0 - (ys + 0.5) - B * wz)
    glass = on_front & (((wx > WIN[0]) & (wx < WIN[1]) & (wy > WIN[2]) & (wy < WIN[3])) |
                        ((wx > DOOR[0]) & (wx < DOOR[1]) & (wy < DOOR_TOP) & (wy > FLOOR)))
    sh = shadowed(np.stack([wx, wy, wz], 1)) & ~glass & (wy > FLOOR + 0.5)
    for y, x in zip(ys[sh], xs[sh]):
        walls.shift(x, y, -1)
    moon_window(walls)
    cv.blit(walls, 0, 0)
    wall_mask = np.zeros((H, W), bool)
    wall_mask[ys[on_front & ~glass], xs[on_front & ~glass]] = True
    # the veranda
    ver = Canvas(W, H)
    warp(ver, veranda_front(rng), (VX0, FLOOR, VZ0), (1, 0, 0), (0, -1, 0))
    warp(ver, veranda_top(rng), (VX0, FLOOR, 0), (1, 0, 0), (0, 0, -4))
    ys, xs = np.nonzero(ver.a[..., 3] > 0)
    top = (ys + 0.5) < SY0 - FLOOR - B * VZ0 + 0.5                       # the boards, not the dark under them
    wz = np.clip((SY0 - FLOOR - (ys + 0.5)) / B, VZ0, 0)
    pts = np.stack([xs + 0.5 - SX0 + A * wz, np.full(len(xs), FLOOR + 0.2), wz], 1)
    sh = shadowed(pts) & top
    for y, x in zip(ys[sh], xs[sh]):
        ver.shift(x, y, -1)
    cv.blit(ver, 0, 0)
    for (a, b, c, d) in VPOSTS:
        post3d(cv, a, b, c, d, FLOOR, WALL_TOP)
    footings(cv, rng)
    # the roof
    s, f, p = march(MARCH_BOX)
    roof = shade_roof(s, f, p, rng)
    x0, y0, x1, y1 = MARCH_BOX
    reg = cv.a[y0:y1, x0:x1]
    m = roof[..., 3] > 0
    reg[m] = roof[m]
    wall_mask &= cv.a[..., 3] > 0
    wall_mask[y0:y1, x0:x1] &= ~m
    return cv, wall_mask


# ---------------------------------------------------------------- the things that move
LANTERNS = [(sf(15.0), sf(-8.0), 0.0), (sf(49.0), sf(-8.0), 2.0)]     # world x, z, extra lag (frames)
FURIN = (sf(-9.0), sf(-17.0))
NOREN_W = si(6)                                         # width of a noren panel
NOREN_PANELS = tuple(DOOR[0] + si(1) + p * (NOREN_W + si(1)) for p in range(3))   # their left edges (world x)
NOREN_LEN = si(15)


def _sx(x, z=0.0):
    return int(math.floor(SX0 + x - A * z))


def _sy(y, z=0.0):
    return int(math.floor(SY0 - y - B * z))


def noren(cv, f):
    """Indigo noren over the door: three panels on a rod, a white teacup crest.
    The gust lifts them, pushes them out and swings them apart, each panel a
    little behind the one to its left."""
    y0 = _sy(DOOR_TOP) + 1
    x0, x1 = _sx(DOOR[0]) - 1, _sx(DOOR[1])
    spr = Canvas(DOOR[1] - DOOR[0] + 20, NOREN_LEN + 11)
    ox, oy = x0 - 8, y0
    g = max(0.0, wind(x0 + 10, f) - 0.25)                  # the gust part of the wind
    pw = NOREN_W
    crest = _noren_crest()
    for p, px0 in enumerate(NOREN_PANELS):
        sx0 = _sx(px0) - ox
        s = sway(_sx(px0 + pw // 2), f, amp=1.25, lag=1.0 + p * 1.6) * S
        spread = (p - 1) * g * 1.4 * S
        lift = int(round(max(0.0, s) * 0.9 + g * 1.5 * S))
        L = NOREN_LEN - lift - (1 if p == 1 else 0)
        for row in range(L):
            t = row / max(1, L - 1)
            dx = (s + spread) * t * t * 1.5
            xx = sx0 + int(round(dx))
            bulge = s * 4 * t * (1 - t)                    # billowing out: the middle catches the light
            for k in range(pw):
                c = 'indigo3' if k == 0 else ('indigo1' if k >= pw - 2 else 'indigo2')
                if bulge > 0.9 * S and 1 <= k < pw // 2 and 0.3 < t < 0.85:
                    c = 'indigo3'
                if bulge < -0.6 * S and pw // 2 <= k < pw - 1:
                    c = 'indigo0'
                if row == 0:
                    c = 'indigo1' if k < pw - 1 else 'indigo0'
                if row == L - 1:
                    c = 'indigo1' if k < pw - 2 else 'indigo0'
                    if (k + p * 2) % 5 == 3:
                        continue                             # frayed hem
                spr.px(xx + k, row + 1, c)
            cr = row - si(3)
            if p == 1 and 0 <= cr < len(crest):              # the crest: a white ring mon round a tea leaf
                for k, ch in enumerate(crest[cr]):
                    if ch in '#+':
                        spr.px(xx + (pw - len(crest[cr])) // 2 + k, row + 1, 'paper4' if ch == '#' else 'paper3')
    out = OBJ.outline(spr)
    for xx in range(x0 - 1, x1 + 2):                         # the rod
        cv.px(xx, y0, 'wood3')
    cv.px(x0 - 2, y0, 'wood1'); cv.px(x1 + 2, y0, 'wood1')
    cv.blit(out, ox - 1, oy - 1)
    for xx in range(x0 - 1, x1 + 2):
        cv.px(xx, y0, 'wood3' if xx % 7 else 'wood4')


def _noren_crest():
    """The white ring mon round a tea leaf, as rows ('#' lit, '+' shaded)."""
    if S == 1.0:
        rows = ['.###.', '#..##', '#.#.#', '##..#', '.###.']
        return [''.join(('#' if (k < 2 or r < 2) else '+') if ch == '#' else '.' for k, ch in enumerate(row))
                for r, row in enumerate(rows)]
    n = max(5, NOREN_W - 1 - (NOREN_W % 2 == 0))             # odd, a pixel in from each edge
    c = (n - 1) / 2
    out = []
    for y in range(n):
        row = ''
        for x in range(n):
            d = math.hypot(x - c, y - c)
            ring = c - 0.65 <= d <= c + 0.45
            u, v = (x - c) / c, (y - c) / c                  # the leaf: a slanted lens with a midrib
            leaf = abs(u + v) < 0.42 and abs(u - v) < 0.75 * (1 - abs(u + v) / 0.5) + 0.25
            leaf = leaf and d < c - 1.0
            row += ('#' if (x < c or y < c) else '+') if (ring or leaf) else '.'
        out.append(row)
    return out


def _lantern_sprite(f, flick):
    """A chochin, 7 px across: black lacquer caps with a gilt rim, red paper
    glowing from the candle inside, bamboo ribs, a tassel."""
    rows = ['..kkk..',
            '.gGGGg.',
            '.rRFRr.',
            'rRFHFRr',
            'dRFHFRd',
            'rRFHFRr',
            '.rRFRr.',
            '.gGGGg.',
            '..kkk..']
    hot = 'fire5' if flick else 'fire4'
    cmap = {'k': 'wood0', 'g': 'gold1', 'G': 'gold2', 'r': 'red2', 'R': 'red4', 'F': 'fire3', 'H': hot,
            'd': 'red1'}
    spr = Canvas(9, 14)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != '.':
                spr.px(x + 1, y + 1, cmap[ch])
    for x in range(2, 7):                                    # a rib across the middle, darker
        spr.shift(x, 5, -1)
    return spr


def lanterns(cv, f):
    for i, (x, z, lag) in enumerate(LANTERNS):
        ax, ay = _sx(x, z), _sy(EAVE - EAVE_T + 1, EZ0)      # the cord comes out under the eave
        s = sway(ax, f, amp=1.2, lag=4.0 + lag)
        dx = int(round(s))
        flick = math.sin(2 * math.pi * (f * 7 / N + i * 0.37)) + 0.6 * math.sin(2 * math.pi * f * 17 / N) > -0.9
        top = ay + 7
        cx = ax + dx
        cv.line(ax, ay, cx, top - 1, 'wood1')
        spr = OBJ.outline(_lantern_sprite(f, flick))
        cv.blit(spr, cx - 5, top - 2)
        tx = cx + int(round(sway(ax, f, amp=0.8, lag=6.0 + lag) - s * 0.6))   # tassel trails
        for k in range(3):
            cv.px(cx + (tx - cx) * k // 3, top + 9 + k, 'red1' if k < 2 else 'gold2')


def lantern_glow(cv, f, wall_mask):
    """The lanterns warm the wall behind them (one step up the ramp, dithered edge)."""
    for i, (x, z, lag) in enumerate(LANTERNS):
        ax, ay = _sx(x, z), _sy(EAVE - EAVE_T + 1, EZ0)
        s = sway(ax, f, amp=1.2, lag=4.0 + lag)
        cx, cy = ax + s, ay + 12
        for yy in range(int(cy) - 9, int(cy) + 10):
            for xx in range(int(cx) - 8, int(cx) + 9):
                if not (0 <= xx < W and 0 <= yy < H) or not wall_mask[yy, xx]:
                    continue
                d = math.hypot((xx + 0.5 - cx) / 7.0, (yy + 0.5 - cy) / 8.0)
                if d < 0.7 or (d < 1.0 and BAYER4[yy % 4][xx % 4] / 16 < (1.0 - d) / 0.3):
                    cv.shift(xx, yy, 1, only=('red', 'wood'))


def furin(cv, f):
    """The glass wind chime under the eave corner; its paper strip flutters."""
    x, z = FURIN
    ax = _sx(x, z)
    ay = int(math.floor(SY0 - (EAVE - EAVE_T + _kick_py(x, EZ0)) - B * EZ0)) + 1
    w = wind(ax, f)
    s = sway(ax, f, amp=1.0, lag=1.0)
    bx = ax + int(round(s * 0.5))
    cv.line(ax, ay, bx, ay + 2, 'paper1')
    by = ay + 3
    for (dx, dy, c) in ((-1, 0, 'sky2'), (0, 0, 'cloud3'), (1, 0, 'sky1'), (-1, 1, 'sky3'), (0, 1, 'sky2'),
                        (1, 1, 'sky1'), (-2, 1, 'sky0'), (2, 1, 'sky0'), (-2, 2, 'red3'), (-1, 2, 'sky2'),
                        (0, 2, 'leaf3'), (1, 2, 'sky1'), (2, 2, 'sky0')):
        cv.px(bx + dx, by + dy, c)
    cv.hline(bx - 2, bx + 2, by - 1, 'sky0')
    cv.px(bx - 1, by - 1, 'sky1'); cv.px(bx, by - 1, 'sky1')
    sx = bx + int(round(s * 0.8))
    cv.px(sx, by + 3, 'gold2')
    cv.px(sx, by + 4, 'paper1')
    for j in range(6):                                       # the tanzaku
        t = (j + 1) / 6
        fl = 0.9 * w * math.sin(2 * math.pi * f * 6 / N + t * 2.2)
        xx = sx + int(round((s * 1.6 + fl) * t))
        wide = abs(math.sin(2 * math.pi * f * 4 / N + t * 1.7 + 0.5)) > 0.35 * w + 0.15
        cv.px(xx, by + 5 + j, 'paper4' if j != 2 else 'red2')
        if wide:
            cv.px(xx + 1, by + 5 + j, 'paper2')


def _kick_py(x, z):
    return _kick(float(x), float(z))


SMOKE_TOP = (sum(CHIM[:2]) / 2, CHIM[4] + 2, sum(CHIM[2:4]) / 2)


def smoke(f):
    """A thin curl of smoke off the furnace chimney: small puffs rising, growing
    and thinning out, pushed over by the same gust as everything else.
    Quantised to three soft levels like the furnace's smoke."""
    cx, cy = P(*SMOKE_TOP)
    f = f % N
    K, LIFE = 16, 64
    w, h = 110, 70
    ox, oy = int(cx) - 12, int(cy) - h + 4
    yy, xx = np.mgrid[0:h, 0:w]
    D = np.zeros((h, w))
    for j in range(-K, K):
        b = j * N / K
        age = f - b
        if not (0 <= age < LIFE):
            continue
        a = age / LIFE
        drift = 0.0
        for i in range(int(age)):
            drift += 0.1 + 0.85 * wind(cx + drift, f - i)
        y = cy - a * 52 - 2
        ph = 2 * math.pi * 3 * b / N                     # a curl that rises with the smoke
        x = cx + drift * (0.35 + 0.65 * a) + math.sin(a * 5.5 - ph) * 3.2 * a
        r = 1.7 + 3.6 * a
        amp = 1.45 * min(1.0, 0.35 + a / 0.05) * (1 - a) ** 1.25
        amp *= 1.0 - 0.45 * a * (0.5 + 0.5 * math.sin(2 * math.pi * 4 * b / N))   # it thins into puffs
        D += amp * np.exp(-(((xx + 0.5 - (x - ox)) ** 2) / (r * r * 1.6) + ((yy + 0.5 - (y - oy)) ** 2) / (r * r)))
    out = np.zeros((h, w, 4), np.uint8)
    levels = [(1.0, 'cloud3', 215), (0.6, 'cloud2', 165), (0.3, 'cloud1', 105)]
    done = np.zeros((h, w), bool)
    for th, c, al in levels:
        m = (D > th) & ~done
        out[m, :3] = PAL[c]
        out[m, 3] = al
        done |= m
    faint = (out[..., 3] == 105) & ((xx + yy) % 2 == 0) & (D < 0.2 + 0.1)
    out[faint] = 0
    return out, ox, oy


ROOF_TUFTS = [(-9.0, 2.0), (88.0, -15.0), (118.0, -14.0), (60.0, -16.5)]     # world x, z on the roof


def roof_tufts(cv, f):
    """A few blades of grass have rooted in the moss on the roof; they nod in the gust."""
    rng = random.Random(41)
    for (x, z) in ROOF_TUFTS:
        top = _roof(float(x), float(z))[0]
        bx, by = _sx(x, z), _sy(top, z)
        s = sway(bx, f, amp=1.0, lag=0.5)
        for b in range(rng.randint(3, 4)):
            hgt = rng.randint(2, 4)
            base = bx + b - 1
            lean = rng.choice((-1, 0, 0, 1))
            for k in range(1, hgt + 1):
                t = k / hgt
                xx = base + int(round((s + lean * 0.6) * t * t))
                cv.px(xx, by - k, 'leaf4' if k == hgt else ('leaf3' if k > 1 else 'leaf2'))


# ---------------------------------------------------------------- the sign, the stone lantern, the ground
def sign(rng):
    """A vertical signboard hung on the wall by the door, its runes gilded
    (the pack's rune script: CHA, tea)."""
    w, h = 7, 21
    cv = Canvas(w, h)
    cv.rect(0, 0, w, h, 'wood2')
    WG.grain_pass(cv, 1, 0, w - 1, h, 'v', seed=3.3, board=w - 2, contrast=0.8)
    cv.vline(0, 0, h - 1, 'wood3')
    cv.hline(0, w - 1, 0, 'wood3')
    cv.vline(w - 1, 0, h - 1, 'wood1')
    cv.hline(0, w - 1, h - 1, 'wood1')
    for i, ch in enumerate('CHA'):
        text(cv, 2, 2 + 6 * i, ch, 'gold3')
        for gy in range(5):                                  # the gilt is worn on the lower strokes
            for gx in range(3):
                if cv.get(2 + gx, 2 + 6 * i + gy)[:3] == PAL['gold3'] and (gx + gy) % 3 == 2:
                    cv.px(2 + gx, 2 + 6 * i + gy, 'gold2')
    chip(cv, 3, 15, 3, 3, rng, under='wood3', under_dark='wood1', n=1, rmin=0.8, rmax=1.2, elong=1.0)
    return OBJ.outline(cv)


def toro(rng):
    """A kasuga stone lantern: base, round post, platform, the fire box with its
    window glowing, an umbrella cap with curled corners and a jewel on top.
    Stones lit from the upper left like the furnace's; moss on the cap and base."""
    S = ['stone0', 'stone1', 'stone2', 'stone3', 'stone4']
    w, h = 17, 31
    cv = Canvas(w, h)
    def slab(x0, x1, y0, y1, lift=0):
        for y in range(y0, y1):
            for x in range(x0, x1):
                i = 2 + lift
                if y == y0:
                    i += 1
                if x == x0:
                    i += 1
                if x == x1 - 1 or y == y1 - 1:
                    i -= 1
                cv.px(x, y, S[max(0, min(4, i))])
        cv.px(x0, y1 - 1, S[1 + lift]); cv.px(x1 - 1, y0, S[2 + lift])
    slab(3, 14, h - 3, h)                                    # kiso, the base
    slab(4, 13, h - 5, h - 3, 0)
    for y in range(h - 14, h - 5):                           # sao, the round post
        for k, c in enumerate(('stone3', 'stone3', 'stone2', 'stone2', 'stone1')):
            cv.px(6 + k, y, c)
    cv.hline(6, 10, h - 10, 'stone1')                        # a ring cut round the post
    cv.hline(6, 7, h - 9, 'stone4')
    slab(3, 14, h - 17, h - 14)                              # chudai, the platform
    slab(5, 12, h - 23, h - 17)                              # hibukuro, the fire box
    for y in range(h - 22, h - 18):                          # its window, a candle inside
        for x in range(7, 10):
            cv.px(x, y, 'fire3' if y > h - 21 else 'fire2')
    cv.px(8, h - 20, 'fire5'); cv.px(8, h - 19, 'fire4')
    cv.vline(6, h - 22, h - 18, 'stone1')
    for y in range(h - 28, h - 23):                          # kasa, the cap: wide, sloped, curled up corners
        t = (y - (h - 28)) / 4
        half = 2 + t * 6.5
        x0, x1 = int(round(8.5 - half)), int(round(8.5 + half))
        for x in range(x0, x1):
            c = 'stone3' if x < 8.5 - half * 0.2 else 'stone2'
            if y == h - 24:
                c = 'stone1' if x > 5 else 'stone2'
            if y == h - 28:
                c = 'stone4' if x < 9 else 'stone3'
            cv.px(x, y, c)
    cv.px(1, h - 25, 'stone3'); cv.px(15, h - 25, 'stone2')  # curled corners
    cv.px(0, h - 26, 'stone3'); cv.px(16, h - 26, 'stone1')
    cv.hline(2, 14, h - 23, 'stone0')
    for (x, y, c) in ((7, h - 30, 'stone3'), (8, h - 30, 'stone3'), (9, h - 30, 'stone2'), (8, h - 31, 'stone4'),
                      (7, h - 29, 'stone2'), (8, h - 29, 'stone2'), (9, h - 29, 'stone1')):
        cv.px(x, y, c)                                        # hoju, the jewel
    MOSS.clump(cv, rng, 2, h - 26, 7, 2, 'ledge', spores=0.0, shadow=False)
    MOSS.clump(cv, rng, 9, h - 16, 4, 2, 'ledge', spores=0.0, shadow=False)
    MOSS.clump(cv, rng, 3, h - 3, 5, 2, 'ledge', spores=0.4, shadow=False)
    for (x, y) in ((11, h - 2), (5, h - 12), (12, h - 15)):  # lichen
        cv.px(x, y, 'paper2')
    return OBJ.outline(cv)


def fern(rng, n=5, size=8, flip=False):
    """A clump of fern: arching fronds with leaflets, lit on top."""
    w, h = size * 3, size + 4
    cv = Canvas(w, h)
    bx, by = w // 2, h - 1
    for k in range(n):
        a = math.pi * (0.15 + 0.7 * (k + rng.uniform(-0.2, 0.2)) / max(1, n - 1))
        L = size * rng.uniform(0.7, 1.0)
        pts = []
        for i in range(int(L * 2) + 1):
            t = i / (L * 2)
            x = bx + math.cos(a) * L * t * 1.25
            y = by - math.sin(a) * L * t + (L * 0.55) * t * t
            pts.append((int(round(x)), int(round(y))))
        for i, (x, y) in enumerate(pts):
            t = i / max(1, len(pts) - 1)
            cv.px(x, y, 'leaf2' if t < 0.3 else 'leaf3')
            if 0.2 < t < 0.95 and i % 2 == 0:
                cv.px(x, y - 1, 'leaf4' if t > 0.4 else 'leaf3')
                cv.px(x, y + 1, 'leaf1')
    out = OBJ.outline(cv)
    if flip:
        out.a = out.a[:, ::-1].copy()
    return out


def ground_shadow():
    """Where the building keeps the sun off the meadow: a soft see-through shade."""
    x0, y0, x1, y1 = 140, 200, 380, 262
    yy, xx = np.mgrid[y0:y1, x0:x1]
    z = (SY0 - (yy + 0.5)) / B
    x = xx + 0.5 - SX0 + A * z
    ok = (z > VZ0 - 8) & (z < BZ1 + 30) & (x > EX0 - 6) & (x < EX1 + 18)
    pts = np.stack([x[ok], np.full(ok.sum(), 0.2), z[ok]], 1)
    sh = shadowed(pts, GROUND_SUN)
    m = np.zeros(xx.shape, bool)
    m[ok] = sh
    out = np.zeros((H, W, 4), np.uint8)
    reg = out[y0:y1, x0:x1]
    core = m.copy()
    for d in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        core &= np.roll(m, d, (0, 1))
    reg[m] = (*PAL['ink'], 60)
    reg[core] = (*PAL['ink'], 105)
    return out


def ground_items(rng):
    """The things at the building's foot, as (y_sort, x, frames or sprite)."""
    items = []
    # the shoe stone at the door, and stepping stones running into the meadow path
    st = Canvas(20, 7)
    CT._rock(st, rng, 0, 0, 19, 6, CT.STONE)
    MOSS.clump(st, rng, 13, 6, 5, 2, 'ledge', spores=0.0, shadow=False)
    items.append((247, _sx(24, -19), 241, st))
    for (x, y, w_) in ((230, 250, 9), (222, 254, 9), (216, 258, 8)):
        s = Canvas(w_ + 1, 5)
        CT._rock(s, rng, 0, 0, w_, 4, CT.STONE)
        s.px(w_ - 2, 3, 'leaf2')
        items.append((y + 3, x - 1, y - 1, OBJ.outline(s)))
    # the stone lantern at the near corner
    t = toro(rng)
    items.append((252, 172, 252 - t.h + 1, t))
    # ferns at the corners
    for (x, y, n, sz, fl) in ((186, 249, 6, 7, False), (300, 248, 5, 6, True), (163, 240, 4, 6, False)):
        fr = fern(rng, n, sz, fl)
        items.append((y, x - fr.w // 2, y - fr.h + 1, fr))
    # grass tufts along the footings, swaying with the scene's meadow
    spots = [(158, 238, 6, 4), (176, 244, 7, 5), (196, 247, 5, 4), (214, 248, 6, 4), (258, 248, 6, 5),
             (276, 248, 5, 4), (292, 249, 7, 5), (312, 247, 6, 4), (168, 253, 8, 6), (249, 250, 5, 3)]
    for (x, y, hgt, nb) in spots:
        MD._GUST = -2 * math.pi * x / (W / 2.0)
        fr = MD.tuft(rng, hgt, nb, 0 if y > 246 else 1)
        items.append((y, x - fr[0].w // 2, y - fr[0].h + 1, fr))
    MD._GUST = 0.0
    items.sort(key=lambda it: it[0])
    return items


def roof_moss(cv, rng):
    """Cushions of moss bulging over the eave edge, and short curtains hanging
    off the fascia where the gutter-less rain runs."""
    for (x, z, w_, h_) in ((-7, -19.5, 9, 3), (74, -19.7, 11, 3), (106, -19.4, 8, 3), (-15.5, 30.0, 8, 3)):
        top = _roof(float(x), float(z))[0]
        MOSS.clump(cv, rng, _sx(x, z), _sy(top, z) + 2, w_, h_, 'ledge', spores=0.0)
    for (x, w_, d_) in ((84, 9, 5), (12, 6, 4), (52, 5, 3)):
        bot = _roof(float(x), float(EZ0))[0] - EAVE_T
        MOSS.clump(cv, rng, _sx(x, EZ0), _sy(bot, EZ0), w_, d_, 'hang')


def foot_moss(cv, rng):
    """Moss creeping on the footings, the sill and the lowest boards."""
    for x in range(-2, 118, 9):
        if rng.random() < 0.6:
            MOSS.clump(cv, rng, _sx(x, VZ0), _sy(FLOOR - 3, VZ0) + 1, rng.randint(4, 7), 2, 'ledge', spores=0.0)
    for z in range(2, 44, 10):
        MOSS.clump(cv, rng, _sx(0, z) - 3, _sy(FLOOR + 3, z), 4, 3, 'wall')


def ridge_ends(cv, rng):
    """Onigawara at both ends of the ridge: a rounded clay plate with a mon, rising
    over the copper cap; verdigris run-off staining the tiles under the cap."""
    plate = ['.aab.',
             'abbbc',
             'ab.bc',
             'abbbc',
             'abbcc',
             'bbbcc']
    cmap = {'a': 'fgrey3', 'b': 'fgrey2', 'c': 'fgrey1', '.': None}
    for x in (GX0 - BARGE - 0.5, GX1 + BARGE - 2.5):
        sx = _sx(x, RIDGE_Z - RIDGE_W)
        sy = _sy(_ridge_top(float(x) + 1.0), RIDGE_Z - RIDGE_W) - 2
        spr = Canvas(5, 6)
        for yy, row in enumerate(plate):
            for xx, ch in enumerate(row):
                if ch != '.':
                    spr.px(xx, yy, cmap[ch])
                elif 0 < xx < 4:
                    spr.px(xx, yy, 'teal2')                       # a copper mon in the middle
        cv.blit(OBJ.outline(spr), sx - 2, sy - 1)
    y_cap = _sy(RIDGE_Y + RIDGE_H - 2.0, RIDGE_Z - RIDGE_W) + 1
    for _ in range(9):                                            # copper run-off
        x = rng.uniform(GX0 + 4, GX1 - 6)
        sx = _sx(x, RIDGE_Z - RIDGE_W)
        for k in range(rng.randint(1, 3)):
            p_ = cv.get(sx, y_cap + k)
            if p_[3] and p_[:3] in (PAL['fgrey1'], PAL['fgrey3'], PAL['fgrey0'], PAL['fgrey2']):
                cv.px(sx, y_cap + k, 'teal1' if k else 'teal2')


def veranda_props(cv, rng):
    """A potted shrub at the far end of the engawa and a broom by the door."""
    pot = Canvas(9, 12)
    for yy in range(7, 12):
        hw = 3 - (yy - 7) // 3
        for xx in range(4 - hw, 5 + hw):
            pot.px(xx, yy, 'copper3' if xx < 3 else ('copper2' if xx < 6 else 'copper1'))
    pot.hline(1, 7, 7, 'copper4')
    pot.hline(1, 7, 8, 'copper1')
    for (x, y, c) in ((2, 4, 'leaf3'), (3, 3, 'leaf4'), (4, 2, 'leaf3'), (5, 3, 'leaf2'), (6, 4, 'leaf2'),
                      (3, 5, 'leaf3'), (4, 4, 'leaf3'), (5, 5, 'leaf2'), (4, 6, 'leaf1'), (2, 6, 'leaf2'),
                      (6, 6, 'leaf1'), (1, 5, 'leaf2'), (7, 5, 'leaf1'), (4, 1, 'leaf4'), (5, 2, 'leaf3'),
                      (3, 6, 'leaf2'), (5, 6, 'leaf1'), (4, 5, 'leaf2'), (3, 4, 'leaf4')):
        pot.px(x, y, c)
    sx, sy = P(104, FLOOR, -6)
    cv.blit(OBJ.outline(pot), int(sx) - 5, int(sy) - 12)
    br = Canvas(6, 18)                                            # a bamboo-handled broom
    for k in range(12):
        br.px(4 - k // 6, k, 'hinoki4' if k % 3 else 'hinoki2')
    br.hline(2, 3, 12, 'red2')
    for yy in range(13, 18):
        half = 1 + (yy - 13) * 0.6
        for xx in range(int(round(2.5 - half)), int(round(2.5 + half)) + 1):
            br.px(xx, yy, 'gold3' if xx < 2.5 else ('gold2' if (xx + yy) % 2 else 'gold1'))
    sx, sy = P(47.5, FLOOR, -1)
    cv.blit(OBJ.outline(br), int(sx) - 2, int(sy) - 18)


# ---------------------------------------------------------------- the whole thing, frame by frame
_CACHE = {}


def _base():
    if 'base' in _CACHE:
        return _CACHE['base']
    rng = random.Random(23)
    bld, wall_mask = build_static()
    roof_moss(bld, rng)
    ridge_ends(bld, rng)
    foot_moss(bld, rng)
    veranda_props(bld, rng)
    s = sign(rng)
    bld.blit(s, _sx(7) - 1, _sy(48) - 1)
    for cx in (_sx(8), _sx(12)):
        bld.vline(cx, _sy(57), _sy(48) - 2, 'wood1')
    out = OBJ.outline(bld)
    full = Canvas(W, H)
    full.a = ground_shadow()
    full.blit(out.crop(1, 1, W, H), 0, 0)
    _CACHE['base'] = (full, wall_mask, ground_items(rng))
    return _CACHE['base']


def window_light(cv, f):
    """The lanterns inside breathe a little."""
    x0, x1, y0, y1 = WIN
    k = 0.5 + 0.5 * math.sin(2 * math.pi * f * 3 / N) * math.sin(2 * math.pi * f * 5 / N + 1.0)
    if k < 0.25:
        for yy in range(_sy(y1), _sy(y0)):
            for xx in range(_sx(x0), _sx(x1)):
                if cv.get(xx, yy)[:3] == PAL['fire5']:
                    cv.px(xx, yy, 'fire4')


def frame(f):
    f = f % N
    base, wall_mask, items = _base()
    cv = base.copy()
    window_light(cv, f)
    lantern_glow(cv, f, wall_mask)
    noren(cv, f)
    lanterns(cv, f)
    furin(cv, f)
    roof_tufts(cv, f)
    for (_, x, y, spr) in items:
        s = spr[f % len(spr)] if isinstance(spr, list) else spr
        cv.blit(s, x, y)
    sm, ox, oy = smoke(f)
    tmp = Canvas(sm.shape[1], sm.shape[0])
    tmp.a = sm
    cv.blit(tmp, ox, oy)
    return cv


def teahouse_frames():
    """N RGBA arrays, 640x360, transparent except the teahouse and its foot."""
    return [frame(f).a for f in range(N)]


def preview(cv, path, scale=3, bg=(150, 196, 110)):
    im = Image.new('RGBA', (cv.w, cv.h), bg + (255,))
    im.alpha_composite(cv.image())
    im = im.resize((cv.w * scale, cv.h * scale), Image.NEAREST)
    im.save(path)


OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'main_menu', 'layers', 'teahouse')
SHEET_COLS = 12


def export(out_dir=OUT_DIR, frames=None):
    """Write the layer: the cropped frames as a grid sheet, frame 0 full size, its
    record (crop box, frames, fps, sheet layout) and a 3x preview on plain grass."""
    os.makedirs(out_dir, exist_ok=True)
    frames = frames if frames is not None else teahouse_frames()
    alpha = np.zeros((H, W), bool)
    for a in frames:
        alpha |= a[..., 3] > 0
    ys, xs = np.nonzero(alpha)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    w, h = x1 - x0, y1 - y0
    rows = (len(frames) + SHEET_COLS - 1) // SHEET_COLS
    sheet = np.zeros((rows * h, SHEET_COLS * w, 4), np.uint8)
    for i, a in enumerate(frames):
        r, c = divmod(i, SHEET_COLS)
        sheet[r * h:(r + 1) * h, c * w:(c + 1) * w] = a[y0:y1, x0:x1]
    Image.fromarray(sheet, 'RGBA').save(os.path.join(out_dir, 'teahouse_sheet.png'), optimize=True)
    Image.fromarray(frames[0][y0:y1, x0:x1], 'RGBA').save(os.path.join(out_dir, 'teahouse.png'), optimize=True)
    rec = {
        'name': 'teahouse',
        'frames': len(frames),
        'fps': FPS,
        'x': x0, 'y': y0, 'w': w, 'h': h,
        'screen': [W, H],
        'sheet': 'teahouse_sheet.png',
        'sheet_columns': SHEET_COLS,
        'sheet_cols': SHEET_COLS,
        'sheet_rows': rows,
        'sheet_order': 'row by row, left to right: frame i is at column i % sheet_columns, row i // sheet_columns',
        'frame0': 'teahouse.png',
        'loops': True,
        'ground_centre': list(L.TEAHOUSE),
        'draw_after': '08_meadow_back',
        'draw_before': '09_meadow_front',
        'note': ('teahouse.png is frame 0, cropped like every sheet cell to the box x, y, w, h; draw at (x, y). '
                 'Loops seamlessly over the frames with menu_layout.wind / sway: the noren billows and its panels '
                 'swing apart, the lanterns swing behind the gust, the chime strip flutters, the chimney smoke '
                 'leans and drifts, roof grass nods, the window light breathes; the grass at the footings uses '
                 'the meadow tufts (meadow.F frames, the same gust phase as the scene\'s meadow). The ground '
                 'shadow is see-through (ink at alpha 60 / 105).'),
    }
    with open(os.path.join(out_dir, 'teahouse.json'), 'w') as fh:
        json.dump(rec, fh, indent=1)
    preview(_cv(frames[0]).crop(max(0, x0 - 12), max(0, y0 - 12), min(W, x1 + 12) - max(0, x0 - 12),
                                min(H, y1 + 12) - max(0, y0 - 12)),
            os.path.join(out_dir, 'teahouse_preview_3x.png'), 3)
    return rec


def _cv(a):
    c = Canvas(a.shape[1], a.shape[0])
    c.a = a
    return c


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == '--frame':
        c = frame(int(sys.argv[3]) if len(sys.argv) > 3 else 0)
        preview(c.crop(130, 70, 220, 200), sys.argv[2], 3)
    else:
        rec = export()
        print(json.dumps({k: rec[k] for k in ('frames', 'fps', 'x', 'y', 'w', 'h', 'sheet_columns', 'sheet_rows')}))
