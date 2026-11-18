"""The main menu scene, built from the teahouse pack's own outside art so it is
the same hand and the same palette as the window views (the teahouse, the big
tree and the menu are drawn in menu_teahouse.py, menu_trees.py, menu_ui.py).

The pack's summer view (outside.all_layers) is the far half of the picture,
moved down to the menu's horizon (menu_layout.HORIZON):

  sky, clouds, mountains      the pack's; the sky's top colour carried up over the gap
  lake, lake life, birds      the pack's lake with its koi gliding and jumping, ducks, flocks
  hills, garden trees         the far shore and the grown trees along the near shore (16-frame sway)
  flowers                     the pack's flower bed along the shore (8-frame sway)
  wind                        the pack's gusts

and the near half is new, drawn with the same pieces:

  meadow       the pack's grass tufts, flowers and pampas (meadow.py), row after row down to the
               bottom edge, taller as they come nearer, swaying; a sandy path from the teahouse
               door to the bottom left
  river        a stream running out of the lake toward you: its water is the pack's lake water
               (the same rows of ripples, the sky in it, the same 12-frame loop) cut to the
               river's shape between earth banks; koi jump out of it now and then"""
import math
import random
import numpy as np
from pixel import Canvas, PAL
import season
import outside
import meadow as MD
import menu_layout as L
from menu_layout import W, H, N, HORIZON

X0 = 300                                   # where the 640-wide menu view sits in the pack's 1280 tile
DY = HORIZON - outside.HORIZON             # how far the pack's view moves down
SHORE = outside.HORIZON + 64 + DY          # the near edge of the flower bed: the menu's meadow starts here
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0


def _cv(a):
    c = Canvas(a.shape[1], a.shape[0])
    c.a = a
    return c


def _place(fr, off):
    """A pack layer frame (1280 wide, maybe cropped) moved into the menu view."""
    a = np.zeros((H, W, 4), np.uint8)
    ox, oy = off[0] if off else (0, 0)
    src = fr.a
    h, w = src.shape[:2]
    for k in (0, 1):                                       # the tile wraps: take it twice side by side
        x = ox + k * outside.OUT_W - X0
        y = oy + DY
        sx0, sy0 = max(0, -x), max(0, -y)
        dx0, dy0 = max(0, x), max(0, y)
        ww, hh = min(w - sx0, W - dx0), min(h - sy0, H - dy0)
        if ww > 0 and hh > 0:
            blk = src[sy0:sy0 + hh, sx0:sx0 + ww]
            m = blk[..., 3] > 0
            a[dy0:dy0 + hh, dx0:dx0 + ww][m] = blk[m]
    return a


def pack_view():
    """{name: (frames, stride)} - the pack's summer view moved to the menu."""
    season.set_season('summer')
    out = {}
    for name, frames, fac, *off in outside.all_layers():
        fr = [_place(f, off) for f in frames]
        if name == '00_sky':                               # carry the top colour up over the gap
            fr[0][:DY] = fr[0][DY]
        if name == '01_clouds':                            # and a second band of the same clouds, higher
            hi = np.zeros((H, W, 4), np.uint8)
            src = frames[0].a
            for k in (0, 1):
                x = k * outside.OUT_W - ((X0 + 610) % outside.OUT_W)
                sx0, dx0 = max(0, -x), max(0, x)
                ww = min(outside.OUT_W - sx0, W - dx0)
                if ww > 0:
                    blk = src[60:150, sx0:sx0 + ww]
                    hi[8:98, dx0:dx0 + ww] = np.where(blk[..., 3:4] > 0, blk, hi[8:98, dx0:dx0 + ww])
            m = hi[..., 3] > 0
            fr[0][m & (fr[0][..., 3] == 0)] = hi[m & (fr[0][..., 3] == 0)]
        if name == '07_flowers_close':                     # below the bed is the menu's own meadow
            for a in fr:
                a[SHORE + 2:] = 0
        out[name] = [_cv(a) for a in fr]
    return out


# ---------------------------------------------------------------- the path and the river
def path_centre(y):
    t = np.clip((y - L.TEAHOUSE[1]) / (H - L.TEAHOUSE[1]), 0, 1)
    return L.TEAHOUSE[0] - 6 - 120 * t ** 1.3 - 16 * np.sin(t * 3.1)


def path_half(y):
    t = np.clip((y - L.TEAHOUSE[1]) / (H - L.TEAHOUSE[1]), 0, 1)
    return 6 + 22 * t


def river_centre(y):
    t = np.clip((y - SHORE + 8) / (H - SHORE + 8), 0, 1)
    return 452 + 26 * np.sin(t * 3.0 + 0.4) + 60 * t ** 1.5


def river_half(y):
    t = np.clip((y - SHORE + 8) / (H - SHORE + 8), 0, 1)
    return 5 + 52 * t ** 1.2


def _in_river(x, y, pad=0.0):
    return y >= SHORE - 8 and abs(x - river_centre(y)) < river_half(y) + pad


def _in_path(x, y, pad=0.0):
    return y >= L.TEAHOUSE[1] - 2 and abs(x - path_centre(y)) < path_half(y) + pad


def ground():
    """The meadow floor (the pack's soil green, with the path and the river's banks)."""
    a = np.zeros((H, W, 4), np.uint8)
    yy, xx = np.mgrid[0:H, 0:W]
    g = yy >= SHORE - 6
    a[g, :3] = PAL['leaf1']
    a[g, 3] = 255
    pat = g & (((xx * 7 + yy * 13) % 23 == 0) | ((xx * 3 + yy * 5) % 31 == 0))
    a[pat, :3] = PAL['leaf2']
    # the path: trodden earth, worn pale down the middle, ragged grassy edges, a few pebbles
    pc, ph = path_centre(yy), path_half(yy)
    wob = 1 + 0.16 * np.sin(yy * 0.55 + xx * 0.21) + 0.08 * np.sin(yy * 1.7)
    on = g & (yy >= L.TEAHOUSE[1] - 2) & (np.abs(xx - pc) < ph * wob)
    u = (xx - pc) / np.maximum(ph * wob, 1)
    rough = BAYER[yy % 4, xx % 4]
    tone = np.where(np.abs(u) > 0.82, 'wood2', np.where(np.abs(u) > 0.55 + 0.2 * rough, 'wood3',
                    np.where(u < 0.1, 'paper2', 'paper1')))
    for c in ('wood2', 'wood3', 'paper2', 'paper1'):
        m = on & (tone == c)
        a[m, :3] = PAL[c]
    peb = on & ((xx * 17 + yy * 31) % 53 == 0) & (np.abs(u) < 0.7)
    a[peb, :3] = PAL['stone3']
    a[np.roll(peb, 1, 0) & on, :3] = PAL['wood2']
    a[np.roll(peb, 1, 1) & on, :3] = PAL['stone2']
    # the river's bed and banks: dark earth, a lit lip of grass on the far side
    rc, rh = river_centre(yy), river_half(yy)
    d = np.abs(xx - rc)
    bank = g & (yy >= SHORE - 8) & (d < rh + 2 + (yy - SHORE) * 0.03)
    a[bank, :3] = PAL['wood1']
    a[bank & (xx > rc) & (d > rh - 1), :3] = PAL['wood0']
    lip = g & (yy >= SHORE - 8) & (d >= rh + 2 + (yy - SHORE) * 0.03) & (d < rh + 3.5 + (yy - SHORE) * 0.04)
    a[lip, :3] = PAL['leaf3']
    return _cv(a)


def river(lake_frames):
    """The lake's own water (03_lake, 12 frames) carried down the river's shape:
    each river row takes one of the lake's near rows, so the ripples, the sky in
    them and their loop are the pack's. Repeated to N frames."""
    yy, xx = np.mgrid[0:H, 0:W]
    rc, rh = river_centre(yy), river_half(yy)
    water = (yy >= SHORE - 8) & (np.abs(xx - rc) < rh)
    lake_top = HORIZON + 8
    rows = lake_top + ((yy - SHORE) * 0.45).astype(int) % 22          # rows of the lake's nearer water
    across = np.clip(((xx - rc) / np.maximum(rh, 1) * 0.5 + 0.5) * 300, 0, 299).astype(int)
    src_x = (np.clip(xx, 0, W - 1) + across) % W
    out = []
    for f in range(len(lake_frames)):
        la = lake_frames[f].a
        a = np.zeros((H, W, 4), np.uint8)
        smp = la[np.clip(rows, 0, H - 1), src_x]
        a[water] = smp[water]
        a[water, 3] = 255
        under = water & (xx - rc > rh - 4)                              # shade under the near bank
        a[under, :3] = PAL['water0']
        out.append(a)
    return out


# ---------------------------------------------------------------- koi jumping in the river
JUMPS = [(10, 296, 1), (44, 334, -1), (74, 270, 1)]                    # (start frame, row, direction)


def _px(a, x, y, c, al=255):
    x, y = int(round(x)), int(round(y))
    if 0 <= x < W and 0 <= y < H:
        a[y, x, :3] = PAL[c]
        a[y, x, 3] = al


def koi_jumps(river_frames):
    """The pack's fish jump (life.lake), drawn as koi - red and white - leaping
    out of the river with a splash where it leaves and lands, and rings."""
    frames = [river_frames[f % len(river_frames)].copy() for f in range(N)]
    for (t0, jy, d) in JUMPS:
        sc = 2 if jy > 300 else 1
        jx = river_centre(jy) - d * river_half(jy) * 0.3
        span, high = 13 * sc, 11 * sc
        for k in range(30):
            a = frames[(t0 + k) % N]
            if k < 9:
                u = k / 8.0
                x = jx + d * u * span
                y = jy - high * 4 * u * (1 - u)
                tilt = 1 if u > 0.55 else (-1 if u < 0.45 else 0)
                body = ('white', 'fire3', 'fire3', 'white', 'fire2', 'fire2')
                for q in range(6):
                    for s in range(sc):
                        _px(a, x - q * d, y + (q * tilt) // 2 + s, body[q] if s == 0 else ('fire2' if q % 3 else 'cloud2'))
                _px(a, x + d, y, 'fire4')
                _px(a, x - 6 * d, y + (6 * tilt) // 2 - 1, 'fire2')
                _px(a, x - 6 * d, y + (6 * tilt) // 2 + sc, 'fire2')
            if k in (0, 1, 2, 8, 9, 10):                                  # splashes
                sx = jx if k < 4 else jx + d * span
                kk = k if k < 4 else k - 8
                for q in range(-3 * sc, 3 * sc + 1):
                    for z in range(max(0, (3 * sc - abs(q)) * (2 - kk) // 2)):
                        _px(a, sx + q, jy - 1 - z, 'white' if z else 'cloud3')
            if k >= 2:                                                    # rings spreading on the water
                for (sx, k0) in ((jx, 2), (jx + d * span, 10)):
                    if k >= k0:
                        rr = 1.5 + (k - k0) * 0.9 * sc
                        al = int(220 * (1 - (k - k0) / 20.0))
                        if al <= 0:
                            continue
                        for q in range(int(rr * 7) + 6):
                            ang = 2 * math.pi * q / (int(rr * 7) + 6)
                            X, Y = sx + rr * math.cos(ang), jy + rr * 0.3 * math.sin(ang)
                            if _in_river(X, Y, -1):
                                _px(a, X, Y, 'haze3' if math.sin(ang) < 0 else 'haze2', al)
    return [_cv(a) for a in frames]


# ---------------------------------------------------------------- the meadow down to the bottom edge
def near_meadow():
    """Rows of the pack's tufts, flowers and pampas from the shore down to the
    bottom edge, taller as they come nearer, leaving the path and the river clear.
    MD.F (8) frames of sway; returns (behind the teahouse front, in front of it)."""
    rng = random.Random(77)
    rows = []
    y = SHORE + 2
    while y < H + 14:
        t = (y - SHORE) / (H - SHORE)
        rows.append((y, int(10 + 30 * t ** 1.3), 6 + int(6 * t), 1 if (len(rows) % 3 == 1) else 0, 6 + 12 * t))
        y += int(5 + 10 * t)
    items = []
    kinds = ['daisy', 'cosmos_white', 'daisy', 'bellflower']
    for (gy, th, nb, dark, spc) in rows:
        x = rng.uniform(0, spc)
        while x < W + 10:
            yj = gy + rng.randint(-1, 1)
            if not (_in_river(x, yj, 4) or _in_path(x, yj, 3)):
                MD._GUST = -2 * math.pi * x / (W / 2.0)
                r = rng.random()
                if r < 0.03:
                    fr = MD.susuki(rng, int(th * rng.uniform(1.5, 2.0)))
                elif r < 0.08 + 0.04 * (gy > 300):
                    fr = MD.flower_plant(rng, rng.choice(kinds), h=int(th * rng.uniform(0.9, 1.5)))
                else:
                    fr = MD.tuft(rng, int(th * rng.uniform(0.7, 1.15)), nb + rng.randint(-1, 2), dark)
                items.append((yj, x, fr))
            x += spc * rng.uniform(0.55, 1.1)
    MD._GUST = 0.0
    items.sort(key=lambda it: it[0])
    back, front = [], []
    for f in range(MD.F):
        cb, cf = Canvas(W, H), Canvas(W, H)
        for (yj, x, fr) in items:
            s = fr[f]
            (cb if yj < L.TEAHOUSE[1] else cf).blit(s, int(x - s.w / 2), yj - s.h + 1)
        back.append(cb)
        front.append(cf)
    return back, front


def all_layers():
    """name -> list of frames (back to front; the teahouse goes between 08 and 09)."""
    pv = pack_view()
    rv = river(pv['03_lake'])
    back, front = near_meadow()
    Ls = {
        '00_sky': pv['00_sky'], '01_clouds': pv['01_clouds'], '02_mountains': pv['02_mountains'],
        '03_lake': pv['03_lake'], '04_lake_life': pv['04_lake_life'], '04_birds': pv['04_birds'],
        '05_hills_trees': pv['05_hills_trees'], '06_garden_trees': pv['06_garden_trees'],
        '06_ground': [ground()], '06_river': koi_jumps(rv), '07_flowers_close': pv['07_flowers_close'],
        '08_meadow_back': back, '09_meadow_front': front, '10_wind': pv['08_wind'],
    }
    return Ls
