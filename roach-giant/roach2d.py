"""Cockroaches as pixel art: sprites made on demand for any size, heading,
view and step of the walk, in the teahouse pack's palette, then stood in the
3D world as billboards.

Each sprite is made the way a pixel artist would build it up, from a small
model of an American cockroach seen from the needed angle:

  - the folded wings, a glossy dome split by the seam down the middle, with
    faint veins, a lighter edge and a hard highlight where the moon catches;
  - the shield behind the head, a pale cream ring round a dark middle;
  - the head with its eyes and palps;
  - six legs walking in a tripod gait, each femur, a spiny tibia and the feet;
  - two antennae longer than the body, segmented, feeling about;
  - the cerci at the tail.

It is drawn eight times too big into a map of named parts and light levels,
then brought down to pixels part by part (thin legs, feelers and spines are
kept a pixel wide), coloured from ramps of the pack's palette, and given a
dark outline. Small roaches lose detail the way a pixel artist would leave it
out: a 5-pixel roach is a lit dot with legs; a 100-pixel one has every spine.
"""
import math
import os
import sys

import cv2
import numpy as np
from numba import njit

import hd2d as K

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'teahouse-assets', 'generator'))
from pixel import PAL                                                         # noqa: E402

SIZES = np.array([3, 4, 5, 6, 7, 8, 10, 12, 14, 17, 20, 24, 28, 34, 40, 48, 56, 68, 80, 96, 112, 128, 150])
ELEVS = np.array([90, 62, 40, 22, 8])
NHEAD = 32
NFRAME = 4


def bgr(name):
    return np.array(PAL[name][::-1], np.uint8)


# parts and their ramps (dark -> light), pack palette names
WING, SEAM, PRON, RING, HEAD, LEG, ANT, EYE, CERC, BELLY, SPINE = range(1, 12)
RAMPS = {
    WING: ['ink', 'bark0', 'copper0', 'copper1', 'copper2', 'copper3', 'copper4'],
    SEAM: ['ink', 'ink', 'bark0', 'bark0', 'copper0', 'copper0', 'copper1'],
    PRON: ['ink', 'ink', 'bark0', 'wood0', 'bark1', 'copper1', 'copper2'],
    RING: ['wood1', 'wood2', 'wood3', 'hinoki1', 'hinoki2', 'hinoki3', 'hinoki4'],
    HEAD: ['ink', 'bark0', 'wood0', 'wood1', 'copper1', 'copper2', 'copper3'],
    LEG: ['ink', 'bark0', 'copper0', 'copper1', 'copper2', 'copper3', 'copper4'],
    ANT: ['ink', 'bark0', 'copper0', 'copper1', 'copper2', 'copper2', 'copper3'],
    EYE: ['ink', 'ink', 'ink', 'ink1', 'ink1', 'stone1', 'stone2'],
    CERC: ['ink', 'bark0', 'copper0', 'copper1', 'copper2', 'copper2', 'copper3'],
    BELLY: ['ink', 'bark0', 'wood0', 'copper0', 'copper1', 'copper2', 'copper3'],
    SPINE: ['ink', 'ink', 'bark0', 'bark0', 'copper0', 'copper1', 'copper1'],
}
THIN = (LEG, ANT, SPINE, CERC)
LUT = np.zeros((12, 7, 3), np.uint8)
for _p, _r in RAMPS.items():
    for _k, _n in enumerate(_r):
        LUT[_p, _k] = bgr(_n)
OUTLINE = bgr('ink')


# ---------------------------------------------------------------- the model, in body lengths
def _model(frame, wig):
    """Ellipsoids (centre, radii, part) and lines (points, width, part) of a
    roach heading +x, up +y, right +z, at this step of its walk."""
    ells = [((-0.08, 0.13, 0.0), (0.45, 0.13, 0.22), WING),
            ((-0.1, 0.06, 0.0), (0.42, 0.07, 0.19), BELLY),
            ((0.29, 0.11, 0.0), (0.15, 0.085, 0.2), PRON),
            ((0.44, 0.07, 0.0), (0.075, 0.065, 0.085), HEAD),
            ((0.47, 0.085, 0.055), (0.025, 0.03, 0.022), EYE),
            ((0.47, 0.085, -0.055), (0.025, 0.03, 0.022), EYE)]
    lines = []
    ph = frame / NFRAME * 2 * math.pi
    # front legs reach forward, middle legs out to the side, the long hind legs sweep back
    LEGS = ((0.25, 55.0, 0.2, 0.22, 0.14), (0.05, 100.0, 0.22, 0.26, 0.16), (-0.15, 140.0, 0.27, 0.36, 0.2))
    for side in (-1, 1):
        for j, (x0, ang0, lf, lt, lta) in enumerate(LEGS):
            g = math.sin(ph + (j % 2) * math.pi + (side > 0) * math.pi)
            lift = max(0.0, math.cos(ph + (j % 2) * math.pi + (side > 0) * math.pi))
            a_ = math.radians(ang0 + 14 * g)
            dx, dz = math.cos(a_), math.sin(a_) * side
            hip = (x0, 0.07, side * 0.1)
            knee = (x0 + dx * lf, 0.16 + 0.05 * lift, side * 0.1 + dz * lf)
            a2 = a_ + math.radians(16 if j < 2 else 8) * (1 if j else -1)
            dx2, dz2 = math.cos(a2), math.sin(a2) * side
            foot = (knee[0] + dx2 * lt, 0.02 + 0.06 * lift, knee[2] + dz2 * lt)
            tars = (foot[0] + dx2 * lta, 0.0 + 0.03 * lift, foot[2] + dz2 * lta)
            lines.append(([hip, knee], 0.034, LEG))
            lines.append(([knee, foot], 0.024, LEG))
            lines.append(([foot, tars], 0.013, LEG))
            for k in range(1, 4):                                   # fine spines along the tibia
                u = k / 4
                p = tuple(knee[i] + (foot[i] - knee[i]) * u for i in range(3))
                q = (p[0] - dx2 * 0.03 + dz2 * 0.0, p[1] + 0.025, p[2] - dz2 * 0.03 + side * 0.015)
                lines.append(([p, q], 0.007, SPINE))
    for side in (-1, 1):                                            # antennae, sweeping and feeling
        w = wig * side
        pts = []
        for k in range(9):
            u = k / 8
            ang = side * (0.25 + 0.9 * u) + 0.25 * math.sin(u * 3 + w)
            r = 0.05 + 1.15 * u
            pts.append((0.5 + math.cos(ang * 0.6) * r * 0.85, 0.09 + 0.05 * math.sin(u * 2.5), side * 0.03 +
                        math.sin(ang * 0.6) * r * 0.8))
        lines.append((pts, 0.012, ANT))
        lines.append(([(0.5, 0.05, side * 0.03), (0.6, 0.0, side * 0.06), (0.62, -0.02, side * 0.04)], 0.014, LEG))
    for side in (-1, 1):
        lines.append(([(-0.5, 0.08, side * 0.05), (-0.64, 0.07, side * 0.11)], 0.022, CERC))
    return ells, lines


def _basis(heading, elev):
    """Screen x (right), screen y (down) and depth (into the screen) of the
    roach's +x/+y/+z axes, for a view `elev` degrees above its surface and its
    nose pointing `heading` radians round the screen (0 = right)."""
    e = math.radians(elev)
    # heading on the surface that projects to the wanted screen heading
    se = max(math.sin(e), 1e-3)
    h = math.atan2(-math.sin(heading) / se, math.cos(heading)) if elev < 89 else -heading
    if elev >= 89:
        h = -heading
    gx = np.array([1.0, 0, 0])
    fx = np.array([math.cos(h), math.sin(h)])          # +x of the roach in ground coords (east, north)
    fz = np.array([math.sin(h), -math.cos(h)])         # +z (its right)

    def proj(east, north, up):
        X = east
        Y = -north * math.sin(e) - up * math.cos(e)
        D = north * math.cos(e) - up * math.sin(e)
        return np.array([X, Y, D])
    ax = proj(fx[0], fx[1], 0)
    ay = proj(0, 0, 1)
    az = proj(fz[0], fz[1], 0)
    return np.stack([ax, ay, az], 1)                   # columns: images of +x, +y, +z


def make(L, heading, elev, frame, wig=0.0, ss=None):
    """One sprite: BGRA uint8, and the pixel of the roach's centre."""
    ss = ss or (8 if L <= 48 else 5)
    B = _basis(heading, elev)
    S = int(L * 2.7) + 6
    N = S * ss
    c = N / 2
    scale = L * ss
    yy, xx = (np.mgrid[0:N, 0:N] + 0.5 - c) / scale
    depth = np.full((N, N), np.inf)
    part = np.zeros((N, N), np.int8)
    shade = np.zeros((N, N), np.float32)
    light = np.array([-0.45, -0.75, -0.55])           # toward the light: upper left, and toward the viewer
    light /= np.linalg.norm(light)
    half_v = light + np.array([0, 0, -1.0])
    half_v /= np.linalg.norm(half_v)
    ells, lines = _model(frame, wig)
    Binv = np.linalg.inv(B)
    for (cc, rr, p) in ells:
        cs = B @ np.array(cc)
        rb = max(rr) * 1.05
        X0 = max(0, int((cs[0] - rb) * scale + c))
        X1 = min(N, int((cs[0] + rb) * scale + c) + 2)
        Y0 = max(0, int((cs[1] - rb) * scale + c))
        Y1 = min(N, int((cs[1] + rb) * scale + c) + 2)
        if X1 <= X0 or Y1 <= Y0:
            continue
        box = (slice(Y0, Y1), slice(X0, X1))
        _ellipsoid(cs, rr, p, B, Binv, xx[box], yy[box], depth[box], part[box], shade[box], light, half_v)
    _lines(lines, B, c, scale, N, depth, part, shade)
    return _reduce(part, shade, ss, L)


def _ellipsoid(cs, rr, p, B, Binv, xx, yy, depth, part, shade, light, half_v):
    M = np.diag(1 / np.array(rr)) @ Binv                # screen -> unit sphere
    o = np.stack([xx - cs[0], yy - cs[1], np.full(xx.shape, -10.0)], -1)
    d = np.array([0, 0, 1.0])
    ol = o @ M.T
    dl = M @ d
    a = dl @ dl
    b = ol @ dl
    cc_ = (ol * ol).sum(-1) - 1
    disc = b * b - a * cc_
    hit = disc >= 0
    t = (-b - np.sqrt(np.maximum(disc, 0))) / a
    z = t - 10 + cs[2]
    hit &= z < depth
    if not hit.any():
        return
    pl = ol + t[..., None] * dl
    n = (pl / np.array(rr)) @ Binv
    n = n / np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-9)
    n = np.where((n[..., 2] > 0)[..., None], -n, n)     # the face we see
    lam = np.clip(n @ light, 0, 1)
    # local coordinates on the shell, for the seam and the ring
    loc = pl * np.array(rr)                         # body-length units, relative to the centre
    lp = p * np.ones(xx.shape, np.int8)
    if p == WING:
        u = loc[..., 0]
        w = loc[..., 2]
        lp = np.where((np.abs(w) < 0.016 + 0.004 * (u < -0.2)) & (u > -0.42) & (loc[..., 1] > 0), SEAM, WING)
        vein = (np.abs(np.abs(w) - (0.07 + 0.08 * (0.45 - u))) < 0.01) & (u > -0.35) & (loc[..., 1] > 0.02)
        lam = np.where(vein, lam * 0.75, lam)
        edge = np.abs(w) > 0.19
        lam = np.where(edge, lam * 0.8 + 0.1, lam)
    if p == PRON:
        r_ = np.sqrt((loc[..., 0] / 0.15) ** 2 + (loc[..., 2] / 0.2) ** 2)
        lp = np.where(r_ > 0.72, RING, PRON)
        mark = (r_ < 0.55) & (np.abs(np.abs(loc[..., 2]) - 0.07) < 0.03)
        lam = np.where(mark, lam * 0.6, lam)
    spec = np.clip(n @ half_v, 0, 1) ** 28
    s = np.clip(0.22 + 0.78 * lam + (spec * (1.5 if p in (WING, PRON) else 0.5)), 0, 1.6)
    sel = hit
    depth[sel] = z[sel]
    part[sel] = lp[sel]
    shade[sel] = s[sel]


def _lines(lines, B, c, scale, N, depth, part, shade):
    """Legs, spines, feelers: each segment drawn in its own little box."""
    for (pts, wdt, p) in lines:
        P = np.array([B @ np.array(q) for q in pts])
        thick = max(1, int(round(wdt * scale)))
        for i in range(len(P) - 1):
            a, b = P[i], P[i + 1]
            ax, ay = int(c + a[0] * scale), int(c + a[1] * scale)
            bx, by = int(c + b[0] * scale), int(c + b[1] * scale)
            X0 = max(0, min(ax, bx) - thick - 1)
            X1 = min(N, max(ax, bx) + thick + 2)
            Y0 = max(0, min(ay, by) - thick - 1)
            Y1 = min(N, max(ay, by) + thick + 2)
            if X1 <= X0 or Y1 <= Y0:
                continue
            seg = np.zeros((Y1 - Y0, X1 - X0), np.uint8)
            cv2.line(seg, (ax - X0, ay - Y0), (bx - X0, by - Y0), 1, thick, cv2.LINE_AA if thick < 3 else cv2.LINE_8)
            m = seg > 0
            zz = (a[2] + b[2]) / 2
            lam = 0.62 if p in (ANT, CERC) else 0.55 + 0.3 * float(a[2] < 0)
            box = (slice(Y0, Y1), slice(X0, X1))
            m &= zz < depth[box] + 0.02
            depth[box][m] = zz
            part[box][m] = p
            shade[box][m] = lam if p != SPINE else 0.3


def _reduce(part, shade, ss, L):
    """Supersampled parts -> pixels, part by part, keeping thin things."""
    N = part.shape[0]
    S = N // ss
    P = part[:S * ss, :S * ss].reshape(S, ss, S, ss).swapaxes(1, 2).reshape(S, S, ss * ss)
    Sh = shade[:S * ss, :S * ss].reshape(S, ss, S, ss).swapaxes(1, 2).reshape(S, S, ss * ss)
    counts = np.stack([(P == k).sum(-1) for k in range(12)], -1).astype(np.float32)
    w = np.ones(12, np.float32)
    for k in THIN:
        w[k] = 3.2 if L >= 12 else 2.2
    w[EYE] = 2.0
    w[SEAM] = 2.4 if L >= 10 else 0.5
    w[RING] = 1.4
    score = counts * w
    score[..., 0] = counts[..., 0] * 1.0
    best = score.argmax(-1)
    cover = 1 - counts[..., 0] / (ss * ss)
    solid = (best > 0) | (cover > 0.45)
    best = np.where((best == 0) & solid, score[..., 1:].argmax(-1) + 1, best)
    # light of that part in the block
    m = (P == best[..., None])
    lit = (Sh * m).sum(-1) / np.maximum(m.sum(-1), 1)
    tone = np.clip(np.round(lit * 4.3 + 0.2), 0, 6).astype(int)
    out = np.zeros((S, S, 4), np.uint8)
    out[solid, :3] = LUT[best[solid], tone[solid]]
    out[solid, 3] = 255
    if L >= 9:                                          # a dark outline round the body (not the feelers)
        body = solid & ~np.isin(best, (ANT,))
        grow = cv2.dilate(body.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
        ring = grow & ~solid
        cross = cv2.dilate(body.astype(np.uint8), np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], np.uint8)) > 0
        ring &= cross
        out[ring, :3] = OUTLINE
        out[ring, 3] = 255
    return out


# ---------------------------------------------------------------- the library
CACHE = os.path.join(HERE, '.cache', 'roach_sprites.pkl')
TOP = 0                                                 # index of the straight-down view in ELEVS
BIG = 96                                                # larger roaches use these, scaled


def n_head(Li):
    return 16 if SIZES[Li] < 40 else 8


def n_frames(Li):
    return 4 if SIZES[Li] <= 68 else 2


def all_keys():
    keys = []
    for Li in range(len(SIZES)):
        if SIZES[Li] > BIG:
            continue
        for fi in range(n_frames(Li)):
            keys.append((Li, TOP, 0, fi))
            for ei in range(1, len(ELEVS)):
                for hi in range(n_head(Li)):
                    keys.append((Li, ei, hi, fi))
    return keys


def _make_key(key):
    Li, ei, hi, fi = key
    nh = 1 if ei == TOP else n_head(Li)
    heading = hi / nh * 2 * math.pi
    return key, make(int(SIZES[Li]), heading, float(ELEVS[ei]), fi, wig=0.3 * math.sin(fi * 1.7 + hi))


class RoachAtlas:
    def __init__(self, cap=40_000_000):
        self.C = np.zeros((cap, 3), np.uint8)
        self.Fl = np.zeros(cap, np.uint8)
        self.n = 0
        self.index = {}
        self.off, self.w, self.h = [], [], []
        self._arr = None

    def put(self, key, spr):
        h, w = spr.shape[:2]
        if self.n + h * w > len(self.C):
            raise MemoryError('roach atlas full')
        self.C[self.n:self.n + h * w] = spr[..., :3].reshape(-1, 3)
        self.Fl[self.n:self.n + h * w] = (spr[..., 3] > 0).reshape(-1)
        self.index[key] = len(self.off)
        self.off.append(self.n)
        self.w.append(w)
        self.h.append(h)
        self.n += h * w
        self._arr = None
        return self.index[key]

    def get(self, key):
        if key not in self.index:
            self.put(key, _make_key(key)[1])
        return self.index[key]

    def hero(self, L, heading, elev, frame):
        """A full-size sprite for a roach seen close (the first one)."""
        hb = int(round(heading / (2 * math.pi) * 24)) % 24
        eb = int(round(elev / 10))
        key = ('hero', int(L / 6) * 6, eb, hb, frame)
        if key not in self.index:
            self.put(key, make(int(L / 6) * 6, hb / 24 * 2 * math.pi, eb * 10.0, frame, wig=0.35 * math.sin(frame + hb),
                               ss=4))
        return self.index[key]

    def arrays(self):
        if self._arr is None:
            self._arr = (np.array(self.off, np.int64), np.array(self.w, np.int32), np.array(self.h, np.int32))
        return self._arr

    def load_or_build(self, workers=4):
        """All the regular sprites, made once (in parallel) and kept on disk."""
        if os.path.exists(CACHE):
            import pickle
            with open(CACHE, 'rb') as fh:
                d = pickle.load(fh)
        else:
            import pickle
            from multiprocessing import Pool
            keys = all_keys()
            keys.sort(key=lambda k: -SIZES[k[0]])
            with Pool(workers) as pool:
                d = dict(pool.imap_unordered(_make_key, keys, chunksize=4))
            os.makedirs(os.path.dirname(CACHE), exist_ok=True)
            with open(CACHE, 'wb') as fh:
                pickle.dump(d, fh, protocol=4)
        for k in sorted(d):
            self.put(k, d[k])


ATLAS = RoachAtlas()


@njit(cache=True, fastmath=True)
def _blit(sx, sy, sz, ang, scl, fid, poid, off, ws, hs, C, Fl, depth, nrm, mat, oid, var, att, aux, alb, ao, nx, ny,
          nz, dim):
    Hd, Wd = depth.shape
    for i in range(sx.shape[0]):
        f = fid[i]
        w = ws[f]
        h = hs[f]
        o = off[f]
        ca = math.cos(ang[i])
        sa = math.sin(ang[i])
        sc = scl[i]
        r = 0.5 * math.sqrt(w * w + h * h) * sc + 1
        ix0 = max(0, int(sx[i] - r))
        ix1 = min(Wd - 1, int(sx[i] + r))
        iy0 = max(0, int(sy[i] - r))
        iy1 = min(Hd - 1, int(sy[i] + r))
        z = sz[i]
        for py in range(iy0, iy1 + 1):
            for px in range(ix0, ix1 + 1):
                dx = (px + 0.5 - sx[i]) / sc
                dy = (py + 0.5 - sy[i]) / sc
                u = dx * ca + dy * sa + w * 0.5
                v = -dx * sa + dy * ca + h * 0.5
                tu = int(math.floor(u))
                tv = int(math.floor(v))
                if tu < 0 or tv < 0 or tu >= w or tv >= h:
                    continue
                q = o + tv * w + tu
                if Fl[q] == 0:
                    continue
                if z >= depth[py, px]:
                    continue
                depth[py, px] = z
                alb[py, px, 0] = C[q, 0] / 255.0 * dim
                alb[py, px, 1] = C[q, 1] / 255.0 * dim
                alb[py, px, 2] = C[q, 2] / 255.0 * dim
                ao[py, px] = 1.0
                nrm[py, px, 0] = nx
                nrm[py, px, 1] = ny
                nrm[py, px, 2] = nz
                mat[py, px] = 14
                oid[py, px] = poid[i]
                var[py, px] = 0.0
                att[py, px] = 0.0
                aux[py, px] = 0.0


def draw(g, cam, P, N, Hd, L, ph, oid0=20000000, ids=None, tol=0.0, hero=None, dim=0.72):
    """Roaches at P (n,3) on surfaces with normals N, heading Hd, length L
    metres, gait phase ph: drawn as pixel-art sprites into the g-buffer."""
    if not len(P):
        return
    P = np.asarray(P, float)
    c = cam.to_cam(P)
    z = c[:, 2]
    Lpx = L * cam.focal / np.maximum(z, 1e-3)
    ok = (z > 0.03) & (np.abs(c[:, 0]) < cam.W / 2 / cam.focal * z + L * 2) & \
        (np.abs(c[:, 1]) < cam.H / 2 / cam.focal * z + L * 2) & (Lpx > 0.6)
    if not ok.any():
        return
    i = np.where(ok)[0]
    ids = i if ids is None else np.asarray(ids)[i]
    ph = np.asarray(ph, float)
    sx = cam.W / 2 + c[i, 0] / z[i] * cam.focal
    sy = cam.H / 2 - c[i, 1] / z[i] * cam.focal
    dist = np.linalg.norm(P[i] - cam.eye, axis=1) - L[i] * 0.3 - tol
    # how we see each one: elevation over its surface, which way its back faces on screen, its heading
    V = (P[i] - cam.eye)
    V /= np.linalg.norm(V, axis=1, keepdims=True)
    Nn = N[i] / np.maximum(np.linalg.norm(N[i], axis=1, keepdims=True), 1e-9)
    nv = np.abs((Nn * V).sum(1))
    elev = np.degrees(np.arcsin(np.clip(nv, 0, 1)))
    ns = np.stack([Nn @ cam.R[0], -(Nn @ cam.R[1])], 1)
    hs = np.stack([Hd[i] @ cam.R[0], -(Hd[i] @ cam.R[1])], 1)
    roll = np.arctan2(ns[:, 0], -ns[:, 1])                 # angle of the back's direction from screen-up
    top = elev > 76
    roll = np.where(top, 0.0, roll)
    hang = np.arctan2(hs[:, 1], hs[:, 0]) - roll
    ei = np.abs(elev[:, None] - ELEVS[None]).argmin(1)
    ei = np.where(top, TOP, np.maximum(ei, 1))
    Lc = np.minimum(Lpx[i], BIG)
    Li = np.abs(np.log(np.maximum(Lc, 1)[:, None] / SIZES[None])).argmin(1)
    scl = np.where(Lpx[i] > BIG, Lpx[i] / BIG, 1.0)
    tiny = Lpx[i] < 2.6
    phi = ph[i]
    nf = np.where(SIZES[Li] <= 68, 4, 2)
    f_ = np.floor(phi / (2 * math.pi) * nf).astype(int) % nf
    nh = np.where(SIZES[Li] < 40, 16, 8)
    hb = np.where(ei == TOP, 0, np.round(hang / (2 * math.pi) * nh).astype(int) % nh)
    ang = np.where(ei == TOP, hang, roll + (hang - hb / nh * 2 * math.pi + math.pi) % (2 * math.pi) - math.pi)
    code = ((Li * 8 + ei) * 32 + hb) * 4 + f_
    uniq, inv = np.unique(code, return_inverse=True)
    fid_u = np.array([ATLAS.get((int(c // 4 // 32 // 8), int(c // 4 // 32 % 8), int(c // 4 % 32), int(c % 4)))
                      for c in uniq], np.int32)
    fid = fid_u[inv]
    if hero is not None and np.any(ids == hero):
        q = int(np.where(ids == hero)[0][0])
        fid[q] = ATLAS.hero(Lpx[i][q], hang[q] % (2 * math.pi), float(elev[q]),
                            int(np.floor(phi[q] / (2 * math.pi) * 4)) % 4)
        ang[q] = roll[q]
        scl[q] = 1.0
        tiny[q] = False
    off, ws, hs_ = ATLAS.arrays()
    nvec = -cam.R[2] * 0.55 + np.array([0, 0.85, 0])
    nvec /= np.linalg.norm(nvec)
    big = ~tiny
    if big.any():
        _blit(sx[big], sy[big], dist[big].astype(np.float64), ang[big].astype(np.float64),
              scl[big].astype(np.float64), fid[big], (oid0 + ids[big]).astype(np.int32), off, ws, hs_, ATLAS.C,
              ATLAS.Fl, g.depth, g.nrm, g.mat, g.oid, g.var, g.att, g.aux, g.alb, g.ao, float(nvec[0]), float(nvec[1]),
              float(nvec[2]), dim)
    if tiny.any():                                          # a pixel or two of shell
        t_ = np.where(tiny)[0]
        xi = np.floor(sx[t_]).astype(int)
        yi = np.floor(sy[t_]).astype(int)
        inb = (xi >= 0) & (xi < cam.W) & (yi >= 0) & (yi < cam.H)
        t_, xi, yi = t_[inb], xi[inb], yi[inb]
        vis = dist[t_] < g.depth[yi, xi]
        t_, xi, yi = t_[vis], xi[vis], yi[vis]
        g.depth[yi, xi] = dist[t_]
        g.mat[yi, xi] = 14
        g.oid[yi, xi] = oid0 + ids[t_]
        g.alb[yi, xi] = np.where(((xi + yi) % 3 == 0)[:, None], bgr('copper1') / 255.0, bgr('bark0') / 255.0) * dim
        g.nrm[yi, xi] = nvec
        g.att[yi, xi] = 0
        g.aux[yi, xi] = 0
