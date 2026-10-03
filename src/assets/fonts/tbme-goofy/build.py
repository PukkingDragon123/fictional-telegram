#!/usr/bin/env python3
"""Build a pixel woff2 from a pixelized vector font + drawn symbols.
usage: build.py SRC.ttf OUT.woff2 FAMILY [--cap 14] [--bounce 1] [--weight 400] [--thr .5] [--embolden 0]"""
import sys, os, argparse, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pix import pixelize, G, S
from PIL import Image, ImageDraw
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

EM = 20          # pixels per em
P = 50           # font units per pixel  -> UPM 1000
ASC, DESC = 19, 5  # px (0.95em / 0.25em)


def raster(w, h_top, h_bot, fn, thr=0.5):
    """Draw with fn(d, T, s) on a supersampled canvas; px coords: x right, y UP from baseline.
    T(x, y) -> hi-res (X, Y). s = supersample scale. Returns G."""
    W, H = w * S, (h_top + h_bot) * S
    im = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(im)
    T = lambda x, y: (x * S, (h_top - y) * S)
    fn(d, T, S)
    sm = im.reduce(S)
    px = sm.load()
    rows = [''.join('#' if px[x, y] >= thr * 255 else '.' for x in range(w)) for y in range(h_top + h_bot)]
    # crop
    ys = [i for i, r in enumerate(rows) if '#' in r]
    xs = [x for x in range(w) if any(r[x] == '#' for r in rows)]
    y0, y1, x0, x1 = min(ys), max(ys), min(xs), max(xs)
    rows = [r[x0:x1 + 1] for r in rows[y0:y1 + 1]]
    return G(rows, 1, h_top - y0, (x1 - x0 + 1) + 3)


def poly(d, T, pts):
    d.polygon([T(*p) for p in pts], fill=255)


def line(d, T, s, a, b, wpx):
    d.line([T(*a), T(*b)], fill=255, width=int(wpx * s))
    for p in (a, b):
        X, Y = T(*p); r = wpx * s / 2
        d.ellipse([X - r, Y - r, X + r, Y + r], fill=255)


def ring(d, T, s, cx, cy, r, wpx):
    X, Y = T(cx, cy)
    d.ellipse([X - r * s, Y - r * s, X + r * s, Y + r * s], outline=255, width=int(wpx * s))


def symbols(cap, sw):
    """sw = stroke width in px (2 for the chunky faces). cap = cap height px."""
    c = cap
    out = {}
    m = c / 2  # mid height

    def male(d, T, s):
        ring(d, T, s, 5.5, 5.5, 5.5, sw)
        line(d, T, s, (8.6, 8.6), (12.2, 12.2), sw)
        poly(d, T, [(13.5, 13.5), (7.6, 13.5), (13.5, 7.6)])
    out[0x2642] = raster(15, c + 2, 2, male)

    def female(d, T, s):
        ring(d, T, s, 5.5, c - 5.0, 5.0, sw)
        line(d, T, s, (5.5, c - 10.5), (5.5, -2.5), sw)
        line(d, T, s, (2.0, 0.5), (9.0, 0.5), sw)
    out[0x2640] = raster(12, c + 2, 4, female)

    def star(fill):
        def f(d, T, s):
            cx, cy, R, r = 7.5, m + 0.5, 7.8, 3.4
            pts = []
            for i in range(10):
                a = math.pi / 2 + i * math.pi / 5
                rr = R if i % 2 == 0 else r
                pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
            poly(d, T, pts)
            if not fill:
                pts2 = []
                for i in range(10):
                    a = math.pi / 2 + i * math.pi / 5
                    rr = (R - 2.6) if i % 2 == 0 else (r - 1.2)
                    pts2.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
                d.polygon([T(*p) for p in pts2], fill=0)
        return f
    out[0x2605] = raster(16, c + 3, 2, star(True))
    out[0x2606] = raster(16, c + 3, 2, star(False))

    def heart(fill):
        def f(d, T, s):
            def shape(inset, val):
                r = 3.6 - inset
                for cx in (3.8, 10.2):
                    X, Y = T(cx, c - 4.2)
                    d.ellipse([X - r * s, Y - r * s, X + r * s, Y + r * s], fill=val)
                poly_pts = [(0.3 + inset * 1.2, c - 5.2), (13.7 - inset * 1.2, c - 5.2), (7, 0.6 + inset * 1.5)]
                d.polygon([T(*p) for p in poly_pts], fill=val)
            shape(0, 255)
            if not fill:
                shape(sw, 0)
        return f
    out[0x2665] = raster(15, c + 1, 1, heart(True))
    out[0x2661] = raster(15, c + 1, 1, heart(False))

    def tri(pts, w):
        return lambda d, T, s: poly(d, T, pts)
    out[0x25B8] = raster(9, c, 1, tri([(1, m - 4.5), (1, m + 4.5), (7.5, m)], 9))       # ▸ small
    out[0x25B6] = raster(12, c, 1, tri([(0.5, m - 6), (0.5, m + 6), (10.5, m)], 12))   # ▶
    out[0x25C0] = raster(12, c, 1, tri([(10.5, m - 6), (10.5, m + 6), (0.5, m)], 12))  # ◀
    out[0x25B2] = raster(14, c, 1, tri([(1, 1), (13, 1), (7, 11.5)], 14))              # ▲
    out[0x25BC] = raster(14, c, 1, tri([(1, 11.5), (13, 11.5), (7, 1)], 14))           # ▼

    def arrow(dirn):
        def f(d, T, s):
            if dirn in ('r', 'l'):
                y = m
                a, b = (1, y), (12, y)
                line(d, T, s, a if dirn == 'r' else (3.5, y), (10.5, y) if dirn == 'r' else b, sw)
                if dirn == 'r':
                    poly(d, T, [(14, y), (8.5, y + 5.2), (8.5, y - 5.2)])
                else:
                    poly(d, T, [(0, y), (5.5, y + 5.2), (5.5, y - 5.2)])
            else:
                x = 6
                if dirn == 'u':
                    line(d, T, s, (x, 0.5), (x, c - 4), sw)
                    poly(d, T, [(x, c + 0.5), (x - 5.5, c - 5.2), (x + 5.5, c - 5.2)])
                else:
                    line(d, T, s, (x, 4), (x, c - 0.5), sw)
                    poly(d, T, [(x, -0.5), (x - 5.5, 5.2), (x + 5.5, 5.2)])
        return f
    out[0x2192] = raster(15, c, 1, arrow('r'))
    out[0x2190] = raster(15, c, 1, arrow('l'))
    out[0x2191] = raster(13, c + 1, 1, arrow('u'))
    out[0x2193] = raster(13, c, 2, arrow('d'))

    def check(d, T, s):
        line(d, T, s, (1.5, m - 0.5), (5, 2), sw + 0.6)
        line(d, T, s, (5, 2), (12.5, c - 2), sw + 0.6)
    out[0x2713] = raster(15, c, 1, check)

    def cross(sz, wd):
        def f(d, T, s):
            o = (12 - sz) / 2 + 1
            line(d, T, s, (o, m - sz / 2), (o + sz, m + sz / 2), wd)
            line(d, T, s, (o, m + sz / 2), (o + sz, m - sz / 2), wd)
        return f
    out[0x2715] = raster(14, c, 1, cross(9, sw + 0.4))   # ✕
    out[0x2717] = raster(14, c, 1, cross(10, sw + 0.8))  # ✗ ballot x (a bit heavier)

    def block(d, T, s):
        poly(d, T, [(0, -DESC), (10, -DESC), (10, ASC), (0, ASC)])
    g = raster(10, ASC, DESC, block); g.x0 = 0; g.adv = 10
    out[0x2588] = g

    def pencil(d, T, s):
        line(d, T, s, (3, 3), (11.5, 11.5), sw + 1.4)
        poly(d, T, [(0.3, 0.3), (4.5, 1.2), (1.2, 4.5)])
    out[0x270E] = raster(14, c, 1, pencil)

    def minus(d, T, s):
        poly(d, T, [(1, m - 1.6), (10, m - 1.6), (10, m + 0.4), (1, m + 0.4)])
    out[0x2212] = raster(11, c, 1, minus)

    def bullet(d, T, s):
        X, Y = T(3, m - 0.5); r = 2.6 * s
        d.ellipse([X - r, Y - r, X + r, Y + r], fill=255)
    out[0x2022] = raster(6, c, 1, bullet)
    return out


def glyph_from_rows(g):
    pen = TTGlyphPen(None)
    h = len(g.rows)
    # merge identical horizontal runs across consecutive rows into rectangles
    rects = []
    open_ = {}
    for ri, r in enumerate(g.rows):
        runs = []
        c = 0
        while c < len(r):
            if r[c] != '#':
                c += 1; continue
            s0 = c
            while c < len(r) and r[c] == '#':
                c += 1
            runs.append((s0, c))
        new_open = {}
        for run in runs:
            if run in open_:
                new_open[run] = (open_[run][0], ri)
            else:
                new_open[run] = (ri, ri)
        for run, (a, b) in open_.items():
            if run not in new_open:
                rects.append((run, a, b))
        open_ = new_open
    for run, (a, b) in open_.items():
        rects.append((run, a, b))
    for (x0, x1), ra, rb in rects:
        X0, X1 = (g.x0 + x0) * P, (g.x0 + x1) * P
        Ytop = (g.ytop - ra) * P
        Ybot = (g.ytop - rb - 1) * P
        pen.moveTo((X0, Ybot)); pen.lineTo((X0, Ytop)); pen.lineTo((X1, Ytop)); pen.lineTo((X1, Ybot)); pen.closePath()
    return pen.glyph()


def build(glyphs, out, family, weight=400, style='Regular', copyright='', license='', license_url=''):
    names = {0: '.notdef'}
    order = ['.notdef']
    cmap = {}
    for cp in sorted(glyphs):
        n = 'uni%04X' % cp
        order.append(n); cmap[cp] = n
    fb = FontBuilder(EM * P, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    gl = {}
    mt = {}
    nd = TTGlyphPen(None)
    nd.moveTo((P, 0)); nd.lineTo((P, 14 * P)); nd.lineTo((9 * P, 14 * P)); nd.lineTo((9 * P, 0)); nd.closePath()
    gl['.notdef'] = nd.glyph(); mt['.notdef'] = (10 * P, P)
    for cp, n in cmap.items():
        g = glyphs[cp]
        gl[n] = glyph_from_rows(g)
        mt[n] = (g.adv * P, g.x0 * P if g.rows else 0)
    fb.setupGlyf(gl)
    # recompute lsb from real bounds
    for n in order:
        gg = fb.font['glyf'][n]
        gg.recalcBounds(fb.font['glyf'])
        mt[n] = (mt[n][0], getattr(gg, 'xMin', 0) if gg.numberOfContours else 0)
    fb.setupHorizontalMetrics(mt)
    fb.setupHorizontalHeader(ascent=ASC * P, descent=-DESC * P, lineGap=0)
    ps = family.replace(' ', '') + '-' + style
    fb.setupNameTable({'familyName': family, 'styleName': style, 'uniqueFontIdentifier': ps,
                       'fullName': family + ' ' + style, 'psName': ps, 'version': 'Version 1.000',
                       'copyright': copyright, 'licenseDescription': license, 'licenseInfoURL': license_url})
    xh = glyphs.get(ord('x'))
    fb.setupOS2(sTypoAscender=ASC * P, sTypoDescender=-DESC * P, sTypoLineGap=0,
                usWinAscent=(ASC + 2) * P, usWinDescent=(DESC + 2) * P, usWeightClass=weight,
                sCapHeight=14 * P, sxHeight=(xh.ytop * P if xh else 10 * P), fsType=0,
                fsSelection=0x40)
    fb.setupPost(keepGlyphNames=False)
    fb.font.flavor = 'woff2'
    fb.save(out)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out'); ap.add_argument('family')
    ap.add_argument('--cap', type=int, default=14); ap.add_argument('--bounce', type=float, default=0)
    ap.add_argument('--weight', type=int, default=400); ap.add_argument('--thr', type=float, default=0.5)
    ap.add_argument('--embolden', type=int, default=0); ap.add_argument('--sw', type=float, default=2)
    ap.add_argument('--style', default='Regular')
    a = ap.parse_args()
    RANGES = [(0x20, 0x7E), (0xA0, 0xFF), (0x152, 0x153), (0x2013, 0x2014), (0x2018, 0x201E), (0x2022, 0x2022),
              (0x2026, 0x2026), (0x2039, 0x203A), (0x20AC, 0x20AC), (0x2122, 0x2122)]
    chars = ''.join(chr(u) for lo, hi in RANGES for u in range(lo, hi + 1))
    gl = pixelize(a.src, a.cap, thr=a.thr, chars=chars, bounce=a.bounce, embolden=a.embolden)
    sym = symbols(a.cap, a.sw)
    for cp, g in sym.items():
        if cp not in gl or cp in (0x2212, 0x2022):
            gl[cp] = g
    gl[0xA0] = gl[0x20]
    build(gl, a.out, a.family, a.weight, a.style)
    missing = [chr(u) for u in range(0x20, 0x7F) if u not in gl]
    print('ok', a.out, len(gl), 'glyphs; missing ascii:', ''.join(missing))
