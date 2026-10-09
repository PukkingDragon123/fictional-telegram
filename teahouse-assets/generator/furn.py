"""Furniture kit: perspective-correct boxes (we see the tops of things below
eye level and the undersides of things above it), wood faces with grain
and seams, inset panels, brass hardware."""
import math
import random
from pixel import Canvas, PAL, RAMPS, step, scribble
from shapes import wood_grain_h, wood_grain_v


def R(ramp, i):
    cols = RAMPS[ramp]
    return cols[max(0, min(len(cols) - 1, i))]


def wood_face(cv, x, y, w, h, rng, ramp='wood', base=3, grain='h', plank=None, knots=True, wear=0.0):
    """Wooden face with grain. plank = board size (px) to draw seams."""
    if w <= 0 or h <= 0:
        return
    c = R(ramp, base)
    if grain == 'h':
        wood_grain_h(cv, x, y, w, h, c, rng, dark=R(ramp, base - 1), light=R(ramp, base + 1), knots=knots)
        if plank:
            for yy in range(y + plank, y + h, plank):
                cv.hline(x, x + w - 1, yy, R(ramp, base - 2))
                cv.hline(x, x + w - 1, yy + 1, R(ramp, base + 1))
    else:
        wood_grain_v(cv, x, y, w, h, c, rng, dark=R(ramp, base - 1), light=R(ramp, base + 1), knots=knots)
        if plank:
            for xx in range(x + plank, x + w, plank):
                cv.vline(xx, y, y + h - 1, R(ramp, base - 2))
                cv.vline(xx + 1, y, y + h - 1, R(ramp, base + 1))
    if wear:
        for _ in range(int(w * h * wear / 40)):
            sx, sy = rng.randint(x, x + w - 3), rng.randint(y, y + h - 1)
            cv.hline(sx, sx + rng.randint(1, 4), sy, R(ramp, base + 1))


def box(cv, x, y, w, h, depth, rng, ramp='wood', base=3, grain='h', top_grain='h', plank=None,
        outline=True, edge_hi=True, top_base=None):
    """Front face at (x, y, w, h); a visible top (depth > 0, drawn above y)
    or underside (depth < 0, drawn below the front face)."""
    tb = base + 1 if top_base is None else top_base
    if depth > 0:
        wood_face(cv, x, y - depth, w, depth, rng, ramp, tb, top_grain, plank=None, knots=False)
        cv.hline(x, x + w - 1, y - depth, R(ramp, tb - 1))           # far edge
        if edge_hi:
            cv.hline(x, x + w - 1, y - 1, R(ramp, tb + 1))           # lit front lip
    wood_face(cv, x, y, w, h, rng, ramp, base, grain, plank=plank)
    cv.vline(x, y, y + h - 1, R(ramp, base + 1))
    cv.vline(x + w - 1, y, y + h - 1, R(ramp, base - 1))
    cv.hline(x, x + w - 1, y + h - 1, R(ramp, base - 1))
    if depth < 0:
        cv.rect(x, y + h, w, -depth, R(ramp, base - 2))
        cv.hline(x, x + w - 1, y + h, R(ramp, base - 1))
    if outline:
        y0 = y - max(0, depth)
        y1 = y + h + max(0, -depth)
        cv.frame(x - 1, y0 - 1, w + 2, y1 - y0 + 2, R(ramp, 0))


def inset(cv, x, y, w, h, ramp='wood', base=3, raised=True):
    """Recessed panel: shadow along the top/left inner lip, light along the
    bottom/right, optional raised field in the middle."""
    cv.rect(x, y, w, h, R(ramp, base - 1))
    cv.hline(x, x + w - 1, y, R(ramp, base - 3))
    cv.vline(x, y, y + h - 1, R(ramp, base - 3))
    cv.hline(x + 1, x + w - 1, y + h - 1, R(ramp, base + 1))
    cv.vline(x + w - 1, y + 1, y + h - 1, R(ramp, base + 1))
    if raised and w > 8 and h > 8:
        cv.rect(x + 3, y + 3, w - 6, h - 6, R(ramp, base))
        cv.hline(x + 3, x + w - 4, y + 3, R(ramp, base + 1))
        cv.vline(x + 3, y + 3, y + h - 4, R(ramp, base + 1))
        cv.hline(x + 3, x + w - 4, y + h - 4, R(ramp, base - 2))
        cv.vline(x + w - 4, y + 3, y + h - 4, R(ramp, base - 2))


def ring_pull(cv, cx, cy, r=3):
    """Brass drop-ring pull with backplate."""
    cv.rect(cx - 2, cy - 2, 5, 3, 'gold1')
    cv.px(cx - 1, cy - 2, 'gold3')
    for a in range(0, 360, 20):
        x = cx + int(round(math.cos(math.radians(a)) * r))
        y = cy + r + int(round(math.sin(math.radians(a)) * r))
        cv.px(x, y, 'gold3' if 150 < a < 300 else ('gold2' if a < 150 else 'gold1'))
    cv.px(cx + r, cy + r + 1, 'gold0')


def bar_pull(cv, cx, cy, w=10):
    cv.rect(cx - w // 2, cy, w, 3, 'gold1')
    cv.hline(cx - w // 2, cx + w // 2 - 1, cy, 'gold3')
    cv.px(cx - w // 2 + 1, cy + 1, 'gold4')
    cv.px(cx + w // 2 - 2, cy + 1, 'teal2')   # verdigris
    cv.hline(cx - w // 2 + 1, cx + w // 2 - 2, cy + 3, 'wood0')


def knob(cv, cx, cy):
    cv.rect(cx - 1, cy - 1, 3, 3, 'gold2')
    cv.px(cx - 1, cy - 1, 'gold4')
    cv.px(cx + 1, cy + 1, 'gold0')
    cv.px(cx + 2, cy + 1, 'wood0')


def nail(cv, x, y):
    cv.px(x, y, 'stone1')
    cv.px(x - 1, y - 1, 'stone3')


def label_tag(cv, rng, x, y, w, h, base='paper3', ink='wood1', lines=None):
    cv.rect(x, y, w, h, base)
    cv.hline(x, x + w - 1, y, step(PAL[base], 1))
    cv.hline(x, x + w - 1, y + h - 1, step(PAL[base], -1))
    cv.vline(x + w - 1, y, y + h - 1, step(PAL[base], -1))
    ly = y + 2
    while ly < y + h - 1:
        scribble(cv, rng, x + 2, ly, w - 4, ink)
        ly += 2 if h < 8 else 3


def soft_shadow(cv, x, y, w, h=3, steps=-1):
    """Contact shadow on whatever is already painted (ramp steps)."""
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            edge = min(xx - x, x + w - 1 - xx)
            if edge > 2 or (xx + yy) % 2 == 0:
                cv.shift(xx, yy, steps)
