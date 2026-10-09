"""The teahouse shell: one seamless 4-room panorama.

Rooms (left -> right, 480 px each):
  1  prep / boiling      x    0 -  480
  2  seating + window    x  480 -  960
  3  tea ritual          x  960 - 1440
  4  traveler bedroom    x 1440 - 1920
"""
import math
import random
import numpy as np
from pixel import Canvas, PAL, col, step, blob_mask, jag
from shapes import (wood_grain_v, wood_grain_h, peel, chip, crack, cobweb, vine,
                    flower, small_leaf, torn_paper)
from outside import dither_seam, BAYER4

W, H, ROOM = 1920, 270, 480
CEIL = 9          # ceiling planks 0..8
BEAM = (9, 19)    # main beam rows
WALL_TOP = 19
RAIL = (148, 153)  # jade rail
WAINS = (154, 195)
BASE = (195, 199)
FLOOR = 199
PILLARS = [0, 480, 960, 1440, 1912]
PILLAR_W = 14

# window holes (transparent in the wall layer)
WIN_MAIN = dict(x=600, y=38, w=240, h=110)      # room 2 lattice window
WIN_ROUND = dict(cx=1562, cy=92, r=40)          # room 4 moon window

# counter / tables
TABLE = dict(x0=4, x1=456, top=206)             # room 1 prep table
COUNTER = dict(x0=530, x1=1440, top=210)        # rooms 2-3 serving counter


def in_main_window(x, y, pad=0):
    w = WIN_MAIN
    return (w['x'] - pad <= x < w['x'] + w['w'] + pad) and (w['y'] - pad <= y < w['y'] + w['h'] + pad)


def in_round_window(x, y, pad=0):
    w = WIN_ROUND
    return (x + 0.5 - w['cx']) ** 2 + (y + 0.5 - w['cy']) ** 2 <= (w['r'] + pad) ** 2


# ---------------------------------------------------------------- walls
def _red_plank_wall(cv, rng, x0, x1):
    y0, y1 = WALL_TOP, RAIL[0]
    x = x0
    while x < x1:
        pw = min(rng.choice((10, 12, 13, 14, 16, 18)), x1 - x)
        roll = rng.random()
        if roll < 0.06:
            # bare replacement board, never painted
            wood_grain_v(cv, x, y0, pw, y1 - y0, 'wood3', rng, dark='wood2', light='wood4')
            cv.vline(x, y0, y1 - 1, 'wood0')
            cv.vline(x + 1, y0, y1 - 1, 'wood4')
            cv.vline(x + pw - 1, y0, y1 - 1, 'wood1')
            for ny in (y0 + 5, y1 - 6, (y0 + y1) // 2):
                cv.px(x + pw // 2, ny, 'stone1')
                cv.px(x + pw // 2 - 1, ny - 1, 'stone3')
            x += pw
            continue
        base = 'red1' if roll < 0.2 else 'red2'
        dark = step(PAL[base], -1)
        lite = step(PAL[base], 1)
        wood_grain_v(cv, x, y0, pw, y1 - y0, base, rng, dark=dark, light=lite, knots=True)
        # paint sun-faded from the top on some boards: ordered-dither hand-off
        if rng.random() < 0.45:
            fade_to = rng.randint(y0 + 20, y0 + 80)
            cv.rect(x, y0, pw, fade_to - y0 - 6, lite)
            dither_seam(cv, fade_to - 8, 10, lite, base, x, x + pw)
            for _ in range(3):  # grain survives the fade
                gx = x + rng.randint(2, pw - 2)
                cv.vline(gx, y0 + rng.randint(0, 10), fade_to - rng.randint(4, 20), base)
        cv.vline(x, y0, y1 - 1, 'red0')              # seam
        cv.vline(x + 1, y0, y1 - 1, step(PAL[base], 1))
        cv.vline(x + pw - 1, y0, y1 - 1, dark)
        for ny in (y0 + 5, y1 - 6):
            cv.px(x + pw // 2, ny, 'wood0')
            cv.px(x + pw // 2 - 1, ny - 1, 'stone2')
            if rng.random() < 0.4:  # rust weep under the nail
                cv.vline(x + pw // 2, ny + 1, ny + rng.randint(2, 7), 'red0')
        for _ in range(rng.choice((0, 0, 1, 1, 2))):
            ph = rng.randint(6, 20)
            pw2 = rng.randint(4, max(5, pw - 1))
            px_ = x + rng.randint(0, max(0, pw - pw2))
            py_ = rng.randint(y0 + 4, y1 - ph - 2)
            chip(cv, px_, py_, pw2, ph, rng, under='wood3', under_dark='wood1',
                 n=rng.randint(2, 4), rmin=1.0, rmax=2.4, elong=rng.uniform(1.8, 3.2))
        x += pw


def _water_stain(cv, rng, x, y, length, c='red1', c2='red0'):
    w = rng.randint(3, 7)
    off = jag(rng, length, 2)
    for k in range(length):
        taper = w if k < length * 0.6 else max(1, int(w * (1 - (k - length * 0.6) / (length * 0.4))))
        for d in range(taper):
            xx = x + off[k] + d
            if (k < length * 0.8) or (xx + k) % 2 == 0:
                cv.px(xx, y + k, c)
        cv.px(x + off[k] + taper, y + k, c2) if k % 3 == 0 else None
    # tide mark at the end
    cv.hline(x + off[-1] - 1, x + off[-1] + 2, y + length, c2)


def _jade_rail(cv, rng, x0, x1):
    y0, y1 = RAIL
    cv.rect(x0, y0, x1 - x0, y1 - y0, 'jade2')
    cv.hline(x0, x1 - 1, y0, 'jade4')
    cv.hline(x0, x1 - 1, y0 + 1, 'jade3')
    cv.hline(x0, x1 - 1, y1 - 1, 'jade0')
    cv.hline(x0, x1 - 1, y1 - 2, 'jade1')
    x = x0
    while x < x1:
        x += rng.randint(14, 40)
        if rng.random() < 0.5:
            w = rng.randint(4, 14)
            peel(cv, x, y0 + 1, w, y1 - y0 - 2, rng, under='wood2', curl='jade4', shadow='jade0',
                 n=3, rmin=1, rmax=2.2)
    # shadow it casts on the wainscot
    cv.hline(x0, x1 - 1, y1, 'wood0')


def _wainscot(cv, rng, x0, x1):
    y0, y1 = WAINS
    rows = [(y0, 13), (y0 + 13, 14), (y0 + 27, y1 - y0 - 27)]
    for (yy, hh) in rows:
        x = x0
        while x < x1:
            ln = min(rng.randint(40, 110), x1 - x)
            wood_grain_h(cv, x, yy, ln, hh, 'wood2', rng, dark='wood1', light='wood3')
            cv.hline(x, x + ln - 1, yy, 'wood3')
            cv.hline(x, x + ln - 1, yy + hh - 1, 'wood0')
            cv.vline(x, yy, yy + hh - 1, 'wood0')
            cv.vline(x + 1, yy + 1, yy + hh - 2, 'wood3')
            if rng.random() < 0.15:  # broken board end: dark gap
                bw = rng.randint(4, 9)
                for k in range(bw):
                    depth = int((bw - k) * 0.8)
                    cv.vline(x + k, yy + hh - 1 - depth, yy + hh - 1, 'ink')
            x += ln
    # scuffs near the floor
    for _ in range((x1 - x0) // 30):
        sx = rng.randint(x0, x1)
        sy = rng.randint(y1 - 10, y1 - 3)
        cv.hline(sx, sx + rng.randint(2, 6), sy, 'wood3')


def _baseboard(cv, x0, x1):
    y0, y1 = BASE
    cv.rect(x0, y0, x1 - x0, y1 - y0, 'wood1')
    cv.hline(x0, x1 - 1, y0, 'wood3')
    cv.hline(x0, x1 - 1, y1 - 1, 'wood0')


def _plaster_wall(cv, rng, x0, x1):
    """Bedroom: cracked lime plaster between dark posts (shinkabe style)."""
    y0, y1 = WALL_TOP, BASE[0]
    cv.rect(x0, y0, x1 - x0, y1 - y0, 'paper2')
    # mottled plaster: soft clusters, never single-pixel noise
    for _ in range((x1 - x0) * (y1 - y0) // 900):
        bx, by = rng.randint(x0, x1), rng.randint(y0, y1 - 30)
        m = blob_mask(rng, 14, 9, n=3, rmin=1.5, rmax=3.5)
        ys, xs = np.nonzero(m)
        c = rng.choice(('paper3', 'paper3', 'paper3', 'paper1'))
        for yy, xx in zip(ys, xs):
            cv.px(bx + xx, by + yy, c)
    # trowel marks: short pale arcs
    for _ in range((x1 - x0) // 14):
        tx, ty = rng.randint(x0, x1), rng.randint(y0 + 10, y1 - 40)
        for k in range(rng.randint(4, 9)):
            cv.px(tx + k, ty + (1 if 2 < k < 6 else 0), 'paper3')
    # grime rising from the floor: ordered-dither gradient
    cv.rect(x0, y1 - 8, x1 - x0, 8, 'paper1')
    dither_seam(cv, y1 - 22, 14, 'paper2', 'paper1', x0, x1)
    # water stains with tide lines
    for sx in (x0 + 140, x0 + 330):
        sw = rng.randint(30, 50)
        for yy in range(y0, y0 + rng.randint(50, 90)):
            span = int(sw * (1 - (yy - y0) / 110))
            off = int(3 * math.sin(yy * 0.2))
            for xx in range(sx - span // 2 + off, sx + span // 2 + off):
                if (xx + yy) % 2 == 0:
                    cv.px(xx, yy, 'paper1')
            cv.px(sx - span // 2 + off, yy, 'paper0')
            cv.px(sx + span // 2 + off, yy, 'paper0')
    # cracks
    for _ in range(9):
        crack(cv, rng, rng.randint(x0 + 10, x1 - 10), rng.randint(y0 + 4, y1 - 40),
              rng.randint(8, 26), 'paper0', 'paper3', dirx=rng.uniform(-0.6, 0.6), branch=0.08)
    # a fallen patch exposing the bamboo lath
    lx, ly = x0 + 400, 120
    m = blob_mask(rng, 26, 18, n=6, rmin=2, rmax=5)
    ys, xs = np.nonzero(m)
    for yy, xx in zip(ys, xs):
        cv.px(lx + xx, ly + yy, 'wood1' if (ly + yy) % 3 else 'wood3')
        if (lx + xx) % 5 == 0:
            cv.px(lx + xx, ly + yy, 'wood0')
    for yy in range(18):
        for xx in range(26):
            if not m[yy, xx] and ((yy + 1 < 18 and m[yy + 1, xx]) or (xx + 1 < 26 and m[yy, xx + 1])):
                cv.px(lx + xx, ly + yy, 'paper4')
            elif not m[yy, xx] and ((yy - 1 >= 0 and m[yy - 1, xx]) or (xx - 1 >= 0 and m[yy, xx - 1])):
                cv.px(lx + xx, ly + yy, 'paper0')
    # posts + tie rail (nageshi)
    for px_ in (x0 + 6, x0 + 236, x1 - 6):
        wood_grain_v(cv, px_ - 3, y0, 7, y1 - y0, 'wood2', rng, dark='wood1', light='wood3', knots=False)
        cv.vline(px_ - 3, y0, y1 - 1, 'wood3')
        cv.vline(px_ + 3, y0, y1 - 1, 'wood0')
        cv.vline(px_ + 4, y0, y1 - 1, 'paper1')
    for ry in (40,):
        wood_grain_h(cv, x0, ry, x1 - x0, 6, 'wood2', rng, dark='wood1', light='wood3')
        cv.hline(x0, x1 - 1, ry, 'wood3')
        cv.hline(x0, x1 - 1, ry + 5, 'wood0')
        cv.hline(x0, x1 - 1, ry + 6, 'paper1')


# ---------------------------------------------------------------- ceiling
def _ceiling(cv, rng):
    cv.rect(0, 0, W, CEIL, 'wood0')
    x = 0
    while x < W:
        bw = rng.randint(20, 46)
        cv.rect(x, 0, bw, CEIL, 'wood1')
        cv.vline(x, 0, CEIL - 1, 'ink')
        cv.hline(x + 1, x + bw - 2, CEIL - 1, 'wood0')
        if rng.random() < 0.3:
            cv.hline(x + 2, x + bw - 4, rng.randint(1, CEIL - 3), 'wood2')
        if rng.random() < 0.12:  # missing board: a gap into the dark loft
            gw = rng.randint(4, 10)
            cv.rect(x + 3, 0, gw, CEIL - 2, 'ink')
            cv.hline(x + 3, x + 3 + gw, CEIL - 2, 'wood2')
        x += bw
    # main beam
    y0, y1 = BEAM
    wood_grain_h(cv, 0, y0, W, y1 - y0, 'wood2', rng, dark='wood1', light='wood3')
    cv.hline(0, W - 1, y0, 'wood4')
    cv.hline(0, W - 1, y0 + 1, 'wood3')
    cv.hline(0, W - 1, y1 - 2, 'wood1')
    cv.hline(0, W - 1, y1 - 1, 'wood0')
    # splits along the beam
    for _ in range(18):
        sx = rng.randint(0, W)
        sy = rng.randint(y0 + 3, y1 - 4)
        ln = rng.randint(12, 50)
        for k in range(ln):
            cv.px(sx + k, sy + (1 if (k * 7) % 13 > 9 else 0), 'wood0')
            if k % 2 == 0:
                cv.px(sx + k, sy + 1, 'wood3')
    # rafter ends with tarnished gold caps every ~60px
    for rx in range(30, W, 60):
        if any(abs(rx - p) < 20 for p in PILLARS):
            continue
        cv.rect(rx, 0, 8, CEIL, 'wood2')
        cv.vline(rx, 0, CEIL - 1, 'wood3')
        cv.vline(rx + 7, 0, CEIL - 1, 'wood0')
        cv.rect(rx, CEIL - 3, 8, 3, 'gold1')
        cv.hline(rx, rx + 7, CEIL - 3, 'gold2')
        cv.px(rx + 2, CEIL - 2, 'gold3')
        cv.px(rx + 5, CEIL - 2, 'gold0')
    # wall shadow under the beam (ambient occlusion)
    for yy in range(WALL_TOP, WALL_TOP + 7):
        for xx in range(W):
            t = (yy - WALL_TOP) / 7
            if t < 0.3 or (xx + yy) % 2 == 0 and t < 0.6 or (xx % 4 == yy % 4 and t < 1):
                cv.shift(xx, yy, -1)


# ---------------------------------------------------------------- pillars
def _pillar(cv, rng, cx, y0=CEIL, y1=FLOOR + 3, w=PILLAR_W):
    x = cx - w // 2
    cv.rect(x, y0, w, y1 - y0, 'red3')
    cv.vline(x, y0, y1 - 1, 'red1')
    cv.vline(x + 1, y0, y1 - 1, 'red4')
    cv.vline(x + 2, y0, y1 - 1, 'red4')
    cv.vline(x + 3, y0, y1 - 1, 'red5')
    cv.vline(x + w - 4, y0, y1 - 1, 'red2')
    cv.vline(x + w - 3, y0, y1 - 1, 'red2')
    cv.vline(x + w - 2, y0, y1 - 1, 'red1')
    cv.vline(x + w - 1, y0, y1 - 1, 'red0')
    for yy in range(y0, y1):          # vertical cracks in the lacquer
        if (yy * 13 + cx) % 37 < 3:
            cv.px(x + 6, yy, 'red1')
    for _ in range(7):
        ph = rng.randint(6, 22)
        py_ = rng.randint(y0 + 20, y1 - ph - 14)
        peel(cv, x + rng.randint(2, 6), py_, rng.randint(4, 8), ph, rng, under='wood2',
             curl='red5', shadow='red0', n=4, rmin=1.2, rmax=2.6)
    # chipped paint near the floor where feet and brooms knocked it
    for yy in range(y1 - 14, y1):
        for xx in range(x + 1, x + w - 1):
            if (xx * 5 + yy * 3) % 7 < (yy - (y1 - 14)) * 0.4:
                cv.px(xx, yy, 'wood2' if (xx + yy) % 3 else 'wood1')
    # gold bands
    for by in (y0 + 13, y1 - 18):
        cv.rect(x - 1, by, w + 2, 5, 'gold1')
        cv.hline(x - 1, x + w, by, 'gold3')
        cv.hline(x - 1, x + w, by + 1, 'gold2')
        cv.hline(x - 1, x + w, by + 4, 'gold0')
        for rx in range(x + 1, x + w, 4):
            cv.px(rx, by + 2, 'gold3')
            cv.px(rx, by + 3, 'gold0')
        # verdigris spots on old brass
        cv.px(x + w - 3, by + 3, 'teal2')
        cv.px(x + 2, by + 4, 'teal1')


# ---------------------------------------------------------------- floor
def _floor(cv, rng):
    y = FLOOR
    rows = [5, 6, 7, 8, 9, 10, 11, 12, 13]
    i = 0
    while y < H:
        hh = rows[min(i, len(rows) - 1)]
        x = -rng.randint(0, 60)
        while x < W:
            ln = rng.randint(60, 150)
            base = rng.choice(('wood2', 'wood2', 'wood3'))
            wood_grain_h(cv, x, y, ln, hh, base, rng, dark='wood1', light='wood3')
            cv.hline(x, x + ln - 1, y, step(PAL[base], 1))
            cv.hline(x, x + ln - 1, y + hh - 1, 'wood0')
            cv.vline(x, y, y + hh - 1, 'wood0')
            cv.vline(x + 1, y + 1, y + hh - 2, step(PAL[base], 1))
            for ny in (y + hh // 2,):
                cv.px(x + 3, ny, 'wood0')
                cv.px(x + ln - 4, ny, 'wood0')
            x += ln
        y += hh
        i += 1
    # occlusion against the baseboard
    for xx in range(W):
        cv.shift(xx, FLOOR, -1)
        if xx % 2 == 0:
            cv.shift(xx, FLOOR + 1, -1)
    # broken board with a hole
    hx, hy = 1590, FLOOR + 24
    for k in range(16):
        d = int(math.sin(math.pi * k / 16) * 4)
        cv.vline(hx + k, hy - d // 2, hy + d, 'ink')
    cv.hline(hx, hx + 15, hy - 3, 'wood4')


# ---------------------------------------------------------------- windows
def _main_window(cv, rng):
    w = WIN_MAIN
    x0, y0, ww, hh = w['x'], w['y'], w['w'], w['h']
    # cut the hole
    cv.rect(x0, y0, ww, hh, None)
    # deep frame (red lacquer over wood, like the bathhouse windows)
    f = 7
    for i in range(f):
        c = ['wood0', 'wood1', 'red1', 'red2', 'red3', 'red2', 'wood1'][i]
        cv.frame(x0 - f + i, y0 - f + i, ww + 2 * (f - i), hh + 2 * (f - i), c)
    cv.hline(x0 - f + 3, x0 + ww + f - 4, y0 - f + 3, 'red4')    # lit top edge
    cv.vline(x0 - f + 3, y0 - f + 3, y0 + hh + f - 4, 'red4')
    # inner reveal (thickness of the wall) on the right + bottom: we see it at an angle
    for k in range(4):
        cv.vline(x0 + ww - 1 - k, y0, y0 + hh - 1, ['wood1', 'wood2', 'wood2', 'wood3'][k])
    # peel on frame
    for _ in range(6):
        side = rng.choice(('t', 'b', 'l', 'r'))
        if side in 't b':
            px_ = rng.randint(x0, x0 + ww - 12)
            py_ = y0 - f + 1 if side == 't' else y0 + hh + 1
            peel(cv, px_, py_, rng.randint(6, 14), 5, rng, under='wood2', curl='red5', shadow='wood0',
                 n=3, rmin=1, rmax=2.2)
        else:
            px_ = x0 - f + 1 if side == 'l' else x0 + ww + 1
            py_ = rng.randint(y0, y0 + hh - 12)
            peel(cv, px_, py_, 5, rng.randint(6, 14), rng, under='wood2', curl='red5', shadow='wood0',
                 n=3, rmin=1, rmax=2.2)
    # sill
    sy = y0 + hh + f - 1
    cv.rect(x0 - f - 6, sy, ww + 2 * f + 12, 6, 'wood3')
    cv.hline(x0 - f - 6, x0 + ww + f + 5, sy, 'wood5')
    cv.hline(x0 - f - 6, x0 + ww + f + 5, sy + 1, 'wood4')
    cv.hline(x0 - f - 6, x0 + ww + f + 5, sy + 5, 'wood1')
    cv.hline(x0 - f - 4, x0 + ww + f + 3, sy + 6, 'wood0')
    for bx in (x0 + 10, x0 + ww - 14):      # brackets
        cv.rect(bx, sy + 6, 4, 6, 'wood2')
        cv.px(bx, sy + 6, 'wood3')
        cv.hline(bx + 1, bx + 3, sy + 11, 'wood0')
    # lattice: 4 sliding panels, upper transom row of small panes
    tr = y0 + 30
    cols = [x0 + ww * k // 4 for k in range(1, 4)]
    for cx in cols:
        cv.rect(cx - 2, y0, 4, hh, 'wood2')
        cv.vline(cx - 2, y0, y0 + hh - 1, 'wood3')
        cv.vline(cx + 1, y0, y0 + hh - 1, 'wood0')
    cv.rect(x0, tr - 2, ww, 4, 'wood2')
    cv.hline(x0, x0 + ww - 1, tr - 2, 'wood3')
    cv.hline(x0, x0 + ww - 1, tr + 1, 'wood0')
    # thin muntins in the transom
    for k in range(1, 16):
        mx = x0 + ww * k // 16
        if any(abs(mx - c) < 4 for c in cols):
            continue
        cv.vline(mx, y0, tr - 3, 'wood1')
        cv.vline(mx + 1, y0, tr - 3, 'wood2')
    # one panel rail row in the lower panes
    for k in range(4):
        px0 = x0 + ww * k // 4 + 2
        px1 = x0 + ww * (k + 1) // 4 - 3
        cv.hline(px0, px1, y0 + 72, 'wood1')
        cv.hline(px0, px1, y0 + 73, 'wood2')
    # dirt in the pane corners (opaque speckle clusters, glass stays clear)
    panes = []
    for k in range(4):
        px0 = x0 + ww * k // 4 + (2 if k else 0)
        px1 = x0 + ww * (k + 1) // 4 - (3 if k < 3 else 4)
        panes.append((px0, tr + 2, px1, y0 + 71))
        panes.append((px0, y0 + 74, px1, y0 + hh - 1))
    for (a, b, c_, d) in panes:
        for yy in range(b, d + 1):
            for xx in range(a, c_ + 1):
                dc = min(xx - a, c_ - xx, d - yy)
                if dc < 2 and (xx * 7 + yy * 3) % 5 == 0:
                    cv.px(xx, yy, 'paper1')
                elif dc < 4 and (xx * 5 + yy * 11) % 13 == 0:
                    cv.px(xx, yy, 'paper2')
    # cracked pane (radiating crack lines, drawn in pale glass colour)
    ccx, ccy = x0 + 160, y0 + 52
    for a in (0.3, 1.2, 2.2, 3.3, 4.4, 5.4):
        ln = rng.randint(8, 16)
        xx, yy = ccx, ccy
        for k in range(ln):
            xx += math.cos(a) + rng.uniform(-0.4, 0.4)
            yy += math.sin(a) + rng.uniform(-0.4, 0.4)
            cv.px(int(xx), int(yy), 'sky4' if k % 3 else 'white')
    cv.px(ccx, ccy, 'white')
    # broken pane patched with paper and tape (bottom-left pane)
    patch = torn_paper(random.Random(77), 30, 22, lines=False, curl=False, holes=False)
    cv.blit(patch, x0 + 14, y0 + 82)
    for (tx, ty) in ((x0 + 12, y0 + 82), (x0 + 40, y0 + 101)):
        cv.rect(tx, ty, 6, 3, 'paper4')
        cv.hline(tx, tx + 5, ty + 2, 'paper2')
    # cobweb in the top-left pane corner
    cobweb(cv, x0, y0, 12, 'cloud2', 'cloud1', 'tl')


def _round_window(cv, rng):
    w = WIN_ROUND
    cx, cy, r = w['cx'], w['cy'], w['r']
    for yy in range(cy - r - 8, cy + r + 9):
        for xx in range(cx - r - 8, cx + r + 9):
            d = math.hypot(xx + 0.5 - cx, yy + 0.5 - cy)
            if d <= r:
                cv.px(xx, yy, None)
            elif d <= r + 6:
                # ring frame: lit upper-left, dark lower-right
                ang = math.atan2(yy + 0.5 - cy, xx + 0.5 - cx)
                lit = math.cos(ang + 2.36)
                band = d - r
                if band < 1.2:
                    c = 'wood0'
                elif band > 5:
                    c = 'wood0'
                elif lit > 0.45:
                    c = 'wood4' if band < 3 else 'wood3'
                elif lit < -0.45:
                    c = 'wood1'
                else:
                    c = 'wood2' if band < 3 else 'wood3'
                cv.px(xx, yy, c)
            elif d <= r + 8:
                cv.px(xx, yy, 'paper1')   # plaster shadow ring
    # bamboo lattice (sparse grid) inside the circle
    for gx in range(cx - r, cx + r + 1, 20):
        for yy in range(cy - r, cy + r + 1):
            if math.hypot(gx + 0.5 - cx, yy + 0.5 - cy) < r:
                cv.px(gx, yy, 'paper1')
                cv.px(gx + 1, yy, 'paper2' if (yy % 9) else 'paper0')
    for gy in (cy - 14, cy + 14):
        for xx in range(cx - r, cx + r + 1):
            if math.hypot(xx + 0.5 - cx, gy + 0.5 - cy) < r:
                cv.px(xx, gy, 'paper2' if (xx % 11) else 'paper0')
                cv.px(xx, gy + 1, 'paper1')
    # one broken lattice stick dangling
    cv.line(cx + 20, cy - 14, cx + 27, cy + 2, 'paper1')
    cv.line(cx + 21, cy - 14, cx + 28, cy + 2, 'paper2')
    for k in range(4):
        cv.px(cx + 20 + k, cy + 14 + (k % 2), None)
        cv.px(cx + 20 + k, cy + 15, None)


# ---------------------------------------------------------------- assembly
def build_shell(seed=7):
    rng = random.Random(seed)
    cv = Canvas(W, H)
    _floor(cv, rng)
    # public rooms 1-3: lacquered red planks
    _red_plank_wall(cv, rng, 0, 1440)
    for (sx, sy, ln) in ((70, WALL_TOP + 2, 60), (420, WALL_TOP + 2, 40), (880, WALL_TOP + 2, 80),
                         (1105, WALL_TOP + 2, 50), (1330, WALL_TOP + 2, 34)):
        _water_stain(cv, rng, sx, sy, ln)
    # ghost of a frame that used to hang here (unfaded paint)
    gx, gy, gw, gh = 1208, 36, 28, 36
    for yy in range(gy, gy + gh):
        for xx in range(gx, gx + gw):
            if xx in (gx, gx + gw - 1) or yy in (gy, gy + gh - 1):
                cv.px(xx, yy, 'red3')
            elif (xx + yy) % 2 == 0:
                cv.shift(xx, yy, -1, only=('red',))
    cv.px(gx + gw // 2, gy - 6, 'wood0')
    cv.line(gx + gw // 2, gy - 6, gx + 3, gy, 'red1')
    cv.line(gx + gw // 2, gy - 6, gx + gw - 4, gy, 'red1')
    # hole punched through a plank (dark void with splinters)
    hx, hy = 388, 160 - 40
    for k in range(9):
        d = int(math.sin(math.pi * k / 9) * 5)
        cv.vline(hx + k, hy - d, hy + d, 'ink')
    for (dx, dy) in ((-1, -2), (9, 1), (3, -6), (6, 5), (-1, 2)):
        cv.px(hx + dx, hy + dy, 'wood4')
    _jade_rail(cv, rng, 0, 1440)
    _wainscot(cv, rng, 0, 1440)
    _baseboard(cv, 0, 1440)
    # bedroom: plaster
    _plaster_wall(cv, rng, 1440, 1920)
    _baseboard(cv, 1440, 1920)
    _ceiling(cv, rng)
    # ambient occlusion along every wall/floor/pillar junction
    for p in PILLARS:
        for side in (-1, 1):
            for k in range(6):
                xx = p + side * (PILLAR_W // 2 + k)
                for yy in range(WALL_TOP, FLOOR):
                    if k < 2 or (k < 4 and (xx + yy) % 2 == 0) or (k < 6 and (xx % 3 == 0 and yy % 2 == 0)):
                        cv.shift(xx, yy, -1)
    _main_window(cv, rng)
    _round_window(cv, rng)
    for p in PILLARS:
        _pillar(cv, rng, p)
    # cobwebs in high corners
    cobweb(cv, 8, WALL_TOP, 16, 'stone3', 'stone2', 'tl')
    cobweb(cv, 1433, WALL_TOP, 14, 'stone3', 'stone2', 'tr')
    cobweb(cv, 1447, WALL_TOP, 18, 'paper4', 'paper1', 'tl')
    cobweb(cv, 1905, WALL_TOP, 20, 'paper4', 'paper1', 'tr')
    cobweb(cv, 953, WALL_TOP, 12, 'stone3', 'stone2', 'tr')
    # creeping vines with flowers: along the beam, down pillars, round the window
    fl = [('pink3', 'gold3'), ('paper4', 'gold3'), ('purp3', 'gold2'), ('red4', 'gold3')]
    vine(cv, rng, [(0, 20), (120, 22), (260, 21), (380, 23), (480, 21), (600, 22), (760, 21),
                   (960, 23), (1100, 21), (1300, 22), (1440, 21), (1600, 22), (1700, 21)],
         flowers=fl, density=0.55, flower_rate=0.16)
    vine(cv, rng, [(480, 22), (476, 70), (482, 120), (478, 190)], flowers=fl, density=0.6)
    vine(cv, rng, [(960, 22), (964, 60), (958, 110)], flowers=fl, density=0.6)
    vine(cv, rng, [(1440, 22), (1436, 90)], flowers=fl, density=0.6)
    wx, wy, ww_, wh_ = WIN_MAIN['x'], WIN_MAIN['y'], WIN_MAIN['w'], WIN_MAIN['h']
    vine(cv, rng, [(wx - 9, 21), (wx - 10, wy + 10), (wx - 8, wy + 50), (wx - 11, wy + 80)],
         flowers=fl, density=0.7, flower_rate=0.2)
    vine(cv, rng, [(wx + ww_ + 8, 21), (wx + ww_ + 10, wy + 30), (wx + ww_ + 9, wy + 60)],
         flowers=fl, density=0.7, flower_rate=0.2)
    vine(cv, rng, [(wx - 6, wy - 8), (wx + 60, wy - 9), (wx + 140, wy - 8), (wx + ww_ + 6, wy - 9)],
         flowers=fl, density=0.65, flower_rate=0.2)
    # moss + tiny flowers sprouting where the wainscot meets the floor
    for _ in range(60):
        mx = rng.randint(0, 1440)
        my = BASE[0] - rng.randint(0, 2)
        cv.px(mx, my, 'leaf2')
        cv.px(mx + 1, my, 'leaf3')
        cv.px(mx, my - 1, 'leaf3')
        if rng.random() < 0.3:
            flower(cv, mx + 1, my - 3, rng.choice(('paper4', 'pink3', 'purp3')), 'gold3')
            cv.vline(mx + 1, my - 2, my, 'leaf2')
    return cv
