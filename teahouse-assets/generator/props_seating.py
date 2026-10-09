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


@prop('pendulum_clock', 2, 'wall', 1164, 60, 'Old pendulum clock stopped at 4:20 - carved crown, cracked glass, cobweb')
def clock():
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
    # face: brass bezel, paper dial, numerals as ticks, hands at 4:20
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
    cv.line(cx, cy, cx + 5, cy + 3, 'ink'); cv.line(cx, cy, cx + 3, cy - 9, 'ink')
    cv.px(cx, cy, 'red3')
    for (dx, dy) in ((-8, -8), (-7, -6), (-5, -4), (-6, -2), (3, -11), (5, -8), (6, -6)):
        cv.px(cx + dx, cy + dy, 'white')
    cv.px(cx - 9, cy - 4, 'sky4'); cv.px(cx - 10, cy - 3, 'white')
    # pendulum window
    cv.rect(13, 58, w - 26, 46, 'wood0')
    for k in range(4):
        cv.vline(15 + k * 8, 60, 102, 'ink')
    rod = lathe_shade(3, 30, lambda t: 1.5, O.BRASS[1:], spec=0.1)
    cv.blit(rod, cx - 1, 58)
    m2 = ellipse_mask(14, 14, 7, 7, 7, 7)
    paint(m2, O.BRASS, R=5, spec=0.12, spec_col='gold4', canvas=cv, ox=cx - 7, oy=86)
    cv.frame(12, 57, w - 24, 48, 'wood3'); cv.hline(12, w - 13, 57, 'wood5')
    for (x, y) in ((16, 62), (18, 64), (20, 61)):
        cv.px(x, y, 'sky3')
    cobweb(cv, 13, 58, 12, 'stone3', 'stone2', 'tl')
    return O.outline(cv)


def _lantern(seed, torn, f, n=F8):
    rng = random.Random(seed)
    sw = math.sin(2 * math.pi * f / n + seed)
    w, h = 40, 76
    cv = Canvas(w, h)
    off = int(round(sw * 1.4))
    for j in range(18):
        cv.px(w // 2 + int(round(sw * 1.4 * j / 18)), j, 'paper1')
    body_y = 20
    cv.rect(w // 2 - 7 + off, 17, 14, 4, 'ink'); cv.hline(w // 2 - 7 + off, w // 2 + 6 + off, 17, 'gold2')
    m = ellipse_mask(32, 44, 16, 22, 16, 22)
    lam = Canvas(32, 44)
    paint(m, ['red1', 'red2', 'red3', 'red4', 'red5'], R=12, amb=0.35, canvas=lam)
    for y in range(0, 44, 5):                       # bamboo ribs
        for x in range(32):
            if m[y, x]:
                lam.shift(x, y, -1)
    lam.rect(10, 11, 12, 18, 'red4')
    glyph(lam, rng, 11, 12, 10, 'ink'); glyph(lam, rng, 11, 22, 7, 'ink')
    if torn:
        lam.rect(22, 26, 5, 7, 'fire3'); lam.px(21, 26, 'paper3'); lam.px(27, 32, 'paper3')
        lam.line(4, 8, 7, 18, 'red1')
    lam.px(7, 9, 'red5'); lam.px(8, 8, 'pink4')
    cv.blit(lam, w // 2 - 16 + off, body_y)
    cv.rect(w // 2 - 7 + off, body_y + 43, 14, 4, 'ink'); cv.hline(w // 2 - 7 + off, w // 2 + 6 + off, body_y + 46, 'gold1')
    tx = w // 2 + off + int(round(sw * 1.5))
    for j in range(7):
        cv.px(tx, body_y + 47 + j, 'gold2')
    cv.px(tx - 1, body_y + 54, 'gold1'); cv.px(tx + 1, body_y + 54, 'gold1')
    return O.outline(cv)


@prop('paper_lantern_a', 2, 'ceiling', 832, 36, 'Red paper lantern swaying in front of the window (8 frames)', fps=5)
def lantern_a():
    return [_lantern(2020, False, f) for f in range(F8)]


@prop('paper_lantern_b', 2, 'ceiling', 1042, 36, 'Torn red paper lantern, glowing through the tear (8 frames)', fps=5)
def lantern_b():
    return [_lantern(2021, True, f) for f in range(F8)]


@prop('wind_chime', 2, 'wall', 990, 60, 'Glass furin wind chime: the paper strip catches the breeze (8 frames)', fps=6)
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


@prop('teapot_customer', 2, 'counter', 1150, COUNTER_Y - 42, 'Glazed white teapot with a cobalt band, for refills')
def teapot_customer():
    return TW.teapot_white()
