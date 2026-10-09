"""Inside the room-1 stone furnace, animated (12 frames, loops).

  furnace_fire   drawn before the fire spirit. Sooty firebrick lit by the
                 coals, a bed of coal whose embers breathe, little flames
                 licking up at the sides, sparks, and smoke that curls up,
                 spills out of the arch and pools under the wooden top.
  furnace_coals  a few front coals, drawn after the spirit so it sits
                 down in the bed rather than in front of it.

The smoke is the only part with partial alpha; it is quantised to four
levels so it still reads as pixel art."""
import math
import random
import numpy as np
from pixel import Canvas, PAL
from counter import MOUTH, HEARTH_TOP, in_mouth

NF = 12
FX0 = MOUTH['x0'] - 34                  # sprite origin (scene coords)
FY0 = HEARTH_TOP[1] + 4
FW = MOUTH['x1'] - MOUTH['x0'] + 68
FH = MOUTH['bottom'] - FY0 + 1
BED = MOUTH['bottom'] - 2               # bottom of the coal bed
HEAT = ['ink', 'wood0', 'red0', 'fire0', 'fire1', 'fire2', 'fire3', 'fire4', 'fire5']


def _rgb(name):
    return np.array(PAL[name], np.uint8)


def _lumps(seed, n, ymin, ymax, front=False):
    rng = random.Random(seed)
    out = []
    for _ in range(n):
        x = rng.uniform(MOUTH['x0'] + 3, MOUTH['x1'] - 3)
        y = rng.uniform(ymin, ymax)
        centre = 1 - abs(x - MOUTH['cx']) / (MOUTH['x1'] - MOUTH['cx'])
        heat = min(1.0, rng.uniform(0.15, 0.75) + centre * 0.35 + (0.15 if not front else 0))
        out.append(dict(x=x, y=y, rx=rng.uniform(3.2, 7.0), ry=rng.uniform(2.2, 4.6), heat=heat,
                        ph=rng.uniform(0, 6.28), k=rng.choice((1, 1, 2, 3)), ash=rng.random() < 0.3,
                        tilt=rng.uniform(-0.3, 0.3)))
    out.sort(key=lambda l: l['y'])
    return out


BACK_LUMPS = _lumps(51, 46, BED - 20, BED - 3)
FRONT_LUMPS = _lumps(52, 13, BED - 4, BED + 1, front=True)


def _flicker(f, ph, k=1):
    return 0.78 + 0.22 * math.sin(2 * math.pi * f * k / NF + ph)


def _draw_lump(cv, l, f):
    """One coal: dark, ash-sheened on top, glowing in its cracks and
    underside; the hottest ones glow right through."""
    h = l['heat'] * _flicker(f, l['ph'], l['k'])
    x0, y0 = l['x'] - FX0, l['y'] - FY0
    for yy in range(int(y0 - l['ry']) - 1, int(y0 + l['ry']) + 2):
        for xx in range(int(x0 - l['rx']) - 1, int(x0 + l['rx']) + 2):
            u = (xx + 0.5 - x0) / l['rx']
            v = (yy + 0.5 - y0) / l['ry']
            u2 = u + l['tilt'] * v
            r = abs(u2) ** 2.6 + abs(v) ** 2.2
            if r > 1 or not (0 <= xx < FW and 0 <= yy < FH):
                continue
            if not in_mouth(xx + FX0, yy + FY0):
                continue
            under = v + 0.25 * abs(u)                         # 1 at the hot underside
            g = h * (0.55 + 0.6 * max(0.0, under)) - (0.35 if r < 0.35 and h < 0.8 else 0)
            crack = (int(xx * 1.7 + yy * 2.3 + l['ph'] * 5) % 7 == 0) and r < 0.8
            if h > 0.86:
                idx = 7 if r < 0.3 else (6 if r < 0.7 else 5)
            elif crack and h > 0.4:
                idx = 6 if h > 0.6 else 5
            elif g > 0.62 and under > 0.2:
                idx = 5 if g < 0.8 else 6
            elif g > 0.45 and under > 0.35:
                idx = 4
            else:
                idx = -1
            if idx < 0:
                if v < -0.35 and u < 0.2:
                    c = 'stone2' if l['ash'] else 'stone1'
                elif l['ash'] and v < 0 and (xx + yy) % 3 == 0:
                    c = 'stone3'
                else:
                    c = 'stone0' if v < 0.3 else 'ink'
            else:
                c = HEAT[idx]
            cv.px(xx, yy, c)


def _flame(cv, x, base, hgt, f, ph):
    """Small licking flame (separate from the spirit)."""
    h = hgt * (0.65 + 0.35 * abs(math.sin(2 * math.pi * f / NF * 2 + ph)))
    sway = math.sin(2 * math.pi * f / NF + ph) * 1.6
    for j in range(int(h)):
        t = j / max(1, h)
        w = (1 - t) ** 0.8 * 2.6 * (1 if t > 0.15 else 0.7 + t * 2)
        cx = x + sway * t * t
        for dx in range(-int(w) - 1, int(w) + 2):
            d = abs(dx + 0.5 - (cx - int(cx))) / max(0.6, w)
            if d > 1:
                continue
            c = 'fire5' if d < 0.35 and t < 0.5 else ('fire4' if d < 0.6 else ('fire3' if t < 0.8 else 'fire2'))
            px, py = int(cx) + dx - FX0, int(base - j) - FY0
            if 0 <= px < FW and 0 <= py < FH and in_mouth(px + FX0, py + FY0):
                cv.px(px, py, c)


def _back(cv, f):
    """Firebrick at the back of the firebox, lit by the bed."""
    flick = 0.86 + 0.1 * math.sin(2 * math.pi * f / NF) + 0.05 * math.sin(2 * math.pi * 3 * f / NF + 1)
    gx, gy = MOUTH['cx'] - FX0, BED - FY0 - 4
    for yy in range(FH):
        for xx in range(FW):
            X, Y = xx + FX0, yy + FY0
            if not in_mouth(X, Y):
                continue
            d = math.hypot((xx - gx) / 84, (yy - gy) / 74)
            g = flick * max(0.0, 1 - d) ** 1.1 * 1.25
            row = (Y - MOUTH['top']) // 7
            mortar = (Y - MOUTH['top']) % 7 == 6 or (X + (row % 2) * 7) % 14 == 0
            if mortar:
                g -= 0.12
            idx = 0 if g < 0.1 else (1 if g < 0.22 else (2 if g < 0.36 else (3 if g < 0.5 else (4 if g < 0.66 else 5))))
            cv.px(xx, yy, HEAT[idx])
        # side jambs of the firebox recede: a darker band down each side
    for yy in range(FH):
        for xx in range(FW):
            X, Y = xx + FX0, yy + FY0
            if in_mouth(X, Y) and (not in_mouth(X - 5, Y) or not in_mouth(X + 5, Y) or not in_mouth(X, Y - 5)):
                p = cv.get(xx, yy)
                if p[3] and p[:3] != PAL['ink']:
                    cv.px(xx, yy, HEAT[max(0, HEAT.index(_name(p)) - 1)])


def _name(p):
    for n in HEAT:
        if PAL[n] == tuple(p[:3]):
            return n
    return 'ink'


def _smoke(f):
    """Quantised smoke density (H, W) -> RGBA layer."""
    rng = random.Random(77)
    streams = [(rng.uniform(MOUTH['x0'] + 12, MOUTH['x1'] - 12), rng.uniform(0, 1), rng.uniform(0, 6.28))
               for _ in range(9)]
    yy, xx = np.mgrid[0:FH, 0:FW]
    D = np.zeros((FH, FW))
    top_exit = MOUTH['top'] + 6
    lip = HEARTH_TOP[1] + 9
    K = 3
    for si, (xs, ph, wph) in enumerate(streams):
        for j in range(K):
            a = (f / (K * NF) + ph + j / K) % 1.0
            y = (BED - 10) - a * (BED - 10 - (lip - 2))
            inside = y > top_exit
            pull = min(1.0, a * 2.2)
            x = xs + (MOUTH['cx'] + (xs - MOUTH['cx']) * 0.35 - xs) * pull
            x += math.sin(a * 9 + wph) * 3.5 * a
            if y < lip + 12:                                 # spreading under the wooden lip
                spread = (lip + 12 - y) / 12
                x += math.copysign(1, xs - MOUTH['cx'] + 0.01) * spread * 26
            r = 4 + 10 * a
            amp = min(1.0, a / 0.12) * (1 - max(0.0, (a - 0.74) / 0.26)) * (0.75 if inside else 1.05)
            cxp, cyp = x - FX0, y - FY0
            D += amp * np.exp(-(((xx + 0.5 - cxp) ** 2) / (r * r * 1.3) + ((yy + 0.5 - cyp) ** 2) / (r * r)) * 1.6)
    # curl it: a cheap periodic warp so edges billow instead of being round
    warp = np.sin((xx * 0.35 + yy * 0.22) + 2 * math.pi * f / NF) * 0.18 + np.sin(yy * 0.5 - 2 * math.pi * f / NF) * 0.12
    D = D * (1 + warp)
    out = np.zeros((FH, FW, 4), np.uint8)
    levels = [(1.1, 'smoke1', 175), (0.72, 'smoke2', 140), (0.42, 'cloud0', 100), (0.2, 'cloud1', 56)]
    done = np.zeros((FH, FW), bool)
    for th, c, al in levels:
        m = (D > th) & ~done
        out[m, :3] = _rgb(c)
        out[m, 3] = al
        done |= m
    # dither the faintest band so it breaks up softly
    faint = (out[:, :, 3] == 56) & ((xx + yy) % 2 == 0)
    out[faint] = 0
    return out


def fire_frame(f):
    cv = Canvas(FW, FH)
    _back(cv, f)
    for k, (fx_, hgt, ph) in enumerate(((MOUTH['x0'] + 14, 11, 0.3), (MOUTH['x1'] - 16, 13, 2.1),
                                         (MOUTH['cx'] + 38, 8, 4.0), (MOUTH['cx'] - 40, 9, 5.2))):
        _flame(cv, fx_, BED - 13, hgt, f, ph)
    for l in BACK_LUMPS:
        _draw_lump(cv, l, f)
    rng = random.Random(90)
    for i in range(9):                                       # sparks
        xs, ph = rng.uniform(MOUTH['x0'] + 10, MOUTH['x1'] - 10), rng.uniform(0, 1)
        a = (f / NF + ph) % 1.0
        y = BED - 14 - a * 74
        x = xs + math.sin(a * 6 + i) * 4
        if a < 0.85:
            c = 'fire5' if a < 0.3 else ('fire4' if a < 0.6 else 'fire2')
            px, py = int(x) - FX0, int(y) - FY0
            if 0 <= px < FW and 0 <= py < FH:
                cv.px(px, py, c)
    sm = _smoke(f)
    m = sm[:, :, 3] > 0
    base = cv.a.astype(np.float32)
    al = sm[:, :, 3:4].astype(np.float32) / 255.0
    solid = base[:, :, 3:4] > 0
    blended = base[:, :, :3] * (1 - al) + sm[:, :, :3] * al
    out = cv.a.copy()
    inside = m & solid[:, :, 0]
    out[inside, :3] = np.clip(blended[inside], 0, 255).astype(np.uint8)   # smoke over the lit firebox
    outside = m & ~solid[:, :, 0]
    out[outside] = sm[outside]                                            # smoke over the stone face
    cv.a = out
    return cv


def coals_frame(f):
    cv = Canvas(FW, FH)
    for l in FRONT_LUMPS:
        _draw_lump(cv, l, f)
    return cv


def fire_frames():
    return [fire_frame(f) for f in range(NF)]


def coals_frames():
    return [coals_frame(f) for f in range(NF)]
