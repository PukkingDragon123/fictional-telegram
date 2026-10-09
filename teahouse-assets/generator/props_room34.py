"""Room 3 (tea ritual) and room 4 (traveler's bedroom) props, plus the
green alien lucky cat."""
import math
import random
from pixel import Canvas, PAL, step, scribble, text
from shapes import torn_paper, pin, wood_grain_h, wood_grain_v, chip, cobweb, crack, flower
from propkit import (prop, finish, box, cylinder, ellipse_ring, label, glyph, leafy_plant, clay_pot,
                     paper_note)
from counter import DRAWERS

COUNTER_Y = 222
SHELF3_Y = 122


# ================================================================ room 3
@prop('corkboard', 3, 'wall', 978, 48, 'Corkboard for orders and notes; red string between pins')
def corkboard():
    rng = random.Random(400)
    w, h = 176, 92
    cv = Canvas(w, h)
    cv.rect(0, 0, w, h, 'wood4')
    for _ in range(w * h // 9):   # cork grain: little clusters
        x, y = rng.randint(0, w - 2), rng.randint(0, h - 2)
        c = rng.choice(('wood3', 'wood5', 'wood3', 'gold1'))
        cv.px(x, y, c)
        if rng.random() < 0.4:
            cv.px(x + 1, y, c)
    for _ in range(40):   # old pin holes
        cv.px(rng.randint(6, w - 6), rng.randint(6, h - 6), 'wood1')
    # pale squares where notes used to be
    for (x, y, ww, hh) in ((120, 54, 20, 24), (60, 60, 16, 18)):
        for yy in range(y, y + hh):
            for xx in range(x, x + ww):
                if (xx + yy) % 2 == 0:
                    cv.shift(xx, yy, 1, only=('wood',))
    f = 5
    for i in range(f):
        cv.frame(i, i, w - 2 * i, h - 2 * i, ['wood0', 'wood2', 'wood3', 'wood2', 'wood1'][i])
    cv.hline(1, w - 2, 1, 'wood4')
    # red string linking the pins of the notes placed on it
    pins = [(18, 10), (52, 12), (92, 10), (132, 14), (36, 50), (100, 52), (150, 48)]
    for a, b in ((0, 4), (4, 5), (5, 2), (5, 6), (1, 3)):
        (x0, y0), (x1, y1) = pins[a], pins[b]
        cv.line(x0, y0 + 2, x1, y1 + 2, 'red3')
    chip(cv, 60, h - 5, 14, 5, rng, under='wood2', under_dark='wood0', n=2, elong=0.6)
    return cv


def _note(seed, w, h, draw, pin_c='red3', base='paper3'):
    rng = random.Random(seed)
    cv = paper_note(rng, w, h, base=base, pin_c=pin_c, lines=False)
    draw(cv, rng, w, h)
    return cv


def _receipt(cv, rng, w, h):
    for y in range(6, h - 4, 3):
        scribble(cv, rng, 2, y, w - 8, 'wood1')
        text(cv, w - 6, y - 2, str(rng.randint(1, 9)), 'wood1') if y % 2 else None
    cv.hline(2, w - 3, h - 5, 'red2')


def _sketch_customer(cv, rng, w, h):
    # a mushroom-hatted spirit customer doodle (graphite)
    cx = w // 2
    cv.ellipse(cx, 10, 9, 4, 'paper1')
    for (dx, dy) in ((-5, 9), (0, 8), (4, 10), (-2, 11)):
        cv.px(cx + dx, dy, 'paper4')
    cv.ellipse(cx, 16, 4, 4, 'paper2')
    cv.px(cx - 2, 16, 'wood0'); cv.px(cx + 2, 16, 'wood0')
    cv.line(cx - 6, 24, cx - 3, 20, 'paper1'); cv.line(cx + 6, 24, cx + 3, 20, 'paper1')
    text(cv, 3, h - 6, '?', 'red2')


def _map_scrap(cv, rng, w, h):
    pts = [(4, h - 6), (10, h - 12), (16, h - 9), (22, 8)]
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        n = max(abs(x1 - x0), abs(y1 - y0))
        for k in range(0, n, 2):
            cv.px(x0 + (x1 - x0) * k // n, y0 + (y1 - y0) * k // n, 'red2')
    x, y = pts[-1]
    cv.line(x - 2, y - 2, x + 2, y + 2, 'red3'); cv.line(x - 2, y + 2, x + 2, y - 2, 'red3')
    for k in range(5):
        cv.px(6 + k * 4, 6 + (k % 2), 'water1')   # coastline
    cv.line(3, 12, 8, 14, 'leaf2')


def _unpaid(cv, rng, w, h):
    text(cv, 3, 5, 'TAB', 'red2')
    cv.ellipse(w // 2, 17, 5, 5, 'paper2')
    cv.px(w // 2 - 2, 16, 'ink'); cv.px(w // 2 + 2, 16, 'ink'); cv.hline(w // 2 - 1, w // 2 + 1, 19, 'ink')
    for y in range(24, h - 3, 3):
        scribble(cv, rng, 3, y, w - 6, 'wood1')


def _photo(cv, rng, w, h):
    cv.rect(2, 4, w - 4, h - 12, 'wood2')
    cv.rect(3, 5, w - 6, (h - 14) // 2, 'paper1')
    cv.ellipse(w // 2, 5 + (h - 14) // 2, 4, 5, 'wood1')   # silhouette by a teapot
    cv.rect(w // 2 + 4, 8 + (h - 14) // 2, 4, 3, 'wood0')
    scribble(cv, rng, 3, h - 4, w - 6, 'wood1')


def _talisman(cv, rng, w, h):
    cv.rect(1, 2, w - 2, h - 1, 'paper4')
    for k in range(4):
        glyph(cv, rng, 2, 4 + k * 7, 5, 'ink')
    cv.rect(2, h - 8, 5, 5, 'red3'); cv.px(3, h - 7, 'red5')


NOTES = [('note_receipt', 990, 54, 14, 30, _receipt, 'red3', 'paper4'),
         ('note_sketch_customer', 1020, 56, 26, 28, _sketch_customer, 'jade3', 'paper3'),
         ('note_unpaid_tab', 1058, 54, 22, 34, _unpaid, 'red3', 'paper3'),
         ('note_map_scrap', 1098, 56, 28, 22, _map_scrap, 'gold3', 'paper2'),
         ('note_photo', 1010, 94, 22, 30, _photo, 'sky2', 'paper4'),
         ('note_talisman', 1074, 96, 10, 36, _talisman, 'red3', 'paper4'),
         ('note_order_slip', 1118, 92, 20, 24, _receipt, 'jade3', 'paper3')]
for _i, (_n, _x, _y, _w, _h, _fn, _pc, _base) in enumerate(NOTES):
    def _mk(i=_i, w=_w, h=_h, fn=_fn, pc=_pc, base=_base):
        return _note(410 + i, w, h, fn, pc, base)
    prop(_n, 3, 'wall', _x, _y, 'Worn paper note pinned to the corkboard')(_mk)


@prop('kakejiku_scroll', 3, 'wall', 1162, 28, 'Hanging scroll: ink plum branch, water-stained, torn corner')
def scroll():
    rng = random.Random(420)
    w, h = 38, 112
    cv = Canvas(w, h)
    cv.line(19, 0, 4, 6, 'paper1'); cv.line(19, 0, 33, 6, 'paper1')
    cylinder(cv, 1, 6, 36, 4, ['wood1', 'wood2', 'wood3'])
    cv.rect(3, 10, 32, 92, 'jade2')
    cv.vline(3, 10, 101, 'jade3'); cv.vline(34, 10, 101, 'jade1')
    cv.rect(7, 18, 24, 76, 'paper3')
    for yy in range(18, 94):
        for xx in range(7, 31):
            if (xx * 3 + yy * 7) % 23 == 0:
                cv.px(xx, yy, 'paper2')
    # ink plum branch
    pts = [(9, 88), (14, 70), (12, 56), (20, 40), (26, 26)]
    for i in range(len(pts) - 1):
        cv.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 'ink')
        cv.line(pts[i][0] + 1, pts[i][1], pts[i + 1][0] + 1, pts[i + 1][1], 'stone1')
    cv.line(14, 62, 24, 58, 'ink'); cv.line(18, 44, 10, 36, 'ink')
    for (x, y) in ((24, 57), (10, 35), (26, 25), (21, 39), (13, 66), (16, 50)):
        flower(cv, x, y, 'pink2', 'gold2')
    for k in range(3):
        glyph(cv, rng, 23, 66 + k * 7, 5, 'ink')
    cv.rect(23, 87, 4, 4, 'red3'); cv.px(24, 88, 'red5')
    # water stain + torn corner
    for yy in range(70, 94):
        for xx in range(7, 18):
            if (xx + yy) % 2 == 0 and (xx - 7) + (94 - yy) < 22:
                cv.shift(xx, yy, -1, only=('paper',))
    for k in range(6):
        cv.rect(29 - k, 94 - (6 - k), k + 2, 1, None)
    cylinder(cv, 0, 102, 38, 5, ['wood1', 'wood2', 'wood3'])
    cv.rect(0, 102, 2, 5, 'gold2'); cv.rect(36, 102, 2, 5, 'gold2')
    return finish(cv)


@prop('wall_cabinet', 3, 'wall', 1250, 22, 'Two-door storage cabinet, faded jade doors; left door ajar')
def cabinet():
    rng = random.Random(430)
    w, h = 162, 80
    cv = Canvas(w, h)
    box(cv, 0, 4, w, h - 4, 'wood2')
    cv.rect(-1, 0, w + 2, 6, 'wood3'); cv.hline(0, w - 1, 0, 'wood5'); cv.hline(0, w - 1, 5, 'wood1')
    cv.rect(2, 2, w - 4, 2, 'gold1'); cv.hline(2, w - 3, 2, 'gold2')
    dw = (w - 12) // 2
    for i in range(2):
        x = 5 + i * (dw + 2)
        if i == 0:
            # ajar: dark interior with jars, door swung (narrow, foreshortened)
            cv.rect(x, 9, dw, h - 16, 'wood0')
            for k in range(3):
                cv.rect(x + 2, 9 + k * 21, dw - 4, 2, 'wood2')
            for k in range(6):   # jars and bottles in the gloom
                jx = x + 14 + k * 10
                body = rng.choice((('stone0', 'stone1', 'stone2'), ('jade0', 'jade1', 'jade2'), ('red0', 'red1', 'red2')))
                if k % 3 == 1:
                    cylinder(cv, jx + 2, 12, 3, 4, list(body))
                    cylinder(cv, jx, 16, 7, 13, list(body))
                else:
                    cylinder(cv, jx, 17, 8, 12, list(body))
                    cv.rect(jx + 1, 15, 6, 2, 'wood1')
            for k in range(3):   # folded cloths
                cy_ = 50 - k * 3
                cv.rect(x + 18, cy_, 22, 3, ('paper1', 'jade1', 'red1')[k])
                cv.hline(x + 18, x + 39, cy_, ('paper2', 'jade2', 'red2')[k])
            cv.ellipse(x + 56, 48, 7, 4, 'stone1'); cv.hline(x + 50, x + 62, 46, 'stone2')
            for k in range(4):   # bowls on the bottom shelf
                cv.rect(x + 14 + k * 14, 66, 11, 4, 'paper1')
                cv.hline(x + 14 + k * 14, x + 24 + k * 14, 66, 'paper2')
            # the door swung toward us: a narrow, foreshortened panel
            door = Canvas(14, h - 12)
            for yy in range(h - 12):
                for xx in range(14):
                    if yy < xx * 0.25 or yy > h - 13 - xx * 0.25:
                        continue
                    door.px(xx, yy, 'jade3' if xx < 3 else ('jade2' if xx < 11 else 'jade1'))
            door.vline(0, 0, h - 13, 'jade4')
            door.vline(13, 3, h - 16, 'jade0')
            door.px(10, (h - 12) // 2, 'gold3'); door.px(10, (h - 12) // 2 + 1, 'gold1')
            cv.blit(door, x - 9, 7)
        else:
            box(cv, x, 9, dw, h - 16, 'jade2')
            cv.rect(x + 6, 15, dw - 12, h - 28, 'jade1')
            cv.hline(x + 6, x + dw - 7, 15, 'jade0')
            cv.vline(x + 6, 15, h - 14, 'jade0')
            cv.hline(x + 7, x + dw - 7, h - 14, 'jade3')
            cv.vline(x + dw - 7, 16, h - 14, 'jade3')
            for _ in range(5):
                chip(cv, x + rng.randint(2, dw - 12), rng.randint(10, h - 22), rng.randint(5, 10),
                     rng.randint(6, 12), rng, under='wood3', under_dark='wood1', n=3, elong=1.4)
            cv.rect(x + 3, 30, 3, 6, 'gold2'); cv.px(x + 3, 30, 'gold4')
            cv.rect(x + 3, h - 30, 3, 6, 'gold1')
            cv.ellipse(x + 4, (h + 4) // 2, 2, 2, 'gold2'); cv.px(x + 3, (h + 2) // 2, 'gold4')
    cv.rect(0, h - 6, w, 6, 'wood3'); cv.hline(0, w - 1, h - 6, 'wood4'); cv.hline(0, w - 1, h - 1, 'wood1')
    cobweb(cv, w - 2, 7, 14, 'stone3', 'stone2', 'tr')
    return finish(cv)


@prop('teaware_shelf', 3, 'wall', 1244, SHELF3_Y, 'Open shelf for teaware')
def teaware_shelf():
    rng = random.Random(440)
    cv = Canvas(178, 12)
    wood_grain_h(cv, 0, 0, 178, 4, 'wood3', rng, dark='wood2', light='wood4')
    cv.hline(0, 177, 0, 'wood5'); cv.hline(0, 177, 4, 'wood1')
    for bx in (8, 84, 164):
        for k in range(7):
            cv.hline(bx, bx + max(1, 6 - k), 5 + k, 'wood2')
            cv.px(bx, 5 + k, 'wood3')
    return finish(cv)


@prop('teapot_jade', 3, 'wall', 1252, SHELF3_Y - 16, 'Glazed jade teapot (shelf)')
def teapot_jade():
    return finish(_teapot(['jade0', 'jade1', 'jade2', 'jade3', 'jade4'], 24, 16))


def _teapot(ramp, w, h, side_handle=False):
    cv = Canvas(w, h)
    cx, cy = w // 2 - 1, h // 2 + 2
    rx, ry = w * 0.32, h * 0.36
    cv.ellipse(cx, cy, rx, ry, ramp[2])
    for yy in range(h):
        for xx in range(w):
            if cv.get(xx, yy)[3]:
                u = (xx - (cx - rx)) / (2 * rx)
                v = (yy - (cy - ry)) / (2 * ry)
                if u < 0.3 and v < 0.6:
                    cv.px(xx, yy, ramp[3])
                if u > 0.72 or v > 0.82:
                    cv.px(xx, yy, ramp[1])
    cv.px(int(cx - rx * 0.5), int(cy - ry * 0.4), ramp[4])
    cv.px(int(cx - rx * 0.5) + 1, int(cy - ry * 0.5), ramp[4])
    # lid + knob
    cv.ellipse(cx, cy - ry + 1, rx * 0.55, 1.5, ramp[3])
    cv.rect(cx - 1, int(cy - ry) - 2, 3, 2, ramp[2]); cv.px(cx - 1, int(cy - ry) - 2, ramp[4])
    # spout (right) + handle
    sx = int(cx + rx)
    cv.line(sx - 1, cy, w - 2, cy - ry + 1, ramp[2])
    cv.line(sx - 1, cy + 1, w - 2, cy - ry + 2, ramp[1])
    cv.px(w - 1, int(cy - ry), ramp[3])
    if side_handle:   # kyusu: straight side handle sticking back-left
        cv.line(int(cx - rx), cy - 1, 1, cy - 3, ramp[2])
        cv.line(int(cx - rx), cy, 1, cy - 2, ramp[1])
    else:
        for a in range(90, 271, 8):
            cv.px(int(cx - rx) + int(round(math.cos(math.radians(a)) * 3)),
                  cy + int(round(math.sin(math.radians(a)) * 3)), ramp[1])
    return cv


@prop('teacup_stack', 3, 'wall', 1282, SHELF3_Y - 12, 'Stack of handleless teacups')
def cup_stack():
    cv = Canvas(12, 12)
    for i, y in enumerate((8, 4, 0)):
        cv.rect(1, y, 10, 4, 'paper3')
        cv.hline(1, 10, y, 'paper4')
        cv.hline(2, 9, y + 3, 'paper1')
        cv.vline(1, y, y + 3, 'paper4')
        cv.hline(2, 9, y + 1, 'red3' if i == 1 else 'sky2')
    return finish(cv)


@prop('jar_honey', 3, 'wall', 1300, SHELF3_Y - 14, 'Honey pot with a dipper')
def honey():
    cv = Canvas(14, 16)
    cv.ellipse(7, 10, 6, 6, 'gold2')
    for yy in range(4, 16):
        for xx in range(14):
            if cv.get(xx, yy)[3] and xx > 9:
                cv.px(xx, yy, 'gold1')
            elif cv.get(xx, yy)[3] and xx < 4:
                cv.px(xx, yy, 'gold3')
    cv.rect(3, 4, 8, 2, 'paper3')
    cv.line(9, 0, 7, 6, 'wood3')
    cv.px(4, 8, 'gold4')
    cv.vline(10, 6, 9, 'gold3')
    return finish(cv)


@prop('daruma_doll', 3, 'wall', 1320, SHELF3_Y - 13, 'Red daruma with one eye filled in (a wish not yet granted)')
def daruma():
    cv = Canvas(12, 13)
    cv.ellipse(6, 7, 5.5, 6, 'red3')
    for yy in range(13):
        for xx in range(12):
            if cv.get(xx, yy)[3]:
                if xx > 7:
                    cv.px(xx, yy, 'red2')
                if xx < 3 and yy < 8:
                    cv.px(xx, yy, 'red4')
    cv.ellipse(6, 5, 3, 2.5, 'paper4')
    cv.px(4, 5, 'ink')            # one eye painted
    cv.px(8, 5, 'paper3')         # other blank
    cv.hline(5, 7, 7, 'red1')
    cv.hline(3, 9, 10, 'gold2')
    return finish(cv)


@prop('tin_caddy_gold', 3, 'wall', 1338, SHELF3_Y - 14, 'Gold-banded tea tin')
def tin_gold():
    rng = random.Random(450)
    cv = Canvas(12, 14)
    cylinder(cv, 0, 2, 12, 12, ['wood1', 'wood2', 'wood3'], hi='wood4')
    cylinder(cv, 0, 0, 12, 2, ['gold1', 'gold2', 'gold3'])
    cylinder(cv, 0, 6, 12, 3, ['gold1', 'gold2', 'gold3'])
    glyph(cv, rng, 4, 9, 4, 'gold3')
    return finish(cv)


@prop('bowl_matcha_stack', 3, 'wall', 1356, SHELF3_Y - 9, 'Two matcha bowls stacked')
def bowls3():
    cv = Canvas(18, 9)
    for i, (y, w) in enumerate(((4, 18), (0, 16))):
        x = (18 - w) // 2
        for yy in range(5):
            inset = yy // 2
            cv.hline(x + inset, x + w - 1 - inset, y + yy, 'wood1' if i else 'stone1')
        cv.hline(x, x + w - 1, y, 'wood3' if i else 'stone3')
        cv.hline(x + 1, x + w - 2, y + 1, 'jade2')
    return finish(cv)


@prop('whisk_stand', 3, 'wall', 1380, SHELF3_Y - 14, 'Chasen whisk resting on its ceramic stand')
def whisk_stand():
    cv = Canvas(10, 14)
    cv.rect(2, 9, 6, 5, 'paper3'); cv.hline(2, 7, 9, 'paper4')
    for x in range(1, 9):
        cv.vline(x, 2, 9, 'gold3' if x % 2 else 'gold2')
    cv.rect(3, 0, 4, 3, 'gold2')
    return finish(cv)


# counter top
@prop('teapot_kyusu', 3, 'counter', 1006, COUNTER_Y - 18, 'Kyusu teapot with side handle (chipped)')
def kyusu():
    cv = _teapot(['wood0', 'red1', 'red2', 'red3', 'red4'], 28, 18, side_handle=True)
    cv.px(12, 6, None); cv.px(13, 6, 'paper1')
    return finish(cv)


@prop('chawan_matcha', 3, 'counter', 1046, COUNTER_Y - 10, 'Tea bowl with whisked matcha')
def chawan():
    cv = Canvas(18, 10)
    for yy in range(10):
        inset = int((yy / 10) ** 2 * 5)
        for xx in range(inset, 18 - inset):
            u = (xx - inset) / (18 - 2 * inset)
            cv.px(xx, yy, 'stone3' if u < 0.3 else ('stone2' if u < 0.75 else 'stone1'))
    cv.hline(1, 16, 0, 'stone4')
    cv.hline(2, 15, 1, 'leaf3'); cv.hline(3, 14, 2, 'leaf4')
    cv.px(6, 1, 'leaf5'); cv.px(10, 2, 'leaf5')
    cv.hline(3, 14, 5, 'wood2')     # drip glaze
    cv.px(5, 6, 'wood2'); cv.px(11, 7, 'wood2')
    return finish(cv)


@prop('chasen_whisk', 3, 'counter', 1068, COUNTER_Y - 14, 'Bamboo matcha whisk')
def chasen():
    cv = Canvas(10, 14)
    cv.rect(3, 0, 4, 6, 'gold2'); cv.vline(3, 0, 5, 'gold3'); cv.vline(6, 0, 5, 'gold1')
    for x in range(0, 10):
        cv.line(5, 6, x, 13, 'gold3' if x < 5 else 'gold1')
    cv.hline(0, 9, 13, 'gold0')
    return finish(cv)


@prop('natsume_caddy', 3, 'counter', 1084, COUNTER_Y - 12, 'Black lacquer natsume tea caddy with gold maple')
def natsume():
    cv = Canvas(12, 12)
    cylinder(cv, 0, 2, 12, 10, ['ink', 'ink1', 'stone1'], hi='stone2')
    cv.ellipse(6, 2, 6, 2, 'ink1')
    cv.hline(0, 11, 5, 'stone0')
    for (x, y) in ((6, 8), (5, 7), (7, 7), (6, 9), (4, 8), (8, 8)):
        cv.px(x, y, 'gold3')
    cv.px(9, 6, 'red3')
    return finish(cv)


@prop('chashaku_scoop', 3, 'counter', 1100, COUNTER_Y - 4, 'Bamboo tea scoop')
def chashaku():
    cv = Canvas(18, 4)
    cv.hline(0, 14, 2, 'gold2'); cv.hline(0, 14, 1, 'gold3')
    cv.rect(14, 0, 3, 3, 'gold2'); cv.px(14, 0, 'gold3')
    cv.px(7, 1, 'gold1')
    return finish(cv)


@prop('serving_tray', 3, 'counter', 1120, COUNTER_Y - 12, 'Lacquer serving tray with two cups')
def tray():
    cv = Canvas(54, 12)
    cv.rect(0, 7, 54, 5, 'red2'); cv.hline(0, 53, 7, 'red4'); cv.hline(1, 52, 8, 'red3')
    cv.hline(0, 53, 11, 'red0'); cv.px(3, 9, 'gold2'); cv.px(50, 9, 'gold2')
    for x in (12, 32):
        for yy in range(8):
            inset = yy // 3
            cv.hline(x + inset, x + 9 - inset, yy, 'paper3' if yy else 'paper4')
        cv.hline(x, x + 9, 0, 'leaf3')
        cv.hline(x + 1, x + 8, 3, 'jade2')
    return finish(cv)


@prop('incense_burner', 3, 'counter', 1218, COUNTER_Y - 30, 'Bronze incense burner with curling smoke (4 frames)', fps=5)
def incense():
    frames = []
    for f in range(4):
        cv = Canvas(18, 30)
        cv.ellipse(9, 24, 7, 4, 'gold1')
        cv.rect(2, 20, 15, 4, 'gold1')
        cv.hline(2, 16, 20, 'gold3'); cv.px(4, 22, 'gold3')
        cv.rect(4, 27, 2, 3, 'gold0'); cv.rect(12, 27, 2, 3, 'gold0')
        cv.px(13, 23, 'teal2')
        cv.vline(9, 12, 19, 'wood2'); cv.px(9, 11, 'fire2')
        for j in range(11):
            x = 9 + math.sin(j * 0.6 + f * 1.57) * (j * 0.25)
            if (j + f) % 5 != 4:
                cv.px(int(round(x)), 10 - j, 'cloud2' if j < 6 else 'cloud1')
        frames.append(finish(cv))
    return frames


@prop('candle', 3, 'counter', 1298, COUNTER_Y - 22, 'Melted candle stub with flickering flame (4 frames)', fps=8)
def candle():
    frames = []
    for f in range(4):
        cv = Canvas(10, 22)
        cylinder(cv, 2, 10, 6, 11, ['paper2', 'paper3', 'paper4'])
        cv.vline(1, 13, 16, 'paper3'); cv.px(8, 12, 'paper3'); cv.vline(8, 12, 15, 'paper2')   # drips
        cv.rect(0, 20, 10, 2, 'gold1'); cv.hline(0, 9, 20, 'gold2')
        cv.vline(5, 8, 10, 'ink')
        fl = [(5, 7), (5, 6), (5, 5), (4, 6), (5, 4)]
        off = [0, 1, 0, -1][f]
        hgt = [4, 5, 4, 3][f]
        for k in range(hgt):
            cv.px(5 + (off if k > 1 else 0), 8 - k - 1, 'fire3' if k < 1 else ('fire2' if k < 3 else 'fire1'))
        cv.px(4, 7, 'fire1'); cv.px(6, 7, 'fire1')
        frames.append(finish(cv))
    return frames


def _journal(open_=False):
    rng = random.Random(460)
    if not open_:
        cv = Canvas(26, 9)
        box(cv, 0, 0, 26, 7, 'red2')
        cv.rect(2, 7, 23, 2, 'paper3'); cv.hline(2, 24, 8, 'paper1')
        cv.vline(4, 0, 6, 'red1'); cv.vline(5, 0, 6, 'red3')
        cv.rect(12, 2, 8, 3, 'gold2'); cv.px(12, 2, 'gold3')
        cv.vline(20, 0, 8, 'jade3')     # ribbon bookmark
        return cv
    cv = Canvas(46, 16)
    cv.poly([(0, 14), (3, 2), (22, 4), (22, 15)], 'paper4')
    cv.poly([(24, 15), (24, 4), (43, 2), (46, 14)], 'paper3')
    cv.rect(22, 3, 2, 13, 'paper1')
    for y in range(5, 13, 2):
        scribble(cv, rng, 5, y, 15, 'wood1')
        scribble(cv, rng, 26, y, 15, 'wood1')
    cv.ellipse(34, 9, 3, 2.5, 'leaf3')    # pressed leaf
    cv.px(33, 8, 'leaf4')
    cv.hline(0, 46, 15, 'red1')
    return cv


@prop('journal_closed', 3, 'counter', 1150, COUNTER_Y - 9, "Keeper's journal (closed) - lives in the drawer",
      preview=False)
def journal_closed():
    return finish(_journal(False))


@prop('journal_open', 3, 'counter', 1150, COUNTER_Y - 16, "Keeper's journal lying open, pressed leaf inside",
      preview=False)
def journal_open():
    return finish(_journal(True))


@prop('drawer_open', 3, 'counter', DRAWERS[0][0] - 6, DRAWERS[0][1] - 4,
      'Drawer pulled open with the journal inside - swap in over the closed drawer', drag=False)
def drawer_open():
    rng = random.Random(470)
    dx, dy, dw, dh = DRAWERS[0]
    cv = Canvas(dw + 12, dh + 14)
    # the drawer box, pulled toward the player: we see its inside floor
    cv.rect(0, 0, dw + 12, 8, 'wood1')
    cv.rect(2, 1, dw + 8, 6, 'wood0')
    j = _journal(False)
    cv.blit(j, 10, -1)
    cv.rect(40, 2, 10, 3, 'paper3')      # loose letters
    cv.px(53, 3, 'gold3')                # a coin
    box(cv, 0, 8, dw + 12, dh + 4, 'wood3')
    wood_grain_h(cv, 1, 9, dw + 10, dh + 2, 'wood3', rng, dark='wood2', light='wood4')
    cv.hline(0, dw + 11, 8, 'wood5')
    px_, py_ = (dw + 12) // 2 - 5, 8 + (dh + 4) // 2 - 1
    cv.rect(px_, py_, 10, 3, 'gold1'); cv.hline(px_, px_ + 9, py_, 'gold3')
    return finish(cv)


# ---------------------------------------------------------------- alien cat
def _alien_cat(f):
    """Maneki-neko from somewhere else: lime-green, cat ears AND antennae,
    three eyes, beckoning paw, holding a koban coin stamped with an alien
    glyph, sitting on a red cushion. f: 0..3 (paw beckons, antennae blink)."""
    G = ['alien0', 'alien1', 'alien2', 'alien3', 'alien4']
    cv = Canvas(30, 42)
    # cushion
    cv.rect(2, 35, 27, 6, 'red2')
    cv.hline(2, 28, 35, 'red4'); cv.hline(3, 27, 36, 'red3'); cv.hline(2, 28, 40, 'red0')
    for x in (2, 28):
        cv.vline(x, 39, 41, 'gold2'); cv.px(x, 41, 'gold3')
    # body, head, ears
    cv.ellipse(16, 29, 9, 7.5, G[2])
    cv.ellipse(16, 14.5, 9.5, 8, G[2])
    cv.poly([(7, 11), (9, 2), (14, 8)], G[2])
    cv.poly([(18, 8), (23, 2), (25.5, 11)], G[2])
    shape = {}
    for yy in range(42):
        for xx in range(30):
            if cv.get(xx, yy)[:3] == PAL[G[2]]:
                head = yy < 22
                cx_, cy_, rx_, ry_ = (16, 13, 10, 10) if head else (16, 29, 9, 7.5)
                u, v = (xx + 0.5 - cx_) / rx_, (yy + 0.5 - cy_) / ry_
                d = -0.62 * u - 0.78 * v
                if d > 0.62:
                    cv.px(xx, yy, G[4] if d > 0.95 else G[3])
                elif d > 0.3:
                    cv.px(xx, yy, G[3])
                elif d < -0.55:
                    cv.px(xx, yy, G[1])
    # inner ears
    cv.poly([(9, 9), (10, 4), (12.5, 8)], 'pink2')
    cv.poly([(19.5, 8), (22, 4), (23.5, 9.5)], 'pink1')
    cv.px(10, 6, 'pink3')
    # antennae between the ears, tips blink
    on = f % 2 == 0
    for (x0, y0, x1, y1) in ((14, 7, 12, 1), (18, 7, 20, 1)):
        cv.line(x0, y0, x1, y1 + 1, G[1])
        cv.ellipse(x1, y1, 1.6, 1.6, G[4] if on else G[3])
        cv.px(x1 - 1, y1 - 1, 'white' if on else G[4])
    # three eyes: two big almonds + a small one on the forehead
    for (ex, ey, rx, ry) in ((12.5, 15, 2.6, 2.3), (20, 15, 2.6, 2.3), (16.2, 10.5, 1.6, 1.3)):
        cv.ellipse(ex, ey, rx, ry, 'ink')
        cv.px(int(ex - rx * 0.45), int(ey - ry * 0.5), 'white')
        cv.px(int(ex - rx * 0.45) + 1, int(ey - ry * 0.5) + 1, 'teal3')
    # nose, cat mouth, whiskers, blush
    cv.px(16, 18, 'pink2')
    cv.px(15, 19, G[0]); cv.px(17, 19, G[0]); cv.px(14, 18, G[0]); cv.px(18, 18, G[0])
    for (x0, x1, y) in ((7, 9, 17), (7, 9, 19), (23, 25, 17), (23, 25, 19)):
        cv.hline(x0, x1, y, G[1])
    cv.px(10, 18, 'pink2'); cv.px(11, 18, 'pink3'); cv.px(21, 18, 'pink2'); cv.px(22, 18, 'pink2')
    # belly
    cv.ellipse(15, 30, 5, 4.5, G[3])
    cv.px(13, 28, G[4])
    # collar + bell
    cv.hline(9, 23, 22, 'red4'); cv.hline(9, 23, 23, 'red3'); cv.hline(10, 22, 24, 'red2')
    cv.ellipse(16, 25.5, 2.2, 2.2, 'gold2')
    cv.px(15, 24, 'gold4'); cv.hline(15, 17, 26, 'gold0'); cv.px(16, 27, 'gold0')
    # koban coin with an alien glyph, held by the other paw
    cv.ellipse(22, 30, 3.6, 5.2, 'gold3')
    for yy in range(24, 36):
        for xx in range(18, 27):
            if cv.get(xx, yy)[:3] == PAL['gold3'] and xx > 23:
                cv.px(xx, yy, 'gold2')
    ellipse_ring(cv, 22, 30, 1.6, 2.2, 'gold1')
    cv.px(22, 30, 'gold1'); cv.px(22, 26, 'gold1'); cv.px(22, 34, 'gold1')
    cv.px(20, 26, 'gold4'); cv.px(20, 27, 'gold4')
    cv.ellipse(18.5, 33, 2.4, 2, G[3]); cv.px(18, 34, 'pink2')
    # beckoning paw: its own sprite with its own outline, so it reads apart
    arm = Canvas(30, 42)
    poses = [(5, 7), (4, 10), (6, 13), (4, 10)]
    px_, py_ = poses[f]
    sx, sy = 9, 27
    for k in range(9):
        t = k / 8
        arm.ellipse(sx + (px_ - sx) * t, sy + (py_ - sy) * t, 2.5, 2.5, G[2] if k < 8 else G[3])
    for k in range(1, 8):   # lit edge along the forearm
        t = k / 8
        arm.px(int(sx + (px_ - sx) * t) - 1, int(sy + (py_ - sy) * t), G[3])
    arm.ellipse(px_, py_, 3, 2.8, G[3])
    arm.px(px_ - 1, py_ - 1, G[4])
    arm.px(px_ - 2, py_ - 2, 'pink3'); arm.px(px_, py_ - 3, 'pink3'); arm.px(px_ + 2, py_ - 2, 'pink3')
    arm.px(px_, py_, 'pink2'); arm.px(px_ - 1, py_ + 1, 'pink2'); arm.px(px_ + 1, py_ + 1, 'pink2')
    arm.outline(G[0], selective=False)
    cv.blit(arm, 0, 0)
    return finish(cv)


@prop('alien_lucky_cat', 3, 'counter', 1360, COUNTER_Y - 42, 'Green alien maneki-neko: beckoning paw, blinking antennae (4 frames)', fps=4)
def alien_cat():
    return [_alien_cat(f) for f in range(4)]


# ================================================================ room 4
@prop('noren_curtain', 4, 'ceiling', 1448, 19, 'Torn jade noren curtain at the bedroom doorway (4-frame sway)', fps=4)
def noren():
    rng = random.Random(500)
    frames = []
    tears = [rng.randint(0, 3) for _ in range(30)]
    for f in range(4):
        cv = Canvas(90, 56)
        cylinder(cv, 0, 0, 90, 4, ['wood1', 'wood2', 'wood3'])
        for p in range(3):
            x0 = 2 + p * 29
            for xx in range(x0, x0 + 27):
                bottom = 52 - tears[(xx - x0) % 30] * (1 if p != 1 else 2) - (6 if p == 2 and xx > x0 + 18 else 0)
                sw = int(round(math.sin(2 * math.pi * f / 4 + p) * 1.0 * (1 if xx % 2 else 0)))
                for yy in range(4, bottom):
                    t = (yy - 4) / 48
                    off = int(round(math.sin(2 * math.pi * f / 4 + p * 1.3) * t * 1.5))
                    c = 'jade2'
                    if xx == x0:
                        c = 'jade3'
                    elif xx >= x0 + 25:
                        c = 'jade1'
                    if (xx - x0) % 9 == 4:
                        c = 'jade1'     # fold
                    cv.px(xx + off, yy, c)
                cv.px(xx + int(round(math.sin(2 * math.pi * f / 4 + p * 1.3) * 1.5)), bottom - 1, 'jade0')
        # white crest: a tea leaf in a circle across the middle panel seam
        cx, cy = 45, 24
        ellipse_ring(cv, cx, cy, 9, 9, 'paper4')
        for k in range(11):
            cv.px(cx - 5 + k, cy + 3 - k // 2, 'paper4')
        for k in range(2, 9):
            cv.px(cx - 5 + k, cy + 1 - k // 2 - (1 if 3 < k < 8 else 0), 'paper3')
        cv.rect(70, 30, 3, 2, None)    # moth holes
        cv.px(20, 40, None)
        frames.append(finish(cv))
    return frames


@prop('desk_messy', 4, 'floor', 1490, 148, 'Messy writing desk: papers, ink, map, candle stub, cold tea')
def desk():
    rng = random.Random(510)
    w, h = 140, 66
    cv = Canvas(w, h)
    top = 16
    # legs + drawers
    box(cv, 6, top + 6, 40, 22, 'wood2')
    for k in range(2):
        box(cv, 8, top + 8 + k * 10, 36, 9, 'wood3')
        cv.px(26, top + 12 + k * 10, 'gold3')
    cv.rect(8, top + 19, 36, 1, 'wood1')
    for lx in (8, 40, w - 12):
        if lx == 40:
            continue
        cv.rect(lx, top + 6, 6, h - top - 6, 'wood2')
        cv.vline(lx, top + 6, h - 1, 'wood3')
        cv.vline(lx + 5, top + 6, h - 1, 'wood1')
    cv.rect(46, top + 6, w - 58, 3, 'wood1')
    # top
    wood_grain_h(cv, 0, top, w, 6, 'wood3', rng, dark='wood2', light='wood4')
    cv.hline(0, w - 1, top, 'wood5'); cv.hline(0, w - 1, top + 5, 'wood1')
    # clutter on top
    for i in range(7):   # paper pile, uneven
        x = 10 + rng.randint(-2, 2) + i
        y = top - 2 - i
        cv.rect(x, y, 24, 2, 'paper3' if i % 2 else 'paper4')
        cv.hline(x, x + 23, y + 1, 'paper1')
    for _ in range(3):   # loose sheets hanging over the edge
        x = rng.randint(40, 110)
        cv.rect(x, top - 1, 16, 2, 'paper4')
        cv.rect(x + 3, top + 1, 10, 7, 'paper3')
        scribble(cv, rng, x + 4, top + 3, 8, 'wood1')
    # open book
    cv.poly([(44, top), (48, top - 6), (62, top - 5), (62, top)], 'paper4')
    cv.poly([(63, top), (63, top - 5), (77, top - 6), (80, top)], 'paper3')
    cv.vline(62, top - 6, top, 'paper1')
    # ink pot + brush
    cylinder(cv, 86, top - 6, 6, 6, ['ink', 'stone0', 'stone1'], hi='stone2')
    cv.line(90, top - 6, 96, top - 15, 'wood3'); cv.line(96, top - 15, 97, top - 16, 'ink')
    # candle stub with a wax puddle
    cv.ellipse(106, top - 1, 6, 1.5, 'paper3')
    cylinder(cv, 103, top - 7, 5, 6, ['paper2', 'paper3', 'paper4'])
    cv.vline(105, top - 9, top - 8, 'ink')
    # cold tea cup with a ring stain
    cv.rect(116, top - 6, 8, 6, 'paper3'); cv.hline(116, 123, top - 6, 'wood2')
    ellipse_ring(cv, 130, top + 2, 4, 1.4, 'wood2')
    # compass + rolled map
    cv.ellipse(132, top - 2, 3, 2, 'gold2'); cv.px(132, top - 2, 'red3')
    cylinder(cv, 66, top - 3, 20, 3, ['paper1', 'paper2', 'paper3'])
    cv.px(66, top - 2, 'paper0')
    return finish(cv)


@prop('chair_wood', 4, 'floor', 1604, 172, 'Wooden chair pushed back, scarf draped over it')
def chair():
    cv = Canvas(30, 46)
    for x in (2, 22):
        cv.rect(x, 0, 4, 46, 'wood2'); cv.vline(x, 0, 45, 'wood3'); cv.vline(x + 3, 0, 45, 'wood1')
    for y in (4, 12):
        cv.rect(2, y, 24, 3, 'wood3'); cv.hline(2, 25, y, 'wood4')
    cv.rect(0, 24, 30, 4, 'wood3'); cv.hline(0, 29, 24, 'wood5'); cv.hline(0, 29, 27, 'wood1')
    cv.rect(4, 36, 22, 2, 'wood1')
    # scarf
    for yy in range(3, 34):
        x = 6 + int(math.sin(yy * 0.3) * 1.5)
        cv.hline(x, x + 4, yy, 'red4' if yy % 6 < 3 else 'red3')
        cv.px(x + 4, yy, 'red2')
    cv.hline(5, 11, 34, 'gold2')
    return finish(cv)


@prop('bookshelf', 4, 'floor', 1638, 30, 'Leaning bookshelf: crooked books, scrolls, jar plant, cobweb')
def bookshelf():
    rng = random.Random(520)
    w, h = 66, 160
    cv = Canvas(w, h)
    box(cv, 0, 0, w, h, 'wood2')
    cv.rect(4, 4, w - 8, h - 8, 'wood0')
    shelves = [4, 40, 76, 112, 148]
    for sy in shelves[1:]:
        cv.rect(2, sy, w - 4, 4, 'wood3'); cv.hline(2, w - 3, sy, 'wood4'); cv.hline(2, w - 3, sy + 3, 'wood1')
    # one shelf board broken and sagging
    cv.rect(2, 76, w - 4, 4, 'wood0')
    cv.line(2, 76, 32, 82, 'wood3'); cv.line(2, 77, 32, 83, 'wood2')
    cv.line(34, 79, w - 3, 76, 'wood3'); cv.line(34, 80, w - 3, 77, 'wood2')
    spines = ['red2', 'jade1', 'gold1', 'sky1', 'wood3', 'purp1', 'red1', 'paper2', 'leaf1', 'teal1']
    for si in range(4):
        base = shelves[si + 1] - 1
        x = 5
        while x < w - 8:
            r = rng.random()
            if r < 0.12:          # a gap
                x += rng.randint(3, 6)
                continue
            bw = rng.randint(3, 6)
            bh = rng.randint(20, 32)
            c = rng.choice(spines)
            if r < 0.22 and x < w - 22:   # stack lying flat
                for k in range(3):
                    cv.rect(x, base - 4 * (k + 1), 16 - k * 2, 4, rng.choice(spines))
                    cv.hline(x, x + 15 - k * 2, base - 4 * (k + 1), 'paper3')
                x += 17
                continue
            lean = 1 if (r > 0.85 and x > 10) else 0
            for yy in range(bh):
                off = (lean * (bh - yy)) // 6
                cv.hline(x - off, x - off + bw - 1, base - yy, c)
                cv.px(x - off, base - yy, step(PAL[c], 1))
                cv.px(x - off + bw - 1, base - yy, step(PAL[c], -1))
            cv.hline(x, x + bw - 1, base - bh + 6, 'gold2' if rng.random() < 0.5 else 'paper3')
            x += bw + (1 if lean else 0)
    # top: jar with a plant + scroll tubes
    cobweb(cv, 4, 4, 14, 'stone3', 'stone2', 'tl')
    cobweb(cv, w - 5, 113, 10, 'stone3', 'stone2', 'tr')
    out = Canvas(w, h + 22)
    out.blit(cv, 0, 22)
    plant = leafy_plant(rng, 16, 10, flowers=['white'])
    j = Canvas(12, 10)
    cylinder(j, 0, 0, 12, 10, ['sky1', 'sky2', 'sky3'], hi='white')
    out.blit(j, 8, 12)
    out.blit(plant, 14 - plant.w // 2, 10 - plant.h // 2)
    for k in range(3):    # scroll tubes lying on top
        cylinder(out, 30 + k * 2, 18 - k * 3, 26, 3, ['paper1', 'paper2', 'paper3'])
    return finish(out)


@prop('bed_messy', 4, 'floor', 1708, 146, "Traveler's bed: rumpled patchwork quilt hanging off, dented pillow, clothes")
def bed():
    rng = random.Random(530)
    w, h = 202, 70
    cv = Canvas(w, h)
    # headboard (right) and footboard (left)
    box(cv, 186, 6, 14, h - 6, 'wood2')
    cv.rect(189, 10, 8, 26, 'wood1'); cv.vline(189, 10, 35, 'wood0')
    cv.rect(185, 4, 16, 4, 'wood3'); cv.hline(185, 200, 4, 'wood4')
    box(cv, 0, 24, 9, h - 24, 'wood2')
    cv.rect(-1, 22, 11, 3, 'wood3'); cv.hline(-1, 9, 22, 'wood4')
    # side rail + legs
    cv.rect(6, 46, 182, 10, 'wood3')
    cv.hline(6, 187, 46, 'wood4'); cv.hline(6, 187, 55, 'wood1')
    wood_grain_h(cv, 7, 48, 180, 6, 'wood3', rng, dark='wood2', light='wood4')
    for lx in (2, 182):
        cv.rect(lx, 56, 6, h - 56, 'wood2'); cv.vline(lx, 56, h - 1, 'wood3')
    # mattress + sheet
    cv.rect(9, 33, 178, 13, 'paper3')
    cv.hline(9, 186, 33, 'paper4'); cv.hline(9, 186, 45, 'paper1')
    for x in range(14, 184, 14):
        cv.px(x, 39, 'paper1')
    # pillow (dented) on the right
    cv.ellipse(168, 29, 15, 6.5, 'paper4')
    cv.ellipse(170, 27, 6, 2.2, 'paper3')
    cv.hline(155, 182, 34, 'paper2')
    cv.px(158, 26, 'white'); cv.px(159, 25, 'white')
    # quilt: lumpy top, drapes over the rail, folds hang straight down
    patches = ['red3', 'jade2', 'gold2', 'red2', 'jade3', 'paper2', 'sky2', 'red4']
    top = [26 + int(round(2.2 * math.sin(x * 0.07) + 1.6 * math.sin(x * 0.19 + 1.3))) for x in range(w)]
    bot = [52 + int(round(4 * math.sin(x * 0.11 + 0.4) + 2 * math.sin(x * 0.31)))
           + (6 if 40 < x < 70 else 0) for x in range(w)]
    for xx in range(8, 152):
        fold = math.sin(xx * 0.33)
        for yy in range(top[xx], bot[xx]):
            pc = patches[((xx // 13) + ((yy - top[xx] // 2) // 8) * 3) % len(patches)]
            c = pc
            if yy - top[xx] < 2:
                c = step(PAL[pc], 1)                 # lit top of the lumps
            elif yy > 44 and fold > 0.55:
                c = step(PAL[pc], -1)                # hanging fold shadow
            elif yy > 44 and fold < -0.7:
                c = step(PAL[pc], 1)
            if xx % 13 == 0 or (yy - top[xx] // 2) % 8 == 0:
                c = 'paper1'                          # stitched seams
            cv.px(xx, yy, c)
        cv.px(xx, bot[xx], 'wood0' if bot[xx] >= 56 else step(PAL[patches[(xx // 13) % 8]], -2))
    for xx in range(8, 152):   # top edge line
        cv.px(xx, top[xx] - 1, step(PAL[patches[(xx // 13) % 8]], -2))
    # turned-back corner near the pillow
    cv.poly([(146, 25), (156, 28), (152, 46), (142, 46)], 'paper4')
    cv.line(146, 25, 142, 46, 'paper2')
    # torn patch with stuffing, shirt, sock, book face-down
    cv.rect(60, 38, 6, 4, 'paper4'); cv.px(59, 39, 'paper3'); cv.px(66, 41, 'paper3')
    cv.ellipse(118, 25, 10, 4.5, 'sky1'); cv.ellipse(116, 23.5, 6, 2.2, 'sky2'); cv.vline(124, 22, 28, 'sky0')
    cv.rect(28, 24, 10, 3, 'stone3'); cv.rect(36, 26, 3, 5, 'stone3'); cv.hline(28, 37, 24, 'stone4')
    cv.poly([(80, 27), (88, 20), (96, 27)], 'jade1')
    cv.line(80, 27, 88, 20, 'jade2'); cv.hline(81, 95, 27, 'paper3')
    return finish(cv)


@prop('straw_hat', 4, 'wall', 1716, 64, 'Woven straw traveler hat (kasa) on a peg')
def hat():
    cv = Canvas(36, 16)
    cv.px(18, 0, 'wood1'); cv.px(18, 1, 'wood2')
    cv.poly([(1, 13), (18, 2), (35, 13)], 'gold2')
    for k in range(3, 14, 3):
        cv.line(18 - k * 1.4, 2 + k * 0.85, 18 + k * 1.4, 2 + k * 0.85, 'gold1')
    cv.line(1, 13, 18, 2, 'gold3')
    cv.hline(1, 35, 13, 'gold0')
    cv.line(10, 13, 8, 15, 'red3'); cv.line(26, 13, 28, 15, 'red3')
    cv.px(24, 8, None); cv.px(25, 9, 'gold0')   # a hole
    return finish(cv)


@prop('cloak_hanging', 4, 'wall', 1850, 58, 'Patched traveling cloak on a hook')
def cloak():
    cv = Canvas(28, 60)
    cv.px(14, 0, 'stone2'); cv.px(14, 1, 'stone1')
    for yy in range(2, 58):
        t = yy / 58
        half = 4 + t * 9
        for xx in range(int(14 - half), int(14 + half)):
            u = (xx - (14 - half)) / (2 * half)
            c = 'teal2' if u < 0.25 else ('teal1' if u < 0.7 else 'teal0')
            if int(xx * 0.7 + yy * 0.1) % 6 == 0:
                c = 'teal0'
            cv.px(xx, yy, c)
    cv.rect(6, 34, 7, 7, 'gold1'); cv.frame(6, 34, 7, 7, 'paper2')   # patch
    for k in range(5):
        cv.px(4 + k * 5, 57 - (k % 2), None)
    return finish(cv)


@prop('walking_staff', 4, 'floor', 1702, 116, 'Knotted walking staff with a bell and charm')
def staff():
    rng = random.Random(540)
    cv = Canvas(10, 98)
    for yy in range(4, 98):
        x = 4 + (yy // 30) % 2
        cv.px(x, yy, 'bark3'); cv.px(x + 1, yy, 'bark2'); cv.px(x - 1, yy, 'bark4')
        if yy % 17 == 0:
            cv.px(x + 2, yy, 'bark1'); cv.px(x - 1, yy, 'bark2')
    cv.ellipse(5, 4, 3, 3, 'bark3'); cv.px(4, 3, 'bark5')
    cv.vline(7, 8, 14, 'red3')
    cv.ellipse(7, 15, 1.6, 1.6, 'gold2'); cv.px(7, 14, 'gold4')
    return finish(cv)


@prop('backpack', 4, 'floor', 1760, 212, 'Traveler backpack: bedroll, pot and lantern strapped on')
def backpack():
    cv = Canvas(34, 32)
    box(cv, 6, 8, 22, 24, 'wood3')
    cv.rect(6, 8, 22, 8, 'wood4'); cv.hline(6, 27, 8, 'wood5'); cv.hline(6, 27, 15, 'wood2')
    cv.rect(16, 14, 3, 4, 'gold2')
    cylinder(cv, 3, 0, 28, 8, ['red1', 'red2', 'red3'])        # bedroll
    cv.ellipse(3, 4, 2, 4, 'red3'); ellipse_ring(cv, 3, 4, 1, 2, 'red1')
    cv.vline(12, 0, 8, 'wood1'); cv.vline(22, 0, 8, 'wood1')
    cv.ellipse(30, 22, 4, 4, 'stone1'); cv.px(29, 20, 'stone3')   # pot
    cv.rect(0, 18, 5, 8, 'gold1'); cv.rect(1, 19, 3, 5, 'fire2')  # lantern
    return finish(cv)


@prop('rug_worn', 4, 'floor', 1488, 228, 'Worn woven rug, frayed edges, a burn hole')
def rug():
    rng = random.Random(550)
    w, h = 184, 24
    cv = Canvas(w, h)
    for yy in range(h):
        inset = int((h - yy) * 0.6)
        for xx in range(inset, w - inset):
            border = yy < 3 or yy > h - 4 or xx < inset + 6 or xx > w - inset - 7
            c = 'red2' if border else ('red3' if (xx // 8 + yy // 4) % 2 else 'red2')
            if not border and (xx + yy * 3) % 16 == 0:
                c = 'gold2'
            if not border and abs((xx - w // 2) / 3) + abs(yy - h // 2) < 6:
                c = 'jade2'
            cv.px(xx, yy, c)
    for x in range(10, w - 10, 3):   # fringe
        cv.px(x, h - 1, 'paper2'); cv.px(x, h, 'paper2')
    cv.ellipse(140, 14, 4, 2, 'ink'); ellipse_ring(cv, 140, 14, 5, 2.4, 'wood1')
    for yy in range(h):
        for xx in range(w):
            if cv.opaque(xx, yy) and (xx * 7 + yy * 13) % 31 == 0:
                cv.shift(xx, yy, 1)     # worn threads
    return finish(cv)


@prop('books_pile', 4, 'floor', 1676, 218, 'Pile of books on the floor')
def books_pile():
    rng = random.Random(560)
    cv = Canvas(30, 22)
    y = 18
    for k in range(5):
        bw = rng.randint(18, 26)
        x = rng.randint(0, 30 - bw)
        c = rng.choice(['red2', 'jade1', 'sky1', 'gold1', 'purp1'])
        box(cv, x, y, bw, 4, c)
        cv.hline(x + 1, x + bw - 2, y + 1, 'paper3')
        y -= 4
    return finish(cv)


@prop('papers_scattered', 4, 'floor', 1556, 244, 'Sheets scattered across the floor')
def papers():
    rng = random.Random(570)
    cv = Canvas(60, 12)
    for (x, y, w) in ((0, 4, 18), (14, 0, 16), (34, 5, 20), (26, 7, 12)):
        cv.poly([(x, y + 5), (x + 3, y), (x + w, y + 1), (x + w - 2, y + 6)], 'paper4' if x % 2 else 'paper3')
        scribble(cv, rng, x + 4, y + 3, w - 8, 'wood1')
    return finish(cv)


@prop('boots', 4, 'floor', 1846, 230, 'Muddy boots, one fallen over')
def boots():
    cv = Canvas(26, 16)
    cv.rect(2, 2, 7, 10, 'wood2'); cv.rect(2, 10, 11, 4, 'wood2')
    cv.vline(2, 2, 13, 'wood3'); cv.hline(2, 12, 14, 'wood0')
    cv.rect(14, 9, 10, 5, 'wood1'); cv.rect(20, 6, 5, 7, 'wood2')
    cv.hline(14, 24, 14, 'wood0')
    for (x, y) in ((4, 13), (8, 12), (17, 13)):
        cv.px(x, y, 'stone1')
    return finish(cv)


@prop('lamp_hanging', 4, 'ceiling', 1810, 19, 'Hanging oil lamp, glowing')
def lamp():
    cv = Canvas(18, 46)
    cv.vline(9, 0, 22, 'stone1')
    cv.rect(4, 22, 10, 3, 'gold1'); cv.hline(4, 13, 22, 'gold3')
    cv.ellipse(9, 32, 6, 7, 'fire2')
    cv.ellipse(8, 31, 3, 4, 'fire3')
    ellipse_ring(cv, 9, 32, 6, 7, 'gold1')
    cv.vline(9, 25, 39, 'gold0')
    cv.rect(5, 39, 8, 3, 'gold1'); cv.hline(5, 12, 41, 'gold0')
    cv.px(9, 43, 'gold2')
    return finish(cv)


@prop('map_pinned', 4, 'wall', 1756, 64, 'Old route map pinned to the plaster')
def map_pinned():
    rng = random.Random(580)
    w, h = 66, 46
    cv = torn_paper(rng, w, h, base='paper2', light='paper3', dark='paper1', edge='paper0', lines=False)
    for k in range(40):   # coastline
        x = 6 + k
        y = 12 + int(8 * math.sin(k * 0.2)) + (k % 3 == 0)
        cv.px(x, y, 'water1')
        cv.px(x, y + 1, 'water2')
    for (x, y) in ((14, 30), (30, 22), (48, 28), (56, 14)):
        cv.px(x, y, 'leaf1'); cv.px(x + 1, y - 1, 'leaf2'); cv.px(x - 1, y - 1, 'leaf2')
    pts = [(8, 38), (20, 32), (30, 36), (44, 24), (54, 18)]
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        n = max(abs(x1 - x0), abs(y1 - y0))
        for k in range(0, n, 2):
            cv.px(x0 + (x1 - x0) * k // n, y0 + (y1 - y0) * k // n, 'red3')
    cv.line(52, 16, 56, 20, 'red3'); cv.line(52, 20, 56, 16, 'red3')
    out = Canvas(w, h + 2)
    out.blit(cv, 0, 2)
    for (x, c) in ((4, 'red3'), (w - 6, 'jade3')):
        pin(out, x, 2, c)
    return out


@prop('sketch_pinned', 4, 'wall', 1828, 70, 'Charcoal sketch of the teahouse, pinned')
def sketch():
    rng = random.Random(590)
    cv = paper_note(rng, 20, 24, base='paper3', pin_c='gold3', lines=False)
    cv.poly([(4, 14), (10, 7), (16, 14)], 'stone2')
    cv.rect(5, 14, 11, 7, 'stone3'); cv.rect(9, 16, 3, 5, 'stone1')
    return cv
