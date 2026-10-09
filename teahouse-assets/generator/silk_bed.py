"""Room 4 - the silk bed.

A low lacquered bed with a torii-style headboard. A crimson silk quilt,
embroidered with gold plum blossoms and lined in gold silk, lies over a
thick futon and spills over the front edge in soft folds. Its head end is
turned down to show the lining and a cream silk sheet.

Silk is all in the sheen: deep shadow in the folds, a broad bright band
where a fold turns to the light, and a near-white streak on the crest.
The surfaces are modelled (a height field on top, hanging folds in front)
and lit with a diffuse + tight specular term, then snapped to the palette
ramps. The hanging folds sway a little, so the sheen slides across them.
"""
import math
import numpy as np
from pixel import Canvas
from objects import outline

W, H = 264, 124
TB, TF = 46, 70               # mattress top: back and front edge rows
MX0, MX1 = 10, 240            # mattress ends (foot, head)
FOLD = 188                    # turn-down crease (front)
FLAP = 19                     # width of the turned-down lining
DEPTH = 70.0                  # bed depth in world units (foreshortened to TF - TB rows)
TILT = math.radians(28)


def _n(v):
    v = np.asarray(v, float)
    return v / (np.linalg.norm(v) + 1e-9)


LIGHT = _n((-0.72, 0.5, 0.46))
VIEW = _n((0.0, math.sin(TILT), math.cos(TILT)))
HALF = _n(LIGHT + VIEW)

SILK = (('red0', 'scarlet0', 'scarlet1', 'scarlet2', 'scarlet3'), ('scarlet4', 'pink4'))
LINING = (('gold0', 'gold1', 'gold2', 'gold3', 'gold4'), ('gold4', 'white'))
SHEET = (('paper1', 'paper2', 'paper3', 'paper4', 'paper4'), ('white', 'white'))
THREAD = (('gold1', 'gold2', 'gold3', 'gold4', 'gold4'), ('white', 'white'))
CUTS = (0.22, 0.4, 0.58, 0.78)


def _shade(n, mat, amb=0.0, p=18, hi=(0.5, 0.82)):
    ramp, sheen = mat
    d = max(0.0, float(n @ LIGHT))
    s = max(0.0, float(n @ HALF)) ** p
    if s > hi[1]:
        return sheen[1]
    if s > hi[0]:
        return sheen[0]
    lum = 0.05 + 0.95 * d + amb
    i = sum(lum > c for c in CUTS)
    return ramp[i]


# ---------------------------------------------------------------- surfaces
def _G(x, cx, sx, d, cd, sd):
    return math.exp(-((x - cx) / sx) ** 2 - ((d - cd) / sd) ** 2)


RIDGES = ((38, 0.35, 4.5, 1.2), (96, 0.3, 3.5, 0.7), (122, 0.22, 5.0, 1.0), (166, -0.15, 3.5, 0.8))


def _h_quilt(x, d):
    """Height of the quilt on the mattress: two soft billows and long folds running back."""
    h = 3.4 * _G(x, 74, 36, d, 0.55, 0.5) + 2.0 * _G(x, 142, 26, d, 0.45, 0.6)
    for (x0, slope, w, a) in RIDGES:
        dist = x - (x0 + slope * d * DEPTH * 0.5)
        h += a * math.exp(-(dist / w) ** 2) * (0.35 + 0.65 * math.sin(math.pi * min(1, d * 1.15)))
    return h


def _h_sheet(x, d):
    return 0.45 * math.exp(-((x - 212 - 2 * d) / 5) ** 2) * (0.3 + 0.7 * d)


def _normal_top(hf, x, d):
    e = 0.5
    hx = (hf(x + e, d) - hf(x - e, d)) / (2 * e)
    hd = (hf(x, d + e / DEPTH) - hf(x, d - e / DEPTH)) / (2 * e)   # per world unit going back
    return _n((-hx * 2.0, 1.0, hd * 2.0))                         # folds exaggerated so they read


def _y_top(x, d, h):
    return TF - d * (TF - TB) - h * math.cos(TILT) * 0.9


def _blossom(u, v):
    """Embroidered plum blossoms on a staggered grid (u, v in world units)."""
    row = math.floor(v / 17)
    cu = (math.floor((u - (17 if row % 2 else 0)) / 34) + 0.5) * 34 + (17 if row % 2 else 0)
    cv_ = (row + 0.5) * 17
    du, dv = u - cu, (v - cv_) * 0.9
    r = math.hypot(du, dv)
    if r < 0.8:
        return 'c'
    if r > 3.6:
        return None
    a = math.atan2(dv, du)
    petal = abs(((a + math.pi / 2) / (2 * math.pi / 5) + 0.5) % 1 - 0.5)       # 0 at a petal's axis
    return 'p' if r < 3.6 - petal * 4 else None


def _crests():
    import random
    rng = random.Random(11)
    out, x = [], MX0 - 6
    while x < FOLD + 4:
        w = rng.uniform(4.5, 9.5)
        out.append((x + w, w, rng.uniform(2.0, 3.6), rng.choice((-1, 1))))
        x += 2 * w * rng.uniform(0.82, 1.0)
    return out


CRESTS = _crests()


def _fold_raw(x, s, ph):
    """Hanging folds: rounded crests toward us with sharp creases between them,
    fanning out and deepening toward the hem."""
    f = 0.0
    for c, w, a, sway in CRESTS:
        cc = c + (c - 100) * 0.05 * s + ph * 2.2 * s * sway
        ww = w * (0.75 + 0.5 * s)
        u = (x - cc) / ww
        if abs(u) < 1:
            f = max(f, a * (0.45 + 0.75 * s) * math.cos(u * math.pi / 2) ** 0.8)
    return f


def _fold_f(x, s, ph):
    e = 0.5
    return _fold_raw(x, s, ph), (_fold_raw(x + e, s, ph) - _fold_raw(x - e, s, ph)) / (2 * e)


def _hem(x, ph):
    f, _ = _fold_f(x, 1.0, ph)
    return 96 + 1.2 * math.sin(0.05 * x + 0.6) + 0.8 * f


# ---------------------------------------------------------------- frame
def _frame_back(cv):
    """Parts behind the bedding: headboard back post, panel, platform rail."""
    # back post and kumiko panel of the headboard
    cv.rect(250, 4, 9, TB + 14, 'wood1'); cv.vline(250, 4, TB + 17, 'wood2'); cv.vline(258, 4, TB + 17, 'wood0')
    cv.rect(244, 12, 7, TB + 4, 'wood0')
    for y in range(14, TB + 14, 6):
        cv.hline(244, 250, y, 'wood2')
    for x in (246, 249):
        cv.vline(x, 12, TB + 15, 'wood2')
    # platform rail (lacquer, a red inlay line, brass corner plates)
    cv.rect(4, 84, 240, 14, 'wood2')
    cv.hline(4, 243, 84, 'wood4'); cv.hline(4, 243, 85, 'wood3')
    cv.hline(4, 243, 89, 'red1'); cv.hline(4, 243, 96, 'wood1'); cv.hline(4, 243, 97, 'wood0')
    for x0 in (4, 228):
        cv.rect(x0, 84, 16, 14, 'gold2'); cv.hline(x0, x0 + 15, 84, 'gold4'); cv.hline(x0, x0 + 15, 97, 'gold0')
        cv.vline(x0, 84, 97, 'gold3'); cv.vline(x0 + 15, 84, 97, 'gold1')
        for (dx, dy) in ((3, 3), (12, 3), (3, 10), (12, 10)):
            cv.px(x0 + dx, 84 + dy, 'gold4'); cv.px(x0 + dx + 1, 84 + dy + 1, 'gold0')
        for dx in range(5, 11):                                # engraved cloud scroll
            cv.px(x0 + dx, 90 + (1 if dx in (6, 9) else 0), 'gold1')
    # feet with brass shoes
    for x0 in (6, 230):
        cv.rect(x0, 98, 12, H - 98, 'wood2'); cv.vline(x0, 98, H - 1, 'wood4'); cv.vline(x0 + 11, 98, H - 1, 'wood0')
        cv.hline(x0, x0 + 11, 98, 'wood1')
        cv.rect(x0 - 1, H - 5, 14, 5, 'gold2'); cv.hline(x0 - 1, x0 + 12, H - 5, 'gold4'); cv.hline(x0 - 1, x0 + 12, H - 1, 'gold0')


def _frame_front(cv):
    """Posts and the kasagi top rail, in front of the bedding."""
    # footboard post: chamfered, red lacquer band, brass finial
    cv.rect(0, 30, 12, H - 30, 'wood2')
    cv.vline(0, 30, H - 1, 'wood4'); cv.vline(1, 30, H - 1, 'wood3'); cv.vline(11, 30, H - 1, 'wood0'); cv.vline(10, 30, H - 1, 'wood1')
    cv.rect(0, 40, 12, 3, 'red2'); cv.hline(0, 11, 40, 'red3'); cv.hline(0, 11, 42, 'red0')
    cv.rect(-1, 24, 14, 6, 'gold2'); cv.hline(-1, 12, 24, 'gold4'); cv.hline(-1, 12, 29, 'gold0'); cv.vline(0, 25, 28, 'gold3')
    cv.rect(2, 19, 8, 5, 'gold3'); cv.hline(3, 8, 19, 'gold4'); cv.px(3, 20, 'white'); cv.vline(9, 20, 23, 'gold1')
    cv.rect(4, 16, 4, 3, 'gold2'); cv.px(4, 16, 'gold4')
    # headboard front post
    cv.rect(236, 8, 11, H - 8, 'wood2')
    cv.vline(236, 8, H - 1, 'wood4'); cv.vline(237, 8, H - 1, 'wood3'); cv.vline(246, 8, H - 1, 'wood0'); cv.vline(245, 8, H - 1, 'wood1')
    cv.rect(236, 20, 11, 3, 'red2'); cv.hline(236, 246, 20, 'red3'); cv.hline(236, 246, 22, 'red0')
    # kasagi: the top rail with upturned ends, and the brass caps on them
    for x in range(230, 264):
        t = (x - 247) / 17
        lift = int(round(3.2 * t ** 4))
        top = 2 - lift
        cv.vline(x, top, 7, 'wood1')
        cv.px(x, top, 'wood4'); cv.px(x, top + 1, 'wood3'); cv.px(x, 7, 'wood0')
    cv.rect(228, -1, 4, 5, 'gold2'); cv.px(228, -1, 'gold4'); cv.px(228, 3, 'gold0')
    cv.rect(260, -1, 4, 5, 'gold2'); cv.px(260, -1, 'gold4'); cv.px(263, 3, 'gold0')
    cv.rect(234, 8, 15, 3, 'wood0'); cv.hline(234, 248, 8, 'wood2')            # shima-gi under the rail


# ---------------------------------------------------------------- bedding
def _bedding(cv, ph):
    # mattress front face (a thick futon) and the sheet's turned-over edge
    for x in range(MX0, MX1):
        for y in range(TF, 84):
            c = 'paper2'
            if y == TF + 6:
                c = 'paper3'
            elif y >= 82:
                c = 'paper1'
            cv.px(x, y, c)
        if (x - MX0) % 14 == 7:
            cv.px(x, TF + 10, 'paper1'); cv.px(x, TF + 11, 'paper0')                 # tufts
    # top surface, painted back to front
    N = 110
    for k in range(N, -1, -1):
        d = k / N
        for x in range(MX0 - 2, MX1):
            if x < FOLD + 4 * d:
                h = _h_quilt(x, d)
                n = _normal_top(_h_quilt, x, d)
                mat = SILK
                b = _blossom(x, d * DEPTH * 0.5)
                if 0.05 <= d <= 0.1 or 0.16 <= d <= 0.19:
                    mat = THREAD                                       # gold border along the edge
                elif b == 'p':
                    mat = THREAD
                elif b == 'c':
                    mat = LINING
            else:
                h = _h_sheet(x, d)
                n = _normal_top(_h_sheet, x, d)
                mat = SHEET
            y = _y_top(x, d, h)
            c = _shade(n, mat, amb=0.05 * (1 - d))
            cv.px(x, int(round(y)), c)
            cv.px(x, int(round(y)) + 1, c)
    # the sheet hangs a little over the front edge
    for x in range(FOLD, MX1):
        y0 = int(round(_y_top(x, 0, _h_sheet(x, 0))))
        for y in range(y0, TF + 6):
            s = (y - y0) / 6
            ph_ = math.radians(90 * min(1, (y - y0 + 1) / 4))
            fx = 0.6 * math.cos(0.3 * x)
            n = _n((-fx * math.sin(ph_), math.cos(ph_), math.sin(ph_)))
            cv.px(x, y, _shade(n, SHEET, amb=-0.1 * s))
        cv.px(x, TF + 6, 'paper1')
    # the quilt spills over the front edge in folds
    for x in range(MX0 - 3, FOLD + 1):
        y0 = _y_top(x, 0, _h_quilt(x, 0))
        hem = _hem(x, ph)
        for y in range(int(round(y0)), int(round(hem)) + 1):
            s = max(0.0, (y - y0) / (hem - y0))
            phi = math.radians(90 * min(1.0, (y - y0 + 1) / 6))
            f, fx = _fold_f(x, s, ph)
            n = _n((-fx * math.sin(phi), math.cos(phi) - 0.12 * s, math.sin(phi)))
            mat = SILK
            hr = int(round(hem))
            if y >= hr or y == hr - 3:
                mat = THREAD                                           # gold piping and a border line
            crease = max(0.0, 1 - f / 1.2) if s > 0.15 else 0.0       # deep creases between folds
            cv.px(x, y, _shade(n, mat, amb=-0.12 * s - 0.3 * crease))
        cv.px(x, int(round(hem)) + 1, 'red0') if x % 3 == 0 else None
    # the quilt's head-end edge, showing a line of lining
    for y in range(TF, int(round(_hem(FOLD, ph)))):
        cv.px(FOLD + 1, y, 'gold1' if y % 4 else 'gold2')
    # turned-down flap: the lining lies on top of the quilt, crease toward the head
    for k in range(int(N * 0.95), -1, -1):
        d = k / N
        xc = FOLD + 4 * d
        x0 = xc - FLAP + 2.5 * math.sin(d * 5.5) + 2 * (1 - d)
        for x in range(int(x0), int(xc) + 1):
            t = (x - x0) / max(1, xc - x0)                     # 0 at the lining edge, 1 at the crease
            h = _h_quilt(x, d) + 1.0 + (1.2 * (t - 0.6) / 0.4 if t > 0.6 else 0)
            roll = max(0.0, (t - 0.72) / 0.28)
            n = _n((roll * 1.4 + 0.35 * math.sin(d * 9 + t * 2), 1.0 - roll * 0.3, 0.3 * math.cos(d * 7)))
            mat = SILK if roll > 0.82 else LINING
            y = _y_top(x, d, h)
            cv.px(x, int(round(y)), _shade(n, mat))
            cv.px(x, int(round(y)) + 1, _shade(n, mat))
        ly = int(round(_y_top(int(x0) - 1, d, _h_quilt(int(x0) - 1, d)))) + 1
        cv.px(int(x0) - 1, ly, 'red0')                        # its shadow on the red silk
    # where the flap reaches the front edge, it droops over in a gold point
    for x in range(FOLD - FLAP + 2, FOLD + 2):
        t = (x - (FOLD - FLAP + 2)) / FLAP
        y0 = _y_top(x, 0, _h_quilt(x, 0) + 1.6)
        drop = 2 + 9 * t ** 1.4
        for y in range(int(round(y0)), int(round(TF + drop)) + 1):
            phi = math.radians(90 * min(1.0, (y - y0 + 1) / 5))
            n = _n((0.25 * math.sin(phi), math.cos(phi), math.sin(phi)))
            cv.px(x, y, _shade(n, LINING, amb=-0.1))
        cv.px(x, int(round(TF + drop)) + 1, 'red0')


def _simplify(cv):
    from room import simplify
    return simplify(cv)


def silk_bed_frames(n=12):
    frames = []
    for f in range(n):
        ph = 0.32 * math.sin(2 * math.pi * f / n)
        cv = Canvas(W, H)
        _frame_back(cv)
        _bedding(cv, ph)
        _simplify(cv)
        _frame_front(cv)
        frames.append(outline(cv))
    return frames
