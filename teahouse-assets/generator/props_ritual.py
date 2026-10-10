"""Room 3 - tea ritual: corkboard of worn notes, hanging scroll, glazed
cabinet, teaware shelf, the full tea set on the counter, incense, candle,
the journal drawer, and the polished green alien lucky cat."""
import math
import random
from pixel import Canvas, PAL, step, scribble, text
from shapes import torn_paper, pin, wood_grain_h, wood_grain_v, chip, cobweb, flower
from propkit import prop, glyph, paper_note
from furn import R, wood_face, inset, knob, bar_pull, ring_pull
from shade import paint, lathe_shade, ellipse_mask, poly_mask, mask_of
import objects as O
import teaware as TW
import tea_set as TS
from counter import DRAWERS
from layout import COUNTER_Y, SHELF3_Y

F8 = 8


# ---------------------------------------------------------------- corkboard + notes
@prop('corkboard', 3, 'wall', 1334, 64, 'Old corkboard, empty: pin holes and pale squares where notes used to hang')
def corkboard():
    rng = random.Random(3001)
    w, h = 244, 134
    cv = Canvas(w, h)
    # cork: warm granules in three tones, clustered (not noise)
    cv.rect(0, 0, w, h, 'wood4')
    for _ in range(w * h // 26):
        x, y = rng.randint(6, w - 8), rng.randint(6, h - 8)
        c = rng.choice(('wood3', 'wood3', 'wood5', 'gold1'))
        cv.px(x, y, c); cv.px(x + 1, y, c)
        if rng.random() < 0.5:
            cv.px(x, y + 1, c)
    # frame: bevelled wood with mitred corners, a little worn
    for i, c in enumerate(['wood0', 'wood2', 'wood4', 'wood3', 'wood3', 'wood2', 'wood1']):
        cv.frame(i, i, w - 2 * i, h - 2 * i, c)
    for (x, y) in ((0, 0), (w - 7, 0), (0, h - 7), (w - 7, h - 7)):
        for k in range(7):
            cv.px(x + k if x == 0 else x + 6 - k, y + k if y == 0 else y + 6 - k, 'wood1')
    for k in range(10):                                       # an empty brass hook on top
        cv.px(w // 2 - 5 + k, 2, 'gold2' if k % 3 else 'gold3')
    chip(cv, 90, h - 7, 18, 7, rng, under='wood2', under_dark='wood0', n=2, elong=0.6)
    return O.outline(cv)


def _note_receipt(cv, rng, w, h):
    rows = [('TEA', '3'), ('TEA', '3'), ('DANGO', '2'), ('MOCHI', '2')] if w < 24 else [('2 SEN', ''), ('1 MATCHA', ''), ('NO SUGAR', '')]
    y = 6
    for name, price in rows:
        if y > h - 12:
            break
        text(cv, 2, y, name[:max(1, (w - 8) // 4)], 'wood1', rng, True)
        if price:
            text(cv, w - 6, y, price, 'wood1')
        y += 7
    cv.hline(2, w - 3, h - 7, 'red2')
    if w < 24:
        text(cv, 2, h - 6, '10', 'red2')


def _note_customer(cv, rng, w, h):
    cx = w // 2
    cv.ellipse(cx, 14, 13, 6, 'paper1')
    for (dx, dy) in ((-7, 12), (0, 11), (6, 13), (-3, 15), (9, 14)):
        cv.px(cx + dx, dy, 'paper4'); cv.px(cx + dx + 1, dy, 'paper4')
    cv.ellipse(cx, 23, 6, 6, 'paper2')
    cv.px(cx - 3, 23, 'wood0'); cv.px(cx + 3, 23, 'wood0'); cv.hline(cx - 1, cx + 1, 26, 'wood1')
    cv.line(cx - 9, 34, cx - 5, 28, 'paper1'); cv.line(cx + 9, 34, cx + 5, 28, 'paper1')
    text(cv, 3, h - 7, 'GUEST?', 'red2', rng, True)


def _note_map(cv, rng, w, h):
    pts = [(5, h - 8), (13, h - 15), (21, h - 11), (30, 10)]
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        n = max(abs(x1 - x0), abs(y1 - y0))
        for k in range(0, n, 2):
            cv.px(x0 + (x1 - x0) * k // n, y0 + (y1 - y0) * k // n, 'red2')
    x, y = pts[-1]
    cv.line(x - 3, y - 3, x + 3, y + 3, 'red3'); cv.line(x - 3, y + 3, x + 3, y - 3, 'red3')
    for k in range(7):
        cv.px(6 + k * 4, 8 + (k % 2), 'water1'); cv.px(7 + k * 4, 8 + (k % 2), 'water2')
    for (tx, ty) in ((8, 18), (24, 22)):
        cv.px(tx, ty, 'leaf1'); cv.px(tx - 1, ty + 1, 'leaf2'); cv.px(tx + 1, ty + 1, 'leaf2')
    text(cv, 3, h - 7, 'MILL', 'wood1', rng, True)


def _note_tab(cv, rng, w, h):
    text(cv, 3, 5, 'UNPAID', 'red2', rng, True)
    cv.hline(3, w - 4, 11, 'red1')
    cv.ellipse(w // 2, 19, 6, 6, 'paper2')
    cv.px(w // 2 - 3, 18, 'ink'); cv.px(w // 2 + 2, 18, 'ink'); cv.hline(w // 2 - 2, w // 2 + 2, 22, 'ink')
    text(cv, 4, 28, 'MOSS', 'wood1', rng, True)
    text(cv, 4, 35, '7 CUPS', 'wood1', rng, True)


def _note_photo(cv, rng, w, h):
    cv.rect(3, 5, w - 6, h - 15, 'wood2')
    cv.rect(4, 6, w - 8, (h - 17) // 2, 'paper1')
    cv.ellipse(w // 2 - 2, 6 + (h - 17) // 2, 5, 7, 'wood1')
    cv.rect(w // 2 + 5, 10 + (h - 17) // 2, 6, 4, 'wood0')
    text(cv, 4, h - 8, '1962', 'wood1', rng, True)


def _note_talisman(cv, rng, w, h):
    cv.rect(1, 2, w - 2, h - 1, 'paper4')
    for k in range(4):
        glyph(cv, rng, 3, 5 + k * 9, 7, 'ink')
    cv.rect(3, h - 10, 7, 7, 'red3'); cv.px(4, h - 9, 'red5')


NOTES = [('note_receipt', 1344, 70, 18, 40, _note_receipt, 'red3', 'paper4'),
         ('note_spirit_customer', 1384, 72, 34, 40, _note_customer, 'jade3', 'paper3'),
         ('note_unpaid_tab', 1434, 70, 28, 46, _note_tab, 'red3', 'paper3'),
         ('note_map_scrap', 1482, 72, 38, 30, _note_map, 'gold3', 'paper2'),
         ('note_order_slip', 1530, 74, 28, 34, _note_receipt, 'jade3', 'paper3'),
         ('note_photo', 1360, 132, 30, 40, _note_photo, 'sky2', 'paper4'),
         ('note_talisman', 1448, 134, 14, 48, _note_talisman, 'red3', 'paper4'),
         ('note_recipe_scrap', 1512, 130, 36, 30, _note_receipt, 'gold3', 'paper2')]
for _i, (_n, _x, _y, _w, _h, _fn, _pc, _base) in enumerate(NOTES):
    def _mk(i=_i, w=_w, h=_h, fn=_fn, pc=_pc, base=_base):
        rng = random.Random(3010 + i)
        cv = paper_note(rng, w, h, base=base, pin_c=pc, lines=False)
        fn(cv, rng, w, h)
        return cv
    prop(_n, 3, 'wall', _x, _y, 'Worn paper note for the corkboard', preview=False)(_mk)


# ---------------------------------------------------------------- scroll
@prop('kakejiku_scroll', 3, 'wall', 1588, 58, 'Hanging scroll: ink pine on a cliff, calligraphy, red seal; water-stained')
def scroll():
    rng = random.Random(3100)
    w, h = 58, 140
    cv = Canvas(w, h)
    cv.line(w // 2, 0, 5, 8, 'paper1'); cv.line(w // 2, 0, w - 6, 8, 'paper1')
    rod = lathe_shade(w - 2, 6, lambda t: (w - 2) / 2, ['wood1', 'wood2', 'wood3', 'wood4'])
    rod_h = Canvas(w - 2, 6)
    for y in range(6):
        rod_h.hline(0, w - 3, y, ['wood4', 'wood3', 'wood3', 'wood2', 'wood1', 'wood0'][y])
    cv.blit(rod_h, 1, 8)
    cv.rect(4, 14, w - 8, h - 30, 'jade2')
    for y in range(14, h - 16):
        if y % 4 == 0:
            cv.hline(4, w - 5, y, 'jade3')
    cv.vline(4, 14, h - 17, 'jade4'); cv.vline(w - 5, 14, h - 17, 'jade0')
    px0, py0, pw, ph = 10, 26, w - 20, h - 54
    cv.rect(px0, py0, pw, ph, 'paper3')
    for y in range(py0, py0 + ph):
        for x in range(px0, px0 + pw):
            if (x * 3 + y * 7) % 23 == 0:
                cv.px(x, y, 'paper2')
    # ink painting: a pine leaning off a cliff (green-grey washes)
    cv.poly([(px0, py0 + ph), (px0, py0 + ph - 30), (px0 + 14, py0 + ph - 38), (px0 + 22, py0 + ph - 20),
             (px0 + 18, py0 + ph)], 'stone2')
    cv.line(px0 + 10, py0 + ph - 36, px0 + 20, py0 + ph - 60, 'ink')
    cv.line(px0 + 20, py0 + ph - 60, px0 + 30, py0 + ph - 74, 'ink')
    cv.line(px0 + 11, py0 + ph - 36, px0 + 21, py0 + ph - 60, 'stone1')
    for (cx, cy, rw) in ((px0 + 30, py0 + ph - 78, 12), (px0 + 18, py0 + ph - 62, 9), (px0 + 33, py0 + ph - 62, 8)):
        for k in range(-rw, rw + 1):
            cv.px(cx + k, cy, 'stone0' if abs(k) < rw - 2 else 'stone1')
            if abs(k) < rw - 3:
                cv.px(cx + k, cy - 1, 'leaf1' if k % 3 else 'stone0')
                cv.px(cx + k, cy + 1, 'stone1')
    for k in range(4):
        glyph(cv, rng, px0 + pw - 9, py0 + 6 + k * 10, 7, 'ink')
    cv.rect(px0 + pw - 9, py0 + 48, 6, 6, 'red3'); cv.px(px0 + pw - 8, py0 + 49, 'red5')
    for y in range(py0 + ph - 34, py0 + ph):           # water stain + torn corner
        for x in range(px0, px0 + 16):
            if (x + y) % 2 == 0 and (x - px0) + (py0 + ph - y) < 30:
                cv.shift(x, y, -1, only=('paper', 'stone'))
    for k in range(8):
        cv.rect(px0 + pw - 1 - k, py0 + ph - (8 - k), k + 2, 1, None)
    cv.blit(rod_h, 1, h - 16)
    cv.rect(0, h - 16, 3, 6, 'gold2'); cv.rect(w - 3, h - 16, 3, 6, 'gold2')
    return O.outline(cv)


# ---------------------------------------------------------------- cabinet + shelf
@prop('glazed_cabinet', 3, 'wall', 1656, 58, 'Jade storage cabinet: glazed lattice doors over teaware, one door ajar', preview=False)
def cabinet():
    rng = random.Random(3200)
    w, h = 212, 100
    cv = Canvas(w, h)
    wood_face(cv, 0, 6, w, h - 6, rng, 'wood', 2, 'v')
    cv.rect(-1, 0, w + 2, 8, 'wood3'); cv.hline(0, w - 1, 0, 'wood5'); cv.hline(0, w - 1, 7, 'wood1')
    cv.rect(2, 2, w - 4, 3, 'gold1'); cv.hline(2, w - 3, 2, 'gold3')
    dw = (w - 14) // 2
    for i in range(2):
        x = 6 + i * (dw + 2)
        # inside: shelves of teaware seen through the glass
        cv.rect(x + 4, 12, dw - 8, 54, 'wood0')
        for k, sy in enumerate((38, 64)):
            cv.rect(x + 4, sy, dw - 8, 2, 'wood2')
        for k in range(4):
            jx = x + 12 + k * 22
            body = rng.choice((O.CELADON[1:], O.CERAMIC_WHITE[1:], ['red1', 'red2', 'red3', 'red4'], O.IRON[1:]))
            pot = O.ceramic_jar(rng, 14, 18, list(body)[:4], lid=k % 2 == 0)
            cv.blit(pot, jx, 20)
            cup = O.cup(12, 8, glaze=O.CERAMIC_WHITE, tea=None, top=0)
            cv.blit(cup, jx + 2, 54)
        if i == 0:
            # door ajar: glass reflects, frame swung out (foreshortened)
            door = Canvas(30, h - 14)
            for yy in range(h - 14):
                for xx in range(30):
                    if yy < xx * 0.22 or yy > h - 15 - xx * 0.22:
                        continue
                    door.px(xx, yy, 'jade3' if xx < 4 else ('jade2' if xx < 26 else 'jade1'))
            for yy in range(10, h - 40, 14):
                door.hline(4, 26, yy, 'jade1')
            door.rect(6, 12, 18, 40, 'sky2')
            for k in range(3):
                door.line(8 + k * 5, 14, 12 + k * 5, 48, 'sky4')
            door.vline(0, 0, h - 15, 'jade4')
            knob(door, 24, (h - 14) // 2)
            cv.blit(door, x - 18, 7)
            # the open side shows the lower panel only
            cv.rect(x + 4, 70, dw - 8, h - 82, 'wood1')
        else:
            # closed door: lattice glass top, raised jade panel bottom
            cv.rect(x, 9, dw, h - 18, 'jade2')
            cv.hline(x, x + dw - 1, 9, 'jade4'); cv.vline(x, 9, h - 10, 'jade4'); cv.vline(x + dw - 1, 9, h - 10, 'jade0')
            gx0, gy0, gw, gh = x + 6, 14, dw - 12, 48
            # see-through: redraw the inside items darker (glass tint)
            for yy in range(gy0, gy0 + gh):
                for xx in range(gx0, gx0 + gw):
                    cv.px(xx, yy, 'wood0')
            for k in range(4):
                jx = gx0 + 6 + k * 21
                pot = O.ceramic_jar(rng, 13, 17, ['jade0', 'jade1', 'jade2', 'jade3'], lid=k % 2 == 1)
                cv.blit(pot, jx, gy0 + 8)
                cv.blit(O.cup(11, 7, glaze=O.CERAMIC_WHITE, tea=None, top=0), jx + 1, gy0 + 36)
            for xx in range(gx0, gx0 + gw, 20):          # lattice muntins
                cv.vline(xx, gy0, gy0 + gh - 1, 'jade1')
            cv.hline(gx0, gx0 + gw - 1, gy0 + 24, 'jade1')
            for k in range(3):                           # glass glints
                cv.line(gx0 + 6 + k * 24, gy0 + 4, gx0 + 12 + k * 24, gy0 + 18, 'sky3')
            cv.frame(gx0 - 1, gy0 - 1, gw + 2, gh + 2, 'jade0')
            inset(cv, x + 6, gy0 + gh + 6, dw - 12, h - gy0 - gh - 24, 'jade', 2, raised=True)
            for _ in range(4):
                chip(cv, x + rng.randint(4, dw - 16), rng.randint(14, h - 26), rng.randint(6, 12), rng.randint(6, 12),
                     rng, under='wood3', under_dark='wood1', n=3, elong=1.4)
            for hy in (24, h - 30):
                cv.rect(x + 1, hy, 4, 8, 'gold2'); cv.px(x + 1, hy, 'gold4'); cv.px(x + 4, hy + 7, 'gold0')
            knob(cv, x + 8, h // 2 + 6)
    cv.rect(0, h - 8, w, 8, 'wood3'); cv.hline(0, w - 1, h - 8, 'wood4'); cv.hline(0, w - 1, h - 1, 'wood1')
    cobweb(cv, w - 3, 9, 16, 'stone3', 'stone2', 'tr')
    return O.outline(cv)


@prop('teaware_shelf', 3, 'wall', 1656, SHELF3_Y, 'Open shelf for teaware', preview=False)
def teaware_shelf():
    rng = random.Random(3300)
    w = 212
    cv = Canvas(w, 18)
    wood_grain_h(cv, 0, 0, w, 5, R('wood', 3), rng, dark=R('wood', 2), light=R('wood', 4))
    cv.hline(0, w - 1, 0, 'wood5'); cv.hline(0, w - 1, 5, 'wood1')
    cv.rect(0, 6, w, 2, 'wood2')
    for bx in (12, w // 2 - 4, w - 20):
        for k in range(10):
            wdt = max(1, 8 - int(k * 0.8))
            cv.hline(bx, bx + wdt, 8 + k, 'wood2'); cv.px(bx, 8 + k, 'wood3')
    return O.outline(cv)


SHELF3 = [
    ('teapot_celadon', 1662, lambda r: O.teapot(40, 26, O.CELADON[1:]), 'Celadon teapot'),
    ('cup_stack', 1708, lambda r: _cup_stack(r), 'Stack of handleless teacups'),
    ('honey_pot', 1736, lambda r: _honey(r), 'Honey pot with a wooden dipper'),
    ('daruma_doll', 1766, lambda r: _daruma(r), 'Red daruma with one eye painted (a wish not yet granted)'),
    ('tin_gold_band', 1794, lambda r: O.tin(r, 18, 22, 'wood', 'gold', glyph_c='gold3'), 'Gold-banded tea tin'),
    ('matcha_bowls', 1820, lambda r: _bowl_stack(r), 'Two matcha bowls stacked'),
    ('whisk_on_stand', 1852, lambda r: _whisk_stand(r), 'Chasen whisk drying on its ceramic stand'),
    ('incense_box', 1874, lambda r: _incense_box(r), 'Little lacquer box of incense sticks'),
]


def _cup_stack(rng):
    cv = Canvas(20, 24)
    for i, y in enumerate((16, 8, 0)):
        c = O.cup(18, 7, band=('red3', 'sky2', 'indigo2')[i], tea=None, top=0)
        cv.blit(c, 0, y)
    return cv


def _honey(rng):
    cv = Canvas(24, 26)
    body = lathe_shade(22, 18, lambda t: 11 * math.sin(math.pi * min(1, 0.25 + t * 0.8)) ** 0.6, O.BRASS[1:],
                       spec=0.12, spec_col='gold4')
    cv.blit(body, 1, 8)
    cv.rect(5, 6, 14, 3, 'paper3'); cv.hline(5, 18, 6, 'paper4')
    cv.line(16, 0, 12, 9, 'wood3'); cv.line(17, 0, 13, 9, 'wood2')
    cv.vline(18, 9, 14, 'gold3')
    return O.outline(cv)


def _daruma(rng):
    cv = Canvas(22, 24)
    m = ellipse_mask(22, 24, 11, 13, 10.5, 11.5)
    paint(m, ['red1', 'red2', 'red3', 'red4', 'red5'], R=8, spec=0.1, spec_col='white', canvas=cv)
    cv.ellipse(11, 10, 6, 5, 'paper4'); cv.ellipse(11, 11, 5, 3.5, 'paper3')
    cv.ellipse(8, 9, 1.5, 1.5, 'ink'); cv.ellipse(14, 9, 1.5, 1.5, 'paper2')
    cv.hline(9, 13, 13, 'red1')
    cv.hline(4, 18, 18, 'gold3'); cv.hline(5, 17, 19, 'gold2')
    glyph(cv, rng, 8, 19, 5, 'gold3')
    return O.outline(cv)


def _bowl_stack(rng):
    cv = Canvas(34, 18)
    b1 = O.bowl(32, 9, ['wood0', 'wood1', 'wood2', 'copper2'], inside=None, top=0)
    b2 = O.bowl(28, 8, ['stone0', 'stone1', 'stone2', 'stone3'], inside=None, top=2)
    cv.blit(b1, 0, 8); cv.blit(b2, 2, 0)
    return cv


def _whisk_stand(rng):
    cv = Canvas(16, 24)
    stand = lathe_shade(10, 9, lambda t: 5 - t, O.CERAMIC_WHITE[1:5], spec=0.1)
    cv.blit(stand, 3, 15)
    for x in range(1, 15):
        cv.line(8, 6, x, 16, 'gold3' if x < 8 else 'gold2')
    cv.rect(5, 0, 6, 7, 'gold2'); cv.vline(5, 0, 6, 'gold3'); cv.vline(10, 0, 6, 'gold1')
    return O.outline(cv)


def _incense_box(rng):
    cv = Canvas(24, 12)
    cv.rect(0, 4, 24, 8, 'ink1'); cv.hline(0, 23, 4, 'stone1'); cv.rect(0, 4, 2, 8, 'stone0')
    for (x, c) in ((5, 'gold3'), (11, 'gold3'), (16, 'red3')):
        cv.px(x, 7, c); cv.px(x + 1, 8, c)
    for x in range(4, 20, 3):
        cv.vline(x, 0, 4, 'leaf1' if x % 2 else 'red1')
    return O.outline(cv)


for _i, (_n, _x, _fn, _d) in enumerate(SHELF3):
    def _mk(i=_i, fn=_fn):
        return fn(random.Random(3310 + i))
    _probe = _fn(random.Random(3310 + _i))
    prop(_n, 3, 'wall', _x, SHELF3_Y - _probe.h + 1, _d, preview=False)(_mk)


# ---------------------------------------------------------------- counter (room 3)
@prop('tea_runner', 3, 'counter', 1298, COUNTER_Y - 14, 'Indigo cotton tea mat with seigaiha wave stitching, fringed ends',
      shadow='none', preview=False)
def tea_runner():
    return TS.runner()


@prop('kyusu_teapot', 3, 'counter', 1304, COUNTER_Y - 40, 'Tokoname red-clay kyusu: squat round body, side handle, chipped lid')
def kyusu():
    return TS.kyusu()


@prop('chawan_matcha', 3, 'counter', 1366, COUNTER_Y - 26, 'Black raku tea bowl of frothy matcha, a glaze run on its side')
def chawan():
    return TS.chawan()


@prop('chasen_whisk', 3, 'counter', 1412, COUNTER_Y - 32, 'Bamboo matcha whisk: node on the handle, a bulb of fine tines')
def chasen():
    return TS.chasen()


@prop('natsume_caddy', 3, 'counter', 1436, COUNTER_Y - 24, 'Black lacquer natsume tea caddy with a gold maki-e pine bough')
def natsume():
    return TS.natsume()


@prop('chashaku_scoop', 3, 'counter', 1452, COUNTER_Y - 7, 'Bamboo tea scoop with its node and bent tip')
def chashaku():
    return TS.chashaku()


@prop('yunomi_tray', 3, 'counter', 1500, COUNTER_Y - 36, 'Lacquer tray with four ribbed yunomi: matcha, hojicha, sencha, water')
def tray():
    cv = Canvas(112, 38)
    cv.rect(0, 26, 112, 7, 'red2'); cv.hline(0, 111, 26, 'red4'); cv.hline(1, 110, 27, 'red3')
    cv.rect(0, 33, 112, 4, 'red1'); cv.hline(0, 111, 36, 'red0')
    cv.px(4, 29, 'gold3'); cv.px(107, 29, 'gold3')
    for i, t in enumerate(('matcha', 'hojicha', 'sencha', 'water')):
        cup = TW.yunomi(t, seed=i)
        cv.blit(cup, 6 + i * 26, 30 - cup.h + 1)
    return O.outline(cv)


for _i, _t in enumerate(('matcha', 'hojicha', 'sencha', 'water')):
    def _mk(t=_t, i=_i):
        return TW.yunomi(t, seed=i)
    prop(f'yunomi_{_t}', 3, 'counter', 1500 + 7 + _i * 26, COUNTER_Y - 40,
         f'Ribbed yunomi cup of {_t} (single, for dragging)', preview=False)(_mk)


@prop('incense_burner', 3, 'counter', 1612, COUNTER_Y - 58, 'Bronze incense burner, smoke curling up (8 frames)', fps=6, preview=False)
def incense():
    frames = []
    for f in range(F8):
        cv = Canvas(34, 58)
        body = lathe_shade(30, 14, lambda t: 15 * math.sqrt(max(0.1, 1 - (t * 0.95) ** 2)), O.BRASS, spec=0.1,
                           spec_col='gold4')
        cv.blit(body, 2, 40)
        cv.ellipse(17, 40, 14, 3, 'gold1'); cv.ellipse(17, 40.5, 11, 2, 'stone1')
        for (lx, c) in ((5, 'gold0'), (27, 'gold0')):
            cv.rect(lx, 52, 3, 5, c)
        cv.px(24, 46, 'teal2'); cv.px(25, 47, 'teal1')
        cv.vline(17, 26, 39, 'red2'); cv.px(17, 25, 'fire4')
        for j in range(24):
            x = 17 + math.sin(j * 0.4 + 2 * math.pi * f / F8) * (j * 0.22)
            if (j + f) % 6 != 5:
                cv.px(int(round(x)), 24 - j, 'cloud2' if j < 12 else 'cloud1')
                if j > 14 and (j + f) % 3 == 0:
                    cv.px(int(round(x)) + 1, 24 - j, 'cloud1')
        frames.append(O.outline(cv))
    return frames


@prop('candle', 3, 'counter', 1656, COUNTER_Y - 42, 'Melted candle stub, flickering flame (8 frames)', fps=10, preview=False)
def candle():
    frames = []
    for f in range(F8):
        cv = Canvas(18, 42)
        body = lathe_shade(10, 20, lambda t: 5, ['paper2', 'paper3', 'paper4', 'white'])
        cv.blit(body, 4, 20)
        cv.vline(3, 24, 30, 'paper3'); cv.vline(14, 22, 27, 'paper3'); cv.px(14, 28, 'paper2')
        cv.ellipse(9, 40, 8, 2, 'gold1'); cv.hline(2, 16, 39, 'gold2')
        cv.vline(9, 16, 20, 'ink')
        hgt = [9, 10, 9, 8, 9, 11, 10, 8][f]
        off = [0, 1, 1, 0, -1, -1, 0, 0][f]
        for k in range(hgt):
            t = k / hgt
            x = 9 + int(round(off * t * 1.5))
            w = 2 if t < 0.5 else (1 if t < 0.8 else 0)
            for d in range(-w, w + 1):
                c = 'fire5' if (t < 0.35 and abs(d) < 1) else ('fire4' if t < 0.6 else ('fire3' if t < 0.85 else 'fire2'))
                cv.px(x + d, 16 - k, c)
        cv.px(9, 15, 'sky3')
        frames.append(O.outline(cv))
    return frames


def _journal(open_=False):
    rng = random.Random(3400)
    if not open_:
        cv = Canvas(40, 13)
        cv.rect(0, 0, 40, 9, 'red2'); cv.hline(0, 39, 0, 'red4'); cv.hline(0, 39, 8, 'red0')
        cv.rect(3, 9, 35, 3, 'paper3'); cv.hline(3, 37, 11, 'paper1')
        cv.rect(4, 0, 3, 9, 'red1')
        cv.rect(18, 2, 12, 4, 'gold2'); cv.px(18, 2, 'gold4')
        cv.vline(31, 0, 12, 'jade3')
        return O.outline(cv)
    cv = Canvas(66, 22)
    cv.poly([(0, 20), (4, 3), (32, 5), (32, 21)], 'paper4')
    cv.poly([(34, 21), (34, 5), (62, 3), (66, 20)], 'paper3')
    cv.rect(32, 4, 2, 18, 'paper1')
    for y in range(7, 18, 2):
        scribble(cv, rng, 6, y, 22, 'wood1'); scribble(cv, rng, 37, y, 22, 'wood1')
    cv.ellipse(50, 12, 5, 3.5, 'leaf3'); cv.px(48, 11, 'leaf4'); cv.line(46, 14, 54, 10, 'leaf2')
    cv.hline(0, 66, 21, 'red1')
    return O.outline(cv)


@prop('journal_closed', 3, 'counter', 1150, COUNTER_Y - 13, "Keeper's journal (closed) - lives in the drawer", preview=False)
def journal_closed():
    return _journal(False)


@prop('journal_open', 3, 'counter', 1150, COUNTER_Y - 22, "Keeper's journal lying open, pressed leaf inside", preview=False)
def journal_open():
    return _journal(True)


@prop('drawer_open', 3, 'counter', DRAWERS[0][0] - 8, DRAWERS[0][1] - 8,
      'Drawer pulled open with the journal inside - swap in over the closed drawer', drag=False, shadow='none',
      preview=False)
def drawer_open():
    rng = random.Random(3410)
    dx, dy, dw, dh = DRAWERS[0]
    cv = Canvas(dw + 16, dh + 20)
    cv.rect(0, 0, dw + 16, 12, 'hinoki1')
    cv.rect(3, 2, dw + 10, 9, 'wood0')
    j = _journal(False)
    cv.blit(j, 14, -2)
    cv.rect(62, 3, 14, 4, 'paper3'); cv.hline(62, 75, 3, 'paper4')
    cv.ellipse(84, 6, 3, 2, 'gold3'); cv.px(83, 5, 'gold4')
    wood_face(cv, 0, 12, dw + 16, dh + 6, rng, 'hinoki', 2, 'h', knots=False)
    cv.hline(0, dw + 15, 12, 'hinoki4'); cv.vline(0, 12, dh + 17, 'hinoki3')
    cv.hline(0, dw + 15, dh + 17, 'hinoki1'); cv.vline(dw + 15, 12, dh + 17, 'hinoki1')
    cx_, cy_ = (dw + 16) // 2, 12 + (dh + 6) // 2
    for a in range(0, 360, 20):                            # iron ring pull, like the closed drawers
        cv.px(int(round(cx_ + math.cos(math.radians(a)) * 4)), int(round(cy_ + 1 + math.sin(math.radians(a)) * 3)),
              'stone1')
    cv.px(cx_, cy_ - 2, 'stone3')
    return O.outline(cv)


# ---------------------------------------------------------------- the alien lucky cat
G = ['alien0', 'alien1', 'alien2', 'alien3', 'alien4']
CAT_W, CAT_H = 66, 84


def _ease(f, n=F8):
    return 0.5 - 0.5 * math.cos(2 * math.pi * f / n)


def alien_cat(f):
    """Ceramic maneki-neko from another world. Glossy lime glaze, cat ears
    AND antennae, three eyes, beckoning paw (eased 8-frame loop), pulsing
    antenna lights, a blink, a coin whose glint travels."""
    cv = Canvas(CAT_W, CAT_H)
    cx = CAT_W // 2 + 2
    # satin cushion with tassels
    cm = poly_mask(CAT_W, CAT_H, [(6, 72), (10, 66), (CAT_W - 6, 66), (CAT_W - 2, 72), (CAT_W - 6, 80), (8, 80)])
    paint(cm, ['red0', 'red1', 'red2', 'red3', 'red4'], profile='soft', R=6, spec=0.08, spec_col='red5', canvas=cv)
    for (x, y) in ((cx - 2, 70), (cx + 10, 72), (cx - 16, 73)):
        cv.px(x, y, 'gold3')
    for tx in (5, CAT_W - 4):
        cv.vline(tx, 74, 81, 'gold2'); cv.px(tx, 82, 'gold3'); cv.px(tx - 1, 82, 'gold1'); cv.px(tx + 1, 82, 'gold1')
    # body
    bm = ellipse_mask(CAT_W, CAT_H, cx, 56, 18, 15)
    paint(bm, G, R=12, spec=0.05, spec_col='white', canvas=cv)
    belly = ellipse_mask(CAT_W, CAT_H, cx - 2, 59, 7.5, 7)
    paint(belly, G[2:], R=6, amb=0.4, canvas=cv)
    # head + ears as one glossy shape
    hm = ellipse_mask(CAT_W, CAT_H, cx, 30, 20, 16.5)
    hm |= poly_mask(CAT_W, CAT_H, [(cx - 19, 26), (cx - 15, 6), (cx - 4, 16)])
    hm |= poly_mask(CAT_W, CAT_H, [(cx + 4, 16), (cx + 15, 6), (cx + 19, 26)])
    paint(hm, G, R=13, spec=0.05, spec_col='white', canvas=cv)
    cv.poly([(cx - 16, 21), (cx - 14, 10), (cx - 7, 17)], 'pink2')
    cv.poly([(cx + 7, 17), (cx + 14, 10), (cx + 16, 21)], 'pink1')
    cv.px(cx - 13, 14, 'pink3'); cv.px(cx - 13, 15, 'pink3')
    # antennae with pulsing lights
    pulse = _ease(f)
    for (x0, y0, x1, y1) in ((cx - 4, 15, cx - 9, 2), (cx + 4, 15, cx + 9, 2)):
        cv.line(x0, y0, x1, y1 + 2, G[1]); cv.line(x0 + 1, y0, x1 + 1, y1 + 2, G[2])
        r = 2.2 + pulse * 0.9
        orb = ellipse_mask(9, 9, 4.5, 4.5, r, r)
        paint(orb, [G[3], G[4], 'white'], R=2, amb=0.5, canvas=cv, ox=x1 - 4, oy=y1 - 4)
        if pulse > 0.6:
            for (dx, dy) in ((-4, 0), (4, 0), (0, -4), (0, 4)):
                cv.px(x1 + dx, y1 + dy, G[3])
    # eyes: big glossy almonds + third eye; blink on frame 5
    blink = f == 5
    for (ex, ey, rx, ry) in ((cx - 8, 31, 5.4, 4.8), (cx + 8, 31, 5.4, 4.8), (cx, 21, 3.0, 2.6)):
        if blink:
            cv.hline(int(ex - rx), int(ex + rx), int(ey + 1), G[0])
            cv.hline(int(ex - rx + 1), int(ex + rx - 1), int(ey + 2), G[0])
            continue
        cv.ellipse(ex, ey, rx + 0.8, ry + 0.8, G[0])
        cv.ellipse(ex, ey, rx, ry, 'ink')
        cv.ellipse(ex + rx * 0.25, ey + ry * 0.35, rx * 0.55, ry * 0.4, 'teal1')
        cv.px(int(ex - rx * 0.4), int(ey - ry * 0.45), 'white')
        cv.px(int(ex - rx * 0.4) + 1, int(ey - ry * 0.45), 'white')
        cv.px(int(ex - rx * 0.4), int(ey - ry * 0.45) + 1, 'white')
        cv.px(int(ex + rx * 0.35), int(ey + ry * 0.3), 'teal3')
    # nose, mouth, whiskers (painted on, like a real figurine), blush
    cv.px(cx, 37, 'pink2'); cv.px(cx - 1, 37, 'pink3')
    for (dx, dy) in ((-3, 38), (-2, 39), (-1, 39), (0, 38), (1, 39), (2, 39), (3, 38)):
        cv.px(cx + dx, dy, G[0])
    for (x0, x1, y0, y1) in ((cx - 22, cx - 13, 34, 36), (cx - 22, cx - 13, 39, 38), (cx + 13, cx + 22, 36, 34),
                             (cx + 13, cx + 22, 38, 39)):
        cv.line(x0, y0, x1, y1, G[1])
    for (bx, by) in ((cx - 14, 37), (cx + 13, 37)):
        cv.ellipse(bx, by, 2.6, 1.4, 'pink2')
    # collar with a glossy gold bell
    cv.hline(cx - 15, cx + 15, 44, 'red4'); cv.hline(cx - 15, cx + 15, 45, 'red3'); cv.hline(cx - 14, cx + 14, 46, 'red2')
    bell = ellipse_mask(9, 9, 4.5, 4.5, 4, 4)
    paint(bell, O.BRASS, R=3, spec=0.15, spec_col='gold4', canvas=cv, ox=cx - 4, oy=45)
    cv.hline(cx - 2, cx + 2, 50, 'gold0'); cv.px(cx, 51, 'gold0')
    # koban coin with an alien glyph; the glint travels across it
    coin = ellipse_mask(16, 22, 8, 11, 7, 10.5)
    paint(coin, O.BRASS, R=5, spec=0.06, spec_col='gold4', canvas=cv, ox=cx + 6, oy=48)
    ccx, ccy = cx + 14, 59
    for a in range(0, 360, 20):
        cv.px(int(round(ccx + math.cos(math.radians(a)) * 3)), int(round(ccy + math.sin(math.radians(a)) * 4)), 'gold1')
    cv.px(ccx, ccy, 'gold1'); cv.px(ccx, ccy - 7, 'gold1'); cv.px(ccx, ccy + 7, 'gold1')
    gy = 50 + int(_ease(f) * 16)
    cv.px(ccx - 4, gy, 'white'); cv.px(ccx - 3, gy + 1, 'gold4'); cv.px(ccx - 5, gy + 1, 'gold4')
    paw = ellipse_mask(10, 8, 5, 4, 4.6, 3.6)
    paint(paw, G[1:], R=3, amb=0.4, canvas=cv, ox=cx + 2, oy=63)
    cv.px(cx + 5, 66, 'pink2'); cv.px(cx + 7, 66, 'pink2')
    # beckoning arm on its own layer so it reads apart from the head
    arm = Canvas(CAT_W, CAT_H)
    t = _ease(f)
    sx, sy = cx - 15, 47
    px_, py_ = cx - 23, 24 + t * 7
    am = Canvas(CAT_W, CAT_H)
    for k in range(11):
        u = k / 10
        am.ellipse(sx + (px_ - sx) * u, sy + (py_ - sy) * u, 5.4 - u * 0.6, 5.4 - u * 0.6, 'white')
    am.ellipse(px_, py_ - 1, 6, 5.2, 'white')
    amask = mask_of(am)
    paint(amask, G, R=4, spec=0.06, spec_col='white', canvas=arm)
    curl = int(t * 2)                                       # fingers curl as the paw dips
    for (dx, dy) in ((-3, -4 + curl), (0, -5 + curl), (3, -4 + curl)):
        arm.px(int(px_) + dx, int(py_) + dy, 'pink3'); arm.px(int(px_) + dx + 1, int(py_) + dy, 'pink2')
    arm.ellipse(px_, py_ + 0.5, 2.4, 1.8, 'pink2')
    arm.outline(G[0], selective=False)
    cv.blit(arm, 0, 0)
    return O.outline(cv)


@prop('alien_lucky_cat', 3, 'counter', 1796, COUNTER_Y - CAT_H - 1,
      'Green alien maneki-neko (glossy ceramic): beckoning paw, pulsing antennae, blink, coin glint (8 frames)', fps=8)
def alien_cat_prop():
    return [alien_cat(f) for f in range(F8)]
