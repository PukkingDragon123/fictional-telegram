"""Reusable, properly shaded small objects for the props (v2).
`top` is how many pixels of an object's top ellipse we see: positive for
things below eye level (counter, table), 0 or negative above it (shelves)."""
import math
import random
import numpy as np
from pixel import Canvas, PAL, RAMPS, step, scribble, text, text_width
from shade import paint, lathe_shade, ellipse_mask, poly_mask, mask_of, lathe_mask
from furn import R

GLASS = ['sky1', 'sky2', 'sky3', 'sky4']
CERAMIC_WHITE = ['paper0', 'paper1', 'paper2', 'paper3', 'paper4', 'white']
CELADON = ['jade0', 'jade1', 'jade2', 'jade3', 'jade4', 'jade5']
IRON = ['stone0', 'stone1', 'stone2', 'stone3', 'stone4']
BRASS = ['gold0', 'gold1', 'gold2', 'gold3', 'gold4']
COPPER = ['copper0', 'copper1', 'copper2', 'copper3', 'copper4']
CLAY = ['red0', 'red1', 'red2', 'red3', 'red4']
LACQUER = ['ink', 'ink1', 'stone0', 'stone1', 'stone2']
INDIGO = ['indigo0', 'indigo1', 'indigo2', 'indigo3', 'indigo4']


def ramp(name, lo=0, hi=None):
    cols = RAMPS[name]
    hi = len(cols) if hi is None else hi
    return [f'{name}{i}' for i in range(lo, hi)]


def outline(cv, sel=True):
    """Selective outline with a softer line on the lit (upper-left) side -
    the hand-polished look: shadow-side edges stay dark and crisp."""
    out = cv.padded(1)
    src = out.a.copy()
    out.outline(selective=sel)
    alpha = src[:, :, 3] > 0
    h, w = alpha.shape
    ys, xs = np.nonzero((out.a[:, :, 3] > 0) & ~alpha)
    for y, x in zip(ys, xs):
        # lit side: the object lies to the right of / below this outline pixel
        if (x + 1 < w and alpha[y, x + 1] and not (x - 1 >= 0 and alpha[y, x - 1])) or \
           (y + 1 < h and alpha[y + 1, x] and not (y - 1 >= 0 and alpha[y - 1, x])):
            nb = src[y, x + 1] if (x + 1 < w and alpha[y, x + 1]) else src[y + 1, x]
            soft = step(tuple(int(v) for v in nb[:3]), -2)
            out.px(x, y, soft)
    return out


def ellipse_top(cv, cx, y, rx, ry, rim, inside, inner_dark=None):
    """Visible top opening/lid as a filled ellipse with a lit back rim."""
    cv.ellipse(cx, y, rx, ry, inside)
    if inner_dark:
        cv.ellipse(cx, y + ry * 0.25, rx * 0.8, ry * 0.65, inner_dark)
    for a in range(0, 360, 4):
        x = int(round(cx + math.cos(math.radians(a)) * rx))
        yy = int(round(y + math.sin(math.radians(a)) * ry))
        cv.px(x, yy, rim if a > 180 else step(PAL[rim], -1))


# ---------------------------------------------------------------- jars
def glass_jar(rng, w, h, fill, fill_frac=0.7, lid='cork', label=True, top=0, string=True, word=None):
    """Glass jar: tinted glass, contents with clustered texture, cork or
    lid, label, string tie, highlights on the near surface."""
    cv = Canvas(w, h)
    lid_h = max(3, h // 7)
    neck = 0.62

    def prof(t):
        if t < 0.1:
            return w / 2 * neck
        if t < 0.2:
            return w / 2 * (neck + (1 - neck) * (t - 0.1) / 0.1)
        return w / 2 - (0.5 if t > 0.92 else 0)
    body_y = lid_h
    bh = h - body_y
    m = lathe_mask(w, bh, prof)
    glass = paint(m, ['sky1', 'sky2', 'sky3', 'sky3'], R=w * 0.45, amb=0.3)
    cv.blit(glass, 0, body_y)
    # contents
    top_fill = body_y + int(bh * (1 - fill_frac))
    for y in range(top_fill, h - 1):
        for x in range(1, w - 1):
            if not m[y - body_y, x] or not m[y - body_y, max(0, x - 1)] or not m[y - body_y, min(w - 1, x + 1)]:
                continue
            u = x / w
            c = fill[(x // 2 + (y // 2) * 3 + rng.randint(0, 1)) % len(fill)]
            if u > 0.72:
                c = step(PAL[c], -1)
            cv.px(x, y, c)
    for x in range(2, w - 2):            # heaped surface
        if rng.random() < 0.5:
            cv.px(x, top_fill - 1, fill[x % len(fill)])
    # glass highlights + rim
    hx = max(2, int(w * 0.22))
    cv.vline(hx, body_y + int(bh * 0.25), h - 4, 'white')
    cv.vline(hx + 1, body_y + int(bh * 0.3), h - 6, 'sky4')
    cv.vline(w - 3, body_y + int(bh * 0.3), h - 4, 'sky3')
    cv.hline(int(w * 0.3), int(w * 0.6), h - 2, 'sky4')
    # lid
    nx0 = int(w / 2 - w / 2 * neck)
    nw = w - 2 * nx0
    if lid == 'cork':
        cv.rect(nx0 + 1, 0, nw - 2, lid_h + 1, 'wood4')
        cv.hline(nx0 + 1, nx0 + nw - 2, 0, 'wood5')
        cv.vline(nx0 + nw - 2, 0, lid_h, 'wood3')
        for k in range(3):
            cv.px(nx0 + 2 + rng.randint(0, max(0, nw - 5)), rng.randint(1, lid_h), 'wood3')
    else:
        lr = {'wood': 'wood', 'metal': 'stone', 'red': 'red', 'jade': 'jade', 'gold': 'gold'}[lid]
        cv.rect(nx0, 0, nw, lid_h + 1, R(lr, 2))
        cv.hline(nx0, nx0 + nw - 1, 0, R(lr, 4)); cv.hline(nx0, nx0 + nw - 1, 1, R(lr, 3))
        cv.hline(nx0, nx0 + nw - 1, lid_h, R(lr, 1))
        cv.vline(nx0 + 1, 1, lid_h, R(lr, 3))
    if string:
        cv.hline(nx0, nx0 + nw - 1, lid_h + 2, 'paper1')
        cv.px(nx0 + nw, lid_h + 3, 'paper1'); cv.px(nx0 + nw, lid_h + 4, 'paper2')
    if label and w >= 12:
        ly = body_y + int(bh * 0.45)
        lw, lh = w - 6, max(8, h // 4)
        cv.rect(3, ly, lw, lh, 'paper3')
        cv.hline(3, 2 + lw, ly, 'paper4'); cv.hline(3, 2 + lw, ly + lh - 1, 'paper1')
        cv.vline(2 + lw, ly, ly + lh - 1, 'paper1')
        if word:
            tw = text_width(word)
            text(cv, 3 + max(1, (lw - tw) // 2), ly + (lh - 5) // 2, word, 'wood1', rng, True)
        else:
            for yy in range(ly + 2, ly + lh - 1, 2):
                scribble(cv, rng, 5, yy, lw - 4, 'wood1')
    return outline(cv)


def ceramic_jar(rng, w, h, glaze, top=0, lid=True, pattern=None):
    """Glazed storage jar (tsubo) or crock - turned profile, glossy."""
    def prof(t):
        if t < 0.08:
            return w * 0.28
        return w * 0.5 * math.sin(math.pi * min(1, 0.18 + t * 0.8)) ** 0.7
    cv = lathe_shade(w, h, prof, glaze, spec=0.1, spec_col='white')
    if lid:
        cv.rect(int(w * 0.24), 0, int(w * 0.52), 3, R('wood', 3))
        cv.hline(int(w * 0.24), int(w * 0.76) - 1, 0, R('wood', 5))
    if pattern == 'band':
        for x in range(w):
            for y in (int(h * 0.42), int(h * 0.45)):
                if cv.get(x, y)[3]:
                    cv.shift(x, y, -2)
    elif pattern == 'drip':
        for x in range(2, w - 2, 3):
            for y in range(2, int(h * 0.3) + (x * 7) % 6):
                if cv.get(x, y)[3]:
                    cv.px(x, y, 'wood2' if (x + y) % 3 else 'wood1')
    return outline(cv)


def tin(rng, w, h, base, band=None, top=0, glyph_c='ink'):
    rmp = [R(base, i) for i in range(1, 5)]
    cv = Canvas(w, h + max(0, top))
    body = lathe_shade(w, h, lambda t: w / 2, rmp, spec=0.06, spec_col=R(base, 5))
    cv.blit(body, 0, max(0, top))
    lid = lathe_shade(w, 4, lambda t: w / 2, IRON[1:], spec=0.1)
    cv.blit(lid, 0, max(0, top))
    if top > 0:
        ellipse_top(cv, w / 2, top + 1, w / 2 - 0.5, top, 'stone4', 'stone3')
    if band:
        bnd = lathe_shade(w, 5, lambda t: w / 2, [R(band, i) for i in range(1, 5)], spec=0.12)
        cv.blit(bnd, 0, max(0, top) + h // 2 - 2)
    from propkit import glyph
    glyph(cv, rng, w // 2 - 3, max(0, top) + h // 2 + 4, 6, glyph_c)
    for _ in range(4):
        cv.px(rng.randint(2, w - 3), max(0, top) + rng.randint(5, h - 2), 'copper1')
    return outline(cv)


# ---------------------------------------------------------------- ceramics
def cup(w, h, glaze=CERAMIC_WHITE, tea=('leaf2', 'leaf3', 'leaf4'), top=3, band=None):
    """Handleless teacup seen from above-front: tea surface ellipse visible."""
    cv = Canvas(w, h + top)
    prof = lambda t: w / 2 * (1 - 0.18 * t * t)
    body = lathe_shade(w, h, prof, glaze[1:], spec=0.12, spec_col='white')
    cv.blit(body, 0, top)
    if band:
        for x in range(w):
            for y in (top + 2, top + 3):
                if cv.get(x, y)[3]:
                    cv.px(x, y, band if x < w * 0.7 else step(PAL[band], -1))
    if top > 0:
        cv.ellipse(w / 2, top, w / 2 - 0.5, top, glaze[-2])
        if tea:
            cv.ellipse(w / 2, top + 0.4, w / 2 - 1.6, top - 0.8, tea[1])
            cv.ellipse(w / 2 - 1, top, w / 2 - 3, max(0.6, top - 1.6), tea[2])
            cv.px(int(w * 0.35), top, 'white')
    return outline(cv)


def bowl(w, h, glaze, inside=None, top=4, foot=True):
    cv = Canvas(w, h + top)
    prof = lambda t: w / 2 * math.sqrt(max(0.05, 1 - t ** 1.6 * 0.75))
    body = lathe_shade(w, h, prof, glaze, spec=0.12, spec_col='white')
    cv.blit(body, 0, top)
    if top > 0:
        cv.ellipse(w / 2, top, w / 2 - 0.5, top, glaze[-1])
        cv.ellipse(w / 2, top + 0.6, w / 2 - 2, top - 0.8, inside[1] if inside else glaze[1])
        if inside:
            cv.ellipse(w / 2 - 1, top + 0.2, w / 2 - 4, max(0.6, top - 2), inside[2])
    if foot:
        cv.rect(int(w * 0.32), top + h - 1, int(w * 0.36), 2, glaze[0])
    return outline(cv)


def teapot(w, h, glaze, spout='right', handle='loop', lid_glaze=None, top=2):
    """Round teapot body (glossy), spout, handle, lid with knob."""
    cv = Canvas(w, h)
    bx0, bw = int(w * 0.18), int(w * 0.64)
    by0, bh = int(h * 0.3), int(h * 0.68)
    m = ellipse_mask(bw, bh, bw / 2, bh / 2, bw / 2, bh / 2)
    paint(m, glaze, R=bw * 0.45, spec=0.07, spec_col='white', canvas=cv, ox=bx0, oy=by0)
    # spout: a tapered tube rising to the side
    sx0, sy0 = bx0 + bw - 3, by0 + bh // 2
    for k in range(int(w * 0.2)):
        t = k / (w * 0.2)
        x = sx0 + k
        y = sy0 - t * h * 0.32
        r = 2.6 - t * 1.2
        for d in range(int(-r), int(r) + 1):
            c = glaze[3] if d < 0 else (glaze[2] if d < r * 0.5 else glaze[1])
            cv.px(int(x), int(y + d), c)
    cv.px(int(sx0 + w * 0.2), int(sy0 - h * 0.32), glaze[4])
    # handle
    if handle == 'loop':
        cx, cy, rr = bx0 + 2, by0 + bh // 2, bh * 0.36
        for a in range(90, 271, 5):
            for dr in (0, 1):
                x = int(round(cx + math.cos(math.radians(a)) * (rr + dr)))
                y = int(round(cy + math.sin(math.radians(a)) * (rr + dr) * 1.1))
                cv.px(x, y, glaze[2] if dr == 0 and a < 180 else glaze[1])
    elif handle == 'side':
        for k in range(int(w * 0.2)):
            y = by0 + bh // 2 - 2 - k * 0.15
            cv.px(bx0 + 2 - k, int(y), glaze[3]); cv.px(bx0 + 2 - k, int(y) + 1, glaze[2]); cv.px(bx0 + 2 - k, int(y) + 2, glaze[1])
    elif handle == 'bail':
        cx = bx0 + bw / 2
        for a in range(180, 361, 3):
            x = int(round(cx + math.cos(math.radians(a)) * bw * 0.42))
            y = int(round(by0 + 2 + math.sin(math.radians(a)) * h * 0.32))
            cv.px(x, y, 'wood3' if a < 270 else 'wood2'); cv.px(x, y + 1, 'wood1')
    # lid + knob
    lg = lid_glaze or glaze
    cv.ellipse(bx0 + bw / 2, by0 + 1.5, bw * 0.32, max(1.5, top), lg[3])
    cv.hline(int(bx0 + bw * 0.2), int(bx0 + bw * 0.8), by0 + 1, lg[4])
    kx = int(bx0 + bw / 2)
    cv.rect(kx - 2, by0 - 3, 4, 3, lg[2]); cv.px(kx - 2, by0 - 3, lg[4])
    return outline(cv)


# ---------------------------------------------------------------- soft goods
def sack(rng, w, h, base='paper', tie='red2', spill=None, slump=0.0):
    """Burlap sack: soft shading from its silhouette, weave texture, tied neck."""
    neck = int(h * 0.26)
    pts = [(w * 0.38, 0), (w * 0.62, 0), (w * 0.6, neck), (w * (0.98 + slump * 0.02), h * 0.6),
           (w * 0.92, h - 1), (w * 0.08, h - 1), (w * (0.02 - slump * 0.02), h * 0.62), (w * 0.4, neck)]
    m = poly_mask(w, h, pts)
    from shade import distance
    cv = paint(m, [R(base, i) for i in range(0, 4)], profile='soft', R=w * 0.35, amb=0.25)
    for y in range(h):
        for x in range(w):
            if m[y, x] and ((x + 2 * y) % 5 == 0 or (2 * x - y) % 7 == 0):
                cv.shift(x, y, -1)
    for x in range(int(w * 0.36), int(w * 0.64)):
        cv.px(x, neck, tie); cv.px(x, neck + 1, step(PAL[tie], -1))
    cv.px(int(w * 0.64), neck + 2, tie); cv.px(int(w * 0.66), neck + 4, tie)
    mx, my = w // 2, int(h * 0.62)
    for k in range(7):              # stencilled leaf mark
        cv.px(mx - 3 + k, my + 2 - k // 2, 'jade1')
        if 1 < k < 6:
            cv.px(mx - 3 + k, my + 1 - k // 2 - 1, 'jade1')
    if spill:
        for k in range(10):
            cv.px(w // 2 - 4 + k, rng.randint(0, 2), spill[k % len(spill)])
    return outline(cv)


def book(w, h, spine, title=True, worn=True):
    cv = Canvas(w, h)
    cv.rect(0, 0, w, h, R(spine, 2))
    cv.vline(0, 0, h - 1, R(spine, 3)); cv.vline(1, 0, h - 1, R(spine, 3))
    cv.vline(w - 1, 0, h - 1, R(spine, 1))
    if title and h > 12:
        cv.hline(1, w - 2, 3, 'gold2'); cv.hline(1, w - 2, h - 4, 'gold2')
        for y in range(6, min(h - 6, 16), 3):
            cv.hline(2, w - 3, y, 'gold1' if w > 5 else 'gold2')
    if worn:
        cv.px(w - 1, 0, None); cv.px(0, h - 1, R(spine, 1))
    return cv


def basket(rng, w, h, contents=None, handle=False):
    """Woven bamboo basket, rim, optional heap of contents (a Canvas)."""
    cv = Canvas(w, h)
    rim_y = int(h * 0.35)
    if contents is not None:
        cv.blit(contents, w // 2 - contents.w // 2, rim_y - contents.h + int(contents.h * 0.45))
    for y in range(rim_y, h):
        t = (y - rim_y) / max(1, h - rim_y)
        inset = int(t * t * w * 0.12)
        for x in range(inset, w - inset):
            u = (x - inset) / max(1, w - 2 * inset)
            c = 'gold2' if ((x // 3) + (y // 2)) % 2 == 0 else 'gold1'
            if u < 0.2:
                c = 'gold3' if c == 'gold2' else 'gold2'
            elif u > 0.8:
                c = 'gold1' if c == 'gold2' else 'gold0'
            cv.px(x, y, c)
    cv.hline(0, w - 1, rim_y, 'gold3'); cv.hline(0, w - 1, rim_y + 1, 'gold4')
    cv.hline(0, w - 1, rim_y + 2, 'gold1')
    if handle:
        for a in range(180, 361, 3):
            x = int(round(w / 2 + math.cos(math.radians(a)) * w * 0.42))
            y = int(round(rim_y + math.sin(math.radians(a)) * rim_y * 0.95))
            cv.px(x, y, 'gold2'); cv.px(x, y + 1, 'gold0')
    return outline(cv)


def leaf_heap(rng, w, h, ramp=('leaf0', 'leaf1', 'leaf2', 'leaf3', 'leaf4', 'leaf5')):
    from leaves import leafy
    spr, ox, oy, m = leafy(rng, [(0, 0, w * 0.45, h * 0.42), (-w * 0.2, h * 0.1, w * 0.3, h * 0.3),
                                 (w * 0.22, h * 0.08, w * 0.3, h * 0.32)], list(ramp), leaf_len=(3, 5))
    return spr


def clay_pot(w, h, glaze=('red0', 'red1', 'red2', 'red3', 'red4'), cracked=True, moss=True):
    def prof(t):
        if t < 0.18:
            return w / 2
        return w / 2 * (1 - (t - 0.18) * 0.32)
    cv = lathe_shade(w, h, prof, list(glaze), spec=0.03)
    cv.hline(0, w - 1, int(h * 0.18), glaze[0])
    cv.hline(0, w - 1, 0, glaze[4])
    if cracked:
        x = w // 2 + 2
        for y in range(2, h - 2):
            cv.px(x, y, glaze[0])
            if y % 3 == 0:
                x += 1 if (y // 3) % 2 else -1
    if moss:
        for x in range(1, w - 1, 3):
            cv.px(x, int(h * 0.18) + 1, 'leaf2')
    return cv


def leafy_plant(rng, w, h, ramp=('leaf0', 'leaf1', 'leaf2', 'leaf3', 'leaf4', 'leaf5'), flowers=None,
                lobes=None, leaf_len=(3, 5)):
    from leaves import leafy
    lobes = lobes or [(0, 0, w * 0.45, h * 0.4), (-w * 0.2, h * 0.15, w * 0.3, h * 0.3),
                      (w * 0.22, h * 0.1, w * 0.28, h * 0.3)]
    spr, ox, oy, m = leafy(rng, lobes, list(ramp), kind='leaf', flowers=flowers, leaf_len=leaf_len)
    return spr


def potted(rng, pot_w, pot_h, plant, glaze=('red0', 'red1', 'red2', 'red3', 'red4'), cracked=True):
    pot = clay_pot(pot_w, pot_h, glaze, cracked)
    w = max(pot_w, plant.w) + 2
    h = pot_h + plant.h - 6
    cv = Canvas(w, h)
    cv.blit(plant, w // 2 - plant.w // 2, 0)
    cv.blit(pot, w // 2 - pot_w // 2, h - pot_h)
    return outline(cv)


def steam_frames(w=20, h=40, n=8, wisps=3):
    frames = []
    for f in range(n):
        cv = Canvas(w, h)
        for k in range(wisps):
            ph = f * 2 * math.pi / n + k * 2.1
            for j in range(h - 4):
                t = j / (h - 4)
                x = w / 2 + math.sin(j * 0.3 + ph) * (1 + t * 3.5) + (k - (wisps - 1) / 2) * 3
                y = h - 1 - j
                if (j + f * 3 + k * 7) % 11 < 7:
                    c = 'white' if t < 0.3 else ('cloud2' if t < 0.65 else 'cloud1')
                    cv.px(int(round(x)), y, c)
        frames.append(cv)
    return frames
