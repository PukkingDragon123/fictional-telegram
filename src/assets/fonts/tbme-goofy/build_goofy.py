#!/usr/bin/env python3
"""TBME Goofy: a bouncy pixel font made from Chewy (Apache 2.0, (c) 2010 Font Diner, Inc DBA Sideshow).
  python3 build_goofy.py Chewy-Regular.ttf OUTDIR [--preview PNG]
Chewy is pixelized on a 20 px em grid (caps 14 px), every letter gets a fixed little hop (+-1 px)
and tilt (+-3 deg) so lines of text bounce, a few glyphs are redrawn for clarity ('1' flag, serif 'I',
bigger '+' and 'x'), and the game's symbols (male/female, stars, hearts, arrows, ticks, triangles) are
drawn on the same grid. Writes TBMEGoofy-Regular.woff2 (one weight: Chewy is already heavy)."""
import sys, os, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pix
from pix import pixelize, G
from build import symbols, build, raster, line, poly

CAP = 14


def bouncer(cp, amp):
    dy, ang = _orig(cp, amp)
    ch = chr(cp)
    if not ch.isalpha():  # digits / punctuation: hop only, never tilt (numbers stay crisp)
        ang = 0.0
        if not ch.isdigit():
            dy = 0
    return dy, ang


_orig = pix.bounce_of


def grid(g):
    return [list(r) for r in g.rows]


def to_rows(gr):
    return [''.join(r) for r in gr]


def fix_one(g):
    """add a flag to the top-left of '1' so it never reads as l / I."""
    gr = grid(g)
    w = len(gr[0])
    top = gr[0]
    xs = [i for i, v in enumerate(top) if v == '#']
    sx = xs[0] if xs else 0
    pad = 3
    gr = [['.'] * pad + r for r in gr]
    for k in range(3):  # 3 rows of flag stepping down-left
        for c in range(pad + sx - 1 - k * 1 - 2, pad + sx):
            if 0 <= c and k + 1 < len(gr):
                gr[k + 1][c] = '#'
    # trim empty left cols
    while all(r[0] == '.' for r in gr):
        gr = [r[1:] for r in gr]
    g2 = G(to_rows(gr), g.x0, g.ytop, 0)
    g2.adv = g.x0 + len(gr[0]) + 2
    return g2


def fix_I(g):
    """capital I gets slab serifs (l stays a plain stem): 2 px past the stem, top and bottom."""
    gr = grid(g)
    h = len(gr)
    gr = [['.', '.'] + r + ['.', '.'] for r in gr]
    w = len(gr[0])
    for rr, ref in ((0, 0), (1, 0), (h - 2, h - 1), (h - 1, h - 1)):
        xs = [c for c in range(w) if gr[ref][c] == '#']
        for c in range(max(0, xs[0] - 2), min(w, xs[-1] + 3)):
            gr[rr][c] = '#'
    # trim empty columns, keep 2 px clear on the right so I I never touch
    while all(r[0] == '.' for r in gr):
        gr = [r[1:] for r in gr]
    while all(r[-1] == '.' for r in gr):
        gr = [r[:-1] for r in gr]
    x0 = max(0, g.x0 - 1)
    return G(to_rows(gr), x0, g.ytop, x0 + len(gr[0]) + 2)


def drawn(cap, sw):
    out = {}
    m = cap / 2

    def plus(d, T, s):
        poly(d, T, [(4, m - 5), (7, m - 5), (7, m + 5), (4, m + 5)])
        poly(d, T, [(0.5, m - 1.5), (10.5, m - 1.5), (10.5, m + 1.5), (0.5, m + 1.5)])
    out[ord('+')] = raster(11, cap, 1, plus)

    def times(d, T, s):
        line(d, T, s, (1.5, m - 4.0), (8.5, m + 3.0), 2.8)
        line(d, T, s, (1.5, m + 3.0), (8.5, m - 4.0), 2.8)
    out[0xD7] = raster(10, cap, 1, times)

    def minus(d, T, s):
        poly(d, T, [(0.5, m - 1.5), (10.5, m - 1.5), (10.5, m + 1.5), (0.5, m + 1.5)])
    out[0x2212] = raster(11, cap, 1, minus)
    return out


def make(src, bounce, embolden):
    pix.bounce_of = bouncer
    RANGES = [(0x20, 0x7E), (0xA0, 0xFF), (0x152, 0x153), (0x2013, 0x2014), (0x2018, 0x201E), (0x2022, 0x2022),
              (0x2026, 0x2026), (0x2039, 0x203A), (0x20AC, 0x20AC), (0x2122, 0x2122)]
    chars = ''.join(chr(u) for lo, hi in RANGES for u in range(lo, hi + 1))
    gl = pixelize(src, CAP, chars=chars, bounce=bounce, embolden=0)
    pix.bounce_of = _orig
    gl[ord('1')] = fix_one(gl[ord('1')])
    gl[ord('I')] = fix_I(gl[ord('I')])
    # Chewy's B has a filled lower bowl and reads as 8 when pixelized: hand-drawn B with a straight stem
    gl[ord('B')] = G(['.######...', '########..', '###..####.', '###...###.', '###...###.', '###..####.',
                      '#######...', '########..', '###..####.', '###...####', '###...####', '###..####.',
                      '#########.', '#######...'], 1, gl[ord('B')].ytop, 12)
    # middle dot: a solid 3x3 block (Chewy's is a 2 px speck), used as a separator all over the UI
    gl[0xB7] = G(['###', '###', '###'], 2, 9, 7)
    sw = 2.4
    for cp, g in symbols(CAP, sw).items():
        if cp not in gl or cp in (0x2022,):
            gl[cp] = g
    gl.update(drawn(CAP, sw))
    gl[0xA0] = gl[0x20]
    if embolden:
        for cp, g in gl.items():
            if not g.rows:
                continue
            gr = [r + '.' for r in g.rows]
            gr = [''.join('#' if r[i] == '#' or (i > 0 and r[i - 1] == '#') else '.' for i in range(len(r))) for r in gr]
            gl[cp] = G(gr, g.x0, g.ytop, g.adv + 1)
    return gl


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('outdir')
    ap.add_argument('--bounce', type=float, default=1)
    ap.add_argument('--preview')
    a = ap.parse_args()
    reg = make(a.src, a.bounce, 0)
    build(reg, os.path.join(a.outdir, 'TBMEGoofy-Regular.woff2'), 'TBME Goofy', 400, 'Regular',
          copyright='Pixel version for The Bear Must Eat, made from Chewy: Copyright (c) 2010 by Font Diner, Inc DBA Sideshow.',
          license='Licensed under the Apache License, Version 2.0. Modified: pixelized, letters hop/tilt, symbols added.',
          license_url='http://www.apache.org/licenses/LICENSE-2.0')
    print('ok', len(reg), 'glyphs')
    if a.preview:
        from PIL import Image
        txt = ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz', '0123456789 $1,250 +25 x3 ×3 −5 1lI 5S 2Z 8B 0O',
               '!?.,:;\'"()[]{}<>/\\|@#%&*=_~^`', '♂♀★☆♥♡▸▶◀▼▲→←↑↓✓✗✕×·•…−–—±°¢©“”‘’‹›é à ô',
               'Reynard: Research is free, but it takes time.']
        ims = [pix.preview(gl, t, 3) for gl in (reg,) for t in txt]
        W = max(i.width for i in ims) + 20
        H = sum(i.height + 4 for i in ims) + 20
        sh = Image.new('RGBA', (W, H), (243, 226, 184, 255))
        y = 10
        for i in ims:
            sh.alpha_composite(i, (10, y)); y += i.height + 4
        sh.save(a.preview)
