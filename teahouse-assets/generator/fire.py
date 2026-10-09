"""The hearth's talking fire spirit.

The flame body is a teardrop field broken up by noise that rises through
it; the noise uses whole-number temporal frequencies so every animation
loops perfectly. Big round eyes, a mouth with three openings (closed smile,
small 'o', wide open), blinking, a wobbling pair of flame arms, rising
sparks. Animations: idle, talk, happy - each FF frames."""
import math
import random
import numpy as np
from pixel import Canvas, PAL

FF = 12
FIRE = ['fire0', 'fire1', 'fire2', 'fire3', 'fire4', 'fire5']
W, H = 72, 72


def _noise(x, y, f, seed=0, octaves=((0.21, 0.17, 1, 1.0), (0.37, 0.29, 2, 0.55), (0.63, 0.51, 3, 0.3))):
    rng = random.Random(seed)
    v = 0.0
    for (kx, ky, m, a) in octaves:
        ph1, ph2 = rng.uniform(0, 6.28), rng.uniform(0, 6.28)
        v += a * math.sin(kx * x + ky * y + 2 * math.pi * m * f / FF + ph1)
        v += a * 0.6 * math.sin(-kx * 0.7 * x + ky * 1.3 * y + 2 * math.pi * m * f / FF + ph2)
    return v


def _flame_field(f, mood):
    """Intensity field of the body (0 outside, rising towards the core)."""
    grow = {'idle': 1.0, 'talk': 1.06, 'happy': 1.12}[mood]
    bob = math.sin(2 * math.pi * f / FF) * 1.2
    cx, base = W / 2, H - 14
    I = np.zeros((H, W))
    for y in range(H):
        for x in range(W):
            hgt = (base - y + bob) / (44 * grow)          # 0 at base, 1 at the tip
            if hgt < -0.12 or hgt > 1.35:
                continue
            # teardrop half-width (wide belly, pointed tip)
            belly = math.sin(math.pi * min(1.0, max(0.0, hgt + 0.12) / 1.12) ** 0.75)
            half = 17 * grow * belly ** 0.9
            if half < 1.6:
                continue
            dx = (x + 0.5 - cx - math.sin(hgt * 3 + 2 * math.pi * f / FF) * hgt * 3) / max(half, 0.5)
            n = _noise(x, y + f * 0, f, 1) * 0.16 + _noise(x * 1.7, y * 1.5, f, 2) * 0.08
            v = 1 - dx * dx - max(0, hgt - 0.65) * 1.4 + n * (0.6 + hgt)
            # tongues licking up off the top
            if 0.6 < hgt < 1.05 and v > -0.3:
                v += 0.22 * math.sin(x * 0.5 + 2 * math.pi * 2 * f / FF) * (hgt - 0.6)
            I[y, x] = max(0.0, v)
    # flame arms
    for side in (-1, 1):
        ph = 2 * math.pi * f / FF + (0 if side < 0 else math.pi)
        ax = cx + side * (17 * grow + 2)
        ay = base - 16 + math.sin(ph) * 2
        for k in range(12):
            t = k / 11
            px_ = ax + side * (t * 7) + math.sin(ph + t * 3) * 1.5
            py_ = ay - t * 9 * (1.2 if mood == 'happy' else 1.0)
            r = 3.2 * (1 - t) + 0.6
            for yy in range(int(py_ - r) - 1, int(py_ + r) + 2):
                for xx in range(int(px_ - r) - 1, int(px_ + r) + 2):
                    if 0 <= xx < W and 0 <= yy < H:
                        d = math.hypot(xx + 0.5 - px_, yy + 0.5 - py_) / r
                        if d < 1:
                            I[yy, xx] = max(I[yy, xx], 0.55 * (1 - d) + 0.12)
    return I


def _log(cv, x0, y0, x1, y1, r=3.6):
    """Tilted log: cylinder shading across its width, bark streaks along it."""
    L = math.hypot(x1 - x0, y1 - y0)
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    nx, ny = -uy, ux
    if ny > 0:
        nx, ny = -nx, -ny                  # normal pointing up
    ramp = ['bark0', 'bark1', 'bark2', 'bark3', 'bark4']
    for k in range(int(L) + 1):
        for d10 in range(int(-r * 10), int(r * 10) + 1, 4):
            d = d10 / 10
            x = x0 + ux * k + nx * d
            y = y0 + uy * k + ny * d
            t = d / r                       # +1 top (lit) .. -1 bottom
            i = int(max(0, min(4, (t + 1) / 2 * 4.6)))
            c = ramp[i]
            if (k + int(d * 3)) % 7 == 0 and i > 0:
                c = ramp[i - 1]             # bark streak
            cv.px(int(round(x)), int(round(y)), c)
    for (ex, ey) in ((x0, y0), (x1, y1)):    # cut ends: pale rings
        cv.ellipse(ex, ey, r * 0.8, r, 'wood4')
        cv.px(int(ex), int(ey), 'wood2')
        cv.px(int(ex) - 1, int(ey) - 2, 'wood5')
    for k in range(4, int(L) - 3, 9):        # glowing cracks
        cv.px(int(x0 + ux * k + nx * r * 0.2), int(y0 + uy * k + ny * r * 0.2), 'fire4')
        cv.px(int(x0 + ux * k + nx * r * 0.2) + 1, int(y0 + uy * k + ny * r * 0.2), 'fire3')


def _logs(cv):
    _log(cv, 12, H - 4, W - 20, H - 15)
    _log(cv, 20, H - 15, W - 12, H - 4)
    for x in range(14, W - 14):            # ember bed
        if (x * 7) % 5 < 3:
            cv.px(x, H - 2, 'fire3' if x % 3 else 'fire5')
            cv.px(x, H - 1, 'fire1')


TALK = [0.0, 0.5, 1.0, 0.6, 0.2, 1.0, 0.8, 0.35, 0.0, 0.6, 1.0, 0.45]
IDLE = [0.0, 0.0, 0.0, 0.15, 0.3, 0.2, 0.05, 0.0, 0.0, 0.0, 0.12, 0.0]
HAPPY = [0.7, 0.75, 0.8, 0.75, 0.7, 0.72, 0.78, 0.82, 0.78, 0.72, 0.7, 0.68]

# uneven, hand-drawn teeth (fixed for every frame): (width, length)
_TR = random.Random(9)
UPPER = [(_TR.choice((3, 3, 4, 4, 5)), _TR.uniform(0.7, 1.25)) for _ in range(9)]
LOWER = [(_TR.choice((3, 4, 4, 5)), _TR.uniform(0.6, 1.15)) for _ in range(8)]


def _tooth(cv, x, y, w, ln, down):
    """One sharp, slightly crooked tooth: lit left face, shaded right face,
    dark outline - drawn like a hand-placed cluster, not a perfect wedge."""
    lean = 1 if (x * 7) % 5 == 0 else (0 if (x * 3) % 4 else -1)
    for k in range(ln):
        t = k / max(1, ln - 1)
        half = (w / 2) * (1 - t) + 0.3
        cxk = x + lean * t
        yy = y + k if down else y - k
        for xx in range(int(round(cxk - half)), int(round(cxk + half)) + 1):
            c = 'white' if xx < cxk - half * 0.2 else ('paper3' if xx < cxk + half * 0.5 else 'paper2')
            if k == 0:
                c = 'paper2' if down else 'paper3'      # root sits in the gum shadow
            cv.px(xx, yy, c)
    tip_y = y + ln if down else y - ln
    cv.px(int(round(x + lean)), tip_y, 'fire0')


def _mouth(cv, f, mood, cx, my):
    """A wide, jagged maw full of teeth. Openness o in 0..1."""
    o = {'idle': IDLE, 'talk': TALK, 'happy': HAPPY}[mood][f]
    half = 15 if mood != 'happy' else 17
    curl = 3.5 if mood != 'happy' else 6.0
    top, bot = {}, {}
    for x in range(cx - half, cx + half + 1):
        u = (x - cx) / half
        smile = -curl * u * u
        top[x] = my + smile - o * 5 * (1 - u * u)
        bot[x] = my + smile + 2 + o * 11 * (1 - u * u) ** 0.8
    if o < 0.12:
        # closed: a tight band of interlocking pointed teeth between dark lips
        for x in range(cx - half, cx + half + 1):
            m = int(round(top[x])) + 1
            edge = abs(x - cx) > half - 2
            for y in range(m - 2, m + 3):
                cv.px(x, y, 'fire0' if edge else ('white' if y < m else 'paper3'))
            cv.px(x, m - 3, 'fire0'); cv.px(x, m + 3, 'fire0')
            cv.px(x, m - 4, 'fire1'); cv.px(x, m + 4, 'fire1')
            zig = m + (1 if (x // 3) % 2 else -1) * (1 if x % 3 else 0)
            cv.px(x, zig, 'fire0')
            if (x + 1) % 3 == 0:
                cv.px(x, zig + (1 if (x // 3) % 2 else -1), 'paper2')
        return
    # lips: the dark rim of the mouth
    for x in range(cx - half, cx + half + 1):
        yt, yb = int(round(top[x])), int(round(bot[x]))
        for y in range(yt, yb + 1):
            depth = (y - yt) / max(1, yb - yt)
            c = 'fire0'
            if o > 0.25 and 0.25 < depth < 0.85 and abs(x - cx) < half - 3:
                c = 'ink'                                    # throat
            cv.px(x, y, c)
        cv.px(x, yt - 1, 'fire1'); cv.px(x, yb + 1, 'fire1')  # hot glowing lip edge
    if o > 0.45:                                             # tongue
        ty = int(round(bot[cx])) - 3
        for x in range(cx - 6, cx + 7):
            u = (x - cx) / 6
            for y in range(int(ty + 2 - 3 * (1 - u * u)), ty + 2):
                cv.px(x, y, 'red3' if x < cx + 2 else 'red2')
        cv.px(cx - 2, ty - 1, 'red4'); cv.vline(cx, ty - 1, ty + 1, 'red1')
    # teeth along both jaws (they interlock into a zigzag when closed)
    span = 2 * half - 4
    x = cx - half + 3
    for (w, ln) in UPPER:
        if x > cx + half - 3:
            break
        u = (x - cx) / half
        L = max(2, int(round((3 + 3 * (1 - abs(u))) * ln * (0.6 + 0.4 * (o > 0.1)))))
        _tooth(cv, x, int(round(top[x])) + 1, w, L, True)
        x += w + (0 if w > 3 else 1)
    x = cx - half + 5
    for (w, ln) in LOWER:
        if x > cx + half - 4:
            break
        u = (x - cx) / half
        L = max(2, int(round((2.5 + 2.5 * (1 - abs(u))) * ln)))
        _tooth(cv, x, int(round(bot[x])) - 1, w, L, False)
        x += w + 1
    # fangs at the corners when it grins
    if mood == 'happy' or o > 0.7:
        for side in (-1, 1):
            fx = cx + side * (half - 4)
            _tooth(cv, fx, int(round(top[fx])) + 1, 4, 7, True)


def frame(f, mood='idle'):
    cv = Canvas(W, H)
    I = _flame_field(f, mood)
    cuts = [0.02, 0.17, 0.36, 0.6, 0.84]
    for y in range(H):
        for x in range(W):
            v = I[y, x]
            if v <= cuts[0]:
                continue
            i = sum(1 for c in cuts if v > c)
            cv.px(x, y, FIRE[min(5, i)])
    # outline the body with the darkest red so it reads on any background
    body = cv.copy()
    body.outline('fire0', selective=False)
    cv = body
    _logs(cv)
    cx = W // 2 + int(round(math.sin(2 * math.pi * f / FF) * 0.6))
    ey = H - 34 + int(round(math.sin(2 * math.pi * f / FF) * 1.0))
    _mouth(cv, f, mood, cx, ey + 4)
    # rising sparks (periodic)
    rng = random.Random(5)
    for k in range(7):
        x0 = rng.uniform(16, W - 16)
        ph = rng.uniform(0, 1)
        t = (f / FF + ph) % 1
        x = x0 + math.sin(t * 6 + k) * 3
        y = H - 40 - t * 30
        if y > 1:
            cv.px(int(x), int(y), 'fire5' if t < 0.4 else ('fire4' if t < 0.7 else 'fire3'))
    return cv


def sheets():
    return {m: [frame(f, m) for f in range(FF)] for m in ('idle', 'talk', 'happy')}
