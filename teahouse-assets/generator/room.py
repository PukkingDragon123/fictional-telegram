"""The teahouse shell (v3): four rooms side by side in one 2560x360
panorama, each one a box seen in one-point perspective.

  1 cook room          x    0 -  640
  2 seating + window   x  640 - 1280
  3 tea ritual         x 1280 - 1920
  4 traveler bedroom   x 1920 - 2560

Per room: an inset back wall, a timber roof whose rafters run to the
vanishing point, a girder along the top of each wall, two side walls and
a plank floor in perspective. Windows are cut through a thick wall, so
their reveals show. The look is kept simple: flat tones and clean seams,
few specks. A dark post in the foreground (see posts()) hides the seam
between two rooms."""
import math
import random
import numpy as np
from pixel import Canvas, PAL, step, blob_mask
from shapes import chip, crack, cobweb, vine, flower, torn_paper
from layout import (W, H, SW, SH, EYE_Y, BX, CEIL_Y, WALL_TOP, RAIL, WAINS, BASE, FLOOR, F_DEPTH,
                    POSTS, POST_W, WIN_MAIN, WIN_ROUND, WALL_T, HEARTH, vp)

BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
HALF = SW / 2 - BX                 # half-width of the back wall
RAFTER = 34                        # rafter spacing on the ceiling (back-wall px)


def _c(name):
    return np.array(PAL[name], np.uint8)


def _hash(*a):
    h = 2166136261
    for v in a:
        h = ((h ^ (int(v) & 0xffffffff)) * 16777619) & 0xffffffff
    return h


def _hash_arr(a, salt=0):
    a = a.astype(np.int64) * 73856093 + salt * 19349663
    a ^= a >> 13
    a *= 1274126177
    a ^= a >> 16
    return a & 0xffff


# ---------------------------------------------------------------- perspective maps
def maps():
    """Per-pixel surface of one room (room-local coords): which plane the
    eye ray hits first, its depth k and coordinates on that plane."""
    X = np.broadcast_to(np.arange(SW)[None, :] + 0.5 - SW / 2, (SH, SW))
    Y = np.broadcast_to(np.arange(SH)[:, None] + 0.5 - EYE_Y, (SH, SW))
    kc = np.where(Y < 0, -Y / (EYE_Y - CEIL_Y), 0.0)
    ks = np.abs(X) / HALF
    kf = np.where(Y > 0, Y / (FLOOR - EYE_Y), 0.0)
    st = np.stack([np.ones((SH, SW)), kc, ks, kf])
    lab = st.argmax(0)                      # 0 back, 1 ceiling, 2 side wall, 3 floor
    k = st.max(0)
    xb = SW / 2 + X / k
    yb = EYE_Y + Y / k
    D = F_DEPTH * (1 - 1 / k)
    return dict(lab=lab, k=k, left=X < 0, xb=xb, yb=yb, D=D)


def _edge_x(a):
    """True where a differs from its left neighbour."""
    e = np.zeros(a.shape, bool)
    e[:, 1:] = a[:, 1:] != a[:, :-1]
    return e


def _edge_y(a):
    e = np.zeros(a.shape, bool)
    e[1:, :] = a[1:, :] != a[:-1, :]
    return e


def _darken(img, mask, n=1):
    """Step palette colours down their ramps where mask is set."""
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys, xs):
        img[y, x] = step(tuple(img[y, x]), -n)


def _dither_mask(shape, t):
    """Ordered-dither mask for a fade amount t in 0..1 (array)."""
    yy, xx = np.indices(shape)
    b = np.array(BAYER4)[yy % 4, xx % 4] / 16.0
    return b < t


# ---------------------------------------------------------------- ceiling
def _ceiling(img, M, mask, rng, ri):
    xb, D = M['xb'], M['D']
    board = np.floor(D / 13).astype(int)
    img[mask] = _c('wood1')
    alt = mask & (_hash_arr(board, ri) % 9 == 0)
    img[alt] = _c('wood0')
    img[mask & _edge_y(board)] = _c('wood0')
    rel = np.mod(xb - BX + 4, RAFTER)
    raf = mask & (rel < 9) & (np.abs(xb - SW / 2) < HALF - 6)
    img[raf] = _c('wood2')
    side_w = 1.0 + 2.2 * np.abs(xb - SW / 2) / HALF        # inner side face widens off-centre
    inner = np.where(xb < SW / 2, rel > 9 - side_w, rel < side_w)
    img[raf & inner] = _c('wood1')
    outer_edge = raf & _edge_x(raf) & (xb >= SW / 2)
    img[outer_edge] = _c('wood3')
    left_lit = np.zeros_like(raf)
    left_lit[:, :-1] = raf[:, :-1] & ~raf[:, 1:]
    img[left_lit & (xb < SW / 2)] = _c('wood3')
    if ri == 3:                                           # bedroom roof: boards gone, light through the gap
        col_i = np.floor((xb - BX + 4) / RAFTER)
        relx = np.mod(xb - BX + 4, RAFTER)
        jag = (_hash_arr(board * 7 + col_i, 13) % 7).astype(float)        # broken board ends
        gap = mask & ~raf & (((col_i == 9) & (board >= 3) & (board <= 6)) | ((col_i == 3) & (board >= 8) & (board <= 9)))
        gap &= (relx > 10 + jag * 0.6) & (relx < 33 - jag * 0.8)
        img[gap] = _c('ink')
        sky = gap & (((col_i == 9) & (board == 4) & (relx > 16) & (relx < 25)) |
                     ((col_i == 9) & (board == 5) & (relx > 18) & (relx < 23)))
        img[sky] = _c('sky2')
        img[sky & _edge_y(sky)] = _c('sky4')
        img[gap & ~sky & _edge_x(gap)] = _c('wood2')
        crackr = raf & (col_i == 6) & (np.abs(np.mod(D, 40) - 20) < 0.8)
        img[crackr] = _c('ink')
    # soot / shade towards the back of the roof
    _darken(img, mask & (D < 10) & _dither_mask(D.shape, 1 - D / 10))


# ---------------------------------------------------------------- side walls
def _band(yb, bands):
    out = np.zeros(yb.shape, int)
    for i, b in enumerate(bands):
        out[yb >= b] = i + 1
    return out


def _side_walls(img, M, mask, rng, ri):
    yb, D, left = M['yb'], M['D'], M['left']
    band = _band(yb, [WALL_TOP, RAIL[0], RAIL[1], WAINS[1], BASE[1]])
    top = _edge_y(band)
    bot = np.zeros_like(top)
    bot[:-1] = band[:-1] != band[1:]
    # girder (1)
    g = mask & (band == 0)
    img[g] = _c('wood2')
    img[g & top] = _c('wood3')
    img[g & bot] = _c('wood0')
    up = mask & (band == 1)
    if ri == 3:                                       # bedroom: plaster with a post and the tie rail
        img[up] = _c('paper1')
        post = up & (D > 34) & (D < 44)
        img[post] = _c('wood1')
        img[post & _edge_x(post)] = _c('wood2')
        nag = up & (yb > 60) & (yb < 68)
        img[nag] = _c('wood2')
        img[nag & _edge_y(nag)] = _c('wood3')
        stain = up & (np.abs(D - 16 - 3 * np.sin(yb * 0.15)) < 5 + (yb - 68) * 0.03) & (yb > 68) & (yb < 190)
        img[stain & _dither_mask(D.shape, np.full(D.shape, 0.5))] = _c('paper0')
        lath = up & (D > 52) & (D < 76) & (yb > 120) & (yb < 160) & \
            (np.abs(D - 64) / 12 + np.abs(yb - 140) / 20 + 0.15 * np.sin(yb * 0.9 + D) < 1)
        img[lath] = _c('wood1')
        img[lath & (np.mod(yb, 5) < 2)] = _c('wood3')
        img[lath & _edge_x(lath)] = _c('paper4')
    elif ri == 0:
        lw, rw = up & left, up & ~left
        row = np.floor((yb - WALL_TOP) / 8).astype(int)       # brick behind the hearth corner
        brick = np.floor((D + (row % 2) * 9) / 18).astype(int)
        h = _hash_arr(brick * 131 + row, 3) % 4
        cols = [_c('red1'), _c('red2'), _c('copper1'), _c('red1')]
        for i in range(4):
            img[lw & (h == i)] = cols[i]
        mortar = lw & (_edge_y(row) | _edge_x(brick))
        img[mortar] = _c('stone1')
        _planks(img, rw, D, ri)
    else:
        _planks(img, up, D, ri)
    rail = mask & (band == 2)
    img[rail] = _c('jade1')
    img[rail & top] = _c('jade3')
    img[rail & bot] = _c('wood0')
    wain = mask & (band == 3)
    img[wain] = _c('wood1')
    row = np.floor((yb - WAINS[0]) / ((WAINS[1] - WAINS[0]) / 3)).astype(int)
    joint = np.floor((D + row * 37) / 80).astype(int)
    img[wain & (_edge_y(row) | top)] = _c('wood2')
    img[wain & _edge_x(joint)] = _c('wood0')
    base = mask & (band >= 4)
    img[base] = _c('wood0')
    img[base & top] = _c('wood1')
    if ri == 3:
        img[rail | wain] = _c('paper1')
        img[(rail | wain) & top & (band == 2)] = _c('paper1')
    # corner shade and the darker front edge
    _darken(img, mask & (D < 8) & _dither_mask(D.shape, 1 - D / 8))
    far = np.clip((D - 60) / 30, 0, 1)
    _darken(img, mask & (D > 60) & _dither_mask(D.shape, far))


def _planks(img, m, D, ri):
    plank = np.floor((D + 5 + ri * 7) / 16).astype(int)
    h = _hash_arr(plank, 11 + ri) % 10
    img[m] = _c('red1')
    img[m & (h < 3)] = _c('red2')
    seam = m & _edge_x(plank)
    img[seam] = _c('red0')


# ---------------------------------------------------------------- floor
def _floor(img, M, mask, rng, ri):
    xb, D = M['xb'], M['D']
    j = np.floor((xb - 6) / 22).astype(int)
    off = (_hash_arr(j, 5 + ri) % 96).astype(float)
    seg = np.floor((D + off) / 96).astype(int)
    h = _hash_arr(j, 9 + ri) % 10                      # one tone per board, low contrast
    hs = _hash_arr(j * 977 + seg, 4 + ri) % 14
    img[mask] = _c('wood2')
    img[mask & ((h < 3) | (hs == 0))] = _c('wood3')
    ej = _edge_x(j)
    img[mask & ej] = _c('wood0')
    es = _edge_y(seg)
    img[mask & es & ~ej] = _c('wood0')
    lip = np.zeros_like(es)
    lip[1:] = es[:-1]
    img[mask & lip & ~ej] = _c('wood3')
    # a few long grain streaks along the boards
    streak = mask & (np.abs(np.mod(xb - 6, 22) - (5 + _hash_arr(j, 77) % 12)) < 0.5 / M['k']) & \
        (np.mod(D + off * 1.7, 61) < 26)
    img[streak] = _c('wood1')
    if ri == 3:                                           # bedroom: broken and missing boards, a dark stain
        hole = mask & (((j == 16) & (seg == 1)) | ((j == 9) & (seg == 2)) | ((j == 21) & (seg == 0)))
        frac = np.mod(D + off, 96) / 96
        hole &= (frac > 0.25) & (frac < 0.62 + 0.08 * np.sin(xb * 0.7))
        img[hole] = _c('ink')
        img[hole & _edge_y(hole)] = _c('wood4')
        split = mask & ~hole & (np.abs(np.mod(xb - 6, 22) - 11 - 2 * np.sin(D * 0.08)) < 0.45 / M['k']) & \
            (_hash_arr(j, 31) % 3 == 0)
        img[split] = _c('wood0')
        sd = ((xb - 250) / 70) ** 2 + ((D - 120) / 60) ** 2 + 0.15 * np.sin(xb * 0.2 + D * 0.1)
        _darken(img, mask & ~hole & ((sd < 0.6) | ((sd < 1) & _dither_mask(D.shape, np.full(D.shape, 0.4)))))
    near_back = mask & (D < 6)
    _darken(img, near_back & _dither_mask(D.shape, 1 - D / 6))
    near_side = mask & (np.abs(xb - SW / 2) > HALF - 8)
    _darken(img, near_side & _dither_mask(D.shape, (np.abs(xb - SW / 2) - HALF + 8) / 8))


# ---------------------------------------------------------------- back walls
def _plank_wall(cv, rng, x0, x1, y0, y1):
    x = x0
    while x < x1:
        pw = min(rng.choice((15, 16, 17, 18, 20)), x1 - x)
        base = 'red2' if rng.random() < 0.78 else 'red1'
        cv.rect(x, y0, pw, y1 - y0, base)
        if rng.random() < 0.3:                       # sun-faded from the top
            fade = rng.randint(y0 + 30, y0 + 90)
            lite = step(PAL[base], 1)
            cv.rect(x, y0, pw, fade - y0 - 4, lite)
            for yy in range(fade - 4, fade + 4):
                for xx in range(x, x + pw):
                    if BAYER4[yy % 4][xx % 4] / 16 > (yy - fade + 4) / 8:
                        cv.px(xx, yy, lite)
        for _ in range(max(1, pw // 8) if pw > 7 else 0):   # a few long grain lines
            gx = x + rng.randint(3, pw - 3)
            gy = y0 + rng.randint(0, 40)
            while gy < y1:
                ln = rng.randint(14, 40)
                cv.vline(gx, gy, min(y1 - 1, gy + ln), step(PAL[base], -1))
                gy += ln + rng.randint(20, 60)
        cv.vline(x, y0, y1 - 1, 'red0')
        cv.vline(x + 1, y0, y1 - 1, step(PAL[base], 1))
        for ny in (y0 + 8, y1 - 8):
            cv.px(x + pw // 2, ny, 'wood0')
        if rng.random() < 0.14:
            ph = rng.randint(10, 24)
            chip(cv, x + rng.randint(2, max(2, pw - 8)), rng.randint(y0 + 10, y1 - ph - 4), rng.randint(5, 8), ph,
                 rng, under='wood3', under_dark='wood1', n=3, rmin=1.4, rmax=2.6, elong=2.6)
        x += pw


def _brick(cv, rng, x0, x1, y0, y1):
    bw, bh = 18, 8
    for r, yy in enumerate(range(y0, y1, bh)):
        off = (r % 2) * (bw // 2)
        for xx in range(x0 - off, x1, bw):
            c = rng.choice(('red1', 'red2', 'red2', 'copper1'))
            xa, xb = max(x0, xx), min(x1, xx + bw - 1)
            if xb <= xa:
                continue
            cv.rect(xa, yy, xb - xa, min(bh - 1, y1 - yy), c)
            cv.hline(xa, xb - 1, yy, step(PAL[c], 1))
            if yy + bh - 1 < y1:
                cv.hline(xa, xb, yy + bh - 1, 'stone1')
            cv.vline(xb, yy, min(y1, yy + bh) - 1, 'stone1')
    cx = (x0 + x1) / 2                               # soot plume above the hearth
    for yy in range(y0, y1):
        t = (yy - y0) / (y1 - y0)                    # 0 at the top
        half = (x1 - x0) * (0.18 + 0.22 * t)
        for xx in range(x0, x1):
            d = abs(xx - cx) / half
            if d < 0.75 or (d < 1.0 and BAYER4[yy % 4][xx % 4] / 16 < (1.0 - d) * 4):
                cv.shift(xx, yy, -1)


def _rail_wains_base(cv, rng, x0, x1, ri):
    y0, y1 = RAIL
    cv.rect(x0, y0, x1 - x0, y1 - y0, 'jade2')
    cv.hline(x0, x1 - 1, y0, 'jade4'); cv.hline(x0, x1 - 1, y0 + 1, 'jade3')
    cv.hline(x0, x1 - 1, y1 - 1, 'jade0'); cv.hline(x0, x1 - 1, y1, 'wood0')
    for _ in range((x1 - x0) // 120):
        chip(cv, rng.randint(x0, x1 - 16), y0 + 1, rng.randint(6, 14), y1 - y0 - 2, rng, under='wood2',
             under_dark='wood0', n=2, elong=0.6)
    y0, y1 = WAINS
    hh = (y1 - y0) // 3
    for i, (yy, h_) in enumerate([(y0, hh), (y0 + hh, hh), (y0 + 2 * hh, y1 - y0 - 2 * hh)]):
        cv.rect(x0, yy, x1 - x0, h_, 'wood2')
        cv.hline(x0, x1 - 1, yy, 'wood3')
        cv.hline(x0, x1 - 1, yy + h_ - 1, 'wood0')
        x = x0 - rng.randint(0, 60)
        while x < x1:
            if x > x0:
                cv.vline(x, yy, yy + h_ - 1, 'wood0'); cv.vline(x + 1, yy + 1, yy + h_ - 2, 'wood3')
            gy = yy + rng.randint(3, h_ - 4)
            cv.hline(max(x0, x + 8), min(x1 - 1, x + rng.randint(30, 70)), gy, 'wood1')
            x += rng.randint(70, 150)
    y0, y1 = BASE
    cv.rect(x0, y0, x1 - x0, y1 - y0, 'wood1')
    cv.hline(x0, x1 - 1, y0, 'wood3'); cv.hline(x0, x1 - 1, y1 - 1, 'wood0')


def _fallen_patch(cv, rng, x, y, w, h):
    """Plaster fallen away: mud backing and the bamboo lath grid behind,
    with a ragged, lit broken edge and loose flakes."""
    m = blob_mask(rng, w, h, n=7, rmin=min(w, h) * 0.18, rmax=min(w, h) * 0.42)
    for yy in range(h):
        for xx in range(w):
            if not m[yy, xx]:
                continue
            X, Y = x + xx, y + yy
            mud = 'paper0' if (X * 3 + Y * 5) % 11 else 'wood1'
            c = mud
            if (Y % 6) in (0, 1):
                c = 'wood3' if Y % 6 == 0 else 'wood2'                 # horizontal lath
            if (X % 9) == 0 and (Y % 6) > 1:
                c = 'wood1'                                         # vertical lath ties
            if (Y % 6) == 2 and (X % 9) != 0:
                c = 'wood0'
            cv.px(X, Y, c)
    for yy in range(h):
        for xx in range(w):
            if m[yy, xx]:
                continue
            up = yy + 1 < h and m[yy + 1, xx]
            left = xx + 1 < w and m[yy, xx + 1]
            down = yy > 0 and m[yy - 1, xx]
            right = xx > 0 and m[yy, xx - 1]
            if up or left:
                cv.px(x + xx, y + yy, 'paper4')                     # broken edge catching light
            elif down or right:
                cv.px(x + xx, y + yy, 'paper1')
    for _ in range(4):
        fx, fy = x + rng.randint(0, w), y + h + rng.randint(2, 10)
        cv.px(fx, fy, 'paper3'); cv.px(fx + 1, fy, 'paper1')


def _streak(cv, rng, x, y0, length):
    """Rain water that has run down from the roof, with a tide line."""
    off = 0.0
    w = rng.randint(5, 9)
    for k in range(length):
        off += rng.uniform(-0.35, 0.35)
        ww = w if k < length * 0.7 else max(1, int(w * (1 - (k - length * 0.7) / (length * 0.3))))
        for d in range(ww):
            if (d + k) % 2 == 0 or d in (0, ww - 1):
                cv.shift(int(x + off) + d, y0 + k, -1)
        cv.px(int(x + off) - 1, y0 + k, 'paper0')
    cv.hline(int(x + off) - 1, int(x + off) + 2, y0 + length, 'paper0')


def _mould(cv, rng, x, y, w, h):
    for _ in range(w * h // 9):
        mx, my = x + rng.randint(0, w), y + rng.randint(0, h)
        cv.px(mx, my, rng.choice(('leaf0', 'stone1', 'leaf1')))
        if rng.random() < 0.4:
            cv.px(mx + 1, my, 'leaf0')


def _plaster(cv, rng, x0, x1):
    y0, y1 = WALL_TOP, BASE[0]
    cv.rect(x0, y0, x1 - x0, y1 - y0, 'paper2')
    for _ in range((x1 - x0) * (y1 - y0) // 1600):
        bx, by = rng.randint(x0, x1 - 16), rng.randint(y0 + 12, y1 - 50)
        m = blob_mask(rng, 16, 10, n=3, rmin=1.5, rmax=3.8)
        ys, xs = np.nonzero(m)
        for yy, xx in zip(ys, xs):
            cv.px(bx + xx, by + yy, 'paper3')
    cv.rect(x0, y1 - 10, x1 - x0, 10, 'paper1')
    for yy in range(y1 - 26, y1 - 10):
        for xx in range(x0, x1):
            if BAYER4[yy % 4][xx % 4] / 16 < (yy - y1 + 26) / 16:
                cv.px(xx, yy, 'paper1')
    for _ in range(7):
        crack(cv, rng, rng.randint(x0 + 10, x1 - 10), rng.randint(y0 + 14, y1 - 50), rng.randint(10, 28),
              'paper0', 'paper3', dirx=rng.uniform(-0.6, 0.6), branch=0.06)
    for px_ in (x0 + 4, (x0 + x1) // 2, x1 - 5):           # posts
        cv.rect(px_ - 4, y0, 9, y1 - y0, 'wood1')
        cv.vline(px_ - 4, y0, y1 - 1, 'wood2'); cv.vline(px_ + 4, y0, y1 - 1, 'wood0')
    for (sx, ln) in ((x0 + 60, 120), (x0 + 236, 70), (x0 + 400, 140), (x0 + 520, 90)):
        _streak(cv, rng, sx, y0 + 16, ln)
    for (px_, py_, pw, ph) in ((x0 + 412, 84, 74, 50), (x0 + 30, 74, 34, 46), (x0 + 448, 150, 46, 30),
                               (x0 + 300, 186, 40, 24)):
        _fallen_patch(cv, rng, px_, py_, pw, ph)
    _mould(cv, rng, x0 + 8, y1 - 34, 70, 30)
    _mould(cv, rng, x1 - 90, y1 - 30, 80, 26)
    _mould(cv, rng, x0 + 250, y0 + 12, 40, 14)
    for _ in range(6):
        crack(cv, rng, rng.randint(x0 + 20, x1 - 20), rng.randint(y0 + 20, y1 - 60), rng.randint(20, 44),
              'paper0', 'paper3', dirx=rng.uniform(-0.7, 0.7), branch=0.12)
    ry = 60                                              # tie rail (nageshi)
    cv.rect(x0, ry, x1 - x0, 8, 'wood2')
    cv.hline(x0, x1 - 1, ry, 'wood3'); cv.hline(x0, x1 - 1, ry + 7, 'wood0'); cv.hline(x0, x1 - 1, ry + 8, 'paper1')
    y0, y1 = BASE
    cv.rect(x0, y0, x1 - x0, y1 - y0, 'wood1')
    cv.hline(x0, x1 - 1, y0, 'wood3'); cv.hline(x0, x1 - 1, y1 - 1, 'wood0')


def _girder(cv, x0, x1):
    """Beam along the top of the back wall that the rafters rest on."""
    y0, y1 = CEIL_Y, WALL_TOP
    cv.rect(x0, y0, x1 - x0, y1 - y0, 'wood2')
    cv.hline(x0, x1 - 1, y0, 'wood3')
    cv.hline(x0, x1 - 1, y1 - 2, 'wood1'); cv.hline(x0, x1 - 1, y1 - 1, 'wood0')
    for xx in range(x0 + 20, x1 - 10, 46):
        cv.hline(xx, xx + 18, y0 + 4 + (xx // 46) % 4, 'wood1')
    for yy in range(y1, y1 + 4):                        # shade under the girder
        for xx in range(x0, x1):
            if yy < y1 + 2 or (xx + yy) % 2 == 0:
                cv.shift(xx, yy, -1)


def _corner_post(cv, x, inner):
    """Post standing in a back corner; inner = +1 if the room lies to its right."""
    for k in range(-3, 4):
        c = 'wood1' if k * inner < -1 else ('wood2' if k * inner < 2 else 'wood3')
        cv.vline(x + k, CEIL_Y, FLOOR, c)
    cv.vline(x - 4 * inner, CEIL_Y, FLOOR, 'wood0')


# ---------------------------------------------------------------- windows
def _reveal(cv, near, far, ri, lit='wood3', shade='wood1', top='wood1', sill='wood4'):
    """Cut an opening (near mask) through a wall of thickness WALL_T: the far
    edge of the hole is the near shape pulled towards the vanishing point.
    near/far are boolean (H, W) arrays over the panorama."""
    through = near & far
    rev = near & ~far
    vx, vy = vp(ri)
    ys, xs = np.nonzero(rev)
    for y, x in zip(ys, xs):
        dx, dy = x + 0.5 - vx, y + 0.5 - vy
        # which jamb: compare with where the far edge lies
        if abs(dx) * 0.6 > abs(dy) * 1.4:
            c = lit if dx < 0 else shade
        else:
            c = top if dy < 0 else sill
        cv.px(x, y, c)
    cv.a[through] = 0
    return through


def _scaled_rect(r, ri, kf):
    vx, vy = vp(ri)
    x0 = vx + (r[0] - vx) * kf
    y0 = vy + (r[1] - vy) * kf
    x1 = vx + (r[0] + r[2] - vx) * kf
    y1 = vy + (r[1] + r[3] - vy) * kf
    return x0, y0, x1, y1


def _main_window(cv, rng):
    w = WIN_MAIN
    x0, y0, ww, hh = w['x'], w['y'], w['w'], w['h']
    ri = 1
    kf = 1 - WALL_T
    yy, xx = np.indices((H, W))
    near = (xx >= x0) & (xx < x0 + ww) & (yy >= y0) & (yy < y0 + hh)
    fx0, fy0, fx1, fy1 = _scaled_rect((x0, y0, ww, hh), ri, kf)
    far = (xx + 0.5 >= fx0) & (xx + 0.5 < fx1) & (yy + 0.5 >= fy0) & (yy + 0.5 < fy1)
    _reveal(cv, near, far, ri, lit='wood3', shade='wood1', top='wood0', sill='wood4')
    fx0, fy0, fx1, fy1 = int(round(fx0)), int(round(fy0)), int(round(fx1)), int(round(fy1))
    fw, fh = fx1 - fx0, fy1 - fy0
    # lacquer frame around the near opening
    f = 8
    ring = ['wood0', 'red1', 'red2', 'red3', 'red4', 'red3', 'red2', 'wood0']
    for i in range(f):
        cv.frame(x0 - f + i, y0 - f + i, ww + 2 * (f - i), hh + 2 * (f - i), ring[i])
    for _ in range(4):
        side = rng.choice('tb')
        chip(cv, rng.randint(x0, x0 + ww - 16), y0 - f + 1 if side == 't' else y0 + hh + 1,
             rng.randint(8, 14), 6, rng, under='wood2', under_dark='wood0', n=3, elong=0.6)
    # deep sill (its top shows: below eye level)
    sy = y0 + hh + f - 2
    cv.rect(x0 - f - 10, sy, ww + 2 * f + 20, 9, 'wood3')
    cv.hline(x0 - f - 10, x0 + ww + f + 9, sy, 'wood2')
    cv.rect(x0 - f - 10, sy + 1, ww + 2 * f + 20, 5, 'wood4')
    cv.hline(x0 - f - 10, x0 + ww + f + 9, sy + 6, 'wood5')
    cv.hline(x0 - f - 10, x0 + ww + f + 9, sy + 8, 'wood1')
    cv.hline(x0 - f - 8, x0 + ww + f + 7, sy + 9, 'wood0')
    for bx in (x0 + 16, x0 + ww // 2, x0 + ww - 20):
        for k in range(8):
            cv.hline(bx, bx + max(1, 6 - k // 2), sy + 9 + k, 'wood2')
            cv.px(bx, sy + 9 + k, 'wood3')
    # lattice sits in the far plane: 4 sashes, a small-pane transom
    tr = fy0 + 36
    cols = [fx0 + fw * k // 4 for k in range(1, 4)]
    for cx in cols:
        cv.rect(cx - 3, fy0, 6, fh, 'wood2')
        cv.vline(cx - 3, fy0, fy1 - 1, 'wood3'); cv.vline(cx + 2, fy0, fy1 - 1, 'wood0')
    cv.rect(fx0, tr - 3, fw, 6, 'wood2')
    cv.hline(fx0, fx1 - 1, tr - 3, 'wood4'); cv.hline(fx0, fx1 - 1, tr + 2, 'wood0')
    for k in range(1, 16):
        mx = fx0 + fw * k // 16
        if any(abs(mx - c) < 5 for c in cols):
            continue
        cv.vline(mx, fy0, tr - 4, 'wood1'); cv.vline(mx + 1, fy0, tr - 4, 'wood3')
    cv.hline(fx0, fx1 - 1, fy0 + 18, 'wood1'); cv.hline(fx0, fx1 - 1, fy0 + 19, 'wood3')
    for k in range(4):
        px0, px1 = fx0 + fw * k // 4 + 3, fx0 + fw * (k + 1) // 4 - 4
        cv.hline(px0, px1, fy0 + 86, 'wood1'); cv.hline(px0, px1, fy0 + 87, 'wood3')
    # cracked pane and a pane patched with paper and tape
    ccx, ccy = fx0 + 200, fy0 + 60
    for a in (0.3, 1.2, 2.2, 3.3, 4.4, 5.4):
        px_, py_ = ccx, ccy
        for k in range(rng.randint(10, 18)):
            px_ += math.cos(a) + rng.uniform(-0.4, 0.4)
            py_ += math.sin(a) + rng.uniform(-0.4, 0.4)
            if not cv.opaque(int(px_), int(py_)):
                cv.px(int(px_), int(py_), 'sky4' if k % 3 else 'white')
    patch = torn_paper(random.Random(77), 36, 28, lines=False, curl=False, holes=False)
    cv.blit(patch, fx0 + 18, fy0 + 96)
    for (tx, ty) in ((fx0 + 15, fy0 + 95), (fx0 + 48, fy0 + 118)):
        cv.rect(tx, ty, 8, 4, 'paper4'); cv.hline(tx, tx + 7, ty + 3, 'paper2')


def _round_window(cv, rng):
    w = WIN_ROUND
    cx, cy, r = w['cx'], w['cy'], w['r']
    ri = 3
    kf = 1 - WALL_T
    vx, vy = vp(ri)
    fcx, fcy, fr = vx + (cx - vx) * kf, vy + (cy - vy) * kf, r * kf
    yy, xx = np.indices((H, W))
    d_near = np.hypot(xx + 0.5 - cx, yy + 0.5 - cy)
    near = d_near <= r
    far = np.hypot(xx + 0.5 - fcx, yy + 0.5 - fcy) <= fr
    rev = near & ~far
    ys, xs = np.nonzero(rev)
    for y, x in zip(ys, xs):
        ang = math.atan2(y + 0.5 - cy, x + 0.5 - cx)
        cv.px(x, y, 'wood2' if math.cos(ang - 0.6) < 0 else 'wood1')
    cv.a[near & far] = 0
    # frame ring
    for y in range(cy - r - 12, cy + r + 13):
        for x in range(cx - r - 12, cx + r + 13):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            if r < d <= r + 9:
                ang = math.atan2(y + 0.5 - cy, x + 0.5 - cx)
                lit = math.cos(ang + 2.36)
                band = d - r
                if band < 1.4 or band > 7.8:
                    c = 'wood0'
                elif lit > 0.45:
                    c = 'wood4'
                elif lit < -0.45:
                    c = 'wood2'
                else:
                    c = 'wood3'
                if 4.2 < band < 5.0:
                    c = 'gold1' if lit > -0.2 else 'gold0'
                cv.px(x, y, c)
            elif r + 9 < d <= r + 11:
                cv.px(x, y, 'paper1')
    # bamboo lattice in the far plane
    fcx_i, fcy_i, fr_i = int(round(fcx)), int(round(fcy)), fr
    for gx in range(fcx_i - int(fr_i), fcx_i + int(fr_i) + 1, 24):
        for y in range(int(fcy - fr), int(fcy + fr) + 1):
            if math.hypot(gx + 0.5 - fcx, y + 0.5 - fcy) < fr:
                cv.px(gx, y, 'paper1')
                cv.px(gx + 1, y, 'paper2' if y % 11 else 'paper0')
    for gy in (fcy_i - 20, fcy_i + 20):
        for x in range(int(fcx - fr), int(fcx + fr) + 1):
            if math.hypot(x + 0.5 - fcx, gy + 0.5 - fcy) < fr:
                cv.px(x, gy, 'paper2' if x % 13 else 'paper0')
                cv.px(x, gy + 1, 'paper1')
    cv.line(fcx_i + 24, fcy_i - 20, fcx_i + 33, fcy_i + 4, 'paper1')     # one broken slat
    for k in range(5):
        cv.px(fcx_i + 24 + k, fcy_i + 20 + (k % 2), None)
        cv.px(fcx_i + 24 + k, fcy_i + 21, None)


# ---------------------------------------------------------------- simplify
def simplify(cv, passes=1):
    """Remove lone specks: a pixel unlike all four neighbours, three of which
    agree, takes their colour. Lines and edges survive."""
    a = cv.a
    for _ in range(passes):
        c = a.astype(np.int32)
        key = (c[:, :, 0] << 24) | (c[:, :, 1] << 16) | (c[:, :, 2] << 8) | c[:, :, 3]
        up = np.roll(key, 1, 0); dn = np.roll(key, -1, 0)
        lf = np.roll(key, 1, 1); rt = np.roll(key, -1, 1)
        diff = (key != up) & (key != dn) & (key != lf) & (key != rt)
        for nb, src in ((up, (1, 0)), (dn, (-1, 0)), (lf, (0, 1)), (rt, (0, -1))):
            agree = (nb == up).astype(int) + (nb == dn) + (nb == lf) + (nb == rt)
            fix = diff & (agree >= 3) & ((nb & 255) == 255) & ((key & 255) == 255)
            if fix.any():
                rolled = np.roll(a, src, (0, 1))
                a[fix] = rolled[fix]
                diff &= ~fix
        diff[0, :] = diff[-1, :] = False
    return cv


# ---------------------------------------------------------------- assembly
def build_shell(seed=7):
    rng = random.Random(seed)
    cv = Canvas(W, H)
    M = maps()
    for ri in range(4):
        ox = ri * SW
        img = np.zeros((SH, SW, 3), np.uint8)
        _ceiling(img, M, M['lab'] == 1, rng, ri)
        _side_walls(img, M, M['lab'] == 2, rng, ri)
        _floor(img, M, M['lab'] == 3, rng, ri)
        nb = M['lab'] != 0
        cv.a[:, ox:ox + SW, :3][nb] = img[nb]
        cv.a[:, ox:ox + SW, 3][nb] = 255
        bx0, bx1 = ox + BX, ox + SW - BX
        if ri < 3:
            _plank_wall(cv, rng, bx0, bx1, WALL_TOP, RAIL[0])
            if ri == 0:
                _brick(cv, rng, bx0, HEARTH['x1'] + 14, WALL_TOP, RAIL[0])
            _rail_wains_base(cv, rng, bx0, bx1, ri)
        else:
            _plaster(cv, rng, bx0, bx1)
        _girder(cv, bx0, bx1)
        _corner_post(cv, bx0, 1)
        _corner_post(cv, bx1 - 1, -1)
    # character: ghost of a frame, a punched hole, a few water stains
    gx, gy, gw, gh = 1640, 70, 30, 40
    for yy in range(gy, gy + gh):
        for xx in range(gx, gx + gw):
            if xx in (gx, gx + gw - 1) or yy in (gy, gy + gh - 1):
                cv.px(xx, yy, 'red3')
    cv.px(gx + gw // 2, gy - 8, 'wood0')
    cv.line(gx + gw // 2, gy - 8, gx + 3, gy, 'red1'); cv.line(gx + gw // 2, gy - 8, gx + gw - 4, gy, 'red1')
    hx, hy = 1196, 156
    for k in range(10):
        d = int(math.sin(math.pi * k / 10) * 5)
        cv.vline(hx + k, hy - d, hy + d, 'ink')
    for (sx, ln) in ((330, 60), (1460, 50)):
        for k in range(ln):
            w_ = 5 if k < ln * 0.6 else max(1, int(5 * (1 - (k - ln * 0.6) / (ln * 0.4))))
            for d in range(w_):
                if k < ln * 0.8 or (d + k) % 2 == 0:
                    cv.px(sx + d + int(math.sin(k * 0.3)), WALL_TOP + 2 + k, 'red1')
    _main_window(cv, rng)
    _round_window(cv, rng)
    for ri in range(4):
        ox = ri * SW
        bx0, bx1 = ox + BX, ox + SW - BX
        cobweb(cv, bx0 + 4, WALL_TOP, 18, 'stone3', 'stone2', 'tl')
        cobweb(cv, bx1 - 5, WALL_TOP, 14, 'stone3', 'stone2', 'tr')
    fl = [('paper4', 'gold3'), ('purp3', 'gold2'), ('pink3', 'gold3')]
    for ri in range(4):
        ox = ri * SW
        pts = [(ox + BX + 6, WALL_TOP + 2)] + [(ox + BX + 6 + k * 90 + (k * 37) % 20, WALL_TOP + 2 + (k % 2))
                                               for k in range(1, 6)] + [(ox + SW - BX - 6, WALL_TOP + 2)]
        vine(cv, rng, pts, flowers=fl, density=0.45, flower_rate=0.1)
        vine(cv, rng, [(ox + BX + 2, WALL_TOP + 2), (ox + BX + 1, 120), (ox + BX + 3, 170 - ri * 10)],
             flowers=fl, density=0.55)
    wx, wy, ww_ = WIN_MAIN['x'], WIN_MAIN['y'], WIN_MAIN['w']
    vine(cv, rng, [(wx - 10, WALL_TOP + 3), (wx - 11, wy + 30), (wx - 10, wy + 80)], flowers=fl, density=0.7,
         flower_rate=0.12)
    vine(cv, rng, [(wx + ww_ + 10, WALL_TOP + 3), (wx + ww_ + 11, wy + 50), (wx + ww_ + 10, wy + 100)],
         flowers=fl, density=0.7, flower_rate=0.12)
    for _ in range(50):                             # moss along the skirting
        ri = rng.randint(0, 2)
        mx = ri * SW + rng.randint(BX + 4, SW - BX - 4)
        my = BASE[0] - rng.randint(0, 1)
        cv.px(mx, my, 'leaf2'); cv.px(mx + 1, my, 'leaf3')
        if rng.random() < 0.25:
            cv.vline(mx + 1, my - 3, my, 'leaf2')
            flower(cv, mx + 1, my - 4, rng.choice(('paper4', 'purp3')), 'gold3')
    simplify(cv)
    return cv


# ---------------------------------------------------------------- foreground posts
def posts():
    """Full-height posts close to the camera, one on every room boundary.
    They are in shade (nearer than the lamps), with a brass band and a
    stone foot. Returns a transparent W x H canvas."""
    rng = random.Random(31)
    cv = Canvas(W, H)
    cols = ['ink', 'red0', 'red1', 'red1', 'red2', 'red2', 'red1', 'red1', 'red1', 'red0', 'red0', 'red0', 'red0',
            'red0', 'red0', 'red1', 'red1', 'red1', 'red0', 'red0', 'red0', 'wood0', 'wood0', 'red0', 'red0', 'ink']
    for px in POSTS:
        x0 = px - POST_W // 2
        for i in range(POST_W):
            cv.vline(x0 + i, 0, H - 1, cols[i])
        for _ in range(5):                                  # worn lacquer showing wood
            ph = rng.randint(10, 30)
            y = rng.randint(30, H - 80)
            xx = x0 + rng.randint(3, 10)
            for k in range(ph):
                cv.px(xx + (k // 9), y + k, 'wood1')
                if k % 3 == 0:
                    cv.px(xx + 1 + (k // 9), y + k, 'wood0')
        for by in (24, H - 64):
            cv.rect(x0 - 1, by, POST_W + 2, 7, 'gold0')
            cv.hline(x0 - 1, x0 + POST_W, by, 'gold2'); cv.hline(x0 - 1, x0 + POST_W, by + 1, 'gold1')
            cv.hline(x0 - 1, x0 + POST_W, by + 6, 'ink')
            for rx in range(x0 + 2, x0 + POST_W - 1, 5):
                cv.px(rx, by + 3, 'gold2')
            cv.px(x0 + 4, by + 5, 'teal1'); cv.px(x0 + 5, by + 5, 'teal2')
        cv.rect(x0 - 5, H - 14, POST_W + 10, 14, 'stone0')        # stone foot
        cv.hline(x0 - 5, x0 + POST_W + 4, H - 14, 'stone2')
        cv.hline(x0 - 4, x0 + POST_W + 3, H - 13, 'stone1')
        cv.px(x0 - 3, H - 12, 'leaf1'); cv.px(x0 - 2, H - 12, 'leaf2')
    return cv
