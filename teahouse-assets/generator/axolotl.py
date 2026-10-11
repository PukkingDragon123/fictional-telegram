"""The black axolotl-frog under the bed: a 3D creature, rendered per frame.

Body: a smooth tube along a spine (broad flat head, slim neck, thick body,
long tapering tail) that follows the path it walks, so it turns naturally,
rippling side to side as it walks. Each pixel of the tube takes the nearest
spine section in front, so the tail passes behind the body when it turns.
The skin is wet black: lit from the upper left, a thin specular shine, faint
speckles fixed to the skin. A fin runs along the top of the tail; four legs
step in a diagonal gait with splayed toes; frog-like golden eyes; three
feathery gill fronds on each side of the head sway as it moves. Far-side legs
and gills go behind the body, near-side ones in front.

It crawls a slow loop on the floor under the bed: along the front (side on),
turning away into the dark (from behind, smaller and darker), along the back
and turning toward us again (head on). N frames loop seamlessly."""
import math
import numpy as np
from pixel import Canvas, PAL, step

N = 48
SC = 1.6                     # size of the creature
W, H = 196, 52
BASE_Y = 47                  # screen y of the floor at depth 0 (the front)
DEPTH_Y = 0.65
RX, RZ, CX, CZ = 58.0, 11.0, 98.0, 12.0
LIGHT = np.array([-0.45, -0.7, 0.55])
LIGHT = LIGHT / np.linalg.norm(LIGHT)
HALF = (LIGHT + np.array([0, 0, 1.0])) / np.linalg.norm(LIGHT + np.array([0, 0, 1.0]))
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0 - 0.47
SKIN = ['gloss0', 'ink', 'gloss1', 'smoke0', 'smoke1', 'smoke2']
PROFILE = [(0.0, 3.0), (0.03, 4.4), (0.08, 5.0), (0.13, 3.7), (0.19, 3.4), (0.3, 4.6), (0.42, 4.6), (0.53, 3.7),
           (0.68, 2.7), (0.84, 1.7), (1.0, 0.45)]


def _radius(s):
    xs, rs = zip(*PROFILE)
    return float(np.interp(s, xs, rs)) * SC


def _path(t):
    a = 2 * math.pi * t
    x, z = CX - RX * math.sin(a), CZ - RZ * math.cos(a)
    dx, dz = -RX * math.cos(a), RZ * math.sin(a)
    return x, z, math.atan2(dz, dx)


def _proj(X, Y, Z):
    s = 1.0 - 0.008 * Z
    return X, BASE_Y - Z * DEPTH_Y - Y * s, s


def _dim(Z):
    return float(np.clip(1.0 - Z / 28.0, 0.32, 1.0))


def _col(name, dim):
    c = PAL[name]
    if dim < 0.55:
        c = step(c, -2)
    elif dim < 0.8:
        c = step(c, -1)
    return c


def _stroke(cv, pts, r0, r1, cols, dims):
    """A tapered 2D stroke through projected points; cols = (lit, mid, dark)."""
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) * 2))
        for k in range(n + 1):
            u = (i + k / n) / (len(pts) - 1)
            r = r0 + (r1 - r0) * u
            x, y = x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n
            d = dims[min(len(dims) - 1, i)]
            for yy in range(int(y - r), int(y + r) + 1):
                for xx in range(int(x - r), int(x + r) + 1):
                    if (xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= r * r and 0 <= xx < W and 0 <= yy < H:
                        c = cols[0] if yy + 0.5 < y - r * 0.3 else (cols[1] if yy + 0.5 < y + r * 0.4 else cols[2])
                        cv.a[yy, xx] = (*_col(c, d), 255)


def frame(f):
    cv = Canvas(W, H)
    t = f / N
    walk = 2 * math.pi * f / N * 8                                      # 8 strides per loop
    length = 64.0 * SC
    path_len = 2 * math.pi * math.sqrt((RX ** 2 + RZ ** 2) / 2)
    S = []
    for k in range(96):
        s = k / 95
        x, z, hd = _path((t - s * length / path_len) % 1.0)
        wave = 2.6 * SC * math.sin(walk - s * 5.5) * min(1.0, s * 2.2)
        x += -math.sin(hd) * wave
        z += math.cos(hd) * wave * 0.6
        r = _radius(s)
        S.append((x, z, hd, s, r))
    hx, hz, hd, _, hr = S[2]
    fx, fz = math.cos(hd), math.sin(hd)
    lx, lz = -fz, fx                                                    # its left, in the floor plane
    near_side = -1 if lz > 0 else 1                                     # the side toward us (smaller depth)
    head_y = hr * 0.8 + 0.6

    def legs(which):
        for (si, phase) in ((0.22, 0.0), (0.5, math.pi)):
            bx, bz, bd, _, rb = S[int(si * 95)]
            bfx, bfz = math.cos(bd), math.sin(bd)
            blx, blz = -bfz, bfx
            for side in (-1, 1):
                if (side == near_side) != (which == 'near'):
                    continue
                ph = walk + phase + (math.pi if side > 0 else 0)
                stride = 3.2 * SC * math.sin(ph)
                lift = max(0.0, math.cos(ph)) * 1.8 * SC
                hip = (bx + blx * side * rb * 0.75, rb * 0.8, bz + blz * side * rb * 0.75)
                foot = (bx + blx * side * (rb + 4 * SC) + bfx * stride, 0.5 + lift,
                        bz + blz * side * (rb + 4 * SC) + bfz * stride)
                knee = ((hip[0] + foot[0]) / 2 + blx * side * 1.5, hip[1] + 1.6 * SC, (hip[2] + foot[2]) / 2 + blz * side * 1.5)
                P = [_proj(*p)[:2] for p in (hip, knee, foot)]
                d = [_dim(p[2]) for p in (hip, knee, foot)]
                _stroke(cv, P, 2.7, 1.9, ('smoke0', 'gloss1', 'gloss0'), d)
                for toe in (-0.7, 0.0, 0.7):                                # splayed toes
                    ang = bd + side * 0.4 + toe
                    tx, tz = foot[0] + math.cos(ang) * 2.4 * SC, foot[2] + math.sin(ang) * 2.4 * SC
                    _stroke(cv, [P[2], _proj(tx, 0.3, tz)[:2]], 1.0, 0.7, ('smoke0', 'gloss1', 'gloss0'), [d[2]])

    def gills(which):
        gx, gz, gd, _, gr = S[10]
        for side in (-1, 1):
            if (side == near_side) != (which == 'near'):
                continue
            for k in range(3):
                spread = (k - 1) * 0.85
                sway = 0.3 * math.sin(2 * math.pi * f / N * 4 + k * 1.3 + side)
                pts3 = []
                for j in range(8):
                    u = j / 7
                    out = gr * 0.7 + 7.0 * SC * u
                    back = -(1.0 + 3.5 * u) * SC
                    up = head_y + (1.3 - k * 1.2 + 2.2 * math.sin(spread + sway)) * u * SC + 0.6 * k
                    X = gx + fx * back + lx * side * out * math.cos(spread * 0.5 + sway)
                    Z = gz + fz * back + lz * side * out * math.cos(spread * 0.5 + sway)
                    pts3.append((X, up, Z))
                P = [_proj(*p)[:2] for p in pts3]
                d = [_dim(p[2]) for p in pts3]
                _stroke(cv, P, 0.8, 0.5, ('purp1', 'purp0', 'purp0'), d)
                for j in range(2, 8, 2):                                    # feathery filaments, spaced out
                    (x0, y0), (x1, y1) = P[j - 1], P[j]
                    tx, ty = x1 - x0, y1 - y0
                    ln = math.hypot(tx, ty) or 1
                    nx, ny = -ty / ln, tx / ln
                    for sgn in (-1, 1):
                        xx, yy = int(x1 + nx * sgn * 1.6 - tx / ln), int(y1 + ny * sgn * 1.6 - ty / ln)
                        if 0 <= xx < W and 0 <= yy < H:
                            cv.a[yy, xx] = (*_col('pink2', d[j]), 255)
                xt, yt = int(P[-1][0]), int(P[-1][1])
                if 0 <= xt < W and 0 <= yt < H:
                    cv.a[yt, xt] = (*_col('pink3', d[-1]), 255)               # the frond's bright tip

    def fin():
        for (x, z, hd_, s, r) in S:
            if s < 0.42:
                continue
            fh = 3.0 * SC * max(0.0, 1 - (s - 0.42) / 0.58) ** 0.8
            sx, sy, sc_ = _proj(x, r * 0.8 + 0.6 + r * 0.85, z)
            d = _dim(z)
            for k in range(int(fh * sc_) + 1):
                yy, xx = int(sy - k), int(sx)
                if 0 <= xx < W and 0 <= yy < H:
                    cv.a[yy, xx] = (*_col('gloss1' if k < fh * sc_ - 1 else 'smoke1', d), 255)

    # back layer
    fin()
    legs('far')
    gills('far')
    # the body: a tube, each pixel taking the nearest spine section in front
    px_ = np.array([_proj(x, r * 0.8 + 0.6, z)[0] for (x, z, _, _, r) in S])
    py_ = np.array([_proj(x, r * 0.8 + 0.6, z)[1] for (x, z, _, _, r) in S])
    sc_ = np.array([_proj(x, 0, z)[2] for (x, z, _, _, _) in S])
    R = np.array([r for (_, _, _, _, r) in S]) * sc_
    D = np.array([-z for (_, z, _, _, _) in S])
    dims = np.array([_dim(z) for (_, z, _, _, _) in S])
    x0, x1 = int(max(0, (px_ - R).min() - 1)), int(min(W, (px_ + R).max() + 2))
    y0, y1 = int(max(0, (py_ - R).min() - 1)), int(min(H, (py_ + R).max() + 2))
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(float)
    P = np.stack([xx.ravel() + 0.5, yy.ravel() + 0.5], 1)
    dx = P[:, 0:1] - px_[None, :]
    dy = P[:, 1:2] - py_[None, :]
    q = (dx * dx + dy * dy) / (R[None, :] ** 2)
    inside = q <= 1.0
    nz = np.sqrt(np.clip(1 - q, 0, 1))
    depth = np.where(inside, D[None, :] + nz * R[None, :] * 0.3, -1e9)
    j = depth.argmax(1)
    hit = inside[np.arange(len(j)), j]
    ii = np.nonzero(hit)[0]
    j = j[ii]
    ox, oy = dx[ii, j] / R[j], dy[ii, j] / R[j]
    nzz = nz[ii, j]
    lit = np.clip(ox * LIGHT[0] + oy * LIGHT[1] + nzz * LIGHT[2], 0, 1)
    spec = np.clip(ox * HALF[0] + oy * HALF[1] + nzz * HALF[2], 0, 1) ** 26
    ang = np.arctan2(oy, ox)
    speck = (np.sin(j * 2.3 + ang * 5.1) * np.sin(j * 1.7 - ang * 3.3)) > 0.82          # fixed to the skin
    v = (0.12 + 0.88 * lit) * (0.45 + 0.55 * dims[j])
    pyx = (P[ii, 1] - 0.5).astype(int), (P[ii, 0] - 0.5).astype(int)
    v = v + BAYER[pyx[0] % 4, pyx[1] % 4] * 0.1 - 0.08 * speck
    pal = np.array([PAL[c] for c in SKIN], np.uint8)
    idx = np.clip((v * (len(SKIN) - 0.01)).astype(int), 0, len(SKIN) - 1)
    rgb = pal[idx]
    wet = (spec > 0.55) & (dims[j] > 0.5)
    rgb[wet] = PAL['haze2']
    rgb[wet & (spec > 0.85)] = PAL['cloud2']
    cv.a[pyx[0], pyx[1], :3] = rgb
    cv.a[pyx[0], pyx[1], 3] = 255
    body = np.zeros((H, W), bool)
    body[pyx] = True
    edge = body & ~(np.roll(body, -1, 0) & np.roll(body, -1, 1))
    cv.a[edge] = (*PAL['gloss0'], 255)
    # front layer
    legs('near')
    gills('near')
    # eyes: bulging, golden, black pupils, a glint
    for side in (-1, 1):
        ex, ez = hx + fx * 1.5 * SC + lx * side * hr * 0.62, hz + fz * 1.5 * SC + lz * side * hr * 0.62
        sx, sy, s_ = _proj(ex, head_y + hr * 0.62, ez)
        d = _dim(ez)
        rr = 1.9 * s_ * SC / 1.4
        for yv in range(int(sy - rr - 1), int(sy + rr + 2)):
            for xv in range(int(sx - rr - 1), int(sx + rr + 2)):
                dd = math.hypot(xv + 0.5 - sx, yv + 0.5 - sy)
                if dd <= rr and 0 <= xv < W and 0 <= yv < H:
                    c = 'gold3' if yv + 0.5 > sy else 'gold2'
                    if dd > rr - 0.8:
                        c = 'gloss0'
                    cv.a[yv, xv] = (*_col(c, d), 255)
        if 0 <= int(sx) < W and 0 <= int(sy) < H:
            cv.a[int(sy), int(sx)] = (*PAL['ink'], 255)
            cv.a[int(sy), min(W - 1, int(sx) + 1)] = (*PAL['ink'], 255)
            if int(sy) - 1 >= 0:
                cv.a[int(sy) - 1, int(sx) - 1] = (*PAL['white'], 255)
    # the axolotl smile along the front of the head
    sx, sy, _ = _proj(hx + fx * hr * 0.9, head_y - hr * 0.25, hz + fz * hr * 0.9)
    wdt = int(hr * 0.9 * (abs(lx) * 0.9 + 0.2))
    for k in range(-wdt, wdt + 1):
        xv, yv = int(sx + k), int(sy + 0.08 * k * k)
        if 0 <= xv < W and 0 <= yv < H and body[yv, xv]:
            cv.a[yv, xv] = (*PAL['gloss0'], 255)
    return cv


def frames():
    return [frame(f) for f in range(N)]
