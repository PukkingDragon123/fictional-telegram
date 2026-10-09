"""Room 1 (prep / boiling) and room 2 (seating) props."""
import math
import random
from pixel import Canvas, PAL, step, scribble, text
from shapes import torn_paper, pin, wood_grain_h, wood_grain_v, chip, cobweb, crack, flower
from propkit import (prop, finish, box, cylinder, ellipse_ring, label, glyph, leafy_plant, clay_pot,
                     paper_note)

SHELF_Y = 40          # room-1 wall shelf top
TABLE_Y = 211         # where things stand on the prep table
UNDER_Y = 247         # lower shelf of the prep table
SILL_Y = 154          # room-2 window sill
COUNTER_Y = 222       # where things stand on the serving counter


def text2x(cv, x, y, s, c, rng=None):
    from pixel import FONT
    cx = x
    for ch in s.upper():
        g = FONT.get(ch, FONT[' '])
        oy = rng.choice((0, 0, 1)) if rng else 0
        for gy, row in enumerate(g):
            for gx, v in enumerate(row):
                if v == '#':
                    cv.rect(cx + gx * 2, y + gy * 2 + oy, 2, 2, c)
        cx += 8
    return cx


# ================================================================ room 1
@prop('recipe_board', 1, 'wall', 126, 48, 'Giant chalk recipe board with clothes-line for recipe cards')
def recipe_board():
    rng = random.Random(101)
    w, h = 256, 96
    cv = Canvas(w, h)
    # slate
    cv.rect(0, 0, w, h, 'teal0')
    for _ in range(140):   # old half-erased chalk clouds
        x, y = rng.randint(8, w - 20), rng.randint(8, h - 16)
        ln = rng.randint(6, 20)
        for k in range(ln):
            if (x + k + y) % 2 == 0:
                cv.px(x + k, y + (k * 3) // ln, 'teal1')
    # chalk content
    text2x(cv, 18, 12, 'RECIPES', 'cloud2', rng)
    cv.hline(16, 74, 24, 'cloud1')
    cv.hline(18, 72, 25, 'teal2')
    # chalk teapot diagram with arrows
    tx, ty = 150, 68
    ellipse_ring(cv, tx, ty, 14, 10, 'cloud2')
    cv.line(tx + 14, ty - 2, tx + 24, ty - 10, 'cloud2')
    cv.line(tx - 14, ty - 4, tx - 20, ty + 2, 'cloud1')
    cv.hline(tx - 6, tx + 6, ty - 11, 'cloud2')
    cv.px(tx, ty - 13, 'cloud2')
    for k in range(3):   # steam squiggles
        for j in range(6):
            cv.px(tx + 24 + int(math.sin(j * 1.2 + k) * 1.5) + k * 4, ty - 14 - j, 'cloud1')
    cv.line(tx - 40, ty, tx - 22, ty, 'cloud1')
    cv.line(tx - 25, ty - 3, tx - 22, ty, 'cloud1')
    cv.line(tx - 25, ty + 3, tx - 22, ty, 'cloud1')
    text(cv, tx - 58, ty - 2, '80C', 'cloud2', rng, True)
    text(cv, tx + 30, ty + 2, '3 MIN', 'cloud1', rng, True)
    # step list
    for i, yy in enumerate(range(34, 84, 9)):
        text(cv, 14, yy, str(i + 1), 'cloud2')
        cv.px(19, yy + 2, 'cloud1')
        scribble(cv, rng, 23, yy + 3, rng.randint(26, 40), 'cloud1')
        if i == 2:
            cv.line(22, yy + 2, 64, yy + 3, 'red4')   # crossed out
    # a little leaf doodle + "?!"
    for k in range(9):
        cv.px(222 + k, 80 - k // 2, 'jade4')
    cv.px(226, 77, 'jade4'); cv.px(228, 79, 'jade4')
    text(cv, 236, 74, '?!', 'cloud2', rng, True)
    # wiped smear
    for yy in range(74, 86):
        for xx in range(196, 236):
            if (xx * 3 + yy) % 7 == 0:
                cv.px(xx, yy, 'teal1')
    # frame
    f = 6
    for i in range(f):
        c = ['wood1', 'wood3', 'wood4', 'wood3', 'wood2', 'wood0'][i]
        cv.frame(i, i, w - 2 * i, h - 2 * i, c)
    for (cx_, cy_) in ((0, 0), (w - 10, 0), (0, h - 10), (w - 10, h - 10)):   # brass corners
        cv.rect(cx_, cy_, 10, 10, 'gold1')
        cv.hline(cx_, cx_ + 9, cy_, 'gold3')
        cv.vline(cx_, cy_, cy_ + 9, 'gold2')
        cv.px(cx_ + 4, cy_ + 4, 'gold3')
        cv.px(cx_ + 5, cy_ + 5, 'gold0')
        cv.px(cx_ + 8, cy_ + 8, 'teal2')
    for _ in range(5):
        side = rng.choice(('t', 'b'))
        x = rng.randint(14, w - 30)
        chip(cv, x, 0 if side == 't' else h - 6, rng.randint(6, 14), 6, rng, under='wood2', under_dark='wood0',
             n=2, elong=0.6)
    # chalk ledge with chalk + eraser
    cv.rect(10, h - 6, w - 20, 4, 'wood4')
    cv.hline(10, w - 11, h - 6, 'wood5')
    cv.hline(10, w - 11, h - 3, 'wood2')
    cv.rect(40, h - 8, 6, 2, 'white'); cv.px(45, h - 8, 'cloud1')
    cv.rect(52, h - 8, 4, 2, 'pink3')
    cv.rect(200, h - 10, 14, 4, 'wood3'); cv.rect(200, h - 7, 14, 1, 'stone3')
    # clothes-line string across the top with pegs
    for x in range(12, w - 12):
        sag = int(4 * math.sin(math.pi * (x - 12) / (w - 24)))
        cv.px(x, 9 + sag, 'paper2')
    return cv


def _recipe_card(seed, icon):
    rng = random.Random(seed)
    w, h = rng.randint(26, 32), rng.randint(30, 38)
    cv = Canvas(w, h + 4)
    paper = torn_paper(rng, w, h, lines=False, burnt=(icon == 'burnt'))
    cv.blit(paper, 0, 4)
    # clothes peg
    cv.rect(w // 2 - 1, 0, 3, 7, 'wood4')
    cv.vline(w // 2 - 1, 0, 6, 'wood5')
    cv.vline(w // 2 + 1, 0, 6, 'wood2')
    cv.px(w // 2, 3, 'stone2')
    # title + drawing + notes
    ink = 'wood1'
    scribble(cv, rng, 4, 10, w - 8, 'red1')
    ix, iy = w // 2, 18
    if icon == 'leaf':
        for k in range(9):
            cv.px(ix - 4 + k, iy + 4 - k // 2, 'leaf2')
        for k in range(1, 8):
            cv.px(ix - 4 + k, iy + 2 - k // 2 - (1 if 2 < k < 6 else 0), 'leaf3')
            cv.px(ix - 4 + k, iy + 5 - k // 2, 'leaf1')
    elif icon == 'teapot':
        cv.ellipse(ix, iy + 2, 5, 3.5, 'paper1')
        cv.ellipse(ix, iy + 2, 4, 2.5, 'paper3')
        cv.line(ix + 5, iy + 1, ix + 8, iy - 2, 'paper1')
        cv.hline(ix - 2, ix + 2, iy - 2, 'paper1')
    elif icon == 'flower':
        flower(cv, ix, iy + 1, 'red4', 'gold3', size=2)
        cv.vline(ix, iy + 4, iy + 8, 'leaf2')
    elif icon == 'drops':
        for k in range(3):
            cv.px(ix - 4 + k * 4, iy, 'water1')
            cv.px(ix - 4 + k * 4, iy + 1, 'water2')
            cv.px(ix - 5 + k * 4, iy + 1, 'water1')
    for ly in range(iy + 9, h - 2, 3):
        scribble(cv, rng, 4, ly, w - 8, ink)
    return cv


for _i, (_ic, _x) in enumerate((('leaf', 214), ('teapot', 246), ('flower', 280), ('drops', 312), ('burnt', 344))):
    def _mk(i=_i, ic=_ic):
        return _recipe_card(110 + i, ic)
    prop(f'recipe_card_{"abcde"[_i]}', 1, 'wall', _x, 56, f'Recipe card ({_ic}) pegged on the board line')(_mk)


@prop('apothecary_drawers', 1, 'wall', 398, 54, 'Tea-ingredient apothecary chest; a drawer missing, one pulled out')
def apothecary():
    rng = random.Random(120)
    w, h = 66, 90
    cv = Canvas(w, h)
    box(cv, 0, 6, w, h - 10, 'wood2')
    # crown
    cv.rect(-1, 0, w + 2, 7, 'wood3')
    cv.hline(0, w - 1, 0, 'wood5')
    cv.hline(0, w - 1, 1, 'wood4')
    cv.hline(0, w - 1, 6, 'wood1')
    cv.rect(2, 2, w - 4, 2, 'jade2')
    cv.hline(2, w - 3, 2, 'jade3')
    # feet
    for fx in (2, w - 8):
        cv.rect(fx, h - 4, 6, 4, 'wood1')
        cv.hline(fx, fx + 5, h - 4, 'wood3')
    cols, rows = 4, 6
    dw, dh = 14, 12
    ox, oy = 3, 9
    missing = (2, 3)
    pulled = (1, 1)
    for r in range(rows):
        for c in range(cols):
            x = ox + c * (dw + 1)
            y = oy + r * (dh + 1)
            if (c, r) == missing:
                cv.rect(x, y, dw, dh, 'ink')
                cv.hline(x, x + dw - 1, y, 'wood0')
                cv.px(x + 2, y + dh - 2, 'leaf2')   # a seedling growing in the dark
                cv.px(x + 3, y + dh - 3, 'leaf3')
                cv.px(x + 2, y + dh - 4, 'leaf3')
                continue
            box(cv, x, y, dw, dh, 'wood3')
            cv.rect(x + 3, y + 2, dw - 6, 4, 'paper3' if (c + r) % 3 else 'paper2')
            glyph(cv, rng, x + 4, y + 2, 4, 'wood1')
            cv.px(x + dw // 2, y + 8, 'gold3')
            cv.px(x + dw // 2, y + 9, 'gold1')
            if rng.random() < 0.25:
                cv.px(x + rng.randint(1, dw - 2), y + rng.randint(1, dh - 2), 'wood1')
    # pulled-out drawer with leaves spilling
    c, r = pulled
    x = ox + c * (dw + 1) - 1
    y = oy + r * (dh + 1) + 3
    cv.rect(x, y, dw + 2, dh, 'wood4')
    cv.hline(x, x + dw + 1, y, 'wood5')
    cv.rect(x + 1, y + 1, dw, 3, 'wood1')
    for k in range(10):
        cv.px(x + 1 + rng.randint(0, dw), y + rng.randint(0, 2), rng.choice(('leaf2', 'leaf3', 'leaf1')))
    cv.px(x + dw // 2 + 1, y + 7, 'gold3')
    for k in range(5):
        cv.px(x + 3 + k * 2, y + dh + 1 + (k % 2), 'leaf2')
    return finish(cv)


@prop('wall_shelf_long', 1, 'wall', 120, 38, 'Long storage shelf plank with brackets')
def wall_shelf():
    rng = random.Random(130)
    w = 340
    cv = Canvas(w, 14)
    wood_grain_h(cv, 0, 0, w, 4, 'wood3', rng, dark='wood2', light='wood4')
    cv.hline(0, w - 1, 0, 'wood5')
    cv.hline(0, w - 1, 3, 'wood2')
    cv.hline(0, w - 1, 4, 'wood1')
    for bx in (10, w // 2 - 3, w - 18):
        for k in range(8):
            cv.hline(bx, bx + max(1, 7 - k), 5 + k, 'wood2')
            cv.px(bx, 5 + k, 'wood3')
        cv.px(bx + 2, 7, 'stone1')
    # sag + crack in the middle
    cv.px(w // 2 + 20, 1, 'wood1'); cv.px(w // 2 + 21, 2, 'wood1')
    # dust drip of dried leaves hanging over the edge
    for x in range(30, w - 20, 37):
        cv.px(x, 5, 'leaf1')
        cv.px(x + 1, 6, 'leaf2')
    return finish(cv)


def _glass_jar(rng, w, h, fill, lid='wood3', fill_frac=0.7, label_on=True):
    cv = Canvas(w, h)
    lid_h = 3
    box(cv, 1, 0, w - 2, lid_h, lid)
    cv.rect(0, lid_h, w, h - lid_h, 'sky3')
    top = lid_h + int((h - lid_h) * (1 - fill_frac))
    for yy in range(top, h):
        for xx in range(1, w - 1):
            cv.px(xx, yy, fill[(xx + yy * 2 + rng.randint(0, 1)) % len(fill)])
    cv.vline(1, lid_h + 1, h - 2, 'white')
    cv.vline(2, lid_h + 2, h - 4, 'sky4')
    cv.vline(w - 1, lid_h, h - 1, 'sky1')
    cv.hline(0, w - 1, h - 1, 'sky1')
    cv.hline(1, w - 2, lid_h, 'sky4')
    if label_on and w >= 10:
        label(cv, rng, 2, h // 2, w - 4, 5)
    return cv


@prop('jar_leaves_green', 1, 'wall', 132, SHELF_Y - 18, 'Glass jar of green tea leaves')
def jar_green():
    return finish(_glass_jar(random.Random(140), 14, 18, ('leaf2', 'leaf3', 'leaf1')))


@prop('jar_leaves_dark', 1, 'wall', 150, SHELF_Y - 16, 'Glass jar of roasted dark leaves')
def jar_dark():
    return finish(_glass_jar(random.Random(141), 12, 16, ('wood1', 'wood2', 'wood0'), lid='red2'))


@prop('jar_flowers_dried', 1, 'wall', 168, SHELF_Y - 16, 'Jar of dried pink blossoms')
def jar_flowers():
    return finish(_glass_jar(random.Random(142), 14, 16, ('pink2', 'pink3', 'pink1', 'paper3'), lid='gold1'))


@prop('jar_berries', 1, 'wall', 186, SHELF_Y - 12, 'Small jar of red berries')
def jar_berries():
    return finish(_glass_jar(random.Random(143), 10, 12, ('red3', 'red4', 'red2'), label_on=False, fill_frac=0.8))


def _tin(rng, w, h, base, band):
    cv = Canvas(w, h)
    cylinder(cv, 0, 2, w, h - 2, [step(PAL[base], -1), PAL[base], step(PAL[base], 1)], hi=step(PAL[base], 2))
    cylinder(cv, 0, 0, w, 2, ['stone2', 'stone3', 'stone4'])
    cylinder(cv, 0, h // 2 - 2, w, 4, [step(PAL[band], -1), PAL[band], step(PAL[band], 1)])
    glyph(cv, rng, w // 2 - 2, h // 2 - 2, 4, 'ink')
    for _ in range(3):   # rust spots
        cv.px(rng.randint(1, w - 2), rng.randint(3, h - 2), 'wood2')
    return cv


@prop('tin_caddy_red', 1, 'wall', 206, SHELF_Y - 14, 'Red tea tin with a gold band')
def tin_red():
    return finish(_tin(random.Random(150), 12, 14, 'red3', 'gold2'))


@prop('tin_caddy_jade', 1, 'wall', 222, SHELF_Y - 12, 'Jade tea tin, dented')
def tin_jade():
    cv = _tin(random.Random(151), 12, 12, 'jade2', 'paper3')
    cv.px(9, 7, 'jade1'); cv.px(10, 8, 'jade0')
    return finish(cv)


def _sack(rng, w, h, base='paper1', tie='wood2', spill=None):
    cv = Canvas(w, h)
    neck = int(h * 0.3)
    for yy in range(h):
        t = yy / h
        if yy < neck:
            half = w * 0.16 + (neck - yy) * 0.25
        else:
            half = w * 0.5 * math.sin(math.pi * min(1, 0.35 + (t - 0.3) * 0.9)) ** 0.5
        for xx in range(int(w / 2 - half), int(w / 2 + half)):
            u = (xx - (w / 2 - half)) / max(1, 2 * half)
            c = step(PAL[base], 1) if u < 0.3 else (PAL[base] if u < 0.72 else step(PAL[base], -1))
            if (xx + yy * 2) % 5 == 0:
                c = step(c, -1)          # burlap weave
            cv.px(xx, yy, c)
    cv.hline(int(w * 0.3), int(w * 0.7), neck, tie)
    cv.hline(int(w * 0.3), int(w * 0.7), neck + 1, step(PAL[tie], -1))
    # stencil leaf mark
    mx, my = w // 2, int(h * 0.65)
    for k in range(5):
        cv.px(mx - 2 + k, my + 1 - k // 2, 'jade1')
    cv.px(mx, my - 1, 'jade1')
    if spill:
        for k in range(6):
            cv.px(w // 2 - 3 + k, k % 2, spill)
    return cv


@prop('sack_tea_small', 1, 'wall', 240, SHELF_Y - 18, 'Small burlap sack of tea leaves')
def sack_small():
    return finish(_sack(random.Random(160), 18, 18, spill='leaf2'))


@prop('sack_tea_small_b', 1, 'wall', 262, SHELF_Y - 16, 'Small burlap sack (tied)')
def sack_small_b():
    return finish(_sack(random.Random(161), 16, 16, base='paper2'))


@prop('bottle_amber', 1, 'wall', 284, SHELF_Y - 18, 'Amber tincture bottle with a cork')
def bottle_amber():
    cv = Canvas(8, 18)
    box(cv, 3, 0, 2, 3, 'wood4')
    cv.rect(3, 3, 2, 4, 'gold1')
    cylinder(cv, 0, 7, 8, 11, ['gold0', 'gold1', 'gold2'], hi='gold4')
    cv.vline(2, 4, 6, 'gold3')
    cv.rect(1, 11, 6, 4, 'paper3'); scribble(cv, random.Random(1), 2, 13, 4, 'wood1')
    return finish(cv)


@prop('bowl_stack', 1, 'wall', 298, SHELF_Y - 10, 'Stack of ceramic tea bowls')
def bowl_stack():
    cv = Canvas(20, 10)
    for i, (y, w) in enumerate(((6, 20), (3, 18), (0, 16))):
        x = (20 - w) // 2
        cv.rect(x, y, w, 4, 'paper3')
        cv.hline(x, x + w - 1, y, 'paper4')
        cv.hline(x + 1, x + w - 2, y + 3, 'paper1')
        cv.hline(x + 2, x + w - 3, y + 1, 'jade2' if i % 2 == 0 else 'sky2')
    cv.px(5, 7, 'paper0'); cv.px(6, 8, 'paper0')   # chip
    return finish(cv)


@prop('scroll_bundle', 1, 'wall', 324, SHELF_Y - 10, 'Bundle of rolled recipe scrolls tied with string')
def scroll_bundle():
    cv = Canvas(30, 10)
    for i, (y, x, ln) in enumerate(((5, 0, 28), (2, 2, 26), (6, 4, 22), (0, 6, 20))):
        cylinder(cv, x, y, ln, 4, ['paper1', 'paper2', 'paper3'])
        cv.vline(x, y, y + 3, 'paper2')
        cv.px(x, y + 1, 'paper0')
        cv.vline(x + ln - 1, y, y + 3, 'paper1')
    cv.vline(14, 0, 9, 'red3')
    cv.vline(15, 0, 9, 'red2')
    return finish(cv)


@prop('jar_leaves_green_b', 1, 'wall', 362, SHELF_Y - 20, 'Tall jar of long-leaf tea')
def jar_green_b():
    return finish(_glass_jar(random.Random(144), 14, 20, ('leaf3', 'leaf4', 'leaf2'), lid='jade2'))


@prop('mortar_pestle_shelf', 1, 'wall', 384, SHELF_Y - 12, 'Spare stone mortar')
def mortar_small():
    return finish(_mortar(random.Random(171), 16, 12))


def _mortar(rng, w, h):
    cv = Canvas(w, h + 6)
    for yy in range(h):
        t = yy / h
        half = w / 2 * (1 - t * t * 0.35)
        for xx in range(int(w / 2 - half), int(w / 2 + half)):
            u = (xx - (w / 2 - half)) / (2 * half)
            cv.px(xx, yy + 6, 'stone3' if u < 0.3 else ('stone2' if u < 0.75 else 'stone1'))
    cv.hline(0, w - 1, 6, 'stone4')
    cv.hline(2, w - 3, 7, 'stone0')
    cv.rect(2, 7, w - 4, 1, 'leaf2')
    cv.line(w - 4, 0, w // 2, 7, 'wood3')   # pestle
    cv.line(w - 3, 0, w // 2 + 1, 7, 'wood2')
    return cv


@prop('stove_pipe', 1, 'wall', 50, 18, 'Rusty stove flue running up through the ceiling')
def stove_pipe():
    rng = random.Random(180)
    w, h = 12, 166
    cv = Canvas(w, h)
    cylinder(cv, 1, 0, w - 2, h, ['stone0', 'stone1', 'stone2', 'stone1'], hi='stone3')
    for yy in range(0, h, 34):
        cylinder(cv, 0, yy, w, 3, ['stone1', 'stone2', 'stone3'])
        cv.px(2, yy + 1, 'stone4')
    for _ in range(20):   # rust blooms
        x, y = rng.randint(2, w - 3), rng.randint(2, h - 3)
        cv.px(x, y, 'wood2'); cv.px(x, y + 1, 'red1')
    return finish(cv)


@prop('stove_clay', 1, 'counter', 20, TABLE_Y - 30, 'Clay boiling stove; fire window flickers (4 frames)', fps=8)
def stove():
    rng = random.Random(190)
    frames = []
    for f in range(4):
        cv = Canvas(42, 30)
        for yy in range(30):
            t = yy / 30
            half = 17 + t * 4
            for xx in range(int(21 - half), int(21 + half)):
                u = (xx - (21 - half)) / (2 * half)
                c = 'paper1' if u < 0.25 else ('paper0' if u < 0.7 else 'wood2')
                cv.px(xx, yy, c)
        cv.rect(1, 0, 40, 4, 'wood3')
        cv.hline(1, 40, 0, 'paper2')
        cv.hline(1, 40, 3, 'wood1')
        for k in range(3):   # cracks + soot
            crack(cv, rng, rng.randint(6, 36), rng.randint(5, 10), 10, 'wood1', None, dirx=0.1)
        for xx in range(8, 34):
            if xx % 3:
                cv.px(xx, 4, 'wood1')
        # fire window
        cv.ellipse(21, 19, 9, 6.5, 'ink')
        fire_rng = random.Random(500 + f)
        for xx in range(13, 30):
            hgt = int(4 + 3 * math.sin(xx * 0.9 + f * 1.7) + fire_rng.randint(0, 2))
            for k in range(hgt):
                yy = 24 - k
                if cv.get(xx, yy)[:3] == PAL['ink']:
                    cv.px(xx, yy, 'fire3' if k < 1 else ('fire2' if k < 3 else ('fire1' if k < 5 else 'fire0')))
        for xx in range(14, 29, 3):   # embers
            cv.px(xx + f % 2, 24, 'fire2')
        cv.rect(13, 25, 17, 1, 'wood0')
        ellipse_ring(cv, 21, 19, 10, 7.5, 'wood2')
        # glow on the clay around the window
        for yy in range(10, 29):
            for xx in range(8, 35):
                d = math.hypot((xx - 21) / 13, (yy - 19) / 10)
                if 0.8 < d < 1.05 and (xx + yy + f) % 2 == 0:
                    cv.shift(xx, yy, 1, only=('paper', 'wood'))
        frames.append(finish(cv))
    return frames


@prop('kettle_iron', 1, 'counter', 26, TABLE_Y - 52, 'Cast-iron tetsubin kettle with bumpy arare texture')
def kettle():
    cv = Canvas(32, 26)
    # bail handle
    for a in range(0, 181, 4):
        x = 16 + int(round(math.cos(math.radians(180 + a)) * 10))
        y = 9 + int(round(math.sin(math.radians(180 + a)) * 8))
        cv.px(x, y, 'stone1')
        cv.px(x, y + 1, 'stone0')
    cv.rect(13, 0, 6, 2, 'stone2')
    # body
    cv.ellipse(16, 17, 12, 8.5, 'stone1')
    for yy in range(9, 26):
        for xx in range(4, 29):
            if cv.get(xx, yy)[3]:
                d = (xx - 11) / 16
                if d < 0.1:
                    cv.px(xx, yy, 'stone2')
                if (xx + (yy % 2)) % 2 == 0 and (yy % 2 == 0) and 9 < yy < 23:   # arare bumps
                    cv.px(xx, yy, 'stone3' if d < 0.2 else 'stone2')
                    cv.px(xx + 1, yy + 1, 'stone0')
    # lid + knob
    cv.ellipse(16, 10, 7, 2, 'stone2')
    cv.hline(10, 22, 9, 'stone3')
    cv.rect(15, 6, 3, 3, 'gold1'); cv.px(15, 6, 'gold3')
    # spout
    cv.line(27, 15, 31, 10, 'stone1')
    cv.line(27, 16, 31, 11, 'stone0')
    cv.px(31, 9, 'stone2')
    cv.hline(6, 26, 24, 'stone0')
    cv.px(9, 13, 'stone4')
    cv.px(10, 12, 'stone4')
    return finish(cv)


@prop('steam_puff', 1, 'front', 50, 132, 'Rising steam (4-frame loop) for kettles and cups', drag=False, fps=6)
def steam():
    frames = []
    for f in range(4):
        cv = Canvas(18, 30)
        for k in range(3):
            ph = f * math.pi / 2 + k * 2.1
            for j in range(26):
                t = j / 26
                x = 9 + math.sin(j * 0.35 + ph) * (1 + t * 3) + (k - 1) * 3
                y = 29 - j
                if (j + f * 2 + k * 5) % 9 < 6:
                    c = 'white' if t < 0.35 else ('cloud2' if t < 0.7 else 'cloud1')
                    cv.px(int(round(x)), y, c)
        frames.append(cv)
    return frames


@prop('cutting_board_herbs', 1, 'counter', 110, TABLE_Y - 9, 'Cutting board with chopped herbs and a knife')
def cutting_board():
    rng = random.Random(200)
    cv = Canvas(46, 9)
    box(cv, 0, 3, 40, 5, 'wood4')
    cv.hline(0, 39, 3, 'wood5')
    for _ in range(14):
        x = rng.randint(4, 30)
        cv.px(x, rng.randint(1, 3), rng.choice(('leaf2', 'leaf3', 'leaf4')))
    cv.ellipse(10, 2, 4, 1.5, 'leaf2'); cv.px(9, 1, 'leaf4')
    cv.hline(26, 44, 2, 'stone3')        # knife
    cv.hline(26, 40, 3, 'stone2')
    cv.hline(41, 45, 2, 'wood1'); cv.hline(41, 45, 3, 'wood0')
    return finish(cv)


@prop('mortar_pestle', 1, 'counter', 166, TABLE_Y - 18, 'Stone mortar and pestle with ground matcha')
def mortar():
    return finish(_mortar(random.Random(170), 18, 12))


@prop('basket_tea_leaves', 1, 'counter', 204, TABLE_Y - 17, 'Woven bamboo basket heaped with fresh tea leaves')
def basket():
    rng = random.Random(210)
    from leaves import leafy
    cv = Canvas(36, 18)
    spr, ox, oy, m = leafy(rng, [(0, 0, 14, 5), (-6, 1, 8, 4), (7, 1, 8, 4)],
                           ['leaf0', 'leaf1', 'leaf2', 'leaf3', 'leaf4', 'leaf5'], leaf_len=(3, 4))
    cv.blit(spr, 18 - ox, 7 - oy)
    for yy in range(8, 18):
        t = (yy - 8) / 10
        inset = int(t * 4)
        for xx in range(2 + inset, 34 - inset):
            c = 'gold2' if ((xx // 2) + (yy // 2)) % 2 == 0 else 'gold1'
            if xx < 6 + inset:
                c = 'gold3' if c == 'gold2' else 'gold2'
            cv.px(xx, yy, c)
    cv.hline(1, 34, 8, 'gold3')
    cv.hline(1, 34, 9, 'gold0')
    return finish(cv)


@prop('balance_scale', 1, 'counter', 328, TABLE_Y - 28, 'Brass balance scale for weighing leaves')
def scale():
    cv = Canvas(32, 28)
    cv.rect(13, 24, 6, 4, 'wood2'); cv.hline(11, 20, 27, 'wood1'); cv.hline(13, 18, 24, 'wood3')
    cv.vline(16, 5, 24, 'gold1'); cv.vline(15, 5, 23, 'gold3')
    cv.line(3, 7, 29, 5, 'gold2')
    cv.px(16, 4, 'gold3')
    for (cx, cy) in ((4, 7), (28, 5)):
        cv.line(cx, cy, cx - 3, cy + 9, 'gold0')
        cv.line(cx, cy, cx + 3, cy + 9, 'gold0')
        cv.ellipse(cx, cy + 10, 5, 1.5, 'gold2')
        cv.hline(cx - 4, cx + 3, cy + 9, 'gold3')
    cv.px(26, 13, 'leaf3'); cv.px(28, 13, 'leaf2'); cv.px(27, 12, 'leaf3')
    cv.rect(2, 15, 3, 2, 'stone2')   # weight
    return finish(cv)


@prop('jar_glass_table', 1, 'counter', 374, TABLE_Y - 18, 'Jar of hojicha on the table, lid off')
def jar_table():
    cv = _glass_jar(random.Random(145), 14, 18, ('wood2', 'wood3', 'wood1'))
    cv.rect(1, 0, 12, 3, None)
    return finish(cv)


@prop('drying_tray', 1, 'counter', 248, TABLE_Y - 7, 'Flat bamboo tray of leaves drying')
def drying_tray():
    rng = random.Random(220)
    cv = Canvas(64, 7)
    cv.rect(0, 3, 64, 4, 'gold2')
    cv.hline(0, 63, 3, 'gold3'); cv.hline(0, 63, 6, 'gold0')
    for x in range(2, 62, 4):
        cv.vline(x, 4, 5, 'gold1')
    for _ in range(40):
        x = rng.randint(3, 60)
        cv.px(x, rng.randint(1, 3), rng.choice(('leaf1', 'leaf2', 'wood3', 'leaf3')))
        cv.px(x + 1, 3, 'leaf1')
    return finish(cv)


# under the prep table
@prop('sack_big', 1, 'floor', 22, UNDER_Y - 30, 'Big burlap sack of tea, slumped')
def sack_big():
    return finish(_sack(random.Random(230), 34, 30))


@prop('sack_big_b', 1, 'floor', 60, UNDER_Y - 26, 'Burlap sack, torn, leaves spilling')
def sack_big_b():
    cv = _sack(random.Random(231), 30, 26, base='paper2')
    for k in range(9):
        cv.px(22 + k % 4, 20 + k // 3, 'leaf1' if k % 2 else 'leaf2')
    cv.rect(23, 16, 4, 3, 'ink')
    return finish(cv)


@prop('firewood', 1, 'floor', 172, UNDER_Y - 16, 'Bundle of firewood for the stove')
def firewood():
    rng = random.Random(240)
    cv = Canvas(44, 16)
    for i, (x, y) in enumerate(((0, 9), (5, 4), (11, 10), (3, 0), (13, 5))):
        cylinder(cv, x + 4, y, 30, 6, ['bark1', 'bark2', 'bark3'])
        cv.ellipse(x + 3, y + 3, 2.5, 3, 'wood4')
        cv.px(x + 3, y + 3, 'wood2')
        ellipse_ring(cv, x + 3, y + 3, 2.4, 2.8, 'wood3')
    cv.vline(22, 0, 15, 'paper1'); cv.vline(23, 0, 15, 'paper0')
    return finish(cv)


@prop('bucket_water', 1, 'floor', 244, UNDER_Y - 22, 'Wooden water bucket with iron hoops')
def bucket():
    cv = Canvas(24, 22)
    for x in range(1, 23, 3):
        cv.vline(x, 4, 21, 'wood3' if x < 10 else 'wood2')
        cv.vline(x + 1, 4, 21, 'wood2' if x < 10 else 'wood1')
        cv.vline(x + 2, 4, 21, 'wood1')
    for y in (7, 16):
        cv.hline(0, 23, y, 'stone1'); cv.hline(0, 23, y + 1, 'stone0')
    cv.ellipse(12, 4, 11, 2.5, 'water1')
    cv.hline(5, 12, 3, 'water2'); cv.px(8, 4, 'white')
    for a in range(0, 181, 6):
        cv.px(12 + int(round(math.cos(math.radians(180 + a)) * 11)),
              3 + int(round(math.sin(math.radians(180 + a)) * 4)), 'wood3')
    return finish(cv)


@prop('crate_jars', 1, 'floor', 318, UNDER_Y - 24, 'Crate of spare jars, one broken')
def crate():
    rng = random.Random(250)
    cv = Canvas(44, 24)
    for i in range(4):
        x = 2 + i * 10
        j = _glass_jar(rng, 9, 12, rng.choice((('leaf2', 'leaf3'), ('red3', 'red2'), ('wood2', 'wood3'))))
        cv.blit(j, x, 0)
    box(cv, 0, 9, 44, 15, 'wood3')
    for y in (9, 16):
        cv.hline(0, 43, y, 'wood4')
        cv.hline(0, 43, y + 6, 'wood1')
    cv.vline(1, 9, 23, 'wood5'); cv.vline(42, 9, 23, 'wood1')
    glyph(cv, rng, 18, 12, 6, 'wood1')
    for (x, y) in ((33, 6), (35, 7), (34, 5)):   # broken glass
        cv.px(x, y, 'white')
    return finish(cv)


@prop('basket_round', 1, 'floor', 392, UNDER_Y - 16, 'Round basket of dried flowers')
def basket_round():
    rng = random.Random(260)
    cv = Canvas(28, 16)
    for _ in range(26):
        x, y = rng.randint(4, 23), rng.randint(0, 6)
        cv.px(x, y, rng.choice(('pink2', 'pink3', 'gold3', 'paper3', 'purp2')))
    for yy in range(5, 16):
        inset = (yy - 5) // 3
        for xx in range(1 + inset, 27 - inset):
            cv.px(xx, yy, 'wood4' if ((xx + yy) // 2) % 2 == 0 else 'wood3')
    cv.hline(0, 27, 5, 'wood5')
    return finish(cv)


def _herbs(seed, ramp):
    rng = random.Random(seed)
    h = rng.randint(30, 40)
    cv = Canvas(14, h)
    cv.vline(7, 0, h - 22, 'paper1')
    top = h - 22
    cv.rect(5, top, 4, 2, 'red3')
    for k in range(18):
        x = 7 + rng.randint(-5, 5)
        for j in range(rng.randint(10, 20)):
            xx = 7 + (x - 7) * j // 20
            cv.px(xx, top + 2 + j, ramp[(j + k) % len(ramp)])
    for k in range(10):
        cv.px(7 + rng.randint(-5, 5), top + rng.randint(14, 21), ramp[-1])
    return finish(cv)


@prop('herbs_hanging_a', 1, 'ceiling', 70, 19, 'Bundle of drying herbs hanging from the beam')
def herbs_a():
    return _herbs(270, ['leaf1', 'leaf2', 'leaf3', 'paper1'])


@prop('herbs_hanging_b', 1, 'ceiling', 86, 19, 'Bundle of drying lavender')
def herbs_b():
    return _herbs(271, ['leaf1', 'purp1', 'purp2', 'purp3'])


@prop('herbs_hanging_c', 1, 'ceiling', 102, 19, 'Bundle of drying chamomile')
def herbs_c():
    return _herbs(272, ['leaf2', 'leaf1', 'paper4', 'gold3'])


# ================================================================ room 2
@prop('menu_plaques', 2, 'wall', 498, 42, 'Hanging wooden menu tags (one fallen crooked, one missing)')
def menu_plaques():
    rng = random.Random(300)
    cv = Canvas(90, 84)
    wood_grain_h(cv, 0, 0, 90, 5, 'wood2', rng, dark='wood1', light='wood3')
    cv.hline(0, 89, 0, 'wood4'); cv.hline(0, 89, 4, 'wood0')
    prices = ['3', '4', '5', '3', '6', '4']
    for i in range(6):
        x = 3 + i * 14
        if i == 4:   # missing: nail + unfaded ghost
            cv.px(x + 5, 7, 'stone2')
            continue
        hgt = rng.randint(50, 64)
        tag = Canvas(12, hgt)
        box(tag, 0, 0, 12, hgt, 'wood4')
        wood_grain_v(tag, 1, 1, 10, hgt - 2, 'wood4', rng, dark='wood3', light='wood5', knots=False)
        tag.hline(0, 11, 0, 'wood5')
        tag.vline(11, 0, hgt - 1, 'wood2')
        tag.hline(0, 11, hgt - 1, 'wood2')
        for k in range(3):
            glyph(tag, rng, 3, 4 + k * 9, 6, 'ink')
        tag.rect(2, hgt - 12, 8, 9, 'red3')
        text(tag, 4, hgt - 10, prices[i], 'paper4')
        if i == 2:   # crooked: hangs off one nail, drawn sheared
            for yy in range(hgt):
                for xx in range(12):
                    p = tag.get(xx, yy)
                    if p[3]:
                        cv.px(x + xx + yy // 9, 8 + yy, p[:3])
        else:
            cv.blit(tag, x, 8)
        cv.px(x + 5, 7, 'stone2')
        cv.vline(x + 5, 4, 7, 'paper1')
    # little paper strip pinned on: sold out (just a red slash)
    strip = torn_paper(rng, 10, 18, lines=False, curl=False)
    strip.line(2, 14, 7, 3, 'red3')
    cv.blit(strip, 46, 30)
    return finish(cv)


def _lantern(seed, torn):
    rng = random.Random(seed)
    w, h = 22, 42
    cv = Canvas(w, h)
    cv.vline(11, 0, 8, 'paper1')
    cv.rect(6, 8, 10, 3, 'ink'); cv.hline(6, 15, 8, 'gold2')
    for yy in range(11, 36):
        t = (yy - 11) / 25
        half = 10 * math.sin(math.pi * (0.12 + t * 0.76))
        for xx in range(int(11 - half), int(11 + half) + 1):
            u = (xx - (11 - half)) / max(1, 2 * half)
            c = 'red4' if u < 0.3 else ('red3' if u < 0.7 else 'red2')
            if (yy - 11) % 4 == 0:
                c = step(PAL[c], -1)     # bamboo ribs
            cv.px(xx, yy, c)
    cv.rect(6, 36, 10, 3, 'ink'); cv.hline(6, 15, 38, 'gold1')
    # glyph panel
    cv.rect(8, 18, 7, 10, 'red4')
    glyph(cv, rng, 8, 19, 7, 'ink')
    # tassel
    cv.vline(11, 39, 41, 'gold2'); cv.px(10, 41, 'gold1'); cv.px(12, 41, 'gold1')
    if torn:
        cv.rect(14, 24, 4, 5, 'wood0')
        cv.px(13, 24, 'paper3'); cv.px(18, 28, 'paper3'); cv.px(15, 29, 'red4')
        cv.line(3, 15, 6, 22, 'red1')
    return finish(cv)


@prop('paper_lantern_a', 2, 'ceiling', 544, 19, 'Red paper lantern (chochin), faded')
def lantern_a():
    return _lantern(310, False)


@prop('paper_lantern_b', 2, 'ceiling', 918, 19, 'Red paper lantern, torn')
def lantern_b():
    return _lantern(311, True)


@prop('wall_clock', 2, 'wall', 866, 56, 'Old pendulum clock - stopped at 4:20, cracked glass')
def wall_clock():
    rng = random.Random(320)
    cv = Canvas(40, 80)
    box(cv, 2, 4, 36, 74, 'wood2')
    wood_grain_v(cv, 3, 5, 34, 72, 'wood2', rng, dark='wood1', light='wood3', knots=False)
    cv.poly([(0, 6), (20, -2), (40, 6)], 'wood3')
    cv.line(0, 6, 20, -2, 'wood4')
    cv.px(20, 1, 'gold3')
    cv.rect(0, 74, 40, 6, 'wood3'); cv.hline(0, 39, 74, 'wood4'); cv.hline(0, 39, 79, 'wood1')
    # face
    cv.ellipse(20, 22, 13, 13, 'gold1')
    cv.ellipse(20, 22, 11, 11, 'paper4')
    for k in range(12):
        a = math.radians(k * 30 - 90)
        cv.px(20 + int(round(math.cos(a) * 9)), 22 + int(round(math.sin(a) * 9)), 'ink')
    cv.line(20, 22, 24, 25, 'ink')      # hour ~4
    cv.line(20, 22, 22, 13, 'ink')      # minute ~20... crooked
    cv.px(20, 22, 'red3')
    for (dx, dy) in ((-6, -6), (-5, -4), (-3, -3), (-4, -1), (2, -8), (4, -5)):
        cv.px(20 + dx, 22 + dy, 'white')
    cv.px(14, 17, 'sky4'); cv.px(15, 16, 'white')
    # pendulum window
    cv.rect(10, 40, 20, 30, 'wood0')
    cv.vline(20, 40, 60, 'gold1')
    cv.ellipse(20, 62, 4, 4, 'gold2')
    cv.px(19, 61, 'gold4')
    cv.frame(9, 39, 22, 32, 'wood3')
    cobweb(cv, 10, 40, 8, 'stone3', 'stone2', 'tl')
    return finish(cv)


@prop('wind_chime', 2, 'wall', 646, 39, 'Glass furin wind chime with a paper strip (4-frame sway)', fps=5)
def wind_chime():
    rng = random.Random(330)
    frames = []
    for f in range(4):
        cv = Canvas(14, 34)
        sw = [0, 1, 0, -1][f]
        cv.vline(7, 0, 3, 'paper1')
        cv.ellipse(7, 7, 4.5, 4.5, 'sky3')
        cv.rect(2, 7, 11, 4, None)
        cv.rect(3, 7, 9, 3, 'sky3')
        cv.px(5, 5, 'white'); cv.px(4, 6, 'white')
        cv.px(8, 6, 'red4'); cv.px(9, 7, 'red3'); cv.px(6, 8, 'leaf3')
        cv.hline(3, 11, 9, 'sky2')
        cv.vline(7 + sw, 10, 15, 'paper1')
        cv.rect(5 + sw * 2, 15, 5, 16, 'paper4')
        cv.vline(9 + sw * 2, 15, 30, 'paper2')
        glyph(cv, rng, 5 + sw * 2, 18, 5, 'red2')
        frames.append(finish(cv))
    return frames


@prop('hanging_planter', 2, 'ceiling', 700, 19, 'Rope planter with trailing ivy hanging in front of the window')
def hanging_planter():
    rng = random.Random(340)
    cv = Canvas(34, 70)
    for k, x in enumerate((9, 17, 25)):
        cv.line(17, 0, x, 30, 'paper2')
    pot = clay_pot(18, 12, 'red3', cracked=True)
    cv.blit(pot, 8, 30)
    plant = leafy_plant(rng, 26, 14)
    cv.blit(plant, 17 - plant.w // 2, 30 - plant.h // 2 - 2)
    for x0 in (9, 14, 22, 26):    # trailing strands
        n = rng.randint(14, 28)
        for j in range(n):
            x = x0 + int(math.sin(j * 0.4 + x0) * 1.2)
            cv.px(x, 40 + j, 'leaf1')
            if j % 3 == 0:
                cv.px(x - 1, 40 + j, 'leaf3'); cv.px(x + 1, 41 + j, 'leaf2')
    return finish(cv)


@prop('pot_flowers_pink', 2, 'wall', 610, SILL_Y - 26, 'Cracked pot of pink cosmos on the sill')
def pot_flowers():
    rng = random.Random(350)
    cv = Canvas(26, 26)
    cv.blit(clay_pot(16, 11, 'red3', rng=rng), 5, 15)
    plant = leafy_plant(rng, 20, 12, flowers=['pink3', 'pink4', 'white'])
    cv.blit(plant, 13 - plant.w // 2, 9 - plant.h // 2)
    return finish(cv)


@prop('pot_succulent', 2, 'wall', 694, SILL_Y - 15, 'Little succulent in a jade glazed cup')
def pot_succulent():
    cv = Canvas(16, 15)
    cylinder(cv, 3, 8, 10, 7, ['jade1', 'jade2', 'jade3'], hi='jade4')
    cv.hline(2, 13, 8, 'jade4')
    for (x, y, d) in ((8, 1, 0), (4, 4, -1), (12, 4, 1), (6, 6, -1), (10, 6, 1), (8, 5, 0)):
        cv.px(x, y, 'leaf4'); cv.px(x, y + 1, 'leaf3'); cv.px(x + d, y + 2, 'leaf2')
    cv.px(8, 0, 'pink3')
    return finish(cv)


@prop('bottle_bud_vase', 2, 'wall', 772, SILL_Y - 28, 'Old sake bottle used as a vase, one camellia')
def bud_vase_sill():
    cv = Canvas(12, 28)
    cylinder(cv, 2, 14, 8, 14, ['stone0', 'stone1', 'stone2'], hi='stone3')
    cylinder(cv, 4, 9, 4, 5, ['stone1', 'stone2', 'stone3'])
    cv.rect(3, 18, 6, 5, 'paper3'); cv.vline(6, 19, 21, 'ink')
    cv.vline(6, 3, 9, 'leaf2')
    flower(cv, 6, 3, 'red4', 'gold3', size=2)
    cv.px(4, 7, 'leaf3'); cv.px(3, 6, 'leaf3')
    return finish(cv)


@prop('pot_fern', 2, 'wall', 806, SILL_Y - 26, 'Fern spilling out of a chipped pot')
def pot_fern():
    rng = random.Random(360)
    cv = Canvas(30, 26)
    cv.blit(clay_pot(14, 10, 'wood3', cracked=False), 8, 16)
    for k in range(9):
        a = math.pi + (k + 0.5) * math.pi / 9
        ln = rng.randint(9, 13)
        for j in range(ln):
            x = 15 + math.cos(a) * j
            y = 16 + math.sin(a) * j * 0.8 + (j * j) * 0.04
            cv.px(int(x), int(y), 'leaf2')
            if j % 2 == 0 and j > 1:
                cv.px(int(x), int(y) - 1, 'leaf4')
                cv.px(int(x) + 1, int(y) + 1, 'leaf1')
    return finish(cv)


@prop('teacup_customer', 2, 'counter', 640, COUNTER_Y - 9, 'Customer teacup (pair it with steam_puff)')
def teacup():
    cv = Canvas(14, 9)
    for yy in range(1, 9):
        inset = (yy - 1) // 3
        for xx in range(1 + inset, 12 - inset):
            u = (xx - inset) / (11 - 2 * inset)
            cv.px(xx, yy, 'paper4' if u < 0.3 else ('paper3' if u < 0.75 else 'paper2'))
    cv.hline(1, 11, 1, 'leaf3')
    cv.hline(2, 10, 1, 'leaf4')
    cv.hline(1, 11, 3, 'jade2')
    cv.rect(-1, 8, 15, 1, 'wood2')     # saucer shadow
    return finish(cv)


@prop('bud_vase_counter', 2, 'counter', 722, COUNTER_Y - 24, 'Bud vase with wildflowers on the counter')
def bud_vase_counter():
    cv = Canvas(14, 24)
    cylinder(cv, 3, 12, 8, 12, ['jade1', 'jade2', 'jade3'], hi='jade4')
    cylinder(cv, 5, 9, 4, 3, ['jade1', 'jade2', 'jade3'])
    for (x, y, c) in ((3, 2, 'purp3'), (7, 0, 'pink3'), (10, 3, 'white')):
        cv.line(7, 9, x, y + 1, 'leaf2')
        flower(cv, x, y, c, 'gold3')
    return finish(cv)


@prop('service_bell', 2, 'counter', 880, COUNTER_Y - 11, 'Brass service bell, tarnished')
def bell():
    cv = Canvas(14, 11)
    cv.ellipse(7, 7, 6, 5, 'gold2')
    cv.rect(0, 8, 14, 3, None)
    cv.rect(0, 8, 14, 2, 'wood2'); cv.hline(0, 13, 8, 'wood3')
    cv.rect(6, 0, 2, 3, 'gold3')
    cv.px(4, 4, 'gold4'); cv.px(5, 3, 'gold4')
    cv.px(10, 6, 'teal2'); cv.px(9, 7, 'gold1')
    return finish(cv)


@prop('menu_card_tent', 2, 'counter', 588, COUNTER_Y - 18, 'Folded paper menu card standing on the counter')
def menu_card():
    rng = random.Random(370)
    cv = Canvas(18, 18)
    cv.poly([(2, 17), (9, 0), (16, 17)], 'paper3')
    cv.line(9, 0, 16, 17, 'paper1')
    cv.line(2, 17, 9, 0, 'paper4')
    for y in range(6, 16, 3):
        scribble(cv, rng, 7 - (y - 6) // 3, y, 6 + (y - 6) // 2, 'wood1')
    cv.px(9, 3, 'red3')
    return finish(cv)


@prop('sugar_pot', 2, 'counter', 800, COUNTER_Y - 12, 'Lidded sugar pot')
def sugar_pot():
    cv = Canvas(12, 12)
    cylinder(cv, 1, 4, 10, 8, ['sky1', 'sky2', 'sky3'], hi='sky4')
    cv.ellipse(6, 4, 5, 1.6, 'sky3')
    cv.rect(5, 1, 2, 2, 'sky2'); cv.px(5, 1, 'sky4')
    cv.hline(1, 10, 8, 'white')
    return finish(cv)
