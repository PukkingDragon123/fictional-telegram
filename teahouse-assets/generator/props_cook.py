"""Room 1 - the cook room: the big stone furnace (burning coal, smoke and the
talking fire spirit), copper hood with drying herbs, giant recipe board,
apothecary chest, prep-table tools and the stores under the table. The kama
pot, the iron kettle and their steam are exported but not placed yet."""
import math
import random
from pixel import Canvas, PAL, step, scribble, text, glyph_of
from shapes import torn_paper, pin, wood_grain_h, wood_grain_v, chip, cobweb, crack, flower
from propkit import prop, glyph
from furn import R, wood_face, inset, ring_pull, bar_pull, knob, label_tag, box
from shade import paint, lathe_shade, ellipse_mask, poly_mask
import objects as O
import fire as FIRE
import teaware as TW
import furnace as FURN
import crafted as CR
from counter import FIREBOX, BURNERS
from layout import TABLE_Y, TABLE_SHELF_Y, SHELF1_Y, CHEST_TOP_Y

F8 = 8


def text2x(cv, x, y, s, c, rng=None):
    cx = x
    for ch in s.upper():
        g = glyph_of(ch)
        oy = rng.choice((0, 0, 1)) if rng else 0
        for gy, row in enumerate(g):
            for gx, v in enumerate(row):
                if v == '#':
                    cv.rect(cx + gx * 2, y + gy * 2 + oy, 2, 2, c)
        cx += 8
    return cx


# ---------------------------------------------------------------- the furnace
@prop('furnace_fire', 1, 'counter', FURN.FX0, FURN.FY0,
      'Inside the stone furnace: glowing firebrick, a bed of burning coal, small flames, sparks and smoke curling '
      'out under the wooden top (12 frames)', drag=False, fps=10, shadow='none')
def furnace_fire():
    return FURN.fire_frames()


@prop('fire_spirit', 1, 'counter', FIREBOX['cx'] - FIRE.W // 2, FIREBOX['bottom'] - FIRE.H - 6,
      'Talking fire spirit sitting in the coals - all mouth and teeth: idle / talk / happy loops (12 frames each)',
      fps=10, shadow='none')
def fire_spirit():
    return FIRE.sheets()


@prop('furnace_coals', 1, 'counter', FURN.FX0, FURN.FY0,
      'Front coals of the furnace bed, glowing (12 frames) - drawn over the spirit so it sits in the fire',
      drag=False, fps=10, shadow='none')
def furnace_coals():
    return FURN.coals_frames()


@prop('kama_pot', 1, 'counter', BURNERS[0][0] - 33, BURNERS[0][1] - 40, 'Big iron kama pot with a wooden lid', preview=False)
def kama_pot():
    rng = random.Random(1001)
    w, h = 66, 44
    cv = Canvas(w, h)
    body = lathe_shade(w - 6, 30, lambda t: (w - 6) / 2 * math.sqrt(max(0.05, 1 - (t * 0.9) ** 2)), O.IRON,
                       spec=0.05, spec_col='stone4')
    cv.blit(body, 3, 14)
    cv.ellipse(w / 2, 18, w / 2, 4.5, 'stone2')        # the wide flange (hagama)
    cv.hline(1, w - 2, 16, 'stone3'); cv.hline(2, w - 3, 21, 'stone0')
    for k in range(8):                                   # rust streaks
        x = rng.randint(8, w - 10)
        cv.vline(x, 23, 23 + rng.randint(2, 8), 'copper1')
    # wooden lid: planks with a handle bar, seen from slightly above
    cv.ellipse(w / 2, 11, w / 2 - 6, 6, 'wood3')
    for x in range(8, w - 8, 9):
        cv.vline(x, 6, 16, 'wood2')
    cv.hline(10, w - 11, 6, 'wood5')
    cv.rect(w // 2 - 14, 5, 28, 4, 'wood4'); cv.hline(w // 2 - 14, w // 2 + 13, 5, 'wood5')
    cv.hline(w // 2 - 14, w // 2 + 13, 8, 'wood1')
    return O.outline(cv)


@prop('kettle_tetsubin', 1, 'counter', BURNERS[1][0] - 31, BURNERS[1][1] - 50, 'Cast-iron tetsubin kettle: arare bumps, curved spout, rattan-wrapped bail', preview=False)
def tetsubin():
    return TW.tetsubin()


@prop('steam_kama', 1, 'front', BURNERS[0][0] - 12, 140, 'Steam lifting off the kama lid (8 frames)', drag=False, fps=7, preview=False)
def steam_kama():
    return O.steam_frames(24, 56, F8, 4)


@prop('steam_kettle', 1, 'front', BURNERS[1][0] + 30, 134, 'Steam from the kettle spout (8 frames)', drag=False, fps=7, preview=False)
def steam_kettle():
    return O.steam_frames(18, 46, F8, 2)


@prop('hearth_hood', 1, 'wall', FIREBOX['cx'] - 106, 36, 'Copper smoke hood and flue (not placed: the furnace stands bare)', preview=False)
def hood():
    rng = random.Random(1010)
    w, h = 212, 174
    cv = Canvas(w, h)
    # flue pipe up into the ceiling
    pipe = lathe_shade(30, 80, lambda t: 15, O.COPPER, spec=0.06)
    cv.blit(pipe, 91, 0)
    for y in (14, 44, 70):
        band = lathe_shade(34, 4, lambda t: 17, O.COPPER, spec=0.1)
        cv.blit(band, 89, y)
    # drying rod across the flue (herbs hang from it)
    cv.rect(2, 22, w - 4, 4, 'wood3'); cv.hline(2, w - 3, 22, 'wood5'); cv.hline(2, w - 3, 25, 'wood1')
    for x in (4, w - 8):
        cv.rect(x, 18, 4, 10, 'stone1')
    # hood: a trapezoid of riveted copper panels
    top_y, bot_y = 76, 160
    pts = [(78, top_y), (134, top_y), (w - 2, bot_y), (2, bot_y)]
    m = poly_mask(w, h, pts)
    from shade import paint as _paint
    hood_cv = _paint(m, O.COPPER, profile='flat', R=10, spec=0.05, spec_col='copper4')
    cv.blit(hood_cv, 0, 0)
    for k in range(1, 5):                              # panel seams + rivets
        t = k / 5
        xa = 78 + (2 - 78) * t
        xb = 134 + (w - 2 - 134) * t
        y = int(top_y + (bot_y - top_y) * t)
        cv.hline(int(xa) + 1, int(xb) - 1, y, 'copper1')
        for x in range(int(xa) + 4, int(xb) - 3, 8):
            cv.px(x, y - 2, 'copper4'); cv.px(x + 1, y - 1, 'copper0')
    for _ in range(26):                                # verdigris + soot
        x, y = rng.randint(10, w - 10), rng.randint(top_y + 6, bot_y - 2)
        if m[y, x]:
            cv.px(x, y, rng.choice(('teal2', 'teal1', 'copper0')))
            if rng.random() < 0.5:
                cv.px(x + 1, y + 1, 'teal1')
    for y in range(bot_y - 16, bot_y):
        for x in range(w):
            if m[y, x] and (x + y) % 2 == 0:
                cv.shift(x, y, -1)
    # thick lip + rail with hooks: ladle, strainer, tongs
    cv.rect(0, bot_y, w, 6, 'copper2'); cv.hline(0, w - 1, bot_y, 'copper4'); cv.hline(0, w - 1, bot_y + 5, 'copper0')
    cv.rect(0, bot_y + 6, w, 2, 'stone1')
    for (hx, kind) in ():                                 # (utensils come later)
        cv.px(hx, bot_y + 8, 'stone3'); cv.px(hx, bot_y + 9, 'stone2')
        if kind == 'ladle':
            cv.vline(hx, bot_y + 10, bot_y + 26, 'wood3')
            cv.ellipse(hx, bot_y + 28, 4, 3, 'copper2'); cv.px(hx - 2, bot_y + 27, 'copper4')
        elif kind == 'strainer':
            cv.vline(hx, bot_y + 10, bot_y + 18, 'gold1')
            cv.ellipse(hx, bot_y + 22, 6, 4, 'gold2')
            for k in range(-4, 5, 2):
                cv.vline(hx + k, bot_y + 19, bot_y + 25, 'gold0')
        else:
            cv.line(hx, bot_y + 10, hx - 3, bot_y + 30, 'stone2'); cv.line(hx, bot_y + 10, hx + 3, bot_y + 30, 'stone1')
    # Kojin fire-god charm pasted on the hood (for the spirit)
    cv.rect(98, 96, 16, 44, 'paper4'); cv.vline(113, 96, 139, 'paper2'); cv.hline(98, 113, 139, 'paper2')
    for i, ch in enumerate('FIRE'):
        text(cv, 105, 99 + i * 7, ch, 'red2' if i % 2 == 0 else 'ink', rng, True)
    cv.rect(102, 128, 8, 8, 'red3'); cv.px(103, 129, 'red5')
    return O.outline(cv)


def _herb_bundle(seed, colors, f, n=F8):
    rng = random.Random(seed)
    L = rng.randint(40, 52)
    w = 24
    cv = Canvas(w, L + 4)
    ph = rng.uniform(0, 6.28)
    sw = math.sin(2 * math.pi * f / n + ph)
    for j in range(12):                                   # string
        cv.px(w // 2 + int(round(sw * j / 30)), j, 'paper1')
    top = 12
    cv.rect(w // 2 - 3 + int(round(sw * 0.4)), top, 6, 3, 'red3')
    for k in range(26):
        ang = rng.uniform(-0.45, 0.45)
        ln = rng.randint(18, L - 14)
        for j in range(ln):
            t = j / ln
            x = w / 2 + math.sin(ang) * j * 0.55 + sw * (top + j) / 22
            y = top + 3 + j
            c = colors[min(len(colors) - 1, int(t * len(colors) + rng.random() * 0.8))]
            cv.px(int(round(x)), int(y), c)
            if j % 4 == 0 and t > 0.3:
                cv.px(int(round(x)) + (1 if ang > 0 else -1), int(y) + 1, colors[-1])
    return O.outline(cv)


_HX = FIREBOX['cx'] - 106                     # herbs hang from a plain drying pole over the furnace


@prop('drying_pole', 1, 'ceiling', _HX, 40, 'Old bamboo drying pole hung from the roof on frayed rope, herbs tied along it')
def drying_pole():
    rng = random.Random(1015)
    w = 212
    cv = Canvas(w, 24)
    for rx in (12, w - 14):                         # frayed rope up to the rafters
        for y in range(0, 19):
            cv.px(rx + (1 if y % 5 == 2 else 0), y, 'paper1' if y % 3 else 'paper0')
        cv.px(rx - 1, 19, 'paper0'); cv.px(rx + 1, 19, 'paper1')
    for x in range(2, w - 2):                       # the pole: weathered bamboo with nodes
        cv.px(x, 18, 'paper2'); cv.px(x, 19, 'paper1'); cv.px(x, 20, 'wood2'); cv.px(x, 21, 'wood1')
        if x % 37 == 5:
            cv.vline(x, 18, 21, 'wood1'); cv.px(x + 1, 18, 'paper3')
    for _ in range(10):                             # mould and soot along it
        x = rng.randint(4, w - 6)
        cv.px(x, 19, 'stone1'); cv.px(x + 1, 20, 'wood0')
    cv.px(1, 19, 'wood1'); cv.px(w - 2, 19, 'wood1')
    return O.outline(cv)
for _i, (_name, _x, _cols) in enumerate((('herbs_drying_a', _HX + 12, ['leaf1', 'leaf2', 'leaf3', 'paper1']),
                                          ('herbs_drying_b', _HX + 38, ['leaf1', 'purp1', 'purp2', 'purp3']),
                                          ('herbs_drying_c', _HX + 132, ['leaf2', 'leaf1', 'paper3', 'gold3']),
                                          ('herbs_drying_d', _HX + 158, ['leaf1', 'leaf2', 'red2', 'red3']))):
    def _mk(i=_i, cols=_cols):
        return [_herb_bundle(1020 + i, cols, f) for f in range(F8)]
    prop(_name, 1, 'ceiling', _x, 60, 'Herb bundle drying in the hearth smoke (8-frame sway)', fps=5)(_mk)


# ---------------------------------------------------------------- recipe board
@prop('recipe_board', 1, 'wall', 246, 74, 'Big chalkboard, wiped clean: only faint smudges of old chalk, a chalk ledge, brass corners')
def recipe_board():
    rng = random.Random(1100)
    w, h = 236, 122
    cv = Canvas(w, h)
    cv.rect(0, 0, w, h, 'teal0')
    for _ in range(120):                                  # faint smudges where the chalk was wiped off
        x, y = rng.randint(10, w - 26), rng.randint(10, h - 18)
        ln = rng.randint(6, 26)
        for k in range(ln):
            if (x + k + y) % 2 == 0:
                cv.px(x + k, y + (k * 3) // ln, 'teal1')
    # frame with brass corners
    ring = ['wood1', 'wood3', 'wood4', 'wood4', 'wood3', 'wood2', 'wood0']
    for i, c in enumerate(ring):
        cv.frame(i, i, w - 2 * i, h - 2 * i, c)
    for (cx_, cy_) in ((0, 0), (w - 12, 0), (0, h - 12), (w - 12, h - 12)):
        cv.rect(cx_, cy_, 12, 12, 'gold1')
        cv.hline(cx_, cx_ + 11, cy_, 'gold3'); cv.vline(cx_, cy_, cy_ + 11, 'gold2')
        cv.px(cx_ + 5, cy_ + 5, 'gold3'); cv.px(cx_ + 6, cy_ + 6, 'gold0'); cv.px(cx_ + 10, cy_ + 10, 'teal2')
    for _ in range(6):
        side = rng.choice('tb')
        chip(cv, rng.randint(16, w - 34), 0 if side == 't' else h - 7, rng.randint(8, 18), 7, rng,
             under='wood2', under_dark='wood0', n=2, elong=0.6)
    cv.rect(12, h - 8, w - 24, 5, 'wood4'); cv.hline(12, w - 13, h - 8, 'wood5'); cv.hline(12, w - 13, h - 4, 'wood2')
    cv.rect(44, h - 11, 8, 3, 'white'); cv.rect(56, h - 11, 6, 3, 'pink3')
    cv.rect(190, h - 13, 18, 5, 'wood3'); cv.rect(190, h - 9, 18, 1, 'stone3')
    return cv


CARDS = {'leaf': ('SENCHA', ['80C', '2 MIN', '3G LEAF']),
         'teapot': ('HOJICHA', ['95C', '1 MIN', 'ROAST']),
         'flower': ('ROSE', ['90C', '4 MIN', 'HONEY']),
         'drops': ('MIZU', ['COLD', '8 HRS', 'SLOW']),
         'burnt': ('SECRET', ['DONT', 'TELL', 'FIRE'])}


def _recipe_card(seed, icon):
    rng = random.Random(seed)
    w, h = rng.randint(36, 40), rng.randint(46, 52)
    cv = Canvas(w, h + 6)
    cv.blit(torn_paper(rng, w, h, lines=False, burnt=(icon == 'burnt'), fold=False, stain=False, age=0.92), 0, 6)
    cv.rect(w // 2 - 2, 0, 4, 10, 'wood4'); cv.vline(w // 2 - 2, 0, 9, 'wood5'); cv.vline(w // 2 + 1, 0, 9, 'wood2')
    cv.px(w // 2 - 1, 4, 'stone2')
    title, lines = CARDS[icon]
    text(cv, max(3, (w - len(title) * 4) // 2), 10, title, 'red1', rng, True)
    cv.hline(4, w - 5, 16, 'red0')
    ix, iy = w // 2, 21
    if icon == 'leaf':
        for k in range(13):
            cv.px(ix - 6 + k, iy + 4 - k // 2, 'leaf2')
        for k in range(1, 12):
            cv.px(ix - 6 + k, iy + 1 - k // 2 - (1 if 2 < k < 9 else 0), 'leaf3')
            cv.px(ix - 6 + k, iy + 5 - k // 2, 'leaf1')
    elif icon == 'teapot':
        cv.ellipse(ix, iy + 1, 7, 4, 'wood2'); cv.ellipse(ix, iy + 1, 6, 3, 'wood3')
        cv.line(ix + 7, iy, ix + 11, iy - 3, 'wood2'); cv.hline(ix - 3, ix + 3, iy - 3, 'wood2')
    elif icon == 'flower':
        flower(cv, ix, iy + 1, 'red4', 'gold3', size=2)
        cv.vline(ix, iy + 4, iy + 7, 'leaf2')
    elif icon == 'drops':
        for k in range(3):
            cv.px(ix - 6 + k * 6, iy, 'water1'); cv.px(ix - 6 + k * 6, iy + 1, 'water2'); cv.px(ix - 7 + k * 6, iy + 1, 'water1')
    else:
        text(cv, ix - 5, iy - 2, '?!', 'red2', rng, True)
    for i, ln in enumerate(lines):
        text(cv, 4, iy + 8 + i * 7, ln, 'wood1', rng, True)
    return cv


for _i, (_ic, _x, _y) in enumerate((('leaf', 326, 80), ('teapot', 362, 80), ('flower', 398, 81), ('drops', 434, 80),
                                     ('burnt', 436, 132))):
    def _mk(i=_i, ic=_ic):
        return _recipe_card(1110 + i, ic)
    prop(f'recipe_card_{"abcde"[_i]}', 1, 'wall', _x, _y, f'Recipe card ({_ic})')(_mk)


# ---------------------------------------------------------------- storage shelf
@prop('wall_shelf_long', 1, 'wall', 224, 66, 'Long storage shelf with carved brackets', preview=False)
def wall_shelf():
    rng = random.Random(1200)
    w = 412
    cv = Canvas(w, 20)
    cv.rect(0, 0, w, 3, 'wood2'); cv.hline(0, w - 1, 0, 'wood3')       # underside (above eye level)
    wood_grain_h(cv, 0, 3, w, 5, R('wood', 3), rng, dark=R('wood', 2), light=R('wood', 4))
    cv.hline(0, w - 1, 3, 'wood5'); cv.hline(0, w - 1, 7, 'wood1')
    for bx in (14, w // 2 - 4, w - 22):
        for k in range(12):
            wdt = max(1, 9 - int(k * 0.75))
            cv.hline(bx, bx + wdt, 8 + k, 'wood2')
            cv.px(bx, 8 + k, 'wood3'); cv.px(bx + wdt, 8 + k, 'wood1')
        cv.px(bx + 3, 11, 'stone1')
    for x in range(36, w - 20, 41):
        cv.px(x, 8, 'leaf1'); cv.px(x + 1, 9, 'leaf2')
    return O.outline(cv)


SHELF_ITEMS = [
    ('jar_green_tea', 236, lambda r: O.glass_jar(r, 22, 32, ('leaf2', 'leaf3', 'leaf1'), word='SEN'), 'Jar of green tea leaves'),
    ('jar_dried_blossom', 262, lambda r: O.glass_jar(r, 20, 28, ('pink2', 'pink3', 'paper3', 'pink1'), lid='gold', word='ROS'), 'Jar of dried blossoms'),
    ('jar_goji', 286, lambda r: O.glass_jar(r, 16, 22, ('red3', 'red4', 'red2'), lid='metal', label=False), 'Small jar of berries'),
    ('tin_red', 306, lambda r: O.tin(r, 20, 26, 'red', 'gold'), 'Red tea tin'),
    ('tin_jade', 330, lambda r: O.tin(r, 18, 22, 'jade', 'paper'), 'Dented jade tea tin'),
    ('sack_leaves_small', 352, lambda r: O.sack(r, 30, 32, spill=('leaf2', 'leaf3')), 'Small sack of tea leaves'),
    ('sack_roasted', 384, lambda r: O.sack(r, 26, 28, base='paper', tie='indigo2'), 'Small sack of roasted leaves'),
    ('bottle_amber', 412, lambda r: _bottle(r, 12, 32, O.BRASS), 'Amber tincture bottle'),
    ('crock_celadon', 428, lambda r: O.ceramic_jar(r, 26, 30, O.CELADON[1:], pattern='drip'), 'Celadon storage crock'),
    ('scroll_bundle', 460, lambda r: _scrolls(r), 'Bundle of rolled recipe scrolls'),
    ('jar_hojicha', 506, lambda r: O.glass_jar(r, 22, 34, ('wood2', 'wood3', 'wood1'), lid='wood', word='HOJ'), 'Tall jar of hojicha'),
    ('potted_basil', 534, lambda r: O.potted(r, 20, 14, O.leafy_plant(r, 28, 22)), 'Pot of fresh herbs'),
    ('mortar_spare', 566, lambda r: _mortar(r, 26, 18), 'Spare stone mortar'),
]


def _bottle(rng, w, h, glass):
    cv = Canvas(w, h)
    cv.rect(w // 2 - 2, 0, 4, 4, 'wood4'); cv.hline(w // 2 - 2, w // 2 + 1, 0, 'wood5')
    neck = lathe_shade(6, 7, lambda t: 3, glass[1:], spec=0.1)
    cv.blit(neck, w // 2 - 3, 4)
    body = lathe_shade(w, h - 11, lambda t: w / 2 * (0.8 if t < 0.08 else 1), glass[1:], spec=0.12, spec_col='white')
    cv.blit(body, 0, 11)
    cv.rect(1, 17, w - 2, 8, 'paper3'); cv.hline(1, w - 2, 17, 'paper4'); text(cv, 1, 19, 'OIL', 'wood1')
    return O.outline(cv)


def _scrolls(rng):
    cv = Canvas(42, 16)
    for (y, x, ln) in ((9, 0, 40), (5, 3, 36), (10, 6, 30), (1, 9, 28)):
        sc = lathe_shade(ln, 5, lambda t: ln / 2, ['paper1', 'paper2', 'paper3', 'paper4'])
        rot = Canvas(ln, 5)
        for yy in range(5):
            for xx in range(ln):
                c = 'paper3' if yy < 2 else ('paper2' if yy < 4 else 'paper1')
                rot.px(xx, yy, c)
        rot.vline(0, 0, 4, 'paper2'); rot.px(0, 2, 'paper0'); rot.vline(ln - 1, 0, 4, 'paper1')
        cv.blit(rot, x, y)
    cv.vline(20, 0, 15, 'red3'); cv.vline(21, 0, 15, 'red2')
    return O.outline(cv)


def _mortar(rng, w, h, pestle=True):
    cv = Canvas(w, h + 8)
    body = lathe_shade(w, h, lambda t: w / 2 * (1 - t * t * 0.3), O.IRON[1:], spec=0.03)
    cv.blit(body, 0, 8)
    cv.ellipse(w / 2, 9, w / 2 - 0.5, 2.5, 'stone4')
    cv.ellipse(w / 2, 9.5, w / 2 - 3, 1.5, 'leaf2')
    if pestle:
        cv.line(w - 5, 0, w // 2, 9, 'wood3'); cv.line(w - 4, 0, w // 2 + 1, 9, 'wood2'); cv.line(w - 6, 1, w // 2 - 1, 9, 'wood4')
    return O.outline(cv)


ON_CHEST = {'jar_green_tea': 492, 'jar_dried_blossom': 516, 'jar_hojicha': 538, 'potted_basil': 562}
for _i, (_n, _x, _fn, _d) in enumerate(SHELF_ITEMS):
    def _mk(i=_i, fn=_fn):
        return fn(random.Random(1210 + i))
    _probe = _fn(random.Random(1210 + _i))
    if _n in ON_CHEST:                                 # these stand on top of the apothecary chest
        prop(_n, 1, 'wall', ON_CHEST[_n], CHEST_TOP_Y - _probe.h + 1, _d)(_mk)
    else:                                              # spare storage pieces, not placed by default
        prop(_n, 1, 'wall', _x, 66 - _probe.h + 1, _d, preview=False)(_mk)


# ---------------------------------------------------------------- apothecary chest
@prop('apothecary_chest', 1, 'wall', 490, CHEST_TOP_Y, 'Tea-ingredient apothecary chest: 25 drawers, one missing, one pulled out')
def apothecary():
    rng = random.Random(1300)
    w, h = 97, 100
    cv = Canvas(w, h)
    wood_face(cv, 0, 10, w, h - 16, rng, 'wood', 2, 'v')
    cv.rect(-1, 0, w + 2, 10, 'wood3'); cv.hline(0, w - 1, 0, 'wood5'); cv.hline(0, w - 1, 1, 'wood4')
    cv.hline(0, w - 1, 9, 'wood1'); cv.rect(3, 3, w - 6, 3, 'jade2'); cv.hline(3, w - 4, 3, 'jade4')
    cols, rows = 5, 5
    dw, dh = 17, 15
    ox, oy = 4, 13
    missing, pulled = (3, 4), (1, 2)
    for r in range(rows):
        for c in range(cols):
            x, y = ox + c * (dw + 1), oy + r * (dh + 1)
            if (c, r) == missing:
                cv.rect(x, y, dw, dh, 'ink'); cv.hline(x, x + dw - 1, y, 'wood0')
                cv.px(x + 3, y + dh - 2, 'leaf2'); cv.px(x + 4, y + dh - 3, 'leaf3'); cv.px(x + 3, y + dh - 4, 'leaf3')
                cv.px(x + 5, y + dh - 5, 'leaf4')
                continue
            wood_face(cv, x, y, dw, dh, rng, 'wood', 3, 'h', knots=False)
            cv.hline(x, x + dw - 1, y, 'wood5'); cv.vline(x, y, y + dh - 1, 'wood4')
            cv.hline(x, x + dw - 1, y + dh - 1, 'wood1'); cv.vline(x + dw - 1, y, y + dh - 1, 'wood1')
            cv.rect(x + 4, y + 2, dw - 8, 5, 'paper3' if (c + r) % 3 else 'paper2')
            glyph(cv, rng, x + 6, y + 2, 5, 'wood1')
            ring_pull(cv, x + dw // 2, y + 9, 2)
    c, r = pulled
    x, y = ox + c * (dw + 1) - 2, oy + r * (dh + 1) + 4
    cv.rect(x, y - 3, dw + 4, 4, 'wood1')
    for k in range(14):
        cv.px(x + 1 + rng.randint(0, dw + 2), y - 3 + rng.randint(0, 2), rng.choice(('leaf2', 'leaf3', 'leaf1', 'leaf4')))
    wood_face(cv, x, y + 1, dw + 4, dh, rng, 'wood', 4, 'h', knots=False)
    cv.hline(x, x + dw + 3, y + 1, 'wood5'); cv.hline(x, x + dw + 3, y + dh, 'wood2')
    ring_pull(cv, x + dw // 2 + 2, y + 9, 2)
    for k in range(6):
        cv.px(x + 3 + k * 3, y + dh + 2 + (k % 2), 'leaf2')
    for fx in (3, w - 11):
        cv.rect(fx, h - 6, 8, 6, 'wood1'); cv.hline(fx, fx + 7, h - 6, 'wood3')
    cobweb(cv, w - 3, 12, 12, 'stone3', 'stone2', 'tr')
    return O.outline(cv)


# ---------------------------------------------------------------- prep table
@prop('cutting_board_leaves', 1, 'counter', 276, TABLE_Y - 22, 'Thick hinoki cutting board: a heap of fresh tea leaves, chopped bits, a nakiri knife')
def cutting_board():
    return CR.cutting_board()


@prop('mortar_pestle', 1, 'counter', 366, TABLE_Y - 30, 'Suribachi grinding bowl with ground matcha and a wooden pestle')
def mortar():
    return CR.suribachi()


@prop('basket_fresh_leaves', 1, 'counter', 406, TABLE_Y - 46, 'Woven bamboo basket heaped with fresh-picked tea leaves')
def basket_leaves():
    return CR.basket(62, 34, CR.leaf_heap(54, 18))


@prop('balance_scale', 1, 'counter', 476, TABLE_Y - 48, 'Brass balance scale for weighing leaves')
def scale():
    cv = Canvas(52, 48)
    base = lathe_shade(20, 6, lambda t: 10 - t * 2, O.BRASS[1:], spec=0.1)
    cv.blit(base, 16, 42)
    pole = lathe_shade(4, 34, lambda t: 2, O.BRASS[1:], spec=0.1)
    cv.blit(pole, 24, 8)
    cv.line(4, 11, 48, 8, 'gold2'); cv.line(4, 12, 48, 9, 'gold1')
    cv.ellipse(26, 7, 3, 3, 'gold3'); cv.px(25, 6, 'gold4')
    for (cx, cy) in ((5, 11), (47, 8)):
        cv.line(cx, cy, cx - 6, cy + 14, 'gold0'); cv.line(cx, cy, cx + 6, cy + 14, 'gold0')
        pan = lathe_shade(18, 4, lambda t: 9 - t * 4, O.BRASS[1:], spec=0.15)
        cv.blit(pan, cx - 9, cy + 14)
        cv.ellipse(cx, cy + 14, 8.5, 1.6, 'gold3')
    for (x, y) in ((44, 21), (47, 21), (45, 20), (49, 21), (46, 19)):
        cv.px(x, y, 'leaf3')
    cv.rect(2, 22, 4, 3, 'stone2'); cv.rect(7, 23, 3, 2, 'stone3')
    return O.outline(cv)


@prop('jar_open_table', 1, 'counter', 478, TABLE_Y - 34, 'Jar of hojicha on the table, lid off', preview=False)
def jar_open():
    cv = O.glass_jar(random.Random(1430), 22, 34, ('wood2', 'wood3', 'wood1'), lid='wood', word='HOJ')
    cv.rect(0, 0, cv.w, 6, None)
    return cv


@prop('tea_brick', 1, 'counter', 506, TABLE_Y - 14, 'Paper-wrapped pressed tea cake, half unwrapped', preview=False)
def tea_brick():
    cv = Canvas(36, 14)
    cv.ellipse(18, 7, 17, 6, 'paper3')
    cv.ellipse(18, 6, 15, 4.5, 'paper4')
    cv.ellipse(24, 7, 9, 4, 'wood2'); cv.ellipse(24, 6, 8, 3, 'wood3')
    for k in range(6):
        cv.px(19 + k * 2, 6 + (k % 2), 'wood1')
    cv.rect(8, 4, 6, 4, 'red3'); glyph(cv, random.Random(3), 9, 4, 4, 'paper4')
    return O.outline(cv)


# ---------------------------------------------------------------- under the table
@prop('sack_big', 1, 'floor', 294, TABLE_SHELF_Y - 46, 'Burlap sack of tea, rope-tied, a stencilled mark and a paper tag')
def sack_big():
    return CR.sack(46, 46)


@prop('sack_big_torn', 1, 'floor', 272, TABLE_SHELF_Y - 42, 'Torn sack, leaves spilling out', preview=False)
def sack_torn():
    cv = O.sack(random.Random(1501), 42, 42, base='paper', tie='jade2')
    for k in range(14):
        cv.px(30 + k % 5, 30 + k // 4, 'leaf1' if k % 2 else 'leaf2')
    cv.rect(31, 25, 6, 4, 'ink')
    return cv


@prop('firewood', 1, 'floor', 348, TABLE_SHELF_Y - 34, 'Split oak firewood stacked end-on for the furnace')
def firewood():
    return CR.firewood()


@prop('bucket_water', 1, 'floor', 448, TABLE_SHELF_Y - 38, 'Wooden stave bucket of water with copper hoops')
def bucket():
    return CR.bucket()


@prop('crate_jars', 1, 'floor', 448, TABLE_SHELF_Y - 38, 'Crate of spare jars, one broken', preview=False)
def crate():
    rng = random.Random(1520)
    cv = Canvas(64, 38)
    for i in range(4):
        cv.blit(O.glass_jar(rng, 13, 18, rng.choice((('leaf2', 'leaf3'), ('red3', 'red2'), ('wood2', 'wood3'))),
                            label=False, string=False), 3 + i * 15, 0)
    wood_face(cv, 0, 14, 64, 24, rng, 'wood', 3, 'h', plank=8)
    cv.vline(1, 14, 37, 'wood5'); cv.vline(62, 14, 37, 'wood1'); cv.hline(0, 63, 14, 'wood5')
    glyph(cv, rng, 27, 20, 8, 'wood1')
    for (x, y) in ((50, 10), (52, 11), (51, 9)):
        cv.px(x, y, 'white')
    return O.outline(cv)


@prop('basket_dried_flowers', 1, 'floor', 532, TABLE_SHELF_Y - 32, 'Shallow basket of dried chamomile, rosebuds and lavender')
def basket_round():
    return CR.flower_basket()


@prop('tsubo_jar', 1, 'floor', 492, TABLE_SHELF_Y - 42, 'Clay storage jar with an ash-glaze shoulder, its mouth tied over with indigo cloth')
def tsubo():
    return CR.tsubo()
