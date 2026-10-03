#!/usr/bin/env python3
"""Pixelize a vector font onto a pixel grid (supersampled coverage + threshold).
pixelize(ttf, cap, ...) -> {cp: Glyph(rows, x0, ytop, adv)} where rows are '#'/'.' strings,
x0 = column of first bitmap column (px from pen origin), ytop = y of the top row above baseline
(row r covers y in [ytop-r-1, ytop-r]), adv = advance in px."""
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
import math, zlib

S = 8  # supersampling


class G:
    def __init__(s, rows, x0, ytop, adv):
        s.rows, s.x0, s.ytop, s.adv = rows, x0, ytop, adv


def cap_ratio(ttf):
    f = ImageFont.truetype(ttf, 1000)
    l, t, r, b = f.getbbox('H', anchor='ls')
    return -t / 1000.0


def bounce_of(cp, amp):
    if not amp:
        return 0, 0.0
    h = zlib.crc32(chr(cp).encode()) & 0xffff
    dy = (h % 3) - 1 if amp >= 1 else 0
    ang = ((h >> 4) % 5 - 2) * amp * 1.5  # degrees
    return dy, ang


def pixelize(ttf, cap, thr=0.5, chars=None, bounce=0, track=1, embolden=0, minside=1):
    size = cap / cap_ratio(ttf)
    f = ImageFont.truetype(ttf, int(round(size * S)))
    tt = TTFont(ttf)
    cmap = tt.getBestCmap()
    cps = sorted(c for c in cmap if c >= 0x20 and (chars is None or chr(c) in chars))
    out = {}
    for cp in cps:
        ch = chr(cp)
        adv = f.getlength(ch) / S
        if cp == 0x20:
            out[cp] = G([], 0, 0, max(3, round(adv)) + track - 1)
            continue
        pad = 8 * S
        W = int(math.ceil(adv * S)) + 2 * pad
        H = int(math.ceil(size * 2 * S)) + 2 * pad
        base = pad + int(size * 1.3) * S
        im = Image.new('L', (W, H), 0)
        d = ImageDraw.Draw(im)
        d.text((pad, base), ch, font=f, fill=255, anchor='ls')
        dy, ang = bounce_of(cp, bounce)
        if ang:
            im = im.rotate(ang, resample=Image.BICUBIC, center=(pad + adv * S / 2, base - cap * S / 2))
        sm = im.reduce(S)
        w, h = sm.size
        px = sm.load()
        grid = [[px[x, y] >= thr * 255 for x in range(w)] for y in range(h)]
        if embolden:
            for _ in range(embolden):
                grid = [[grid[y][x] or (x > 0 and grid[y][x - 1]) for x in range(w)] for y in range(h)]
        ys = [y for y in range(h) if any(grid[y])]
        xs = [x for x in range(w) if any(grid[y][x] for y in range(h))]
        if not ys:
            out[cp] = G([], 0, 0, max(1, round(adv)) + track)
            continue
        y0, y1, x0, x1 = min(ys), max(ys), min(xs), max(xs)
        rows = [''.join('#' if grid[y][x] else '.' for x in range(x0, x1 + 1)) for y in range(y0, y1 + 1)]
        origin_x = pad // S
        base_y = base // S
        lsb = x0 - origin_x
        inkw = x1 - x0 + 1
        rsb = round(adv) - (lsb + inkw)
        lsb = max(lsb, 0)
        rsb = max(rsb, 0)
        out[cp] = G(rows, lsb, base_y - y0 - dy, lsb + inkw + rsb + track)
    return out


def preview(glyphs, text, scale=2, fg=(59, 36, 20), bg=None, ytop=19, ydesc=6):
    wpx = sum((glyphs.get(ord(c)) or glyphs[0x3F]).adv for c in text) + 4
    hpx = ytop + ydesc
    im = Image.new('RGBA', (wpx, hpx), bg or (0, 0, 0, 0))
    p = im.load()
    x = 2
    for c in text:
        g = glyphs.get(ord(c)) or glyphs[0x3F]
        for r, row in enumerate(g.rows):
            for cx, v in enumerate(row):
                if v == '#':
                    X, Y = x + g.x0 + cx, ytop - g.ytop + r
                    if 0 <= X < wpx and 0 <= Y < hpx:
                        p[X, Y] = fg + (255,)
        x += g.adv
    return im.resize((wpx * scale, hpx * scale), Image.NEAREST)
