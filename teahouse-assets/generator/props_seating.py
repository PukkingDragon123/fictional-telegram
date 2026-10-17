"""Room 2 - seating: menu tags, pendulum clock, paper lanterns and a glass
wind chime in front of the big window, plants on the sill (a green bonsai),
and the customer side of the counter."""
import math
import random
from pixel import Canvas, PAL, step, scribble, text
from shapes import torn_paper, wood_grain_h, wood_grain_v, chip, cobweb, flower
from propkit import prop, glyph
from furn import R, wood_face, inset, knob, bar_pull
from shade import paint, lathe_shade, ellipse_mask, poly_mask
import objects as O
import teaware as TW
from trees import limbs_draw
from leaves import leafy
from layout import SILL_Y, COUNTER_Y, WIN_MAIN

F8 = 8


@prop('menu_tags', 2, 'wall', 692, 58, 'Hanging wooden menu tags with brush glyphs and prices; one crooked, one missing')
def menu_tags():
    rng = random.Random(2001)
    w, h = 82, 124
    cv = Canvas(w, h)
    wood_face(cv, 0, 0, w, 7, rng, 'wood', 2, 'h')
    cv.hline(0, w - 1, 0, 'wood4'); cv.hline(0, w - 1, 6, 'wood0')
    prices = ['3', '4', '', '5']
    names = ['MATCHA', 'SENCHA', '', 'HOJI']
    for i in range(4):
        x = 4 + i * 17
        if i == 2:
            cv.px(x + 7, 10, 'stone2')
            continue
        hgt = rng.randint(80, 104)
        tag = Canvas(15, hgt)
        wood_face(tag, 0, 0, 15, hgt, rng, 'wood', 4, 'v', knots=False)
        tag.hline(0, 14, 0, 'wood5'); tag.vline(0, 0, hgt - 1, 'wood5')
        tag.vline(14, 0, hgt - 1, 'wood2'); tag.hline(0, 14, hgt - 1, 'wood2')
        tag.px(7, 3, 'wood1')
        for k, ch in enumerate(names[i]):
            text(tag, 6, 7 + k * 7, ch, 'ink', rng, True)
        tag.rect(3, hgt - 16, 9, 12, 'red3'); tag.hline(3, 11, hgt - 16, 'red4')
        text(tag, 6, hgt - 13, prices[i], 'paper4')
        if i == 3:
            for yy in range(hgt):
                for xx in range(15):
                    p = tag.get(xx, yy)
                    if p[3]:
                        cv.px(x + xx + yy // 10, 11 + yy, p[:3])
        else:
            cv.blit(tag, x, 11)
        cv.vline(x + 7, 6, 11, 'paper1'); cv.px(x + 7, 10, 'stone2')
    strip = torn_paper(rng, 13, 26, lines=False, curl=False)
    for k, ch in enumerate('OUT'):
        text(strip, 5, 4 + k * 7, ch, 'red2', rng, True)
    cv.blit(strip, 39, 40)
    return O.outline(cv)


@prop('pendulum_clock', 2, 'wall', 1164, 60, 'Old pendulum clock, still running: the brass pendulum swings tick-tock '
      'and the red second hand ticks all the way round (one tick per swing) - carved crown, cobweb', fps=4)
def clock():
    """120 frames: 60 ticks, two frames each (the pendulum at the end of its swing,
    then passing the middle), so the second hand goes once round and the loop is seamless."""
    rng = random.Random(2010)
    w, h = 56, 122
    cv = Canvas(w, h)
    wood_face(cv, 3, 8, w - 6, h - 16, rng, 'wood', 2, 'v')
    cv.vline(3, 8, h - 9, 'wood4'); cv.vline(w - 4, 8, h - 9, 'wood0')
    cv.poly([(0, 10), (w / 2, -1), (w, 10)], R('wood', 3))     # carved pediment
    cv.line(0, 10, w / 2, -1, 'wood5'); cv.line(w / 2, -1, w - 1, 10, 'wood1')
    cv.ellipse(w / 2, 5, 3, 3, 'gold2'); cv.px(w // 2 - 1, 4, 'gold4')
    cv.rect(0, 9, w, 3, 'wood3'); cv.hline(0, w - 1, 9, 'wood5')
    cv.rect(0, h - 9, w, 9, 'wood3'); cv.hline(0, w - 1, h - 9, 'wood5'); cv.hline(0, w - 1, h - 1, 'wood0')
    # face: brass bezel, paper dial, numerals as ticks
    cx, cy = w // 2, 34
    m = ellipse_mask(36, 36, 18, 18, 18, 18)
    paint(m, O.BRASS, R=8, spec=0.08, spec_col='gold4', canvas=cv, ox=cx - 18, oy=cy - 18)
    cv.ellipse(cx, cy, 14.5, 14.5, 'paper4'); cv.ellipse(cx + 1, cy + 1, 13, 13, 'paper3')
    cv.ellipse(cx, cy, 12.5, 12.5, 'paper4')
    for k in range(12):
        a = math.radians(k * 30 - 90)
        x1, y1 = cx + math.cos(a) * 12, cy + math.sin(a) * 12
        x2, y2 = cx + math.cos(a) * (9.5 if k % 3 else 8.5), cy + math.sin(a) * (9.5 if k % 3 else 8.5)
        cv.line(x1, y1, x2, y2, 'ink')
    # pendulum window
    cv.rect(13, 58, w - 26, 46, 'wood0')
    for k in range(4):
        cv.vline(15 + k * 8, 60, 102, 'ink')
    cv.frame(12, 57, w - 24, 48, 'wood3'); cv.hline(12, w - 13, 57, 'wood5')
    bob = Canvas(14, 14)
    paint(ellipse_mask(14, 14, 7, 7, 7, 7), O.BRASS, R=5, spec=0.12, spec_col='gold4', canvas=bob, ox=0, oy=0)
    rod_c = [PAL[c] for c in O.BRASS[1:4]]
    frames = []
    for f in range(120):
        tick, half = divmod(f, 2)
        c = cv.copy()
        # the pendulum: at the end of a swing on the tick, passing the middle between ticks
        side = 1 if tick % 2 == 0 else -1
        ang = math.radians(10.5) * (side if half == 0 else side * 0.35)
        px0, py0 = cx + 0.5, 59
        L = 30
        for t in range(L):
            x = px0 + math.sin(ang) * t
            y = py0 + math.cos(ang) * t
            c.px(int(x), int(y), rod_c[1]); c.px(int(x) + 1, int(y), rod_c[0] if t % 7 else rod_c[2])
        bx, by = px0 + math.sin(ang) * (L + 2), py0 + math.cos(ang) * (L + 2)
        c.blit(bob, int(round(bx - 7)), int(round(by - 7)))
        # hands: hour and minute stay put this loop, the red second hand ticks round
        c.line(cx, cy, cx + 5, cy + 3, 'ink'); c.line(cx, cy, cx + 3, cy - 9, 'ink')
        a = math.radians(tick * 6 - 90)
        c.line(cx - math.cos(a) * 3, cy - math.sin(a) * 3, cx + math.cos(a) * 11, cy + math.sin(a) * 11, 'red2')
        c.px(cx, cy, 'red3')
        for (dx, dy) in ((-8, -8), (-7, -6), (-5, -4), (-6, -2)):          # glint on the glass
            c.px(cx + dx, cy + dy, 'white')
        for (x, y) in ((16, 62), (18, 64), (20, 61)):
            c.px(x, y, 'sky3')
        cobweb(c, 13, 58, 12, 'stone3', 'stone2', 'tl')
        frames.append(O.outline(c))
    return frames


# the paper, lacquer and pattern of the lanterns through the year (season.py)
LANTERN = dict(
    summer=dict(ramp=['red0', 'red1', 'red2', 'red3', 'red4', 'fire3', 'fire4'], cap=('stone0', 'stone1', 'ink'),
                tassel=('red3', 'red2', 'red1'), halo='fire3', motif='summer'),
    spring=dict(ramp=['pink0', 'pink1', 'pink2', 'pink3', 'pink4', 'white', 'white'], cap=('stone0', 'stone1', 'ink'),
                tassel=('pink3', 'pink2', 'pink1'), halo='pink3', motif='spring'),
    autumn=dict(ramp=['red0', 'copper1', 'copper2', 'fire2', 'fire3', 'fire4', 'fire5'], cap=('wood0', 'wood1', 'ink'),
                tassel=('copper3', 'copper2', 'copper1'), halo='fire3', motif='autumn'),
    winter=dict(ramp=['stone1', 'paper1', 'paper2', 'paper3', 'paper4', 'white', 'fire5'], cap=('stone0', 'stone1', 'ink'),
                tassel=('scarlet3', 'scarlet2', 'scarlet1'), halo='fire4', motif='winter'))


def _wrap(a):
    return (a + math.pi) % (2 * math.pi) - math.pi


def _motifs(kind):
    """Painted motifs on the paper: (angle round the lantern, height 0..1, shape).
    Eight round each row so a gentle twist keeps them going round."""
    out = []
    if kind == 'summer':                         # fireworks above, a band of waves below
        for k in range(8):
            out.append((k * math.pi / 4, 0.3, 'burst'))
        for k in range(10):
            out.append((k * math.pi / 5, 0.86, 'wave'))
            out.append((k * math.pi / 5 + math.pi / 10, 0.78, 'wave'))
    elif kind == 'spring':                       # cherry blossoms scattered all over
        for r, t in enumerate((0.22, 0.42, 0.62, 0.82)):
            for k in range(8):
                out.append((k * math.pi / 4 + (r % 2) * math.pi / 8, t, 'blossom' if (k + r) % 3 else 'bud'))
    elif kind == 'autumn':                       # maple leaves falling down the paper
        for r, t in enumerate((0.24, 0.5, 0.76)):
            for k in range(8):
                out.append((k * math.pi / 4 + (r % 2) * math.pi / 8 + r * 0.2, t, 'maple'))
    else:                                        # red camellias among snowflakes
        for k in range(8):
            out.append((k * math.pi / 4, 0.32, 'camellia' if k % 2 else 'flake'))
            out.append((k * math.pi / 4 + math.pi / 8, 0.68, 'flake' if k % 2 else 'camellia'))
    return out


def _motif_px(shape, dx, dy):
    """Colour key of a motif at (dx, dy) from its centre, or None."""
    r = math.hypot(dx, dy)
    a = math.atan2(dy, dx)
    if shape == 'blossom':
        if r < 1.0:
            return 'c'
        petal = min(abs(_wrap(a - (k * 2 * math.pi / 5 - math.pi / 2))) for k in range(5))
        if r < 3.4 - 1.6 * petal:
            return 'p' if r > 2.2 else 'q'
    elif shape == 'bud':
        if r < 1.3:
            return 'p'
    elif shape == 'maple':
        if 0 < dy < 3.2 and abs(dx - dy * 0.2) < 0.5:
            return 's'                                                # the stem
        lobe = abs(math.cos(2.5 * (a + math.pi / 2)))
        if r < 1.4 + 2.4 * lobe ** 2.2 and dy < 1.6:
            return 'p' if r > 1.2 else 'q'
    elif shape == 'flake':
        if r < 3.4:
            arm = min(abs(_wrap(a - k * math.pi / 3)) for k in range(6))
            if arm * r < 0.55 or (1.6 < r < 2.4 and arm * r < 1.1):
                return 'f'
    elif shape == 'camellia':
        if r < 0.9:
            return 'c'
        if r < 2.9:
            return 'p' if (r > 2.0 or dx > 0.5) else 'q'
        if 2.9 <= r < 4.2 and -2.4 < a < -0.9:
            return 'l'                                                # a dark leaf behind it
    elif shape == 'burst':
        if r < 4.4:
            arm = min(abs(_wrap(a - k * math.pi / 4)) for k in range(8))
            if arm * r < 0.5 and r > 1.0:
                return 'f'
            if r < 0.8:
                return 'c'
    elif shape == 'wave':
        if 1.8 < r < 3.0 and dy < 0:
            return 'f'
    return None


MOTIF_COLS = dict(
    summer=dict(f=('paper3', 'paper4'), c=('gold3', 'gold4')),
    spring=dict(p=('pink1', 'pink2'), q=('pink2', 'pink3'), c=('gold2', 'gold3')),
    autumn=dict(p=('red1', 'red2'), q=('red0', 'red1'), s=('wood0', 'wood1')),
    winter=dict(f=('indigo1', 'indigo2'), p=('scarlet1', 'scarlet2'), q=('scarlet2', 'scarlet3'), c=('gold2', 'gold3'),
                l=('leaf0', 'leaf1')))


def _lantern(seed, torn, f, n=F8, style=None):
    """Chochin paper lantern lit from inside: a barrel of paper over bamboo ribs
    that curve with the paper, warm glow strongest at the middle, lacquer caps
    with a gold rim, a cord and a swaying tassel, a soft halo. The paper and its
    painted pattern change with the season: red with fireworks and waves in
    summer, pale pink with cherry blossom in spring, persimmon orange with
    maple leaves in autumn, white washi with red camellias and snowflakes in
    winter. The lantern twists a little as it sways, so the pattern turns."""
    import season
    style = style or season.current
    S = LANTERN[style]
    rng = random.Random(seed)
    sw = math.sin(2 * math.pi * f / n + seed)
    twist = 0.22 * math.sin(2 * math.pi * f / n + seed + 0.8)
    flick = 0.92 + 0.08 * math.sin(2 * math.pi * f * 2 / n + seed * 3)
    w, h = 46, 82
    cv = Canvas(w, h)
    off = sw * 1.4
    cx = w / 2 + off
    y0, y1 = 21, 65
    # soft halo on its own layer (partial alpha), so the glow spills onto the wall
    halo = Canvas(w, h)
    for y in range(y0 - 6, y1 + 6):
        for x in range(w):
            t = min(1, max(0, (y - y0) / (y1 - y0)))
            hw = 7 + 10.5 * math.sin(math.pi * t)
            d = max(0.0, abs(x + 0.5 - cx) - hw, (y0 - y) if y < y0 else 0, (y - y1) if y > y1 else 0)
            if 0 < d < 5:
                halo.a[y, x] = (*PAL[S['halo']], int(46 * (1 - d / 5) * flick))
    # cord from the beam
    for j in range(y0 - 3):
        cv.px(int(round(w / 2 + off * j / (y0 - 3))), j, 'paper1')
    ramp = S['ramp']
    motifs = _motifs(S['motif'])
    mcols = MOTIF_COLS[S['motif']]
    Rm = 13.0
    for y in range(y0, y1):
        t = (y - y0) / (y1 - y0)
        hw = 7 + 10.5 * math.sin(math.pi * t)
        for x in range(int(cx - hw - 1), int(cx + hw + 2)):
            u = (x + 0.5 - cx) / hw
            if abs(u) > 1:
                continue
            glow = (1 - u * u) * (0.55 + 0.45 * math.sin(math.pi * t)) * flick
            v = 0.12 + 0.88 * glow - 0.12 * max(0, u)          # the right side turns a touch darker
            # bamboo ribs: curved bands that follow the barrel
            rib = ((y - y0) - 2.2 * (1 - u * u)) % 5.5 < 1.0
            if rib:
                v -= 0.22
            k = int(max(0, min(len(ramp) - 1, v * len(ramp))))
            c = ramp[k]
            # the painted pattern, wrapped round the barrel (squeezed toward the edges)
            th = math.asin(max(-1.0, min(1.0, u)))
            for (mt, mh, shape) in motifs:
                dth = _wrap(th - mt - twist)
                if abs(dth) > 0.9:
                    continue
                key = _motif_px(shape, dth * Rm, (y - y0) - mh * (y1 - y0))
                if key:
                    lo, hi = mcols[key]
                    c = hi if v > 0.55 else lo
                    if rib:
                        c = lo
                    break
            cv.px(x, y, c)
    # a few vertical paper seams catching the light
    for su in (-0.55, 0.2):
        for y in range(y0 + 3, y1 - 3):
            t = (y - y0) / (y1 - y0)
            hw = 7 + 10.5 * math.sin(math.pi * t)
            x = int(round(cx + su * hw))
            if (y * 3) % 7:
                cv.shift(x, y, -1)
    if torn:                                              # a tear with the flame showing through
        tx, ty = int(cx + 6), y0 + 26
        for (dx, dy, c) in ((0, 0, 'fire5'), (1, 0, 'fire4'), (0, 1, 'fire4'), (1, 1, 'fire5'), (2, 1, 'fire4'),
                            (1, 2, 'fire4'), (0, 2, 'fire3'), (2, 2, 'fire3'), (1, 3, 'fire3')):
            cv.px(tx + dx, ty + dy, c)
        for (dx, dy) in ((-1, 0), (-1, 1), (-1, 2), (3, 1), (3, 2), (0, -1), (2, 3), (1, 4)):
            cv.px(tx + dx, ty + dy, ramp[0])
        cv.px(tx + 3, ty + 4, 'paper3'); cv.px(tx - 2, ty + 3, 'paper3')
    # lacquer caps: shallow drums with a gold rim
    c_edge, c_lit, c_dark = S['cap']
    for (cy, top) in ((y0 - 2, True), (y1 + 1, False)):
        for y in range(cy - 2, cy + 3):
            for x in range(int(cx - 8), int(cx + 9)):
                dx = (x + 0.5 - cx) / 8.5
                if abs(dx) <= 1:
                    c = c_edge if abs(dx) > 0.55 else (c_lit if dx < 0 else c_dark)
                    if (top and y == cy + 2) or (not top and y == cy - 2):
                        c = 'gold2' if dx < 0.3 else 'gold1'
                    cv.px(x, y, c)
        cv.px(int(cx - 5), cy - 1, 'stone2')
    # something tied at the top for the season
    tx0, ty0 = int(cx + 6), y0 - 3
    if style == 'spring':                                 # a sprig of blossom
        cv.line(tx0, ty0, tx0 + 5, ty0 - 4, 'bark1')
        for (dx, dy) in ((3, -4), (5, -5), (6, -3), (2, -2)):
            cv.px(tx0 + dx, ty0 + dy, 'pink4'); cv.px(tx0 + dx + 1, ty0 + dy, 'pink3')
    elif style == 'winter':                               # pine needles and red nanten berries
        for k in range(5):
            cv.line(tx0, ty0, tx0 + 2 + k, ty0 - 4 + k // 2, 'leaf1' if k % 2 else 'jade1')
        for (dx, dy) in ((1, 1), (3, 1), (2, 2)):
            cv.px(tx0 + dx, ty0 + dy, 'scarlet2')
    elif style == 'autumn':                               # a red maple leaf caught on the cord
        for (dx, dy, c) in ((0, 0, 'red2'), (-1, 0, 'red1'), (1, 0, 'red2'), (0, -1, 'red2'), (-1, -1, 'red1'),
                            (1, -1, 'red3'), (0, 1, 'wood0')):
            cv.px(tx0 - 9 + dx, ty0 - 6 + dy, c)
    # tassel, swinging a little behind the lantern
    tx = cx + sw * 1.2
    for j in range(3):
        cv.px(int(round(cx)), y1 + 4 + j, 'gold1')
    t_a, t_b, t_c = S['tassel']
    for j in range(8):
        sx = int(round(tx + sw * j * 0.15))
        for k in (-1, 0, 1):
            cv.px(sx + k, y1 + 7 + j, t_a if k < 0 else (t_b if k == 0 else t_c))
    cv.px(int(round(tx)), y1 + 6, 'gold3')
    body = O.outline(cv)
    out = Canvas(body.w, body.h)
    out.blit(halo, 1, 1)
    out.blit(body, 0, 0)
    return out


@prop('paper_lantern_a', 2, 'ceiling', 832, 36, 'Paper lantern swaying in front of the window, painted for the season (8 frames)', fps=5)
def lantern_a():
    return [_lantern(2020, False, f) for f in range(F8)]


@prop('paper_lantern_b', 2, 'ceiling', 1042, 36, 'Torn paper lantern, glowing through the tear, painted for the season (8 frames)', fps=5)
def lantern_b():
    return [_lantern(2021, True, f) for f in range(F8)]


@prop('wind_chime', 2, 'wall', 990, 60, 'Glass furin wind chime: the paper strip catches the breeze (8 frames)', fps=6,
      preview=False)
def wind_chime():
    rng = random.Random(2030)
    frames = []
    for f in range(F8):
        cv = Canvas(22, 56)
        sw = math.sin(2 * math.pi * f / F8)
        cv.vline(11, 0, 5, 'paper1')
        m = ellipse_mask(16, 14, 8, 10, 8, 10)
        m[12:, :] = False
        paint(m, O.GLASS, R=6, amb=0.4, spec=0.15, spec_col='white', canvas=cv, ox=3, oy=4)
        for (x, y, c) in ((8, 9, 'red4'), (9, 10, 'red3'), (13, 8, 'leaf3'), (14, 9, 'leaf2'), (11, 12, 'gold3')):
            cv.px(x, y, c)
        cv.hline(3, 18, 16, 'sky2')
        cv.px(11 + int(round(sw)), 17, 'gold2')          # clapper
        for j in range(18, 26):
            cv.px(11 + int(round(sw * (j - 17) / 5)), j, 'paper1')
        sx = 11 + int(round(sw * 2.4))
        for j in range(26, 54):                          # paper strip (tanzaku) swings and twists
            t = (j - 26) / 28
            x = sx + int(round(sw * 3 * t * t))
            wdt = 4 if abs(math.sin(2 * math.pi * f / F8 + t * 2)) > 0.3 else 2
            for d in range(wdt):
                cv.px(x - wdt // 2 + d, j, 'paper4' if d < wdt - 1 else 'paper2')
        glyph(cv, rng, sx - 2, 32, 5, 'red2')
        frames.append(O.outline(cv))
    return frames


def _bonsai(rng):
    """Little green bonsai pine in a shallow blue pot."""
    w, h = 64, 54
    cv = Canvas(w, h)
    T = Canvas(w, h)
    limbs_draw(T, [([(30, 44), (24, 34), (34, 26), (28, 16)], 3.2, 1.2),
                   ([(27, 32), (14, 28), (6, 26)], 1.6, 0.7), ([(32, 26), (46, 22), (56, 22)], 1.6, 0.7)], rng)
    cv.blit(T, 0, 0)
    for (cx, cy, rx, ry) in ((10, 22, 10, 5), (52, 18, 11, 5), (28, 10, 13, 6), (40, 28, 8, 4)):
        spr, ox, oy, m = leafy(rng, [(0, 0, rx, ry), (-rx * 0.4, 1, rx * 0.6, ry * 0.8)],
                               ['ink', 'leaf0', 'leaf1', 'leaf2', 'leaf3', 'leaf4'], kind='needle', leaf_len=(3, 4))
        cv.blit(spr, int(cx - ox), int(cy - oy))
    pot = lathe_shade(40, 9, lambda t: 20 - t * 3, ['indigo1', 'indigo2', 'indigo3', 'indigo4'], spec=0.08,
                      spec_col='white')
    cv.blit(pot, 12, h - 10)
    cv.ellipse(32, h - 10, 19, 2, 'wood1'); cv.px(26, h - 11, 'leaf3'); cv.px(38, h - 11, 'leaf2')
    return O.outline(cv)


@prop('bonsai_pine', 2, 'wall', 812, SILL_Y - 55, 'Green bonsai pine in a blue pot on the sill')
def bonsai():
    return _bonsai(random.Random(2040))


@prop('succulent_cup', 2, 'wall', 882, SILL_Y - 22, 'Succulent rosette in a celadon cup')
def succulent():
    rng = random.Random(2041)
    cv = Canvas(26, 22)
    cup = lathe_shade(18, 10, lambda t: 9 - t * 1.5, O.CELADON[1:], spec=0.1, spec_col='white')
    cv.blit(cup, 4, 12)
    for (a, ln) in [(-150, 7), (-120, 8), (-90, 9), (-60, 8), (-30, 7), (-105, 5), (-75, 5)]:
        from leaves import leaf_stamp
        for (dx, dy, sd) in leaf_stamp(math.radians(a), ln, 2.2):
            cv.px(13 + dx, 13 + dy, 'jade4' if sd > 0 else ('jade3' if sd == 0 else 'jade2'))
    cv.px(13, 6, 'pink3')
    return O.outline(cv)


@prop('sake_bottle_vase', 2, 'wall', 1022, SILL_Y - 42, 'Old sake bottle used as a vase - one white camellia')
def sake_vase():
    cv = Canvas(22, 42)
    body = lathe_shade(14, 24, lambda t: 7 * (0.55 + 0.45 * math.sin(math.pi * min(1, 0.2 + t))), O.IRON[1:],
                       spec=0.1, spec_col='stone4')
    cv.blit(body, 4, 18)
    cv.rect(7, 24, 8, 8, 'paper3'); cv.vline(11, 25, 30, 'ink'); cv.hline(8, 13, 27, 'ink')
    cv.vline(11, 4, 18, 'leaf2'); cv.vline(12, 8, 18, 'leaf1')
    flower(cv, 11, 5, 'paper4', 'gold3', size=2)
    from leaves import leaf_stamp
    for (dx, dy, sd) in leaf_stamp(math.radians(-150), 6, 2):
        cv.px(11 + dx, 12 + dy, 'leaf3' if sd > 0 else 'leaf2')
    return O.outline(cv)


@prop('fern_pot', 2, 'wall', 990, SILL_Y - 40, 'Fern spilling out of a chipped clay pot', preview=False)
def fern():
    rng = random.Random(2050)
    cv = Canvas(48, 40)
    from leaves import leaf_stamp
    for k in range(11):
        a = math.pi + (k + 0.5) * math.pi / 11
        ln = rng.randint(14, 20)
        for j in range(ln):
            x = 24 + math.cos(a) * j
            y = 24 + math.sin(a) * j * 0.85 + j * j * 0.05
            cv.px(int(x), int(y), 'leaf2')
            if j % 2 == 0 and j > 2:
                side = 1 if (j // 2) % 2 else -1
                for (dx, dy, sd) in leaf_stamp(a + side * 1.2, 3, 1.1):
                    cv.px(int(x) + dx, int(y) + dy, 'leaf4' if sd > 0 else 'leaf3')
    pot = O.clay_pot(22, 16, ('wood0', 'wood1', 'wood2', 'wood3', 'wood4'), cracked=True)
    cv.blit(pot, 13, 24)
    return O.outline(cv)


@prop('white_flower_pot', 2, 'wall', 1052, SILL_Y - 38, 'Pot of white daisies and green leaves')
def flower_pot():
    rng = random.Random(2060)
    plant = O.leafy_plant(rng, 32, 24, flowers=['white', 'paper4', 'gold3'])
    return O.potted(rng, 22, 16, plant)


# ---------------------------------------------------------------- counter (room 2)
# three seats at x ~ 800 / 960 / 1120, shared things in between
@prop('menu_tent_card', 2, 'counter', 724, COUNTER_Y - 32, 'Folded paper menu card standing on the counter', preview=False)
def menu_card():
    rng = random.Random(2070)
    cv = Canvas(34, 32)
    cv.poly([(2, 31), (17, 0), (32, 31)], 'paper3')
    cv.poly([(17, 0), (32, 31), (25, 31)], 'paper2')
    cv.line(2, 31, 17, 0, 'paper4')
    text(cv, 10, 12, 'TEA', 'red2')
    text(cv, 8, 19, 'MENU', 'wood1')
    cv.rect(14, 4, 6, 4, 'red3')
    return O.outline(cv)


@prop('teacup_black_tea', 2, 'counter', 1012, COUNTER_Y - 34, "Teacup of black tea on its saucer (Uncle Pong's)")
def teacup_black():
    return TW.teacup_saucer('black', seed=1)


@prop('steam_cup', 2, 'front', 1024, COUNTER_Y - 64, 'Steam from the teacup (8 frames)', drag=False, fps=7)
def steam_cup():
    return O.steam_frames(18, 32, F8, 2)


@prop('bud_vase', 2, 'counter', 870, COUNTER_Y - 40, 'Celadon bud vase with wild grasses', preview=False)
def bud_vase():
    cv = Canvas(24, 40)
    body = lathe_shade(14, 20, lambda t: 7 * (0.45 + 0.55 * math.sin(math.pi * min(1, 0.15 + t))), O.CELADON[1:],
                       spec=0.12, spec_col='white')
    cv.blit(body, 5, 20)
    for (x, y, c) in ((4, 4, 'purp3'), (12, 0, 'white'), (20, 6, 'gold3'), (16, 3, 'leaf4')):
        cv.line(12, 20, x, y + 2, 'leaf2')
        flower(cv, x, y, c, 'gold3')
    return O.outline(cv)


@prop('dango_plate', 2, 'counter', 916, COUNTER_Y - 18, 'Plate of tri-colour dango skewers', preview=False)
def dango():
    cv = Canvas(48, 18)
    cv.ellipse(24, 14, 23, 4, 'paper3'); cv.ellipse(24, 13.5, 20, 3, 'paper4'); cv.hline(4, 44, 17, 'paper1')
    for k, y in enumerate((4, 8)):
        cv.line(6, y + 4, 42, y, 'wood4')
        for i, c in enumerate((('pink2', 'pink3', 'pink4'), ('paper3', 'paper4', 'white'), ('leaf2', 'leaf3', 'leaf4'))):
            m = ellipse_mask(9, 8, 4.5, 4, 4.5, 4)
            paint(m, list(c), R=3.5, amb=0.35, canvas=cv, ox=12 + i * 9 + k * 3, oy=y - 3 + (2 - i) // 2)
    return O.outline(cv)


@prop('yunomi_matcha_seat', 2, 'counter', 772, COUNTER_Y - 32, 'Ribbed yunomi cup of matcha')
def yunomi_seat():
    return TW.yunomi('matcha', seed=3)


@prop('sugar_pot', 2, 'counter', 1034, COUNTER_Y - 24, 'Lidded blue sugar pot', preview=False)
def sugar_pot():
    cv = Canvas(24, 24)
    body = lathe_shade(22, 14, lambda t: 11 * math.sqrt(max(0.1, 1 - (t * 0.8) ** 2)), ['indigo1', 'indigo2', 'indigo3', 'indigo4'],
                       spec=0.12, spec_col='white')
    cv.blit(body, 1, 9)
    cv.ellipse(12, 9, 9, 2.6, 'indigo3'); cv.hline(5, 19, 8, 'indigo4')
    cv.rect(10, 4, 4, 4, 'indigo2'); cv.px(10, 4, 'indigo4')
    cv.hline(3, 20, 15, 'white')
    return O.outline(cv)


@prop('teacup_green_tea', 2, 'counter', 1086, COUNTER_Y - 34, 'Teacup of green tea on its saucer', preview=False)
def teacup_green():
    return TW.teacup_saucer('green', seed=2)


@prop('service_bell', 2, 'counter', 1170, COUNTER_Y - 20, 'Brass service bell, tarnished', preview=False)
def bell():
    cv = Canvas(28, 20)
    m = ellipse_mask(24, 22, 12, 13, 12, 12)
    m[13:, :] = False
    paint(m, O.BRASS, R=8, spec=0.12, spec_col='gold4', canvas=cv, ox=2, oy=2)
    cv.rect(0, 14, 28, 5, 'wood2'); cv.hline(0, 27, 14, 'wood4'); cv.hline(0, 27, 18, 'wood0')
    cv.rect(12, 0, 4, 3, 'gold3'); cv.px(12, 0, 'gold4')
    cv.px(19, 10, 'teal2'); cv.px(20, 11, 'teal1')
    return O.outline(cv)


@prop('teapot_customer', 2, 'counter', 1150, COUNTER_Y - 42, 'Glazed white teapot with a cobalt band, for refills', preview=False)
def teapot_customer():
    return TW.teapot_white()
