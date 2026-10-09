"""Hand-built props for the cook room's prep table and the stores under
it (v3.3), drawn with the same care as the tea set. Every piece has a
clear silhouette, a single light from the upper left, and a real
material: woven bamboo, burlap, split oak, glazed and unglazed clay,
steel, copper.

  basket(...)        tapered bamboo basket, over-under weave, coiled rim
  leaf_heap(...)     a heap of single tea leaves with midribs, buds on top
  suribachi()        ridged grinding bowl with matcha, wooden pestle
  cutting_board()    thick hinoki board, chopped leaves, a nakiri knife
  sack()             burlap sack with a rope-tied neck, folds, a stencil, a tag
  firewood()         split logs stacked end-on: rings, cracks, bark
  bucket()           stave bucket with copper hoops and a still surface
  tsubo()            storage jar with an ash-glaze run, cloth-tied lid
  flower_basket()    shallow basket of dried chamomile, rosebuds, lavender
"""
import math
import random
import numpy as np
from pixel import Canvas, PAL, step, text
from shade import paint, lathe_shade, ellipse_mask, poly_mask
from objects import outline

STRAW = ['wood2', 'gold1', 'gold2', 'gold3', 'paper3']
LEAF = ['leaf1', 'leaf2', 'leaf3', 'leaf4', 'leaf5']
BURLAP = ['paper0', 'paper1', 'paper2', 'paper3']
CLAY = ['copper0', 'copper1', 'copper2', 'copper3']
STEEL = ['stone1', 'stone2', 'stone3', 'stone4', 'white']


def _put(cv, m, c, ox=0, oy=0):
    ys, xs = np.nonzero(m)
    for y, x in zip(ys, xs):
        cv.px(x + ox, y + oy, c)


# ---------------------------------------------------------------- leaves
def _leaf(cv, rng, x, y, ang, ln, ramp, lit=True):
    """One tea leaf: a pointed oval with a midrib."""
    ca, sa = math.cos(ang), math.sin(ang)
    wd = ln * 0.36
    for j in range(-int(ln), int(ln) + 1):
        for i in range(-int(wd) - 1, int(wd) + 2):
            u = j / ln
            half = wd * (1 - u * u) ** 0.8
            if abs(i) > half:
                continue
            px_, py_ = x + j * ca - i * sa, y + j * sa + i * ca
            side = i * (-sa) + j * 0                      # which half faces the light
            if i == 0 or (abs(i) < 0.6 and abs(u) < 0.8):
                c = ramp[1]                               # midrib
            elif (i < 0) == lit:
                c = ramp[3] if abs(u) < 0.6 else ramp[2]
            else:
                c = ramp[2] if abs(u) < 0.6 else ramp[1]
            cv.px(int(round(px_)), int(round(py_)), c)


def leaf_heap(w, h, seed=3):
    rng = random.Random(seed)
    cv = Canvas(w, h)
    leaves = []
    for _ in range(int(w * h / 9)):
        x = rng.uniform(3, w - 3)
        top = h * (1 - 0.95 * math.sqrt(max(0.0, 1 - ((x - w / 2) / (w / 2)) ** 2)))
        y = rng.uniform(top + 2, h - 2)
        leaves.append((y, x, rng.uniform(0, math.pi), rng.uniform(3.2, 5.2)))
    leaves.sort()
    for (y, x, ang, ln) in leaves:
        depth = (y - h * 0.1) / h                         # lower leaves are in shade
        ramp = LEAF if depth < 0.5 else ['leaf0', 'leaf1', 'leaf2', 'leaf3', 'leaf4']
        _leaf(cv, rng, x, y, ang, ln, ramp, lit=rng.random() < 0.6)
    for _ in range(int(w / 6)):                           # young buds catching the light
        x = rng.uniform(w * 0.2, w * 0.8)
        y = h * 0.2 + rng.uniform(0, h * 0.3)
        cv.px(int(x), int(y), 'leaf5'); cv.px(int(x) + 1, int(y) - 1, 'paper4')
    return cv


# ---------------------------------------------------------------- basket
def basket(w=62, h=34, contents=None, flare=0.12, seed=1):
    """h is the basket itself; heaped contents add their own height on top."""
    rng = random.Random(seed)
    extra = max(0, contents.h - 6) if contents is not None else 0
    cv = Canvas(w, h + extra)
    rim_y, rim_ry = 6 + extra, 4.5
    top_hw, bot_hw = w / 2 - 1, w / 2 * (1 - flare) - 1
    cx = w / 2
    # inside back wall
    for y in range(rim_y - 4, rim_y + 3):
        for x in range(w):
            if ((x + 0.5 - cx) / top_hw) ** 2 + ((y + 0.5 - rim_y) / rim_ry) ** 2 <= 1:
                cv.px(x, y, 'wood2' if y < rim_y else 'gold0')
    if contents is not None:
        cv.blit(contents, int(cx - contents.w / 2), rim_y + 2 - contents.h)
    # woven body: vertical stakes, horizontal weavers going over and under
    body_top, body_bot = rim_y + 1, h + extra - 2
    for y in range(body_top, body_bot + 1):
        t = (y - body_top) / (body_bot - body_top)
        hw = top_hw + (bot_hw - top_hw) * t ** 1.6           # rounded belly, tucked base
        row = (y - body_top) // 3
        for x in range(int(round(cx - hw)), int(round(cx + hw))):
            u = (x + 0.5 - cx) / hw                        # -1 .. 1 round the body
            stake = int((math.asin(max(-1, min(1, u))) + 2) * 7)
            over = (stake + row) % 2 == 0
            ry = (y - body_top) % 3
            c = (STRAW[3] if ry == 0 else STRAW[2]) if over else (STRAW[1] if ry < 2 else STRAW[0])
            if ry == 2 and over:
                c = STRAW[1]
            if u > 0.55:
                c = step(PAL[c], -1)                       # turning away from the light
            elif u < -0.6 and over and ry == 0:
                c = STRAW[4]
            cv.px(x, y, c)
    cv.hline(int(cx - bot_hw), int(cx + bot_hw) - 1, body_bot + 1, 'wood1')
    # coiled rim: a thick rope of split bamboo wound round
    for a in range(0, 360, 2):
        r = math.radians(a)
        for k in range(3):
            x = cx + math.cos(r) * (top_hw - k * 0.6)
            y = rim_y + math.sin(r) * (rim_ry - k * 0.4) + k
            if math.sin(r) < -0.1 and contents is not None and k == 2:
                continue
            twist = (a // 8) % 2
            c = STRAW[3] if (k == 0 and twist) else (STRAW[2] if k < 2 else STRAW[1])
            if math.cos(r) > 0.6:
                c = step(PAL[c], -1)
            cv.px(int(round(x)), int(round(y)), c)
    return outline(cv)


# ---------------------------------------------------------------- suribachi
def suribachi(w=36, h=30):
    cv = Canvas(w, h)
    cx, top = w / 2 - 2, 10
    body = lathe_shade(w - 4, h - top - 1, lambda t: (w - 4) / 2 * (1 - 0.35 * t ** 1.4),
                       ['wood0', 'wood1', 'copper1', 'copper2'], spec=0.06, spec_col='copper3', wobble=0.3)
    cv.blit(body, 0, top)
    rim = ellipse_mask(w, h, cx, top, (w - 4) / 2, 4.2, wobble=0)
    inner = ellipse_mask(w, h, cx, top + 0.5, (w - 4) / 2 - 2, 3.2, wobble=0)
    _put(cv, rim & ~inner, 'copper2')
    _put(cv, inner, 'copper1')
    for k in range(-5, 6):                                # kushime: combed ridges inside
        for j in range(4):
            x, y = cx + k * 2.4 * (1 - j / 5), top - 2 + j
            if inner[int(y), int(x)]:
                cv.px(int(x), int(y), 'copper0')
    _put(cv, ellipse_mask(w, h, cx + 1, top + 1.6, 6, 1.6, wobble=0) & inner, 'leaf3')     # ground matcha
    cv.px(int(cx), int(top + 1), 'leaf4')
    # surikogi: a long sansho-wood pestle leaning in
    for k in range(30):
        t = k / 29
        x, y = cx + 3 + t * 14, top + 1 - t * 10
        for d in range(-1, 2):
            c = 'paper3' if d < 0 else ('paper2' if d == 0 else 'wood3')
            cv.px(int(round(x + d * 0.4)), int(round(y + d)), c)
    cv.px(int(cx + 17), int(top - 9), 'wood2')
    return outline(cv)


# ---------------------------------------------------------------- cutting board
def cutting_board(seed=4):
    rng = random.Random(seed)
    w, h = 86, 22
    cv = Canvas(w, h)
    bx0, bx1, ty, fy = 0, 66, 7, 15
    for y in range(ty, fy):                               # top face, receding: lit hinoki
        t = (y - ty) / (fy - ty)
        inset = int((1 - t) * 2)
        for x in range(bx0 + inset, bx1 - inset):
            c = 'hinoki3' if (x * 7 + y * 3) % 23 > 2 else 'hinoki2'
            if y == ty:
                c = 'hinoki2'
            cv.px(x, y, c)
    for k in range(5):                                    # knife scores
        x = 14 + k * 9
        cv.px(x, 11 + k % 2, 'hinoki2'); cv.px(x + 1, 11 + k % 2, 'hinoki2')
    cv.rect(bx0, fy, bx1 - bx0, 5, 'hinoki2')             # thick front edge
    cv.hline(bx0, bx1 - 1, fy, 'hinoki4'); cv.hline(bx0, bx1 - 1, fy + 4, 'hinoki1')
    for y in range(fy + 1, fy + 4):                       # end grain on the right
        cv.px(bx1 - 1, y, 'hinoki1'); cv.px(bx1 - 2, y, 'hinoki3')
    heap = leaf_heap(24, 9, seed=11)
    cv.blit(heap, 6, 2)
    for _ in range(14):                                   # chopped bits scattered
        x, y = rng.randint(30, 44), rng.randint(9, 13)
        cv.px(x, y, rng.choice(('leaf2', 'leaf3', 'leaf4')))
    # nakiri knife: square-tipped blade, a bright honed edge, wooden handle, black ferrule
    blade = poly_mask(w, h, [(42, 7), (64, 7), (65, 9), (65, 13), (42, 14)])
    _put(cv, blade, 'stone3')
    cv.hline(42, 64, 7, 'stone4'); cv.hline(43, 64, 13, 'white'); cv.hline(43, 64, 14, 'stone1')
    cv.hline(44, 58, 9, 'stone4')
    cv.rect(65, 9, 3, 4, 'ink')
    cv.rect(68, 9, 16, 4, 'wood3'); cv.hline(68, 83, 9, 'wood4'); cv.hline(68, 83, 12, 'wood1')
    cv.px(83, 10, 'wood2'); cv.px(83, 11, 'wood2')
    return outline(cv)


# ---------------------------------------------------------------- sack
def sack(w=50, h=52, seed=5, mark='TEA'):
    rng = random.Random(seed)
    cv = Canvas(w, h)
    cx = w / 2
    # silhouette: slumped belly, gathered neck, frilled top above the tie
    pts = [(cx - 5, 9), (cx - 9, 14), (cx - 18, 24), (cx - 22, 36), (cx - 21, h - 4), (cx - 14, h - 1),
           (cx + 14, h - 1), (cx + 22, h - 5), (cx + 22, 34), (cx + 17, 22), (cx + 9, 14), (cx + 5, 9)]
    m = poly_mask(w, h, [(int(x), int(y)) for x, y in pts])
    paint(m, BURLAP, R=14, profile='soft', canvas=cv)
    # burlap weave in the mid tones
    ys, xs = np.nonzero(m)
    for y, x in zip(ys, xs):
        if (x + y) % 4 == 0 and cv.get(x, y)[:3] == PAL['paper2']:
            cv.px(x, y, 'paper1')
    # soft folds
    for (x0, y0, x1, y1) in ((cx - 10, 20, cx - 14, 40), (cx + 8, 22, cx + 12, 38), (cx - 2, 16, cx + 1, 30)):
        for k in range(18):
            t = k / 17
            x, y = x0 + (x1 - x0) * t + math.sin(t * 3) * 1.2, y0 + (y1 - y0) * t
            cv.px(int(x), int(y), 'paper1'); cv.px(int(x) + 1, int(y), 'paper3')
    # frilled top + rope tie
    top = poly_mask(w, h, [(int(cx - 7), 9), (int(cx - 9), 2), (int(cx - 4), 5), (int(cx), 0), (int(cx + 4), 5),
                           (int(cx + 9), 2), (int(cx + 7), 9)])
    paint(top, BURLAP, R=3, canvas=cv)
    for x in range(int(cx - 7), int(cx + 8)):
        cv.px(x, 10, 'wood1'); cv.px(x, 11, 'wood3' if x % 3 else 'wood2')
    cv.line(int(cx + 6), 11, int(cx + 10), 17, 'wood2'); cv.line(int(cx + 7), 11, int(cx + 12), 15, 'wood3')
    # stencilled mark in faded red runes, and a paper tag
    text(cv, int(cx - 7), 30, mark, 'red1')
    cv.hline(int(cx - 9), int(cx + 8), 37, 'red1')
    cv.rect(int(cx + 11), 16, 7, 9, 'paper4'); cv.hline(int(cx + 11), int(cx + 17), 24, 'paper2')
    cv.px(int(cx + 14), 17, 'wood1'); cv.hline(int(cx + 12), int(cx + 16), 20, 'wood2')
    # leaves escaping at the foot
    for k in range(7):
        cv.px(int(cx + 10 + k * 1.5), h - 2 + (k % 2) * 0, 'leaf2' if k % 2 else 'leaf3')
    return outline(cv)


# ---------------------------------------------------------------- firewood
def _log_end(cv, x, y, r, seed):
    rng = random.Random(seed)
    for yy in range(int(y - r) - 1, int(y + r) + 2):
        for xx in range(int(x - r) - 1, int(x + r) + 2):
            d = math.hypot(xx + 0.5 - x, (yy + 0.5 - y) * 1.05)
            if d > r:
                continue
            if d > r - 1.6:
                c = 'bark2' if (xx - x) + (yy - y) < 0 else 'bark0'      # bark ring
            else:
                ring = int(d * 1.3) % 3
                c = ('wood4', 'wood5', 'wood4')[ring]
                if d < 1.2:
                    c = 'wood2'
                if (xx - x) > r * 0.3 and (yy - y) > r * 0.3:
                    c = 'wood3'
            cv.px(xx, yy, c)
    a = rng.uniform(0, 6.28)                               # a drying crack from the heart
    for k in range(int(r)):
        cv.px(int(x + math.cos(a) * k), int(y + math.sin(a) * k), 'wood2')


def firewood(seed=6):
    cv = Canvas(78, 34)
    logs = [(14, 25, 8), (32, 26, 8.5), (50, 25, 7.5), (66, 26, 7), (23, 12, 7.5), (41, 12, 8), (58, 13, 7)]
    for i, (x, y, r) in enumerate(logs):
        for k in range(1, 6):                              # a sliver of bark down the side
            for yy in range(int(y - r), int(y + r)):
                if abs(yy - y) < r * 0.9:
                    cv.px(int(x + r - 1 + k), yy - k // 2, 'bark1' if k < 3 else 'bark0')
        _log_end(cv, x, y, r, seed + i)
    return outline(cv)


# ---------------------------------------------------------------- bucket
def bucket():
    w, h = 40, 38
    cv = Canvas(w, h)
    staves = lathe_shade(w, h - 7, lambda t: w / 2 - t * 3.5, ['wood1', 'wood2', 'wood3', 'wood4'], wobble=0)
    cv.blit(staves, 0, 7)
    for k in range(-3, 4):                                 # stave joints follow the curve
        u = k / 3.6
        for y in range(8, h):
            t = (y - 7) / (h - 7)
            x = w / 2 + u * (w / 2 - t * 3.5)
            cv.px(int(x), y, 'wood1')
    for y0 in (12, 28):                                    # copper hoops
        t = (y0 - 7) / (h - 7)
        hw = w / 2 - t * 3.5
        hoop = lathe_shade(int(hw * 2), 3, lambda tt: hw, ['copper1', 'copper2', 'copper3', 'copper4'], spec=0.2,
                           spec_col='gold4', wobble=0)
        cv.blit(hoop, int(w / 2 - hw), y0)
    rim = ellipse_mask(w, h, w / 2, 7, w / 2 - 0.5, 4.6, wobble=0)
    water = ellipse_mask(w, h, w / 2, 7.6, w / 2 - 3, 3.3, wobble=0)
    _put(cv, rim & ~water, 'wood4')
    _put(cv, water, 'water1')
    _put(cv, water & ~ellipse_mask(w, h, w / 2 + 1, 8.4, w / 2 - 4, 2.8, wobble=0), 'water0')
    cv.hline(int(w / 2 - 8), int(w / 2 + 2), 6, 'water2'); cv.px(int(w / 2 - 5), 7, 'white')
    return outline(cv)


# ---------------------------------------------------------------- tsubo
def tsubo():
    w, h = 36, 42
    cv = Canvas(w, h)
    top = 10

    def prof(t):
        return 6 + 11 * math.sin(math.pi * min(1.0, 0.12 + t * 0.95)) ** 0.7
    body = lathe_shade(w - 2, h - top, prof, ['wood0', 'wood1', 'copper1', 'copper2', 'copper3'], spec=0.08,
                       spec_col='copper4', wobble=0.5)
    cv.blit(body, 1, top)
    rng = random.Random(9)                                 # natural ash glaze running from the shoulder
    for y in range(top + 1, top + 6):                      # olive ash glaze pooled on the shoulder
        for x in range(w):
            p = cv.get(x, y)
            if p[3] and (x * 3 + y) % 7 != 0:
                cv.px(x, y, 'leaf1' if x > w * 0.6 else 'leaf2')
    for k in range(5):                                     # and a few short runs below it
        x = 9 + k * 4.5 + rng.uniform(-0.5, 0.5)
        ln = rng.randint(3, 7)
        for j in range(ln):
            if cv.get(int(x), top + 6 + j)[3]:
                cv.px(int(x), top + 6 + j, 'leaf1' if j < ln - 1 else 'leaf2')
    # cloth over the mouth, tied with string
    cloth = poly_mask(w, h, [(8, 11), (6, 6), (10, 2), (18, 0), (26, 2), (30, 6), (28, 11)])
    paint(cloth, ['indigo1', 'indigo2', 'indigo3', 'indigo4'], R=4, canvas=cv)
    for x in range(8, 29):
        cv.px(x, 10, 'paper3' if x % 2 else 'paper2')
    cv.line(27, 10, 31, 15, 'paper2'); cv.line(28, 10, 33, 13, 'paper3')
    for (x, y) in ((12, 4), (16, 3), (20, 4), (24, 5)):    # white shibori dots
        cv.px(x, y, 'paper4')
    return outline(cv)


# ---------------------------------------------------------------- dried flowers
def flower_basket():
    rng = random.Random(12)
    heap = Canvas(40, 12)
    for _ in range(26):                                    # chamomile heads
        x, y = rng.randint(3, 36), rng.randint(3, 10)
        heap.px(x, y, 'gold3'); heap.px(x - 1, y, 'paper4'); heap.px(x + 1, y, 'paper4'); heap.px(x, y - 1, 'paper4')
    for _ in range(12):                                    # dried rosebuds
        x, y = rng.randint(4, 35), rng.randint(2, 10)
        heap.px(x, y, 'red2'); heap.px(x, y - 1, 'red3'); heap.px(x, y + 1, 'leaf1')
    for _ in range(6):                                     # lavender sprigs
        x, y = rng.randint(5, 34), rng.randint(1, 6)
        for k in range(4):
            heap.px(x + k // 2, y + k, 'purp2' if k < 3 else 'leaf1')
    return basket(46, 26, heap, flare=0.2, seed=7)
