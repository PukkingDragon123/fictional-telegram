"""Polished teaware drawn the way a pixel artist would: hand-shaped
silhouettes (never perfect circles), cool shadows on white glaze, reflected
light on the shadow side, a crisp rim, a glossy tea surface with a
highlight, and a dark selective outline that softens on the lit side.

  teacup_saucer(tea)   cup + handle + saucer, seen from above-front
  yunomi(tea)          ribbed handleless cup (like the reference set)
  tetsubin()           cast-iron kettle with arare bumps and a rattan bail
  kyusu(), teapot_white()
"""
import math
import random
import numpy as np
from pixel import Canvas, PAL, step
from objects import outline

GLAZE = ['stone1', 'stone2', 'stone3', 'paper3', 'paper4', 'white']        # cool shadows -> warm lights
TEA = {
    'black': ['red0', 'red1', 'copper1', 'copper2', 'copper3'],
    'green': ['leaf1', 'leaf2', 'gold2', 'gold3', 'gold4'],
    'matcha': ['leaf1', 'leaf2', 'leaf3', 'leaf4', 'leaf5'],
    'hojicha': ['wood0', 'wood1', 'wood2', 'wood3', 'wood4'],
    'sencha': ['leaf2', 'leaf3', 'gold2', 'gold3', 'gold4'],
    'water': ['sky1', 'sky2', 'sky3', 'sky4', 'white'],
}


def _shade_cyl(cv, x0, y0, rows, ramp, spec_col='white', refl=True):
    """rows: list of (left, right) per y. Cylinder light from the upper
    left, reflected light on the far right edge, a vertical glint."""
    n = len(ramp)
    for i, (l, r) in enumerate(rows):
        y = y0 + i
        wdt = max(1, r - l)
        for x in range(int(round(l)), int(round(r))):
            u = (x + 0.5 - l) / wdt                    # 0 left .. 1 right
            v = math.cos((u - 0.3) * math.pi * 0.9)     # lit around u=0.3
            k = int(max(0, min(n - 1, (v * 0.5 + 0.5) * (n - 0.2))))
            if refl and u > 0.86:
                k = min(n - 1, k + 1)                  # bounce light off the saucer/counter
            cv.px(x, y, ramp[k])
        gx = int(round(l + wdt * 0.24))
        if 1 < i < len(rows) - 2:
            cv.px(gx, y, spec_col)


# ---------------------------------------------------------------- cup + saucer
def teacup_saucer(tea='black', w=46, h=34, seed=0, steam=False):
    rng = random.Random(seed)
    cv = Canvas(w, h)
    cx = w / 2 - 2
    # saucer: a hand-shaped flattened oval with a raised rim and a shallow well
    sy, srx, sry = h - 7, w / 2 - 1.5, 6.2
    for y in range(int(sy - sry) - 1, int(sy + sry) + 3):
        for x in range(w):
            dx, dy = (x + 0.5 - cx - 2) / srx, (y + 0.5 - sy) / sry
            wob = 1 + 0.03 * math.sin(math.atan2(dy, dx) * 3 + seed)
            d = dx * dx + dy * dy
            if d <= wob * wob:
                c = 'white' if dy < -0.35 else ('paper4' if dy < 0.25 else 'paper3')
                if d > 0.72 * wob * wob and dy > 0:
                    c = 'stone3'                       # underside of the rim, in shadow
                if d < 0.38 and dy > -0.5:
                    c = 'paper3'                       # the well
                if 0.33 < d < 0.42:
                    c = 'paper4' if dy > 0 else 'stone3'   # well edge
                cv.px(x, y, c)
            elif d <= (wob + 0.12) ** 2 and dy > 0.2:
                cv.px(x, y, 'stone2')                  # thickness of the saucer
    # cup body (tapered bowl), drawn row by row so the rim stays round
    top, bot = 7, h - 10
    rows = []
    for y in range(top, bot + 1):
        t = (y - top) / (bot - top)
        hw = 13.5 - 4.2 * t ** 1.6 + (0.3 if (y * 7 + seed) % 5 == 0 else 0)   # hand-thrown wobble
        rows.append((cx - hw, cx + hw))
    _shade_cyl(cv, 0, top, rows, GLAZE)
    # foot ring shadow on the saucer
    for x in range(int(cx - 9), int(cx + 10)):
        cv.px(x, bot + 1, 'stone2')
    # handle: a hand-drawn loop on the right, thick, with the hole showing through
    hx = cx + 13
    for k in range(32):
        a = math.radians(-80 + k * 160 / 31)
        for th in (0, 1, 2):
            x = hx + math.cos(a) * (5.5 + th * 0.9)
            y = top + 7 + math.sin(a) * (5.0 + th * 0.6)
            c = ['paper4', 'paper3', 'stone2'][th] if a < 0.2 else ['paper3', 'stone3', 'stone1'][th]
            cv.px(int(round(x)), int(round(y)), c)
    # rim: thick lip seen from above; tea inside with a dark edge and a highlight
    rx, ry = 13.5, 3.8
    ramp = TEA[tea]
    for y in range(int(top - ry) - 1, int(top + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - top) / ry
            d = dx * dx + dy * dy
            if d <= 1:
                if d > 0.7:
                    c = 'white' if dy < 0.2 else 'paper4'              # the lip
                elif dy < -0.35 and d > 0.45:
                    c = 'paper3'                                      # inner wall at the back
                else:
                    k = 2 + (1 if dx < -0.2 else 0) - (1 if dy < -0.2 else 0)
                    c = ramp[max(0, min(len(ramp) - 1, k))]
                cv.px(x, y, c)
    cv.px(int(cx - 6), top, ramp[-1]); cv.px(int(cx - 5), top, ramp[-1]); cv.px(int(cx - 4), top + 1, ramp[-2])
    if tea == 'matcha':
        for (dx, dy) in ((-3, 0), (1, 1), (4, 0), (-1, -1)):
            cv.px(int(cx + dx), top + dy, 'leaf5')
    # a floating tea leaf
    cv.px(int(cx + 3), top + 1, ramp[0]); cv.px(int(cx + 4), top + 1, ramp[1])
    return outline(cv)


# ---------------------------------------------------------------- yunomi
def yunomi(tea='matcha', w=22, h=30, seed=0):
    """Tall handleless cup with horizontal throwing ribs (reference set)."""
    cv = Canvas(w, h)
    body = ['wood1', 'wood3', 'paper2', 'paper3', 'paper4']
    cx = w / 2
    top, bot = 4, h - 3
    rows = []
    for y in range(top, bot + 1):
        t = (y - top) / (bot - top)
        hw = w / 2 - 1 - 0.8 * (2 * t - 1) ** 2 * 0 + 0.9 * math.sin(math.pi * t) - 0.9
        hw = w / 2 - 1.6 + 0.9 * math.sin(math.pi * t)
        rows.append((cx - hw, cx + hw))
    _shade_cyl(cv, 0, top, rows, body, spec_col='white')
    for i, y in enumerate(range(top + 4, bot - 2, 4)):     # throwing ribs: a soft groove
        l, r = rows[y - top]
        for x in range(int(round(l)) + 1, int(round(r)) - 1):
            cv.shift(x, y, -1)
    for x in range(int(round(rows[-1][0])) + 1, int(round(rows[-1][1])) - 1):   # foot
        cv.px(x, bot + 1, 'wood2'); cv.px(x, bot + 2, 'wood1')
    rx, ry = w / 2 - 1.6, 2.6
    ramp = TEA[tea]
    for y in range(int(top - ry) - 1, int(top + ry) + 2):
        for x in range(w):
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - top) / ry
            d = dx * dx + dy * dy
            if d <= 1:
                c = 'paper4' if d > 0.62 else ramp[3 if dx < -0.1 else 2]
                if d <= 0.62 and dy < -0.3:
                    c = ramp[1]
                cv.px(x, y, c)
    cv.px(int(cx - 3), top, ramp[-1]); cv.px(int(cx - 2), top, ramp[-1])
    return outline(cv)


# ---------------------------------------------------------------- tetsubin
def tetsubin(w=62, h=56):
    """Cast-iron kettle: a squat hand-shaped body, rows of arare bumps that
    follow the curve, a curved spout, domed lid and a rattan-wrapped bail."""
    cv = Canvas(w, h)
    iron = ['ink1', 'stone0', 'stone1', 'stone2', 'stone3']
    cx, by0, by1 = 27, 20, h - 3
    rows = []
    for y in range(by0, by1 + 1):
        t = (y - by0) / (by1 - by0)
        prof = 0.62 + 0.38 * math.sin(math.pi * min(1, 0.22 + t * 0.85)) ** 0.55
        hw = 23 * prof + (0.4 if y % 7 == 0 else 0)
        rows.append((cx - hw, cx + hw + 1))
    _shade_cyl(cv, 0, by0, rows, iron, spec_col='stone3', refl=True)
    # arare: cast bumps in staggered rows - catch light only on the lit side
    for i, y in enumerate(range(by0 + 4, by1 - 4, 5)):
        l, r = rows[y - by0]
        off = 2 if i % 2 else 0
        for x in range(int(l) + 4 + off, int(r) - 4, 5):
            u = (x - l) / (r - l)
            if u < 0.62:
                cv.px(x, y, 'stone3' if u < 0.35 else 'stone2')
            cv.px(x + 1, y + 1, 'ink1' if u > 0.3 else 'stone0')
    for (x, y) in ((cx + 10, by0 + 22), (cx + 12, by0 + 23), (cx - 14, by0 + 28), (cx + 3, by1 - 6)):
        cv.px(int(x), int(y), 'copper1'); cv.px(int(x) + 1, int(y), 'copper2')     # rust
    # waist band and the shadowed base
    for x in range(int(rows[-3][0]) + 1, int(rows[-3][1]) - 1):
        cv.px(x, by1 - 2, 'stone0')
    # spout: tapered, curving up and out to the right
    for k in range(14):
        t = k / 13
        sx = cx + 20 + k * 0.95
        sy = by0 + 16 - t * 13 - t * t * 2
        r = 3.2 - t * 1.5
        for d in range(int(-r), int(r) + 1):
            c = 'stone2' if d < -r * 0.3 else ('stone1' if d < r * 0.5 else 'ink1')
            cv.px(int(round(sx)), int(round(sy + d)), c)
    cv.px(int(cx + 33), by0 + 1, 'stone3')
    # domed lid with a brass knob
    for y in range(by0 - 4, by0 + 2):
        hw = 10 - (by0 + 1 - y) * 1.2
        for x in range(int(cx - hw), int(cx + hw) + 1):
            u = (x - cx + hw) / (2 * hw + 0.01)
            cv.px(x, y, 'stone2' if u < 0.35 else ('stone1' if u < 0.75 else 'stone0'))
    cv.hline(int(cx - 11), int(cx + 11), by0 + 1, 'ink1')
    cv.rect(int(cx - 2), by0 - 8, 5, 4, 'gold2'); cv.px(int(cx - 2), by0 - 8, 'gold4'); cv.px(int(cx + 2), by0 - 5, 'gold0')
    # bail handle, iron loops at the shoulders, rattan wrap in the middle
    for k in range(120):
        a = math.radians(180 + k * 1.5)
        x = cx + math.cos(a) * 21
        y = by0 + 1 + math.sin(a) * 17
        wrap = 225 < math.degrees(a) < 315
        c = ('gold3' if k % 3 else 'gold1') if wrap else 'stone2'
        cv.px(int(round(x)), int(round(y)), c)
        cv.px(int(round(x)), int(round(y)) + 1, 'gold0' if wrap else 'stone0')
    for side in (-1, 1):
        cv.rect(int(cx + side * 21) - 1, by0, 3, 3, 'stone1')
    return outline(cv)


def kyusu(w=56, h=38):
    """Red clay kyusu with a side handle - hand-shaped, matte with a soft sheen."""
    cv = Canvas(w, h)
    clay = ['red0', 'red1', 'red2', 'red3', 'red4']
    cx, y0, y1 = 28, 12, h - 3
    rows = []
    for y in range(y0, y1 + 1):
        t = (y - y0) / (y1 - y0)
        hw = 17 * (0.5 + 0.5 * math.sin(math.pi * min(1, 0.08 + t * 0.9)) ** 0.7) + (0.3 if y % 5 == 0 else 0)
        rows.append((cx - hw, cx + hw))
    _shade_cyl(cv, 0, y0, rows, clay, spec_col='red5')
    for k in range(12):                                    # spout
        t = k / 11
        x, y = cx + 15 + k, y0 + 12 - t * 10
        for d in range(-2, 3):
            cv.px(int(x), int(y + d * (1 - t * 0.4)), clay[3] if d < 0 else (clay[2] if d < 2 else clay[0]))
    for k in range(16):                                    # straight side handle, angled back-left
        x, y = cx - 16 - k, y0 + 9 - k * 0.45
        for d in range(-1, 3):
            cv.px(int(x), int(y + d), clay[3] if d < 0 else (clay[2] if d < 2 else clay[0]))
    cv.px(int(cx - 32), int(y0 + 2), clay[1])
    for y in range(y0 - 3, y0 + 2):                        # lid + knob
        hw = 11 - (y0 + 1 - y) * 1.3
        for x in range(int(cx - hw), int(cx + hw) + 1):
            cv.px(x, y, clay[3] if x < cx - hw * 0.3 else clay[2])
    cv.hline(int(cx - 12), int(cx + 12), y0 + 1, clay[0])
    cv.rect(cx - 2, y0 - 7, 4, 4, clay[2]); cv.px(cx - 2, y0 - 7, clay[4])
    cv.px(cx + 4, y0 - 1, None); cv.px(cx + 5, y0 - 1, clay[0])        # chipped lid
    return outline(cv)


def teapot_white(w=54, h=40):
    cv = Canvas(w, h)
    cx, y0, y1 = 25, 12, h - 3
    rows = []
    for y in range(y0, y1 + 1):
        t = (y - y0) / (y1 - y0)
        hw = 17 * (0.45 + 0.55 * math.sin(math.pi * min(1, 0.06 + t * 0.9)) ** 0.7)
        rows.append((cx - hw, cx + hw))
    _shade_cyl(cv, 0, y0, rows, GLAZE)
    for y in (y0 + 13, y0 + 14):                           # cobalt band
        l, r = rows[y - y0]
        for x in range(int(round(l)), int(round(r))):
            cv.px(x, y, 'indigo2' if (x - l) / (r - l) < 0.65 else 'indigo1')
    for k in range(14):
        t = k / 13
        x, y = cx + 16 + k, y0 + 14 - t * 12 - t * t * 2
        for d in range(-2, 3):
            cv.px(int(x), int(y + d * (1 - t * 0.4)), 'paper4' if d < 0 else ('paper3' if d < 2 else 'stone2'))
    for k in range(26):
        a = math.radians(100 + k * 160 / 25)
        for th in (0, 1, 2):
            x = cx - 16 + math.cos(a) * (6 + th * 0.8)
            y = y0 + 12 + math.sin(a) * (7 + th * 0.7)
            cv.px(int(round(x)), int(round(y)), ['paper4', 'paper3', 'stone2'][th])
    for y in range(y0 - 3, y0 + 2):
        hw = 11 - (y0 + 1 - y) * 1.3
        for x in range(int(cx - hw), int(cx + hw) + 1):
            cv.px(x, y, 'white' if x < cx - hw * 0.3 else 'paper3')
    cv.hline(int(cx - 12), int(cx + 12), y0 + 1, 'stone2')
    cv.rect(cx - 2, y0 - 7, 4, 4, 'paper3'); cv.px(cx - 2, y0 - 7, 'white')
    return outline(cv)
