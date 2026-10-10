"""Room 4 - the traveler's bedroom: perspective furniture (we look down on
the bed, desk and chair, and up at the high shelves), a silk bed (see
silk_bed.py), a cloth-simulated scarf on the chair, a swinging oil lamp,
and the traveler's things."""
import math
import random
import numpy as np
from pixel import Canvas, PAL, step, scribble, text
from shapes import torn_paper, pin, wood_grain_h, wood_grain_v, chip, cobweb, flower
from propkit import prop, glyph, paper_note
from furn import R, wood_face, inset, knob, bar_pull, ring_pull
from shade import paint, lathe_shade, ellipse_mask, poly_mask, mask_of
import objects as O
import cloth as C
from layout import EYE_Y, FLOOR

F8, FC = 8, 12
_CACHE = {}


def cached(key, fn):
    if key not in _CACHE:
        _CACHE[key] = fn()
    return _CACHE[key]


# ---------------------------------------------------------------- bed
@prop('silk_bed', 4, 'floor', 2250, 186,
      'Low lacquered bed with a torii-style headboard and brass fittings: a crimson silk quilt embroidered with '
      'gold plum blossoms spills over the edge in glossy folds, its gold lining turned down over a cream silk '
      'sheet; the folds sway and the sheen slides across them (12 frames)', fps=6)
def bed():
    import silk_bed
    return cached('bed', silk_bed.silk_bed_frames)


# ---------------------------------------------------------------- desk
@prop('desk_messy', 4, 'floor', 2072, 196, 'Messy writing desk: letters, open book, ink and quill, compass, magnifier, plant')
def desk():
    rng = random.Random(4100)
    w, h = 176, 108
    cv = Canvas(w, h)
    tb, tf = 30, 46                       # top surface back / front edge
    # legs (front pair), stretcher, back legs peeking
    for lx in (6, w - 18):
        wood_face(cv, lx, tf + 8, 12, h - tf - 8, rng, 'wood', 2, 'v')
        cv.vline(lx, tf + 8, h - 1, 'wood4'); cv.vline(lx + 11, tf + 8, h - 1, 'wood0')
    cv.rect(18, h - 22, w - 36, 4, 'wood1'); cv.hline(18, w - 19, h - 22, 'wood2')
    # apron with two drawers
    wood_face(cv, 2, tf + 6, w - 4, 20, rng, 'wood', 3, 'h')
    cv.hline(2, w - 3, tf + 25, 'wood0')
    for (dx, dw) in ((12, 64), (w - 76, 64)):
        inset(cv, dx, tf + 9, dw, 14, 'wood', 3, raised=True)
        ring_pull(cv, dx + dw // 2, tf + 13, 2)
    # top: slab front face + top surface (looking down on it)
    wood_face(cv, 0, tb, w, tf - tb, rng, 'wood', 4, 'h')
    cv.hline(0, w - 1, tb, 'wood2'); cv.hline(0, w - 1, tb + 1, 'wood3')
    cv.rect(0, tf, w, 6, 'wood3'); cv.hline(0, w - 1, tf, 'wood5'); cv.hline(0, w - 1, tf + 5, 'wood1')
    for _ in range(14):
        sx, sy = rng.randint(4, w - 10), rng.randint(tb + 2, tf - 2)
        cv.hline(sx, sx + rng.randint(2, 6), sy, 'wood5')
    # clutter
    for i in range(9):                    # stack of letters, uneven
        x = 10 + rng.randint(-2, 2) + i // 2
        y = tb + 2 - i * 2
        cv.rect(x, y, 30, 3, 'paper3' if i % 2 else 'paper4'); cv.hline(x, x + 29, y + 2, 'paper1')
    cv.rect(16, tb - 14, 18, 4, 'red3')   # wax-sealed letter on top
    cv.ellipse(25, tb - 12, 2, 2, 'red4')
    cv.poly([(48, tf - 2), (54, tb - 4), (78, tb - 2), (78, tf - 2)], 'paper4')     # open book
    cv.poly([(80, tf - 2), (80, tb - 2), (104, tb - 4), (108, tf - 2)], 'paper3')
    cv.rect(78, tb - 3, 2, tf - tb + 1, 'paper1')
    for yy in range(tb, tf - 3, 2):
        scribble(cv, rng, 56, yy, 18, 'wood1'); scribble(cv, rng, 84, yy, 18, 'wood1')
    ink = lathe_shade(10, 9, lambda t: 5, O.LACQUER, spec=0.15, spec_col='stone3')
    cv.blit(ink, 112, tb + 2)
    cv.line(118, tb + 2, 128, tb - 20, 'paper4'); cv.line(119, tb + 1, 130, tb - 19, 'paper3')   # quill
    for k in range(7):
        cv.px(122 + k, tb - 8 - k * 2, 'paper4'); cv.px(124 + k, tb - 7 - k * 2, 'paper2')
    cm = ellipse_mask(14, 8, 7, 4, 6.5, 3.5)                           # compass
    paint(cm, O.BRASS, R=3, spec=0.15, spec_col='gold4', canvas=cv, ox=134, oy=tf - 10)
    cv.px(141, tf - 7, 'red3'); cv.px(140, tf - 6, 'stone0')
    cv.ellipse(158, tf - 6, 7, 3, 'gold1'); cv.ellipse(158, tf - 6, 5.5, 2, 'sky3')                # magnifier
    cv.line(164, tf - 4, 170, tf - 1, 'wood2'); cv.px(156, tf - 7, 'white')
    plant = O.potted(rng, 14, 10, O.leafy_plant(rng, 22, 18))
    cv.blit(plant, w - plant.w - 2, tb - plant.h + 4)
    for _ in range(3):                    # sheets hanging over the front edge
        x = rng.randint(30, 140)
        cv.rect(x, tf - 2, 18, 3, 'paper4')
        cv.rect(x + 3, tf + 1, 12, 9, 'paper3'); scribble(cv, rng, x + 4, tf + 4, 10, 'wood1')
    return O.outline(cv)


@prop('desk_candle', 4, 'floor', 2084, 202, 'Candle on the desk, flickering (8 frames)', fps=10)
def desk_candle():
    frames = []
    for f in range(F8):
        cv = Canvas(16, 30)
        cv.ellipse(8, 27, 7, 2, 'paper3')
        body = lathe_shade(8, 12, lambda t: 4, ['paper2', 'paper3', 'paper4', 'white'])
        cv.blit(body, 4, 14)
        cv.vline(3, 18, 22, 'paper3')
        cv.vline(8, 10, 14, 'ink')
        hgt = [8, 9, 8, 7, 8, 10, 9, 7][f]
        off = [0, 1, 1, 0, -1, -1, 0, 0][f]
        for k in range(hgt):
            t = k / hgt
            x = 8 + int(round(off * t * 1.5))
            wdt = 1 if t < 0.6 else 0
            for d in range(-wdt, wdt + 1):
                cv.px(x + d, 10 - k, 'fire5' if t < 0.35 else ('fire4' if t < 0.65 else 'fire3'))
        frames.append(O.outline(cv))
    return frames


# ---------------------------------------------------------------- chair + scarf
@prop('chair_with_scarf', 4, 'floor', 2176, 214, 'Wooden chair pushed back, a red scarf draped over it (cloth physics, 12 frames)', fps=6)
def chair():
    def build():
        rng = random.Random(4200)
        w, h = 58, 104
        base = Canvas(w, h)
        for lx in (6, w - 14):                               # back posts / rear legs
            wood_face(base, lx, 0, 8, h, rng, 'wood', 2, 'v', knots=False)
            base.vline(lx, 0, h - 1, 'wood3'); base.vline(lx + 7, 0, h - 1, 'wood0')
        for sy in (6, 20):                                   # top rail + mid rail
            base.rect(6, sy, w - 12, 6, 'wood3'); base.hline(6, w - 7, sy, 'wood5'); base.hline(6, w - 7, sy + 5, 'wood1')
        for sx in (20, 28, 36):                              # slats
            base.rect(sx, 26, 4, 22, 'wood3'); base.vline(sx, 26, 47, 'wood4'); base.vline(sx + 3, 26, 47, 'wood1')
        # seat (top visible) + front legs
        for y in range(50, 60):
            base.hline(2, w - 3, y, 'wood4' if y > 51 else 'wood3')
        base.rect(2, 60, w - 4, 6, 'wood3'); base.hline(2, w - 3, 60, 'wood5'); base.hline(2, w - 3, 65, 'wood0')
        for lx in (4, w - 12):
            wood_face(base, lx, 66, 8, h - 66, rng, 'wood', 3, 'v', knots=False)
            base.vline(lx, 66, h - 1, 'wood4'); base.vline(lx + 7, 66, h - 1, 'wood1')
        base.rect(10, h - 16, w - 20, 3, 'wood1')
        s = C.Cloth(6, 30, 2.6, origin=(30, 6, 1))
        for i in range(6):
            s.pin(i, 0, (22 + i * 2.8, 6, 2))
            s.pin(i, 1, (22 + i * 2.8, 9, 3.5))
        s.wall_z = 1.5
        wnd = C.breeze(amp=(2.5, 0.5, 2), period=1.0, waves=0.08, seed=42)
        snaps = C.simulate(s, wnd, frames=FC, substeps=10, warm_periods=3)

        def tex(u, v, back):
            if v > 0.95:
                return None if int(u * 12) % 2 else ['gold1', 'gold2', 'gold3', 'gold4']   # fringe
            if int(v * 14) % 4 == 0:
                return ['gold0', 'gold1', 'gold2', 'gold3']
            return ['red0', 'red1', 'red2', 'red3', 'red4']
        frames = []
        for P in snaps:
            cv = base.copy()
            cv.blit(C.render(s, P, tex, w, h, fold=1.6, mid=0.6, spread=0.75), 0, 0)
            frames.append(O.outline(cv))
        return frames
    return cached('chair', build)


# ---------------------------------------------------------------- bookshelf
@prop('bookshelf', 4, 'floor', 1980, 120, 'Leaning bookshelf: crooked books, scrolls, brass telescope, jar plant, a broken shelf, cobwebs')
def bookshelf():
    rng = random.Random(4300)
    w, h = 90, 156
    cv = Canvas(w, h)
    wood_face(cv, 0, 0, w, h, rng, 'wood', 2, 'v')
    cv.rect(5, 8, w - 10, h - 14, 'wood0')
    for x in range(5, w - 5, 9):
        cv.vline(x, 8, h - 7, 'ink')
    cv.rect(-2, 0, w + 4, 8, 'wood3'); cv.hline(-2, w + 1, 0, 'wood5'); cv.hline(-2, w + 1, 7, 'wood1')
    shelves = [8, 52, 96, 140]
    world_y = 154
    for sy in shelves[1:]:
        cv.rect(3, sy, w - 6, 5, 'wood3'); cv.hline(3, w - 4, sy, 'wood5'); cv.hline(3, w - 4, sy + 4, 'wood1')
        if sy + world_y < EYE_Y:
            cv.rect(3, sy + 5, w - 6, 2, 'wood2')            # underside, seen from below
    cv.rect(3, 52, w - 6, 5, 'wood0')                        # one shelf snapped
    cv.line(3, 52, 40, 59, 'wood3'); cv.line(3, 53, 40, 60, 'wood2')
    cv.line(42, 57, w - 4, 52, 'wood3'); cv.line(42, 58, w - 4, 53, 'wood2')
    spines = ['red', 'jade', 'gold', 'indigo', 'wood', 'purp', 'teal', 'paper', 'leaf', 'copper']
    for si in range(3):
        base_y = shelves[si + 1] - 1
        x = 7
        while x < w - 10:
            r = rng.random()
            if r < 0.1:
                x += rng.randint(3, 7)
                continue
            if r < 0.2 and x < w - 28:                       # stack lying flat
                for k in range(3):
                    sp = rng.choice(spines)
                    cv.blit(O.book(20 - k * 2, 5, sp, title=False), x, base_y - 5 * (k + 1) + 1)
                x += 22
                continue
            bw, bh = rng.randint(5, 9), rng.randint(28, 40)
            bk = O.book(bw, bh, rng.choice(spines))
            if r > 0.86 and x > 12:                          # leaning book
                for yy in range(bh):
                    for xx in range(bw):
                        p = bk.get(xx, yy)
                        if p[3]:
                            cv.px(x + xx - (bh - yy) // 5, base_y - bh + 1 + yy, p[:3])
                x += bw + 2
                continue
            cv.blit(bk, x, base_y - bh + 1)
            x += bw
    # top: jar plant, scroll tubes, a brass telescope
    out = Canvas(w, h + 34)
    out.blit(cv, 0, 34)
    rngp = random.Random(4301)
    jar = O.glass_jar(rngp, 18, 20, ('leaf1', 'leaf2', 'stone1'), lid='cork', label=False, string=False)
    out.blit(jar, 6, 15)
    plant = O.leafy_plant(rngp, 26, 20)
    out.blit(plant, 15 - plant.w // 2, 4)
    for k in range(3):
        tube = Canvas(30, 5)
        for yy in range(5):
            tube.hline(0, 29, yy, ['paper4', 'paper3', 'paper3', 'paper2', 'paper1'][yy])
        tube.vline(0, 0, 4, 'paper2'); tube.px(0, 2, 'paper0')
        out.blit(tube, 30 + k * 3, 29 - k * 5)
    scope = lathe_shade(8, 26, lambda t: 4 - t * 1.5, O.BRASS[1:], spec=0.12, spec_col='gold4')
    tel = Canvas(26, 8)
    for yy in range(8):
        for xx in range(26):
            p = scope.get(yy, xx)
            if p[3]:
                tel.px(xx, yy, p[:3])
    out.blit(tel, 56, 26)
    cobweb(out, 6, 42, 16, 'stone3', 'stone2', 'tl')
    cobweb(out, w - 6, 132, 12, 'stone3', 'stone2', 'tr')
    return O.outline(out)


# ---------------------------------------------------------------- wall things
@prop('straw_kasa_hat', 4, 'wall', 2296, 70, 'Woven straw kasa hat on a peg')
def hat():
    cv = Canvas(58, 24)
    cv.px(29, 0, 'wood1'); cv.px(29, 1, 'wood2')
    cv.poly([(1, 20), (29, 2), (57, 20)], 'gold2')
    for k in range(4, 21, 3):
        cv.line(29 - k * 1.45, 2 + k * 0.9, 29 + k * 1.45, 2 + k * 0.9, 'gold1')
    for a in range(-60, 61, 8):
        cv.line(29, 2, 29 + math.tan(math.radians(a)) * 18, 20, 'gold3' if a < 0 else 'gold1')
    cv.line(1, 20, 29, 2, 'gold4')
    cv.hline(1, 57, 20, 'gold0'); cv.hline(3, 55, 21, 'gold1')
    cv.line(18, 21, 14, 24, 'red3'); cv.line(40, 21, 44, 24, 'red3')
    cv.px(40, 13, None); cv.px(41, 14, 'gold0'); cv.px(39, 14, 'gold0')
    return O.outline(cv)


@prop('route_map', 4, 'wall', 2330, 66, 'Old route map pinned to the plaster: coast, mountains, dotted path, compass rose', preview=False)
def route_map():
    rng = random.Random(4400)
    w, h = 92, 64
    cv = torn_paper(rng, w, h, base='paper2', light='paper3', dark='paper1', edge='paper0', lines=False)
    for k in range(64):
        x = 8 + k
        y = 16 + int(9 * math.sin(k * 0.18)) + (k % 3 == 0)
        cv.px(x, y, 'water1'); cv.px(x, y + 1, 'water2')
    for (x, y) in ((20, 40), (30, 34), (40, 42), (62, 30), (70, 22)):
        cv.poly([(x - 5, y + 4), (x, y - 3), (x + 5, y + 4)], 'stone2'); cv.line(x, y - 3, x - 5, y + 4, 'stone3')
    for (x, y) in ((50, 48), (58, 46), (54, 44)):
        cv.px(x, y, 'leaf1'); cv.px(x + 1, y - 1, 'leaf2')
    pts = [(10, 54), (26, 46), (42, 50), (60, 36), (76, 24)]
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        n = max(abs(x1 - x0), abs(y1 - y0))
        for k in range(0, n, 2):
            cv.px(x0 + (x1 - x0) * k // n, y0 + (y1 - y0) * k // n, 'red3')
    cv.line(73, 21, 79, 27, 'red3'); cv.line(73, 27, 79, 21, 'red3')
    cx, cy = 80, 50
    cv.line(cx, cy - 7, cx, cy + 7, 'wood1'); cv.line(cx - 7, cy, cx + 7, cy, 'wood1')
    cv.px(cx, cy - 8, 'red3')
    text(cv, cx - 1, cy - 14, 'N', 'red2')
    text(cv, 6, 6, 'SEA', 'water0', rng, True)
    text(cv, 26, 54, 'PASS', 'wood1', rng, True)
    text(cv, 62, 12, 'TEA', 'red2', rng, True)
    out = Canvas(w, h + 3)
    out.blit(cv, 0, 3)
    for (x, c) in ((5, 'red3'), (w - 7, 'jade3'), (w // 2, 'gold3')):
        pin(out, x, 3, c)
    return out


@prop('sketch_pinned', 4, 'wall', 2424, 136, 'Charcoal sketch of a tree, pinned', preview=False)
def sketch():
    rng = random.Random(4410)
    cv = paper_note(rng, 26, 32, base='paper3', pin_c='gold3', lines=False)
    cv.vline(13, 18, 28, 'stone1'); cv.vline(14, 20, 28, 'stone2')
    cv.ellipse(13, 15, 8, 6, 'stone2'); cv.ellipse(11, 13, 4, 3, 'stone3')
    return cv


@prop('oil_lamp', 4, 'ceiling', 2426, 36, 'Hanging oil lamp, gently swinging, warm glow (8 frames)', fps=5)
def oil_lamp():
    frames = []
    for f in range(F8):
        sw = math.sin(2 * math.pi * f / F8)
        cv = Canvas(30, 82)
        L = 40
        bx = 15 + sw * 2.2
        for j in range(L):
            x = 15 + sw * 2.2 * j / L
            cv.px(int(round(x)), j, 'stone1' if j % 3 else 'stone2')
        cap = lathe_shade(14, 4, lambda t: 7, O.BRASS[1:], spec=0.1)
        cv.blit(cap, int(round(bx)) - 7, L)
        glass = ellipse_mask(16, 22, 8, 11, 7.5, 10.5)
        paint(glass, ['fire3', 'fire4', 'fire5', 'white'], R=6, amb=0.5, canvas=cv, ox=int(round(bx)) - 8, oy=L + 4)
        fx = int(round(bx))
        for k in range(6):
            cv.px(fx, L + 18 - k, 'fire5' if k < 3 else 'white')
        cv.px(fx - 1, L + 16, 'fire4'); cv.px(fx + 1, L + 16, 'fire4')
        base = lathe_shade(18, 8, lambda t: 9 - t * 3, O.BRASS[1:], spec=0.12, spec_col='gold4')
        cv.blit(base, fx - 9, L + 25)
        cv.px(fx, L + 33, 'gold2'); cv.px(fx, L + 34, 'gold1')
        frames.append(O.outline(cv))
    return frames


@prop('walking_staff', 4, 'floor', 2236, 160, 'Knotted walking staff with a bell and charm, leaning on the wall', preview=False)
def staff():
    cv = Canvas(18, 142)
    for y in range(8, 142):
        x = 8 + (y // 40) % 2 - (1 if y > 120 else 0)
        cv.px(x - 1, y, 'bark4'); cv.px(x, y, 'bark3'); cv.px(x + 1, y, 'bark2'); cv.px(x + 2, y, 'bark1')
        if y % 19 == 0:
            cv.px(x + 3, y, 'bark1'); cv.px(x - 2, y, 'bark3')
    m = ellipse_mask(12, 12, 6, 6, 5.5, 5.5)
    paint(m, O.ramp('bark'), R=4, canvas=cv, ox=3, oy=1)
    cv.vline(12, 10, 20, 'red3'); cv.vline(13, 12, 22, 'red2')
    bell = ellipse_mask(8, 8, 4, 4, 3.5, 3.5)
    paint(bell, O.BRASS, R=3, spec=0.15, spec_col='gold4', canvas=cv, ox=9, oy=21)
    cv.rect(2, 30, 6, 10, 'paper4'); glyph(cv, random.Random(1), 3, 31, 4, 'red2')
    return O.outline(cv)


# ---------------------------------------------------------------- floor things
@prop('worn_rug', 4, 'floor', 1996, 302, 'Worn woven rug in perspective: border, medallion, frayed fringe, burn hole', shadow='none', preview=False)
def rug():
    w, h = 244, 48
    cv = Canvas(w, h)
    for y in range(h):
        t = y / (h - 1)
        inset_ = int((1 - t) * 18)
        for x in range(inset_, w - inset_):
            u = (x - inset_) / (w - 2 * inset_)
            border = t < 0.12 or t > 0.88 or u < 0.05 or u > 0.95
            inner = 0.18 < t < 0.82 and 0.09 < u < 0.91
            c = 'red2'
            if border:
                c = 'indigo1' if (int(u * 60) + int(t * 10)) % 3 else 'gold2'
            elif inner:
                c = 'red3' if (int(u * 24) + int(t * 8)) % 2 else 'red2'
                du, dt = (u - 0.5) * 2.2, (t - 0.5) * 2.4
                if abs(du) + abs(dt) < 0.55:
                    c = 'jade2' if abs(du) + abs(dt) < 0.4 else 'gold2'
                if abs(du) + abs(dt) < 0.15:
                    c = 'paper3'
            cv.px(x, y, c)
    for x in range(4, w - 4, 3):
        cv.px(x, h - 1, 'paper2'); cv.px(x, h - 2, 'paper3')
    for y in range(h):
        for x in range(w):
            if cv.opaque(x, y) and (x * 7 + y * 13) % 29 == 0:
                cv.shift(x, y, 1)
    cv.ellipse(176, 30, 6, 2.6, 'ink')
    for a in range(0, 360, 10):
        cv.px(int(176 + math.cos(math.radians(a)) * 7), int(30 + math.sin(math.radians(a)) * 3.4), 'wood1')
    return O.outline(cv)


@prop('backpack', 4, 'floor', 2250, 288, 'Traveler pack: bedroll, tin cup, small lantern, buckles', preview=False)
def backpack():
    rng = random.Random(4500)
    w, h = 52, 52
    cv = Canvas(w, h)
    bm = poly_mask(w, h, [(8, 14), (44, 14), (47, 50), (5, 50)])
    paint(bm, ['wood1', 'wood2', 'wood3', 'wood4'], profile='soft', R=10, canvas=cv)
    flap = poly_mask(w, h, [(7, 14), (45, 14), (43, 30), (9, 30)])
    paint(flap, ['wood2', 'wood3', 'wood4', 'wood5'], profile='soft', R=6, canvas=cv)
    for x in (16, 34):
        cv.vline(x, 14, 40, 'wood1'); cv.rect(x - 2, 34, 5, 4, 'gold2'); cv.px(x - 2, 34, 'gold4')
    roll = Canvas(46, 14)
    for yy in range(14):
        roll.hline(0, 45, yy, ['red4', 'red3', 'red3', 'red2', 'red2', 'red2', 'red2', 'red1', 'red1', 'red1', 'red0',
                               'red0', 'red0', 'red0'][yy])
    roll.ellipse(2, 7, 3, 6.5, 'red3'); roll.ellipse(2, 7, 1.5, 3.5, 'red1')
    roll.vline(12, 0, 13, 'wood1'); roll.vline(34, 0, 13, 'wood1')
    cv.blit(roll, 4, 1)
    cupm = ellipse_mask(10, 10, 5, 5, 5, 5)
    paint(cupm, O.IRON, R=4, spec=0.1, canvas=cv, ox=w - 10, oy=30)
    cv.rect(0, 30, 7, 12, 'gold1'); cv.rect(1, 32, 5, 7, 'fire4'); cv.px(2, 33, 'fire5')
    cv.vline(3, 26, 30, 'stone2')
    return O.outline(cv)


@prop('boots', 4, 'floor', 2468, 322, 'Muddy boots, one fallen over', preview=False)
def boots():
    cv = Canvas(40, 22)
    b1 = poly_mask(40, 22, [(4, 0), (13, 0), (14, 14), (20, 15), (20, 21), (3, 21)])
    paint(b1, ['wood0', 'wood1', 'wood2', 'wood3'], profile='soft', R=5, canvas=cv)
    b2 = poly_mask(40, 22, [(22, 12), (36, 9), (39, 13), (39, 21), (22, 21)])
    paint(b2, ['wood0', 'wood1', 'wood2', 'wood3'], profile='soft', R=4, canvas=cv)
    for (x, y) in ((6, 19), (11, 18), (16, 20), (26, 20), (33, 19)):
        cv.px(x, y, 'stone1'); cv.px(x + 1, y, 'stone2')
    cv.hline(4, 13, 3, 'wood3')
    return O.outline(cv)


@prop('book_pile', 4, 'floor', 2204, 302, 'Pile of books on the floor', preview=False)
def book_pile():
    rng = random.Random(4600)
    cv = Canvas(44, 34)
    y = 28
    for k in range(5):
        bw = rng.randint(28, 38)
        x = rng.randint(0, 44 - bw)
        sp = rng.choice(['red', 'jade', 'indigo', 'gold', 'purp', 'teal'])
        cv.rect(x, y, bw, 6, R(sp, 2)); cv.hline(x, x + bw - 1, y, R(sp, 4)); cv.hline(x, x + bw - 1, y + 5, R(sp, 0))
        cv.rect(x + 2, y + 2, bw - 4, 2, 'paper3'); cv.vline(x, y, y + 5, R(sp, 3))
        y -= 6
    return O.outline(cv)


@prop('papers_scattered', 4, 'floor', 2094, 334, 'Letters and sketches scattered on the floor', shadow='none', preview=False)
def papers():
    rng = random.Random(4610)
    cv = Canvas(86, 18)
    for (x, y, w_) in ((0, 6, 24), (20, 0, 22), (48, 7, 26), (38, 10, 16), (66, 2, 18)):
        cv.poly([(x, y + 7), (x + 4, y), (x + w_, y + 1), (x + w_ - 3, y + 8)], 'paper4' if x % 2 else 'paper3')
        scribble(cv, rng, x + 5, y + 4, w_ - 10, 'wood1')
    return O.outline(cv)


@prop('ficus_plant', 4, 'floor', 1930, 186, 'Tall leafy green plant in a cracked glazed pot', preview=False)
def ficus():
    rng = random.Random(4700)
    from trees import limbs_draw
    from leaves import leafy
    w, h = 70, 130
    cv = Canvas(w, h)
    stems = Canvas(w, h)
    limbs_draw(stems, [([(35, 112), (32, 80), (38, 50), (34, 26)], 2.4, 1), ([(34, 84), (20, 62), (14, 48)], 1.4, 0.7),
                       ([(37, 66), (52, 50), (56, 38)], 1.4, 0.7)], rng)
    cv.blit(stems, 0, 0)
    for (cx, cy, rx, ry) in ((34, 22, 18, 14), (16, 46, 14, 11), (56, 38, 13, 11), (36, 56, 14, 10), (26, 74, 10, 8)):
        spr, ox, oy, m = leafy(rng, [(0, 0, rx, ry), (-rx * 0.3, ry * 0.3, rx * 0.6, ry * 0.6)],
                               ['leaf0', 'leaf1', 'leaf2', 'leaf3', 'leaf4', 'leaf5'], leaf_len=(5, 8), droop=0.5)
        cv.blit(spr, int(cx - ox), int(cy - oy))
    pot = lathe_shade(36, 26, lambda t: 18 * (1 - t * 0.25), ['indigo0', 'indigo1', 'indigo2', 'indigo3', 'indigo4'],
                      spec=0.08, spec_col='white')
    cv.blit(pot, 17, h - 26)
    cv.ellipse(35, h - 26, 17, 3, 'wood1')
    x = 30
    for y in range(h - 24, h - 4):
        cv.px(x, y, 'indigo0')
        if y % 3 == 0:
            x += 1
    return O.outline(cv)
