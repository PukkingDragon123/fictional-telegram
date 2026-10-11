"""The lake, and the leviathan that lives in it.

lake_frames(): the water as a mirror. Every row of the lake reflects the
sky, clouds and mountains above the horizon, flipped, broken up by ripples
that run along the rows (each row slides a little, more toward the shore).
Near the horizon the water is almost all reflection; nearer the shore more of
its own deep blue-teal shows through, the way water looks at a steep angle.
On top: bands of light on the ripple crests that drift toward the shore, and
glitter that sparkles on and off. Quantised to the palette with an ordered
dither, NL frames that loop.

leviathan_frames(): a giant whale-like leviathan, far out on the lake, breaching
once per loop. A dark swell rolls toward the spot, the head bursts up through a
spray of water, the long body follows along a high arc - glossy blue-black back
with a row of ridge spines and barnacles, pale pleated throat, long knobbly
flippers, water streaming off it - then it crashes back down head first, the
flukes rising last. A huge splash crown goes up and falls back in drops, a foam
patch spreads and rings ripple out over the lake. Its reflection follows it in
the water. Exported cropped to the area it uses (x, y, w, h)."""
import math
import random
import numpy as np
from pixel import PAL

NL = 12                    # lake loop
NV = 72                    # leviathan loop (12 s at 6 fps)
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0 - 0.47

WATER_PAL = ['water0', 'water1', 'water2', 'haze0', 'haze1', 'haze2', 'haze3', 'sky0', 'sky1', 'sky2', 'sky3',
             'sky4', 'cloud1', 'cloud2', 'cloud3', 'teal0', 'teal1', 'teal2', 'teal3', 'indigo1', 'indigo2',
             'indigo3']


def _quant(rgb, names, dither=10.0, yy=None, xx=None):
    """Nearest palette colour per pixel (rgb float array (..., 3)), ordered dither."""
    pal = np.array([PAL[n] for n in names], float)
    if yy is not None:
        rgb = rgb + BAYER[yy % 4, xx % 4][..., None] * dither
    d = ((rgb[..., None, :] - pal[None, None, :, :]) ** 2).sum(-1)
    return pal[d.argmin(-1)].astype(np.uint8)


def lake_frames(above, horizon, W, H):
    """above: (H, W, 4) uint8 composite of sky, clouds and mountains. Returns NL
    RGBA arrays (H, W, 4), transparent above the horizon."""
    src = above[..., :3].astype(float)
    rows = H - horizon
    d = np.arange(1, rows + 1, dtype=float)[:, None]                       # distance below the horizon
    xs = np.arange(W)[None, :]
    yy, xx = np.mgrid[0:rows, 0:W]
    deep = np.array(PAL['water0'], float) * 0.6 + np.array(PAL['teal1'], float) * 0.4
    mid = np.array(PAL['water1'], float)
    rng = np.random.RandomState(5)
    ph = rng.uniform(0, 6.28, (rows, 1))
    out = []
    for f in range(NL):
        t = 2 * math.pi * f / NL
        amp = 0.4 + d * 0.07
        dx = amp * (np.sin(0.9 * d + t + ph) + 0.6 * np.sin(0.23 * xs * 0.25 + 0.5 * d - 2 * t))
        sx = (xs + np.round(dx)).astype(int) % W
        sy = np.clip(horizon - np.round(d * 1.05).astype(int), 0, horizon - 1)
        sy = np.broadcast_to(sy, (rows, W))
        refl = src[sy, sx]
        fres = np.clip(0.88 - d / 70.0, 0.3, 0.88)                         # mirror near the horizon, deep near shore
        water = mid * np.clip(1 - d / 45.0, 0, 1)[..., None] + deep * np.clip(d / 45.0, 0, 1)[..., None]
        rgb = refl * fres[..., None] + np.broadcast_to(water, (rows, W, 3)) * (1 - fres[..., None])
        rgb = rgb * 0.92                                                   # water darkens what it mirrors
        # light on the ripple crests, drifting toward the shore
        crest = np.sin(d * 1.3 - 2 * t + np.sin(xs * 0.031 + d * 0.2) * 2.2)
        rgb += (crest > 0.86)[..., None] * 34.0 * np.clip(1.1 - d / 60.0, 0.3, 1)[..., None]
        rgb -= (crest < -0.9)[..., None] * 16.0
        q = _quant(rgb, WATER_PAL, 12.0, yy, xx)
        a = np.zeros((H, W, 4), np.uint8)
        a[horizon:, :, :3] = q
        a[horizon:, :, 3] = 255
        # glitter: sparkles that come and go, thickest on the lit (left) side of each window's view
        g = random.Random(100 + f)
        for _ in range(260):
            x = g.randrange(W)
            y = horizon + 1 + int(g.random() ** 1.6 * min(rows - 2, 36))
            ln = g.choice((1, 1, 2, 3))
            c = PAL['cloud3'] if g.random() < 0.6 else PAL['sky4']
            for k in range(ln):
                a[y, (x + k) % W, :3] = c
        a[horizon, :, :3] = PAL['haze3']                                   # the far shore's bright waterline
        out.append(a)
    return out


# ---------------------------------------------------------------- the leviathan
BACK = ['gloss0', 'gloss1', 'gloss2', 'gloss3', 'gloss4', 'haze2']
BELLY = ['stone1', 'stone2', 'stone3', 'stone4', 'cloud2', 'cloud3']
SPRAY = ['haze3', 'cloud2', 'cloud3']


def _arc(span, height, n=600):
    """The leap: a parabola, extended below the water at both ends."""
    u = np.linspace(-0.7, 1.7, n)
    x = span * u
    y = -4 * height * u * (1 - u)
    seg = np.hypot(np.diff(x), np.diff(y))
    s = np.concatenate([[0], np.cumsum(seg)])
    return x, y, s, u


def leviathan_frames(bx, wl, length=86, radius=10.5, span=78, height=56):
    """Frames (NV) of RGBA arrays (h, w, 4) plus the crop origin (x0, y0) in layer
    coordinates. bx: where it leaves the water; wl: the water line there."""
    ax, ay, asl, au = _arc(span, height)
    s_emerge = np.interp(0.0, au, asl)
    s_enter = np.interp(1.0, au, asl)
    pad_l, pad_r, pad_t, pad_b = 60, 60, height + 50, 34
    x0, y0 = int(bx - pad_l), int(wl - pad_t)
    w, h = int(span + pad_l + pad_r), int(pad_t + pad_b)
    YY, XX = np.mgrid[0:h, 0:w].astype(float)
    wly = wl - y0                                                          # water line in crop coords
    ex, enx = bx - x0, bx + span - x0                                      # emerge and entry points
    t_up, t_end = 14, 44                                                   # frames: head breaks / tail gone
    speed = (s_enter + length + 6 - s_emerge) / (t_end - t_up)
    rng = random.Random(9)
    drops = []                                                             # (t0, x, y, vx, vy, size)
    for _ in range(150):                                                   # spray as it bursts up
        drops.append((t_up + rng.uniform(0, 3), ex + rng.uniform(-6, 6), wly, rng.uniform(-1.6, 1.6),
                      rng.uniform(1.5, 4.6), rng.choice((1, 1, 2))))
    t_in = t_up + (s_enter - s_emerge) / speed                             # head hits the water
    for _ in range(420):                                                   # the crash
        a = rng.uniform(0, math.pi)
        v = rng.uniform(1.2, 6.2)
        drops.append((t_in + rng.uniform(0, 8), enx + rng.uniform(-14, 10), wly, math.cos(a) * v * 0.9,
                      math.sin(a) * v + rng.uniform(0, 1.5), rng.choice((1, 1, 2, 2, 3))))
    frames = []
    pal_back = np.array([PAL[c] for c in BACK], np.uint8)
    pal_belly = np.array([PAL[c] for c in BELLY], np.uint8)
    for f in range(NV):
        a = np.zeros((h, w, 4), np.uint8)
        body = np.zeros((h, w), bool)
        # the swell before it breaks the surface
        if t_up - 8 <= f < t_up:
            k = (f - (t_up - 8)) / 8.0
            cx = ex - 40 * (1 - k)
            m = (((XX - cx) / (14 + 6 * k)) ** 2 + ((YY - wly - 1) / 2.6) ** 2) < 1
            a[m] = (*PAL['water0'], 150)
            crest = m & ~np.roll(m, 1, axis=0)
            a[crest & (XX % 3 != 0)] = (*PAL['haze3'], 200)
        sh = s_emerge + (f - t_up) * speed                                 # arc position of the head
        if t_up <= f <= t_end + 1:
            S = np.linspace(sh, sh - length, 160)
            px = np.interp(S, asl, ax) + ex
            py = np.interp(S, asl, ay) + wly
            tx, ty = np.gradient(px), np.gradient(py)
            tl = np.hypot(tx, ty) + 1e-6
            nx, ny = -ty / tl, tx / tl                                     # normal; flip so +n points down (belly)
            flip = np.where(ny < 0, -1.0, 1.0)
            nx, ny = nx * flip, ny * flip
            sfrac = np.linspace(0, 1, 160)
            prof = np.where(sfrac < 0.12, np.sqrt(np.clip(sfrac / 0.12, 0, 1)) * 0.92 + 0.08,
                            np.where(sfrac < 0.45, 1.0, np.clip(1 - (sfrac - 0.45) / 0.55, 0.06, 1) ** 0.9))
            R = radius * prof
            # rasterise: nearest spine sample per pixel (coarse, then the body is smooth enough at this size)
            bb = (px.min() - radius - 14, px.max() + radius + 14, py.min() - radius - 14, py.max() + radius + 14)
            sel = (XX >= bb[0]) & (XX <= bb[1]) & (YY >= bb[2]) & (YY <= bb[3])
            Py, Px = YY[sel], XX[sel]
            dd = (Px[:, None] - px[None, :]) ** 2 + (Py[:, None] - py[None, :]) ** 2
            j = dd.argmin(1)
            dist = np.sqrt(dd[np.arange(len(j)), j])
            side = (Px - px[j]) * nx[j] + (Py - py[j]) * ny[j]               # + toward the belly
            r = R[j]
            inside = dist <= r
            # flukes: a crescent across the tail, tips swept back, notched in the middle
            Tx, Ty = tx[-1] / tl[-1], ty[-1] / tl[-1]
            ra = (Px - px[-1]) * Tx + (Py - py[-1]) * Ty
            rb = (Px - px[-1]) * nx[-1] + (Py - py[-1]) * ny[-1]
            fl = (ra > -2.5 + 0.065 * rb ** 2) & (ra < 1.0 + 0.04 * rb ** 2 - 1.6 * np.exp(-rb ** 2 / 4)) & \
                (np.abs(rb) < 14)
            # a long knobbly flipper from the belly side, swept back and down
            k = 45
            bxp, byp = px[k] + nx[k] * R[k] * 0.7, py[k] + ny[k] * R[k] * 0.7
            ca, sa = math.cos(0.6), math.sin(0.6)
            Dx = (tx[k] * ca + nx[k] * sa) / tl[k] * 1.0
            Dy = (ty[k] * ca + ny[k] * sa) / tl[k] * 1.0
            dn = math.hypot(Dx, Dy) or 1
            Dx, Dy = Dx / dn, Dy / dn
            fln = 24.0
            tt = np.clip(((Px - bxp) * Dx + (Py - byp) * Dy) / fln, 0, 1)
            fd = np.hypot(Px - (bxp + Dx * fln * tt), Py - (byp + Dy * fln * tt))
            fw = 3.4 * (1 - tt) + 0.9 + 0.6 * (np.sin(tt * 26) > 0.4)
            fin = fd < fw
            fin_under = fin & (((Px - bxp) * -Dy + (Py - byp) * Dx) > 0)
            # ridge spines along the back
            spine = (side < 0) & (dist > r) & (dist < r + 3.2 * (1 - np.abs(((sfrac[j] * 18) % 1) - 0.5) * 2)) & \
                (sfrac[j] > 0.15) & (sfrac[j] < 0.8)
            v = np.clip(-side / np.maximum(r, 0.5), -1, 1)                  # +1 on the back, -1 on the belly
            lit = 0.35 + 0.45 * v * 0.5 + 0.3 * (v > 0.55)                  # wet sheen along the top
            col = np.zeros((len(j), 4), np.uint8)
            back_i = np.clip((lit * 5).astype(int), 0, 4)
            belly_i = np.clip(((0.5 - v * 0.5) * 3 + 1.5).astype(int), 1, 5)
            is_belly = (v < -0.25) & (sfrac[j] < 0.55)
            pleat = is_belly & ((dist * 1.7).astype(int) % 2 == 0)
            col[:, :3] = np.where(is_belly[:, None], pal_belly[np.where(pleat, belly_i - 1, belly_i)],
                                  pal_back[back_i])
            barn = (~is_belly) & (sfrac[j] < 0.3) & (np.sin(Px * 2.1) * np.sin(Py * 1.7) > 0.86)
            col[barn, :3] = PAL['stone3']
            mouth = (np.abs(side - r * 0.1) < 0.7) & (sfrac[j] < 0.24) & inside
            col[mouth, :3] = PAL['gloss0']
            eye = (np.abs(sfrac[j] - 0.13) < 0.012) & (np.abs(side + r * 0.25) < 1.1)
            col[eye, :3] = PAL['gold3']
            col[fl, :3] = pal_back[2]
            col[fl & (ra > 0.4 * rb * 0 + 0.02 * rb ** 2), :3] = pal_back[1]
            col[fin, :3] = pal_back[3]
            col[fin_under, :3] = PAL['stone3']
            col[fin & (np.sin(Px * 1.9 + Py * 1.3) > 0.9), :3] = PAL['stone4']     # barnacles on the flipper
            col[spine, :3] = pal_back[1]
            draw = inside | fl | fin | spine
            col[:, 3] = 255
            above = Py <= wly
            under = ~above & draw
            idx = np.nonzero(sel)
            full = draw & above
            a[idx[0][full], idx[1][full]] = col[full]
            body[idx[0][full], idx[1][full]] = True
            # the part still under water: a dark shape seen through it
            a[idx[0][under], idx[1][under]] = (*PAL['water0'], 120)
            # outline on the shadow side, sky rim on top
            bm = body
            edge = bm & ~(np.roll(bm, 1, 0) & np.roll(bm, -1, 0) & np.roll(bm, 1, 1) & np.roll(bm, -1, 1))
            a[edge] = (*PAL['gloss0'], 255)
            rim = bm & ~np.roll(bm, 1, 0) & ~edge
            a[np.roll(edge & ~np.roll(bm, 1, 0), 0, 0) & (YY < wly - 1)] = (*PAL['haze2'], 255)
            # its reflection in the water, flipped about the water line, rippled
            ys, xs = np.nonzero(bm)
            for yv, xv in zip(ys, xs):
                ry = int(2 * wly - yv) + 1
                rx = int(xv + round(math.sin(ry * 0.9 + f) * 1.2))
                if wly < ry < h and 0 <= rx < w and a[ry, rx, 3] < 200 and (ry + rx) % 3:
                    a[ry, rx] = (*PAL['gloss1' if ry - wly < 10 else 'water0'], 170)
            # water streaming off the body
            for yv, xv in zip(ys[::9], xs[::9]):
                if not bm[min(h - 1, yv + 1), xv] and rng.random() < 0.5:
                    for k in range(1, rng.randint(2, 6)):
                        if yv + k < wly:
                            a[yv + k, xv] = (*PAL['cloud2' if k < 3 else 'haze3'], 230)
        # spray and splash drops, falling back
        for (t0, x, y, vx, vy, sz) in drops:
            dt = f - t0
            if dt < 0 or dt > 26:
                continue
            X = x + vx * dt
            Y = y - (vy * dt - 0.16 * dt * dt)
            if Y > wly or not (0 <= int(X) < w - 1 and 0 <= int(Y) < h - 1):
                continue
            c = PAL[SPRAY[2 if dt < 6 else (1 if dt < 14 else 0)]]
            for kx in range(sz):
                for ky in range(min(sz, 2)):
                    if 0 <= int(X) + kx < w and 0 <= int(Y) + ky < h:
                        a[int(Y) + ky, int(X) + kx] = (*c, 255)
        # foam patches where it broke the surface and where it fell
        for (cx, t0, life, size) in ((ex, t_up, 16, 10), (enx - 4, t_in, 26, 24)):
            k = (f - t0) / life
            if 0 <= k <= 1:
                rr = size * (0.6 + 0.6 * k)
                m = (((XX - cx) / rr) ** 2 + ((YY - wly - 1) / (rr * 0.22)) ** 2 < 1) & \
                    (np.sin(XX * 1.3 + YY * 2.1 + f) > -0.3 + 1.2 * k)
                a[m & (a[..., 3] < 255)] = (*PAL['cloud3'], 230)
        # rings spreading out over the lake
        for (cx, t0) in ((ex, t_up), (enx - 4, t_in), (enx - 4, t_in + 6)):
            dt = f - t0
            if 2 <= dt <= 26:
                rr = 6 + dt * 2.6
                ring = np.abs(np.hypot((XX - cx) / rr, (YY - wly - 2) / (rr * 0.18)) - 1) < 0.06
                ring &= (YY > wly) & ((XX + f) % 4 != 0)
                al = int(200 * (1 - dt / 27))
                a[ring & (a[..., 3] == 0)] = (*PAL['haze3'], al)
        frames.append(a)
    return frames, (x0, y0)
