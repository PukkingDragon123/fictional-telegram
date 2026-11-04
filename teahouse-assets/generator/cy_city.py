"""The city outside the Copper Sky room, painted in the teahouse's way: flat
bands of colour with ordered dither where they meet, hue-shifted ramps, a
dark line round each shape. It is night, there are no signs - only the
windows, the lamps and the haze they light.

  00_sky          night over the smog: deep blue-violet overhead, warming to
                  a dirty amber at the horizon where the city lights it from
                  below; a hazy moon, a few stars
  01_clouds       smoke-brown cloud banks lit from underneath; one crosses
                  the moon
  02_searchlights two beams sweeping slowly from the far towers
  03_far          the far city: towers in haze, pin-prick windows, a great
                  spire with a mooring mast, red lights blinking on the tops
  04_koi          the koi airship swimming across the far sky
  05_traffic      lanes of airships and cabs between the towers: white lamps
                  one way, red ones the other
  06_mid          the nearer towers: stone, brick and riveted plate, rows of
                  lit windows, green copper roofs - pagoda eaves, domes,
                  stepped crowns - water tanks, chimneys, a skybridge
  07_train        a train on the viaduct, its windows lit, crossing
  08_smoke        smoke and steam rising off the chimneys and leaning away
  09_puffer       the pufferfish blimp, and its searchlight on the roofs
  10_near         the roofs just under the window: tiles, a copper ridge,
                  a water tower, chimney pots, a line of lamps on a cable

All layers are 640x360 RGBA, drawn for the room's window; the animated ones
are lists of frames. N (96) frames loop at 12 fps; the koi, the traffic and
the train loop over LONG (192)."""
import math
import random
import numpy as np
import cy_pal  # noqa: F401
from pixel import Canvas, PAL, step
from shapes import shade_puffs
import cy_beasts as B

W, H = 640, 360
HZ = 150                 # the eye line: the horizon
VPX = 320
N, LONG = 96, 192
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0
MOON = (186, 92, 19)


def _rgb(name):
    return np.array(PAL[name], np.uint8)


def _canvas(a):
    cv = Canvas(a.shape[1], a.shape[0])
    cv.a = a
    return cv


# ---------------------------------------------------------------- sky
SKY_BANDS = [(0, 'smog1'), (62, 'smog2'), (88, 'smog3'), (108, 'smog4'), (124, 'smog5'), (136, 'glow1'),
             (145, 'glow2'), (153, 'glow3'), (162, 'glow4')]


def sky():
    a = np.zeros((H, W, 4), np.uint8)
    yy, xx = np.mgrid[0:H, 0:W]
    ys = [b[0] for b in SKY_BANDS]
    for i, (y0, c) in enumerate(SKY_BANDS):
        y1 = SKY_BANDS[i + 1][0] if i + 1 < len(SKY_BANDS) else H
        a[(yy >= y0) & (yy < y1)] = list(PAL[c]) + [255]
    for i in range(1, len(SKY_BANDS)):                         # dithered seams, 6 px tall
        y0 = SKY_BANDS[i][0]
        up = PAL[SKY_BANDS[i - 1][1]]
        for y in range(y0 - 3, y0 + 3):
            t = (y - (y0 - 3) + 0.5) / 6
            m = (yy[y] >= 0) & (BAYER[y % 4, xx[y] % 4] > t)
            a[y, m, :3] = up
    # the glow is brighter round the middle, where the city is densest
    for y in range(HZ - 22, HZ + 14):
        for x in range(W):
            reach = 1 - abs(x - 360) / 300
            if reach > 0 and BAYER[y % 4, x % 4] < reach * 0.55 * (1 - abs(y - HZ + 4) / 22):
                c = tuple(int(v) for v in a[y, x, :3])
                a[y, x, :3] = step(c, 1)
    cv = _canvas(a)
    rng = random.Random(4)
    for _ in range(70):                                        # a few stars get through the smog
        x, y = rng.randint(0, W - 1), rng.randint(0, 100)
        if math.hypot(x - MOON[0], y - MOON[1]) > MOON[2] + 14:
            cv.px(x, y, rng.choice(('smog5', 'smog6', 'smog5', 'cloud1')))
    _moon(cv)
    return cv


def _moon(cv):
    mx, my, r = MOON
    for y in range(my - r - 18, my + r + 19):                 # halo in the haze
        for x in range(mx - r - 18, mx + r + 19):
            d = math.hypot(x + 0.5 - mx, y + 0.5 - my)
            if r < d < r + 18:
                t = 1 - (d - r) / 18
                if BAYER[y % 4, x % 4] < t * 0.85:
                    cv.shift(x, y, 1)
                if d < r + 5 and BAYER[y % 4, x % 4] < t * 0.6:
                    cv.shift(x, y, 1)
    seas = [(-6, -4, 6), (5, 3, 5), (-2, 8, 4), (8, -7, 3)]
    for y in range(my - r, my + r + 1):
        for x in range(mx - r, mx + r + 1):
            dx, dy = x + 0.5 - mx, y + 0.5 - my
            d = math.hypot(dx, dy)
            if d > r:
                continue
            lit = -(dx * 0.6 + dy * 0.5) / r                   # lit from the upper left, a touch
            c = 'cloud2' if lit > -0.25 else 'cloud1'
            if lit > 0.45:
                c = 'cloud3'
            for (sx, sy, sr) in seas:
                if math.hypot(dx - sx, dy - sy) < sr + 0.6 * math.sin(x * 1.3 + y):
                    c = 'cloud1' if c != 'cloud1' else 'cloud0'
            if d > r - 1.2 and dx > 0:
                c = 'cloud0'
            cv.px(x, y, c)
    for (cx, cy) in ((-9, 6), (3, -9), (10, 9), (-4, -1)):     # craters
        cv.px(mx + cx, my + cy, 'cloud0')
        cv.px(mx + cx - 1, my + cy - 1, 'cloud3')


def clouds():
    cv = Canvas(W, H)
    rng = random.Random(11)
    ramp = ['smog2', 'smog3', 'glow0', 'glow1', 'glow2']
    banks = [(80, 104, 150, 7), (330, 82, 230, 6), (560, 98, 170, 7), (176, 124, 260, 8), (470, 128, 220, 7)]
    for (cx, cy, wdt, rr) in banks:
        circles = []
        x = cx - wdt / 2
        while x < cx + wdt / 2:
            r = rng.uniform(rr * 0.7, rr * 1.4)
            circles.append((x, cy - rng.uniform(0, rr * 0.9), r))
            x += r * rng.uniform(0.8, 1.3)
        for k in range(len(circles) // 2):                    # a flat underside
            circles.append((cx - wdt / 2 + rng.uniform(0, wdt), cy + rr * 0.3, rr * 1.1))
        shade_puffs(cv, circles, ramp, light=(0.15, 0.85, 0.45), clip_bottom=int(cy + rr * 0.9), dither=0.1,
                    rim=False)
    # the bank across the moon: dark, its lower edge lit
    mx, my, r = MOON
    for x in range(mx - 40, mx + 46):
        top = my + 7 + int(2 * math.sin(x * 0.21) + 1.5 * math.sin(x * 0.07 + 1))
        th = 4 + int(1.5 + 1.5 * math.sin(x * 0.13))
        for y in range(top, top + th):
            cv.px(x, y, 'smog2')
        cv.px(x, top - 1, 'smog3') if (x % 3) else None
        cv.px(x, top + th, 'glow1')
        if (x + top) % 2 == 0:
            cv.px(x, top + th - 1, 'smog3')
    return cv


def searchlights():
    """Two beams sweeping from the far towers. N RGBA frames (soft, alpha)."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    beams = [(118, 106, -0.3, 0.3, 0.0, 0.09), (524, 98, 0.25, 0.34, 2.1, 0.08)]
    frames = []
    for f in range(N):
        a = np.zeros((H, W), np.float32)
        for (bx, by, a0, amp, ph, wdt) in beams:
            ang = a0 + amp * math.sin(2 * math.pi * f / N + ph)     # from straight up
            dx, dy = xx - bx, yy - by
            along = -dy * math.cos(ang) + dx * math.sin(ang)
            across = dx * math.cos(ang) + dy * math.sin(ang)
            w_ = wdt * np.maximum(along, 0) + 1.0
            s = np.clip(1 - np.abs(across) / w_, 0, 1) * (along > 0) * np.clip(1 - along / 170, 0, 1)
            a = np.maximum(a, s ** 1.2 * 0.42)
        rgba = np.zeros((H, W, 4), np.uint8)
        rgba[..., :3] = PAL['paper3']
        q = np.floor(a * 6 + BAYER[yy.astype(int) % 4, xx.astype(int) % 4] * 0.999) / 6   # banded alpha
        rgba[..., 3] = (np.clip(q, 0, 0.4) * 255).astype(np.uint8)
        frames.append(_canvas(rgba))
    return frames


# ---------------------------------------------------------------- towers
def _side_w(x0, x1, k):
    """How wide the side face shows: towers off-centre show the face turned to the middle."""
    c = (x0 + x1) / 2
    return int(round((VPX - c) * k))


def tower(cv, rng, x0, x1, top, face, side, lit, wcol=('amber2', 'amber3', 'paper3'), cell=(4, 5), win=(2, 2),
          k=0.05, roof='flat', roof_col='verd', bottom=H, band=None, blink=None, edge='smog5', density=0.4):
    """One tower, a box in the room's one-point perspective: its front face,
    the side turned toward the middle, a roof. `face`/`side` palette names,
    `lit` a ramp offset applied to window rows near the street glow."""
    sw = _side_w(x0, x1, k)
    cv.rect(x0, top, x1 - x0, bottom - top, face)
    if sw > 0:                                                  # right side face (tower left of centre)
        for i in range(sw):
            yt = top + int(round((HZ - top) * (i + 1) / max(1, (VPX - x1)) * 0.0)) + int(i * 0.25)
            cv.vline(x1 + i, yt, bottom - 1, side)
    elif sw < 0:
        for i in range(-sw):
            yt = top + int(i * 0.25)
            cv.vline(x0 - 1 - i, yt, bottom - 1, side)
    # windows
    cw, ch = cell
    ww, wh = win
    cols = list(range(x0 + 2, x1 - ww - 1, cw))
    rows = list(range(top + 6, bottom - wh, ch))
    for ri, y in enumerate(rows):
        floor_on = rng.random() < 0.85
        for ci, x in enumerate(cols):
            on = floor_on and rng.random() < density
            if on:
                c = rng.choice(wcol)
                cv.rect(x, y, ww, wh, c)
                if wh > 1:
                    cv.hline(x, x + ww - 1, y + wh - 1, step(PAL[c], -1))
            else:
                cv.rect(x, y, ww, wh, step(PAL[face], -1))
        if band and ri % band == band - 1:
            cv.hline(x0, x1 - 1, y + wh + 1, step(PAL[face], -1))
    if sw:                                                      # dim windows on the side face too
        xs = range(x1 + 1, x1 + sw - 1, 3) if sw > 0 else range(x0 + sw + 1, x0 - 1, 3)
        for y in rows[::1]:
            for x in xs:
                if rng.random() < density * 0.5:
                    cv.px(x, y, step(PAL[rng.choice(wcol)], -1))
    cv.vline(x0, top, bottom - 1, edge)                         # the edge that catches the sky
    cv.hline(x0, x1 - 1, top, edge)
    _roof(cv, rng, x0, x1, top, roof, roof_col, sw, face)
    if blink is not None:
        blink.append((x0 + (x1 - x0) // 2, top - _roof_h(roof, x1 - x0) - 1))


def _roof_h(kind, w):
    return {'flat': 6, 'pagoda': max(8, w // 3), 'dome': max(7, w // 2 - 2), 'crown': 12, 'spire': 30}.get(kind, 4)


def _roof(cv, rng, x0, x1, top, kind, rc, sw, face):
    w = x1 - x0
    cx = (x0 + x1) / 2
    r = [f'{rc}{i}' for i in range(6)]
    if kind == 'flat':
        cv.rect(x0 + 2, top - 2, w - 4, 2, step(PAL[face], -1))
        if w > 14:                                             # a water tank on legs
            tx = int(x0 + w * rng.uniform(0.2, 0.55))
            cv.rect(tx, top - 9, 7, 5, 'wood1'); cv.hline(tx, tx + 6, top - 9, 'wood2')
            cv.hline(tx - 1, tx + 7, top - 10, 'cu2')
            cv.px(tx + 1, top - 3, 'wood0'); cv.px(tx + 5, top - 3, 'wood0')
            cv.vline(tx + 1, top - 4, top - 1, 'wood0'); cv.vline(tx + 5, top - 4, top - 1, 'wood0')
        ax = int(x0 + w * 0.8)
        cv.vline(ax, top - 14, top - 1, 'steel2')              # an aerial
        cv.hline(ax - 2, ax + 2, top - 10, 'steel2')
    elif kind == 'pagoda':                                     # green copper eaves, turned up at the ends
        tiers = 2 if w > 22 else 1
        y = top
        ww = w + 8
        for t_ in range(tiers):
            h = 5
            for i in range(ww):
                u = i / (ww - 1) * 2 - 1
                lift = int(round(3 * abs(u) ** 4))
                xx = int(cx - ww / 2 + i)
                cv.vline(xx, y - h - lift + int(2 * (1 - abs(u))) - 1, y - 1 - lift, r[2])
                cv.px(xx, y - 1 - lift, r[1])
                cv.px(xx, y - h - lift + int(2 * (1 - abs(u))) - 1, r[4] if u < 0.3 else r[3])
            y -= h + 2
            cv.rect(int(cx - ww / 4), y, int(ww / 2), 3, face)
            ww = int(ww * 0.6)
        cv.vline(int(cx), y - 6, y, r[3])
        cv.px(int(cx), y - 7, 'gold3')
    elif kind == 'dome':
        rr = w / 2 - 1
        for yy in range(int(top - rr * 0.9), top):
            for xx in range(x0, x1):
                dx = (xx + 0.5 - cx) / rr
                dy = (yy + 0.5 - top) / (rr * 0.9)
                if dx * dx + dy * dy < 1:
                    lit = -dx * 0.7 - dy * 0.7 + 0.6 * BAYER[yy % 4, xx % 4]
                    cv.px(xx, yy, r[1] if lit < 0.2 else (r[2] if lit < 0.6 else (r[3] if lit < 0.95 else r[4])))
        cv.vline(int(cx), int(top - rr * 0.9) - 8, int(top - rr * 0.9), 'cu3')
        cv.px(int(cx), int(top - rr * 0.9) - 9, 'gold3')
    elif kind == 'crown':                                      # stepped crown, the steps in copper
        for s in range(3):
            inset = 3 + s * 4
            y0 = top - (s + 1) * 4
            if x1 - inset - (x0 + inset) < 2:
                break
            cv.rect(x0 + inset, y0, x1 - x0 - 2 * inset, 4, face)
            cv.hline(x0 + inset, x1 - inset - 1, y0, r[3])
            cv.hline(x0 + inset, x1 - inset - 1, y0 + 1, r[2])
        cv.vline(int(cx), top - 22, top - 13, 'steel3')
    elif kind == 'spire':
        for yy in range(top - 30, top):
            hw = (yy - (top - 30)) / 30 * (w / 2 - 1)
            for xx in range(int(cx - hw), int(cx + hw) + 1):
                cv.px(xx, yy, r[3] if xx < cx else r[1])
        cv.vline(int(cx), top - 44, top - 30, 'steel3')


# ---------------------------------------------------------------- the far city
def far_city():
    cv = Canvas(W, H)
    rng = random.Random(23)
    blink = []
    # a low wall of the far city along the horizon, hazed
    x = 40
    while x < 600:
        w = rng.randint(8, 22)
        top = HZ - rng.randint(4, 26)
        face = rng.choice(('smog4', 'smog5', 'smog4'))
        tower(cv, rng, x, x + w, top, face, 'smog4', 0, wcol=('amber1', 'glow3', 'amber2'), cell=(3, 3), win=(1, 1),
              k=0.02, roof=rng.choice(('flat', 'flat', 'crown', 'pagoda')), roof_col='verd',
              edge='smog6', density=0.3, blink=blink if rng.random() < 0.3 else None)
        x += w + rng.randint(-3, 4)
    # taller far towers
    for (x0, w, top, roof) in ((96, 18, 104, 'crown'), (150, 14, 112, 'dome'), (250, 20, 96, 'flat'),
                               (380, 16, 108, 'pagoda'), (500, 22, 100, 'crown'), (560, 14, 116, 'dome')):
        tower(cv, rng, x0, x0 + w, top, 'smog3', 'smog2', 0, wcol=('amber1', 'amber2', 'glow3'), cell=(3, 4),
              win=(1, 1), k=0.03, roof=roof, roof_col='verd', edge='smog5', density=0.35, blink=blink)
    # the great spire with its mooring mast, and a blimp moored to it
    sx = 430
    for y in range(58, HZ + 30):
        hw = 3 + (y - 58) * 0.11
        for xx in range(int(sx - hw), int(sx + hw) + 1):
            cv.px(xx, y, 'smog3' if xx < sx + hw * 0.3 else 'smog2')
        if y % 9 == 0 and y > 70:
            cv.hline(int(sx - hw) - 2, int(sx + hw) + 2, y, 'smog4')
        if y % 5 == 2 and y > 66:
            for xx in range(int(sx - hw) + 1, int(sx + hw), 2):
                if rng.random() < 0.4:
                    cv.px(xx, y, rng.choice(('amber1', 'amber2')))
    cv.vline(sx, 36, 58, 'steel2')
    cv.rect(sx - 4, 58, 9, 2, 'smog4')
    blink.append((sx, 35))
    # moored blimp, a plain cigar
    for yy in range(46, 56):
        for xx in range(sx + 4, sx + 34):
            dx = (xx + 0.5 - (sx + 19)) / 15
            dy = (yy + 0.5 - 51) / 5
            if dx * dx + dy * dy < 1:
                cv.px(xx, yy, 'smog4' if dy < -0.2 else ('smog3' if dy < 0.5 else 'glow1'))
    cv.hline(sx + 10, sx + 26, 51, 'smog5')
    for xx in range(sx + 12, sx + 26, 3):
        cv.px(xx, 53, 'amber1')
    # haze over the foot of the far city
    a = cv.a
    for y in range(HZ - 6, HZ + 40):
        t = min(1, (y - HZ + 6) / 30)
        for x_ in range(W):
            if a[y, x_, 3] and BAYER[y % 4, x_ % 4] < t * 0.7:
                c = tuple(int(v) for v in a[y, x_, :3])
                if c not in (PAL['amber1'], PAL['amber2']):
                    a[y, x_, :3] = PAL['glow2'] if BAYER[y % 4, x_ % 4] < t * 0.35 else PAL['glow1']
    return cv, blink


def blinkers(points, n=N):
    """Red aviation lights, each blinking in its own time."""
    frames = []
    for f in range(n):
        cv = Canvas(W, H)
        for i, (x, y) in enumerate(points):
            ph = (f + i * 13) % 24
            if ph < 6:
                cv.px(x, y, 'warn3' if ph < 3 else 'warn2')
                if ph < 3:
                    for (dx, dy) in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                        cv.px(x + dx, y + dy, 'warn1')
        frames.append(cv)
    return frames


# ---------------------------------------------------------------- the mid city
MID = [  # x0, x1, top, face, side, roof, roof colour
    (40, 92, 112, 'smog2', 'smog1', 'pagoda', 'verd'),
    (96, 128, 132, 'smog3', 'smog2', 'flat', 'verd'),
    (132, 168, 120, 'smog2', 'smog1', 'dome', 'verd'),
    (176, 206, 140, 'smog3', 'smog2', 'crown', 'cu'),
    (214, 262, 128, 'smog2', 'smog1', 'flat', 'verd'),
    (300, 336, 146, 'smog3', 'smog2', 'pagoda', 'verd'),
    (360, 400, 136, 'smog2', 'smog1', 'crown', 'verd'),
    (452, 488, 124, 'smog3', 'smog2', 'dome', 'verd'),
    (496, 548, 106, 'smog2', 'smog1', 'pagoda', 'verd'),
    (556, 604, 128, 'smog2', 'smog1', 'flat', 'cu'),
]
CHIMNEYS = [(110, 122), (238, 118), (380, 118), (578, 118)]
VIADUCT_Y = 176


def mid_city():
    cv = Canvas(W, H)
    rng = random.Random(41)
    blink = []
    for (x0, x1, top, face, side, roof, rc) in MID:
        tower(cv, rng, x0, x1, top, face, side, 0, cell=(4, 5), win=(2, 2), k=0.06, roof=roof, roof_col=rc,
              band=4, edge='smog4', density=0.42, blink=blink if roof in ('crown', 'dome') else None)
    for (cx, top) in CHIMNEYS:                                  # brick stacks
        cv.rect(cx - 2, top - 12, 5, 12, 'red0')
        cv.vline(cx - 2, top - 12, top - 1, 'red1')
        cv.hline(cx - 3, cx + 3, top - 13, 'stone1')
        for y in range(top - 10, top, 3):
            cv.hline(cx - 2, cx + 2, y, 'wood0')
    # a skybridge between two towers, its windows lit
    y0 = 150
    cv.rect(262, y0, 38, 6, 'smog3')
    cv.hline(262, 299, y0, 'smog4')
    cv.hline(262, 299, y0 + 5, 'smog1')
    for x in range(264, 298, 3):
        cv.rect(x, y0 + 2, 2, 2, 'amber3' if (x * 7) % 5 else 'amber2')
    # the viaduct the train runs on: a steel deck on lattice piers
    cv.rect(0, VIADUCT_Y, W, 3, 'steel1')
    cv.hline(0, W - 1, VIADUCT_Y, 'steel3')
    cv.hline(0, W - 1, VIADUCT_Y + 3, 'smog1')
    for px in range(10, W, 46):
        for y in range(VIADUCT_Y + 4, H):
            cv.px(px, y, 'steel1'); cv.px(px + 5, y, 'steel1')
            if (y - VIADUCT_Y) % 6 == 0:
                cv.hline(px, px + 5, y, 'steel1')
            elif (y - VIADUCT_Y) % 6 == 3:
                cv.px(px + 2 + ((y // 6) % 2), y, 'steel0')
    # the city's glow lifts the feet of the towers
    a = cv.a
    for y in range(HZ, H):
        t = min(1.0, (y - HZ) / 60)
        for x in range(W):
            if a[y, x, 3] and BAYER[y % 4, x % 4] < t * 0.5:
                c = tuple(int(v) for v in a[y, x, :3])
                if c in (PAL['smog1'], PAL['smog2']):
                    a[y, x, :3] = PAL['glow0']
                elif c == PAL['smog3']:
                    a[y, x, :3] = PAL['glow1']
    return cv, blink


def train(n=LONG):
    """A train of lit carriages crossing on the viaduct once per loop."""
    frames = []
    L = 150
    for f in range(n):
        cv = Canvas(W, H)
        x0 = -L + (f / n) * (W + L + 60)
        y = VIADUCT_Y - 7
        for c in range(5):
            cx = int(x0 + c * 30)
            cv.rect(cx, y, 28, 7, 'steel2')
            cv.hline(cx, cx + 27, y, 'steel4')
            cv.hline(cx, cx + 27, y + 6, 'steel0')
            for wx in range(cx + 2, cx + 26, 4):
                cv.rect(wx, y + 2, 2, 2, 'amber3' if (wx + c) % 7 else 'paper3')
        hx = int(x0 + 5 * 30 - 2)
        cv.rect(hx, y + 1, 4, 5, 'steel2')
        cv.px(hx + 3, y + 3, 'paper4')
        for k in range(1, 9):                                   # its headlamp in the haze
            if (k + f) % 2 == 0:
                cv.px(hx + 3 + k, y + 3, 'amber3' if k < 4 else 'amber2')
        frames.append(cv)
    return frames


def traffic(n=LONG):
    """Lanes of airship-cabs: white lamps going right, red going left; each
    lane loops seamlessly over n frames."""
    rng = random.Random(9)
    lanes = [(118, 1, 7), (126, -1, 6), (137, 1, 9), (143, -1, 8), (158, 1, 7), (164, -1, 6)]
    cars = []
    for (y, d, cnt) in lanes:
        for i in range(cnt):
            cars.append((y + rng.choice((0, 0, 1, -1)), d, rng.uniform(0, W), rng.choice((1, 1, 2))))
    frames = []
    for f in range(n):
        cv = Canvas(W, H)
        for (y, d, x0, sp) in cars:
            x = (x0 + d * sp * W * f / n) % W
            xi = int(x)
            if d > 0:
                cv.px(xi, y, 'paper4'); cv.px(xi - 1, y, 'paper3')
                cv.px(xi - 2, y, 'amber2'); cv.px(xi - 3, y, 'amber1')
            else:
                cv.px(xi, y, 'warn3'); cv.px(xi + 1, y, 'warn2'); cv.px(xi + 2, y, 'warn1')
        frames.append(cv)
    return frames


def smoke(n=N):
    """Puffs off the chimneys: they rise, swell, lean away on the wind and thin out."""
    frames = []
    ramp = ['smog3', 'smog4', 'glow1', 'glow2']
    for f in range(n):
        cv = Canvas(W, H)
        for ci, (cx, top) in enumerate(CHIMNEYS):
            for k in range(8):
                age = ((f / n) * 4 + k / 8 + ci * 0.37) % 1.0
                r = 2.5 + age * 7
                y = top - 14 - age * 42
                x = cx + age * age * 30 + 2 * math.sin(age * 6 + ci)
                ox, oy = int(x - 2 * r - 2), int(y - 2 * r - 2)
                sub = Canvas(int(4 * r + 6), int(4 * r + 6))
                shade_puffs(sub, [(x - ox, y - oy, r), (x - ox + r * 0.6, y - oy + r * 0.3, r * 0.7)], ramp,
                            light=(0.2, 0.8, 0.5), dither=0.15, rim=False)
                ys, xs = np.nonzero(sub.a[..., 3] > 0)
                keep = BAYER[(ys + oy) % 4, (xs + ox) % 4] > age * 0.9      # older puffs break up
                ty, tx = ys[keep] + oy, xs[keep] + ox
                ok = (tx >= 0) & (tx < W) & (ty >= 0) & (ty < H)
                cv.a[ty[ok], tx[ok]] = sub.a[ys[keep][ok], xs[keep][ok]]
        frames.append(cv)
    return frames


# ---------------------------------------------------------------- the roofs under the window
def near_roofs():
    cv = Canvas(W, H)
    rng = random.Random(5)
    # a long tiled roof, ridge at y 184, falling away below the sill
    ridge = 184
    for x in range(0, W):
        cv.vline(x, ridge, H - 1, 'smog1')
    for x in range(0, W):
        for y in range(ridge + 2, H):
            row = (y - ridge - 2) // 4
            if (y - ridge - 2) % 4 == 3:
                cv.px(x, y, 'smog0')
            elif (x + row * 3) % 7 == 0:
                cv.px(x, y, 'smog0')
            elif (y - ridge - 2) % 4 == 0:
                cv.px(x, y, 'smog2')
    cv.hline(0, W - 1, ridge, 'verd2')                          # copper ridge
    cv.hline(0, W - 1, ridge + 1, 'verd1')
    for x in range(0, W, 9):
        cv.px(x, ridge, 'verd3')
    # glow on the tiles from the street far below and the lamps
    a = cv.a
    for y in range(ridge + 2, H):
        for x in range(W):
            if a[y, x, 3] and BAYER[y % 4, x % 4] < 0.18:
                a[y, x, :3] = PAL['glow0']
    # a water tower on the left, chimney pots, a skylight
    tx, ty = 120, 152
    cv.rect(tx, ty, 22, 18, 'wood1')
    for x in range(tx, tx + 22, 3):
        cv.vline(x, ty, ty + 17, 'wood0')
    cv.hline(tx - 1, tx + 22, ty + 5, 'steel2'); cv.hline(tx - 1, tx + 22, ty + 12, 'steel2')
    for k in range(24):                                         # conical cap
        cv.hline(tx + 11 - k // 2, tx + 11 + k // 2, ty - 8 + k // 3, 'verd2' if k < 12 else 'verd1')
    cv.vline(tx + 11, ty - 11, ty - 8, 'steel3')
    cv.vline(tx + 2, ty + 18, ridge, 'wood0'); cv.vline(tx + 19, ty + 18, ridge, 'wood0')
    cv.line(tx + 2, ty + 18, tx + 19, ridge - 1, 'wood0'); cv.line(tx + 19, ty + 18, tx + 2, ridge - 1, 'wood0')
    cv.vline(tx, ty, ty + 17, 'wood2')
    for (px_, h) in ((300, 9), (306, 7), (452, 10)):
        cv.rect(px_, ridge - h, 4, h, 'red1')
        cv.vline(px_, ridge - h, ridge - 1, 'red2')
        cv.hline(px_ - 1, px_ + 4, ridge - h - 1, 'stone1')
    # lamps on a cable across the view
    pts = []
    for x in range(60, 600):
        u = (x - 60) / 540
        pts.append((x, int(164 + 24 * 4 * u * (1 - u) * 0.9)))
    for (x, y) in pts:
        cv.px(x, y, 'smog0')
    for x in range(78, 600, 34):
        y = pts[x - 60][1]
        cv.vline(x, y + 1, y + 2, 'smog0')
        cv.rect(x - 1, y + 3, 3, 3, 'amber3')
        cv.px(x, y + 3, 'amber4')
        cv.px(x - 1, y + 5, 'amber2'); cv.px(x + 1, y + 5, 'amber2')
    return cv


def lamp_glow():
    """Soft warm halos round the cable lamps (alpha)."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    a = np.zeros((H, W), np.float32)
    for x in range(78, 600, 34):
        u = (x - 60) / 540
        y = int(164 + 24 * 4 * u * (1 - u) * 0.9) + 4
        a = np.maximum(a, np.clip(1 - np.hypot(xx - x, yy - y) / 11, 0, 1) ** 1.6 * 0.5)
    rgba = np.zeros((H, W, 4), np.uint8)
    rgba[..., :3] = PAL['amber3']
    q = np.floor(a * 5 + BAYER[yy.astype(int) % 4, xx.astype(int) % 4] * 0.999) / 5
    rgba[..., 3] = (np.clip(q, 0, 0.5) * 255).astype(np.uint8)
    return _canvas(rgba)


# ---------------------------------------------------------------- the airships
PUFFER_AT = (318, 66)          # where the sprite's top-left sits in the scene (it bobs inside the sprite)
KOI_Y = 64


def puffer_layers(n=N):
    """The pufferfish blimp frames placed in the scene, and its searchlight (alpha)."""
    frames, lamps = B.puffer_frames(n)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    out, beams = [], []
    for f, (fr, (lx, ly)) in enumerate(zip(frames, lamps)):
        cv = Canvas(W, H)
        cv.blit(_canvas(fr), PUFFER_AT[0], PUFFER_AT[1])
        out.append(cv)
        sx, sy = PUFFER_AT[0] + lx, PUFFER_AT[1] + ly
        ang = 0.35 + 0.12 * math.sin(2 * math.pi * f / n)      # the beam swings a little, ahead and down
        dx, dy = xx - sx, yy - sy
        along = dx * math.sin(ang) + dy * math.cos(ang)
        across = dx * math.cos(ang) - dy * math.sin(ang)
        w_ = 1.5 + 0.2 * np.maximum(along, 0)
        s = np.clip(1 - np.abs(across) / w_, 0, 1) * (along > 0) * np.clip(1 - along / 130, 0, 1)
        rgba = np.zeros((H, W, 4), np.uint8)
        rgba[..., :3] = PAL['paper4']
        q = np.floor(s ** 1.2 * 0.5 * 6 + BAYER[yy.astype(int) % 4, xx.astype(int) % 4] * 0.999) / 6
        rgba[..., 3] = (np.clip(q, 0, 0.45) * 255).astype(np.uint8)
        beams.append(_canvas(rgba))
    return out, beams


def koi_layer(n=LONG):
    fr = B.koi_frames(B.KOI_N)
    out = []
    w = B.KOI_SIZE[0]
    for f in range(n):
        cv = Canvas(W, H)
        x = int(-w + (f / n) * (W + w))
        y = KOI_Y + int(round(2 * math.sin(2 * math.pi * f / n * 2)))
        cv.blit(_canvas(fr[f % len(fr)]), x, y)
        out.append(cv)
    return out


def all_layers():
    """name -> Canvas or list of Canvas frames, back to front."""
    far, b1 = far_city()
    mid, b2 = mid_city()
    puff, beam = puffer_layers()
    L = {}
    L['00_sky'] = sky()
    L['01_clouds'] = clouds()
    L['02_searchlights'] = searchlights()
    L['03_far'] = far
    L['03_far_lights'] = blinkers(b1)
    L['04_koi'] = koi_layer()
    L['05_traffic'] = traffic()
    L['06_mid'] = mid
    L['06_mid_lights'] = blinkers(b2)
    L['07_train'] = train()
    L['08_smoke'] = smoke()
    L['09_puffer'] = puff
    L['09_puffer_beam'] = beam
    L['10_near'] = near_roofs()
    L['10_near_glow'] = lamp_glow()
    return L
