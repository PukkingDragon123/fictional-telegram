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


# the sun through the windows, by season: colour, strength, how far the low sun throws the shafts,
# and how strongly the fire and lanterns glow against it
SUN = dict(summer=(WARM, 1.0, 96, 1.0), spring=((255, 238, 226), 0.9, 90, 1.0),
           autumn=((255, 204, 132), 1.3, 126, 1.1), winter=((228, 238, 255), 0.85, 110, 1.35))


LANTERN_GLOW = dict(summer=FIRE, spring=(255, 196, 206), autumn=(255, 168, 76), winter=(255, 226, 172))


LANTERN_GLOW['bloodmoon'] = (255, 196, 110)
NIGHT = (16, 10, 30)                                       # the dark in the rooms on the blood moon night
MOONLIGHT = (196, 40, 58)


def _glass():
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
    return glass


def night_light(open_mask=None):
    """The blood moon night: the rooms sunk in a violet dark, warm pools round
    the furnace, the lanterns and the desk candle, flickering, and the red
    moonlight falling through each window in slanting shafts with dust in it.
    Where the night outside shows through (open_mask: the pixels no part of the
    room covers) is left clear - it is already drawn dark. F frames of RGBA."""
    from layout import WIN_BELL
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    glass = _glass() if open_mask is None else open_mask
    # moonlight through the windows: the moon stands high, so the shafts fall steeply
    shaft = np.zeros((H, W), np.float32)
    wx, wy, ww = WIN_MAIN['x'], WIN_MAIN['y'], WIN_MAIN['w']
    for k in range(4):
        x0, x1 = wx + ww * k // 4 + 6, wx + ww * (k + 1) // 4 - 6
        t = np.clip((yy - wy) / (312 - wy), 0, 1)
        off = t * 46
        inside = (xx >= x0 + off) & (xx < x1 + off) & (yy >= wy) & (yy < 312)
        edge = np.minimum(xx - (x0 + off), (x1 + off) - xx)
        shaft = np.maximum(shaft, inside * (1 - t * 0.55) * np.where(edge > 4, 1.0, 0.55))
    for (cx, y0, r) in ((WIN_ROUND['cx'], WIN_ROUND['cy'] + WIN_ROUND['r'] * 0.7, WIN_ROUND['r']),
                        (WIN_BELL['cx'], WIN_BELL['bottom'] - 6, WIN_BELL['hw'])):
        t = np.clip((yy - y0) / (FLOOR + 30 - y0), 0, 1)          # a pool spreading from under the window
        c = cx + t * 30
        rr = r * (0.75 + 0.35 * t)
        soft = np.clip(1 - np.abs(xx - c) / rr, 0, 1) ** 0.6
        shaft = np.maximum(shaft, soft * (yy >= y0) * (yy < FLOOR + 30) * (1 - t) ** 1.2 * 0.85)
    shaft[glass] = 0
    # pools of warm light: (x, y, reach, strength, colour, flickers)
    fx_, fy_ = FIREBOX['cx'], FIREBOX['bottom'] - 34
    lantern = LANTERN_GLOW['bloodmoon']
    pools = [(fx_, fy_, 230, 1.0, FIRE, 1.0), (855, 81, 120, 0.8, lantern, 0.3), (1065, 81, 120, 0.8, lantern, 0.3),
             (2440, 81, 125, 0.8, lantern, 0.3), (2093, 210, 85, 0.7, (255, 186, 96), 0.6)]
    rng = random.Random(911)
    motes = [(rng.uniform(0, W), rng.uniform(60, 310), rng.uniform(0, 6.28)) for _ in range(2600)]
    frames = []
    for f in range(F):
        L = np.zeros((H, W), np.float32)                         # how much warm light reaches each pixel
        col = np.zeros((H, W, 3), np.float32)
        gsum = np.zeros((H, W), np.float32)
        for k, (cx, cy, R, st, c, fl) in enumerate(pools):
            flick = 1 - fl * (0.12 - 0.12 * math.sin(2 * math.pi * f / F + k * 1.7)
                              - 0.06 * math.sin(2 * math.pi * 3 * f / F + k))
            Rk = R * (0.94 + 0.06 * flick)
            g = st * flick * np.clip(1 - np.hypot(xx - cx, (yy - cy) * 1.15) / Rk, 0, 1) ** 1.6
            col += g[..., None] * np.array(c, np.float32)
            gsum += g
            L = 1 - (1 - L) * (1 - g)
        cg = np.clip(col / np.maximum(gsum, 1e-4)[..., None], 0, 255)      # the mix of the lights' colours
        d = 0.68 * (1 - L) * (1 - 0.6 * shaft)                  # the dark, lifted by the light
        G = 0.3 * L                                              # the warm tint
        Gm = 0.34 * shaft                                        # the red moonlight
        d[glass] = 0
        G[glass] = 0
        al = 1 - (1 - d) * (1 - G) * (1 - Gm)
        rgb = (np.array(NIGHT, np.float32) * (d * (1 - G) * (1 - Gm))[..., None] + cg * (G * (1 - Gm))[..., None]
               + np.array(MOONLIGHT, np.float32) * Gm[..., None]) / np.maximum(al, 1e-4)[..., None]
        a = np.zeros((H, W, 4), np.uint8)
        a[..., :3] = np.clip(rgb + 0.5, 0, 255).astype(np.uint8)
        a[..., 3] = np.clip(al * 255 + 0.5, 0, 255).astype(np.uint8)
        for (mx, my, ph) in motes:                               # dust turning in the moonbeams
            x = int(mx + math.sin(2 * math.pi * f / F + ph) * 2)
            y = int(my - (f / F) * 3 + math.cos(ph))
            if 0 <= x < W and 0 <= y < H and shaft[y, x] > 0.15:
                a[y, x] = (236, 120, 120, 150)
        cv = Canvas(W, H)
        cv.a = a
        frames.append(cv)
    return frames


def light(season='summer', open_mask=None):
    """F frames of RGBA light."""
    if season == 'bloodmoon':
        return night_light(open_mask)
    sun, k_sun, throw, k_fire = SUN[season]
    base = np.zeros((H, W, 4), np.uint8)
    wx, wy, ww, wh = WIN_MAIN['x'], WIN_MAIN['y'], WIN_MAIN['w'], WIN_MAIN['h']
    for k in range(4):
        x0 = wx + ww * k // 4 + 6
        x1 = wx + ww * (k + 1) // 4 - 6
        for y in range(wy, 312):
            t = (y - wy) / (312 - wy)
            off = int(t * throw)
            alpha = int(30 * k_sun * (1 - t * 0.5))
            for x in range(x0 + off, x1 + off):
                if 0 <= x < W:
                    edge = min(x - (x0 + off), (x1 + off) - x)
                    al = alpha if edge > 4 else alpha // 2
                    if base[y, x, 3] < al:
                        base[y, x] = (*sun, al)
    for y in range(WIN_ROUND['cy'], FLOOR + 14):          # moon-window shaft, fading out before the floor
        t = (y - WIN_ROUND['cy']) / (FLOOR + 14 - WIN_ROUND['cy'])
        r = int(WIN_ROUND['r'] * (0.9 - 0.25 * t))
        c = int(WIN_ROUND['cx'] + t * 60 * throw / 96)
        for x in range(c - r, c + r):
            al = int(22 * k_sun * (1 - t) ** 1.5)
            if base[y, x, 3] < al:
                base[y, x] = (*sun, al)
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
    # glass: just a reflection - two soft diagonal bands of sky light across each pane,
    # brighter toward the top, no tiles or frames
    d = (xx + yy * 0.9)
    band = (np.abs((d % 150) - 40) < 9).astype(float) + (np.abs((d % 150) - 62) < 3).astype(float) * 0.7
    top = np.clip(1.2 - (yy - 60) / 160.0, 0.35, 1.0)
    al = (band * top * 34).astype(int)
    sel = glass & (al > 0)
    base[sel, 0], base[sel, 1], base[sel, 2] = 236, 246, 255
    base[sel, 3] = np.maximum(base[sel, 3], al[sel])
    lx, ly = 2441, 80                                     # bedroom lantern glow, the colour of its paper
    lantern = LANTERN_GLOW[season]
    _add(base, lx - 70, lx + 70, ly - 60, ly + 70,
         lambda x, y: (lantern, int(max(0, 40 * k_fire * (1 - math.hypot(x - lx, (y - ly) * 1.2) / 70)))))
    if season == 'winter':                                # cold snow-light spilling in under each window
        for (cx, cy, rx) in ((wx + ww // 2, wy + wh + 14, ww * 0.6), (WIN_ROUND['cx'], WIN_ROUND['cy'] + 66, 80),
                             (WIN_BELL['cx'], WIN_BELL['bottom'] + 12, 70)):
            _add(base, int(cx - rx), int(cx + rx), int(cy - 30), int(cy + 50),
                 lambda x, y, cx=cx, cy=cy, rx=rx: ((236, 244, 255),
                                                     int(max(0, 26 * (1 - math.hypot((x - cx) / rx, (y - cy) / 40.0))))))
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
             lambda x, y: (FIRE, int(70 * k_fire * flick * max(0.0, 1 - math.hypot(x - fcx, (y - fcy) * 1.1) / R_) ** 1.4)))
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
