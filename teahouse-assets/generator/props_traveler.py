"""Room 4 - the traveler's things, drawn for realism: everything is shaded as
a solid lit from the upper left (height-field shading from its silhouette),
with worn edges, contact shadows and small true-to-life details.

  travel_trunk      wooden trunk with leather straps, brass corners and lock, a folded blanket over it
  traveler_pack     canvas rucksack: rolled bedroll on top, buckled flap, side pocket, tin cup
  leather_boots     a pair of worn boots, one standing, one slumped over, laces trailing
  hibachi_brazier   glazed brazier with ash, glowing charcoal and iron tongs (embers pulse, sparks rise)
  wall_shelf        plank shelf on carved brackets: folded linen, a clay bottle, a box, a candle stub,
                    a rolled map tied with cord, dried lavender in a cup
  bronze_mirror     round bronze mirror on a cord, with a tassel, patina at the rim
  pegs_rope_satchel wooden pegs with a coil of rope and a leather satchel
  herb_bundle       dried herbs hanging head-down from a nail on the post
"""
import math
import random
import numpy as np
from pixel import Canvas, PAL, step
from propkit import prop
from furn import R, wood_face
from shade import paint, lathe_shade, ellipse_mask, poly_mask, mask_of
import objects as O
import woodgrain as WG

F8 = 8
CANVAS = ['paper0', 'paper1', 'paper2', 'paper3', 'paper4']
LEATHER = ['wood0', 'wood1', 'copper1', 'copper2', 'copper3']
DARK_LEATHER = ['ink', 'wood0', 'wood1', 'wood2', 'copper2']
BLANKET = ['indigo0', 'indigo1', 'indigo2', 'indigo3', 'indigo4']
LINEN = ['paper1', 'paper2', 'paper3', 'paper4', 'white']
RUST = ['red0', 'copper1', 'copper2', 'copper3', 'copper4']


def _blit_mask(cv, m, ramp, ox=0, oy=0, R_=None, profile='round', amb=0.25, spec=0.0, spec_col=None, dither=0.0):
    paint(m, ramp, R=R_, profile=profile, amb=amb, spec=spec, spec_col=spec_col, dither=dither,
          canvas=cv, ox=ox, oy=oy)


def _strap(cv, x, y0, y1, w, ramp=DARK_LEATHER):
    for yy in range(y0, y1):
        cv.hline(x, x + w - 1, yy, ramp[2])
        cv.px(x, yy, ramp[3]); cv.px(x + w - 1, yy, ramp[1])
        if yy % 5 == 0:
            cv.px(x + w // 2, yy, ramp[1])                                   # stitching


def _buckle(cv, x, y, w=6, h=5):
    cv.frame(x, y, w, h, 'gold2')
    cv.hline(x, x + w - 1, y, 'gold4'); cv.vline(x, y, y + h - 1, 'gold3')
    cv.hline(x, x + w - 1, y + h - 1, 'gold1')
    cv.vline(x + w // 2, y + 1, y + h - 2, 'stone3')                     # tongue


# ---------------------------------------------------------------- trunk
@prop('travel_trunk', 4, 'floor', 2296, 308, 'Wooden travel trunk with leather straps and buckles, brass corners and '
      'lock plate, scuffed; an indigo blanket folded over the lid')
def travel_trunk():
    rng = random.Random(404)
    w, h = 82, 46
    cv = Canvas(w, h)
    top_d, fy, fh = 12, 14, 30                                           # lid top depth, front face y and height
    # body: planks with grain, lid seam, the lid's top in perspective
    wood_face(cv, 1, fy, w - 2, fh, rng, 'wood', 2, 'h', plank=10)
    pts = [(4, 2), (w - 5, 2), (w - 1, fy), (1, fy)]
    m = poly_mask(w, h, pts)
    ys, xs = np.nonzero(m)
    for y, x in zip(ys, xs):
        cv.px(x, y, 'wood3' if (y + x // 9) % 4 else 'wood2')
    WG.grain_pass(cv, 1, 2, w - 1, fy, 'h', seed=4.0, board=4, ramps=('wood',))
    cv.hline(4, w - 5, 2, 'wood1'); cv.hline(1, w - 2, fy - 1, 'wood4')
    cv.hline(1, w - 2, fy + 8, 'wood0'); cv.hline(1, w - 2, fy + 9, 'wood3')    # lid seam
    cv.vline(1, fy, fy + fh - 1, 'wood3'); cv.vline(w - 2, fy, fy + fh - 1, 'wood0')
    cv.hline(1, w - 2, fy + fh - 1, 'wood0')
    # brass corner caps and the lock plate
    for (cx, cy) in ((1, fy), (w - 8, fy), (1, fy + fh - 7), (w - 8, fy + fh - 7)):
        m = np.zeros((7, 7), bool)
        for yy in range(7):
            for xx in range(7):
                m[yy, xx] = (xx < 3 or yy < 3) if cy == fy else (xx < 3 or yy > 3)
                if cx > w // 2:
                    m[yy, xx] = (xx > 3 or yy < 3) if cy == fy else (xx > 3 or yy > 3)
        _blit_mask(cv, m, O.BRASS, cx, cy, R_=2, spec=0.15, spec_col='gold4')
        cv.px(cx + 1, cy + 1, 'gold0'); cv.px(cx + 5, cy + 5, 'gold0')    # rivets
    lm = ellipse_mask(10, 12, 5, 6, 4.6, 5.6, wobble=0)
    _blit_mask(cv, lm, O.BRASS, w // 2 - 5, fy + 5, R_=3, spec=0.2, spec_col='gold4')
    cv.px(w // 2, fy + 11, 'ink'); cv.px(w // 2, fy + 12, 'ink')         # keyhole
    # leather straps round the trunk, with buckles
    for sx in (16, w - 22):
        _strap(cv, sx, 2, fy + fh - 1, 6)
        _buckle(cv, sx, fy + 12)
    # an indigo blanket folded over the left of the lid, hanging down the front
    bm = poly_mask(w, h, [(4, 0), (34, 0), (37, 4), (36, fy + 15), (31, fy + 19), (27, fy + 15), (21, fy + 20),
                          (15, fy + 16), (9, fy + 21), (5, fy + 14), (3, 4)])
    _blit_mask(cv, bm, BLANKET, 0, 0, R_=5, amb=0.3)
    for x in range(4, 37):                                               # woven stripes, folds
        for y in range(0, fy + 21):
            if bm[y, x] and y in (fy - 2, fy - 1):
                cv.px(x, y, 'paper3' if x % 2 else 'paper2')
            if bm[y, x] and (x in (14, 25)) and y > fy:
                cv.px(x, y, 'indigo0')
    for x in (6, 10, 16, 20, 23, 28, 32):                                 # fringe at the hanging edge
        for k in range(1, 3):
            yy = fy + 14 + (x % 5) + k
            if yy < h:
                cv.px(x, yy, 'indigo3' if k == 1 else 'indigo2')
    # scuffs on the wood
    for _ in range(14):
        sx, sy = rng.randint(40, w - 10), rng.randint(fy + 2, fy + fh - 3)
        cv.hline(sx, sx + rng.randint(1, 3), sy, 'wood4')
    return O.outline(cv)


# ---------------------------------------------------------------- pack
@prop('traveler_pack', 4, 'floor', 2378, 306, "Canvas traveler's pack leaning on the trunk: rolled bedroll strapped on "
      'top, buckled flap, side pocket, a tin cup hanging from a cord')
def traveler_pack():
    w, h = 44, 50
    cv = Canvas(w, h)
    body = poly_mask(w, h, [(8, 14), (34, 12), (39, 22), (40, 44), (35, 49), (9, 49), (4, 42), (5, 22)])
    _blit_mask(cv, body, CANVAS, R_=8, amb=0.25)
    yy, xx = np.mgrid[0:h, 0:w]
    for y, x in zip(*np.nonzero(body & ((xx + yy) % 3 == 0) & ((xx * 7 + yy * 3) % 11 < 3))):
        cv.px(x, y, step(PAL[CANVAS[1]], 0))                               # canvas weave
    for (x0, y0, x1, y1) in ((12, 30, 16, 46), (28, 28, 25, 46)):          # folds in the canvas
        cv.line(x0, y0, x1, y1, 'paper1')
    flap = poly_mask(w, h, [(7, 14), (35, 13), (37, 28), (30, 31), (14, 31), (6, 27)])
    _blit_mask(cv, flap, ['wood1', 'copper1', 'copper2', 'copper3', 'paper2'], R_=4, amb=0.3)
    for sx in (13, 26):
        _strap(cv, sx, 24, 40, 4)
        _buckle(cv, sx - 1, 37, 6, 4)
    pk = poly_mask(w, h, [(33, 30), (41, 31), (42, 44), (35, 46)])        # side pocket
    _blit_mask(cv, pk, CANVAS, R_=3, amb=0.2)
    # rolled bedroll on top: a cylinder lying across, spiral end showing
    for x in range(2, w - 2):
        for y in range(3, 15):
            ty = (y - 3) / 11.0
            v = 0.25 + 0.75 * math.sin(math.pi * ty) * (1 - 0.35 * ty)
            c = BLANKET[min(4, int(v * 5))] if (x // 6) % 2 else ['red0', 'red1', 'red2', 'red3', 'red4'][min(4, int(v * 5))]
            cv.px(x, y, c)
    for r in (5, 3, 1):                                                  # rolled end
        for a in range(0, 360, 12):
            cv.px(int(3 + math.cos(math.radians(a)) * r * 0.5), int(9 + math.sin(math.radians(a)) * r), 'indigo3' if r == 3 else 'indigo1')
    for sx in (10, 30):
        cv.vline(sx, 3, 14, 'wood1'); cv.vline(sx + 1, 3, 14, 'copper2')     # ties round the roll
    # tin cup hanging from a cord on the right
    cv.line(39, 22, 41, 30, 'paper1')
    cup = lathe_shade(8, 8, lambda t: 3.5, O.IRON[1:], spec=0.2)
    cv.blit(cup, 36, 30)
    return O.outline(cv)


# ---------------------------------------------------------------- boots
@prop('leather_boots', 4, 'floor', 2440, 322, 'A pair of worn leather boots, one standing, one slumped on its side, '
      'laces trailing, dried mud on the soles')
def leather_boots():
    w, h = 46, 32
    cv = Canvas(w, h)
    stand = poly_mask(w, h, [(4, 2), (13, 2), (14, 18), (24, 22), (25, 29), (3, 29), (3, 16)])
    _blit_mask(cv, stand, LEATHER, R_=4, amb=0.25, spec=0.08, spec_col='copper4')
    cv.hline(3, 25, 29, 'wood0'); cv.hline(3, 24, 28, 'stone2')             # sole and mud
    for k in range(3):                                                      # creases at the ankle
        cv.line(4, 14 + k * 3, 12, 15 + k * 3, 'wood1')
    for y in range(4, 16, 3):                                               # laces
        cv.px(13, y, 'paper3'); cv.px(12, y + 1, 'paper2')
    cv.hline(4, 13, 2, 'copper3')
    slump = poly_mask(w, h, [(22, 20), (33, 12), (42, 15), (44, 22), (40, 29), (26, 30), (22, 27)])
    _blit_mask(cv, slump, LEATHER, R_=4, amb=0.22)
    cv.ellipse(38, 16, 3.2, 2.2, 'wood0')                                   # the open top, dark inside
    cv.line(26, 30, 40, 30, 'stone2')
    cv.line(36, 20, 31, 27, 'paper3'); cv.line(31, 27, 33, 31, 'paper2')    # lace trailing on the floor
    return O.outline(cv)


# ---------------------------------------------------------------- brazier
def _brazier(f):
    rng = random.Random(77)
    w, h = 46, 46
    cv = Canvas(w, h)
    bowl = lathe_shade(40, 22, lambda t: 19.5 - 3 * t * t, ['indigo0', 'indigo1', 'teal1', 'teal2', 'teal3'],
                       spec=0.12, spec_col='cloud2')
    cv.blit(bowl, 3, 22)
    cv.ellipse(23, 23, 19.5, 6, 'teal1')                                    # the rim
    cv.ellipse(23, 23, 17.5, 5, 'stone2')                                   # ash bed
    for _ in range(60):
        ax, ay = rng.uniform(8, 38), rng.uniform(19, 27)
        if ((ax - 23) / 17) ** 2 + ((ay - 23) / 4.6) ** 2 < 1:
            cv.px(int(ax), int(ay), rng.choice(('stone3', 'stone1', 'stone2', 'cloud1')))
    # charcoal pieces, glowing from inside; the glow breathes
    pulse = 0.5 + 0.5 * math.sin(2 * math.pi * f / F8)
    for k, (cx, cy, r) in enumerate(((17, 21, 3.4), (24, 20, 3.8), (30, 22, 3.0), (21, 24, 2.8), (28, 25, 2.6))):
        for yy in range(int(cy - r), int(cy + r) + 1):
            for xx in range(int(cx - r), int(cx + r) + 1):
                d = math.hypot(xx - cx, (yy - cy) * 1.4) / r
                if d <= 1:
                    hot = (1 - d) * (0.6 + 0.4 * math.sin(2 * math.pi * f / F8 + k * 1.3))
                    c = 'ink' if d > 0.8 else ('fire4' if hot > 0.55 else ('fire3' if hot > 0.35 else
                                                                         ('fire2' if hot > 0.18 else 'red0')))
                    if (xx + yy * 2 + k) % 5 == 0 and d < 0.8:
                        c = 'stone1'                                              # cracks of grey ash on the coal
                    cv.px(xx, yy, c)
    # iron tongs (hibashi) stuck in the ash
    cv.line(32, 21, 40, 2, 'stone1'); cv.line(33, 21, 42, 3, 'stone2'); cv.px(41, 2, 'stone3')
    # sparks rising
    for k in range(4):
        t = ((f + k * 2) % F8) / F8
        sx = 22 + k * 3 + math.sin(t * 6 + k) * 2
        sy = 17 - t * 16
        if sy > 0:
            cv.px(int(sx), int(sy), 'fire4' if t < 0.5 else 'fire3')
    glow = int(70 + 50 * pulse)
    out = O.outline(cv)
    return out


@prop('hibachi_brazier', 4, 'floor', 1994, 300, 'Glazed hibachi brazier: ash, glowing charcoal that breathes, iron tongs, '
      'sparks rising (8 frames)', fps=6)
def hibachi_brazier():
    return [_brazier(f) for f in range(F8)]


# ---------------------------------------------------------------- wall shelf
@prop('wall_shelf', 4, 'wall', 2262, 96, 'Plank shelf on carved brackets: folded linen, a clay bottle, a small box with '
      'a brass clasp, a candle stub, a rolled map tied with cord, dried lavender in a cup')
def wall_shelf():
    rng = random.Random(96)
    w, h = 150, 48
    cv = Canvas(w, h)
    top = 32
    wood_face(cv, 0, top, w, 5, rng, 'wood', 3, 'h')
    cv.hline(0, w - 1, top, 'wood4'); cv.hline(0, w - 1, top + 4, 'wood0')
    for bx in (14, w - 22):                                               # carved brackets
        m = poly_mask(8, 12, [(0, 0), (7, 0), (7, 3), (3, 11), (0, 11)])
        _blit_mask(cv, m, ['wood0', 'wood1', 'wood2', 'wood3'], bx, top + 5, R_=2)
    # folded linen: three garments stacked
    for k, (ramp, hh) in enumerate(((BLANKET, 6), (LINEN, 5), (RUST, 6))):
        y0 = top - 6 * (k + 1) + (1 if k == 1 else 0)
        m = np.zeros((hh, 30), bool)
        m[:, 1:29] = True
        m[0, 1] = m[0, 28] = m[hh - 1, 1] = m[hh - 1, 28] = False
        _blit_mask(cv, m, ramp, 3 + k, y0, R_=3, profile='flat', amb=0.3)
        cv.hline(4 + k, 30 + k, y0 + hh // 2, ramp[1])                     # the fold line
    # clay bottle (tokkuri)
    bottle = lathe_shade(12, 22, lambda t: 1.6 if t < 0.25 else 1.6 + 4.2 * math.sin(math.pi * min(1, (t - 0.2) / 0.85)),
                         ['red0', 'copper1', 'copper2', 'copper3', 'paper2'], spec=0.1, spec_col='paper4')
    cv.blit(bottle, 42, top - 22)
    cv.px(48, top - 22, 'wood1')
    # small wooden box with a brass clasp
    wood_face(cv, 60, top - 9, 18, 9, rng, 'wood', 2, 'h')
    cv.rect(60, top - 12, 18, 3, 'wood3'); cv.hline(60, 77, top - 12, 'wood4')
    cv.rect(68, top - 8, 2, 3, 'gold3')
    cv.frame(59, top - 13, 20, 13, 'wood0')
    # candle stub on a dish, wax drips
    cv.ellipse(88, top - 1, 5, 1.5, 'stone3')
    cv.rect(86, top - 8, 4, 7, 'paper4'); cv.vline(89, top - 8, top - 2, 'paper2')
    cv.px(86, top - 4, 'paper3'); cv.px(85, top - 2, 'paper3')
    cv.px(88, top - 9, 'ink')
    # rolled map lying, tied with red cord
    for x in range(96, 124):
        for y in range(top - 6, top):
            t = (y - (top - 6)) / 5.0
            cv.px(x, y, LINEN[min(4, int((0.3 + 0.7 * math.sin(math.pi * t)) * 4))])
    for r, c in ((2.6, 'paper1'), (1.6, 'paper2'), (0.6, 'paper0')):
        cv.ellipse(124, top - 3, r * 0.7, r, c)
    cv.vline(108, top - 6, top - 1, 'red2'); cv.vline(109, top - 6, top - 1, 'red1'); cv.px(110, top, 'red2')
    # dried lavender in a little cup
    cupc = lathe_shade(10, 9, lambda t: 3.6 + 0.8 * t, ['jade0', 'jade1', 'jade2', 'jade3'], spec=0.1)
    cv.blit(cupc, 132, top - 9)
    for k in range(9):
        a = math.radians(-60 + k * 15)
        x0, y0 = 137, top - 9
        ln = rng.randint(10, 15)
        for t in range(ln):
            x = int(x0 + math.sin(a) * t * 0.6)
            y = int(y0 - t)
            cv.px(x, y, 'leaf2' if t < ln - 4 else ('purp2' if t % 2 else 'purp3'))
    return O.outline(cv)


# ---------------------------------------------------------------- mirror
@prop('bronze_mirror', 4, 'wall', 2316, 140, 'Round bronze mirror hanging on a cord from a nail, with a tassel; polished '
      'face catching the window light, green patina at the rim')
def bronze_mirror():
    w, h = 32, 50
    cv = Canvas(w, h)
    cv.px(16, 0, 'stone2')
    cv.line(16, 1, 8, 12, 'red2'); cv.line(16, 1, 24, 12, 'red2')           # cord from the nail
    rim = ellipse_mask(30, 30, 15, 15, 14, 14, wobble=0)
    _blit_mask(cv, rim, ['copper0', 'copper1', 'gold1', 'gold2', 'gold3'], 1, 10, R_=3, spec=0.1, spec_col='gold4')
    face = ellipse_mask(30, 30, 15, 15, 11.5, 11.5, wobble=0)
    yy, xx = np.mgrid[0:30, 0:30]
    for y, x in zip(*np.nonzero(face)):
        # polished bronze reflecting the dim room: warm and dark, brighter toward the
        # upper left, a small pale patch where the window is
        d = math.hypot(x - 10, y - 10) / 18.0
        v = 0.85 - 0.6 * d + 0.08 * math.sin(x * 0.7 + y * 0.3)
        c = 'gold3' if v > 0.62 else ('gold2' if v > 0.42 else ('gold1' if v > 0.24 else 'copper1'))
        if 8 <= x <= 12 and 8 <= y <= 13:
            c = 'cloud1' if (x + y) % 2 else 'haze3'                          # the window, reflected
        if (x == 10 and 8 <= y <= 13) or (y == 10 and 8 <= x <= 12):
            c = 'gold1'                                                       # its lattice
        cv.px(x + 1, y + 10, c)
    cv.px(9, 15, 'paper4'); cv.px(10, 15, 'gold4')                         # a soft glint
    for (px_, py_) in ((5, 16), (6, 18), (25, 31), (24, 33), (27, 26)):    # patina at the rim
        cv.px(px_, py_, 'jade2'); cv.px(px_ + 1, py_, 'jade3')
    cv.vline(16, 40, 44, 'red2')                                           # tassel
    for x in range(14, 19):
        cv.vline(x, 44, 49, 'red2' if x % 2 else 'red1')
    return O.outline(cv)


# ---------------------------------------------------------------- pegs, rope, satchel
@prop('pegs_rope_satchel', 4, 'wall', 1990, 66, 'Wooden wall pegs: a coil of hemp rope and a leather satchel hanging '
      'by its strap')
def pegs_rope_satchel():
    rng = random.Random(66)
    w, h = 74, 56
    cv = Canvas(w, h)
    cv.rect(0, 2, w, 5, 'wood2'); cv.hline(0, w - 1, 2, 'wood4'); cv.hline(0, w - 1, 6, 'wood0')   # peg rail
    for px_ in (12, 46):
        cv.rect(px_, 4, 4, 5, 'wood3'); cv.hline(px_, px_ + 3, 4, 'wood4'); cv.vline(px_ + 3, 4, 8, 'wood1')
    # coil of rope: loops hanging from the first peg
    for k in range(5):
        for a in range(0, 360, 3):
            r = 10 - k * 0.8
            x = 14 + math.cos(math.radians(a)) * r * 0.75
            y = 20 + math.sin(math.radians(a)) * r + k * 0.6
            c = ('paper2', 'paper1', 'gold1', 'paper3', 'paper2')[k]
            if (a // 18) % 2 == 0:
                c = 'gold1'
            cv.px(int(x), int(y), c)
    cv.line(14, 30, 12, 44, 'paper2'); cv.line(13, 30, 11, 44, 'gold1')     # loose end
    # leather satchel on the second peg
    cv.line(48, 8, 38, 22, 'wood1'); cv.line(48, 8, 60, 22, 'wood1')         # strap
    sm = poly_mask(w, h, [(36, 22), (62, 22), (64, 44), (60, 50), (38, 50), (34, 44)])
    _blit_mask(cv, sm, LEATHER, R_=6, amb=0.28, spec=0.06, spec_col='copper4')
    fm = poly_mask(w, h, [(35, 22), (63, 22), (62, 34), (49, 37), (36, 34)])
    _blit_mask(cv, fm, DARK_LEATHER, R_=4, amb=0.3)
    _buckle(cv, 46, 32, 6, 5)
    for x in range(37, 62, 2):
        cv.px(x, 23, 'copper3')                                            # stitching on the flap
    return O.outline(cv)


# ---------------------------------------------------------------- herbs
@prop('herb_bundle', 4, 'wall', 2228, 70, 'Bundle of dried herbs hanging head-down from a nail on the post, tied with string')
def herb_bundle():
    rng = random.Random(70)
    w, h = 24, 44
    cv = Canvas(w, h)
    cv.px(12, 0, 'stone2'); cv.vline(12, 1, 5, 'paper2')
    cv.rect(10, 5, 5, 3, 'paper3'); cv.hline(10, 14, 6, 'red2')
    for k in range(16):
        a = rng.uniform(-0.45, 0.45)
        ln = rng.randint(22, 36)
        for t in range(ln):
            x = int(12 + math.sin(a) * t * 0.7 + rng.choice((0, 0, 1)) * (t > 12))
            y = 8 + t
            if y >= h:
                break
            c = 'wood2' if t < 6 else ('leaf1' if (t + k) % 3 else 'leaf2')
            if t > ln - 6:
                c = 'purp2' if k % 3 == 0 else ('gold2' if k % 3 == 1 else 'leaf2')
            cv.px(x, y, c)
            if t > 8 and (t + k) % 4 == 0 and 0 <= x + 1 < w:
                cv.px(x + 1, y, 'leaf0')
    return O.outline(cv)
