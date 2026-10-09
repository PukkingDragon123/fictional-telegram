"""The tea set on the room-3 counter, drawn with care (v3.3): every piece
has a deliberate silhouette, real materials and one light from the upper
left. Each piece is lathe-shaded or shaded from its silhouette. No lazy
cones or flat strips.

  runner   indigo cotton mat with seigaiha wave stitching and fringed ends
  kyusu    tokoname red-clay teapot: squat belly, short spout, side handle
  chawan   black raku bowl, a hand-pinched rim, frothy matcha seen from above
  chasen   bamboo whisk: handle with a node, thread at the waist, a bulb
           of tines curled in at the tips
  natsume  black lacquer caddy, a strong highlight, gold maki-e pine
  chashaku a bamboo scoop with its node and bent tip
"""
import math
import numpy as np
from pixel import Canvas, PAL
from shade import paint, lathe_shade, ellipse_mask, poly_mask
from objects import outline

CLAY = ['copper0', 'copper1', 'copper2', 'copper3', 'copper4']
RAKU = ['ink', 'stone0', 'stone1', 'stone2', 'stone3']
LACQ = ['ink', 'ink1', 'stone0', 'stone1', 'stone2']
BAMBOO = ['wood2', 'wood3', 'paper1', 'paper2', 'paper3', 'paper4']
MATCHA = ['leaf2', 'leaf3', 'leaf4', 'leaf5']


def _blit_mask(cv, m, c, ox=0, oy=0):
    ys, xs = np.nonzero(m)
    for y, x in zip(ys, xs):
        cv.px(x + ox, y + oy, c)


# ---------------------------------------------------------------- runner
def runner(w=196, h=16):
    """Lies flat on the counter: the far edge is slightly narrower."""
    cv = Canvas(w, h + 3)
    for y in range(h):
        inset = int(round((h - 1 - y) * 0.35))               # perspective on the ends
        for x in range(inset, w - inset):
            u = x - inset
            c = 'indigo2'
            if y < 2 or y >= h - 2:
                c = 'indigo1'                                 # folded hem
            elif y == 2 or y == h - 3:
                c = 'indigo3' if u % 4 < 2 else 'indigo2'     # running stitch along the hem
            else:
                # seigaiha: overlapping half-circle waves in pale stitching
                cell = 12
                cx = (u // cell) * cell + cell / 2 + (cell / 2 if ((y - 3) // 5) % 2 else 0)
                r = math.hypot((u - cx) * 0.9, (y - 3) % 5 * 2.4)
                if abs(r - 5) < 0.6 or abs(r - 2.6) < 0.5:
                    c = 'indigo3'
            cv.px(x, y, c)
        if y == 0:
            cv.hline(inset, w - inset - 1, 0, 'indigo3')
    for y in range(h):                                        # end shading
        inset = int(round((h - 1 - y) * 0.35))
        cv.px(inset, y, 'indigo1'); cv.px(w - inset - 1, y, 'indigo0')
    for x in range(1, w - 1, 2):                              # fringe on the front edge ends
        if x < 12 or x > w - 13:
            cv.vline(x, h, h + 1 + (x // 2) % 2, 'indigo3' if x % 4 == 1 else 'indigo2')
    for x in range(14, w - 14):                               # a soft fold across the middle
        if 60 < x < 140:
            cv.px(x, h - 6 + int(1.5 * math.sin(x * 0.08)), 'indigo1')
    return outline(cv)


# ---------------------------------------------------------------- kyusu
def kyusu(w=60, h=42):
    cv = Canvas(w, h)
    cx, top, bot = 31, 13, h - 3
    bh = bot - top

    def prof(t):
        # squat, round belly: broad shoulder up top, widest just below the middle, tucked foot
        shoulder = min(1.0, t / 0.18) ** 0.5
        foot = min(1.0, (1 - t) / 0.14) ** 0.6
        return (13 + 6.5 * math.sin(math.pi * (0.15 + 0.75 * t))) * (0.72 + 0.28 * shoulder) * (0.8 + 0.2 * foot)
    body = lathe_shade(40, bh, prof, CLAY, spec=0.06, spec_col='copper4', wobble=0.35)
    # side handle first (it sits behind the body's left edge): a hollow tapered tube
    hm = poly_mask(w, h, [(14, 22), (2, 15), (1, 19), (4, 22), (13, 28)])
    paint(hm, CLAY[:4], R=3, canvas=cv)
    cv.ellipse(2.5, 17, 2.0, 3.0, 'copper0'); cv.px(2, 16, 'copper1')     # its open end
    # spout: short and slightly upturned, rooted low on the right
    sm = poly_mask(w, h, [(46, 26), (53, 18), (57, 15), (59, 16), (55, 22), (49, 31)])
    paint(sm, CLAY[:4], R=3, canvas=cv)
    cv.px(58, 15, 'copper0'); cv.px(57, 15, 'copper1')
    cv.blit(body, cx - 20, top)
    # lid: shallow dome resting in the seat, knob on top
    for y in range(top - 3, top + 2):
        k = (top + 2 - y) / 5
        hw = 11 - k * k * 6
        for x in range(int(cx - hw), int(cx + hw) + 1):
            u = (x - cx) / max(1, hw)
            cv.px(x, y, 'copper3' if u < -0.2 else ('copper2' if u < 0.5 else 'copper1'))
    cv.hline(cx - 13, cx + 13, top + 2, 'copper0')              # the seam where lid meets body
    cv.hline(cx - 9, cx - 2, top - 1, 'copper4')
    knob = ellipse_mask(w, h, cx, top - 5, 3.0, 2.4, wobble=0)
    paint(knob, CLAY[1:], R=2, canvas=cv)
    cv.px(cx + 6, top - 2, 'copper0'); cv.px(cx + 7, top - 2, 'copper1')  # a chip on the lid
    for (x, y) in ((cx - 10, top + 10), (cx + 6, top + 18), (cx - 4, top + 23), (cx + 12, top + 9)):
        cv.px(x, y, 'copper1')                                # specks from the wood-fired kiln
    cv.hline(cx - 9, cx + 8, bot, 'copper0')
    return outline(cv)


# ---------------------------------------------------------------- chawan
def chawan(w=42, h=28):
    cv = Canvas(w, h)
    cx = w / 2
    top, bot = 7, h - 4

    def prof(t):
        return 19.5 - 3.5 * t ** 1.6                      # nearly straight walls, a slight taper
    body = lathe_shade(w - 2, bot - top, prof, RAKU, spec=0.08, spec_col='stone4', wobble=0.6)
    cv.blit(body, 1, top)
    # foot ring (kodai), unglazed clay
    for y in range(bot, bot + 3):
        hw = 8 - (y - bot) * 0.5
        for x in range(int(cx - hw), int(cx + hw)):
            cv.px(x, y, 'copper2' if x < cx else 'copper1')
    # thick glaze pooling in a drip on the side, a red kiln flush
    for y in range(top + 5, top + 12):                       # a thick glaze run, pooled at its end
        cv.px(int(cx + 6), y, 'stone2'); cv.px(int(cx + 7), y, 'stone1')
    cv.px(int(cx + 6), top + 12, 'stone3'); cv.px(int(cx + 7), top + 12, 'stone2')
    cv.px(int(cx + 6), top + 13, 'stone2')
    for (x, y) in ((cx - 12, top + 9), (cx - 11, top + 10), (cx - 13, top + 11)):
        cv.px(int(x), y, 'copper1')
    # the rim and the tea surface, seen from above
    rim = ellipse_mask(w, h, cx, top, 19.5, 5.2, wobble=0.04)
    inner = ellipse_mask(w, h, cx, top + 0.6, 17.6, 4.2, wobble=0.04)
    _blit_mask(cv, rim & ~inner, 'stone2')
    _blit_mask(cv, rim & ~inner & (np.indices((h, w))[0] < top - 1), 'stone3')
    _blit_mask(cv, inner, 'leaf3')
    back_wall = inner & ~ellipse_mask(w, h, cx, top + 1.6, 17, 3.8, wobble=0)
    _blit_mask(cv, back_wall & (np.indices((h, w))[0] < top), 'stone0')   # inside of the bowl
    foam = ellipse_mask(w, h, cx, top + 1.8, 15, 3.0, wobble=0.05)
    _blit_mask(cv, foam, 'leaf4')
    for (x, y, c) in ((cx - 6, top + 1, 'leaf5'), (cx - 2, top + 2, 'leaf5'), (cx + 4, top + 1, 'leaf5'),
                      (cx + 8, top + 2, 'leaf5'), (cx - 9, top + 2, 'leaf5'), (cx + 1, top + 3, 'paper4'),
                      (cx - 4, top + 3, 'leaf3'), (cx + 6, top + 3, 'leaf3')):
        cv.px(int(x), int(y), c)                             # tiny bubbles in the froth
    return outline(cv)


# ---------------------------------------------------------------- chasen
def chasen(w=20, h=34):
    cv = Canvas(w, h)
    cx = 10
    # handle: a bamboo cylinder with a node
    for y in range(0, 12):
        for x in range(cx - 3, cx + 3):
            u = (x + 0.5 - cx) / 3
            c = 'paper4' if u < -0.4 else ('paper3' if u < 0.3 else 'paper1')
            cv.px(x, y, c)
    cv.hline(cx - 3, cx + 2, 5, 'paper1'); cv.hline(cx - 3, cx + 2, 6, 'paper4')        # node
    cv.hline(cx - 2, cx + 1, 0, 'paper2')
    # thread binding at the waist
    cv.hline(cx - 4, cx + 3, 12, 'ink'); cv.hline(cx - 4, cx + 3, 13, 'wood1')
    # the bulb of tines: outer tines bow out and curl back in; inner tines bunch in the middle
    bulb_top, bulb_bot = 14, h - 3
    span = bulb_bot - bulb_top
    for y in range(bulb_top, bulb_bot + 1):                  # fill the bulb: fine vertical tines
        t = (y - bulb_top) / span
        hw = 3 + 6 * math.sin(math.pi * min(1.0, t * 0.95)) ** 0.8
        for x in range(int(round(cx - 0.5 - hw)), int(round(cx - 0.5 + hw)) + 1):
            u = (x + 0.5 - (cx - 0.5)) / max(1, hw)
            if x % 2 == 0:
                c = 'paper4' if u < -0.35 else ('paper3' if u < 0.35 else 'paper2')
            else:
                c = 'paper3' if u < -0.35 else ('paper2' if u < 0.35 else 'paper1')
            if abs(u) < 0.28 and 0.15 < t < 0.8:
                c = 'paper1' if x % 2 else 'wood3'            # inner bundle seen between the outer tines
            cv.px(x, y, c)
    for k in range(-4, 5):                                   # tips curl inwards: a scalloped hem
        x = int(round(cx - 0.5 + k * 1.6))
        cv.px(x, bulb_bot + 1, 'paper2' if k < 2 else 'paper1')
        if k % 2 == 0:
            cv.px(x, bulb_bot + 2, 'wood3')
    return outline(cv)


# ---------------------------------------------------------------- natsume
def natsume(w=28, h=26):
    cv = Canvas(w, h)
    top, bot = 4, h - 2

    def prof(t):
        edge = min(1.0, t / 0.12, (1 - t) / 0.12)            # rounded top and bottom edges
        return 12.5 * (0.82 + 0.18 * math.sin(math.pi * t)) * (0.55 + 0.45 * math.sqrt(max(0, edge)))
    body = lathe_shade(w - 2, bot - top, prof, LACQ, spec=0.22, spec_col='cloud2', wobble=0.2)
    cv.blit(body, 1, top)
    lid_y = top + int((bot - top) * 0.38)
    cv.hline(3, w - 4, lid_y, 'ink'); cv.hline(4, w - 5, lid_y + 1, 'stone1')      # lid seam
    for y in range(top + 2, bot - 2):                        # a long glossy highlight
        if y not in (lid_y, lid_y + 1):
            cv.px(7, y, 'stone3'); cv.px(8, y, 'cloud2' if y < lid_y else 'stone3')
    # gold maki-e: a pine bough sweeping across the lid seam
    for (x, y) in ((13, 11), (14, 10), (15, 10), (16, 9), (17, 9), (18, 10), (12, 12), (11, 13), (10, 14)):
        cv.px(x, y, 'gold2')
    for (cx_, cy_) in ((16, 8), (19, 9), (12, 11)):
        for (dx, dy) in ((-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0)):
            cv.px(cx_ + dx, cy_ + dy, 'gold3')
        cv.px(cx_, cy_ - 2, 'gold4')
    for (x, y) in ((18, 16), (19, 17), (20, 16), (19, 15)):
        cv.px(x, y, 'gold3')                                  # a small blossom lower down
    cv.px(19, 16, 'red3')
    return outline(cv)


# ---------------------------------------------------------------- chashaku
def chashaku(w=40, h=9):
    cv = Canvas(w, h)
    for x in range(w - 5):
        t = x / (w - 5)
        y = 5 - int(round(1.6 * math.sin(math.pi * t)))      # a gentle bow along its length
        cv.px(x, y, 'paper3'); cv.px(x, y + 1, 'paper2'); cv.px(x, y + 2, 'wood3')
        if x % 7 == 3:
            cv.px(x, y, 'paper4')
    nx = 18                                                  # the node
    cv.vline(nx, 2, 6, 'wood2'); cv.vline(nx + 1, 2, 6, 'paper4')
    for k in range(5):                                       # the bent scoop tip
        cv.px(w - 5 + k, 5 - k // 2, 'paper3'); cv.px(w - 5 + k, 6 - k // 2, 'paper1')
    cv.px(w - 1, 2, 'paper2'); cv.px(w - 2, 3, 'wood3')
    return outline(cv)
