"""The Copper Sky room: a teahouse room built the same way as the four in the
pack - a box in one-point perspective, rafters, lacquered plank walls, jade
rail, wainscot, plank floor, a counter across the front - but it stands high
over the city, and one wide window fills the back wall.

  10_shell         the room, with the window cut through it (transparent)
  11_glass         faint reflections on the panes (alpha)
  12_pipes_cables  copper pipes along the walls, cables draped over the rafters,
                   a fuse box; a little steam escaping from a valve (frames)
  13_lanterns      two paper lanterns on cords in front of the window (frames)
  14_spider        the copper spider on its cable from the rafters (frames)
  20_counter       the counter
  21_counter_props a copper samovar with a teapot on its crown, a cup of tea,
                   an oil lamp; steam and the flame move (frames)
  30_foreground    the dark posts at the edges
  40_light         the night: the room sunk in shadow, warm pools round the
                   lanterns, the lamp and the samovar, the city's glow and
                   the moon coming in through the window (frames)"""
import math
import random
import numpy as np
import cy_pal  # noqa: F401
import moss
import woodgrain as WG
from pixel import Canvas, PAL, step, text
from shade import lathe_shade
from shapes import cobweb, chip
from layout import SW, SH, EYE_Y, BX, CEIL_Y, WALL_TOP, RAIL, WAINS, BASE, FLOOR, FURN_CONV
import room as RM
import counter as CT
import cy_beasts as B

W, H = SW, SH
VPX, VPY = W // 2, EYE_Y
N = 96
WIN = dict(x=84, y=60, w=472, h=132)          # the near edge of the window opening
WALL_T = 0.04
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0
COUNTER = dict(x0=14, x1=626, back=266, front=304)
COUNTER_Y = 292
LANTERNS = [(150, 52, 70), (490, 52, 74)]      # x, top of cord, cord length
SPIDER_HANG = (262, 22)                       # where its cable leaves the rafters
SPIDER_TOP = 84                               # the sprite's top edge in the room
SAMOVAR_X, CUP_X, LAMP_X, BOOKS_X, GLASS_X = 176, 330, 470, 560, 248


def _far_rect():
    kf = 1 - WALL_T
    x0 = VPX + (WIN['x'] - VPX) * kf
    y0 = VPY + (WIN['y'] - VPY) * kf
    x1 = VPX + (WIN['x'] + WIN['w'] - VPX) * kf
    y1 = VPY + (WIN['y'] + WIN['h'] - VPY) * kf
    return int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))


def window_masks():
    yy, xx = np.indices((H, W))
    x0, y0, w, h = WIN['x'], WIN['y'], WIN['w'], WIN['h']
    near = (xx >= x0) & (xx < x0 + w) & (yy >= y0) & (yy < y0 + h)
    fx0, fy0, fx1, fy1 = _far_rect()
    far = (xx >= fx0) & (xx < fx1) & (yy >= fy0) & (yy < fy1)
    return near, far


# ---------------------------------------------------------------- the shell
def _window(cv, rng):
    near, far = window_masks()
    ys, xs = np.nonzero(near & ~far)                           # the reveal through the thick wall
    for y, x in zip(ys, xs):
        dx, dy = x + 0.5 - VPX, y + 0.5 - VPY
        if abs(dx) * 0.6 > abs(dy) * 1.4:
            c = 'wood3' if dx < 0 else 'wood1'
        else:
            c = 'wood0' if dy < 0 else 'wood4'
        cv.px(x, y, c)
    x0, y0, ww, hh = WIN['x'], WIN['y'], WIN['w'], WIN['h']
    f = 8
    ring = ['wood0', 'red1', 'red2', 'red3', 'red4', 'red3', 'red2', 'wood0']
    for i in range(f):
        cv.frame(x0 - f + i, y0 - f + i, ww + 2 * (f - i), hh + 2 * (f - i), ring[i])
    for _ in range(6):
        side = rng.choice('tb')
        chip(cv, rng.randint(x0, x0 + ww - 16), y0 - f + 1 if side == 't' else y0 + hh + 1,
             rng.randint(8, 14), 6, rng, under='wood2', under_dark='wood0', n=3, elong=0.6)
    # the deep sill (its top shows: below eye level)
    sy = y0 + hh + f - 2
    cv.rect(x0 - f - 10, sy, ww + 2 * f + 20, 9, 'wood3')
    cv.hline(x0 - f - 10, x0 + ww + f + 9, sy, 'wood2')
    cv.rect(x0 - f - 10, sy + 1, ww + 2 * f + 20, 5, 'wood4')
    cv.hline(x0 - f - 10, x0 + ww + f + 9, sy + 6, 'wood5')
    cv.hline(x0 - f - 10, x0 + ww + f + 9, sy + 8, 'wood1')
    WG.grain_pass(cv, x0 - f - 10, sy + 1, x0 + ww + f + 10, sy + 8, 'h', seed=19.0, board=8)
    # the window itself sits in the far plane: four tall sashes under a transom
    fx0, fy0, fx1, fy1 = _far_rect()
    fw = fx1 - fx0
    tr = fy0 + 30
    cols = [fx0 + fw * k // 4 for k in range(1, 4)]
    for cx in cols:
        cv.rect(cx - 3, fy0, 6, fy1 - fy0, 'wood2')
        cv.vline(cx - 3, fy0, fy1 - 1, 'wood3'); cv.vline(cx + 2, fy0, fy1 - 1, 'wood0')
    cv.rect(fx0, tr - 3, fw, 6, 'wood2')
    cv.hline(fx0, fx1 - 1, tr - 3, 'wood4'); cv.hline(fx0, fx1 - 1, tr + 2, 'wood0')
    for cx in cols:                                            # brass corner plates where the bars cross
        cv.rect(cx - 4, tr - 4, 8, 8, 'gold1')
        cv.frame(cx - 4, tr - 4, 8, 8, 'gold2')
        cv.px(cx - 3, tr - 3, 'gold3'); cv.px(cx + 2, tr + 2, 'gold0')
    # the openings stay clear: the city shows through
    open_ = np.zeros((H, W), bool)
    open_[fy0:fy1, fx0:fx1] = True
    keep = np.zeros((H, W), bool)
    for cx in cols:
        keep[fy0:fy1, cx - 3:cx + 3] = True
    keep[tr - 3:tr + 3, fx0:fx1] = True
    for cx in cols:
        keep[tr - 4:tr + 4, cx - 4:cx + 4] = True
    hole = open_ & ~keep
    cv.a[hole] = 0
    return hole


def _side_props(img, M):
    """Copper pipes along the left wall, a fuse box on the right, drawn into
    the walls' own perspective (yb: height on the back-wall plane, D: depth)."""
    lab, yb, D, left = M['lab'], M['yb'], M['D'], M['left']
    wall = lab == 2
    for (y0, r) in ((84, 2.6), (93, 1.8)):                     # two pipes running the length of the wall
        d = yb - y0
        pipe = wall & left & (np.abs(d) < r)
        img[pipe] = RM._c('cu2')
        img[pipe & (d < -r * 0.35)] = RM._c('cu4')
        img[pipe & (d < -r * 0.75)] = RM._c('cu5')
        img[pipe & (d > r * 0.5)] = RM._c('cu1')
        band = pipe & (np.abs(np.mod(D, 60) - 30) < 1.4)        # brackets
        img[band] = RM._c('steel2')
        pat = pipe & (np.sin(D * 0.37) * np.sin(yb * 1.3) > 0.7)
        img[pat] = RM._c('verd2')
    vert = wall & left & (np.abs(D - 140) < 2.0) & (yb > 93) & (yb < RAIL[0])   # a drop down to the rail
    img[vert] = RM._c('cu2')
    img[vert & (D < 139.3)] = RM._c('cu4')
    img[vert & (D > 140.9)] = RM._c('cu1')
    box = wall & ~left & (D > 70) & (D < 104) & (yb > 92) & (yb < 150)       # a fuse box, riveted
    img[box] = RM._c('steel2')
    img[box & ((D < 72) | (yb < 94))] = RM._c('steel4')
    img[box & ((D > 102) | (yb > 148))] = RM._c('steel0')
    knob = box & (np.hypot(D - 87, (yb - 112) * 1.4) < 6)
    img[knob] = RM._c('gold2')
    img[knob & (np.hypot(D - 85, (yb - 110) * 1.4) < 2.5)] = RM._c('gold4')
    img[box & (np.abs(yb - 134) < 1) & (D > 76) & (D < 98)] = RM._c('steel0')
    img[box & (np.abs(yb - 140) < 1) & (D > 76) & (D < 98)] = RM._c('steel0')


def _cable(cv, p0, p1, sag, c='steel0', c2='steel1', thick=2):
    x0, y0 = p0
    x1, y1 = p1
    n = int(abs(x1 - x0) + abs(y1 - y0)) + 2
    prev = None
    for i in range(n + 1):
        u = i / n
        x = x0 + (x1 - x0) * u
        y = y0 + (y1 - y0) * u + sag * 4 * u * (1 - u)
        p = (int(round(x)), int(round(y)))
        if p == prev:
            continue
        prev = p
        cv.px(p[0], p[1], c)
        if thick > 1:
            cv.px(p[0], p[1] + 1, c2)


def shell(seed=7):
    rng = random.Random(seed)
    cv = Canvas(W, H)
    M = RM.maps()
    img = np.zeros((SH, SW, 3), np.uint8)
    RM._ceiling(img, M, M['lab'] == 1, rng, 1)
    RM._side_walls(img, M, M['lab'] == 2, rng, 1)
    RM._floor(img, M, M['lab'] == 3, rng, 1)
    _side_props(img, M)
    nb = M['lab'] != 0
    cv.a[..., :3][nb] = img[nb]
    cv.a[..., 3][nb] = 255
    bx0, bx1 = BX, SW - BX
    RM._plank_wall(cv, rng, bx0, bx1, WALL_TOP, RAIL[0])
    RM._age_planks(cv, rng, bx0, bx1, WALL_TOP, RAIL[0])
    WG.grain_pass(cv, bx0, WALL_TOP, bx1, RAIL[0], 'v', seed=3.3, board=17, ramps=('wood',))
    RM._rail_wains_base(cv, rng, bx0, bx1, 1)
    RM._age_wainscot(cv, rng, bx0, bx1)
    RM._girder(cv, bx0, bx1)
    RM._corner_post(cv, bx0, 1)
    RM._corner_post(cv, bx1 - 1, -1)
    hole = _window(cv, rng)
    cobweb(cv, bx0 + 4, WALL_TOP, 18, 'stone3', 'stone2', 'tl')
    cobweb(cv, bx1 - 5, WALL_TOP, 14, 'stone3', 'stone2', 'tr')
    RM.simplify(cv)
    mr = random.Random(seed + 101)                             # a little moss: it is an old building
    moss.along(cv, mr, bx0 + 2, bx1 - 2, BASE[0], 'ledge', every=(30, 90), size=(10, 26), height=(3, 7))
    moss.along(cv, mr, WIN['x'] - 16, WIN['x'] + WIN['w'] + 16, WIN['y'] + WIN['h'] + 6, 'ledge', every=(60, 160),
               size=(10, 22), height=(3, 6), spores=0.4)
    for cx in (bx0, bx1):
        moss.patches(cv, mr, (cx - 8, 160, cx + 8, 262), 2, size=(7, 12))
    cv.a[hole] = 0
    return cv, hole


def pipes_cables(n=N):
    """Cables over the rafters and down the right corner to the fuse box, a
    copper steam pipe across the top of the left wall with a valve that
    leaks a little steam now and then. Frames."""
    base = Canvas(W, H)
    _cable(base, (0, 30), (250, 36), 10)
    _cable(base, (0, 44), (210, 44), 14, 'ink', 'steel0')
    _cable(base, (250, 36), (440, 30), 9)
    _cable(base, (440, 30), (640, 26), 12)
    _cable(base, (600, 28), (604, 120), 2, 'ink', 'steel0')
    _cable(base, (604, 34), (612, 128), 3)
    for (x, y) in ((250, 36), (440, 30), (210, 44)):            # cleats on the rafters
        base.rect(x - 1, y - 1, 3, 3, 'gold1'); base.px(x - 1, y - 1, 'gold3')
    # a brass gauge on the left pipe
    gx, gy = 22, 92
    for yy in range(gy - 6, gy + 7):
        for xx in range(gx - 6, gx + 7):
            d = math.hypot(xx - gx, yy - gy)
            if d < 6.5:
                base.px(xx, yy, 'gold1' if d > 5 else ('paper3' if d < 4.5 else 'gold2'))
    base.line(gx, gy, gx + 3, gy - 2, 'ink')
    base.px(gx - 4, gy - 4, 'gold3')
    frames = []
    vx, vy = 34, 80                                            # the leaking valve
    base.rect(vx - 2, vy - 1, 5, 4, 'gold2'); base.hline(vx - 4, vx + 4, vy - 3, 'gold1')
    base.vline(vx, vy - 3, vy - 1, 'gold1'); base.px(vx - 4, vy - 3, 'gold3')
    for f in range(n):
        cv = base.copy()
        u = (f % 48) / 48
        if u < 0.5:                                             # a puff every four seconds
            for k in range(14):
                age = u * 2 - k * 0.03
                if not 0 < age < 1:
                    continue
                x = vx + 3 + age * 22 + math.sin(k * 2.1) * 2 * age
                y = vy - 4 - age * 18 - k * 0.5
                if BAYER[int(y) % 4, int(x) % 4] > age * 0.95:
                    cv.px(x, y, 'cloud2' if age < 0.4 else 'cloud1')
                    if age < 0.6:
                        cv.px(x + 1, y, 'cloud1')
        frames.append(cv)
    return frames


def glass():
    """Faint reflections of the room in the panes: a couple of soft diagonal
    sheens and the lanterns' warm smudges (alpha). Nothing else, no tiles."""
    _, far = window_masks()
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    a = np.zeros((H, W), np.float32)
    col = np.zeros((H, W, 3), np.float32)
    for (c0, wdt, k) in ((-120, 26, 0.14), (-60, 8, 0.1), (190, 34, 0.12), (260, 10, 0.08)):
        band = np.abs((xx - yy * 0.7) - c0 - 140) < wdt
        a = np.maximum(a, band * k)
    col[:] = PAL['cloud2']
    for (lx, top, L) in LANTERNS:                               # warm smudges from the lanterns
        g = np.clip(1 - np.hypot(xx - lx, (yy - top - L - 12) * 1.2) / 22, 0, 1) * 0.22
        w_ = g > a
        col[w_] = PAL['amber3']
        a = np.maximum(a, g)
    a[~far] = 0
    q = np.floor(a * 10 + BAYER[yy.astype(int) % 4, xx.astype(int) % 4] * 0.999) / 10
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., :3] = col.astype(np.uint8)
    rgba[..., 3] = (np.clip(q * 0.7, 0, 0.25) * 255).astype(np.uint8)
    cv = Canvas(W, H)
    cv.a = rgba
    return cv


# ---------------------------------------------------------------- lanterns
def _lantern(cv, cx, top, L, sway):
    """A chochin on a cord: amber paper lit from inside, ribs, black caps, a
    red rune painted down it, a tassel."""
    bx = cx + sway
    cv.line(cx, top, int(round(bx)), top + L, 'ink')
    bx = int(round(bx))
    y0 = top + L
    cv.rect(bx - 5, y0, 11, 3, 'ink'); cv.hline(bx - 5, bx + 5, y0, 'wood1')
    h, rw = 26, 10
    for yy in range(h):
        t = yy / (h - 1)
        hw = rw * math.sqrt(max(0, 1 - (2 * t - 1) ** 2)) * 0.92 + 3.5
        for xx in range(int(-hw), int(hw) + 1):
            u = xx / hw
            v = 1 - abs(u) ** 2 * 0.9 - abs(2 * t - 1) ** 3 * 0.4
            c = 'amber4' if v > 0.72 else ('amber3' if v > 0.4 else ('amber2' if v > 0.12 else 'amber1'))
            if yy % 4 == 2:
                c = step(PAL[c], -1)                           # the ribs
            cv.px(bx + xx, y0 + 3 + yy, c)
    for k in range(6):                                          # a rune painted down the paper
        cv.px(bx - 1 + (k % 2), y0 + 7 + k * 2, 'red2')
        cv.px(bx + 1 - (k % 3 == 0), y0 + 8 + k * 2, 'red3')
    yb = y0 + 3 + h
    cv.rect(bx - 5, yb, 11, 3, 'ink'); cv.hline(bx - 5, bx + 5, yb + 2, 'wood1')
    cv.vline(bx, yb + 3, yb + 5, 'red1')
    for k in range(5):                                          # tassel
        cv.vline(bx - 2 + k, yb + 6, yb + 12 - (k % 2), 'red2' if k % 2 else 'red1')


def lanterns(n=N):
    frames = []
    for f in range(n):
        cv = Canvas(W, H)
        for i, (cx, top, L) in enumerate(LANTERNS):
            sway = 1.4 * math.sin(2 * math.pi * f / n * 2 + i * 1.9)
            _lantern(cv, cx, top, L, sway)
        frames.append(cv)
    return frames


# ---------------------------------------------------------------- the spider
def spider(n=N):
    fr, anchors = B.spider_frames(n)
    sw, sh = B.SPIDER_SIZE
    frames = []
    for f in range(n):
        cv = Canvas(W, H)
        bob = 3 * math.sin(2 * math.pi * f / n * 2) + 1.5 * math.sin(2 * math.pi * f / n * 3 + 1)
        x0 = SPIDER_HANG[0] - sw // 2
        y0 = SPIDER_TOP + int(round(bob))
        ax, ay = anchors[f]
        _cable(cv, SPIDER_HANG, (x0 + ax, y0 + ay), 0, 'steel3', 'steel3', thick=1)
        cv.blit(B.to_canvas(fr[f]), x0, y0)
        frames.append(cv)
    return frames


# ---------------------------------------------------------------- the counter
def counter(seed=17):
    rng = random.Random(seed)
    cv = Canvas(W, H)
    x0, x1, tb, tf = COUNTER['x0'], COUNTER['x1'], COUNTER['back'], COUNTER['front']
    bx0 = VPX + (x0 - VPX) * FURN_CONV
    bx1 = VPX + (x1 - VPX) * FURN_CONV

    def top(x, y):
        t = (y - tb) / (tf - tb)
        if t < 0.08:
            return 'hinoki1'
        return 'hinoki3' if 0.45 < t < 0.75 else 'hinoki2'
    CT._quad(cv, [(x0, tf), (bx0, tb), (bx1, tb), (x1, tf)], top)
    WG.grain_pass(cv, x0, tb + 3, x1, tf, 'h', seed=5.0, board=13, contrast=0.55, ring=3.4, ramps=('hinoki',),
                  knots=False)
    for _ in range(8):                                          # old tea rings
        rx, ry = rng.randint(x0 + 60, x1 - 40), rng.randint(tb + 7, tf - 6)
        CT._ring(cv, rx, ry, rng.uniform(5, 8), rng.uniform(1.8, 2.8), 'hinoki1', 8)
    for yy in range(tb, tb + 6):                                # grime along the far edge
        for xx in range(x0, x1):
            if cv.get(xx, yy)[3] and BAYER[yy % 4, xx % 4] < (tb + 6 - yy) / 6:
                cv.shift(xx, yy, -1)
    cv.line(x0, tf, int(round(bx0)), tb, 'hinoki4')
    cv.line(x1 - 1, tf, int(round(bx1)), tb, 'hinoki1')
    fy = tf
    cv.rect(x0, fy, x1 - x0, 7, 'hinoki3')
    cv.hline(x0, x1 - 1, fy, 'hinoki5'); cv.hline(x0, x1 - 1, fy + 1, 'hinoki4')
    cv.hline(x0, x1 - 1, fy + 6, 'hinoki1')
    cv.hline(x0, x1 - 1, fy + 7, 'ink'); cv.hline(x0, x1 - 1, fy + 8, 'wood0')
    for _ in range(14):
        ex, ew = rng.randint(x0 + 4, x1 - 10), rng.randint(2, 7)
        for k in range(ew):
            dep = 1 + int(2 * (1 - abs(k - ew / 2) / (ew / 2 + 0.1)))
            for d in range(dep):
                cv.px(ex + k, fy + d, 'hinoki1' if d < dep - 1 else 'hinoki2')
    # the front: dark lattice of slats between stiles, a copper kick-plate
    ly0, ly1 = fy + 9, H - 8
    cv.rect(x0, ly0, x1 - x0, H - ly0, 'wood0')
    stiles = list(range(x0, x1, 152)) + [x1 - 7]
    for i in range(len(stiles) - 1):
        sx0, sx1 = stiles[i] + 7, stiles[i + 1]
        if sx1 - sx0 < 8:
            continue
        cv.rect(sx0, ly0, sx1 - sx0, 4, 'wood1'); cv.hline(sx0, sx1 - 1, ly0, 'wood2')
        cv.rect(sx0, ly1 - 4, sx1 - sx0, 4, 'wood1'); cv.hline(sx0, sx1 - 1, ly1 - 4, 'wood2')
        for sx in range(sx0 + 3, sx1 - 2, 6):
            r = rng.random()
            if r < 0.05:
                continue
            t_ = ly0 + 4 + (rng.randint(6, 18) if r < 0.12 else 0)
            cv.vline(sx, t_, ly1 - 5, 'wood2')
            cv.vline(sx + 1, t_, ly1 - 5, 'wood3')
            cv.vline(sx + 2, t_, ly1 - 5, 'wood2')
    WG.grain_pass(cv, x0, ly0 + 4, x1, ly1 - 4, 'v', seed=6.0, board=3, contrast=0.6, knots=False)
    for sx in stiles:
        cv.rect(sx, ly0, 7, H - ly0, 'wood1')
        cv.vline(sx, ly0, H - 1, 'wood2'); cv.vline(sx + 6, ly0, H - 1, 'wood0')
        for ry in (ly0 + 6, ly1 - 6):                           # copper rivets on the stiles
            cv.px(sx + 3, ry, 'cu4'); cv.px(sx + 3, ry + 1, 'cu1')
    cv.rect(x0, H - 8, x1 - x0, 8, 'cu1')                       # kick-plate
    cv.hline(x0, x1 - 1, H - 8, 'cu3')
    cv.hline(x0, x1 - 1, H - 7, 'cu2')
    for x in range(x0 + 6, x1, 12):
        cv.px(x, H - 5, 'cu4')
        if (x // 12) % 3 == 0:
            cv.px(x + 3, H - 3, 'verd2'); cv.px(x + 4, H - 3, 'verd3')
    reg = cv.a[tb - 2:H, x0 - 2:x1 + 2]                         # darker, older timber like the teahouse counter
    from pixel import RAMPS
    hin, wd = RAMPS['hinoki'], RAMPS['wood']
    for k, c in enumerate(hin):
        m = (reg[..., 0] == c[0]) & (reg[..., 1] == c[1]) & (reg[..., 2] == c[2]) & (reg[..., 3] > 0)
        reg[m, :3] = wd[min(len(wd) - 1, k + 1)]
    return cv


def _samovar(cv, x, base):
    """A copper samovar: a turned urn on a footed base, brass tap and handles,
    a little teapot warming on its crown."""
    cu = ['cu1', 'cu2', 'cu3', 'cu4', 'cu5']
    h = 50

    def prof(t):
        if t < 0.08:
            return 6
        if t < 0.16:
            return 9
        if t < 0.66:
            u = (t - 0.16) / 0.5
            return 13 + 3.5 * math.sin(u * math.pi)
        if t < 0.78:
            return 7
        return 10 - (t - 0.78) * 12
    body = lathe_shade(36, h, prof, cu, spec=0.06, spec_col='cu6')
    cv.blit(body, x - 18, base - h)
    for (yy, c) in ((base - h + 8, 'gold2'), (base - h + 9, 'gold1'), (base - h + 34, 'gold2')):
        for xx in range(x - 16, x + 17):
            if cv.get(xx, yy)[3] and body.get(xx - x + 18, yy - base + h)[3]:
                cv.px(xx, yy, c)
    for s in (-1, 1):                                           # handles
        hx = x + s * 19
        cv.vline(hx, base - h + 14, base - h + 22, 'gold1')
        cv.px(hx - s, base - h + 13, 'gold2'); cv.px(hx - s, base - h + 23, 'gold2')
        cv.px(hx, base - h + 14, 'gold3')
    tx, ty = x + 5, base - 15                                   # the tap
    cv.rect(tx, ty, 10, 3, 'gold2'); cv.hline(tx, tx + 9, ty, 'gold3')
    cv.vline(tx + 9, ty + 3, ty + 6, 'gold1'); cv.px(tx + 9, ty + 7, 'gold0')
    cv.rect(tx + 3, ty - 3, 3, 3, 'gold1'); cv.px(tx + 3, ty - 3, 'gold3')
    pot = lathe_shade(16, 10, lambda t: 7 - abs(t - 0.5) * 6, ['indigo1', 'indigo2', 'indigo3', 'indigo4'], spec=0.05)
    cv.blit(pot, x - 8, base - h - 8)
    cv.hline(x - 3, x + 3, base - h - 9, 'indigo1'); cv.px(x, base - h - 10, 'gold2')
    cv.line(x + 7, base - h - 4, x + 12, base - h - 7, 'indigo2')
    cv.rect(x - 14, base - 1, 29, 2, 'wood0')


def _cup(cv, x, base):
    cv.rect(x - 9, base - 1, 19, 2, 'paper1'); cv.hline(x - 9, x + 9, base - 1, 'paper2')
    cup = lathe_shade(12, 9, lambda t: 6 - t * 1.5, ['indigo0', 'indigo1', 'indigo2', 'indigo3'], spec=0.05)
    cv.blit(cup, x - 6, base - 10)
    cv.hline(x - 5, x + 5, base - 10, 'indigo3')
    cv.hline(x - 4, x + 4, base - 9, 'leaf2')                   # the tea
    cv.px(x - 2, base - 9, 'leaf3')


def _oil_lamp(cv, x, base, flick):
    cv.rect(x - 7, base - 2, 15, 2, 'gold1'); cv.hline(x - 7, x + 7, base - 2, 'gold2')
    body = lathe_shade(12, 8, lambda t: 6 - abs(t - 0.4) * 5, ['gold0', 'gold1', 'gold2', 'gold3'], spec=0.08)
    cv.blit(body, x - 6, base - 10)
    for yy in range(base - 24, base - 10):                     # glass chimney
        t = (yy - (base - 24)) / 14
        hw = 3 + 2 * math.sin(t * math.pi)
        cv.px(x - hw, yy, 'cloud1'); cv.px(x + hw, yy, 'cloud0')
        if yy % 3 == 0:
            cv.px(x - hw + 1, yy, 'cloud3')
    fh = 6 + flick
    for k in range(fh):                                         # the flame
        w_ = 1 if k > fh - 3 else 2
        c = 'paper4' if k < fh // 2 else ('amber4' if k < fh - 1 else 'amber3')
        cv.hline(x - w_ // 2, x + (w_ - 1) // 2 + (1 if k < 2 else 0), base - 12 - k, c)
    cv.px(x, base - 11, 'amber2')


def _books(cv, x, base):
    """A stack of three old books and one lying open on top."""
    cols = [('red1', 'red2', 'red3'), ('indigo1', 'indigo2', 'indigo3'), ('wood2', 'wood3', 'wood4')]
    y = base
    for i, (d, m, l) in enumerate(cols):
        w, h = 30 - i * 3, 5
        bx = x - w // 2 + (i % 2) * 2
        y -= h
        cv.rect(bx, y, w, h, m)
        cv.hline(bx, bx + w - 1, y, l); cv.hline(bx, bx + w - 1, y + h - 1, d)
        cv.vline(bx + w - 1, y, y + h - 1, 'paper3')            # page edges
        for yy in range(y + 1, y + h - 1):
            cv.px(bx + w - 2, yy, 'paper2')
        cv.px(bx + 3, y + 2, 'gold3'); cv.px(bx + 5, y + 2, 'gold2')
    for k in range(13):                                          # open on top
        cv.px(x - 13 + k, y - 1 - (k > 3 and k < 10), 'paper3')
        cv.px(x + k, y - 1 - (k > 3 and k < 10), 'paper4')
        cv.px(x - 13 + k, y, 'paper2'); cv.px(x + k, y, 'paper3')
    cv.vline(x, y - 2, y, 'paper1')
    for k in range(3):
        cv.hline(x - 10, x - 4, y - 1 - k * 0, 'paper1') if k == 0 else None


def _spyglass(cv, x, base):
    """A brass spyglass lying on its side, for watching the airships."""
    for i in range(34):
        r = 2 if i < 12 else (3 if i < 24 else 4)
        for d in range(-r, r + 1):
            c = 'gold3' if d < -r + 2 else ('gold2' if d < r - 1 else 'gold0')
            cv.px(x + i, base - 4 + d, c)
        if i in (12, 24):
            cv.vline(x + i, base - 4 - r - 1, base - 4 + r + 1, 'gold1')
    cv.vline(x + 34, base - 8, base, 'gold1')
    cv.px(x + 33, base - 6, 'haze3')
    cv.hline(x + 2, x + 30, base + 1, 'wood0')


def _pot_plant(cv, x, base, kind):
    pot = lathe_shade(14, 9, lambda t: 7 - t * 2, ['red0', 'red1', 'red2', 'red3'], spec=0.03)
    cv.blit(pot, x - 7, base - 9)
    cv.hline(x - 7, x + 6, base - 9, 'red3')
    rng = random.Random(x)
    if kind == 'pine':                                          # a little twisted pine
        pts = [(x, base - 9), (x - 3, base - 15), (x + 2, base - 20), (x - 1, base - 25)]
        for (a, b) in zip(pts, pts[1:]):
            cv.line(a[0], a[1], b[0], b[1], 'bark2')
        for (px_, py_, rr) in ((x - 7, base - 19, 5), (x + 6, base - 23, 5), (x - 1, base - 28, 4)):
            for yy in range(py_ - 2, py_ + 2):
                for xx in range(px_ - rr, px_ + rr + 1):
                    if abs(xx - px_) + (yy - py_ + 2) * 1.5 < rr + 1:
                        cv.px(xx, yy, 'leaf3' if yy < py_ - 1 else 'leaf2')
                cv.hline(px_ - rr + 1, px_ + rr - 1, py_ + 1, 'leaf1')
    else:                                                       # a fern spilling over
        for k in range(9):
            a = -math.pi / 2 + (k - 4) * 0.36
            L = rng.randint(9, 14)
            for i in range(L):
                u = i / L
                xx = x + math.cos(a) * i * 1.1
                yy = base - 9 + math.sin(a) * i + u * u * 7
                cv.px(xx, yy, 'leaf3' if i < L * 0.6 else 'leaf2')
                if i % 2 == 0 and i > 2:
                    cv.px(xx + 1, yy + 1, 'leaf1')


def sill_plants():
    cv = Canvas(W, H)
    sy = WIN['y'] + WIN['h'] + 6
    _pot_plant(cv, WIN['x'] + 18, sy, 'pine')
    _pot_plant(cv, WIN['x'] + WIN['w'] - 22, sy, 'fern')
    return cv


def counter_props(n=N):
    frames = []
    for f in range(n):
        cv = Canvas(W, H)
        _samovar(cv, SAMOVAR_X, COUNTER_Y)
        _cup(cv, CUP_X, COUNTER_Y + 2)
        flick = int(round(1.2 * math.sin(2 * math.pi * f / n * 7) + 0.8 * math.sin(2 * math.pi * f / n * 11 + 1)))
        _oil_lamp(cv, LAMP_X, COUNTER_Y, flick)
        _books(cv, BOOKS_X, COUNTER_Y + 4)
        _spyglass(cv, GLASS_X, COUNTER_Y + 1)
        for (sx, sy, k0) in ((CUP_X, COUNTER_Y - 10, 0), (SAMOVAR_X, COUNTER_Y - 62, 7)):   # steam
            for k in range(10):
                age = ((f / n) * 3 + k / 10 + k0 * 0.1) % 1
                y = sy - age * 26
                x = sx + math.sin(age * 7 + k + k0) * (1 + age * 3)
                if BAYER[int(y) % 4, int(x) % 4] > age * 1.1 - 0.1:
                    cv.px(x, y, 'cloud2' if age < 0.5 else 'cloud1')
        frames.append(cv)
    return frames


# ---------------------------------------------------------------- foreground and light
def foreground():
    full = RM.posts()
    cv = Canvas(W, H)
    cv.a[:] = full.a[:, :W]
    return cv


def light(hole, n=N):
    """The night in the room: everything sunk in a violet dark; warm pools round
    the lanterns, the oil lamp and the samovar's glow, flickering; the city's
    glow and the moon coming in at the window, lighting the sill, the counter
    top and the floor. The window openings are left clear."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    fx0, fy0, fx1, fy1 = _far_rect()
    # the city's glow coming in at the window: brightest on the sill and the wall round the
    # window, a soft wash across the counter top, nothing on the ceiling
    spill = np.clip(1 - np.hypot((xx - 320) / 330, (yy - 150) / 120), 0, 1) ** 1.2 * 0.8
    top = (yy > COUNTER['back'] - 2) & (yy < COUNTER['front'] + 2)
    spill = np.where(top, np.maximum(spill, 0.45 * np.clip(1 - np.abs(xx - 320) / 330, 0, 1)), spill)
    spill = np.where(yy < CEIL_Y + 14, spill * 0.3, spill)
    pools = [(LANTERNS[0][0], LANTERNS[0][1] + LANTERNS[0][2] + 16, 120, 0.85, PAL['amber3'], 0.25),
             (LANTERNS[1][0], LANTERNS[1][1] + LANTERNS[1][2] + 16, 120, 0.85, PAL['amber3'], 0.25),
             (LAMP_X, COUNTER_Y - 16, 95, 0.9, PAL['amber4'], 0.7),
             (SAMOVAR_X, COUNTER_Y - 26, 60, 0.35, PAL['cu5'], 0.2)]
    frames = []
    dark = np.array(PAL['smog1'], np.float32)
    win_col = np.array(PAL['glow3'], np.float32)
    for f in range(n):
        L = np.zeros((H, W), np.float32)
        col = np.zeros((H, W, 3), np.float32)
        gsum = np.zeros((H, W), np.float32)
        for k, (cx, cy, R, st, c, fl) in enumerate(pools):
            flick = 1 - fl * (0.1 - 0.1 * math.sin(2 * math.pi * f / n * 5 + k * 1.7)
                              - 0.05 * math.sin(2 * math.pi * f / n * 13 + k))
            g = st * flick * np.clip(1 - np.hypot(xx - cx, (yy - cy) * 1.15) / (R * (0.95 + 0.05 * flick)), 0, 1) ** 1.6
            col += g[..., None] * np.array(c, np.float32)
            gsum += g
            L = 1 - (1 - L) * (1 - g)
        cg = np.clip(col / np.maximum(gsum, 1e-4)[..., None], 0, 255)
        d = 0.66 * (1 - L) * (1 - 0.6 * spill)
        G = 0.38 * L
        Gm = 0.12 * spill
        d[hole] = 0
        G[hole] = 0
        Gm[hole] = 0
        al = 1 - (1 - d) * (1 - G) * (1 - Gm)
        rgb = (dark * (d * (1 - G) * (1 - Gm))[..., None] + cg * (G * (1 - Gm))[..., None]
               + win_col * Gm[..., None]) / np.maximum(al, 1e-4)[..., None]
        a = np.zeros((H, W, 4), np.uint8)
        a[..., :3] = np.clip(rgb + 0.5, 0, 255).astype(np.uint8)
        a[..., 3] = np.clip(al * 255 + 0.5, 0, 255).astype(np.uint8)
        cv = Canvas(W, H)
        cv.a = a
        frames.append(cv)
    return frames


def all_layers():
    sh, hole = shell()
    L = {}
    L['10_shell'] = sh
    L['11_glass'] = glass()
    L['12_pipes_cables'] = pipes_cables()
    L['12_sill_plants'] = sill_plants()
    L['13_lanterns'] = lanterns()
    L['14_spider'] = spider()
    L['20_counter'] = counter()
    L['21_counter_props'] = counter_props()
    L['30_foreground'] = foreground()
    L['40_light'] = light(hole)
    return L, hole
