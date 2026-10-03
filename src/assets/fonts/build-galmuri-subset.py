#!/usr/bin/env python3
# Rebuilds Galmuri11.subset.woff2 / Galmuri11-Bold.subset.woff2 (fontTools + brotli):
#   npm pack galmuri@2.40.3 && tar xzf galmuri-2.40.3.tgz        (OFL-1.1, Lee Minseo)
#   python3 build-galmuri-subset.py package/dist/Galmuri11.ttf      Galmuri11.subset.woff2      reg
#   python3 build-galmuri-subset.py package/dist/Galmuri11-Bold.ttf Galmuri11-Bold.subset.woff2 bold
# It subsets to Latin + the symbols the game uses, then
# redraws ♂ / ♀ in the Galmuri11 subsets as clear 1-px pixel glyphs (Galmuri's ♂ has a
# vertical arrow and reads like "ô" at small sizes; the Bold cut has no ♂♀ at all).
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
U = 100
MALE = ['.......###', '........##', '.......#.#', '..###.#...', '.#...#....', '#.....#...', '#.....#...', '#.....#...', '.#...#....', '..###.....']
FEMALE = ['..###..', '.#...#.', '#.....#', '#.....#', '#.....#', '.#...#.', '..###..', '...#...', '.#####.', '...#...']
def bold(rows):
    out = []
    for r in rows:
        r = r + '.'
        out.append(''.join('#' if r[i] == '#' or (i > 0 and r[i - 1] == '#') else '.' for i in range(len(r))))
    return out
def glyph(rows, base=0):
    pen = TTGlyphPen(None); h = len(rows)
    for ri, r in enumerate(rows):
        y0 = base + (h - 1 - ri) * U; c = 0
        while c < len(r):
            if r[c] != '#': c += 1; continue
            s = c
            while c < len(r) and r[c] == '#': c += 1
            x0, x1 = s * U, c * U
            pen.moveTo((x0, y0)); pen.lineTo((x0, y0 + U)); pen.lineTo((x1, y0 + U)); pen.lineTo((x1, y0)); pen.closePath()
    return pen.glyph(), (len(rows[0]) + 1) * U
src, dst, isbold = sys.argv[1], sys.argv[2], sys.argv[3] == 'bold'
from fontTools import subset
opts = subset.Options(); opts.layout_features = ['*']; opts.name_IDs = ['*']
f = TTFont(src); sub = subset.Subsetter(opts)
RANGES = [(0x20, 0x7E), (0xA0, 0x17F), (0x2010, 0x203A), (0x20AC, 0x20AC), (0x2122, 0x2122), (0x2190, 0x2199),
          (0x2212, 0x2212), (0x2500, 0x25FF), (0x2600, 0x266F)]
sub.populate(unicodes=[u for a, b in RANGES for u in range(a, b + 1)]); sub.subset(f); cmap = f.getBestCmap(); glyf = f['glyf']; hmtx = f['hmtx']
order = f.getGlyphOrder()
for cp, name, rows, base in [(0x2642, 'uni2642', MALE, 0), (0x2640, 'uni2640', FEMALE, -U)]:
    rows = bold(rows) if isbold else rows
    g, adv = glyph(rows, base)
    gname = cmap.get(cp)
    if not gname:
        gname = name
        if gname not in order: order.append(gname); f.setGlyphOrder(order)
        for t in f['cmap'].tables:
            if t.isUnicode(): t.cmap[cp] = gname
    glyf[gname] = g; g.recalcBounds(glyf); hmtx[gname] = (adv, g.xMin)
f['maxp'].numGlyphs = len(f.getGlyphOrder())
if 'post' in f and f['post'].formatType == 2: f['post'].formatType = 3
f.flavor = 'woff2'; f.save(dst); print('ok', dst)
