"""Prop registry + small drawing helpers shared by every prop module."""
import math
import random
from pixel import Canvas, PAL, step, scribble, text
from shapes import torn_paper, pin, wood_grain_h, wood_grain_v, chip

PROPS = []


# taken out of the default scene (still exported): no tea anywhere, no hanging noren in the bedroom
UNPLACED = {'jar_green_tea', 'jar_dried_blossom', 'jar_hojicha', 'cutting_board_leaves', 'basket_fresh_leaves',
            'teacup_black_tea', 'steam_cup', 'yunomi_matcha_seat', 'kyusu_teapot', 'chawan_matcha', 'chasen_whisk',
            'natsume_caddy', 'chashaku_scoop', 'yunomi_tray', 'noren_doorway'}


def prop(name, room, layer, x, y, desc, drag=True, fps=None, preview=True, shadow='auto', meta=None):
    """Register a prop. (x, y) = top-left of its default spot in the scene.
    layer: outside | wall | ceiling | npc | floor | counter | front.
    meta: extra data exported to scene.json (e.g. click interactions)."""
    def deco(fn):
        PROPS.append(dict(name=name, room=room, layer=layer, x=x, y=y, desc=desc,
                          drag=drag, fps=fps, fn=fn, preview=preview and name not in UNPLACED, shadow=shadow,
                          meta=meta))
        return fn
    return deco


def finish(cv, sel=True):
    from objects import outline
    return outline(cv, sel)


def box(cv, x, y, w, h, base, light=1, dark=-1):
    cv.rect(x, y, w, h, base)
    cv.hline(x, x + w - 1, y, step(PAL[base], light))
    cv.vline(x, y, y + h - 1, step(PAL[base], light))
    cv.hline(x, x + w - 1, y + h - 1, step(PAL[base], dark))
    cv.vline(x + w - 1, y, y + h - 1, step(PAL[base], dark))


def cylinder(cv, x, y, w, h, ramp, hi=None):
    """Vertical cylinder: ramp = palette names dark -> light."""
    n = len(ramp)
    for i in range(w):
        t = (i + 0.5) / w
        v = math.cos((t - 0.32) * math.pi * 0.95)
        k = max(0, min(n - 1, int(v * (n - 0.01))))
        cv.vline(x + i, y, y + h - 1, ramp[k])
    if hi:
        cv.vline(x + max(1, int(w * 0.25)), y + 1, y + h - 2, hi)


def ellipse_ring(cv, cx, cy, rx, ry, c):
    for a in range(0, 360, 6):
        cv.px(int(round(cx + math.cos(math.radians(a)) * rx)),
              int(round(cy + math.sin(math.radians(a)) * ry)), c)


def label(cv, rng, x, y, w, h, base='paper3', ink='wood1'):
    cv.rect(x, y, w, h, base)
    cv.hline(x, x + w - 1, y, step(PAL[base], 1))
    cv.hline(x, x + w - 1, y + h - 1, step(PAL[base], -1))
    for ly in range(y + 1, y + h - 1, 2):
        scribble(cv, rng, x + 1, ly, w - 2, ink)


def glyph(cv, rng, x, y, size, c):
    """Brush-stroke pseudo-kanji (not real words): a few strokes in a box."""
    s = size
    for _ in range(rng.randint(3, 5)):
        kind = rng.random()
        if kind < 0.4:
            yy = y + rng.randint(0, s - 1)
            cv.hline(x + rng.randint(0, 1), x + s - 1 - rng.randint(0, 1), yy, c)
        elif kind < 0.75:
            xx = x + rng.randint(0, s - 1)
            cv.vline(xx, y + rng.randint(0, 1), y + s - 1 - rng.randint(0, 1), c)
        else:
            cv.line(x + rng.randint(0, s // 2), y + rng.randint(s // 2, s - 1),
                    x + rng.randint(s // 2, s - 1), y + rng.randint(0, s // 2), c)


def leafy_plant(rng, w, h, ramp=('leaf0', 'leaf1', 'leaf2', 'leaf3', 'leaf4', 'leaf5'), lobes=None,
                flowers=None):
    from leaves import leafy
    lobes = lobes or [(0, 0, w * 0.45, h * 0.4), (-w * 0.2, h * 0.15, w * 0.3, h * 0.3),
                      (w * 0.22, h * 0.1, w * 0.28, h * 0.3)]
    spr, ox, oy, m = leafy(rng, lobes, list(ramp), kind='leaf', flowers=flowers, leaf_len=(3, 5))
    return spr


def clay_pot(w, h, base='red3', cracked=True, rng=None):
    cv = Canvas(w, h)
    rim = 3
    cv.rect(0, 0, w, rim, step(PAL[base], 0))
    cv.hline(0, w - 1, 0, step(PAL[base], 1))
    cv.hline(0, w - 1, rim - 1, step(PAL[base], -1))
    for yy in range(rim, h):
        t = (yy - rim) / max(1, h - rim)
        inset = int(t * w * 0.18)
        for xx in range(1 + inset, w - 1 - inset):
            u = (xx - inset) / max(1, w - 2 * inset)
            c = step(PAL[base], 1) if u < 0.3 else (PAL[base] if u < 0.7 else step(PAL[base], -1))
            cv.px(xx, yy, c)
    if cracked:
        x = w // 2 + 1
        for yy in range(1, h - 2):
            cv.px(x, yy, step(PAL[base], -2))
            if yy % 3 == 0:
                x += 1 if (yy // 3) % 2 else -1
    # moss on the rim
    for xx in range(1, w - 1, 3):
        cv.px(xx, rim, 'leaf2')
    return cv


def paper_note(rng, w, h, base='paper3', pin_c=None, lines=True, burnt=False, clean=True):
    cv = torn_paper(rng, w, h, base=base, light=step(PAL[base], 1), dark=step(PAL[base], -1),
                    edge=step(PAL[base], -2), lines=lines, burnt=burnt, fold=not clean,
                    stain=not clean, age=0.9 if clean else 0.72)
    out = Canvas(w, h + 2)
    out.blit(cv, 0, 2)
    if pin_c:
        pin(out, w // 2, 1, pin_c)
    return out
