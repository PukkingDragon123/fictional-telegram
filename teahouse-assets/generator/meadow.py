"""Animated meadow: spiky grass tufts and flower plants with real leaves.
Everything returns F looping frames (tips and heads sway, roots stay)."""
import math
import random
import numpy as np
from pixel import Canvas, PAL, step
from leaves import leafy, leaf_stamp

F = 8
GREEN = ['leaf0', 'leaf1', 'leaf2', 'leaf3', 'leaf4', 'leaf5']


def _sw(f, ph, amp=1.0):
    return amp * math.sin(2 * math.pi * f / F + ph)


# ---------------------------------------------------------------- grass
def tuft(rng, h, n, dark=0, width=None):
    """Clump of pointed, curving blades (2px at the root, 1px tip) with a lit
    left edge and one dark outline around the clump."""
    width = width or max(6, int(n * 1.6))
    w, H = width + 12, h + 3
    specs = []
    for b in range(n):
        off = (b / max(1, n - 1) - 0.5) * width
        specs.append(dict(x=w / 2 + off * 0.55 + rng.uniform(-1, 1), hb=rng.uniform(0.45, 1.0) * h,
                          lean=off / width * 1.3 + rng.uniform(-0.2, 0.2), bend=rng.uniform(-2, 2),
                          ph=rng.uniform(0, 6.28), front=rng.random() < 0.5))
    specs.sort(key=lambda s_: (s_['front'], -s_['hb']))
    out = []
    for f in range(F):
        cv = Canvas(w, H)
        for s_ in specs:
            d = dark + (0 if s_['front'] else 1)
            cols = [GREEN[max(1, i - d)] for i in (1, 2, 3, 4, 5)]
            n_ = int(s_['hb'])
            for j in range(n_ + 1):
                t = j / max(1, n_)
                x = s_['x'] + s_['lean'] * n_ * t * 0.55 + s_['bend'] * t * t + _sw(f, s_['ph'], 1.3) * t * t
                y = H - 1 - j
                k = 0 if t < 0.25 else (1 if t < 0.55 else (2 if t < 0.85 else 3))
                xi = int(round(x))
                if t < 0.6:
                    cv.px(xi, y, cols[k + 1] if k + 1 < 5 else cols[k])
                    cv.px(xi + 1, y, cols[k])
                else:
                    cv.px(xi, y, cols[min(4, k + 1)] if t > 0.9 else cols[k])
        cv.outline('leaf0', selective=False)
        for x in range(w):   # no outline under the roots
            if cv.get(x, H - 1)[:3] == PAL['leaf0']:
                cv.px(x, H - 1, None)
        out.append(cv)
    return out


# ---------------------------------------------------------------- flower heads
def radial_head(n, L, W, lit, shd, outline, center=('gold3', 'gold1'), rot=0.0, stamens=None):
    R = L + (4 if stamens else 2)
    cv = Canvas(2 * R + 3, 2 * R + 3)
    c = R + 1
    for k in range(n):
        a = rot + 2 * math.pi * k / n
        for (dx, dy, sd) in leaf_stamp(a, L, W):
            cv.px(c + dx, c + dy, lit if sd > 0 else (shd if sd < 0 else lit))
        if stamens:
            a2 = a + math.pi / n
            for j in range(2, L + 3):
                cv.px(c + int(round(math.cos(a2) * j)), c + int(round(math.sin(a2) * j)), stamens[0])
            cv.px(c + int(round(math.cos(a2) * (L + 3))), c + int(round(math.sin(a2) * (L + 3))), stamens[1])
    if center:
        cv.px(c, c, center[0])
        cv.px(c - 1, c, center[0])
        cv.px(c, c - 1, center[0])
        cv.px(c + 1, c + 1, center[1])
        cv.px(c, c + 1, center[1])
        cv.px(c + 1, c, center[1])
    cv.outline(outline, selective=False)
    return cv


def hydrangea_head(rng, ramp, r=5):
    spr, ox, oy, m = leafy(rng, [(0, 0, r, r * 0.85), (-r * 0.4, r * 0.3, r * 0.7, r * 0.6)],
                           ramp, kind='blossom')
    return spr


_HEADS = {}


def head(kind, rng):
    if kind == 'daisy':
        return radial_head(10, 3, 0.9, 'white', 'cloud2', 'stone2', rot=rng.uniform(0, 1))
    if kind == 'cosmos':
        return radial_head(8, 4, 1.5, 'pink3', 'pink2', 'pink0', rot=rng.uniform(0, 1))
    if kind == 'cosmos_white':
        return radial_head(8, 4, 1.5, 'pink4', 'pink3', 'pink1', rot=rng.uniform(0, 1))
    if kind == 'spider_lily':
        return radial_head(6, 4, 0.8, 'red4', 'red3', 'red0', center=('red5', 'red2'),
                           rot=rng.uniform(0, 1), stamens=('red3', 'red5'))
    if kind == 'bellflower':
        return radial_head(5, 3, 1.7, 'purp3', 'purp2', 'purp0', center=('white', 'purp1'),
                           rot=-math.pi / 2)
    if kind == 'marigold':
        return radial_head(9, 3, 1.3, 'gold3', 'gold2', 'gold0', center=('wood2', 'wood1'),
                           rot=rng.uniform(0, 1))
    if kind == 'hydrangea_blue':
        return hydrangea_head(rng, ['sky0', 'sky1', 'sky2', 'sky3', 'sky4'], rng.uniform(4.5, 6))
    if kind == 'hydrangea_purple':
        return hydrangea_head(rng, ['purp0', 'purp1', 'purp2', 'purp3', 'pink4'], rng.uniform(4.5, 6))
    if kind == 'lavender':
        cv = Canvas(5, 11)
        for j in range(1, 10):
            cv.px(2, j, 'purp2')
            if j % 2:
                cv.px(1, j, 'purp3')
                cv.px(3, j, 'purp2')
            else:
                cv.px(1, j, 'purp2')
                cv.px(3, j, 'purp1')
        cv.px(2, 0, 'purp3')
        cv.outline('purp0', selective=False)
        return cv
    raise KeyError(kind)


KINDS = ['daisy', 'cosmos', 'cosmos_white', 'spider_lily', 'bellflower', 'marigold',
         'hydrangea_blue', 'hydrangea_purple', 'lavender']


def flower_plant(rng, kind, h=None, stems=None):
    """Rosette of real leaves + 1-3 swaying stems with heads."""
    big = kind.startswith('hydrangea')
    h = h or rng.randint(12, 24)
    stems = stems or (1 if big or kind == 'spider_lily' else rng.randint(1, 3))
    heads_ = [head(kind, rng) for _ in range(stems)]
    hw = max(hh.w for hh in heads_)
    w = hw + 16 + stems * 4
    H = h + max(hh.h for hh in heads_) + 4
    bx = w // 2
    # rosette (static) - spider lilies flower on bare stems
    ros = Canvas(w, H)
    if kind != 'spider_lily':
        nl = rng.randint(3, 4) + (2 if big else 0)
        for k in range(nl):
            a = -math.pi + (k + 0.5) * math.pi / nl + rng.uniform(-0.2, 0.2)
            L = rng.randint(3, 5) + (2 if big else 0)
            for (dx, dy, sd) in leaf_stamp(a, L, 1.4 + L * 0.12):
                ros.px(bx + dx, H - 2 + dy, 'leaf3' if sd > 0 else ('leaf2' if sd == 0 else 'leaf2'))
        ros.outline('leaf0', selective=False)
        for x in range(w):
            if ros.get(x, H - 1)[:3] == PAL['leaf0']:
                ros.px(x, H - 1, None)
    specs = []
    for i in range(stems):
        lean = (i - (stems - 1) / 2) * 3 + rng.uniform(-1, 1)
        specs.append((lean, h * rng.uniform(0.75, 1.0), rng.uniform(0, 6.28), heads_[i],
                      rng.randint(int(h * 0.3), int(h * 0.6))))
    out = []
    for f in range(F):
        cv = Canvas(w, H)
        for (lean, hs, ph, hd, leaf_j) in specs:
            pts = []
            n = int(hs)
            for j in range(n + 1):
                t = j / n
                x = bx + lean * t + _sw(f, ph, 1.2) * t * t
                pts.append((int(round(x)), H - 2 - j))
            for (x, y) in pts:
                cv.px(x, y, 'leaf2')
                cv.px(x + 1, y, 'leaf1')
            side = 1 if lean <= 0 else -1
            for jj in (leaf_j, min(n - 3, leaf_j + n // 3)):
                lx, ly = pts[max(0, jj)]
                for (dx, dy, sd) in leaf_stamp(math.atan2(-1, side * 1.4), 4, 1.3):
                    cv.px(lx + dx, ly + dy, 'leaf3' if sd > 0 else 'leaf2')
                side = -side
            tx, ty = pts[-1]
            cv.blit(hd, tx - hd.w // 2, ty - hd.h // 2 - 1)
        cv.blit(ros, 0, 0)
        out.append(cv)
    return out


# ---------------------------------------------------------------- strip
def meadow(width, ground, rng, rows, flower_kinds, flower_rate=0.25, wrap=True, height=270,
           fill_to=None, susuki_rate=0.0, fill=True):
    """Rows of tufts + flowers on a ground strip, as F frames.
    rows: [(y_offset, tuft_h, blades, dark, spacing)] back to front."""
    items = []
    for (yo, th, nb, dark, spc) in rows:
        x = rng.uniform(0, spc)
        while x < width:
            y = ground + yo + rng.randint(-1, 1)
            r = rng.random()
            if r < susuki_rate:
                fr = susuki(rng, int(th * rng.uniform(1.6, 2.2)))
            elif r < susuki_rate + flower_rate and flower_kinds:
                k = rng.choice(flower_kinds)
                fr = flower_plant(rng, k, h=int(th * rng.uniform(0.9, 1.6)))
            else:
                fr = tuft(rng, int(th * rng.uniform(0.7, 1.15)), nb + rng.randint(-1, 2), dark)
            items.append((y, x, fr))
            x += spc * rng.uniform(0.6, 1.2)
    items.sort(key=lambda it: it[0])
    frames = []
    for f in range(F):
        cv = Canvas(width, height, wrap=wrap)
        if fill:
            cv.rect(0, ground, width, (fill_to or height) - ground, 'leaf1')
            for x in range(width):
                cv.px(x, ground, 'leaf2')
        for (y, x, fr) in items:
            s = fr[f]
            cv.blit(s, int(x - s.w / 2), y - s.h + 1)
        frames.append(cv)
    return frames


def susuki(rng, h=None):
    """Japanese pampas grass: arching blades + feathery plumes that swing."""
    h = h or rng.randint(22, 34)
    w, H = 30, h + 6
    bx = w // 2
    blades = [(rng.uniform(-1, 1) * 9, rng.uniform(0.5, 0.85) * h, rng.uniform(0, 6.28)) for _ in range(6)]
    plumes = [(rng.uniform(-3, 3), rng.uniform(0.85, 1.0) * h, rng.uniform(0, 6.28)) for _ in range(rng.randint(2, 3))]
    out = []
    for f in range(F):
        cv = Canvas(w, H)
        for (lean, hb, ph) in blades:
            n = int(hb)
            for j in range(n + 1):
                t = j / n
                x = bx + lean * t * 1.2 + lean * t * t * 0.8 + _sw(f, ph, 1.0) * t * t
                cv.px(int(round(x)), H - 1 - j, 'leaf3' if t > 0.4 else 'leaf2')
                if t < 0.5:
                    cv.px(int(round(x)) + 1, H - 1 - j, 'leaf1')
        for (lean, hp, ph) in plumes:
            n = int(hp)
            top = None
            for j in range(n + 1):
                t = j / n
                x = bx + lean * t + _sw(f, ph, 2.0) * t * t
                cv.px(int(round(x)), H - 1 - j, 'paper1' if t > 0.6 else 'leaf2')
                top = (int(round(x)), H - 1 - j)
            px_, py_ = top
            dx = int(round(_sw(f, ph, 1.0)))
            for k in range(8):   # feathery plume, drooping to the swing side
                yy = py_ + k
                xx = px_ + (dx * k) // 4
                cv.px(xx, yy, 'paper4' if k < 3 else 'paper3')
                cv.px(xx - 1, yy, 'paper3' if k % 2 else 'paper2')
                if 1 < k < 7:
                    cv.px(xx + 1, yy, 'paper2')
                if k % 3 == 1:
                    cv.px(xx - 2, yy + 1, 'paper3')
        cv.outline('leaf0', selective=False)
        for x in range(w):
            if cv.get(x, H - 1)[:3] == PAL['leaf0']:
                cv.px(x, H - 1, None)
        out.append(cv)
    return out
