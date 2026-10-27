"""The look: a black, crumpled-paper void outlined in glowing white scribbles that
boil (redrawn every other frame, like hand-drawn animation), white scribbled
eyes, set against a deep cosmic nebula."""
import math
import cv2
import numpy as np


def fbm(H, W, seed, scale, octaves=5, gain=0.55):
    """Fractal value noise in 0..1 (smooth, from upscaled random grids)."""
    rng = np.random.RandomState(seed)
    out = np.zeros((H, W), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        s = max(2, int(scale * 2 ** o))
        g = rng.rand(int(H / W * s) + 3, s + 3).astype(np.float32)
        out += amp * cv2.resize(g, (W, H), interpolation=cv2.INTER_CUBIC)
        tot += amp
        amp *= gain
    out /= tot
    return np.clip((out - out.min()) / (np.ptp(out) + 1e-6), 0, 1)


def nebula(W, H, seed=7):
    """Deep space: navy and violet, clouds of magenta and red, filaments of gold
    dust, and stars of every colour, some of them glowing."""
    n1 = fbm(H, W, seed, 3)
    n2 = fbm(H, W, seed + 1, 4)
    n3 = fbm(H, W, seed + 2, 6)
    rid = 1 - np.abs(fbm(H, W, seed + 3, 5) * 2 - 1)                  # ridged: thin bright filaments
    img = np.zeros((H, W, 3), np.float32)
    img[:] = (22, 8, 6)                                              # BGR: deep navy
    xx = np.linspace(0, 1, W)[None, :]
    violet = np.clip((n1 - 0.4) * 2.0, 0, 1)[..., None]
    img += violet * np.array([70, 14, 38], np.float32)
    red = (np.clip((n2 - 0.52) * 2.4, 0, 1) * np.clip(n1 * 1.3, 0, 1))[..., None]
    img += red * np.array([50, 16, 120], np.float32)
    blue = (np.clip((0.45 - n2) * 2.0, 0, 1) * np.clip(n3, 0, 1))[..., None]
    img += blue * np.array([120, 36, 14], np.float32)
    side = np.clip((xx - 0.55) * 3, 0, 1) * 0.9 + 0.1                 # gold dust mostly to one side
    gold = (np.clip((rid - 0.8) * 4, 0, 1) * np.clip((n2 - 0.42) * 2.5, 0, 1) * side)[..., None]
    img += gold * np.array([40, 120, 175], np.float32)
    img = cv2.GaussianBlur(img, (0, 0), 1.2)
    rng = np.random.RandomState(seed + 9)
    stars = np.zeros((H, W, 3), np.float32)
    cols = [(255, 255, 255), (70, 60, 255), (60, 40, 230), (255, 150, 120), (230, 120, 255), (160, 220, 255)]
    for _ in range(int(W * H / 500)):
        x, y = rng.randint(W), rng.randint(H)
        c = np.array(cols[rng.randint(len(cols))], np.float32) * rng.uniform(0.3, 1.0)
        r = 1 if rng.rand() < 0.85 else 2
        cv2.circle(stars, (x, y), r - 1 if r > 1 else 0, c.tolist(), -1, cv2.LINE_AA)
    halo = cv2.GaussianBlur(stars, (0, 0), 3) * 2.2
    img = img + stars + halo
    return np.clip(img, 0, 255)


def crumple(W, H, seed=3, cells=260):
    """Crumpled paper: the creases of a sheet squeezed into a ball and opened out,
    as a 0..1 shading map."""
    from scipy.spatial import cKDTree
    rng = np.random.RandomState(seed)
    pts = rng.rand(cells, 2) * [W, H]
    yy, xx = np.mgrid[0:H, 0:W]
    d, i = cKDTree(pts).query(np.stack([xx.ravel(), yy.ravel()], 1).astype(np.float32), k=2)
    edge = (d[:, 1] - d[:, 0]).reshape(H, W)
    crease = np.exp(-edge / 2.2)
    facet = rng.rand(cells)[i[:, 0]].reshape(H, W)                   # each facet tilts a little differently
    tex = 0.6 * facet + 0.22 * crease + 0.3 * fbm(H, W, seed + 5, 12)
    return np.clip((tex - tex.min()) / np.ptp(tex), 0, 1).astype(np.float32)


def _smooth_closed(p, k=5):
    if len(p) < 3:
        return p
    ker = np.ones(k) / k
    ext = np.concatenate([p[-k:], p, p[:k]])
    return np.stack([np.convolve(ext[:, j], ker, 'same')[k:-k] for j in range(2)], 1)


def contours(mask, min_len=24, holes=False):
    m = (mask > 0).astype(np.uint8)
    cs, _ = cv2.findContours(m, cv2.RETR_LIST if holes else cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    return [c[:, 0, :].astype(np.float64) for c in cs if len(c) >= min_len]


def scribble(layer, mask, rng, strokes=4, amp=1.6, thick=1, alpha=0.9, min_len=24, hatch=0.0, light=(1, -0.6),
             holes=False, step=3):
    """Outline a shape the way it's drawn in the reference: several loose,
    overlapping pen lines that never quite agree, overshooting their ends; and
    on the lit side short hatching strokes running in from the edge. Draws onto
    layer (H, W) float 0..1 (the white ink)."""
    H, W = layer.shape
    ink = np.zeros((H, W), np.uint8)
    for c in contours(mask, min_len, holes):
        p = _smooth_closed(c[::step] if len(c) > 3 * step else c, 3)
        n = len(p)
        if n < 4:
            continue
        t = np.roll(p, -1, 0) - np.roll(p, 1, 0)
        t /= np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-9)
        nrm = np.stack([-t[:, 1], t[:, 0]], 1)
        s = np.arange(n, dtype=np.float64)
        edge = (p[:, 0] < 2) | (p[:, 0] > W - 3) | (p[:, 1] < 2) | (p[:, 1] > H - 3)   # the frame, not the shape
        for k in range(strokes):
            f1, f2 = rng.uniform(0.02, 0.06), rng.uniform(0.15, 0.3)
            off = amp * (np.sin(s * f1 + rng.uniform(0, 6.3)) + 0.45 * np.sin(s * f2 + rng.uniform(0, 6.3)))
            q = p + nrm * off[:, None]
            if k == 0:                                               # one pass all the way round
                runs = [np.r_[0:n, 0:2]]
            else:                                                    # the others in broken lengths
                runs = []
                a = rng.randint(n)
                left = n
                while left > 6:
                    ln = min(left, rng.randint(max(6, n // 6), max(8, n // 2)))
                    runs.append((a + np.arange(ln)) % n)
                    a = (a + ln + rng.randint(-4, 3)) % n
                    left -= ln
            for idx in runs:
                cut = np.where(edge[idx])[0]
                for part in np.split(idx, cut):
                    part = part[~edge[part]]
                    if len(part) < 3:
                        continue
                    seg = q[part]
                    if k:                                            # the pen runs on past the end
                        dv = seg[-1] - seg[-2]
                        seg = np.vstack([seg, seg[-1] + dv / max(np.linalg.norm(dv), 1e-9) * rng.uniform(2, 7)])
                    cv2.polylines(ink, [np.round(seg * 4).astype(np.int32)], False, 255,
                                  thick if rng.rand() > 0.15 else thick + 1, cv2.LINE_AA, shift=2)
        if hatch > 0:                                                # shading strokes on the lit side
            L = np.asarray(light, float)
            L /= np.linalg.norm(L)
            facing = -(nrm @ L)
            for i in range(0, n, 2):
                if not edge[i] and facing[i] > 0.2 and rng.rand() < hatch * facing[i]:
                    ln = rng.uniform(5, 22) * facing[i]
                    d = -nrm[i] * ln + t[i] * rng.uniform(-3, 3)
                    a0 = p[i] + nrm[i] * rng.uniform(-1, 1.5)
                    cv2.line(ink, tuple(np.round(a0 * 4).astype(int)), tuple(np.round((a0 + d) * 4).astype(int)),
                             200, 1, cv2.LINE_AA, shift=2)
    np.maximum(layer, ink.astype(np.float32) / 255.0 * alpha, out=layer)
    return layer


def glow(mask, radius, inner=False):
    """A soft halo hugging a shape (outside it, or inside along its edge)."""
    m = (mask > 0).astype(np.float32)
    g = cv2.GaussianBlur(m, (0, 0), radius)
    return g * (m if inner else (1 - m)) if not inner else (1 - g) * m


def scribble_circle(layer, centre, r, rng, rings=5, alpha=1.0):
    """An eye: a white disc, ringed by several loose circles drawn over each other."""
    x, y = centre
    disc = np.zeros(layer.shape, np.uint8)
    cv2.circle(disc, (int(round(x * 4)), int(round(y * 4))), int(max(1, r * 4)), 255, -1, cv2.LINE_AA, shift=2)
    np.maximum(layer, disc.astype(np.float32) / 255.0 * alpha, out=layer)
    ink = np.zeros(layer.shape, np.uint8)
    for k in range(rings):
        rr = r * rng.uniform(0.95, 1.18)
        ex, ey = rng.uniform(-0.08, 0.08) * r, rng.uniform(-0.08, 0.08) * r
        a0 = rng.uniform(0, 6.3)
        pts = [((x + ex + math.cos(a0 + a) * rr * rng.uniform(0.97, 1.03)) * 4,
                (y + ey + math.sin(a0 + a) * rr * rng.uniform(0.97, 1.03)) * 4)
               for a in np.linspace(0, 2 * math.pi * rng.uniform(0.85, 1.15), 28)]
        cv2.polylines(ink, [np.round(np.array(pts)).astype(np.int32)], False, 255, 1, cv2.LINE_AA, shift=2)
    np.maximum(layer, ink.astype(np.float32) / 255.0 * alpha, out=layer)
    return layer


def scribble_line(layer, pts, rng, passes=3, amp=1.2, alpha=1.0, thick=2):
    """A drawn line (the mouth), gone over a few times."""
    pts = np.asarray(pts, float)
    ink = np.zeros(layer.shape, np.uint8)
    for k in range(passes):
        q = pts + rng.normal(0, amp * 0.5, pts.shape)
        cv2.polylines(ink, [np.round(q * 4).astype(np.int32)], False, 255, thick if k == 0 else 1, cv2.LINE_AA, shift=2)
    np.maximum(layer, ink.astype(np.float32) / 255.0 * alpha, out=layer)
    return layer


def grade(img, rng, grain=5.0, vignette=0.35):
    """Film grain and a vignette."""
    H, W = img.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    v = 1 - vignette * (((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) * 0.5
    out = img * v[..., None] + rng.normal(0, grain, (H, W, 1)).astype(np.float32)
    return np.clip(out, 0, 255).astype(np.uint8)


def void_figure(img, shade, mask, paper, rng, eyes=(), eye_r=6.0, mouth=None, light=(1, -0.6), glow_r=10,
                glow_k=0.8, strokes=7, amp=3.0, hatch=1.1, stars=None, edge_alpha=0.95):
    """Restyle a rendered figure (mask, shade 0..1 from the renderer) in place: black
    crumpled paper with the faint facets of its low-poly body, a white halo, boiling
    scribbled outlines with hatching on the lit side, white scribbled eyes and the
    frown. stars: a faint starfield seen inside the void."""
    m = mask.astype(bool)
    if not m.any():
        return img
    body = 7 + 17 * paper + (shade - 0.3) * 36
    if stars is not None:
        body = body[..., None] + stars * 0.35
    else:
        body = np.repeat(body[..., None], 3, -1)
    img[m] = np.clip(body, 0, 255)[m]
    g = glow(m, glow_r) * glow_k + glow(m, glow_r * 3.5) * glow_k * 0.35
    rim = glow(m, 2.5, inner=True) * 0.55
    ink = np.zeros(m.shape, np.float32)
    scribble(ink, m, rng, strokes=strokes, amp=amp, hatch=hatch, light=light, alpha=edge_alpha)
    for (x, y) in eyes:
        scribble_circle(ink, (x, y), eye_r, rng)
    if mouth is not None and len(mouth):
        scribble_line(ink, mouth, rng, thick=max(1, int(eye_r / 4)))
    a = np.clip(g + rim + ink, 0, 1)[..., None]
    img[:] = img * (1 - a) + 255 * a
    if len(eyes):                                                    # the eyes glow too
        eg = np.zeros(m.shape, np.float32)
        for (x, y) in eyes:
            cv2.circle(eg, (int(x), int(y)), int(max(1, eye_r)), 1.0, -1)
        eg = cv2.GaussianBlur(eg, (0, 0), max(2, eye_r * 0.9)) * 0.9
        img[:] = img * (1 - eg[..., None]) + 255 * eg[..., None]
    return img
