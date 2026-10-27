"""The valley before it ended: low-poly mountains, a forest running down to the
shore, the sea, a painted sky. Everything here can rot - trees blacken, sag and
shed their leaves; the water goes black and violet out from every footstep."""
import math
import numpy as np
import cv2
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'teahouse-assets', 'generator'))
from raster3d import Mesh, tube, blob                                # noqa: E402
from style import fbm                                                # noqa: E402

# colours are BGR
GRASS = np.array([88, 168, 112], np.float32)
FOREST = np.array([60, 118, 66], np.float32)
ROCK = np.array([128, 120, 118], np.float32)
SNOW = np.array([248, 244, 240], np.float32)
SAND = np.array([160, 205, 226], np.float32)
SEA_NEAR = np.array([170, 150, 70], np.float32)
SEA_FAR = np.array([140, 90, 36], np.float32)
LEAF = [np.array(c, np.float32) for c in ((70, 150, 84), (58, 132, 74), (84, 168, 100), (48, 112, 66))]
DEAD = np.array([30, 26, 30], np.float32)
BARK = np.array([40, 60, 80], np.float32)
FORM = (0.0, 1500.0)                                                 # where it rises from the mountain


def _waves(x, z, coeffs):
    out = np.zeros(np.broadcast(x, z).shape)
    for (kx, kz, ph, a) in coeffs:
        out += a * np.sin(x * kx + z * kz + ph)
    return out


_N = [(0.0031, 0.0017, 0.4, 1.0), (-0.0021, 0.0042, 1.7, 0.7), (0.0067, -0.0049, 2.9, 0.4), (0.013, 0.011, 0.3, 0.2),
      (-0.019, 0.023, 5.1, 0.12), (0.041, -0.033, 2.2, 0.05)]


def shore(x):
    return 250 + 40 * np.sin(x / 310.0) + 25 * np.sin(x / 97.0 + 1)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def height(x, z):
    x, z = np.asarray(x, float), np.asarray(z, float)
    d = z - shore(x)
    land = smooth(-80, 140, d)
    n = _waves(x, z, _N)
    hills = 30 + 55 * smooth(0, 900, d) + 22 * n
    mountain = 560 * smooth(1350, 2500, z) * (0.62 + 0.38 * np.abs(np.sin(x / 260.0 + n)))
    shoulder = 250 * np.exp(-((x - FORM[0]) / 300.0) ** 2 - ((z - FORM[1] - 60) / 240.0) ** 2)
    return -22 + 22 * land + land * (hills + mountain + shoulder) - (1 - land) * 10 * smooth(-400, -80, d)


def grid(x0, x1, z0, z1, nx, nz):
    xs, zs = np.linspace(x0, x1, nx), np.linspace(z0, z1, nz)
    X, Z = np.meshgrid(xs, zs)
    idx = np.arange(nx * nz).reshape(nz, nx)
    a, b, c, d = idx[:-1, :-1], idx[:-1, 1:], idx[1:, :-1], idx[1:, 1:]
    flip = ((np.arange(nz - 1)[:, None] + np.arange(nx - 1)[None, :]) % 2).astype(bool)   # alternate the diagonals
    f1 = np.where(flip[..., None], np.stack([a, c, b], -1), np.stack([a, c, d], -1))
    f2 = np.where(flip[..., None], np.stack([b, c, d], -1), np.stack([a, d, b], -1))
    faces = np.concatenate([f1.reshape(-1, 3), f2.reshape(-1, 3)])
    return X, Z, faces


class World:
    def __init__(self, seed=5):
        rng = np.random.RandomState(seed)
        # the land
        X, Z, f = grid(-1700, 1700, -150, 3000, 170, 160)
        Y = height(X, Z) + rng.uniform(-2.5, 2.5, X.shape) * (Z > 300)
        self.tv = np.stack([X, Y, Z], -1).reshape(-1, 3).astype(np.float32)
        self.tf = f.astype(np.int32)
        p = self.tv[self.tf]
        n = np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0])
        n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
        ny = np.abs(n[:, 1])
        y = p[:, :, 1].mean(1)
        cz = p[:, :, 2].mean(1)
        cx = p[:, :, 0].mean(1)
        noise = (np.sin(cx * 0.013) * np.sin(cz * 0.017) + 1) / 2
        col = GRASS * (0.85 + 0.25 * noise[:, None])
        forest = ((cz > 330) & (cz < 1450))[:, None]
        col = np.where(forest, FOREST * (0.9 + 0.2 * noise[:, None]), col)
        col = np.where((ny < 0.78)[:, None], ROCK * (0.9 + 0.2 * noise[:, None]), col)
        col = np.where(((y > 400) & (ny > 0.55))[:, None], SNOW, col)
        col = np.where((y < 4)[:, None], SAND, col)
        self.tcol0 = col.astype(np.float32)
        self.tcen = p.mean(1)
        # the sea
        X, Z, f = grid(-2200, 2200, -2600, 520, 140, 110)
        self.sx, self.sz = X.ravel(), Z.ravel()
        self.sf = f.astype(np.int32)
        dist = np.clip(-(self.sz - 250) / 2200.0, 0, 1)
        self.scol_v = SEA_NEAR * (1 - dist[:, None]) + SEA_FAR * dist[:, None]
        # the trees
        self.trees = []
        cand = rng.uniform([-1300, 280], [1300, 1700], (16000, 2))
        dens = fbm(64, 64, seed + 3, 3)
        for (x, z) in cand:
            h = float(height(x, z))
            if not 5 < h < 360:
                continue
            fx, fz = int((x + 1300) / 2600 * 63), int((z - 280) / 1420 * 63)
            band = (1.0 if 330 < z < 1400 else 0.3) * (1.0 if abs(x) < 700 else 0.45)
            if rng.rand() > band * (0.35 + dens[fz, fx]):
                continue
            g = (float(height(x + 6, z)) - float(height(x - 6, z))) / 12, (float(height(x, z + 6)) - float(height(x, z - 6))) / 12
            if math.hypot(*g) > 0.9:
                continue
            self.trees.append(self._tree(rng, x, h - 1, z))
            if len(self.trees) >= 1700:
                break
        # all the trees as one mesh, so they sway and rot together
        V, F, C, TI, K, CEN = [], [], [], [], [], []
        n = 0
        for i, tr in enumerate(self.trees):
            tv, tf = tr['trunk']
            for (v, f, c, trunk) in [(tv, tf, BARK, True)] + [(v, f, c, False) for (v, f, c) in tr['parts']]:
                V.append(v)
                F.append(f + n)
                n += len(v)
                C.append(np.broadcast_to(np.asarray(c, np.float32), (len(f), 3)))
                TI.append(np.full(len(v), i))
                K.append((v[:, 1] - tr['y']) / tr['s'])
                CEN.append(v if trunk else np.broadcast_to(v.mean(0), v.shape))   # a trunk doesn't shrink
        self.trv, self.trf, self.trc = np.concatenate(V), np.concatenate(F).astype(np.int32), np.concatenate(C)
        self.tri, self.trk, self.trcen = np.concatenate(TI), np.concatenate(K), np.concatenate(CEN)
        self.trft = self.tri[self.trf[:, 0]]
        self.tx = np.array([tr['x'] for tr in self.trees])
        self.ty = np.array([tr['y'] for tr in self.trees])
        self.tz = np.array([tr['z'] for tr in self.trees])
        self.ts = np.array([tr['s'] for tr in self.trees])
        self.land = Mesh().add(self.tv, self.tf, self.tcol0, 4)
        self._pass = None

    def _tree(self, rng, x, y, z):
        s = rng.uniform(12, 26)
        conifer = rng.rand() < 0.35
        tv, tf = tube([(x, y, z), (x, y + s * 0.45, z)], [s * 0.05, s * 0.035], sides=5)
        parts = []
        if conifer:
            for k in range(3):
                cy = y + s * (0.35 + k * 0.22)
                r = s * (0.33 - k * 0.08)
                v, f = blob((x, cy, z), (r, s * 0.2, r), sub=0, rng=rng, jitter=0.1)
                v[:, 1] += np.where(v[:, 1] > cy, (v[:, 1] - cy) * 1.6, 0)
                parts.append((v, f, LEAF[1 + k % 2] * rng.uniform(0.85, 1.05)))
        else:
            for k in range(rng.randint(2, 4)):
                c = (x + rng.uniform(-0.25, 0.25) * s, y + s * rng.uniform(0.55, 0.8), z + rng.uniform(-0.25, 0.25) * s)
                r = s * rng.uniform(0.28, 0.4)
                v, f = blob(c, (r, r * 0.85, r), sub=1, rng=rng, jitter=0.12)
                parts.append((v, f, LEAF[rng.randint(4)] * rng.uniform(0.9, 1.1)))
        return dict(x=x, y=y, z=z, s=s, trunk=(tv, tf), parts=parts)

    # ---------------------------------------------------------------- per frame
    def sea_mesh(self, t):
        y = 0.9 * np.sin(self.sx * 0.021 + t * 1.3) + 0.6 * np.sin(self.sz * 0.017 - t * 1.1 + self.sx * 0.006) + \
            0.25 * np.sin(self.sx * 0.09 + self.sz * 0.07 + t * 2.4)
        v = np.stack([self.sx, y, self.sz], -1).astype(np.float32)
        col = self.scol_v[self.sf].mean(1)
        return v, self.sf, col, np.full(len(self.sf), 5, np.int32)

    def tree_mesh(self, t, rot):
        """The forest at time t, each tree rotted by rot[i] (0..1): it sags,
        shrinks and goes black, and stops swaying."""
        r = rot[self.tri]
        v = self.trv.astype(np.float64)
        sway = np.sin(t * 1.3 + self.tx * 0.01) * 0.6
        v[:, 0] += sway[self.tri] * (1 - r) * self.trk
        v = self.trcen + (v - self.trcen) * (1 - 0.3 * r)[:, None]
        v[:, 1] -= r * self.ts[self.tri] * 0.18 * self.trk
        rf = rot[self.trft][:, None]
        return v.astype(np.float32), self.trf, self.trc * (1 - rf) + DEAD * rf, (1000 + self.trft).astype(np.int32)

    def tree_rot(self, ts, P, T, reach=150.0, speed=120.0, dur=2.2):
        """How rotten each tree is at time T, given the giant's path (times ts,
        positions P): the rot starts when it passes, spreading out from its path.
        Also returns when each tree starts to rot."""
        if self._pass is None:
            D = np.hypot(P[None, :, 0] - self.tx[:, None], P[None, :, 2] - self.tz[:, None])
            j = D.argmin(1)
            self._pass = (ts[j] + D[np.arange(len(j)), j] / speed, D[np.arange(len(j)), j])
        t0, d = self._pass
        return np.where(d < reach, np.clip((T - t0) / dur, 0, 1), 0.0), np.where(d < reach, t0, 1e9)


def sky(W, H, cam, t, seed=2):
    """A painted day sky: deep blue overhead, pale and warm at the horizon, big
    soft clouds, shifting with the camera."""
    yy = np.linspace(0, 1, H)[:, None, None]
    # where the horizon is on screen
    hz = H / 2 - (-cam.R[2, 1]) / max(1e-3, math.sqrt(1 - cam.R[2, 1] ** 2)) * cam.focal
    v = np.clip((np.arange(H)[:, None, None] - (hz - H * 0.9)) / (H * 0.9), 0, 1)
    top = np.array([196, 128, 64], np.float32)
    mid = np.array([228, 190, 130], np.float32)
    low = np.array([224, 228, 238], np.float32)
    col = np.where(v < 0.6, top + (mid - top) * (v / 0.6), mid + (low - mid) * ((v - 0.6) / 0.4))
    img = np.broadcast_to(col, (H, W, 3)).astype(np.float32).copy()
    del yy
    yaw = math.atan2(cam.R[2, 0], cam.R[2, 2])
    shift = int(yaw / (2 * math.pi) * 4 * W + t * 6)
    big = _clouds(W, H, seed)
    cl = np.roll(big, -shift % big.shape[1], 1)[:, :W]
    off = int(hz - H * 0.62)
    a = np.zeros((H, W), np.float32)
    shade = np.zeros((H, W), np.float32)
    y0, y1 = max(0, off), min(H, off + cl.shape[0])
    if y1 > y0:
        a[y0:y1] = cl[y0 - off:y1 - off, :, 0]
        shade[y0:y1] = cl[y0 - off:y1 - off, :, 1]
    lo, hi = np.array([206, 176, 156], np.float32), np.array([250, 249, 248], np.float32)
    cloud = lo + (hi - lo) * shade[..., None]
    return img * (1 - a[..., None]) + cloud * a[..., None], hz


_CLOUDS = {}


def _clouds(W, H, seed):
    """Ghibli cumulus on a wide strip: heaps of round puffs, crisp-edged, lit
    white on top and shaded blue-grey underneath with flat bottoms.
    Returns alpha and light."""
    key = (W, H, seed)
    if key not in _CLOUDS:
        rng = np.random.RandomState(seed)
        Wb, Hb = W * 4, int(H * 0.7)
        a = np.zeros((Hb, Wb), np.float32)
        lit = np.zeros((Hb, Wb), np.float32)
        for k in range(16):
            cx = rng.uniform(0, Wb)
            size = rng.uniform(0.35, 1.0) * H * 0.22
            base = Hb * rng.uniform(0.62, 0.92)
            m = np.zeros((Hb, Wb), np.float32)
            for j in range(int(18 + size / 6)):
                u = rng.uniform(-1, 1)
                r = size * rng.uniform(0.25, 0.55) * (1 - 0.55 * abs(u))
                x = cx + u * size * 1.6
                y = base - r * rng.uniform(0.2, 1.0) - size * (1 - abs(u)) * rng.uniform(0.2, 0.8)
                for dx in (-Wb, 0, Wb):                              # it wraps round
                    cv2.circle(m, (int(x + dx), int(y)), int(r), 1.0, -1, cv2.LINE_AA)
            m[int(base):] = 0                                        # flat bottoms
            yy = np.arange(Hb, dtype=np.float32)[:, None]
            top = np.clip((base - yy) / (size * 1.6), 0, 1)
            sh = cv2.GaussianBlur(m, (0, 0), size * 0.12)
            l = np.clip(0.25 + 0.9 * top + 0.6 * (m - np.roll(sh, int(size * 0.1), 0)), 0, 1)
            a = np.maximum(a, m)
            lit = np.where(m > 0.5, l, lit)
        a = cv2.GaussianBlur(a, (0, 0), 1.2)
        lit = cv2.GaussianBlur(lit, (0, 0), 2.5)
        _CLOUDS[key] = np.stack([a, lit], -1).astype(np.float32)
    return _CLOUDS[key]
