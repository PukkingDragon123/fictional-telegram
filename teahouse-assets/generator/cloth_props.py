"""Props made of simulated cloth (see cloth.py). Each one is a looping
animation: the breeze through the window/door moves them, the towel near the
hearth stirs in the heat. FC frames at ~8 fps."""
import math
import random
import numpy as np
from pixel import Canvas, PAL
from propkit import prop
import cloth as C
from layout import TABLE, WIN_MAIN, WIN_ROUND

FC = 12
INDIGO = ['indigo0', 'indigo1', 'indigo2', 'indigo3', 'indigo4']
JADE = ['jade0', 'jade1', 'jade2', 'jade3', 'jade4']
PAPER = ['paper0', 'paper1', 'paper2', 'paper3', 'paper4']
LINEN = ['paper1', 'paper2', 'paper3', 'paper4', 'white']
RED = ['red0', 'red1', 'red2', 'red3', 'red4']
TEAL = ['teal0', 'teal1', 'teal2', 'teal3']
GOLD = ['gold0', 'gold1', 'gold2', 'gold3', 'gold4']

_CACHE = {}


def cached(key, fn):
    if key not in _CACHE:
        _CACHE[key] = fn()
    return _CACHE[key]


# ---------------------------------------------------------------- towel
@prop('tenugui_towel', 1, 'counter', TABLE['x1'] - 52, TABLE['front'] - 22,
      'Indigo tenugui towel draped over the table edge, stirring in the hearth heat (cloth physics, 12 frames)', fps=8,
      shadow='none')
def towel():
    def build():
        c = C.Cloth(11, 22, 3.0, origin=(0, -0.5, -27), axis='horizontal')
        for i in range(11):
            c.pin(i, 0); c.pin(i, 1)
        c.add_box(-20, 0, -80, 60, 10, 0, friction=0.8)
        c.floor_y = 70
        w = C.breeze(amp=(4, -1.5, 3), period=1.0, waves=0.1, seed=3)
        snaps = C.simulate(c, w, frames=FC, substeps=10, warm_periods=2, settle=300)

        def tex(u, v, back):
            if v > 0.97 and int(u * 30) % 2:
                return None                                    # frayed end
            if v > 0.86 or v < 0.06:
                return LINEN[1:]                               # white end bands
            if (int(u * 16) + int(v * 40)) % 4 == 0 and (int(v * 40) % 2 == 0):
                return LINEN[1:]                               # dot print
            return INDIGO
        return [C.render(c, P, tex, 46, 74, ox=6, oy=22, tilt=0.55, fold=1.8) for P in snaps]
    return cached('towel', build)


# ---------------------------------------------------------------- window drapes
def _drape(side, seed):
    """Gathered linen drape hanging beside the big window. side -1 = left."""
    c = C.Cloth(12, 42, 3.8, origin=(0, 0, 0))
    c.pin_row(0, gather=0.55, pleat=2.2)
    c.wall_z = -3
    w = C.breeze(base=(side * -2.0, 0, 7), amp=(4, 1, 9), period=1.0, waves=0.07, seed=seed)
    snaps = C.simulate(c, w, frames=FC, substeps=10, warm_periods=3)

    def tex(u, v, back):
        if v > 0.965:
            return GOLD[1:]                            # gold hem
        if 0.9 < v < 0.93:
            return ['jade0', 'jade1', 'jade1', 'jade2']
        if back:
            return JADE[:4]
        if int(u * 12) % 4 == 0:
            return ['jade0', 'jade1', 'jade2', 'jade3']   # woven stripe
        return JADE
    x_min = min(P[:, 0].min() for P in snaps) - 4
    return [C.render(c, P, tex, 72, 172, ox=-x_min, oy=4, fold=1.5, mid=0.58, spread=0.8) for P in snaps], x_min


@prop('curtain_rod', 2, 'wall', WIN_MAIN['x'] - 30, 34, 'Bamboo curtain pole over the big window')
def rod():
    w = WIN_MAIN['w'] + 60
    cv = Canvas(w, 10)
    for x in range(w):
        cv.px(x, 3, 'gold3'); cv.px(x, 4, 'gold2'); cv.px(x, 5, 'gold2'); cv.px(x, 6, 'gold1')
        if x % 26 == 0:
            cv.vline(x, 3, 6, 'gold0')
    for x in (0, w - 6):
        cv.rect(x, 1, 6, 8, 'wood2'); cv.hline(x, x + 5, 1, 'wood4')
    for x in (14, w // 2, w - 18):
        cv.rect(x, 0, 3, 4, 'stone1')
    from objects import outline
    return outline(cv)


@prop('curtain_left', 2, 'wall', WIN_MAIN['x'] - 30, 38, 'Jade linen drape, tied back, breathing in the breeze (cloth physics, 12 frames)', fps=8)
def curtain_left():
    return cached('cl', lambda: _drape(-1, 5)[0])


@prop('curtain_right', 2, 'wall', WIN_MAIN['x'] + WIN_MAIN['w'] - 34, 38, 'Jade linen drape, right side (cloth physics, 12 frames)', fps=8)
def curtain_right():
    return cached('cr', lambda: _drape(1, 6)[0])


# ---------------------------------------------------------------- noren
@prop('noren_doorway', 4, 'ceiling', 1934, 34, "Indigo noren over the bedroom doorway, swaying (3 simulated panels, 12 frames)", fps=8)
def noren():
    def build():
        panels = []
        for p in range(3):
            c = C.Cloth(11, 24, 3.6, origin=(p * 41.0, 0, 0))
            c.pin_row(0, gather=0.92, pleat=0.8)
            w = C.breeze(base=(2, 0, 10), amp=(10, 2, 16), period=1.0, waves=0.05, seed=10 + p)
            panels.append((c, C.simulate(c, w, frames=FC, substeps=10, warm_periods=3)))
        rng = random.Random(4)
        tears = [rng.random() for _ in range(40)]
        holes = [(rng.uniform(0.1, 0.9), rng.uniform(0.2, 0.8)) for _ in range(3)]
        frames = []
        for f in range(FC):
            cv = Canvas(132, 100)
            # rod
            for x in range(132):
                cv.px(x, 2, 'wood4'); cv.px(x, 3, 'wood3'); cv.px(x, 4, 'wood1')
            for p, (c, snaps) in enumerate(panels):
                def tex(u, v, back, p=p):
                    U = (p + u) / 3                     # u across the whole curtain
                    if v > 0.9 - 0.12 * tears[int(u * 39)] * (1 + p % 2):
                        return None                     # torn, frayed bottom
                    for (hu, hv) in holes:
                        if p == 1 and abs(u - hu) < 0.05 and abs(v - hv) < 0.025:
                            return None                 # moth hole
                    dx, dy = (U - 0.5) * 3.0, (v - 0.42) * 2.6
                    r = math.hypot(dx, dy)
                    if 0.34 < r < 0.42:
                        return LINEN[1:]                # white crest ring
                    if r < 0.3 and abs(dy + dx * 0.45) < 0.07:
                        return LINEN[1:]                # tea-leaf midrib
                    if r < 0.28 and abs(dy + dx * 0.45) < 0.2 and abs(dx) < 0.24:
                        return LINEN[1:] if not back else PAPER[1:]
                    if v < 0.05:
                        return INDIGO[1:]               # rod sleeve
                    return INDIGO
                spr = C.render(c, snaps[f], tex, 52, 100, ox=4 - p * 41, oy=4, fold=1.6, mid=0.7, spread=0.7)
                cv.blit(spr, p * 43 - 2, 0)
            frames.append(cv)
        return frames
    return cached('noren', build)


# ---------------------------------------------------------------- moon-window curtain
@prop('curtain_moon_window', 4, 'wall', WIN_ROUND['cx'] + 18, 40, 'Striped linen curtain half drawn over the moon window, billowing in (cloth physics, 12 frames)', fps=8)
def moon_curtain():
    def build():
        c = C.Cloth(15, 34, 4.0, origin=(0, 0, 0))
        c.pin_row(0, gather=0.55, pleat=2.0)
        c.wall_z = -3
        w = C.breeze(base=(-8, -1, 14), amp=(8, 2, 14), period=1.0, waves=0.06, seed=21)
        snaps = C.simulate(c, w, frames=FC, substeps=10, warm_periods=3)

        def tex(u, v, back):
            if v > 0.975:
                return None if int(u * 40) % 3 == 0 else RED[1:]
            if 0.9 < v < 0.94:
                return RED
            if int(u * 20) % 5 == 0:
                return ['red1', 'red2', 'red3', 'red3']   # faded stripe
            return LINEN if not back else PAPER
        x_min = min(P[:, 0].min() for P in snaps) - 4
        return [C.render(c, P, tex, 96, 150, ox=-x_min, oy=4, fold=1.7, mid=0.6, spread=0.75) for P in snaps]
    return cached('moon', build)


# ---------------------------------------------------------------- cloak
@prop('cloak_on_hook', 4, 'wall', 2452, 64, "Traveler's patched cloak on a wall hook, swaying (cloth physics, 12 frames)", fps=8)
def cloak():
    def build():
        c = C.Cloth(15, 28, 3.2, origin=(0, 0, 0))
        c.wall_z = -1
        cx = 7 * 3.2
        G = c.P.reshape(c.ny, c.nx, 3)
        for i in range(c.nx):                        # gathered collar on the hook
            G[:, i, 2] += 1.5 * (1 if i % 2 else -1)
        c.P = G.reshape(-1, 3); c.prev = c.P.copy()
        for i in range(c.nx):
            c.pin(i, 0, (cx + (i - 7) * 1.1, abs(i - 7) * 0.35, 1.0 + 1.2 * (i % 2)))
        w = C.breeze(base=(0, 0, 3), amp=(3, 1, 4), period=1.0, waves=0.05, seed=31)
        snaps = C.simulate(c, w, frames=FC, substeps=10, warm_periods=3)

        def tex(u, v, back):
            if v > 0.97 and int(u * 30) % 3 == 0:
                return None
            if 0.48 < u < 0.66 and 0.5 < v < 0.64:
                return GOLD[:4]                        # patch
            if abs(u - 0.48) < 0.012 and 0.5 < v < 0.64 or abs(v - 0.5) < 0.006 and 0.48 < u < 0.66:
                return PAPER[:4]                       # stitches
            if v < 0.12:
                return ['teal0', 'teal1', 'teal2', 'teal3']   # collar fold, darker
            return TEAL if not back else ['teal0', 'teal1', 'teal2']
        x_min = min(P[:, 0].min() for P in snaps) - 4
        frames = [C.render(c, P, tex, 64, 100, ox=-x_min, oy=5, fold=1.6, mid=0.62, spread=0.7) for P in snaps]
        for fr in frames:                            # the iron hook
            hx = int(cx - x_min)
            fr.px(hx, 1, 'stone3'); fr.px(hx, 2, 'stone2'); fr.px(hx + 1, 3, 'stone1'); fr.px(hx, 4, 'stone2')
        return frames
    return cached('cloak', build)
