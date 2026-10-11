"""The hearth's talking fire spirit.

The flame body is a teardrop field broken up by noise that rises through
it; the noise uses whole-number temporal frequencies so every animation
loops perfectly. Big round eyes, a toothless wobbly mouth that sucks at the air, blinking, a wobbling pair of flame arms, rising
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

def _mouth(cv, f, mood, cx, my):
    """A toothless, wobbly, organic mouth that sucks at the air: a soft opening
    whose rim ripples all the way round (two travelling waves, whole-number
    frequencies so it loops), a dark throat glowing red inside, glowing lips,
    pucker creases when it pinches small, and sparks drawn into it."""
    o = {'idle': IDLE, 'talk': TALK, 'happy': HAPPY}[mood][f]
    t = 2 * math.pi * f / FF
    suck = 0.5 + 0.5 * math.sin(t * (2 if mood == 'idle' else 1))           # it purses and opens
    pucker = (1 - o) * suck if mood != 'happy' else 0.0
    rx = (4 + 6 * o + 2 * (mood == 'happy')) * (1 - 0.45 * pucker) + 2.5
    ry = 2.0 + 5.0 * o + 1.4 * pucker
    curl = 4.0 if mood == 'happy' else 0.0
    for y in range(int(my - ry * 1.6 - curl - 3), int(my + ry * 1.6 + 4)):
        for x in range(int(cx - rx * 1.5 - 2), int(cx + rx * 1.5 + 3)):
            dx = x + 0.5 - cx
            u = dx / max(1.0, rx)
            dy = y + 0.5 - my + curl * u * u
            ang = math.atan2(dy, dx)
            wob = 1 + 0.16 * math.sin(3 * ang + t) + 0.09 * math.sin(5 * ang - 2 * t) + 0.05 * math.sin(7 * ang + 3 * t)
            d = math.hypot(dx / rx, dy / ry) / wob
            if d < 1.0:
                c = 'ink' if d < 0.5 else ('red0' if d < 0.78 else 'fire0')         # throat, glowing red
                if d < 0.3 and o > 0.5:
                    c = 'red1'                                                    # the hot glow deep inside
                cv.px(x, y, c)
            elif d < 1.28:
                c = 'fire2' if dy < 0 else 'fire1'                                # lips, lit along the top
                if d < 1.12 and dy < 0:
                    c = 'fire3'
                cv.px(x, y, c)
    if pucker > 0.35:                                                             # pucker creases round the lips
        for k in range(8):
            a = 2 * math.pi * k / 8 + 0.2 * math.sin(t + k)
            for r in (1.4, 1.6):
                x = cx + math.cos(a) * rx * r
                y = my + math.sin(a) * ry * r * 1.2
                cv.px(int(x), int(y), 'fire1')
    if mood != 'happy':                                                           # sparks sucked in
        for k in range(5):
            ph = (f / FF + k / 5.0) % 1
            a = 2 * math.pi * k / 5 + 0.7
            r = (1 - ph) * 16 + rx
            x = cx + math.cos(a) * r
            y = my + math.sin(a) * r * 0.6
            cv.px(int(x), int(y), 'fire5' if ph < 0.5 else 'fire4')


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
