"""The rooms through the year: what changes inside the teahouse each season.

window_layer(season, shell): drawn between the view outside and the room shell,
so it only shows in the window openings (the lattice draws over it):
    spring   cherry petals blown onto the outer sills and stuck to the glass
    autumn   maple leaves caught on the sills and the glass
    winter   frost growing in from the edge of every pane, snow heaped on the
             outer sills, icicles hanging from the top of each opening
    (summer has none)

Seasonal things in the rooms (SEASON_PROPS, registered like the other props
but only placed in their season):
    spring   a cherry branch in an indigo vase (seating counter), hanami dango
             (tea counter), fresh bamboo shoots in a basket (prep table)
    summer   shaved ice with strawberry syrup (seating counter), a paper fan
             (tea counter), watermelon on a plate (prep table)
    autumn   strings of dried persimmons on the drying pole, a bowl of ripe
             persimmons (seating counter), a moon-viewing offering of dango and
             pampas grass (tea counter)
    winter   daikon hung to dry on the pole, a bowl of mandarins (seating
             counter), a snow rabbit on the window sill, kagami mochi (tea counter)"""
import math
import random
import numpy as np
from pixel import Canvas, PAL, step
from shade import paint, lathe_shade, ellipse_mask, poly_mask, mask_of
import objects as O
from layout import W, H, COUNTER_Y, TABLE_Y, SILL_Y, WIN_MAIN, WIN_ROUND, WIN_BELL

SEASON_PROPS = []


def sprop(season, name, room, layer, x, y, desc, drag=True, fps=None):
    """Register a seasonal prop: (x, y) is its top-left in the scene. Pass y=None
    with bottom=... handled by the caller: here y is computed from the sprite height."""
    def deco(fn):
        SEASON_PROPS.append(dict(season=season, name=name, room=room, layer=layer, x=x, y=y, desc=desc,
                                 drag=drag, fps=fps, fn=fn, preview=True, shadow='auto', meta=None))
        return fn
    return deco


def placed(season):
    """The seasonal props for a season, each with its sprite drawn and its y set so
    it stands on its surface (y given as ('on', surface_y) sits the bottom there)."""
    out = []
    for p in SEASON_PROPS:
        if p['season'] != season:
            continue
        q = dict(p)
        out.append(q)
    return out


def _on(surface_y, h):
    return surface_y - h


# ---------------------------------------------------------------- the window glass
def _openings(shell):
    """Masks of the three window openings (the transparent panes of the shell)."""
    clear = shell.a[..., 3] == 0
    yy, xx = np.mgrid[0:H, 0:W]
    boxes = []
    wm = WIN_MAIN
    boxes.append(('main', (wm['x'] - 4, wm['y'] - 4, wm['x'] + wm['w'] + 4, wm['y'] + wm['h'] + 4)))
    r = WIN_ROUND['r']
    boxes.append(('round', (WIN_ROUND['cx'] - r - 4, WIN_ROUND['cy'] - r - 4, WIN_ROUND['cx'] + r + 4,
                            WIN_ROUND['cy'] + r + 4)))
    boxes.append(('bell', (WIN_BELL['cx'] - WIN_BELL['hw'] - 4, WIN_BELL['top'] - 4, WIN_BELL['cx'] + WIN_BELL['hw'] + 4,
                           WIN_BELL['bottom'] + 4)))
    out = []
    for name, (x0, y0, x1, y1) in boxes:
        m = clear & (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1)
        out.append((name, m, (x0, y0, x1, y1)))
    return out


def _hash(x, y, s):
    h = np.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453
    return h - np.floor(h)


def _dist_in(m, n=12):
    """Distance (in px, up to n) from each pixel of m to the nearest pixel outside it."""
    d = np.zeros(m.shape, np.float32)
    cur = m.copy()
    for k in range(n):
        d[cur] += 1
        p = np.pad(cur, 1)
        cur = p[1:-1, 1:-1] & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
        if not cur.any():
            break
    return d


def window_layer(season, shell):
    if season == 'summer':
        return None
    cv = Canvas(W, H)
    a = cv.a
    rng = random.Random({'spring': 1, 'autumn': 2, 'winter': 3}[season])
    yy, xx = np.mgrid[0:H, 0:W]
    for name, m, (x0, y0, x1, y1) in _openings(shell):
        if not m.any():
            continue
        cols = np.nonzero(m.any(0))[0]
        bottom = {int(c): int(np.nonzero(m[:, c])[0].max()) for c in cols}
        top = {int(c): int(np.nonzero(m[:, c])[0].min()) for c in cols}
        if season == 'winter':
            # frost: thick at the edge of every pane, feathering out in crystals
            d = _dist_in(m, 14)
            n1 = _hash(np.floor(xx / 3.0), np.floor(yy / 3.0), 2.0)
            n2 = _hash(xx, yy, 7.0)
            reach = 2.5 + 7 * n1
            fern = (np.sin((xx + yy) * 0.9) * np.sin((xx - yy) * 0.7) > 0.55)
            frost = m & ((d < reach * 0.55) | ((d < reach) & (fern | (n2 < 0.25))))
            a[frost & (d < 2.5)] = (*PAL['white'], 200)
            a[frost & (d >= 2.5)] = (*PAL['cloud3'], 150)
            a[frost & (d >= 2.5) & (n2 < 0.08)] = (*PAL['white'], 220)     # glints
            # snow heaped on the outer sill, soft and rounded, blue in its shadow
            for c in cols:
                b = bottom[c]
                hs = int(3 + 2.2 * math.sin(c * 0.08 + 1) + 1.4 * math.sin(c * 0.23) + 1.5)
                for k in range(hs):
                    y = b - k
                    if m[y, c]:
                        a[y, c] = (*PAL['white' if k >= hs - 2 else ('cloud3' if k > 1 else 'cloud2')], 255)
            # icicles from the top of the opening
            for c in cols:
                if rng.random() < 0.22:
                    ln = rng.randint(2, 9)
                    t = top[c]
                    for k in range(ln):
                        y = t + k
                        if m[y, c]:
                            a[y, c] = (*PAL['white' if k < ln * 0.4 else ('cloud3' if k < ln - 1 else 'haze3')], 230)
        else:
            # petals or leaves: on the outer sill and a few stuck to the glass
            pcols = (['pink4', 'pink3', 'white', 'pink2'] if season == 'spring'
                     else ['scarlet2', 'fire3', 'gold3', 'copper2', 'scarlet3'])
            for c in cols:
                b = bottom[c]
                if rng.random() < (0.55 if season == 'spring' else 0.4):
                    k = rng.randint(0, 2)
                    if m[b - k, c]:
                        a[b - k, c] = (*PAL[rng.choice(pcols)], 255)
                        if season == 'autumn' and m[b - k, min(W - 1, c + 1)]:
                            a[b - k, c + 1] = (*PAL[rng.choice(pcols)], 255)
            ys, xs = np.nonzero(m)
            for _ in range(10 if season == 'spring' else 6):
                i = rng.randrange(len(ys))
                y, x = ys[i], xs[i]
                if season == 'spring':
                    cells = [(0, 0, 'pink4'), (1, 0, 'pink3'), (0, 1, 'white')]
                else:
                    c1, c2 = rng.choice((('scarlet2', 'scarlet1'), ('fire3', 'copper2'), ('gold3', 'gold1')))
                    cells = [(0, 0, c1), (1, 0, c1), (-1, 0, c1), (0, -1, c1), (0, 1, c2), (1, 1, c2), (-1, -1, c1),
                             (1, -1, c1), (0, 2, 'wood1')]
                for dx, dy, cc in cells:
                    if 0 <= y + dy < H and 0 <= x + dx < W and m[y + dy, x + dx]:
                        a[y + dy, x + dx] = (*PAL[cc], 255)
    return cv


# ---------------------------------------------------------------- small helpers
def _blossom(cv, x, y, big=True):
    """A cherry blossom: five pale petals round a deep pink centre."""
    if big:
        for dx, dy, c in ((0, -1, 'pink4'), (-1, 0, 'pink4'), (1, 0, 'white'), (-1, 1, 'pink3'), (1, 1, 'pink4'),
                          (0, 0, 'pink2')):
            cv.px(x + dx, y + dy, c)
    else:
        cv.px(x, y, 'pink3')
        cv.px(x + 1, y, 'pink4')


def _twig(cv, pts, c='bark1', hi='bark3'):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        cv.line(int(x0), int(y0), int(x1), int(y1), c)
        cv.line(int(x0), int(y0) - 1, int(x1), int(y1) - 1, hi) if abs(x1 - x0) > abs(y1 - y0) else None


def _fruit(w, h, ramp, spec=0.25, calyx=None):
    m = ellipse_mask(w, h, w / 2, h / 2, w / 2 - 0.3, h / 2 - 0.3, wobble=0.05)
    cv = paint(m, ramp, profile='round', amb=0.25, spec=spec, spec_col=ramp[-1])
    if calyx:
        cx = w // 2
        cv.px(cx, 0, calyx[0]); cv.px(cx - 1, 1, calyx[1]); cv.px(cx + 1, 1, calyx[1]); cv.px(cx, 1, calyx[0])
    return cv


def _sanbo(w):
    """A plain wooden offering stand: a square tray on a pierced base."""
    h = 12
    cv = Canvas(w, h)
    cv.rect(0, 0, w, 3, 'hinoki3'); cv.hline(0, w - 1, 0, 'hinoki5'); cv.hline(0, w - 1, 2, 'hinoki1')
    cv.rect(3, 3, w - 6, h - 3, 'hinoki2'); cv.vline(3, 3, h - 1, 'hinoki4'); cv.vline(w - 4, 3, h - 1, 'hinoki1')
    cv.ellipse(w // 2, 7, 3, 2.2, 'hinoki0')
    cv.hline(3, w - 4, h - 1, 'hinoki1')
    return cv


# ---------------------------------------------------------------- spring
@sprop('spring', 'sakura_branch_vase', 2, 'counter', 1176, _on(COUNTER_Y, 92),
       'A branch of cherry blossom in a tall indigo-and-white vase, a few petals fallen on the counter')
def sakura_branch_vase():
    rng = random.Random(501)
    w, h = 64, 92
    cv = Canvas(w, h)
    # the vase: white glaze with an indigo band of waves
    vw, vh = 22, 34
    prof = lambda t: (3.2 if t < 0.12 else 3.2 + 7.6 * math.sin(math.pi * min(1, (t - 0.08) / 0.98)) ** 0.8)
    vase = lathe_shade(vw, vh, prof, ['stone2', 'paper2', 'paper3', 'paper4', 'white'], spec=0.12, spec_col='white')
    for y in range(12, 22):
        for x in range(vw):
            if vase.get(x, y)[3] and (y - 12 + int(2 * math.sin(x * 0.7))) % 5 < 3:
                vase.px(x, y, 'indigo3' if x < vw * 0.6 else 'indigo2')
    vx, vy = 30, h - vh - 2
    # the branch first, so the vase mouth covers its foot
    main = [(vx + 11, vy + 4), (vx + 8, vy - 14), (vx + 2, vy - 30), (vx - 8, vy - 44), (vx - 20, vy - 50)]
    side = [(vx + 8, vy - 14), (vx + 18, vy - 30), (vx + 26, vy - 44)]
    twig2 = [(vx + 2, vy - 30), (vx + 10, vy - 48), (vx + 12, vy - 54)]
    twig3 = [(vx - 8, vy - 44), (vx - 4, vy - 54)]
    for pts in (main, side, twig2, twig3):
        _twig(cv, pts)
    for pts in (main, side, twig2, twig3):
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            for k in range(0, 10, 3):
                t = k / 10
                x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
                if y < vy - 8:
                    for _ in range(2):
                        _blossom(cv, int(x + rng.uniform(-3, 3)), int(y + rng.uniform(-3, 2)), rng.random() < 0.75)
    cv.blit(vase, vx, vy)
    cv.ellipse(vx + vw / 2, vy + 1, 3, 1, 'indigo0')
    for x, y in ((6, h - 2), (12, h - 1), (55, h - 2), (20, h - 1)):                # fallen petals
        cv.px(x, y, 'pink4'); cv.px(x + 1, y, 'pink3')
    return O.outline(cv)


@sprop('spring', 'hanami_dango', 3, 'counter', 1414, _on(COUNTER_Y, 24),
       'Two skewers of hanami dango - pink, white and green - on a red lacquer plate')
def hanami_dango():
    w, h = 46, 24
    cv = Canvas(w, h)
    cv.ellipse(23, 19, 21, 4, 'red1')
    cv.ellipse(23, 18.4, 19, 3, 'red3')
    cv.ellipse(21, 18, 14, 1.6, 'red4')
    ramps = (['pink1', 'pink2', 'pink3', 'pink4'], ['stone3', 'paper3', 'paper4', 'white'],
             ['leaf1', 'leaf2', 'leaf3', 'leaf4'])
    for k, (x0, y0) in enumerate(((5, 15), (9, 9))):
        cv.line(x0, y0 + 3, x0 + 36, y0 + 1, 'hinoki2')
        cv.line(x0, y0 + 2, x0 + 36, y0, 'hinoki4')
        for j, ramp in enumerate(ramps):
            cv.blit(_fruit(9, 8, ramp, spec=0.18), x0 + 6 + j * 8, y0 - 4 - (j * 2) // 3)
    return O.outline(cv)


@sprop('spring', 'bamboo_shoots_basket', 1, 'counter', 404, _on(TABLE_Y, 54),
       'Fresh bamboo shoots, still in their brown husks, in a bamboo basket')
def bamboo_shoots_basket():
    rng = random.Random(503)
    cont = Canvas(44, 42)
    for k, (x, hgt, wid, lean) in enumerate(((11, 34, 8, -4), (23, 40, 9, 1), (33, 31, 8, 5))):
        b = 41
        pts = [(x - wid, b), (x + wid, b), (x + wid * 0.55 + lean * 0.5, b - hgt * 0.55), (x + lean, b - hgt),
               (x - wid * 0.45 + lean * 0.6, b - hgt * 0.55)]
        m = poly_mask(44, 42, pts)
        sh = paint(m, ['wood0', 'wood1', 'copper1', 'copper2', 'gold2'], profile='round', amb=0.25)
        for y in range(int(b - hgt), b + 1):                               # overlapping husk sheaths
            for xx in range(44):
                if sh.get(xx, y)[3] and (y * 3 + (xx - x) * 2) % 9 == 0:
                    sh.px(xx, y, 'wood0')
                elif sh.get(xx, y)[3] and (y * 3 + (xx - x) * 2) % 9 == 1:
                    sh.px(xx, y, 'copper3')
        tx, ty = int(x + lean), int(b - hgt)
        for dx, dy, c in ((0, 0, 'leaf4'), (0, 1, 'gold3'), (1, 1, 'leaf3'), (-1, 2, 'gold3')):
            sh.px(tx + dx, ty + dy, c)
        cont.blit(sh, 0, 0)
    cv = Canvas(48, 54)
    cv.blit(cont, 2, 0)
    cv.blit(O.basket(rng, 46, 30), 0, 22)
    return cv


# ---------------------------------------------------------------- summer
@sprop('summer', 'kakigori', 2, 'counter', 952, _on(COUNTER_Y, 30),
       'Shaved ice heaped in a glass bowl, red strawberry syrup running down it, a little spoon')
def kakigori():
    w, h = 34, 30
    cv = Canvas(w, h)
    glass = lathe_shade(26, 10, lambda t: 13 - 3 * t, ['sky1', 'sky2', 'sky3', 'sky4', 'white'], spec=0.3,
                        spec_col='white')
    m = ellipse_mask(26, 20, 13, 13, 12, 12, wobble=0.04)
    m[15:] = False
    ice = paint(m, ['cloud1', 'cloud2', 'cloud3', 'white'], profile='round', amb=0.35)
    for y in range(20):
        for x in range(26):
            if ice.get(x, y)[3] and (y > 3 + 3 * math.sin(x * 0.5) and y < 9 + 2 * math.sin(x * 0.8)):
                ice.px(x, y, 'scarlet2' if x < 15 else 'scarlet1')
            elif ice.get(x, y)[3] and (x * 7 + y * 3) % 11 == 0:
                ice.px(x, y, 'white')
    cv.blit(ice, 4, 2)
    cv.blit(glass, 4, 17)
    cv.rect(13, 27, 8, 2, 'sky2'); cv.hline(12, 22, 29, 'sky1')
    cv.line(22, 5, 30, 1, 'stone3'); cv.px(30, 1, 'stone4'); cv.px(31, 1, 'stone4')     # the spoon
    return O.outline(cv)


@sprop('summer', 'uchiwa_fan', 3, 'counter', 1430, _on(COUNTER_Y, 20),
       'A round paper fan lying on the counter, painted with a goldfish among waves')
def uchiwa_fan():
    w, h = 50, 20
    cv = Canvas(w, h)
    cv.line(30, 13, 48, 17, 'hinoki2'); cv.line(30, 12, 48, 16, 'hinoki4')
    m = ellipse_mask(32, 16, 16, 8, 15, 7, wobble=0.03)
    face = paint(m, ['paper2', 'paper3', 'paper4', 'white'], profile='flat', amb=0.5)
    for y in range(16):
        for x in range(32):
            if face.get(x, y)[3]:
                if (y + int(1.5 * math.sin(x * 0.5))) % 5 == 0:
                    face.px(x, y, 'sky2')
                if (x - 2) ** 2 + (y - 12) ** 2 > 210:
                    pass
    for dx, dy, c in ((14, 6, 'scarlet2'), (15, 6, 'scarlet3'), (16, 7, 'scarlet2'), (13, 7, 'scarlet2'),
                      (17, 6, 'fire3'), (18, 5, 'scarlet2'), (18, 8, 'scarlet2'), (12, 6, 'ink')):
        face.px(dx, dy, c)
    for k in range(0, 32, 3):                                             # bamboo ribs showing through
        x = 16 + (k - 16)
        face.px(x, 8, 'paper2')
    cv.blit(face, 0, 0)
    return O.outline(cv)


@sprop('summer', 'watermelon_plate', 1, 'counter', 410, _on(TABLE_Y, 20),
       'Wedges of watermelon on a plain plate, black seeds, green rind')
def watermelon_plate():
    w, h = 48, 20
    cv = Canvas(w, h)
    cv.ellipse(24, 15, 22, 4, 'paper2'); cv.ellipse(24, 14.4, 20, 3, 'paper4')
    for k, x in enumerate((6, 18, 30)):
        pts = [(x, 15), (x + 14, 15), (x + 7, 3 + k)]
        m = poly_mask(w, h, pts)
        for y, xx in zip(*np.nonzero(m)):
            c = 'scarlet3' if xx < x + 6 else 'scarlet2'
            if y >= 13:
                c = 'paper4'
            cv.px(xx, y, c)
        cv.hline(x, x + 14, 15, 'leaf2'); cv.hline(x + 1, x + 13, 16, 'leaf1')
        for sx, sy in ((x + 5, 10), (x + 8, 8), (x + 9, 12)):
            cv.px(sx, sy - k, 'ink')
    return O.outline(cv)


# ---------------------------------------------------------------- autumn
@sprop('autumn', 'hoshigaki_persimmons', 1, 'ceiling', 104, 62,
       'Strings of persimmons drying on the pole, turning from bright orange to deep amber')
def hoshigaki_persimmons():
    w, h = 60, 66
    cv = Canvas(w, h)
    for s_, x in enumerate((10, 30, 50)):
        cv.vline(x, 0, h - 6, 'paper2')
        for k in range(5):
            dry = (k + s_) % 3
            ramp = (['red0', 'copper1', 'copper2', 'fire3', 'fire4'], ['red0', 'copper0', 'copper1', 'copper2', 'copper3'],
                    ['red0', 'red1', 'copper1', 'copper2', 'fire3'])[dry]
            f = _fruit(9, 9 - dry, ramp, spec=0.2, calyx=('wood0', 'leaf1'))
            cv.blit(f, x - 4, 6 + k * 11)
    return O.outline(cv)


@sprop('autumn', 'persimmon_bowl', 2, 'counter', 950, _on(COUNTER_Y, 26),
       'A wooden bowl heaped with ripe persimmons, one with a leaf still on')
def persimmon_bowl():
    w, h = 44, 26
    cv = Canvas(w, h)
    for (x, y) in ((8, 6), (18, 3), (27, 6), (13, 10), (23, 10)):
        cv.blit(_fruit(11, 10, ['red0', 'copper2', 'fire2', 'fire3', 'fire4'], spec=0.25, calyx=('wood0', 'leaf1')), x, y)
    cv.px(24, 2, 'leaf2'); cv.px(25, 1, 'leaf3'); cv.px(26, 1, 'leaf3'); cv.px(27, 2, 'leaf2')
    b = O.bowl(40, 12, ['wood0', 'wood1', 'wood2', 'wood3', 'wood4'], top=0)
    cv.blit(b, 1, 13)
    return O.outline(cv)


@sprop('autumn', 'tsukimi_offering', 3, 'counter', 1404, _on(COUNTER_Y, 62),
       'A moon-viewing offering: white dango stacked on a wooden stand, pampas grass in a jar beside it')
def tsukimi_offering():
    w, h = 72, 62
    cv = Canvas(w, h)
    # pampas grass in a small jar
    jar = lathe_shade(14, 18, lambda t: 4.5 + 2.5 * math.sin(math.pi * t), ['wood0', 'wood1', 'copper1', 'copper2'],
                      spec=0.1)
    for k, (dx, top, lean) in enumerate(((0, 4, -6), (3, 0, 2), (6, 6, 8))):
        x0, y0 = 52 + dx, h - 18
        for j in range(y0 - top):
            t = j / (y0 - top)
            x = int(x0 + lean * t * t)
            y = y0 - j
            cv.px(x, y, 'leaf2' if t < 0.65 else 'paper2')
            if t > 0.65:
                cv.px(x - 1, y + 1, 'paper3'); cv.px(x + 1, y + 2, 'paper4' if j % 2 else 'paper3')
    cv.blit(jar, 49, h - 19)
    # the stand and a pyramid of dango
    st = _sanbo(36)
    cv.blit(st, 4, h - 13)
    ball = lambda: _fruit(7, 7, ['stone3', 'paper3', 'paper4', 'white'], spec=0.2)
    for row, n in enumerate((4, 3, 2, 1)):
        for k in range(n):
            cv.blit(ball(), 8 + (4 - n) * 3 + k * 7, h - 20 - row * 5)
    cv.hline(6, 37, h - 13, 'paper4')                                    # the paper under them
    return O.outline(cv)


# ---------------------------------------------------------------- winter
@sprop('winter', 'hanging_daikon', 1, 'ceiling', 104, 60,
       'Daikon radishes hung from the pole to dry for the winter, tied by their leaves')
def hanging_daikon():
    w, h = 60, 70
    cv = Canvas(w, h)
    for k, (x, ln) in enumerate(((12, 46), (28, 52), (44, 42))):
        for j in range(8):                                               # the tied leaves, drooping
            cv.line(x, 0, x - 5 + j, 8 + (j % 3), ('leaf1', 'leaf2', 'gold1')[j % 3])
        cv.hline(x - 2, x + 2, 9, 'paper2')
        m = poly_mask(w, h, [(x - 4, 10), (x + 4, 10), (x + 2, 10 + ln), (x, 12 + ln), (x - 1, 10 + ln)])
        r = paint(m, ['stone3', 'paper2', 'paper3', 'paper4', 'white'], profile='round', amb=0.3)
        for y in range(10, 12 + ln, 4):                                  # wrinkles from drying
            for xx in range(w):
                if r.get(xx, y)[3] and (xx + k) % 3 == 0:
                    r.px(xx, y, 'paper2')
        cv.blit(r, 0, 0)
    return O.outline(cv)


@sprop('winter', 'mikan_bowl', 2, 'counter', 950, _on(COUNTER_Y, 26),
       'A bowl of mandarin oranges, a couple with leaves')
def mikan_bowl():
    w, h = 44, 26
    cv = Canvas(w, h)
    for (x, y) in ((7, 7), (16, 3), (25, 6), (12, 10), (21, 10), (30, 10)):
        cv.blit(_fruit(10, 9, ['copper1', 'fire2', 'fire3', 'fire4', 'gold4'], spec=0.2, calyx=('leaf0', 'leaf1')), x, y)
    for (x, y) in ((19, 2), (33, 5)):
        cv.px(x, y, 'leaf2'); cv.px(x + 1, y - 1, 'leaf3'); cv.px(x + 2, y - 1, 'leaf3')
    b = O.bowl(40, 12, O.INDIGO, top=0)
    cv.blit(b, 1, 13)
    return O.outline(cv)


@sprop('winter', 'yuki_usagi', 2, 'wall', 948, _on(SILL_Y, 20),
       'A snow rabbit on the window sill: a mound of snow with red berry eyes and leaf ears, on a little tray')
def yuki_usagi():
    w, h = 30, 20
    cv = Canvas(w, h)
    cv.rect(1, 16, 28, 3, 'hinoki2'); cv.hline(1, 28, 16, 'hinoki4'); cv.hline(1, 28, 18, 'hinoki0')
    m = ellipse_mask(24, 12, 12, 7, 11, 6, wobble=0.04)
    m[12:] = False
    body = paint(m, ['cloud1', 'cloud2', 'cloud3', 'white'], profile='round', amb=0.35)
    cv.blit(body, 3, 5)
    cv.px(9, 9, 'scarlet2'); cv.px(10, 9, 'scarlet3')                   # berry eye
    for (x0, y0, x1, y1) in ((11, 6, 9, 0), (13, 6, 14, 1)):              # leaf ears
        cv.line(x0, y0, x1, y1, 'leaf3'); cv.line(x0 + 1, y0, x1 + 1, y1, 'leaf2')
    return O.outline(cv)


@sprop('winter', 'kagami_mochi', 3, 'counter', 1414, _on(COUNTER_Y, 40),
       'Kagami mochi for the new year: two rounds of mochi on a stand, a bitter orange on top, white paper beneath')
def kagami_mochi():
    w, h = 40, 40
    cv = Canvas(w, h)
    st = _sanbo(36)
    cv.blit(st, 2, h - 12)
    for k in range(3):                                                  # zigzag paper hanging over the edge
        cv.vline(8 + k * 10, h - 12, h - 8, 'white'); cv.px(9 + k * 10, h - 9, 'paper4')
    big = paint(ellipse_mask(30, 13, 15, 7, 14.5, 6.5, wobble=0.03), ['stone3', 'paper3', 'paper4', 'white'],
                profile='round', amb=0.35)
    small = paint(ellipse_mask(22, 10, 11, 5.5, 10.5, 5, wobble=0.03), ['stone3', 'paper3', 'paper4', 'white'],
                  profile='round', amb=0.35)
    cv.blit(big, 5, h - 23)
    cv.blit(small, 9, h - 31)
    cv.blit(_fruit(10, 9, ['copper1', 'fire2', 'fire3', 'fire4', 'gold4'], spec=0.2, calyx=('leaf0', 'leaf1')), 15, h - 39)
    cv.px(22, h - 39, 'leaf2'); cv.px(23, h - 40 + 1, 'leaf3')
    return O.outline(cv)
