"""The teahouse shell (v2): one seamless 4-room panorama, 2560x360.

  1 cook room          x    0 -  640   (hearth with the fire spirit, recipe board)
  2 seating + window   x  640 - 1280
  3 tea ritual         x 1280 - 1920
  4 traveler bedroom   x 1920 - 2560
"""
import math
import random
import numpy as np
from pixel import Canvas, PAL, col, step, blob_mask, jag
from shapes import wood_grain_v, wood_grain_h, chip, crack, cobweb, vine, flower, torn_paper
from layout import (W, H, SW, CEIL, BEAM, WALL_TOP, RAIL, WAINS, BASE, FLOOR, PILLARS, PILLAR_W,
                    WIN_MAIN, WIN_ROUND, TABLE, COUNTER, HEARTH, EYE_Y)

BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def dither_seam(cv, y0, rows, upper, lower, x0=0, x1=None):
    x1 = cv.w if x1 is None else x1
    for r in range(rows):
        t = (r + 0.5) / rows
        for x in range(x0, x1):
            cv.px(x, y0 + r, lower if BAYER4[(y0 + r) % 4][x % 4] / 16 < t else upper)


def in_main_window(x, y, pad=0):
    w = WIN_MAIN
    return (w['x'] - pad <= x < w['x'] + w['w'] + pad) and (w['y'] - pad <= y < w['y'] + w['h'] + pad)


# ---------------------------------------------------------------- walls
def _red_plank_wall(cv, rng, x0, x1):
    y0, y1 = WALL_TOP, RAIL[0]
    x = x0
    while x < x1:
        pw = min(rng.choice((14, 16, 17, 18, 20, 22)), x1 - x)
        roll = rng.random()
        if roll < 0.05:      # bare replacement board
            wood_grain_v(cv, x, y0, pw, y1 - y0, 'wood3', rng, dark='wood2', light='wood4')
            cv.vline(x, y0, y1 - 1, 'wood0'); cv.vline(x + 1, y0, y1 - 1, 'wood4')
            cv.vline(x + pw - 1, y0, y1 - 1, 'wood1')
            for ny in (y0 + 6, (y0 + y1) // 2, y1 - 7):
                cv.px(x + pw // 2, ny, 'stone1'); cv.px(x + pw // 2 - 1, ny - 1, 'stone3')
            x += pw
            continue
        base = 'red1' if roll < 0.18 else 'red2'
        dark, lite = step(PAL[base], -1), step(PAL[base], 1)
        wood_grain_v(cv, x, y0, pw, y1 - y0, base, rng, dark=dark, light=lite, knots=True)
        if rng.random() < 0.45:      # sun-faded from the top
            fade_to = rng.randint(y0 + 30, y0 + 110)
            cv.rect(x, y0, pw, fade_to - y0 - 7, lite)
            dither_seam(cv, fade_to - 9, 12, lite, base, x, x + pw)
            for _ in range(4):
                gx = x + rng.randint(2, pw - 2)
                cv.vline(gx, y0 + rng.randint(0, 12), fade_to - rng.randint(5, 24), base)
        cv.vline(x, y0, y1 - 1, 'red0')
        cv.vline(x + 1, y0, y1 - 1, step(PAL[base], 1))
        cv.vline(x + pw - 1, y0, y1 - 1, dark)
        for ny in (y0 + 7, y1 - 8):
            cv.px(x + pw // 2, ny, 'wood0'); cv.px(x + pw // 2 - 1, ny - 1, 'stone2')
            if rng.random() < 0.45:
                cv.vline(x + pw // 2, ny + 1, ny + rng.randint(3, 9), 'red0')
        for _ in range(rng.choice((0, 0, 1, 1, 2))):
            ph = rng.randint(8, 26)
            pw2 = rng.randint(5, max(6, pw - 1))
            chip(cv, x + rng.randint(0, max(0, pw - pw2)), rng.randint(y0 + 6, y1 - ph - 2), pw2, ph, rng,
                 under='wood3', under_dark='wood1', n=rng.randint(2, 4), rmin=1.2, rmax=2.8,
                 elong=rng.uniform(1.8, 3.2))
        x += pw


def _water_stain(cv, rng, x, y, length, c='red1', c2='red0'):
    w = rng.randint(4, 9)
    off = jag(rng, length, 2)
    for k in range(length):
        taper = w if k < length * 0.6 else max(1, int(w * (1 - (k - length * 0.6) / (length * 0.4))))
        for d in range(taper):
            if (k < length * 0.8) or (x + off[k] + d + k) % 2 == 0:
                cv.px(x + off[k] + d, y + k, c)
        if k % 3 == 0:
            cv.px(x + off[k] + taper, y + k, c2)
    cv.hline(x + off[-1] - 1, x + off[-1] + 2, y + length, c2)


def _jade_rail(cv, rng, x0, x1):
    y0, y1 = RAIL
    cv.rect(x0, y0, x1 - x0, y1 - y0, 'jade2')
    cv.hline(x0, x1 - 1, y0, 'jade4'); cv.hline(x0, x1 - 1, y0 + 1, 'jade3')
    cv.hline(x0, x1 - 1, y1 - 1, 'jade0'); cv.hline(x0, x1 - 1, y1 - 2, 'jade1')
    x = x0
    while x < x1:
        x += rng.randint(16, 46)
        if rng.random() < 0.5:
            chip(cv, x, y0 + 1, rng.randint(5, 16), y1 - y0 - 2, rng, under='wood2', under_dark='wood0',
                 n=2, elong=0.6)
    cv.hline(x0, x1 - 1, y1, 'wood0')


def _wainscot(cv, rng, x0, x1):
    y0, y1 = WAINS
    hh = (y1 - y0) // 3
    rows = [(y0, hh), (y0 + hh, hh), (y0 + 2 * hh, y1 - y0 - 2 * hh)]
    for (yy, h_) in rows:
        x = x0 - rng.randint(0, 40)
        while x < x1:
            ln = min(rng.randint(60, 150), x1 - x)
            wood_grain_h(cv, max(x0, x), yy, ln - max(0, x0 - x), h_, 'wood2', rng, dark='wood1', light='wood3')
            cv.hline(max(x0, x), x + ln - 1, yy, 'wood3')
            cv.hline(max(x0, x), x + ln - 1, yy + h_ - 1, 'wood0')
            if x >= x0:
                cv.vline(x, yy, yy + h_ - 1, 'wood0')
                cv.vline(x + 1, yy + 1, yy + h_ - 2, 'wood3')
                cv.px(x + 4, yy + h_ // 2, 'stone1'); cv.px(x + ln - 5, yy + h_ // 2, 'stone1')
            if rng.random() < 0.12 and x >= x0:      # broken board end
                bw = rng.randint(5, 12)
                for k in range(bw):
                    depth = int((bw - k) * 0.9)
                    cv.vline(x + k, yy + h_ - 1 - depth, yy + h_ - 1, 'ink')
            x += ln
    for _ in range((x1 - x0) // 24):
        sx = rng.randint(x0, x1)
        cv.hline(sx, sx + rng.randint(2, 7), rng.randint(y1 - 12, y1 - 3), 'wood3')


def _baseboard(cv, x0, x1):
    y0, y1 = BASE
    cv.rect(x0, y0, x1 - x0, y1 - y0, 'wood1')
    cv.hline(x0, x1 - 1, y0, 'wood3'); cv.hline(x0, x1 - 1, y0 + 1, 'wood2')
    cv.hline(x0, x1 - 1, y1 - 1, 'wood0')


def _brick_backsplash(cv, rng, x0, x1, y0, y1):
    """Old fired-brick wall behind the hearth, blackened by soot above it."""
    bw, bh = 18, 8
    for r, yy in enumerate(range(y0, y1, bh)):
        off = (r % 2) * (bw // 2)
        for xx in range(x0 - off, x1, bw):
            c = rng.choice(('red1', 'red2', 'red2', 'red1', 'copper1'))
            xa, xb = max(x0, xx), min(x1, xx + bw - 1)
            if xb <= xa:
                continue
            cv.rect(xa, yy, xb - xa, bh - 1, c)
            cv.hline(xa, xb - 1, yy, step(PAL[c], 1))
            cv.vline(xb - 1, yy + 1, yy + bh - 2, step(PAL[c], -1))
            if rng.random() < 0.12:
                cv.px(xa + 1, yy + bh - 3, 'red0'); cv.px(xa + 2, yy + bh - 3, 'red0')
            cv.hline(xa, xb, yy + bh - 1, 'stone1')
            cv.vline(xb, yy, yy + bh - 1, 'stone1')
    # soot plume: two solid bands that narrow upwards, short dithered edges
    cx = (x0 + x1) / 2
    for yy in range(y0, y1):
        t = 1 - (yy - y0) / (y1 - y0)                 # 1 at the top
        for xx in range(x0, x1):
            d = abs(xx - cx) / ((x1 - x0) / 2)
            s1 = t * 1.2 - d * 0.5
            if s1 > 0.35 or (s1 > 0.3 and (xx + yy) % 2 == 0):
                cv.shift(xx, yy, -1)
            if s1 > 0.75 or (s1 > 0.7 and (xx + yy) % 2 == 0):
                cv.shift(xx, yy, -1)


def _plaster_wall(cv, rng, x0, x1):
    """Bedroom: cracked lime plaster between dark posts (shinkabe)."""
    y0, y1 = WALL_TOP, BASE[0]
    cv.rect(x0, y0, x1 - x0, y1 - y0, 'paper2')
    for _ in range((x1 - x0) * (y1 - y0) // 800):
        bx, by = rng.randint(x0, x1), rng.randint(y0, y1 - 40)
        m = blob_mask(rng, 16, 10, n=3, rmin=1.5, rmax=3.8)
        ys, xs = np.nonzero(m)
        c = rng.choice(('paper3', 'paper3', 'paper3', 'paper1'))
        for yy, xx in zip(ys, xs):
            cv.px(bx + xx, by + yy, c)
    for _ in range((x1 - x0) // 10):           # trowel marks
        tx, ty = rng.randint(x0, x1), rng.randint(y0 + 10, y1 - 50)
        for k in range(rng.randint(5, 11)):
            cv.px(tx + k, ty + (1 if 2 < k < 7 else 0), 'paper3')
    cv.rect(x0, y1 - 10, x1 - x0, 10, 'paper1')
    dither_seam(cv, y1 - 28, 18, 'paper2', 'paper1', x0, x1)
    for sx in (x0 + 230, x0 + 470):            # water stains with tide lines
        sw = rng.randint(22, 34)
        for yy in range(y0, y0 + rng.randint(70, 120)):
            span = int(sw * (1 - (yy - y0) / 140))
            off = int(3 * math.sin(yy * 0.2))
            for xx in range(sx - span // 2 + off, sx + span // 2 + off):
                if (xx + yy) % 2 == 0:
                    cv.px(xx, yy, 'paper1')
            cv.px(sx - span // 2 + off, yy, 'paper0'); cv.px(sx + span // 2 + off, yy, 'paper0')
    for _ in range(12):
        crack(cv, rng, rng.randint(x0 + 10, x1 - 10), rng.randint(y0 + 6, y1 - 50), rng.randint(10, 32),
              'paper0', 'paper3', dirx=rng.uniform(-0.6, 0.6), branch=0.08)
    # fallen patch exposing bamboo lath
    lx, ly = x0 + 560, 150
    m = blob_mask(rng, 34, 22, n=7, rmin=2, rmax=6)
    for yy in range(22):
        for xx in range(34):
            if m[yy, xx]:
                cv.px(lx + xx, ly + yy, 'wood0' if (ly + yy) % 4 == 0 else ('wood2' if (lx + xx) % 6 else 'wood1'))
                if (ly + yy) % 4 == 1:
                    cv.px(lx + xx, ly + yy, 'wood3')
            elif (yy + 1 < 22 and m[yy + 1, xx]) or (xx + 1 < 34 and m[yy, xx + 1]):
                cv.px(lx + xx, ly + yy, 'paper4')
            elif (yy - 1 >= 0 and m[yy - 1, xx]) or (xx - 1 >= 0 and m[yy, xx - 1]):
                cv.px(lx + xx, ly + yy, 'paper0')
    for px_ in (x0 + 9, x0 + 318, x1 - 10):   # posts
        wood_grain_v(cv, px_ - 4, y0, 9, y1 - y0, 'wood2', rng, dark='wood1', light='wood3', knots=False)
        cv.vline(px_ - 4, y0, y1 - 1, 'wood3'); cv.vline(px_ + 4, y0, y1 - 1, 'wood0')
        cv.vline(px_ + 5, y0, y1 - 1, 'paper1')
    ry = 52                                    # tie rail (nageshi)
    wood_grain_h(cv, x0, ry, x1 - x0, 8, 'wood2', rng, dark='wood1', light='wood3')
    cv.hline(x0, x1 - 1, ry, 'wood3'); cv.hline(x0, x1 - 1, ry + 7, 'wood0'); cv.hline(x0, x1 - 1, ry + 8, 'paper1')


# ---------------------------------------------------------------- ceiling
def _ceiling(cv, rng):
    cv.rect(0, 0, W, CEIL, 'wood0')
    x = 0
    while x < W:
        bw = rng.randint(24, 52)
        cv.rect(x, 0, bw, CEIL, 'wood1')
        cv.vline(x, 0, CEIL - 1, 'ink')
        cv.hline(x + 1, x + bw - 2, CEIL - 1, 'wood0')
        if rng.random() < 0.35:
            cv.hline(x + 2, x + bw - 4, rng.randint(1, CEIL - 3), 'wood2')
        if rng.random() < 0.1:                   # missing board: dark loft
            gw = rng.randint(5, 12)
            cv.rect(x + 3, 0, gw, CEIL - 3, 'ink')
            cv.hline(x + 3, x + 3 + gw, CEIL - 3, 'wood2')
        x += bw
    y0, y1 = BEAM
    front = y1 - 5                                # underside visible (above eye level)
    wood_grain_h(cv, 0, y0, W, front - y0, 'wood2', rng, dark='wood1', light='wood3')
    cv.hline(0, W - 1, y0, 'wood4'); cv.hline(0, W - 1, y0 + 1, 'wood3')
    cv.rect(0, front, W, y1 - front, 'wood1')
    cv.hline(0, W - 1, front, 'wood0')
    cv.hline(0, W - 1, y1 - 1, 'ink')
    for _ in range(24):
        sx, sy, ln = rng.randint(0, W), rng.randint(y0 + 3, front - 3), rng.randint(14, 60)
        for k in range(ln):
            cv.px(sx + k, sy + (1 if (k * 7) % 13 > 9 else 0), 'wood0')
            if k % 2 == 0:
                cv.px(sx + k, sy + 1, 'wood3')
    for rx in range(36, W, 64):                   # rafter ends with brass caps
        if any(abs(rx - p) < 26 for p in PILLARS):
            continue
        cv.rect(rx, 0, 10, CEIL, 'wood2')
        cv.vline(rx, 0, CEIL - 1, 'wood3'); cv.vline(rx + 9, 0, CEIL - 1, 'wood0')
        cv.rect(rx, CEIL - 4, 10, 4, 'gold1'); cv.hline(rx, rx + 9, CEIL - 4, 'gold2')
        cv.px(rx + 2, CEIL - 2, 'gold3'); cv.px(rx + 7, CEIL - 2, 'gold0')
    for yy in range(WALL_TOP, WALL_TOP + 9):      # occlusion under the beam
        t = (yy - WALL_TOP) / 9
        for xx in range(W):
            if t < 0.3 or ((xx + yy) % 2 == 0 and t < 0.6) or (xx % 4 == yy % 4 and t < 1):
                cv.shift(xx, yy, -1)


# ---------------------------------------------------------------- pillars
def _pillar(cv, rng, cx, y0=CEIL, y1=FLOOR + 2, w=PILLAR_W):
    x = cx - w // 2
    cols = ['red1', 'red4', 'red4', 'red5', 'red4', 'red3', 'red3', 'red3', 'red3', 'red3', 'red3', 'red3',
            'red2', 'red2', 'red2', 'red1', 'red1', 'red0']
    for i in range(w):
        cv.vline(x + i, y0, y1 - 1, cols[int(i * len(cols) / w)])
    for yy in range(y0, y1):
        if (yy * 13 + cx) % 41 < 3:
            cv.px(x + 8, yy, 'red1')
    for _ in range(9):
        ph = rng.randint(8, 28)
        chip(cv, x + rng.randint(2, 8), rng.randint(y0 + 24, y1 - ph - 18), rng.randint(5, 9), ph, rng,
             under='wood2', under_dark='wood0', n=3, elong=2.4)
    for yy in range(y1 - 18, y1):
        for xx in range(x + 1, x + w - 1):
            if (xx * 5 + yy * 3) % 7 < (yy - (y1 - 18)) * 0.35:
                cv.px(xx, yy, 'wood2' if (xx + yy) % 3 else 'wood1')
    for by in (y0 + 22, y1 - 26):                 # brass bands with rivets + verdigris
        cv.rect(x - 1, by, w + 2, 6, 'gold1')
        cv.hline(x - 1, x + w, by, 'gold3'); cv.hline(x - 1, x + w, by + 1, 'gold2')
        cv.hline(x - 1, x + w, by + 5, 'gold0')
        for rx in range(x + 1, x + w, 4):
            cv.px(rx, by + 3, 'gold3'); cv.px(rx, by + 4, 'gold0')
        cv.px(x + w - 3, by + 4, 'teal2'); cv.px(x + 2, by + 5, 'teal1'); cv.px(x + 3, by + 5, 'teal2')
    # bracket capital under the beam
    cv.rect(x - 6, BEAM[1], w + 12, 6, 'red2')
    cv.hline(x - 6, x + w + 5, BEAM[1], 'red4')
    cv.hline(x - 6, x + w + 5, BEAM[1] + 5, 'red0')
    cv.rect(x - 3, BEAM[1] + 6, w + 6, 4, 'gold1'); cv.hline(x - 3, x + w + 2, BEAM[1] + 6, 'gold3')
    # foundation stone at the floor
    sy = FLOOR - 4
    cv.ellipse(cx, sy + 6, w * 0.95, 6, 'stone2')
    cv.ellipse(cx - 2, sy + 4, w * 0.8, 3.5, 'stone3')
    cv.hline(cx - w + 4, cx + w - 4, sy + 11, 'stone0')
    cv.px(cx - 5, sy + 3, 'leaf2'); cv.px(cx - 4, sy + 3, 'leaf3'); cv.px(cx + 6, sy + 6, 'leaf2')
    cv.rect(x, y1 - 6, w, 3, 'wood1')


# ---------------------------------------------------------------- floor
def _floor(cv, rng):
    y = FLOOR
    rows = [6, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
    i = 0
    while y < H:
        hh = rows[min(i, len(rows) - 1)]
        x = -rng.randint(0, 80)
        while x < W:
            ln = rng.randint(80, 190)
            base = rng.choice(('wood2', 'wood2', 'wood3', 'wood2'))
            wood_grain_h(cv, x, y, ln, hh, base, rng, dark='wood1', light='wood3')
            cv.hline(x, x + ln - 1, y, step(PAL[base], 1))
            cv.hline(x, x + ln - 1, y + hh - 1, 'wood0')
            cv.vline(x, y, y + hh - 1, 'wood0')
            cv.vline(x + 1, y + 1, y + hh - 2, step(PAL[base], 1))
            cv.px(x + 4, y + hh // 2, 'wood0'); cv.px(x + ln - 5, y + hh // 2, 'wood0')
            if rng.random() < 0.08:                 # scuffed, sun-worn board
                for k in range(rng.randint(10, 30)):
                    cv.px(x + rng.randint(4, ln - 4), y + rng.randint(1, hh - 2), step(PAL[base], 1))
            x += ln
        y += hh
        i += 1
    for xx in range(W):                             # occlusion at the wall
        cv.shift(xx, FLOOR, -1); cv.shift(xx, FLOOR + 1, -1)
        if xx % 2 == 0:
            cv.shift(xx, FLOOR + 2, -1)
    hx, hy = 2180, FLOOR + 40                       # broken board hole
    for k in range(20):
        d = int(math.sin(math.pi * k / 20) * 5)
        cv.vline(hx + k, hy - d // 2, hy + d, 'ink')
    cv.hline(hx, hx + 19, hy - 4, 'wood4')


# ---------------------------------------------------------------- windows
def _main_window(cv, rng):
    w = WIN_MAIN
    x0, y0, ww, hh = w['x'], w['y'], w['w'], w['h']
    cv.rect(x0, y0, ww, hh, None)
    f = 9
    ring = ['wood0', 'wood1', 'red1', 'red2', 'red3', 'red4', 'red3', 'red2', 'wood1']
    for i in range(f):
        cv.frame(x0 - f + i, y0 - f + i, ww + 2 * (f - i), hh + 2 * (f - i), ring[i])
    cv.hline(x0 - f + 4, x0 + ww + f - 5, y0 - f + 4, 'red5')
    cv.vline(x0 - f + 4, y0 - f + 4, y0 + hh + f - 5, 'red5')
    for k in range(5):                              # reveal: thickness of the wall
        cv.vline(x0 + ww - 1 - k, y0, y0 + hh - 1, ['wood1', 'wood2', 'wood2', 'wood3', 'wood3'][k])
        cv.hline(x0, x0 + ww - 1, y0 + k, ['wood0', 'wood1', 'wood1', 'wood2', 'wood2'][k])
    for _ in range(8):
        side = rng.choice('tblr')
        if side in 'tb':
            chip(cv, rng.randint(x0, x0 + ww - 16), y0 - f + 1 if side == 't' else y0 + hh + 1,
                 rng.randint(8, 16), 7, rng, under='wood2', under_dark='wood0', n=3, elong=0.6)
        else:
            chip(cv, x0 - f + 1 if side == 'l' else x0 + ww + 1, rng.randint(y0, y0 + hh - 16), 7,
                 rng.randint(8, 16), rng, under='wood2', under_dark='wood0', n=3, elong=2)
    # deep sill (we look down on it a little: top face visible)
    sy = y0 + hh + f - 2
    cv.rect(x0 - f - 10, sy, ww + 2 * f + 20, 9, 'wood3')
    cv.hline(x0 - f - 10, x0 + ww + f + 9, sy, 'wood2')
    for yy in range(sy + 1, sy + 6):
        wood_grain_h(cv, x0 - f - 10, yy, ww + 2 * f + 20, 1, 'wood4', rng, dark='wood3', light='wood5', knots=False)
    cv.hline(x0 - f - 10, x0 + ww + f + 9, sy + 6, 'wood5')
    cv.hline(x0 - f - 10, x0 + ww + f + 9, sy + 8, 'wood1')
    cv.hline(x0 - f - 8, x0 + ww + f + 7, sy + 9, 'wood0')
    for bx in (x0 + 16, x0 + ww // 2, x0 + ww - 20):
        for k in range(9):
            cv.hline(bx, bx + max(1, 6 - k // 2), sy + 9 + k, 'wood2')
            cv.px(bx, sy + 9 + k, 'wood3')
    # lattice: 4 sliding sashes, small-pane transom, muntins
    tr = y0 + 40
    cols = [x0 + ww * k // 4 for k in range(1, 4)]
    for cx in cols:
        cv.rect(cx - 3, y0, 6, hh, 'wood2')
        cv.vline(cx - 3, y0, y0 + hh - 1, 'wood3'); cv.vline(cx + 2, y0, y0 + hh - 1, 'wood0')
        cv.vline(cx - 2, y0, y0 + hh - 1, 'wood4')
    cv.rect(x0, tr - 3, ww, 6, 'wood2')
    cv.hline(x0, x0 + ww - 1, tr - 3, 'wood4'); cv.hline(x0, x0 + ww - 1, tr + 2, 'wood0')
    for k in range(1, 20):
        mx = x0 + ww * k // 20
        if any(abs(mx - c) < 5 for c in cols):
            continue
        cv.vline(mx, y0 + 5, tr - 4, 'wood1'); cv.vline(mx + 1, y0 + 5, tr - 4, 'wood3')
    cv.hline(x0 + 5, x0 + ww - 1, y0 + 20, 'wood1'); cv.hline(x0 + 5, x0 + ww - 1, y0 + 21, 'wood3')
    for k in range(4):
        px0, px1 = x0 + ww * k // 4 + 3, x0 + ww * (k + 1) // 4 - 4
        cv.hline(px0, px1, y0 + 96, 'wood1'); cv.hline(px0, px1, y0 + 97, 'wood3')
    # grime in the pane corners
    for yy in range(y0 + 5, y0 + hh):
        for xx in range(x0, x0 + ww - 5):
            p = cv.get(xx, yy)
            if p[3]:
                continue
            near = 0
            for (dx, dy) in ((-2, 0), (2, 0), (0, 2), (0, -2)):
                if cv.get(xx + dx, yy + dy)[3]:
                    near += 1
            if near and (xx * 7 + yy * 3) % 5 == 0:
                cv.px(xx, yy, 'paper1')
    # cracked pane + broken pane patched with paper and tape
    ccx, ccy = x0 + 236, y0 + 66
    for a in (0.3, 1.2, 2.2, 3.3, 4.4, 5.4):
        xx, yy = ccx, ccy
        for k in range(rng.randint(10, 20)):
            xx += math.cos(a) + rng.uniform(-0.4, 0.4)
            yy += math.sin(a) + rng.uniform(-0.4, 0.4)
            cv.px(int(xx), int(yy), 'sky4' if k % 3 else 'white')
    patch = torn_paper(random.Random(77), 40, 30, lines=False, curl=False, holes=False)
    cv.blit(patch, x0 + 22, y0 + 108)
    for (tx, ty) in ((x0 + 19, y0 + 107), (x0 + 56, y0 + 132)):
        cv.rect(tx, ty, 8, 4, 'paper4'); cv.hline(tx, tx + 7, ty + 3, 'paper2')
    cobweb(cv, x0 + 5, y0 + 5, 16, 'cloud2', 'cloud1', 'tl')


def _round_window(cv, rng):
    w = WIN_ROUND
    cx, cy, r = w['cx'], w['cy'], w['r']
    for yy in range(cy - r - 12, cy + r + 13):
        for xx in range(cx - r - 12, cx + r + 13):
            d = math.hypot(xx + 0.5 - cx, yy + 0.5 - cy)
            if d <= r:
                cv.px(xx, yy, None)
            elif d <= r + 9:
                ang = math.atan2(yy + 0.5 - cy, xx + 0.5 - cx)
                lit = math.cos(ang + 2.36)
                band = d - r
                if band < 1.4 or band > 7.8:
                    c = 'wood0'
                elif lit > 0.45:
                    c = 'wood4' if band < 4 else 'wood3'
                elif lit < -0.45:
                    c = 'wood1' if band < 5 else 'wood2'
                else:
                    c = 'wood2' if band < 4 else 'wood3'
                if 4.2 < band < 5.0:
                    c = 'gold1' if lit > -0.2 else 'gold0'      # inlaid brass ring
                cv.px(xx, yy, c)
            elif d <= r + 12:
                cv.px(xx, yy, 'paper1')
    for gx in range(cx - r, cx + r + 1, 26):          # bamboo lattice
        for yy in range(cy - r, cy + r + 1):
            if math.hypot(gx + 0.5 - cx, yy + 0.5 - cy) < r:
                cv.px(gx, yy, 'paper1')
                cv.px(gx + 1, yy, 'paper2' if yy % 11 else 'paper0')
    for gy in (cy - 22, cy + 22):
        for xx in range(cx - r, cx + r + 1):
            if math.hypot(xx + 0.5 - cx, gy + 0.5 - cy) < r:
                cv.px(xx, gy, 'paper2' if xx % 13 else 'paper0')
                cv.px(xx, gy + 1, 'paper1')
    cv.line(cx + 26, cy - 22, cx + 36, cy + 4, 'paper1')
    cv.line(cx + 27, cy - 22, cx + 37, cy + 4, 'paper2')
    for k in range(5):
        cv.px(cx + 26 + k, cy + 22 + (k % 2), None)
        cv.px(cx + 26 + k, cy + 23, None)


# ---------------------------------------------------------------- assembly
def build_shell(seed=7):
    rng = random.Random(seed)
    cv = Canvas(W, H)
    _floor(cv, rng)
    _red_plank_wall(cv, rng, 0, 1920)
    _brick_backsplash(cv, rng, HEARTH['x0'] - 4, HEARTH['x1'] + 6, WALL_TOP, RAIL[0])
    for (sx, ln) in ((300, 70), (560, 50), (1210, 90), (1480, 60), (1760, 40)):
        _water_stain(cv, rng, sx, WALL_TOP + 3, ln)
    gx, gy, gw, gh = 1618, 54, 34, 44              # ghost of a frame that used to hang here
    for yy in range(gy, gy + gh):
        for xx in range(gx, gx + gw):
            if xx in (gx, gx + gw - 1) or yy in (gy, gy + gh - 1):
                cv.px(xx, yy, 'red3')
            elif (xx + yy) % 2 == 0:
                cv.shift(xx, yy, -1, only=('red',))
    cv.px(gx + gw // 2, gy - 8, 'wood0')
    cv.line(gx + gw // 2, gy - 8, gx + 3, gy, 'red1'); cv.line(gx + gw // 2, gy - 8, gx + gw - 4, gy, 'red1')
    hx, hy = 1250, 150                              # hole punched through a plank
    for k in range(11):
        d = int(math.sin(math.pi * k / 11) * 6)
        cv.vline(hx + k, hy - d, hy + d, 'ink')
    for (dx, dy) in ((-1, -2), (11, 1), (4, -7), (7, 6), (-1, 3)):
        cv.px(hx + dx, hy + dy, 'wood4')
    _jade_rail(cv, rng, 0, 1920)
    _wainscot(cv, rng, 0, 1920)
    _baseboard(cv, 0, 1920)
    _plaster_wall(cv, rng, 1920, W)
    _baseboard(cv, 1920, W)
    _ceiling(cv, rng)
    for p in PILLARS:                               # occlusion beside pillars
        for side in (-1, 1):
            for k in range(7):
                xx = p + side * (PILLAR_W // 2 + k)
                for yy in range(WALL_TOP, FLOOR):
                    if k < 2 or (k < 4 and (xx + yy) % 2 == 0) or (k < 7 and xx % 3 == 0 and yy % 2 == 0):
                        cv.shift(xx, yy, -1)
    _main_window(cv, rng)
    _round_window(cv, rng)
    for p in PILLARS:
        _pillar(cv, rng, p)
    cobweb(cv, 10, WALL_TOP, 20, 'stone3', 'stone2', 'tl')
    cobweb(cv, 1910, WALL_TOP, 18, 'stone3', 'stone2', 'tr')
    cobweb(cv, 1930, WALL_TOP, 24, 'paper4', 'paper1', 'tl')
    cobweb(cv, 2542, WALL_TOP, 26, 'paper4', 'paper1', 'tr')
    cobweb(cv, 1270, WALL_TOP, 16, 'stone3', 'stone2', 'tr')
    fl = [('paper4', 'gold3'), ('purp3', 'gold2'), ('pink3', 'gold3')]
    vine(cv, rng, [(0, 38), (160, 40), (340, 39), (520, 41), (640, 39), (800, 40), (1000, 39), (1280, 41),
                   (1460, 39), (1700, 40), (1920, 39), (2100, 40), (2260, 39)],
         flowers=fl, density=0.6, flower_rate=0.1)
    for (px_, y1) in ((640, 250), (1280, 150), (1920, 120)):
        vine(cv, rng, [(px_, 40), (px_ - 4, (40 + y1) // 2), (px_ + 3, y1)], flowers=fl, density=0.65)
    wx, wy, ww_, wh_ = WIN_MAIN['x'], WIN_MAIN['y'], WIN_MAIN['w'], WIN_MAIN['h']
    vine(cv, rng, [(wx - 12, 39), (wx - 13, wy + 20), (wx - 11, wy + 70), (wx - 14, wy + 110)],
         flowers=fl, density=0.75, flower_rate=0.12)
    vine(cv, rng, [(wx + ww_ + 11, 39), (wx + ww_ + 13, wy + 40), (wx + ww_ + 12, wy + 90)],
         flowers=fl, density=0.75, flower_rate=0.12)
    vine(cv, rng, [(wx - 8, wy - 11), (wx + 120, wy - 12), (wx + 260, wy - 11), (wx + ww_ + 8, wy - 12)],
         flowers=fl, density=0.7, flower_rate=0.12)
    for _ in range(80):                             # moss + sprouts along the skirting
        mx = rng.randint(0, 1920)
        my = BASE[0] - rng.randint(0, 2)
        cv.px(mx, my, 'leaf2'); cv.px(mx + 1, my, 'leaf3'); cv.px(mx, my - 1, 'leaf3')
        if rng.random() < 0.25:
            cv.vline(mx + 1, my - 3, my, 'leaf2')
            flower(cv, mx + 1, my - 4, rng.choice(('paper4', 'purp3')), 'gold3')
    return cv
