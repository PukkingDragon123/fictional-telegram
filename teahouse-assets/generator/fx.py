"""Foreground (the posts between rooms, ivy, dark corner plants) and the animated light
overlay - the only layer with partial alpha: warm window shafts with
drifting dust, the hearth's flickering glow, the bedroom lamp and the
shaft under the moon window."""
import math
import random
import numpy as np
from pixel import Canvas, PAL, step
from leaves import leafy, leaf_stamp
from layout import W, H, WIN_MAIN, WIN_ROUND, FLOOR, HEARTH, POSTS, POST_W
from counter import FIREBOX

F = 8
GREEN = ['leaf0', 'leaf1', 'leaf2', 'leaf3', 'leaf4', 'leaf5']
DARK_GREEN = ['ink', 'leaf0', 'leaf0', 'leaf1', 'leaf2', 'leaf3']
WARM = (255, 236, 190)
FIRE = (255, 150, 60)


def _ivy_strand(cv, x, y0, length, f, ph):
    for j in range(length):
        t = j / length
        xx = int(round(x + math.sin(2 * math.pi * f / F + ph) * 2.4 * t * t + math.sin(j * 0.25 + ph)))
        yy = y0 + j
        cv.px(xx, yy, 'leaf1')
        if j % 3 == 0:
            side = -1 if (j // 3) % 2 == 0 else 1
            for (dx, dy, sd) in leaf_stamp(math.atan2(1.2, side), 5, 1.8):
                cv.px(xx + dx, yy + dy, 'leaf3' if sd > 0 else 'leaf2')


def foreground():
    rng = random.Random(900)
    import room
    posts = room.posts()
    strands = []
    for cx in POSTS[1:-1]:                       # ivy hanging off the posts
        for k in range(rng.randint(4, 6)):
            strands.append((cx + rng.randint(-POST_W // 2 - 4, POST_W // 2 + 4), 0, rng.randint(40, 120),
                            rng.uniform(0, 6.28)))
    plant, ox, oy, _ = leafy(rng, [(0, 0, 44, 32), (-26, 18, 28, 22), (30, 22, 24, 20)], DARK_GREEN,
                             leaf_len=(9, 14), droop=0.1)
    plant2, ox2, oy2, _ = leafy(rng, [(0, 0, 34, 28), (22, 12, 22, 18)], DARK_GREEN, leaf_len=(9, 13), droop=0.1)
    frames = []
    for f in range(F):
        cv = posts.copy()
        layer = Canvas(W, H)
        for (x, y0, ln, ph) in strands:
            _ivy_strand(layer, x, y0, ln, f, ph)
        layer.outline('leaf0', selective=False)
        cv.blit(layer, 0, 0)
        sw = int(round(math.sin(2 * math.pi * f / F)))
        cv.blit(plant, 12 - ox + sw, H + 8 - oy)
        cv.blit(plant2, W - 14 - ox2 + sw, H + 14 - oy2)
        frames.append(cv)
    return frames


def _add(a, x0, x1, y0, y1, fn):
    for y in range(max(0, y0), min(H, y1)):
        for x in range(max(0, x0), min(W, x1)):
            r = fn(x, y)
            if r:
                col, al = r
                if al > a[y, x, 3]:
                    a[y, x] = (*col, al)


def light():
    """F frames of RGBA light."""
    base = np.zeros((H, W, 4), np.uint8)
    wx, wy, ww, wh = WIN_MAIN['x'], WIN_MAIN['y'], WIN_MAIN['w'], WIN_MAIN['h']
    for k in range(4):
        x0 = wx + ww * k // 4 + 6
        x1 = wx + ww * (k + 1) // 4 - 6
        for y in range(wy, 312):
            t = (y - wy) / (312 - wy)
            off = int(t * 96)
            alpha = int(30 * (1 - t * 0.5))
            for x in range(x0 + off, x1 + off):
                if 0 <= x < W:
                    edge = min(x - (x0 + off), (x1 + off) - x)
                    al = alpha if edge > 4 else alpha // 2
                    if base[y, x, 3] < al:
                        base[y, x] = (*WARM, al)
    for y in range(WIN_ROUND['cy'], FLOOR + 14):          # moon-window shaft, fading out before the floor
        t = (y - WIN_ROUND['cy']) / (FLOOR + 14 - WIN_ROUND['cy'])
        r = int(WIN_ROUND['r'] * (0.9 - 0.25 * t))
        c = int(WIN_ROUND['cx'] + t * 60)
        for x in range(c - r, c + r):
            al = int(22 * (1 - t) ** 1.5)
            if base[y, x, 3] < al:
                base[y, x] = (*WARM, al)
    from layout import WIN_BELL
    from room import bell_halfwidth
    yy, xx = np.mgrid[0:H, 0:W]
    glass = np.zeros((H, W), bool)
    glass[WIN_MAIN['y']:WIN_MAIN['y'] + WIN_MAIN['h'], WIN_MAIN['x']:WIN_MAIN['x'] + WIN_MAIN['w']] = True
    glass |= (xx - WIN_ROUND['cx']) ** 2 + (yy - WIN_ROUND['cy']) ** 2 < (WIN_ROUND['r'] - 2) ** 2
    for y in range(WIN_BELL['top'], WIN_BELL['bottom']):
        hw = bell_halfwidth(y)
        if hw > 0:
            glass[y, int(WIN_BELL['cx'] - hw):int(WIN_BELL['cx'] + hw)] = True
    # blocky glass in the spirit of Minecraft's, kept light: a 16 px tile with a
    # faint one-pixel rim and one short diagonal glint, repeated over every pane
    tile = np.zeros((16, 16), int)
    tile[0, :] = tile[:, 0] = 1
    for (r, c) in ((3, 5), (4, 4), (5, 3), (4, 6), (5, 5), (6, 4)):
        tile[r, c] = 2
    t = tile[yy % 16, xx % 16]
    base[glass & (t == 1)] = (235, 248, 255, 26)
    base[glass & (t == 2)] = (255, 255, 255, 70)
    lx, ly = 2441, 96                                     # bedroom oil lamp glow
    _add(base, lx - 70, lx + 70, ly - 60, ly + 70,
         lambda x, y: (FIRE, int(max(0, 40 * (1 - math.hypot(x - lx, (y - ly) * 1.2) / 70)))))
    frames = []
    rng = random.Random(910)
    motes = [(rng.uniform(wx, wx + ww + 120), rng.uniform(wy, 300), rng.uniform(0, 6.28)) for _ in range(360)]
    motes2 = [(rng.uniform(WIN_ROUND['cx'] - 60, WIN_ROUND['cx'] + 120), rng.uniform(WIN_ROUND['cy'], 300),
               rng.uniform(0, 6.28)) for _ in range(90)]
    fcx, fcy = FIREBOX['cx'], FIREBOX['bottom'] - 34
    for f in range(F):
        a = base.copy()
        flick = 0.82 + 0.18 * math.sin(2 * math.pi * f / F) + 0.08 * math.sin(2 * math.pi * 3 * f / F + 1)
        R_ = 150 * flick
        _add(a, int(fcx - R_), int(fcx + R_), int(fcy - R_), H,
             lambda x, y: (FIRE, int(70 * flick * max(0.0, 1 - math.hypot(x - fcx, (y - fcy) * 1.1) / R_) ** 1.4)))
        for (mx, my, ph) in motes + motes2:               # dust drifting in the beams
            x = int(mx + math.sin(2 * math.pi * f / F + ph) * 2)
            y = int(my - (f / F) * 3 + math.cos(ph) * 1)
            if 0 <= x < W and 0 <= y < H and base[y, x, 3] > 0:
                a[y, x] = (255, 250, 230, 160)
        cv = Canvas(W, H)
        cv.a = a
        frames.append(cv)
    return frames


def leaf_particles():
    """Tiny tumbling leaf sprites (4 frames each) for the engine to drift
    past the windows - green leaves only, plus pine needles."""
    sets = {'leaf_green': ['''
..gG
.gGg
gGg.
o...
''', '''
.gG.
gGGg
.gg.
..o.
''', '''
gG..
gGg.
.gGg
...o
''', '''
.g..
gGg.
.Gg.
..o.
'''], 'leaf_jade': ['''
..jJ
.jJj
jJj.
o...
''', '''
.jJ.
jJJj
.jj.
..o.
''', '''
jJ..
jJj.
.jJj
...o
''', '''
.j..
jJj.
.Jj.
..o.
''']}
    leg = {'g': 'leaf2', 'G': 'leaf4', 'j': 'jade2', 'J': 'jade4', 'o': 'wood2'}
    return {k: [Canvas.from_ascii(a, leg) for a in frames] for k, frames in sets.items()}
