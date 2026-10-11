"""Room 4 - the traveler's things, drawn for realism: everything is shaded as
a solid lit from the upper left (height-field shading from its silhouette),
with worn edges, contact shadows and small true-to-life details.

  leather_boots     a pair of worn boots, one standing, one slumped over, laces trailing
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
