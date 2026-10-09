"""Silhouette -> 3D shading.

Give it a mask (what the object covers) and a colour ramp and it builds a
rounded height-field from the distance to the edge, lights it from the
upper left, adds a specular glint for glossy things, and snaps every pixel
to the ramp. This is what makes the ceramics, metal, the cat and the fire
spirit read as solid, polished objects."""
import math
import numpy as np
from pixel import Canvas, PAL

LIGHT = np.array([-0.5, -0.72, 0.55])
LIGHT = LIGHT / np.linalg.norm(LIGHT)
BAYER = np.array([[0, 2], [3, 1]]) / 4.0 - 0.375


def _erode(m, diag):
    p = np.pad(m, 1)
    out = p[1:-1, 1:-1] & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    if diag:
        out &= p[:-2, :-2] & p[:-2, 2:] & p[2:, :-2] & p[2:, 2:]
    return out


def distance(mask):
    """Approximate Euclidean distance (in px) from each pixel to the edge."""
    d = np.zeros(mask.shape, float)
    m = mask.copy()
    k = 0
    while m.any():
        d[m] += 1
        m = _erode(m, diag=(k % 3 == 2))
        k += 1
    return d


def _blur(a, passes=2):
    for _ in range(passes):
        p = np.pad(a, 1, mode='edge')
        a = (p[:-2, :-2] + p[:-2, 1:-1] + p[:-2, 2:] + p[1:-1, :-2] + p[1:-1, 1:-1] + p[1:-1, 2:]
             + p[2:, :-2] + p[2:, 1:-1] + p[2:, 2:]) / 9.0
    return a


def height(mask, R=None, profile='round'):
    d = _blur(distance(mask), 2) * mask
    if R is None:
        R = max(2.0, d.max())
    t = np.clip(d / R, 0, 1)
    if profile == 'round':
        hgt = np.sqrt(1 - (1 - t) ** 2)
    elif profile == 'soft':
        hgt = t ** 0.6
    else:                       # 'flat': bevelled edge then plateau
        hgt = np.clip(t * 2.5, 0, 1)
    return hgt * R


def normals(hf):
    gy, gx = np.gradient(hf)
    n = np.dstack([-gx, -gy, np.ones_like(hf)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n


def light_values(mask, R=None, profile='round', light=LIGHT, amb=0.22, kd=0.9,
                 spec_pow=24, hf=None, ao=0.0):
    hf = height(mask, R, profile) if hf is None else hf
    n = normals(hf)
    diff = np.clip(n @ light, 0, 1)
    hv = light + np.array([0, 0, 1.0])
    hv /= np.linalg.norm(hv)
    spec = np.clip(n @ hv, 0, 1) ** spec_pow
    v = amb + kd * diff
    if ao:
        ys = np.arange(mask.shape[0])[:, None] / max(1, mask.shape[0] - 1)
        v = v - ao * ys ** 3
    return np.where(mask, v, 0), np.where(mask, spec, 0)


def paint(mask, ramp, R=None, profile='round', light=LIGHT, amb=0.22, kd=0.9, cuts=None,
          spec=0.0, spec_pow=24, spec_col=None, dither=0.0, ao=0.0, hf=None, canvas=None, ox=0, oy=0):
    """Shade `mask` with palette `ramp` (dark -> light). Returns a Canvas
    (or paints into `canvas` at ox, oy). spec > 0 adds a glint (glossy)."""
    v, s = light_values(mask, R, profile, light, amb, kd, spec_pow, hf, ao)
    n = len(ramp)
    if cuts is None:
        cuts = [0.3 + 0.7 * (i + 1) / n for i in range(n - 1)]
    h, w = mask.shape
    if dither:
        yy, xx = np.mgrid[0:h, 0:w]
        v = v + BAYER[yy % 2, xx % 2] * dither
    idx = np.zeros((h, w), int)
    for c in cuts:
        idx += (v > c).astype(int)
    cv = canvas if canvas is not None else Canvas(w, h)
    for y, x in zip(*np.nonzero(mask)):
        c = ramp[min(n - 1, idx[y, x])]
        if spec and s[y, x] > 1 - spec:
            c = spec_col or ramp[-1]
        cv.px(x + ox, y + oy, c)
    return cv


def mask_of(cv):
    return cv.a[:, :, 3] > 0


def ellipse_mask(w, h, cx, cy, rx, ry, wobble=0.06):
    """Ellipse with a hand-drawn wobble: the radius drifts a little around
    the shape (deterministic per shape), so nothing is a perfect circle."""
    yy, xx = np.mgrid[0:h, 0:w]
    dx, dy = (xx + 0.5 - cx) / rx, (yy + 0.5 - cy) / ry
    if wobble and min(rx, ry) >= 4:
        seed = (int(cx * 7) * 31 + int(cy * 13) * 17 + int(rx * 5) * 7 + int(ry * 11)) % 997
        p1, p2 = seed * 0.37, seed * 0.71
        th = np.arctan2(dy, dx)
        r = 1 + wobble * (0.6 * np.sin(2 * th + p1) + 0.4 * np.sin(3 * th + p2))
        return dx * dx + dy * dy <= r * r
    return dx * dx + dy * dy <= 1


def poly_mask(w, h, pts):
    c = Canvas(w, h)
    c.poly(pts, 'white')
    return mask_of(c)


def lathe_mask(w, h, profile):
    """Mask of a turned object (pot, jar, vase) from a list of half-widths
    per row: profile(t) -> half width, t in 0..1 top->bottom."""
    m = np.zeros((h, w), bool)
    cx = w / 2
    for y in range(h):
        hw = profile(y / max(1, h - 1))
        x0, x1 = int(round(cx - hw)), int(round(cx + hw))
        m[y, max(0, x0):min(w, x1)] = True
    return m


def lathe_shade(w, h, profile, ramp, spec=0.0, amb=0.2, cuts=None, spec_col=None, rim_dark=True, wobble=0.45):
    """Shade a turned object as a true cylinder of varying radius
    (horizontal normals from the profile, vertical tilt from its slope)."""
    cv = Canvas(w, h)
    cx = w / 2
    n = len(ramp)
    if cuts is None:
        cuts = [0.3 + 0.7 * (i + 1) / n for i in range(n - 1)]
    hv = LIGHT + np.array([0, 0, 1.0])
    hv /= np.linalg.norm(hv)
    ph = (w * 13 + h * 7) % 11
    for y in range(h):
        t = y / max(1, h - 1)
        hw = profile(t)
        if hw <= 0.3:
            continue
        dt = 1.0 / max(1, h - 1)
        slope = (profile(min(1, t + dt)) - profile(max(0, t - dt))) / 2   # d(halfwidth)/dy (px)
        wl = wobble * math.sin(t * 6.3 + ph) if hw > 3 else 0      # hand-thrown: the two sides
        wr = wobble * math.sin(t * 4.7 + ph * 1.7) if hw > 3 else 0  # never quite match
        xl, xr = cx - hw - wl, cx + hw + wr
        ccx, chw = (xl + xr) / 2, (xr - xl) / 2
        for x in range(int(round(xl)), int(round(xr))):
            u = (x + 0.5 - ccx) / chw
            u = max(-0.999, min(0.999, u))
            nz = math.sqrt(1 - u * u)
            nrm = np.array([u, -slope * nz, nz])
            nrm /= np.linalg.norm(nrm)
            v = amb + 0.9 * max(0, nrm @ LIGHT)
            if rim_dark and abs(u) > 0.92:
                v -= 0.12
            i = sum(1 for c in cuts if v > c)
            c = ramp[min(n - 1, i)]
            if spec and (nrm @ hv) ** 30 > 1 - spec:
                c = spec_col or ramp[-1]
            cv.px(x, y, c)
    return cv
