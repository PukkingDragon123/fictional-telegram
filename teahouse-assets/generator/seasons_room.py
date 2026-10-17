"""The rooms through the year: the season on the window glass.

window_layer(season, shell): drawn between the view outside and the room shell,
so it only shows in the window openings (the lattice draws over it):
    spring   cherry petals blown onto the outer sills and stuck to the glass
    autumn   maple leaves caught on the sills and the glass
    winter   frost growing in from the edge of every pane, snow heaped on the
             outer sills, icicles hanging from the top of each opening
    (summer has none)"""
import math
import random
import numpy as np
from pixel import Canvas, PAL
from layout import W, H, WIN_MAIN, WIN_ROUND, WIN_BELL


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
