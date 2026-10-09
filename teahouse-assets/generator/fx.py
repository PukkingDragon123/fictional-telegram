"""Foreground layer (things between the player and the room) and the light
overlay (the only layer that uses partial alpha)."""
import math
import random
import numpy as np
from pixel import Canvas, PAL, step
from leaves import leafy
from room import W, H, WIN_MAIN, WIN_ROUND, FLOOR

F = 8
GREEN = ['leaf0', 'leaf1', 'leaf2', 'leaf3', 'leaf4', 'leaf5']
DARK_GREEN = ['ink', 'leaf0', 'leaf0', 'leaf1', 'leaf2', 'leaf3']


def _ivy_strand(cv, rng, x, y0, length, f, ph, ramp=GREEN):
    from leaves import leaf_stamp
    for j in range(length):
        t = j / length
        xx = int(round(x + math.sin(2 * math.pi * f / F + ph) * 2.0 * t * t + math.sin(j * 0.25 + ph)))
        yy = y0 + j
        cv.px(xx, yy, ramp[1])
        if j % 3 == 0:
            side = -1 if (j // 3) % 2 == 0 else 1
            for (dx, dy, sd) in leaf_stamp(math.atan2(1.2, side), 4, 1.5):
                cv.px(xx + dx, yy + dy, ramp[3] if sd > 0 else ramp[2])


def foreground():
    """F frames: ivy curtains hanging from the beam in front of the pillars
    and a big dark leafy plant in the bottom-left corner."""
    rng = random.Random(900)
    strands = []
    for cx in (470, 492, 950, 1430, 1452):
        for k in range(rng.randint(3, 5)):
            strands.append((cx + rng.randint(-10, 10), 16, rng.randint(26, 70), rng.uniform(0, 6.28)))
    plant, ox, oy, _ = leafy(rng, [(0, 0, 34, 26), (-20, 14, 22, 18), (24, 18, 18, 16)], DARK_GREEN,
                             leaf_len=(7, 11), droop=0.1)
    plant2, ox2, oy2, _ = leafy(rng, [(0, 0, 26, 22), (18, 10, 16, 14)], DARK_GREEN, leaf_len=(7, 10), droop=0.1)
    frames = []
    for f in range(F):
        cv = Canvas(W, H)
        layer = Canvas(W, H)
        for (x, y0, ln, ph) in strands:
            _ivy_strand(layer, rng, x, y0, ln, f, ph)
        layer.outline('leaf0', selective=False)
        cv.blit(layer, 0, 0)
        sw = int(round(math.sin(2 * math.pi * f / F)))
        cv.blit(plant, -16 - ox + 26 + sw, 262 - oy)
        cv.blit(plant2, 1906 - ox2 + sw, 268 - oy2)
        frames.append(cv)
    return frames


def light():
    """RGBA overlay: warm shafts from the windows, a pool of light on the
    bedroom floor and dust motes. Use with normal or 'screen' blending."""
    a = np.zeros((H, W, 4), np.uint8)
    warm = (255, 236, 190)
    wx, wy, ww, wh = WIN_MAIN['x'], WIN_MAIN['y'], WIN_MAIN['w'], WIN_MAIN['h']
    # main window: slanted shafts falling down-right to the counter
    for k, (x0, x1) in enumerate(((wx + 4, wx + 54), (wx + 64, wx + 114), (wx + 124, wx + 174), (wx + 184, wx + 234))):
        for y in range(wy, 236):
            t = (y - wy) / (236 - wy)
            off = int(t * 70)
            alpha = int(34 * (1 - t * 0.55))
            for x in range(x0 + off, x1 + off):
                if 0 <= x < W:
                    edge = min(x - (x0 + off), (x1 + off) - x)
                    al = alpha if edge > 3 else alpha // 2
                    if a[y, x, 3] < al:
                        a[y, x] = (*warm, al)
    # bedroom: a soft round pool on the floor below the moon window
    cx, cy = WIN_ROUND['cx'] + 46, FLOOR + 30
    for y in range(FLOOR, H):
        for x in range(cx - 70, cx + 70):
            d = ((x - cx) / 64) ** 2 + ((y - cy) / 22) ** 2
            if d < 1:
                al = 38 if d < 0.6 else 20
                a[y, x] = (*warm, max(a[y, x, 3], al))
    # round window glow shaft
    for y in range(WIN_ROUND['cy'], FLOOR + 10):
        t = (y - WIN_ROUND['cy']) / (FLOOR + 10 - WIN_ROUND['cy'])
        r = int(WIN_ROUND['r'] * (0.9 - 0.2 * t))
        c = int(WIN_ROUND['cx'] + t * 46)
        for x in range(c - r, c + r):
            al = int(26 * (1 - t * 0.5))
            if a[y, x, 3] < al:
                a[y, x] = (*warm, al)
    # dust motes in the shafts
    rng = random.Random(910)
    for _ in range(260):
        x, y = rng.randint(wx, wx + 320), rng.randint(wy, 230)
        if a[y, x, 3]:
            a[y, x] = (255, 250, 230, 150)
    for _ in range(60):
        x, y = rng.randint(WIN_ROUND['cx'] - 40, WIN_ROUND['cx'] + 90), rng.randint(WIN_ROUND['cy'], 220)
        if a[y, x, 3]:
            a[y, x] = (255, 250, 230, 140)
    cv = Canvas(W, H)
    cv.a = a
    return cv


def leaf_particles():
    """Tiny tumbling leaf / petal sprites (4 frames each) for the engine to
    drift across the window - falling sakura petals, maple and green leaves."""
    sets = {}
    sets['petal'] = ['''
.pP
pPp
.p.
''', '''
pP.
.Pp
...
''', '''
.P.
.p.
.p.
''', '''
.Pp
pP.
...
''']
    sets['leaf_green'] = ['''
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
''']
    sets['leaf_maple'] = ['''
.r.r.
rRRRr
.rRr.
..o..
''', '''
..r..
.rRr.
rRRRr
..o..
''', '''
.r...
rRRr.
.rRRr
...o.
''', '''
..r..
rRRr.
.Rr..
.o...
''']
    leg = {'p': 'pink2', 'P': 'pink4', 'g': 'leaf2', 'G': 'leaf4', 'o': 'wood2', 'r': 'red2', 'R': 'red4'}
    out = {}
    for k, frames in sets.items():
        out[k] = [Canvas.from_ascii(a, leg) for a in frames]
    return out
