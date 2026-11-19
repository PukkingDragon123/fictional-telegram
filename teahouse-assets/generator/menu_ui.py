"""The main menu's UI: the hanging title signboard, the signpost buttons and the brush cursor.

Everything is drawn the way the teahouse interior is drawn, with the pack's own palette and recipes
(furn.wood_face grain, the wood5 / wood2 edge light of the hanging menu tags, O.outline, the paper1
cords and red tassels of the lanterns, their soft partial-alpha halo, moss.clump), so the menu looks
like it came from the same hand. No new colours: only the ramps already in pixel.RAMPS.

Two hand-made fonts live here as bitmaps:
  TITLE   12 px caps, 8 px x-height, 2 px strokes, cut into the board and gilded
  LABEL   8 px caps, 6 px x-height, 2 px stems / 1 px bars, brushed in ink on paper
Both are kerned by hand (KERN tables) on top of a 1 px / 2 px default gap.

Run it from the generator folder:  python3 menu_ui.py   ->  teahouse-assets/main_menu/ui/"""
import json
import math
import os
import random

import numpy as np
from PIL import Image

from pixel import Canvas, PAL, RAMPS
from furn import wood_face, nail
from shapes import torn_paper, chip, crack
import objects as O
import moss
import menu_layout as ML

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'main_menu', 'ui')


# ====================================================================== fonts
def _g(rows):
    """Glyph from rows of '#'/'.' -> bool array."""
    rows = [r for r in rows.strip('\n').split('\n')]
    rows = [r.strip() for r in rows]
    w = max(len(r) for r in rows)
    return np.array([[ch == '#' for ch in r.ljust(w, '.')] for r in rows], bool)


# --- LABEL: cap 8 (rows 0-7), x-height 6 (rows 2-7), descenders rows 8-9 -------------------------
# Every glyph is 10 rows: caps/ascenders start at row 0, lowercase at row 2.
LABEL = {}
_LABEL_SRC = {
    'A': """
..##..
.####.
##..##
##..##
######
##..##
##..##
##..##
......
......""",
    'B': """
#####.
##..##
##..##
#####.
##..##
##..##
##..##
#####.
......
......""",
    'C': """
.####
##..#
##...
##...
##...
##...
##..#
.####
.....
.....""",
    'D': """
####..
##.##.
##..##
##..##
##..##
##..##
##.##.
####..
......
......""",
    'E': """
#####
##...
##...
####.
##...
##...
##...
#####
.....
.....""",
    'F': """
#####
##...
##...
####.
##...
##...
##...
##...
.....
.....""",
    'G': """
.####.
##..##
##....
##....
##.###
##..##
##..##
.#####
......
......""",
    'H': """
##..##
##..##
##..##
######
##..##
##..##
##..##
##..##
......
......""",
    'I': """
####
.##.
.##.
.##.
.##.
.##.
.##.
####
....
....""",
    'J': """
.#####
....##
....##
....##
....##
....##
##..##
.####.
......
......""",
    'K': """
##..##
##.##.
####..
###...
####..
##.##.
##..##
##..##
......
......""",
    'L': """
##...
##...
##...
##...
##...
##...
##...
#####
.....
.....""",
    'M': """
##...##
###.###
#######
##.#.##
##...##
##...##
##...##
##...##
.......
.......""",
    'N': """
##...##
###..##
###..##
##.#.##
##.#.##
##..###
##..###
##...##
.......
.......""",
    'O': """
.####.
##..##
##..##
##..##
##..##
##..##
##..##
.####.
......
......""",
    'P': """
#####.
##..##
##..##
##..##
#####.
##....
##....
##....
......
......""",
    'Q': """
.####.
##..##
##..##
##..##
##..##
##..##
##.###
.####.
...###
......""",
    'R': """
#####.
##..##
##..##
##..##
#####.
##.##.
##..##
##..##
......
......""",
    'S': """
.####
##..#
##...
.###.
...##
...##
#..##
####.
.....
.....""",
    'T': """
######
..##..
..##..
..##..
..##..
..##..
..##..
..##..
......
......""",
    'U': """
##..##
##..##
##..##
##..##
##..##
##..##
##..##
.####.
......
......""",
    'V': """
##..##
##..##
##..##
##..##
##..##
.####.
.####.
..##..
......
......""",
    'W': """
##...##
##...##
##...##
##.#.##
#######
###.###
##...##
#.....#
.......
.......""",
    'X': """
##..##
##..##
.####.
..##..
..##..
.####.
##..##
##..##
......
......""",
    'Y': """
##..##
##..##
##..##
.####.
..##..
..##..
..##..
..##..
......
......""",
    'Z': """
######
....##
...##.
..##..
.##...
##....
##....
######
......
......""",
    'a': """
.....
.....
.###.
...##
.####
##.##
##.##
.####
.....
.....""",
    'b': """
##...
##...
####.
##.##
##.##
##.##
##.##
####.
.....
.....""",
    'c': """
....
....
.###
##..
##..
##..
##..
.###
....
....""",
    'd': """
...##
...##
.####
##.##
##.##
##.##
##.##
.####
.....
.....""",
    'e': """
.....
.....
.###.
##.##
#####
##...
##...
.###.
.....
.....""",
    'f': """
..##
.##.
.##.
####
.##.
.##.
.##.
.##.
....
....""",
    'g': """
.....
.....
.####
##.##
##.##
##.##
##.##
.####
...##
###..""",
    'h': """
##...
##...
####.
##.##
##.##
##.##
##.##
##.##
.....
.....""",
    'i': """
##
..
##
##
##
##
##
##
..
..""",
    'j': """
..##
....
..##
..##
..##
..##
..##
..##
..##
##..""",
    'k': """
##...
##...
##.##
##.##
####.
###..
####.
##.##
.....
.....""",
    'l': """
##.
##.
##.
##.
##.
##.
##.
.##
...
...""",
    'm': """
........
........
#######.
##.##.##
##.##.##
##.##.##
##.##.##
##.##.##
........
........""",
    'n': """
.....
.....
####.
##.##
##.##
##.##
##.##
##.##
.....
.....""",
    'o': """
.....
.....
.###.
##.##
##.##
##.##
##.##
.###.
.....
.....""",
    'p': """
.....
.....
####.
##.##
##.##
##.##
##.##
####.
##...
##...""",
    'q': """
.....
.....
.####
##.##
##.##
##.##
##.##
.####
...##
...##""",
    'r': """
....
....
##.#
####
##..
##..
##..
##..
....
....""",
    's': """
....
....
.###
##..
###.
.###
..##
###.
....
....""",
    't': """
....
.##.
####
.##.
.##.
.##.
.##.
..##
....
....""",
    'u': """
.....
.....
##.##
##.##
##.##
##.##
##.##
.####
.....
.....""",
    'v': """
.....
.....
##.##
##.##
##.##
##.##
.###.
..#..
.....
.....""",
    'w': """
.......
.......
##...##
##...##
##.#.##
##.#.##
#######
.##.##.
.......
.......""",
    'x': """
.....
.....
##.##
##.##
.###.
.###.
##.##
##.##
.....
.....""",
    'y': """
.....
.....
##.##
##.##
##.##
##.##
##.##
.####
...##
###..""",
    'z': """
.....
.....
#####
...##
..##.
.##..
##...
#####
.....
.....""",
    "'": """
##
##
#.
..
..
..
..
..
..
..""",
    '.': """
..
..
..
..
..
..
##
##
..
..""",
    '?': """
.###.
##.##
...##
..##.
.##..
.....
.##..
.##..
.....
.....""",
    '!': """
##
##
##
##
##
..
##
##
..
..""",
    '-': """
....
....
....
....
####
....
....
....
....
....""",
}
for _k, _v in _LABEL_SRC.items():
    LABEL[_k] = _g(_v)
LABEL_SPACE = 4          # width of ' '
LABEL_GAP = 1
# hand kerning for the pairs that show up (positive = wider apart)
LABEL_KERN = {('r', 'e'): -1, ('r', 'n'): 0, ('J', 'o'): -1, ('T', 'e'): -1, ('T', 'o'): -1, ('i', 't'): 0,
              ('t', 'i'): 0, ('w', ' '): -1, ('r', 'a'): -1, ('y', ' '): 0, ('Q', 'u'): -1, ('C', 'o'): 0,
              ('C', 'r'): 0, ('f', 'o'): -1, ('l', 'i'): 1, ('t', 's'): 0}


def _set(font, s, space, gap, kern, height):
    """Lay a string out in a bitmap font with hand kerning: returns a bool mask (height x width).
    A missing glyph falls back to the other case, then to a space."""
    x = 0
    prev = None
    placed = []
    for ch in s:
        g = font.get(ch)
        if g is None and ch != ' ':
            g = font.get(ch.swapcase())
        if g is None:
            x += space
            prev = ' '
            continue
        if prev is not None:
            x += gap + kern.get((prev, ch), 0)
        placed.append((x, g))
        x += g.shape[1]
        prev = ch
    w = max([px + g.shape[1] for px, g in placed] + [1])
    m = np.zeros((height, w), bool)
    for px, g in placed:
        m[:g.shape[0], px:px + g.shape[1]] |= g
    return m


def label_mask(s):
    return _set(LABEL, s, LABEL_SPACE, LABEL_GAP, LABEL_KERN, 10)


# --- TITLE: cap 13 (rows 0-12), x-height 9 (rows 4-12), descenders rows 13-15 ---------------------
# Stems 3 px, bars 2 px, so the gilt can be lit across each stroke (light / mid / shade). Ascender
# stems (b d h k l) carry a little brush flag at the top; d, u, a, g, q end in a kick at the foot.
# Each glyph is written from its first row; the number is the row it starts on.
TITLE = {}
TITLE_H = 16
_TITLE_SRC = {
    'A': (0, """
..#######..
.#########.
###.....###
###.....###
###.....###
###.....###
###########
###########
###.....###
###.....###
###.....###
###.....###
###.....###"""),
    'B': (0, """
########...
#########..
###....###.
###....###.
###...####.
#########..
##########.
###.....###
###.....###
###.....###
###....####
##########.
#########.."""),
    'C': (0, """
....######.
..#########
.####....##
###........
###........
###........
###........
###........
###........
###........
.####....##
..#########
....######."""),
    'D': (0, """
#######.....
#########...
###...####..
###.....###.
###......###
###......###
###......###
###......###
###......###
###.....###.
###...####..
#########...
#######....."""),
    'E': (0, """
##########
##########
###.......
###.......
###.......
########..
########..
###.......
###.......
###.......
###.......
##########
##########"""),
    'F': (0, """
##########
##########
###.......
###.......
###.......
########..
########..
###.......
###.......
###.......
###.......
###.......
###......."""),
    'G': (0, """
....#######.
..##########
.####.....##
###.........
###.........
###.........
###...######
###...######
###......###
###......###
.####...####
..##########
....######.."""),
    'H': (0, """
###.....###
###.....###
###.....###
###.....###
###.....###
###########
###########
###.....###
###.....###
###.....###
###.....###
###.....###
###.....###"""),
    'I': (0, """
#######
#######
..###..
..###..
..###..
..###..
..###..
..###..
..###..
..###..
..###..
#######
#######"""),
    'J': (0, """
...######
...######
......###
......###
......###
......###
......###
......###
......###
###...###
####.####
.#######.
..#####.."""),
    'K': (0, """
###....###.
###...###..
###..###...
###.###....
######.....
#####......
######.....
###.###....
###..###...
###...###..
###....###.
###.....###
###.....###"""),
    'L': (0, """
###.......
###.......
###.......
###.......
###.......
###.......
###.......
###.......
###.......
###.......
###.......
##########
##########"""),
    'M': (0, """
####.....####
#####...#####
######.######
###.#####.###
###..###..###
###...#...###
###.......###
###.......###
###.......###
###.......###
###.......###
###.......###
###.......###"""),
    'N': (0, """
###.....###
####....###
#####...###
######..###
###.##..###
###.###.###
###..##.###
###..######
###...#####
###....####
###.....###
###.....###
###.....###"""),
    'O': (0, """
....####....
..########..
.####..####.
###......###
###......###
###......###
###......###
###......###
###......###
###......###
.####..####.
..########..
....####...."""),
    'P': (0, """
########..
#########.
###....###
###....###
###....###
#########.
########..
###.......
###.......
###.......
###.......
###.......
###......."""),
    'Q': (0, """
....####....
..########..
.####..####.
###......###
###......###
###......###
###......###
###......###
###...##.###
###....#####
.####...###.
..##########
....####..##"""),
    'R': (0, """
########...
#########..
###....###.
###.....###
###.....###
###....###.
#########..
########...
###..###...
###...###..
###....###.
###.....###
###.....###"""),
    'S': (0, """
..#######.
.#########
###.....##
###.......
####......
.########.
..########
......####
.......###
.......###
##.....###
#########.
.#######.."""),
    'T': (0, """
###########
###########
#...###...#
....###....
....###....
....###....
....###....
....###....
....###....
....###....
....###....
....###....
....###...."""),
    'U': (0, """
###.....###
###.....###
###.....###
###.....###
###.....###
###.....###
###.....###
###.....###
###.....###
###.....###
####...####
.#########.
..#######.."""),
    'V': (0, """
###.....###
###.....###
###.....###
###.....###
###.....###
###.....###
####...####
.###...###.
.####.####.
..###.###..
..#######..
...#####...
....###...."""),
    'W': (0, """
###.......###
###.......###
###.......###
###.......###
###..###..###
###..###..###
###..###..###
###..###..###
###..###..###
###..###..###
###.#####.###
.#####.#####.
..###...###.."""),
    'X': (0, """
###.....###
###.....###
.###...###.
..###.###..
...#####...
....###....
...#####...
..###.###..
.###...###.
###.....###
###.....###
###.....###
###.....###"""),
    'Y': (0, """
###.....###
###.....###
###.....###
.###...###.
..###.###..
...#####...
....###....
....###....
....###....
....###....
....###....
....###....
....###...."""),
    'Z': (0, """
##########
##########
.......###
......###.
.....###..
....###...
...###....
..###.....
.###......
###.......
###.......
##########
##########"""),
    'a': (4, """
.######..
.#######.
......###
..#######
.########
###...###
###..####
.########
..###.###"""),
    'b': (0, """
####......
.###......
.###......
.###......
.###.###..
.########.
.####..###
.###...###
.###...###
.###...###
.####..###
.########.
.###.###.."""),
    'c': (4, """
..######
.#######
###.....
###.....
###.....
###.....
###.....
.#######
..######"""),
    'd': (0, """
.....####
......###
......###
......###
..###.###
.########
###..####
###...###
###...###
###...###
###..####
.########
..###.###"""),
    'e': (4, """
..#####..
.#######.
###...###
###...###
#########
#########
###......
.########
..#######"""),
    'f': (0, """
...####
..#####
.###...
.###...
#######
#######
.###...
.###...
.###...
.###...
.###...
.###...
.###..."""),
    'g': (4, """
..###.###
.########
###..####
###...###
###...###
###...###
###..####
.########
..###.###
......###
########.
#######.."""),
    'h': (0, """
####......
.###......
.###......
.###......
.###.###..
.########.
.####..###
.###...###
.###...###
.###...###
.###...###
.###...###
.###...###"""),
    'i': (0, """
....
.###
.###
....
####
.###
.###
.###
.###
.###
.###
.###
.###"""),
    'j': (0, """
.....
..###
..###
.....
.####
..###
..###
..###
..###
..###
..###
..###
..###
..###
####.
###.."""),
    'k': (0, """
####......
.###......
.###......
.###......
.###...###
.###..###.
.###.###..
.######...
.#####....
.######...
.###.###..
.###..###.
.###...###"""),
    'l': (0, """
####.
.###.
.###.
.###.
.###.
.###.
.###.
.###.
.###.
.###.
.###.
.####
..###"""),
    'm': (4, """
##.###..###..
#############
###..###..###
###..###..###
###..###..###
###..###..###
###..###..###
###..###..###
###..###..###"""),
    'n': (4, """
###.###..
########.
####..###
###...###
###...###
###...###
###...###
###...###
###...###"""),
    'o': (4, """
..#####..
.#######.
###...###
###...###
###...###
###...###
###...###
.#######.
..#####.."""),
    'p': (4, """
###.###..
########.
####..###
###...###
###...###
###...###
####..###
########.
###.###..
###......
###......
###......"""),
    'q': (4, """
..###.###
.########
###..####
###...###
###...###
###...###
###..####
.########
..###.###
......###
......###
......###"""),
    'r': (4, """
###.####
########
####....
###.....
###.....
###.....
###.....
###.....
###....."""),
    's': (4, """
..######
.#######
###.....
.######.
..######
.....###
.....###
#######.
######.."""),
    't': (1, """
.###...
.###...
.###...
#######
#######
.###...
.###...
.###...
.###...
.###...
.######
..#####"""),
    'u': (4, """
###...###
###...###
###...###
###...###
###...###
###...###
###..####
.########
..###.###"""),
    'v': (4, """
###...###
###...###
###...###
###...###
####.####
.###.###.
.#######.
..#####..
...###..."""),
    'w': (4, """
###.......###
###.......###
###..###..###
###..###..###
###..###..###
###..###..###
###.#####.###
.#####.#####.
..###...###.."""),
    'x': (4, """
###...###
###...###
.###.###.
..#####..
...###...
..#####..
.###.###.
###...###
###...###"""),
    'y': (4, """
###...###
###...###
###...###
###...###
###...###
###...###
###..####
.########
..###.###
......###
########.
#######.."""),
    'z': (4, """
########
########
.....###
....###.
...###..
..###...
.###....
########
########"""),
    "'": (0, """
###
###
.##
##."""),
    '-': (6, """
######
######"""),
    '.': (10, """
###
###
###"""),
    ',': (10, """
.###
.###
.###
.##.
##.."""),
    '!': (0, """
###
###
###
###
###
###
###
###
...
...
###
###
###"""),
    '?': (0, """
.#######.
#########
###...###
......###
.....###.
....###..
...###...
...###...
.........
.........
...###...
...###...
...###..."""),
    ':': (4, """
###
###
###
...
...
...
###
###
###"""),
    '&': (0, """
..#####....
.#######...
###...###..
###...###..
.###.###...
..#####....
.######..##
###..###.##
###...#####
###....###.
####..#####
.##########
..####...##"""),
}
for _k, (_top, _v) in _TITLE_SRC.items():
    _m = _g(_v)
    _full = np.zeros((TITLE_H, _m.shape[1]), bool)
    _full[_top:_top + _m.shape[0]] = _m
    TITLE[_k] = _full
TITLE_SPACE = 6
TITLE_GAP = 2
# hand kerning (negative = tighter); round sides and open shapes tuck in, straight stems keep their gap
TITLE_KERN = {('T', 'e'): -2, ('T', 'a'): -2, ('T', 'o'): -2, ('T', 'u'): -1, ('T', 'r'): -1, ('T', 'y'): -1,
              ('T', 'h'): -1, ('r', 'a'): -1, ('r', 'e'): -1, ('r', 'o'): -1, ('L', 'T'): -2, ('V', 'a'): -1,
              ('W', 'a'): -1, ('Y', 'o'): -1, ('F', 'a'): -1, ('P', 'a'): -1, ('l', 'd'): 0, ('o', 'w'): -1,
              ('w', 'n'): 0, ('a', 'h'): 0, ('e', 'a'): -1, ('s', 'e'): 0, ('u', 's'): 0, ('c', 'o'): -1,
              ('f', 'o'): -1, ('f', 'e'): -1, ('f', 'a'): -1}


def title_mask(s):
    """The title set in the gilt face: a bool mask TITLE_H rows tall (caps on rows 0-12, descenders
    to row 15). Characters it has no glyph for are left as a space."""
    return _set(TITLE, s, TITLE_SPACE, TITLE_GAP, TITLE_KERN, TITLE_H)


# ====================================================================== shared bits
def _sh(m, dy, dx):
    """Shift a bool mask by (dy, dx), zero-filled."""
    o = np.zeros_like(m)
    H, W = m.shape
    o[max(0, dy):H + min(0, dy), max(0, dx):W + min(0, dx)] = m[max(0, -dy):H - max(0, dy), max(0, -dx):W - max(0, dx)]
    return o


def _cv_of(a):
    c = Canvas(a.shape[1], a.shape[0])
    c.a = a.copy()
    return c


def _ramp_of(rgb):
    from pixel import LOOKUP
    return LOOKUP.get(tuple(int(v) for v in rgb[:3]), (None, None))


# ====================================================================== the title signboard
# A hanging kanban: a red-lacquered top beam with a black cap and upturned ends (a little torii
# kasagi) on two hemp cords that run up out of the screen, under it a dark board with a carved
# border, a recessed panel, gilt corner fittings, the gilt title cut in relief, red tassels at the
# beam ends, moss on the beam. All local coordinates are in the plaque's own canvas (PW x PH); the
# canvas is placed with its top edge on the top of the screen so the cords run off it.
PW, PH = 280, 100
BEAM_X0, BEAM_X1 = 3, 276           # beam span (inclusive)
BEAM_Y = 25                         # beam top at the middle (the cords above it run off the screen)
BEAM_H = 10
BX0, BY0, BX1, BY1 = 16, BEAM_Y + BEAM_H - 1, 263, BEAM_Y + BEAM_H + 41   # the board (inclusive)
FR = 6                              # border width
CHAMFER = 3
CORD_X = (40, 239)                  # where the cords loop over the beam
TEXT_BOX = (BX0 + FR + 1, BY0 + FR + 1, BX1 - FR - 1, BY1 - FR - 1)   # the panel's flat field


def _beam_rise(x, bottom=False):
    """How far the beam's ends sweep up (px) at column x; the underside sweeps up more, so the
    ends taper like a torii's kasagi."""
    cx = (BEAM_X0 + BEAM_X1) / 2
    half = (BEAM_X1 - BEAM_X0) / 2
    t = max(0.0, (abs(x - cx) - (half - 36)) / 36.0)
    return int(round((6.0 if bottom else 4.0) * t ** 2.0))


def _beam(cv, rng):
    """The lacquered beam: a black cap over a vermilion body, worn through to the wood here and there."""
    for x in range(BEAM_X0, BEAM_X1 + 1):
        top = BEAM_Y - _beam_rise(x)
        bot = BEAM_Y + BEAM_H - 1 - _beam_rise(x, True)
        end = min(x - BEAM_X0, BEAM_X1 - x)
        cut = max(0, 2 - end)                   # end cuts lean outwards at the top, like a torii's
        for y in range(top + cut, bot + 1 - cut):
            k = y - top
            if k == 0:
                c = 'stone2'                    # the black cap's lit top edge
            elif k < 3:
                c = 'stone0' if k == 1 else 'ink'
            elif k == 3:
                c = 'red4'                      # lit lip just under the cap
            elif y == bot:
                c = 'red0'                      # underside, in shadow
            elif y == bot - 1:
                c = 'red2'
            else:
                c = 'red3'
            if end <= 1 and 3 <= k and y < bot:
                c = 'red4' if x < (BEAM_X0 + BEAM_X1) / 2 else 'red1'     # the cut end faces
            cv.px(x, y, c)
    # worn lacquer showing the wood under it, and hairline cracks
    for (x0, w) in ((60, 10), (171, 7), (219, 11)):
        chip(cv, x0, BEAM_Y + 4, w, 4, rng, under='wood4', under_dark='wood2', lit='red4', n=2, rmin=1.4, rmax=2.2,
             elong=0.6)


def _chamfered(x0, y0, x1, y1, ch):
    def inside(x, y):
        dx = min(x - x0, x1 - x)
        dy = min(y - y0, y1 - y)
        return dx >= 0 and dy >= 0 and dx + dy >= ch
    return inside


def _grain(cv, mask, along, seed, width, contrast=0.75, ramps=('wood',), knots=True, ring=3.2):
    """woodgrain.levels over the masked pixels (grain running 'h' or 'v'), stepped along their own ramp."""
    import woodgrain as WG
    H, W = mask.shape
    yy, xx = np.mgrid[0:H, 0:W].astype(float)
    if along == 'h':
        lv = WG.levels(xx + seed * 37.0, np.mod(yy, width), seed, width, ring, knots)
    else:
        lv = WG.levels(yy + seed * 37.0, np.mod(xx, width), seed, width, ring, knots)
    q = np.round(np.clip(lv, -3, 1) * contrast).astype(int)
    rgb = cv.a[..., :3]
    WG.apply_levels(rgb, mask & (cv.a[..., 3] == 255), q, ramps, keep_dark=True)


def _board(cv, rng):
    """A framed board: four mitred rails (grain running round the frame) with a carved bead, and a
    recessed panel (furn.inset's recipe: shadow under the top/left lip, light on the far lip).
    Lit like the room's menu tags: wood5/6 on the top/left edges, wood2/1 on the bottom/right."""
    ins = _chamfered(BX0, BY0, BX1, BY1, CHAMFER)
    yy, xx = np.mgrid[0:PH, 0:PW]
    board = np.zeros((PH, PW), bool)
    for y in range(BY0, BY1 + 1):
        for x in range(BX0, BX1 + 1):
            if ins(x, y):
                board[y, x] = True
                cv.px(x, y, 'wood4')
    px0, py0, px1, py1 = BX0 + FR, BY0 + FR, BX1 - FR, BY1 - FR
    panel = (xx >= px0) & (xx <= px1) & (yy >= py0) & (yy <= py1)
    frame = board & ~panel
    dh = np.minimum(yy - BY0, BY1 - yy)          # distance to the top/bottom edge
    dv = np.minimum(xx - BX0, BX1 - xx)          # distance to the left/right edge
    rails = frame & (dh <= dv)
    stiles = frame & (dh > dv)
    _grain(cv, rails, 'h', 3.0, FR, 0.7, knots=False)
    _grain(cv, stiles, 'v', 5.0, FR, 0.7, knots=False)
    # the mitre joints
    for (cx, cy, sx, sy) in ((px0 - 1, py0 - 1, -1, -1), (px1 + 1, py0 - 1, 1, -1), (px0 - 1, py1 + 1, -1, 1),
                             (px1 + 1, py1 + 1, 1, 1)):
        for k in range(FR - 1):
            cv.px(cx + sx * k, cy + sy * k, 'wood2')
    # the carved bead running round the frame, 2 px in: shadow wall top/left, lit wall bottom/right
    gin = _chamfered(BX0 + 2, BY0 + 2, BX1 - 2, BY1 - 2, CHAMFER)
    for y in range(BY0 + 2, BY1 - 1):
        for x in range(BX0 + 2, BX1 - 1):
            if not gin(x, y) or panel[y, x]:
                continue
            if not gin(x, y - 1) or not gin(x - 1, y):
                cv.px(x, y, 'wood2')
            elif not gin(x, y + 1) or not gin(x + 1, y):
                cv.px(x, y, 'wood5')
    # outer edges
    for y in range(BY0, BY1 + 1):
        for x in range(BX0, BX1 + 1):
            if not ins(x, y):
                continue
            if not ins(x, y + 1):
                cv.px(x, y, 'wood1')
            elif not ins(x, y + 2):
                cv.px(x, y, 'wood2')
            elif not ins(x + 1, y):
                cv.px(x, y, 'wood2')
            elif not ins(x, y - 1):
                cv.px(x, y, 'wood6')
            elif not ins(x - 1, y):
                cv.px(x, y, 'wood5')
    # the panel: a darker board, grain along it
    cv.rect(px0, py0, px1 - px0 + 1, py1 - py0 + 1, 'wood2')
    _grain(cv, panel, 'h', 11.0, py1 - py0 + 1, 0.85, knots=True, ring=3.6)
    cv.hline(px0, px1, py0, 'wood0'); cv.vline(px0, py0, py1, 'wood0')
    cv.hline(px0 + 1, px1, py0 + 1, 'wood1'); cv.vline(px0 + 1, py0 + 1, py1, 'wood1')
    cv.hline(px0 + 1, px1, py1, 'wood4'); cv.vline(px1, py0 + 1, py1, 'wood4')
    # weather: a split running in from the right end of the panel, a knock on the bottom rail
    crack(cv, random.Random(5), px1 - 1, py0 + 13, 22, 'wood0', hi='wood3', dirx=-1.0, diry=0.12, branch=0.0)
    chip(cv, 92, BY1 - 4, 7, 3, rng, under='wood5', under_dark='wood3', n=2, rmin=0.8, rmax=1.4, elong=0.7)


def _fitting(cv, x, y, sx, sy):
    """Gilt corner plate on the chamfer: an L of two 3 px legs ending in points, a domed rivet."""
    pts = set()
    for i in range(9):
        for j in range(3):
            if i + j < 9:
                pts.add((x + sx * (CHAMFER + i), y + sy * j))        # leg along the edge
                pts.add((x + sx * j, y + sy * (CHAMFER + i)))
    for i in range(CHAMFER + 3):                                       # across the chamfer
        for j in range(3):
            a, b = i, CHAMFER + 2 - i + j
            if 0 <= b:
                pts.add((x + sx * a, y + sy * b))
    for (px_, py_) in pts:
        up = (px_, py_ - 1) not in pts
        lf = (px_ - 1, py_) not in pts
        dn = (px_, py_ + 1) not in pts
        rt = (px_ + 1, py_) not in pts
        c = 'gold2'
        if dn or rt:
            c = 'gold1'
        if up or lf:
            c = 'gold3'
        cv.px(px_, py_, c)
    rx, ry = x + sx * (CHAMFER + 1), y + sy * (CHAMFER + 1)
    cv.px(rx, ry, 'gold4'); cv.px(rx + 1, ry, 'gold2'); cv.px(rx, ry + 1, 'gold2'); cv.px(rx + 1, ry + 1, 'gold0')


def _gilt(cv, mask, ox, oy, worn=None):
    """Relief gilding: face lit across the stroke (top gold4, body gold3, bottom/right gold2,
    the outer bottom-right corner gold1), with a dark cast shadow down-right on the wood."""
    M = np.pad(mask, 2)
    up = M & ~_sh(M, 1, 0)
    dn = M & ~_sh(M, -1, 0)
    rt = M & ~_sh(M, 0, -1)
    shadow = (_sh(M, 1, 1) | _sh(M, 1, 0) | _sh(M, 0, 1)) & ~M
    for y, x in zip(*np.nonzero(shadow)):
        cv.px(ox + x - 2, oy + y - 2, 'wood0')
    for y, x in zip(*np.nonzero(M)):
        c = 'gold3'
        if dn[y, x] or rt[y, x]:
            c = 'gold2'
        if up[y, x]:
            c = 'gold4'
        if dn[y, x] and rt[y, x]:
            c = 'gold1'
        cv.px(ox + x - 2, oy + y - 2, c)
    if worn:
        for (x, y) in worn:                      # gold leaf rubbed off: the gesso shows through
            if mask[y, x]:
                cv.px(ox + x, oy + y, 'gold1')


def plaque_body(text=None, seed=7):
    """The beam and the board with (optionally) the lettering. Returns (canvas, gilt_mask_canvas_coords)."""
    rng = random.Random(seed)
    cv = Canvas(PW, PH)
    _board(cv, rng)
    for x in range(BX0 + 1, BX1 + 1):                 # the beam's overhang shades the board's top edge
        cv.shift(x, BY0, -3)
        cv.shift(x, BY0 + 1, -1)
    _beam(cv, rng)
    for (x, y, sx, sy) in ((BX0, BY0, 1, 1), (BX1, BY0, -1, 1), (BX0, BY1, 1, -1), (BX1, BY1, -1, -1)):
        _fitting(cv, x, y, sx, sy)
    if text:
        m = title_mask(text)
        tx0, ty0, tx1, ty1 = TEXT_BOX
        ox = tx0 + (tx1 - tx0 + 1 - (m.shape[1] + 1)) // 2
        oy = ty0 + (ty1 - ty0 + 1 - (13 + 1)) // 2
        _gilt(cv, m, ox, oy)
    _crest(cv, (BEAM_X0 + BEAM_X1) // 2, BEAM_Y + BEAM_H // 2)
    # moss on the beam's left shoulder and a wisp under the board's right end
    mrng = np.random.RandomState(seed) if False else random.Random(seed + 11)
    for x0, w, h in ((8, 24, 6), (28, 9, 4)):
        moss.clump(cv, mrng, x0, BEAM_Y - _beam_rise(x0 + w // 2) + 1, w, h, 'ledge', spores=0.0)
    moss.clump(cv, mrng, 246, BEAM_Y - _beam_rise(250) + 1, 9, 3, 'ledge', spores=0.0)
    moss.clump(cv, mrng, BX0 + 1, BY1 - 1, 12, 4, 'hang')
    return cv


# ---------------------------------------------------------------------- hanging parts
# the roundel's outline, hand-drawn (a 15 px circle), and the field inside it
_RING = """
.....#####.....
...##.....##...
..#.........#..
.#...........#.
.#...........#.
#.............#
#.............#
#.............#
#.............#
#.............#
.#...........#.
.#...........#.
..#.........#..
...##.....##...
.....#####....."""


def _leaf_lens(n, a, b, half, bend=0.0):
    """A leaf as a lens from a (stem) to b (tip): {(x, y): (t along, s across -1..1)}."""
    out = {}
    ax, ay = a
    bx, by = b
    L = math.hypot(bx - ax, by - ay)
    ux, uy = (bx - ax) / L, (by - ay) / L
    for y in range(n):
        for x in range(n):
            vx, vy = x + 0.5 - ax, y + 0.5 - ay
            t = (vx * ux + vy * uy) / L
            if not 0 <= t <= 1:
                continue
            d = vx * -uy + vy * ux - bend * math.sin(math.pi * t)
            w = half * math.sin(math.pi * t) ** 0.75
            if abs(d) <= w:
                out[(x, y)] = (t, d / max(w, 1e-3))
    return out


def _crest(cv, cx, cy):
    """A gilt roundel on red lacquer with a tea leaf: the teahouse's mon, nailed to the middle of the beam."""
    rows = _RING.strip('\n').split('\n')
    n = len(rows)
    x0, y0 = cx - n // 2, cy - n // 2
    ring = {(x, y) for y, r in enumerate(rows) for x, ch in enumerate(r) if ch == '#'}
    for y, r in enumerate(rows):
        xs = [x for x, ch in enumerate(r) if ch == '#']
        for x in range(min(xs), max(xs) + 1):
            if (x, y) in ring:
                d = (x - n / 2) + (y - n / 2)
                c = 'gold4' if d < -8 else ('gold3' if d < 1 else ('gold2' if d < 6 else 'gold1'))
            else:
                c = 'red0' if (x - n / 2) + (y - n / 2) > 5 else 'red1'
            cv.px(x0 + x, y0 + y, c)
    for (x, y), (t, sgn) in _leaf_lens(n, (3.6, 11.4), (11.6, 3.4), 2.9, bend=0.5).items():
        c = 'gold3' if sgn < 0 else 'gold2'
        if abs(sgn) < 0.28 and 0.08 < t < 0.9:
            c = 'gold4'                                          # the midrib
        if sgn > 0.8:
            c = 'gold1'
        cv.px(x0 + x, y0 + y, c)
    cv.px(x0 + 3, y0 + 11, 'gold2'); cv.px(x0 + 2, y0 + 12, 'gold2')      # the stalk


_ROPE = (('paper3', 'paper2'), ('paper1', 'paper3'), ('paper2', 'paper1'))


def _rope_px(i, y):
    """Twisted hemp, 2 px: the strands cross diagonally every 3 rows."""
    return _ROPE[y % 3][i]


def _cords(cv, dx, wraps=False):
    """Two ropes from the top of the screen down to the beam (which is shifted by dx), with a wrap
    round the beam where each one is tied (wraps=True draws only the wraps, over the beam)."""
    for ax in CORD_X:
        if wraps:
            top = BEAM_Y - _beam_rise(ax)
            for y in range(top, top + BEAM_H - 1):
                for i in range(-1, 3):
                    k = (y - i) % 3
                    c = 'paper3' if k == 0 else ('paper2' if k == 1 else 'paper1')
                    if i == -1:
                        c = 'paper2' if k == 0 else 'paper1'
                    if i == 2:
                        c = 'paper1' if k else 'paper2'
                    cv.px(ax + dx + i, y, c)
            continue
        top_x, bot_x = ax, ax + dx
        bot_y = BEAM_Y - _beam_rise(ax) + 1
        for y in range(0, bot_y):
            t = y / max(1, bot_y - 1)
            x = int(round(top_x + (bot_x - top_x) * t ** 1.5))
            for i in range(2):
                cv.px(x + i, y, _rope_px(i, y))


_TASSEL = """
.p.
.p.
.p.
.p.
GgG
.g.
rRr
yYy
.sss.
sssss
sssss
sssss
sssss
sssss
sssss
sssss
sssss
s.s.s"""
_STRAND = ('red4', 'red3', 'red3', 'red2', 'red1')


def _tassel(cv, x, y, sw):
    """Cord, gilt bead, a red silk head with a gold wrap, and a skirt of strands (the lanterns'
    colours, lit from the left) whose foot swings sw px."""
    rows = _TASSEL.strip('\n').split('\n')
    cols = {'p': 'paper1', 'G': 'gold3', 'g': 'gold2', 'y': 'gold3', 'Y': 'gold1'}
    n = len(rows)
    for j, r in enumerate(rows):
        t = max(0, j - 4) / (n - 5)
        off = int(round(sw * t * t))
        ox = x - len(r) // 2 + off
        for i, ch in enumerate(r):
            if ch == '.':
                continue
            if ch == 'r':
                c = 'red4' if i == 0 else 'red2'
            elif ch == 'R':
                c = 'red3'
            elif ch == 's':
                c = _STRAND[i] if len(r) == 5 else _STRAND[i + 1]
            else:
                c = cols[ch]
            cv.px(ox + i, y + j, c)


def plaque_frame(text=None, f=0, seed=7, glint=True):
    """One frame of the hanging sign: dx = how far the breeze has pushed it (parallel cords keep it
    level), the tassels swing a little behind, a glint runs over the gilt once per loop."""
    body = plaque_body(text, seed)
    sw = ML.sway(BX0 + 24 + (BX1 - BX0) / 2, f, amp=1.0, lag=2)
    dx = int(round(max(-2.0, min(2.0, sw * 1.2))))
    swt = ML.sway(BX0 + 24 + (BX1 - BX0) / 2, f, amp=1.0, lag=6)
    cv = Canvas(PW, PH)
    _cords(cv, dx)
    moved = Canvas(PW, PH)
    moved.blit(body, dx, 0)
    if glint:
        _glint(moved, f, dx)
    cv.blit(moved, 0, 0)
    _cords(cv, dx, wraps=True)
    for (bx, side) in ((BEAM_X0 + 6, -1), (BEAM_X1 - 6, 1)):
        y = BEAM_Y + BEAM_H - 1 - _beam_rise(bx, True) + 1
        _tassel(cv, bx + dx, y, swt * 1.8 + 0.3 * side)
    out = O.outline(cv)
    return out.crop(0, 1, out.w, out.h - 1)      # no outline cap on the cords: they run off the screen


# the plaque canvas as exported: PLAQUE_W x PLAQUE_H, plaque coordinate (x, y) is canvas (x + 1, y)
PLAQUE_W, PLAQUE_H = PW + 2, PH + 1


def _glint(cv, f, dx):
    """Once per loop a band of light slides across the gilt (letters, fittings, crest), leaning like
    '/': a white-hot core, the gold around it lifted two steps, a softer fringe lifted one."""
    T0, T1 = 18, 42                      # frames the glint is on its way across
    if not T0 <= f < T1:
        return
    t = (f - T0) / (T1 - T0 - 1)
    x_lo, x_hi = BX0 - 24 + dx, BX1 + 24 + dx
    gx = x_lo + (x_hi - x_lo) * t
    ymid = (BY0 + BY1) / 2
    a = cv.a
    for y in range(PH):
        for x in range(int(gx) - 14, int(gx) + 15):
            if not (0 <= x < PW) or a[y, x, 3] == 0:
                continue
            r, i = _ramp_of(a[y, x])
            if r != 'gold':
                continue
            d = abs((x - gx) + (y - ymid) * 0.7)
            if d < 1.6:
                cv.px(x, y, 'white' if i >= 2 else 'gold4')
            elif d < 4.0:
                cv.px(x, y, RAMPS['gold'][min(4, i + 2)])
            elif d < 7.0:
                cv.px(x, y, RAMPS['gold'][min(4, i + 1)])


# ====================================================================== the signpost buttons
# A wayside signpost for the traveller: a weathered post with a little roof, and on it five arrow
# boards nailed one above the other, each wearing a pasted paper slip lettered in ink. The boards are
# lit like the room's hanging menu tags (wood_face grain, wood5 along the top/left, wood2 along the
# bottom/right), the slips are the pack's torn_paper.
#   normal    the board as it is
#   hover     slides 2 px out along its point, the slip glows like a lit lantern (warm halo spilling
#             onto the meadow), a sprig of tea (one bud, two leaves) appears tucked under the nail
#   pressed   pushed back in and down 1 px, darker, the glow damped
#   disabled  silvered grey wood, the slip faded, a cobweb across the point (Continue with no save)
# Every state of every button is the same canvas size with the board at the same spot (the nudge is
# drawn inside), so the game can swap them in place.
BUTTONS = (('continue', 'Continue'), ('new_journey', 'New Journey'), ('settings', 'Settings'),
           ('credits', 'Credits'), ('quit', 'Quit'))
BW, BH, TIP = 98, 19, 8          # board body, height, how far the point sticks out
BOX, BOY = 7, 7                  # where the board's top-left sits in the button canvas
CW, CH = BOX + BW + TIP + 8, BOY + BH + 6
SLIP_X, SLIP_Y, SLIP_W, SLIP_H = 13, 2, 80, 15    # the paper slip on the board
NAIL = (6, 9)                    # the nail through the board into the post (board coordinates)
SLIP_SEED = {'continue': 14, 'new_journey': 31, 'settings': 7, 'credits': 19, 'quit': 46}
HOVER_N = 8


def _board_mask():
    """Board body with a pointed right end; corners of the square end nibbled by a pixel."""
    w, h = BW + TIP, BH
    m = np.zeros((h, w), bool)
    for y in range(h):
        for x in range(w):
            if x < BW:
                m[y, x] = True
            else:
                # the point: a 45-ish degree taper from both edges to the middle row
                d = x - BW + 1
                mid = (h - 1) / 2
                if abs(y - mid) <= mid - d * (mid / TIP) + 0.01:
                    m[y, x] = True
    m[0, 0] = m[h - 1, 0] = False
    return m


def _slip(key, glow=0, faded=False):
    """The paper slip: torn_paper with no scribbles, its colours lit when glow > 0."""
    rng = random.Random(SLIP_SEED[key])
    sl = torn_paper(rng, SLIP_W, SLIP_H, lines=False, stain=False, curl=key in ('settings', 'quit'),
                    holes=False, fold=False, age=1.0)
    if glow or faded:
        a = sl.a
        lut = {}
        if glow:   # lantern-lit washi
            lut = {'paper4': 'fire5', 'paper3': 'gold4', 'paper2': 'gold3', 'paper1': 'gold2', 'paper0': 'gold1'}
        if faded:  # sun-bleached and grubby
            lut = {'paper4': 'paper3', 'paper3': 'paper2', 'paper2': 'paper2', 'paper1': 'paper1'}
        for name, new in lut.items():
            m = np.all(a[..., :3] == PAL[name], axis=2) & (a[..., 3] > 0)
            a[m, :3] = PAL[new]
    return sl


# one bud and two leaves (the tea picker's ichishin-niyo), drawn by hand; the stem foot is at SPRIG_FOOT
SPRIG = """
....b........
...Bb........
...Bbd.......
....bd.......
.LLl.s.......
LLllds.......
.ddD..s...Ll.
......s.LLlld
.......slldD.
.......s.DD..
.......s.....
.......s....."""
SPRIG_FOOT = (7, 11)
_SPRIG_COL = {'B': 'leaf5', 'b': 'leaf4', 'L': 'leaf4', 'l': 'leaf3', 'd': 'leaf2', 'D': 'leaf1', 's': 'leaf2'}


def _sprig(cv, x, y, f, n=HOVER_N, sparkle=True):
    """The tea sprig tucked under the nail at (x, y): it rocks in the breeze (the top half leans a
    pixel either way) and a dewdrop on the bud catches the light."""
    rock = (0, 1, 1, 0, 0, -1, -1, 0)[f % n] if n == 8 else int(round(math.sin(2 * math.pi * f / n)))
    rows = SPRIG.strip('\n').split('\n')
    fx, fy = SPRIG_FOOT
    for r, row in enumerate(rows):
        off = rock if r <= 5 else 0
        for c, ch in enumerate(row):
            if ch in _SPRIG_COL:
                cv.px(x + c - fx + off, y + r - fy, _SPRIG_COL[ch])
    if sparkle:
        k = f % n
        gx, gy = x + 3 - fx + rock, y + 1 - fy
        if k in (2, 3, 4):
            cv.px(gx, gy, 'white' if k < 4 else 'cloud2')
        if k == 3:
            for (dx, dy) in ((-1, 0), (0, -1)):
                cv.px(gx + dx, gy + dy, 'gold4')


def _halo(w, h, mask, ox, oy, col, strength=70, reach=4):
    """Soft partial-alpha glow round a mask (like the lanterns' halo)."""
    from scipy.ndimage import distance_transform_edt
    H = Canvas(w, h)
    full = np.zeros((h, w), bool)
    mh, mw = mask.shape
    full[oy:oy + mh, ox:ox + mw] = mask
    d = distance_transform_edt(~full)
    rgb = PAL[col]
    for y, x in zip(*np.nonzero((d > 0) & (d <= reach))):
        a = int(strength * (1 - (d[y, x] - 1) / reach))
        if a > 0:
            H.a[y, x] = (*rgb, a)
    return H


def button(key, label, state='normal', f=0):
    """One button state as a Canvas (CW x CH). f: frame of the hover animation."""
    rng = random.Random(SLIP_SEED[key] * 7 + 1)
    m = _board_mask()
    h, w = m.shape
    b = Canvas(w, h)
    tmp = Canvas(w, h)
    wood_face(tmp, 0, 0, w, h, rng, 'wood', 4, 'h', knots=False)
    for y, x in zip(*np.nonzero(m)):
        b.px(x, y, tmp.get(x, y)[:3])
    # the room tags' edge light: wood5 top / left, wood2 bottom / right (and along the point)
    for y, x in zip(*np.nonzero(m)):
        up = y == 0 or not m[y - 1, x]
        lf = x == 0 or not m[y, x - 1]
        dn = y == h - 1 or not m[y + 1, x]
        rt = x == w - 1 or not m[y, x + 1]
        if dn or (rt and y > (h - 1) / 2):
            b.px(x, y, 'wood2')
        elif rt:
            b.px(x, y, 'wood3')
        elif up:
            b.px(x, y, 'wood5')
        elif lf:
            b.px(x, y, 'wood5')
    # a knock on the point and nail holes from an older board
    chip(b, BW - 4, 2, 5, 3, rng, under='wood5', under_dark='wood3', n=1, rmin=0.8, rmax=1.2, elong=0.8)
    # the slip, with a 1 px shadow on the wood below / right of it
    glow = state == 'hover'
    sl = _slip(key, glow=glow, faded=state == 'disabled')
    sm = sl.a[..., 3] > 0
    shadow = (_sh(sm, 1, 1) | _sh(sm, 1, 0)) & ~sm
    for y, x in zip(*np.nonzero(shadow)):
        X, Y = SLIP_X + x, SLIP_Y + y
        if 0 <= X < w and 0 <= Y < h and m[Y, X]:
            b.shift(X, Y, -1)
    b.blit(sl, SLIP_X, SLIP_Y)
    # lettering
    lm = label_mask(label)
    ink = {'normal': 'ink', 'hover': 'red1', 'pressed': 'ink', 'disabled': 'paper1'}[state]
    tx, ty = SLIP_X + 6, SLIP_Y + 3
    for y, x in zip(*np.nonzero(lm)):
        b.px(tx + x, ty + y, ink)
    nail(b, NAIL[0], NAIL[1])
    # state tints
    if state == 'pressed':
        b.shift_rect(0, 0, w, h, -1)
    if state == 'disabled':
        greys = {'wood6': 'stone4', 'wood5': 'stone3', 'wood4': 'stone3', 'wood3': 'stone2', 'wood2': 'stone1',
                 'wood1': 'stone1', 'wood0': 'stone0'}
        a = b.a
        for name, new in greys.items():
            mm = np.all(a[..., :3] == PAL[name], axis=2) & (a[..., 3] > 0)
            a[mm, :3] = PAL[new]
        from shapes import cobweb
        cobweb(b, w - 1, 0, 9, 'cloud2', 'cloud1', 'tr')
    if glow:   # the lit slip warms the wood round it
        for y, x in zip(*np.nonzero(m)):
            r, i = _ramp_of(b.get(x, y))
            if r == 'wood' and 2 <= i <= 4:
                b.shift(x, y, 1)
    board = O.outline(b)
    dx, dy = {'normal': (0, 0), 'hover': (2, 0), 'pressed': (1, 1), 'disabled': (0, 0)}[state]
    cv = Canvas(CW, CH)
    if state in ('hover', 'pressed'):
        bm = board.a[..., 3] > 0
        flick = 1.0 if state == 'hover' else 0.45
        if state == 'hover':
            flick *= 0.92 + 0.08 * math.sin(2 * math.pi * f / HOVER_N * 2)
        cv.blit(_halo(CW, CH, bm, BOX - 1 + dx, BOY - 1 + dy, 'gold3', int(78 * flick), 4), 0, 0)
    cv.blit(board, BOX - 1 + dx, BOY - 1 + dy)
    if state in ('hover', 'pressed'):
        sp = Canvas(CW, CH)
        _sprig(sp, BOX + NAIL[0] + dx, BOY + NAIL[1] + dy, f if state == 'hover' else 0, sparkle=state == 'hover')
        sp = O.outline(sp)
        cv.blit(sp, -1, -1)
        nail(cv, BOX + NAIL[0] + dx, BOY + NAIL[1] + dy)
    return cv


# ---------------------------------------------------------------------- the post
POST_W = 7
ROOF_W, ROOF_H = 25, 9
STACK_GAP = 3                    # px of post showing between two boards
MENU_X, MENU_Y = 22, 239         # top-left of the first board on the screen
POST_TOP = MENU_Y - 20           # the roof's ridge on the screen


def signpost(height=None):
    """The weathered post the boards are nailed to, roofed like an old kosatsu notice board: vertical
    grain lit on its left edge, a little gable of shingles with a moss cushion on the ridge, a hemp
    band tied under the eave. It runs off the bottom of the screen.
    Returns (canvas, (x, y) of its top-left on the screen)."""
    height = height or (ML.H - POST_TOP + 2)
    rng = random.Random(77)
    w = ROOF_W + 2
    cv = Canvas(w, height)
    cx = w // 2
    px0 = cx - POST_W // 2
    wood_face(cv, px0, ROOF_H - 1, POST_W, height - ROOF_H + 1, rng, 'wood', 3, 'v', knots=False)
    cv.vline(px0, ROOF_H, height - 1, 'wood5')
    cv.vline(px0 + 1, ROOF_H, height - 1, 'wood4')
    cv.vline(px0 + POST_W - 1, ROOF_H, height - 1, 'wood1')
    cv.vline(px0 + POST_W - 2, ROOF_H, height - 1, 'wood2')
    for y in (44, 67, 105):                       # old nail holes
        cv.px(px0 + 3, y, 'wood0'); cv.px(px0 + 4, y + 1, 'wood4')
    crack(cv, random.Random(3), px0 + 2, 74, 14, 'wood1', hi='wood4', dirx=0.05, diry=1.0, branch=0.0)
    # the gable end: a steep triangle that flares out at the eaves (the Japanese roof curve), its
    # left slope in the light, the right in shade, shingle courses, bargeboards along both slopes
    top = 1
    def half(y):
        t = y / (ROOF_H - 1)
        return 1.0 + (ROOF_W / 2 - 1.0) * t ** 1.55
    for y in range(ROOF_H):
        hw = half(y)
        for x in range(cx - int(hw), cx + int(hw) + 1):
            left = x <= cx
            course = y in (3, 6)
            c = ('wood4' if left else 'wood2') if not course else ('wood3' if left else 'wood1')
            if left and (x + y) % 6 == 0 and not course:
                c = 'wood3'                               # a few shingle butts
            if not left and (x + y) % 6 == 3 and not course:
                c = 'wood1'
            cv.px(x, top + y, c)
        # bargeboards: the slope edges
        cv.px(cx - int(hw), top + y, 'wood5')
        cv.px(cx + int(hw), top + y, 'wood1')
        if y > 0 and int(hw) > int(half(y - 1)) + 1:
            for x in range(cx - int(hw), cx - int(half(y - 1))):
                cv.px(x, top + y, 'wood5')
            for x in range(cx + int(half(y - 1)) + 1, cx + int(hw) + 1):
                cv.px(x, top + y, 'wood1')
    ey = top + ROOF_H
    for x in range(cx - ROOF_W // 2 + 1, cx + ROOF_W // 2):       # eave board under the flare
        cv.px(x, ey, 'wood2' if x < cx else 'wood1')
    cv.px(cx, top - 1, 'wood3')                                   # a little finial
    moss.clump(cv, random.Random(6), cx - 8, top + 7, 7, 3, 'ledge', spores=0.0, shadow=False)
    # the eave throws a shadow down the post, then a hemp band
    for x in range(px0, px0 + POST_W):
        cv.shift(x, ey + 1, -2)
        cv.shift(x, ey + 2, -1)
    for y in range(ey + 5, ey + 8):
        for i in range(POST_W):
            cv.px(px0 + i, y, _ROPE[(y + i) % 3][0 if i < POST_W // 2 else 1])
    out = O.outline(cv)
    return out, (MENU_X + NAIL[0] - (out.w // 2), POST_TOP - top)


def menu_positions():
    """Screen top-left of each button canvas (all states share it)."""
    pos = {}
    for k, (key, _) in enumerate(BUTTONS):
        bx = MENU_X
        by = MENU_Y + k * (BH + STACK_GAP)
        pos[key] = (bx - BOX, by - BOY)
    return pos


# ====================================================================== the cursor
# A calligraphy brush (fude) pointing up-left: the inked tip is the hotspot, then the black hair, a
# red-lacquer ferrule, a bamboo handle with two nodes, a dark end cap and a red cord loop. Its idle
# wiggle (4 frames): the tip stays planted while the handle end rocks a pixel, and the wet ink
# glints once.
CURSOR_N = 4
CURSOR_HOT = (1, 1)
CURSOR_SIZE = (21, 22)

# drawn by hand at 45 degrees; the hotspot is the ink point at CURSOR_HOT
#   k ink  h wet sheen  r/R/q red lacquer (lit / mid / shade)  g/G/o gold band
#   B/b/d bamboo (lit / mid / shade)  n/N node  c/C end cap
BRUSH = """
....................
.k..................
..kk................
..kkh...............
...kkH..............
...kkkh.............
....kkkh............
.....kkRr...........
......qRRr..........
.......qGGg.........
........oBBb........
.........dBBb.......
..........dnNb......
...........dBBb.....
............dBBb....
.............dBBb...
..............dnNb..
...............dCCc.
................dCc.
...................."""
_BRUSH_COL = {'k': 'ink', 'h': 'stone2', 'H': 'stone3', 'r': 'red4', 'R': 'red3', 'q': 'red1', 'g': 'gold4', 'G': 'gold3',
              'o': 'gold1', 'B': 'hinoki5', 'b': 'hinoki3', 'd': 'hinoki2', 'n': 'hinoki1', 'N': 'hinoki1',
              'c': 'wood3', 'C': 'wood2'}


def cursor_frame(f):
    """Frame f of the idle wiggle: the inked point stays planted on the hotspot while the handle
    swings a pixel right (1) and down (3); the point flicks on 1 and the wet ink glints on 2."""
    f %= CURSOR_N
    w, h = CURSOR_SIZE
    cv = Canvas(w, h)
    sx, sy = ((0, 0), (1, 0), (0, 0), (0, 1))[f]
    for y, row in enumerate(BRUSH.strip('\n').split('\n')):
        for x, ch in enumerate(row):
            if ch not in _BRUSH_COL:
                continue
            handle = x + y >= 16                       # from the gold band on
            if handle:
                cv.px(x + sx, y + sy, _BRUSH_COL[ch])
                if sy and x + y == 16:
                    cv.px(x, y, _BRUSH_COL[ch])         # stretch the band to close the gap
                if sx and x + y == 16:
                    cv.px(x, y, _BRUSH_COL[ch])
            else:
                cv.px(x, y, _BRUSH_COL[ch])
    if f == 1:                         # the point flicks: the tip hairs spring a pixel out
        cv.px(2, 2, None); cv.px(3, 2, 'ink')
    if f == 2:
        cv.px(4, 3, 'stone4'); cv.px(5, 4, 'cloud3')
    return O.outline(cv)


# ====================================================================== export
TITLE_TEXT = 'Old Rundown Teahouse'
SHEET_COLS = 8
CURSOR_FPS = 4


def _save(cv, name, scale=1):
    path = os.path.join(OUT, name)
    cv.save(path, scale)
    return name


def _sheet(frames, cols):
    """Frames (same size) in a grid, row by row."""
    w, h = frames[0].w, frames[0].h
    rows = (len(frames) + cols - 1) // cols
    sh = Canvas(w * min(cols, len(frames)), h * rows)
    for i, fr in enumerate(frames):
        sh.blit(fr, (i % cols) * w, (i // cols) * h)
    return sh


def _gif(frames, path, fps, scale=3, bg=(118, 190, 232)):
    ims = []
    for f in frames:
        a = f.a.astype(np.float32)
        al = a[..., 3:4] / 255.0
        rgb = a[..., :3] * al + np.array(bg, np.float32) * (1 - al)
        im = Image.fromarray(np.clip(rgb + 0.5, 0, 255).astype(np.uint8))
        ims.append(im.resize((im.width * scale, im.height * scale), Image.NEAREST))
    pal = Image.fromarray(np.concatenate([np.asarray(i) for i in ims[::max(1, len(ims) // 8)]], 0)).quantize(
        colors=255, method=Image.MEDIANCUT, dither=Image.NONE)
    q = [i.quantize(palette=pal, dither=Image.NONE) for i in ims]
    q[0].save(path, save_all=True, append_images=q[1:], duration=int(round(1000 / fps)), loop=0, disposal=2)


def title_screen_pos():
    """Where the plaque canvas goes: its board inside TITLE_BOX, its cords running up off the top."""
    tx0, ty0, tx1, ty1 = ML.TITLE_BOX
    x = tx0 + ((tx1 - tx0) - PLAQUE_W) // 2
    return x, 0


def export_title():
    meta = {}
    x, y = title_screen_pos()
    for name, txt in (('title_plaque', TITLE_TEXT), ('title_plaque_blank', None)):
        still = plaque_frame(txt, 0, glint=False)
        _save(still, f'{name}.png')
        frames = [plaque_frame(txt, f) for f in range(ML.N)]
        _save(frames[0], f'{name}_anim_f0.png')
        _save(_sheet(frames, SHEET_COLS), f'{name}_anim_sheet.png')
        _gif(frames, os.path.join(OUT, f'{name}_anim_3x.gif'), ML.FPS)
        info = dict(image=f'{name}.png', frame0=f'{name}_anim_f0.png', sheet=f'{name}_anim_sheet.png',
                    gif=f'{name}_anim_3x.gif', frames=ML.N, fps=ML.FPS, frame_w=still.w, frame_h=still.h,
                    sheet_cols=SHEET_COLS, sheet_rows=(ML.N + SHEET_COLS - 1) // SHEET_COLS, order='row-major',
                    text=txt, screen_xy=[x, y])
        meta[name] = info
        with open(os.path.join(OUT, f'{name}_anim.json'), 'w') as fh:
            json.dump(dict(info, note='The sign swings gently on its cords with menu_layout.sway (the board stays '
                                      'level, the tassels lag behind) and a glint runs over the gilt once per loop '
                                      '(frames 18-41). Frame i is at column i % sheet_cols, row i // sheet_cols.'),
                      fh, indent=1)
    # the lettering area, for whoever letters the real name later (canvas coordinates)
    meta['lettering_box'] = [TEXT_BOX[0] + 1, TEXT_BOX[1], TEXT_BOX[2] + 1, TEXT_BOX[3]]
    return meta


def export_buttons():
    meta = {}
    states = ('normal', 'hover', 'pressed')
    rows = []
    for key, label in BUTTONS:
        entry = dict(label=label, size=[CW, CH], states={})
        st_list = states + (('disabled',) if key == 'continue' else ())
        row = []
        for st in st_list:
            cv = button(key, label, st, 0)
            entry['states'][st] = _save(cv, f'btn_{key}_{st}.png')
            row.append(cv)
        hov = [button(key, label, 'hover', f) for f in range(HOVER_N)]
        entry['hover_anim'] = dict(strip=_save(_sheet(hov, HOVER_N), f'btn_{key}_hover_strip.png'), frames=HOVER_N,
                                   fps=8, frame_w=CW, frame_h=CH)
        # the clickable board inside the canvas (normal position)
        entry['hit_rect_in_canvas'] = [BOX, BOY, BW + TIP, BH]
        meta[key] = entry
        rows.append(row)
    # one sheet: a row per button, columns normal / hover / pressed / disabled
    sh = Canvas(CW * 4, CH * len(rows))
    for j, row in enumerate(rows):
        for i, cv in enumerate(row):
            sh.blit(cv, i * CW, j * CH)
    _save(sh, 'buttons_sheet.png')
    post, ppos = signpost()
    _save(post, 'signpost.png')
    return meta, post, ppos


def export_cursor():
    frames = [cursor_frame(f) for f in range(CURSOR_N)]
    _save(frames[0], 'cursor.png')
    _save(_sheet(frames, CURSOR_N), 'cursor_strip.png')
    info = dict(image='cursor.png', strip='cursor_strip.png', frames=CURSOR_N, fps=CURSOR_FPS,
                frame_w=frames[0].w, frame_h=frames[0].h, hotspot=[CURSOR_HOT[0] + 1, CURSOR_HOT[1] + 1],
                note='A calligraphy brush; the hotspot is its inked point (it stays put while the handle wiggles).')
    with open(os.path.join(OUT, 'cursor.json'), 'w') as fh:
        json.dump(info, fh, indent=1)
    return info, frames


def compose(f=0, hover='new_journey', pressed=None, cursor=True, continue_disabled=False, backdrop=True):
    """The whole menu on a plain sky / meadow backdrop at 1x (640 x 360), frame f."""
    cv = Canvas(ML.W, ML.H)
    if backdrop:
        sky = RAMPS['sky']
        for y in range(ML.HORIZON):
            t = y / ML.HORIZON
            c = sky[2] if t < 0.45 else (sky[3] if t < 0.85 else sky[4])
            cv.hline(0, ML.W - 1, y, c)
        for y in range(ML.HORIZON, ML.H):
            t = (y - ML.HORIZON) / (ML.H - ML.HORIZON)
            c = PAL['leaf4'] if t < 0.12 else PAL['leaf3']
            cv.hline(0, ML.W - 1, y, c)
    x, y = title_screen_pos()
    cv.blit(plaque_frame(TITLE_TEXT, f), x, y)
    post, (px_, py_) = signpost()
    cv.blit(post, px_, py_)
    pos = menu_positions()
    for key, label in BUTTONS:
        if key in (hover, pressed):
            continue
        st = 'disabled' if (key == 'continue' and continue_disabled) else 'normal'
        bx, by = pos[key]
        cv.blit(button(key, label, st), bx, by)
    for key, st in ((pressed, 'pressed'), (hover, 'hover')):
        if key:
            bx, by = pos[key]
            cv.blit(button(key, dict(BUTTONS)[key], st, f % HOVER_N), bx, by)
    if cursor and hover:
        bx, by = pos[hover]
        cx, cy = bx + BOX + 97, by + BOY + 12
        cv.blit(cursor_frame((f // 3) % CURSOR_N), cx - CURSOR_HOT[0] - 1, cy - CURSOR_HOT[1] - 1)
    return cv


def export_layout(title_meta, btn_meta, post, ppos, cursor_info):
    pos = menu_positions()
    tx, ty = title_screen_pos()
    lay = dict(
        screen=[ML.W, ML.H], scale=3, frames=ML.N, fps=ML.FPS,
        note='All positions are the top-left of each PNG on the 640x360 screen. Draw order: title plaque, '
             'signpost, the buttons top to bottom, the hovered / pressed button last (its glow and tea sprig '
             'overlap its neighbours), the cursor on top. Every state of a button has the same canvas size and '
             'spot (the hover nudge and press offset are drawn inside it).',
        title=dict(x=tx, y=ty, w=PLAQUE_W, h=PLAQUE_H, image=title_meta['title_plaque']['image'],
                   blank=title_meta['title_plaque_blank']['image'],
                   anim=dict(sheet=title_meta['title_plaque']['sheet'], frames=ML.N, fps=ML.FPS,
                             cols=SHEET_COLS, json='title_plaque_anim.json'),
                   board_rect=[tx + BX0 + 1, ty + BY0, BX1 - BX0 + 1, BY1 - BY0 + 1],
                   lettering_rect=[tx + TEXT_BOX[0] + 1, ty + TEXT_BOX[1], TEXT_BOX[2] - TEXT_BOX[0] + 1,
                                   TEXT_BOX[3] - TEXT_BOX[1] + 1],
                   title_box=list(ML.TITLE_BOX)),
        signpost=dict(x=ppos[0], y=ppos[1], w=post.w, h=post.h, image='signpost.png'),
        buttons=[],
        cursor=dict(image='cursor.png', strip='cursor_strip.png', frames=CURSOR_N, fps=CURSOR_FPS,
                    hotspot=cursor_info['hotspot'], w=cursor_info['frame_w'], h=cursor_info['frame_h']),
        menu_box=list(ML.MENU_BOX))
    for key, label in BUTTONS:
        bx, by = pos[key]
        m = btn_meta[key]
        lay['buttons'].append(dict(id=key, label=label, x=bx, y=by, w=CW, h=CH,
                                   hit_rect=[bx + BOX, by + BOY, BW + TIP, BH], states=m['states'],
                                   hover_anim=m['hover_anim']))
    with open(os.path.join(OUT, 'layout.json'), 'w') as fh:
        json.dump(lay, fh, indent=1)
    return lay


def title_fits(text):
    """True if `text` fits the plaque's lettering panel in the gilt face (with a little air)."""
    m = title_mask(text)
    tx0, ty0, tx1, ty1 = TEXT_BOX
    return m.shape[1] + 1 <= (tx1 - tx0 + 1) - 8


def main(argv=None):
    import argparse
    global TITLE_TEXT
    ap = argparse.ArgumentParser(description='Draw the main menu UI into teahouse-assets/main_menu/ui/.')
    ap.add_argument('--title', default=TITLE_TEXT, help='the game\'s name, lettered in gilt on the plaque')
    args = ap.parse_args(argv)
    TITLE_TEXT = args.title
    if not title_fits(TITLE_TEXT):
        print(f'warning: "{TITLE_TEXT}" is {title_mask(TITLE_TEXT).shape[1]} px wide; the panel takes '
              f'{TEXT_BOX[2] - TEXT_BOX[0] - 7} px. It will be clipped: shorten it or widen the board (BX0/BX1).')
    os.makedirs(OUT, exist_ok=True)
    title_meta = export_title()
    btn_meta, post, ppos = export_buttons()
    cursor_info, _ = export_cursor()
    export_layout(title_meta, btn_meta, post, ppos, cursor_info)
    prev = compose(0)
    prev.save(os.path.join(OUT, 'menu_preview.png'), 3)
    frames = [compose(f) for f in range(ML.N)]
    _gif([fr.crop(0, 0, 320, ML.H) for fr in frames], os.path.join(OUT, 'menu_preview_anim_2x.gif'), ML.FPS, 2)
    print('menu ui ->', OUT)


if __name__ == '__main__':
    main()
